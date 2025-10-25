// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const User = require('../models/User');
const Student = require('../models/Student'); // may throw if file missing
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');
const auth = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

/**
 * Helper to build token and compact user payload
 */
function makeTokenForUser(userDoc, extras = {}) {
  const payload = {
    id: String(userDoc._id),
    role: userDoc.role,
    fullname: userDoc.fullname,
    email: userDoc.email || undefined,
    schoolId: userDoc.schoolId ? String(userDoc.schoolId) : undefined,
    ...extras
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return { token, user: payload };
}

/**
 * Helper to compare password using available methods on a model instance
 * Returns true/false
 */
async function verifyPassword(entity, password) {
  if (!entity) return false;
  // prefer instance method if implemented
  if (typeof entity.validatePassword === 'function') {
    try { return await entity.validatePassword(password); } catch(e){ /* continue */ }
  }
  // fallback to bcrypt compare if passwordHash field exists
  if (entity.passwordHash) {
    try { return await bcrypt.compare(String(password || ''), String(entity.passwordHash || '')); } catch(e){ /* continue */ }
  }
  // fallback to direct plain-text compare (not recommended, but defensive)
  if (typeof entity.password === 'string') {
    return String(entity.password) === String(password);
  }
  if (typeof entity.pin === 'string') {
    return String(entity.pin) === String(password);
  }
  return false;
}

/**
 * POST /auth/register
 * Public registration creates a 'manager' by default.
 */
router.post('/register', async (req, res) => {
  try {
    const { fullname, email, password, role, phone, schoolId } = req.body || {};
    console.debug('/auth/register payload:', { fullname, email, role });

    if (!fullname || !email || !password) {
      return res.status(400).json({ ok: false, message: 'fullname, email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ ok: false, message: 'Invalid email' });
    }

    // detect admin token in Authorization header (optional)
    let adminCreates = false;
    let adminId = null;
    const authHeader = req.headers.authorization || '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload && payload.role === 'admin') {
          adminCreates = true;
          adminId = payload.id || payload._id || null;
        }
      } catch (e) {
        adminCreates = false;
      }
    }

    const allowedRoles = ['admin','manager','teacher','student','testuser'];
    let targetRole = 'manager';
    if (adminCreates && role && allowedRoles.includes(String(role).toLowerCase())) {
      targetRole = String(role).toLowerCase();
    } else {
      targetRole = 'manager';
    }

    // uniqueness check
    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) return res.status(400).json({ ok: false, message: 'Email already registered' });

    let createdBy = null;
    if (adminCreates && adminId && mongoose.Types.ObjectId.isValid(String(adminId))) {
      createdBy = mongoose.Types.ObjectId(String(adminId));
    }

    const user = await User.createUser({
      fullname: String(fullname).trim(),
      email: normalizedEmail,
      phone: phone || '',
      role: targetRole,
      password,
      schoolId: schoolId || null,
      createdBy
    });

    const authRes = makeTokenForUser(user);
    console.info('User created:', { id: user._id.toString(), role: user.role, email: user.email });
    return res.json({ ok: true, token: authRes.token, user: authRes.user, message: 'User created' });
  } catch (err) {
    console.error('POST /auth/register error', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /auth/login
 * Accepts { email, password } or { numberId, password }.
 * This version blocks disabled/suspended/deleted accounts.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, numberId } = req.body || {};
    console.debug('/auth/login payload:', { email: Boolean(email), numberId: Boolean(numberId) });

    if ((!email && !numberId) || !password) {
      return res.status(400).json({ ok: false, message: 'email/numberId and password required' });
    }

    // 1) email -> authenticate against User collection
    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const user = await User.findOne({ email: normalizedEmail }).exec();
      if (!user) {
        console.warn('Login failed - user not found for email:', normalizedEmail);
        return res.status(400).json({ ok: false, message: 'Invalid credentials' });
      }

      // check disabled/suspended
      if (user.disabled) {
        console.warn('Login blocked - disabled user:', normalizedEmail);
        return res.status(403).json({ ok: false, message: 'Your account has been disabled' });
      }
      if (user.suspended) {
        console.warn('Login blocked - suspended user:', normalizedEmail);
        return res.status(403).json({ ok: false, message: 'Your account has been suspended' });
      }

      const valid = await verifyPassword(user, password);
      if (!valid) {
        console.warn('Login failed - invalid password for email:', normalizedEmail);
        return res.status(400).json({ ok: false, message: 'Invalid credentials' });
      }

      const authRes = makeTokenForUser(user);
      console.info('Login success (User):', { id: String(user._id), role: user.role, email: user.email });
      return res.json({ ok: true, token: authRes.token, user: authRes.user });
    }

    // 2) numberId -> try domain models in order: Student, Teacher, Parent, User (fallback)
    const nid = String(numberId || '').trim();
    if (!nid) return res.status(400).json({ ok: false, message: 'Invalid credentials' });

    // try Student
    try {
      if (Student && typeof Student.findOne === 'function') {
        const s = await Student.findOne({ numberId: nid }).exec().catch(()=>null);
        if (s) {
          if (s.deleted || s.suspended) {
            return res.status(403).json({ ok: false, message: 'Your account has been suspended or disabled' });
          }
          const valid = await verifyPassword(s, password);
          if (!valid) return res.status(400).json({ ok: false, message: 'Invalid credentials' });
          const payload = { id: String(s._id), role: 'student', fullname: s.fullname || '', email: s.email || null, schoolId: s.schoolId ? String(s.schoolId) : null, childNumberId: s.numberId || null };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
          console.info('Login success (Student):', { id: payload.id, numberId: nid });
          return res.json({ ok: true, token, user: payload });
        } else {
          console.debug('Student not found with numberId:', nid);
        }
      }
    } catch (e) {
      console.warn('Student login attempt error', e && e.message);
    }

    // try Teacher
    try {
      if (Teacher && typeof Teacher.findOne === 'function') {
        const t = await Teacher.findOne({ numberId: nid }).exec().catch(()=>null);
        if (t) {
          if (t.deleted || t.suspended) {
            return res.status(403).json({ ok: false, message: 'Your account has been suspended or disabled' });
          }
          const valid = await verifyPassword(t, password);
          if (!valid) return res.status(400).json({ ok: false, message: 'Invalid credentials' });
          const payload = { id: String(t._id), role: 'teacher', fullname: t.fullname || '', email: t.email || null, schoolId: t.schoolId ? String(t.schoolId) : null };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
          console.info('Login success (Teacher):', { id: payload.id, numberId: nid });
          return res.json({ ok: true, token, user: payload });
        } else {
          console.debug('Teacher not found with numberId:', nid);
        }
      }
    } catch (e) {
      console.warn('Teacher login attempt error', e && e.message);
    }

    // try Parent
    try {
      if (Parent && typeof Parent.findOne === 'function') {
        let p = await Parent.findOne({ childNumberId: nid }).exec().catch(()=>null);
        if (!p) p = await Parent.findOne({ numberId: nid }).exec().catch(()=>null);
        if (!p) p = await Parent.findOne({ email: nid }).exec().catch(()=>null);
        if (p) {
          if (p.deleted || p.suspended) {
            return res.status(403).json({ ok: false, message: 'Your account has been suspended or disabled' });
          }
          const valid = await verifyPassword(p, password);
          if (!valid) return res.status(400).json({ ok: false, message: 'Invalid credentials' });
          const extras = { childId: p.childStudent ? String(p.childStudent) : undefined, childNumberId: p.childNumberId || undefined };
          const payload = { id: String(p._id), role: 'parent', fullname: p.fullname || '', email: p.email || null, schoolId: p.schoolId ? String(p.schoolId) : null, ...extras };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
          console.info('Login success (Parent):', { id: payload.id, childNumberId: extras.childNumberId });
          return res.json({ ok: true, token, user: payload });
        } else {
          console.debug('Parent not found matching numberId/email/childNumber:', nid);
        }
      }
    } catch (e) {
      console.warn('Parent login attempt error', e && e.message);
    }

    // fallback: try User with numberId field
    try {
      const u = await User.findOne({ numberId: nid }).exec().catch(()=>null);
      if (u) {
        if (u.disabled || u.suspended) {
          return res.status(403).json({ ok: false, message: 'Your account has been suspended or disabled' });
        }
        const valid = await verifyPassword(u, password);
        if (!valid) return res.status(400).json({ ok: false, message: 'Invalid credentials' });
        const authRes = makeTokenForUser(u);
        console.info('Login success (User fallback by numberId):', { id: String(u._id) });
        return res.json({ ok: true, token: authRes.token, user: authRes.user });
      }
    } catch (e) {
      console.warn('User fallback by numberId error', e && e.message);
    }

    return res.status(400).json({ ok: false, message: 'Invalid credentials' });
  } catch (err) {
    console.error('POST /auth/login error', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /auth/me
 */
// router.get('/me', auth, async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) return res.status(401).json({ ok: false, message: 'Auth required' });

//     // attempt to fetch full User doc if present
//     try {
//       const u = await User.findById(req.user._id).select('-passwordHash').lean();
//       if (u) {
//         return res.json({
//           ok: true,
//           user: {
//             _id: String(u._id),
//             fullname: u.fullname,
//             email: u.email || null,
//             role: u.role,
//             phone: u.phone || null,
//             schoolId: u.schoolId ? String(u.schoolId) : null,
//             permissions: u.permissions || {},
//             suspended: !!u.suspended,
//             disabled: !!u.disabled,
//             createdAt: u.createdAt
//           }
//         });
//       }
//     } catch (e) {
//       console.warn('/auth/me: User find failed, returning token-derived user', e && e.message);
//     }

//     // fallback to token-derived user
//     const t = req.user;
//     return res.json({
//       ok: true,
//       user: {
//         _id: String(t._id || t.id),
//         fullname: t.fullname || '',
//         email: t.email || null,
//         role: t.role || 'user',
//         schoolId: t.schoolId || null,
//         childId: t.childId || null,
//         childNumberId: t.childNumberId || null
//       }
//     });
//   } catch (err) {
//     console.error('GET /auth/me error', err && (err.stack || err));
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// backend/routes/auth.js  (replace the existing GET /me handler)
router.get('/me', auth, async (req, res) => {
  try {
    if (!req.user || !req.user._id) return res.status(401).json({ ok: false, message: 'Auth required' });

    // attempt to fetch full User doc if present
    try {
      const u = await User.findById(req.user._id).select('-passwordHash').lean();
      if (u) {
        return res.json({
          ok: true,
          user: {
            _id: String(u._id),
            fullname: u.fullname,
            email: u.email || null,
            role: u.role,
            phone: u.phone || null,
            schoolId: u.schoolId ? String(u.schoolId) : null,
            permissions: u.permissions || {},
            suspended: !!u.suspended,
            disabled: !!u.disabled,
            warned: !!u.warned,                          // <-- new: expose warned flag
            warnReason: u.warning || u._warnReason || null, // <-- optional reason text
            status: u.status || null,
            createdAt: u.createdAt
          }
        });
      }
    } catch (e) {
      console.warn('/auth/me: User find failed, returning token-derived user', e && e.message);
    }

    // Fallback to token-derived user (from auth middleware)
    const t = req.user;
    return res.json({
      ok: true,
      user: {
        _id: String(t._id || t.id),
        fullname: t.fullname || '',
        email: t.email || null,
        role: t.role || 'user',
        schoolId: t.schoolId || null,
        childId: t.childId || null,
        childNumberId: t.childNumberId || null,
        warned: !!t.warned,                     // <-- include warned fallback
        warnReason: t._warnReason || t.warnReason || null
      }
    });
  } catch (err) {
    console.error('GET /auth/me error', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /auth/user-change-password/:id
 * Admins or Managers can set a new password for a User (manager limited to createdBy)
 * (Note: mounted under /auth -> final path is /auth/user-change-password/:id)
 */
router.post('/user-change-password/:id', auth, async (req, res) => {
  try {
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ ok:false, message: 'Your account is not allowed to perform this action' });

    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ ok:false, message: 'Invalid id' });

    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ ok:false, message: 'New password required (min 6 chars)' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ ok:false, message: 'User not found' });

    if (!['admin','manager'].includes(String(req.user.role))) return res.status(403).json({ ok:false, message: 'Forbidden' });

    // manager may only update users they created
    if (req.user.role === 'manager' && String(user.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ ok:false, message: 'Forbidden' });
    }

    await user.setPassword(newPassword);
    if (typeof user.mustChangePassword !== 'undefined') user.mustChangePassword = false;
    await user.save();

    return res.json({ ok:true, message: 'User password updated' });
  } catch (err) {
    console.error('POST /auth/user-change-password error', err && (err.stack || err));
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

module.exports = router;

