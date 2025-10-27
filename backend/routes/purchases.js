// backend/routes/purchases.js
'use strict';
const express = require('express');
const router = express.Router();
const Purchase = require('../models/Purchase');
const Course = require('../models/Course');
const HelpMsg = require('../models/HelpMessageCourse');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
 * create purchase attempt (paid) or enrollment (free)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const courseId = body.courseId;
    if (!courseId) return res.status(400).json({ ok:false, error:'courseId required' });

    const course = await Course.findById(courseId).lean().catch(()=>null) || await Course.findOne({ courseId: courseId }).lean().catch(()=>null);
    if (!course) return res.status(404).json({ ok:false, error:'Course not found' });

    // if user already verified for this course, return existing
    const existing = await Purchase.findOne({ userId: req.user._id, courseId: course._id, status: 'verified' }).lean().catch(()=>null);
    if (existing) return res.json({ ok:true, purchase: existing, message: 'Already enrolled' });

    // if free -> create verified purchase immediately
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
      // increment buyersCount on course
      await Course.findByIdAndUpdate(course._id, { $inc: { buyersCount: 1 } }).catch(()=>{});
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.to('user:' + String(req.user._id)).emit('purchase:verified', { purchaseId: p._id });
      return res.json({ ok:true, purchase: p });
    }

    // Paid flow: create checking record
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

    // notify admins via socket
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) {
        const checkingCount = await Purchase.countDocuments({ status: 'checking' }).catch(()=>0);
        io.emit('notification.checking_count_update', { count: checkingCount });
        io.emit('purchase:created', { purchaseId: newP._id, courseId: course._id });
        // optionally notify admins in role: admin room
        io.to('role:admin').emit('purchase:created', { purchaseId: newP._id });
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
 * Admin -> all (optionally filter by status)
 * User -> own purchases
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

    const io = req.app && req.app.get && req.app.get('io');

    if (action === 'prove') {
      purchase.status = 'verified';
      purchase.verifiedAt = new Date();
      purchase.verifiedBy = req.user._id;
      await purchase.save();
      // update course buyersCount
      await Course.findByIdAndUpdate(purchase.courseId, { $inc: { buyersCount: 1 } }).catch(()=>{});
      // send socket event & create help message to user
      if (io) io.to('user:' + String(purchase.userId)).emit('purchase:verified', { id: purchase._id });
      const msg = new HelpMsg({
        fromUserId: null,
        toAdmin: false,
        toUserId: purchase.userId,
        subject: 'Payment verified',
        text: `Your payment for "${purchase.courseSnapshot && purchase.courseSnapshot.title}" (${purchase.courseSnapshot && purchase.courseSnapshot.courseId}) has been verified. You now have access.`,
        read: false,
        meta: { purchaseId: purchase._id, courseId: purchase.courseId }
      });
      await msg.save();
      if (io) io.to('user:' + String(purchase.userId)).emit('help:new', msg);
      // emit checking count update to all
      if (io) {
        const checkingCount = await Purchase.countDocuments({ status: 'checking' }).catch(()=>0);
        io.emit('notification.checking_count_update', { count: checkingCount });
      }
      return res.json({ ok:true, purchase });
    } else if (action === 'unprove') {
      purchase.status = 'unproven';
      purchase.adminNotes = req.body.adminNotes || '';
      await purchase.save();
      const msg = new HelpMsg({
        fromUserId: null,
        toAdmin: false,
        toUserId: purchase.userId,
        subject: 'Payment not verified',
        text: `We could not verify your payment for "${purchase.courseSnapshot && purchase.courseSnapshot.title}". Reason: ${purchase.adminNotes || 'Please re-check and resend proof.'}`,
        read: false,
        meta: { purchaseId: purchase._id, courseId: purchase.courseId }
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
