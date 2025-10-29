// // backend/models/Course.js
// const mongoose = require('mongoose');
// const { Schema } = mongoose;

// const MediaSchema = new Schema({
//   type: { type: String, enum: ['video','image','file'], required: true },
//   url: { type: String, required: true },
//   title: { type: String, default: '' },
//   durationSeconds: { type: Number, default: 0 } // optional for videos
// }, { _id: false });

// const CourseSchema = new Schema({
//   courseId: { type: String, required: true, unique: true }, // e.g. CRS00001
//   title: { type: String, required: true },
//   isFree: { type: Boolean, default: false },
//   price: { type: Number, default: 0 },
//   discountPercent: { type: Number, default: 0 }, // 0-100
//   duration: { type: String, default: '' },
//   shortDescription: { type: String, default: '' },
//   longDescription: { type: String, default: '' },
//   thumbnailUrl: { type: String, default: '' },
//   media: { type: [MediaSchema], default: [] },
//   visibility: { type: String, enum: ['public','private'], default: 'public' },

//   createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
//   createdAt: { type: Date, default: Date.now },
//   updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
//   updatedAt: { type: Date, default: Date.now },

//   // soft-delete
//   deleted: { type: Boolean, default: false },
//   deletedAt: { type: Date, default: null },
//   deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

//   // keep a historical price snapshot field (optional)
//   lastPublishedPrice: { type: Number, default: 0 }
// });

// // index for text search
// CourseSchema.index({ title: 'text', shortDescription: 'text', longDescription: 'text', courseId: 'text' });

// CourseSchema.pre('save', function(next){
//   this.updatedAt = new Date();
//   if (!this.courseId) {
//     // Auto-generate a courseId if not present (CRS + zero padded count)
//     // NOTE: generation based on timestamp fallback to avoid collisions in distributed envs.
//     this.courseId = 'CRS' + String(Math.floor(Date.now() / 1000)).slice(-6);
//   }
//   if (!this.lastPublishedPrice) this.lastPublishedPrice = Number(this.price || 0);
//   next();
// });

// module.exports = mongoose.model('Course', CourseSchema);


// // backend/models/Course.js
// const mongoose = require('mongoose');
// const { Schema } = mongoose;

// const MediaSchema = new Schema({
//   type: { type: String, enum: ['video','image','file','external'], required: true },
//   url: { type: String, required: true },
//   title: { type: String },
//   external: { type: Boolean, default: false }
// }, { _id: false });

// const TeacherSnapshotSchema = new Schema({
//   name: String,
//   title: String,
//   photoUrl: String,
//   bio: String,
//   affiliation: String,
//   externalLinks: [String]
// }, { _id: false });

// const CourseSchema = new Schema({
//   courseId: { type: String, index: true, unique: true, sparse: true }, // e.g. CRS00001
//   title: { type: String, required: true, index: true },
//   category: { type: String, default: 'Other', index: true },
//   teacher: { type: TeacherSnapshotSchema, default: {} },
//   isFree: { type: Boolean, default: false },
//   price: { type: Number, default: 0 }, // stored as cents or decimal per your convention
//   discountPercent: { type: Number, default: 0 },
//   duration: { type: String },
//   shortDescription: { type: String },
//   longDescription: { type: String },
//   thumbnailUrl: { type: String },
//   media: { type: [MediaSchema], default: [] },
//   previewLessonIds: { type: [Schema.Types.ObjectId], default: [] },
//   marketingProvenCount: { type: Number, default: 0 },
//   actualProvenCount: { type: Number, default: 0 },
//   visible: { type: Boolean, default: true },

//   // soft-delete
//   deleted: { type: Boolean, default: false },
//   deletedAt: { type: Date, default: null },
//   deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

//   createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
//   updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },

// }, { timestamps: true });

// module.exports = mongoose.model('Course', CourseSchema);


// backend/models/Course.js
'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const MediaSchema = new Schema({
  type: { type: String, enum: ['video','image','file','external'], default: 'video' },
  url: { type: String, required: true },
  title: { type: String, default: '' }
}, { _id: false });

const TeacherSchema = new Schema({
  name: { type: String, default: '' },
  title: { type: String, default: '' },
  photoUrl: { type: String, default: '' }, // teacher photo (thumbnail)
  bio: { type: String, default: '' },
  affiliation: { type: String, default: '' }
}, { _id: false });

const CourseSchema = new Schema({
  courseId: { type: String, required: true, unique: true, index: true }, // human friendly id
  title: { type: String, required: true, index: true },
  category: { type: String, default: 'Other', index: true },
  teacher: { type: TeacherSchema, default: () => ({}) },
  isFree: { type: Boolean, default: true },
  price: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  duration: { type: String, default: '' },
  shortDescription: { type: String, default: '' },
  longDescription: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' }, // course thumbnail
  media: { type: [MediaSchema], default: [] },
  previewLessonIds: { type: [Schema.Types.ObjectId], default: [] }, // quick preview lookup
  ratingAvg: { type: Number, default: null },
  ratingCount: { type: Number, default: 0 },
  marketingProvenCount: { type: Number, default: 0 },
  actualProvenCount: { type: Number, default: 0 },
  visibility: { type: String, default: 'public' },
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  lastPublishedPrice: { type: Number, default: 0 }
}, { timestamps: true });

// indexes
CourseSchema.index({ title: 'text', shortDescription: 'text', longDescription: 'text' });

module.exports = mongoose.models.Course || mongoose.model('Course', CourseSchema);
