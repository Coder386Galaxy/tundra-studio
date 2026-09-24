// smoke test: LLM parsing (all languages), runner wrap, templates, editor, store kit
const fs = require('fs');
const vm = require('vm');

let fails = 0;
const fail = (msg) => { fails++; console.log('FAIL:', msg); };
const eq = (a, b, m) => { if (a !== b) fail(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/* ---------- 1) LLM doc/meta extraction, all languages ---------- */
const sb1 = { window: {}, Math, JSON, Date, console, Array, Object, String, Number, Promise, RegExp, fetch: () => { } };
vm.createContext(sb1);
vm.runInContext(fs.readFileSync('js/llm.js', 'utf8'), sb1, { filename: 'llm.js' });
const LM = sb1.window.LLM;

const full = '<!DOCTYPE html>\n<html><head><title>T</title></head><body>hi</body></html>';
eq(LM.extractDoc(full), full, 'plain doc passes through');
eq(LM.extractDoc('```html\n' + full + '\n```'), full, 'fenced doc unwrapped');
eq(LM.extractDoc('Here is your game:\n```\n' + full + '\n```\nEnjoy!'), full, 'fenced doc with chatter');
eq(LM.extractDoc('Sure!\n' + full + '\nDone.'), full, 'unfenced doc with chatter');

const py = '# TUNDRA_META {"title":"Frost","blurb":"b"}\ndef update(dt):\n    pass';
const lua = '-- TUNDRA_META {"title":"Frost","price":2}\nfunction update(dt)\nend';
const jsM = '<!DOCTYPE html>\n<!-- TUNDRA_META {"title":"Frost","palette":["#111111","#4FB3E8"],"hint":"arrows"} -->\n<html>x</html>';
eq(LM.extractSource('```\n' + py + '\n```'), py, 'py source unfenced');
eq(LM.extractMeta(py).title, 'Frost', 'py meta');
eq(LM.extractMeta(lua).price, 2, 'lua meta');
eq(LM.extractMeta(jsM).hint, 'arrows', 'js meta');
eq(LM.extractMeta('<html>no meta</html>'), null, 'absent meta');
eq(LM.extractMeta('# TUNDRA_META {bad}'), null, 'invalid meta json');
eq(LM.titleOf(full), 'T', 'titleOf');
if (!LM.systemFor('py').includes('Tundra') || !LM.systemFor('lua').includes('init()')) fail('script prompts missing API');
if (!LM.systemFor('js').includes('TUNDRA_META')) fail('js prompt missing meta');

/* ---------- 2) runner wrap ---------- */
const sbR = { window: {}, Math, JSON, Date, console, Array, Object, String, Number, Promise, RegExp, document: {} };
vm.createContext(sbR);
vm.runInContext(fs.readFileSync('js/llm.js', 'utf8'), sbR, { filename: 'llm.js' });   // browser load order
vm.runInContext(fs.readFileSync('js/runner.js', 'utf8'), sbR, { filename: 'runner.js' });
const RNR = sbR.window.Runner;
if (RNR.LANGS.map(l => l.id).join() !== 'js,py,lua,frost') fail('lang list');

const sneaky = 'def update(dt):\n    s = "</script><script>alert(1)</script>"\n    text(s, 1, 2)';
for (const lang of ['py', 'lua']) {
  const w = RNR.wrap(lang, lang === 'py' ? sneaky : '-- x', { title: 'T', hint: 'h', blurb: 'b', palette: ['#1', '#2'] });
  if (!w.includes('installTundra') || !w.includes('window.Tundra')) fail(lang + ' wrap missing API');
  if ((w.match(/<\/script>/g) || []).length !== 2) fail(lang + ' wrap script-tag count: ' + (w.match(/<\/script>/g) || []).length);
  if (w.includes('</script><script>alert')) fail(lang + ' wrap did not escape embedded source');
  if (lang === 'py' && !w.includes('cdn.jsdelivr.net/pyodide')) fail('py wrap missing pyodide');
  if (lang === 'lua' && !w.includes('fengari-web')) fail('lua wrap missing fengari');
}
// syntax-check the API + boot fns indirectly: the wrap boot test below exercises them
try {
  const wLua = RNR.wrap('lua', '-- x', { title: 'T' });
  const blocksLua = [];
  const reL = /<script>([\s\S]*?)<\/script>/g;
  let mL;
  while ((mL = reL.exec(wLua))) blocksLua.push(mL[1]);
  const framesL = [], listenersL = {};
  const stubCtxL = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() { } }) : function () { }), set: () => true });
  const canvasL = {
    width: 0, height: 0, getContext: () => stubCtxL,
    addEventListener: (t, f) => { (listenersL[t] = listenersL[t] || []).push(f); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    toDataURL: () => 'data:image/jpeg;base64,fake'
  };
  const statusL = { textContent: '', className: '', style: {} };
  const sbL = {
    window: null,
    document: { getElementById: (id) => (id === 'cv' ? canvasL : statusL), addEventListener: (t, f) => { (listenersL['doc:' + t] = listenersL['doc:' + t] || []).push(f); } },
    addEventListener: (t, f) => { (listenersL[t] = listenersL[t] || []).push(f); },
    removeEventListener: () => { },
    localStorage: { getItem: () => '0', setItem: () => { } },
    requestAnimationFrame: (fn) => { framesL.push(fn); },
    parent: { postMessage: () => { } },
    Math, JSON, Date, console, Array, Object, String, Number, RegExp, isFinite, parseInt, parseFloat
    // note: no window.fengari — boot must degrade gracefully
  };
  sbL.window = sbL;
  vm.createContext(sbL);
  vm.runInContext(blocksLua[0], sbL, { filename: 'wrap-lua.js' });
  if (!sbL.window.Tundra || typeof sbL.window.Tundra.circle !== 'function') fail('lua wrap API missing');
  if (!/fengari/i.test(statusL.textContent)) fail('lua boot should report runtime load issue gracefully: ' + statusL.textContent);
  console.log('ok: lua wrap boots gracefully');
} catch (e) {
  fail('lua wrap boot error: ' + e.message);
}
if (!RNR.API_REF.includes('update(dt)')) fail('API_REF incomplete');

