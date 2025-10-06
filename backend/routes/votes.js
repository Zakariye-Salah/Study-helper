// backend/routes/votes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const requireAuth = require('../middleware/requireAuth');
const Vote = require('../models/Vote');

let Student = null;
let Teacher = null;
let User = null;
try { Student = require('../models/Student'); } catch (e) { Student = null; }
try { Teacher = require('../models/Teacher'); } catch (e) { Teacher = null; }
try { User = require('../models/User'); } catch (e) { User = null; }

// multer temp storage
const tmpUploadDir = path.join(process.cwd(), 'uploads', 'tmp');
if (!fs.existsSync(tmpUploadDir)) fs.mkdirSync(tmpUploadDir, { recursive: true });

const upload = multer({
  dest: tmpUploadDir,
  limits: { fileSize: 6 * 1024 * 1024 } // 6MB
});

// ---------- helpers ----------
function toObjectId(val) {
  try {
    if (!val) return null;
    const s = String(val).trim();
    if (!mongoose.isValidObjectId(s)) return null;
    return new mongoose.Types.ObjectId(s);
  } catch (e) { return null; }
}
function normalizeAllowed(val) {
  if (!val) return 'students';
  const v = String(val).toLowerCase().trim();
  if (v === 'student' || v === 'students') return 'students';
  if (v === 'teacher' || v === 'teachers') return 'teachers';
  if (v === 'all' || v === 'everyone') return 'all';
  return 'students';
}
function normalizeRole(role) {
  if (!role) return '';
  const r = String(role).toLowerCase().trim();
  if (r === 'students' || r === 'student') return 'student';
  if (r === 'teachers' || r === 'teacher') return 'teacher';
  if (r === 'admin') return 'admin';
  if (r === 'manager') return 'manager';
  return r;
}
function isActive(vote) {
  const now = new Date();
  if (vote.active === false) return false;
  if (vote.startsAt && new Date(vote.startsAt) > now) return false;
  if (vote.endsAt && new Date(vote.endsAt) <= now) return false;
  return true;
}
function computeRanking(vote) {
  const candidates = (vote.candidates || []).map(c => ({ ...c }));
  candidates.sort((a,b) => (b.votes||0) - (a.votes||0));
  let lastVotes = null; let lastRank = 0;
  for (let i=0;i<candidates.length;i++){
    const c = candidates[i];
    if (i===0){ c.rank = 1; lastRank = 1; lastVotes = c.votes||0; }
    else {
      if ((c.votes||0) === lastVotes) c.rank = lastRank;
      else { c.rank = i+1; lastRank = c.rank; lastVotes = c.votes||0; }
    }
  }
  const winners = [];
  if (candidates.length){
    const top = candidates[0].votes || 0;
    for (const cc of candidates){
      if ((cc.votes||0) === top) winners.push(cc);
      else break;
    }
  }
  return { ranking: candidates, winners, tie: winners.length > 1 };
}

// move uploaded files into vote folder and return array of web paths in uploaded order
async function moveUploadedFilesToVote(voteId, files) {
  if (!files || !files.length) return [];
  const destDir = path.join(process.cwd(), 'uploads', 'votes', String(voteId));
  try { await fs.promises.mkdir(destDir, { recursive: true }); } catch(e){ console.warn('mkdir failed', e && e.message); }
  const out = [];
  for (let i=0;i<files.length;i++){
    const f = files[i];
    if (!f || !f.path) { out.push(null); continue; }
    const ext = path.extname(f.originalname || '') || '.jpg';
    const filename = `${Date.now()}_${i}${ext}`;
    const dest = path.join(destDir, filename);
    try {
      // copy then unlink to avoid EXDEV rename issues
      await fs.promises.copyFile(f.path, dest);
      try { await fs.promises.unlink(f.path); } catch(e){ /* ignore unlink error */ }
      out.push(`/uploads/votes/${voteId}/${filename}`);
    } catch (e) {
      console.warn('move file failed', e && e.message);
      out.push(null);
    }
  }
  return out;
}

