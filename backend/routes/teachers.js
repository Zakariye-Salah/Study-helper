// // backend/routes/teachers.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');
// const auth = require('../middleware/auth');
// const crypto = require('crypto');
// const bcrypt = require('bcrypt');
// const roles = require('../middleware/roles');
// const Teacher = require('../models/Teacher');
// let Payment;
// try { Payment = require('../models/Payment'); } catch (e) { Payment = null; console.warn('Payment model not available for teachers route:', e.message); }
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

// const uploadDir = path.join(__dirname, '..', 'uploads');
// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, uploadDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname || '');
//     cb(null, 'teacher-' + Date.now() + ext);
//   }
// });
// const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// // helper to generate teacher numberId per day
// async function generateTeacherNumberId(schoolId) {
//   const now = new Date();
//   const dd = String(now.getDate()).padStart(2,'0');
//   const mm = String(now.getMonth()+1).padStart(2,'0');
//   const prefix = `TCH${dd}${mm}`;
//   const last = await Teacher.findOne({ schoolId, numberId: new RegExp(`^${prefix}`) }).sort({ createdAt: -1 }).lean();
//   if (!last || !last.numberId) return `${prefix}1`;
//   const tail = last.numberId.replace(prefix, '');
//   const seq = Number(tail) || 0;
//   return `${prefix}${seq + 1}`;
// }

// // Create teacher (admin/manager)
// router.post('/', auth, roles(['admin','manager']), upload.single('photo'), async (req,res) => {
//   try {
//     // extra defensive user state checks
//     if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

//     const body = req.body || {};
//     const { fullname, numberId, classIds = [], phone, password, salary, subjectIds = [] } = body;
//     if (!fullname) return res.status(400).json({ message: 'fullname required' });

//     let finalNumberId = numberId && String(numberId).trim() ? String(numberId).trim() : undefined;
//     if (!finalNumberId) {
//       finalNumberId = await generateTeacherNumberId(req.user.schoolId);
//     } else {
//       const qExist = { numberId: finalNumberId, createdBy: req.user._id };
//       const existing = await Teacher.findOne(qExist);
//       if (existing) return res.status(400).json({ message: 'numberId exists for your account' });
//     }

//     const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
//     const photoFile = req.file ? req.file.filename : undefined;

//     const t = new Teacher({
//       fullname,
//       numberId: finalNumberId,
//       classIds: Array.isArray(classIds) ? classIds : (classIds ? [classIds] : []),
//       subjectIds: Array.isArray(subjectIds) ? subjectIds : (subjectIds ? [subjectIds] : []),
//       phone,
//       salary: salary ? Number(salary) : 0,
//       passwordHash,
//       photo: photoFile,
//       schoolId: req.user.schoolId,
//       createdBy: req.user._id
//     });

//     await t.save();

//     const ret = await Teacher.findById(t._id).populate('classIds','name classId').populate('subjectIds','name subjectId').lean();
//     if (ret.photo) ret.photoUrl = `/uploads/${ret.photo}`;
//     res.json(ret);
//   } catch (err) {
//     console.error('POST /teachers error:', err && err.stack ? err.stack : err);
//     if (err && err.code === 11000) return res.status(400).json({ message: 'Duplicate key', detail: err.keyValue });
//     res.status(500).json({ message: 'Server error', err: err && err.message ? err.message : String(err) });
//   }
// });

// // List teachers (owner-only). Teachers see only themselves.
// // router.get('/', auth, roles(['admin','manager','teacher']), async (req,res) => {
// //   try {
// //     if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

// //     const { search = '', page = 1, limit = 50 } = req.query;
// //     const p = Math.max(1, parseInt(page || 1, 10));
// //     const l = Math.max(1, Math.min(500, parseInt(limit || 50, 10)));
// //     const q = { deleted: { $ne: true } }; // exclude soft deleted
// //     if (search) q.$or = [{ fullname: new RegExp(search, 'i') }, { numberId: new RegExp(search, 'i') }];

// //     if (req.user.role === 'teacher') {
// //       q._id = req.user._id;
// //     } else {
// //       q.createdBy = req.user._id;
// //     }

