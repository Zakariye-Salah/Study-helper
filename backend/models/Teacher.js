// backend/models/Teacher.js
const mongoose = require('mongoose');

const TeacherSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  numberId: { type: String }, // unique per-school via compound index
  classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }], // <- added
  phone: String,
  salary: { type: Number, default: 0 }, // <- added
  photo: String, // filename of uploaded image (optional)
  passwordHash: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// unique numberId per school
TeacherSchema.index({ numberId: 1, schoolId: 1 }, { unique: true, partialFilterExpression: { numberId: { $exists: true } } });

module.exports = mongoose.model('Teacher', TeacherSchema);
