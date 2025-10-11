// backend/routes/games.js
// @ts-nocheck
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const auth = require('../middleware/auth'); // expects req.user
const roles = require('../middleware/roles');

let MathType, Question, GameAttempt, LeaderboardEntry;
try {
  const models = require('../models/Game');
  MathType = models.MathType;
  Question = models.Question;
  GameAttempt = models.GameAttempt;
  LeaderboardEntry = models.LeaderboardEntry;
} catch (e) {
  console.warn('Could not require ../models/Game - make sure it exists and exports MathType, Question, GameAttempt, LeaderboardEntry.');
}

// Student & User models (used to snapshot numberId & manager fullname)
let Student = null;
let User = null;
try { Student = require('../models/Student'); } catch (e) { Student = null; console.warn('Student model not found at ../models/Student'); }
try { User = require('../models/User'); } catch (e) { User = null; console.warn('User model not found at ../models/User'); }

// If Lesson model isn't present anywhere, create one here (lightweight)
let Lesson = null;
try {
  Lesson = mongoose.model('Lesson');
} catch (e) {
  const LessonSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subtitle: { type: String },
    content: { type: String },
    // examples are stored as simple strings
    examples: { type: [String], default: [] },
    // folder for grouping lessons
    folder: { type: String, default: 'Uncategorized' },
    // tests: array of simple quiz items used by frontend lesson-test modal
    tests: { type: [{ question: String, options: { type: [String], default: [] }, correctIndex: { type: Number, default: 0 } }], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }, { collection: 'lessons' });
  LessonSchema.pre('save', function (next) { this.updatedAt = new Date(); next(); });
  Lesson = mongoose.model('Lesson', LessonSchema);
}

const DEFAULT_TIME_BY_DIFF = {
  easy: 20,
  intermediate: 15,
  hard: 10,
  extra_hard: 5,
  no_way: 2
};

const DEBUG = process.env.NODE_ENV !== 'production';

function numericEqual(a, b, epsilon = 0.001) {
  if (a === null || b === null || typeof a === 'undefined' || typeof b === 'undefined') return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) <= epsilon;
}

function normalizeFractionAnswer(a) {
  if (typeof a !== 'string') return null;
  const s = a.trim();
  const slash = s.indexOf('/');
  if (slash >= 0) {
    const p = s.split('/');
    const n = Number(p[0]);
    const d = Number(p[1]);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return String(n / d);
  }
  if (!isNaN(Number(s))) return String(Number(s));
  return s.toLowerCase();
}

function safeObjId(s) {
  if (!s) return null;
  try {
    const str = String(s);
    if (mongoose.Types.ObjectId.isValid(str)) return new mongoose.Types.ObjectId(str);
  } catch (e) {
    return null;
  }
  return null;
}

async function safeHandler(fn, req, res) {
  try {
    if (DEBUG) {
      console.info('[math-game] request', {
        path: req.originalUrl,
        method: req.method,
        user: req.user && req.user._id ? String(req.user._id) : null,
        body: req.body || null,
        query: req.query || null
      });
    }
    await fn(req, res);
  } catch (err) {
    console.error('[math-game] handler error', err && (err.stack || err));
    const msg = (err && err.message) ? err.message : 'Server error';
    if (DEBUG) {
      return res.status(500).json({ ok: false, message: msg, stack: err && err.stack ? String(err.stack).slice(0, 2000) : undefined });
    }
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

/**
 * GET /types
 */
router.get('/types', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!MathType) return res2.status(500).json({ ok: false, message: 'MathType model not available' });
    const items = await MathType.find({}).sort({ title: 1 }).lean();
    return res2.json({ ok: true, mathTypes: items });
  }, req, res);
});

/**
 * POST /start
 * body { mathTypeId, difficulty, questionCount }
 *
 * NOTE: Fixed behaviour — when a difficulty is requested we strictly sample
 * only questions with that difficulty. If there are fewer questions than the
 * requested count we return the available ones (no fallback to other difficulties),
 * so that time limits won't accidentally include e.g. `no_way` items when player
 * asked for `easy`.
 */
