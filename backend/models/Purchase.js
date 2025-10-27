// // // backend/models/Purchase.js
// // 'use strict';
// // const mongoose = require('mongoose');

// // const purchaseSchema = new mongoose.Schema({
// //   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
// //   courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
// //   courseSnapshot: {
// //     courseId: String,
// //     title: String,
// //     price: Number
// //   },
// //   provider: { type: String, enum: ['Somtel','Hormuud','Somnet','Other'], default: 'Other' },
// //   enteredPhoneNumber: { type: String, default: '' },
// //   amount: { type: Number, default: 0 },
// //   status: { type: String, enum: ['checking','verified','unproven'], default: 'checking', index: true },
// //   adminNotes: { type: String, default: '' },
// //   verifiedAt: { type: Date, default: null },
// //   verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
// // }, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// // module.exports = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema);


// // backend/models/Purchase.js
// 'use strict';
// const mongoose = require('mongoose');

// const PurchaseSchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
//   courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
//   amount: { type: Number, required: true, default: 0 },
//   provider: { type: String, default: '' },
//   enteredPhoneNumber: { type: String, default: '' },
//   status: { type: String, default: 'checking' }, // checking|verified|unproven
//   adminNotes: { type: String, default: '' },
//   meta: { type: mongoose.Schema.Types.Mixed, default: {} }
// }, { timestamps: true });

// module.exports = mongoose.models.Purchase || mongoose.model('Purchase', PurchaseSchema);


// backend/models/Purchase.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const PurchaseSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  courseSnapshot: { type: Object, default: {} }, // title, courseIdStr, priceAtPurchase
  amountPaid: { type: Number, default: 0 },
  provider: { type: String, default: null },
  status: { type: String, enum: ['verified','revoked'], default: 'verified' },
  createdAt: { type: Date, default: Date.now },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Purchase', PurchaseSchema);
