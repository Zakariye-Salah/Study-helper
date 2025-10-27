// backend/routes/ratings.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const mongoose = require('mongoose');
const Rating = require('../models/Rating'); // we'll create inline below if missing
const Course = require('../models/Course');

function toObjectIdIfPossible(id) { try { if (mongoose.Types.ObjectId.isValid(String(id||''))) return mongoose.Types.ObjectId(String(id)); } catch(e){} return id; }

// simple Rating model inline fallback - if you have separate file, replace this
// To keep things self-contained, if Rating model doesn't exist, create one in-memory:
let RatingModel;
try { RatingModel = require('../models/Rating'); } catch(e) {
  const mongoose = require('mongoose');
  const RatingSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    stars: { type: Number, min:1, max:5 },
    createdAt: { type: Date, default: Date.now }
  });
  RatingModel = mongoose.model('Rating', RatingSchema);
}

router.post('/', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const courseId = body.courseId;
    const stars = Number(body.stars || 0);
    if (!courseId || !stars) return res.status(400).json({ ok:false, message:'courseId and stars required' });

    const existing = await RatingModel.findOne({ courseId: toObjectIdIfPossible(courseId), userId: toObjectIdIfPossible(req.user._id) });
    if (existing) {
      existing.stars = stars;
      await existing.save();
    } else {
      const r = new RatingModel({ courseId: toObjectIdIfPossible(courseId), userId: toObjectIdIfPossible(req.user._id), stars });
      await r.save();
    }

    // update aggregated rating on course (simple)
    const agg = await RatingModel.aggregate([
      { $match: { courseId: toObjectIdIfPossible(courseId) } },
      { $group: { _id: '$courseId', avg: { $avg: '$stars' }, count: { $sum: 1 } } }
    ]);
    if (agg && agg[0]) {
      await Course.findByIdAndUpdate(courseId, { $set: { ratingAvg: Math.round(agg[0].avg*10)/10, ratingCount: agg[0].count } }).catch(()=>{});
    }
    return res.json({ ok:true });
  } catch (err) {
    console.error('POST /ratings', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