/* ---------- 3) store kit schema ---------- */
const sb2 = { window: {}, Math, JSON, Date, console, Array, Object, String, Number, Set, Promise, RegExp, document: {} };
vm.createContext(sb2);
vm.runInContext(fs.readFileSync('js/storekit.js', 'utf8'), sb2, { filename: 'storekit.js' });
const SK = sb2.window.StoreKit;
const fields = {
  title: 'Frostline Drift', studio: 'Glacier Works', price: 4.99, date: SK.today(), age: 'E10+',
  tags: ['Dodge', 'Glacier'], platforms: ['Windows', 'Mac', 'Linux'], featured: true,
  blurb: 'Outlast the storm.', desc: 'A long description.',
  image: 'data:image/jpeg;base64,/9j/x', screens: ['data:image/jpeg;base64,/9j/a'],
  palette: ['#123a55', '#8fd8ff']
};
if (SK.validate(fields).length) fail('validate rejected good fields');
const g = SK.buildGameObject(fields, RNR.wrap('py', sneaky, { title: 'Frostline Drift' }));
if (!g.gameHTML.includes('installTundra')) fail('gameHTML should carry the runnable build');
const pkg = SK.buildPackage(g);
if (pkg.users !== undefined || !pkg.news.length) fail('package shape');

/* ---------- 4) templates per language ---------- */
const sb3 = { window: {}, Math, JSON, Date, console, Array, Object, String, Number, Promise, RegExp };
vm.createContext(sb3);
vm.runInContext(fs.readFileSync('js/templates.js', 'utf8'), sb3, { filename: 'templates.js' });
const TPL = sb3.window.Templates;
for (const lang of ['js', 'py', 'lua', 'frost']) {
  const st = TPL.get(lang, 'starter'), em = TPL.get(lang, 'empty');
  if (!st.code || !em.code) fail(lang + ' templates missing');
  if (!LM.extractMeta(st.code)) fail(lang + ' starter meta unreadable');
  if (!LM.extractMeta(em.code)) fail(lang + ' empty meta unreadable');
}
if (!TPL.get('py', 'starter').code.includes('def update(dt):')) fail('py starter not python');
if (!TPL.get('lua', 'starter').code.includes('function update(dt)')) fail('lua starter not lua');
if (TPL.get('lua', 'starter').code.includes('\\u00b7')) fail('lua template has invalid \\u escape');

