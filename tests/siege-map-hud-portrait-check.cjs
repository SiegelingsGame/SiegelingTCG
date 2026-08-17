// Guards the Siege map HUD on portrait phones.
//
//   node tests/siege-map-hud-portrait-check.cjs
//
// Two regressions this pins down, both reported from a 390x844 phone:
//   1. The resource row (.map-meta) was a single nowrap line — mode badge, gold,
//      deck/save count, Items, Extract, hint — so the Items button sat past the
//      right edge of a 370px row and could not be tapped at all.
//   2. The party strip wrapped to a second row of third-width chips, which ate
//      the HUD's height and squeezed names. It is a single horizontally
//      scrollable row again, so the assertions here are "reachable by scroll",
//      not "all in view".
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const OUT = path.join(ROOT, 'output', 'web-game', 'siege-map-hud-portrait');
const PORT = 8957;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const ART = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200">' +
  '<ellipse cx="60" cy="100" rx="48" ry="96" fill="#7fd0a0"/></svg>');

const VIEWPORTS = [
  { name: 'phone-portrait-390x844', width: 390, height: 844, portrait: true },
  { name: 'phone-portrait-360x740', width: 360, height: 740, portrait: true },
  { name: 'phone-portrait-320x568', width: 320, height: 568, portrait: true },
  { name: 'phone-landscape-844x390', width: 844, height: 390 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 }
];

function member(id, name, el, hp, maxHp) {
  return { id, name, element: el, hp, maxHp, alive: true, shield: 0, speed: 9,
           position: 0, level: 3, xpInLevel: 8, xpSpan: 40, artUrl: ART, cards: [],
           size: 'MEDIUM', sourceCardId: id };
}

// The worst case the HUD must hold: full 3-strong warband + knight + a rental,
// on a Battlegrounds run (the extra mode badge) with a checkpoint saved (the
// longest deck/save chip) and an extractable team (the extra button).
const MERC = Object.assign(member('merc-shellnaut', 'Shellnaut (Merc)', 'WATER', 136, 143),
                           { merc: true });
