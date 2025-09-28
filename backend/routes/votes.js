// routes/votes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const requireAuth = require('../middleware/requireAuth');
const Vote = require('../models/Vote');
let Student = null;
try { Student = require('../models/Student'); } catch(e){ Student = null; console.warn('Student model not found (optional)'); }

// Helper to return ObjectId or null
function toObjectId(val) {
  try {
    if (!val) return null;
    const s = String(val).trim();
    if (!mongoose.isValidObjectId(s)) return null;
    return new mongoose.Types.ObjectId(s);
  } catch (e) {
    return null;
  }
}

// Normalize allowed values into canonical 'students'|'teachers'|'all'
function normalizeAllowed(val) {
  if (!val) return 'students';
  const v = String(val).toLowerCase().trim();
  if (v === 'student' || v === 'students') return 'students';
  if (v === 'teacher' || v === 'teachers') return 'teachers';
  if (v === 'all' || v === 'everyone') return 'all';
  return 'students';
}

// Normalize role string into canonical single-word roles: 'student'|'teacher'|'admin'|'manager'...
function normalizeRole(role) {
  if (!role) return '';
  const r = String(role).toLowerCase().trim();
  if (r === 'students' || r === 'student') return 'student';
  if (r === 'teachers' || r === 'teacher') return 'teacher';
  if (r === 'admin') return 'admin';
  if (r === 'manager') return 'manager';
  return r;
}

// isActive checks both schedule and active flag
function isActive(vote) {
  const now = new Date();
  if (vote.active === false) return false;
  if (vote.startsAt && new Date(vote.startsAt) > now) return false;
  if (vote.endsAt && new Date(vote.endsAt) <= now) return false;
  return true;
}

// compute ranking with competition-style ranks (ties share rank)
function computeRanking(vote) {
  const candidates = (vote.candidates || []).map(c => ({ ...c }));
  candidates.sort((a,b) => (b.votes||0) - (a.votes||0));
  let lastVotes = null;
  let lastRank = 0;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (i === 0) {
      c.rank = 1;
      lastRank = 1;
      lastVotes = c.votes || 0;
    } else {
      if ((c.votes || 0) === lastVotes) c.rank = lastRank;
      else {
        c.rank = i + 1;
        lastRank = c.rank;
        lastVotes = c.votes || 0;
      }
    }
  }
  const winners = [];
  if (candidates.length) {
    const top = candidates[0].votes || 0;
    for (const cc of candidates) {
      if ((cc.votes || 0) === top) winners.push(cc);
      else break;
    }
  }
  return { ranking: candidates, winners, tie: winners.length > 1 };
}

