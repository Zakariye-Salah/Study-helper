// // backend/routes/courses.js
// const express = require('express');
// const mongoose = require('mongoose');
// const router = express.Router();

// const auth = require('../middleware/auth');
// const roles = require('../middleware/roles');

// const Course = require('../models/Course');
// const Lesson = require('../models/Lesson'); // ensure Lesson model file uses guarded export
// // Use PurchaseAttempt for user payment attempts / enrollments
// const PurchaseAttempt = require('../models/PurchaseAttempt');

// function isObjectIdString(s) {
//   return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s);
// }
// function toObjectIdIfPossible(id) {
//   try {
//     const s = String(id || '');
//     if (isObjectIdString(s)) return new mongoose.Types.ObjectId(s);
//   } catch (e) {}
//   return id;
// }

// /**
//  * GET /api/courses
//  * Query params: q, category, filter=all|free|fee, sort=newest|price_asc|price_desc, page, limit
//  */
// router.get('/', auth, async (req, res) => {
//   try {
//     const q = (req.query.q || '').trim();
//     const category = (req.query.category || '').trim();
//     const filter = (req.query.filter || 'all').toLowerCase();
//     const sort = (req.query.sort || 'newest').toLowerCase();
//     const page = Math.max(1, Number(req.query.page || 1));
//     const limit = Math.min(100, Math.max(1, Number(req.query.limit || 12)));

//     const match = { deleted: { $ne: true }, visible: { $ne: false } };

//     if (q) {
//       const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
//       match.$or = [
//         { title: re },
//         { 'teacher.name': re },
//         { courseId: re },
//         { shortDescription: re },
//         { longDescription: re }
//       ];
//     }
//     if (category && category !== 'all') match.category = category;
//     if (filter === 'free') match.isFree = true;
//     if (filter === 'fee') match.isFree = false;

//     let sortObj = { createdAt: -1 };
//     if (sort === 'price_asc') sortObj = { price: 1, createdAt: -1 };
//     if (sort === 'price_desc') sortObj = { price: -1, createdAt: -1 };
//     if (sort === 'newest') sortObj = { createdAt: -1 };

//     const [items, total] = await Promise.all([
//       Course.find(match).sort(sortObj).skip((page - 1) * limit).limit(limit).lean(),
//       Course.countDocuments(match)
//     ]);

//     return res.json({ ok: true, items, total, page, limit });
//   } catch (err) {
//     console.error('GET /courses', err);
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * GET /api/courses/categories
//  */
// router.get('/categories', auth, async (req, res) => {
//   try {
//     const cats = await Course.aggregate([
//       { $match: { deleted: { $ne: true } } },
//       { $group: { _id: '$category', count: { $sum: 1 } } },
//       { $sort: { count: -1 } }
//     ]);
//     const categories = cats.map(c => c._id).filter(Boolean);
//     return res.json({ ok: true, categories });
//   } catch (err) {
//     console.error('GET /courses/categories', err);
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });


// /* POST /api/courses/:id/increase  (admin) */
// router.post('/:id/increase', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const add = Number(req.body.add || req.query.add || 0);
//     if (!add || add <= 0) return res.status(400).json({ ok:false, message:'add number required and > 0' });

//     const course = await Course.findById(id);
//     if (!course) return res.status(404).json({ ok:false, message:'Course not found' });
//     course.marketingProvenCount = Number(course.marketingProvenCount || 0) + add;
//     await course.save();
//     return res.json({ ok:true, updated: true, course });
//   } catch (err) {
//     console.error('POST /courses/:id/increase', err);
//     return res.status(500).json({ ok:false, message:'Server error' });
//   }
// });
// /**
//  * GET /api/courses/:id
//  */
// router.get('/:id', auth, async (req, res) => {
//   try {
//     const id = req.params.id;
//     // allow lookup by _id or courseId string
//     const course = await Course.findOne({ $or: [{ _id: id }, { courseId: id }] }).lean().exec();
//     if (!course || course.deleted) return res.status(404).json({ ok: false, message: 'Course not found' });
//     return res.json({ ok: true, course });
//   } catch (err) {
//     console.error('GET /courses/:id', err);
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * POST /api/courses  (admin only)
//  */
// router.post('/', auth, roles(['admin']), async (req, res) => {
//   try {
//     const body = req.body || {};
//     if (!body.title) return res.status(400).json({ ok: false, message: 'Title required' });

