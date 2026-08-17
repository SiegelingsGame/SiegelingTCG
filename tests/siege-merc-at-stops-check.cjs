// Verifies a mercenary under contract travels with the warband and is shown at
// the stops, not only inside the battle it was rented for.
//
//   node tests/siege-merc-at-stops-check.cjs
//
// A rental (SiegeRun#mercenary) lives outside run.party on the server, because
// run.party drives equipping, evolving and smith scrapping — none of which a
// merc is eligible for. The reported gap: the party strip and the illustrated
// stops render straight off run.party, so a hired merc vanished from the team
// everywhere except the battlefield until its contract ended.
//
// SiegeService#serialize now publishes it as run.mercenary, and adventure.js
// appends it for *display* via displayParty(). These assertions are what that
// has to hold: the merc shows on the map strip and at every illustrated stop,
// carries a Merc badge so it never reads as a permanent member, and disappears
// the moment the contract is gone.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const OUT = path.join(ROOT, 'output', 'web-game', 'siege-merc-at-stops');
const PORT = 8953;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const ART = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200">' +
  '<ellipse cx="60" cy="100" rx="48" ry="96" fill="#7fd0a0"/></svg>');

const VIEWPORTS = [
  { name: 'phone-portrait-390x844',  width: 390,  height: 844,  portrait: true },
  { name: 'phone-portrait-360x740',  width: 360,  height: 740,  portrait: true },
  // Landscape keeps the horizontal scroll on purpose — no spare height there.
  { name: 'phone-landscape-844x390', width: 844,  height: 390 },
  { name: 'desktop-1920x1080',       width: 1920, height: 1080 }
];

function member(id, name, el, hp, maxHp) {
  return { id, name, element: el, hp, maxHp, alive: true, shield: 0, speed: 9,
           position: 0, level: 3, xpInLevel: 8, xpSpan: 40, artUrl: ART, cards: [],
           size: 'MEDIUM', sourceCardId: id };
}

// A two-strong warband on a map node, with a Shellnaut rented at the broker.
const PARTY = [member('a1', 'Generoot', 'EARTH', 104, 124),
               member('a2', 'Droxyl', 'WATER', 94, 94)];
const MERC = Object.assign(member('merc-shellnaut', 'Shellnaut (Merc)', 'WATER', 136, 143),
                           { merc: true });

function run(extra) {
  return Object.assign({
    token: 't', status: 'ACTIVE', gold: 120, mode: 'STANDARD', slot: 'SIEGE',
    party: PARTY, mercenary: null,
    knight: { id: 'k1', name: 'Ser Airek', element: 'EARTH', hp: 44, maxHp: 44, artUrl: ART },
    map: [{ id: 'n1', type: 'CAMP', row: 0, col: 0, reachable: false, visited: true, next: [] }],
    currentNodeId: 'n1', inventory: [], knightBag: [], deckList: [], items: []
  }, extra || {});
}

// Two stops to prove it is not a one-screen patch: the map HUD strip and an
// illustrated stop (rest camp) use different renderers.
const ON_MAP   = run({ mercenary: MERC });
// The warband cap is 3 (SiegeContentService#partyMax); with the knight chip that
// is already 4 chips on the strip before any merc exists.
const FULL_PARTY = run({
  mercenary: null,
  party: PARTY.concat([member('a3', 'Purseus', 'WIND', 80, 80)])
});
// The worst case the HUD has to hold: a full warband, the knight, and a rental.
const FULL_PLUS_MERC = run({
  mercenary: MERC,
  party: PARTY.concat([member('a3', 'Purseus', 'WIND', 80, 80)])
});
const AT_CAMP  = run({ mercenary: MERC, camp: { options: [], note: 'The fire burns low.' } });
const NO_MERC  = run({ mercenary: null, camp: { options: [], note: 'The fire burns low.' } });

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