// //     const items = await Teacher.find(q)
// //       .limit(l)
// //       .skip((p - 1) * l)
// //       .sort({ createdAt: -1 })
// //       .populate('classIds', 'name classId')
// //       .populate('subjectIds', 'name subjectId')
// //       .lean();

// //     // compute paid amounts defensively (if Payment model exists)
// //     let sums = [];
// //     try {
// //       if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
// //         const ids = items.map(i => new mongoose.Types.ObjectId(String(i._id)));
// //         sums = await Payment.aggregate([
// //           { $match: { personType: 'teacher', personId: { $in: ids } } },
// //           { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
// //         ]);
// //       }
// //     } catch (eAgg) {
// //       console.error('Payment aggregation error (GET /teachers):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
// //       sums = [];
// //     }

// //     const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
// //     items.forEach(it => {
// //       if (it.photo) it.photoUrl = `/uploads/${it.photo}`;
// //       it.paidAmount = Number(paidMap.get(String(it._id)) || 0);
// //       it.totalDue = Number(it.totalDue || it.salary || 0);
// //     });

// //     const total = await Teacher.countDocuments(q);
// //     res.json({ items, total });
// //   } catch (err) {
// //     console.error('GET /teachers error:', err && err.stack ? err.stack : err);
// //     res.status(500).json({ message: 'Server error' });
// //   }
// // });

// // List teachers (owner-only). Teachers see only themselves.
// router.get('/', auth, roles(['admin','manager','teacher']), async (req,res) => {
//   try {
//     if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

//     const { search = '', page = 1, limit = 50 } = req.query;
//     const p = Math.max(1, parseInt(page || 1, 10));
//     const l = Math.max(1, Math.min(500, parseInt(limit || 50, 10)));
//     const q = { deleted: { $ne: true } }; // exclude soft deleted
//     if (search) q.$or = [{ fullname: new RegExp(search, 'i') }, { numberId: new RegExp(search, 'i') }];

//     // Visibility rules:
//     // - teacher role: only their own record
//     // - manager role: only teachers they created
//     // - admin role: see all (no additional filter)
//     if (req.user.role === 'teacher') {
//       q._id = req.user._id;
//     } else if (req.user.role === 'manager') {
//       q.createdBy = req.user._id;
//     } // admin: no extra filter

//     const items = await Teacher.find(q)
//       .limit(l)
//       .skip((p - 1) * l)
//       .sort({ createdAt: -1 })
//       .populate('classIds', 'name classId')
//       .populate('subjectIds', 'name subjectId')
//       .lean();

//     // compute paid amounts defensively (if Payment model exists)
//     let sums = [];
//     try {
//       if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
//         const ids = items.map(i => new mongoose.Types.ObjectId(String(i._id)));
//         sums = await Payment.aggregate([
//           { $match: { personType: 'teacher', personId: { $in: ids } } },
//           { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
//         ]);
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /teachers):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//       sums = [];
//     }

//     const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
//     items.forEach(it => {
//       if (it.photo) it.photoUrl = `/uploads/${it.photo}`;
//       it.paidAmount = Number(paidMap.get(String(it._id)) || 0);
//       it.totalDue = Number(it.totalDue || it.salary || 0);
//     });

//     const total = await Teacher.countDocuments(q);
//     res.json({ items, total });
//   } catch (err) {
//     console.error('GET /teachers error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });
 



// // GET single teacher details (with paid amount)
// router.get('/:id', auth, roles(['admin','manager','teacher']), async (req, res) => {
//   try {
//     if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid id' });

//     const teacher = await Teacher.findById(id).populate('classIds', 'name classId').populate('subjectIds','name subjectId').lean();
//     if (!teacher || teacher.deleted) return res.status(404).json({ message: 'Teacher not found' });

//     // visibility: teacher himself only or creator/admin/manager per your roles middleware
//     if (req.user.role === 'teacher' && String(req.user._id) !== String(teacher._id)) {
//       return res.status(403).json({ message: 'Forbidden' });
//     }

//     let paid = 0;
//     try {
//       if (Payment && typeof Payment.aggregate === 'function') {
//         const agg = await Payment.aggregate([
//           { $match: { personType: 'teacher', personId: new mongoose.Types.ObjectId(String(id)) } },
//           { $group: { _id: null, paid: { $sum: '$amount' } } }
//         ]);
//         paid = (agg[0] && agg[0].paid) || 0;
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /teachers/:id):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//       paid = 0;
//     }

