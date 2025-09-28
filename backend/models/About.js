// backend/models/About.js
const mongoose = require('mongoose');

const AboutSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null }, // optional
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String },
  vision: {
    title: { type: String, default: 'Vision' },
    text: { type: String, default: '' },
    icon: { type: String, default: '🌟' },
    color: { type: String, default: '#6b21a8' },
    order: { type: Number, default: 0 }
  },
  mission: {
    title: { type: String, default: 'Mission' },
    text: { type: String, default: '' },
    icon: { type: String, default: '🎯' },
    color: { type: String, default: '#0ea5e9' },
    order: { type: Number, default: 1 }
  },
  scores: [{
    title: String, text: String, icon: String, color: String, order: Number
  }],
  goals: [{
    title: String, text: String, icon: String, color: String, order: Number
  }],
  visible: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('About', AboutSchema);
