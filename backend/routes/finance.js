// backend/routes/finance.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function safeRequire(p) {
  try { return require(p); } catch (e) { return null; }
}
const Payment = safeRequire('../models/Payment') || null;
const Student = safeRequire('../models/Student') || null;
const Teacher = safeRequire('../models/Teacher') || null;
const Parent = safeRequire('../models/Parent') || null;

const toNum = v => (typeof v === 'number' ? v : (Number(v) || 0));
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monthsToNames(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.map(m => {
    const idx = Number(m) - 1;
    return MONTH_NAMES[idx] || String(m);
  }).join(', ');
}

function fmtCurrency(v) {
  const n = Number(v || 0);
  return '$' + n.toFixed(2);
}

function getBaseUrl(req) {
  const protocol = (req && req.protocol) ? req.protocol : 'http';
  const host = (req && req.get && req.get('host')) ? req.get('host') : 'localhost';
  return `${protocol}://${host}`;
}

// Resolve target user (student/teacher) for the finance endpoint
// For parents: attempt to map to childId from token (req.user.childId) or Parent lookup.
async function resolveFinanceUser(req) {
  const role = (req.user && req.user.role || '').toLowerCase();
  const requesterId = req.user && (req.user._id || req.user.id);
  // Default to requester
  let targetRole = role;
  let personId = requesterId;

  if (role === 'parent') {
    // parent should view their child's finance
    if (req.user && req.user.childId) {
      personId = req.user.childId;
      targetRole = 'student';
    } else if (Parent && requesterId) {
      try {
        const parentDoc = await Parent.findById(requesterId).lean().catch(()=>null);
        if (parentDoc && parentDoc.childStudent) {
          personId = String(parentDoc.childStudent);
          targetRole = 'student';
        }
      } catch (e) { /* ignore */ }
    }
  }
  return { personId, targetRole };
}

// GET /api/finance/me
// Returns profile for current user (student/teacher/user), their payments history, totals and balance.
router.get('/me', auth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const base = getBaseUrl(req);
    const resolved = await resolveFinanceUser(req);
    const personIdRaw = resolved.personId;
    const role = (resolved.targetRole || (req.user && req.user.role) || '').toLowerCase();
    if (!personIdRaw) return res.status(400).json({ message: 'Could not resolve person for finance' });

    let personId;
    try { personId = mongoose.Types.ObjectId.isValid(String(personIdRaw)) ? new mongoose.Types.ObjectId(String(personIdRaw)) : personIdRaw; } catch(e) { personId = personIdRaw; }

    let profile = null;
    if (role === 'student' && Student) {
      profile = await Student.findById(personId).populate('classId', 'name classId').lean().catch(()=>null);
      if (!profile) return res.status(404).json({ message: 'Student not found' });
      if (profile.photo) profile.photoUrl = base + '/uploads/' + profile.photo;
    } else if (role === 'teacher' && Teacher) {
      profile = await Teacher.findById(personId).populate('classIds','name classId').populate('subjectIds','name subjectId').lean().catch(()=>null);
      if (!profile) return res.status(404).json({ message: 'Teacher not found' });
      if (profile.photo) profile.photoUrl = base + '/uploads/' + profile.photo;
    } else {
      profile = {
        _id: personId,
        fullname: req.user.fullname || '',
        role: req.user.role || 'user',
        email: req.user.email || '',
      };
    }

    // fetch payments for this person — include all for listing, but totals/balance only use monthly payments
    const q = { personId: (mongoose.Types.ObjectId.isValid(String(personId)) ? new mongoose.Types.ObjectId(String(personId)) : personId) };
    if (role === 'student' || role === 'teacher') q.personType = role;
    if (req.user.schoolId && mongoose.Types.ObjectId.isValid(String(req.user.schoolId))) q.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId));

    const payments = Payment ? await Payment.find(q).sort({ createdAt: -1 }).lean().catch(()=>[]) : [];

    // compute totals (ONLY monthly payments count)
    const totalPaid = (payments || []).filter(p => Array.isArray(p.months) && p.months.length > 0)
                                     .reduce((s,p) => s + toNum(p.amount || 0), 0);

    // compute totalDue (best-effort)
    let totalDue = 0;
    if (role === 'student' && profile) totalDue = toNum(profile.totalDue || profile.fee || 0);
    if (role === 'teacher' && profile) totalDue = toNum(profile.totalDue || profile.salary || 0);

    const balance = (totalDue || 0) - (totalPaid || 0);

    return res.json({
      profile,
      role,
      payments,
      totalPaid,
      totalDue,
      balance
    });
  } catch (err) {
    console.error('GET /finance/me error', err && (err.stack||err.message) ? (err.stack || err.message) : err);
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});