//     // ensure uniqueness for supplied courseId
//     if (body.courseId) {
//       const found = await Course.findOne({ courseId: body.courseId }).lean();
//       if (found) return res.status(400).json({ ok: false, message: 'courseId must be unique' });
//     }

//     // generate if not provided
//     let courseId = body.courseId && String(body.courseId).trim();
//     if (!courseId) {
//       const count = await Course.countDocuments({});
//       courseId = 'CRS' + String(count + 1).padStart(5, '0');
//     }

//     const c = new Course({
//       courseId,
//       title: body.title,
//       category: body.category || 'Other',
//       teacher: body.teacher || {},
//       isFree: !!body.isFree,
//       price: Number(body.price || 0),
//       discountPercent: Number(body.discountPercent || 0),
//       duration: body.duration || '',
//       shortDescription: body.shortDescription || '',
//       longDescription: body.longDescription || '',
//       thumbnailUrl: body.thumbnailUrl || '',
//       media: Array.isArray(body.media) ? body.media : [],
//       marketingProvenCount: Number(body.marketingProvenCount || 0),
//       visibility: body.visibility || 'public',
//       createdBy: toObjectIdIfPossible(req.user._id),
//       updatedBy: toObjectIdIfPossible(req.user._id),
//       lastPublishedPrice: Number(body.price || 0)
//     });
//     await c.save();
//     return res.json({ ok: true, course: c });
//   } catch (err) {
//     console.error('POST /courses', err);
//     if (err && err.code === 11000) return res.status(400).json({ ok: false, message: 'Duplicate courseId' });
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * PUT /api/courses/:id  (admin)
//  */
// router.put('/:id', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const body = req.body || {};
//     const c = await Course.findById(id);
//     if (!c) return res.status(404).json({ ok: false, message: 'Course not found' });

//     if (body.courseId && String(body.courseId) !== String(c.courseId)) {
//       const exists = await Course.findOne({ courseId: String(body.courseId) });
//       if (exists) return res.status(400).json({ ok: false, message: 'courseId must be unique' });
//       c.courseId = String(body.courseId);
//     }

//     const upable = ['title','category','teacher','isFree','price','discountPercent','duration','shortDescription','longDescription','thumbnailUrl','media','visibility','marketingProvenCount'];
//     upable.forEach(k => {
//       if (typeof body[k] !== 'undefined') c[k] = body[k];
//     });

//     c.updatedBy = toObjectIdIfPossible(req.user._id);
//     c.updatedAt = new Date();
//     if (typeof body.price !== 'undefined') c.lastPublishedPrice = Number(body.price || 0);

//     await c.save();
//     return res.json({ ok: true, notice: 'Saved', course: c });
//   } catch (err) {
//     console.error('PUT /courses/:id', err);
//     if (err && err.code === 11000) return res.status(400).json({ ok: false, message: 'Duplicate courseId' });
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * DELETE /api/courses/:id  (soft-delete admin)
//  */
// router.delete('/:id', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const c = await Course.findById(id);
//     if (!c) return res.status(404).json({ ok: false, message: 'Course not found' });
//     if (c.deleted) return res.status(400).json({ ok: false, message: 'Already deleted' });

//     c.deleted = true;
//     c.deletedAt = new Date();
//     c.deletedBy = toObjectIdIfPossible(req.user._id);
//     c.visible = false;
//     await c.save();
//     return res.json({ ok: true, deleted: true });
//   } catch (err) {
//     console.error('DELETE /courses/:id', err);
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * POST /api/courses/:id/restore  (admin)
//  */
// router.post('/:id/restore', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const c = await Course.findById(id);
//     if (!c) return res.status(404).json({ ok: false, message: 'Course not found' });
//     if (!c.deleted) return res.status(400).json({ ok: false, message: 'Course not deleted' });

