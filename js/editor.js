/* ============================================================
   TUNDRA EDITOR — a plain, normal code editor.
   Transparent textarea over a highlighted <pre>, line numbers,
   tab/indent, Ctrl+S save, Ctrl+Enter run. No frameworks.
   Languages: 'js' (HTML/JS), 'py' (Python), 'lua' (Lua).
   ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var KW = {
    js: 'var|let|const|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|try|catch|finally|typeof|instanceof|null|true|false|undefined|async|await|in|of|delete|void',
    py: 'def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|lambda|True|False|None|not|in|is|and|or|pass|break|continue|global|nonlocal|yield|raise|assert|del',
    lua: 'local|function|end|if|then|else|elseif|for|while|do|return|nil|true|false|and|or|not|repeat|until|in|break'
  };

  function buildRE(lang) {
    var kw = KW[lang] || KW.js;
    var com;
    if (lang === 'py') com = '(#[^\\n]*)';
    else if (lang === 'lua') com = '(--\\[\\[[\\s\\S]*?\\]\\]|--[^\\n]*)';
    else com = '(&lt;!--[\\s\\S]*?--&gt;|/\\*[\\s\\S]*?\\*/|//[^\\n]*)';
    return new RegExp([
      com,                                                     // 1 comments
      '("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\')', // 2 strings
      lang === 'js' ? '(&lt;/?[A-Za-z][A-Za-z0-9-]*(?=[\\s/&])|/?&gt;)' : '(__NOTAGS__)', // 3 tags
      '\\b(' + kw + ')\\b',                                     // 4 keywords
      '\\b(\\d+(?:\\.\\d+)?)\\b'                                // 5 numbers
    ].join('|'), 'g');
  }

  var RES = { js: buildRE('js'), py: buildRE('py'), lua: buildRE('lua') };
  var LANG = 'js';

  function highlight(src) {
    var re = RES[LANG] || RES.js;
    re.lastIndex = 0;
    return esc(src).replace(re, function (m, com, str, tag, kw, num) {
      if (com) return '<span class="t-com">' + m + '</span>';
      if (str) return '<span class="t-str">' + m + '</span>';
      if (tag && tag !== '__NOTAGS__') return '<span class="t-tag">' + m + '</span>';
      if (kw) return '<span class="t-kw">' + m + '</span>';
      if (num) return '<span class="t-num">' + m + '</span>';
      return m;
    });
  }

  function setLanguage(lang) {
    LANG = KW[lang] ? lang : 'js';
  }

  /* opts: { ta, gutter, hl, onRun, onSave, onChange } */
  function mount(opts) {
    var ta = opts.ta, gutter = opts.gutter, hl = opts.hl, code = hl.querySelector('code');
    var silent = false;

    function refresh() {
      var v = ta.value;
      code.innerHTML = highlight(v) + '\n';
      var lines = v.split('\n').length;
      var g = '';
      for (var i = 1; i <= lines; i++) g += i + '\n';
      gutter.textContent = g;
      if (opts.onChange && !silent) opts.onChange();
    }

    function syncScroll() {
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
      gutter.scrollTop = ta.scrollTop;
    }

    ta.addEventListener('input', refresh);
    ta.addEventListener('scroll', syncScroll);

    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var v = ta.value, s = ta.selectionStart, t = ta.selectionEnd;
        if (s === t) {
          ta.value = v.slice(0, s) + '  ' + v.slice(t);
          ta.selectionStart = ta.selectionEnd = s + 2;
        } else {
          var block = v.slice(s, t);
          var out = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ');
          ta.value = v.slice(0, s) + out + v.slice(t);
          ta.selectionStart = s;
          ta.selectionEnd = s + out.length;
        }
        refresh();
        return;
      }
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); if (opts.onRun) opts.onRun(); return; }
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (opts.onSave) opts.onSave(); return; }
    });

    return {
      getValue: function () { return ta.value; },
      setValue: function (v) {
        silent = true;
        ta.value = v;
        silent = false;
        refresh();
        ta.scrollTop = 0; syncScroll();
      },
      setLanguage: function (lang) {
        setLanguage(lang);
        refresh();
      },
      refresh: refresh,
      focus: function () { ta.focus(); }
    };
  }

  window.TundraEditor = { mount: mount, highlight: highlight, setLanguage: setLanguage };
})();
