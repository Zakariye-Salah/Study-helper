// backend/models/Vote.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const VoterSchema = new Schema({
  voterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  voterRole: { type: String },
  candidateId: { type: Schema.Types.ObjectId },
  votedAt: { type: Date, default: Date.now }
}, { _id: false });

const CandidateSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', default: null },
  name: { type: String, default: '' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  votes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const VoteSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  allowed: { type: String, enum: ['students', 'teachers', 'all'], default: 'students' },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, default: () => new Date(Date.now() + 24*3600*1000) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String },
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null },
  candidates: { type: [CandidateSchema], default: [] },
  voters: { type: [VoterSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Vote || mongoose.model('Vote', VoteSchema);
