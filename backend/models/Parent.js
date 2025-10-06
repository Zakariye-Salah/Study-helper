// backend/models/Parent.js
const mongoose = require('mongoose');

const ParentSchema = new mongoose.Schema({
  fullname: { type: String, required: true, trim: true },
  phone: { type: String, required: false, trim: true },
  passwordHash: { type: String, required: true },
  childStudent: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  childNumberId: { type: String, required: true }, // duplicate for quick lookups
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },

  // soft-delete metadata
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: null },
    name: { type: String, default: null }
  }
});

ParentSchema.pre('save', function(next){
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Parent', ParentSchema);
