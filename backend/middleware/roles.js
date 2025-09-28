// backend/middleware/roles.js
// Usage: const roles = require('../middleware/roles'); router.get('/', auth, roles(['admin','manager']), handler);

module.exports = function (allowed = []) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    // if allowed is empty -> allow all authenticated
    if (!Array.isArray(allowed) || allowed.length === 0) return next();
    if (allowed.includes(req.user.role)) return next();
    return res.status(403).json({ message: 'Forbidden' });
  };
};