router.post('/start', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!req2.user || !req2.user._id) return res2.status(401).json({ ok: false, message: 'Auth required' });
    if (!MathType || !Question || !GameAttempt) return res2.status(500).json({ ok: false, message: 'Game models not available' });

    const { mathTypeId, difficulty, questionCount = 10 } = req2.body || {};
    if (!mathTypeId) return res2.status(400).json({ ok: false, message: 'mathTypeId required' });
    if (!mongoose.Types.ObjectId.isValid(String(mathTypeId))) return res2.status(400).json({ ok: false, message: 'Invalid mathTypeId' });

    const type = await MathType.findById(String(mathTypeId)).lean();
    if (!type) return res2.status(404).json({ ok: false, message: 'MathType not found' });

    const desiredRaw = (difficulty || 'all').toLowerCase();
    const desired = desiredRaw;

    let qMatch = { mathTypeId: type._id, published: true };
    if (desired !== 'all') qMatch.difficulty = desired;

    const want = Math.max(1, Math.min(200, Number(questionCount || 10)));
    let found = [];

    // Strict sampling for requested difficulty:
    try {
      // Use aggregation $match + $sample for efficiency, fallback to find if aggregate fails
      found = await Question.aggregate([{ $match: qMatch }, { $sample: { size: want } }]);
      if (DEBUG) console.debug('[math-game:start] aggregate sample found count', (found || []).length);
    } catch (eAgg) {
      // fallback simple shuffle of matching docs
      const all = await Question.find(qMatch).lean();
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      found = all.slice(0, want);
      if (DEBUG) console.debug('[math-game:start] fallback find found count', (found || []).length);
    }

    // IMPORTANT: do not expand to other difficulties here. If found < want, return what we have.
    if (!found || !found.length) {
      if (DEBUG) console.warn('[math-game:start] no questions for type/difficulty', { mathTypeId: String(type._id), difficulty: desired, want });
      return res2.status(400).json({ ok: false, message: 'No questions available for this MathType and difficulty' });
    }

    const finalQuestions = found.slice(0, want);

    if (DEBUG) {
      try {
        const ids = finalQuestions.map(q => String(q._id)).slice(0, 12);
        console.debug('[math-game:start] finalQuestions count', finalQuestions.length, 'sample ids', ids);
      } catch (e) { /* ignore debug error */ }
    }

    const questionsForAttempt = finalQuestions.map(q => {
      const timeLimit = (typeof q.timeLimitSeconds === 'number' && Number.isFinite(q.timeLimitSeconds) && q.timeLimitSeconds > 0)
        ? q.timeLimitSeconds
        : (DEFAULT_TIME_BY_DIFF[String(q.difficulty) || 'easy'] || 10);
      return {
        questionId: q._id,
        text: q.text,
        options: q.isMultipleChoice ? (q.options || []).map(o => ({ id: o.id, text: o.text })) : null,
        isMultipleChoice: !!q.isMultipleChoice,
        timeLimitSeconds: timeLimit,
        difficulty: q.difficulty || 'easy'
      };
    });

    // snapshot student numberId and manager's name if possible
    let userName = (req2.user && (req2.user.fullname || req2.user.name)) || '';
    let userNumberId = (req2.user && (req2.user.numberId || req2.user.childNumberId)) || '';
    let schoolId = safeObjId(req2.user.schoolId) || null;
    let managerCreatedBy = (req2.user && (req2.user.managerFullname || req2.user.createdByName || req2.user.schoolName || req2.user.school)) || '';
    let schoolName = (req2.user && (req2.user.schoolName || req2.user.school)) || '';

    try {
      if (Student) {
        const studentDoc = await Student.findOne({ _id: req2.user._id }).lean().catch(() => null);
        if (studentDoc) {
          if (studentDoc.numberId) userNumberId = studentDoc.numberId;
          if (studentDoc.schoolId) schoolId = safeObjId(studentDoc.schoolId) || schoolId;
          if (studentDoc.schoolName) schoolName = studentDoc.schoolName;
          if (studentDoc.createdBy) {
            try {
              if (User) {
                const mgr = await User.findById(studentDoc.createdBy).lean().catch(() => null);
                if (mgr && (mgr.fullname || mgr.name)) managerCreatedBy = mgr.fullname || mgr.name || managerCreatedBy;
              } else {
                if (typeof studentDoc.createdBy === 'object' && (studentDoc.createdBy.fullname || studentDoc.createdBy.name)) {
                  managerCreatedBy = studentDoc.createdBy.fullname || studentDoc.createdBy.name || managerCreatedBy;
                }
              }
            } catch (e2) { /* ignore */ }
          }
        }
      }
    } catch (eX) {
      if (DEBUG) console.warn('student lookup failed while starting attempt', eX && eX.stack ? eX.stack : eX);
    }

    const attempt = new GameAttempt({
      userId: new mongoose.Types.ObjectId(String(req2.user._id)),
      mathTypeId: type._id,
      questions: questionsForAttempt,
      runningScore: 0,
      score: 0,
      startedAt: new Date(),
      schoolId: schoolId,
      classLevel: (req2.user.classLevel || null),
      userName,
      userNumberId,
      selectedDifficulty: desired || 'all',
      managerCreatedBy: managerCreatedBy || '',
      schoolName: schoolName || ''
    });

    await attempt.save();

    const payloadQuestions = attempt.questions.map(q => ({
      questionId: q.questionId,
      text: q.text,
      options: q.options || null,
      isMultipleChoice: q.isMultipleChoice,
      timeLimitSeconds: q.timeLimitSeconds,
      difficulty: q.difficulty || 'easy'
    }));

    if (DEBUG) console.info('[math-game:start] attempt created', { attemptId: String(attempt._id), questions: payloadQuestions.length, selectedDifficulty: desired });

    return res2.json({ ok: true, gameAttemptId: attempt._id, questions: payloadQuestions, runningScore: attempt.runningScore });
  }, req, res);
});

/**
 * POST /attempt/:gameAttemptId/answer
 */
router.post('/attempt/:gameAttemptId/answer', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!req2.user || !req2.user._id) return res2.status(401).json({ ok: false, message: 'Auth required' });
    if (!Question || !GameAttempt) return res2.status(500).json({ ok: false, message: 'Game models not available' });

    const gameAttemptId = req2.params.gameAttemptId;
    if (!mongoose.Types.ObjectId.isValid(String(gameAttemptId))) return res2.status(400).json({ ok: false, message: 'Invalid gameAttemptId' });

    const { questionId, userAnswer, timeTakenSeconds } = req2.body || {};
    if (!questionId) return res2.status(400).json({ ok: false, message: 'questionId required' });

    const attempt = await GameAttempt.findById(String(gameAttemptId));
    if (!attempt) return res2.status(404).json({ ok: false, message: 'Attempt not found' });
    if (String(attempt.userId) !== String(req2.user._id)) return res2.status(403).json({ ok: false, message: 'Forbidden' });
    if (attempt.completed) return res2.status(400).json({ ok: false, message: 'Attempt already completed' });

    const qEntry = attempt.questions.find(q => String(q.questionId) === String(questionId));
    if (!qEntry) return res2.status(400).json({ ok: false, message: 'Question not in attempt' });

    if (typeof qEntry.userAnswer !== 'undefined' && qEntry.userAnswer !== null) {
      return res2.json({
        ok: true,
        message: 'Already answered',
        correct: !!qEntry.correct,
        correctAnswer: qEntry.canonicalAnswer || null,
        runningScore: attempt.runningScore,
        nextQuestionId: attempt.questions.find(q => !q.userAnswer) ? String(attempt.questions.find(q => !q.userAnswer).questionId) : null
      });
    }

    const questionDoc = await Question.findById(String(questionId)).lean().catch(() => null);
    if (!questionDoc) {
      qEntry.userAnswer = userAnswer;
      qEntry.timeTakenSeconds = Number(timeTakenSeconds || 0);
      qEntry.correct = false;
      qEntry.canonicalAnswer = null;
      attempt.runningScore = Math.max(0, (attempt.runningScore || 0) - 1);
      await attempt.save();
      if (DEBUG) console.warn('[math-game:answer] question doc not found, marking wrong', { gameAttemptId, questionId });
      return res2.json({ ok: true, correct: false, correctAnswer: null, runningScore: attempt.runningScore, nextQuestionId: attempt.questions.find(q => !q.userAnswer) ? String(attempt.questions.find(q => !q.userAnswer).questionId) : null });
    }

    const grace = 2;
    const qTimeLimit = Number(questionDoc.timeLimitSeconds || DEFAULT_TIME_BY_DIFF[questionDoc.difficulty] || 10);
    const allowedMax = qTimeLimit + grace;
    const taken = Number(timeTakenSeconds || 0);
    const timedOut = (taken > allowedMax);

    if (DEBUG) console.debug('[math-game:answer] timing', { questionId, timeTakenSeconds: taken, qTimeLimit, allowedMax, timedOut });

    let correct = false;
    let canonical = (questionDoc.canonicalAnswer || questionDoc.answer);

    if (questionDoc.isMultipleChoice) {
      if (String(userAnswer) && String(userAnswer) === String(questionDoc.answer)) correct = true;
    } else {
      if (!questionDoc.strictAnswer) {
        const numQ = Number(questionDoc.answer);
        if (Number.isFinite(numQ) && numericEqual(userAnswer, numQ, Number(process.env.MATHGAME_EPSILON || 0.001))) {
          correct = true;
        } else {
          const normUser = normalizeFractionAnswer(String(userAnswer || ''));
          const normQ = normalizeFractionAnswer(String(questionDoc.answer || ''));
          if (normUser !== null && normQ !== null && normUser === normQ) correct = true;
        }
      } else {
        if (String(userAnswer).trim() === String(questionDoc.answer).trim()) correct = true;
      }
    }

    if (timedOut) {
      correct = false;
      if (DEBUG) console.info('[math-game:answer] answer considered timed out -> marked incorrect', { gameAttemptId, questionId, taken, allowedMax });
    }

    qEntry.userAnswer = userAnswer;
    qEntry.timeTakenSeconds = taken;
    qEntry.correct = !!correct;
    qEntry.canonicalAnswer = canonical !== undefined ? String(canonical) : null;

    const prev = attempt.runningScore || 0;
    attempt.runningScore = correct ? prev + 1 : Math.max(0, prev - 1);

    await attempt.save();

    if (DEBUG) console.debug('[math-game:answer] result', { gameAttemptId, questionId, correct, runningScore: attempt.runningScore });

    const nextQ = attempt.questions.find(q => !q.userAnswer);
    return res2.json({
      ok: true,
      correct: !!correct,
      correctAnswer: qEntry.canonicalAnswer || null,
      runningScore: attempt.runningScore,
      nextQuestionId: nextQ ? String(nextQ.questionId) : null
    });
  }, req, res);
});

