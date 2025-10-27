// backend/models/Lesson.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const MediaSchema = new Schema({
  type: { type: String, enum: ['video','image','file','external'], required: true },
  url: { type: String, required: true },
  title: { type: String }
}, { _id: false });

const LessonSchema = new Schema({
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true },
  duration: { type: String },
  preview: { type: Boolean, default: false }, // preview visible to all
  mediaUrl: { type: String }, // single primary media url
  media: { type: [MediaSchema], default: [] },
  exercises: { type: Array, default: [] }, // flexible structure for MCQ / text / image
  notes: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Lesson', LessonSchema);
