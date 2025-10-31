// backend/models/GamePlay.js
'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const QuestionAnswerSchema = new Schema({
  qId: { type: Schema.Types.ObjectId, ref: 'GameQuestion' },
  answerIndex: { type: Number, default: null },
  correct: { type: Boolean, default: false },
  timeMs: { type: Number, default: 0 }
}, { _id: false });

const GamePlaySchema = new Schema({
  competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', default: null, index: true },
  participantId: { type: Schema.Types.ObjectId, ref: 'CompetitionParticipant', default: null },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  gameId: { type: Schema.Types.ObjectId, ref: 'Games', required: true, index: true },
  questions: [ QuestionAnswerSchema ],
  sessionPoints: { type: Number, default: 0 },
  // safer default: not assume competitive unless explicitly set
  isCompetitive: { type: Boolean, default: false },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  cancelled: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  meta: { type: Schema.Types.Mixed, default: {} }
});

GamePlaySchema.index({ studentId: 1, startedAt: -1 });

const GamePlay = mongoose.models.GamePlay || mongoose.model('GamePlay', GamePlaySchema);

module.exports = GamePlay;

