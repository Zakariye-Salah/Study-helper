// backend/controllers/resultsController.js
const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const ClassModel = require('../models/Class');
const ParentModel = require('../models/Parent');

/** compute total & average for a result object (mutates) */
function computeTotalsForResult(result) {
  const marks = Array.isArray(result.marks) ? result.marks : [];
  let total = 0, count = 0;
  for (const m of marks) {
    if (typeof m.mark === 'number' && !isNaN(m.mark)) { total += m.mark; count++; }
  }
  result.total = total;
  result.average = count ? (total / count) : 0;
}

/**
 * listStudentResults
 * - students: GET /api/results  -> returns their results (uses token's req.user._id)
 * - parent: GET /api/results  -> returns their child's results (uses token childId or Parent lookup)
 * - admin/manager: GET /api/results?studentId=... -> returns that student's results
 *
 * Response: { ok:true, results: [...] }
 */
exports.listStudentResults = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const role = (req.user.role || '').toLowerCase();
    const isPrivileged = (role === 'admin' || role === 'manager');

    // robust requester id (some tokens use id, some _id)
    const requesterId = req.user._id || req.user.id || null;

    // Determine which studentId to load:
    let studentId = null;
    if (isPrivileged && req.query && req.query.studentId) {
      studentId = String(req.query.studentId).trim();
    } else if (role === 'parent') {
      // parent should view their linked child
      if (req.user.childId) {
        studentId = String(req.user.childId);
      } else {
        // fallback to parent lookup
        try {
          const parentDoc = await ParentModel.findById(requesterId).lean().catch(()=>null);
          if (parentDoc && parentDoc.childStudent) studentId = String(parentDoc.childStudent);
        } catch (e) {
          studentId = null;
        }
      }
    } else {
      // student or other roles: use token's user id
      studentId = String(requesterId);
    }

    if (!studentId) return res.status(400).json({ ok:false, error: 'studentId required or parent not linked to a student' });

    // Build flexible query so we don't crash if studentId isn't an ObjectId
    let studentObjectId = null;
    if (mongoose.isValidObjectId(studentId)) studentObjectId = new mongoose.Types.ObjectId(studentId);

    // Base results query: find exams that include a result for this student
    const resultsQuery = studentObjectId
      ? { 'results.studentId': studentObjectId }
      : { 'results.studentId': studentId };

    // If manager, limit exams to those they own or that belong to their school (defensive)
    if (role === 'manager') {
      const or = [{ createdBy: String(requesterId) }];
      if (req.user.schoolId) or.push({ schoolId: req.user.schoolId });
      // add $and to ensure resultsQuery + ownership/ school filter
      resultsQuery.$and = resultsQuery.$and || [];
      resultsQuery.$and.push({ $or: or });
    }

    const exams = await Exam.find(resultsQuery).lean().exec();

    const output = [];

    // optionally preload student doc to enrich output
    let studentDoc = null;
    try {
      if (mongoose.isValidObjectId(studentId)) studentDoc = await Student.findById(studentId).lean().exec().catch(()=>null);
      else studentDoc = await Student.findOne({ $or: [{ _id: studentId }, { numberId: studentId }, { customId: studentId }] }).lean().exec().catch(()=>null);
    } catch (e) { studentDoc = null; }

    // optionally load class name for student
    let classNameFromStudent = null;
    if (studentDoc && studentDoc.classId) {
      try {
        const cls = await ClassModel.findById(String(studentDoc.classId)).lean().exec().catch(()=>null);
        if (cls && cls.name) classNameFromStudent = cls.name;
      } catch (e) { classNameFromStudent = null; }
    }

    for (const exam of exams) {
      const rawResults = Array.isArray(exam.results) ? exam.results.map(r => ({ ...r })) : [];
      if (!rawResults.length) continue;

      // compute totals for all entries
      for (const rr of rawResults) {
        if (typeof rr.total !== 'number' || typeof rr.average !== 'number') computeTotalsForResult(rr);
      }

      // overall ranking
      rawResults.sort((a,b) => (b.total || 0) - (a.total || 0));
      rawResults.forEach((r,i) => r.rank = i+1);

      // class ranking map
      const classGroups = {};
      rawResults.forEach(r => {
        const cid = String(r.classId || '');
        classGroups[cid] = classGroups[cid] || [];
        classGroups[cid].push(r);
      });
      const classRankMap = {};
      Object.keys(classGroups).forEach(cid => {
        classGroups[cid].sort((a,b) => (b.total||0) - (a.total||0)).forEach((r,i) => {
          classRankMap[`${cid}::${String(r.studentId)}`] = i+1;
        });
      });

      // find the student's result (match both ObjectId and string)
      const myResult = rawResults.find(r => {
        if (!r || !r.studentId) return false;
        return String(r.studentId) === String(studentId) || (studentObjectId && String(r.studentId) === String(studentObjectId));
      });
      if (!myResult) continue;

      // ensure totals computed for myResult
      computeTotalsForResult(myResult);

      // class name (prefer studentDoc class name)
      let className = classNameFromStudent || null;
      if (!className && myResult.classId) {
        try {
          const cls = await ClassModel.findById(String(myResult.classId)).lean().exec().catch(()=>null);
          if (cls && cls.name) className = cls.name;
        } catch(e) { className = null; }
      }

      output.push({
        examId: exam._id,
        examTitle: exam.title || '',
        examCode: exam.examCode || '',
        studentId: String(studentId),
        studentFullname: (studentDoc && studentDoc.fullname) || (myResult.student && myResult.student.fullname) || null,
        studentPhone: (studentDoc && studentDoc.phone) || (myResult.student && myResult.student.phone) || null,
        studentPhoto: (studentDoc && (studentDoc.photoUrl || studentDoc.photo || studentDoc.avatar)) || (myResult.student && (myResult.student.photoUrl || myResult.student.photo || myResult.student.avatar)) || null,
        studentNumberId: (studentDoc && (studentDoc.numberId || studentDoc.number)) || (myResult.student && myResult.student.numberId) || null,
        classId: myResult.classId || null,
        className: className || (myResult.student && myResult.student.className) || null,
        marks: myResult.marks || [],
        total: myResult.total || 0,
        average: myResult.average || 0,
        rankOverall: myResult.rank || null,
        rankClass: classRankMap[`${String(myResult.classId||'')}::${String(myResult.studentId)}`] || null,
        files: myResult.uploadedImages || [],
        createdAt: myResult.createdAt || exam.createdAt || null
      });
    }

    // newest first
    output.sort((a,b) => (b.createdAt ? new Date(b.createdAt) : 0) - (a.createdAt ? new Date(a.createdAt) : 0));

    return res.json({ ok: true, results: output });
  } catch (err) {
    console.error('resultsController.listStudentResults error:', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error fetching results' });
  }
};

