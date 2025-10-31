// backend/routes/competitions.js  (IMPROVED)
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Try to load models; fall back to mongoose.models if require fails
let Competition, CompetitionParticipant, activeCompetitionQuery;
try {
  const compModels = require('../models/Competition');
  Competition = compModels.Competition || compModels;
  CompetitionParticipant = compModels.CompetitionParticipant || compModels;
  activeCompetitionQuery = compModels.activeCompetitionQuery || null;
} catch (e) {
  Competition = mongoose.models.Competition;
  CompetitionParticipant = mongoose.models.CompetitionParticipant;
  activeCompetitionQuery = null;
}

// Auth helpers (unchanged)
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

// dev error helper — returns stack in non-production
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

/**
 * Default duration used if endAt is not given.
 * Can be overridden by env COMP_DEFAULT_DURATION_MS (milliseconds).
 * Fallback default: 24 hours
 */
const DEFAULT_DURATION_MS = Number(process.env.COMP_DEFAULT_DURATION_MS || 24 * 60 * 60 * 1000);

/**
 * getActiveCompetition(now)
 * Returns a promise resolving to the active competition (or null).
 * Active logic:
 *  - deleted must be false
 *  - startAt is either null OR <= now
 *  - endAt is either null OR >= now
 * This treats null startAt as "already started" and null endAt as "no end".
 */
function getActiveCompetition(now = new Date()) {
  if (activeCompetitionQuery) {
    // if model provides custom query builder (optional)
    return Competition.findOne(activeCompetitionQuery(now)).sort({ startAt: -1, createdAt: -1 }).lean();
  }
  return Competition.findOne({
    deleted: false,
    $and: [
      { $or: [ { startAt: { $lte: now } }, { startAt: null } ] },
      { $or: [ { endAt: { $gte: now } }, { endAt: null } ] }
    ]
  }).sort({ startAt: -1, createdAt: -1 }).lean();
}

console.log('[DEBUG] competitions router loaded');

// simple request logger
router.use((req, res, next) => {
  try {
    console.log('[competitions] %s %s - query=%o body=%o auth=%s', req.method, req.originalUrl || req.url, req.query, req.body, !!req.headers.authorization);
  } catch (e) {
    console.log('[competitions] log error', e && e.stack);
  }
  next();
});

// Temporary debug endpoint — remove after debugging
router.get('/__debug/schema', (req, res) => {
  try {
    const names = mongoose.modelNames();
    const out = { modelNames: names };
    if (names.indexOf('Competition') !== -1) {
      const M = mongoose.model('Competition');
      out.competitionSchemaPaths = Object.keys(M.schema.paths).reduce((acc, k) => {
        acc[k] = {
          instance: M.schema.paths[k].instance,
          options: M.schema.paths[k].options || {}
        };
        return acc;
      }, {});
    }
    return res.json({ ok:true, debug: out });
  } catch (err) {
    return res.status(500).json({ ok:false, error: err && err.message });
  }
});