const RUN = {
  token: 't', status: 'ACTIVE', gold: 148, mode: 'ENDLESS', slot: 'BATTLEGROUNDS',
  tier: 1, checkpoint: true, deckSize: 21, canExtract: true, extractable: true,
  party: [member('a1', 'Generoot', 'EARTH', 137, 137),
          member('a2', 'Pursula', 'LIGHT', 81, 81),
          member('a3', 'Spoutyl', 'WATER', 107, 107)],
  mercenary: MERC,
  knight: { id: 'k1', name: 'Ser Airek', element: 'EARTH', hp: 48, maxHp: 48, artUrl: ART },
  map: [{ id: 'n1', type: 'CAMP', row: 0, col: 0, reachable: false, visited: true, next: ['n2'] },
        { id: 'n2', type: 'BATTLE', row: 1, col: 0, reachable: true, visited: false, next: [] }],
  currentNodeId: 'n1', inventory: [], knightBag: [], deckList: [], items: []
};

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'adventure.html';
    const file = path.join(STATIC, rel);
    if (!file.startsWith(STATIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('nope'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

function probe() {
  const strip = document.getElementById('partyStrip');
  const meta = document.querySelector('.map-meta');
  const inv = document.getElementById('inventoryBtn');
  const bottom = document.querySelector('.map-bottom');
  const mapScroll = document.querySelector('.map-scroll');
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const sb = strip.getBoundingClientRect();
  const box = n => { const b = n.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height),
             left: Math.round(b.left), right: Math.round(b.right),
             top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
  const visibleName = n => {
    const nm = n.querySelector('.pname');
    if (!nm) return (n.textContent || '').trim();
    return Array.from(nm.childNodes).filter(c =>
      c.nodeType === 3 || (c.nodeType === 1 && getComputedStyle(c).display !== 'none'
        && !c.classList.contains('pmerc') && !c.classList.contains('plvl')
        && !c.classList.contains('pinfo'))
    ).map(c => c.textContent || '').join('').replace(/\s+/g, ' ').trim();
  };
  return {
    vw, vh,
    pageOverflow: document.documentElement.scrollWidth > vw + 1,
    strip: { box: box(strip), scrollW: strip.scrollWidth, clientW: strip.clientWidth,
             rows: new Set(Array.from(strip.children)
               .map(n => Math.round(n.getBoundingClientRect().top))).size },
    meta: { box: box(meta), scrollW: meta.scrollWidth, clientW: meta.clientWidth },
    inv: { box: box(inv),
           // What the user actually reported: the button existed but no part of
           // it was on screen, so no tap could reach it.
           fullyInViewport: (() => { const b = inv.getBoundingClientRect();
             return b.left >= -0.5 && b.right <= vw + 0.5 && b.top >= -0.5 && b.bottom <= vh + 0.5; })(),
           hitAtCenter: (() => { const b = inv.getBoundingClientRect();
             const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
             return !!el && (el === inv || inv.contains(el)); })() },
    bottomH: box(bottom).h,
    mapScrollH: box(mapScroll).h,
    chips: Array.from(strip.children).map(n => ({
      name: visibleName(n), merc: n.classList.contains('merc'), box: box(n),
      inView: (() => { const b = n.getBoundingClientRect();
        return b.width > 0 && b.right > sb.left + 0.5 && b.left < sb.right - 0.5; })(),
      reachable: (() => { const b = n.getBoundingClientRect();
        const off = b.left - sb.left + strip.scrollLeft;
        return off >= -1 && off + b.width <= strip.scrollWidth + 1; })()
    }))
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const failures = [];

  for (const vp of VIEWPORTS) {
    const check = (cond, msg) => { if (!cond) failures.push(`[${vp.name}] ${msg}`); };
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript((r) => {
      localStorage.setItem('siegeToken', 't');
      const orig = window.fetch;
      const json = v => Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve(JSON.parse(JSON.stringify(v))) });
      window.fetch = (url, opts) => {
        const u = String(url);
        if (u.indexOf('/api/siege/') < 0) return orig(url, opts);
        if (u.indexOf('/run/active') >= 0) return json({ runs: [r] });
        return json(r);
      };
    }, RUN);
    await page.goto(`http://127.0.0.1:${PORT}/adventure.html?v=check`, { waitUntil: 'load' });
    await page.waitForSelector('#resumeSaves .siege-btn.primary', { timeout: 15000 });
    await page.click('#resumeSaves .siege-btn.primary');
    await page.waitForTimeout(600);

    const m = await page.evaluate(probe);
    // Captured before the scroll probe below, so the artifact shows the HUD as
    // the player first meets it.
    await page.screenshot({ path: path.join(OUT, vp.name + '-map.png') });
    console.log(`\n== ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`   chips(${m.chips.length}) rows=${m.strip.rows} ` +
      `strip=${m.strip.scrollW}/${m.strip.clientW}px  meta=${m.meta.scrollW}/${m.meta.clientW}px  ` +
      `bottom=${m.bottomH}px map=${m.mapScrollH}px`);
    console.log('   names: ' + m.chips.map(c => c.name + (c.merc ? ' [MERC]' : '')).join(' | '));
    console.log(`   Items btn: ${JSON.stringify(m.inv.box)} inViewport=${m.inv.fullyInViewport} ` +
      `hittable=${m.inv.hitAtCenter}`);

    check(errors.length === 0, `page errors: ${errors.slice(0, 2).join(' | ')}`);
    check(m.chips.length === 5, `knight + 3 warband + merc on the strip (got ${m.chips.length})`);
    check(!m.pageOverflow, 'the page itself never scrolls horizontally');
    // 1. The reported bug: the Items button must be on screen and tappable.
    check(m.inv.fullyInViewport, 'the Items button is fully inside the viewport');
    check(m.inv.hitAtCenter, 'the Items button is the top element at its own centre');
    check(m.meta.scrollW <= m.meta.clientW + 1,
      `the resource row does not overflow (${m.meta.scrollW}/${m.meta.clientW}px)`);
    // 2. The strip: one row, swipeable, every member reachable, names legible.
    check(m.chips.every(c => c.reachable), 'every chip is reachable within the strip scroll extent');
    check(m.chips.every(c => c.name && c.name.length >= 4),
      `every chip still names its unit (got ${JSON.stringify(m.chips.map(c => c.name))})`);
    if (vp.portrait) {
      check(m.strip.rows === 1, `portrait: the strip is a single row (got ${m.strip.rows})`);
      check(m.strip.scrollW > m.strip.clientW + 1,
        'portrait: the strip scrolls (the overflowing team is swipeable, not stacked)');
      check(m.chips.filter(c => c.inView).length >= 2,
        'portrait: at least two chips are visible without swiping');
      check(m.mapScrollH >= 280, `portrait: the map keeps its 280px floor (got ${m.mapScrollH}px)`);
      // Two chip-height rows of chrome: one strip row plus a resource row that
      // pairs badge+gold at 390px and takes a third line only on narrower
      // phones. The wrapped-strip version this replaced measured 181px.
      check(m.bottomH <= 160, `portrait: the HUD stays shallow (got ${m.bottomH}px)`);
      // Swiping the strip must actually move it, and must not move the page.
      const scrolled = await page.evaluate(() => {
        const s = document.getElementById('partyStrip');
        s.scrollLeft = s.scrollWidth;
        return { left: s.scrollLeft, lastInView: (() => {
          const last = s.children[s.children.length - 1].getBoundingClientRect();
          const sb = s.getBoundingClientRect();
          return last.right <= sb.right + 1 && last.left >= sb.left - 1;
        })() };
      });
      check(scrolled.left > 0, 'portrait: the strip actually scrolls');
      check(scrolled.lastInView, 'portrait: swiping to the end brings the last chip fully into view');
    }
    await page.close();
  }

  await browser.close();
  server.close();
  if (failures.length) { console.error('\nFAILURES:\n' + failures.map(f => ' - ' + f).join('\n')); process.exit(1); }
  console.log('\nAll map HUD portrait checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
