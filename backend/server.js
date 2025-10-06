// backend/server.js
'use strict';

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const http = require('http');
require('dotenv').config();

// your route imports (keep your other routes as before)
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
const examRoutes = require('./routes/exam');
const helpers = require('./routes/helpers');
const helpRoutess = require('./routes/help');
const resultsRouter = require('./routes/results');
const recurringRoutes = require('./routes/recurring');

const cron = require('node-cron');
const RecurringCharge = require('./models/RecurringCharge');
const Charge = require('./models/Charge');
const Student = require('./models/Student');
const Teacher = require('./models/Teacher');

const gamesRouter = require('./routes/games');

// in your app.js / index.js
const recycleRouter = require('./routes/recycle');

let chatsRouter = null;
try { chatsRouter = require('./routes/chats'); } catch(e){ /* optional */ }

const app = express();

// ensure uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }); } catch(e){ console.warn('mkdir uploads failed', e && e.message); }

// CORS setup - allow PATCH in preflight and common headers
const envOrigins = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '')
  .split(',').map(s => s && s.trim()).filter(Boolean);
const defaultDevOrigins = [
  'http://127.0.0.1:5501',
  'http://localhost:5501',
  'http://127.0.0.1:5000',
  'http://localhost:5000'
];
const allowedOrigins = Array.from(new Set([ ...envOrigins, ...defaultDevOrigins ]));

// const corsOptions = {
//   origin: function(origin, cb) {
//     if (!origin) return cb(null, true);
//     if (allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
//     return cb(new Error('CORS origin denied: ' + origin));
//   },
//   credentials: true,
//   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
//   allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept']
// };
// app.use(cors(corsOptions));
// app.options('*', cors(corsOptions)); // respond to preflight

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// static uploads
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads/exams', express.static(path.join(process.cwd(), 'uploads', 'exams')));

// mount routes
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
app.use('/api/exams', examRoutes);
app.use('/api', helpers);
app.use('/api/results', resultsRouter);
if (chatsRouter) app.use('/api/chats', chatsRouter);
app.use('/api/recurring', recurringRoutes);

app.use('/api/recycle', recycleRouter);

app.use('/api/math-game', gamesRouter);

// root
app.get('/', (req, res) => res.json({ ok:true, message:'School Manager API' }));

// global error handler
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

// connect mongodb
const PORT = Number(process.env.PORT || 5000);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connect error', err));

// create server + socket.io (unchanged)
// const server = http.createServer(app);
// const { Server } = require('socket.io');
// const io = new Server(server, {
//   cors: { origin: allowedOrigins, methods: ['GET','POST'], credentials: true },
//   pingInterval: 25000, pingTimeout: 60000
// });

// allow Netlify preview domains in addition to configured origins
const netlifyPreviewRegex = /\.netlify\.app$/i;

// Log incoming origin for easier debugging (optional; can remove later)
app.use((req, res, next) => {
  if (req.headers && req.headers.origin) {
    console.log('Incoming request Origin:', req.headers.origin, 'Path:', req.path);
  }
  next();
});

const corsOptions = {
  origin: function(origin, cb) {
    // allow non-browser requests (curl, server-to-server, tests) where origin is undefined
    if (!origin) return cb(null, true);

    // exact-list match from env + defaults
    if (allowedOrigins.indexOf(origin) !== -1) return cb(null, true);

    // allow Netlify preview / deploy domains (e.g. *.netlify.app)
    if (netlifyPreviewRegex.test(origin)) return cb(null, true);

    // otherwise deny
    console.warn('CORS denied for origin:', origin);
    return cb(new Error('CORS origin denied: ' + origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // respond to preflight

// Create Socket.IO with same origin rules (function-based)
const io = new Server(server, {
  cors: {
    origin: function(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
      if (netlifyPreviewRegex.test(origin)) return cb(null, true);
      console.warn('Socket.IO CORS denied for origin:', origin);
      return cb('origin not allowed', false);
    },
    methods: ['GET','POST'],
    credentials: true
  },
  pingInterval: 25000, pingTimeout: 60000
});

app.set('io', io);

// socket auth and events (same as your existing code)
// ... (keep your socket auth/event code here - unchanged from your file)
// This expects a JWT token sent by the socket client as: io({ auth: { token } })
io.use(async (socket, next) => {
  try {
    // token may be inside handshake.auth.token
    const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: token missing'));

    // verify token (adjust to your auth strategy if not JWT)
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'secret';
    const payload = await new Promise((resolve, reject) => {
      jwt.verify(token, secret, (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      });
    });

    // attach user payload to socket
    socket.user = payload || {};
    return next();
  } catch (err) {
    console.warn('Socket auth failed', err && err.message ? err.message : err);
    return next(new Error('Authentication error'));
  }
});

// --- Socket events (chat join/leave/typing etc) ---
io.on('connection', (socket) => {
  const user = socket.user || {};
  console.log('Socket connected:', socket.id, 'user=', user && (user._id || user.id || user.uid));

  // join a class room
  socket.on('joinClass', (classId) => {
    try {
      if (!classId) return;
      socket.join(`class_${classId}`);
      // optionally emit presence / joined event to room
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
    // handle disconnect if needed
    console.log('Socket disconnected', socket.id, reason);
  });
});

// --- optional: Wire Zoom sockets if you have socket-zoom.js (safe guard) ---
try {
  const initZoomSocket = require('./socket-zoom');
  if (typeof initZoomSocket === 'function') {
    try { initZoomSocket(io); } catch (e) { console.warn('initZoomSocket error', e && e.message ? e.message : e); }
  }
} catch (e) {
  // not critical
 console.warn('socket-zoom module not present or failed to load');
}

// Optional: disable automatic cron in certain environments
const CRON_DISABLED = process.env.DISABLE_RECURRING_CRON === '1' || process.env.DISABLE_RECURRING_CRON === 'true';

if (!CRON_DISABLED) {
  // DAILY RECURRING CHARGES JOB - runs once per day at 00:10 server time
  cron.schedule('10 0 * * *', async () => {
    try {
      console.log('Recurring charges job starting', new Date().toISOString());

      if (!RecurringCharge || !Charge || !Student || !Teacher) {
        console.warn('Recurring charge job aborted: required models are not available.');
        return;
      }

      const today = new Date();
      const dayToday = today.getDate();

      // query active recurrences (manager/admin scope handled when creating records)
      const recs = await RecurringCharge.find({ active: true }).lean().catch(()=>[]);
      const applied = [];

      for (const r of recs || []) {
        // date window check
        if (r.startDate && new Date(r.startDate) > today) continue;
        if (r.endDate && new Date(r.endDate) < today) continue;

        // map configured day to available days this month (month-end handling)
        const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
        const targetDay = Math.min(Number(r.dayOfMonth || 1), daysInMonth);
        if (targetDay !== dayToday) continue;

        try {
          // apply charge: increment totalDue
          const inc = { $inc: { totalDue: Number(r.amount || 0) } };
          if (String(r.personType) === 'student') {
            await Student.findByIdAndUpdate(r.personId, inc).catch((e)=>{ console.warn('Student update failed', e && e.message); });
          } else {
            await Teacher.findByIdAndUpdate(r.personId, inc).catch((e)=>{ console.warn('Teacher update failed', e && e.message); });
          }

          // insert audit charge
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
  console.log('Server running on port', PORT);
  console.log('Socket.IO ready');
});


// --- Socket auth middleware (token-based) ---
