// backend/routes/recurring.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const RecurringCharge = require('../models/RecurringCharge');
const Charge = require('../models/Charge');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

function toNum(v){ return typeof v === 'number' ? v : (Number(v) || 0); }

// Create a recurring charge
router.post('/', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const { personType, personId, amount, dayOfMonth, startDate, endDate, active } = req.body || {};
    if (!personType || !['student','teacher'].includes(personType)) return res.status(400).json({ message: 'personType required (student|teacher)' });
    if (!personId || !mongoose.Types.ObjectId.isValid(String(personId))) return res.status(400).json({ message: 'personId required' });
    const amt = Number(amount || 0);
    if (!amt || amt <= 0) return res.status(400).json({ message: 'amount must be > 0' });
    const day = Number(dayOfMonth || 1);
    if (!Number.isInteger(day) || day < 1 || day > 31) return res.status(400).json({ message: 'dayOfMonth must be integer 1..31' });

    // verify person exists and manager owns it (if manager)
    if (personType === 'student') {
      const s = await Student.findById(personId).lean().catch(()=>null);
      if (!s) return res.status(404).json({ message: 'Student not found' });
      if (req.user.role === 'manager' && String(s.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden — student not managed by you' });
    } else {
      const t = await Teacher.findById(personId).lean().catch(()=>null);
      if (!t) return res.status(404).json({ message: 'Teacher not found' });
      if (req.user.role === 'manager' && String(t.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden — teacher not managed by you' });
    }

    const doc = new RecurringCharge({
      personType,
      personId: new mongoose.Types.ObjectId(String(personId)),
      amount: toNum(amt),
      dayOfMonth: day,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      active: typeof active === 'boolean' ? active : true,
      createdBy: req.user._id,
      schoolId: req.user.schoolId || null
    });
    await doc.save();
    res.json({ ok:true, recurring: doc });
  } catch (err) {
    console.error('POST /recurring error', err);
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});

// list recurring (manager sees their school/created ones)
router.get('/', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const q = {};
    if (req.user.role === 'manager') {
      if (req.user.schoolId) q.$or = [{ schoolId: req.user.schoolId }, { createdBy: req.user._id }];
      else q.createdBy = req.user._id;
    }
    const items = await RecurringCharge.find(q).sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    console.error('GET /recurring error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// delete
router.delete('/:id', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid id' });
    const r = await RecurringCharge.findById(id).lean();
    if (!r) return res.status(404).json({ message: 'Not found' });
    if (req.user.role === 'manager' && String(r.createdBy) !== String(req.user._id) && String(r.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await RecurringCharge.findByIdAndDelete(id);
    res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /recurring/:id error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Apply recurring charges for today's date (manager/admin only) — useful for testing or manual runs
router.post('/apply-today', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const today = new Date();
    const applied = [];
    const recsQuery = {};
    if (req.user.role === 'manager') {
      if (req.user.schoolId) recsQuery.$or = [{ schoolId: req.user.schoolId }, { createdBy: req.user._id }];
      else recsQuery.createdBy = req.user._id;
    }
    recsQuery.active = true;
    const recs = await RecurringCharge.find(recsQuery).lean();
    for (const r of recs) {
      // skip if startDate > today or endDate < today
      if (r.startDate && new Date(r.startDate) > today) continue;
      if (r.endDate && new Date(r.endDate) < today) continue;

      // compute last day mapping
      const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
      const targetDay = Math.min(Number(r.dayOfMonth || 1), daysInMonth);
      if (targetDay !== today.getDate()) continue;

      try {
        // increment person's totalDue
        const inc = { $inc: { totalDue: Number(r.amount || 0) } };
        const filter = { _id: r.personId };
        if (r.personType === 'student') {
          await Student.findByIdAndUpdate(r.personId, inc).catch(()=>{});
        } else if (r.personType === 'teacher') {
          await Teacher.findByIdAndUpdate(r.personId, inc).catch(()=>{});
        }
        // write charge audit
        const ch = new Charge({
          personType: r.personType,
          personId: r.personId,
          amount: Number(r.amount || 0),
          description: `Recurring charge applied (recurringId=${r._id})`,
          recurringId: r._id,
          createdBy: req.user._id,
          schoolId: r.schoolId || req.user.schoolId || null
        });
        await ch.save();
        applied.push({ recurringId: r._id, personId: r.personId, amount: r.amount });
      } catch (e) {
        console.error('apply recurring item failed', r._id, e);
      }
    }
    res.json({ ok:true, appliedCount: applied.length, applied });
  } catch (err) {
    console.error('POST /recurring/apply-today error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
