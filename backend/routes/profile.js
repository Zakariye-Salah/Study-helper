// // // backend/routes/profile.js
// // const express = require('express');
// // const router = express.Router();
// // const auth = require('../middleware/auth');
// // const roles = require('../middleware/roles');
// // const Student = require('../models/Student');
// // const Teacher = require('../models/Teacher');
// // const User = require('../models/User');
// // const bcrypt = require('bcrypt');
// // const multer = require('multer');
// // const path = require('path');
// // const fs = require('fs');

// // const uploadDir = path.join(__dirname, '..', 'uploads');
// // if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// // const storage = multer.diskStorage({
// //   destination: (req, file, cb) => cb(null, uploadDir),
// //   filename: (req, file, cb) => {
// //     const ext = path.extname(file.originalname);
// //     cb(null, 'profile-' + Date.now() + ext);
// //   }
// // });
// // const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// // // GET /api/profile
// // // any authenticated user (student or teacher) can fetch their profile
// // router.get('/', auth, async (req, res) => {
// //   try {
// //     const role = req.user.role;
// //     if (role === 'student') {
// //       const s = await Student.findById(req.user._id).populate('classId','name classId').populate({ path: 'schoolId', select: 'name' }).lean();
// //       if(!s) return res.status(404).json({ message: 'Student not found' });
// //       if (s.photo) s.photoUrl = '/uploads/' + s.photo;
// //       return res.json({ profile: s, role: 'student' });
// //     } else if (role === 'teacher') {
// //       const t = await Teacher.findById(req.user._id).populate('classIds','name classId').populate('subjectIds','name subjectId').lean();
// //       if(!t) return res.status(404).json({ message: 'Teacher not found' });
// //       if (t.photo) t.photoUrl = '/uploads/' + t.photo;
// //       return res.json({ profile: t, role: 'teacher' });
// //     } else {
// //       // fallback: if there's a User doc for this id, return basic info
// //       const u = await User.findById(req.user._id).select('-passwordHash').lean();
// //       if(!u) return res.status(404).json({ message: 'User not found' });
// //       return res.json({ profile: u, role: u.role || 'user' });
// //     }
// //   } catch (err) {
// //     console.error('GET /profile err', err);
// //     res.status(500).json({ message: 'Server error' });
// //   }
// // });

// // // PUT /api/profile  (update profile) - accepts JSON or multipart (photo)
// // router.put('/', auth, upload.single('photo'), async (req, res) => {
// //   try {
// //     const role = req.user.role;
// //     // Build update object from either req.body (for JSON) or form fields
// //     const body = req.body || {};
// //     const update = {};

// //     if (body.fullname) update.fullname = String(body.fullname).trim();
// //     if (body.phone) update.phone = String(body.phone).trim();

// //     if (req.file) {
// //       update.photo = req.file.filename;
// //     }

// //     if (role === 'student') {
// //       if (body.classId) update.classId = body.classId;
// //       const s = await Student.findByIdAndUpdate(req.user._id, update, { new: true }).populate('classId','name classId').lean();
// //       if(!s) return res.status(404).json({ message: 'Student not found' });
// //       if (s.photo) s.photoUrl = '/uploads/' + s.photo;
// //       return res.json({ profile: s, role: 'student' });
// //     } else if (role === 'teacher') {
// //       // classIds & subjectIds may be arrays (multipart will give multiple fields)
// //       if (body.classIds) {
// //         // multer form-data may produce string or array
// //         update.classIds = Array.isArray(body.classIds) ? body.classIds : [body.classIds];
// //       }
// //       if (body.subjectIds) update.subjectIds = Array.isArray(body.subjectIds) ? body.subjectIds : [body.subjectIds];
// //       if (body.salary !== undefined) update.salary = Number(body.salary || 0);

// //       const t = await Teacher.findByIdAndUpdate(req.user._id, update, { new: true }).populate('classIds','name classId').populate('subjectIds','name subjectId').lean();
// //       if(!t) return res.status(404).json({ message: 'Teacher not found' });
// //       if (t.photo) t.photoUrl = '/uploads/' + t.photo;
// //       return res.json({ profile: t, role: 'teacher' });
// //     } else {
// //       // generic user update
// //       const u = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-passwordHash').lean();
// //       if(!u) return res.status(404).json({ message: 'User not found' });
// //       return res.json({ profile: u, role: u.role || 'user' });
// //     }
// //   } catch (err) {
// //     console.error('PUT /profile err', err);
// //     res.status(500).json({ message: 'Server error' });
// //   }
// // });

