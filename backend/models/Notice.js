// backend/models/Notice.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReplySchema = new Schema({
  author: { type: Schema.Types.ObjectId, ref: 'User' },
  authorName: { type: String },
  text: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const RecipientSchema = new Schema({
  // use Mixed to avoid validation errors when some code accidentally passes string ids;
  // prefer ObjectId but Mixed is safer until all callers are normalized.
  userId: { type: Schema.Types.Mixed, required: true },
  role: { type: String, required: false },
  readAt: { type: Date, default: null }
}, { _id: false });

const NoticeSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String },
  title: { type: String, required: true },
  body: { type: String },
  schoolId: { type: Schema.Types.ObjectId, ref: 'School' },
  recipients: { type: [RecipientSchema], default: [] },
  targetRoles: { type: [String], default: [] },
  restrictReplies: { type: Boolean, default: false },
  replies: { type: [ReplySchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Notice', NoticeSchema);
