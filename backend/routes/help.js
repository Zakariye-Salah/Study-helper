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

// // scope id helper: prefer schoolId, otherwise manager._id
// function getScopeIdForUser(user) {
//   if (!user) return null;
//   if (user.schoolId) return String(user.schoolId);
//   if ((user.role || '').toLowerCase() === 'manager') return String(user._id);
//   return null;
// }

// /**
//  * Helper: fetch basic owner info (User | Student | Teacher)
//  * returns { _id, schoolId, createdBy, role? } or null
//  */
// async function findAnyUserById(id) {
//   if (!id) return null;
//   const sId = String(id);
//   let u = await User.findById(sId).select('_id schoolId createdBy role').lean().catch(()=>null);
//   if (u) return u;
//   u = await Student.findById(sId).select('_id schoolId createdBy').lean().catch(()=>null);
//   if (u) return u;
//   u = await Teacher.findById(sId).select('_id schoolId createdBy').lean().catch(()=>null);
//   if (u) return u;
//   return null;
// }

// /**
//  * Helper: collect recipients in a given scope. role may be 'student','teacher','manager','admin' or null for all.
//  * returns array of objects with {_id}
//  */
// async function collectRecipientsInScope(role, scopeId, limit = 5000) {
//   const q = { $or: [{ schoolId: toObjectIdIfPossible(scopeId) }, { createdBy: toObjectIdIfPossible(scopeId) }] };
//   const out = [];
//   // Users first (managers/admins/others stored as User)
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
//   // de-duplicate
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

//     if (isAdmin) {
//       const messages = await HelpMessage.find(base).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
//       return res.json({ ok: true, messages });
//     }

//     // Candidate filter: include broadcast, messages to my role, private to me, my own messages
//     const or = [
//       { broadcastToAll: true },
//       { toRole: role },
//       { toUser: toObjectIdIfPossible(me._id) },
//       { from: toObjectIdIfPossible(me._id) }
//     ];

//     const candidates = await HelpMessage.find(Object.assign({}, base, { $or: or }))
//       .sort({ createdAt: -1 })
//       .limit(Math.max(limit * 3, 500))
//       .lean();

//     const requesterScope = getScopeIdForUser(me); // may be null
//     const out = [];

//     // For each candidate, resolve its sender and decide if visible
//     for (const m of candidates) {
//       // If private -> only owner or manager in scope should see (admins handled above)
//       if (m.private) {
//         if (String(m.from) === String(me._id)) { out.push(m); continue; }
//         if (isManager) {
//           // manager sees private messages from users in their scope
//           const sender = await findAnyUserById(m.from);
//           if (!sender) continue;
//           const senderScope = getScopeIdForUser(sender);
//           if (requesterScope && senderScope && String(requesterScope) === String(senderScope)) {
//             out.push(m); continue;
//           }
//         }
//         // otherwise skip private
//         continue;
//       }

//       // Non-private: enforce scope equality between requester and sender (unless toRole targeted at requester's role and sender is in same scope)
//       // Resolve sender scope
//       const sender = await findAnyUserById(m.from);
//       const senderScope = sender ? getScopeIdForUser(sender) : null;

//       // If message is role-targeted (toRole === requester's role)
//       if (m.toRole && String(m.toRole) === String(role)) {
//         // require senderScope === requesterScope (so role posts from other schools are not visible)
//         if (!senderScope || !requesterScope) {
//           // If either side missing scope, be conservative: only show if both missing and sender equals requester (rare)
//           if (String(m.from) === String(me._id)) out.push(m);
//           continue;
//         }
//         if (String(senderScope) === String(requesterScope)) {
//           out.push(m);
//         }
//         continue;
//       }

//       // If it's a broadcastToAll => show only if senderScope === requesterScope
//       if (m.broadcastToAll) {
//         if (senderScope && requesterScope && String(senderScope) === String(requesterScope)) {
//           out.push(m);
//         }
//         continue;
//       }

//       // If message to a specific user (private-to-user) was handled earlier; if it's from me, already included
//       if (m.toUser && String(m.toUser) === String(me._id)) {
//         out.push(m); continue;
//       }

