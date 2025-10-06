
<template id="tpl-game">
<section class="page math-game-page" style="padding:12px;max-width:1100px;margin:0 auto;">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
    <h2 style="margin:0">Math Games</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <select id="game-class-filter" class="input" style="max-width:220px">
        <option value="">All classes</option>
      </select>
      <select id="game-period-filter" class="input" style="max-width:160px">
        <option value="all">All-time</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
      </select>
    </div>
  </div>

  <div id="game-root" style="margin-top:12px;display:grid;grid-template-columns: 1fr 360px; gap:12px;">
    <div id="game-left">
      <div id="math-types-list" style="display:grid;gap:10px"></div>
    </div>

    <aside id="game-right" style="width:100%;max-width:360px;">
      <div class="card leaderboard-card" id="leaderboard-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0">Leaderboard</h3>
          <button id="leaderboard-refresh" class="btn btn--outline">Refresh</button>
        </div>
        <div id="leaderboard-body" style="margin-top:8px">Select a math type to view leaderboard</div>
      </div>

      <div class="card" style="margin-top:12px">
        <h4 style="margin:0">Your recent games</h4>
        <div id="my-games" style="margin-top:8px"></div>
      </div>
    </aside>
  </div>
</section>

<!-- Modal root for game UI -->
<div id="math-game-modal-root" aria-hidden="true"></div>

<style>
  /* Hide admin button by default (in case of style-only rendering or no-JS) */