//     teacher.paidAmount = Number(paid);
//     teacher.totalDue = Number(teacher.totalDue || teacher.salary || 0);
//     if (teacher.photo) teacher.photoUrl = `/uploads/${teacher.photo}`;
//     return res.json({ teacher });
//   } catch (err) {
//     console.error('GET /teachers/:id error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Update teacher (owner-only)
// router.put('/:id', auth, roles(['admin','manager']), upload.single('photo'), async (req,res) => {
//   try {
//     if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid id' });

//     const doc = await Teacher.findById(id);
//     if (!doc || doc.deleted) return res.status(404).json({ message: 'Teacher not found' });

 
// // Ownership rules: admin may edit any teacher; manager may edit only those they created
// if (req.user.role === 'manager' && String(doc.createdBy) !== String(req.user._id)) {
//   return res.status(403).json({ message: 'Forbidden' });
// }
// // admins are allowed to update any teacher record
//     const update = { ...(req.body || {}) };
//     if (update.password) {
//       update.passwordHash = await bcrypt.hash(update.password, 10);
//       delete update.password;
//     }
//     if (update.classIds && !Array.isArray(update.classIds)) update.classIds = [update.classIds];
//     if (update.subjectIds && !Array.isArray(update.subjectIds)) update.subjectIds = [update.subjectIds];
//     if (req.file) update.photo = req.file.filename;
//     if (typeof update.salary !== 'undefined') update.salary = Number(update.salary);

//     const t = await Teacher.findByIdAndUpdate(id, update, { new: true }).populate('classIds','name classId').populate('subjectIds','name subjectId').lean();
//     if (t && t.photo) t.photoUrl = `/uploads/${t.photo}`;
//     res.json(t);
//   } catch (err) {
//     console.error('PUT /teachers/:id error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Delete teacher (soft-delete)
// router.delete('/:id', auth, roles(['admin','manager']), async (req,res) => {
//   try {
//     if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid id' });

//     const doc = await Teacher.findById(id);
//     if (!doc) return res.json({ ok: true });

//     if (doc.deleted) return res.json({ ok:true, alreadyDeleted:true });

//     if (req.user.role === 'manager' && String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

//     doc.deleted = true;
//     doc.deletedAt = new Date();
//     doc.deletedBy = {
//       id: req.user._id,
//       role: req.user.role,
//       name: (req.user.fullname || req.user.name || '')
//     };

//     await doc.save();
//     res.json({ ok: true, deleted: 'soft' });
//   } catch (err) {
//     console.error('DELETE /teachers/:id error (soft-delete):', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // -----------------------
// // Reset password (admin/manager) for teacher
// // -----------------------
// router.post('/:id/reset-password', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const teacher = await Teacher.findById(id);
//     if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

//     // manager can only act on teachers they created
//     if (req.user.role === 'manager' && String(teacher.createdBy) !== String(req.user._id)) {
//       return res.status(403).json({ message: 'Forbidden' });
//     }

//     const len = Math.max(8, Math.min(24, parseInt(req.body.length || 10, 10)));
//     let temp = crypto.randomBytes(Math.ceil(len * 0.75)).toString('base64').replace(/[+/=]/g, '').slice(0, len);
//     if (!/[0-9]/.test(temp)) temp = temp.slice(0, -1) + Math.floor(Math.random()*10);
//     if (!/[a-zA-Z]/.test(temp)) temp = temp.slice(0, -1) + 'A';

//     const hash = await bcrypt.hash(temp, 10);
//     teacher.passwordHash = hash;
//     teacher.mustChangePassword = true;
//     await teacher.save();

//     return res.json({ ok: true, tempPassword: temp, message: 'Temporary password generated — return it once to the caller.' });
//   } catch (err) {
//     console.error('POST /teachers/:id/reset-password error', err && err.stack ? err.stack : err);
//     return res.status(500).json({ message: 'Server error' });
//   }
// });

// // -----------------------
// // Change password (self or admin/manager) for teacher
// // -----------------------
// router.post('/:id/change-password', auth, roles(['admin','manager','teacher']), async (req, res) => {
//   try {
//     if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const { currentPassword, newPassword } = req.body || {};
//     if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ message: 'New password required (min 6 chars)' });

