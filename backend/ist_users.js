// list_users.js
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function run(){
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb';
  await mongoose.connect(uri, { useNewUrlParser:true, useUnifiedTopology:true });
  const users = await User.find().select('fullname email role createdAt').lean();
  console.log('Users in DB:');
  users.forEach(u => console.log(u));
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
