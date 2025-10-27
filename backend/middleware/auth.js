// // backend/middleware/auth.js
// const jwt = require('jsonwebtoken');
// require('dotenv').config();

// const User = require('../models/User');
// const Student = require('../models/Student');
// const Teacher = require('../models/Teacher');
// const Parent = require('../models/Parent'); // ensure model exists

// const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

// module.exports = async function authMiddleware(req, res, next) {
//   try {
//     // read token from Authorization header (supports "Bearer <token>" or bare token)
//     const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
//     let token = null;

//     if (authHeader && typeof authHeader === 'string') {
//       const parts = authHeader.trim().split(/\s+/);
//       if (parts.length === 1) token = parts[0];
//       else if (parts.length === 2 && /^Bearer$/i.test(parts[0])) token = parts[1];
//       else return res.status(401).json({ message: 'Invalid authorization header format' });
//     } else if (req.query && req.query.token) {
//       token = req.query.token;
//     } else if (req.headers['x-access-token']) {
//       token = req.headers['x-access-token'];
//     }

//     if (!token) return res.status(401).json({ message: 'No token provided' });

//     let payload;
//     try {
//       payload = jwt.verify(token, JWT_SECRET);
//     } catch (err) {
//       if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
//       return res.status(401).json({ message: 'Invalid token' });
//     }

//     // normalize id and role from token payload
//     const userId = payload.id || payload._id || payload.userId || payload.uid || null;
//     const roleFromToken = payload.role || payload.type || payload.roleName || '';

//     if (!userId) return res.status(401).json({ message: 'Invalid token payload (missing id)' });

//     // minimal fallback user object from token
//     const tokenUser = {
//       _id: String(userId),
//       role: (roleFromToken || '').toLowerCase(),
//       schoolId: payload.schoolId || null,
//       fullname: payload.fullname || payload.name || '',
//       email: payload.email || ''
//     };

//     // Try find a User (admins/managers, stored in User model)
//     try {
//       const dbUser = await User.findById(userId).select('-passwordHash').lean().exec().catch(()=>null);
//       if (dbUser) {
//         if (dbUser.suspended) return res.status(403).json({ message: 'Your account has been suspended' });
//         if (dbUser.disabled) return res.status(403).json({ message: 'Your account is disabled' });
//         req.user = {
//           _id: String(dbUser._id),
//           role: dbUser.role || (roleFromToken || 'user'),
//           schoolId: dbUser.schoolId || payload.schoolId || null,
//           fullname: dbUser.fullname || payload.fullname || '',
//           email: dbUser.email || payload.email || '',
//           suspended: !!dbUser.suspended,
//           warned: !!dbUser.warned,
//           disabled: !!dbUser.disabled
//         };
//         return next();
//       }
//     } catch (e) {
//       // continue to other collections
//     }

//     const normalizedRole = (roleFromToken || '').toLowerCase();

//     // Student token -> load Student doc
//     if (normalizedRole === 'student') {
//       const s = await Student.findById(userId).lean().exec().catch(()=>null);
//       if (!s) return res.status(401).json({ message: 'Student not found' });
//       if (s.suspended || s.deleted) return res.status(403).json({ message: 'Your account has been suspended or disabled' });
//       req.user = {
//         _id: String(s._id),
//         role: 'student',
//         schoolId: s.schoolId || payload.schoolId || null,
//         fullname: s.fullname || payload.fullname || '',
//         email: s.email || payload.email || '',
//         suspended: !!s.suspended,
//         warned: !!s.warned
//       };
//       return next();
//     }

//     // Teacher token -> load Teacher doc
//     if (normalizedRole === 'teacher') {
//       const t = await Teacher.findById(userId).lean().exec().catch(()=>null);
//       if (!t) return res.status(401).json({ message: 'Teacher not found' });
//       if (t.suspended || t.deleted) return res.status(403).json({ message: 'Your account has been suspended or disabled' });
//       req.user = {
//         _id: String(t._id),
//         role: 'teacher',
//         schoolId: t.schoolId || payload.schoolId || null,
//         fullname: t.fullname || payload.fullname || '',
//         email: t.email || payload.email || '',
//         suspended: !!t.suspended,
//         warned: !!t.warned
//       };
//       return next();
//     }

