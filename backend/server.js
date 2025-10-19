// backend/server.js
'use strict';

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Optional packages (install if you want them)
const helmet = require('helmet');           // npm i helmet
const rateLimit = require('express-rate-limit'); // npm i express-rate-limit
const morgan = require('morgan');           // npm i morgan

// -----------------------------
// route imports (adjust as-needed)
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
const helpRoutes = require('./routes/help'); // ensure file exists and export name is correct
const resultsRouter = require('./routes/results');
const recurringRoutes = require('./routes/recurring');
const gamesRouter = require('./routes/games');
const recycleRouter = require('./routes/recycle');
const developerRoutes = require('./routes/developer');
const storiesRouter = require('./routes/stories');

let chatsRouter = null;
try { chatsRouter = require('./routes/chats'); } catch (e) { /* optional chat routes */ }

// -----------------------------
// Optional S3 support
let S3_ENABLED = false;
let uploadToS3 = null;
let S3_BUCKET = '';
let S3_PREFIX = '';
try {
  const AWS = require('aws-sdk'); // ensure this is installed if using S3
  S3_BUCKET = process.env.AWS_S3_BUCKET || '';
  const S3_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '';
  S3_PREFIX = (process.env.S3_UPLOADS_PREFIX || 'uploads').replace(/^\/+|\/+$/g,'');
  if (S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    AWS.config.update({
      region: S3_REGION || undefined,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
    const s3 = new AWS.S3({ apiVersion: '2006-03-01' });
    S3_ENABLED = true;
    const DELETE_LOCAL_AFTER_S3 = String(process.env.DELETE_LOCAL_AFTER_S3_UPLOAD || 'false').toLowerCase() === 'true';
    uploadToS3 = async (localPath, key) => {
      if (!fs.existsSync(localPath)) throw new Error('Local file not found: ' + localPath);
      const stream = fs.createReadStream(localPath);
      const params = {
        Bucket: S3_BUCKET,
        Key: key.replace(/^\/+/,''),
        Body: stream,
        ACL: 'public-read'
      };
      return new Promise((resolve, reject) => {
        s3.upload(params, (err, data) => {
          if (err) return reject(err);
          if (DELETE_LOCAL_AFTER_S3) {
            try { fs.unlinkSync(localPath); } catch (e) {}
          }
          resolve(data);
        });
      });
    };
    console.log('S3 enabled: bucket=', S3_BUCKET, 'prefix=', S3_PREFIX);
  } else {
    console.log('S3 not enabled (env missing)');
  }
} catch (e) {
  // aws-sdk not installed or failed
  console.log('S3 support not available (aws-sdk missing or config issue)');
}

// -----------------------------
// App init + uploads folder
const app = express();
const uploadsDir = path.join(__dirname, 'uploads');
try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }); } catch(e){ console.warn('mkdir uploads failed', e && e.message); }

// -----------------------------
// CORS / Allowed origins
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

function originIsAllowed(origin) {
  if (!origin) return true; // allow curl / server-to-server / same-origin
  if (ALLOW_ALL) return true;
  if (allowedOrigins.indexOf(origin) !== -1) return true;
  if (netlifyPreviewRegex.test(origin)) return true;
  return false;
}

// set CORS headers (simple middleware)
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
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// -----------------------------
// Security & middleware
app.use(helmet()); // basic security headers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// simple rate limiter for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// request logging (morgan)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// -----------------------------
// Static uploads: local-first, stream from S3 when enabled
if (S3_ENABLED) {
  app.get('/uploads/*', async (req, res) => {
    try {
      const rel = req.path.replace(/^\/uploads\/?/, '').replace(/^\/+/, '');
      const localFile = path.join(uploadsDir, rel);
      if (fs.existsSync(localFile)) {
        return res.sendFile(localFile);
      }
      // attempt streaming from S3
      const AWS = require('aws-sdk');
      const s3 = new AWS.S3();
      const s3Key = (S3_PREFIX ? (S3_PREFIX + '/') : '') + rel;
      const params = { Bucket: process.env.AWS_S3_BUCKET, Key: s3Key };
      s3.headObject(params, (headErr, metadata) => {
        if (headErr) {
          return res.status(404).end();
        }
        res.setHeader('Content-Type', metadata.ContentType || 'application/octet-stream');
        const stream = s3.getObject(params).createReadStream();
        stream.on('error', () => res.status(404).end());
        stream.pipe(res);
      });
    } catch (err) {
      console.error('Error in uploads handler', err);
      res.status(500).json({ ok:false, error: 'Server error' });
    }
  });
} else {
  app.use('/uploads', express.static(uploadsDir));
}
// keep any specific mappings (exams folder)
app.use('/uploads/exams', express.static(path.join(process.cwd(), 'uploads', 'exams')));

// -----------------------------
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
app.use('/api/help', helpRoutes);
app.use('/api', helpers);
app.use('/api/results', resultsRouter);
if (chatsRouter) app.use('/api/chats', chatsRouter);
app.use('/api/recurring', recurringRoutes);
app.use('/api/recycle', recycleRouter);
app.use('/api/math-game', gamesRouter);
app.use('/api/developers', developerRoutes);
app.use('/api/stories', storiesRouter);

// root ping
app.get('/', (req, res) => res.json({ ok:true, message:'School Manager API' }));

// -----------------------------
// Global error handler
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
// Database connection
const PORT = Number(process.env.PORT || 5000);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connect error', err));

// -----------------------------
// create HTTP server & socket.io
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOW_ALL) return cb(null, true);
      if (originIsAllowed(origin)) return cb(null, true);
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

// socket auth middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: token missing'));
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'secret';
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        console.warn('Socket JWT verify failed', err && err.message);
        return next(new Error('Authentication error'));
      }
      socket.user = decoded || {};
      return next();
    });
  } catch (err) {
    console.warn('Socket auth failed', err && err.message ? err.message : err);
    return next(new Error('Authentication error'));
  }
});

// socket events
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

// optional zoom socket wiring
try {
  const initZoomSocket = require('./socket-zoom');
  if (typeof initZoomSocket === 'function') initZoomSocket(io);
} catch (e) { /* optional */ }

// -----------------------------
// Recurring cron job (guarded)
let RecurringCharge, Charge, Student, Teacher;
try {
  RecurringCharge = require('./models/RecurringCharge');
  Charge = require('./models/Charge');
  Student = require('./models/Student');
  Teacher = require('./models/Teacher');
} catch (e) {
  console.warn('Cron models not found; recurring job will skip when models are missing.');
}

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

// -----------------------------
// Start server & graceful shutdown
server.listen(PORT, () => {
  console.log('Server running on port', PORT);
  console.log('Socket.IO ready');
});

function shutdown(signal) {
  console.log('Shutdown signal received:', signal);
  server.close(() => {
    console.log('HTTP server closed.');
    mongoose.connection.close(false, () => {
      console.log('Mongo connection closed.');
      process.exit(0);
    });
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // optionally exit
});

// -----------------------------
// Exports
module.exports = { app, server, uploadsDir, S3_ENABLED, uploadToS3, S3_PREFIX };
