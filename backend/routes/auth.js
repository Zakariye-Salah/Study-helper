it is so good for styling but error come for i can not make actions like suspend manager or change pasword or warn please check and fix these errors

: socket connected ng6gCI6ArudznyPHAAAI host= https://study-helper-b11e.onrender.com
2app.js:5677 No leaderboard render target
loadLeaderboardFor @ app.js:5677Understand this warning
app.js:8743 chat socket connected
13Mixed Content: The page at '<URL>' was loaded over HTTPS, but requested an insecure element '<URL>'. This request was automatically upgraded to HTTPS, For more information see <URL>Understand this warning
default-avatar.png:1  Failed to load resource: the server responded with a status of 404 ()Understand this error
study-helper-b11e.onrender.com/api/auth/user-change-password/68e8f0fe44178e8fbb40693c:1  Failed to load resource: the server responded with a status of 500 ()Understand this error
app.js:24067 Change manager password error Error: Server error
    at handleResponse (api.js:109:17)
    at async apiFetch (api.js:147:12)
    at async HTMLButtonElement.<anonymous> (app.js:24062:11)
(anonymous) @ app.js:24067Understand this error
study-helper-b11e.onrender.com/api/auth/user-change-password/68e8f0fe44178e8fbb40693c:1  Failed to load resource: the server responded with a status of 500 ()Understand this error
app.js:24067 Change manager password error Error: Server error
    at handleResponse (api.js:109:17)
    at async apiFetch (api.js:147:12)
    at async HTMLButtonElement.<anonymous> (app.js:24062:11)
(anonymous) @ app.js:24067Understand this error
study-helper-b11e.onrender.com/api/auth/user-change-password/68e8f0fe44178e8fbb40693c:1  Failed to load resource: the server responded with a status of 500 ()Understand this error
app.js:24067 Change manager password error Error: Server error
    at handleResponse (api.js:109:17)
    at async apiFetch (api.js:147:12)
    at async HTMLButtonElement.<anonymous> (app.js:24062:11)
(anonymous) @ app.js:24067Understand this error
study-helper-b11e.onrender.com/api/users/68e4cf789c4cb08ae3e43317/suspend:1  Failed to load resource: the server responded with a status of 500 ()Understand this error
app.js:24023 Suspend toggle failed Error: Server error
    at handleResponse (api.js:109:17)
    at async apiFetch (api.js:147:12)
    at async HTMLButtonElement.<anonymous> (app.js:24019:11)
(anonymous) @ app.js:24023Understand this error
api.js:146  POST https://study-helper-b11e.onrender.com/api/users/68e4cf789c4cb08ae3e43317/warn 500 (Internal Server Error)
apiFetch @ api.js:146
(anonymous) @ app.js:24034Understand this error
app.js:24038 Warn toggle failed Error: Server error
    at handleResponse (api.js:109:17)
    at async apiFetch (api.js:147:12)
    at async HTMLButtonElement.<anonymous> (app.js:24034:11) 

    

    :
    // FRONTEND: User management (Admin only)
    rhese old functions for deleting warned suspend and change password is working please do the same like that 
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
            <button data-id="${u._id}" class="chg-pass btn" style="background:#f59e0b;margin-left:6px">Change Password</button>
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

    // change password for managers
    list.querySelectorAll('.chg-pass').forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const id = e.target.dataset.id;
      const newPass = prompt('Enter new password for this manager (min 6 chars):');
      if (!newPass) return;
      if (String(newPass).length < 6) { alert('Password must be at least 6 chars'); return; }
      try {
        await apiFetch('/auth/user-change-password/' + id, { method: 'POST', body: { newPassword: newPass } });
        try { await navigator.clipboard.writeText(newPass); } catch(e){}
        showToast('Manager password updated', 'info', 4000);
        await loadManagers();
      } catch (err) {
        console.error('Change manager password error', err);
        showToast('Failed to change manager password', 'error');
      }
    }));

  } catch(err){
    console.error(err);
    list.innerHTML = '<p>Failed to load managers</p>';
  }
}


