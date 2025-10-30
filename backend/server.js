// // backend/server.js
// 'use strict';

// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const compression = require('compression');
// const fs = require('fs');
// const path = require('path');
// const http = require('http');
// const cron = require('node-cron');
// require('dotenv').config();

// // -----------------------------
// // Route imports (keep your existing route files)
// // -----------------------------
// const authRoutes = require('./routes/auth');
// const studentRoutes = require('./routes/students');
// const teacherRoutes = require('./routes/teachers');
// const classRoutes = require('./routes/classes');
// const subjectRoutes = require('./routes/subjects');
// const parentRoutes = require('./routes/parents');
// const dashboardRoutes = require('./routes/dashboard');
// const votesRouter = require('./routes/votes');
// const exams = require('./routes/exam');
// const quizzes = require('./routes/quizzes');
// const notices = require('./routes/notices');
// const about = require('./routes/about');
// const users = require('./routes/users');
// const reports = require('./routes/reports');
// const attendancesRoute = require('./routes/attendances');
// const profileRoutes = require('./routes/profile');
// const paymentRoutes = require('./routes/payments');
// const financeRoutes = require('./routes/finance');
// const zoomRouter = require('./routes/zoom');
// const helpers = require('./routes/helpers');
// const helpRoutess = require('./routes/help');
// const resultsRouter = require('./routes/results');
// const recurringRoutes = require('./routes/recurring');
// const gamesRouter = require('./routes/games');
// const recycleRouter = require('./routes/recycle');
// const developerRoutes = require('./routes/developer');
// const storiesRouter = require('./routes/stories');

// let chatsRouter = null;
// try { chatsRouter = require('./routes/chats'); } catch (e) { /* optional */ }

// // Models used in cron (optional; guard if not present)
// let RecurringCharge, Charge, Student, Teacher;
// try {
//   RecurringCharge = require('./models/RecurringCharge');
//   Charge = require('./models/Charge');
//   Student = require('./models/Student');
//   Teacher = require('./models/Teacher');
// } catch (e) {
//   console.warn('Cron models not found; recurring job will skip when models are missing.');
// }

// // -----------------------------
// // App init + local uploads folder (NO S3 — local only)
// // -----------------------------
// const app = express();
// const uploadsDir = path.join(__dirname, 'uploads');
// try {
//   if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
// } catch (e) {
//   console.warn('Failed to create uploads dir:', e && e.message);
// }

// // -----------------------------
// // CORS / Allowed origins
// // -----------------------------
// const rawEnvOrigins = String(process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '').trim();
// const envOrigins = rawEnvOrigins.length ? rawEnvOrigins.split(',').map(s => (s || '').trim()).filter(Boolean) : [];
// const defaultDevOrigins = [
//   'http://127.0.0.1:5501',
//   'http://localhost:5501',
//   'http://127.0.0.1:5000',
//   'http://localhost:5000'
// ];
// const allowedOrigins = Array.from(new Set([ ...envOrigins, ...defaultDevOrigins ]));
// const netlifyPreviewRegex = /\.netlify\.app$/i;
// const ALLOW_ALL = process.env.DISABLE_CORS_CHECK === '1' || process.env.DISABLE_CORS_CHECK === 'true';
// const DEBUG_ALLOW_ALL = process.env.DEBUG_ALLOW_ALL_CORS === '1';

// function originIsAllowed(origin) {
//   if (!origin) return true;
//   if (ALLOW_ALL) return true;
//   if (allowedOrigins.indexOf(origin) !== -1) return true;
//   if (netlifyPreviewRegex.test(origin)) return true;
//   return false;
// }

// // Short middleware that sets CORS headers and handles OPTIONS preflight
// app.use((req, res, next) => {
//   const origin = req.headers.origin;
//   if (origin && originIsAllowed(origin)) {
//     res.setHeader('Access-Control-Allow-Origin', origin);
//     res.setHeader('Vary', 'Origin');
//     res.setHeader('Access-Control-Allow-Credentials', 'true');
//     res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept');
//   }
//   if (req.method === 'OPTIONS') {
//     return res.status(origin && originIsAllowed(origin) ? 204 : 403).end();
//   }
//   next();
// });

// const corsOptions = {
//   origin: (origin, cb) => {
//     if (!origin) return cb(null, true);
//     if (originIsAllowed(origin)) return cb(null, true);
//     return cb(new Error('CORS origin denied: ' + origin), false);
//   },
//   credentials: true,
//   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//   allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept']
// };

// if (DEBUG_ALLOW_ALL) {
//   console.warn('DEBUG_ALLOW_ALL_CORS enabled — allowing all origins (temporary)');
//   app.use(cors({ origin: true, credentials: true }));
//   app.options('*', cors({ origin: true, credentials: true }));
// } else {
//   app.use(cors(corsOptions));
//   app.options('*', cors(corsOptions));
// }

// // -----------------------------
// // Express middleware
// // -----------------------------
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// app.use(compression());