/* ---------- 5) JS starter template boots headlessly + bridge ---------- */
const code = TPL.get('js', 'starter').code;
if ((code.match(/<\/script>/g) || []).length !== 1) fail('js template must close script exactly once');
function bootGame(gameCode) {
  const frames = [], listeners = {}, sent = [];
  const stubCtx = new Proxy({}, {
    get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() { } }) : function () { }),
    set: () => true
  });
  const canvas = {
    width: 800, height: 450,
    getContext: () => stubCtx,
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    toDataURL: () => 'data:image/jpeg;base64,fake'
  };
  const sb = {
    window: null,
    document: {
      getElementById: () => canvas,
      getElementsByTagName: (t) => t === 'canvas' ? [canvas] : [],
      addEventListener: (t, f) => { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(f); }
    },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener: () => { },
    localStorage: { getItem: () => '0', setItem: () => { } },
    requestAnimationFrame: (fn) => { frames.push(fn); },
    parent: { postMessage: (m) => sent.push(m) },
    Math, JSON, Date, console, Array, Object, String, Number, RegExp, isFinite, parseInt, parseFloat,
    AudioContext: undefined, webkitAudioContext: undefined
  };
  sb.window = sb;
  const m = gameCode.match(/<script>([\s\S]*)<\/script>/);
  if (!m) { fail('no script in game'); return null; }
  vm.createContext(sb);
  vm.runInContext(m[1], sb, { filename: 'game.js' });
  return { sb, frames, listeners, sent };
}
const run = bootGame(code);
if (run) {
  try {
    let t = 0;
    const pump = n => { for (let i = 0; i < n; i++) { const fn = run.frames.shift(); if (!fn) return; t += 16.7; fn(t); } };
    pump(20);
    const kd = (run.listeners['doc:keydown'] || run.listeners['keydown'] || [])[0];
    const ku = (run.listeners['doc:keyup'] || run.listeners['keyup'] || [])[0];
    if (!kd) fail('js template: no keyboard');
    else { kd({ key: ' ', code: 'Space', preventDefault() { } }); pump(30); if (ku) ku({ key: ' ' }); kd({ key: 'r', code: 'KeyR', preventDefault() { } }); pump(10); }
    const msgFn = (run.listeners['message'] || [])[0];
    if (!msgFn) fail('js template: no message bridge');
    else {
      let pong = false, shot = null;
      run.sb.parent.postMessage = (m) => { if (m && m.act === 'pong') pong = true; if (m && m.act === 'shot') shot = m.data; };
      msgFn({ data: { src: 'tundra-studio', act: 'ping', ts: 1 } });
      msgFn({ data: { src: 'tundra-studio', act: 'shot', state: 'title', ts: 2 } });
      if (!pong) fail('js template: ping/pong broken');
      if (shot !== 'data:image/jpeg;base64,fake') fail('js template: shot bridge broken');
    }
  } catch (e) { fail('js template: runtime error: ' + e.message); }
  console.log('ok: js starter (' + Math.round(code.length / 1024) + ' KB)');
}

