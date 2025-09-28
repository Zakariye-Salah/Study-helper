// backend/routes/zoom.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const Meeting = require('../models/Meeting');
const mongoose = require('mongoose');

/**
 * buildInArray: return possible string/ObjectId variants for an id value
 */
function buildInArray(val) {
  const out = [];
  if (!val) return out;
  if (val instanceof mongoose.Types.ObjectId) {
    out.push(val, String(val));
  } else if (typeof val === 'string') {
    const s = val.trim();
    if (s) {
      out.push(s);
      if (mongoose.Types.ObjectId.isValid(s)) {
        try { out.push(new mongoose.Types.ObjectId(s)); } catch (e) {}
      }
    }
  } else if (typeof val === 'object' && val !== null) {
    try {
      const s = String(val);
      if (s) {
        out.push(s);
        if (mongoose.Types.ObjectId.isValid(s)) out.push(new mongoose.Types.ObjectId(s));
      }
    } catch (e) {}
  }
  return Array.from(new Set(out));
}

/**
 * resolveOwnerFullname: attempts to find a fullname for an ownerId by trying likely models
 * returns string or null
 */
async function resolveOwnerFullname(ownerId) {
  if (!ownerId) return null;
  const ownerIdStr = String(ownerId);

  // candidate model names/filenames to try (some projects use capitalized filenames)
  const candidates = [
    'Teacher', 'teacher',
    'Manager', 'manager',
    'Admin', 'admin',
    'User', 'user'
  ];

  for (const name of candidates) {
    try {
      // require may throw if file doesn't exist
      // prefers models/Teacher.js etc.
      // if your project has different filenames, add them here
      // e.g. require('../models/Instructor')
      // This require is wrapped in try/catch intentionally.
      const Model = require(`../models/${name}`);
      if (!Model) continue;
      const doc = await Model.findById(ownerIdStr).select('fullname name').lean().catch(()=>null);
      if (doc) {
        return doc.fullname || doc.name || null;
      }
    } catch (e) {
      // ignore and try next candidate
      continue;
    }
  }

  // fallback: return the ownerId string
  return ownerIdStr || null;
}

/* GET /api/zoom - list meetings (scoped by role)
   Returns meetings populated with class objects and ownerFullname resolved safely.
*/
router.get('/', auth, async (req, res) => {
  try {
    const role = (req.user.role || '').toLowerCase();
    const q = {};

    if (role === 'teacher') {
      q.$or = [{ ownerId: req.user._id }];
    } else if (role === 'student') {
      const Student = require('../models/Student');
      const s = await Student.findById(req.user._id).lean();
      if (!s) return res.json({ items: [] });

      const studentId = req.user._id;
      const classIdStr = s.classId ? String(s.classId) : null;

      const orClauses = [];
      const sidArr = buildInArray(studentId);
      if (sidArr.length) orClauses.push({ studentIds: { $in: sidArr } });

      if (classIdStr) {
        const cidArr = buildInArray(classIdStr);
        if (cidArr.length) orClauses.push({ classIds: { $in: cidArr } });
      }

      if (orClauses.length === 0) return res.json({ items: [] });
      q.$or = orClauses;
    } else {
      // manager/admin - no extra filters
    }

    if (q.$or && (!Array.isArray(q.$or) || q.$or.length === 0)) delete q.$or;

    // populate only class info (safe)
    let items = await Meeting.find(q)
      .sort({ startsAt: 1, createdAt: -1 })
      .populate({ path: 'classIds', select: 'name classId' })
      .lean();

    // resolve ownerFullname for each meeting safely (do not rely on ownerType reference names)
    for (const m of items) {
      try {
        m.ownerFullname = await resolveOwnerFullname(m.ownerId);
      } catch (e) {
        m.ownerFullname = m.ownerId ? String(m.ownerId) : null;
        console.warn('owner resolution failed for meeting', m._id, e && e.message ? e.message : e);
      }
    }

    res.json({ items });
  } catch (err) {
    console.error('GET /api/zoom error', err && (err.stack || err));
    const detail = process.env.NODE_ENV === 'production' ? (err.message || null) : (err.stack || err.message || null);
    res.status(500).json({ message: 'Server error', detail });
  }
});

/* POST /api/zoom - create meeting (teacher/manager/admin) */
router.post('/', auth, roles(['teacher','manager','admin']), async (req, res) => {
  try {
    const { title, classId, classIds = [], studentIds = [], startsAt, options = {} } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ message: 'Title is required' });

    const clsArray = (Array.isArray(classIds) && classIds.length) ? classIds : (classId ? [classId] : []);
    const cls = clsArray.map(id => {
      if (!id) return null;
      if (mongoose.Types.ObjectId.isValid(String(id))) return new mongoose.Types.ObjectId(String(id));
      return String(id);
    }).filter(Boolean);

    const sids = (Array.isArray(studentIds) ? studentIds : []).map(id => {
      if (!id) return null;
      if (mongoose.Types.ObjectId.isValid(String(id))) return new mongoose.Types.ObjectId(String(id));
      return String(id);
    }).filter(Boolean);

    const ownerId = (mongoose.Types.ObjectId.isValid(String(req.user._id)) ? new mongoose.Types.ObjectId(String(req.user._id)) : req.user._id);

    const meetingDoc = new Meeting({
      title: String(title).trim(),
      ownerId,
      ownerType: req.user.role, // keep role as-is; we don't rely on refPath for populate now
      classIds: cls,
      studentIds: sids,
      startsAt: startsAt ? new Date(startsAt) : null,
      options: options || {}
    });

    await meetingDoc.save();

    // return saved meeting with class info populated, and resolved ownerFullname
    const saved = await Meeting.findById(meetingDoc._id)
      .populate({ path: 'classIds', select: 'name classId' })
      .lean();

    if (saved) {
      saved.ownerFullname = await resolveOwnerFullname(saved.ownerId);
    }

    res.json({ ok: true, meeting: saved || meetingDoc.toObject() });
  } catch (err) {
    console.error('POST /api/zoom error', err && (err.stack || err));
    const detail = process.env.NODE_ENV === 'production' ? (err.message || null) : (err.stack || err.message || null);
    res.status(500).json({ message: 'Server error', detail });
  }
});

