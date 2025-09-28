// backend/socket.js
// Usage: const { attachHelpSocket } = require('./socket'); attachHelpSocket(server, app);
// server is httpServer from http.createServer(app) or returned from app.listen; app is your express app.

const jwt = require('jsonwebtoken'); // used only if you issue tokens with jwt
const User = require('./models/User');

function parseTokenFromSocket(socket) {
  // socket.handshake.auth.token if using io(client, { auth: { token } })
  return (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) || null;
}

async function verifyTokenAndGetUser(token) {
  if (!token) return null;
  // If your auth uses JWT, verify here. Replace SECRET with your actual env var.
  try {
    const SECRET = process.env.JWT_SECRET || 'replace_with_your_secret';
    const payload = jwt.verify(token, SECRET);
    if (!payload || !payload.sub) return null;
    const u = await User.findById(payload.sub).lean().catch(()=>null);
    return u;
  } catch (e) {
    // If your system doesn't use JWT, you can instead look up session or do nothing.
    console.warn('[socket] token verify failed', e && e.message);
    return null;
  }
}

function attachHelpSocket(httpServer, app, opts = {}) {
  // lazy require to avoid forcing socket.io if not installed
  const { Server } = require('socket.io');
  const io = new Server(httpServer, Object.assign({ cors: { origin: "*", credentials: true } }, opts));
  console.log('[socket] attaching help socket');

  // store io on app so routes can use it: app.set('io', io)
  if (app && typeof app.set === 'function') app.set('io', io);

  io.on('connection', async (socket) => {
    console.log('[socket] new connection, id=', socket.id);
    try {
      const token = parseTokenFromSocket(socket);
      const user = token ? await verifyTokenAndGetUser(token) : null;
      // If you don't use JWT, but your front-end sets user id in handshake, adapt here

      if (user && user._id) {
        const uid = String(user._id);
        const role = (user.role || '').toLowerCase();
        const schoolId = user.schoolId ? String(user.schoolId) : null;

        // join per-user room
        socket.join('user:' + uid);
        // join role rooms for broadcast by role
        if (role) socket.join('role:' + role);
        // join school-specific room if you want (not used by routes but handy)
        if (schoolId) socket.join('school:' + schoolId);

        console.log(`[socket] joined rooms: user:${uid}${role?','+'role:'+role:''}${schoolId?','+'school:'+schoolId:''}`);
      } else {
        console.log('[socket] no user identified on socket handshake');
      }

      socket.on('disconnect', (reason) => {
        console.log('[socket] disconnect', socket.id, reason);
      });
    } catch (err) {
      console.error('[socket] connection error', err && (err.stack || err));
    }
  });

  return io;
}

module.exports = { attachHelpSocket };
