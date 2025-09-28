// backend/controllers/chatController.js
'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ChatMessage = require('../models/ChatMessage');
const ChatMute = require('../models/ChatMute');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const ClassModel = require('../models/Class');

const toObjId = id => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null);

// helper to build absolute URL for an uploaded filename
function buildUploadUrl(req, filename, subfolder = '') {
  if (!filename) return null;
  const host = req && req.get && req.get('host') ? `${req.protocol}://${req.get('host')}` : '';
  const pathPart = subfolder ? `/` + subfolder + `/${filename}` : `/${filename}`;
  // ensure we point to /uploads/... so express.static serves it
  return (host + '/uploads' + pathPart).replace(/\/+/g, '/').replace('http:\/', 'http://').replace('https:\/', 'https://');
}

// --- POST message with optional multipart files (multer will populate req.files) ---
exports.postMessage = async (req, res) => {
  try {
    const io = req.app.get('io'); // socket.io instance (if attached)
    const classId = req.params.classId;
    if (!classId || !mongoose.isValidObjectId(classId)) return res.status(400).json({ ok:false, message: 'Invalid classId' });

    const { text } = req.body || {};
    const files = req.files || []; // multer

    // check mute
    const mute = await ChatMute.findOne({ classId, userId: req.user._id }).lean();
    if (mute && (!mute.expiresAt || new Date(mute.expiresAt) > new Date())) {
      return res.status(403).json({ ok:false, message: 'You are muted in this chat' });
    }

    // build absolute media URLs and include subfolder 'chats'
    const media = (files || []).map(f => ({
      url: buildUploadUrl(req, f.filename, 'chats'), // absolute url
      filename: f.originalname,
      contentType: f.mimetype,
      size: f.size
    }));

    const msg = new ChatMessage({
      classId: toObjId(classId),
      senderId: toObjId(req.user._id),
      senderName: req.user.fullname || req.user.name || 'Unknown',
      senderRole: (req.user.role || 'student'),
      text: text || '',
      media
    });
    await msg.save();

    const out = await ChatMessage.findById(msg._id).lean();

    // emit via socket
    try {
      if (io) io.to(`class_${classId}`).emit('chat:newMessage', { message: out });
    } catch (e) { console.warn('socket emit error', e); }

    res.json({ ok:true, message: out });
  } catch (err) {
    console.error('postMessage', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};

// --- participants: robustly handle both class.studentIds or Student.classId references ---
exports.getParticipants = async (req, res) => {
  try {
    const classId = req.params.classId;
    if (!classId || !mongoose.isValidObjectId(classId)) return res.status(400).json({ ok:false, message: 'Invalid classId' });

    const cls = await ClassModel.findById(classId).lean();
    if (!cls) {
      // fallback: also try to find by custom classId string field (if you use that)
      return res.status(404).json({ ok:false, message: 'Class not found' });
    }

    // collect student ids if present
    let students = [];
    if (Array.isArray(cls.studentIds) && cls.studentIds.length) {
      const sIds = cls.studentIds.map(x => mongoose.isValidObjectId(x) ? new mongoose.Types.ObjectId(String(x)) : null).filter(Boolean);
      if (sIds.length) students = await Student.find({ _id: { $in: sIds } }).lean();
    }

    // If class has no studentIds or query returned empty, attempt to find students by student.classId field
    if ((!students || !students.length)) {
      try {
        const found = await Student.find({ classId: toObjId(classId) }).lean().catch(()=>[]);
        if (Array.isArray(found) && found.length) students = found;
      } catch (e) {
        // ignore
      }
    }

    // load teachers if teacherIds present; also handle teacher references in class.teacherIds
    const teacherIds = (cls.teacherIds || []).map(x => mongoose.isValidObjectId(x) ? new mongoose.Types.ObjectId(String(x)) : null).filter(Boolean);
    let teachers = [];
    if (teacherIds.length) teachers = await Teacher.find({ _id: { $in: teacherIds } }).lean();

    const mapped = (students || []).map(s => ({
      _id: s._id,
      fullname: s.fullname || (s.name || ''),
      numberId: s.numberId || '',
      photo: s.photo ? (req.protocol + '://' + req.get('host') + '/uploads/' + (s.photo)) : null
    }));

    res.json({ ok:true, participants: mapped, teachers: (teachers || []).map(t => ({ _id: t._id, fullname: t.fullname || t.name || '' })) });
  } catch (err) {
    console.error('getParticipants', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};

// --- getMedia: returns list of media objects with absolute URLs ---
exports.getMedia = async (req, res) => {
  try {
    const classId = req.params.classId;
    if (!classId || !mongoose.isValidObjectId(classId)) return res.status(400).json({ ok:false, message: 'Invalid classId' });

    const mediaAgg = await ChatMessage.aggregate([
      { $match: { classId: new mongoose.Types.ObjectId(classId), deleted: false, media: { $exists: true, $ne: [] } } },
      { $unwind: '$media' },
      { $project: { url: '$media.url', filename: '$media.filename', contentType: '$media.contentType', createdAt: '$createdAt' } },
      { $sort: { createdAt: -1 } }
    ]);

    const hostBase = req.protocol + '://' + req.get('host');
    const normalized = mediaAgg.map(m => {
      const u = (m.url || '');
      if (!u.startsWith('http')) {
        return { ...m, url: (u.startsWith('/') ? hostBase + u : hostBase + '/' + u) };
      }
      return m;
    });

    res.json({ ok:true, media: normalized });
  } catch (err) {
    console.error('getMedia', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};

// --- list classes for manager (updated: return only classes owned/related to current manager) ---
exports.listClassesForManager = async (req, res) => {
  try {
    const role = (req.user && req.user.role || '').toLowerCase();
    let classes = [];

    // admin sees everything
    if (role === 'admin') {
      classes = await ClassModel.find({}).lean();
    } else {
      // manager/teacher: try to find classes that belong to this manager (robust: check multiple possible owner fields)
      const uid = req.user && req.user._id ? req.user._id : null;
      const or = [];

      if (uid) {
        // common owner fields - cover many possible schemas
        const ownerFields = ['managerId','ownerId','createdBy','createdById','manager','creator'];
        ownerFields.forEach(f => {
          // the field might be stored as ObjectId or string; using direct match is OK for Mongo
          const c = {};
          c[f] = uid;
          or.push(c);
        });

        // also include teacherIds array membership
        or.push({ teacherIds: { $elemMatch: { $eq: uid } } });

        // if nothing matched above (schema very different), fallback to classes where class.systemOwner === uid etc.
        // (we keep this open so if you ever add a different owner field it will be matched)
      }

      if (or.length) {
        classes = await ClassModel.find({ $or: or }).lean();
      } else {
        // no uid or no conditions: return empty set for non-admins
        classes = [];
      }
    }

    // compute counts for only the returned classes
    const classIds = (classes || []).map(c => c._id).filter(Boolean);
    let counts = [];
    if (classIds.length) {
      counts = await ChatMessage.aggregate([
        { $match: { classId: { $in: classIds }, deleted: false } },
        { $group: { _id: '$classId', count: { $sum: 1 }, lastAt: { $max: '$createdAt' } } }
      ]);
    }
    const countMap = new Map((counts || []).map(c => [String(c._id), c]));

    const out = (classes || []).map(c => ({
      _id: c._id,
      name: c.name || c.classId || '',
      classId: c.classId || '',
      studentsCount: Array.isArray(c.studentIds) ? c.studentIds.length : 0,
      chatCount: (countMap.get(String(c._id)) || {}).count || 0,
      lastActivity: (countMap.get(String(c._id)) || {}).lastAt || c.updatedAt || c.createdAt
    }));

    res.json({ ok:true, classes: out });
  } catch (err) {
    console.error('listClassesForManager', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};

// --- list messages (descending -> reversed to ascending before return) ---
exports.listMessages = async (req, res) => {
  try {
    const classId = req.params.classId;
    if (!classId || !mongoose.isValidObjectId(classId)) return res.status(400).json({ ok:false, message: 'Invalid classId' });

    const limit = Math.min(200, Math.max(20, parseInt(req.query.limit || 100, 10)));
    const before = req.query.before ? new Date(req.query.before) : null;

    const q = { classId: new mongoose.Types.ObjectId(classId), deleted: false };
    if (before) q.createdAt = { $lt: before };

    const messages = await ChatMessage.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    messages.reverse();
    res.json({ ok:true, messages });
  } catch (err) {
    console.error('listMessages', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};

// helper to remove file path (async)
async function unlinkIfExists(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath);
      return true;
    }
  } catch (e) {
    console.warn('unlinkIfExists error', filepath, e && e.message ? e.message : e);
  }
  return false;
}

// --- delete message and files ---
exports.deleteMessage = async (req, res) => {
  try {
    const io = req.app.get('io');
    const msgId = req.params.messageId;
    if (!msgId || !mongoose.isValidObjectId(msgId)) return res.status(400).json({ ok:false, message: 'Invalid message id' });

    const msg = await ChatMessage.findById(msgId);
    if (!msg) return res.status(404).json({ ok:false, message: 'Message not found' });

    const role = (req.user.role || '').toLowerCase();
    let allowed = false;
    if (role === 'admin' || role === 'manager') allowed = true;
    else if (role === 'teacher') {
      const Teacher = require('../models/Teacher');
      const t = await Teacher.findById(req.user._id).lean().catch(()=>null);
      if (t && Array.isArray(t.classIds) && t.classIds.map(String).includes(String(msg.classId))) allowed = true;
    } else if (role === 'student' || role === 'parent') {
      if (String(msg.senderId) === String(req.user._id)) allowed = true;
    }

    if (!allowed) return res.status(403).json({ ok:false, message: 'Forbidden' });

    // attempt to remove files from disk
    try {
      if (Array.isArray(msg.media) && msg.media.length) {
        const uploadsRoot = path.join(__dirname, '..', 'uploads');
        for (const m of msg.media) {
          if (!m || !m.url) continue;
          const url = String(m.url);
          const idx = url.indexOf('/uploads/');
          if (idx !== -1) {
            const rel = url.slice(idx + '/uploads/'.length); // e.g. chats/filename.jpg
            const full = path.join(uploadsRoot, rel);
            await unlinkIfExists(full);
          } else {
            const possible = path.join(uploadsRoot, 'chats', path.basename(url));
            await unlinkIfExists(possible);
          }
        }
      }
    } catch (e) {
      console.warn('deleteMessage: could not remove media files', e && e.message ? e.message : e);
    }

    msg.deleted = true;
    msg.text = '[deleted]';
    msg.media = [];
    await msg.save();

    if (io) io.to(`class_${String(msg.classId)}`).emit('chat:deleteMessage', { messageId: String(msg._id) });

    res.json({ ok:true });
  } catch (err) {
    console.error('deleteMessage', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};

// --- react to message: ensure string comparisons for userIds, return reactions ---
exports.reactToMessage = async (req, res) => {
  try {
    const io = req.app.get('io');
    const msgId = req.params.messageId;
    const { emoji } = req.body || {};
    if (!msgId || !mongoose.isValidObjectId(msgId)) return res.status(400).json({ ok:false, message: 'Invalid id' });
    if (!emoji) return res.status(400).json({ ok:false, message: 'emoji required' });

    const msg = await ChatMessage.findById(msgId);
    if (!msg) return res.status(404).json({ ok:false, message: 'Message not found' });

    // normalize reactions array and userIds as strings
    msg.reactions = msg.reactions || [];

    let reaction = msg.reactions.find(r => String(r.emoji) === String(emoji));
    if (!reaction) {
      // push new reaction object; store userIds as ObjectId
      msg.reactions.push({ emoji: String(emoji), userIds: [toObjId(req.user._id)] });
    } else {
      // ensure userIds exist as strings/ids
      const idx = (reaction.userIds || []).findIndex(u => String(u) === String(req.user._id));
      if (idx === -1) reaction.userIds.push(toObjId(req.user._id));
      else reaction.userIds.splice(idx,1); // toggle
      // apply back
      msg.reactions = msg.reactions.map(r => (String(r.emoji) === String(emoji) ? reaction : r));
    }

    await msg.save();

    // return fresh reactions as plain objects (convert ObjectId counts)
    const out = await ChatMessage.findById(msgId).lean();
    const reactionsForEmit = (out.reactions || []).map(r => ({ emoji: r.emoji, userIds: (r.userIds || []).map(x => String(x)) }));

    if (io) io.to(`class_${String(msg.classId)}`).emit('chat:react', { messageId: String(msg._id), reactions: reactionsForEmit });

    res.json({ ok:true, reactions: reactionsForEmit });
  } catch (err) {
    console.error('reactToMessage', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};

// --- reply to message: now also creates a new chat message so the reply appears in the stream ---
exports.replyToMessage = async (req, res) => {
  try {
    const io = req.app.get('io');
    const msgId = req.params.messageId;
    const { text } = req.body || {};
    if (!msgId || !mongoose.isValidObjectId(msgId)) return res.status(400).json({ ok:false, message: 'Invalid id' });
    if (!text) return res.status(400).json({ ok:false, message: 'text required' });

    const msg = await ChatMessage.findById(msgId);
    if (!msg) return res.status(404).json({ ok:false, message: 'Message not found' });

    // add reply entry to original message (so that threaded view still exists)
    const reply = {
      senderId: toObjId(req.user._id),
      senderName: req.user.fullname || req.user.name || '',
      text
    };
    msg.replies = msg.replies || [];
    msg.replies.push(reply);
    await msg.save();

    // create a new top-level ChatMessage so the reply appears in the stream as a "regular" message
    // text will include a short quoted header so users know who was replied to
    const quotedHeader = `Reply to ${msg.senderName || 'Unknown'}:`;
    const newMsg = new ChatMessage({
      classId: toObjId(msg.classId),
      senderId: toObjId(req.user._id),
      senderName: req.user.fullname || req.user.name || '',
      senderRole: (req.user.role || 'student'),
      text: `${quotedHeader} ${text}`,
      media: [] // replies usually don't carry media by default; you can adjust if you want attachments with replies
    });
    await newMsg.save();

    // emit both: new message (so reply appears in chat) and chat:reply (so UI that uses replies array updates)
    const outNew = await ChatMessage.findById(newMsg._id).lean();
    const outOriginal = await ChatMessage.findById(msgId).lean();

    try {
      if (io) {
        // new message for stream
        io.to(`class_${String(msg.classId)}`).emit('chat:newMessage', { message: outNew });
        // update replies on original
        io.to(`class_${String(msg.classId)}`).emit('chat:reply', { messageId: String(msg._id), replies: outOriginal.replies || [] });
      }
    } catch (e) {
      console.warn('socket emit error (reply)', e);
    }

    // return data: new message object and updated replies
    res.json({ ok:true, message: outNew, replies: outOriginal.replies || [] });
  } catch (err) {
    console.error('replyToMessage', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};


// --- mute/unmute (keeps same behavior) ---
exports.muteUser = async (req, res) => {
  try {
    const io = req.app.get('io');
    const { classId } = req.params;
    const { userId, duration, reason } = req.body || {};
    if (!classId || !mongoose.isValidObjectId(classId)) return res.status(400).json({ ok:false, message: 'Invalid classId' });
    if (!userId || !mongoose.isValidObjectId(userId)) return res.status(400).json({ ok:false, message: 'Invalid userId' });

    const role = (req.user.role || '').toLowerCase();
    let allowed = role === 'manager' || role === 'admin';
    if (!allowed && role === 'teacher') {
      const Teacher = require('../models/Teacher');
      const t = await Teacher.findById(req.user._id).lean().catch(()=>null);
      if (t && Array.isArray(t.classIds) && t.classIds.map(String).includes(String(classId))) allowed = true;
    }
    if (!allowed) return res.status(403).json({ ok:false, message: 'Forbidden' });

    let expiresAt = null;
    if (duration && typeof duration === 'string') {
      const now = new Date();
      if (duration === 'hour') expiresAt = new Date(now.getTime() + 1000*60*60);
      else if (duration === 'day') expiresAt = new Date(now.getTime() + 1000*60*60*24);
      else if (duration === 'month') expiresAt = new Date(now.getTime() + 1000*60*60*24*30);
      else if (duration === 'year') expiresAt = new Date(now.getTime() + 1000*60*60*24*365);
      else {
        const asNum = Number(duration);
        if (!isNaN(asNum)) expiresAt = new Date(now.getTime() + asNum);
      }
    }
    const existing = await ChatMute.findOne({ classId, userId }).catch(()=>null);
    if (existing) {
      existing.mutedBy = req.user._id;
      existing.reason = reason || existing.reason;
      existing.expiresAt = expiresAt;
      await existing.save();
    } else {
      const m = new ChatMute({ classId, userId, mutedBy: req.user._id, reason, expiresAt });
      await m.save();
    }
    if (io) io.to(`class_${String(classId)}`).emit('chat:mute', { classId, userId, expiresAt });
    res.json({ ok:true, expiresAt });
  } catch (err) {
    console.error('muteUser', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};

exports.unmuteUser = async (req, res) => {
  try {
    const io = req.app.get('io');
    const { classId } = req.params;
    const { userId } = req.body || {};
    if (!classId || !mongoose.isValidObjectId(classId)) return res.status(400).json({ ok:false, message: 'Invalid classId' });
    if (!userId || !mongoose.isValidObjectId(userId)) return res.status(400).json({ ok:false, message: 'Invalid userId' });

    const role = (req.user.role || '').toLowerCase();
    let allowed = role === 'manager' || role === 'admin';
    if (!allowed && role === 'teacher') {
      const Teacher = require('../models/Teacher');
      const t = await Teacher.findById(req.user._id).lean().catch(()=>null);
      if (t && Array.isArray(t.classIds) && t.classIds.map(String).includes(String(classId))) allowed = true;
    }
    if (!allowed) return res.status(403).json({ ok:false, message: 'Forbidden' });

    await ChatMute.deleteMany({ classId, userId });
    if (io) io.to(`class_${String(classId)}`).emit('chat:unmute', { classId, userId });
    res.json({ ok:true });
  } catch (err) {
    console.error('unmuteUser', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};

// --- unread counts (can be improved to use a "seen" collection server-side) ---
exports.getUnreadCounts = async (req, res) => {
  try {
    const classId = req.query.classId;
    if (!classId) return res.status(400).json({ ok:false, message: 'classId required' });
    if (!mongoose.isValidObjectId(classId)) return res.status(400).json({ ok:false, message: 'Invalid classId' });

    const since = req.query.since ? new Date(req.query.since) : null;
    const q = { classId: new mongoose.Types.ObjectId(classId), deleted: false };
    if (since) q.createdAt = { $gt: since };
    const count = await ChatMessage.countDocuments(q);
    res.json({ ok:true, count });
  } catch (err) {
    console.error('getUnreadCounts', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
};
