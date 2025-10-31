// backend/routes/competitions.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// simple auth helpers — copy of pattern used elsewhere in your app
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

// safe model import (idempotent)
let Competition, CompetitionParticipant;
try {
  const compModels = require('../models/Competition');
  Competition = compModels.Competition || compModels;
  CompetitionParticipant = compModels.CompetitionParticipant || (mongoose.models.CompetitionParticipant || null);
} catch (e) {
  Competition = mongoose.models.Competition;
  CompetitionParticipant = mongoose.models.CompetitionParticipant;
}

if (!Competition) {
  const { Schema } = mongoose;
  const CompetitionSchema = new Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });
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

function parseIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ---------- public: list competitions ----------
router.get('/', async (req, res) => {
  try {
    const includeDeleted = String(req.query.all || 'false') === 'true';
    const filter = includeDeleted ? {} : { deleted: false };
    const rows = await Competition.find(filter).sort({ startAt: -1, createdAt: -1 }).lean();
    return res.json({ ok:true, data: rows });
  } catch (err) {
    console.error('GET /competitions error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ---------- public: get current active competition ----------
router.get('/current', async (req, res) => {
  try {
    const now = new Date();
    const current = await Competition.findOne({ deleted: false, startAt: { $lte: now }, endAt: { $gte: now } }).lean();
    if (!current) return res.status(404).json({ ok:false, error: 'No active competition' });
    return res.json({ ok:true, competition: current });
  } catch (err) {
    console.error('GET /competitions/current error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ---------- public: get competition by id ----------
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ ok:false, error:'Invalid id' });
    const doc = await Competition.findById(id).lean();
    if (!doc) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true, competition: doc });
  } catch (err) {
    console.error('GET /competitions/:id error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ---------- admin: create ----------
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('POST /api/competitions body=', req.body, 'user=', req.user && (req.user._id || req.user.id || req.user));
    const { name, description } = req.body;
    const start = req.body.startAt || req.body.start || null;
    const end = req.body.endAt || req.body.end || null;
    if (!name) return res.status(400).json({ ok:false, error:'Name required' });
    const startAt = parseIsoOrNull(start);
    const endAt = parseIsoOrNull(end);
    const doc = new Competition({ name: String(name).trim(), description: description || '', startAt, endAt, createdBy: req.user && (req.user._id || req.user.id || null) });
    await doc.save();
    return res.json({ ok:true, competition: doc });
  } catch (err) {
    console.error('POST /competitions error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ---------- admin: update ----------
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('PUT /api/competitions/:id body=', req.body, 'user=', req.user && (req.user._id || req.user.id || req.user));
    const id = req.params.id;
    const upd = {};
    ['name','description'].forEach(k => { if (typeof req.body[k] !== 'undefined') upd[k] = req.body[k]; });
    if (req.body.startAt || req.body.start) upd.startAt = parseIsoOrNull(req.body.startAt || req.body.start);
    if (req.body.endAt || req.body.end) upd.endAt = parseIsoOrNull(req.body.endAt || req.body.end);
    upd.updatedAt = new Date();
    const updated = await Competition.findByIdAndUpdate(id, { $set: upd }, { new: true }).lean();
    if (!updated) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true, competition: updated });
  } catch (err) {
    console.error('PUT /competitions/:id error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ---------- admin: soft delete ----------
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await Competition.findByIdAndUpdate(req.params.id, { $set: { deleted: true, updatedAt: new Date() } });
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /competitions/:id error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ---------- public: leaderboard for competition id ----------
router.get('/:id/leaderboard', async (req, res) => {
  try {
    let competitionId = req.params.id;
    if (competitionId === 'current') {
      const now = new Date();
      const current = await Competition.findOne({ deleted: false, startAt: { $lte: now }, endAt: { $gte: now } }).lean();
      if (!current) return res.status(404).json({ ok:false, error: 'No active competition' });
      competitionId = current._id;
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const rows = await CompetitionParticipant.find({ competitionId }).sort({ totalPoints: -1 }).limit(limit).lean();
    return res.json({ ok:true, data: rows });
  } catch (err) {
    console.error('GET /competitions/:id/leaderboard error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ---------- public: fallback leaderboard (active competition) ----------
router.get('/leaderboard', async (req, res) => {
  try {
    const now = new Date();
    const current = await Competition.findOne({ deleted: false, startAt: { $lte: now }, endAt: { $gte: now } }).lean();
    if (!current) return res.status(404).json({ ok:false, error: 'No active competition' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const rows = await CompetitionParticipant.find({ competitionId: current._id }).sort({ totalPoints: -1 }).limit(limit).lean();
    return res.json({ ok:true, data: rows, competitionId: current._id });
  } catch (err) {
    console.error('GET /competitions/leaderboard error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

module.exports = router;

