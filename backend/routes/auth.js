// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

// Sign JWT token (7d)
function signToken(obj) {
  const payload = {
    id: String(obj._id || obj.id),
    role: obj.role,
    fullname: obj.fullname,
    schoolId: obj.schoolId || null
  };
  return jwt.sign(payload, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' });
}

/* ---------------- GET /api/auth/me ----------------
   Protected endpoint: returns sanitized user info for the token owner
   Requires ../middleware/auth to be present and mounted (it should populate req.user)
*/
try {
  // require auth middleware (throws if not present)
  const auth = require('../middleware/auth');

  router.get('/me', auth, (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      // sanitize and normalize returned user shape
      const u = req.user;
      const user = {
        _id: String(u._id || u.id || u.userId),
        fullname: u.fullname || u.name || '',
        role: (u.role || '').toLowerCase(),
        email: u.email || '',
        schoolId: u.schoolId || null
      };
      return res.json({ user });
    } catch (err) {
      console.error('GET /auth/me protected error', err);
      return res.status(500).json({ message: 'Server error', detail: err.message });
    }
  });
} catch (e) {
  // If middleware is not available, provide a fallback that returns 401
  console.warn('auth middleware not found; /api/auth/me will return 401 until middleware is available.', e && e.message);
  router.get('/me', (req, res) => res.status(401).json({ message: 'Unauthorized' }));
}

/* ---------------- POST /api/auth/login ----------------
   Existing login flow: supports admin/users by email, or student/teacher by numberId.
   Returns { token, user } on success.
*/
router.post('/login', async (req, res) => {
  try {
    const { email, numberId, password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password required' });

    // If email provided -> admin/user login
    if (email) {
      const u = await User.findOne({ email: email.toLowerCase() });
      if (!u) return res.status(401).json({ message: 'Invalid credentials' });
      if (u.suspended) return res.status(403).json({ message: 'Account suspended' });
      const ok = await bcrypt.compare(password, u.passwordHash);
      if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
      const token = signToken(u);
      return res.json({ token, user: { _id: u._id, fullname: u.fullname, role: u.role, schoolId: u.schoolId } });
    }

    // If numberId provided -> try student then teacher
    if (!numberId) return res.status(400).json({ message: 'Provide email or numberId' });

    // Student login
    const s = await Student.findOne({ numberId });
    if (s) {
      if (!s.passwordHash) return res.status(401).json({ message: 'No password set for this student' });
      const ok = await bcrypt.compare(password, s.passwordHash);
      if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
      const token = jwt.sign({ id: String(s._id), role: 'student', fullname: s.fullname, schoolId: s.schoolId }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' });
      return res.json({ token, user: { _id: s._id, fullname: s.fullname, role: 'student', schoolId: s.schoolId } });
    }

    // Teacher login
    const t = await Teacher.findOne({ numberId });
    if (t) {
      if (!t.passwordHash) return res.status(401).json({ message: 'No password set for this teacher' });
      const ok = await bcrypt.compare(password, t.passwordHash);
      if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
      const token = jwt.sign({ id: String(t._id), role: 'teacher', fullname: t.fullname, schoolId: t.schoolId }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' });
      return res.json({ token, user: { _id: t._id, fullname: t.fullname, role: 'teacher', schoolId: t.schoolId } });
    }

    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (err) {
    console.error('/auth/login', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
