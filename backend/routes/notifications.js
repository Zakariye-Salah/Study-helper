
// backend/routes/notifications.js
'use strict';
const express = require('express');
const router = express.Router();
const Purchase = require('../models/Purchase');
const User = require('../models/User');

let HelpModel = null;
try { HelpModel = require('../models/HelpMessageCourse'); } catch (e) { HelpModel = null; }

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i,'').trim();
    if (!token) return res.status(401).json({ ok:false, error:'Authentication required' });
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'secret';
    const payload = jwt.verify(token, secret);
    if (!payload || !payload.sub) return res.status(401).json({ ok:false, error:'Invalid token' });
    const u = await User.findById(payload.sub).lean().catch(()=>null);
    if (!u) return res.status(401).json({ ok:false, error:'User not found' });
    req.user = u;
    next();
  } catch (err) {
    console.warn('requireAuth failed', err && err.message);
    return res.status(401).json({ ok:false, error:'Auth failed' });
  }
}

/**
 * GET /api/notifications/counts
 */
router.get('/counts', requireAuth, async (req, res) => {
  try {
    const checking = await Purchase.countDocuments({ status: 'checking' }).catch(()=>0);
    let help = 0;
    if (HelpModel) {
      if ((req.user.role || '').toLowerCase() === 'admin') {
        help = await HelpModel.countDocuments({ toAdmin: true, read: false }).catch(()=>0);
      } else {
        help = await HelpModel.countDocuments({ toUserId: req.user._id, read: false }).catch(()=>0);
      }
    }
    return res.json({ ok:true, counts: { checking: checking || 0, help: help || 0 } });
  } catch (err) {
    console.error('GET /notifications/counts err', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

module.exports = router;
