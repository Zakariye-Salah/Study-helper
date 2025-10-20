// // backend/routes/students.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');
// const auth = require('../middleware/auth');
// const roles = require('../middleware/roles');
// const Student = require('../models/Student');

// const crypto = require('crypto');
// const bcrypt = require('bcrypt'); // require once

// let Payment;
// try { Payment = require('../models/Payment'); } catch (e) { Payment = null; console.warn('Payment model not available:', e.message); }

// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

// const uploadDir = path.join(__dirname, '..', 'uploads');
// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, uploadDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname || '');
//     cb(null, file.fieldname + '-' + Date.now() + ext);
//   }
// });
// // limit file size to 5MB
// const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// const toNum = v => (typeof v === 'number' ? v : (Number(v) || 0));

// function computeStatus(fee, paid) {
//   if (typeof fee === 'undefined') fee = 0;
//   if (typeof paid === 'undefined') paid = 0;
//   if (fee === 0) return 'free';
//   if (paid >= fee) return 'paid';
//   if (paid > 0) return 'partial';
//   return 'unpaid';
// }

// // helper to generate default numberId STD<DD><MM><seq>
// async function generateStudentNumberId(schoolId) {
//   const now = new Date();
//   const dd = String(now.getDate()).padStart(2, '0');
//   const mm = String(now.getMonth() + 1).padStart(2, '0');
//   const prefix = `STD${dd}${mm}`;
//   const last = await Student.findOne({ schoolId, numberId: new RegExp(`^${prefix}`) }).sort({ createdAt: -1 }).lean();
//   if (!last || !last.numberId) return `${prefix}1`;
//   const tail = last.numberId.replace(prefix, '');
//   const seq = Number(tail) || 0;
//   return `${prefix}${seq + 1}`;
// }

// /* -----------------------
//    Create student (admin/manager)
//    ----------------------- */
// router.post('/', auth, roles(['admin','manager']), (req, res) => {
//   // block disabled/suspended actors
//   if (req.user && (req.user.disabled || req.user.suspended)) {
//     return res.status(403).json({ message: 'Your account is not allowed to perform this action' });
//   }

//   upload.single('photo')(req, res, async function (err) {
//     if (err) {
//       console.error('Multer error (POST /students):', err);
//       if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB' });
//       return res.status(400).json({ message: 'File upload error', detail: err.message });
//     }
//     try {
//       const { fullname, numberId, classId, parentName, parentPhone, phone, password, fee } = req.body;
//       if (!fullname) return res.status(400).json({ message: 'fullname required' });

//       let finalNumberId = numberId && String(numberId).trim() ? String(numberId).trim() : undefined;
//       if (!finalNumberId) {
//         finalNumberId = await generateStudentNumberId(req.user.schoolId);
//       } else {
//         const qExist = { numberId: finalNumberId, schoolId: req.user.schoolId };
//         const exists = await Student.findOne(qExist);
//         if (exists) return res.status(400).json({ message: 'numberId exists for your school' });
//       }

//       const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
//       const photoFile = req.file ? req.file.filename : undefined;

//       const feeNum = toNum(fee);
//       const paidAmount = 0; // initial
//       const status = computeStatus(feeNum, paidAmount);

//       const s = new Student({
//         fullname,
//         numberId: finalNumberId,
//         classId: classId || undefined,
//         parentName,
//         parentPhone,
//         phone,
//         passwordHash,
//         fee: feeNum,
//         paidAmount,
//         status,
//         photo: photoFile,
//         schoolId: req.user.schoolId,
//         createdBy: req.user._id
//       });

//       await s.save();

//       const ret = s.toObject();
//       if (ret.photo) ret.photoUrl = `/uploads/${ret.photo}`;
//       res.json(ret);
//     } catch (e) {
//       console.error('POST /students error:', e && e.stack ? e.stack : e);
//       if (e && e.code === 11000) return res.status(400).json({ message: 'Duplicate', detail: e.keyValue });
//       res.status(500).json({ message: 'Server error', err: e && e.message ? e.message : String(e) });
//     }
//   });
// });

// /* -----------------------
//    List/search students
//    ----------------------- */
// router.get('/', auth, roles(['admin','manager','teacher','student','parent']), async (req, res) => {
//   try {
//     // block disabled/suspended actors
//     if (req.user && (req.user.disabled || req.user.suspended)) {
//       return res.status(403).json({ message: 'Your account is not allowed to perform this action' });
//     }

//     const { search = '', page = 1, limit = 50 } = req.query;
//     const p = Math.max(1, parseInt(page || 1, 10));
//     const l = Math.max(1, Math.min(500, parseInt(limit || 50, 10)));
//     const q = { deleted: { $ne: true } }; // exclude soft deleted

//     if (search) q.$or = [{ fullname: new RegExp(search, 'i') }, { numberId: new RegExp(search, 'i') }, { parentName: new RegExp(search, 'i') }];

//     if (req.user.role === 'student') {
//       q._id = req.user._id;
//     } else if (req.user.role === 'parent') {
//       // parent only sees their child
//       if (req.user.childId) {
//         q._id = req.user.childId;
//       } else {
//         const Parent = require('../models/Parent');
//         const pd = await Parent.findById(req.user._id).lean().catch(()=>null);
//         if (pd && pd.childStudent) q._id = pd.childStudent;
//         else return res.status(403).json({ message: 'Forbidden' });
//       }
//     } else {
//       // admin/manager/teacher scope as before
//       if (req.user.schoolId && mongoose.Types.ObjectId.isValid(String(req.user.schoolId))) {
//         q.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId));
//       } else {
//         q.createdBy = req.user._id;
//       }
//     }

//     const items = await Student.find(q)
//       .limit(l)
//       .skip((p - 1) * l)
//       .sort({ createdAt: -1 })
//       .populate({ path: 'classId', select: 'name classId' })
//       .lean();

//     // attach payment sums if Payment model exists
//     let sums = [];
//     try {
//       if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
//         const ids = items.map(i => mongoose.Types.ObjectId(i._id));
//         sums = await Payment.aggregate([
//           { $match: { personType: 'student', personId: { $in: ids } } },
//           { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
//         ]);
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /students):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//       sums = [];
//     }

//     const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
//     items.forEach(it => {
//       if (it.photo) it.photoUrl = `/uploads/${it.photo}`;
//       it.paidAmount = toNum(it.paidAmount || paidMap.get(String(it._id)));
//       it.totalDue = toNum(it.totalDue || it.fee || 0);

//       // ensure status consistent (recompute for safety)
//       it.status = computeStatus(it.fee || 0, it.paidAmount || 0);
//     });

