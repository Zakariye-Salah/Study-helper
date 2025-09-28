// backend/scripts/cleanupOldMeetings.js
// Run via node backend/scripts/cleanupOldMeetings.js
const mongoose = require('mongoose');
require('dotenv').config();
const Meeting = require('../models/Meeting');
const MeetingMessage = require('../models/MeetingMessage');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb', { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected');

  // Example: remove meetings older than 90 days
  const cutoff = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000));
  const oldMeetings = await Meeting.find({ createdAt: { $lt: cutoff } }).lean();
  console.log('Old meetings count:', oldMeetings.length);
  for (const m of oldMeetings) {
    await Meeting.deleteOne({ _id: m._id });
    // delete associated messages
    await MeetingMessage.deleteMany({ meetingId: m.meetingId });
    console.log('Removed meeting', m.meetingId);
  }

  // Optionally remove messages older than X days (if not tied to meetings)
  const msgCutoff = new Date(Date.now() - (365 * 24 * 60 * 60 * 1000)); // 1 year
  const removed = await MeetingMessage.deleteMany({ ts: { $lt: msgCutoff } });
  console.log('Old messages removed count:', removed.deletedCount);

  mongoose.disconnect();
}
run().catch(err => { console.error(err); process.exit(1); });
