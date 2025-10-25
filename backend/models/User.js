// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const PermissionSchema = new mongoose.Schema({
  moveStudents: { type: Boolean, default: false }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  fullname: { type: String, required: true, trim: true },
  email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
  phone: { type: String, trim: true, default: '' },
  role: { type: String, enum: ['admin','manager','teacher','student','testuser'], required: true, lowercase: true },
  passwordHash: { type: String, required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
  permissions: { type: PermissionSchema, default: () => ({}) },
  suspended: { type: Boolean, default: false }, // existing
  warned: { type: Boolean, default: false },
  // new: account disabled (for soft-delete flows)
  disabled: { type: Boolean, default: false },
  disabledAt: { type: Date, default: null },
  disabledBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: '' },
    name: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  toJSON: {
    virtuals: true,
    transform(doc, ret) {
      delete ret.passwordHash;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// text index for searching
UserSchema.index({ fullname: 'text', email: 'text' });

UserSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.email) this.email = String(this.email).toLowerCase().trim();
  if (this.role) this.role = String(this.role).toLowerCase();
  next();
});

// instance methods
UserSchema.methods.setPassword = async function(password) {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  this.passwordHash = await bcrypt.hash(String(password || ''), rounds);
  return this.passwordHash;
};

UserSchema.methods.validatePassword = async function(password) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(String(password || ''), this.passwordHash);
};

// static helper to create a user safely
UserSchema.statics.createUser = async function({ fullname, email, phone, role, password, schoolId, createdBy, permissions }) {
  const User = this;
  const u = new User({
    fullname: String(fullname || '').trim(),
    email: email ? String(email).toLowerCase().trim() : undefined,
    phone: phone ? String(phone).trim() : '',
    role: String(role || 'manager').toLowerCase(),
    schoolId: schoolId || null,
    permissions: permissions || {},
    createdBy: createdBy || null
  });
  await u.setPassword(password || Math.random().toString(36).slice(2,10));
  await u.save();
  return u;
};

module.exports = mongoose.model('User', UserSchema);
