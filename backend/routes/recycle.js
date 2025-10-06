// // backend/routes/recycle.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');
// const auth = require('../middleware/auth');
// const roles = require('../middleware/roles');
// const path = require('path');
// const fs = require('fs');

// const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// function getModelForType(type) {
//   switch ((type || '').toLowerCase()) {
//     case 'students': return require('../models/Student');
//     case 'teachers': return require('../models/Teacher');
//     case 'parents': return require('../models/Parent');
//     case 'classes': return require('../models/Class');
//     case 'subjects': return require('../models/Subject');
//     default: return null;
//   }
// }

// function unlinkSafeSync(file) {
//   if (!file) return;
//   const fp = path.join(UPLOADS_DIR, file);
//   try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { console.warn('unlinkSafeSync', fp, e.message); }
// }

// /**
//  * Build the query for deleted items.
//  *
//  * Admin:
//  *   - sees all deleted items
//  *   - optionally filter with ?managerId=<id> (matches createdBy OR deletedBy.id)
//  *
//  * Manager:
//  *   - sees deleted items that are related to them:
//  *     - items they deleted (deletedBy.id === managerId)
//  *     - items they created (createdBy === managerId) — useful if someone else deleted their item
//  *
//  * Date filters: dateFrom, dateTo (applied on deletedAt)
//  */
// function buildDeletedQuery(req) {
//   const q = { deleted: true };
//   const dateFrom = req.query && req.query.dateFrom ? String(req.query.dateFrom).trim() : null;
//   const dateTo = req.query && req.query.dateTo ? String(req.query.dateTo).trim() : null;
//   const managerId = req.query && req.query.managerId ? String(req.query.managerId).trim() : null;

//   if (dateFrom || dateTo) {
//     q.deletedAt = {};
//     if (dateFrom) {
//       const dFrom = new Date(dateFrom);
//       if (!isNaN(dFrom.getTime())) q.deletedAt.$gte = dFrom;
//     }
//     if (dateTo) {
//       const dTo = new Date(dateTo);
//       if (!isNaN(dTo.getTime())) { dTo.setHours(23,59,59,999); q.deletedAt.$lte = dTo; }
//     }
//     if (Object.keys(q.deletedAt).length === 0) delete q.deletedAt;
//   }

//   // Manager: show items they deleted OR items they created
//   if (req.user && String(req.user.role) === 'manager') {
//     q.$or = [
//       { 'deletedBy.id': req.user._id },
//       { createdBy: req.user._id }
//     ];
//     return q;
//   }

//   // Admin: optional filter by managerId (matches createdBy OR deletedBy.id)
//   if (req.user && String(req.user.role) === 'admin' && managerId) {
//     if (!mongoose.Types.ObjectId.isValid(managerId)) {
//       throw new Error('Invalid managerId');
//     }
//     const mObj = new mongoose.Types.ObjectId(managerId);
//     q.$or = [{ createdBy: mObj }, { 'deletedBy.id': mObj }];
//   }

//   return q;
// }

// /**
//  * GET /api/recycle
//  * Query params: type, dateFrom, dateTo, managerId (admin-only), page, limit
//  */
// router.get('/', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     console.info('GET /api/recycle query:', req.query, 'user:', req.user && { id: req.user._id, role: req.user.role });

//     const type = (req.query.type || 'students').toLowerCase();
//     const Model = getModelForType(type);
//     if (!Model) return res.status(400).json({ message: 'Unknown type' });

//     const page = Math.max(1, parseInt(req.query.page || 1));
//     const limit = Math.min(5000, Math.max(10, parseInt(req.query.limit || 2000)));

//     let q;
//     try {
//       q = buildDeletedQuery(req);
//     } catch (ex) {
//       console.warn('buildDeletedQuery failed:', ex.message);
//       return res.status(400).json({ message: ex.message });
//     }

//     let query = Model.find(q).sort({ deletedAt: -1 }).skip((page-1)*limit).limit(limit);
//     if (type === 'students') query = query.populate('classId', 'name classId');
//     if (type === 'parents') query = query.populate('childStudent', 'fullname numberId');

