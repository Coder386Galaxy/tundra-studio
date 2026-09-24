/* ============================================================
   TUNDRA STORE ADDON — game player + download gate + checkout
   for the Tundra Games store.

   1. GAMES LOAD FOR REAL: Download the game once (installs it),
      then Play opens it in the store's player. You have to
      download before you can play.
   2. NO FREE MONEY: every wallet top-up goes through Tundra
      Checkout (amount -> payment details -> review -> receipt).
      SIMULATION ONLY — fictional payment methods, no real
      payment is ever processed.
   ============================================================ */
(function () {
  'use strict';

  /* ================= TUNDRA STORE: download -> play ================= */

  function st() { return (typeof S !== 'undefined') ? S : null; }
  function installedMap() {
    var s = st();
    if (!s) return {};
    if (!s.installed) s.installed = {};
    return s.installed;
  }
  function isInstalled(id) { return !!installedMap()[id]; }
  function isPlaying(id) {
    try { return !!(typeof session !== 'undefined' && session && session.id === id); } catch (e) { return false; }
  }
  function refresh() {
    try { if (typeof renderLibrary === 'function') renderLibrary(); } catch (e) {}
  }

  function dl(g) {
    if (!g) return;
    var html = g.gameHTML || ('<!DOCTYPE html><meta charset="utf-8"><title>' + esc(g.title) + '</title><h1>' + esc(g.title) + '</h1><p>This listing has no playable build yet - publish one from Tundra Studio.</p>');
    var slug = (g.title || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = slug + '.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function install(id) {
    var g = byId(id);
    if (!g) return;
    dl(g);
    installedMap()[id] = Date.now();
    save();
    toast('Downloaded ' + g.title + ' - press Play to load it');
    refresh();
    try { if (typeof go === 'function') { var d = document.getElementById('view-detail'); if (d && d.classList.contains('active')) go('detail', id); } } catch (e) {}
  }

  function launch(id) {
    var g = byId(id);
    if (!g) return;
    if (isPlaying(id)) { closePlayer(); return; }
    if (!isInstalled(id)) { install(id); return; }
    if (!g.gameHTML) {
      toast('This listing has no playable build yet - publish one from Tundra Studio');
      return;
    }
    try { if (typeof endSession === 'function' && session) endSession(); } catch (e) {}
    session = { id: id, start: Date.now() };
    S.lastPlayed[id] = new Date().toISOString();
    save();
    openPlayer(g);
    refresh();
    toast('Loaded ' + g.title);
  }

  function openPlayer(g) {
    closePlayer();
    var shade = document.createElement('div');
    shade.id = 'tplayerShade';
    shade.style.cssText = 'position:fixed;inset:0;background:rgba(5,8,12,.86);z-index:1000;display:flex;align-items:center;justify-content:center;padding:14px';
    var box = document.createElement('div');
    box.style.cssText = 'width:min(1100px,96vw);height:min(90vh,700px);background:#0a0d10;border:1px solid #2a4a66;border-radius:10px;overflow:hidden;display:flex;flex-direction:column';
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 12px;background:#132a40;color:#e5edf3;font:600 13px system-ui,sans-serif';
    bar.innerHTML = '<span style="font-size:15px">&#9654;</span><b style="flex:1">' + esc(g.title) + '</b><span style="color:#6c8aa6;font-size:11px">session running</span>';
    var x = document.createElement('button');
    x.textContent = 'Close (Esc)';
    x.style.cssText = 'background:#2a4a66;color:#e5edf3;border:0;border-radius:5px;padding:6px 12px;font:600 12px system-ui,sans-serif;cursor:pointer';
    x.onclick = function () { closePlayer(); };
    bar.appendChild(x);
    var ifr = document.createElement('iframe');
    ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    ifr.style.cssText = 'flex:1;border:0;background:#0a0d10;width:100%';
    ifr.srcdoc = g.gameHTML;
    box.appendChild(bar);
    box.appendChild(ifr);
    shade.appendChild(box);
    document.body.appendChild(shade);
  }

  function closePlayer() {
    try {
      var s = document.getElementById('tplayerShade');
      if (s) s.remove();
    } catch (e) {}
    try { if (typeof endSession === 'function' && session) endSession(); } catch (e) {}
    refresh();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('tplayerShade')) closePlayer();
  });

  window.TundraStore = {
    install: install,
    launch: launch,
    closePlayer: closePlayer,
    btns: function (g) {
      if (!g) return '';
      var a = 'TundraStore.launch(\'' + g.id + '\')';
      var d = 'TundraStore.install(\'' + g.id + '\')';
      var main = isPlaying(g.id)
        ? '<button class="btn btn-danger" onclick="' + a + '">Stop</button>'
        : isInstalled(g.id)
          ? '<button class="btn btn-primary" onclick="' + a + '">Play</button><button class="btn btn-ghost" onclick="' + d + '">Re-download</button>'
          : '<button class="btn btn-primary" onclick="' + d + '">Download</button>';
      return '<div style="display:flex;gap:10px;flex-wrap:wrap">' + main +
        '<button class="btn btn-ghost" onclick="go(\'detail\',\'' + g.id + '\')">Store Page</button>' +
        '<button class="btn btn-danger" onclick="refund(\'' + g.id + '\')">Refund</button></div>';
    },
    detailBtn: function (id) {
      if (isPlaying(id)) return '<button class="btn btn-danger block" onclick="TundraStore.launch(\'' + id + '\')">Stop</button>';
      if (isInstalled(id)) return '<button class="btn btn-primary block" onclick="TundraStore.launch(\'' + id + '\')">Play</button>';
      return '<button class="btn btn-primary block" onclick="TundraStore.install(\'' + id + '\');go(\'detail\',\'' + id + '\')">Download</button>';
    }
  };

  /* ================= TUNDRA CHECKOUT (payment required) ================= */

  var PRESETS = [5, 10, 25, 50, 100];
  var METHODS = [
    { id: 'tundra', name: 'Tundra Pay', icon: '💳', note: 'Instant — wallet card' },
    { id: 'frost', name: 'Frost Card', icon: '❄️', note: 'Simulated credit card' },
    { id: 'snowbank', name: 'Snowbank Transfer', icon: '🏦', note: 'Simulated bank transfer' },
    { id: 'puffin', name: 'PayPuffin', icon: '🐧', note: 'Simulated e-wallet' }
  ];

  var stc = { step: 0, amount: 10, method: 'tundra', pay: { name: '', num: '', exp: '', cvc: '' }, order: null, pendingCart: false };
  var origCheckout = null;

  function moneyFmt(n) {
    try { return money(n); } catch (e) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function methodById(id) {
    for (var i = 0; i < METHODS.length; i++) if (METHODS[i].id === id) return METHODS[i];
    return METHODS[0];
  }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function last4() { var d = digits(stc.pay.num); return d.slice(-4) || '····'; }

  function injectStyle() {
    if (document.getElementById('tchkStyle')) return;
    var css = [
      '.tchk{font-family:system-ui,sans-serif;color:#c7d5e0;text-align:left}',
      '.tchk-head{display:flex;align-items:center;gap:10px;margin:0 0 12px}',
      '.tchk-logo{font-size:22px}',
      '.tchk h3{margin:0;color:#e5edf3}',
      '.tchk-steps{display:flex;gap:6px;margin:0 0 14px;font-size:11px;flex-wrap:wrap}',
      '.tchk-step{padding:5px 10px;border-radius:4px;background:#1c2a3a;color:#6c8aa6}',
      '.tchk-step.on{background:#66c0f4;color:#0b1a28;font-weight:700}',
      '.tchk-amt{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}',
      '.tchk-amt button{padding:14px 6px;font-size:17px;font-weight:800;border:1px solid #2a4a66;border-radius:6px;background:#183048;color:#a4d007;cursor:pointer}',
      '.tchk-amt button:hover{border-color:#a4d007}',
      '.tchk-amt button.on{background:#a4d007;color:#0b1a28;border-color:#a4d007}',
      '.tchk-row{display:flex;gap:8px;margin-bottom:10px}',
      '.tchk-row input{flex:1;padding:10px;border-radius:6px;border:1px solid #2a4a66;background:#0f2033;color:#e5edf3;font-size:15px}',
      '.tchk-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}',
      '.tchk-field{margin-bottom:8px}',
      '.tchk-field label{display:block;font-size:11px;color:#6c8aa6;margin-bottom:4px}',
      '.tchk-field input{width:100%;padding:10px;border-radius:6px;border:1px solid #2a4a66;background:#0f2033;color:#e5edf3;font-size:15px;box-sizing:border-box}',
      '.tchk-err{color:#ff8a8a;font-size:12px;margin-bottom:8px}',
      '.tchk-methods{display:grid;gap:8px;margin-bottom:12px}',
      '.tchk-m{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid #2a4a66;border-radius:6px;background:#132a40;cursor:pointer}',
      '.tchk-m:hover{border-color:#66c0f4}',
      '.tchk-m.on{border-color:#66c0f4;background:#183452}',
      '.tchk-m b{color:#e5edf3}',
      '.tchk-m small{color:#6c8aa6;display:block}',
      '.tchk-sum{background:#0f2033;border:1px solid #2a4a66;border-radius:6px;padding:12px;margin-bottom:12px;font-size:14px}',
      '.tchk-sum div{display:flex;justify-content:space-between;padding:3px 0}',
      '.tchk-btn{width:100%;padding:13px;border:0;border-radius:4px;font-size:15px;font-weight:800;cursor:pointer;background:#a4d007;color:#0b1a28}',
      '.tchk-btn:hover{background:#b6e226}',
      '.tchk-btn:disabled{opacity:.5;cursor:default}',
      '.tchk-btn.alt{background:#2a4a66;color:#c7d5e0;margin-top:8px}',
      '.tchk-fine{font-size:11px;color:#6c8aa6;margin-top:10px;text-align:center}',
      '.tchk-receipt{text-align:center;padding:6px 0}',
      '.tchk-receipt .big{font-size:38px;margin-bottom:6px}'
    ].join('\n');
    var stl = document.createElement('style');
    stl.id = 'tchkStyle';
    stl.textContent = css;
    document.head.appendChild(stl);
  }

  function crumbs() {
    var labels = ['1 · Amount', '2 · Payment', '3 · Review', '4 · Receipt'];
    var h = '<div class="tchk-steps">';
    for (var i = 0; i < labels.length; i++) h += '<span class="tchk-step' + (i === stc.step ? ' on' : '') + '">' + labels[i] + '</span>';
    return h + '</div>';
  }
  function head(title) {
    return '<div class="tchk-head"><span class="tchk-logo">❄️</span><h3>' + title + '</h3></div>';
  }
  function fine() {
    return '<div class="tchk-fine">Tundra Checkout — payment is simulated for this demo store.<br>No real payment method is charged.</div>';
  }

  function stepAmount() {
    var h = head('Add funds to your Tundra Wallet') + crumbs() + '<div class="tchk-amt">';
    for (var i = 0; i < PRESETS.length; i++) {
      h += '<button class="' + (stc.amount === PRESETS[i] ? 'on' : '') + '" onclick="TundraCheckout.pickAmount(' + PRESETS[i] + ')">$' + PRESETS[i] + '</button>';
    }
    h += '<button class="' + (PRESETS.indexOf(stc.amount) < 0 ? 'on' : '') + '" onclick="document.getElementById(\'tchkCustom\').focus()">Custom</button>';
    h += '</div><div class="tchk-row"><input id="tchkCustom" type="number" min="0.5" max="999" step="0.01" placeholder="Custom amount ($)" value="' + (PRESETS.indexOf(stc.amount) < 0 ? stc.amount : '') + '" onchange="TundraCheckout.setCustom(this.value)" oninput="TundraCheckout.setCustom(this.value, true)"></div>';
    h += '<button class="tchk-btn" onclick="TundraCheckout.next()">Continue</button>';
    h += '<button class="tchk-btn alt" onclick="closeModal()">Cancel</button>' + fine();
    return h;
  }

  function stepPayment() {
    var h = head('Add funds · ' + moneyFmt(stc.amount)) + crumbs() + '<div class="tchk-methods">';
    for (var i = 0; i < METHODS.length; i++) {
      var m = METHODS[i];
      h += '<div class="tchk-m' + (stc.method === m.id ? ' on' : '') + '" onclick="TundraCheckout.pickMethod(\'' + m.id + '\')">' +
        '<span style="font-size:22px">' + m.icon + '</span><span><b>' + m.name + '</b><small>' + m.note + '</small></span></div>';
    }
    h += '</div><div class="tchk-field"><label>Name on payment method</label><input id="tchkName" value="' + esc(stc.pay.name) + '" placeholder="Aurora Player" oninput="TundraCheckout.setPay(\'name\',this.value)"></div>';
    h += '<div class="tchk-field"><label>Number (16 digits — simulated)</label><input id="tchkNum" value="' + esc(stc.pay.num) + '" placeholder="4242 4242 4242 4242" inputmode="numeric" oninput="TundraCheckout.setPay(\'num\',this.value)"></div>';
    h += '<div class="tchk-grid2"><div class="tchk-field" style="margin:0"><label>Expiry</label><input id="tchkExp" value="' + esc(stc.pay.exp) + '" placeholder="MM/YY" oninput="TundraCheckout.setPay(\'exp\',this.value)"></div>';
    h += '<div class="tchk-field" style="margin:0"><label>CVC</label><input id="tchkCvc" value="' + esc(stc.pay.cvc) + '" placeholder="123" inputmode="numeric" oninput="TundraCheckout.setPay(\'cvc\',this.value)"></div></div>';
    h += '<div class="tchk-err" id="tchkErr"></div>';
    h += '<button class="tchk-btn" onclick="TundraCheckout.toReview()">Review order</button>';
    h += '<button class="tchk-btn alt" onclick="TundraCheckout.back()">← Back</button>' + fine();
    return h;
  }

  function payValid() {
    if (stc.pay.name.trim().length < 2) return 'Enter the name on the payment method';
    if (digits(stc.pay.num).length !== 16) return 'Number must be 16 digits (simulated)';
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(stc.pay.exp.trim())) return 'Expiry must look like MM/YY';
    if (digits(stc.pay.cvc).length !== 3) return 'CVC must be 3 digits';
    return '';
  }

  function stepReview() {
    var m = methodById(stc.method);
    var h = head('Review + confirm') + crumbs() + '<div class="tchk-sum">' +
      '<div><span>Adding to</span><b>Tundra Wallet @' + esc(typeof CUR !== 'undefined' ? CUR : 'you') + '</b></div>' +
      '<div><span>Amount</span><b>' + moneyFmt(stc.amount) + '</b></div>' +
      '<div><span>Payment method</span><b>' + m.icon + ' ' + m.name + '</b></div>' +
      '<div><span>Payment details</span><b>' + esc(stc.pay.name.trim()) + ' · ···· ' + last4() + '</b></div>' +
      '<div><span>New balance</span><b>' + moneyFmt(((typeof S !== 'undefined' && S.wallet) || 0) + stc.amount) + '</b></div>' +
      '</div>';
    h += '<button class="tchk-btn" id="tchkPay" onclick="TundraCheckout.confirm()">Pay & add funds · ' + moneyFmt(stc.amount) + '</button>';
    h += '<button class="tchk-btn alt" onclick="TundraCheckout.back()">← Back</button>' + fine();
    return h;
  }

  function stepProcessing() {
    return head('Processing payment…') + crumbs() +
      '<div class="tchk-receipt"><div class="big">⏳</div><p>Charging ' + esc(methodById(stc.method).name) + ' · ···· ' + last4() + '…</p>' +
      '<p style="color:#6c8aa6;font-size:12px">(simulated — nothing real is charged)</p></div>';
  }

  function stepDone() {
    var o = stc.order || {};
    var h = head('Funds added!') + crumbs() + '<div class="tchk-receipt">' +
      '<div class="big">✅</div>' +
      '<p><b>' + moneyFmt(o.amount) + '</b> paid with ' + esc(o.method) + ' · ···· ' + esc(o.last4 || '') + '</p>' +
      '<p>Order <b>' + esc(o.id) + '</b> · New balance <b>' + moneyFmt(o.balance) + '</b></p>' +
      '</div><button class="tchk-btn" onclick="TundraCheckout.done()">Done</button>' + fine();
    return h;
  }

  function render() {
    var body =
      stc.step === 0 ? stepAmount() :
      stc.step === 1 ? stepPayment() :
      stc.step === 2 ? stepReview() :
      stc.step === 3 ? stepDone() : stepProcessing();
    try { showModal('<div class="tchk">' + body + '</div>'); } catch (e) { alert('Tundra Checkout needs the store page'); }
  }

  function credit(n) {
    var used = methodById(stc.method).name;
    try { if (typeof addFunds === 'function') addFunds(n); else throw 0; }
    catch (e) {
      S.wallet = +(S.wallet + n).toFixed(2);
      S.orders.unshift({ date: new Date().toISOString(), items: [{ id: null, title: 'Wallet funds', price: n }], total: 0, method: used });
      try { save(); updateBadges(); } catch (e2) {}
    }
    try { if (S.orders && S.orders[0]) { S.orders[0].method = used; save(); } } catch (e) {}
    try { renderAccount(); } catch (e) {}
    try { var w = document.getElementById('wallet'); if (w) w.textContent = moneyFmt(S.wallet); } catch (e) {}
    return { id: 'TUNDRA-' + Date.now().toString(36).toUpperCase(), amount: n, method: used, last4: last4(), balance: S.wallet };
  }

  window.TundraCheckout = {
    open: function (preset) {
      injectStyle();
      stc.step = 0;
      stc.pendingCart = !!(preset && preset.__cart);
      stc.amount = (preset && !preset.__cart) ? Math.round(preset * 100) / 100 : 10;
      stc.method = 'tundra';
      stc.order = null;
      render();
    },
    pickAmount: function (n) { stc.amount = n; render(); },
    setCustom: function (v, soft) {
      var n = Math.round(parseFloat(v) * 100) / 100;
      if (isFinite(n) && n > 0) {
        stc.amount = n;
        if (!soft) render();
        else {
          try {
            var btns = document.querySelectorAll('.tchk-amt button');
            for (var i = 0; i < btns.length; i++) btns[i].classList.remove('on');
          } catch (e) {}
        }
      }
    },
    pickMethod: function (id) { stc.method = id; render(); },
    setPay: function (k, v) { stc.pay[k] = v; },
    next: function () { stc.step = Math.min(2, stc.step + 1); render(); },
    toReview: function () {
      var err = payValid();
      if (err) {
        var el = document.getElementById('tchkErr');
        if (el) el.textContent = err;
        return;
      }
      stc.step = 2;
      render();
    },
    back: function () { stc.step = Math.max(0, stc.step - 1); render(); },
    confirm: function () {
      stc.step = 4;
      render();
      setTimeout(function () {
        stc.order = credit(stc.amount);
        stc.step = 3;
        render();
      }, 1100);
    },
    done: function () {
      try { closeModal(); } catch (e) {}
      if (stc.pendingCart) {
        stc.pendingCart = false;
        toast('Wallet topped up - completing your purchase');
        if (origCheckout) setTimeout(function () { origCheckout(); }, 350);
      } else {
        toast(moneyFmt(stc.amount) + ' added to wallet');
      }
    }
  };

  function wrapCheckout() {
    origCheckout = window.checkout;
    if (typeof origCheckout !== 'function') return;
    window.checkout = function () {
      try {
        var total = typeof cartTotal === 'function' ? cartTotal() : 0;
        if (total > 0 && S.wallet < total) {
          window.TundraCheckout.open({ __cart: true });
          var shortfall = Math.round((total - S.wallet) * 100) / 100;
          stc.amount = shortfall > 0 ? shortfall : 10;
          render();
          return;
        }
      } catch (e) {}
      return origCheckout.apply(this, arguments);
    };
  }

  function inject() {
    injectStyle();
    try {
      var hdr = document.querySelector('.wallet');
      if (hdr && !document.getElementById('tchkBtnHdr')) {
        var b = document.createElement('div');
        b.className = 'wallet';
        b.id = 'tchkBtnHdr';
        b.style.marginLeft = '8px';
        b.innerHTML = '＋ Add funds';
        b.onclick = function (e) { e.stopPropagation(); window.TundraCheckout.open(); };
        hdr.parentNode.insertBefore(b, hdr.nextSibling);
      }
    } catch (e) {}
    try {
      var acw = document.getElementById('acWallet');
      if (acw && !document.getElementById('tchkBtnAc')) {
        var panel = acw.parentNode;
        var f = document.createElement('div');
        f.style.cssText = 'font-size:11px;color:#7A8B94;margin-top:6px';
        f.textContent = 'Tundra Checkout required — no instant top-ups. Payment is simulated.';
        panel.appendChild(f);
      }
    } catch (e) {}
  }

  wrapCheckout();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
