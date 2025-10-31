
// // File: backend/routes/competitions.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const { Competition, CompetitionParticipant } = require('../models/Competition');

// DEFAULT DURATION: env COMP_DEFAULT_DURATION_MS or 24h
const DEFAULT_DURATION_MS = Number(process.env.COMP_DEFAULT_DURATION_MS || 24*60*60*1000);

// --- Auth helpers (same pattern) ---
function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    const token = auth && typeof auth === 'string' && auth.split(' ')[0] === 'Bearer'
      ? auth.split(' ')[1]
      : (req.body && req.body.token) || null;
    if (!token) return res.status(401).json({ ok:false, error:'Authentication required' });
    jwt.verify(token, JWT_SECRET, (err, payload) => {
      if (err) return res.status(401).json({ ok:false, error:'Invalid token' });
      req.user = payload;
      next();
    });
  } catch (err) {
    console.error('requireAuth error', err && (err.stack || err));
    return res.status(401).json({ ok:false, error:'Auth error' });
  }
}
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(403).json({ ok:false, error:'Not allowed' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin') return res.status(403).json({ ok:false, error:'Admin only' });
  return next();
}

function devError(res, tag, err){
  console.error(tag, err && (err.stack || err));
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ ok:false, error:'Server error' });
  }
  return res.status(500).json({ ok:false, error: err && (err.message || String(err)), name: err && err.name, stack: err && err.stack });
}

function parseIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

// Logging middleware
router.use((req,res,next) => {
  try { console.log('[competitions] %s %s - query=%o body=%o auth=%s', req.method, req.originalUrl || req.url, req.query, req.body, !!req.headers.authorization); } catch(e) {}
  next();
});

// --- debug endpoint to show server now and active logic
router.get('/__debug/info', async (req, res) => {
  try {
    const now = new Date();
    const active = await Competition.findActive(now).catch(()=>null);
    const upcoming = await Competition.findUpcoming(now, 5).catch(()=>[]);
    return res.json({ ok:true, serverNow: now.toISOString(), active: active || null, upcoming });
  } catch(err) { return devError(res, 'GET /__debug/info', err); }
});

// list
router.get('/', async (req, res) => {
  try {
    const includeDeleted = String(req.query.all || 'false') === 'true';
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip = Math.max(0, Number(req.query.skip || 0));
    const filter = includeDeleted ? {} : { deleted: false };
    if (req.query.search) filter.$text = { $search: String(req.query.search) };
    const rows = await Competition.find(filter).sort({ startAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean();
    return res.json({ ok:true, data: rows });
  } catch(err) { return devError(res, 'GET /competitions', err); }
});

// current (active)
router.get('/current', async (req, res) => {
  try {
    const now = new Date();
    const active = await Competition.findActive(now);
    if (!active) {
      console.log('[competitions] current - none found at', now.toISOString());
    } else {
      console.log('[competitions] current ->', active._id, active.name, active.startAt, active.endAt);
    }
    return res.json({ ok:true, competition: active || null });
  } catch(err){ return devError(res, 'GET /competitions/current', err); }
});

// upcoming (next X)
router.get('/upcoming', async (req, res) => {
  try {
    const now = new Date();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 5)));
    const upcoming = await Competition.findUpcoming(now, limit);
    return res.json({ ok:true, data: upcoming });
  } catch(err){ return devError(res, 'GET /competitions/upcoming', err); }
});

// active-or-upcoming: helpful for frontends to display something when no active
router.get('/active-or-upcoming', async (req, res) => {
  try {
    const now = new Date();
    const active = await Competition.findActive(now);
    if (active) return res.json({ ok:true, mode: 'active', competition: active });
    const upcoming = await Competition.findUpcoming(now, 1);
    return res.json({ ok:true, mode: 'upcoming', competition: (upcoming && upcoming[0]) || null });
  } catch(err){ return devError(res, 'GET /competitions/active-or-upcoming', err); }
});

