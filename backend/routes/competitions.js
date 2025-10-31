// backend/routes/competitions.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Competition, CompetitionParticipant } = require('../models/Competition');
const jwt = require('jsonwebtoken');

// copy your requireAuth and requireAdmin if available; here's a compatible version:
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    const token = auth && typeof auth === 'string' && auth.split(' ')[0] === 'Bearer' ? auth.split(' ')[1] : (req.body && req.body.token) || null;
    if (!token) return res.status(401).json({ ok:false, error:'Authentication required' });
    jwt.verify(token, JWT_SECRET, (err, payload) => {
      if (err) return res.status(401).json({ ok:false, error:'Invalid token' });
      req.user = payload;
      next();
    });
  } catch (e) { console.error('requireAuth error', e); return res.status(401).json({ ok:false, error:'Auth error' }); }
}
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(403).json({ ok:false, error:'Not allowed' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin') return res.status(403).json({ ok:false, error:'Admin only' });
  return next();
}

/* GET /api/competitions
   Public to authenticated users (admins see all; others see non-deleted) */
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = { deleted: false };
    // admins can pass ?all=1 to see deleted too
    if ((req.query.all || '') === '1' && (req.user.role || '').toLowerCase() === 'admin') delete filter.deleted;
    const comps = await Competition.find(filter).sort({ startAt: -1, createdAt: -1 }).lean();
    return res.json({ ok:true, data: comps });
  } catch (err) { console.error('GET /competitions', err); return res.status(500).json({ ok:false, error:'Server error' }); }
});

/* POST /api/competitions  (admin) */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description, start, end } = req.body;
    if (!name) return res.status(400).json({ ok:false, error:'Name required' });
    const startAt = start ? new Date(start) : null;
    const endAt = end ? new Date(end) : null;
    const c = new Competition({
      name: String(name).trim(),
      description: String(description||'').trim(),
      startAt: startAt && !isNaN(startAt.getTime()) ? startAt : null,
      endAt: endAt && !isNaN(endAt.getTime()) ? endAt : null,
      createdBy: req.user._id
    });
    await c.save();
    return res.json({ ok:true, competition: c });
  } catch (err) { console.error('POST /competitions', err); return res.status(500).json({ ok:false, error:'Server error' }); }
});

/* PUT /api/competitions/:id  (admin) */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const upd = {};
    if (typeof req.body.name !== 'undefined') upd.name = String(req.body.name).trim();
    if (typeof req.body.description !== 'undefined') upd.description = String(req.body.description||'').trim();
    if (typeof req.body.start !== 'undefined') { const d = req.body.start ? new Date(req.body.start) : null; upd.startAt = d && !isNaN(d.getTime()) ? d : null; }
    if (typeof req.body.end !== 'undefined') { const d = req.body.end ? new Date(req.body.end) : null; upd.endAt = d && !isNaN(d.getTime()) ? d : null; }
    upd.updatedAt = new Date();
    const updated = await Competition.findByIdAndUpdate(id, { $set: upd }, { new: true }).lean();
    if (!updated) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true, competition: updated });
  } catch (err) { console.error('PUT /competitions/:id', err); return res.status(500).json({ ok:false, error:'Server error' }); }
});

/* DELETE /api/competitions/:id  (soft delete by admin) */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await Competition.findByIdAndUpdate(id, { $set: { deleted: true, updatedAt: new Date() } });
    // optional: also keep participants but you may want to remove them; skipping removal
    return res.json({ ok:true });
  } catch (err) { console.error('DELETE /competitions/:id', err); return res.status(500).json({ ok:false, error:'Server error' }); }
});

/* GET /api/competitions/:id/leaderboard - top participants */
router.get('/:id/leaderboard', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await CompetitionParticipant.find({ competitionId: id }).sort({ totalPoints: -1 }).limit(Number(req.query.limit||10)).lean();
    return res.json({ ok:true, data: rows });
  } catch (err) { console.error('GET /competitions/:id/leaderboard', err); return res.status(500).json({ ok:false, error:'Server error' }); }
});

/* GET /api/competitions/leaderboard?limit=10  - combined top across competitions (optional)
   We'll return participants aggregated by competition */
router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit||10);
    const rows = await CompetitionParticipant.find({}).sort({ totalPoints: -1 }).limit(limit).lean();
    return res.json({ ok:true, data: rows });
  } catch (err) { console.error('GET /competitions/leaderboard', err); return res.status(500).json({ ok:false, error:'Server error' }); }
});

module.exports = router;
