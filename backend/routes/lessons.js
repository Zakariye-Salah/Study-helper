// backend/routes/lessons.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const Lesson = require('../models/Lesson');
const Course = require('../models/Course');

function toObjectIdIfPossible(id) {
  try {
    if (!id) return id;
    const s = String(id || '');
    if (mongoose.Types.ObjectId.isValid(s)) return mongoose.Types.ObjectId(s);
  } catch (e) {}
  return id;
}

// GET /lessons?courseId=...
router.get('/', auth, async (req, res) => {
  try {
    const courseId = req.query.courseId;
    const match = { deleted: { $ne: true } };
    if (courseId) match.courseId = toObjectIdIfPossible(courseId);
    const items = await Lesson.find(match).sort({ createdAt: 1 }).lean();
    return res.json({ ok: true, items });
  } catch (err) {
    console.error('GET /lessons', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// GET /lessons/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const it = await Lesson.findById(req.params.id).lean();
    if (!it) return res.status(404).json({ ok: false, message: 'Not found' });
    return res.json({ ok: true, lesson: it });
  } catch (err) {
    console.error('GET /lessons/:id', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /lessons (admin)
router.post('/', auth, roles(['admin']), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.courseId || !body.title) return res.status(400).json({ ok: false, message: 'courseId and title required' });

    // ensure course exists
    const course = await Course.findById(body.courseId);
    if (!course) return res.status(400).json({ ok: false, message: 'Course not found' });

    const ls = new Lesson({
      courseId: toObjectIdIfPossible(body.courseId),
      title: body.title,
      duration: body.duration || '',
      preview: !!body.preview,
      mediaUrl: body.mediaUrl || '',
      media: Array.isArray(body.media) ? body.media : (body.mediaUrl ? [{ type: 'video', url: body.mediaUrl, title: body.title }] : []),
      exercises: Array.isArray(body.exercises) ? body.exercises : [],
      notes: body.notes || '',
      createdBy: toObjectIdIfPossible(req.user._id)
    });

    await ls.save();
    return res.json({ ok: true, lesson: ls });
  } catch (err) {
    console.error('POST /lessons', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
