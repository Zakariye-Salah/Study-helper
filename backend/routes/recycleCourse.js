// backend/routes/recycleCourse.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const Course = require('../models/Course');
const Purchase = require('../models/Purchase');
const Lesson = require('../models/Lesson');

function toObjectIdIfPossible(id) { try { const mongoose = require('mongoose'); if (mongoose.Types.ObjectId.isValid(String(id||''))) return mongoose.Types.ObjectId(String(id)); } catch(e){} return id; }

// GET /recycle/courses
router.get('/courses', auth, roles(['admin']), async (req, res) => {
  try {
    const items = await Course.find({ deleted: true }).sort({ deletedAt: -1 }).lean();
    return res.json({ ok:true, items });
  } catch (err) {
    console.error('GET /recycle/courses', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

// POST /courses/:id/restore (admin)
router.post('/courses/:id/restore', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const c = await Course.findById(id);
    if (!c) return res.status(404).json({ ok:false, message:'Not found' });
    c.deleted = false; c.deletedAt = null; c.deletedBy = null; c.visible = true;
    await c.save();
    return res.json({ ok:true, course: c });
  } catch (err) {
    console.error('POST /courses/:id/restore', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

// DELETE /courses/:id/permanent (admin)
router.delete('/courses/:id/permanent', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const verified = await Purchase.findOne({ courseId: toObjectIdIfPossible(id), status: 'verified' });
    if (verified) {
      return res.status(400).json({ ok:false, message: 'Cannot permanently delete - verified enrollments exist' });
    }
    await Lesson.deleteMany({ courseId: toObjectIdIfPossible(id) }).catch(()=>{});
    await Course.deleteOne({ _id: toObjectIdIfPossible(id) });
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /courses/:id/permanent', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
