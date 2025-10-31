//backend/models/Competition.js
'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const CompetitionSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null },
  deleted: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
CompetitionSchema.index({ name: 'text' });

const CompetitionParticipantSchema = new Schema({
  competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, default: '' },
  totalPoints: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
CompetitionParticipantSchema.index({ competitionId: 1, totalPoints: -1 });

const Competition = mongoose.model('Competition', CompetitionSchema);
const CompetitionParticipant = mongoose.model('CompetitionParticipant', CompetitionParticipantSchema);

module.exports = { Competition, CompetitionParticipant };
