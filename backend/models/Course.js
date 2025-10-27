// backend/models/Course.js
'use strict';
const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['video','image','pdf','other'], default: 'video' },
  url: { type: String, default: '' },
  title: { type: String, default: '' }
}, { _id: false });

const CourseSchema = new mongoose.Schema({
  courseId: { type: String, unique: true, index: true }, // CRS00001
  title: { type: String, required: true, index: true },
  isFree: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  discount: { type: Number, default: 0 }, // percent
  duration: { type: String, default: '' },
  shortDescription: { type: String, default: '' },
  longDescription: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  media: { type: [mediaSchema], default: [] },
  categories: { type: [String], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

CourseSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.Course || mongoose.model('Course', CourseSchema);