//     c.deleted = false;
//     c.deletedAt = null;
//     c.deletedBy = null;
//     c.visible = true;
//     await c.save();
//     return res.json({ ok: true, restored: true });
//   } catch (err) {
//     console.error('POST /courses/:id/restore', err);
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * DELETE /api/courses/:id/permanent  (admin)
//  */
// router.delete('/:id/permanent', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const c = await Course.findById(id);
//     if (!c) return res.status(404).json({ ok: false, message: 'Course not found' });

//     // check verified purchase attempts
//     const purchaseCount = await PurchaseAttempt.countDocuments({ courseId: c._id, status: 'verified' }).catch(() => 0);
//     if (purchaseCount > 0 && !(req.query.force === '1' || req.query.force === 'true')) {
//       return res.status(400).json({ ok: false, message: 'Course has verified purchases. Pass ?force=1 to permanently delete and remove associated records.' });
//     }

//     // delete course and optionally cascade
//     await Course.deleteOne({ _id: c._id });
//     if (req.query.force === '1' || req.query.force === 'true') {
//       await PurchaseAttempt.deleteMany({ courseId: c._id }).catch(() => {});
//     }

//     // delete lessons belonging to course
//     await Lesson.deleteMany({ courseId: c._id }).catch(() => {});

//     return res.json({ ok: true, deletedPermanently: true });
//   } catch (err) {
//     console.error('DELETE /courses/:id/permanent', err);
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// /**
//  * GET /api/courses/:id/media/:idx
//  * Only return media object; server-side consumer must stream/protect actual files/URLs
//  */
// router.get('/:id/media/:idx', auth, async (req, res) => {
//   try {
//     const courseId = req.params.id;
//     const idx = Number(req.params.idx || 0);

//     const course = await Course.findOne({ $or: [{ _id: courseId }, { courseId: courseId }] }).lean();
//     if (!course) return res.status(404).json({ ok: false, message: 'Course not found' });
//     if (!course.media || !Array.isArray(course.media) || !course.media[idx]) {
//       return res.status(404).json({ ok: false, message: 'Media not found' });
//     }

//     // admin always allowed
//     const role = (req.user && (req.user.role || '')).toLowerCase();
//     if (role === 'admin') {
//       const media = course.media[idx];
//       return res.json({ ok: true, media });
//     }

//     // free course -> allow
//     if (course.isFree) {
//       return res.json({ ok: true, media: course.media[idx] });
//     }

//     // otherwise check verified purchase
//     const has = await PurchaseAttempt.findOne({
//       userId: toObjectIdIfPossible(req.user._id),
//       courseId: toObjectIdIfPossible(course._id),
//       status: 'verified'
//     }).lean();

//     if (!has) return res.status(403).json({ ok: false, message: 'Not allowed' });

//     return res.json({ ok: true, media: course.media[idx] });
//   } catch (err) {
//     console.error('GET /courses/:id/media/:idx', err);
//     return res.status(500).json({ ok: false, message: 'Server error' });
//   }
// });

// module.exports = router;


  
// backend/routes/courses.js
'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const Course = require('../models/Course');
const Lesson = require('../models/Lesson'); // your existing Lesson model (guarded export)
const PurchaseAttempt = require('../models/PurchaseAttempt'); // optional

// guarded models for Rating and Comment (in case separate models not present)
let RatingModel;
try { RatingModel = require('../models/Rating'); } catch (e) {
  const RatingSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    stars: { type: Number, min:1, max:5 },
    createdAt: { type: Date, default: Date.now }
  });
  RatingModel = mongoose.models.Rating || mongoose.model('Rating', RatingSchema);
}

let CommentModel;
try { CommentModel = require('../models/Comment'); } catch (e) {
  const CommentSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    body: String,
    deleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  });
  CommentModel = mongoose.models.Comment || mongoose.model('Comment', CommentSchema);
}

