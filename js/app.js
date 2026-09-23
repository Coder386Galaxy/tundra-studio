/* ============================================================
   TUNDRA STUDIO — app glue.
   AI = your API key only (js/llm.js). Code = plain editable HTML.
   ============================================================ */
(function () {
  'use strict';
  const SK = window.StoreKit, LM = window.LLM, TPL = window.Templates, RNR = window.Runner;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));

  /* ---------- guarded storage ---------- */
  let mem = {};
  function lsGet(k, d) {
    try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch (e) { return k in mem ? mem[k] : d; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { mem[k] = v; }
  }

  const TS = window.TS = {
    lang: null,
    mode: 'code',          // 'code' = the Code Room (no AI) · 'ai' = forge workspace with the assistant
    _aiUsed: false,
    fields: null,
    cover: null,
    shots: [],
    catalog: null,
    dirty: false,
    busy: false,
    autoRun: false,
    hint: '',
    engineCfg: lsGet('tundra_studio_cfg', { base: 'https://api.openai.com/v1', key: '', model: 'gpt-4o-mini' }),
    projects: lsGet('tundra_studio_projects', [])
  };
  TS.lang = lsGet('tundra_studio_lang', 'js');
  let editor = null;

  function langLabel(id) {
    const l = RNR.LANGS.find(x => x.id === id) || RNR.LANGS[0];
    return l;
  }

  /* ---------- toast + snow ---------- */
  let toastT = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2400);
  }
  TS.toast = toast;

  (function snow() {
    const c = $('#snow'), x = c.getContext('2d');
    let W, H, flakes = [];
    function resize() {
      W = c.width = window.innerWidth; H = c.height = window.innerHeight;
      flakes = [];
      for (let i = 0; i < 70; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, s: 0.8 + Math.random() * 2.2, v: 12 + Math.random() * 30, p: Math.random() * 6.28 });
    }
    resize();
    window.addEventListener('resize', resize);
    (function step() {
      requestAnimationFrame(step);
      x.clearRect(0, 0, W, H);
      x.fillStyle = '#F5FAFF';
      for (const f of flakes) {
        f.y += f.v / 60; f.x += Math.sin(f.y / 50 + f.p) * 0.2;
        if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
        x.globalAlpha = 0.15 + f.s * 0.13;
        x.fillRect(f.x, f.y, f.s, f.s);
      }
      x.globalAlpha = 1;
    })();
  })();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- views ---------- */
  TS.go = function (v) {
    $$('.view').forEach(s => s.classList.toggle('on', s.id === 'view-' + v));
    // nav lighting: the shared workspace lights Forge (AI mode) or Code Room (code mode)
    const navKey = v === 'workshop' ? (TS.mode === 'ai' ? 'home' : 'code') : v;
    $$('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === navKey));
    if (v === 'publish') renderPublish();
    if (v === 'projects') renderProjects();
    window.scrollTo(0, 0);
  };

  /* ---------- code room vs AI dock ---------- */
  function renderEmpty() {
    const el = $('#workshopEmpty');
    if (!el) return;
    if (TS.mode === 'ai') {
      el.innerHTML = '<div class="empty">Nothing open — describe a game in the <b>AI assistant</b> and hit Generate, ' +
        'start a <a href="#" onclick="TS.startTemplate(\'starter\');return false">starter template</a>, ' +
        'or open a project from <a href="#" onclick="TS.go(\'projects\');return false">Projects</a>.</div>';
    } else {
      el.innerHTML = '<div class="empty code-empty">' +
        '<h3>⌨️ The Code Room</h3>' +
        '<p>Just you and the code — no AI here. Pick a language in the toolbar, then start a file:</p>' +
        '<div class="row gap" style="justify-content:center">' +
        '<button class="btn primary" onclick="TS.startTemplate(\'starter\')">▶ Starter game</button>' +
        '<button class="btn ghost" onclick="TS.startTemplate(\'empty\')">▢ Empty file</button>' +
        '<button class="btn ghost" onclick="TS.go(\'projects\')">📂 Open project</button>' +
        '</div>' +
        '<p class="fine" style="margin-top:16px">Ctrl+Enter runs · Ctrl+S saves · everything stays in your browser. ' +
        'Publish to Tundra Games when you’re ready.</p>' +
        '</div>';
    }
  }

  function applyMode() {
    const g = $('#workshopGrid');
    if (!g) return;
    g.classList.toggle('mode-ai', TS.mode === 'ai');
    g.classList.toggle('mode-code', TS.mode !== 'ai');
    const h2 = $('#heroAI2');
    if (h2) h2.style.display = editor ? '' : 'none';
    renderEmpty();
  }

  TS.openCode = function () {
    TS.mode = 'code';
    applyMode();
    TS.go('workshop');
  };

  TS.openAI = function () {
    if (!editor) { TS.go('home'); toast('Generate or open a file first'); return; }
    TS.mode = 'ai';
    applyMode();
    TS.go('workshop');
  };

  TS.closeAI = function () {
    TS.mode = 'code';
    applyMode();
    toast('AI assistant closed — the Code Room is AI-free');
  };

  /* ---------- home ---------- */
  const IDEAS = [
    'A cozy flappy game where a little glacier spirit flies through ice caves, easy and chill',
    'A fast neon space shooter against asteroid swarms',
    'A relaxing endless snake in a candy world',
    'A spooky memory match with ghosts and gravestones',
    'A brutal dodge game with falling embers over a volcano',
    'A cheerful catcher: grab falling fruit, avoid grumpy crows'
  ];
  TS.surprise = function () {
    $('#heroPrompt').value = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  };
  function renderIdeas() {
    const box = $('#ideaChips');
    const words = ['cozy', 'space shooter', 'puzzle', 'endless', 'two-button', 'high-score'];
    box.innerHTML = words.map(w => '<button class="chip">' + esc(w) + '</button>').join('');
    box.querySelectorAll('.chip').forEach(ch => ch.onclick = () => {
      const p = $('#heroPrompt');
      p.value = (p.value ? p.value.replace(/\s*$/, ' ') : '') + ch.textContent;
      p.focus();
    });
  }

  /* ---------- language ---------- */
  function renderLangChips() {
    const box = $('#langChips');
    box.innerHTML = RNR.LANGS.map(l =>
      '<button class="chip ' + (TS.lang === l.id ? 'on' : '') + '" data-lang="' + l.id + '">' + esc(l.label) + '</button>'
    ).join('');
    box.querySelectorAll('.chip').forEach(ch => ch.onclick = () => TS.setLang(ch.dataset.lang));
    const sel = $('#langSel');
    if (sel) {
      sel.innerHTML = RNR.LANGS.map(l => '<option value="' + l.id + '"' + (TS.lang === l.id ? ' selected' : '') + '>' + esc(l.label) + '</option>').join('');
    }
    const fl = $('#fileLabel');
    if (fl) fl.textContent = langLabel(TS.lang).file;
    const ln = $('#langNote');
    if (ln) ln.textContent = langLabel(TS.lang).note;
    renderLangChipsOn();
  }
  function renderLangChipsOn() {
    const box = $('#langChips');
    if (!box) return;
    box.querySelectorAll('.chip').forEach(ch => ch.classList.toggle('on', ch.dataset.lang === TS.lang));
  }

  TS.setLang = function (v) {
    TS.lang = RNR.LANGS.some(l => l.id === v) ? v : 'js';
    lsSet('tundra_studio_lang', TS.lang);
    if (editor) editor.setLanguage(TS.lang);
    renderLangChips();
    if (editor) toast('Language: ' + langLabel(TS.lang).label + ' — source untouched; generate or paste ' + langLabel(TS.lang).label + ' code to run');
  };

  /* wrap the source into a runnable HTML build (js = the document itself) */
  function buildGame() {
    if (!editor) return '';
    const code = editor.getValue();
    if (TS.lang === 'js') return code;
    const meta = LM.extractMeta(code) || {
      title: (TS.fields && TS.fields.title) || 'Game',
      blurb: (TS.fields && TS.fields.blurb) || '',
      hint: TS.hint || '',
      palette: (TS.fields && TS.fields.palette) || ['#1B1F23', '#0a0d10']
    };
    return RNR.wrap(TS.lang, code, meta);
  }
  TS.buildGame = buildGame;

  /* ---------- engine status ---------- */
  function engineLabel() {
    const c = TS.engineCfg;
    if (c && c.key) return 'Engine: ' + esc(c.model || 'model') + ' via ' + esc((c.base || '').replace(/^https?:\/\//, '').replace(/\/+$/, '')) + ' · key ✓';
    return 'Engine: not configured — AI needs your API key (<button class="linklike" onclick="TS.openSettings()">⚙ add one</button>)';
  }
  function refreshEngine() {
    $('#engineLine').innerHTML = engineLabel();
    $('#heroEngineLine').innerHTML = engineLabel();
    $('#engineBtn').textContent = TS.engineCfg && TS.engineCfg.key ? '⚙ ' + (TS.engineCfg.model || 'Engine') : '⚙ Engine';
  }

  function requireKey() {
    if (TS.engineCfg && TS.engineCfg.key) return true;
    toast('AI needs your API key — add one in ⚙ Engine');
    TS.openSettings();
    return false;
  }

  /* ---------- AI activity log ---------- */
  function logLine(html) {
    const el = $('#aiLog');
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.innerHTML += '\n<span class="dim">' + t + '</span> ' + html;
    while (el.innerHTML.length > 6000) el.innerHTML = el.innerHTML.slice(el.innerHTML.indexOf('\n') + 1);
    el.scrollTop = el.scrollHeight;
  }
  function logClear(msg) { $('#aiLog').innerHTML = '<span class="dim">' + esc(msg) + '</span>'; }

  function setBusy(b) {
    TS.busy = b;
    $('#aiGoBtn').disabled = b;
    $('#aiModBtn').disabled = b;
  }

  /* ---------- project state ---------- */
  function blankFields(title) {
    return {
      title: title || 'Untitled',
      studio: 'Tundra Publishing',
      price: 0,
      date: SK.today(),
      age: 'E',
      tags: ['Indie', 'Arcade'],
      platforms: ['Windows', 'Mac', 'Linux'],
      featured: true,
      blurb: '',
      desc: '',
      image: null,
      screens: [],
      palette: ['#1B1F23', '#4FB3E8']
    };
  }

  function applyMeta(meta) {
    const f = TS.fields || blankFields();
    if (meta) {
      if (meta.title) f.title = String(meta.title).slice(0, 60);
      if (meta.blurb) f.blurb = String(meta.blurb).slice(0, 160);
      if (meta.desc) f.desc = String(meta.desc);
      if (Array.isArray(meta.tags) && meta.tags.length) f.tags = meta.tags.map(String).slice(0, 6);
      if (meta.age) f.age = String(meta.age);
      if (isFinite(meta.price)) f.price = Math.max(0, +meta.price);
      if (Array.isArray(meta.palette) && meta.palette.length >= 2) f.palette = [String(meta.palette[0]), String(meta.palette[1])];
      if (meta.hint) TS.hint = String(meta.hint);
    } else {
      const t = LM.titleOf(editor.getValue());
      if (t) f.title = t.slice(0, 60);
    }
    TS.fields = f;
    $('#ctrlHint').textContent = 'Controls: ' + (TS.hint || 'see in-game instructions');
    $('#buildTitle').innerHTML = esc(f.title) + '<small id="dirtyFlag">' + (TS.dirty ? ' · modified' : '') + '</small>';
    renderKitForm();
    renderMedia();
  }

  function showWorkshopState() {
    const hasBuild = !!editor;
    $('#workshopEmpty').style.display = hasBuild ? 'none' : '';
    $('#workshopGrid').style.display = hasBuild ? '' : 'none';
  }

  /* ---------- load code into workshop ---------- */
  function loadCode(code, meta, titleHint) {
    TS.go('workshop');
    if (!editor) {
      editor = window.TundraEditor.mount({
        ta: $('#codeArea'),
        gutter: $('#edGutter'),
        hl: $('#edHl'),
        onRun: TS.run,
        onSave: TS.saveProject,
        onChange: function () {
          TS.dirty = true;
          const df = $('#dirtyFlag');
          if (df) df.textContent = ' · modified';
          if (TS.autoRun) {
            clearTimeout(TS._runT);
            TS._runT = setTimeout(TS.run, 700);
          }
        }
      });
    }
    editor.setLanguage(TS.lang);
    renderLangChips();
    TS.dirty = false;
    TS.hint = '';
    editor.setValue(code);
    TS.dirty = false;
    TS.fields = TS.fields || blankFields(titleHint);
    showWorkshopState();
    applyMode();
    TS.run();
    const metaObj = meta || LM.extractMeta(code);
    applyMeta(metaObj);
  }
  TS.loadCode = loadCode;

  TS.startTemplate = function (kind) {
    const t = TPL.get(TS.lang, kind === 'empty' ? 'empty' : 'starter');
    TS.fields = null; TS.cover = null; TS.shots = [];
    TS.mode = 'code';
    TS._aiUsed = false;
    loadCode(t.code, null, TS.lang === 'js' ? (kind === 'empty' ? 'My Game' : 'Starfall Catch') : 'Starfall Catch');
    toast('Opened “' + t.label + '” — the Code Room, no AI');
  };
  TS.newFrom = function (id) { TS.startTemplate(id === 'empty' ? 'empty' : 'starter'); };

  TS.run = function () {
    if (!editor) return;
    $('#gameFrame').srcdoc = buildGame();
  };

  TS.setAutoRun = function (v) { TS.autoRun = !!v; };

  /* ---------- AI: generate & modify (API key only) ---------- */
  TS.aiGenerate = function (fromHome) {
    const prompt = (fromHome ? $('#heroPrompt').value : $('#aiPrompt').value || $('#heroPrompt').value || '').trim();
    if (!prompt) { toast('Describe your game first ✍️'); return; }
    if (!requireKey()) return;
    $('#aiPrompt').value = prompt;
    TS.go('workshop');
    showWorkshopState();
    setBusy(true);
    logClear('generating…');
    logLine('<b class="hot">POST</b> ' + esc((TS.engineCfg.base || '').replace(/\/+$/, '')) + '/chat/completions');
    logLine('model: <b class="hot">' + esc(TS.engineCfg.model || 'model') + '</b> · prompt: ' + esc(prompt.slice(0, 60)) + (prompt.length > 60 ? '…' : ''));
    LM.generate(TS.engineCfg, prompt, TS.lang).then(res => {
      setBusy(false);
      if (!res.doc || res.doc.length < 80) throw new Error('Model returned no document');
      TS.mode = 'ai';
      TS._aiUsed = true;
      loadCode(res.doc, res.meta);
      TS.dirty = false;
      const df = $('#dirtyFlag'); if (df) df.textContent = '';
      logLine('✓ received ' + res.doc.length + ' chars · building preview…');
      setTimeout(() => {
        TS.captureAll(true);
        logLine('✓ done — playtest, edit the code, or apply changes with AI');
      }, 500);
      toast('⚡ Game generated — now make it yours');
    }).catch(e => {
      setBusy(false);
      logLine('✖ ' + esc(e && e.message || e));
      toast('AI error — see Activity log');
    });
  };

  TS.aiModify = function () {
    const prompt = $('#aiPrompt').value.trim();
    if (!prompt) { toast('Describe the change first ✍️'); return; }
    if (!requireKey()) return;
    if (!editor) { toast('Open or generate a game first'); return; }
    setBusy(true);
    logClear('applying change…');
    logLine('<b class="hot">POST</b> /chat/completions · revise: ' + esc(prompt.slice(0, 60)) + (prompt.length > 60 ? '…' : ''));
    LM.modify(TS.engineCfg, prompt, editor.getValue(), TS.lang).then(res => {
      setBusy(false);
      if (!res.doc || res.doc.length < 80) throw new Error('Model returned no document');
      TS._aiUsed = true;
      editor.setValue(res.doc);
      TS.dirty = false;
      const df = $('#dirtyFlag'); if (df) df.textContent = '';
      TS.run();
      if (res.meta) applyMeta(res.meta);
      logLine('✓ applied — ' + res.doc.length + ' chars');
      toast('AI updated the code');
    }).catch(e => {
      setBusy(false);
      logLine('✖ ' + esc(e && e.message || e));
      toast('AI error — see Activity log');
    });
  };

  TS.quickFix = function (text) {
    $('#aiPrompt').value = text;
    TS.aiModify();
  };

  /* ---------- capture bridge + canvas grab ---------- */
  function postToGame(msg) {
    const f = $('#gameFrame');
    if (f && f.contentWindow) f.contentWindow.postMessage(msg, '*');
  }

  function pingBridge() {
    return new Promise(res => {
      const ts = Date.now() + Math.random();
      TS._pongs = TS._pongs || {};
      TS._pongs[ts] = ok => res(ok);
      postToGame({ src: 'tundra-studio', act: 'ping', ts: ts });
      setTimeout(() => { if (TS._pongs[ts]) { delete TS._pongs[ts]; res(false); } }, 700);
    });
  }

  function requestShot(state) {
    return new Promise(res => {
      const ts = Date.now() + Math.random();
      TS._shots = TS._shots || {};
      TS._shots[ts] = d => res(d);
      postToGame({ src: 'tundra-studio', act: 'shot', state: state, ts: ts });
      setTimeout(() => { if (TS._shots[ts]) { delete TS._shots[ts]; res(null); } }, 1800);
    });
  }

  window.addEventListener('message', function (ev) {
    const m = ev.data || {};
    if (m.src !== 'tundra-game') return;
    const f = $('#gameFrame');
    if (f && ev.source !== f.contentWindow) return;
    if (m.act === 'pong' && m.ts && TS._pongs && TS._pongs[m.ts]) {
      const cb = TS._pongs[m.ts]; delete TS._pongs[m.ts]; cb(true);
    }
    if (m.act === 'shot' && m.ts && TS._shots && TS._shots[m.ts]) {
      const cb = TS._shots[m.ts]; delete TS._shots[m.ts]; cb(m.data || null);
    }
    if (m.act === 'ready' && m.hint) {
      TS.hint = m.hint;
      $('#ctrlHint').textContent = 'Controls: ' + m.hint;
    }
  });

  function grabCanvasFrame() {
    try {
      const d = $('#gameFrame').contentDocument;
      if (!d) return null;
      const cs = d.getElementsByTagName('canvas');
      let c = null;
      for (let i = 0; i < cs.length; i++) {
        if (!c || (cs[i].width * cs[i].height) > (c.width * c.height)) c = cs[i];
      }
      if (!c || !c.width) return null;
      return c.toDataURL('image/jpeg', 0.9);
    } catch (e) { return null; }
  }

  function pushShot(url) {
    TS.shots.push(url);
    if (TS.shots.length > 4) TS.shots.shift();
    TS.fields.screens = TS.shots.slice();
  }

  TS.captureShot = function () {
    if (!editor) return toast('Nothing running');
    const grab = grabCanvasFrame();
    (grab
      ? SK.compressDataURL(grab, 640, 360, 0.82)
      : requestShot('play').then(d => d ? SK.compressDataURL(d, 640, 360, 0.82) : SK.proceduralArt(TS.fields.title + ' · shot ' + (TS.shots.length + 1), TS.fields.palette, 640, 360, 10 + TS.shots.length, false))
    ).then(u => {
      pushShot(u);
      renderMedia();
      toast('📸 Screenshot added (' + TS.shots.length + '/4)');
    });
  };

  TS.captureCover = function () {
    if (!editor) return;
    const grab = grabCanvasFrame();
    (grab
      ? SK.compressDataURL(grab, 640, 360, 0.86)
      : requestShot('title').then(d => d ? SK.compressDataURL(d, 640, 360, 0.86) : SK.proceduralArt(TS.fields.title, TS.fields.palette, 640, 360, 1, true))
    ).then(u => {
      TS.cover = u;
      TS.fields.image = u;
      renderMedia();
      toast('📸 Cover captured');
    });
  };

  TS.captureAll = function (quiet) {
    if (!editor) return;
    const proc = (seed, title) => SK.proceduralArt(TS.fields.title + (title ? '' : ' · shot ' + seed), TS.fields.palette, 640, 360, seed, !!title);
    pingBridge().then(ok => {
      if (ok) {
        return Promise.all([
          requestShot('title').then(d => d ? SK.compressDataURL(d, 640, 360, 0.86) : proc(1, true)),
          requestShot('play').then(d => d ? SK.compressDataURL(d, 640, 360, 0.82) : proc(2, false)),
          requestShot('over').then(d => d ? SK.compressDataURL(d, 640, 360, 0.82) : proc(3, false))
        ]).then(us => ({ cover: us[0], shots: [us[1], us[2], us[0]] }));
      }
      const grab = grabCanvasFrame();
      return (grab ? SK.compressDataURL(grab, 640, 360, 0.86) : Promise.resolve(proc(1, true)))
        .then(cover => ({ cover: cover, shots: [cover, proc(2, false), proc(3, false)] }));
    }).then(r => {
      TS.cover = r.cover;
      TS.fields.image = r.cover;
      TS.shots = r.shots.slice(0, 3);
      TS.fields.screens = TS.shots.slice();
      renderMedia();
      if (!quiet) toast('✨ Cover + ' + TS.shots.length + ' screenshots ready');
    });
  };

  TS.uploadCover = function (inp) {
    const f = inp.files[0]; if (!f) return;
    SK.fileToDataURL(f).then(d => SK.compressDataURL(d, 640, 360, 0.86)).then(j => {
      TS.cover = j; TS.fields.image = j; renderMedia(); toast('Cover updated');
    });
    inp.value = '';
  };
  TS.uploadShots = function (inp) {
    const fs = Array.prototype.slice.call(inp.files || []);
    Promise.all(fs.map(f => SK.fileToDataURL(f).then(d => SK.compressDataURL(d, 640, 360, 0.82)))).then(js => {
      TS.shots = TS.shots.concat(js).slice(0, 4);
      TS.fields.screens = TS.shots.slice();
      renderMedia();
      toast('Screenshots added');
    });
    inp.value = '';
  };

  function renderMedia() {
    const cb = $('#coverBox');
    cb.innerHTML = TS.cover ? '<img src="' + TS.cover + '" alt="cover">' : '<div class="empty">No cover yet</div>';
    const sg = $('#shotGrid');
    sg.innerHTML = TS.shots.map((s, i) =>
      '<div class="shot"><img src="' + s + '" alt=""><button class="del" data-i="' + i + '">✕</button></div>'
    ).join('') || '<div class="empty" style="grid-column:1/-1">No screenshots yet</div>';
    $('#shotCount').textContent = TS.shots.length ? '(' + TS.shots.length + ')' : '';
    sg.querySelectorAll('.del').forEach(b => b.onclick = () => {
      TS.shots.splice(+b.dataset.i, 1);
      TS.fields.screens = TS.shots.slice();
      renderMedia();
    });
  }

  /* ---------- workshop tabs ---------- */
  TS.wsTab = function (t) {
    $$('#wsTabs .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $$('.tab-pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t));
  };

  /* ---------- store kit form ---------- */
  function renderKitForm() {
    const f = TS.fields;
    $('#kitForm').innerHTML =
      '<label>Title<input id="kTitle" class="inp" value="' + esc(f.title) + '"></label>' +
      '<label>Developer / Studio<input id="kStudio" class="inp" value="' + esc(f.studio) + '"></label>' +
      '<div class="grid2">' +
      '<label>Price USD (0 = free)<input id="kPrice" class="inp" type="number" min="0" step="0.01" value="' + f.price + '"></label>' +
      '<label>Release date<input id="kDate" class="inp" type="date" value="' + f.date + '"></label>' +
      '</div>' +
      '<div class="grid2">' +
      '<label>Age rating<select id="kAge">' + SK.AGES.map(a => '<option value="' + a + '"' + (a === f.age ? ' selected' : '') + '>' + (a || '(none)') + '</option>').join('') + '</select></label>' +
      '<label>Tags <span class="counter" id="tagCount"></span><input id="kTags" class="inp" value="' + esc(f.tags.join(', ')) + '"></label>' +
      '</div>' +
      '<label>Platforms<div class="checks">' + SK.PLATFORMS.map(p =>
        '<label><input type="checkbox" class="kPlat" value="' + p + '"' + (f.platforms.indexOf(p) >= 0 ? ' checked' : '') + '> ' + p + '</label>').join('') + '</div></label>' +
      '<label>Short description <span class="counter" id="blurbCount"></span><input id="kBlurb" class="inp" maxlength="160" value="' + esc(f.blurb) + '"></label>' +
      '<label>Full description<textarea id="kDesc" rows="5">' + esc(f.desc) + '</textarea></label>' +
      '<div class="grid2">' +
      '<label>Fallback color A<input id="kColA" type="color" value="' + esc(/^#[0-9a-fA-F]{6}$/.test(f.palette[0]) ? f.palette[0] : '#1B1F23') + '"></label>' +
      '<label>Fallback color B<input id="kColB" type="color" value="' + esc(/^#[0-9a-fA-F]{6}$/.test(f.palette[1]) ? f.palette[1] : '#4FB3E8') + '"></label>' +
      '</div>' +
      '<label style="flex-direction:row;align-items:center;gap:8px;text-transform:none;letter-spacing:0"><input id="kFeat" type="checkbox"' + (f.featured ? ' checked' : '') + '> Feature on store front</label>';

    const sync = () => {
      f.title = $('#kTitle').value.trim();
      f.studio = $('#kStudio').value.trim() || 'Tundra Publishing';
      f.price = Math.max(0, +$('#kPrice').value || 0);
      f.date = $('#kDate').value || SK.today();
      f.age = $('#kAge').value;
      f.tags = $('#kTags').value.split(',').map(t => t.trim()).filter(Boolean);
      f.platforms = $$('.kPlat:checked').map(c => c.value);
      f.blurb = $('#kBlurb').value.slice(0, 160);
      f.desc = $('#kDesc').value;
      f.palette = [$('#kColA').value, $('#kColB').value];
      f.featured = $('#kFeat').checked;
      $('#blurbCount').textContent = f.blurb.length + '/160';
      $('#tagCount').textContent = f.tags.length + ' tags';
    };
    ['#kTitle', '#kStudio', '#kPrice', '#kDate', '#kAge', '#kTags', '#kBlurb', '#kDesc', '#kColA', '#kColB'].forEach(id => {
      const el = $(id); if (el) el.addEventListener('input', sync);
    });
    $$('.kPlat').forEach(c => c.addEventListener('change', sync));
    $('#kFeat').addEventListener('change', sync);
    sync();
  }

  /* ---------- download ---------- */
  function downloadText(name, text) {
    const blob = new Blob([text], { type: name.endsWith('.html') ? 'text/html' : 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  TS.downloadGame = function () {
    if (!editor) return toast('Nothing to download yet');
    const slug = ((TS.fields && TS.fields.title) || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const L = langLabel(TS.lang);
    if (TS.lang === 'js') {
      downloadText(slug + '.html', editor.getValue());
      toast('⬇ ' + slug + '.html');
    } else {
      downloadText(L.file.replace('game', slug) , editor.getValue());
      setTimeout(() => downloadText(slug + '-build.html', buildGame()), 300);
      toast('⬇ source + build');
    }
  };

  /* ---------- projects ---------- */
  TS.saveProject = function () {
    if (!editor || !TS.fields) return toast('Nothing to save');
    const p = {
      pid: 'p' + Date.now().toString(36),
      title: TS.fields.title,
      when: new Date().toISOString(),
      lang: TS.lang,
      ai: TS._aiUsed,
      code: editor.getValue(),
      fields: TS.fields,
      cover: TS.cover,
      shots: TS.shots.slice()
    };
    const i = TS.projects.findIndex(x => x.title === p.title);
    if (i >= 0) { p.pid = TS.projects[i].pid; TS.projects[i] = p; } else TS.projects.unshift(p);
    TS.projects = TS.projects.slice(0, 24);
    lsSet('tundra_studio_projects', TS.projects);
    TS.dirty = false;
    const df = $('#dirtyFlag'); if (df) df.textContent = '';
    toast('💾 Project saved');
    renderProjects();
  };

  function renderProjects() {
    const g = $('#projGrid');
    if (!TS.projects.length) {
      g.innerHTML = '<div class="empty">No projects saved yet. Generate a game or start a template, then hit Save.</div>';
      return;
    }
    g.innerHTML = TS.projects.map(p =>
      '<div class="panel proj-card">' +
      '<img src="' + (p.cover || SK.proceduralArt(p.title, (p.fields && p.fields.palette) || ['#1B1F23', '#4FB3E8'], 320, 180, 1, true)) + '" alt="">' +
      '<div class="proj-body"><b>' + esc(p.title) + '</b><small>' + esc((RNR.LANGS.find(l => l.id === (p.lang || 'js')) || RNR.LANGS[0]).label) + ' · ' + new Date(p.when).toLocaleDateString() + ' · ' + Math.round((p.code || '').length / 1024) + ' KB</small>' +
      '<div class="proj-actions">' +
      '<button class="btn primary sm" data-open="' + p.pid + '">Open</button>' +
      '<button class="btn ghost sm" data-exp="' + p.pid + '">Export JSON</button>' +
      '<button class="btn ghost sm" data-del="' + p.pid + '">Delete</button>' +
      '</div></div></div>'
    ).join('');
    g.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openProject(b.dataset.open));
    g.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      TS.projects = TS.projects.filter(p => p.pid !== b.dataset.del);
      lsSet('tundra_studio_projects', TS.projects);
      renderProjects();
    });
    g.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => {
      const p = TS.projects.find(x => x.pid === b.dataset.exp);
      SK.download('tundra-studio-project-' + p.pid + '.json', JSON.stringify(p, null, 2));
    });
  }

  function openProject(pid) {
    const p = TS.projects.find(x => x.pid === pid);
    if (!p) return;
    TS.lang = p.lang || 'js';
    lsSet('tundra_studio_lang', TS.lang);
    TS.mode = p.ai ? 'ai' : 'code';
    TS._aiUsed = !!p.ai;
    TS.fields = p.fields || blankFields(p.title);
    TS.cover = p.cover || null;
    TS.shots = (p.shots || []).slice();
    TS.fields.screens = TS.shots.slice();
    TS.fields.image = TS.cover;
    loadCode(p.code, null, p.title);
    logClear('project opened · ' + p.title + ' (' + langLabel(TS.lang).label + ')');
    toast('Opened “' + p.title + '”');
  }

  /* ---------- publish ---------- */
  function currentGame() {
    if (!editor || !TS.fields) { toast('Forge a game first'); return null; }
    TS.fields.screens = TS.shots.slice();
    TS.fields.image = TS.cover;
    const errs = SK.validate(TS.fields);
    if (errs.length) { toast(errs[0]); return null; }
    return SK.buildGameObject(TS.fields, buildGame());
  }

  TS.exportPackage = function () {
    const g = currentGame();
    if (!g) return;
    SK.download('tundra-publish-' + SK.today() + '.json', JSON.stringify(SK.buildPackage(g), null, 2));
    toast('⬇ Publish package exported');
  };

  TS.loadCatalog = function (inp) {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.games)) throw new Error('no games[] array');
        TS.catalog = d;
        $('#mergeStatus').innerHTML = '✔ Catalog loaded: <b>' + d.games.length + '</b> title(s), <b>' + (d.news || []).length + '</b> news post(s). Your new title will be ' +
          (d.games.some(x => TS.fields && x.id === TS.fields.id) ? 'updated in place.' : 'appended.');
        $('#mergeExportBtn').style.display = '';
        toast('Catalog loaded');
      } catch (e) {
        TS.catalog = null;
        $('#mergeStatus').innerHTML = '✖ Not a Tundra Games catalog export (' + esc(e.message) + ').';
        $('#mergeExportBtn').style.display = 'none';
        toast('Invalid catalog file');
      }
    };
    r.readAsText(f);
    inp.value = '';
  };

  TS.exportMerged = function () {
    const g = currentGame();
    if (!g || !TS.catalog) return;
    SK.download('tundra-games-' + SK.today() + '.json', JSON.stringify(SK.mergeCatalog(TS.catalog, g, SK.launchNews(g)), null, 2));
    toast('⬇ Merged catalog exported — Restore it in Tundra Games');
  };

  /* ---------- direct publish (same-site bridge to Tundra Games) ---------- */
  TS.directRefresh = function () {
    const el = $('#directStatus');
    if (!el) return;
    const s = SK.directStatus();
    if (s.available) {
      el.innerHTML = '✅ <b>Same-site connection active</b> — this browser\'s Tundra Games catalog holds <b>' +
        s.count + '</b> title(s). Direct publish writes to it instantly.';
      $('#directBtn').disabled = !!(TS.fields && editor) ? false : true;
    } else {
      el.innerHTML = '🔌 Studio is running on <b>' + esc(s.host || 'a local file') + '</b> — direct publish activates once Tundra Studio is deployed at <b>' + s.storeHost + '</b> (the same site as the store, e.g. via GitHub Pages). The export/merge/form paths below work everywhere.';
      $('#directBtn').disabled = true;
    }
  };

  TS.directPublish = function () {
    const g = currentGame();
    if (!g) return;
    const s = SK.directStatus();
    if (!s.available) return toast('Direct publish needs the same site as Tundra Games (see status)');
    try {
      const r = SK.directPublish(g, SK.launchNews(g));
      TS.directRefresh();
      toast('⚡ “' + g.title + '” ' + (r.updated ? 'updated' : 'published') + ' — open Tundra Games!');
    } catch (e) {
      toast('Could not write the store catalog: ' + (e && e.message || e));
    }
  };

  TS.downloadMediaFiles = function () {
    const slug = ((TS.fields && TS.fields.title) || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (TS.cover) SK.downloadDataURL(slug + '-cover.jpg', TS.cover);
    TS.shots.forEach((s, i) => setTimeout(() => SK.downloadDataURL(slug + '-shot-' + (i + 1) + '.jpg', s), 350 * (i + 1)));
    toast('⬇ Media files downloading');
  };

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(() => toast('Copied ✓'), () => fallbackCopy(t));
    } else fallbackCopy(t);
    function fallbackCopy(s) {
      const ta = document.createElement('textarea');
      ta.value = s;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Copied ✓'); } catch (e) { toast('Copy failed'); }
      ta.remove();
    }
  }
  TS.copyText = copyText;

  function renderPublish() {
    if (!TS.fields || !editor) {
      $('#storePreview').innerHTML = '<div class="empty">Build a game first — then its storefront preview appears here.</div>';
      $('#copyList').innerHTML = '<div class="empty">Nothing to copy yet.</div>';
      TS.directRefresh();
      return;
    }
    TS.fields.screens = TS.shots.slice();
    TS.fields.image = TS.cover;
    const g = SK.buildGameObject(TS.fields, null);
    $('#copyList').innerHTML = SK.copyRows(g).map((r, i) =>
      '<div class="copy-item"><span class="k">' + esc(r.k) + '</span><span class="v">' + esc(r.v) + '</span><button data-copy="' + i + '">copy</button></div>'
    ).join('');
    $$('#copyList [data-copy]').forEach(b => b.onclick = () => copyText(SK.copyRows(g)[+b.dataset.copy].v));

    const priceHTML = g.price === 0
      ? '<span class="sp-price free">Free</span>'
      : '<span class="sp-price">' + SK.money(g.price) + '</span>';
    const img = g.image || SK.proceduralArt(g.title, g.palette, 640, 360, 1, true);
    $('#storePreview').innerHTML =
      '<div class="sp-card"><div class="sp-thumb"><img src="' + img + '" alt=""></div>' +
      '<div class="sp-meta"><b>' + esc(g.title) + '</b><small>' + esc(g.studio) + '</small>' +
      '<div class="sp-bottom"><span class="sp-rating">No reviews · ' + esc(g.platforms.map(p => p[0]).join('')) + '</span>' + priceHTML + '</div></div></div>' +
      '<div class="sp-detail">' +
      '<h4>' + esc(g.title) + '</h4>' +
      '<div class="sp-tags">' + g.tags.map(t => '<span class="sp-tag">' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="sp-kv">' +
      '<span>Developer</span><b>' + esc(g.studio) + '</b>' +
      '<span>Publisher</span><b>Tundra Publishing</b>' +
      '<span>Release</span><b>' + SK.fmtDate(g.date) + '</b>' +
      '<span>Platforms</span><b>' + esc(g.platforms.join(', ')) + '</b>' +
      (g.age ? '<span>Rating</span><b>' + esc(g.age) + '</b>' : '') +
      '<span>Reviews</span><b style="color:var(--arctic)">No reviews yet</b>' +
      '</div>' +
      '<div class="sp-buy">' + priceHTML +
      (g.price === 0 ? '<button class="btn primary sm">Add to Library</button>' : '<button class="btn primary sm">Add to Cart</button>') +
      '<button class="btn ghost sm">♡ Wishlist</button></div>' +
      '<p class="sp-desc" style="margin-top:12px">' + esc(g.desc.slice(0, 260)) + (g.desc.length > 260 ? '…' : '') + '</p>' +
      '<div class="sp-shots">' + (g.screens || []).map(s => '<img src="' + s + '" alt="">').join('') + '</div>' +
      '</div>';
    TS.directRefresh();
  }

  /* ---------- settings (API key only) ---------- */
  TS.openSettings = function () {
    $('#llmBase').value = TS.engineCfg.base || 'https://api.openai.com/v1';
    $('#llmKey').value = TS.engineCfg.key || '';
    $('#llmModel').value = TS.engineCfg.model || 'gpt-4o-mini';
    $('#settingsModal').classList.add('on');
  };
  TS.closeSettings = function () { $('#settingsModal').classList.remove('on'); };
  TS.saveSettings = function () {
    TS.engineCfg = {
      base: $('#llmBase').value.trim() || 'https://api.openai.com/v1',
      key: $('#llmKey').value.trim(),
      model: $('#llmModel').value.trim() || 'gpt-4o-mini'
    };
    lsSet('tundra_studio_cfg', TS.engineCfg);
    refreshEngine();
    TS.closeSettings();
    toast(TS.engineCfg.key ? 'Engine saved — AI is ready' : 'Engine saved (no key — AI disabled)');
  };
  TS.testEngine = function () {
    LM.test({ base: $('#llmBase').value.trim(), key: $('#llmKey').value.trim() })
      .then(() => toast('✓ Connection OK'))
      .catch(e => toast('✖ ' + (e && e.message || e)));
  };

  /* ---------- drag & drop merge zone ---------- */
  const dz = $('#dropCatalog');
  if (dz) {
    ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0];
      if (f) TS.loadCatalog({ files: [f], value: '' });
    });
  }

  /* ---------- boot ---------- */
  renderIdeas();
  renderLangChips();
  renderProjects();
  refreshEngine();
  showWorkshopState();
  applyMode();
})();