function probe(hostSel) {
  const host = document.querySelector(hostSel);
  if (!host) return null;
  const hb = host.getBoundingClientRect();
  const box = n => { const b = n.getBoundingClientRect();
    return { w: b.width, h: b.height, left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
  return {
    // The strip scrolls horizontally on phones by design, so "reachable"
    // (inside the scroll extent) and "visible without scrolling" are different
    // questions and the test asks them separately.
    scrollW: host.scrollWidth, clientW: host.clientWidth,
    mapScrollH: (() => { const ms = document.querySelector('.map-scroll');
      return ms ? Math.round(ms.getBoundingClientRect().height) : null; })(),
    chips: Array.from(host.children).map(n => {
      const b = box(n);
      return {
        text: (n.textContent || '').replace(/\s+/g, ' ').trim(),
        // textContent still includes display:none badges, so read the name from
        // the nodes that are actually painted.
        visibleName: (() => {
          const nm = n.querySelector('.pname') || n.querySelector('span');
          if (!nm) return (n.textContent || '').trim();
          return Array.from(nm.childNodes).filter(c =>
            c.nodeType === 3 || (c.nodeType === 1 && getComputedStyle(c).display !== 'none'
              && !c.classList.contains('pmerc') && !c.classList.contains('plvl')
              && !c.classList.contains('pinfo'))
          ).map(c => (c.textContent || '')).join('').replace(/\s+/g, ' ').trim();
        })(),
        merc: n.classList.contains('merc'),
        badge: !!n.querySelector('.pmerc, .loc-merc'),
        rendered: b.w > 0 && b.h > 0,
        inView: b.w > 0 && b.h > 0 && b.right > hb.left && b.left < hb.right,
        box: b
      };
    })
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const failures = [];

  // Boots the app straight into a resumed run, then reads whichever host the
  // screen under test renders its warband into.
  async function screenOf(vp, state, hostSel, shot) {
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
    }, state);
    await page.goto(`http://127.0.0.1:${PORT}/adventure.html?v=check`, { waitUntil: 'load' });
    await page.waitForSelector('#resumeSaves .siege-btn.primary', { timeout: 15000 });
    await page.click('#resumeSaves .siege-btn.primary');
    await page.waitForTimeout(600);
    const m = await page.evaluate(probe, hostSel);
    if (shot) await page.screenshot({ path: path.join(OUT, shot + '.png') });
    await page.close();
    return { chips: (m && m.chips) || [], scrollW: m && m.scrollW, clientW: m && m.clientW,
             mapScrollH: m && m.mapScrollH, errors };
  }

  for (const vp of VIEWPORTS) {
    const check = (cond, msg) => { if (!cond) failures.push(`[${vp.name}] ${msg}`); };
    console.log(`\n== ${vp.name} (${vp.width}x${vp.height})`);

    // 1. Map HUD strip — knight chip + 2 party chips + the merc.
    const map = await screenOf(vp, ON_MAP, '#partyStrip', vp.name + '-map');
    check(map.errors.length === 0, `map page errors: ${map.errors.slice(0, 2).join(' | ')}`);
    check(!!map.chips, '#partyStrip rendered');
    const mapMerc = (map.chips || []).filter(c => c.merc);
    console.log('   map strip: ' + (map.chips || []).map(c =>
      c.text.slice(0, 22) + (c.merc ? ' [MERC]' : '')).join(' | '));
    check((map.chips || []).length === 4,
      `map strip carries knight + 2 warband + merc (got ${(map.chips || []).length})`);
    check(mapMerc.length === 1, `exactly one merc chip on the map strip (got ${mapMerc.length})`);
    check(mapMerc[0] && mapMerc[0].badge, 'the merc chip wears a Merc badge');
    check(mapMerc[0] && mapMerc[0].rendered, 'the merc chip is laid out, not collapsed');
    check(mapMerc[0] && /Shellnaut/.test(mapMerc[0].text),
      'the merc chip names the creature');
    check(mapMerc[0] && !/\(Merc\)/.test(mapMerc[0].text),
      'the raw "(Merc)" server suffix is badged, not spelled out');

    // 1b. The strip used to scroll horizontally with chips sized to their own
    // text, so a full warband already had members off-screen before any merc
    // existed. On portrait phones it now wraps instead: the worst case — full
    // 3-strong warband + knight + merc, five chips — must fit with no overflow
    // and every chip in view, while the map keeps its floor of usable height.
    const worst = await screenOf(vp, FULL_PLUS_MERC, '#partyStrip', vp.name + '-map-full-plus-merc');
    const overflows = m => m.scrollW > m.clientW + 1;
    console.log(`   worst case (${worst.chips.length} chips): ` +
      `${worst.scrollW}/${worst.clientW}px overflow=${overflows(worst)} ` +
      `mapScroll=${worst.mapScrollH}px`);
    check(worst.chips.length === 5, `worst case is knight + 3 warband + merc (got ${worst.chips.length})`);
    if (vp.portrait) {
      check(!overflows(worst), 'portrait: the full team fits with no horizontal scroll');
      check(worst.chips.every(c => c.inView), 'portrait: every chip is in view without scrolling');
      const names = worst.chips.map(c => c.visibleName);
      console.log('   visible names: ' + names.join(' | '));
      // A chip whose name is ellipsised to nothing identifies no one — that is
      // what made the first wrap attempt worse than the scroll it replaced.
      check(names.every(n => n && n.length >= 4 && !/^\W*$/.test(n)),
        `portrait: every chip still names its unit (got ${JSON.stringify(names)})`);
      check(worst.mapScrollH >= 280,
        `portrait: the map keeps its 280px floor (got ${worst.mapScrollH}px)`);
    } else {
      check(overflows(worst) || worst.chips.every(c => c.inView),
        'non-portrait: the strip either scrolls as before or fits');
    }

    // 2. Illustrated stop — a different renderer, same requirement.
    const camp = await screenOf(vp, AT_CAMP, '#campParty', vp.name + '-camp');
    check(camp.errors.length === 0, `camp page errors: ${camp.errors.slice(0, 2).join(' | ')}`);
    const campMerc = (camp.chips || []).filter(c => c.merc);
    console.log('   camp stop: ' + (camp.chips || []).map(c =>
      c.text.slice(0, 22) + (c.merc ? ' [MERC]' : '')).join(' | '));
    check((camp.chips || []).length === 3,
      `the merc stands at the camp with the warband (got ${(camp.chips || []).length} figures)`);
    check(campMerc.length === 1, `exactly one merc figure at the stop (got ${campMerc.length})`);
    check(campMerc[0] && campMerc[0].badge, 'the merc figure wears a Merc badge');
    check(campMerc[0] && campMerc[0].inView,
      'the merc figure is visible at the stop without scrolling');

    // 3. Contract over — the merc must be gone, not lingering as a ghost member.
    const gone = await screenOf(vp, NO_MERC, '#campParty', vp.name + '-camp-no-merc');
    console.log('   after contract: ' + (gone.chips || []).map(c => c.text.slice(0, 22)).join(' | '));
    check((gone.chips || []).length === 2,
      `with no contract the stop shows the warband only (got ${(gone.chips || []).length})`);
    check((gone.chips || []).every(c => !c.merc), 'no merc figure survives the contract');
  }

  await browser.close();
  server.close();

  if (failures.length) {
    console.log('\nFAIL');
    failures.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('\nPASS — a hired merc stands with the team at the stops until it leaves.');
})();
