/* ============================================================
   TUNDRA CHECKOUT — a Steam-style wallet top-up flow for the
   Tundra Games store. SIMULATION ONLY: fictional payment
   methods, no real payment is ever processed or contacted.

   Adds:
   - "Add funds" buttons (header + account wallet panel)
   - 4-step checkout: Amount -> Payment method -> Review -> Receipt
   - Top-up during purchase when the wallet can't cover the cart
     (finishes the purchase automatically after the top-up)
   ============================================================ */
(function () {
  'use strict';

  var PRESETS = [5, 10, 25, 50, 100];
  var METHODS = [
    { id: 'tundra', name: 'Tundra Pay', icon: '💳', note: 'Instant — wallet card' },
    { id: 'frost', name: 'Frost Card', icon: '❄️', note: 'Simulated credit card' },
    { id: 'snowbank', name: 'Snowbank Transfer', icon: '🏦', note: 'Simulated bank transfer' },
    { id: 'puffin', name: 'PayPuffin', icon: '🐧', note: 'Simulated e-wallet' }
  ];

  var st = { step: 0, amount: 10, method: 'tundra', order: null, pendingCart: false };
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

  /* ---------- styles (Steam-flavored, Tundra-branded) ---------- */
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

  /* ---------- steps ---------- */
  function crumbs() {
    var labels = ['1 · Amount', '2 · Payment', '3 · Review', '4 · Receipt'];
    var h = '<div class="tchk-steps">';
    for (var i = 0; i < labels.length; i++) {
      h += '<span class="tchk-step' + (i === st.step ? ' on' : '') + '">' + labels[i] + '</span>';
    }
    return h + '</div>';
  }
  function head(title) {
    return '<div class="tchk-head"><span class="tchk-logo">❄️</span><h3>' + title + '</h3></div>';
  }
  function fine() {
    return '<div class="tchk-fine">Tundra Checkout — Steam-style flow, simulation only.<br>No real payment method is charged.</div>';
  }

  function stepAmount() {
    var h = head('Add funds to your Tundra Wallet') + crumbs() + '<div class="tchk-amt">';
    for (var i = 0; i < PRESETS.length; i++) {
      h += '<button class="' + (st.amount === PRESETS[i] ? 'on' : '') + '" onclick="TundraCheckout.pickAmount(' + PRESETS[i] + ')">$' + PRESETS[i] + '</button>';
    }
    h += '<button class="' + (PRESETS.indexOf(st.amount) < 0 ? 'on' : '') + '" onclick="document.getElementById(\'tchkCustom\').focus()">Custom</button>';
    h += '</div><div class="tchk-row"><input id="tchkCustom" type="number" min="0.5" max="999" step="0.01" placeholder="Custom amount ($)" value="' + (PRESETS.indexOf(st.amount) < 0 ? st.amount : '') + '" onchange="TundraCheckout.setCustom(this.value)" oninput="TundraCheckout.setCustom(this.value, true)"></div>';
    h += '<button class="tchk-btn" onclick="TundraCheckout.next()">Continue</button>';
    h += '<button class="tchk-btn alt" onclick="closeModal()">Cancel</button>' + fine();
    return h;
  }

  function stepMethod() {
    var h = head('Add funds · ' + moneyFmt(st.amount)) + crumbs() + '<div class="tchk-methods">';
    for (var i = 0; i < METHODS.length; i++) {
      var m = METHODS[i];
      h += '<div class="tchk-m' + (st.method === m.id ? ' on' : '') + '" onclick="TundraCheckout.pickMethod(\'' + m.id + '\')">' +
        '<span style="font-size:22px">' + m.icon + '</span><span><b>' + m.name + '</b><small>' + m.note + '</small></span></div>';
    }
    h += '</div><button class="tchk-btn" onclick="TundraCheckout.next()">Review order</button>';
    h += '<button class="tchk-btn alt" onclick="TundraCheckout.back()">← Back</button>' + fine();
    return h;
  }

  function stepReview() {
    var m = methodById(st.method);
    var h = head('Review + confirm') + crumbs() + '<div class="tchk-sum">' +
      '<div><span>Adding to</span><b>Tundra Wallet @' + esc(typeof CUR !== 'undefined' ? CUR : 'you') + '</b></div>' +
      '<div><span>Amount</span><b>' + moneyFmt(st.amount) + '</b></div>' +
      '<div><span>Payment method</span><b>' + m.icon + ' ' + m.name + '</b></div>' +
      '<div><span>New balance</span><b>' + moneyFmt(((typeof S !== 'undefined' && S.wallet) || 0) + st.amount) + '</b></div>' +
      '</div>';
    h += '<button class="tchk-btn" id="tchkPay" onclick="TundraCheckout.confirm()">Confirm purchase · ' + moneyFmt(st.amount) + '</button>';
    h += '<button class="tchk-btn alt" onclick="TundraCheckout.back()">← Back</button>' + fine();
    return h;
  }

  function stepProcessing() {
    return head('Processing payment…') + crumbs() +
      '<div class="tchk-receipt"><div class="big">⏳</div><p>Contacting ' + esc(methodById(st.method).name) + '…</p>' +
      '<p style="color:#6c8aa6;font-size:12px">(simulated — nothing real is happening)</p></div>';
  }

  function stepDone() {
    var o = st.order || {};
    var h = head('Funds added!') + crumbs() + '<div class="tchk-receipt">' +
      '<div class="big">✅</div>' +
      '<p><b>' + moneyFmt(o.amount) + '</b> added with ' + esc(o.method) + '</p>' +
      '<p>Order <b>' + esc(o.id) + '</b> · New balance <b>' + moneyFmt(o.balance) + '</b></p>' +
      '</div><button class="tchk-btn" onclick="TundraCheckout.done()">Done</button>' + fine();
    return h;
  }

  function render() {
    var body =
      st.step === 0 ? stepAmount() :
      st.step === 1 ? stepMethod() :
      st.step === 2 ? stepReview() :
      st.step === 3 ? stepDone() : stepProcessing();
    var html = '<div class="tchk">' + body + '</div>';
    try { showModal(html); } catch (e) { alert('Tundra Checkout needs the store page'); }
  }

  /* ---------- money ---------- */
  function credit(n) {
    var used = methodById(st.method).name;
    try { if (typeof addFunds === 'function') addFunds(n); else throw 0; }
    catch (e) {
      S.wallet = +(S.wallet + n).toFixed(2);
      S.orders.unshift({ date: new Date().toISOString(), items: [{ id: null, title: 'Wallet funds', price: n }], total: 0, method: used });
      try { save(); updateBadges(); } catch (e2) {}
    }
    try { if (S.orders && S.orders[0]) { S.orders[0].method = used; save(); } } catch (e) {}
    try { renderAccount(); } catch (e) {}
    try { var w = document.getElementById('wallet'); if (w) w.textContent = moneyFmt(S.wallet); } catch (e) {}
    return { id: 'TUNDRA-' + Date.now().toString(36).toUpperCase(), amount: n, method: used, balance: S.wallet };
  }

  /* ---------- public controls ---------- */
  window.TundraCheckout = {
    open: function (preset) {
      injectStyle();
      st.step = 0;
      st.pendingCart = !!(preset && preset.__cart);
      st.amount = (preset && !preset.__cart) ? Math.round(preset * 100) / 100 : 10;
      st.method = 'tundra';
      st.order = null;
      render();
    },
    pickAmount: function (n) { st.amount = n; render(); },
    setCustom: function (v, soft) {
      var n = Math.round(parseFloat(v) * 100) / 100;
      if (isFinite(n) && n > 0) { st.amount = n; if (!soft) render(); else {
        try {
          var btns = document.querySelectorAll('.tchk-amt button');
          for (var i = 0; i < btns.length; i++) btns[i].classList.remove('on');
        } catch (e) {}
      } }
    },
    pickMethod: function (id) { st.method = id; render(); },
    next: function () { st.step = Math.min(2, st.step + 1); render(); },
    back: function () { st.step = Math.max(0, st.step - 1); render(); },
    confirm: function () {
      st.step = 4;
      render();
      setTimeout(function () {
        st.order = credit(st.amount);
        st.step = 3;
        render();
      }, 1100);
    },
    done: function () {
      try { closeModal(); } catch (e) {}
      if (st.pendingCart) {
        st.pendingCart = false;
        toast('Wallet topped up — completing your purchase');
        if (origCheckout) setTimeout(function () { origCheckout(); }, 350);
      } else {
        toast(moneyFmt(st.amount) + ' added to wallet');
      }
    }
  };

  /* ---------- insufficient-balance top-up during checkout ---------- */
  function wrapCheckout() {
    origCheckout = window.checkout;
    if (typeof origCheckout !== 'function') return;
    window.checkout = function () {
      try {
        var total = typeof cartTotal === 'function' ? cartTotal() : 0;
        if (total > 0 && S.wallet < total) {
          window.TundraCheckout.open({ __cart: true });
          var shortfall = Math.round((total - S.wallet) * 100) / 100;
          st.amount = shortfall > 0 ? shortfall : 10;
          render();
          return;
        }
      } catch (e) {}
      return origCheckout.apply(this, arguments);
    };
  }

  /* ---------- entry points ---------- */
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
        var b2 = document.createElement('button');
        b2.id = 'tchkBtnAc';
        b2.className = 'btn btn-primary';
        b2.style.cssText = 'margin-top:10px;width:100%';
        b2.textContent = '＋ Add funds (Checkout)';
        b2.onclick = function () { window.TundraCheckout.open(); };
        panel.appendChild(b2);
        var f = document.createElement('div');
        f.style.cssText = 'font-size:11px;color:#7A8B94;margin-top:6px';
        f.textContent = 'Tundra Checkout — Steam-style flow · simulation only, no real payment is processed.';
        panel.appendChild(f);
      }
    } catch (e) {}
  }

  wrapCheckout();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
