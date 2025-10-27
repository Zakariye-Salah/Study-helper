// backend/models/Course.js
'use strict';
const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['video','image','pdf','other'], default: 'video' },
  url: { type: String, default: '' },
  title: { type: String, default: '' }
}, { _id: false });

const teacherSchema = new mongoose.Schema({
  fullname: { type: String, default: '' },
  photo: { type: String, default: '' },
  title: { type: String, default: '' },
  bio: { type: String, default: '' },
  externalLinks: { type: [String], default: [] }
}, { _id: false });

const RatingSchema = new mongoose.Schema({
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 }
}, { _id: false });

const CourseSchema = new mongoose.Schema({
  courseId: { type: String, unique: true, index: true, sparse: true },
  title: { type: String, required: true, index: true },
  teacher: { type: teacherSchema, default: {} },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  isFree: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  duration: { type: String, default: '' },
  durationMonths: { type: Number, default: 0 },
  shortDescription: { type: String, default: '' },
  longDescription: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  media: { type: [mediaSchema], default: [] },
  categories: { type: [String], default: [] },
  avgRating: { type: Number, default: 0 },
  ratings: { type: [RatingSchema], default: [] },
  buyersCount: { type: Number, default: 0 },
  enrolled: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

CourseSchema.methods.recalcAvgRating = function() {
  if (!Array.isArray(this.ratings) || this.ratings.length === 0) { this.avgRating = 0; return; }
  let sum = 0;
  this.ratings.forEach(r => { sum += Number(r.rating || 0); });
  this.avgRating = Math.round((sum / this.ratings.length) * 10) / 10;
};

CourseSchema.pre('save', function(next) {
  try {
    if (typeof this.isModified === 'function') {
      if (this.isModified('ratings')) this.recalcAvgRating();
    } else {
      // fallback
      this.recalcAvgRating();
    }
    this.updatedAt = new Date();
  } catch (e) { console.warn('pre save course error', e); }
  next();
});

CourseSchema.index({ createdAt: -1 });
CourseSchema.index({ courseId: 1 });
CourseSchema.index({ categories: 1 });
CourseSchema.index({ avgRating: -1 });

module.exports = mongoose.models.Course || mongoose.model('Course', CourseSchema);
