// backend/routes/users.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Payment = require('../models/Payment');

// Helper: sanitize user for output (no passwordHash)
function sanitizeUser(u) {
  if (!u) return {};
  const out = { ...u };
  delete out.passwordHash;
  return out;
}

// POST /api/users  — create user (admin only)
router.post('/', auth, roles(['admin']), async (req, res) => {
  try {
    const { fullname, email, phone, role, password, schoolId } = req.body;
    if (!fullname) return res.status(400).json({ message: 'fullname required' });
    if (!role) return res.status(400).json({ message: 'role required' });
    if (!password) return res.status(400).json({ message: 'password required' });

    const normalizedEmail = email ? String(email).toLowerCase() : undefined;

    // check unique email if provided
    if (normalizedEmail) {
      const exists = await User.findOne({ email: normalizedEmail }).lean();
      if (exists) return res.status(400).json({ message: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const u = new User({
      fullname,
      email: normalizedEmail,
      phone,
      role,
      passwordHash,
      // admin creating manager - use requester's schoolId by default unless provided
      schoolId: schoolId || req.user && req.user.schoolId ? req.user.schoolId : undefined
    });

    await u.save();
    const out = u.toObject();
    delete out.passwordHash;
    res.json({ user: out });
  } catch (err) {
    console.error('POST /users error', err);
    if (err.code === 11000) return res.status(400).json({ message: 'Duplicate key', detail: err.keyValue });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users  — list users (admin only) with search, role, page, limit
router.get('/', auth, roles(['admin']), async (req, res) => {
  try {
    const { role, search = '', page = 1, limit = 50 } = req.query;
    const q = {};
    if (role) q.role = role;

    if (search && search.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      q.$or = [{ fullname: rx }, { email: rx }];
    }

    const pg = Math.max(1, parseInt(page || 1, 10));
    const lim = Math.min(500, parseInt(limit || 50, 10));

    const items = await User.find(q)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean();

    const total = await User.countDocuments(q);

    res.json({ items, total, page: pg, limit: lim });
  } catch (err) {
    console.error('GET /users error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/:id - admin only
router.get('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const u = await User.findById(req.params.id).select('-passwordHash').lean();
    if (!u) return res.status(404).json({ message: 'User not found' });

    // counts: students, teachers, payments, subjects, classes, votes (if you have models)
    const [studentsCount, teachersCount, paymentsCount] = await Promise.all([
      Student.countDocuments({ createdBy: u._id }),
      Teacher.countDocuments({ createdBy: u._id }),
      Payment.countDocuments({ createdBy: u._id })
    ]).catch(() => [0, 0, 0]);

    res.json({ user: u, counts: { students: studentsCount, teachers: teachersCount, payments: paymentsCount } });
  } catch (err) {
    console.error('GET /users/:id error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/users/:id/suspend - admin only
// Accepts { suspend: true/false } to set explicitly; if not provided toggles current value.
router.post('/:id/suspend', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const setVal = (typeof req.body === 'object' && req.body !== null && typeof req.body.suspend !== 'undefined') ? !!req.body.suspend : null;
    const u = await User.findById(id);
    if (!u) return res.status(404).json({ message: 'User not found' });

    if (setVal === null) {
      u.suspended = !u.suspended;
    } else {
      u.suspended = setVal;
    }
    await u.save();

    res.json({ ok: true, suspended: u.suspended });
  } catch (err) {
    console.error('POST /users/:id/suspend error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/users/:id/warn - admin only
// Accepts { warn: true/false } to set explicitly; if not provided sets warned = true.
router.post('/:id/warn', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const setVal = (typeof req.body === 'object' && req.body !== null && typeof req.body.warn !== 'undefined') ? !!req.body.warn : true;
    const u = await User.findById(id);
    if (!u) return res.status(404).json({ message: 'User not found' });

    u.warned = setVal;
    await u.save();
    res.json({ ok: true, warned: u.warned, message: setVal ? 'User warned' : 'Warning removed' });
  } catch (err) {
    console.error('POST /users/:id/warn error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/users/:id - admin only (delete user and cascade)
router.delete('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    // delete user
    await User.findByIdAndDelete(id);
    // cascade deletes for created items
    await Student.deleteMany({ createdBy: id }).catch(()=>{});
    await Teacher.deleteMany({ createdBy: id }).catch(()=>{});
    await Payment.deleteMany({ createdBy: id }).catch(()=>{});
    // you may want to delete classes/subjects/votes createdBy this user as well if those models exist
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /users/:id error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/:id/data - allow admin to view another user's created resources OR user themselves
router.get('/:id/data', auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!(String(req.user._id) === String(id) || req.user.role === 'admin')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const students = await Student.find({ createdBy: id }).limit(200).lean().catch(()=>[]);
    const teachers = await Teacher.find({ createdBy: id }).limit(200).lean().catch(()=>[]);
    const payments = await Payment.find({ createdBy: id }).limit(200).lean().catch(()=>[]);
    res.json({ students, teachers, payments });
  } catch (err) {
    console.error('GET /users/:id/data error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
