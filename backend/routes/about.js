// backend/routes/about.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const About = require('../models/About');
const User = require('../models/User');

function isObjectIdString(s) {
  return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s);
}
function toObjectIdIfPossible(id) {
  try {
    const s = String(id || '');
    if (isObjectIdString(s)) return new mongoose.Types.ObjectId(s);
  } catch (e) {}
  return id;
}

/**
 * GET /api/about
 *
 * Rules:
 * - If requester is manager or admin -> return About created by that manager/admin (their own only).
 * - Else (student/teacher):
 *    1) try req.user.schoolId (if you use it for students) -> find About.schoolId == that
 *    2) try req.user.managerId (if you store it) -> find About.schoolId == managerId OR About.createdBy == managerId
 *    3) fallback: find About where createdBy is a manager whose schoolId equals user's schoolId (defensive)
 *
 * This ensures students/teachers see the About for their manager; managers only see their own.
 */
router.get('/', auth, async (req, res) => {
  try {
    const user = req.user || {};
    const role = (user.role || '').toLowerCase();
    const isPrivileged = role === 'manager' || role === 'admin';

    // If manager/admin -> return the about document created by them (their own)
    if (isPrivileged) {
      const about = await About.findOne({ createdBy: toObjectIdIfPossible(user._id) }).lean();
      if (!about) return res.json({ ok: true, about: null });
      return res.json({ ok: true, about });
    }

    // Non-privileged (student/teacher) -> attempt to find their manager's about
    // 1) Try user's schoolId if present
    let about = null;
    if (user.schoolId) {
      about = await About.findOne({ schoolId: toObjectIdIfPossible(user.schoolId), visible: true }).lean();
      if (about) return res.json({ ok: true, about });
    }

    // 2) Try user's managerId (common field name). If present, find about scoped to that manager.
    //    We consider both schoolId==managerId or createdBy==managerId to be valid.
    if (user.managerId) {
      const managerId = toObjectIdIfPossible(user.managerId);
      about = await About.findOne({
        $or: [
          { schoolId: managerId },
          { createdBy: managerId }
        ],
        visible: true
      }).lean();
      if (about) return res.json({ ok: true, about });
    }

    // 3) Defensive fallback: if user has no explicit manager, attempt to find an About whose schoolId
    //    matches any manager user document that references the same schoolId (rare but helpful).
    //    This is intentionally conservative: only visible Abouts are returned.
    //    If you do not store relations, consider adding `managerId` to students so we can map deterministically.
    if (user.schoolId) {
      // find managers with this schoolId (if any) then try to find their About
      const managers = await User.find({ schoolId: toObjectIdIfPossible(user.schoolId), role: /manager/i }).select('_id').lean();
      const ids = (managers || []).map(m => m._id).filter(Boolean);
      if (ids.length) {
        about = await About.findOne({ createdBy: { $in: ids }, visible: true }).lean();
        if (about) return res.json({ ok: true, about });
      }
    }

    // Final fallback: return any visible About (only if your app expects a default). If you don't want
    // a default show, return null here.
    about = await About.findOne({ visible: true }).lean();
    if (!about) return res.json({ ok: true, about: null });
    return res.json({ ok: true, about });

  } catch (err) {
    console.error('GET /about ERROR', err && (err.stack || err));
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/about
 * Roles: manager, admin
 *
 * When a manager (no real schoolId) creates About, we set schoolId = manager._id so students
 * linked to that manager (via schoolId or managerId) can find it.
 */
router.post('/', auth, roles(['manager', 'admin']), async (req, res) => {
  try {
    const payload = req.body || {};

    // build defaults
    const vision = Object.assign({ title:'Vision', text:'', icon:'🌟', color:'#6b21a8', order:0 }, payload.vision || {});
    const mission = Object.assign({ title:'Mission', text:'', icon:'🎯', color:'#0ea5e9', order:1 }, payload.mission || {});
    const scores = Array.isArray(payload.scores) ? payload.scores.slice(0,20).map((s,idx)=>({
      title: s.title || `Score ${idx+1}`, text: s.text || '', icon: s.icon || '⭐', color: s.color || '#10b981', order: typeof s.order === 'number' ? s.order : idx
    })) : [];
    const goals = Array.isArray(payload.goals) ? payload.goals.slice(0,7).map((g,idx)=>({
      title: g.title || `Goal #${idx+1}`, text: g.text || '', icon: g.icon || '🎯', color: g.color || '#f59e0b', order: typeof g.order === 'number' ? g.order : idx
    })) : [];
    const visible = payload.visible === undefined ? true : !!payload.visible;

    // If user has schoolId use it; otherwise if they're manager use their own _id as schoolId
    const actorSchoolId = (req.user && req.user.schoolId) ? toObjectIdIfPossible(req.user.schoolId) :
                           ((req.user && (req.user.role || '').toLowerCase() === 'manager') ? toObjectIdIfPossible(req.user._id) : null);

    const filter = actorSchoolId ? { schoolId: actorSchoolId } : { createdBy: toObjectIdIfPossible(req.user._id) };

    const now = new Date();
    const upsertDoc = {
      schoolId: actorSchoolId || null,
      createdBy: toObjectIdIfPossible(req.user._id),
      createdByName: req.user.fullname || req.user.name || req.user.email,
      vision, mission, scores, goals, visible,
      updatedAt: now
    };

    const about = await About.findOneAndUpdate(filter, { $set: upsertDoc }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    return res.json({ ok: true, about });
  } catch (err) {
    console.error('POST /about ERROR', err && (err.stack || err));
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * PUT /api/about/:id
 * Roles: manager, admin
 *
 * Only the document's creator (createdBy) or admin may edit. Managers may edit if
 * the about.schoolId == manager._id (we set that at create time).
 */
router.put('/:id', auth, roles(['manager','admin']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isObjectIdString(id)) return res.status(400).json({ ok:false, message:'Invalid id' });

    const about = await About.findById(id);
    if (!about) return res.status(404).json({ ok:false, message:'Not found' });

    const role = (req.user && req.user.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const isManager = role === 'manager';
    const iAmCreator = String(about.createdBy || '') === String(req.user._id);

    // allow only creator or admin
    if (!iAmCreator && !isAdmin) {
      // additionally allow manager if about.schoolId equals manager id (manager owns that "school")
      if (!(isManager && about.schoolId && String(about.schoolId) === String(req.user._id))) {
        return res.status(403).json({ ok:false, message:'Not allowed' });
      }
    }

    const payload = req.body || {};
    if (payload.vision) about.vision = Object.assign(about.vision || {}, payload.vision);
    if (payload.mission) about.mission = Object.assign(about.mission || {}, payload.mission);
    if (Array.isArray(payload.scores)) about.scores = payload.scores.slice(0,20).map((s,idx)=>({
      title: s.title || `Score ${idx+1}`, text: s.text || '', icon: s.icon || '⭐', color: s.color || '#10b981', order: s.order || idx
    }));
    if (Array.isArray(payload.goals)) about.goals = payload.goals.slice(0,7).map((g,idx)=>({
      title: g.title || `Goal #${idx+1}`, text: g.text || '', icon: g.icon || '🎯', color: g.color || '#f59e0b', order: g.order || idx
    }));
    if (payload.visible !== undefined) about.visible = !!payload.visible;

    // keep schoolId if absent and user is manager -> ensure it's attached
    if ((!about.schoolId || about.schoolId === null) && req.user && (req.user.role || '').toLowerCase() === 'manager') {
      about.schoolId = toObjectIdIfPossible(req.user._id);
    }

    about.createdBy = toObjectIdIfPossible(req.user._id);
    about.createdByName = req.user.fullname || req.user.name || req.user.email;
    about.updatedAt = new Date();

    await about.save();
    return res.json({ ok:true, about: about.toObject() });
  } catch (err) {
    console.error('PUT /about/:id ERROR', err && (err.stack || err));
    const msg = (err && err.message) ? err.message : 'Server error';
    res.status(500).json({ ok:false, message: msg });
  }
});

/**
 * DELETE /api/about/:id
 * Roles: creator or admin
 */
router.delete('/:id', auth, roles(['manager','admin']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isObjectIdString(id)) return res.status(400).json({ ok:false, message:'Invalid id' });

    const about = await About.findById(id);
    if (!about) return res.status(404).json({ ok:false, message:'Not found' });

    const role = (req.user && req.user.role || '').toLowerCase();
    const iAmCreator = String(about.createdBy || '') === String(req.user._id);
    const isAdmin = role === 'admin';

    if (!iAmCreator && !isAdmin) return res.status(403).json({ ok:false, message:'Not allowed' });

    await About.deleteOne({ _id: about._id });
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /about/:id ERROR', err && (err.stack || err));
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
