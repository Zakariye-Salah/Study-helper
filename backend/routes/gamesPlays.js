// backend/routes/gamesPlays.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const GameModels = require('../models/Games');
const Game = GameModels.Game;
const GameQuestion = GameModels.GameQuestion;
const GamePlay = require('../models/GamePlay');
const CompetitionModels = require('../models/Competition');
const Competition = CompetitionModels.Competition;
const CompetitionParticipant = CompetitionModels.CompetitionParticipant;
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Simple requireAuth middleware
function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    const token = auth && typeof auth === 'string' && auth.split(' ')[0] === 'Bearer'
      ? auth.split(' ')[1]
      : (req.body && req.body.token) || null;
    if (!token) return res.status(401).json({ ok: false, error: 'Authentication required' });
    jwt.verify(token, JWT_SECRET, (err, payload) => {
      if (err) return res.status(401).json({ ok: false, error: 'Invalid token' });
      req.user = payload;
      next();
    });
  } catch (err) {
    console.error('requireAuth error', err && (err.stack || err));
    return res.status(401).json({ ok: false, error: 'Auth error' });
  }
}

// Helper: check admin role
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(403).json({ ok:false, error:'Not allowed' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin') return res.status(403).json({ ok:false, error:'Admin only' });
  return next();
}

// ----------------- Admin: Games CRUD -----------------

// GET /api/games?search=&isCompetition=
router.get('/games', requireAuth, async (req,res) => {
  try {
    const q = (req.query.search || '').trim();
    const isCompetition = typeof req.query.isCompetition !== 'undefined' ? String(req.query.isCompetition) === 'true' : undefined;
    const filter = { deleted: false };
    if (q) filter.$text = { $search: q };
    if (typeof isCompetition !== 'undefined') filter.isCompetition = isCompetition;
    const games = await Game.find(filter).sort({ createdAt: -1 }).lean();
    // compute totalQuestions per game (aggregation)
    const counts = await GameQuestion.aggregate([
      { $match: { deleted: false } },
      { $group: { _id: '$gameId', count: { $sum: 1 } } }
    ]);
    const mapCounts = {};
    counts.forEach(c => mapCounts[c._id.toString()] = c.count);
    const rows = games.map(g => Object.assign({}, g, { totalQuestions: mapCounts[g._id.toString()] || 0 }));
    return res.json({ ok:true, data: rows });
  } catch (err) {
    console.error('GET /games', err && (err.stack || err));
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// POST /api/games
router.post('/games', requireAuth, requireAdmin, async (req,res) => {
  try {
    const { name, description, isCompetition, tags } = req.body;
    if (!name) return res.status(400).json({ ok:false, error:'name required' });
    const slug = String(name).toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'').slice(0,80);
    const dup = await Game.findOne({ slug });
    if (dup) return res.status(400).json({ ok:false, error:'game exists' });
    const g = new Game({ name, slug, description, isCompetition: !!isCompetition, tags: Array.isArray(tags)?tags:[] , createdBy: req.user._id });
    await g.save();
    return res.json({ ok:true, game: g });
  } catch (err) {
    console.error('POST /games', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// PUT /api/games/:id
router.put('/games/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const id = req.params.id;
    const upd = {};
    ['name','description','isCompetition','tags','thumbnail'].forEach(k => { if (typeof req.body[k] !== 'undefined') upd[k]=req.body[k]; });
    upd.updatedAt = new Date();
    const g = await Game.findByIdAndUpdate(id, { $set: upd }, { new: true }).lean();
    if (!g) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true, game: g });
  } catch (err) {
    console.error('PUT /games/:id', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// DELETE /api/games/:id (soft)
router.delete('/games/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const id = req.params.id;
    await Game.findByIdAndUpdate(id, { $set: { deleted: true, updatedAt: new Date() } });
    // optionally mark questions deleted
    await GameQuestion.updateMany({ gameId: id }, { $set: { deleted: true } });
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /games/:id', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ----------------- Admin: Questions CRUD -----------------

// GET /api/games/:id/questions
router.get('/games/:id/questions', requireAuth, requireAdmin, async (req,res) => {
  try {
    const gid = req.params.id;
    const rows = await GameQuestion.find({ gameId: gid, deleted: false }).sort({ createdAt: -1 }).lean();
    return res.json({ ok:true, data: rows });
  } catch (err) {
    console.error('GET /games/:id/questions', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// POST /api/games/:id/questions
router.post('/games/:id/questions', requireAuth, requireAdmin, async (req,res) => {
  try {
    const gid = req.params.id;
    const { text, choices, correctIndex, timeLimit, difficulty, tags } = req.body;
    if (!text || !Array.isArray(choices) || choices.length < 2) return res.status(400).json({ ok:false, error:'Invalid data' });
    const q = new GameQuestion({ gameId: gid, text, choices, correctIndex: Number(correctIndex || 0), timeLimit: Number(timeLimit || 10), difficulty: difficulty || '', tags: Array.isArray(tags) ? tags : [] });
    await q.save();
    return res.json({ ok:true, question: q });
  } catch (err) {
    console.error('POST /games/:id/questions', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// PUT /api/games/:id/questions/:qId
router.put('/games/:id/questions/:qId', requireAuth, requireAdmin, async (req,res) => {
  try {
    const qId = req.params.qId;
    const upd = {};
    ['text','choices','correctIndex','timeLimit','difficulty','tags'].forEach(k => { if (typeof req.body[k] !== 'undefined') upd[k] = req.body[k]; });
    upd.updatedAt = new Date();
    const q = await GameQuestion.findByIdAndUpdate(qId, { $set: upd }, { new: true }).lean();
    if (!q) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true, question: q });
  } catch (err) {
    console.error('PUT /games/:id/questions/:qId', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// DELETE /api/games/:id/questions/:qId (soft)
router.delete('/games/:id/questions/:qId', requireAuth, requireAdmin, async (req,res) => {
  try {
    const qId = req.params.qId;
    await GameQuestion.findByIdAndUpdate(qId, { $set: { deleted: true, updatedAt: new Date() } });
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE question', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ----------------- Gameplay endpoints -----------------

/**
 * POST /api/gamesPlays/start
 * Body: { gameId, count (default 10), perQuestionSeconds, competitionId? }
 * Checks: user role student, game exists and not deleted, competition schedule (optional)
 * Returns: { sessionId, questions: [ { _id, text, choices, timeLimit } ], perQuestionSeconds, isCompetitive, sessionPoints:0, totalPoints: <student total> }
 */
router.post('/gamesPlays/start', requireAuth, async (req,res) => {
  try {
    const user = req.user || {};
    const userRole = (user.role || '').toLowerCase();
    if (userRole !== 'student') return res.status(403).json({ ok:false, error:'Only students may play' });

    let { gameId, count = 10, perQuestionSeconds = 10, competitionId = null } = req.body || {};
    if (!gameId) return res.status(400).json({ ok:false, error:'gameId required' });

    // fetch game safely
    const game = await Game.findOne({ _id: gameId, deleted: false }).lean();
    if (!game) return res.status(404).json({ ok:false, error:'Game not found' });

    // If game is competitive and the client didn't provide competitionId, try to find active competition
    if (game.isCompetition && !competitionId) {
      try {
        const now = new Date();
        const current = await Competition.findOne({ deleted: false, startAt: { $lte: now }, endAt: { $gte: now } }).lean();
        if (current && current._id) competitionId = String(current._id);
      } catch (e) {
        // ignore; proceed without competitionId
      }
    }

    const isCompetitive = !!(game.isCompetition && competitionId);

    // Build exclusion list: questions this student already answered for this game (ignore competition when deciding uniqueness to reduce strictness)
    const answered = await GamePlay.find({ studentId: user._id, gameId: gameId }).select('questions.qId').lean();
    const excludedSet = new Set();
    for (const s of answered) {
      (s.questions || []).forEach(q => { if (q.qId) excludedSet.add(String(q.qId)); });
    }

    // sample random questions excluding excludedSet
    let pool = [];
    try {
      if (mongoose.Types.ObjectId.isValid(String(gameId))) {
        pool = await GameQuestion.aggregate([
          { $match: { gameId: mongoose.Types.ObjectId(String(gameId)), deleted: false } },
          { $sample: { size: Math.max(50, Number(count) * 3) } }
        ]);
      } else {
        pool = await GameQuestion.find({ gameId: gameId, deleted: false }).limit(Math.max(50, Number(count) * 3)).lean();
      }
    } catch (e) {
      // fallback to simple find if aggregation fails
      pool = await GameQuestion.find({ gameId: gameId, deleted: false }).limit(Math.max(50, Number(count) * 3)).lean();
    }

    // select chosen questions excluding already-answered
    const chosen = [];
    for (const p of pool) {
      if (chosen.length >= count) break;
      if (excludedSet.has(String(p._id))) continue;
      chosen.push(p);
    }
    // if not enough unique questions, fetch more and allow repeats as fallback
    if (chosen.length < count) {
      const more = await GameQuestion.find({ gameId: gameId, deleted: false }).limit(count - chosen.length).lean();
      for (const m of more) {
        if (chosen.length >= count) break;
        chosen.push(m);
      }
    }

    // create session (store qIds only)
    const sessionDoc = new GamePlay({
      competitionId: competitionId || null,
      participantId: null,
      studentId: user._id,
      gameId: gameId,
      questions: chosen.map(q => ({ qId: q._id })),
      sessionPoints: 0,
      isCompetitive: isCompetitive,
      startedAt: new Date(),
      createdBy: user._id || null
    });
    await sessionDoc.save();

    // prepare return questions without revealing correctIndex
    const returnQs = chosen.map(q => ({ _id: q._id, text: q.text, choices: q.choices, timeLimit: q.timeLimit || perQuestionSeconds }));

    // try to get student's competition totalPoints (if competition present)
    let totalPoints = 0;
    try {
      if (competitionId && mongoose.Types.ObjectId.isValid(String(competitionId))) {
        const part = await CompetitionParticipant.findOne({ competitionId: competitionId, studentId: user._id }).lean();
        totalPoints = (part && part.totalPoints) ? part.totalPoints : 0;
      }
    } catch (e) {
      // ignore
    }

    return res.json({
      ok: true,
      sessionId: sessionDoc._id,
      questions: returnQs,
      perQuestionSeconds,
      isCompetitive,
      sessionPoints: 0,
      totalPoints
    });
  } catch (err) {
    console.error('gamesPlays/start err', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * POST /api/gamesPlays/:sessionId/answer
 * Body: { questionId, answerIndex, clientTimestamp }
 * Returns: { correct, pointsDelta, sessionPoints, totalPoints, nextQuestion }
 */
router.post('/gamesPlays/:sessionId/answer', requireAuth, async (req,res) => {
  try {
    const user = req.user || {};
    const sid = req.params.sessionId;
    const { questionId, answerIndex } = req.body;
    if (!sid || !questionId) return res.status(400).json({ ok:false, error:'sessionId and questionId required' });

    const session = await GamePlay.findById(sid);
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });

    // allow for JWT payloads that use either id or _id
    const uid = req.user && (req.user._id || req.user.id || req.user);
    if (String(session.studentId) !== String(uid)) return res.status(403).json({ ok:false, error:'Not your session' });
    if (session.endedAt) return res.status(400).json({ ok:false, error:'Session already ended' });

    // find question in DB (authoritative)
    const q = await GameQuestion.findById(questionId).lean();
    if (!q) return res.status(404).json({ ok:false, error:'Question not found' });

    // find the corresponding entry in session.questions to update
    const qIndex = session.questions.findIndex(x => String(x.qId) === String(questionId) && (x.answerIndex === null || typeof x.answerIndex === 'undefined'));
    const targetIndex = qIndex >= 0 ? qIndex : session.questions.findIndex(x => String(x.qId) === String(questionId));
    if (targetIndex < 0) {
      return res.status(400).json({ ok:false, error:'Question not part of session or already answered' });
    }

    const correct = (Number(answerIndex) === Number(q.correctIndex));
    const pointsDelta = correct ? 3 : -1;
    const timeMs = 0;

    // update session
    session.questions[targetIndex].answerIndex = Number(answerIndex);
    session.questions[targetIndex].correct = !!correct;
    session.questions[targetIndex].timeMs = timeMs;
    session.sessionPoints = (session.sessionPoints || 0) + pointsDelta;
    await session.save();

    // next unanswered
    const nextUnanswered = session.questions.find(x => typeof x.answerIndex === 'undefined' || x.answerIndex === null);
    let nextQuestion = null;
    if (nextUnanswered) {
      const nq = await GameQuestion.findById(nextUnanswered.qId).lean();
      if (nq) nextQuestion = { _id: nq._id, text: nq.text, choices: nq.choices, timeLimit: nq.timeLimit || 10 };
    }

    // compute totalPoints
    let totalPoints = session.sessionPoints;
    try {
      if (session.competitionId && mongoose.Types.ObjectId.isValid(String(session.competitionId))) {
        const part = await CompetitionParticipant.findOne({ competitionId: session.competitionId, studentId: session.studentId }).lean();
        totalPoints = (part && part.totalPoints) ? part.totalPoints + session.sessionPoints : session.sessionPoints;
      }
    } catch (e) {
      // ignore
    }

    return res.json({ ok:true, correct, pointsDelta, sessionPoints: session.sessionPoints, totalPoints, nextQuestion });
  } catch (err) {
    console.error('answer err', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// GET next helper
router.get('/gamesPlays/:sessionId/next', requireAuth, async (req,res) => {
  try {
    const sid = req.params.sessionId;
    const session = await GamePlay.findById(sid).lean();
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });
    const next = (session.questions || []).find(x => typeof x.answerIndex === 'undefined' || x.answerIndex === null);
    if (!next) return res.json({ ok:true, nextQuestion: null });
    const nq = await GameQuestion.findById(next.qId).lean();
    if (!nq) return res.json({ ok:true, nextQuestion: null });
    return res.json({ ok:true, nextQuestion: { _id: nq._id, text: nq.text, choices: nq.choices, timeLimit: nq.timeLimit || 10 } });
  } catch (err) {
    console.error('next err', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * POST /gamesPlays/:sessionId/finish
 */
router.post('/gamesPlays/:sessionId/finish', requireAuth, async (req,res) => {
  try {
    const sid = req.params.sessionId;
    const session = await GamePlay.findById(sid);
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });

    const uid = req.user && (req.user._id || req.user.id || req.user);
    if (String(session.studentId) !== String(uid)) return res.status(403).json({ ok:false, error:'Not your session' });
    if (session.endedAt) return res.status(400).json({ ok:false, error:'Already finished' });

    session.endedAt = new Date();
    await session.save();

    if (session.isCompetitive && session.competitionId) {
      try {
        await CompetitionParticipant.findOneAndUpdate(
          { competitionId: session.competitionId, studentId: session.studentId },
          { $inc: { totalPoints: session.sessionPoints }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
      } catch (e) {
        console.warn('CompetitionParticipant update skipped', e && e.message);
      }
    }

    return res.json({ ok:true, sessionPoints: session.sessionPoints });
  } catch (err) {
    console.error('finish err', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * POST /gamesPlays/:sessionId/cancel
 */
router.post('/gamesPlays/:sessionId/cancel', requireAuth, async (req,res) => {
  try {
    const sid = req.params.sessionId;
    const session = await GamePlay.findById(sid);
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });

    const uid = req.user && (req.user._id || req.user.id || req.user);
    if (String(session.studentId) !== String(uid)) return res.status(403).json({ ok:false, error:'Not your session' });
    if (session.endedAt) return res.status(400).json({ ok:false, error:'Already finished' });

    session.cancelled = true;
    session.endedAt = new Date();
    await session.save();

    if (session.isCompetitive && session.competitionId) {
      try {
        await CompetitionParticipant.findOneAndUpdate(
          { competitionId: session.competitionId, studentId: session.studentId },
          { $inc: { totalPoints: session.sessionPoints }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
      } catch (e) {
        console.warn('comp update skipped', e && e.message);
      }
    }

    return res.json({ ok:true, sessionPoints: session.sessionPoints });
  } catch (err) {
    console.error('cancel err', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// summary endpoint
router.get('/gamesPlays/:sessionId/summary', requireAuth, async (req,res) => {
  try {
    const sid = req.params.sessionId;
    const session = await GamePlay.findById(sid).lean();
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });

    const uid = req.user && (req.user._id || req.user.id || req.user);
    if (String(session.studentId) !== String(uid) && (req.user.role || '').toLowerCase() !== 'admin') return res.status(403).json({ ok:false, error:'Not allowed' });

    const qDetails = [];
    for (const q of session.questions || []) {
      const qdoc = await GameQuestion.findById(q.qId).lean();
      qDetails.push({
        qId: q.qId,
        text: qdoc ? qdoc.text : null,
        choices: qdoc ? qdoc.choices : [],
        answerIndex: q.answerIndex,
        correct: q.correct,
        timeMs: q.timeMs
      });
    }
    return res.json({ ok:true, sessionPoints: session.sessionPoints, totalPoints: session.totalPoints || 0, questions: qDetails, startedAt: session.startedAt, endedAt: session.endedAt });
  } catch (err) {
    console.error('summary err', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// history (per student)
router.get('/gamesPlays/history/:studentId', requireAuth, async (req,res) => {
  try {
    const sid = req.params.studentId;
    const uid = req.user && (req.user._id || req.user.id || req.user);
    if (String(uid) !== String(sid) && (req.user.role || '').toLowerCase() !== 'admin') return res.status(403).json({ ok:false, error:'Not allowed' });

    const rows = await GamePlay.find({ studentId: sid }).sort({ startedAt: -1 }).limit(100).lean();
    const gameIds = Array.from(new Set(rows.map(r => String(r.gameId))));
    const games = await Game.find({ _id: { $in: gameIds } }).lean();
    const gMap = {};
    games.forEach(g => gMap[String(g._id)] = g);
    const out = rows.map(r => ({ _id: r._id, gameId: r.gameId, gameName: gMap[String(r.gameId)] ? gMap[String(r.gameId)].name : '', sessionPoints: r.sessionPoints, startedAt: r.startedAt }));
    return res.json({ ok:true, data: out });
  } catch (err) {
    console.error('history err', err && (err.stack || err));
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

module.exports = router;
/// backend/routes/gamesPlays.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const GameModels = require('../models/Games');
const Game = GameModels.Game;
const GameQuestion = GameModels.GameQuestion;
const GamePlay = require('../models/GamePlay');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Simple requireAuth middleware
function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    const token = auth && typeof auth === 'string' && auth.split(' ')[0] === 'Bearer' ? auth.split(' ')[1] : (req.body && req.body.token) || null;
    if (!token) return res.status(401).json({ ok: false, error: 'Authentication required' });
    jwt.verify(token, JWT_SECRET, (err, payload) => {
      if (err) return res.status(401).json({ ok: false, error: 'Invalid token' });
      req.user = payload;
      next();
    });
  } catch (err) {
    console.error('requireAuth error', err);
    return res.status(401).json({ ok: false, error: 'Auth error' });
  }
}

// Helper: check admin role
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(403).json({ ok:false, error:'Not allowed' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin') return res.status(403).json({ ok:false, error:'Admin only' });
  return next();
}

// ----------------- Admin: Games CRUD -----------------

// GET /api/games?search=&isCompetition=
router.get('/games', requireAuth, async (req,res) => {
  try {
    const q = (req.query.search || '').trim();
    const isCompetition = typeof req.query.isCompetition !== 'undefined' ? String(req.query.isCompetition) === 'true' : undefined;
    const filter = { deleted: false };
    if (q) filter.$text = { $search: q };
    if (typeof isCompetition !== 'undefined') filter.isCompetition = isCompetition;
    const games = await Game.find(filter).sort({ createdAt: -1 }).lean();
    // compute totalQuestions per game (aggregation)
    const counts = await GameQuestion.aggregate([
      { $match: { deleted: false } },
      { $group: { _id: '$gameId', count: { $sum: 1 } } }
    ]);
    const mapCounts = {};
    counts.forEach(c => mapCounts[c._id.toString()] = c.count);
    const rows = games.map(g => Object.assign({}, g, { totalQuestions: mapCounts[g._id.toString()] || 0 }));
    return res.json({ ok:true, data: rows });
  } catch (err) {
    console.error('GET /games', err);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// POST /api/games
router.post('/games', requireAuth, requireAdmin, async (req,res) => {
  try {
    const { name, description, isCompetition, tags } = req.body;
    if (!name) return res.status(400).json({ ok:false, error:'name required' });
    const slug = String(name).toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'').slice(0,80);
    const dup = await Game.findOne({ slug });
    if (dup) return res.status(400).json({ ok:false, error:'game exists' });
    const g = new Game({ name, slug, description, isCompetition: !!isCompetition, tags: Array.isArray(tags)?tags:[] , createdBy: req.user._id });
    await g.save();
    return res.json({ ok:true, game: g });
  } catch (err) {
    console.error('POST /games', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// PUT /api/games/:id
router.put('/games/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const id = req.params.id;
    const upd = {};
    ['name','description','isCompetition','tags','thumbnail'].forEach(k => { if (typeof req.body[k] !== 'undefined') upd[k]=req.body[k]; });
    upd.updatedAt = new Date();
    const g = await Game.findByIdAndUpdate(id, { $set: upd }, { new: true }).lean();
    if (!g) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true, game: g });
  } catch (err) {
    console.error('PUT /games/:id', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// DELETE /api/games/:id (soft)
router.delete('/games/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    const id = req.params.id;
    await Game.findByIdAndUpdate(id, { $set: { deleted: true, updatedAt: new Date() } });
    // optionally mark questions deleted
    await GameQuestion.updateMany({ gameId: id }, { $set: { deleted: true } });
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE /games/:id', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ----------------- Admin: Questions CRUD -----------------

// GET /api/games/:id/questions
router.get('/games/:id/questions', requireAuth, requireAdmin, async (req,res) => {
  try {
    const gid = req.params.id;
    const rows = await GameQuestion.find({ gameId: gid, deleted: false }).sort({ createdAt: -1 }).lean();
    return res.json({ ok:true, data: rows });
  } catch (err) {
    console.error('GET /games/:id/questions', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// POST /api/games/:id/questions
router.post('/games/:id/questions', requireAuth, requireAdmin, async (req,res) => {
  try {
    const gid = req.params.id;
    const { text, choices, correctIndex, timeLimit, difficulty, tags } = req.body;
    if (!text || !Array.isArray(choices) || choices.length < 2) return res.status(400).json({ ok:false, error:'Invalid data' });
    const q = new GameQuestion({ gameId: gid, text, choices, correctIndex: Number(correctIndex || 0), timeLimit: Number(timeLimit || 10), difficulty: difficulty || '', tags: Array.isArray(tags) ? tags : [] });
    await q.save();
    return res.json({ ok:true, question: q });
  } catch (err) {
    console.error('POST /games/:id/questions', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// PUT /api/games/:id/questions/:qId
router.put('/games/:id/questions/:qId', requireAuth, requireAdmin, async (req,res) => {
  try {
    const qId = req.params.qId;
    const upd = {};
    ['text','choices','correctIndex','timeLimit','difficulty','tags'].forEach(k => { if (typeof req.body[k] !== 'undefined') upd[k] = req.body[k]; });
    upd.updatedAt = new Date();
    const q = await GameQuestion.findByIdAndUpdate(qId, { $set: upd }, { new: true }).lean();
    if (!q) return res.status(404).json({ ok:false, error:'Not found' });
    return res.json({ ok:true, question: q });
  } catch (err) {
    console.error('PUT /games/:id/questions/:qId', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// DELETE /api/games/:id/questions/:qId (soft)
router.delete('/games/:id/questions/:qId', requireAuth, requireAdmin, async (req,res) => {
  try {
    const qId = req.params.qId;
    await GameQuestion.findByIdAndUpdate(qId, { $set: { deleted: true, updatedAt: new Date() } });
    return res.json({ ok:true });
  } catch (err) {
    console.error('DELETE question', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// ----------------- Gameplay endpoints -----------------

/**
 * POST /api/gamesPlays/start
 * Body: { gameId, count (default 10), perQuestionSeconds, competitionId? }
 * Checks: user role student, game exists and not deleted, competition schedule (optional)
 * Returns: { sessionId, questions: [ { _id, text, choices, timeLimit } ], perQuestionSeconds, isCompetitive, sessionPoints:0, totalPoints: <student total> }
 */
router.post('/gamesPlays/start', requireAuth, async (req,res) => {
  try {
    const user = req.user;
    const userRole = (user.role || '').toLowerCase();
    if (userRole !== 'student') return res.status(403).json({ ok:false, error:'Only students may play' });

    const { gameId, count = 10, perQuestionSeconds = 10, competitionId = null } = req.body;
    if (!gameId) return res.status(400).json({ ok:false, error:'gameId required' });

    const game = await Game.findOne({ _id: gameId, deleted: false }).lean();
    if (!game) return res.status(404).json({ ok:false, error:'Game not found' });

    // competition enforcement could be added here (time window) - omitted for brevity
    const isCompetitive = !!(game.isCompetition && competitionId);

    // Build exclusion list: questions this student already answered for this game+competition
    const answered = await GamePlay.find({ studentId: user._id, gameId: gameId }).select('questions.qId').lean();
    const excludedSet = new Set();
    for (const s of answered) {
      (s.questions || []).forEach(q => { if (q.qId) excludedSet.add(String(q.qId)); });
    }

    // sample random questions excluding answered until count
    const pool = await GameQuestion.aggregate([
      { $match: { gameId: mongoose.Types.ObjectId(gameId), deleted: false } },
      { $sample: { size: Math.max(50, count * 3) } } // sample somewhat larger pool then filter
    ]);
    // filter out excluded and take first count
    const chosen = [];
    for (const p of pool) {
      if (chosen.length >= count) break;
      if (excludedSet.has(String(p._id))) continue;
      chosen.push(p);
    }
    // if not enough unique questions, allow repeats (fallback)
    if (chosen.length < count) {
      const more = await GameQuestion.find({ gameId: gameId, deleted: false }).limit(count - chosen.length).lean();
      for (const m of more) if (chosen.length < count) chosen.push(m);
    }

    // create session (store qIds only, no correctIndex)
    const sessionDoc = new GamePlay({
      competitionId: competitionId || null,
      participantId: null,
      studentId: user._id,
      gameId: gameId,
      questions: chosen.map(q => ({ qId: q._id })),
      sessionPoints: 0,
      isCompetitive: isCompetitive,
      startedAt: new Date(),
      createdBy: user._id
    });
    await sessionDoc.save();

    // prepare return questions without revealing correctIndex
    const returnQs = chosen.map(q => ({ _id: q._id, text: q.text, choices: q.choices, timeLimit: q.timeLimit || perQuestionSeconds }));

    // try to get student's current totalPoints in competition (if competition model present)
    let totalPoints = 0;
    try {
      const CompetitionParticipant = mongoose.model('CompetitionParticipant');
      const part = await CompetitionParticipant.findOne({ competitionId: competitionId, studentId: user._id }).lean();
      totalPoints = (part && part.totalPoints) ? part.totalPoints : 0;
    } catch (e) {
      // model not present — ignore
    }

    return res.json({
      ok: true,
      sessionId: sessionDoc._id,
      questions: returnQs,
      perQuestionSeconds,
      isCompetitive,
      sessionPoints: 0,
      totalPoints
    });
  } catch (err) {
    console.error('gamesPlays/start err', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * POST /api/gamesPlays/:sessionId/answer
 * Body: { questionId, answerIndex, clientTimestamp }
 * Returns: { correct, pointsDelta, sessionPoints, totalPoints, nextQuestion }
 */
router.post('/gamesPlays/:sessionId/answer', requireAuth, async (req,res) => {
  try {
    const user = req.user;
    const sid = req.params.sessionId;
    const { questionId, answerIndex } = req.body;
    if (!sid || !questionId) return res.status(400).json({ ok:false, error:'sessionId and questionId required' });

    const session = await GamePlay.findById(sid);
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });
    if (String(session.studentId) !== String(user._id)) return res.status(403).json({ ok:false, error:'Not your session' });
    if (session.endedAt) return res.status(400).json({ ok:false, error:'Session already ended' });

    // find question in DB (authoritative)
    const q = await GameQuestion.findById(questionId).lean();
    if (!q) return res.status(404).json({ ok:false, error:'Question not found' });

    // find the corresponding entry in session.questions to update
    const qIndex = session.questions.findIndex(x => String(x.qId) === String(questionId) && (x.answerIndex === null || typeof x.answerIndex === 'undefined'));
    // If not found by null answer index, find first occurrence of qId
    const targetIndex = qIndex >= 0 ? qIndex : session.questions.findIndex(x => String(x.qId) === String(questionId));
    if (targetIndex < 0) {
      // question not in session or already answered
      return res.status(400).json({ ok:false, error:'Question not part of session or already answered' });
    }

    const correct = (Number(answerIndex) === Number(q.correctIndex));
    const pointsDelta = correct ? 3 : -1;
    // compute timeMs best-effort
    const timeMs = 0;

    // update session doc atomically
    session.questions[targetIndex].answerIndex = Number(answerIndex);
    session.questions[targetIndex].correct = !!correct;
    session.questions[targetIndex].timeMs = timeMs;
    session.sessionPoints = (session.sessionPoints || 0) + pointsDelta;
    await session.save();

    // Optionally update competition participant totalPoints (defer to finish to avoid frequent writes)
    // Compute next question (server chooses next unanswered question)
    const nextUnanswered = session.questions.find(x => typeof x.answerIndex === 'undefined' || x.answerIndex === null);
    let nextQuestion = null;
    if (nextUnanswered) {
      const nq = await GameQuestion.findById(nextUnanswered.qId).lean();
      if (nq) nextQuestion = { _id: nq._id, text: nq.text, choices: nq.choices, timeLimit: nq.timeLimit || 10 };
    }

    // get student's competition total
    let totalPoints = 0;
    try {
      const CompetitionParticipant = mongoose.model('CompetitionParticipant');
      const part = await CompetitionParticipant.findOne({ competitionId: session.competitionId, studentId: session.studentId }).lean();
      totalPoints = (part && part.totalPoints) ? part.totalPoints + session.sessionPoints : session.sessionPoints;
    } catch (e) {
      totalPoints = session.sessionPoints;
    }

    return res.json({ ok:true, correct, pointsDelta, sessionPoints: session.sessionPoints, totalPoints, nextQuestion });
  } catch (err) {
    console.error('answer err', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// GET next helper (optional) - return next question for session
router.get('/gamesPlays/:sessionId/next', requireAuth, async (req,res) => {
  try {
    const sid = req.params.sessionId;
    const session = await GamePlay.findById(sid).lean();
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });
    const next = (session.questions || []).find(x => typeof x.answerIndex === 'undefined' || x.answerIndex === null);
    if (!next) return res.json({ ok:true, nextQuestion: null });
    const nq = await GameQuestion.findById(next.qId).lean();
    if (!nq) return res.json({ ok:true, nextQuestion: null });
    return res.json({ ok:true, nextQuestion: { _id: nq._id, text: nq.text, choices: nq.choices, timeLimit: nq.timeLimit || 10 } });
  } catch (err) {
    console.error('next err', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * POST /gamesPlays/:sessionId/finish
 * Marks endedAt and applies sessionPoints to competition participant if relevant.
 */
router.post('/gamesPlays/:sessionId/finish', requireAuth, async (req,res) => {
  try {
    const sid = req.params.sessionId;
    const session = await GamePlay.findById(sid);
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });
    if (String(session.studentId) !== String(req.user._id)) return res.status(403).json({ ok:false, error:'Not your session' });
    if (session.endedAt) return res.status(400).json({ ok:false, error:'Already finished' });

    session.endedAt = new Date();
    await session.save();

    // apply to competition participant if competitive and competition/participant exist
    if (session.isCompetitive && session.competitionId) {
      try {
        const CompetitionParticipant = mongoose.model('CompetitionParticipant');
        await CompetitionParticipant.findOneAndUpdate(
          { competitionId: session.competitionId, studentId: session.studentId },
          { $inc: { totalPoints: session.sessionPoints }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
      } catch (e) {
        // model missing or error, ignore
        console.warn('CompetitionParticipant update skipped', e && e.message);
      }
    }

    return res.json({ ok:true, sessionPoints: session.sessionPoints });
  } catch (err) {
    console.error('finish err', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

/**
 * POST /gamesPlays/:sessionId/cancel
 * Marks cancelled true and saves current points (applies same as finish)
 */
router.post('/gamesPlays/:sessionId/cancel', requireAuth, async (req,res) => {
  try {
    const sid = req.params.sessionId;
    const session = await GamePlay.findById(sid);
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });
    if (String(session.studentId) !== String(req.user._id)) return res.status(403).json({ ok:false, error:'Not your session' });
    if (session.endedAt) return res.status(400).json({ ok:false, error:'Already finished' });

    session.cancelled = true;
    session.endedAt = new Date();
    await session.save();

    if (session.isCompetitive && session.competitionId) {
      try {
        const CompetitionParticipant = mongoose.model('CompetitionParticipant');
        await CompetitionParticipant.findOneAndUpdate(
          { competitionId: session.competitionId, studentId: session.studentId },
          { $inc: { totalPoints: session.sessionPoints }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
      } catch (e) {
        console.warn('comp update skipped', e && e.message);
      }
    }

    return res.json({ ok:true, sessionPoints: session.sessionPoints });
  } catch (err) {
    console.error('cancel err', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// summary endpoint
router.get('/gamesPlays/:sessionId/summary', requireAuth, async (req,res) => {
  try {
    const sid = req.params.sessionId;
    const session = await GamePlay.findById(sid).lean();
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });
    if (String(session.studentId) !== String(req.user._id) && (req.user.role || '').toLowerCase() !== 'admin') return res.status(403).json({ ok:false, error:'Not allowed' });

    // fetch resolved questions + correctness
    const qDetails = [];
    for (const q of session.questions || []) {
      const qdoc = await GameQuestion.findById(q.qId).lean();
      qDetails.push({
        qId: q.qId,
        text: qdoc ? qdoc.text : null,
        choices: qdoc ? qdoc.choices : [],
        answerIndex: q.answerIndex,
        correct: q.correct,
        timeMs: q.timeMs
      });
    }
    return res.json({ ok:true, sessionPoints: session.sessionPoints, totalPoints: session.totalPoints || 0, questions: qDetails, startedAt: session.startedAt, endedAt: session.endedAt });
  } catch (err) {
    console.error('summary err', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

// history (per student)
router.get('/gamesPlays/history/:studentId', requireAuth, async (req,res) => {
  try {
    const sid = req.params.studentId;
    // only allow student to request their own history, or admin
    if (String(req.user._id) !== String(sid) && (req.user.role || '').toLowerCase() !== 'admin') return res.status(403).json({ ok:false, error:'Not allowed' });
    const rows = await GamePlay.find({ studentId: sid }).sort({ startedAt: -1 }).limit(100).lean();
    // augment with game names
    const gameIds = Array.from(new Set(rows.map(r => String(r.gameId))));
    const games = await Game.find({ _id: { $in: gameIds } }).lean();
    const gMap = {};
    games.forEach(g => gMap[String(g._id)] = g);
    const out = rows.map(r => ({ _id: r._id, gameId: r.gameId, gameName: gMap[String(r.gameId)] ? gMap[String(r.gameId)].name : '', sessionPoints: r.sessionPoints, startedAt: r.startedAt }));
    return res.json({ ok:true, data: out });
  } catch (err) {
    console.error('history err', err);
    return res.status(500).json({ ok:false, error:'Server error' });
  }
});

module.exports = router;
