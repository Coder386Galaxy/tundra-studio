/* ============================================================
   TUNDRA MEMORY — memory for the account, published games and
   unpublished games. Three faces:

   1. AI memory    — TSMemory.aiMemory() is added to every AI
                     prompt, so the model knows the workspace.
   2. Notes board  — account note + a note per game (published
                     and unpublished), edited in the 🧠 Memory modal.
   3. Never-lose vault — automatic snapshots + one-file JSON
                     backup / restore of account, catalog, drafts
                     and notes.

   Reads the shared localStorage store keys when present
   (tundra_users / tundra_session / tundra_games) and the studio's
   tundra_studio_projects. Works with whatever exists.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'tundra_memory';
  var VAULT = 'tundra_memory_backup';

  function lsGet(k, d) {
    try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  function raw(k) {
    try {
      var v = localStorage.getItem(k);
      if (v != null) return v;
      return sessionStorage.getItem(k);
    } catch (e) { return null; }
  }
  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function short(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function mem() {
    var m = lsGet(KEY, null) || {};
    if (!m.notes || typeof m.notes !== 'object') m.notes = {};
    if (!m.notes.games || typeof m.notes.games !== 'object') m.notes.games = {};
    if (typeof m.notes.account !== 'string') m.notes.account = '';
    return m;
  }
  function saveMem(m) { lsSet(KEY, m); return m; }

  /* ---------- the three subjects ---------- */
  function accountInfo() {
    var out = { user: raw('tundra_session') || '', name: '', wallet: 0, owned: 0 };
    try {
      var users = lsGet('tundra_users', {}) || {};
      var u = users[out.user];
      var st = (u && (u.state || u)) || {};
      out.name = st.name || (u && u.name) || '';
      out.wallet = +st.wallet || 0;
      out.owned = (st.owned || []).length;
    } catch (e) {}
    return out;
  }
  function publishedGames() {
    var list = lsGet('tundra_games', []) || [];
    return list.map(function (g) {
      return { id: g.id, title: g.title, price: +g.price || 0, tags: g.tags || [], date: g.date || '' };
    });
  }
  function unpublishedGames() {
    var projects = lsGet('tundra_studio_projects', []) || [];
    var pub = publishedGames();
    var pubTitles = {};
    pub.forEach(function (g) { pubTitles[slug(g.title)] = g.id; });
    return projects
      .filter(function (p) { return p && p.title && !pubTitles[slug(p.title)]; })
      .map(function (p) {
        return { pid: p.pid, title: p.title, lang: p.lang || 'js', when: p.when || '' };
      });
  }

  /* ---------- notes board ---------- */
  function noteKey(kind, id) { return kind === 'account' ? 'account' : 'g:' + (id || ''); }
  function getNote(kind, id) {
    var m = mem();
    return kind === 'account' ? (m.notes.account || '') : (m.notes.games[id] || '');
  }
  function setNote(kind, id, text) {
    var m = mem();
    if (kind === 'account') m.notes.account = String(text || '');
    else m.notes.games[id] = String(text || '');
    saveMem(m);
    snapshot();
    return true;
  }

  /* ---------- classification helper (rekey notes when games publish) ---------- */
  function markPublished(title, id) {
    var m = mem();
    var projects = lsGet('tundra_studio_projects', []) || [];
    var done = false;
    projects.forEach(function (p) {
      if (p && p.title && slug(p.title) === slug(title)) {
        var oldNote = m.notes.games[p.pid] || '';
        if (oldNote && id && !m.notes.games[id]) m.notes.games[id] = oldNote;
        p.published = { id: id || '', at: new Date().toISOString() };
        done = true;
      }
    });
    if (done) lsSet('tundra_studio_projects', projects);
    saveMem(m);
    return done;
  }

  /* ---------- AI memory ---------- */
  function aiMemory() {
    var acc = accountInfo();
    var pub = publishedGames();
    var un = unpublishedGames();
    var m = mem();
    if (!acc.user && !pub.length && !un.length && !m.notes.account) return '';
    var L = [];
    L.push('[MEMORY — Tundra Studio workspace (read-only facts the user recorded)]');
    L.push('Account: @' + (acc.user || 'local') + (acc.name ? ' "' + acc.name + '"' : '') +
      (acc.user ? ' · wallet $' + acc.wallet.toFixed(2) + ' · ' + acc.owned + ' games owned' : ''));
    if (m.notes.account) L.push('Account note: "' + short(m.notes.account, 160) + '"');
    if (pub.length) {
      L.push('Published games (' + Math.min(pub.length, 15) + ' of ' + pub.length + '):');
      var projects = lsGet('tundra_studio_projects', []) || [];
      var pidByTitle = {};
      projects.forEach(function (p) { if (p && p.title) pidByTitle[slug(p.title)] = p.pid; });
      pub.slice(0, 15).forEach(function (g) {
        var n = m.notes.games[g.id] || m.notes.games[pidByTitle[slug(g.title)]] || '';
        L.push('- ' + g.title + ' ($' + g.price + (g.tags.length ? ', ' + g.tags.slice(0, 4).join('/') : '') + ')' + (n ? ' — note: "' + short(n, 160) + '"' : ''));
      });
    }
    if (un.length) {
      L.push('Unpublished games (' + Math.min(un.length, 15) + ' of ' + un.length + '):');
      un.slice(0, 15).forEach(function (g) {
        var n = m.notes.games[g.pid];
        L.push('- ' + g.title + ' (' + g.lang + ')' + (n ? ' — note: "' + short(n, 160) + '"' : ''));
      });
    }
    return L.join('\n');
  }

  /* ---------- never-lose vault ---------- */
  function vault() {
    return {
      v: 1,
      at: new Date().toISOString(),
      session: raw('tundra_session') || '',
      users: lsGet('tundra_users', {}) || {},
      games: lsGet('tundra_games', []) || [],
      news: lsGet('tundra_news', []) || [],
      promos: lsGet('tundra_promos', {}) || {},
      drafts: lsGet('tundra_studio_projects', []) || [],
      notes: mem().notes
    };
  }
  function snapshot() {
    var v = vault();
    lsSet(VAULT, v);
    var m = mem();
    m.lastSnapshot = v.at;
    m.counts = { published: v.games.length, drafts: v.drafts.length };
    saveMem(m);
    return v;
  }
  function lastBackup() { return (mem().lastSnapshot || ''); }
  function download() {
    var v = snapshot();
    var d = new Date();
    var name = 'tundra-memory-' + d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(v, null, 2)], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    return name;
  }
  function restore(text) {
    var v;
    try { v = JSON.parse(text); } catch (e) { return { ok: false, err: 'Not a memory file (bad JSON)' }; }
    if (!v || v.v !== 1) return { ok: false, err: 'Not a Tundra memory file' };
    if (v.users) lsSet('tundra_users', v.users);
    if (v.games) lsSet('tundra_games', v.games);
    if (v.news) lsSet('tundra_news', v.news);
    if (v.promos) lsSet('tundra_promos', v.promos);
    if (v.drafts) lsSet('tundra_studio_projects', v.drafts);
    if (v.notes) {
      var m = mem();
      m.notes = v.notes;
      if (!m.notes.games) m.notes.games = {};
      saveMem(m);
    }
    try {
      if (v.session) localStorage.setItem('tundra_session', v.session);
    } catch (e) {}
    snapshot();
    return { ok: true };
  }

  window.TSMemory = {
    collect: function () {
      var acc = accountInfo();
      var pub = publishedGames();
      var un = unpublishedGames();
      var m = mem();
      var projects = lsGet('tundra_studio_projects', []) || [];
      var pidByTitle = {};
      projects.forEach(function (p) { if (p && p.title) pidByTitle[slug(p.title)] = p.pid; });
      pub.forEach(function (g) { g.note = m.notes.games[g.id] || m.notes.games[pidByTitle[slug(g.title)]] || ''; });
      un.forEach(function (g) { g.note = m.notes.games[g.pid] || ''; });
      return { account: { user: acc.user, name: acc.name, wallet: acc.wallet, owned: acc.owned, note: m.notes.account || '' }, published: pub, unpublished: un };
    },
    getNote: getNote,
    setNote: setNote,
    markPublished: markPublished,
    aiMemory: aiMemory,
    snapshot: snapshot,
    lastBackup: lastBackup,
    download: download,
    restore: restore,
    vault: vault
  };
})();
