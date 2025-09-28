// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const PermissionSchema = new mongoose.Schema({
  moveStudents: { type: Boolean, default: false },
  // add other feature flags you may want in future:
  // manageAttendance: { type: Boolean, default: false },
  // manageExams: { type: Boolean, default: false }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  fullname: { type: String, required: true, trim: true },
  email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
  phone: { type: String, trim: true, default: '' },
  role: { type: String, enum: ['admin','manager','teacher','student','testuser'], required: true },
  passwordHash: { type: String, required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
  permissions: { type: PermissionSchema, default: () => ({}) },
  suspended: { type: Boolean, default:false },
  warned: { type: Boolean, default:false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true, transform(doc, ret) {
    // hide sensitive fields
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }},
  toObject: { virtuals: true }
});

// text index for searching
UserSchema.index({ fullname: "text", email: "text" });

// update updatedAt before save
UserSchema.pre('save', function(next){
  this.updatedAt = new Date();
  if(this.email) this.email = String(this.email).toLowerCase();
  next();
});

// password helpers
UserSchema.methods.setPassword = async function(plain) {
  const saltRounds = Number(process.env.BCRYPT_ROUNDS || 10);
  this.passwordHash = await bcrypt.hash(String(plain || ''), saltRounds);
  return this.passwordHash;
};

UserSchema.methods.validatePassword = async function(plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(String(plain || ''), this.passwordHash);
};

// static helper to create a user safely
UserSchema.statics.createUser = async function({ fullname, email, phone, role, password, schoolId, permissions }) {
  const User = this;
  const user = new User({
    fullname, email: email ? String(email).toLowerCase() : undefined,
    phone, role, schoolId: schoolId || null, permissions: permissions || {}
  });
  await user.setPassword(password || Math.random().toString(36).slice(2,10));
  await user.save();
  return user;
};

module.exports = mongoose.model('User', UserSchema);
