// Verifies the animated frame-strip battle sprites in Siege (adventure.js
// ANIM_SPRITES). Pass 1 (?spriteTest=squirebud) dresses every ally through the
// test switch; the other passes have no switch and rely on the card mapping
// (Squire Bud, Flora Knight, Generoot, Sundile, Raydile, Solgator, the Cacty, Breezee and Fawny lines: strips of 2-9 frames) on an ally and on
// a foe shade. In both: a fresh
// battle walks in, the attacker plays its attack pose when its hit leaves, the
// struck unit plays hurt, a KO plays fainted once and then holds the last frame
// across the post-playback re-render, and a won battle cheers.
//
//   node tests/siege-anim-sprite-check.cjs
//
// Same harness shape as siege-effect-timing-check.cjs: static server, fetch
// stubbed with canned run states, End Turn clicked through the real UI.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const OUT = path.join(ROOT, 'output', 'web-game', 'siege-anim-sprite');
const PORT = 8953;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.webp': 'image/webp' };
const VIEWPORTS = [
  { name: 'phone-portrait-390x844', width: 390, height: 844 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 }
];

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

function unit(id, name, el, hp, maxHp, extra) {
  return Object.assign({
    id, name, element: el, hp, maxHp, alive: hp > 0, shield: 0, speed: 8,
    position: 0, side: 'PLAYER', statuses: [], attackBuff: 0, level: 3,
    xpInLevel: 10, xpSpan: 40, size: 'SMALL', artUrl: null, cards: []
  }, extra || {});
}
const BEFORE = {
  token: 't', gold: 40, party: [], knight: null, map: [], currentNodeId: 'n1',
  battle: {
    phase: 'PLAYER_INPUT', roundNumber: 2, actionPoints: 5, maxActionPoints: 5,
    playerActsFirst: true, playerSpeed: 20, enemySpeed: 14, leadId: 'a1',
    deckCount: 12, discardCount: 4, hand: [], log: ['Battle joined.'], turnLog: [],
    events: [], targetedPositions: [],
    knight: { id: 'k1', name: 'Ser Airek', element: 'EARTH', hp: 44, maxHp: 44, charge: 4, ultCost: 20 },
    allies: [
      unit('a1', 'Acorn A', 'EARTH', 40, 40, { position: 0 }),
      unit('a2', 'Acorn B', 'EARTH', 8, 40, { position: 1 })
    ],
    enemies: [unit('e1', 'Raydile', 'ELECTRIC', 70, 70, { side: 'ENEMY', position: 0 })]
  }
};
const vit = (id, hp, maxHp, alive) => [{ id, hp, maxHp, shield: 0, alive: alive !== false }];
const AFTER = JSON.parse(JSON.stringify(BEFORE));
AFTER.battle.enemies[0].hp = 42;
AFTER.battle.allies[1].hp = 0; AFTER.battle.allies[1].alive = false;
AFTER.battle.events = [
  { type: 'card', sourceId: 'a1', name: 'Seed Cannon', element: 'EARTH' },
  { type: 'hit', sourceId: 'a1', targetId: 'e1', amount: 28, element: 'EARTH', ko: false, vitals: vit('e1', 42, 70) },
  { type: 'enemyAct', sourceId: 'e1', name: 'Sparkbite', element: 'ELECTRIC' },
  { type: 'hit', sourceId: 'e1', targetId: 'a2', amount: 9, element: 'ELECTRIC', ko: true, vitals: vit('a2', 0, 40, false) }
];
const WON = JSON.parse(JSON.stringify(AFTER));
WON.battle.phase = 'WON'; WON.battle.events = [];

