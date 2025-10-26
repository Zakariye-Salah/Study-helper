// backend/models/Course.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const MediaSchema = new Schema({
  type: { type: String, enum: ['video','image','file'], required: true },
  url: { type: String, required: true },
  title: { type: String }
}, { _id: false });

const CourseSchema = new Schema({
  courseId: { type: String, required: true, unique: true }, // e.g. CRS00001
  title: { type: String, required: true },
  isFree: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  discount: { type: Number, default: 0 }, // percent 0..100
  duration: { type: String }, // e.g. '1 month'
  shortDescription: { type: String },
  longDescription: { type: String },
  thumbnailUrl: { type: String },
  media: { type: [MediaSchema], default: [] },
  visibility: { type: String, enum: ['public','private'], default: 'public' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Course', CourseSchema);
