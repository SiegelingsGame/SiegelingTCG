// Verifies the two Siege run modes read as two saves, and that unit art survives.
//
//   node tests/siege-mode-saves-check.cjs
//
// Three reported problems, all on the same seam:
//   1. Battlegrounds Siegelings drew as element glyphs — veteran snapshots carry
//      stats but no art, and the rebuild passed null straight through.
//   2. The map HUD looked like a different game per mode: Battlegrounds smuggled
//      its tier and boon count into the gold chip, Siege showed a bare chip.
//   3. One account checkpoint meant starting either mode discarded the other, and
//      the resume prompt could only ever describe a single unlabelled run.
//
// This drives the real adventure.js boot path with a stubbed /api/siege/run/active
// returning one save per mode, then asserts what the player sees.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const OUT = path.join(ROOT, 'output', 'web-game', 'siege-mode-saves');
const PORT = 8949;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const ART = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200">' +
  '<ellipse cx="60" cy="100" rx="48" ry="96" fill="#7fd0a0"/></svg>');

const VIEWPORTS = [
  { name: 'phone-portrait-390x844', width: 390, height: 844 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 }
];

function member(name, element, id, hp) {
  return {
    id: id, name: name, element: element, sourceCardId: id, side: 'PLAYER',
    hp: hp, maxHp: hp, speed: 9, baseSpeed: 9, effectiveSpeed: 9, alive: true,
    level: 6, xp: 0, xpInLevel: 2, xpSpan: 10, artUrl: ART, statuses: [], cards: []
  };
}