// --- list competitions --- (supports pagination + search)
router.get('/', async (req, res) => {
  try {
    const includeDeleted = String(req.query.all || 'false') === 'true';
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip = Math.max(0, Number(req.query.skip || 0));

    const filter = includeDeleted ? {} : { deleted: false };
    if (req.query.search) {
      filter.$text = { $search: String(req.query.search) };
    }

    const rows = await Competition.find(filter).sort({ startAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean();
    return res.json({ ok:true, data: rows });
  } catch (err) {
    return devError(res, 'GET /competitions error', err);
  }
});

// --- get current active ---
router.get('/current', async (req, res) => {
  try {
    const now = new Date();
    const current = await getActiveCompetition(now);
    // helpful debug info when not found
    if (!current) {
      console.log('[competitions] current: none found at', now.toISOString());
    } else {
      console.log('[competitions] current:', current._id, current.name, 'startAt=', current.startAt, 'endAt=', current.endAt);
    }
    return res.json({ ok:true, competition: current || null });
  } catch (err) {
    return devError(res, 'GET /competitions/current error', err);
  }
});

// --- fallback leaderboard (uses the active competition) ---
router.get('/leaderboard', async (req, res) => {
  try {
    const now = new Date();
    const current = await getActiveCompetition(now);
    if (!current) return res.json({ ok:true, data: [], competitionId: null });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const rows = await CompetitionParticipant.find({ competitionId: current._id }).sort({ totalPoints: -1 }).limit(limit).lean();
    return res.json({ ok:true, data: rows, competitionId: current._id });
  } catch (err) {
    return devError(res, 'GET /competitions/leaderboard error', err);
  }
});

// --- leaderboard by id ---
router.get('/:id/leaderboard', async (req, res) => {
  try {
    let competitionId = req.params.id;
    if (competitionId === 'current') {
      const now = new Date();
      const current = await getActiveCompetition(now);
      if (!current) return res.json({ ok:true, data: [], competitionId: null });
      competitionId = String(current._id);
    }

    // allow plain string ids that are valid ObjectIds
    if (!mongoose.Types.ObjectId.isValid(competitionId)) return res.status(400).json({ ok:false, error:'Invalid competition id' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const rows = await CompetitionParticipant.find({ competitionId }).sort({ totalPoints: -1 }).limit(limit).lean();
    return res.json({ ok:true, data: rows });
  } catch (err) {
    return devError(res, 'GET /competitions/:id/leaderboard error', err);
  }
});

// --- get by id ---
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ ok:false, error:'Invalid id' });
    const doc = await Competition.findById(id).lean();
    if (!doc) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true, competition: doc });
  } catch (err) {
    return devError(res, 'GET /competitions/:id error', err);
  }
});

/**
 * Helper to normalise start/end dates and apply sensible defaults:
 * - If neither startAt nor endAt provided: set startAt = now, endAt = now + DEFAULT_DURATION_MS
 * - If startAt provided and endAt not provided: set endAt = startAt + DEFAULT_DURATION_MS
 * - If endAt provided and startAt not provided: keep startAt null (means "already started")
 */
function normalizeDatesForCreate(start, end) {
  let startAt = parseIsoOrNull(start);
  let endAt = parseIsoOrNull(end);

  if (!startAt && !endAt) {
    startAt = new Date();
    endAt = new Date(startAt.getTime() + DEFAULT_DURATION_MS);
  } else if (startAt && !endAt) {
    endAt = new Date(startAt.getTime() + DEFAULT_DURATION_MS);
  } else if (!startAt && endAt) {
    // keep startAt null -> treated as started already
    startAt = null;
  }
  return { startAt, endAt };
}

// --- create (admin) ---
// If you want to test quickly WITHOUT JWT, enable a temporary test route by setting
// ALLOW_NOAUTH_COMP_CREATION=true in your env. The test route is below and also requires the env flag.
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('POST /api/competitions body=', req.body, 'user=', req.user && (req.user._id || req.user.id || req.user));

    const payloadName = (req.body.name || req.body.title || '').trim();
    const description = req.body.description || '';
    const start = req.body.startAt || req.body.start || null;
    const end = req.body.endAt || req.body.end || null;

    if (!payloadName) return res.status(400).json({ ok:false, error: 'Name (or title) required' });

    const { startAt, endAt } = normalizeDatesForCreate(start, end);

    if (startAt && endAt && startAt > endAt) {
      return res.status(400).json({ ok:false, error: 'startAt must be before endAt' });
    }

    let createdBy = null;
    try {
      const maybe = req.user && (req.user._id || req.user.id || null);
      if (maybe && mongoose.Types.ObjectId.isValid(String(maybe))) {
        createdBy = mongoose.Types.ObjectId(String(maybe));
      }
    } catch (e) {
      createdBy = null;
    }

    const doc = new Competition({
      name: payloadName,
      title: payloadName,
      description: description || '',
      startAt,
      endAt,
      createdBy
    });

    try {
      await doc.save();
      // emit socket update if io exists
      try {
        const io = req.app && req.app.get && req.app.get('io');
        if (io && typeof io.emit === 'function') {
          io.emit('competition:created', { competitionId: String(doc._id), startAt: doc.startAt, endAt: doc.endAt, name: doc.name });
          io.emit('competition:updated', { competitionId: String(doc._id), startAt: doc.startAt, endAt: doc.endAt, name: doc.name });
        }
      } catch (e) {
        console.warn('competition emit failed', e && e.message);
      }
    } catch (saveErr) {
      console.error('Competition save failed', saveErr && (saveErr.stack || saveErr));
      if (saveErr && (saveErr.name === 'ValidationError' || saveErr.name === 'CastError')) {
        return res.status(400).json({ ok:false, error: saveErr.message, name: saveErr.name, details: saveErr.errors || null });
      }
      throw saveErr;
    }

    return res.json({ ok:true, competition: doc });
  } catch (err) {
    return devError(res, 'POST /competitions error', err);
  }
});

