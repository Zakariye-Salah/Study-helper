// controllers/resultsController.js (replace corresponding functions)

const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const ClassModel = require('../models/Class');
const ParentModel = require('../models/Parent');

function computeTotalsForResult(result) {
  const marks = Array.isArray(result.marks) ? result.marks : [];
  let total = 0, count = 0;
  for (const m of marks) {
    if (typeof m.mark === 'number' && !isNaN(m.mark)) { total += m.mark; count++; }
  }
  result.total = total;
  result.average = count ? (total / count) : 0;
}

function getBaseUrl(req) {
  try {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedHost = req.headers['x-forwarded-host'] || req.headers['x-forwarded-server'];
    if (forwardedProto && forwardedHost) {
      return `${forwardedProto.split(',')[0].trim()}://${forwardedHost.split(',')[0].trim()}`.replace(/\/$/, '');
    }
    if (forwardedProto && req.get('host')) {
      return `${forwardedProto.split(',')[0].trim()}://${req.get('host')}`.replace(/\/$/, '');
    }
    const proto = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    return `${proto}://${host}`.replace(/\/$/, '');
  } catch (e) {
    return `${req.protocol || 'http'}://${req.get('host') || 'localhost'}`.replace(/\/$/, '');
  }
}

function toAbsoluteUrlMaybe(req, raw) {
  if (!raw) return null;
  try {
    // object candidate
    if (typeof raw === 'object') {
      const cand = raw.url || raw.path || raw.file || raw.filename || raw.src || raw.location || raw.fullUrl || null;
      if (!cand) return null;
      raw = cand;
    }
    const s = String(raw || '').trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    const base = getBaseUrl(req) || (req.protocol + '://' + req.get('host'));
    if (s.startsWith('/')) return (base + s).replace(/([^:]\/)\/+/g, '$1');
    return (base + '/' + s).replace(/([^:]\/)\/+/g, '$1');
  } catch (e) {
    return String(raw);
  }
}

function extractName(raw) {
  if (!raw) return 'file';
  try {
    if (typeof raw === 'object') {
      return raw.filename || raw.name || raw.originalname || raw.file || (raw.url ? String(raw.url).split('/').pop() : 'file');
    }
    const s = String(raw);
    if (!s) return 'file';
    return s.split('/').pop().split('?')[0].split('#')[0] || s;
  } catch (e) {
    return String(raw);
  }
}

