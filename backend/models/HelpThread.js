// backend/models/HelpThread.js
'use strict';
const mongoose = require('mongoose');

const HelpThreadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  subject: { type: String, default: '' },
  lastMessage: { type: String, default: '' },
  unreadForAdmin: { type: Number, default: 0 }, // unread messages from users for admin
  unreadForUser: { type: Number, default: 0 } // unread replies for user
}, { timestamps: true });

module.exports = mongoose.models.HelpThread || mongoose.model('HelpThread', HelpThreadSchema);
