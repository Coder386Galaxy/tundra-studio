#!/usr/bin/env python3
"""Bundle Tundra Studio into one self-contained HTML file."""
import re, pathlib

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'css' / 'studio.css').read_text(encoding='utf-8')
js = '\n'.join((root / 'js' / f).read_text(encoding='utf-8') for f in
               ['llm.js', 'runner.js', 'templates.js', 'editor.js', 'storekit.js', 'app.js'])

html = html.replace('<link rel="stylesheet" href="css/studio.css">', '<style>\n' + css + '\n</style>')
html = re.sub(
    r'<script src="js/[\w.]+"></script>\s*(?:<script src="js/[\w.]+"></script>\s*)*',
    lambda _m: '<script>\n' + js + '\n</script>',
    html)
# keep icons external refs none: favicon already inline svg data-uri
out = root / 'Tundra-Studio.html'
out.write_text(html, encoding='utf-8')
print(f'bundled -> {out} ({len(html)//1024} KB)')
