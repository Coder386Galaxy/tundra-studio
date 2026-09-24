/* ============================================================
   TUNDRA STORE KIT — schema-locked publishing for Tundra Games
   Game object fields match the store's Publish → New Title form:
   id, title, studio, price, date, age, tags, platforms, featured,
   blurb, desc, image, screens, palette, discount  (+ gameHTML ext.)
   Restore JSON shape: { games, news, promos, users?, reviews? }
   ============================================================ */
(function () {
  'use strict';

  const AGES = ['', 'E', 'E10+', 'T', 'M', 'AO'];
  const PLATFORMS = ['Windows', 'Mac', 'Linux', 'Browser'];

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtDate(d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function slugId(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + Date.now().toString(36);
  }

  function money(n) { return '$' + (+n).toFixed(2); }

  /* ---------- image helpers ---------- */
  function dataURLToCanvas(src, w, h) {
    return new Promise(function (res, rej) {
      const img = new Image();
      img.onload = function () {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, w, h);
        res(c);
      };
      img.onerror = function () { rej(new Error('image load failed')); };
      img.src = src;
    });
  }

  // compress any data-URL into a jpeg data-URL at maxW x maxH (keeps store localStorage small)
  function compressDataURL(src, maxW, maxH, q) {
    return dataURLToCanvas(src, maxW, maxH).then(function (c) {
      return c.toDataURL('image/jpeg', q || 0.85);
    }).catch(function () { return src; });
  }

  function fileToDataURL(file) {
    return new Promise(function (res) {
      const r = new FileReader();
      r.onload = function () { res(r.result); };
      r.readAsDataURL(file);
    });
  }

  /* ---------- procedural fallback art (store's own visual language) ---------- */
  function hashS(s) {
    let h = 7;
    for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 2147483647;
    return h || 1;
  }
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  function proceduralArt(title, palette, w, h, seedOff, withTitle) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const a = palette[0] || '#1B1F23', b = palette[1] || '#4FB3E8';
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, a); g.addColorStop(1, b);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const r = rng(hashS(title + '::' + (seedOff || 0)));
    for (let i = 0; i < 8; i++) {
      x.beginPath();
      x.arc(r() * w, r() * h, 40 + r() * 160, 0, 6.283);
      x.fillStyle = r() > 0.5 ? b : '#F5FAFF';
      x.globalAlpha = 0.08 + r() * 0.15;
      x.fill();
    }
    x.globalAlpha = 1;
    if (withTitle) {
      x.fillStyle = 'rgba(5,8,12,0.35)';
      x.fillRect(0, h * 0.62, w, h * 0.38);
      x.fillStyle = '#F5FAFF';
      x.font = '800 ' + Math.round(h / 8) + 'px system-ui, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(title, w / 2, h * 0.78, w * 0.9);
    }
    return c.toDataURL('image/jpeg', 0.85);
  }

  /* ---------- field validation (mirrors the store's publishGame) ---------- */
  function validate(fields) {
    const errs = [];
    if (!fields.title || !fields.title.trim()) errs.push('Title is required');
    if ((fields.blurb || '').length > 160) errs.push('Short description must be ≤ 160 chars');
    if (!(fields.price >= 0)) errs.push('Price must be ≥ 0 (0 = free)');
    if (!fields.date || !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) errs.push('Release date must be YYYY-MM-DD');
    if (AGES.indexOf(fields.age) < 0) errs.push('Age rating must be one of ' + AGES.join('/'));
    if (!(fields.platforms || []).every(p => PLATFORMS.indexOf(p) >= 0)) errs.push('Platforms must be Windows/Mac/Linux/Browser');
    return errs;
  }

  /* ---------- build the store game object ---------- */
  function buildGameObject(fields, gameHTML) {
    const now = today();
    return {
      id: fields.id || slugId(fields.title || 'game'),
      title: fields.title || 'Untitled',
      studio: fields.studio || 'Tundra Publishing',
      price: Math.max(0, +fields.price || 0),
      date: fields.date || now,
      age: fields.age || '',
      tags: Array.from(new Set((fields.tags || []).map(t => String(t).trim()).filter(Boolean))).slice(0, 8),
      platforms: (fields.platforms || []).slice(),
      featured: !!fields.featured,
      blurb: String(fields.blurb || '').trim().slice(0, 160),
      desc: String(fields.desc || '').trim(),
      image: fields.image || null,          // data-URL (jpeg/png)
      screens: (fields.screens || []).slice(0, 6), // data-URLs
      palette: fields.palette || ['#1B1F23', '#4FB3E8'],
      discount: 0,
      // extension fields — ignored by the store UI, preserved in catalog JSON
      gameHTML: gameHTML || null,
      code: gameHTML || null,          // official: in-store player runs g.code via srcdoc
      codeUpdated: new Date().toISOString(),
      madeWith: 'Tundra Studio'
    };
  }

  function launchNews(game) {
    return {
      date: today(),
      title: game.title + ' is out now on Tundra Games',
      body: (game.blurb || 'A new title') + ' Built with Tundra Studio — the AI game forge for Tundra Publishing. Grab it from the store page and tell us what you think in the reviews.',
      game: game.id
    };
  }

  /* ---------- packages ---------- */
  function buildPackage(game) {
    return {
      games: [game],
      news: [launchNews(game)],
      promos: {}
      // users / reviews intentionally omitted: store's Restore keeps existing when absent
    };
  }

  function mergeCatalog(catalog, game, news) {
    const out = {
      games: Array.isArray(catalog.games) ? catalog.games.slice() : [],
      news: Array.isArray(catalog.news) ? catalog.news.slice() : [],
      promos: catalog.promos || {}
    };
    if (catalog.users) out.users = catalog.users;
    if (catalog.reviews) out.reviews = catalog.reviews;
    const i = out.games.findIndex(g => g.id === game.id);
    if (i >= 0) out.games[i] = game; else out.games.push(game);
    if (news !== false) out.news.unshift(news || launchNews(game));
    return out;
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function downloadDataURL(filename, dataURL) {
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 1000);
  }

  /* ---------- copy list for the store's New Title form ---------- */
  function copyRows(game) {
    return [
      { k: 'Title', v: game.title },
      { k: 'Developer', v: game.studio },
      { k: 'Price USD', v: String(game.price) },
      { k: 'Release date', v: game.date },
      { k: 'Age rating', v: game.age || '(none)' },
      { k: 'Tags', v: game.tags.join(', ') },
      { k: 'Platforms', v: game.platforms.join(' · ') || '(none)' },
      { k: 'Short desc', v: game.blurb },
      { k: 'Full desc', v: game.desc.replace(/\n+/g, ' ⏎ ').slice(0, 200) + (game.desc.length > 200 ? '…' : '') },
      { k: 'Color A', v: game.palette[0] },
      { k: 'Color B', v: game.palette[1] },
      { k: 'Featured', v: game.featured ? 'yes' : 'no' }
    ];
  }

  /* ---------- direct publish: same-site localStorage bridge ----------
     Tundra Studio and Tundra Games both live at coder386galaxy.github.io,
     so on that origin the studio can write the store's own keys directly. */
  const STORE_HOST = 'coder386galaxy.github.io';
  const STORE_URL = 'https://coder386galaxy.github.io/tundra-studio/store/';

  function lsRead(k, d) {
    try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; }
    catch (e) { return d; }
  }

  function directStatus() {
    const host = (typeof location !== 'undefined' && location.hostname) || '';
    return {
      available: host === STORE_HOST,
      host: host,
      storeHost: STORE_HOST,
      storeUrl: STORE_URL,
      count: lsRead('tundra_games', []).length
    };
  }

  function directPublish(game, news) {
    const games = lsRead('tundra_games', []);
    const i = games.findIndex(g => g.id === game.id);
    if (i >= 0) games[i] = game; else games.push(game);
    localStorage.setItem('tundra_games', JSON.stringify(games));
    const n = lsRead('tundra_news', []);
    n.unshift(news || launchNews(game));
    localStorage.setItem('tundra_news', JSON.stringify(n));
    return { count: games.length, updated: i >= 0 };
  }

  window.StoreKit = {
    AGES, PLATFORMS, today, fmtDate, money, STORE_HOST, STORE_URL,
    compressDataURL, fileToDataURL, proceduralArt,
    validate, buildGameObject, buildPackage, mergeCatalog,
    launchNews, download, downloadDataURL, copyRows,
    directStatus, directPublish
  };
})();