//       // If message is from someone in my scope (senderScope === requesterScope) allow it
//       if (senderScope && requesterScope && String(senderScope) === String(requesterScope)) {
//         out.push(m); continue;
//       }

//       // Otherwise ignore
//     }

//     // Pagination
//     const sliced = out.slice(skip, skip + limit);
//     return res.json({ ok: true, messages: sliced });
//   } catch (err) {
//     console.error('GET /help ERROR', err && (err.stack || err));
//     res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * POST /api/help
//  * Accepts { text, toRole?, private?, broadcastToAll?, replyTo? }
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

//     if (!isAdmin && !isManager) {
//       if (toRole !== 'manager') return res.status(403).json({ ok: false, message: 'Students/Teachers may only message managers' });
//     }

//     const payload = {
//       from: toObjectIdIfPossible(me._id),
//       fromName: me.fullname || me.name || me.email || '',
//       text,
//       replyTo: body.replyTo ? toObjectIdIfPossible(body.replyTo) : null,
//       broadcastToAll: !!body.broadcastToAll,
//       toRole: toRole || null,
//       toUser: null,
//       private: isPrivate
//     };

//     const msg = new HelpMessage(payload);
//     await msg.save();

//     // emit only to recipients in sender scope (or global for admins)
//     try {
//       const io = req.app && req.app.get && req.app.get('io');
//       if (!io) return res.json({ ok: true, message: msg });

//       const out = {
//         _id: String(msg._id),
//         from: String(msg.from),
//         fromName: msg.fromName,
//         text: msg.text,
//         toUser: null,
//         toRole: msg.toRole || null,
//         broadcastToAll: !!msg.broadcastToAll,
//         replyTo: msg.replyTo ? String(msg.replyTo) : null,
//         createdAt: msg.createdAt,
//         reactions: msg.reactions || [],
//         private: !!msg.private
//       };

//       // always notify sender
//       io.to('user:' + String(me._id)).emit('help:new', out);

//       const senderScope = getScopeIdForUser(me);

//       // private -> managers in scope
//       if (msg.private) {
//         if (isAdmin && !senderScope) {
//           // admin private => global manager room
//           io.to('role:manager').emit('help:new', out);
//         } else if (senderScope) {
//           const recipients = await collectRecipientsInScope('manager', senderScope, 2000);
//           for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
//         }
//         return res.json({ ok: true, message: msg });
//       }

//       // If toRole specified
//       if (msg.toRole) {
//         if (isAdmin && !senderScope) {
//           io.to('role:' + msg.toRole).emit('help:new', out);
//         } else if (senderScope) {
//           const recipients = await collectRecipientsInScope(msg.toRole, senderScope, 5000);
//           for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
//         }
//       }

//       // broadcastToAll -> all users in sender scope
//       if (msg.broadcastToAll) {
//         if (isAdmin && !senderScope) {
//           // global
//           io.to('role:student').emit('help:new', out);
//           io.to('role:teacher').emit('help:new', out);
//           io.to('role:manager').emit('help:new', out);
//           io.to('role:admin').emit('help:new', out);
//         } else if (senderScope) {
//           const recipients = await collectRecipientsInScope(null, senderScope, 5000);
//           for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
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
//  * POST /api/help/react/:id
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
//  * GET /api/help/problems
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
  try { const s = String(id || ''); if (isObjectIdString(s)) return new mongoose.Types.ObjectId(s); } catch(e) {}
  return id;
}

// scope id helper: prefer schoolId, otherwise createdBy (manager id), otherwise manager._id
function getScopeIdForUser(user) {
  if (!user) return null;
  if (user.schoolId) return String(user.schoolId);
  if (user.createdBy) return String(user.createdBy);
  if ((user.role || '').toLowerCase() === 'manager') return String(user._id);
  return null;
}

/**
 * Helper: fetch basic owner info (User | Student | Teacher)
 * returns { _id, schoolId, createdBy, role?, fullname? } or null
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
 * Helper: collect recipients in a given scope. role may be 'student','teacher','manager','admin' or null for all.
 * returns array of string ids (user/student/teacher ids)
 */