// leaderboard fallback (active)
router.get('/leaderboard', async (req, res) => {
  try {
    const now = new Date();
    const active = await Competition.findActive(now);
    if (!active) return res.json({ ok:true, data: [], competitionId: null });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const rows = await CompetitionParticipant.find({ competitionId: active._id }).sort({ totalPoints: -1 }).limit(limit).lean();
    return res.json({ ok:true, data: rows, competitionId: active._id });
  } catch(err){ return devError(res, 'GET /competitions/leaderboard', err); }
});

// leaderboard by id
router.get('/:id/leaderboard', async (req, res) => {
  try {
    let competitionId = req.params.id;
    if (competitionId === 'current') {
      const active = await Competition.findActive(new Date());
      if (!active) return res.json({ ok:true, data: [], competitionId: null });
      competitionId = String(active._id);
    }
    if (!mongoose.Types.ObjectId.isValid(competitionId)) return res.status(400).json({ ok:false, error:'Invalid competition id' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const rows = await CompetitionParticipant.find({ competitionId }).sort({ totalPoints: -1 }).limit(limit).lean();
    return res.json({ ok:true, data: rows });
  } catch(err){ return devError(res, 'GET /competitions/:id/leaderboard', err); }
});

// get by id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ ok:false, error:'Invalid id' });
    const doc = await Competition.findById(id).lean();
    if (!doc) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true, competition: doc });
  } catch(err){ return devError(res, 'GET /competitions/:id', err); }
});

function normalizeDatesForCreate(start, end) {
  let startAt = parseIsoOrNull(start);
  let endAt = parseIsoOrNull(end);

  if (!startAt && !endAt) {
    startAt = new Date();
    endAt = new Date(startAt.getTime() + DEFAULT_DURATION_MS);
  } else if (startAt && !endAt) {
    endAt = new Date(startAt.getTime() + DEFAULT_DURATION_MS);
  } else if (!startAt && endAt) {
    startAt = null;
  }
  return { startAt, endAt };
}

// create (admin)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('POST /api/competitions body=', req.body, 'user=', req.user && (req.user._id || req.user.id || req.user));
    const payloadName = (req.body.name || req.body.title || '').trim();
    const description = req.body.description || '';
    const start = req.body.startAt || req.body.start || null;
    const end = req.body.endAt || req.body.end || null;
    const published = typeof req.body.published === 'boolean' ? req.body.published : true;

    if (!payloadName) return res.status(400).json({ ok:false, error: 'Name (or title) required' });

    const { startAt, endAt } = normalizeDatesForCreate(start, end);
    if (startAt && endAt && startAt > endAt) return res.status(400).json({ ok:false, error: 'startAt must be before endAt' });

    let createdBy = null;
    try {
      const maybe = req.user && (req.user._id || req.user.id || null);
      if (maybe && mongoose.Types.ObjectId.isValid(String(maybe))) {
        createdBy = mongoose.Types.ObjectId(String(maybe));
      }
    } catch (e) { createdBy = null; }

    const doc = new Competition({
      name: payloadName,
      title: payloadName,
      description,
      startAt,
      endAt,
      createdBy,
      published
    });

    await doc.save();

    // emit socket updates (if io available)
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        io.emit('competition:created', { competitionId: String(doc._id), startAt: doc.startAt, endAt: doc.endAt, name: doc.name });
        io.emit('competition:updated', { competitionId: String(doc._id), startAt: doc.startAt, endAt: doc.endAt, name: doc.name });
      }
    } catch (e) { console.warn('competition emit failed', e && e.message); }

    return res.json({ ok:true, competition: doc });
  } catch(err) { return devError(res, 'POST /competitions', err); }
});

// TEMP no-auth creation if env allows (for quick testing)
if (String(process.env.ALLOW_NOAUTH_COMP_CREATION || '').toLowerCase() === 'true') {
  router.post('/__test-create-noauth', async (req, res) => {
    try {
      const payloadName = (req.body.name || req.body.title || '').trim();
      if (!payloadName) return res.status(400).json({ ok:false, error: 'Name required' });
      const { startAt, endAt } = normalizeDatesForCreate(req.body.startAt, req.body.endAt);
      const doc = new Competition({ name: payloadName, title: payloadName, description: req.body.description || '', startAt, endAt });
      await doc.save();
      console.log('[competitions] __test-create-noauth created', doc._id, 'startAt=', startAt, 'endAt=', endAt);
      return res.json({ ok:true, competition: doc });
    } catch(err) { return devError(res, 'POST /competitions/__test-create-noauth', err); }
  });
  console.log('[competitions] __test-create-noauth route enabled (ALLOW_NOAUTH_COMP_CREATION=true)');
}

