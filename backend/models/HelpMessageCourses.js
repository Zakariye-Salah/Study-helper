// backend/models/HelpMessageCourses.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const HelpMessageSchema = new Schema({
  threadId: { type: String, index: true },
  fromUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  toAdmin: { type: Boolean, default: true },
  toUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  body: { type: String, required: true },
  read: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('HelpMessageCourses', HelpMessageSchema);
