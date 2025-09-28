//fronend/js/app.js
// --- top of app.js (replace existing top block) ---
const app = document.getElementById('app');
const nav = document.getElementById('nav');
const hambtn = document.getElementById('hambtn');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
// top-level in app.js (after api.js is loaded)
// fixed syntax here (was: typeof API_BASE ==  = 'string')
const SERVER_BASE = (typeof API_BASE === 'string' && API_BASE) ? API_BASE.replace('/api','') : '';

// Robust template helper: accepts tpl('exams') or tpl('tpl-exams') and returns a DocumentFragment.
// If template not found, returns a harmless fallback fragment instead of throwing.
function tpl(id) {
  if (!id) return document.createDocumentFragment();
  // normalize: allow both 'exams' and 'tpl-exams' arguments
  let normalized = String(id);
  if (normalized.startsWith('tpl-')) normalized = normalized.slice(4);
  // try multiple ways to find the template
  const el = document.getElementById('tpl-' + normalized) || document.getElementById(id) || document.querySelector(`template[data-tpl="${normalized}"]`);
  if (!el) {
    console.warn(`tpl: template "tpl-${normalized}" not found. Called with id="${id}".`);
    return document.createRange().createContextualFragment(`<div class="page" style="padding:12px;"><h3>Missing template: ${escapeHtml(normalized)}</h3><div class="muted">Template "tpl-${normalized}" could not be found in the DOM.</div></div>`);
  }
  // return a cloned content if available, otherwise a fragment from innerHTML
  if (el.content) return el.content.cloneNode(true);
  return document.createRange().createContextualFragment(el.innerHTML || '');
}
// --- Modal + Hamburger improved wiring & animations (drop-in replace) ---


// focus management helper (very small)
function _focusFirstDescendant(el) {
  if (!el) return null;
  const candidates = el.querySelectorAll('input,button,select,textarea,a[href],[tabindex]:not([tabindex="-1"])');
  for (const c of candidates) {
    if (!c.disabled && c.offsetParent !== null) { c.focus(); return c; }
  }
  return null;
}
// utility: returns true if reduced-motion requested
function prefersReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { return false; }
}

// Enhanced wireNavOnce that also shows inline nav on large screens
function wireNavOnce() {
  const hb = document.getElementById('hambtn');
  const navEl = document.getElementById('nav');
  if (!navEl) return false;

  // function to set "desktop" mode (show inline nav, hide hamburger)
  function updateLayoutByWidth() {
    const wide = window.innerWidth >= 900; // same breakpoint as CSS
    if (wide) {
      // desktop: ensure nav visible inline, hide hamburger
      navEl.classList.remove('mobile'); // optional class
      navEl.classList.remove('open');
      if (hb) { hb.style.display = 'none'; hb.classList.remove('open'); }
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      // make sure nav is visible (CSS handles layout)
      navEl.style.display = 'block';
      // clear any enter classes
      navEl.querySelectorAll('li.enter').forEach(li => li.classList.remove('enter','active'));
    } else {
      // mobile: show hamburger, hide nav until opened
      if (hb) hb.style.display = '';
      navEl.style.display = ''; // controlled by CSS
    }
  }

  // call once initially
  updateLayoutByWidth();

  // keep in sync on resize (debounce)
  let rTimeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(rTimeout);
    rTimeout = setTimeout(updateLayoutByWidth, 150);
  });

  // toggle nav open/close
  function toggleNav() {
    const isOpen = navEl.classList.toggle('open');
    if (hb) hb.classList.toggle('open', isOpen);
    if (isOpen) {
      // lock scroll
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      // animate nav items in with stagger if not reduced-motion
      const reduced = prefersReducedMotion();
      const items = Array.from(navEl.querySelectorAll('li'));
      if (!reduced && items.length) {
        items.forEach((li, idx) => {
          li.classList.add('enter');
          li.classList.remove('active');
          // stagger delay
          setTimeout(() => li.classList.add('active'), 40 * idx);
        });
      } else {
        items.forEach(li => li.classList.remove('enter','active'));
      }
      // focus first item
      const first = navEl.querySelector('li');
      if (first) first.focus && first.focus();
    } else {
      // unlock scroll
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      // remove enter classes
      navEl.querySelectorAll('li.enter').forEach(li => li.classList.remove('enter','active'));
      if (hb) hb.focus();
    }
  }

  // wire hamburger if present
  if (hb) {
    hb.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNav();
    });
  } else {
    // if no hamburger, ensure clicking outside won't break
    navEl.classList.remove('open');
  }

  // close when clicking outside the nav panel (mobile only)
  document.addEventListener('click', (e) => {
    // only do on mobile
    if (window.innerWidth >= 900) return;
    if (!navEl.classList.contains('open')) return;
    if (!navEl.contains(e.target) && !(hb && (e.target === hb || hb.contains(e.target)))) {
      navEl.classList.remove('open');
      if (hb) hb.classList.remove('open');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      navEl.querySelectorAll('li.enter').forEach(li => li.classList.remove('enter','active'));
    }
  });

  // wire nav items: when clicked call navigate() and close panel (mobile)
  navEl.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', (ev) => {
      const route = li.dataset.route;
      try { navigate(route); } catch (e) { console.warn('navigate failed', e); }
      if (window.innerWidth < 900) {
        setTimeout(() => {
          navEl.classList.remove('open');
          if (hb) hb.classList.remove('open');
          document.documentElement.style.overflow = '';
          document.body.style.overflow = '';
          navEl.querySelectorAll('li.enter').forEach(x => x.classList.remove('enter','active'));
        }, 80);
      }
    });
    if (!li.hasAttribute('tabindex')) li.setAttribute('tabindex','0');
  });

  // keyboard: close when pressing Escape and nav is open
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navEl.classList.contains('open')) {
      navEl.classList.remove('open');
      if (hb) hb.classList.remove('open');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      navEl.querySelectorAll('li.enter').forEach(x => x.classList.remove('enter','active'));
      if (hb) hb.focus();
    }
  });

  return true;
}

// Try to wire immediately; if markup not ready wait for DOMContentLoaded
if (!wireNavOnce()) {
  document.addEventListener('DOMContentLoaded', () => {
    wireNavOnce();
  });
}





// function updateNavByRole(){
//   const role = getUserRole();
//   // create payments / finance nav items if missing (so we can control visibility)
//   try {
//     // Payments li (manager/admin)
//     if (!nav.querySelector('[data-route="payments"]')) {
//       const li = document.createElement('li');
//       li.dataset.route = 'payments';
//       li.dataset.role = 'admin,manager';
//       li.textContent = 'Payments';
//       li.style.cursor = 'pointer';
//       li.addEventListener('click', ()=> navigate('payments'));
//       nav.appendChild(li);
//     }
//     // Finance li (student/teacher)
//     if (!nav.querySelector('[data-route="finance"]')) {
//       const li = document.createElement('li');
//       li.dataset.route = 'finance';
//       li.dataset.role = 'student,teacher';
//       li.textContent = 'Finance';
//       li.style.cursor = 'pointer';
//       li.addEventListener('click', ()=> navigate('finance'));
//       nav.appendChild(li);
//     }
//   } catch (e) { console.warn('updateNavByRole: cannot ensure nav items', e); }

//   nav.querySelectorAll('li').forEach(li => {
//     const r = li.dataset.role;
//     if(!r){ li.style.display = ''; return; }
//     const allowed = r.split(',').map(x => x.trim());
//     li.style.display = allowed.includes(role) ? '' : 'none';
//   });

//   // Ensure payments vs finance: (redundant but safe)
//   try {
//     const paymentsLi = nav.querySelector('[data-route="payments"]');
//     const financeLi  = nav.querySelector('[data-route="finance"]');
//     if (role === 'student' || role === 'teacher') {
//       if (paymentsLi) paymentsLi.style.display = 'none';
//       if (financeLi) financeLi.style.display = '';
//     } else if (role === 'manager' || role === 'admin') {
//       if (paymentsLi) paymentsLi.style.display = '';
//       if (financeLi) financeLi.style.display = 'none';
//     } else {
//       if (financeLi) financeLi.style.display = 'none';
//     }
//   } catch (e) { /* ignore */ }

//   let logoutBtn = document.getElementById('nav-logout');
//   if(!logoutBtn){ logoutBtn = document.createElement('li'); logoutBtn.id='nav-logout'; logoutBtn.style.cursor='pointer'; logoutBtn.textContent='Logout'; logoutBtn.addEventListener('click', logout); nav.appendChild(logoutBtn); }
//   logoutBtn.style.display = getToken() ? '' : 'none';
//   let userLi = document.getElementById('nav-user');
//   if(!userLi){ userLi = document.createElement('li'); userLi.id='nav-user'; userLi.style.opacity='0.9'; userLi.style.fontSize='13px'; nav.insertBefore(userLi, nav.firstChild); }
//   userLi.textContent = getToken() ? getUserFullname() : '';
//   userLi.style.display = getToken() ? '' : 'none';
// }

// --- auth helpers ---
function getToken(){ return localStorage.getItem('auth_token'); }
function getUserFullname(){ return localStorage.getItem('user_fullname') || ''; }
function logout(){ setUser(null); updateNavByRole(); alert('Logged out'); navigate('login'); }


// ------------------- Frontend: setUser + getCurrentUser -------------------

/**
 * setUser(userObj)
 * - Accepts either: { token, user } or { token } (token-only)
 * - Persists auth_token and helpful user fields into localStorage for UI display.
 * - Also writes childId/childNumberId when available (parent login).
 */
function setUser(userObj) {
  if (!userObj) {
    // clear all auth-related values
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_fullname');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_schoolId');
    localStorage.removeItem('user_childId');
    localStorage.removeItem('user_childNumberId');
    window.__CURRENT_USER = null;
    return;
  }

  // Accept either raw token string or object with token
  const token = typeof userObj === 'string' ? userObj : (userObj.token || null);
  if (token) localStorage.setItem('auth_token', token);

  // If the server returned an explicit user object, prefer it
  const serverUser = (typeof userObj === 'object' && userObj.user) ? userObj.user : null;

  if (serverUser) {
    const role = (serverUser.role || serverUser.type || '').toLowerCase();
    if (serverUser.fullname) localStorage.setItem('user_fullname', serverUser.fullname);
    if (role) localStorage.setItem('user_role', role);
    if (serverUser.schoolId) localStorage.setItem('user_schoolId', String(serverUser.schoolId));
    if (serverUser.childId) localStorage.setItem('user_childId', String(serverUser.childId));
    if (serverUser.childNumberId) localStorage.setItem('user_childNumberId', serverUser.childNumberId || '');
    // update cached current user if present
    window.__CURRENT_USER = {
      _id: String(serverUser._id || serverUser.id || (serverUser.id === 0 ? 0 : '' )),
      role: role,
      fullname: serverUser.fullname || '',
      email: serverUser.email || '',
      schoolId: serverUser.schoolId || null,
      childId: serverUser.childId ? String(serverUser.childId) : null,
      childNumberId: serverUser.childNumberId || null
    };
    return;
  }

  // Otherwise try to decode token payload to extract fields
  const payload = parseJwt(token || localStorage.getItem('auth_token') || '');
  if (payload) {
    if (payload.fullname) localStorage.setItem('user_fullname', payload.fullname);
    const role = (payload.role || payload.type || '').toLowerCase();
    if (role) localStorage.setItem('user_role', role);
    if (payload.schoolId) localStorage.setItem('user_schoolId', payload.schoolId);
    if (payload.childId) localStorage.setItem('user_childId', String(payload.childId));
    if (payload.childNumberId || payload.childNumber) localStorage.setItem('user_childNumberId', payload.childNumberId || payload.childNumber || '');
  }
}

/**
 * getCurrentUser(forceRefresh = false)
 * - Attempts to return a cached user (window.__CURRENT_USER) unless forceRefresh true.
 * - Tries server endpoints (/auth/me, /users/me, /profile/me) to get canonical user info.
 * - Falls back to decoding the JWT in localStorage (best-effort).
 * - Normalizes fields and caches to window.__CURRENT_USER and localStorage (role/fullname/schoolId/childId).
 */
async function getCurrentUser(forceRefresh = false) {
  if (!forceRefresh && window.__CURRENT_USER) return window.__CURRENT_USER;

  const token = getToken();

  // No token: fall back to older/stored user object if present
  if (!token) {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed._id || parsed.id)) {
          // store minimally normalized
          const norm = {
            _id: String(parsed._id || parsed.id),
            role: (parsed.role || '').toLowerCase(),
            fullname: parsed.fullname || parsed.name || '',
            email: parsed.email || '',
            schoolId: parsed.schoolId || parsed.school || null,
            childId: parsed.childId || parsed.childId || null,
            childNumberId: parsed.childNumberId || parsed.childNumberId || null
          };
          window.__CURRENT_USER = norm;
          if (norm.role) localStorage.setItem('user_role', norm.role);
          if (norm.fullname) localStorage.setItem('user_fullname', norm.fullname);
          return norm;
        }
      }
    } catch (e) { /* ignore parse errors */ }

    // If we have an id fallback
    const id = localStorage.getItem('user_id') || localStorage.getItem('uid') || null;
    if (id) {
      const fake = { _id: id };
      window.__CURRENT_USER = fake;
      return fake;
    }
    return null;
  }

  // Helper tries a path and returns normalized user or null
  async function tryPath(path) {
    try {
      const res = await apiFetch(path);
      if (!res) return null;
      // api may return { user } or user object directly or { ok:true, data: {...} }
      let user = res.user || (res.ok && res.data) || res;
      if (user && (user._id || user.id)) return user;
      return null;
    } catch (e) {
      return null;
    }
  }

  const tryEndpoints = ['/auth/me', '/users/me', '/profile/me'];
  for (const p of tryEndpoints) {
    const u = await tryPath(p);
    if (u) {
      const normalized = {
        _id: String(u._id || u.id),
        role: (u.role || u.type || '').toLowerCase(),
        fullname: u.fullname || u.name || '',
        email: u.email || '',
        schoolId: u.schoolId || u.school || null,
        childId: u.childId || u.child || u.childId || null,
        childNumberId: u.childNumberId || u.childNumber || null
      };
      window.__CURRENT_USER = normalized;
      if (normalized.role) localStorage.setItem('user_role', normalized.role);
      if (normalized.fullname) localStorage.setItem('user_fullname', normalized.fullname);
      if (normalized.schoolId) localStorage.setItem('user_schoolId', normalized.schoolId);
      if (normalized.childId) localStorage.setItem('user_childId', normalized.childId);
      if (normalized.childNumberId) localStorage.setItem('user_childNumberId', normalized.childNumberId);
      return normalized;
    }
  }

  // Fallback: decode token payload
  try {
    const payload = parseJwt(token);
    if (payload && (payload.id || payload._id || payload.userId || payload.uid)) {
      const id = payload.id || payload._id || payload.userId || payload.uid;
      const userFromToken = {
        _id: String(id),
        role: (payload.role || payload.type || '').toLowerCase(),
        fullname: payload.fullname || payload.name || '',
        email: payload.email || '',
        schoolId: payload.schoolId || null,
        childId: payload.childId || payload.child || null,
        childNumberId: payload.childNumberId || payload.childNumber || null
      };
      window.__CURRENT_USER = userFromToken;
      if (userFromToken.role) localStorage.setItem('user_role', userFromToken.role);
      if (userFromToken.fullname) localStorage.setItem('user_fullname', userFromToken.fullname);
      if (userFromToken.schoolId) localStorage.setItem('user_schoolId', userFromToken.schoolId);
      if (userFromToken.childId) localStorage.setItem('user_childId', userFromToken.childId);
      if (userFromToken.childNumberId) localStorage.setItem('user_childNumberId', userFromToken.childNumberId);
      return userFromToken;
    }
  } catch (err) {
    console.debug('getCurrentUser: token decode failed', err && err.message ? err.message : err);
  }

  // last-resort localStorage tries
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed._id || parsed.id)) {
        const norm = {
          _id: String(parsed._id || parsed.id),
          role: (parsed.role || '').toLowerCase(),
          fullname: parsed.fullname || parsed.name || ''
        };
        window.__CURRENT_USER = norm;
        if (norm.role) localStorage.setItem('user_role', norm.role);
        if (norm.fullname) localStorage.setItem('user_fullname', norm.fullname);
        return norm;
      }
    }
  } catch (e) { /* ignore */ }

  const id = localStorage.getItem('user_id') || localStorage.getItem('uid') || null;
  if (id) {
    const fake = { _id: id };
    window.__CURRENT_USER = fake;
    return fake;
  }

  return null;
}

// safe role getter used by UI visibility rules
function getUserRole() { return (localStorage.getItem('user_role') || '').toLowerCase(); }

// Small fix for defaultRouteForUser (bug in original OR check)
function defaultRouteForUser(user) {
  if (!user) return 'login';
  const role = (user.role || localStorage.getItem('user_role') || '').toLowerCase();
  if (role === 'student' || role === 'teacher' || role === 'parent') return 'profile';
  return 'dashboard';
}


// updateNavByRole: if we don't know role yet, try to load current user first
async function updateNavByRole(){
  // ensure we have the role cached
  if (!localStorage.getItem('user_role')) {
    try {
      await getCurrentUser().catch(()=>{});
    } catch(e){ /*ignore*/ }
  }

  const role = getUserRole();
  // create payments / finance nav items if missing (so we can control visibility)
  try {
    // Payments li (manager/admin)
    if (!nav.querySelector('[data-route="payments"]')) {
      const li = document.createElement('li');
      li.dataset.route = 'payments';
      li.dataset.role = 'admin,manager';
      li.textContent = 'Payments';
      li.style.cursor = 'pointer';
      li.addEventListener('click', ()=> navigate('payments'));
      nav.appendChild(li);
    }
    // Finance li (student/teacher)
    if (!nav.querySelector('[data-route="finance"]')) {
      const li = document.createElement('li');
      li.dataset.route = 'finance';
      li.dataset.role = 'student,teacher';
      li.textContent = 'Finance';
      li.style.cursor = 'pointer';
      li.addEventListener('click', ()=> navigate('finance'));
      nav.appendChild(li);
    }
  } catch (e) { console.warn('updateNavByRole: cannot ensure nav items', e); }

  nav.querySelectorAll('li').forEach(li => {
    const r = li.dataset.role;
    if(!r){ li.style.display = ''; return; }
    const allowed = r.split(',').map(x => x.trim());
    li.style.display = allowed.includes(role) ? '' : 'none';
  });

  // Ensure payments vs finance: (redundant but safe)
  try {
    const paymentsLi = nav.querySelector('[data-route="payments"]');
    const financeLi  = nav.querySelector('[data-route="finance"]');
    if (role === 'student' || role === 'teacher') {
      if (paymentsLi) paymentsLi.style.display = 'none';
      if (financeLi) financeLi.style.display = '';
    } else if (role === 'manager' || role === 'admin') {
      if (paymentsLi) paymentsLi.style.display = '';
      if (financeLi) financeLi.style.display = 'none';
    } else {
      if (financeLi) financeLi.style.display = 'none';
    }
  } catch (e) { /* ignore */ }

  let logoutBtn = document.getElementById('nav-logout');
  if(!logoutBtn){ logoutBtn = document.createElement('li'); logoutBtn.id='nav-logout'; logoutBtn.style.cursor='pointer'; logoutBtn.textContent='Logout'; logoutBtn.addEventListener('click', logout); nav.appendChild(logoutBtn); }
  logoutBtn.style.display = getToken() ? '' : 'none';
  let userLi = document.getElementById('nav-user');
  if(!userLi){ userLi = document.createElement('li'); userLi.id='nav-user'; userLi.style.opacity='0.9'; userLi.style.fontSize='13px'; nav.insertBefore(userLi, nav.firstChild); }
  userLi.textContent = getToken() ? getUserFullname() : '';
  userLi.style.display = getToken() ? '' : 'none';
}



// 1) add helper to decode JWT payload (client-side, not secure for sensitive use — just to read role)
function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g,'+').replace(/_/g,'/'));
    return JSON.parse(decodeURIComponent(escape(json))); // robust decode
  } catch (e) {
    return null;
  } }

// // 2) improved setUser to accept either token-only or token+user
// function setUser(userObj) {
//   if (!userObj) {
//     localStorage.removeItem('auth_token');
//     localStorage.removeItem('user_fullname');
//     localStorage.removeItem('user_role');
//     localStorage.removeItem('user_schoolId');
//     return;
//   }
//   if (userObj.token) localStorage.setItem('auth_token', userObj.token);

//   // If server returned user details, prefer them
//   if (userObj.user) {
//     localStorage.setItem('user_fullname', userObj.user.fullname || '');
//     localStorage.setItem('user_role', userObj.user.role || '');
//     localStorage.setItem('user_schoolId', userObj.user.schoolId || '');
//     return;
//   }

//   // otherwise attempt to decode token payload
//   const payload = parseJwt(userObj.token);
//   if (payload) {
//     localStorage.setItem('user_fullname', payload.fullname || '');
//     localStorage.setItem('user_role', payload.role || '');
//     localStorage.setItem('user_schoolId', payload.schoolId || '');
//   }
// }
// router


async function navigate(route){
  if(!route) route = 'dashboard';
  if(route === 'login'){ renderLogin(); return; }
  if(route === 'dashboard'){ await renderDashboard(); return; }
  if(route === 'students'){ await renderStudents(); return; }
  if(route === 'teachers'){ await renderTeachers(); return; }
  if(route === 'classes'){ await renderClasses(); return; }
  if(route === 'subjects'){ await renderSubjects(); return; }
  if(route === 'parents'){ await renderParentsPage(); return; }
  if(route === 'payments'){ await renderPayments(); return; }
  if(route === 'finance'){ await renderFinance(); return; }   // <-- existing
  if(route === 'exams'){ await renderExams(); return; }
// NEW: meetings list and meeting UI
if(route === 'meetings'){ await renderMeetings(); return; }
if(route === 'create-meeting'){ await renderCreateMeeting(); return; }
if(route === 'zoom'){ await renderZoom(); return; }
if(route === 'chats'){ await renderChats(); return; }

  if(route === 'quizzes'){ await renderQuizzes(); return; }
  if(route === 'reports'){ await renderReports(); return; }
  if(route === 'notices'){ await renderNotices(); return; }
  if (route === 'about') { await renderAboutPage(); return; }

  if(route === 'user-management'){ await renderUserManagement(); return; }
  if(route === 'vote'){ await renderVote(); return; }

  if(route === 'profile'){ await renderProfile(); return; }
  if(route === 'results'){ await renderResults(); return; }

  if(route === 'help'){ await renderHelpPage(); return; }


  if(route === 'attendance'){ await renderAttendance(); return; }

  // NEW: meetings list and meeting UI
  if(route === 'meetings'){ await renderMeetings(); return; }
  if(route === 'create-meeting'){ await renderCreateMeeting(); return; }
  if(route === 'zoom'){ await renderZoom(); return; }

  app.innerHTML = `<div class="page"><h2>Page: ${escapeHtml(route)}</h2><p>Work in progress.</p></div>`;
}

// --- LOGIN / REGISTER ---
function renderLogin(){
  app.innerHTML = '';
  const node = tpl('login'); app.appendChild(node);
  const form = document.getElementById('login-form'); if(!form) return;

  // demo
  const demoWrap = document.createElement('div'); demoWrap.style.margin='8px 0';
  demoWrap.innerHTML = `<button id="demo-admin" class="btn">Demo Admin</button><button id="demo-manager" class="btn" style="margin-left:6px">Demo Manager</button>`;
  form.parentNode.insertBefore(demoWrap, form.nextSibling);
  document.getElementById('demo-admin').addEventListener('click', (e)=>{ e.preventDefault(); form.email.value='admin@school.local'; form.password.value='adminpass'; });
  document.getElementById('demo-manager').addEventListener('click', (e)=>{ e.preventDefault(); form.email.value='manager@school.local'; form.password.value='managerpass'; });

  form.addEventListener('submit', async (e)=> {
    e.preventDefault();
    const fd = new FormData(form);
    const emailOrId = (fd.get('email') || '').trim();
    const password = fd.get('password');
    try {
      if (!emailOrId || !password) return alert('Enter ID/email and password');

      // Build payload: if it looks like an email, use email-based login; otherwise numberId.
      const payload = emailOrId.includes('@') ? { email: emailOrId, password } : { numberId: emailOrId, password };

      // First try normal auth endpoint (for admin/manager/student/teacher)
      let res = null;
      try {
        res = await apiFetch('/auth/login', { method:'POST', body: payload });
      } catch (err) {
        // apiFetch may throw, we'll handle below
        res = null;
      }

      // If auth returned a token (successful), accept it.
      if (res && (res.token || res.ok && (res.token || res.user))) {
        // Some servers return { token, user }, some return { ok:true, token, user } etc.
        setUser(res);
        await getCurrentUser(true).catch(()=>{});
        updateNavByRole();
        const cur = window.__CURRENT_USER || (parseJwt(res.token) || {});
        alert('Logged in as ' + (cur.fullname || getUserFullname() || emailOrId));
        navigate(defaultRouteForUser(cur));
        return;
      }

      // If first attempt failed and payload used numberId (not email), try parent login endpoint:
      if (!emailOrId.includes('@')) {
        try {
          const pr = await apiFetch('/parents/login', { method: 'POST', body: { studentNumberId: emailOrId, password } });
          if (pr && pr.token) {
            setUser(pr);
            await getCurrentUser(true).catch(()=>{});
            updateNavByRole();
            const cur = window.__CURRENT_USER || (parseJwt(pr.token) || {});
            alert('Parent logged in as ' + (cur.fullname || getUserFullname() || emailOrId));
            navigate(defaultRouteForUser(cur));
            return;
          } else {
            // show server message if available
            alert((pr && (pr.message || pr.error)) || (res && (res.message || res.error)) || 'Login failed');
            return;
          }
        } catch (err) {
          console.error('Parent login error', err);
          alert('Login failed: ' + (err && err.message ? err.message : 'server error'));
          return;
        }
      }

      // otherwise, show generic error from first response (if present)
      alert((res && (res.message || res.error)) || 'Login failed');

    } catch (err) {
      console.error('Login error', err);
      alert('Login error: ' + (err.message || 'server error'));
    }
  });

  

  document.getElementById('go-register')?.addEventListener('click', ()=>{
    app.innerHTML = ''; const node = tpl('register'); app.appendChild(node);
    const rform = document.getElementById('register-form');
    document.getElementById('go-login')?.addEventListener('click', ()=> renderLogin());
    form.addEventListener('submit', async (e)=> {
      e.preventDefault();
      const fd = new FormData(form);
      const emailOrId = (fd.get('email') || '').trim();
      const password = fd.get('password');
      try {
        // If input contains @ treat as email, else treat as numberId
        const payload = emailOrId.includes('@') ? { email: emailOrId, password } : { numberId: emailOrId, password };
        const res = await apiFetch('/auth/login', { method: 'POST', body: payload });
        if (res && res.token) {
          setUser(res);
          // refresh cached current user from backend/token
          await getCurrentUser(true).catch(()=>{});
          updateNavByRole();
          const cur = window.__CURRENT_USER || (parseJwt(res.token) || {});
          alert('Logged in as ' + (cur.fullname || emailOrId));
          navigate(defaultRouteForUser(cur));
        } else {
          alert(res.message || 'Login failed');
        }
        
      } catch (err) {
        console.error('Login error', err);
        alert('Login error: ' + (err.message || 'server error'));
      }
    });
    
  });
}


/**
 * getActorId()
 * Returns the id we should use when loading "profile/results/attendance" etc:
 * - if current user is a parent and has childId -> return childId
 * - otherwise return current user's _id
 */
function getActorId() {
  const me = window.__CURRENT_USER || {};
  if (me && (me.role || '').toLowerCase() === 'parent' && (me.childId || localStorage.getItem('user_childId'))) {
    return String(me.childId || localStorage.getItem('user_childId'));
  }
  // fallback to user id
  return (me && (me._id || me.id)) ? String(me._id || me.id) : null;
}

/**
 * apiFetchAsChild(path, opts)
 * - If path contains a placeholder `:id` it will be replaced by actor id.
 * - Otherwise, if path is a student-specific endpoint (like '/students/:id'), call with actor id inserted.
 * Example usages:
 *   apiFetchAsChild('/students/:id')  // -> /students/<childId> for parents, /students/<userId> for students
 *   apiFetchAsChild('/exams?studentId=:id') // will replace :id in query
 */
async function apiFetchAsChild(path, opts = {}) {
  const actorId = getActorId();
  if (!actorId) throw new Error('No actor id available');

  let resolved = String(path);
  if (resolved.includes(':id')) resolved = resolved.replace(/:id/g, actorId);

  // if path looks like '/students' and no placeholder, you might append actor id depending on API design
  // but don't guess—prefer endpoints that accept :id or query param.
  return apiFetch(resolved, opts);
}

async function renderProfile() {
  app.innerHTML = '';
  const frag = tpl('profile');
  app.appendChild(frag);

  await getCurrentUser(true).catch(()=>null);
  const actorId = getActorId();
  if (!actorId) {
    document.getElementById('profile-body').innerHTML = '<div class="muted">Not signed in</div>';
    return;
  }

  try {
    const r = await apiFetch('/students/' + actorId);
    if (!r || !r.ok) {
      document.getElementById('profile-body').innerHTML = '<div class="muted">Failed to load profile</div>';
      return;
    }
    const s = r.student || r;
    // render student info (your markup)
    document.getElementById('student-name').textContent = s.fullname || '';
    // ...
  } catch (err) {
    console.error('profile load error', err);
    document.getElementById('profile-body').innerHTML = '<div class="muted">Error loading profile</div>';
  }
}





// frontend: replace your renderProfile and loadProfile with these two functions

async function renderProfile(){
  // allow student/teacher/parent roles
  const role = getUserRole();
  if(!['student','teacher','parent'].includes(role)) {
    app.innerHTML = '<div class="page"><h2>Access denied</h2></div>';
    return;
  }

  app.innerHTML = '';
  const node = tpl('profile');
  app.appendChild(node);

  document.getElementById('edit-profile-btn')?.addEventListener('click', openEditProfileModal);
  document.getElementById('change-password-btn')?.addEventListener('click', openChangePasswordModal);

  await loadProfile();
}

async function loadProfile(){
  const card = document.getElementById('profile-card');
  if(!card) return;
  card.innerHTML = '<div id="profile-loading" class="muted">Loading profile...</div>';

  try{
    const res = await apiFetch('/profile'); // backend route we just added
    // If backend returns { ok:false, message } apiFetch will throw; here we get the parsed body
    const profile = res.profile || res;
    const role = res.role || getUserRole();
    const meta = res.meta || {};

    // photo normalization
    const photoUrl = profile.photoUrl ? (profile.photoUrl.startsWith('http') ? profile.photoUrl : (SERVER_BASE + profile.photoUrl)) : '';

    const detailsHtmlParts = [];
    // If parent viewing child: show parent note and child number
    if (meta.viewing === 'child') {
      const parentName = escapeHtml(meta.parentName || '');
      const childNum = escapeHtml(meta.childNumberId || (profile.numberId||''));
      detailsHtmlParts.push(`<div style="font-size:16px;font-weight:600">${escapeHtml(profile.fullname || '')}</div>`);
      detailsHtmlParts.push(`<div class="muted" style="margin-top:4px">Role: parent — viewing child profile (${childNum}) ${parentName ? ' — parent: ' + parentName : ''}</div>`);
    } else {
      detailsHtmlParts.push(`<div style="font-size:18px;font-weight:600">${escapeHtml(profile.fullname || '')}</div>`);
      detailsHtmlParts.push(`<div class="muted" style="margin-top:4px">Role: ${escapeHtml(role)}</div>`);
    }

    if (profile.numberId) detailsHtmlParts.push(`<div style="margin-top:8px"><strong>ID:</strong> ${escapeHtml(profile.numberId)}</div>`);
    if (profile.phone) detailsHtmlParts.push(`<div><strong>Phone:</strong> ${escapeHtml(profile.phone)}</div>`);

    // Student-specific UI
    if (role === 'student' || meta.viewing === 'child') {
      if (profile.classId && profile.classId.name) {
        detailsHtmlParts.push(`<div><strong>Class:</strong> ${escapeHtml(profile.classId.name)} ${profile.classId.classId ? ('(' + escapeHtml(profile.classId.classId) + ')') : ''}</div>`);
      }
      detailsHtmlParts.push(`<div style="margin-top:6px;color:#374151">Status: ${escapeHtml(profile.status || '')} • Fee: ${profile.fee || 0} • Paid: ${profile.paidAmount || 0}</div>`);
    }

    // Teacher-specific UI
    if (role === 'teacher') {
      const classesText = (profile.classIds || []).map(c => (c && c.name) ? escapeHtml(c.name + (c.classId ? (' ('+c.classId+')') : '')) : escapeHtml(String(c))).join(', ') || 'None';
      const subjectsText = (profile.subjectIds || []).map(s => (s && s.name) ? escapeHtml(s.name) : escapeHtml(String(s))).join(', ') || 'None';
      detailsHtmlParts.push(`<div style="margin-top:6px"><strong>Classes:</strong> ${classesText}</div>`);
      detailsHtmlParts.push(`<div><strong>Subjects:</strong> ${subjectsText}</div>`);
      if (profile.salary) detailsHtmlParts.push(`<div><strong>Salary:</strong> ${escapeHtml(String(profile.salary||0))}</div>`);
    }

    card.innerHTML = `
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:0 0 120px">
          <div style="width:120px;height:120px;border-radius:10px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center">
            ${photoUrl ? `<img id="profile-photo-img" src="${encodeURI(photoUrl)}" style="width:100%;height:100%;object-fit:cover"/>` : `<div style="padding:10px;color:#94a3b8">No photo</div>`}
          </div>
        </div>
        <div style="flex:1;min-width:220px">
          ${detailsHtmlParts.join('')}
        </div>
      </div>
    `;
  }catch(err){
    console.error('loadProfile err', err);
    if (err && err.message) {
      card.innerHTML = `<div class="muted">${escapeHtml(err.message)}</div>`;
    } else {
      card.innerHTML = '<div class="muted">Failed to load profile</div>';
    }
  }
}

//////////////////help page

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

/* In-memory cache + polling state */
const __HELP_MSGS = new Map();
let __helpPollingTimer = null;
let __helpIsFetching = false;

/* Load troubleshooting topics */
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
    const wrap = topicsWrap || document.getElementById('help-topics');
    if (wrap) wrap.innerHTML = '<div class="muted">Failed to load help topics</div>';
  }
}

/* Decide whether a client should display a given message (client-side guard) */
function shouldShowMessageToClient(msg) {
  try {
    const me = window.__CURRENT_USER || null;
    const myId = me && me._id ? String(me._id) : null;
    const myRole = me && me.role ? (me.role || '').toLowerCase() : '';

    // Owner always sees their own msgs
    if (myId && msg.from && String(myId) === String(msg.from)) return { allow: true, reason: 'owner' };

    // Private -> only admin/manager (owner handled above)
    if (msg.private) {
      if (myRole === 'admin' || myRole === 'manager') return { allow: true, reason: 'private allowed for admin/manager' };
      return { allow: false, reason: 'private not allowed for this user' };
    }

    // If message targets a role, client role must match
    if (msg.toRole) {
      if (!myRole) return { allow: false, reason: 'no client role' };
      if (myRole === msg.toRole.toLowerCase()) return { allow: true, reason: 'role matches' };
      return { allow: false, reason: `toRole mismatch (msg->${msg.toRole})` };
    }

    // Broadcast -> allowed
    if (msg.broadcastToAll) return { allow: true, reason: 'broadcast' };

    // toUser handled server-side; if this client is the toUser, allow
    if (msg.toUser) {
      if (myId && String(msg.toUser) === String(myId)) return { allow: true, reason: 'directed to this user' };
      return { allow: false, reason: 'directed to another user' };
    }

    // Fallback allow
    return { allow: true, reason: 'fallback allow' };
  } catch (err) {
    console.error('shouldShowMessageToClient error', err);
    return { allow: false, reason: 'error' };
  }
}

/* Render a single help message DOM node */
function renderHelpMessageNode(msg) {
  try {
    const check = shouldShowMessageToClient(msg);
    if (!check.allow) {
      console.debug('[help] render skipped msg', msg._id, check.reason);
      return null;
    }

    __HELP_MSGS.set(String(msg._id), msg);

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

    // Reply button
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

    // Reactions UI
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

    // Delete button for owner/admin/manager
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

/* Fetch messages and reconcile DOM (diff) */
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

/* Page render function — main entry point */
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

    // Send button handling
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        try {
          const text = (textEl.value || '').trim();
          if (!text) return alert('Please enter a message');
          const meNow = await getCurrentUser(true).catch(()=>null);
          if (!meNow) return alert('You must be logged in');

          const payload = { text };

          if (myRole === 'manager' || myRole === 'admin') {
            // managers/admins can choose role or broadcast
            if (targetType && targetType.value) payload.toRole = targetType.value;
            else payload.broadcastToAll = true;
          } else {
            // student/teacher:
            // - if private checked -> private to managers
            // - otherwise -> broadcast (server will apply scope if available or global fallback)
            if (privateCheckbox && privateCheckbox.checked) {
              payload.private = true;
              payload.toRole = 'manager';
            } else {
              payload.broadcastToAll = true;
            }
          }

          // replyTo if set
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
    } else {
      console.warn('renderHelpPage: send button not found');
    }

    // Need help button shows topics in modal
    if (needHelpBtn) {
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
    }

    // Socket handlers: use the socketHelp singleton
    const sock = socketHelp;
    sock.on('help:new', (m) => {
      try {
        console.debug('[socket] help:new', m);
        if (!m || !m._id) return;
        if (__HELP_MSGS.has(m._id)) return;

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

    // initial load: topics + messages
    await loadTopics(topicsWrap);
    await loadMessagesDiff(messagesWrap);

    // polling (keeps UI in sync for clients that missed socket events)
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
 

// frontend/js/modal.js
// Lightweight modal helper. Exposes window.showModal(content, opts) and window.closeModal().
// - content may be a DOM node or a string containing HTML/text.
// - opts: { title: string, width: 'auto'|'600px'|..., closable: true|false }
// Returns the modal element when shown.

(function () {
  if (typeof window === 'undefined') return;

  if (window.showModal) {
    // don't override if already provided by app
    console.debug('showModal already exists — modal.js will not override it.');
    return;
  }

  // Create overlay + container on first use
  function ensureContainer() {
    let overlay = document.getElementById('ui-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'ui-modal-overlay';
    overlay.className = 'ui-modal-overlay';
    overlay.innerHTML = `
      <div class="ui-modal" role="dialog" aria-modal="true" aria-labelledby="ui-modal-title">
        <button class="ui-modal-close" aria-label="Close modal" title="Close">✕</button>
        <div class="ui-modal-inner">
          <div id="ui-modal-title" class="ui-modal-title" style="display:none"></div>
          <div class="ui-modal-body"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // event wiring
    const modal = overlay.querySelector('.ui-modal');
    const closeBtn = overlay.querySelector('.ui-modal-close');

    // click overlay to close (if clicked outside modal content)
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) closeModal();
    });

    // close button
    closeBtn.addEventListener('click', () => closeModal());

    // ESC key
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' || ev.key === 'Esc') {
        if (overlay.classList.contains('ui-modal-open')) closeModal();
      }
    });

    return overlay;
  }

  function showModal(content, opts = {}) {
    const overlay = ensureContainer();
    const modal = overlay.querySelector('.ui-modal');
    const titleEl = overlay.querySelector('#ui-modal-title');
    const body = overlay.querySelector('.ui-modal-body');
    const closeBtn = overlay.querySelector('.ui-modal-close');

    // opts defaults
    const { title = '', width = '', closable = true } = opts || {};

    // title
    if (title) {
      titleEl.style.display = '';
      titleEl.textContent = title;
    } else {
      titleEl.style.display = 'none';
      titleEl.textContent = '';
    }

    // width
    if (width) modal.style.maxWidth = width;
    else modal.style.maxWidth = '';

    // closable
    if (closable) {
      closeBtn.style.display = '';
      overlay.setAttribute('data-closable', 'true');
    } else {
      closeBtn.style.display = 'none';
      overlay.setAttribute('data-closable', 'false');
    }

    // set body content
    body.innerHTML = '';
    if (!content) {
      body.textContent = '';
    } else if (content instanceof Node) {
      body.appendChild(content);
    } else if (typeof content === 'string') {
      // allow simple string or html
      body.innerHTML = content;
    } else {
      body.textContent = String(content);
    }

    // show
    overlay.classList.add('ui-modal-open');

    // prevent body scroll while open
    document.body.classList.add('ui-modal-open-body');

    // trap focus inside modal (basic)
    trapFocus(modal);

    return modal;
  }

  function closeModal() {
    const overlay = document.getElementById('ui-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('ui-modal-open');
    document.body.classList.remove('ui-modal-open-body');

    // remove focus trap listeners if any
    releaseFocusTrap();

    // clear content after short delay so CSS close animation can run
    setTimeout(() => {
      const body = overlay.querySelector('.ui-modal-body');
      if (body) body.innerHTML = '';
      const titleEl = overlay.querySelector('#ui-modal-title');
      if (titleEl) { titleEl.style.display = 'none'; titleEl.textContent = ''; }
    }, 200);
  }

  // Simple focus trap helper (keeps focus inside modal)
  let _focusTrapCleanup = null;
  function trapFocus(modalEl) {
    releaseFocusTrap();
    if (!modalEl) return;
    const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const nodes = Array.from(modalEl.querySelectorAll(focusableSelector)).filter(n => n.offsetParent !== null);
    const first = nodes[0] || modalEl;
    const last = nodes[nodes.length - 1] || modalEl;

    // focus first focusable
    try { first.focus(); } catch (e) {}

    function handleKey(e) {
      if (e.key !== 'Tab') return;
      // shift+tab
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          (last || first).focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          (first || last).focus();
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    _focusTrapCleanup = () => window.removeEventListener('keydown', handleKey);
  }

  function releaseFocusTrap() {
    if (typeof _focusTrapCleanup === 'function') {
      try { _focusTrapCleanup(); } catch (e) {}
      _focusTrapCleanup = null;
    }
  }

  // expose globally
  window.showModal = showModal;
  window.closeModal = closeModal;

  // Optional: for convenience, expose a quick alert-style modal
  window.showAlertModal = function (titleOrContent, contentIfTitle) {
    if (contentIfTitle === undefined) {
      return showModal(String(titleOrContent), { title: '', width: '520px' });
    }
    const content = document.createElement('div');
    if (typeof contentIfTitle === 'string') content.innerHTML = `<p>${contentIfTitle}</p>`;
    else if (contentIfTitle instanceof Node) content.appendChild(contentIfTitle);
    return showModal(content, { title: String(titleOrContent), width: '560px' });
  };
})();

/* Expose to the global page loader */
window.renderHelpPage = renderHelpPage;


//RENDER FUNCTION: replace existing renderDashboard() with this -->

async function renderDashboard() {
  app.innerHTML = '';
  const tpl = document.getElementById('tpl-dashboard');
  if (!tpl) return app.textContent = 'Dashboard template missing';
  const clone = tpl.content.cloneNode(true);
  app.appendChild(clone);

  // spinner element (optional in template). If missing, functions are no-ops.
  const spinner = document.getElementById('dash-spinner');
  function showSpinner() { if (spinner) { spinner.style.display = ''; spinner.setAttribute('aria-hidden','false'); } }
  function hideSpinner() { if (spinner) { spinner.style.display = 'none'; spinner.setAttribute('aria-hidden','true'); } }

  // ensure Chart.js exists (load CDN if missing)
  async function ensureChartJs() {
    if (window.Chart) return;
    await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      s.onload = resolve;
      s.onerror = () => { console.warn('Chart.js load failed'); resolve(); };
      document.head.appendChild(s);
    });
  }
  await ensureChartJs();

  // DOM refs
  const filterEl = document.getElementById('dash-filter');
  const paymentsPaidEl = document.getElementById('dash-payments-paid');
  const totalStudentsEl = document.getElementById('total-students');
  const totalTeachersEl = document.getElementById('total-teachers');
  const topStudentsEl = document.getElementById('top-students');
  const paymentsCountEl = document.getElementById('payments-count');
  const canvas = document.getElementById('paymentsChart');

  // chart state
  let chart = null;
  let liveInterval = null;

  // createOrUpdateChart: safely destroy existing chart for canvas and create new one
  function createOrUpdateChart(labels = [], data = []) {
    if (!canvas) return null;

    // destroy existing chart bound to this canvas if present to avoid double-binding
    try {
      if (window.Chart && Chart.getChart) {
        const existing = Chart.getChart(canvas);
        if (existing) {
          try { existing.destroy(); } catch (e) { console.warn('destroy existing chart failed', e); }
          chart = null;
        }
      }
    } catch (e) {}

    // create gradient background
    let bg = 'rgba(124,58,237,0.14)';
    try {
      const gctx = canvas.getContext && canvas.getContext('2d');
      if (gctx) {
        const gradient = gctx.createLinearGradient(0, 0, 0, canvas.height || 160);
        gradient.addColorStop(0, 'rgba(124,58,237,0.14)');
        gradient.addColorStop(1, 'rgba(124,58,237,0.02)');
        bg = gradient;
      }
    } catch (e) { console.warn(e); }

    if (!window.Chart) return null;
    try {
      chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Payments',
            data,
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
            backgroundColor: bg,
            borderColor: '#7c3aed'
          }]
        },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false }
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 0 } },
            y: { beginAtZero: true, grid: { color: 'rgba(15,23,42,0.04)' } }
          }
        }
      });
    } catch (e) {
      console.error('Chart create error', e);
      chart = null;
    }
    return chart;
  }

  function fmtMoney(v) { const n = Number(v||0); if (isNaN(n)) return '$0.00'; return '$' + n.toFixed(2); }

  function normalizeResponse(res) {
    if (!res) return null;
    if (res.ok === false) return { error: res.message || 'Server returned ok:false' };
    if (res.ok === true) { const copy = Object.assign({}, res); delete copy.ok; return copy; }
    return res;
  }

  // fetch then render
  async function fetchAndRender(range) {
    showSpinner();
    try {
      const q = range ? `?paymentsRange=${encodeURIComponent(range)}` : '';
      const res = await apiFetch('/dashboard' + q).catch(err => { throw err; });
      const payload = normalizeResponse(res);
      if (!payload || payload.error) throw new Error((payload && payload.error) ? payload.error : 'Invalid response');

      // top-level
      const totalStudents = payload.totalStudents || 0;
      const totalTeachers = payload.totalTeachers || 0;
      const paymentsTotal = (payload.payments && payload.payments.totalPaid) ? Number(payload.payments.totalPaid) : 0;
      const paymentsCount = payload.payments && payload.payments.count ? payload.payments.count : (payload.payments && payload.payments.series ? payload.payments.series.reduce((s,x)=>s + (x.count||0),0) : 0);
      const series = (payload.payments && Array.isArray(payload.payments.series)) ? payload.payments.series : [];

      if (paymentsPaidEl) paymentsPaidEl.textContent = fmtMoney(paymentsTotal);
      if (totalStudentsEl) totalStudentsEl.textContent = String(totalStudents);
      if (totalTeachersEl) totalTeachersEl.textContent = String(totalTeachers);
      if (paymentsCountEl) paymentsCountEl.textContent = String(paymentsCount || 0);

      // top students
      if (topStudentsEl) {
        topStudentsEl.innerHTML = '';
        const topStudents = payload.topStudents || [];
        if (!topStudents.length) {
          const no = document.createElement('div'); no.className = 'card'; no.textContent = 'No outstanding balances'; topStudentsEl.appendChild(no);
        } else {
          topStudents.forEach(s => {
            const bal = Number((s.totalDue || 0) - (s.paidAmount || 0));
            const itm = document.createElement('div');
            itm.className = 'top-item';
            itm.innerHTML = `<div>
                <div style="font-weight:700">${escapeHtml(s.fullname||'')}</div>
                <div class="muted small">${escapeHtml(s.numberId||'')}</div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700">${fmtMoney(bal)}</div>
                <div class="muted small">Outstanding</div>
              </div>`;
            topStudentsEl.appendChild(itm);
          });
        }
      }

      // chart labels/values
      const labels = series.map(x => x.label || '');
      const values = series.map(x => Number(x.total || 0));

      // create or update chart safely
      createOrUpdateChart(labels, values);

    } catch (err) {
      console.error('dashboard fetch error', err);
      if (paymentsPaidEl) paymentsPaidEl.textContent = '$0.00';
      if (totalStudentsEl) totalStudentsEl.textContent = '0';
      if (totalTeachersEl) totalTeachersEl.textContent = '0';
      if (topStudentsEl) topStudentsEl.innerHTML = '<div class="card">Unable to load top students</div>';
      try { if (chart) { chart.destroy(); chart = null; } } catch (e) {}
    } finally {
      hideSpinner();
    }
  }

  // IMPORTANT: single shared chart creator used above
  function createOrUpdateChart(labels, values) {
    // reuse chart var from closure
    // destroy existing Chart instance attached to this canvas (guard)
    try {
      if (window.Chart && Chart.getChart) {
        const existing = Chart.getChart(canvas);
        if (existing) {
          try { existing.destroy(); } catch (e) { console.warn(e); }
        }
      }
    } catch (e){}
    // create fresh
    return createOrUpdateChart_impl(labels, values);
  }

  // actual implementation function (to avoid recursion name collision)
  function createOrUpdateChart_impl(labels = [], data = []) {
    // create gradient and chart
    if (!canvas) return null;
    let bg = 'rgba(124,58,237,0.14)';
    try {
      const gctx = canvas.getContext && canvas.getContext('2d');
      if (gctx) {
        const gradient = gctx.createLinearGradient(0, 0, 0, canvas.height || 160);
        gradient.addColorStop(0, 'rgba(124,58,237,0.14)');
        gradient.addColorStop(1, 'rgba(124,58,237,0.02)');
        bg = gradient;
      }
    } catch(e){}

    if (!window.Chart) return null;
    try {
      chart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets: [{ label:'Payments', data, fill:true, tension:0.3, borderWidth:2, pointRadius:3, backgroundColor:bg, borderColor:'#7c3aed' }] },
        options: {
          maintainAspectRatio:false,
          responsive:true,
          plugins:{ legend:{display:false}, tooltip:{mode:'index', intersect:false} },
          scales:{ x:{grid:{display:false}, ticks:{maxRotation:0}}, y:{beginAtZero:true, grid:{color:'rgba(15,23,42,0.04)'}} }
        }
      });
    } catch (e) { console.error('chart create failed', e); chart = null; }
    return chart;
  }

  // filter handling
  async function onFilterChange() {
    const range = (filterEl && filterEl.value) ? filterEl.value : 'monthly';
    // stop any existing live poll
    if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
    await fetchAndRender(range);
    if (range === 'live') {
      liveInterval = setInterval(() => fetchAndRender('live'), 5000);
    }
  }

  if (filterEl) filterEl.addEventListener('change', onFilterChange);

  // initial run
  await onFilterChange();

  // return cleanup function (optional) — stops live polling & destroys chart
  return () => { if (liveInterval) clearInterval(liveInterval); try { if (chart) chart.destroy(); } catch(e){} };
}

// Replace renderChats() with this full function
async function renderChats() {
  app.innerHTML = '';
  const node = tpl('chats');
  app.appendChild(node);

  const curUser = await getCurrentUser().catch(()=>null);
  if (!curUser) { navigate('login'); return; }

  // UI elements (updated to single middle pane)
  const leftCol = document.getElementById('chats-left'); // new: left container
  const classesWrap = document.getElementById('chats-classes');
  const myClassesWrap = document.getElementById('chats-my-classes');
  const messagesWrap = document.getElementById('chats-messages-wrap');
  const participantsEl = document.getElementById('chats-participants');
  const mediaEl = document.getElementById('chats-media');
  const titleEl = document.getElementById('chats-room-title');
  const subEl = document.getElementById('chats-room-sub');
  const typingEl = document.getElementById('chats-typing');
  const sendFeedback = document.getElementById('chats-send-feedback');

  const middle = document.getElementById('chats-middle');

  // We'll create a reply banner above the input row.
  let inputRow = document.getElementById('chats-input-row');
  if (!inputRow) {
    const inputElExisting = document.getElementById('chats-input');
    if (inputElExisting && inputElExisting.parentNode) {
      // attempt to wrap existing input row (safe fallback, other code still uses ids)
      inputRow = inputElExisting.closest('div') || inputElExisting.parentNode;
    }
  }

  // reply banner setup (same as before)
  let replyBanner = document.getElementById('chats-reply-banner');
  if (!replyBanner) {
    replyBanner = document.createElement('div');
    replyBanner.id = 'chats-reply-banner';
    replyBanner.style.display = 'none';
    replyBanner.style.background = '#f3f4f6';
    replyBanner.style.border = '1px solid #e5e7eb';
    replyBanner.style.padding = '6px 8px';
    replyBanner.style.borderRadius = '8px';
    replyBanner.style.alignItems = 'center';
    replyBanner.style.justifyContent = 'space-between';
    replyBanner.style.fontSize = '13px';
    replyBanner.innerHTML = `<div id="chats-reply-info" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div><button id="chats-reply-cancel" class="btn btn--outline" style="margin-left:8px">✕</button>`;
    const container = inputRow || messagesWrap;
    if (container && container.parentNode) container.parentNode.insertBefore(replyBanner, container);
    else document.body.appendChild(replyBanner);
    document.getElementById('chats-reply-cancel')?.addEventListener('click', () => clearReplyComposer());
  }

  // initially hide participants & media (they appear only when selected)
  if (participantsEl) participantsEl.style.display = 'none';
  if (mediaEl) mediaEl.style.display = 'none';
  if (messagesWrap) messagesWrap.style.display = '';

  let currentClassId = null;
  let socket = null;

  function toast(msg, duration = 3000) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=> t.classList.add('show'), 10);
    setTimeout(()=> t.remove(), duration);
  }

  function fmtDate(d) { try { return new Date(d).toLocaleString(); } catch(e) { return String(d); } }

  function resolveUrl(u) {
    if (!u) return u;
    try {
      if (/^https?:\/\//i.test(u)) return u;
      const base = (typeof API_BASE === 'string' && API_BASE) ? API_BASE.replace(/\/api$/,'') : '';
      const origin = base || (window.location.origin || (window.location.protocol + '//' + window.location.host));
      if (u.startsWith('/')) return origin + u;
      return origin + '/' + u;
    } catch (e) {
      return u;
    }
  }

  // Reaction logic & helper functions (unchanged from your working code)
  const REACT_EMOJIS = ['😃','👍','❤️','😔','👎','😡'];
  let reactPopupEl = document.getElementById('chats-react-popup');
  if (!reactPopupEl) {
    reactPopupEl = document.createElement('div');
    reactPopupEl.id = 'chats-react-popup';
    Object.assign(reactPopupEl.style, {
      position: 'absolute',
      display: 'none',
      padding: '8px',
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.08)',
      boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
      borderRadius: '10px',
      zIndex: 9999,
      minWidth: '120px',
      maxWidth: '280px',
      gap: '6px',
      whiteSpace: 'nowrap'
    });
    document.body.appendChild(reactPopupEl);
  } else {
    reactPopupEl.style.position = 'absolute';
    reactPopupEl.style.zIndex = 9999;
  }
  function buildReactPopupContent() { return REACT_EMOJIS.map(e => `<button type="button" class="react-emoji" data-emoji="${escapeHtml(e)}" style="font-size:20px;padding:6px;border-radius:6px;border:0;background:transparent;cursor:pointer">${e}</button>`).join(' '); }
  function openReactPopupAt(e, msgId) { if (!reactPopupEl) return; reactPopupEl.innerHTML = buildReactPopupContent(); reactPopupEl._targetMsg = msgId; const popupWidth = 220; const popupHeight = 50; const viewportW = document.documentElement.clientWidth; const viewportH = document.documentElement.clientHeight; const pageX = e.pageX || (e.touches && e.touches[0] && e.touches[0].pageX) || 0; const pageY = e.pageY || (e.touches && e.touches[0] && e.touches[0].pageY) || 0; const x = Math.min(pageX, window.pageXOffset + viewportW - popupWidth - 12); const y = Math.min(pageY, window.pageYOffset + viewportH - popupHeight - 12); reactPopupEl.style.left = (x + 6) + 'px'; reactPopupEl.style.top = (y + 6) + 'px'; reactPopupEl.style.display = ''; reactPopupEl.style.opacity = '1'; try { reactPopupEl.setAttribute('tabindex','0'); reactPopupEl.focus(); } catch(e){} }
  function closeReactPopup() { if (!reactPopupEl) return; reactPopupEl.style.display = 'none'; reactPopupEl._targetMsg = null; }
  function updateReactsInDOM(messageId, reactions) {
    const el = document.getElementById('msg-' + messageId);
    if (!el) return;
    let reactEl = el.querySelector('.msg-reacts');
    if (!reactEl) {
      reactEl = document.createElement('div');
      reactEl.className = 'msg-reacts muted';
      reactEl.style.marginTop = '6px';
      const replies = el.querySelector('.msg-replies');
      if (replies && replies.parentNode) replies.parentNode.insertBefore(reactEl, replies);
      else el.appendChild(reactEl);
    }
    const filtered = (reactions || []).filter(r => Array.isArray(r.userIds) ? r.userIds.length > 0 : (r.userIds && r.userIds.length > 0));
    if (!filtered.length) { reactEl.innerHTML = ''; return; }
    reactEl.innerHTML = filtered.map(r => {
      const count = Array.isArray(r.userIds) ? r.userIds.length : (r.userIds ? r.userIds.length : 0);
      return `<span class="react-pill">${escapeHtml(r.emoji)} ${count}</span>`;
    }).join('');
  }
  async function sendReactForMessage(messageId, emoji) {
    if (!messageId) return;
    try {
      reactPopupEl.style.opacity = '0.6';
      const addResp = await apiFetch(`/chats/message/${encodeURIComponent(messageId)}/react`, { method: 'POST', body: { emoji } });
      reactPopupEl.style.opacity = '';
      if (!(addResp && addResp.ok)) { toast('React failed'); return; }
      let reactions = addResp.reactions || [];
      updateReactsInDOM(messageId, reactions);
      const myIdStr = String(curUser._id);
      const otherEmojisToRemove = (reactions || []).filter(r => String(r.emoji) !== String(emoji) && Array.isArray(r.userIds) && r.userIds.map(String).includes(myIdStr)).map(r => r.emoji);
      if (otherEmojisToRemove.length) {
        for (const e of otherEmojisToRemove) {
          try {
            const remResp = await apiFetch(`/chats/message/${encodeURIComponent(messageId)}/react`, { method: 'POST', body: { emoji: e } });
            if (remResp && remResp.ok) { reactions = remResp.reactions || reactions; updateReactsInDOM(messageId, reactions); }
          } catch (er) { console.warn('failed to remove other emoji', e, er); }
        }
      }
    } catch (err) {
      reactPopupEl.style.opacity = '';
      console.error('react error', err);
      toast('React failed');
    }
  }
  reactPopupEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('.react-emoji');
    if (!btn) return;
    const emoji = btn.dataset && btn.dataset.emoji ? btn.dataset.emoji : btn.textContent;
    const msgId = reactPopupEl._targetMsg;
    if (!msgId) { closeReactPopup(); return; }
    sendReactForMessage(msgId, emoji).then(()=> closeReactPopup()).catch(()=> closeReactPopup());
  });
  document.addEventListener('click', (ev) => { if (!reactPopupEl) return; if (reactPopupEl.style.display === 'none') return; if (ev.target === reactPopupEl || reactPopupEl.contains(ev.target)) return; closeReactPopup(); }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeReactPopup(); });

  // Reply composer helpers
  function showReplyComposer(targetMsgId, targetSenderName) {
    if (!replyBanner) return;
    replyBanner.style.display = 'flex';
    const info = document.getElementById('chats-reply-info');
    info.textContent = `Replying to ${targetSenderName || 'Unknown'}`;
    replyBanner.dataset.replyTo = String(targetMsgId);
    const input = document.getElementById('chats-input');
    if (input) input.focus();
  }
  function clearReplyComposer() {
    if (!replyBanner) return;
    replyBanner.style.display = 'none';
    replyBanner.dataset.replyTo = '';
    const input = document.getElementById('chats-input');
    if (input) { input.value = ''; input.placeholder = 'Write a message...'; }
  }

  // UI panel controls (unchanged)
  function ensureTitleControls() {
    if (!subEl) return;
    if (document.getElementById('chats-title-controls')) return;
    const ctrl = document.createElement('div');
    ctrl.id = 'chats-title-controls';
    ctrl.style.display = 'flex';
    ctrl.style.alignItems = 'center';
    ctrl.style.gap = '8px';

    const backBtn = document.createElement('button');
    backBtn.id = 'chats-back-to-classes';
    backBtn.type = 'button';
    backBtn.textContent = '← Classes';
    backBtn.className = 'btn btn--outline';
    backBtn.addEventListener('click', () => {
      if (currentClassId) { leaveClassRoom(currentClassId); currentClassId = null; }
      showClassListView();
    });

    const partBtn = document.createElement('button');
    partBtn.id = 'chats-open-participants';
    partBtn.type = 'button';
    partBtn.textContent = 'Participants';
    partBtn.className = 'btn btn--outline';
    partBtn.addEventListener('click', () => showParticipantsView());

    const mediaBtn = document.createElement('button');
    mediaBtn.id = 'chats-open-media';
    mediaBtn.type = 'button';
    mediaBtn.textContent = 'Media';
    mediaBtn.className = 'btn btn--outline';
    mediaBtn.addEventListener('click', () => showMediaView());

    const closePanelBtn = document.createElement('button');
    closePanelBtn.id = 'chats-close-panel';
    closePanelBtn.type = 'button';
    closePanelBtn.textContent = '✕';
    closePanelBtn.className = 'btn btn--outline';
    closePanelBtn.addEventListener('click', () => showMessagesView());

    ctrl.appendChild(backBtn);
    ctrl.appendChild(partBtn);
    ctrl.appendChild(mediaBtn);
    ctrl.appendChild(closePanelBtn);

    subEl.innerHTML = '';
    subEl.appendChild(ctrl);
  }

  function showClassListView() {
    if (leftCol) leftCol.style.display = '';
    if (classesWrap) classesWrap.style.display = '';
    if (myClassesWrap) myClassesWrap.style.display = '';
    messagesWrap.style.display = 'none';
    participantsEl.style.display = 'none';
    mediaEl.style.display = 'none';
    if (inputRow) inputRow.style.display = 'none';
    if (replyBanner) replyBanner.style.display = 'none';
    if (titleEl) titleEl.textContent = 'Classes';
    if (subEl) subEl.innerHTML = '';
    // restore middle column width if it was expanded
    if (middle) middle.style.flex = '1';
  }

  function showMessagesView() {
    if (leftCol) leftCol.style.display = 'none'; // hide left when showing messages
    if (classesWrap) classesWrap.style.display = 'none';
    if (myClassesWrap) myClassesWrap.style.display = 'none';
    messagesWrap.style.display = '';
    participantsEl.style.display = 'none';
    mediaEl.style.display = 'none';
    if (inputRow) inputRow.style.display = '';
    ensureTitleControls();
    const closeBtn = document.getElementById('chats-close-panel'); if (closeBtn) closeBtn.style.display = 'none';
    // expand middle to use full width
    if (middle) middle.style.flex = '1 1 100%';
  }

  function showParticipantsView() {
    if (leftCol) leftCol.style.display = 'none';
    if (classesWrap) classesWrap.style.display = 'none';
    if (myClassesWrap) myClassesWrap.style.display = 'none';
    messagesWrap.style.display = 'none';
    participantsEl.style.display = '';
    mediaEl.style.display = 'none';
    if (inputRow) inputRow.style.display = 'none';
    ensureTitleControls();
    const closeBtn = document.getElementById('chats-close-panel'); if (closeBtn) closeBtn.style.display = '';
    if (replyBanner) replyBanner.style.display = 'none';
    if (middle) middle.style.flex = '1 1 100%';
  }

  function showMediaView() {
    if (leftCol) leftCol.style.display = 'none';
    if (classesWrap) classesWrap.style.display = 'none';
    if (myClassesWrap) myClassesWrap.style.display = 'none';
    messagesWrap.style.display = 'none';
    participantsEl.style.display = 'none';
    mediaEl.style.display = '';
    if (inputRow) inputRow.style.display = 'none';
    ensureTitleControls();
    const closeBtn = document.getElementById('chats-close-panel'); if (closeBtn) closeBtn.style.display = '';
    if (replyBanner) replyBanner.style.display = 'none';
    if (middle) middle.style.flex = '1 1 100%';
  }

  // Sockets and message handling (unchanged)
  function connectSocket() {
    try {
      const token = getToken();
      if (!token) return null;
      socket = io((typeof API_BASE === 'string' ? API_BASE.replace(/\/api$/,'') : ''), {
        auth: { token }
      });

      socket.on('connect', ()=> console.log('chat socket connected'));
      socket.on('disconnect', ()=> console.log('chat socket disconnected'));

      socket.on('chat:newMessage', payload => {
        try {
          const msg = payload && payload.message;
          if (!msg) return;
          if (String(msg.classId) === String(currentClassId)) {
            appendMessage(msg);
            scrollMessagesToBottom();
            updateNavChatBadgeForClass(currentClassId, 0);
          } else {
            incrementNavChatBadgeForClass(String(msg.classId));
          }
        } catch (e) { console.error(e); }
      });

      socket.on('chat:deleteMessage', ({ messageId }) => {
        const el = document.getElementById('msg-'+messageId);
        if (el) {
          const text = el.querySelector('.msg-text');
          if (text) text.textContent = '[deleted]';
          el.classList.add('deleted');
        }
      });

      socket.on('chat:react', ({ messageId, reactions }) => { updateReactsInDOM(messageId, reactions); });

      socket.on('chat:reply', ({ messageId, replies }) => {
        const el = document.getElementById('msg-'+messageId);
        if (!el) return;
        const rep = el.querySelector('.msg-replies');
        if (rep) rep.innerHTML = (replies || []).map(r => `<div class="muted">${escapeHtml(r.senderName)}: ${escapeHtml(r.text)}</div>`).join('');
      });

      socket.on('chat:typing', ({ userId, fullname, typing }) => {
        if (!typing) { typingEl.textContent = ''; return; }
        typingEl.textContent = `${fullname} is typing...`;
        setTimeout(()=> { typingEl.textContent = ''; }, 2500);
      });

      socket.on('chat:mute', data => console.log('mute', data));
      socket.on('chat:unmute', data => console.log('unmute', data));

      return socket;
    } catch (e) {
      console.warn('socket connect failed', e);
      return null;
    }
  }

  function joinClassRoom(classId) {
    if (!socket) connectSocket();
    if (socket && classId) socket.emit('joinClass', classId);
  }
  function leaveClassRoom(classId) {
    if (socket && classId) socket.emit('leaveClass', classId);
  }

  // appendMessage (same as your working implementation)
  function appendMessage(msg) {
    try {
      if (!msg) return;
      const id = 'msg-'+msg._id;
      if (document.getElementById(id)) return;

      const wrapper = document.createElement('div');
      wrapper.id = id;
      wrapper.className = 'chat-message enter';
      wrapper.style.display = 'flex';
      wrapper.style.gap = '10px';
      wrapper.style.alignItems = 'flex-start';
      wrapper.dataset.msgCreatedAt = msg.createdAt || '';

      const avatar = document.createElement('div');
      avatar.style.width = '44px'; avatar.style.height = '44px'; avatar.style.borderRadius='8px';
      avatar.style.background = '#f3f4f6'; avatar.style.display='flex'; avatar.style.alignItems='center'; avatar.style.justifyContent='center';
      avatar.textContent = (msg.senderName || 'U').split(' ').map(x=>x[0]).slice(0,2).join('');

      const content = document.createElement('div'); content.style.flex='1';
      const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between';
      header.innerHTML = `<div style="font-weight:700">${escapeHtml(msg.senderName||'Unknown')} <span class="muted" style="font-weight:400;font-size:12px">(${escapeHtml(msg.senderRole||'')})</span></div><div class="muted" style="font-size:12px">${escapeHtml(fmtDate(msg.createdAt||msg.createdAt))}</div>`;

      const textDiv = document.createElement('div'); textDiv.className='msg-text'; textDiv.style.marginTop='6px';
      textDiv.textContent = msg.deleted ? '[deleted]' : (msg.text || '');

      // media
      const mediaWrap = document.createElement('div'); mediaWrap.style.display='flex'; mediaWrap.style.flexWrap='wrap'; mediaWrap.style.gap='8px'; mediaWrap.style.marginTop='6px';
      try {
        if (Array.isArray(msg.media) && msg.media.length) {
          msg.media.forEach(m => {
            try {
              const a = document.createElement('a'); a.href = resolveUrl(m.url); a.target='_blank';
              if ((m.contentType||'').startsWith('image/')) {
                const im = document.createElement('img'); im.src = resolveUrl(m.url);
                im.style.maxWidth='160px'; im.style.maxHeight='120px'; im.style.borderRadius='8px'; im.style.display='block';
                a.appendChild(im);
              } else {
                a.textContent = m.filename || m.url;
              }
              mediaWrap.appendChild(a);
            } catch (e) { console.warn('append media item error', e); }
          });
        }
      } catch (e) { console.warn('media parse error', e); }

      const reacts = document.createElement('div'); reacts.className='msg-reacts muted'; reacts.style.marginTop='6px';
      if (Array.isArray(msg.reactions) && msg.reactions.length) {
        const filtered = msg.reactions.filter(r => Array.isArray(r.userIds) ? r.userIds.length > 0 : (r.userIds && r.userIds.length > 0));
        reacts.innerHTML = filtered.map(r => `<span class="react-pill">${escapeHtml(r.emoji)} ${Array.isArray(r.userIds) ? r.userIds.length : (r.userIds ? r.userIds.length : 0)}</span>`).join('');
      }
      const replies = document.createElement('div'); replies.className='msg-replies'; replies.style.marginTop='6px';
      if (Array.isArray(msg.replies) && msg.replies.length) {
        replies.innerHTML = msg.replies.map(r => `<div class="muted">${escapeHtml(r.senderName)}: ${escapeHtml(r.text)}</div>`).join('');
      }

      const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='6px'; actions.style.marginTop='6px';
      const reactBtn = document.createElement('button'); reactBtn.className='btn btn--outline'; reactBtn.textContent='React';
      reactBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openReactPopupAt(e, msg._id); });

      const replyBtn = document.createElement('button'); replyBtn.className='btn btn--outline'; replyBtn.textContent='Reply';
      replyBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showReplyComposer(msg._id, msg.senderName || 'Unknown'); });

      const delBtn = document.createElement('button'); delBtn.className='btn btn--outline'; delBtn.textContent='Delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this message?')) return;
        try {
          const r = await apiFetch(`/chats/message/${encodeURIComponent(msg._id)}`, { method: 'DELETE' });
          if (r && r.ok) {
            textDiv.textContent = '[deleted]';
            wrapper.classList.add('deleted');
            if (mediaWrap) mediaWrap.innerHTML = '';
            toast('Message deleted');
          } else {
            toast('Delete failed: ' + (r && r.message || ''));
          }
        } catch (err) { console.error(err); toast('Delete failed'); }
      });

      let canDelete = false;
      const role = (curUser.role||'').toLowerCase();
      if (role === 'manager' || role === 'admin') canDelete = true;
      if (role === 'teacher') { canDelete = true; }
      if (String(msg.senderId) === String(curUser._id)) canDelete = true;
      if (canDelete) actions.appendChild(delBtn);
      actions.appendChild(reactBtn); actions.appendChild(replyBtn);

      content.appendChild(header);
      content.appendChild(textDiv);
      if (mediaWrap && mediaWrap.children.length) content.appendChild(mediaWrap);
      content.appendChild(reacts);
      content.appendChild(replies);
      content.appendChild(actions);

      wrapper.appendChild(avatar);
      wrapper.appendChild(content);
      messagesWrap.appendChild(wrapper);

      setTimeout(()=> wrapper.classList.remove('enter'), 250);
    } catch (e) {
      console.error('appendMessage failed', e);
    }
  }

  function clearMessages() { messagesWrap.innerHTML = ''; }
  function scrollMessagesToBottom() { try { messagesWrap.scrollTop = messagesWrap.scrollHeight; } catch(e){} }

  // fetch classes
  async function loadClasses() {
    // If user is student — hide left column and do not render class list (student auto-opens below)
    const role = (curUser.role||'').toLowerCase();
    if (role === 'student') {
      if (leftCol) leftCol.style.display = 'none';
      // ensure middle uses full width
      if (middle) middle.style.flex = '1 1 100%';
      // still keep myClassesWrap updated (needed only for fallback) but hide it visually
      try {
        const s = await apiFetch(`/students/${encodeURIComponent(curUser._id)}`);
        const st = s && (s.student || s) || null;
        if (st) {
          myClassesWrap.innerHTML = '';
          const clsName = (st.classId && (st.classId.name || st.classId)) || st.className || 'Class';
          const b = document.createElement('button'); b.className='card'; b.textContent = clsName;
          b.addEventListener('click', ()=> openClass(String(st.classId?._id || st.classId), clsName));
          myClassesWrap.appendChild(b);
        } else {
          myClassesWrap.innerHTML = '<div class="muted">No class assigned</div>';
        }
      } catch (err) {
        console.error('loadClasses (student) error', err);
        myClassesWrap.innerHTML = '<div class="muted">Unable to load classes</div>';
      }
      return;
    }

    // Manager / teacher path: show left column normally
    if (leftCol) leftCol.style.display = '';
    if (middle) middle.style.flex = '1';
    classesWrap.innerHTML = '<div class="muted">Loading classes…</div>';
    myClassesWrap.innerHTML = '';
    try {
      if (role === 'manager' || role === 'admin') {
        // call manager classes endpoint -> server should filter to only manager's classes (see backend change below)
        const res = await apiFetch('/chats/classes');
        if (res && res.ok) {
          classesWrap.innerHTML = '';
          (res.classes || []).forEach(c => {
            const b = document.createElement('button');
            b.className = 'card';
            b.style.textAlign='left';
            b.dataset.classId = String(c._id);
            b.innerHTML = `<div style="font-weight:700">${escapeHtml(c.name || c.classId || '')}</div><div class="muted">Students: ${c.studentsCount} • messages: ${c.chatCount}</div>`;
            b.addEventListener('click', ()=> { openClass(String(c._id), c.name); });
            classesWrap.appendChild(b);
          });
        } else classesWrap.innerHTML = '<div class="muted">No classes</div>';
      } else {
        // teacher path (unchanged)
        try {
          if ((curUser.role||'').toLowerCase() === 'teacher') {
            const t = await apiFetch('/teachers/me');
            const teacher = t && (t.teacher || t) || null;
            if (teacher && Array.isArray(teacher.classIds) && teacher.classIds.length) {
              myClassesWrap.innerHTML = '';
              (teacher.classIds || []).forEach(cid => {
                const label = (cid && cid.name) ? cid.name : (cid && cid.classId) ? cid.classId : String(cid);
                const b = document.createElement('button'); b.className='card'; b.textContent = label;
                b.addEventListener('click', ()=> openClass(String(cid._id || cid), label));
                myClassesWrap.appendChild(b);
              });
            } else {
              myClassesWrap.innerHTML = '<div class="muted">No classes</div>';
            }
          }
        } catch (err) {
          console.error('loadClasses (teacher) error', err);
          myClassesWrap.innerHTML = '<div class="muted">Unable to load classes</div>';
        }
      }
    } catch (err) {
      console.error('loadClasses', err);
      classesWrap.innerHTML = '<div class="muted">Failed to load</div>';
    }
  }

  async function openClass(classId, className) {
    if (!classId) return;
    if (currentClassId) leaveClassRoom(currentClassId);
    currentClassId = classId;
    titleEl.textContent = className || 'Class Chat';
    clearMessages();

    // hide left column when opening a class (both manager & student view)
    if (leftCol) leftCol.style.display = 'none';
    if (classesWrap) classesWrap.style.display = 'none';
    if (myClassesWrap) myClassesWrap.style.display = 'none';

    showMessagesView();
    ensureTitleControls();
    joinClassRoom(classId);

    // load messages
    try {
      const res = await apiFetch(`/chats/class/${encodeURIComponent(classId)}/messages?limit=200`);
      if (res && res.ok) {
        const msgs = res.messages || [];
        msgs.forEach(m => appendMessage(m));
        scrollMessagesToBottom();
      } else { messagesWrap.innerHTML = '<div class="muted">No messages</div>'; }
    } catch (err) {
      console.error('load messages', err);
      messagesWrap.innerHTML = '<div class="muted">Failed to load messages</div>';
    }

    // preload participants
    try {
      const p = await apiFetch(`/chats/class/${encodeURIComponent(classId)}/participants`);
      participantsEl.innerHTML = '';
      if (p && p.ok) {
        (p.participants || []).forEach(st => {
          const div = document.createElement('div'); div.style.display='flex'; div.style.gap='8px'; div.style.alignItems='center'; div.style.marginBottom='8px';
          const img = document.createElement('img'); img.src = st.photo ? resolveUrl(st.photo) : '/uploads/default-avatar.png';
          img.style.width='40px'; img.style.height='40px'; img.style.borderRadius='8px'; img.style.objectFit='cover';
          const info = document.createElement('div'); info.innerHTML = `<div style="font-weight:700">${escapeHtml(st.fullname)}</div><div class="muted">${escapeHtml(st.numberId||'')}</div>`;
          div.appendChild(img); div.appendChild(info);
          participantsEl.appendChild(div);
        });
      } else participantsEl.innerHTML = '<div class="muted">No participants</div>';
    } catch (err) {
      console.error('participants', err);
      participantsEl.innerHTML = '<div class="muted">Failed to load participants</div>';
    }

    // preload media
    await loadMedia(classId);

    updateNavChatBadgeForClass(classId, 0);
  }

  async function loadMedia(classId) {
    mediaEl.innerHTML = '<div class="muted">Loading media…</div>';
    try {
      const r = await apiFetch(`/chats/class/${encodeURIComponent(classId)}/media`);
      if (r && r.ok) {
        mediaEl.innerHTML = '';
        (r.media || []).forEach(m => {
          const a = document.createElement('a'); a.href = resolveUrl(m.url); a.target = '_blank'; a.style.display='block'; a.style.marginBottom='8px';
          if (m.contentType && m.contentType.startsWith('image/')) {
            const im = document.createElement('img'); im.src = resolveUrl(m.url); im.style.width='100%'; im.style.borderRadius='8px';
            a.appendChild(im);
          } else {
            a.textContent = m.filename || m.url;
          }
          mediaEl.appendChild(a);
        });
      } else mediaEl.innerHTML = '<div class="muted">No media</div>';
    } catch (err) {
      console.error('getMedia', err);
      mediaEl.innerHTML = '<div class="muted">Failed to load media</div>';
    }
  }

  // send message (reply handling unchanged)
  document.getElementById('chats-send').addEventListener('click', async () => {
    if (!currentClassId) return alert('Select a class first');
    const textEl = document.getElementById('chats-input');
    const text = textEl.value.trim();
    const files = document.getElementById('chats-files').files;
    if (!text && (!files || !files.length)) return;
    sendFeedback.textContent = '';
    const replyTo = replyBanner && replyBanner.dataset && replyBanner.dataset.replyTo ? replyBanner.dataset.replyTo : null;
    try {
      if (replyTo && (!files || !files.length)) {
        const r = await apiFetch(`/chats/message/${encodeURIComponent(replyTo)}/reply`, { method:'POST', body:{ text } });
        if (r && r.ok) {
          if (r.message) appendMessage(r.message);
          if (r.replies && r.replies.length) {
            const origEl = document.getElementById('msg-' + replyTo);
            if (origEl) {
              const rep = origEl.querySelector('.msg-replies') || (function(){ const d = document.createElement('div'); d.className='msg-replies'; d.style.marginTop='6px'; origEl.appendChild(d); return d; })();
              rep.innerHTML = (r.replies || []).map(rr => `<div class="muted">${escapeHtml(rr.senderName)}: ${escapeHtml(rr.text)}</div>`).join('');
            }
          }
          textEl.value = '';
          clearReplyComposer();
          toast('Reply sent');
        } else { sendFeedback.textContent = 'Reply failed: ' + (r && r.message || ''); toast('Reply failed'); }
      } else if (files && files.length) {
        const fd = new FormData();
        if (text) fd.append('text', text);
        for (const f of files) fd.append('files', f);
        const r = await apiUpload(`/chats/class/${encodeURIComponent(currentClassId)}/messages`, fd);
        if (r && r.ok) {
          textEl.value = '';
          document.getElementById('chats-files').value = '';
          sendFeedback.textContent = '';
          clearReplyComposer();
          toast('Sent');
        } else { sendFeedback.textContent = 'Send failed: ' + (r && r.message || ''); toast('Send failed'); }
      } else {
        const r = await apiFetch(`/chats/class/${encodeURIComponent(currentClassId)}/messages`, { method:'POST', body:{ text } });
        if (r && r.ok) { textEl.value = ''; sendFeedback.textContent = ''; clearReplyComposer(); toast('Sent'); }
        else { sendFeedback.textContent = 'Send failed: ' + (r && r.message || ''); toast('Send failed'); }
      }
    } catch (err) {
      console.error('send message err', err);
      sendFeedback.textContent = 'Send failed';
      toast('Send failed');
    }
  });

  // attach/typing/refresh/polling (unchanged)
  document.getElementById('chats-attach').addEventListener('click', ()=> document.getElementById('chats-files').click());
  document.getElementById('chats-files').addEventListener('change', ()=> {
    const f = document.getElementById('chats-files').files;
    if (f && f.length) {
      document.getElementById('chats-input').placeholder = `${f.length} file(s) selected — write a message if you want`;
    }
  });
  const inputEl = document.getElementById('chats-input');
  let typingTimer = null;
  inputEl.addEventListener('input', ()=> {
    if (!socket || !currentClassId) return;
    socket.emit('typing', { classId: currentClassId, typing: true });
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(()=> { socket.emit('typing', { classId: currentClassId, typing: false }); }, 1200);
  });
  document.getElementById('chats-refresh')?.addEventListener('click', loadClasses);
  document.getElementById('chats-media-refresh')?.addEventListener('click', ()=> { if (currentClassId) loadMedia(currentClassId); });
  function incrementNavChatBadgeForClass(classId) { /* implement UI if desired */ }
  function updateNavChatBadgeForClass(classId, count) { /* implement UI if desired */ }

  // initial connect and load
  connectSocket();
  await loadClasses();

  // Student auto-open their class
  if ((curUser.role||'').toLowerCase() === 'student') {
    try {
      const sresp = await apiFetch(`/students/${encodeURIComponent(curUser._id)}`);
      const st = sresp && (sresp.student || sresp) || null;
      if (st && st.classId) await openClass(String(st.classId._id || st.classId), st.classId && st.classId.name ? st.classId.name : (st.className || 'Class'));
    } catch (err) { /* ignore */ }
  } else {
    // manager/teacher: show class list initially
    showClassListView();
  }

  // poll fallback
  setInterval(async () => {
    if (!socket || !socket.connected) {
      if (!currentClassId) return;
      try {
        const res = await apiFetch(`/chats/class/${encodeURIComponent(currentClassId)}/messages`);
        if (res && res.ok) {
          messagesWrap.innerHTML=''; // crude refresh
          (res.messages || []).forEach(m => appendMessage(m));
          scrollMessagesToBottom();
        }
      } catch (e) {}
    }
  }, 2000);
} // end renderChats

// wire route
// in your navigate() add: if(route === 'chats'){ await renderChats(); return; }

/* ----------------- ZOOM / MEETINGS (add to frontend/js/app.js) ----------------- */

/*
  API expectations (frontend):
  GET  /api/zoom                -> { items: [ { _id, title, meetingId, hostId, classId, startsAt, createdBy } ] }
  POST /api/zoom                -> create meeting, payload { title, classId, startsAt, options } -> returns meeting obj
  GET  /api/zoom/:id/can-join   -> 200 OK or 403
  (Socket.IO signaling: see bottom of this reply)
*/

// Add route handlers to your navigate function: add these lines to navigate() or replace navigate with this wrapper:
/* ---------- Render meetings list (for teachers/managers) & join links for students 

/* ---------- Create Meeting UI (teachers / managers) ---------- */
async function renderCreateMeeting() {
  const role = getUserRole();
  if (!['admin','manager','teacher'].includes(role)) {
    app.innerHTML = '<div class="page"><h2>Access denied</h2></div>';
    return;
  }

  app.innerHTML = '';
  const node = document.createElement('div');
  node.className = 'page';
  node.innerHTML = `<h2>Create Meeting</h2>
    <div class="card">
      <label>Title</label><input id="m-title" placeholder="e.g. Physics Class - Period 1" />
      <label>Class (optional)</label><select id="m-class"></select>
      <label>Starts at</label><input id="m-starts" type="datetime-local" />
      <label>Options</label>
      <div style="display:flex;gap:8px;margin-top:6px">
        <label><input id="m-opt-record" type="checkbox" /> Allow recording</label>
        <label><input id="m-opt-only-class" type="checkbox" /> Students limited to class only</label>
      </div>
      <div style="margin-top:10px"><button id="m-save" class="btn">Create</button> <button id="m-cancel" class="btn btn--outline">Cancel</button></div>
    </div>`;
  app.appendChild(node);

  document.getElementById('m-cancel').addEventListener('click', ()=> navigate('meetings'));

  // load classes to select
  try {
    const cls = await apiFetch('/classes');
    const sel = document.getElementById('m-class');
    sel.innerHTML = '<option value="">(All)</option>';
    (cls.items || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = c.name + (c.classId ? (' (' + c.classId + ')') : '');
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn('Could not load classes for create meeting', e);
    const sel = document.getElementById('m-class');
    if (sel) sel.innerHTML = '<option value="">(could not load)</option>';
  }

  document.getElementById('m-save').addEventListener('click', async () => {
    const title = document.getElementById('m-title').value.trim();
    const classId = document.getElementById('m-class').value || null;
    const startsAt = document.getElementById('m-starts').value || null;
    const options = {
      record: !!document.getElementById('m-opt-record').checked,
      onlyClass: !!document.getElementById('m-opt-only-class').checked
    };
    if (!title) return alert('Title is required');

    try {
      const payload = { title, classId, startsAt, options };
      console.log('Creating meeting:', payload);
      // IMPORTANT: use '/zoom' (not '/api/zoom') because API_BASE already contains '/api'
      const res = await apiFetch('/zoom', { method: 'POST', body: payload });
      alert('Meeting created');
      navigate('meetings');
    } catch (err) {
      console.error('Create meeting failed', err, err.body || err);
      alert('Failed to create meeting: ' + ((err && err.message) || 'server error'));
    }
  });
}


async function renderMeetings() {
  app.innerHTML = '';
  const node = document.createElement('div');
  node.className = 'page';
  node.innerHTML = `<h2>Meetings <button id="create-meeting-btn" class="btn" style="margin-left:12px">Create</button></h2>
    <div id="meetings-list">Loading meetings...</div>`;
  app.appendChild(node);
  document.getElementById('create-meeting-btn').addEventListener('click', ()=> navigate('create-meeting'));

  const listDiv = document.getElementById('meetings-list');
  listDiv.textContent = 'Loading...';
  try {
    const res = await apiFetch('/zoom'); // expects { items: [...] }
    const items = res.items || [];
    if (!items.length) { listDiv.innerHTML = '<p>No meetings found.</p>'; return; }
    listDiv.innerHTML = '';
    const me = (await getCurrentUser().catch(()=>null)) || {};
    const myId = me._id;
    const myRole = getUserRole();

    items.forEach(m => {
      const el = document.createElement('div');
      el.className = 'card';
      const starts = m.startsAt ? (' • ' + new Date(m.startsAt).toLocaleString()) : '';
      const ownerMarker = (m.ownerId && String(m.ownerId) === String(myId)) ? ' (You)' : '';
      el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong>${escapeHtml(m.title || m.meetingId)}${ownerMarker}</strong>
          <div class="muted">${escapeHtml(String(m.classIds && m.classIds.length ? m.classIds.join(', ') : 'All classes'))}${starts}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn join-meeting" data-meeting="${escapeHtml(m.meetingId)}">Join</button>
          <button class="btn btn--outline copy-link" data-meeting="${escapeHtml(m.meetingId)}">Copy Link</button>
          <button class="btn btn--outline view-participants" data-meeting="${escapeHtml(m.meetingId)}">Participants</button>
          ${(String(m.ownerId) === String(myId) || ['manager','admin'].includes(myRole)) ? `<button class="btn btn--outline delete-meeting" data-id="${escapeHtml(m._id||m.meetingId)}" data-meeting="${escapeHtml(m.meetingId)}">Delete</button>` : ''}
        </div>
      </div>`;
      listDiv.appendChild(el);
    });

    // handlers
    listDiv.querySelectorAll('.join-meeting').forEach(btn => btn.addEventListener('click', (e) => {
      const meetingId = e.target.dataset.meeting;
      history.replaceState(null, '', '?meeting=' + encodeURIComponent(meetingId));
      navigate('zoom');
    }));

    listDiv.querySelectorAll('.copy-link').forEach(btn => btn.addEventListener('click', (e) => {
      const meetingId = e.target.dataset.meeting;
      const url = window.location.origin + window.location.pathname + '?meeting=' + encodeURIComponent(meetingId);
      navigator.clipboard?.writeText(url).then(()=> alert('Link copied'));
    }));

    listDiv.querySelectorAll('.delete-meeting').forEach(btn => btn.addEventListener('click', async (e) => {
      if (!confirm('Delete meeting? This will disconnect current participants.')) return;
      const idToDelete = e.target.dataset.id || e.target.dataset.meeting;
      try {
        const res = await apiFetch('/zoom/' + encodeURIComponent(idToDelete), { method: 'DELETE' });
        alert('Meeting deleted');
        renderMeetings();
      } catch (err) {
        console.error('Delete failed', err);
        // try to show helpful server detail
        const detail = (err && err.body && (err.body.detail || err.body.message)) || err.message;
        alert('Delete failed: ' + (detail || 'server error'));
      }
    }));
    

    listDiv.querySelectorAll('.view-participants').forEach(btn => btn.addEventListener('click', async (e) => {
      const meetingId = e.target.dataset.meeting;
      // quick participants viewer: navigate to zoom route and let participants list show (read-only)
      history.replaceState(null, '', '?meeting=' + encodeURIComponent(meetingId));
      navigate('zoom');
    }));

  } catch (err) {
    console.error('Load meetings error', err);
    listDiv.innerHTML = '<p>Failed to load meetings.</p>';
  }
}

// frontend: updated renderZoom() with Record + Chat toggle
// frontend: renderZoom()
async function renderZoom() {
  app.innerHTML = '';
  const node = tpl('tpl-zoom');
  app.appendChild(node);

  const btnAudio = document.getElementById('btn-toggle-audio');
  const btnVideo = document.getElementById('btn-toggle-video');
  const btnShare = document.getElementById('btn-share-screen');
  const btnMuteAll = document.getElementById('btn-mute-all');
  const videosWrap = document.getElementById('videos');

  // --- small helpers (toast & icons) ---
  function showToast(msg, timeout = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.position = 'fixed';
      container.style.right = '16px';
      container.style.bottom = '16px';
      container.style.zIndex = 10000;
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = '#111827';
    t.style.color = 'white';
    t.style.padding = '8px 12px';
    t.style.marginTop = '8px';
    t.style.borderRadius = '8px';
    t.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(()=> { try { t.remove(); } catch(e){} }, timeout);
  }

  // full icon set (use svgIcon(name, size))
  function svgIcon(name, size = 16) {
    const s = size;
    const icons = {
      mic: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 11v1a7 7 0 0 1-14 0v-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 21v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      micOff: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2l20 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 9v-3a3 3 0 0 1 5.6-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 11a3 3 0 0 1-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 11v1a7 7 0 0 1-4.7 6.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      cam: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M23 7l-6 4v2l6 4V7zM2 6h12v12H2z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      camOff: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 6h12v12H2z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M23 7l-6 4v2l6 4V7z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      kick: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 3h6v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3L3 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      ban: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" stroke="currentColor" stroke-width="1.6"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      trash: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18" stroke="currentColor" stroke-width="1.6"/><path d="M8 6V4h8v2" stroke="currentColor" stroke-width="1.6"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.6"/></svg>`,
      msg: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" stroke-width="1.6"/></svg>`,
      record: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="1.6" fill="currentColor"/></svg>`,
      recordOff: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="1.6" fill="currentColor"/><path d="M3 3l18 18" stroke="white" stroke-width="1.6"/></svg>`,
      chatOn: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" stroke-width="1.6"/></svg>`,
      chatOff: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" stroke-width="1.6"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.6"/></svg>`
    };
    return icons[name] || '';
  }

  // --- side panel & chat (we'll add record/chat toggle controls in top controls area) ---
  const sidePanel = document.createElement('div');
  sidePanel.style.width = '320px';
  sidePanel.style.minWidth = '260px';
  sidePanel.id = 'zoom-side';
  sidePanel.innerHTML = `
    <div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong>Participants</strong>
          <div id="participants-count" class="muted" style="font-size:12px;margin-top:2px">Total: 0</div>
        </div>
        <button id="leave-meeting" class="btn btn--outline">Leave</button>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <input id="participants-search" placeholder="Search participants..." style="flex:1;padding:6px;border:1px solid #e5e7eb;border-radius:6px" />
        <button id="btn-refresh-participants" title="Refresh" class="btn btn--outline">⟳</button>
      </div>
      <div id="participants-list" style="margin-top:8px;max-height:360px;overflow:auto"></div>
    </div>

    <div class="card">
      <strong>Chat</strong>
      <div id="chat-list" style="max-height:240px;overflow:auto;margin-top:8px"></div>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <select id="chat-target" style="flex:0 0 160px"><option value="">Everyone</option></select>
        <input id="chat-input" placeholder="Message..." style="flex:1;padding:6px;border:1px solid #e5e7eb;border-radius:6px" />
        <button id="chat-send" class="btn">Send</button>
      </div>
    </div>
  `;
  videosWrap.parentNode.appendChild(sidePanel);

  // status + control-row (we'll add record + chat toggle button here)
  const status = document.createElement('div'); status.style.margin = '8px 0';
  const ctrlRow = document.createElement('div');
  ctrlRow.style.display = 'flex';
  ctrlRow.style.gap = '8px';
  ctrlRow.style.marginBottom = '8px';
  videosWrap.parentNode.insertBefore(status, videosWrap);
  videosWrap.parentNode.insertBefore(ctrlRow, videosWrap);

  // meetingId
  const params = new URLSearchParams(window.location.search);
  let meetingId = params.get('meeting') || null;
  if (!meetingId) {
    meetingId = prompt('Enter meeting id to join') || null;
    if (!meetingId) { status.textContent = 'No meeting id'; return; }
    history.replaceState(null, '', '?meeting=' + encodeURIComponent(meetingId));
  }

  const curUser = await getCurrentUser().catch(()=>null);
  if (!curUser) { showToast('Please login'); navigate('login'); return; }

  // can-join
  try { await apiFetch('/zoom/' + encodeURIComponent(meetingId) + '/can-join'); }
  catch (err) { status.textContent = 'You are not allowed to join this meeting.'; return; }

  status.textContent = 'Initializing media...';
  const token = localStorage.getItem('auth_token');
  const socketUrl = (typeof SERVER_BASE === 'string' && SERVER_BASE) ? SERVER_BASE : (location.origin);
  const socket = io(socketUrl, { transports: ['websocket'], auth: { token }, reconnectionAttempts: 5 });

  socket.on('connect', () => {
    status.textContent = 'Connected -- joining meeting...';
    socket.emit('zoom:join', { meetingId, user: { _id: curUser._id, fullname: curUser.fullname, role: curUser.role } });
  });
  socket.on('connect_error', (err) => { console.warn('[client] connect_error', err); status.textContent = 'Connection failed'; showToast('Connection failed'); });
  socket.on('disconnect', (reason) => { console.log('[client] disconnect', reason); status.textContent = 'Disconnected: ' + reason; showToast('Disconnected: ' + reason); });

  // UI nodes
  const participantsList = document.getElementById('participants-list');
  const participantsCount = document.getElementById('participants-count');
  const participantsSearch = document.getElementById('participants-search');
  const btnRefreshParticipants = document.getElementById('btn-refresh-participants');
  const chatList = document.getElementById('chat-list');
  const chatTarget = document.getElementById('chat-target');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');

  let lastParticipants = [];
  let lastOwnerId = null;
  let chatEnabled = true;
  let recordingState = false;
  let currentHostId = null;

  // Recording client state
  let mediaRecorder = null;
  let recordingStream = null;
  let recordedChunks = [];

  // Add host-only buttons to ctrlRow: Record and Chat toggle (we will show/hide based on host/creator status)
  const recordBtn = document.createElement('button');
  recordBtn.className = 'btn';
  recordBtn.style.display = 'none';
  recordBtn.innerHTML = svgIcon('record', 14) + ' Record';
  ctrlRow.appendChild(recordBtn);

  const chatToggleBtn = document.createElement('button');
  chatToggleBtn.className = 'btn btn--outline';
  chatToggleBtn.style.display = 'none';
  chatToggleBtn.innerHTML = svgIcon('chatOn', 14) + ' Chat On';
  ctrlRow.appendChild(chatToggleBtn);

  // helper to mark host-only controls visible
  function showHostControls(isHostOrCreator) {
    recordBtn.style.display = isHostOrCreator ? '' : 'none';
    chatToggleBtn.style.display = isHostOrCreator ? '' : 'none';
    btnMuteAll.style.display = isHostOrCreator ? '' : 'none';
  }

  function initials(name) {
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
  }

  // message DOM helper (returns element)
  function createMessageElement(msg, isCreator) {
    const el = document.createElement('div');
    el.dataset.msgId = msg.id || '';
    el.style.padding = '6px';
    el.style.borderBottom = '1px solid #f1f5f9';
    const who = msg.user ? (msg.user.fullname || msg.user._id || 'Guest') : (msg.from || 'System');
    const ts = new Date(msg.ts || Date.now()).toLocaleTimeString();
    const left = document.createElement('div');
    left.innerHTML = `<div style="font-weight:600">${escapeHtml(who)} <span class="muted" style="font-weight:400;font-size:12px"> ${ts}</span></div>
                      <div style="margin-top:4px">${escapeHtml(msg.text)}</div>`;
    el.appendChild(left);

    if (isCreator) {
      const del = document.createElement('button');
      del.className = 'btn btn--outline btn-delete-msg';
      del.title = 'Delete message';
      del.style.marginLeft = '8px';
      del.innerHTML = svgIcon('trash', 14);
      del.addEventListener('click', () => {
        if (!msg.id) return;
        if (!confirm('Delete this message?')) return;
        socket.emit('zoom:delete-message', { meetingId, messageId: msg.id });
      });
      el.appendChild(del);
      // layout tweak: show delete at right
      el.style.display = 'flex';
      el.style.justifyContent = 'space-between';
      el.style.alignItems = 'center';
      left.style.flex = '1';
    }
    return el;
  }

  function addChatMessage(msg, isCreator = false) {
    const el = createMessageElement(msg, isCreator);
    chatList.appendChild(el);
    chatList.scrollTop = chatList.scrollHeight;
  }

  // local media
  let localStream = null;
  const localPreview = document.createElement('video');
  localPreview.autoplay = true; localPreview.muted = true; localPreview.playsInline = true;
  localPreview.style.width = '200px'; localPreview.style.height = '140px'; localPreview.style.borderRadius = '8px';
  videosWrap.appendChild(localPreview);

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:{ width: { ideal: 640 } } });
    localPreview.srcObject = localStream;
  } catch (err) {
    console.warn('getUserMedia failed', err);
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio:true }); localPreview.srcObject = localStream; } catch (e) { localStream = null; }
  }

  // participants rendering helper
  function renderParticipantsList() {
    const query = (participantsSearch.value || '').toLowerCase();
    const ownerId = lastOwnerId;
    const isCreator = ownerId && String(ownerId) === String(curUser._id);
    const amIHost = socket.id === currentHostId;
    const isHostOrCreator = amIHost || isCreator;

    showHostControls(isHostOrCreator);

    participantsList.innerHTML = '';
    chatTarget.innerHTML = '<option value="">Everyone</option>';

    lastParticipants.forEach(p => {
      const display = (p.user && (p.user.fullname || p.user._id)) || p.userKey;
      if (query && !String(display).toLowerCase().includes(query)) return;

      const meMarker = p.userId && String(p.userId) === String(curUser._id) ? ' (You)' : '';
      const avatar = initials(display || 'Guest');

      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.padding = '6px 0';

      // left
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.gap = '8px';
      left.style.alignItems = 'center';
      left.innerHTML = `
        <div style="width:36px;height:36px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#e2e8f0;font-weight:600">${escapeHtml(avatar)}</div>
      `;
      const txt = document.createElement('div');
      txt.innerHTML = `<div style="font-weight:600">${escapeHtml(display)}${meMarker} ${p.primarySocket === currentHostId ? '🔷' : ''}</div>
            <div class="muted" style="font-size:12px">${p.sockets.length} connection(s) • ${p.audioOn ? '🔊' : '🔇'} • ${p.videoOn ? '📷' : '🚫'}</div>`;
      left.appendChild(txt);

      // right (buttons)
      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.gap = '6px';
      right.style.alignItems = 'center';

      // message button
      const msgBtn = document.createElement('button');
      msgBtn.className = 'btn btn--outline btn-msg';
      msgBtn.title = 'Direct message';
      msgBtn.innerHTML = svgIcon('msg', 14);
      msgBtn.dataset.user = p.userKey;
      msgBtn.addEventListener('click', () => {
        chatTarget.value = p.userKey;
        chatInput.focus();
      });
      right.appendChild(msgBtn);

      // creator/host-only controls
      if ((isCreator || amIHost) && p.userKey) {
        // mute/unmute (icon)
        const muteBtn = document.createElement('button');
        muteBtn.className = 'btn btn--outline';
        muteBtn.title = p.audioOn ? 'Mute user' : 'Unmute user';
        muteBtn.innerHTML = p.audioOn ? svgIcon('micOff', 14) : svgIcon('mic', 14);
        muteBtn.addEventListener('click', () => {
          const cmd = p.audioOn ? 'mute-user' : 'unmute-user';
          socket.emit('zoom:host-command', { meetingId, cmd, target: p.userKey });
        });
        right.appendChild(muteBtn);

        // camera toggle
        const camBtn = document.createElement('button');
        camBtn.className = 'btn btn--outline';
        camBtn.title = p.videoOn ? 'Disable camera' : 'Enable camera';
        camBtn.innerHTML = p.videoOn ? svgIcon('camOff', 14) : svgIcon('cam', 14);
        camBtn.addEventListener('click', () => {
          const cmd = p.videoOn ? 'disable-camera-user' : 'enable-camera-user';
          socket.emit('zoom:host-command', { meetingId, cmd, target: p.userKey });
        });
        right.appendChild(camBtn);

        // kick
        const kickBtn = document.createElement('button');
        kickBtn.className = 'btn btn--outline';
        kickBtn.title = 'Kick user';
        kickBtn.innerHTML = svgIcon('kick', 14);
        kickBtn.addEventListener('click', () => {
          if (!confirm('Kick this participant?')) return;
          socket.emit('zoom:host-command', { meetingId, cmd: 'kick', target: p.userKey });
        });
        right.appendChild(kickBtn);

        // ban/unban toggle (we only show ban button, server handles adding to st.banned)
        const banBtn = document.createElement('button');
        banBtn.className = 'btn btn--outline';
        banBtn.title = 'Ban user';
        banBtn.innerHTML = svgIcon('ban', 14);
        banBtn.addEventListener('click', () => {
          if (!confirm('Ban this user? They will be removed and cannot rejoin.')) return;
          socket.emit('zoom:host-command', { meetingId, cmd: 'ban-user', target: p.userKey });
        });
        right.appendChild(banBtn);
      }

      item.appendChild(left);
      item.appendChild(right);
      participantsList.appendChild(item);

      // add to chat target dropdown
      const opt = document.createElement('option');
      opt.value = p.userKey;
      opt.text = display;
      chatTarget.appendChild(opt);
    });
  }

  socket.on('zoom:participants', ({ participants = [], total = 0, host, ownerId, chatEnabled: serverChatEnabled, recording }) => {
    lastParticipants = participants.slice();
    lastOwnerId = ownerId || null;
    participantsCount.textContent = `Total: ${total}`;
    currentHostId = host;
    chatEnabled = typeof serverChatEnabled === 'boolean' ? serverChatEnabled : true;
    recordingState = !!recording;
    // update chat toggle icon
    chatToggleBtn.innerHTML = (chatEnabled ? svgIcon('chatOn', 14) + ' Chat On' : svgIcon('chatOff', 14) + ' Chat Off');
    // update record button label/indicator
    recordBtn.innerHTML = (recordingState ? svgIcon('recordOff', 14) + ' Stop Recording' : svgIcon('record', 14) + ' Record');
    // show mute-all if I'm host or creator
    const amICreator = lastOwnerId && String(lastOwnerId) === String(curUser._id);
    const amIHost = socket.id === currentHostId;
    btnMuteAll.style.display = (amICreator || amIHost) ? '' : 'none';
    renderParticipantsList();
  });

  btnRefreshParticipants.addEventListener('click', () => { socket.emit('noop'); renderParticipantsList(); });
  participantsSearch.addEventListener('input', () => renderParticipantsList());

  socket.on('zoom:host-assigned', ({ hostId }) => {
    if (socket.id === hostId) showHostControls(true);
    status.textContent = 'Joined meeting';
  });

  // record start/stop notifications from server (update UI)
  socket.on('zoom:recording', ({ recording, by }) => {
    recordingState = !!recording;
    recordBtn.innerHTML = (recordingState ? svgIcon('recordOff', 14) + ' Stop Recording' : svgIcon('record', 14) + ' Record');
    showToast(recording ? `Recording started by ${by || 'host'}` : `Recording stopped by ${by || 'host'}`);
  });

  // chat toggled event
  socket.on('zoom:chat-toggled', ({ enabled }) => {
    chatEnabled = !!enabled;
    chatToggleBtn.innerHTML = (chatEnabled ? svgIcon('chatOn', 14) + ' Chat On' : svgIcon('chatOff', 14) + ' Chat Off');
    showToast(chatEnabled ? 'Chat enabled' : 'Chat disabled by host');
  });

  // chat history + incoming chat
  socket.on('zoom:chat-history', ({ messages = [] }) => {
    try {
      const amICreator = lastOwnerId && String(lastOwnerId) === String(curUser._id);
      messages.forEach(m => addChatMessage(m, amICreator));
    } catch (e) { console.warn('chat-history render error', e); }
  });
  socket.on('zoom:chat', (msg) => {
    const amICreator = lastOwnerId && String(lastOwnerId) === String(curUser._id);
    addChatMessage(msg, amICreator);
  });

  socket.on('zoom:message-deleted', ({ id }) => {
    try {
      const el = chatList.querySelector(`[data-msg-id="${id}"]`);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (e) { console.warn('remove message elem error', e); }
  });

  // WebRTC plumbing
  const pcs = new Map();
  const remoteVideos = new Map();

  socket.on('zoom:peer-join', async ({ id, user }) => {
    if (pcs.has(id)) return;
    const pc = createPC(id);
    pcs.set(id, pc);
    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('zoom:signal', { to: id, data: { type: 'offer', sdp: pc.localDescription } });
    } catch (e) { console.error('offer error', e); }
  });

  socket.on('zoom:signal', async ({ from, data }) => {
    let pc = pcs.get(from);
    if (!pc) {
      pc = createPC(from);
      pcs.set(from, pc);
      if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }
    if (data.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('zoom:signal', { to: from, data: { type: 'answer', sdp: pc.localDescription } });
    } else if (data.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === 'ice') {
      try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e){ console.warn(e); }
    }
  });

  socket.on('zoom:peer-left', ({ id }) => cleanupPeer(id));

  socket.on('zoom:host-action', ({ cmd, reason }) => {
    if (cmd === 'mute') { if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = false); showToast('You were muted by host'); }
    else if (cmd === 'unmute') { if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = true); showToast('You were unmuted by host'); }
    else if (cmd === 'disable-camera') { if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = false); showToast('Your camera was disabled by host'); }
    else if (cmd === 'enable-camera') { if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = true); showToast('Your camera was enabled by host'); }
    else if (cmd === 'kick') { showToast('You were removed from meeting' + (reason ? ': ' + reason : '')); cleanupAll(); navigate('meetings'); }
  });

  socket.on('zoom:meeting-deleted', ({ meetingId: mid }) => {
    if (mid === meetingId) { showToast('Meeting has been deleted by owner.'); cleanupAll(); navigate('meetings'); }
  });

  function createPC(peerId) {
    const pc = new RTCPeerConnection({ iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ] });
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('zoom:signal', { to: peerId, data: { type:'ice', candidate: e.candidate } }); };
    pc.ontrack = (e) => {
      let v = remoteVideos.get(peerId);
      if (!v) {
        v = document.createElement('video');
        v.autoplay = true; v.playsInline = true;
        v.style.width = '200px'; v.style.height = '140px'; v.style.borderRadius = '8px';
        videosWrap.appendChild(v);
        remoteVideos.set(peerId, v);
      }
      const [stream] = e.streams;
      if (stream) v.srcObject = stream;
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') cleanupPeer(peerId); };
    return pc;
  }

  function cleanupPeer(id) {
    const pc = pcs.get(id);
    if (pc) { try{ pc.close(); }catch(e){} pcs.delete(id); }
    const v = remoteVideos.get(id);
    if (v && v.parentNode) v.parentNode.removeChild(v);
    remoteVideos.delete(id);
  }

  // controls
  btnAudio.addEventListener('click', ()=> {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    const newState = !track.enabled;
    localStream.getAudioTracks().forEach(t => t.enabled = newState);
    socket.emit('zoom:status', { audioOn: newState });
  });

  btnVideo.addEventListener('click', ()=> {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    const newState = !track.enabled;
    track.enabled = newState;
    socket.emit('zoom:status', { videoOn: newState });
  });

  btnShare.addEventListener('click', async () => {
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({ video:true });
      const sTrack = ds.getVideoTracks()[0];
      pcs.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(sTrack);
      });
      localPreview.srcObject = ds;
      sTrack.onended = async () => {
        if (localStream) localPreview.srcObject = localStream;
        try {
          const cam = await navigator.mediaDevices.getUserMedia({ video:true }).catch(()=>null);
          if (cam && cam.getVideoTracks()[0]) {
            const camTrack = cam.getVideoTracks()[0];
            pcs.forEach(pc => {
              const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
              if (sender) sender.replaceTrack(camTrack);
            });
            localPreview.srcObject = cam;
            const oldVideo = localStream && localStream.getVideoTracks()[0];
            if (oldVideo) { try { oldVideo.stop(); } catch(e){} }
            localStream = cam;
          }
        } catch(e){}
      };
    } catch (err) { console.error('share failed', err); showToast('Screen share failed'); }
  });

  btnMuteAll.style.display = 'none';
  btnMuteAll.addEventListener('click', () => {
    if (!confirm('Mute everyone?')) return;
    socket.emit('zoom:host-command', { meetingId, cmd: 'mute-everyone' });
  });

  // Record handling (host only)
  recordBtn.addEventListener('click', async () => {
    // check whether we are currently recording according to local state
    if (!recordingState) {
      // start recording: prompt for getDisplayMedia (screen) + audio
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (!s) { showToast('Screen capture failed'); return; }
        recordingStream = s;
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(s, { mimeType: 'video/webm; codecs=vp9' });
        mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) recordedChunks.push(e.data); };
        mediaRecorder.onstop = async () => {
          // build blob and present download link
          const blob = new Blob(recordedChunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `meeting-${meetingId}-${Date.now()}.webm`;
          a.textContent = 'Download recording';
          a.style.display = 'block';
          a.style.marginTop = '8px';
          showToast('Recording stopped — download link added below');
          // append link to sidePanel
          const card = document.createElement('div');
          card.className = 'card';
          card.style.marginTop = '8px';
          card.appendChild(a);
          const sp = document.getElementById('zoom-side');
          sp.appendChild(card);
        };
        mediaRecorder.start(250);
        // notify server so everybody sees recording started
        socket.emit('zoom:host-command', { meetingId, cmd: 'start-record' });
        recordingState = true;
        recordBtn.innerHTML = svgIcon('recordOff', 14) + ' Stop Recording';
        showToast('Recording started (screen capture).');
        // if host stops via browser UI (stop sharing), stop recorder too
        s.getVideoTracks()[0].onended = () => {
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            try { s.getTracks().forEach(t=>t.stop()); } catch(e){}
            socket.emit('zoom:host-command', { meetingId, cmd: 'stop-record' });
            recordingState = false;
            recordBtn.innerHTML = svgIcon('record', 14) + ' Record';
          }
        };
      } catch (e) {
        console.error('start recording failed', e);
        showToast('Recording failed: ' + (e && e.message || 'unknown'));
      }
    } else {
      // stop local recorder
      try {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        if (recordingStream) recordingStream.getTracks().forEach(t=>{ try{ t.stop(); }catch(e){} });
        socket.emit('zoom:host-command', { meetingId, cmd: 'stop-record' });
        recordingState = false;
        recordBtn.innerHTML = svgIcon('record', 14) + ' Record';
        showToast('Stopping recording...');
      } catch (e) { console.warn('stop recording error', e); }
    }
  });

  // Chat toggle (host only)
  chatToggleBtn.addEventListener('click', () => {
    const isNowEnabled = !chatEnabled;
    // send server command
    socket.emit('zoom:host-command', { meetingId, cmd: isNowEnabled ? 'enable-chat' : 'disable-chat' });
    // server will broadcast zoom:chat-toggled which updates UI
  });

  // chat send (respect chatEnabled)
  chatSend.addEventListener('click', () => {
    if (!chatEnabled) { showToast('Chat is disabled'); return; }
    const text = chatInput.value.trim();
    if (!text) return;
    const target = chatTarget.value || null;
    const isCreator = lastOwnerId && String(lastOwnerId) === String(curUser._id);
    addChatMessage({ id: null, user: { fullname: getUserFullname() || 'You' }, text, ts: Date.now() }, isCreator);
    socket.emit('zoom:chat', { to: target, text });
    chatInput.value = '';
  });

  document.getElementById('leave-meeting').addEventListener('click', async () => {
    if (!confirm('Leave meeting?')) return;
    try { socket.emit('zoom:leave'); } catch(e){}
    cleanupAll();
    navigate('meetings');
  });

  // cleanup and watchers
  const cleanupAll = () => {
    try { socket.disconnect(); } catch(e){}
    pcs.forEach(pc => { try{ pc.close(); }catch(e){} });
    pcs.clear();
    remoteVideos.forEach(v => { if (v && v.parentNode) v.parentNode.removeChild(v); });
    remoteVideos.clear();
    if (localStream) localStream.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
    if (recordingStream) recordingStream.getTracks().forEach(t=>{ try{ t.stop(); }catch(e){} });
    const sp = document.getElementById('zoom-side');
    if (sp && sp.parentNode) sp.parentNode.removeChild(sp);
    if (localPreview && localPreview.parentNode) localPreview.parentNode.removeChild(localPreview);
  };

  const observer = new MutationObserver(()=> {
    if (!document.body.contains(videosWrap)) { cleanupAll(); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('beforeunload', cleanupAll);
}



// ---------- STUDENTS (updated, frontend) ----------

/**
 * Helper: resize an image File/Blob client-side and return a File/Blob to upload.
 * - maxWidth, maxHeight: max pixel dimensions
 * - quality: 0..1 for JPEG compression
 */
async function resizeImageFile(file, maxWidth = 1024, maxHeight = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return resolve(file);
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        // calculate new size keeping aspect ratio
        const ratio = Math.min(1, maxWidth / width, maxHeight / height);
        const w = Math.round(width * ratio);
        const h = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) return resolve(file);
          // create File object so backend still sees filename property optionally
          const newFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(newFile);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/** Small helper: show image preview into a container element */
function renderImagePreview(inputEl, previewContainer) {
  if (!inputEl || !previewContainer) return;
  previewContainer.innerHTML = '';
  const f = inputEl.files && inputEl.files[0];
  if (!f) {
    previewContainer.innerHTML = '<div style="color:#94a3b8;padding:8px">No photo</div>';
    return;
  }
  const url = URL.createObjectURL(f);
  const img = document.createElement('img');
  img.src = url;
  img.style.width = '80px';
  img.style.height = '80px';
  img.style.objectFit = 'cover';
  img.style.borderRadius = '8px';
  previewContainer.appendChild(img);

}
// safe tel link generator (escapes display text)
function telLink(phone) {
  if (!phone) return '';
  const sanitized = String(phone).replace(/[^0-9+]/g, '');
  const display = escapeHtml(String(phone));
  return `<a href="tel:${encodeURIComponent(sanitized)}" style="color:inherit;text-decoration:underline">${display}</a>`;
}

// small modal for changing password (frontend only). 
// This expects a backend endpoint to exist at POST /users/change-password
// body: { currentPassword, newPassword } and that it checks auth.
function openChangePasswordModal(userId) {
  const node = document.createElement('div');
  node.innerHTML = `
    <h3>Change Password</h3>
    <label>Current password</label><input id="cp-current" type="password" style="width:100%"/><br/>
    <label>New password</label><input id="cp-new" type="password" style="width:100%"/><br/>
    <label>Confirm new password</label><input id="cp-new2" type="password" style="width:100%"/><br/>
    <div style="margin-top:10px;text-align:right">
      <button id="cp-save" class="btn">Save</button>
      <button id="cp-cancel" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
    </div>
  `;
  showModal(node);

  document.getElementById('cp-cancel').addEventListener('click', closeModal);
  document.getElementById('cp-save').addEventListener('click', async () => {
    const current = document.getElementById('cp-current').value || '';
    const np = document.getElementById('cp-new').value || '';
    const np2 = document.getElementById('cp-new2').value || '';

    if (!np || np.length < 6) { showToast('New password must be at least 6 characters', 'error'); return; }
    if (np !== np2) { showToast('Passwords do not match', 'error'); return; }

    try {
      await apiFetch('/users/change-password', { method: 'POST', body: { currentPassword: current, newPassword: np } });
      showToast('Password changed', 'success');
      closeModal();
    } catch (err) {
      console.error('Change password error', err);
      showToast('Failed to change password: ' + (err.message || 'server error'), 'error');
    }
  });
}



// ---------- Toast helper (frontend) ----------
(function initToast() {
  if (document.getElementById('app-toast')) return;
  const t = document.createElement('div');
  t.id = 'app-toast';
  t.style.position = 'fixed';
  t.style.right = '18px';
  t.style.bottom = '18px';
  t.style.zIndex = 99999;
  t.style.pointerEvents = 'none';
  document.body.appendChild(t);
})();

function showToast(msg, type = 'success', timeout = 3500) {
  // type: 'success' | 'error' | 'info'
  const toastWrap = document.getElementById('app-toast');
  if (!toastWrap) return;
  const item = document.createElement('div');
  item.style.pointerEvents = 'auto';
  item.style.minWidth = '200px';
  item.style.marginTop = '8px';
  item.style.padding = '10px 12px';
  item.style.borderRadius = '8px';
  item.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
  item.style.color = '#fff';
  item.style.fontSize = '13px';
  item.style.display = 'flex';
  item.style.alignItems = 'center';
  item.style.gap = '8px';
  if (type === 'error') {
    item.style.background = '#ef4444';
  } else if (type === 'info') {
    item.style.background = '#3b82f6';
  } else {
    item.style.background = '#10b981';
  }
  item.innerText = msg;
  toastWrap.appendChild(item);

  const hide = () => {
    try { item.style.opacity = '0'; setTimeout(()=> item.remove(), 250); } catch(e){}
  };
  setTimeout(hide, timeout);
}


// Call the backend to reset a student's password and show the returned temp password once.
async function resetStudentPassword(studentId, opts = {}) {
  // opts.length can override temp password length (optional)
  if (!studentId) return showToast('Missing student id', 'error');

  if (!confirm('Reset this student password? A temporary password will be generated and shown once.')) return;

  try {
    // call API - use apiFetch so auth header / error handling is consistent
    const body = {};
    if (opts.length) body.length = opts.length;
    const res = await apiFetch(`/students/${studentId}/reset-password`, { method: 'POST', body });

    // backend returns { ok: true, tempPassword: '...' }
    if (!res || !res.tempPassword) {
      showToast('No temporary password returned', 'error');
      return;
    }

    const temp = res.tempPassword;

    // Build the modal content (show the temp password and offer copy button)
    const node = document.createElement('div');
    node.innerHTML = `
      <h3>Temporary password (show once)</h3>
      <div style="display:flex;gap:12px;align-items:center">
        <div style="flex:1">
          <div style="background:#111827;color:#fff;padding:12px;border-radius:8px;font-family:monospace;font-size:16px;word-break:break-all" id="tmp-pass-txt">${escapeHtml(temp)}</div>
          <div style="margin-top:8px;color:#6b7280;font-size:13px">This password is shown only once. Copy it now and give it to the student/parent securely.</div>
        </div>
      </div>
      <div style="margin-top:12px;text-align:right">
        <button id="copy-temp-pass" class="btn" style="background:#3b82f6;color:#fff;margin-right:8px">Copy</button>
        <button id="close-temp-pass" class="btn" style="background:#10b981;color:#fff">OK</button>
      </div>
    `;
    showModal(node);

    // attach handlers
    setTimeout(() => {
      document.getElementById('copy-temp-pass')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(temp);
          showToast('Copied to clipboard', 'success');
        } catch (e) {
          // fallback: select text so user can copy manually
          const el = document.getElementById('tmp-pass-txt');
          if (el) {
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            showToast('Unable to copy automatically — text selected for manual copy', 'info');
          }
        }
      });

      document.getElementById('close-temp-pass')?.addEventListener('click', () => {
        closeModal();
        showToast('Temporary password displayed once', 'info');
      });
    }, 0);

  } catch (err) {
    console.error('resetStudentPassword error (do not log temp in production):', err);
    showToast('Failed to reset password: ' + (err.message || 'server error'), 'error');
  }
}

/** Students UI */
/** Students UI: renderStudents with safe socket probe */
async function renderStudents() {
  const role = getUserRole();
  if (role === 'student') {
    await renderStudentSelf();
    return;
  }
  if (!['admin','manager','teacher'].includes(role)) {
    app.innerHTML = '<div class="page"><h2>Access denied</h2><p>You do not have permission to view Students.</p></div>';
    return;
  }

  app.innerHTML = '';
  const node = tpl('students');
  app.appendChild(node);

  document.getElementById('add-student-btn')?.addEventListener('click', () => openAddStudentModal());
  document.getElementById('student-search')?.addEventListener('input', debounce(loadStudents, 300));
  await loadStudents();

  // Safe socket guard with probe: only init socket if backend socket endpoint exists.
  try {
    if (typeof window !== 'undefined' && typeof window.io === 'function' && !window._studentsSocketBound) {
      // quick probe to /socket.io - short timeout so it doesn't hang/throw errors
      const probeUrl = `${window.location.origin}/socket.io/?EIO=4&transport=polling&t=${Date.now()}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200); // 1.2s timeout

      let ok = false;
      try {
        const resp = await fetch(probeUrl, { method: 'GET', signal: controller.signal, credentials: 'same-origin' });
        ok = resp && resp.status >= 200 && resp.status < 300;
      } catch (probeErr) {
        // network error or 404 — do not init socket
        ok = false;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!ok) {
        console.info('Socket.io endpoint not available on this host; skipping socket setup.');
        return;
      }

      // endpoint exists -> init socket
      try {
        window._studentsSocketBound = true;
        const socket = io({ transports: ['websocket','polling'] }); // use defaults; you might pass path if custom
        const onMoved = async (data) => {
          try {
            console.log('students:moved event', data);
            await loadStudents();
            await loadClasses();
          } catch (e) {
            console.warn('Error handling students:moved', e);
          }
        };
        socket.on('students:moved', onMoved);

        // cleanup to avoid duplicate listeners on hot reloads
        window.addEventListener('beforeunload', () => {
          try { socket.off('students:moved', onMoved); socket.close(); } catch (e) {}
        });
      } catch (initErr) {
        console.warn('Socket initialization failed', initErr && initErr.message);
      }
    }
  } catch (e) {
    // don't allow socket issues to break the UI
    console.warn('Socket guard error', e && e.message);
  }

}
/** Modal: show student details (clicking a student card opens this) */
function openStudentDetailModal(student) {
  if (!student) return;
  const node = document.createElement('div');
  const photo = student.photoUrl ? (student.photoUrl.startsWith('http') ? student.photoUrl : SERVER_BASE + student.photoUrl) : '';
  const phoneHtml = student.phone ? telLink(student.phone) : '<span class="muted">—</span>';
  const parentPhoneHtml = student.parentPhone ? telLink(student.parentPhone) : '<span class="muted">—</span>';
  const canReset = ['admin','manager'].includes(getUserRole());

  node.innerHTML = `
    <h3>${escapeHtml(student.fullname)}</h3>
    <div style="display:flex;gap:12px;align-items:center">
      <div style="width:100px;height:100px;border-radius:8px;overflow:hidden;background:#f3f4f6">
        ${photo ? `<img src="${encodeURI(photo)}" style="width:100%;height:100%;object-fit:cover"/>` : `<div style="padding:12px;color:#94a3b8">No photo</div>`}
      </div>
      <div style="flex:1">
        <div><strong>ID:</strong> ${escapeHtml(student.numberId || '')}</div>
        <div style="margin-top:6px"><strong>Phone:</strong> ${phoneHtml}</div>
        <div style="margin-top:6px"><strong>Parent:</strong> ${escapeHtml(student.parentName || '')} • ${parentPhoneHtml}</div>
        <div style="margin-top:6px"><strong>Class:</strong> ${escapeHtml((student.classId && student.classId.name) || '')}</div>
        <div style="margin-top:6px"><strong>Fee:</strong> ${student.fee || 0} • <strong>Status:</strong> ${escapeHtml(student.status || 'unpaid')}</div>
      </div>
    </div>

    <div style="margin-top:12px;text-align:right">
      ${canReset ? '<button id="reset-stud-pass-detail" class="btn" style="background:#f59e0b;color:#fff;margin-right:8px">Reset password</button>' : ''}
      <button id="close-stud-detail" class="btn" style="background:#ccc;color:#000">Close</button>
    </div>

    <div id="reset-detail-note" style="margin-top:8px;color:#064e3b;display:none"></div>
  `;
  showModal(node);
  document.getElementById('close-stud-detail')?.addEventListener('click', closeModal);

  if (canReset) {
    document.getElementById('reset-stud-pass-detail')?.addEventListener('click', async () => {
      if (!confirm('Generate a temporary password for this student? The new password will be shown once and copied to your clipboard.')) return;
      try {
        const res = await apiFetch('/students/' + student._id + '/reset-password', { method: 'POST', body: {} });
        if (!res || !res.tempPassword) { showToast('Password reset succeeded but no password returned','info'); return; }
        const temp = res.tempPassword;
        const note = document.getElementById('reset-detail-note');
        if (note) { note.style.display = 'block'; note.innerHTML = `Temporary password: <strong>${escapeHtml(temp)}</strong> — copied to clipboard.`; }
        try { await navigator.clipboard.writeText(temp); } catch(e){}
        showToast('Temporary password generated and copied', 'info', 7000);
      } catch (e) {
        console.error('Reset password detail error', e);
        showToast('Failed to reset password', 'error');
      }
    });
  }
}

/* ---------- Add / Edit Student modal: improved layout and image resizing ---------- */

function openAddStudentModal() {
  const form = document.createElement('div');
  form.style.maxWidth = '760px';
  form.innerHTML = `
    <h3>Add Student</h3>
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="flex:1">
        <label>Full name</label><input id="s-fullname" placeholder="Full name" style="width:100%"/><br/>
        <label>Number ID (leave empty for auto)</label><input id="s-numberId" placeholder="Number ID" style="width:100%"/><br/>
        <label>Class</label><select id="s-classId" style="width:100%"><option>Loading classes...</option></select><br/>
        <label>Student phone</label><input id="s-phone" placeholder="phone" style="width:100%"/><br/>
        <label>Parent name</label><input id="s-parentName" placeholder="Parent name" style="width:100%"/><br/>
        <label>Parent phone</label><input id="s-parentPhone" placeholder="Parent phone" style="width:100%"/><br/>
        <label>Fee (number)</label><input id="s-fee" type="number" placeholder="0" style="width:100%"/><br/>
        <label>Password</label><input id="s-password" placeholder="Password" style="width:100%"/><br/>
      </div>
      <div style="width:220px;min-width:220px">
        <div style="margin-bottom:6px"><strong>Photo</strong></div>
        <div id="s-photo-preview" style="width:100%;height:120px;border-radius:8px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center"></div>
        <input id="s-photo" type="file" accept="image/*" style="margin-top:8px" /><br/>
        <div style="margin-top:10px;color:#6b7280;font-size:12px">Max size will be reduced for upload.</div>
      </div>
    </div>

    <div style="margin-top:12px;text-align:right">
      <button id="save-student" class="btn">Save</button>
      <button id="cancel-student" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
    </div>
  `;
  showModal(form);

  // class list
  (async ()=>{
    try{
      const cls = await apiFetch('/classes');
      const sel = document.getElementById('s-classId');
      sel.innerHTML = '<option value="">-- Select class --</option>';
      (cls.items || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c._id;
        opt.textContent = c.name + ' (' + (c.classId||'') + ')';
        sel.appendChild(opt);
      });
    }catch(e){
      console.warn('Could not load classes list', e);
      const sel = document.getElementById('s-classId');
      if(sel) sel.innerHTML = '<option value="">(could not load classes)</option>';
    }
  })();

  const photoInput = document.getElementById('s-photo');
  const preview = document.getElementById('s-photo-preview');
  photoInput.addEventListener('change', ()=> renderImagePreview(photoInput, preview));

  document.getElementById('cancel-student')?.addEventListener('click', closeModal);
  document.getElementById('save-student')?.addEventListener('click', async () => {
    const fullname = document.getElementById('s-fullname').value.trim();
    const numberId = document.getElementById('s-numberId').value.trim();
    const classId = document.getElementById('s-classId').value;
    const phone = document.getElementById('s-phone').value.trim();
    const parentName = document.getElementById('s-parentName').value.trim();
    const parentPhone = document.getElementById('s-parentPhone').value.trim();
    const fee = document.getElementById('s-fee').value;
    const password = document.getElementById('s-password').value;

    if (!fullname) { alert('Full name required'); return; }

    try {
      const photoEl = document.getElementById('s-photo');
      if (photoEl && photoEl.files && photoEl.files.length > 0) {
        // resize file before upload
        const resized = await resizeImageFile(photoEl.files[0], 1024, 1024, 0.8);
        const fd = new FormData();
        fd.append('fullname', fullname);
        if(numberId) fd.append('numberId', numberId);
        if(classId) fd.append('classId', classId);
        if(phone) fd.append('phone', phone);
        if(parentName) fd.append('parentName', parentName);
        if(parentPhone) fd.append('parentPhone', parentPhone);
        if(fee) fd.append('fee', fee);
        if(password) fd.append('password', password);
        fd.append('photo', resized, resized.name || 'photo.jpg');

        const res = await apiUpload('/students', fd);
        alert('Student saved (with photo)');
      } else {
        const payload = { fullname, numberId, classId, phone, parentName, parentPhone, fee: fee || 0, password };
        await apiFetch('/students', { method: 'POST', body: payload });
        alert('Student saved');
      }
      closeModal();
      await loadStudents();
    } catch (err) {
      console.error('Save student error', err);
      alert('Failed to save student: ' + (err.message || 'server error'));
    }
  });
}

async function renderStudentSelf(){
  app.innerHTML = '';
  const node = document.createElement('div');
  node.className = 'page';
  node.innerHTML = `<h2>My Profile</h2><div id="my-student-card">Loading...</div><h3>Exams</h3><div id="my-exams">Loading...</div><h3>Votes</h3><div id="my-votes">Loading...</div>`;
  app.appendChild(node);

  try {
    const res = await apiFetch('/students?search=');
    const s = (res.items && res.items[0]) || null;
    const card = document.getElementById('my-student-card');
    if (!s) {
      card.innerHTML = '<p>Student record not found.</p>';
      return;
    }

    const photoSrc = s.photoUrl ? (s.photoUrl.startsWith('http') ? s.photoUrl : SERVER_BASE + s.photoUrl) : '';
    const phoneHtml = s.phone ? telLink(s.phone) : '';
    const className = escapeHtml((s.classId && s.classId.name) || '');

    card.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <div style="width:100px;height:100px;border-radius:8px;overflow:hidden;background:#f3f4f6">
          ${photoSrc ? `<img src="${encodeURI(photoSrc)}" style="width:100%;height:100%;object-fit:cover"/>` : `<div style="padding:12px;color:#94a3b8">No photo</div>`}
        </div>
        <div>
          <strong>${escapeHtml(s.fullname)}</strong><div style="color:#6b7280">${escapeHtml(s.numberId || '')}</div>
          <div>Phone: ${phoneHtml}</div>
          <div>Class: ${className} • Fee: ${s.fee || 0} • Status: ${escapeHtml(s.status || '')}</div>
          ${(getUserRole() === 'student') ? `<div style="margin-top:8px"><button id="change-password-btn" class="btn">Change password</button></div>` : ''}
        </div>
      </div>`;

    // attach password change handler for the student user (safe attach)
    if (getUserRole() === 'student') {
      // small timeout to ensure element is in DOM
      setTimeout(() => {
        const btn = document.getElementById('change-password-btn');
        if (btn) {
          btn.addEventListener('click', () => openChangePasswordModal(s._id));
        }
      }, 0);
    }

    // load other parts
    loadStudentExamsAndVotes();
  } catch (err) {
    console.error('renderStudentSelf error', err);
    const card = document.getElementById('my-student-card');
    if (card) card.innerHTML = '<p>Failed to load profile.</p>';
  }
}


async function loadStudentExamsAndVotes(){
  const examsDiv = document.getElementById('my-exams');
  const votesDiv = document.getElementById('my-votes');
  if (!examsDiv || !votesDiv) return;
  examsDiv.innerHTML = 'Loading...';
  votesDiv.innerHTML = 'Loading...';
  try {
    const exRes = await apiFetch('/exams');
    const vRes = await apiFetch('/votes');
    const exams = exRes.items || exRes || [];
    const votes = vRes.items || vRes || [];

    if (!exams || exams.length === 0) examsDiv.innerHTML = '<p>No exams found.</p>';
    else {
      examsDiv.innerHTML = '';
      exams.forEach(ex => {
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `<strong>${escapeHtml(ex.title || ex.name || '')}</strong><div>${escapeHtml(ex.note || ex.description || '')}</div>
                        <div>Marks: ${escapeHtml((ex.marks || '').toString())} ${ex.paperImage ? `<a target="_blank" href="${SERVER_BASE + '/uploads/' + ex.paperImage}">Paper</a>` : ''}</div>`;
        examsDiv.appendChild(el);
      });
    }

    if (!votes || votes.length === 0) votesDiv.innerHTML = '<p>No votes/polls</p>';
    else {
      votesDiv.innerHTML = '';
      votes.forEach(v => {
        const el = document.createElement('div');
        el.className = 'card';
        const candHtml = (v.candidates || []).map((c, i) => `<div>${i+1}. ${escapeHtml(c.name)} — ${c.votes || 0} votes</div>`).join('');
        el.innerHTML = `<strong>${escapeHtml(v.title)}</strong><div>${escapeHtml(v.description||'')}</div><div>${candHtml}</div>`;
        votesDiv.appendChild(el);
      });
    }

  } catch (err) {
    console.error('loadStudentExamsAndVotes', err);
    examsDiv.innerHTML = '<p>Failed to load exams.</p>';
    votesDiv.innerHTML = '<p>Failed to load votes.</p>';
  }
}

/* ---------- Add / Edit Student modal: improved layout, image resizing, reset password ---------- */
async function openEditStudentModal(id) {
  try {
    // try single endpoint first (prefer exact student endpoint)
    let item = null;
    try {
      const res = await apiFetch('/students/' + id);
      item = res.student || null;
    } catch (e) {
      // fallback to list endpoint if single endpoint not available
      const res = await apiFetch('/students?search=');
      item = (res.items || []).find(x => x._id === id);
    }
    if (!item) { showToast('Student not found', 'error'); return; }

    // permission: only admins/managers can reset
    const canReset = ['admin','manager'].includes(getUserRole());

    const form = document.createElement('div');
    form.style.maxWidth = '760px';
    form.innerHTML = `
      <h3>Edit Student</h3>
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div style="flex:1">
          <label>Full name</label><input id="e-fullname" value="${escapeHtml(item.fullname || '')}" style="width:100%"/><br/>
          <label>Number ID</label><input id="e-numberId" value="${escapeHtml(item.numberId || '')}" style="width:100%"/><br/>
          <label>Class</label><select id="e-classId" style="width:100%"><option>Loading...</option></select><br/>
          <label>Parent name</label><input id="e-parentName" value="${escapeHtml(item.parentName || '')}" style="width:100%"/><br/>
          <label>Parent phone</label><input id="e-parentPhone" value="${escapeHtml(item.parentPhone || '')}" style="width:100%"/><br/>
          <label>Student phone</label><input id="e-phone" value="${escapeHtml(item.phone || '')}" style="width:100%"/><br/>
          <label>Fee</label><input id="e-fee" type="number" value="${item.fee || 0}" style="width:100%"/><br/>
          <label>Paid Amount</label><input id="e-paidAmount" type="number" value="${item.paidAmount || 0}" style="width:100%"/><br/>
        </div>
        <div style="width:220px;min-width:220px">
          <div style="margin-bottom:6px"><strong>Photo</strong></div>
          <div id="e-photo-preview" style="width:100%;height:120px;border-radius:8px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center"></div>
          <input id="e-photo" type="file" accept="image/*" style="margin-top:8px" /><br/>
          <div style="margin-top:10px;color:#6b7280;font-size:12px">Selecting a photo will replace current. Images are resized before upload.</div>
        </div>
      </div>

      <div style="margin-top:12px;text-align:right">
        ${canReset ? '<button id="reset-stud-pass" class="btn" style="background:#f59e0b;color:#fff;margin-right:8px">Reset password</button>' : ''}
        <button id="update-student" class="btn">Update</button>
        <button id="cancel-update" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
      </div>

      <div id="reset-inline-note" style="margin-top:10px;color:#064e3b;display:none"></div>
    `;
    showModal(form);

    // initial photo preview
    const preview = document.getElementById('e-photo-preview');
    if (item.photoUrl) {
      const src = item.photoUrl.startsWith('http') ? item.photoUrl : (SERVER_BASE + item.photoUrl);
      preview.innerHTML = `<img src="${encodeURI(src)}" style="width:80px;height:80px;object-fit:cover;border-radius:8px" />`;
    } else {
      preview.innerHTML = '<div style="color:#94a3b8;padding:8px">No photo</div>';
    }

    // load classes and select the current one, robust matching if populated or plain id
    (async () => {
      try {
        const cls = await apiFetch('/classes');
        const sel = document.getElementById('e-classId');
        sel.innerHTML = '<option value="">-- Select class --</option>';
        (cls.items || []).forEach(c => {
          const opt = document.createElement('option');
          opt.value = c._id;
          opt.textContent = c.name + ' (' + (c.classId || '') + ')';
          // match populated document or raw id string
          const itemClassId = item.classId && typeof item.classId === 'object' ? (item.classId._id || item.classId) : item.classId;
          if (itemClassId && String(itemClassId) === String(c._id)) opt.selected = true;
          sel.appendChild(opt);
        });
      } catch (e) {
        console.warn('Load classes error', e);
      }
    })();

    // photo change preview handler
    const photoInput = document.getElementById('e-photo');
    photoInput.addEventListener('change', () => renderImagePreview(photoInput, preview));

    // cancel
    document.getElementById('cancel-update')?.addEventListener('click', closeModal);

    // Update handler (supports file upload with resize)
    document.getElementById('update-student')?.addEventListener('click', async () => {
      const payload = {
        fullname: document.getElementById('e-fullname').value.trim(),
        numberId: document.getElementById('e-numberId').value.trim(),
        classId: document.getElementById('e-classId').value,
        parentName: document.getElementById('e-parentName').value.trim(),
        parentPhone: document.getElementById('e-parentPhone').value.trim(),
        phone: document.getElementById('e-phone').value.trim(),
        fee: Number(document.getElementById('e-fee').value || 0),
        paidAmount: Number(document.getElementById('e-paidAmount').value || 0)
      };
      try {
        const photoEl = document.getElementById('e-photo');
        if (photoEl && photoEl.files && photoEl.files.length > 0) {
          const resized = await resizeImageFile(photoEl.files[0], 1024, 1024, 0.8);
          const fd = new FormData();
          Object.entries(payload).forEach(([k, v]) => fd.append(k, v));
          fd.append('photo', resized, resized.name || 'photo.jpg');

          const headers = {};
          if (getToken()) headers['Authorization'] = 'Bearer ' + getToken();
          const base = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000' : '';
          const res = await fetch(base + '/api/students/' + id, { method: 'PUT', headers, body: fd });
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            await res.json(); // ignore returned payload for now
          } else {
            const txt = await res.text();
            throw new Error(txt.slice(0, 200));
          }
        } else {
          await apiFetch('/students/' + id, { method: 'PUT', body: payload });
        }
        showToast('Updated', 'success');
        closeModal();
        await loadStudents();
      } catch (err) {
        console.error(err);
        showToast('Failed to update: ' + (err.message || 'server error'), 'error');
      }
    });

    // Reset password (admin/manager only) — show one-time password inline and copy to clipboard
    if (canReset) {
      document.getElementById('reset-stud-pass')?.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (!confirm('Generate a temporary password for this student? The new password will be shown once and copied to your clipboard.')) return;
        try {
          const res = await apiFetch('/students/' + id + '/reset-password', { method: 'POST', body: {} });
          if (!res || !res.tempPassword) {
            showToast('Password reset succeeded but no password returned', 'info');
            return;
          }
          const temp = res.tempPassword;
          // display inline note
          const note = document.getElementById('reset-inline-note');
          if (note) {
            note.style.display = 'block';
            note.innerHTML = `Temporary password: <strong style="letter-spacing:0.6px">${escapeHtml(temp)}</strong> — copied to clipboard. Ask student to change it at next login.`;
          }
          // attempt to copy
          try {
            await navigator.clipboard.writeText(temp);
          } catch (e) {
            // fallback: select text for manual copy
            try {
              const range = document.createRange();
              // create a temp element to select if necessary
              const el = document.createElement('div');
              el.style.position = 'fixed';
              el.style.left = '-9999px';
              el.innerText = temp;
              document.body.appendChild(el);
              range.selectNodeContents(el);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              setTimeout(() => { try { sel.removeAllRanges(); el.remove(); } catch (e2) {} }, 2000);
            } catch (e2) { /* ignore */ }
          }
          showToast('Temporary password generated and copied (if clipboard allowed).', 'info', 7000);
        } catch (err) {
          console.error('Reset password error', err);
          showToast('Failed to reset password: ' + (err.message || 'server error'), 'error');
        }
      });
    }

  } catch (err) {
    console.error('Open edit error', err);
    showToast('Unable to open edit form: ' + (err.message || 'server error'), 'error');
  }
}


async function loadStudents() {
  const q = document.getElementById('student-search')?.value || '';
  const list = document.getElementById('students-list');
  if (!list) return;
  list.innerHTML = '<p>Loading...</p>';
  try {
    const res = await apiFetch('/students?search=' + encodeURIComponent(q));
    const items = res.items || [];
    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = '<p>No students found.</p>';
      return;
    }

    items.forEach(s => {
      const photoSrc = s.photoUrl ? (s.photoUrl.startsWith('http') ? s.photoUrl : (SERVER_BASE + s.photoUrl)) : '';
      const row = document.createElement('div');
      row.className = 'card';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '10px';
      row.style.marginBottom = '8px';
      row.style.cursor = 'pointer';

      // left: photo
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '12px';
      left.style.flex = '1';

      const photoWrap = document.createElement('div');
      photoWrap.style.width = '64px';
      photoWrap.style.height = '64px';
      photoWrap.style.borderRadius = '8px';
      photoWrap.style.overflow = 'hidden';
      photoWrap.style.background = '#f3f4f6';
      if (photoSrc) {
        const img = document.createElement('img');
        img.src = encodeURI(photoSrc);
        img.alt = 'photo';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        photoWrap.appendChild(img);
      } else {
        photoWrap.innerHTML = `<div style="padding:8px;color:#94a3b8">No photo</div>`;
      }

      const content = document.createElement('div');
      content.style.flex = '1';

      const phoneHtmlSafe = s.phone ? telLink(s.phone) : '<span class="muted">—</span>';
      const parentPhoneHtmlSafe = s.parentPhone ? telLink(s.parentPhone) : '<span class="muted">—</span>';
      const className = escapeHtml((s.classId && s.classId.name) || '');
      content.innerHTML = `<strong>${escapeHtml(s.fullname)}</strong>
        <div style="font-size:13px;color:#6b7280">${escapeHtml(s.numberId || '')}</div>
        <div style="margin-top:6px">ID: ${escapeHtml(s.numberId || '')} • Phone: ${phoneHtmlSafe}</div>
        <div style="margin-top:4px">Class: ${className} • Fee: ${s.fee || 0} • Status: ${escapeHtml(s.status || 'unpaid')}</div>
        <div style="margin-top:4px;color:#6b7280;font-size:13px">Parent: ${escapeHtml(s.parentName || '')} • ${parentPhoneHtmlSafe}</div>`;

      // vertical separator
      const sep = document.createElement('div');
      sep.style.width = '1px';
      sep.style.height = '64px';
      sep.style.background = '#e6e6e6';
      sep.style.margin = '0 12px';

      left.appendChild(photoWrap);
      left.appendChild(sep);
      left.appendChild(content);

      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '8px';
      controls.style.flexShrink = '0';
      controls.innerHTML = `<button data-id="${s._id}" class="edit btn">Edit</button>
                            <button data-id="${s._id}" class="del btn" style="background:#ef4444">Delete</button>`;

      row.appendChild(left);
      row.appendChild(controls);

      // clicking the card (except edit/delete) shows details modal
      row.addEventListener('click', (ev) => {
        // ignore clicks on buttons inside controls
        if (ev.target && (ev.target.closest('.edit') || ev.target.closest('.del') || ev.target.tagName === 'A' || ev.target.tagName === 'BUTTON')) return;
        openStudentDetailModal(s);
      });

      list.appendChild(row);
    });

    // bind events - delete/update now using showToast
    list.querySelectorAll('.del').forEach(btn=> btn.addEventListener('click', async (e)=> {
      e.stopPropagation();
      const id = e.target.dataset.id;
      if (!confirm('Delete student?')) return;
      try {
        await apiFetch('/students/' + id, { method: 'DELETE' });
        showToast('Deleted', 'success');
        await loadStudents();
      } catch (err) {
        console.error('Delete student error', err);
        showToast('Failed to delete: ' + (err.message || 'server error'), 'error');
      }
    }));

    list.querySelectorAll('.edit').forEach(btn=> btn.addEventListener('click', async (e)=> {
      e.stopPropagation();
      openEditStudentModal(e.target.dataset.id);
    }));

  } catch (err) {
    console.error('Load students error', err);
    if (err.message && err.message.toLowerCase().includes('unauthorized')) { showToast('Please login', 'error'); navigate('login'); return; }
    list.innerHTML = '<p>Failed to load students.</p>';
    showToast('Failed to load students', 'error');
  }
}



async function openEditStudentModal(id) {
  try {
    // prefer single endpoint
    let item = null;
    try {
      const res = await apiFetch('/students/' + id);
      item = res.student || null;
    } catch (e) {
      const res = await apiFetch('/students?search=');
      item = (res.items || []).find(x => x._id === id);
    }
    if (!item) { alert('Student not found'); return; }

    const form = document.createElement('div');
    form.style.maxWidth = '760px';
    form.innerHTML = `
      <h3>Edit Student</h3>
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div style="flex:1">
          <label>Full name</label><input id="e-fullname" value="${escapeHtml(item.fullname || '')}" style="width:100%"/><br/>
          <label>Number ID</label><input id="e-numberId" value="${escapeHtml(item.numberId || '')}" style="width:100%"/><br/>
          <label>Class</label><select id="e-classId" style="width:100%"><option>Loading...</option></select><br/>
          <label>Parent name</label><input id="e-parentName" value="${escapeHtml(item.parentName || '')}" style="width:100%"/><br/>
          <label>Parent phone</label><input id="e-parentPhone" value="${escapeHtml(item.parentPhone || '')}" style="width:100%"/><br/>
          <label>Student phone</label><input id="e-phone" value="${escapeHtml(item.phone || '')}" style="width:100%"/><br/>
          <label>Fee</label><input id="e-fee" type="number" value="${item.fee || 0}" style="width:100%"/><br/>
          <label>Paid Amount</label><input id="e-paidAmount" type="number" value="${item.paidAmount || 0}" style="width:100%"/><br/>
        </div>
        <div style="width:220px;min-width:220px">
          <div style="margin-bottom:6px"><strong>Photo</strong></div>
          <div id="e-photo-preview" style="width:100%;height:120px;border-radius:8px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center"></div>
          <input id="e-photo" type="file" accept="image/*" style="margin-top:8px" /><br/>
          <div style="margin-top:10px;color:#6b7280;font-size:12px">Selecting a photo will replace current.</div>
        </div>
      </div>

      <div style="margin-top:12px;text-align:right">
        <button id="update-student" class="btn">Update</button>
        <button id="cancel-update" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
      </div>
    `;
    showModal(form);

    // photo preview initial
    const preview = document.getElementById('e-photo-preview');
    if (item.photoUrl) {
      preview.innerHTML = `<img src="${encodeURI(item.photoUrl.startsWith('http') ? item.photoUrl : (SERVER_BASE + item.photoUrl))}" style="width:80px;height:80px;object-fit:cover;border-radius:8px" />`;
    } else preview.innerHTML = '<div style="color:#94a3b8;padding:8px">No photo</div>';

    // load classes to select
    (async ()=>{
      try{
        const cls = await apiFetch('/classes');
        const sel = document.getElementById('e-classId');
        sel.innerHTML = '<option value="">-- Select class --</option>';
        (cls.items || []).forEach(c => {
          const opt = document.createElement('option');
          opt.value = c._id;
          opt.textContent = c.name + ' (' + c.classId + ')';
          if(item.classId && (item.classId._id ? item.classId._id === c._id : item.classId === c._id)) opt.selected=true;
          sel.appendChild(opt);
        });
      }catch(e){ console.warn('Load classes error', e); }
    })();

    const photoInput = document.getElementById('e-photo');
    photoInput.addEventListener('change', ()=> renderImagePreview(photoInput, preview));

    document.getElementById('cancel-update')?.addEventListener('click', closeModal);
    document.getElementById('update-student')?.addEventListener('click', async ()=> {
      const payload = {
        fullname: document.getElementById('e-fullname').value.trim(),
        numberId: document.getElementById('e-numberId').value.trim(),
        classId: document.getElementById('e-classId').value,
        parentName: document.getElementById('e-parentName').value.trim(),
        parentPhone: document.getElementById('e-parentPhone').value.trim(),
        phone: document.getElementById('e-phone').value.trim(),
        fee: Number(document.getElementById('e-fee').value || 0),
        paidAmount: Number(document.getElementById('e-paidAmount').value || 0)
      };
      try{
        const photoInput = document.getElementById('e-photo');
        if(photoInput && photoInput.files && photoInput.files.length > 0){
          const resized = await resizeImageFile(photoInput.files[0], 1024, 1024, 0.8);
          const fd = new FormData();
          Object.entries(payload).forEach(([k,v]) => fd.append(k, v));
          fd.append('photo', resized, resized.name || 'photo.jpg');

          const headers = {};
          if (getToken()) headers['Authorization'] = 'Bearer ' + getToken();
          const res = await fetch((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : '') + '/api/students/' + id, { method: 'PUT', headers, body: fd });
          // parse JSON safely
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            await res.json();
          } else {
            const txt = await res.text();
            throw new Error(txt.slice(0,200));
          }
        } else {
          await apiFetch('/students/' + id, { method: 'PUT', body: payload });
        }
        alert('Updated');
        closeModal();
        await loadStudents();
      }catch(err){ console.error(err); alert('Failed to update: ' + (err.message || 'server error')); }
    });
  } catch (err) {
    console.error('Open edit error', err);
    alert('Unable to open edit form: ' + (err.message || 'server error'));
  }
}








// ---------- TEACHERS ----------
async function renderTeachers(){
  const role = getUserRole();
  if(!['admin','manager'].includes(role)) { app.innerHTML = '<div class="page"><h2>Access denied</h2></div>'; return; }
  app.innerHTML = ''; const node = tpl('teachers'); app.appendChild(node);
  document.getElementById('add-teacher-btn')?.addEventListener('click', openAddTeacherModal);
  document.getElementById('teacher-search')?.addEventListener('input', debounce(loadTeachers, 300));
  await loadTeachers();
}

function openAddTeacherModal(){
  const form = document.createElement('div');
  form.innerHTML = `
    <h3>Add Teacher</h3>
    <label>Full name</label><input id="t-fullname"/><br/>
    <label>Number ID (auto if empty)</label><input id="t-numberId"/><br/>
    <label>Phone</label><input id="t-phone"/><br/>
    <label>Classes (select multiple)</label><select id="t-classIds" multiple style="width:100%"></select><br/>
    <label>Subjects (select multiple)</label><select id="t-subjectIds" multiple style="width:100%"></select><br/>
    <label>Salary</label><input id="t-salary" type="number" placeholder="0" /><br/>
    <label>Password</label><input id="t-password" placeholder="password"/><br/>
    <label>Photo (optional)</label><input id="t-photo" type="file" accept="image/*" /><br/>
    <div style="margin-top:8px"><button id="save-teacher" class="btn">Save</button> <button id="cancel-teacher" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button></div>
  `;
  showModal(form);

  // load classes + subjects
  (async ()=> {
    try{
      const [clsRes, subRes] = await Promise.all([ apiFetch('/classes'), apiFetch('/subjects') ]);
      const sel = document.getElementById('t-classIds');
      sel.innerHTML = '';
      (clsRes.items||[]).forEach(c => { const opt=document.createElement('option'); opt.value=c._id; opt.textContent=c.name + ' (' + (c.classId||'') + ')'; sel.appendChild(opt); });

      const subSel = document.getElementById('t-subjectIds');
      subSel.innerHTML = '';
      (subRes.items||[]).forEach(s => { const opt=document.createElement('option'); opt.value=s._id; opt.textContent = s.name + ' (' + (s.subjectId||'') + ')'; subSel.appendChild(opt); });
    }catch(e){ console.warn('load classes/subjects', e); }
  })();

  document.getElementById('cancel-teacher')?.addEventListener('click', closeModal);
  document.getElementById('save-teacher').addEventListener('click', async ()=> {
    const fullname = document.getElementById('t-fullname').value.trim();
    const numberId = document.getElementById('t-numberId').value.trim();
    const phone = document.getElementById('t-phone').value.trim();
    const password = document.getElementById('t-password').value;
    const salary = document.getElementById('t-salary').value;
    const sel = document.getElementById('t-classIds');
    const classIds = Array.from(sel.selectedOptions).map(o => o.value);
    const ssel = document.getElementById('t-subjectIds');
    const subjectIds = Array.from(ssel.selectedOptions).map(o => o.value);
    const photoInput = document.getElementById('t-photo');

    if(!fullname) { alert('Name required'); return; }

    try{
      if(photoInput && photoInput.files && photoInput.files.length > 0){
        const fd = new FormData();
        fd.append('fullname', fullname);
        if(numberId) fd.append('numberId', numberId);
        if(phone) fd.append('phone', phone);
        if(password) fd.append('password', password);
        if(salary) fd.append('salary', salary);
        classIds.forEach(id=> fd.append('classIds', id));
        subjectIds.forEach(id=> fd.append('subjectIds', id));
        fd.append('photo', photoInput.files[0]);
        await apiUpload('/teachers', fd);
      } else {
        await apiFetch('/teachers', { method:'POST', body:{ fullname, numberId, classIds, subjectIds, phone, password, salary } });
      }
      alert('Teacher created');
      closeModal();
      await loadTeachers();
    }catch(err){
      console.error('create teacher error', err);
      alert('Failed to create teacher: ' + (err.message || 'server error'));
    }
  });
}


async function loadTeachers(){
  const q = document.getElementById('teacher-search')?.value || '';
  const list = document.getElementById('teachers-list'); if(!list) return; list.innerHTML = 'Loading...';
  try{
    const res = await apiFetch('/teachers?search=' + encodeURIComponent(q));
    const items = res.items || [];
    list.innerHTML = '';
    if(items.length === 0) list.innerHTML = '<p>No teachers</p>';
    items.forEach(t => {
      const classesText = (t.classIds||[]).map(x=> x.name || x).join(', ');
      const subjectsText = (t.subjectIds||[]).map(s=> s.name || s).join(', ');
      // inside loadTeachers(), replacing the current photoHtml logic
const photoSrc = (t.photoUrl && typeof t.photoUrl === 'string')
? (t.photoUrl.startsWith('http') ? t.photoUrl : (SERVER_BASE + t.photoUrl))
: '';
const photoHtml = photoSrc
? `<div style="width:64px;height:64px;border-radius:8px;overflow:hidden;background:#f3f4f6"><img src="${encodeURI(photoSrc)}" style="width:100%;height:100%;object-fit:cover"/></div>`
: `<div style="width:64px;height:64px;border-radius:8px;overflow:hidden;background:#f3f4f6;padding:8px;color:#94a3b8">No photo</div>`;

      const div = document.createElement('div'); div.className = 'card';
      div.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center">
          ${photoHtml}
          <div style="flex:1">
            <strong>${escapeHtml(t.fullname)}</strong> <div style="font-size:13px;color:#6b7280">${escapeHtml(t.numberId || '')}</div>
            <div>Phone: ${escapeHtml(t.phone||'')} • Salary: ${escapeHtml(String(t.salary || 0))}</div>
            <div>Classes: ${escapeHtml(classesText)}</div>
            <div>Subjects: ${escapeHtml(subjectsText)}</div>
          </div>
        </div>
      `;

      // show edit/delete only to admin/manager (and only if owner)
      if (['admin','manager'].includes(getUserRole())) {
        const controls = document.createElement('div');
        controls.style.marginTop = '8px';
        controls.innerHTML = `<button data-id="${t._id}" class="edit btn">Edit</button> <button data-id="${t._id}" class="del btn">Delete</button>`;
        div.appendChild(controls);
      }
      list.appendChild(div);
    });

    // bind delete/edit only if present
    list.querySelectorAll('.del').forEach(b=> b.addEventListener('click', async e=> { if(!confirm('Delete teacher?')) return; try{ await apiFetch('/teachers/' + e.target.dataset.id, { method:'DELETE' }); alert('Deleted'); await loadTeachers(); } catch(err){ console.error(err); alert('Failed to delete'); } }));
    list.querySelectorAll('.edit').forEach(b=> b.addEventListener('click', e=> openEditTeacher(e.target.dataset.id)));
  }catch(err){ console.error(err); list.innerHTML = '<p>Failed to load teachers</p>'; }
}


async function openEditTeacher(id){
  try{
    const res = await apiFetch('/teachers?search=');
    const item = (res.items||[]).find(x=> x._id === id);
    if(!item) return alert('Not found');
    const form = document.createElement('div');
    form.innerHTML = `
      <h3>Edit Teacher</h3>
      <label>Full name</label><input id="et-fullname" value="${escapeHtml(item.fullname||'')}" /><br/>
      <label>Number ID</label><input id="et-numberId" value="${escapeHtml(item.numberId||'')}" /><br/>
      <label>Phone</label><input id="et-phone" value="${escapeHtml(item.phone||'')}" /><br/>
      <label>Classes</label><select id="et-classIds" multiple style="width:100%"></select><br/>
      <label>Subjects</label><select id="et-subjectIds" multiple style="width:100%"></select><br/>
      <label>Salary</label><input id="et-salary" type="number" value="${item.salary||0}" /><br/>
      <label>Photo (optional)</label><input id="et-photo" type="file" accept="image/*" /><br/>
      <div style="margin-top:8px"><button id="update-teacher" class="btn">Update</button> <button id="cancel-update-teacher" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button></div>
    `;
    showModal(form);
    // load classes + subjects
    const [clsRes, subRes] = await Promise.all([ apiFetch('/classes'), apiFetch('/subjects') ]);
    const sel = document.getElementById('et-classIds');
    sel.innerHTML = '';
    (clsRes.items||[]).forEach(c=> { const opt=document.createElement('option'); opt.value=c._id; opt.textContent=c.name + ' (' + c.classId + ')'; if((item.classIds||[]).some(id => id == c._id)) opt.selected=true; sel.appendChild(opt); });

    const ssel = document.getElementById('et-subjectIds');
    ssel.innerHTML = '';
    (subRes.items||[]).forEach(s => { const opt = document.createElement('option'); opt.value = s._id; opt.textContent = s.name + ' (' + (s.subjectId||'') + ')'; if((item.subjectIds||[]).some(id => id == s._id)) opt.selected=true; ssel.appendChild(opt); });

    document.getElementById('cancel-update-teacher').addEventListener('click', closeModal);
    document.getElementById('update-teacher').addEventListener('click', async ()=> {
      const fullname = document.getElementById('et-fullname').value.trim();
      const numberId = document.getElementById('et-numberId').value.trim();
      const phone = document.getElementById('et-phone').value.trim();
      const salary = Number(document.getElementById('et-salary').value || 0);
      const classIds = Array.from(document.getElementById('et-classIds').selectedOptions).map(o=> o.value);
      const subjectIds = Array.from(document.getElementById('et-subjectIds').selectedOptions).map(o=> o.value);

      try{
        const photoInput = document.getElementById('et-photo');
        if(photoInput && photoInput.files && photoInput.files.length > 0){
          const fd = new FormData();
          fd.append('fullname', fullname);
          fd.append('numberId', numberId);
          fd.append('phone', phone);
          fd.append('salary', String(salary));
          classIds.forEach(id=> fd.append('classIds', id));
          subjectIds.forEach(id=> fd.append('subjectIds', id));
          fd.append('photo', photoInput.files[0]);
          // send via fetch because apiPutUpload may not exist for PUT multipart
          const headers = {};
          if (getToken()) headers['Authorization'] = 'Bearer ' + getToken();
          const res = await fetch((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : '') + '/api/teachers/' + id, { method: 'PUT', headers, body: fd });
          const ct = res.headers.get('content-type') || '';
          if (!ct.includes('application/json')) throw new Error(await res.text());
        } else {
          await apiFetch('/teachers/' + id, { method:'PUT', body:{ fullname, numberId, phone, salary, classIds, subjectIds } });
        }
        alert('Updated');
        closeModal();
        await loadTeachers();
      } catch(err){
        console.error('Update teacher error', err);
        alert('Failed to update teacher: ' + (err.message || 'server error'));
      }
    });
  }catch(err){ console.error(err); alert('Failed to open'); }
}


// call this for teacher landing
async function renderTeacherHome(){
  app.innerHTML = '';
  const node = document.createElement('div');
  node.className = 'page';
  node.innerHTML = `<h2>My Classes</h2>
    <div style="display:flex;gap:12px;align-items:center">
      <div><button id="nav-attendance" class="btn">Attendance</button></div>
    </div>
    <div id="teacher-classes" style="margin-top:12px">Loading...</div>
    <div id="teacher-class-students" style="margin-top:12px"></div>
  `;
  app.appendChild(node);
  document.getElementById('nav-attendance').addEventListener('click', ()=> {
    // already on attendance view — could support different tabs later
    loadTeacherClasses();
  });
  await loadTeacherClasses();
}

async function loadTeacherClasses(){
  const list = document.getElementById('teacher-classes');
  if(!list) return;
  list.innerHTML = 'Loading...';
  try{
    // /teachers?search= will return only the teacher's own record when role=teacher
    const res = await apiFetch('/teachers?search=');
    const t = (res.items && res.items[0]) || res.items?.length===1 && res.items[0] || null;
    if(!t) { list.innerHTML = '<p>No teacher record found.</p>'; return; }
    const classes = t.classIds || [];
    list.innerHTML = '';
    if(classes.length === 0) { list.innerHTML = '<p>No classes assigned</p>'; return; }
    classes.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.display = 'block';
      btn.style.marginBottom = '8px';
      btn.dataset.id = c._id;
      btn.textContent = c.name + (c.classId ? (' ('+c.classId+')') : '');
      btn.addEventListener('click', ()=> openClassAttendance(c._id, c.name));
      list.appendChild(btn);
    });
  }catch(err){ console.error('loadTeacherClasses err', err); list.innerHTML = '<p>Failed to load classes</p>'; }
}

// open attendance view for a class
async function openClassAttendance(classId, className){
  const container = document.getElementById('teacher-class-students');
  container.innerHTML = '<h3>Loading students...</h3>';
  try{
    // fetch students for this class
    const res = await apiFetch('/students/class/' + classId);
    const students = res.items || res || [];
    // fetch existing attendance for today
    const today = new Date();
    const dd = today.toISOString().slice(0,10); // YYYY-MM-DD
    const attRes = await apiFetch('/attendances?classId=' + classId + '&date=' + dd);
    const existing = attRes.attendance || null;
    // build UI
    const html = document.createElement('div');
    html.innerHTML = `<h3>Attendance — ${escapeHtml(className || '')} • ${dd}</h3>
      <div style="margin-bottom:8px"><button id="all-present" class="btn">All Present</button> <button id="save-att" class="btn">Save</button></div>
      <div id="att-list"></div>
    `;
    container.innerHTML = '';
    container.appendChild(html);

    const listDiv = document.getElementById('att-list');
    listDiv.innerHTML = '';
    // build map from studentId -> present from existing records
    const presentMap = {};
    if (existing && existing.records) {
      existing.records.forEach(r => presentMap[String(r.studentId)] = !!r.present);
    }
    students.forEach(s => {
      const row = document.createElement('div');
      row.className = 'card';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.marginBottom = '6px';
      const checked = presentMap[String(s._id)] ? 'checked' : '';
      row.innerHTML = `<div><strong>${escapeHtml(s.fullname)}</strong> <div class="muted">${escapeHtml(s.numberId || '')}</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <label><input type="checkbox" class="att-checkbox" data-id="${s._id}" ${checked} /> Present</label>
        </div>`;
      listDiv.appendChild(row);
    });

    document.getElementById('all-present').addEventListener('click', ()=> {
      listDiv.querySelectorAll('.att-checkbox').forEach(cb => cb.checked = true);
    });

    document.getElementById('save-att').addEventListener('click', async ()=> {
      const records = Array.from(listDiv.querySelectorAll('.att-checkbox')).map(cb => ({ studentId: cb.dataset.id, present: !!cb.checked }));
      try{
        await apiFetch('/attendances', { method: 'POST', body: { classId, date: dd, records } });
        alert('Attendance saved');
      }catch(err){
        console.error('save attendance err', err);
        alert('Failed to save: ' + (err.message || 'server error'));
      }
    });

  }catch(err){
    console.error('openClassAttendance err', err);
    container.innerHTML = '<p>Failed to load students or attendance.</p>';
  }
}

// ---------- CLASSES (frontend) ----------

async function renderClasses(){
  const role = getUserRole();
  // allow teachers to view (but not edit/delete). Only block completely unauthorized roles.
  if(!['admin','manager','teacher'].includes(role)) {
    app.innerHTML = '<div class="page"><h2>Access denied</h2></div>';
    return;
  }

  app.innerHTML = '';
  const node = tpl('classes');
  app.appendChild(node);

  // only show the "Add" button for admin/manager
  if(!['admin','manager'].includes(role)) {
    const addBtn = document.getElementById('add-class-btn');
    if(addBtn) addBtn.style.display = 'none';
  } else {
    document.getElementById('add-class-btn')?.addEventListener('click', openAddClassModal);
  }

  document.getElementById('class-search')?.addEventListener('input', debounce(loadClasses, 300));
  await loadClasses();
}

async function loadClasses(){
  const q = document.getElementById('class-search')?.value || '';
  const list = document.getElementById('classes-list'); if(!list) return;
  list.innerHTML = 'Loading...';
  const role = getUserRole();

  // fetch current user to check teacher permissions if needed
  let curUser = null;
  try { curUser = await getCurrentUser(); } catch(e){ curUser = null; }

  try{
    const res = await apiFetch('/classes?search=' + encodeURIComponent(q));
    const items = res.items || [];
    list.innerHTML = '';
    if(items.length === 0) {
      list.innerHTML = '<p>No classes</p>';
      return;
    }

    items.forEach(c => {
      const div = document.createElement('div');
      div.className = 'card';
      // subjects might be populated objects or just ids — handle both
      const subjects = (c.subjectIds || []).map(s => (s && s.name) ? s.name + (s.subjectId ? ' ('+s.subjectId+')' : '') : String(s)).join(', ');
      // show class header clickable for details
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div style="flex:1;cursor:pointer" class="class-card-body" data-id="${c._id}">
            <strong>${escapeHtml(c.name)}</strong>
            <div class="muted">ID: ${escapeHtml(c.classId || '')}</div>
            <div class="muted" style="margin-top:6px">Subjects: ${escapeHtml(subjects || 'None')}</div>
          </div>
          <div style="flex-shrink:0" id="controls-${c._id}"></div>
        </div>
      `;

      // add controls only for admin/manager and allowed teachers
      const controlsEl = div.querySelector('#controls-' + c._id);
      let showMove = false;
      if (['admin','manager'].includes(role)) showMove = true;
      if (role === 'teacher' && curUser && curUser.permissions && curUser.permissions.moveStudents) showMove = true;

      if (showMove && ['admin','manager','teacher'].includes(role)) {
        // show Move + Edit + Delete for admins/managers; for allowed teachers show Move only
        if (['admin','manager'].includes(role)) {
          controlsEl.innerHTML = `<button data-id="${c._id}" class="move-class btn" style="background:#f59e0b;margin-right:6px">Move</button>
            <button data-id="${c._id}" class="edit-class btn">Edit</button>
            <button data-id="${c._id}" class="del-class btn" style="background:#ef4444">Delete</button>`;
        } else {
          // teacher with permission: only Move
          controlsEl.innerHTML = `<button data-id="${c._id}" class="move-class btn" style="background:#f59e0b">Move</button>`;
        }
      } else {
        // teachers without permission / students: no controls
        controlsEl.innerHTML = '';
      }

      // append the card
      list.appendChild(div);

      // bind click on the card body to open details (works for teachers & admins)
      div.querySelector('.class-card-body')?.addEventListener('click', (e) => {
        // pass the class object c if needed to show subjects quickly
        openClassDetails(c._id, c);
      });
    });

    // bind manager delete/edit only if those buttons exist
    list.querySelectorAll('.del-class').forEach(b=> b.addEventListener('click', async e=> {
      if(!confirm('Delete class? This will remove the class.')) return;
      try{
        await apiFetch('/classes/' + e.target.dataset.id, { method:'DELETE' });
        alert('Deleted');
        await loadClasses();
      }catch(err){
        console.error('Failed to delete class', err);
        alert('Failed to delete class: ' + (err.message || 'server error'));
      }
    }));
    list.querySelectorAll('.edit-class').forEach(b=> b.addEventListener('click', e=> openEditClass(e.target.dataset.id)));
    list.querySelectorAll('.move-class').forEach(b=> b.addEventListener('click', e=> openMoveStudentsModal(e.target.dataset.id)));

  }catch(err){
    console.error(err);
    list.innerHTML = '<p>Failed to load classes</p>';
  }
}

/**
 * Show modal with class details: subjects and list of students in the class.
 * Teachers will be able to view students; admins/managers can also view.
 */
async function openClassDetails(classId, classObj = null){
  const modal = document.createElement('div');
  modal.innerHTML = `<h3>Class Details</h3>
    <div id="cd-body">Loading...</div>
    <div style="margin-top:10px"><button id="cd-close" class="btn">Close</button></div>`;
  showModal(modal);

  document.getElementById('cd-close')?.addEventListener('click', closeModal);

  try{
    // fetch class info if not passed
    let cls = classObj;
    if(!cls) {
      const res = await apiFetch('/classes?search=');
      cls = (res.items||[]).find(x => x._id === classId) || null;
      // better: call /classes/:id if you prefer
      if (!cls) {
        try {
          const single = await apiFetch('/classes/' + classId);
          cls = single.class || single;
        } catch(e) { /* ignore fallback errors */ }
      }
    }

    const subjectsHtml = (() => {
      const sids = (cls && cls.subjectIds) ? cls.subjectIds : [];
      if(!sids || sids.length === 0) return '<div class="muted">No subjects assigned</div>';
      return '<ul>' + sids.map(s => `<li>${escapeHtml((s && s.name) ? (s.name + (s.subjectId ? ' ('+s.subjectId+')' : '')) : String(s))}</li>`).join('') + '</ul>';
    })();

    // fetch students in this class
    let students = [];
    try {
      const stRes = await apiFetch('/students/class/' + classId);
      students = stRes.items || stRes || [];
    } catch(e) {
      console.warn('Could not load students for class', e);
    }

    const studentsHtml = students.length === 0
      ? '<div class="muted">No students in this class</div>'
      : '<div style="max-height:300px;overflow:auto">' + students.map(s => `<div class="card" style="margin-bottom:6px"><strong>${escapeHtml(s.fullname)}</strong><div class="muted">${escapeHtml(s.numberId||'')} • ${escapeHtml(s.phone||'')}</div></div>`).join('') + '</div>';

    document.getElementById('cd-body').innerHTML = `
      <div><strong>Name:</strong> ${escapeHtml(cls ? cls.name : '')}</div>
      <div><strong>Class ID:</strong> ${escapeHtml(cls ? (cls.classId||'') : '')}</div>
      <div style="margin-top:8px"><strong>Subjects:</strong> ${subjectsHtml}</div>
      <div style="margin-top:12px"><strong>Students:</strong> ${studentsHtml}</div>
    `;
  }catch(err){
    console.error('openClassDetails err', err);
    document.getElementById('cd-body').innerHTML = '<p>Failed to load class details</p>';
  }
}


function openAddClassModal(){
  const form = document.createElement('div');
  form.innerHTML = `<h3>Add Class</h3>
    <label>Name</label><input id="c-name"/><br/>
    <label>Class ID (leave empty for auto)</label><input id="c-classId"/><br/>
    <label>Subjects (multi select)</label><select id="c-subjectIds" multiple style="width:100%"></select>
    <div style="margin-top:8px">
      <button id="save-class" class="btn">Save</button>
      <button id="cancel-class" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
    </div>`;
  showModal(form);

  // load subjects for selection (server returns { items, total })
  (async ()=> {
    try{
      const subsRes = await apiFetch('/subjects?search=');
      const subs = subsRes.items || [];
      const sel = document.getElementById('c-subjectIds');
      sel.innerHTML = '';
      subs.forEach(s=> {
        const opt = document.createElement('option');
        opt.value = s._id;
        opt.textContent = s.name + ' (' + (s.subjectId || '') + ')';
        sel.appendChild(opt);
      });
    }catch(e){
      console.warn('Could not load subjects for class creation', e);
      const sel = document.getElementById('c-subjectIds');
      if(sel) sel.innerHTML = '<option value="">(could not load subjects)</option>';
    }
  })();

  document.getElementById('cancel-class').addEventListener('click', closeModal);
  document.getElementById('save-class').addEventListener('click', async ()=>{
    const name = document.getElementById('c-name').value.trim();
    const classId = document.getElementById('c-classId').value.trim();
    const sel = document.getElementById('c-subjectIds');
    const subjectIds = Array.from(sel.selectedOptions).map(o=>o.value);
    if(!name){ alert('Name required'); return; }
    try{
      const res = await apiFetch('/classes', { method:'POST', body:{ name, classId, subjectIds } });
      alert('Class saved' + (res.classId ? (' — ID: ' + res.classId) : ''));
      closeModal();
      await loadClasses();
    }catch(err){
      console.error('Save class error', err);
      alert('Failed to save class: ' + (err.message || 'server error'));
    }
  });
}


async function openViewClass(id){
  try{
    const res = await apiFetch('/classes/' + id);
    const cls = res.class || res; // server returns { class, students } per our backend
    const students = res.students || [];
    const node = document.createElement('div');
    node.innerHTML = `<h3>Class: ${escapeHtml(cls.name)}</h3>
      <div><strong>Class ID:</strong> ${escapeHtml(cls.classId || '')}</div>
      <div style="margin-top:8px"><strong>Subjects</strong></div>
      <div id="view-class-subjects">${(cls.subjectIds||[]).map(s => `<div class="card" style="margin:6px 0">${escapeHtml(s.name)} (${escapeHtml(s.subjectId||'')})</div>`).join('') || '<div>No subjects</div>'}</div>
      <div style="margin-top:8px"><strong>Students</strong></div>
      <div id="view-class-students">${students.length ? students.map(st => `<div class="card" style="margin:6px 0">${escapeHtml(st.fullname)} — ${escapeHtml(st.numberId||'')}</div>`).join('') : '<div>No students in this class</div>'}</div>
      <div style="margin-top:12px"><button id="close-class-view" class="btn" style="background:#ccc;color:#000">Close</button></div>`;
    showModal(node);
    document.getElementById('close-class-view').addEventListener('click', closeModal);
  }catch(err){
    console.error('Open class view error', err);
    alert('Failed to load class details: ' + (err.message || 'server error'));
  }
}

async function openEditClass(id){
  try{
    // fetch single class (prefer /classes/:id but fallback to list)
    let item = null;
    try {
      const x = await apiFetch('/classes/' + id);
      item = x.class || x;
    } catch(e) {
      const res = await apiFetch('/classes?search=');
      item = (res.items||[]).find(x=> x._id === id);
    }
    if(!item) return alert('Not found');

    const form = document.createElement('div');
    form.innerHTML = `<h3>Edit Class</h3>
      <label>Name</label><input id="ec-name" value="${escapeHtml(item.name||'')}" /><br/>
      <label>Class ID</label><input id="ec-classId" value="${escapeHtml(item.classId||'')}" /><br/>
      <label>Subjects</label><select id="ec-subjectIds" multiple style="width:100%"></select>
      <div style="margin-top:8px">
        <button id="update-class" class="btn">Update</button>
        <button id="cancel-update-class" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
      </div>`;
    showModal(form);

    const subsRes = await apiFetch('/subjects?search=');
    const subs = subsRes.items || [];
    const sel = document.getElementById('ec-subjectIds'); sel.innerHTML = '';
    subs.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s._id;
      opt.textContent = s.name + ' ('+ (s.subjectId || '') +')';
      if((item.subjectIds||[]).some(id => String(id) === String(s._id))) opt.selected = true;
      sel.appendChild(opt);
    });

    document.getElementById('cancel-update-class').addEventListener('click', closeModal);
    document.getElementById('update-class').addEventListener('click', async ()=> {
      const name = document.getElementById('ec-name').value.trim();
      const classId = document.getElementById('ec-classId').value.trim();
      const subjectIds = Array.from(sel.selectedOptions).map(o=> o.value);
      try{
        await apiFetch('/classes/' + id, { method:'PUT', body:{ name, classId, subjectIds } });
        alert('Updated');
        closeModal();
        await loadClasses();
      }catch(err){
        console.error('Update class error', err);
        alert('Failed to update: ' + (err.message || 'server error'));
      }
    });
  }catch(err){
    console.error('Open edit class error', err);
    alert('Failed to open edit form: ' + (err.message || 'server error'));
  }
}

// ---------- Move students modal + action ----------
async function openMoveStudentsModal(sourceClassId) {
  // fetch source class name (optional)
  let srcCls = null;
  try { const payload = await apiFetch('/classes/' + sourceClassId); srcCls = payload.class || payload; } catch(e){ srcCls = null; }

  const modal = document.createElement('div');
  modal.innerHTML = `<h3>Move students from: ${escapeHtml(srcCls ? srcCls.name : sourceClassId)}</h3>
    <div style="margin-bottom:8px">
      <label><strong>Target class</strong></label>
      <select id="move-target-class" style="width:100%;padding:8px;margin-top:6px"></select>
    </div>
    <div style="margin-bottom:8px">
      <label><input type="checkbox" id="move-select-all" /> Move all students in this class</label>
    </div>
    <div id="move-students-list" style="max-height:320px;overflow:auto;border:1px solid #eee;padding:8px;border-radius:6px">Loading students...</div>
    <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
      <button id="move-cancel" class="btn" style="background:#ccc;color:#000">Cancel</button>
      <button id="move-commit" class="btn" style="background:#f59e0b">Move Selected</button>
    </div>`;

  showModal(modal);

  // fetch target classes (same school)
  try {
    const clsRes = await apiFetch('/classes?search=');
    const targetSel = document.getElementById('move-target-class');
    targetSel.innerHTML = '<option value="">-- Select target class --</option>';
    (clsRes.items || []).forEach(c => {
      if (String(c._id) === String(sourceClassId)) return; // skip source
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = c.name + (c.classId ? (' ('+c.classId+')') : '');
      targetSel.appendChild(opt);
    });
  } catch (e) {
    console.warn('Could not load classes for moving', e);
  }

  // fetch students in source class
  const listDiv = document.getElementById('move-students-list');
  try {
    const stRes = await apiFetch('/students/class/' + sourceClassId);
    const students = stRes.items || stRes || [];
    if (!students || students.length === 0) {
      listDiv.innerHTML = '<div class="muted">No students in this class</div>';
    } else {
      listDiv.innerHTML = students.map(s => `
        <label style="display:block;padding:6px;border-bottom:1px solid #f3f4f6">
          <input type="checkbox" class="move-student-checkbox" data-id="${s._id}" />
          <strong style="margin-left:8px">${escapeHtml(s.fullname)}</strong>
          <div class="muted" style="margin-left:24px">${escapeHtml(s.numberId||'')} • ${escapeHtml(s.phone||'')}</div>
        </label>
      `).join('');
    }
  } catch (e) {
    console.error('Could not load students for move', e);
    listDiv.innerHTML = '<div class="muted">Failed to load students</div>';
  }

  document.getElementById('move-cancel').addEventListener('click', closeModal);

  // select all behavior
  const selectAllEl = document.getElementById('move-select-all');
  selectAllEl.addEventListener('change', (ev) => {
    const checked = !!ev.target.checked;
    document.querySelectorAll('.move-student-checkbox').forEach(cb => cb.checked = checked);
  });

  document.getElementById('move-commit').addEventListener('click', async () => {
    const targetClassId = document.getElementById('move-target-class').value;
    if (!targetClassId) return alert('Select target class');
    const selectedBoxes = Array.from(document.querySelectorAll('.move-student-checkbox')).filter(cb => cb.checked);
    const studentIds = selectedBoxes.map(cb => cb.dataset.id);
    const moveAll = document.getElementById('move-select-all').checked;

    if (!moveAll && studentIds.length === 0) return alert('Select students or check Move all');

    if (!confirm(`Move ${moveAll ? 'all students' : String(studentIds.length) + ' students'} from this class to the selected class?`)) return;

    try {
      const payload = { targetClassId, moveAll };
      if (!moveAll) payload.studentIds = studentIds;

      const res = await apiFetch('/classes/' + sourceClassId + '/move', { method: 'POST', body: payload });
      alert(res && res.message ? res.message : 'Move completed');
      closeModal();
      // refresh UI
      await loadClasses();
      if (typeof loadStudents === 'function') await loadStudents();
    } catch (err) {
      console.error('Move failed', err);
      alert('Move failed: ' + (err.message || 'server error'));
    }
  });
}

// // ---------- PROFILE (students & teachers) ----------
// async function renderProfile(){
//   const role = getUserRole();
//   if(!['student','teacher' ,'parent'].includes(role)) {
//     app.innerHTML = '<div class="page"><h2>Access denied</h2></div>';
//     return;
//   }

//   app.innerHTML = '';
//   const node = tpl('profile');
//   app.appendChild(node);

//   document.getElementById('edit-profile-btn')?.addEventListener('click', openEditProfileModal);
//   document.getElementById('change-password-btn')?.addEventListener('click', openChangePasswordModal);

//   await loadProfile();
// }

// async function loadProfile(){
//   const card = document.getElementById('profile-card');
//   if(!card) return;
//   card.innerHTML = '<div id="profile-loading" class="muted">Loading profile...</div>';

//   try{
//     const res = await apiFetch('/profile'); // expects { profile, role }
//     const profile = res.profile || res;
//     const role = res.role || getUserRole();

//     // build UI: left - photo, right - details (stacked on mobile)
//     const photoUrl = profile.photoUrl ? (profile.photoUrl.startsWith('http') ? profile.photoUrl : (SERVER_BASE + profile.photoUrl)) : '';

//     const detailsHtmlParts = [];
//     // common fields
//     detailsHtmlParts.push(`<div style="font-size:18px;font-weight:600">${escapeHtml(profile.fullname || '')}</div>`);
//     detailsHtmlParts.push(`<div class="muted" style="margin-top:4px">Role: ${escapeHtml(role)}</div>`);
//     if (profile.numberId) detailsHtmlParts.push(`<div style="margin-top:8px"><strong>ID:</strong> ${escapeHtml(profile.numberId)}</div>`);
//     if (profile.phone) detailsHtmlParts.push(`<div><strong>Phone:</strong> ${escapeHtml(profile.phone)}</div>`);

//     // Student-specific
//     if (role === 'student') {
//       if (profile.classId && profile.classId.name) {
//         detailsHtmlParts.push(`<div><strong>Class:</strong> ${escapeHtml(profile.classId.name)} ${profile.classId.classId ? ('(' + escapeHtml(profile.classId.classId) + ')') : ''}</div>`);
//       }
//       detailsHtmlParts.push(`<div style="margin-top:6px;color:#374151">Status: ${escapeHtml(profile.status || '')} • Fee: ${profile.fee || 0} • Paid: ${profile.paidAmount || 0}</div>`);
//     }

//     // Teacher-specific
//     if (role === 'teacher') {
//       const classesText = (profile.classIds || []).map(c => (c && c.name) ? escapeHtml(c.name + (c.classId ? (' ('+c.classId+')') : '')) : escapeHtml(String(c))).join(', ') || 'None';
//       const subjectsText = (profile.subjectIds || []).map(s => (s && s.name) ? escapeHtml(s.name) : escapeHtml(String(s))).join(', ') || 'None';
//       detailsHtmlParts.push(`<div style="margin-top:6px"><strong>Classes:</strong> ${classesText}</div>`);
//       detailsHtmlParts.push(`<div><strong>Subjects:</strong> ${subjectsText}</div>`);
//       if (profile.salary) detailsHtmlParts.push(`<div><strong>Salary:</strong> ${escapeHtml(String(profile.salary||0))}</div>`);
//     }

//     // assemble card - responsive layout
//     card.innerHTML = `
//       <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
//         <div style="flex:0 0 120px">
//           <div style="width:120px;height:120px;border-radius:10px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center">
//             ${photoUrl ? `<img id="profile-photo-img" src="${encodeURI(photoUrl)}" style="width:100%;height:100%;object-fit:cover"/>` : `<div style="padding:10px;color:#94a3b8">No photo</div>`}
//           </div>
//         </div>
//         <div style="flex:1;min-width:220px">
//           ${detailsHtmlParts.join('')}
//         </div>
//       </div>
//     `;
//   }catch(err){
//     console.error('loadProfile err', err);
//     document.getElementById('profile-card').innerHTML = '<div class="muted">Failed to load profile</div>';
//   }
// }



// function openEditProfileModal(){
//   // open modal with fields (fetch profile to prefill)
//   (async ()=> {
//     try{
//       const res = await apiFetch('/profile');
//       const profile = res.profile || res;
//       const role = res.role || getUserRole();

//       const node = document.createElement('div');
//       node.innerHTML = `
//         <h3>Edit Profile</h3>
//         <label>Full name</label><input id="p-fullname" value="${escapeHtml(profile.fullname||'')}" /><br/>
//         <label>Phone</label><input id="p-phone" value="${escapeHtml(profile.phone||'')}" /><br/>
//         ${ role === 'student' ? `<label>Class</label><select id="p-classId"><option>Loading classes...</option></select><br/>` : '' }
//         ${ role === 'teacher' ? `<label>Classes (select multiple)</label><select id="p-classIds" multiple style="width:100%"></select><br/>
//                                 <label>Subjects (select multiple)</label><select id="p-subjectIds" multiple style="width:100%"></select><br/>
//                                 <label>Salary</label><input id="p-salary" type="number" value="${profile.salary||0}" /><br/>` : '' }
//         <label>Photo (optional)</label><input id="p-photo" type="file" accept="image/*" /><br/>
//         <div style="margin-top:10px">
//           <button id="p-save" class="btn">Save</button>
//           <button id="p-cancel" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
//         </div>
//       `;
//       showModal(node);

//       // populate selects
//       if (role === 'student') {
//         (async ()=> {
//           try {
//             const clsRes = await apiFetch('/classes?search=');
//             const sel = document.getElementById('p-classId');
//             sel.innerHTML = '<option value="">-- Select class --</option>';
//             (clsRes.items||[]).forEach(c => {
//               const opt = document.createElement('option');
//               opt.value = c._id;
//               opt.textContent = c.name + (c.classId ? (' ('+c.classId+')') : '');
//               if(profile.classId && (profile.classId._id ? profile.classId._id === c._id : profile.classId === c._id)) opt.selected = true;
//               sel.appendChild(opt);
//             });
//           }catch(e){ console.warn('load classes', e); }
//         })();
//       } else if (role === 'teacher') {
//         (async ()=> {
//           try{
//             const [clsRes, subRes] = await Promise.all([ apiFetch('/classes?search='), apiFetch('/subjects?search=') ]);
//             const sel = document.getElementById('p-classIds');
//             sel.innerHTML = '';
//             (clsRes.items||[]).forEach(c => {
//               const opt = document.createElement('option');
//               opt.value = c._id;
//               opt.textContent = c.name + (c.classId ? (' ('+c.classId+')') : '');
//               if((profile.classIds||[]).some(id => String(id._id || id) === String(c._id))) opt.selected = true;
//               sel.appendChild(opt);
//             });
//             const ssel = document.getElementById('p-subjectIds');
//             ssel.innerHTML = '';
//             (subRes.items||[]).forEach(s => {
//               const opt = document.createElement('option');
//               opt.value = s._id;
//               opt.textContent = s.name + (s.subjectId ? (' ('+s.subjectId+')') : '');
//               if((profile.subjectIds||[]).some(id => String(id._id || id) === String(s._id))) opt.selected = true;
//               ssel.appendChild(opt);
//             });
//           }catch(e){ console.warn('load classes/subjects', e); }
//         })();
//       }

//       document.getElementById('p-cancel').addEventListener('click', closeModal);
//       document.getElementById('p-save').addEventListener('click', async ()=> {
//         const fullname = document.getElementById('p-fullname').value.trim();
//         const phone = document.getElementById('p-phone').value.trim();
//         const photoInput = document.getElementById('p-photo');

//         try{
//           if(photoInput && photoInput.files && photoInput.files.length > 0){
//             const fd = new FormData();
//             fd.append('fullname', fullname);
//             fd.append('phone', phone);
//             if(role === 'student') {
//               const classId = document.getElementById('p-classId')?.value;
//               if(classId) fd.append('classId', classId);
//             } else if (role === 'teacher') {
//               const classIds = Array.from(document.getElementById('p-classIds').selectedOptions).map(o=> o.value);
//               const subjectIds = Array.from(document.getElementById('p-subjectIds').selectedOptions).map(o=> o.value);
//               const salary = document.getElementById('p-salary')?.value;
//               classIds.forEach(id => fd.append('classIds', id));
//               subjectIds.forEach(id => fd.append('subjectIds', id));
//               if(salary) fd.append('salary', salary);
//             }
//             fd.append('photo', photoInput.files[0]);

//             // use PUT with multipart via fetch (apiUpload uses POST)
//             const headers = {};
//             if(getToken()) headers['Authorization'] = 'Bearer ' + getToken();
//             const base = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000' : '';
//             const response = await fetch(base + '/api/profile', { method: 'PUT', headers, body: fd });
//             const ct = response.headers.get('content-type') || '';
//             if (ct.includes('application/json')) await response.json();
//             else {
//               const txt = await response.text();
//               throw new Error(txt.slice(0,300));
//             }
//           } else {
//             // JSON PUT
//             const payload = { fullname, phone };
//             if(role === 'student') {
//               const classId = document.getElementById('p-classId')?.value;
//               if(classId) payload.classId = classId;
//             } else if (role === 'teacher') {
//               payload.classIds = Array.from(document.getElementById('p-classIds').selectedOptions).map(o=> o.value);
//               payload.subjectIds = Array.from(document.getElementById('p-subjectIds').selectedOptions).map(o=> o.value);
//               payload.salary = Number(document.getElementById('p-salary')?.value || 0);
//             }
//             await apiFetch('/profile', { method: 'PUT', body: payload });
//           }

//           alert('Profile updated');
//           closeModal();
//           await loadProfile();
//         }catch(err){
//           console.error('save profile err', err);
//           alert('Failed to update profile: ' + (err.message || 'server error'));
//         }
//       });

//     }catch(err){
//       console.error('openEditProfileModal err', err);
//       alert('Failed to open edit form: ' + (err.message || 'server error'));
//     }
//   })();
// }

// function openChangePasswordModal(){
//   const node = document.createElement('div');
//   node.innerHTML = `
//     <h3>Change Password</h3>
//     <label>Current password</label><input id="pw-current" type="password" /><br/>
//     <label>New password</label><input id="pw-new" type="password" /><br/>
//     <label>Confirm new</label><input id="pw-new2" type="password" /><br/>
//     <div style="margin-top:10px"><button id="pw-save" class="btn">Change</button> <button id="pw-cancel" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button></div>
//   `;
//   showModal(node);

//   document.getElementById('pw-cancel').addEventListener('click', closeModal);
//   document.getElementById('pw-save').addEventListener('click', async ()=>{
//     const cur = document.getElementById('pw-current').value;
//     const nw = document.getElementById('pw-new').value;
//     const nw2 = document.getElementById('pw-new2').value;
//     if(!cur || !nw) return alert('Both fields required');
//     if(nw !== nw2) return alert('Passwords do not match');
//     try{
//       await apiFetch('/profile/password', { method: 'POST', body: { current: cur, password: nw } });
//       alert('Password changed — you may need to re-login');
//       closeModal();
//     }catch(err){
//       console.error('change password err', err);
//       alert('Failed to change password: ' + (err.message || 'server error'));
//     }
//   });
// }


/* frontend/attendance.js
   Complete frontend attendance module. Depends on:
   apiFetch, tpl, showModal, closeModal, showToast, escapeHtml,
   getCurrentUser, getUserRole, getUserFullname, SERVER_BASE, app
*/

///////////////////////
// Local helpers (client)
///////////////////////
function _persistLastSaved(classId, payload) {
  try { localStorage.setItem('attendance_last_' + classId, JSON.stringify(payload)); } catch (e) {}
}
function _readLastSaved(classId) {
  try { const raw = localStorage.getItem('attendance_last_' + classId); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

// frontend/js/attendance.js
// Requires existing global helpers:
// apiFetch(path, opts), getCurrentUser(force), getUserRole(), tpl(id), app, escapeHtml(), showModal(), closeModal(), showToast(), SERVER_BASE, getUserFullname()

/* --- small local helpers --- */
function _persistLastSaved(classId, obj) {
  try { localStorage.setItem('attendance_last_' + classId, JSON.stringify(obj || {})); } catch (e) { /* ignore */ }
}
function _readLastSaved(classId) {
  try { const s = localStorage.getItem('attendance_last_' + classId); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

/**
 * If the current user is a parent, prefer returning childId; otherwise return current user id.
 */
function getActorId() {
  const me = window.__CURRENT_USER || null;
  if (me && (me.role || '').toLowerCase() === 'parent') {
    return String(me.childId || me.child || me.childStudent || localStorage.getItem('user_childId') || '');
  }
  return me && (me._id || me.id) ? String(me._id || me.id) : null;
}

/**
 * Fetch student by numberId using the students search endpoint (best-effort).
 * Returns student object or null.
 */
async function fetchStudentByNumberId(numberId) {
  if (!numberId) return null;
  try {
    // Try a search endpoint; adapt to your API shape
    const r = await apiFetch('/students?search=' + encodeURIComponent(numberId));
    const items = (r && r.items) ? r.items : (Array.isArray(r) ? r : []);
    const found = items.find(s => String(s.numberId) === String(numberId) || String(s._id) === String(numberId));
    return found || (items.length ? items[0] : null);
  } catch (e) {
    console.warn('fetchStudentByNumberId: search failed', e);
    return null;
  }
}

/* --------------------------
   Main renderAttendance entry
   -------------------------- */
async function renderAttendance() {
  const role = getUserRole();
  app.innerHTML = '';
  const node = tpl('attendance');
  if (!node) { app.innerHTML = '<div class="page"><h2>Attendance</h2><p>Missing template "attendance".</p></div>'; return; }
  app.appendChild(node);

  const btnCards = document.getElementById('att-view-cards');
  const btnList = document.getElementById('att-view-list');
  const cardsContainer = document.getElementById('attendance-cards');
  const listControls = document.getElementById('attendance-controls');
  const listArea = document.getElementById('attendance-list');
  const studentView = document.getElementById('attendance-student-view');

  if (btnCards) btnCards.addEventListener('click', () => { if (cardsContainer) cardsContainer.style.display='block'; if (listControls) listControls.style.display='none'; if (listArea) listArea.style.display='none'; });
  if (btnList) btnList.addEventListener('click', () => { if (cardsContainer) cardsContainer.style.display='none'; if (listControls) listControls.style.display='block'; if (listArea) listArea.style.display='block'; });

  // defaults
  if (cardsContainer) cardsContainer.style.display='block';
  if (listControls) listControls.style.display='none';
  if (listArea) listArea.style.display='none';
  if (studentView) studentView.style.display='none';

  // if parent -> show their child's attendance
  if (role === 'parent') {
    if (cardsContainer) cardsContainer.style.display='none';
    if (listControls) listControls.style.display='none';
    if (listArea) listArea.style.display='none';
    if (studentView) studentView.style.display='block';
    await renderParentChildAttendanceOverview();
    return;
  }

  // if student -> normal student view
  if (role === 'student') {
    if (cardsContainer) cardsContainer.style.display='none';
    if (listControls) listControls.style.display='none';
    if (listArea) listArea.style.display='none';
    if (studentView) studentView.style.display='block';
    await renderStudentAttendanceOverview();
    return;
  }

  // default for teacher/manager/admin -> class cards
  if (cardsContainer) cardsContainer.style.display='block';
  if (studentView) studentView.style.display='none';
  await populateAttendanceClassCards();
}

/* --------------------------
   Parent: show child attendance
   -------------------------- */
async function renderParentChildAttendanceOverview() {
  const container = document.getElementById('attendance-student-view');
  if (!container) return;
  container.style.display = 'block';
  container.innerHTML = '<div>Loading your child\'s attendance…</div>';

  try {
    const me = await getCurrentUser();
    if (!me) {
      container.innerHTML = '<div class="muted">Not authenticated.</div>';
      return;
    }

    // Prefer childId from token/current user cache
    let childId = me.childId || me.child || me.childStudent || localStorage.getItem('user_childId') || null;
    let childNumberId = me.childNumberId || me.childNumber || localStorage.getItem('user_childNumberId') || null;

    let studentRecord = null;

    // Try childId lookup first
    if (childId) {
      try {
        const r = await apiFetch('/students/' + encodeURIComponent(childId));
        studentRecord = r && (r.student || r) ? (r.student || r) : null;
      } catch (e) {
        console.warn('Could not fetch student by childId (maybe forbidden) - will try numberId', e);
        studentRecord = null;
      }
    }

    // Try numberId search
    if (!studentRecord && childNumberId) {
      studentRecord = await fetchStudentByNumberId(childNumberId);
    }

    // As last resort try actor id
    if (!studentRecord) {
      const actor = getActorId();
      if (actor) {
        try {
          const r = await apiFetch('/students/' + encodeURIComponent(actor));
          studentRecord = r && (r.student || r) ? (r.student || r) : null;
        } catch (e) { /* ignore */ }
      }
    }

    if (!studentRecord) {
      container.innerHTML = `<div class="muted">We couldn't locate your child record automatically. Please contact the school admin to link your parent account to the student, or ensure your parent account token includes childNumberId/childId.</div>`;
      return;
    }

    const studentId = studentRecord._id;
    const studentNumberId = studentRecord.numberId || '';

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h3 style="margin:0">${escapeHtml(studentRecord.fullname || 'Child')}</h3>
          <div class="muted">ID: ${escapeHtml(studentNumberId || studentId)}</div>
        </div>
        <div style="text-align:right">
          <div class="muted">Viewing attendance as parent</div>
        </div>
      </div>
      <div id="parent-child-att-controls" style="margin-top:12px"></div>
      <div id="parent-child-att-summary" style="margin-top:12px"></div>
    `;

    const ctrl = document.getElementById('parent-child-att-controls');
    ctrl.innerHTML = `<label>Subject</label> <select id="parent-att-subject" style="min-width:220px;padding:6px;border-radius:6px;border:1px solid #ddd"><option value="">All subjects</option></select>`;

    // load subjects (best-effort)
    let subjects = [];
    try {
      const sr = await apiFetch('/subjects?search=');
      subjects = sr.items || [];
      const sel = document.getElementById('parent-att-subject');
      subjects.forEach(s => {
        const opt = document.createElement('option'); opt.value = s._id; opt.text = s.name || s.title || s._id;
        sel.appendChild(opt);
      });
    } catch (e) { /* ignore */ }

    async function loadChildSummary() {
      const sel = document.getElementById('parent-att-subject');
      const subjectId = sel ? sel.value : '';
      const wrap = document.getElementById('parent-child-att-summary');
      wrap.innerHTML = 'Loading…';
      try {
        let res;
        try {
          res = await apiFetch(`/attendances/summary/student/${encodeURIComponent(studentId)}${subjectId ? '?subjectId=' + encodeURIComponent(subjectId) : ''}`);
        } catch (e) {
          res = await apiFetch(`/attendances/summary?studentId=${encodeURIComponent(studentId)}${subjectId ? '&subjectId=' + encodeURIComponent(subjectId) : ''}`);
        }

        const items = (res && res.items) ? res.items : [];
        if (!items || items.length === 0) {
          wrap.innerHTML = '<p>No attendance records yet.</p>';
          return;
        }

        if (!subjectId) {
          const totals = items.reduce((acc, it) => {
            acc.totalPeriods += Number(it.totalPeriods || 0);
            acc.presentCount += Number(it.presentCount || 0);
            acc.absentCount += Number(it.absentCount || 0);
            acc.totalDurationPresent += Number(it.totalDurationPresent || 0);
            if (it.lastUpdate) acc.lastDates.push(new Date(it.lastUpdate));
            return acc;
          }, { totalPeriods: 0, presentCount: 0, absentCount: 0, totalDurationPresent: 0, lastDates: [] });

          const out = document.createElement('div');
          out.style.display = 'grid';
          out.style.gap = '8px';

          const pct = totals.totalPeriods > 0 ? Math.round((totals.presentCount / totals.totalPeriods) * 10000) / 100 : 0;
          const totalsHtml = `
            <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:12px;">
              <div style="flex:1">
                <div style="font-weight:700">Summary — All subjects</div>
                <div class="muted">Periods: ${totals.totalPeriods} • Present: ${totals.presentCount} • Absent: ${totals.absentCount} ${totals.totalDurationPresent ? '• ' + totals.totalDurationPresent + ' mins' : ''}</div>
              </div>
              <div style="text-align:right;min-width:110px"><div style="font-size:20px;font-weight:800">${pct}%</div><div class="muted" style="font-size:12px">Average present</div></div>
            </div>
          `;
          const totalsNode = document.createElement('div'); totalsNode.innerHTML = totalsHtml;
          out.appendChild(totalsNode);

          const list = document.createElement('div');
          list.style.display = 'grid';
          list.style.gridTemplateColumns = 'repeat(auto-fit,minmax(220px,1fr))';
          list.style.gap = '8px';

          items.forEach(it => {
            const ipct = it.totalPeriods > 0 ? Math.round((Number(it.presentCount || 0) / Number(it.totalPeriods || 0)) * 10000) / 100 : 0;
            const block = document.createElement('div');
            block.className = 'card';
            block.style.padding = '10px';
            block.innerHTML = `<div style="font-weight:700">${escapeHtml(it.subjectName || 'Subject')}</div><div class="muted">Periods: ${it.totalPeriods} • Present: ${it.presentCount} • Absent: ${it.absentCount}</div><div style="margin-top:8px;font-weight:700">${ipct}%</div>`;
            list.appendChild(block);
          });

          out.appendChild(list);
          wrap.innerHTML = ''; wrap.appendChild(out);
        } else {
          wrap.innerHTML = '';
          items.forEach(it => {
            const pct = Math.round((it.percent || 0) * 100) / 100;
            const color = pct < 25 ? 'color:#ef4444' : '';
            const last = it.lastUpdate ? new Date(it.lastUpdate).toLocaleString() : '—';
            const dur = it.totalDurationPresent ? `${it.totalDurationPresent} mins` : '';
            const block = document.createElement('div');
            block.className = 'card';
            block.style.marginBottom = '8px';
            block.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div style="font-weight:600">${escapeHtml(it.subjectName || 'Subject')}</div>
                  <div class="muted" style="font-size:13px">Periods: ${it.totalPeriods} • Present: ${it.presentCount} • Absent: ${it.absentCount} ${dur ? '• ' + dur : ''}</div>
                </div>
                <div style="text-align:right">
                  <div style="${color};font-weight:700">${(pct || 0)}%</div>
                  <div class="muted" style="font-size:12px">Last: ${escapeHtml(last)}</div>
                </div>
              </div>
            `;
            wrap.appendChild(block);
          });
        }
      } catch (err) {
        console.error('loadChildSummary err', err);
        wrap.innerHTML = `<p style="color:#b91c1c">Failed to load attendance (${escapeHtml(err && err.message ? err.message : 'server error')}).</p>`;
        showToast('Failed to load child attendance', 'error');
      }
    }

    document.getElementById('parent-att-subject')?.addEventListener('change', loadChildSummary);
    await loadChildSummary();

  } catch (err) {
    console.error('renderParentChildAttendanceOverview err', err);
    container.innerHTML = `<p style="color:#b91c1c">Failed to load child attendance (${escapeHtml(err && err.message ? err.message : 'server error')}).</p>`;
  }
}

/* --------------- copied class/teacher/admin flows (no change) ----------------
   populateAttendanceClassCards, openClassAttendanceModal, loadClassAttendanceSummary,
   showAttendanceHistoryModal, renderStudentAttendanceOverview
   (These functions are identical to your supplied code, slightly adapted to be in this module.)
   For brevity I include them inline. If you already have them in your bundle, you can skip redefining.
   --------------------------------------------------------------------------- */

/* Paste the same functions from your code block (populateAttendanceClassCards, openClassAttendanceModal,
   loadClassAttendanceSummary, showAttendanceHistoryModal, renderStudentAttendanceOverview)
   They are long and were already authored by you; below I reuse them (no logic change). */

/* --- For simplicity here, re-use the large implementations you provided earlier --- */
/* Insert the implementations of:
   - populateAttendanceClassCards()
   - openClassAttendanceModal()
   - loadClassAttendanceSummary()
   - showAttendanceHistoryModal()
   - renderStudentAttendanceOverview()
   (They appear in your previous message and are compatible with this module.)
*/

/* If you prefer, paste the long functions you already have into this file in place of this comment. */


/* ----------------
   populateAttendanceClassCards
   ---------------- */
async function populateAttendanceClassCards() {
  const container = document.getElementById('attendance-cards');
  if (!container) return;
  container.innerHTML = 'Loading classes...';

  try {
    let classes = [];
    const role = getUserRole();

    if (role === 'teacher') {
      const tres = await apiFetch('/teachers?search=');
      const t = (tres.items && tres.items[0]) || null;
      const teacherClassIds = new Set((t && t.classIds) ? (t.classIds.map(x => String((x && x._id) ? x._id : x))) : []);

      const cr = await apiFetch('/classes?search=');
      const all = cr.items || [];
      if (teacherClassIds.size > 0) {
        classes = all.filter(c => teacherClassIds.has(String(c._id)));
      } else {
        classes = [];
      }
    } else {
      const cr = await apiFetch('/classes?search=');
      classes = cr.items || [];
    }

    if (!classes || classes.length === 0) { container.innerHTML = '<p>No classes available.</p>'; return; }

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'att-card-grid';
    container.appendChild(grid);

    for (const c of classes) {
      const card = document.createElement('div');
      card.className = 'card att-card';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600">${escapeHtml(c.name || '')}</div>
            <div class="muted" style="font-size:13px">${escapeHtml(c.classId || '')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;color:#6b7280">Students: <span id="card-count-${c._id}">...</span></div>
            <div style="margin-top:8px">
              <button class="btn small" data-id="${c._id}" data-action="open">Open</button>
              <button class="btn small" data-id="${c._id}" data-action="history" style="margin-left:6px">History</button>
            </div>
          </div>
        </div>
        <div id="card-summary-${c._id}" style="margin-top:12px"></div>
      `;
      grid.appendChild(card);

      const openBtn = card.querySelector('button[data-action="open"]');
      const histBtn = card.querySelector('button[data-action="history"]');
      if (openBtn) openBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); openClassAttendanceModal(c); });
      if (histBtn) histBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); showAttendanceHistoryModal(c._id); });

      // load counts + summary + last-saved
      (async (classId) => {
        try {
          const stRes = await apiFetch('/students/class/' + classId);
          const count = (stRes.items || []).length;
          const el = document.getElementById('card-count-' + classId);
          if (el) el.textContent = count;

          const sumRes = await apiFetch('/attendances/summary/class/' + classId);
          const items = sumRes.items || [];
          const summaryEl = document.getElementById('card-summary-' + classId);
          if (summaryEl) {
            if (!items || items.length === 0) summaryEl.innerHTML = '<div class="muted" style="font-size:13px">No attendance data</div>';
            else {
              const list = document.createElement('div');
              list.style.fontSize = '13px';
              list.innerHTML = items.slice(0,4).map(it => {
                const pct = Math.round((it.percent || 0) * 100) / 100;
                const color = pct < 25 ? 'color:#ef4444' : '';
                const photo = it.photoUrl ? `<img src="${encodeURI(it.photoUrl)}" style="width:28px;height:28px;border-radius:6px;object-fit:cover;margin-right:8px"/>` : '';
                return `<div style="display:flex;align-items:center;margin-bottom:6px">
                          ${photo}
                          <div style="flex:1"><div>${escapeHtml(it.fullname || '')}</div>
                           <div class="muted" style="font-size:12px">${escapeHtml(it.numberId||'')}</div></div>
                          <div style="min-width:64px;text-align:right"><strong style="${color}">${Math.round(it.percent) || 0}%</strong></div>
                        </div>`;
              }).join('');
              summaryEl.innerHTML = '';
              summaryEl.appendChild(list);
            }
          }

          // restore persisted last-saved if present
          const p = _readLastSaved(classId);
          if (p && summaryEl) {
            const cardLastId = 'card-last-saved-' + classId;
            const existing = document.getElementById(cardLastId);
            if (existing) existing.remove();
            const humanTs = p.ts ? new Date(p.ts).toLocaleString() : '';
            const html = `<div id="${cardLastId}" class="muted" style="font-size:12px;margin-top:8px">
                            Last saved by ${escapeHtml(p.teacherName || '')} • ${escapeHtml(p.subjName || '')} • ${escapeHtml(p.date || '')} • ${escapeHtml(humanTs)}
                          </div>`;
            summaryEl.insertAdjacentHTML('afterend', html);
          }
        } catch (e) {
          try { document.getElementById('card-count-' + classId).textContent = '?'; } catch(e){}
        }
      })(c._id);
    }
  } catch (err) {
    console.error('populateAttendanceClassCards err', err);
    container.innerHTML = '<p>Failed to load classes</p>';
    showToast('Failed to load classes','error');
  }
}

/* ----------------
   Open class modal: create/edit attendance
   - supports filtering subjects to those teacher actually teaches (teacher.subjectIds)
   - supports edit-by-id (if opts.attendanceId provided)
   ---------------- */
async function openClassAttendanceModal(classObj, opts = {}) {
  const classId = classObj._id || classObj;
  const isManager = (getUserRole() === 'manager');
  const modal = document.createElement('div');
  modal.style.maxWidth = '920px';
  modal.innerHTML = `
    <h3>Attendance — ${escapeHtml(classObj.name || '')} ${escapeHtml(classObj.classId || '')}</h3>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <div>
        <label>Subject</label>
        <select id="att-subject-select" style="min-width:220px"><option>Loading subjects...</option></select>
      </div>
      <div>
        <label>Date</label>
        <input id="att-date" type="date" value="${new Date().toISOString().slice(0,10)}" />
      </div>
      <div style="margin-left:auto">
        <button id="att-all-present" class="btn">All present</button>
        ${isManager ? '<button id="att-clear-all" class="btn" style="background:#ef4444;color:#fff;margin-left:8px">Clear All</button>' : ''}
      </div>
    </div>
    <div id="att-students-list" style="max-height:420px;overflow:auto"></div>
    <div style="margin-top:12px;text-align:right">
      <button id="att-save" class="btn">Save</button>
      <button id="att-cancel" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
    </div>
    <div id="att-msg" style="margin-top:8px;color:#064e3b;display:none"></div>
  `;
  showModal(modal);

  const subjSel = modal.querySelector('#att-subject-select');
  const dateInput = modal.querySelector('#att-date');
  const listDivRoot = modal.querySelector('#att-students-list');
  const btnAllPresent = modal.querySelector('#att-all-present');
  const btnSave = modal.querySelector('#att-save');
  const btnCancel = modal.querySelector('#att-cancel');
  const btnClearAll = modal.querySelector('#att-clear-all');
  const msgEl = modal.querySelector('#att-msg');

  modal.dataset.attendanceId = opts.attendanceId || '';
  modal.dataset.editMode = opts.attendanceId ? '1' : '';

  // Load subjects for the class, then filter to teacher.subjectIds if role=teacher
  subjSel.innerHTML = '';
  let subjects = [];
  try {
    const sr = await apiFetch('/subjects?classId=' + encodeURIComponent(classId));
    subjects = sr.items || [];

    if (getUserRole() === 'teacher') {
      try {
        const me = (await getCurrentUser())._id;
        let tr;
        try { tr = await apiFetch('/teachers?search=' + encodeURIComponent(me)); } catch(e) { tr = await apiFetch('/teachers?search='); }
        const t = (tr && tr.items && tr.items.length) ? tr.items.find(x => String(x._id) === String(me)) || tr.items[0] : (tr.items && tr.items[0]) || null;
        if (t) {
          const teacherSubjectIdSet = new Set((t.subjectIds || []).map(x => String(x)));
          // also consider t.subjects or t.assignments shapes if present
          if (Array.isArray(t.subjects)) {
            (t.subjects || []).forEach(s => {
              if (!s) return;
              if (typeof s === 'string' || typeof s === 'number') teacherSubjectIdSet.add(String(s));
              else {
                const sid = s.subjectId || s._id || null;
                const cid = s.classId || s.class || null;
                if (sid && (!cid || String(cid) === String(classId))) teacherSubjectIdSet.add(String(sid));
              }
            });
          }
          if (Array.isArray(t.assignments)) {
            (t.assignments || []).forEach(a => {
              const sid = a.subjectId || a.subject || (a._id ? a._id : null);
              const cid = a.classId || a.class || a.classId;
              if (sid && (!cid || String(cid) === String(classId))) teacherSubjectIdSet.add(String(sid));
            });
          }

          if (teacherSubjectIdSet.size > 0) {
            const filtered = (subjects || []).filter(s => teacherSubjectIdSet.has(String(s._id)));
            if (filtered.length > 0) subjects = filtered;
          }
        }
      } catch (e) {
        console.warn('Could not fetch teacher record to filter subjects', e);
      }
    }

    if (!subjects || subjects.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.text = 'No subjects';
      subjSel.appendChild(opt);
    } else {
      subjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s._id;
        opt.text = s.name || s.title || ('Subject ' + s._id);
        subjSel.appendChild(opt);
      });
      subjSel.value = subjects[0]._id;
    }
  } catch (e) {
    subjSel.innerHTML = '<option value="">(failed to load subjects)</option>';
    console.warn('Could not load subjects for class', e);
  }

  // Render student rows
  function renderStudentRows(students, presentMap = {}, durationMap = {}) {
    if (!students || students.length === 0) {
      listDivRoot.innerHTML = '<p>No students in this class</p>';
      return;
    }
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '1fr';
    wrap.style.gap = '6px';

    students.forEach(s => {
      const photo = s.photoUrl ? (s.photoUrl.startsWith('http') ? s.photoUrl : SERVER_BASE + s.photoUrl) : '';
      const checked = presentMap[String(s._id)] ? 'checked' : '';
      const dur = durationMap[String(s._id)] || '';

      const row = document.createElement('div');
      row.className = 'card';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '12px';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '12px';
      left.innerHTML = `
        <div style="width:56px;height:56px;border-radius:8px;overflow:hidden;background:#f3f4f6;flex-shrink:0">
          ${photo ? `<img src="${encodeURI(photo)}" style="width:100%;height:100%;object-fit:cover"/>` : `<div style="padding:8px;color:#94a3b8">No photo</div>`}
        </div>
        <div>
          <div style="font-weight:600">${escapeHtml(s.fullname || '')}</div>
          <div class="muted" style="font-size:12px">${escapeHtml(s.numberId || '')}</div>
        </div>
      `;

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '10px';
      right.innerHTML = `
        <label style="font-size:14px"><input type="checkbox" class="att-checkbox" data-id="${s._id}" ${checked} /> Present</label>
        <div style="display:flex;flex-direction:column;align-items:flex-end">
          <input type="number" class="att-duration" data-id="${s._id}" placeholder="mins" value="${dur}" style="width:72px"/>
          <div style="font-size:11px;color:#6b7280">duration (mins)</div>
        </div>
      `;

      row.appendChild(left);
      row.appendChild(right);
      wrap.appendChild(row);
    });

    listDivRoot.innerHTML = '';
    listDivRoot.appendChild(wrap);

    if (btnAllPresent) btnAllPresent.onclick = () => wrap.querySelectorAll('.att-checkbox').forEach(cb => cb.checked = true);
  }

  // Load students & existing attendance for date+subject
  async function loadForDate(avoidFetchExisting=false) {
    const date = dateInput.value;
    const subjectId = subjSel.value;
    listDivRoot.innerHTML = 'Loading students...';
    try {
      const stRes = await apiFetch('/students/class/' + classId);
      const students = stRes.items || [];

      let existing = null;
      // If presetAttendance provided and matches class/date/subject, use it
      if (opts.presetAttendance && String(opts.presetAttendance.classId) === String(classId) && String((opts.presetAttendance.date||'').slice(0,10)) === String(date)) {
        if ((!opts.presetAttendance.subjectId && !subjectId) || String(opts.presetAttendance.subjectId) === String(subjectId)) {
          existing = opts.presetAttendance;
        }
      }

      if (!existing && !avoidFetchExisting) {
        const q = `/attendances?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}${subjectId ? '&subjectId=' + encodeURIComponent(subjectId) : ''}`;
        const attRes = await apiFetch(q);
        existing = attRes.attendance || null;
      }

      const presentMap = {};
      const durationMap = {};
      if (existing && existing.records) {
        existing.records.forEach(r => {
          presentMap[String(r.studentId)] = !!r.present;
          durationMap[String(r.studentId)] = Number(r.durationMinutes || 0);
        });
        if (existing._id) modal.dataset.attendanceId = existing._id;
      } else {
        modal.dataset.attendanceId = '';
      }

      renderStudentRows(students, presentMap, durationMap);
    } catch (e) {
      console.error('loadForDate err', e);
      listDivRoot.innerHTML = '<p>Failed to load students</p>';
    }
  }

  // If opening edit mode by attendanceId, fetch that attendance first
  if (opts.attendanceId) {
    try {
      const attRes = await apiFetch('/attendances/' + encodeURIComponent(opts.attendanceId));
      if (attRes && attRes.attendance) {
        const att = attRes.attendance;
        if (att.date) dateInput.value = (att.date || '').slice(0,10);
        if (typeof att.subjectId !== 'undefined' && att.subjectId !== null && att.subjectId !== '') {
          if (![...subjSel.options].some(o => o.value === String(att.subjectId))) {
            const opt = document.createElement('option');
            opt.value = att.subjectId;
            opt.text = att.subjectName || att.subjectId;
            subjSel.appendChild(opt);
          }
          subjSel.value = String(att.subjectId || '');
        }
        opts.presetAttendance = att;
      }
    } catch (e) {
      console.warn('Could not fetch attendance by id for edit', e);
    }
  }

  await loadForDate();

  // handlers
  dateInput.addEventListener('change', () => loadForDate());
  subjSel.addEventListener('change', () => loadForDate());
  if (btnCancel) btnCancel.addEventListener('click', () => closeModal());

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      try {
        const date = dateInput.value;
        const subjectId = subjSel.value || null;
        const wrap = listDivRoot;
        const checkboxes = wrap.querySelectorAll('.att-checkbox');
        const records = Array.from(checkboxes).map(cb => {
          const id = cb.dataset.id;
          const durEl = wrap.querySelector('.att-duration[data-id="' + id + '"]');
          return {
            studentId: id,
            present: !!cb.checked,
            durationMinutes: durEl ? Number(durEl.value || 0) : 0
          };
        });

        const body = { classId, subjectId, date, records };
        if (modal.dataset.attendanceId) body._id = modal.dataset.attendanceId;

        const res = await apiFetch('/attendances', { method: 'POST', body });
        showToast('Attendance saved', 'success', 3000);

        // refresh summary under card
        await loadClassAttendanceSummary(classId);

        // refresh history (if modal open) - optional

        // persist last-saved metadata and show it
        const subjName = (subjSel.options[subjSel.selectedIndex] && subjSel.options[subjSel.selectedIndex].text) || (subjectId || '—');
        const teacherName = getUserFullname() || 'You';
        const ts = new Date().toISOString();
        _persistLastSaved(classId, { teacherName, subjName, date, ts });

        const cardLastId = 'card-last-saved-' + classId;
        const summaryEl = document.getElementById('card-summary-' + classId);
        if (summaryEl) {
          const existing = document.getElementById(cardLastId);
          if (existing) existing.remove();
          const humanTs = new Date(ts).toLocaleString();
          const html = `<div id="${cardLastId}" class="muted" style="font-size:12px;margin-top:8px">
                          Last saved by ${escapeHtml(teacherName)} • ${escapeHtml(subjName)} • ${escapeHtml(date)} • ${escapeHtml(humanTs)}
                        </div>`;
          summaryEl.insertAdjacentHTML('afterend', html);
        }

        if (msgEl) { msgEl.style.display = 'block'; msgEl.innerText = `Saved ${records.length} records — ${new Date().toLocaleString()}`; }
      } catch (err) {
        console.error('save attendance err', err);
        const hint = (err && err.message && err.message.indexOf('unique') !== -1) ? ' (duplicate — try edit)' : '';
        showToast('Failed to save attendance: ' + (err && err.message ? err.message : 'server error') + hint, 'error');
      }
    });
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (!confirm('Are you sure? This will permanently delete all attendance records for this class and selected subject.')) return;
      if (!confirm('Please confirm again: delete all attendance for this class and subject?')) return;
      try {
        const subjectId = subjSel.value || null;
        const res = await apiFetch('/attendances/clear', { method: 'POST', body: { classId, subjectId } });
        showToast(`Attendance cleared (${res.deletedCount || 0})`, 'success');
        try { localStorage.removeItem('attendance_last_' + classId); } catch(e){}
        await loadForDate(true);
        await loadClassAttendanceSummary(classId);
      } catch (err) {
        console.error('clear attendance err', err);
        showToast('Failed to clear attendance: ' + (err && err.message ? err.message : 'server error'), 'error');
      }
    });
  }
}

/* ----------------
   loadClassAttendanceSummary
   ---------------- */
async function loadClassAttendanceSummary(classId, subjectId = null) {
  try {
    const cardSummary = document.getElementById('card-summary-' + classId);
    if (!cardSummary) return [];
    cardSummary.innerHTML = 'Loading summary...';

    let url = '/attendances/summary/class/' + encodeURIComponent(classId);
    if (typeof subjectId !== 'undefined' && subjectId !== null) url += '?subjectId=' + encodeURIComponent(subjectId);

    const res = await apiFetch(url);
    const items = (res && res.items) ? res.items : [];
    if (!items || items.length === 0) {
      cardSummary.innerHTML = '<div class="muted" style="font-size:13px">No attendance data</div>';
      return items;
    }

    const list = document.createElement('div');
    list.style.fontSize = '13px';

    items.slice(0, 20).forEach(it => {
      const pct = (typeof it.percent === 'number') ? Number(it.percent) : (it.percent ? Number(it.percent) : 0);
      const pctDisplay = Math.round(pct * 100) / 100;
      const isLow = pctDisplay < 25;

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.marginBottom = '6px';

      const photoWrap = document.createElement('div');
      photoWrap.style.marginRight = '8px';
      if (it.photoUrl) {
        const img = document.createElement('img');
        img.src = it.photoUrl.startsWith('http') ? it.photoUrl : (SERVER_BASE + it.photoUrl);
        img.style.width = '28px';
        img.style.height = '28px';
        img.style.borderRadius = '6px';
        img.style.objectFit = 'cover';
        img.style.marginRight = '8px';
        photoWrap.appendChild(img);
      }
      row.appendChild(photoWrap);

      const main = document.createElement('div');
      main.style.flex = '1';
      const nameDiv = document.createElement('div');
      nameDiv.innerText = it.fullname || (it.numberId || 'Unknown');
      main.appendChild(nameDiv);

      const meta = document.createElement('div');
      meta.className = 'muted';
      meta.style.fontSize = '12px';
      const periods = Number(it.totalPeriods || 0);
      const present = Number(it.presentCount || 0);
      const absent = Number(it.absentCount || 0);
      const dur = Number(it.totalDurationPresent || 0);
      const lastStr = it.lastUpdate ? ` • last ${new Date(it.lastUpdate).toLocaleDateString()}` : '';
      meta.innerText = `${it.numberId || ''} • Periods: ${periods} • Present: ${present} • Absent: ${absent}${dur ? ' • ' + dur + ' mins' : ''}${lastStr}`;
      main.appendChild(meta);

      row.appendChild(main);

      const pctDiv = document.createElement('div');
      pctDiv.style.minWidth = '72px';
      pctDiv.style.textAlign = 'right';
      const pctStrong = document.createElement('strong');
      pctStrong.innerText = `${pctDisplay || 0}%`;
      if (isLow) pctStrong.style.color = '#ef4444';
      pctDiv.appendChild(pctStrong);

      row.appendChild(pctDiv);
      list.appendChild(row);
    });

    cardSummary.innerHTML = '';
    cardSummary.appendChild(list);

    const p = _readLastSaved(classId);
    if (p) {
      const cardLastId = 'card-last-saved-' + classId;
      const existing = document.getElementById(cardLastId);
      if (existing) existing.remove();
      const humanTs = p.ts ? new Date(p.ts).toLocaleString() : '';
      const html = `<div id="${cardLastId}" class="muted" style="font-size:12px;margin-top:8px">
                      Last saved by ${escapeHtml(p.teacherName || '')} • ${escapeHtml(p.subjName || '')} • ${escapeHtml(p.date || '')} • ${escapeHtml(humanTs)}
                    </div>`;
      cardSummary.insertAdjacentHTML('afterend', html);
    }

    return items;
  } catch (err) {
    console.error('loadClassAttendanceSummary err', err);
    const el = document.getElementById('card-summary-' + classId);
    if (el) el.innerHTML = '<div class="muted" style="font-size:13px">Failed to load summary</div>';
    return [];
  }
}

/* ----------------
   showAttendanceHistoryModal (view + edit)
   ---------------- */
// frontend: replace showAttendanceHistoryModal with this
async function showAttendanceHistoryModal(classId) {
  const modal = document.createElement('div');
  modal.style.maxWidth = '900px';
  modal.innerHTML = `<h3>Attendance history</h3>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="flex:1"><input id="hist-search" placeholder="Search teacher or date" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px"/></div>
      <div><button id="hist-refresh" class="btn">Refresh</button></div>
      <div id="hist-clear-wrap"></div>
    </div>
    <div id="hist-root">Loading…</div>
    <div style="text-align:right;margin-top:8px"><button id="hist-close" class="btn">Close</button></div>`;
  showModal(modal);

  const root = modal.querySelector('#hist-root');
  const searchEl = modal.querySelector('#hist-search');
  const refreshBtn = modal.querySelector('#hist-refresh');
  const clearWrap = modal.querySelector('#hist-clear-wrap');

  const currentUser = await getCurrentUser(); // await once
  const myId = currentUser ? String(currentUser._id) : null;
  const role = getUserRole();

  if (role === 'manager' || role === 'admin') {
    const clr = document.createElement('button');
    clr.className = 'btn';
    clr.innerText = 'Clear all history';
    clr.style.background = '#ef4444';
    clr.style.color = '#fff';
    clr.addEventListener('click', async () => {
      if (!confirm('Manager: permanently delete ALL attendance for this class?')) return;
      try {
        const result = await apiFetch('/attendances/clear', { method: 'POST', body: { classId } });
        showToast(`Deleted ${result.deletedCount || 0} records`, 'success');
        await loadHistory();
        await loadClassAttendanceSummary(classId);
      } catch (e) {
        console.error('clear all history failed', e);
        showToast('Failed to clear history', 'error');
      }
    });
    clearWrap.appendChild(clr);
  }

  async function loadHistory() {
    root.innerHTML = 'Loading…';
    try {
      const res = await apiFetch('/attendances/history/' + encodeURIComponent(classId));
      const items = res.items || [];
      if (!items || items.length === 0) {
        root.innerHTML = '<p>No attendance records found.</p>';
        return;
      }

      const q = (searchEl && searchEl.value) ? searchEl.value.toLowerCase().trim() : '';

      const wrap = document.createElement('div');
      wrap.style.display = 'grid';
      wrap.style.gap = '8px';

      items.forEach(doc => {
        const teacher = doc.teacherName || (doc.teacherId || '');
        const subject = doc.subjectName || (doc.subjectId || '');
        const dateStr = doc.date || '';
        const combined = `${teacher} ${subject} ${dateStr}`.toLowerCase();
        if (q && combined.indexOf(q) === -1) return;

        const block = document.createElement('div');
        block.className = 'card';
        block.style.padding = '10px';
        block.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div style="flex:1">
              <div style="font-weight:700">${escapeHtml(doc.date || '—')}</div>
              <div class="muted" style="font-size:13px">${escapeHtml(subject || '')} • Teacher: ${escapeHtml(teacher || '—')}</div>
              <div class="muted" style="font-size:12px">Records: ${(doc.records || []).length} • Saved: ${doc.createdAt ? new Date(doc.createdAt).toLocaleString() : (doc.updatedAt ? new Date(doc.updatedAt).toLocaleString() : '—')}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <div><button class="btn small" data-id="${doc._id}" data-action="view">View</button></div>
              <div style="display:flex;gap:6px">
                <button class="btn small" data-id="${doc._id}" data-action="edit">Edit</button>
                ${ (role === 'manager' || (role === 'teacher' && String(doc.teacherId) === myId)) ? `<button class="btn small" data-id="${doc._id}" data-action="delete" style="background:#ef4444;color:#fff">Delete</button>` : '' }
              </div>
            </div>
          </div>
        `;
        wrap.appendChild(block);

        // view
        block.querySelector('button[data-action="view"]').addEventListener('click', () => {
          const recModal = document.createElement('div');
          recModal.style.maxWidth = '700px';
          let recHtml = `<h4>Attendance — ${escapeHtml(doc.date || '')}</h4><div style="max-height:480px;overflow:auto">`;
          (doc.records || []).forEach(r => {
            recHtml += `<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:8px">
                          <div><div style="font-weight:600">${escapeHtml(r.studentName || r.studentId || '')}</div>
                              <div class="muted" style="font-size:12px">${escapeHtml(r.note || '')}</div></div>
                          <div>${r.present ? 'Present' : 'Absent'} ${r.durationMinutes ? '• ' + r.durationMinutes + ' mins' : ''}</div>
                        </div>`;
          });
          recHtml += `</div><div style="text-align:right;margin-top:8px"><button class="btn" id="rec-close">Close</button></div>`;
          recModal.innerHTML = recHtml;
          showModal(recModal);
          recModal.querySelector('#rec-close').addEventListener('click', closeModal);
        });

        // edit
        block.querySelector('button[data-action="edit"]').addEventListener('click', async () => {
          try {
            const attRes = await apiFetch('/attendances/' + encodeURIComponent(doc._id));
            if (attRes && attRes.attendance) {
              closeModal();
              const cls = { _id: attRes.attendance.classId, name: '', classId: '' };
              openClassAttendanceModal(cls, { attendanceId: attRes.attendance._id, presetAttendance: attRes.attendance });
            } else {
              showToast('Attendance not found for editing', 'error');
            }
          } catch (e) {
            console.error('Could not open edit modal', e);
            showToast('Failed to open edit', 'error');
          }
        });

        // delete
        const delBtn = block.querySelector('button[data-action="delete"]');
        if (delBtn) {
          delBtn.addEventListener('click', async () => {
            if (!confirm('Delete this attendance record permanently?')) return;
            try {
              const id = delBtn.dataset.id;
              await apiFetch('/attendances/' + encodeURIComponent(id), { method: 'DELETE' });
              showToast('Attendance deleted', 'success');
              await loadHistory();
              await loadClassAttendanceSummary(classId);
            } catch (e) {
              console.error('delete failed', e);
              showToast('Failed to delete', 'error');
            }
          });
        }
      });

      root.innerHTML = '';
      root.appendChild(wrap);
    } catch (err) {
      console.error('Failed to load history', err);
      const msg = (err && err.message) ? (err.message.indexOf('<') === 0 ? 'Server endpoint not found (404) or server returned HTML' : err.message) : 'Server error';
      root.innerHTML = `<p style="color:#b91c1c">${escapeHtml(msg)}</p>`;
    }
  }

  searchEl.addEventListener('input', () => loadHistory());
  refreshBtn.addEventListener('click', () => loadHistory());

  await loadHistory();

  modal.querySelector('#hist-close').addEventListener('click', closeModal);
}

// Replace your current renderStudentAttendanceOverview with this function
async function renderStudentAttendanceOverview() {
  const container = document.getElementById('attendance-student-view');
  if (!container) return;
  container.style.display = 'block';
  container.innerHTML = '<div>Loading your attendance…</div>';

  try {
    const meUser = await getCurrentUser();
    const me = meUser ? meUser._id : null;

    // Try to fetch student's record (best-effort) so we can optionally limit subjects later
    let studentRecord = null;
    try {
      let sres = null;
      try { sres = await apiFetch('/students?search=' + encodeURIComponent(me)); } catch (e) { sres = await apiFetch('/students?search='); }
      studentRecord = (sres.items && sres.items[0]) || null;
      if (!studentRecord) {
        const sres2 = await apiFetch('/students?search=');
        const students = sres2.items || [];
        studentRecord = (students.find(x => String(x._id) === String(me))) || null;
      }
    } catch (e) {
      console.warn('Could not fetch student record (non-fatal):', e);
    }

    // Load subjects (all). If you prefer to limit to student's classes, replace with per-class fetch logic.
    let subjects = [];
    try {
      const sr = await apiFetch('/subjects?search=');
      subjects = sr.items || [];
    } catch (e) {
      console.warn('Could not fetch subjects list, falling back to empty', e);
      subjects = [];
    }

    // Build UI: default option = All subjects
    container.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div>
          <label>Subject</label>
          <select id="student-att-subject" style="min-width:220px;padding:8px;border:1px solid #ddd;border-radius:6px">
            <option value="">All subjects</option>
            ${subjects.map(s => `<option value="${s._id}">${escapeHtml(s.name || s.title || s._id)}</option>`).join('')}
          </select>
        </div>
        <div style="margin-left:auto">
          <div id="student-last-update" class="muted"></div>
        </div>
      </div>
      <div id="student-att-summary" style="margin-top:12px"></div>
    `;

    const subjSel = document.getElementById('student-att-subject');
    // default is All (empty value). If you want to default to first subject, uncomment next line:
    // if (subjects.length>0) subjSel.value = String(subjects[0]._id);

    // helper for showing a totals card
    function renderTotalsCard({ totalPeriods = 0, presentCount = 0, absentCount = 0, totalDurationPresent = 0 }) {
      const pct = totalPeriods > 0 ? Math.round((presentCount / totalPeriods) * 10000) / 100 : 0;
      return `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:12px;margin-bottom:10px;background:linear-gradient(90deg,#f8fafc,#ffffff);">
          <div style="flex:1">
            <div style="font-weight:700">All subjects — Summary</div>
            <div class="muted" style="font-size:13px">Periods: ${totalPeriods} • Present: ${presentCount} • Absent: ${absentCount} ${totalDurationPresent ? '• ' + totalDurationPresent + ' mins' : ''}</div>
          </div>
          <div style="text-align:right;min-width:110px">
            <div style="font-size:20px;font-weight:800">${pct}%</div>
            <div class="muted" style="font-size:12px">Average present</div>
          </div>
        </div>
      `;
    }

    async function loadForSubject() {
      const sid = (document.getElementById('student-att-subject').value || '').trim();
      const wrap = document.getElementById('student-att-summary');
      wrap.innerHTML = 'Loading…';
      try {
        // If sid is empty => All subjects (no query param)
        const qpath = sid ? ('/attendances/summary/me?subjectId=' + encodeURIComponent(sid)) : '/attendances/summary/me';
        const res = await apiFetch(qpath);
        const items = (res && res.items) ? res.items : [];

        if (!items || items.length === 0) {
          wrap.innerHTML = '<p>No attendance records yet.</p>';
          const lastElNone = document.getElementById('student-last-update');
          if (lastElNone) lastElNone.innerText = '';
          return;
        }

        // If "All subjects" selected: API returns rows grouped by subject.
        // Aggregate totals across the rows and display overall card + per-subject breakdown.
        if (!sid) {
          // sum totals
          const totals = items.reduce((acc, it) => {
            acc.totalPeriods += Number(it.totalPeriods || 0);
            acc.presentCount += Number(it.presentCount || 0);
            acc.absentCount += Number(it.absentCount || 0);
            acc.totalDurationPresent += Number(it.totalDurationPresent || 0);
            if (it.lastUpdate) acc.lastDates.push(new Date(it.lastUpdate));
            return acc;
          }, { totalPeriods: 0, presentCount: 0, absentCount: 0, totalDurationPresent: 0, lastDates: [] });

          // build DOM
          const out = document.createElement('div');
          out.style.display = 'grid';
          out.style.gap = '8px';

          // totals card
          const totalsHtml = renderTotalsCard(totals);
          const totalsNode = document.createElement('div');
          totalsNode.innerHTML = totalsHtml;
          out.appendChild(totalsNode);

          // per-subject cards (compact)
          const list = document.createElement('div');
          list.style.display = 'grid';
          list.style.gridTemplateColumns = 'repeat(auto-fit,minmax(220px,1fr))';
          list.style.gap = '8px';
          items.forEach(it => {
            const pct = it.totalPeriods > 0 ? Math.round((Number(it.presentCount || 0) / Number(it.totalPeriods || 0)) * 10000) / 100 : 0;
            const block = document.createElement('div');
            block.className = 'card';
            block.style.padding = '10px';
            block.innerHTML = `
              <div style="font-weight:700">${escapeHtml(it.subjectName || 'Subject')}</div>
              <div class="muted" style="font-size:13px">Periods: ${it.totalPeriods} • Present: ${it.presentCount} • Absent: ${it.absentCount}</div>
              <div style="margin-top:8px;font-weight:700">${pct}%</div>
            `;
            list.appendChild(block);
          });
          out.appendChild(list);

          wrap.innerHTML = '';
          wrap.appendChild(out);

          // show last update (latest of lastDates)
          const lastDates = totals.lastDates;
          if (lastDates.length > 0) {
            const latest = new Date(Math.max(...lastDates.map(d => d.getTime())));
            const lastEl = document.getElementById('student-last-update');
            if (lastEl) lastEl.innerText = 'Last update: ' + latest.toLocaleString();
          } else {
            const lastEl = document.getElementById('student-last-update');
            if (lastEl) lastEl.innerText = '';
          }
          return;
        }

        // Single subject selected: show one or more rows (should usually be one row)
        wrap.innerHTML = '';
        items.forEach(it => {
          const pct = Math.round((it.percent || 0) * 100) / 100;
          const color = pct < 25 ? 'color:#ef4444' : '';
          const last = it.lastUpdate ? new Date(it.lastUpdate).toLocaleString() : '—';
          const dur = it.totalDurationPresent ? `${it.totalDurationPresent} mins` : '';
          const block = document.createElement('div');
          block.className = 'card';
          block.style.marginBottom = '8px';
          block.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:600">${escapeHtml(it.subjectName || 'Subject')}</div>
                <div class="muted" style="font-size:13px">Periods: ${it.totalPeriods} • Present: ${it.presentCount} • Absent: ${it.absentCount} ${dur ? '• ' + dur : ''}</div>
              </div>
              <div style="text-align:right">
                <div style="${color};font-weight:700">${(pct || 0)}%</div>
                <div class="muted" style="font-size:12px">Last: ${escapeHtml(last)}</div>
              </div>
            </div>
          `;
          wrap.appendChild(block);
        });

        // last-update for single-subject (use max of returned lastUpdate values)
        const lastDates = (items.map(i => i.lastUpdate).filter(Boolean).map(d => new Date(d)));
        if (lastDates.length > 0) {
          const latest = new Date(Math.max(...lastDates.map(d => d.getTime())));
          const lastEl = document.getElementById('student-last-update');
          if (lastEl) lastEl.innerText = 'Last update: ' + latest.toLocaleString();
        } else {
          const lastEl = document.getElementById('student-last-update');
          if (lastEl) lastEl.innerText = '';
        }
      } catch (err) {
        console.error('loadForSubject err', err);
        wrap.innerHTML = `<p style="color:#b91c1c">Failed to load attendance (${escapeHtml(err && err.message ? err.message : 'server error')}).</p>`;
      }
    }

    subjSel.addEventListener('change', loadForSubject);
    await loadForSubject();
  } catch (err) {
    console.error('renderStudentAttendanceOverview err', err);
    container.innerHTML = `<p style="color:#b91c1c">Failed to load your attendance (${escapeHtml(err && err.message ? err.message : 'server error')}).</p>`;
  }
}



window.renderAttendance = renderAttendance;
window.openClassAttendanceModal = window.openClassAttendanceModal || openClassAttendanceModal;
window.showAttendanceHistoryModal = window.showAttendanceHistoryModal || showAttendanceHistoryModal;



// ---------- SUBJECTS ----------
async function renderSubjects(){
  const role = getUserRole();
  if(!['admin','manager'].includes(role)) {
    app.innerHTML = '<div class="page"><h2>Access denied</h2></div>'; return;
  }
  app.innerHTML = ''; const node = tpl('subjects'); app.appendChild(node);
  document.getElementById('add-subject-btn')?.addEventListener('click', openAddSubjectModal);
  document.getElementById('subject-search')?.addEventListener('input', debounce(loadSubjects, 300));
  await loadSubjects();
}

function openAddSubjectModal(){
  const form = document.createElement('div');
  form.innerHTML = `<h3>Add Subject</h3>
    <label>Name</label><input id="sub-name"/><br/>
    <label>Subject ID (auto if empty)</label><input id="sub-id"/><br/>
    <div style="margin-top:8px">
      <button id="save-subject" class="btn">Save</button>
      <button id="cancel-subject" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
    </div>`;
  showModal(form);
  document.getElementById('cancel-subject').addEventListener('click', closeModal);
  document.getElementById('save-subject').addEventListener('click', async ()=> {
    const name = document.getElementById('sub-name').value.trim();
    const subjectId = document.getElementById('sub-id').value.trim();
    if(!name){ alert('Name required'); return; }
    try{
      const res = await apiFetch('/subjects', { method:'POST', body:{ name, subjectId } });
      alert('Saved' + (res.subjectId ? (' — ID: ' + res.subjectId) : ''));
      closeModal();
      await loadSubjects();
    }catch(err){
      console.error('Save subject error', err);
      alert('Failed to save subject: ' + (err.message || 'server error'));
    }
  });
}

async function loadSubjects(){
  const q = document.getElementById('subject-search')?.value || '';
  const list = document.getElementById('subjects-list'); if(!list) return;
  list.innerHTML = 'Loading...';
  try{
    const res = await apiFetch('/subjects?search=' + encodeURIComponent(q));
    const items = res.items || [];
    list.innerHTML = '';
    if(items.length===0) { list.innerHTML = '<p>No subjects</p>'; return; }
    items.forEach(s=> {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `<strong>${escapeHtml(s.name)}</strong>
        <div>ID: ${escapeHtml(s.subjectId||'')}</div>
        <div style="margin-top:8px">
          <button data-id="${s._id}" class="edit btn">Edit</button>
          <button data-id="${s._id}" class="del btn">Delete</button>
        </div>`;
      list.appendChild(div);
    });

    list.querySelectorAll('.del').forEach(b=> b.addEventListener('click', async e=>{
      if(!confirm('Delete subject?')) return;
      try{
        await apiFetch('/subjects/' + e.target.dataset.id, { method:'DELETE' });
        alert('Deleted');
        await loadSubjects();
      }catch(err){
        console.error('Delete subject error', err);
        alert('Failed to delete: ' + (err.message || 'server error'));
      }
    }));
    list.querySelectorAll('.edit').forEach(b=> b.addEventListener('click', e=> openEditSubject(e.target.dataset.id)));
  }catch(err){
    console.error('Load subjects error', err);
    list.innerHTML = '<p>Failed to load subjects</p>';
  }
}

async function openEditSubject(id){
  try{
    const res = await apiFetch('/subjects?search=');
    const item = (res.items||[]).find(x=> x._id === id);
    if(!item) return alert('Not found');
    const form = document.createElement('div');
    form.innerHTML = `<h3>Edit Subject</h3>
      <label>Name</label><input id="es-name" value="${escapeHtml(item.name||'')}" /><br/>
      <label>Subject ID</label><input id="es-id" value="${escapeHtml(item.subjectId||'')}" /><br/>
      <div style="margin-top:8px">
        <button id="update-subject" class="btn">Update</button>
        <button id="cancel-update-subject" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button>
      </div>`;
    showModal(form);
    document.getElementById('cancel-update-subject').addEventListener('click', closeModal);
    document.getElementById('update-subject').addEventListener('click', async ()=> {
      const name = document.getElementById('es-name').value.trim();
      const subjectId = document.getElementById('es-id').value.trim();
      try{
        await apiFetch('/subjects/' + id, { method:'PUT', body:{ name, subjectId } });
        alert('Updated');
        closeModal();
        await loadSubjects();
      }catch(err){
        console.error('Update subject error', err);
        alert('Failed to update subject: ' + (err.message || 'server error'));
      }
    });
  }catch(err){
    console.error('Open edit subject error', err);
    alert('Failed');
  }
}

/* ---------- PAYMENTS MODULE (frontend) ---------- */
// ---------- Money & payment helpers ----------
function formatCurrency(v) {
  const n = Number(v || 0);
  // Use en-US style with $ sign — adapt to your locale if needed
  return '$' + n.toFixed(2);
}

// Returns true if this payment should count toward totals / balance
// Simple rule: monthly and common fee types count; things like "registration" do not.
// Adjust the regex or list if you have explicit PaymentType keys you want excluded.
function paymentCountsTowardsTotal(payment) {
  if (!payment) return true;
  const type = String(payment.paymentType || payment.type || '').toLowerCase();
  if (!type) return true;
  // explicit allow list pattern (monthly/fee/tuition/school-fee)
  if (/monthly|fee|tuition|school[-_ ]?fee|tuition[-_ ]?fee/.test(type)) return true;
  // explicit deny list (registration, exam-fee, donation etc.)
  if (/register|registration|donation|exam|one-?time|other/i.test(type)) return false;
  // default: count
  return true;
}

// month index -> name
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthsToNames(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.map(m => {
    const idx = Number(m) - 1;
    return MONTH_NAMES[idx] || String(m);
  }).join(', ');
}

// Helpers
function debounce(fn, ms = 300){ let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=> fn(...args), ms); }; }

function showToast(msg, timeout=3500){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.style.opacity = '1', 20);
  setTimeout(()=> { t.style.transition = 'opacity 300ms'; t.style.opacity = '0'; setTimeout(()=> t.remove(), 300); }, timeout);
}

// Focus-trapped modal helper (accessible)
function openModalAccessible(contentNode, opts = {}){ /* same as before - unchanged */ 
  const modal = document.createElement('div');
  modal.className = 'card';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.style.position = 'fixed';
  modal.style.left = '50%'; modal.style.top = '50%';
  modal.style.transform = 'translate(-50%,-50%)';
  modal.style.zIndex = '2000';
  modal.style.maxHeight = '90vh';
  modal.style.overflow = 'auto';
  modal.style.width = 'min(95%,800px)';
  modal.appendChild(contentNode);

  const scrim = document.createElement('div');
  scrim.style.position = 'fixed';
  scrim.style.left = '0'; scrim.style.top = '0'; scrim.style.right='0'; scrim.style.bottom='0';
  scrim.style.background = 'rgba(2,6,23,0.5)';
  scrim.style.zIndex = '1999';
  scrim.tabIndex = -1;

  const focusableSel = 'a[href],button,textarea,input,select,[tabindex]:not([tabindex="-1"])';
  const firstFocus = contentNode.querySelector(focusableSel);
  document.body.appendChild(scrim);
  document.body.appendChild(modal);
  scrim.focus();

  function closeModal(){
    modal.remove();
    scrim.remove();
    document.removeEventListener('keydown', onKey);
    if (opts.onClose) opts.onClose();
  }
  function onKey(e){
    if (e.key === 'Escape') {
      closeModal();
    } else if (e.key === 'Tab') {
      const focusables = modal.querySelectorAll(focusableSel);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey);
  setTimeout(()=> {
    if (firstFocus) firstFocus.focus(); else modal.focus();
  }, 50);

  scrim.addEventListener('click', closeModal);
  return { close: () => modal.remove() , modalEl: modal, closeModal };
}

/* ----- Main renderer ----- */




async function renderPayments(){
  app.innerHTML = ''; // app global
  const node = tpl('payments');
  app.appendChild(node);

  // load and cache current user early
  await getCurrentUser();

  // show initial overview
  await loadPaymentsOverview();

  // wire landing cards (but we may hide them below for student/teacher)
  const cardStudents = document.getElementById('payments-card-students');
  const cardTeachers = document.getElementById('payments-card-teachers');
  if (cardStudents) cardStudents.addEventListener('click', ()=> enterPaymentsMode('student'));
  if (cardTeachers) cardTeachers.addEventListener('click', ()=> enterPaymentsMode('teacher'));

  // back button
  const back = document.getElementById('payments-back');
  if (back) back.addEventListener('click', ()=> {
    document.getElementById('payments-app').style.display = 'none';
    document.getElementById('payments-landing').style.display = 'flex';
  });

  // search input
  const searchEl = document.getElementById('payments-search');
  if (searchEl) searchEl.addEventListener('input', debounce(()=> {
    const mode = document.getElementById('payments-app').dataset.mode;
    if (mode === 'student') loadStudentsList();
    else if (mode === 'teacher') loadTeachersList();
  }, 300));

  // manage payment types button (manager-only)
  const role = getUserRole();
  const addBtn = document.getElementById('add-payment-type-btn');
  if (role === 'manager' || role === 'admin') {
    if (addBtn) { addBtn.style.display = 'inline-block'; addBtn.addEventListener('click', openPaymentTypesModal); }
  } else {
    if (addBtn) addBtn.style.display = 'none';
  }

  // If the logged-in user is a student or teacher, automatically show their own payments view
  const cur = await getCurrentUser();
  if (cur && (cur.role === 'student' || cur.role === 'teacher')) {
    // hide landing and chips/search UI not needed for a single-user view
    const landing = document.getElementById('payments-landing');
    const appWrap = document.getElementById('payments-app');
    if (landing) landing.style.display = 'none';
    if (appWrap) { appWrap.style.display = 'block'; appWrap.dataset.mode = (cur.role === 'student' ? 'student' : 'teacher'); }

    // hide the top summary cards (optional)
    if (cardStudents) cardStudents.style.display = 'none';
    if (cardTeachers) cardTeachers.style.display = 'none';

    // hide filters and list header
    const chips = document.getElementById('payments-chips');
    const search = document.getElementById('payments-search');
    if (chips) chips.style.display = 'none';
    if (search) search.style.display = 'none';
    const landingTitle = document.getElementById('payments-landing-title');
    if (landingTitle) landingTitle.style.display = 'none';

    // fetch the person's record then show the inline detail (not a modal)
    const personType = cur.role === 'student' ? 'student' : 'teacher';
    // Try /students/me or /teachers/me first for convenience, otherwise use user id
    let person = null;
    try {
      // try dedicated "me" endpoints first (some backends have them)
      person = await apiFetch(`/${personType}s/me`).catch(()=>null);
      if (person) person = person[personType] || person;
    } catch (e) { person = null; }

    if (!person || !person._id) {
      // fallback to fetching by user id
      const userId = cur._id || cur.id || cur.userId || cur._uid;
      if (userId) {
        try {
          const r = await apiFetch(`/${personType}s/${userId}`);
          person = r && (r[personType] || r);
        } catch (e) {
          // ignore, will show error below
          person = null;
        }
      }
    }

    if (!person || !person._id) {
      // unable to resolve student/teacher record — show minimal UI
      document.getElementById('payments-detail-card').innerHTML = `<div class="muted">Could not find your ${personType} profile. Please contact admin.</div>`;
      return;
    }

    // Render inline detail & history directly in payments-detail-card
    await renderPersonPaymentsInline(personType, person);
  }
}

/* ----- Render inline person payments (used for student/teacher direct view) ----- */
async function renderPersonPaymentsInline(personType, personObj){
  const detailWrap = document.getElementById('payments-detail-card');
  if (!detailWrap) return;
  detailWrap.innerHTML = '<div>Loading payments…</div>';
  try {
    const historyRes = await apiFetch(`/payments/history?personType=${encodeURIComponent(personType)}&personId=${encodeURIComponent(personObj._id)}`);
    const history = historyRes.items || [];
    // compute totals but only from payments that count toward totals
    let totalPaidCounted = 0;
    history.forEach(h => {
      if (paymentCountsTowardsTotal(h)) totalPaidCounted += Number(h.amount || 0);
    });
    // If backend returned totalPaid it's the raw sum; but for balance we use counted sum
    const totalPaid = totalPaidCounted;
    let totalDue = personObj.totalDue;
    if (typeof totalDue === 'undefined') {
      try {
        const fetched = await apiFetch(`/${personType}s/${personObj._id}`);
        const p = fetched && (fetched[personType] || fetched);
        totalDue = p && (p.totalDue || p.fee || p.salary) || 0;
      } catch (_) { totalDue = 0; }
    }
    const balance = (Number(totalDue) || 0) - (Number(totalPaid) || 0);

    // Build HTML for inline detail
    const rowsHtml = (history || []).map(h => {
      const months = (h.months || []);
      const monthsText = months.length ? (' • months: ' + monthsToNames(months)) : '';
      // if months present, show per-month amount
      const perMonth = months.length ? (Number(h.amount || 0) / months.length) : null;
      const perMonthText = perMonth ? (` • ${formatCurrency(perMonth)} / month`) : '';
      const counts = paymentCountsTowardsTotal(h) ? '' : ' (not counted)';
      return `<div class="card" style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <div style="font-weight:700">${formatCurrency(h.amount || 0)}${perMonthText}${counts}</div>
            <div class="muted">${escapeHtml(h.paymentType || h.type || '')}${monthsText}</div>
            <div style="margin-top:6px">${escapeHtml(h.note || '')}</div>
          </div>
          <div class="muted" style="text-align:right">${new Date(h.createdAt).toLocaleString()}<div style="font-size:12px">By: ${escapeHtml(h.createdByName || h.createdBy || '')}</div></div>
        </div>
      </div>`;
    }).join('');

    detailWrap.innerHTML = `
      <h3 style="margin-top:0">${personType === 'teacher' ? 'Salary / Payments' : 'Payments'} — ${escapeHtml(personObj.fullname || '')} (${escapeHtml(personObj.numberId || '')})</h3>
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
        <div style="flex:1">
          <div class="muted">Total due: <strong>${formatCurrency(totalDue || 0)}</strong></div>
          <div class="muted">Total paid (counted): <strong>${formatCurrency(totalPaid || 0)}</strong></div>
          <div class="muted">Balance: <strong>${formatCurrency(balance)}</strong></div>
        </div>
        <div style="display:flex;gap:8px;flex-direction:column">
          <button id="inline-export-csv" class="btn btn--outline">Export CSV</button>
          <button id="inline-open-modal" class="btn btn--outline">Open Modal</button>
        </div>
      </div>
      <div id="payments-history-inline">${rowsHtml || '<div class="muted">No payments recorded</div>'}</div>
    `;

    // wire export CSV (keeps same fields but amounts formatted raw numbers)
    detailWrap.querySelector('#inline-export-csv').addEventListener('click', ()=> {
      const csvRows = [['date','amount','type','months','note','createdBy']];
      (history || []).forEach(h => {
        csvRows.push([new Date(h.createdAt).toISOString(), String(h.amount), h.paymentType || h.type || '', (h.months || []).join('|'), (h.note||''), (h.createdByName||h.createdBy||'')]);
      });
      const csv = csvRows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${personObj.numberId || personObj._id}-payments.csv`; a.click();
      URL.revokeObjectURL(url);
    });

    // optional: open the same info in a modal for printing/sharing
    detailWrap.querySelector('#inline-open-modal').addEventListener('click', ()=> {
      openViewModal(personType, personObj);
    });

  } catch (err) {
    console.error('renderPersonPaymentsInline', err);
    detailWrap.innerHTML = '<div class="muted">Failed to load payment history</div>';
  }
}


/* ----- CHIPS (classes / departments) ----- */
/* Keep your existing loadClassChips and loadDepartmentChips functions — no change required. */

/* ----- LISTS ----- */
/* Updated lists: hide Pay buttons when user is not manager/admin; behavior otherwise remains the same. */

async function loadStudentsList(page=1){
  const listEl = document.getElementById('payments-list');
  listEl.innerHTML = 'Loading…';
  try{
    const q = document.getElementById('payments-search').value.trim();
    const pressedChip = Array.from(document.getElementById('payments-chips').querySelectorAll('.chip')).find(c => c.getAttribute('aria-pressed') === 'true' && c.dataset.id);
    const classId = pressedChip ? pressedChip.dataset.id : '';
    const res = await apiFetch(`/payments/students?search=${encodeURIComponent(q)}&classId=${encodeURIComponent(classId)}&page=${page}`);
    const items = res.items || [];
    if (!items.length) { listEl.innerHTML = '<p>No students found</p>'; return; }
    listEl.innerHTML = '';

    // determine whether to show Pay button
    const role = getUserRole();
    const allowPay = (role === 'manager' || role === 'admin');

    items.forEach(s => {
      const row = document.createElement('div');
      row.className = 'payments-row card';
   // inside items.forEach(s => { ... })
const balance = (s.totalDue || 0) - (s.paidAmount || 0);
const statusClass = balance <= 0 ? 'status-paid' : ( (s.paidAmount && s.paidAmount > 0) ? 'status-partial' : 'status-unpaid');
row.innerHTML = `
  <div style="flex:1">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="flex:1">
        <div style="font-weight:700">${escapeHtml(s.fullname || '')}</div>
        <div class="meta">${escapeHtml(s.numberId || '')} • ${escapeHtml(s.phone || '')}</div>
        <div class="meta">Class: ${escapeHtml(s.classId?.name || s.className || '')}</div>
      </div>
      <div style="text-align:right;min-width:160px">
        <div>Total: ${formatCurrency(s.totalDue || 0)}</div>
        <div>Paid: ${formatCurrency(s.paidAmount || 0)}</div>
        <div>Balance: ${formatCurrency(balance)}</div>
      </div>
    </div>
  </div>
  <div style="margin-left:12px;display:flex;flex-direction:column;gap:6px">
    <div class="status-badge ${statusClass}">${balance <= 0 ? 'Paid' : (s.paidAmount ? 'Partial' : 'Unpaid')}</div>
    <div style="display:flex;gap:6px">
      ${allowPay ? `<button class="btn btn--small btn-pay" data-id="${s._id}" data-type="student">Pay</button>` : ''}
      <button class="btn btn--outline btn-view" data-id="${s._id}" data-type="student">View</button>
    </div>
  </div>
`;

      listEl.appendChild(row);
    });

    // wire actions
    listEl.querySelectorAll('.btn-pay').forEach(b => b.addEventListener('click', async e => {
      const id = e.currentTarget.dataset.id;
      try {
        const data = await apiFetch('/students/' + id);
        const p = data && (data.student || data);
        if (!p || !p._id) { alert('Failed to fetch student details'); return; }
        openPayModal('student', p);
      } catch (err) { console.error('fetch student for pay', err); alert('Could not fetch student: ' + (err.message || 'server error')); }
    }));
    listEl.querySelectorAll('.btn-view').forEach(b => b.addEventListener('click', async e => {
      const id = e.currentTarget.dataset.id;
      try {
        const data = await apiFetch('/students/' + id);
        const p = data && (data.student || data);
        if (!p || !p._id) { alert('Failed to fetch student details'); return; }
        openViewModal('student', p);
      } catch (err) { console.error('fetch student for view', err); alert('Could not fetch student: ' + (err.message || 'server error')); }
    }));

  }catch(err){
    console.error('loadStudentsList', err);
    listEl.innerHTML = '<p>Failed to load students</p>';
  }
}

async function loadTeachersList(page=1){
  const listEl = document.getElementById('payments-list');
  listEl.innerHTML = 'Loading…';
  try{
    const q = document.getElementById('payments-search').value.trim();
    const pressedChip = Array.from(document.getElementById('payments-chips').querySelectorAll('.chip')).find(c => c.getAttribute('aria-pressed') === 'true' && c.dataset.id);
    const subjectId = pressedChip ? pressedChip.dataset.id : '';
    const res = await apiFetch(`/payments/teachers?search=${encodeURIComponent(q)}&subjectId=${encodeURIComponent(subjectId)}&page=${page}`);
    const items = res.items || [];
    if (!items.length) { listEl.innerHTML = '<p>No teachers found</p>'; return; }
    listEl.innerHTML = '';

    const role = getUserRole();
    const allowPay = (role === 'manager' || role === 'admin');

    items.forEach(t => {
      const row = document.createElement('div');
      row.className = 'payments-row card';
      const balance = (t.totalDue || 0) - (t.paidAmount || 0);
      const statusClass = balance <= 0 ? 'status-paid' : ( (t.paidAmount && t.paidAmount > 0) ? 'status-partial' : 'status-unpaid');
      row.innerHTML = `
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="flex:1">
              <div style="font-weight:700">${escapeHtml(t.fullname || '')}</div>
              <div class="meta">${escapeHtml(t.numberId || '')} • ${escapeHtml(t.phone || '')}</div>
              <div class="meta">Subjects: ${(t.subjectIds || []).map(s => s.name || '').join(', ')}</div>
            </div>
            <div style="text-align:right;min-width:160px">
              <div>Salary: ${formatCurrency(t.totalDue || t.salary || 0)}</div>
              <div>Paid: ${formatCurrency(t.paidAmount || 0)}</div>
              <div>Remaining: ${formatCurrency(balance)}</div>
            </div>
          </div>
        </div>
        <div style="margin-left:12px;display:flex;flex-direction:column;gap:6px">
          <div class="status-badge ${statusClass}">${balance <= 0 ? 'Settled' : (t.paidAmount ? 'Partial' : 'Due')}</div>
          <div style="display:flex;gap:6px">
            ${allowPay ? `<button class="btn btn--small btn-pay" data-id="${t._id}" data-type="teacher">Pay</button>` : ''}
            <button class="btn btn--outline btn-view" data-id="${t._id}" data-type="teacher">View</button>
          </div>
        </div>
      `;
      
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('.btn-pay').forEach(b => b.addEventListener('click', async e => {
      const id = e.currentTarget.dataset.id;
      try {
        const data = await apiFetch('/teachers/' + id);
        const p = data && (data.teacher || data);
        if (!p || !p._id) { alert('Failed to fetch teacher details'); return; }
        openPayModal('teacher', p);
      } catch (err) { console.error('fetch teacher for pay', err); alert('Could not fetch teacher: ' + (err.message || 'server error')); }
    }));
    listEl.querySelectorAll('.btn-view').forEach(b => b.addEventListener('click', async e => {
      const id = e.currentTarget.dataset.id;
      try {
        const data = await apiFetch('/teachers/' + id);
        const p = data && (data.teacher || data);
        if (!p || !p._id) { alert('Failed to fetch teacher details'); return; }
        openViewModal('teacher', p);
      } catch (err) { console.error('fetch teacher for view', err); alert('Could not fetch teacher: ' + (err.message || 'server error')); }
    }));

  }catch(err){
    console.error('loadTeachersList', err);
    listEl.innerHTML = '<p>Failed to load teachers</p>';
  }
}

/* ----- PAY modal / openViewModal / openPaymentTypesModal ----- */
/* Keep your existing implementations for openPayModal, openViewModal, openPaymentTypesModal (I left them unchanged above). */




async function loadPaymentsOverview(){
  try{
    const res = await apiFetch('/payments/overview');
    document.getElementById('payments-students-summary').textContent = `${res.studentsCount || 0} students • Outstanding: ${res.studentsOutstanding || 0}`;
    document.getElementById('payments-teachers-summary').textContent = `${res.teachersCount || 0} teachers • Outstanding: ${res.teachersOutstanding || 0}`;
  }catch(err){
    console.error('loadPaymentsOverview', err);
    document.getElementById('payments-students-summary').textContent = 'Failed to load';
    document.getElementById('payments-teachers-summary').textContent = 'Failed to load';
  }
}

async function enterPaymentsMode(mode){
  document.getElementById('payments-landing').style.display = 'none';
  const appWrap = document.getElementById('payments-app');
  appWrap.style.display = 'block';
  appWrap.dataset.mode = mode === 'student' ? 'student' : 'teacher';
  document.getElementById('payments-search').value = '';
  if (mode === 'student') {
    await loadClassChips();
    await loadStudentsList();
  } else {
    await loadDepartmentChips();
    await loadTeachersList();
  }
  document.getElementById('payments-detail-card').innerHTML = 'Select a person to see summary';
}

/* ----- CHIPS (classes / departments) ----- */

async function loadClassChips(){
  const chipsWrap = document.getElementById('payments-chips');
  chipsWrap.innerHTML = '';
  try{
    const res = await apiFetch('/classes?search=');
    const classes = res.items || [];
    const allChip = document.createElement('button');
    allChip.className = 'chip';
    allChip.textContent = 'All';
    allChip.setAttribute('aria-pressed','true');
    allChip.addEventListener('click', ()=> { chipsWrap.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed','false')); allChip.setAttribute('aria-pressed','true'); loadStudentsList(); });
    chipsWrap.appendChild(allChip);

    classes.forEach(c => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = c.name + (c.classId ? (' ('+c.classId+')') : '');
      b.dataset.id = c._id;
      b.setAttribute('aria-pressed','false');
      b.addEventListener('click', ()=> {
        const pressed = b.getAttribute('aria-pressed') === 'true';
        chipsWrap.querySelectorAll('.chip').forEach(cb => cb.setAttribute('aria-pressed','false'));
        if (!pressed) b.setAttribute('aria-pressed','true');
        loadStudentsList();
      });
      chipsWrap.appendChild(b);
    });
  }catch(err){
    console.error('loadClassChips', err);
    chipsWrap.innerHTML = '<div class="muted">Failed to load classes</div>';
  }
}

async function loadDepartmentChips(){
  const chipsWrap = document.getElementById('payments-chips');
  chipsWrap.innerHTML = '';
  try{
    const res = await apiFetch('/subjects?search=');
    const subs = res.items || [];
    const allChip = document.createElement('button');
    allChip.className = 'chip'; allChip.textContent = 'All'; allChip.setAttribute('aria-pressed','true');
    allChip.addEventListener('click', ()=> { chipsWrap.querySelectorAll('.chip').forEach(c=> c.setAttribute('aria-pressed','false')); allChip.setAttribute('aria-pressed','true'); loadTeachersList(); });
    chipsWrap.appendChild(allChip);
    subs.forEach(s => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = s.name;
      b.dataset.id = s._id;
      b.setAttribute('aria-pressed','false');
      b.addEventListener('click', ()=> {
        const pressed = b.getAttribute('aria-pressed') === 'true';
        chipsWrap.querySelectorAll('.chip').forEach(cb => cb.setAttribute('aria-pressed','false'));
        if (!pressed) b.setAttribute('aria-pressed','true');
        loadTeachersList();
      });
      chipsWrap.appendChild(b);
    });
  }catch(err){
    console.error('loadDepartmentChips', err);
    chipsWrap.innerHTML = '<div class="muted">Failed to load departments</div>';
  }
}


/* ----- PAY modal ----- */

async function openPayModal(personType, personObj){
  const currentUserRole = getUserRole();
  if(!['manager','admin'].includes(currentUserRole)){
    return alert('Only managers may record payments.');
  }

  if (!personObj || !personObj._id) {
    return alert('Invalid person selected.');
  }

  // fetch fresh summary (guarantee totals) - but tolerate failure
  let person = personObj;
  try{
    if (personType === 'student') {
      const res = await apiFetch('/students/' + personObj._id);
      person = res.student || res;
    } else {
      const res = await apiFetch('/teachers/' + personObj._id);
      person = res.teacher || res;
    }
  }catch(err){ console.warn('openPayModal fetch person (fallback to provided)', err); }

  if (!person || !person._id) {
    return alert('Could not load person data for payment.');
  }

  const balance = (person.totalDue || 0) - (person.paidAmount || 0);

  const content = document.createElement('div');
  content.innerHTML = `
    <h3>Record Payment — ${escapeHtml(person.fullname || '')} (${escapeHtml(person.numberId || '')})</h3>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">
      <div style="flex:1">
        <div class="muted">Total due: <strong>${escapeHtml(String(person.totalDue || 0))}</strong></div>
        <div class="muted">Total paid: <strong>${escapeHtml(String(person.paidAmount || 0))}</strong></div>
        <div class="muted">Balance: <strong>${escapeHtml(String(balance))}</strong></div>
      </div>
    </div>
    <label>Amount</label><input id="pay-amount" type="number" min="0.01" step="0.01" placeholder="0.00" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb"/><br/>
    <label>Payment type</label>
    <select id="pay-type" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb"></select>
    <div id="pay-type-custom-wrap" style="margin-top:8px;display:none;font-size:13px"></div>
    <div id="monthly-months-wrap" style="margin-top:8px;display:none">
      <div class="muted" style="margin-bottom:6px">Select month(s)</div>
      <div id="month-pills" style="display:flex;flex-wrap:wrap"></div>
    </div>
    <label style="margin-top:8px">Note (optional)</label><textarea id="pay-note" rows="3" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb"></textarea>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="pay-cancel" class="btn btn--outline">Cancel</button>
      <button id="pay-submit" class="btn">Pay & Save</button>
    </div>
  `;

  // populate payment types
  try{
    const typesRes = await apiFetch('/payments/types');
    const types = typesRes.items || [];
    const sel = content.querySelector('#pay-type');
    sel.innerHTML = '';
    types.forEach(t => {
      const opt = document.createElement('option'); opt.value = t.key || t._id; opt.textContent = t.name;
      sel.appendChild(opt);
    });
    if (!Array.from(sel.options).some(o => o.value === 'monthly')) {
      const opt = document.createElement('option'); opt.value = 'monthly'; opt.textContent = 'Monthly';
      sel.prepend(opt);
    }
    const customOpt = document.createElement('option'); customOpt.value = '__custom__'; customOpt.textContent = 'Other (custom)';
    sel.appendChild(customOpt);
  }catch(e){ console.warn('load payment types', e); }

  // month pills UI
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthPills = content.querySelector('#month-pills');
  months.forEach((m, i) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'month-pill';
    pill.textContent = m;
    pill.dataset.month = i+1;
    pill.setAttribute('aria-pressed','false');
    pill.addEventListener('click', ()=> {
      const pressed = pill.getAttribute('aria-pressed') === 'true';
      pill.setAttribute('aria-pressed', String(!pressed));
    });
    monthPills.appendChild(pill);
  });

  const modal = openModalAccessible(content, { onClose: ()=> {} });

  const sel = content.querySelector('#pay-type');
  sel.addEventListener('change', ()=> {
    const val = sel.value;
    content.querySelector('#monthly-months-wrap').style.display = (val === 'monthly') ? 'block' : 'none';
    content.querySelector('#pay-type-custom-wrap').style.display = (val === '__custom__') ? 'block' : 'none';
    if (val === '__custom__') {
      const wrap = content.querySelector('#pay-type-custom-wrap');
      wrap.innerHTML = `<div style="display:flex;gap:8px"><input id="custom-type-name" placeholder="New type label" style="flex:1;padding:8px;border-radius:8px;border:1px solid #e5e7eb"/> <button id="save-custom-type" class="btn">Add</button></div>`;
      wrap.querySelector('#save-custom-type').addEventListener('click', async ()=> {
        const name = wrap.querySelector('#custom-type-name').value.trim();
        if(!name) return alert('Label required');
        try{
          await apiFetch('/payments/types', { method: 'POST', body: { name } });
          showToast('Payment type added');
          const all = await apiFetch('/payments/types');
          const sel2 = content.querySelector('#pay-type'); sel2.innerHTML = '';
          all.items.forEach(t=> { const o = document.createElement('option'); o.value = t.key || t._id; o.textContent = t.name; sel2.appendChild(o); });
          const mo = document.createElement('option'); mo.value = 'monthly'; mo.textContent = 'Monthly'; sel2.prepend(mo);
          const cu = document.createElement('option'); cu.value = '__custom__'; cu.textContent = 'Other (custom)'; sel2.appendChild(cu);
        }catch(err){ console.error('add payment type', err); alert('Failed to add: ' + (err.message || 'server error')); }
      });
    } else {
      content.querySelector('#pay-type-custom-wrap').innerHTML = '';
    }
  });

  content.querySelector('#pay-cancel').addEventListener('click', ()=> modal.closeModal());

  let submitting = false;
  content.querySelector('#pay-submit').addEventListener('click', async ()=> {
    if (submitting) return;
    const amount = Number(content.querySelector('#pay-amount').value || 0);
    const ptype = content.querySelector('#pay-type').value;
    const note = content.querySelector('#pay-note').value.trim();
    const selectedMonths = Array.from(content.querySelectorAll('.month-pill')).filter(p => p.getAttribute('aria-pressed') === 'true').map(p => Number(p.dataset.month));

    if (!amount || amount <= 0) return alert('Amount must be greater than 0');
    if (ptype === 'monthly' && (!selectedMonths.length)) return alert('Please select month(s) for monthly payment');

    const allowOverpay = false;
    if (!allowOverpay && amount > ((person.totalDue||0) - (person.paidAmount||0))) {
      return alert('Amount exceeds balance. Adjust or enable overpayment policy.');
    }

    // build payload (don't include months key unless monthly)
    const payload = {
      personType: personType, // note: personType is closed over from outer function param
      personId: person._id,
      amount,
      paymentType: ptype,
      note
    };
    if (ptype === 'monthly') payload.months = selectedMonths;

    // idempotency
    payload.idempotencyKey = 'pay-' + Date.now() + '-' + Math.random().toString(36).slice(2,9);

    try{
      submitting = true;
      content.querySelector('#pay-submit').disabled = true;
      const res = await apiPost('/payments', payload);
      showToast(`Payment recorded — ${amount} saved to ${person.fullname}. New balance: ${res.newBalance}`);
      modal.closeModal();
      if (personType === 'student') loadStudentsList();
      else loadTeachersList();
    }catch(err){
      console.error('submit payment', err);
      // if server included detail in body, show it
      const serverMsg = err && err.body && (err.body.detail || err.body.message) ? (err.body.detail || err.body.message) : null;
      alert('Failed to record payment: ' + (serverMsg || err.message || 'server error'));
    } finally {
      submitting = false;
      try{ content.querySelector('#pay-submit').disabled = false; }catch(e){}
    }
  });
}

/* ----- VIEW modal: history & CSV export ----- */

// Replace your existing openPayModal(...) with this function
async function openPayModal(personType, personObj){
  const currentUserRole = getUserRole();
  if(!['manager','admin'].includes(currentUserRole)){
    return alert('Only managers may record payments.');
  }

  if (!personObj || !personObj._id) {
    return alert('Invalid person selected.');
  }

  // fetch fresh summary (guarantee totals) - but tolerate failure
  let person = personObj;
  try{
    if (personType === 'student') {
      const res = await apiFetch('/students/' + personObj._id);
      person = res.student || res;
    } else {
      const res = await apiFetch('/teachers/' + personObj._id);
      person = res.teacher || res;
    }
  }catch(err){ console.warn('openPayModal fetch person (fallback to provided)', err); }

  if (!person || !person._id) {
    return alert('Could not load person data for payment.');
  }

  const balance = (person.totalDue || 0) - (person.paidAmount || 0);

  const content = document.createElement('div');
  content.innerHTML = `
    <h3>Record Payment — ${escapeHtml(person.fullname || '')} (${escapeHtml(person.numberId || '')})</h3>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">
      <div style="flex:1">
        <div class="muted">Total due: <strong>${escapeHtml(String(person.totalDue || 0))}</strong></div>
        <div class="muted">Total paid: <strong>${escapeHtml(String(person.paidAmount || 0))}</strong></div>
        <div class="muted">Balance: <strong>${escapeHtml(String(balance))}</strong></div>
      </div>
    </div>
    <label>Amount</label><input id="pay-amount" type="number" min="0.01" step="0.01" placeholder="0.00" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb"/><br/>
    <label>Payment type</label>
    <select id="pay-type" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb"></select>
    <div id="pay-type-custom-wrap" style="margin-top:8px;display:none;font-size:13px"></div>
    <div id="monthly-months-wrap" style="margin-top:8px;display:none">
      <div class="muted" style="margin-bottom:6px">Select month(s)</div>
      <div id="month-pills" style="display:flex;flex-wrap:wrap"></div>
    </div>
    <label style="margin-top:8px">Note (optional)</label><textarea id="pay-note" rows="3" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb"></textarea>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="pay-cancel" class="btn btn--outline">Cancel</button>
      <button id="pay-submit" class="btn">Pay & Save</button>
    </div>
  `;

  // --- helper utilities scoped to this modal ---
  function formatCurrency(v){
    const n = Number(v || 0);
    return '$' + n.toFixed(2);
  }
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monthsToNames(arr){
    if(!Array.isArray(arr) || !arr.length) return '';
    return arr.map(m => MONTH_NAMES[(Number(m)-1)] || String(m)).join(', ');
  }

  // A small helper that decides whether a paymentType "counts toward totals".
  // It tries to use the cached paymentTypes (loaded below). If not found, falls
  // back to a heuristic: types named or keyed 'registration' or containing 'reg' do NOT count.
  let paymentTypesCache = [];
  function paymentCountsTowardsTotal({ paymentType }){
    if(!paymentType) return true; // assume true by default
    // match by key or id
    const found = (paymentTypesCache || []).find(t => String(t.key || t._id) === String(paymentType) || String(t._id) === String(paymentType));
    if(found && typeof found.countsTowardsBalance !== 'undefined') return Boolean(found.countsTowardsBalance);
    if(found && typeof found.countsTowardsTotal !== 'undefined') return Boolean(found.countsTowardsTotal);
    // fallback heuristics
    const lower = String(paymentType || '').toLowerCase();
    if (lower.includes('reg') || lower.includes('registration') || lower.includes('admission') || lower.includes('enrol')) return false;
    return true;
  }

  // populate payment types (and cache them)
  try{
    const typesRes = await apiFetch('/payments/types');
    const types = typesRes.items || [];
    paymentTypesCache = types;
    const sel = content.querySelector('#pay-type');
    sel.innerHTML = '';
    types.forEach(t => {
      const opt = document.createElement('option'); opt.value = t.key || t._id; opt.textContent = t.name;
      sel.appendChild(opt);
    });
    if (!Array.from(sel.options).some(o => o.value === 'monthly')) {
      const opt = document.createElement('option'); opt.value = 'monthly'; opt.textContent = 'Monthly';
      sel.prepend(opt);
    }
    const customOpt = document.createElement('option'); customOpt.value = '__custom__'; customOpt.textContent = 'Other (custom)';
    sel.appendChild(customOpt);
  }catch(e){
    console.warn('load payment types', e);
  }

  // month pills UI (with click updating hint)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthPills = content.querySelector('#month-pills');
  months.forEach((m, i) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'month-pill';
    pill.textContent = m;
    pill.dataset.month = i+1;
    pill.setAttribute('aria-pressed','false');
    pill.addEventListener('click', ()=> {
      const pressed = pill.getAttribute('aria-pressed') === 'true';
      pill.setAttribute('aria-pressed', String(!pressed));
      // update hint immediately when user toggles months
      updatePerMonthHint();
    });
    monthPills.appendChild(pill);
  });

  const modal = openModalAccessible(content, { onClose: ()=> {} });

  const sel = content.querySelector('#pay-type');
  sel.addEventListener('change', ()=> {
    const val = sel.value;
    content.querySelector('#monthly-months-wrap').style.display = (val === 'monthly') ? 'block' : 'none';
    content.querySelector('#pay-type-custom-wrap').style.display = (val === '__custom__') ? 'block' : 'none';
    if (val === '__custom__') {
      const wrap = content.querySelector('#pay-type-custom-wrap');
      wrap.innerHTML = `<div style="display:flex;gap:8px"><input id="custom-type-name" placeholder="New type label" style="flex:1;padding:8px;border-radius:8px;border:1px solid #e5e7eb"/> <button id="save-custom-type" class="btn">Add</button></div>`;
      wrap.querySelector('#save-custom-type').addEventListener('click', async ()=> {
        const name = wrap.querySelector('#custom-type-name').value.trim();
        if(!name) return alert('Label required');
        try{
          await apiFetch('/payments/types', { method: 'POST', body: { name } });
          showToast('Payment type added');
          const all = await apiFetch('/payments/types');
          const sel2 = content.querySelector('#pay-type'); sel2.innerHTML = '';
          paymentTypesCache = all.items || [];
          paymentTypesCache.forEach(t=> { const o = document.createElement('option'); o.value = t.key || t._id; o.textContent = t.name; sel2.appendChild(o); });
          const mo = document.createElement('option'); mo.value = 'monthly'; mo.textContent = 'Monthly'; sel2.prepend(mo);
          const cu = document.createElement('option'); cu.value = '__custom__'; cu.textContent = 'Other (custom)'; sel2.appendChild(cu);
        }catch(err){ console.error('add payment type', err); alert('Failed to add: ' + (err.message || 'server error')); }
      });
    } else {
      content.querySelector('#pay-type-custom-wrap').innerHTML = '';
    }
    // update hint when type changes
    updatePerMonthHint();
  });

  content.querySelector('#pay-cancel').addEventListener('click', ()=> modal.closeModal());

  // --- New: per-month hint logic & wiring ---
  function updatePerMonthHint() {
    const amtInput = content.querySelector('#pay-amount');
    const selEl = content.querySelector('#pay-type');
    const selectedMonths = Array.from(content.querySelectorAll('.month-pill')).filter(p => p.getAttribute('aria-pressed') === 'true').map(p => Number(p.dataset.month));
    const amt = Number(amtInput.value || 0);
    // per-month hint element created under amount
    let hintEl = content.querySelector('#pay-per-month-hint');
    if(!hintEl){
      hintEl = document.createElement('div');
      hintEl.id = 'pay-per-month-hint';
      hintEl.style.fontSize = '13px';
      hintEl.style.marginTop = '6px';
      content.querySelector('#pay-amount').after(hintEl);
    }
    if (selEl.value === 'monthly' && selectedMonths.length && amt>0) {
      const per = (amt / selectedMonths.length);
      hintEl.textContent = `${selectedMonths.length} month(s) selected — ${formatCurrency(per)} per month. Months: ${monthsToNames(selectedMonths)}`;
    } else {
      hintEl.textContent = '';
    }
  }

  // wire amount/type input to update hint (debounced)
  content.querySelector('#pay-amount').addEventListener('input', debounce(updatePerMonthHint, 150));
  content.querySelector('#pay-type').addEventListener('change', ()=> updatePerMonthHint());
  // month-pill clicks already call updatePerMonthHint() above

  // --- Submit handler: enforce overpay only when type counts toward totals ---
  let submitting = false;
  content.querySelector('#pay-submit').addEventListener('click', async ()=> {
    if (submitting) return;
    const amount = Number(content.querySelector('#pay-amount').value || 0);
    const ptype = content.querySelector('#pay-type').value;
    const note = content.querySelector('#pay-note').value.trim();
    const selectedMonths = Array.from(content.querySelectorAll('.month-pill')).filter(p => p.getAttribute('aria-pressed') === 'true').map(p => Number(p.dataset.month));

    if (!amount || amount <= 0) return alert('Amount must be greater than 0');
    if (ptype === 'monthly' && (!selectedMonths.length)) return alert('Please select month(s) for monthly payment');

    // only enforce overpay for payment types that count toward totals
    const allowOverpay = false;
    const countsToward = paymentCountsTowardsTotal({ paymentType: ptype });
    if (!allowOverpay && countsToward && amount > ((person.totalDue||0) - (person.paidAmount||0))) {
      return alert('Amount exceeds balance. Adjust or enable overpayment policy.');
    }

    const payload = {
      personType: personType,
      personId: person._id,
      amount,
      paymentType: ptype,
      note
    };
    if (ptype === 'monthly') payload.months = selectedMonths;
    payload.idempotencyKey = 'pay-' + Date.now() + '-' + Math.random().toString(36).slice(2,9);

    try{
      submitting = true;
      content.querySelector('#pay-submit').disabled = true;
      const res = await apiPost('/payments', payload);
      showToast(`Payment recorded — ${formatCurrency(amount)} saved for ${person.fullname}. New balance: ${res.newBalance !== undefined ? formatCurrency(res.newBalance) : ''}`);
      modal.closeModal();
      if (personType === 'student') loadStudentsList();
      else loadTeachersList();
    }catch(err){
      console.error('submit payment', err);
      const serverMsg = err && err.body && (err.body.detail || err.body.message) ? (err.body.detail || err.body.message) : null;
      alert('Failed to record payment: ' + (serverMsg || err.message || 'server error'));
    } finally {
      submitting = false;
      try{ content.querySelector('#pay-submit').disabled = false; }catch(e){}
    }
  });

  // initial hint state
  updatePerMonthHint();
}



/* ----- Payment types modal (manager only) ----- */

async function openPaymentTypesModal(){
  try{
    const res = await apiFetch('/payments/types');
    const items = res.items || [];
    const content = document.createElement('div');
    content.innerHTML = `<h3>Payment Types</h3>
      <div id="pt-list">${items.map(it => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px;border-radius:6px;margin-bottom:6px"><div><strong>${escapeHtml(it.name)}</strong></div><div style="display:flex;gap:8px"><button data-id="${it._id}" class="pt-edit btn btn--outline">Edit</button><button data-id="${it._id}" class="pt-del btn" style="background:#ef4444">Delete</button></div></div>`).join('')}</div>
      <div style="margin-top:10px"><label>New type</label><input id="pt-name" placeholder="Label" style="width:60%;padding:8px;border-radius:8px;border:1px solid #e5e7eb"/><button id="pt-add" class="btn" style="margin-left:8px">Add</button></div>
      <div style="margin-top:12px"><button id="pt-close" class="btn btn--outline">Close</button></div>
    `;
    const modal = openModalAccessible(content);
    content.querySelector('#pt-close').addEventListener('click', ()=> modal.closeModal());
    content.querySelector('#pt-add').addEventListener('click', async ()=> {
      const name = content.querySelector('#pt-name').value.trim();
      if(!name) return alert('Label required');
      try{
        await apiFetch('/payments/types', { method:'POST', body: { name } });
        showToast('Added payment type');
        modal.closeModal();
        openPaymentTypesModal();
      }catch(err){ console.error('add type', err); alert('Failed to add: ' + (err.message || 'server error')); }
    });
    content.querySelectorAll('.pt-del').forEach(b => b.addEventListener('click', async e => {
      const id = e.currentTarget.dataset.id;
      if(!confirm('Delete payment type?')) return;
      try{ await apiFetch('/payments/types/' + id, { method:'DELETE' }); showToast('Deleted'); modal.closeModal(); openPaymentTypesModal(); } catch(err){ console.error('del type', err); alert('Failed: ' + (err.message || 'server error')); }
    }));
    content.querySelectorAll('.pt-edit').forEach(b=> b.addEventListener('click', async e => {
      const id = e.currentTarget.dataset.id;
      const newName = prompt('New label:');
      if(!newName) return;
      try{ await apiFetch('/payments/types/' + id, { method:'PUT', body: { name: newName } }); showToast('Updated'); modal.closeModal(); openPaymentTypesModal(); }catch(err){ console.error('edit type', err); alert('Failed to update: ' + (err.message || 'server error')); }
    }));
  }catch(err){ console.error('openPaymentTypesModal', err); alert('Failed to load payment types: ' + (err.message || 'server error')); }
}



// frontend: renderFinance (complete)
async function renderFinance(){
  app.innerHTML = '';
  let node;
  try { node = tpl('tpl-finance'); } catch(e) { node = null; }
  if (node) app.appendChild(node);
  else {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    wrapper.innerHTML = `<div id="finance-root"><div id="finance-header"></div><div id="finance-body"></div></div>`;
    app.appendChild(wrapper);
  }

  const headerEl = document.getElementById('finance-header');
  const bodyEl = document.getElementById('finance-body');
  if (headerEl) headerEl.innerHTML = 'Loading…';
  if (bodyEl) bodyEl.innerHTML = '';

  // helpers (local - uses same formatting as backend)
  function escapeHtml(s = '') {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function formatCurrency(v) {
    const n = Number(v || 0);
    return '$' + n.toFixed(2);
  }
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monthsToNames(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(m => {
      const idx = Number(m) - 1;
      return MONTH_NAMES[idx] || String(m);
    }).join(', ');
  }
  // Payment counts towards total when "months" is non-empty array (matches backend)
  function paymentCountsTowardsTotal(p) {
    return Array.isArray(p && p.months) && (p.months.length > 0);
  }

  // helper to load & render data (used by refresh)
  async function loadAndRender() {
    if (headerEl) headerEl.innerHTML = 'Loading…';
    if (bodyEl) bodyEl.innerHTML = '';
    try {
      const res = await apiFetch('/finance/me');
      if (!res) throw new Error('No response');
      const profile = res.profile || {};
      const payments = Array.isArray(res.payments) ? res.payments : [];

      const totalPaid = (payments || []).reduce((s,p) => s + (paymentCountsTowardsTotal(p) ? Number(p.amount || 0) : 0), 0);
      const totalDue = res.totalDue || 0;
      const balance = res.balance || (totalDue - totalPaid);

      const photoHtml = profile.photoUrl ? `<img src="${escapeHtml(profile.photoUrl)}" alt="photo" style="width:80px;height:80px;border-radius:8px;object-fit:cover">` : `<div style="width:80px;height:80px;border-radius:8px;background:#f0f0f0;display:flex;align-items:center;justify-content:center">No photo</div>`;
      const name = escapeHtml(profile.fullname || profile.name || '');
      const numberId = escapeHtml(profile.numberId || profile.number || profile._id || '');

      const headerHtml = `
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
          <div style="flex:0 0 auto">${photoHtml}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:18px">${name}</div>
            <div class="muted">ID: ${numberId} • Role: ${escapeHtml(res.role || '')}</div>
            <div style="margin-top:8px;display:flex;gap:12px;align-items:center">
              <div class="card" style="padding:8px">Total due<br/><strong>${escapeHtml(String(totalDue || 0))}</strong></div>
              <div class="card" style="padding:8px">Total paid<br/><strong>${escapeHtml(String(totalPaid || 0))}</strong></div>
              <div class="card" style="padding:8px">Balance<br/><strong>${escapeHtml(String(balance || 0))}</strong></div>
            </div>
          </div>
          <div style="flex:0 0 auto;display:flex;flex-direction:column;gap:8px">
            <button id="finance-refresh" class="btn btn--outline">Refresh</button>
            <button id="finance-export-pdf" class="btn">Export PDF</button>
            <button id="finance-export-csv" class="btn btn--outline">Export CSV</button>
          </div>
        </div>
      `;
      if (headerEl) headerEl.innerHTML = headerHtml;

      const rowsHtml = (payments || []).map(p => {
        const dt = p.createdAt ? new Date(p.createdAt).toLocaleString() : '';
        const label = escapeHtml(String(p.paymentType || p.type || ''));
        const by = escapeHtml(p.createdByName || p.createdBy || '');
        const note = escapeHtml(p.note || '');
        const months = (p.months || []);
        const monthsText = months.length ? (' • ' + monthsToNames(months)) : '';
        const perMonthText = months.length ? ` • ${formatCurrency(Number(p.amount||0)/months.length)} / month` : '';
        const counted = paymentCountsTowardsTotal(p);
        const countBadge = counted ? '' : ' (not counted)';
        return `<div class="card" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;padding:8px">
          <div>
            <div style="font-weight:700">${formatCurrency(p.amount || 0)} ${label ? '• ' + label : ''}${countBadge}${perMonthText}</div>
            <div class="muted" style="font-size:13px">${note}${monthsText}</div>
          </div>
          <div style="text-align:right" class="muted">
            <div>${dt}</div>
            <div style="font-size:12px">By: ${by}</div>
          </div>
        </div>`;
      }).join('') || '<div class="muted">No transactions recorded</div>';

      if (bodyEl) bodyEl.innerHTML = `<h3>Transactions</h3><div id="finance-list">${rowsHtml}</div>`;

      // Wire buttons
      document.getElementById('finance-refresh')?.addEventListener('click', async ()=> {
        const btn = document.getElementById('finance-refresh');
        if (btn) btn.disabled = true;
        try { await loadAndRender(); } catch(e){ console.error('refresh failed', e); }
        if (btn) btn.disabled = false;
      });

      document.getElementById('finance-export-csv')?.addEventListener('click', ()=> {
        const csvRows = [['date','amount','type','note','createdBy']];
        (payments || []).forEach(h => csvRows.push([h.createdAt ? new Date(h.createdAt).toISOString() : '', String(h.amount || ''), h.paymentType || h.type || '', (h.note||''), (h.createdByName||h.createdBy||'')] ));
        const csv = csvRows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${profile.numberId || profile._id}-finance.csv`; a.click();
        URL.revokeObjectURL(url);
      });

      // Server-side PDF download using /api/finance/me/pdf
      const pdfBtn = document.getElementById('finance-export-pdf');
      if (pdfBtn) {
        pdfBtn.addEventListener('click', async () => {
          try {
            const token = getToken ? getToken() : (localStorage.getItem('auth_token') || '');
            const base = (typeof API_BASE === 'string' ? API_BASE : '/api');
            const r = await fetch(`${base}/finance/me/pdf`, {
              headers: { 'Authorization': 'Bearer ' + (token || '') }
            });
            if (!r.ok) {
              let errBody;
              try { errBody = await r.json(); } catch(e){ errBody = await r.text().catch(()=>null); }
              throw new Error((errBody && errBody.message) ? errBody.message : `HTTP ${r.status}`);
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${profile.numberId || profile._id}-finance.pdf`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (err) {
            console.error('download pdf error', err);
            alert('Failed to download PDF: ' + (err.message || 'server error'));
          }
        });
      }

    } catch (err) {
      console.error('renderFinance loadAndRender', err);
      if (headerEl) headerEl.innerHTML = '<div class="muted">Failed to load finance</div>';
      if (err && (err.message || '').toLowerCase().includes('unauthorized')) { navigate('login'); }
    }
  }

  // initial load
  await loadAndRender();
}
window.renderFinance = renderFinance;

// ---------- EXAMS ----------
// frontend/exams.js
// async function renderExams() {
//   app.innerHTML = '';
//   const node = tpl('tpl-exams');
//   app.appendChild(node);

//   const addExamBtn = document.getElementById('add-exam-btn');
//   const examsList = document.getElementById('exams-list');

//   const curUser = await getCurrentUser().catch(()=>null);
//   if (!curUser) { navigate('login'); return; }

//   // load exams
//   async function loadExams() {
//     examsList.innerHTML = '<div class="muted">Loading...</div>';
//     const resp = await apiFetch('/exams').catch(e => ({ ok:false }));
//     if (!resp || !resp.ok) {
//       examsList.innerHTML = '<div class="muted">Failed to load exams.</div>';
//       return;
//     }
//     const exams = resp.exams || [];
//     renderExamsGrid(exams);
//   }

//   function renderExamsGrid(exams) {
//     examsList.innerHTML = '';
//     if (!exams.length) {
//       examsList.innerHTML = '<div class="muted">No exams found</div>';
//       return;
//     }
//     const grid = document.createElement('div');
//     grid.style.display = 'grid';
//     grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(260px,1fr))';
//     grid.style.gap = '12px';

//     exams.forEach(exam => {
//       const card = document.createElement('div');
//       card.className = 'card';
//       card.style.padding = '12px';
//       const title = document.createElement('div');
//       title.innerHTML = `<strong>${escapeHtml(exam.title)}</strong><div class="muted" style="font-size:12px">Code: ${escapeHtml(exam.examCode)}</div>`;
//       card.appendChild(title);

//       const meta = document.createElement('div');
//       meta.style.marginTop = '8px';
//       meta.innerHTML = `<div class="muted" style="font-size:12px">Created: ${new Date(exam.createdAt).toLocaleString()}</div>`;
//       card.appendChild(meta);

//       const actions = document.createElement('div');
//       actions.style.display = 'flex';
//       actions.style.gap = '6px';
//       actions.style.marginTop = '10px';

//       const openBtn = document.createElement('button');
//       openBtn.className = 'btn';
//       openBtn.textContent = 'Open';
//       openBtn.addEventListener('click', () => openExam(exam._id));
//       actions.appendChild(openBtn);

//       // export PDF (all) — direct server link (keep /api prefix)
//       const exportBtn = document.createElement('button');
//       exportBtn.className = 'btn btn--outline';
//       exportBtn.textContent = 'Export PDF (All)';
//       exportBtn.addEventListener('click', () => {
//         window.open(`/api/exams/${exam._id}/export?token=${localStorage.getItem('auth_token')}`, '_blank');
//       });
//       actions.appendChild(exportBtn);

//       // delete (admins only) - optional extra convenience
//       if ((curUser.role||'').toLowerCase() === 'admin') {
//         const delBtn = document.createElement('button');
//         delBtn.className = 'btn btn--danger';
//         delBtn.textContent = 'Delete';
//         delBtn.addEventListener('click', async () => {
//           if (!confirm('Delete this exam? This cannot be undone.')) return;
//           const r = await apiFetch(`/exams/${exam._id}`, { method: 'DELETE' }).catch(()=>null);
//           if (!r || !r.ok) return alert('Delete failed');
//           loadExams();
//         });
//         actions.appendChild(delBtn);
//       }

//       card.appendChild(actions);
//       grid.appendChild(card);
//     });

//     examsList.appendChild(grid);
//   }

//   // Build and show modal form for creating an exam
//   async function showCreateExamModal() {
//     // Only allow admin/manager
//     if (!['admin','manager'].includes((curUser.role||'').toLowerCase())) { alert('Only admin/manager can create exams'); return; }

//     // Fetch classes for this school (so we can display a class list)
//     const clsResp = await apiFetch('/classes').catch(()=>null);
//     const classes = (clsResp && clsResp.classes) || [];

//     // Create form node
//     const form = document.createElement('div');
//     form.style.maxWidth = '720px';
//     form.style.width = '100%';
//     form.innerHTML = `
//       <h3>Create Exam</h3>
//       <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
//         <label style="width:90px">Title</label>
//         <input id="exam-title" type="text" placeholder="e.g. Semester 4 Results" style="flex:1; padding:6px" />
//       </div>

//       <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
//         <label style="width:90px">Classes</label>
//         <div style="flex:1">
//           <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
//             <label><input id="select-all-classes" type="checkbox" /> Apply to <strong>All classes</strong></label>
//             <span class="muted" style="margin-left:8px">Or choose specific classes below</span>
//           </div>
//           <select id="classes-select" multiple size="6" style="width:100%; min-height:120px; padding:6px; box-sizing:border-box;"></select>
//         </div>
//       </div>

//       <div style="margin-top:12px;">
//         <label style="display:block; margin-bottom:6px">Subjects</label>
//         <div id="subjects-wrap" style="display:flex; flex-direction:column; gap:6px;"></div>
//         <div style="margin-top:6px">
//           <button id="add-subject-row" class="btn btn--outline">+ Add Subject</button>
//         </div>
//         <div class="muted" style="margin-top:6px; font-size:12px">Each subject: code (short), name, max marks</div>
//       </div>

//       <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
//         <button id="cancel-create-exam" class="btn btn--outline">Cancel</button>
//         <button id="save-create-exam" class="btn">Save Exam</button>
//       </div>
//     `;

//     // populate classes select
//     const classesSelect = form.querySelector('#classes-select');
//     classes.forEach(c => {
//       const opt = document.createElement('option');
//       opt.value = c._id;
//       opt.textContent = c.name + (c.section ? ` — ${c.section}` : '');
//       classesSelect.appendChild(opt);
//     });

//     // subjects helper
//     const subjectsWrap = form.querySelector('#subjects-wrap');
//     function addSubjectRow(subject = { code:'', name:'', maxMarks:100 }) {
//       const row = document.createElement('div');
//       row.style.display = 'grid';
//       row.style.gridTemplateColumns = '1fr 1.6fr 110px 36px';
//       row.style.gap = '6px';
//       row.style.alignItems = 'center';

//       const codeIn = document.createElement('input');
//       codeIn.placeholder = 'Code (e.g. MAT)';
//       codeIn.value = subject.code || '';
//       codeIn.style.padding = '6px';

//       const nameIn = document.createElement('input');
//       nameIn.placeholder = 'Subject name (e.g. Mathematics)';
//       nameIn.value = subject.name || '';
//       nameIn.style.padding = '6px';

//       const maxIn = document.createElement('input');
//       maxIn.type = 'number';
//       maxIn.min = '1';
//       maxIn.placeholder = 'Max (100)';
//       maxIn.value = subject.maxMarks != null ? subject.maxMarks : 100;
//       maxIn.style.padding = '6px';

//       const delBtn = document.createElement('button');
//       delBtn.type = 'button';
//       delBtn.className = 'btn btn--danger';
//       delBtn.textContent = '✕';
//       delBtn.addEventListener('click', () => row.remove());

//       row.appendChild(codeIn);
//       row.appendChild(nameIn);
//       row.appendChild(maxIn);
//       row.appendChild(delBtn);

//       subjectsWrap.appendChild(row);
//     }

//     // default: add 3 sample subjects to speed up user (editable)
//     addSubjectRow({ code: 'MAT', name: 'Math', maxMarks: 100 });
//     addSubjectRow({ code: 'ENG', name: 'English', maxMarks: 100 });
//     addSubjectRow({ code: 'SCI', name: 'Science', maxMarks: 100 });

//     // add-subject handler
//     form.querySelector('#add-subject-row').addEventListener('click', (e) => {
//       e.preventDefault();
//       addSubjectRow({ code:'', name:'', maxMarks:100 });
//     });

//     // select-all toggle
//     const selectAllCheckbox = form.querySelector('#select-all-classes');
//     selectAllCheckbox.addEventListener('change', () => {
//       if (selectAllCheckbox.checked) {
//         classesSelect.disabled = true;
//         // clear any selection visually
//         [...classesSelect.options].forEach(o => o.selected = false);
//       } else {
//         classesSelect.disabled = false;
//       }
//     });

//     // cancel
//     form.querySelector('#cancel-create-exam').addEventListener('click', (e) => {
//       e.preventDefault();
//       closeModal();
//     });

//     // save
//     form.querySelector('#save-create-exam').addEventListener('click', async (e) => {
//       e.preventDefault();
//       const title = form.querySelector('#exam-title').value.trim();
//       const selectAll = form.querySelector('#select-all-classes').checked;
//       let selectedClassIds = [];
//       if (!selectAll) {
//         selectedClassIds = Array.from(classesSelect.selectedOptions).map(o => o.value);
//       }
//       // subjects
//       const subs = [];
//       for (const row of subjectsWrap.children) {
//         const inputs = row.querySelectorAll('input');
//         if (!inputs || inputs.length < 3) continue;
//         const code = (inputs[0].value || '').trim();
//         const name = (inputs[1].value || '').trim();
//         const maxMarks = Number(inputs[2].value || 100);
//         if (!code && !name) continue; // skip empty row
//         subs.push({ code: code || name.substr(0,3).toUpperCase(), name: name || code || 'Subject', maxMarks: isNaN(maxMarks) ? 100 : maxMarks });
//       }

//       if (!title) return alert('Enter exam title');
//       if (!selectAll && selectedClassIds.length === 0) {
//         if (!confirm('No classes selected. This exam will apply to ALL classes. Proceed?') ) return;
//       }
//       if (!subs.length) {
//         if (!confirm('No subjects added. Continue without subjects?')) {
//           return;
//         }
//       }

//       const body = {
//         title,
//         classes: selectAll ? [] : selectedClassIds,
//         subjects: subs,
//         schoolId: curUser.schoolId || null
//       };

//       // POST /exams via apiFetch
//       const create = await apiFetch('/exams', { method: 'POST', body }).catch(()=>null);
//       if (!create || !create.ok) {
//         alert('Failed to create exam');
//         return;
//       }
//       closeModal();
//       await loadExams();
//       alert('Exam created');
//     });

//     // show modal
//     showModal(form);
//   }

//   // wire addExamBtn
//   addExamBtn?.addEventListener('click', showCreateExamModal);

//   // open exam detail page
//   async function openExam(examId) {
//     const resp = await apiFetch(`/exams/${examId}`).catch(()=>null);
//     if (!resp || !resp.ok) { alert('Failed to load exam'); return; }
//     const exam = resp.exam;
//     renderExamDetail(exam);
//   }

//   // render detail
//   async function renderExamDetail(exam) {
//     app.innerHTML = '';
//     const container = document.createElement('div');

//     const top = document.createElement('div');
//     top.style.display = 'flex';
//     top.style.justifyContent = 'space-between';
//     top.style.alignItems = 'center';
//     top.innerHTML = `<div><h3>${escapeHtml(exam.title)}</h3><div class="muted">Code: ${escapeHtml(exam.examCode)}</div></div>`;
//     const right = document.createElement('div');
//     right.style.display = 'flex';
//     right.style.gap = '8px';

//     const backBtn = document.createElement('button'); backBtn.className = 'btn btn--outline'; backBtn.textContent = 'Back'; backBtn.addEventListener('click', loadExams);
//     right.appendChild(backBtn);

//     // Export all
//     const exportAll = document.createElement('button'); exportAll.className='btn'; exportAll.textContent='Export PDF (All)';
//     exportAll.addEventListener('click', ()=> { window.open(`/api/exams/${exam._id}/export?token=${localStorage.getItem('auth_token')}`, '_blank'); });
//     right.appendChild(exportAll);

//     top.appendChild(right);
//     container.appendChild(top);

//     // classes cards area
//     const classesWrap = document.createElement('div');
//     classesWrap.style.display = 'flex';
//     classesWrap.style.flexWrap = 'wrap';
//     classesWrap.style.gap = '8px';
//     classesWrap.style.marginTop = '12px';

//     // if exam.classes empty => all classes -> fetch classes applicable to this manager/admin
//     let classesList = [];
//     if (!exam.classes || exam.classes.length === 0) {
//       const clsResp = await apiFetch('/classes').catch(()=>null);
//       classesList = (clsResp && clsResp.classes) || [];
//     } else {
//       for (const cid of exam.classes) {
//         const c = await apiFetch(`/classes/${cid}`).catch(()=>null);
//         if (c && c.class) classesList.push(c.class);
//       }
//     }

//     classesList.forEach(cls => {
//       const card = document.createElement('div');
//       card.className = 'card';
//       card.style.padding = '10px';
//       card.style.minWidth = '220px';
//       card.innerHTML = `<strong>${escapeHtml(cls.name)}</strong><div class="muted" style="font-size:12px">Class ID: ${cls._id}</div>`;
//       const btns = document.createElement('div'); btns.style.marginTop='8px';
//       const openClassBtn = document.createElement('button'); openClassBtn.className='btn'; openClassBtn.textContent='Open'; openClassBtn.addEventListener('click', ()=> openClassView(exam, cls));
//       btns.appendChild(openClassBtn);
//       const exp = document.createElement('button'); exp.className='btn btn--outline'; exp.textContent='Export (Class)'; exp.addEventListener('click', ()=> {
//         window.open(`/api/exams/${exam._id}/export?classId=${cls._id}&token=${localStorage.getItem('auth_token')}`, '_blank');
//       });
//       btns.appendChild(exp);
//       card.appendChild(btns);
//       classesWrap.appendChild(card);
//     });

//     container.appendChild(classesWrap);

//     // Also show "All students" listing area (search + list)
//     const allWrap = document.createElement('div');
//     allWrap.style.marginTop = '16px';
//     allWrap.innerHTML = `<h4>All Students</h4>`;
//     const searchRow = document.createElement('div');
//     searchRow.style.display='flex';
//     searchRow.style.gap='8px';
//     const searchInput = document.createElement('input');
//     searchInput.placeholder='Search by name or id...';
//     searchInput.style.flex='1';
//     searchRow.appendChild(searchInput);
//     const exportBtn = document.createElement('button'); exportBtn.className='btn btn--outline'; exportBtn.textContent='Export PDF (Filtered)';
//     exportBtn.addEventListener('click', ()=> {
//       window.open(`/api/exams/${exam._id}/export?token=${localStorage.getItem('auth_token')}`, '_blank');
//     });
//     searchRow.appendChild(exportBtn);
//     allWrap.appendChild(searchRow);

//     const studentsList = document.createElement('div');
//     studentsList.style.marginTop = '12px';
//     allWrap.appendChild(studentsList);

//     container.appendChild(allWrap);

//     app.appendChild(container);

//     // prepare result set (already included in exam.results)
//     let results = (exam.results || []).map(r => ({ ...r }));

//     // We need to fetch student details for all results
//     const ids = results.map(r => r.studentId).filter(Boolean);
//     let studentsById = {};
//     if (ids.length) {
//       const sResp = await apiFetch('/students/batch', { method: 'POST', body: { ids } }).catch(()=>null);
//       if (sResp && sResp.ok) {
//         sResp.students.forEach(s => studentsById[String(s._id)] = s);
//       }
//     }
//     results.forEach(r => {
//       r.student = studentsById[String(r.studentId)] || null;
//     });

//     // compute rank overall
//     results.sort((a,b) => (b.total || 0) - (a.total || 0));
//     results.forEach((r,i) => r.rank = i+1);

//     function renderStudentRows(filterText='') {
//       studentsList.innerHTML = '';
//       const table = document.createElement('div');
//       table.style.display = 'grid';
//       table.style.gridTemplateColumns = '40px 120px 1fr 160px';
//       table.style.gap = '8px';
//       table.style.alignItems = 'center';
//       table.innerHTML = `<div><strong>#</strong></div><div><strong>ID</strong></div><div><strong>Name</strong></div><div><strong>Actions</strong></div>`;
//       const ft = (filterText||'').toLowerCase();
//       results.forEach(r => {
//         const s = r.student || {};
//         const display = `${s.fullname || ''} ${String(s._id || '')}`.toLowerCase();
//         if (ft && !display.includes(ft)) return;
//         const row1 = document.createElement('div'); row1.textContent = r.rank;
//         const row2 = document.createElement('div'); row2.textContent = s._id || '—';
//         const row3 = document.createElement('div');
//         row3.innerHTML = `<div style="font-weight:600">${escapeHtml(s.fullname || 'Unknown')}</div><div class="muted" style="font-size:12px">${escapeHtml(s.phone||'')}</div>
//                           <div class="muted" style="font-size:12px">Total: ${r.total || 0} • Avg: ${Math.round((r.average||0)*100)/100}</div>`;
//         const row4 = document.createElement('div'); row4.style.display='flex'; row4.style.gap='6px';
//         const viewBtn = document.createElement('button'); viewBtn.className='btn btn--outline'; viewBtn.textContent='View';
//         viewBtn.addEventListener('click', ()=> viewStudentResult(exam, r));
//         row4.appendChild(viewBtn);

//         // add vs edit toggle
//         const hasResult = true; // since this list from results, result exists
//         if (hasResult) {
//           const editBtn = document.createElement('button'); editBtn.className='btn'; editBtn.textContent='Edit';
//           editBtn.addEventListener('click', ()=> editStudentResult(exam, r));
//           row4.appendChild(editBtn);
//         } else {
//           const addBtn = document.createElement('button'); addBtn.className='btn'; addBtn.textContent='Add';
//           addBtn.addEventListener('click', ()=> addStudentResult(exam, r));
//           row4.appendChild(addBtn);
//         }

//         table.appendChild(row1);
//         table.appendChild(row2);
//         table.appendChild(row3);
//         table.appendChild(row4);
//       });

//       studentsList.appendChild(table);
//     }

//     renderStudentRows('');
//     searchInput.addEventListener('input', (e)=> renderStudentRows(e.target.value));
//   }

//   // open class card view (shows students of that class with search + add/edit)
//   async function openClassView(exam, cls) {
//     app.innerHTML = '';
//     const container = document.createElement('div');

//     const header = document.createElement('div');
//     header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';
//     header.innerHTML = `<div><h3>${escapeHtml(exam.title)} — ${escapeHtml(cls.name)}</h3><div class="muted">Exam Code: ${exam.examCode}</div></div>`;
//     const right = document.createElement('div');
//     const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back'; back.addEventListener('click', ()=> openExam(exam._id));
//     right.appendChild(back);
//     const exportBtn = document.createElement('button'); exportBtn.className='btn'; exportBtn.textContent='Export PDF'; exportBtn.addEventListener('click', ()=> {
//       window.open(`/api/exams/${exam._id}/export?classId=${cls._id}&token=${localStorage.getItem('auth_token')}`, '_blank');
//     });
//     right.appendChild(exportBtn);
//     header.appendChild(right);
//     container.appendChild(header);

//     // search + add results button
//     const controls = document.createElement('div');
//     controls.style.display='flex'; controls.style.gap='8px'; controls.style.marginTop='12px';
//     const search = document.createElement('input'); search.placeholder='Search students by name or id'; search.style.flex='1';
//     controls.appendChild(search);
//     const addResultsBtn = document.createElement('button'); addResultsBtn.className='btn'; addResultsBtn.textContent='Add Results for Class';
//     addResultsBtn.addEventListener('click', ()=> bulkAddResultsForClass(exam._id, cls._id));
//     controls.appendChild(addResultsBtn);
//     container.appendChild(controls);

//     const listWrap = document.createElement('div'); listWrap.style.marginTop='12px';
//     container.appendChild(listWrap);
//     app.appendChild(container);

//     // fetch students for class
//     const studentsResp = await apiFetch(`/classes/${cls._id}/students`).catch(()=>null);
//     const students = (studentsResp && studentsResp.students) || [];

//     // build map of results for this exam
//     const rmap = {};
//     (exam.results || []).forEach(r => { if (String(r.classId) === String(cls._id)) rmap[String(r.studentId)] = r; });

//     function renderList(filter='') {
//       listWrap.innerHTML = '';
//       const table = document.createElement('div');
//       table.style.display = 'grid';
//       table.style.gridTemplateColumns = '40px 140px 1fr 200px';
//       table.style.gap = '8px';
//       table.style.alignItems = 'center';
//       table.innerHTML = `<div><strong>#</strong></div><div><strong>ID</strong></div><div><strong>Name</strong></div><div><strong>Actions</strong></div>`;

//       students.forEach((s, idx) => {
//         const display = `${s.fullname || ''} ${String(s._id||'')}`.toLowerCase();
//         if (filter && !display.includes(filter.toLowerCase())) return;
//         const row1 = document.createElement('div'); row1.textContent = idx+1;
//         const row2 = document.createElement('div'); row2.textContent = s._id;
//         const row3 = document.createElement('div'); row3.innerHTML = `<div style="font-weight:600">${escapeHtml(s.fullname)}</div><div class="muted" style="font-size:12px">${escapeHtml(s.phone||'')}</div>`;
//         const row4 = document.createElement('div'); row4.style.display='flex'; row4.style.gap='6px';
//         const viewBtn = document.createElement('button'); viewBtn.className='btn btn--outline'; viewBtn.textContent='View';
//         viewBtn.addEventListener('click', ()=> {
//           const res = rmap[String(s._id)];
//           if (res) viewStudentResult(exam, res);
//           else alert('No result for this student yet');
//         });
//         row4.appendChild(viewBtn);

//         const res = rmap[String(s._id)];
//         if (res) {
//           const editBtn = document.createElement('button'); editBtn.className='btn'; editBtn.textContent='Edit';
//           editBtn.addEventListener('click', ()=> editStudentResult(exam, res));
//           row4.appendChild(editBtn);
//         } else {
//           const addBtn = document.createElement('button'); addBtn.className='btn'; addBtn.textContent='Add';
//           addBtn.addEventListener('click', ()=> addStudentResultForStudent(exam, s, cls));
//           row4.appendChild(addBtn);
//         }

//         table.appendChild(row1); table.appendChild(row2); table.appendChild(row3); table.appendChild(row4);
//       });

//       listWrap.appendChild(table);
//     }

//     renderList('');
//     search.addEventListener('input', (e)=> renderList(e.target.value));
//   }

//   // view single student's result
//   async function viewStudentResult(exam, result) {
//     app.innerHTML = '';
//     const container = document.createElement('div');
//     const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back'; back.addEventListener('click', ()=> openExam(exam._id));
//     container.appendChild(back);

//     const top = document.createElement('div'); top.style.display='flex'; top.style.gap='12px'; top.style.marginTop='12px';
//     const photo = document.createElement('div'); photo.style.width='140px'; photo.style.height='140px'; photo.style.background='#f3f4f6'; photo.style.display='flex'; photo.style.alignItems='center'; photo.style.justifyContent='center'; photo.style.borderRadius='8px';
//     if (result.student && result.student.photoUrl) {
//       const img = document.createElement('img'); img.src = result.student.photoUrl; img.style.maxWidth='100%'; img.style.maxHeight='100%'; photo.appendChild(img);
//     } else {
//       photo.textContent = (result.student && result.student.fullname ? result.student.fullname.split(' ').map(x=>x[0]).slice(0,2).join('') : 'N/A');
//     }
//     top.appendChild(photo);

//     const info = document.createElement('div');
//     info.innerHTML = `<div style="font-weight:700;font-size:18px">${escapeHtml(result.student ? result.student.fullname : 'Unknown')}</div>
//                       <div class="muted">ID: ${result.student ? result.student._id : ''}</div>
//                       <div class="muted">Phone: ${result.student ? escapeHtml(result.student.phone || '') : ''}</div>
//                       <div style="margin-top:8px" class="muted">Rank: ${result.rank || '-' } • Total: ${result.total || 0} • Avg: ${Math.round((result.average||0)*100)/100}</div>`;
//     top.appendChild(info);

//     container.appendChild(top);

//     // subject list
//     const subWrap = document.createElement('div'); subWrap.style.marginTop='12px';
//     subWrap.innerHTML = `<h4>Subjects & Marks</h4>`;
//     const t = document.createElement('div');
//     t.style.display='grid'; t.style.gridTemplateColumns='1fr 100px'; t.style.gap='8px';
//     (result.marks || []).forEach(m => {
//       const n = document.createElement('div'); n.textContent = `${m.subjectName || m.subjectCode}`;
//       const v = document.createElement('div'); v.textContent = m.mark === null ? '-' : String(m.mark);
//       t.appendChild(n); t.appendChild(v);
//     });
//     const tot = document.createElement('div'); tot.textContent = 'Total:'; const totVal = document.createElement('div'); totVal.textContent = String(result.total || 0);
//     t.appendChild(tot); t.appendChild(totVal);
//     const avg = document.createElement('div'); avg.textContent = 'Average:'; const avgVal = document.createElement('div'); avgVal.textContent = String(Math.round((result.average||0)*100)/100);
//     t.appendChild(avg); t.appendChild(avgVal);

//     subWrap.appendChild(t);
//     container.appendChild(subWrap);

//     // uploaded images
//     if (result.uploadedImages && result.uploadedImages.length) {
//       const imgs = document.createElement('div'); imgs.style.display='flex'; imgs.style.gap='8px'; imgs.style.marginTop='12px';
//       result.uploadedImages.forEach(u => {
//         const imgel = document.createElement('img'); imgel.src = u; imgel.style.maxWidth='200px'; imgel.style.border='1px solid #e5e7eb'; imgel.style.borderRadius='8px';
//         imgs.appendChild(imgel);
//       });
//       container.appendChild(imgs);
//     }

//     // upload more images (only manager/admin)
//     if (['admin','manager'].includes((curUser.role||'').toLowerCase())) {
//       const uploadRow = document.createElement('div'); uploadRow.style.marginTop='12px';
//       const fileInput = document.createElement('input'); fileInput.type='file'; fileInput.multiple = true;
//       const upBtn = document.createElement('button'); upBtn.className='btn'; upBtn.textContent='Upload Images';
//       upBtn.addEventListener('click', async () => {
//         if (!fileInput.files || !fileInput.files.length) return alert('Select images first');
//         const fd = new FormData();
//         for (const f of fileInput.files) fd.append('images', f);
//         // direct fetch to server upload endpoint; server expects /api/exams/...
//         const r = await fetch(`/api/exams/${exam._id}/results/${result._id}/images`, {
//           method: 'POST',
//           headers: { 'Authorization': 'Bearer ' + localStorage.getItem('auth_token') },
//           body: fd
//         }).then(r=>r.json()).catch(()=>null);
//         if (!r || !r.ok) { alert('Upload failed'); return; }
//         alert('Uploaded');
//         openExam(exam._id);
//       });
//       uploadRow.appendChild(fileInput); uploadRow.appendChild(upBtn);
//       container.appendChild(uploadRow);
//     }

//     app.appendChild(container);
//   }

//   // Add results for a single student (shows prompt per subject)
//   async function addStudentResultForStudent(exam, student, cls) {
//     const subjects = exam.subjects || [];
//     const marks = [];
//     for (const s of subjects) {
//       const val = prompt(`Enter marks for ${s.name} (max ${s.maxMarks}) for ${student.fullname || student._id}`);
//       const num = val === null ? null : (val === '' ? null : Number(val));
//       marks.push({ subjectCode: s.code, subjectName: s.name, mark: num });
//     }
//     const body = { studentId: student._id, classId: cls._id, marks };
//     const r = await apiFetch(`/exams/${exam._id}/results`, { method: 'POST', body }).catch(()=>null);
//     if (!r || !r.ok) return alert('Failed to add result');
//     alert('Saved');
//     openExam(exam._id);
//   }

//   // Edit student result: show prompt per subject
//   async function editStudentResult(exam, result, createIfMissing=false) {
//     const subjects = exam.subjects || [];
//     const marks = [];
//     for (const s of subjects) {
//       const existing = (result.marks || []).find(m => m.subjectCode === s.code || m.subjectName === s.name);
//       const val = prompt(`Marks for ${s.name} (max ${s.maxMarks})`, existing && (existing.mark !== null && existing.mark !== undefined) ? String(existing.mark) : '');
//       const num = val === null ? (existing ? existing.mark : null) : (val === '' ? null : Number(val));
//       marks.push({ subjectCode: s.code, subjectName: s.name, mark: num });
//     }
//     const body = { studentId: result.studentId || result.student && result.student._id, classId: result.classId, marks };
//     const r = await apiFetch(`/exams/${exam._id}/results`, { method: 'POST', body }).catch(()=>null);
//     if (!r || !r.ok) return alert('Failed to save');
//     alert('Saved');
//     openExam(exam._id);
//   }

//   // Bulk add results for class - prompt for each student sequentially (simple)
//   async function bulkAddResultsForClass(examId, classId) {
//     if (!confirm('Add results for every student in this class (you will be prompted for each)?')) return;
//     const resp = await apiFetch(`/classes/${classId}/students`).catch(()=>null);
//     if (!resp || !resp.students) return alert('Failed to load students');
//     for (const s of resp.students) {
//       const yes = confirm(`Add result for ${s.fullname} (${s._id})?`);
//       if (!yes) continue;
//       // fetch exam to get subjects
//       const examResp = await apiFetch(`/exams/${examId}`).catch(()=>null);
//       const examObj = (examResp && examResp.ok) ? examResp.exam : { subjects: [] };
//       await addStudentResultForStudent(examObj, s, { _id: classId });
//     }
//     openExam(examId);
//   }

//   // initial load
//   await loadExams();
// }

// frontend/js/exams.js
// ---------- EXAMS (frontend) ----------
// ---------- EXAMS ----------
// ---------- EXAMS ----------
// ---------- EXAMS ----------
async function renderExams() {
  app.innerHTML = '';
  const node = tpl('tpl-exams');
  app.appendChild(node);

  const addExamBtn = document.getElementById('add-exam-btn');
  const examsList = document.getElementById('exams-list');

  const curUser = await getCurrentUser().catch(()=>null);
  if (!curUser) { navigate('login'); return; }

  // API base helper (matches backend origin)
  function getApiBase() {
    return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5000/api'
      : '/api';
  }

  // build absolute URL for server-relative photos
  function buildStudentPhotoUrl(photoVal) {
    if (!photoVal) return null;
    const p = String(photoVal);
    if (/^https?:\/\//i.test(p)) return p;
    const origin = getApiBase().replace(/\/api$/, '');
    return p.startsWith('/') ? origin + p : origin + '/' + p;
  }

  // resolve photo for a student object (available everywhere)
  function resolvePhotoForStudent(student) {
    if (!student) return null;
    const candidate = student.photoUrl || student.photo || student.avatar || null;
    if (!candidate) return null;
    return buildStudentPhotoUrl(candidate);
  }

  // user-visible student id (NumberId with '#') and "raw" number
  function visibleStudentId(s) {
    if (!s) return '—';
    if (s.numberId) return String(s.numberId).startsWith('#') ? String(s.numberId) : ('#' + String(s.numberId));
    if (s.customId) return s.customId;
    if (s._id) return String(s._id).slice(-8); // short fallback
    return '—';
  }
  function rawStudentNumber(s) {
    if (!s) return '—';
    if (s.numberId) return String(s.numberId).startsWith('#') ? String(s.numberId).replace(/^#/, '') : String(s.numberId);
    return '';
  }

  // Load classes visible to this user (dedupe)
  async function loadClassesForUser() {
    try {
      const res = await apiFetch('/classes').catch(()=>null);
      const arr = res && (res.items || res.classes || res) || [];
      if (!Array.isArray(arr)) return [];
      const map = {};
      return arr.filter(c => {
        const id = c._id || c.id;
        if (!id) return false;
        if (map[id]) return false;
        map[id] = true;
        return true;
      });
    } catch (e) { return []; }
  }

  // Load and render exams grid
  async function loadExams() {
    examsList.innerHTML = '<div class="muted">Loading...</div>';
    const resp = await apiFetch('/exams').catch(e => ({ ok:false }));
    if (!resp || !resp.ok) {
      examsList.innerHTML = '<div class="muted">Failed to load exams.</div>';
      return;
    }
    const exams = resp.exams || resp.items || resp || [];
    renderExamsGrid(exams);
  }

  function renderExamsGrid(exams) {
    examsList.innerHTML = '';
    if (!exams || !exams.length) {
      examsList.innerHTML = '<div class="muted">No exams found</div>';
      return;
    }
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(260px,1fr))';
    grid.style.gap = '12px';

    exams.forEach(exam => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = '12px';
      const title = document.createElement('div');
      title.innerHTML = `<strong>${escapeHtml(exam.title)}</strong><div class="muted" style="font-size:12px">Code: ${escapeHtml(exam.examCode || '')}</div>`;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.style.marginTop = '8px';
      meta.innerHTML = `<div class="muted" style="font-size:12px">Created: ${exam.createdAt ? new Date(exam.createdAt).toLocaleString() : '—'}</div>`;
      card.appendChild(meta);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';
      actions.style.marginTop = '10px';

      const openBtn = document.createElement('button');
      openBtn.className = 'btn';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', () => openExam(exam._id));
      actions.appendChild(openBtn);

      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn btn--outline';
      exportBtn.textContent = 'Export PDF (All)';
      exportBtn.addEventListener('click', () => {
        const url = `${getApiBase()}/exams/${exam._id}/export?token=${encodeURIComponent(localStorage.getItem('auth_token')||'')}`;
        window.open(url, '_blank');
      });
      actions.appendChild(exportBtn);

      if ((curUser.role||'').toLowerCase() === 'admin') {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn--danger';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this exam?')) return;
          try {
            await apiFetch(`/exams/${exam._id}`, { method: 'DELETE' });
            await loadExams();
          } catch (err) { alert('Delete failed'); }
        });
        actions.appendChild(delBtn);
      }

      card.appendChild(actions);
      grid.appendChild(card);
    });

    examsList.appendChild(grid);
  }

  // show create exam modal (same logic you've used)
  async function showCreateExamModal() {
    if (!['admin','manager'].includes((curUser.role||'').toLowerCase())) { alert('Only admin/manager can create exams'); return; }
    const classes = await loadClassesForUser();
    const form = document.createElement('div');
    form.style.maxWidth = '820px';
    form.style.width = '100%';
    form.innerHTML = `
      <h3>Create Exam</h3>
      <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
        <label style="width:90px">Title</label>
        <input id="exam-title" type="text" placeholder="e.g. Semester 4 Results" style="flex:1; padding:6px" />
      </div>
      <div style="margin-top:8px; display:flex; gap:8px; align-items:flex-start;">
        <label style="width:90px; margin-top:6px">Classes</label>
        <div style="flex:1">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
            <label><input id="select-all-classes" type="checkbox" /> Apply to <strong>All classes</strong></label>
            <span class="muted" style="margin-left:8px">Or choose specific classes below</span>
          </div>
          <select id="classes-select" multiple size="6" style="width:100%; min-height:120px; padding:6px; box-sizing:border-box;"></select>
          <div id="classes-hint" class="muted" style="font-size:12px; margin-top:6px;"></div>
        </div>
      </div>
      <div style="margin-top:12px;">
        <label style="display:block; margin-bottom:6px">Subjects</label>
        <div id="subjects-wrap" style="display:flex; flex-direction:column; gap:6px;"></div>
        <div style="margin-top:6px">
          <button id="add-subject-row" class="btn btn--outline">+ Add Subject</button>
        </div>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
        <button id="cancel-create-exam" class="btn btn--outline">Cancel</button>
        <button id="save-create-exam" class="btn">Save Exam</button>
      </div>
    `;

    const classesSelect = form.querySelector('#classes-select');
    const classesHint = form.querySelector('#classes-hint');
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c._id || c.id;
      opt.textContent = (c.name || c.className) + (c.section ? ` — ${c.section}` : '');
      classesSelect.appendChild(opt);
    });
    classesHint.textContent = `${classes.length} classes available`;

    const subjectsWrap = form.querySelector('#subjects-wrap');
    function addSubjectRow(subject = { code:'', name:'', maxMarks:100 }) {
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr 1.6fr 110px 36px';
      row.style.gap = '6px';
      row.style.alignItems = 'center';
      const codeIn = document.createElement('input'); codeIn.placeholder = 'Code (e.g. MAT)'; codeIn.value = subject.code || ''; codeIn.style.padding='6px';
      const nameIn = document.createElement('input'); nameIn.placeholder = 'Subject name'; nameIn.value = subject.name || ''; nameIn.style.padding='6px';
      const maxIn = document.createElement('input'); maxIn.type='number'; maxIn.min='1'; maxIn.placeholder='Max (100)'; maxIn.value = subject.maxMarks != null ? subject.maxMarks : 100; maxIn.style.padding='6px';
      const delBtn = document.createElement('button'); delBtn.type='button'; delBtn.className='btn btn--danger'; delBtn.textContent='✕'; delBtn.addEventListener('click', ()=> row.remove());
      row.appendChild(codeIn); row.appendChild(nameIn); row.appendChild(maxIn); row.appendChild(delBtn);
      subjectsWrap.appendChild(row);
    }
    addSubjectRow({ code:'MAT', name:'Math', maxMarks:100 });
    addSubjectRow({ code:'ENG', name:'English', maxMarks:100 });

    form.querySelector('#add-subject-row').addEventListener('click', (e)=>{ e.preventDefault(); addSubjectRow({}); });
    form.querySelector('#cancel-create-exam').addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });

    form.querySelector('#save-create-exam').addEventListener('click', async (e) => {
      e.preventDefault();
      const title = form.querySelector('#exam-title').value.trim();
      const selectAll = form.querySelector('#select-all-classes').checked;
      const selectedClassIds = selectAll ? [] : Array.from(classesSelect.selectedOptions).map(o=>o.value);
      const subs = [];
      for(const row of subjectsWrap.children){
        const inputs = row.querySelectorAll('input');
        if (!inputs || inputs.length < 3) continue;
        const code = (inputs[0].value||'').trim(), name = (inputs[1].value||'').trim(), maxMarks = Number(inputs[2].value||100);
        if(!code && !name) continue;
        subs.push({ code: code||name.substr(0,3).toUpperCase(), name: name||code||'Subject', maxMarks: isNaN(maxMarks)?100:maxMarks });
      }
      if (!title) return alert('Enter exam title');
      if (!selectAll && selectedClassIds.length===0 && !confirm('No classes selected — this will apply to ALL classes. Continue?')) return;
      try {
        const create = await apiFetch('/exams', { method:'POST', body: { title, classes: selectAll?[]:selectedClassIds, subjects: subs, schoolId: curUser.schoolId || null } });
        if (!create || !create.ok) { alert('Failed to create exam'); return; }
        closeModal();
        await loadExams();
      } catch (err) { alert('Create failed: ' + (err.message||err)); }
    });

    showModal(form);
  }

  addExamBtn?.addEventListener('click', showCreateExamModal);

  // open exam detail and render
  async function openExam(examId) {
    const resp = await apiFetch(`/exams/${examId}`).catch(()=>null);
    if (!resp || !resp.ok) { alert('Failed to load exam'); return; }
    const exam = resp.exam;
    renderExamDetail(exam);
  }

  // render exam details, students, classes, results
  async function renderExamDetail(exam) {
    app.innerHTML = '';
    const container = document.createElement('div');

    // top header
    const top = document.createElement('div');
    top.style.display='flex'; top.style.justifyContent='space-between'; top.style.alignItems='center';
    top.innerHTML = `<div><h3>${escapeHtml(exam.title)}</h3><div class="muted">Code: ${escapeHtml(exam.examCode || '')}</div></div>`;
    const right = document.createElement('div'); right.style.display='flex'; right.style.gap='8px';
    const backBtn = document.createElement('button'); backBtn.className='btn btn--outline'; backBtn.textContent='Back'; backBtn.addEventListener('click', loadExams);
    right.appendChild(backBtn);
    const exportAll = document.createElement('button'); exportAll.className='btn'; exportAll.textContent='Export PDF (All)';
    exportAll.addEventListener('click', ()=> {
      const url = `${getApiBase()}/exams/${exam._id}/export?token=${encodeURIComponent(localStorage.getItem('auth_token')||'')}`;
      window.open(url,'_blank');
    });
    right.appendChild(exportAll);
    top.appendChild(right);
    container.appendChild(top);

    // classes list — get details for each exam class (fallbacks)
    const classesWrap = document.createElement('div');
    classesWrap.style.display='flex'; classesWrap.style.flexWrap='wrap'; classesWrap.style.gap='8px'; classesWrap.style.marginTop='12px';
    let classesList = [];
    if (!exam.classes || !exam.classes.length) {
      classesList = await loadClassesForUser();
    } else {
      for (const cid of exam.classes) {
        const crep = await apiFetch(`/classes/${cid}`).catch(()=>null);
        if (crep && crep.class) classesList.push(crep.class);
        else {
          const all = await loadClassesForUser();
          const found = all.find(x => (x._id||x.id) === String(cid));
          if (found) classesList.push(found);
        }
      }
    }
    // build classes map and store to window cache for view lookups
    const classesMap = {};
    classesList.forEach(c => { if (c && (c._id || c.id)) classesMap[String(c._id || c.id)] = c; });
    window._classes_cache = window._classes_cache || {};
    Object.assign(window._classes_cache, classesMap);

    classesList.forEach(cls => {
      const card = document.createElement('div'); card.className='card'; card.style.padding='10px'; card.style.minWidth='220px';
      card.innerHTML = `<strong>${escapeHtml(cls.name||cls.className||'Unnamed')}</strong><div class="muted" style="font-size:12px">Class ID: ${escapeHtml(cls._id||cls.id||'')}</div>`;
      const btns = document.createElement('div'); btns.style.marginTop='8px';
      const openClassBtn = document.createElement('button'); openClassBtn.className='btn'; openClassBtn.textContent='Open'; openClassBtn.addEventListener('click', ()=> openClassView(exam, cls));
      btns.appendChild(openClassBtn);
      const exp = document.createElement('button'); exp.className='btn btn--outline'; exp.textContent='Export (Class)'; exp.addEventListener('click', ()=> {
        const url = `${getApiBase()}/exams/${exam._id}/export?classId=${cls._id}&token=${encodeURIComponent(localStorage.getItem('auth_token')||'')}`; window.open(url,'_blank');
      });
      btns.appendChild(exp);
      card.appendChild(btns);
      classesWrap.appendChild(card);
    });
    container.appendChild(classesWrap);

    // All students area
    const allWrap = document.createElement('div'); allWrap.style.marginTop='16px'; allWrap.innerHTML = `<h4>Students</h4>`;
    const searchRow = document.createElement('div'); searchRow.style.display='flex'; searchRow.style.gap='8px';
    const searchInput = document.createElement('input'); searchInput.placeholder='Search by name, number or id...'; searchInput.style.flex='1';
    searchRow.appendChild(searchInput);
    const exportBtn = document.createElement('button'); exportBtn.className = 'btn btn--outline'; exportBtn.textContent='Export PDF (Filtered)';
    exportBtn.addEventListener('click', ()=> {
      const url = `${getApiBase()}/exams/${exam._id}/export?token=${encodeURIComponent(localStorage.getItem('auth_token')||'')}`;
      window.open(url,'_blank');
    });
    searchRow.appendChild(exportBtn);
    allWrap.appendChild(searchRow);

    const studentsList = document.createElement('div'); studentsList.style.marginTop='12px'; allWrap.appendChild(studentsList);
    container.appendChild(allWrap);
    app.appendChild(container);

    // prepare results and student fetch
    const results = (exam.results || []).map(r => ({ ...r }));
    const ids = results.map(r => r.studentId).filter(Boolean).map(String);
    let studentsById = {};
    if (ids.length) {
      const b = await apiFetch('/students/batch', { method: 'POST', body: { ids } }).catch(()=>null);
      const arr = b && (b.students || b.items || b.data) || [];
      arr.forEach(s => { if (s && s._id) studentsById[String(s._id)] = s; });
    }
    results.forEach(r => {
      const s = studentsById[String(r.studentId)];
      r.student = s ? Object.assign({}, s) : null;
    });

    // Build master student list from classes (or all classes)
    let masterStudents = [];
    if (exam.classes && exam.classes.length) {
      for (const cid of exam.classes) {
        const crep = await apiFetch(`/classes/${cid}`).catch(()=>null);
        if (crep && Array.isArray(crep.students)) masterStudents.push(...crep.students);
        else {
          const found = (classesList || []).find(x => (x._id||x.id) === String(cid));
          if (found) {
            const crep2 = await apiFetch(`/classes/${found._id}`).catch(()=>null);
            if (crep2 && Array.isArray(crep2.students)) masterStudents.push(...crep2.students);
          }
        }
      }
    } else {
      // all classes
      const allClassesFull = await loadClassesForUser();
      for (const c of allClassesFull) {
        const crep = await apiFetch(`/classes/${c._id}`).catch(()=>null);
        if (crep && Array.isArray(crep.students)) masterStudents.push(...crep.students);
      }
    }
    // dedupe master list
    const uniq = {};
    masterStudents = masterStudents.filter(s => {
      if (!s || !s._id) return false;
      if (uniq[String(s._id)]) return false;
      uniq[String(s._id)] = true;
      return true;
    });

    // fill missing student details
    const miss = masterStudents.filter(s => !s.fullname || (!s.photo && !s.photoUrl && !s.avatar)).map(s=>String(s._id));
    if (miss.length) {
      try {
        const b2 = await apiFetch('/students/batch', { method:'POST', body: { ids: Array.from(new Set(miss)) } }).catch(()=>null);
        const arr2 = b2 && (b2.students || b2.items || b2.data) || [];
        const by2 = {};
        arr2.forEach(x => { if (x && x._id) by2[String(x._id)] = x; });
        masterStudents = masterStudents.map(s => {
          const extra = by2[String(s._id)];
          return extra ? Object.assign({}, s, extra) : s;
        });
      } catch (e) {}
    }

    // results map
    const resultsMap = {};
    results.forEach(r => { if (r.studentId) resultsMap[String(r.studentId)] = r; });

    // overall ranking
    const rankAllMap = {};
    [...results].sort((a,b) => (b.total||0) - (a.total||0)).forEach((r,i) => rankAllMap[String(r.studentId)] = i+1);

    // class ranking map
    const classGroups = {};
    results.forEach(r => {
      const cid = String(r.classId || '');
      classGroups[cid] = classGroups[cid] || [];
      classGroups[cid].push(r);
    });
    const classRankMap = {};
    Object.keys(classGroups).forEach(cid => {
      classGroups[cid].sort((a,b) => (b.total||0) - (a.total||0)).forEach((r,i) => { classRankMap[`${cid}::${String(r.studentId)}`] = i+1; });
    });

    // Render student rows
    function renderStudentRows(filterText='') {
      studentsList.innerHTML = '';
      const table = document.createElement('div');
      table.style.display = 'grid';
      table.style.gridTemplateColumns = '40px 180px 1fr 220px';
      table.style.gap = '8px';
      table.style.alignItems = 'center';
      table.innerHTML = `<div><strong>#</strong></div><div><strong>ID / Number</strong></div><div><strong>Name</strong></div><div><strong>Actions</strong></div>`;
      const ft = (filterText||'').toLowerCase();

      masterStudents.forEach((s, idx) => {
        const display = `${s.fullname || ''} ${s.numberId || ''} ${String(s._id||'')}`.toLowerCase();
        if (ft && !display.includes(ft)) return;

        const row1 = document.createElement('div'); row1.textContent = idx+1;

        const row2 = document.createElement('div');
        row2.innerHTML = `<div style="font-weight:600;word-break:break-all">${escapeHtml(visibleStudentId(s))}</div>
                          <div class="muted" style="font-size:12px">${escapeHtml(String(s._id || ''))}</div>`;

        const row3 = document.createElement('div');
        const photoUrl = resolvePhotoForStudent(s);
        const photoHtml = photoUrl ? `<img src="${photoUrl}" style="width:48px;height:48px;border-radius:6px;object-fit:cover;margin-right:8px;vertical-align:middle" />`
                                   : `<div style="display:inline-block;width:48px;height:48px;border-radius:6px;background:#f3f4f6;color:#94a3b8;text-align:center;line-height:48px;margin-right:8px">N/A</div>`;
        const className = (s.classId && window._classes_cache && window._classes_cache[String(s.classId)]) ? (window._classes_cache[String(s.classId)].name || '—') : (s.className || '—');
        row3.innerHTML = `<div style="display:flex;align-items:center"><div>${photoHtml}</div><div style="flex:1"><div style="font-weight:600">${escapeHtml(s.fullname || 'Unknown')}</div><div class="muted" style="font-size:12px">${escapeHtml(s.phone||'')}</div></div></div>
                          <div class="muted" style="margin-top:6px;font-size:12px">Class: ${escapeHtml(className)}</div>`;

        const row4 = document.createElement('div'); row4.style.display='flex'; row4.style.gap='6px';
        const res = resultsMap[String(s._id)];
        if (res) {
          if (!res.student) res.student = Object.assign({}, studentsById[String(res.studentId)] || s || { _id: s._id, fullname: s.fullname, phone: s.phone });
          const overallRank = rankAllMap[String(res.studentId)] || '—';
          const classRank = classRankMap[`${String(res.classId||'')}::${String(res.studentId)}`] || '—';

          const viewBtn = document.createElement('button'); viewBtn.className='btn btn--outline'; viewBtn.textContent='View';
          viewBtn.addEventListener('click', ()=> viewStudentResult(exam, res, { overallRank, classRank, className }));
          row4.appendChild(viewBtn);

          const editBtn = document.createElement('button'); editBtn.className='btn'; editBtn.textContent='Edit';
          editBtn.addEventListener('click', ()=> editStudentResult(exam, res));
          row4.appendChild(editBtn);
        } else {
          const viewBtn = document.createElement('button'); viewBtn.className='btn btn--outline'; viewBtn.textContent='View';
          viewBtn.addEventListener('click', ()=> alert('No result for this student yet'));
          row4.appendChild(viewBtn);

          const addBtn = document.createElement('button'); addBtn.className='btn'; addBtn.textContent='Add';
          addBtn.addEventListener('click', ()=> addStudentResultForStudent(exam, s, { _id: s.classId || null }));
          row4.appendChild(addBtn);
        }

        table.appendChild(row1); table.appendChild(row2); table.appendChild(row3); table.appendChild(row4);
      });

      studentsList.appendChild(table);
    }

    renderStudentRows('');
    searchInput.addEventListener('input', (e)=> renderStudentRows(e.target.value));
  }

  // openClassView unchanged behavior (uses window._classes_cache for class names)
  async function openClassView(exam, cls) {
    app.innerHTML = '';
    const container = document.createElement('div');

    const header = document.createElement('div');
    header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';
    header.innerHTML = `<div><h3>${escapeHtml(exam.title)} — ${escapeHtml(cls.name || cls.className || 'Class')}</h3><div class="muted">Exam Code: ${escapeHtml(exam.examCode || '')}</div></div>`;
    const right = document.createElement('div');
    const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back'; back.addEventListener('click', ()=> openExam(exam._id));
    right.appendChild(back);
    const exportBtn = document.createElement('button'); exportBtn.className='btn'; exportBtn.textContent='Export PDF'; exportBtn.addEventListener('click', ()=> {
      const url = `${getApiBase()}/exams/${exam._id}/export?classId=${cls._id}&token=${encodeURIComponent(localStorage.getItem('auth_token')||'')}`;
      window.open(url,'_blank');
    });
    right.appendChild(exportBtn);
    header.appendChild(right);
    container.appendChild(header);

    const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='8px'; controls.style.marginTop='12px';
    const search = document.createElement('input'); search.placeholder='Search students by name or id'; search.style.flex='1';
    controls.appendChild(search);
    const addResultsBtn = document.createElement('button'); addResultsBtn.className='btn'; addResultsBtn.textContent='Add Results for Class';
    addResultsBtn.addEventListener('click', ()=> bulkAddResultsForClass(exam._id, cls._id));
    controls.appendChild(addResultsBtn);
    container.appendChild(controls);

    const listWrap = document.createElement('div'); listWrap.style.marginTop='12px';
    container.appendChild(listWrap);
    app.appendChild(container);

    const studentsResp = await apiFetch(`/classes/${cls._id}`).catch(()=>null);
    const students = (studentsResp && studentsResp.students) || [];

    const rmap = {};
    (exam.results || []).forEach(r => { if (String(r.classId) === String(cls._id)) rmap[String(r.studentId)] = r; });

    const classResults = (exam.results || []).filter(r => String(r.classId) === String(cls._id));
    classResults.sort((a,b) => (b.total||0) - (a.total||0));
    const classRank = {};
    classResults.forEach((r,i) => classRank[String(r.studentId)] = i+1);

    function renderList(filter='') {
      listWrap.innerHTML = '';
      const table = document.createElement('div');
      table.style.display = 'grid';
      table.style.gridTemplateColumns = '40px 140px 1fr 200px';
      table.style.gap = '8px';
      table.style.alignItems = 'center';
      table.innerHTML = `<div><strong>#</strong></div><div><strong>ID</strong></div><div><strong>Name</strong></div><div><strong>Actions</strong></div>`;

      students.forEach((s, idx) => {
        const display = `${s.fullname || ''} ${String(s._id||'')}`.toLowerCase();
        if (filter && !display.includes(filter.toLowerCase())) return;
        const row1 = document.createElement('div'); row1.textContent = idx+1;
        const row2 = document.createElement('div'); row2.textContent = visibleStudentId(s);
        const row3 = document.createElement('div'); row3.innerHTML = `<div style="font-weight:600">${escapeHtml(s.fullname)}</div><div class="muted" style="font-size:12px">${escapeHtml(s.phone||'')}</div>`;
        const row4 = document.createElement('div'); row4.style.display='flex'; row4.style.gap='6px';
        const viewBtn = document.createElement('button'); viewBtn.className='btn btn--outline'; viewBtn.textContent='View';
        viewBtn.addEventListener('click', ()=> {
          const res = rmap[String(s._id)];
          if (res) {
            const overallRank = null;
            const cRank = classRank[String(s._id)] || '—';
            viewStudentResult(exam, res, { overallRank, classRank: cRank, className: cls.name });
          }
          else alert('No result for this student yet');
        });
        row4.appendChild(viewBtn);

        const res = rmap[String(s._id)];
        if (res) {
          const editBtn = document.createElement('button'); editBtn.className='btn'; editBtn.textContent='Edit';
          editBtn.addEventListener('click', ()=> editStudentResult(exam, res));
          row4.appendChild(editBtn);
        } else {
          const addBtn = document.createElement('button'); addBtn.className='btn'; addBtn.textContent='Add';
          addBtn.addEventListener('click', ()=> addStudentResultForStudent(exam, s, cls));
          row4.appendChild(addBtn);
        }

        table.appendChild(row1); table.appendChild(row2); table.appendChild(row3); table.appendChild(row4);
      });

      listWrap.appendChild(table);
    }

    renderList('');
    search.addEventListener('input', (e)=> renderList(e.target.value));
  }

  // view single student result — uses shared helpers and window._classes_cache
  async function viewStudentResult(exam, result, extras = {}) {
    app.innerHTML = '';
    const container = document.createElement('div');
    const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back'; back.addEventListener('click', ()=> openExam(exam._id));
    container.appendChild(back);

    // ensure student details
    if ((!result.student || !result.student.fullname) && result.studentId) {
      try {
        const r2 = await apiFetch('/students/batch', { method:'POST', body:{ ids: [result.studentId] } }).catch(()=>null);
        const arr = r2 && (r2.students || r2.items || r2.data) || [];
        if (arr.length) result.student = Object.assign({}, arr[0]);
      } catch(e){}
    }

    const top = document.createElement('div'); top.style.display='flex'; top.style.gap='12px'; top.style.marginTop='12px';
    const photo = document.createElement('div'); photo.style.width='140px'; photo.style.height='140px'; photo.style.background='#f3f4f6'; photo.style.display='flex'; photo.style.alignItems='center'; photo.style.justifyContent='center'; photo.style.borderRadius='8px';

    const src = resolvePhotoForStudent(result.student);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.style.maxWidth='100%'; img.style.maxHeight='100%';
      img.onerror = ()=> { img.style.display='none'; photo.textContent = (result.student && result.student.fullname ? result.student.fullname.split(' ').map(x=>x[0]).slice(0,2).join('') : 'N/A'); };
      photo.appendChild(img);
    } else {
      photo.textContent = (result.student && result.student.fullname ? result.student.fullname.split(' ').map(x=>x[0]).slice(0,2).join('') : 'N/A');
    }
    top.appendChild(photo);

    const info = document.createElement('div');
    const stud = result.student || {};
    const visibleId = visibleStudentId(stud) || visibleStudentId({ _id: result.studentId });
    const numberId = rawStudentNumber(stud) || rawStudentNumber({ _id: result.studentId });
    const phone = stud.phone || '';
    const className = stud.className || (stud.classId && window._classes_cache && window._classes_cache[String(stud.classId)] ? (window._classes_cache[String(stud.classId)].name || '—') : extras.className || '—');
    const overallRank = extras.overallRank || result.rank || '—';
    const classRank = extras.classRank || (classRankMap && result.classId ? (classRankMap[`${String(result.classId)}::${String(result.studentId)}`] || '—') : '—');

    info.innerHTML = `<div style="font-weight:700;font-size:18px">${escapeHtml(stud.fullname || 'Unknown')}</div>
                      <div class="muted">ID: ${escapeHtml(visibleId)}</div>
                      <div class="muted">Number: ${escapeHtml(numberId)}</div>
                      <div class="muted">Phone: ${escapeHtml(phone)}</div>
                      <div class="muted">Class: ${escapeHtml(className)}</div>
                      <div style="margin-top:8px" class="muted">Rank (overall): ${escapeHtml(String(overallRank))} • Rank (class): ${escapeHtml(String(classRank))} • Total: ${result.total || 0} • Avg: ${Math.round((result.average||0)*100)/100}</div>`;
    top.appendChild(info);
    container.appendChild(top);

    // subjects
    const subWrap = document.createElement('div'); subWrap.style.marginTop='12px';
    subWrap.innerHTML = `<h4>Subjects & Marks</h4>`;
    const t = document.createElement('div'); t.style.display='grid'; t.style.gridTemplateColumns='1fr 100px'; t.style.gap='8px';
    (result.marks || []).forEach(m => {
      const n = document.createElement('div'); n.textContent = `${m.subjectName || m.subjectCode || ''}`;
      const v = document.createElement('div'); v.textContent = (m.mark === null || m.mark === undefined) ? '-' : String(m.mark);
      t.appendChild(n); t.appendChild(v);
    });
    const tot = document.createElement('div'); tot.textContent = 'Total:'; const totVal = document.createElement('div'); totVal.textContent = String(result.total || 0);
    t.appendChild(tot); t.appendChild(totVal);
    const avg = document.createElement('div'); avg.textContent = 'Average:'; const avgVal = document.createElement('div'); avgVal.textContent = String(Math.round((result.average||0)*100)/100);
    t.appendChild(avg); t.appendChild(avgVal);
    subWrap.appendChild(t);
    container.appendChild(subWrap);

    // uploaded images
    if (result.uploadedImages && result.uploadedImages.length) {
      const imgs = document.createElement('div'); imgs.style.display='flex'; imgs.style.gap='8px'; imgs.style.marginTop='12px';
      result.uploadedImages.forEach(u => {
        const imgel = document.createElement('img');
        const srcVal = (String(u).startsWith('http') ? u : (getApiBase().replace(/\/api$/, '') + (u.startsWith('/') ? u : '/' + u)));
        imgel.src = srcVal;
        imgel.style.maxWidth='200px'; imgel.style.border='1px solid #e5e7eb'; imgel.style.borderRadius='8px';
        imgs.appendChild(imgel);
      });
      container.appendChild(imgs);
    }

    // upload area for admin/manager
    if (['admin','manager'].includes((curUser.role||'').toLowerCase())) {
      const uploadRow = document.createElement('div'); uploadRow.style.marginTop='12px';
      const fileInput = document.createElement('input'); fileInput.type='file'; fileInput.multiple = true;
      const upBtn = document.createElement('button'); upBtn.className='btn'; upBtn.textContent='Upload Images';
      upBtn.addEventListener('click', async () => {
        if (!fileInput.files || !fileInput.files.length) return alert('Select images first');
        const fd = new FormData();
        for (const f of fileInput.files) fd.append('images', f);
        try {
          const r = await apiUpload(`/exams/${exam._id}/results/${result._id}/images`, fd);
          if (!r || !r.ok) { alert('Upload failed: ' + ((r && r.error) ? r.error : 'unknown')); return; }
          alert('Uploaded');
          openExam(exam._id);
        } catch (err) {
          console.error('Upload failed', err);
          alert('Upload failed: ' + (err && err.message ? err.message : 'server error'));
        }
      });
      uploadRow.appendChild(fileInput); uploadRow.appendChild(upBtn);
      container.appendChild(uploadRow);
    }

    app.appendChild(container);
  }

  // Add, edit, bulk functions (same as your logic; kept intact)
  async function addStudentResultForStudent(exam, student, cls) {
    let classId = null;
    if (cls) {
      if (typeof cls === 'string') classId = cls;
      else if (cls._id) classId = String(cls._id);
      else if (cls.id) classId = String(cls.id);
    }
    if (!classId && student && student.classId) {
      classId = typeof student.classId === 'string' ? student.classId : (student.classId._id || student.classId.id ? String(student.classId._id || student.classId.id) : null);
    }
    if (!classId) {
      const pick = prompt('Enter class ID for this student (or cancel):');
      if (!pick) return alert('Cancelled');
      classId = pick;
    }

    const subjects = exam.subjects || [];
    const marks = [];
    for (const s of subjects) {
      const val = prompt(`Enter marks for ${s.name} (max ${s.maxMarks}) for ${student.fullname || student._id}`);
      const num = val === null ? null : (val === '' ? null : Number(val));
      marks.push({ subjectCode: s.code, subjectName: s.name, mark: num });
    }
    try {
      const body = { studentId: student._id, classId, marks };
      const r = await apiFetch(`/exams/${exam._id}/results`, { method:'POST', body });
      if (!r || !r.ok) { alert('Failed to add result'); return; }
      alert('Saved');
      openExam(exam._id);
    } catch (err) {
      console.error('Add result error', err);
      alert('Failed to add result: ' + (err && err.message ? err.message : 'server error'));
    }
  }

  async function editStudentResult(exam, result, createIfMissing=false) {
    const subjects = exam.subjects || [];
    const marks = [];
    for (const s of subjects) {
      const existing = (result.marks || []).find(m => m.subjectCode === s.code || m.subjectName === s.name);
      const val = prompt(`Marks for ${s.name} (max ${s.maxMarks})`, existing && (existing.mark !== null && existing.mark !== undefined) ? String(existing.mark) : '');
      const num = val === null ? (existing ? existing.mark : null) : (val === '' ? null : Number(val));
      marks.push({ subjectCode: s.code, subjectName: s.name, mark: num });
    }
    let classId = result.classId || (result.student && result.student.classId) || null;
    if (classId && typeof classId === 'object') classId = String(classId._id || classId);
    if (!classId) {
      const pick = prompt('Enter classId for this result (or cancel):');
      if (!pick) return alert('Cancelled');
      classId = pick;
    }
    try {
      const body = { studentId: result.studentId || (result.student && result.student._id), classId, marks };
      const r = await apiFetch(`/exams/${exam._id}/results`, { method:'POST', body });
      if (!r || !r.ok) { alert('Failed to save'); return; }
      alert('Saved');
      openExam(exam._id);
    } catch (err) {
      console.error('Save result error', err);
      alert('Failed to save: ' + (err && err.message ? err.message : 'server error'));
    }
  }

  async function bulkAddResultsForClass(examId, classId) {
    if (!confirm('Add results for every student in this class (you will be prompted for each)?')) return;
    const resp = await apiFetch(`/classes/${classId}`).catch(()=>null);
    if (!resp || !resp.students) return alert('Failed to load students');
    for (const s of resp.students) {
      const yes = confirm(`Add result for ${s.fullname} (${s._id})?`);
      if (!yes) continue;
      const examResp = await apiFetch(`/exams/${examId}`).catch(()=>null);
      const examObj = (examResp && examResp.ok) ? examResp.exam : { subjects: [] };
      await addStudentResultForStudent(examObj, s, { _id: classId });
    }
    openExam(examId);
  }

  // initial load
  await loadExams();
}


// // renderResults - updated to avoid 403 for students
// // renderResults - improved student details, photo, phone, class, ranks and percentage formatting
// async function renderResults() {
//   app.innerHTML = '';
//   const node = tpl('tpl-results');
//   app.appendChild(node);

//   const titleEl = document.getElementById('results-title');
//   const subEl = document.getElementById('results-sub');
//   const controls = document.getElementById('results-controls');
//   const studentCard = document.getElementById('results-student-card');
//   const resultsList = document.getElementById('results-list');

//   const curUser = await getCurrentUser().catch(()=>null);
//   if (!curUser) { navigate('login'); return; }

//   function getApiBase() {
//     return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
//       ? 'http://localhost:5000/api'
//       : '/api';
//   }
//   function buildStudentPhotoUrl(photoVal) {
//     if (!photoVal) return null;
//     const p = String(photoVal);
//     if (/^https?:\/\//i.test(p)) return p;
//     const origin = getApiBase().replace(/\/api$/, '');
//     return p.startsWith('/') ? origin + p : origin + '/' + p;
//   }
//   function resolvePhotoForStudent(student) {
//     if (!student) return null;
//     const candidate = student.photoUrl || student.photo || student.avatar || null;
//     if (!candidate) return null;
//     return buildStudentPhotoUrl(candidate);
//   }
//   function visibleStudentId(s) {
//     if (!s) return '—';
//     if (s.numberId) return String(s.numberId).startsWith('#') ? String(s.numberId) : ('#' + String(s.numberId));
//     if (s.number) return String(s.number);
//     if (s.customId) return s.customId;
//     if (s._id) return String(s._id).slice(-8);
//     return '—';
//   }
//   function visibleStudentNumber(s) {
//     if (!s) return '—';
//     if (s.numberId) return String(s.numberId);
//     if (s.number) return String(s.number);
//     return '—';
//   }

//   // pick which student to view:
//   let studentId = window.__view_student_id || null;
//   if (!studentId && (curUser.role||'').toLowerCase() === 'student') studentId = curUser._id;
//   titleEl.textContent = studentId ? 'Student Results' : 'Results';

//   // controls: for admin/manager provide a quick student lookup box
//   controls.innerHTML = '';
//   if (['admin','manager'].includes((curUser.role||'').toLowerCase())) {
//     const input = document.createElement('input'); input.placeholder = 'Student id / number'; input.style.padding='6px';
//     const loadBtn = document.createElement('button'); loadBtn.className='btn'; loadBtn.textContent='Load';
//     loadBtn.addEventListener('click', async () => {
//       const q = (input.value||'').trim();
//       if (!q) return alert('Enter student id or number');
//       // try direct fetch by id (backend /students/:id) or search endpoint /students?q=
//       let student = null;
//       try {
//         const byId = await apiFetch(`/students/${encodeURIComponent(q)}`).catch(()=>null);
//         if (byId && (byId.student || byId._id)) student = byId.student || byId;
//       } catch(e){}
//       if (!student) {
//         try {
//           const sr = await apiFetch(`/students?q=${encodeURIComponent(q)}`).catch(()=>null);
//           const arr = sr && (sr.items || sr.students || []) || [];
//           if (arr.length) student = arr[0];
//         } catch(e){}
//       }
//       if (!student) return alert('Student not found');
//       window.__view_student_id = String(student._id || student.id);
//       // re-run render
//       await renderResults();
//     });
//     controls.appendChild(input);
//     controls.appendChild(loadBtn);
//   }

//   // main loader for a specific student
//   async function loadAndRenderStudent(studentIdToLoad) {
//     studentCard.innerHTML = '';
//     resultsList.innerHTML = '<div class="muted">Loading results...</div>';

//     // Build query: admins/managers may pass studentId; students must NOT pass studentId (backend uses token)
//     const role = (curUser.role || '').toLowerCase();
//     let q = '';
//     if ((role === 'admin' || role === 'manager') && studentIdToLoad) {
//       q = `?studentId=${encodeURIComponent(studentIdToLoad)}`;
//     } else {
//       q = '';
//     }

//     let resp = null;
//     try {
//       // call /results (server decides student by token when q is empty)
//       resp = await apiFetch(`/results${q}`).catch(()=>null);
//     } catch (e) { resp = null; }

//     if (!resp || !resp.ok) {
//       resultsList.innerHTML = '<div class="muted">Failed to load results</div>';
//       return;
//     }

//     const items = resp.results || [];

//     // If backend didn't include subjects for each exam, we'll fetch exam details for missing ones (cached)
//     const examsMissingSubjects = new Set();
//     items.forEach(it => {
//       if (!it.subjects) examsMissingSubjects.add(String(it.examId));
//     });
//     const examSubjectsMap = {}; // examId -> subjects array
//     if (examsMissingSubjects.size) {
//       const toFetch = Array.from(examsMissingSubjects);
//       await Promise.all(toFetch.map(async eid => {
//         try {
//           const r = await apiFetch(`/exams/${encodeURIComponent(eid)}`).catch(()=>null);
//           if (r && (r.exam || r.ok && r.exam)) {
//             const examObj = r.exam || r;
//             examSubjectsMap[eid] = examObj.subjects || [];
//           } else if (r && r.subjects) {
//             examSubjectsMap[eid] = r.subjects || [];
//           } else {
//             examSubjectsMap[eid] = [];
//           }
//         } catch (err) {
//           examSubjectsMap[eid] = [];
//         }
//       }));
//     }

//     // Get full student doc (prefer calling /students/:id) to ensure photo/phone/number/class
//     let student = null;
//     try {
//       if (studentIdToLoad) {
//         const sresp = await apiFetch(`/students/${encodeURIComponent(studentIdToLoad)}`).catch(()=>null);
//         student = sresp && (sresp.student || sresp) || null;
//       }
//     } catch (e) { student = null; }

//     // fallback extraction from response shape
//     if (!student && items.length) {
//       const first = items[0];
//       if (first.result && first.result.student) student = first.result.student;
//       else if (first.studentFullname || first.studentId) {
//         student = {
//           _id: first.studentId,
//           fullname: first.studentFullname,
//           phone: first.studentPhone || '',
//           numberId: first.studentNumberId || ''
//         };
//       }
//     }

//     // if still no student and current user is a student, use curUser (helps when server returns minimal data)
//     if (!student && !studentIdToLoad && role === 'student') {
//       student = { _id: curUser._id, fullname: curUser.fullname || 'Student', phone: curUser.phone || '' };
//     }

//     // final fallback
//     if (!student) student = { _id: studentIdToLoad || curUser._id || '', fullname: 'Unknown' };

//     // student card
//     const photoUrl = resolvePhotoForStudent(student);
//     const card = document.createElement('div');
//     card.style.display='flex'; card.style.gap='12px'; card.style.alignItems='center';
//     const photo = document.createElement('div');
//     photo.style.width='120px'; photo.style.height='120px'; photo.style.borderRadius='8px'; photo.style.background='#f3f4f6';
//     photo.style.display='flex'; photo.style.alignItems='center'; photo.style.justifyContent='center';
//     if (photoUrl) {
//       const img = document.createElement('img'); img.src = photoUrl; img.style.maxWidth='100%'; img.style.maxHeight='100%'; img.alt = student.fullname || 'photo';
//       img.onerror = ()=> { img.style.display='none'; photo.textContent = (student.fullname||'N/A').split(' ').map(x=>x[0]||'').slice(0,2).join(''); };
//       photo.appendChild(img);
//     } else {
//       photo.textContent = (student.fullname||'N/A').split(' ').map(x=>x[0]||'').slice(0,2).join('');
//     }

//     const info = document.createElement('div'); info.style.flex='1';
//     // numberId / number field, phone, class - prefer student doc fields returned from server
//     const numberDisplay = visibleStudentNumber(student) || (student.numberId || student.number || '—');
//     const phoneDisplay = student.phone || student.mobile || student.tel || '';
//     const classDisplay = student.className || student.class || student.classId || '—';

//     // show main student info
//     info.innerHTML = `<div style="font-weight:700;font-size:18px">${escapeHtml(student.fullname||'Unknown')}</div>
//                       <div class="muted">ID: ${escapeHtml(visibleStudentId(student))}</div>
//                       <div class="muted">Number: ${escapeHtml(numberDisplay)}</div>
//                       <div class="muted">Phone: ${escapeHtml(phoneDisplay)}</div>
//                       <div class="muted">Class: ${escapeHtml(classDisplay)}</div>`;
//     const actions = document.createElement('div'); actions.style.display='flex'; actions.style.flexDirection='column'; actions.style.gap='8px';
//     // export per exam
//     if (items.length) {
//       const exportAll = document.createElement('button'); exportAll.className='btn'; exportAll.textContent='Export All (per exam)';
//       exportAll.addEventListener('click', ()=> {
//         (items||[]).forEach(it => {
//           const url = `${getApiBase()}/exams/${it.examId}/export?token=${encodeURIComponent(localStorage.getItem('auth_token')||'')}&studentId=${encodeURIComponent(student._id)}`;
//           window.open(url, '_blank');
//         });
//       });
//       actions.appendChild(exportAll);
//     }
//     card.appendChild(photo); card.appendChild(info); card.appendChild(actions);
//     studentCard.appendChild(card);

//     // results list
//     resultsList.innerHTML = '';
//     if (!items.length) { resultsList.innerHTML = '<div class="muted">No results available</div>'; return; }

//     // Build a grouped UI: each exam shows subjects & marks, and summary line with ranks & totals
//     const wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='12px';
//     for (const item of items) {
//       // Normalize result shape:
//       // old shape: item.result (with marks, total, average, uploadedImages, _id, rank maybe)
//       // new shape: top-level fields item.marks, item.total, item.average, item.files, item.rankOverall, item.rankClass
//       const resultObj = item.result ? ({ ...item.result }) : {
//         marks: item.marks || [],
//         total: item.total || 0,
//         average: item.average || 0,
//         uploadedImages: item.files || item.uploadedImages || [],
//         _id: item.result && item.result._id ? item.result._id : (item.resultId || null)
//       };

//       // combine ranks (prefer top-level rankOverall/rankClass, fall back to result.rank or item.rank)
//       const rankOverall = item.rankOverall || resultObj.rank || item.rank || null;
//       const rankClass = item.rankClass || resultObj.rankClass || null;

//       // subjects: prefer item.subjects, else examSubjectsMap
//       const subjects = item.subjects || (examSubjectsMap[String(item.examId)] || []);

//       const panel = document.createElement('div'); panel.className='card'; panel.style.padding='10px';
//       const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';

//       // summary line with ranks and totals (we'll add this below header)
//       header.innerHTML = `<div><strong>${escapeHtml(item.examTitle || item.examTitle || 'Exam')}</strong><div class="muted" style="font-size:12px">${escapeHtml(item.examCode||'')}</div></div>`;
//       const hActions = document.createElement('div'); hActions.style.display='flex'; hActions.style.gap='8px';

//       // Export button (per-exam)
//       const exportBtn = document.createElement('button'); exportBtn.className='btn btn--outline'; exportBtn.textContent='Export';
//       exportBtn.addEventListener('click', ()=> {
//         const url = `${getApiBase()}/exams/${item.examId}/export?token=${encodeURIComponent(localStorage.getItem('auth_token')||'')}&studentId=${encodeURIComponent(student._id)}`;
//         window.open(url, '_blank');
//       });
//       hActions.appendChild(exportBtn);
//       header.appendChild(hActions);
//       panel.appendChild(header);

//       // below header: ranks/total/avg line
//       const totalsLine = document.createElement('div');
//       totalsLine.style.marginTop = '8px';
//       totalsLine.className = 'muted';
//       const totalVal = (typeof resultObj.total === 'number') ? resultObj.total : (item.total || 0);
//       const avgRaw = (typeof resultObj.average === 'number') ? resultObj.average : (item.average || 0);
//       const avgFormatted = (isFinite(avgRaw) ? (Math.round(avgRaw * 10) / 10).toFixed(1) : '0.0');
//       const avgWithPct = avgFormatted + '%';
//       totalsLine.textContent = `Rank (overall): ${rankOverall || '-'} • Rank (class): ${rankClass || '-'} • Total: ${totalVal} • Avg: ${avgWithPct}`;
//       panel.appendChild(totalsLine);

//       // marks grid
//       const marksWrap = document.createElement('div');
//       marksWrap.style.display='grid';
//       if (subjects && subjects.length) {
//         marksWrap.style.gridTemplateColumns = '1fr 120px';
//         marksWrap.style.gap = '6px';
//         marksWrap.style.marginTop = '8px';
//         const marks = Array.isArray(resultObj.marks) ? resultObj.marks : [];
//         subjects.forEach(sub => {
//           const nameCell = document.createElement('div'); nameCell.textContent = sub.name || sub.code || '-';
//           const valueCell = document.createElement('div');
//           const m = marks.find(mm => (String(mm.subjectCode) === String(sub.code)) || (String(mm.subjectName) === String(sub.name)));
//           valueCell.textContent = (m && m.mark !== null && m.mark !== undefined) ? String(m.mark) : '-';
//           valueCell.style.fontWeight = '600';
//           marksWrap.appendChild(nameCell); marksWrap.appendChild(valueCell);
//         });
//       } else {
//         marksWrap.style.gridTemplateColumns = '1fr 120px';
//         marksWrap.style.gap = '6px';
//         marksWrap.style.marginTop = '8px';
//         const marks = Array.isArray(resultObj.marks) ? resultObj.marks : [];
//         if (!marks.length) {
//           const note = document.createElement('div'); note.className='muted'; note.textContent='No marks available';
//           marksWrap.appendChild(note);
//         } else {
//           marks.forEach(m => {
//             const nameCell = document.createElement('div'); nameCell.textContent = m.subjectName || m.subjectCode || '-';
//             const valueCell = document.createElement('div'); valueCell.textContent = (m.mark !== null && m.mark !== undefined) ? String(m.mark) : '-';
//             valueCell.style.fontWeight = '600';
//             marksWrap.appendChild(nameCell); marksWrap.appendChild(valueCell);
//           });
//         }
//       }

//       // summary row (total & average)
//       const totalRowLabel = document.createElement('div'); totalRowLabel.textContent = 'Total';
//       const totalRowVal = document.createElement('div'); totalRowVal.textContent = String(totalVal);
//       marksWrap.appendChild(totalRowLabel); marksWrap.appendChild(totalRowVal);

//       const avgLabel = document.createElement('div'); avgLabel.textContent = 'Average';
//       const avgVal = document.createElement('div'); avgVal.textContent = avgWithPct;
//       marksWrap.appendChild(avgLabel); marksWrap.appendChild(avgVal);

//       panel.appendChild(marksWrap);

//       // uploaded images if any
//       const uploaded = Array.isArray(resultObj.uploadedImages) ? resultObj.uploadedImages : (Array.isArray(item.result && item.result.uploadedImages) ? item.result.uploadedImages : []);
//       if (uploaded && uploaded.length) {
//         const imgs = document.createElement('div'); imgs.style.display='flex'; imgs.style.gap='8px'; imgs.style.marginTop='8px';
//         uploaded.forEach(u => {
//           const a = document.createElement('a');
//           a.href = (String(u).startsWith('http') ? u : (getApiBase().replace(/\/api$/,'') + (u.startsWith('/') ? u : '/' + u)));
//           a.target = '_blank';
//           a.textContent = 'View file';
//           imgs.appendChild(a);
//         });
//         panel.appendChild(imgs);
//       }

//       // manager/admin can upload images (uses apiUpload and your exams route)
//       if (['admin','manager'].includes((curUser.role||'').toLowerCase())) {
//         const resultId = resultObj._id || item.resultId || null; // may be null - disable upload if so
//         const upl = document.createElement('div'); upl.style.marginTop='8px'; upl.style.display='flex'; upl.style.gap='8px'; upl.style.alignItems='center';
//         const input = document.createElement('input'); input.type='file'; input.multiple = true;
//         const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Upload images';
//         if (!resultId) {
//           btn.disabled = true;
//           const note = document.createElement('div'); note.className='muted'; note.style.fontSize='12px';
//           note.textContent = 'Upload disabled: result id not available';
//           upl.appendChild(note);
//         } else {
//           btn.addEventListener('click', async ()=> {
//             if (!input.files || !input.files.length) return alert('Select images first');
//             const fd = new FormData();
//             for (const f of input.files) fd.append('images', f);
//             try {
//               const r = await apiUpload(`/exams/${item.examId}/results/${resultId}/images`, fd);
//               if (!r || !r.ok) return alert('Upload failed: ' + ((r && (r.error || r.message)) ? (r.error || r.message) : 'unknown'));
//               alert('Uploaded');
//               // refresh by reloading results for same student
//               await loadAndRenderStudent(studentIdToLoad);
//             } catch (err) {
//               console.error('upload error', err);
//               alert('Upload failed: ' + (err && err.message ? err.message : 'unknown'));
//             }
//           });
//         }
//         upl.appendChild(input); upl.appendChild(btn);
//         panel.appendChild(upl);
//       }

//       wrap.appendChild(panel);
//     }

//     resultsList.appendChild(wrap);
//   } // end loadAndRenderStudent

//   // initial render
//   if (studentId) await loadAndRenderStudent(studentId);
//   else resultsList.innerHTML = '<div class="muted">No student selected. Admins/managers: use the box above to load a student. Students: login to view your own results.</div>';
// } // end renderResults



// frontend: app.js (or wherever your renderResults lives)
// Replace your existing renderResults function with this full function.

async function renderResults() {
  app.innerHTML = '';
  const node = tpl('tpl-results');
  app.appendChild(node);

  const titleEl = document.getElementById('results-title');
  const subEl = document.getElementById('results-sub');
  const controls = document.getElementById('results-controls');
  const studentCard = document.getElementById('results-student-card');
  const resultsList = document.getElementById('results-list');

  const curUser = await getCurrentUser().catch(()=>null);
  if (!curUser) { navigate('login'); return; }

  function getApiBase() {
    return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5000/api'
      : '/api';
  }
  function buildStudentPhotoUrl(photoVal) {
    if (!photoVal) return null;
    const p = String(photoVal);
    if (/^https?:\/\//i.test(p)) return p;
    const origin = getApiBase().replace(/\/api$/, '');
    return p.startsWith('/') ? origin + p : origin + '/' + p;
  }
  function resolvePhotoForStudent(student) {
    if (!student) return null;
    const candidate = student.photoUrl || student.photo || student.avatar || null;
    if (!candidate) return null;
    return buildStudentPhotoUrl(candidate);
  }
  function visibleStudentId(s) {
    if (!s) return '—';
    if (s.numberId) return String(s.numberId).startsWith('#') ? String(s.numberId) : ('#' + String(s.numberId));
    if (s.number) return String(s.number);
    if (s.customId) return s.customId;
    if (s._id) return String(s._id).slice(-8);
    return '—';
  }
  function visibleStudentNumber(s) {
    if (!s) return '—';
    if (s.numberId) return String(s.numberId);
    if (s.number) return String(s.number);
    return '—';
  }

  // pick which student to view:
  let studentId = window.__view_student_id || null;
  const roleLower = (curUser.role || '').toLowerCase();

  // For students, default to their own id.
  if (!studentId && roleLower === 'student') studentId = curUser._id;

  // For parents: DO NOT pass studentId param in the query string;
  // backend will map parent -> child using token (childId) or Parent lookup.
  if (roleLower === 'parent') studentId = null;

  titleEl.textContent = (studentId || roleLower === 'parent') ? 'Student Results' : 'Results';

  // controls: for admin/manager provide a quick student lookup box
  controls.innerHTML = '';
  if (['admin','manager'].includes(roleLower)) {
    const input = document.createElement('input'); input.placeholder = 'Student id / number'; input.style.padding='6px';
    const loadBtn = document.createElement('button'); loadBtn.className='btn'; loadBtn.textContent='Load';
    loadBtn.addEventListener('click', async () => {
      const q = (input.value||'').trim();
      if (!q) return alert('Enter student id or number');
      // try direct fetch by id (backend /students/:id) or search endpoint /students?q=
      let student = null;
      try {
        const byId = await apiFetch(`/students/${encodeURIComponent(q)}`).catch(()=>null);
        if (byId && (byId.student || byId._id)) student = byId.student || byId;
      } catch(e){}
      if (!student) {
        try {
          const sr = await apiFetch(`/students?q=${encodeURIComponent(q)}`).catch(()=>null);
          const arr = sr && (sr.items || sr.students || []) || [];
          if (arr.length) student = arr[0];
        } catch(e){}
      }
      if (!student) return alert('Student not found');
      window.__view_student_id = String(student._id || student.id);
      // re-run render
      await renderResults();
    });
    controls.appendChild(input);
    controls.appendChild(loadBtn);
  }

  // main loader for a specific student
  async function loadAndRenderStudent(studentIdToLoad) {
    studentCard.innerHTML = '';
    resultsList.innerHTML = '<div class="muted">Loading results...</div>';

    // Build query: admins/managers may pass studentId; students & parents must NOT pass studentId (backend decides by token)
    const role = (curUser.role || '').toLowerCase();
    let q = '';
    if ((role === 'admin' || role === 'manager') && studentIdToLoad) {
      q = `?studentId=${encodeURIComponent(studentIdToLoad)}`;
    } else {
      q = '';
    }

    let resp = null;
    try {
      // call /results (server decides student by token when q is empty)
      resp = await apiFetch(`/results${q}`).catch(()=>null);
    } catch (e) { resp = null; }

    if (!resp || !resp.ok) {
      resultsList.innerHTML = '<div class="muted">Failed to load results</div>';
      return;
    }

    const items = resp.results || [];

    // If backend didn't include subjects for each exam, we'll fetch exam details for missing ones (cached)
    const examsMissingSubjects = new Set();
    items.forEach(it => {
      if (!it.subjects) examsMissingSubjects.add(String(it.examId));
    });
    const examSubjectsMap = {}; // examId -> subjects array
    if (examsMissingSubjects.size) {
      const toFetch = Array.from(examsMissingSubjects);
      await Promise.all(toFetch.map(async eid => {
        try {
          const r = await apiFetch(`/exams/${encodeURIComponent(eid)}`).catch(()=>null);
          if (r && (r.exam || r.ok && r.exam)) {
            const examObj = r.exam || r;
            examSubjectsMap[eid] = examObj.subjects || [];
          } else if (r && r.subjects) {
            examSubjectsMap[eid] = r.subjects || [];
          } else {
            examSubjectsMap[eid] = [];
          }
        } catch (err) {
          examSubjectsMap[eid] = [];
        }
      }));
    }

    // Get full student doc if we explicitly loaded one (admins/managers)
    let student = null;
    try {
      if (studentIdToLoad) {
        const sresp = await apiFetch(`/students/${encodeURIComponent(studentIdToLoad)}`).catch(()=>null);
        student = sresp && (sresp.student || sresp) || null;
      }
    } catch (e) { student = null; }

    // fallback extraction from response shape (the backend returns studentFullname/studentPhone etc)
    if (!student && items.length) {
      const first = items[0];
      if (first.studentFullname || first.studentId) {
        student = {
          _id: first.studentId,
          fullname: first.studentFullname,
          phone: first.studentPhone || '',
          numberId: first.studentNumberId || ''
        };
      }
    }

    // if still no student and current user is a student, use curUser
    if (!student && !studentIdToLoad && role === 'student') {
      student = { _id: curUser._id, fullname: curUser.fullname || 'Student', phone: curUser.phone || '' };
    }

    // final fallback
    if (!student) student = { _id: studentIdToLoad || curUser._id || '', fullname: 'Unknown' };

    // student card
    const photoUrl = resolvePhotoForStudent(student);
    const card = document.createElement('div');
    card.style.display='flex'; card.style.gap='12px'; card.style.alignItems='center';
    const photo = document.createElement('div');
    photo.style.width='120px'; photo.style.height='120px'; photo.style.borderRadius='8px'; photo.style.background='#f3f4f6';
    photo.style.display='flex'; photo.style.alignItems='center'; photo.style.justifyContent='center';
    if (photoUrl) {
      const img = document.createElement('img'); img.src = photoUrl; img.style.maxWidth='100%'; img.style.maxHeight='100%'; img.alt = student.fullname || 'photo';
      img.onerror = ()=> { img.style.display='none'; photo.textContent = (student.fullname||'N/A').split(' ').map(x=>x[0]||'').slice(0,2).join(''); };
      photo.appendChild(img);
    } else {
      photo.textContent = (student.fullname||'N/A').split(' ').map(x=>x[0]||'').slice(0,2).join('');
    }

    const info = document.createElement('div'); info.style.flex='1';
    // numberId / number field, phone, class - prefer student doc fields returned from server
    const numberDisplay = visibleStudentNumber(student) || (student.numberId || student.number || '—');
    const phoneDisplay = student.phone || student.mobile || student.tel || '';
    const classDisplay = student.className || student.class || (student.classId && (student.classId.name || student.classId)) || '—';

    // show main student info
    info.innerHTML = `<div style="font-weight:700;font-size:18px">${escapeHtml(student.fullname||'Unknown')}</div>
                      <div class="muted">ID: ${escapeHtml(visibleStudentId(student))}</div>
                      <div class="muted">Number: ${escapeHtml(numberDisplay)}</div>
                      <div class="muted">Phone: ${escapeHtml(phoneDisplay)}</div>
                      <div class="muted">Class: ${escapeHtml(classDisplay)}</div>`;
    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.flexDirection='column'; actions.style.gap='8px';
    // export per exam
    if (items.length) {
      const exportAll = document.createElement('button'); exportAll.className='btn'; exportAll.textContent='Export All (per exam)';
      exportAll.addEventListener('click', ()=> {
        (items||[]).forEach(it => {
          const url = `${getApiBase()}/exams/${it.examId}/export?token=${encodeURIComponent(localStorage.getItem('auth_token')||'')}&studentId=${encodeURIComponent(student._id)}`;
          window.open(url, '_blank');
        });
      });
      actions.appendChild(exportAll);
    }
    card.appendChild(photo); card.appendChild(info); card.appendChild(actions);
    studentCard.appendChild(card);

    // results list
    resultsList.innerHTML = '';
    if (!items.length) { resultsList.innerHTML = '<div class="muted">No results available</div>'; return; }

    // Build a grouped UI: each exam shows subjects & marks, and summary line with ranks & totals
    const wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='12px';
    for (const item of items) {
      const resultObj = item.result ? ({ ...item.result }) : {
        marks: item.marks || [],
        total: item.total || 0,
        average: item.average || 0,
        uploadedImages: item.files || item.uploadedImages || [],
        _id: item.result && item.result._id ? item.result._id : (item.resultId || null)
      };

      const rankOverall = item.rankOverall || resultObj.rank || item.rank || null;
      const rankClass = item.rankClass || resultObj.rankClass || null;

      const subjects = item.subjects || (examSubjectsMap[String(item.examId)] || []);

      const panel = document.createElement('div'); panel.className='card'; panel.style.padding='10px';
      const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';

      header.innerHTML = `<div><strong>${escapeHtml(item.examTitle || item.examTitle || 'Exam')}</strong><div class="muted" style="font-size:12px">${escapeHtml(item.examCode||'')}</div></div>`;
      const hActions = document.createElement('div'); hActions.style.display='flex'; hActions.style.gap='8px';

      const exportBtn = document.createElement('button'); exportBtn.className='btn btn--outline'; exportBtn.textContent='Export';
      exportBtn.addEventListener('click', ()=> {
        const url = `${getApiBase()}/exams/${item.examId}/export?token=${encodeURIComponent(localStorage.getItem('auth_token')||'')}&studentId=${encodeURIComponent(student._id)}`;
        window.open(url, '_blank');
      });
      hActions.appendChild(exportBtn);
      header.appendChild(hActions);
      panel.appendChild(header);

      const totalsLine = document.createElement('div');
      totalsLine.style.marginTop = '8px';
      totalsLine.className = 'muted';
      const totalVal = (typeof resultObj.total === 'number') ? resultObj.total : (item.total || 0);
      const avgRaw = (typeof resultObj.average === 'number') ? resultObj.average : (item.average || 0);
      const avgFormatted = (isFinite(avgRaw) ? (Math.round(avgRaw * 10) / 10).toFixed(1) : '0.0');
      const avgWithPct = avgFormatted + '%';
      totalsLine.textContent = `Rank (overall): ${rankOverall || '-'} • Rank (class): ${rankClass || '-'} • Total: ${totalVal} • Avg: ${avgWithPct}`;
      panel.appendChild(totalsLine);

      const marksWrap = document.createElement('div');
      marksWrap.style.display='grid';
      if (subjects && subjects.length) {
        marksWrap.style.gridTemplateColumns = '1fr 120px';
        marksWrap.style.gap = '6px';
        marksWrap.style.marginTop = '8px';
        const marks = Array.isArray(resultObj.marks) ? resultObj.marks : [];
        subjects.forEach(sub => {
          const nameCell = document.createElement('div'); nameCell.textContent = sub.name || sub.code || '-';
          const valueCell = document.createElement('div');
          const m = marks.find(mm => (String(mm.subjectCode) === String(sub.code)) || (String(mm.subjectName) === String(sub.name)));
          valueCell.textContent = (m && m.mark !== null && m.mark !== undefined) ? String(m.mark) : '-';
          valueCell.style.fontWeight = '600';
          marksWrap.appendChild(nameCell); marksWrap.appendChild(valueCell);
        });
      } else {
        marksWrap.style.gridTemplateColumns = '1fr 120px';
        marksWrap.style.gap = '6px';
        marksWrap.style.marginTop = '8px';
        const marks = Array.isArray(resultObj.marks) ? resultObj.marks : [];
        if (!marks.length) {
          const note = document.createElement('div'); note.className='muted'; note.textContent='No marks available';
          marksWrap.appendChild(note);
        } else {
          marks.forEach(m => {
            const nameCell = document.createElement('div'); nameCell.textContent = m.subjectName || m.subjectCode || '-';
            const valueCell = document.createElement('div'); valueCell.textContent = (m.mark !== null && m.mark !== undefined) ? String(m.mark) : '-';
            valueCell.style.fontWeight = '600';
            marksWrap.appendChild(nameCell); marksWrap.appendChild(valueCell);
          });
        }
      }

      const totalRowLabel = document.createElement('div'); totalRowLabel.textContent = 'Total';
      const totalRowVal = document.createElement('div'); totalRowVal.textContent = String(totalVal);
      marksWrap.appendChild(totalRowLabel); marksWrap.appendChild(totalRowVal);

      const avgLabel = document.createElement('div'); avgLabel.textContent = 'Average';
      const avgVal = document.createElement('div'); avgVal.textContent = avgWithPct;
      marksWrap.appendChild(avgLabel); marksWrap.appendChild(avgVal);

      panel.appendChild(marksWrap);

      const uploaded = Array.isArray(resultObj.uploadedImages) ? resultObj.uploadedImages : (Array.isArray(item.result && item.result.uploadedImages) ? item.result.uploadedImages : []);
      if (uploaded && uploaded.length) {
        const imgs = document.createElement('div'); imgs.style.display='flex'; imgs.style.gap='8px'; imgs.style.marginTop='8px';
        uploaded.forEach(u => {
          const a = document.createElement('a');
          a.href = (String(u).startsWith('http') ? u : (getApiBase().replace(/\/api$/,'') + (u.startsWith('/') ? u : '/' + u)));
          a.target = '_blank';
          a.textContent = 'View file';
          imgs.appendChild(a);
        });
        panel.appendChild(imgs);
      }

      if (['admin','manager'].includes((curUser.role||'').toLowerCase())) {
        const resultId = resultObj._id || item.resultId || null;
        const upl = document.createElement('div'); upl.style.marginTop='8px'; upl.style.display='flex'; upl.style.gap='8px'; upl.style.alignItems='center';
        const input = document.createElement('input'); input.type='file'; input.multiple = true;
        const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Upload images';
        if (!resultId) {
          btn.disabled = true;
          const note = document.createElement('div'); note.className='muted'; note.style.fontSize='12px';
          note.textContent = 'Upload disabled: result id not available';
          upl.appendChild(note);
        } else {
          btn.addEventListener('click', async ()=> {
            if (!input.files || !input.files.length) return alert('Select images first');
            const fd = new FormData();
            for (const f of input.files) fd.append('images', f);
            try {
              const r = await apiUpload(`/exams/${item.examId}/results/${resultId}/images`, fd);
              if (!r || !r.ok) return alert('Upload failed: ' + ((r && (r.error || r.message)) ? (r.error || r.message) : 'unknown'));
              alert('Uploaded');
              await loadAndRenderStudent(studentIdToLoad);
            } catch (err) {
              console.error('upload error', err);
              alert('Upload failed: ' + (err && err.message ? err.message : 'unknown'));
            }
          });
        }
        upl.appendChild(input); upl.appendChild(btn);
        panel.appendChild(upl);
      }

      wrap.appendChild(panel);
    }

    resultsList.appendChild(wrap);
  } // end loadAndRenderStudent

  // initial render
  if (studentId) await loadAndRenderStudent(studentId);
  else {
    // For parents, call load without studentId so server maps parent -> child
    if (roleLower === 'parent') {
      await loadAndRenderStudent(); // no param -> backend uses token to resolve child
    } else {
      resultsList.innerHTML = '<div class="muted">No student selected. Admins/managers: use the box above to load a student. Students: login to view your own results.</div>';
    }
  }
}
window.renderResults = renderResults;




// Replace your existing renderQuizzes() with this full function
async function renderQuizzes() {
  app.innerHTML = '';
  const node = tpl('tpl-quizzes');
  app.appendChild(node);

  const addBtn = document.getElementById('add-quiz-btn');
  const listWrap = document.getElementById('quizzes-list');

  const curUser = await getCurrentUser().catch(()=>null);
  if (!curUser) { navigate('login'); return; }

  function isTeacherOrManagerOrAdmin() {
    const r = (curUser.role||'').toLowerCase();
    return r === 'teacher' || r === 'manager' || r === 'admin';
  }

  // -------------------------
  // helper: createLabel (added to fix the ReferenceError)
  // -------------------------
  function createLabel(txt) {
    const d = document.createElement('div');
    d.textContent = txt;
    d.style.fontSize = '12px';
    d.style.color = '#444';
    return d;
  }

  // -------------------------
  // load classes for school (cached, defensive)
  // -------------------------
  let __cachedClasses = null;
  async function loadClasses() {
    if (__cachedClasses !== null) return __cachedClasses;

    const schoolId = curUser && (curUser.schoolId || curUser.school) ? String(curUser.schoolId || curUser.school) : null;

    const rawPaths = [
      '/classes?scope=school',
      'classes?scope=school',
      '/classes?scope=all',
      'classes?scope=all',
      '/classes',
      'classes',
      '/schools/me/classes',
      'schools/me/classes'
    ];
    if (schoolId) {
      rawPaths.push(`/schools/${schoolId}/classes`);
      rawPaths.push(`schools/${schoolId}/classes`);
      // sometimes backends accept schoolId as a query param
      rawPaths.push(`/classes?schoolId=${schoolId}`);
      rawPaths.push(`classes?schoolId=${schoolId}`);
    }

    const paths = Array.from(new Set(rawPaths));

    console.info('loadClasses: trying endpoints', paths);

    let found = null;
    for (const path of paths) {
      try {
        // call apiFetch — it prepends API_BASE
        const res = await apiFetch(path).catch(err => {
          // apiFetch throws for non-ok; log and continue
          console.warn('apiFetch rejected for', path, err && (err.message || err.body || err));
          return null;
        });

        console.debug('loadClasses response for', path, res);

        if (!res) continue;

        if (Array.isArray(res)) { found = res; break; }
        if (res && Array.isArray(res.items)) { found = res.items; break; }
        if (res && Array.isArray(res.classes)) { found = res.classes; break; }
        if (res && res.ok && Array.isArray(res.items)) { found = res.items; break; }
        if (res && res.ok && Array.isArray(res.classes)) { found = res.classes; break; }

        // try to detect any array value in response
        if (res && typeof res === 'object') {
          for (const k of Object.keys(res)) {
            if (Array.isArray(res[k])) { found = res[k]; break; }
          }
          if (found) break;
        }
      } catch (err) {
        console.warn('loadClasses try failed for', path, err && (err.message || err.body || err));
      }
    }

    found = found || [];

    // normalize to { _id, name }
    __cachedClasses = (found || []).map(c => {
      if (!c) return null;
      if (typeof c === 'string') return { _id: c, name: c };
      const id = (c._id || c.id || c.classId || c.class_id || null);
      const name = c.name || c.title || c.className || c.label || (id ? String(id) : 'Unnamed');
      return { _id: String(id || name), name: String(name) };
    }).filter(Boolean);

    console.info('loadClasses: resolved', __cachedClasses.length, 'classes');
    return __cachedClasses;
  }

  // ----------------- small modal helper -----------------
  let __quiz_modal_el = null;
  function openModal(contentNode, opts = {}) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = 9999;
    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.padding = '16px';
    box.style.borderRadius = '10px';
    box.style.maxHeight = '86vh';
    box.style.overflow = 'auto';
    box.style.width = opts.width || '820px';
    box.style.boxSizing = 'border-box';
    box.appendChild(contentNode);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    __quiz_modal_el = overlay;
  }
  function closeModal() {
    if (__quiz_modal_el) { try { __quiz_modal_el.remove(); } catch(_){} __quiz_modal_el = null; }
  }

  // ----------------- question editor builder (use your existing one) -----------------
  // If you already have buildQuestionEditor in your file, keep it. If not, paste your version here.
  // For brevity I'll assume your original buildQuestionEditor function is present earlier in the file.
  // If it's not present, let me know and I'll paste it in full.
// paste this inside renderQuizzes(), before showCreateQuizModal()
function buildQuestionEditor(initial = null) {
  const q = initial ? JSON.parse(JSON.stringify(initial)) : { type:'direct', prompt:'', choices:[], correctAnswer:null, points:1 };
  const container = document.createElement('div');
  container.className = 'quiz-q-row';
  container.style.border = '1px solid #eee';
  container.style.padding = '8px';
  container.style.borderRadius = '6px';
  container.style.marginBottom = '8px';

  const top = document.createElement('div'); top.style.display='flex'; top.style.gap='8px'; top.style.alignItems='center';
  const sel = document.createElement('select');
  sel.innerHTML = `<option value="direct">Direct (short answer)</option>
                   <option value="multiple">Multiple choice</option>
                   <option value="fill">Fill in the blank</option>`;
  sel.value = q.type;
  const pointsInput = document.createElement('input'); pointsInput.type='number'; pointsInput.value = q.points || 1; pointsInput.style.width = '72px';
  const removeBtn = document.createElement('button'); removeBtn.className = 'btn btn--danger'; removeBtn.type='button'; removeBtn.textContent = 'Remove';
  top.appendChild(sel); top.appendChild(pointsInput); top.appendChild(removeBtn);

  const prompt = document.createElement('textarea'); prompt.className = 'input'; prompt.placeholder = 'Question text'; prompt.value = q.prompt || ''; prompt.style.marginTop = '8px';
  const choicesArea = document.createElement('div'); choicesArea.style.marginTop = '8px';

  container.appendChild(top);
  container.appendChild(prompt);
  container.appendChild(choicesArea);

  function renderChoicesUI() {
    choicesArea.innerHTML = '';
    if (sel.value === 'multiple') {
      const list = document.createElement('div'); list.style.display='grid'; list.style.gap='6px';
      (q.choices || []).forEach((ch, idx) => {
        const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
        checkbox.checked = (Array.isArray(q.correctAnswer) ? q.correctAnswer.includes(String(ch.id || idx)) : String(q.correctAnswer) === String(ch.id || idx));
        const txt = document.createElement('input'); txt.className = 'input'; txt.value = ch.text || ''; txt.dataset.choiceId = ch.id || (Date.now().toString(36) + idx);
        const del = document.createElement('button'); del.className = 'btn btn--danger'; del.type='button'; del.textContent = '✕';
        row.appendChild(checkbox); row.appendChild(txt); row.appendChild(del);
        list.appendChild(row);

        del.addEventListener('click', () => { q.choices.splice(idx, 1); renderChoicesUI(); });
        txt.addEventListener('input', () => { q.choices[idx].text = txt.value; q.choices[idx].id = txt.dataset.choiceId; });
        checkbox.addEventListener('change', () => {
          const id = txt.dataset.choiceId;
          if (checkbox.checked) {
            if (!Array.isArray(q.correctAnswer)) q.correctAnswer = [];
            if (!q.correctAnswer.includes(String(id))) q.correctAnswer.push(String(id));
          } else {
            if (Array.isArray(q.correctAnswer)) q.correctAnswer = q.correctAnswer.filter(x => String(x) !== String(id));
            else if (String(q.correctAnswer) === String(id)) q.correctAnswer = null;
          }
        });
      });

      const addChoiceBtn = document.createElement('button'); addChoiceBtn.className = 'btn btn--outline'; addChoiceBtn.type='button'; addChoiceBtn.textContent = '+ Add choice';
      addChoiceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const newid = (Date.now().toString(36) + Math.round(Math.random()*1e6).toString(36));
        q.choices = q.choices || [];
        q.choices.push({ id: newid, text: '' });
        renderChoicesUI();
      });

      choicesArea.appendChild(list);
      choicesArea.appendChild(addChoiceBtn);
    } else {
      const label = document.createElement('div'); label.textContent = 'Acceptable answers (comma separated)';
      const ans = document.createElement('input'); ans.className = 'input';
      ans.value = Array.isArray(q.correctAnswer) ? (q.correctAnswer.join(', ')) : (q.correctAnswer || '');
      ans.addEventListener('input', () => {
        const v = (ans.value || '').trim();
        if (!v) q.correctAnswer = null;
        else q.correctAnswer = v.indexOf(',') !== -1 ? v.split(',').map(x=>x.trim()).filter(Boolean) : v;
      });
      choicesArea.appendChild(label); choicesArea.appendChild(ans);
    }
  }

  sel.addEventListener('change', () => { q.type = sel.value; renderChoicesUI(); });
  pointsInput.addEventListener('input', () => q.points = Number(pointsInput.value || 1));
  removeBtn.addEventListener('click', () => container.remove());

  if (Array.isArray(q.choices)) q.choices = q.choices.map(c => ({ id: c.id || (Date.now().toString(36) + Math.random()), text: String(c.text || '') }));
  else q.choices = [];

  renderChoicesUI();

  // returns a serializable question object
  container.getQuestionObject = function() {
    const obj = {};
    obj.type = sel.value;
    obj.prompt = String(prompt.value || '').trim();
    obj.points = Number(pointsInput.value || 1) || 1;
    if (obj.type === 'multiple') {
      const inputs = choicesArea.querySelectorAll('input.input');
      const checks = choicesArea.querySelectorAll('input[type="checkbox"]');
      const choices = [];
      for (let i=0;i<inputs.length;i++){
        const ip = inputs[i];
        const cid = ip.dataset.choiceId || (Date.now().toString(36) + Math.random());
        choices.push({ id: cid, text: ip.value || '' });
      }
      obj.choices = choices;
      const checked = [];
      for (let i=0;i<inputs.length;i++){
        const ip = inputs[i];
        const cb = checks[i];
        if (cb && cb.checked) checked.push(String(ip.dataset.choiceId));
      }
      obj.correctAnswer = checked.length===0 ? null : (checked.length===1 ? checked[0] : checked);
    } else {
      const single = choicesArea.querySelector('input.input');
      const raw = single ? single.value : (Array.isArray(q.correctAnswer) ? q.correctAnswer.join(',') : (q.correctAnswer || ''));
      if (raw && raw.indexOf(',') !== -1) obj.correctAnswer = raw.split(',').map(x=>x.trim()).filter(Boolean);
      else obj.correctAnswer = raw ? raw.trim() : null;
    }
    return obj;
  };

  return container;
}

  // ----------------- create/edit modal -----------------
  async function showCreateQuizModal(initial) {
    if (!isTeacherOrManagerOrAdmin()) { alert('Only teachers/managers/admins can create quizzes'); return; }
    const modal = document.createElement('div'); modal.style.padding='12px';
    modal.innerHTML = `<h3 style="margin-top:0">${initial ? 'Edit Quiz' : 'Create Quiz'}</h3>`;
    const form = document.createElement('div'); form.style.display='grid'; form.style.gap='8px';

    const title = document.createElement('input'); title.className = 'input'; title.placeholder = 'Title';
    const desc = document.createElement('textarea'); desc.className = 'input'; desc.placeholder = 'Description';
    const duration = document.createElement('input'); duration.type = 'number'; duration.className='input'; duration.value = initial ? (initial.durationMinutes||20) : 20;
    const extra = document.createElement('input'); extra.type = 'number'; extra.className='input'; extra.value = initial ? (initial.extraTimeMinutes||0) : 0;
    const randomize = document.createElement('input'); randomize.type='checkbox'; randomize.checked = initial ? !!initial.randomizeQuestions : false;
    const classIdsInput = document.createElement('input'); classIdsInput.className='input'; classIdsInput.placeholder='Class ids (comma separated)'; classIdsInput.value = initial ? (Array.isArray(initial.classIds) ? initial.classIds.join(',') : '') : '';
    const activeC = document.createElement('input'); activeC.type='checkbox'; activeC.checked = initial ? !!initial.active : true;
    const qsWrap = document.createElement('div'); qsWrap.style.marginTop = '8px';

    title.value = initial ? initial.title || '' : '';
    desc.value = initial ? initial.description || '' : '';

    const addQbtn = document.createElement('button'); addQbtn.className='btn'; addQbtn.textContent = '+ Add question'; addQbtn.type='button';
    addQbtn.addEventListener('click', (e) => { e.preventDefault(); qsWrap.appendChild(buildQuestionEditor()); });

    if (initial && Array.isArray(initial.questions) && initial.questions.length) initial.questions.forEach(q => qsWrap.appendChild(buildQuestionEditor(q)));

    // Classes selection area
    const classesArea = document.createElement('div'); classesArea.style.marginTop = '8px';
    classesArea.innerHTML = '<div class="muted">Loading classes…</div>';

    (async () => {
      try {
        const classes = await loadClasses();
        if (!classes || classes.length === 0) {
          classesArea.innerHTML = '';
          classesArea.appendChild(createLabel('Class IDs (comma separated) — classes could not be loaded automatically.'));
          classesArea.appendChild(classIdsInput);
          const hint = document.createElement('div'); hint.className = 'muted';
          hint.style.marginTop = '6px';
          hint.innerHTML = 'If classes exist, verify the backend routes are /api/classes or /api/schools/me/classes. Check console for tried endpoints.';
          classesArea.appendChild(hint);
          return;
        }

        const initialIds = Array.isArray(initial && initial.classIds) ? initial.classIds.map(String) : [];

        classesArea.innerHTML = '';

        const allRow = document.createElement('div');
        allRow.style.display = 'flex';
        allRow.style.alignItems = 'center';
        allRow.style.gap = '8px';
        const allCheckbox = document.createElement('input');
        allCheckbox.type = 'checkbox';
        allCheckbox.id = 'quiz-class-all';
        const allLabel = document.createElement('label');
        allLabel.htmlFor = 'quiz-class-all';
        allLabel.textContent = 'Open to all classes (no restriction)';
        allRow.appendChild(allCheckbox);
        allRow.appendChild(allLabel);
        classesArea.appendChild(allRow);

        const list = document.createElement('div');
        list.style.display = 'grid';
        list.style.gap = '6px';
        list.style.marginTop = '8px';

        classes.forEach(cl => {
          const cid = String(cl._id || cl.id || cl.classId || cl.name || '');
          const row = document.createElement('label');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.gap = '8px';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.dataset.classId = cid;

          const name = document.createElement('div');
          name.textContent = (cl.name || cl.title || cl.className || cid).toString();

          row.appendChild(cb);
          row.appendChild(name);
          list.appendChild(row);

          if (initialIds.includes(cid)) cb.checked = true;

          cb.addEventListener('change', () => { if (cb.checked) allCheckbox.checked = false; });
        });

        allCheckbox.addEventListener('change', () => {
          if (allCheckbox.checked) list.querySelectorAll('input[type="checkbox"]').forEach(x => x.checked = false);
        });

        if (!initial || !initial.classIds || (Array.isArray(initial.classIds) && initial.classIds.length === 0)) {
          allCheckbox.checked = true;
        }

        classesArea.appendChild(list);

        classesArea._getSelectedClassIds = () => {
          if (allCheckbox.checked) return [];
          const chosen = Array.from(list.querySelectorAll('input[type="checkbox"]'))
                        .filter(x => x.checked)
                        .map(x => String(x.dataset.classId));
          return chosen.length ? chosen : [];
        };

      } catch (err) {
        classesArea.innerHTML = '';
        classesArea.appendChild(createLabel('Class IDs (comma separated)'));
        classesArea.appendChild(classIdsInput);
        console.error('showCreateQuizModal: loadClasses error', err);
      }
    })();

    // rest of form (save/cancel)
    const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent = initial ? 'Save changes' : 'Create';
    const cancelBtn = document.createElement('button'); cancelBtn.className='btn btn--outline'; cancelBtn.textContent='Cancel'; cancelBtn.type='button';
    cancelBtn.addEventListener('click', ()=> closeModal());

    form.appendChild(title); form.appendChild(desc);
    const row1 = document.createElement('div'); row1.style.display='flex'; row1.style.gap='8px';
    row1.appendChild(createLabel('Duration (minutes)')); row1.appendChild(duration);
    row1.appendChild(createLabel('Extra minutes')); row1.appendChild(extra);
    form.appendChild(row1);

    const row2 = document.createElement('div'); row2.style.display='flex'; row2.style.gap='8px'; row2.style.alignItems='center';
    row2.appendChild(createLabel('Randomize questions')); row2.appendChild(randomize);
    row2.appendChild(createLabel('Active')); row2.appendChild(activeC);
    form.appendChild(row2);

    form.appendChild(classesArea);
    form.appendChild(addQbtn); form.appendChild(qsWrap);

    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px';
    actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
    form.appendChild(actions);
    modal.appendChild(form);

    openModal(modal);

    saveBtn.addEventListener('click', async () => {
      const qnodes = Array.from(qsWrap.querySelectorAll('.quiz-q-row'));
      const questions = [];
      for (const node of qnodes) {
        const qobj = node.getQuestionObject ? node.getQuestionObject() : null;
        if (qobj && qobj.prompt) questions.push(qobj);
      }

      let classIdsPayload = [];
      if (classesArea._getSelectedClassIds) classIdsPayload = classesArea._getSelectedClassIds();
      else classIdsPayload = (classIdsInput.value||'').split(',').map(x=>x.trim()).filter(Boolean);

      const payload = {
        title: (title.value || '').trim(),
        description: (desc.value || '').trim(),
        classIds: classIdsPayload,
        questions,
        durationMinutes: Number(duration.value || 20),
        extraTimeMinutes: Number(extra.value || 0),
        randomizeQuestions: !!randomize.checked,
        active: !!activeC.checked
      };

      try {
        let r;
        if (initial && initial._id) {
          r = await apiFetch(`/quizzes/${initial._id}`, { method:'PATCH', body: payload });
        } else {
          r = await apiFetch('/quizzes', { method:'POST', body: payload });
        }
        if (!r || !r.ok) throw new Error((r && (r.error || r.message)) ? (r.error || r.message) : 'Save failed');
        alert('Saved');
        closeModal();
        await loadList();
      } catch (err) {
        console.error('save quiz', err);
        alert('Save failed: ' + (err && err.message ? err.message : 'unknown'));
      }
    });
  }

  // ----------------- list/load (unchanged) -----------------
  async function loadList() {
    listWrap.innerHTML = '<div class="muted">Loading quizzes...</div>';
    try {
      const r = await apiFetch('/quizzes').catch(()=>null);
      if (!r || !r.ok) { listWrap.innerHTML = '<div class="muted">Failed to load</div>'; return; }
      const quizzes = r.quizzes || [];
      renderList(quizzes);
    } catch (err) {
      console.error('loadList', err);
      listWrap.innerHTML = '<div class="muted">Failed to load</div>';
    }
  }

  
  // (renderList, renderQuizManage, renderAttemptDetail, startQuizForStudent, renderAttemptUI, showStudentResult unchanged)
  // you already supplied these earlier — keep them as-is.

  
  // nicer card styles and active toggle
  function renderList(quizzes) {
    listWrap.innerHTML = '';
    if (!quizzes.length) { listWrap.innerHTML = '<div class="muted">No quizzes</div>'; return; }
    const wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='14px';
    quizzes.forEach(q => {
      const card = document.createElement('div'); card.className='card'; card.style.padding='12px'; card.style.display='flex'; card.style.justifyContent='space-between'; card.style.alignItems='flex-start'; card.style.gap='12px';
      const left = document.createElement('div'); left.style.flex = '1';
      left.innerHTML = `<div style="font-size:16px;font-weight:700">${escapeHtml(q.title)}</div><div class="muted" style="margin-top:6px">${escapeHtml(q.description||'')}</div>`;
      const right = document.createElement('div'); right.style.display='flex'; right.style.flexDirection='column'; right.style.gap='8px'; right.style.alignItems='flex-end';

      const meta = document.createElement('div'); meta.className='muted'; meta.style.fontSize='12px';
      meta.textContent = `Duration: ${q.durationMinutes || 0}m • Extra: ${q.extraTimeMinutes || 0}m • Q: ${(q.questions||[]).length} • Active: ${q.active ? 'Yes' : 'No'}`;
      left.appendChild(meta);

      const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='8px';
      const openBtn = document.createElement('button'); openBtn.className='btn'; openBtn.textContent = isTeacherOrManagerOrAdmin() ? 'Manage' : 'Open';
      openBtn.style.minWidth = '86px';
      openBtn.addEventListener('click', ()=> {
        if (isTeacherOrManagerOrAdmin()) renderQuizManage(q);
        else startQuizForStudent(q);
      });
      controls.appendChild(openBtn);

      if (isTeacherOrManagerOrAdmin()) {
        const edit = document.createElement('button'); edit.className='btn btn--outline'; edit.textContent='Edit';
        edit.addEventListener('click', ()=> showCreateQuizModal(q));
        const del = document.createElement('button'); del.className='btn btn--danger'; del.textContent='Delete';
        del.addEventListener('click', async ()=> {
          if (!confirm('Delete quiz?')) return;
          try {
            await apiFetch(`/quizzes/${q._id}`, { method:'DELETE' });
            alert('Deleted');
            await loadList();
          } catch (err) { alert('Delete failed'); console.error(err); }
        });
        controls.appendChild(edit); controls.appendChild(del);

        // active toggle
        const actLabel = document.createElement('label');
        actLabel.style.display='flex'; actLabel.style.alignItems='center'; actLabel.style.gap='8px';
        const actCheckbox = document.createElement('input'); actCheckbox.type='checkbox'; actCheckbox.checked = !!q.active;
        actCheckbox.addEventListener('change', async () => {
          try {
            await apiFetch(`/quizzes/${q._id}`, { method:'PATCH', body: { active: !!actCheckbox.checked }});
            // update meta text
            meta.textContent = `Duration: ${q.durationMinutes || 0}m • Extra: ${q.extraTimeMinutes || 0}m • Q: ${(q.questions||[]).length} • Active: ${actCheckbox.checked ? 'Yes' : 'No'}`;
            alert('Updated');
            await loadList();
          } catch (err) {
            console.error('toggle active', err);
            alert('Update failed');
            actCheckbox.checked = !actCheckbox.checked;
          }
        });
        const actSpan = document.createElement('span'); actSpan.textContent = 'Active';
        actLabel.appendChild(actCheckbox); actLabel.appendChild(actSpan);
        right.appendChild(actLabel);
      }

      right.appendChild(controls);
      card.appendChild(left);
      card.appendChild(right);
      wrap.appendChild(card);
    });
    listWrap.appendChild(wrap);
  }



// ----------------- ADMIN/TEACHER: manage quiz (list attempts) (replace existing) -----------------
async function renderQuizManage(quiz) {
  app.innerHTML = '';
  const container = document.createElement('div'); container.style.display='grid'; container.style.gap='12px';
  const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';
  header.innerHTML = `<div><h3 style="margin:0">${escapeHtml(quiz.title)}</h3><div class="muted" style="margin-top:6px">${escapeHtml(quiz.description||'')}</div></div>`;
  const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back';
  back.addEventListener('click', async ()=> { await renderQuizzes(); });
  header.appendChild(back);
  container.appendChild(header);

  const resultsWrap = document.createElement('div'); resultsWrap.textContent = 'Loading attempts...';
  container.appendChild(resultsWrap);
  app.appendChild(container);

  try {
    const r = await apiFetch(`/quizzes/${quiz._id}/results`).catch(()=>null);
    if (!r || !r.ok) { resultsWrap.textContent = 'Failed to load attempts'; return; }
    const atts = r.attempts || [];
    if (!atts.length) { resultsWrap.textContent = 'No attempts yet'; return; }
    resultsWrap.innerHTML = '';
    const list = document.createElement('div'); list.style.display='grid'; list.style.gap='8px';
    atts.forEach(a => {
      const row = document.createElement('div'); row.className='card'; row.style.padding='8px'; row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
      const left = document.createElement('div');

      // Prefer a student number field if present, then fallback to studentId or last 8 chars
      const studentIdDisplay = a.studentNumber || a.numberId || a.studentId || (a.studentId ? String(a.studentId).slice(-8) : '-');
      left.innerHTML = `<div style="font-weight:700">${escapeHtml(a.studentFullname || 'Unknown')}</div>
        <div class="muted">ID: ${escapeHtml(String(studentIdDisplay))} • Score: ${String(a.score||0)}/${String(a.maxScore||0)} • ${a.submitted ? 'Submitted' : 'In progress'}</div>`;

      const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='8px';
      const view = document.createElement('button'); view.className='btn'; view.textContent='View';
      view.addEventListener('click', ()=> renderAttemptDetail(quiz, a));
      controls.appendChild(view);
      row.appendChild(left); row.appendChild(controls);
      list.appendChild(row);
    });
    resultsWrap.appendChild(list);
  } catch (err) {
    console.error('renderQuizManage', err);
    resultsWrap.textContent = 'Failed to load attempts';
  }
}

// --- improved helper: map stored answer(s) to user-visible text
function formatAnswerForDisplay(rawAnswer, q) {
  if (rawAnswer === null || typeof rawAnswer === 'undefined' || rawAnswer === '') return '<no answer>';

  // If question has choices (multiple choice), map ids to text
  if (q && Array.isArray(q.choices) && q.choices.length > 0) {
    const idToText = {};
    q.choices.forEach(ch => {
      // support multiple choice shapes
      const id = String(ch.id ?? ch._id ?? ch.choiceId ?? ch.value ?? ch.text ?? ch);
      const text = (ch.text ?? ch.label ?? ch.name ?? String(ch)).toString();
      idToText[id] = text;
    });

    if (Array.isArray(rawAnswer)) {
      return rawAnswer.map(a => idToText[String(a)] || String(a)).join(', ');
    } else {
      return idToText[String(rawAnswer)] || String(rawAnswer);
    }
  }

  // Free text or array of free-text answers
  if (Array.isArray(rawAnswer)) return rawAnswer.join(', ');
  return String(rawAnswer);
}

// --- Replace renderQuizManage with this ---
async function renderQuizManage(quiz) {
  // small helpers to normalize id/class objects
  function normalizeStudentId(val) {
    if (!val) return null;
    if (typeof val === 'object') {
      return val.studentNumber || val.numberId || val.studentNo || val._id || val.id || null;
    }
    return String(val);
  }
  function normalizeClassDisplay(val) {
    if (!val) return null;
    if (typeof val === 'object') {
      // common class fields
      return val.name || val.title || val.className || val.classId || val._id || null;
    }
    return String(val);
  }
  function looksLikeObjectId(s) {
    return typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);
  }

  app.innerHTML = '';
  const container = document.createElement('div'); container.style.display='grid'; container.style.gap='12px';
  const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';
  header.innerHTML = `<div><h3 style="margin:0">${escapeHtml(quiz.title)}</h3><div class="muted" style="margin-top:6px">${escapeHtml(quiz.description||'')}</div></div>`;
  const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back';
  back.addEventListener('click', async ()=> { await renderQuizzes(); });
  header.appendChild(back);
  container.appendChild(header);

  const resultsWrap = document.createElement('div'); resultsWrap.textContent = 'Loading attempts...';
  container.appendChild(resultsWrap);
  app.appendChild(container);

  try {
    const r = await apiFetch(`/quizzes/${quiz._id}/results`).catch(()=>null);
    if (!r || !r.ok) { resultsWrap.textContent = 'Failed to load attempts'; return; }
    const atts = r.attempts || [];
    if (!atts.length) { resultsWrap.textContent = 'No attempts yet'; return; }
    resultsWrap.innerHTML = '';
    const list = document.createElement('div'); list.style.display='grid'; list.style.gap='8px';

    // helper to enrich a single attempt row asynchronously
    async function enrichAttemptRow(a, tmpMeta) {
      try {
        const localStudent = a.student || {};

        // prefer explicit human id fields first (on attempt or nested student)
        let humanId = normalizeStudentId(a.studentNumber) || normalizeStudentId(a.numberId) || normalizeStudentId(a.studentNo) || normalizeStudentId(a.studentId) || normalizeStudentId(localStudent.studentNumber) || normalizeStudentId(localStudent.numberId) || normalizeStudentId(localStudent.studentNo) || null;

        // class info might be a string id, an object, or nested on student or attempt
        let classDisplay = normalizeClassDisplay(localStudent.className || localStudent.class || localStudent.classId || a.className || a.classId || null);

        // If humanId looks like a raw mongo id, treat it as not human and try fetching student to resolve real studentNumber
        const shouldFetchStudent = !humanId || !classDisplay || looksLikeObjectId(humanId);

        if (shouldFetchStudent) {
          const sid = a.studentId || (a.student && (a.student._id || a.student.id)) || (looksLikeObjectId(humanId) ? humanId : null);
          if (sid) {
            const sres = await apiFetch(`/students/${sid}`).catch(()=>null);
            if (sres && (sres.student || sres)) {
              const studentObj = sres.student || sres;
              humanId = normalizeStudentId(studentObj.studentNumber) || normalizeStudentId(studentObj.numberId) || normalizeStudentId(studentObj.studentNo) || normalizeStudentId(studentObj._id) || humanId;
              classDisplay = classDisplay || normalizeClassDisplay(studentObj.className || studentObj.class || studentObj.classId || null);
            }
          }
        }

        // if classDisplay looks like object-id string and not a friendly name, try to fetch class doc
        if (classDisplay && looksLikeObjectId(classDisplay)) {
          try {
            const cres = await apiFetch(`/classes/${String(classDisplay)}`).catch(()=>null);
            if (cres && (cres.class || cres).name) {
              const cls = cres.class || cres;
              classDisplay = `${cls.name}${cls.classId ? ` (${cls.classId})` : ''}`;
            }
          } catch(e){}
        }

        // final fallback formatting
        const idShown = humanId ? String(humanId) : (String(a.studentId || a._id || '').slice(-8) || '-');
        const classShown = classDisplay ? String(classDisplay) : '-';

        // update UI (replace tmp meta)
        tmpMeta.textContent = `ID: ${idShown} • Class: ${classShown} • Score: ${String(a.score||0)}/${String(a.maxScore||0)} • ${a.submitted ? 'Submitted' : 'In progress'}`;
      } catch (err) {
        console.warn('enrichAttemptRow', err);
      }
    }

    atts.forEach(a => {
      const row = document.createElement('div'); row.className='card'; row.style.padding='8px'; row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
      const left = document.createElement('div');
      left.innerHTML = `<div style="font-weight:700">${escapeHtml(a.studentFullname || (a.student && (a.student.fullname || a.student.name)) || 'Unknown')}</div>`;
      // temporary meta placeholder, will be replaced by enrichAttemptRow when async completes
      const tmpMeta = document.createElement('div'); tmpMeta.className = 'muted';
      tmpMeta.textContent = `ID: ${String(a.studentId || '').slice(-8)} • Score: ${String(a.score||0)}/${String(a.maxScore||0)} • ${a.submitted ? 'Submitted' : 'In progress'}`;
      left.appendChild(tmpMeta);

      const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='8px';
      const view = document.createElement('button'); view.className='btn'; view.textContent='View';
      view.addEventListener('click', ()=> renderAttemptDetail(quiz, a));
      controls.appendChild(view);
      row.appendChild(left); row.appendChild(controls);
      list.appendChild(row);

      // async enrichment (don't block UI)
      enrichAttemptRow(a, tmpMeta);
    });

    resultsWrap.appendChild(list);
  } catch (err) {
    console.error('renderQuizManage', err);
    resultsWrap.textContent = 'Failed to load attempts';
  }
}


// --- Replace renderAttemptDetail with this (fetch attempt details first) ---
async function renderAttemptDetail(quiz, attempt) {
  // helpers used here too
  function normalizeStudentId(val) {
    if (!val) return null;
    if (typeof val === 'object') {
      return val.studentNumber || val.numberId || val.studentNo || val._id || val.id || null;
    }
    return String(val);
  }
  function normalizeClassDisplay(val) {
    if (!val) return null;
    if (typeof val === 'object') {
      return val.name || val.title || val.className || val.classId || val._id || null;
    }
    return String(val);
  }
  function looksLikeObjectId(s) {
    return typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);
  }

  app.innerHTML = '';
  const container = document.createElement('div'); container.style.display='grid'; container.style.gap='12px';
  app.appendChild(container);

  // fetch the full attempt details first (this usually returns attempt + questions)
  let fetched = null;
  try {
    fetched = await apiFetch(`/quizzes/${quiz._id}/results/${attempt._id}`).catch(()=>null);
  } catch(e) { fetched = null; }
  const att = fetched && (fetched.attempt || fetched) ? (fetched.attempt || fetched) : attempt;
  const questions = (fetched && (fetched.questions || [])) || att.questions || [];

  // We'll attempt to enrich header with student id and class using the fetched attempt
  let studentName = att.studentFullname || (att.student && (att.student.fullname || att.student.name)) || 'Unknown';
  let studentIdShown = normalizeStudentId(att.studentNumber) || normalizeStudentId(att.numberId) || normalizeStudentId(att.studentNo) || normalizeStudentId(att.studentId) || (att.student ? normalizeStudentId(att.student) : null);
  let classShown = normalizeClassDisplay(att.className || att.class || (att.student && (att.student.className || att.student.class || att.student.classId)));

  // if missing or the candidate id is actually a mongo id, try to fetch student doc
  try {
    const sid = att.studentId || (att.student && (att.student._id || att.student.id)) || (looksLikeObjectId(studentIdShown) ? studentIdShown : null);
    if ((!studentIdShown || !classShown) || looksLikeObjectId(studentIdShown)) {
      if (sid) {
        const sres = await apiFetch(`/students/${sid}`).catch(()=>null);
        if (sres && (sres.student || sres)) {
          const studentObj = sres.student || sres;
          studentName = studentName || studentObj.fullname || studentObj.name;
          studentIdShown = studentIdShown || normalizeStudentId(studentObj.studentNumber) || normalizeStudentId(studentObj.numberId) || normalizeStudentId(studentObj.studentNo) || normalizeStudentId(studentObj._id);
          classShown = classShown || normalizeClassDisplay(studentObj.className || studentObj.class || studentObj.classId);
          // if classShown is an id, try to fetch class
          if (classShown && looksLikeObjectId(classShown)) {
            const cres = await apiFetch(`/classes/${String(classShown)}`).catch(()=>null);
            if (cres && (cres.class || cres).name) {
              const cls = cres.class || cres;
              classShown = `${cls.name}${cls.classId ? ` (${cls.classId})` : ''}`;
            }
          }
        }
      }
    }
  } catch(e){
    console.warn('attempt header enrich', e);
  }

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.innerHTML = `<div><h3 style="margin:0">${escapeHtml(quiz.title)} — ${escapeHtml(studentName)}</h3>
                      <div class="muted">ID: ${escapeHtml(String(studentIdShown || (String(att.studentId || '').slice(-8) || '-')))} • Class: ${escapeHtml(String(classShown || '-'))} • Score: ${att.score || 0}/${att.maxScore || 0} • ${att.submitted ? 'Submitted' : 'In progress'}</div></div>`;
  const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back';
  back.addEventListener('click', ()=> renderQuizManage(quiz));
  header.appendChild(back);
  container.appendChild(header);

  try {
    // map answers
    const answersByQ = {};
    (att.answers || []).forEach(a => { answersByQ[String(a.questionId)] = a; });

    const list = document.createElement('div'); list.style.display='grid'; list.style.gap='12px';
    questions.forEach(q => {
      const panel = document.createElement('div'); panel.className='card'; panel.style.padding='8px';
      const title = document.createElement('div'); title.innerHTML = `<strong>${escapeHtml(q.prompt)}</strong> <span class="muted">(${q.type})</span>`;
      panel.appendChild(title);

      const ans = answersByQ[String(q._id)];
      const rawUserAns = ans && ('answer' in ans) ? ans.answer : null;
      const userAnswerDisplay = formatAnswerForDisplay(rawUserAns, q);
      const correctRaw = q.correctAnswer;
      const correctDisplay = formatAnswerForDisplay(correctRaw, q);

      const awarded = ans ? (ans.pointsAwarded || 0) : 0;
      const isCorrect = awarded > 0;

      const userDiv = document.createElement('div'); userDiv.style.marginTop='8px';
      // teacher view (shows correct), keep as before
      userDiv.innerHTML = `<div>Your answer: <span style="font-weight:700;color:${isCorrect ? 'green' : 'red'}">${escapeHtml(userAnswerDisplay)}</span></div>
                           <div class="muted">Correct answer: ${escapeHtml(correctDisplay || '-')}</div>
                           <div class="muted">Points awarded: ${String(awarded||0)} / ${String(q.points||0)}</div>`;
      panel.appendChild(userDiv);
      list.appendChild(panel);
    });

    // score edit
    const scoreRow = document.createElement('div'); scoreRow.style.marginTop='8px'; scoreRow.style.display='flex'; scoreRow.style.gap='8px'; scoreRow.style.alignItems='center';
    const scoreInput = document.createElement('input'); scoreInput.type='number'; scoreInput.value = att.score || 0; scoreInput.style.width='120px';
    const saveScore = document.createElement('button'); saveScore.className='btn'; saveScore.textContent='Update score';
    saveScore.addEventListener('click', async ()=> {
      try {
        const r2 = await apiFetch(`/quizzes/${quiz._id}/results/${att._id}/score`, { method:'PATCH', body: { score: Number(scoreInput.value || 0)} });
        if (!r2 || !r2.ok) throw new Error('Failed');
        alert('Score updated');
        renderAttemptDetail(quiz, attempt);
      } catch (err) { alert('Update failed'); console.error(err); }
    });
    scoreRow.appendChild(scoreInput); scoreRow.appendChild(saveScore);

    container.appendChild(list);
    container.appendChild(scoreRow);
  } catch (err) {
    console.error('attempt detail', err);
    container.appendChild(document.createTextNode('Failed to load attempt'));
  }
}



// // ----------------- ADMIN/TEACHER: manage quiz (list attempts) -----------------
// async function renderQuizManage(quiz) {
//   app.innerHTML = '';
//   const container = document.createElement('div'); container.style.display='grid'; container.style.gap='12px';
//   const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';
//   header.innerHTML = `<div><h3 style="margin:0">${escapeHtml(quiz.title)}</h3><div class="muted" style="margin-top:6px">${escapeHtml(quiz.description||'')}</div></div>`;
//   const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back';
//   back.addEventListener('click', async ()=> { await renderQuizzes(); });
//   header.appendChild(back);
//   container.appendChild(header);

//   const resultsWrap = document.createElement('div'); resultsWrap.textContent = 'Loading attempts...';
//   container.appendChild(resultsWrap);
//   app.appendChild(container);

//   try {
//     const r = await apiFetch(`/quizzes/${quiz._id}/results`).catch(()=>null);
//     if (!r || !r.ok) { resultsWrap.textContent = 'Failed to load attempts'; return; }
//     const atts = r.attempts || [];
//     if (!atts.length) { resultsWrap.textContent = 'No attempts yet'; return; }
//     resultsWrap.innerHTML = '';
//     const list = document.createElement('div'); list.style.display='grid'; list.style.gap='8px';

//     atts.forEach(a => {
//       const row = document.createElement('div'); row.className='card'; row.style.padding='8px'; row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
//       const left = document.createElement('div');

//       // Prefer human-friendly student id fields if present, fallback to studentId or last 8 of mongo id
//       const studentIdDisplay = a.studentNumber || a.numberId || a.studentNo || a.studentId || (a.student && (a.student.numberId || a.student.studentNumber || a.student.studentNo)) || (String(a.studentId || a._id || '').slice(-8) || '-');

//       left.innerHTML = `<div style="font-weight:700">${escapeHtml(a.studentFullname || 'Unknown')}</div>
//         <div class="muted">ID: ${escapeHtml(String(studentIdDisplay))} • Score: ${String(a.score||0)}/${String(a.maxScore||0)} • ${a.submitted ? 'Submitted' : 'In progress'}</div>`;

//       const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='8px';
//       const view = document.createElement('button'); view.className='btn'; view.textContent='View';
//       view.addEventListener('click', ()=> renderAttemptDetail(quiz, a));
//       controls.appendChild(view);
//       row.appendChild(left); row.appendChild(controls);
//       list.appendChild(row);
//     });

//     resultsWrap.appendChild(list);
//   } catch (err) {
//     console.error('renderQuizManage', err);
//     resultsWrap.textContent = 'Failed to load attempts';
//   }
// }

// // ----------------- teacher view of single attempt + allow update score -----------------
// async function renderAttemptDetail(quiz, attempt) {
//   app.innerHTML = '';
//   const container = document.createElement('div'); container.style.display='grid'; container.style.gap='12px';
//   const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between';
//   header.innerHTML = `<div><h3 style="margin:0">${escapeHtml(quiz.title)} — ${escapeHtml(attempt.studentFullname || '')}</h3>
//                       <div class="muted">Score: ${attempt.score || 0}/${attempt.maxScore || 0} • ${attempt.submitted ? 'Submitted' : 'In progress'}</div></div>`;
//   const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back';
//   back.addEventListener('click', ()=> renderQuizManage(quiz));
//   header.appendChild(back);
//   container.appendChild(header);
//   app.appendChild(container);

//   try {
//     const r = await apiFetch(`/quizzes/${quiz._id}/results/${attempt._id}`).catch(()=>null);
//     if (!r || !r.ok) { container.appendChild(document.createTextNode('Failed to load attempt')); return; }
//     const att = r.attempt;
//     const questions = r.questions || [];

//     // map answers
//     const answersByQ = {};
//     (att.answers || []).forEach(a => { answersByQ[String(a.questionId)] = a; });

//     const list = document.createElement('div'); list.style.display='grid'; list.style.gap='12px';
//     questions.forEach(q => {
//       const panel = document.createElement('div'); panel.className='card'; panel.style.padding='8px';
//       const title = document.createElement('div'); title.innerHTML = `<strong>${escapeHtml(q.prompt)}</strong> <span class="muted">(${q.type})</span>`;
//       panel.appendChild(title);

//       const ans = answersByQ[String(q._id)];
//       const rawUserAns = ans && ('answer' in ans) ? ans.answer : null;
//       const userAnswerDisplay = formatAnswerForDisplay(rawUserAns, q);
//       const correctRaw = q.correctAnswer;
//       const correctDisplay = formatAnswerForDisplay(correctRaw, q);

//       const awarded = ans ? (ans.pointsAwarded || 0) : 0;
//       const isCorrect = awarded > 0;

//       const userDiv = document.createElement('div'); userDiv.style.marginTop='8px';
//       userDiv.innerHTML = `<div>Your answer: <span style="font-weight:700;color:${isCorrect ? 'green' : 'red'}">${escapeHtml(userAnswerDisplay)}</span></div>
//                            <div class="muted">Correct answer: ${escapeHtml(correctDisplay || '-')}</div>
//                            <div class="muted">Points awarded: ${String(awarded||0)} / ${String(q.points||0)}</div>`;
//       panel.appendChild(userDiv);
//       list.appendChild(panel);
//     });

//     // score edit
//     const scoreRow = document.createElement('div'); scoreRow.style.marginTop='8px'; scoreRow.style.display='flex'; scoreRow.style.gap='8px'; scoreRow.style.alignItems='center';
//     const scoreInput = document.createElement('input'); scoreInput.type='number'; scoreInput.value = att.score || 0; scoreInput.style.width='120px';
//     const saveScore = document.createElement('button'); saveScore.className='btn'; saveScore.textContent='Update score';
//     saveScore.addEventListener('click', async ()=> {
//       try {
//         const r2 = await apiFetch(`/quizzes/${quiz._id}/results/${att._id}/score`, { method:'PATCH', body: { score: Number(scoreInput.value || 0)} });
//         if (!r2 || !r2.ok) throw new Error('Failed');
//         alert('Score updated');
//         renderAttemptDetail(quiz, attempt);
//       } catch (err) { alert('Update failed'); console.error(err); }
//     });
//     scoreRow.appendChild(scoreInput); scoreRow.appendChild(saveScore);

//     container.appendChild(list);
//     container.appendChild(scoreRow);
//   } catch (err) {
//     console.error('attempt detail', err);
//     container.appendChild(document.createTextNode('Failed to load attempt'));
//   }
// }

// ----------------- show result after submit (student) -----------------
async function showStudentResult(quiz, attempt) {
  app.innerHTML = '';
  const container = document.createElement('div'); container.style.display='grid'; container.style.gap='12px';
  const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between';
  header.innerHTML = `<div><h3 style="margin:0">${escapeHtml(quiz.title)} — Result</h3><div class="muted">Score: ${attempt.score || 0}/${attempt.maxScore || 0}</div></div>`;
  const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back to quizzes';
  back.addEventListener('click', ()=> renderQuizzes());
  header.appendChild(back);
  container.appendChild(header);

  // Try to fetch the results endpoint for the attempt (gives questions + exact shapes used to grade)
  let quizFull = null;
  try {
    const r = await apiFetch(`/quizzes/${quiz._id}/results/${attempt._id}`).catch(()=>null);
    if (r && r.ok) {
      quizFull = { questions: r.questions || [] };
    } else {
      const qfetch = await apiFetch(`/quizzes/${quiz._id}`).catch(()=>null);
      quizFull = qfetch ? (qfetch.quiz || qfetch) : quiz;
    }
  } catch (e) {
    quizFull = quiz;
  }

  const qById = {};
  (quizFull.questions || []).forEach(q => qById[String(q._id)] = q);

  // Students should NOT see correct answers
  const canViewCorrect = isTeacherOrManagerOrAdmin();

  const list = document.createElement('div'); list.style.display='grid'; list.style.gap='12px'; list.style.marginTop='12px';
  (attempt.answers || []).forEach(a => {
    const q = qById[String(a.questionId)];
    const panel = document.createElement('div'); panel.className='card'; panel.style.padding='8px';
    const title = document.createElement('div'); title.innerHTML = `<strong>${escapeHtml(q ? q.prompt : 'Question')}</strong>`;
    panel.appendChild(title);

    const studentDisplay = q ? formatAnswerForDisplay(a.answer, q) : (Array.isArray(a.answer) ? a.answer.join(', ') : (a.answer || '<no answer>'));
    const awarded = a.pointsAwarded || 0;
    const isCorrect = awarded > 0;

    const body = document.createElement('div'); body.style.marginTop='8px';
    const correctLine = canViewCorrect && q ? `<div class="muted">Correct: ${escapeHtml(formatAnswerForDisplay(q.correctAnswer, q) || '-')}</div>` : '';

    body.innerHTML = `<div>Your answer: <span style="font-weight:700;color:${isCorrect ? 'green' : 'red'}">${escapeHtml(studentDisplay)}</span></div>
                      ${correctLine}
                      <div class="muted">Points: ${awarded}/${q ? (q.points||0) : '-'}</div>`;
    panel.appendChild(body);
    list.appendChild(panel);
  });

  container.appendChild(list);
  app.appendChild(container);
}



  // ----------------- STUDENT: start attempt flow -----------------
  async function startQuizForStudent(quiz) {
    try {
      if (!quiz.active) return alert('Quiz is not active');
      const r = await apiFetch(`/quizzes/${quiz._id}/start`, { method: 'POST' });
      if (!r || !r.ok) {
        const msg = (r && (r.error || r.message)) ? (r.error || r.message) : 'Could not start quiz';
        alert('Could not start quiz: ' + msg);
        return;
      }
      const attempt = r.attempt;
      renderAttemptUI(quiz, attempt);
    } catch (err) {
      console.error('start quiz', err);
      alert('Start failed: ' + (err && err.message ? err.message : 'unknown'));
    }
  }

  // ----------------- Attempt UI (student) -----------------
  async function renderAttemptUI(quiz, attempt) {
    app.innerHTML = '';
    const container = document.createElement('div'); container.style.display='grid'; container.style.gap='12px';
    const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between';
    header.innerHTML = `<div><h3 style="margin:0">${escapeHtml(quiz.title)}</h3><div class="muted" id="quiz-timer-line">Time left: <span id="quiz-timer">...</span></div></div>`;
    const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back';
    back.addEventListener('click', async ()=> {
      if (!confirm('Leave quiz? progress saved automatically.')) return;
      await renderQuizzes();
    });
    header.appendChild(back);
    container.appendChild(header);

    // local state
    let questions = attempt.questions || [];
    const qById = {}; questions.forEach(q => qById[String(q._id)] = q);
    const answersMap = {}; (attempt.answers || []).forEach(a => answersMap[String(a.questionId)] = a.answer);

    let currentIndex = 0;
    const qCount = (attempt.questionOrder || []).length || questions.length;
    const main = document.createElement('div'); main.style.marginTop='12px';
    const qWrap = document.createElement('div');
    const nav = document.createElement('div'); nav.style.display='flex'; nav.style.gap='8px'; nav.style.marginTop='12px';
    const prevBtn = document.createElement('button'); prevBtn.className='btn btn--outline'; prevBtn.textContent='Previous';
    const nextBtn = document.createElement('button'); nextBtn.className='btn'; nextBtn.textContent='Next';
    const saveBtn = document.createElement('button'); saveBtn.className='btn btn--outline'; saveBtn.textContent='Save progress';
    const submitBtn = document.createElement('button'); submitBtn.className='btn btn--danger'; submitBtn.textContent='Submit quiz';
    nav.appendChild(prevBtn); nav.appendChild(nextBtn); nav.appendChild(saveBtn); nav.appendChild(submitBtn);

    main.appendChild(qWrap); main.appendChild(nav);
    container.appendChild(main);
    app.appendChild(container);

    // Timer
    const timerEl = document.getElementById('quiz-timer');
    const startedAt = new Date(attempt.startedAt || Date.now());
    const durationMs = ((attempt.durationMinutes || quiz.durationMinutes || 20) + (attempt.extraTimeMinutes || quiz.extraTimeMinutes || 0)) * 60 * 1000;
    let timerInterval = null;
    let graceTimeout = null;

    function updateTimer() {
      const elapsed = Date.now() - startedAt.getTime();
      const remaining = Math.max(0, durationMs - elapsed);
      const s = Math.floor(remaining / 1000);
      const mm = Math.floor(s / 60); const ss = s % 60;
      if (remaining > 0) {
        timerEl.textContent = `${mm}m ${ss}s`;
      } else {
        timerEl.textContent = `Time ended`;
        nextBtn.disabled = true; prevBtn.disabled = true; saveBtn.disabled = true;
        if (!graceTimeout) {
          alert('Time is up — please submit now. After 60s the attempt will be closed and auto-submitted.');
          graceTimeout = setTimeout(async ()=> {
            try { await submitAttempt(); } catch(e){ console.warn('auto-submit failed', e); }
          }, 60 * 1000);
        }
      }
    }
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();

    function renderQuestion(index) {
      qWrap.innerHTML = '';
      currentIndex = Math.max(0, Math.min(index, qCount - 1));
      const qid = String((attempt.questionOrder && attempt.questionOrder[currentIndex]) || (questions[currentIndex] && questions[currentIndex]._id));
      const q = qById[qid];
      if (!q) { qWrap.innerHTML = '<div class="muted">Question data missing</div>'; return; }
      const p = document.createElement('div'); p.innerHTML = `<strong>Question ${currentIndex+1}/${qCount}:</strong> ${escapeHtml(q.prompt)}`;
      qWrap.appendChild(p);

      const ansArea = document.createElement('div'); ansArea.style.marginTop='8px';
      const existing = answersMap[qid];

      if (q.type === 'multiple') {
        (q.choices || []).forEach((choice, idx) => {
          const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px';
          const input = document.createElement('input'); input.type = 'radio'; input.name = 'q_' + qid; input.value = String(choice.id || choice.text || idx);
          if (existing && String(existing) === String(input.value)) input.checked = true;
          const label = document.createElement('div'); label.textContent = choice.text || choice;
          row.appendChild(input); row.appendChild(label);
          ansArea.appendChild(row);
        });
      } else {
        const ta = document.createElement('textarea'); ta.className='input'; ta.value = existing || '';
        ta.style.minHeight = '80px';
        ansArea.appendChild(ta);
      }

      qWrap.appendChild(ansArea);

      prevBtn.onclick = () => {
        saveCurrentAnswer();
        if (currentIndex > 0) renderQuestion(currentIndex - 1);
      };
      nextBtn.onclick = () => {
        saveCurrentAnswer();
        if (currentIndex < qCount - 1) renderQuestion(currentIndex + 1);
      };
      saveBtn.onclick = async () => { saveCurrentAnswer(); await saveProgressAttempt(); };
      submitBtn.onclick = async () => {
        if (!confirm('Submit quiz? You will not be able to re-take it.')) return;
        saveCurrentAnswer();
        await submitAttempt();
      };

      function saveCurrentAnswer() {
        const qid = String((attempt.questionOrder && attempt.questionOrder[currentIndex]) || (questions[currentIndex] && questions[currentIndex]._id));
        const q = qById[qid];
        if (!q) return;
        let val = null;
        if (q.type === 'multiple') {
          const sel = qWrap.querySelector('input[name="q_' + qid + '"]:checked');
          if (sel) val = sel.value;
        } else {
          const ta = qWrap.querySelector('textarea');
          if (ta) val = ta.value;
        }
        answersMap[qid] = val;
      }
    }

    async function saveProgressAttempt() {
      const answers = Object.keys(answersMap).map(qid => ({ questionId: qid, answer: answersMap[qid] }));
      try {
        await apiFetch(`/quizzes/${quiz._id}/attempts/${attempt._id}`, { method:'PATCH', body: { answers } });
        alert('Saved');
      } catch (err) { alert('Save failed'); console.error(err); }
    }

    async function submitAttempt() {
      const answers = Object.keys(answersMap).map(qid => ({ questionId: qid, answer: answersMap[qid] }));
      try {
        const r = await apiFetch(`/quizzes/${quiz._id}/attempts/${attempt._id}/submit`, { method:'POST', body: { answers } });
        if (!r || !r.ok) { alert('Submit failed'); return; }
        clearInterval(timerInterval);
        if (graceTimeout) { clearTimeout(graceTimeout); graceTimeout = null; }
        const resAttempt = r.attempt || r;
        await showStudentResult(quiz, resAttempt);
      } catch (err) {
        alert('Submit failed: ' + (err && err.message ? err.message : 'unknown'));
      }
    }

    // initial
    renderQuestion(0);
  }



  // your existing renderList / renderQuizManage / renderAttemptDetail / etc.
  // keep those as-is (not repeated here for brevity)...

  if (isTeacherOrManagerOrAdmin()) addBtn?.addEventListener('click', () => showCreateQuizModal(null));
  else if (addBtn) addBtn.style.display = 'none';

  await loadList();
}



  



// ---------- NOTICES ----------
// ---------- NOTICES ----------
async function renderNotices() {
  app.innerHTML = '';
  const node = tpl('tpl-notices');
  app.appendChild(node);
  const sendBtn = document.getElementById('send-notice-btn');
  const listWrap = document.getElementById('notices-list');

  const me = await getCurrentUser().catch(()=>null);
  if (!me) { navigate('login'); return; }

  const myRole = (me.role||'').toLowerCase();
  const canSend = myRole === 'manager' || myRole === 'admin';
  if (!canSend && sendBtn) sendBtn.style.display = 'none';

  // small modal helper (local)
  let __notice_modal_el = null;
  function openModal(contentNode, opts = {}) {
    try { closeModal(); } catch(_) {}
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = 9999;

    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.padding = '16px';
    box.style.borderRadius = '10px';
    box.style.maxHeight = '86vh';
    box.style.overflow = 'auto';
    box.style.width = opts.width || '820px';
    box.style.boxSizing = 'border-box';

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && opts.backdropClose !== false) closeModal();
    });

    box.appendChild(contentNode);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    __notice_modal_el = overlay;
    return overlay;
  }
  function closeModal() {
    if (!__notice_modal_el) return;
    try { __notice_modal_el.remove(); } catch(_) {}
    __notice_modal_el = null;
  }

  // load unread count and show badge in UI (example: nav has element id notice-badge)
  async function refreshUnreadBadge() {
    try {
      const r = await apiFetch('/notices/unread-count');
      if (r && r.ok) {
        const n = r.unread || 0;
        const badge = document.getElementById('notice-badge');
        if (badge) {
          badge.textContent = n>0 ? String(n) : '';
          badge.style.display = n>0 ? 'inline-block' : 'none';
        }
      }
    } catch (e) { console.warn('unread badge', e); }
  }

  async function loadNotices() {
    listWrap.innerHTML = '<div class="muted">Loading…</div>';
    try {
      // mark all as read when user opens notices (counts should disappear)
      await apiFetch('/notices/mark-read-all', { method: 'POST' }).catch(()=>null);
      await refreshUnreadBadge();

      const r = await apiFetch('/notices?box=inbox');
      if (!r || !r.ok) { listWrap.innerHTML = '<div class="muted">Failed to load</div>'; return; }
      const notices = r.notices || [];
      renderList(notices);
    } catch (err) {
      console.error('loadNotices', err);
      listWrap.innerHTML = '<div class="muted">Failed to load</div>';
    }
  }

  function renderList(notices) {
    listWrap.innerHTML = '';
    if (!notices.length) { listWrap.innerHTML = '<div class="muted">No notices</div>'; return; }

    const wrap = document.createElement('div'); wrap.style.display = 'grid'; wrap.style.gap = '8px';
    notices.forEach(n => {
      const card = document.createElement('div'); card.className='card'; card.style.padding='10px';
      const top = document.createElement('div'); top.style.display='flex'; top.style.justifyContent='space-between';
      const left = document.createElement('div');
      left.innerHTML = `<div style="font-weight:700">${escapeHtml(n.title)}</div>
        <div class="muted" style="font-size:12px">From: ${escapeHtml(n.senderName || '')} • ${new Date(n.createdAt||n.createdAt).toLocaleString()}</div>`;
      const right = document.createElement('div'); right.style.display='flex'; right.style.gap='8px';

      const open = document.createElement('button'); open.className='btn'; open.textContent='Open';
      open.addEventListener('click', async ()=> { await openNotice(n._id || n.id, n); });
      right.appendChild(open);

      // Show Edit/Delete when current user is admin or is the sender (sender can be manager)
      const iAmSender = String(n.sender || '') === String(me._id);
      if (myRole === 'admin' || iAmSender) {
        const edit = document.createElement('button'); edit.className='btn btn--outline'; edit.textContent='Edit';
        edit.addEventListener('click', ()=> showEditModal(n));
        const del = document.createElement('button'); del.className='btn btn--danger'; del.textContent='Delete';
        del.addEventListener('click', async () => {
          if (!confirm('Delete notice?')) return;
          try {
            const r = await apiFetch(`/notices/${n._id}`, { method: 'DELETE' });
            if (!r || !r.ok) throw new Error((r && (r.message || r.error)) || 'Delete failed');
            alert('Deleted');
            await loadNotices();
            await refreshUnreadBadge();
          } catch (err) { console.error('delete notice', err); alert('Delete failed: ' + (err && err.message ? err.message : 'unknown')); }
        });
        right.appendChild(edit); right.appendChild(del);
      }

      card.appendChild(left); card.appendChild(right);
      wrap.appendChild(card);
    });
    listWrap.appendChild(wrap);
  }
  async function openNotice(id, meta) {
    // fetch the notice and (optionally) mark read
    const r = await apiFetch(`/notices/${id}?markRead=1`).catch(() => null);
    if (!r || !r.ok) { alert('Failed to open'); return; }
  
    // server may return { notice, recipients, replies, youAreRecipient, canReply, recipientsCount }
    const notice = r.notice || r;
  
    // server-provided flags (trusted source)
    const canReply = !!r.canReply;               // current user is allowed to post replies
    const youAreRecipient = !!r.youAreRecipient; // current user is a recipient
    const repliesFromServer = Array.isArray(r.replies) ? r.replies : (Array.isArray(notice.replies) ? notice.replies : []);
  
    // convenience: local user info from outer scope (must be available)
    const meRole = (me && me.role || '').toLowerCase();
    const isPrivileged = meRole === 'admin' || meRole === 'manager'; // used for UI decisions
    const iAmSender = String((notice && notice.sender) || '') === String(me && me._id);
  
    // build content
    const content = document.createElement('div');
    content.style.maxWidth = '820px';
  
    // header and body
    content.innerHTML = `<h3 style="margin-top:0">${escapeHtml(notice.title || '')}</h3>`;
    const body = document.createElement('div');
    body.className = 'muted';
    body.style.whiteSpace = 'pre-wrap';
    body.style.marginTop = '8px';
    body.textContent = notice.body || '';
    content.appendChild(body);
  
    // recipients section (only visible to privileged users or sender)
    const recWrap = document.createElement('div');
    recWrap.style.marginTop = '12px';
    recWrap.innerHTML = '<strong>Recipients</strong>';
    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '6px';
    list.style.marginTop = '6px';
  
    if (Array.isArray(r.recipients) && r.recipients.length && (isPrivileged || iAmSender)) {
      r.recipients.forEach(rp => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
  
        const name = document.createElement('div');
        const labelParts = [];
        if (rp.displayName) labelParts.push(rp.displayName);
        else if (rp.studentNumber) labelParts.push(rp.studentNumber);
        else if (rp.fullname) labelParts.push(rp.fullname);
        else if (rp.username) labelParts.push(rp.username);
        else if (rp.userId) labelParts.push(String(rp.userId).slice(-8));
        if (rp.role) labelParts.unshift(rp.role);
        name.textContent = labelParts.join(' • ');
  
        const status = document.createElement('div');
        status.className = 'muted';
        status.textContent = rp.readAt ? ('Read ' + new Date(rp.readAt).toLocaleString()) : 'Unread';
  
        row.appendChild(name);
        row.appendChild(status);
        list.appendChild(row);
      });
    } else {
      const summaryRow = document.createElement('div');
      summaryRow.className = 'muted';
      summaryRow.textContent = youAreRecipient ? 'This notice was sent to you.' : `Recipients: ${r.recipientsCount || (notice.recipients ? notice.recipients.length : 0)} (hidden)`;
      list.appendChild(summaryRow);
    }
    recWrap.appendChild(list);
    content.appendChild(recWrap);
  
    // replies section: only render when server returned replies or user is privileged/sender
    if (isPrivileged || iAmSender) {
      const repliesWrap = document.createElement('div');
      repliesWrap.style.marginTop = '12px';
      repliesWrap.innerHTML = '<strong>Replies</strong>';
  
      const replList = document.createElement('div');
      replList.style.display = 'grid';
      replList.style.gap = '8px';
      replList.style.marginTop = '6px';
  
      const replies = repliesFromServer || [];
      if (replies.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'No replies';
        replList.appendChild(empty);
      } else {
        replies.forEach(rep => {
          const row = document.createElement('div');
          row.className = 'card';
          row.style.padding = '8px';
  
          const who = document.createElement('div');
          who.style.fontWeight = '700';
          who.textContent = rep.authorName || (rep.author && String(rep.author).slice(-8)) || 'Unknown';
  
          const when = document.createElement('div');
          when.className = 'muted';
          when.style.fontSize = '12px';
          when.textContent = rep.createdAt ? new Date(rep.createdAt).toLocaleString() : '';
  
          const txt = document.createElement('div');
          txt.style.whiteSpace = 'pre-wrap';
          txt.style.marginTop = '6px';
          txt.textContent = rep.text || '';
  
          row.appendChild(who);
          row.appendChild(when);
          row.appendChild(txt);
          replList.appendChild(row);
        });
      }
  
      repliesWrap.appendChild(replList);
      content.appendChild(repliesWrap);
    }
  
    // Reply area: shown only if server indicates current user may reply
    if (canReply) {
      const replyArea = document.createElement('div');
      replyArea.style.marginTop = '12px';
      replyArea.innerHTML = '<div><strong>Reply</strong></div>';
  
      const ta = document.createElement('textarea');
      ta.className = 'input';
      ta.style.minHeight = '80px';
  
      const send = document.createElement('button');
      send.className = 'btn';
      send.textContent = 'Send reply';
  
      send.addEventListener('click', async () => {
        const text = (ta.value || '').trim();
        if (!text) { alert('Enter reply text'); return; }
        send.disabled = true;
        try {
          const r2 = await apiFetch(`/notices/${id}/reply`, { method: 'POST', body: { text } }).catch(err => err || null);
          if (!r2 || !r2.ok) {
            alert('Reply failed' + (r2 && (r2.message || r2.error) ? (': ' + (r2.message || r2.error)) : '.'));
            send.disabled = false;
            return;
          }
  
          // successfully posted — re-open refreshed modal so replies & read states update
          alert('Reply sent');
          closeModal();
          // small delay gives server a moment to persist (optional)
          await openNotice(id);
          await refreshUnreadBadge();
        } catch (e) {
          console.error('send reply', e);
          alert('Reply failed: ' + (e && e.message ? e.message : 'unknown'));
        } finally {
          send.disabled = false;
        }
      });
  
      replyArea.appendChild(ta);
      replyArea.appendChild(send);
      content.appendChild(replyArea);
    }
  
    // admin/sender tools (edit/delete)
    const toolsRow = document.createElement('div');
    toolsRow.style.display = 'flex';
    toolsRow.style.gap = '8px';
    toolsRow.style.marginTop = '10px';
  
    if (isPrivileged || iAmSender) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn--outline';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => { closeModal(); showEditModal(notice); });
  
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete notice?')) return;
        try {
          const r2 = await apiFetch(`/notices/${notice._id}`, { method: 'DELETE' });
          if (!r2 || !r2.ok) throw new Error((r2 && (r2.message || r2.error)) || 'Delete failed');
          alert('Deleted');
          closeModal();
          await loadNotices();
          await refreshUnreadBadge();
        } catch (err) {
          console.error('delete notice', err);
          alert('Delete failed: ' + (err && err.message ? err.message : 'unknown'));
        }
      });
  
      toolsRow.appendChild(editBtn);
      toolsRow.appendChild(delBtn);
    }
  
    content.appendChild(toolsRow);
  
    openModal(content, { width: '760px' });
  
    // refresh badge & list after opening
    await refreshUnreadBadge();
    await loadNotices();
  }
  

  

  // show compose modal (also used for edit with prefill)
  function buildComposeModal({ initial = null } = {}) {
    const modal = document.createElement('div');
    modal.style.padding = '12px';
    modal.innerHTML = `<h3 style="margin-top:0">${initial ? 'Edit Notice' : 'Send Notice'}</h3>`;

    const form = document.createElement('div');
    form.style.display = 'grid';
    form.style.gap = '8px';

    const title = document.createElement('input'); title.className = 'input'; title.placeholder = 'Title';
    const body = document.createElement('textarea'); body.className = 'input'; body.placeholder = 'Message body';

    const roleRow = document.createElement('div');
    roleRow.style.display = 'flex';
    roleRow.style.flexWrap = 'wrap';
    roleRow.style.gap = '8px';
    roleRow.innerHTML = '<div class="muted" style="align-self:center">Target roles:</div>';

    const roles = ['student','teacher','manager','admin'];
    const roleChecks = {};
    roles.forEach(rn => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'role_' + rn + (initial && initial._id ? ('_' + initial._id) : '');
      cb.dataset.role = rn;
      const lab = document.createElement('label');
      lab.htmlFor = cb.id;
      lab.style.marginRight = '10px';
      lab.style.display = 'flex';
      lab.style.alignItems = 'center';
      lab.style.gap = '6px';
      lab.appendChild(cb);
      const span = document.createElement('span'); span.textContent = rn;
      lab.appendChild(span);
      roleRow.appendChild(lab);
      roleChecks[rn] = cb;
    });

    const usersInput = document.createElement('input');
    usersInput.className = 'input';
    usersInput.placeholder = 'Specific user IDs or student numbers (comma separated) — optional';

    const hint = document.createElement('div'); hint.className = 'muted'; hint.style.fontSize = '12px';
    hint.textContent = 'You can enter Mongo _id (24 hex) or human ids (e.g. STD16091, email or username depending on backend).';

    const send = document.createElement('button'); send.className = 'btn';
    send.textContent = initial ? 'Save changes' : 'Send';
    const cancel = document.createElement('button'); cancel.className = 'btn btn--outline'; cancel.type='button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', ()=> closeModal());

    form.appendChild(title);
    form.appendChild(body);
    form.appendChild(roleRow);
    form.appendChild(usersInput);
    form.appendChild(hint);

    const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.justifyContent = 'flex-end'; actions.style.gap = '8px';
    actions.appendChild(cancel); actions.appendChild(send);
    form.appendChild(actions);

    modal.appendChild(form);

    // prefill if edit
    if (initial) {
      title.value = initial.title || '';
      body.value = initial.body || '';
      // fill role boxes if targetRoles present
      (initial.targetRoles || []).forEach(tr => { if (roleChecks[tr]) roleChecks[tr].checked = true; });
      // show explicit values as comma list if recipients provided
      if (Array.isArray(initial.recipients) && initial.recipients.length) {
        // prefer showing studentNumber when available, otherwise show id
        const explicit = initial.recipients.map(rp => {
          if (rp.userId && rp.userId._id) return String(rp.userId._id);
          // if stored userId is object or string, try the id
          return String(rp.userId || '');
        }).filter(Boolean);
        usersInput.value = explicit.join(', ');
      }
    }

    return { modalElem: modal, titleInput: title, bodyInput: body, roleChecks, usersInput, sendBtn: send };
  }

  async function showComposeModal() {
    const { modalElem, titleInput, bodyInput, roleChecks, usersInput, sendBtn } = buildComposeModal({});
    openModal(modalElem, { width: '760px' });

    sendBtn.addEventListener('click', async () => {
      if (sendBtn.disabled) return;
      sendBtn.disabled = true;
      try {
        const t = (titleInput.value || '').trim();
        const b = (bodyInput.value || '').trim();
        if (!t) { alert('Please enter a title for the notice.'); sendBtn.disabled = false; return; }
        const chosenRoles = Object.keys(roleChecks).filter(rn => roleChecks[rn].checked);
        const explicit = (usersInput.value || '').split(',').map(x => x.trim()).filter(Boolean);
        if (chosenRoles.length === 0 && explicit.length === 0) {
          alert('Please select at least one target role or enter specific user IDs / student numbers (comma-separated).');
          sendBtn.disabled = false; return;
        }

        const payload = { title: t, body: b };
        if (chosenRoles.length) payload.targetRoles = chosenRoles;
        if (explicit.length) payload.explicitUserIds = explicit;

        const r = await apiFetch('/notices', { method: 'POST', body: payload }).catch(err => err || null);
        if (!r || !r.ok) {
          const serverMsg = (r && (r.message || r.error)) ? (r.message || r.error) : null;
          alert('Send failed' + (serverMsg ? (': ' + serverMsg) : '.'));
          sendBtn.disabled = false;
          return;
        }

        alert('Sent');
        closeModal();
        await refreshUnreadBadge();
        await loadNotices();
      } catch (err) {
        console.error('send notice', err);
        alert('Send failed: ' + (err && err.message ? err.message : 'unknown'));
      } finally { sendBtn.disabled = false; }
    });
  }

  function showEditModal(notice) {
    const iAmSender = String(notice.sender || '') === String(me._id);
    if (!(myRole === 'admin' || iAmSender)) { alert('Not allowed'); return; }

    const { modalElem, titleInput, bodyInput, roleChecks, usersInput, sendBtn } = buildComposeModal({ initial: notice });
    openModal(modalElem, { width: '760px' });

    sendBtn.addEventListener('click', async () => {
      if (sendBtn.disabled) return;
      sendBtn.disabled = true;
      try {
        const t = (titleInput.value || '').trim();
        const b = (bodyInput.value || '').trim();
        if (!t) { alert('Please enter a title'); sendBtn.disabled = false; return; }
        const chosenRoles = Object.keys(roleChecks).filter(rn => roleChecks[rn].checked);
        const explicit = (usersInput.value || '').split(',').map(x => x.trim()).filter(Boolean);

        const payload = { title: t, body: b };
        // only include recipient updates if the user actually provided them
        if (chosenRoles.length) payload.targetRoles = chosenRoles;
        if (explicit.length) payload.explicitUserIds = explicit;

        const r = await apiFetch(`/notices/${notice._id}`, { method: 'PUT', body: payload }).catch(err => err || null);
        if (!r || !r.ok) {
          const serverMsg = (r && (r.message || r.error)) ? (r.message || r.error) : null;
          alert('Save failed' + (serverMsg ? (': ' + serverMsg) : '.'));
          sendBtn.disabled = false;
          return;
        }

        alert('Saved');
        closeModal();
        await loadNotices();
        await refreshUnreadBadge();
      } catch (err) {
        console.error('edit notice', err);
        alert('Save failed: ' + (err && err.message ? err.message : 'unknown'));
      } finally { sendBtn.disabled = false; }
    });
  }


  if (sendBtn) sendBtn.addEventListener('click', showComposeModal);

  await refreshUnreadBadge();
  await loadNotices();
}

// FRONTEND: About - complete implementation
// Assumes helpers: apiFetch(path, opts), getCurrentUser(force), escapeHtml(s), app (root element)

async function renderAboutPage() {
  app.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'page about-page';
  container.innerHTML = `<h2>About</h2><div id="about-page-content" class="muted">Loading...</div>`;
  app.appendChild(container);
  const contentEl = document.getElementById('about-page-content');

  // Ensure we have current user
  const me = await getCurrentUser(true).catch(()=>null);

  let r = null;
  try { r = await apiFetch('/about'); } catch (e) { r = null; }
  if (!r || !r.ok) {
    contentEl.innerHTML = '<div class="muted">Failed to load About</div>';
    return;
  }

  const about = r.about || null;

  const myRole = (me && me.role || '').toLowerCase();
  const isAdmin = myRole === 'admin';
  const isManager = myRole === 'manager';
  const isPrivileged = isAdmin || isManager;
  const myId = me && me._id ? String(me._id) : null;
  const creatorId = about && about.createdBy ? String(about.createdBy) : null;
  const iAmCreator = creatorId && myId && (creatorId === myId);

  if (!about) {
    contentEl.innerHTML = '<div class="muted">No About information has been created yet.</div>';
    // managers/admin can create their own About
    if (isPrivileged) {
      const btnWrap = document.createElement('div'); btnWrap.style.marginTop = '12px';
      const createBtn = document.createElement('button'); createBtn.className = 'btn'; createBtn.textContent = 'Create About';
      createBtn.addEventListener('click', async () => { await renderAboutManager(); });
      btnWrap.appendChild(createBtn);
      contentEl.appendChild(btnWrap);
    }
    return;
  }

  // Build view
  const view = document.createElement('div'); view.className = 'about-view';
  function idToStr(x){ if(!x) return null; try { if (typeof x === 'object' && x._id) return String(x._id); return String(x); } catch(e){ return String(x); } }

  const aboutSchoolName = (about.schoolId && (about.schoolId.name || null)) ? about.schoolId.name : null;
  const fallbackName = about.createdByName || 'This School';
  const schoolName = aboutSchoolName || fallbackName;
  const updatedAt = about.updatedAt || about.createdAt || null;
  const headerHtml = `<div class="about-header"><h3 style="margin:0">About ${escapeHtml(schoolName)}</h3>
      <div class="muted small">Updated ${updatedAt ? new Date(updatedAt).toLocaleString() : '—'}</div></div>`;
  view.innerHTML = headerHtml;

  // vision / mission
  const topRow = document.createElement('div'); topRow.className = 'about-toprow';
  function makeSection(sec, fallbackTitle) {
    const s = document.createElement('div'); s.className = 'about-card';
    const title = sec && sec.title ? sec.title : fallbackTitle;
    const text = sec && sec.text ? sec.text : '';
    const color = sec && sec.color ? sec.color : '#666';
    const icon = sec && sec.icon ? sec.icon : '';
    s.innerHTML = `<div class="about-card-head" style="border-left:6px solid ${escapeHtml(color)}">
        <div class="about-icon">${escapeHtml(icon || '🏫')}</div>
        <div class="about-title">${escapeHtml(title)}</div>
      </div>
      <div class="about-body">${escapeHtml(text)}</div>`;
    return s;
  }
  topRow.appendChild(makeSection(about.vision || {}, 'Vision'));
  topRow.appendChild(makeSection(about.mission || {}, 'Mission'));
  view.appendChild(topRow);

  // scores
  if (Array.isArray(about.scores) && about.scores.length) {
    const scoresWrap = document.createElement('div'); scoresWrap.className = 'about-scores';
    about.scores.forEach(s => {
      const b = document.createElement('div'); b.className = 'about-badge';
      b.innerHTML = `<div class="badge-icon" style="background:${escapeHtml(s.color||'#10b981')}">${escapeHtml(s.icon||'⭐')}</div>
                     <div class="badge-body"><div class="badge-title">${escapeHtml(s.title||'')}</div>
                     <div class="badge-text muted small">${escapeHtml(s.text||'')}</div></div>`;
      scoresWrap.appendChild(b);
    });
    view.appendChild(scoresWrap);
  }

  // goals
  if (Array.isArray(about.goals) && about.goals.length) {
    const goalsWrap = document.createElement('div'); goalsWrap.className = 'about-goals';
    about.goals.forEach(g => {
      const card = document.createElement('div'); card.className = 'goal-card';
      card.innerHTML = `<div class="goal-head" style="background:${escapeHtml(g.color||'#f59e0b')}">
          <div class="goal-icon">${escapeHtml(g.icon || '🎯')}</div>
          <div class="goal-title">${escapeHtml(g.title || '')}</div>
        </div>
        <div class="goal-body">${escapeHtml(g.text || '')}</div>`;
      goalsWrap.appendChild(card);
    });
    view.appendChild(goalsWrap);
  }

  contentEl.innerHTML = '';
  contentEl.appendChild(view);

  // Controls: show only to creator or admin
  const controls = document.createElement('div');
  controls.style.marginTop = '12px';
  controls.style.display = 'flex';
  controls.style.gap = '8px';

  // Show Edit only if admin or the creator (manager who created this about)
  if (isAdmin || iAmCreator) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn--outline'; editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', async () => { await renderAboutManager(); });
    controls.appendChild(editBtn);
  }

  // Delete only admin or creator
  if (isAdmin || iAmCreator) {
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn--danger'; delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this About?')) return;
      try {
        const dr = await apiFetch(`/about/${about._id}`, { method: 'DELETE' });
        if (!dr || !dr.ok) throw new Error((dr && (dr.message || dr.error)) || 'Delete failed');
        alert('Deleted');
        // refresh UI
        await renderAboutWidget(document.getElementById('about-widget'));
        await renderAboutPage();
      } catch (err) {
        console.error('delete about', err);
        alert('Delete failed: ' + (err && err.message ? err.message : 'unknown'));
      }
    });
    controls.appendChild(delBtn);
  }

  // Hidden note if not visible and user not privileged
  if (!about.visible && !isPrivileged) {
    const hiddenNote = document.createElement('div');
    hiddenNote.className = 'muted';
    hiddenNote.style.marginTop = '8px';
    hiddenNote.textContent = 'This About content is not currently visible to students/teachers.';
    contentEl.appendChild(hiddenNote);
  }

  if (controls.children.length) contentEl.appendChild(controls);
}


// FRONTEND: about widget (compact)
async function renderAboutWidget(containerEl) {
  containerEl = containerEl || document.getElementById('about-widget');
  if (!containerEl) return;

  containerEl.innerHTML = '<div class="muted">Loading about…</div>';
  try {
    const r = await apiFetch('/about');
    if (!r || !r.ok) { containerEl.innerHTML = '<div class="muted">Failed to load</div>'; return; }
    const about = r.about;
    if (!about) { containerEl.innerHTML = '<div class="muted">No information available</div>'; return; }

    const el = document.createElement('div'); el.className = 'about-wrap';
    const schoolName = (about.schoolId && (about.schoolId.name || about.schoolId)) ? (about.schoolId.name || String(about.schoolId)) : (about.createdByName || 'This School');
    const updatedAt = about.updatedAt || about.createdAt || null;
    const hdr = document.createElement('div'); hdr.className = 'about-header';
    hdr.innerHTML = `<h2>About ${escapeHtml(schoolName)}</h2>
      <div class="muted small">Updated ${updatedAt ? new Date(updatedAt).toLocaleString() : '—'}</div>`;
    el.appendChild(hdr);

    // vision/mission small
    const topRow = document.createElement('div'); topRow.className = 'about-toprow';
    const makeSection = (sec) => {
      const s = document.createElement('div'); s.className = 'about-card';
      s.innerHTML = `<div class="about-card-head" style="border-left:6px solid ${escapeHtml(sec.color || '#333')}">
          <div class="about-icon">${escapeHtml(sec.icon || '🏫')}</div>
          <div class="about-title">${escapeHtml(sec.title || '')}</div>
        </div>
        <div class="about-body">${escapeHtml(sec.text || '')}</div>`;
      return s;
    };
    topRow.appendChild(makeSection(about.vision || {title:'Vision', text:'', color:'#6b21a8', icon:'🌟'}));
    topRow.appendChild(makeSection(about.mission || {title:'Mission', text:'', color:'#0ea5e9', icon:'🎯'}));
    el.appendChild(topRow);

    // badges and goals (small)
    if (Array.isArray(about.scores) && about.scores.length) {
      const scoresWrap = document.createElement('div'); scoresWrap.className = 'about-scores';
      about.scores.forEach(s => {
        const b = document.createElement('div'); b.className = 'about-badge';
        b.innerHTML = `<div class="badge-icon" style="background:${escapeHtml(s.color||'#10b981')}">${escapeHtml(s.icon||'⭐')}</div>
                       <div class="badge-body"><div class="badge-title">${escapeHtml(s.title||'')}</div>
                       <div class="badge-text muted small">${escapeHtml(s.text||'')}</div></div>`;
        scoresWrap.appendChild(b);
      });
      el.appendChild(scoresWrap);
    }

    if (Array.isArray(about.goals) && about.goals.length) {
      const goalsWrap = document.createElement('div'); goalsWrap.className = 'about-goals';
      about.goals.forEach(g => {
        const card = document.createElement('div'); card.className = 'goal-card';
        card.innerHTML = `<div class="goal-head" style="background:${escapeHtml(g.color||'#f59e0b')}">
            <div class="goal-icon">${escapeHtml(g.icon || '🎯')}</div>
            <div class="goal-title">${escapeHtml(g.title || '')}</div>
          </div>
          <div class="goal-body">${escapeHtml(g.text || '')}</div>`;
        goalsWrap.appendChild(card);
      });
      el.appendChild(goalsWrap);
    }

    containerEl.innerHTML = '';
    containerEl.appendChild(el);
  } catch (err) {
    console.error('renderAboutWidget', err);
    containerEl.innerHTML = '<div class="muted">Failed to load</div>';
  }
}


// FRONTEND: manager/admin UI to create/edit About
async function renderAboutManager() {
  let __about_modal_el = null;
  function openModal(contentNode, opts = {}) {
    try { closeModal(); } catch(_) {}
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.right = '0'; overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = 9999;

    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.padding = '18px';
    box.style.borderRadius = '10px';
    box.style.maxHeight = '86vh';
    box.style.overflow = 'auto';
    box.style.width = opts.width || '760px';
    box.style.boxSizing = 'border-box';
    box.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)';

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && opts.backdropClose !== false) closeModal();
    });

    function onKey(e) { if (e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', onKey);
    overlay._cleanup = () => { document.removeEventListener('keydown', onKey); };

    box.appendChild(contentNode);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    __about_modal_el = overlay;
    return overlay;
  }
  function closeModal() {
    if (!__about_modal_el) return;
    try { if (__about_modal_el._cleanup) __about_modal_el._cleanup(); __about_modal_el.remove(); } catch(_) {}
    __about_modal_el = null;
  }

  // fetch existing about doc (if any)
  let existing = null;
  try { const r = await apiFetch('/about'); if (r && r.ok) existing = r.about || null; } catch(e) { /* ignore */ }

  const me = await getCurrentUser(true).catch(()=>null);

  const form = document.createElement('div');
  form.className = 'about-manage';
  form.style.maxWidth = '860px';
  form.innerHTML = `<h3 style="margin-top:0">${existing ? 'Edit About' : 'Create About'}</h3>`;

  function inputRow(labelText, name, value = '') {
    const row = document.createElement('div'); row.className = 'form-row'; row.style.marginBottom = '8px';
    const lbl = document.createElement('label'); lbl.textContent = labelText;
    const inp = document.createElement('input'); inp.className = 'input'; inp.name = name; inp.value = value || '';
    row.appendChild(lbl); row.appendChild(inp);
    return { row, inp };
  }
  function textareaRow(labelText, name, value = '') {
    const row = document.createElement('div'); row.className = 'form-row'; row.style.marginBottom = '8px';
    const lbl = document.createElement('label'); lbl.textContent = labelText;
    const ta = document.createElement('textarea'); ta.className = 'input'; ta.name = name; ta.value = value || '';
    row.appendChild(lbl); row.appendChild(ta);
    return { row, ta };
  }

  const visionTitle = inputRow('Vision title','visionTitle', existing && existing.vision && existing.vision.title ? existing.vision.title : 'Vision');
  const visionTextRow = textareaRow('Vision text','visionText', existing && existing.vision && existing.vision.text ? existing.vision.text : '');
  const missionTitle = inputRow('Mission title','missionTitle', existing && existing.mission && existing.mission.title ? existing.mission.title : 'Mission');
  const missionTextRow = textareaRow('Mission text','missionText', existing && existing.mission && existing.mission.text ? existing.mission.text : '');

  // Goals (up to 7)
  const goalsWrap = document.createElement('div'); goalsWrap.className = 'form-goals';
  goalsWrap.innerHTML = '<div style="font-weight:700;margin-bottom:6px">Goals (up to 7)</div>';
  const maxGoals = 7; const goalInputs = [];
  const initialGoals = (existing && Array.isArray(existing.goals)) ? existing.goals : [];
  for (let i=0;i<maxGoals;i++){
    const g = initialGoals[i] || { title: `Goal #${i+1}`, text: '' };
    const grow = document.createElement('div'); grow.className = 'goal-row'; grow.style.marginBottom = '8px';
    grow.innerHTML = `<div style="display:flex;gap:8px;align-items:center">
        <input class="input" name="goalTitle_${i}" placeholder="Title" value="${escapeHtml(g.title||'')}"/>
      </div>
      <textarea class="input" name="goalText_${i}" placeholder="Goal description">${escapeHtml(g.text||'')}</textarea>`;
    goalsWrap.appendChild(grow);
    goalInputs.push(grow);
  }

  // Scores (up to 5)
  const scoresWrap = document.createElement('div'); scoresWrap.className = 'form-scores';
  scoresWrap.innerHTML = '<div style="font-weight:700;margin-bottom:6px">Score / Badge items (optional)</div>';
  const scoreInputs = []; const initialScores = (existing && Array.isArray(existing.scores)) ? existing.scores : [];
  for (let i=0;i<5;i++){
    const s = initialScores[i] || { title: '', text: '' };
    const srow = document.createElement('div'); srow.className = 'score-row'; srow.style.marginBottom = '8px';
    srow.innerHTML = `<div style="display:flex;gap:8px;align-items:center">
        <input class="input" name="scoreTitle_${i}" placeholder="Title" value="${escapeHtml(s.title||'')}"/>
      </div>
      <input class="input" name="scoreText_${i}" placeholder="Short text" value="${escapeHtml(s.text||'')}" />`;
    scoresWrap.appendChild(srow);
    scoreInputs.push(srow);
  }

  // visibility
  const visRow = document.createElement('div'); visRow.className = 'form-row'; visRow.style.marginTop = '8px';
  const visLabel = document.createElement('label'); visLabel.textContent = 'Visible to students/teachers';
  const visCheckbox = document.createElement('input'); visCheckbox.type = 'checkbox'; visCheckbox.name = 'visible';
  visCheckbox.checked = existing ? !!existing.visible : true;
  visRow.appendChild(visLabel); visRow.appendChild(visCheckbox);

  // actions
  const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px'; actions.style.marginTop='10px';
  const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent = existing ? 'Save' : 'Create';
  const cancelBtn = document.createElement('button'); cancelBtn.className='btn btn--outline'; cancelBtn.textContent='Cancel';
  cancelBtn.addEventListener('click', () => { closeModal(); });
  actions.appendChild(cancelBtn); actions.appendChild(saveBtn);

  form.appendChild(visionTitle.row); form.appendChild(visionTextRow.row);
  form.appendChild(missionTitle.row); form.appendChild(missionTextRow.row);
  form.appendChild(scoresWrap); form.appendChild(goalsWrap); form.appendChild(visRow); form.appendChild(actions);

  // helper flags
  const meId = me && me._id ? String(me._id) : null;
  const existingCreatorId = existing && existing.createdBy ? String(existing.createdBy) : null;
  const myRole = (me && me.role || '').toLowerCase();
  const isAdminLocal = myRole === 'admin';
  const iAmCreatorLocal = existing && existingCreatorId && meId && existingCreatorId === meId;

  if (existing && !iAmCreatorLocal && !isAdminLocal) {
    const note = document.createElement('div'); note.className='muted'; note.style.marginBottom='10px';
    note.innerHTML = `An About already exists created by another manager (creator: <strong>${escapeHtml(existing.createdByName || existingCreatorId || 'unknown')}</strong>).<br>
      You cannot edit that document. Click <strong>Create</strong> to create your own About (it will be scoped to you).`;
    form.insertBefore(note, form.firstChild.nextSibling);
  }

  // Delete allowed only for creator or admin
  if (existing && (iAmCreatorLocal || isAdminLocal)) {
    const delBtn = document.createElement('button'); delBtn.className='btn btn--danger'; delBtn.textContent='Delete About';
    delBtn.style.marginRight='auto';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this About section?')) return;
      try {
        const dr = await apiFetch(`/about/${existing._id}`, { method: 'DELETE' });
        if (!dr || !dr.ok) throw new Error((dr && (dr.message || dr.error)) || 'Delete failed');
        alert('Deleted');
        closeModal();
        try { await renderAboutWidget(document.getElementById('about-widget')); } catch(e){/*ignore*/}
        try { if (typeof renderAboutPage === 'function') await renderAboutPage(); } catch(e){/*ignore*/}
      } catch (err) {
        console.error('delete about', err);
        alert('Delete failed: ' + (err && err.message ? err.message : 'unknown'));
      }
    });
    actions.insertBefore(delBtn, cancelBtn);
  }

  openModal(form, { width: '900px' });

  // SAVE handler
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const meNow = await getCurrentUser(true).catch(()=>null);
      const payload = {};

      // IMPORTANT: scope by manager id when manager has no explicit schoolId
      // If the user is a manager, attach their _id as schoolId so About is manager-scoped.
      if (meNow && (meNow.role || '').toLowerCase() === 'manager') {
        payload.schoolId = meNow._id;
      } else if (meNow && (meNow.schoolId || meNow.school)) {
        // for admins or other roles, preserve their schoolId if available
        payload.schoolId = meNow.schoolId || meNow.school;
      }

      payload.vision = {
        title: (form.querySelector('[name="visionTitle"]').value || '').trim(),
        text: (form.querySelector('[name="visionText"]').value || '').trim()
      };
      payload.mission = {
        title: (form.querySelector('[name="missionTitle"]').value || '').trim(),
        text: (form.querySelector('[name="missionText"]').value || '').trim()
      };

      payload.scores = [];
      scoreInputs.forEach((sr, idx) => {
        const title = (sr.querySelector(`[name="scoreTitle_${idx}"]`).value || '').trim();
        const text = (sr.querySelector(`[name="scoreText_${idx}"]`).value || '').trim();
        if (!title) return;
        payload.scores.push({ title, text });
      });

      payload.goals = [];
      goalInputs.forEach((gr, idx) => {
        const title = (gr.querySelector(`[name="goalTitle_${idx}"]`).value || '').trim();
        const text = (gr.querySelector(`[name="goalText_${idx}"]`).value || '').trim();
        if (!title && !text) return;
        payload.goals.push({ title: title || `Goal #${idx+1}`, text });
      });

      payload.visible = !!visCheckbox.checked;

      let res;
      if (existing && existing._id && (iAmCreatorLocal || isAdminLocal)) {
        // update existing document
        res = await apiFetch(`/about/${existing._id}`, { method: 'PUT', body: payload });
      } else {
        // create/upsert new (will be scoped by payload.schoolId if provided)
        res = await apiFetch(`/about`, { method: 'POST', body: payload });
      }

      if (!res || !res.ok) throw new Error((res && (res.message || res.error)) || 'Save failed');

      // Success: close modal and refresh widget + page
      alert('Saved');
      closeModal();

      // Refresh widget and page
      try { await renderAboutWidget(document.getElementById('about-widget')); } catch(e){ console.warn('refresh widget failed', e); }
      try { if (typeof renderAboutPage === 'function') await renderAboutPage(); } catch(e){ console.warn('refresh about page failed', e); }

    } catch (err) {
      console.error('save about', err);
      alert('Save failed: ' + (err && err.message ? err.message : 'unknown'));
    } finally {
      saveBtn.disabled = false;
    }
  });
}






// FRONTEND: User management (Admin only)
async function renderUserManagement(){
  const role = getUserRole();
  if(role !== 'admin') { app.innerHTML = '<div class="page"><h2>Access denied</h2></div>'; return; }
  app.innerHTML = '';
  const node = tpl('user-management'); // your template should include #create-manager-btn and #manager-search input and #user-management-list
  app.appendChild(node);

  // wire create + search (if template provides those elements)
  document.getElementById('create-manager-btn')?.addEventListener('click', openCreateManagerModal);
  document.getElementById('manager-search')?.addEventListener('input', debounce(()=> loadManagers(), 300));

  await loadManagers();
}

async function loadManagers(page = 1){
  const list = document.getElementById('user-management-list');
  if(!list) return;
  list.innerHTML = 'Loading...';
  try{
    const q = document.getElementById('manager-search')?.value || '';
    const res = await apiFetch('/users?role=manager&search=' + encodeURIComponent(q) + '&page=' + page);
    const items = res.items || [];
    list.innerHTML = '';
    if(items.length === 0) { list.innerHTML = '<p>No manager users</p>'; return; }

    items.forEach(u => {
      const suspended = !!u.suspended;
      const warned = !!u.warned;
      const suspendLabel = suspended ? 'Unsuspend' : 'Suspend';
      const warnLabel = warned ? 'Remove warn' : 'Warn';

      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <strong>${escapeHtml(u.fullname)}</strong>
            <div style="font-size:13px;color:#6b7280">Email: ${escapeHtml(u.email || '')} • Role: ${escapeHtml(u.role || '')}</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button data-id="${u._id}" class="view-user btn">View</button>
            <button data-id="${u._id}" class="suspend-user btn">${escapeHtml(suspendLabel)}</button>
            <button data-id="${u._id}" class="warn-user btn">${escapeHtml(warnLabel)}</button>
            <button data-id="${u._id}" class="del-user btn" style="background:#ef4444">Delete</button>
          </div>
        </div>
      `;
      list.appendChild(div);
    });

    // attach listeners AFTER elements exist
    list.querySelectorAll('.view-user').forEach(b=> b.addEventListener('click', e => openViewManager(e.target.dataset.id)));
    list.querySelectorAll('.suspend-user').forEach(b=> b.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      if(!id) return;
      try{
        // ask for confirmation for suspend/unsuspend
        const ures = await apiFetch('/users/' + id);
        const currently = !!ures.user.suspended;
        const toSet = !currently;
        const ok = toSet ? confirm('Suspend this manager? They will be prevented from accessing the system.') : confirm('Unsuspend this manager?');
        if(!ok) return;
        await apiFetch('/users/' + id + '/suspend', { method: 'POST', body: { suspend: toSet } });
        alert(toSet ? 'User suspended' : 'User un-suspended');
        await loadManagers();
      }catch(err){
        console.error('Suspend toggle failed', err);
        alert('Failed to toggle suspended: ' + (err.message || 'server error'));
      }
    }));
    list.querySelectorAll('.warn-user').forEach(b=> b.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      if(!id) return;
      try{
        const ures = await apiFetch('/users/' + id);
        const currently = !!ures.user.warned;
        const toSet = !currently;
        await apiFetch('/users/' + id + '/warn', { method: 'POST', body: { warn: toSet } });
        alert(toSet ? 'User warned' : 'Warning removed');
        await loadManagers();
      }catch(err){
        console.error('Warn toggle failed', err);
        alert('Failed to send warning: ' + (err.message || 'server error'));
      }
    }));
    list.querySelectorAll('.del-user').forEach(b=> b.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      if(!id) return;
      if(!confirm('Delete manager and ALL their data (students, teachers, classes, subjects, votes, payments)? This is irreversible.')) return;
      try{
        await apiFetch('/users/' + id, { method:'DELETE' });
        alert('Deleted');
        await loadManagers();
      } catch(err){
        console.error('Delete failed', err);
        alert('Failed to delete: ' + (err.message || 'server error'));
      }
    }));
  } catch(err){
    console.error(err);
    list.innerHTML = '<p>Failed to load managers</p>';
  }
}

async function openViewManager(id){
  try{
    const res = await apiFetch('/users/' + id);
    const u = res.user || res;
    const counts = res.counts || {};
    const node = document.createElement('div');
    node.innerHTML = `<h3>${escapeHtml(u.fullname)}</h3>
      <div style="font-size:13px;color:#6b7280">Email: ${escapeHtml(u.email || '')} • Role: ${escapeHtml(u.role || '')}</div>
      <div style="margin-top:8px">
        <button id="view-data" class="btn">View their data</button>
        <button id="close-view" class="btn" style="background:#ccc;color:#000;margin-left:8px">Close</button>
      </div>
      <div style="margin-top:8px">Counts — Students: ${counts.students||0} • Teachers: ${counts.teachers||0} • Payments: ${counts.payments||0} • Subjects: ${counts.subjects||0} • Classes: ${counts.classes||0} • Votes: ${counts.votes||0}</div>
      <div id="view-data-container" style="margin-top:12px"></div>
    `;
    showModal(node);

    document.getElementById('close-view').addEventListener('click', closeModal);
    document.getElementById('view-data').addEventListener('click', async ()=> {
      try {
        const data = await apiFetch('/users/' + id + '/data'); // admin allowed
        const container = document.getElementById('view-data-container');
        container.innerHTML = '';
        const students = data.students || [];
        const teachers = data.teachers || [];
        const payments = data.payments || [];

        const makeSection = (title, items, renderItem) => {
          const sec = document.createElement('div');
          sec.style.marginTop = '12px';
          sec.innerHTML = `<h4>${escapeHtml(title)} (${items.length})</h4>`;
          if(items.length === 0) {
            const p = document.createElement('p'); p.style.color='#6b7280'; p.textContent = 'No records';
            sec.appendChild(p);
          } else {
            items.forEach(it => {
              const card = document.createElement('div');
              card.className = 'card';
              card.style.marginBottom = '8px';
              card.innerHTML = renderItem(it);
              sec.appendChild(card);
            });
          }
          return sec;
        };

        const renderStudentItem = s => {
          const clsName = s.classId && s.classId.name ? escapeHtml(s.classId.name) : (s.classId ? escapeHtml(String(s.classId)) : '');
          return `<strong>${escapeHtml(s.fullname)}</strong><div style="font-size:13px;color:#6b7280">ID: ${escapeHtml(s.numberId||'')} • Phone: ${escapeHtml(s.phone||'')}</div><div>Class: ${clsName} • Status: ${escapeHtml(s.status||'')}</div>`;
        };
        const renderTeacherItem = t => {
          const classes = (t.classIds || []).map(c => (c && c.name) ? escapeHtml(c.name) : escapeHtml(String(c))).join(', ');
          return `<strong>${escapeHtml(t.fullname)}</strong><div style="font-size:13px;color:#6b7280">ID: ${escapeHtml(t.numberId||'')} • Phone: ${escapeHtml(t.phone||'')}</div><div>Classes: ${classes}</div>`;
        };
        const renderPaymentItem = p => {
          return `<strong>${escapeHtml(p.relatedType || 'Other')} • ${escapeHtml(String(p.relatedId || ''))}</strong><div style="font-size:13px;color:#6b7280">Total: ${p.totalAmount || 0} • Paid: ${p.paidAmount || 0}</div><div>Status: ${escapeHtml(p.status||'')}</div>`;
        };

        container.appendChild(makeSection('Students', students, renderStudentItem));
        container.appendChild(makeSection('Teachers', teachers, renderTeacherItem));
        container.appendChild(makeSection('Payments', payments, renderPaymentItem));
      } catch(e){
        console.error('Failed to load user data', e);
        alert('Failed to load user data: ' + (e.message || 'server error'));
      }
    });
  } catch(err){
    console.error(err); alert('Failed to open manager view: ' + (err.message || 'server error'));
  }
}
// Replace your existing renderVote with this complete, robust version
// Full renderVote() with modal builder, edit/delete, active toggle, fuzzy student search UI
async function renderVote() {
  // clear previous timers
  if (window.__voteRefreshTimer) { clearInterval(window.__voteRefreshTimer); window.__voteRefreshTimer = null; }
  if (window.__votePollTimer) { clearInterval(window.__votePollTimer); window.__votePollTimer = null; }

  app.innerHTML = '';
  const node = tpl('tpl-vote');
  app.appendChild(node);

  const createBtn = document.getElementById('create-vote-btn');
  const voteList = document.getElementById('vote-list');

  const curUser = await getCurrentUser().catch(()=>null);
  if (!curUser) { navigate('login'); return; }

  // ---------- local state ----------
  let votesCache = []; // server payload
  let listMounted = true; // if false, stop polling/timers

  // ---------- helpers ----------
  function timeLeftMs(endsAt) {
    if (!endsAt) return Number.POSITIVE_INFINITY;
    const end = new Date(endsAt);
    return end - new Date();
  }
  function timeLeftText(endsAt) {
    const ms = timeLeftMs(endsAt);
    if (ms === Number.POSITIVE_INFINITY) return 'No end';
    if (ms <= 0) return 'Ended';
    const days = Math.floor(ms / (24*3600*1000));
    const hours = Math.floor((ms % (24*3600*1000)) / (3600*1000));
    const mins = Math.floor((ms % (3600*1000)) / (60*1000));
    const secs = Math.floor((ms % (60*1000)) / 1000);
    if (days) return `${days}d ${hours}h ${mins}m`;
    if (hours) return `${hours}h ${mins}m`;
    if (mins) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  function normalizeAllowed(val) {
    if (!val) return 'students';
    const v = String(val).toLowerCase().trim();
    if (v === 'student' || v === 'students') return 'students';
    if (v === 'teacher' || v === 'teachers') return 'teachers';
    if (v === 'all' || v === 'everyone') return 'all';
    return 'students';
  }
  function normalizeUserRole(role) {
    if (!role) return '';
    const r = String(role).toLowerCase().trim();
    if (r === 'students' || r === 'student') return 'student';
    if (r === 'teachers' || r === 'teacher') return 'teacher';
    if (r === 'admin') return 'admin';
    if (r === 'manager') return 'manager';
    return r;
  }

  function computeRankingClientSide(candidates) {
    const arr = (candidates || []).map(c => ({ ...c }));
    arr.sort((a,b) => (b.votes||0) - (a.votes||0));
    let lastVotes = null, lastRank = 0;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (i === 0) { lastVotes = c.votes || 0; lastRank = 1; c.rank = 1; continue; }
      if ((c.votes || 0) === lastVotes) c.rank = lastRank;
      else { c.rank = i + 1; lastRank = c.rank; lastVotes = c.votes || 0; }
    }
    const winners = [];
    if (arr.length) {
      const topVotes = arr[0].votes || 0;
      for (const cc of arr) {
        if ((cc.votes || 0) === topVotes) winners.push(cc);
        else break;
      }
    }
    return { ranking: arr, winners, tie: winners.length > 1 };
  }

  // totals and breakdown
  function computeTotals(vote) {
    const totals = { total: 0, byRole: { student: 0, teacher: 0, other: 0 } };
    if (Array.isArray(vote.voters) && vote.voters.length >= 0) {
      totals.total = vote.voters.length;
      for (const v of vote.voters) {
        const r = (v && v.voterRole) ? String(v.voterRole).toLowerCase() : '';
        if (r === 'student' || r === 'students') totals.byRole.student++;
        else if (r === 'teacher' || r === 'teachers') totals.byRole.teacher++;
        else totals.byRole.other++;
      }
      return totals;
    }
    const sum = (vote.candidates || []).reduce((s, c) => s + (Number(c.votes) || 0), 0);
    totals.total = sum;
    return totals;
  }

  function isVoteActive(vote) {
    const now = new Date();
    if (vote.active === false) return false;
    if (vote.startsAt && new Date(vote.startsAt) > now) return false;
    if (vote.endsAt && new Date(vote.endsAt) <= now) return false;
    return true;
  }
  function canUserVote(vote, user) {
    if (!user) return false;
    const allowed = normalizeAllowed(vote.allowed);
    const role = normalizeUserRole(user.role);
    if (allowed === 'all') return true;
    if (allowed === 'students' && role === 'student') return true;
    if (allowed === 'teachers' && role === 'teacher') return true;
    return false;
  }

  // ---------- live timer (1s) ----------
  function startLiveTimer() {
    if (window.__voteRefreshTimer) { clearInterval(window.__voteRefreshTimer); window.__voteRefreshTimer = null; }
    updateAllTimers();
    window.__voteRefreshTimer = setInterval(() => {
      if (!listMounted) { clearInterval(window.__voteRefreshTimer); window.__voteRefreshTimer = null; return; }
      updateAllTimers();
    }, 1000);
  }

  function updateAllTimers() {
    const metaNodes = document.querySelectorAll('[data-endsat]');
    metaNodes.forEach(n => {
      const endsAt = n.getAttribute('data-endsat');
      const id = n.getAttribute('data-voteid');
      const ms = timeLeftMs(endsAt);
      const timeEl = n.querySelector('.vote-card__time');
      if (timeEl) timeEl.textContent = timeLeftText(endsAt);
      const card = n.closest('.vote-card');
      if (!card) return;
      card.classList.remove('vote-card--soon','vote-card--urgent','vote-card--ended');
      if (ms <= 0) {
        card.classList.add('vote-card--ended');
        const voteObj = votesCache.find(v => String(v._id) === String(id));
        if (voteObj) {
          const comp = computeRankingClientSide(voteObj.candidates || []);
          const winnerNode = card.querySelector('.vote-card__winner');
          if (!winnerNode) {
            const wd = document.createElement('div'); wd.className = 'vote-card__winner';
            if (comp.winners.length === 1) {
              wd.innerHTML = `<strong>Winner:</strong> ${escapeHtml(comp.winners[0].name||'')} — ${escapeHtml(comp.winners[0].title||'')} • ${String(comp.winners[0].votes||0)} votes`;
            } else {
              wd.innerHTML = `<strong>Tie:</strong> ${comp.winners.map(w => escapeHtml(w.name||'') + ` (${String(w.votes||0)})`).join(', ')}`;
            }
            card.appendChild(wd);
          }
          const totals = computeTotals(voteObj);
          const totalsNode = card.querySelector('.vote-card__totals');
          if (totalsNode) totalsNode.textContent = `Total votes: ${totals.total}${totals.byRole ? ' (' + (totals.byRole.student||0) + ' students' + (totals.byRole.teacher ? ', ' + totals.byRole.teacher + ' teachers' : '') + (totals.byRole.other ? ', ' + totals.byRole.other + ' others' : '') + ')' : ''}`;
        }
      } else {
        if (ms <= (10*60*1000)) card.classList.add('vote-card--urgent');
        else if (ms <= (60*60*1000)) card.classList.add('vote-card--soon');
      }
    });

    // detail timer
    const detailTimerEl = document.querySelector('[data-detail-endsat]');
    if (detailTimerEl) {
      const endsAt = detailTimerEl.getAttribute('data-detail-endsat');
      const ms = timeLeftMs(endsAt);
      const timeEl = detailTimerEl.querySelector('.vote-detail__time');
      if (timeEl) timeEl.textContent = timeLeftText(endsAt);
      if (ms <= 0 && typeof detailTimerEl._onEnded === 'function') {
        detailTimerEl._onEnded();
        detailTimerEl._onEnded = null;
      }
    }
  }

  // ---------- polling (5s) ----------
  function startPolling() {
    if (window.__votePollTimer) { clearInterval(window.__votePollTimer); window.__votePollTimer = null; }
    // do an immediate fetch to keep UI fresh
    pollFetch();
    window.__votePollTimer = setInterval(() => {
      if (!listMounted) { clearInterval(window.__votePollTimer); window.__votePollTimer = null; return; }
      pollFetch();
    }, 5000);
  }

  async function pollFetch() {
    try {
      const resp = await apiFetch('/votes').catch(()=>({ ok:false }));
      if (!resp || !resp.ok) return;
      // we replace cache and rerender list to pick up vote count changes.
      votesCache = resp.votes || [];
      // Re-render list only when the list is mounted (not on the detail page)
      if (listMounted) renderList(votesCache);
    } catch (err) {
      console.warn('poll fetch error', err);
    }
  }

  // ---------- load & render ----------
  async function loadList() {
    voteList.innerHTML = '<div class="muted">Loading...</div>';
    const resp = await apiFetch('/votes').catch(()=>({ ok:false }));
    if (!resp || !resp.ok) { voteList.innerHTML = '<div class="muted">Failed to load votes</div>'; return; }
    votesCache = resp.votes || [];
    renderList(votesCache);
    startLiveTimer();
    startPolling();
  }

  function renderList(votes) {
    voteList.innerHTML = '';
    if (!votes || !votes.length) { voteList.innerHTML = '<div class="muted">No elections found</div>'; return; }
    const wrap = document.createElement('div'); wrap.className = 'vote-list-grid';

    votes.forEach(v => {
      const msLeft = timeLeftMs(v.endsAt);
      const ended = msLeft <= 0;
      const totals = computeTotals(v);
      const card = document.createElement('div'); card.className='vote-card';
      if (v.active === false) card.classList.add('vote-card--inactive');
      if (ended) card.classList.add('vote-card--ended');
      card.setAttribute('data-voteid', String(v._id));

      // meta/time/totals
      const meta = document.createElement('div'); meta.className = 'vote-card__meta'; meta.setAttribute('data-endsat', v.endsAt || '');
      meta.innerHTML = `<div class="vote-card__time">${timeLeftText(v.endsAt)}</div>
                        <div class="vote-card__totals">Total votes: ${totals.total}${totals.byRole ? ' (' + (totals.byRole.student||0) + ' students' + (totals.byRole.teacher ? ', ' + totals.byRole.teacher + ' teachers' : '') + (totals.byRole.other ? ', ' + totals.byRole.other + ' others' : '') + ')' : ''}</div>`;

      // header (left/right)
      const header = document.createElement('div'); header.className='vote-card__header';
      const left = document.createElement('div'); left.className='vote-card__left';
      left.innerHTML = `<div class="vote-card__title">${escapeHtml(v.title)}</div><div class="muted vote-card__desc">${escapeHtml(v.description||'')}</div>`;
      header.appendChild(left);
      const right = document.createElement('div'); right.className='vote-card__right';
      right.appendChild(meta);

      // actions (role checks)
      const actions = document.createElement('div'); actions.className='vote-card__actions';
      const viewBtn = document.createElement('button'); viewBtn.className='btn'; viewBtn.textContent='Open';
      viewBtn.addEventListener('click', ()=> openVote(v._id));
      actions.appendChild(viewBtn);

      if (['admin','manager'].includes((curUser.role||'').toLowerCase())) {
        const editBtn = document.createElement('button'); editBtn.className='btn btn--outline'; editBtn.textContent='Edit';
        editBtn.addEventListener('click', ()=> showCreateEditModal(v));
        actions.appendChild(editBtn);

        const delBtn = document.createElement('button'); delBtn.className='btn btn--danger'; delBtn.textContent='Delete';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this election?')) return;
          delBtn.disabled = true;
          try {
            const r = await apiFetch(`/votes/${v._id}`, { method:'DELETE' });
            if (!r || !r.ok) { alert('Delete failed: ' + (r && r.error ? r.error : 'server error')); delBtn.disabled=false; return; }
            await loadList();
          } catch (err) { console.error('delete vote', err); alert('Delete failed'); delBtn.disabled=false; }
        });
        actions.appendChild(delBtn);

        const toggleBtn = document.createElement('button'); toggleBtn.className='btn'; toggleBtn.textContent = v.active === false ? 'Activate' : 'Deactivate';
        toggleBtn.addEventListener('click', async () => {
          toggleBtn.disabled = true;
          try {
            const rr = await apiFetch(`/votes/${v._id}`, { method:'PATCH', body:{ active: !(v.active === true) }});
            if (!rr || !rr.ok) { alert('Update failed'); toggleBtn.disabled=false; return; }
            await loadList();
          } catch (err) { console.error('toggle active err', err); alert('Update failed'); toggleBtn.disabled=false; }
        });
        actions.appendChild(toggleBtn);
      }

      right.appendChild(actions);
      header.appendChild(right);
      card.appendChild(header);

      // candidate preview with progress bars & percentages
      const candWrap = document.createElement('div'); candWrap.className='vote-card__cands';
      const totalVotes = Math.max(1, totals.total); // avoid division by zero; show 0% when total was zero
      (v.candidates || []).slice(0,4).forEach(c => {
        const votes = Number(c.votes) || 0;
        const pct = totals.total ? Math.round((votes / totalVotes) * 100) : 0;
        const el = document.createElement('div'); el.className='vote-card__cand';
        el.innerHTML = `<div class="vote-card__cand-head"><div class="vote-card__cand-name">${escapeHtml(c.name || 'Candidate')}</div><div class="muted vote-card__cand-votes">${votes} votes • ${pct}%</div></div>
                        <div class="progress"><div class="progress__bar" style="width:${pct}%;"></div></div>
                        <div class="muted vote-card__cand-title">${escapeHtml(c.title||'')}</div>`;
        candWrap.appendChild(el);
      });
      card.appendChild(candWrap);

      // ended -> winner/tie (immediate if in payload)
      if (v.winners && v.winners.length) {
        const winnerDiv = document.createElement('div'); winnerDiv.className='vote-card__winner';
        if (v.winners.length === 1) winnerDiv.innerHTML = `<strong>Winner:</strong> ${escapeHtml(v.winners[0].name||'')} — ${escapeHtml(v.winners[0].title||'')} • ${String(v.winners[0].votes||0)} votes`;
        else winnerDiv.innerHTML = `<strong>Tie:</strong> ${v.winners.map(w => escapeHtml(w.name||'') + ` (${String(w.votes||0)})`).join(', ')}`;
        card.appendChild(winnerDiv);
      }

      wrap.appendChild(card);
    });

    voteList.appendChild(wrap);
  }

  // ----------------- modal / detail code (unchanged except results include progress bars) -----------------
  function buildCandidateRowNode(candidatesWrap, init = {}) {
    const row = document.createElement('div'); row.className = 'candidate-row';
    row.style.position = 'relative';
    const studentInput = document.createElement('input'); studentInput.className='input'; studentInput.placeholder = 'Student name or id (type to search)';
    studentInput.value = init.studentName || init.name || '';
    const titleInput = document.createElement('input'); titleInput.className='input'; titleInput.placeholder = 'Campaign title';
    titleInput.value = init.title || '';
    const descInput = document.createElement('input'); descInput.className='input'; descInput.placeholder = 'Candidate description';
    descInput.value = init.description || '';

    const removeBtn = document.createElement('button'); removeBtn.className='btn btn--danger'; removeBtn.type='button'; removeBtn.textContent='✕';
    removeBtn.title = 'Remove candidate';

    row.appendChild(studentInput);
    row.appendChild(titleInput);
    row.appendChild(descInput);
    row.appendChild(removeBtn);

    row._candidate = { studentId: init.studentId || init._id || null, studentName: studentInput.value || '' };

    const suggestions = document.createElement('div'); suggestions.className = 'suggestions'; suggestions.style.display='none';
    row.appendChild(suggestions);

    function showSuggestions(arr) {
      suggestions.innerHTML = '';
      if (!arr || !arr.length) { suggestions.style.display='none'; return; }
      arr.forEach(s => {
        const item = document.createElement('div'); item.className='suggestion-item';
        item.innerHTML = `<div class="s-name">${escapeHtml(s.fullname || s.name || '')}</div>
                          <div class="muted s-id">${escapeHtml(String(s._id || s.id))}</div>`;
        item.addEventListener('click', () => {
          studentInput.value = s.fullname || s.name || String(s._id || s.id);
          row._candidate.studentId = String(s._id || s.id);
          row._candidate.studentName = studentInput.value;
          suggestions.style.display = 'none';
        });
        suggestions.appendChild(item);
      });
      suggestions.style.display = 'block';
    }

    let searchTimer = null;
    studentInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      row._candidate.studentId = null;
      row._candidate.studentName = '';
      const q = (e.target.value || '').trim();
      if (!q) { suggestions.style.display = 'none'; return; }
      searchTimer = setTimeout(async () => {
        try {
          const r = await apiFetch(`/students?q=${encodeURIComponent(q)}`).catch(()=>null);
          const arr = r && (r.students || r.items || []) || [];
          showSuggestions(arr.slice(0,20));
        } catch (err) { console.warn('student search failed', err); showSuggestions([]); }
      }, 200);
    });

    function outsideListener(ev) { if (!row.contains(ev.target)) suggestions.style.display = 'none'; }
    document.addEventListener('click', outsideListener);

    removeBtn.addEventListener('click', () => {
      suggestions.remove();
      document.removeEventListener('click', outsideListener);
      row.remove();
    });

    studentInput.addEventListener('focus', () => { if (suggestions.children.length) suggestions.style.display = 'block'; });

    return (candidatesWrap ? (candidatesWrap.appendChild(row), row) : row);
  }

  function buildCreateEditModal(initial = null) {
    const isEdit = !!initial;
    const container = document.createElement('div'); container.className = 'modal-create-vote';
    container.innerHTML = `
      <h3>${isEdit ? 'Edit Election' : 'Create Election'}</h3>
      <div class="form-grid">
        <label>Title</label><input id="vote-title" class="input" />
        <label>Description</label><textarea id="vote-desc" class="input" rows="3"></textarea>
        <label>Allowed</label>
        <select id="vote-allowed" class="input"><option value="students">Students</option><option value="teachers">Teachers</option><option value="all">All</option></select>
        <label>Starts At</label><input id="vote-starts" type="datetime-local" class="input" />
        <label>Ends At</label><input id="vote-ends" type="datetime-local" class="input" />
        <label style="grid-column:1/3"><input id="vote-active" type="checkbox" /> Visible (active)</label>
      </div>
      <div style="margin-top:12px">
        <h4>Candidates <button id="add-candidate-btn" class="btn btn--outline">+ Add Candidate</button></h4>
        <div id="candidates-wrap" class="candidates-wrap"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button id="cancel-vote-create" class="btn btn--outline">Cancel</button>
        <button id="save-vote-create" class="btn">${isEdit ? 'Save changes' : 'Save'}</button>
      </div>
    `;

    const candidatesWrap = container.querySelector('#candidates-wrap');
    if (initial) {
      container.querySelector('#vote-title').value = initial.title || '';
      container.querySelector('#vote-desc').value = initial.description || '';
      container.querySelector('#vote-allowed').value = normalizeAllowed(initial.allowed || 'students');
      container.querySelector('#vote-active').checked = initial.active !== false;
      if (initial.startsAt) container.querySelector('#vote-starts').value = new Date(initial.startsAt).toISOString().slice(0,16);
      if (initial.endsAt) container.querySelector('#vote-ends').value = new Date(initial.endsAt).toISOString().slice(0,16);
      (initial.candidates || []).forEach(c => buildCandidateRowNode(candidatesWrap, { studentId: c.studentId, studentName: c.name || '', title: c.title || '', description: c.description || '', _id: c._id, name: c.name }));
    } else {
      buildCandidateRowNode(candidatesWrap); buildCandidateRowNode(candidatesWrap);
    }

    container.querySelector('#add-candidate-btn').addEventListener('click', (e) => { e.preventDefault(); buildCandidateRowNode(candidatesWrap); });
    container.querySelector('#cancel-vote-create').addEventListener('click', (e) => { e.preventDefault(); closeModal(); });

    container.querySelector('#save-vote-create').addEventListener('click', async (e) => {
      e.preventDefault();
      const title = container.querySelector('#vote-title').value.trim();
      const description = container.querySelector('#vote-desc').value.trim();
      const allowedVal = container.querySelector('#vote-allowed').value;
      const allowed = normalizeAllowed(allowedVal);
      const startsAtVal = container.querySelector('#vote-starts').value;
      const endsAtVal = container.querySelector('#vote-ends').value;
      const active = container.querySelector('#vote-active').checked;
      if (!title) return alert('Enter title');

      const candidateRows = Array.from(candidatesWrap.querySelectorAll('.candidate-row'));
      const candidates = candidateRows.map(r => {
        const studentName = r.querySelector('input').value.trim();
        const titleC = r.querySelectorAll('input')[1].value.trim();
        const descC = r.querySelectorAll('input')[2].value.trim();
        return {
          studentId: r._candidate && r._candidate.studentId ? r._candidate.studentId : null,
          name: r._candidate && r._candidate.studentName ? r._candidate.studentName : studentName,
          title: titleC,
          description: descC
        };
      }).filter(c => c.studentId || c.name);

      try {
        const body = {
          title,
          description,
          allowed,
          startsAt: startsAtVal ? new Date(startsAtVal).toISOString() : new Date().toISOString(),
          endsAt: endsAtVal ? new Date(endsAtVal).toISOString() : new Date(Date.now() + 24*3600*1000).toISOString(),
          candidates,
          active
        };

        if (initial && initial._id) {
          const r = await apiFetch(`/votes/${initial._id}`, { method:'PATCH', body });
          if (!r || !r.ok) { alert('Failed to update vote: ' + (r && r.error ? r.error : 'server error')); return; }
        } else {
          const r = await apiFetch('/votes', { method:'POST', body });
          if (!r || !r.ok) { alert('Failed to create vote: ' + (r && r.error ? r.error : 'server error')); return; }
        }
        closeModal();
        await loadList();
      } catch (err) {
        console.error('save vote error', err);
        alert('Save failed: ' + (err && err.message ? err.message : 'server error'));
      }
    });

    return container;
  }

  function showCreateEditModal(initial = null) {
    if (!['admin','manager'].includes((curUser.role||'').toLowerCase())) { alert('Only admin/manager can perform this action'); return; }
    const node = buildCreateEditModal(initial);
    showModal(node);
  }

  // detail view (results now include progress bars + percentages)
  async function openVote(id) {
    const r = await apiFetch(`/votes/${id}`).catch(()=>null);
    if (!r || !r.ok) return alert('Failed to load election');
    const vote = r.vote; if (!vote) return alert('Vote not found');

    // when opening detail we stop list polling
    listMounted = false;
    if (window.__votePollTimer) { clearInterval(window.__votePollTimer); window.__votePollTimer = null; }

    app.innerHTML = '';
    const container = document.createElement('div'); container.className = 'vote-detail';
    const header = document.createElement('div'); header.className='vote-detail__header';
    header.innerHTML = `<div><h3 class="vote-detail__title">${escapeHtml(vote.title)}</h3><div class="muted">${escapeHtml(vote.description||'')}</div></div>`;
    const right = document.createElement('div'); right.className='vote-detail__controls';

    const back = document.createElement('button'); back.className='btn btn--outline'; back.textContent='Back';
    back.addEventListener('click', async () => {
      // go back to list and restart polling/timers
      listMounted = true;
      if (window.__voteRefreshTimer) { clearInterval(window.__voteRefreshTimer); window.__voteRefreshTimer = null; }
      if (window.__votePollTimer) { clearInterval(window.__votePollTimer); window.__votePollTimer = null; }
      await renderVote();
    });
    right.appendChild(back);

    if (['admin','manager'].includes((curUser.role||'').toLowerCase())) {
      const editBtn = document.createElement('button'); editBtn.className='btn btn--outline'; editBtn.textContent='Edit';
      editBtn.addEventListener('click', () => showCreateEditModal(vote));
      right.appendChild(editBtn);

      const delBtn = document.createElement('button'); delBtn.className='btn btn--danger'; delBtn.textContent='Delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this election?')) return;
        delBtn.disabled = true;
        try {
          const rr = await apiFetch(`/votes/${vote._id}`, { method:'DELETE' });
          if (!rr || !rr.ok) { alert('Delete failed'); delBtn.disabled=false; return; }
          await renderVote();
        } catch (err) { console.error('delete', err); alert('Delete failed'); delBtn.disabled=false; }
      });
      right.appendChild(delBtn);

      const toggleActive = document.createElement('button'); toggleActive.className='btn';
      toggleActive.textContent = vote.active === false ? 'Activate' : 'Deactivate';
      toggleActive.addEventListener('click', async () => {
        toggleActive.disabled = true;
        try {
          const rr = await apiFetch(`/votes/${vote._id}`, { method:'PATCH', body: { active: !(vote.active === true) }});
          if (!rr || !rr.ok) { alert('Update failed'); toggleActive.disabled=false; return; }
          openVote(vote._id);
        } catch (err) { console.error('toggle', err); alert('Update failed'); toggleActive.disabled=false; }
      });
      right.appendChild(toggleActive);
    }

    header.appendChild(right);
    container.appendChild(header);

    const topInfo = document.createElement('div'); topInfo.className='vote-detail__top';
    const timeNode = document.createElement('div'); timeNode.className='vote-detail__time-wrap';
    const dataNode = document.createElement('div'); dataNode.setAttribute('data-detail-endsat', vote.endsAt || '');
    dataNode.innerHTML = `<div class="muted">Ends: ${vote.endsAt ? new Date(vote.endsAt).toLocaleString() : 'No end'}</div>
                          <div class="vote-detail__time">${timeLeftText(vote.endsAt)}</div>`;
    dataNode._onEnded = () => { openVote(vote._id); };
    timeNode.appendChild(dataNode);
    topInfo.appendChild(timeNode);
    container.appendChild(topInfo);

    const comp = computeRankingClientSide(vote.candidates || []);
    const ranking = vote.ranking || comp.ranking;
    const winners = vote.winners || comp.winners;

    if (timeLeftMs(vote.endsAt) <= 0) {
      if (winners && winners.length) {
        const winBanner = document.createElement('div'); winBanner.className='vote-banner vote-banner--winner';
        if (winners.length === 1) {
          winBanner.innerHTML = `<strong>Election ended — Winner</strong><div style="margin-top:6px">${escapeHtml(winners[0].name||'')} — ${escapeHtml(winners[0].title||'')}</div><div class="muted">Total votes: ${String(winners[0].votes||0)}</div>`;
        } else {
          winBanner.innerHTML = `<strong>Election ended — Tie</strong><div style="margin-top:6px">Tie between: ${winners.map(w => escapeHtml(w.name||'') + ` (${String(w.votes||0)})`).join(', ')}</div>`;
        }
        container.appendChild(winBanner);
      }
    } else if (timeLeftMs(vote.endsAt) <= (60*60*1000)) {
      const warn = document.createElement('div'); warn.className='vote-banner vote-banner--soon';
      warn.innerHTML = `<strong>Ending soon</strong><div class="muted">Time left: ${timeLeftText(vote.endsAt)}</div>`;
      container.appendChild(warn);
    }

    // totals
    const totals = computeTotals(vote);
    const totalsNode = document.createElement('div'); totalsNode.className = 'vote-detail__totals';
    totalsNode.innerHTML = `<strong>Total votes:</strong> ${totals.total}${totals.byRole ? ' — ' + (totals.byRole.student||0) + ' students' + (totals.byRole.teacher ? ', ' + totals.byRole.teacher + ' teachers' : '') + (totals.byRole.other ? ', ' + totals.byRole.other + ' others' : '') : ''}`;
    container.appendChild(totalsNode);

    const grid = document.createElement('div'); grid.className='vote-grid';
    const alreadyVoted = Array.isArray(vote.voters) && vote.voters.some(vt => { try { return String(vt.voterId) === String(curUser._id); } catch(e) { return false; } });
    const nowActive = isVoteActive(vote);
    const allowedNormalized = normalizeAllowed(vote.allowed);
    const userRoleNormalized = normalizeUserRole(curUser.role);

    ranking.forEach(c => {
      const card = document.createElement('div'); card.className='candidate-card';
      if (c.rank) card.style.cssText += (c.rank === 1 ? 'background:linear-gradient(90deg,#FFD70022,#FFD70011);' : '');
      card.innerHTML = `<div class="candidate-card__name">${escapeHtml(c.name || 'Candidate')}</div>
                        <div class="muted candidate-card__title">${escapeHtml(c.title||'')}</div>
                        <div class="candidate-card__desc">${escapeHtml(c.description||'')}</div>
                        <div class="candidate-card__votes">${c.votes||0} votes</div>
                        <div class="muted candidate-card__rank">Rank: ${c.rank || '-'}</div>`;

      let canVote = nowActive && !alreadyVoted;
      if (canVote) {
        if (allowedNormalized === 'all') canVote = true;
        else if (allowedNormalized === 'students') canVote = (userRoleNormalized === 'student');
        else if (allowedNormalized === 'teachers') canVote = (userRoleNormalized === 'teacher');
      }
      if (canVote) {
        const voteBtn = document.createElement('button'); voteBtn.className='btn'; voteBtn.textContent='Vote';
        voteBtn.addEventListener('click', async () => {
          if (!confirm(`Confirm vote for ${c.name || 'candidate'}?`)) return;
          voteBtn.disabled = true; voteBtn.textContent = 'Voting...';
          try {
            const rr = await apiFetch(`/votes/${vote._id}/vote`, { method:'POST', body:{ candidateId: c._id }});
            if (!rr || !rr.ok) { alert('Vote failed: ' + (rr && rr.error ? rr.error : 'server error')); voteBtn.disabled=false; voteBtn.textContent='Vote'; return; }
            alert('Voted successfully');
            openVote(vote._id);
          } catch (err) { console.error('vote err', err); alert('Vote failed'); voteBtn.disabled=false; voteBtn.textContent='Vote'; }
        });
        card.appendChild(voteBtn);
      } else {
        const info = document.createElement('div'); info.className='muted'; info.style.marginTop='8px';
        if (!nowActive) info.textContent = 'Voting closed/not started';
        else if (alreadyVoted) info.textContent = 'You have already voted';
        else info.textContent = 'You are not eligible to vote';
        card.appendChild(info);
      }

      grid.appendChild(card);
    });

    container.appendChild(grid);

    // results with progress bars + percentages
    const resultsBox = document.createElement('div'); resultsBox.className='results-box';
    resultsBox.innerHTML = `<h4>Results</h4>`;
    const resList = document.createElement('div'); resList.className='results-list';
    const totalVotes = Math.max(1, totals.total);
    ranking.forEach((c) => {
      const votes = Number(c.votes) || 0;
      const pct = totals.total ? Math.round((votes / totalVotes) * 100) : 0;
      const rrow = document.createElement('div'); rrow.className='results-row';
      rrow.innerHTML = `<div class="results-row__label">${c.rank}. ${escapeHtml(c.name || '')} — ${escapeHtml(c.title || '')}</div>
                        <div class="results-row__value">${votes} • ${pct}%</div>
                        <div class="progress"><div class="progress__bar" style="width:${pct}%;"></div></div>`;
      resList.appendChild(rrow);
    });
    resultsBox.appendChild(resList);
    container.appendChild(resultsBox);

    container.appendChild(dataNode);
    app.appendChild(container);

    if (!window.__voteRefreshTimer) startLiveTimer();
  }

  // wire create button
  createBtn?.addEventListener('click', () => showCreateEditModal(null));

  // stop timers when navigating away
  // listMounted set to false by back handlers when appropriate

  await loadList();
}







// create manager modal
function openCreateManagerModal(){
  const form = document.createElement('div');
  form.innerHTML = `
    <h3>Create Manager</h3>
    <label>Full name</label><input id="cm-fullname" /><br/>
    <label>Email</label><input id="cm-email" /><br/>
    <label>Phone</label><input id="cm-phone" /><br/>
    <label>Password</label><input id="cm-password" type="password" /><br/>
    <div style="margin-top:8px"><button id="cm-create" class="btn">Create</button> <button id="cm-cancel" class="btn" style="background:#ccc;color:#000;margin-left:8px">Cancel</button></div>
  `;
  showModal(form);
  document.getElementById('cm-cancel').addEventListener('click', closeModal);
  document.getElementById('cm-create').addEventListener('click', async ()=>{
    const fullname = document.getElementById('cm-fullname').value.trim();
    const email = document.getElementById('cm-email').value.trim();
    const phone = document.getElementById('cm-phone').value.trim();
    const password = document.getElementById('cm-password').value;
    if(!fullname || !password) return alert('Name and password required');
    try{
      await apiFetch('/users', { method: 'POST', body: { fullname, email, phone, role: 'manager', password } });
      alert('Manager created');
      closeModal();
      await loadManagers();
    }catch(err){
      console.error('Create manager failed', err);
      alert('Failed to create manager: ' + (err.message || 'server error'));
    }
  });
}






// ---------- Utilities ----------
function debounce(fn, t=300){
  let to;
  return function(...args){ clearTimeout(to); to = setTimeout(()=> fn(...args), t); };
}
function escapeHtml(str){
  if(!str && str !== 0) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// ---------- Init ----------
(async function init(){
  if (typeof apiFetch !== 'function') {
    app.innerHTML = '<div class="page"><h2>Missing API helper</h2><p>Please ensure frontend/js/api.js is loaded and exports apiFetch() and apiUpload()</p></div>';
    return;
  }

  // load current user from backend/token/localStorage
  try {
    await getCurrentUser(true);
  } catch (e) {
    console.debug('getCurrentUser during init failed (ignored):', e && e.message ? e.message : e);
  }

  // update nav after user loaded/fallback
  updateNavByRole();

  // route based on the current user
  const token = getToken();
  if (token) {
    const cur = window.__CURRENT_USER || parseJwt(token) || {};
    navigate(defaultRouteForUser(cur));
  } else {
    navigate('login');
  }
})();

