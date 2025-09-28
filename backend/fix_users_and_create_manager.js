// fix_users_and_create_manager.js
// Usage: node fix_users_and_create_manager.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function run(){
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb';
  console.log('Connecting to', uri);
  await mongoose.connect(uri, { useNewUrlParser:true, useUnifiedTopology:true });
  const db = mongoose.connection.db;

  try {
    // 1) try to drop the username index if it exists
    const indexes = await db.collection('users').indexes();
    console.log('Indexes on users:', indexes.map(ix => ix.name));
    if (indexes.some(ix => ix.name === 'username_1')) {
      console.log('Dropping index username_1 ...');
      await db.collection('users').dropIndex('username_1');
      console.log('Dropped username_1 index.');
    } else {
      console.log('username_1 index not present — skipping drop.');
    }
  } catch (err) {
    console.warn('Index drop/check error (non-fatal):', err.message);
  }

  try {
    // 2) Remove problematic docs: those with username: null OR missing email or email null
    const delRes = await db.collection('users').deleteMany({
      $or: [
        { username: null },
        { email: { $exists: false } },
        { email: null }
      ]
    });
    console.log('Deleted documents count (problematic users):', delRes.deletedCount);
  } catch (err) {
    console.error('Error deleting broken users:', err);
  }

  // 3) Ensure manager user exists
  const User = require('./models/User');
  const mgr = await User.findOne({ email: 'manager@school.local' });
  if (mgr) {
    console.log('Manager already exists:', { email: mgr.email, role: mgr.role, id: mgr._id });
  } else {
    const passwordHash = await bcrypt.hash('managerpass', 10);
    const created = await User.create({ fullname: 'School Manager', email: 'manager@school.local', passwordHash, role: 'manager' });
    console.log('Manager created: manager@school.local / managerpass. id:', created._id);
  }

  await mongoose.disconnect();
  console.log('Done. Restart your backend (nodemon will auto-reload if running).');
}

run().catch(e => { console.error('Fatal error:', e); process.exit(1); });