//     const teacher = await Teacher.findById(id);
//     if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

//     // teacher changing own password must provide currentPassword
//     if (req.user.role === 'teacher') {
//       if (String(req.user._id) !== String(teacher._id)) return res.status(403).json({ message: 'Forbidden' });
//       if (!currentPassword) return res.status(400).json({ message: 'Current password required' });
//       const match = teacher.passwordHash ? await bcrypt.compare(currentPassword, teacher.passwordHash) : false;
//       if (!match) return res.status(400).json({ message: 'Current password is incorrect' });
//       teacher.passwordHash = await bcrypt.hash(newPassword, 10);
//       teacher.mustChangePassword = false;
//       await teacher.save();
//       return res.json({ ok: true, message: 'Password changed' });
//     }

//     // admin/manager may change without current password; manager limited to own created records
//     if (['admin','manager'].includes(req.user.role)) {
//       if (req.user.role === 'manager' && String(teacher.createdBy) !== String(req.user._id)) {
//         return res.status(403).json({ message: 'Forbidden' });
//       }
//       teacher.passwordHash = await bcrypt.hash(newPassword, 10);
//       teacher.mustChangePassword = false;
//       await teacher.save();
//       return res.json({ ok: true, message: 'Password updated by admin/manager' });
//     }

//     return res.status(403).json({ message: 'Forbidden' });
//   } catch (err) {
//     console.error('POST /teachers/:id/change-password error', err && (err.stack || err));
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;





// // backend/routes/teachers.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');
// const auth = require('../middleware/auth');
// const roles = require('../middleware/roles');
// const Teacher = require('../models/Teacher');
// let Payment;
// try { Payment = require('../models/Payment'); } catch (e) { Payment = null; console.warn('Payment model not available for teachers route:', e.message); }
// const bcrypt = require('bcrypt');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

// const uploadDir = path.join(__dirname, '..', 'uploads');
// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, uploadDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname || '');
//     cb(null, 'teacher-' + Date.now() + ext);
//   }
// });
// const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// // helper to generate teacher numberId per day
// async function generateTeacherNumberId(schoolId) {
//   const now = new Date();
//   const dd = String(now.getDate()).padStart(2,'0');
//   const mm = String(now.getMonth()+1).padStart(2,'0');
//   const prefix = `TCH${dd}${mm}`;
//   const last = await Teacher.findOne({ schoolId, numberId: new RegExp(`^${prefix}`) }).sort({ createdAt: -1 }).lean();
//   if (!last || !last.numberId) return `${prefix}1`;
//   const tail = last.numberId.replace(prefix, '');
//   const seq = Number(tail) || 0;
//   return `${prefix}${seq + 1}`;
// }

// // Create teacher (admin/manager)
// router.post('/', auth, roles(['admin','manager']), upload.single('photo'), async (req,res) => {
//   try {
//     const body = req.body || {};
//     const { fullname, numberId, classIds = [], phone, password, salary, subjectIds = [] } = body;
//     if (!fullname) return res.status(400).json({ message: 'fullname required' });

//     let finalNumberId = numberId && String(numberId).trim() ? String(numberId).trim() : undefined;
//     if (!finalNumberId) {
//       finalNumberId = await generateTeacherNumberId(req.user.schoolId);
//     } else {
//       const qExist = { numberId: finalNumberId, createdBy: req.user._id, deleted: { $ne: true } };
//       const existing = await Teacher.findOne(qExist);
//       if (existing) return res.status(400).json({ message: 'numberId exists for your account' });
//     }

//     const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
//     const photoFile = req.file ? req.file.filename : undefined;

//     const t = new Teacher({
//       fullname,
//       numberId: finalNumberId,
//       classIds: Array.isArray(classIds) ? classIds : (classIds ? [classIds] : []),
//       subjectIds: Array.isArray(subjectIds) ? subjectIds : (subjectIds ? [subjectIds] : []),
//       phone,
//       salary: salary ? Number(salary) : 0,
//       passwordHash,
//       photo: photoFile,
//       schoolId: req.user.schoolId,
//       createdBy: req.user._id,
//       deleted: false
//     });

//     await t.save();