// // -----------------------------
// // Static uploads (local only)
// // -----------------------------
// // debug logger for uploads — remove or lower verbosity later
// app.use('/uploads', (req, res, next) => {
//   console.log('[uploads] request:', req.method, req.originalUrl);
//   next();
// });

// // serve uploads — set maxAge if desired (ms or string)
// app.use('/uploads', express.static(uploadsDir, { maxAge: '1d' }));
// app.use('/uploads/exams', express.static(path.join(process.cwd(), 'uploads', 'exams')));

// // -----------------------------
// // mount routes
// // -----------------------------
// app.use('/api/auth', authRoutes);
// app.use('/api/students', studentRoutes);
// app.use('/api/teachers', teacherRoutes);
// app.use('/api/classes', classRoutes);
// app.use('/api/subjects', subjectRoutes);
// app.use('/api/parents', parentRoutes);
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/votes', votesRouter);
// app.use('/api/exams', exams);
// app.use('/api/quizzes', quizzes);
// app.use('/api/notices', notices);
// app.use('/api/about', about);
// app.use('/api/users', users);
// app.use('/api/reports', reports);
// app.use('/api/attendances', attendancesRoute);
// app.use('/api/profile', profileRoutes);
// app.use('/api/payments', paymentRoutes);
// app.use('/api/finance', financeRoutes);
// app.use('/api/zoom', zoomRouter);
// app.use('/api/help', helpRoutess);
// app.use('/api', helpers);
// app.use('/api/results', resultsRouter);
// if (chatsRouter) app.use('/api/chats', chatsRouter);
// app.use('/api/recurring', recurringRoutes);
// app.use('/api/recycle', recycleRouter);
// app.use('/api/math-game', gamesRouter);
// app.use('/api/developers', developerRoutes);
// app.use('/api/stories', storiesRouter);

// // root
// app.get('/', (req, res) => res.json({ ok:true, message:'School Manager API' }));

// // -----------------------------
// // global error handler
// // -----------------------------
// app.use((err, req, res, next) => {
//   console.error('Unhandled error:', err && (err.stack || err));
//   if (!res.headersSent) {
//     if (err && String(err.message || '').toLowerCase().includes('cors')) {
//       return res.status(403).json({ ok:false, error: 'CORS error: ' + err.message });
//     }
//     return res.status(500).json({ ok:false, error: err && err.message ? err.message : 'Server error' });
//   }
//   next(err);
// });

// // -----------------------------
// // connect mongodb
// // -----------------------------
// const PORT = Number(process.env.PORT || 5000);
// const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb';
// mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(()=> console.log('MongoDB connected'))
//   .catch(err => console.error('MongoDB connect error', err));

// // -----------------------------
// // create HTTP server & socket.io (token-based socket auth included)
// // -----------------------------
// const server = http.createServer(app);
// const { Server } = require('socket.io');

// const io = new Server(server, {
//   cors: {
//     origin: (origin, cb) => {
//       if (!origin) return cb(null, true);
//       if (ALLOW_ALL) return cb(null, true);
//       if (allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
//       if (netlifyPreviewRegex.test(origin)) return cb(null, true);
//       console.warn('Socket.IO CORS denied for origin:', origin);
//       return cb('origin not allowed', false);
//     },
//     methods: ['GET','POST'],
//     credentials: true
//   },
//   pingInterval: 25000,
//   pingTimeout: 60000
// });

// app.set('io', io);

// // socket auth middleware: expects io({ auth: { token } })
// io.use(async (socket, next) => {
//   try {
//     const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
//     if (!token) return next(new Error('Authentication error: token missing'));
//     const jwt = require('jsonwebtoken');
//     const secret = process.env.JWT_SECRET || 'secret';
//     const payload = await new Promise((resolve, reject) => {
//       jwt.verify(token, secret, (err, decoded) => {
//         if (err) return reject(err);
//         resolve(decoded);
//       });
//     });
//     socket.user = payload || {};
//     return next();
//   } catch (err) {
//     console.warn('Socket auth failed', err && err.message ? err.message : err);
//     return next(new Error('Authentication error'));
//   }
// });

// io.on('connection', (socket) => {
//   const user = socket.user || {};
//   console.log('Socket connected:', socket.id, 'user=', user && (user._id || user.id || user.uid));

//   socket.on('joinClass', (classId) => {
//     try {
//       if (!classId) return;
//       socket.join(`class_${classId}`);
//       socket.to(`class_${classId}`).emit('chat:userJoined', { userId: user._id || user.id || user.uid, fullname: user.fullname || user.name });
//     } catch (e) { console.warn('joinClass error', e); }
//   });

//   socket.on('leaveClass', (classId) => {
//     try {
//       if (!classId) return;
//       socket.leave(`class_${classId}`);
//       socket.to(`class_${classId}`).emit('chat:userLeft', { userId: user._id || user.id || user.uid, fullname: user.fullname || user.name });
//     } catch (e) { console.warn('leaveClass error', e); }
//   });