/**
 * POST /complete
 */
router.post('/complete', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!req2.user || !req2.user._id) return res2.status(401).json({ ok: false, message: 'Auth required' });
    if (!GameAttempt || !LeaderboardEntry) return res2.status(500).json({ ok: false, message: 'Game models not available' });

    const { gameAttemptId } = req2.body || {};
    if (!gameAttemptId || !mongoose.Types.ObjectId.isValid(String(gameAttemptId))) return res2.status(400).json({ ok: false, message: 'gameAttemptId required' });

    const attempt = await GameAttempt.findById(String(gameAttemptId));
    if (!attempt) return res2.status(404).json({ ok: false, message: 'Attempt not found' });
    if (String(attempt.userId) !== String(req2.user._id)) return res2.status(403).json({ ok: false, message: 'Forbidden' });
    if (attempt.completed) return res2.status(400).json({ ok: false, message: 'Attempt already completed' });

    attempt.score = Math.max(0, attempt.runningScore || 0);
    attempt.completed = true;
    attempt.endedAt = new Date();
    attempt.durationSeconds = Math.floor((attempt.endedAt - attempt.startedAt) / 1000);

    await attempt.save();

    const TOP_N = Math.min(100, Number(req2.query.limit || process.env.MATHGAME_LEADERBOARD_SIZE || 5));
    const schoolId = attempt.schoolId || null;
    const mathTypeId = attempt.mathTypeId;
    const userId = attempt.userId;
    const difficulty = attempt.selectedDifficulty || 'all';
    const userName = attempt.userName || ((req2.user && (req2.user.fullname || req2.user.name)) || '');
    const userNumberId = attempt.userNumberId || ((req2.user && (req2.user.numberId || req2.user.childNumberId)) || '');
    const managerCreatedBy = attempt.managerCreatedBy || '';
    const schoolName = attempt.schoolName || '';

    const cond = { mathTypeId, difficulty: difficulty || 'all', schoolId: schoolId, userId };

    try {
      const existing = await LeaderboardEntry.findOne(cond).catch(() => null);
      if (existing) {
        // keep the highest score (don't overwrite with lower)
        existing.highestScore = Math.max(Number(existing.highestScore || 0), Number(attempt.score || 0));
        existing.lastPlayedAt = new Date();
        existing.userName = userName || existing.userName;
        existing.userNumberId = userNumberId || existing.userNumberId;
        existing.managerCreatedBy = managerCreatedBy || existing.managerCreatedBy;
        existing.schoolName = schoolName || existing.schoolName;
        await existing.save();
      } else {
        const le = new LeaderboardEntry({
          mathTypeId,
          difficulty: difficulty || 'all',
          schoolId,
          userId,
          userName,
          userNumberId,
          managerCreatedBy,
          schoolName,
          highestScore: attempt.score,
          lastPlayedAt: new Date()
        });
        await le.save();
      }
    } catch (e) {
      console.error('Failed to update leaderboard entry', e && e.stack ? e.stack : e);
    }

    // fetch top entries for this mathType/difficulty/school (if mathType provided)
    const top = await LeaderboardEntry.find({ mathTypeId, difficulty: difficulty || 'all', schoolId }).sort({ highestScore: -1, lastPlayedAt: 1 }).limit(TOP_N).lean();

    if (DEBUG) console.info('[math-game:complete] attempt completed', { gameAttemptId, finalScore: attempt.score });

    return res2.json({ ok: true, finalScore: attempt.score, leaderboardTop5: top });
  }, req, res);
});

/**
 * GET /history
 *
 * IMPORTANT: Group by both mathTypeId and selectedDifficulty so attempts for the
 * same math type but different levels are treated as different "recent games".
 */
