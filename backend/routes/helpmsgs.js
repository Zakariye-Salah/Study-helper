
// backend/routes/helpmsgs.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const HelpMessage = require('../models/HelpMessageCourse');

/**
 * POST /api/helpmsgs - send help message (user -> admin or admin -> user)
 * Body: { toUserId (optional), body }
 */
router.post('/', auth, async (req, res) => {
  try {
    const { toUserId, body } = req.body || {};
    if (!body || !String(body).trim()) return res.status(400).json({ ok:false, message: 'body required' });

    const hm = new HelpMessage({
      fromUserId: req.user._id,
      toAdmin: !toUserId,
      toUserId: toUserId || null,
      body: String(body).trim()
    });
    await hm.save();
    // emit socket event if available
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) {
        if (toUserId) io.to(String(toUserId)).emit('help:new', { messageId: hm._id, from: req.user._id, body: hm.body });
        else io.emit('help:inbox', { messageId: hm._id });
      }
    } catch(e){/*ignore*/}
    return res.json({ ok:true, message: hm });
  } catch (err) {
    console.error('POST /helpmsgs', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * GET /api/helpmsgs
 * Admin: grouped inbox by user; User: own messages
 */
router.get('/', auth, async (req, res) => {
  try {
    const isAdmin = (req.user && (req.user.role || '').toLowerCase()) === 'admin';
    if (isAdmin) {
      // group by fromUserId (excluding admin-sent system messages)
      const rows = await HelpMessage.aggregate([
        { $match: { toAdmin: true } },
        { $sort: { createdAt: -1 } },
        { $group: {
            _id: '$fromUserId',
            lastMessage: { $first: '$$ROOT' },
            unreadCount: { $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] } },
            total: { $sum: 1 }
        } },
        { $limit: 500 }
      ]);
      return res.json({ ok:true, inbox: rows });
    } else {
      // user: fetch messages to/from them
      const items = await HelpMessage.find({ $or: [{ fromUserId: req.user._id }, { toUserId: req.user._id }] }).sort({ createdAt: -1 }).limit(500).lean();
      return res.json({ ok:true, items });
    }
  } catch (err) {
    console.error('GET /helpmsgs', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

module.exports = router;

