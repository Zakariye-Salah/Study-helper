// Simple seeding script. Run: node seed.js (after npm install)
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();
const User = require('./models/User');

async function run(){
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb');
  console.log('connected');
  const adminExists = await User.findOne({ email: 'admin@school.local' });
  if(!adminExists){
    const passwordHash = await bcrypt.hash('adminpass', 10);
    await User.create({ fullname: 'Super Admin', email: 'admin@school.local', passwordHash, role: 'admin' });
    console.log('admin created: admin@school.local / adminpass');
  } else console.log('admin exists');
  const mgrExists = await User.findOne({ email: 'manager@school.local' });
  if(!mgrExists){
    const passwordHash = await bcrypt.hash('managerpass', 10);
    await User.create({ fullname: 'School Manager', email: 'manager@school.local', passwordHash, role: 'manager' });
    console.log('manager created: manager@school.local / managerpass');
  } else console.log('manager exists');
  process.exit(0);
}

run().catch(e=>{ console.error(e); process.exit(1); });
