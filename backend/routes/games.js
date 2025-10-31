// backend/models/Games.js
'use strict';

/**
 * backend/models/Games.js
 * Clean, idempotent model registration — do NOT declare `mongoose` twice in this file.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ----- Game schema -----
const GameSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, index: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  // safer default; set true if you want created games to be competition by default
  isCompetition: { type: Boolean, default: false },
  tags: [String],
  thumbnail: { type: String, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
GameSchema.index({ name: 'text' });

// ----- GameQuestion schema -----
const GameQuestionSchema = new Schema({
  gameId: { type: Schema.Types.ObjectId, ref: 'Games', required: true, index: true },
  text: { type: String, required: true },
  choices: [{ type: String }],
  correctIndex: { type: Number, required: true },
  timeLimit: { type: Number, default: 10 },
  difficulty: { type: String, default: '' },
  tags: [String],
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Idempotent model registration to avoid OverwriteModelError and double-declare issues
const Game = mongoose.models.Games || mongoose.model('Games', GameSchema);
const GameQuestion = mongoose.models.GameQuestion || mongoose.model('GameQuestion', GameQuestionSchema);

module.exports = { Game, GameQuestion };
