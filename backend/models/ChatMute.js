// backend/models/ChatMute.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChatMuteSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mutedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reason: String,
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatMute', ChatMuteSchema);
