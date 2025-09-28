// backend/models/HelpBlock.js
const mongoose = require('mongoose');

const HelpBlockSchema = new mongoose.Schema({
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  target: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

HelpBlockSchema.index({ by: 1, target: 1 }, { unique: true });

module.exports = mongoose.model('HelpBlock', HelpBlockSchema);
