// backend/models/MeetingMessage.js
const mongoose = require('mongoose');

const MeetingMessageSchema = new mongoose.Schema({
  meetingId: { type: String, required: true, index: true }, // meetingId string from Meeting.meetingId
  meetingRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: false }, // optional ref
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  fromName: { type: String, required: true },
  toSocketId: { type: String, required: false }, // if null -> broadcast
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }, // optional targeted user id
  text: { type: String, required: true },
  ts: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('MeetingMessage', MeetingMessageSchema);
