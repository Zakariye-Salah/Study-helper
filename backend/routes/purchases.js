// // backend/routes/purchases.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');

// const auth = require('../middleware/auth');
// const roles = require('../middleware/roles');

// const Course = require('../models/Course');
// const PurchaseAttempt = require('../models/PurchaseAttempt');
// const HelpMessage = require('../models/HelpMessage');

// /**
//  * POST /api/purchases
//  * Create a purchase attempt (user clicked I paid)
//  * Body: { courseId (course._id or courseId string), provider, enteredPhoneNumber, amount }
//  */
// router.post('/', auth, async (req, res) => {
//   try {
//     const { courseId, provider = 'Other', enteredPhoneNumber = '', amount = 0 } = req.body || {};
//     if (!courseId) return res.status(400).json({ ok:false, message: 'courseId required' });

//     const course = await Course.findOne({ $or: [{ _id: courseId }, { courseId: courseId }] }).lean();
//     if (!course) return res.status(404).json({ ok:false, message: 'Course not found' });
//     if (course.deleted) return res.status(400).json({ ok:false, message: 'Course not available' });

//     // if free course -> auto-verify (enroll)
//     const snapshot = { courseIdStr: course.courseId, title: course.title, price: Number(course.price || 0), isFree: !!course.isFree };
//     if (course.isFree) {
//       const p = new PurchaseAttempt({
//         userId: req.user._id,
//         courseId: course._id,
//         courseSnapshot: snapshot,
//         provider: 'Other',
//         enteredPhoneNumber: '',
//         amount: 0,
//         status: 'verified',
//         verifiedAt: new Date(),
//         verifiedBy: req.user._id
//       });
//       await p.save();
//       // send notification to user via socket
//       try {
//         const io = req.app && req.app.get && req.app.get('io');
//         if (io) io.to(String(req.user._id)).emit('purchase:verified', { purchaseId: p._id, courseId: course._id });
//       } catch(e){/*ignore*/}
//       return res.json({ ok:true, purchase: p });
//     }

//     // create checking attempt
//     const price = Number(course.price || 0);
//     const attemptedAmount = Number(amount || price);

//     const purchase = new PurchaseAttempt({
//       userId: req.user._id,
//       courseId: course._id,
//       courseSnapshot: snapshot,
//       provider,
//       enteredPhoneNumber: String(enteredPhoneNumber || ''),
//       amount: attemptedAmount,
//       status: 'checking'
//     });

//     await purchase.save();

//     // notify admins via socket (if set)
//     try {
//       const io = req.app && req.app.get && req.app.get('io');
//       if (io) io.emit('purchases:new', { purchaseId: purchase._id, course: snapshot, userId: String(req.user._id) });
//     } catch(e){/*ignore*/}

//     res.json({ ok:true, purchase });
//   } catch (err) {
//     console.error('POST /purchases', err);
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// /**
//  * GET /api/purchases
//  * Admin: list all purchases (filter by status, search by user or course)
//  * User: list own purchases
//  */
// router.get('/', auth, async (req, res) => {
//   try {
//     const requesterRole = (req.user && req.user.role || '').toLowerCase();
//     const isAdmin = requesterRole === 'admin';
//     const status = req.query.status; // optional: checking|verified|unproven
//     const q = {};
//     if (status) q.status = status;

//     // search by q (name or courseId)
//     const search = req.query.q || '';
//     if (search && String(search).trim()) {
//       const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
//       // we will match against courseSnapshot.title (lean) or user fullname by populate later
//       q.$or = [{ 'courseSnapshot.title': rx }, { 'courseSnapshot.courseIdStr': rx }];
//     }

//     if (!isAdmin) {
//       q.userId = req.user._id;
//     }

//     const items = await PurchaseAttempt.find(q).sort({ createdAt: -1 }).limit(500).lean();
//     return res.json({ ok:true, items });
//   } catch (err) {
//     console.error('GET /purchases', err);
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// /**
//  * POST /api/purchases/:id/verify  (admin)
//  * Body: { action: 'prove'|'unprove', note: 'optional message' }
//  */
// router.post('/:id/verify', auth, roles(['admin']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     const p = await PurchaseAttempt.findById(id);
//     if (!p) return res.status(404).json({ ok:false, message: 'Purchase not found' });

//     const action = String((req.body && req.body.action) || '').toLowerCase();
//     const note = (req.body && req.body.note) || '';

//     if (!['prove','unprove'].includes(action)) return res.status(400).json({ ok:false, message: 'Invalid action' });

