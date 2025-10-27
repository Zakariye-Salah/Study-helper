// backend/models/HelpThread.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const HelpThreadSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: false }, // null for purely admin-created threads if needed
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: false },
  subject: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastUpdatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('HelpThread', HelpThreadSchema);