// // // POST /api/profile/password  -> change password for student/teacher or user
// // router.post('/password', auth, async (req, res) => {
// //   try {
// //     const { current, password } = req.body || {};
// //     if (!password || password.length < 6) return res.status(400).json({ message: 'Password too short (min 6)' });

// //     const role = req.user.role;
// //     if (role === 'student') {
// //       const StudentModel = Student;
// //       const doc = await StudentModel.findById(req.user._id);
// //       if (!doc) return res.status(404).json({ message: 'Student not found' });
// //       // If current exists on model (passwordHash), verify
// //       if (doc.passwordHash) {
// //         if (!current) return res.status(400).json({ message: 'Current password required' });
// //         const ok = await bcrypt.compare(current, doc.passwordHash);
// //         if (!ok) return res.status(403).json({ message: 'Current password incorrect' });
// //       }
// //       doc.passwordHash = await bcrypt.hash(password, 10);
// //       await doc.save();
// //       return res.json({ ok: true });
// //     } else if (role === 'teacher') {
// //       const doc = await Teacher.findById(req.user._id);
// //       if (!doc) return res.status(404).json({ message: 'Teacher not found' });
// //       if (doc.passwordHash) {
// //         if (!current) return res.status(400).json({ message: 'Current password required' });
// //         const ok = await bcrypt.compare(current, doc.passwordHash);
// //         if (!ok) return res.status(403).json({ message: 'Current password incorrect' });
// //       }
// //       doc.passwordHash = await bcrypt.hash(password, 10);
// //       await doc.save();
// //       return res.json({ ok: true });
// //     } else {
// //       const doc = await User.findById(req.user._id);
// //       if (!doc) return res.status(404).json({ message: 'User not found' });
// //       if (doc.passwordHash) {
// //         if (!current) return res.status(400).json({ message: 'Current password required' });
// //         const ok = await bcrypt.compare(current, doc.passwordHash);
// //         if (!ok) return res.status(403).json({ message: 'Current password incorrect' });
// //       }
// //       doc.passwordHash = await bcrypt.hash(password, 10);
// //       await doc.save();
// //       return res.json({ ok: true });
// //     }
// //   } catch (err) {
// //     console.error('POST /profile/password err', err);
// //     res.status(500).json({ message: 'Server error' });
// //   }
// // });

// // module.exports = router;



// // backend/routes/profile.js
// const express = require('express');
// const router = express.Router();
// const auth = require('../middleware/auth');
// const roles = require('../middleware/roles');
// const Student = require('../models/Student');
// const Teacher = require('../models/Teacher');
// const User = require('../models/User');
// const bcrypt = require('bcrypt');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');
// const ProfileHelper = require('../models/Profile'); // small helper to normalize

// const uploadDir = path.join(__dirname, '..', 'uploads');
// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, uploadDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname || '');
//     cb(null, 'profile-' + Date.now() + ext);
//   }
// });
// const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// // GET /api/profile - return profile for current user
// router.get('/', auth, async (req, res) => {
//   try {
//     const uid = req.user && req.user._id;
//     if (!uid) return res.status(400).json({ message: 'Invalid user' });

//     // Try student first (common in many apps), then teacher, then user
//     // We wrap each call to avoid a single populate causing a total 500
//     const role = req.user.role;

//     // helper to attach photoUrl safely
//     const attachPhoto = (doc) => {
//       if (!doc) return doc;
//       if (doc.photo) doc.photoUrl = `/uploads/${doc.photo}`;
//       return doc;
//     };

//     if (role === 'student') {
//       try {
//         const s = await Student.findById(uid).populate('classId', 'name classId').lean().catch(()=>null);
//         if (!s) return res.status(404).json({ message: 'Student not found' });
//         attachPhoto(s);
//         const out = ProfileHelper.normalize(s, 'student');
//         return res.json({ profile: out, role: 'student' });
//       } catch (e) {
//         console.error('GET /profile student branch error', e);
//         // continue to fallback to generic user
//       }
//     } else if (role === 'teacher') {
//       try {
//         const t = await Teacher.findById(uid)
//           .populate('classIds', 'name classId')
//           .populate('subjectIds', 'name subjectId')
//           .lean()
//           .catch(()=>null);
//         if (!t) return res.status(404).json({ message: 'Teacher not found' });
//         attachPhoto(t);
//         const out = ProfileHelper.normalize(t, 'teacher');
//         return res.json({ profile: out, role: 'teacher' });
//       } catch (e) {
//         console.error('GET /profile teacher branch error', e);
//       }
//     }

