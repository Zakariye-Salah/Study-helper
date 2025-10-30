'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const MediaSchema = new Schema({
  type: { type: String, enum: ['video','audio','image','file','external'], default: 'video' },
  url: { type: String, required: true },
  title: { type: String, default: '' }
}, { _id: false });

const LessonSchema = new Schema({
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true, index: true },
  duration: { type: String, default: '' },
  preview: { type: Boolean, default: false },
  mediaUrl: { type: String, default: '' }, // legacy single-url convenience
  media: { type: [MediaSchema], default: [] },
  notes: { type: String, default: '' },
  exercises: { type: [Schema.Types.Mixed], default: [] },
  deleted: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

// convenience: ensure mediaUrl is in sync with media[0] when present
LessonSchema.pre('save', function(next){
  if ((!this.mediaUrl || this.mediaUrl === '') && Array.isArray(this.media) && this.media.length) {
    this.mediaUrl = this.media[0].url || this.mediaUrl;
  }
  next();
});

module.exports = mongoose.models.Lesson || mongoose.model('Lesson', LessonSchema);