//   socket.on('typing', ({ classId, typing }) => {
//     try {
//       if (!classId) return;
//       socket.to(`class_${classId}`).emit('chat:typing', { userId: user._id || user.id || user.uid, fullname: user.fullname || user.name, typing: !!typing });
//     } catch (e) { console.warn('typing error', e); }
//   });

//   socket.on('disconnect', (reason) => {
//     console.log('Socket disconnected', socket.id, reason);
//   });
// });

// // Optional zoom socket wiring (safe guard)
// try {
//   const initZoomSocket = require('./socket-zoom');
//   if (typeof initZoomSocket === 'function') {
//     try { initZoomSocket(io); } catch (e) { console.warn('initZoomSocket error', e && e.message ? e.message : e); }
//   }
// } catch (e) { console.warn('socket-zoom module not present or failed to load'); }

// // -----------------------------
// // Recurring cron job (guarded — will skip if models missing)
// // -----------------------------
// const CRON_DISABLED = process.env.DISABLE_RECURRING_CRON === '1' || process.env.DISABLE_RECURRING_CRON === 'true';

// if (!CRON_DISABLED) {
//   cron.schedule('10 0 * * *', async () => {
//     try {
//       console.log('Recurring charges job starting', new Date().toISOString());

//       if (!RecurringCharge || !Charge || !Student || !Teacher) {
//         console.warn('Recurring charge job aborted: required models are not available.');
//         return;
//       }

//       const today = new Date();
//       const dayToday = today.getDate();
//       const recs = await RecurringCharge.find({ active: true }).lean().catch(()=>[]);
//       const applied = [];

//       for (const r of recs || []) {
//         if (r.startDate && new Date(r.startDate) > today) continue;
//         if (r.endDate && new Date(r.endDate) < today) continue;

//         const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
//         const targetDay = Math.min(Number(r.dayOfMonth || 1), daysInMonth);
//         if (targetDay !== dayToday) continue;

//         try {
//           const inc = { $inc: { totalDue: Number(r.amount || 0) } };
//           if (String(r.personType) === 'student') {
//             await Student.findByIdAndUpdate(r.personId, inc).catch((e)=>{ console.warn('Student update failed', e && e.message); });
//           } else {
//             await Teacher.findByIdAndUpdate(r.personId, inc).catch((e)=>{ console.warn('Teacher update failed', e && e.message); });
//           }

//           const ch = new Charge({
//             personType: r.personType,
//             personId: r.personId,
//             amount: Number(r.amount || 0),
//             description: `Recurring charge applied (recurringId=${r._id})`,
//             recurringId: r._id,
//             createdBy: r.createdBy || null,
//             schoolId: r.schoolId || null
//           });
//           await ch.save();
//           applied.push({ recurringId: r._id, personId: r.personId, amount: r.amount });
//         } catch (err) {
//           console.error('Recurring apply failed for', r._id, err);
//         }
//       }

//       console.log('Recurring charges job finished, applied:', applied.length);
//     } catch (err) {
//       console.error('Recurring charges job error', err);
//     }
//   });
// } else {
//   console.log('Recurring cron disabled by DISABLE_RECURRING_CRON');
// }

// // Start server
// server.listen(PORT, () => {
//   console.log('Server running on port', PORT);
//   console.log('Socket.IO ready');
// });

// // Export app, server, and uploadsDir for route code to use
// module.exports = { app, server, uploadsDir };


// // backend/server.js
// 'use strict';

// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const compression = require('compression');
// const fs = require('fs');
// const path = require('path');
// const http = require('http');
// const cron = require('node-cron');
// require('dotenv').config();

// // -----------------------------
// // Route imports (keep your existing route files)
// // -----------------------------
// const authRoutes = require('./routes/auth');
// const studentRoutes = require('./routes/students');
// const teacherRoutes = require('./routes/teachers');
// const classRoutes = require('./routes/classes');
// const subjectRoutes = require('./routes/subjects');
// const parentRoutes = require('./routes/parents');
// const dashboardRoutes = require('./routes/dashboard');
// const votesRouter = require('./routes/votes');
// const exams = require('./routes/exam');
// const quizzes = require('./routes/quizzes');
// const notices = require('./routes/notices');
// const about = require('./routes/about');
// const users = require('./routes/users');
// const reports = require('./routes/reports');
// const attendancesRoute = require('./routes/attendances');
// const profileRoutes = require('./routes/profile');
// const paymentRoutes = require('./routes/payments');
// const financeRoutes = require('./routes/finance');
// const zoomRouter = require('./routes/zoom');
// const helpers = require('./routes/helpers');
// const helpRoutess = require('./routes/help');
// const resultsRouter = require('./routes/results');
// const recurringRoutes = require('./routes/recurring');
// const gamesRouter = require('./routes/games');
// const recycleRouter = require('./routes/recycle');
// const developerRoutes = require('./routes/developer');
// const storiesRouter = require('./routes/stories');

// const coursesRouter = require('./routes/courses');
// const purchasesRouter = require('./routes/purchases');
// const notificationsRouter = require('./routes/notifications');
// const helpmsgsRouter = require('./routes/helpmsgs');
// const recycleCourse = require('./routes/recycleCourse');

