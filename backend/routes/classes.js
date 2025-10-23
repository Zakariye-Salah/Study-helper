// // backend/routes/classes.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');
// const auth = require('../middleware/auth');
// const roles = require('../middleware/roles');
// const Class = require('../models/Class');
// const Student = require('../models/Student');
// const Subject = require('../models/Subject');
// const User = require('../models/User');

// // helper to generate classId like CLSDDMMn
// async function generateClassId(schoolId) {
//   const now = new Date();
//   const dd = String(now.getDate()).padStart(2, '0');
//   const mm = String(now.getMonth() + 1).padStart(2, '0');
//   const prefix = `CLS${dd}${mm}`;
//   const last = await Class.findOne({ schoolId, classId: new RegExp(`^${prefix}`), deleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
//   if (!last || !last.classId) return `${prefix}1`;
//   const tail = last.classId.replace(prefix, '');
//   const seq = Number(tail) || 0;
//   return `${prefix}${seq + 1}`;
// }

// // create class (owner set). auto-generate classId if omitted
// router.post('/', auth, roles(['admin','manager']), async (req,res)=>{
//   try{
//     let { name, classId, subjectIds = [] } = req.body;
//     if(!name) return res.status(400).json({ message: 'Name required' });

//     if (!classId || !String(classId).trim()) {
//       classId = await generateClassId(req.user.schoolId);
//     } else classId = String(classId).trim();

//     // normalize subjectIds to array
//     if (!Array.isArray(subjectIds)) {
//       if (!subjectIds) subjectIds = [];
//       else subjectIds = typeof subjectIds === 'string' ? [subjectIds] : Array.from(subjectIds);
//     }

//     // ensure unique classId for this school (ignore deleted)
//     const existing = await Class.findOne({ classId, schoolId: req.user.schoolId, deleted: { $ne: true } });
//     if (existing) return res.status(400).json({ message: 'classId exists for this school' });

//     const c = new Class({ name, classId, subjectIds, schoolId: req.user.schoolId, createdBy: req.user._id });
//     await c.save();
//     res.json(c);
//   }catch(err){
//     console.error('POST /classes error', err && err.message);
//     res.status(500).json({ message: 'Server error', err: err.message });
//   }
// });

// // list classes - students/teachers see school-level, managers/admin see only their created classes
// router.get('/', auth, roles(['admin','manager','teacher','student']), async (req,res)=>{
//   try{
//     const { search = '', page = 1, limit = 50 } = req.query;
//     const p = Math.max(1, parseInt(page || 1, 10));
//     const l = Math.max(1, Math.min(500, parseInt(limit || 50, 10)));
//     const q = { deleted: { $ne: true } };
//     if(search) q.$or = [{ name: new RegExp(search,'i') }, { classId: new RegExp(search,'i') }];

//     if (['student','teacher'].includes(req.user.role)) {
//       q.schoolId = req.user.schoolId;
//     } else {
//       // manager/admin: show classes they created
//       q.createdBy = req.user._id;
//     }

//     const items = await Class.find(q).limit(l).skip((p-1)*l).sort({ createdAt:-1 }).populate('subjectIds','name subjectId').lean();
//     const total = await Class.countDocuments(q);
//     res.json({ items, total });
//   }catch(err){
//     console.error('GET /classes error', err && err.message);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // GET class details: populated subjects + students in this class (respecting visibility)
// router.get('/:id', auth, roles(['admin','manager','teacher','student']), async (req,res)=>{
//   try{
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const cls = await Class.findById(id).populate('subjectIds','name subjectId').lean();
//     if(!cls || cls.deleted) return res.status(404).json({ message:'Not found' });

//     // visibility checks
//     if (['student','teacher'].includes(req.user.role)) {
//       if (String(cls.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message:'Forbidden' });
//     } else {
//       if (String(cls.createdBy) !== String(req.user._id)) return res.status(403).json({ message:'Forbidden' });
//     }

//     // find students in this class, excluding deleted students
//     const sQuery = { classId: cls._id, deleted: { $ne: true } };
//     if (['student','teacher'].includes(req.user.role)) {
//       sQuery.schoolId = req.user.schoolId;
//     } else {
//       sQuery.createdBy = req.user._id;
//     }
//     const students = await Student.find(sQuery).select('fullname numberId phone status photo').lean();

