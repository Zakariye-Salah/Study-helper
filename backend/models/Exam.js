// backend/models/Exam.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Each exam has: title, unique examCode, classes (array of classIds or 'all'),
// createdBy (user id), createdAt, subjects (array of { code, name, maxMarks }), results
// results: array of { studentId, classId, marks: [{ subjectCode, mark }], total, average, uploadedImages: [url], createdAt, updatedAt }

const ResultSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  marks: [{
    subjectCode: String,
    subjectName: String,
    mark: { type: Number, default: null }
  }],
  total: { type: Number, default: 0 },
  average: { type: Number, default: 0 },
  uploadedImages: [String], // urls or paths
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: true });

const ExamSchema = new Schema({
  title: { type: String, required: true },
  examCode: { type: String, required: true, unique: true }, // unique id for exam
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String },
  schoolId: { type: Schema.Types.ObjectId, ref: 'School' }, // optional
  classes: [{ type: Schema.Types.ObjectId, ref: 'Class' }], // empty => applies to all classes
  subjects: [{
    code: String,
    name: String,
    maxMarks: { type: Number, default: 100 }
  }],
  results: [ResultSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ExamSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Exam', ExamSchema);
