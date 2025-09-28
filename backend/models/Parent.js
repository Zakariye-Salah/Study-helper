// backend/models/Parent.js
const mongoose = require('mongoose');

const ParentSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  phone: { type: String, required: false },
  passwordHash: { type: String, required: true },
  childStudent: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  childNumberId: { type: String, required: true }, // duplicate for quick lookups
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
});

module.exports = mongoose.model('Parent', ParentSchema);
