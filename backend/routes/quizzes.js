// // backend/routes/quizzes.js
// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');
// const requireAuth = require('../middleware/auth'); // this should set req.user
// const Quiz = require('../models/Quiz');
// const QuizAttempt = require('../models/QuizAttempt');
// const Student = require('../models/Student');
// const Teacher = require('../models/Teacher'); // used for manager -> teacher relationship

// // helpers
// function toObjectId(id) {
//   try {
//     if (!id) return null;
//     if (typeof id === 'object' && id._bsontype === 'ObjectID') return id;
//     return mongoose.Types.ObjectId(String(id));
//   } catch (e) {
//     return null;
//   }
// }

// function levenshtein(a = '', b = '') {
//   a = String(a || '').toLowerCase().trim();
//   b = String(b || '').toLowerCase().trim();
//   const m = a.length, n = b.length;
//   if (m === 0) return n;
//   if (n === 0) return m;
//   const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
//   for (let i = 0; i <= m; i++) dp[i][0] = i;
//   for (let j = 0; j <= n; j++) dp[0][j] = j;
//   for (let i = 1; i <= m; i++) {
//     for (let j = 1; j <= n; j++) {
//       const cost = a[i - 1] === b[j - 1] ? 0 : 1;
//       dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
//     }
//   }
//   return dp[m][n];
// }
// function similarityPercent(a, b) {
//   a = String(a || '').trim(); b = String(b || '').trim();
//   if (!a && !b) return 100;
//   if (!a || !b) return 0;
//   const dist = levenshtein(a, b);
//   const maxLen = Math.max(a.length, b.length) || 1;
//   return Math.round(Math.max(0, 1 - dist / maxLen) * 100);
// }

// function computePointsForQuestion(question, studentAnswer) {
//   const full = Number(question.points || 1);
//   if (question.type === 'multiple') {
//     const correct = question.correctAnswer;
//     if (Array.isArray(correct)) {
//       if (!Array.isArray(studentAnswer)) return 0;
//       const a = studentAnswer.map(String).sort();
//       const b = correct.map(String).sort();
//       if (a.length !== b.length) return 0;
//       for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return 0;
//       return full;
//     } else {
//       if (!studentAnswer && studentAnswer !== 0) return 0;
//       return String(studentAnswer) === String(correct) ? full : 0;
//     }
//   } else {
//     const expected = question.correctAnswer;
//     const studentStr = String(studentAnswer || '');
//     if (!studentStr) return 0;
//     if (Array.isArray(expected)) {
//       let best = 0;
//       for (const e of expected) best = Math.max(best, similarityPercent(e, studentStr));
//       const pct = best;
//       if (pct >= 70) return full;
//       if (pct >= 50) return Math.round(full / 2);
//       if (pct >= 30) return Math.round(full / 3);
//       return 0;
//     } else {
//       const pct = similarityPercent(expected, studentStr);
//       if (pct >= 70) return full;
//       if (pct >= 50) return Math.round(full / 2);
//       if (pct >= 30) return Math.round(full / 3);
//       return 0;
//     }
//   }
// }

// function isPrivileged(user) {
//   const r = (user && (user.role || '') + '').toLowerCase();
//   return ['teacher', 'manager', 'admin'].includes(r);
// }

// /**
//  * Build allowed creator IDs for manager role (manager + their teachers).
//  * Returns an array of string ids.
//  */
// async function allowedCreatorsForUser(user) {
//   const role = (user && (user.role || '') + '').toLowerCase();
//   if (role === 'admin') return null; // null means "no restriction"
//   if (role === 'teacher') return [String(user._id)];
//   if (role === 'manager') {
//     // include manager + teachers created by this manager
//     try {
//       const teachers = await Teacher.find({ createdBy: String(user._id) }).select('_id').lean().exec();
//       const ids = (teachers || []).map(t => String(t._id));
//       ids.push(String(user._id));
//       return ids;
//     } catch (e) {
//       return [String(user._id)];
//     }
//   }
//   // students => no creator restriction here; student access is governed by classIds/active and student.createdBy check in finer-grained checks
//   return [];
// }

// /**
//  * Check whether a user may access a quiz (returns true/false).
//  * - admin -> true
//  * - manager -> true if createdBy in allowedCreators (manager or manager's teachers)
//  * - teacher -> true if createdBy == teacher._id
//  * - student -> true if quiz.active AND (class restriction OR createdBy matches student's createdBy)
//  */
// /**
//  * Check whether a user may access a quiz (returns true/false).
//  * - admin -> true
//  * - manager -> true if createdBy in allowedCreators (manager or manager's teachers)
//  * - teacher -> true if createdBy == teacher._id
//  * - student -> true if quiz.active AND:
//  *      - if quiz.classIds non-empty => student's classId must be included
//  *      - else => allow if quiz.createdBy matches student's createdBy
//  */
// async function canUserAccessQuiz(user, quiz) {
//   const role = (user && (user.role || '') + '').toLowerCase();
//   if (role === 'admin') return true;
//   if (!quiz) return false;

//   if (role === 'teacher') {
//     return String(quiz.createdBy) === String(user._id);
//   }

//   if (role === 'manager') {
//     const allowed = await allowedCreatorsForUser(user); // array or null
//     if (!allowed) return true;
//     return allowed.includes(String(quiz.createdBy));
//   }

//   if (role === 'student') {
//     if (!quiz.active) return false;
//     try {
//       const studentDoc = await Student.findById(String(user._id)).lean().exec().catch(()=>null);
//       if (!studentDoc) return false;
//       const sClass = studentDoc.classId ? String(studentDoc.classId) : null;

//       // If the quiz targets specific classes, require student's class to be in the list.
//       if (Array.isArray(quiz.classIds) && quiz.classIds.length) {
//         if (sClass && quiz.classIds.map(String).includes(String(sClass))) return true;
//         // otherwise deny (no fallback to createdBy when quiz has class restrictions)
//         return false;
//       }

//       // If the quiz has NO class restriction, allow only when quiz.createdBy matches student's createdBy
//       if (studentDoc.createdBy && String(quiz.createdBy) === String(studentDoc.createdBy)) return true;

