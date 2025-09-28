// backend/routes/chats.js
'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const chatController = require('../controllers/chatController');

// --- ensure uploads/chats exists ---
const uploadsRoot = path.join(__dirname, '..', 'uploads');
const chatsDir = path.join(uploadsRoot, 'chats');
try {
  if (!fs.existsSync(chatsDir)) fs.mkdirSync(chatsDir, { recursive: true });
} catch (e) { console.warn('could not create chats uploads folder', e); }

// multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, chatsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || '');
    const base = Date.now() + '-' + Math.random().toString(36).slice(2,8);
    cb(null, base + ext);
  }
});
const upload = multer({ storage });

// --- auth middleware ---
// expects Authorization: Bearer <token>
// uses process.env.JWT_SECRET or 'secret' fallback (adjust to your app secret)
function requireAuth(req, res, next) {
  try {
    const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (!auth) return res.status(401).json({ ok:false, message: 'Missing Authorization header' });
    const parts = String(auth).split(' ');
    if (parts.length !== 2) return res.status(401).json({ ok:false, message: 'Invalid Authorization header' });
    const token = parts[1];
    const secret = process.env.JWT_SECRET || 'secret';
    jwt.verify(token, secret, (err, payload) => {
      if (err) return res.status(401).json({ ok:false, message: 'Invalid token' });
      // normalize: set req.user fields expected by controller
      req.user = {
        _id: payload._id || payload.id || payload.userId || payload.uid,
        fullname: payload.fullname || payload.name || payload.fullname,
        role: (payload.role || payload.type || '').toLowerCase(),
        email: payload.email || payload.username || ''
      };
      next();
    });
  } catch (err) {
    console.warn('requireAuth error', err);
    return res.status(401).json({ ok:false, message: 'Authentication failed' });
  }
}

// --- routes ---
// Manager: list classes with chat counts
router.get('/classes', requireAuth, chatController.listClassesForManager);

// class messages list
router.get('/class/:classId/messages', requireAuth, chatController.listMessages);

// upload: post message (supports files)
router.post('/class/:classId/messages', requireAuth, upload.array('files'), chatController.postMessage);

// participants
router.get('/class/:classId/participants', requireAuth, chatController.getParticipants);

// media listing
router.get('/class/:classId/media', requireAuth, chatController.getMedia);

// delete message
router.delete('/message/:messageId', requireAuth, chatController.deleteMessage);

// react
router.post('/message/:messageId/react', requireAuth, chatController.reactToMessage);

// reply
router.post('/message/:messageId/reply', requireAuth, chatController.replyToMessage);

// mute / unmute
router.post('/class/:classId/mute', requireAuth, chatController.muteUser);
router.post('/class/:classId/unmute', requireAuth, chatController.unmuteUser);

// unread counts
router.get('/unread', requireAuth, chatController.getUnreadCounts);

// export
module.exports = router;
