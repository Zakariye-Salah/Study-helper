// jobs/purgeRecycle.js
// Run this script periodically (cron) to permanently delete manager-deleted items older than 60 days.
//
// Example crontab (run daily at 03:30):
// 30 3 * * * /usr/bin/node /path/to/your/project/jobs/purgeRecycle.js >> /var/log/purgeRecycle.log 2>&1

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const MONGO = process.env.MONGO_URI || process.env.MONGO || 'mongodb://localhost:27017/mydb';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads'); // adjust if different

async function connect() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  mongoose.set('strictQuery', false);
}

function unlinkSafe(filepath) {
  return new Promise(resolve => {
    if (!filepath) return resolve(false);
    fs.unlink(filepath, (err) => {
      if (err) {
        // don't blow up if file already missing
        // console.warn('unlink failed', filepath, err.message);
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

async function cleanupForModel(Model, opts = {}) {
  if (!Model) return { deleted: 0 };

  const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000); // 60 days ago
  const q = {
    deleted: true,
    deletedAt: { $lt: cutoff },
    'deletedBy.role': 'manager'
  };

  // limit to those matching school or createdBy if opts provides it — optional
  // find docs to attempt file cleanup
  const docs = await Model.find(q).lean().limit(2000).exec();
  if (!docs || docs.length === 0) return { deleted: 0 };

  const ids = docs.map(d => d._id);

  // If documents have photo fields, attempt to remove files
  for (const d of docs) {
    if (d.photo) {
      const fp = path.join(UPLOADS_DIR, d.photo);
      try { await unlinkSafe(fp); } catch (e) {/* ignore */ }
    }
    // teachers may have multiple photo fields etc - adjust as necessary
    // if you store other file paths, delete them similarly here
  }

  // Permanently remove documents
  const res = await Model.deleteMany({ _id: { $in: ids } }).exec();
  return { deleted: res.deletedCount || res.n || 0 };
}

async function main() {
  console.log(new Date().toISOString(), 'purgeRecycle script starting...');
  try {
    await connect();
    console.log('Connected to MongoDB');

    // Try to require known models; if they don't exist, skip them
    let Student, Teacher, Payment;
    try { Student = require('../models/Student'); } catch (e) { Student = null; console.warn('Student model not found'); }
    try { Teacher = require('../models/Teacher'); } catch (e) { Teacher = null; console.warn('Teacher model not found'); }
    try { Payment = require('../models/Payment'); } catch (e) { Payment = null; console.warn('Payment model not found'); }

    // Clean students
    let totalDeleted = 0;
    if (Student) {
      const r = await cleanupForModel(Student);
      console.log('Students permanently deleted:', r.deleted);
      totalDeleted += (r.deleted || 0);

      // also attempt to delete payments for deleted students older than cutoff
      if (Payment) {
        try {
          // Build list of personIds that we removed is already used above; but simpler: delete payments older than cutoff created for personType student whose personId no longer exists
          // To avoid scanning entire payments collection, do this optionally or skip for performance.
          // Example: remove payments with personType student where personId not in Student collection (cleanup orphan payments).
          // (Careful in large DBs — can be expensive)
          // const orphanClean = await Payment.deleteMany({ personType: 'student', createdAt: { $lt: cutoff } });
          // console.log('Old student payments removed (approx):', orphanClean.deletedCount || 0);
        } catch (e) { console.warn('Payment cleanup error', e && e.message); }
      }
    }

    // Clean teachers
    if (Teacher) {
      const r2 = await cleanupForModel(Teacher);
      console.log('Teachers permanently deleted:', r2.deleted);
      totalDeleted += (r2.deleted || 0);
      // Payment cleanup for teachers optional
    }

    console.log('Purge completed. Total items permanently deleted:', totalDeleted);
  } catch (err) {
    console.error('purgeRecycle failed', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); } catch (e) {}
    console.log('Disconnected, exiting.');
  }
}

main();