//       return false;
//     } catch (e) {
//       return false;
//     }
//   }

//   // default deny
//   return false;
// }


// // ---------- DEBUG endpoint ----------
// router.get('/_debug', requireAuth, async (req, res) => {
//   try {
//     return res.json({ ok: true, user: req.user || null });
//   } catch (err) {
//     console.error('debug route error', err);
//     return res.status(500).json({ ok: false, error: String(err) });
//   }
// });

// // GET / - list quizzes (applies role-based visibility)
// router.get('/', requireAuth, async (req, res) => {
//   try {
//     const user = req.user || {};
//     const role = (user.role || '').toLowerCase();

//     const q = {};

//     // restrict by school if available
//     if (user.schoolId) q.schoolId = user.schoolId;

//     // Build creator restriction depending on role
//     if (role === 'teacher') {
//       q.createdBy = toObjectId(user._id) || String(user._id || '');
//     } else if (role === 'manager') {
//       // manager sees their own quizzes and quizzes created by teachers they created
//       const allowed = await allowedCreatorsForUser(user); // array
//       if (Array.isArray(allowed) && allowed.length) q.createdBy = { $in: allowed.map(id => toObjectId(id) || id) };
//     } else if (role === 'student') {
//       // students only see active quizzes targeted to their class — we'll narrow by class below after we fetch student
//       q.active = true;
//     }
//     // admins: no createdBy restriction

//     // If student, restrict by class membership (if student belongs to class)
//     if (role === 'student') {
//       const stud = await Student.findById(String(user._id)).lean().catch(()=>null);
//       if (!stud) return res.status(403).json({ ok: false, error: 'Forbidden' });
//       const sClass = stud.classId ? String(stud.classId) : null;
//       if (sClass) {
//         // allow quizzes that either target this class OR were created by the student's creator (student.createdBy)
//         q.$or = [
//           { classIds: { $in: [sClass] } },
//         ];
//         if (stud.createdBy) q.$or.push({ createdBy: toObjectId(stud.createdBy) || String(stud.createdBy) });
//       } else {
//         // student has no class assigned: allow only quizzes created by their creator
//         if (stud.createdBy) q.createdBy = toObjectId(stud.createdBy) || String(stud.createdBy);
//         else {
//           // no class and no creator -> empty set
//           q._id = { $exists: false };
//         }
//       }
//     }

//     const quizzes = await Quiz.find(q).sort({ createdAt: -1 }).lean().exec();
//     return res.json({ ok: true, quizzes });
//   } catch (err) {
//     console.error('quizzes.list error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// // POST / - create quiz
// router.post('/', requireAuth, async (req, res) => {
//   try {
//     if (!isPrivileged(req.user)) return res.status(403).json({ ok: false, error: 'Forbidden' });
//     const body = req.body || {};
//     const title = (body.title || '').toString().trim();
//     if (!title) return res.status(400).json({ ok: false, error: 'Title required' });

//     const classIds = Array.isArray(body.classIds)
//       ? body.classIds.map(String)
//       : (body.classIds ? String(body.classIds).split(',').map(x => x.trim()).filter(Boolean) : []);

//     const questionsIn = Array.isArray(body.questions) ? body.questions : [];
//     const questions = [];
//     for (const q of questionsIn) {
//       if (!q || !q.prompt) continue;
//       const type = String(q.type || 'direct');
//       const points = Number(q.points || 1) || 1;
//       let choices = undefined;
//       if (type === 'multiple' && Array.isArray(q.choices)) {
//         choices = q.choices.map(c => ({ id: c.id || (Date.now().toString(36) + Math.random()), text: String(c.text || '') }));
//       }
//       let correctAnswer = null;
//       if (typeof q.correctAnswer !== 'undefined' && q.correctAnswer !== null) {
//         correctAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(x => String(x)) : String(q.correctAnswer);
//       }
//       questions.push({ type, prompt: String(q.prompt || ''), choices, correctAnswer, points });
//     }

//     const createdBy = toObjectId(req.user._id) || String(req.user._id || req.user.id || '');
//     const quiz = new Quiz({
//       title,
//       description: body.description || '',
//       classIds,
//       createdBy,
//       createdByName: req.user.fullname || req.user.name || '',
//       questions,
//       durationMinutes: Number(body.durationMinutes || 20),
//       extraTimeMinutes: Number(body.extraTimeMinutes || 0),
//       randomizeQuestions: !!body.randomizeQuestions,
//       active: !!body.active,
//       schoolId: req.user.schoolId || null,
//       createdAt: new Date(),
//       updatedAt: new Date()
//     });

//     await quiz.save();
//     return res.json({ ok: true, quiz });
//   } catch (err) {
//     console.error('quizzes.create error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// // GET /:id - single quiz (strip correct answers if not privileged)
// // additionally enforce access
// router.get('/:id', requireAuth, async (req, res) => {
//   try {
//     const { id } = req.params;
//     if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });

//     const quiz = await Quiz.findById(id).lean().exec();
//     if (!quiz) return res.status(404).json({ ok: false, error: 'Not found' });

//     const allowed = await canUserAccessQuiz(req.user, quiz);
//     if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     const privileged = isPrivileged(req.user) || (String(quiz.createdBy) === String(req.user._id));
//     const safe = { ...quiz };
//     if (!privileged) {
//       safe.questions = (safe.questions || []).map(q => ({ _id: q._id, type: q.type, prompt: q.prompt, choices: q.choices || [], points: q.points || 1 }));
//     }
//     return res.json({ ok: true, quiz: safe });
//   } catch (err) {
//     console.error('quizzes.get error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// // PATCH /:id - update quiz
// router.patch('/:id', requireAuth, async (req, res) => {
//   try {
//     const { id } = req.params;
//     if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });

//     const quiz = await Quiz.findById(id).exec();
//     if (!quiz) return res.status(404).json({ ok: false, error: 'Not found' });

