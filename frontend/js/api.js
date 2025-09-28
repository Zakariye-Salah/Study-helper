// frontend/js/api.js
// ------------------ retained original API_BASE logic ------------------
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : '/api';

function getToken(){ return localStorage.getItem('auth_token'); }

// ------------------ original helpers (kept, slightly reorganized) ------------------

// Parse response body robustly (JSON or text)
async function parseResponseBody(res){
  const contentType = res.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      return await res.json();
    } else {
      const txt = await res.text();
      try { return JSON.parse(txt); } catch(e) { return txt; }
    }
  } catch (e) {
    // if reading fails, return null
    return null;
  }
}

async function handleResponse(res, path){
  // handle 401 first
  if (res.status === 401) {
    // clear token and bubble up an Unauthorized error
    try { localStorage.removeItem('auth_token'); } catch(e){/*ignore*/ }
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const body = await parseResponseBody(res);

  if (!res.ok) {
    // Try to extract a useful message
    let msg = `HTTP ${res.status}`;
    if (body && typeof body === 'object') {
      if (body.message) msg = String(body.message);
      else if (body.detail) msg = String(body.detail);
      else if (body.error) msg = String(body.error);
      else msg = JSON.stringify(body);
    } else if (typeof body === 'string' && body.trim()) {
      msg = body;
    }

    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

async function apiFetch(path, opts = {}){
  opts.headers = opts.headers || {};

  // attach Authorization header if token present
  const token = getToken();
  if (token) {
    opts.headers['Authorization'] = 'Bearer ' + token;
  }

  // If body is an object and not FormData, send as JSON
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    // ensure we don't double-stringify
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
    opts.body = JSON.stringify(opts.body);
  }

  // default method
  if (!opts.method) opts.method = opts.body ? 'POST' : 'GET';

  // Make full URL relative to API_BASE (ensures correct origin)
  const url = (path.startsWith('http') ? path : API_BASE + path);

  // fetch with try/catch to surface network errors
  try {
    const res = await fetch(url, opts);
    return await handleResponse(res, path);
  } catch (err) {
    // Network errors or parse errors end up here
    if (err instanceof TypeError && err.message && err.message.includes('Failed to fetch')) {
      throw new Error('Network error: unable to reach server');
    }
    // If the error thrown earlier already has useful info, rethrow
    throw err;
  }
}

// Upload helper (POST FormData). DO NOT set Content-Type for FormData.
async function apiUpload(path, formData){
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const url = (path.startsWith('http') ? path : API_BASE + path);
    const res = await fetch(url, { method: 'POST', headers, body: formData });
    return await handleResponse(res, path);
  } catch (err) {
    if (err instanceof TypeError && err.message && err.message.includes('Failed to fetch')) {
      throw new Error('Network error: unable to reach server');
    }
    throw err;
  }
}

// PUT with FormData (multipart)
async function apiPutUpload(path, formData){
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const url = (path.startsWith('http') ? path : API_BASE + path);
    const res = await fetch(url, { method: 'PUT', headers, body: formData });
    return await handleResponse(res, path);
  } catch (err) {
    if (err instanceof TypeError && err.message && err.message.includes('Failed to fetch')) {
      throw new Error('Network error: unable to reach server');
    }
    throw err;
  }
}

// convenience wrapper for GET
async function apiGet(path){
  return await apiFetch(path, { method: 'GET' });
}

// small helper to POST JSON easily
async function apiPost(path, jsonObj){
  return await apiFetch(path, { method: 'POST', body: jsonObj });
}

// ------------------ new helpers: unread / mentions / mute ------------------

/**
 * apiMarkSeen(classId)
 * - Persist that the current user opened/seen `classId` at now.
 * - Server should record { userId, classId, lastSeen }.
 * - Useful to calculate unread counts server-side.
 */
async function apiMarkSeen(classId) {
  if (!classId) throw new Error('classId required for apiMarkSeen');
  // endpoint: POST /chats/class/:classId/seen
  return await apiPost(`/chats/class/${encodeURIComponent(classId)}/seen`, { lastSeen: new Date().toISOString() });
}

/**
 * apiGetUnreadCounts(classId, sinceISO)
 * - returns { ok:true, count: N } where count = messages for classId after `sinceISO`
 * - `sinceISO` optional; server may ignore and compute using stored lastSeen per user
 */
