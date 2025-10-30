// backend/models/Notification.js
'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationSchema = new Schema({
  type: { type: String, default: 'general' }, // e.g. 'top10','general','announcement'
  title: { type: String, required: true },
  body: { type: String, default: '' },
  recipients: { type: String, default: 'all' }, // 'all', 'students', 'managers', 'school' (filter with schoolId)
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null },
  meta: { type: Schema.Types.Mixed, default: {} },
  readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }], // users who read this notification
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: () => new Date() },
  deleted: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

module.exports = mongoose.model('Notification', NotificationSchema);
