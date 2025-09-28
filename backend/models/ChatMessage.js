// backend/models/ChatMessage.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MediaSchema = new Schema({
  url: String,
  filename: String,
  contentType: String,
  size: Number
}, { _id: false });

const ReactionSchema = new Schema({
  emoji: String,
  userIds: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, { _id: false });

const ReplySchema = new Schema({
  senderId: { type: Schema.Types.ObjectId, ref: 'User' },
  senderName: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const ChatMessageSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  senderId: { type: Schema.Types.ObjectId, required: true },
  senderName: String,
  senderRole: String,
  text: String,
  media: [MediaSchema],
  reactions: [ReactionSchema],
  replies: [ReplySchema],
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