//     if (!isPrivileged(req.user) && String(quiz.createdBy) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     const body = req.body || {};
//     if (typeof body.title !== 'undefined') quiz.title = String(body.title || quiz.title);
//     if (typeof body.description !== 'undefined') quiz.description = String(body.description || quiz.description);
//     if (typeof body.classIds !== 'undefined') {
//       quiz.classIds = Array.isArray(body.classIds) ? body.classIds.map(String) : (body.classIds ? String(body.classIds).split(',').map(x=>x.trim()).filter(Boolean) : []);
//     }
//     if (typeof body.questions !== 'undefined' && Array.isArray(body.questions)) {
//       const normalized = [];
//       for (const q of body.questions) {
//         if (!q || !q.prompt) continue;
//         const type = String(q.type || 'direct');
//         const points = Number(q.points || 1) || 1;
//         let choices = undefined;
//         if (type === 'multiple' && Array.isArray(q.choices)) choices = q.choices.map(c => ({ id: c.id || (Date.now().toString(36) + Math.random()), text: String(c.text || '') }));
//         let correctAnswer = null;
//         if (typeof q.correctAnswer !== 'undefined' && q.correctAnswer !== null) correctAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(x => String(x)) : String(q.correctAnswer);
//         normalized.push({ type, prompt: String(q.prompt || ''), choices, correctAnswer, points });
//       }
//       quiz.questions = normalized;
//     }
//     if (typeof body.durationMinutes !== 'undefined') quiz.durationMinutes = Number(body.durationMinutes || quiz.durationMinutes || 20);
//     if (typeof body.extraTimeMinutes !== 'undefined') quiz.extraTimeMinutes = Number(body.extraTimeMinutes || quiz.extraTimeMinutes || 0);
//     if (typeof body.randomizeQuestions !== 'undefined') quiz.randomizeQuestions = !!body.randomizeQuestions;
//     if (typeof body.active !== 'undefined') quiz.active = !!body.active;

//     quiz.updatedAt = new Date();
//     await quiz.save();
//     return res.json({ ok: true, quiz });
//   } catch (err) {
//     console.error('quizzes.patch error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// // DELETE /:id
// router.delete('/:id', requireAuth, async (req, res) => {
//   try {
//     const { id } = req.params;
//     if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });

//     const quiz = await Quiz.findById(id).exec();
//     if (!quiz) return res.json({ ok: true });

//     if (!isPrivileged(req.user) && String(quiz.createdBy) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     await Quiz.deleteOne({ _id: id });
//     await QuizAttempt.deleteMany({ quizId: id }).catch(()=>{});
//     return res.json({ ok: true });
//   } catch (err) {
//     console.error('quizzes.delete error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// // POST /:id/start  -> create or resume attempt
// // POST /:id/start  -> create or resume attempt
// router.post('/:id/start', requireAuth, async (req, res) => {
//   try {
//     const { id } = req.params;
//     if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });

//     const quiz = await Quiz.findById(id).lean().exec();
//     if (!quiz) return res.status(404).json({ ok: false, error: 'Quiz not found' });

//     const role = (req.user.role || '').toLowerCase();
//     if (role !== 'student' && !isPrivileged(req.user)) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     // initial access check using canonical function
//     const allowed = await canUserAccessQuiz(req.user, quiz);
//     if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     if (!quiz.active) return res.status(400).json({ ok: false, error: 'Quiz not active' });

//     const studentId = String(req.user._id);
//     const studentDoc = await Student.findById(studentId).lean().catch(() => null);

//     // Defensive re-check: ensure student is actually allowed for this quiz.
//     // canUserAccessQuiz already implements the required policy. This extra check prevents bypasses.
//     const stillAllowed = await canUserAccessQuiz(req.user, quiz);
//     if (!stillAllowed) {
//       return res.status(403).json({ ok: false, error: 'You are not enrolled for this quiz' });
//     }

//     // Enforce strict class-only access when quiz.classIds is non-empty.
//     // If quiz.classIds is present, the student's classId must be included.
//     // If quiz.classIds is empty, only allow if student's createdBy matches quiz.createdBy.
//     if (Array.isArray(quiz.classIds) && quiz.classIds.length) {
//       const sClass = studentDoc ? (studentDoc.classId ? String(studentDoc.classId) : null) : null;
//       if (!sClass || !quiz.classIds.map(String).includes(String(sClass))) {
//         return res.status(403).json({ ok: false, error: 'You are not enrolled for this quiz' });
//       }
//     } else {
//       // No class restriction on the quiz -> require creator relationship
//       if (!(studentDoc && studentDoc.createdBy && String(studentDoc.createdBy) === String(quiz.createdBy))) {
//         return res.status(403).json({ ok: false, error: 'You are not enrolled for this quiz' });
//       }
//     }

//     const existing = await QuizAttempt.findOne({ quizId: id, studentId }).lean().exec();
//     if (existing && existing.submitted) return res.status(400).json({ ok: false, error: 'You already submitted this quiz' });
//     if (existing && !existing.submitted) return res.json({ ok: true, attempt: existing });

//     const questionsSnapshot = (quiz.questions || []).map(q => ({
//       _id: q._id,
//       type: q.type,
//       prompt: q.prompt,
//       choices: q.choices || [],
//       correctAnswer: q.correctAnswer,
//       points: q.points || 1
//     }));
//     let questionOrder = questionsSnapshot.map(q => String(q._id));
//     if (quiz.randomizeQuestions) {
//       for (let i = questionOrder.length - 1; i > 0; i--) {
//         const j = Math.floor(Math.random() * (i + 1));
//         [questionOrder[i], questionOrder[j]] = [questionOrder[j], questionOrder[i]];
//       }
//     }

//     const attemptDoc = new QuizAttempt({
//       quizId: id,
//       studentId,
//       studentFullname: req.user.fullname || (studentDoc && studentDoc.fullname) || '',
//       studentNumber: (studentDoc && (studentDoc.numberId || studentDoc.number)) || '',
//       classId: (studentDoc && studentDoc.classId) ? studentDoc.classId : null,
//       questionOrder,
//       questions: questionsSnapshot,
//       answers: [],
//       startedAt: new Date(),
//       durationMinutes: Number(quiz.durationMinutes || 20),
//       extraTimeMinutes: Number(quiz.extraTimeMinutes || 0),
//       score: 0,
//       maxScore: questionsSnapshot.reduce((s, q) => s + (Number(q.points || 1)), 0),
//       submitted: false,
//       createdAt: new Date(),
//       updatedAt: new Date()
//     });

