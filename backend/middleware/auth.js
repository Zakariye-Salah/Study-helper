// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent'); // ensure model exists

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
        if (dbUser.disabled) return res.status(403).json({ message: 'Your account is disabled' });
        req.user = {
          _id: String(dbUser._id),
          role: dbUser.role || (roleFromToken || 'user'),
          schoolId: dbUser.schoolId || payload.schoolId || null,
          fullname: dbUser.fullname || payload.fullname || '',
          email: dbUser.email || payload.email || '',
          suspended: !!dbUser.suspended,
          warned: !!dbUser.warned,
          disabled: !!dbUser.disabled
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
      if (s.suspended || s.deleted) return res.status(403).json({ message: 'Your account has been suspended or disabled' });
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
      if (t.suspended || t.deleted) return res.status(403).json({ message: 'Your account has been suspended or disabled' });
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
      if (p.suspended || p.deleted) return res.status(403).json({ message: 'Your account has been suspended or disabled' });
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

// backend/middleware/auth.js
// 'use strict';

// const jwt = require('jsonwebtoken');
// require('dotenv').config();

// const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

// // Try to require optional models; if they don't exist, keep null (defensive)
// const User = (() => { try { return require('../models/User'); } catch (e) { return null; } })();
// const Student = (() => { try { return require('../models/Student'); } catch (e) { return null; } })();
// const Teacher = (() => { try { return require('../models/Teacher'); } catch (e) { return null; } })();
// const Parent = (() => { try { return require('../models/Parent'); } catch (e) { return null; } })();

// /**
//  * Verify a JWT token string and return its payload.
//  * Throws the same errors jwt.verify would throw.
//  */
// async function verifyToken(token) {
//   if (!token) throw new Error('No token provided');
//   return jwt.verify(token, JWT_SECRET);
// }

// /**
//  * Given a token payload, attempt to load a richer user object from DB.
//  * Returns a minimal normalized user object suitable to attach to req.user.
//  * If no DB document is found, returns a token-derived fallback object.
//  */
// async function getUserFromPayload(payload) {
//   // Accept many id/role variants
//   const userId = payload && (payload.id || payload._id || payload.userId || payload.uid || payload.sub) || null;
//   const roleFromToken = (payload && (payload.role || payload.type || payload.roleName || '')) || '';

//   const tokenUser = {
//     _id: userId ? String(userId) : null,
//     role: (roleFromToken || '').toLowerCase(),
//     schoolId: payload && (payload.schoolId || null) || null,
//     fullname: payload && (payload.fullname || payload.name || '') || '',
//     email: payload && (payload.email || '') || ''
//   };

//   // If no userId present in token -> return token fallback
//   if (!userId) return tokenUser;

//   // 1) Try User (admin/manager/general)
//   if (User) {
//     try {
//       const dbUser = await User.findById(userId).select('-passwordHash').lean().exec().catch(() => null);
//       if (dbUser) {
//         if (dbUser.suspended) throw { status: 403, message: 'Your account has been suspended' };
//         if (dbUser.disabled) throw { status: 403, message: 'Your account is disabled' };

//         const u = {
//           _id: String(dbUser._id),
//           role: dbUser.role || (roleFromToken || 'user'),
//           schoolId: dbUser.schoolId || tokenUser.schoolId,
//           fullname: dbUser.fullname || tokenUser.fullname,
//           email: dbUser.email || tokenUser.email,
//           suspended: !!dbUser.suspended,
//           warned: !!dbUser.warned,
//           disabled: !!dbUser.disabled,
//           // convenient flags
//           isAdmin: String((dbUser.role || '').toLowerCase()) === 'admin',
//           isTeacher: String((dbUser.role || '').toLowerCase()) === 'teacher',
//           isStudent: String((dbUser.role || '').toLowerCase()) === 'student'
//         };

//         // If teacher profile stored on User doc, attach teacherProfile for course logic
//         if (dbUser.photo || dbUser.avatar || dbUser.title || dbUser.bio) {
//           u.teacherProfile = {
//             photo: dbUser.photo || dbUser.avatar || '',
//             title: dbUser.title || '',
//             bio: dbUser.bio || dbUser.description || ''
//           };
//         }

//         return u;
//       }
//     } catch (e) {
//       // DB lookup failed for User: continue to other collections (do not leak DB error)
//     }
//   }

//   // Normalize role from token for branching below
//   const normalizedRole = (roleFromToken || '').toLowerCase();

//   // 2) Student
//   if (normalizedRole === 'student' && Student) {
//     const s = await Student.findById(userId).lean().exec().catch(() => null);
//     if (!s) throw { status: 401, message: 'Student not found' };
//     if (s.suspended || s.deleted) throw { status: 403, message: 'Your account has been suspended or disabled' };
//     return {
//       _id: String(s._id),
//       role: 'student',
//       schoolId: s.schoolId || tokenUser.schoolId,
//       fullname: s.fullname || tokenUser.fullname,
//       email: s.email || tokenUser.email,
//       suspended: !!s.suspended,
//       warned: !!s.warned,
//       isStudent: true,
//       isTeacher: false,
//       isAdmin: false
//     };
//   }

//   // 3) Teacher
//   if (normalizedRole === 'teacher' && Teacher) {
//     const t = await Teacher.findById(userId).lean().exec().catch(() => null);
//     if (!t) throw { status: 401, message: 'Teacher not found' };
//     if (t.suspended || t.deleted) throw { status: 403, message: 'Your account has been suspended or disabled' };
//     return {
//       _id: String(t._id),
//       role: 'teacher',
//       schoolId: t.schoolId || tokenUser.schoolId,
//       fullname: t.fullname || tokenUser.fullname,
//       email: t.email || tokenUser.email,
//       suspended: !!t.suspended,
//       warned: !!t.warned,
//       isStudent: false,
//       isTeacher: true,
//       isAdmin: false,
//       teacherProfile: {
//         photo: t.photo || t.avatar || '',
//         title: t.title || '',
//         bio: t.bio || t.description || ''
//       }
//     };
//   }

//   // 4) Parent
//   if (normalizedRole === 'parent' && Parent) {
//     const p = await Parent.findById(userId).lean().exec().catch(() => null);
//     if (!p) throw { status: 401, message: 'Parent not found' };
//     if (p.suspended || p.deleted) throw { status: 403, message: 'Your account has been suspended or disabled' };
//     const childIdFromParentDoc = p.childStudent ? String(p.childStudent) : (payload && (payload.childId || payload.child_id) || null);
//     return {
//       _id: String(p._id),
//       role: 'parent',
//       schoolId: p.schoolId || tokenUser.schoolId,
//       fullname: p.fullname || tokenUser.fullname,
//       email: p.email || tokenUser.email,
//       suspended: !!p.suspended,
//       warned: !!p.warned,
//       childId: childIdFromParentDoc || null,
//       childNumberId: p.childNumberId || payload && (payload.childNumberId || payload.childNumber) || null,
//       isStudent: false,
//       isTeacher: false,
//       isAdmin: false
//     };
//   }

//   // Unknown role or no matching DB record found — return token fallback
//   return {
//     ...tokenUser,
//     isAdmin: (String(tokenUser.role || '').toLowerCase() === 'admin'),
//     isTeacher: (String(tokenUser.role || '').toLowerCase() === 'teacher'),
//     isStudent: (String(tokenUser.role || '').toLowerCase() === 'student')
//   };
// }

// /**
//  * Main express middleware — compatible with previous implementation.
//  * When used as app-level middleware, it will parse token and attach req.user.
//  *
//  * Returns JSON responses on 401/403 similar to the old code (keeps frontend compatibility).
//  */
// async function authMiddleware(req, res, next) {
//   try {
//     // extract token from several locations (Authorization header, query token, x-access-token, cookies)
//     let token = null;
//     const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
//     if (authHeader && typeof authHeader === 'string') {
//       const parts = authHeader.trim().split(/\s+/);
//       if (parts.length === 1) token = parts[0];
//       else if (parts.length === 2 && /^Bearer$/i.test(parts[0])) token = parts[1];
//       else return res.status(401).json({ message: 'Invalid authorization header format' });
//     }
//     if (!token && req.query && req.query.token) token = req.query.token;
//     if (!token && req.headers['x-access-token']) token = req.headers['x-access-token'];
//     if (!token && req.cookies && req.cookies.token) token = req.cookies.token;

//     if (!token) return res.status(401).json({ message: 'No token provided' });

//     let payload;
//     try {
//       payload = await verifyToken(token);
//     } catch (err) {
//       if (err && err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
//       return res.status(401).json({ message: 'Invalid token' });
//     }

//     let userObj;
//     try {
//       userObj = await getUserFromPayload(payload);
//     } catch (dbErr) {
//       // dbErr may be thrown as { status, message } — handle accordingly
//       if (dbErr && dbErr.status) return res.status(dbErr.status).json({ message: dbErr.message });
//       console.error('Error loading user from payload', dbErr && (dbErr.stack || dbErr));
//       return res.status(401).json({ message: 'Authentication failed' });
//     }

//     // normalize role flags
//     userObj.role = (userObj.role || '').toLowerCase();
//     userObj.isAdmin = !!userObj.isAdmin || (userObj.role === 'admin');
//     userObj.isTeacher = !!userObj.isTeacher || (userObj.role === 'teacher');
//     userObj.isStudent = !!userObj.isStudent || (userObj.role === 'student');

//     // Helpful course-related convenience properties for downstream route logic
//     // - teacherProfile (may exist when user is Teacher or User with teacher info)
//     // - childId/childNumberId (for parent)
//     // - suspended/disabled boolean flags already present when possible
//     req.user = userObj;
//     req.token = token;

//     return next();
//   } catch (err) {
//     console.error('Auth middleware error:', err && (err.stack || err));
//     return res.status(401).json({ message: 'Authentication error' });
//   }
// }

// /**
//  * requireAuth wrapper (for routes)
//  * usage: router.get('/counts', requireAuth, handler)
//  */
// async function requireAuth(req, res, next) {
//   return authMiddleware(req, res, next);
// }

// /**
//  * requireRole -> returns middleware that asserts user role
//  * e.g. router.post('/', requireAuth, requireRole('admin'), handler)
//  */
// function requireRole(role) {
//   return (req, res, next) => {
//     try {
//       if (!req.user) return res.status(401).json({ message: 'Auth required' });
//       const myRole = (req.user.role || '').toLowerCase();
//       if (myRole !== (role || '').toLowerCase()) return res.status(403).json({ message: 'Forbidden' });
//       return next();
//     } catch (err) {
//       console.error('requireRole error', err && (err.stack || err));
//       return res.status(500).json({ message: 'Server error' });
//     }
//   };
// }

// /**
//  * requireAdmin middleware
//  */
// function requireAdmin(req, res, next) {
//   try {
//     if (!req.user) return res.status(401).json({ message: 'Auth required' });
//     const myRole = (req.user.role || '').toLowerCase();
//     if (myRole !== 'admin' && myRole !== 'manager') return res.status(403).json({ message: 'Forbidden' });
//     return next();
//   } catch (err) {
//     console.error('requireAdmin error', err && (err.stack || err));
//     return res.status(500).json({ message: 'Server error' });
//   }
// }

// // Exports
// module.exports = authMiddleware;
// module.exports.verifyToken = verifyToken;
// module.exports.getUserFromPayload = getUserFromPayload;
// module.exports.requireAuth = requireAuth;
// module.exports.requireRole = requireRole;
// module.exports.requireAdmin = requireAdmin;
 
