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

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function isObjectIdString(s) {
  return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s);
}

/**
 * POST /api/parents
 * Create a parent and link to an existing student (student identified by numberId).
 * Only admin/manager can create parents.
 * Body: { fullname, phone, studentNumberId, password }
 */
router.post('/', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const { fullname, phone, studentNumberId, password } = req.body || {};
    if (!fullname || !studentNumberId || !password) {
      return res.status(400).json({ ok: false, message: 'fullname, studentNumberId and password are required' });
    }

    const student = await Student.findOne({ numberId: String(studentNumberId).trim() }).lean();
    if (!student) {
      return res.status(400).json({ ok: false, message: `Student ${String(studentNumberId)} does not exist` });
    }

    // avoid exact duplicates
    const exists = await Parent.findOne({
      childStudent: student._id,
      fullname: fullname.trim(),
      phone: phone ? String(phone).trim() : undefined
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

    const student = await Student.findOne({ numberId: studentNumberId }).lean();
    if (!student) return res.status(400).json({ ok: false, message: 'Student not found' });

    const parents = await Parent.find({ childStudent: student._id }).lean();
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
 * Optional: ?search=term  => searches fullname / phone / childNumberId
 */
router.get('/', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const q = (req.query && req.query.search) ? String(req.query.search).trim() : '';
    const filter = {};
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
      createdAt: p.createdAt
    }));
    return res.json({ ok: true, parents: out });
  } catch (err) {
    console.error('GET /parents error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/parents/me
 * Return current parent info (auth)
 */
router.get('/me', auth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Auth required' });
    if (String((req.user.role || '').toLowerCase()) !== 'parent') return res.status(403).json({ ok: false, message: 'Not a parent' });
    const p = await Parent.findById(req.user._id).populate('childStudent', 'fullname numberId schoolId').lean();
    if (!p) return res.status(404).json({ ok: false, message: 'Parent not found' });
    return res.json({ ok: true, parent: p });
  } catch (err) {
    console.error('GET /parents/me error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/parents/:id
 * Admin/manager or the parent themselves (auth). Parent can fetch own record.
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const p = await Parent.findById(id).populate('childStudent','fullname numberId').lean();
    if (!p) return res.status(404).json({ ok: false, message: 'Not found' });

    // allow admin/manager or the parent in token
    if (req.user && (req.user.role === 'admin' || req.user.role === 'manager')) {
      return res.json({ ok: true, parent: p });
    }
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
 * PUT /api/parents/:id - update (parent can update their name/phone/password)
 * Admin/manager can update any parent.
 * Body: { fullname?, phone?, password? }
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const p = await Parent.findById(id);
    if (!p) return res.status(404).json({ ok: false, message: 'Not found' });

    // permission: admin/manager or parent themself
    if (!(req.user && (req.user.role === 'admin' || req.user.role === 'manager' || (req.user.role === 'parent' && String(req.user._id) === String(p._id))))) {
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
 * DELETE /api/parents/:id - admin/manager only
 */
router.delete('/:id', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    await Parent.findByIdAndDelete(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /parents/:id error', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