//     if (action === 'prove') {
//       if (p.status === 'verified') {
//         return res.json({ ok:true, alreadyVerified: true, purchase: p });
//       }
//       p.status = 'verified';
//       p.verifiedAt = new Date();
//       p.verifiedBy = req.user._id;
//       p.adminNotes = note || '';
//       await p.save();

//       // notify user via HelpMessage and socket
//       const hm = new HelpMessage({
//         fromUserId: req.user._id,
//         toAdmin: false,
//         toUserId: p.userId,
//         body: `Your payment for "${p.courseSnapshot.title}" (${p.courseSnapshot.courseIdStr}) has been verified. You now have access.`
//       });
//       await hm.save();
//       try {
//         const io = req.app && req.app.get && req.app.get('io');
//         if (io) {
//           io.to(String(p.userId)).emit('purchase:verified', { purchaseId: p._id, courseId: p.courseId });
//           io.to(String(p.userId)).emit('help:new', { messageId: hm._id, body: hm.body });
//         }
//       } catch(e){/*ignore*/}

//       return res.json({ ok:true, purchase: p });
//     } else {
//       // unprove
//       p.status = 'unproven';
//       p.adminNotes = note || '';
//       p.verifiedAt = new Date();
//       p.verifiedBy = req.user._id;
//       await p.save();

//       const hm = new HelpMessage({
//         fromUserId: req.user._id,
//         toAdmin: false,
//         toUserId: p.userId,
//         body: note || `We could not verify your payment for "${p.courseSnapshot.title}". Please re-check and resend proof or contact support.`
//       });
//       await hm.save();
//       try {
//         const io = req.app && req.app.get && req.app.get('io');
//         if (io) {
//           io.to(String(p.userId)).emit('purchase:unproven', { purchaseId: p._id });
//           io.to(String(p.userId)).emit('help:new', { messageId: hm._id, body: hm.body });
//         }
//       } catch(e){/*ignore*/}

//       return res.json({ ok:true, purchase: p });
//     }
//   } catch (err) {
//     console.error('POST /purchases/:id/verify', err);
//     res.status(500).json({ ok:false, message: 'Server error' });
//   }
// });

// module.exports = router;



// backend/routes/purchases.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

const PurchaseAttempt = require('../models/PurchaseAttempt');
const Purchase = require('../models/Purchase');
const Course = require('../models/Course');
const HelpThread = require('../models/HelpThread');
const HelpMessage = require('../models/HelpMessageCourse');
const User = require('../models/User');

function toObjectIdIfPossible(id) { try { if (mongoose.Types.ObjectId.isValid(String(id||''))) return mongoose.Types.ObjectId(String(id)); } catch(e){} return id; }

