// backend/routes/notices.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const Notice = require('../models/Notice');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

/* -------------------- helpers -------------------- */// helpers near top of backend/routes/notices.js

// helpers near top of backend/routes/notices.js
function isObjectIdString(s) {
  return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s);
}
function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// return a real ObjectId when possible (use 'new'!)
function toObjectIdIfPossible(id) {
  try {
    const s = String(id || '');
    if (isObjectIdString(s)) return new mongoose.Types.ObjectId(s);
  } catch (e) { /* ignore */ }
  return id;
}
function ensureRecipientIdsAreObjectIds(recipientsArray = []) {
  return recipientsArray.map(rp => {
    const copy = Object.assign({}, rp);
    try {
      const sid = String(copy.userId || '');
      if (isObjectIdString(sid)) copy.userId = new mongoose.Types.ObjectId(sid);
    } catch (e) { /* leave as-is */ }
    return copy;
  });
}



/**
 * resolveRecipients({ targetRoles, explicitUserIds, schoolId })
 * returns array of { userId, role }
 */
async function resolveRecipients({ targetRoles = [], explicitUserIds = [], schoolId }) {
  const recipients = [];
  const seen = new Set();

  explicitUserIds = Array.isArray(explicitUserIds) ? explicitUserIds.map(x => (x || '').toString().trim()).filter(Boolean) : [];
  targetRoles = Array.isArray(targetRoles) ? targetRoles.map(t => (t || '').toString().trim().toLowerCase()).filter(Boolean) : [];

  // explicit _ids
  if (explicitUserIds.length) {
    const objectIds = explicitUserIds.filter(isObjectIdString).map(id => new mongoose.Types.ObjectId(id));
    if (objectIds.length) {
      const [uUsers, uStudents, uTeachers] = await Promise.all([
        User.find({ _id: { $in: objectIds } }).select('_id role').lean().exec().catch(() => []),
        Student.find({ _id: { $in: objectIds } }).select('_id').lean().exec().catch(() => []),
        Teacher.find({ _id: { $in: objectIds } }).select('_id').lean().exec().catch(() => [])
      ]);
      uUsers.forEach(u => { const sid = String(u._id); if (!seen.has(sid)) { seen.add(sid); recipients.push({ userId: u._id, role: u.role || null }); }});
      uStudents.forEach(s => { const sid = String(s._id); if (!seen.has(sid)) { seen.add(sid); recipients.push({ userId: s._id, role: 'student' }); }});
      uTeachers.forEach(t => { const sid = String(t._id); if (!seen.has(sid)) { seen.add(sid); recipients.push({ userId: t._id, role: 'teacher' }); }});
    }

    // non-id tokens - search fields
    const nonIds = explicitUserIds.filter(x => !isObjectIdString(x));
    if (nonIds.length) {
      const fields = ['studentNumber','studentNo','numberId','studentId','email','username','fullname','name'];
      const orClauses = [];
      nonIds.forEach(token => {
        const re = new RegExp('^' + escapeRegex(token) + '$', 'i');
        fields.forEach(f => orClauses.push({ [f]: re }));
      });
      if (orClauses.length) {
        const [users, students, teachers] = await Promise.all([
          User.find({ $or: orClauses }).select('_id role').lean().exec().catch(() => []),
          Student.find({ $or: orClauses }).select('_id').lean().exec().catch(() => []),
          Teacher.find({ $or: orClauses }).select('_id').lean().exec().catch(() => [])
        ]);
        users.forEach(u => { const sid = String(u._id); if (!seen.has(sid)) { seen.add(sid); recipients.push({ userId: u._id, role: u.role || null }); }});
        students.forEach(s => { const sid = String(s._id); if (!seen.has(sid)) { seen.add(sid); recipients.push({ userId: s._id, role: 'student' }); }});
        teachers.forEach(t => { const sid = String(t._id); if (!seen.has(sid)) { seen.add(sid); recipients.push({ userId: t._id, role: 'teacher' }); }});
      }
    }
  }

  // role-based resolution
  if (targetRoles.includes('student')) {
    const q = schoolId ? { schoolId } : {};
    const students = await Student.find(q).select('_id').lean().exec().catch(() => []);
    students.forEach(s => { const sid = String(s._id); if (!seen.has(sid)) { seen.add(sid); recipients.push({ userId: s._id, role: 'student' }); }});
  }
  if (targetRoles.includes('teacher')) {
    const q = schoolId ? { schoolId } : {};
    const teachers = await Teacher.find(q).select('_id').lean().exec().catch(() => []);
    teachers.forEach(t => { const sid = String(t._id); if (!seen.has(sid)) { seen.add(sid); recipients.push({ userId: t._id, role: 'teacher' }); }});
  }

  // other roles (manager/admin) -> search User
  const otherRoles = targetRoles.filter(r => !['student','teacher'].includes(r));
  if (otherRoles.length) {
    const roleRegex = otherRoles.map(r => new RegExp('^' + escapeRegex(r) + '$', 'i'));
    let users = [];
    if (schoolId) {
      try {
        users = await User.find({
          schoolId,
          $or: [{ role: { $in: roleRegex } }, { roles: { $in: roleRegex } }, { 'profile.role': { $in: roleRegex } }]
        }).select('_id role').lean().exec();
      } catch (_) { users = []; }
    }
    if (!users || users.length === 0) {
      users = await User.find({ $or: [{ role: { $in: roleRegex } }, { roles: { $in: roleRegex } }, { 'profile.role': { $in: roleRegex } }] }).select('_id role').lean().exec().catch(() => []);
    }
    users.forEach(u => { const sid = String(u._id); if (!seen.has(sid)) { seen.add(sid); recipients.push({ userId: u._id, role: u.role || null }); }});
  }

  console.info('resolveRecipients -> explicit:', explicitUserIds, 'targetRoles:', targetRoles, 'schoolId:', schoolId, 'resolvedCount:', recipients.length);
  return recipients;
}