/**
 * TEMP: create without auth for quick testing (only enabled when ALLOW_NOAUTH_COMP_CREATION=true).
 * This is intentionally guarded — do NOT enable on public production servers.
 */
if (String(process.env.ALLOW_NOAUTH_COMP_CREATION || '').toLowerCase() === 'true') {
  router.post('/__test-create-noauth', async (req, res) => {
    try {
      const payloadName = (req.body.name || req.body.title || '').trim();
      const description = req.body.description || '';
      const start = req.body.startAt || req.body.start || null;
      const end = req.body.endAt || req.body.end || null;

      if (!payloadName) return res.status(400).json({ ok:false, error: 'Name (or title) required' });

      const { startAt, endAt } = normalizeDatesForCreate(start, end);
      const doc = new Competition({ name: payloadName, title: payloadName, description, startAt, endAt, createdBy: null });
      await doc.save();
      console.log('[competitions] __test-create-noauth created', doc._id, 'startAt=', startAt, 'endAt=', endAt);
      return res.json({ ok:true, competition: doc });
    } catch (err) {
      return devError(res, 'POST /competitions/__test-create-noauth error', err);
    }
  });
  console.log('[competitions] __test-create-noauth route enabled (ALLOW_NOAUTH_COMP_CREATION=true)');
}

// --- update (admin) ---
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('PUT /api/competitions/:id body=', req.body, 'user=', req.user && (req.user._id || req.user.id || req.user));
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ ok:false, error:'Invalid id' });

    const upd = {};
    if (typeof req.body.name !== 'undefined' || typeof req.body.title !== 'undefined') {
      const nm = (req.body.name || req.body.title || '').trim();
      if (nm) { upd.name = nm; upd.title = nm; }
      else { upd.name = ''; upd.title = ''; }
    }
    ['description'].forEach(k => { if (typeof req.body[k] !== 'undefined') upd[k] = req.body[k]; });

    if (req.body.startAt || req.body.start) upd.startAt = parseIsoOrNull(req.body.startAt || req.body.start);
    if (req.body.endAt || req.body.end) upd.endAt = parseIsoOrNull(req.body.endAt || req.body.end);
    if (upd.startAt && upd.endAt && upd.startAt > upd.endAt) return res.status(400).json({ ok:false, error:'startAt must be before endAt' });

    // automatic fallback: if start provided but end missing, set default end
    if (upd.startAt && !upd.endAt && !req.body.endAt && !req.body.end) {
      upd.endAt = new Date(upd.startAt.getTime() + DEFAULT_DURATION_MS);
    }

    upd.updatedAt = new Date();

    const updated = await Competition.findByIdAndUpdate(id, { $set: upd }, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ ok:false, error:'Not found' });

    // emit socket update
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        io.emit('competition:updated', { competitionId: String(updated._id), startAt: updated.startAt, endAt: updated.endAt, name: updated.name });
      }
    } catch (e) {
      console.warn('competition emit failed', e && e.message);
    }

    return res.json({ ok:true, competition: updated });
  } catch (err) {
    return devError(res, 'PUT /competitions/:id error', err);
  }
});

// --- delete (admin) ---
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ ok:false, error:'Invalid id' });
    await Competition.findByIdAndUpdate(id, { $set: { deleted: true, updatedAt: new Date() } });
    // emit updated (so clients can refresh)
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        io.emit('competition:updated', { competitionId: id, deleted: true });
      }
    } catch (e) {}
    return res.json({ ok:true });
  } catch (err) {
    return devError(res, 'DELETE /competitions/:id error', err);
  }
});

module.exports = router;
