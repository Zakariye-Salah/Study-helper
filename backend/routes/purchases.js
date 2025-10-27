// backend/routes/purchases.js
'use strict';
const express = require('express');
const router = express.Router();
const Purchase = require('../models/Purchase');
const Course = require('../models/Course');
const HelpMsg = require('../models/HelpMessageCourse');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// same auth middleware used in courses.js (or extract to shared util)
// quick reimplementation:
async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i,'').trim();
    if (!token) return res.status(401).json({ ok:false, error:'Authentication required' });
    const secret = process.env.JWT_SECRET || 'secret';
    const payload = jwt.verify(token, secret);
    if (!payload || !payload.sub) return res.status(401).json({ ok:false, error:'Invalid token' });
    const u = await User.findById(payload.sub).lean().catch(()=>null);
    if (!u) return res.status(401).json({ ok:false, error:'User not found' });
    req.user = u;
    next();
  } catch (err) {
    console.warn('requireAuth failed', err && err.message);
    return res.status(401).json({ ok:false, error:'Auth failed' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const myRole = (req.user && req.user.role || '').toLowerCase();
    if (myRole !== role) return res.status(403).json({ ok:false, error:'Forbidden' });
    next();
  };
}

/**
 * POST /api/purchases
 * create a purchase attempt or enrollment for free courses
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const courseId = body.courseId;
    if (!courseId) return res.status(400).json({ ok:false, error:'courseId required' });

    const course = await Course.findById(courseId).lean().catch(()=>null) || await Course.findOne({ courseId: courseId }).lean().catch(()=>null);
    if (!course) return res.status(404).json({ ok:false, error:'Course not found' });

    // if free, create a verified purchase record immediately
    if (course.isFree) {
      const p = new Purchase({
        userId: req.user._id,
        courseId: course._id,
        courseSnapshot: { courseId: course.courseId, title: course.title, price: 0 },
        provider: 'Other',
        enteredPhoneNumber: '',
        amount: 0,
        status: 'verified',
        verifiedAt: new Date(),
        verifiedBy: req.user._id
      });
      await p.save();
      // emit socket notification if available
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.to('user:' + String(req.user._id)).emit('purchase:verified', { purchaseId: p._id });
      return res.json({ ok:true, purchase: p });
    }

    // Paid course flow
    const prov = body.provider || 'Other';
    const phone = body.enteredPhoneNumber || '';
    const amount = Number(body.amount || course.price || 0);

    const newP = new Purchase({
      userId: req.user._id,
      courseId: course._id,
      courseSnapshot: { courseId: course.courseId, title: course.title, price: course.price || 0 },
      provider: prov,
      enteredPhoneNumber: phone,
      amount: amount,
      status: 'checking'
    });
    await newP.save();

    // notify admins (socket emit)
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) {
        const checkingCount = await Purchase.countDocuments({ status: 'checking' }).catch(()=>0);
        io.emit('notification.checking_count_update', { count: checkingCount });
        io.emit('purchase:created', { purchaseId: newP._id });
      }
    } catch (e) { console.warn('socket emit failed', e); }

    return res.json({ ok:true, purchase: newP });
  } catch (err) {
    console.error('POST /purchases error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * GET /api/purchases
 * - Admin: returns all (with optional status=checking)
 * - User: returns user's purchases
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const status = req.query.status || null;
    const page = Math.max(1, parseInt(req.query.page || '1',10));
    const limit = Math.min(200, parseInt(req.query.limit || '50',10));
    let query = {};
    if ((req.user.role||'').toLowerCase() === 'admin') {
      if (status) query.status = status;
    } else {
      query.userId = req.user._id;
      if (status) query.status = status;
    }
    const purchases = await Purchase.find(query).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).populate('userId', 'fullname name email').lean().exec();
    return res.json({ ok:true, purchases });
  } catch (err) {
    console.error('GET /purchases error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * POST /api/purchases/:id/verify (admin)
 * body.action = 'prove' or 'unprove'
 */
router.post('/:id/verify', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const action = (req.body && req.body.action) || '';
    const purchase = await Purchase.findById(id).exec();
    if (!purchase) return res.status(404).json({ ok:false, error:'Not found' });

    if (action === 'prove') {
      purchase.status = 'verified';
      purchase.verifiedAt = new Date();
      purchase.verifiedBy = req.user._id;
      await purchase.save();
      // notify user via socket and create a help message
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.to('user:' + String(purchase.userId)).emit('purchase:verified', { id: purchase._id });
      // create an inbox message for user
      const msg = new HelpMsg({
        fromUserId: null,
        toAdmin: false,
        toUserId: purchase.userId,
        text: `Your payment for "${purchase.courseSnapshot && purchase.courseSnapshot.title}" (${purchase.courseSnapshot && purchase.courseSnapshot.courseId}) has been verified. You now have access.`,
        read: false
      });
      await msg.save();
      if (io) io.to('user:' + String(purchase.userId)).emit('help:new', msg);
      // emit checking count update
      if (io) {
        const checkingCount = await Purchase.countDocuments({ status: 'checking' }).catch(()=>0);
        io.emit('notification.checking_count_update', { count: checkingCount });
      }
      return res.json({ ok:true, purchase });
    } else if (action === 'unprove') {
      purchase.status = 'unproven';
      purchase.adminNotes = req.body.adminNotes || '';
      await purchase.save();
      const io = req.app && req.app.get && req.app.get('io');
      // message to user
      const msg = new HelpMsg({
        fromUserId: null,
        toAdmin: false,
        toUserId: purchase.userId,
        text: `We could not verify your payment for "${purchase.courseSnapshot && purchase.courseSnapshot.title}". Reason: ${purchase.adminNotes || 'Please re-check and resend proof.'}`,
        read: false
      });
      await msg.save();
      if (io) io.to('user:' + String(purchase.userId)).emit('help:new', msg);
      if (io) {
        const checkingCount = await Purchase.countDocuments({ status: 'checking' }).catch(()=>0);
        io.emit('notification.checking_count_update', { count: checkingCount });
      }
      return res.json({ ok:true, purchase });
    } else {
      return res.status(400).json({ ok:false, error:'Unknown action' });
    }
  } catch (err) {
    console.error('POST /purchases/:id/verify error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

module.exports = router;
