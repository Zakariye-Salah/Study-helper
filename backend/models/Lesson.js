// backend/models/Lesson.js
'use strict';
const mongoose = require('mongoose');

const LessonSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, default: '' }, // HTML or markdown
  resources: [{ type: String }], // urls to video (YouTube), pdf, etc.
  order: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.Lesson || mongoose.model('Lesson', LessonSchema);
