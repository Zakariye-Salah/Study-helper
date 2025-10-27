// // backend/routes/courses.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');

// const auth = require('../middleware/auth');
// const roles = require('../middleware/roles');

// const Course = require('../models/Course');
// const PurchaseAttempt = require('../models/PurchaseAttempt');
// const HelpMessage = require('../models/HelpMessage');

// // Helper for pagination + search + filters
// function buildCourseQuery({ q = '', filter = 'all' }) {
//   const query = { deleted: { $ne: true } };
//   if (q && String(q).trim()) {
//     const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i');
//     query.$or = [{ title: rx }, { courseId: rx }, { shortDescription: rx }, { longDescription: rx }];
//   }
//   if (filter === 'free') query.isFree = true;
//   if (filter === 'fee') query.isFree = false;
//   return query;
// }

// /**
//  * GET /api/courses
//  * Query params: q, filter=all|free|fee, sort=newest|price_asc|price_desc|duration, page, limit
//  */
// router.get('/', auth, async (req, res) => {
//   try {
//     const q = req.query.q || '';
//     const filter = (req.query.filter || 'all').toLowerCase();
//     const sort = (req.query.sort || 'newest').toLowerCase();
//     const page = Math.max(1, parseInt(req.query.page || '1',10));
//     const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '12',10)));

//     const query = buildCourseQuery({ q, filter });

//     let cursor = Course.find(query).select('-__v');

//     if (sort === 'price_asc') cursor = cursor.sort({ price: 1 });
//     else if (sort === 'price_desc') cursor = cursor.sort({ price: -1 });
//     else cursor = cursor.sort({ createdAt: -1 });

//     const total = await Course.countDocuments(query);
//     const items = await cursor.skip((page-1)*limit).limit(limit).lean().exec();

//     res.json({ ok:true, items, total, page, limit });
//   } catch (err) {
//     console.error('GET /courses', err);
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// /**
//  * GET /api/courses/:id
//  */
// router.get('/:id', auth, async (req, res) => {
//   try {
//     const id = req.params.id;
//     const course = await Course.findOne({ $or: [{ _id: id }, { courseId: id }]}).lean().exec();
//     if(!course) return res.status(404).json({ ok:false, message: 'Course not found' });
//     if (course.deleted) return res.status(404).json({ ok:false, message: 'Course not found' });

//     return res.json({ ok:true, course });
//   } catch (err) {
//     console.error('GET /courses/:id', err);
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// /**
//  * POST /api/courses  (admin only)
//  */
// router.post('/', auth, roles(['admin']), async (req, res) => {
//   try {
//     const {
//       courseId, title, isFree, price, discountPercent, duration,
//       shortDescription, longDescription, thumbnailUrl, media, visibility
//     } = req.body || {};

//     if (!title) return res.status(400).json({ ok:false, message: 'title required' });
//     if (!isFree && (!price || Number(price) <= 0)) return res.status(400).json({ ok:false, message: 'price required for paid course' });
//     if (discountPercent && Number(discountPercent) < 0) return res.status(400).json({ ok:false, message: 'invalid discount' });

//     // ensure unique courseId if supplied
//     if (courseId) {
//       const exists = await Course.findOne({ courseId }).lean();
//       if (exists) return res.status(400).json({ ok:false, message: 'courseId already in use' });
//     }

//     // create
//     const c = new Course({
//       courseId: courseId || undefined,
//       title,
//       isFree: !!isFree,
//       price: Number(price || 0),
//       discountPercent: Number(discountPercent || 0),
//       duration: duration || '',
//       shortDescription: shortDescription || '',
//       longDescription: longDescription || '',
//       thumbnailUrl: thumbnailUrl || '',
//       media: Array.isArray(media) ? media : [],
//       visibility: visibility || 'public',
//       createdBy: req.user._id,
//       updatedBy: req.user._id,
//       lastPublishedPrice: Number(price || 0)
//     });

//     await c.save();
//     return res.json({ ok:true, course: c });
//   } catch (err) {
//     console.error('POST /courses', err);
//     if (err && err.code === 11000) return res.status(400).json({ ok:false, message: 'Duplicate courseId' });
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// /**
//  * PUT /api/courses/:id (admin)
//  */
// router.put('/:id', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const c = await Course.findById(id);
//     if (!c) return res.status(404).json({ ok:false, message: 'Course not found' });