// const lessonsRouters = require('./routes/lessons')
// const ratingsRouters = require('./routes/ratings');
// const commentsRouters =require('./routes/comments');
// const uploadsRouter =require('./routes/uploads');

// // serve upload API (multipart / JSON upload handler)

// let chatsRouter = null;
// try { chatsRouter = require('./routes/chats'); } catch (e) { /* optional */ }

// // Models used in cron (optional; guard if not present)
// let RecurringCharge, Charge, Student, Teacher;
// try {
//   RecurringCharge = require('./models/RecurringCharge');
//   Charge = require('./models/Charge');
//   Student = require('./models/Student');
//   Teacher = require('./models/Teacher');
// } catch (e) {
//   console.warn('Cron models not found; recurring job will skip when models are missing.');
// }

// // -----------------------------
// // App init + local uploads folder (NO S3 — local only)
// // Make uploads path configurable via UPLOADS_DIR env var so it can be mounted/persistent in prod
// // -----------------------------
// const app = express();

// const DEFAULT_UPLOADS_DIR = path.join(__dirname, 'uploads');
// const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : DEFAULT_UPLOADS_DIR;

// try {
//   if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
// } catch (e) {
//   console.warn('Failed to create uploads dir:', e && e.message);
// }

// console.log('Uploads directory:', UPLOADS_DIR);

// // -----------------------------
// // CORS / Allowed origins
// // -----------------------------
// const rawEnvOrigins = String(process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '').trim();
// const envOrigins = rawEnvOrigins.length ? rawEnvOrigins.split(',').map(s => (s || '').trim()).filter(Boolean) : [];
// const defaultDevOrigins = [
//   'http://127.0.0.1:5501',
//   'http://localhost:5501',
//   'http://127.0.0.1:5000',
//   'http://localhost:5000'
// ];
// const allowedOrigins = Array.from(new Set([ ...envOrigins, ...defaultDevOrigins ]));
// const netlifyPreviewRegex = /\.netlify\.app$/i;
// const ALLOW_ALL = process.env.DISABLE_CORS_CHECK === '1' || process.env.DISABLE_CORS_CHECK === 'true';
// const DEBUG_ALLOW_ALL = process.env.DEBUG_ALLOW_ALL_CORS === '1';

// function originIsAllowed(origin) {
//   if (!origin) return true;
//   if (ALLOW_ALL) return true;
//   if (allowedOrigins.indexOf(origin) !== -1) return true;
//   if (netlifyPreviewRegex.test(origin)) return true;
//   return false;
// }

// // Short middleware that sets CORS headers and handles OPTIONS preflight
// app.use((req, res, next) => {
//   const origin = req.headers.origin;
//   if (origin && originIsAllowed(origin)) {
//     res.setHeader('Access-Control-Allow-Origin', origin);
//     res.setHeader('Vary', 'Origin');
//     res.setHeader('Access-Control-Allow-Credentials', 'true');
//     res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept');
//   }
//   if (req.method === 'OPTIONS') {
//     return res.status(origin && originIsAllowed(origin) ? 204 : 403).end();
//   }
//   next();
// });

// const corsOptions = {
//   origin: (origin, cb) => {
//     if (!origin) return cb(null, true);
//     if (originIsAllowed(origin)) return cb(null, true);
//     return cb(new Error('CORS origin denied: ' + origin), false);
//   },
//   credentials: true,
//   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//   allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept']
// };

// if (DEBUG_ALLOW_ALL) {
//   console.warn('DEBUG_ALLOW_ALL_CORS enabled — allowing all origins (temporary)');
//   app.use(cors({ origin: true, credentials: true }));
//   app.options('*', cors({ origin: true, credentials: true }));
// } else {
//   app.use(cors(corsOptions));
//   app.options('*', cors(corsOptions));
// }

// // -----------------------------
// // Express middleware
// // -----------------------------
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// app.use(compression());

// // -----------------------------
// // Static uploads (local only)
// // Serve uploads from configurable UPLOADS_DIR. Increase maxAge for caching.
// // Use UPLOADS_DIR/exams for exams if needed.
// // -----------------------------
// app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', etag: true, lastModified: true }));
// app.use('/uploads/exams', express.static(path.join(UPLOADS_DIR, 'exams'), { maxAge: '30d', etag: true, lastModified: true }));

