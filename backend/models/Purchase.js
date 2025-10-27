// backend/models/Purchase.js
'use strict';
const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  courseSnapshot: {
    courseId: String,
    title: String,
    price: Number
  },
  provider: { type: String, enum: ['Somtel','Hormuud','Somnet','Other'], default: 'Other' },
  enteredPhoneNumber: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  status: { type: String, enum: ['checking','verified','unproven'], default: 'checking', index: true },
  adminNotes: { type: String, default: '' },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

module.exports = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema);