// Pass 2 states: no test switch, so only the card mapping can dress a unit.
function asCard(state, id, name) {
  const s = JSON.parse(JSON.stringify(state));
  s.battle.allies.forEach(u => { u.displayCardId = id; u.name = name; });
  s.battle.enemies.push(unit('e2', 'Shade of ' + name, 'EARTH', 30, 30,
    { side: 'ENEMY', position: 1, displayCardId: id, shadeOf: name }));
  return s;
}
const PASSES = [
  { name: 'switch', query: '?spriteTest=squirebud', sheet: 'squirebud', frames: { idle: 4, fainted: 4 },
    states: [BEFORE, AFTER, WON] },
  { name: 'squirebud', query: '', sheet: 'squirebud', frames: { idle: 4, fainted: 4 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'squirebud', 'Squire Bud')) },
  { name: 'floraknight', query: '', sheet: 'floraknight', frames: { idle: 7, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'floraknight', 'Flora Knight')) },
  { name: 'generoot', query: '', sheet: 'generoot', frames: { idle: 8, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'generoot', 'Generoot')) },
  { name: 'sundile', query: '', sheet: 'sundile', frames: { idle: 9, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'sundile', 'Sundile')) },
  { name: 'raydile', query: '', sheet: 'raydile', frames: { idle: 8, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'raydile', 'Raydile')) },
  { name: 'solgator', query: '', sheet: 'solgator', frames: { idle: 8, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'solgator', 'Solgator')) },
  { name: 'cacty', query: '', sheet: 'cacty', frames: { idle: 9, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'cacty', 'Cacty')) },
  { name: 'jackedty', query: '', sheet: 'jackedty', frames: { idle: 9, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'jackedty', "Jacked'ty")) },
  { name: 'cactyjackedty', query: '', sheet: 'cactyjackedty', frames: { idle: 9, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'cactyjackedty', 'CactyJackedty')) },
  { name: 'breezee', query: '', sheet: 'breezee', frames: { idle: 9, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'breezee', 'Breezee')) },
  { name: 'gagglestand', query: '', sheet: 'gagglestand', frames: { idle: 9, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'gagglestand', 'Gagglestand')) },
  { name: 'hurricrane', query: '', sheet: 'hurricrane', frames: { idle: 9, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'hurricrane', 'Hurricrane')) },
  { name: 'fawny', query: '', sheet: 'fawny', frames: { idle: 8, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'fawny', 'Fawny')) },
  { name: 'chilldoe', query: '', sheet: 'chilldoe', frames: { idle: 8, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'chilldoe', 'Chilldoe')) },
  { name: 'frostag', query: '', sheet: 'frostag', frames: { idle: 8, fainted: 2 },
    states: [BEFORE, AFTER, WON].map(st => asCard(st, 'frostag', 'Frostag')) }
];

