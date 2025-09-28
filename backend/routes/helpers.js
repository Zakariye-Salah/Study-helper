// backend/routes/helpers.js
const express = require('express');
const router = express.Router();
const ClassModel = require('../models/Class');
const Student = require('../models/Student');

router.get('/classes', async (req,res) => {
  const classes = await ClassModel.find({}).lean();
  res.json({ ok:true, classes });
});

router.get('/classes/:id', async (req,res) => {
  const cls = await ClassModel.findById(req.params.id).lean();
  if (!cls) return res.status(404).json({ error: 'Not found' });
  res.json({ ok:true, class: cls });
});

router.get('/classes/:id/students', async (req,res) => {
  const students = await Student.find({ classId: req.params.id }).lean();
  res.json({ ok:true, students });
});

router.post('/students/batch', async (req,res) => {
  const ids = (req.body && req.body.ids) || [];
  const students = await Student.find({ _id: { $in: ids } }).lean();
  res.json({ ok:true, students });
});

module.exports = router;
