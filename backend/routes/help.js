// // backend/routes/help.js
// const express = require('express');
// const mongoose = require('mongoose');
// const router = express.Router();
// const auth = require('../middleware/auth');
// const HelpMessage = require('../models/HelpMessage');
// const User = require('../models/User');
// const Student = require('../models/Student');
// const Teacher = require('../models/Teacher');

// function isObjectIdString(s) {
//   return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s);
// }
// function toObjectIdIfPossible(id) {
//   try { const s = String(id || ''); if (isObjectIdString(s)) return new mongoose.Types.ObjectId(s); } catch(e) {}
//   return id;
// }

// // scope id helper: prefer schoolId, otherwise createdBy (manager id), otherwise manager._id
// function getScopeIdForUser(user) {
//   if (!user) return null;
//   if (user.schoolId) return String(user.schoolId);
//   if (user.createdBy) return String(user.createdBy);
//   if ((user.role || '').toLowerCase() === 'manager') return String(user._id);
//   return null;
// }

// /**
//  * Helper: fetch basic owner info (User | Student | Teacher)
//  * returns { _id, schoolId, createdBy, role?, fullname? } or null
//  */
// async function findAnyUserById(id) {
//   if (!id) return null;
//   const sId = String(id);
//   let u = await User.findById(sId).select('_id schoolId createdBy role fullname').lean().catch(()=>null);
//   if (u) return u;
//   u = await Student.findById(sId).select('_id schoolId createdBy fullname').lean().catch(()=>null);
//   if (u) return u;
//   u = await Teacher.findById(sId).select('_id schoolId createdBy fullname').lean().catch(()=>null);
//   if (u) return u;
//   return null;
// }

// /**
//  * Helper: collect recipients in a given scope. role may be 'student','teacher','manager','admin' or null for all.
//  * returns array of string ids (user/student/teacher ids)
//  */
// async function collectRecipientsInScope(role, scopeId, limit = 5000) {
//   if (!scopeId) return [];
//   const q = { $or: [{ schoolId: toObjectIdIfPossible(scopeId) }, { createdBy: toObjectIdIfPossible(scopeId) }] };
//   const out = [];
//   const userQ = Object.assign({}, q);
//   if (role) userQ.role = role;
//   const users = await User.find(userQ).select('_id').limit(limit).lean().catch(()=>[]);
//   users.forEach(u => out.push(String(u._id)));
//   if (!role || role === 'student') {
//     const students = await Student.find(q).select('_id').limit(limit).lean().catch(()=>[]);
//     students.forEach(s => out.push(String(s._id)));
//   }
//   if (!role || role === 'teacher') {
//     const teachers = await Teacher.find(q).select('_id').limit(limit).lean().catch(()=>[]);
//     teachers.forEach(t => out.push(String(t._id)));
//   }
//   // include the scopeId itself (useful if manager id is used directly)
//   out.push(String(scopeId));
//   return Array.from(new Set(out)).slice(0, limit);
// }

// /**
//  * GET /api/help
//  * Returns messages visible to current user (private + scope filtering)
//  */
// router.get('/', auth, async (req, res) => {
//   try {
//     const me = req.user;
//     if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

//     const role = (me.role || '').toLowerCase();
//     const isAdmin = role === 'admin';
//     const isManager = role === 'manager';

//     const limit = Math.min(500, Math.max(20, parseInt(req.query.limit || '200', 10)));
//     const skip = Math.max(0, parseInt(req.query.skip || '0', 10));
//     const base = { removed: false };

//     // admin sees everything
//     if (isAdmin) {
//       const messages = await HelpMessage.find(base).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
//       console.debug('[help] admin fetched messages:', messages.length);
//       return res.json({ ok: true, messages });
//     }

//     // Determine requester scope (schoolId or createdBy/manager._id)
//     const requesterScope = getScopeIdForUser(me); // may be null
//     console.debug('[help] requester scope for', String(me._id), '->', requesterScope);

//     let scopeMemberIds = [];
//     if (requesterScope) {
//       scopeMemberIds = await collectRecipientsInScope(null, requesterScope, 5000);
//       if (!scopeMemberIds.includes(String(me._id))) scopeMemberIds.push(String(me._id));
//     }

//     // Build OR query so we fetch reasonable candidate messages
//     const or = [];
//     or.push({ toUser: toObjectIdIfPossible(me._id) });
//     or.push({ from: toObjectIdIfPossible(me._id) });

//     if (scopeMemberIds.length > 0) {
//       // fetch messages from members of my scope
//       or.push({ from: { $in: scopeMemberIds.map(id => toObjectIdIfPossible(id)) } });
//       // role-targeted messages where sender is in my scope
//       or.push({ $and: [{ toRole: role }, { from: { $in: scopeMemberIds.map(id => toObjectIdIfPossible(id)) } }] });
//       // broadcasts from members of my scope
//       or.push({ $and: [{ broadcastToAll: true }, { from: { $in: scopeMemberIds.map(id => toObjectIdIfPossible(id)) } }] });
//       // managers see private messages from scope members
//       if (isManager) or.push({ $and: [{ private: true }, { from: { $in: scopeMemberIds.map(id => toObjectIdIfPossible(id)) } }] });
//     } else {
//       // conservative fallback if no known scope: fetch messages explicitly for my role and global broadcasts
//       or.push({ toRole: role });
//       or.push({ broadcastToAll: true });
//     }

//     const q = Object.assign({}, base, { $or: or });

//     // fetch candidates
//     const candidates = await HelpMessage.find(q)
//       .sort({ createdAt: -1 })
//       .limit(Math.max(limit * 3, 500))
//       .lean();

