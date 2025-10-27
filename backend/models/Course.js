// backend/models/Course.js
'use strict';
const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['video','image','pdf','other'], default: 'video' },
  url: { type: String, default: '' },
  title: { type: String, default: '' }
}, { _id: false });

const teacherSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  photo: { type: String, default: '' },
  title: { type: String, default: '' },
  bio: { type: String, default: '' },
  externalLinks: { type: [String], default: [] }
}, { _id: false });

const CourseSchema = new mongoose.Schema({
  courseId: { type: String, unique: true, index: true, sparse: true }, // CRS00001 (optional)
  title: { type: String, required: true, index: true },
  teacher: { type: teacherSchema, default: {} }, // teacher object (photo, bio, name)
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  isFree: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  discount: { type: Number, default: 0 }, // percent
  duration: { type: String, default: '' },
  shortDescription: { type: String, default: '' },
  longDescription: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  media: { type: [mediaSchema], default: [] },
  categories: { type: [String], default: [] },
  avgRating: { type: Number, default: 0 },
  buyersCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

CourseSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.Course || mongoose.model('Course', CourseSchema);
