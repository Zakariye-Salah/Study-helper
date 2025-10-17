// backend/routes/developer.js
'use strict';

const express = require('express');
const router = express.Router();
const Developer = require('../models/Developer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto'); // <= use built-in Node uuid replacement

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'developers');
try { if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch(e){ console.warn('mkdir failed', e && e.message); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e6)}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp|gif)/i.test(file.mimetype);
    cb(null, ok);
  }
});

// Very small auth helpers - adapt to your auth system or use your existing middleware
function requireAuth(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({ ok:false, error:'Unauthorized' });
  const parts = auth.split(/\s+/);
  if(parts.length !== 2) return res.status(401).json({ ok:false, error:'Unauthorized' });
  const token = parts[1];
  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const payload = jwt.verify(token, secret);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ ok:false, error:'Invalid token' });
  }
}
function requireAdmin(req,res,next){
  if(!req.user) return res.status(401).json({ ok:false, error:'Unauthorized' });
  if(req.user.role !== 'admin') return res.status(403).json({ ok:false, error:'Forbidden' });
  next();
}

/**
 * GET /api/developers
 * query params: q, visible, page, limit
 */
router.get('/', async (req,res) => {
  try {
    // quick ping support for client auto-detection
    if (req.query._ping) return res.json({ ok: true, items: [] });

    const q = (req.query.q || '').trim();
    const visibleOnly = req.query.visible === 'true';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(1000, parseInt(req.query.limit || '100', 10));
    const skip = (page - 1) * limit;
    const filter = {};
    if(visibleOnly) filter.visible = true;
    if(q){
      const rx = new RegExp(q.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&'),'i');
      filter.$or = [
        { name: rx },
        { tagline: rx },
        { bio: rx },
        { 'contact.github': rx },
        { 'projects.title': rx },
        { 'projects.summary': rx }
      ];
    }
    const items = await Developer.find(filter).sort({ order: 1, createdAt: -1 }).skip(skip).limit(limit).lean();
    res.json({ ok:true, items });
  } catch(err){
    console.error('GET /api/developers failed', err);
    res.status(500).json({ ok:false, error: err.message || 'Server error' });
  }
});

// GET /api/developers/:id
router.get('/:id', async (req,res) => {
  try {
    const dev = await Developer.findById(req.params.id).lean();
    if(!dev) return res.status(404).json({ ok:false, error:'Not found' });
    res.json({ ok:true, developer: dev });
  } catch(err){ console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// POST /api/developers (admin)
router.post('/', requireAuth, requireAdmin, async (req,res) => {
  try {
    const body = req.body || {};
    if(!body.name) return res.status(400).json({ ok:false, error:'name required' });
    const dev = new Developer({
      name: String(body.name),
      tagline: body.tagline || '',
      bio: body.bio || '',
      contact: body.contact || {},
      skills: Array.isArray(body.skills) ? body.skills : [],
      images: Array.isArray(body.images) ? body.images : [],
      projects: Array.isArray(body.projects) ? body.projects : [],
      visible: typeof body.visible === 'boolean' ? body.visible : true,
      order: typeof body.order === 'number' ? body.order : 1000
    });
    await dev.save();
    res.json({ ok:true, developer: dev });
  } catch(err){ console.error('POST /api/developers', err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// PUT /api/developers/:id (admin)
router.put('/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const body = req.body || {};
    const update = {};
    if(body.name !== undefined) update.name = body.name;
    if(body.tagline !== undefined) update.tagline = body.tagline;
    if(body.bio !== undefined) update.bio = body.bio;
    if(body.contact !== undefined) update.contact = body.contact;
    if(body.skills !== undefined) update.skills = body.skills;
    if(body.projects !== undefined) update.projects = body.projects;
    if(body.visible !== undefined) update.visible = body.visible;
    if(body.order !== undefined) update.order = body.order;
    const dev = await Developer.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if(!dev) return res.status(404).json({ ok:false, error:'Not found' });
    res.json({ ok:true, developer: dev });
  } catch(err){ console.error('PUT /api/developers/:id', err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// DELETE /api/developers/:id (admin)
router.delete('/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const dev = await Developer.findByIdAndDelete(req.params.id);
    if(!dev) return res.status(404).json({ ok:false, error:'Not found' });
    res.json({ ok:true, deletedId: req.params.id });
  } catch(err){ console.error('DELETE /api/developers/:id', err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// POST /api/developers/:id/images (upload image) (admin)
router.post('/:id/images', requireAuth, requireAdmin, upload.single('image'), async (req,res) => {
  try {
    if(!req.file) return res.status(400).json({ ok:false, error:'No file' });
    const dev = await Developer.findById(req.params.id);
    if(!dev){
      fs.unlink(req.file.path, ()=>{});
      return res.status(404).json({ ok:false, error:'Developer not found' });
    }
    const id = (typeof randomUUID === 'function') ? randomUUID() : `${Date.now()}-${Math.round(Math.random()*1e6)}`;
    const rel = `/uploads/developers/${path.basename(req.file.path)}`;
    const img = { id, url: rel, alt: req.body.alt || '', flipAxis: req.body.flipAxis || 'rotateY', order: (dev.images.length || 0), flipIntervalSeconds: Number(req.body.flipIntervalSeconds || 5) };
    dev.images.push(img);
    await dev.save();
    res.json({ ok:true, image: img });
  } catch(err){ console.error('POST /images', err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// PUT /api/developers/:id/images/:imageId (update image meta) (admin)
router.put('/:id/images/:imageId', requireAuth, requireAdmin, async (req,res) => {
  try {
    const dev = await Developer.findById(req.params.id);
    if(!dev) return res.status(404).json({ ok:false, error:'Developer not found' });
    const img = dev.images.find(i => i.id === req.params.imageId);
    if(!img) return res.status(404).json({ ok:false, error:'Image not found' });
    if(req.body.alt !== undefined) img.alt = String(req.body.alt || '');
    if(req.body.flipAxis !== undefined) img.flipAxis = String(req.body.flipAxis || 'rotateY');
    if(req.body.order !== undefined) img.order = Number(req.body.order || 0);
    if(req.body.flipIntervalSeconds !== undefined) img.flipIntervalSeconds = Number(req.body.flipIntervalSeconds || 5);
    await dev.save();
    res.json({ ok:true, image: img });
  } catch(err){ console.error('PUT image meta', err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// DELETE /api/developers/:id/images/:imageId (admin)
router.delete('/:id/images/:imageId', requireAuth, requireAdmin, async (req,res) => {
  try {
    const dev = await Developer.findById(req.params.id);
    if(!dev) return res.status(404).json({ ok:false, error:'Developer not found' });
    const idx = dev.images.findIndex(i => i.id === req.params.imageId);
    if(idx === -1) return res.status(404).json({ ok:false, error:'Image not found' });
    const img = dev.images[idx];
    try {
      const filePath = path.join(UPLOADS_DIR, path.basename(img.url));
      if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch(e){}
    dev.images.splice(idx,1);
    await dev.save();
    res.json({ ok:true, deletedId: req.params.imageId });
  } catch(err){ console.error('DELETE image', err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

module.exports = router;