//     const upable = ['title','isFree','price','discountPercent','duration','shortDescription','longDescription','thumbnailUrl','media','visibility','courseId'];
//     upable.forEach(k => {
//       if (typeof req.body[k] !== 'undefined') c[k] = req.body[k];
//     });
//     c.updatedBy = req.user._id;
//     c.updatedAt = new Date();
//     if (typeof req.body.price !== 'undefined') c.lastPublishedPrice = Number(req.body.price || 0);

//     await c.save();
//     res.json({ ok:true, course: c });
//   } catch (err) {
//     console.error('PUT /courses/:id', err);
//     if (err && err.code === 11000) return res.status(400).json({ ok:false, message: 'Duplicate courseId' });
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// /**
//  * DELETE /api/courses/:id  (soft-delete admin)
//  */
// router.delete('/:id', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const c = await Course.findById(id);
//     if (!c) return res.status(404).json({ ok:false, message: 'Course not found' });
//     if (c.deleted) return res.status(400).json({ ok:false, message: 'Already deleted' });

//     // soft-delete
//     c.deleted = true;
//     c.deletedAt = new Date();
//     c.deletedBy = req.user._id;
//     await c.save();

//     res.json({ ok:true, deleted: true });
//   } catch (err) {
//     console.error('DELETE /courses/:id', err);
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// /**
//  * POST /api/courses/:id/restore  (admin)
//  */
// router.post('/:id/restore', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const c = await Course.findById(id);
//     if (!c) return res.status(404).json({ ok:false, message: 'Course not found' });
//     if (!c.deleted) return res.status(400).json({ ok:false, message: 'Course not deleted' });

//     c.deleted = false;
//     c.deletedAt = null;
//     c.deletedBy = null;
//     await c.save();
//     res.json({ ok:true, restored: true });
//   } catch (err) {
//     console.error('POST /courses/:id/restore', err);
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// /**
//  * DELETE /api/courses/:id/permanent  (admin)
//  */
// router.delete('/:id/permanent', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const c = await Course.findById(id);
//     if (!c) return res.status(404).json({ ok:false, message: 'Course not found' });

//     // check purchases
//     const purchaseCount = await PurchaseAttempt.countDocuments({ courseId: c._id, status: 'verified' }).catch(()=>0);
//     if (purchaseCount > 0 && !req.query.force) {
//       return res.status(400).json({ ok:false, message: 'Course has verified purchases. Pass ?force=1 to permanently delete and remove associated records.' });
//     }

//     await Course.deleteOne({ _id: c._id });
//     // optionally cascade purchases (not done by default)
//     if (req.query.force === '1' || req.query.force === 'true') {
//       await PurchaseAttempt.deleteMany({ courseId: c._id }).catch(()=>{});
//     }
//     res.json({ ok:true, deletedPermanently: true });
//   } catch (err) {
//     console.error('DELETE /courses/:id/permanent', err);
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// /**
//  * Protected media streaming endpoint (very simple example)
//  * GET /api/courses/:id/media/:idx
//  * Only allow streaming if user has verified purchase or course is free.
//  */
// router.get('/:id/media/:idx', auth, async (req, res) => {
//   try {
//     const courseId = req.params.id;
//     const idx = parseInt(req.params.idx || '0', 10);

//     const course = await Course.findOne({ $or: [{ _id: courseId }, { courseId: courseId }] }).lean();
//     if (!course) return res.status(404).json({ ok:false, message: 'Course not found' });
//     if (!course.media || !Array.isArray(course.media) || !course.media[idx]) {
//       return res.status(404).json({ ok:false, message: 'Media not found' });
//     }

//     // free course -> allow
//     if (course.isFree) {
//       return res.json({ ok:true, media: course.media[idx] });
//     }

//     // check for a verified purchase for this user
//     const has = await PurchaseAttempt.findOne({ userId: req.user._id, courseId: course._id, status: 'verified' }).lean();
//     if (!has) return res.status(403).json({ ok:false, message: 'Not allowed' });

