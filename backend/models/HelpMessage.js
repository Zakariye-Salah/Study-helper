// backend/models/HelpMessage.js
const mongoose = require('mongoose');

const ReactionSchema = new mongoose.Schema({
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  emoji: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const HelpMessageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // author (User/Student/Teacher stored in User/other collections)
  fromName: { type: String },
  text: { type: String, required: true },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'HelpMessage', default: null },
  toRole: { type: String, default: null }, // 'student'|'teacher'|'manager' etc
  toUser: { type: mongoose.Schema.Types.ObjectId, default: null }, // explicit recipient
  broadcastToAll: { type: Boolean, default: false },
  private: { type: Boolean, default: false }, // manager-only private
  reactions: { type: [ReactionSchema], default: [] },
  removed: { type: Boolean, default: false },
  removedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

HelpMessageSchema.index({ createdAt: -1 });

HelpMessageSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('HelpMessage', HelpMessageSchema);