.admin-add-question-btn { display: none; }
/* When body has .is-admin set (set by JS), show it */
body.is-admin .admin-add-question-btn { display: inline-flex; }

  /* minimal game-specific CSS (mobile-first) */
  .math-game-card { display:flex;flex-direction:column;padding:12px;border-radius:12px;background:#fff;box-shadow:0 6px 18px rgba(2,6,23,0.04); }
  .math-type-title { font-weight:700; font-size:16px; display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .math-type-meta { color:#6b7280; font-size:13px; margin-top:6px; }
  .math-actions { display:flex; gap:8px; margin-top:8px; }
  .admin-add-question-btn { display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:8px; border:1px solid #e6e6e6; cursor:pointer; background:#fff; }
  .math-question { padding:16px; border-radius:12px; background:#fff; box-shadow:0 6px 18px rgba(2,6,23,0.04); }
  .countdown-circle { width:72px; height:72px; border-radius:50%; display:flex;align-items:center;justify-content:center;font-weight:700; }
  .answer-btn { display:block; width:100%; padding:12px 10px; border-radius:10px; border:1px solid #e6e6e6; margin-bottom:8px; text-align:left; cursor:pointer; background:#fff; }
  .answer-btn:focus { outline:3px solid rgba(37,99,235,0.12); }
  .leaderboard-row { display:flex;justify-content:space-between;align-items:center;padding:8px;border-radius:8px;margin-bottom:6px; }
  .muted { color:#6b7280; }
  @media (max-width:900px) {
    #game-root { grid-template-columns: 1fr; }
    #game-right { order:2; }
  }
</style>
</template>










async function renderGamePage() {
  if (!document.getElementById('mathgame-inline-styles')) {
    const style = document.createElement('style');
    style.id = 'mathgame-inline-styles';
    style.textContent = `
      /* base toasts / modal / layout */
      .toast{position:fixed;right:16px;bottom:18px;background:#111;color:#fff;padding:10px 12px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.18);z-index:12000;font-weight:600}
      .toast.danger{background:#991b1b}
      .modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:9998;padding:12px;overflow:auto}
      .modal-dialog{background:#fff;border-radius:10px;padding:12px;max-width:760px;width:92%;box-sizing:border-box}
      .modal-dialog.fullscreen{width:96%;max-width:1200px;height:90vh;overflow:auto}
      .math-question{padding:10px 6px;border-radius:8px;background:#fff;margin-bottom:10px}
      .math-game-card{border:1px solid #e6e9ee;padding:14px;border-radius:10px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;background:linear-gradient(180deg,#fff,#fbfdff)}
      .math-actions{display:flex;gap:8px}
      .answer-btn{display:block;margin:6px 0;padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;cursor:pointer}
      .muted{color:#6b7280}
      .math-play-box{max-height:84vh;overflow:auto}
      .attempt-card{padding:12px;border-bottom:1px dashed #eee;background:#fff;border-radius:8px;margin-bottom:8px}
      input.input, textarea.input, select.input{width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;box-sizing:border-box}
      .small-muted{font-size:12px;color:#6b7280}
      .leaderboard-row{padding:8px;border-bottom:1px solid #f1f5f9}
      .feedback-banner{margin-top:8px;padding:8px;border-radius:6px;background:#f8fafc;font-weight:600}
      .feedback-banner.correct{color:green}
      .feedback-banner.wrong{color:#991b1b}
      .lessons-btn{margin-left:8px}
      .levels-btn{display:inline-block;margin-left:6px}
      .leaderboard-header{margin-bottom:8px;font-weight:700}
      .small-action { margin-left:6px; font-size:12px; padding:6px; }
      /* lessons styles */
      .lesson-title { font-size:18px; font-weight:800; margin-bottom:6px; }
      .lesson-subtitle { font-size:13px; color:#374151; margin-bottom:10px; }
      .lesson-content { white-space:pre-wrap; line-height:1.5; margin-bottom:12px; color:#111827 }
      .lesson-examples { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
      .lesson-example-chip { padding:6px 10px; border-radius:999px; background:linear-gradient(90deg,#eef2ff,#f8fafc); border:1px solid #e6f0ff; font-weight:600; font-size:13px; color:#04386b; box-shadow:0 1px 2px rgba(2,6,23,0.04); }
      .lesson-test-q { padding:10px; border-radius:8px; background:#fff; border:1px solid #e6e9ee; margin-bottom:8px; }
      /* folder list */
      .folder-list { display:flex; flex-direction:column; gap:6px; }
      .folder-btn { text-align:left; padding:8px 10px; border-radius:8px; border:1px solid #e6e9ee; background:#fff; cursor:pointer; font-weight:600; color:#0f172a }
      .folder-btn.active { background:#eef2ff; border-color:#c7e0ff; font-weight:800; box-shadow:inset 0 -2px 0 rgba(37,99,235,0.06) }
      .lesson-title-list { display:flex; gap:8px; overflow:auto; padding-bottom:8px; margin-bottom:8px; }
      .lesson-title-btn { white-space:nowrap; padding:8px 12px; border-radius:999px; border:1px solid #e6e9ee; background:#fff; cursor:pointer; font-weight:700; }
      .lesson-title-btn.active { background:#2563eb; color:#fff; border-color:#2563eb; }
      /* full page layout */
      #tpl-game { display:flex; gap:16px; align-items:flex-start; }
      #left-column { flex: 1 1 640px; min-width:0; }
      #right-column { width: 360px; flex: 0 0 360px; }
      .math-types-grid { display:grid; grid-template-columns: 1fr; gap:10px; }
      @media(min-width:980px) { .math-types-grid { grid-template-columns: 1fr 1fr; } }
      .page-title { font-size:20px; font-weight:800; margin-bottom:12px; color:#0f172a }
      .muted-block { padding:10px;border-radius:8px;background:#fbfdff;border:1px solid #eef2ff }
      /* responsive adjustments */
      @media(max-width:900px) {
        #tpl-game { flex-direction:column; }
        #right-column { width:100%; flex: 1 1 auto; }
        .math-game-card { flex-direction:column; gap:8px; }
        .math-actions { width:100%; justify-content:space-between; }
        .modal-dialog { width: 98%; padding:12px; }
        .modal { padding:10px; }
      }
      @media (max-width:520px) {
        .lesson-example-chip { font-size:12px; padding:6px 8px; }
        .folder-btn { padding:8px; font-size:14px }
        .lesson-title-btn { padding:6px 10px; font-size:13px }
      }
      .correct-mark { background: #ecfdf5; border-color:#bbf7d0; }
      .wrong-mark { background: #fff1f2; border-color:#fecaca; }
    `;
    document.head.appendChild(style);
  }

  // root and template
  app.innerHTML = '';
  const node = tpl('tpl-game');
  app.appendChild(node);

  const mathTypesList = document.getElementById('math-types-list');
  const leaderboardBody = document.getElementById('leaderboard-body');
  const myGamesWrap = document.getElementById('my-games');
  const leaderboardRefresh = document.getElementById('leaderboard-refresh');
  const periodFilter = document.getElementById('game-period-filter');
  const leaderboardHeaderWrap = document.getElementById('leaderboard-header') || null;

  const curUser = await getCurrentUser().catch(()=>null);
  if (!curUser) { navigate('login'); return; }

  if (curUser && (curUser.role || '').toLowerCase() === 'admin') document.body.classList.add('is-admin'); else document.body.classList.remove('is-admin');
  function isAdmin(){ return ((curUser.role||'').toLowerCase()) === 'admin'; }

  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'danger' ? ' danger' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  const mathTypesById = {};

  // Lessons button visible to EVERY user; admin-only controls hidden inside modal
  (function addLessonsButton() {
    const topWrap = mathTypesList.parentNode;
    if (!topWrap) return;
    if (!topWrap.querySelector('.lessons-btn')) {
      const b = document.createElement('button');
      b.className = 'btn lessons-btn';
      b.textContent = 'Lessons';
      b.style.marginBottom = '10px';
      b.addEventListener('click', openLessonsModal);
      topWrap.insertBefore(b, mathTypesList);
    }
  })();

  // Lessons modal - persisted lessons from backend; admin get add/edit/delete and test creation; non-admin can view + take tests


  async function openLessonsModal() {
    const m = document.createElement('div'); m.className = 'modal';
    const dlg = document.createElement('div'); dlg.className = 'modal-dialog fullscreen';
    dlg.style.maxWidth = '1100px';
    dlg.style.display = 'flex';
    dlg.style.flexDirection = 'column';
    dlg.style.padding = '16px';
    dlg.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;flex-direction:column">
          <div class="page-title">Lessons</div>
          <div class="small-muted">Learning resources and worked examples. Admins can manage lessons here.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${isAdmin() ? '<button id="add-lesson-btn" class="btn">Add Lesson</button>' : ''}
          ${isAdmin() ? '<button id="add-folder-btn" class="btn btn--outline">Add Folder</button>' : ''}
          <button id="close-lessons" class="btn btn--outline">Close</button>
        </div>
      </div>
      <hr />
      <div id="lessons-main" style="display:flex;gap:12px;align-items:stretch"></div>
    `;
    m.appendChild(dlg);
    document.body.appendChild(m);
  
    const main = dlg.querySelector('#lessons-main');
    const leftCol = document.createElement('div'); leftCol.style.flex = '0 0 260px'; leftCol.style.overflowY = 'auto';
    const rightCol = document.createElement('div'); rightCol.style.flex = '1'; rightCol.style.overflowY = 'auto'; rightCol.style.paddingLeft = '8px';
    leftCol.className = 'muted-block';
    rightCol.className = 'muted-block';
    main.appendChild(leftCol); main.appendChild(rightCol);
  
    const closeBtn = dlg.querySelector('#close-lessons');
    closeBtn.addEventListener('click', ()=> m.remove());
  
    const addFolderBtn = dlg.querySelector('#add-folder-btn');
    // We'll keep "currentOpenFolder" and "currentFocusedLessonId" in closure so reloads can preserve state
    let currentFolders = {}; // { folderName: [lessons] }
    let currentOpenFolder = null;
    let currentFocusedLessonId = null;
  
    if (addFolderBtn && isAdmin()) {
      addFolderBtn.addEventListener('click', async () => {
        const name = prompt('Folder name (e.g. Basic Math, Algebra):');
        if (!name || !name.trim()) return;
        try {
          const payload = { title: `Folder: ${name.trim()}`, subtitle: '', content: '', examples: [], tests: [], folder: name.trim() };
          const r = await apiFetch('/math-game/lessons', { method: 'POST', body: payload }).catch(()=>null);
          if (!r || !r.ok) throw new Error('Create failed');
          showToast('Folder created');
          // set current open folder to the new folder and reload, no focused lesson
          currentOpenFolder = name.trim();
          currentFocusedLessonId = null;
          await loadLessons();
        } catch (err) {
          console.error('create folder', err);
          showToast('Create folder failed','danger');
        }
      });
    }
  
    // load lessons; optional focusLessonId will cause that lesson to be selected / shown after loading
    async function loadLessons(focusLessonId = null) {
      leftCol.innerHTML = '<div class="muted">Loading lessons…</div>';
      rightCol.innerHTML = '<div class="small-muted">Select a lesson to view</div>';
      try {
        const r = await apiFetch('/math-game/lessons').catch(()=>null);
        const items = (r && r.lessons) ? r.lessons : [];
        // group by folder (fallback to Uncategorized)
        const folders = {};
        (items || []).forEach(ls => {
          const f = (ls.folder && String(ls.folder).trim()) ? String(ls.folder).trim() : 'Uncategorized';
          if (!folders[f]) folders[f] = [];
          folders[f].push(ls);
        });
        currentFolders = folders;
  
        leftCol.innerHTML = '';
        const folderList = document.createElement('div'); folderList.className = 'folder-list';
        const sortedFolders = Object.keys(folders).sort((a,b)=> a.localeCompare(b));
  
        // ensure currentOpenFolder is valid, otherwise default to first
        if (!currentOpenFolder || !folders[currentOpenFolder]) {
          currentOpenFolder = sortedFolders[0] || null;
        }
  
        sortedFolders.forEach((folderName, fi) => {
          const btn = document.createElement('button');
          btn.className = 'folder-btn' + (folderName === currentOpenFolder ? ' active' : '');
          btn.textContent = folderName + ` (${folders[folderName].length})`;
          btn.addEventListener('click', () => {
            // toggle active class
            Array.from(folderList.querySelectorAll('.folder-btn')).forEach(x => x.classList.remove('active'));
            btn.classList.add('active');
            currentOpenFolder = folderName;
            currentFocusedLessonId = null; // reset focused lesson when user switches folder
            renderFolderContents(folderName, folders[folderName]);
          });
          folderList.appendChild(btn);
        });
  
        leftCol.appendChild(folderList);
  
        // default show currentOpenFolder or first
        if (currentOpenFolder) {
          renderFolderContents(currentOpenFolder, folders[currentOpenFolder] || [], focusLessonId || null);
        } else {
          rightCol.innerHTML = '<div class="muted">No lessons found</div>';
        }
      } catch (err) {
        console.error('loadLessons', err);
        leftCol.innerHTML = '<div class="muted">Failed to load lessons</div>';
      }
    }
  
    // render a folder: header + persistent title strip + (NO cards list) + details pane
    // optional focusLessonId will try to show that lesson's details after rendering list
    function renderFolderContents(folderName, list, focusLessonId = null) {
      // build a stable layout (titleStrip + details) so details rendering won't remove the strip
      rightCol.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="flex:1">
            <div class="page-title">${escapeHtml(folderName)}</div>
            <div class="small-muted">${list.length} lesson(s)</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${isAdmin() ? '<button id="add-lesson-in-folder" class="btn btn--outline">Add Lesson</button>' : ''}
            <button id="close-folder-btn" class="btn btn--outline small-action">Close Folder</button>
          </div>
        </div>
        <hr />
        <div id="folder-title-strip" class="lesson-title-list" style="margin-bottom:12px;"></div>
        <div id="lesson-details" style="margin-top:12px"></div>
      `;
  
      const addInBtn = rightCol.querySelector('#add-lesson-in-folder');
      const closeFolderBtn = rightCol.querySelector('#close-folder-btn');
      if (addInBtn && isAdmin()) {
        addInBtn.addEventListener('click', () => openLessonEditor({ folder: folderName }));
      }
      if (closeFolderBtn) {
        closeFolderBtn.addEventListener('click', () => {
          // clear active states and show top-level prompt
          const folderButtons = leftCol.querySelectorAll('.folder-btn');
          folderButtons.forEach(b => b.classList.remove('active'));
          currentOpenFolder = null;
          currentFocusedLessonId = null;
          rightCol.innerHTML = '<div class="small-muted">Select a folder from the left to view its lessons.</div>';
        });
      }
  
      const titleStrip = rightCol.querySelector('#folder-title-strip');
      const detailsPane = rightCol.querySelector('#lesson-details');
  
      // Build title-strip buttons (persisted area)
      titleStrip.innerHTML = '';
      list.forEach((ls, idx) => {
        const tbtn = document.createElement('button');
        tbtn.className = 'lesson-title-btn' + ((String(ls._id) === String(focusLessonId) || (idx === 0 && !focusLessonId && !currentFocusedLessonId)) ? ' active' : '');
        tbtn.textContent = ls.title || `Lesson ${idx+1}`;
        tbtn.addEventListener('click', () => {
          // set active class visually
          Array.from(titleStrip.querySelectorAll('.lesson-title-btn')).forEach(x => x.classList.remove('active'));
          tbtn.classList.add('active');
          currentFocusedLessonId = ls._id;
          renderLessonDetailInRight(ls, detailsPane);
        });
        titleStrip.appendChild(tbtn);
      });
  
      // If list empty show placeholder
      if (!list.length) {
        detailsPane.innerHTML = '<div class="muted">No lessons in this folder</div>';
        return;
      }
  
      // Decide which lesson to show in details: priority -> focusLessonId -> currentFocusedLessonId -> first
      let toShow = null;
      if (focusLessonId) {
        toShow = list.find(x => String(x._id) === String(focusLessonId)) || null;
      }
      if (!toShow && currentFocusedLessonId) {
        toShow = list.find(x => String(x._id) === String(currentFocusedLessonId)) || null;
      }
      if (!toShow) toShow = list[0];
  
      // mark title-strip accordingly
      Array.from(titleStrip.querySelectorAll('.lesson-title-btn')).forEach(btn => {
        if (btn.textContent === (toShow && toShow.title)) btn.classList.add('active'); else btn.classList.remove('active');
      });
  
      currentFocusedLessonId = toShow ? String(toShow._id) : null;
      // render details into details pane (won't remove titleStrip)
      renderLessonDetailInRight(toShow, detailsPane);
    }
  
    // renderLessonDetailInRight, openLessonEditor, openLessonTestModal etc. remain unchanged (use your existing implementations)
    // attach add button handler (only for admin)
    // Accept a container param where to render (so we don't overwrite the whole rightCol)
    function renderLessonDetailInRight(ls, container) {
      if (!container) container = rightCol.querySelector('#lesson-details') || rightCol;
      if (!ls) { container.innerHTML = '<div class="muted">No lesson selected</div>'; return; }
  
      // render detail with examples as chips
      const examplesHtml = (Array.isArray(ls.examples) && ls.examples.length)
        ? `<div class="lesson-examples">${ls.examples.map((ex,i) => `<div class="lesson-example-chip">${escapeHtml(typeof ex === 'object' ? (ex.text||JSON.stringify(ex)) : ex)}</div>`).join('')}</div>`
        : '';
      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1">
            <div class="lesson-title">${escapeHtml(ls.title || '')}</div>
            <div class="lesson-subtitle">${escapeHtml(ls.subtitle || '')}</div>
            <div class="small-muted">Folder: ${escapeHtml(ls.folder || 'Uncategorized')}</div>
          </div>
          <div style="text-align:right">
            ${isAdmin() ? `<button class="btn btn--outline" data-edit="${escapeHtml(ls._id)}">Edit</button><button class="btn" data-del="${escapeHtml(ls._id)}">Delete</button>` : ''}
            ${Array.isArray(ls.tests) && ls.tests.length ? `<button class="btn btn--outline" id="lesson-test-${escapeHtml(ls._id)}">Test</button>` : ''}
          </div>
        </div>
        <hr />
        <div class="lesson-content">${escapeHtml(ls.content || '')}</div>
        ${examplesHtml}
      `;
      if (isAdmin()) {
        const editBtn = container.querySelector('button[data-edit]');
        const delBtn = container.querySelector('button[data-del]');
        if (editBtn) editBtn.addEventListener('click', ()=> openLessonEditor(ls));
        if (delBtn) delBtn.addEventListener('click', async ()=> {
          if (!confirm('Delete this lesson?')) return;
          try {
            const rr = await apiFetch(`/math-game/lessons/${ls._id}`, { method: 'DELETE' }).catch(()=>null);
            if (!rr || !rr.ok) throw new Error('Delete failed');
            showToast('Lesson deleted');
            // keep folder open and reload lessons
            await loadLessons();
          } catch (err) { console.error('delete lesson', err); showToast('Delete failed','danger'); }
        });
      }
      // test button
      const testBtn = container.querySelector(`#lesson-test-${escapeHtml(ls._id)}`);
      if (testBtn) {
        if (Array.isArray(ls.tests) && ls.tests.length) {
          testBtn.style.display = '';
          testBtn.addEventListener('click', ()=> openLessonTestModal(ls));
        } else {
          testBtn.style.display = 'none';
        }
      }
    }
  
    // admin add/edit lesson editor - when creating, will default folder to currentOpenFolder and after save will focus the new lesson
    function openLessonEditor(ls = {}) {
      const mm = document.createElement('div'); mm.className = 'modal';
      const dlg2 = document.createElement('div'); dlg2.className = 'modal-dialog';
      dlg2.style.maxWidth = '920px';
      dlg2.innerHTML = `<h3 style="margin-top:0">${ls && ls._id ? 'Edit Lesson' : 'Add Lesson'}</h3>`;
      const f = document.createElement('div'); f.style.display='grid'; f.style.gap='8px';
      const title = document.createElement('input'); title.className='input'; title.placeholder='Title'; title.value = ls.title || '';
      const subtitle = document.createElement('input'); subtitle.className='input'; subtitle.placeholder='Subtitle (optional)'; subtitle.value = ls.subtitle || '';
      const folderInput = document.createElement('input'); folderInput.className='input'; folderInput.placeholder = 'Folder (e.g. Basic Math)'; 
      // If ls includes folder use it; otherwise if the modal is opened from a folder, use that folder
      folderInput.value = ls.folder || (currentOpenFolder || '');
      const content = document.createElement('textarea'); content.className='input'; content.placeholder='Content (HTML allowed)'; content.value = ls.content || '';
      const examples = document.createElement('textarea'); examples.className='input'; examples.placeholder='Examples (one per line)'; examples.value = Array.isArray(ls.examples) ? ls.examples.join('\n') : '';
      // tests builder
      const testsWrap = document.createElement('div'); testsWrap.style.display='grid'; testsWrap.style.gap='8px';
      testsWrap.innerHTML = `<div style="font-weight:700">Tests (interactive quiz inside lesson)</div>`;
      const testsList = document.createElement('div'); testsList.style.display='grid'; testsList.style.gap='6px';
      const addTestBtn = document.createElement('button'); addTestBtn.className = 'btn btn--outline'; addTestBtn.type='button'; addTestBtn.textContent = '+ Add Test Question';
      testsWrap.appendChild(testsList); testsWrap.appendChild(addTestBtn);
  
      const existingTests = Array.isArray(ls.tests) ? ls.tests.map(t => ({ question: t.question || '', options: Array.isArray(t.options) ? t.options.slice() : [], correctIndex: Number(t.correctIndex || 0) })) : [];
      function renderTestsEditor() {
        testsList.innerHTML = '';
        existingTests.forEach((tq, idx) => {
          const qWrap = document.createElement('div'); qWrap.style.border = '1px solid #eef2ff'; qWrap.style.padding = '8px'; qWrap.style.borderRadius='8px';
          qWrap.innerHTML = `<div style="font-weight:700">Q${idx+1}</div>`;
          const qInp = document.createElement('textarea'); qInp.className='input'; qInp.value = tq.question || '';
          const optsWrap = document.createElement('div'); optsWrap.style.display='grid'; optsWrap.style.gap='6px';
          (Array.isArray(tq.options) ? tq.options : []).forEach((op, oi) => {
            const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px';
            const radio = document.createElement('input'); radio.type='radio'; radio.name = `correct-${idx}`; radio.value = String(oi);
            if (Number(tq.correctIndex || 0) === oi) radio.checked = true;
            const oiInput = document.createElement('input'); oiInput.className='input'; oiInput.value = op || '';
            oiInput.type = 'text';
            const rem = document.createElement('button'); rem.className='btn btn--outline small-action'; rem.type='button'; rem.textContent='Remove';
            rem.addEventListener('click', ()=> {
              const indexToRemove = Array.from(optsWrap.children).indexOf(row);
              if (indexToRemove >= 0) {
                existingTests[idx].options.splice(indexToRemove, 1);
                if (Number(existingTests[idx].correctIndex || 0) === indexToRemove) existingTests[idx].correctIndex = 0;
                renderTestsEditor();
              }
            });
            row.appendChild(radio); row.appendChild(oiInput); row.appendChild(rem);
            optsWrap.appendChild(row);
  
            oiInput.addEventListener('input', () => {
              existingTests[idx].options[oi] = oiInput.value;
            });
            radio.addEventListener('change', () => {
              if (radio.checked) existingTests[idx].correctIndex = Number(radio.value || 0);
            });
          });
          const addOptBtn = document.createElement('button'); addOptBtn.className='btn btn--outline'; addOptBtn.type='button'; addOptBtn.textContent = '+ option';
          addOptBtn.addEventListener('click', ()=> {
            existingTests[idx].options.push('');
            renderTestsEditor();
          });
  
          const removeQBtn = document.createElement('button'); removeQBtn.className='btn'; removeQBtn.textContent='Remove Question';
          removeQBtn.addEventListener('click', ()=> {
            if (!confirm('Remove this test question?')) return;
            existingTests.splice(idx,1);
            renderTestsEditor();
          });
  
          qWrap.appendChild(createRowLabel('Question')); qWrap.appendChild(qInp);
          qWrap.appendChild(createRowLabel('Options (select correct with radio)')); qWrap.appendChild(optsWrap); qWrap.appendChild(addOptBtn);
          qWrap.appendChild(removeQBtn);
          testsList.appendChild(qWrap);
  
          qInp.addEventListener('input', () => { existingTests[idx].question = qInp.value; });
  
          qWrap._getState = () => {
            const options = Array.from(optsWrap.querySelectorAll('input[type="text"], input.input')).map(i => i.value || '');
            const sel = optsWrap.querySelector(`input[type="radio"]:checked`);
            let corr = 0;
            if (sel) corr = Number(sel.value || 0);
            return { question: qInp.value || '', options, correctIndex: corr };
          };
        });
      }
      renderTestsEditor();
      addTestBtn.addEventListener('click', ()=> {
        existingTests.push({ question: '', options: ['', ''], correctIndex: 0 });
        renderTestsEditor();
      });
  
      const save = document.createElement('button'); save.className='btn'; save.textContent='Save';
      const cancel = document.createElement('button'); cancel.className='btn btn--outline'; cancel.textContent='Cancel';
      f.appendChild(createRowLabel('Title')); f.appendChild(title);
      f.appendChild(createRowLabel('Subtitle')); f.appendChild(subtitle);
      f.appendChild(createRowLabel('Folder')); f.appendChild(folderInput);
      f.appendChild(createRowLabel('Content (HTML allowed)')); f.appendChild(content);
      f.appendChild(createRowLabel('Examples (one per line)')); f.appendChild(examples);
      f.appendChild(testsWrap);
      const act = document.createElement('div'); act.style.display='flex'; act.style.justifyContent='flex-end'; act.style.gap='8px';
      act.appendChild(cancel); act.appendChild(save);
      f.appendChild(act);
      dlg2.appendChild(f); mm.appendChild(dlg2); document.body.appendChild(mm);
      cancel.addEventListener('click', ()=> mm.remove());
      save.addEventListener('click', async ()=> {
        try {
          if (!title.value.trim()) return alert('Title required');
          // gather tests state
          const payloadTests = [];
          Array.from(testsList.children).forEach((child, idx) => {
            if (child && typeof child._getState === 'function') {
              const st = child._getState();
              payloadTests.push({ question: String(st.question || ''), options: Array.isArray(st.options) ? st.options.map(String) : [], correctIndex: Number(st.correctIndex || 0) });
            } else if (existingTests[idx]) {
              payloadTests.push({ question: String(existingTests[idx].question || ''), options: Array.isArray(existingTests[idx].options) ? existingTests[idx].options.map(String) : [], correctIndex: Number(existingTests[idx].correctIndex || 0) });
            }
          });
  
          const payload = {
            title: title.value.trim(),
            subtitle: subtitle.value || '',
            content: content.value || '',
            examples: (examples.value || '').split('\n').map(x => x.trim()).filter(Boolean),
            tests: payloadTests,
            folder: folderInput.value ? String(folderInput.value).trim() : 'Uncategorized'
          };
          if (ls && ls._id) {
            const r = await apiFetch(`/math-game/lessons/${ls._id}`, { method: 'PUT', body: payload }).catch(()=>null);
            if (!r || !r.ok) throw new Error('Save failed');
            showToast('Lesson updated');
            // preserve current folder and focused lesson
            currentOpenFolder = payload.folder || currentOpenFolder;
            currentFocusedLessonId = ls._id;
            mm.remove();
            await loadLessons(currentFocusedLessonId);
          } else {
            const r = await apiFetch('/math-game/lessons', { method: 'POST', body: payload }).catch(()=>null);
            if (!r || !r.ok) throw new Error('Save failed');
            showToast('Lesson created');
            // after creation: keep folder open and focus newly created lesson if server returns it
            currentOpenFolder = payload.folder || currentOpenFolder;
            // try to focus created lesson by id if returned; otherwise reload and focus by title fallback
            const createdId = (r.lesson && r.lesson._id) ? r.lesson._id : null;
            mm.remove();
            if (createdId) {
              await loadLessons(createdId);
            } else {
              // fallback: reload and focus by matching title
              await loadLessons();
            }
          }
        } catch (err) { console.error('create/update lesson', err); showToast('Save failed','danger'); }
      });
    }
  
  
    function openLessonTestModal(ls) {
      const tests = Array.isArray(ls.tests) ? ls.tests.map(t => ({ question: t.question || '', options: Array.isArray(t.options) ? t.options.slice() : [], correctIndex: Number(t.correctIndex || 0) })) : [];
      if (!tests.length) { showToast('No tests available for this lesson'); return; }
      let current = 0;
      let correctCount = 0;
      let answeredCount = 0;
      const answeredSet = new Set();
      const mtest = document.createElement('div'); mtest.className='modal';
      const dlgt = document.createElement('div'); dlgt.className='modal-dialog';
      dlgt.style.maxWidth = '720px';
      dlgt.innerHTML = `<h3 style="margin-top:0">${escapeHtml(ls.title || '')} — Self-test</h3>`;
      const body = document.createElement('div'); body.style.display='grid'; body.style.gap='12px';
      dlgt.appendChild(body);
      const controls = document.createElement('div'); controls.style.display='flex'; controls.style.justifyContent='space-between'; controls.style.gap='8px'; controls.style.marginTop='8px';
      const prevBtn = document.createElement('button'); prevBtn.className = 'btn btn--outline'; prevBtn.textContent = 'Previous'; prevBtn.disabled = true;
      const nextBtn = document.createElement('button'); nextBtn.className = 'btn'; nextBtn.textContent = 'Next';
      const close = document.createElement('button'); close.className = 'btn btn--outline'; close.textContent = 'Close';
      controls.appendChild(prevBtn); controls.appendChild(nextBtn); controls.appendChild(close);
      dlgt.appendChild(controls);
      mtest.appendChild(dlgt);
      document.body.appendChild(mtest);
  
      close.addEventListener('click', ()=> mtest.remove());
  
      let transientTimeout = null;
      function showTransient(msg, ok = true) {
        const banner = document.createElement('div');
        banner.className = 'feedback-banner ' + (ok ? 'correct' : 'wrong');
        banner.textContent = msg;
        banner.style.position = 'relative';
        banner.style.zIndex = '1';
        dlgt.insertBefore(banner, dlgt.firstChild.nextSibling);
        if (transientTimeout) clearTimeout(transientTimeout);
        transientTimeout = setTimeout(()=> { try { banner.remove(); } catch(e) {} }, 2400);
      }
  
      function renderTestIndex(i) {
        body.innerHTML = '';
        const t = tests[i];
        const qWrap = document.createElement('div'); qWrap.className='lesson-test-q';
        qWrap.innerHTML = `<div style="font-weight:700">${escapeHtml(t.question || '')}</div>`;
        const optsWrap = document.createElement('div'); optsWrap.style.marginTop='8px'; optsWrap.style.display='grid'; optsWrap.style.gap='8px';
        (Array.isArray(t.options) ? t.options : []).forEach((op, oi) => {
          const btn = document.createElement('button'); btn.className='btn btn--outline'; btn.style.textAlign='left'; btn.textContent = String(op || '');
          if (answeredSet.has(String(i))) {
            const wasCorrect = (t._userSelectedIndex === t.correctIndex);
            btn.disabled = true;
            if (oi === t.correctIndex) btn.classList.add('correct-mark');
            if (typeof t._userSelectedIndex !== 'undefined' && oi === t._userSelectedIndex && !wasCorrect) btn.classList.add('wrong-mark');
          }
          btn.addEventListener('click', ()=> {
            if (answeredSet.has(String(i))) return;
            Array.from(optsWrap.querySelectorAll('button')).forEach(bb => bb.disabled = true);
            const selectedIndex = oi;
            t._userSelectedIndex = selectedIndex;
            answeredSet.add(String(i));
            answeredCount++;
            if (selectedIndex === Number(t.correctIndex || 0)) {
              correctCount++;
              btn.classList.add('correct-mark');
              showTransient('Correct!', true);
            } else {
              btn.classList.add('wrong-mark');
              const corrBtn = optsWrap.querySelectorAll('button')[Number(t.correctIndex || 0)];
              if (corrBtn) corrBtn.classList.add('correct-mark');
              showTransient(`Incorrect — correct: ${String(t.options[t.correctIndex] || '')}`, false);
            }
            const fb = document.createElement('div'); fb.className='small-muted'; fb.style.marginTop='8px';
            fb.innerHTML = `Answered: ${answeredCount}/${tests.length} • Correct: ${correctCount}`;
            qWrap.appendChild(fb);
            nextBtn.disabled = false;
          });
          optsWrap.appendChild(btn);
        });
        qWrap.appendChild(optsWrap);
        body.appendChild(qWrap);
  
        prevBtn.disabled = (i === 0);
        nextBtn.textContent = (i === tests.length - 1) ? 'Finish' : 'Next';
        if (!answeredSet.has(String(i))) nextBtn.disabled = true;
      }
  
      prevBtn.addEventListener('click', () => {
        if (current <= 0) return;
        current--;
        renderTestIndex(current);
      });
  
      nextBtn.addEventListener('click', () => {
        if (current === tests.length - 1) {
          const summary = document.createElement('div'); summary.style.display='grid'; summary.style.gap='8px';
          summary.innerHTML = `<div style="font-weight:800;font-size:18px">Summary</div>
                               <div class="small-muted">Total Questions: ${tests.length}</div>
                               <div class="small-muted">Answered: ${answeredCount}</div>
                               <div class="small-muted">Correct: ${correctCount}</div>
                               <div class="small-muted">Incorrect: ${answeredCount - correctCount}</div>`;
          const ok = document.createElement('button'); ok.className='btn'; ok.textContent='Close';
          const retry = document.createElement('button'); retry.className='btn btn--outline'; retry.textContent='Retry';
          const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px';
          actions.appendChild(retry); actions.appendChild(ok);
          const dlgSumm = document.createElement('div'); dlgSumm.className='modal';
          const inner = document.createElement('div'); inner.className='modal-dialog';
          inner.appendChild(summary); inner.appendChild(actions); dlgSumm.appendChild(inner);
          document.body.appendChild(dlgSumm);
          ok.addEventListener('click', ()=> { dlgSumm.remove(); mtest.remove(); });
          retry.addEventListener('click', ()=> {
            dlgSumm.remove();
            answeredSet.clear(); correctCount = 0; answeredCount = 0;
            tests.forEach(t => { delete t._userSelectedIndex; });
            current = 0;
            renderTestIndex(0);
          });
        } else {
          current++;
          renderTestIndex(current);
        }
      });
  
      renderTestIndex(0);
    }
  
    const addBtn = dlg.querySelector('#add-lesson-btn');
    if (addBtn && isAdmin()) addBtn.addEventListener('click', () => openLessonEditor({ folder: currentOpenFolder || '' }));
  
    // initial load
    await loadLessons();
  }
  

  // small helpers
  function createRowLabel(text) { const lbl = document.createElement('div'); lbl.className='muted'; lbl.textContent = text; return lbl; }

  function ensureSearchBar() {
    if (document.getElementById('math-search')) return;
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.justifyContent = 'space-between';
    wrap.style.alignItems = 'center';
    wrap.style.marginBottom = '10px';
    const left = document.createElement('div'); left.style.flex = '1';
    const input = document.createElement('input'); input.id = 'math-search'; input.placeholder = 'Search games by name...'; input.className = 'input'; input.style.maxWidth = '420px';
    left.appendChild(input); wrap.appendChild(left);
    mathTypesList.parentNode.insertBefore(wrap, mathTypesList);
    input.addEventListener('input', () => {
      const q = (input.value || '').trim().toLowerCase();
      Array.from(document.querySelectorAll('#math-types-list .math-game-card')).forEach(card => {
        const title = (card.dataset.title || '').toLowerCase();
        card.style.display = title.includes(q) ? '' : 'none';
      });
    });
  }

  // Load math types and render cards (View is admin-only)
  async function loadMathTypes() {
    ensureSearchBar();
    mathTypesList.innerHTML = '<div class="muted">Loading types…</div>';
    try {
      const res = await apiFetch('/math-game/types');
      const types = (res && res.mathTypes) ? res.mathTypes : [];
      mathTypesList.innerHTML = '';
      if (!types.length) { mathTypesList.innerHTML = '<div class="muted">No math types</div>'; return; }
      types.forEach(t => { mathTypesById[String(t._id || t.id || '')] = t; });
      for (const t of types) {
        const card = document.createElement('div'); card.className = 'math-game-card';
        const classLevelText = (t.classLevel && Array.isArray(t.classLevel)) ? t.classLevel.join(', ') : (t.classLevel || '');
        const titleHtml = `<div style="display:flex;flex-direction:column;gap:6px">
            <div><strong>${escapeHtml(t.title)}</strong></div>
            <div class="small-muted">${escapeHtml(classLevelText)}</div>
            <div class="muted" style="margin-top:6px">${escapeHtml(t.description || '')}</div>
          </div>`;
        const canonicalId = t._id || t.id || t.slug || '';
        card.dataset.mathTypeId = canonicalId;
        card.dataset.title = (t.title || '');
        // selected difficulty default = easy
        card.dataset.selectedDifficulty = 'easy';
        card.innerHTML = titleHtml;

        const actions = document.createElement('div'); actions.className = 'math-actions';
        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.flexDirection = 'column';
        btnWrap.style.gap = '8px';

        // Top row: Play + Level selector
        const topRow = document.createElement('div'); topRow.style.display='flex'; topRow.style.gap='8px'; topRow.style.alignItems='center';

        const playBtn = document.createElement('button'); playBtn.className='btn'; playBtn.textContent = 'Play';
        playBtn.addEventListener('click', async () => {
          const difficulty = card.dataset.selectedDifficulty || 'easy';
          await startGameDirect(t, difficulty, 10);
        });
        topRow.appendChild(playBtn);

        const levelsBtn = document.createElement('button'); levelsBtn.className='btn btn--outline levels-btn'; levelsBtn.textContent = 'Level: Easy';
        levelsBtn.addEventListener('click', ()=> openLevelsPicker(card, levelsBtn));
        topRow.appendChild(levelsBtn);

        // Only admin sees the card-level View of questions (not shown to others)
        if (isAdmin()) {
          const viewBtn = document.createElement('button'); viewBtn.className='btn btn--outline'; viewBtn.textContent = 'View';
          viewBtn.title = 'View questions';
          viewBtn.addEventListener('click', ()=> openTypeQuestions(t));
          topRow.appendChild(viewBtn);
        }

        btnWrap.appendChild(topRow);

        // leaderboard row
        const lbRow = document.createElement('div'); lbRow.style.display='flex'; lbRow.style.gap='8px';
        const lbBtn = document.createElement('button'); lbBtn.className='btn btn--outline'; lbBtn.textContent='Leaderboard';
        lbBtn.addEventListener('click', ()=> {
          if (!canonicalId) return alert('Invalid math type id');
          const diff = (card.dataset.selectedDifficulty === 'all' || !card.dataset.selectedDifficulty) ? null : card.dataset.selectedDifficulty;
          loadLeaderboardFor(canonicalId, 10, diff);
        });
        lbRow.appendChild(lbBtn);

        const lbLevels = document.createElement('select'); lbLevels.className='input'; lbLevels.style.maxWidth='140px';
        lbLevels.innerHTML = `<option value="">All levels</option><option value="easy">Easy</option><option value="intermediate">Intermediate</option><option value="hard">Hard</option><option value="extra_hard">Extra hard</option><option value="no_way">No way</option>`;
        lbLevels.addEventListener('change', ()=> {
          const sel = lbLevels.value || null;
          loadLeaderboardFor(canonicalId, 10, sel);
        });
        lbRow.appendChild(lbLevels);
        btnWrap.appendChild(lbRow);

        // admin extras: add question, edit type, delete type
        if (isAdmin()) {
          const adminRow = document.createElement('div'); adminRow.style.display='flex'; adminRow.style.gap='8px';
          const addQ = document.createElement('button'); addQ.className='admin-add-question-btn'; addQ.textContent='Add Question';
          addQ.addEventListener('click', ()=> openAddQuestionModal(t));
          adminRow.appendChild(addQ);

          const editType = document.createElement('button'); editType.className='btn btn--outline small-action'; editType.textContent='Edit Title';
          editType.addEventListener('click', ()=> openEditTypeModal(t));
          adminRow.appendChild(editType);

          const deleteType = document.createElement('button'); deleteType.className='btn small-action'; deleteType.textContent='Delete';
          deleteType.addEventListener('click', async ()=> {
            if (!confirm('Delete this math type? (this will not delete questions automatically)')) return;
            try {
              await apiFetch(`/math-game/types/${canonicalId}`, { method: 'DELETE' }).catch(()=>null);
              showToast('Deleted (if server endpoint exists)');
              await loadMathTypes();
            } catch (err) { console.error(err); showToast('Delete failed','danger'); }
          });
          adminRow.appendChild(deleteType);

          btnWrap.appendChild(adminRow);
        }

        actions.appendChild(btnWrap);
        card.appendChild(actions);
        mathTypesList.appendChild(card);
      }
    } catch (err) {
      console.error('loadMathTypes', err);
      mathTypesList.innerHTML = '<div class="muted">Failed to load types</div>';
    }
  }

  // Open level picker (updates card.dataset.selectedDifficulty and label)
  function openLevelsPicker(card, labelBtn) {
    const modal = document.createElement('div'); modal.className='modal';
    const dlg = document.createElement('div'); dlg.className='modal-dialog';
    dlg.style.maxWidth = '320px';
    dlg.innerHTML = `<h4 style="margin:0 0 8px 0">Select Level</h4>`;
    const list = ['all','easy','intermediate','hard','extra_hard','no_way'];
    list.forEach(l => {
      const b = document.createElement('button'); b.className='btn btn--outline'; b.style.display='block'; b.style.width='100%'; b.style.marginTop='6px';
      const pretty = (l === 'all') ? 'All (Mixed)' : l.replace('_',' ').replace(/\b\w/g, ch => ch.toUpperCase());
      b.textContent = pretty;
      b.addEventListener('click', ()=> {
        card.dataset.selectedDifficulty = l;
        labelBtn.textContent = 'Level: ' + pretty;
        modal.remove();
      });
      dlg.appendChild(b);
    });
    const cancel = document.createElement('button'); cancel.className='btn'; cancel.style.marginTop='8px'; cancel.textContent='Close';
    cancel.addEventListener('click', ()=> modal.remove());
    dlg.appendChild(cancel);
    modal.appendChild(dlg);
    document.body.appendChild(modal);
  }

  // Directly start a game using chosen difficulty (no start modal)
  async function startGameDirect(mathType, difficulty = 'easy', questionCount = 10) {
    try {
      const payload = { mathTypeId: mathType._id || mathType.id || mathType.slug, difficulty, questionCount };
      const r = await apiFetch('/math-game/start', { method: 'POST', body: payload }).catch(()=>null);
      if (!r || !r.ok) {
        showToast('Start failed: ' + (r && r.message ? r.message : 'server'), 'danger');
        return;
      }
      openPlayModal(mathType, r.gameAttemptId, r.questions || [], (typeof r.runningScore === 'number' ? r.runningScore : 0), difficulty);
    } catch (err) {
      console.error('startGameDirect', err);
      showToast('Start failed', 'danger');
    }
  }

  // Play modal (unchanged except minor tidy)
  function openPlayModal(mathType, gameAttemptId, questions, startingScore = 0, selectedDifficulty = 'all') {
    questions = Array.isArray(questions) ? questions.slice() : [];
    const container = document.createElement('div'); container.className = 'modal';
    const card = document.createElement('div'); card.className = 'modal-dialog math-play-box';
    card.style.maxWidth = '980px'; card.style.width = '92%';
    container.appendChild(card);

    const prettyLevel = (selectedDifficulty === 'all') ? 'Mixed' : String(selectedDifficulty).replace('_',' ').replace(/\b\w/g,ch=>ch.toUpperCase());
    const header = document.createElement('div');
    header.style.display = 'flex'; header.style.justifyContent = 'space-between'; header.style.alignItems = 'center';
    header.innerHTML = `<div><h3 style="margin:0">${escapeHtml(mathType.title)}</h3>
      <div class="small-muted">Level: ${escapeHtml(prettyLevel)} • Questions: ${questions.length}</div></div>`;
    const closeBtn = document.createElement('button'); closeBtn.className = 'btn btn--outline'; closeBtn.textContent = '×';
    closeBtn.addEventListener('click', async ()=> { if (!confirm('Leave quiz? progress saved automatically.')) return; container.remove(); await renderGamePage(); });
    header.appendChild(closeBtn);
    card.appendChild(header);

    const progressWrap = document.createElement('div'); progressWrap.style.marginTop = '12px';
    const questionWrap = document.createElement('div'); questionWrap.style.marginTop = '12px';
    const runningScoreEl = document.createElement('div'); runningScoreEl.className='muted'; runningScoreEl.style.marginTop='10px'; runningScoreEl.style.fontWeight = '700';
    runningScoreEl.textContent = 'Score: ' + (typeof startingScore === 'number' ? startingScore : 0);
    const feedbackBanner = document.createElement('div'); feedbackBanner.className = 'feedback-banner'; feedbackBanner.style.display = 'none';

    card.appendChild(progressWrap); card.appendChild(questionWrap); card.appendChild(runningScoreEl); card.appendChild(feedbackBanner);

    let currentIndex = 0;
    let totalScore = (typeof startingScore === 'number') ? startingScore : 0;
    const qById = {};
    questions.forEach((q, idx) => qById[String(q.questionId)] = Object.assign({}, q, { __idx: idx }));

    const answeredSet = new Set();
    const pendingSubmission = {};
    const startedAtPerQ = {};
    let timerRef = { id: null, qid: null };

    function clearTimer() { if (timerRef.id) { clearInterval(timerRef.id); timerRef.id = null; timerRef.qid = null; } }

    function startTimerForQuestion(q, onExpire) {
      clearTimer();
      const timerEl = document.getElementById('math-timer');
      if (!timerEl) return;
      let remaining = Number(q.timeLimitSeconds || 20);
      timerEl.textContent = `${remaining}s`;
      timerRef.qid = String(q.questionId);
      timerRef.id = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearTimer();
          timerEl.textContent = '0s';
          if (typeof onExpire === 'function') onExpire(true);
        } else {
          timerEl.textContent = `${remaining}s`;
        }
      }, 1000);
    }

    function setFeedback(text, type = 'info') {
      if (!feedbackBanner) return;
      feedbackBanner.textContent = text;
      feedbackBanner.className = 'feedback-banner' + (type === 'correct' ? ' correct' : (type === 'wrong' ? ' wrong' : ''));
      feedbackBanner.style.display = 'block';
      setTimeout(()=> { try { feedbackBanner.style.display = 'none'; } catch(e){} }, 3000);
    }

    async function handleLocalSubmit(qid, userAnswer, timedOut = false) {
      if (answeredSet.has(qid)) return;
      if (pendingSubmission[qid]) return;
      pendingSubmission[qid] = true;
      if (timerRef.qid === qid) clearTimer();
      const q = qById[qid];
      if (!q) { pendingSubmission[qid] = false; return; }
      const ui = q._ui || {};
      if (ui.answerInput) ui.answerInput.disabled = true;
      if (ui.answerButtons) ui.answerButtons.forEach(b=> b.disabled = true);

      if (timedOut) {
        if (ui.feedback) ui.feedback.innerHTML = `<div style="color:#991b1b"><strong>Time's up — −1</strong></div>`;
        showToast("Time's up — Incorrect −1", 'danger');
        setFeedback("Time's up — −1 • Total: calculating...", 'wrong');
      }

      const timeTaken = Math.floor(((Date.now() - (startedAtPerQ[qid] || Date.now())) / 1000));
      const payload = { questionId: qid, userAnswer: userAnswer, timeTakenSeconds: timeTaken };
      answeredSet.add(qid);

      let serverResp = null;
      try {
        serverResp = await apiFetch(`/math-game/attempt/${gameAttemptId}/answer`, { method: 'POST', body: payload }).catch(()=>null);
      } catch (err) {
        console.warn('answer POST error', err);
      }

      let correct = false;
      let canonical = null;
      let runningScore = null;
      if (serverResp && serverResp.ok) {
        correct = !!serverResp.correct;
        canonical = serverResp.correctAnswer;
        runningScore = (typeof serverResp.runningScore === 'number') ? serverResp.runningScore : null;
      }

      if (runningScore !== null) totalScore = runningScore;
      else {
        if (timedOut) totalScore = Math.max(0, totalScore - 1);
        else totalScore = totalScore + (serverResp && serverResp.correct ? 1 : -1);
      }

      if (serverResp && serverResp.ok) {
        if (correct) {
          if (ui.feedback) ui.feedback.innerHTML = `<div style="color:green"><strong>Correct +1 • Total: ${totalScore}</strong></div>${canonical ? `<div class="small-muted">Answer: ${escapeHtml(String(canonical))}</div>` : ''}`;
          showToast('Correct +1 • Total: ' + totalScore);
          setFeedback('Correct +1 • Total: ' + totalScore, 'correct');
        } else {
          if (ui.feedback) ui.feedback.innerHTML = `<div style="color:#991b1b"><strong>Incorrect −1 • Total: ${totalScore}</strong></div>${canonical ? `<div class="small-muted">Answer: ${escapeHtml(String(canonical))}</div>` : ''}`;
          showToast('Incorrect −1 • Total: ' + totalScore, 'danger');
          setFeedback('Incorrect −1 • Total: ' + totalScore, 'wrong');
        }
      } else {
        if (!timedOut) {
          if (ui.feedback) ui.feedback.innerHTML = `<div class="small-muted"><strong>Answer submitted • Total: ${totalScore}</strong></div>`;
          showToast('Answer submitted • Total: ' + totalScore);
          setFeedback('Answer submitted • Total: ' + totalScore);
        } else {
          if (ui.feedback) ui.feedback.innerHTML = `<div style="color:#991b1b"><strong>Time\'s up — −1 • Total: ${totalScore}</strong></div>`;
          setFeedback("Time's up — −1 • Total: " + totalScore, 'wrong');
        }
      }

      runningScoreEl.textContent = 'Score: ' + totalScore;

      setTimeout(async () => {
        pendingSubmission[qid] = false;
        const nextIdx = (currentIndex + 1 < questions.length) ? currentIndex + 1 : -1;
        if (nextIdx === -1) {
          try {
            const r = await apiFetch('/math-game/complete', { method: 'POST', body: { gameAttemptId } }).catch(()=>null);
            if (r && r.ok) {
              showToast('Game complete. Score: ' + String(r.finalScore));
              await loadMySummary();
              await loadMyHistory();
              openResultsModal(mathType, r.finalScore, r.leaderboardTop5 || []);
            } else {
              showToast('Completed but failed to fetch results', 'danger');
            }
          } catch (err) {
            console.error('complete error', err);
            showToast('Complete failed', 'danger');
          } finally {
            container.remove();
            await renderGamePage();
          }
        } else {
          renderQuestion(nextIdx);
        }
      }, 900);
    }

    function renderQuestion(index) {
      if (index < 0) index = 0;
      if (index >= questions.length) index = questions.length - 1;
      currentIndex = index;
      clearTimer();
      questionWrap.innerHTML = '';
      const q = questions[currentIndex];
      if (!q) return;
      const qid = String(q.questionId);

      progressWrap.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div>Question ${currentIndex+1}/${questions.length}</div>
        <div id="math-timer" class="muted">...</div>
      </div>
      <div aria-hidden style="height:8px;background:#f1f5f9;border-radius:6px;margin-top:8px">
        <div style="width:${Math.round((currentIndex+1)/questions.length*100)}%;height:8px;background:#2563eb;border-radius:6px"></div>
      </div>`;

      runningScoreEl.textContent = 'Score: ' + totalScore;

      const panel = document.createElement('div'); panel.className = 'math-question';
      const prompt = document.createElement('div'); prompt.innerHTML = `<strong>${escapeHtml(q.text)}</strong>`;
      panel.appendChild(prompt);

      const meta = document.createElement('div'); meta.className = 'small-muted'; meta.style.marginTop = '6px';
      meta.innerHTML = `Difficulty: ${escapeHtml(String(q.difficulty || selectedDifficulty || 'easy'))} • Time: ${String(q.timeLimitSeconds || 'default')}s`;
      panel.appendChild(meta);

      const answersArea = document.createElement('div'); answersArea.style.marginTop = '12px';
      let answerInput = null;
      const answerButtons = [];

      if (q.isMultipleChoice && Array.isArray(q.options)) {
        q.options.forEach(opt => {
          const btn = document.createElement('button'); btn.className = 'answer-btn'; btn.type = 'button';
          btn.innerHTML = `${escapeHtml(opt.text)}`;
          btn.addEventListener('click', () => handleLocalSubmit(qid, String(opt.id)));
          answersArea.appendChild(btn);
          answerButtons.push(btn);
        });
      } else {
        answerInput = document.createElement('input'); answerInput.className='input';
        answerInput.placeholder = 'Type your answer (numbers or text)';
        answerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleLocalSubmit(qid, answerInput.value); }});
        answersArea.appendChild(answerInput);
        const sub = document.createElement('button'); sub.className='btn'; sub.textContent='Submit';
        sub.style.marginTop='8px';
        sub.addEventListener('click', () => handleLocalSubmit(qid, answerInput.value));
        answersArea.appendChild(sub);
        answerButtons.push(sub);
      }

      const feedback = document.createElement('div'); feedback.className = 'small-muted'; feedback.style.marginTop = '8px';
      panel.appendChild(answersArea);
      panel.appendChild(feedback);

      const nav = document.createElement('div'); nav.style.display='flex'; nav.style.gap='8px'; nav.style.marginTop='12px';
      const prev = document.createElement('button'); prev.className='btn btn--outline'; prev.textContent='Previous'; prev.disabled = (currentIndex === 0);
      const next = document.createElement('button'); next.className='btn'; next.textContent = (currentIndex === questions.length - 1) ? 'Finish' : 'Next';
      prev.addEventListener('click', () => { renderQuestion(Math.max(0, currentIndex - 1)); });
      next.addEventListener('click', async () => {
        if (currentIndex === questions.length - 1) {
          if (answeredSet.size < questions.length) {
            if (!confirm('Some questions are unanswered. Finish anyway?')) return;
          }
          try {
            const r = await apiFetch('/math-game/complete', { method: 'POST', body: { gameAttemptId } }).catch(()=>null);
            if (r && r.ok) {
              showToast('Game complete. Score: ' + String(r.finalScore));
              await loadMySummary();
              await loadMyHistory();
              openResultsModal(mathType, r.finalScore, r.leaderboardTop5 || []);
            } else {
              showToast('Complete failed', 'danger');
            }
          } catch (err) {
            console.error('complete error', err);
            showToast('Complete failed', 'danger');
          } finally {
            container.remove();
            await renderGamePage();
          }
        } else {
          renderQuestion(Math.min(questions.length - 1, currentIndex + 1));
        }
      });
      nav.appendChild(prev); nav.appendChild(next);

      panel.appendChild(nav);
      questionWrap.appendChild(panel);

      if (answeredSet.has(qid)) {
        feedback.innerHTML = `<strong>Already answered</strong>`;
        if (answerInput) answerInput.disabled = true;
        answerButtons.forEach(b => b.disabled = true);
      }

      startedAtPerQ[qid] = Date.now();
      startTimerForQuestion(q, () => {
        if (!answeredSet.has(qid) && !pendingSubmission[qid]) {
          if (feedback) feedback.innerHTML = `<div style="color:#991b1b"><strong>Time's up — −1</strong></div>`;
          if (answerInput) answerInput.disabled = true;
          answerButtons.forEach(b => b.disabled = true);
          handleLocalSubmit(qid, null, true).catch(()=>{});
        }
      });

      q._ui = { feedback, answerInput, answerButtons };
    }

    function openResultsModal(typeObj, finalScore, leaderboardTop5) {
      const m = document.createElement('div'); m.className = 'modal';
      const dlg = document.createElement('div'); dlg.className = 'modal-dialog';
      dlg.innerHTML = `<h3 style="margin-top:0">${escapeHtml(typeObj.title)} — Result</h3>
        <div style="font-weight:700;font-size:20px">Score: ${finalScore}</div>
        <h4 style="margin-top:12px">Top players</h4>`;
      const list = document.createElement('div');
      (leaderboardTop5 || []).forEach((e, i) => {
        const r = document.createElement('div'); r.style.display='flex'; r.style.justifyContent='space-between'; r.style.padding='6px 0';
        r.innerHTML = `<div><strong>#${i+1} ${escapeHtml(e.userName || '')}</strong><div class="small-muted">ID: ${escapeHtml(e.userNumberId||'')}</div></div>
                       <div style="text-align:right">${String(e.highestScore)}</div>`;
        list.appendChild(r);
      });
      dlg.appendChild(list);
      const close = document.createElement('button'); close.className='btn'; close.textContent='Close';
      close.style.marginTop='10px'; close.addEventListener('click', ()=> m.remove());
      dlg.appendChild(close);
      m.appendChild(dlg);
      document.body.appendChild(m);
    }

    renderQuestion(0);
    document.body.appendChild(container);
  }

  // openAttemptDetail - admin-only View (button only rendered for admin)
  async function openAttemptDetail(attemptId) {
    try {
      const r = await apiFetch(`/math-game/attempt/${attemptId}`);
      if (!r || !r.ok) return alert('Failed to load attempt');
      const att = r.attempt || {};
      const m = document.createElement('div'); m.className = 'modal';
      const card = document.createElement('div'); card.className = 'modal-dialog';
      card.style.maxHeight = '80vh'; card.style.overflowY = 'auto';

      const studentName = att.userName || (att.user && att.user.fullname) || att.userFullname || att.studentName || 'Unknown';
      const studentId = att.userNumberId || (att.user && (att.user.numberId || att.user.id)) || att.userNumber || '—';
      const managerCreatedBy = att.managerCreatedBy || att.schoolName || (att.createdBy && (att.createdBy.fullname || att.createdBy.school)) || '—';
      const levelText = att.selectedDifficulty ? String(att.selectedDifficulty).replace('_',' ') : 'All';

      const headerHtml = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h3 style="margin:0">Attempt — Score ${att.score || 0}</h3>
          <div class="small-muted" style="margin-top:6px">
            <strong>${escapeHtml(String(studentName))}</strong> • ID: ${escapeHtml(String(studentId))} • Manager: ${escapeHtml(String(managerCreatedBy))} • Level: ${escapeHtml(levelText)}
          </div>
        </div>
        <div style="text-align:right"><div class="small-muted">${new Date(att.createdAt || Date.now()).toLocaleString()}</div></div>
      </div><hr style="margin:12px 0">`;

      card.innerHTML = headerHtml;

      (att.questions || []).forEach(q => {
        const p = document.createElement('div'); p.className='math-question';
        p.style.marginBottom='10px';
        p.innerHTML = `<div><strong>${escapeHtml(q.text || '')}</strong></div>
                       <div class="small-muted" style="margin-top:6px">Your answer: ${escapeHtml(String(typeof q.userAnswer === 'undefined' ? '<no answer>' : q.userAnswer))} • ${q.correct ? '<span style="color:green">Correct</span>' : '<span style="color:red">Wrong</span>'}</div>
                       ${(typeof q.canonicalAnswer !== 'undefined') ? `<div class="small-muted" style="margin-top:4px">Answer: ${escapeHtml(String(q.canonicalAnswer || ''))}</div>` : '' }`;
        card.appendChild(p);
      });

      const close = document.createElement('button'); close.className='btn'; close.textContent='Close';
      close.style.marginTop = '8px';
      close.addEventListener('click', ()=> m.remove());
      card.appendChild(close);

      m.appendChild(card);
      document.body.appendChild(m);
    } catch (err) {
      console.error('openAttemptDetail', err);
      alert('Failed to load attempt');
    }
  }

  // Open a modal showing all questions for a given math type (admin only)
  async function openTypeQuestions(mathType) {
    const m = document.createElement('div'); m.className='modal';
    const dlg = document.createElement('div'); dlg.className='modal-dialog';
    dlg.style.maxWidth = '900px'; dlg.style.maxHeight = '86vh'; dlg.style.overflowY = 'auto';
    dlg.innerHTML = `<h3 style="margin-top:0">${escapeHtml(mathType.title)} — Questions</h3>`;
    const filterRow = document.createElement('div'); filterRow.style.display='flex'; filterRow.style.gap='8px'; filterRow.style.marginBottom='8px';
    const difficultyFilter = document.createElement('select'); difficultyFilter.className='input'; difficultyFilter.style.maxWidth='160px';
    difficultyFilter.innerHTML = `<option value="">All difficulties</option><option value="easy">Easy</option><option value="intermediate">Intermediate</option><option value="hard">Hard</option><option value="extra_hard">Extra hard</option><option value="no_way">No way</option>`;
    filterRow.appendChild(difficultyFilter);
    const refreshBtn = document.createElement('button'); refreshBtn.className='btn btn--outline'; refreshBtn.textContent='Refresh';
    filterRow.appendChild(refreshBtn);
    dlg.appendChild(filterRow);
    const listWrap = document.createElement('div'); listWrap.id = 'type-questions-list';
    dlg.appendChild(listWrap);

    const close = document.createElement('button'); close.className='btn'; close.textContent='Close'; close.style.marginTop='8px';
    close.addEventListener('click', ()=> m.remove());
    dlg.appendChild(close);

    m.appendChild(dlg);
    document.body.appendChild(m);

    async function loadQuestions() {
      listWrap.innerHTML = '<div class="muted">Loading questions…</div>';
      try {
        const q = new URLSearchParams({ mathTypeId: mathType._id || mathType.id || mathType.slug, difficulty: difficultyFilter.value || '' }).toString();
        const r = await apiFetch('/math-game/questions?' + q).catch(()=>null);
        const items = (r && r.questions) ? r.questions : (r && r.items) ? r.items : [];
        listWrap.innerHTML = '';
        if (!items.length) { listWrap.innerHTML = '<div class="muted">No questions found</div>'; return; }
        items.forEach(qdoc => {
          const p = document.createElement('div'); p.className='math-question';
          p.style.display='flex'; p.style.justifyContent='space-between'; p.style.alignItems='flex-start';
          const left = document.createElement('div'); left.style.flex='1';
          left.innerHTML = `<div><strong>${escapeHtml(qdoc.text || '')}</strong></div>
                            <div class="small-muted">Difficulty: ${escapeHtml(String(qdoc.difficulty || 'easy'))} • Time: ${String(qdoc.timeLimitSeconds || '')}s</div>
                            ${qdoc.isMultipleChoice && Array.isArray(qdoc.options) ? `<div class="small-muted">Options: ${escapeHtml(qdoc.options.map(o=>o.text).join(' | '))}</div>` : ''}`;
          p.appendChild(left);

          const right = document.createElement('div'); right.style.display='flex'; right.style.flexDirection='column'; right.style.gap='6px'; right.style.marginLeft='8px';
          const viewBtn = document.createElement('button'); viewBtn.className='btn btn--outline small-action'; viewBtn.textContent='View';
          viewBtn.addEventListener('click', ()=> openQuestionDetailModal(qdoc, mathType));
          right.appendChild(viewBtn);

          if (isAdmin()) {
            const editBtn = document.createElement('button'); editBtn.className='btn btn--outline small-action'; editBtn.textContent='Edit';
            editBtn.addEventListener('click', ()=> openEditQuestionModal(qdoc, mathType, loadQuestions));
            right.appendChild(editBtn);

            const delBtn = document.createElement('button'); delBtn.className='btn small-action'; delBtn.textContent='Delete';
            delBtn.addEventListener('click', async ()=> {
              if (!confirm('Delete this question?')) return;
              try {
                await apiFetch(`/math-game/questions/${qdoc._id}`, { method: 'DELETE' }).catch(()=>null);
                showToast('Deleted (if server supports endpoint)');
                await loadQuestions();
              } catch (err) { console.error(err); showToast('Delete failed','danger'); }
            });
            right.appendChild(delBtn);
          }

          p.appendChild(right);
          listWrap.appendChild(p);
        });
      } catch (err) {
        console.error('loadQuestions', err);
        listWrap.innerHTML = '<div class="muted">Failed to load questions</div>';
      }
    } 
    refreshBtn.addEventListener('click', loadQuestions);
    difficultyFilter.addEventListener('change', loadQuestions);
    await loadQuestions();
  }

  function openQuestionDetailModal(qdoc, mathType) {
    const m = document.createElement('div'); m.className='modal';
    const dlg = document.createElement('div'); dlg.className='modal-dialog';
    dlg.style.maxWidth = '720px';
    dlg.innerHTML = `<h3 style="margin-top:0">Question — ${escapeHtml(mathType.title)}</h3>
      <div style="margin-top:6px"><strong>${escapeHtml(qdoc.text || '')}</strong></div>
      <div class="small-muted" style="margin-top:8px">Difficulty: ${escapeHtml(qdoc.difficulty || '')} • Time: ${String(qdoc.timeLimitSeconds || '')}s</div>
      ${qdoc.isMultipleChoice && qdoc.options ? `<div style="margin-top:8px"><strong>Options:</strong><ul>${(qdoc.options||[]).map(o => `<li>${escapeHtml(o.text || o)}</li>`).join('')}</ul></div>` : ''}
      ${typeof qdoc.answer !== 'undefined' ? `<div class="small-muted" style="margin-top:8px">Answer: ${escapeHtml(String(qdoc.answer))}</div>` : '' }`;
    const close = document.createElement('button'); close.className='btn'; close.textContent='Close'; close.style.marginTop='12px';
    close.addEventListener('click', ()=> m.remove());
    dlg.appendChild(close);
    m.appendChild(dlg);
    document.body.appendChild(m);
  }

  // Admin: edit question modal
  function openEditQuestionModal(qdoc, mathType, onSaved) {
    const m = document.createElement('div'); m.className='modal';
    const dlg = document.createElement('div'); dlg.className='modal-dialog';
    dlg.style.maxWidth = '720px';
    dlg.innerHTML = `<h3 style="margin-top:0">Edit Question — ${escapeHtml(mathType.title)}</h3>`;
    const f = document.createElement('div'); f.style.display='grid'; f.style.gap='8px';
    const qText = document.createElement('textarea'); qText.className='input'; qText.value = qdoc.text || '';
    const isMCQLabel = document.createElement('label'); isMCQLabel.innerHTML = `<input type="checkbox" id="qm-mcq-edit" ${qdoc.isMultipleChoice ? 'checked' : ''} /> MCQ`;
    const optionsWrap = document.createElement('div'); optionsWrap.style.display='grid'; optionsWrap.style.gap='6px';
    (qdoc.options || []).forEach(opt => { const o = document.createElement('input'); o.className='input'; o.value = (opt && typeof opt.text !== 'undefined') ? opt.text : opt; optionsWrap.appendChild(o); });
    const addOpt = document.createElement('button'); addOpt.className='btn btn--outline'; addOpt.type='button'; addOpt.textContent='+ option';
    addOpt.addEventListener('click', ()=> { const o = document.createElement('input'); o.className='input'; o.placeholder='Option text'; optionsWrap.appendChild(o); });
    const correct = document.createElement('input'); correct.className='input'; correct.placeholder='Correct answer (id or value)'; correct.value = qdoc.answer || '';
    const diff = document.createElement('select'); diff.className='input';
    diff.innerHTML = `<option value="easy">Easy</option><option value="intermediate">Intermediate</option><option value="hard">Hard</option><option value="extra_hard">Extra hard</option><option value="no_way">No way</option>`;
    diff.value = qdoc.difficulty || 'easy';
    const timeLimit = document.createElement('input'); timeLimit.type='number'; timeLimit.className='input'; timeLimit.placeholder='Custom time (seconds)'; timeLimit.value = qdoc.timeLimitSeconds || '';
    const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent='Save';
    const cancelBtn = document.createElement('button'); cancelBtn.className='btn btn--outline'; cancelBtn.textContent='Cancel';

    f.appendChild(createRowLabel('Text')); f.appendChild(qText);
    f.appendChild(isMCQLabel); f.appendChild(createRowLabel('Options')); f.appendChild(optionsWrap); f.appendChild(addOpt);
    f.appendChild(createRowLabel('Correct answer')); f.appendChild(correct);
    f.appendChild(createRowLabel('Difficulty')); f.appendChild(diff);
    f.appendChild(createRowLabel('Time limit seconds (optional)')); f.appendChild(timeLimit);
    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px';
    actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
    f.appendChild(actions);
    dlg.appendChild(f); m.appendChild(dlg); document.body.appendChild(m);

    cancelBtn.addEventListener('click', ()=> m.remove());
    saveBtn.addEventListener('click', async ()=> {
      try {
        const opts = Array.from(optionsWrap.querySelectorAll('input.input')).map(x => ({ id: (Math.random().toString(36).slice(2,8)), text: x.value }));
        const payload = {
          text: qText.value,
          options: opts.length ? opts : null,
          answer: correct.value,
          isMultipleChoice: !!document.getElementById('qm-mcq-edit') && document.getElementById('qm-mcq-edit').checked,
          difficulty: diff.value,
          timeLimitSeconds: timeLimit.value ? Number(timeLimit.value) : null
        };
        const r = await apiFetch(`/math-game/questions/${qdoc._id}`, { method: 'PUT', body: payload }).catch(()=>null);
        if (!r || !r.ok) throw new Error('Save failed');
        showToast('Question updated');
        m.remove();
        if (typeof onSaved === 'function') onSaved();
      } catch (err) {
        console.error('update question', err);
        showToast('Update failed', 'danger');
      }
    });
  }

  // Admin: edit math type modal (unchanged)
  function openEditTypeModal(typeObj) {
    const m = document.createElement('div'); m.className='modal';
    const dlg = document.createElement('div'); dlg.className='modal-dialog';
    dlg.innerHTML = `<h3 style="margin-top:0">Edit Math Type</h3>`;
    const f = document.createElement('div'); f.style.display='grid'; f.style.gap='8px';
    const title = document.createElement('input'); title.className='input'; title.value = typeObj.title || '';
    const slug = document.createElement('input'); slug.className='input'; slug.value = typeObj.slug || '';
    const desc = document.createElement('textarea'); desc.className='input'; desc.value = typeObj.description || '';
    const save = document.createElement('button'); save.className='btn'; save.textContent='Save';
    const cancel = document.createElement('button'); cancel.className='btn btn--outline'; cancel.textContent='Cancel';
    f.appendChild(createRowLabel('Title')); f.appendChild(title);
    f.appendChild(createRowLabel('Slug')); f.appendChild(slug);
    f.appendChild(createRowLabel('Description')); f.appendChild(desc);
    const act = document.createElement('div'); act.style.display='flex'; act.style.justifyContent='flex-end'; act.style.gap='8px';
    act.appendChild(cancel); act.appendChild(save);
    f.appendChild(act);
    dlg.appendChild(f); m.appendChild(dlg); document.body.appendChild(m);
    cancel.addEventListener('click', ()=> m.remove());
    save.addEventListener('click', async ()=> {
      try {
        const payload = { title: title.value, slug: slug.value, description: desc.value || '' };
        const r = await apiFetch(`/math-game/types/${typeObj._id}`, { method: 'PUT', body: payload }).catch(()=>null);
        if (!r || !r.ok) throw new Error('Save failed');
        showToast('Type updated');
        m.remove();
        await loadMathTypes();
      } catch (err) {
        console.error('update type', err);
        showToast('Update failed', 'danger');
      }
    });
  }

  // leaderboard loader — supports mathTypeId + difficulty or overall if mathTypeId null
  async function loadLeaderboardFor(mathTypeId = null, limit = 10, difficulty = null) {
    leaderboardBody.innerHTML = '<div class="muted">Loading…</div>';
    if (mathTypeId) {
      try {
        const period = periodFilter.value || 'all';
        const q = new URLSearchParams({ mathTypeId: mathTypeId, schoolId: curUser.schoolId || '', period, limit, difficulty: difficulty || '' }).toString();
        const r = await apiFetch('/math-game/leaderboard?' + q).catch(()=>null);
        if (!r || !r.ok) {
          const msg = (r && r.message) ? r.message : 'Failed to load leaderboard';
          leaderboardBody.innerHTML = `<div class="muted">${escapeHtml(msg)}</div>`;
          return;
        }
        const list = (r && r.leaderboard) ? r.leaderboard : [];
        if (!list.length) { leaderboardBody.innerHTML = '<div class="muted">No leaderboard data</div>'; setLeaderboardHeader(mathTypeId, difficulty); return; }

        // If difficulty param is null/empty (All levels), aggregate entries per user by summing highestScore across difficulties
        let aggregated = [];
        if (!difficulty) {
          const map = {};
          (list || []).forEach(entry => {
            const uid = String(entry.userId || (entry.userNumberId ? entry.userNumberId : (entry.userName||'unknown')));
            if (!map[uid]) map[uid] = { userId: entry.userId || uid, userName: entry.userName || '', userNumberId: entry.userNumberId || '', managerCreatedBy: entry.managerCreatedBy || '', schoolName: entry.schoolName || '', totalScore: 0, lastPlayedAt: entry.lastPlayedAt || entry.lastSeenAt || new Date(), breakdown: {} };
            const val = Number(entry.highestScore || 0);
            map[uid].totalScore += val;
            const ts = entry.lastPlayedAt || entry.lastSeenAt || new Date();
            if (!map[uid].lastPlayedAt || new Date(ts) > new Date(map[uid].lastPlayedAt)) map[uid].lastPlayedAt = ts;
            const diffLabel = (entry.difficulty || 'all');
            map[uid].breakdown[diffLabel] = Math.max(map[uid].breakdown[diffLabel] || 0, val);
          });
          aggregated = Object.keys(map).map(k => map[k]).sort((a,b) => b.totalScore - a.totalScore);
        } else {
          aggregated = (list || []).map(e => ({ userId: e.userId, userName: e.userName || '', userNumberId: e.userNumberId || '', managerCreatedBy: e.managerCreatedBy || '', schoolName: e.schoolName || '', totalScore: Number(e.highestScore || 0), lastPlayedAt: e.lastPlayedAt || e.lastSeenAt || new Date(), breakdown: { [e.difficulty || 'all']: Number(e.highestScore || 0) } }));
          aggregated.sort((a,b) => b.totalScore - a.totalScore);
        }

        setLeaderboardHeader(mathTypeId, difficulty);
        leaderboardBody.innerHTML = '';
        aggregated.slice(0, limit).forEach((row, idx) => {
          const el = document.createElement('div');
          el.className = 'leaderboard-row';
          el.style.display = 'flex';
          el.style.justifyContent = 'space-between';
          el.style.alignItems = 'center';
          const breakdownParts = [];
          Object.keys(row.breakdown || {}).forEach(d => {
            const pretty = (d === 'all') ? 'Mixed' : d.replace('_',' ');
            breakdownParts.push(`${pretty}: ${row.breakdown[d]}`);
          });
          const breakdownHtml = breakdownParts.length ? `<div class="small-muted">${escapeHtml(breakdownParts.join(' • '))}</div>` : '';
          el.innerHTML = `<div style="max-width:65%">
              <strong>#${idx+1} ${escapeHtml(row.userName || 'Unknown')}</strong>
              <div class="small-muted">ID: ${escapeHtml(row.userNumberId || '')}</div>
              ${row.managerCreatedBy ? `<div class="small-muted">School/University: ${escapeHtml(row.managerCreatedBy)}</div>` : ''}
              ${row.schoolName ? `<div class="small-muted">School: ${escapeHtml(row.schoolName)}</div>` : ''}
              ${breakdownHtml}
            </div>
            <div style="text-align:right;min-width:95px"><div style="font-weight:700">${String(row.totalScore || 0)}</div>
              <div class="small-muted">${new Date(row.lastPlayedAt || Date.now()).toLocaleString()}</div></div>`;
          leaderboardBody.appendChild(el);
        });
      } catch (err) {
        console.error('loadLeaderboardFor', err);
        leaderboardBody.innerHTML = '<div class="muted">Failed to load leaderboard</div>';
      }
    } else {
      try {
        const q = new URLSearchParams({ limit }).toString();
        const r = await apiFetch('/math-game/leaderboard?limit=' + limit).catch(()=>null);
        if (!r || !r.ok) { leaderboardBody.innerHTML = `<div class="muted">Failed to load overall leaderboard</div>`; setLeaderboardHeader(null, null); return; }
        const list = (r && r.leaderboard) ? r.leaderboard : [];
        setLeaderboardHeader(null, null);
        if (!list.length) { leaderboardBody.innerHTML = '<div class="muted">No leaderboard data</div>'; return; }
        leaderboardBody.innerHTML = '';
        list.forEach((row, idx) => {
          const el = document.createElement('div'); el.className='leaderboard-row';
          el.style.display='flex'; el.style.justifyContent='space-between'; el.style.alignItems='center';
          el.innerHTML = `<div>
              <strong>#${idx+1} ${escapeHtml(row.userName || 'Unknown')}</strong>
              <div class="small-muted">ID: ${escapeHtml(row.userNumberId || '')}</div>
              ${row.managerCreatedBy ? `<div class="small-muted">School/University: ${escapeHtml(row.managerCreatedBy)}</div>` : ''}
              ${row.schoolName ? `<div class="small-muted">School: ${escapeHtml(row.schoolName)}</div>` : ''}
            </div>
            <div style="text-align:right"><div style="font-weight:700">${String(row.totalScore || 0)}</div>
              <div class="small-muted">${new Date(row.lastSeenAt || Date.now()).toLocaleString()}</div></div>`;
          leaderboardBody.appendChild(el);
        });
      } catch (err) {
        console.error('load overall leaderboard', err);
        leaderboardBody.innerHTML = '<div class="muted">Failed to load overall leaderboard</div>';
      }
    }
  }

  function setLeaderboardHeader(mathTypeId, difficulty) {
    let hdrText = '';
    if (!leaderboardHeaderWrap) return;
    if (!mathTypeId) {
      hdrText = 'Leaderboard — Top students by total score (all games)';
    } else {
      const t = mathTypesById[String(mathTypeId)];
      const tTitle = t ? t.title : 'Selected Math Type';
      hdrText = `Leaderboard — ${escapeHtml(tTitle)}` + (difficulty ? ` — ${difficulty.replace('_',' ')}` : ' — All levels');
    }
    leaderboardHeaderWrap.textContent = hdrText;
  }

  async function loadMySummary() {
    try {
      const r = await apiFetch('/math-game/summary').catch(()=>null);
      if (r && r.ok) {
        let sEl = document.getElementById('my-summary');
        if (!sEl) {
          sEl = document.createElement('div'); sEl.id = 'my-summary';
          sEl.style.marginBottom = '8px';
          mathTypesList.parentNode.insertBefore(sEl, mathTypesList);
        }
        let breakdownHtml = '';
        if (Array.isArray(r.breakdown) && r.breakdown.length) {
          breakdownHtml = `<div style="margin-top:6px" class="small-muted">Breakdown: ${r.breakdown.map(b => `${escapeHtml(b.title||'')}: ${b.score}`).join(' • ')}</div>`;
        }
        sEl.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
            <div><strong>Total score (all games): ${String(r.totalScore || 0)}</strong><div class="small-muted">Completed attempts: ${String(r.completedAttempts || 0)}</div>${breakdownHtml}</div>
            <div style="text-align:right"><button class="btn btn--outline" id="refresh-summary">Refresh</button></div>
          </div>`;
        const btn = document.getElementById('refresh-summary');
        btn.addEventListener('click', loadMySummary);
      }
    } catch (err) { console.warn('loadMySummary', err); }
  }

  // show last attempt per type+level for current user; hide 'View' button unless admin
  async function loadMyHistory() {
    myGamesWrap.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const r = await apiFetch('/math-game/history?limit=50');
      const items = (r && r.items) ? r.items : [];
      myGamesWrap.innerHTML = '';
      if (!items.length) { myGamesWrap.innerHTML = '<div class="muted">No attempts yet</div>'; return; }

      const byKey = {};
      for (const at of items) {
        let mathTypeId = '';
        if (typeof at.mathTypeId === 'object' && at.mathTypeId) mathTypeId = (at.mathTypeId._id || at.mathTypeId);
        else mathTypeId = (at.mathTypeId || at.mathTypeId || '');
        mathTypeId = String(mathTypeId || 'unknown');

        let difficulty = (at.selectedDifficulty || at.difficulty || null);
        if (!difficulty) {
          try {
            const attemptDetail = await apiFetch(`/math-game/attempt/${at._id}`).catch(()=>null);
            if (attemptDetail && attemptDetail.ok && attemptDetail.attempt) difficulty = attemptDetail.attempt.selectedDifficulty || null;
          } catch (err) {}
        }
        if (!difficulty) difficulty = 'all';
        const key = `${mathTypeId}::${String(difficulty)}`;

        const existing = byKey[key];
        if (!existing || new Date(at.startedAt || 0) > new Date(existing.startedAt || 0)) {
          const copy = Object.assign({}, at, { mathTypeId: mathTypeId, selectedDifficulty: difficulty });
          byKey[key] = copy;
        }
      }

      const unique = Object.values(byKey).sort((a,b)=> new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
      unique.forEach(at => {
        const typeRec = mathTypesById[String(at.mathTypeId)];
        const typeTitle = (typeRec && typeRec.title) ? typeRec.title : (String(at.mathTypeId) || 'Game');
        const difficultyPretty = (at.selectedDifficulty && String(at.selectedDifficulty) !== 'all') ? ` • ${String(at.selectedDifficulty).replace('_',' ')}` : (at.selectedDifficulty === 'all' ? ' • Mixed' : '');
        const d = document.createElement('div'); d.className = 'attempt-card';
        d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
                         <div>
                           <div style="font-weight:700">${escapeHtml(typeTitle)}${escapeHtml(difficultyPretty)}</div>
                           <div class="small-muted">Score: ${String(at.score||0)} • ${at.completed ? 'Completed' : 'In progress'}</div>
                         </div>
                         <div style="text-align:right">${isAdmin() ? '<button class="btn btn--outline">View</button>' : ''}</div>
                       </div>`;
        const viewBtn = d.querySelector('button');
        if (viewBtn) viewBtn.addEventListener('click', ()=> openAttemptDetail(at._id));
        myGamesWrap.appendChild(d);
      });
    } catch (err) {
      console.error('loadMyHistory', err);
      myGamesWrap.innerHTML = '<div class="muted">Failed to load history</div>';
    }
  }

  // Admin: Add question modal (keeps behavior)
  function openAddQuestionModal(mathType) {
    const m = document.createElement('div'); m.className='modal';
    const dlg = document.createElement('div'); dlg.className='modal-dialog';
    dlg.innerHTML = `<h3 style="margin-top:0">Add Question — ${escapeHtml(mathType.title)}</h3>`;
    const f = document.createElement('div'); f.style.display='grid'; f.style.gap='8px';
    const qText = document.createElement('textarea'); qText.className='input'; qText.placeholder='Question text';
    const isMCQ = document.createElement('label'); isMCQ.innerHTML = '<input type="checkbox" id="qm-mcq" /> MCQ';
    const optionsWrap = document.createElement('div'); optionsWrap.style.display='grid'; optionsWrap.style.gap='6px';
    const addOpt = document.createElement('button'); addOpt.className='btn btn--outline'; addOpt.type='button'; addOpt.textContent='+ option';
    addOpt.addEventListener('click', ()=> { const o = document.createElement('input'); o.className='input'; o.placeholder='Option text'; optionsWrap.appendChild(o); });
    const correct = document.createElement('input'); correct.className='input'; correct.placeholder='Correct answer (id or value)';
    const diff = document.createElement('select'); diff.className='input';
    diff.innerHTML = `<option value="easy">Easy</option><option value="intermediate">Intermediate</option><option value="hard">Hard</option><option value="extra_hard">Extra hard</option><option value="no_way">No way</option>`;
    const timeLimit = document.createElement('input'); timeLimit.type='number'; timeLimit.className='input'; timeLimit.placeholder='Custom time (seconds)';
    const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent='Save';
    const cancelBtn = document.createElement('button'); cancelBtn.className='btn btn--outline'; cancelBtn.textContent='Cancel';

    f.appendChild(createRowLabel('Text')); f.appendChild(qText);
    f.appendChild(isMCQ); f.appendChild(createRowLabel('Options')); f.appendChild(optionsWrap); f.appendChild(addOpt);
    f.appendChild(createRowLabel('Correct answer')); f.appendChild(correct);
    f.appendChild(createRowLabel('Difficulty')); f.appendChild(diff);
    f.appendChild(createRowLabel('Time limit seconds (optional)')); f.appendChild(timeLimit);
    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px';
    actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
    f.appendChild(actions);

    dlg.appendChild(f); m.appendChild(dlg); document.body.appendChild(m);

    cancelBtn.addEventListener('click', ()=> m.remove());
    saveBtn.addEventListener('click', async ()=> {
      try {
        const opts = Array.from(optionsWrap.querySelectorAll('input.input')).map(x => ({ id: (Math.random().toString(36).slice(2,8)), text: x.value }));
        const payload = {
          mathTypeId: mathType._id || mathType.id || mathType.slug,
          text: qText.value,
          options: opts.length ? opts : null,
          answer: correct.value,
          isMultipleChoice: !!document.getElementById('qm-mcq') && document.getElementById('qm-mcq').checked,
          difficulty: diff.value,
          timeLimitSeconds: timeLimit.value ? Number(timeLimit.value) : null
        };
        const r = await apiFetch('/math-game/questions', { method: 'POST', body: payload });
        if (!r || !r.ok) throw new Error('Save failed');
        showToast('Question saved');
        m.remove();
      } catch (err) {
        console.error('save question', err);
        showToast('Save failed', 'danger');
      }
    });
  }

  // initial loads: types, summary, history, overall leaderboard
  await loadMathTypes();
  await loadMySummary();
  await loadMyHistory();
  // default: show overall top 10 total students
  await loadLeaderboardFor(null, 10, null);

  leaderboardRefresh.addEventListener('click', async ()=> {
    const first = document.querySelector('#math-types-list .math-game-card');
    if (first) {
      const mathTypeId = first.dataset.mathTypeId || null;
      if (mathTypeId) {
        const diff = (first.dataset.selectedDifficulty === 'all' || !first.dataset.selectedDifficulty) ? null : first.dataset.selectedDifficulty;
        await loadLeaderboardFor(mathTypeId, 10, diff);
      } else {
        await loadLeaderboardFor(null, 10, null);
      }
    } else {
      await loadLeaderboardFor(null, 10, null);
    }
  });
}

window.renderGamePage = renderGamePage;
