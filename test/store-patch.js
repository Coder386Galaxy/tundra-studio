// store-patch test: verifies the ready-to-upload store build
// (download-only delivery + Tundra Checkout) and that build.py stays reproducible.
// Run from the repo root: node test/store-patch.js
const fs = require('fs');
const vm = require('vm');

let fails = 0;
const fail = (msg) => { fails++; console.log('FAIL:', msg); };

const BUILD = 'store-patch/index.html';
const SRC = 'store-patch/store-source.html';

if (!fs.existsSync(BUILD) || !fs.existsSync(SRC)) {
  console.log('skip: store-patch/ build not present');
  process.exit(0);
}

const s = fs.readFileSync(BUILD, 'utf8');
const src = fs.readFileSync(SRC, 'utf8');

/* ---- 1) download-only delivery ---- */
if (!s.includes('>Download</button>')) fail('store page missing Download button');
if (!s.includes("?'Stop':'Download'")) fail('library missing Download button');
if (!s.includes('function dl(g)')) fail('dl() helper missing');
if (!s.includes('dl(g);toast(`Downloaded')) fail('launch does not download the game');
if (!s.includes('Download ${esc(x.title)}')) fail('receipt missing per-game Download buttons');

/* ---- 2) Tundra Checkout addon ---- */
if (!s.includes('TundraCheckout')) fail('checkout addon missing');
if (!s.includes('Add funds')) fail('checkout entry points missing');

/* ---- 3) HTML sanity ---- */
const opens = (s.toLowerCase().match(/<script/g) || []).length;
const closes = (s.toLowerCase().match(/<\/script>/g) || []).length;
if (opens !== closes) fail('script tags unbalanced: ' + opens + ' open / ' + closes + ' close');
if (!s.trimEnd().toLowerCase().endsWith('</html>')) fail('html tail broken');

/* ---- 4) build.py anchors stay reproducible ---- */
const anchors = [
  ['>Play</button>', 'detail label'],
  ["?'Stop':'Play'", 'library label'],
  ['function play(id){', 'play() definition'],
  ['save();toast(`Launching ${g.title}`);renderLibrary();', 'play() body'],
  ['Purchase complete', 'purchase modal']
];
for (const [key, label] of anchors) {
  const n = src.split(key).length - 1;
  if (n !== 1) fail('build anchor "' + label + '" occurs ' + n + 'x in store-source.html (want 1)');
}

/* ---- 5) inline scripts compile ---- */
const blocks = [];
const re = /<script>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(s))) blocks.push(m[1]);
if (blocks.length !== 2) fail('inline script blocks: ' + blocks.length + ' (want 2: store + addon)');
blocks.forEach((b, i) => {
  try { new vm.Script(b, { filename: 'store-block-' + i + '.js' }); }
  catch (e) { fail('script block ' + i + ' syntax: ' + e.message); }
});

console.log(fails ? 'STORE PATCH: ' + fails + ' FAIL' : 'STORE PATCH: ALL PASS');
process.exit(fails ? 1 : 0);
