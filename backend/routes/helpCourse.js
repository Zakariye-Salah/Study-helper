// // backend/routes/helpCourse.js
// 'use strict';

// const express = require('express');
// const router = express.Router();
// const { v4: uuidv4 } = require('uuid');
// const mongoose = require('mongoose');

// const HelpMsg = require('../models/HelpMessageCourse'); // schema provided in your code
// const User = require('../models/User'); // for admin listing / populate
// const { requireAuth, requireRole } = require('../middleware/auth');

// /*
// Schema of HelpMessageCourse (for reference)
// {
//   threadId: String,
//   fromUserId: ObjectId,
//   toAdmin: Boolean,
//   toUserId: ObjectId,
//   text: String,
//   read: Boolean,
//   createdAt: Date
// }
// */

// // Helper: convert to string id
// function sid(v){ return v ? String(v) : null; }

// /**
//  * GET /api/helpCourse/threads
//  * - Admin: returns all threads summary (threadId, lastMessage, updatedAt, unread counts, user info)
//  * - Non-admin: returns threads where user participated (fromUserId === me OR toUserId === me)
//  */
// router.get('/threads', requireAuth, async (req, res) => {
//   try {
//     const me = req.user;
//     if (!me) return res.status(401).json({ ok:false, error:'Auth required' });

//     const isAdmin = (String((me.role||'')).toLowerCase() === 'admin');

//     if (isAdmin) {
//       // Aggregate by threadId to get last message and unread counts for admin
//       const agg = await HelpMsg.aggregate([
//         // Ignore messages without a threadId (they are allowed but we group by string)
//         { $match: { } },
//         { $sort: { createdAt: -1 } },
//         { $group: {
//             _id: '$threadId',
//             lastMessage: { $first: '$text' },
//             updatedAt: { $first: '$createdAt' },
//             lastFromUserId: { $first: '$fromUserId' },
//             unreadForAdmin: { $sum: { $cond: [{ $and: ['$toAdmin', { $eq: ['$read', false] }] }, 1, 0] } },
//             sampleToUserId: { $first: '$toUserId' }
//         }},
//         { $sort: { updatedAt: -1 } }
//       ]);

//       // enrich with user info where available (fromUser might be the user who started thread)
//       const out = [];
//       for (const th of agg) {
//         const outItem = {
//           threadId: th._id || null,
//           lastMessage: th.lastMessage || '',
//           updatedAt: th.updatedAt || null,
//           unreadForAdmin: Number(th.unreadForAdmin || 0),
//           starterUserId: sid(th.lastFromUserId) || sid(th.sampleToUserId) || null
//         };
//         // try populate starter user / owner
//         if (outItem.starterUserId) {
//           const u = await User.findById(outItem.starterUserId).select('_id fullname email').lean().catch(()=>null);
//           if (u) outItem.user = { _id: String(u._id), fullname: u.fullname || '', email: u.email || '' };
//         }
//         out.push(outItem);
//       }

//       return res.json({ ok:true, threads: out });
//     } else {
//       // non-admin: list threads where user is participant
//       const myId = req.user._id;
//       // find distinct threadIds where fromUserId == me or toUserId == me
//       const threads = await HelpMsg.aggregate([
//         { $match: { $or: [ { fromUserId: mongoose.Types.ObjectId(String(myId)) }, { toUserId: mongoose.Types.ObjectId(String(myId)) } ] } },
//         { $sort: { createdAt: -1 } },
//         { $group: { _id: '$threadId', lastMessage: { $first: '$text' }, updatedAt: { $first: '$createdAt' } } },
//         { $sort: { updatedAt: -1 } }
//       ]);

//       const out = threads.map(t => ({
//         threadId: t._id || null,
//         lastMessage: t.lastMessage || '',
//         updatedAt: t.updatedAt || null
//       }));
//       return res.json({ ok:true, threads: out });
//     }
//   } catch (err) {
//     console.error('GET /helpCourse/threads error', err && (err.stack || err));
//     return res.status(500).json({ ok:false, error:'Server error' });
//   }
// });

// /**
//  * POST /api/helpCourse/threads
//  * Create a new thread with the first message:
//  * body: { text, toUserId? }  (toUserId: if you want to send directly to a specific user)
//  */
// router.post('/threads', requireAuth, async (req, res) => {
//   try {
//     const me = req.user;
//     if (!me) return res.status(401).json({ ok:false, error:'Auth required' });
//     const body = req.body || {};
//     const text = (body.text || '').trim();
//     if (!text) return res.status(400).json({ ok:false, error:'Text required' });

//     // new threadId
//     const threadId = String(body.threadId || ('HT-' + Date.now() + '-' + uuidv4()));

//     const toUserId = body.toUserId || null;
//     const toAdmin = !!body.toAdmin || false; // if want to route to admin

//     const msg = new HelpMsg({
//       threadId,
//       fromUserId: me._id,
//       toAdmin: toAdmin,
//       toUserId: toUserId || null,
//       text,
//       read: false,
//       createdAt: new Date()
//     });