//     const total = await Student.countDocuments(q);
//     res.json({ items, total });
//   } catch (err) {
//     console.error('GET /students error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    GET students by class (teacher/manager/admin)
//    ----------------------- */
// router.get('/class/:classId', auth, roles(['admin','manager','teacher']), async (req, res) => {
//   try {
//     // block disabled/suspended actors
//     if (req.user && (req.user.disabled || req.user.suspended)) {
//       return res.status(403).json({ message: 'Your account is not allowed to perform this action' });
//     }

//     const classId = req.params.classId;
//     if (!classId) return res.status(400).json({ message: 'classId required' });

//     if (req.user.role === 'teacher') {
//       const Teacher = require('../models/Teacher');
//       const t = await Teacher.findById(req.user._id).lean();
//       if (!t) return res.status(403).json({ message: 'Teacher not found' });
//       const allowed = (t.classIds || []).map(x => String(x));
//       if (!allowed.includes(String(classId))) return res.status(403).json({ message: 'Not allowed to view students for this class' });
//     }

//     const items = await Student.find({ classId, deleted: { $ne: true } }).populate('classId','name classId').lean();

//     // attach payments if Payment exists
//     let sums = [];
//     try {
//       if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
//         const ids = (items || []).map(i => mongoose.Types.ObjectId(String(i._id)));

//         sums = await Payment.aggregate([
//           { $match: { personType: 'student', personId: { $in: ids } } },
//           { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
//         ]);
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /students/class/:classId):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//       sums = [];
//     }

//     const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
//     items.forEach(it => {
//       if (it.photo) it.photoUrl = `/uploads/${it.photo}`;
//       it.paidAmount = toNum(it.paidAmount || paidMap.get(String(it._id)));
//       it.totalDue = toNum(it.totalDue || it.fee || 0);
//       it.status = computeStatus(it.fee || 0, it.paidAmount || 0);
//     });

//     res.json({ items });
//   } catch (err) {
//     console.error('GET /students/class/:classId error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    GET single student
//    ----------------------- */
// router.get('/:id', auth, roles(['admin','manager','teacher','student','parent']), async (req, res) => {
//   try {
//     // block disabled/suspended actors
//     if (req.user && (req.user.disabled || req.user.suspended)) {
//       return res.status(403).json({ message: 'Your account is not allowed to perform this action' });
//     }

//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const student = await Student.findById(id).populate('classId', 'name classId').lean();
//     if (!student) return res.status(404).json({ message: 'Student not found' });

//     if (student.deleted) return res.status(404).json({ message: 'Student not found' });

//     if (req.user.role === 'student' && String(req.user._1d) !== String(student._id)) {
//       // note: req.user._id should be used; keep the same check as in your original logic
//       if (String(req.user._id) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
//     }
//     if (req.user.role === 'parent') {
//       const childFromToken = (req.user && req.user.childId) ? String(req.user.childId) : null;
//       if (childFromToken) {
//         if (String(childFromToken) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
//       } else {
//         const Parent = require('../models/Parent');
//         const parentDoc = await Parent.findById(req.user._id).lean().catch(()=>null);
//         if (!parentDoc || String(parentDoc.childStudent) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
//       }
//     }

//     // compute paid amount from Payment collection if available
//     let paid = student.paidAmount || 0;
//     try {
//       if (Payment && typeof Payment.aggregate === 'function') {
//         const agg = await Payment.aggregate([
//           { $match: { personType: 'student', personId: mongoose.Types.ObjectId(id) } },
//           { $group: { _id: null, paid: { $sum: '$amount' } } }
//         ]);
//         paid = (agg[0] && agg[0].paid) || paid;
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /students/:id):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//     }

//     student.paidAmount = toNum(paid);
//     student.totalDue = toNum(student.totalDue || student.fee || 0);
//     if (student.photo) student.photoUrl = `/uploads/${student.photo}`;
//     student.status = computeStatus(student.fee || 0, student.paidAmount || 0);
//     return res.json({ student });
//   } catch (err) {
//     console.error('GET /students/:id error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    Update student (owner-only)
//    ----------------------- */
// router.put('/:id', auth, roles(['admin','manager']), (req, res) => {
//   // block disabled/suspended actors
//   if (req.user && (req.user.disabled || req.user.suspended)) {
//     return res.status(403).json({ message: 'Your account is not allowed to perform this action' });
//   }

//   upload.single('photo')(req, res, async function (err) {
//     if (err) {
//       console.error('Multer error (PUT /students/:id):', err);
//       if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB' });
//       return res.status(400).json({ message: 'File upload error', detail: err.message });
//     }
//     try {
//       const id = req.params.id;
//       if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//       const doc = await Student.findById(id);
//       if (!doc) return res.status(404).json({ message: 'Student not found' });

//       // Only the owner (creator) can update — admins/managers logic depends on your policy
//       if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

//       const update = { ...(req.body || {}) };
//       if (req.file) update.photo = req.file.filename;

//       // normalize numbers
//       if (typeof update.fee !== 'undefined') update.fee = toNum(update.fee);
//       if (typeof update.paidAmount !== 'undefined') update.paidAmount = toNum(update.paidAmount);

//       if (update.password) {
//         update.passwordHash = await bcrypt.hash(update.password, 10);
//         delete update.password;
//       }

//       // recompute status if fee/paidAmount changed
//       if (typeof update.fee !== 'undefined' || typeof update.paidAmount !== 'undefined') {
//         const fee = typeof update.fee !== 'undefined' ? update.fee : doc.fee;
//         const paid = typeof update.paidAmount !== 'undefined' ? update.paidAmount : (doc.paidAmount || 0);
//         update.status = computeStatus(fee, paid);
//       }

//       const s = await Student.findByIdAndUpdate(id, update, { new: true }).lean();
//       if (s && s.photo) s.photoUrl = `/uploads/${s.photo}`;
//       res.json(s);
//     } catch (e) {
//       console.error('PUT /students/:id error:', e && e.stack ? e.stack : e);
//       res.status(500).json({ message: 'Server error' });
//     }
//   });
// });

// /* -----------------------
//    Reset password (admin/manager)
//    ----------------------- */
// router.post('/:id/reset-password', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     // block disabled/suspended actors
//     if (req.user && (req.user.disabled || req.user.suspended)) {
//       return res.status(403).json({ message: 'Your account is not allowed to perform this action' });
//     }

//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const student = await Student.findById(id);
//     if (!student) return res.status(404).json({ message: 'Student not found' });

