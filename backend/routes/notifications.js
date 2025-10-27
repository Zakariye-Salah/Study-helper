// backend/routes/notifications.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

router.post('/send', auth, roles(['admin']), async (req, res) => {
  try {
    const io = req.app.get('io');
    const body = req.body || {};
    if (!io) return res.status(500).json({ ok:false, message: 'Socket.io not configured' });
    const { room, event = 'notification', payload = {} } = body;
    if (!room) return res.status(400).json({ ok:false, message:'room required' });
    io.to(String(room)).emit(event, payload);
    return res.json({ ok:true });
  } catch (err) {
    console.error('POST /notifications/send', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
