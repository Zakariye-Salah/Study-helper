// backend/models/PurchaseAttempt.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const PurchaseSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  courseSnapshot: { // keep historic purchase price/title
    courseIdStr: String,
    title: String,
    price: Number,
    isFree: Boolean
  },
  provider: { type: String, enum: ['Somtel','Hormuud','Somnet','Other'], default: 'Other' },
  enteredPhoneNumber: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  status: { type: String, enum: ['checking','verified','unproven'], default: 'checking' },
  adminNotes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
});

PurchaseSchema.index({ userId: 1, courseId: 1, status: 1 });

module.exports = mongoose.model('PurchaseAttempt', PurchaseSchema);

