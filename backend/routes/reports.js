// backend/routes/reports.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const Payment = require('../models/Payment');

// payments aggregation endpoint (owner-only)
router.get('/payments', auth, roles(['admin','manager']), async (req,res)=>{
  try{
    const pipeline = [
      { $match: { createdBy: req.user._id } },
      { $group: { _id: '$relatedId', totalPaid: { $sum: '$paidAmount' }, totalAmount: { $sum: '$totalAmount' } } },
      { $project: { _id:1, totalPaid:1, totalAmount:1, balance: { $subtract: ['$totalAmount','$totalPaid'] } } },
      { $limit: 500 }
    ];
    const items = await Payment.aggregate(pipeline);
    res.json({ items });
  }catch(err){ console.error(err); res.status(500).json({ message:'Server error' }); }
});

module.exports = router;
