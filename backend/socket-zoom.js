// backend/socket-zoom.js
const Meeting = require('./models/Meeting');
const MeetingMessage = require('./models/MeetingMessage');
const MeetingAudit = require('./models/MeetingAudit');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

module.exports = function initZoomSocket(io, options = {}) {
  const JWT_SECRET = options.jwtSecret || process.env.JWT_SECRET || 'devsecret';

  // socketId -> { meetingId, userKey, user, audioOn, videoOn }
  const socketToMeta = new Map();
  // meetingId -> { userMap: Map(userKey -> { user, sockets:Set, audioOn, videoOn }), host: socketId, ownerId: <userId>, banned: Set<userKey>, chatEnabled: true, recording: false }
  const meetingState = new Map();

  // rate limiter state
  const chatRateMap = new Map();
  const CHAT_RATE_LIMIT = 5;
  const CHAT_RATE_WINDOW_MS = 5 * 1000;

  function pruneAndCount(userKey) {
    const now = Date.now();
    const arr = chatRateMap.get(userKey) || [];
    const filtered = arr.filter(ts => (now - ts) <= CHAT_RATE_WINDOW_MS);
    chatRateMap.set(userKey, filtered);
    return filtered.length;
  }

  async function getUserFromSocket(socket) {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token
        || (socket.handshake.query && socket.handshake.query.token)
        || (socket.handshake.headers && socket.handshake.headers.authorization && socket.handshake.headers.authorization.replace(/^Bearer\s*/i, ''));
      if (!token) return null;
      const payload = jwt.verify(token, JWT_SECRET);
      if (!payload) return null;
      return { _id: payload.id || payload._id || payload.userId, role: (payload.role||'').toLowerCase(), fullname: payload.fullname || payload.name || '' };
    } catch (e) {
      return null;
    }
  }

  function ensureMeetingState(meetingId) {
    if (!meetingState.has(meetingId)) meetingState.set(meetingId, { userMap: new Map(), host: null, ownerId: null, banned: new Set(), chatEnabled: true, recording: false });
    return meetingState.get(meetingId);
  }

  function userKeyFor(user, socketId) {
    return (user && user._id) ? String(user._id) : `guest:${socketId}`;
  }

  function attachSocketToUser(meetingId, socketId, user) {
    const st = ensureMeetingState(meetingId);
    const key = userKeyFor(user, socketId);
    let u = st.userMap.get(key);
    if (!u) {
      u = { user: (user || { _id: null, fullname: 'Guest' }), sockets: new Set(), audioOn: true, videoOn: true };
      st.userMap.set(key, u);
    }
    u.sockets.add(socketId);

    // compute aggregated audio/video
    let audioAny = false, videoAny = false;
    for (const sid of u.sockets) {
      const sm = socketToMeta.get(sid);
      if (sm) {
        if (sm.audioOn) audioAny = true;
        if (sm.videoOn) videoAny = true;
      } else {
        audioAny = audioAny || true;
        videoAny = videoAny || true;
      }
      if (audioAny && videoAny) break;
    }
    u.audioOn = audioAny;
    u.videoOn = videoAny;
    st.userMap.set(key, u);
    return key;
  }

  function detachSocketFromUser(meetingId, socketId, userKey) {
    const st = meetingState.get(meetingId);
    if (!st) return;
    const u = st.userMap.get(userKey);
    if (!u) return;
    u.sockets.delete(socketId);
    if (u.sockets.size === 0) {
      st.userMap.delete(userKey);
    } else {
      // recalc aggregation
      let audioAny = false, videoAny = false;
      for (const sid of u.sockets) {
        const sm = socketToMeta.get(sid);
        if (!sm) continue;
        if (sm.audioOn) audioAny = true;
        if (sm.videoOn) videoAny = true;
        if (audioAny && videoAny) break;
      }
      u.audioOn = audioAny;
      u.videoOn = videoAny;
      st.userMap.set(userKey, u);
    }
  }

  function setSocketMetaAndBroadcast(socketId, { audioOn = undefined, videoOn = undefined } = {}) {
    const meta = socketToMeta.get(socketId);
    if (!meta) return;
    if (typeof audioOn === 'boolean') meta.audioOn = audioOn;
    if (typeof videoOn === 'boolean') meta.videoOn = videoOn;
    socketToMeta.set(socketId, meta);

    const st = meetingState.get(meta.meetingId);
    if (!st) return;
    const u = st.userMap.get(meta.userKey);
    if (!u) return;

    // recompute per-user aggregated values
    let audioAny = false, videoAny = false;
    for (const sid of u.sockets) {
      const sm = socketToMeta.get(sid);
      if (!sm) continue;
      if (sm.audioOn) audioAny = true;
      if (sm.videoOn) videoAny = true;
      if (audioAny && videoAny) break;
    }
    u.audioOn = audioAny;
    u.videoOn = videoAny;
    st.userMap.set(meta.userKey, u);

    // broadcast updated participants for this meeting
    broadcastParticipants(meta.meetingId);
  }

  function broadcastParticipants(meetingId) {
    try {
      const st = meetingState.get(meetingId);
      if (!st) {
        io.to('zoom:' + meetingId).emit('zoom:participants', { participants: [], total: 0, host: null, ownerId: null });
        return;
      }

      const participants = [];
      for (const [userKey, meta] of st.userMap.entries()) {
        const socketsArr = Array.from(meta.sockets || []);
        const primarySocket = socketsArr.length ? socketsArr[0] : null;
        participants.push({
          userKey,
          userId: meta.user && meta.user._id ? String(meta.user._id) : null,
          user: meta.user || { fullname: 'Guest', _id: null },
          sockets: socketsArr,
          primarySocket,
          audioOn: !!meta.audioOn,
          videoOn: !!meta.videoOn
        });
      }
      const total = participants.length;
      const stHost = st.host || null;
      const ownerId = st.ownerId || null;
      io.to('zoom:' + meetingId).emit('zoom:participants', { participants, total, host: stHost, ownerId, chatEnabled: !!st.chatEnabled, recording: !!st.recording });
    } catch (e) {
      console.warn('broadcastParticipants error', e);
    }
  }

  async function trimChatHistory(meetingId, keep = 2000) {
    try {
      const count = await MeetingMessage.countDocuments({ meetingId });
      if (count > keep) {
        const toRemove = await MeetingMessage.find({ meetingId })
          .sort({ ts: 1 })
          .limit(count - keep)
          .select('_id')
          .lean();
        const ids = toRemove.map(x => x._id).filter(Boolean);
        if (ids.length) await MeetingMessage.deleteMany({ _id: { $in: ids } });
      }
    } catch (e) {
      console.warn('trimChatHistory error', e);
    }
  }

  // helpers for host/creator actions targeting userKey or socket id
  async function applyHostActionToTarget(meetingId, target, action) {
    const st = meetingState.get(meetingId);
    if (!st) return { ok: false, message: 'meeting not found' };

    // if target is a socket id present in socketToMeta
    if (socketToMeta.has(target)) {
      const meta = socketToMeta.get(target);
      const tSocket = io.sockets.sockets.get(target);
      if (tSocket) tSocket.emit('zoom:host-action', { cmd: action });
      if (action === 'mute') setSocketMetaAndBroadcast(target, { audioOn: false });
      else if (action === 'unmute') setSocketMetaAndBroadcast(target, { audioOn: true });
      else if (action === 'disable-camera') setSocketMetaAndBroadcast(target, { videoOn: false });
      else if (action === 'enable-camera') setSocketMetaAndBroadcast(target, { videoOn: true });
      return { ok: true };
    }

    // if target is a userKey
    if (st.userMap.has(String(target))) {
      const u = st.userMap.get(String(target));
      for (const sid of Array.from(u.sockets)) {
        const tSocket = io.sockets.sockets.get(sid);
        if (tSocket) tSocket.emit('zoom:host-action', { cmd: action });
        setSocketMetaAndBroadcast(sid, { audioOn: (action === 'unmute' ? true : (action === 'mute' ? false : undefined)), videoOn: (action === 'enable-camera' ? true : (action === 'disable-camera' ? false : undefined)) });
      }
      return { ok: true };
    }

    // no matching target
    return { ok: false, message: 'target not found' };
  }

  // Connection handler
  io.on('connection', async (socket) => {
    console.log('[server] socket connected', socket.id, 'handshake=', socket.handshake && socket.handshake.auth);

    socket._zoomUser = await getUserFromSocket(socket);
    console.log('[server] auth->', socket.id, 'user=', socket._zoomUser);

    // FULL join handler
    socket.on('zoom:join', async ({ meetingId, user, historyLimit = 200 }) => {
      try {
        console.log('[server][zoom:join] attempt', socket.id, 'meetingId=', meetingId);
        // validate meeting exists
        let meeting = await Meeting.findOne({ meetingId }).lean();
        if (!meeting && mongoose.Types.ObjectId.isValid(meetingId)) meeting = await Meeting.findById(meetingId).lean();
        if (!meeting) { socket.emit('zoom:error', { message: 'Meeting not found' }); console.warn('[zoom:join] meeting not found', meetingId); return; }

        const u = socket._zoomUser || user || { _id: null, role: 'guest', fullname: (user && user.fullname) || 'Guest' };
        const role = (u.role || '').toLowerCase();

        // permission check (same logic as before)
        let allowed = false;
        if (role === 'admin' || role === 'manager') allowed = true;
        else if (role === 'teacher') {
          if (String(meeting.ownerId) === String(u._id)) allowed = true;
        } else if (role === 'student') {
          try {
            const Student = require('./models/Student');
            const s = await Student.findById(u._id).lean().catch(()=>null);
            if (s) {
              const classId = s.classId ? String(s.classId) : null;
              const allowedByClass = meeting.classIds && meeting.classIds.some(cid => String(cid) === classId);
              const allowedByStudent = meeting.studentIds && meeting.studentIds.some(sid => String(sid) === String(u._id));
              if (allowedByClass || allowedByStudent) allowed = true;
            }
          } catch (e) { /* ignore */ }
        }
        if (!allowed) { socket.emit('zoom:error', { message: 'Forbidden' }); console.warn('[zoom:join] forbidden', socket.id); return; }

        // If meeting state exists and this userKey is banned => reject
        const st = ensureMeetingState(meeting.meetingId);
        // store meeting owner id for creator checks
        if (!st.ownerId && meeting.ownerId) st.ownerId = String(meeting.ownerId);
        const userKey = userKeyFor(u, socket.id);
        if (st.banned && st.banned.has(String(userKey))) {
          socket.emit('zoom:error', { message: 'You are banned from this meeting' });
          console.warn('[zoom:join] banned user attempted to join', userKey);
          return;
        }

        // join socket.io room
        socket.join('zoom:' + meeting.meetingId);
        socket.meetingId = meeting.meetingId;
        socket.zoomUser = { _id: u._id, fullname: u.fullname || (user && user.fullname) || 'Guest', role: u.role || 'guest' };
        socket.zoomAudioOn = true;
        socket.zoomVideoOn = true;

        // attach socket -> user
        const assignedUserKey = attachSocketToUser(meeting.meetingId, socket.id, socket.zoomUser);
        socketToMeta.set(socket.id, { meetingId: meeting.meetingId, userKey: assignedUserKey, user: socket.zoomUser, audioOn: socket.zoomAudioOn, videoOn: socket.zoomVideoOn });

        // assign host if none and owner joined
        if (!st.host && String(meeting.ownerId) === String(u._id)) {
          st.host = socket.id;
          socket.emit('zoom:host-assigned', { hostId: socket.id });
          io.to('zoom:' + meeting.meetingId).emit('zoom:host-assigned', { hostId: socket.id });
        }

        // tell this socket about existing peers (socket-level)
        const clients = await io.in('zoom:' + meeting.meetingId).allSockets();
        for (const clientId of clients) {
          if (clientId === socket.id) continue;
          const s = io.sockets.sockets.get(clientId);
          if (s) socket.emit('zoom:peer-join', { id: clientId, user: s.zoomUser || null });
        }

        // broadcast participants (unique users)
        broadcastParticipants(meeting.meetingId);

        // send chat history (ascending) - limited by historyLimit
        try {
          const limit = Math.max(1, Math.min(2000, parseInt(historyLimit, 10) || 200));
          const messages = await MeetingMessage.find({ meetingId: meeting.meetingId })
            .sort({ ts: 1 })
            .limit(limit)
            .lean();

          // normalize documents so client sees `id` and `user` fields (matches live chat shape)
          const normalized = (messages || []).map(m => ({
            id: m._id ? String(m._id) : null,
            user: { _id: m.fromUserId ? String(m.fromUserId) : null, fullname: m.fromName || 'Guest' },
            text: m.text || '',
            ts: m.ts || Date.now()
          }));

          socket.emit('zoom:chat-history', { messages: normalized });
        } catch (e) {
          console.warn('[zoom:join] Failed to load chat history', e);
          socket.emit('zoom:chat-history', { messages: [] });
        }

        // notify others about socket-level join
        socket.to('zoom:' + meeting.meetingId).emit('zoom:peer-join', { id: socket.id, user: socket.zoomUser });

        // acknowledge join to this client, include ownerId so clients can show creator controls
        socket.emit('zoom:joined', { meetingId: meeting.meetingId, socketId: socket.id, ownerId: st.ownerId, chatEnabled: !!st.chatEnabled, recording: !!st.recording });

        console.log('[server][zoom:join] joined', socket.id, 'room=zoom:' + meeting.meetingId, 'userKey=', assignedUserKey);
      } catch (err) {
        console.error('zoom:join error', err && (err.stack || err));
        socket.emit('zoom:error', { message: 'Server error' });
      }
    });

    // signaling passthrough (socket-level)
    socket.on('zoom:signal', ({ to, data }) => {
      if (!to || !data) return;
      const toSocket = io.sockets.sockets.get(to);
      if (toSocket) toSocket.emit('zoom:signal', { from: socket.id, data, fromUser: socket.zoomUser || null });
    });

    // chat handler (enhanced to persist and include id), respects st.chatEnabled
    socket.on('zoom:chat', async ({ to, text }) => {
      try {
        console.log('[server][zoom:chat] received from', socket.id, 'to=', to, 'text=', text && String(text).slice(0,200));

        if (!socket.meetingId) {
          console.warn('[zoom:chat] socket not in meeting, rejecting chat from', socket.id);
          socket.emit('zoom:error', { message: 'You are not in a meeting' });
          return;
        }

        const st = ensureMeetingState(socket.meetingId);
        const isHostOrCreator = (st.host === socket.id) || (socket.zoomUser && st.ownerId && String(socket.zoomUser._id) === String(st.ownerId));
        if (!st.chatEnabled && !isHostOrCreator) {
          socket.emit('zoom:error', { message: 'Chat is disabled by host' });
          return;
        }

        const userKey = socket.zoomUser && socket.zoomUser._id ? String(socket.zoomUser._id) : `guest:${socket.id}`;
        pruneAndCount(userKey);
        const current = pruneAndCount(userKey);
        if (current >= CHAT_RATE_LIMIT) {
          socket.emit('zoom:error', { message: 'You are sending messages too fast. Please slow down.' });
          return;
        }
        const arr = chatRateMap.get(userKey) || [];
        arr.push(Date.now());
        chatRateMap.set(userKey, arr);

        const payload = {
          meetingId: socket.meetingId,
          fromUserId: socket.zoomUser && socket.zoomUser._id ? socket.zoomUser._id : null,
          fromName: (socket.zoomUser && socket.zoomUser.fullname) ? socket.zoomUser.fullname : (socket.zoomUser && socket.zoomUser._id) || 'Guest',
          toTarget: to || null,
          text: String(text || ''),
          ts: Date.now()
        };

        let createdDoc = null;
        try {
          const doc = {
            meetingId: payload.meetingId,
            fromUserId: payload.fromUserId ? (mongoose.Types.ObjectId.isValid(String(payload.fromUserId)) ? new mongoose.Types.ObjectId(String(payload.fromUserId)) : null) : null,
            fromName: payload.fromName,
            toSocketId: null,
            toUserId: null,
            text: payload.text,
            ts: payload.ts
          };

          if (payload.toTarget) {
            const toRaw = String(payload.toTarget);
            if (toRaw.startsWith('socket:')) doc.toSocketId = toRaw.replace(/^socket:/, '');
            else if (toRaw.startsWith('guest:')) doc.toSocketId = toRaw;
            else if (mongoose.Types.ObjectId.isValid(toRaw)) doc.toUserId = new mongoose.Types.ObjectId(toRaw);
            else doc.toSocketId = toRaw;
          }

          createdDoc = await MeetingMessage.create(doc);
          setImmediate(() => trimChatHistory(payload.meetingId, 2000).catch(()=>{}));
        } catch (e) {
          console.warn('[zoom:chat] persist failed', e);
        }

        const out = {
          id: createdDoc ? String(createdDoc._id) : null,
          user: { _id: payload.fromUserId, fullname: payload.fromName },
          text: payload.text,
          from: socket.id,
          ts: payload.ts
        };

        const room = 'zoom:' + socket.meetingId;
        const st2 = ensureMeetingState(socket.meetingId);

        if (payload.toTarget) {
          const toRaw = String(payload.toTarget);
          if (st2 && st2.userMap && st2.userMap.has(toRaw)) {
            const targetMeta = st2.userMap.get(toRaw);
            for (const sid of targetMeta.sockets) {
              const tSocket = io.sockets.sockets.get(sid);
              if (tSocket) tSocket.emit('zoom:chat', out);
            }
            socket.emit('zoom:chat', out);
            console.log('[zoom:chat] delivered to userKey=', toRaw);
            return;
          }

          const sidCandidate = toRaw.startsWith('socket:') ? toRaw.replace(/^socket:/,'') : toRaw;
          const tSocket = io.sockets.sockets.get(sidCandidate);
          if (tSocket) {
            tSocket.emit('zoom:chat', out);
            socket.emit('zoom:chat', out);
            console.log('[zoom:chat] delivered to socketId=', sidCandidate);
            return;
          }

          socket.emit('zoom:error', { message: 'Recipient not found' });
          console.warn('[zoom:chat] recipient not found for to=', toRaw);
          return;
        } else {
          io.to(room).emit('zoom:chat', out);
          console.log('[zoom:chat] broadcasted to room=', room);
        }
      } catch (e) {
        console.warn('zoom:chat error', e);
      }
    });

    // message delete (creator only or host)
    socket.on('zoom:delete-message', async ({ meetingId, messageId }) => {
      try {
        const st = meetingState.get(meetingId);
        if (!st) return;
        // permission: allow if socket is host or socket.zoomUser._id === st.ownerId
        const isCreator = socket.zoomUser && String(socket.zoomUser._id) === String(st.ownerId);
        if (st.host !== socket.id && !isCreator) return socket.emit('zoom:error', { message: 'Not allowed' });

        // delete from DB
        try {
          await MeetingMessage.deleteOne({ _id: messageId }).catch(()=>{});
        } catch (e) { console.warn('delete message db error', e); }

        // broadcast deletion
        io.to('zoom:' + meetingId).emit('zoom:message-deleted', { id: messageId });
        // audit
        try {
          const byUserId = socket.zoomUser && socket.zoomUser._id ? (mongoose.Types.ObjectId.isValid(String(socket.zoomUser._id)) ? new mongoose.Types.ObjectId(String(socket.zoomUser._id)) : null) : null;
          MeetingAudit.create({
            meetingId,
            action: 'delete-message',
            byUserId,
            byName: socket.zoomUser && socket.zoomUser.fullname ? socket.zoomUser.fullname : null,
            target: messageId,
            meta: {}
          }).catch(()=>{});
        } catch (e) {}
      } catch (e) { console.warn('zoom:delete-message error', e); }
    });

    // status update (socket-level)
    socket.on('zoom:status', ({ audioOn, videoOn }) => {
      try {
        const meta = socketToMeta.get(socket.id);
        if (!meta) return;
        const { meetingId, userKey } = meta;
        meta.audioOn = typeof audioOn === 'boolean' ? !!audioOn : meta.audioOn;
        meta.videoOn = typeof videoOn === 'boolean' ? !!videoOn : meta.videoOn;
        socketToMeta.set(socket.id, meta);

        const st = meetingState.get(meetingId);
        if (!st) return;
        const u = st.userMap.get(userKey);
        if (!u) return;
        let audioAny = false, videoAny = false;
        for (const sid of u.sockets) {
          const sm = socketToMeta.get(sid);
          if (!sm) continue;
          if (sm.audioOn) audioAny = true;
          if (sm.videoOn) videoAny = true;
          if (audioAny && videoAny) break;
        }
        u.audioOn = audioAny;
        u.videoOn = videoAny;
        st.userMap.set(userKey, u);
        broadcastParticipants(meetingId);
      } catch (e) { console.warn('zoom:status error', e); }
    });

    // host-command with audit logging (EXTENDED) plus ban/unban
    socket.on('zoom:host-command', async ({ meetingId, cmd, target }) => {
      try {
        const st = meetingState.get(meetingId);
        if (!st) return;
        // allow if host socket OR meeting creator (ownerId)
        const isCreator = socket.zoomUser && String(socket.zoomUser._id) === String(st.ownerId);
        if (st.host !== socket.id && !isCreator) return; // not allowed

        // write audit
        const byUserId = socket.zoomUser && socket.zoomUser._id ? (mongoose.Types.ObjectId.isValid(String(socket.zoomUser._id)) ? new mongoose.Types.ObjectId(String(socket.zoomUser._id)) : null) : null;
        const byName = socket.zoomUser && socket.zoomUser.fullname ? socket.zoomUser.fullname : null;
        const auditEntry = { meetingId, action: cmd, byUserId, byName, target: target || null, meta: {} };
        MeetingAudit.create(auditEntry).catch(e => console.warn('Failed to write audit', e));

        // Global actions
        if (cmd === 'mute-everyone') {
          const room = 'zoom:' + meetingId;
          const clients = await io.in(room).allSockets();
          for (const sid of clients) {
            setSocketMetaAndBroadcast(sid, { audioOn: false });
            const tSocket = io.sockets.sockets.get(sid);
            if (tSocket) tSocket.emit('zoom:host-action', { cmd: 'mute' });
          }
          io.to(room).emit('zoom:host-action', { cmd: 'mute' });
          return;
        } else if (cmd === 'disable-camera') {
          const room = 'zoom:' + meetingId;
          const clients = await io.in(room).allSockets();
          for (const sid of clients) {
            setSocketMetaAndBroadcast(sid, { videoOn: false });
            const tSocket = io.sockets.sockets.get(sid);
            if (tSocket) tSocket.emit('zoom:host-action', { cmd: 'disable-camera' });
          }
          io.to(room).emit('zoom:host-action', { cmd: 'disable-camera' });
          return;
        }

        // recording start/stop: server only broadcasts and records audit (recording itself done on host client)
        if (cmd === 'start-record') {
          st.recording = true;
          io.to('zoom:' + meetingId).emit('zoom:recording', { recording: true, by: byName || null });
          broadcastParticipants(meetingId);
          return;
        } else if (cmd === 'stop-record') {
          st.recording = false;
          io.to('zoom:' + meetingId).emit('zoom:recording', { recording: false, by: byName || null });
          broadcastParticipants(meetingId);
          return;
        }

        // chat toggle: enable/disable
        if (cmd === 'disable-chat') {
          st.chatEnabled = false;
          io.to('zoom:' + meetingId).emit('zoom:chat-toggled', { enabled: false });
          broadcastParticipants(meetingId);
          return;
        } else if (cmd === 'enable-chat') {
          st.chatEnabled = true;
          io.to('zoom:' + meetingId).emit('zoom:chat-toggled', { enabled: true });
          broadcastParticipants(meetingId);
          return;
        }

        // Ban/unban user (creator only)
        if (cmd === 'ban-user' && target) {
          st.banned.add(String(target));
          if (st.userMap.has(String(target))) {
            const u = st.userMap.get(String(target));
            for (const sid of Array.from(u.sockets)) {
              const tSocket = io.sockets.sockets.get(sid);
              if (tSocket) tSocket.emit('zoom:host-action', { cmd: 'kick', reason: 'Banned by creator' });
              try { tSocket.leave('zoom:' + meetingId); } catch(e){}
              socketToMeta.delete(sid);
            }
            st.userMap.delete(String(target));
          }
          broadcastParticipants(meetingId);
          // audit recorded above
          return;
        } else if (cmd === 'unban-user' && target) {
          st.banned.delete(String(target));
          broadcastParticipants(meetingId);
          return;
        }

        // targeted commands: mute-user, unmute-user, disable-camera-user, enable-camera-user, kick
        if (cmd === 'kick' && target) {
          const meta = socketToMeta.get(target);
          if (meta) {
            const tSocket = io.sockets.sockets.get(target);
            if (tSocket) tSocket.emit('zoom:host-action', { cmd: 'kick', reason: 'Removed by host' });
            detachSocketFromUser(meetingId, target, meta.userKey);
            try { tSocket.leave('zoom:' + meetingId); } catch(e){}
            socketToMeta.delete(target);
            broadcastParticipants(meetingId);
            io.to('zoom:' + meetingId).emit('zoom:peer-left', { id: target });
            return;
          } else if (st.userMap.has(String(target))) {
            const u = st.userMap.get(String(target));
            for (const sid of Array.from(u.sockets)) {
              const tSocket = io.sockets.sockets.get(sid);
              if (tSocket) tSocket.emit('zoom:host-action', { cmd: 'kick', reason: 'Removed by host' });
              try { tSocket.leave('zoom:' + meetingId); } catch(e){}
              socketToMeta.delete(sid);
            }
            st.userMap.delete(String(target));
            broadcastParticipants(meetingId);
            io.to('zoom:' + meetingId).emit('zoom:peer-left', { id: String(target) });
            return;
          }
        }

        if (cmd === 'mute-user') {
          const res = await applyHostActionToTarget(meetingId, target, 'mute');
          if (!res.ok) socket.emit('zoom:error', { message: res.message || 'target not found' });
          return;
        } else if (cmd === 'unmute-user') {
          const res = await applyHostActionToTarget(meetingId, target, 'unmute');
          if (!res.ok) socket.emit('zoom:error', { message: res.message || 'target not found' });
          return;
        } else if (cmd === 'disable-camera-user') {
          const res = await applyHostActionToTarget(meetingId, target, 'disable-camera');
          if (!res.ok) socket.emit('zoom:error', { message: res.message || 'target not found' });
          return;
        } else if (cmd === 'enable-camera-user') {
          const res = await applyHostActionToTarget(meetingId, target, 'enable-camera');
          if (!res.ok) socket.emit('zoom:error', { message: res.message || 'target not found' });
          return;
        }

        // fallback - if unknown, broadcast (keeps compatibility)
        io.to('zoom:' + meetingId).emit('zoom:host-action', { cmd });
      } catch (e) { console.warn('host-command error', e); }
    });

    // explicit leave
    socket.on('zoom:leave', async () => {
      try {
        const meta = socketToMeta.get(socket.id);
        if (meta) {
          const { meetingId, userKey } = meta;
          detachSocketFromUser(meetingId, socket.id, userKey);
          socketToMeta.delete(socket.id);

          const st = meetingState.get(meetingId);
          if (st && st.host === socket.id) st.host = null;
          if (st && !st.host && st.userMap.size > 0) {
            const it = st.userMap.entries().next();
            if (!it.done) {
              const firstUserMeta = it.value[1];
              if (firstUserMeta && firstUserMeta.sockets.size) {
                st.host = firstUserMeta.sockets.values().next().value;
                io.to('zoom:' + meetingId).emit('zoom:host-assigned', { hostId: st.host });
              }
            }
          }
          broadcastParticipants(meetingId);
        }
        try { socket.leave('zoom:' + (socket.meetingId || '')); } catch(e){}
        socket.meetingId = null;
      } catch (e) { console.warn('zoom:leave error', e); }
    });

    // disconnect handling
    socket.on('disconnect', async () => {
      try {
        console.log('[server] disconnect', socket.id);
        const meta = socketToMeta.get(socket.id);
        if (!meta) return;
        const { meetingId, userKey } = meta;
        detachSocketFromUser(meetingId, socket.id, userKey);
        socketToMeta.delete(socket.id);

        const st = meetingState.get(meetingId);
        if (!st) return;
        if (st.host === socket.id) st.host = null;
        if (!st.host && st.userMap.size > 0) {
          const it = st.userMap.entries().next();
          if (!it.done) {
            const chosenUserMeta = it.value[1];
            if (chosenUserMeta && chosenUserMeta.sockets.size) {
              st.host = chosenUserMeta.sockets.values().next().value;
              io.to('zoom:' + meetingId).emit('zoom:host-assigned', { hostId: st.host });
            }
          }
        }
        socket.to('zoom:' + meetingId).emit('zoom:peer-left', { id: socket.id });
        broadcastParticipants(meetingId);

        const cur = meetingState.get(meetingId);
        if (cur && cur.userMap.size === 0) meetingState.delete(meetingId);
      } catch (err) {
        console.error('disconnect error', err);
      }
    });

  }); // io.on('connection')

}; // module.exports