//     console.debug('[help] get candidate messages:', candidates.length);

//     // pre-resolve senders (reduce repeated DB hits)
//     const senderIds = Array.from(new Set(candidates.map(m => String(m.from)).filter(Boolean)));
//     const senderMap = {};
//     if (senderIds.length) {
//       const promises = senderIds.map(id => findAnyUserById(id));
//       const senders = await Promise.all(promises);
//       senders.forEach(s => { if (s) senderMap[String(s._id)] = s; });
//     }

//     const out = [];
//     for (const m of candidates) {
//       // Owner sees own messages
//       if (String(m.from) === String(me._id)) { out.push(m); continue; }

//       // Private messages: managers in same scope only (admin handled earlier)
//       if (m.private) {
//         if (isManager && requesterScope) {
//           const sender = senderMap[String(m.from)] || await findAnyUserById(m.from);
//           const senderScope = sender ? getScopeIdForUser(sender) : null;
//           if (senderScope && String(senderScope) === String(requesterScope)) { out.push(m); continue; }
//         }
//         continue;
//       }

//       // For non-private messages: if we have a requesterScope, prefer same-scope messages, but also allow
//       // global role-targeted / global broadcasts (those with senderScope === null).
//       if (requesterScope) {
//         const sender = senderMap[String(m.from)] || await findAnyUserById(m.from);
//         const senderScope = sender ? getScopeIdForUser(sender) : null;

//         // role-targeted messages: allow if senderScope === requesterScope OR senderScope === null (global)
//         if (m.toRole && String(m.toRole) === String(role)) {
//           if (!senderScope || String(senderScope) === String(requesterScope)) { out.push(m); }
//           continue;
//         }

//         // broadcastToAll: allow if senderScope === requesterScope OR senderScope === null (global)
//         if (m.broadcastToAll) {
//           if (!senderScope || String(senderScope) === String(requesterScope)) { out.push(m); }
//           continue;
//         }

//         // direct-to-user (explicit)
//         if (m.toUser && String(m.toUser) === String(me._id)) { out.push(m); continue; }
//         if (m.from && String(m.from) === String(me._id)) { out.push(m); continue; }

//         // otherwise allow only if sender is in same scope
//         if (senderScope && String(senderScope) === String(requesterScope)) { out.push(m); continue; }

//         // skip other messages
//         continue;
//       } else {
//         // no requester scope: show messages explicitly for me or for my role or global broadcast
//         if (m.toUser && String(m.toUser) === String(me._id)) { out.push(m); continue; }
//         if (m.from && String(m.from) === String(me._id)) { out.push(m); continue; }
//         if (m.toRole && String(m.toRole) === String(role)) { out.push(m); continue; }
//         if (m.broadcastToAll) { out.push(m); continue; }
//       }
//     }

//     const sliced = out.slice(skip, skip + limit);
//     console.debug('[help] final messages to return:', sliced.length);
//     return res.json({ ok: true, messages: sliced });
//   } catch (err) {
//     console.error('GET /help ERROR', err && (err.stack || err));
//     res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * POST /api/help
//  * Accepts { text, toRole?, private?, broadcastToAll?, replyTo?, toUser? }
//  */
// router.post('/', auth, async (req, res) => {
//   try {
//     const me = req.user;
//     if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

//     const role = (me.role || '').toLowerCase();
//     const isAdmin = role === 'admin';
//     const isManager = role === 'manager';
//     const body = req.body || {};

//     const text = (body.text || '').trim();
//     if (!text) return res.status(400).json({ ok: false, message: 'Empty message' });

//     const isPrivate = !!body.private;
//     let toRole = body.toRole || null;
//     if (isPrivate) toRole = 'manager';

//     // Students/Teachers rules:
//     // - allowed to message managers (toRole='manager') or send direct messages (toUser)
//     // - allowed to broadcast (broadcastToAll)
//     // - disallow targeting other roles (e.g. student->teacher) directly
//     if (!isAdmin && !isManager) {
//       if (toRole && toRole !== 'manager' && !body.toUser && !body.broadcastToAll) {
//         return res.status(403).json({ ok: false, message: 'Students/Teachers may only message managers / send direct messages / broadcast' });
//       }
//     }

//     const senderScope = getScopeIdForUser(me);
//     console.debug('[help] POST senderScope for', String(me._id), '->', senderScope);

//     // Managers require a scope to message students/teachers or broadcast
//     if (isManager && (toRole === 'student' || toRole === 'teacher' || body.broadcastToAll)) {
//       if (!senderScope) return res.status(403).json({ ok: false, message: 'Manager scope required to message these recipients' });
//     }

//     // Build message payload and save
//     const payload = {
//       from: toObjectIdIfPossible(me._id),
//       fromName: me.fullname || me.name || me.email || '',
//       text,
//       replyTo: body.replyTo ? toObjectIdIfPossible(body.replyTo) : null,
//       broadcastToAll: !!body.broadcastToAll,
//       toRole: toRole || null,
//       toUser: body.toUser ? toObjectIdIfPossible(body.toUser) : null,
//       private: isPrivate
//     };

//     const msg = new HelpMessage(payload);
//     await msg.save();

//     // Try to emit via socket.io to intended recipients (graceful fallback if io missing)
//     try {
//       const io = req.app && req.app.get && req.app.get('io');
//       if (!io) {
//         console.warn('[help] io not available - saved message only');
//         return res.json({ ok: true, message: msg });
//       }

