// backend/models/PurchaseAttempt.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const PurchaseAttemptSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  courseSnapshot: {
    courseId: String,
    title: String,
    price: Number,
    isFree: Boolean,
    discount: Number
  },
  provider: { type: String, enum: ['Somtel','Hormuud','Somnet','Other'], default: 'Other' },
  enteredPhoneNumber: { type: String },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['checking','verified','unproven'], default: 'checking' },
  adminNotes: { type: String },
  verifiedAt: { type: Date },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('PurchaseAttempt', PurchaseAttemptSchema);