// // -----------------------------
// // mount routes
// // -----------------------------
// app.use('/api/auth', authRoutes);
// app.use('/api/students', studentRoutes);
// app.use('/api/teachers', teacherRoutes);
// app.use('/api/classes', classRoutes);
// app.use('/api/subjects', subjectRoutes);
// app.use('/api/parents', parentRoutes);
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/votes', votesRouter);
// app.use('/api/exams', exams);
// app.use('/api/quizzes', quizzes);
// app.use('/api/notices', notices);
// app.use('/api/about', about);
// app.use('/api/users', users);
// app.use('/api/reports', reports);
// app.use('/api/attendances', attendancesRoute);
// app.use('/api/profile', profileRoutes);
// app.use('/api/payments', paymentRoutes);
// app.use('/api/finance', financeRoutes);
// app.use('/api/zoom', zoomRouter);
// app.use('/api/help', helpRoutess);
// app.use('/api', helpers);
// app.use('/api/results', resultsRouter);
// if (chatsRouter) app.use('/api/chats', chatsRouter);
// app.use('/api/recurring', recurringRoutes);
// app.use('/api/recycle', recycleRouter);
// app.use('/api/math-game', gamesRouter);
// app.use('/api/developers', developerRoutes);
// app.use('/api/stories', storiesRouter);

// app.use('/api/courses',coursesRouter);
// app.use('/api/lessons', lessonsRouters);
// app.use('/api/purchases', purchasesRouter);
// app.use('/api/helpmsgs', helpmsgsRouter );
// app.use('/api/recycle', recycleCourse);
// app.use('/api/notifications', notificationsRouter);
// app.use('/api/ratings',ratingsRouters );
// app.use('/api/comments' , commentsRouters );

// app.use('/api/uploads', uploadsRouter);




// // root
// app.get('/', (req, res) => res.json({ ok:true, message:'School Manager API' }));

// // -----------------------------
// // global error handler
// // -----------------------------
// app.use((err, req, res, next) => {
//   console.error('Unhandled error:', err && (err.stack || err));
//   if (!res.headersSent) {
//     if (err && String(err.message || '').toLowerCase().includes('cors')) {
//       return res.status(403).json({ ok:false, error: 'CORS error: ' + err.message });
//     }
//     return res.status(500).json({ ok:false, error: err && err.message ? err.message : 'Server error' });
//   }
//   next(err);
// });

// // -----------------------------
// // connect mongodb
// // -----------------------------
// const PORT = Number(process.env.PORT || 5000);
// const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb';
// mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(()=> console.log('MongoDB connected'))
//   .catch(err => console.error('MongoDB connect error', err));

// // -----------------------------
// // create HTTP server & socket.io (token-based socket auth included)
// // -----------------------------
// const server = http.createServer(app);
// const { Server } = require('socket.io');

// const io = new Server(server, {
//   cors: {
//     origin: (origin, cb) => {
//       if (!origin) return cb(null, true);
//       if (ALLOW_ALL) return cb(null, true);
//       if (allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
//       if (netlifyPreviewRegex.test(origin)) return cb(null, true);
//       console.warn('Socket.IO CORS denied for origin:', origin);
//       return cb('origin not allowed', false);
//     },
//     methods: ['GET','POST'],
//     credentials: true
//   },
//   pingInterval: 25000,
//   pingTimeout: 60000
// });

// app.set('io', io);

// // socket auth middleware: expects io({ auth: { token } })
// io.use(async (socket, next) => {
//   try {
//     const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
//     if (!token) return next(new Error('Authentication error: token missing'));
//     const jwt = require('jsonwebtoken');
//     const secret = process.env.JWT_SECRET || 'secret';
//     const payload = await new Promise((resolve, reject) => {
//       jwt.verify(token, secret, (err, decoded) => {
//         if (err) return reject(err);
//         resolve(decoded);
//       });
//     });
//     socket.user = payload || {};
//     return next();
//   } catch (err) {
//     console.warn('Socket auth failed', err && err.message ? err.message : err);
//     return next(new Error('Authentication error'));
//   }
// });

// io.on('connection', (socket) => {
//   const user = socket.user || {};
//   console.log('Socket connected:', socket.id, 'user=', user && (user._id || user.id || user.uid));

//   socket.on('joinClass', (classId) => {
//     try {
//       if (!classId) return;
//       socket.join(`class_${classId}`);
//       socket.to(`class_${classId}`).emit('chat:userJoined', { userId: user._id || user.id || user.uid, fullname: user.fullname || user.name });
//     } catch (e) { console.warn('joinClass error', e); }
//   });

//   socket.on('leaveClass', (classId) => {
//     try {
//       if (!classId) return;
//       socket.leave(`class_${classId}`);
//       socket.to(`class_${classId}`).emit('chat:userLeft', { userId: user._id || user.id || user.uid, fullname: user.fullname || user.name });
//     } catch (e) { console.warn('leaveClass error', e); }
//   });

//   socket.on('typing', ({ classId, typing }) => {
//     try {
//       if (!classId) return;
//       socket.to(`class_${classId}`).emit('chat:typing', { userId: user._id || user.id || user.uid, fullname: user.fullname || user.name, typing: !!typing });
//     } catch (e) { console.warn('typing error', e); }
//   });

//   socket.on('disconnect', (reason) => {
//     console.log('Socket disconnected', socket.id, reason);
//   });
// });

// // Optional zoom socket wiring (safe guard)
// try {
//   const initZoomSocket = require('./socket-zoom');
//   if (typeof initZoomSocket === 'function') {
//     try { initZoomSocket(io); } catch (e) { console.warn('initZoomSocket error', e && e.message ? e.message : e); }
//   }
// } catch (e) { console.warn('socket-zoom module not present or failed to load'); }

