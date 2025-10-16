// backend/routes/attendances.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const Attendance = require('../models/Attendance');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const mongoose = require('mongoose');

// Helper: format YYYY-MM-DD
function fmtDate(d) {
  const dt = d ? new Date(d) : new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/* --------------------------
   Student-level summary for specific student
   GET /attendances/summary/student/:studentId?subjectId=...
   Roles: admin, manager, teacher, student, parent
   -------------------------- */
router.get('/summary/student/:studentId', auth, roles(['admin','manager','teacher','student','parent']), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subjectId } = req.query;

    if (!studentId || !mongoose.Types.ObjectId.isValid(String(studentId))) {
      return res.status(400).json({ message: 'Invalid studentId' });
    }
    const studentObjId = new mongoose.Types.ObjectId(String(studentId));

    // load student to check class/school
    const student = await Student.findById(studentObjId).lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });

    // Permission checks:
    // parent -> can only access their linked child
    if (req.user.role === 'parent') {
      // prefer token childId, fallback to Parent doc
      const childFromToken = (req.user && req.user.childId) ? String(req.user.childId) : null;
      if (childFromToken) {
        if (String(childFromToken) !== String(studentId)) return res.status(403).json({ message: 'Forbidden' });
      } else {
        const Parent = require('../models/Parent');
        const pd = await Parent.findById(req.user._id).lean().catch(()=>null);
        if (!pd || String(pd.childStudent) !== String(studentId)) return res.status(403).json({ message: 'Forbidden' });
      }
    }

    // student -> must be self
    if (req.user.role === 'student') {
      if (String(req.user._id) !== String(studentId)) return res.status(403).json({ message: 'Forbidden' });
    }

    // teacher -> only if student.classId in teacher.classIds
    if (req.user.role === 'teacher') {
      const t = await Teacher.findById(req.user._id).lean();
      if (!t) return res.status(403).json({ message: 'Teacher record not found' });
      const allowed = (t.classIds || []).map(x => String(x));
      const studentClass = (student && student.classId) ? String(student.classId) : null;
      if (!studentClass || !allowed.includes(studentClass)) return res.status(403).json({ message: 'You are not assigned to this student\'s class' });
    }

    const match = {};
    if (typeof subjectId !== 'undefined') {
      if (!subjectId || String(subjectId).trim() === '') match['subjectId'] = null;
      else {
        if (!mongoose.Types.ObjectId.isValid(String(subjectId))) return res.status(400).json({ message: 'Invalid subjectId' });
        match['subjectId'] = new mongoose.Types.ObjectId(String(subjectId));
      }
    }

    // restrict by schoolId when present on request user
    if (req.user.schoolId) try { match.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId)); } catch (e) { }

    // aggregate identical to /summary/me but for the requested student
    const pipeline = [
      { $match: match },
      { $unwind: '$records' },
      { $match: { 'records.studentId': studentObjId } },
      { $group: {
          _id: '$subjectId',
          totalPeriods: { $sum: 1 },
          presentCount: { $sum: { $cond: ['$records.present', 1, 0] } },
          absentCount: { $sum: { $cond: ['$records.present', 0, 1] } },
          totalDurationPresent: { $sum: { $cond: ['$records.present', '$records.durationMinutes', 0] } },
          lastUpdate: { $max: '$updatedAt' }
      }},
      { $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 'subject' } },
      { $unwind: { path: '$subject', preserveNullAndEmptyArrays: true } },
      { $project: {
          subjectId: '$_id',
          subjectName: { $ifNull: ['$subject.name', ''] },
          totalPeriods: 1,
          presentCount: 1,
          absentCount: 1,
          totalDurationPresent: 1,
          lastUpdate: 1,
          percent: { $cond: [{ $eq: ['$totalPeriods', 0] }, 0, { $multiply: [{ $divide: ['$presentCount', '$totalPeriods'] }, 100] }] }
      }},
      { $sort: { lastUpdate: -1 } }
    ];

    const rows = await Attendance.aggregate(pipeline).allowDiskUse(true);
    const out = (rows || []).map(r => {
      r.totalPeriods = Number(r.totalPeriods || 0);
      r.presentCount = Number(r.presentCount || 0);
      r.absentCount = Number(r.absentCount || 0);
      r.totalDurationPresent = Number(r.totalDurationPresent || 0);
      r.percent = Math.round(Number(r.percent || 0) * 100) / 100;
      return r;
    });
    return res.json({ ok: true, items: out });
  } catch (err) {
    console.error('GET /attendances/summary/student/:studentId error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* --------------------------
   Student summary: /attendances/summary/me?subjectId=...
   Roles: student, teacher, admin, manager
   -------------------------- */
router.get('/summary/me', auth, roles(['student','teacher','admin','manager']), async (req, res) => {
  try {
    const studentId = req.user._id;
    const { subjectId } = req.query;

    if (!studentId || !mongoose.Types.ObjectId.isValid(String(studentId))) {
      return res.json({ ok: true, items: [] });
    }
    const studentObjId = new mongoose.Types.ObjectId(String(studentId));

    const match = {};
    if (typeof subjectId !== 'undefined') {
      if (!subjectId || String(subjectId).trim() === '') match['subjectId'] = null;
      else {
        if (!mongoose.Types.ObjectId.isValid(String(subjectId))) return res.status(400).json({ message: 'Invalid subjectId' });
        match['subjectId'] = new mongoose.Types.ObjectId(String(subjectId));
      }
    }

    if (req.user.schoolId) try { match.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId)); } catch (e) { }

    const pipeline = [
      { $match: match },
      { $unwind: '$records' },
      { $match: { 'records.studentId': studentObjId } },
      { $group: {
          _id: '$subjectId',
          totalPeriods: { $sum: 1 },
          presentCount: { $sum: { $cond: ['$records.present', 1, 0] } },
          absentCount: { $sum: { $cond: ['$records.present', 0, 1] } },
          totalDurationPresent: { $sum: { $cond: ['$records.present', '$records.durationMinutes', 0] } },
          lastUpdate: { $max: '$updatedAt' }
      }},
      { $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 'subject' } },
      { $unwind: { path: '$subject', preserveNullAndEmptyArrays: true } },
      { $project: {
          subjectId: '$_id',
          subjectName: { $ifNull: ['$subject.name', ''] },
          totalPeriods: 1,
          presentCount: 1,
          absentCount: 1,
          totalDurationPresent: 1,
          lastUpdate: 1,
          percent: { $cond: [{ $eq: ['$totalPeriods', 0] }, 0, { $multiply: [{ $divide: ['$presentCount', '$totalPeriods'] }, 100] }] }
      }},
      { $sort: { lastUpdate: -1 } }
    ];

    const rows = await Attendance.aggregate(pipeline).allowDiskUse(true);
    const out = (rows || []).map(r => {
      r.totalPeriods = Number(r.totalPeriods || 0);
      r.presentCount = Number(r.presentCount || 0);
      r.absentCount = Number(r.absentCount || 0);
      r.totalDurationPresent = Number(r.totalDurationPresent || 0);
      r.percent = Math.round(Number(r.percent || 0) * 100) / 100;
      return r;
    });
    return res.json({ ok: true, items: out });
  } catch (err) {
    console.error('GET /attendances/summary/me error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* --------------------------
   Class-level summary
   GET /attendances/summary/class/:classId?subjectId=...
   Roles: admin, manager, teacher
   -------------------------- */
router.get('/summary/class/:classId', auth, roles(['admin','manager','teacher']), async (req, res) => {
  try {
    const { classId } = req.params;
    const { subjectId } = req.query;
    if (!classId || !mongoose.Types.ObjectId.isValid(String(classId))) return res.status(400).json({ message: 'Invalid classId' });
    const classObjId = new mongoose.Types.ObjectId(String(classId));

    if (req.user.role === 'teacher') {
      const t = await Teacher.findById(req.user._id).lean();
      if (!t) return res.status(403).json({ message: 'Teacher record not found' });
      const allowed = (t.classIds || []).map(x => String(x));
      if (!allowed.includes(String(classId))) return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    const match = { classId: classObjId };
    if (typeof subjectId !== 'undefined') {
      if (!subjectId || String(subjectId).trim() === '') match.subjectId = null;
      else {
        if (!mongoose.Types.ObjectId.isValid(String(subjectId))) return res.status(400).json({ message: 'Invalid subjectId' });
        match.subjectId = new mongoose.Types.ObjectId(String(subjectId));
      }
    }
    if (req.user.schoolId) try { match.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId)); } catch (e){}

    const pipeline = [
      { $match: match },
      { $unwind: '$records' },
      { $group: {
          _id: '$records.studentId',
          totalPeriods: { $sum: 1 },
          presentCount: { $sum: { $cond: ['$records.present', 1, 0] } },
          absentCount: { $sum: { $cond: ['$records.present', 0, 1] } },
          totalDurationPresent: { $sum: { $cond: ['$records.present', '$records.durationMinutes', 0] } },
          lastUpdate: { $max: '$updatedAt' }
      }},
      { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 'student' } },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      { $project: {
          studentId: '$_id',
          fullname: '$student.fullname',
          numberId: '$student.numberId',
          photo: '$student.photo',
          totalPeriods: 1,
          presentCount: 1,
          absentCount: 1,
          totalDurationPresent: 1,
          lastUpdate: 1,
          percent: { $cond: [{ $eq: ['$totalPeriods', 0] }, 0, { $multiply: [{ $divide: ['$presentCount', '$totalPeriods'] }, 100] }] }
      }},
      { $sort: { percent: -1, fullname: 1 } }
    ];

    const rows = await Attendance.aggregate(pipeline).allowDiskUse(true);
    const out = (rows || []).map(r => {
      if (r.photo) r.photoUrl = `/uploads/${r.photo}`;
      r.totalPeriods = Number(r.totalPeriods || 0);
      r.presentCount = Number(r.presentCount || 0);
      r.absentCount = Number(r.absentCount || 0);
      r.totalDurationPresent = Number(r.totalDurationPresent || 0);
      r.percent = Math.round(Number(r.percent || 0) * 100) / 100;
      return r;
    });
    res.json({ ok: true, items: out });
  } catch (err) {
    console.error('GET /attendances/summary/class error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* --------------------------
   Paginated list (for history/list UI)
   GET /attendances/list/:classId
   -------------------------- */
router.get('/list/:classId', auth, roles(['admin','manager','teacher']), async (req, res) => {
  try {
    const { classId } = req.params;
    const { page = 1, limit = 50, subjectId } = req.query;
    if (!classId) return res.status(400).json({ message: 'classId required' });

    if (req.user.role === 'teacher') {
      const t = await Teacher.findById(req.user._id).lean();
      if (!t) return res.status(403).json({ message: 'Teacher record not found' });
      const allowed = (t.classIds || []).map(x => String(x));
      if (!allowed.includes(String(classId))) return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    const q = {};
    q.classId = mongoose.Types.ObjectId.isValid(String(classId)) ? new mongoose.Types.ObjectId(String(classId)) : classId;
    if (typeof subjectId !== 'undefined') {
      q.subjectId = subjectId ? (mongoose.Types.ObjectId.isValid(String(subjectId)) ? new mongoose.Types.ObjectId(String(subjectId)) : subjectId) : null;
    }
    if (req.user.schoolId) {
      try { q.schoolId = mongoose.Types.ObjectId.isValid(String(req.user.schoolId)) ? new mongoose.Types.ObjectId(String(req.user.schoolId)) : req.user.schoolId; } catch(e){}
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(1000, parseInt(limit, 10) || 50));

    const rows = await Attendance.find(q)
      .sort({ date: -1, createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .populate('teacherId', 'fullname')
      .lean();

    for (const r of rows) {
      r.teacherName = (r.teacherId && typeof r.teacherId === 'object') ? r.teacherId.fullname : (r.teacherId || null);
      r.recordsCount = (r.records || []).length;
      if (r.subjectId) {
        try {
          const s = await Subject.findById(r.subjectId).select('name').lean().catch(()=>null);
          if (s) r.subjectName = s.name;
        } catch (e) {}
      } else r.subjectName = null;
    }

    const total = await Attendance.countDocuments(q);
    return res.json({ items: rows, total, page: p, limit: l });
  } catch (err) {
    console.error('GET /attendances/list/:classId error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* --------------------------
   Attendance history for class (admin/manager; teacher sees only their own)
   GET /attendances/history/:classId
   -------------------------- */
router.get('/history/:classId', auth, roles(['admin','manager','teacher']), async (req, res) => {
  try {
    const { classId } = req.params;
    const { subjectId } = req.query;
    if (!classId) return res.status(400).json({ message: 'classId required' });

    const q = {};
    q.classId = mongoose.Types.ObjectId.isValid(String(classId)) ? new mongoose.Types.ObjectId(String(classId)) : classId;
    if (typeof subjectId !== 'undefined') {
      q.subjectId = subjectId ? (mongoose.Types.ObjectId.isValid(String(subjectId)) ? new mongoose.Types.ObjectId(String(subjectId)) : subjectId) : null;
    }
    if (req.user.schoolId) {
      try { q.schoolId = mongoose.Types.ObjectId.isValid(String(req.user.schoolId)) ? new mongoose.Types.ObjectId(String(req.user.schoolId)) : req.user.schoolId; } catch(e){}
    }

    if (req.user.role === 'teacher') {
      const t = await Teacher.findById(req.user._id).lean();
      if (!t) return res.status(403).json({ message: 'Teacher not found' });
      const allowed = (t.classIds || []).map(x => String(x));
      if (!allowed.includes(String(classId))) return res.status(403).json({ message: 'Not allowed to view history for this class' });
      q.teacherId = req.user._id; // only show the teacher's own saved rows
    }

    let items = await Attendance.find(q)
      .sort({ date: -1, createdAt: -1 })
      .limit(1000)
      .populate('teacherId', 'fullname')
      .lean();

    for (const it of items) {
      it.teacherName = (it.teacherId && typeof it.teacherId === 'object') ? it.teacherId.fullname : (it.teacherId || null);
      if (it.subjectId) {
        try {
          const s = await Subject.findById(it.subjectId).select('name').lean().catch(()=>null);
          if (s) it.subjectName = s.name;
        } catch (e) {}
      } else it.subjectName = null;
    }

    const studentIdSet = new Set();
    items.forEach(it => { (it.records || []).forEach(r => { if (r && r.studentId) studentIdSet.add(String(r.studentId)); }); });

    if (studentIdSet.size > 0) {
      const studentIds = Array.from(studentIdSet).filter(id => mongoose.Types.ObjectId.isValid(String(id))).map(id => new mongoose.Types.ObjectId(String(id)));
      const students = await Student.find({ _id: { $in: studentIds } }).select('fullname').lean();
      const studentMap = new Map((students || []).map(s => [String(s._id), s.fullname]));
      items.forEach(it => {
        if (it.records && Array.isArray(it.records)) {
          it.records = it.records.map(r => {
            const sid = String(r.studentId || '');
            return { ...r, studentName: studentMap.get(sid) || null };
          });
        }
      });
    }

    return res.json({ items });
  } catch (err) {
    console.error('GET /attendances/history error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* --------------------------
   Create / update attendance (POST /attendances)
   Supports:
     - single edit by _id (same as before)
     - single upsert by classId+date+subjectId (same as before)
     - batch mode: body.items = [ { classId, subjectId, date, records, teacherId? }, ... ]
   Roles: admin, manager, teacher
   -------------------------- */
   router.post('/', auth, roles(['admin','manager','teacher']), async (req, res) => {
    try {
      // helper to format date (uses existing fmtDate in file)
      const processSingle = async (payload) => {
        // payload can be { _id?, id?, classId, subjectId, date, records = [], teacherId? }
        const { _id, id, classId, subjectId, date, records = [], teacherId: postedTeacherId } = payload || {};
  
        if (!classId) return { ok: false, status: 400, message: 'classId required', item: payload };
  
        const dt = date ? fmtDate(date) : fmtDate(new Date());
        const qClassId = mongoose.Types.ObjectId.isValid(String(classId)) ? new mongoose.Types.ObjectId(String(classId)) : classId;
  
        // decide teacherId (teachers can't impersonate others)
        let teacherId = req.user._id;
        if (req.user.role !== 'teacher' && postedTeacherId) {
          teacherId = mongoose.Types.ObjectId.isValid(String(postedTeacherId)) ? new mongoose.Types.ObjectId(String(postedTeacherId)) : postedTeacherId;
        }
  
        // teacher permission: teacher may only act on their classes
        if (req.user.role === 'teacher') {
          const t = await Teacher.findById(req.user._id).lean();
          if (!t) return { ok: false, status: 403, message: 'Teacher record not found', item: payload };
          const allowed = (t.classIds || []).map(x => String(x));
          if (!allowed.includes(String(classId))) return { ok: false, status: 403, message: 'You are not assigned to this class', item: payload };
        }
  
        // normalize records
        const normalized = (records || []).map(r => {
          let sid = r.studentId;
          if (sid && mongoose.Types.ObjectId.isValid(String(sid))) sid = new mongoose.Types.ObjectId(String(sid));
          return { studentId: sid, present: !!r.present, note: r.note || '', durationMinutes: Number(r.durationMinutes || 0) };
        });
  
        // Edit by id -> stricter ownership check for teachers
        if (_id || id) {
          const aid = _id || id;
          const q = mongoose.Types.ObjectId.isValid(String(aid)) ? { _id: new mongoose.Types.ObjectId(String(aid)) } : { _id: aid };
          const existing = await Attendance.findOne(q).lean();
          if (!existing) return { ok: false, status: 404, message: 'Attendance not found', item: payload };
  
          if (req.user.role === 'teacher') {
            if (!existing.teacherId || String(existing.teacherId) !== String(req.user._id)) return { ok: false, status: 403, message: 'You may only edit attendance you created', item: payload };
            const t = await Teacher.findById(req.user._id).lean();
            const allowed = (t.classIds || []).map(x => String(x));
            if (!allowed.includes(String(existing.classId))) return { ok: false, status: 403, message: 'You are not assigned to this class', item: payload };
          }
  
          const update = {
            $set: {
              records: normalized,
              updatedAt: new Date(),
              teacherId: teacherId,
              date: dt,
              classId: qClassId,
              schoolId: req.user.schoolId || undefined
            }
          };
          if (typeof subjectId !== 'undefined') {
            update.$set.subjectId = subjectId ? (mongoose.Types.ObjectId.isValid(String(subjectId)) ? new mongoose.Types.ObjectId(String(subjectId)) : subjectId) : null;
          }
          if (typeof update.$set.schoolId === 'undefined') delete update.$set.schoolId;
          if (typeof update.$set.subjectId === 'undefined') delete update.$set.subjectId;
  
          const att = await Attendance.findOneAndUpdate(q, update, { new: true }).lean();
          return { ok: true, attendance: att };
        }
  
        // Upsert by classId + date + subjectId
        const query = { classId: qClassId, date: dt };
        if (typeof subjectId !== 'undefined') {
          query.subjectId = subjectId ? (mongoose.Types.ObjectId.isValid(String(subjectId)) ? new mongoose.Types.ObjectId(String(subjectId)) : subjectId) : null;
        }
  
        const update = {
          $set: {
            records: normalized,
            updatedAt: new Date(),
            teacherId: teacherId,
            schoolId: req.user.schoolId || undefined
          },
          $setOnInsert: { createdAt: new Date() }
        };
  
        const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
  
        try {
          const att = await Attendance.findOneAndUpdate(query, update, opts).lean();
          return { ok: true, attendance: att };
        } catch (errUpsert) {
          // fallback when upsert race/duplicate occurs: find existing and update
          console.warn('Upsert failed, attempt fallback', errUpsert && errUpsert.message);
          try {
            const existing = await Attendance.findOne(query).lean();
            if (existing && existing._id) {
              const att = await Attendance.findByIdAndUpdate(existing._id, { $set: { records: normalized, updatedAt: new Date(), teacherId, schoolId: req.user.schoolId || undefined } }, { new: true }).lean();
              return { ok: true, attendance: att, fallback: true };
            }
            // If no existing was found, rethrow
            throw errUpsert;
          } catch (fallbackErr) {
            // bubble specific error
            return { ok: false, status: 500, message: fallbackErr && fallbackErr.message ? fallbackErr.message : String(fallbackErr), item: payload };
          }
        }
      }; // end processSingle
  
      // If batch mode: body.items is an array -> process each item
      if (Array.isArray(req.body.items) && req.body.items.length > 0) {
        const items = req.body.items;
        const results = [];
        for (const it of items) {
          try {
            const r = await processSingle(it);
            // normalize response object per item
            if (r && r.ok) results.push({ ok: true, attendance: r.attendance, fallback: r.fallback || false });
            else results.push({ ok: false, message: r.message || 'Failed', status: r.status || 500, item: it });
          } catch (e) {
            console.error('Batch item processing error', e && e.stack ? e.stack : e);
            results.push({ ok: false, message: e && e.message ? e.message : String(e), item: it });
          }
        }
        return res.json({ ok: true, results });
      }
  
      // Otherwise treat as single (legacy) request: use the same payload shape as before
      const singlePayload = {
        _id: req.body._id || req.body.id,
        id: req.body.id,
        classId: req.body.classId,
        subjectId: typeof req.body.subjectId !== 'undefined' ? req.body.subjectId : undefined,
        date: req.body.date,
        records: req.body.records || [],
        teacherId: req.body.teacherId
      };
  
      const singleRes = await processSingle(singlePayload);
      if (singleRes && singleRes.ok) return res.json({ ok: true, attendance: singleRes.attendance, fallback: singleRes.fallback || false });
  
      // handle known failures
      if (singleRes && singleRes.status) return res.status(singleRes.status).json({ message: singleRes.message || 'Error', item: singleRes.item });
      return res.status(500).json({ message: singleRes && singleRes.message ? singleRes.message : 'Server error' });
  
    } catch (err) {
      console.error('POST /attendances error', err && err.stack ? err.stack : err);
      if (err && err.code === 11000) return res.status(400).json({ message: 'Attendance already exists (unique constraint)' });
      res.status(500).json({ message: 'Server error', err: err && err.message ? err.message : String(err) });
    }
  });
  
/* --------------------------
   GET attendance by class+date+subject (view)
   GET /attendances?classId=...&date=...&subjectId=...
   Roles: admin, manager, teacher
   -------------------------- */
router.get('/', auth, roles(['admin','manager','teacher']), async (req, res) => {
  try {
    const { classId, date, subjectId } = req.query;
    if (!classId) return res.status(400).json({ message: 'classId required' });
    const dt = date ? fmtDate(date) : fmtDate(new Date());

    if (req.user.role === 'teacher') {
      const t = await Teacher.findById(req.user._id).lean();
      if (!t) return res.status(403).json({ message: 'Teacher record not found' });
      const allowed = (t.classIds || []).map(x => String(x));
      if (!allowed.includes(String(classId))) return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    const qClassId = mongoose.Types.ObjectId.isValid(String(classId)) ? new mongoose.Types.ObjectId(String(classId)) : classId;
    const query = { classId: qClassId, date: dt };
    if (typeof subjectId !== 'undefined') {
      query.subjectId = subjectId ? (mongoose.Types.ObjectId.isValid(String(subjectId)) ? new mongoose.Types.ObjectId(String(subjectId)) : subjectId) : null;
    }

    const att = await Attendance.findOne(query).lean();
    if (!att) return res.json({ attendance: null, ok: true });

    if (att.teacherId && mongoose.Types.ObjectId.isValid(String(att.teacherId))) {
      const t = await Teacher.findById(att.teacherId).select('fullname').lean();
      if (t) att.teacherName = t.fullname || null;
    } else {
      att.teacherName = att.teacherId || null;
    }

    const studentIds = (att.records || []).map(r => String(r.studentId)).filter(Boolean).filter(id => mongoose.Types.ObjectId.isValid(String(id))).map(id => new mongoose.Types.ObjectId(String(id)));
    if (studentIds.length > 0) {
      const students = await Student.find({ _id: { $in: studentIds } }).select('fullname').lean();
      const map = new Map((students || []).map(s => [String(s._id), s.fullname]));
      att.records = (att.records || []).map(r => ({ ...r, studentName: map.get(String(r.studentId)) || null }));
    }
    if (att.subjectId) {
      const subj = await Subject.findById(att.subjectId).select('name').lean().catch(()=>null);
      if (subj) att.subjectName = subj.name;
    }

    res.json({ attendance: att, ok: true });
  } catch (err) {
    console.error('GET /attendances error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* --------------------------
   GET attendance by id (for editing)
   GET /attendances/:id
   -------------------------- */
router.get('/:id', auth, roles(['admin','manager','teacher']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'id required' });
    const q = mongoose.Types.ObjectId.isValid(String(id)) ? { _id: new mongoose.Types.ObjectId(String(id)) } : { _id: id };
    const att = await Attendance.findOne(q).lean();
    if (!att) return res.status(404).json({ message: 'Attendance not found' });

    if (req.user.role === 'teacher') {
      const t = await Teacher.findById(req.user._id).lean();
      if (!t) return res.status(403).json({ message: 'Teacher not found' });
      const allowed = (t.classIds || []).map(x => String(x));
      if (!allowed.includes(String(att.classId))) return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    if (att.teacherId && mongoose.Types.ObjectId.isValid(String(att.teacherId))) {
      const t = await Teacher.findById(att.teacherId).select('fullname').lean();
      if (t) att.teacherName = t.fullname || null;
    } else {
      att.teacherName = att.teacherId || null;
    }
    const studentIds = (att.records || []).map(r => String(r.studentId)).filter(Boolean).filter(id => mongoose.Types.ObjectId.isValid(String(id))).map(id => new mongoose.Types.ObjectId(String(id)));
    if (studentIds.length > 0) {
      const students = await Student.find({ _id: { $in: studentIds } }).select('fullname').lean();
      const map = new Map((students || []).map(s => [String(s._id), s.fullname]));
      att.records = (att.records || []).map(r => ({ ...r, studentName: map.get(String(r.studentId)) || null }));
    }
    if (att.subjectId) {
      const subj = await Subject.findById(att.subjectId).select('name').lean().catch(()=>null);
      if (subj) att.subjectName = subj.name;
    }

    res.json({ ok: true, attendance: att });
  } catch (err) {
    console.error('GET /attendances/:id error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* --------------------------
   DELETE attendance by id
   DELETE /attendances/:id
   Roles: admin, manager, teacher (teacher only deletes their own)
   -------------------------- */
router.delete('/:id', auth, roles(['admin','manager','teacher']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'id required' });
    const q = mongoose.Types.ObjectId.isValid(String(id)) ? { _id: new mongoose.Types.ObjectId(String(id)) } : { _id: id };
    const att = await Attendance.findOne(q).lean();
    if (!att) return res.status(404).json({ message: 'Attendance not found' });

    if (req.user.role === 'teacher') {
      if (!att.teacherId || String(att.teacherId) !== String(req.user._id)) return res.status(403).json({ message: 'You may only delete attendance you created' });
      const t = await Teacher.findById(req.user._id).lean();
      const allowed = (t.classIds || []).map(x => String(x));
      if (!allowed.includes(String(att.classId))) return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    await Attendance.findOneAndDelete(q);
    return res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error('DELETE /attendances/:id error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* --------------------------
   Clear by class/subject (manager or teacher - teacher limited to their own saved rows)
   POST /attendances/clear
   -------------------------- */
router.post('/clear', auth, roles(['manager','teacher']), async (req, res) => {
  try {
    const { classId, subjectId } = req.body;
    if (!classId) return res.status(400).json({ message: 'classId required' });

    const q = {};
    q.classId = mongoose.Types.ObjectId.isValid(String(classId)) ? new mongoose.Types.ObjectId(String(classId)) : classId;
    if (typeof subjectId !== 'undefined') {
      if (subjectId === null || String(subjectId).trim() === '') q.subjectId = null;
      else q.subjectId = mongoose.Types.ObjectId.isValid(String(subjectId)) ? new mongoose.Types.ObjectId(String(subjectId)) : subjectId;
    }
    if (req.user.role === 'teacher') q.teacherId = req.user._id;
    if (req.user.schoolId) {
      q.schoolId = mongoose.Types.ObjectId.isValid(String(req.user.schoolId)) ? new mongoose.Types.ObjectId(String(req.user.schoolId)) : req.user.schoolId;
    }

    const result = await Attendance.deleteMany(q);
    console.info('ATTENDANCE CLEAR: query=', q, 'deleted=', result.deletedCount);
    return res.json({ ok: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('POST /attendances/clear error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
