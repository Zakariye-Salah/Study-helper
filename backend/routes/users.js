// backend/routes/users.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Payment = require('../models/Payment');

// optional models — load if available (defensive)
let ClassModel = null;
let SubjectModel = null;
let ParentModel = null;
let VoteModel = null;
try { ClassModel = require('../models/Class'); } catch (e) { ClassModel = null; }
try { SubjectModel = require('../models/Subject'); } catch (e) { SubjectModel = null; }
try { ParentModel = require('../models/Parent'); } catch (e) { ParentModel = null; }
try { VoteModel = require('../models/Vote'); } catch (e) { VoteModel = null; }

// Helper: sanitize user for output (no passwordHash)
function sanitizeUser(u) {
  if (!u) return {};
  const out = Object.assign({}, u);
  if (out.passwordHash) delete out.passwordHash;
  return out;
}

/**
 * GET /api/users/me
 * Return the current authenticated user (any role)
//  */
// router.get('/me', auth, async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) return res.status(401).json({ ok: false, message: 'Auth required' });

//     // Try to read full User doc (admins/managers)
//     const udoc = await User.findById(req.user._id).select('-passwordHash').lean().catch(()=>null);
//     if (udoc) {
//       return res.json({
//         ok: true,
//         user: {
//           _id: String(udoc._id),
//           fullname: udoc.fullname,
//           email: udoc.email || null,
//           role: udoc.role,
//           phone: udoc.phone || null,
//           schoolId: udoc.schoolId ? String(udoc.schoolId) : null,
//           permissions: udoc.permissions || {},
//           suspended: !!udoc.suspended,
//           createdAt: udoc.createdAt
//         }
//       });
//     }

