
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
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  teacherSnapshot: { // denormalized teacher details for fast display
    name: String,
    photo: String,
    bio: String
  },
  isFree: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  discount: { type: Number, default: 0 }, // percent
  duration: { type: String, default: '' }, // human-friendly like "1 month"
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

// simple helper: when a purchase is verified, increment buyersCount externally (route handles this)

module.exports = mongoose.models.Course || mongoose.model('Course', CourseSchema);
