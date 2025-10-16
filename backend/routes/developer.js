// backend/routes/developer.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Developer = require('../models/Developer');

const router = express.Router();

// Upload folder for developer images (ensure uploads/developers exists)
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'developers');
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_ROOT),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = Date.now() + '-' + Math.random().toString(36).slice(2,8);
    cb(null, base + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// requireAdmin: adapt to your auth middleware. Here we check req.user.role === 'admin'.
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  // For quick testing without auth you can pass header x-admin-demo:1 (NOT for production)
  if (req.get('x-admin-demo') === '1') return next();
  return res.status(403).json({ error: 'admin required' });
}

/* Validation */
function validateDeveloperPayload(body) {
  const errors = [];
  if (!body.name || String(body.name).trim().length < 2) errors.push('name required');
  if (body.contact && body.contact.email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(body.contact.email)) errors.push('invalid email');
  }
  return errors;
}

/* GET /api/developers */
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const visible = req.query.visible === 'true';
    const filter = {};
    if (visible) filter.visible = true;
    if (q) {
      // simple text search across name, tagline, bio, projects.title, skills items
      const re = new RegExp(q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
      filter.$or = [
        { name: re },
        { tagline: re },
        { bio: re },
        { 'projects.title': re },
        { 'skills.items': re }
      ];
    }
    const items = await Developer.find(filter).sort({ order: 1, name: 1 }).lean().exec();
    res.json({ items });
  } catch (e) {
    console.error('GET /developers error', e);
    res.status(500).json({ error: 'server error' });
  }
});

/* GET single */
router.get('/:id', async (req, res) => {
  try {
    const dev = await Developer.findById(req.params.id).lean().exec();
    if (!dev) return res.status(404).json({ error: 'not found' });
    res.json({ developer: dev });
  } catch (e) {
    console.error('GET /developers/:id', e);
    res.status(500).json({ error: 'server error' });
  }
});

/* POST create */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateDeveloperPayload(body);
    if (errors.length) return res.status(400).json({ error: 'validation', details: errors });
    const dev = new Developer({
      name: body.name,
      tagline: body.tagline || '',
      bio: body.bio || '',
      contact: body.contact || {},
      skills: Array.isArray(body.skills) ? body.skills : [],
      projects: Array.isArray(body.projects) ? body.projects : [],
      images: Array.isArray(body.images) ? body.images : [],
      order: typeof body.order === 'number' ? body.order : 0,
      visible: typeof body.visible === 'boolean' ? body.visible : true
    });
    await dev.save();
    res.status(201).json({ developer: dev });
  } catch (e) {
    console.error('POST /developers', e);
    res.status(500).json({ error: 'server error' });
  }
});

/* PUT update */
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateDeveloperPayload(body);
    if (errors.length) return res.status(400).json({ error: 'validation', details: errors });
    const dev = await Developer.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: 'not found' });
    dev.name = body.name || dev.name;
    dev.tagline = body.tagline || dev.tagline;
    dev.bio = body.bio || dev.bio;
    dev.contact = body.contact || dev.contact;
    dev.skills = Array.isArray(body.skills) ? body.skills : dev.skills;
    dev.projects = Array.isArray(body.projects) ? body.projects : dev.projects;
    dev.images = Array.isArray(body.images) ? body.images : dev.images;
    if (typeof body.order === 'number') dev.order = body.order;
    if (typeof body.visible === 'boolean') dev.visible = body.visible;
    await dev.save();
    res.json({ developer: dev });
  } catch (e) {
    console.error('PUT /developers/:id', e);
    res.status(500).json({ error: 'server error' });
  }
});

/* DELETE developer */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const dev = await Developer.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: 'not found' });

    // delete local uploaded images (best-effort)
    (dev.images || []).forEach(img => {
      if (img.url && img.url.startsWith('/uploads/')) {
        const filepath = path.join(__dirname, '..', img.url.replace(/^\//, ''));
        try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch(e){ /* ignore */ }
      }
    });

    await dev.remove();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /developers/:id', e);
    res.status(500).json({ error: 'server error' });
  }
});

/* POST images upload */
router.post('/:id/images', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const dev = await Developer.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: 'not found' });
    if (!req.file) return res.status(400).json({ error: 'no file' });

    const img = {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2,6),
      url: '/uploads/developers/' + req.file.filename,
      alt: req.body.alt || '',
      flipAxis: req.body.flipAxis || 'rotateY',
      flipIntervalSeconds: Number(req.body.flipIntervalSeconds || 5),
      order: dev.images.length
    };
    dev.images.push(img);
    await dev.save();
    res.status(201).json({ image: img });
  } catch (e) {
    console.error('POST /developers/:id/images', e);
    res.status(500).json({ error: 'server error' });
  }
});

/* PUT image meta */
router.put('/:id/images/:imageId', requireAdmin, async (req, res) => {
  try {
    const dev = await Developer.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: 'not found' });
    const img = dev.images.id ? dev.images.find(i => String(i.id) === String(req.params.imageId)) : dev.images.find(i => String(i.id) === String(req.params.imageId));
    if (!img) return res.status(404).json({ error: 'image not found' });
    if (req.body.alt !== undefined) img.alt = req.body.alt;
    if (req.body.flipAxis) img.flipAxis = req.body.flipAxis;
    if (req.body.flipIntervalSeconds) img.flipIntervalSeconds = Number(req.body.flipIntervalSeconds);
    if (req.body.order !== undefined) img.order = Number(req.body.order);
    await dev.save();
    res.json({ image: img });
  } catch (e) {
    console.error('PUT /developers/:id/images/:imageId', e);
    res.status(500).json({ error: 'server error' });
  }
});

/* DELETE image */
router.delete('/:id/images/:imageId', requireAdmin, async (req,res) => {
  try {
    const dev = await Developer.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: 'not found' });
    const idx = dev.images.findIndex(i => String(i.id) === String(req.params.imageId));
    if (idx === -1) return res.status(404).json({ error: 'image not found' });
    const removed = dev.images.splice(idx, 1)[0];
    // delete file if local
    if (removed && removed.url && removed.url.startsWith('/uploads/')) {
      const filepath = path.join(__dirname, '..', removed.url.replace(/^\//, ''));
      try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch(e){ /* ignore */ }
    }
    await dev.save();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE image error', e);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