router.get('/history', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!req2.user || !req2.user._id) return res2.status(401).json({ ok: false, message: 'Auth required' });
    if (!GameAttempt) return res2.status(500).json({ ok: false, message: 'GameAttempt model not available' });

    const limit = Math.min(100, Math.max(1, parseInt(req2.query.limit || '50', 10)));

    // Group key includes selectedDifficulty so different levels do not replace each other
    const agg = await GameAttempt.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(String(req2.user._id)) } },
      { $sort: { startedAt: -1, endedAt: -1 } },
      { $group: {
        _id: { mathTypeId: '$mathTypeId', difficulty: { $ifNull: ['$selectedDifficulty', 'all'] } },
        attemptId: { $first: '$_id' },
        mathTypeId: { $first: '$mathTypeId' },
        selectedDifficulty: { $first: { $ifNull: ['$selectedDifficulty', 'all'] } },
        score: { $first: '$score' },
        completed: { $first: '$completed' },
        startedAt: { $first: '$startedAt' },
        endedAt: { $first: '$endedAt' },
        userName: { $first: '$userName' },
        userNumberId: { $first: '$userNumberId' }
      }},
      { $sort: { startedAt: -1 } },
      { $limit: limit }
    ]).catch((e) => {
      if (DEBUG) console.error('[math-game:history] aggregate error', e && e.stack ? e.stack : e);
      return [];
    });

    const mathTypeIds = (agg || []).map(x => x.mathTypeId).filter(Boolean);
    let titlesMap = {};
    if (mathTypeIds.length && MathType) {
      const mtypes = await MathType.find({ _id: { $in: mathTypeIds } }).lean().catch(() => []);
      (mtypes || []).forEach(m => { titlesMap[String(m._id)] = m.title; });
    }

    const items = (agg || []).map(a => ({
      _id: a.attemptId,
      mathTypeId: a.mathTypeId,
      title: titlesMap[String(a.mathTypeId)] || '',
      score: a.score || 0,
      completed: a.completed || false,
      startedAt: a.startedAt || null,
      endedAt: a.endedAt || null,
      userName: a.userName || '',
      userNumberId: a.userNumberId || '',
      selectedDifficulty: a.selectedDifficulty || 'all' // include the difficulty so front-end doesn't need to fetch attempt details
    }));

    return res2.json({ ok: true, items });
  }, req, res);
});

/**
 * GET /attempt/:id
 */
router.get('/attempt/:id', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    const id = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res2.status(400).json({ ok: false, message: 'Invalid id' });
    if (!GameAttempt) return res2.status(500).json({ ok: false, message: 'GameAttempt model not available' });

    const att = await GameAttempt.findById(id).lean();
    if (!att) return res2.status(404).json({ ok: false, message: 'Attempt not found' });
    const rUser = req2.user || {};
    if (String(att.userId) !== String(rUser._id) && (rUser.role || '').toLowerCase() !== 'admin' && (rUser.role || '').toLowerCase() !== 'manager' && (rUser.role || '').toLowerCase() !== 'teacher') {
      return res2.status(403).json({ ok: false, message: 'Forbidden' });
    }
    return res2.json({ ok: true, attempt: att });
  }, req, res);
});

/**
 * GET /leaderboard
 */
router.get('/leaderboard', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    const mathTypeId = req2.query.mathTypeId || null;
    const difficulty = (req2.query.difficulty && req2.query.difficulty.length) ? req2.query.difficulty : null;
    const qSchoolRaw = (typeof req2.query.schoolId !== 'undefined') ? req2.query.schoolId : (req2.user && req2.user.schoolId ? String(req2.user.schoolId) : null);
    const period = req2.query.period || 'all';
    const topN = Math.min(100, Number(req2.query.limit || process.env.MATHGAME_LEADERBOARD_SIZE || 10));

    if (mathTypeId) {
      if (!LeaderboardEntry) return res2.status(500).json({ ok: false, message: 'LeaderboardEntry model not available' });
      if (!mongoose.Types.ObjectId.isValid(String(mathTypeId))) return res2.status(400).json({ ok: false, message: 'Invalid mathTypeId' });
      const q = { mathTypeId: new mongoose.Types.ObjectId(String(mathTypeId)) };
      if (difficulty) q.difficulty = difficulty;
      if (qSchoolRaw && mongoose.Types.ObjectId.isValid(String(qSchoolRaw))) q.schoolId = new mongoose.Types.ObjectId(String(qSchoolRaw));
      if (period === '7d') q.lastPlayedAt = { $gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) };
      else if (period === '30d') q.lastPlayedAt = { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) };
      const top = await LeaderboardEntry.find(q).sort({ highestScore: -1, lastPlayedAt: 1 }).limit(topN).lean();
      return res2.json({ ok: true, leaderboard: top });
    } else {
      if (!GameAttempt) return res2.status(500).json({ ok: false, message: 'GameAttempt model not available' });

      // Aggregate so that for each user+mathType we take the **max** score,
      // then sum those maxima per user to produce a correct total across math types.
      const match = { completed: true };
      if (qSchoolRaw && mongoose.Types.ObjectId.isValid(String(qSchoolRaw))) match.schoolId = new mongoose.Types.ObjectId(String(qSchoolRaw));
      if (period === '7d') match.endedAt = { $gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) };
      else if (period === '30d') match.endedAt = { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) };

      const agg = await GameAttempt.aggregate([
        { $match: match },
        // First, for each user + mathType, find the **maximum** score (best attempt for that math type)
        { $group: {
          _id: { userId: '$userId', mathTypeId: '$mathTypeId' },
          maxScore: { $max: '$score' },
          lastSeenAt: { $max: '$endedAt' },
          userName: { $first: '$userName' },
          userNumberId: { $first: '$userNumberId' },
          managerCreatedBy: { $first: '$managerCreatedBy' },
          schoolName: { $first: '$schoolName' }
        }},
        // Then sum these maxima per user to get totalScore
        { $group: {
          _id: '$_id.userId',
          totalScore: { $sum: '$maxScore' },
          lastSeenAt: { $max: '$lastSeenAt' },
          userName: { $first: '$userName' },
          userNumberId: { $first: '$userNumberId' },
          managerCreatedBy: { $first: '$managerCreatedBy' },
          schoolName: { $first: '$schoolName' }
        }},
        { $sort: { totalScore: -1, lastSeenAt: 1 } },
        { $limit: topN }
      ]).catch((e) => { console.error('leaderboard aggregate error', e && e.stack ? e.stack : e); return []; });

      const out = (agg || []).map(a => ({
        userId: a._id,
        userName: a.userName || '',
        userNumberId: a.userNumberId || '',
        managerCreatedBy: a.managerCreatedBy || '',
        schoolName: a.schoolName || '',
        totalScore: a.totalScore || 0,
        lastSeenAt: a.lastSeenAt || new Date()
      }));
      return res2.json({ ok: true, leaderboard: out });
    }
  }, req, res);
});

/**
 * GET /summary
 */
