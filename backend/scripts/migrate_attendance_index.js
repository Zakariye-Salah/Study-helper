// scripts/migrate_attendance_index.js
const mongoose = require('mongoose');
const Attendance = require('../backend/models/Attendance'); // adjust path
const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/your-db';

async function run() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    const col = mongoose.connection.collection('attendances');
    const indexes = await col.indexes();
    console.log('Existing indexes', indexes);

    // remove any index whose key exactly matches that compound key
    for (const ix of indexes) {
      if (ix.key && ix.key.classId && ix.key.date && ix.key.subjectId) {
        console.log('Dropping index', ix.name);
        await col.dropIndex(ix.name);
      }
    }

    console.log('Creating non-unique compound index...');
    await col.createIndex({ classId: 1, date: 1, subjectId: 1 }, { background: true });
    console.log('Done.');
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
}

run();