async function apiGetUnreadCounts(classId, sinceISO = null) {
  if (!classId) throw new Error('classId required for apiGetUnreadCounts');
  const q = sinceISO ? `?since=${encodeURIComponent(sinceISO)}` : '';
  return await apiGet(`/chats/unread?classId=${encodeURIComponent(classId)}${sinceISO ? '&since=' + encodeURIComponent(sinceISO) : ''}`);
}

/**
 * apiParseMentions(text)
 * - POSTs message text to server-side mention parser which returns an array of user identifiers to notify.
 * - server endpoint: POST /chats/mentions/parse  { text }
 */
async function apiParseMentions(text) {
  if (!text || typeof text !== 'string') return [];
  try {
    const res = await apiPost('/chats/mentions/parse', { text });
    return (res && res.ok && Array.isArray(res.mentions)) ? res.mentions : (res && res.mentions) || [];
  } catch (e) {
    // parsing errors shouldn't block message send
    console.warn('apiParseMentions error', e && e.message ? e.message : e);
    return [];
  }
}

/**
 * apiNotifyMentions(classId, messageId, mentions)
 * - Tells server to create mention notifications and push via sockets to mentioned users.
 * - server endpoint: POST /chats/class/:classId/mentions  { messageId, mentions: [...] }
 */
async function apiNotifyMentions(classId, messageId, mentions = []) {
  if (!classId || !messageId || !Array.isArray(mentions)) return null;
  return await apiPost(`/chats/class/${encodeURIComponent(classId)}/mentions`, { messageId, mentions });
}

/**
 * apiMuteUser(classId, userId, duration, reason)
 * - duration can be 'hour','day','month','year' or numeric ms
 * - server endpoint: POST /chats/class/:classId/mute
 */
async function apiMuteUser(classId, userId, duration = 'hour', reason = '') {
  if (!classId || !userId) throw new Error('classId and userId required for apiMuteUser');
  return await apiPost(`/chats/class/${encodeURIComponent(classId)}/mute`, { userId, duration, reason });
}

/**
 * apiUnmuteUser(classId, userId)
 * - server endpoint: POST /chats/class/:classId/unmute
 */
async function apiUnmuteUser(classId, userId) {
  if (!classId || !userId) throw new Error('classId and userId required for apiUnmuteUser');
  return await apiPost(`/chats/class/${encodeURIComponent(classId)}/unmute`, { userId });
}

// ------------------ small UI helper for animating buttons ------------------
/**
 * animateButton(btn)
 * - Adds a transient animation class to a button; requires matching CSS in your style sheet:
 *   .btn--pulse { transform: scale(0.98); transition: transform 120ms ease; }
 *   .btn--pulse.animate { transform: scale(1.06); }
 */
function animateButton(btn, opts = {}) {
  if (!btn || !(btn instanceof Element)) return;
  const cls = opts.className || 'btn--pulse';
  btn.classList.add(cls);
  // tiny reflow then add animate
  // eslint-disable-next-line no-unused-expressions
  btn.offsetHeight;
  btn.classList.add('animate');
  setTimeout(() => {
    btn.classList.remove('animate');
    // keep base class if you want; remove both after short delay
    setTimeout(() => btn.classList.remove(cls), opts.cleanupDelay || 300);
  }, opts.duration || 260);
}

// ------------------ small helper: safeCall that swallows errors and returns default ------------------
async function safeCall(fn, defaultValue = null) {
  try { return await fn(); } catch (e) { console.warn('safeCall', e); return defaultValue; }
}

// ------------------ export globals for backward compatibility ------------------
window.apiFetch = apiFetch;
window.apiUpload = apiUpload;
window.apiPutUpload = apiPutUpload;
window.apiGet = apiGet;
window.apiPost = apiPost;

// new functions
window.apiMarkSeen = apiMarkSeen;
window.apiGetUnreadCounts = apiGetUnreadCounts;
window.apiParseMentions = apiParseMentions;
window.apiNotifyMentions = apiNotifyMentions;
window.apiMuteUser = apiMuteUser;
window.apiUnmuteUser = apiUnmuteUser;
window.animateButton = animateButton;
window.safeCall = safeCall;
