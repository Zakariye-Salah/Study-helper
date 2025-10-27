// backend/models/Purchase.js

'use strict';
const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  courseSnapshot: { // snapshot of course details at purchase time
    courseId: String,
    title: String,
    price: Number
  },
  provider: { type: String, enum: ['Somtel','Hormuud','Somnet','Other'], default: 'Other' },
  enteredPhoneNumber: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  status: { type: String, enum: ['checking','verified','unproven'], default: 'checking' },
  adminNotes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

purchaseSchema.index({ status: 1 });
purchaseSchema.index({ userId: 1, courseId: 1 });

module.exports = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema);
