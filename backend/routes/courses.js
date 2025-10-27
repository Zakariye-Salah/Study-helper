// backend/routes/courses.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Course = require('../models/Course');
const Lesson = require('../models/Lesson');

// Purchase and HelpMessage may be present in your codebase. Try to require them defensively.
let Purchase = null;
let HelpMessage = null;
try { Purchase = require('../models/Purchase'); } catch (e) { console.warn('Purchase model not found or failed to load — purchase-related aggregations will be skipped'); }
try { HelpMessage = require('../models/HelpMessage'); } catch (e) { /* optional */ }

const authModule = require('../middleware/auth');
const requireAuth = authModule && (authModule.requireAuth || authModule); // supports both import styles

function requireRole(role) {
  return (req, res, next) => {
    try {
      const r = (req.user && (req.user.role || '') || '').toString().toLowerCase();
      if (r !== (role || '').toString().toLowerCase()) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
      return next();
    } catch (e) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
  };
}

function computeDiscounted(price = 0, discount = 0) {
  const p = Number(price || 0);
  const d = Number(discount || 0);
  if (!p || !d) return p;
  return Math.round(p * (100 - Math.max(0, Math.min(100, d))) / 100);
}

/**
 * GET /api/courses/counts
 */
router.get('/counts', requireAuth, async (req, res) => {
  try {
    const checking = (typeof Purchase === 'function') ? await Purchase.countDocuments({ status: 'checking' }).catch(() => 0) : 0;
    let help = 0;
    const role = ((req.user && req.user.role) || '').toString().toLowerCase();
    if (role === 'admin' && HelpMessage) {
      help = await HelpMessage.countDocuments({ toAdmin: true, read: false }).catch(() => 0);
    } else if (HelpMessage) {
      help = await HelpMessage.countDocuments({ toUser: req.user._id, read: false }).catch(() => 0);
    }
    return res.json({ ok: true, counts: { checking: Number(checking || 0), help: Number(help || 0) } });
  } catch (err) {
    console.error('GET /courses/counts error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * GET /api/courses/categories
 */
router.get('/categories', async (req, res) => {
  try {
    const cats = await Course.aggregate([
      { $match: { deleted: { $ne: true } } },
      { $unwind: { path: '$categories', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$categories' } },
      { $sort: { _id: 1 } }
    ]).catch(() => []);
    const categories = (cats || []).map(c => c._id).filter(Boolean);
    if (!categories.length) {
      return res.json({ ok: true, categories: ['Mobile Repairing', 'Languages', 'Subjects', 'Programming', 'Business', 'Design'] });
    }
    return res.json({ ok: true, categories });
  } catch (err) {
    console.error('GET /courses/categories error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * GET /api/courses
 */
router.get('/', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const category = req.query.category ? String(req.query.category) : '';
    const price = req.query.price ? String(req.query.price) : '';
    const duration = req.query.duration ? String(req.query.duration) : '';
    const rating = req.query.rating ? Number(req.query.rating) : 0;
    const sort = req.query.sort || 'newest';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '12', 10));

    const filter = { deleted: { $ne: true } };

    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(safe, 'i');
      filter.$or = [{ title: re }, { courseId: re }, { shortDescription: re }, { longDescription: re }];
    }
    if (category) filter.categories = category;
    if (price === 'free') filter.isFree = true;
    else if (price === 'fee') filter.isFree = false;
    if (duration) filter.duration = duration;
    if (rating) filter.avgRating = { $gte: Number(rating) };

    let sortObj = { createdAt: -1 };
    if (sort === 'price_low') sortObj = { price: 1 };
    if (sort === 'price_high') sortObj = { price: -1 };
    if (sort === 'popular') sortObj = { buyersCount: -1, avgRating: -1 };
    if (sort === 'rating') sortObj = { avgRating: -1 };

    const total = await Course.countDocuments(filter).catch(() => 0);
    const docs = await Course.find(filter).sort(sortObj).skip((page - 1) * limit).limit(limit).lean().exec();

    // compute buyersCount via Purchase aggregation only when Purchase model available
    const courseIds = (docs || []).map(d => d._id).filter(Boolean);
    let counts = [];
    if (Purchase && Array.isArray(courseIds) && courseIds.length) {
      // ensure valid ObjectId list
      const validIds = courseIds.filter(id => mongoose.isValidObjectId(id)).map(id => mongoose.Types.ObjectId(id));
      if (validIds.length) {
        counts = await Purchase.aggregate([
          { $match: { courseId: { $in: validIds }, status: 'verified' } },
          { $group: { _id: '$courseId', count: { $sum: 1 } } }
        ]).catch((e) => {
          console.warn('Purchase aggregation failed', e && e.message);
          return [];
        });
      }
    }
    const countMap = {};
    (counts || []).forEach(c => { countMap[String(c._id)] = Number(c.count || 0); });

    const courses = (docs || []).map(c => {
      const priceNum = Number(c.price || 0);
      const disc = Number(c.discount || 0);
      const discountedPrice = computeDiscounted(priceNum, disc);
      return {
        _id: c._id,
        courseId: c.courseId || '',
        title: c.title || '',
        isFree: !!c.isFree,
        price: priceNum,
        discount: disc,
        discountedPrice,
        duration: c.duration || '',
        thumbnailUrl: c.thumbnailUrl || '',
        categories: Array.isArray(c.categories) ? c.categories : [],
        shortDescription: c.shortDescription || '',
        longDescription: c.longDescription || '',
        avgRating: typeof c.avgRating === 'number' ? c.avgRating : 0,
        buyersCount: Number(countMap[String(c._id)] || c.buyersCount || 0),
        teacher: c.teacher || null,
        teacherId: c.teacherId || null,
        createdAt: c.createdAt || c.createdAt,
      };
    });

    return res.json({ ok: true, total: Number(total || 0), courses });
  } catch (err) {
    console.error('GET /courses error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * GET /api/courses/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const includeLessons = !!(req.query.includeLessons && (req.query.includeLessons === '1' || req.query.includeLessons === 'true'));
    let course = null;
    if (mongoose.isValidObjectId(id)) course = await Course.findById(id).lean();
    if (!course) course = await Course.findOne({ courseId: id }).lean();
    if (!course) return res.status(404).json({ ok: false, error: 'Course not found' });

    const buyersCount = (typeof Purchase === 'function') ? await Purchase.countDocuments({ courseId: course._id, status: 'verified' }).catch(() => 0) : (course.buyersCount || 0);
    course.buyersCount = Number(buyersCount || course.buyersCount || 0);

    course.discountedPrice = computeDiscounted(Number(course.price || 0), Number(course.discount || 0));

    if (includeLessons) {
      const lessons = await Lesson.find({ courseId: course._id, deleted: { $ne: true } }).sort({ order: 1, createdAt: 1 }).lean().exec();
      course.lessons = lessons;
    }

    return res.json({ ok: true, course });
  } catch (err) {
    console.error('GET /courses/:id error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /api/courses  (admin)
 */
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.title || !String(body.title).trim()) return res.status(400).json({ ok: false, error: 'Title required' });

    let newCourseId = body.courseId && String(body.courseId).trim();
    if (!newCourseId) {
      const count = await Course.countDocuments({}).catch(() => 0);
      newCourseId = 'CRS' + String(count + 1).padStart(5, '0');
    }

    let categories = [];
    if (Array.isArray(body.categories)) categories = body.categories.map(String);
    else if (body.categories && typeof body.categories === 'string') categories = body.categories.split(',').map(s => s.trim()).filter(Boolean);

    let teacherObj = null;
    if (body.teacher && typeof body.teacher === 'object') {
      teacherObj = {
        fullname: body.teacher.fullname || body.teacher.name || '',
        photo: body.teacher.photo || body.teacher.image || '',
        title: body.teacher.title || '',
        bio: body.teacher.bio || body.teacher.overview || ''
      };
    } else if (body.teacherName || body.teacherFullname) {
      teacherObj = {
        fullname: body.teacherName || body.teacherFullname,
        photo: body.teacherPhoto || '',
        title: body.teacherTitle || '',
        bio: body.teacherOverview || ''
      };
    }

    const doc = new Course({
      courseId: newCourseId,
      title: String(body.title).trim(),
      teacher: teacherObj || {},
      teacherId: body.teacherId || null,
      isFree: !!body.isFree,
      price: Number(body.price || 0),
      discount: Number(body.discount || 0),
      duration: body.duration || '',
      shortDescription: body.shortDescription || '',
      longDescription: body.longDescription || '',
      thumbnailUrl: body.thumbnailUrl || '',
      media: Array.isArray(body.media) ? body.media : [],
      categories,
      createdBy: req.user._id
    });

    await doc.save();

    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.emit('course:created', { courseId: doc._id, course: doc });
    } catch (e) { console.warn('course create emit failed', e); }

    return res.json({ ok: true, course: doc });
  } catch (err) {
    console.error('POST /courses error', err && (err.stack || err));
    if (err && err.code === 11000) return res.status(400).json({ ok: false, error: 'Duplicate courseId' });
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * PUT /api/courses/:id  (admin)
 */
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    let course = null;
    if (mongoose.isValidObjectId(id)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok: false, error: 'Not found' });

    if (body.courseId) course.courseId = String(body.courseId).trim();
    if (body.title) course.title = String(body.title).trim();

    if (body.teacher && typeof body.teacher === 'object') {
      course.teacher = {
        fullname: body.teacher.fullname || body.teacher.name || (course.teacher && course.teacher.fullname) || '',
        photo: body.teacher.photo || (course.teacher && course.teacher.photo) || '',
        title: body.teacher.title || (course.teacher && course.teacher.title) || '',
        bio: body.teacher.bio || body.teacher.overview || (course.teacher && course.teacher.bio) || ''
      };
    }
    if (body.teacherId) course.teacherId = body.teacherId;

    course.isFree = !!body.isFree;
    course.price = Number(body.price || 0);
    course.discount = Number(body.discount || 0);
    course.duration = body.duration || course.duration || '';
    course.shortDescription = body.shortDescription || course.shortDescription || '';
    course.longDescription = body.longDescription || course.longDescription || '';
    course.thumbnailUrl = body.thumbnailUrl || course.thumbnailUrl || '';
    course.media = Array.isArray(body.media) ? body.media : course.media;
    if (Array.isArray(body.categories)) course.categories = body.categories;
    else if (body.categories && typeof body.categories === 'string') course.categories = body.categories.split(',').map(s => s.trim()).filter(Boolean);

    course.updatedBy = req.user._id;
    course.updatedAt = new Date();

    await course.save();

    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.emit('course:updated', { courseId: course._id, course });
    } catch (e) { console.warn('course update emit failed', e); }

    return res.json({ ok: true, course });
  } catch (err) {
    console.error('PUT /courses/:id error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * DELETE /api/courses/:id (soft-delete) (admin)
 */
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (mongoose.isValidObjectId(id)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok: false, error: 'Not found' });

    if (course.deleted) return res.json({ ok: true, message: 'Already deleted' });

    course.deleted = true;
    course.deletedAt = new Date();
    course.deletedBy = req.user._id;
    await course.save();

    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.emit('course:deleted', { courseId: course._id });
    } catch (e) { console.warn('course delete emit failed', e); }

    return res.json({ ok: true, message: 'Soft-deleted' });
  } catch (err) {
    console.error('DELETE /courses/:id error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /api/courses/:id/restore (admin)
 */
router.post('/:id/restore', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (mongoose.isValidObjectId(id)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok: false, error: 'Not found' });

    course.deleted = false;
    course.deletedAt = null;
    course.deletedBy = null;
    await course.save();

    return res.json({ ok: true, message: 'Restored' });
  } catch (err) {
    console.error('POST /courses/:id/restore error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * GET /api/courses/:id/lessons
 */
router.get('/:id/lessons', async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (mongoose.isValidObjectId(id)) course = await Course.findById(id).lean();
    if (!course) course = await Course.findOne({ courseId: id }).lean();
    if (!course) return res.status(404).json({ ok: false, error: 'Course not found' });

    const lessons = await Lesson.find({ courseId: course._id, deleted: { $ne: true } }).sort({ order: 1, createdAt: 1 }).lean().exec();
    return res.json({ ok: true, lessons });
  } catch (err) {
    console.error('GET /courses/:id/lessons error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /api/courses/:id/lessons  (admin)
 */
router.post('/:id/lessons', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    let course = null;
    if (mongoose.isValidObjectId(id)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok: false, error: 'Course not found' });

    if (!body.title || !String(body.title).trim()) return res.status(400).json({ ok: false, error: 'Title required' });

    const ls = new Lesson({
      courseId: course._id,
      title: String(body.title).trim(),
      type: body.type || 'video',
      url: body.url || '',
      description: body.description || '',
      duration: body.duration || '',
      isPublic: !!body.isPublic,
      order: Number(body.order || 0),
      createdBy: req.user._id
    });

    await ls.save();

    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.emit('course:lesson_created', { courseId: String(course._id), lessonId: ls._id, lesson: ls });
    } catch (e) { console.warn('lesson emit failed', e); }

    return res.json({ ok: true, lesson: ls });
  } catch (err) {
    console.error('POST /courses/:id/lessons error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /api/courses/:id/rate  (authenticated user)
 * Body: { rating: number }
 */
router.post('/:id/rate', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const rating = Number((req.body && req.body.rating) || 0);
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ ok: false, error: 'Rating must be 1..5' });

    let course = null;
    if (mongoose.isValidObjectId(id)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok: false, error: 'Course not found' });

    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const idx = (course.ratings || []).findIndex(r => String(r.by) === String(userId));
    if (idx >= 0) {
      course.ratings[idx].rating = rating;
    } else {
      course.ratings.push({ by: userId, rating });
    }

    if (typeof course.recalcAvgRating === 'function') course.recalcAvgRating();
    else {
      // fallback: manual recalc
      if (Array.isArray(course.ratings) && course.ratings.length) {
        let sum = 0;
        course.ratings.forEach(r => sum += Number(r.rating || 0));
        course.avgRating = Math.round((sum / course.ratings.length) * 10) / 10;
      } else course.avgRating = 0;
    }

    await course.save();

    return res.json({ ok: true, avgRating: course.avgRating || 0, ratingsCount: (course.ratings || []).length });
  } catch (err) {
    console.error('POST /courses/:id/rate error', err && (err.stack || err));
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