//     await msg.save();

//     // Emit socket event: notify admin(s) if toAdmin or broadcast for course help
//     try {
//       const io = req.app && req.app.get && req.app.get('io');
//       if (io) {
//         // notify admins channel and user inbox
//         if (toAdmin) io.emit('helpCourse:new', { threadId, messageId: msg._id });
//         io.to('user:' + String(me._id)).emit('helpCourse:new', msg);
//         // update counts for frontend badges
//         const checking = await require('../models/Purchase').countDocuments({ status: 'checking' }).catch(()=>0);
//         const helpUnread = await HelpMsg.countDocuments({ toAdmin: true, read: false }).catch(()=>0);
//         io.emit('notification.checking_count_update', { count: checking });
//         io.emit('notification.help_count_update', { count: helpUnread });
//       }
//     } catch (e) {
//       console.warn('helpCourse socket emit failed', e && e.message ? e.message : e);
//     }

//     return res.json({ ok:true, thread: { threadId }, message: msg });
//   } catch (err) {
//     console.error('POST /helpCourse/threads error', err && (err.stack || err));
//     return res.status(500).json({ ok:false, error:'Server error' });
//   }
// });

// /**
//  * GET /api/helpCourse/threads/:id
//  * returns { ok:true, threadId, messages: [...] }
//  */
// router.get('/threads/:id', requireAuth, async (req, res) => {
//   try {
//     const threadId = req.params.id;
//     if (!threadId) return res.status(400).json({ ok:false, error:'Invalid thread id' });

//     // load messages in chronological order
//     const msgs = await HelpMsg.find({ threadId }).sort({ createdAt: 1 }).lean().exec();
//     if (!msgs || !msgs.length) return res.status(404).json({ ok:false, error:'Thread not found' });

//     // permission check: admin or participant
//     const me = req.user;
//     const isAdmin = (String((me.role||'')).toLowerCase() === 'admin');
//     if (!isAdmin) {
//       const participant = msgs.some(m => String(m.fromUserId) === String(me._id) || String(m.toUserId) === String(me._id));
//       if (!participant) return res.status(403).json({ ok:false, error:'Forbidden' });
//     }

//     return res.json({ ok:true, threadId, messages: msgs });
//   } catch (err) {
//     console.error('GET /helpCourse/threads/:id error', err && (err.stack || err));
//     return res.status(500).json({ ok:false, error:'Server error' });
//   }
// });

// /**
//  * POST /api/helpCourse/threads/:id/messages
//  * Post a message to an existing thread.
//  * body: { text, toAdmin?, toUserId? }
//  */
// router.post('/threads/:id/messages', requireAuth, async (req, res) => {
//   try {
//     const threadId = req.params.id;
//     if (!threadId) return res.status(400).json({ ok:false, error:'Invalid thread id' });

//     const body = req.body || {};
//     const text = (body.text || '').trim();
//     if (!text) return res.status(400).json({ ok:false, error:'Text required' });

//     // Ensure thread exists (at least one message)
//     const exists = await HelpMsg.findOne({ threadId }).lean().exec();
//     if (!exists) return res.status(404).json({ ok:false, error:'Thread not found' });

//     const me = req.user;
//     const isAdmin = (String((me.role||'')).toLowerCase() === 'admin');

//     const toAdmin = (typeof body.toAdmin === 'boolean') ? body.toAdmin : (!isAdmin && true); // by default user messages go to admin
//     const toUserId = body.toUserId || (isAdmin ? exists.fromUserId : null);

//     // permission: if non-admin trying to message other user's thread, ensure they are participant
//     if (!isAdmin) {
//       // allow if user is the thread owner or recipient
//       const isParticipant = (String(exists.fromUserId) === String(me._id)) || (exists.toUserId && String(exists.toUserId) === String(me._id));
//       if (!isParticipant) return res.status(403).json({ ok:false, error:'Forbidden' });
//     }

//     const msg = new HelpMsg({
//       threadId,
//       fromUserId: me._id,
//       toAdmin: !!toAdmin,
//       toUserId: toUserId ? toUserId : null,
//       text,
//       read: false,
//       createdAt: new Date()
//     });

//     await msg.save();

//     // Socket emits: notify admins or recipient and update counts
//     try {
//       const io = req.app && req.app.get && req.app.get('io');
//       if (io) {
//         if (msg.toAdmin) {
//           io.emit('helpCourse:new', { threadId, messageId: msg._id, for: 'admin' });
//         }
//         if (msg.toUserId) {
//           io.to('user:' + String(msg.toUserId)).emit('helpCourse:new', msg);
//         }
//         // always notify sender
//         io.to('user:' + String(me._id)).emit('helpCourse:new', msg);

