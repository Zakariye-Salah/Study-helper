

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



  // backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

function getUserFromReq(req) {
  const possibleAuth = req.headers.authorization || req.headers['x-access-token'] || req.query.token || req.body.token;
  if (!possibleAuth) return null;
  const token = String(possibleAuth).replace(/^Bearer\s*/i, '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload._id) {
      if (payload.id) payload._id = payload.id;
      else if (payload.userId) payload._id = payload.userId;
      else if (payload.sub) payload._id = payload.sub;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = getUserFromReq(req);
  if (!user || !user._id) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

module.exports = requireAuth;
