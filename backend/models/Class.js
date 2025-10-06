// backend/models/Class.js
const mongoose = require('mongoose');

const ClassSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  classId: { type: String, trim: true }, // optional; unique per school if present
  subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },

  // soft-delete metadata (for recycle bin)
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: null },
    name: { type: String, default: null }
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Text index for search on name
ClassSchema.index({ name: 'text' });

// Unique classId per school (only if classId provided)
ClassSchema.index(
  { classId: 1, schoolId: 1 },
  { unique: true, partialFilterExpression: { classId: { $exists: true, $ne: "" } } }
);

ClassSchema.pre('save', function(next){
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Class', ClassSchema);
