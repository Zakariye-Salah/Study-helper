// backend/routes/comments.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

let CommentModel;
try { CommentModel = require('../models/Comment'); } catch(e) {
  const mongoose = require('mongoose');
  const CommentSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    body: String,
    deleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  });
  CommentModel = mongoose.model('Comment', CommentSchema);
}

router.post('/', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.courseId || !b.body) return res.status(400).json({ ok:false, message:'courseId and body required' });
    const c = new CommentModel({ courseId: b.courseId, userId: req.user._id, body: b.body });
    await c.save();
    return res.json({ ok:true, comment: c });
  } catch (err) {
    console.error('POST /comments', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const cm = await CommentModel.findById(id);
    if (!cm) return res.status(404).json({ ok:false, message:'Not found' });
    // allow owner or admin
    if (String(cm.userId) !== String(req.user._id) && String((req.user.role||'').toLowerCase()) !== 'admin') {
      return res.status(403).json({ ok:false, message:'Not allowed' });
    }
    cm.deleted = true;
    await cm.save();
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /comments/:id', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
