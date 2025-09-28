// backend/models/Meeting.js
const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
  meetingId: { type: String, unique: true, index: true, default: () => Math.random().toString(36).slice(2, 9) },
  title: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'ownerType' },
  ownerType: { type: String, enum: ['teacher','manager','admin','system'], default: 'teacher' },
  classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  startsAt: { type: Date, default: null },
  options: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

MeetingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Meeting', MeetingSchema);