/**
 * Find manager id (string) for a given user object (req.user).
 * - If user.role is 'student' -> look up Student doc and return createdBy || managerId || manager
 * - If user.role is 'teacher' -> look up Teacher doc and return createdBy || managerId || manager
 * - If user already has a manager-like field on req.user (managerId, assignedManager, manager) prefer that
 * Returns string id or null.
 */
async function findAssignedManagerId(user) {
  if (!user) return null;
  // prefer fields already attached to req.user (some auth implementations add these)
  const candidateFields = ['managerId','assignedManager','manager','createdBy','manager']; // 'createdBy' sometimes used to mark manager creator
  for (const f of candidateFields) {
    if (user[f]) {
      try { return String(user[f]); } catch(e) { /* ignore */ }
    }
  }

  // if user is student or teacher, attempt DB lookup
  const role = normalizeRole(user.role);
  try {
    if (role === 'student' && Student) {
      const s = await Student.findById(user._id).lean().catch(()=>null);
      if (s) {
        if (s.createdBy) return String(s.createdBy);
        if (s.managerId) return String(s.managerId);
        if (s.manager) return String(s.manager);
      }
    } else if (role === 'teacher' && Teacher) {
      const t = await Teacher.findById(user._id).lean().catch(()=>null);
      if (t) {
        if (t.createdBy) return String(t.createdBy);
        if (t.managerId) return String(t.managerId);
        if (t.manager) return String(t.manager);
      }
    }
  } catch (e) {
    // ignore DB errors and fallback to null
    console.warn('findAssignedManagerId error', e && e.message);
  }
  return null;
}

// ---------- ROUTES ----------

