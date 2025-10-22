// // backend/models/Class.js
// const mongoose = require('mongoose');

// const ClassSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   classId: { type: String, trim: true }, // optional; unique per school if present
//   subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
//   schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now },

//   // soft-delete metadata (for recycle bin)
//   deleted: { type: Boolean, default: false },
//   deletedAt: { type: Date, default: null },
//   deletedBy: {
//     id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
//     role: { type: String, default: null },
//     name: { type: String, default: null }
//   }
// }, {
//   toJSON: { virtuals: true },
//   toObject: { virtuals: true }
// });

// // Text index for search on name
// ClassSchema.index({ name: 'text' });

// // Unique classId per school (only if classId provided)
// ClassSchema.index(
//   { classId: 1, schoolId: 1 },
//   { unique: true, partialFilterExpression: { classId: { $exists: true, $ne: "" } } }
// );

// ClassSchema.pre('save', function(next){
//   this.updatedAt = new Date();
//   next();
// });

// module.exports = mongoose.model('Class', ClassSchema);


// backend/models/Class.js
const mongoose = require('mongoose');

const TimetablePeriodSchema = new mongoose.Schema({
  label: { type: String, default: '' },
  time: { type: String, default: '' },
  // store cells as object keyed by day index (0,1,2...) or simple object
  // we store as array of objects keyed by day index for ease
  cells: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const TimetableSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  days: { type: [String], default: [] },
  periods: { type: [TimetablePeriodSchema], default: [] },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const ClassSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  classId: { type: String, trim: true },
  subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },

  // **New timetable subdocument**
  timetable: { type: TimetableSchema, default: null },

  // soft-delete metadata
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: null },
    name: { type: String, default: null }
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

ClassSchema.index({ name: 'text' });

ClassSchema.index(
  { classId: 1, schoolId: 1 },
  { unique: true, partialFilterExpression: { classId: { $exists: true, $ne: "" } } }
);

ClassSchema.pre('save', function(next){
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Class', ClassSchema);
 
