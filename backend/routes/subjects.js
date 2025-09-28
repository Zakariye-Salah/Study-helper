// backend/routes/subjects.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const Subject = require('../models/Subject');

// helper to generate subjectId like SUBDDMMn
async function generateSubjectId(schoolId) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `SUB${dd}${mm}`;
  const last = await Subject.findOne({ schoolId, subjectId: new RegExp(`^${prefix}`) }).sort({ createdAt: -1 }).lean();
  if (!last || !last.subjectId) return `${prefix}1`;
  const tail = last.subjectId.replace(prefix, '');
  const seq = Number(tail) || 0;
  return `${prefix}${seq + 1}`;
}

// Create subject (owner set). If subjectId omitted -> auto generate.
router.post('/', auth, roles(['admin','manager']), async (req,res)=>{
  try{
    const { name } = req.body;
    let { subjectId } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });

    // if no subjectId provided, generate one per school
    if (!subjectId || !String(subjectId).trim()) {
      subjectId = await generateSubjectId(req.user.schoolId);
    } else {
      subjectId = String(subjectId).trim();
    }

    // ensure unique for this creator/school
    const qExist = { subjectId, schoolId: req.user.schoolId };
    const existing = await Subject.findOne(qExist);
    if(existing) return res.status(400).json({ message: 'subjectId exists for this school' });

    const s = new Subject({ name, subjectId, schoolId: req.user.schoolId, createdBy: req.user._id });
    await s.save();
    res.json(s);
  }catch(err){
    console.error('POST /subjects error', err);
    res.status(500).json({ message: 'Server error', err: err.message });
  }
});

// List subjects
router.get('/', auth, roles(['admin','manager','teacher','student']), async (req,res)=>{
  try{
    const { search = '', page = 1, limit = 50 } = req.query;
    const q = {};
    if(search) q.$or = [{ name: new RegExp(search,'i') }, { subjectId: new RegExp(search,'i') }];

    // visibility:
    // - students/teachers: see school-level subjects
    // - admin/manager: only their created subjects (you requested isolation between managers)
    if (['student','teacher'].includes(req.user.role)) {
      q.schoolId = req.user.schoolId;
    } else {
      q.createdBy = req.user._id;
    }

    const items = await Subject.find(q).limit(parseInt(limit)).skip((page-1)*limit).sort({ createdAt:-1 }).lean();
    const total = await Subject.countDocuments(q);
    res.json({ items, total });
  }catch(err){
    console.error('GET /subjects error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update (owner-only)
router.put('/:id', auth, roles(['admin','manager']), async (req,res)=>{ 
  try{
    const id = req.params.id;
    const doc = await Subject.findById(id);
    if(!doc) return res.status(404).json({ message:'Not found' });
    if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message:'Forbidden' });

    // if subjectId provided, ensure uniqueness within the same school
    if (req.body.subjectId && String(req.body.subjectId).trim() !== doc.subjectId) {
      const exists = await Subject.findOne({ subjectId: String(req.body.subjectId).trim(), schoolId: req.user.schoolId });
      if (exists) return res.status(400).json({ message: 'subjectId already exists for this school' });
    }

    const s = await Subject.findByIdAndUpdate(id, req.body, { new:true });
    res.json(s);
  }catch(err){
    console.error('PUT /subjects/:id error', err);
    res.status(500).json({ message: 'Server error' });
  }  
});

// Delete (owner-only)
router.delete('/:id', auth, roles(['admin','manager']), async (req,res)=>{ 
  try{
    const id = req.params.id;
    const doc = await Subject.findById(id);
    if(!doc) return res.json({ ok:true });
    if (String(doc.createdBy) !== String(req.user._id)) return res.status(403).json({ message:'Forbidden' });
    await Subject.findByIdAndDelete(id);
    res.json({ ok:true });
  }catch(err){
    console.error('DELETE /subjects/:id error', err);
    res.status(500).json({ message: 'Server error' });
  }  
});

module.exports = router;
