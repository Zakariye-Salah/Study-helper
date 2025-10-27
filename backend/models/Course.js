// backend/models/Course.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const MediaSchema = new Schema({
  type: { type: String, enum: ['video','image','file'], required: true },
  url: { type: String, required: true },
  title: { type: String, default: '' },
  durationSeconds: { type: Number, default: 0 } // optional for videos
}, { _id: false });

const CourseSchema = new Schema({
  courseId: { type: String, required: true, unique: true }, // e.g. CRS00001
  title: { type: String, required: true },
  isFree: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 }, // 0-100
  duration: { type: String, default: '' },
  shortDescription: { type: String, default: '' },
  longDescription: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  media: { type: [MediaSchema], default: [] },
  visibility: { type: String, enum: ['public','private'], default: 'public' },

  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedAt: { type: Date, default: Date.now },

  // soft-delete
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  // keep a historical price snapshot field (optional)
  lastPublishedPrice: { type: Number, default: 0 }
});

// index for text search
CourseSchema.index({ title: 'text', shortDescription: 'text', longDescription: 'text', courseId: 'text' });

CourseSchema.pre('save', function(next){
  this.updatedAt = new Date();
  if (!this.courseId) {
    // Auto-generate a courseId if not present (CRS + zero padded count)
    // NOTE: generation based on timestamp fallback to avoid collisions in distributed envs.
    this.courseId = 'CRS' + String(Math.floor(Date.now() / 1000)).slice(-6);
  }
  if (!this.lastPublishedPrice) this.lastPublishedPrice = Number(this.price || 0);
  next();
});

module.exports = mongoose.model('Course', CourseSchema);
 