//     // return populated minimal info
//     const ret = await Teacher.findById(t._id).populate('classIds','name classId').populate('subjectIds','name subjectId').lean();
//     if (ret.photo) ret.photoUrl = `/uploads/${ret.photo}`;
//     res.json(ret);
//   } catch (err) {
//     console.error('POST /teachers error:', err && err.stack ? err.stack : err);
//     if (err && err.code === 11000) return res.status(400).json({ message: 'Duplicate key', detail: err.keyValue });
//     res.status(500).json({ message: 'Server error', err: err && err.message ? err.message : String(err) });
//   }
// });

// // List teachers (owner-only). Teachers see only themselves.
// router.get('/', auth, roles(['admin','manager','teacher']), async (req,res) => {
//   try {
//     const { search = '', page = 1, limit = 50 } = req.query;
//     const p = Math.max(1, parseInt(page || 1, 10));
//     const l = Math.max(1, Math.min(500, parseInt(limit || 50, 10)));
//     const q = { deleted: { $ne: true } }; // exclude soft-deleted
//     if (search) q.$or = [{ fullname: new RegExp(search, 'i') }, { numberId: new RegExp(search, 'i') }];

//     if (req.user.role === 'teacher') {
//       q._id = req.user._id;
//     } else {
//       q.createdBy = req.user._id;
//     }

//     const items = await Teacher.find(q)
//       .limit(l)
//       .skip((p - 1) * l)
//       .sort({ createdAt: -1 })
//       .populate('classIds', 'name classId')
//       .populate('subjectIds', 'name subjectId')
//       .lean();

//     // compute paid amounts defensively (if Payment model exists)
//     let sums = [];
//     try {
//       if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
//         // convert ids to ObjectId instances
//         const ids = items.map(i => new mongoose.Types.ObjectId(String(i._id)));
//         sums = await Payment.aggregate([
//           { $match: { personType: 'teacher', personId: { $in: ids } } },
//           { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
//         ]);
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /teachers):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//       sums = [];
//     }

//     const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
//     items.forEach(it => {
//       if (it.photo) it.photoUrl = `/uploads/${it.photo}`;
//       it.paidAmount = Number(paidMap.get(String(it._id)) || 0);
//       it.totalDue = Number(it.totalDue || it.salary || 0);
//     });

//     const total = await Teacher.countDocuments(q);
//     res.json({ items, total });
//   } catch (err) {
//     console.error('GET /teachers error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // GET single teacher details (with paid amount) - add if not present
// router.get('/:id', auth, roles(['admin','manager','teacher']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid id' });

//     const teacher = await Teacher.findById(id).populate('classIds', 'name classId').populate('subjectIds','name subjectId').lean();
//     if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

//     // hide soft-deleted teachers (unless admin wants direct DB access)
//     if (teacher.deleted) {
//       if (!req.user || String((req.user.role || '').toLowerCase()) !== 'admin') {
//         return res.status(404).json({ message: 'Teacher not found' });
//       }
//     }

//     // compute paid amount defensively
//     let paid = 0;
//     try {
//       if (Payment && typeof Payment.aggregate === 'function') {
//         const agg = await Payment.aggregate([
//           { $match: { personType: 'teacher', personId: new mongoose.Types.ObjectId(String(id)) } },
//           { $group: { _id: null, paid: { $sum: '$amount' } } }
//         ]);
//         paid = (agg[0] && agg[0].paid) || 0;
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /teachers/:id):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//       paid = 0;
//     }

//     teacher.paidAmount = Number(paid);
//     teacher.totalDue = Number(teacher.totalDue || teacher.salary || 0);
//     if (teacher.photo) teacher.photoUrl = `/uploads/${teacher.photo}`;
//     return res.json({ teacher });
//   } catch (err) {
//     console.error('GET /teachers/:id error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Update teacher (owner-only)
// router.put('/:id', auth, roles(['admin','manager']), upload.single('photo'), async (req,res) => {
//   try {
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid id' });

//     const doc = await Teacher.findById(id);
//     if (!doc) return res.status(404).json({ message: 'Teacher not found' });

//     // owner check
//     if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

