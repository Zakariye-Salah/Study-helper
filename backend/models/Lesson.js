// backend/models/Lesson.js
'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MediaSchema = new Schema({
  type: { type: String, enum: ['video','audio','image','other'], default: 'video' },
  url: { type: String, default: '' },
  title: { type: String, default: '' }
}, { _id: false });

const LessonSchema = new Schema({
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true, required: false },
  courseRefId: { type: String, default: '' }, // store course.courseId (CRS00001) when created (optional)
  title: { type: String, required: true },
  notes: { type: String, default: '' },
  duration: { type: String, default: '' },
  media: { type: [MediaSchema], default: [] },
  mediaUrl: { type: String, default: '' }, // convenience top-level
  preview: { type: Boolean, default: false }, // preview available to non-enrolled users
  order: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false }
});

// autopopulate updatedAt
LessonSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// text index on title/notes for search support
LessonSchema.index({ title: 'text', notes: 'text' });

module.exports = mongoose.models.Lesson || mongoose.model('Lesson', LessonSchema);