//       const out = {
//         _id: String(msg._id),
//         from: String(msg.from),
//         fromName: msg.fromName,
//         text: msg.text,
//         toUser: msg.toUser ? String(msg.toUser) : null,
//         toRole: msg.toRole || null,
//         broadcastToAll: !!msg.broadcastToAll,
//         replyTo: msg.replyTo ? String(msg.replyTo) : null,
//         createdAt: msg.createdAt,
//         reactions: msg.reactions || [],
//         private: !!msg.private
//       };

//       // always notify sender
//       io.to('user:' + String(me._id)).emit('help:new', out);

//       // private -> managers in scope (or global if admin without scope)
//       if (msg.private) {
//         if (isAdmin && !senderScope) {
//           io.to('role:manager').emit('help:new', out);
//           console.debug('[help] emitted private to all managers (admin sender, no scope)');
//         } else if (senderScope) {
//           const recipients = await collectRecipientsInScope('manager', senderScope, 2000);
//           console.debug('[help] private recipients (managers) for scope', senderScope, recipients.length);
//           for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
//         } else {
//           // Non-admin sender with no scope -> still notify global managers
//           io.to('role:manager').emit('help:new', out);
//           console.debug('[help] private emitted globally to managers (no sender scope)');
//         }
//         return res.json({ ok: true, message: msg });
//       }

//       // toRole -> recipients of that role in sender scope (or global role room for admins)
//       if (msg.toRole) {
//         if (isAdmin && !senderScope) {
//           io.to('role:' + msg.toRole).emit('help:new', out);
//           console.debug('[help] emitted to role room (admin sender, global role):', msg.toRole);
//         } else if (senderScope) {
//           const recipients = await collectRecipientsInScope(msg.toRole, senderScope, 5000);
//           console.debug('[help] toRole recipients for', msg.toRole, 'scope', senderScope, '->', recipients.length);
//           for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
//         } else {
//           // Non-admin sender with no scope: allow sending to managers globally (e.g. student -> manager)
//           if (msg.toRole === 'manager') {
//             io.to('role:manager').emit('help:new', out);
//             console.debug('[help] emitted to role:manager globally (sender has no scope)');
//           }
//         }
//       }

//       // direct toUser
//       if (msg.toUser) {
//         io.to('user:' + String(msg.toUser)).emit('help:new', out);
//         console.debug('[help] emitted direct to user:', msg.toUser);
//       }

//       // broadcastToAll -> all users in sender scope (or global if admin or if sender has no scope)
//       if (msg.broadcastToAll) {
//         if (isAdmin && !senderScope) {
//           // admin with no scope -> global broadcast to role rooms
//           io.to('role:student').emit('help:new', out);
//           io.to('role:teacher').emit('help:new', out);
//           io.to('role:manager').emit('help:new', out);
//           io.to('role:admin').emit('help:new', out);
//           console.debug('[help] broadcast emitted globally (admin)');
//         } else if (senderScope) {
//           // broadcast to members of sender's scope
//           const recipients = await collectRecipientsInScope(null, senderScope, 5000);
//           console.debug('[help] broadcast recipients for scope', senderScope, recipients.length);
//           for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
//         } else {
//           // Non-admin sender with no scope => fallback to global broadcast to role rooms.
//           io.to('role:student').emit('help:new', out);
//           io.to('role:teacher').emit('help:new', out);
//           io.to('role:manager').emit('help:new', out);
//           console.debug('[help] broadcast emitted globally (no sender scope)');
//         }
//       }

//       return res.json({ ok: true, message: msg });
//     } catch (sockErr) {
//       console.warn('help emit error', sockErr);
//       return res.json({ ok: true, message: msg });
//     }
//   } catch (err) {
//     console.error('POST /help ERROR', err && (err.stack || err));
//     res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * PUT /api/help/:id - edit (owner or admin)
//  */
// router.put('/:id', auth, async (req, res) => {
//   try {
//     const id = req.params.id;
//     if (!isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
//     const msg = await HelpMessage.findById(id);
//     if (!msg) return res.status(404).json({ ok: false, message: 'Not found' });

//     const me = req.user;
//     const role = (me.role || '').toLowerCase();
//     const isAdmin = role === 'admin';
//     if (!isAdmin && String(msg.from) !== String(me._id)) return res.status(403).json({ ok: false, message: 'Not allowed' });

//     const payload = req.body || {};
//     if (typeof payload.text === 'string') msg.text = payload.text.trim();
//     msg.updatedAt = new Date();
//     await msg.save();

//     const io = req.app && req.app.get && req.app.get('io');
//     if (io) io.emit('help:update', { _id: String(msg._id), text: msg.text, reactions: msg.reactions, updatedAt: msg.updatedAt });

//     return res.json({ ok: true, message: msg });
//   } catch (err) {
//     console.error('PUT /help/:id ERROR', err && (err.stack || err));
//     res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * DELETE /api/help/:id - owner/admin or manager in scope
//  */
// router.delete('/:id', auth, async (req, res) => {
//   try {
//     const id = req.params.id;
//     if (!isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
//     const msg = await HelpMessage.findById(id);
//     if (!msg) return res.status(404).json({ ok: false, message: 'Not found' });

//     const me = req.user;
//     const role = (me.role || '').toLowerCase();
//     const isAdmin = role === 'admin';
//     const isManager = role === 'manager';

//     if (isAdmin) {
//       // ok
//     } else if (String(msg.from) === String(me._id)) {
//       // owner ok
//     } else if (isManager) {
//       const managerScope = getScopeIdForUser(me);
//       const fromUser = await findAnyUserById(msg.from);
//       const fromScope = fromUser ? getScopeIdForUser(fromUser) : null;
//       if (!managerScope || !fromScope || String(managerScope) !== String(fromScope)) {
//         return res.status(403).json({ ok: false, message: 'Not allowed (out of your scope)' });
//       }
//     } else {
//       return res.status(403).json({ ok: false, message: 'Not allowed' });
//     }