//     const update = { ...(req.body || {}) };
//     if (update.password) {
//       update.passwordHash = await bcrypt.hash(update.password, 10);
//       delete update.password;
//     }
//     if (update.classIds && !Array.isArray(update.classIds)) update.classIds = [update.classIds];
//     if (update.subjectIds && !Array.isArray(update.subjectIds)) update.subjectIds = [update.subjectIds];
//     if (req.file) update.photo = req.file.filename;
//     if (typeof update.salary !== 'undefined') update.salary = Number(update.salary);

//     const t = await Teacher.findByIdAndUpdate(id, update, { new: true }).populate('classIds','name classId').populate('subjectIds','name subjectId').lean();
//     if (t.photo) t.photoUrl = `/uploads/${t.photo}`;
//     res.json(t);
//   } catch (err) {
//     console.error('PUT /teachers/:id error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Delete teacher (owner-only) - now soft-delete by default
// router.delete('/:id', auth, roles(['admin','manager']), async (req,res) => {
//   try {
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid id' });

//     const doc = await Teacher.findById(id);
//     if (!doc) return res.json({ ok: true });

//     if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

//     const wantPermanent = (req.query.permanent === 'true') || (req.body && req.body.permanent === true);
//     if (wantPermanent) {
//       // only admin allowed to permanently delete
//       if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admin can permanently delete' });
//       await Teacher.findByIdAndDelete(id);
//       // cleanup payment entries if needed
//       if (Payment) {
//         try {
//           const pid = mongoose.Types.ObjectId.isValid(String(id)) ? mongoose.Types.ObjectId(String(id)) : null;
//           if (pid) await Payment.deleteMany({ personType: 'teacher', personId: pid });
//           else await Payment.deleteMany({ personType: 'teacher', personId: String(id) });
//         } catch (e) {
//           console.warn('Payment cleanup failed after deleting teacher', id, e && (e.stack || e));
//         }
//       }
//       return res.json({ ok: true, deleted: 'permanent' });
//     }

//     // soft-delete
//     doc.deleted = true;
//     doc.deletedAt = new Date();
//     doc.deletedBy = { id: req.user._id, role: req.user.role, name: req.user.fullname || '' };
//     await doc.save();
//     res.json({ ok: true, deleted: 'soft' });
//   } catch (err) {
//     console.error('DELETE /teachers/:id error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;

// backend/routes/teachers.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const Teacher = require('../models/Teacher');
let Payment;
try { Payment = require('../models/Payment'); } catch (e) { Payment = null; console.warn('Payment model not available for teachers route:', e.message); }
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const TEACHERS_DIR = path.join(UPLOADS_ROOT, 'teachers');

// ensure directory
try { if (!fs.existsSync(TEACHERS_DIR)) fs.mkdirSync(TEACHERS_DIR, { recursive: true }); } catch (e) { console.warn('mkdir teachers uploads failed', e && e.message); }

// multer storage (teachers folder)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEACHERS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `teacher-${unique}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req,file,cb) => {
    const ok = /image\/(png|jpe?g|webp|gif)/i.test(file.mimetype);
    cb(null, ok);
  }
});

async function deleteLocalFileIfExists(relOrFullPath) {
  try {
    if (!relOrFullPath) return;
    let full = relOrFullPath;
    if (!path.isAbsolute(full)) full = path.join(UPLOADS_ROOT, String(relOrFullPath).replace(/^\/+/, ''));
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      console.log('Deleted file', full);
    }
  } catch (e) { console.warn('deleteLocalFileIfExists failed', e && e.message); }
}

// helper to generate teacher numberId per day
async function generateTeacherNumberId(schoolId) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2,'0');
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const prefix = `TCH${dd}${mm}`;
  const last = await Teacher.findOne({ schoolId, numberId: new RegExp(`^${prefix}`) }).sort({ createdAt: -1 }).lean();
  if (!last || !last.numberId) return `${prefix}1`;
  const tail = last.numberId.replace(prefix, '');
  const seq = Number(tail) || 0;
  return `${prefix}${seq + 1}`;
}

