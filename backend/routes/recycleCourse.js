// backend/routes/recycleCourse.js
'use strict';
const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/recycle/courses  -> list soft-deleted courses
router.get('/courses', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const items = await Course.find({ deleted: true }).sort({ deletedAt: -1 }).lean().exec();
    return res.json({ ok:true, items });
  } catch (e) {
    console.error('GET /recycle/courses', e);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// POST /api/recycle/courses/:id/restore
router.post('/courses/:id/restore', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok:false, error:'Not found' });
    course.deleted = false; course.deletedAt = null; course.deletedBy = null;
    await course.save();
    return res.json({ ok:true, message:'Restored' });
  } catch (e) {
    console.error('POST /recycle/courses/:id/restore', e);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// DELETE /api/recycle/courses/:id/purge  -> permanent delete
router.delete('/courses/:id/purge', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    let course = null;
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) course = await Course.findById(id);
    if (!course) course = await Course.findOne({ courseId: id });
    if (!course) return res.status(404).json({ ok:false, error:'Not found' });
    await Course.deleteOne({ _id: course._id }).exec();
    return res.json({ ok:true, message:'Permanently deleted' });
  } catch (e) {
    console.error('DELETE /recycle/courses/:id/purge', e);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

module.exports = router;
