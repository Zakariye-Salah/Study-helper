// backend/routes/dashboard.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const mongoose = require('mongoose');

const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Payment = require('../models/Payment');

const toNum = v => (typeof v === 'number' ? v : (Number(v) || 0));

/**
 * Dashboard: summary for the requesting user's scope.
 * - manager: scoped to records where schoolId === manager.schoolId OR createdBy === manager._id
 * - admin: global (no scope)
 */
// ... top of file unchanged ...

// --- GET /dashboard  (replace existing handler) ---
router.get('/', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const rawUser = req.user || {};
    const userIdRaw = rawUser._id || rawUser.id || rawUser.userId || rawUser.uid || null;
    const rawSchool = rawUser.schoolId || rawUser.school || null;
    const role = (rawUser.role || '').toLowerCase();

    const userOid = (userIdRaw && mongoose.Types.ObjectId.isValid(String(userIdRaw))) ? new mongoose.Types.ObjectId(String(userIdRaw)) : null;
    const schoolOid = (rawSchool && mongoose.Types.ObjectId.isValid(String(rawSchool))) ? new mongoose.Types.ObjectId(String(rawSchool)) : null;

    // compute scope filter from role (manager -> scoped; admin -> global)
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
      return res.status(403).json({ message: 'Forbidden' });
    }

    // compute totals
    const totalStudents = await Student.countDocuments(scopeFilter).catch(()=>0);
    const totalTeachers = await Teacher.countDocuments(scopeFilter).catch(()=>0);

    // paymentsRange parameter (default monthly)
    const range = (req.query.paymentsRange || 'monthly').toLowerCase();

    // Determine date bucket and start date for aggregation
    const now = new Date();
    let start = null;
    let dateFormat = '%Y-%m-%d'; // default -> day
    let groupUnit = 'day';

    if (range === 'daily') {
      // today hourly
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dateFormat = '%Y-%m-%dT%H:00:00'; // we'll use hour style labels
      groupUnit = 'hour';
    } else if (range === 'weekly') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6); // last 7 days (including today)
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
      // last 5 minutes aggregated by minute
      start = new Date(now.getTime() - 1000 * 60 * 5);
      dateFormat = '%Y-%m-%dT%H:%M:00';
      groupUnit = 'minute';
    } else { // 'all'
      start = null; // no start filter
      dateFormat = '%Y-%m-%d';
      groupUnit = 'day';
    }

    // Build paymentsMatch using scopeFilter and createdAt range
    const paymentsMatch = {};
    if (scopeFilter && Object.keys(scopeFilter).length) {
      if (scopeFilter.$or) paymentsMatch.$or = scopeFilter.$or;
      else Object.assign(paymentsMatch, scopeFilter);
    }
    if (start) {
      paymentsMatch.createdAt = { $gte: start, $lte: now };
    }

    // compute payments total and series
    let paymentsTotalPaid = 0;
    let paymentsSeries = [];
    let paymentsCount = 0;

    try {
      // total paid
      const aggTotal = await Payment.aggregate([
        { $match: paymentsMatch },
        { $group: { _id: null, totalPaid: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]).catch(()=>[]);
      paymentsTotalPaid = Number((aggTotal[0] && aggTotal[0].totalPaid) || 0);
      paymentsCount = Number((aggTotal[0] && aggTotal[0].count) || 0);

      // time series
      // use $dateToString with the chosen dateFormat (UTC). If your app requires timezone adjust, add timezone option.
      const agg = await Payment.aggregate([
        { $match: paymentsMatch },
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
      ]).catch(()=>[]);

      paymentsSeries = (agg || []).map(x => ({ label: x._id, total: Number(x.total || 0), count: Number(x.count || 0) }));

      // If no series points (empty) but we have start/end, create empty buckets so frontend chart still shows axis
      if ((!paymentsSeries || !paymentsSeries.length) && start) {
        // generate buckets between start and now based on groupUnit
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
            // day
            label = curr.getFullYear() + '-' + String(curr.getMonth()+1).padStart(2,'0') + '-' + String(curr.getDate()).padStart(2,'0');
            curr.setDate(curr.getDate() + 1);
          }
          buckets.push({ label, total: 0, count: 0 });
        }
        paymentsSeries = buckets;
      }

    } catch (e) {
      console.error('dashboard payments aggregate failed', e && e.stack ? e.stack : e);
      paymentsTotalPaid = 0;
      paymentsSeries = [];
    }

    // compute topStudents same as before (scope is respected)
    let topStudents = [];
    try {
      const studentsList = await Student.find(scopeFilter).limit(500).select('fullname numberId totalDue fee').lean().catch(()=>[]);
      const studentIds = (studentsList || []).map(s => s._id).filter(Boolean);
      let paidSums = [];
      if (studentIds.length) {
        // payments for students in list and within scopeFilter
        const paidMatch = { personType: 'student', personId: { $in: studentIds } };
        if (paymentsMatch.$or) {
          paidSums = await Payment.aggregate([
            { $match: { $and: [ { personType: 'student', personId: { $in: studentIds } }, { $or: paymentsMatch.$or } ] } },
            { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
          ]).catch(()=>[]);
        } else {
          Object.assign(paidMatch, paymentsMatch);
          paidSums = await Payment.aggregate([
            { $match: paidMatch },
            { $group: { _id: '$personId', paid: { $sum: '$amount' } } }
          ]).catch(()=>[]);
        }
      }
      const paidMap = new Map((paidSums || []).map(p => [String(p._id), Number(p.paid || 0)]));
      const computed = (studentsList || []).map(s => {
        const totalDue = Number(s.totalDue || s.fee || 0);
        const paid = Number(paidMap.get(String(s._id)) || 0);
        const balance = totalDue - paid;
        return { _id: s._id, fullname: s.fullname, numberId: s.numberId, totalDue, paidAmount: paid, balance };
      });
      computed.sort((a,b) => (b.balance || 0) - (a.balance || 0));
      topStudents = computed.slice(0,5);
    } catch (err) {
      console.error('dashboard topStudents compute failed', err && err.stack ? err.stack : err);
      topStudents = [];
    }

    // return consistent shape
    res.json({
      totalStudents,
      totalTeachers,
      payments: { totalPaid: paymentsTotalPaid, count: paymentsCount, series: paymentsSeries },
      topStudents
    });
  } catch (err) {
    console.error('GET /dashboard error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  }
});



module.exports = router;