//     res.json({ class: cls, students });
//   }catch(err){
//     console.error('GET /classes/:id error', err && err.message);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // update (owner-only)
// router.put('/:id', auth, roles(['admin','manager']), async (req,res)=>{
//   try{
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const doc = await Class.findById(id);
//     if(!doc || doc.deleted) return res.status(404).json({ message:'Not found' });
//     if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message:'Forbidden' });

//     const { classId } = req.body;
//     if (classId && String(classId).trim() !== doc.classId) {
//       const exists = await Class.findOne({ classId: String(classId).trim(), schoolId: req.user.schoolId, deleted: { $ne: true } });
//       if (exists) return res.status(400).json({ message: 'classId already exists for this school' });
//     }

//     if (req.body.subjectIds && !Array.isArray(req.body.subjectIds)) {
//       req.body.subjectIds = req.body.subjectIds ? (Array.isArray(req.body.subjectIds) ? req.body.subjectIds : [req.body.subjectIds]) : [];
//     }

//     const c = await Class.findByIdAndUpdate(id, req.body, { new:true }).populate('subjectIds','name subjectId').lean();
//     res.json(c);
//   }catch(err){
//     console.error('PUT /classes/:id error', err && err.message);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // delete (soft-delete owner-only)
// router.delete('/:id', auth, roles(['admin','manager']), async (req,res)=>{
//   try{
//     const id = req.params.id;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

//     const doc = await Class.findById(id);
//     if(!doc) return res.json({ ok:true });
//     if (doc.deleted) return res.json({ ok:true, alreadyDeleted:true });

//     if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message:'Forbidden' });

//     doc.deleted = true;
//     doc.deletedAt = new Date();
//     doc.deletedBy = { id: req.user._id, role: req.user.role, name: (req.user.fullname || req.user.name || '') };
//     await doc.save();

//     // keep students & teachers referencing the class — permanent deletion will clean references.
//     res.json({ ok:true, deleted: 'soft' });
//   }catch(err){
//     console.error('DELETE /classes/:id error', err && err.message);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // POST /api/classes/:id/move
// // body: { studentIds?: [id,...] , targetClassId: <id>, moveAll?: boolean }
// // Permissions: admin, manager OR (teacher with permission flag moveStudents)
// router.post('/:id/move', auth, async (req, res) => {
//   try {
//     const sourceClassId = req.params.id;
//     const { studentIds = [], targetClassId, moveAll = false } = req.body || {};

//     if (!targetClassId) return res.status(400).json({ message: 'targetClassId required' });
//     if (String(sourceClassId) === String(targetClassId)) return res.status(400).json({ message: 'targetClassId must differ' });

//     // load classes
//     const src = await Class.findById(sourceClassId).lean().exec();
//     const dest = await Class.findById(targetClassId).lean().exec();
//     if (!src || src.deleted || !dest || dest.deleted) return res.status(404).json({ message: 'Source or target class not found' });

//     // tenant checks
//     if (['student','teacher'].includes(req.user.role)) {
//       if (String(src.schoolId) !== String(req.user.schoolId) || String(dest.schoolId) !== String(req.user.schoolId)) {
//         return res.status(403).json({ message: 'Forbidden' });
//       }
//     } else {
//       if (req.user.role === 'manager') {
//         if (String(src.schoolId) !== String(req.user.schoolId) || String(dest.schoolId) !== String(req.user.schoolId)) {
//           return res.status(403).json({ message: 'Forbidden' });
//         }
//         if (String(src.createdBy) !== String(req.user._id) || String(dest.createdBy) !== String(req.user._id)) {
//           return res.status(403).json({ message: 'Forbidden' });
//         }
//       }
//       // admin bypass
//     }

//     // teacher permission check
//     const isAdmin = req.user.role === 'admin';
//     const isManager = req.user.role === 'manager';
//     const isTeacher = req.user.role === 'teacher';
//     if (!isAdmin && !isManager && isTeacher) {
//       const userDoc = await User.findById(req.user._id).select('permissions').lean().exec();
//       if (!userDoc || !userDoc.permissions || !userDoc.permissions.moveStudents) {
//         return res.status(403).json({ message: 'Forbidden' });
//       }
//     }