//     if (req.user.role !== 'admin' && req.user.schoolId && String(student.schoolId) !== String(req.user.schoolId)) {
//       return res.status(403).json({ message: 'Forbidden' });
//     }

//     const len = Math.max(8, Math.min(24, parseInt(req.body.length || 10, 10)));

//     let temp = crypto.randomBytes(Math.ceil(len * 0.75)).toString('base64').replace(/[+/=]/g, '').slice(0, len);

//     if (!/[0-9]/.test(temp)) temp = temp.slice(0, -1) + Math.floor(Math.random()*10);
//     if (!/[a-zA-Z]/.test(temp)) temp = temp.slice(0, -1) + 'A';

//     const hash = await bcrypt.hash(temp, 10);

//     student.passwordHash = hash;
//     student.mustChangePassword = true;
//     await student.save();

//     return res.json({ ok: true, tempPassword: temp, message: 'Temporary password generated — return it once to the caller.' });
//   } catch (err) {
//     console.error('POST /students/:id/reset-password error', err && err.stack ? err.stack : err);
//     return res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    Change password
//    ----------------------- */
// router.post('/:id/change-password', auth, roles(['admin','manager','teacher','student']), async (req, res) => {
//   try {
//     // block disabled/suspended actors
//     if (req.user && (req.user.disabled || req.user.suspended)) {
//       return res.status(403).json({ message: 'Your account is not allowed to perform this action' });
//     }

//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const { currentPassword, newPassword } = req.body || {};
//     if (!newPassword || String(newPassword).length < 6) {
//       return res.status(400).json({ message: 'New password required (min 6 chars)' });
//     }

//     const student = await Student.findById(id);
//     if (!student) return res.status(404).json({ message: 'Student not found' });

//     if (req.user.role === 'student') {
//       if (String(req.user._id) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
//       if (!currentPassword) return res.status(400).json({ message: 'Current password required' });
//       const match = student.passwordHash ? await bcrypt.compare(currentPassword, student.passwordHash) : false;
//       if (!match) return res.status(400).json({ message: 'Current password is incorrect' });
//       student.passwordHash = await bcrypt.hash(newPassword, 10);
//       student.mustChangePassword = false;
//       await student.save();
//       return res.json({ ok: true, message: 'Password changed' });
//     }

//     if (['admin','manager'].includes(req.user.role)) {
//       if (req.user.role === 'manager' && String(student.createdBy) !== String(req.user._id)) {
//         return res.status(403).json({ message: 'Forbidden' });
//       }
//       student.passwordHash = await bcrypt.hash(newPassword, 10);
//       student.mustChangePassword = false;
//       await student.save();
//       return res.json({ ok: true, message: 'Password updated by admin/manager' });
//     }

//     return res.status(403).json({ message: 'Forbidden' });

//   } catch (err) {
//     console.error('POST /students/:id/change-password error', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    Delete student (soft-delete) or disable-only
//    - If query param `disable=true` => only set disabled flag
//    - Else => soft-delete (deleted=true) and also set disabled=true
//    Permissions: admin/manager (manager limited to their created records)
//    ----------------------- */
// router.delete('/:id', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     // block disabled/suspended actors attempting to delete
//     if (req.user && (req.user.disabled || req.user.suspended)) {
//       return res.status(403).json({ message: 'Your account is not allowed to perform this action' });
//     }

//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const doc = await Student.findById(id);
//     if (!doc) return res.json({ ok: true });

//     // managers can only delete/disable records they created
//     if (req.user.role === 'manager' && String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

//     const onlyDisable = String(req.query.disable || '').toLowerCase() === 'true';

//     if (onlyDisable) {
//       if (doc.disabled) return res.json({ ok: true, alreadyDisabled: true });
//       doc.disabled = true;
//       doc.disabledAt = new Date();
//       doc.disabledBy = {
//         id: req.user._id,
//         role: req.user.role,
//         name: (req.user.fullname || req.user.name || '')
//       };
//       await doc.save();
//       return res.json({ ok: true, disabled: 'true' });
//     }

//     // perform soft-delete (and also disable the account)
//     if (doc.deleted) return res.json({ ok:true, alreadyDeleted:true });

//     doc.deleted = true;
//     doc.deletedAt = new Date();
//     doc.deletedBy = {
//       id: req.user._id,
//       role: req.user.role,
//       name: (req.user.fullname || req.user.name || '')
//     };

//     // also disable the student account when deleted
//     doc.disabled = true;
//     doc.disabledAt = doc.deletedAt;
//     doc.disabledBy = {
//       id: req.user._id,
//       role: req.user.role,
//       name: (req.user.fullname || req.user.name || '')
//     };

//     await doc.save();

//     // keep payments intact so you can restore; permanent removal handled in recycle route / purge job
//     res.json({ ok: true, deleted: 'soft' });
//   } catch (err) {
//     console.error('DELETE /students/:id error (soft-delete):', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;



// // backend/routes/students.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');
// const auth = require('../middleware/auth');
// const roles = require('../middleware/roles');
// const Student = require('../models/Student');

// const crypto = require('crypto');
// const bcrypt = require('bcrypt'); // require once

// let Payment;
// try { Payment = require('../models/Payment'); } catch (e) { Payment = null; console.warn('Payment model not available:', e.message); }

// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

// const uploadDir = path.join(__dirname, '..', 'uploads');
// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, uploadDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname || '');
//     cb(null, file.fieldname + '-' + Date.now() + ext);
//   }
// });
// // limit file size to 5MB
// const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// const toNum = v => (typeof v === 'number' ? v : (Number(v) || 0));

// function computeStatus(fee, paid) {
//   if (typeof fee === 'undefined') fee = 0;
//   if (typeof paid === 'undefined') paid = 0;
//   if (fee === 0) return 'free';
//   if (paid >= fee) return 'paid';
//   if (paid > 0) return 'partial';
//   return 'unpaid';
// }

// // helper to generate default numberId STD<DD><MM><seq>
// async function generateStudentNumberId(schoolId) {
//   const now = new Date();
//   const dd = String(now.getDate()).padStart(2, '0');
//   const mm = String(now.getMonth() + 1).padStart(2, '0');
//   const prefix = `STD${dd}${mm}`;
//   const last = await Student.findOne({ schoolId, numberId: new RegExp(`^${prefix}`) }).sort({ createdAt: -1 }).lean();
//   if (!last || !last.numberId) return `${prefix}1`;
//   const tail = last.numberId.replace(prefix, '');
//   const seq = Number(tail) || 0;
//   return `${prefix}${seq + 1}`;
// }