//     // Parent token -> load Parent doc and attach child info
//     if (normalizedRole === 'parent') {
//       const p = await Parent.findById(userId).lean().exec().catch(()=>null);
//       if (!p) return res.status(401).json({ message: 'Parent not found' });
//       if (p.suspended || p.deleted) return res.status(403).json({ message: 'Your account has been suspended or disabled' });
//       const childIdFromParentDoc = p.childStudent ? String(p.childStudent) : (payload.childId || payload.child_id || null);
//       req.user = {
//         _id: String(p._id),
//         role: 'parent',
//         schoolId: p.schoolId || payload.schoolId || null,
//         fullname: p.fullname || payload.fullname || '',
//         email: payload.email || '',
//         suspended: !!p.suspended,
//         warned: !!p.warned,
//         childId: childIdFromParentDoc || null,
//         childNumberId: p.childNumberId || payload.childNumberId || payload.childNumber || null
//       };
//       return next();
//     }

//     // Unknown role -> attach minimal token-derived user so routes can still introspect token
//     req.user = tokenUser;
//     return next();

//   } catch (err) {
//     console.error('Auth middleware error:', err && (err.stack || err));
//     return res.status(401).json({ message: 'Authentication error' });
//   }
// };


// backend/middleware/auth.js
'use strict';

const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

/**
 * Verify a JWT token string and return its payload.
 */
async function verifyToken(token) {
  if (!token) throw new Error('No token provided');
  return jwt.verify(token, JWT_SECRET);
}

async function getUserFromPayload(payload) {
  const userId = payload && (payload.id || payload._id || payload.userId || payload.uid || payload.sub) || null;
  const roleFromToken = (payload && (payload.role || payload.type || payload.roleName || '')) || '';

  const tokenUser = {
    _id: userId ? String(userId) : null,
    role: (roleFromToken || '').toLowerCase(),
    schoolId: payload && (payload.schoolId || null) || null,
    fullname: payload && (payload.fullname || payload.name || '') || '',
    email: payload && (payload.email || '') || ''
  };

  if (!userId) {
    return tokenUser;
  }

  try {
    const dbUser = await User.findById(userId).select('-passwordHash').lean().exec().catch(() => null);
    if (dbUser) {
      if (dbUser.suspended) throw { status: 403, message: 'Your account has been suspended' };
      if (dbUser.disabled) throw { status: 403, message: 'Your account is disabled' };

      const u = {
        _id: String(dbUser._id),
        role: dbUser.role || (roleFromToken || 'user'),
        schoolId: dbUser.schoolId || tokenUser.schoolId,
        fullname: dbUser.fullname || tokenUser.fullname,
        email: dbUser.email || tokenUser.email,
        suspended: !!dbUser.suspended,
        warned: !!dbUser.warned,
        disabled: !!dbUser.disabled,
        isAdmin: String((dbUser.role || '').toLowerCase()) === 'admin',
        isTeacher: String((dbUser.role || '').toLowerCase()) === 'teacher',
        isStudent: String((dbUser.role || '').toLowerCase()) === 'student'
      };
      return u;
    }
  } catch (e) {
    // continue to other collections
  }

  const normalizedRole = (roleFromToken || '').toLowerCase();

  if (normalizedRole === 'student') {
    const s = await Student.findById(userId).lean().exec().catch(() => null);
    if (!s) throw { status: 401, message: 'Student not found' };
    if (s.suspended || s.deleted) throw { status: 403, message: 'Your account has been suspended or disabled' };
    return {
      _id: String(s._id),
      role: 'student',
      schoolId: s.schoolId || tokenUser.schoolId,
      fullname: s.fullname || tokenUser.fullname,
      email: s.email || tokenUser.email,
      suspended: !!s.suspended,
      warned: !!s.warned,
      isStudent: true,
      isTeacher: false,
      isAdmin: false
    };
  }

  if (normalizedRole === 'teacher') {
    const t = await Teacher.findById(userId).lean().exec().catch(() => null);
    if (!t) throw { status: 401, message: 'Teacher not found' };
    if (t.suspended || t.deleted) throw { status: 403, message: 'Your account has been suspended or disabled' };
    return {
      _id: String(t._id),
      role: 'teacher',
      schoolId: t.schoolId || tokenUser.schoolId,
      fullname: t.fullname || tokenUser.fullname,
      email: t.email || tokenUser.email,
      suspended: !!t.suspended,
      warned: !!t.warned,
      isStudent: false,
      isTeacher: true,
      isAdmin: false,
      teacherProfile: {
        photo: t.photo || t.avatar || '',
        title: t.title || '',
        bio: t.bio || t.description || ''
      }
    };
  }

  if (normalizedRole === 'parent') {
    const p = await Parent.findById(userId).lean().exec().catch(() => null);
    if (!p) throw { status: 401, message: 'Parent not found' };
    if (p.suspended || p.deleted) throw { status: 403, message: 'Your account has been suspended or disabled' };
    const childIdFromParentDoc = p.childStudent ? String(p.childStudent) : (payload && (payload.childId || payload.child_id) || null);
    return {
      _id: String(p._id),
      role: 'parent',
      schoolId: p.schoolId || tokenUser.schoolId,
      fullname: p.fullname || tokenUser.fullname,
      email: p.email || tokenUser.email,
      suspended: !!p.suspended,
      warned: !!p.warned,
      childId: childIdFromParentDoc || null,
      childNumberId: p.childNumberId || payload && (payload.childNumberId || payload.childNumber) || null,
      isStudent: false,
      isTeacher: false,
      isAdmin: false
    };
  }

  return {
    ...tokenUser,
    isAdmin: (String(tokenUser.role || '').toLowerCase() === 'admin'),
    isTeacher: (String(tokenUser.role || '').toLowerCase() === 'teacher'),
    isStudent: (String(tokenUser.role || '').toLowerCase() === 'student')
  };
}