// Create teacher (admin/manager)
router.post('/', auth, roles(['admin','manager']), (req, res) => {
  upload.single('photo')(req, res, async function (err) {
    if (err) {
      console.error('Multer error (POST /teachers):', err);
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB' });
      return res.status(400).json({ message: 'File upload error', detail: err.message });
    }
    try {
      const body = req.body || {};
      const { fullname, numberId, classIds = [], phone, password, salary, subjectIds = [] } = body;
      if (!fullname) {
        if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
        return res.status(400).json({ message: 'fullname required' });
      }

      let finalNumberId = numberId && String(numberId).trim() ? String(numberId).trim() : undefined;
      if (!finalNumberId) {
        finalNumberId = await generateTeacherNumberId(req.user.schoolId);
      } else {
        const qExist = { numberId: finalNumberId, createdBy: req.user._id, deleted: { $ne: true } };
        const existing = await Teacher.findOne(qExist).lean();
        if (existing) {
          if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
          return res.status(400).json({ message: 'numberId exists for your account' });
        }
      }

      const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
      const photoFile = req.file ? `teachers/${req.file.filename}` : undefined;

      const t = new Teacher({
        fullname,
        numberId: finalNumberId,
        classIds: Array.isArray(classIds) ? classIds : (classIds ? [classIds] : []),
        subjectIds: Array.isArray(subjectIds) ? subjectIds : (subjectIds ? [subjectIds] : []),
        phone,
        salary: salary ? Number(salary) : 0,
        passwordHash,
        photo: photoFile,
        schoolId: req.user.schoolId,
        createdBy: req.user._id,
        deleted: false
      });

      await t.save();

      const ret = await Teacher.findById(t._id).populate('classIds','name classId').populate('subjectIds','name subjectId').lean();
      if (ret.photo) ret.photoUrl = `/uploads/${ret.photo}`;
      res.json(ret);
    } catch (err) {
      console.error('POST /teachers error:', err && (err.stack || err));
      if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
      if (err && err.code === 11000) return res.status(400).json({ message: 'Duplicate key', detail: err.keyValue });
      res.status(500).json({ message: 'Server error', err: err && err.message ? err.message : String(err) });
    }
  });
});

