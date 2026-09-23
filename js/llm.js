/* ============================================================
   TUNDRA LLM — the ONLY AI in Tundra Studio is your API key.
   Talks to any OpenAI-compatible endpoint (/chat/completions).
   Generates code in the language the user selected:
     'js'  -> complete HTML document
     'py'  -> Python source (Tundra API)
     'lua' -> Lua source (Tundra API)
   ============================================================ */
(function () {
  'use strict';

  /* Screenshot bridge we ask JS-mode games to include (optional, best-effort). */
  var BRIDGE = [
    '(function(){',
    'function grab(){var cs=document.getElementsByTagName("canvas"),c=null;',
    'for(var i=0;i<cs.length;i++){if(!c||cs[i].width*cs[i].height>c.width*c.height)c=cs[i];}',
    'try{return c?c.toDataURL("image/jpeg",0.9):null;}catch(e){return null;}}',
    'parent.postMessage({src:"tundra-game",act:"ready"},"*");',
    'window.addEventListener("message",function(ev){var m=ev.data||{};if(m.src!=="tundra-studio")return;',
    'if(m.act==="ping")parent.postMessage({src:"tundra-game",act:"pong",ts:m.ts},"*");',
    'if(m.act==="shot"){var d=window.tundraShot?window.tundraShot(m.state):grab();',
    'parent.postMessage({src:"tundra-game",act:"shot",ts:m.ts,state:m.state,data:d},"*");}});',
    'window.tundraGrab=grab;})();'
  ].join('\n');

  var META_JS = '<!-- TUNDRA_META {"title":"...","blurb":"max 160 chars","desc":"store description, 2-5 sentences","tags":["3","to","6","words"],"age":"E|E10+|T","price":0,"palette":["#111111","#4FB3E8"],"hint":"controls string"} -->';

  /* Reference for the Tundra game API used by py/lua builds (prompt material). */
  var API_REF = [
    'The game runs against a tiny game API (already imported for you):',
    '  clear(color)                       fill the screen',
    '  rect(x,y,w,h,color)  circle(x,y,r,color)  line(x1,y1,x2,y2,color,width=2)',
    '  text(s,x,y,size=16,color="#F5FAFF",align="left")     align: left|center|right',
    '  set_bg(topColor, bottomColor)      screen gradient (call once in init)',
    '  set_title(title, subtitle, hint)   configure the title screen',
    '  rand(a,b)                          random float',
    '  key(name) / pressed(name)          held / pressed-this-frame. name: "left","right","up","down","a".."z","space","enter","x","z"',
    '  tapped() pointer_x() pointer_y() pointer_down()      pointer/touch',
    '  score() add_score(n=1) set_score(n) best() lives() set_lives(n)',
    '  shake(n=8) flash(a=0.5) burst(x,y,color,n=12) beep(freq=440,dur=0.08)',
    '  game_over(win=False)               end the run (win=True shows CLEARED!)',
    '  state()                            "title" | "play" | "pause" | "over"',
    'Implement up to 4 hooks (plain top-level functions):',
    '  init()      called on start/restart — reset your world here',
    '  update(dt)  logic each frame, dt in seconds',
    '  draw()      render the scene each frame (the runner draws title/game-over overlays and the HUD for you)',
    '  demo(name)  optional: arrange a pretty scene for screenshots ("title"|"play"|"over")',
    'The runner handles: title screen -> play (space/tap), pause (P/Esc), game over -> restart (R/tap), score/best HUD, M to mute.'
  ].join('\n');

  function sysBase(what) {
    return [
      'You are the game code generator inside Tundra Studio. You write complete, polished, playable games as ' + what + '.',
      '',
      'HARD REQUIREMENTS:',
      '1. Output ONLY the code. No markdown fences, no commentary before or after.',
      '2. Fully self-contained and offline: no CDN, no external fonts/images/libraries beyond what is specified.',
      '3. Complete flow: title screen -> play -> game over -> restart (R key or tap). Show score and best score.',
      '4. Polish: juice (particles, shake, flash), small beeps (respect an M mute key), smooth difficulty curve. Clean readable code with comments — the user will edit it by hand.',
      '5. IMMEDIATELY AFTER the first line, include exactly one metadata comment in the language\'s own comment syntax:',
      '   __META__',
      '6. Make it fun immediately. Base the game entirely on the user prompt: genre, mood, palette, difficulty, theme.'
    ].join('\n');
  }

  var SYS_GEN_JS = sysBase('ONE self-contained HTML document (HTML/CSS/JS)').replace('__META__', META_JS) + [
    '',
    'HTML-MODE SPECIFICS:',
    '- The document must run from a double-clicked file with zero dependencies. Inline everything. Canvas game, logical size 800x450 (letterbox to fit).',
    '- requestAnimationFrame loop with delta time. Keyboard AND pointer/touch. Guard localStorage with try/catch.',
    '- Near the end, include this screenshot bridge EXACTLY as-is (used by the studio for store media):',
    BRIDGE,
    'Optionally define window.tundraShot = function(state){...} returning a data URL ("title"|"play"|"over") to stage nicer screenshots.'
  ].join('\n');

  function sysGenScript(langName, metaLine) {
    return sysBase('ONE source file of ' + langName + ' (no HTML, no markdown — just the program)')
      .replace('__META__', metaLine) + '\n\n' + API_REF + '\n\n' +
      'SCRIPT-MODE SPECIFICS:\n' +
      '- Output ONLY the ' + langName + ' source file contents.\n' +
      '- Define the hooks as plain top-level functions: init(), update(dt), draw(), optional demo(name).\n' +
      '- The metadata comment must be the very first line of the file.\n' +
      '- Nothing else is needed: the studio wraps your file with the runtime, title/HUD overlays and the store bridge.';
  }

  function sysEdit(lang) {
    var names = { js: 'an HTML/CSS/JS document', py: 'a Python source file', lua: 'a Lua source file' };
    return [
      'You are a senior game developer working inside Tundra Studio. The user gives you ' + (names[lang] || names.js) + ' and a change request.',
      'Apply the change thoroughly and return the COMPLETE revised code — never a diff, never fragments.',
      '',
      'RULES:',
      '1. Output ONLY the full code. No markdown fences, no commentary.',
      '2. Keep it self-contained and offline. Keep code readable and commented.',
      "3. Preserve the user's unrelated code and style. Keep the TUNDRA_META comment (update it only if the change affects title/desc/tags/palette/hint).",
      '4. Keep the game playable end-to-end (title -> play -> game over -> restart).',
      lang === 'js' ? '5. Keep the tundra-game screenshot bridge working.' : '5. Keep the init/update/draw hooks and the Tundra API conventions intact.'
    ].join('\n');
  }

  /* ---------- extraction ---------- */
  function stripFences(t) {
    t = String(t || '').replace(/^\uFEFF/, '').trim();
    var fence = t.match(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/);
    if (fence) return fence[1].trim();
    return t.replace(/^```[a-zA-Z]*[ \t]*\r?\n?/, '').replace(/```[ \t]*$/, '').trim();
  }

  function extractDoc(text) {           // HTML mode: slice out the document
    var t = stripFences(text);
    var di = t.search(/<!doctype/i), xi = t.search(/<html/i);
    var start = di >= 0 ? di : xi;
    if (start >= 0) {
      var end = t.search(/<\/html\s*>/i);
      return (end >= 0 ? t.slice(start, end + t.slice(end).indexOf('>') + 1) : t.slice(start)).trim();
    }
    return t;
  }

  function extractSource(text) {        // script modes: whole program
    return stripFences(text);
  }

  function extractMeta(code) {
    var m = String(code || '')
      .match(/<!--\s*TUNDRA_META\s*(\{[\s\S]*?\})\s*-->/)
      || String(code || '').match(/^[ \t]*#[ \t]*TUNDRA_META[ \t]*(\{[^\n]*\})[^\n]*/m)
      || String(code || '').match(/--[ \t]*TUNDRA_META[ \t]*(\{[^\n]*\})[^\n]*/);
    if (!m) return null;
    try {
      var j = JSON.parse(m[1]);
      return j && typeof j === 'object' ? j : null;
    } catch (e) { return null; }
  }

  function titleOf(code) {
    var m = String(code || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? m[1].trim().slice(0, 60) : '';
  }

  /* ---------- api ---------- */
  function chat(cfg, messages) {
    if (!cfg || !cfg.key) return Promise.reject(new Error('No API key — open ⚙ Engine and add one.'));
    var base = String(cfg.base || 'https://api.openai.com/v1').replace(/\/+$/, '');
    return fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', temperature: 0.7, messages: messages })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
          throw new Error(msg.slice(0, 140));
        }
        var content = data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content : '';
        if (!content) throw new Error('Empty response from model');
        return { text: content, usage: data.usage || null, model: data.model || cfg.model };
      });
    });
  }

  function systemFor(lang) {
    if (lang === 'py') return sysGenScript('Python 3', '# TUNDRA_META {"title":"...","blurb":"max 160 chars","desc":"store description","tags":["3","to","6"],"age":"E|E10+|T","price":0,"palette":["#111111","#4FB3E8"],"hint":"controls string"}');
    if (lang === 'lua') return sysGenScript('Lua 5.4', '-- TUNDRA_META {"title":"...","blurb":"max 160 chars","desc":"store description","tags":["3","to","6"],"age":"E|E10+|T","price":0,"palette":["#111111","#4FB3E8"],"hint":"controls string"}');
    return SYS_GEN_JS;
  }

  function finalize(lang, raw) {
    var doc = (lang === 'js') ? extractDoc(raw) : extractSource(raw);
    return { doc: doc, meta: extractMeta(doc), info: null, raw: raw };
  }

  function generate(cfg, prompt, lang) {
    lang = lang || 'js';
    return chat(cfg, [
      { role: 'system', content: systemFor(lang) },
      { role: 'user', content: String(prompt || '').trim() }
    ]).then(function (r) {
      var out = finalize(lang, r.text);
      out.info = r;
      return out;
    });
  }

  function modify(cfg, prompt, code, lang) {
    lang = lang || 'js';
    return chat(cfg, [
      { role: 'system', content: sysEdit(lang) },
      { role: 'user', content: 'CHANGE REQUEST:\n' + String(prompt || '').trim() + '\n\nCURRENT CODE:\n' + String(code || '') }
    ]).then(function (r) {
      var out = finalize(lang, r.text);
      out.info = r;
      return out;
    });
  }

  function test(cfg) {
    if (!cfg || !cfg.key) return Promise.reject(new Error('Enter an API key first'));
    var base = String(cfg.base || 'https://api.openai.com/v1').replace(/\/+$/, '');
    return fetch(base + '/models', {
      headers: { 'Authorization': 'Bearer ' + cfg.key }
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' — check base URL, key and model');
      return true;
    });
  }

  window.LLM = {
    generate: generate,
    modify: modify,
    chat: chat,
    test: test,
    extractDoc: extractDoc,
    extractSource: extractSource,
    extractMeta: extractMeta,
    titleOf: titleOf,
    systemFor: systemFor,
    API_REF: API_REF,
    SYS_GEN_JS: SYS_GEN_JS,
    BRIDGE: BRIDGE
  };
})();
