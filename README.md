# Tundra Studio

**The AI game forge for [Tundra Games](https://coder386galaxy.github.io/Tudra-Publishing/).**

Connect any AI model with **your API key** — it writes the game in **the coding language you pick**,
you edit it like any normal project, then publish a store-ready title in the exact Tundra Games
catalog schema. Or skip AI entirely and type the whole thing yourself.

## Run it

No build step, no dependencies — same philosophy as the Tundra Games storefront.

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Or open `Tundra-Studio.html` — a fully self-contained single-file build of the studio.

## Choose your language

| Language | What you edit | How it runs | Publish build |
|---|---|---|---|
| **Frost (Hypereasy)** | `game.frost` — one instruction per line | runs natively in a tiny built-in interpreter, zero deps | auto-wrapped HTML |
| **JavaScript** | `index.html` — a complete HTML document | runs raw, zero deps | the document itself |
| **Python** | `game.py` | [Pyodide](https://pyodide.org) in-browser, small `Tundra` game API | auto-wrapped HTML |
| **Lua** | `game.lua` | [Fengari](https://fengari.io) in-browser, same `Tundra` API | auto-wrapped HTML |

**Frost** is the hypereasy game language: you write declarative lines like
`player orb circle 26 #8fd8ff at 50% 86%` and `when orb touches star: score 1, remove star, sound pop`
— the runtime supplies the loop, spawning, collisions, title screen and HUD. No functions, no loops.

Everything follows the choice: syntax highlighting, the AI's instructions, starter templates,
the filename you download, and how preview/publish wraps the build. Python & Lua builds load their
runtime from a CDN the first time; Frost and JavaScript need no network at all.

The `Tundra` API for script languages is a thin arcade layer — `circle/rect/text`, `key/pressed`,
`score/lives`, `shake/flash/burst/beep`, `game_over()` — with `init()`, `update(dt)`, `draw()`
hooks. The wrapper provides the title/pause/game-over screens, HUD, input, and the store
screenshot bridge.

Every build opens with a ~10-second console-style **boot screen** (a progress bar and
“Starting ⟨your title⟩…”), then the game opens on its title screen. Space or a tap skips
the boot early. The title you chose — via the “Choose the title” prompt on New Game,
the store-kit Title field, the metadata comment or Frost's `title` line — is what shows.

## The rules

1. **The only AI is your API key.** ⚙ Engine takes a base URL, key and model (OpenAI or any
   OpenAI-compatible endpoint — local LLMs included). Requests go straight from your browser to
   your endpoint. Without a key the studio still works — you just code by hand and publish.
2. **You code normally.** One ordinary source file per game. The workshop is a real editor —
   syntax highlighting per language, line numbers, tab/indent, `Ctrl+Enter` run, `Ctrl+S` save.
3. **The Code Room has no AI.** The *Code Room* tab is a workspace with zero AI in it — no prompts,
   no assistant, no model calls anywhere in its chrome. The AI assistant only exists on the Forge
   path, lives in a dock you can ✕-close at any time, and never opens itself.

## What's inside

| Path | Purpose |
|---|---|
| `index.html` | App shell & views (Forge, Workshop, Publish, Projects, Guide) |
| `css/studio.css` | Design system (Tundra brand palette) + code editor |
| `js/llm.js` | **The only AI** — OpenAI-compatible client, per-language prompts (incl. the Frost grammar), code + `TUNDRA_META` extraction |
| `js/runner.js` | Language runners: the Frost interpreter, Pyodide / Fengari bootstraps, the `Tundra` game API + 10s boot screen + build wrapper |
| `js/templates.js` | Hand-written starters per language (starter game, empty file) — zero AI |
| `js/editor.js` | Normal code editor (JavaScript, Python, Lua, Frost highlighting) |
| `js/storekit.js` | Publishing kit — schema-locked to the store's `New Title` form and `Export/Restore` JSON |
| `js/app.js` | Studio glue: language state, title chooser, preview, canvas-grab screenshots, store kit, projects |
| `Tundra-Studio.html` | Single-file bundle (`python3 bundle.py`) |
| `store-patch/` | Ready-to-upload Tundra Games store build: **download-only delivery** + Steam-style wallet checkout (`store-patch/HOW-TO-INSTALL.txt`) |
| `test/smoke.js` | `node test/smoke.js` — parsing, wrap/boot, templates, editor, schema |
| `test/store-compat.js` | `node test/store-compat.js` — live-store schema compatibility |
| `test/store-patch.js` | `node test/store-patch.js` — store patch build verification |

## AI workflow

- **⚡ Generate game** — prompt in, complete game out *in your language*. Models include a
  `TUNDRA_META` comment (pre-fills the store kit) in the language's own comment syntax.
- **→ Apply to code** — describe a change, the model returns the revised full file.

## Publishing to Tundra Games

Every game object matches the store's schema exactly
(`id, title, studio, price, date, age, tags, platforms, featured, blurb, desc, image, screens, palette, discount`)
plus an extra `gameHTML` field carrying the runnable build — for Python/Lua that's the wrapped
HTML, so the store always has something playable (ignored by the store UI, preserved in catalog JSON).

Three paths, all in the **Publish** tab:

- **A · Export publish package** → `tundra-publish-YYYY-MM-DD.json` in Restore format
  (`{games, news, promos}` — `users`/`reviews` omitted so Restore keeps them).
- **B · Merge into existing catalog** *(recommended)* → feed the store's last
  **Export JSON** backup into Tundra Studio, get back a merged `tundra-games-YYYY-MM-DD.json` — Restore that.
- **C · Manual form** → per-field copy buttons + cover/screenshot file downloads.

## Deployment (GitHub Pages)

Tundra Studio lives at the root of the `Tundra-Studio` repo:

```
https://coder386galaxy.github.io/tundra-studio/
```

GitHub Pages is enabled from `main` / root. Because the studio and the
[Tundra Games store](https://coder386galaxy.github.io/Tudra-Publishing/) share
the `coder386galaxy.github.io` origin, the Publish page's
**"Publish to Tundra Games"** direct publish is active: it writes the game
straight into the store's `tundra_games` catalog (localStorage), plus a launch
post in `tundra_news`. Off that host the button is safely disabled and the
store-JSON / copy-paste export paths still work from anywhere.

## Store media

- **📸 Capture** grabs the live game canvas — works with *any* code.
- **✨ Auto media** stages title / play / over screenshots via the runner's bridge (py/lua always,
  JS when the document includes the snippet), falling back to canvas-grab + procedural art.
- Upload your own images anytime.