/* debug */
router.post('/debug/resolve', auth, async (req, res) => {
  try {
    const { targetRoles = [], explicitUserIds = [] } = req.body || {};
    const recs = await resolveRecipients({ targetRoles, explicitUserIds, schoolId: req.user && req.user.schoolId ? req.user.schoolId : null });
    return res.json({ ok:true, requested: { targetRoles, explicitUserIds }, resolvedCount: recs.length, resolved: recs.slice(0,200) });
  } catch (err) {
    console.error('DEBUG /notices/debug/resolve', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/* Create notice */
router.post('/', auth, roles(['manager','admin']), async (req, res) => {
  try {
    const { title, body, targetRoles = [], explicitUserIds = [] } = req.body || {};
    if (!title) return res.status(400).json({ ok:false, message: 'Title required' });

    const schoolId = req.user && req.user.schoolId ? req.user.schoolId : null;
    let recipients = await resolveRecipients({ targetRoles, explicitUserIds, schoolId });

    if (!recipients || recipients.length === 0) {
      return res.status(400).json({ ok:false, message: 'No recipients found. Try a different role or explicit ids (check studentNumber/email/username).' });
    }

    // ensure sender included
    try {
      const senderIdStr = String(req.user._id);
      const hasSender = recipients.some(rp => String(rp.userId) === senderIdStr);
      if (!hasSender) {
        // use toObjectIdIfPossible / or new ObjectId
        const uid = isObjectIdString(senderIdStr) ? new mongoose.Types.ObjectId(senderIdStr) : senderIdStr;
        recipients.push({ userId: uid, role: req.user.role || 'manager' });
      }
    } catch (e) {
      console.warn('Could not ensure sender in recipients:', e && e.stack ? e.stack : e);
    }

    const restrictReplies = (String(req.user.role||'').toLowerCase() === 'admin'
      && Array.isArray(targetRoles) && targetRoles.some(r => String(r).toLowerCase() === 'manager'));

    // normalize recipient userId values (convert string-looking ids to ObjectId)
    recipients = ensureRecipientIdsAreObjectIds(recipients);

    const notice = new Notice({
      sender: toObjectIdIfPossible(req.user._id),
      senderName: req.user.fullname || req.user.name || (req.user.email || '').split('@')[0],
      title,
      body,
      schoolId,
      recipients,
      targetRoles,
      restrictReplies,
      replies: []
    });

    await notice.save();
    return res.json({ ok:true, notice });
  } catch (err) {
    console.error('POST /notices', err && (err.stack || err));
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/* List notices (inbox or sent) */
router.get('/', auth, async (req, res) => {
  try {
    const box = (req.query.box || 'inbox').toLowerCase();
    if (box === 'sent') {
      const items = await Notice.find({ sender: toObjectIdIfPossible(req.user._id) }).sort({ createdAt: -1 }).lean();
      return res.json({ ok:true, notices: items });
    }
    const items = await Notice.find({
      $or: [
        { 'recipients.userId': toObjectIdIfPossible(req.user._id) },
        { sender: toObjectIdIfPossible(req.user._id) }
      ]
    }).sort({ createdAt: -1 }).lean();
    return res.json({ ok:true, notices: items });
  } catch (err) {
    console.error('GET /notices', err && (err.stack || err));
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/* unread count */
router.get('/unread-count', auth, async (req, res) => {
  try {
    const items = await Notice.aggregate([
      { $match: { 'recipients.userId': toObjectIdIfPossible(req.user._id) } },
      { $project: { recipients: 1 } },
      { $unwind: '$recipients' },
      { $match: { 'recipients.userId': toObjectIdIfPossible(req.user._id), 'recipients.readAt': null } },
      { $count: 'cnt' }
    ]);
    const cnt = (items && items[0] && items[0].cnt) ? items[0].cnt : 0;
    res.json({ ok:true, unread: cnt });
  } catch (err) {
    console.error('GET /notices/unread-count', err && (err.stack || err));
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/* mark-read-all */
router.post('/mark-read-all', auth, async (req, res) => {
  try {
    await Notice.updateMany(
      { 'recipients.userId': toObjectIdIfPossible(req.user._id), 'recipients.readAt': null },
      { $set: { 'recipients.$[elem].readAt': new Date() } },
      { arrayFilters: [{ 'elem.userId': toObjectIdIfPossible(req.user._id), 'elem.readAt': null }], multi: true }
    );
    res.json({ ok:true });
  } catch (err) {
    console.error('POST /notices/mark-read-all', err && (err.stack || err));
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/* GET single notice (permission-aware) */
router.get('/:id', auth, async (req, res) => {
  try {
    const n = await Notice.findById(req.params.id).lean();
    if (!n) return res.status(404).json({ ok:false, message: 'Not found' });

    // mark read if requested
    const shouldMark = req.query.markRead === '1' || req.query.markRead === 'true';
    if (shouldMark) {
      await Notice.updateOne(
        { _id: n._id, 'recipients.userId': toObjectIdIfPossible(req.user._id), 'recipients.readAt': null },
        { $set: { 'recipients.$.readAt': new Date() } }
      );
      // update local copy so clients that depend on returned object see readAt
      if (Array.isArray(n.recipients)) {
        const rp = n.recipients.find(rp => String(rp.userId) === String(req.user._id));
        if (rp) rp.readAt = new Date();
      }
    }

    const requesterRole = (req.user && req.user.role || '').toLowerCase();
    const isSender = String(n.sender || '') === String(req.user._id);
    const isPrivileged = requesterRole === 'admin' || requesterRole === 'manager';

    // normalize recipients' ids to string for membership tests
    const recIds = (n.recipients || []).map(r => String(r.userId)).filter(Boolean);

    // is the requester a listed recipient?
    const youAreRecipient = recIds.includes(String(req.user._id));

    // business rule: restrictReplies on notice prevents non-privileged recipients from replying/seeing replies
    const recipientsCanReply = !n.restrictReplies;

    // who can reply: only privileged users (admin/manager) or the original sender
    const canReply = isPrivileged || isSender;

    // privileged users (admins/managers) and senders get expanded recipient data and full replies
    if (isPrivileged || isSender) {
      // expand recipients into readable shapes
      const idsToLookup = recIds;
      const [users, students, teachers] = await Promise.all([
        User.find({ _id: { $in: idsToLookup } }).select('_id fullname email username studentNumber role').lean().exec().catch(()=>[]),
        Student.find({ _id: { $in: idsToLookup } }).select('_id fullname email username studentNumber').lean().exec().catch(()=>[]),
        Teacher.find({ _id: { $in: idsToLookup } }).select('_id fullname email username employeeNumber').lean().exec().catch(()=>[])
      ]);
      const map = new Map();
      users.forEach(u => map.set(String(u._id), u));
      students.forEach(s => map.set(String(s._id), s));
      teachers.forEach(t => map.set(String(t._id), t));

      const recipientsExpanded = (n.recipients || []).map(rp => {
        const idStr = String(rp.userId || '');
        const src = map.get(idStr) || null;
        const studentNumber = (src && (src.studentNumber || src.numberId || src.studentId)) || null;
        const username = (src && (src.username || src.email)) || null;
        const fullname = (src && (src.fullname || src.name)) || null;
        const display = studentNumber || username || fullname || (idStr ? idStr.slice(-8) : '');
        return {
          userId: rp.userId,
          role: rp.role || null,
          readAt: rp.readAt || null,
          displayName: display,
          studentNumber: studentNumber || null,
          fullname: fullname || null,
          username: username || null
        };
      });

      const replies = Array.isArray(n.replies) ? n.replies.map(rp => ({
        text: rp.text,
        author: rp.author,
        authorName: rp.authorName,
        createdAt: rp.createdAt
      })) : [];

      return res.json({
        ok: true,
        notice: n,
        recipients: recipientsExpanded,
        recipientsCount: recipientsExpanded.length,
        replies,
        youAreRecipient,
        canReply
      });
    }

    // Non-privileged (student/teacher) branch: do NOT expose recipients list and do NOT expose replies
    return res.json({
      ok: true,
      notice: (function(){ const copy = Object.assign({}, n); delete copy.recipients; return copy; })(),
      youAreRecipient,
      recipientsCount: (n.recipients || []).length,
      replies: [], // hide replies from non-privileged
      canReply: false
    });
  } catch (err) {
    console.error('GET /notices/:id', err && (err.stack || err));
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});


/* Reply to a notice - persist replies */
router.post('/:id/reply', auth, async (req, res) => {
  try {
    const n = await Notice.findById(req.params.id);
    if (!n) return res.status(404).json({ ok:false, message: 'Not found' });

    // normalize recipients in memory to compare
    const recIds = (n.recipients || []).map(r => String(r.userId)).filter(Boolean);
    const youAreRecipient = recIds.includes(String(req.user._id));

    const requesterRole = (req.user && req.user.role || '').toLowerCase();
    const isSender = String(n.sender || '') === String(req.user._id);
    const isPrivileged = requesterRole === 'admin' || requesterRole === 'manager';

    // Permission: only privileged users (admin/manager) or the original sender can reply.
    // Teachers and students cannot reply even if they are recipients.
    if (!(isPrivileged || isSender)) {
      return res.status(403).json({ ok:false, message: 'Not allowed to reply' });
    }

    const text = (req.body && req.body.text || '').toString().trim();
    if (!text) return res.status(400).json({ ok:false, message: 'Reply text required' });

    // push reply — store author as ObjectId when possible
    const reply = {
      author: toObjectIdIfPossible(req.user._id),
      authorName: req.user.fullname || req.user.name || (req.user.email || '').split('@')[0],
      text,
      createdAt: new Date()
    };

    n.replies = n.replies || [];
    n.replies.push(reply);

    await n.save();

    // Respond with a lean representation of saved reply
    const out = { text: reply.text, author: reply.author, authorName: reply.authorName, createdAt: reply.createdAt };
    return res.json({ ok:true, reply: out });
  } catch (err) {
    console.error('POST /notices/:id/reply', err && (err.stack || err));
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});



/* mark a single notice as read */
router.post('/:id/read', auth, async (req, res) => {
  try {
    await Notice.updateOne(
      { _id: req.params.id, 'recipients.userId': toObjectIdIfPossible(req.user._id), 'recipients.readAt': null },
      { $set: { 'recipients.$.readAt': new Date() } }
    );
    res.json({ ok:true });
  } catch (err) {
    console.error('POST /notices/:id/read', err && (err.stack || err));
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/* Reply to a notice - persist replies */
router.post('/:id/reply', auth, async (req, res) => {
  try {
    const n = await Notice.findById(req.params.id);
    if (!n) return res.status(404).json({ ok:false, message: 'Not found' });

    // permission: allow admin/manager or the original sender
    const requesterRole = (req.user && req.user.role || '').toLowerCase();
    const isSender = String(n.sender || '') === String(req.user._id);
    if (!(requesterRole === 'admin' || requesterRole === 'manager' || isSender)) {
      return res.status(403).json({ ok:false, message: 'Not allowed to reply' });
    }

    const text = (req.body && req.body.text || '').toString().trim();
    if (!text) return res.status(400).json({ ok:false, message: 'Reply text required' });

    // push reply (store author, authorName, text, createdAt)
    const reply = {
      author: toObjectIdIfPossible(req.user._id),
      authorName: req.user.fullname || req.user.name || (req.user.email || '').split('@')[0],
      text,
      createdAt: new Date()
    };
    n.replies = n.replies || [];
    n.replies.push(reply);

    await n.save();
    return res.json({ ok:true, reply });
  } catch (err) {
    console.error('POST /notices/:id/reply', err && (err.stack || err));
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/* Edit (PUT) *//* Edit (PUT) */
router.put('/:id', auth, roles(['manager','admin']), async (req, res) => {
  try {
    const n = await Notice.findById(req.params.id);
    if (!n) return res.status(404).json({ ok:false, message: 'Not found' });

    if (String(n.sender) !== String(req.user._id) && (String(req.user.role||'').toLowerCase() !== 'admin')) {
      return res.status(403).json({ ok:false, message: 'Not allowed' });
    }

    const { title, body, targetRoles = [], explicitUserIds = [] } = req.body || {};
    if (title) n.title = title;
    if (body !== undefined) n.body = body;

    // Only attempt recipient resolution if we actually received values (non-empty arrays)
    const shouldResolve = (Array.isArray(explicitUserIds) && explicitUserIds.length > 0) || (Array.isArray(targetRoles) && targetRoles.length > 0);
    if (shouldResolve) {
      const recs = await resolveRecipients({ targetRoles, explicitUserIds, schoolId: n.schoolId });
      if (!recs || recs.length === 0) return res.status(400).json({ ok:false, message: 'No recipients found' });

      // ensure sender remains in recipient list after edit
      const senderIdStr = String(req.user._id);
      const hasSender = recs.some(rp => String(rp.userId) === senderIdStr);
      if (!hasSender) {
        const uid = isObjectIdString(senderIdStr) ? new mongoose.Types.ObjectId(senderIdStr) : senderIdStr;
        recs.push({ userId: uid, role: req.user.role || 'manager' });
      }

      // normalize before assigning to the document
      n.recipients = ensureRecipientIdsAreObjectIds(recs);
      n.targetRoles = targetRoles || [];
    }

    await n.save();
    res.json({ ok:true, notice: n });
  } catch (err) {
    console.error('PUT /notices/:id', err && (err.stack || err));
    // surface validation-like errors to client
    if (err && err.name === 'ValidationError') {
      return res.status(400).json({ ok:false, message: err.message });
    }
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});


/* Delete */
router.delete('/:id', auth, roles(['manager','admin']), async (req, res) => {
  try {
    const n = await Notice.findById(req.params.id);
    if (!n) return res.status(404).json({ ok:false, message: 'Not found' });

    if (String(n.sender) !== String(req.user._id) && (String(req.user.role||'').toLowerCase() !== 'admin')) {
      return res.status(403).json({ ok:false, message: 'Not allowed' });
    }

    await Notice.deleteOne({ _id: n._id });
    res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /notices/:id', err && (err.stack || err));
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

module.exports = router;
