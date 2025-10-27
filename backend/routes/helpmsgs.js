// backend/routes/helpmsgs.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const HelpThread = require('../models/HelpThread');
const HelpMessage = require('../models/HelpMessageCourse'); // keep same filename as your project uses
const User = require('../models/User');

function toObjectIdIfPossible(id) {
  try {
    if (!id) return id;
    const s = String(id || '');
    if (mongoose.Types.ObjectId.isValid(s)) return mongoose.Types.ObjectId(s);
  } catch (e) {}
  return id;
}

// POST /helpmsgs - create message (and thread if needed)
router.post('/', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const userId = toObjectIdIfPossible(req.user._id);
    let thread = null;
    if (body.threadId) thread = await HelpThread.findById(body.threadId);
    if (!thread) {
      thread = new HelpThread({
        userId,
        courseId: body.courseId ? toObjectIdIfPossible(body.courseId) : null,
        subject: body.subject || '',
        lastUpdatedAt: new Date()
      });
      await thread.save();
    }

    const msg = new HelpMessage({
      threadId: thread._id,
      fromUserId: userId,
      toUserId: null,
      toAdmin: true,
      body: body.body || '',
      read: false
    });
    await msg.save();

    thread.lastUpdatedAt = new Date();
    await thread.save();

    // notify admin via socket
    try {
      const io = req.app.get('io');
      if (io) io.to('admins').emit('help:new', { threadId: thread._id, userId: userId });
    } catch (e) {}

    return res.json({ ok: true, threadId: thread._id, message: msg });
  } catch (err) {
    console.error('POST /helpmsgs', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// GET /helpmsgs - admin inbox grouped by user OR user thread list
router.get('/', auth, async (req, res) => {
  try {
    const role = (req.user && req.user.role || '').toLowerCase();
    if (role === 'admin') {
      // admin: list threads with last message and unread count
      const threads = await HelpThread.find({}).sort({ lastUpdatedAt: -1 }).lean();
      const out = [];
      for (const t of threads) {
        const unread = await HelpMessage.countDocuments({ threadId: t._id, toAdmin: true, read: false });
        const last = await HelpMessage.findOne({ threadId: t._id }).sort({ createdAt: -1 }).lean();
        const user = t.userId ? await User.findById(t.userId).select('fullname email username').lean() : null;
        out.push({ thread: t, lastMessage: last, unreadCount: unread, user });
      }
      return res.json({ ok: true, items: out });
    }

    // non-admin: return user's threads and messages
    const threads = await HelpThread.find({ userId: toObjectIdIfPossible(req.user._id) }).sort({ lastUpdatedAt: -1 }).lean();
    const out = [];
    for (const t of threads) {
      const messages = await HelpMessage.find({ threadId: t._id }).sort({ createdAt: 1 }).lean();
      out.push({ thread: t, messages });
    }
    return res.json({ ok: true, items: out });
  } catch (err) {
    console.error('GET /helpmsgs', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// GET /helpmsgs/:threadId/messages
router.get('/:threadId/messages', auth, async (req, res) => {
  try {
    const threadId = req.params.threadId;
    const thread = await HelpThread.findById(threadId);
    if (!thread) return res.status(404).json({ ok: false, message: 'Thread not found' });

    const role = (req.user && req.user.role || '').toLowerCase();
    if (role !== 'admin' && String(thread.userId) !== String(req.user._id)) return res.status(403).json({ ok: false, message: 'Not allowed' });

    const messages = await HelpMessage.find({ threadId: thread._id }).sort({ createdAt: 1 }).lean();

    // mark messages read depending on viewer
    if (role === 'admin') {
      await HelpMessage.updateMany({ threadId: thread._id, toAdmin: true, read: false }, { $set: { read: true } });
    } else {
      await HelpMessage.updateMany({ threadId: thread._id, toUserId: toObjectIdIfPossible(req.user._id), read: false }, { $set: { read: true } });
    }

    return res.json({ ok: true, messages });
  } catch (err) {
    console.error('GET /helpmsgs/:threadId/messages', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /helpmsgs/:threadId/reply (admin or user reply)
router.post('/:threadId/reply', auth, async (req, res) => {
  try {
    const threadId = req.params.threadId;
    const thread = await HelpThread.findById(threadId);
    if (!thread) return res.status(404).json({ ok: false, message: 'Thread not found' });

    const role = (req.user && req.user.role || '').toLowerCase();
    const body = req.body || {};

    const msgData = {
      threadId: thread._id,
      fromUserId: toObjectIdIfPossible(req.user._id),
      body: body.body || '',
      read: false
    };

    if (role === 'admin') {
      msgData.toUserId = thread.userId;
      msgData.toAdmin = false;
    } else {
      msgData.toUserId = null;
      msgData.toAdmin = true;
    }

    const msg = new HelpMessage(msgData);
    await msg.save();

    thread.lastUpdatedAt = new Date();
    await thread.save();

    // notify recipient via socket
    try {
      const io = req.app.get('io');
      if (io) {
        if (role === 'admin' && thread.userId) io.to(String(thread.userId)).emit('help:reply', { threadId: thread._id, message: msg });
        else io.to('admins').emit('help:reply', { threadId: thread._id, message: msg });
      }
    } catch (e) {}

    return res.json({ ok: true, message: msg });
  } catch (err) {
    console.error('POST /helpmsgs/:threadId/reply', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