/* ---------- 5b) FROST — the hypereasy language boots + plays headlessly ---------- */
try {
  const wF = RNR.wrap('frost', TPL.get('frost', 'starter').code, { title: 'Starfall Catch', hint: 'h', blurb: 'b', palette: ['#1', '#2'] });
  if (!wF.includes('bootFrost')) fail('frost wrap missing bootFrost');
  if (wF.includes('cdn.jsdelivr') || wF.includes('fengari')) fail('frost wrap should not use a CDN');
  if ((wF.match(/<\/script>/g) || []).length !== 1) fail('frost wrap script-tag count: ' + (wF.match(/<\/script>/g) || []).length);
  if (!TPL.get('frost', 'empty').code.includes('title My Game')) fail('frost empty template broken');
  if (!LM.extractMeta(TPL.get('frost', 'starter').code)) fail('frost starter meta unreadable');
  const framesF = [], listenersF = {};
  const stubCtxF = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() { } }) : function () { }), set: () => true });
  const cvF = {
    width: 0, height: 0, getContext: () => stubCtxF,
    addEventListener: (t, f) => { (listenersF[t] = listenersF[t] || []).push(f); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    toDataURL: () => 'data:image/jpeg;base64,fake'
  };
  const statusEl = { textContent: '', className: '', style: {} };
  const sbF = {
    window: null,
    document: {
      getElementById: (id) => (id === 'status' ? statusEl : cvF),
      addEventListener: (t, f) => { (listenersF['doc:' + t] = listenersF['doc:' + t] || []).push(f); }
    },
    addEventListener: (t, f) => { (listenersF[t] = listenersF[t] || []).push(f); },
    removeEventListener: () => { },
    localStorage: { getItem: () => '0', setItem: () => { } },
    requestAnimationFrame: (fn) => { framesF.push(fn); },
    parent: { postMessage: () => { } },
    Math, JSON, Date, console, Array, Object, String, Number, RegExp, isFinite, parseInt, parseFloat
  };
  sbF.window = sbF;
  const blocksF = [];
  const reF = /<script>([\s\S]*?)<\/script>/g;
  let mF;
  while ((mF = reF.exec(wF))) blocksF.push(mF[1]);
  if (blocksF.length !== 1) fail('frost inline script blocks: ' + blocksF.length);
  else {
    vm.createContext(sbF);
    vm.runInContext(blocksF[0], sbF, { filename: 'frost-build.js' });
    const TF = sbF.window.Tundra;
    if (!TF || !TF._hooks || typeof TF._hooks.update !== 'function') fail('frost boot did not install hooks');
    else if (statusEl.className === 'bad') fail('frost parse error: ' + statusEl.textContent);
    else {
      TF.start();
      let tF = 0;
      for (let i = 0; i < 40; i++) { tF += 16.7; const fn = framesF.shift(); if (fn) fn(tF); }
      if (statusEl.className === 'bad') fail('frost runtime error: ' + statusEl.textContent);
      if (TF.state() !== 'play' && TF.state() !== 'over') fail('frost did not enter play');
      console.log('ok: frost starter boots + plays headlessly');
    }
  }
} catch (e) { fail('frost suite error: ' + e.message); }

/* ---------- 5c) boot: ~10s then the game opens; chosen title applies ---------- */
try {
  const wB = RNR.wrap('frost', 'title My Chosen Title\nbg #123456 #210000\nplayer p circle 20 #ffffff at 50% 50%\ncontrol p arrows speed 200\n', { title: 'Meta Title', hint: 'h', blurb: 'b', palette: ['#1', '#2'] });
  const framesB = [], listenersB = {};
  const stubCtxB = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() { } }) : function () { }), set: () => true });
  const cvB = {
    width: 0, height: 0, getContext: () => stubCtxB,
    addEventListener: (t, f) => { (listenersB[t] = listenersB[t] || []).push(f); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    toDataURL: () => 'data:image/jpeg;base64,fake'
  };
  const statusElB = { textContent: '', className: '', style: {} };
  const sbB = {
    window: null,
    document: {
      getElementById: (id) => (id === 'status' ? statusElB : cvB),
      addEventListener: (t, f) => { (listenersB['doc:' + t] = listenersB['doc:' + t] || []).push(f); }
    },
    addEventListener: (t, f) => { (listenersB[t] = listenersB[t] || []).push(f); },
    removeEventListener: () => { },
    localStorage: { getItem: () => '0', setItem: () => { } },
    requestAnimationFrame: (fn) => { framesB.push(fn); },
    parent: { postMessage: () => { } },
    Math, JSON, Date, console, Array, Object, String, Number, RegExp, isFinite, parseInt, parseFloat
  };
  sbB.window = sbB;
  const blocksB = [];
  const reB = /<script>([\s\S]*?)<\/script>/g;
  let mB;
  while ((mB = reB.exec(wB))) blocksB.push(mB[1]);
  vm.createContext(sbB);
  vm.runInContext(blocksB[0], sbB, { filename: 'boot-build.js' });
  const TB = sbB.window.Tundra;
  if (!TB) fail('boot suite: no Tundra API');
  else if (TB.state() !== 'boot') fail('expected boot state at launch, got ' + TB.state());
  else {
    let tB = 0;
    for (let i = 0; i < 660; i++) { tB += 16.7; const fn = framesB.shift(); if (fn) fn(tB); }
    if (TB.state() !== 'title') fail('title should open after ~10s boot, got ' + TB.state());
    const kdB = (listenersB['doc:keydown'] || listenersB['keydown'] || [])[0];
    if (kdB) {
      kdB({ key: ' ', preventDefault() { } });
      if (TB.state() !== 'play') fail('space should start the game from title, got ' + TB.state());
    }
    console.log('ok: boot 10s -> title opens -> play');
  }
} catch (e) { fail('boot suite error: ' + e.message); }

