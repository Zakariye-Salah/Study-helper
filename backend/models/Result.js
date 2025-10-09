// backend/models/Result.js
const mongoose = require('mongoose');

const SubjectMarkSchema = new mongoose.Schema({
  subjectCode: String,
  subjectName: String,
  mark: { type: Number }
}, { _id: false });

const ResultSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  examTitle: String,
  marks: [SubjectMarkSchema],
  total: Number,
  average: Number,
  rankClass: Number,
  rankOverall: Number,
  uploadedFiles: [String],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', ResultSchema);
