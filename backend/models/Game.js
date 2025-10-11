// // backend/models/Game.js
const mongoose = require('mongoose');

const OptionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true }
}, { _id: false });

const MathTypeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  classLevel: [{ type: String }],
  createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  published: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
MathTypeSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });

const QuestionSchema = new mongoose.Schema({
  mathTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'MathType', required: true, index: true },
  text: { type: String, required: true },
  options: { type: [OptionSchema], default: null },
  answer: { type: mongoose.Schema.Types.Mixed, required: true },
  canonicalAnswer: { type: String, default: null },
  isMultipleChoice: { type: Boolean, default: false },
  difficulty: { type: String, enum: ['easy','intermediate','hard','extra_hard','no_way'], default: 'easy' },
  timeLimitSeconds: { type: Number, default: null },
  strictAnswer: { type: Boolean, default: false },
  classLevel: [{ type: String }],
  createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  published: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
QuestionSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });

const GameQuestionEntrySchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  text: { type: String, required: true },
  options: { type: [OptionSchema], default: null },
  isMultipleChoice: { type: Boolean, default: false },
  timeLimitSeconds: { type: Number, default: null },
  userAnswer: { type: mongoose.Schema.Types.Mixed, default: null },
  correct: { type: Boolean, default: false },
  timeTakenSeconds: { type: Number, default: null },
  canonicalAnswer: { type: String, default: null }
}, { _id: false });

const GameAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mathTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'MathType', required: true, index: true },
  questions: { type: [GameQuestionEntrySchema], default: [] },
  runningScore: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: null },
  completed: { type: Boolean, default: false },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
  classLevel: { type: String, default: null },
  // snapshot
  userName: { type: String, default: '' },
  userNumberId: { type: String, default: '' },
  // store selected difficulty for the entire attempt (so leaderboards per-level can be produced)
  selectedDifficulty: { type: String, enum: ['all','easy','intermediate','hard','extra_hard','no_way'], default: 'all' },
  // manager/created-by snapshot (school/manager's fullname)
  managerCreatedBy: { type: String, default: '' },
  schoolName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const LeaderboardEntrySchema = new mongoose.Schema({
  mathTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'MathType', required: true, index: true },
  difficulty: { type: String, enum: ['all','easy','intermediate','hard','extra_hard','no_way'], default: 'all', index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String },
  userNumberId: { type: String, default: '' },
  managerCreatedBy: { type: String, default: '' },
  schoolName: { type: String, default: '' },
  highestScore: { type: Number, default: 0 },
  lastPlayedAt: { type: Date, default: Date.now }
});

LeaderboardEntrySchema.index({ mathTypeId: 1, difficulty: 1, schoolId: 1, highestScore: -1 });

module.exports = {
  MathType: mongoose.models.MathType || mongoose.model('MathType', MathTypeSchema),
  Question: mongoose.models.Question || mongoose.model('Question', QuestionSchema),
  GameAttempt: mongoose.models.GameAttempt || mongoose.model('GameAttempt', GameAttemptSchema),
  LeaderboardEntry: mongoose.models.LeaderboardEntry || mongoose.model('LeaderboardEntry', LeaderboardEntrySchema)
};

// backend/models/Game.js
// const mongoose = require('mongoose');

// const OptionSchema = new mongoose.Schema({
//   id: { type: String, required: true },
//   text: { type: String, required: true }
// }, { _id: false });

// const MathTypeSchema = new mongoose.Schema({
//   title: { type: String, required: true },
//   slug: { type: String, required: true, unique: true },
//   description: { type: String, default: '' },
//   classLevel: [{ type: String }],
//   createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
//   published: { type: Boolean, default: true },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// });
// MathTypeSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });

// const QuestionSchema = new mongoose.Schema({
//   mathTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'MathType', required: true, index: true },
//   text: { type: String, required: true },
//   options: { type: [OptionSchema], default: null },
//   answer: { type: mongoose.Schema.Types.Mixed, required: true },
//   canonicalAnswer: { type: String, default: null },
//   isMultipleChoice: { type: Boolean, default: false },
//   difficulty: { type: String, enum: ['easy','intermediate','hard','extra_hard','no_way'], default: 'easy' },
//   timeLimitSeconds: { type: Number, default: null },
//   strictAnswer: { type: Boolean, default: false },
//   classLevel: [{ type: String }],
//   createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
//   published: { type: Boolean, default: true },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// });
// QuestionSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });

