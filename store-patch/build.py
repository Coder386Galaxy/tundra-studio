#!/usr/bin/env python3
"""Build index.html = Tundra Games store + real game loading (download-gate ->
player) + Tundra Checkout (payment required, no instant top-ups).

Reads store-source.html + tundra-checkout-addon.js from this folder,
writes index.html here too.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

store = open(os.path.join(HERE, 'store-source.html'), encoding='utf-8').read()
addon = open(os.path.join(HERE, 'tundra-checkout-addon.js'), encoding='utf-8').read()
s = store

def swap_all(src, old, new, label, count):
    n = src.count(old)
    assert n == count, f'{label}: expected {count} occurrences, found {n}'
    return src.replace(old, new)

def swap1(src, old, new, label):
    return swap_all(src, old, new, label, 1)

# 1) library button row -> dynamic Download / Play / Stop buttons
i = s.find('display:flex;gap:10px;flex-wrap:wrap')
assert s.count('display:flex;gap:10px;flex-wrap:wrap') == 1, 'library row anchor'
assert i > 0
start = s.rfind('<div', 0, i)
end = s.find('</div>', i) + len('</div>')
s = s[:start] + '${TundraStore.btns(g)}' + s[end:]

# 2) detail page owned button -> Download / Play
i = s.find('const buyBtn=owned(id)?')
assert s.count('const buyBtn=owned(id)?') == 1, 'buyBtn anchor'
k = s.find(':soon?', i)
assert k > i, 'soon branch not found'
s = s[:i] + 'const buyBtn=owned(id)?TundraStore.detailBtn(id)' + s[k:]

# 3) NO FREE MONEY: instant +$5..+$100 buttons must go through checkout
s = swap_all(s, 'onclick="addFunds(', 'onclick="TundraCheckout.open(', 'instant addFunds buttons', 5)

# 4) play() delegates to the store addon (downloads gate -> player -> session)
i = s.find('function play(id){')
assert s.count('function play(id){') == 1, 'play() anchor'
j = s.find('\n}', i) + len('\n}')
s = s[:i] + 'function play(id){return (window.TundraStore&&window.TundraStore.launch(id))||false}' + s[j:]

# 5) purchase-complete modal gets per-game Download (install) buttons
i = s.find('Purchase complete')
assert i > 0, 'purchase modal not found'
k = s.find('Go to Library', i)
assert k > i, 'go-to-library not found'
bstart = s.rfind('<button', i, k)
assert bstart > i, 'modal button not found'
inject = "${items.filter(x=>x.id).map(x=>`<button class=\"btn btn-primary block\" style=\"margin-bottom:8px\" onclick=\"closeModal();TundraStore.install('${x.id}')\">Download ${esc(x.title)}</button>`).join('')}"
s = s[:bstart] + inject + s[bstart:]

# 6) append the Tundra Store addon (player + download gate + checkout)
assert '</script' not in addon.lower(), 'addon must not contain </script'
block = '\n<script>\n' + addon + '\n</' + 'script>\n'
idx = s.lower().rfind('</body>')
assert idx > 0, 'no </body>'
s = s[:idx] + block + s[idx:]

open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(s)
print('built store-patch/index.html:', len(s), 'bytes')
