// File: backend/models/Competition.js
'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Competition + CompetitionParticipant models
 * Use safe (idempotent) model registration to avoid OverwriteModelError
 * Also export a shared helper activeCompetitionQuery(now) so routes can reuse the logic.
 */

const CompetitionSchema = new Schema({
  name: { type: String, required: true, trim: true },
  // allow older clients to use title
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null },
  deleted: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
CompetitionSchema.index({ name: 'text', title: 'text' });

const CompetitionParticipantSchema = new Schema({
  competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, default: '' },
  totalPoints: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
CompetitionParticipantSchema.index({ competitionId: 1, totalPoints: -1 });

// Idempotent registration
const Competition = mongoose.models.Competition || mongoose.model('Competition', CompetitionSchema);
const CompetitionParticipant = mongoose.models.CompetitionParticipant || mongoose.model('CompetitionParticipant', CompetitionParticipantSchema);

// Helper query used by routes to find an "active" competition. Treats null startAt as already started and null endAt as no end.
function activeCompetitionQuery(now = new Date()) {
  return {
    deleted: false,
    $and: [
      { $or: [ { startAt: { $lte: now } }, { startAt: null } ] },
      { $or: [ { endAt: { $gte: now } }, { endAt: null } ] }
    ]
  };
}

module.exports = { Competition, CompetitionParticipant, activeCompetitionQuery };
