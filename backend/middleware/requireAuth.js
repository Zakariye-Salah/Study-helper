// backend/middleware/requireAuth.js
const jwt = require('jsonwebtoken');

let UserModel = null;
try {
  // try common file names (projects differ) — this will throw if file not present
  UserModel = require('../models/User');
} catch (e) {
  // try alternative name
  try { UserModel = require('../models/Users'); } catch (e2) { UserModel = null; }
}

/**
 * requireAuth middleware
 * - Looks for Bearer token in Authorization header, x-access-token header or ?token= query param
 * - Verifies JWT and attaches req.user (from DB if possible, otherwise from token payload)
 */
module.exports = async function requireAuth(req, res, next) {
  try {
    // Accept header, x-access-token, or query param ?token=
    let token = null;
    const auth = req.headers && (req.headers.authorization || req.headers['x-access-token']);
    if (auth && typeof auth === 'string') {
      token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth.trim();
    }
    if (!token && req.query && req.query.token) token = String(req.query.token);
    if (!token) return res.status(401).json({ error: 'Unauthorized: token missing' });

    const secret = process.env.JWT_SECRET || process.env.SECRET || 'secret';
    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Try to load user from DB if we have a User model and an id in token
    if (UserModel && (payload && (payload.id || payload._id || payload.userId || payload.uid))) {
      const id = payload.id || payload._id || payload.userId || payload.uid;
      try {
        // Some projects export mongoose models differently; handle both
        const maybeFind = typeof UserModel.findById === 'function';
        if (maybeFind) {
          // Use .lean() to avoid attaching a full mongoose document when not necessary
          const userDoc = await UserModel.findById(id).lean ? await UserModel.findById(id).lean() : await UserModel.findById(id);
          if (userDoc) {
            // normalize minimal fields we use across routes
            const normalized = {
              _id: String(userDoc._id || userDoc.id),
              role: (userDoc.role || userDoc.type || '').toLowerCase(),
              fullname: userDoc.fullname || userDoc.name || '',
              schoolId: userDoc.schoolId || userDoc.school || null,
              email: userDoc.email || ''
            };
            req.user = normalized;
            return next();
          }
        }
      } catch (e) {
        // ignore DB lookup errors and fallback to payload-based user
        console.warn('requireAuth: user lookup failed', e && e.message ? e.message : e);
      }
    }

    // fallback: attach minimal user from payload
    req.user = {
      _id: payload.id || payload._id || payload.userId || payload.uid || null,
      role: (payload.role || payload.type || '').toLowerCase(),
      fullname: payload.fullname || payload.name || '',
      schoolId: payload.schoolId || null,
      email: payload.email || ''
    };

    return next();
  } catch (err) {
    console.error('requireAuth error', err && (err.stack || err));
    return res.status(500).json({ error: 'Auth middleware error' });
  }
};
