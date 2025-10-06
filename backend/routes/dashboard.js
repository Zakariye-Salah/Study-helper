// backend/routes/dashboard.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const mongoose = require('mongoose');

const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Payment = require('../models/Payment');

// try to load User model (optional); if not present we continue safely
let UserModel = null;
try {
  // eslint-disable-next-line global-require
  UserModel = require('../models/User');
} catch (e) {
  UserModel = null;
}

const toNum = v => (typeof v === 'number' ? v : (Number(v) || 0));

/**
 * Dashboard: summary for requesting user's scope.
 * - manager: scoped to records where schoolId === manager.schoolId OR createdBy === manager._id
 * - admin: global (no scope)
 *
 * Debugging:
 *  - add ?debug=1 to the query to get a `debug` object in the JSON response.
 */
router.get('/', auth, roles(['admin','manager']), async (req, res) => {
  const debugEnabled = String(req.query.debug || '').trim() === '1';
  const debug = { messages: [] };

  function d(msg, obj) {
    try {
      if (obj !== undefined) {
        // shallow clone some types for safe logging
        debug.messages.push({ msg: String(msg || ''), obj });
        console.debug('[dashboard debug]', msg, obj);
      } else {
        debug.messages.push(String(msg || ''));
        console.debug('[dashboard debug]', msg);
      }
    } catch (e) {
      console.warn('debug push failed', e && e.stack ? e.stack : e);
    }
  }

  try {
    const rawUser = req.user || {};
    const userIdRaw = rawUser._id || rawUser.id || rawUser.userId || rawUser.uid || null;
    const rawSchool = rawUser.schoolId || rawUser.school || null;
    const role = (rawUser.role || '').toLowerCase();

    d('request.user', { userIdRaw, rawSchool, role });

    const userOid = (userIdRaw && mongoose.Types.ObjectId.isValid(String(userIdRaw))) ? new mongoose.Types.ObjectId(String(userIdRaw)) : null;
    const schoolOid = (rawSchool && mongoose.Types.ObjectId.isValid(String(rawSchool))) ? new mongoose.Types.ObjectId(String(rawSchool)) : null;

    // scope filter
    let scopeFilter = {};
    if (role === 'manager') {
      const or = [];
      if (schoolOid) or.push({ schoolId: schoolOid });
      if (userOid) or.push({ createdBy: userOid });
      if (or.length) scopeFilter = { $or: or };
      else if (userIdRaw) scopeFilter = { createdBy: userIdRaw };
    } else if (role === 'admin') {
      scopeFilter = {};
    } else {
      d('forbidden role', role);
      return res.status(403).json({ message: 'Forbidden' });
    }

    d('scopeFilter', scopeFilter);

    // exclude deleted when counting people
    const studentCountFilter = Object.keys(scopeFilter).length ? { ...scopeFilter, deleted: { $ne: true } } : { deleted: { $ne: true } };
    const teacherCountFilter = Object.keys(scopeFilter).length ? { ...scopeFilter, deleted: { $ne: true } } : { deleted: { $ne: true } };

    const totalStudents = await Student.countDocuments(studentCountFilter).catch((e)=>{ d('Student.countDocuments error', (e && e.message) || e); return 0; });
    const totalTeachers = await Teacher.countDocuments(teacherCountFilter).catch((e)=>{ d('Teacher.countDocuments error', (e && e.message) || e); return 0; });

    d('totalCounts', { totalStudents, totalTeachers });

    // Try to load Class and Subject models lazily (safe)
    let ClassModel = null;
    let SubjectModel = null;
    try {
      ClassModel = require('../models/Class');
      d('Class model loaded');
    } catch (e) {
      d('Class model not found');
      ClassModel = null;
    }
    try {
      SubjectModel = require('../models/Subject');
      d('Subject model loaded');
    } catch (e) {
      d('Subject model not found');
      SubjectModel = null;
    }

    // compute classes and subjects totals (respecting scope and deleted flag)
    let totalClasses = 0;
    let totalSubjects = 0;
    try {
      const classCountFilter = Object.keys(scopeFilter).length ? { ...scopeFilter, deleted: { $ne: true } } : { deleted: { $ne: true } };
      const subjectCountFilter = Object.keys(scopeFilter).length ? { ...scopeFilter, deleted: { $ne: true } } : { deleted: { $ne: true } };

      if (ClassModel) {
        totalClasses = await ClassModel.countDocuments(classCountFilter).catch((e) => { d('Class.countDocuments error', (e && e.message) || e); return 0; });
      } else {
        d('Class model not available, totalClasses set to 0');
        totalClasses = 0;
      }

      if (SubjectModel) {
        totalSubjects = await SubjectModel.countDocuments(subjectCountFilter).catch((e) => { d('Subject.countDocuments error', (e && e.message) || e); return 0; });
      } else {
        d('Subject model not available, totalSubjects set to 0');
        totalSubjects = 0;
      }
    } catch (e) {
      d('classes/subjects count error', e && e.message ? e.message : e);
      totalClasses = 0;
      totalSubjects = 0;
    }

    d('totalClassesSubjects', { totalClasses, totalSubjects });

    // --- NEW: compute totalManagers (only compute for admin; safe if UserModel absent) ---
    let totalManagers = 0;
    if (role === 'admin' && UserModel) {
      try {
        // case-insensitive match for role == 'manager'
        totalManagers = await UserModel.countDocuments({ role: { $regex: '^manager$', $options: 'i' } }).catch(err => {
          d('User.countDocuments(managers) error', (err && err.message) || err);
          return 0;
        });
      } catch (e) {
        d('totalManagers compute exception', e && e.message ? e.message : e);
        totalManagers = 0;
      }
    }

    // range for chart only
    const range = (req.query.paymentsRange || 'monthly').toLowerCase();
    const now = new Date();
    let start = null;
    let dateFormat = '%Y-%m-%d';
    let groupUnit = 'day';

    if (range === 'daily') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dateFormat = '%Y-%m-%dT%H:00:00';
      groupUnit = 'hour';
    } else if (range === 'weekly') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      dateFormat = '%Y-%m-%d';
      groupUnit = 'day';
    } else if (range === 'monthly') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFormat = '%Y-%m-%d';
      groupUnit = 'day';
    } else if (range === 'yearly') {
      start = new Date(now.getFullYear(), 0, 1);
      dateFormat = '%Y-%m';
      groupUnit = 'month';
    } else if (range === 'live') {
      start = new Date(now.getTime() - 1000 * 60 * 5);
      dateFormat = '%Y-%m-%dT%H:%M:00';
      groupUnit = 'minute';
    } else {
      start = null;
      dateFormat = '%Y-%m-%d';
      groupUnit = 'day';
    }

    d('rangeInfo', { range, start: start ? start.toISOString() : null, dateFormat, groupUnit });

    // gather person ids in scope (students + teachers), exclude deleted persons
    let personIdsObj = [];
    let personIdsStr = [];
    try {
      const sDocs = await Student.find({ ...(scopeFilter || {}), deleted: { $ne: true } }).select('_id').lean().catch(()=>[]);
      const tDocs = await Teacher.find({ ...(scopeFilter || {}), deleted: { $ne: true } }).select('_id').lean().catch(()=>[]);
      const sIds = (sDocs || []).map(s => String(s._id)).filter(Boolean);
      const tIds = (tDocs || []).map(t => String(t._id)).filter(Boolean);
      const unique = Array.from(new Set([...sIds, ...tIds]));
      personIdsObj = unique.map(id => new mongoose.Types.ObjectId(String(id)));
      personIdsStr = unique.slice();
      d('personIdsCollected', { countObj: personIdsObj.length, sampleObj: personIdsObj.slice(0,5), countStr: personIdsStr.length, sampleStr: personIdsStr.slice(0,5) });
    } catch (e) {
      console.error('failed to collect person ids for payments scope', e && e.stack ? e.stack : e);
      d('personIdsCollectionError', (e && e.stack) || e);
      personIdsObj = []; personIdsStr = [];
    }

    // quick sample: find one Payment in DB that matches our scope (to inspect shape)
    try {
      let samplePayment = null;
      if (personIdsObj.length) {
        samplePayment = await Payment.findOne({ personId: personIdsObj[0] }).lean().catch(()=>null);
      }
      if (!samplePayment && personIdsStr.length) {
        // try string match
        samplePayment = await Payment.findOne({ $expr: { $in: [ { $toString: '$personId' }, personIdsStr ] } }).lean().catch(()=>null);
      }
      if (!samplePayment && schoolOid) {
        samplePayment = await Payment.findOne({ schoolId: schoolOid }).lean().catch(()=>null);
      }
      if (samplePayment) {
        // show only small useful fields
        d('samplePaymentFound', {
          _id: String(samplePayment._id),
          personId: samplePayment.personId,
          personId_type: typeof samplePayment.personId,
          amount: samplePayment.amount,
          paymentType: samplePayment.paymentType,
          months: samplePayment.months,
          createdAt: samplePayment.createdAt
        });
      } else {
        d('samplePaymentFound', 'no sample payment matched scope');
      }
    } catch (e) {
      d('samplePaymentInspectError', (e && e.stack) || e);
    }

    // if no persons, return zeroed payments but still compute topStudents (which will be empty or based on students)
    if (!personIdsObj.length) {
      d('no persons in scope', { personIdsObjLength: personIdsObj.length, personIdsStrLength: personIdsStr.length });

      // build empty series if start present
      let emptySeries = [];
      if (start) {
        const buckets = [];
        const curr = new Date(start);
        while (curr <= now) {
          let label;
          if (groupUnit === 'hour') {
            label = curr.getFullYear() + '-' + String(curr.getMonth()+1).padStart(2,'0') + '-' + String(curr.getDate()).padStart(2,'0') + 'T' + String(curr.getHours()).padStart(2,'0') + ':00:00';
            curr.setHours(curr.getHours() + 1);
          } else if (groupUnit === 'minute') {
            label = curr.getFullYear() + '-' + String(curr.getMonth()+1).padStart(2,'0') + '-' + String(curr.getDate()).padStart(2,'0') + 'T' + String(curr.getHours()).padStart(2,'0') + ':' + String(curr.getMinutes()).padStart(2,'0') + ':00';
            curr.setMinutes(curr.getMinutes() + 1);
          } else if (groupUnit === 'month') {
            label = curr.getFullYear() + '-' + String(curr.getMonth()+1).padStart(2,'0');
            curr.setMonth(curr.getMonth() + 1);
          } else {
            label = curr.getFullYear() + '-' + String(curr.getMonth()+1).padStart(2,'0') + '-' + String(curr.getDate()).padStart(2,'0');
            curr.setDate(curr.getDate() + 1);
          }
          buckets.push({ label, total: 0, count: 0 });
        }
        emptySeries = buckets;
      }

      // compute topStudents (no paid data)
      let topStudents = [];
      try {
        const studentsList = await Student.find({ ...(scopeFilter || {}), deleted: { $ne: true } }).limit(500).select('fullname numberId totalDue fee').lean().catch(()=>[]);
        const computed = (studentsList || []).map(s => {
          const totalDue = Number(s.totalDue || s.fee || 0);
          return { _id: s._id, fullname: s.fullname, numberId: s.numberId, totalDue, paidAmount: 0, balance: totalDue };
        }).sort((a,b) => (b.balance || 0) - (a.balance || 0)).slice(0,5);
        topStudents = computed;
      } catch (err) {
        console.error('topStudents (no persons) compute failed', err && err.stack ? err.stack : err);
        d('topStudents_no_persons_error', err && err.message ? err.message : err);
      }

      const payload = {
        totalStudents,
        totalTeachers,
        totalClasses,
        totalSubjects,
        // include totalManagers so frontend can show it for admins (0 for managers)
        totalManagers,
        payments: { totalPaid: 0, count: 0, series: emptySeries },
        topStudents
      };
      if (debugEnabled) payload.debug = debug;
      return res.json(payload);
    }

    // Robust payments aggregation: try ObjectId match, then string-match, then schoolId fallback
    let paymentsTotalPaid = 0;
    let paymentsCount = 0;
    let paymentsSeries = [];

    try {
      // Build a "base" match that excludes soft-deleted payments and applies the date window if set
      const baseMatch = { deleted: { $ne: true } };
      if (start) baseMatch.createdAt = { $gte: start, $lte: now };

      d('baseMatch', baseMatch);

      // Primary approach: match personId with ObjectId array (the normal, expected case)
      const primaryMatch = {
        ...baseMatch,
        personId: { $in: personIdsObj }
      };

      d('primaryMatch sample', { samplePersonIdObj: personIdsObj[0] });

      const primaryAgg = await Payment.aggregate([
        { $match: primaryMatch },
        { $group: { _id: null, totalPaid: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } }
      ]).catch((e)=>{ d('primaryAgg error', e && e.message ? e.message : e); return []; });

      d('primaryAgg result', primaryAgg && primaryAgg[0] ? primaryAgg[0] : null);

      paymentsTotalPaid = Number((primaryAgg[0] && primaryAgg[0].totalPaid) || 0);
      paymentsCount = Number((primaryAgg[0] && primaryAgg[0].count) || 0);

      // If primary found nothing, try matching via stringified personId (covers stray string IDs)
      if (!paymentsCount) {
        d('primaryAgg returned zero, trying string-match fallback', { personIdsStrLen: personIdsStr.length });
        const stringMatch = {
          ...baseMatch,
          $expr: {
            $in: [ { $toString: '$personId' }, personIdsStr ]
          }
        };

        d('stringMatch example', { exprSample: personIdsStr.slice(0,5) });

        const stringAgg = await Payment.aggregate([
          { $match: stringMatch },
          { $group: { _id: null, totalPaid: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } }
        ]).catch((e)=>{ d('stringAgg error', e && e.message ? e.message : e); return []; });

        d('stringAgg result', stringAgg && stringAgg[0] ? stringAgg[0] : null);

        if (stringAgg && stringAgg[0]) {
          paymentsTotalPaid = Number(stringAgg[0].totalPaid || 0);
          paymentsCount = Number(stringAgg[0].count || 0);
          d('string-match fallback produced results', { paymentsTotalPaid, paymentsCount });
        }
      }

      // As a final fallback (if still zero), try matching payments scoped by schoolId (in case payments link only by school)
      if (!paymentsCount && schoolOid) {
        d('trying schoolId fallback', { schoolOid: String(schoolOid) });
        const schoolMatch = { ...baseMatch, schoolId: schoolOid };
        const schoolAgg = await Payment.aggregate([
          { $match: schoolMatch },
          { $group: { _id: null, totalPaid: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } }
        ]).catch((e)=>{ d('schoolAgg error', e && e.message ? e.message : e); return []; });
        d('schoolAgg result', schoolAgg && schoolAgg[0] ? schoolAgg[0] : null);
        if (schoolAgg && schoolAgg[0]) {
          paymentsTotalPaid = Number(schoolAgg[0].totalPaid || 0);
          paymentsCount = Number(schoolAgg[0].count || 0);
          d('schoolId fallback produced results', { paymentsTotalPaid, paymentsCount });
        }
      }

      // --- compute time-series (for chart) using the most permissive personId match we attempted above ---
      let seriesMatch = { ...baseMatch };
      if (personIdsObj && personIdsObj.length) {
        seriesMatch.$or = [
          { personId: { $in: personIdsObj } },
          { $expr: { $in: [ { $toString: '$personId' }, personIdsStr ] } }
        ];
      } else if (schoolOid) {
        seriesMatch.schoolId = schoolOid;
      }

      d('seriesMatch', seriesMatch);

      const aggSeries = await Payment.aggregate([
        { $match: seriesMatch },
        { $project: { amount: { $ifNull: ['$amount', 0] }, createdAt: 1 } },
        {
          $group: {
            _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
            last: { $max: '$createdAt' }
          }
        },
        { $sort: { last: 1 } }
      ]).catch((e)=>{ d('aggSeries error', e && e.message ? e.message : e); return []; });

      d('aggSeries length', (aggSeries && aggSeries.length) ? aggSeries.length : 0);

      paymentsSeries = (aggSeries || []).map(x => ({ label: x._id, total: Number(x.total || 0), count: Number(x.count || 0) }));

      // If the series has counts but the top-level paymentsCount is zero, recalc paymentsCount from series (sensible fallback)
      if ((!Number.isFinite(paymentsCount) || paymentsCount === 0) && paymentsSeries && paymentsSeries.length) {
        paymentsCount = paymentsSeries.reduce((s,x) => s + (Number(x.count || 0)), 0);
        d('recalculated paymentsCount from series', paymentsCount);
      }

      // If still no series and we had a date window, build empty buckets (so chart displays)
      if ((!paymentsSeries || paymentsSeries.length === 0) && start) {
        const buckets = [];
        const curr = new Date(start);
        while (curr <= now) {
          let label;
          if (groupUnit === 'hour') {
            label = curr.getFullYear() + '-' + String(curr.getMonth()+1).padStart(2,'0') + '-' + String(curr.getDate()).padStart(2,'0') + 'T' + String(curr.getHours()).padStart(2,'0') + ':00:00';
            curr.setHours(curr.getHours() + 1);
          } else if (groupUnit === 'minute') {
            label = curr.getFullYear() + '-' + String(curr.getMonth()+1).padStart(2,'0') + '-' + String(curr.getDate()).padStart(2,'0') + 'T' + String(curr.getHours()).padStart(2,'0') + ':' + String(curr.getMinutes()).padStart(2,'0') + ':00';
            curr.setMinutes(curr.getMinutes() + 1);
          } else if (groupUnit === 'month') {
            label = curr.getFullYear() + '-' + String(curr.getMonth()+1).padStart(2,'0');
            curr.setMonth(curr.getMonth() + 1);
          } else {
            label = curr.getFullYear() + '-' + String(curr.getMonth()+1).padStart(2,'0') + '-' + String(curr.getDate()).padStart(2,'0');
            curr.setDate(curr.getDate() + 1);
          }
          buckets.push({ label, total: 0, count: 0 });
        }
        paymentsSeries = buckets;
        d('built empty series buckets', { len: paymentsSeries.length });
      }

    } catch (e) {
      console.error('dashboard payments aggregate failed (robust path)', e && e.stack ? e.stack : e);
      d('paymentsAggregateException', e && e.stack ? e.stack : e);
      paymentsTotalPaid = 0;
      paymentsCount = 0;
      paymentsSeries = [];
    }

    // compute topStudents using ALL-TIME payments (makes "Outstanding" accurate)
    let topStudents = [];
    try {
      const studentsList = await Student.find({ ...(scopeFilter || {}), deleted: { $ne: true } })
        .limit(500).select('fullname numberId totalDue fee').lean().catch(()=>[]);
      const studentIds = (studentsList || []).map(s => String(s._id)).filter(Boolean);
      d('studentsList for topStudents', { count: studentIds.length, sample: studentIds.slice(0,5) });

      if (studentIds.length) {
        // Build pmatch to match either ObjectId-stored personId or string-stored personId
        const objIds = studentIds.map(id => new mongoose.Types.ObjectId(String(id)));
        const pmatch = {
          personType: 'student',
          deleted: { $ne: true },
          $or: [
            { personId: { $in: objIds } },   // ObjectId stored payments
            { $expr: { $in: [ { $toString: '$personId' }, studentIds ] } } // string-stored payments
          ]
        };

        d('paidSums match', { exampleObjId: String(objIds[0]), exampleStrId: studentIds[0] });

        const paidSums = await Payment.aggregate([
          { $match: pmatch },
          { $group: { _id: '$personId', paid: { $sum: { $ifNull: ['$amount', 0] } } } }
        ]).catch((e)=>{ d('paidSums error', e && e.message ? e.message : e); return []; });

        d('paidSums length', (paidSums && paidSums.length) ? paidSums.length : 0);
        d('paidSums sample', (paidSums && paidSums.slice(0,6)) || []);

        const paidMap = new Map((paidSums || []).map(p => [String(p._id), Number(p.paid || 0)]));

        const computed = (studentsList || []).map(s => {
          const totalDue = Number(s.totalDue || s.fee || 0);
          const paid = Number(paidMap.get(String(s._id)) || 0);
          const balance = totalDue - paid;
          return { _id: s._id, fullname: s.fullname, numberId: s.numberId, totalDue, paidAmount: paid, balance };
        }).sort((a,b) => (b.balance || 0) - (a.balance || 0));
        topStudents = computed.slice(0,5);
      }
      d('topStudents final', (topStudents || []).map(t => ({ fullname: t.fullname, balance: t.balance })));
    } catch (err) {
      console.error('dashboard topStudents compute failed', err && err.stack ? err.stack : err);
      d('topStudentsError', err && err.message ? err.message : err);
      topStudents = [];
    }

    // final response:
    const payload = {
      totalStudents,
      totalTeachers,
      totalClasses,
      totalSubjects,
      // include totalManagers so admin frontend can show it; managers will get 0
      totalManagers,
      payments: {
        totalPaid: paymentsTotalPaid,
        count: paymentsCount,
        series: paymentsSeries
      },
      topStudents
    };
    if (debugEnabled) payload.debug = debug;
    return res.json(payload);

  } catch (err) {
    console.error('GET /dashboard error', err && err.stack ? err.stack : err);
    if (debugEnabled) debug.messages.push('GET /dashboard final error: ' + (err && err.message ? err.message : String(err)));
    return res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null, debug: debugEnabled ? debug : undefined });
  }
});

module.exports = router;