async function collectRecipientsInScope(role, scopeId, limit = 5000) {
  if (!scopeId) return [];
  const q = { $or: [{ schoolId: toObjectIdIfPossible(scopeId) }, { createdBy: toObjectIdIfPossible(scopeId) }] };
  const out = [];
  const userQ = Object.assign({}, q);
  if (role) userQ.role = role;
  const users = await User.find(userQ).select('_id').limit(limit).lean().catch(()=>[]);
  users.forEach(u => out.push(String(u._id)));
  if (!role || role === 'student') {
    const students = await Student.find(q).select('_id').limit(limit).lean().catch(()=>[]);
    students.forEach(s => out.push(String(s._id)));
  }
  if (!role || role === 'teacher') {
    const teachers = await Teacher.find(q).select('_id').limit(limit).lean().catch(()=>[]);
    teachers.forEach(t => out.push(String(t._id)));
  }
  // include the scopeId itself (useful if manager id is used directly)
  out.push(String(scopeId));
  return Array.from(new Set(out)).slice(0, limit);
}

/**
 * GET /api/help
 * Returns messages visible to current user (private + scope filtering)
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
    const base = { removed: false };

    // admin sees everything
    if (isAdmin) {
      const messages = await HelpMessage.find(base).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
      console.debug('[help] admin fetched messages:', messages.length);
      return res.json({ ok: true, messages });
    }

    // Determine requester scope (schoolId or createdBy/manager._id)
    const requesterScope = getScopeIdForUser(me); // may be null
    console.debug('[help] requester scope for', String(me._id), '->', requesterScope);

    let scopeMemberIds = [];
    if (requesterScope) {
      scopeMemberIds = await collectRecipientsInScope(null, requesterScope, 5000);
      if (!scopeMemberIds.includes(String(me._id))) scopeMemberIds.push(String(me._id));
    }

    // Build OR query so we fetch reasonable candidate messages
    const or = [];
    or.push({ toUser: toObjectIdIfPossible(me._id) });
    or.push({ from: toObjectIdIfPossible(me._id) });

    if (scopeMemberIds.length > 0) {
      // fetch messages from members of my scope
      or.push({ from: { $in: scopeMemberIds.map(id => toObjectIdIfPossible(id)) } });
      // role-targeted messages where sender is in my scope
      or.push({ $and: [{ toRole: role }, { from: { $in: scopeMemberIds.map(id => toObjectIdIfPossible(id)) } }] });
      // broadcasts from members of my scope
      or.push({ $and: [{ broadcastToAll: true }, { from: { $in: scopeMemberIds.map(id => toObjectIdIfPossible(id)) } }] });
      // managers see private messages from scope members
      if (isManager) or.push({ $and: [{ private: true }, { from: { $in: scopeMemberIds.map(id => toObjectIdIfPossible(id)) } }] });
    } else {
      // conservative fallback if no known scope: fetch messages explicitly for my role and global broadcasts
      or.push({ toRole: role });
      or.push({ broadcastToAll: true });
    }

    const q = Object.assign({}, base, { $or: or });

    // fetch candidates
    const candidates = await HelpMessage.find(q)
      .sort({ createdAt: -1 })
      .limit(Math.max(limit * 3, 500))
      .lean();

    console.debug('[help] get candidate messages:', candidates.length);

    // pre-resolve senders (reduce repeated DB hits)
    const senderIds = Array.from(new Set(candidates.map(m => String(m.from)).filter(Boolean)));
    const senderMap = {};
    if (senderIds.length) {
      const promises = senderIds.map(id => findAnyUserById(id));
      const senders = await Promise.all(promises);
      senders.forEach(s => { if (s) senderMap[String(s._id)] = s; });
    }

    const out = [];
    for (const m of candidates) {
      // Owner sees own messages
      if (String(m.from) === String(me._id)) { out.push(m); continue; }

      // Private messages: managers in same scope only (admin handled earlier)
      if (m.private) {
        if (isManager && requesterScope) {
          const sender = senderMap[String(m.from)] || await findAnyUserById(m.from);
          const senderScope = sender ? getScopeIdForUser(sender) : null;
          if (senderScope && String(senderScope) === String(requesterScope)) { out.push(m); continue; }
        }
        continue;
      }

      // For non-private messages: if we have a requesterScope, prefer same-scope messages, but also allow
      // global role-targeted / global broadcasts (those with senderScope === null).
      if (requesterScope) {
        const sender = senderMap[String(m.from)] || await findAnyUserById(m.from);
        const senderScope = sender ? getScopeIdForUser(sender) : null;

        // role-targeted messages: allow if senderScope === requesterScope OR senderScope === null (global)
        if (m.toRole && String(m.toRole) === String(role)) {
          if (!senderScope || String(senderScope) === String(requesterScope)) { out.push(m); }
          continue;
        }

        // broadcastToAll: allow if senderScope === requesterScope OR senderScope === null (global)
        if (m.broadcastToAll) {
          if (!senderScope || String(senderScope) === String(requesterScope)) { out.push(m); }
          continue;
        }

        // direct-to-user (explicit)
        if (m.toUser && String(m.toUser) === String(me._id)) { out.push(m); continue; }
        if (m.from && String(m.from) === String(me._id)) { out.push(m); continue; }

        // otherwise allow only if sender is in same scope
        if (senderScope && String(senderScope) === String(requesterScope)) { out.push(m); continue; }

        // skip other messages
        continue;
      } else {
        // no requester scope: show messages explicitly for me or for my role or global broadcast
        if (m.toUser && String(m.toUser) === String(me._id)) { out.push(m); continue; }
        if (m.from && String(m.from) === String(me._id)) { out.push(m); continue; }
        if (m.toRole && String(m.toRole) === String(role)) { out.push(m); continue; }
        if (m.broadcastToAll) { out.push(m); continue; }
      }
    }

    const sliced = out.slice(skip, skip + limit);
    console.debug('[help] final messages to return:', sliced.length);
    return res.json({ ok: true, messages: sliced });
  } catch (err) {
    console.error('GET /help ERROR', err && (err.stack || err));
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/help
 * Accepts { text, toRole?, private?, broadcastToAll?, replyTo?, toUser? }
 */
