// backend/routes/notifications.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth'); // your auth middleware
const Notification = require('../models/Notification');
const User = require('../models/User');

// helper: isAdmin
function isAdmin(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'admin' || role === 'manager';
}

/**
 * GET /api/notifications?limit=50
 * returns notifications visible to current user (simple policy)
 */
router.get('/', auth, async (req, res) => {
  try {
    const me = req.user;
    const limit = Math.min(200, Number(req.query.limit || 50));
    // simple visibility: recipients 'all' always visible. 'students' -> role student; 'managers' -> role manager/admin.
    const role = (me.role || '').toLowerCase();
    // build filter
    const or = [{ recipients: 'all' }, { recipients: role }];

    // if recipients == 'school' and schoolId provided, include those equal to user's schoolId
    if (me.schoolId) or.push({ recipients: 'school', schoolId: mongoose.Types.ObjectId(me.schoolId) });

    const q = { deleted: { $ne: true }, $or: or };

    const rows = await Notification.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('GET /notifications error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /api/notifications/counts
 */
router.get('/counts', auth, async (req, res) => {
  try {
    const me = req.user;
    const role = (me.role || '').toLowerCase();
    const or = [{ recipients: 'all' }, { recipients: role }];
    if (me.schoolId) or.push({ recipients: 'school', schoolId: mongoose.Types.ObjectId(me.schoolId) });
    const q = { deleted: { $ne: true }, $or: or };
    const rows = await Notification.find(q).select('_id readBy').lean();
    // unread = those where readBy doesn't include me._id
    const unread = rows.reduce((acc, n) => {
      const read = (n.readBy || []).some(x => String(x) === String(me._id));
      return acc + (read ? 0 : 1);
    }, 0);
    return res.json({ ok: true, unread, total: rows.length });
  } catch (err) {
    console.error('GET /notifications/counts error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/notifications
 * Admin only: create a notification
 * Body: { title, body, recipients: 'all'|'students'|'managers'|'school', schoolId?, type?, meta? }
 */
router.post('/', auth, async (req, res) => {
  try {
    const me = req.user;
    if (!isAdmin(me)) return res.status(403).json({ ok: false, message: 'Admin required' });
    const body = req.body || {};
    if (!body.title || !String(body.title).trim()) return res.status(400).json({ ok: false, message: 'Title required' });
    const doc = new Notification({
      title: String(body.title).trim(),
      body: body.body || '',
      recipients: body.recipients || 'all',
      schoolId: body.schoolId || null,
      type: body.type || 'general',
      meta: body.meta || {},
      createdBy: me._id
    });
    await doc.save();

    // emit socket event to connected clients
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('notification:new', { _id: doc._id, title: doc.title, body: doc.body, type: doc.type, createdAt: doc.createdAt });
      }
    } catch (e) { console.warn('notify emit failed', e); }

    return res.json({ ok: true, message: 'Notification created', data: doc });
  } catch (err) {
    console.error('POST /notifications error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/notifications/:id/read
 * mark current user as having read this notification
 */
router.post('/:id/read', auth, async (req, res) => {
  try {
    const me = req.user;
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const n = await Notification.findById(String(id)).catch(()=>null);
    if (!n) return res.status(404).json({ ok: false, message: 'Notification not found' });
    const uid = mongoose.Types.ObjectId(String(me._id));
    // avoid duplicates
    if (!n.readBy || !n.readBy.some(x => String(x) === String(uid))) {
      n.readBy = n.readBy || [];
      n.readBy.push(uid);
      await n.save();
      // emit update to sockets
      try {
        const io = req.app.get('io');
        if (io) io.emit('notification:update', { id: n._id, action: 'read', userId: me._id });
      } catch (e) { /* ignore */ }
    }
    return res.json({ ok: true, message: 'Marked read' });
  } catch (err) {
    console.error('POST /notifications/:id/read error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * POST /api/notifications/mark-all-read  (marks all visible notifications for current user as read)
 */
router.post('/mark-all-read', auth, async (req, res) => {
  try {
    const me = req.user;
    const role = (me.role || '').toLowerCase();
    const or = [{ recipients: 'all' }, { recipients: role }];
    if (me.schoolId) or.push({ recipients: 'school', schoolId: mongoose.Types.ObjectId(me.schoolId) });
    const q = { deleted: { $ne: true }, $or: or };
    const rows = await Notification.find(q).limit(1000).exec();
    const uid = mongoose.Types.ObjectId(String(me._id));
    for (const n of rows) {
      if (!n.readBy || !n.readBy.some(x => String(x) === String(uid))) {
        n.readBy = n.readBy || [];
        n.readBy.push(uid);
        await n.save();
      }
    }
    return res.json({ ok: true, message: 'All marked read' });
  } catch (err) {
    console.error('POST /notifications/mark-all-read error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * PUT /api/notifications/:id  (admin edit)
 * DELETE /api/notifications/:id  (admin soft-delete)
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const me = req.user;
    if (!isAdmin(me)) return res.status(403).json({ ok: false, message: 'Admin required' });
    const id = req.params.id;
    const body = req.body || {};
    const n = await Notification.findById(String(id)).catch(()=>null);
    if (!n) return res.status(404).json({ ok: false, message: 'Not found' });
    if (body.title) n.title = String(body.title);
    if (body.body) n.body = body.body;
    if (body.recipients) n.recipients = body.recipients;
    if (typeof body.schoolId !== 'undefined') n.schoolId = body.schoolId || null;
    await n.save();
    return res.json({ ok: true, message: 'Updated', data: n });
  } catch (err) {
    console.error('PUT /notifications/:id', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const me = req.user;
    if (!isAdmin(me)) return res.status(403).json({ ok: false, message: 'Admin required' });
    const id = req.params.id;
    const n = await Notification.findById(String(id)).catch(()=>null);
    if (!n) return res.status(404).json({ ok: false, message: 'Not found' });
    n.deleted = true;
    await n.save();
    return res.json({ ok: true, message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /notifications/:id', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
