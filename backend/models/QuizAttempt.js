// backend/models/QuizAttempt.js
const mongoose = require('mongoose');

const AttemptAnswerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.Mixed }, // often a string/objectId depending on question snapshot
  answer: { type: mongoose.Schema.Types.Mixed, default: null },
  pointsAwarded: { type: Number, default: 0 }
}, { _id: false });

const AttemptQuestionSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.Mixed }, // keep original question _id
  type: { type: String },
  prompt: { type: String },
  choices: { type: [mongoose.Schema.Types.Mixed], default: [] },
  correctAnswer: { type: mongoose.Schema.Types.Mixed },
  points: { type: Number, default: 1 }
}, { _id: false });

const QuizAttemptSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  studentId: { type: String, required: true }, // store as string for compatibility
  studentFullname: { type: String, default: '' },
  studentNumber: { type: String, default: '' },
  classId: { type: String, default: null },
  questionOrder: { type: [String], default: [] },
  questions: { type: [AttemptQuestionSchema], default: [] },
  answers: { type: [AttemptAnswerSchema], default: [] },
  startedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date, default: null },
  durationMinutes: { type: Number, default: 20 },
  extraTimeMinutes: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  maxScore: { type: Number, default: 0 },
  submitted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QuizAttempt', QuizAttemptSchema);
