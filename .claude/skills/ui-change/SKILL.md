---
name: ui-change
description: Workflow for changing Siegelings TCG frontend UI (play/home/adventure/landing pages) — picking the right files, CSS layout invariants, cache-bust versioning, and headless-Chromium verification at mobile and desktop viewports. Use for any visual, layout, responsiveness, or client-behavior change.
---

# Frontend UI change workflow

## 1. Locate the right surface

The screenshot or bug report usually identifies the page. Map it:

| You see | Page | JS | CSS |
|---|---|---|---|
| 3x3 board halves, notch dots, DRAW/SETUP/BATTLE phases, hand tray | `play.html` | `js/game.js`, `js/action-queue.js`, `js/fx.js` | `css/style.css` |
| AP dots, "End Turn", hand fan of tilted cards, turn ledger, map/camp/broker screens | `adventure.html` (Siege mode) | `js/adventure.js` | `css/adventure.css` |
| Packs, binder, decks, social lobbies, profile, shop | `home.html` | `js/home.js` | `css/home.css` |
| 3D rotating legendary creature, marketing copy | `index.html` | `js/landing.js`, `js/legendary-viewport.js` | `css/landing.css` |
| Card stat editor with publish button | `card-dashboard.html` | `js/card-dashboard.js` | `css/card-dashboard.css` |

All under `src/main/resources/static/`. **Never** edit `static/game.js` or
`static/style.css` at the static root — those are dead legacy files. Never edit
`.deploy-hosting/` or `output/`.

To find the element: grep the visible text in the HTML first; if absent, the
element is built in JS — grep the text or class name in the page's JS bundle.

## 2. Respect layout invariants

- Battle/map screens are single-viewport `100dvh` flex columns with
  `overflow:hidden` on `html`/`body`. The page must never scroll; scrolling
  regions are explicit inner elements. In a flex column, exactly one child
  carries `flex:1 1 auto; min-height:0`; chrome rows are `flex:0 0 auto`.
- `html`/`body` carry `touch-action: pan-x pan-y` to block pinch/double-tap
  zoom (a stray zoom permanently clips the fixed layout on iOS Safari). Keep it.
  Drag surfaces use `touch-action: none` locally; horizontal card strips use
  `pan-x`.
- Adventure screens key off `body[data-screen="…"]` set by `adventure.js`.
- Use the element color variables from `style.css` `:root` (`--fire` etc.);
  spacing/safe-area via `env(safe-area-inset-*)`; heights via `dvh` not `vh`.
- Mobile breakpoints in `style.css` are mainly `max-width: 767px`, `560px`,
  `430px`, `360px`, plus tablet-portrait `980–1366px`. Match the existing
  breakpoint rather than inventing a new one.

## 3. Bump cache versions (mandatory)

Every static asset is included with `?v=N`. After editing an asset, bump N in
**every** HTML page that references it:

```bash
grep -rn "css/style.css?v=\|js/game.js?v=" src/main/resources/static/*.html
```

`game.js`, `catalog-sync.js`, and `card-binder-visual.js` are shared by
`play.html` **and** `home.html`; `style.css` by `play.html`, `home.html`,
`card-dashboard.html`, and two fixture pages (fixtures may keep old pins).
Forgetting the bump ships stale code to returning players.

## 4. Verify

```bash
node --check src/main/resources/static/js/<changed>.js   # syntax gate
```

Then a real browser check. Playwright is global; Chromium is preinstalled:

```bash
cd src/main/resources/static && python3 -m http.server 8931 &   # static-only
# or ./mvnw spring-boot:run for full API-backed flows (slow cold start)
node -e "
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:8931/play.html');
  // assert the actual change: computed styles, boundingBox, visibility…
  await page.screenshot({ path: '<scratchpad>/check-mobile.png' });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
"
```

- Check at minimum 390x844 (phone) and 1920x1080 (desktop); add 320x568 for
  cramped layouts and a landscape phone size if the change touches breakpoints.
- Assert the behavior, not just a screenshot: computed style, element
  positions/overlap, class toggles. Read the screenshot back to eyeball it.
- Deep game states (mid-battle, targeting mode) can't be reached by clicking in
  a static server — inject mock state via `page.evaluate` the way past
  harnesses in `progress.md` did, or run the full Spring Boot app.
- If you touched shared tile/button CSS, also run or replicate
  `tests/mobile-overlap/mobile-overlap.spec.js` (text/button overlap guard at 4
  phone viewports).
- Watch the console: fail the check on page errors.

## 5. Log it

Append a dated entry to `progress.md`: what changed (files, versions bumped)
and how it was verified (commands, viewports, evidence). Match the existing
entry style.
