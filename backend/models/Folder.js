

// backend/models/Folder.js
'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FolderSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, trim: true, index: true },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 1000 },
  count: { type: Number, default: 0 } // cached count of stories
}, { timestamps: true });

module.exports = mongoose.model('Folder', FolderSchema);