// List teachers (owner-only). Teachers see only themselves.
router.get('/', auth, roles(['admin','manager','teacher']), async (req,res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const p = Math.max(1, parseInt(page || 1, 10));
    const l = Math.max(1, Math.min(500, parseInt(limit || 50, 10)));
    const q = { deleted: { $ne: true } };
    if (search) q.$or = [{ fullname: new RegExp(search, 'i') }, { numberId: new RegExp(search, 'i') }];

    if (req.user.role === 'teacher') {
      q._id = req.user._id;
    } else {
      q.createdBy = req.user._id;
    }

    const items = await Teacher.find(q)
      .limit(l)
      .skip((p - 1) * l)
      .sort({ createdAt: -1 })
      .populate('classIds', 'name classId')
      .populate('subjectIds', 'name subjectId')
      .lean();

    let sums = [];
    try {
      if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
        const ids = items.map(i => new mongoose.Types.ObjectId(String(i._id)));
        sums = await Payment.aggregate([
          { $match: { personType: 'teacher', personId: { $in: ids } } },
          { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
        ]);
      }
    } catch (eAgg) {
      console.error('Payment aggregation error (GET /teachers):', eAgg && (eAgg.stack || eAgg));
      sums = [];
    }

    const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
    items.forEach(it => {
      if (it.photo) it.photoUrl = `/uploads/${it.photo}`;
      it.paidAmount = Number(paidMap.get(String(it._id)) || 0);
      it.totalDue = Number(it.totalDue || it.salary || 0);
    });

    const total = await Teacher.countDocuments(q);
    res.json({ items, total });
  } catch (err) {
    console.error('GET /teachers error:', err && (err.stack || err));
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single teacher details (with paid amount)
router.get('/:id', auth, roles(['admin','manager','teacher']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid id' });

    const teacher = await Teacher.findById(id).populate('classIds', 'name classId').populate('subjectIds','name subjectId').lean();
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    if (teacher.deleted) {
      if (!req.user || String((req.user.role || '').toLowerCase()) !== 'admin') {
        return res.status(404).json({ message: 'Teacher not found' });
      }
    }

    let paid = 0;
    try {
      if (Payment && typeof Payment.aggregate === 'function') {
        const agg = await Payment.aggregate([
          { $match: { personType: 'teacher', personId: new mongoose.Types.ObjectId(String(id)) } },
          { $group: { _id: null, paid: { $sum: '$amount' } } }
        ]);
        paid = (agg[0] && agg[0].paid) || 0;
      }
    } catch (eAgg) {
      console.error('Payment aggregation error (GET /teachers/:id):', eAgg && (eAgg.stack || eAgg));
      paid = 0;
    }

    teacher.paidAmount = Number(paid);
    teacher.totalDue = Number(teacher.totalDue || teacher.salary || 0);
    if (teacher.photo) teacher.photoUrl = `/uploads/${teacher.photo}`;
    return res.json({ teacher });
  } catch (err) {
    console.error('GET /teachers/:id error:', err && (err.stack || err));
    res.status(500).json({ message: 'Server error' });
  }
});

// Update teacher (admin or creator for manager)
router.put('/:id', auth, roles(['admin','manager']), (req, res) => {
  upload.single('photo')(req, res, async function (err) {
    if (err) {
      console.error('Multer error (PUT /teachers/:id):', err);
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB' });
      return res.status(400).json({ message: 'File upload error', detail: err.message });
    }
    try {
      const id = req.params.id;
      if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
        return res.status(400).json({ message: 'Invalid id' });
      }

      const doc = await Teacher.findById(id);
      if (!doc) {
        if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
        return res.status(404).json({ message: 'Teacher not found' });
      }

      if (req.user.role === 'manager' && String(doc.createdBy) !== String(req.user._id)) {
        if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
        return res.status(403).json({ message: 'Forbidden' });
      }

      const update = { ...(req.body || {}) };
      if (update.password) {
        update.passwordHash = await bcrypt.hash(update.password, 10);
        delete update.password;
      }
      if (update.classIds && !Array.isArray(update.classIds)) update.classIds = [update.classIds];
      if (update.subjectIds && !Array.isArray(update.subjectIds)) update.subjectIds = [update.subjectIds];

      if (req.file) {
        // store relative path like 'teachers/<filename>'
        update.photo = `teachers/${req.file.filename}`;
      }

      if (typeof update.salary !== 'undefined') update.salary = Number(update.salary);

      // delete old local photo if replaced
      if (update.photo && doc.photo && typeof doc.photo === 'string' && doc.photo.startsWith('teachers/')) {
        await deleteLocalFileIfExists(doc.photo);
      }

      const t = await Teacher.findByIdAndUpdate(id, update, { new: true }).populate('classIds','name classId').populate('subjectIds','name subjectId').lean();
      if (t.photo) t.photoUrl = `/uploads/${t.photo}`;
      res.json(t);
    } catch (err) {
      console.error('PUT /teachers/:id error:', err && (err.stack || err));
      if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
      res.status(500).json({ message: 'Server error' });
    }
  });
});

// Delete teacher (soft or permanent)
router.delete('/:id', auth, roles(['admin','manager']), async (req,res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid id' });

    const doc = await Teacher.findById(id);
    if (!doc) return res.json({ ok: true });

    if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

    const wantPermanent = (req.query.permanent === 'true') || (req.body && req.body.permanent === true);
    if (wantPermanent) {
      if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admin can permanently delete' });

      await Teacher.findByIdAndDelete(id).catch(()=>{});

      if (Payment) {
        try {
          const pid = mongoose.Types.ObjectId.isValid(String(id)) ? mongoose.Types.ObjectId(String(id)) : null;
          if (pid) await Payment.deleteMany({ personType: 'teacher', personId: pid });
          else await Payment.deleteMany({ personType: 'teacher', personId: String(id) });
        } catch (e) {
          console.warn('Payment cleanup failed after deleting teacher', id, e && (e.stack || e));
        }
      }

      // delete local photo if present
      try { if (doc.photo && doc.photo.startsWith('teachers/')) await deleteLocalFileIfExists(doc.photo); } catch(e){}

      return res.json({ ok: true, deleted: 'permanent' });
    }

    doc.deleted = true;
    doc.deletedAt = new Date();
    doc.deletedBy = { id: req.user._id, role: req.user.role, name: req.user.fullname || '' };
    await doc.save();
    res.json({ ok: true, deleted: 'soft' });
  } catch (err) {
    console.error('DELETE /teachers/:id error:', err && (err.stack || err));
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