// GET /api/finance/me/pdf
// Returns a PDF file ready to download for the currently authenticated user (or parent's child)
router.get('/me/pdf', auth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const base = getBaseUrl(req);
    const resolved = await resolveFinanceUser(req);
    const personIdRaw = resolved.personId;
    const role = (resolved.targetRole || (req.user && req.user.role) || '').toLowerCase();
    if (!personIdRaw) return res.status(400).json({ message: 'Could not resolve person for finance pdf' });

    let personId;
    try { personId = mongoose.Types.ObjectId.isValid(String(personIdRaw)) ? new mongoose.Types.ObjectId(String(personIdRaw)) : personIdRaw; } catch(e) { personId = personIdRaw; }

    let profile = null;
    if (role === 'student' && Student) {
      profile = await Student.findById(personId).lean().catch(()=>null);
      if (!profile) return res.status(404).json({ message: 'Student not found' });
      if (profile.photo) profile.photoUrl = base + '/uploads/' + profile.photo;
    } else if (role === 'teacher' && Teacher) {
      profile = await Teacher.findById(personId).lean().catch(()=>null);
      if (!profile) return res.status(404).json({ message: 'Teacher not found' });
      if (profile.photo) profile.photoUrl = base + '/uploads/' + profile.photo;
    } else {
      profile = { _id: personId, fullname: req.user.fullname || '', role: req.user.role || 'user', email: req.user.email || '' };
    }

    const q = { personId: (mongoose.Types.ObjectId.isValid(String(personId)) ? new mongoose.Types.ObjectId(String(personId)) : personId) };
    if (role === 'student' || role === 'teacher') q.personType = role;
    if (req.user.schoolId && mongoose.Types.ObjectId.isValid(String(req.user.schoolId))) q.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId));
    const payments = Payment ? await Payment.find(q).sort({ createdAt: -1 }).lean().catch(()=>[]) : [];

    // totals: only monthly payments count
    const totalPaid = (payments || []).filter(p => Array.isArray(p.months) && p.months.length > 0)
                                     .reduce((s,p) => s + toNum(p.amount || 0), 0);

    let totalDue = 0;
    if (role === 'student') totalDue = toNum(profile.totalDue || profile.fee || 0);
    if (role === 'teacher') totalDue = toNum(profile.totalDue || profile.salary || 0);
    const balance = (totalDue || 0) - (totalPaid || 0);

    // stream PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    // headers for download
    const filename = `finance-${(profile.numberId || profile._id || 'me')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Title
    doc.fontSize(18).text('Finance Statement', { align: 'center' });
    doc.moveDown(0.5);

    // Profile block with optional photo
    try {
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      if (profile && profile.photo) {
        const filenameOnly = path.basename(profile.photo || '');
        const localImgPath = path.join(uploadsDir, filenameOnly);
        if (fs.existsSync(localImgPath)) {
          const startY = doc.y;
          doc.image(localImgPath, 40, startY, { width: 80, height: 80 });
          doc.fontSize(12).text(`Name: ${profile.fullname || ''}`, 130, startY);
          doc.text(`ID: ${profile.numberId || profile._id || ''}`, { continued: false });
          doc.text(`Role: ${role || req.user.role || ''}`);
          doc.moveDown(1.2);
        } else {
          doc.fontSize(12).text(`Name: ${profile.fullname || ''}`);
          doc.text(`ID: ${profile.numberId || profile._id || ''}`);
          doc.text(`Role: ${role || req.user.role || ''}`);
          doc.moveDown(0.5);
        }
      } else {
        doc.fontSize(12).text(`Name: ${profile.fullname || ''}`);
        doc.text(`ID: ${profile.numberId || profile._id || ''}`);
        doc.text(`Role: ${role || req.user.role || ''}`);
        doc.moveDown(0.5);
      }
    } catch (imgErr) {
      console.warn('finance/pdf: image include failed', imgErr && imgErr.message ? imgErr.message : imgErr);
      doc.fontSize(12).text(`Name: ${profile.fullname || ''}`);
      doc.text(`ID: ${profile.numberId || profile._id || ''}`);
      doc.text(`Role: ${role || req.user.role || ''}`);
      doc.moveDown(0.5);
    }

    // Totals (formatted)
    doc.fontSize(12).text(`Total Due: ${fmtCurrency(totalDue)}`, { continued: true }).text(`    Total Paid: ${fmtCurrency(totalPaid)}`, { continued: true }).text(`    Balance: ${fmtCurrency(balance)}`);
    doc.moveDown(0.7);

    // Payments table header
    doc.fontSize(12).text('Transactions:', { underline: true });
    doc.moveDown(0.3);

    // Simple rows
    doc.fontSize(10);

    // header row
    const startX = doc.x;
    doc.text('Date', startX, doc.y, { width: 120, continued: true });
    doc.text('Amount', startX + 120, doc.y, { width: 80, continued: true });
    doc.text('Type', startX + 200, doc.y, { width: 120, continued: true });
    doc.text('Months', startX + 320, doc.y, { width: 100, continued: true });
    doc.text('Note / By', startX + 420, doc.y, { width: 150 });
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(550, doc.y).stroke();

    (payments || []).forEach(p => {
      const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleString() : '';
      const amount = fmtCurrency(p.amount || 0);
      const type = p.paymentType || p.type || '';
      const months = Array.isArray(p.months) && p.months.length ? monthsToNames(p.months) : '';
      const note = ((p.note || '') + (p.createdByName ? ` • By: ${p.createdByName}` : '')).replace(/\r?\n/g,' ');
      if (doc.y > 720) doc.addPage();
      doc.text(dateStr, { width: 120, continued: true });
      doc.text(amount, { width: 80, continued: true });
      doc.text(type, { width: 120, continued: true });
      doc.text(months, { width: 100, continued: true });
      doc.text(note, { width: 150 });
      doc.moveDown(0.3);
    });

    doc.moveDown(0.6);
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });

    doc.end();

  } catch (err) {
    console.error('GET /finance/me/pdf error', err && (err.stack||err.message) ? (err.stack || err.message) : err);
    try { if (!res.headersSent) res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null }); } catch(e){/*ignore*/ }
  }
});

module.exports = router;
