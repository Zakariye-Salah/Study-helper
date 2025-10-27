// // backend/models/HelpMessageCourse.js
// 'use strict';
// const mongoose = require('mongoose');
// const Schema = mongoose.Schema;

// const ReactionSchema = new Schema({
//   by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
//   emoji: { type: String, required: true, maxlength: 20 }
// }, { _id: false });

// const HelpMessageCourseSchema = new Schema({
//   from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
//   fromName: { type: String, default: '' },
//   text: { type: String, required: true },
//   replyTo: { type: Schema.Types.ObjectId, ref: 'HelpMessageCourse', default: null },
//   broadcastToAll: { type: Boolean, default: false },
//   toRole: { type: String, default: null }, // 'student', 'teacher', 'admin', etc.
//   toUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
//   toUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
//   private: { type: Boolean, default: false },
//   reactions: { type: [ReactionSchema], default: [] },
//   removed: { type: Boolean, default: false },
//   removedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
//   removedAt: { type: Date, default: null },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: null }
// });

// HelpMessageCourseSchema.index({ createdAt: -1 });
// HelpMessageCourseSchema.index({ from: 1 });
// HelpMessageCourseSchema.index({ toUser: 1 });
// HelpMessageCourseSchema.index({ toUsers: 1 });
// HelpMessageCourseSchema.index({ toRole: 1 });
// HelpMessageCourseSchema.index({ broadcastToAll: 1 });

// module.exports = mongoose.models.HelpMessageCourse || mongoose.model('HelpMessageCourse', HelpMessageCourseSchema);

// backend/models/HelpMessage.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const HelpSchema = new Schema({
  threadId: { type: String, default: '' }, // optional grouping
  fromUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null for system/admin
  toAdmin: { type: Boolean, default: true },
  toUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  body: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

HelpSchema.index({ toUserId: 1, fromUserId: 1, createdAt: -1 });

module.exports = mongoose.model('HelpMessageCourse', HelpSchema);







// backend/models/HelpMessageCourse.js
// backend/models/Course.js
// backend/routes/courses.js
// backend/models/HelpThread.js
// backend/models/Lesson.js
// backend/routes/helpCourse.js
// backend/routes/notifications.js
// backend/routes/recycleCourse.js
// backend/routes/purchases.js