// /* -----------------------
//    Create student (admin/manager)
//    ----------------------- */
// router.post('/', auth, roles(['admin','manager']), (req, res) => {
//   upload.single('photo')(req, res, async function (err) {
//     if (err) {
//       console.error('Multer error (POST /students):', err);
//       if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB' });
//       return res.status(400).json({ message: 'File upload error', detail: err.message });
//     }
//     try {
//       const { fullname, numberId, classId, parentName, parentPhone, phone, password, fee } = req.body;
//       if (!fullname) return res.status(400).json({ message: 'fullname required' });

//       let finalNumberId = numberId && String(numberId).trim() ? String(numberId).trim() : undefined;
//       if (!finalNumberId) {
//         finalNumberId = await generateStudentNumberId(req.user.schoolId);
//       } else {
//         const qExist = { numberId: finalNumberId, schoolId: req.user.schoolId, deleted: { $ne: true } };
//         const exists = await Student.findOne(qExist);
//         if (exists) return res.status(400).json({ message: 'numberId exists for your school' });
//       }

//       const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
//       const photoFile = req.file ? req.file.filename : undefined;

//       const feeNum = toNum(fee);
//       const paidAmount = 0; // initial
//       const status = computeStatus(feeNum, paidAmount);

//       const s = new Student({
//         fullname,
//         numberId: finalNumberId,
//         classId: classId || undefined,
//         parentName,
//         parentPhone,
//         phone,
//         passwordHash,
//         fee: feeNum,
//         paidAmount,
//         status,
//         photo: photoFile,
//         schoolId: req.user.schoolId,
//         createdBy: req.user._id,
//         deleted: false
//       });

//       await s.save();

//       const ret = s.toObject();
//       if (ret.photo) ret.photoUrl = `/uploads/${ret.photo}`;
//       res.json(ret);
//     } catch (e) {
//       console.error('POST /students error:', e && e.stack ? e.stack : e);
//       if (e && e.code === 11000) return res.status(400).json({ message: 'Duplicate', detail: e.keyValue });
//       res.status(500).json({ message: 'Server error', err: e && e.message ? e.message : String(e) });
//     }
//   });
// });

// /* -----------------------
//    List/search students
//    ----------------------- */
// router.get('/', auth, roles(['admin','manager','teacher','student','parent']), async (req, res) => {
//   try {
//     const { search = '', page = 1, limit = 50 } = req.query;
//     const p = Math.max(1, parseInt(page || 1, 10));
//     const l = Math.max(1, Math.min(500, parseInt(limit || 50, 10)));
//     const q = { deleted: { $ne: true } }; // exclude soft-deleted by default
//     if (search) q.$or = [{ fullname: new RegExp(search, 'i') }, { numberId: new RegExp(search, 'i') }, { parentName: new RegExp(search, 'i') }];

//     if (req.user.role === 'student') {
//       q._id = req.user._id;
//     } else if (req.user.role === 'parent') {
//       // parent only sees their child
//       // try token childId first
//       if (req.user.childId) {
//         q._id = req.user.childId;
//       } else {
//         // fallback to look up Parent doc using req.user._id
//         let Parent;
//         try { Parent = require('../models/Parent'); } catch (e) { Parent = null; }
//         const pd = Parent ? await Parent.findById(req.user._id).lean().catch(()=>null) : null;
//         if (pd && pd.childStudent) q._id = pd.childStudent;
//         else return res.status(403).json({ message: 'Forbidden' });
//       }
//     } else {
//       // admin/manager/teacher scope as before
//       // scope by school when available
//       if (req.user.schoolId && mongoose.Types.ObjectId.isValid(String(req.user.schoolId))) {
//         q.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId));
//       } else {
//         q.createdBy = req.user._id;
//       }
//     }

//     const items = await Student.find(q)
//       .limit(l)
//       .skip((p - 1) * l)
//       .sort({ createdAt: -1 })
//       .populate({ path: 'classId', select: 'name classId' })
//       .lean();

//     // attach payment sums if Payment model exists
//     let sums = [];
//     try {
//       if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
//         const ids = items.map(i => mongoose.Types.ObjectId(i._id));
//         sums = await Payment.aggregate([
//           { $match: { personType: 'student', personId: { $in: ids } } },
//           { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
//         ]);
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /students):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//       sums = [];
//     }

//     const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
//     items.forEach(it => {
//       if (it.photo) it.photoUrl = `/uploads/${it.photo}`;
//       it.paidAmount = toNum(it.paidAmount || paidMap.get(String(it._id)));
//       it.totalDue = toNum(it.totalDue || it.fee || 0);

//       // ensure status consistent (recompute for safety)
//       it.status = computeStatus(it.fee || 0, it.paidAmount || 0);
//     });

//     const total = await Student.countDocuments(q);
//     res.json({ items, total });
//   } catch (err) {
//     console.error('GET /students error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    GET students by class (teacher/manager/admin)
//    NOTE: placed BEFORE the '/:id' route to avoid path collisions
//    ----------------------- */
// router.get('/class/:classId', auth, roles(['admin','manager','teacher']), async (req, res) => {
//   try {
//     const classId = req.params.classId;
//     if (!classId) return res.status(400).json({ message: 'classId required' });

//     if (req.user.role === 'teacher') {
//       const Teacher = require('../models/Teacher');
//       const t = await Teacher.findById(req.user._id).lean();
//       if (!t) return res.status(403).json({ message: 'Teacher not found' });
//       const allowed = (t.classIds || []).map(x => String(x));
//       if (!allowed.includes(String(classId))) return res.status(403).json({ message: 'Not allowed to view students for this class' });
//     }

//     const items = await Student.find({ classId, deleted: { $ne: true } }).populate('classId','name classId').lean();

//     // attach payments if Payment exists
//     let sums = [];
//     try {
//       if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
//         const ids = (items || []).map(i => mongoose.Types.ObjectId(String(i._id)));

//         sums = await Payment.aggregate([
//           { $match: { personType: 'student', personId: { $in: ids } } },
//           { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
//         ]);
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /students/class/:classId):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//       sums = [];
//     }

//     const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
//     items.forEach(it => {
//       if (it.photo) it.photoUrl = `/uploads/${it.photo}`;
//       it.paidAmount = toNum(it.paidAmount || paidMap.get(String(it._id)));
//       it.totalDue = toNum(it.totalDue || it.fee || 0);
//       it.status = computeStatus(it.fee || 0, it.paidAmount || 0);
//     });