//     await attemptDoc.save();
//     const attempt = await QuizAttempt.findById(attemptDoc._id).lean().exec();
//     return res.json({ ok: true, attempt });
//   } catch (err) {
//     console.error('quizzes.start error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });


// // PATCH /:id/attempts/:attemptId  -> save progress or teacher add extraTimeMinutes
// router.patch('/:id/attempts/:attemptId', requireAuth, async (req, res) => {
//   try {
//     const { id, attemptId } = req.params;
//     if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(attemptId)) return res.status(400).json({ ok: false, error: 'Invalid id' });

//     const attempt = await QuizAttempt.findById(attemptId).exec();
//     if (!attempt) return res.status(404).json({ ok: false, error: 'Attempt not found' });

//     const role = (req.user.role || '').toLowerCase();
//     if (!isPrivileged(req.user) && String(attempt.studentId) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     const body = req.body || {};
//     if (Array.isArray(body.answers)) {
//       for (const a of body.answers) {
//         if (!a || !a.questionId) continue;
//         const qid = String(a.questionId);
//         const existing = attempt.answers.find(x => String(x.questionId) === qid);
//         if (existing) existing.answer = a.answer;
//         else attempt.answers.push({ questionId: qid, answer: a.answer, pointsAwarded: 0 });
//       }
//     }

//     if (typeof body.extraTimeMinutes !== 'undefined' && isPrivileged(req.user)) {
//       attempt.extraTimeMinutes = Number(body.extraTimeMinutes || attempt.extraTimeMinutes || 0);
//     }

//     attempt.updatedAt = new Date();
//     await attempt.save();
//     const updated = await QuizAttempt.findById(attempt._id).lean().exec();
//     return res.json({ ok: true, attempt: updated });
//   } catch (err) {
//     console.error('quizzes.patchAttempt error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// // POST /:id/attempts/:attemptId/submit -> grade and mark submitted
// router.post('/:id/attempts/:attemptId/submit', requireAuth, async (req, res) => {
//   try {
//     const { id, attemptId } = req.params;
//     if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(attemptId)) return res.status(400).json({ ok: false, error: 'Invalid id' });

//     const attempt = await QuizAttempt.findById(attemptId).exec();
//     if (!attempt) return res.status(404).json({ ok: false, error: 'Attempt not found' });

//     const role = (req.user.role || '').toLowerCase();
//     if (!isPrivileged(req.user) && String(attempt.studentId) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     if (attempt.submitted) return res.status(400).json({ ok: false, error: 'Already submitted' });

//     const body = req.body || {};
//     if (Array.isArray(body.answers)) {
//       for (const a of body.answers) {
//         if (!a || !a.questionId) continue;
//         const qid = String(a.questionId);
//         const existing = attempt.answers.find(x => String(x.questionId) === qid);
//         if (existing) existing.answer = a.answer;
//         else attempt.answers.push({ questionId: qid, answer: a.answer, pointsAwarded: 0 });
//       }
//     }

//     // grade
//     let totalScore = 0;
//     let maxScore = 0;
//     const qmap = {};
//     (attempt.questions || []).forEach(q => { qmap[String(q._id)] = q; maxScore += Number(q.points || 1); });

//     attempt.answers = attempt.answers || [];
//     for (const a of attempt.answers) {
//       const q = qmap[String(a.questionId)];
//       if (!q) { a.pointsAwarded = 0; continue; }
//       const awarded = computePointsForQuestion(q, a.answer);
//       a.pointsAwarded = awarded;
//       totalScore += awarded;
//     }

//     attempt.score = totalScore;
//     attempt.maxScore = maxScore;
//     attempt.submitted = true;
//     attempt.submittedAt = new Date();
//     attempt.updatedAt = new Date();
//     await attempt.save();
//     const saved = await QuizAttempt.findById(attempt._id).lean().exec();
//     return res.json({ ok: true, attempt: saved });
//   } catch (err) {
//     console.error('quizzes.submit error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// // GET /:id/results - list attempts for quiz (privileged or creator)
// router.get('/:id/results', requireAuth, async (req, res) => {
//   try {
//     const { id } = req.params;
//     if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
//     const quiz = await Quiz.findById(id).lean().exec();
//     if (!quiz) return res.status(404).json({ ok: false, error: 'Quiz not found' });

//     const allowed = await canUserAccessQuiz(req.user, quiz);
//     if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     // Only privileged (teacher/manager/admin) or creator may view results
//     const role = (req.user.role || '').toLowerCase();
//     const privilegedOrCreator = isPrivileged(req.user) || String(quiz.createdBy) === String(req.user._id);
//     if (!privilegedOrCreator) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     const attempts = await QuizAttempt.find({ quizId: id }).sort({ submitted: -1, createdAt: -1 }).lean().exec();
//     const out = attempts.map(a => ({
//       _id: a._id,
//       studentId: a.studentId,
//       studentFullname: a.studentFullname,
//       score: a.score || 0,
//       maxScore: a.maxScore || 0,
//       submitted: !!a.submitted,
//       startedAt: a.startedAt,
//       updatedAt: a.updatedAt
//     }));
//     return res.json({ ok: true, attempts: out });
//   } catch (err) {
//     console.error('quizzes.resultsList error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// // GET /:id/results/:attemptId - single attempt detail
// router.get('/:id/results/:attemptId', requireAuth, async (req, res) => {
//   try {
//     const { id, attemptId } = req.params;
//     if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(attemptId)) return res.status(400).json({ ok: false, error: 'Invalid id' });

//     const quiz = await Quiz.findById(id).lean().exec();
//     if (!quiz) return res.status(404).json({ ok: false, error: 'Quiz not found' });

//     const attempt = await QuizAttempt.findById(attemptId).lean().exec();
//     if (!attempt) return res.status(404).json({ ok: false, error: 'Attempt not found' });