//     query = query.lean();
//     const items = await query.exec();
//     const total = await Model.countDocuments(q);

//     return res.json({ items, total, page, limit });
//   } catch (err) {
//     console.error('GET /api/recycle error (detailed):', err && (err.stack || err.message || err));
//     return res.status(500).json({ message: 'Server error while loading recycle items', detail: err && err.message ? err.message : undefined });
//   }
// });

// /**
//  * GET /api/recycle/managers  (admin-only)
//  */
// router.get('/managers', auth, roles(['admin']), async (req, res) => {
//   try {
//     const User = require('../models/User');
//     const managers = await User.find({ role: 'manager' }).select('_id fullname email').lean();
//     res.json({ managers });
//   } catch (err) {
//     console.error('GET /api/recycle/managers error', err && (err.stack || err.message || err));
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /**
//  * POST /api/recycle/:type/:id/restore
//  * Managers can restore if they deleted the item OR they created the item.
//  */
// router.post('/:type/:id/restore', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     const { type, id } = req.params;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
//     const Model = getModelForType(type);
//     if (!Model) return res.status(400).json({ message: 'Unknown type' });

//     const doc = await Model.findById(id);
//     if (!doc || !doc.deleted) return res.status(404).json({ message: 'Not found or not deleted' });

//     if (req.user.role === 'manager') {
//       // allow if manager deleted it OR created it
//       const didDelete = doc.deletedBy && String(doc.deletedBy.id) === String(req.user._id);
//       const didCreate = doc.createdBy && String(doc.createdBy) === String(req.user._id);
//       if (!didDelete && !didCreate) return res.status(403).json({ message: 'Forbidden' });
//     }

//     doc.deleted = false;
//     doc.deletedAt = null;
//     doc.deletedBy = null;
//     await doc.save();
//     res.json({ ok: true });
//   } catch (err) {
//     console.error('POST /api/recycle/:type/:id/restore error', err && (err.stack || err.message || err));
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /**
//  * DELETE /api/recycle/:type/:id  (permanent) -- admin-only
//  */
// router.delete('/:type/:id', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admin can permanently delete' });

//     const { type, id } = req.params;
//     if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
//     const Model = getModelForType(type);
//     if (!Model) return res.status(400).json({ message: 'Unknown type' });

//     const doc = await Model.findById(id).lean();
//     if (!doc) return res.json({ ok: true });

//     // Cleanup references for classes/subjects
//     if (type === 'classes') {
//       const Student = require('../models/Student');
//       const Teacher = require('../models/Teacher');
//       try {
//         await Student.updateMany({ classId: new mongoose.Types.ObjectId(id) }, { $unset: { classId: "" }, $set: { subjectIds: [] } }).catch(()=>{});
//         await Teacher.updateMany({ classIds: new mongoose.Types.ObjectId(id) }, { $pull: { classIds: new mongoose.Types.ObjectId(id) } }).catch(()=>{});
//       } catch (e) { console.warn('Cleanup (classes) error', e && e.message); }
//     } else if (type === 'subjects') {
//       const Class = require('../models/Class');
//       const Teacher = require('../models/Teacher');
//       const Student = require('../models/Student');
//       try {
//         await Class.updateMany({ subjectIds: new mongoose.Types.ObjectId(id) }, { $pull: { subjectIds: new mongoose.Types.ObjectId(id) } }).catch(()=>{});
//         await Teacher.updateMany({ subjectIds: new mongoose.Types.ObjectId(id) }, { $pull: { subjectIds: new mongoose.Types.ObjectId(id) } }).catch(()=>{});
//         await Student.updateMany({ subjectIds: new mongoose.Types.ObjectId(id) }, { $pull: { subjectIds: new mongoose.Types.ObjectId(id) } }).catch(()=>{});
//       } catch (e) { console.warn('Cleanup (subjects) error', e && e.message); }
//     }

//     if (doc.photo) unlinkSafeSync(doc.photo);

//     await Model.findByIdAndDelete(id);

