// backend/models/HelpMute.js
const mongoose = require('mongoose');

const HelpMuteSchema = new mongoose.Schema({
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  target: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

HelpMuteSchema.index({ manager: 1, target: 1 }, { unique: true });

module.exports = mongoose.model('HelpMute', HelpMuteSchema);