// // -----------------------------
// // Recurring cron job (guarded — will skip if models missing)
// // -----------------------------
// const CRON_DISABLED = process.env.DISABLE_RECURRING_CRON === '1' || process.env.DISABLE_RECURRING_CRON === 'true';

// if (!CRON_DISABLED) {
//   cron.schedule('10 0 * * *', async () => {
//     try {
//       console.log('Recurring charges job starting', new Date().toISOString());

//       if (!RecurringCharge || !Charge || !Student || !Teacher) {
//         console.warn('Recurring charge job aborted: required models are not available.');
//         return;
//       }

//       const today = new Date();
//       const dayToday = today.getDate();
//       const recs = await RecurringCharge.find({ active: true }).lean().catch(()=>[]);
//       const applied = [];

//       for (const r of recs || []) {
//         if (r.startDate && new Date(r.startDate) > today) continue;
//         if (r.endDate && new Date(r.endDate) < today) continue;

//         const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
//         const targetDay = Math.min(Number(r.dayOfMonth || 1), daysInMonth);
//         if (targetDay !== dayToday) continue;

//         try {
//           const inc = { $inc: { totalDue: Number(r.amount || 0) } };
//           if (String(r.personType) === 'student') {
//             await Student.findByIdAndUpdate(r.personId, inc).catch((e)=>{ console.warn('Student update failed', e && e.message); });
//           } else {
//             await Teacher.findByIdAndUpdate(r.personId, inc).catch((e)=>{ console.warn('Teacher update failed', e && e.message); });
//           }

//           const ch = new Charge({
//             personType: r.personType,
//             personId: r.personId,
//             amount: Number(r.amount || 0),
//             description: `Recurring charge applied (recurringId=${r._id})`,
//             recurringId: r._id,
//             createdBy: r.createdBy || null,
//             schoolId: r.schoolId || null
//           });
//           await ch.save();
//           applied.push({ recurringId: r._id, personId: r.personId, amount: r.amount });
//         } catch (err) {
//           console.error('Recurring apply failed for', r._id, err);
//         }
//       }

//       console.log('Recurring charges job finished, applied:', applied.length);
//     } catch (err) {
//       console.error('Recurring charges job error', err);
//     }
//   });
// } else {
//   console.log('Recurring cron disabled by DISABLE_RECURRING_CRON');
// }

// // Start server
// server.listen(PORT, () => {
//   console.log('Server running on port', PORT);
//   console.log('Socket.IO ready');
// });

// // Export app, server, and uploadsDir for route code to use
// module.exports = { app, server, uploadsDir: UPLOADS_DIR };


// backend/server.js
'use strict';

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const http = require('http');
const cron = require('node-cron');
require('dotenv').config();

// -----------------------------
// Route imports (keep your existing route files)
// -----------------------------
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const teacherRoutes = require('./routes/teachers');
const classRoutes = require('./routes/classes');
const subjectRoutes = require('./routes/subjects');
const parentRoutes = require('./routes/parents');
const dashboardRoutes = require('./routes/dashboard');
const votesRouter = require('./routes/votes');
const exams = require('./routes/exam');
const quizzes = require('./routes/quizzes');
const notices = require('./routes/notices');
const about = require('./routes/about');
const users = require('./routes/users');
const reports = require('./routes/reports');
const attendancesRoute = require('./routes/attendances');
const profileRoutes = require('./routes/profile');
const paymentRoutes = require('./routes/payments');
const financeRoutes = require('./routes/finance');
const zoomRouter = require('./routes/zoom');
const helpers = require('./routes/helpers');
const helpRoutess = require('./routes/help');
const resultsRouter = require('./routes/results');
const recurringRoutes = require('./routes/recurring');
const gamesRouter = require('./routes/games');
const recycleRouter = require('./routes/recycle');
const developerRoutes = require('./routes/developer');
const storiesRouter = require('./routes/stories');

const coursesRouter = require('./routes/courses');
const purchasesRouter = require('./routes/purchases');
const notificationsRouter = require('./routes/notifications');
const helpmsgsRouter = require('./routes/helpmsgs');
const recycleCourse = require('./routes/recycleCourse');

const lessonsRouters = require('./routes/lessons');
const ratingsRouters = require('./routes/ratings');
const commentsRouters = require('./routes/comments');

const gamesPlaysRouter = require('./routes/gamesPlays');

// uploads router (multipart + JSON uploads)
let uploadsRouter = null;
try {
  uploadsRouter = require('./routes/uploads');
} catch (e) {
  // keep server running even if uploads route currently fails,
  // but log the error so you can fix the uploads file.
  console.warn('Failed to load uploads router:', e && (e.stack || e.message || e));
}

// optional chats router
let chatsRouter = null;
try { chatsRouter = require('./routes/chats'); } catch (e) { /* optional */ }