//     try {
//       const Payment = require('../models/Payment');
//       if (Payment) {
//         const personType = type.slice(0,-1);
//         await Payment.deleteMany({ personType, personId: new mongoose.Types.ObjectId(id) }).catch(()=>{});
//       }
//     } catch(e){ /* ignore */ }

//     res.json({ ok: true });
//   } catch (err) {
//     console.error('DELETE /api/recycle/:type/:id error', err && (err.stack || err.message || err));
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /**
//  * POST /api/recycle/:type/restore-all
//  */
// router.post('/:type/restore-all', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     const type = req.params.type;
//     const Model = getModelForType(type);
//     if (!Model) return res.status(400).json({ message: 'Unknown type' });

//     let q;
//     try { q = buildDeletedQuery(req); } catch (ex) { return res.status(400).json({ message: ex.message }); }

//     // Managers: the query already limits to their deleted/created items.
//     const r = await Model.updateMany(q, { $set: { deleted: false, deletedAt: null, deletedBy: null } });
//     res.json({ ok: true, restored: r.nModified || r.modifiedCount || 0 });
//   } catch (err) {
//     console.error('POST /api/recycle/:type/restore-all error', err && (err.stack || err.message || err));
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /**
//  * DELETE /api/recycle/:type/delete-all
//  * Permanently delete matching items (admin-only).
//  */
// router.delete('/:type/delete-all', auth, roles(['admin','manager']), async (req, res) => {
//   try {
//     if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admin can permanently delete all' });

//     const type = req.params.type;
//     const Model = getModelForType(type);
//     if (!Model) return res.status(400).json({ message: 'Unknown type' });

//     let q;
//     try { q = buildDeletedQuery(req); } catch (ex) { return res.status(400).json({ message: ex.message }); }

//     const docs = await Model.find(q).lean().limit(5000);

//     if (type === 'classes') {
//       const Student = require('../models/Student');
//       const Teacher = require('../models/Teacher');
//       const ids = docs.map(d => new mongoose.Types.ObjectId(d._id));
//       await Student.updateMany({ classId: { $in: ids } }, { $unset: { classId: "" }, $set: { subjectIds: [] } }).catch(()=>{});
//       await Teacher.updateMany({ classIds: { $in: ids } }, { $pull: { classIds: { $in: ids } } }).catch(()=>{});
//     } else if (type === 'subjects') {
//       const Class = require('../models/Class');
//       const Teacher = require('../models/Teacher');
//       const Student = require('../models/Student');
//       const ids = docs.map(d => new mongoose.Types.ObjectId(d._id));
//       await Class.updateMany({ subjectIds: { $in: ids } }, { $pull: { subjectIds: { $in: ids } } }).catch(()=>{});
//       await Teacher.updateMany({ subjectIds: { $in: ids } }, { $pull: { subjectIds: { $in: ids } } }).catch(()=>{});
//       await Student.updateMany({ subjectIds: { $in: ids } }, { $pull: { subjectIds: { $in: ids } } }).catch(()=>{});
//     }

//     for (const d of docs) {
//       if (d.photo) unlinkSafeSync(d.photo);
//     }
//     const r = await Model.deleteMany(q);

//     try {
//       const Payment = require('../models/Payment');
//       if (Payment) {
//         const personType = type.slice(0,-1);
//         await Payment.deleteMany({ personType }).catch(()=>{});
//       }
//     } catch(e){ /* ignore */ }

//     res.json({ ok: true, deleted: r.deletedCount || r.n || 0 });
//   } catch (err) {
//     console.error('DELETE /api/recycle/:type/delete-all error', err && (err.stack || err.message || err));
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;

// backend/routes/recycle.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function getModelForType(type) {
  switch ((type || '').toLowerCase()) {
    case 'students': return require('../models/Student');
    case 'teachers': return require('../models/Teacher');
    case 'parents': return require('../models/Parent');
    case 'classes': return require('../models/Class');
    case 'subjects': return require('../models/Subject');
    default: return null;
  }
}