router.get('/summary', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    const userId = req2.user && req2.user._id;
    if (!userId) return res2.status(401).json({ ok: false, message: 'Auth required' });
    if (!GameAttempt || !MathType) return res2.status(500).json({ ok: false, message: 'GameAttempt/MathType models not available' });

    const agg = await GameAttempt.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(String(userId)), completed: true } },
      { $group: {
        _id: null,
        totalScore: { $sum: '$score' },
        count: { $sum: 1 }
      }}
    ]).catch(() => []);

    const totalScore = (agg && agg[0] && agg[0].totalScore) ? agg[0].totalScore : 0;
    const completedAttempts = (agg && agg[0] && agg[0].count) ? agg[0].count : 0;

    const byType = await GameAttempt.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(String(userId)), completed: true } },
      { $group: { _id: '$mathTypeId', score: { $sum: '$score' }, attempts: { $sum: 1 } } },
      { $sort: { score: -1 } }
    ]).limit(50).catch(() => []);

    const mathTypeIds = byType.map(b => b._id).filter(Boolean).map(String);
    const mtypes = await MathType.find({ _id: { $in: mathTypeIds } }).lean().catch(() => []);
    const titles = {};
    (mtypes || []).forEach(mt => { titles[String(mt._id)] = mt.title; });

    const breakdown = (byType || []).map(b => ({ mathTypeId: b._id, title: titles[String(b._id)] || '', score: b.score, attempts: b.attempts }));

    return res2.json({ ok: true, totalScore, completedAttempts, breakdown });
  }, req, res);
});

/* Admin routes for types/questions */

/**
 * POST /types
 * admin create
 */
router.post('/types', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!MathType) return res2.status(500).json({ ok: false, message: 'MathType model not available' });
    const { title, slug, description, classLevel = [] } = req2.body || {};
    if (!title || !slug) return res2.status(400).json({ ok: false, message: 'title and slug required' });
    const exist = await MathType.findOne({ slug }).lean();
    if (exist) return res2.status(400).json({ ok: false, message: 'slug already exists' });
    const mt = new MathType({ title, slug, description, classLevel, createdByAdminId: req2.user._id });
    await mt.save();
    if (DEBUG) console.info('[math-game:types:create] created', { id: String(mt._id), title: mt.title });
    return res2.json({ ok: true, mathType: mt });
  }, req, res);
});

/**
 * PUT /types/:id
 * Edit math type (admin only)
 */
router.put('/types/:id', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!MathType) return res2.status(500).json({ ok: false, message: 'MathType model not available' });
    const id = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res2.status(400).json({ ok: false, message: 'Invalid id' });
    const { title, slug, description, classLevel } = req2.body || {};
    const existing = await MathType.findById(String(id));
    if (!existing) return res2.status(404).json({ ok: false, message: 'MathType not found' });
    if (slug && slug !== existing.slug) {
      const dup = await MathType.findOne({ slug }).lean();
      if (dup) return res2.status(400).json({ ok: false, message: 'slug already exists' });
    }
    existing.title = typeof title !== 'undefined' ? title : existing.title;
    existing.slug = typeof slug !== 'undefined' ? slug : existing.slug;
    existing.description = typeof description !== 'undefined' ? description : existing.description;
    existing.classLevel = Array.isArray(classLevel) ? classLevel : existing.classLevel;
    await existing.save();
    if (DEBUG) console.info('[math-game:types:update] updated', { id: String(existing._id) });
    return res2.json({ ok: true, mathType: existing });
  }, req, res);
});

/**
 * DELETE /types/:id
 * Delete a math type (admin only)
 */
router.delete('/types/:id', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!MathType) return res2.status(500).json({ ok: false, message: 'MathType model not available' });
    const id = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res2.status(400).json({ ok: false, message: 'Invalid id' });
    const existing = await MathType.findById(String(id));
    if (!existing) return res2.status(404).json({ ok: false, message: 'MathType not found' });
    await MathType.deleteOne({ _id: existing._id });
    if (DEBUG) console.info('[math-game:types:delete] deleted', { id: String(existing._id) });
    // NOTE: we intentionally do not cascade-delete questions here; you can add that if desired.
    return res2.json({ ok: true, message: 'Deleted' });
  }, req, res);
});

/**
 * POST /questions
 * admin create
 */
router.post('/questions', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Question) return res2.status(500).json({ ok: false, message: 'Question model not available' });
    const { mathTypeId, text, options, answer, isMultipleChoice, difficulty, timeLimitSeconds, classLevel } = req2.body || {};
    if (!mathTypeId || !mongoose.Types.ObjectId.isValid(String(mathTypeId))) return res2.status(400).json({ ok: false, message: 'mathTypeId required' });
    if (!text || (typeof answer === 'undefined')) return res2.status(400).json({ ok: false, message: 'text and answer required' });
    const q = new Question({
      mathTypeId,
      text,
      options: options || null,
      answer,
      isMultipleChoice: !!isMultipleChoice,
      difficulty: difficulty || 'easy',
      timeLimitSeconds: (typeof timeLimitSeconds === 'number' && timeLimitSeconds > 0) ? timeLimitSeconds : null,
      classLevel: classLevel || [],
      createdByAdminId: req2.user._id
    });
    await q.save();
    if (DEBUG) console.info('[math-game:questions:create] created', { id: String(q._id), mathTypeId });
    return res2.json({ ok: true, question: q });
  }, req, res);
});

/**
 * GET /questions
 * Query params:
 *   mathTypeId (required)
 *   difficulty (optional) - if provided returns questions only with that difficulty
 *
 * Note: non-admin users will not receive `answer` or `canonicalAnswer` in response.
 */
router.get('/questions', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Question) return res2.status(500).json({ ok: false, message: 'Question model not available' });
    const { mathTypeId, difficulty } = req2.query || {};
    if (!mathTypeId || !mongoose.Types.ObjectId.isValid(String(mathTypeId))) return res2.status(400).json({ ok: false, message: 'mathTypeId required' });

    const q = { mathTypeId: new mongoose.Types.ObjectId(String(mathTypeId)), published: true };
    if (difficulty && String(difficulty).length) q.difficulty = String(difficulty);

    const docs = await Question.find(q).sort({ createdAt: -1 }).lean().catch(() => []);
    // sanitize answers for non-admins
    const isAdminUser = ((req2.user && (req2.user.role || '')).toLowerCase() === 'admin');
    const out = (docs || []).map(d => {
      const copy = Object.assign({}, d);
      // timeLimit fallback to default for safety in response
      copy.timeLimitSeconds = (typeof copy.timeLimitSeconds === 'number' && copy.timeLimitSeconds > 0)
        ? copy.timeLimitSeconds
        : (DEFAULT_TIME_BY_DIFF[String(copy.difficulty) || 'easy'] || 10);
      if (!isAdminUser) {
        delete copy.answer;
        delete copy.canonicalAnswer;
      }
      return copy;
    });
    if (DEBUG) console.info('[math-game:questions:list] returning', { mathTypeId, difficulty, count: out.length });
    return res2.json({ ok: true, questions: out });
  }, req, res);
});

