// backend/models/Subject.js
const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subjectId: { type: String, trim: true }, // optional; unique per school if present
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },

  // soft-delete metadata
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: null },
    name: { type: String, default: null }
  }
});

// Text index for search on name
SubjectSchema.index({ name: 'text' });

// Unique subjectId per school (only if subjectId exists)
SubjectSchema.index(
  { subjectId: 1, schoolId: 1 },
  { unique: true, partialFilterExpression: { subjectId: { $exists: true, $ne: "" } } }
);

SubjectSchema.pre('save', function(next){
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Subject', SubjectSchema);