function unlinkSafeSync(file) {
  if (!file) return;
  const fp = path.join(UPLOADS_DIR, file);
  try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { console.warn('unlinkSafeSync', fp, e.message); }
}

/**
 * Build the query for deleted items.
 *
 * Admin:
 *   - sees all deleted items
 *   - optionally filter with ?managerId=<id> (matches createdBy OR deletedBy.id)
 *
 * Manager:
 *   - sees deleted items that are related to them:
 *     - items they deleted (deletedBy.id === managerId)
 *     - items they created (createdBy === managerId)
 */
function buildDeletedQuery(req) {
  const q = { deleted: true };
  const dateFrom = req.query && req.query.dateFrom ? String(req.query.dateFrom).trim() : null;
  const dateTo = req.query && req.query.dateTo ? String(req.query.dateTo).trim() : null;
  const managerId = req.query && req.query.managerId ? String(req.query.managerId).trim() : null;

  if (dateFrom || dateTo) {
    q.deletedAt = {};
    if (dateFrom) {
      const dFrom = new Date(dateFrom);
      if (!isNaN(dFrom.getTime())) q.deletedAt.$gte = dFrom;
    }
    if (dateTo) {
      const dTo = new Date(dateTo);
      if (!isNaN(dTo.getTime())) { dTo.setHours(23,59,59,999); q.deletedAt.$lte = dTo; }
    }
    if (Object.keys(q.deletedAt).length === 0) delete q.deletedAt;
  }

  // Manager: show items they deleted OR items they created
  if (req.user && String(req.user.role) === 'manager') {
    q.$or = [
      { 'deletedBy.id': req.user._id },
      { createdBy: req.user._id }
    ];
    return q;
  }

  // Admin: optional filter by managerId (matches createdBy OR deletedBy.id)
  if (req.user && String(req.user.role) === 'admin' && managerId) {
    if (!mongoose.Types.ObjectId.isValid(managerId)) {
      throw new Error('Invalid managerId');
    }
    const mObj = new mongoose.Types.ObjectId(managerId);
    q.$or = [{ createdBy: mObj }, { 'deletedBy.id': mObj }];
  }

  return q;
}

/**
 * GET /api/recycle
 */
