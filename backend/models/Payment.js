// backend/models/Payment.js
const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  personType: { type: String, required: true, enum: ['student','teacher'] },
  personId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  amount: { type: Number, required: true },
  paymentType: { type: String, required: true }, // could be PaymentType.key or 'monthly' etc
  months: [{ type: Number }], // 1-12 for monthly payments
  note: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String }, // denormalized for easy display
  idempotencyKey: { type: String, index: true, sparse: true, unique: false },
  createdAt: { type: Date, default: Date.now }
});

// index for quick lookups by person
PaymentSchema.index({ personType: 1, personId: 1, createdAt: -1 });
module.exports = mongoose.model('Payment', PaymentSchema);
