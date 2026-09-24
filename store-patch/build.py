#!/usr/bin/env python3
"""Build index.html = Tundra Games store + download-only delivery + Tundra Checkout.

Reads store-source.html (the store's live index.html) and
tundra-checkout-addon.js from this folder, writes index.html here too.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

store = open(os.path.join(HERE, 'store-source.html'), encoding='utf-8').read()
addon = open(os.path.join(HERE, 'tundra-checkout-addon.js'), encoding='utf-8').read()
s = store

def swap1(src, old, new, label):
    n = src.count(old)
    assert n == 1, f'{label}: expected 1 occurrence, found {n}'
    return src.replace(old, new, 1)

# 1) store page: "Play" button -> "Download" (still routes to the library)
s = swap1(s, '>Play</button>', '>Download</button>', 'detail buy button')

# 2) library button label: Download / Stop
s = swap1(s, "?'Stop':'Play'", "?'Stop':'Download'", 'library button label')

# 3) dl() helper: saves the playable single-file game
s = swap1(s, 'function play(id){', '''function dl(g){if(!g)return;const html=g.gameHTML||('<!DOCTYPE html><meta charset="utf-8"><title>'+esc(g.title)+'</title><h1>'+esc(g.title)+'</h1><p>This listing has no playable file yet - publish one from Tundra Studio.</p>');const slug=(g.title||'game').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download=slug+'.html';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800)}
function play(id){''', 'dl helper')

# 4) launching = downloading the game file (you have to download the game to play)
s = swap1(s, 'save();toast(`Launching ${g.title}`);renderLibrary();',
          'save();dl(g);toast(`Downloaded ${g.title} - open the file to play`);renderLibrary();', 'play download')

# 5) purchase-complete modal gets per-game Download buttons
i = s.find('Purchase complete')
assert i > 0, 'purchase modal not found'
k = s.find('Go to Library', i)
assert k > i, 'go-to-library not found'
bstart = s.rfind('<button', i, k)
assert bstart > i, 'modal button not found'
inject = "${items.filter(x=>x.id).map(x=>`<button class=\"btn btn-primary block\" style=\"margin-bottom:8px\" onclick=\"closeModal();dl(byId('${x.id}'))\">Download ${esc(x.title)}</button>`).join('')}"
s = s[:bstart] + inject + s[bstart:]

# 6) append the Tundra Checkout addon (Steam-style wallet top-up)
assert '</script' not in addon.lower(), 'addon must not contain </script'
block = '\n<script>\n' + addon + '\n</' + 'script>\n'
idx = s.lower().rfind('</body>')
assert idx > 0, 'no </body>'
s = s[:idx] + block + s[idx:]

open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(s)
print('built store-patch/index.html:', len(s), 'bytes')
