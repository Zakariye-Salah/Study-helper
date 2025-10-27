// backend/models/Rating.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const RatingSchema = new Schema({
  courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  stars: { type: Number, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now }
});

// Guard against OverwriteModelError for nodemon/hot reload
module.exports = mongoose.models.Rating || mongoose.model('Rating', RatingSchema);
