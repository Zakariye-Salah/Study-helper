// backend/models/Quiz.js
const mongoose = require('mongoose');

const ChoiceSchema = new mongoose.Schema({
  id: { type: String },
  text: { type: String }
}, { _id: false });

const QuestionSchema = new mongoose.Schema({
  type: { type: String, default: 'direct' }, // direct/multiple/fill
  prompt: { type: String, required: true },
  choices: { type: [ChoiceSchema], default: [] },
  correctAnswer: { type: mongoose.Schema.Types.Mixed, default: null }, // string or [string]
  points: { type: Number, default: 1 }
}, { timestamps: false });

const QuizSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  classIds: { type: [String], default: [] }, // string IDs referencing Class._id or classId
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String, default: '' },
  questions: { type: [QuestionSchema], default: [] },
  durationMinutes: { type: Number, default: 20 },
  extraTimeMinutes: { type: Number, default: 0 },
  randomizeQuestions: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quiz', QuizSchema);
