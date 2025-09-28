// backend/routes/exam.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const ClassModel = require('../models/Class'); // ensure this is the correct path/name
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

// storage for uploads
const uploadDir = path.join(process.cwd(), 'uploads', 'exams');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random()*1e9) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage });

// helper: get user from bearer token (robust / normalizes common id fields)
function getUserFromReq(req) {
  const possibleAuth = req.headers.authorization || req.headers['x-access-token'] || req.query.token || req.body.token;
  if (!possibleAuth) return null;
  const token = String(possibleAuth).replace(/^Bearer\s*/i, '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload._id) {
      if (payload.id) payload._id = payload.id;
      else if (payload.userId) payload._id = payload.userId;
      else if (payload.sub) payload._id = payload.sub;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

// Guard middleware
function requireAuth(req, res, next) {
  const user = getUserFromReq(req);
  if (!user || !user._id) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

// Utilities
function computeTotalsForResult(result) {
  const marks = result.marks || [];
  let total = 0;
  let count = 0;
  for (const m of marks) {
    if (typeof m.mark === 'number' && !isNaN(m.mark)) {
      total += m.mark;
      count++;
    }
  }
  result.total = total;
  result.average = count ? (total / count) : 0;
}

function generateExamCode() {
  return 'EXAM-' + Date.now().toString(36) + '-' + Math.round(Math.random()*1e6).toString(36);
}

// Create an exam
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!user.role || !['admin','manager'].includes(String(user.role).toLowerCase())) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { title, classes = [], subjects = [], schoolId } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const createdById = user._id ? String(user._id) : (user.id ? String(user.id) : null);
    if (!createdById) return res.status(401).json({ error: 'Unauthorized' });

    const exam = new Exam({
      title,
      examCode: generateExamCode(),
      createdBy: new mongoose.Types.ObjectId(createdById),
      createdByName: user.fullname || user.name || null,
      schoolId: schoolId || user.schoolId || null,
      classes: Array.isArray(classes) ? classes.map(c => (mongoose.isValidObjectId(String(c)) ? new mongoose.Types.ObjectId(String(c)) : String(c))) : [],
      subjects: Array.isArray(subjects) ? subjects : []
    });

    await exam.save();
    return res.json({ ok: true, exam });
  } catch (e) {
    console.warn('create exam error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// List exams
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const q = {};
    if (String(user.role).toLowerCase() === 'manager') {
      q.$or = [{ createdBy: user._id }];
      if (user.schoolId) q.$or.push({ schoolId: user.schoolId });
    }
    const exams = await Exam.find(q).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, exams });
  } catch (e) {
    console.error('list exams error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get exam details (enriched)
router.get('/:examId', requireAuth, async (req, res) => {
  try {
    const { examId } = req.params;
    const user = req.user;
    if (!mongoose.isValidObjectId(examId)) return res.status(400).json({ error: 'Invalid exam id' });

    const exam = await Exam.findById(examId).lean();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    if (String(user.role).toLowerCase() === 'manager') {
      if (String(exam.createdBy) !== String(user._id) && String(exam.schoolId) !== String(user.schoolId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const results = (exam.results || []).map(r => ({ ...r }));
    const studentIds = results.map(r => r.studentId).filter(Boolean);

    // batch fetch students and classes
    const students = studentIds.length ? await Student.find({ _id: { $in: studentIds } }).lean() : [];
    const byStudentId = {};
    const classIds = new Set();
    students.forEach(s => {
      byStudentId[String(s._id)] = s;
      if (s.classId) classIds.add(String(s.classId));
    });

    let classesById = {};
    if (classIds.size) {
      const arr = await ClassModel.find({ _id: { $in: Array.from(classIds) } }).lean();
      arr.forEach(c => { classesById[String(c._id)] = c; });
    }

    results.forEach(r => {
      const s = byStudentId[String(r.studentId)] || null;
      if (s) {
        // include multiple photo fields so frontend can choose (photoUrl, photo, avatar)
        r.student = {
          _id: s._id,
          fullname: s.fullname,
          phone: s.phone,
          photoUrl: s.photoUrl || null,
          photo: s.photo || null,
          avatar: s.avatar || null,
          numberId: s.numberId || null,
          classId: s.classId || null,
          className: s.classId ? (classesById[String(s.classId)] ? classesById[String(s.classId)].name : null) : null
        };
      } else {
        r.student = null;
      }
    });

    results.sort((a,b) => (b.total || 0) - (a.total || 0));
    results.forEach((r,i) => { r.rank = i+1; });

    res.json({ ok: true, exam: { ...exam, results } });
  } catch (e) {
    console.error('get exam error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload result images for a result (multiple images) - only manager/admin
// NOTE: multer runs before handler; if result not found we remove uploaded files to avoid orphan files.
router.post('/:examId/results/:resultId/images', requireAuth, upload.array('images', 6), async (req, res) => {
  try {
    const user = req.user;
    const { examId, resultId } = req.params;
    if (!mongoose.isValidObjectId(examId)) {
      // delete uploaded files if any
      if (req.files && req.files.length) {
        req.files.forEach(f => {
          try { fs.unlinkSync(f.path); } catch(e){/*ignore*/ }
        });
      }
      return res.status(400).json({ error: 'Invalid exam id' });
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
      if (req.files && req.files.length) {
        req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e){} });
      }
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (String(user.role).toLowerCase() === 'manager') {
      if (String(exam.createdBy) !== String(user._id) && String(exam.schoolId) !== String(user.schoolId)) {
        if (req.files && req.files.length) {
          req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e){} });
        }
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const files = req.files || [];
    const urls = files.map(f => `/uploads/exams/${f.filename}`);

    const r = exam.results.id(resultId);
    if (!r) {
      // remove uploaded files (to avoid orphan files) and return 404
      if (files.length) {
        files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e){} });
      }
      return res.status(404).json({ error: 'Result not found' });
    }

    r.uploadedImages = (r.uploadedImages || []).concat(urls);
    r.updatedAt = Date.now();
    await exam.save();

    res.json({ ok: true, uploaded: urls, result: r });
  } catch (e) {
    console.error('upload images error', e);
    // best-effort cleanup on unexpected error
    if (req.files && req.files.length) {
      req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(_){} });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Add or update a student's result
router.post('/:examId/results', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { examId } = req.params;
    let { studentId, classId, marks } = req.body;

    if (!studentId || !Array.isArray(marks)) return res.status(400).json({ error: 'studentId and marks required' });

    if (!mongoose.isValidObjectId(examId)) return res.status(400).json({ error: 'Invalid exam id' });

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    if (String(user.role).toLowerCase() === 'manager') {
      if (String(exam.createdBy) !== String(user._id) && String(exam.schoolId) !== String(user.schoolId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    if (!mongoose.isValidObjectId(String(studentId))) {
      return res.status(400).json({ error: 'Invalid studentId' });
    }

    // infer classId from student if missing or invalid
    if (!classId || !mongoose.isValidObjectId(String(classId))) {
      const studentDoc = await Student.findById(String(studentId)).lean();
      if (studentDoc && studentDoc.classId && mongoose.isValidObjectId(String(studentDoc.classId))) {
        classId = String(studentDoc.classId);
      } else {
        return res.status(400).json({ error: 'classId required (could not infer from student). Provide a valid classId.' });
      }
    }

    const resObj = {
      studentId: new mongoose.Types.ObjectId(String(studentId)),
      classId: new mongoose.Types.ObjectId(String(classId)),
      marks: Array.isArray(marks) ? marks.map(m => ({
        subjectCode: m.subjectCode || '',
        subjectName: m.subjectName || '',
        mark: (m.mark === '' || m.mark === null ? null : Number(m.mark))
      })) : []
    };

    computeTotalsForResult(resObj);

    let existing = exam.results.find(r => String(r.studentId) === String(studentId));
    if (existing) {
      existing.marks = resObj.marks;
      existing.total = resObj.total;
      existing.average = resObj.average;
      existing.classId = resObj.classId;
      existing.updatedAt = Date.now();
    } else {
      exam.results.push(resObj);
    }

    await exam.save();
    res.json({ ok: true, exam });
  } catch (e) {
    console.error('add/update result error', e);
    if (e && e.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation error', detail: e.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a result
router.delete('/:examId/results/:resultId', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { examId, resultId } = req.params;
    if (!mongoose.isValidObjectId(examId)) return res.status(400).json({ error: 'Invalid exam id' });

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    if (String(user.role).toLowerCase() === 'manager') {
      if (String(exam.createdBy) !== String(user._id) && String(exam.schoolId) !== String(user.schoolId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const r = exam.results.id(resultId);
    if (!r) return res.status(404).json({ error: 'Result not found' });
    r.remove();
    await exam.save();
    res.json({ ok: true });
  } catch (e) {
    console.error('delete result error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export PDF for an exam (Rank | ID | Number | Name | Class | [Subjects...] | Total | Avg | %)
router.get('/:examId/export', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { examId } = req.params;
    const classId = req.query.classId || null;

    if (!mongoose.isValidObjectId(examId)) return res.status(400).json({ error: 'Invalid exam id' });

    const exam = await Exam.findById(examId).lean();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Access control
    if (['manager','admin'].includes(String(user.role).toLowerCase()) === false && String(user.role).toLowerCase() !== 'student') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (String(user.role).toLowerCase() === 'manager') {
      if (String(exam.createdBy) !== String(user._id) && String(exam.schoolId) !== String(user.schoolId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // Prepare results
    let results = (exam.results || []).map(r => ({ ...r }));
    if (classId) results = results.filter(r => String(r.classId) === String(classId));

    // Fetch students and classes
    const studentIds = results.map(r => r.studentId).filter(Boolean);
    const students = studentIds.length ? await Student.find({ _id: { $in: studentIds } }).lean() : [];
    const studentsById = {};
    const classIdsSet = new Set();
    students.forEach(s => { studentsById[String(s._id)] = s; if (s.classId) classIdsSet.add(String(s.classId)); });

    const classes = classIdsSet.size ? await ClassModel.find({ _id: { $in: Array.from(classIdsSet) } }).lean() : [];
    const classesById = {};
    classes.forEach(c => { classesById[String(c._id)] = c; });

    // Attach student info
    results.forEach(r => {
      const s = studentsById[String(r.studentId)] || null;
      r.student = s ? {
        _id: s._id,
        fullname: s.fullname,
        numberId: s.numberId || null,
        classId: s.classId || null,
        className: s.classId ? (classesById[String(s.classId)]?.name || null) : null
      } : null;
    });

    // Sort by total descending
    results.sort((a,b) => (b.total || 0) - (a.total || 0));
    results.forEach((r,i) => r.rank = i+1);

    // If student, only their result
    if ((user.role||'').toLowerCase() === 'student') {
      results = results.filter(r => String(r.studentId) === String(user._id));
    }

    // PDF setup
    res.setHeader('Content-Type', 'application/pdf');
    const safeTitle = (exam.title || 'exam').replace(/[^\w\-\. ]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-${exam.examCode || exam._id}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    // Header
    doc.fontSize(18).text(String(exam.title || '').toUpperCase(), { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor('gray').text(`Exam Code: ${exam.examCode || ''}`, { align: 'center' });
    doc.moveDown(0.6);

    if (classId) {
      const cls = await ClassModel.findById(classId).lean().catch(()=>null);
      const clsName = (cls && cls.name) ? cls.name : classId;
      doc.fontSize(10).fillColor('black').text(`Class: ${clsName}`, { align: 'center' });
      doc.moveDown(0.4);
    }

    doc.moveDown(0.6);
    const subjects = exam.subjects || [];

    // Column widths
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colRank = 36;
    const colId = 120;
    const colNumber = 70;
    const colName = 150;
    const colClass = 110;
    const remaining = pageWidth - (colRank + colId + colNumber + colName + colClass + 80);
    const colPerSubject = subjects.length ? Math.max(40, Math.floor(remaining / subjects.length)) : 60;

    // Header row
    doc.fontSize(9).fillColor('black');
    doc.text('Rank', { continued: true, width: colRank });
    doc.text('ID', { continued: true, width: colId });
    doc.text('No.', { continued: true, width: colNumber });
    doc.text('Name', { continued: true, width: colName });
    doc.text('Class', { continued: true, width: colClass });
    subjects.forEach(s => doc.text((s.code||s.name||'-').toString().substr(0,12), { continued: true, width: colPerSubject, align: 'center' }));
    doc.text('Total', { continued: true, width: 40, align: 'right' });
    doc.text('Avg', { continued: true, width: 40, align: 'right' });
    doc.text('%', { width: 40, align: 'right' });
    doc.moveDown(0.2);
    doc.strokeColor('#cccccc').moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
    doc.moveDown(0.4);

    const maxRowsPerPage = 30;
    let rowCount = 0;

    for (const r of results) {
      if (rowCount >= maxRowsPerPage) { doc.addPage(); rowCount = 0; }
      rowCount++;

      const stu = r.student || {};
      doc.fontSize(9).fillColor('black').text(String(r.rank || ''), { continued: true, width: colRank });
      doc.text(String(stu._id || r.studentId || ''), { continued: true, width: colId });
      doc.text(String(stu.numberId || '-'), { continued: true, width: colNumber });
      doc.text(String(stu.fullname || 'Unknown'), { continued: true, width: colName });
      doc.text(String(stu.className || (stu.classId || '-')), { continued: true, width: colClass });

      subjects.forEach(sub => {
        const m = (r.marks || []).find(mm => ((mm.subjectCode && String(mm.subjectCode) === String(sub.code)) || (mm.subjectName && String(mm.subjectName) === String(sub.name))));
        doc.text(m && (m.mark !== null && m.mark !== undefined) ? String(m.mark) : '-', { continued: true, width: colPerSubject, align: 'center' });
      });

      const total = typeof r.total === 'number' ? r.total : 0;
      const avg = typeof r.average === 'number' ? r.average : 0;
      const totalMax = (exam.subjects || []).reduce((acc, s) => acc + (s.maxMarks != null ? Number(s.maxMarks) : 0), 0);
      const pct = totalMax ? (Math.round((total / totalMax) * 10000) / 100) : null;

      doc.text(String(total), { continued: true, width: 40, align: 'right' });
      doc.text((isFinite(avg) ? (Math.round(avg*100)/100).toString() : '-'), { continued: true, width: 40, align: 'right' });
      doc.text((pct == null ? '-' : (pct + '%')), { width: 40, align: 'right' });

      doc.moveDown(0.2);
    }

    doc.end();
  } catch (e) {
    console.error('export pdf error', e);
    try { res.status(500).json({ error: 'Server error' }); } catch(_) {}
  }
});


module.exports = router;

// router.get('/:examId/export', requireAuth, async (req, res) => {
//   try {
//     const user = req.user;
//     const { examId } = req.params;
//     const classId = req.query.classId || null;

//     if (!mongoose.isValidObjectId(examId)) return res.status(400).json({ error: 'Invalid exam id' });

//     const exam = await Exam.findById(examId).lean();
//     if (!exam) return res.status(404).json({ error: 'Exam not found' });

//     if (String(user.role).toLowerCase() === 'manager') {
//       if (String(exam.createdBy) !== String(user._id) && String(exam.schoolId) !== String(user.schoolId)) {
//         return res.status(403).json({ error: 'Forbidden' });
//       }
//     }

//     // Prepare result list
//     let results = (exam.results || []).map(r => ({ ...r }));
//     if (classId) results = results.filter(r => String(r.classId) === String(classId));

//     const studentIds = results.map(r => r.studentId);
//     const students = studentIds.length ? await Student.find({ _id: { $in: studentIds } }).lean() : [];
//     const byId = {};
//     students.forEach(s => byId[String(s._id)] = s);

//     results.forEach(r => {
//       r.student = byId[String(r.studentId)] || null;
//     });
//     results.sort((a,b) => (b.total || 0) - (a.total || 0));
//     results.forEach((r,i) => r.rank = i+1);

//     // Generate PDF with PDFKit
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Disposition', `attachment; filename="exam-${exam.examCode}${classId ? '-class-'+classId : ''}.pdf"`);

//     const doc = new PDFDocument({ margin: 40, size: 'A4' });
//     doc.pipe(res);

//     doc.fontSize(18).text(`${exam.title}`, { align: 'center' });
//     doc.moveDown(0.5);
//     doc.fontSize(12).text(`Exam Code: ${exam.examCode}`, { align: 'center' });
//     doc.moveDown(1);

//     // headings
//     doc.fontSize(10).text('Rank', { continued: true, width: 40 });
//     doc.text('ID', { continued: true, width: 100, align: 'left' });
//     doc.text('Name', { continued: true, width: 160 });
//     (exam.subjects || []).forEach(s => doc.text(s.code || s.name || 'Sub', { continued: true, width: 50 }));
//     doc.text('Total', { width: 50, align: 'right' });
//     doc.moveDown(0.2);
//     doc.strokeColor('#ccc').moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
//     doc.moveDown(0.4);

//     const maxPerPage = 30;
//     let idx = 0;
//     for (const r of results) {
//       idx++;
//       const stu = r.student || {};
//       doc.fontSize(10).text(String(r.rank), { continued: true, width: 40 });
//       doc.text(String(stu._id || ''), { continued: true, width: 100 });
//       doc.text(String(stu.fullname || 'Unknown'), { continued: true, width: 160 });
//       for (const subj of (exam.subjects || [])) {
//         const subMarkObj = (r.marks || []).find(m => (m.subjectCode === subj.code) || (m.subjectName === subj.name));
//         doc.text(typeof subMarkObj !== 'undefined' && subMarkObj !== null && subMarkObj.mark !== null ? String(subMarkObj.mark) : '-', { continued: true, width: 50 });
//       }
//       doc.text(String(r.total || 0), { width: 50, align: 'right' });
//       doc.moveDown(0.2);

//       if (idx % maxPerPage === 0) {
//         doc.addPage();
//       }
//     }

//     doc.end();
//   } catch (e) {
//     console.error('export pdf error', e);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

