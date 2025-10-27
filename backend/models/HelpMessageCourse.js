// backend/models/HelpMessageCourse.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const HelpMessageSchema = new Schema({
  threadId: { type: Schema.Types.ObjectId, ref: 'HelpThread', required: true, index: true },
  fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  toUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  toAdmin: { type: Boolean, default: false }, // true when message sent to admin
  body: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('HelpMessageCourse', HelpMessageSchema);