//     // fallback: try User model (generic)
//     try {
//       const u = await User.findById(uid).select('-passwordHash').lean().catch(()=>null);
//       if (!u) return res.status(404).json({ message: 'User not found' });
//       if (u.photo) u.photoUrl = `/uploads/${u.photo}`;
//       const out = ProfileHelper.normalize(u, u.role || 'user');
//       return res.json({ profile: out, role: out.role || u.role || 'user' });
//     } catch (e) {
//       console.error('GET /profile user fallback error', e);
//       return res.status(500).json({ message: 'Server error' });
//     }
//   } catch (err) {
//     console.error('GET /profile err', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // PUT /api/profile - update current user's profile
// // accepts either JSON or multipart/form-data (photo)
// router.put('/', auth, upload.single('photo'), async (req, res) => {
//   try {
//     const uid = req.user && req.user._id;
//     const role = req.user && req.user.role;
//     if (!uid) return res.status(400).json({ message: 'Invalid user' });

//     const input = req.body || {};
//     const update = {};

//     if (typeof input.fullname !== 'undefined') update.fullname = String(input.fullname).trim();
//     if (typeof input.phone !== 'undefined') update.phone = String(input.phone).trim();

//     if (req.file && req.file.filename) {
//       update.photo = req.file.filename;
//     }

//     if (role === 'student') {
//       if (typeof input.classId !== 'undefined') {
//         update.classId = input.classId || undefined;
//       }
//       const s = await Student.findByIdAndUpdate(uid, update, { new: true }).populate('classId', 'name classId').lean();
//       if (!s) return res.status(404).json({ message: 'Student not found' });
//       if (s.photo) s.photoUrl = '/uploads/' + s.photo;
//       return res.json({ profile: ProfileHelper.normalize(s, 'student'), role: 'student' });
//     } else if (role === 'teacher') {
//       // classIds and subjectIds may be strings or arrays in multipart
//       if (typeof input.classIds !== 'undefined') {
//         update.classIds = Array.isArray(input.classIds) ? input.classIds : (input.classIds ? [input.classIds] : []);
//       }
//       if (typeof input.subjectIds !== 'undefined') {
//         update.subjectIds = Array.isArray(input.subjectIds) ? input.subjectIds : (input.subjectIds ? [input.subjectIds] : []);
//       }
//       if (typeof input.salary !== 'undefined') {
//         update.salary = Number(input.salary || 0);
//       }

//       const t = await Teacher.findByIdAndUpdate(uid, update, { new: true })
//         .populate('classIds', 'name classId')
//         .populate('subjectIds', 'name subjectId')
//         .lean();
//       if (!t) return res.status(404).json({ message: 'Teacher not found' });
//       if (t.photo) t.photoUrl = '/uploads/' + t.photo;
//       return res.json({ profile: ProfileHelper.normalize(t, 'teacher'), role: 'teacher' });
//     } else {
//       const u = await User.findByIdAndUpdate(uid, update, { new: true }).select('-passwordHash').lean();
//       if (!u) return res.status(404).json({ message: 'User not found' });
//       if (u.photo) u.photoUrl = '/uploads/' + u.photo;
//       return res.json({ profile: ProfileHelper.normalize(u, u.role || 'user'), role: u.role || 'user' });
//     }
//   } catch (err) {
//     console.error('PUT /profile err', err && err.stack ? err.stack : err);
//     res.status(500).json({ message: 'Server error', err: err && err.message ? err.message : String(err) });
//   }
// });

// // POST /api/profile/password - change password for student/teacher/user
// // router.post('/password', auth, async (req, res) => {
// //   try {
// //     const { current, password } = req.body || {};
// //     if (!password || String(password).length < 6) return res.status(400).json({ message: 'Password too short (min 6)' });

// //     const role = req.user.role;
// //     const uid = req.user._id;

// //     async function changeDocPassword(Model) {
// //       const doc = await Model.findById(uid);
// //       if (!doc) return res.status(404).json({ message: 'Not found' });
// //       if (doc.passwordHash) {
// //         if (!current) return res.status(400).json({ message: 'Current password required' });
// //         const ok = await bcrypt.compare(current, doc.passwordHash);
// //         if (!ok) return res.status(403).json({ message: 'Current password incorrect' });
// //       }
// //       doc.passwordHash = await bcrypt.hash(password, 10);
// //       await doc.save();
// //       return res.json({ ok: true });
// //     }

// //     if (role === 'student') return await changeDocPassword(Student);
// //     if (role === 'teacher') return await changeDocPassword(Teacher);
// //     return await changeDocPassword(User);
// //   } catch (err) {
// //     console.error('POST /profile/password err', err);
// //     res.status(500).json({ message: 'Server error' });
// //   }
// // });

// module.exports = router;


// backend/routes/profile.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const auth = require('../middleware/auth');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

function isObjectIdString(s) {
  return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s);
}