//     // decide which students to move
//     let studentsToMoveQuery = { classId: sourceClassId, deleted: { $ne: true } };
//     if (!moveAll) {
//       if (!Array.isArray(studentIds) || studentIds.length === 0) {
//         return res.status(400).json({ message: 'No students specified and moveAll not set' });
//       }
//       studentsToMoveQuery._id = { $in: studentIds };
//     }

//     if (src.schoolId) studentsToMoveQuery.schoolId = src.schoolId;

//     // update students to new class and assign dest.subjectIds
//     const session = await Class.startSession();
//     let result;
//     try {
//       session.startTransaction();

//       const students = await Student.find(studentsToMoveQuery).select('_id fullname').lean().session(session);
//       if (!students || students.length === 0) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(404).json({ message: 'No students to move' });
//       }

//       const update = {
//         $set: {
//           classId: dest._id,
//           subjectIds: Array.isArray(dest.subjectIds) ? dest.subjectIds : []
//         }
//       };

//       const u = await Student.updateMany(
//         { _id: { $in: students.map(s => s._id) } },
//         update,
//         { session }
//       );

//       await session.commitTransaction();
//       session.endSession();

//       result = { movedCount: (u.nModified || u.modifiedCount || u.n || 0), students: students };
//     } catch (txErr) {
//       console.warn('Transaction failed, fallback', txErr && txErr.message);
//       try { await session.abortTransaction(); } catch(e) {/*ignore*/}
//       session.endSession();

//       const students = await Student.find(studentsToMoveQuery).select('_id fullname').lean();
//       if (!students || students.length === 0) return res.status(404).json({ message: 'No students to move' });

//       const u = await Student.updateMany(
//         { _id: { $in: students.map(s => s._id) } },
//         { $set: { classId: dest._id, subjectIds: Array.isArray(dest.subjectIds) ? dest.subjectIds : [] } }
//       );

//       result = { movedCount: (u.nModified || u.modifiedCount || u.n || 0), students: students, fallback:true };
//     }

//     return res.json({ ok:true, message: 'Students moved', moved: result.movedCount, students: result.students });
//   } catch (err) {
//     console.error('POST /classes/:id/move error', err && (err.stack || err));
//     return res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;


// backend/routes/classes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const User = require('../models/User');

