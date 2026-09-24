// store-patch test: verifies the ready-to-upload store build
// (download-gate -> in-store player + Tundra Checkout with payment)
// and that build.py stays reproducible.
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

/* ---- 1) games load for real: download gate -> player ---- */
if (!s.includes('TundraStore.btns')) fail('library buttons missing');
if (!s.includes('TundraStore.detailBtn')) fail('detail button missing');
if (!s.includes('function install(id)')) fail('install (download gate) missing');
if (!s.includes('function launch(id)')) fail('launch missing');
if (!s.includes('press Play to load it')) fail('download-gate toast missing');
if (!s.includes("createElement('iframe')")) fail('game player iframe missing');
if (!s.includes('allow-scripts allow-same-origin')) fail('player sandbox missing');
if (!s.includes('function play(id){return (window.TundraStore')) fail('play() does not delegate to player');

/* ---- 2) no free money: instant top-ups must be gone ---- */
if (s.includes('onclick="addFunds(')) fail('instant addFunds buttons still present');
if ((s.match(/onclick="TundraCheckout\.open\(/g) || []).length !== 5) fail('preset buttons must route through checkout');

/* ---- 3) checkout requires payment details ---- */
if (!s.includes('TundraCheckout')) fail('checkout addon missing');
if (!s.includes('Name on payment method')) fail('payment details form missing');
if (!s.includes('function payValid()')) fail('payment validation missing');
if (!s.includes('CVC')) fail('CVC field missing');

/* ---- 3b) real payment brands (no fake companies) ---- */
if (s.includes('Tundra Pay') || s.includes('Frost Card') || s.includes('Snowbank') || s.includes('PayPuffin')) fail('fake payment brands still present');
if (!s.includes("name: 'Visa'") || !s.includes("name: 'Mastercard'") || !s.includes("name: 'American Express'") || !s.includes("name: 'PayPal'")) fail('real payment brands missing');

/* ---- 4) HTML sanity ---- */
// NOTE: the store embeds <script> tags inside JS template strings (game srcdoc),
// so naive open/close balance is meaningless — require a real close after the last open.
if (!s.trimEnd().toLowerCase().endsWith('</html>')) fail('html tail broken');
if (s.toLowerCase().lastIndexOf('</script>') <= s.toLowerCase().lastIndexOf('<script')) fail('no real </script> after last <script');

/* ---- 5) build.py anchors stay reproducible ---- */
const anchors = [
  ['display:flex;gap:10px;flex-wrap:wrap', 'library row', 1],
  ['const buyBtn=owned(id)?', 'detail buy button', 1],
  ['onclick="addFunds(', 'instant top-ups', 5],
  ['function play(id){', 'play() definition', 1],
  ['Purchase complete', 'purchase modal', 1]
];
for (const [key, label, want] of anchors) {
  const n = src.split(key).length - 1;
  if (n !== want) fail('build anchor "' + label + '" occurs ' + n + 'x in store-source.html (want ' + want + ')');
}

/* ---- 6) inline scripts compile ---- */
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