// Models used in cron (optional; guard if not present)
let RecurringCharge, Charge, Student, Teacher;
try {
  RecurringCharge = require('./models/RecurringCharge');
  Charge = require('./models/Charge');
  Student = require('./models/Student');
  Teacher = require('./models/Teacher');
} catch (e) {
  console.warn('Cron models not found; recurring job will skip when models are missing.');
}

// -----------------------------
// App init + local uploads folder (NO S3 — local only)
// Make uploads path configurable via UPLOADS_DIR env var so it can be mounted/persistent in prod
// -----------------------------
const app = express();

const DEFAULT_UPLOADS_DIR = path.join(__dirname, 'uploads');
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : DEFAULT_UPLOADS_DIR;

try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) {
  console.warn('Failed to create uploads dir:', e && e.message);
}

console.log('Uploads directory:', UPLOADS_DIR);

// -----------------------------
// CORS / Allowed origins
// -----------------------------
const rawEnvOrigins = String(process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '').trim();
const envOrigins = rawEnvOrigins.length ? rawEnvOrigins.split(',').map(s => (s || '').trim()).filter(Boolean) : [];
const defaultDevOrigins = [
  'http://127.0.0.1:5501',
  'http://localhost:5501',
  'http://127.0.0.1:5000',
  'http://localhost:5000'
];
const allowedOrigins = Array.from(new Set([ ...envOrigins, ...defaultDevOrigins ]));
const netlifyPreviewRegex = /\.netlify\.app$/i;
const ALLOW_ALL = process.env.DISABLE_CORS_CHECK === '1' || process.env.DISABLE_CORS_CHECK === 'true';
const DEBUG_ALLOW_ALL = process.env.DEBUG_ALLOW_ALL_CORS === '1';

function originIsAllowed(origin) {
  if (!origin) return true;
  if (ALLOW_ALL) return true;
  if (allowedOrigins.indexOf(origin) !== -1) return true;
  if (netlifyPreviewRegex.test(origin)) return true;
  return false;
}

// Short middleware that sets CORS headers and handles OPTIONS preflight
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && originIsAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept');
  }
  if (req.method === 'OPTIONS') {
    return res.status(origin && originIsAllowed(origin) ? 204 : 403).end();
  }
  next();
});

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (originIsAllowed(origin)) return cb(null, true);
    return cb(new Error('CORS origin denied: ' + origin), false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept']
};

if (DEBUG_ALLOW_ALL) {
  console.warn('DEBUG_ALLOW_ALL_CORS enabled — allowing all origins (temporary)');
  app.use(cors({ origin: true, credentials: true }));
  app.options('*', cors({ origin: true, credentials: true }));
} else {
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
}

// -----------------------------
// Express middleware
// -----------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// -----------------------------
// Static uploads (local only)
// Serve uploads from configurable UPLOADS_DIR. Increase maxAge for caching.
// Use UPLOADS_DIR/exams for exams if needed.
// -----------------------------
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', etag: true, lastModified: true }));
app.use('/uploads/exams', express.static(path.join(UPLOADS_DIR, 'exams'), { maxAge: '30d', etag: true, lastModified: true }));

// -----------------------------
// mount routes
// -----------------------------
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/votes', votesRouter);
app.use('/api/exams', exams);
app.use('/api/quizzes', quizzes);
app.use('/api/notices', notices);
app.use('/api/about', about);
app.use('/api/users', users);
app.use('/api/reports', reports);
app.use('/api/attendances', attendancesRoute);
app.use('/api/profile', profileRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/zoom', zoomRouter);
app.use('/api/help', helpRoutess);
app.use('/api', helpers);
app.use('/api/results', resultsRouter);
if (chatsRouter) app.use('/api/chats', chatsRouter);
app.use('/api/recurring', recurringRoutes);
app.use('/api/recycle', recycleRouter);
app.use('/api/math-game', gamesRouter);
app.use('/api/developers', developerRoutes);
app.use('/api/stories', storiesRouter);

app.use('/api/courses', coursesRouter);
app.use('/api/lessons', lessonsRouters);
app.use('/api/purchases', purchasesRouter);
app.use('/api/helpmsgs', helpmsgsRouter);
app.use('/api/recycle', recycleCourse);
app.use('/api/notifications', notificationsRouter);
app.use('/api/ratings', ratingsRouters);
app.use('/api/comments', commentsRouters);

// ... later, after other routes
app.use('/api', gamesPlaysRouter); // or app.use('/api/gamesPlays', gamesPlaysRouter);


// mount uploads router if loaded (guarded)
if (uploadsRouter) {
  app.use('/api/uploads', uploadsRouter);
} else {
  console.warn('Uploads router not mounted because require(./routes/uploads) failed. Fix uploads.js first.');
}

// root
app.get('/', (req, res) => res.json({ ok: true, message: 'School Manager API' }));

// -----------------------------
// global error handler
// -----------------------------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && (err.stack || err));
  if (!res.headersSent) {
    if (err && String(err.message || '').toLowerCase().includes('cors')) {
      return res.status(403).json({ ok:false, error: 'CORS error: ' + err.message });
    }
    return res.status(500).json({ ok:false, error: err && err.message ? err.message : 'Server error' });
  }
  next(err);
});