/**
 * getResultForExam - returns a single student's result for a given exam id
 * Admin/manager may pass ?studentId=... ; parents and students rely on token mapping
 */
exports.getResultForExam = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok:false, error: 'Unauthorized' });

    const role = (req.user.role || '').toLowerCase();
    const isPrivileged = (role === 'admin' || role === 'manager');
    const requesterId = req.user._id || req.user.id || null;

    const examId = req.params.examId;
    if (!examId || !mongoose.isValidObjectId(examId)) return res.status(400).json({ ok:false, error: 'Invalid exam id' });

    const exam = await Exam.findById(examId).lean().exec();
    if (!exam) return res.status(404).json({ ok:false, error: 'Exam not found' });

    // managers must have access
    if (role === 'manager') {
      const owns = String(exam.createdBy || '') === String(requesterId);
      const sameSchool = req.user.schoolId && String(exam.schoolId || '') === String(req.user.schoolId);
      if (!owns && !sameSchool) return res.status(403).json({ ok:false, error: 'Forbidden' });
    }

    // determine studentId
    let studentId = null;
    if (isPrivileged && req.query && req.query.studentId) {
      studentId = String(req.query.studentId).trim();
    } else if (role === 'parent') {
      if (req.user.childId) studentId = String(req.user.childId);
      else {
        const parentDoc = await ParentModel.findById(requesterId).lean().catch(()=>null);
        if (parentDoc && parentDoc.childStudent) studentId = String(parentDoc.childStudent);
      }
    } else {
      studentId = String(requesterId);
    }

    if (!studentId) return res.status(400).json({ ok:false, error: 'studentId required' });

    const allResults = Array.isArray(exam.results) ? exam.results.map(r => ({ ...r })) : [];
    if (!allResults.length) return res.status(404).json({ ok:false, error: 'No results for this exam' });

    // compute totals & ranking
    for (const rr of allResults) {
      if (typeof rr.total !== 'number' || typeof rr.average !== 'number') computeTotalsForResult(rr);
    }
    allResults.sort((a,b) => (b.total || 0) - (a.total || 0));
    allResults.forEach((r,i) => r.rank = i+1);

    const my = allResults.find(r => r && (String(r.studentId) === String(studentId)));
    if (!my) return res.status(404).json({ ok:false, error: 'Result not found for this exam' });

    // compute class ranking map
    const classGroups = {};
    allResults.forEach(r => {
      const cid = String(r.classId || '');
      classGroups[cid] = classGroups[cid] || [];
      classGroups[cid].push(r);
    });
    const classRankMap = {};
    Object.keys(classGroups).forEach(cid => {
      classGroups[cid].sort((a,b) => (b.total||0) - (a.total||0)).forEach((r,i) => {
        classRankMap[`${cid}::${String(r.studentId)}`] = i+1;
      });
    });

    // optionally enrich student & class data
    let studentDoc = null, cls = null;
    try {
      if (mongoose.isValidObjectId(studentId)) studentDoc = await Student.findById(studentId).lean().exec().catch(()=>null);
      else studentDoc = await Student.findOne({ $or: [{ _id: studentId }, { numberId: studentId }, { customId: studentId }] }).lean().exec().catch(()=>null);
    } catch (e) { studentDoc = null; }
    if (my.classId) {
      try { cls = await ClassModel.findById(String(my.classId)).lean().exec().catch(()=>null); } catch(e){ cls = null; }
    }

    const response = {
      examId: exam._id,
      examTitle: exam.title || '',
      examCode: exam.examCode || '',
      studentId: String(studentId),
      studentFullname: (studentDoc && studentDoc.fullname) || (my.student && my.student.fullname) || null,
      studentPhone: (studentDoc && studentDoc.phone) || (my.student && my.student.phone) || null,
      studentPhoto: (studentDoc && (studentDoc.photoUrl || studentDoc.photo || studentDoc.avatar)) || (my.student && (my.student.photoUrl || my.student.photo || my.student.avatar)) || null,
      studentNumberId: (studentDoc && studentDoc.numberId) || null,
      className: (cls && cls.name) || (my && my.className) || null,
      marks: my.marks || [],
      total: my.total || 0,
      average: my.average || 0,
      rankOverall: my.rank || null,
      rankClass: classRankMap[`${String(my.classId||'')}::${String(my.studentId)}`] || null,
      files: my.uploadedImages || []
    };

    return res.json({ ok: true, result: response });
  } catch (err) {
    console.error('resultsController.getResultForExam error:', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error fetching result' });
  }
};
