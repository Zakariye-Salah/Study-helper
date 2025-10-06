// backend/routes/parents.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const Parent = require('../models/Parent');
const Student = require('../models/Student');

const crypto = require('crypto'); 
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function isObjectIdString(s) {
  return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s);
}
function isSameId(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

/**
 * POST /api/parents
 * Create a parent and link to an existing student (student identified by numberId).
 * Only admin/manager can create parents.
 * Body: { fullname, phone, studentNumberId, password }
 */
router.post('/', auth, roles(['admin','manager']), async (req, res) => {
  try {
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ ok:false, message: 'Your account is not allowed to perform this action' });

    const { fullname, phone, studentNumberId, password } = req.body || {};
    if (!fullname || !studentNumberId || !password) {
      return res.status(400).json({ ok: false, message: 'fullname, studentNumberId and password are required' });
    }

    const student = await Student.findOne({ numberId: String(studentNumberId).trim(), deleted: { $ne: true } }).lean();
    if (!student) {
      return res.status(400).json({ ok: false, message: `Student ${String(studentNumberId)} does not exist` });
    }

    // avoid exact duplicates (ignore already-deleted parents)
    const exists = await Parent.findOne({
      childStudent: student._id,
      fullname: fullname.trim(),
      phone: phone ? String(phone).trim() : undefined,
      deleted: { $ne: true }
    }).lean();

    if (exists) {
      return res.status(400).json({ ok: false, message: 'Parent already exists for this student' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const p = new Parent({
      fullname: fullname.trim(),
      phone: phone ? String(phone).trim() : undefined,
      passwordHash,
      childStudent: student._id,
      childNumberId: String(student.numberId || ''),
      createdBy: req.user && req.user._id ? req.user._id : undefined
    });

    await p.save();

    return res.json({
      ok: true,
      message: `Added parent "${p.fullname}" for student "${student.fullname}"`,
      parent: { _id: String(p._id), fullname: p.fullname, phone: p.phone, childStudent: String(p.childStudent), childNumberId: p.childNumberId }
    });
  } catch (err) {
    console.error('POST /parents error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/parents/login
 * Parent login using student's numberId + parent's password.
 * Body: { studentNumberId, password }
 * Returns { ok:true, token, user }
 */
router.post('/login', async (req, res) => {
  try {
    const body = req.body || {};
    const studentNumberId = String(body.studentNumberId || body.numberId || body.username || '').trim();
    const password = body.password ? String(body.password) : '';

    if (!studentNumberId || !password) {
      return res.status(400).json({ ok: false, message: 'studentNumberId and password required' });
    }

    const student = await Student.findOne({ numberId: studentNumberId, deleted: { $ne: true } }).lean();
    if (!student) return res.status(400).json({ ok: false, message: 'Student not found' });

    // consider only non-deleted parents
    const parents = await Parent.find({ childStudent: student._id, deleted: { $ne: true } }).lean();
    if (!parents || parents.length === 0) return res.status(400).json({ ok: false, message: 'No parent account linked to this student' });

    let matchedParent = null;
    for (const p of parents) {
      if (!p.passwordHash) continue;
      const ok = await bcrypt.compare(password, p.passwordHash);
      if (ok) { matchedParent = p; break; }
    }
    if (!matchedParent) return res.status(400).json({ ok: false, message: 'Invalid credentials' });

    const payload = {
      id: String(matchedParent._id),
      role: 'parent',
      fullname: matchedParent.fullname,
      childId: String(student._id),
      childNumberId: String(student.numberId || '')
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return res.json({ ok: true, token, user: payload });
  } catch (err) {
    console.error('POST /parents/login error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/parents
 * List parents (admin/manager).
 */
router.get('/', auth, roles(['admin','manager']), async (req, res) => {
  try {
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ ok:false, message: 'Your account is not allowed to perform this action' });

    const q = (req.query && req.query.search) ? String(req.query.search).trim() : '';
    const filter = { deleted: { $ne: true } };

    // If manager, restrict to parents created by this manager
    if (req.user && String((req.user.role || '').toLowerCase()) === 'manager') {
      filter.createdBy = req.user._id;
    }

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { fullname: rx },
        { phone: rx },
        { childNumberId: rx }
      ];
    }

    const parents = await Parent.find(filter).populate('childStudent', 'fullname numberId').limit(2000).lean();
    const out = parents.map(p => ({
      _id: String(p._id),
      fullname: p.fullname,
      phone: p.phone,
      childStudent: p.childStudent ? { _id: String(p.childStudent._id), fullname: p.childStudent.fullname, numberId: p.childStudent.numberId } : null,
      childNumberId: p.childNumberId || null,
      createdAt: p.createdAt,
      createdBy: p.createdBy ? String(p.createdBy) : null
    }));
    return res.json({ ok: true, parents: out });
  } catch (err) {
    console.error('GET /parents error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/parents/me
 */
router.get('/me', auth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Auth required' });
    if (String((req.user.role || '').toLowerCase()) !== 'parent') return res.status(403).json({ ok: false, message: 'Not a parent' });
    const p = await Parent.findOne({ _id: req.user._id, deleted: { $ne: true } }).populate('childStudent', 'fullname numberId schoolId').lean();
    if (!p) return res.status(404).json({ ok: false, message: 'Parent not found' });
    return res.json({ ok: true, parent: p });
  } catch (err) {
    console.error('GET /parents/me error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/parents/:id
 */
router.get('/:id', auth, async (req, res) => {
  try {
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ ok:false, message: 'Your account is not allowed to perform this action' });

    const id = req.params.id;
    if (!id || !isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const p = await Parent.findOne({ _id: id, deleted: { $ne: true } }).populate('childStudent','fullname numberId').lean();
    if (!p) return res.status(404).json({ ok: false, message: 'Not found' });

    // admin sees any parent
    if (req.user && (req.user.role === 'admin')) {
      return res.json({ ok: true, parent: p });
    }

    // manager sees only parents they created
    if (req.user && (String((req.user.role || '').toLowerCase()) === 'manager')) {
      if (p.createdBy && isSameId(p.createdBy, req.user._id)) {
        return res.json({ ok: true, parent: p });
      }
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    // parent can fetch own record
    if (req.user && req.user.role === 'parent' && String(req.user._id) === String(p._id)) {
      return res.json({ ok: true, parent: p });
    }

    return res.status(403).json({ ok: false, message: 'Forbidden' });
  } catch (err) {
    console.error('GET /parents/:id error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * PUT /api/parents/:id - update
 */
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ ok:false, message: 'Your account is not allowed to perform this action' });

    const id = req.params.id;
    if (!id || !isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const p = await Parent.findById(id);
    if (!p || p.deleted) return res.status(404).json({ ok: false, message: 'Not found' });

    // permission: admin OR (manager who created this parent) OR parent themself
    if (req.user) {
      const role = String((req.user.role || '').toLowerCase());
      if (role === 'admin') {
        // allowed
      } else if (role === 'manager') {
        if (!p.createdBy || !isSameId(p.createdBy, req.user._id)) {
          return res.status(403).json({ ok: false, message: 'Forbidden' });
        }
      } else if (role === 'parent' && String(req.user._id) === String(p._id)) {
        // allowed (parent updating themself)
      } else {
        return res.status(403).json({ ok: false, message: 'Forbidden' });
      }
    } else {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    const { fullname, phone, password } = req.body || {};
    if (typeof fullname === 'string') p.fullname = fullname.trim();
    if (typeof phone === 'string') p.phone = phone.trim();
    if (typeof password === 'string' && password.length >= 4) {
      p.passwordHash = await bcrypt.hash(String(password), 10);
    }
    await p.save();
    return res.json({ ok: true, parent: {
      _id: String(p._id),
      fullname: p.fullname,
      phone: p.phone,
      childStudent: p.childStudent ? String(p.childStudent) : null,
      childNumberId: p.childNumberId || null
    }});
  } catch (err) {
    console.error('PUT /parents/:id error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/parents/:id - soft-delete
 */
router.delete('/:id', auth, roles(['admin','manager']), async (req, res) => {
  try {
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ ok:false, message: 'Your account is not allowed to perform this action' });

    const id = req.params.id;
    if (!id || !isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const p = await Parent.findById(id);
    if (!p) return res.status(404).json({ ok: false, message: 'Not found' });
    if (p.deleted) return res.json({ ok: true, alreadyDeleted: true });

    // if manager, ensure they created this parent
    if (req.user && String((req.user.role || '').toLowerCase()) === 'manager') {
      if (!p.createdBy || !isSameId(p.createdBy, req.user._id)) {
        return res.status(403).json({ ok: false, message: 'Forbidden' });
      }
    }

    // soft-delete
    p.deleted = true;
    p.deletedAt = new Date();
    p.deletedBy = { id: req.user._id, role: req.user.role, name: (req.user.fullname || req.user.name || '') };
    await p.save();

    return res.json({ ok: true, deleted: 'soft' });
  } catch (err) {
    console.error('DELETE /parents/:id error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// -----------------------
// Reset password (admin/manager) for parent
// -----------------------
router.post('/:id/reset-password', auth, roles(['admin','manager']), async (req, res) => {
  try {
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const parent = await Parent.findById(id);
    if (!parent) return res.status(404).json({ message: 'Parent not found' });

    if (req.user.role === 'manager' && String(parent.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const len = Math.max(8, Math.min(24, parseInt(req.body.length || 10, 10)));
    let temp = crypto.randomBytes(Math.ceil(len * 0.75)).toString('base64').replace(/[+/=]/g, '').slice(0, len);
    if (!/[0-9]/.test(temp)) temp = temp.slice(0, -1) + Math.floor(Math.random()*10);
    if (!/[a-zA-Z]/.test(temp)) temp = temp.slice(0, -1) + 'A';

    const hash = await bcrypt.hash(temp, 10);
    parent.passwordHash = hash;
    parent.mustChangePassword = true;
    await parent.save();

    return res.json({ ok: true, tempPassword: temp, message: 'Temporary password generated — return it once to the caller.' });
  } catch (err) {
    console.error('POST /parents/:id/reset-password error', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// -----------------------
// Change password (self or admin/manager) for parent
// -----------------------
router.post('/:id/change-password', auth, roles(['admin','manager','parent']), async (req, res) => {
  try {
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ message: 'New password required (min 6 chars)' });

    const parent = await Parent.findById(id);
    if (!parent) return res.status(404).json({ message: 'Parent not found' });

    if (req.user.role === 'parent') {
      if (String(req.user._id) !== String(parent._id)) return res.status(403).json({ message: 'Forbidden' });
      if (!currentPassword) return res.status(400).json({ message: 'Current password required' });
      const match = parent.passwordHash ? await bcrypt.compare(currentPassword, parent.passwordHash) : false;
      if (!match) return res.status(400).json({ message: 'Current password is incorrect' });
      parent.passwordHash = await bcrypt.hash(newPassword, 10);
      parent.mustChangePassword = false;
      await parent.save();
      return res.json({ ok: true, message: 'Password changed' });
    }

    if (['admin','manager'].includes(req.user.role)) {
      if (req.user.role === 'manager' && String(parent.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      parent.passwordHash = await bcrypt.hash(newPassword, 10);
      parent.mustChangePassword = false;
      await parent.save();
      return res.json({ ok: true, message: 'Password updated by admin/manager' });
    }

    return res.status(403).json({ message: 'Forbidden' });
  } catch (err) {
    console.error('POST /parents/:id/change-password error', err && (err.stack || err));
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;




