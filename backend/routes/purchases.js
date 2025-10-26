// backend/routes/purchases.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const PurchaseAttempt = require('../models/PurchaseAttempt');
const Course = require('../models/Course');
const HelpMessage = require('../models/HelpMessageCourses');
const User = require('../models/User');

const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

function toObjectIdIfPossible(id) {
  try { if (mongoose.Types.ObjectId.isValid(String(id))) return mongoose.Types.ObjectId(String(id)); } catch(e) {}
  return id;
}

/* POST /purchases - create attempt */
router.post('/', auth, async (req, res) => {
  try {
    const { courseId, provider, enteredPhoneNumber, amount } = req.body || {};
    if (!courseId) return res.status(400).json({ ok:false, message:'courseId required' });

    // find course by _id or courseId
    let course = null;
    if (mongoose.Types.ObjectId.isValid(String(courseId))) course = await Course.findById(courseId).exec();
    if (!course) course = await Course.findOne({ courseId: String(courseId) }).exec();
    if (!course) return res.status(404).json({ ok:false, message:'Course not found' });
    if (course.deleted) return res.status(400).json({ ok:false, message:'Course deleted' });

    const cost = Number(amount !== undefined ? amount : (course.isFree ? 0 : course.price || 0));
    const pa = new PurchaseAttempt({
      userId: toObjectIdIfPossible(req.user._id),
      courseId: course._id,
      courseSnapshot: {
        courseId: course.courseId,
        title: course.title,
        price: course.price,
        isFree: course.isFree,
        discount: course.discount
      },
      provider: provider || 'Other',
      enteredPhoneNumber: enteredPhoneNumber || '',
      amount: cost,
      status: course.isFree ? 'verified' : 'checking',
      verifiedAt: course.isFree ? new Date() : null,
      verifiedBy: course.isFree ? toObjectIdIfPossible(req.user._id) : null
    });
    await pa.save();

    // if verified immediately (free), notify via HelpMessage
    if (pa.status === 'verified') {
      const msg = new HelpMessage({
        threadId: 'purchase-' + String(pa._id),
        fromUserId: toObjectIdIfPossible(req.user._id),
        toAdmin: false,
        toUserId: toObjectIdIfPossible(req.user._id),
        body: `You were enrolled in "${course.title}".`
      });
      await msg.save();
    }

    res.json({ ok:true, purchase: pa });
  } catch (err) {
    console.error('POST /purchases', err);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

/* GET /purchases - admin sees all, user sees own */
router.get('/', auth, async (req, res) => {
  try {
    const isAdmin = String(req.user.role || '').toLowerCase() === 'admin';
    const page = Math.max(1, parseInt(req.query.page || '1',10));
    const limit = Math.min(200, Math.max(10, parseInt(req.query.limit || '50',10)));
    const query = {};
    if (!isAdmin) {
      query.userId = toObjectIdIfPossible(req.user._id);
    } else {
      if (req.query.status) query.status = req.query.status;
      if (req.query.courseId) {
        const cs = await Course.find({ courseId: new RegExp(String(req.query.courseId),'i') }).select('_id').lean().exec();
        if (cs && cs.length) query.courseId = { $in: cs.map(x=>x._id) };
      }
    }
    const total = await PurchaseAttempt.countDocuments(query).exec();
    const items = await PurchaseAttempt.find(query).sort({ createdAt:-1 }).skip((page-1)*limit).limit(limit)
      .populate('userId','fullname email')
      .populate('courseId','courseId title')
      .lean().exec();
    res.json({ ok:true, total, page, limit, purchases: items });
  } catch (err) {
    console.error('GET /purchases', err);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

/* POST /purchases/:id/verify - admin verify/unverify */
router.post('/:id/verify', auth, roles(['admin']), async (req, res) => {
  try {
    const pa = await PurchaseAttempt.findById(req.params.id);
    if (!pa) return res.status(404).json({ ok:false, message:'Not found' });
    const { action, adminNotes } = req.body || {};
    if (action === 'prove' || action === 'verified') {
      if (pa.status === 'verified') return res.json({ ok:true, purchase: pa });
      pa.status = 'verified';
      pa.verifiedAt = new Date();
      pa.verifiedBy = toObjectIdIfPossible(req.user._id);
      pa.adminNotes = adminNotes || '';
      await pa.save();
      // notify user via HelpMessage
      try {
        const msg = new HelpMessage({
          threadId: 'purchase-' + String(pa._id),
          fromUserId: toObjectIdIfPossible(req.user._id),
          toAdmin: false,
          toUserId: toObjectIdIfPossible(pa.userId),
          body: `Your payment for "${pa.courseSnapshot.title}" (${pa.courseSnapshot.courseId}) has been verified. You now have access.`
        });
        await msg.save();
      } catch (e) { console.warn('notify message failed', e); }
      return res.json({ ok:true, purchase: pa });
    } else if (action === 'unprove' || action === 'unproven') {
      pa.status = 'unproven';
      pa.adminNotes = adminNotes || '';
      await pa.save();
      try {
        const msg = new HelpMessage({
          threadId: 'purchase-' + String(pa._id),
          fromUserId: toObjectIdIfPossible(req.user._id),
          toAdmin: false,
          toUserId: toObjectIdIfPossible(pa.userId),
          body: pa.adminNotes ? `We could not verify your payment: ${pa.adminNotes}` : 'We could not verify your payment. Please re-check and resend evidence.'
        });
        await msg.save();
      } catch (e) { console.warn('notify failed', e); }
      return res.json({ ok:true, purchase: pa });
    } else {
      return res.status(400).json({ ok:false, message:'Invalid action' });
    }
  } catch (err) {
    console.error('POST /purchases/:id/verify', err);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