/* GET single meeting by meetingId or _id */
router.get('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    let m = await Meeting.findOne({ meetingId: id })
      .populate({ path: 'classIds', select: 'name classId' })
      .lean();
    if (!m && mongoose.Types.ObjectId.isValid(id)) {
      m = await Meeting.findById(id)
        .populate({ path: 'classIds', select: 'name classId' })
        .lean();
    }
    if (!m) return res.status(404).json({ message: 'Not found' });
    m.ownerFullname = await resolveOwnerFullname(m.ownerId);
    res.json({ meeting: m });
  } catch (err) {
    console.error('GET /api/zoom/:id error', err && (err.stack || err));
    const detail = process.env.NODE_ENV === 'production' ? (err.message || null) : (err.stack || err.message || null);
    res.status(500).json({ message: 'Server error', detail });
  }
});

/* DELETE /api/zoom/:id - delete meeting (owner, manager, admin) */
/* DELETE /api/zoom/:id - delete meeting (owner, manager, admin) */
router.delete('/:id', auth, roles(['teacher','manager','admin']), async (req, res) => {
  try {
    const id = req.params.id;
    let meeting = await Meeting.findOne({ meetingId: id });
    if (!meeting && mongoose.Types.ObjectId.isValid(id)) meeting = await Meeting.findById(id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    const role = (req.user.role || '').toLowerCase();
    if (String(meeting.ownerId) !== String(req.user._id) && !['admin','manager'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const meetingIdValue = meeting.meetingId;
    await Meeting.deleteOne({ _id: meeting._id });

    // --- audit log for meeting deletion (non-fatal) ---
    try {
      const MeetingAudit = require('../models/MeetingAudit');
      const byUserId = (mongoose.Types.ObjectId.isValid(String(req.user._id)) ? new mongoose.Types.ObjectId(String(req.user._id)) : null);
      await MeetingAudit.create({
        meetingId: meetingIdValue,
        action: 'meeting-deleted',
        byUserId,
        byName: req.user && (req.user.fullname || req.user.name) || String(req.user._id),
        target: null,
        meta: { deletedAt: new Date() }
      });
    } catch (e) {
      console.warn('Failed to write meeting-deleted audit', e);
    }
    // ----------------------------------------------------

    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) {
        io.in('zoom:' + meetingIdValue).emit('zoom:meeting-deleted', { meetingId: meetingIdValue });
        const clients = await io.in('zoom:' + meetingIdValue).allSockets();
        for (const sid of clients) {
          const s = io.sockets.sockets.get(sid);
          if (s) {
            try { s.leave('zoom:' + meetingIdValue); } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.warn('Could not emit meeting-deleted (non-fatal):', e);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/zoom/:id error', err && (err.stack || err));
    const detail = process.env.NODE_ENV === 'production' ? (err.message || null) : (err.stack || err.message || null);
    res.status(500).json({ message: 'Server error', detail });
  }
});


/* GET /api/zoom/:id/can-join */
router.get('/:id/can-join', auth, async (req, res) => {
  try {
    const id = req.params.id;
    let meeting = await Meeting.findOne({ meetingId: id }).lean();
    if (!meeting && mongoose.Types.ObjectId.isValid(id)) meeting = await Meeting.findById(id).lean();
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    const role = (req.user.role || '').toLowerCase();
    if (role === 'manager' || role === 'admin') return res.json({ ok: true });

    if (role === 'teacher') {
      if (String(meeting.ownerId) === String(req.user._id)) return res.json({ ok: true });
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (role === 'student') {
      const Student = require('../models/Student');
      const s = await Student.findById(req.user._id).lean();
      if (!s) return res.status(403).json({ message: 'Forbidden' });
      const classId = s.classId ? String(s.classId) : null;
      const allowedByClass = Array.isArray(meeting.classIds) && meeting.classIds.some(cid => String(cid) === classId);
      const allowedByStudent = Array.isArray(meeting.studentIds) && meeting.studentIds.some(sid => String(sid) === String(req.user._id));
      if (allowedByClass || allowedByStudent) return res.json({ ok: true });
      return res.status(403).json({ message: 'Not allowed for this meeting' });
    }

    res.status(403).json({ message: 'Forbidden' });
  } catch (err) {
    console.error('GET /api/zoom/:id/can-join error', err && (err.stack || err));
    const detail = process.env.NODE_ENV === 'production' ? (err.message || null) : (err.stack || err.message || null);
    res.status(500).json({ message: 'Server error', detail });
  }
});

module.exports = router;
