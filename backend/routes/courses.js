// backend/routes/courses.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Purchase = require('../models/Purchase');
const HelpThread = require('../models/HelpThread');
const HelpMessage = require('../models/HelpMessage');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET counts (notification counts)
// GET /api/courses/counts  (auth required)
router.get('/counts', requireAuth, async (req, res) => {
  try {
    const checking = await Purchase.countDocuments({ status: 'checking' }).catch(()=>0);
    let help = 0;
    if ((req.user.role||'').toLowerCase() === 'admin') {
      // unread messages from users
      help = await HelpMessage.countDocuments({ toAdmin: true, read: false }).catch(()=>0);
    } else {
      help = await HelpMessage.countDocuments({ toUserId: req.user._id, read: false }).catch(()=>0);
    }
    return res.json({ ok:true, counts: { checking: checking || 0, help: help || 0 } });
  } catch (err) {
    console.error('GET /courses/counts error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// GET /api/courses/categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await Course.aggregate([
      { $match: { deleted: { $ne: true } } },
      { $unwind: { path: '$categories', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$categories' } },
      { $sort: { _id: 1 } }
    ]);
    const categories = cats.map(c => c._id).filter(Boolean);
    // fallback preset categories if none found
    if (!categories.length) {
      return res.json({ ok:true, categories: ['Mobile Repairing','Languages','Subjects','Programming','Hacking','Business','Design'] });
    }
    return res.json({ ok:true, categories });
  } catch (err) {
    console.error('GET /courses/categories error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// GET /api/courses  -> list (supports q, category, price, duration, rating, sort, page, limit)
router.get('/', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const category = req.query.category ? String(req.query.category) : '';
    const price = req.query.price ? String(req.query.price) : '';
    const duration = req.query.duration ? String(req.query.duration) : '';
    const rating = req.query.rating ? Number(req.query.rating) : 0;
    const sort = req.query.sort || 'newest';
    const page = Math.max(1, parseInt(req.query.page || '1',10));
    const limit = Math.min(100, parseInt(req.query.limit || '12',10));

    const filter = { deleted: { $ne: true } };

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i');
      filter.$or = [{ title: re }, { courseId: re }];
    }
    if (category) filter.categories = category;
    if (price === 'free') filter.isFree = true;
    else if (price === 'fee') filter.isFree = false;
    if (duration) filter.duration = duration;
    if (rating) filter.avgRating = { $gte: rating };

    let sortObj = { createdAt: -1 };
    if (sort === 'price_low') sortObj = { price: 1 };
    if (sort === 'price_high') sortObj = { price: -1 };

    const total = await Course.countDocuments(filter).catch(()=>0);
    const courses = await Course.find(filter).sort(sortObj).skip((page-1)*limit).limit(limit).lean().exec();

    // attach buyersCount if missing, and teacher minimal object
    const courseIds = courses.map(c=>c._id);
    const counts = await Purchase.aggregate([
      { $match: { courseId: { $in: courseIds.map(id => mongoose.Types.ObjectId(id)) }, status: 'verified' } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } }
    ]).catch(()=>[]);
    const mapCounts = {};
    (counts||[]).forEach(r => { mapCounts[String(r._id)] = r.count; });

    const out = courses.map(c => {
      return {
        _id: c._id,
        courseId: c.courseId,
        title: c.title,
        isFree: c.isFree,
        price: c.price,
        discount: c.discount,
        duration: c.duration,
        thumbnailUrl: c.thumbnailUrl,
        categories: c.categories || [],
        shortDescription: c.shortDescription,
        longDescription: c.longDescription,
        avgRating: c.avgRating || 0,
        buyersCount: Number(mapCounts[String(c._id)] || c.buyersCount || 0),
        teacher: c.teacher || null,
        createdAt: c.createdAt
      };
    });

    return res.json({ ok:true, total, courses: out });
  } catch (err) {
    console.error('GET /courses error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// GET /api/courses/:id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (mongoose.Types.ObjectId.isValid(id)) course = await Course.findById(id).lean();
    if (!course) course = await Course.findOne({ courseId: id }).lean();
    if (!course) return res.status(404).json({ ok:false, error:'Course not found' });
    // add buyersCount
    const buyersCount = await Purchase.countDocuments({ courseId: course._id, status: 'verified' }).catch(()=>0);
    course.buyersCount = Number(buyersCount || course.buyersCount || 0);
    return res.json({ ok:true, course });
  } catch (err) {
    console.error('GET /courses/:id error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// POST /api/courses (admin)
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.title) return res.status(400).json({ ok:false, error:'Title required' });

    // generate courseId if absent
    let newCourseId = body.courseId && String(body.courseId).trim();
    if (!newCourseId) {
      const count = await Course.countDocuments({}).catch(()=>0);
      newCourseId = 'CRS' + String(count + 1).padStart(5,'0');
    }

    const doc = new Course({
      courseId: newCourseId,
      title: body.title,
      teacher: body.teacher || {}, // expects { name, photo, bio, title }
      teacherId: body.teacherId || null,
      isFree: !!body.isFree,
      price: Number(body.price || 0),
      discount: Number(body.discount || 0),
      duration: body.duration || '',
      shortDescription: body.shortDescription || '',
      longDescription: body.longDescription || '',
      thumbnailUrl: body.thumbnailUrl || '',
      media: Array.isArray(body.media) ? body.media : [],
      categories: Array.isArray(body.categories) ? body.categories : (body.categories ? String(body.categories).split(',').map(s=>s.trim()).filter(Boolean) : []),
      createdBy: req.user._id
    });
    await doc.save();
    return res.json({ ok:true, course: doc });
  } catch (err) {
    console.error('POST /courses error', err);
    if (err && err.code === 11000) return res.status(400).json({ ok:false, error:'Duplicate courseId' });
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// PUT /api/courses/:id (admin)
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    let course = null;
    if (mongoose.Types.ObjectId.isValid(id)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok:false, error:'Not found' });

    if (body.courseId) course.courseId = body.courseId;
    if (body.title) course.title = body.title;
    if (body.teacher) course.teacher = body.teacher;
    if (body.teacherId) course.teacherId = body.teacherId;
    course.isFree = !!body.isFree;
    course.price = Number(body.price || 0);
    course.discount = Number(body.discount || 0);
    course.duration = body.duration || '';
    course.shortDescription = body.shortDescription || '';
    course.longDescription = body.longDescription || '';
    course.thumbnailUrl = body.thumbnailUrl || '';
    course.media = Array.isArray(body.media) ? body.media : course.media;
    course.categories = Array.isArray(body.categories) ? body.categories : (body.categories ? String(body.categories).split(',').map(s=>s.trim()).filter(Boolean) : course.categories);
    course.updatedBy = req.user._id;
    await course.save();
    return res.json({ ok:true, course });
  } catch (err) {
    console.error('PUT /courses/:id error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// DELETE /api/courses/:id (soft-delete)
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (mongoose.Types.ObjectId.isValid(id)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok:false, error:'Not found' });
    if (course.deleted) return res.json({ ok:true, message:'Already deleted' });
    course.deleted = true; course.deletedAt = new Date(); course.deletedBy = req.user._id;
    await course.save();
    return res.json({ ok:true, message:'Soft-deleted' });
  } catch (err) {
    console.error('DELETE /courses/:id error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// POST /api/courses/:id/restore (admin)
router.post('/:id/restore', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (mongoose.Types.ObjectId.isValid(id)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok:false, error:'Not found' });
    course.deleted = false; course.deletedAt = null; course.deletedBy = null;
    await course.save();
    return res.json({ ok:true, message:'Restored' });
  } catch (err) {
    console.error('POST /courses/:id/restore error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * Lessons
 * GET /api/courses/:id/lessons
 * POST /api/courses/:id/lessons  (admin only for adding lessons)
 */
router.get('/:id/lessons', async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (mongoose.Types.ObjectId.isValid(id)) course = await Course.findById(id).lean();
    if (!course) course = await Course.findOne({ courseId: id }).lean();
    if (!course) return res.status(404).json({ ok:false, error:'Course not found' });
    const lessons = await Lesson.find({ courseId: course._id, deleted: { $ne: true } }).sort({ order: 1, createdAt: 1 }).lean().exec();
    return res.json({ ok:true, lessons });
  } catch (err) {
    console.error('GET /courses/:id/lessons error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

router.post('/:id/lessons', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    let course = null;
    if (mongoose.Types.ObjectId.isValid(id)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok:false, error:'Course not found' });

    if (!body.title) return res.status(400).json({ ok:false, error:'Title required' });

    const ls = new Lesson({
      courseId: course._id,
      title: body.title,
      type: body.type || 'video',
      url: body.url || '',
      description: body.description || '',
      duration: body.duration || '',
      isPublic: !!body.isPublic,
      order: Number(body.order || 0),
      createdBy: req.user._id
    });
    await ls.save();
    return res.json({ ok:true, lesson: ls });
  } catch (err) {
    console.error('POST /courses/:id/lessons error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

module.exports = router;