//     msg.removed = true;
//     msg.removedBy = toObjectIdIfPossible(me._id);
//     await msg.save();

//     const io = req.app && req.app.get && req.app.get('io');
//     if (io) io.emit('help:delete', { _id: String(msg._id), removedBy: String(me._id) });

//     return res.json({ ok: true });
//   } catch (err) {
//     console.error('DELETE /help/:id ERROR', err && (err.stack || err));
//     res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * POST /api/help/react/:id - toggle reaction
//  */
// router.post('/react/:id', auth, async (req, res) => {
//   try {
//     const id = req.params.id;
//     const emoji = (req.body && req.body.emoji) ? String(req.body.emoji).slice(0,8) : null;
//     if (!emoji) return res.status(400).json({ ok: false, message: 'Emoji required' });
//     if (!isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

//     const msg = await HelpMessage.findById(id);
//     if (!msg || msg.removed) return res.status(404).json({ ok: false, message: 'Not found' });

//     const uid = toObjectIdIfPossible(req.user._id);
//     const existsIdx = msg.reactions.findIndex(r => String(r.by) === String(uid) && r.emoji === emoji);
//     if (existsIdx >= 0) msg.reactions.splice(existsIdx, 1);
//     else msg.reactions.push({ by: uid, emoji });
//     await msg.save();

//     const io = req.app && req.app.get && req.app.get('io');
//     if (io) io.emit('help:update', { _id: String(msg._id), reactions: msg.reactions });

//     return res.json({ ok: true, reactions: msg.reactions });
//   } catch (err) {
//     console.error('POST /help/react/:id ERROR', err && (err.stack || err));
//     res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * GET /api/help/problems - static troubleshooting topics
//  */
// router.get('/problems', auth, async (req, res) => {
//   const topics = [
//     { id: 'vote', title: 'Vote / Poll Issues', steps: [
//       'Check that vote is published',
//       'Ensure students are in the allowed groups',
//       'If results not updating, ask students to refresh page',
//       'Contact manager if issue persists'
//     ]},
//     { id: 'exam-results', title: 'Exam / Results Issues', steps: [
//       'Verify exam has been graded',
//       'Check student(s) assigned to the exam',
//       'If incorrect score, contact the teacher to regrade'
//     ]},
//     { id: 'finance', title: 'Finance / Payments Problems', steps: [
//       'Ensure payment type exists',
//       'Verify student account',
//       'Contact the manager for payment reconciliation'
//     ]},
//     { id: 'attendance', title: 'Attendance Problems', steps: [
//       'Check teacher has selected correct class',
//       'Ensure date selection is correct',
//       'If absent toggle not working, refresh and retry'
//     ]},
//     { id: 'other', title: 'Other / General', steps: [
//       'Describe the issue with steps to reproduce',
//       'Attach screenshots if available',
//       'Select correct target recipient (manager/admin) and send'
//     ]}
//   ];
//   res.json({ ok: true, topics });
// });

// module.exports = router;



// backend/routes/help.js
/**
 * Help messaging routes with scoped delivery rules.
 *
 * - Managers can message only users (students/teachers/users) they created or in their school scope.
 * - Managers may broadcast, but broadcasts are limited to their scope (not global).
 * - Teachers and Students may message only within their manager's scope; they may also send private messages to their manager.
 * - Admins retain global privileges.
 *
 * This file reuses your existing models:
 *  - HelpMessage
 *  - User, Student, Teacher
 *
 * If you already have slightly different field names for ownership (eg. owner, school, created_by),
 * adapt getScopeIdForUser() / collectRecipientsInScope() accordingly.
 */
// backend/routes/help.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../middleware/auth');

const HelpMessage = require('../models/HelpMessage');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

function isObjectIdString(s) {
  return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s);
}
function toObjectIdIfPossible(id) {
  try {
    const s = String(id || '');
    if (isObjectIdString(s)) return new mongoose.Types.ObjectId(s);
  } catch (e) { /* noop */ }
  return id;
}

/**
 * Determine the "scope id" representing a manager/school scope for a given user.
 */
function getScopeIdForUser(user) {
  if (!user) return null;
  if (user.schoolId) return String(user.schoolId);
  if (user.createdBy) return String(user.createdBy);
  const role = (user.role || '').toLowerCase();
  if (role === 'manager') return String(user._id);
  return null;
}

/**
 * Attempt to resolve an id (User/Student/Teacher) to a canonical lightweight object
 * used for scope detection: { _id, schoolId, createdBy, role, fullname }
 */
async function findAnyUserById(id) {
  if (!id) return null;
  const sId = String(id);
  let u = await User.findById(sId).select('_id schoolId createdBy role fullname').lean().catch(()=>null);
  if (u) return u;
  u = await Student.findById(sId).select('_id schoolId createdBy fullname').lean().catch(()=>null);
  if (u) return u;
  u = await Teacher.findById(sId).select('_id schoolId createdBy fullname').lean().catch(()=>null);
  if (u) return u;
  return null;
}

/**
 * Collect recipients (IDs) in a scope.
 * role: optional ('student'|'teacher'|'manager'|'admin' or null for any)
 * scopeId: matches schoolId OR createdBy
 */
