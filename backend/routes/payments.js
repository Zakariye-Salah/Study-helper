const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const fs = require('fs');
const path = require('path');

function safeRequire(p) {
  try { return require(p); } catch (e) { console.warn(`safeRequire: failed to require ${p}:`, e.message); return null; }
}

const Payment = safeRequire('../models/Payment') || (() => { throw new Error('Payment model missing'); })();
const PaymentType = safeRequire('../models/PaymentType') || null;
const Student = safeRequire('../models/Student') || null;
const Teacher = safeRequire('../models/Teacher') || null;

const toNum = v => (typeof v === 'number' ? v : (Number(v) || 0));
function emptyList(res){ return res.json({ items: [], total: 0 }); }

function toObjectIdIfValid(x){
  if (!x) return null;
  if (mongoose.Types.ObjectId.isValid(String(x))) return new mongoose.Types.ObjectId(String(x));
  return null;
}
function toObjectIdArray(arr){
  if (!Array.isArray(arr)) return [];
  return arr.map(a => toObjectIdIfValid(a)).filter(Boolean);
}

function getBaseUrl(req) {
  const protocol = req.protocol || 'http';
  const host = req.get && req.get('host') ? req.get('host') : 'localhost';
  return `${protocol}://${host}`;
}

/* ---------------- OVERVIEW ---------------- */
router.get('/overview', auth, async (req, res) => {
  try {

    // inside router.get('/overview', auth, ...)
const schoolId = req.user && req.user.schoolId && mongoose.Types.ObjectId.isValid(String(req.user.schoolId))
? new mongoose.Types.ObjectId(String(req.user.schoolId))
: null;

const baseMatch = {};
if (req.user.role === 'manager') {
// manager: only items created by this manager
baseMatch.createdBy = req.user._id;
} else if (req.user.role === 'admin') {
// admin: global (optionally filter by schoolId if present)
if (schoolId) baseMatch.schoolId = schoolId;
} else {
// other roles - restrict further as needed
if (schoolId) baseMatch.schoolId = schoolId;
}

    // const schoolId = req.user && req.user.schoolId && mongoose.Types.ObjectId.isValid(String(req.user.schoolId))
    //   ? new mongoose.Types.ObjectId(String(req.user.schoolId))
    //   : null;

    const studentsMatch = { ...(schoolId ? { schoolId } : {}) };
    const teachersMatch = { ...(schoolId ? { schoolId } : {}) };

    const studentsCount = Student ? await Student.countDocuments(studentsMatch).catch(() => 0) : 0;
    const teachersCount = Teacher ? await Teacher.countDocuments(teachersMatch).catch(() => 0) : 0;

    let studentsOutstanding = 0;
    if (Student) {
      const students = await Student.find(studentsMatch).select('_id totalDue fee').lean().catch(() => []);
      const sIds = (students || []).map(s => s._id).filter(Boolean);
      if (sIds.length && Payment && typeof Payment.aggregate === 'function') {
        try {
          // Only sum monthly payments (payments that have a non-empty months array)
          const sums = await Payment.aggregate([
            { $match: { personType: 'student', personId: { $in: sIds }, 'months.0': { $exists: true } } },
            { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
          ]);
          const paidMap = new Map(sums.map(x => [String(x._id), x.paid]));
          students.forEach(s => {
            const total = toNum(s.totalDue || s.fee || 0);
            const paid = toNum(paidMap.get(String(s._id)));
            if (total - paid > 0) studentsOutstanding += (total - paid);
          });
        } catch (aggErr) {
          console.error('payments/overview: student Payment.aggregate failed', aggErr && aggErr.stack ? aggErr.stack : aggErr);
        }
      }
    }

    let teachersOutstanding = 0;
    if (Teacher) {
      const teachers = await Teacher.find(teachersMatch).select('_id totalDue salary').lean().catch(() => []);
      const tIds = (teachers || []).map(t => t._id).filter(Boolean);
      if (tIds.length && Payment && typeof Payment.aggregate === 'function') {
        try {
          const sumsT = await Payment.aggregate([
            { $match: { personType: 'teacher', personId: { $in: tIds }, 'months.0': { $exists: true } } },
            { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
          ]);
          const paidMap = new Map(sumsT.map(x => [String(x._1), x.paid])); // old code used _id; fix below
          // ensure we map correctly
          const paidMapCorrect = new Map(sumsT.map(x => [String(x._id), x.paid]));
          teachers.forEach(t => {
            const total = toNum(t.totalDue || t.salary || 0);
            const paid = toNum(paidMapCorrect.get(String(t._id)));
            if (total - paid > 0) teachersOutstanding += (total - paid);
          });
        } catch (aggErr) {
          console.error('payments/overview: teacher Payment.aggregate failed', aggErr && aggErr.stack ? aggErr.stack : aggErr);
        }
      }
    }

    res.json({
      studentsCount,
      teachersCount,
      studentsOutstanding,
      teachersOutstanding
    });
  } catch (err) {
    console.error('GET /payments/overview error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});

/* ---------------- LIST STUDENTS FOR PAYMENTS ---------------- */
router.get('/students', auth, roles(['admin','manager','teacher','student']), async (req, res) => {
  try {
    const { search = '', classId = '', page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, Number(page || 1));
    const lim = Math.min(200, Number(limit || 50));
    const q = {};

    if (req.user.role === 'student') {
      q._id = req.user._id;
    } else if (req.user.role === 'manager') {
      q.createdBy = req.user._id;
    } else if (req.user.role === 'teacher') {
      if (!Teacher) return res.status(500).json({ message: 'Teacher model not available' });
      const t = await Teacher.findById(req.user._id).lean().catch(()=>null);
      if (!t) return res.status(403).json({ message: 'Teacher not found' });
      const allowedClasses = toObjectIdArray(t.classIds || []);
      if (!allowedClasses.length) return emptyList(res);
      q.classId = { $in: allowedClasses };
    } else {
      if (req.user.schoolId) {
        if (mongoose.Types.ObjectId.isValid(String(req.user.schoolId))) q.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId));
        else q.schoolId = req.user.schoolId;
      }
    }

    if (search) q.$or = [{ fullname: new RegExp(search, 'i') }, { numberId: new RegExp(search, 'i') }];

    if (classId) {
      if (!mongoose.Types.ObjectId.isValid(String(classId))) {
        console.warn('payments/students: invalid classId filter:', classId);
        return emptyList(res);
      }
      const classOid = new mongoose.Types.ObjectId(String(classId));
      if (req.user.role === 'teacher') {
        const teacher = await Teacher.findById(req.user._id).lean().catch(()=>null);
        const allowed = toObjectIdArray(teacher?.classIds || []);
        if (!allowed.map(String).includes(String(classOid))) return emptyList(res);
      }
      q.classId = classOid;
    }

    const items = await (Student ? Student.find(q) : Promise.resolve([]))
      .limit(lim)
      .skip((pageNum - 1) * lim)
      .sort({ createdAt: -1 })
      .populate('classId', 'name classId')
      .lean();

    const ids = (items || []).map(i => i._id).filter(Boolean);
    let sums = [];
    try {
      if (ids.length && Payment && typeof Payment.aggregate === 'function') {
        // only sum monthly payments (those with a non-empty months array)
        sums = await Payment.aggregate([
          { $match: { personType: 'student', personId: { $in: ids }, 'months.0': { $exists: true } } },
          { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
        ]);
      }
    } catch (aggErr) {
      console.error('GET /payments/students Payment.aggregate error', aggErr && aggErr.stack ? aggErr.stack : aggErr);
      sums = [];
    }

    const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
    const base = getBaseUrl(req);
    (items || []).forEach(it => {
      it.paidAmount = toNum(paidMap.get(String(it._id))); // paidAmount now represents monthly payments only
      it.totalDue = toNum(it.totalDue || it.fee || 0);
      if (it.photo) it.photoUrl = base + `/uploads/${it.photo}`;
    });

    const total = await (Student ? Student.countDocuments(q) : Promise.resolve(0));
    res.json({ items, total });
  } catch (err) {
    console.error('GET /payments/students error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});

/* ---------------- LIST TEACHERS FOR PAYMENTS ---------------- */
router.get('/teachers', auth, roles(['admin','manager','teacher']), async (req, res) => {
  try {
    const { search = '', subjectId = '', page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, Number(page || 1));
    const lim = Math.min(200, Number(limit || 50));
    const q = {};

    if (req.user.role === 'teacher') {
      q._id = req.user._id;
    } else if (req.user.role === 'manager') {
      q.createdBy = req.user._id;
    } else {
      if (req.user.schoolId) {
        if (mongoose.Types.ObjectId.isValid(String(req.user.schoolId))) q.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId));
        else q.schoolId = req.user.schoolId;
      }
    }

    if (search) q.$or = [{ fullname: new RegExp(search, 'i') }, { numberId: new RegExp(search, 'i') }];

    if (subjectId) {
      if (!mongoose.Types.ObjectId.isValid(String(subjectId))) {
        console.warn('payments/teachers: invalid subjectId filter:', subjectId);
        return emptyList(res);
      }
      q.subjectIds = new mongoose.Types.ObjectId(String(subjectId));
    }

    const items = await (Teacher ? Teacher.find(q) : Promise.resolve([]))
      .limit(lim)
      .skip((pageNum - 1) * lim)
      .sort({ createdAt: -1 })
      .populate('subjectIds', 'name subjectId')
      .lean();

    const ids = (items || []).map(i => i._id).filter(Boolean);
    let sums = [];
    try {
      if (ids.length && Payment && typeof Payment.aggregate === 'function') {
        sums = await Payment.aggregate([
          { $match: { personType: 'teacher', personId: { $in: ids }, 'months.0': { $exists: true } } },
          { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
        ]);
      }
    } catch (aggErr) {
      console.error('GET /payments/teachers Payment.aggregate error', aggErr && aggErr.stack ? aggErr.stack : aggErr);
      sums = [];
    }

    const paidMap = new Map((sums || []).map(s => [String(s._id), s.paid]));
    const base = getBaseUrl(req);
    (items || []).forEach(it => {
      it.paidAmount = toNum(paidMap.get(String(it._id))); // monthly payments only
      it.totalDue = toNum(it.totalDue || it.salary || 0);
      if (it.photo) it.photoUrl = base + `/uploads/${it.photo}`;
    });

    const total = await (Teacher ? Teacher.countDocuments(q) : Promise.resolve(0));
    res.json({ items, total });
  } catch (err) {
    console.error('GET /payments/teachers error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});

/* ---------------- PAYMENT TYPES ---------------- */
router.get('/types', auth, async (req, res) => {
  try {
    const q = {};
    if (req.user && req.user.schoolId && mongoose.Types.ObjectId.isValid(String(req.user.schoolId))) q.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId));
    const items = PaymentType ? await PaymentType.find(q).sort({ name: 1 }).lean() : [];
    res.json({ items });
  } catch (err) {
    console.error('GET /payments/types error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});

router.post('/types', auth, roles(['admin','manager']), async (req, res) => {
  try {
    if (!PaymentType) return res.status(500).json({ message: 'PaymentType model not available' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const key = String(name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
    const doc = new PaymentType({ key, name, schoolId: req.user.schoolId, createdBy: req.user._id });
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('POST /payments/types error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});

/* ---------------- CREATE PAYMENT (non-transactional) ---------------- */
router.post('/', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const { personType, personId, amount, paymentType, months, note, idempotencyKey } = req.body;
    if (!personType || !['student','teacher'].includes(String(personType))) return res.status(400).json({ message: 'personType required (student|teacher)' });
    if (!personId || !mongoose.Types.ObjectId.isValid(String(personId))) return res.status(400).json({ message: 'personId required and must be a valid id' });
    const numAmount = Number(amount || 0);
    if (!numAmount || numAmount <= 0) return res.status(400).json({ message: 'amount must be > 0' });

    // normalize months if provided
    let monthsArr = [];
    if (paymentType === 'monthly') {
      if (!Array.isArray(months) || months.length === 0) return res.status(400).json({ message: 'months required for monthly payments' });
      monthsArr = months.map(m => Number(m)).filter(n => !Number.isNaN(n) && n >= 1 && n <= 12);
      if (!monthsArr.length) return res.status(400).json({ message: 'invalid months array (expect numbers 1..12)' });
    }

    // ensure person exists and manager ownership rules
    if (personType === 'student') {
      if (!Student) return res.status(500).json({ message: 'Student model not available' });
      const s = await Student.findById(personId).lean().catch(()=>null);
      if (!s) return res.status(400).json({ message: 'Student not found' });
      if (req.user.role === 'manager' && String(s.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Forbidden — student not managed by you' });
      }
    } else {
      if (!Teacher) return res.status(500).json({ message: 'Teacher model not available' });
      const t = await Teacher.findById(personId).lean().catch(()=>null);
      if (!t) return res.status(400).json({ message: 'Teacher not found' });
      if (req.user.role === 'manager' && String(t.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Forbidden — teacher not managed by you' });
      }
    }

    // idempotency: return existing if found
    if (idempotencyKey) {
      const existing = await Payment.findOne({ idempotencyKey: String(idempotencyKey) }).lean().catch(()=>null);
      if (existing) return res.json({ ok: true, payment: existing });
    }

    const pDoc = {
      personType: String(personType),
      personId: new mongoose.Types.ObjectId(String(personId)),
      amount: numAmount,
      paymentType: String(paymentType || 'other'),
      months: monthsArr,
      note: String(note || ''),
      schoolId: req.user.schoolId || null,
      createdBy: req.user._id,
      createdByName: req.user.fullname || '',
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined
    };

    const created = await Payment.create(pDoc);

    // recompute paid sum (ONLY monthly payments count toward paid)
    let paid = 0;
    try {
      const agg = await Payment.aggregate([
        { $match: { personType: pDoc.personType, personId: new mongoose.Types.ObjectId(String(personId)), 'months.0': { $exists: true } } },
        { $group: { _id: null, paid: { $sum: '$amount' } } }
      ]);
      paid = (agg[0] && agg[0].paid) || 0;
    } catch (aggErr) {
      console.error('POST /payments: aggregate error after create', aggErr && aggErr.stack ? aggErr.stack : aggErr);
      paid = 0;
    }

    // person's totalDue
    let totalDue = 0;
    if (personType === 'student' && Student) {
      const s = await Student.findById(personId).lean().catch(()=>null);
      totalDue = toNum(s && (s.totalDue || s.fee || 0));
    } else if (personType === 'teacher' && Teacher) {
      const t = await Teacher.findById(personId).lean().catch(()=>null);
      totalDue = toNum(t && (t.totalDue || t.salary || 0));
    }

    const newBalance = totalDue - paid;
    return res.json({ ok: true, payment: created, paidAmount: paid, newBalance });
  } catch (err) {
    console.error('POST /payments error', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});

/* ---------------- HISTORY ---------------- */
router.get('/history', auth, async (req, res) => {
  try {
    const { personType, personId, page = 1, limit = 200 } = req.query;
    if (!personType || !personId) return res.status(400).json({ message: 'personType and personId required' });
    if (!mongoose.Types.ObjectId.isValid(String(personId))) return res.status(400).json({ message: 'Invalid personId' });

    // PERMISSION CHECKS:
    const reqRole = (req.user && req.user.role || '').toLowerCase();
    const pidStr = String(personId);
    if (reqRole === 'student') {
      if (personType !== 'student' || String(req.user._id) !== pidStr) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (reqRole === 'teacher') {
      if (personType !== 'teacher' || String(req.user._id) !== pidStr) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (reqRole === 'manager') {
      if (personType === 'student') {
        if (!Student) return res.status(500).json({ message: 'Student model not available' });
        const s = await Student.findById(personId).lean().catch(()=>null);
        if (!s) return res.status(404).json({ message: 'Student not found' });
        if (String(s.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden — student not managed by you' });
      } else if (personType === 'teacher') {
        if (!Teacher) return res.status(500).json({ message: 'Teacher model not available' });
        const t = await Teacher.findById(personId).lean().catch(()=>null);
        if (!t) return res.status(404).json({ message: 'Teacher not found' });
        if (String(t.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden — teacher not managed by you' });
      } else {
        return res.status(400).json({ message: 'Invalid personType' });
      }
    } else {
      // admin and others allowed
    }

    const q = { personType: String(personType), personId: new mongoose.Types.ObjectId(String(personId)) };
    if (req.user.schoolId && mongoose.Types.ObjectId.isValid(String(req.user.schoolId))) q.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId));

    const items = await Payment.find(q).sort({ createdAt: -1 }).limit(Number(limit || 200)).skip((Number(page||1)-1) * Number(limit || 200)).lean();

    // totalPaid should reflect only monthly payments
    const agg = await Payment.aggregate([
      { $match: { ...q, 'months.0': { $exists: true } } },
      { $group: { _id: null, totalPaid: { $sum: '$amount' } } }
    ]);
    const totalPaid = (agg[0] && agg[0].totalPaid) || 0;
    res.json({ items, totalPaid });
  } catch (err) {
    console.error('GET /payments/history error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});

module.exports = router;