// Both saves as the server serializes them, including the slot fields the client
// labels from. The party art is present because the server now resolves it.
const MODE_SAVES = [
  {
    token: 'tok-siege', status: 'ACTIVE', mode: 'STANDARD', slot: 'EXPEDITION',
    slotLabel: 'Siege Expedition', gold: 48, deckSize: 22, currentNodeId: 4,
    map: [{ id: 4, row: 2, col: 1, type: 'BATTLE', cleared: false }],
    knight: { id: 'k', name: 'Ser Airek', element: 'EARTH', hp: 48, maxHp: 48, level: 5, artUrl: ART },
    party: [member('Pursula', 'WIND', 'pursula', 81), member('Generoot', 'EARTH', 'generoot', 137)]
  },
  {
    token: 'tok-bg', status: 'ACTIVE', mode: 'BATTLEGROUNDS', slot: 'BATTLEGROUNDS',
    slotLabel: 'Battlegrounds', battlegrounds: true, bgTier: 2, boons: [{ id: 'b' }],
    gold: 12, deckSize: 20, currentNodeId: 1,
    map: [{ id: 1, row: 0, col: 0, type: 'BATTLE', cleared: false }],
    knight: { id: 'k', name: 'Ser Airek', element: 'EARTH', hp: 44, maxHp: 44, level: 5, artUrl: ART },
    party: [member('Spoutyl', 'WATER', 'spoutyl', 107), member('Droxyl', 'WATER', 'droxyl', 94)],
    battle: { roundNumber: 3 }
  }
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

const probeResume = () => ({
  screen: document.body.dataset.screen || null,
  note: (document.getElementById('resumeNote').textContent || '').trim(),
  cards: Array.from(document.querySelectorAll('#resumeSaves .resume-save')).map(c => ({
    cls: c.className,
    badge: (c.querySelector('.run-slot-badge').textContent || '').trim(),
    badgeCls: c.querySelector('.run-slot-badge').className,
    accent: getComputedStyle(c).borderLeftColor,
    meta: (c.querySelector('.resume-meta').textContent || '').replace(/\s+/g, ' ').trim(),
    buttons: Array.from(c.querySelectorAll('.resume-save-actions button')).map(b => b.textContent.trim()),
    chips: Array.from(c.querySelectorAll('.party-chip')).map(chip => {
      const thumb = chip.querySelector('.pthumb');
      return {
        name: (chip.querySelector('.pname').textContent || '').trim(),
        fallback: thumb.classList.contains('pthumb-fallback'),
        image: getComputedStyle(thumb).backgroundImage
      };
    })
  }))
});

// 2. HUD parity: continue into each save and read the map header. Both modes must
// expose the same chips in the same order, differing only by the mode badge —
// Battlegrounds used to fold its tier and boons into the gold chip instead.
const probeHud = () => {
  const mode = document.getElementById('mapMode');
  const meta = document.querySelector('#mapScreen .map-meta');
  return {
    screen: document.body.dataset.screen || null,
    order: Array.from(meta.children).map(n => n.id || n.className),
    modeText: (mode.textContent || '').trim(),
    modeCls: mode.className,
    gold: (document.getElementById('mapGold').textContent || '').trim(),
    deck: (document.getElementById('mapDeckCount').textContent || '').trim()
  };
};

async function page2Hud(browser, vp, check) {
  // A mid-battle save resumes into the battle, not the map (correct, and asserted
  // on the resume card above) — so the HUD comparison uses map-state saves.
  const SAVES = MODE_SAVES.map(r => { const c = Object.assign({}, r); delete c.battle; return c; });
  const readings = [];
  for (const [idx, label] of [[0, 'Siege'], [1, 'Battlegrounds']]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.addInitScript((saves) => {
      const real = window.fetch;
      window.fetch = (url, opts) => {
        const u = String(url);
        if (u.includes('/api/siege/run/active')) {
          return Promise.resolve(new Response(JSON.stringify({ runs: saves, run: saves[0] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        if (u.includes('/api/siege/')) return new Promise(() => {});
        return real(url, opts);
      };
    }, SAVES);
    await page.goto(`http://127.0.0.1:${PORT}/adventure.html?v=check`, { waitUntil: 'load' });
    await page.waitForSelector('#resumeSaves .resume-save', { timeout: 5000 });
    await page.locator('#resumeSaves .resume-save').nth(idx)
      .locator('button', { hasText: 'Continue' }).click();
    await page.waitForTimeout(250);
    const hud = await page.evaluate(probeHud);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-map-${label.toLowerCase()}.png`) });
    await page.close();
    console.log(`   HUD ${label.padEnd(14)} badge="${hud.modeText}" gold="${hud.gold}" order=${hud.order.join(',')}`);
    check(hud.screen === 'mapScreen', `${label}: Continue did not land on the map (${hud.screen})`);
    readings.push(hud);
  }
  const [siege, bg] = readings;
  check(siege.order.join(',') === bg.order.join(','),
    `the two modes lay the HUD out differently: ${siege.order.join(',')} vs ${bg.order.join(',')}`);
  check(siege.modeText !== bg.modeText, 'both modes show the same badge text');
  check(siege.modeCls !== bg.modeCls, 'both modes style the badge the same');
  check(/Battlegrounds/i.test(bg.modeText) && /Tier/i.test(bg.modeText),
    `the Battlegrounds badge should name the mode and tier, got "${bg.modeText}"`);
  check(!/Tier/i.test(bg.gold),
    `the tier must live in the mode badge, not the gold chip ("${bg.gold}")`);
  check(/^\u{1FA99}/u.test(siege.gold.replace(/^\s+/, '')) || siege.gold.startsWith('\u{1FA99}'),
    `the gold chip should still lead with gold in Siege, got "${siege.gold}"`);
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
    // The boot path is what is under test, so stub the endpoint it calls rather
    // than poking state in afterwards.
    await page.addInitScript((saves) => {
      const real = window.fetch;
      window.fetch = (url, opts) => {
        const u = String(url);
        if (u.includes('/api/siege/run/active')) {
          return Promise.resolve(new Response(JSON.stringify({ runs: saves, run: saves[0] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        if (u.includes('/api/siege/')) return new Promise(() => {});
        return real(url, opts);
      };
    }, MODE_SAVES);
    await page.goto(`http://127.0.0.1:${PORT}/adventure.html?v=check`, { waitUntil: 'load' });
    await page.waitForSelector('#resumeSaves .resume-save', { timeout: 5000 }).catch(() => {});
    const m = await page.evaluate(probeResume);
    await page.screenshot({ path: path.join(OUT, vp.name + '-resume.png'), fullPage: false });
    await page.close();

    const check = (cond, msg) => { if (!cond) failures.push(`[${vp.name}] ${msg}`); };

    console.log(`\n== ${vp.name} (${vp.width}x${vp.height})  screen=${m.screen}`);
    console.log(`   note: ${m.note}`);
    for (const c of m.cards) {
      console.log(`   card ${c.badge}  accent=${c.accent}  [${c.buttons.join(' | ')}]`);
      console.log(`        ${c.meta}`);
      for (const chip of c.chips) {
        console.log(`        chip ${chip.name.padEnd(14)} fallback=${chip.fallback} art=${chip.image.slice(0, 28)}`);
      }
    }

    // 3. Two saves, side by side, each with its own controls.
    check(m.cards.length === 2, `expected one card per mode, got ${m.cards.length}`);
    check(/each mode/i.test(m.note), `the prompt should say both modes are saved, got "${m.note}"`);

    // The two must be tellable apart: different label AND different accent colour.
    if (m.cards.length === 2) {
      const [a, b] = m.cards;
      check(/Siege/i.test(a.badge) && /Battlegrounds/i.test(b.badge),
        `saves are not labelled by mode: "${a.badge}" / "${b.badge}"`);
      check(a.accent !== b.accent,
        `both saves render the same accent colour (${a.accent}) — they read as one save`);
      check(a.badgeCls !== b.badgeCls, 'both badges use the same styling');
      check(/Tier II/.test(b.badge), `the Battlegrounds badge should name its tier, got "${b.badge}"`);
      check(/Round 3/.test(b.meta), 'a mid-battle save should say so on its own card');
      for (const c of m.cards) {
        check(c.buttons.some(t => /Continue/.test(t)) && c.buttons.some(t => /Start Over/.test(t)),
          `each save needs its own Continue and Start Over, got [${c.buttons.join(', ')}]`);
      }
    }

    // 1. Art: every chip draws its cutout — the knight included, since the catalog
    // has art for it and the shield glyph is only meant to be the fallback.
    for (const c of m.cards) {
      for (const chip of c.chips) {
        check(!chip.fallback && chip.image !== 'none',
          `${chip.name} on the ${c.badge} save fell back to a glyph instead of its art`);
      }
    }

    check(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await page2Hud(browser, vp, check);
  }

  await browser.close();
  server.close();

  console.log();
  if (failures.length) {
    failures.forEach(f => console.log('FAIL ' + f));
    console.log(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('all checks passed');
})();