async function collectRecipientsInScope(role, scopeId, limit = 5000) {
  if (!scopeId) return [];
  const sid = toObjectIdIfPossible(scopeId);

  const out = new Set();

  // Users belonging to this scope (schoolId or createdBy)
  const userQuery = { $or: [{ schoolId: sid }, { createdBy: sid }] };
  if (role) userQuery.role = role;
  const users = await User.find(userQuery).select('_id').limit(limit).lean().catch(()=>[]);
  users.forEach(u => out.add(String(u._id)));

  // Students
  if (!role || role === 'student') {
    const students = await Student.find({ $or: [{ schoolId: sid }, { createdBy: sid }] }).select('_id').limit(limit).lean().catch(()=>[]);
    students.forEach(s => out.add(String(s._id)));
  }

  // Teachers
  if (!role || role === 'teacher') {
    const teachers = await Teacher.find({ $or: [{ schoolId: sid }, { createdBy: sid }] }).select('_id').limit(limit).lean().catch(()=>[]);
    teachers.forEach(t => out.add(String(t._id)));
  }

  // include the scopeId itself (if it's a manager id)
  out.add(String(scopeId));

  return Array.from(out).slice(0, limit);
}

/**
 * Collect recipients *created by a specific manager* (createdBy === managerId).
 * This implements "everyone the manager created" semantics.
 */
async function collectRecipientsCreatedBy(createdById, role = null, limit = 5000) {
  if (!createdById) return [];
  const cid = toObjectIdIfPossible(createdById);
  const out = new Set();

  // Users created by manager
  const userQuery = { createdBy: cid };
  if (role) userQuery.role = role;
  const users = await User.find(userQuery).select('_id').limit(limit).lean().catch(()=>[]);
  users.forEach(u => out.add(String(u._id)));

  // Students created by manager
  if (!role || role === 'student') {
    const students = await Student.find({ createdBy: cid }).select('_id').limit(limit).lean().catch(()=>[]);
    students.forEach(s => out.add(String(s._id)));
  }

  // Teachers created by manager
  if (!role || role === 'teacher') {
    const teachers = await Teacher.find({ createdBy: cid }).select('_id').limit(limit).lean().catch(()=>[]);
    teachers.forEach(t => out.add(String(t._id)));
  }

  // include manager id (if manager created themself or used as fallback)
  out.add(String(createdById));

  return Array.from(out).slice(0, limit);
}

/**
 * GET /api/help
 */