//     // Fallback to token-derived user (auth middleware handles Student/Teacher/Parent too)
//     const u = req.user || {};
//     return res.json({
//       ok: true,
//       user: {
//         _id: String(u._id || u.id),
//         fullname: u.fullname || '',
//         email: u.email || null,
//         role: u.role || 'user',
//         schoolId: u.schoolId || null
//       }
//     });
//   } catch (err) {
//     console.error('GET /users/me error', err);
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// backend/routes/users.js  (replace the existing GET /me handler)
router.get('/me', auth, async (req, res) => {
  try {
    if (!req.user || !req.user._id) return res.status(401).json({ ok: false, message: 'Auth required' });

    // Try to read full User doc (admins/managers)
    const udoc = await User.findById(req.user._id).select('-passwordHash').lean().catch(()=>null);
    if (udoc) {
      return res.json({
        ok: true,
        user: {
          _id: String(udoc._id),
          fullname: udoc.fullname,
          email: udoc.email || null,
          role: udoc.role,
          phone: udoc.phone || null,
          schoolId: udoc.schoolId ? String(udoc.schoolId) : null,
          permissions: udoc.permissions || {},
          suspended: !!udoc.suspended,
          disabled: !!udoc.disabled,
          warned: !!udoc.warned,                            // <-- NEW
          warnReason: udoc.warning || udoc._warnReason || null, // <-- NEW optional reason
          createdAt: udoc.createdAt
        }
      });
    }

    // Fallback to token-derived user (auth middleware handles Student/Teacher/Parent too)
    const u = req.user || {};
    return res.json({
      ok: true,
      user: {
        _id: String(u._id || u.id),
        fullname: u.fullname || '',
        email: u.email || null,
        role: u.role || 'user',
        schoolId: u.schoolId || null,
        warned: !!u.warned,                                // <-- NEW fallback
        warnReason: u._warnReason || u.warnReason || null
      }
    });
  } catch (err) {
    console.error('GET /users/me error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/users  (admin only)
 * Creates a user and returns the created user and (optionally) an initialPassword one-time.
 */
router.post('/', auth, roles(['admin']), async (req, res) => {
  try {
    const { fullname, email, phone, role, password, schoolId } = req.body || {};
    if (!fullname) return res.status(400).json({ ok: false, message: 'fullname required' });
    if (!role) return res.status(400).json({ ok: false, message: 'role required' });

    const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;

    // check unique email if provided
    if (normalizedEmail) {
      const exists = await User.findOne({ email: normalizedEmail }).lean();
      if (exists) return res.status(400).json({ ok: false, message: 'Email already in use' });
    }

    // Create user via model helper; admin-created accounts should require reset on first login
    const opts = { returnPlain: false, forceReset: true };
    // if admin did NOT provide a password, createUser will generate one and we ask it to return it
    if (!password) opts.returnPlain = true;

    const createdBy = req.user && req.user._id ? req.user._id : null;

    const result = await User.createUser({
      fullname,
      email: normalizedEmail,
      phone: phone || '',
      role,
      password, // may be undefined; createUser will generate if needed
      schoolId: schoolId || (req.user && req.user.schoolId ? req.user.schoolId : null),
      createdBy,
      options: opts
    });

    const user = result.user;
    const initialPassword = result.plainPassword;

    const out = user.toObject ? user.toObject() : sanitizeUser(user);
    if (out.passwordHash) delete out.passwordHash;

    const resp = { ok: true, user: out, message: 'User created' };
    if (initialPassword) resp.initialPassword = initialPassword; // one-time return only

    return res.json(resp);
  } catch (err) {
    console.error('POST /users error', err);
    if (err && err.code === 11000) return res.status(400).json({ ok: false, message: 'Duplicate key', detail: err.keyValue });
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/* ---------------- other admin routes (list, get, suspend, warn, delete, data)  ----------------- */

router.get('/', auth, roles(['admin']), async (req, res) => {
  try {
    const { role, search = '', page = '1', limit = '50' } = req.query;
    const q = {};
    if (role) q.role = String(role).toLowerCase();

    if (search && String(search).trim()) {
      const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ fullname: rx }, { email: rx }];
    }

    const pg = Math.max(1, parseInt(page || '1', 10));
    const lim = Math.min(500, Math.max(1, parseInt(limit || '50', 10)));

    const items = await User.find(q)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean();

    const total = await User.countDocuments(q);

    return res.json({ ok: true, items, total, page: pg, limit: lim });
  } catch (err) {
    console.error('GET /users error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

router.get('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const u = await User.findById(id).select('-passwordHash').lean();
    if (!u) return res.status(404).json({ ok: false, message: 'User not found' });

    // compute counts for multiple resource types (best-effort)
    const [
      studentsCount,
      teachersCount,
      paymentsCount,
      classesCount,
      subjectsCount,
      parentsCount,
      votesCount
    ] = await Promise.all([
      Student.countDocuments({ createdBy: u._id }).catch(() => 0),
      Teacher.countDocuments({ createdBy: u._id }).catch(() => 0),
      Payment.countDocuments({ createdBy: u._id }).catch(() => 0),
      ClassModel ? ClassModel.countDocuments({ createdBy: u._id }).catch(() => 0) : Promise.resolve(0),
      SubjectModel ? SubjectModel.countDocuments({ createdBy: u._id }).catch(() => 0) : Promise.resolve(0),
      ParentModel ? ParentModel.countDocuments({ createdBy: u._id }).catch(() => 0) : Promise.resolve(0),
      VoteModel ? VoteModel.countDocuments({ createdBy: u._id }).catch(() => 0) : Promise.resolve(0)
    ]);

    return res.json({
      ok: true,
      user: u,
      counts: {
        students: studentsCount,
        teachers: teachersCount,
        payments: paymentsCount,
        classes: classesCount,
        subjects: subjectsCount,
        parents: parentsCount,
        votes: votesCount
      }
    });
  } catch (err) {
    console.error('GET /users/:id error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// suspend, warn, delete routes
router.post('/:id/suspend', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const u = await User.findById(id);
    if (!u) return res.status(404).json({ ok: false, message: 'User not found' });

    const setVal = (req.body && typeof req.body.suspend !== 'undefined') ? !!req.body.suspend : null;
    if (setVal === null) u.suspended = !u.suspended;
    else u.suspended = !!setVal;

    await u.save();

    return res.json({ ok: true, suspended: !!u.suspended });
  } catch (err) {
    console.error('POST /users/:id/suspend error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

router.post('/:id/warn', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const u = await User.findById(id);
    if (!u) return res.status(404).json({ ok: false, message: 'User not found' });

    const setVal = (req.body && typeof req.body.warn !== 'undefined') ? !!req.body.warn : true;
    u.warned = !!setVal;
    await u.save();

    return res.json({ ok: true, warned: u.warned, message: u.warned ? 'User warned' : 'Warning removed' });
  } catch (err) {
    console.error('POST /users/:id/warn error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

router.delete('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ ok: false, message: 'Invalid id' });

    await User.findByIdAndDelete(id);

    // cascade deletes for created resources (best-effort)
    await Student.deleteMany({ createdBy: id }).catch(() => {});
    await Teacher.deleteMany({ createdBy: id }).catch(() => {});
    await Payment.deleteMany({ createdBy: id }).catch(() => {});
    if (ClassModel) await ClassModel.deleteMany({ createdBy: id }).catch(() => {});
    if (SubjectModel) await SubjectModel.deleteMany({ createdBy: id }).catch(() => {});
    if (ParentModel) await ParentModel.deleteMany({ createdBy: id }).catch(() => {});
    if (VoteModel) await VoteModel.deleteMany({ createdBy: id }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /users/:id error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/users/:id/data
 * Return arrays of the objects this user created (admin or same user only)
 */
router.get('/:id/data', auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const requesterId = String(req.user && req.user._id);
    const isAdmin = (req.user && (req.user.role || '').toLowerCase()) === 'admin';
    if (!(isAdmin || String(requesterId) === String(id))) return res.status(403).json({ ok: false, message: 'Forbidden' });

    // Find created resources (limit to reasonable size)
    const [students, teachers, payments, classes, subjects, parents, votes] = await Promise.all([
      Student.find({ createdBy: id }).limit(200).lean().catch(() => []),
      Teacher.find({ createdBy: id }).limit(200).lean().catch(() => []),
      Payment.find({ createdBy: id }).limit(200).lean().catch(() => []),
      ClassModel ? ClassModel.find({ createdBy: id }).limit(200).lean().catch(() => []) : Promise.resolve([]),
      SubjectModel ? SubjectModel.find({ createdBy: id }).limit(200).lean().catch(() => []) : Promise.resolve([]),
      ParentModel ? ParentModel.find({ createdBy: id }).limit(200).lean().catch(() => []) : Promise.resolve([]),
      VoteModel ? VoteModel.find({ createdBy: id }).limit(200).lean().catch(() => []) : Promise.resolve([])
    ]);

    return res.json({
      ok: true,
      students: students || [],
      teachers: teachers || [],
      payments: payments || [],
      classes: classes || [],
      subjects: subjects || [],
      parents: parents || [],
      votes: votes || []
    });
  } catch (err) {
    console.error('GET /users/:id/data error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
