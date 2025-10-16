// backend/models/Developer.js
const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  id: { type: String },
  url: { type: String, required: true },
  alt: { type: String, default: '' },
  flipAxis: { type: String, enum: ['horizontal','vertical','rotateX','rotateY'], default: 'rotateY' },
  flipIntervalSeconds: { type: Number, default: 5 },
  order: { type: Number, default: 0 }
}, { _id: false });

const ProjectSchema = new mongoose.Schema({
  id: { type: String },
  title: { type: String, required: true },
  summary: { type: String },
  liveUrl: { type: String },
  repoUrl: { type: String },
  tags: [String],
  screenshots: [String]
}, { _id: false });

const SkillGroupSchema = new mongoose.Schema({
  category: { type: String },
  items: [String]
}, { _id: false });

const DeveloperSchema = new mongoose.Schema({
  name: { type: String, required: true },
  tagline: { type: String },
  bio: { type: String },
  contact: {
    email: String,
    phone: String,
    linkedin: String,
    github: String,
    website: String
  },
  skills: [SkillGroupSchema],
  images: [ImageSchema],
  projects: [ProjectSchema],
  order: { type: Number, default: 0 },
  visible: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Developer', DeveloperSchema);