// LIST
router.get('/', requireAuth, async (req, res) => {
  try {
    const q = {};
    const user = req.user || {};
    if (user.schoolId) q.schoolId = toObjectId(user.schoolId) || user.schoolId;
    const votes = await Vote.find(q).sort({ createdAt: -1 }).lean();
    // Optionally compute winners for already ended votes
    const now = new Date();
    const out = votes.map(v => {
      const vv = { ...v };
      if (vv.endsAt && new Date(vv.endsAt) <= now) {
        const { ranking, winners, tie } = computeRanking(vv);
        vv.ranking = ranking;
        vv.winners = winners;
        vv.tie = tie;
        if (!tie && winners.length === 1) vv.winner = winners[0];
      }
      vv.allowed = normalizeAllowed(vv.allowed);
      return vv;
    });
    return res.json({ ok: true, votes: out });
  } catch (err) {
    console.error('votes.list error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// CREATE
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user || {};
    const role = normalizeRole(user.role);
    if (!['admin','manager'].includes(role)) return res.status(403).json({ ok:false, error:'Forbidden' });

    let { title, description, allowed, startsAt, endsAt, schoolId, candidates, active } = req.body || {};
    if (!title) return res.status(400).json({ ok:false, error:'Title required' });

    allowed = normalizeAllowed(allowed);
    active = (active === false) ? false : true;

    // Build candidate docs
    let candidateDocs = [];
    if (Array.isArray(candidates)) {
      const studentIds = candidates.map(c => c && c.studentId ? String(c.studentId).trim() : null).filter(Boolean);
      const validObjectIds = studentIds.filter(id => mongoose.isValidObjectId(id)).map(id => toObjectId(id)).filter(Boolean);

      let studentMap = {};
      if (validObjectIds.length && Student) {
        try {
          const studs = await Student.find({ _id: { $in: validObjectIds } }).lean();
          studs.forEach(s => studentMap[String(s._id)] = s);
        } catch (e) { console.warn('student lookup failed', e && e.message); }
      }

      candidateDocs = candidates.map(c => {
        const sid = c && c.studentId ? String(c.studentId).trim() : null;
        const objId = toObjectId(sid);
        const doc = {
          studentId: objId,
          name: (c && (c.name || c.studentName)) ? String(c.name || c.studentName) : '',
          title: (c && c.title) ? String(c.title) : '',
          description: (c && c.description) ? String(c.description) : '',
          votes: (c && typeof c.votes === 'number') ? c.votes : 0
        };
        if ((!doc.name || doc.name.length === 0) && doc.studentId && studentMap[String(doc.studentId)]) {
          doc.name = studentMap[String(doc.studentId)].fullname || studentMap[String(doc.studentId)].name || '';
        }
        return doc;
      }).filter(c => (c.studentId || (c.name && c.name.length)));
    }

    const vote = new Vote({
      title,
      description: description || '',
      allowed,
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      endsAt: endsAt ? new Date(endsAt) : new Date(Date.now() + 24*3600*1000),
      active,
      createdBy: toObjectId(user._id) || null,
      createdByName: user.fullname || user.name || '',
      schoolId: toObjectId(schoolId) || (user.schoolId ? toObjectId(user.schoolId) : null),
      candidates: candidateDocs
    });

    await vote.save();
    const saved = await Vote.findById(vote._id).lean();
    saved.allowed = normalizeAllowed(saved.allowed);
    return res.json({ ok:true, vote: saved });
  } catch (err) {
    console.error('votes.create error', err && (err.stack || err));
    const showStack = (process.env.NODE_ENV !== 'production');
    return res.status(500).json({ ok:false, error: showStack ? (err.message || 'Server error') : 'Server error', stack: showStack ? err.stack : undefined });
  }
});

// GET single
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, error:'Invalid id' });
    const vote = await Vote.findById(id).lean();
    if (!vote) return res.status(404).json({ ok:false, error:'Not found' });

    // Compute ranking/winner if ended
    const now = new Date();
    const result = { ...vote };
    let ended = false;
    if (vote.endsAt && new Date(vote.endsAt) <= now) ended = true;
    if (ended) {
      const { ranking, winners, tie } = computeRanking(vote);
      result.ranking = ranking;
      result.winners = winners;
      result.tie = tie;
      if (!tie && winners.length === 1) result.winner = winners[0];
    }
    result.allowed = normalizeAllowed(result.allowed);
    return res.json({ ok:true, vote: result });
  } catch (err) {
    console.error('votes.get error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// UPDATE (edit / patch)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user || {};
    const role = normalizeRole(user.role);
    if (!['admin','manager'].includes(role)) return res.status(403).json({ ok:false, error:'Forbidden' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, error:'Invalid id' });

    const existing = await Vote.findById(id);
    if (!existing) return res.status(404).json({ ok:false, error:'Not found' });

    const { title, description, allowed, startsAt, endsAt, candidates, active } = req.body || {};
    if (typeof title !== 'undefined') existing.title = String(title || '');
    if (typeof description !== 'undefined') existing.description = String(description || '');
    if (typeof allowed !== 'undefined') existing.allowed = normalizeAllowed(allowed);
    if (typeof startsAt !== 'undefined') existing.startsAt = startsAt ? new Date(startsAt) : existing.startsAt;
    if (typeof endsAt !== 'undefined') existing.endsAt = endsAt ? new Date(endsAt) : existing.endsAt;
    if (typeof active !== 'undefined') existing.active = (active === false) ? false : true;

    if (Array.isArray(candidates)) {
      const studentIds = candidates.map(c => c && c.studentId ? String(c.studentId).trim() : null).filter(Boolean);
      const validObjectIds = studentIds.filter(id => mongoose.isValidObjectId(id)).map(id => toObjectId(id)).filter(Boolean);
      let studentMap = {};
      if (validObjectIds.length && Student) {
        try {
          const studs = await Student.find({ _id: { $in: validObjectIds } }).lean();
          studs.forEach(s => studentMap[String(s._id)] = s);
        } catch (e) { /* ignore */ }
      }
      const candidateDocs = candidates.map(c => {
        const sid = c && c.studentId ? String(c.studentId).trim() : null;
        const objId = toObjectId(sid);
        const doc = {
          studentId: objId,
          name: (c && (c.name || c.studentName)) ? String(c.name || c.studentName) : '',
          title: (c && c.title) ? String(c.title) : '',
          description: (c && c.description) ? String(c.description) : '',
          votes: (c && typeof c.votes === 'number') ? c.votes : 0
        };
        if ((!doc.name || doc.name.length === 0) && doc.studentId && studentMap[String(doc.studentId)]) {
          doc.name = studentMap[String(doc.studentId)].fullname || studentMap[String(doc.studentId)].name || '';
        }
        return doc;
      }).filter(c => (c.studentId || (c.name && c.name.length)));
      existing.candidates = candidateDocs;
    }

    await existing.save();
    const updated = await Vote.findById(id).lean();
    updated.allowed = normalizeAllowed(updated.allowed);
    return res.json({ ok:true, vote: updated });
  } catch (err) {
    console.error('votes.update error', err && (err.stack || err));
    const showStack = (process.env.NODE_ENV !== 'production');
    return res.status(500).json({ ok:false, error: showStack ? (err.message || 'Server error') : 'Server error', stack: showStack ? err.stack : undefined });
  }
});