router.get('/', auth, roles(['admin','manager']), async (req, res) => {
  try {
    console.info('GET /api/recycle query:', req.query, 'user:', req.user && { id: req.user._id, role: req.user.role });

    const type = (req.query.type || 'students').toLowerCase();
    const Model = getModelForType(type);
    if (!Model) return res.status(400).json({ message: 'Unknown type' });

    const page = Math.max(1, parseInt(req.query.page || 1));
    const limit = Math.min(5000, Math.max(10, parseInt(req.query.limit || 2000)));

    let q;
    try {
      q = buildDeletedQuery(req);
    } catch (ex) {
      console.warn('buildDeletedQuery failed:', ex.message);
      return res.status(400).json({ message: ex.message });
    }

    let query = Model.find(q).sort({ deletedAt: -1 }).skip((page-1)*limit).limit(limit);
    if (type === 'students') query = query.populate('classId', 'name classId');
    if (type === 'parents') query = query.populate('childStudent', 'fullname numberId');

    query = query.lean();
    const items = await query.exec();
    const total = await Model.countDocuments(q);

    return res.json({ items, total, page, limit });
  } catch (err) {
    console.error('GET /api/recycle error (detailed):', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error while loading recycle items', detail: err && err.message ? err.message : undefined });
  }
});

/**
 * GET /api/recycle/managers  (admin-only)
 */
router.get('/managers', auth, roles(['admin']), async (req, res) => {
  try {
    const User = require('../models/User');
    const managers = await User.find({ role: 'manager' }).select('_id fullname email').lean();
    res.json({ managers });
  } catch (err) {
    console.error('GET /api/recycle/managers error', err && (err.stack || err.message || err));
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/recycle/:type/:id/restore
 * Managers can restore if they deleted the item OR they created the item.
 * For students/teachers/parents: also re-enable associated User and clear suspended.
 */
router.post('/:type/:id/restore', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
    const Model = getModelForType(type);
    if (!Model) return res.status(400).json({ message: 'Unknown type' });

    const doc = await Model.findById(id);
    if (!doc || !doc.deleted) return res.status(404).json({ message: 'Not found or not deleted' });

    if (req.user.role === 'manager') {
      // allow if manager deleted it OR created it
      const didDelete = doc.deletedBy && String(doc.deletedBy.id) === String(req.user._id);
      const didCreate = doc.createdBy && String(doc.createdBy) === String(req.user._id);
      if (!didDelete && !didCreate) return res.status(403).json({ message: 'Forbidden' });
    }

    doc.deleted = false;
    doc.deletedAt = null;
    doc.deletedBy = null;

    // also clear suspended for person types
    if (['students','teachers','parents'].includes((type || '').toLowerCase())) {
      doc.suspended = false;
      doc.suspendedAt = null;
      doc.suspendedBy = null;
    }

    await doc.save();

    // Re-enable associated user account for person types
    if (['students','teachers','parents'].includes((type || '').toLowerCase())) {
      try {
        const User = require('../models/User');
        const userId = doc.userId || doc.accountId || doc.user || null;
        if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
          await User.findByIdAndUpdate(String(userId), { $set: { disabled: false, disabledAt: null, disabledBy: null } }).catch(()=>{});
        } else if (doc.email) {
          await User.updateOne({ email: String(doc.email).toLowerCase().trim() }, { $set: { disabled: false, disabledAt: null, disabledBy: null } }).catch(()=>{});
        }
      } catch (e) {
        console.warn('restore: failed to re-enable user', e && e.message ? e.message : e);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/recycle/:type/:id/restore error', err && (err.stack || err.message || err));
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/recycle/:type/:id  (permanent) -- admin-only
 */
router.delete('/:type/:id', auth, roles(['admin','manager']), async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admin can permanently delete' });

    const { type, id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
    const Model = getModelForType(type);
    if (!Model) return res.status(400).json({ message: 'Unknown type' });

    const doc = await Model.findById(id).lean();
    if (!doc) return res.json({ ok: true });

    // Cleanup references for classes/subjects
    if (type === 'classes') {
      const Student = require('../models/Student');
      const Teacher = require('../models/Teacher');
      try {
        await Student.updateMany({ classId: new mongoose.Types.ObjectId(id) }, { $unset: { classId: "" }, $set: { subjectIds: [] } }).catch(()=>{});
        await Teacher.updateMany({ classIds: new mongoose.Types.ObjectId(id) }, { $pull: { classIds: new mongoose.Types.ObjectId(id) } }).catch(()=>{});
      } catch (e) { console.warn('Cleanup (classes) error', e && e.message); }
    } else if (type === 'subjects') {
      const Class = require('../models/Class');
      const Teacher = require('../models/Teacher');
      const Student = require('../models/Student');
      try {
        await Class.updateMany({ subjectIds: new mongoose.Types.ObjectId(id) }, { $pull: { subjectIds: new mongoose.Types.ObjectId(id) } }).catch(()=>{});
        await Teacher.updateMany({ subjectIds: new mongoose.Types.ObjectId(id) }, { $pull: { subjectIds: new mongoose.Types.ObjectId(id) } }).catch(()=>{});
        await Student.updateMany({ subjectIds: new mongoose.Types.ObjectId(id) }, { $pull: { subjectIds: new mongoose.Types.ObjectId(id) } }).catch(()=>{});
      } catch (e) { console.warn('Cleanup (subjects) error', e && e.message); }
    }

    if (doc.photo) unlinkSafeSync(doc.photo);

    await Model.findByIdAndDelete(id);

    try {
      const Payment = require('../models/Payment');
      if (Payment) {
        const personType = type.slice(0,-1);
        await Payment.deleteMany({ personType, personId: new mongoose.Types.ObjectId(id) }).catch(()=>{});
      }
    } catch(e){ /* ignore */ }

    // Optionally also delete associated User on permanent delete (CAUTION: irreversible).
    // Not doing by default - admins can decide.

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/recycle/:type/:id error', err && (err.stack || err.message || err));
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/recycle/:type/restore-all
 */
router.post('/:type/restore-all', auth, roles(['admin','manager']), async (req, res) => {
  try {
    const type = req.params.type;
    const Model = getModelForType(type);
    if (!Model) return res.status(400).json({ message: 'Unknown type' });

    let q;
    try { q = buildDeletedQuery(req); } catch (ex) { return res.status(400).json({ message: ex.message }); }

    // Update docs to restored
    const r = await Model.updateMany(q, { $set: { deleted: false, deletedAt: null, deletedBy: null, suspended: false, suspendedAt: null, suspendedBy: null } });

    // If person-type, re-enable associated Users for the restored docs
    if (['students','teachers','parents'].includes((type || '').toLowerCase())) {
      try {
        const docs = await Model.find({ deleted: { $ne: true }, ...q }).lean().limit(5000);
        const User = require('../models/User');
        for (const d of docs) {
          try {
            const userId = d.userId || d.accountId || d.user || null;
            if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
              await User.findByIdAndUpdate(String(userId), { $set: { disabled: false, disabledAt: null, disabledBy: null } }).catch(()=>{});
            } else if (d.email) {
              await User.updateOne({ email: String(d.email).toLowerCase().trim() }, { $set: { disabled: false, disabledAt: null, disabledBy: null } }).catch(()=>{});
            }
          } catch(e){ /* ignore individual failures */ }
        }
      } catch (e) {
        console.warn('restore-all: failed re-enabling some users', e && e.message ? e.message : e);
      }
    }

    res.json({ ok: true, restored: r.nModified || r.modifiedCount || 0 });
  } catch (err) {
    console.error('POST /api/recycle/:type/restore-all error', err && (err.stack || err.message || err));
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/recycle/:type/delete-all
 * Permanently delete matching items (admin-only).
 */
router.delete('/:type/delete-all', auth, roles(['admin','manager']), async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admin can permanently delete all' });

    const type = req.params.type;
    const Model = getModelForType(type);
    if (!Model) return res.status(400).json({ message: 'Unknown type' });

    let q;
    try { q = buildDeletedQuery(req); } catch (ex) { return res.status(400).json({ message: ex.message }); }

    const docs = await Model.find(q).lean().limit(5000);

    if (type === 'classes') {
      const Student = require('../models/Student');
      const Teacher = require('../models/Teacher');
      const ids = docs.map(d => new mongoose.Types.ObjectId(d._id));
      await Student.updateMany({ classId: { $in: ids } }, { $unset: { classId: "" }, $set: { subjectIds: [] } }).catch(()=>{});
      await Teacher.updateMany({ classIds: { $in: ids } }, { $pull: { classIds: { $in: ids } } }).catch(()=>{});
    } else if (type === 'subjects') {
      const Class = require('../models/Class');
      const Teacher = require('../models/Teacher');
      const Student = require('../models/Student');
      const ids = docs.map(d => new mongoose.Types.ObjectId(d._id));
      await Class.updateMany({ subjectIds: { $in: ids } }, { $pull: { subjectIds: { $in: ids } } }).catch(()=>{});
      await Teacher.updateMany({ subjectIds: { $in: ids } }, { $pull: { subjectIds: { $in: ids } } }).catch(()=>{});
      await Student.updateMany({ subjectIds: { $in: ids } }, { $pull: { subjectIds: { $in: ids } } }).catch(()=>{});
    }

    for (const d of docs) {
      if (d.photo) unlinkSafeSync(d.photo);
    }
    const r = await Model.deleteMany(q);

    try {
      const Payment = require('../models/Payment');
      if (Payment) {
        const personType = type.slice(0,-1);
        await Payment.deleteMany({ personType }).catch(()=>{});
      }
    } catch(e){ /* ignore */ }

    res.json({ ok: true, deleted: r.deletedCount || r.n || 0 });
  } catch (err) {
    console.error('DELETE /api/recycle/:type/delete-all error', err && (err.stack || err.message || err));
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
