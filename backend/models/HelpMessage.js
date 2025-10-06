// backend/models/HelpMessage.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReactionSchema = new Schema({
  by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true, maxlength: 20 }
}, { _id: false });

const HelpMessageSchema = new Schema({
  from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fromName: { type: String, default: '' },
  text: { type: String, required: true },
  replyTo: { type: Schema.Types.ObjectId, ref: 'HelpMessage', default: null },
  broadcastToAll: { type: Boolean, default: false },
  toRole: { type: String, default: null }, // 'student', 'teacher', 'manager', etc.
  toUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  toUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  private: { type: Boolean, default: false },
  reactions: { type: [ReactionSchema], default: [] },
  removed: { type: Boolean, default: false },
  removedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  removedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: null }
});

// Indexes to accelerate common queries
HelpMessageSchema.index({ createdAt: -1 });
HelpMessageSchema.index({ from: 1 });
HelpMessageSchema.index({ toUser: 1 });
HelpMessageSchema.index({ toUsers: 1 });
HelpMessageSchema.index({ toRole: 1 });
HelpMessageSchema.index({ broadcastToAll: 1 });

module.exports = mongoose.model('HelpMessage', HelpMessageSchema);
