// backend/models/HelpMessageCourse.js
'use strict';
const mongoose = require('mongoose');

const HelpMessageSchema = new mongoose.Schema({
  threadId: { type: String, default: null, index: true }, // optional thread grouping
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  toAdmin: { type: Boolean, default: false }, // if true message targets admin inbox
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // user-specific messages from admin
  subject: { type: String, default: '' },
  text: { type: String, default: '' },
  read: { type: Boolean, default: false },
  meta: { type: Object, default: {} }, // e.g. { purchaseId, courseId, provider }
  createdAt: { type: Date, default: Date.now }
});

HelpMessageSchema.index({ toAdmin: 1, read: 1 });
HelpMessageSchema.index({ toUserId: 1, read: 1 });

module.exports = mongoose.models.HelpMessageCourse || mongoose.model('HelpMessageCourse', HelpMessageSchema);
