// backend/routes/courses.js
'use strict';
const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const Purchase = require('../models/Purchase');
const HelpMsg = require('../models/HelpMessageCourse');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Auth middleware — assumes JWT Bearer in Authorization header
async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i,'').trim();
    if (!token) return res.status(401).json({ ok:false, error:'Authentication required' });
    const secret = process.env.JWT_SECRET || 'secret';
    const payload = jwt.verify(token, secret);
    if (!payload || !payload.sub) return res.status(401).json({ ok:false, error:'Invalid token' });
    const u = await User.findById(payload.sub).lean().catch(()=>null);
    if (!u) return res.status(401).json({ ok:false, error:'User not found' });
    req.user = u;
    next();
  } catch (err) {
    console.warn('requireAuth failed', err && err.message);
    return res.status(401).json({ ok:false, error:'Auth failed' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const myRole = (req.user && req.user.role || '').toLowerCase();
    if (myRole !== role) return res.status(403).json({ ok:false, error:'Forbidden' });
    next();
  };
}

/**
 * GET /api/courses
 * supports: q, category, price (free/fee), duration, sort, page, limit
 */
router.get('/', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const category = req.query.category ? String(req.query.category) : '';
    const price = req.query.price ? String(req.query.price) : '';
    const duration = req.query.duration ? String(req.query.duration) : '';
    const sort = req.query.sort || 'newest';
    const page = Math.max(1, parseInt(req.query.page || '1',10));
    const limit = Math.min(100, parseInt(req.query.limit || '12',10));

    const filter = { deleted: { $ne: true } };

    if (q) {
      // search by title or courseId (partial)
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i');
      filter.$or = [{ title: re }, { courseId: re }];
    }
    if (category) filter.categories = category;
    if (price === 'free') filter.isFree = true;
    else if (price === 'fee') filter.isFree = false;
    if (duration) filter.duration = duration;

    let sortObj = { createdAt: -1 };
    if (sort === 'price_low') sortObj = { price: 1 };
    if (sort === 'price_high') sortObj = { price: -1 };

    const total = await Course.countDocuments(filter).catch(()=>0);
    const courses = await Course.find(filter).sort(sortObj).skip((page-1)*limit).limit(limit).lean().exec();
    return res.json({ ok:true, total, courses });
  } catch (err) {
    console.error('GET /courses error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

/**
 * GET /api/courses/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (mongoose.Types.ObjectId.isValid(id)) course = await Course.findById(id).lean();
    if (!course) course = await Course.findOne({ courseId: id }).lean();
    if (!course) return res.status(404).json({ ok:false, error:'Course not found' });
    return res.json({ ok:true, course });
  } catch (err) {
    console.error('GET /courses/:id error', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

/**
 * GET /api/courses/categories
 */
router.get('/categories', async (req, res) => {
  try {
    // aggregate distinct categories from non-deleted courses
    const cats = await Course.aggregate([
      { $match: { deleted: { $ne: true } } },
      { $unwind: { path: '$categories', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$categories' } },
      { $sort: { _id: 1 } }
    ]);
    const categories = cats.map(c => c._id).filter(Boolean);
    return res.json({ ok:true, categories });
  } catch (err) {
    console.error('GET /courses/categories error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * POST /api/courses (admin)
 */
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.title) return res.status(400).json({ ok:false, error:'Title required' });

    // generate unique courseId if missing: CRS + padded number
    let newCourseId = body.courseId && String(body.courseId).trim();
    if (!newCourseId) {
      const count = await Course.countDocuments({}).catch(()=>0);
      newCourseId = 'CRS' + String(count + 1).padStart(5, '0');
    }
    const doc = new Course({
      courseId: newCourseId,
      title: body.title,
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

/**
 * PUT /api/courses/:id (admin)
 */
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
    course.updatedAt = new Date();

    await course.save();
    return res.json({ ok:true, course });
  } catch (err) {
    console.error('PUT /courses/:id error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * DELETE /api/courses/:id  (soft-delete - admin)
 */
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

/**
 * POST /api/courses/:id/restore (admin)
 */
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
 * Counts endpoint (for badges)
 * GET /api/courses/counts
 * - checking: number of purchases with status checking
 * - help: number of unread help messages (different semantics for admin vs regular user)
 */
router.get('/counts', requireAuth, async (req, res) => {
  try {
    const checking = await Purchase.countDocuments({ status: 'checking' }).catch(()=>0);
    let help = 0;
    if ((req.user.role || '').toLowerCase() === 'admin') {
      // admin sees unread messages to admin
      help = await HelpMsg.countDocuments({ toAdmin: true, read: false }).catch(()=>0);
    } else {
      // user sees unread messages addressed to them (from admin)
      help = await HelpMsg.countDocuments({ toUserId: req.user._id, read: false }).catch(()=>0);
    }
    return res.json({ ok:true, counts: { checking: checking || 0, help: help || 0 } });
  } catch (err) {
    console.error('GET /courses/counts error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

module.exports = router;