/**
 * PUT /questions/:id
 * Admin edit question
 */
router.put('/questions/:id', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Question) return res2.status(500).json({ ok: false, message: 'Question model not available' });
    const id = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res2.status(400).json({ ok: false, message: 'Invalid id' });

    const { text, options, answer, isMultipleChoice, difficulty, timeLimitSeconds, canonicalAnswer, strictAnswer, published, classLevel } = req2.body || {};

    const doc = await Question.findById(String(id));
    if (!doc) return res2.status(404).json({ ok: false, message: 'Question not found' });

    if (typeof text !== 'undefined') doc.text = text;
    if (typeof options !== 'undefined') doc.options = Array.isArray(options) ? options : (options ? [options] : null);
    if (typeof answer !== 'undefined') doc.answer = answer;
    if (typeof canonicalAnswer !== 'undefined') doc.canonicalAnswer = canonicalAnswer;
    if (typeof isMultipleChoice !== 'undefined') doc.isMultipleChoice = !!isMultipleChoice;
    if (typeof difficulty !== 'undefined') doc.difficulty = difficulty;
    if (typeof timeLimitSeconds !== 'undefined') doc.timeLimitSeconds = (Number(timeLimitSeconds) || null);
    if (typeof strictAnswer !== 'undefined') doc.strictAnswer = !!strictAnswer;
    if (typeof published !== 'undefined') doc.published = !!published;
    if (typeof classLevel !== 'undefined') doc.classLevel = Array.isArray(classLevel) ? classLevel : (classLevel ? [classLevel] : []);

    await doc.save();

    if (DEBUG) console.info('[math-game:questions:update] updated', { id: String(doc._id) });
    return res2.json({ ok: true, question: doc });
  }, req, res);
});

/**
 * DELETE /questions/:id
 * Admin delete question
 */
router.delete('/questions/:id', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Question) return res2.status(500).json({ ok: false, message: 'Question model not available' });
    const id = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res2.status(400).json({ ok: false, message: 'Invalid id' });
    const doc = await Question.findById(String(id));
    if (!doc) return res2.status(404).json({ ok: false, message: 'Question not found' });
    await Question.deleteOne({ _id: doc._id });
    if (DEBUG) console.info('[math-game:questions:delete] deleted', { id: String(doc._id) });
    return res2.json({ ok: true, message: 'Deleted' });
  }, req, res);
});

/* Lessons endpoints (updated) */

/**
 * GET /lessons
 * Authenticated users can view lessons (persisted)
 */
router.get('/lessons', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    const items = await Lesson.find({}).sort({ createdAt: -1 }).lean();

    // normalize examples and tests for safe frontend consumption
    const out = (items || []).map(it => {
      const copy = Object.assign({}, it);

      // normalize examples -> array of strings
      if (Array.isArray(copy.examples)) {
        copy.examples = copy.examples.map(e => {
          if (typeof e === 'string') return e;
          if (e && typeof e.text === 'string') return e.text;
          try { return String(e); } catch (e2) { return ''; }
        }).filter(Boolean);
      } else {
        copy.examples = [];
      }

      // ensure folder exists
      copy.folder = (typeof copy.folder === 'string' && copy.folder.trim()) ? copy.folder.trim() : 'Uncategorized';

      // normalize tests to expected shape: { question: string, options: [string], correctIndex: number }
      if (Array.isArray(copy.tests)) {
        copy.tests = copy.tests.map(t => {
          return {
            question: String((t && t.question) ? t.question : ''),
            options: Array.isArray(t.options) ? t.options.map(o => (typeof o === 'string' ? o : (o && o.text) ? String(o.text) : String(o || ''))) : [],
            correctIndex: Number((t && typeof t.correctIndex !== 'undefined') ? Number(t.correctIndex || 0) : 0)
          };
        });
      } else {
        copy.tests = [];
      }

      return copy;
    });

    return res2.json({ ok: true, lessons: out });
  }, req, res);
});

/**
 * POST /lessons
 * Admin only (create lesson)
 */
router.post('/lessons', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    const { title, subtitle, content, examples, tests, folder } = req2.body || {};
    if (!title) return res2.status(400).json({ ok: false, message: 'title required' });

    // normalize examples to array of strings
    const normExamples = Array.isArray(examples)
      ? examples.map(x => (typeof x === 'string' ? x : (x && x.text) ? String(x.text) : String(x || '') )).filter(Boolean)
      : (examples ? [String(examples)] : []);

    // normalize tests to expected shape
    const normTests = Array.isArray(tests) ? tests.map(t => ({
      question: String((t && t.question) ? t.question : ''),
      options: Array.isArray(t.options) ? t.options.map(o => (typeof o === 'string' ? o : (o && o.text) ? String(o.text) : String(o || ''))) : [],
      correctIndex: typeof t.correctIndex === 'number' ? t.correctIndex : Number(t.correctIndex || 0)
    })) : [];

    const doc = new Lesson({
      title: title,
      subtitle: subtitle || '',
      content: content || '',
      examples: normExamples,
      tests: normTests,
      folder: (typeof folder === 'string' && folder.trim()) ? folder.trim() : 'Uncategorized',
      createdBy: req2.user._id
    });
    await doc.save();
    if (DEBUG) console.info('[math-game:lessons:create] lesson created', { id: String(doc._id), title: doc.title });
    return res2.json({ ok: true, lesson: doc });
  }, req, res);
});

/**
 * PUT /lessons/:id
 * Admin only (edit lesson)
 */
router.put('/lessons/:id', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    const id = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res2.status(400).json({ ok: false, message: 'Invalid id' });
    const { title, subtitle, content, examples, tests, folder } = req2.body || {};
    const doc = await Lesson.findById(String(id));
    if (!doc) return res2.status(404).json({ ok: false, message: 'Lesson not found' });

    if (typeof title !== 'undefined') doc.title = title;
    if (typeof subtitle !== 'undefined') doc.subtitle = subtitle;
    if (typeof content !== 'undefined') doc.content = content;

    if (typeof examples !== 'undefined') {
      doc.examples = Array.isArray(examples)
        ? examples.map(x => (typeof x === 'string' ? x : (x && x.text) ? String(x.text) : String(x || ''))).filter(Boolean)
        : (examples ? [String(examples)] : []);
    }

    if (typeof tests !== 'undefined') {
      doc.tests = Array.isArray(tests) ? tests.map(t => ({
        question: String((t && t.question) ? t.question : ''),
        options: Array.isArray(t.options) ? t.options.map(o => (typeof o === 'string' ? o : (o && o.text) ? String(o.text) : String(o || ''))) : [],
        correctIndex: typeof t.correctIndex === 'number' ? t.correctIndex : Number(t.correctIndex || 0)
      })) : [];
    }

    if (typeof folder !== 'undefined') {
      doc.folder = (typeof folder === 'string' && folder.trim()) ? folder.trim() : 'Uncategorized';
    }

    await doc.save();
    if (DEBUG) console.info('[math-game:lessons:update] updated', { id: String(doc._id) });
    return res2.json({ ok: true, lesson: doc });
  }, req, res);
});