function computeStatus(fee, paid) {
  fee = (typeof fee === 'undefined') ? 0 : fee;
  paid = (typeof paid === 'undefined') ? 0 : paid;
  if (fee === 0) return 'free';
  if (paid >= fee) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

/**
 * GET /api/profile
 * - If req.user.role === 'parent' return the linked child student as the profile.
 * - Student/Teacher: return their own record
 * - Admin/manager/user: return user doc if available or token-derived minimal profile
 */
router.get('/', auth, async (req, res) => {
  try {
    const me = req.user || null;
    if (!me) return res.status(401).json({ ok: false, message: 'Auth required' });

    const normalizedRole = (me.role || '').toLowerCase();

    // Parent: return the child student record as the profile
    if (normalizedRole === 'parent') {
      try {
        // prefer childId in token payload
        let childId = me.childId || me.child || me.child_id || me.childId || null;

        // fallback: resolve from Parent collection
        if (!childId) {
          const parentId = me.id || me._id || null;
          if (parentId && isObjectIdString(String(parentId))) {
            const parentDoc = await Parent.findById(parentId).lean().catch(()=>null);
            if (parentDoc && parentDoc.childStudent) childId = String(parentDoc.childStudent);
          }
        }

        if (!childId || !isObjectIdString(String(childId))) {
          return res.status(404).json({ ok: false, message: 'Child student not found for this parent' });
        }

        const student = await Student.findById(String(childId)).populate('classId', 'name classId').lean().catch(()=>null);
        if (!student) return res.status(404).json({ ok: false, message: 'Child student not found' });

        // Derive/normalize fields expected by client
        student.paidAmount = student.paidAmount || 0;
        student.totalDue = (student.totalDue || student.fee || 0);
        student.status = student.status || computeStatus(student.fee, student.paidAmount);
        if (student.photo) student.photoUrl = `/uploads/${student.photo}`;

        return res.json({
          ok: true,
          profile: student,
          role: 'student', // make UI render student-specific fields
          meta: { viewing: 'child', parentName: me.fullname || null, childNumberId: me.childNumberId || student.numberId || null }
        });
      } catch (err) {
        console.error('GET /profile (parent) error', err && (err.stack||err));
        return res.status(500).json({ ok: false, message: 'Server error' });
      }
    }

    // Student: return own student record
    if (normalizedRole === 'student') {
      try {
        const id = me._id || me.id;
        if (!id || !isObjectIdString(String(id))) return res.status(400).json({ ok: false, message: 'Invalid id' });

        const student = await Student.findById(String(id)).populate('classId','name classId').lean().catch(()=>null);
        if (!student) return res.status(404).json({ ok: false, message: 'Student not found' });

        student.paidAmount = student.paidAmount || 0;
        student.totalDue = (student.totalDue || student.fee || 0);
        student.status = student.status || computeStatus(student.fee, student.paidAmount);
        if (student.photo) student.photoUrl = `/uploads/${student.photo}`;

        return res.json({ ok: true, profile: student, role: 'student' });
      } catch (err) {
        console.error('GET /profile (student) error', err && (err.stack||err));
        return res.status(500).json({ ok: false, message: 'Server error' });
      }
    }

    // Teacher: return teacher record
    if (normalizedRole === 'teacher') {
      try {
        const id = me._id || me.id;
        if (!id || !isObjectIdString(String(id))) return res.status(400).json({ ok: false, message: 'Invalid id' });

        const teacher = await Teacher.findById(String(id)).lean().catch(()=>null);
        if (!teacher) return res.status(404).json({ ok: false, message: 'Teacher not found' });

        return res.json({ ok: true, profile: teacher, role: 'teacher' });
      } catch (err) {
        console.error('GET /profile (teacher) error', err && (err.stack||err));
        return res.status(500).json({ ok: false, message: 'Server error' });
      }
    }

    // Admin/manager/other: try to load user doc, else fallback to token-supplied minimal user
    try {
      const id = me._id || me.id;
      let outUser = null;
      if (id && isObjectIdString(String(id))) {
        const u = await User.findById(String(id)).select('-passwordHash').lean().catch(()=>null);
        if (u) outUser = u;
      }
      if (!outUser) {
        outUser = { _id: String(me._id || me.id || ''), fullname: me.fullname || '', email: me.email || '', role: me.role || 'user' };
      }
      return res.json({ ok: true, profile: outUser, role: outUser.role || me.role || 'user' });
    } catch (err) {
      console.error('GET /profile (user) error', err && (err.stack||err));
      return res.status(500).json({ ok: false, message: 'Server error' });
    }

  } catch (err) {
    console.error('GET /profile fatal error', err && (err.stack||err));
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