let UserModel = null;
try { UserModel = require('../models/User'); } catch (e) { /* optional */ }

function toObjectIdIfPossible(id) {
  try { if (mongoose.Types.ObjectId.isValid(String(id||''))) return mongoose.Types.ObjectId(String(id)); } catch(e){}
  return id;
}

async function findCourseByIdOrCourseId(idOrCode) {
  if (!idOrCode) return null;
  // if looks like ObjectId try findById first
  if (mongoose.Types.ObjectId.isValid(idOrCode)) {
    const byId = await Course.findById(idOrCode).lean().exec().catch(()=>null);
    if (byId) return byId;
  }
  // fallback to courseId field (like 'CRS00001')
  const byCode = await Course.findOne({ courseId: idOrCode }).lean().exec().catch(()=>null);
  return byCode;
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


/* POST /api/courses/:id/increase  (admin) */
router.post('/:id/increase', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const add = Number(req.body.add || req.query.add || 0);
    if (!add || add <= 0) return res.status(400).json({ ok:false, message:'add number required and > 0' });

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ ok:false, message:'Course not found' });
    course.marketingProvenCount = Number(course.marketingProvenCount || 0) + add;
    await course.save();
    return res.json({ ok:true, updated: true, course });
  } catch (err) {
    console.error('POST /courses/:id/increase', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});
/**
 * GET /api/courses/:id
 * optional query: ?include=lessons
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    // allow lookup by _id or courseId string
    const course = await Course.findOne({ $or: [{ _id: id }, { courseId: id }] }).lean().exec();
    if (!course || course.deleted) return res.status(404).json({ ok: false, message: 'Course not found' });

    // optionally include lessons
    const include = String(req.query.include || '').toLowerCase();
    if (include === 'lessons') {
      try {
        const lessons = await Lesson.find({ courseId: course._id, deleted: { $ne: true } }).sort({ createdAt: 1 }).lean();
        // attach as separate field (so frontend checks r.lessons) and also include inside course.lessons (fallback)
        course.lessons = lessons;
        console.debug && console.debug(`[courses] GET ${id} include=lessons -> ${lessons.length} lessons`);
        return res.json({ ok: true, course, lessons });
      } catch (e) {
        console.warn('GET /courses/:id include=lessons failed', e);
        // fallthrough to return course without lessons
      }
    }

    // Optionally: attach rating aggregation for convenience (if RatingModel exists)
    try {
      if (RatingModel) {
        const agg = await RatingModel.aggregate([
          { $match: { courseId: mongoose.Types.ObjectId(String(course._id)) } },
          { $group: { _id: '$courseId', avg: { $avg: '$stars' }, count: { $sum: 1 } } }
        ]).limit(1);
        if (agg && agg[0]) {
          course.ratingAvg = Number(agg[0].avg) || null;
          course.ratingCount = Number(agg[0].count) || 0;
        }
      }
    } catch (e) {
      // ignore aggregation errors
      console.warn('rating aggregation failed', e && e.message);
    }

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
/* --------------------
   Lessons endpoints under a course
   -------------------- */

/**
 * GET /api/courses/:id/lessons
 * returns lessons for this course (not deleted)
 */

/**
 * GET /api/courses/:id/lessons
 * Returns lessons for course (from Lesson collection). Public by default.
 */
