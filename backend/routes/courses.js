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
const Lesson = require('../models/Lesson');
const Purchase = require('../models/Purchase');

function isObjectIdString(s) { return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s); }
function toObjectIdIfPossible(id) { try { const s = String(id || ''); if (isObjectIdString(s)) return new mongoose.Types.ObjectId(s); } catch(e){} return id; }

// GET /courses? q, category, filter, sort, page, limit
router.get('/', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();
    const filter = (req.query.filter || 'all').toLowerCase();
    const sort = (req.query.sort || 'newest');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Number(req.query.limit || 20));

    const match = { deleted: { $ne: true }, visible: { $ne: false } };

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i');
      match.$or = [{ title: re }, { 'teacher.name': re }, { courseId: re }, { shortDescription: re }, { longDescription: re }];
    }
    if (category && category !== 'all') match.category = category;
    if (filter === 'free') match.isFree = true;
    if (filter === 'fee') match.isFree = false;

    let sortObj = { createdAt: -1 };
    if (sort === 'price_asc') sortObj = { price: 1, createdAt: -1 };
    if (sort === 'price_desc') sortObj = { price: -1, createdAt: -1 };
    if (sort === 'newest') sortObj = { createdAt: -1 };

    const [items, total] = await Promise.all([
      Course.find(match).sort(sortObj).skip((page-1)*limit).limit(limit).lean(),
      Course.countDocuments(match)
    ]);
    return res.json({ ok:true, items, total, page, limit });
  } catch (err) {
    console.error('GET /courses', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// GET /courses/categories
router.get('/categories', auth, async (req, res) => {
  try {
    // simple aggregate of existing categories
    const cats = await Course.aggregate([
      { $match: { deleted: { $ne: true } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const categories = cats.map(c => c._id).filter(Boolean);
    return res.json({ ok:true, categories });
  } catch (err) {
    console.error('GET /courses/categories', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// GET /courses/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id).lean();
    if (!c || c.deleted) return res.status(404).json({ ok:false, message:'Not found' });

    // return full course; later server-side will enforce media access in media endpoints
    return res.json({ ok:true, course: c });
  } catch (err) {
    console.error('GET /courses/:id', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// POST /courses (admin create)
router.post('/', auth, roles(['admin']), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.title) return res.status(400).json({ ok:false, message: 'Title required' });
    // unique courseId generation if not supplied
    let courseId = body.courseId && String(body.courseId).trim();
    if (!courseId) {
      const now = Date.now();
      // generate a unique CRSxxxxx - naive but OK
      const count = await Course.countDocuments({});
      courseId = 'CRS' + String((count + 1)).padStart(5, '0');
    } else {
      // ensure uniqueness
      const found = await Course.findOne({ courseId: courseId });
      if (found) return res.status(400).json({ ok:false, message: 'courseId must be unique' });
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
      createdBy: toObjectIdIfPossible(req.user._id)
    });
    await c.save();
    return res.json({ ok:true, course: c });
  } catch (err) {
    console.error('POST /courses', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// PUT /courses/:id (admin edit)
router.put('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok:false, message:'Not found' });

    if (body.courseId && String(body.courseId) !== String(c.courseId)) {
      const exists = await Course.findOne({ courseId: String(body.courseId) });
      if (exists) return res.status(400).json({ ok:false, message:'courseId must be unique' });
      c.courseId = String(body.courseId);
    }
    if (body.title) c.title = body.title;
    if (body.category) c.category = body.category;
    if (body.teacher) c.teacher = body.teacher;
    if (typeof body.isFree !== 'undefined') c.isFree = !!body.isFree;
    if (typeof body.price !== 'undefined') c.price = Number(body.price || 0);
    if (typeof body.discountPercent !== 'undefined') c.discountPercent = Number(body.discountPercent || 0);
    if (typeof body.duration !== 'undefined') c.duration = body.duration;
    if (typeof body.shortDescription !== 'undefined') c.shortDescription = body.shortDescription;
    if (typeof body.longDescription !== 'undefined') c.longDescription = body.longDescription;
    if (typeof body.thumbnailUrl !== 'undefined') c.thumbnailUrl = body.thumbnailUrl;
    if (Array.isArray(body.media)) c.media = body.media;
    if (typeof body.marketingProvenCount !== 'undefined') c.marketingProvenCount = Number(body.marketingProvenCount || 0);
    c.updatedBy = toObjectIdIfPossible(req.user._id);
    await c.save();
    return res.json({ ok:true, notice:'Saved', course: c });
  } catch (err) {
    console.error('PUT /courses/:id', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// DELETE /courses/:id (soft-delete)
router.delete('/:id', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok:false, message:'Not found' });
    c.deleted = true;
    c.deletedAt = new Date();
    c.deletedBy = toObjectIdIfPossible(req.user._id);
    c.visible = false;
    await c.save();
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /courses/:id', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// POST /courses/:id/restore (admin)
router.post('/:id/restore', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok:false, message:'Not found' });
    c.deleted = false;
    c.deletedAt = null;
    c.deletedBy = null;
    c.visible = true;
    await c.save();
    return res.json({ ok:true });
  } catch (err) {
    console.error('POST /courses/:id/restore', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// DELETE /courses/:id/permanent (admin)
router.delete('/:id/permanent', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    // check enrollments/purchases
    const existing = await Purchase.findOne({ courseId: toObjectIdIfPossible(id) });
    if (existing) {
      return res.status(400).json({ ok:false, message: 'Course has verified enrollments. Remove them or confirm with extra step.' });
    }
    await Course.deleteOne({ _id: id });
    // optionally delete lessons
    await Lesson.deleteMany({ courseId: id }).catch(()=>{});
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /courses/:id/permanent', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// GET /courses/:id/media/:idx protected access (only verified purchasers or admin)
router.get('/:id/media/:idx', auth, async (req, res) => {
  try {
    const courseId = req.params.id;
    const idx = Number(req.params.idx || 0);
    const course = await Course.findById(courseId).lean();
    if (!course) return res.status(404).json({ ok:false, message: 'Not found' });

    // admin always allowed
    const role = (req.user && req.user.role || '').toLowerCase();
    if (role === 'admin') {
      const media = course.media && course.media[idx] ? course.media[idx] : null;
      if (!media) return res.status(404).json({ ok:false, message:'Media not found' });
      return res.json({ ok:true, media });
    }

    // check purchase
    const PurchaseModel = require('../models/Purchase');
    const purchase = await PurchaseModel.findOne({ courseId: toObjectIdIfPossible(courseId), userId: toObjectIdIfPossible(req.user._id), status: 'verified' }).lean();
    if (!purchase) {
      // allow preview lessons/media if marked as external preview? Here we block media access for non-owners
      return res.status(403).json({ ok:false, message:'Not allowed' });
    }
    const media = course.media && course.media[idx] ? course.media[idx] : null;
    if (!media) return res.status(404).json({ ok:false, message:'Media not found' });
    return res.json({ ok:true, media });
  } catch (err) {
    console.error('GET /courses/:id/media/:idx', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

module.exports = router;
