// backend/models/Games.js
// backend/models/Games.js
'use strict';

/**
 * Idempotent, resilient Games model file.
 * Uses an IIFE and global.__mongoose to avoid duplicate top-level declarations
 * that can cause "Identifier 'mongoose' has already been declared" errors.
 */

module.exports = (function() {
  // use a single global mongoose instance to avoid multiple requires causing oddities
  const mongoose = global.__mongoose || (global.__mongoose = require('mongoose'));
  const { Schema } = mongoose;

  // ----- Game schema -----
  const GameSchema = new Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, index: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
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

  // Idempotent model registration
  const Game = mongoose.models.Games || mongoose.model('Games', GameSchema);
  const GameQuestion = mongoose.models.GameQuestion || mongoose.model('GameQuestion', GameQuestionSchema);

  return { Game, GameQuestion };
})();
