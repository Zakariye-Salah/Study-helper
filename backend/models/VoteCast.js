// backend/models/VoteCast.js
const mongoose = require('mongoose');

const VoteCastSchema = new mongoose.Schema({
  voteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vote', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userRole: { type: String },
  candidateIndex: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Prevent double casts by same user for same vote
VoteCastSchema.index({ voteId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('VoteCast', VoteCastSchema);
