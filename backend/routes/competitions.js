/// backend/routes/competitions.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// --- auth helpers (unchanged) ---
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

// --- models (safe/idempotent) ---
let Competition, CompetitionParticipant;
try {
  const compModels = require('../models/Competition');
  Competition = compModels.Competition || compModels;
  CompetitionParticipant = compModels.CompetitionParticipant || (mongoose.models.CompetitionParticipant || null);
} catch (e) {
  Competition = mongoose.models.Competition;
  CompetitionParticipant = mongoose.models.CompetitionParticipant;
}

// If not registered already, create idempotent models
if (!Competition) {
  const { Schema } = mongoose;
  const CompetitionSchema = new Schema({
    // support both name and title for backward compatibility
    name: { type: String, required: true, trim: true },
    title: { type: String },
    description: { type: String, default: '' },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });
  CompetitionSchema.index({ name: 'text', title: 'text' });
  Competition = mongoose.models.Competition || mongoose.model('Competition', CompetitionSchema);
}
if (!CompetitionParticipant) {
  const { Schema } = mongoose;
  const CompetitionParticipantSchema = new Schema({
    competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, default: '' },
    totalPoints: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
  });
  CompetitionParticipant = mongoose.models.CompetitionParticipant || mongoose.model('CompetitionParticipant', CompetitionParticipantSchema);
}

console.log('[DEBUG] competitions router loaded');

router.use((req, res, next) => {
  try {
    console.log('[competitions] %s %s - query=%o body=%o auth=%s', req.method, req.originalUrl || req.url, req.query, req.body, !!req.headers.authorization);
  } catch (e) { console.log('[competitions] log error', e && e.stack); }
  next();
});

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

// --- list competitions ---
router.get('/', async (req, res) => {
  try {
    const includeDeleted = String(req.query.all || 'false') === 'true';
    const filter = includeDeleted ? {} : { deleted: false };
    const rows = await Competition.find(filter).sort({ startAt: -1, createdAt: -1 }).lean();
    return res.json({ ok:true, data: rows });
  } catch (err) {
    return devError(res, 'GET /competitions error', err);
  }
});

// --- get current active ---
router.get('/current', async (req, res) => {
  try {
    const now = new Date();
    const current = await Competition.findOne({ deleted: false, startAt: { $lte: now }, endAt: { $gte: now } }).lean();
    return res.json({ ok:true, competition: current || null });
  } catch (err) {
    return devError(res, 'GET /competitions/current error', err);
  }
});

// --- fallback leaderboard ---
router.get('/leaderboard', async (req, res) => {
  try {
    const now = new Date();
    const current = await Competition.findOne({ deleted: false, startAt: { $lte: now }, endAt: { $gte: now } }).lean();
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
      const current = await Competition.findOne({ deleted: false, startAt: { $lte: now }, endAt: { $gte: now } }).lean();
      if (!current) return res.json({ ok:true, data: [], competitionId: null });
      competitionId = current._id;
    }
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

// --- create (admin) ---
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('POST /api/competitions body=', req.body, 'user=', req.user && (req.user._id || req.user.id || req.user));
    const payloadName = (req.body.name || req.body.title || '').trim();
    const description = req.body.description || '';
    const start = req.body.startAt || req.body.start || null;
    const end = req.body.endAt || req.body.end || null;

    if (!payloadName) return res.status(400).json({ ok:false, error: 'Name (or title) required' });

    const startAt = parseIsoOrNull(start);
    const endAt = parseIsoOrNull(end);

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
      // Emit socket update if io available (app should set io = ioInstance on app)
      try {
        const io = req.app && req.app.get && req.app.get('io');
        if (io && typeof io.emit === 'function') {
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

