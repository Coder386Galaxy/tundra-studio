/* ============================================================
   TUNDRA RUNNER — pick a language, write in it, run it in the
   browser, publish to Tundra Games.

   Languages:
     'js'   -> the code IS a complete HTML document (runs raw)
     'py'   -> game.py, run by Pyodide   (cdn.jsdelivr.net/pyodide)
     'lua'  -> game.lua, run by Fengari  (fengari-web)

   py/lua games are wrapped in a generated HTML shell that
   provides the small "Tundra" game API + title/over screens,
   input, juice, the store screenshot bridge and error overlay.
   ============================================================ */
(function () {
  'use strict';

  var LANGS = [
    { id: 'js',  label: 'JavaScript', file: 'index.html', note: 'complete HTML document — full control' },
    { id: 'py',  label: 'Python',     file: 'game.py',    note: 'Python 3 via Pyodide, Tundra API' },
    { id: 'lua', label: 'Lua',        file: 'game.lua',   note: 'Lua 5.4 via Fengari, Tundra API' }
  ];

  var CDN = {
    py: { src: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js', id: 'pyodide', status: 'Loading Python runtime (Pyodide)…' },
    lua: { src: 'https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js', id: 'fengari', status: 'Loading Lua runtime (Fengari)…' }
  };

  /* ---------------- the Tundra game API (installed into every py/lua build) ---------------- */
  function installTundra() {
    var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
    var W = 800, H = 450;
    cv.width = W; cv.height = H;

    var state = 'title', score = 0, lives = 3, best = 0;
    var titleText = 'Game', subText = '', hintText = '';
    var bg1 = '#1B1F23', bg2 = '#0a0d10';
    var keys = {}, edge = {}, ptr = { x: W / 2, y: H / 2, down: false }, tap = false;
    var shakeN = 0, flashA = 0, parts = [], tsec = 0, muted = false, AC = null;
    var hooks = { init: null, update: null, draw: null, demo: null };
    try { best = +localStorage.getItem('tundra_api_best') || 0; } catch (e) {}

    function saveBest() {
      try { localStorage.setItem('tundra_api_best', best); } catch (e) {}
    }

    /* ---- audio ---- */
    function beep(f, dur, vol) {
      if (muted) return;
      try {
        if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
        if (AC.state === 'suspended') AC.resume();
        var o = AC.createOscillator(), g = AC.createGain();
        o.type = 'square'; o.frequency.value = f || 440;
        g.gain.value = vol || 0.04;
        g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + (dur || 0.08));
        o.connect(g); g.connect(AC.destination);
        o.start(); o.stop(AC.currentTime + (dur || 0.08) + 0.02);
      } catch (e) {}
    }

    /* ---- drawing ---- */
    function clear(c) { ctx.fillStyle = c || bg2; ctx.fillRect(0, 0, W, H); }
    function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
    function circle(x, y, r, c) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    }
    function line(x1, y1, x2, y2, c, w) {
      ctx.strokeStyle = c; ctx.lineWidth = w || 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    function text(s, x, y, size, c, align) {
      ctx.fillStyle = c || '#F5FAFF';
      ctx.font = '700 ' + (size || 16) + 'px system-ui, sans-serif';
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(s), x, y);
      ctx.textAlign = 'left';
    }

    /* ---- juice ---- */
    function shake(n) { shakeN = Math.max(shakeN, n || 8); }
    function flash(a) { flashA = Math.min(1, flashA + (a || 0.5)); }
    function burst(x, y, c, n) {
      n = n || 12;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.283, sp = 60 + Math.random() * 220;
        parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.5, c: c, s: 2 + Math.random() * 3 });
      }
      if (parts.length > 240) parts.splice(0, parts.length - 240);
    }

    /* ---- input ---- */
    function norm(k) {
      k = String(k).toLowerCase();
      if (k === 'arrowleft' || k === 'left') return 'left';
      if (k === 'arrowright' || k === 'right') return 'right';
      if (k === 'arrowup' || k === 'up') return 'up';
      if (k === 'arrowdown' || k === 'down') return 'down';
      if (k === ' ') return 'space';
      return k;
    }
    function key(k) { return !!keys[norm(k)]; }
    function pressed(k) { return !!edge[norm(k)]; }
    function tapped() { return tap; }

    document.addEventListener('keydown', function (e) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(e.key) >= 0) e.preventDefault();
      var k = norm(e.key);
      keys[k] = true; edge[k] = true;
      if (k === 'm') muted = !muted;
      if (state === 'title' && (k === 'space' || k === 'enter')) start();
      else if (state === 'over' && (k === 'r' || k === 'space' || k === 'enter')) start();
      else if ((state === 'play' || state === 'pause') && (k === 'p' || k === 'escape')) state = state === 'play' ? 'pause' : 'play';
    });
    document.addEventListener('keyup', function (e) { keys[norm(e.key)] = false; });
    function toLocal(e) {
      var r = cv.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width * W,
        y: (e.clientY - r.top) / r.height * H
      };
    }
    cv.addEventListener('pointerdown', function (e) {
      var p = toLocal(e);
      ptr.x = p.x; ptr.y = p.y; ptr.down = true; tap = true;
      if (state === 'title' || state === 'over') start();
    });
    cv.addEventListener('pointermove', function (e) {
      var p = toLocal(e); ptr.x = p.x; ptr.y = p.y;
    });
    window.addEventListener('pointerup', function () { ptr.down = false; });
    window.addEventListener('blur', function () { if (state === 'play') state = 'pause'; });

    /* ---- game state ---- */
    function setTitle(a, b, c) { titleText = String(a || 'Game'); subText = String(b || ''); hintText = String(c || ''); }
    function set_bg(a, b) { bg1 = a || bg1; bg2 = b || bg2; }
    function start() {
      score = 0; lives = 3; parts = []; tap = false;
      state = 'play';
      if (hooks.init) hooks.init();
    }
    function gameOver(win) {
      if (score > best) { best = score; saveBest(); }
      state = 'over';
      tundraWin = !!win;
    }
    var tundraWin = false;

    /* ---- screens ---- */
    function paintBg() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, bg1); g.addColorStop(1, bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    function overlay(title, sub, foot) {
      ctx.fillStyle = 'rgba(5,8,12,0.62)'; ctx.fillRect(0, 0, W, H);
      text(title, W / 2, H / 2 - 50, 44, '#8fd8ff', 'center');
      if (sub) text(sub, W / 2, H / 2, 22, '#F5FAFF', 'center');
      if (foot) text(foot, W / 2, H / 2 + 48, 15, '#cfe0ea', 'center');
    }
    function hud() {
      text(Math.floor(score), 18, 24, 22, '#F5FAFF', 'left');
      text('BEST ' + Math.floor(best), W - 18, 24, 13, '#F5FAFF', 'right');
      if (lives > 0) {
        for (var i = 0; i < lives; i++) circle(W - 24 - i * 24, H - 24, 8, '#ffe27a');
      }
    }

    /* ---- frame ---- */
    function frame(ts) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (ts - (frame._last || ts)) / 1000); frame._last = ts;
      if (state === 'play' || state === 'title') tsec += dt;
      ctx.save();
      if (shakeN > 0) {
        shakeN = Math.max(0, shakeN - dt * 26);
        ctx.translate((Math.random() - 0.5) * shakeN, (Math.random() - 0.5) * shakeN);
      }
      paintBg();
      if (state === 'play' && hooks.update) hooks.update(dt);
      if (hooks.draw && state !== 'title') hooks.draw();
      if (state === 'play') {
        for (var i = parts.length - 1; i >= 0; i--) {
          var p = parts[i];
          p.t -= dt;
          if (p.t <= 0) { parts.splice(i, 1); continue; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt;
        }
        for (var j = 0; j < parts.length; j++) {
          var q = parts[j];
          ctx.globalAlpha = Math.min(1, q.t * 2.2);
          ctx.fillStyle = q.c;
          ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
        }
        ctx.globalAlpha = 1;
        hud();
      }
      if (state === 'title') {
        overlay(titleText, subText, 'PRESS SPACE OR TAP TO START' + (hintText ? '  ·  ' + hintText : ''));
      } else if (state === 'pause') {
        overlay('PAUSED', titleText, 'PRESS P OR ESC TO RESUME');
      } else if (state === 'over') {
        hud();
        overlay(tundraWin ? 'CLEARED!' : 'GAME OVER', 'SCORE  ' + Math.floor(score),
          (score >= best && score > 0 ? '★ NEW BEST! ' : 'BEST ' + Math.floor(best) + '  ·  ') + 'PRESS R OR TAP');
      }
      if (flashA > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.55, flashA) + ')';
        ctx.fillRect(0, 0, W, H);
        flashA = Math.max(0, flashA - dt * 3.2);
      }
      ctx.restore();
      edge = {}; tap = false;
    }

    /* ---- studio screenshot bridge ---- */
    function grab() {
      try { return cv.toDataURL('image/jpeg', 0.9); } catch (e) { return null; }
    }
    function stage(s) {
      var prev = state, data;
      var sprev = score, lprev = lives, wprev = tundraWin;
      if (s === 'title') {
        state = 'title';
        paintBg();
        if (hooks.draw) hooks.draw();
        if (hooks.demo) hooks.demo('title');
        overlay(titleText, subText, 'PRESS SPACE OR TAP TO START' + (hintText ? '  ·  ' + hintText : ''));
        data = grab();
      } else if (s === 'over') {
        score = Math.max(score, 4200);
        state = 'over'; tundraWin = false;
        paintBg();
        if (hooks.draw) hooks.draw();
        if (hooks.demo) hooks.demo('over');
        hud();
        overlay('GAME OVER', 'SCORE  ' + Math.floor(score), 'BEST ' + Math.floor(best));
        data = grab();
      } else {
        state = 'play';
        score = Math.max(score, 1200);
        paintBg();
        if (hooks.demo) hooks.demo('play');
        if (hooks.update) for (var i = 0; i < 20; i++) hooks.update(0.05);
        if (hooks.draw) hooks.draw();
        hud();
        data = grab();
      }
      state = prev; score = sprev; lives = lprev; tundraWin = wprev;
      return data;
    }
    window.addEventListener('message', function (ev) {
      var m = ev.data || {};
      if (m.src !== 'tundra-studio') return;
      if (m.act === 'ping') parent.postMessage({ src: 'tundra-game', act: 'pong', ts: m.ts }, '*');
      if (m.act === 'shot') parent.postMessage({ src: 'tundra-game', act: 'shot', ts: m.ts, state: m.state, data: stage(m.state) }, '*');
      if (m.act === 'restart') start();
    });
    parent.postMessage({ src: 'tundra-game', act: 'ready' }, '*');

    requestAnimationFrame(frame);

    return {
      W: W, H: H,
      /* hooks registration (used by the language bootstraps) */
      _hooks: hooks,
      /* reads */
      time: function () { return tsec; },
      score: function () { return score; },
      best: function () { return best; },
      lives: function () { return lives; },
      state: function () { return state; },
      pointer_x: function () { return ptr.x; },
      pointer_y: function () { return ptr.y; },
      pointer_down: function () { return ptr.down; },
      tapped: tapped,
      key: key,
      pressed: pressed,
      rand: function (a, b) { return a + Math.random() * ((b == null ? 1 : b) - a); },
      /* writes */
      clear: clear, rect: rect, circle: circle, line: line, text: text,
      set_bg: set_bg, setTitle: setTitle,
      setScore: function (n) { score = +n || 0; },
      addScore: function (n) { score += +n || 0; },
      setLives: function (n) { lives = Math.max(0, Math.round(+n || 0)); },
      shake: shake, flash: flash, burst: burst, beep: beep,
      start: start,
      game_over: gameOver
    };
  }

  /* ---------------- language bootstraps (run inside the build) ---------------- */
  function bootPython(srcJson) {
    var status = document.getElementById('status');
    function say(msg, bad) {
      if (!status) return;
      status.textContent = msg;
      status.className = bad ? 'bad' : '';
      status.style.display = msg ? '' : 'none';
    }
    window.onerror = function (m) { say('Error: ' + m, true); };
    say('Loading Python runtime (Pyodide)…');
    loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' }).then(function (py) {
      say('Starting game…');
      window._py = py;
      var prelude = [
        'from js import Tundra as _t',
        'W, H = 800, 450',
        'def clear(c="#0a0d10"): _t.clear(c)',
        'def rect(x,y,w,h,c): _t.rect(x,y,w,h,c)',
        'def circle(x,y,r,c): _t.circle(x,y,r,c)',
        'def line(x1,y1,x2,y2,c="#fff",w=2): _t.line(x1,y1,x2,y2,c,w)',
        'def text(s,x,y,size=16,c="#F5FAFF",align="left"): _t.text(str(s),x,y,size,c,align)',
        'def rand(a=0.0,b=1.0): return _t.rand(a,b)',
        'def key(n): return _t.key(n)',
        'def pressed(n): return _t.pressed(n)',
        'def tapped(): return _t.tapped()',
        'def pointer_x(): return _t.pointer_x()',
        'def pointer_y(): return _t.pointer_y()',
        'def pointer_down(): return _t.pointer_down()',
        'def score(): return _t.score()',
        'def best(): return _t.best()',
        'def lives(): return _t.lives()',
        'def set_score(n): _t.setScore(n)',
        'def add_score(n=1): _t.addScore(n)',
        'def set_lives(n): _t.setLives(n)',
        'def set_bg(a,b): _t.set_bg(a,b)',
        'def set_title(a,b="",c=""): _t.setTitle(a,b,c)',
        'def start(): _t.start()',
        'def game_over(win=False): _t.game_over(bool(win))',
        'def shake(n=8): _t.shake(n)',
        'def flash(a=0.5): _t.flash(a)',
        'def burst(x,y,c,n=12): _t.burst(x,y,c,n)',
        'def beep(f=440,d=0.08): _t.beep(f,d)',
        'def state(): return _t.state()'
      ].join('\n') + '\n';
      try {
        py.runPython(prelude + srcJson);
        var T = window.Tundra;
        ['init', 'update', 'draw', 'demo'].forEach(function (h) {
          var fn = py.globals.get(h);
          if (fn && typeof fn === 'function') T._hooks[h] = function (a) {
            try { if (a === undefined) fn(); else fn(a); }
            catch (e) { say('Error in ' + h + '(): ' + (e && e.message || e), true); throw e; }
          };
        });
        say('');
      } catch (e) {
        say('Error: ' + (e && e.message || e), true);
      }
    }).catch(function (e) {
      say('Could not load Pyodide (network needed the first time): ' + (e && e.message || e), true);
    });
  }

  function bootLua(srcJson) {
    var status = document.getElementById('status');
    function say(msg, bad) {
      if (!status) return;
      status.textContent = msg;
      status.className = bad ? 'bad' : '';
      status.style.display = msg ? '' : 'none';
    }
    window.onerror = function (m) { say('Error: ' + m, true); };
    say('Loading Lua runtime (Fengari)…');
    try {
      var f = window.fengari;
      if (!f) throw new Error('Fengari failed to load (network needed the first time)');
      var lua = f.lua, lauxlib = f.lauxlib, lualib = f.lualib, to_luastring = f.to_luastring, to_jsstring = f.to_jsstring;
      var L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(L);
      var prelude = [
        'local T = require("js").global.Tundra',
        'W, H = 800, 450',
        'function clear(c) T:clear(c or "#0a0d10") end',
        'function rect(x,y,w,h,c) T:rect(x,y,w,h,c) end',
        'function circle(x,y,r,c) T:circle(x,y,r,c) end',
        'function line(x1,y1,x2,y2,c,w) T:line(x1,y1,x2,y2,c or "#fff",w or 2) end',
        'function text(s,x,y,size,c,align) T:text(tostring(s),x,y,size or 16,c or "#F5FAFF",align or "left") end',
        'function rand(a,b) return T:rand(a or 0, b or 1) end',
        'function key(n) return T:key(n) end',
        'function pressed(n) return T:pressed(n) end',
        'function tapped() return T:tapped() end',
        'function pointer_x() return T:pointer_x() end',
        'function pointer_y() return T:pointer_y() end',
        'function pointer_down() return T:pointer_down() end',
        'function score() return T:score() end',
        'function best() return T:best() end',
        'function lives() return T:lives() end',
        'function set_score(n) T:setScore(n) end',
        'function add_score(n) T:addScore(n or 1) end',
        'function set_lives(n) T:setLives(n) end',
        'function set_bg(a,b) T:set_bg(a,b) end',
        'function set_title(a,b,c) T:setTitle(a,b or "",c or "") end',
        'function start() T:start() end',
        'function game_over(win) T:game_over(win or false) end',
        'function shake(n) T:shake(n or 8) end',
        'function flash(a) T:flash(a or 0.5) end',
        'function burst(x,y,c,n) T:burst(x,y,c,n or 12) end',
        'function beep(f,d) T:beep(f or 440, d or 0.08) end',
        'function state() return T:state() end'
      ].join('\n') + '\n';
      if (lua.luaL_dostring(L, to_luastring(prelude + srcJson)) !== lua.LUA_OK) {
        var err = to_jsstring(lua.lua_tostring(L, -1));
        say('Error: ' + err, true);
        return;
      }
      var T = window.Tundra;
      ['init', 'update', 'draw', 'demo'].forEach(function (name) {
        lua.lua_getglobal(L, to_luastring(name));
        var isFn = lua.lua_isfunction(L, -1);
        lua.lua_pop(L, 1);
        if (isFn) T._hooks[name] = function (a) {
          lua.lua_getglobal(L, to_luastring(name));
          var nargs = 0;
          if (a != null) {
            if (typeof a === 'string') lua.lua_pushstring(L, to_luastring(a));
            else lua.lua_pushnumber(L, a);
            nargs = 1;
          }
          if (lua.lua_pcall(L, nargs, 0, 0) !== lua.LUA_OK) {
            var e = to_jsstring(lua.lua_tostring(L, -1));
            lua.lua_pop(L, 1);
            say('Error in ' + name + '(): ' + e, true);
          }
        };
      });
      say('');
    } catch (e) {
      say('Error: ' + (e && e.message || e), true);
    }
  }

  /* ---------------- wrapper ---------------- */
  function escScript(s) {
    // keep literal </script> sequences from breaking the outer HTML
    return String(s).replace(/<\//g, '<\\/').replace(/\u2028|\u2029/g, '');
  }

  function wrap(lang, code, meta) {
    var cdn = CDN[lang];
    var bootFn = lang === 'py' ? bootPython : bootLua;
    var statusMsg = cdn ? cdn.status : '';
    var title = (meta && meta.title) || 'Game';
    var hint = (meta && meta.hint) || '';
    var sub = (meta && meta.blurb) ? String(meta.blurb).slice(0, 60) : '';
    var pal = (meta && meta.palette) || ['#1B1F23', '#0a0d10'];

    var apiSrc = installTundra.toString();
    var bootSrc = bootFn.toString();
    var main = [
      apiSrc,
      'window.Tundra = installTundra();',
      bootSrc,
      (lang === 'py' ? 'bootPython(' : 'bootLua(') + JSON.stringify(String(code)).replace(/</g, '\\u003c') + ');',
      'window.Tundra.setTitle(' + JSON.stringify(title) + ', ' + JSON.stringify(sub) + ', ' + JSON.stringify(hint) + ');',
      'window.Tundra.set_bg(' + JSON.stringify(String(pal[0])) + ', ' + JSON.stringify(String(pal[1] || pal[0])) + ');'
    ].join('\n');

    return [
      '<!DOCTYPE html>',
      '<html lang="en"><head><meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
      '<title>' + String(title).replace(/[<>&]/g, '') + '</title>',
      '<style>',
      'html,body{margin:0;height:100%;background:#0a0d10;display:flex;align-items:center;justify-content:center;',
      'overflow:hidden;-webkit-tap-highlight-color:transparent;font-family:system-ui,sans-serif}',
      '#cv{width:100%;height:auto;max-height:100vh;aspect-ratio:800/450;cursor:pointer;touch-action:none}',
      '#status{position:fixed;left:50%;top:14px;transform:translateX(-50%);background:rgba(5,8,12,.82);color:#cfe0ea;',
      'padding:8px 16px;border-radius:999px;font:600 13px system-ui,sans-serif;max-width:86vw;z-index:9}',
      '#status.bad{color:#ff8a8a;border:1px solid rgba(255,138,138,.4)}',
      '</style></head><body>',
      '<canvas id="cv"></canvas>',
      '<div id="status">' + escScript(statusMsg) + '</div>',
      '<scr' + 'ipt src="' + cdn.src + '"><' + '/scr' + 'ipt>',
      '<scr' + 'ipt>',
      escScript(main),
      '<' + '/scr' + 'ipt>',
      '</body></html>'
    ].join('\n');
  }

  /* ---------------- AI reference for py/lua prompts (canonical copy lives in llm.js) ---------------- */
  var API_REF = (window.LLM && window.LLM.API_REF) || '';

  window.Runner = {
    LANGS: LANGS,
    CDN: CDN,
    wrap: wrap,
    API_REF: API_REF,
    metaComment: function (lang) {
      return lang === 'py' ? '#' : lang === 'lua' ? '--' : '<!--';
    }
  };
})();