// POST /purchases - create an attempt or free enrollment
router.post('/', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const courseId = body.courseId;
    if (!courseId) return res.status(400).json({ ok:false, message:'courseId required' });

    const CourseModel = require('../models/Course');
    const c = await CourseModel.findById(courseId).lean();
    if (!c) return res.status(404).json({ ok:false, message:'Course not found' });

    const attempt = new PurchaseAttempt({
      userId: toObjectIdIfPossible(req.user._id),
      courseId: toObjectIdIfPossible(courseId),
      courseSnapshot: { title: c.title, courseIdStr: c.courseId, price: c.price },
      provider: body.provider || 'Other',
      enteredPhoneNumber: body.enteredPhoneNumber || '',
      amount: Number(body.amount || c.price || 0),
      status: 'checking'
    });
    await attempt.save();

    // notify admin via socket.io
    try {
      const io = req.app.get('io');
      if (io) io.to('admins').emit('purchases:new', { attemptId: attempt._id, courseSnapshot: attempt.courseSnapshot });
    } catch (e){}

    return res.json({ ok:true, attempt });
  } catch (err) {
    console.error('POST /purchases', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

// GET /purchases - list
// admin: can pass status=checking to get checking attempts; can pass q to search id
router.get('/', auth, async (req, res) => {
  try {
    const q = req.query.q || '';
    const status = req.query.status || null;
    const role = (req.user && req.user.role || '').toLowerCase();

    if (role === 'admin') {
      const match = {};
      if (status) match.status = status;
      if (q) {
        // try to find by id or phone
        if (mongoose.Types.ObjectId.isValid(q)) match._id = mongoose.Types.ObjectId(q);
        else match.enteredPhoneNumber = q;
      }
      const items = await PurchaseAttempt.find(match).sort({ createdAt: -1 }).lean();
      return res.json({ ok:true, items });
    }

    // non-admin: return user's attempts and purchases
    const attempts = await PurchaseAttempt.find({ userId: toObjectIdIfPossible(req.user._id) }).sort({ createdAt:-1 }).lean();
    const purchases = await Purchase.find({ userId: toObjectIdIfPossible(req.user._id) }).sort({ createdAt:-1 }).lean();

    // format items so frontend can show combined list
    const items = attempts.map(a => ({ ...a, type:'attempt' })).concat(purchases.map(p => ({ ...p, type:'purchase' })));
    return res.json({ ok:true, items });
  } catch (err) {
    console.error('GET /purchases', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

// POST /purchases/:id/verify (admin) body { action: 'prove'|'unprove', note }
router.post('/:id/verify', auth, roles(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const action = (body.action || '').toLowerCase();

    const attempt = await PurchaseAttempt.findById(id);
    if (!attempt) return res.status(404).json({ ok:false, message:'Attempt not found' });

    if (action === 'prove') {
      if (attempt.status === 'verified') return res.json({ ok:true, message:'Already verified' });

      attempt.status = 'verified';
      attempt.verifiedAt = new Date();
      attempt.verifiedBy = toObjectIdIfPossible(req.user._id);
      attempt.adminNotes = body.note || '';
      await attempt.save();

      // idempotent creation of Purchase
      const existingPurchase = await Purchase.findOne({ userId: attempt.userId, courseId: attempt.courseId, status: 'verified' });
      if (!existingPurchase) {
        const purchase = new Purchase({
          userId: attempt.userId,
          courseId: attempt.courseId,
          courseSnapshot: attempt.courseSnapshot || {},
          amountPaid: attempt.amount,
          provider: attempt.provider,
          status: 'verified',
          createdAt: new Date(),
          verifiedBy: toObjectIdIfPossible(req.user._id)
        });
        await purchase.save();

        // increment course actualProvenCount
        await Course.findByIdAndUpdate(attempt.courseId, { $inc: { actualProvenCount: 1 } }).catch(()=>{});
      }

      // create or append to help thread and notify user
      const thread = await HelpThread.findOne({ userId: attempt.userId, courseId: attempt.courseId }) || new HelpThread({ userId: attempt.userId, courseId: attempt.courseId, subject: `Payment verification for ${attempt.courseSnapshot && attempt.courseSnapshot.title || ''}` });
      await thread.save();

      const adminMsg = new HelpMessage({
        threadId: thread._id,
        fromUserId: toObjectIdIfPossible(req.user._id),
        toUserId: attempt.userId,
        body: body.note || `Your payment for "${attempt.courseSnapshot && attempt.courseSnapshot.title || ''}" has been verified. You now have access.`,
        toAdmin: false,
        read: false
      });
      await adminMsg.save();
      thread.lastUpdatedAt = new Date();
      await thread.save();

      // notify user via socket
      try {
        const io = req.app.get('io');
        if (io) io.to(String(attempt.userId)).emit('purchase:verified', { attemptId: attempt._id, courseId: attempt.courseId });
      } catch (e) {}

      return res.json({ ok:true, message:'Verified' });
    }

    if (action === 'unprove') {
      attempt.status = 'unproven';
      attempt.adminNotes = body.note || '';
      attempt.verifiedAt = new Date();
      attempt.verifiedBy = toObjectIdIfPossible(req.user._id);
      await attempt.save();

      // create help message to user
      const thread = await HelpThread.findOne({ userId: attempt.userId, courseId: attempt.courseId }) || new HelpThread({ userId: attempt.userId, courseId: attempt.courseId });
      await thread.save();
      const adminMsg = new HelpMessage({
        threadId: thread._id,
        fromUserId: toObjectIdIfPossible(req.user._id),
        toUserId: attempt.userId,
        body: body.note || `We could not verify your payment for "${attempt.courseSnapshot && attempt.courseSnapshot.title || ''}". Please re-check or provide proof.`,
        toAdmin: false,
        read: false
      });
      await adminMsg.save();
      thread.lastUpdatedAt = new Date();
      await thread.save();

      try {
        const io = req.app.get('io');
        if (io) io.to(String(attempt.userId)).emit('purchase:unproven', { attemptId: attempt._id, courseId: attempt.courseId });
      } catch (e) {}

      return res.json({ ok:true, message:'Marked unproven' });
    }

    return res.status(400).json({ ok:false, message:'Invalid action' });
  } catch (err) {
    console.error('POST /purchases/:id/verify', err);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
