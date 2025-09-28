// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent'); // ensure you have this model

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

module.exports = async function authMiddleware(req, res, next) {
  try {
    // read token from Authorization header (supports "Bearer <token>" or bare token)
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    let token = null;

    if (authHeader && typeof authHeader === 'string') {
      const parts = authHeader.trim().split(/\s+/);
      if (parts.length === 1) token = parts[0];
      else if (parts.length === 2 && /^Bearer$/i.test(parts[0])) token = parts[1];
      else return res.status(401).json({ message: 'Invalid authorization header format' });
    } else if (req.query && req.query.token) {
      token = req.query.token;
    } else if (req.headers['x-access-token']) {
      token = req.headers['x-access-token'];
    }

    if (!token) return res.status(401).json({ message: 'No token provided' });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
      return res.status(401).json({ message: 'Invalid token' });
    }

    // normalize id and role from token payload
    const userId = payload.id || payload._id || payload.userId || payload.uid || null;
    const roleFromToken = payload.role || payload.type || payload.roleName || '';

    if (!userId) return res.status(401).json({ message: 'Invalid token payload (missing id)' });

    // minimal fallback user object from token
    const tokenUser = {
      _id: String(userId),
      role: (roleFromToken || '').toLowerCase(),
      schoolId: payload.schoolId || null,
      fullname: payload.fullname || payload.name || '',
      email: payload.email || ''
    };

    // Try find a User (admins/managers, stored in User model)
    try {
      const dbUser = await User.findById(userId).select('-passwordHash').lean().exec().catch(()=>null);
      if (dbUser) {
        if (dbUser.suspended) return res.status(403).json({ message: 'Your account has been suspended' });
        req.user = {
          _id: String(dbUser._id),
          role: dbUser.role || (roleFromToken || 'user'),
          schoolId: dbUser.schoolId || payload.schoolId || null,
          fullname: dbUser.fullname || payload.fullname || '',
          email: dbUser.email || payload.email || '',
          suspended: !!dbUser.suspended,
          warned: !!dbUser.warned
        };
        return next();
      }
    } catch (e) {
      // continue to other collections
    }

    const normalizedRole = (roleFromToken || '').toLowerCase();

    // Student token -> load Student doc
    if (normalizedRole === 'student') {
      const s = await Student.findById(userId).lean().exec().catch(()=>null);
      if (!s) return res.status(401).json({ message: 'Student not found' });
      if (s.suspended) return res.status(403).json({ message: 'Your account has been suspended' });
      req.user = {
        _id: String(s._id),
        role: 'student',
        schoolId: s.schoolId || payload.schoolId || null,
        fullname: s.fullname || payload.fullname || '',
        email: s.email || payload.email || '',
        suspended: !!s.suspended,
        warned: !!s.warned
      };
      return next();
    }

    // Teacher token -> load Teacher doc
    if (normalizedRole === 'teacher') {
      const t = await Teacher.findById(userId).lean().exec().catch(()=>null);
      if (!t) return res.status(401).json({ message: 'Teacher not found' });
      if (t.suspended) return res.status(403).json({ message: 'Your account has been suspended' });
      req.user = {
        _id: String(t._id),
        role: 'teacher',
        schoolId: t.schoolId || payload.schoolId || null,
        fullname: t.fullname || payload.fullname || '',
        email: t.email || payload.email || '',
        suspended: !!t.suspended,
        warned: !!t.warned
      };
      return next();
    }

    // Parent token -> load Parent doc and attach child info
    if (normalizedRole === 'parent') {
      const p = await Parent.findById(userId).lean().exec().catch(()=>null);
      if (!p) return res.status(401).json({ message: 'Parent not found' });
      // parents may not have schoolId; we prefer child's schoolId if needed in other endpoints
      const childIdFromParentDoc = p.childStudent ? String(p.childStudent) : (payload.childId || payload.child_id || null);
      req.user = {
        _id: String(p._id),
        role: 'parent',
        schoolId: p.schoolId || payload.schoolId || null,
        fullname: p.fullname || payload.fullname || '',
        email: payload.email || '',
        suspended: !!p.suspended,
        warned: !!p.warned,
        childId: childIdFromParentDoc || null,
        childNumberId: p.childNumberId || payload.childNumberId || payload.childNumber || null
      };
      return next();
    }

    // Unknown role -> attach minimal token-derived user so routes can still introspect token
    req.user = tokenUser;
    return next();

  } catch (err) {
    console.error('Auth middleware error:', err && (err.stack || err));
    return res.status(401).json({ message: 'Authentication error' });
  }
};
