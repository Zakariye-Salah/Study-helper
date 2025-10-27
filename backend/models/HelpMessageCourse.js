// backend/models/HelpMessageCourse.js
'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReactionSchema = new Schema({
  by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true, maxlength: 20 }
}, { _id: false });

// Thread-like + broadcast help message model. Supports:
// - threadId style linkage (if you create threads for course help)
// - toAdmin / toUserId / read for counting unread messages (used in counts endpoints)
// - broadcastToAll, toRole, toUsers for broadcast messages
const HelpMessageCourseSchema = new Schema({
  threadId: { type: Schema.Types.ObjectId, ref: 'HelpThread', default: null, index: true },
  from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fromName: { type: String, default: '' },
  text: { type: String, required: true },
  replyTo: { type: Schema.Types.ObjectId, ref: 'HelpMessageCourse', default: null },
  // For legacy/notification uses:
  toAdmin: { type: Boolean, default: false },
  toUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  read: { type: Boolean, default: false }, // whether the targeted recipient read it
  // Broadcast capabilities:
  broadcastToAll: { type: Boolean, default: false },
  toRole: { type: String, default: null }, // 'student', 'teacher', 'admin', etc.
  toUser: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // alias
  toUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  private: { type: Boolean, default: false },
  reactions: { type: [ReactionSchema], default: [] },
  removed: { type: Boolean, default: false },
  removedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  removedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: null }
});

// Useful indexes
HelpMessageCourseSchema.index({ createdAt: -1 });
HelpMessageCourseSchema.index({ from: 1 });
HelpMessageCourseSchema.index({ toUserId: 1 });
HelpMessageCourseSchema.index({ toUsers: 1 });
HelpMessageCourseSchema.index({ toRole: 1 });
HelpMessageCourseSchema.index({ broadcastToAll: 1 });

module.exports = mongoose.models.HelpMessageCourse || mongoose.model('HelpMessageCourse', HelpMessageCourseSchema);