// const GameQuestionEntrySchema = new mongoose.Schema({
//   questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
//   text: { type: String, required: true },
//   options: { type: [OptionSchema], default: null },
//   isMultipleChoice: { type: Boolean, default: false },
//   timeLimitSeconds: { type: Number, default: null },
//   userAnswer: { type: mongoose.Schema.Types.Mixed, default: null },
//   correct: { type: Boolean, default: false },
//   timeTakenSeconds: { type: Number, default: null },
//   canonicalAnswer: { type: String, default: null }
// }, { _id: false });

// const GameAttemptSchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
//   mathTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'MathType', required: true, index: true },
//   questions: { type: [GameQuestionEntrySchema], default: [] },
//   runningScore: { type: Number, default: 0 },
//   score: { type: Number, default: 0 },
//   startedAt: { type: Date, default: Date.now },
//   endedAt: { type: Date, default: null },
//   durationSeconds: { type: Number, default: null },
//   completed: { type: Boolean, default: false },
//   schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
//   classLevel: { type: String, default: null },
//   // snapshot
//   userName: { type: String, default: '' },
//   userNumberId: { type: String, default: '' },
//   // store selected difficulty for the entire attempt (so leaderboards per-level can be produced)
//   selectedDifficulty: { type: String, enum: ['all','easy','intermediate','hard','extra_hard','no_way'], default: 'all' },
//   // manager/created-by snapshot (school/manager's fullname)
//   managerCreatedBy: { type: String, default: '' },
//   schoolName: { type: String, default: '' },
//   createdAt: { type: Date, default: Date.now }
// });

// const LeaderboardEntrySchema = new mongoose.Schema({
//   mathTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'MathType', required: true, index: true },
//   difficulty: { type: String, enum: ['all','easy','intermediate','hard','extra_hard','no_way'], default: 'all', index: true },
//   schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null, index: true },
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   userName: { type: String },
//   userNumberId: { type: String, default: '' },
//   managerCreatedBy: { type: String, default: '' },
//   schoolName: { type: String, default: '' },
//   highestScore: { type: Number, default: 0 },
//   lastPlayedAt: { type: Date, default: Date.now }
// });

// LeaderboardEntrySchema.index({ mathTypeId: 1, difficulty: 1, schoolId: 1, highestScore: -1 });
// /* -------------------------
//    Competition models
//    ------------------------- */
//    const CompetitionResultSchema = new mongoose.Schema({
//     competitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
//     userName: { type: String, default: '' },
//     userNumberId: { type: String, default: '' },
//     managerCreatedBy: { type: String, default: '' },
//     schoolName: { type: String, default: '' },
//     delta: { type: Number, required: true }, // positive or negative points
//     reason: { type: String, default: '' },
//     attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameAttempt', default: null },
//     createdAt: { type: Date, default: Date.now }
//   }, { collection: 'competition_results' });
  


// const CompetitionSchema = new mongoose.Schema({
//   title: { type: String, required: true },
//   description: { type: String, default: '' },
//   startAt: { type: Date, required: true },
//   endAt: { type: Date, required: true },
//   active: { type: Boolean, default: false },
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// }, { collection: 'competitions' });
// CompetitionSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });

// // indexes for performance
// CompetitionResultSchema.index({ competitionId: 1, userId: 1 });
// CompetitionSchema.index({ active: 1, endAt: 1 });




// module.exports = {
//   MathType: mongoose.models.MathType || mongoose.model('MathType', MathTypeSchema),
//   Question: mongoose.models.Question || mongoose.model('Question', QuestionSchema),
//   GameAttempt: mongoose.models.GameAttempt || mongoose.model('GameAttempt', GameAttemptSchema),
//   LeaderboardEntry: mongoose.models.LeaderboardEntry || mongoose.model('LeaderboardEntry', LeaderboardEntrySchema),
//   Competition: mongoose.models.Competition || mongoose.model('Competition', CompetitionSchema),
//   CompetitionResult: mongoose.models.CompetitionResult || mongoose.model('CompetitionResult', CompetitionResultSchema)
// };