//     return res.json({ ok:true, media: course.media[idx] });
//   } catch (err) {
//     console.error('GET /courses/:id/media/:idx', err);
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// module.exports = router;

// backend/routes/courses.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const Course = require('../models/Course');
const Lesson = require('../models/Lesson'); // ensure Lesson model file uses guarded export
// Use PurchaseAttempt for user payment attempts / enrollments
const PurchaseAttempt = require('../models/PurchaseAttempt');

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
 * GET /api/courses
 * Query params: q, category, filter=all|free|fee, sort=newest|price_asc|price_desc, page, limit
 */
router.get('/', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();
    const filter = (req.query.filter || 'all').toLowerCase();
    const sort = (req.query.sort || 'newest').toLowerCase();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 12)));

    const match = { deleted: { $ne: true }, visible: { $ne: false } };

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [
        { title: re },
        { 'teacher.name': re },
        { courseId: re },
        { shortDescription: re },
        { longDescription: re }
      ];
    }
    if (category && category !== 'all') match.category = category;
    if (filter === 'free') match.isFree = true;
    if (filter === 'fee') match.isFree = false;

    let sortObj = { createdAt: -1 };
    if (sort === 'price_asc') sortObj = { price: 1, createdAt: -1 };
    if (sort === 'price_desc') sortObj = { price: -1, createdAt: -1 };
    if (sort === 'newest') sortObj = { createdAt: -1 };

    const [items, total] = await Promise.all([
      Course.find(match).sort(sortObj).skip((page - 1) * limit).limit(limit).lean(),
      Course.countDocuments(match)
    ]);

    return res.json({ ok: true, items, total, page, limit });
  } catch (err) {
    console.error('GET /courses', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/courses/categories
 */
router.get('/categories', auth, async (req, res) => {
  try {
    const cats = await Course.aggregate([
      { $match: { deleted: { $ne: true } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const categories = cats.map(c => c._id).filter(Boolean);
    return res.json({ ok: true, categories });
  } catch (err) {
    console.error('GET /courses/categories', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/courses/:id
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    // allow lookup by _id or courseId string
    const course = await Course.findOne({ $or: [{ _id: id }, { courseId: id }] }).lean().exec();
    if (!course || course.deleted) return res.status(404).json({ ok: false, message: 'Course not found' });
    return res.json({ ok: true, course });
  } catch (err) {
    console.error('GET /courses/:id', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/courses  (admin only)
 */
router.post('/', auth, roles(['admin']), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.title) return res.status(400).json({ ok: false, message: 'Title required' });

    // ensure uniqueness for supplied courseId
    if (body.courseId) {
      const found = await Course.findOne({ courseId: body.courseId }).lean();
      if (found) return res.status(400).json({ ok: false, message: 'courseId must be unique' });
    }

    // generate if not provided
    let courseId = body.courseId && String(body.courseId).trim();
    if (!courseId) {
      const count = await Course.countDocuments({});
      courseId = 'CRS' + String(count + 1).padStart(5, '0');
    }

    const c = new Course({
      courseId,
      title: body.title,
      category: body.category || 'Other',
      teacher: body.teacher || {},
      isFree: !!body.isFree,
      price: Number(body.price || 0),
      discountPercent: Number(body.discountPercent || 0),
      duration: body.duration || '',
      shortDescription: body.shortDescription || '',
      longDescription: body.longDescription || '',
      thumbnailUrl: body.thumbnailUrl || '',
      media: Array.isArray(body.media) ? body.media : [],
      marketingProvenCount: Number(body.marketingProvenCount || 0),
      visibility: body.visibility || 'public',
      createdBy: toObjectIdIfPossible(req.user._id),
      updatedBy: toObjectIdIfPossible(req.user._id),
      lastPublishedPrice: Number(body.price || 0)
    });
    await c.save();
    return res.json({ ok: true, course: c });
  } catch (err) {
    console.error('POST /courses', err);
    if (err && err.code === 11000) return res.status(400).json({ ok: false, message: 'Duplicate courseId' });
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * PUT /api/courses/:id  (admin)
 */
router.put('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok: false, message: 'Course not found' });

    if (body.courseId && String(body.courseId) !== String(c.courseId)) {
      const exists = await Course.findOne({ courseId: String(body.courseId) });
      if (exists) return res.status(400).json({ ok: false, message: 'courseId must be unique' });
      c.courseId = String(body.courseId);
    }

    const upable = ['title','category','teacher','isFree','price','discountPercent','duration','shortDescription','longDescription','thumbnailUrl','media','visibility','marketingProvenCount'];
    upable.forEach(k => {
      if (typeof body[k] !== 'undefined') c[k] = body[k];
    });

    c.updatedBy = toObjectIdIfPossible(req.user._id);
    c.updatedAt = new Date();
    if (typeof body.price !== 'undefined') c.lastPublishedPrice = Number(body.price || 0);

    await c.save();
    return res.json({ ok: true, notice: 'Saved', course: c });
  } catch (err) {
    console.error('PUT /courses/:id', err);
    if (err && err.code === 11000) return res.status(400).json({ ok: false, message: 'Duplicate courseId' });
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/courses/:id  (soft-delete admin)
 */
router.delete('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok: false, message: 'Course not found' });
    if (c.deleted) return res.status(400).json({ ok: false, message: 'Already deleted' });

    c.deleted = true;
    c.deletedAt = new Date();
    c.deletedBy = toObjectIdIfPossible(req.user._id);
    c.visible = false;
    await c.save();
    return res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error('DELETE /courses/:id', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/courses/:id/restore  (admin)
 */
router.post('/:id/restore', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok: false, message: 'Course not found' });
    if (!c.deleted) return res.status(400).json({ ok: false, message: 'Course not deleted' });

    c.deleted = false;
    c.deletedAt = null;
    c.deletedBy = null;
    c.visible = true;
    await c.save();
    return res.json({ ok: true, restored: true });
  } catch (err) {
    console.error('POST /courses/:id/restore', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/courses/:id/permanent  (admin)
 */
router.delete('/:id/permanent', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok: false, message: 'Course not found' });

    // check verified purchase attempts
    const purchaseCount = await PurchaseAttempt.countDocuments({ courseId: c._id, status: 'verified' }).catch(() => 0);
    if (purchaseCount > 0 && !(req.query.force === '1' || req.query.force === 'true')) {
      return res.status(400).json({ ok: false, message: 'Course has verified purchases. Pass ?force=1 to permanently delete and remove associated records.' });
    }

    // delete course and optionally cascade
    await Course.deleteOne({ _id: c._id });
    if (req.query.force === '1' || req.query.force === 'true') {
      await PurchaseAttempt.deleteMany({ courseId: c._id }).catch(() => {});
    }

    // delete lessons belonging to course
    await Lesson.deleteMany({ courseId: c._id }).catch(() => {});

    return res.json({ ok: true, deletedPermanently: true });
  } catch (err) {
    console.error('DELETE /courses/:id/permanent', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/courses/:id/media/:idx
 * Only return media object; server-side consumer must stream/protect actual files/URLs
 */
router.get('/:id/media/:idx', auth, async (req, res) => {
  try {
    const courseId = req.params.id;
    const idx = Number(req.params.idx || 0);

    const course = await Course.findOne({ $or: [{ _id: courseId }, { courseId: courseId }] }).lean();
    if (!course) return res.status(404).json({ ok: false, message: 'Course not found' });
    if (!course.media || !Array.isArray(course.media) || !course.media[idx]) {
      return res.status(404).json({ ok: false, message: 'Media not found' });
    }

    // admin always allowed
    const role = (req.user && (req.user.role || '')).toLowerCase();
    if (role === 'admin') {
      const media = course.media[idx];
      return res.json({ ok: true, media });
    }

    // free course -> allow
    if (course.isFree) {
      return res.json({ ok: true, media: course.media[idx] });
    }

    // otherwise check verified purchase
    const has = await PurchaseAttempt.findOne({
      userId: toObjectIdIfPossible(req.user._id),
      courseId: toObjectIdIfPossible(course._id),
      status: 'verified'
    }).lean();

    if (!has) return res.status(403).json({ ok: false, message: 'Not allowed' });

    return res.json({ ok: true, media: course.media[idx] });
  } catch (err) {
    console.error('GET /courses/:id/media/:idx', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