router.get('/:id/lessons', async (req, res) => {
  try {
    const id = req.params.id;
    const course = await findCourseByIdOrCourseId(id);
    if (!course) return res.status(404).json({ ok:false, error: 'Course not found' });

    // allow optional query params: preview=true to include preview, includeDeleted=true
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const includePreview = req.query.preview === '1' || req.query.preview === 'true';

    const q = { deleted: { $ne: true } };
    if (!includeDeleted) q.deleted = { $ne: true };
    q.$or = [{ courseId: mongoose.Types.ObjectId(course._id) }, { courseRefId: course.courseId || '' }];

    // If requestor not authenticated, filter out non-preview lessons
    if (!req.user && !includePreview) {
      q.preview = true; // only show preview lessons for public access
    }

    const lessons = await Lesson.find(q).sort({ order: 1, createdAt: 1 }).lean().exec();
    return res.json({ ok:true, lessons });
  } catch (err) {
    console.error('GET /courses/:id/lessons error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

/**
 * GET /api/courses/:id/lessons/:lid
 */
router.get('/:id/lessons/:lid', async (req, res) => {
  try {
    const id = req.params.id;
    const lid = req.params.lid;
    const course = await findCourseByIdOrCourseId(id);
    if (!course) return res.status(404).json({ ok:false, error: 'Course not found' });

    // find lesson either by its _id or by fallback fields and ensure it belongs to course
    let lesson = null;
    if (mongoose.Types.ObjectId.isValid(lid)) {
      lesson = await Lesson.findOne({ _id: lid, deleted: { $ne: true }, $or: [{ courseId: course._id }, { courseRefId: course.courseId }] }).lean().exec().catch(()=>null);
    }
    if (!lesson) {
      // try by id-like property or string id
      lesson = await Lesson.findOne({ $or: [{ _id: lid }, { id: lid }], deleted: { $ne: true }, $or: [{ courseId: course._id }, { courseRefId: course.courseId }] }).lean().exec().catch(()=>null);
    }
    if (!lesson) return res.status(404).json({ ok:false, error: 'Lesson not found' });

    return res.json({ ok:true, lesson });
  } catch (err) {
    console.error('GET /courses/:id/lessons/:lid error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

/**
 * POST /api/courses/:id/lessons  (admin/manager)
 * Body: { title, notes, duration, mediaUrl, preview, order }
 */
router.post('/:id/lessons', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    if (!body.title || !String(body.title).trim()) return res.status(400).json({ ok:false, error: 'Title required' });

    const course = await findCourseByIdOrCourseId(id);
    if (!course) return res.status(404).json({ ok:false, error: 'Course not found' });

    const lesson = new Lesson({
      courseId: course._id,
      courseRefId: course.courseId || '',
      title: String(body.title).trim(),
      notes: body.notes || '',
      duration: body.duration || '',
      preview: !!body.preview,
      order: Number(body.order || 0),
      mediaUrl: body.mediaUrl || (Array.isArray(body.media) && body.media[0] && body.media[0].url) || '',
      media: Array.isArray(body.media) ? body.media : (body.mediaUrl ? [{ url: body.mediaUrl, type: body.mediaType || 'video' }] : []),
      createdBy: req.user && req.user._id
    });

    await lesson.save();

    // emit socket event so client can refresh
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.emit('course:lesson_created', { courseId: String(course._id), lesson: lesson });
    } catch (e) { console.warn('emit lesson_created failed', e); }

    return res.json({ ok:true, lesson });
  } catch (err) {
    console.error('POST /courses/:id/lessons error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

/**
 * PUT /api/courses/:id/lessons/:lid  (admin)
 */
router.put('/:id/lessons/:lid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const course = await findCourseByIdOrCourseId(req.params.id);
    if (!course) return res.status(404).json({ ok:false, error: 'Course not found' });

    const lid = req.params.lid;
    // allow object id or string id
    const q = { deleted: { $ne: true }, $or: [{ courseId: course._id }, { courseRefId: course.courseId }] };
    if (mongoose.Types.ObjectId.isValid(lid)) q._id = mongoose.Types.ObjectId(lid);
    else q._id = lid;

    const body = req.body || {};
    const upd = {};
    if (typeof body.title !== 'undefined') upd.title = String(body.title || '').trim();
    if (typeof body.notes !== 'undefined') upd.notes = body.notes || '';
    if (typeof body.duration !== 'undefined') upd.duration = body.duration || '';
    if (typeof body.preview !== 'undefined') upd.preview = !!body.preview;
    if (typeof body.order !== 'undefined') upd.order = Number(body.order || 0);
    if (typeof body.mediaUrl !== 'undefined') {
      upd.mediaUrl = body.mediaUrl || '';
      upd.media = Array.isArray(body.media) ? body.media : (body.mediaUrl ? [{ url: body.mediaUrl, type: body.mediaType || 'video' }] : []);
    }

    const lesson = await Lesson.findOneAndUpdate(q, upd, { new: true }).lean().exec();
    if (!lesson) return res.status(404).json({ ok:false, error: 'Lesson not found' });

    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.emit('course:lesson_updated', { courseId: String(course._id), lesson });
    } catch (e) {}

    return res.json({ ok:true, lesson });
  } catch (err) {
    console.error('PUT /courses/:id/lessons/:lid error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

/**
 * DELETE /api/courses/:id/lessons/:lid  (soft-delete) (admin)
 */
router.delete('/:id/lessons/:lid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const course = await findCourseByIdOrCourseId(req.params.id);
    if (!course) return res.status(404).json({ ok:false, error: 'Course not found' });

    const lid = req.params.lid;
    const q = { $or: [{ courseId: course._id }, { courseRefId: course.courseId }] };
    if (mongoose.Types.ObjectId.isValid(lid)) q._id = mongoose.Types.ObjectId(lid);
    else q._id = lid;

    const lesson = await Lesson.findOneAndUpdate(q, { deleted: true }, { new: true }).lean().exec();
    if (!lesson) return res.status(404).json({ ok:false, error: 'Lesson not found' });

    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.emit('course:lesson_deleted', { courseId: String(course._id), lessonId: lesson._id });
    } catch (e) {}

    return res.json({ ok:true, message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /courses/:id/lessons/:lid error', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});
/**
 * POST /api/lessons/:id/media  (admin)
 * body: { url, type, title }  -> push to lesson.media
 */
router.post('/:id/media', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    if (!body.url) return res.status(400).json({ ok:false, message:'url required' });
    const ls = await Lesson.findById(id);
    if (!ls) return res.status(404).json({ ok:false, message:'Lesson not found' });
    const item = { url: body.url, type: body.type || 'video', title: body.title || '' };
    ls.media = ls.media || [];
    ls.media.push(item);
    // keep mediaUrl in sync
    if (!ls.mediaUrl) ls.mediaUrl = item.url;
    await ls.save();
    return res.json({ ok:true, mediaItem: item, lesson: ls });
  } catch (err) {
    console.error('POST /lessons/:id/media', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

/* --------------------
   Ratings (per-course)
   -------------------- */

/**
 * POST /api/courses/:id/ratings  - create/update rating by current user for course
 * body: { stars: 1-5 }
 */
router.post('/:id/ratings', auth, async (req, res) => {
  try {
    const cid = req.params.id;
    const course = await Course.findOne({ $or: [{ _id: cid }, { courseId: cid }] });
    if (!course) return res.status(404).json({ ok:false, message:'Course not found' });

    const stars = Number(req.body.stars || req.body.stars === 0 ? req.body.stars : req.body.stars);
    if (!stars || stars < 1 || stars > 5) return res.status(400).json({ ok:false, message:'stars 1..5 required' });

    const query = { courseId: toObjectIdIfPossible(course._id), userId: toObjectIdIfPossible(req.user._id) };
    let existing = await RatingModel.findOne(query);
    if (existing) {
      existing.stars = stars;
      await existing.save();
    } else {
      existing = new RatingModel({ courseId: course._id, userId: toObjectIdIfPossible(req.user._id), stars });
      await existing.save();
    }

    // recompute aggregate
    const agg = await RatingModel.aggregate([
      { $match: { courseId: toObjectIdIfPossible(course._id) } },
      { $group: { _id: '$courseId', avg: { $avg: '$stars' }, count: { $sum: 1 } } }
    ]);
    if (agg && agg[0]) {
      course.ratingAvg = Math.round(agg[0].avg * 10) / 10;
      course.ratingCount = agg[0].count;
      await course.save();
    }

    return res.json({ ok:true, rating: existing, course: { _id: course._id, ratingAvg: course.ratingAvg, ratingCount: course.ratingCount } });
  } catch (err) {
    console.error('POST /courses/:id/ratings', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

/**
 * GET /api/courses/:id/ratings  - list ratings for course (admin or limited)
 */
router.get('/:id/ratings', auth, async (req, res) => {
  try {
    const cid = req.params.id;
    const course = await Course.findOne({ $or: [{ _id: cid }, { courseId: cid }] }).lean();
    if (!course) return res.status(404).json({ ok:false, message:'Course not found' });

    const items = await RatingModel.find({ courseId: course._id }).sort({ createdAt: -1 }).lean();
    return res.json({ ok:true, items });
  } catch (err) {
    console.error('GET /courses/:id/ratings', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

/* --------------------
   Comments (per-course)
   -------------------- */

/**
 * GET /api/courses/:id/comments
 * returns comments for this course (not deleted). Populates user fullname if possible.
 */
router.get('/:id/comments', auth, async (req, res) => {
  try {
    const cid = req.params.id;
    const course = await Course.findOne({ $or: [{ _id: cid }, { courseId: cid }] }).lean();
    if (!course) return res.status(404).json({ ok:false, message:'Course not found' });

    const comments = await CommentModel.find({ courseId: course._id, deleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
    // try to populate user names
    if (comments.length && UserModel) {
      const uids = Array.from(new Set(comments.map(c => String(c.userId)).filter(Boolean)));
      const users = await UserModel.find({ _id: { $in: uids } }).lean();
      const byId = {};
      users.forEach(u => byId[String(u._id)] = u);
      for (const cm of comments) {
        cm.user = byId[String(cm.userId)] ? { _id: byId[String(cm.userId)]._id, fullname: byId[String(cm.userId)].fullname || byId[String(cm.userId)].name || '', username: byId[String(cm.userId)].username || '' } : null;
      }
    } else {
      // embed minimal user fullname from comment (if stored) or leave null
      comments.forEach(cm => { if (!cm.user) cm.user = null; });
    }

    return res.json({ ok:true, items: comments });
  } catch (err) {
    console.error('GET /courses/:id/comments', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

/**
 * POST /api/courses/:id/comments
 * body: { body: 'comment text' }
 */
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const cid = req.params.id;
    const body = req.body || {};
    if (!body.body || !String(body.body).trim()) return res.status(400).json({ ok:false, message:'body required' });

    const course = await Course.findOne({ $or: [{ _id: cid }, { courseId: cid }] });
    if (!course) return res.status(404).json({ ok:false, message:'Course not found' });

    const cm = new CommentModel({
      courseId: course._id,
      userId: toObjectIdIfPossible(req.user._id),
      body: String(body.body).trim()
    });
    await cm.save();

    // attach user fullname if available
    const userObj = (UserModel ? (await UserModel.findById(req.user._id).lean().catch(()=>null)) : null);
    const out = cm.toObject ? cm.toObject() : cm;
    out.user = userObj ? { _id: userObj._id, fullname: userObj.fullname || userObj.name || '', username: userObj.username || '' } : { _id: req.user._id };

    return res.json({ ok:true, comment: out });
  } catch (err) {
    console.error('POST /courses/:id/comments', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

/**
 * DELETE /api/courses/:id/comments/:cid
 * allow owner or admin to soft-delete comment
 */
router.delete('/:id/comments/:cid', auth, async (req, res) => {
  try {
    const cid = req.params.id;
    const commentId = req.params.cid;
    const comment = await CommentModel.findById(commentId);
    if (!comment) return res.status(404).json({ ok:false, message:'Comment not found' });

    // owner or admin
    if (String(comment.userId) !== String(req.user._id) && String((req.user.role||'').toLowerCase()) !== 'admin') {
      return res.status(403).json({ ok:false, message:'Not allowed' });
    }

    comment.deleted = true;
    await comment.save();
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /courses/:id/comments/:cid', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