// update
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ ok:false, error:'Invalid id' });

    const upd = {};
    if (typeof req.body.name !== 'undefined' || typeof req.body.title !== 'undefined') {
      const nm = (req.body.name || req.body.title || '').trim();
      if (nm) { upd.name = nm; upd.title = nm; }
      else { upd.name = ''; upd.title = ''; }
    }
    ['description','published'].forEach(k => { if (typeof req.body[k] !== 'undefined') upd[k] = req.body[k]; });
    if (req.body.startAt || req.body.start) upd.startAt = parseIsoOrNull(req.body.startAt || req.body.start);
    if (req.body.endAt || req.body.end) upd.endAt = parseIsoOrNull(req.body.endAt || req.body.end);
    if (upd.startAt && upd.endAt && upd.startAt > upd.endAt) return res.status(400).json({ ok:false, error:'startAt must be before endAt' });
    // fallback if admin set start but not end
    if (upd.startAt && !upd.endAt) upd.endAt = new Date(upd.startAt.getTime() + DEFAULT_DURATION_MS);

    upd.updatedAt = new Date();

    const updated = await Competition.findByIdAndUpdate(id, { $set: upd }, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ ok:false, error:'Not found' });

    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        io.emit('competition:updated', { competitionId: String(updated._id), startAt: updated.startAt, endAt: updated.endAt, name: updated.name });
      }
    } catch (e) {}

    return res.json({ ok:true, competition: updated });
  } catch(err){ return devError(res, 'PUT /competitions/:id', err); }
});

// delete (soft)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ ok:false, error:'Invalid id' });
    await Competition.findByIdAndUpdate(id, { $set: { deleted: true, updatedAt: new Date() } });
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        io.emit('competition:updated', { competitionId: id, deleted: true });
      }
    } catch (e) {}
    return res.json({ ok:true });
  } catch(err){ return devError(res, 'DELETE /competitions/:id', err); }
});

/**
 * Participant endpoints (simple)
 * POST /:id/participants  -> join (body: studentId, name)
 * POST /:id/participants/points -> update points (admin or game engine)
 */
router.post('/:id/participants', requireAuth, async (req, res) => {
  try {
    const compId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(compId)) return res.status(400).json({ ok:false, error:'Invalid competition id' });
    const studentId = req.body.studentId || (req.user && req.user._id);
    if (!studentId || !mongoose.Types.ObjectId.isValid(String(studentId))) return res.status(400).json({ ok:false, error:'studentId required' });
    const name = req.body.name || (req.user && (req.user.fullname || req.user.name)) || '';
    const existing = await CompetitionParticipant.findOne({ competitionId: compId, studentId });
    if (existing) return res.json({ ok:true, participant: existing });
    const p = new CompetitionParticipant({ competitionId: compId, studentId, name, totalPoints: 0 });
    await p.save();
    return res.json({ ok:true, participant: p });
  } catch(err){ return devError(res, 'POST /competitions/:id/participants', err); }
});

router.post('/:id/participants/points', requireAuth, async (req, res) => {
  try {
    const compId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(compId)) return res.status(400).json({ ok:false, error:'Invalid competition id' });
    const studentId = req.body.studentId || (req.user && req.user._id);
    const delta = Number(req.body.delta || 0);
    if (!studentId || !mongoose.Types.ObjectId.isValid(String(studentId))) return res.status(400).json({ ok:false, error:'studentId required' });
    const p = await CompetitionParticipant.findOneAndUpdate(
      { competitionId: compId, studentId },
      { $inc: { totalPoints: delta } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    // emit leaderboard update event if io available
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        io.emit('leaderboard_update', { competitionId: compId });
      }
    } catch (e) {}
    return res.json({ ok:true, participant: p });
  } catch(err){ return devError(res, 'POST /competitions/:id/participants/points', err); }
});

module.exports = router;

