// backend/routes/courses.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Course = require('../models/Course');
const PurchaseAttempt = require('../models/PurchaseAttempt');
const HelpMessage = require('../models/HelpMessageCourses');
const User = require('../models/User'); // if you have a User model

const auth = require('../middleware/auth');   // assumes existing auth middleware
const roles = require('../middleware/roles');

function toObjectIdIfPossible(id) {
  try { if (mongoose.Types.ObjectId.isValid(String(id))) return mongoose.Types.ObjectId(String(id)); } catch(e) {}
  return id;
}
function escapeRegex(s=''){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

async function generateCourseId() {
  const cnt = await Course.countDocuments().exec().catch(()=>0);
  const n = cnt + 1;
  return 'CRS' + String(n).padStart(5,'0');
}

/* GET /courses
   Query: q (title or courseId partial), filter (all/free/fee), sort, page, limit
*/
router.get('/', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = (req.query.filter || 'all').toLowerCase();
    const sort = (req.query.sort || 'newest').toLowerCase();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(6, parseInt(req.query.limit || '12', 10)));
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const query = {};
    if (!includeDeleted) query.deleted = false;
    else {
      // only admins allowed to view deleted explicitly
      if (!req.user || String(req.user.role||'').toLowerCase() !== 'admin') delete query.deleted;
    }
    if (filter === 'free') query.isFree = true;
    if (filter === 'fee') query.isFree = false;
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      query.$or = [{ title: re }, { courseId: re }];
    }
    let sortSpec = { createdAt: -1 };
    if (sort === 'price_asc') sortSpec = { price: 1 };
    if (sort === 'price_desc') sortSpec = { price: -1 };
    if (sort === 'duration') sortSpec = { duration: 1 };
    const total = await Course.countDocuments(query).exec();
    const items = await Course.find(query).sort(sortSpec).skip((page-1)*limit).limit(limit).lean().exec();
    res.json({ ok:true, total, page, limit, courses: items });
  } catch (err) {
    console.error('GET /courses', err);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

/* POST /courses - create (admin only) */
router.post('/', auth, roles(['admin']), async (req, res) => {
  try {
    const b = req.body || {};
    const courseId = b.courseId ? String(b.courseId).trim() : await generateCourseId();
    if (await Course.findOne({ courseId })) return res.status(400).json({ ok:false, message:'courseId must be unique' });
    const isFree = !!b.isFree;
    const price = Number(b.price || 0);
    if (!isFree && (!price || price <= 0)) return res.status(400).json({ ok:false, message:'price required for paid courses' });
    const discount = Math.max(0, Math.min(100, Number(b.discount || 0)));
    const c = new Course({
      courseId,
      title: b.title || 'Untitled',
      isFree,
      price: isFree ? 0 : price,
      discount,
      duration: b.duration || '',
      shortDescription: b.shortDescription || '',
      longDescription: b.longDescription || '',
      thumbnailUrl: b.thumbnailUrl || '',
      media: Array.isArray(b.media) ? b.media : [],
      visibility: b.visibility || 'public',
      createdBy: toObjectIdIfPossible(req.user._id),
      updatedBy: toObjectIdIfPossible(req.user._id)
    });
    await c.save();
    res.json({ ok:true, course: c });
  } catch (err) {
    console.error('POST /courses', err);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

/* PUT /courses/:id - edit (admin only) */
router.put('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const c = await Course.findById(req.params.id);
    if (!c) return res.status(404).json({ ok:false, message:'Not found' });
    const b = req.body || {};
    if (b.courseId && String(b.courseId).trim() !== c.courseId) {
      if (await Course.findOne({ courseId: String(b.courseId).trim(), _id: { $ne: c._id } })) {
        return res.status(400).json({ ok:false, message:'courseId must be unique' });
      }
      c.courseId = String(b.courseId).trim();
    }
    if (typeof b.title !== 'undefined') c.title = b.title;
    if (typeof b.isFree !== 'undefined') c.isFree = !!b.isFree;
    if (typeof b.price !== 'undefined') c.price = Number(b.price || 0);
    if (typeof b.discount !== 'undefined') c.discount = Math.max(0, Math.min(100, Number(b.discount || 0)));
    if (typeof b.duration !== 'undefined') c.duration = b.duration;
    if (typeof b.shortDescription !== 'undefined') c.shortDescription = b.shortDescription;
    if (typeof b.longDescription !== 'undefined') c.longDescription = b.longDescription;
    if (typeof b.thumbnailUrl !== 'undefined') c.thumbnailUrl = b.thumbnailUrl;
    if (Array.isArray(b.media)) c.media = b.media;
    if (typeof b.visibility !== 'undefined') c.visibility = b.visibility;
    c.updatedBy = toObjectIdIfPossible(req.user._id);
    await c.save();
    res.json({ ok:true, course: c });
  } catch (err) {
    console.error('PUT /courses/:id', err);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

/* DELETE /courses/:id - soft delete */
router.delete('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const c = await Course.findById(req.params.id);
    if (!c) return res.status(404).json({ ok:false, message:'Not found' });
    c.deleted = true; c.deletedAt = new Date(); c.deletedBy = toObjectIdIfPossible(req.user._id);
    await c.save();
    res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /courses/:id', err);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

/* POST /courses/:id/restore - admin restore */
router.post('/:id/restore', auth, roles(['admin']), async (req, res) => {
  try {
    const c = await Course.findById(req.params.id);
    if (!c) return res.status(404).json({ ok:false, message:'Not found' });
    c.deleted = false; c.deletedAt = null; c.deletedBy = null;
    await c.save();
    res.json({ ok:true, course: c });
  } catch (err) {
    console.error('POST /courses/:id/restore', err);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

/* GET /courses/:id - single course detail (admin can see deleted if included?) */
router.get('/:id', auth, async (req, res) => {
  try {
    let course = null;
    if (mongoose.Types.ObjectId.isValid(String(req.params.id))) course = await Course.findById(req.params.id).lean().exec();
    if (!course) course = await Course.findOne({ courseId: req.params.id }).lean().exec();
    if (!course) return res.status(404).json({ ok:false, message:'Not found' });
    if (course.deleted && String(req.user.role||'').toLowerCase() !== 'admin') {
      return res.status(404).json({ ok:false, message:'Not found' });
    }
    res.json({ ok:true, course });
  } catch (err) {
    console.error('GET /courses/:id', err);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
