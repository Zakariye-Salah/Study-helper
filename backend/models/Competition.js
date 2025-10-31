// File: backend/models/Competition.js
'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Competition + CompetitionParticipant models with helper static methods.
 */

const CompetitionSchema = new Schema({
  name: { type: String, required: true, trim: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null },
  deleted: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  // optional convenience field: published (allows admin to stage competitions)
  published: { type: Boolean, default: true }
});

// Text search
CompetitionSchema.index({ name: 'text', title: 'text' });

// auto-update updatedAt
CompetitionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// static helper: find active using same logic as routes
CompetitionSchema.statics.findActive = function(now = new Date()){
  return this.findOne({
    deleted: false,
    published: true,
    $and: [
      { $or: [{ startAt: { $lte: now } }, { startAt: null }] },
      { $or: [{ endAt: { $gte: now } }, { endAt: null }] }
    ]
  }).sort({ startAt: -1, createdAt: -1 }).lean();
};

// Helper to find upcoming competitions (start in future)
CompetitionSchema.statics.findUpcoming = function(now = new Date(), limit = 5) {
  return this.find({
    deleted: false,
    published: true,
    startAt: { $gt: now }
  }).sort({ startAt: 1 }).limit(limit).lean();
};


const CompetitionParticipantSchema = new Schema({
  competitionId: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, default: '' },
  totalPoints: { type: Number, default: 0 },
  meta: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});
CompetitionParticipantSchema.index({ competitionId: 1, totalPoints: -1 });

const Competition = mongoose.models.Competition || mongoose.model('Competition', CompetitionSchema);
const CompetitionParticipant = mongoose.models.CompetitionParticipant || mongoose.model('CompetitionParticipant', CompetitionParticipantSchema);

module.exports = { Competition, CompetitionParticipant };
