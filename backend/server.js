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

// -----------------------------
// Route imports (unchanged)
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
const examRoutes = require('./routes/exam');
const helpers = require('./routes/helpers');
const helpRoutess = require('./routes/help');
const resultsRouter = require('./routes/results');
const recurringRoutes = require('./routes/recurring');

const gamesRouter = require('./routes/games');
const recycleRouter = require('./routes/recycle');

// near other route imports at top
const developerRoutes = require('./routes/developer');

let chatsRouter = null;
try { chatsRouter = require('./routes/chats'); } catch(e){ /* optional */ }

// Models used in cron (optional)
const cron = require('node-cron');
const RecurringCharge = require('./models/RecurringCharge');
const Charge = require('./models/Charge');
const Student = require('./models/Student');
const Teacher = require('./models/Teacher');



// -----------------------------
// App init + uploads folder
// -----------------------------
const app = express();
const uploadsDir = path.join(__dirname, 'uploads');
try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }); } catch(e){ console.warn('mkdir uploads failed', e && e.message); }

// -----------------------------
// Allowed origins / CORS Setup
// -----------------------------
/*
 .env should contain:
 FRONTEND_ORIGINS=https://luxury-flan-d59494.netlify.app,https://*.netlify.app,http://127.0.0.1:5501,http://localhost:5501,http://localhost:5000
*/

const rawEnvOrigins = String(process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '').trim();
const envOrigins = rawEnvOrigins.length ? rawEnvOrigins.split(',').map(s => (s || '').trim()).filter(Boolean) : [];

const defaultDevOrigins = [
  'http://127.0.0.1:5501',
  'http://localhost:5501',
  'http://127.0.0.1:5000',
  'http://localhost:5000'
];

const allowedOrigins = Array.from(new Set([ ...envOrigins, ...defaultDevOrigins ]));

// support Netlify previews like: https://something--site.netlify.app
const netlifyPreviewRegex = /\.netlify\.app$/i;

// Optional: Allow all (useful for quick debugging) - set env DISABLE_CORS_CHECK=1 to enable (not recommended for production)
const ALLOW_ALL = process.env.DISABLE_CORS_CHECK === '1' || process.env.DISABLE_CORS_CHECK === 'true';

console.log('CORS setup: ALLOW_ALL=', ALLOW_ALL);
console.log('CORS setup: allowedOrigins=', allowedOrigins);
console.log('CORS setup: raw FRONTEND_ORIGINS=', rawEnvOrigins);

// Helper to test an origin
function originIsAllowed(origin) {
  if (!origin) return true; // non-browser (curl, server-to-server) requests may not have origin
  if (ALLOW_ALL) return true;
  if (allowedOrigins.indexOf(origin) !== -1) return true;
  if (netlifyPreviewRegex.test(origin)) return true;
  return false;
}

// -----------------------------
// Preflight / quick CORS header middleware
// -----------------------------
// This middleware ensures the browser sees Access-Control-Allow-Origin for preflight requests.
// It OUGHT to be safe because originIsAllowed controls which origins get the header.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && originIsAllowed(origin)) {
    // explicit permissive headers for allowed origins
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept');
  }
  // If this is a preflight, respond quickly (CORS headers already set above for allowed origins)
  if (req.method === 'OPTIONS') {
    return res.status(origin && originIsAllowed(origin) ? 204 : 403).end();
  }
  next();
});

// -----------------------------
// cors() middleware (keeps internal express CORS behavior consistent)
// -----------------------------
const corsOptions = {
  origin: (origin, cb) => {
    // allow non-browser requests where origin is undefined
    if (!origin) return cb(null, true);
    if (originIsAllowed(origin)) return cb(null, true);
    // Deny
    return cb(new Error('CORS origin denied: ' + origin), false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // respond to preflight


// --- CORS setup (allow all when debugging) ---
const DEBUG_ALLOW_ALL = process.env.DEBUG_ALLOW_ALL_CORS === '1';

if (DEBUG_ALLOW_ALL) {
  console.warn('DEBUG_ALLOW_ALL_CORS enabled — allowing all origins (temporary)');
  app.use(cors({ origin: true, credentials: true }));
  app.options('*', cors({ origin: true, credentials: true }));
} else {
  // existing robust corsOptions code you already have
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
}

// -----------------------------
// Express middleware
// -----------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// static uploads
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads/exams', express.static(path.join(process.cwd(), 'uploads', 'exams')));

// -----------------------------
// create HTTP server & socket.io
// -----------------------------
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      // origin may be undefined for server-to-server
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

// -----------------------------
// mount routes (after CORS middleware is active)
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
app.use('/api/exams', examRoutes);
app.use('/api', helpers);
app.use('/api/results', resultsRouter);
if (chatsRouter) app.use('/api/chats', chatsRouter);
app.use('/api/recurring', recurringRoutes);
app.use('/api/recycle', recycleRouter);
app.use('/api/math-game', gamesRouter);


// ... later, after other app.use routes:
app.use('/api/developers', developerRoutes);

// root

// root
app.get('/', (req, res) => res.json({ ok:true, message:'School Manager API' }));

// -----------------------------
// global error handler (optional)
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
// connect mongodb & start cron etc
// -----------------------------
const PORT = Number(process.env.PORT || 5000);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb';

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connect error', err));

// --- Socket auth & events (unchanged) ---
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

// Optional: wire socket-zoom if present (unchanged)
try {
  const initZoomSocket = require('./socket-zoom');
  if (typeof initZoomSocket === 'function') {
    try { initZoomSocket(io); } catch (e) { console.warn('initZoomSocket error', e && e.message ? e.message : e); }
  }
} catch (e) {
  console.warn('socket-zoom module not present or failed to load');
}

// Optional recurring cron (unchanged)
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
  console.log('Server running on port', PORT);
  console.log('Socket.IO ready');
});
