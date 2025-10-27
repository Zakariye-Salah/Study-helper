// backend/routes/courses.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const Course = require('../models/Course');
const PurchaseAttempt = require('../models/PurchaseAttempt');
const HelpMessage = require('../models/HelpMessage');

// Helper for pagination + search + filters
function buildCourseQuery({ q = '', filter = 'all' }) {
  const query = { deleted: { $ne: true } };
  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i');
    query.$or = [{ title: rx }, { courseId: rx }, { shortDescription: rx }, { longDescription: rx }];
  }
  if (filter === 'free') query.isFree = true;
  if (filter === 'fee') query.isFree = false;
  return query;
}

/**
 * GET /api/courses
 * Query params: q, filter=all|free|fee, sort=newest|price_asc|price_desc|duration, page, limit
 */
router.get('/', auth, async (req, res) => {
  try {
    const q = req.query.q || '';
    const filter = (req.query.filter || 'all').toLowerCase();
    const sort = (req.query.sort || 'newest').toLowerCase();
    const page = Math.max(1, parseInt(req.query.page || '1',10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '12',10)));

    const query = buildCourseQuery({ q, filter });

    let cursor = Course.find(query).select('-__v');

    if (sort === 'price_asc') cursor = cursor.sort({ price: 1 });
    else if (sort === 'price_desc') cursor = cursor.sort({ price: -1 });
    else cursor = cursor.sort({ createdAt: -1 });

    const total = await Course.countDocuments(query);
    const items = await cursor.skip((page-1)*limit).limit(limit).lean().exec();

    res.json({ ok:true, items, total, page, limit });
  } catch (err) {
    console.error('GET /courses', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * GET /api/courses/:id
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const course = await Course.findOne({ $or: [{ _id: id }, { courseId: id }]}).lean().exec();
    if(!course) return res.status(404).json({ ok:false, message: 'Course not found' });
    if (course.deleted) return res.status(404).json({ ok:false, message: 'Course not found' });

    return res.json({ ok:true, course });
  } catch (err) {
    console.error('GET /courses/:id', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * POST /api/courses  (admin only)
 */
router.post('/', auth, roles(['admin']), async (req, res) => {
  try {
    const {
      courseId, title, isFree, price, discountPercent, duration,
      shortDescription, longDescription, thumbnailUrl, media, visibility
    } = req.body || {};

    if (!title) return res.status(400).json({ ok:false, message: 'title required' });
    if (!isFree && (!price || Number(price) <= 0)) return res.status(400).json({ ok:false, message: 'price required for paid course' });
    if (discountPercent && Number(discountPercent) < 0) return res.status(400).json({ ok:false, message: 'invalid discount' });

    // ensure unique courseId if supplied
    if (courseId) {
      const exists = await Course.findOne({ courseId }).lean();
      if (exists) return res.status(400).json({ ok:false, message: 'courseId already in use' });
    }

    // create
    const c = new Course({
      courseId: courseId || undefined,
      title,
      isFree: !!isFree,
      price: Number(price || 0),
      discountPercent: Number(discountPercent || 0),
      duration: duration || '',
      shortDescription: shortDescription || '',
      longDescription: longDescription || '',
      thumbnailUrl: thumbnailUrl || '',
      media: Array.isArray(media) ? media : [],
      visibility: visibility || 'public',
      createdBy: req.user._id,
      updatedBy: req.user._id,
      lastPublishedPrice: Number(price || 0)
    });

    await c.save();
    return res.json({ ok:true, course: c });
  } catch (err) {
    console.error('POST /courses', err);
    if (err && err.code === 11000) return res.status(400).json({ ok:false, message: 'Duplicate courseId' });
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * PUT /api/courses/:id (admin)
 */
router.put('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok:false, message: 'Course not found' });

    const upable = ['title','isFree','price','discountPercent','duration','shortDescription','longDescription','thumbnailUrl','media','visibility','courseId'];
    upable.forEach(k => {
      if (typeof req.body[k] !== 'undefined') c[k] = req.body[k];
    });
    c.updatedBy = req.user._id;
    c.updatedAt = new Date();
    if (typeof req.body.price !== 'undefined') c.lastPublishedPrice = Number(req.body.price || 0);

    await c.save();
    res.json({ ok:true, course: c });
  } catch (err) {
    console.error('PUT /courses/:id', err);
    if (err && err.code === 11000) return res.status(400).json({ ok:false, message: 'Duplicate courseId' });
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * DELETE /api/courses/:id  (soft-delete admin)
 */
router.delete('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok:false, message: 'Course not found' });
    if (c.deleted) return res.status(400).json({ ok:false, message: 'Already deleted' });

    // soft-delete
    c.deleted = true;
    c.deletedAt = new Date();
    c.deletedBy = req.user._id;
    await c.save();

    res.json({ ok:true, deleted: true });
  } catch (err) {
    console.error('DELETE /courses/:id', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * POST /api/courses/:id/restore  (admin)
 */
router.post('/:id/restore', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok:false, message: 'Course not found' });
    if (!c.deleted) return res.status(400).json({ ok:false, message: 'Course not deleted' });

    c.deleted = false;
    c.deletedAt = null;
    c.deletedBy = null;
    await c.save();
    res.json({ ok:true, restored: true });
  } catch (err) {
    console.error('POST /courses/:id/restore', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * DELETE /api/courses/:id/permanent  (admin)
 */
router.delete('/:id/permanent', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok:false, message: 'Course not found' });

    // check purchases
    const purchaseCount = await PurchaseAttempt.countDocuments({ courseId: c._id, status: 'verified' }).catch(()=>0);
    if (purchaseCount > 0 && !req.query.force) {
      return res.status(400).json({ ok:false, message: 'Course has verified purchases. Pass ?force=1 to permanently delete and remove associated records.' });
    }

    await Course.deleteOne({ _id: c._id });
    // optionally cascade purchases (not done by default)
    if (req.query.force === '1' || req.query.force === 'true') {
      await PurchaseAttempt.deleteMany({ courseId: c._id }).catch(()=>{});
    }
    res.json({ ok:true, deletedPermanently: true });
  } catch (err) {
    console.error('DELETE /courses/:id/permanent', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * Protected media streaming endpoint (very simple example)
 * GET /api/courses/:id/media/:idx
 * Only allow streaming if user has verified purchase or course is free.
 */
router.get('/:id/media/:idx', auth, async (req, res) => {
  try {
    const courseId = req.params.id;
    const idx = parseInt(req.params.idx || '0', 10);

    const course = await Course.findOne({ $or: [{ _id: courseId }, { courseId: courseId }] }).lean();
    if (!course) return res.status(404).json({ ok:false, message: 'Course not found' });
    if (!course.media || !Array.isArray(course.media) || !course.media[idx]) {
      return res.status(404).json({ ok:false, message: 'Media not found' });
    }

    // free course -> allow
    if (course.isFree) {
      return res.json({ ok:true, media: course.media[idx] });
    }

    // check for a verified purchase for this user
    const has = await PurchaseAttempt.findOne({ userId: req.user._id, courseId: course._id, status: 'verified' }).lean();
    if (!has) return res.status(403).json({ ok:false, message: 'Not allowed' });

    return res.json({ ok:true, media: course.media[idx] });
  } catch (err) {
    console.error('GET /courses/:id/media/:idx', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

module.exports = router;

