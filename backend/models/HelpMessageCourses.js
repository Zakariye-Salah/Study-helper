// backend/models/HelpMessageCourse.js
'use strict';
const mongoose = require('mongoose');

const HelpMessageSchema = new mongoose.Schema({
  threadId: { type: String, default: null },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  toAdmin: { type: Boolean, default: false },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  text: { type: String, default: '' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.HelpMessageCourse || mongoose.model('HelpMessageCourse', HelpMessageSchema);
