

// backend/models/Story.js
'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CommentSchema = new Schema({
  id: { type: String, required: true, index: true },
  userId: { type: String },
  userName: { type: String },
  school: { type: String },
  text: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const ReactionSchema = new Schema({
  userId: { type: String },
  userName: { type: String },
  type: { type: String }, // emoji string
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const PageSchema = new Schema({
  page: { type: Number },
  text: { type: String }
}, { _id: false });

const StorySchema = new Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, default: '' }, // full content if single page
  pages: { type: [PageSchema], default: [] }, // optional multi-page
  image: { type: String, default: '' }, // path like '/uploads/stories/123.jpg'
  folderId: { type: Schema.Types.ObjectId, ref: 'Folder', index: true, default: null },
  folderName: { type: String, default: '' }, // denormalized name to speed queries
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 1000 },
  comments: { type: [CommentSchema], default: [] },
  reactions: { type: [ReactionSchema], default: [] },
  createdBy: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Story', StorySchema);



