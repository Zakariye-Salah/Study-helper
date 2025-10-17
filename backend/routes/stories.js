// backend/routes/stories.js
'use strict';

const express = require('express');
const router = express.Router();
const Story = require('../models/Story');
const Folder = require('../models/Folder');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'stories');
try { if(!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch(e){ console.warn('mkdir uploads failed', e && e.message); }

// multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e6)}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req,file,cb) => {
  const ok = /image\/(png|jpe?g|webp|gif)/i.test(file.mimetype);
  cb(null, ok);
}});

// simple auth middleware (re-use style from your other routes)
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
 * Folders API
 */

// GET /api/stories/folders?q=&visible=true
router.get('/folders', async (req,res) => {
  try {
    const q = (req.query.q || '').trim();
    const visibleOnly = req.query.visible === 'true';
    const filter = {};
    if(visibleOnly) filter.visible = true;
    if(q) filter.name = new RegExp(q.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&'), 'i');
    const items = await Folder.find(filter).sort({ order: 1, name: 1 }).lean();
    // ensure count is accurate
    const enriched = await Promise.all(items.map(async f => {
      const cnt = await Story.countDocuments({ folderId: f._id, visible: true });
      return { ...f, count: cnt };
    }));
    res.json(enriched);
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// POST create folder (admin)
router.post('/folders', requireAuth, requireAdmin, async (req,res) => {
  try {
    const name = (req.body.name || '').trim();
    if(!name) return res.status(400).json({ ok:false, error:'name required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const f = new Folder({ name, slug });
    await f.save();
    res.json({ ok:true, folder: f });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// PUT update folder (admin)
router.put('/folders/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const update = {};
    if(req.body.name !== undefined) update.name = req.body.name;
    if(req.body.visible !== undefined) update.visible = !!req.body.visible;
    const f = await Folder.findByIdAndUpdate(req.params.id, update, { new: true });
    if(!f) return res.status(404).json({ ok:false, error:'Not found' });
    res.json({ ok:true, folder: f });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// DELETE folder (admin) — disassociate stories (set folderId=null)
router.delete('/folders/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const f = await Folder.findByIdAndDelete(req.params.id);
    if(!f) return res.status(404).json({ ok:false, error:'Not found' });
    await Story.updateMany({ folderId: f._id }, { $set: { folderId: null, folderName: '' } });
    res.json({ ok:true, deletedId: req.params.id });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

/**
 * Stories list & CRUD
 */

// GET /api/stories?folderId=&q=&visible=&sort=&page=&limit=
router.get('/', async (req,res) => {
  try {
    // quick ping (client might use this)
    if(req.query._ping) return res.json({ ok:true, items: [] });

    const folderId = req.query.folderId || null;
    const q = (req.query.q || '').trim();
    const visibleOnly = req.query.visible === 'true';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, parseInt(req.query.limit || '40', 10));
    const sort = req.query.sort || 'latest'; // 'latest' or 'reacts'
    const skip = (page - 1) * limit;

    const filter = {};
    if(folderId) filter.folderId = folderId;
    if(visibleOnly) filter.visible = true;
    if(q){
      const rx = new RegExp(q.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&'), 'i');
      filter.$or = [
        { title: rx },
        { content: rx },
        { 'pages.text': rx }
      ];
    }

    // fetch with basic projection
    let itemsQuery = Story.find(filter).lean();
    if(sort === 'reacts') {
      // will fetch and then sort by computed reactions length
      itemsQuery = itemsQuery.skip(skip).limit(limit).sort({ createdAt: -1 });
      const items = await itemsQuery.exec();
      // compute reaction counts and sort client-side
      items.forEach(it => { it._reactionCount = (it.reactions || []).length || 0; });
      items.sort((a,b) => b._reactionCount - a._reactionCount || new Date(b.createdAt) - new Date(a.createdAt));
      const total = await Story.countDocuments(filter);
      res.json({ ok:true, items, total, page });
      return;
    } else {
      const items = await itemsQuery.sort({ createdAt: -1, order: 1 }).skip(skip).limit(limit).exec();
      const total = await Story.countDocuments(filter);
      res.json({ ok:true, items, total, page });
      return;
    }
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// GET single story
router.get('/:id', async (req,res) => {
  try {
    const s = await Story.findById(req.params.id).lean();
    if(!s) return res.status(404).json({ ok:false, error:'Not found' });
    res.json({ ok:true, story: s });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// POST create story (admin)
router.post('/', requireAuth, requireAdmin, async (req,res) => {
  try {
    const body = req.body || {};
    if(!body.title) return res.status(400).json({ ok:false, error:'title required' });
    const pages = Array.isArray(body.pages) ? body.pages : [];
    const content = pages.length ? '' : (body.content || '');
    const s = new Story({
      title: String(body.title),
      content,
      pages,
      image: body.image || '',
      folderId: body.folderId || null,
      folderName: body.folderName || '',
      visible: typeof body.visible === 'boolean' ? body.visible : true,
      createdBy: req.user && (req.user.uid || req.user.id || req.user._id) || null
    });
    // set denormalized folder name if given
    if(s.folderId){
      try {
        const folder = await Folder.findById(s.folderId);
        if(folder) s.folderName = folder.name;
      } catch(e){}
    }
    await s.save();
    // increment folder count
    if(s.folderId) await Folder.findByIdAndUpdate(s.folderId, { $inc: { count: 1 } }).catch(()=>{});
    res.json({ ok:true, story: s });
  } catch (err) { console.error('POST story', err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// PUT update story (admin)
router.put('/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const body = req.body || {};
    const update = {};
    if(body.title !== undefined) update.title = body.title;
    if(body.content !== undefined) update.content = body.content;
    if(body.pages !== undefined) update.pages = body.pages;
    if(body.image !== undefined) update.image = body.image;
    if(body.folderId !== undefined) {
      update.folderId = body.folderId || null;
      if(body.folderId){
        const f = await Folder.findById(body.folderId);
        update.folderName = f ? f.name : '';
      } else {
        update.folderName = '';
      }
    }
    if(body.visible !== undefined) update.visible = !!body.visible;
    const s = await Story.findByIdAndUpdate(req.params.id, update, { new: true });
    if(!s) return res.status(404).json({ ok:false, error:'Not found' });
    res.json({ ok:true, story: s });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// DELETE story (admin)
router.delete('/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const s = await Story.findByIdAndDelete(req.params.id);
    if(!s) return res.status(404).json({ ok:false, error:'Not found' });
    // decrement folder count
    if(s.folderId) await Folder.findByIdAndUpdate(s.folderId, { $inc: { count: -1 } }).catch(()=>{});
    // remove image file if exists
    try { if(s.image){ const file = path.join(UPLOADS_DIR, path.basename(s.image)); if(fs.existsSync(file)) fs.unlinkSync(file); } } catch(e){}
    res.json({ ok:true, deletedId: req.params.id });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

/**
 * Image upload for story
 */
router.post('/:id/image', requireAuth, requireAdmin, upload.single('image'), async (req,res) => {
  try {
    if(!req.file) return res.status(400).json({ ok:false, error:'No file' });
    const s = await Story.findById(req.params.id);
    if(!s) { fs.unlink(req.file.path, ()=>{}); return res.status(404).json({ ok:false, error:'Not found' }); }
    // delete old
    if(s.image){
      try { const old = path.join(UPLOADS_DIR, path.basename(s.image)); if(fs.existsSync(old)) fs.unlinkSync(old); } catch(e){}
    }
    const rel = `/uploads/stories/${path.basename(req.file.path)}`;
    s.image = rel;
    await s.save();
    res.json({ ok:true, story: s });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

/**
 * Reactions: create/update user's reaction on story
 * POST /api/stories/:id/reactions  { type: '👍' }  (requireAuth)
 * This replaces previously existing reaction by same user.
 */
router.post('/:id/reactions', requireAuth, async (req,res) => {
  try {
    const type = String(req.body.type || '').trim();
    if(!type) return res.status(400).json({ ok:false, error:'type required' });
    const s = await Story.findById(req.params.id);
    if(!s) return res.status(404).json({ ok:false, error:'Not found' });

    // remove existing reaction by this user if any
    const uid = req.user && (req.user.uid || req.user.id || req.user._id) || null;
    if(uid){
      const idx = (s.reactions || []).findIndex(r => r.userId === uid);
      if(idx >= 0) s.reactions.splice(idx,1);
    }
    // push new reaction
    s.reactions.push({ userId: uid, userName: req.user && (req.user.name || req.user.fullname || req.user.username) || '', type, createdAt: new Date() });
    await s.save();
    res.json({ ok:true, reactions: s.reactions });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// GET reactions summary
router.get('/:id/reactions', async (req,res) => {
  try {
    const s = await Story.findById(req.params.id).lean();
    if(!s) return res.status(404).json({ ok:false, error:'Not found' });
    const counts = {};
    (s.reactions || []).forEach(r => counts[r.type] = (counts[r.type]||0) + 1);
    const pairs = Object.keys(counts).map(t => ({ type: t, count: counts[t] })).sort((a,b)=>b.count - a.count);
    res.json({ ok:true, counts, pairs, total: (s.reactions || []).length });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

/**
 * Comments
 * POST /api/stories/:id/comments  { text: '...' } (requireAuth)
 * DELETE /api/stories/:id/comments/:commentId (requireAuth, owner or admin)
 */
router.post('/:id/comments', requireAuth, async (req,res) => {
  try {
    const txt = (req.body.text || '').trim();
    if(!txt) return res.status(400).json({ ok:false, error:'text required' });
    const s = await Story.findById(req.params.id);
    if(!s) return res.status(404).json({ ok:false, error:'Not found' });
    const uid = req.user && (req.user.uid || req.user.id || req.user._id) || null;
    const uname = req.user && (req.user.name || req.user.fullname || req.user.username) || '';
    const school = req.user && (req.user.school || '') || '';
    const comment = { id: randomUUID(), userId: uid, userName: uname, school, text: txt, createdAt: new Date() };
    s.comments = s.comments || [];
    s.comments.unshift(comment); // newest first
    await s.save();
    res.json({ ok:true, comment });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

// POST /api/stories/:id/comments/:commentId/reactions
// requireAuth must be applied earlier in the router (like other routes)
router.post('/:id/comments/:commentId/reactions', requireAuth, async (req, res) => {
  try {
    const type = String(req.body.type || '').trim();
    if(!type) return res.status(400).json({ ok:false, error:'type required' });

    const s = await Story.findById(req.params.id);
    if(!s) return res.status(404).json({ ok:false, error:'Not found' });

    const cid = req.params.commentId;
    const comment = (s.comments || []).find(c => String(c.id || c._id) === String(cid));
    if(!comment) return res.status(404).json({ ok:false, error:'Comment not found' });

    const uid = req.user && (req.user.uid || req.user.id || req.user._id) || null;
    // initialize reactions array on the comment if missing
    comment.reactions = comment.reactions || [];

    // remove any previous reaction by same user
    if(uid){
      const existingIdx = comment.reactions.findIndex(r => String(r.userId) === String(uid));
      if(existingIdx >= 0) comment.reactions.splice(existingIdx, 1);
    }

    // push new reaction
    comment.reactions.push({ userId: uid, userName: req.user && (req.user.name || req.user.fullname || req.user.username) || '', type, createdAt: new Date() });

    await s.save();

    // return updated comment (and optionally story summary)
    const updatedComment = (s.comments || []).find(c => String(c.id || c._id) === String(cid));
    res.json({ ok:true, comment: updatedComment, story: s });
  } catch (err) {
    console.error('POST comment reaction', err);
    res.status(500).json({ ok:false, error: err.message || 'Server error' });
  }
});

router.delete('/:id/comments/:commentId', requireAuth, async (req,res) => {
  try {
    const s = await Story.findById(req.params.id);
    if(!s) return res.status(404).json({ ok:false, error:'Not found' });
    const cid = req.params.commentId;
    const idx = (s.comments || []).findIndex(c => c.id === cid);
    if(idx === -1) return res.status(404).json({ ok:false, error:'Comment not found' });
    const comment = s.comments[idx];
    const uid = req.user && (req.user.uid || req.user.id || req.user._id) || null;
    // allow delete if admin or owner
    if(!(req.user && req.user.role === 'admin') && String(comment.userId) !== String(uid)) return res.status(403).json({ ok:false, error:'Forbidden' });
    s.comments.splice(idx,1);
    await s.save();
    res.json({ ok:true, deletedId: cid });
  } catch (err) { console.error(err); res.status(500).json({ ok:false, error: err.message || 'Server error' }); }
});

module.exports = router;