/**
 * GET /api/votes
 * Return only votes visible to current user:
 * - admin: all votes
 * - manager: votes they created + votes created by admins
 * - student/teacher: votes allowed to their role AND created by their assigned manager OR admin
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user || {};
    const role = normalizeRole(user.role);

    // fetch all votes (no school filtering since you said there's no schoolId in your setup)
    let votes = await Vote.find({}).sort({ createdAt: -1 }).lean();

    // gather creator ids so we can load creator roles (to detect admin-created votes)
    const creatorIds = Array.from(new Set(votes.map(v => v.createdBy ? String(v.createdBy) : '').filter(Boolean)));
    let creatorMap = {};
    if (creatorIds.length && User) {
      try {
        const creators = await User.find({ _id: { $in: creatorIds } }).lean().catch(()=>[]);
        creators.forEach(c => { creatorMap[String(c._id)] = c; });
      } catch (e) { /* ignore */ }
    }

    // find assigned manager id for current user (if student/teacher)
    const assignedManagerId = await findAssignedManagerId(user);

    const out = [];
    for (const v of votes) {
      const vv = { ...v };
      vv.allowed = normalizeAllowed(vv.allowed);
      vv.canEdit = false;

      // determine creator role if we loaded it
      const creatorIdStr = v.createdBy ? String(v.createdBy) : '';
      const creatorDoc = creatorMap[creatorIdStr];
      const creatorRole = creatorDoc ? normalizeRole(creatorDoc.role) : null;

      // canEdit flag: admin OR manager who created this vote
      if (role === 'admin') vv.canEdit = true;
      else if (role === 'manager' && String(vv.createdBy || '') === String(user._id)) vv.canEdit = true;

      // visibility rules
      let visible = false;
      if (role === 'admin') {
        visible = true;
      } else if (role === 'manager') {
        // manager sees their own votes and admin-created votes, but NOT other managers' votes
        if (String(vv.createdBy || '') === String(user._id)) visible = true;
        else if (creatorRole === 'admin') visible = true;
        else visible = false;
      } else if (role === 'student' || role === 'teacher') {
        // must be allowed for this role AND created by student's/teacher's manager or admin
        if (!(vv.allowed === 'all' || (vv.allowed === 'students' && role === 'student') || (vv.allowed === 'teachers' && role === 'teacher'))) {
          visible = false;
        } else {
          if (creatorRole === 'admin') visible = true;
          else if (assignedManagerId && String(assignedManagerId) === String(vv.createdBy || '')) visible = true;
          else visible = false;
        }
      } else {
        // unknown roles - hide by default
        visible = false;
      }

      if (!visible) continue;

      // compute ranking for ended votes
      if (vv.endsAt && new Date(vv.endsAt) <= new Date()) {
        const { ranking, winners, tie } = computeRanking(vv);
        vv.ranking = ranking; vv.winners = winners; vv.tie = tie;
        if (!tie && winners.length === 1) vv.winner = winners[0];
      }

      out.push(vv);
    }

    return res.json({ ok: true, votes: out });
  } catch (err) {
    console.error('votes.list error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// CREATE (supports multipart files with 'candidatePhotos' field)
router.post('/', upload.array('candidatePhotos'), requireAuth, async (req, res) => {
  try {
    const user = req.user || {};
    const role = normalizeRole(user.role);
    if (!['admin','manager'].includes(role)) return res.status(403).json({ ok:false, error:'Forbidden' });

    let { title, description, allowed, startsAt, endsAt, candidates, active } = req.body || {};
    if (!title) return res.status(400).json({ ok:false, error:'Title required' });

    if (typeof candidates === 'string') {
      try { candidates = JSON.parse(candidates); } catch(e){ candidates = []; }
    }
    if (!Array.isArray(candidates)) candidates = [];

    allowed = normalizeAllowed(allowed);
    active = (active === false || String(active) === 'false') ? false : true;

    // student lookup for names
    const studentIds = candidates.map(c => c && c.studentId ? String(c.studentId).trim() : null).filter(Boolean);
    const validObjectIds = studentIds.filter(id => mongoose.isValidObjectId(id)).map(id => toObjectId(id)).filter(Boolean);
    let studentMap = {};
    if (validObjectIds.length && Student) {
      try { const studs = await Student.find({ _id: { $in: validObjectIds } }).lean(); studs.forEach(s => studentMap[String(s._id)] = s); } catch(e){ console.warn(e); }
    }

    const candidateDocs = candidates.map(c => {
      const sid = c && c.studentId ? String(c.studentId).trim() : null;
      const objId = toObjectId(sid);
      const doc = {
        studentId: objId,
        name: (c && (c.name || c.studentName)) ? String(c.name || c.studentName) : '',
        title: (c && c.title) ? String(c.title) : '',
        description: (c && c.description) ? String(c.description) : '',
        votes: (c && typeof c.votes === 'number') ? c.votes : 0,
        photoUrl: (c && c.photoUrl) ? String(c.photoUrl) : ''
      };
      if ((!doc.name || doc.name.length===0) && doc.studentId && studentMap[String(doc.studentId)]) {
        doc.name = studentMap[String(doc.studentId)].fullname || studentMap[String(doc.studentId)].name || '';
      }
      return doc;
    }).filter(c => (c.studentId || (c.name && c.name.length)));

    const vote = new Vote({
      title,
      description: description || '',
      allowed,
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      endsAt: endsAt ? new Date(endsAt) : new Date(Date.now() + 24*3600*1000),
      active,
      createdBy: toObjectId(user._id) || null,
      createdByName: user.fullname || user.name || '',
      candidates: candidateDocs
    });

    await vote.save();

    // move uploaded files and attach to candidates in order (assign to first candidate without photoUrl)
    const uploadedFiles = req.files || [];
    if (uploadedFiles.length) {
      const moved = await moveUploadedFilesToVote(vote._id, uploadedFiles);
      for (let i=0, ci=0;i<moved.length && ci < vote.candidates.length;i++){
        while (ci < vote.candidates.length && vote.candidates[ci].photoUrl) ci++;
        if (ci >= vote.candidates.length) break;
        if (moved[i]) vote.candidates[ci].photoUrl = moved[i];
        ci++;
      }
      await vote.save();
    }

    const saved = await Vote.findById(vote._id).lean();
    saved.allowed = normalizeAllowed(saved.allowed);
    return res.json({ ok:true, vote: saved });
  } catch (err) {
    console.error('votes.create error', err && (err.stack || err));
    const showStack = (process.env.NODE_ENV !== 'production');
    return res.status(500).json({ ok:false, error: showStack ? (err.message||'Server error') : 'Server error', stack: showStack ? err.stack : undefined });
  }
});

// GET single
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, error:'Invalid id' });
    const vote = await Vote.findById(id).lean();
    if (!vote) return res.status(404).json({ ok:false, error:'Not found' });

    const user = req.user || {};
    const role = normalizeRole(user.role);

    // determine creator role
    let creatorRole = null;
    if (vote.createdBy && User) {
      try {
        const creator = await User.findById(vote.createdBy).lean().catch(()=>null);
        if (creator) creatorRole = normalizeRole(creator.role);
      } catch(e){ /*ignore*/ }
    }

    // find assigned manager for current user (if applicable)
    const assignedManagerId = await findAssignedManagerId(user);

    // visibility rules (same as list)
    let visible = false;
    if (role === 'admin') visible = true;
    else if (role === 'manager') {
      if (String(vote.createdBy || '') === String(user._id)) visible = true;
      else if (creatorRole === 'admin') visible = true;
      else visible = false;
    } else if (role === 'student' || role === 'teacher') {
      if (!(vote.allowed === 'all' || (vote.allowed === 'students' && role === 'student') || (vote.allowed === 'teachers' && role === 'teacher'))) {
        visible = false;
      } else {
        if (creatorRole === 'admin') visible = true;
        else if (assignedManagerId && String(assignedManagerId) === String(vote.createdBy || '')) visible = true;
        else visible = false;
      }
    } else visible = false;

    if (!visible) return res.status(403).json({ ok:false, error:'Forbidden' });

    const result = { ...vote };
    let ended = false;
    if (vote.endsAt && new Date(vote.endsAt) <= new Date()) ended = true;
    if (ended) {
      const { ranking, winners, tie } = computeRanking(vote);
      result.ranking = ranking; result.winners = winners; result.tie = tie;
      if (!tie && winners.length === 1) result.winner = winners[0];
    }
    result.allowed = normalizeAllowed(result.allowed);
    result.canEdit = (role === 'admin') || (role === 'manager' && String(result.createdBy || '') === String(user._id));
    return res.json({ ok:true, vote: result });
  } catch (err) {
    console.error('votes.get error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// UPDATE (multipart supported)
router.patch('/:id', upload.array('candidatePhotos'), requireAuth, async (req, res) => {
  try {
    const user = req.user || {};
    const role = normalizeRole(user.role);
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, error:'Invalid id' });

    const existing = await Vote.findById(id);
    if (!existing) return res.status(404).json({ ok:false, error:'Not found' });

    // managers only allowed to edit their own votes
    if (role === 'manager') {
      if (!existing.createdBy || String(existing.createdBy) !== String(user._id)) return res.status(403).json({ ok:false, error:'Forbidden' });
    } else if (role !== 'admin') {
      return res.status(403).json({ ok:false, error:'Forbidden' });
    }

    let { title, description, allowed, startsAt, endsAt, candidates, active } = req.body || {};
    if (typeof candidates === 'string') {
      try { candidates = JSON.parse(candidates); } catch(e){ candidates = undefined; }
    }

    if (typeof title !== 'undefined') existing.title = String(title || '');
    if (typeof description !== 'undefined') existing.description = String(description || '');
    if (typeof allowed !== 'undefined') existing.allowed = normalizeAllowed(allowed);
    if (typeof startsAt !== 'undefined') existing.startsAt = startsAt ? new Date(startsAt) : existing.startsAt;
    if (typeof endsAt !== 'undefined') existing.endsAt = endsAt ? new Date(endsAt) : existing.endsAt;
    if (typeof active !== 'undefined') existing.active = (active === false || String(active) === 'false') ? false : true;

    if (Array.isArray(candidates)) {
      // similar mapping as create
      const studentIds = candidates.map(c => c && c.studentId ? String(c.studentId).trim() : null).filter(Boolean);
      const validObjectIds = studentIds.filter(id => mongoose.isValidObjectId(id)).map(id => toObjectId(id)).filter(Boolean);
      let studentMap = {};
      if (validObjectIds.length && Student) {
        try { const studs = await Student.find({ _id: { $in: validObjectIds } }).lean(); studs.forEach(s => studentMap[String(s._id)] = s); } catch(e){ /*ignore*/ }
      }
      const candidateDocs = candidates.map(c => {
        const sid = c && c.studentId ? String(c.studentId).trim() : null;
        const objId = toObjectId(sid);
        const doc = {
          studentId: objId,
          name: (c && (c.name || c.studentName)) ? String(c.name || c.studentName) : '',
          title: (c && c.title) ? String(c.title) : '',
          description: (c && c.description) ? String(c.description) : '',
          votes: (c && typeof c.votes === 'number') ? c.votes : 0,
          photoUrl: (c && c.photoUrl) ? String(c.photoUrl) : ''
        };
        if ((!doc.name || doc.name.length===0) && doc.studentId && studentMap[String(doc.studentId)]) {
          doc.name = studentMap[String(doc.studentId)].fullname || studentMap[String(doc.studentId)].name || '';
        }
        return doc;
      }).filter(c => (c.studentId || (c.name && c.name.length)));
      existing.candidates = candidateDocs;
    }

    await existing.save();

    // if photos uploaded, move and attach in order (assign to first candidate without photoUrl)
    const uploadedFiles = req.files || [];
    if (uploadedFiles.length) {
      const moved = await moveUploadedFilesToVote(existing._id, uploadedFiles);
      for (let i=0, ci=0;i<moved.length && ci < existing.candidates.length;i++){
        while (ci < existing.candidates.length && existing.candidates[ci].photoUrl) ci++;
        if (ci >= existing.candidates.length) break;
        if (moved[i]) existing.candidates[ci].photoUrl = moved[i];
        ci++;
      }
      await existing.save();
    }

    const updated = await Vote.findById(id).lean();
    updated.allowed = normalizeAllowed(updated.allowed);
    return res.json({ ok:true, vote: updated });
  } catch (err) {
    console.error('votes.update error', err && (err.stack || err));
    const showStack = (process.env.NODE_ENV !== 'production');
    return res.status(500).json({ ok:false, error: showStack ? (err.message||'Server error') : 'Server error', stack: showStack ? err.stack : undefined });
  }
});

// DELETE
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user || {};
    const role = normalizeRole(user.role);
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, error:'Invalid id' });

    const existing = await Vote.findById(id);
    if (!existing) return res.status(404).json({ ok:false, error:'Not found' });

    if (role === 'manager') {
      if (!existing.createdBy || String(existing.createdBy) !== String(user._id)) return res.status(403).json({ ok:false, error:'Forbidden' });
    } else if (role !== 'admin') {
      return res.status(403).json({ ok:false, error:'Forbidden' });
    }

    await Vote.findByIdAndDelete(id);

    // remove uploaded dir
    try {
      const dir = path.join(process.cwd(), 'uploads', 'votes', String(id));
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch(e){ /*ignore*/ }

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

    const already = (vote.voters || []).some(v => { try { return String(v.voterId) === String(user._id); } catch(e){ return false; } });
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
    return res.status(500).json({ ok:false, error: showStack ? (err.message||'Server error') : 'Server error', stack: showStack ? err.stack : undefined });
  }
});

module.exports = router;