/* ---------- Manager UI : responsive styles + list + view modal ---------- */
(function(){
  // ensure escapeHtml exists
  if (typeof escapeHtml !== 'function') {
    window.escapeHtml = function(s=''){ return String(s===null||s===undefined?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };
  }

  // inject styles once
  if (!document.getElementById('mgr-responsive-css')) {
    const css = document.createElement('style');
    css.id = 'mgr-responsive-css';
    css.textContent = `
/* Manager list - modern responsive */
.user-management .mgr-list { display:flex; flex-direction:column; gap:12px; }
.mgr-card { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding:12px; border-radius:12px; background: linear-gradient(180deg,#fff,#fbfdff); border:1px solid rgba(15,23,42,0.03); box-shadow: 0 10px 30px rgba(2,6,23,0.04); }
.mgr-info { flex:1; min-width:0; }
.mgr-name { font-weight:800; font-size:16px; color:#0f172a; margin-bottom:6px; line-height:1.05; }
.mgr-role { font-weight:700; color:#111827; font-size:13px; margin-bottom:6px; display:block; }
.mgr-email { color:#6b7280; font-size:13px; margin-bottom:8px; word-break:break-word; }

/* Actions */
.mgr-actions { display:flex; gap:8px; align-items:center; flex-shrink:0; }
.mgr-actions .btn { padding:8px 10px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; border:0; display:inline-flex; align-items:center; gap:8px; }
.mgr-actions .btn .icon { display:none; width:18px; height:18px; line-height:0; }

/* specific buttons */
.btn-view { background:linear-gradient(90deg,#2563eb,#7c3aed); color:#fff; }
.btn-suspend { background:#e6e6e9; color:#111; border:1px solid rgba(2,6,23,0.04); }
.btn-warn { background:#fef3c7; color:#92400e; border:1px solid rgba(146,64,14,0.06); }
.btn-delete { background:#ef4444; color:#fff; }
.btn-pass { background:#f59e0b; color:#fff; }

/* small helper */
.muted { color:#6b7280; font-size:13px; }

/* responsive: stack on small screens and switch to icons */
@media (max-width:720px) {
  .mgr-card { flex-direction:column; align-items:stretch; padding:12px; }
  .mgr-actions { display:flex; flex-wrap:wrap; justify-content:flex-start; gap:8px; margin-top:8px; }
  /* show icons + hide text on small screens for specific actions */
  .mgr-actions .btn .text { display:none; }
  .mgr-actions .btn .icon { display:inline-block; }
  /* keep suspend and warn textual (they will still show icon if included, but we keep text visible with !important) */
  .btn-suspend .text, .btn-warn .text { display:inline-block !important; }
  .btn-suspend .icon, .btn-warn .icon { display:none !important; }

  .mgr-name { font-size:15px; }
  .mgr-role { display:block; font-size:13px; color:#374151; margin:4px 0; }
  .mgr-email { font-size:13px; }

  /* action sizes */
  .mgr-actions .btn { padding:8px; min-width:44px; justify-content:center; }
}

/* modal single-column styles (used in openViewManager) */
.mgr-modal-wrap { width:100%; max-width:980px; max-height:84vh; overflow:auto; border-radius:12px; }
.mgr-modal-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:12px 16px; border-bottom:1px solid #eef2f7; }
.mgr-modal-body { padding:14px; display:flex; flex-direction:column; gap:12px; }
.mgr-badges { display:flex; gap:8px; flex-wrap:wrap; }
.mgr-badge { background:#eef2ff; color:#2563eb; padding:6px 10px; border-radius:999px; font-weight:700; font-size:13px; box-shadow:0 6px 18px rgba(37,99,235,0.06); }
.mgr-section { background:#fff; border-radius:10px; padding:12px; border:1px solid rgba(15,23,42,0.03); box-shadow:0 8px 26px rgba(2,6,23,0.04); }
.mgr-section-title { margin:0 0 8px 0; font-weight:700; font-size:15px; }
.mgr-item { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding:10px; border-radius:8px; background:#fbfdff; border:1px solid rgba(15,23,42,0.03); margin-bottom:8px; }
.mgr-item .meta { color:#6b7280; font-size:13px; }
.mgr-item .actions { display:flex; gap:8px; align-items:center; }
.mgr-small { color:#6b7280; font-size:13px; }
`;
    document.head.appendChild(css);
  }

  // svg icons (small, inline)
  const ICONS = {
    eye: `<svg class="icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 5.5C6.5 5.5 3.7 7.6 2 10c1.7 2.4 4.5 4.5 8 4.5s6.3-2.1 8-4.5C16.3 7.6 13.5 5.5 10 5.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.2"/></svg>`,
    trash: `<svg class="icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 7v8a2 2 0 002 2h4a2 2 0 002-2V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7V5a2 2 0 012-2h0a2 2 0 012 2v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 7h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    key: `<svg class="icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.5 11.5a3.5 3.5 0 115.0-4.95L18 10l-1 1-2-2-1 1-2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="1.2"/></svg>`
  };

  /* ---------- renderUserManagement (admin-only) ---------- */
  window.renderUserManagement = async function renderUserManagement(){
    const role = (typeof getUserRole === 'function') ? getUserRole() : (window.__CURRENT_USER && window.__CURRENT_USER.role);
    if (role !== 'admin') { app.innerHTML = '<div class="page"><h2>Access denied</h2></div>'; return; }
    app.innerHTML = '';
    // use your tpl if available
    let node;
    try {
      node = tpl ? tpl('user-management') : null;
    } catch(e) {
      node = null;
    }
    if (!node) {
      // minimal inline layout if tpl not present
      node = document.createElement('div');
      node.className = 'page';
      node.innerHTML = `
        <div style="max-width:1100px;margin:0 auto;padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2>Managers</h2>
            <div><button id="create-manager-btn" class="btn">Create Manager</button></div>
          </div>
          <div style="margin-top:12px"><input id="manager-search" placeholder="Search managers..." style="padding:8px;border-radius:8px;border:1px solid #eef2f7;width:100%;max-width:420px"/></div>
          <div id="user-management-list" class="mgr-list" style="margin-top:12px"></div>
        </div>
      `;
    } else {
      // ensure the template contains required nodes; if not create fallback
      const frag = node;
      const listEl = frag.querySelector('#user-management-list') || frag.querySelector('.mgr-list');
      if (!listEl) {
        // append a list container to template
        (frag.querySelector('.page') || frag).appendChild(Object.assign(document.createElement('div'), { id:'user-management-list', className:'mgr-list' }));
      }
      // ensure search/create exist (if not present create)
      if (!frag.querySelector('#create-manager-btn')) {
        const header = frag.querySelector('.page') || frag;
        const btnWrap = document.createElement('div');
        btnWrap.innerHTML = `<button id="create-manager-btn" class="btn">Create Manager</button>`;
        header.insertBefore(btnWrap, header.firstChild);
      }
      if (!frag.querySelector('#manager-search')) {
        const inputWrap = document.createElement('div');
        inputWrap.innerHTML = `<input id="manager-search" placeholder="Search managers..." style="padding:8px;border-radius:8px;border:1px solid #eef2f7;width:100%;max-width:420px"/>`;
        (frag.querySelector('.page') || frag).insertBefore(inputWrap, (frag.querySelector('#user-management-list') || frag.querySelector('.mgr-list')));
      }
      node = frag;
    }

    app.appendChild(node);

    // wire create + search
    document.getElementById('create-manager-btn')?.addEventListener('click', openCreateManagerModal);
    const search = document.getElementById('manager-search');
    if (search) search.addEventListener('input', debounce(()=> loadManagers(), 300));

    // initial load
    await loadManagers();
  };

  /* ---------- loadManagers: improved modern responsive list ---------- */
  async function loadManagers(page = 1){
    const list = document.getElementById('user-management-list');
    if (!list) return;
    list.innerHTML = '<div class="muted">Loading...</div>';
    try {
      const q = document.getElementById('manager-search')?.value || '';
      const res = await apiFetch('/users?role=manager&search=' + encodeURIComponent(q) + '&page=' + page);
      const items = res.items || [];
      list.innerHTML = '';
      if (!items.length) { list.innerHTML = '<p class="muted">No manager users</p>'; return; }

      items.forEach(u => {
        const suspended = !!u.suspended;
        const warned = !!u.warned;
        const suspendLabel = suspended ? 'Unsuspend' : 'Suspend';
        const warnLabel = warned ? 'Remove warn' : 'Warn';

        const card = document.createElement('div');
        card.className = 'mgr-card';

        // build actions: each button has both .icon and .text spans — CSS switches visible part on mobile
        const viewBtnHtml = `<button class="btn btn-view view-user" data-id="${escapeHtml(u._id)}" aria-label="View ${escapeHtml(u.fullname||'manager')}">
            <span class="icon" aria-hidden="true">${ICONS.eye}</span><span class="text">View</span>
          </button>`;
        const suspendBtnHtml = `<button class="btn btn-suspend suspend-user" data-id="${escapeHtml(u._id)}">${escapeHtml(suspendLabel)}</button>`;
        const warnBtnHtml = `<button class="btn btn-warn warn-user" data-id="${escapeHtml(u._id)}">${escapeHtml(warnLabel)}</button>`;
        const deleteBtnHtml = `<button class="btn btn-delete del-user" data-id="${escapeHtml(u._id)}" aria-label="Delete ${escapeHtml(u.fullname||'manager')}">
            <span class="icon" aria-hidden="true">${ICONS.trash}</span><span class="text">Delete</span>
          </button>`;
        const passBtnHtml = `<button class="btn btn-pass chg-pass" data-id="${escapeHtml(u._id)}" aria-label="Change password for ${escapeHtml(u.fullname||'manager')}">
            <span class="icon" aria-hidden="true">${ICONS.key}</span><span class="text">Change Password</span>
          </button>`;

        // info area: name, role on its own line, email on new line
        card.innerHTML = `
          <div class="mgr-info">
            <div class="mgr-name">${escapeHtml(u.fullname || u.name || '—')}</div>
            <div class="mgr-role">Role: ${escapeHtml(u.role || '—')}</div>
            <div class="mgr-email">${escapeHtml(u.email || '—')}</div>
          </div>
          <div class="mgr-actions" aria-hidden="false">
            ${viewBtnHtml}
            ${suspendBtnHtml}
            ${warnBtnHtml}
            ${deleteBtnHtml}
            ${passBtnHtml}
          </div>
        `;

        list.appendChild(card);
      });

      // attach listeners
      list.querySelectorAll('.view-user').forEach(b => b.addEventListener('click', e => openViewManager(e.currentTarget.dataset.id)));
      list.querySelectorAll('.suspend-user').forEach(b => b.addEventListener('click', async e => {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        try {
          // fetch latest state
          const ures = await apiFetch('/users/' + encodeURIComponent(id));
          const currently = !!(ures && ures.user && ures.user.suspended);
          const toSet = !currently;
          const ok = toSet ? confirm('Suspend this manager? They will be prevented from accessing the system.') : confirm('Unsuspend this manager?');
          if (!ok) return;
          await apiFetch('/users/' + encodeURIComponent(id) + '/suspend', { method: 'POST', body: { suspend: toSet } });
          alert(toSet ? 'User suspended' : 'User un-suspended');
          await loadManagers();
        } catch (err) {
          console.error('Suspend toggle failed', err);
          alert('Failed to toggle suspended: ' + (err && err.message || 'server error'));
        }
      }));
      list.querySelectorAll('.warn-user').forEach(b => b.addEventListener('click', async e => {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        try {
          const ures = await apiFetch('/users/' + encodeURIComponent(id));
          const currently = !!(ures && ures.user && ures.user.warned);
          const toSet = !currently;
          await apiFetch('/users/' + encodeURIComponent(id) + '/warn', { method: 'POST', body: { warn: toSet } });
          alert(toSet ? 'User warned' : 'Warning removed');
          await loadManagers();
        } catch (err) {
          console.error('Warn toggle failed', err);
          alert('Failed to send warning: ' + (err && err.message || 'server error'));
        }
      }));
      list.querySelectorAll('.del-user').forEach(b => b.addEventListener('click', async e => {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        if (!confirm('Delete manager and ALL their data (students, teachers, classes, subjects, votes, payments)? This is irreversible.')) return;
        try {
          await apiFetch('/users/' + encodeURIComponent(id), { method:'DELETE' });
          alert('Deleted');
          await loadManagers();
        } catch (err) {
          console.error('Delete failed', err);
          alert('Failed to delete: ' + (err && err.message || 'server error'));
        }
      }));
      list.querySelectorAll('.chg-pass').forEach(b => b.addEventListener('click', async e => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const newPass = prompt('Enter new password for this manager (min 6 chars):');
        if (!newPass) return;
        if (String(newPass).length < 6) { alert('Password must be at least 6 chars'); return; }
        try {
          await apiFetch('/auth/user-change-password/' + encodeURIComponent(id), { method: 'POST', body: { newPassword: newPass } });
          try { await navigator.clipboard.writeText(newPass); } catch(e){ /* ignore */ }
          showToast && showToast('Manager password updated', 'info', 4000);
          await loadManagers();
        } catch (err) {
          console.error('Change manager password error', err);
          showToast && showToast('Failed to change manager password', 'error');
        }
      }));

    } catch (err) {
      console.error('loadManagers error', err);
      list.innerHTML = '<p class="muted">Failed to load managers</p>';
    }
  }
  window.loadManagers = loadManagers;

  /* ---------- openViewManager: single-modal page, "View data" replaces body ---------- */
  async function openViewManager(id){
    try {
      const res = await apiFetch('/users/' + encodeURIComponent(id));
      const u = (res && (res.user || res)) || {};
      const counts = res.counts || {};

      // create modal content container
      const wrap = document.createElement('div');
      wrap.className = 'mgr-modal-wrap';
      wrap.innerHTML = `
        <div class="mgr-modal-header">
          <div>
            <div style="font-weight:800;font-size:18px">${escapeHtml(u.fullname || 'User')}</div>
            <div class="mgr-small" style="margin-top:6px">Email: ${escapeHtml(u.email || '—')}</div>
            <div class="mgr-small" style="margin-top:2px">Role: ${escapeHtml(u.role || '—')}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="mgr-view-data" class="btn btn-view" style="padding:8px 12px">View data</button>
            <button id="mgr-close" class="btn btn--close" style="background:#e5e7eb;color:#111;padding:8px 12px">Close</button>
          </div>
        </div>
        <div class="mgr-modal-body">
          <div class="mgr-badges" id="mgr-badges">
            <div class="mgr-badge">Students: ${counts.students || 0}</div>
            <div class="mgr-badge">Teachers: ${counts.teachers || 0}</div>
            <div class="mgr-badge">Payments: ${counts.payments || 0}</div>
            <div class="mgr-badge">Classes: ${counts.classes || 0}</div>
            <div class="mgr-badge">Subjects: ${counts.subjects || 0}</div>
            <div class="mgr-badge">Parents: ${counts.parents || 0}</div>
            <div class="mgr-badge">Votes: ${counts.votes || 0}</div>
          </div>

          <div id="mgr-body-content">
            <div class="mgr-section">
              <h4 class="mgr-section-title">Overview</h4>
              <div class="mgr-small"><strong>Full name:</strong> ${escapeHtml(u.fullname || '—')}</div>
              <div class="mgr-small" style="margin-top:6px"><strong>Email:</strong> ${escapeHtml(u.email || '—')}</div>
              <div class="mgr-small" style="margin-top:6px"><strong>Role:</strong> ${escapeHtml(u.role || '—')}</div>
              <div class="mgr-small" style="margin-top:6px"><strong>Created:</strong> ${escapeHtml((u.createdAt||'').toString().slice(0,16) || '—')}</div>
            </div>

            <div class="mgr-section">
              <h4 class="mgr-section-title">Quick actions</h4>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                <button id="mgr-export-json" class="btn btn--outline">Export JSON</button>
                <button id="mgr-export-pdf" class="btn btn--outline">Export PDF</button>
                <button id="mgr-reset-token" class="btn btn--outline">Reset auth token</button>
              </div>
            </div>

            <div class="mgr-section">
              <h4 class="mgr-section-title">Notes</h4>
              <div class="mgr-small">Click "View data" to fetch and inspect this manager's records (students, teachers, parents, classes, subjects, payments, votes). Each record has a Delete action if you're admin.</div>
            </div>
          </div>
        </div>
      `;

      // showModal wrapper (use your app's showModal if available)
      const modal = (typeof showModal === 'function') ? showModal(wrap, { width: '920px' }) : (function fallback(){ document.body.appendChild(wrap); return { close: ()=>wrap.remove() }; })();

      // close wiring
      const closeBtn = wrap.querySelector('#mgr-close');
      if (closeBtn) closeBtn.addEventListener('click', () => { try { closeModal(); } catch(e){ modal && modal.close && modal.close(); } });

      // quick actions
      wrap.querySelector('#mgr-export-json')?.addEventListener('click', async () => {
        try {
          const data = await apiFetch('/users/' + encodeURIComponent(id) + '/data');
          const blob = new Blob([JSON.stringify(data || {}, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `user-${id}-data.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } catch (e) { console.error('Export failed', e); alert('Export failed'); }
      });

      wrap.querySelector('#mgr-export-pdf')?.addEventListener('click', async () => {
        try {
          const data = await apiFetch('/users/' + encodeURIComponent(id) + '/data');
          if (!data) throw new Error('No data');
          const title = `User-${id}-data`;
          let html = `<html><head><title>${escapeHtml(title)}</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:18px}pre{white-space:pre-wrap;background:#f7f7f7;padding:10px;border-radius:6px}</style></head><body>`;
          html += `<h1>${escapeHtml(u.fullname||'User')} — Data</h1>`;
          const sections = ['students','teachers','classes','subjects','parents','payments','votes'];
          sections.forEach(sec => {
            const arr = data[sec] || [];
            html += `<h2>${escapeHtml(sec.charAt(0).toUpperCase()+sec.slice(1))} (${arr.length})</h2>`;
            if (!arr.length) html += `<div style="color:#666">No records</div>`;
            else arr.forEach(item => {
              html += `<div style="margin:6px 0;padding:8px;border:1px solid #eee;border-radius:6px"><strong>${escapeHtml(item.fullname||item.name||item.title||String(item._id||item.id||''))}</strong><div style="color:#666;margin-top:6px"><pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre></div></div>`;
            });
          });
          html += `</body></html>`;
          const w = window.open('', '_blank');
          if (!w) { alert('Pop-up blocked — allow popups to print/save PDF'); return; }
          w.document.open(); w.document.write(html); w.document.close();
          setTimeout(()=> { try { w.print(); } catch(e){ console.warn('print error', e); } }, 500);
        } catch (e) { console.error('Export PDF failed', e); alert('Export PDF failed: ' + (e && e.message)); }
      });

      wrap.querySelector('#mgr-reset-token')?.addEventListener('click', async () => {
        if (!confirm('Reset this user\'s auth token? Existing sessions will be invalidated.')) return;
        try {
          await apiFetch('/users/' + encodeURIComponent(id) + '/reset-token', { method: 'POST' });
          showToast && showToast('Auth token reset requested', 'info');
        } catch (e) { console.error(e); showToast && showToast('Failed to reset token', 'error'); }
      });

      // View data: fetch and render all sections into #mgr-body-content (single-column)
      wrap.querySelector('#mgr-view-data')?.addEventListener('click', async () => {
        const container = wrap.querySelector('#mgr-body-content');
        if (!container) return;
        container.innerHTML = `<div class="mgr-small">Loading user data…</div>`;
        try {
          const data = await apiFetch('/users/' + encodeURIComponent(id) + '/data');
          if (!data) throw new Error('No data returned');

          const students = data.students || [];
          const teachers = data.teachers || [];
          const classes = data.classes || [];
          const subjects = data.subjects || [];
          const parents = data.parents || [];
          const payments = data.payments || [];
          const votes = data.votes || [];

          // simple helper to create section DOM
          function makeSection(title, items, renderItem, resourceName){
            const sec = document.createElement('div');
            sec.className = 'mgr-section';
            const h = document.createElement('h4'); h.className = 'mgr-section-title'; h.textContent = `${title} (${items.length})`;
            sec.appendChild(h);
            if (!items.length) {
              const p = document.createElement('div'); p.className = 'mgr-small'; p.textContent = 'No records';
              sec.appendChild(p);
              return sec;
            }
            const list = document.createElement('div');
            items.forEach(it => {
              const itemWrap = document.createElement('div');
              itemWrap.className = 'mgr-item';
              itemWrap.innerHTML = renderItem(it);
              // admin-only delete button per item
              const amAdmin = (typeof getUserRole === 'function') ? getUserRole() === 'admin' : true;
              if (amAdmin && resourceName) {
                const actions = document.createElement('div');
                actions.className = 'actions';
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-delete delete-record';
                delBtn.textContent = 'Delete';
                delBtn.dataset.resource = resourceName;
                delBtn.dataset.id = it._id || it.id || it._id;
                actions.appendChild(delBtn);
                itemWrap.appendChild(actions);
              }
              list.appendChild(itemWrap);
            });
            sec.appendChild(list);
            return sec;
          }

          // renderers (simple but keep existing structure)
          const renderStudent = s => `<div style="flex:1"><div><strong>${escapeHtml(s.fullname || s.name || '—')}</strong></div><div class="meta">ID: ${escapeHtml(s.numberId||'')} • Phone: ${escapeHtml(s.phone||'')}</div><div class="meta">Class: ${escapeHtml((s.classId && s.classId.name) || s.className || '')}</div></div>`;
          const renderTeacher = t => `<div style="flex:1"><div><strong>${escapeHtml(t.fullname || t.name || '—')}</strong></div><div class="meta">ID: ${escapeHtml(t.numberId||'')} • Phone: ${escapeHtml(t.phone||'')}</div><div class="meta">Subjects: ${(t.subjectIds||[]).map(s=>escapeHtml(s.name||s)).join(', ')}</div></div>`;
          const renderClass = c => `<div style="flex:1"><div><strong>${escapeHtml(c.name||c.title||c.classId||'—')}</strong></div><div class="meta">${escapeHtml(c.description||'')}</div></div>`;
          const renderSubject = s => `<div style="flex:1"><div><strong>${escapeHtml(s.name||'—')}</strong></div><div class="meta">${escapeHtml(s.description||'')}</div></div>`;
          const renderParent = p => `<div style="flex:1"><div><strong>${escapeHtml(p.fullname||'—')}</strong></div><div class="meta">Phone: ${escapeHtml(p.phone||'')} • Child: ${escapeHtml(p.childNumberId||'')}</div></div>`;
          const renderPayment = p => `<div style="flex:1"><div><strong>${escapeHtml(p.type||p.paymentType||'Payment')}</strong></div><div class="meta">Amount: ${escapeHtml(String(p.amount||p.totalAmount||0))} • Status: ${escapeHtml(p.status||'')}</div></div>`;
          const renderVote = v => `<div style="flex:1"><div><strong>${escapeHtml(v.title||'—')}</strong></div><div class="meta">${escapeHtml(v.description||'')}</div></div>`;

          container.innerHTML = '';
          container.appendChild(makeSection('Students', students, renderStudent, 'students'));
          container.appendChild(makeSection('Teachers', teachers, renderTeacher, 'teachers'));
          container.appendChild(makeSection('Classes', classes, renderClass, 'classes'));
          container.appendChild(makeSection('Subjects', subjects, renderSubject, 'subjects'));
          container.appendChild(makeSection('Parents', parents, renderParent, 'parents'));
          container.appendChild(makeSection('Payments', payments, renderPayment, 'payments'));
          container.appendChild(makeSection('Votes', votes, renderVote, 'votes'));

          // attach delete record handlers
          container.querySelectorAll('.delete-record').forEach(btn => btn.addEventListener('click', async (ev) => {
            const resource = btn.dataset.resource;
            const itemId = btn.dataset.id;
            if (!confirm('Delete this ' + resource.replace(/s$/, '') + '?')) return;
            try {
              await apiFetch('/' + resource + '/' + encodeURIComponent(itemId), { method: 'DELETE' });
              btn.closest('.mgr-item')?.remove();
              showToast && showToast('Deleted', 'success');
              // also update badge numbers
              const badgeWrap = wrap.querySelector('#mgr-badges');
              if (badgeWrap) {
                // find badge by text and decrement
                const badgeNodes = Array.from(badgeWrap.children);
                const map = { students:0, teachers:1, payments:2, classes:3, subjects:4, parents:5, votes:6 };
                const idx = map[resource] >= 0 ? map[resource] : -1;
                if (idx !== -1) {
                  const node = badgeNodes[idx];
                  if (node) {
                    const m = node.textContent.match(/(\d+)$/);
                    const cur = m ? parseInt(m[1],10) : 0;
                    node.textContent = node.textContent.replace(/\d+$/, String(Math.max(0, cur - 1)));
                  }
                }
              }
            } catch (err) {
              console.error('delete item failed', err);
              alert('Failed to delete: ' + (err && err.message || 'server error'));
            }
          }));

        } catch (err) {
          console.error('load user data failed', err);
          container.innerHTML = `<div class="mgr-section"><div class="mgr-small">Failed to load user data: ${escapeHtml((err && err.message) || '')}</div></div>`;
        }
      });

    } catch (err) {
      console.error('openViewManager failed', err);
      alert('Failed to open manager view: ' + (err && err.message || 'server error'));
    }
  }
  window.openViewManager = openViewManager;

  /* ---------- openCreateManagerModal (unchanged behavior, improved layout) ---------- */
  function openCreateManagerModal(){
    const form = document.createElement('div');
    form.style.maxWidth = '640px';
    form.innerHTML = `
      <div style="padding:12px">
        <h3 style="margin:0 0 12px">Create Manager</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          <input id="cm-fullname" placeholder="Full name" style="padding:10px;border-radius:8px;border:1px solid #eef2f7"/>
          <input id="cm-email" placeholder="Email" style="padding:10px;border-radius:8px;border:1px solid #eef2f7"/>
          <input id="cm-phone" placeholder="Phone" style="padding:10px;border-radius:8px;border:1px solid #eef2f7"/>
          <input id="cm-password" placeholder="Password" type="password" style="padding:10px;border-radius:8px;border:1px solid #eef2f7"/>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button id="cm-cancel" class="btn btn--outline">Cancel</button>
          <button id="cm-create" class="btn btn-view">Create</button>
        </div>
      </div>
    `;
    const modal = (typeof showModal === 'function') ? showModal(form, { width: '560px' }) : (function fallback(){ document.body.appendChild(form); return { close: ()=>form.remove() }; })();
    form.querySelector('#cm-cancel').addEventListener('click', () => { try { closeModal(); } catch(e){ modal && modal.close && modal.close(); } });
    form.querySelector('#cm-create').addEventListener('click', async () => {
      const fullname = form.querySelector('#cm-fullname').value.trim();
      const email = form.querySelector('#cm-email').value.trim();
      const phone = form.querySelector('#cm-phone').value.trim();
      const password = form.querySelector('#cm-password').value;
      if (!fullname || !password) return alert('Name and password required');
      try {
        await apiFetch('/users', { method: 'POST', body: { fullname, email, phone, role:'manager', password } });
        alert('Manager created');
        try { closeModal(); } catch(e){ modal && modal.close && modal.close(); }
        await loadManagers();
      } catch (err) {
        console.error('Create manager failed', err);
        alert('Failed to create manager: ' + (err && err.message || 'server error'));
      }
    });
  }
  window.openCreateManagerModal = openCreateManagerModal;

  // expose for potential external calls
  window.renderUserManagement = window.renderUserManagement || window.renderUserManagement;
})();
 