//         // update counts
//         const checking = await require('../models/Purchase').countDocuments({ status: 'checking' }).catch(()=>0);
//         const helpUnread = await HelpMsg.countDocuments({ toAdmin: true, read: false }).catch(()=>0);
//         io.emit('notification.checking_count_update', { count: checking });
//         io.emit('notification.help_count_update', { count: helpUnread });
//       }
//     } catch (e) {
//       console.warn('helpCourse emit failed', e && e.message ? e.message : e);
//     }

//     return res.json({ ok:true, message: msg });
//   } catch (err) {
//     console.error('POST /helpCourse/threads/:id/messages error', err && (err.stack || err));
//     return res.status(500).json({ ok:false, error:'Server error' });
//   }
// });

// /**
//  * POST /api/helpCourse/threads/:id/read
//  * Mark messages in thread as read for the current actor.
//  */
// router.post('/threads/:id/read', requireAuth, async (req, res) => {
//   try {
//     const threadId = req.params.id;
//     if (!threadId) return res.status(400).json({ ok:false, error:'Invalid thread id' });

//     const me = req.user;
//     const isAdmin = (String((me.role||'')).toLowerCase() === 'admin');

//     if (isAdmin) {
//       // mark any messages addressed to admin in this thread as read
//       await HelpMsg.updateMany({ threadId, toAdmin: true, read: false }, { $set: { read: true } }).exec();
//     } else {
//       // mark messages sent to this user as read
//       await HelpMsg.updateMany({ threadId, toUserId: me._id, read: false }, { $set: { read: true } }).exec();
//     }

//     // emit counts update
//     try {
//       const io = req.app && req.app.get && req.app.get('io');
//       if (io) {
//         const helpUnread = await HelpMsg.countDocuments({ toAdmin: true, read: false }).catch(()=>0);
//         io.emit('notification.help_count_update', { count: helpUnread });
//       }
//     } catch (e) { console.warn('helpCourse count emit failed', e && e.message ? e.message : e); }

//     return res.json({ ok:true });
//   } catch (err) {
//     console.error('POST /helpCourse/threads/:id/read error', err && (err.stack || err));
//     return res.status(500).json({ ok:false, error:'Server error' });
//   }
// });

// module.exports = router;

// backend/routes/helpCourse.js
'use strict';
const express = require('express');
const router = express.Router();

const HelpThread = require('../models/HelpThread');
const auth = require('../middleware/auth');
const requireAuth = auth && auth.requireAuth ? auth.requireAuth : auth;
const requireAdmin = auth && auth.requireAdmin ? auth.requireAdmin : (req,res,next)=>res.status(403).json({ ok:false, error:'Forbidden' });

// create a new thread
router.post('/threads', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.userId && !req.user) return res.status(400).json({ ok:false, error: 'user required' });
    const thread = new HelpThread({
      courseId: body.courseId || null,
      userId: body.userId || req.user._id,
      subject: body.subject || '',
      messages: []
    });
    if (body.message) thread.messages.push({ fromUserId: req.user._id, text: body.message, toAdmin: true, read: false });
    await thread.save();

    // emit to admins via socket if available
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.to('role:admin').emit('help:new_thread', { threadId: thread._id });
    } catch(e){}

    return res.json({ ok:true, thread });
  } catch (err) {
    console.error('POST /help/threads error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// add message to thread
router.post('/threads/:id/messages', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const thread = await HelpThread.findById(id);
    if (!thread) return res.status(404).json({ ok:false, error: 'Thread not found' });

    const msg = { fromUserId: req.user._id, text: body.text || '', toAdmin: !!body.toAdmin, read: false };
    thread.messages.push(msg);
    await thread.save();

    // emit
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) {
        if (msg.toAdmin) io.to('role:admin').emit('help:new_message', { threadId: thread._id, message: msg });
        else io.to(String(thread.userId)).emit('help:reply', { threadId: thread._id, message: msg });
      }
    } catch(e){}

    return res.json({ ok:true, thread });
  } catch (err) {
    console.error('POST /help/threads/:id/messages error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// list threads (admin or user)
router.get('/threads', requireAuth, async (req, res) => {
  try {
    const isAdmin = (req.user && (req.user.role||'').toLowerCase() === 'admin');
    const q = {};
    if (!isAdmin) q.userId = req.user._id;
    const threads = await HelpThread.find(q).sort({ createdAt: -1 }).lean();
    return res.json({ ok:true, threads });
  } catch (err) {
    console.error('GET /help/threads error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// mark messages read (admin or user)
router.post('/threads/:id/read', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const isAdmin = (req.user && (req.user.role||'').toLowerCase() === 'admin');
    const thread = await HelpThread.findById(id);
    if (!thread) return res.status(404).json({ ok:false, error: 'Thread not found' });

    thread.messages = (thread.messages || []).map(m => {
      if (isAdmin && m.toAdmin) m.read = true;
      if (!isAdmin && String(m.fromUserId) === String(req.user._id)) m.read = true; // user marking own messages read
      return m;
    });
    await thread.save();
    return res.json({ ok:true, thread });
  } catch (err) {
    console.error('POST /help/threads/:id/read error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

module.exports = router;
