// frontend/js/help-client.js
// -- require that helpers exist: apiFetch, getCurrentUser, tpl, escapeHtml, showModal, getToken, SERVER_BASE, app

const socketHelp = (() => {
  const token = (typeof getToken === 'function') ? getToken() : null;
  const ioOpts = token ? { auth: { token } } : {};
  try {
    const base = (typeof SERVER_BASE === 'string' && SERVER_BASE) ? SERVER_BASE : '';
    const s = io(base || '', ioOpts);
    s.on('connect_error', (err) => console.warn('Socket connect_error', err && (err.message || err)));
    s.on('reconnect_error', (err) => console.warn('Socket reconnect_error', err && (err.message || err)));
    s.on('error', (e) => console.warn('Socket error', e));
    s.on('connect', () => console.debug('[socket] connected', s.id));
    s.on('disconnect', (reason) => console.debug('[socket] disconnected', reason));
    return s;
  } catch (e) {
    console.warn('socket.io not available', e);
    return { on: ()=>{}, emit: ()=>{}, disconnect: ()=>{} };
  }
})();

const __HELP_MSGS = new Map();
let __helpPollingTimer = null;
let __helpIsFetching = false;

async function loadTopics(topicsWrap) {
  try {
    const wrap = topicsWrap || document.getElementById('help-topics');
    if (!wrap) return;
    const r = await apiFetch('/help/problems');
    console.debug('[help] topics response', r);
    if (r && r.ok && Array.isArray(r.topics)) {
      wrap.innerHTML = '';
      r.topics.forEach(t => {
        const d = document.createElement('div');
        d.style.marginBottom = '8px';
        d.innerHTML = `<strong>${escapeHtml(t.title)}</strong><div class="muted small">${escapeHtml((t.steps || []).join(' • '))}</div>`;
        wrap.appendChild(d);
      });
    } else {
      wrap.innerHTML = '<div class="muted">No help topics</div>';
    }
  } catch (e) {
    console.warn('loadTopics failed', e);
  }
}

function shouldShowMessageToClient(msg) {
  try {
    const me = window.__CURRENT_USER || null;
    const myId = me && me._id ? String(me._id) : null;
    const myRole = me && me.role ? (me.role || '').toLowerCase() : '';

    // Owner always sees own messages
    if (myId && msg.from && String(myId) === String(msg.from)) return { allow: true, reason: 'owner' };

    // Private -> only admin/manager or owner (owner handled above)
    if (msg.private) {
      if (myRole === 'admin' || myRole === 'manager') return { allow: true, reason: 'private allowed for admin/manager' };
      return { allow: false, reason: 'private not allowed for this user' };
    }

    // If message targets a role, then client role must match
    if (msg.toRole) {
      if (!myRole) return { allow: false, reason: 'no client role' };
      if (myRole === msg.toRole.toLowerCase()) return { allow: true, reason: 'role matches' };
      // else hidden for non-matching roles
      return { allow: false, reason: `toRole mismatch (msg->${msg.toRole})` };
    }

    // If broadcastToAll -> allowed
    if (msg.broadcastToAll) return { allow: true, reason: 'broadcast' };

    // toUser handled server-side; if toUser is this client allow
    if (msg.toUser && myId && String(msg.toUser) === String(myId)) return { allow: true, reason: 'directed to this user' };

    // fallback: show message
    return { allow: true, reason: 'fallback allow' };
  } catch (err) {
    console.error('shouldShowMessageToClient error', err);
    return { allow: false, reason: 'error' };
  }
}

