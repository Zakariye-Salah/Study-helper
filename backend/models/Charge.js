// backend/models/Charge.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChargeSchema = new Schema({
  personType: { type: String, enum: ['student','teacher'], required: true },
  personId: { type: Schema.Types.ObjectId, required: true, refPath: 'personType' },
  amount: { type: Number, required: true },
  description: { type: String },
  appliedAt: { type: Date, default: Date.now },
  recurringId: { type: Schema.Types.ObjectId, ref: 'RecurringCharge', default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null }
});

module.exports = mongoose.model('Charge', ChargeSchema);