//     // ensure the user can access the quiz
//     const allowed = await canUserAccessQuiz(req.user, quiz);
//     if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     if (!isPrivileged(req.user) && String(attempt.studentId) !== String(req.user._id) && String(quiz.createdBy) !== String(req.user._id)) {
//       return res.status(403).json({ ok: false, error: 'Forbidden' });
//     }

//     return res.json({ ok: true, attempt, questions: attempt.questions || [] });
//   } catch (err) {
//     console.error('quizzes.getAttempt error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// // PATCH /:id/results/:attemptId/score - privileged update score
// router.patch('/:id/results/:attemptId/score', requireAuth, async (req, res) => {
//   try {
//     const { id, attemptId } = req.params;
//     if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(attemptId)) return res.status(400).json({ ok: false, error: 'Invalid id' });

//     const quiz = await Quiz.findById(id).lean().exec();
//     if (!quiz) return res.status(404).json({ ok: false, error: 'Quiz not found' });

//     // ensure user can access the quiz
//     const allowed = await canUserAccessQuiz(req.user, quiz);
//     if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     if (!isPrivileged(req.user) && String(quiz.createdBy) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

//     const attempt = await QuizAttempt.findById(attemptId).exec();
//     if (!attempt) return res.status(404).json({ ok: false, error: 'Attempt not found' });

//     const body = req.body || {};
//     if (typeof body.score !== 'undefined') attempt.score = Number(body.score || 0);
//     attempt.updatedAt = new Date();
//     await attempt.save();
//     const updated = await QuizAttempt.findById(attempt._id).lean().exec();
//     return res.json({ ok: true, attempt: updated });
//   } catch (err) {
//     console.error('quizzes.patchScore error:', err && err.stack ? err.stack : err);
//     return res.status(500).json({ ok: false, error: 'Server error' });
//   }
// });

// module.exports = router;



const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const requireAuth = require('../middleware/auth'); // this should set req.user
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher'); // used for manager -> teacher relationship
const Class = require('../models/Class'); // to fetch classes for teachers

// helpers
function toObjectId(id) {
  try {
    if (!id) return null;
    if (typeof id === 'object' && id._bsontype === 'ObjectID') return id;
    return mongoose.Types.ObjectId(String(id));
  } catch (e) {
    return null;
  }
}

function levenshtein(a = '', b = '') {
  a = String(a || '').toLowerCase().trim();
  b = String(b || '').toLowerCase().trim();
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function similarityPercent(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a && !b) return 100;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return Math.round(Math.max(0, 1 - dist / maxLen) * 100);
}

function computePointsForQuestion(question, studentAnswer) {
  const full = Number(question.points || 1);
  if (question.type === 'multiple') {
    const correct = question.correctAnswer;
    if (Array.isArray(correct)) {
      if (!Array.isArray(studentAnswer)) return 0;
      const a = studentAnswer.map(String).sort();
      const b = correct.map(String).sort();
      if (a.length !== b.length) return 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return 0;
      return full;
    } else {
      if (!studentAnswer && studentAnswer !== 0) return 0;
      return String(studentAnswer) === String(correct) ? full : 0;
    }
  } else {
    const expected = question.correctAnswer;
    const studentStr = String(studentAnswer || '');
    if (!studentStr) return 0;
    if (Array.isArray(expected)) {
      let best = 0;
      for (const e of expected) best = Math.max(best, similarityPercent(e, studentStr));
      const pct = best;
      if (pct >= 70) return full;
      if (pct >= 50) return Math.round(full / 2);
      if (pct >= 30) return Math.round(full / 3);
      return 0;
    } else {
      const pct = similarityPercent(expected, studentStr);
      if (pct >= 70) return full;
      if (pct >= 50) return Math.round(full / 2);
      if (pct >= 30) return Math.round(full / 3);
      return 0;
    }
  }
}

function isPrivileged(user) {
  const r = (user && (user.role || '') + '').toLowerCase();
  return ['teacher', 'manager', 'admin'].includes(r);
}

/**
 * Build allowed creator IDs for manager role (manager + their teachers).
 * Returns an array of string ids.
 */
async function allowedCreatorsForUser(user) {
  const role = (user && (user.role || '') + '').toLowerCase();
  if (role === 'admin') return null; // null means "no restriction"
  if (role === 'teacher') return [String(user._id)];
  if (role === 'manager') {
    // include manager + teachers created by this manager
    try {
      const teachers = await Teacher.find({ createdBy: String(user._id) }).select('_id').lean().exec();
      const ids = (teachers || []).map(t => String(t._id));
      ids.push(String(user._id));
      return ids;
    } catch (e) {
      return [String(user._id)];
    }
  }
  // students => no creator restriction here; student access is governed by classIds/active and student.createdBy check in finer-grained checks
  return [];
}

/**
 * Check whether a user may access a quiz (returns true/false).
 * - admin -> true
 * - manager -> true if createdBy in allowedCreators (manager or manager's teachers)
 * - teacher -> true if createdBy == teacher._id
 * - student -> true if quiz.active AND:
 *      - if quiz.classIds non-empty => student's classId must be included
 *      - else => allow if quiz.createdBy matches student's createdBy
 */
async function canUserAccessQuiz(user, quiz) {
  const role = (user && (user.role || '') + '').toLowerCase();
  if (role === 'admin') return true;
  if (!quiz) return false;

  if (role === 'teacher') {
    return String(quiz.createdBy) === String(user._id);
  }

  if (role === 'manager') {
    const allowed = await allowedCreatorsForUser(user); // array or null
    if (!allowed) return true;
    return allowed.includes(String(quiz.createdBy));
  }

  if (role === 'student') {
    if (!quiz.active) return false;
    try {
      const studentDoc = await Student.findById(String(user._id)).lean().exec().catch(()=>null);
      if (!studentDoc) return false;
      const sClass = studentDoc.classId ? String(studentDoc.classId) : null;

      // If the quiz targets specific classes, require student's class to be in the list.
      if (Array.isArray(quiz.classIds) && quiz.classIds.length) {
        if (sClass && quiz.classIds.map(String).includes(String(sClass))) return true;
        // otherwise deny (no fallback to createdBy when quiz has class restrictions)
        return false;
      }

      // If the quiz has NO class restriction, allow only when quiz.createdBy matches student's createdBy
      if (studentDoc.createdBy && String(quiz.createdBy) === String(studentDoc.createdBy)) return true;

      return false;
    } catch (e) {
      return false;
    }
  }

  // default deny
  return false;
}


