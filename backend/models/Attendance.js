// backend/models/Attendance.js
const mongoose = require('mongoose');

const AttendanceRecordSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  present: { type: Boolean, default: false },
  note: { type: String, default: '' },
  durationMinutes: { type: Number, default: 0 } // optional: minutes present during that period
});

const AttendanceSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: false }, // optional but recommended
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  date: { type: String, required: true }, // store as YYYY-MM-DD string for easy uniqueness
  records: [AttendanceRecordSchema],
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Unique per class + subject(optional) + date + teacher
AttendanceSchema.index({ classId: 1, subjectId: 1, date: 1, teacherId: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);