async function authMiddleware(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    if (authHeader && typeof authHeader === 'string') {
      const parts = authHeader.trim().split(/\s+/);
      if (parts.length === 1) token = parts[0];
      else if (parts.length === 2 && /^Bearer$/i.test(parts[0])) token = parts[1];
      else {
        return res.status(401).json({ message: 'Invalid authorization header format' });
      }
    }
    if (!token && req.query && req.query.token) token = req.query.token;
    if (!token && req.headers['x-access-token']) token = req.headers['x-access-token'];
    if (!token && req.cookies && req.cookies.token) token = req.cookies.token;

    if (!token) return res.status(401).json({ message: 'No token provided' });

    let payload;
    try {
      payload = await verifyToken(token);
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
      return res.status(401).json({ message: 'Invalid token' });
    }

    let userObj;
    try {
      userObj = await getUserFromPayload(payload);
    } catch (dbErr) {
      if (dbErr && dbErr.status) return res.status(dbErr.status).json({ message: dbErr.message });
      console.error('Error loading user from payload', dbErr && (dbErr.stack || dbErr));
      return res.status(401).json({ message: 'Authentication failed' });
    }

    userObj.role = (userObj.role || '').toLowerCase();
    userObj.isAdmin = !!userObj.isAdmin || (userObj.role === 'admin');
    userObj.isTeacher = !!userObj.isTeacher || (userObj.role === 'teacher');
    userObj.isStudent = !!userObj.isStudent || (userObj.role === 'student');

    req.user = userObj;
    req.token = token;
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err && (err.stack || err));
    return res.status(401).json({ message: 'Authentication error' });
  }
}

// wrapper for route-level usage
async function requireAuth(req, res, next) {
  return authMiddleware(req, res, next);
}

function requireRole(role) {
  return (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ message: 'Auth required' });
      const myRole = (req.user.role || '').toLowerCase();
      if (myRole !== (role || '').toLowerCase()) return res.status(403).json({ message: 'Forbidden' });
      next();
    } catch (err) {
      console.error('requireRole error', err && (err.stack || err));
      return res.status(500).json({ message: 'Server error' });
    }
  };
}

module.exports = authMiddleware;
module.exports.verifyToken = verifyToken;
module.exports.getUserFromPayload = getUserFromPayload;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