/* ---------- 5d) memory system: AI memory + notes + vault ---------- */
try {
  const store = {};
  const sbM = {
    window: null,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    sessionStorage: { getItem: () => null, setItem: () => { } },
    document: {
      createElement: () => ({ style: {}, click() { }, remove() { } }),
      body: { appendChild() { } },
      head: { appendChild() { } }
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } },
    Blob: function () { },
    console, JSON, Date, Math, Array, Object, String, Number, RegExp, isFinite, parseInt, parseFloat
  };
  sbM.window = sbM;
  vm.createContext(sbM);
  vm.runInContext(fs.readFileSync('js/memory.js', 'utf8'), sbM, { filename: 'memory.js' });
  const TM = sbM.window.TSMemory;
  if (!TM) fail('memory: TSMemory missing');
  else {
    store.tundra_session = 'aurora';
    store.tundra_users = JSON.stringify({ aurora: { state: { name: 'Aurora', wallet: 12, owned: ['g1'] } } });
    store.tundra_games = JSON.stringify([{ id: 'starfall-1', title: 'Starfall Catch', price: 0, tags: ['Arcade'], date: '2026-09-01' }]);
    store.tundra_studio_projects = JSON.stringify([
      { pid: 'p1', title: 'Starfall Catch', when: '2026-09-20', lang: 'frost', code: '' },
      { pid: 'p2', title: 'Boss Dungeon', when: '2026-09-22', lang: 'py', code: '' }
    ]);
    const c = TM.collect();
    if (c.published.length !== 1 || c.published[0].title !== 'Starfall Catch') fail('memory: published classification');
    if (c.unpublished.length !== 1 || c.unpublished[0].title !== 'Boss Dungeon') fail('memory: unpublished classification');
    if (c.account.user !== 'aurora' || c.account.wallet !== 12) fail('memory: account info');
    TM.setNote('game', 'p2', 'add a boss fight');
    TM.setNote('account', '', 'ship weekly');
    const ai = TM.aiMemory();
    if (!ai.includes('Boss Dungeon') || !ai.includes('Starfall Catch')) fail('memory: aiMemory lists games');
    if (!ai.includes('add a boss fight') || !ai.includes('ship weekly')) fail('memory: aiMemory carries notes');
    if (!ai.includes('@aurora')) fail('memory: aiMemory carries account');
    const v = TM.snapshot();
    if (!v || v.v !== 1 || v.drafts.length !== 2 || !v.notes) fail('memory: vault snapshot shape');
    const res = TM.restore(JSON.stringify(v));
    if (!res.ok) fail('memory: vault restore failed: ' + res.err);
    if (TM.getNote('game', 'p2') !== 'add a boss fight') fail('memory: notes survive restore');
    console.log('ok: memory system (AI memory + notes + vault)');
  }
} catch (e) { fail('memory suite: ' + e.message); }

