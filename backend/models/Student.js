// // backend/models/Student.js
// const mongoose = require('mongoose');

// const StudentSchema = new mongoose.Schema({
//   fullname: { type: String, required: true, trim: true },
//   numberId: { type: String, trim: true }, // uniqueness enforced per-school with compound index
//   classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
//   parentName: { type: String, trim: true },
//   parentPhone: { type: String, trim: true },
//   phone: { type: String, trim: true },
//   passwordHash: { type: String },
//   fee: { type: Number, default: 0 },
//   paidAmount: { type: Number, default: 0 },
//   status: { type: String, enum: ['free','unpaid','partial','paid'], default: 'unpaid' },
//   subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
//   photo: { type: String }, // filename
//   schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now },

//   // soft-delete metadata
//   deleted: { type: Boolean, default: false },
//   deletedAt: { type: Date, default: null },
//   deletedBy: {
//     id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
//     role: { type: String, default: null },
//     name: { type: String, default: null }
//   },

//   // optional: mustChangePassword flag used earlier
//   mustChangePassword: { type: Boolean, default: false }
// });

// StudentSchema.index({ numberId: 1, schoolId: 1 }, { unique: true, partialFilterExpression: { numberId: { $exists: true } } });

// StudentSchema.pre('save', function(next){
//   this.updatedAt = new Date();
//   next();
// });

// module.exports = mongoose.model('Student', StudentSchema);


// backend/models/Student.js
const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  fullname: { type: String, required: true, trim: true },
  numberId: { type: String, trim: true }, // uniqueness enforced per-school with compound index
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  parentName: { type: String, trim: true },
  parentPhone: { type: String, trim: true },
  phone: { type: String, trim: true },

  // persistable date of birth
  birthdate: { type: Date, default: null },

  passwordHash: { type: String },
  fee: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['free','unpaid','partial','paid'], default: 'unpaid' },
  subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  photo: { type: String }, // filename (relative under uploads/)
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },

  // soft-delete metadata
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: null },
    name: { type: String, default: null }
  },

  // optional: mustChangePassword flag used earlier
  mustChangePassword: { type: Boolean, default: false }
});

// compound unique index per school for numberId (partial)
StudentSchema.index({ numberId: 1, schoolId: 1 }, { unique: true, partialFilterExpression: { numberId: { $exists: true } } });

StudentSchema.pre('save', function(next){
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Student', StudentSchema);