router.post('/', auth, async (req, res) => {
  try {
    const me = req.user;
    if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

    const role = (me.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const isManager = role === 'manager';
    const body = req.body || {};

    const text = (body.text || '').trim();
    if (!text) return res.status(400).json({ ok: false, message: 'Empty message' });

    const isPrivate = !!body.private;
    let toRole = body.toRole || null;
    if (isPrivate) toRole = 'manager';

    // Students/Teachers rules:
    // - allowed to message managers (toRole='manager') or send direct messages (toUser)
    // - allowed to broadcast (broadcastToAll)
    // - disallow targeting other roles (e.g. student->teacher) directly
    if (!isAdmin && !isManager) {
      if (toRole && toRole !== 'manager' && !body.toUser && !body.broadcastToAll) {
        return res.status(403).json({ ok: false, message: 'Students/Teachers may only message managers / send direct messages / broadcast' });
      }
    }

    const senderScope = getScopeIdForUser(me);
    console.debug('[help] POST senderScope for', String(me._id), '->', senderScope);

    // Managers require a scope to message students/teachers or broadcast
    if (isManager && (toRole === 'student' || toRole === 'teacher' || body.broadcastToAll)) {
      if (!senderScope) return res.status(403).json({ ok: false, message: 'Manager scope required to message these recipients' });
    }

    // Build message payload and save
    const payload = {
      from: toObjectIdIfPossible(me._id),
      fromName: me.fullname || me.name || me.email || '',
      text,
      replyTo: body.replyTo ? toObjectIdIfPossible(body.replyTo) : null,
      broadcastToAll: !!body.broadcastToAll,
      toRole: toRole || null,
      toUser: body.toUser ? toObjectIdIfPossible(body.toUser) : null,
      private: isPrivate
    };

    const msg = new HelpMessage(payload);
    await msg.save();

    // Try to emit via socket.io to intended recipients (graceful fallback if io missing)
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (!io) {
        console.warn('[help] io not available - saved message only');
        return res.json({ ok: true, message: msg });
      }

      const out = {
        _id: String(msg._id),
        from: String(msg.from),
        fromName: msg.fromName,
        text: msg.text,
        toUser: msg.toUser ? String(msg.toUser) : null,
        toRole: msg.toRole || null,
        broadcastToAll: !!msg.broadcastToAll,
        replyTo: msg.replyTo ? String(msg.replyTo) : null,
        createdAt: msg.createdAt,
        reactions: msg.reactions || [],
        private: !!msg.private
      };

      // always notify sender
      io.to('user:' + String(me._id)).emit('help:new', out);

      // private -> managers in scope (or global if admin without scope)
      if (msg.private) {
        if (isAdmin && !senderScope) {
          io.to('role:manager').emit('help:new', out);
          console.debug('[help] emitted private to all managers (admin sender, no scope)');
        } else if (senderScope) {
          const recipients = await collectRecipientsInScope('manager', senderScope, 2000);
          console.debug('[help] private recipients (managers) for scope', senderScope, recipients.length);
          for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
        } else {
          // Non-admin sender with no scope -> still notify global managers
          io.to('role:manager').emit('help:new', out);
          console.debug('[help] private emitted globally to managers (no sender scope)');
        }
        return res.json({ ok: true, message: msg });
      }

      // toRole -> recipients of that role in sender scope (or global role room for admins)
      if (msg.toRole) {
        if (isAdmin && !senderScope) {
          io.to('role:' + msg.toRole).emit('help:new', out);
          console.debug('[help] emitted to role room (admin sender, global role):', msg.toRole);
        } else if (senderScope) {
          const recipients = await collectRecipientsInScope(msg.toRole, senderScope, 5000);
          console.debug('[help] toRole recipients for', msg.toRole, 'scope', senderScope, '->', recipients.length);
          for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
        } else {
          // Non-admin sender with no scope: allow sending to managers globally (e.g. student -> manager)
          if (msg.toRole === 'manager') {
            io.to('role:manager').emit('help:new', out);
            console.debug('[help] emitted to role:manager globally (sender has no scope)');
          }
        }
      }

      // direct toUser
      if (msg.toUser) {
        io.to('user:' + String(msg.toUser)).emit('help:new', out);
        console.debug('[help] emitted direct to user:', msg.toUser);
      }

      // broadcastToAll -> all users in sender scope (or global if admin or if sender has no scope)
      if (msg.broadcastToAll) {
        if (isAdmin && !senderScope) {
          // admin with no scope -> global broadcast to role rooms
          io.to('role:student').emit('help:new', out);
          io.to('role:teacher').emit('help:new', out);
          io.to('role:manager').emit('help:new', out);
          io.to('role:admin').emit('help:new', out);
          console.debug('[help] broadcast emitted globally (admin)');
        } else if (senderScope) {
          // broadcast to members of sender's scope
          const recipients = await collectRecipientsInScope(null, senderScope, 5000);
          console.debug('[help] broadcast recipients for scope', senderScope, recipients.length);
          for (const rid of recipients) io.to('user:' + String(rid)).emit('help:new', out);
        } else {
          // Non-admin sender with no scope => fallback to global broadcast to role rooms.
          io.to('role:student').emit('help:new', out);
          io.to('role:teacher').emit('help:new', out);
          io.to('role:manager').emit('help:new', out);
          console.debug('[help] broadcast emitted globally (no sender scope)');
        }
      }

      return res.json({ ok: true, message: msg });
    } catch (sockErr) {
      console.warn('help emit error', sockErr);
      return res.json({ ok: true, message: msg });
    }
  } catch (err) {
    console.error('POST /help ERROR', err && (err.stack || err));
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * PUT /api/help/:id - edit (owner or admin)
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
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/help/:id - owner/admin or manager in scope
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
    await msg.save();

    const io = req.app && req.app.get && req.app.get('io');
    if (io) io.emit('help:delete', { _id: String(msg._id), removedBy: String(me._id) });

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /help/:id ERROR', err && (err.stack || err));
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/help/react/:id - toggle reaction
 */
router.post('/react/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const emoji = (req.body && req.body.emoji) ? String(req.body.emoji).slice(0,8) : null;
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
    res.status(500).json({ ok: false, message: 'Server error' });
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