/* ---------- 6) py/lua wrap builds boot headlessly (API + boot fns) ---------- */
try {
  const w = RNR.wrap('py', sneaky, { title: 'T' });
  const inline = w.split(/<scr' \+ 'ipt>|<script>/); // not used; extract second inline script block:
  const blocks = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let mm;
  while ((mm = re.exec(w))) blocks.push(mm[1]);
  if (blocks.length !== 1) fail('wrap inline script blocks: ' + blocks.length);
  else {
    // stub enough DOM to install the API (before runtime boot kicks in)
    const frames = [], listeners = {};
    const stubCtx = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() { } }) : function () { }), set: () => true });
    const canvas = {
      width: 0, height: 0, getContext: () => stubCtx,
      addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
      toDataURL: () => 'data:image/jpeg;base64,fake'
    };
    const status = { textContent: '', className: '', style: {} };
    const sbW = {
      window: null,
      document: {
        getElementById: (id) => (id === 'cv' ? canvas : status),
        addEventListener: (t, f) => { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(f); }
      },
      addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
      removeEventListener: () => { },
      localStorage: { getItem: () => '0', setItem: () => { } },
      requestAnimationFrame: (fn) => { frames.push(fn); },
      parent: { postMessage: () => { } },
      loadPyodide: () => new Promise(() => { }),   // never resolves: we test the API layer only
      Math, JSON, Date, console, Array, Object, String, Number, RegExp, isFinite, parseInt, parseFloat
    };
    sbW.window = sbW;
    vm.createContext(sbW);
    vm.runInContext(blocks[0], sbW, { filename: 'wrap-py.js' });
    const T = sbW.window.Tundra;
    if (!T || typeof T.circle !== 'function' || typeof T._hooks !== 'object') fail('wrapped API missing');
    // exercise API + frame loop + staged shots like a language bootstrap would
    let t = 0;
    for (let i = 0; i < 10; i++) { const fn = frames.shift(); if (fn) fn(t += 16.7); }
    T._hooks.init = () => { T.setScore(0); };
    T._hooks.update = (dt) => { T.addScore(1); };
    T._hooks.draw = () => { T.circle(1, 2, 3, '#fff'); };
    T._hooks.demo = (name) => { };
    T.start();
    for (let i = 0; i < 10; i++) { const fn = frames.shift(); if (fn) fn(t += 16.7); }
    if (T.score() < 5) fail('hook update not called by loop');
    const msgFn = (listeners['message'] || [])[0];
    let got = null;
    sbW.parent.postMessage = (m) => { if (m && m.act === 'shot') got = m.data; };
    msgFn({ data: { src: 'tundra-studio', act: 'shot', state: 'play', ts: 9 } });
    if (got !== 'data:image/jpeg;base64,fake') fail('wrap shot bridge broken');
    T.game_over();
    if (T.state() !== 'over') fail('game_over not switching state');
    console.log('ok: runner wrap boots (API + loop + bridge)');
  }
} catch (e) {
  fail('wrap boot error: ' + e.message);
}

/* ---------- 7) editor language highlighting ---------- */
const sb4 = { window: {}, Math, JSON, Date, console, Array, Object, String, Number, RegExp };
vm.createContext(sb4);
vm.runInContext(fs.readFileSync('js/editor.js', 'utf8'), sb4, { filename: 'editor.js' });
const ED = sb4.window.TundraEditor;
ED.setLanguage('js');
let hl = ED.highlight('const x = "<b>hi</b>"; // note');
if (hl.includes('<b>')) fail('js highlight did not escape HTML');
if (!hl.includes('t-kw') || !hl.includes('t-str') || !hl.includes('t-com')) fail('js tokens');
ED.setLanguage('py');
hl = ED.highlight('def update(dt):  # note\n    x = "s"');
if (!hl.includes('t-kw') || !hl.includes('t-com') || !hl.includes('t-str')) fail('py tokens: ' + hl.slice(0, 100));
if (hl.includes('t-tag')) fail('py should not highlight tags');
ED.setLanguage('lua');
hl = ED.highlight('function update(dt) -- note\n  local x = "s"\nend');
if (!hl.includes('t-kw') || !hl.includes('t-com') || !hl.includes('t-str')) fail('lua tokens');
ED.setLanguage('js');

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