/**
 * DELETE /lessons/:id
 * Admin only (delete lesson)
 */
router.delete('/lessons/:id', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    const id = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res2.status(400).json({ ok: false, message: 'Invalid id' });
    const doc = await Lesson.findById(String(id));
    if (!doc) return res2.status(404).json({ ok: false, message: 'Lesson not found' });
    await Lesson.deleteOne({ _id: doc._id });
    if (DEBUG) console.info('[math-game:lessons:delete] deleted', { id: String(doc._id) });
    return res2.json({ ok: true, message: 'Deleted' });
  }, req, res);
});
/* -------------------------
   Competitions & admin actions
   ------------------------- */

// require models already loaded above: MathType, Question, GameAttempt, LeaderboardEntry
let Competition = null;
let CompetitionResult = null;
try {
  const models = require('../models/Game');
  Competition = models.Competition;
  CompetitionResult = models.CompetitionResult;
} catch (e) {
  console.warn('Competition models unavailable', e);
}

/**
 * GET /competitions
 * optional query: active=true
 */
router.get('/competitions', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Competition) return res2.json({ ok: true, competitions: [] });
    const q = {};
    if (req2.query.active === 'true') q.active = true;
    const items = await Competition.find(q).sort({ startAt: -1 }).lean().catch(()=>[]);
    return res2.json({ ok: true, competitions: items });
  }, req, res);
});

/**
 * POST /competitions
 * Admin only: { title, description, startAt, endAt }
 */
router.post('/competitions', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Competition) return res2.status(500).json({ ok: false, message: 'Competition model not available' });
    const { title, description, startAt, endAt } = req2.body || {};
    if (!title || !startAt || !endAt) return res2.status(400).json({ ok: false, message: 'title, startAt and endAt required' });
    const s = new Date(startAt);
    const e = new Date(endAt);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return res2.status(400).json({ ok: false, message: 'Invalid start/end times' });
    const comp = new Competition({ title, description: description || '', startAt: s, endAt: e, active: (s <= new Date() && e > new Date()), createdBy: req2.user._id });
    await comp.save();
    return res2.json({ ok: true, competition: comp });
  }, req, res);
});

/**
 * PUT /competitions/:id
 * Admin only - edit competition. If editing to end it now, finalize (announce winner & clear points)
 */
router.put('/competitions/:id', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Competition || !CompetitionResult) return res2.status(500).json({ ok: false, message: 'Competition models not available' });
    const id = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res2.status(400).json({ ok: false, message: 'Invalid id' });
    const comp = await Competition.findById(String(id));
    if (!comp) return res2.status(404).json({ ok: false, message: 'Competition not found' });
    const { title, description, startAt, endAt, active } = req2.body || {};

    if (typeof title !== 'undefined') comp.title = title;
    if (typeof description !== 'undefined') comp.description = description;
    if (typeof startAt !== 'undefined') comp.startAt = new Date(startAt);
    if (typeof endAt !== 'undefined') comp.endAt = new Date(endAt);
    if (typeof active !== 'undefined') comp.active = !!active;

    await comp.save();

    // If the competition was just ended (endAt <= now), finalize: compute winner and then clear competition results (as requested)
    try {
      if (comp.endAt && new Date(comp.endAt) <= new Date()) {
        // aggregate winner by sum(delta) for competition
        const agg = await CompetitionResult.aggregate([
          { $match: { competitionId: comp._id } },
          { $group: { _id: '$userId', total: { $sum: '$delta' }, userName: { $first: '$userName' }, userNumberId: { $first: '$userNumberId' }, managerCreatedBy: { $first: '$managerCreatedBy' }, schoolName: { $first: '$schoolName' } } },
          { $sort: { total: -1 } },
          { $limit: 1 }
        ]).catch(()=>[]);

        const winner = (agg && agg.length) ? agg[0] : null;

        // Announce winner — attempt to notify via notifications if your app supports it (fallback: console)
        const announce = async (w) => {
          if (!w) return;
          const msg = `Competition "${comp.title}" finished. Winner: ${w.userName || 'Unknown'} (ID: ${w.userNumberId || ''}) — ${w.managerCreatedBy || w.schoolName || ''}`;
          // try to push to a Notifications collection if your app has one
          try {
            const Notifications = mongoose.modelNames().includes('Notification') ? mongoose.model('Notification') : null;
            if (Notifications) {
              const doc = new Notifications({ userId: w._id, title: 'Competition result', message: msg, createdAt: new Date() });
              await doc.save().catch(()=>null);
            } else {
              // fallback: log
              console.info('[competition] announce (no Notifications model):', msg);
            }
          } catch (e) {
            console.info('[competition] announce fallback:', msg);
          }
        };

        await announce(winner);

        // Clear competition results so "all points will be zero" as requested
        await CompetitionResult.deleteMany({ competitionId: comp._id }).catch(()=>null);
      }
    } catch (err) {
      console.error('competition finalize error', err);
    }

    return res2.json({ ok: true, competition: comp });
  }, req, res);
});

/**
 * POST /competitions/:id/addPoints
 * Admin only — add points (delta) for a user for the competition
 * body: { userId, delta, reason, attemptId (optional) }
 */
