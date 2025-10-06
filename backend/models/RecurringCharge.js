// backend/models/RecurringCharge.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RecurringChargeSchema = new Schema({
  personType: { type: String, enum: ['student','teacher'], required: true },
  personId: { type: Schema.Types.ObjectId, required: true, refPath: 'personType' },
  amount: { type: Number, required: true, default: 0 },
  dayOfMonth: { type: Number, required: true, min: 1, max: 31 }, // 1..31, we map > days->last day of month
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },
  active: { type: Boolean, default: true },
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', index: true, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RecurringCharge', RecurringChargeSchema);
