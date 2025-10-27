// backend/models/HelpThread.js
'use strict';
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  text: { type: String, default: '' },
  toAdmin: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const HelpThreadSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: String, default: '' },
  messages: { type: [MessageSchema], default: [] },
  closed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.HelpThread || mongoose.model('HelpThread', HelpThreadSchema);