//     res.json({ items });
//   } catch (err) {
//     console.error('GET /students/class/:classId error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    GET single student
//    ----------------------- */
// router.get('/:id', auth, roles(['admin','manager','teacher','student','parent']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const student = await Student.findById(id).populate('classId', 'name classId').lean();
//     if (!student) return res.status(404).json({ message: 'Student not found' });

//     // hide soft-deleted items from regular endpoints
//     if (student.deleted) {
//       // allow admin to view via this route? keep simple: return 404 for others
//       if (!req.user || String((req.user.role || '').toLowerCase()) !== 'admin') {
//         return res.status(404).json({ message: 'Student not found' });
//       }
//     }

//     if (req.user.role === 'student' && String(req.user._id) !== String(student._id)) {
//       return res.status(403).json({ message: 'Forbidden' });
//     }
//     if (req.user.role === 'parent') {
//       // Note: auth middleware must populate req.user.childId for parent tokens
//       // prefer childId from token, fallback to Parent doc lookup by req.user._id
//       const childFromToken = (req.user && req.user.childId) ? String(req.user.childId) : null;
//       if (childFromToken) {
//         if (String(childFromToken) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
//       } else {
//         // fallback: check Parent document by parent _id
//         let Parent;
//         try { Parent = require('../models/Parent'); } catch (e) { Parent = null; }
//         const parentDoc = Parent ? await Parent.findById(req.user._id).lean().catch(()=>null) : null;
//         if (!parentDoc || String(parentDoc.childStudent) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
//       }
//     }

//     // compute paid amount from Payment collection if available
//     let paid = student.paidAmount || 0;
//     try {
//       if (Payment && typeof Payment.aggregate === 'function') {
//         const agg = await Payment.aggregate([
//           { $match: { personType: 'student', personId: mongoose.Types.ObjectId(id) } },
//           { $group: { _id: null, paid: { $sum: '$amount' } } }
//         ]);
//         paid = (agg[0] && agg[0].paid) || paid;
//       }
//     } catch (eAgg) {
//       console.error('Payment aggregation error (GET /students/:id):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
//     }

//     student.paidAmount = toNum(paid);
//     student.totalDue = toNum(student.totalDue || student.fee || 0);
//     if (student.photo) student.photoUrl = `/uploads/${student.photo}`;
//     student.status = computeStatus(student.fee || 0, student.paidAmount || 0);
//     return res.json({ student });
//   } catch (err) {
//     console.error('GET /students/:id error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    Update student (owner-only)
//    ----------------------- */
// router.put('/:id', auth, roles(['admin','manager']), (req, res) => {
//   upload.single('photo')(req, res, async function (err) {
//     if (err) {
//       console.error('Multer error (PUT /students/:id):', err);
//       if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB' });
//       return res.status(400).json({ message: 'File upload error', detail: err.message });
//     }
//     try {
//       const id = req.params.id;
//       if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//       const doc = await Student.findById(id);
//       if (!doc) return res.status(404).json({ message: 'Student not found' });

//       // Only the owner (creator) can update — admins/managers logic depends on your policy
//       if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

//       const update = { ...(req.body || {}) };
//       if (req.file) update.photo = req.file.filename;

//       // normalize numbers
//       if (typeof update.fee !== 'undefined') update.fee = toNum(update.fee);
//       if (typeof update.paidAmount !== 'undefined') update.paidAmount = toNum(update.paidAmount);

//       if (update.password) {
//         update.passwordHash = await bcrypt.hash(update.password, 10);
//         delete update.password;
//       }

//       // recompute status if fee/paidAmount changed
//       if (typeof update.fee !== 'undefined' || typeof update.paidAmount !== 'undefined') {
//         const fee = typeof update.fee !== 'undefined' ? update.fee : doc.fee;
//         const paid = typeof update.paidAmount !== 'undefined' ? update.paidAmount : (doc.paidAmount || 0);
//         update.status = computeStatus(fee, paid);
//       }

//       const s = await Student.findByIdAndUpdate(id, update, { new: true }).lean();
//       if (s && s.photo) s.photoUrl = `/uploads/${s.photo}`;
//       res.json(s);
//     } catch (e) {
//       console.error('PUT /students/:id error:', e && e.stack ? e.stack : e);
//       res.status(500).json({ message: 'Server error' });
//     }
//   });
// });

// /* -----------------------
//    Reset password (admin/manager)
//    POST /api/students/:id/reset-password
//    ----------------------- */
// router.post('/:id/reset-password', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const student = await Student.findById(id);
//     if (!student) return res.status(404).json({ message: 'Student not found' });

//     // Optionally enforce ownership/school scoping for managers (admins bypass)
//     if (req.user.role !== 'admin' && req.user.schoolId && String(student.schoolId) !== String(req.user.schoolId)) {
//       return res.status(403).json({ message: 'Forbidden' });
//     }

//     const len = Math.max(8, Math.min(24, parseInt(req.body.length || 10, 10)));

//     // generate url-safe temp password
//     let temp = crypto.randomBytes(Math.ceil(len * 0.75)).toString('base64').replace(/[+/=]/g, '').slice(0, len);

//     // ensure at least one digit and one letter (simple enforcement)
//     if (!/[0-9]/.test(temp)) temp = temp.slice(0, -1) + Math.floor(Math.random()*10);
//     if (!/[a-zA-Z]/.test(temp)) temp = temp.slice(0, -1) + 'A';

//     const hash = await bcrypt.hash(temp, 10);

//     // update passwordHash and flag to force change
//     student.passwordHash = hash;
//     student.mustChangePassword = true; // ensure your Student schema has this field
//     await student.save();

//     // Return the temp password ONCE to the caller (do not log in production)
//     return res.json({ ok: true, tempPassword: temp, message: 'Temporary password generated — return it once to the caller.' });
//   } catch (err) {
//     console.error('POST /students/:id/reset-password error', err && err.stack ? err.stack : err);
//     return res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    Change password
//    POST /api/students/:id/change-password
//    Roles allowed: student (self only), admin/manager (owner only)
//    ----------------------- */
// router.post('/:id/change-password', auth, roles(['admin','manager','teacher','student']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const { currentPassword, newPassword } = req.body || {};
//     if (!newPassword || String(newPassword).length < 6) {
//       return res.status(400).json({ message: 'New password required (min 6 chars)' });
//     }

//     const student = await Student.findById(id);
//     if (!student) return res.status(404).json({ message: 'Student not found' });

//     // Student can change their own password but must provide current password
//     if (req.user.role === 'student') {
//       if (String(req.user._id) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
//       if (!currentPassword) return res.status(400).json({ message: 'Current password required' });
//       const match = student.passwordHash ? await bcrypt.compare(currentPassword, student.passwordHash) : false;
//       if (!match) return res.status(400).json({ message: 'Current password is incorrect' });
//       student.passwordHash = await bcrypt.hash(newPassword, 10);
//       student.mustChangePassword = false;
//       await student.save();
//       return res.json({ ok: true, message: 'Password changed' });
//     }

