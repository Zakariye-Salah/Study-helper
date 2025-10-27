// backend/models/Lesson.js
'use strict';
const mongoose = require('mongoose');

const LessonSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['video','article','file','other'], default: 'video' },
  url: { type: String, default: '' }, // external link (YouTube etc.) or file url
  description: { type: String, default: '' },
  duration: { type: String, default: '' },
  isPublic: { type: Boolean, default: false }, // visible without enrollment
  order: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.Lesson || mongoose.model('Lesson', LessonSchema);