exports.listStudentResults = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const role = (req.user.role || '').toLowerCase();
    const isPrivileged = (role === 'admin' || role === 'manager');
    const requesterId = req.user._id || req.user.id || null;

    let studentId = null;
    if (isPrivileged && req.query && req.query.studentId) studentId = String(req.query.studentId).trim();
    else if (role === 'parent') {
      if (req.user.childId) studentId = String(req.user.childId);
      else {
        const parentDoc = await ParentModel.findById(requesterId).lean().catch(()=>null);
        if (parentDoc && parentDoc.childStudent) studentId = String(parentDoc.childStudent);
      }
    } else {
      studentId = String(requesterId);
    }

    if (!studentId) return res.status(400).json({ ok:false, error: 'studentId required or parent not linked to a student' });

    let studentObjectId = null;
    if (mongoose.isValidObjectId(studentId)) studentObjectId = new mongoose.Types.ObjectId(studentId);

    const resultsQuery = studentObjectId ? { 'results.studentId': studentObjectId } : { 'results.studentId': studentId };

    if (role === 'manager') {
      const or = [{ createdBy: String(requesterId) }];
      if (req.user.schoolId) or.push({ schoolId: req.user.schoolId });
      resultsQuery.$and = resultsQuery.$and || [];
      resultsQuery.$and.push({ $or: or });
    }

    const exams = await Exam.find(resultsQuery).lean().exec();
    const output = [];

    let studentDoc = null;
    try {
      if (mongoose.isValidObjectId(studentId)) studentDoc = await Student.findById(studentId).lean().exec().catch(()=>null);
      else studentDoc = await Student.findOne({ $or: [{ _id: studentId }, { numberId: studentId }, { customId: studentId }] }).lean().exec().catch(()=>null);
    } catch (e) { studentDoc = null; }

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

      for (const rr of rawResults) {
        if (typeof rr.total !== 'number' || typeof rr.average !== 'number') computeTotalsForResult(rr);
      }
      rawResults.sort((a,b) => (b.total || 0) - (a.total || 0));
      rawResults.forEach((r,i) => r.rank = i+1);

      // class rank map
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

      const myResult = rawResults.find(r => r && r.studentId && (String(r.studentId) === String(studentId) || (studentObjectId && String(r.studentId) === String(studentObjectId))));
      if (!myResult) continue;

      computeTotalsForResult(myResult);

      let className = classNameFromStudent || null;
      if (!className && myResult.classId) {
        try {
          const cls = await ClassModel.findById(String(myResult.classId)).lean().exec().catch(()=>null);
          if (cls && cls.name) className = cls.name;
        } catch(e) { className = null; }
      }

      let studentPhoto = null;
      if (studentDoc && (studentDoc.photoUrl || studentDoc.photo || studentDoc.avatar)) {
        studentPhoto = toAbsoluteUrlMaybe(req, studentDoc.photoUrl || studentDoc.photo || studentDoc.avatar);
      } else if (myResult.student && (myResult.student.photoUrl || myResult.student.photo || myResult.student.avatar)) {
        studentPhoto = toAbsoluteUrlMaybe(req, myResult.student.photoUrl || myResult.student.photo || myResult.student.avatar);
      } else {
        studentPhoto = null;
      }

      const storedFiles = myResult.uploadedImages || myResult.uploadedFiles || myResult.files || [];
      const filesObjs = Array.isArray(storedFiles)
        ? storedFiles.map(f => {
            const url = toAbsoluteUrlMaybe(req, f);
            const name = extractName(f);
            return url ? { url, name } : null;
          }).filter(Boolean)
        : [];

      output.push({
        examId: exam._id,
        examTitle: exam.title || '',
        examCode: exam.examCode || '',
        studentId: String(studentId),
        studentFullname: (studentDoc && studentDoc.fullname) || (myResult.student && myResult.student.fullname) || null,
        studentPhone: (studentDoc && studentDoc.phone) || (myResult.student && myResult.student.phone) || null,
        studentPhoto: studentPhoto,
        studentNumberId: (studentDoc && (studentDoc.numberId || studentDoc.number)) || (myResult.student && myResult.student.numberId) || null,
        classId: myResult.classId || null,
        className: className || (myResult.student && myResult.student.className) || null,
        marks: myResult.marks || [],
        total: myResult.total || 0,
        average: myResult.average || 0,
        rankOverall: myResult.rank || null,
        rankClass: classRankMap[`${String(myResult.classId||'')}::${String(myResult.studentId)}`] || null,
        files: filesObjs,
        createdAt: myResult.createdAt || exam.createdAt || null
      });
    }

    output.sort((a,b) => (b.createdAt ? new Date(b.createdAt) : 0) - (a.createdAt ? new Date(a.createdAt) : 0));
    return res.json({ ok: true, results: output });
  } catch (err) {
    console.error('resultsController.listStudentResults error:', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error fetching results' });
  }
};

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

    if (role === 'manager') {
      const owns = String(exam.createdBy || '') === String(requesterId);
      const sameSchool = req.user.schoolId && String(exam.schoolId || '') === String(req.user.schoolId);
      if (!owns && !sameSchool) return res.status(403).json({ ok:false, error: 'Forbidden' });
    }

    let studentId = null;
    if (isPrivileged && req.query && req.query.studentId) studentId = String(req.query.studentId).trim();
    else if (role === 'parent') {
      if (req.user.childId) studentId = String(req.user.childId);
      else {
        const parentDoc = await ParentModel.findById(requesterId).lean().catch(()=>null);
        if (parentDoc && parentDoc.childStudent) studentId = String(parentDoc.childStudent);
      }
    } else studentId = String(requesterId);

    if (!studentId) return res.status(400).json({ ok:false, error: 'studentId required' });

    const allResults = Array.isArray(exam.results) ? exam.results.map(r => ({ ...r })) : [];
    if (!allResults.length) return res.status(404).json({ ok:false, error: 'No results for this exam' });

    for (const rr of allResults) {
      if (typeof rr.total !== 'number' || typeof rr.average !== 'number') computeTotalsForResult(rr);
    }
    allResults.sort((a,b) => (b.total || 0) - (a.total || 0));
    allResults.forEach((r,i) => r.rank = i+1);

    const my = allResults.find(r => r && (String(r.studentId) === String(studentId)));
    if (!my) return res.status(404).json({ ok:false, error: 'Result not found for this exam' });

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

    let studentDoc = null, cls = null;
    try {
      if (mongoose.isValidObjectId(studentId)) studentDoc = await Student.findById(studentId).lean().exec().catch(()=>null);
      else studentDoc = await Student.findOne({ $or: [{ _id: studentId }, { numberId: studentId }, { customId: studentId }] }).lean().exec().catch(()=>null);
    } catch (e) { studentDoc = null; }
    if (my.classId) {
      try { cls = await ClassModel.findById(String(my.classId)).lean().exec().catch(()=>null); } catch(e){ cls = null; }
    }

    const studentPhoto = (studentDoc && (studentDoc.photoUrl || studentDoc.photo || studentDoc.avatar)) ? toAbsoluteUrlMaybe(req, studentDoc.photoUrl || studentDoc.photo || studentDoc.avatar) :
                         (my.student && (my.student.photoUrl || my.student.photo || my.student.avatar)) ? toAbsoluteUrlMaybe(req, my.student.photoUrl || my.student.photo || my.student.avatar) :
                         null;

    const storedFiles = my.uploadedImages || my.uploadedFiles || my.files || [];
    const filesObjs = Array.isArray(storedFiles)
      ? storedFiles.map(f => {
          const url = toAbsoluteUrlMaybe(req, f);
          const name = extractName(f);
          return url ? { url, name } : null;
        }).filter(Boolean)
      : [];

    const response = {
      examId: exam._id,
      examTitle: exam.title || '',
      examCode: exam.examCode || '',
      studentId: String(studentId),
      studentFullname: (studentDoc && studentDoc.fullname) || (my.student && my.student.fullname) || null,
      studentPhone: (studentDoc && studentDoc.phone) || (my.student && my.student.phone) || null,
      studentPhoto: studentPhoto,
      studentNumberId: (studentDoc && studentDoc.numberId) || null,
      className: (cls && cls.name) || (my && my.className) || null,
      marks: my.marks || [],
      total: my.total || 0,
      average: my.average || 0,
      rankOverall: my.rank || null,
      rankClass: classRankMap[`${String(my.classId||'')}::${String(my.studentId)}`] || null,
      files: filesObjs
    };

    return res.json({ ok: true, result: response });
  } catch (err) {
    console.error('resultsController.getResultForExam error:', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error fetching result' });
  }
};
