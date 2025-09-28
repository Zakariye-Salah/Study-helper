// backend/models/MeetingAudit.js
const mongoose = require('mongoose');

const MeetingAuditSchema = new mongoose.Schema({
  meetingId: { type: String, required: true, index: true },
  action: { type: String, required: true }, // e.g. 'kick', 'mute-everyone', 'meeting-deleted'
  byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  byName: { type: String, required: false },
  target: { type: String, required: false }, // userKey or socketId or other info
  meta: { type: Object, default: {} },
  ts: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('MeetingAudit', MeetingAuditSchema);