// ---------- DEBUG endpoint ----------
router.get('/_debug', requireAuth, async (req, res) => {
  try {
    return res.json({ ok: true, user: req.user || null });
  } catch (err) {
    console.error('debug route error', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET / - list quizzes (applies role-based visibility)
// Also: when the requester is a teacher, include `classes` key with only the classes that teacher teaches.
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user || {};
    const role = (user.role || '').toLowerCase();

    const q = {};

    // restrict by school if available
    if (user.schoolId) q.schoolId = user.schoolId;

    // Build creator restriction depending on role
    if (role === 'teacher') {
      q.createdBy = toObjectId(user._id) || String(user._id || '');
    } else if (role === 'manager') {
      // manager sees their own quizzes and quizzes created by teachers they created
      const allowed = await allowedCreatorsForUser(user); // array
      if (Array.isArray(allowed) && allowed.length) q.createdBy = { $in: allowed.map(id => toObjectId(id) || id) };
    } else if (role === 'student') {
      // students only see active quizzes targeted to their class — we'll narrow by class below after we fetch student
      q.active = true;
    }
    // admins: no createdBy restriction

    // If student, restrict by class membership (if student belongs to class)
    if (role === 'student') {
      const stud = await Student.findById(String(user._id)).lean().catch(()=>null);
      if (!stud) return res.status(403).json({ ok: false, error: 'Forbidden' });
      const sClass = stud.classId ? String(stud.classId) : null;
      if (sClass) {
        // allow quizzes that either target this class OR were created by the student's creator (student.createdBy)
        q.$or = [
          { classIds: { $in: [sClass] } },
        ];
        if (stud.createdBy) q.$or.push({ createdBy: toObjectId(stud.createdBy) || String(stud.createdBy) });
      } else {
        // student has no class assigned: allow only quizzes created by their creator
        if (stud.createdBy) q.createdBy = toObjectId(stud.createdBy) || String(stud.createdBy);
        else {
          // no class and no creator -> empty set
          q._id = { $exists: false };
        }
      }
    }

    const quizzes = await Quiz.find(q).sort({ createdAt: -1 }).lean().exec();

    // if teacher, include only classes they teach (so frontend can present class list filtered)
    let classesForTeacher = [];
    if (role === 'teacher') {
      try {
        const t = await Teacher.findById(String(user._id)).lean().catch(()=>null);
        if (t) {
          const ids = Array.isArray(t.classIds) ? t.classIds.map(String).filter(Boolean) : [];
          if (ids.length) classesForTeacher = await Class.find({ _id: { $in: ids } }).sort({ name: 1 }).lean().exec();
        }
      } catch (e) {
        console.warn('failed to load teacher classes', e && e.message ? e.message : e);
      }
    }

    return res.json({ ok: true, quizzes, classes: classesForTeacher });
  } catch (err) {
    console.error('quizzes.list error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST / - create quiz
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!isPrivileged(req.user)) return res.status(403).json({ ok: false, error: 'Forbidden' });
    const body = req.body || {};
    const title = (body.title || '').toString().trim();
    if (!title) return res.status(400).json({ ok: false, error: 'Title required' });

    const classIds = Array.isArray(body.classIds)
      ? body.classIds.map(String)
      : (body.classIds ? String(body.classIds).split(',').map(x => x.trim()).filter(Boolean) : []);

    const questionsIn = Array.isArray(body.questions) ? body.questions : [];
    const questions = [];
    for (const q of questionsIn) {
      if (!q || !q.prompt) continue;
      const type = String(q.type || 'direct');
      const points = Number(q.points || 1) || 1;
      let choices = undefined;
      if (type === 'multiple' && Array.isArray(q.choices)) {
        choices = q.choices.map(c => ({ id: c.id || (Date.now().toString(36) + Math.random()), text: String(c.text || '') }));
      }
      let correctAnswer = null;
      if (typeof q.correctAnswer !== 'undefined' && q.correctAnswer !== null) {
        correctAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(x => String(x)) : String(q.correctAnswer);
      }
      questions.push({ type, prompt: String(q.prompt || ''), choices, correctAnswer, points });
    }

    const createdBy = toObjectId(req.user._id) || String(req.user._id || req.user.id || '');
    const quiz = new Quiz({
      title,
      description: body.description || '',
      classIds,
      createdBy,
      createdByName: req.user.fullname || req.user.name || '',
      questions,
      durationMinutes: Number(body.durationMinutes || 20),
      extraTimeMinutes: Number(body.extraTimeMinutes || 0),
      randomizeQuestions: !!body.randomizeQuestions,
      active: !!body.active,
      schoolId: req.user.schoolId || null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await quiz.save();
    return res.json({ ok: true, quiz });
  } catch (err) {
    console.error('quizzes.create error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /:id - single quiz (strip correct answers if not privileged)
// additionally enforce access
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const quiz = await Quiz.findById(id).lean().exec();
    if (!quiz) return res.status(404).json({ ok: false, error: 'Not found' });

    const allowed = await canUserAccessQuiz(req.user, quiz);
    if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const privileged = isPrivileged(req.user) || (String(quiz.createdBy) === String(req.user._id));
    const safe = { ...quiz };
    if (!privileged) {
      safe.questions = (safe.questions || []).map(q => ({ _id: q._id, type: q.type, prompt: q.prompt, choices: q.choices || [], points: q.points || 1 }));
    }
    return res.json({ ok: true, quiz: safe });
  } catch (err) {
    console.error('quizzes.get error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// PATCH /:id - update quiz
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const quiz = await Quiz.findById(id).exec();
    if (!quiz) return res.status(404).json({ ok: false, error: 'Not found' });

    if (!isPrivileged(req.user) && String(quiz.createdBy) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const body = req.body || {};
    if (typeof body.title !== 'undefined') quiz.title = String(body.title || quiz.title);
    if (typeof body.description !== 'undefined') quiz.description = String(body.description || quiz.description);
    if (typeof body.classIds !== 'undefined') {
      quiz.classIds = Array.isArray(body.classIds) ? body.classIds.map(String) : (body.classIds ? String(body.classIds).split(',').map(x=>x.trim()).filter(Boolean) : []);
    }
    if (typeof body.questions !== 'undefined' && Array.isArray(body.questions)) {
      const normalized = [];
      for (const q of body.questions) {
        if (!q || !q.prompt) continue;
        const type = String(q.type || 'direct');
        const points = Number(q.points || 1) || 1;
        let choices = undefined;
        if (type === 'multiple' && Array.isArray(q.choices)) choices = q.choices.map(c => ({ id: c.id || (Date.now().toString(36) + Math.random()), text: String(c.text || '') }));
        let correctAnswer = null;
        if (typeof q.correctAnswer !== 'undefined' && q.correctAnswer !== null) correctAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(x => String(x)) : String(q.correctAnswer);
        normalized.push({ type, prompt: String(q.prompt || ''), choices, correctAnswer, points });
      }
      quiz.questions = normalized;
    }
    if (typeof body.durationMinutes !== 'undefined') quiz.durationMinutes = Number(body.durationMinutes || quiz.durationMinutes || 20);
    if (typeof body.extraTimeMinutes !== 'undefined') quiz.extraTimeMinutes = Number(body.extraTimeMinutes || quiz.extraTimeMinutes || 0);
    if (typeof body.randomizeQuestions !== 'undefined') quiz.randomizeQuestions = !!body.randomizeQuestions;
    if (typeof body.active !== 'undefined') quiz.active = !!body.active;

    quiz.updatedAt = new Date();
    await quiz.save();
    return res.json({ ok: true, quiz });
  } catch (err) {
    console.error('quizzes.patch error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// DELETE /:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const quiz = await Quiz.findById(id).exec();
    if (!quiz) return res.json({ ok: true });

    if (!isPrivileged(req.user) && String(quiz.createdBy) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    await Quiz.deleteOne({ _id: id });
    await QuizAttempt.deleteMany({ quizId: id }).catch(()=>{});
    return res.json({ ok: true });
  } catch (err) {
    console.error('quizzes.delete error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /:id/start  -> create or resume attempt
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const quiz = await Quiz.findById(id).lean().exec();
    if (!quiz) return res.status(404).json({ ok: false, error: 'Quiz not found' });

    const role = (req.user.role || '').toLowerCase();
    if (role !== 'student' && !isPrivileged(req.user)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    // initial access check using canonical function
    const allowed = await canUserAccessQuiz(req.user, quiz);
    if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

    if (!quiz.active) return res.status(400).json({ ok: false, error: 'Quiz not active' });

    const studentId = String(req.user._id);
    const studentDoc = await Student.findById(studentId).lean().catch(() => null);

    // Defensive re-check: ensure student is actually allowed for this quiz.
    // canUserAccessQuiz already implements the required policy. This extra check prevents bypasses.
    const stillAllowed = await canUserAccessQuiz(req.user, quiz);
    if (!stillAllowed) {
      return res.status(403).json({ ok: false, error: 'You are not enrolled for this quiz' });
    }

    // Enforce strict class-only access when quiz.classIds is non-empty.
    // If quiz.classIds is present, the student's classId must be included.
    // If quiz.classIds is empty, only allow if student's createdBy matches quiz.createdBy.
    if (Array.isArray(quiz.classIds) && quiz.classIds.length) {
      const sClass = studentDoc ? (studentDoc.classId ? String(studentDoc.classId) : null) : null;
      if (!sClass || !quiz.classIds.map(String).includes(String(sClass))) {
        return res.status(403).json({ ok: false, error: 'You are not enrolled for this quiz' });
      }
    } else {
      // No class restriction on the quiz -> require creator relationship
      if (!(studentDoc && studentDoc.createdBy && String(studentDoc.createdBy) === String(quiz.createdBy))) {
        return res.status(403).json({ ok: false, error: 'You are not enrolled for this quiz' });
      }
    }

    const existing = await QuizAttempt.findOne({ quizId: id, studentId }).lean().exec();
    if (existing && existing.submitted) return res.status(400).json({ ok: false, error: 'You already submitted this quiz' });
    if (existing && !existing.submitted) return res.json({ ok: true, attempt: existing });

    const questionsSnapshot = (quiz.questions || []).map(q => ({
      _id: q._id,
      type: q.type,
      prompt: q.prompt,
      choices: q.choices || [],
      correctAnswer: q.correctAnswer,
      points: q.points || 1
    }));
    let questionOrder = questionsSnapshot.map(q => String(q._id));
    if (quiz.randomizeQuestions) {
      for (let i = questionOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questionOrder[i], questionOrder[j]] = [questionOrder[j], questionOrder[i]];
      }
    }

    const attemptDoc = new QuizAttempt({
      quizId: id,
      studentId,
      studentFullname: req.user.fullname || (studentDoc && studentDoc.fullname) || '',
      studentNumber: (studentDoc && (studentDoc.numberId || studentDoc.number)) || '',
      classId: (studentDoc && studentDoc.classId) ? studentDoc.classId : null,
      questionOrder,
      questions: questionsSnapshot,
      answers: [],
      startedAt: new Date(),
      durationMinutes: Number(quiz.durationMinutes || 20),
      extraTimeMinutes: Number(quiz.extraTimeMinutes || 0),
      score: 0,
      maxScore: questionsSnapshot.reduce((s, q) => s + (Number(q.points || 1)), 0),
      submitted: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await attemptDoc.save();
    const attempt = await QuizAttempt.findById(attemptDoc._id).lean().exec();
    return res.json({ ok: true, attempt });
  } catch (err) {
    console.error('quizzes.start error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// PATCH /:id/attempts/:attemptId  -> save progress or teacher add extraTimeMinutes
router.patch('/:id/attempts/:attemptId', requireAuth, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(attemptId)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const attempt = await QuizAttempt.findById(attemptId).exec();
    if (!attempt) return res.status(404).json({ ok: false, error: 'Attempt not found' });

    const role = (req.user.role || '').toLowerCase();
    if (!isPrivileged(req.user) && String(attempt.studentId) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const body = req.body || {};
    if (Array.isArray(body.answers)) {
      for (const a of body.answers) {
        if (!a || !a.questionId) continue;
        const qid = String(a.questionId);
        const existing = attempt.answers.find(x => String(x.questionId) === qid);
        if (existing) existing.answer = a.answer;
        else attempt.answers.push({ questionId: qid, answer: a.answer, pointsAwarded: 0 });
      }
    }

    if (typeof body.extraTimeMinutes !== 'undefined' && isPrivileged(req.user)) {
      attempt.extraTimeMinutes = Number(body.extraTimeMinutes || attempt.extraTimeMinutes || 0);
    }

    attempt.updatedAt = new Date();
    await attempt.save();
    const updated = await QuizAttempt.findById(attempt._id).lean().exec();
    return res.json({ ok: true, attempt: updated });
  } catch (err) {
    console.error('quizzes.patchAttempt error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /:id/attempts/:attemptId/submit -> grade and mark submitted
router.post('/:id/attempts/:attemptId/submit', requireAuth, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(attemptId)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const attempt = await QuizAttempt.findById(attemptId).exec();
    if (!attempt) return res.status(404).json({ ok: false, error: 'Attempt not found' });

    const role = (req.user.role || '').toLowerCase();
    if (!isPrivileged(req.user) && String(attempt.studentId) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    if (attempt.submitted) return res.status(400).json({ ok: false, error: 'Already submitted' });

    const body = req.body || {};
    if (Array.isArray(body.answers)) {
      for (const a of body.answers) {
        if (!a || !a.questionId) continue;
        const qid = String(a.questionId);
        const existing = attempt.answers.find(x => String(x.questionId) === qid);
        if (existing) existing.answer = a.answer;
        else attempt.answers.push({ questionId: qid, answer: a.answer, pointsAwarded: 0 });
      }
    }

    // grade
    let totalScore = 0;
    let maxScore = 0;
    const qmap = {};
    (attempt.questions || []).forEach(q => { qmap[String(q._id)] = q; maxScore += Number(q.points || 1); });

    attempt.answers = attempt.answers || [];
    for (const a of attempt.answers) {
      const q = qmap[String(a.questionId)];
      if (!q) { a.pointsAwarded = 0; continue; }
      const awarded = computePointsForQuestion(q, a.answer);
      a.pointsAwarded = awarded;
      totalScore += awarded;
    }

    attempt.score = totalScore;
    attempt.maxScore = maxScore;
    attempt.submitted = true;
    attempt.submittedAt = new Date();
    attempt.updatedAt = new Date();
    await attempt.save();
    const saved = await QuizAttempt.findById(attempt._id).lean().exec();
    return res.json({ ok: true, attempt: saved });
  } catch (err) {
    console.error('quizzes.submit error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /:id/results - list attempts for quiz (privileged or creator)
router.get('/:id/results', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const quiz = await Quiz.findById(id).lean().exec();
    if (!quiz) return res.status(404).json({ ok: false, error: 'Quiz not found' });

    const allowed = await canUserAccessQuiz(req.user, quiz);
    if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

    // Only privileged (teacher/manager/admin) or creator may view results
    const role = (req.user.role || '').toLowerCase();
    const privilegedOrCreator = isPrivileged(req.user) || String(quiz.createdBy) === String(req.user._id);
    if (!privilegedOrCreator) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const attempts = await QuizAttempt.find({ quizId: id }).sort({ submitted: -1, createdAt: -1 }).lean().exec();
    const out = attempts.map(a => ({
      _id: a._id,
      studentId: a.studentId,
      studentFullname: a.studentFullname,
      score: a.score || 0,
      maxScore: a.maxScore || 0,
      submitted: !!a.submitted,
      startedAt: a.startedAt,
      updatedAt: a.updatedAt
    }));
    return res.json({ ok: true, attempts: out });
  } catch (err) {
    console.error('quizzes.resultsList error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /:id/results/:attemptId - single attempt detail
router.get('/:id/results/:attemptId', requireAuth, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(attemptId)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const quiz = await Quiz.findById(id).lean().exec();
    if (!quiz) return res.status(404).json({ ok: false, error: 'Quiz not found' });

    const attempt = await QuizAttempt.findById(attemptId).lean().exec();
    if (!attempt) return res.status(404).json({ ok: false, error: 'Attempt not found' });

    // ensure the user can access the quiz
    const allowed = await canUserAccessQuiz(req.user, quiz);
    if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

    if (!isPrivileged(req.user) && String(attempt.studentId) !== String(req.user._id) && String(quiz.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    return res.json({ ok: true, attempt, questions: attempt.questions || [] });
  } catch (err) {
    console.error('quizzes.getAttempt error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// PATCH /:id/results/:attemptId/score - privileged update score
router.patch('/:id/results/:attemptId/score', requireAuth, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(attemptId)) return res.status(400).json({ ok: false, error: 'Invalid id' });

    const quiz = await Quiz.findById(id).lean().exec();
    if (!quiz) return res.status(404).json({ ok: false, error: 'Quiz not found' });

    // ensure user can access the quiz
    const allowed = await canUserAccessQuiz(req.user, quiz);
    if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });

    if (!isPrivileged(req.user) && String(quiz.createdBy) !== String(req.user._id)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const attempt = await QuizAttempt.findById(attemptId).exec();
    if (!attempt) return res.status(404).json({ ok: false, error: 'Attempt not found' });

    const body = req.body || {};
    if (typeof body.score !== 'undefined') attempt.score = Number(body.score || 0);
    attempt.updatedAt = new Date();
    await attempt.save();
    const updated = await QuizAttempt.findById(attempt._id).lean().exec();
    return res.json({ ok: true, attempt: updated });
  } catch (err) {
    console.error('quizzes.patchScore error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
