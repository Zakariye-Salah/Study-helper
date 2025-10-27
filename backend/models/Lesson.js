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
  preview: { type: Boolean, default: false },
  mediaUrl: { type: String },
  media: { type: [MediaSchema], default: [] },
  exercises: { type: Array, default: [] },
  notes: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

// Guard against OverwriteModelError (nodemon / re-require)
module.exports = mongoose.models.Lesson || mongoose.model('Lesson', LessonSchema);
