// backend/models/PaymentType.js
const mongoose = require('mongoose');
const slugify = require('slugify'); // optional; if not installed we fall back to name-based key

const PaymentTypeSchema = new mongoose.Schema({
  key: { type: String, required: true, index: true },
  name: { type: String, required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentType', PaymentTypeSchema);