// -----------------------------
// connect mongodb
// -----------------------------
const PORT = Number(process.env.PORT || 5000);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connect error', err));

// -----------------------------
// create HTTP server & socket.io (token-based socket auth included)
// -----------------------------
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOW_ALL) return cb(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
      if (netlifyPreviewRegex.test(origin)) return cb(null, true);
      console.warn('Socket.IO CORS denied for origin:', origin);
      return cb('origin not allowed', false);
    },
    methods: ['GET','POST'],
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 60000
});

app.set('io', io);

// socket auth middleware: expects io({ auth: { token } })
io.use(async (socket, next) => {
  try {
    const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: token missing'));
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'secret';
    const payload = await new Promise((resolve, reject) => {
      jwt.verify(token, secret, (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      });
    });
    socket.user = payload || {};
    return next();
  } catch (err) {
    console.warn('Socket auth failed', err && err.message ? err.message : err);
    return next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const user = socket.user || {};
  console.log('Socket connected:', socket.id, 'user=', user && (user._id || user.id || user.uid));

  socket.on('joinClass', (classId) => {
    try {
      if (!classId) return;
      socket.join(`class_${classId}`);
      socket.to(`class_${classId}`).emit('chat:userJoined', { userId: user._id || user.id || user.uid, fullname: user.fullname || user.name });
    } catch (e) { console.warn('joinClass error', e); }
  });

  socket.on('leaveClass', (classId) => {
    try {
      if (!classId) return;
      socket.leave(`class_${classId}`);
      socket.to(`class_${classId}`).emit('chat:userLeft', { userId: user._id || user.id || user.uid, fullname: user.fullname || user.name });
    } catch (e) { console.warn('leaveClass error', e); }
  });

  socket.on('typing', ({ classId, typing }) => {
    try {
      if (!classId) return;
      socket.to(`class_${classId}`).emit('chat:typing', { userId: user._id || user.id || user.uid, fullname: user.fullname || user.name, typing: !!typing });
    } catch (e) { console.warn('typing error', e); }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected', socket.id, reason);
  });
});

// Optional zoom socket wiring (safe guard)
try {
  const initZoomSocket = require('./socket-zoom');
  if (typeof initZoomSocket === 'function') {
    try { initZoomSocket(io); } catch (e) { console.warn('initZoomSocket error', e && e.message ? e.message : e); }
  }
} catch (e) { console.warn('socket-zoom module not present or failed to load'); }

// -----------------------------
// Recurring cron job (guarded — will skip if models missing)
// -----------------------------
const CRON_DISABLED = process.env.DISABLE_RECURRING_CRON === '1' || process.env.DISABLE_RECURRING_CRON === 'true';

if (!CRON_DISABLED) {
  cron.schedule('10 0 * * *', async () => {
    try {
      console.log('Recurring charges job starting', new Date().toISOString());

      if (!RecurringCharge || !Charge || !Student || !Teacher) {
        console.warn('Recurring charge job aborted: required models are not available.');
        return;
      }

      const today = new Date();
      const dayToday = today.getDate();
      const recs = await RecurringCharge.find({ active: true }).lean().catch(()=>[]);
      const applied = [];

      for (const r of recs || []) {
        if (r.startDate && new Date(r.startDate) > today) continue;
        if (r.endDate && new Date(r.endDate) < today) continue;

        const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
        const targetDay = Math.min(Number(r.dayOfMonth || 1), daysInMonth);
        if (targetDay !== dayToday) continue;

        try {
          const inc = { $inc: { totalDue: Number(r.amount || 0) } };
          if (String(r.personType) === 'student') {
            await Student.findByIdAndUpdate(r.personId, inc).catch((e)=>{ console.warn('Student update failed', e && e.message); });
          } else {
            await Teacher.findByIdAndUpdate(r.personId, inc).catch((e)=>{ console.warn('Teacher update failed', e && e.message); });
          }

          const ch = new Charge({
            personType: r.personType,
            personId: r.personId,
            amount: Number(r.amount || 0),
            description: `Recurring charge applied (recurringId=${r._id})`,
            recurringId: r._id,
            createdBy: r.createdBy || null,
            schoolId: r.schoolId || null
          });
          await ch.save();
          applied.push({ recurringId: r._id, personId: r.personId, amount: r.amount });
        } catch (err) {
          console.error('Recurring apply failed for', r._id, err);
        }
      }

      console.log('Recurring charges job finished, applied:', applied.length);
    } catch (err) {
      console.error('Recurring charges job error', err);
    }
  });
} else {
  console.log('Recurring cron disabled by DISABLE_RECURRING_CRON');
}

// Start server
server.listen(PORT, () => {
  console.log('Server running   on port', PORT);
  console.log('Socket.IO ready');
});

// Export app, server, and uploadsDir for route code to use
module.exports = { app, server, uploadsDir: UPLOADS_DIR };
