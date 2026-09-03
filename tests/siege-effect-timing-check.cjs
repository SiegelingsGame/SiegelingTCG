// Verifies Siege effect ordering: an HP change must land *after* the effect
// that caused it, never before.
//
//   node tests/siege-effect-timing-check.cjs
//
// The defect this guards: adventure.js#applyRun assigned the fresh (post-turn)
// server state and rendered it *before* replaying the turn's events, so every
// HP bar snapped to its end value while the projectiles, burn auras and heal
// flashes were still queued. Damage read as having already happened by the time
// the orb left the caster.
//
// The fix holds the pre-turn vitals for the duration of playback (state.vitals)
// and steps each unit forward on the event that moves it — inside the
// projectile's arrival callback for `hit`, just after the aura catches for
// burn/poison/wither, just after the float for heal/shield.
//
// This drives the real code: adventure.js is a closed IIFE, so the harness
// stubs fetch and clicks End Turn, exactly as a player would. It samples each
// unit's rendered HP text every frame and asserts, per unit, that the drop
// timestamp falls after its cause's timestamp.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const OUT = path.join(ROOT, 'output', 'web-game', 'siege-effect-timing');
const PORT = 8951;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const VIEWPORTS = [
  { name: 'phone-portrait-390x844', width: 390, height: 844 },
  { name: 'desktop-1920x1080',      width: 1920, height: 1080 }
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

// ---- canned run states -------------------------------------------------
// unit(): the shape SiegeService#serialize emits for a battle combatant.
function unit(id, name, el, hp, maxHp, extra) {
  return Object.assign({
    id, name, element: el, hp, maxHp, alive: hp > 0, shield: 0, speed: 8,
    position: 0, side: 'PLAYER', statuses: [], attackBuff: 0, level: 3,
    xpInLevel: 10, xpSpan: 40, size: 'MEDIUM', artUrl: null, cards: []
  }, extra || {});
}

// BEFORE: what the player is looking at when they press End Turn.
const BEFORE = {
  token: 't', gold: 40, party: [], knight: null, map: [], currentNodeId: 'n1',
  battle: {
    phase: 'PLAYER_INPUT', roundNumber: 2, actionPoints: 5, maxActionPoints: 5,
    playerActsFirst: true, playerSpeed: 20, enemySpeed: 14, leadId: 'a1',
    deckCount: 12, discardCount: 4, hand: [], log: ['Battle joined.'], turnLog: [],
    events: [], targetedPositions: [],
    knight: { id: 'k1', name: 'Ser Airek', element: 'EARTH', hp: 44, maxHp: 44, charge: 4, ultCost: 20 },
    allies: [
      unit('a1', 'Generoot', 'EARTH', 100, 120, { position: 0 }),
      unit('a2', 'Droxyl', 'WATER', 60, 90, { position: 1 })
    ],
    enemies: [
      unit('e1', 'Raydile', 'ELECTRIC', 70, 70, { side: 'ENEMY', position: 0 }),
      unit('e2', 'Strikehawk', 'WIND', 50, 50, { side: 'ENEMY', position: 1 })
    ]
  }
};

// AFTER: post-turn state (all HP already final) plus the events describing how
// it got there. Each event carries the vitals stamped by SiegeBattle#event.
function vit(id, hp, maxHp, shield, alive) {
  return [{ id, hp, maxHp, shield: shield || 0, alive: alive !== false }];
}
const AFTER = JSON.parse(JSON.stringify(BEFORE));
AFTER.battle.roundNumber = 3;
AFTER.battle.enemies[0].hp = 42;   // hit -28
AFTER.battle.enemies[1].hp = 38;   // burn -12
AFTER.battle.allies[1].hp = 82;    // heal +22
AFTER.battle.allies[0].hp = 91;    // enemy hit -9
AFTER.battle.knight.hp = 39;       // knightHit -5
AFTER.battle.events = [
  { type: 'round', round: 3, playerSpeed: 20, enemySpeed: 14, playerFirst: true },
  { type: 'card', sourceId: 'a1', name: 'Root Lash', element: 'EARTH' },
  { type: 'hit', sourceId: 'a1', targetId: 'e1', amount: 28, element: 'EARTH', ko: false,
    vitals: vit('e1', 42, 70) },
  { type: 'burn', targetId: 'e2', amount: 12, vitals: vit('e2', 38, 50) },
  { type: 'heal', sourceId: 'a2', targetId: 'a2', amount: 22, vitals: vit('a2', 82, 90) },
  { type: 'enemyAct', sourceId: 'e1', name: 'Sparkbite', element: 'ELECTRIC' },
  { type: 'hit', sourceId: 'e1', targetId: 'a1', amount: 9, element: 'ELECTRIC', ko: false,
    vitals: vit('a1', 91, 120) },
  { type: 'knightHit', targetId: 'k1', amount: 5, hp: 39, vitals: vit('k1', 39, 44) }
];

// ---- in-page driver ----------------------------------------------------
// Stubs fetch with the two canned states, renders BEFORE, then clicks End Turn
// and samples the DOM every animation frame until playback settles.
function drive([before, after]) {
  return new Promise(resolve => {
    const IDS = { a1: '.sprite[data-id="a1"] .sp-hp', a2: '.sprite[data-id="a2"] .sp-hp',
                  e1: '.sprite[data-id="e1"] .sp-hp', e2: '.sprite[data-id="e2"] .sp-hp',
                  k1: '#knightPlate .kp-hp' };
    const samples = [];   // {t, hp:{id:text}, orbs, auras, floats}
    let t0 = 0;

    const step = () => {
      const now = performance.now() - t0;
      const hp = {};
      for (const id in IDS) {
        const n = document.querySelector(IDS[id]);
        hp[id] = n ? (n.textContent || '').trim() : null;
      }
      samples.push({
        t: now, hp,
        orbs: document.querySelectorAll('.projectile').length,
        auras: document.querySelectorAll('.sp-aura').length,
        floats: document.querySelectorAll('.sp-float').length
      });
      if (now < 9000) requestAnimationFrame(step);
      else resolve(samples);
    };
    // The battle screen is already up (the harness resumed into it). Start
    // sampling on the same frame the turn is submitted.
    const btn = document.getElementById('endTurnBtn');
    t0 = performance.now();
    requestAnimationFrame(step);
    btn.click();
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const failures = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    // Seed the run before adventure.js boots. boot() → resumeOrRoster() asks
    // /api/siege/run/active; handing it BEFORE as an ACTIVE save puts the real
    // resume prompt up, and clicking Continue enters the battle screen through
    // the app's own code — no mocked DOM anywhere in the path under test.
    await page.addInitScript(([before, after]) => {
      localStorage.setItem('siegeToken', 't');
      const orig = window.fetch;
      const json = v => Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve(JSON.parse(JSON.stringify(v))) });
      window.fetch = (url, opts) => {
        const u = String(url);
        if (u.indexOf('/api/siege/') < 0) return orig(url, opts);
        if (u.indexOf('/run/active') >= 0) {
          return json({ runs: [Object.assign({ status: 'ACTIVE' }, before)] });
        }
        if (u.indexOf('end-turn') >= 0) return json(after);
        return json(Object.assign({ status: 'ACTIVE' }, before));
      };
    }, [BEFORE, AFTER]);

    await page.goto(`http://127.0.0.1:${PORT}/adventure.html?v=check`, { waitUntil: 'load' });
    await page.waitForSelector('#resumeSaves .siege-btn.primary', { timeout: 15000 });
    await page.click('#resumeSaves .siege-btn.primary');
    await page.waitForSelector('.sprite[data-id="e1"]', { timeout: 15000 });
    await page.waitForSelector('#endTurnBtn', { timeout: 15000 });
    const samples = await page.evaluate(drive, [BEFORE, AFTER]);
    await page.screenshot({ path: path.join(OUT, vp.name + '.png') });
    await page.close();

    const check = (cond, msg) => { if (!cond) failures.push(`[${vp.name}] ${msg}`); };
    console.log(`\n== ${vp.name} (${vp.width}x${vp.height})  ${samples.length} frames`);
    check(errors.length === 0, `page errors: ${errors.slice(0, 3).join(' | ')}`);

    // First frame at which a unit's HP text reaches its final value.
    const settleAt = (id, finalText) => {
      const s = samples.find(x => x.hp[id] === finalText);
      return s ? s.t : null;
    };
    // First frame at which any projectile / aura / float was on screen.
    const firstWhen = key => {
      const s = samples.find(x => x[key] > 0);
      return s ? s.t : null;
    };

    const orbAt = firstWhen('orbs');
    const auraAt = firstWhen('auras');
    const floatAt = firstWhen('floats');

    const e1 = settleAt('e1', '42/70');   // hit
    const e2 = settleAt('e2', '38/50');   // burn
    const a2 = settleAt('a2', '82/90');   // heal
    const a1 = settleAt('a1', '91/120');  // enemy hit
    const k1 = settleAt('k1', '39/44');   // knight backlash

    const ms = v => v == null ? 'never' : v.toFixed(0) + 'ms';
    console.log(`   first projectile ${ms(orbAt)}   first aura ${ms(auraAt)}   first float ${ms(floatAt)}`);
    console.log(`   e1 hit -28   HP settles ${ms(e1)}`);
    console.log(`   e2 burn -12  HP settles ${ms(e2)}`);
    console.log(`   a2 heal +22  HP settles ${ms(a2)}`);
    console.log(`   a1 hit -9    HP settles ${ms(a1)}`);
    console.log(`   k1 backlash  HP settles ${ms(k1)}`);

    // The core assertion: nothing may be at its final HP on the first frame.
    // That is precisely the pre-fix behaviour (render post-turn state, then play).
    const f0 = samples[0].hp;
    check(f0.e1 === '70/70', `e1 starts at pre-turn HP (was ${f0.e1})`);
    check(f0.e2 === '50/50', `e2 starts at pre-turn HP (was ${f0.e2})`);
    check(f0.a2 === '60/90', `a2 starts at pre-turn HP (was ${f0.a2})`);
    check(f0.a1 === '100/120', `a1 starts at pre-turn HP (was ${f0.a1})`);
    check(f0.k1 === '44/44', `knight starts at pre-turn HP (was ${f0.k1})`);

    // Ordering: every HP change lands after its cause appeared on screen.
    check(orbAt != null, 'a projectile was rendered');
    check(e1 != null && orbAt != null && e1 > orbAt,
      `e1 HP drops after the projectile launches (hp ${ms(e1)} vs orb ${ms(orbAt)})`);
    check(auraAt != null, 'a burn aura was rendered');
    check(e2 != null && auraAt != null && e2 >= auraAt,
      `e2 burn HP drops after the aura ignites (hp ${ms(e2)} vs aura ${ms(auraAt)})`);
    check(a2 != null && floatAt != null && a2 >= floatAt,
      `a2 heal HP rises after the heal float (hp ${ms(a2)} vs float ${ms(floatAt)})`);

    // Sequence: the events are ordered, so the HP changes must be too.
    check(e1 != null && e2 != null && e1 <= e2, `e1 (hit) resolves before e2 (burn)`);
    check(e2 != null && a2 != null && e2 <= a2, `e2 (burn) resolves before a2 (heal)`);
    check(a2 != null && a1 != null && a2 <= a1, `a2 (heal) resolves before a1 (enemy hit)`);
    check(a1 != null && k1 != null && a1 <= k1, `a1 (hit) resolves before k1 (backlash)`);

    // Everything must land eventually — a hold that never releases is a worse bug.
    check(k1 != null, 'the knight reaches its final HP before playback ends');
  }

  await browser.close();
  server.close();

  if (failures.length) {
    console.log('\nFAIL');
    failures.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('\nPASS — every HP change lands after the effect that caused it.');
})();