// DELETE
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user || {};
    const role = normalizeRole(user.role);
    if (!['admin','manager'].includes(role)) return res.status(403).json({ ok:false, error:'Forbidden' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, error:'Invalid id' });

    const deleted = await Vote.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true });
  } catch (err) {
    console.error('votes.delete error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// CAST vote
router.post('/:id/vote', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { candidateId } = req.body || {};
    const user = req.user || {};
    if (!mongoose.isValidObjectId(id) || !candidateId || !mongoose.isValidObjectId(String(candidateId))) {
      return res.status(400).json({ ok:false, error:'Invalid id' });
    }
    const vote = await Vote.findById(id);
    if (!vote) return res.status(404).json({ ok:false, error:'Not found' });
    if (!isActive(vote)) return res.status(400).json({ ok:false, error:'Voting closed or not started' });

    const role = normalizeRole(user.role);
    const allowed = normalizeAllowed(vote.allowed);

    if (allowed === 'students' && role !== 'student') return res.status(403).json({ ok:false, error:'Only students can vote' });
    if (allowed === 'teachers' && role !== 'teacher') return res.status(403).json({ ok:false, error:'Only teachers can vote' });
    // allowed === 'all' -> everyone authenticated allowed

    // prevent double voting
    const already = (vote.voters || []).some(v => {
      try { return String(v.voterId) === String(user._id); } catch(e) { return false; }
    });
    if (already) return res.status(400).json({ ok:false, error:'User already voted' });

    const cand = vote.candidates.id(String(candidateId));
    if (!cand) return res.status(404).json({ ok:false, error:'Candidate not found' });

    cand.votes = (cand.votes || 0) + 1;
    vote.voters = vote.voters || [];
    vote.voters.push({
      voterId: toObjectId(user._id) || null,
      voterRole: role,
      candidateId: toObjectId(candidateId),
      votedAt: new Date()
    });

    await vote.save();

    const result = await Vote.findById(id).lean();
    result.allowed = normalizeAllowed(result.allowed);
    return res.json({ ok:true, vote: result });
  } catch (err) {
    console.error('votes.cast error', err && (err.stack || err));
    const showStack = (process.env.NODE_ENV !== 'production');
    return res.status(500).json({ ok:false, error: showStack ? (err.message || 'Server error') : 'Server error', stack: showStack ? err.stack : undefined });
  }
});

module.exports = router;
