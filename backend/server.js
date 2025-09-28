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

// --- Routes (your existing routes) ---
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


// New chat routes (from previous message)
let chatsRouter = null;
try {
  chatsRouter = require('./routes/chats');
} catch (e) {
  console.warn('Chats router not found - /api/chats will not be mounted until ./routes/chats exists');
}

// --- Initialize app ---
const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
  }
} catch (e) {
  console.warn('Could not ensure uploads directory exists:', e.message || e);
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Serve uploads (public)
app.use('/uploads', express.static(uploadsDir));
// serve exam uploads path (keeps your existing mapping)
app.use('/uploads/exams', express.static(path.join(process.cwd(), 'uploads', 'exams')));

// API routes (mount)
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

// additional mounts
app.use('/api/help', helpRoutess);
app.use('/api/exams', examRoutes);
app.use('/api', helpers);
app.use('/api/results', resultsRouter);

// mount chats router if available
if (chatsRouter) {
  app.use('/api/chats', chatsRouter);
}

// Simple root
app.get('/', (req, res) => res.json({ ok: true, message: 'School Manager API' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && (err.stack || err));
  if (!res.headersSent) {
    res.status(500).json({ message: 'Server error', detail: err && err.message ? err.message : null });
  } else {
    next(err);
  }
});

// Connect to MongoDB
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schooldb';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Create HTTP server
const server = http.createServer(app);

// Attach Socket.io
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 60000
});

// Expose io to Express routes/controllers via app
app.set('io', io);

// --- Socket auth middleware (token-based) ---
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
  // console.warn('socket-zoom module not present or failed to load');
}

// Start server
server.listen(PORT, () => {
  console.log('Server running on port', PORT);
  console.log('Socket.IO ready');
});
