// store-compat: proves Tundra Studio's publish output matches the LIVE Tundra Games store.
// Fetches the store source from GitHub (falls back to ../research/store-live.html offline).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LIVE_URL = 'https://raw.githubusercontent.com/Coder386Galaxy/Tudra-Publishing/main/index.html';
const FALLBACK = path.join(__dirname, '..', 'research', 'store-live.html');

let fails = 0;
const fail = (m) => { fails++; console.log('FAIL:', m); };
const ok = (m) => console.log('ok:', m);

function loadStoreKit() {
  const sb = { window: {}, Math, JSON, Date, console, Array, Object, String, Number, Set, Promise, RegExp, document: {}, location: { hostname: 'x.test' } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'storekit.js'), 'utf8'), sb);
  return sb.window.StoreKit;
}

function runChecks(src, SK, origin) {
  console.log('— store source:', origin, '(' + src.length + ' bytes)');

  // 1) storage keys
  for (const k of ["games:'tundra_games'", "news:'tundra_news'"]) {
    if (!src.includes(k)) fail('store LS key changed: ' + k);
  }

  // 2) every game field the store READS must be produced by buildGameObject
  const reads = new Set();
  for (const m of src.matchAll(/\bg\.([a-zA-Z_]+)/g)) reads.add(m[1]);
  const game = SK.buildGameObject({
    title: 'T', studio: 'S', price: 1, date: SK.today(), age: 'E',
    tags: ['a'], platforms: ['Windows'], featured: true, blurb: 'b', desc: 'd',
    image: 'img', screens: ['s'], palette: ['#111111', '#222222']
  }, '<html>g</html>');
  for (const f of reads) {
    if (!(f in game)) fail('store reads g.' + f + ' but buildGameObject does not provide it');
  }
  ok('all ' + reads.size + ' game fields the store reads are provided');

  // 3) publishGame form fields ⊆ our object (parse the data={...} literal)
  const pm = src.match(/const data=\{([\s\S]*?)\};/);
  if (!pm) fail('could not locate publishGame data literal');
  else {
    const keys = new Set();
    for (const m of pm[1].matchAll(/([a-zA-Z_]+)\s*[:,}]/g)) keys.add(m[1]);
    for (const k of ['title', 'studio', 'price', 'date', 'age', 'tags', 'platforms', 'featured', 'blurb', 'desc', 'image', 'screens', 'palette']) {
      if (!keys.has(k)) fail('publishGame field missing from store parse: ' + k);
      if (!(k in game)) fail('publishGame field missing from our object: ' + k);
    }
    ok('publishGame form fields match buildGameObject');
  }

  // 4) importData semantics: shape + users/reviews preserved when absent
  if (!/if\(!Array\.isArray\(d\.games\)\)throw 0/.test(src)) fail('importData games[] guard not found');
  if (!/if\(d\.users\)localStorage\.setItem\(LS\.users/.test(src)) fail('importData no longer preserves users when absent');
  if (!/if\(d\.reviews\)localStorage\.setItem\('tundra_reviews'/.test(src)) fail('importData no longer preserves reviews when absent');
  ok('importData Restore semantics match our package shape');

  // 5) exportData shape (what merge expects)
  if (!src.includes('{games:GAMES,news:NEWS,promos:PROMOS,users:USERS,reviews:REVIEWS}')) fail('exportData shape changed');
  ok('exportData shape matches mergeCatalog input');

  // 6) deep link
  if (!/#game=\(.\+\)/.test(src) && !src.includes("#game='+id") && !src.includes("#game=")) fail('#game= deep link missing');
  ok('#game= deep link supported');

  // 7) enums
  if (!src.includes("PLATFORMS=['Windows','Mac','Linux','Browser']")) fail('PLATFORMS changed');
  if (!src.includes("AGES=['','E','E10+','T','M','AO']")) fail('AGES changed');
  ok('age/platform enums match');

  // 8) functional round-trip: our package -> store's exact importData statements
  const pkg = SK.buildPackage(game);
  const store = { tundra_users: JSON.stringify({ keep: true }), tundra_reviews: JSON.stringify({ r: 1 }), tundra_games: null, tundra_news: null, tundra_promos: null };
  (function importDataSim(d) {
    if (!Array.isArray(d.games)) throw new Error('reject');
    store.tundra_games = JSON.stringify(d.games);
    store.tundra_news = JSON.stringify(d.news || []);
    store.tundra_promos = JSON.stringify(d.promos || {});
    if (d.users) store.tundra_users = JSON.stringify(d.users);
    if (d.reviews) store.tundra_reviews = JSON.stringify(d.reviews);
  })(JSON.parse(JSON.stringify(pkg)));
  const back = JSON.parse(store.tundra_games);
  if (back.length !== 1 || back[0].id !== game.id || back[0].title !== 'T') fail('round-trip lost the game');
  if (!JSON.parse(store.tundra_news)[0].body) fail('round-trip lost launch news');
  if (!JSON.parse(store.tundra_users).keep) fail('Restore should preserve existing users');
  if (!JSON.parse(store.tundra_reviews).r) fail('Restore should preserve existing reviews');
  ok('package -> store Restore round-trip is lossless');

  // 9) direct publish bridge writes the store's own keys
  const mem = {};
  const sbD = {
    window: {}, Math, JSON, Date, console, Array, Object, String, Number, Set, Promise, RegExp,
    document: {}, location: { hostname: SK.STORE_HOST },
    localStorage: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } }
  };
  vm.createContext(sbD);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'storekit.js'), 'utf8'), sbD);
  const SK2 = sbD.window.StoreKit;
  if (!SK2.directStatus().available) fail('directStatus should be available on store host');
  const r = SK2.directPublish(game, SK2.launchNews(game));
  if (r.count !== 1) fail('directPublish count wrong');
  const dGames = JSON.parse(mem.tundra_games);
  if (dGames[0].title !== 'T' || !Array.isArray(JSON.parse(mem.tundra_news))) fail('directPublish wrote wrong keys');
  const r2 = SK2.directPublish(game);
  if (r2.count !== 1 || !r2.updated) fail('directPublish should update in place');
  ok('direct publish writes the store catalog keys correctly');
}

(async () => {
  const SK = loadStoreKit();
  let src = null, origin = '';
  try {
    const res = await fetch(LIVE_URL, { signal: AbortSignal.timeout(10000) });
    if (res.ok) { src = await res.text(); origin = 'LIVE ' + LIVE_URL; }
  } catch (e) { /* offline */ }
  if (!src && fs.existsSync(FALLBACK)) { src = fs.readFileSync(FALLBACK, 'utf8'); origin = 'fallback ' + FALLBACK; }
  if (!src) { console.log('SKIP: no store source available'); process.exit(0); }
  runChecks(src, SK, origin);
  console.log(fails ? `\n${fails} FAILURES` : '\nSTORE COMPAT: ALL PASS');
  process.exit(fails ? 1 : 0);
})();