//     // Admin/Manager: allow setting password if owner (createdBy) OR admin can bypass
//     if (['admin','manager'].includes(req.user.role)) {
//       if (req.user.role === 'manager' && String(student.createdBy) !== String(req.user._id)) {
//         return res.status(403).json({ message: 'Forbidden' });
//       }
//       student.passwordHash = await bcrypt.hash(newPassword, 10);
//       student.mustChangePassword = false;
//       await student.save();
//       return res.json({ ok: true, message: 'Password updated by admin/manager' });
//     }

//     // Teachers not allowed to change passwords here
//     return res.status(403).json({ message: 'Forbidden' });

//   } catch (err) {
//     console.error('POST /students/:id/change-password error', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* -----------------------
//    Delete student (owner-only) - now soft-delete by default
//    If ?permanent=true (or body.permanent) and requester is admin => permanent delete
//    ----------------------- */
// router.delete('/:id', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const doc = await Student.findById(id);
//     if (!doc) return res.json({ ok: true });

//     if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

//     const wantPermanent = (req.query.permanent === 'true') || (req.body && req.body.permanent === true);
//     if (wantPermanent) {
//       // only admin allowed to permanently delete
//       if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admin can permanently delete' });

//       await Student.findByIdAndDelete(id);

//       // best-effort cleanup of Payment docs — errors here should not fail the delete call
//       if (Payment) {
//         try {
//           const pid = mongoose.Types.ObjectId.isValid(String(id)) ? mongoose.Types.ObjectId(String(id)) : null;
//           if (pid) {
//             await Payment.deleteMany({ personType: 'student', personId: pid });
//           } else {
//             // fallback: try string match (less common)
//             await Payment.deleteMany({ personType: 'student', personId: String(id) });
//           }
//         } catch (e) {
//           console.warn('Payment cleanup failed after deleting student', id, e && (e.stack || e));
//           // do not return error to caller
//         }
//       }

//       return res.json({ ok: true, deleted: 'permanent' });
//     }

//     // Otherwise perform soft-delete (recycle)
//     doc.deleted = true;
//     doc.deletedAt = new Date();
//     doc.deletedBy = { id: req.user._id, role: req.user.role, name: req.user.fullname || '' };
//     await doc.save();
//     return res.json({ ok: true, deleted: 'soft' });

//   } catch (err) {
//     console.error('DELETE /students/:id error:', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const Student = require('../models/Student');

const crypto = require('crypto');
const bcrypt = require('bcrypt'); // require once

let Payment;
try { Payment = require('../models/Payment'); } catch (e) { Payment = null; console.warn('Payment model not available:', e.message); }

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const STUDENTS_DIR = path.join(UPLOADS_ROOT, 'students');

// ensure uploads/students exists
try { if (!fs.existsSync(STUDENTS_DIR)) fs.mkdirSync(STUDENTS_DIR, { recursive: true }); } catch (e) { console.warn('mkdir students uploads failed', e && e.message); }

// multer storage writes into uploads/students
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STUDENTS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `photo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp|gif)/i.test(file.mimetype);
    cb(null, ok);
  }
});

const toNum = v => (typeof v === 'number' ? v : (Number(v) || 0));

function computeStatus(fee, paid) {
  if (typeof fee === 'undefined') fee = 0;
  if (typeof paid === 'undefined') paid = 0;
  if (fee === 0) return 'free';
  if (paid >= fee) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

async function generateStudentNumberId(schoolId) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `STD${dd}${mm}`;
  const last = await Student.findOne({ schoolId, numberId: new RegExp(`^${prefix}`) }).sort({ createdAt: -1 }).lean();
  if (!last || !last.numberId) return `${prefix}1`;
  const tail = last.numberId.replace(prefix, '');
  const seq = Number(tail) || 0;
  return `${prefix}${seq + 1}`;
}

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

/* -----------------------
   Create student (admin/manager)
   ----------------------- */
router.post('/', auth, roles(['admin','manager']), (req, res) => {
  upload.single('photo')(req, res, async function (err) {
    if (err) {
      console.error('Multer error (POST /students):', err);
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB' });
      return res.status(400).json({ message: 'File upload error', detail: err.message });
    }
    try {
      const { fullname, numberId, classId, parentName, parentPhone, phone, password, fee, birthdate } = req.body;
      if (!fullname) {
        if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
        return res.status(400).json({ message: 'fullname required' });
      }

      let finalNumberId = numberId && String(numberId).trim() ? String(numberId).trim() : undefined;
      if (!finalNumberId) {
        finalNumberId = await generateStudentNumberId(req.user.schoolId);
      } else {
        const qExist = { numberId: finalNumberId, schoolId: req.user.schoolId, deleted: { $ne: true } };
        const exists = await Student.findOne(qExist);
        if (exists) {
          if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
          return res.status(400).json({ message: 'numberId exists for your school' });
        }
      }

      const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
      const photoFile = req.file ? `students/${path.basename(req.file.path)}` : undefined;

      const feeNum = toNum(fee);
      const paidAmount = 0; // initial
      const status = computeStatus(feeNum, paidAmount);

      const s = new Student({
        fullname,
        numberId: finalNumberId,
        classId: classId || undefined,
        parentName,
        parentPhone,
        phone,
        passwordHash,
        fee: feeNum,
        paidAmount,
        status,
        photo: photoFile,
        birthdate: birthdate ? new Date(birthdate) : undefined,
        schoolId: req.user.schoolId,
        createdBy: req.user._id,
        deleted: false
      });

      await s.save();

      const ret = s.toObject();
      // provide absolute URL for convenience (use request host)
      if (ret.photo) ret.photoUrl = `${req.protocol}://${req.get('host')}/uploads/${ret.photo}`;
      res.json(ret);
    } catch (e) {
      console.error('POST /students error:', e && e.stack ? e.stack : e);
      if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
      if (e && e.code === 11000) return res.status(400).json({ message: 'Duplicate', detail: e.keyValue });
      res.status(500).json({ message: 'Server error', err: e && e.message ? e.message : String(e) });
    }
  });
});

/* -----------------------
   List/search students
   ----------------------- */
