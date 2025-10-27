// backend/routes/purchases.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Course = require('../models/Course');
const HelpThread = require('../models/HelpThread');
const HelpMessage = require('../models/HelpMessage');
const { requireAuth, requireRole } = require('../middleware/auth');

// create purchase / enroll
router.post('/', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const courseId = body.courseId;
    if (!courseId) return res.status(400).json({ ok:false, error:'courseId required' });

    const course = await Course.findById(courseId).lean().catch(()=>null) || await Course.findOne({ courseId }).lean().catch(()=>null);
    if (!course) return res.status(404).json({ ok:false, error:'Course not found' });

    // free -> immediate verified
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
      // increment buyersCount
      await Course.findByIdAndUpdate(course._id, { $inc: { buyersCount: 1 } }).catch(()=>{});
      const io = req.app && req.app.get && req.app.get('io');
      if (io) io.to('user:' + String(req.user._id)).emit('purchase:verified', { purchaseId: p._id });
      return res.json({ ok:true, purchase: p });
    }

    // paid -> create checking
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

    // emit checking count update
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

// GET /api/purchases
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
    const purchases = await Purchase.find(query).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit)
      .populate('userId', 'fullname name email').lean().exec();
    return res.json({ ok:true, purchases });
  } catch (err) {
    console.error('GET /purchases error', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// POST /api/purchases/:id/verify (admin)
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

      // increment course buyersCount
      try { await Course.findByIdAndUpdate(purchase.courseId, { $inc: { buyersCount: 1 } }).catch(()=>{}); } catch(e){}

      // notify user
      if (io) io.to('user:' + String(purchase.userId)).emit('purchase:verified', { id: purchase._id });

      // create or append a help message thread for this notification
      try {
        let thread = await HelpThread.findOne({ userId: purchase.userId }).exec();
        if (!thread) {
          thread = new HelpThread({ userId: purchase.userId, subject: 'Payment verification' });
        }
        thread.lastMessage = `Your payment for "${purchase.courseSnapshot && purchase.courseSnapshot.title}" has been verified.`;
        thread.unreadForUser = (thread.unreadForUser || 0) + 1;
        await thread.save();

        const msg = new HelpMessage({
          threadId: thread._id,
          fromUserId: null,
          toAdmin: false,
          toUserId: purchase.userId,
          text: `Your payment for "${purchase.courseSnapshot && purchase.courseSnapshot.title}" has been verified. You now have access.`,
          read: false
        });
        await msg.save();
        if (io) io.to('user:' + String(purchase.userId)).emit('help:new', msg);
      } catch (e) { console.warn('help message create failed', e); }

      // emit new checking count
      if (io) {
        const checkingCount = await Purchase.countDocuments({ status: 'checking' }).catch(()=>0);
        io.emit('notification.checking_count_update', { count: checkingCount });
      }

      return res.json({ ok:true, purchase });
    } else if (action === 'unprove') {
      purchase.status = 'unproven';
      purchase.adminNotes = req.body.adminNotes || '';
      await purchase.save();

      // notify user by help message
      try {
        let thread = await HelpThread.findOne({ userId: purchase.userId }).exec();
        if (!thread) {
          thread = new HelpThread({ userId: purchase.userId, subject: 'Payment verification' });
        }
        thread.lastMessage = `Payment could not be verified: ${purchase.adminNotes || ''}`;
        thread.unreadForUser = (thread.unreadForUser || 0) + 1;
        await thread.save();

        const msg = new HelpMessage({
          threadId: thread._id,
          fromUserId: null,
          toAdmin: false,
          toUserId: purchase.userId,
          text: `We could not verify your payment. Reason: ${purchase.adminNotes || 'Please re-check and resend proof.'}`,
          read: false
        });
        await msg.save();
        if (io) io.to('user:' + String(purchase.userId)).emit('help:new', msg);
      } catch (e) { console.warn('help message create failed', e); }

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