// helper to generate classId like CLSDDMMn
async function generateClassId(schoolId) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `CLS${dd}${mm}`;
  const last = await Class.findOne({ schoolId, classId: new RegExp(`^${prefix}`), deleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
  if (!last || !last.classId) return `${prefix}1`;
  const tail = last.classId.replace(prefix, '');
  const seq = Number(tail) || 0;
  return `${prefix}${seq + 1}`;
}

// create class (owner set). auto-generate classId if omitted
router.post('/', auth, roles(['admin','manager']), async (req,res)=>{
  try{
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

    let { name, classId, subjectIds = [] } = req.body;
    if(!name) return res.status(400).json({ message: 'Name required' });

    if (!classId || !String(classId).trim()) {
      classId = await generateClassId(req.user.schoolId);
    } else classId = String(classId).trim();

    // normalize subjectIds to array
    if (!Array.isArray(subjectIds)) {
      if (!subjectIds) subjectIds = [];
      else subjectIds = typeof subjectIds === 'string' ? [subjectIds] : Array.from(subjectIds);
    }

    // ensure unique classId for this school (ignore deleted)
    const existing = await Class.findOne({ classId, schoolId: req.user.schoolId, deleted: { $ne: true } });
    if (existing) return res.status(400).json({ message: 'classId exists for this school' });

    const c = new Class({ name, classId, subjectIds, schoolId: req.user.schoolId, createdBy: req.user._id });
    await c.save();
    res.json(c);
  }catch(err){
    console.error('POST /classes error', err && err.message);
    res.status(500).json({ message: 'Server error', err: err.message });
  }
});

// list classes - students/teachers see school-level, managers/admin see only their created classes
router.get('/', auth, roles(['admin','manager','teacher','student']), async (req,res)=>{
  try{
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

    const { search = '', page = 1, limit = 50 } = req.query;
    const p = Math.max(1, parseInt(page || 1, 10));
    const l = Math.max(1, Math.min(500, parseInt(limit || 50, 10)));
    const q = { deleted: { $ne: true } };
    if(search) q.$or = [{ name: new RegExp(search,'i') }, { classId: new RegExp(search,'i') }];

    if (['student','teacher'].includes(req.user.role)) {
      q.schoolId = req.user.schoolId;
    } else {
      // manager/admin: show classes they created
      q.createdBy = req.user._id;
    }

    const items = await Class.find(q).limit(l).skip((p-1)*l).sort({ createdAt:-1 }).populate('subjectIds','name subjectId').lean();
    const total = await Class.countDocuments(q);
    res.json({ items, total });
  }catch(err){
    console.error('GET /classes error', err && err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET class details: populated subjects + students in this class (respecting visibility)
router.get('/:id', auth, roles(['admin','manager','teacher','student']), async (req,res)=>{
  try{
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const cls = await Class.findById(id).populate('subjectIds','name subjectId').lean();
    if(!cls || cls.deleted) return res.status(404).json({ message:'Not found' });

    // visibility checks
    if (['student','teacher'].includes(req.user.role)) {
      if (String(cls.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message:'Forbidden' });
    } else {
      if (String(cls.createdBy) !== String(req.user._id)) return res.status(403).json({ message:'Forbidden' });
    }

    // find students in this class, excluding deleted students
    const sQuery = { classId: cls._id, deleted: { $ne: true } };
    if (['student','teacher'].includes(req.user.role)) {
      sQuery.schoolId = req.user.schoolId;
    } else {
      sQuery.createdBy = req.user._id;
    }
    const students = await Student.find(sQuery).select('fullname numberId phone status photo').lean();

    res.json({ class: cls, students });
  }catch(err){
    console.error('GET /classes/:id error', err && err.message);
    res.status(500).json({ message: 'Server error' });
  }
});


// GET /classes/:id/subjects  - return populated subjects for a class
router.get('/:id/subjects', auth, roles(['admin','manager','teacher','student']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const cls = await Class.findById(id).select('subjectIds schoolId deleted createdBy').populate('subjectIds','name subjectId').lean();
    if (!cls || cls.deleted) return res.status(404).json({ message: 'Not found' });

    // visibility: student/teacher may read if same school, manager/admin must be owner or admin (keep same policy as GET /:id)
    if (['student','teacher'].includes(req.user.role)) {
      if (String(cls.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message: 'Forbidden' });
    } else {
      if (String(cls.createdBy) !== String(req.user._id)) {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const subjects = Array.isArray(cls.subjectIds) ? cls.subjectIds : [];
    return res.json({ ok: true, subjects });
  } catch (err) {
    console.error('GET /classes/:id/subjects error', err && (err.stack || err));
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /classes/:id/teachers - return teachers assigned to this class
router.get('/:id/teachers', auth, roles(['admin','manager','teacher','student']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const cls = await Class.findById(id).select('schoolId deleted createdBy').lean();
    if (!cls || cls.deleted) return res.status(404).json({ message: 'Not found' });

    // visibility checks
    if (['student','teacher'].includes(req.user.role)) {
      if (String(cls.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message: 'Forbidden' });
    } else {
      // manager/admin: allow if same school and manager is owner (or admin bypass)
      if (req.user.role === 'manager') {
        if (String(cls.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message: 'Forbidden' });
        // manager may view teachers for their school; keep optional stricter check commented
        // if (String(cls.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });
      }
    }

    // find teachers that have this class in their classIds and aren't deleted
    const Teacher = require('../models/Teacher');
    const q = { deleted: { $ne: true }, classIds: { $in: [ mongoose.Types.ObjectId(id) ] } };
    // restrict to same school for non-admin safety
    if (req.user.role !== 'admin') q.schoolId = cls.schoolId;

    const teachers = await Teacher.find(q).select('fullname subjectIds classIds phone photo').populate('subjectIds','name subjectId').lean();
    // add photoUrl if needed — consistent with /teachers route
    teachers.forEach(t => { if (t.photo) t.photoUrl = `${req.protocol}://${req.get('host')}/uploads/${t.photo}`; });

    return res.json({ ok: true, teachers });
  } catch (err) {
    console.error('GET /classes/:id/teachers error', err && (err.stack || err));
    return res.status(500).json({ message: 'Server error' });
  }
});

// update (owner-only)
router.put('/:id', auth, roles(['admin','manager']), async (req,res)=>{
  try{
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const doc = await Class.findById(id);
    if(!doc || doc.deleted) return res.status(404).json({ message:'Not found' });
    if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message:'Forbidden' });

    const { classId } = req.body;
    if (classId && String(classId).trim() !== doc.classId) {
      const exists = await Class.findOne({ classId: String(classId).trim(), schoolId: req.user.schoolId, deleted: { $ne: true } });
      if (exists) return res.status(400).json({ message: 'classId already exists for this school' });
    }

    if (req.body.subjectIds && !Array.isArray(req.body.subjectIds)) {
      req.body.subjectIds = req.body.subjectIds ? (Array.isArray(req.body.subjectIds) ? req.body.subjectIds : [req.body.subjectIds]) : [];
    }

    const c = await Class.findByIdAndUpdate(id, req.body, { new:true }).populate('subjectIds','name subjectId').lean();
    res.json(c);
  }catch(err){
    console.error('PUT /classes/:id error', err && err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// delete (soft-delete owner-only)
router.delete('/:id', auth, roles(['admin','manager']), async (req,res)=>{
  try{
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const doc = await Class.findById(id);
    if(!doc) return res.json({ ok:true });
    if (doc.deleted) return res.json({ ok:true, alreadyDeleted:true });

    if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message:'Forbidden' });

    doc.deleted = true;
    doc.deletedAt = new Date();
    doc.deletedBy = { id: req.user._id, role: req.user.role, name: (req.user.fullname || req.user.name || '') };
    await doc.save();

    // keep students & teachers referencing the class — permanent deletion will clean references.
    res.json({ ok:true, deleted: 'soft' });
  }catch(err){
    console.error('DELETE /classes/:id error', err && err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/classes/:id/move
// body: { studentIds?: [id,...] , targetClassId: <id>, moveAll?: boolean }
router.post('/:id/move', auth, async (req, res) => {
  try {
    if (req.user && (req.user.disabled || req.user.suspended)) return res.status(403).json({ message: 'Your account is not allowed to perform this action' });

    const sourceClassId = req.params.id;
    const { studentIds = [], targetClassId, moveAll = false } = req.body || {};

    if (!targetClassId) return res.status(400).json({ message: 'targetClassId required' });
    if (String(sourceClassId) === String(targetClassId)) return res.status(400).json({ message: 'targetClassId must differ' });

    // load classes
    const src = await Class.findById(sourceClassId).lean().exec();
    const dest = await Class.findById(targetClassId).lean().exec();
    if (!src || src.deleted || !dest || dest.deleted) return res.status(404).json({ message: 'Source or target class not found' });

    // tenant checks
    if (['student','teacher'].includes(req.user.role)) {
      if (String(src.schoolId) !== String(req.user.schoolId) || String(dest.schoolId) !== String(req.user.schoolId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else {
      if (req.user.role === 'manager') {
        if (String(src.schoolId) !== String(req.user.schoolId) || String(dest.schoolId) !== String(req.user.schoolId)) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        if (String(src.createdBy) !== String(req.user._id) || String(dest.createdBy) !== String(req.user._id)) {
          return res.status(403).json({ message: 'Forbidden' });
        }
      }
      // admin bypass
    }

    // teacher permission check
    const isAdmin = req.user.role === 'admin';
    const isManager = req.user.role === 'manager';
    const isTeacher = req.user.role === 'teacher';
    if (!isAdmin && !isManager && isTeacher) {
      const userDoc = await User.findById(req.user._id).select('permissions').lean().exec();
      if (!userDoc || !userDoc.permissions || !userDoc.permissions.moveStudents) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    // decide which students to move
    let studentsToMoveQuery = { classId: sourceClassId, deleted: { $ne: true } };
    if (!moveAll) {
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ message: 'No students specified and moveAll not set' });
      }
      studentsToMoveQuery._id = { $in: studentIds };
    }

    if (src.schoolId) studentsToMoveQuery.schoolId = src.schoolId;

    // update students to new class and assign dest.subjectIds
    const session = await Class.startSession();
    let result;
    try {
      session.startTransaction();

      const students = await Student.find(studentsToMoveQuery).select('_id fullname').lean().session(session);
      if (!students || students.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'No students to move' });
      }

      const update = {
        $set: {
          classId: dest._id,
          subjectIds: Array.isArray(dest.subjectIds) ? dest.subjectIds : []
        }
      };

      const u = await Student.updateMany(
        { _id: { $in: students.map(s => s._id) } },
        update,
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      result = { movedCount: (u.nModified || u.modifiedCount || u.n || 0), students: students };
    } catch (txErr) {
      console.warn('Transaction failed, fallback', txErr && txErr.message);
      try { await session.abortTransaction(); } catch(e) {/*ignore*/}
      session.endSession();

      const students = await Student.find(studentsToMoveQuery).select('_id fullname').lean();
      if (!students || students.length === 0) return res.status(404).json({ message: 'No students to move' });

      const u = await Student.updateMany(
        { _id: { $in: students.map(s => s._id) } },
        { $set: { classId: dest._id, subjectIds: Array.isArray(dest.subjectIds) ? dest.subjectIds : [] } }
      );

      result = { movedCount: (u.nModified || u.modifiedCount || u.n || 0), students: students, fallback:true };
    }

    return res.json({ ok:true, message: 'Students moved', moved: result.movedCount, students: result.students });
  } catch (err) {
    console.error('POST /classes/:id/move error', err && (err.stack || err));
    return res.status(500).json({ message: 'Server error' });
  }
});

// --- Timetable routes ---
// GET /classes/:id/timetable
router.get('/:id/timetable', auth, roles(['admin','manager','teacher','student']), async (req,res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
    const cls = await Class.findById(id).select('timetable schoolId createdBy deleted').lean();
    if (!cls || cls.deleted) return res.status(404).json({ message: 'Not found' });

    // visibility: student/teacher may read if same school, manager/admin must be owner or admin
    if (['student','teacher'].includes(req.user.role)) {
      if (String(cls.schoolId) !== String(req.user.schoolId)) return res.status(403).json({ message: 'Forbidden' });
    } else {
      if (String(cls.createdBy) !== String(req.user._id)) {
        // allow admin but forbid manager if not owner
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
      }
    }

    return res.json({ ok: true, timetable: cls.timetable || null });
  } catch (err) {
    console.error('GET /classes/:id/timetable error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /classes/:id/timetable  (create/update)
router.put('/:id/timetable', auth, roles(['admin','manager']), async (req,res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const cls = await Class.findById(id);
    if (!cls || cls.deleted) return res.status(404).json({ message: 'Not found' });

    // only owner manager/admin can change
    if (String(cls.createdBy) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // validate incoming data minimally
    const { name = '', days = [], periods = [] } = req.body || {};
    const safeDays = Array.isArray(days) ? days.map(d => String(d).trim()).filter(Boolean) : [];
    const safePeriods = Array.isArray(periods) ? periods : [];

    cls.timetable = {
      name: String(name || (cls.name || '')).trim(),
      days: safeDays,
      periods: safePeriods,
      updatedAt: new Date()
    };

    await cls.save();
    return res.json({ ok: true, timetable: cls.timetable });
  } catch (err) {
    console.error('PUT /classes/:id/timetable error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /classes/:id/timetable
router.delete('/:id/timetable', auth, roles(['admin','manager']), async (req,res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const cls = await Class.findById(id);
    if (!cls || cls.deleted) return res.status(404).json({ message: 'Not found' });

    if (String(cls.createdBy) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    cls.timetable = null;
    await cls.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /classes/:id/timetable error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