function pose(id) {
  const n = document.querySelector('.sprite[data-id="' + id + '"]');
  if (!n) return null;
  const a = n.querySelector('.sp-anim');
  if (!a) return { cls: n.className, img: null };
  const st = a.querySelector('.sp-anim-strip');
  const cs = getComputedStyle(st);
  const m = /\/(\w+)-(\w+)\.webp/.exec(cs.backgroundImage);
  const cell = a.getBoundingClientRect(), strip = st.getBoundingClientRect();
  const frames = Math.round(strip.width / cell.width);
  // Which frame is in the cell: the strip's offset in cell widths.
  const mt = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
  return { cls: n.className, sheet: m ? m[1] : null, img: m ? m[2] : cs.backgroundImage,
           frame: Math.round(-mt.m41 / (strip.width / frames)), frames,
           anim: cs.animationName, w: cell.width, h: cell.height, filter: cs.filter };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const failures = [];
  for (const pass of PASSES) for (const vp of VIEWPORTS) {
    const tag = pass.name + '-' + vp.name;
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errors.push(m.text()); });
    const check = (c, msg) => { if (!c) failures.push(`[${tag}] ${msg}`); else console.log(`  ok  ${msg}`); };
    await page.addInitScript(([before, after, won]) => {
      localStorage.setItem('siegeToken', 't');
      // A fresh tab per pass, but say so: the switch is remembered per tab.
      sessionStorage.removeItem('siegeSpriteTest');
      const orig = window.fetch;
      const json = v => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(v))) });
      let turns = 0;
      window.fetch = (url, opts) => {
        const u = String(url);
        if (u.indexOf('/api/siege/') < 0) return orig(url, opts);
        if (u.indexOf('/run/active') >= 0) return json({ runs: [Object.assign({ status: 'ACTIVE' }, before)] });
        if (u.indexOf('end-turn') >= 0) return json(turns++ ? won : after);
        return json(Object.assign({ status: 'ACTIVE' }, before));
      };
    }, pass.states);
    console.log(`\n== ${tag}`);
    await page.goto(`http://127.0.0.1:${PORT}/adventure.html${pass.query}`, { waitUntil: 'load' });
    await page.waitForSelector('#resumeSaves .siege-btn.primary', { timeout: 15000 });
    await page.click('#resumeSaves .siege-btn.primary');
    await page.waitForSelector('.sprite[data-id="a1"] .sp-anim', { timeout: 15000 });

    let p = await page.evaluate(pose, 'a1');
    check(p.sheet === pass.sheet && p.img === 'walk' && /walk-in/.test(p.cls), `fresh battle walks in (${p.sheet}/${p.img})`);
    check(p.h > 40 && p.w > p.h, `cell renders ${Math.round(p.w)}x${Math.round(p.h)}`);
    const e1 = await page.evaluate(pose, 'e1');
    check(e1.img === null, 'foe without a sheet keeps static art');
    if (pass.name !== 'switch') {
      const e2 = await page.evaluate(pose, 'e2');
      check(e2.sheet === pass.sheet && /paper-siegling-shadow|brightness/.test(e2.filter),
        `foe shade of a mapped card animates in silhouette (${e2.filter.slice(0, 40)})`);
    }
    await page.screenshot({ path: path.join(OUT, tag + '-walk.png') });
    await page.waitForTimeout(1500);
    p = await page.evaluate(pose, 'a1');
    check(p.img === 'idle' && p.anim === 'sa-loop' && p.frames === pass.frames.idle,
      `settles into idle loop of ${p.frames} frames (${p.img}/${p.anim})`);
    const fs_ = new Set();
    for (let i = 0; i < 14; i++) { fs_.add((await page.evaluate(pose, 'a1')).frame); await page.waitForTimeout(70); }
    check(fs_.size >= 3 && Math.max(...fs_) < pass.frames.idle, `idle steps through frames (${[...fs_].sort().join(', ')})`);
    await page.screenshot({ path: path.join(OUT, tag + '-idle.png') });

    const seen = await page.evaluate(() => new Promise(resolve => {
      const log = { a1: new Set(), a2: new Set() };
      // Frame indices shown per pose: a pose that only swaps its image but
      // never steps (it inherited idle's finished clock) shows one frame.
      const frames = {};
      const t0 = performance.now();
      const step = () => {
        for (const id of ['a1', 'a2']) {
          const a = document.querySelector('.sprite[data-id="' + id + '"] .sp-anim-strip');
          if (!a) continue;
          const cs = getComputedStyle(a);
          const m = /-(\w+)\.webp/.exec(cs.backgroundImage);
          if (!m) continue;
          log[id].add(m[1]);
          const cell = a.parentNode.getBoundingClientRect().width;
          const mt = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
          const key = id + ':' + m[1];
          (frames[key] = frames[key] || new Set()).add(Math.round(-mt.m41 / cell));
        }
        if (performance.now() - t0 < 6000) requestAnimationFrame(step);
        else {
          const out = {};
          for (const k in frames) out[k] = [...frames[k]].sort((x, y) => x - y);
          resolve({ a1: [...log.a1], a2: [...log.a2], frames: out });
        }
      };
      requestAnimationFrame(step);
      document.getElementById('endTurnBtn').click();
    }));
    check(seen.a1.includes('attack'), `attacker plays attack (${seen.a1})`);
    const atk = seen.frames['a1:attack'] || [], hurt = seen.frames['a2:hurt'] || [];
    const faint = seen.frames['a2:fainted'] || [];
    check(atk.length >= 3 && atk[0] === 0, `attack steps through its frames from the first (${atk})`);
    check(hurt.length >= 2 && hurt[0] === 0, `hurt steps through its frames from the first (${hurt})`);
    check(faint[0] === 0 && faint.length === pass.frames.fainted, `faint plays every frame (${faint})`);
    check(seen.a2.includes('hurt') && seen.a2.includes('fainted'), `KO'd ally plays hurt then fainted (${seen.a2})`);
    p = await page.evaluate(pose, 'a2');
    check(p.img === 'fainted' && p.frame === pass.frames.fainted - 1,
      `faint rests on its last frame (${p.frame + 1}/${p.frames})`);
    await page.screenshot({ path: path.join(OUT, tag + '-fainted.png') });

    await page.click('#endTurnBtn').catch(() => {});
    await page.waitForTimeout(800);
    p = await page.evaluate(pose, 'a1');
    check(p && p.img === 'cheer' && /cheering/.test(p.cls), `won battle cheers (${p && p.img})`);
    if (pass.name !== 'switch') {
      const foe = await page.evaluate(pose, 'e2');
      check(foe.img === 'idle' && !/cheering/.test(foe.cls), `a surviving foe does not cheer your win (${foe.img})`);
    }
    p = await page.evaluate(pose, 'a2');
    check(p.img === 'fainted' && /faint-held/.test(p.cls) && p.anim === 'none' && p.frame === pass.frames.fainted - 1,
      `re-render holds the faint instead of replaying it (${p.anim})`);
    await page.screenshot({ path: path.join(OUT, tag + '-cheer.png') });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= vp.width, `no horizontal overflow (${sw})`);
    check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
  await browser.close(); server.close();
  if (failures.length) { console.log('\nFAIL\n' + failures.join('\n')); process.exit(1); }
  console.log('\nall checks passed');
})();