function renderHelpMessageNode(msg) {
  try {
    const me = window.__CURRENT_USER || null;
    const myId = me && me._id ? String(me._id) : null;

    const check = shouldShowMessageToClient(msg);
    if (!check.allow) {
      console.debug('[help] render skipped msg', msg._id, check.reason);
      return null;
    }

    __HELP_MSGS.set(String(msg._id), msg); // cache

    const wrapper = document.createElement('div');
    wrapper.className = 'help-msg card';
    wrapper.dataset.id = msg._id;

    const fromLabel = escapeHtml(msg.fromName || 'Unknown');
    const time = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '';

    let targetText = '';
    if (msg.private) targetText = ` → (private)`;
    else if (msg.toUser) targetText = ` → (private)`;
    else if (msg.toRole) targetText = ` → ${escapeHtml(msg.toRole)}`;
    else if (msg.broadcastToAll) targetText = ` → Everyone`;

    let replyPreviewHtml = '';
    if (msg.replyTo) {
      const parent = __HELP_MSGS.get(String(msg.replyTo));
      if (parent) {
        const short = (parent.text || '').slice(0, 160);
        replyPreviewHtml = `<div class="help-reply-preview" style="background:#f8fafc;padding:8px;border-radius:6px;margin-bottom:6px;color:#374151"><strong>${escapeHtml(parent.fromName || 'Unknown')} said:</strong><div style="font-size:13px;">${escapeHtml(short)}${(parent.text||'').length>160 ? '...' : ''}</div></div>`;
      } else {
        replyPreviewHtml = `<div class="help-reply-preview muted" style="margin-bottom:6px">(reply to message)</div>`;
      }
    }

    wrapper.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="font-weight:700">${fromLabel} <span class="muted" style="font-weight:500;font-size:12px">${targetText}</span></div>
        <div class="muted small" style="font-size:12px">${time}</div>
      </div>
      <div style="margin-top:6px">${replyPreviewHtml}<div class="help-text">${escapeHtml(msg.text)}</div></div>
      <div class="help-meta" style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"></div>
    `;

    const meta = wrapper.querySelector('.help-meta');

    const replyBtn = document.createElement('button');
    replyBtn.className = 'btn btn--outline';
    replyBtn.textContent = 'Reply';
    replyBtn.addEventListener('click', () => {
      const input = document.getElementById('help-text');
      if (!input) return;
      input.value = `@${msg.fromName || ''} `;
      input.dataset.replyTo = msg._id;
      input.focus();
    });
    meta.appendChild(replyBtn);

    // reactions
    const grouped = {};
    if (Array.isArray(msg.reactions)) msg.reactions.forEach(r => grouped[r.emoji] = (grouped[r.emoji]||0)+1);
    const reactionWrap = document.createElement('div');
    reactionWrap.style.display = 'flex';
    reactionWrap.style.gap = '6px';
    reactionWrap.style.alignItems = 'center';
    const emojis = ['👍','❤️','😮'];
    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'btn btn--outline';
      btn.style.padding = '6px 8px';
      btn.textContent = `${emoji} ${grouped[emoji] || ''}`.trim();
      btn.title = grouped[emoji] ? `${grouped[emoji]} reactions` : `React ${emoji}`;
      btn.addEventListener('click', async () => {
        try { await apiFetch(`/help/react/${msg._id}`, { method: 'POST', body: { emoji } }); }
        catch (e) { console.error('react failed', e); alert('Reaction failed'); }
      });
      reactionWrap.appendChild(btn);
    });
    Object.keys(grouped).filter(e => !emojis.includes(e)).forEach(e => {
      const btn = document.createElement('button');
      btn.className = 'btn btn--outline';
      btn.style.padding = '6px 8px';
      btn.textContent = `${e} ${grouped[e] || ''}`.trim();
      btn.title = `${grouped[e]} reactions`;
      btn.addEventListener('click', async () => {
        try { await apiFetch(`/help/react/${msg._id}`, { method: 'POST', body: { emoji: e } }); } catch (err) { console.error(err); }
      });
      reactionWrap.appendChild(btn);
    });
    meta.appendChild(reactionWrap);

    // delete (owner/admin/manager)
    const isOwner = (window.__CURRENT_USER && window.__CURRENT_USER._id && msg.from) && String(msg.from) === String(window.__CURRENT_USER._id);
    const isAdmin = (window.__CURRENT_USER && window.__CURRENT_USER.role || '').toLowerCase() === 'admin';
    const isManager = (window.__CURRENT_USER && window.__CURRENT_USER.role || '').toLowerCase() === 'manager';
    if (isOwner || isAdmin || isManager) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this message?')) return;
        try {
          const r = await apiFetch(`/help/${msg._id}`, { method: 'DELETE' });
          if (!r || !r.ok) throw new Error((r && (r.message || r.error)) || 'Delete failed');
          const node = document.querySelector(`.help-msg[data-id="${msg._id}"]`);
          if (node) node.remove();
          __HELP_MSGS.delete(msg._id);
        } catch (e) { console.error('delete failed', e); alert('Delete failed: ' + (e && e.message ? e.message : 'unknown')); }
      });
      meta.appendChild(delBtn);
    }

    return wrapper;
  } catch (err) {
    console.error('renderHelpMessageNode error', err);
    return null;
  }
}

async function loadMessagesDiff(messagesWrap) {
  if (__helpIsFetching) return;
  if (!messagesWrap) { console.warn('loadMessagesDiff: messagesWrap not found'); return; }
  __helpIsFetching = true;
  try {
    const r = await apiFetch('/help');
    console.debug('[help] /help response', r);
    if (!r || !r.ok) {
      console.warn('help load failed', r);
      return;
    }
    const msgs = r.messages || [];
    msgs.reverse(); // oldest -> newest
    const seen = new Set(msgs.map(m => String(m._id)));

    // remove nodes no longer present
    const existingNodes = Array.from(messagesWrap.querySelectorAll('.help-msg'));
    for (const n of existingNodes) {
      if (!seen.has(String(n.dataset.id))) {
        n.remove();
        __HELP_MSGS.delete(n.dataset.id);
      }
    }

    // append/update
    for (const m of msgs) {
      __HELP_MSGS.set(String(m._id), m);
      const existing = messagesWrap.querySelector(`.help-msg[data-id="${m._id}"]`);
      if (existing) {
        const newNode = renderHelpMessageNode(m);
        if (newNode) existing.replaceWith(newNode);
        else existing.remove();
        continue;
      }
      const node = renderHelpMessageNode(m);
      if (!node) continue;
      messagesWrap.appendChild(node);
    }

    messagesWrap.scrollTop = messagesWrap.scrollHeight;
  } catch (err) {
    console.error('loadMessagesDiff error', err);
  } finally {
    __helpIsFetching = false;
  }
}

async function renderHelpPage() {
  try {
    app.innerHTML = '';
    const frag = tpl('help');
    app.appendChild(frag);

    await getCurrentUser(true).catch(()=>null);
    const me = window.__CURRENT_USER || null;
    const myRole = me && me.role ? (me.role || '').toLowerCase() : '';

    const sendBtn = document.getElementById('help-send-btn');
    const textEl = document.getElementById('help-text');
    const messagesWrap = document.getElementById('help-messages');
    const targetType = document.getElementById('help-target-type');
    const targetWrapper = document.getElementById('help-target-wrapper');
    const privateCheckbox = document.getElementById('help-private-checkbox');
    const needHelpBtn = document.getElementById('btn-need-help');
    const topicsWrap = document.getElementById('help-topics');

    if (!messagesWrap) {
      console.error('renderHelpPage: help-messages element missing from template');
      app.innerHTML = '<div class="page"><h2>Help UI error</h2><p>Missing help containers. Open console.</p></div>';
      return;
    }

    if (targetWrapper) targetWrapper.style.display = (myRole === 'manager' || myRole === 'admin') ? '' : 'none';

    // populate role dropdown
    if (targetType) {
      targetType.innerHTML = '';
      if (myRole === 'admin') {
        [['student','Students'], ['teacher','Teachers'], ['manager','Managers'], ['','General (broadcast)']].forEach(opt => {
          const o = document.createElement('option'); o.value = opt[0]; o.textContent = opt[1]; targetType.appendChild(o);
        });
      } else if (myRole === 'manager') {
        [['student','Students'], ['teacher','Teachers'], ['','General (broadcast)']].forEach(opt => {
          const o = document.createElement('option'); o.value = opt[0]; o.textContent = opt[1]; targetType.appendChild(o);
        });
      } else {
        const o = document.createElement('option'); o.value = ''; o.textContent = 'Manager only'; targetType.appendChild(o);
      }
    }

    sendBtn.addEventListener('click', async () => {
      try {
        const text = (textEl.value || '').trim();
        if (!text) return alert('Please enter a message');
        const meNow = await getCurrentUser(true).catch(()=>null);
        if (!meNow) return alert('You must be logged in');

        const payload = { text };
        if (myRole === 'manager' || myRole === 'admin') {
          if (targetType && targetType.value) payload.toRole = targetType.value;
          else payload.broadcastToAll = true;
        } else {
          payload.toRole = 'manager';
        }

        if (privateCheckbox && privateCheckbox.checked) payload.private = true;
        if (textEl.dataset.replyTo) payload.replyTo = textEl.dataset.replyTo;

        console.debug('[help] sending payload', payload);
        const r = await apiFetch('/help', { method: 'POST', body: payload });
        console.debug('[help] send response', r);

        if (!r || !r.ok) throw new Error((r && (r.message || r.error)) || 'Send failed');

        const m = r.message || null;
        if (m) {
          __HELP_MSGS.set(String(m._id), m);
          const node = renderHelpMessageNode(m);
          if (node) messagesWrap.appendChild(node);
          messagesWrap.scrollTop = messagesWrap.scrollHeight;
        } else {
          await loadMessagesDiff(messagesWrap);
        }

        textEl.value = '';
        delete textEl.dataset.replyTo;
        if (privateCheckbox) privateCheckbox.checked = false;
      } catch (e) {
        console.error('send failed', e);
        alert('Send failed: ' + (e && e.message ? e.message : 'unknown'));
      }
    });

    needHelpBtn.addEventListener('click', async () => {
      const node = document.createElement('div');
      node.innerHTML = `<h3>Need Help</h3><p class="muted">Helpful troubleshooting steps. If unresolved, send a message to your manager.</p>`;
      try {
        const r = await apiFetch('/help/problems');
        if (r && r.ok && Array.isArray(r.topics)) {
          r.topics.forEach(t => {
            const tdiv = document.createElement('div'); tdiv.style.marginBottom = '12px';
            tdiv.innerHTML = `<strong>${escapeHtml(t.title)}</strong><ol>${t.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;
            node.appendChild(tdiv);
          });
        }
      } catch (e) {
        node.appendChild(Object.assign(document.createElement('div'), { textContent: 'Failed to load topics' }));
      }
      showModal(node);
    });

    // socket handlers
    const sock = socketHelp;
    sock.on('help:new', (m) => {
      try {
        console.debug('[socket] help:new', m);
        if (!m || !m._id) return;
        if (__HELP_MSGS.has(m._id)) return;

        // Use same shouldShowMessageToClient logic for socket events:
        const check = shouldShowMessageToClient(m);
        if (!check.allow) {
          console.debug('[socket] help:new skipped message', m._id, check.reason);
          return;
        }

        __HELP_MSGS.set(String(m._id), m);
        const node = renderHelpMessageNode(m);
        if (!node) return;
        messagesWrap.appendChild(node);
        messagesWrap.scrollTop = messagesWrap.scrollHeight;
      } catch (e) { console.warn('help:new handler error', e); }
    });

    sock.on('help:update', (update) => {
      try {
        console.debug('[socket] help:update', update);
        if (!update || !update._id) return;
        const existing = __HELP_MSGS.get(update._id) || {};
        const merged = Object.assign({}, existing, update);
        __HELP_MSGS.set(update._id, merged);
        const node = document.querySelector(`.help-msg[data-id="${update._id}"]`);
        if (node) {
          const newNode = renderHelpMessageNode(merged);
          if (newNode) node.replaceWith(newNode);
          else node.remove();
        }
      } catch (e) { console.warn('help:update error', e); }
    });

    sock.on('help:delete', (d) => {
      try {
        console.debug('[socket] help:delete', d);
        if (!d || !d._id) return;
        const node = document.querySelector(`.help-msg[data-id="${d._id}"]`);
        if (node) node.remove();
        __HELP_MSGS.delete(d._id);
      } catch (e) { console.warn('help:delete error', e); }
    });

    await loadTopics();
    await loadMessagesDiff(messagesWrap);

    if (__helpPollingTimer) { clearInterval(__helpPollingTimer); __helpPollingTimer = null; }
    __helpPollingTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadMessagesDiff(messagesWrap).catch((e)=>{ console.warn('polling load failed', e); });
    }, 2000);

  } catch (err) {
    console.error('renderHelpPage fatal error', err);
    app.innerHTML = '<div class="page"><h2>Help loading error</h2><p>Open console for details.</p></div>';
  }
}

window.renderHelpPage = renderHelpPage;
