// backend/models/Developer.js
'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ImageSchema = new Schema({
  id: { type: String, required: true },
  url: { type: String, required: true },
  alt: { type: String, default: '' },
  flipAxis: { type: String, enum: ['horizontal','vertical','rotateX','rotateY'], default: 'rotateY' },
  order: { type: Number, default: 0 },
  flipIntervalSeconds: { type: Number, default: 5 }
}, { _id: false });

const ProjectSchema = new Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  liveUrl: { type: String, default: '' },
  repoUrl: { type: String, default: '' },
  tags: [String],
  screenshots: [String]
}, { _id: false });

const SkillGroupSchema = new Schema({
  category: { type: String, default: 'Other' },
  items: [String]
}, { _id: false });

const DeveloperSchema = new Schema({
  name: { type: String, required: true },
  tagline: { type: String, default: '' },
  bio: { type: String, default: '' },
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
  order: { type: Number, default: 1000 },
  visible: { type: Boolean, default: true },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
});

DeveloperSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.Developer || mongoose.model('Developer', DeveloperSchema);