router.post('/competitions/:id/addPoints', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Competition || !CompetitionResult) return res2.status(500).json({ ok: false, message: 'Competition models not available' });
    const compId = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(compId))) return res2.status(400).json({ ok: false, message: 'Invalid competition id' });
    const comp = await Competition.findById(compId);
    if (!comp) return res2.status(404).json({ ok: false, message: 'Competition not found' });

    const { userId, delta = 0, reason = '', attemptId = null } = req2.body || {};
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return res2.status(400).json({ ok: false, message: 'userId required' });
    const userObjId = new mongoose.Types.ObjectId(String(userId));
    // snapshot some user fields if possible
    let userName = '', userNumberId = '', managerCreatedBy = '', schoolName = '';
    try {
      const u = await (User ? User.findById(userObjId).lean().catch(()=>null) : Promise.resolve(null));
      if (u) { userName = u.fullname || u.name || ''; userNumberId = u.numberId || u.childNumberId || ''; }
    } catch (e) {}
    // Try to snapshot Student doc if exists
    try {
      if (Student) {
        const s = await Student.findById(userObjId).lean().catch(()=>null);
        if (s) {
          userName = userName || (s.fullname || s.name || '');
          userNumberId = userNumberId || s.numberId || '';
          managerCreatedBy = (s.createdBy && (s.createdBy.fullname || s.createdBy.name)) ? (s.createdBy.fullname || s.createdBy.name) : (s.managerName || '');
          schoolName = s.schoolName || '';
        }
      }
    } catch (e) {}

    const cr = new CompetitionResult({
      competitionId: comp._id,
      userId: userObjId,
      userName,
      userNumberId,
      managerCreatedBy,
      schoolName,
      delta: Number(delta || 0),
      reason: String(reason || ''),
      attemptId: (attemptId && mongoose.Types.ObjectId.isValid(String(attemptId))) ? new mongoose.Types.ObjectId(String(attemptId)) : null
    });
    await cr.save();
    return res2.json({ ok: true, result: cr });
  }, req, res);
});

/**
 * POST /competitions/:id/clearPoints
 * Admin only — clear all competition points for user (deletes CompetitionResult documents)
 * body: { userId }
 */
router.post('/competitions/:id/clearPoints', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Competition || !CompetitionResult) return res2.status(500).json({ ok: false, message: 'Competition models not available' });
    const compId = req2.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(compId))) return res2.status(400).json({ ok: false, message: 'Invalid competition id' });
    const { userId } = req2.body || {};
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return res2.status(400).json({ ok: false, message: 'userId required' });
    await CompetitionResult.deleteMany({ competitionId: compId, userId: new mongoose.Types.ObjectId(String(userId)) }).catch(()=>null);
    return res2.json({ ok: true });
  }, req, res);
});

/**
 * GET /competitions/:id/user/:userId/results
 * View competition result entries for user — admin can view any, users can view their own.
 */
router.get('/competitions/:id/user/:userId/results', auth, async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!Competition || !CompetitionResult) return res2.status(500).json({ ok: false, message: 'Competition models not available' });
    const compId = req2.params.id;
    const userId = req2.params.userId;
    if (!mongoose.Types.ObjectId.isValid(String(compId)) || !mongoose.Types.ObjectId.isValid(String(userId))) return res2.status(400).json({ ok: false, message: 'Invalid ids' });
    // allow admin or owner
    if ((req2.user && (req2.user.role || '').toLowerCase() !== 'admin') && String(req2.user._id) !== String(userId)) {
      return res2.status(403).json({ ok: false, message: 'Forbidden' });
    }
    const items = await CompetitionResult.find({ competitionId: compId, userId: new mongoose.Types.ObjectId(String(userId)) }).sort({ createdAt: -1 }).lean().catch(()=>[]);
    return res2.json({ ok: true, results: items });
  }, req, res);
});

/**
 * POST /competitions/:id/clearResult/:resultId
 * Admin only - delete a specific CompetitionResult (used to clear specific recent-game marks)
 */
router.post('/competitions/:id/clearResult/:resultId', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    if (!CompetitionResult) return res2.status(500).json({ ok: false, message: 'CompetitionResult model not available' });
    const resultId = req2.params.resultId;
    if (!mongoose.Types.ObjectId.isValid(String(resultId))) return res2.status(400).json({ ok: false, message: 'Invalid result id' });
    await CompetitionResult.deleteOne({ _id: new mongoose.Types.ObjectId(String(resultId)) }).catch(()=>null);
    return res2.json({ ok: true });
  }, req, res);
});

/**
 * POST /competitions/:id/clearAttempt/:attemptId
 * Admin only - zero an attempt's score and recompute leaderboard entry for that mathType/difficulty
 */
router.post('/competitions/:id/clearAttempt/:attemptId', auth, roles(['admin']), async (req, res) => {
  await safeHandler(async (req2, res2) => {
    const attemptId = req2.params.attemptId;
    if (!mongoose.Types.ObjectId.isValid(String(attemptId))) return res2.status(400).json({ ok: false, message: 'Invalid attempt id' });
    const attempt = await GameAttempt.findById(String(attemptId)).catch(()=>null);
    if (!attempt) return res2.status(404).json({ ok: false, message: 'Attempt not found' });
    // zero the attempt
    const oldScore = attempt.score || 0;
    attempt.score = 0;
    await attempt.save().catch(()=>null);

    // recompute leaderboard entry for same mathTypeId/difficulty/userId
    try {
      const cond = { mathTypeId: attempt.mathTypeId, difficulty: attempt.selectedDifficulty || 'all', userId: attempt.userId, schoolId: attempt.schoolId || null };
      // find max among remaining attempts for this user+mathType+difficulty
      const best = await GameAttempt.find({ userId: attempt.userId, mathTypeId: attempt.mathTypeId, selectedDifficulty: attempt.selectedDifficulty || 'all', completed: true }).sort({ score: -1 }).limit(1).lean().catch(()=>[]);
      const newHighest = (best && best.length) ? Number(best[0].score || 0) : 0;
      let le = await LeaderboardEntry.findOne({ mathTypeId: attempt.mathTypeId, difficulty: attempt.selectedDifficulty || 'all', userId: attempt.userId, schoolId: attempt.schoolId || null }).catch(()=>null);
      if (le) {
        le.highestScore = newHighest;
        le.lastPlayedAt = new Date();
        await le.save().catch(()=>null);
      } else {
        // if doesn't exist create
        const leNew = new LeaderboardEntry({
          mathTypeId: attempt.mathTypeId,
          difficulty: attempt.selectedDifficulty || 'all',
          schoolId: attempt.schoolId || null,
          userId: attempt.userId,
          userName: attempt.userName || '',
          userNumberId: attempt.userNumberId || '',
          managerCreatedBy: attempt.managerCreatedBy || '',
          schoolName: attempt.schoolName || '',
          highestScore: newHighest,
          lastPlayedAt: new Date()
        });
        await leNew.save().catch(()=>null);
      }
    } catch (e) {
      console.error('recompute leaderboard after clearing attempt', e);
    }

    return res2.json({ ok: true });
  }, req, res);
});


module.exports = router;