router.get('/', auth, roles(['admin','manager','teacher','student','parent']), async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const p = Math.max(1, parseInt(page || 1, 10));
    const l = Math.max(1, Math.min(500, parseInt(limit || 50, 10)));
    const q = { deleted: { $ne: true } };
    if (search) q.$or = [{ fullname: new RegExp(search, 'i') }, { numberId: new RegExp(search, 'i') }, { parentName: new RegExp(search, 'i') }];

    if (req.user.role === 'student') {
      q._id = req.user._id;
    } else if (req.user.role === 'parent') {
      if (req.user.childId) q._id = req.user.childId;
      else {
        let Parent;
        try { Parent = require('../models/Parent'); } catch (e) { Parent = null; }
        const pd = Parent ? await Parent.findById(req.user._id).lean().catch(()=>null) : null;
        if (pd && pd.childStudent) q._id = pd.childStudent;
        else return res.status(403).json({ message: 'Forbidden' });
      }
    } else {
      if (req.user.schoolId && mongoose.Types.ObjectId.isValid(String(req.user.schoolId))) {
        q.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId));
      } else {
        q.createdBy = req.user._id;
      }
    }

    const items = await Student.find(q)
      .limit(l)
      .skip((p - 1) * l)
      .sort({ createdAt: -1 })
      .populate({ path: 'classId', select: 'name classId' })
      .lean();

    let sums = [];
    try {
      if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
        const ids = items.map(i => mongoose.Types.ObjectId(i._id));
        sums = await Payment.aggregate([
          { $match: { personType: 'student', personId: { $in: ids } } },
          { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
        ]);
      }
    } catch (eAgg) {
      console.error('Payment aggregation error (GET /students):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
      sums = [];
    }

    const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
    items.forEach(it => {
      if (it.photo) it.photoUrl = `${req.protocol}://${req.get('host')}/uploads/${it.photo}`;
      it.paidAmount = toNum(it.paidAmount || paidMap.get(String(it._id)));
      it.totalDue = toNum(it.totalDue || it.fee || 0);
      it.status = computeStatus(it.fee || 0, it.paidAmount || 0);
    });

    const total = await Student.countDocuments(q);
    res.json({ items, total });
  } catch (err) {
    console.error('GET /students error:', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* -----------------------
   GET students by class
   ----------------------- */
router.get('/class/:classId', auth, roles(['admin','manager','teacher']), async (req, res) => {
  try {
    const classId = req.params.classId;
    if (!classId) return res.status(400).json({ message: 'classId required' });

    if (req.user.role === 'teacher') {
      const Teacher = require('../models/Teacher');
      const t = await Teacher.findById(req.user._id).lean();
      if (!t) return res.status(403).json({ message: 'Teacher not found' });
      const allowed = (t.classIds || []).map(x => String(x));
      if (!allowed.includes(String(classId))) return res.status(403).json({ message: 'Not allowed to view students for this class' });
    }

    const items = await Student.find({ classId, deleted: { $ne: true } }).populate('classId','name classId').lean();

    let sums = [];
    try {
      if (Payment && items.length > 0 && typeof Payment.aggregate === 'function') {
        const ids = (items || []).map(i => mongoose.Types.ObjectId(String(i._id)));
        sums = await Payment.aggregate([
          { $match: { personType: 'student', personId: { $in: ids } } },
          { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
        ]);
      }
    } catch (eAgg) {
      console.error('Payment aggregation error (GET /students/class/:classId):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
      sums = [];
    }

    const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
    items.forEach(it => {
      if (it.photo) it.photoUrl = `${req.protocol}://${req.get('host')}/uploads/${it.photo}`;
      it.paidAmount = toNum(it.paidAmount || paidMap.get(String(it._id)));
      it.totalDue = toNum(it.totalDue || it.fee || 0);
      it.status = computeStatus(it.fee || 0, it.paidAmount || 0);
    });

    res.json({ items });
  } catch (err) {
    console.error('GET /students/class/:classId error:', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* -----------------------
   GET single student
   ----------------------- */
router.get('/:id', auth, roles(['admin','manager','teacher','student','parent']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const student = await Student.findById(id).populate('classId', 'name classId').lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });

    if (student.deleted) {
      if (!req.user || String((req.user.role || '').toLowerCase()) !== 'admin') {
        return res.status(404).json({ message: 'Student not found' });
      }
    }

    if (req.user.role === 'student' && String(req.user._id) !== String(student._id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (req.user.role === 'parent') {
      const childFromToken = (req.user && req.user.childId) ? String(req.user.childId) : null;
      if (childFromToken) {
        if (String(childFromToken) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
      } else {
        let Parent;
        try { Parent = require('../models/Parent'); } catch (e) { Parent = null; }
        const parentDoc = Parent ? await Parent.findById(req.user._id).lean().catch(()=>null) : null;
        if (!parentDoc || String(parentDoc.childStudent) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
      }
    }

    let paid = student.paidAmount || 0;
    try {
      if (Payment && typeof Payment.aggregate === 'function') {
        const agg = await Payment.aggregate([
          { $match: { personType: 'student', personId: mongoose.Types.ObjectId(id) } },
          { $group: { _id: null, paid: { $sum: '$amount' } } }
        ]);
        paid = (agg[0] && agg[0].paid) || paid;
      }
    } catch (eAgg) {
      console.error('Payment aggregation error (GET /students/:id):', eAgg && eAgg.stack ? eAgg.stack : eAgg);
    }

    student.paidAmount = toNum(paid);
    student.totalDue = toNum(student.totalDue || student.fee || 0);
    if (student.photo) student.photoUrl = `${req.protocol}://${req.get('host')}/uploads/${student.photo}`;
    student.status = computeStatus(student.fee || 0, student.paidAmount || 0);

    return res.json({ student });
  } catch (err) {
    console.error('GET /students/:id error:', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* -----------------------
   Update student (admin/manager)
   ----------------------- */
router.put('/:id', auth, roles(['admin','manager']), (req, res) => {
  upload.single('photo')(req, res, async function (err) {
    if (err) {
      console.error('Multer error (PUT /students/:id):', err);
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB' });
      return res.status(400).json({ message: 'File upload error', detail: err.message });
    }
    try {
      const id = req.params.id;
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
        return res.status(400).json({ message: 'Invalid id' });
      }

      const doc = await Student.findById(id);
      if (!doc) {
        if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
        return res.status(404).json({ message: 'Student not found' });
      }

      if (req.user.role !== 'admin') {
        const sameCreator = String(doc.createdBy) === String(req.user._id);
        const sameSchool = req.user.schoolId && String(req.user.schoolId) === String(doc.schoolId);
        if (!sameCreator && !sameSchool) {
          if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
          return res.status(403).json({ message: 'Forbidden' });
        }
      }

      const update = { ...(req.body || {}) };

      if (update.birthdate !== undefined) {
        update.birthdate = update.birthdate ? new Date(update.birthdate) : null;
      }

      // If request included a file — set relative path
      let newPhotoRelative = null;
      if (req.file) {
        newPhotoRelative = `students/${path.basename(req.file.path)}`;
        update.photo = newPhotoRelative;
      }

      if (typeof update.fee !== 'undefined') update.fee = toNum(update.fee);
      if (typeof update.paidAmount !== 'undefined') update.paidAmount = toNum(update.paidAmount);

      if (update.password) {
        update.passwordHash = await bcrypt.hash(update.password, 10);
        delete update.password;
      }

      if (typeof update.fee !== 'undefined' || typeof update.paidAmount !== 'undefined') {
        const fee = typeof update.fee !== 'undefined' ? update.fee : doc.fee;
        const paid = typeof update.paidAmount !== 'undefined' ? update.paidAmount : (doc.paidAmount || 0);
        update.status = computeStatus(fee, paid);
      }

      const s = await Student.findByIdAndUpdate(id, update, { new: true }).lean();

      // after successful DB update, delete old photo file (best-effort)
      if (newPhotoRelative && doc.photo && typeof doc.photo === 'string' && doc.photo.startsWith('students/')) {
        try { await deleteLocalFileIfExists(doc.photo); } catch(e){ console.warn('delete old photo failed', e && e.message); }
      }

      if (s && s.photo) s.photoUrl = `${req.protocol}://${req.get('host')}/uploads/${s.photo}`;
      res.json(s);
    } catch (e) {
      console.error('PUT /students/:id error:', e && e.stack ? e.stack : e);
      if (req.file && req.file.path) await deleteLocalFileIfExists(req.file.path);
      res.status(500).json({ message: 'Server error' });
    }
  });
});

/* -----------------------
   Reset password (admin/manager)
   ... unchanged below ...
   ----------------------- */
router.post('/:id/reset-password', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const student = await Student.findById(id);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    if (req.user.role !== 'admin' && req.user.schoolId && String(student.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const len = Math.max(8, Math.min(24, parseInt(req.body.length || 10, 10)));
    let temp = crypto.randomBytes(Math.ceil(len * 0.75)).toString('base64').replace(/[+/=]/g, '').slice(0, len);
    if (!/[0-9]/.test(temp)) temp = temp.slice(0, -1) + Math.floor(Math.random()*10);
    if (!/[a-zA-Z]/.test(temp)) temp = temp.slice(0, -1) + 'A';

    const hash = await bcrypt.hash(temp, 10);
    student.passwordHash = hash;
    student.mustChangePassword = true;
    await student.save();

    return res.json({ ok: true, tempPassword: temp, message: 'Temporary password generated — return it once to the caller.' });
  } catch (err) {
    console.error('POST /students/:id/reset-password error', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* -----------------------
   change password, delete etc. (keep as you had)
   ----------------------- */
/* -----------------------
   Change password
   ----------------------- */
   router.post('/:id/change-password', auth, roles(['admin','manager','teacher','student']), async (req, res) => {
    try {
      const id = req.params.id;
      if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  
      const { currentPassword, newPassword } = req.body || {};
      if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ message: 'New password required (min 6 chars)' });
      }
  
      const student = await Student.findById(id);
      if (!student) return res.status(404).json({ message: 'Student not found' });
  
      if (req.user.role === 'student') {
        if (String(req.user._id) !== String(student._id)) return res.status(403).json({ message: 'Forbidden' });
        if (!currentPassword) return res.status(400).json({ message: 'Current password required' });
        const match = student.passwordHash ? await bcrypt.compare(currentPassword, student.passwordHash) : false;
        if (!match) return res.status(400).json({ message: 'Current password is incorrect' });
        student.passwordHash = await bcrypt.hash(newPassword, 10);
        student.mustChangePassword = false;
        await student.save();
        return res.json({ ok: true, message: 'Password changed' });
      }
  
      if (['admin','manager'].includes(req.user.role)) {
        if (req.user.role === 'manager' && String(student.createdBy) !== String(req.user._id) && !(req.user.schoolId && String(student.schoolId) === String(req.user.schoolId))) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        student.passwordHash = await bcrypt.hash(newPassword, 10);
        student.mustChangePassword = false;
        await student.save();
        return res.json({ ok: true, message: 'Password updated by admin/manager' });
      }
  
      return res.status(403).json({ message: 'Forbidden' });
  
    } catch (err) {
      console.error('POST /students/:id/change-password error', err);
      res.status(500).json({ message: 'Server error' });
    }
  });
  
  /* -----------------------
     Delete student (owner-only)
     ----------------------- */
  router.delete('/:id', auth, roles(['admin','manager']), async (req, res) => {
    try {
      const id = req.params.id;
      if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  
      const doc = await Student.findById(id);
      if (!doc) return res.json({ ok: true });
  
      if (String(doc.createdBy) !== String(req.user._id) && req.user.role !== 'admin' && !(req.user.role === 'manager' && req.user.schoolId && String(req.user.schoolId) === String(doc.schoolId))) {
        return res.status(403).json({ message: 'Forbidden' });
      }
  
      const wantPermanent = (req.query.permanent === 'true') || (req.body && req.body.permanent === true);
      if (wantPermanent) {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admin can permanently delete' });
  
        await Student.findByIdAndDelete(id);
  
        if (Payment) {
          try {
            const pid = mongoose.Types.ObjectId.isValid(String(id)) ? mongoose.Types.ObjectId(String(id)) : null;
            if (pid) {
              await Payment.deleteMany({ personType: 'student', personId: pid });
            } else {
              await Payment.deleteMany({ personType: 'student', personId: String(id) });
            }
          } catch (e) {
            console.warn('Payment cleanup failed after deleting student', id, e && (e.stack || e));
          }
        }
  
        // delete local photo if present
        try { if (doc.photo && doc.photo.startsWith('students/')) await deleteLocalFileIfExists(doc.photo); } catch(e){}
  
        return res.json({ ok: true, deleted: 'permanent' });
      }
  
      doc.deleted = true;
      doc.deletedAt = new Date();
      doc.deletedBy = { id: req.user._id, role: req.user.role, name: req.user.fullname || '' };
      await doc.save();
      return res.json({ ok: true, deleted: 'soft' });
  
    } catch (err) {
      console.error('DELETE /students/:id error:', err && err.stack ? err.stack : err);
      res.status(500).json({ message: 'Server error' });
    }
  });
  
module.exports = router;