router.get('/', auth, async (req, res) => {
  try {
    const me = req.user;
    if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

    const role = (me.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const isManager = role === 'manager';

    const limit = Math.min(500, Math.max(20, parseInt(req.query.limit || '200', 10)));
    const skip = Math.max(0, parseInt(req.query.skip || '0', 10));

    const base = { removed: { $ne: true } };

    if (isAdmin) {
      const messages = await HelpMessage.find(base).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
      return res.json({ ok: true, messages });
    }

    // Determine requester's scope
    const requesterScope = getScopeIdForUser(me); // may be null
    let scopeMemberIds = [];
    if (requesterScope) {
      scopeMemberIds = await collectRecipientsInScope(null, requesterScope, 5000);
      if (!scopeMemberIds.includes(String(me._id))) scopeMemberIds.push(String(me._id));
    }

    // Build candidate query (broad) then filter precisely.
    const or = [];

    // messages to me or from me are always relevant
    or.push({ toUser: toObjectIdIfPossible(me._id) });
    or.push({ from: toObjectIdIfPossible(me._id) });
    // messages where toUsers array contains me
    or.push({ toUsers: toObjectIdIfPossible(me._id) });
    // role-targeted for my role
    or.push({ toRole: role });
    // broadcasts
    or.push({ broadcastToAll: true });
    // messages from people in my scope
    if (scopeMemberIds.length) {
      or.push({ from: { $in: scopeMemberIds.map(id => toObjectIdIfPossible(id)) } });
    }

    const q = Object.assign({}, base, { $or: or });

    const candidates = await HelpMessage.find(q).sort({ createdAt: -1 }).limit(Math.max(limit*3, 500)).lean();

    // Pre-resolve senders
    const senderIds = Array.from(new Set(candidates.map(m => String(m.from)).filter(Boolean)));
    const senderMap = {};
    if (senderIds.length) {
      const promises = senderIds.map(id => findAnyUserById(id));
      const senders = await Promise.all(promises);
      senders.forEach(s => { if (s) senderMap[String(s._id)] = s; });
    }

    const out = [];
    for (const m of candidates) {
      // owner always sees own
      if (String(m.from) === String(me._id)) { out.push(m); continue; }

      // private messages
      if (m.private) {
        if (m.toUser && String(m.toUser) === String(me._id)) { out.push(m); continue; }
        // if requester is manager, allow if sender belongs to same scope
        if (isManager && requesterScope) {
          const sender = senderMap[String(m.from)] || await findAnyUserById(m.from);
          const senderScope = sender ? getScopeIdForUser(sender) : null;
          if (senderScope && String(senderScope) === String(requesterScope)) {
            out.push(m); continue;
          }
        }
        continue; // otherwise hide private
      }

      const sender = senderMap[String(m.from)] || await findAnyUserById(m.from);
      const senderScope = sender ? getScopeIdForUser(sender) : null;

      // if message has explicit toUsers
      if (Array.isArray(m.toUsers) && m.toUsers.length) {
        if (m.toUsers.map(String).includes(String(me._id))) { out.push(m); continue; }
        // else if requesterScope matches senderScope, allow (scoped)
        if (requesterScope && senderScope && String(senderScope) === String(requesterScope)) { out.push(m); continue; }
        continue;
      }

      // role-targeted
      if (m.toRole) {
        if (!requesterScope) {
          if (String(m.toRole) === String(role)) { out.push(m); continue; }
          continue;
        } else {
          if (String(m.toRole) === String(role)) {
            if (!senderScope || String(senderScope) === String(requesterScope)) { out.push(m); continue; }
            else continue;
          }
        }
      }

      // broadcasts
      if (m.broadcastToAll) {
        if (!requesterScope) {
          out.push(m); continue;
        } else {
          if (!senderScope || String(senderScope) === String(requesterScope)) { out.push(m); continue; }
          else continue;
        }
      }

      // messages from members of same scope
      if (senderScope && requesterScope && String(senderScope) === String(requesterScope)) {
        out.push(m); continue;
      }

      // else skip
    }

    // apply skip/limit
    const sliced = out.slice(skip, skip + limit);
    return res.json({ ok: true, messages: sliced });
  } catch (err) {
    console.error('GET /help ERROR', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/help
 * Accepts: { text, toRole?, private?, broadcastToAll?, replyTo?, toUser?, toUsers?:[] }
 *
 * Important: if `toUsers` array is provided we create ONE message with `toUsers` set,
 * then emit to sender once and emit to each recipient's socket.
 */
router.post('/', auth, async (req, res) => {
  try {
    const me = req.user;
    if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

    const role = (me.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const isManager = role === 'manager';
    const isTeacher = role === 'teacher';
    const isStudent = role === 'student';

    const body = req.body || {};
    const text = (body.text || '').trim();
    if (!text) return res.status(400).json({ ok: false, message: 'Empty message' });

    let toRole = body.toRole ? String(body.toRole).toLowerCase() : null;
    const broadcastToAll = !!body.broadcastToAll;
    const isPrivate = !!body.private;
    const toUser = body.toUser ? String(body.toUser) : null;
    const toUsers = Array.isArray(body.toUsers) ? body.toUsers.map(String) : (body.toUsers ? [String(body.toUsers)] : []);
    const replyTo = body.replyTo ? String(body.replyTo) : null;

    // If private requested but no explicit toUser(s), assume private to manager
    if (isPrivate && !toUser && (!toUsers || !toUsers.length)) {
      toRole = 'manager';
    }

    // high level permissions
    if (!isAdmin) {
      if (broadcastToAll && !isManager && !isTeacher) {
        return res.status(403).json({ ok: false, message: 'Only managers or teachers can broadcast' });
      }
    }

    const senderScope = getScopeIdForUser(me);

    // helper: check single target in scope
    async function isTargetAllowed(targetId) {
      if (!targetId) return false;
      if (String(targetId) === String(me._id)) return true;
      if (isAdmin) return true;
      const target = await findAnyUserById(targetId);
      if (!target) return false;
      const targetScope = getScopeIdForUser(target);

      if (isManager) {
        if (!senderScope) return false;
        if (String(targetScope) === String(senderScope)) return true;
        if (target.createdBy && String(target.createdBy) === String(me._id)) return true;
        return false;
      }

      if (isTeacher || isStudent) {
        if (!senderScope) return false;
        if (targetScope && String(targetScope) === String(senderScope)) return true;
        return false;
      }
      return false;
    }

    // If teacher/student wants to send to everyone their manager created (and didn't choose private),
    // automatically resolve toUsers to that manager-created set.
    if ((isTeacher || isStudent) && !isPrivate && !toUser && (!toUsers || !toUsers.length) && !broadcastToAll && !toRole) {
      // interpret as "send to everyone the manager created"
      if (!senderScope) return res.status(403).json({ ok: false, message: 'No manager/scope assigned' });

      // use collectRecipientsCreatedBy to get only records where createdBy == managerId
      const recipients = await collectRecipientsCreatedBy(senderScope, null, 5000);
      // remove sender from recipients
      const filtered = recipients.filter(id => String(id) !== String(me._id));
      if (!filtered.length) return res.status(400).json({ ok: false, message: 'No recipients found in your manager-created list' });

      // set toUsers (single message will be created)
      toUsers.splice(0, toUsers.length, ...filtered);
    }

    // If toUsers present, validate each recipient
    if (toUsers && toUsers.length) {
      for (const t of toUsers) {
        const ok = await isTargetAllowed(t);
        if (!ok) return res.status(403).json({ ok: false, message: 'One or more selected recipients are out of your scope' });
      }
    }

    // If single toUser provided validate
    if (toUser) {
      const ok = await isTargetAllowed(toUser);
      if (!ok) return res.status(403).json({ ok: false, message: 'Target is out of your scope' });
    }

    // If toRole is provided, check sender permission
    if (toRole) {
      if (isManager) {
        if (!['student','teacher','manager','admin',''].includes(toRole)) {
          return res.status(403).json({ ok: false, message: 'Invalid toRole for manager' });
        }
        if ((toRole === 'student' || toRole === 'teacher') && !senderScope) {
          return res.status(403).json({ ok: false, message: 'Manager scope required to message that role' });
        }
      } else if (isTeacher || isStudent) {
        if (!['student','teacher','manager',''].includes(toRole)) {
          return res.status(403).json({ ok: false, message: 'Invalid toRole' });
        }
        if ((toRole === 'student' || toRole === 'teacher') && !senderScope) {
          return res.status(403).json({ ok: false, message: 'You do not have a manager/scope assigned' });
        }
      } else {
        return res.status(403).json({ ok: false, message: 'Insufficient permissions to target role' });
      }
    }

    // Build message document fields
    const doc = {
      from: toObjectIdIfPossible(me._id),
      fromName: me.fullname || me.name || me.email || '',
      text,
      replyTo: replyTo && isObjectIdString(replyTo) ? toObjectIdIfPossible(replyTo) : null,
      broadcastToAll: !!broadcastToAll,
      toRole: toRole || null,
      toUser: toUser ? toObjectIdIfPossible(toUser) : null,
      toUsers: (toUsers && toUsers.length) ? toUsers.map(id => toObjectIdIfPossible(id)) : [],
      private: !!isPrivate,
      createdAt: new Date()
    };

    // Create a single message (toUsers array if present)
    const msg = new HelpMessage(doc);
    await msg.save();

    const out = {
      _id: String(msg._id),
      from: String(msg.from),
      fromName: msg.fromName,
      text: msg.text,
      toUser: msg.toUser ? String(msg.toUser) : null,
      toUsers: (msg.toUsers || []).map(v => String(v)),
      toRole: msg.toRole || null,
      broadcastToAll: !!msg.broadcastToAll,
      private: !!msg.private,
      replyTo: msg.replyTo ? String(msg.replyTo) : null,
      createdAt: msg.createdAt,
      reactions: msg.reactions || []
    };

    // Socket emission
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (!io) return res.json({ ok: true, message: msg });

      // notify sender once
      io.to('user:' + String(me._id)).emit('help:new', out);

      // private handling
      if (msg.private) {
        if (msg.toUsers && msg.toUsers.length) {
          for (const u of msg.toUsers) io.to('user:' + String(u)).emit('help:new', out);
          return res.json({ ok: true, message: msg });
        }
        if (msg.toUser) {
          io.to('user:' + String(msg.toUser)).emit('help:new', out);
          return res.json({ ok: true, message: msg });
        }
        if (senderScope) {
          const recipients = await collectRecipientsInScope('manager', senderScope, 2000);
          for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
          return res.json({ ok: true, message: msg });
        }
        io.to('role:manager').emit('help:new', out);
        return res.json({ ok: true, message: msg });
      }

      // explicit toUsers array -> emit to each recipient
      if (msg.toUsers && msg.toUsers.length) {
        for (const u of msg.toUsers) {
          io.to('user:' + String(u)).emit('help:new', out);
        }

        // ALSO notify managers in the sender scope so they see messages from their created users / scope
        if (senderScope) {
          // get managers in this scope (if any)
          const managersInScope = await collectRecipientsInScope('manager', senderScope, 50);
          for (const mId of managersInScope) {
            // skip if manager is already one of recipients (will receive above) or sender
            if (msg.toUsers.map(String).includes(String(mId))) continue;
            if (String(mId) === String(me._id)) continue;
            io.to('user:' + String(mId)).emit('help:new', out);
          }
        }

        return res.json({ ok: true, message: msg });
      }

      // explicit toUser
      if (msg.toUser) {
        io.to('user:' + String(msg.toUser)).emit('help:new', out);

        // Also notify manager(s) in sender scope (useful when students/teachers message a single recipient but manager should see it)
        if (senderScope) {
          const managersInScope = await collectRecipientsInScope('manager', senderScope, 50);
          for (const mId of managersInScope) {
            if (String(mId) === String(me._id)) continue;
            if (String(mId) === String(msg.toUser)) continue;
            io.to('user:' + String(mId)).emit('help:new', out);
          }
        }

        return res.json({ ok: true, message: msg });
      }

      // role-targeted
      if (msg.toRole) {
        if (isAdmin && !senderScope) {
          // admin global role-target
          io.to('role:' + msg.toRole).emit('help:new', out);
          return res.json({ ok: true, message: msg });
        }
        if (senderScope) {
          const recipients = await collectRecipientsInScope(msg.toRole, senderScope, 5000);
          for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
          return res.json({ ok: true, message: msg });
        }
        if (msg.toRole === 'manager') {
          io.to('role:manager').emit('help:new', out);
          return res.json({ ok: true, message: msg });
        }
      }

      // broadcastToAll -> scope-limited broadcast (or global if admin)
      if (msg.broadcastToAll) {
        // Admin without scope: global to all role channels (unchanged)
        if (isAdmin && !senderScope) {
          io.to('role:student').emit('help:new', out);
          io.to('role:teacher').emit('help:new', out);
          io.to('role:manager').emit('help:new', out);
          return res.json({ ok: true, message: msg });
        }

        // If sender has a scope (manager or teacher within a manager scope), restrict broadcast
        if (senderScope) {
          // IMPORTANT: user asked that "general broadcast" for manager should only reach
          // students and teachers the manager created (createdBy == managerId).
          // So use collectRecipientsCreatedBy to fetch created-by set.
          const recipients = await collectRecipientsCreatedBy(senderScope, null, 5000);

          // If collectRecipientsCreatedBy returned nothing (fallback), fall back to in-scope collection
          const finalRecipients = (recipients && recipients.length) ? recipients : await collectRecipientsInScope(null, senderScope, 5000);

          for (const rid of finalRecipients) io.to('user:' + String(rid)).emit('help:new', out);
          return res.json({ ok: true, message: msg });
        } else {
          // fallback global (should be rare)
          io.to('role:student').emit('help:new', out);
          io.to('role:teacher').emit('help:new', out);
          io.to('role:manager').emit('help:new', out);
          return res.json({ ok: true, message: msg });
        }
      }

      // fallback
      return res.json({ ok: true, message: msg });
    } catch (emitErr) {
      console.warn('help emit error', emitErr);
      return res.json({ ok: true, message: msg });
    }
  } catch (err) {
    console.error('POST /help ERROR', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/help/recipients?role=student|teacher|manager
 */
router.get('/recipients', auth, async (req, res) => {
  try {
    const me = req.user;
    if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

    const role = (req.query.role || '').toLowerCase() || null;
    const scopeId = getScopeIdForUser(me);

    if ((me.role || '').toLowerCase() === 'admin' && !scopeId) {
      const out = [];
      if (!role || role === 'manager') {
        const managers = await User.find({ role: 'manager' }).select('_id fullname role').limit(2000).lean().catch(()=>[]);
        managers.forEach(u => out.push({ _id: String(u._id), fullname: u.fullname || u.name || '', role: u.role || 'manager' }));
      }
      if (!role || role === 'student') {
        const students = await Student.find({}).select('_id fullname createdBy schoolId').limit(2000).lean().catch(()=>[]);
        students.forEach(s => out.push({ _id: String(s._id), fullname: s.fullname || '', role: 'student' }));
      }
      if (!role || role === 'teacher') {
        const teachers = await Teacher.find({}).select('_id fullname createdBy schoolId').limit(2000).lean().catch(()=>[]);
        teachers.forEach(t => out.push({ _id: String(t._id), fullname: t.fullname || '', role: 'teacher' }));
      }
      return res.json({ ok: true, users: out });
    }

    if (!scopeId) return res.json({ ok: true, users: [] });

    const ids = await collectRecipientsInScope(role || null, scopeId, 5000);

    const promises = ids.map(id => findAnyUserById(id));
    const results = await Promise.all(promises);

    const users = results.filter(Boolean).map(u => {
      return {
        _id: String(u._id),
        fullname: u.fullname || u.name || '',
        role: (u.role || (u.schoolId && 'student') || 'user')
      };
    });

    return res.json({ ok: true, users });
  } catch (err) {
    console.error('GET /help/recipients ERROR', err && (err.stack || err));
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * PUT /api/help/:id - edit
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const msg = await HelpMessage.findById(id);
    if (!msg) return res.status(404).json({ ok: false, message: 'Not found' });

    const me = req.user;
    const role = (me.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    if (!isAdmin && String(msg.from) !== String(me._id)) return res.status(403).json({ ok: false, message: 'Not allowed' });

    const payload = req.body || {};
    if (typeof payload.text === 'string') msg.text = payload.text.trim();
    msg.updatedAt = new Date();
    await msg.save();

    const io = req.app && req.app.get && req.app.get('io');
    if (io) io.emit('help:update', { _id: String(msg._id), text: msg.text, reactions: msg.reactions, updatedAt: msg.updatedAt });

    return res.json({ ok: true, message: msg });
  } catch (err) {
    console.error('PUT /help/:id ERROR', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/help/:id - soft delete
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    if (!isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const msg = await HelpMessage.findById(id);
    if (!msg) return res.status(404).json({ ok: false, message: 'Not found' });

    const me = req.user;
    const role = (me.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const isManager = role === 'manager';

    if (isAdmin) {
      // ok
    } else if (String(msg.from) === String(me._id)) {
      // owner ok
    } else if (isManager) {
      const managerScope = getScopeIdForUser(me);
      const fromUser = await findAnyUserById(msg.from);
      const fromScope = fromUser ? getScopeIdForUser(fromUser) : null;
      if (!managerScope || !fromScope || String(managerScope) !== String(fromScope)) {
        return res.status(403).json({ ok: false, message: 'Not allowed (out of your scope)' });
      }
    } else {
      return res.status(403).json({ ok: false, message: 'Not allowed' });
    }

    msg.removed = true;
    msg.removedBy = toObjectIdIfPossible(me._id);
    msg.removedAt = new Date();
    await msg.save();

    const io = req.app && req.app.get && req.app.get('io');
    if (io) io.emit('help:delete', { _id: String(msg._id), removedBy: String(me._id) });

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /help/:id ERROR', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/help/react/:id - toggle reaction
 */
router.post('/react/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const emoji = (req.body && req.body.emoji) ? String(req.body.emoji).slice(0, 8) : null;
    if (!emoji) return res.status(400).json({ ok: false, message: 'Emoji required' });
    if (!isObjectIdString(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const msg = await HelpMessage.findById(id);
    if (!msg || msg.removed) return res.status(404).json({ ok: false, message: 'Not found' });

    const uid = toObjectIdIfPossible(req.user._id);
    const existsIdx = msg.reactions.findIndex(r => String(r.by) === String(uid) && r.emoji === emoji);
    if (existsIdx >= 0) msg.reactions.splice(existsIdx, 1);
    else msg.reactions.push({ by: uid, emoji });
    await msg.save();

    const io = req.app && req.app.get && req.app.get('io');
    if (io) io.emit('help:update', { _id: String(msg._id), reactions: msg.reactions });

    return res.json({ ok: true, reactions: msg.reactions });
  } catch (err) {
    console.error('POST /help/react/:id ERROR', err && (err.stack || err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/help/problems - static troubleshooting topics
 */
router.get('/problems', auth, async (req, res) => {
  const topics = [
    { id: 'vote', title: 'Vote / Poll Issues', steps: [
      'Check that vote is published',
      'Ensure students are in the allowed groups',
      'If results not updating, ask students to refresh page',
      'Contact manager if issue persists'
    ]},
    { id: 'exam-results', title: 'Exam / Results Issues', steps: [
      'Verify exam has been graded',
      'Check student(s) assigned to the exam',
      'If incorrect score, contact the teacher to regrade'
    ]},
    { id: 'finance', title: 'Finance / Payments Problems', steps: [
      'Ensure payment type exists',
      'Verify student account',
      'Contact the manager for payment reconciliation'
    ]},
    { id: 'attendance', title: 'Attendance Problems', steps: [
      'Check teacher has selected correct class',
      'Ensure date selection is correct',
      'If absent toggle not working, refresh and retry'
    ]},
    { id: 'other', title: 'Other / General', steps: [
      'Describe the issue with steps to reproduce',
      'Attach screenshots if available',
      'Select correct target recipient (manager/admin) and send'
    ]}
  ];
  res.json({ ok: true, topics });
});

module.exports = router;

