// Verifies a hired merc does not break the Siege battlefield unit plates.
//
//   node tests/siege-merc-party-layout-check.cjs
//
// The warband caps at 3 (SiegeContentService#PARTY_MAX) and a rented mercenary
// makes a fourth body on .ally-line. The reported break is what happens then:
// the sprites shrink to fit but their name plates do not, so the stat row
// (hp / shield / attack buff / status chips) and the evolution gauge spill out
// of the plate and collide with the neighbouring unit — clipped HP numbers in
// portrait, plates written over each other in landscape.
//
// The assertions are what the CSS actually has to hold with four units up:
// every plate contains its own content, no two plates on a line overlap, and
// nothing leaves .battle-stage (which is overflow:hidden, so it crops silently).
// Run at both orientations because they size the line completely differently —
// portrait is a flow row inside the stage, landscape an absolute ~50% lane.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const OUT = path.join(ROOT, 'output', 'web-game', 'siege-merc-party-layout');
const PORT = 8947;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// A tall figure, not a square blob: plate width is what is measured, and the art
// box below it has to keep its real aspect so the sprite column reads honestly.
const ART = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200">' +
  '<ellipse cx="60" cy="100" rx="48" ry="96" fill="#7fd0a0"/></svg>');

const VIEWPORTS = [
  { name: 'phone-portrait-390x844',   width: 390,  height: 844 },
  { name: 'phone-landscape-844x390',  width: 844,  height: 390 },
  { name: 'phone-landscape-932x430',  width: 932,  height: 430 },
  { name: 'desktop-1920x1080',        width: 1920, height: 1080 }
];

// The reported party: three warband members plus the rented Shellnaut. The long
// names, the shield, the attack buff and the evolution gauge are all in the
// screenshot — they are the content that has to fit, not decoration.
const ALLIES = [
  { el: 'EARTH', name: 'Generoot', lvl: 3, hp: '104/124', size: 'LARGE',
    shield: 8, buff: 3, status: true, evo: null },
  { el: 'WATER', name: 'Droxyl', lvl: 4, hp: '94/94', size: 'MEDIUM',
    shield: 8, buff: 3, status: false, evo: 'ready' },
  { el: 'WIND', name: 'Purseus', lvl: 4, hp: '80/80', size: 'MEDIUM',
    shield: 8, buff: 3, status: false, evo: 'gauge' },
  { el: 'WATER', name: 'Shellnaut (Merc)', lvl: 1, hp: '136/143', size: 'SMALL',
    shield: 8, buff: 3, status: false, evo: null }
];
const FOES = [
  { el: 'ELECTRIC', name: 'Raydile', lvl: 0, hp: '29/69', size: 'MEDIUM',
    shield: 0, buff: 0, status: false, evo: null },
  { el: 'WIND', name: 'Strikehawk', lvl: 0, hp: '64/72', size: 'MEDIUM',
    shield: 0, buff: 0, status: false, evo: null }
];

// Mirrors adventure.js renderSpriteLine's plate markup — level badge, XP bar,
// stat row and evolution gauge are the parts that overflow, so a trimmed copy
// would not reproduce the bug.
function mock([art, foes, allies]) {
  document.querySelectorAll('.siege-screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('battleScreen').classList.remove('hidden');
  document.body.dataset.screen = 'battleScreen';
  document.body.dataset.battleNode = 'BATTLE';

  document.getElementById('knightPlate').className = 'knight-plate el-EARTH';
  document.getElementById('knightPlate').innerHTML =
    '<div class="kp-head"><span class="kp-name">Ser Airek</span><span class="kp-hp">44/44</span></div>' +
    '<div class="kp-hpbar"><div class="kp-hpfill" style="width:100%"></div></div>';
  document.getElementById('speedTrack').innerHTML =
    '<div class="track-round">R2</div><div class="track-lanes"></div>';

  const line = (host, side, units) => {
    host.innerHTML = '';
    units.forEach((u, idx) => {
      const sp = document.createElement('div');
      const merc = / \(Merc\)$/.test(u.name);
      sp.className = 'sprite ' + side + ' el-' + u.el + (merc ? ' merc' : '');
      if (u.size) sp.dataset.size = u.size;
      sp.dataset.id = 'u' + idx;
      let plate = '';
      const badge = side === 'ally' ? '<span class="sp-lvl">Lv' + u.lvl + '</span>' : '';
      // renderSpriteLine badges the "(Merc)" role rather than spelling it in the name.
      const shown = merc ? '<span class="sp-merc">Merc</span>' + u.name.replace(/ \(Merc\)$/, '') : u.name;
      plate += '<div class="sp-name">' + badge + shown + ' <span class="sp-el">●</span></div>';
      plate += '<div class="sp-hpbar"><div class="sp-hpfill" style="width:72%"></div></div>';
      if (side === 'ally') {
        plate += '<div class="sp-xpbar"><div class="sp-xpfill" style="width:40%"></div></div>';
      }
      plate += '<div class="sp-tags"><span class="sp-hp">' + u.hp + '</span>' +
        (u.shield ? '<span class="sp-shield">\u{1f6e1}' + u.shield + '</span>' : '') +
        (u.buff ? '<span class="sp-buff">⚔+' + u.buff + '</span>' : '') +
        (u.status ? '<span class="sp-status st-disorient">\u{1f3f3}</span>' : '') +
        '</div>';
      if (u.evo === 'ready') {
        plate += '<div class="sp-gauge ready">\u{1f31f} EVO READY</div>';
      } else if (u.evo) {
        plate += '<div class="sp-gauge"><div class="sp-gaugefill" style="width:20%"></div>' +
          '<span class="sp-gaugetext">\u{1f31f} 1/5</span></div>';
      }
      if (side === 'enemy') {
        plate += '<div class="sp-intent-line">⚔8 → Purseus</div>';
      }
      sp.innerHTML = '<div class="sp-plate">' + plate + '</div>' +
        '<div class="sp-art"><img src="' + art + '" alt=""></div>' +
        '<div class="sp-shadow"></div>' +
        (side === 'ally' ? '<div class="sp-notch">' + (idx + 1) + '</div>' : '');
      host.appendChild(sp);
    });
  };
  line(document.getElementById('enemyRow'), 'enemy', foes);
  line(document.getElementById('allyRow'), 'ally', allies);

  document.getElementById('battleHint').textContent =
    'Drag a card onto the battlefield to play it (3 AP left), or End Turn.';
  document.getElementById('handRow').innerHTML = '';
  document.getElementById('battleLog').innerHTML = '<div class="lg">Battle joined.</div>';
  document.getElementById('deckCounts').textContent = '17 · 3 · 9';
  document.getElementById('apDisplay').innerHTML = '';
}

function probe() {
  const box = n => { const b = n.getBoundingClientRect();
    return { w: b.width, h: b.height, top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
  const read = sel => Array.from(document.querySelectorAll(sel)).map(sp => {
    const plate = sp.querySelector('.sp-plate');
    return {
      name: (sp.querySelector('.sp-name').textContent || '').trim(),
      sprite: box(sp),
      plate: box(plate),
      plateOverflow: plate.scrollWidth - plate.clientWidth,
      // A row that clips (.sp-name, .sp-gauge) contains itself by ellipsis and is
      // not the defect; a row with visible overflow paints over its neighbour.
      rows: Array.from(plate.children).map(r => ({
        cls: r.className,
        clips: getComputedStyle(r).overflowX !== 'visible',
        overflow: r.scrollWidth - r.clientWidth,
        text: (r.textContent || '').trim().slice(0, 24)
      }))
    };
  });
  return {
    stage: box(document.getElementById('battleStage')),
    allies: read('.sprite.ally'),
    foes: read('.sprite.enemy'),
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    vw: window.innerWidth, vh: window.innerHeight
  };
}

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
    await page.addInitScript(() => { window.fetch = () => new Promise(() => {}); });
    await page.goto(`http://127.0.0.1:${PORT}/adventure.html?v=check`, { waitUntil: 'load' });
    await page.evaluate(mock, [ART, FOES, ALLIES]);
    await page.waitForTimeout(300);
    const m = await page.evaluate(probe);
    await page.screenshot({ path: path.join(OUT, vp.name + '.png') });
    await page.close();

    const check = (cond, msg) => { if (!cond) failures.push(`[${vp.name}] ${msg}`); };

    console.log(`\n== ${vp.name} (${vp.width}x${vp.height})  stage ` +
      `${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)}`);
    for (const u of m.allies) {
      const worst = Math.max(0, ...u.rows.filter(r => !r.clips).map(r => r.overflow));
      console.log(`   ally ${u.name.slice(0, 22).padEnd(24)} sprite w=${u.sprite.w.toFixed(0)}` +
        ` plate w=${u.plate.w.toFixed(0)} [${u.plate.left.toFixed(0)}..${u.plate.right.toFixed(0)}]` +
        ` overflow=${worst}`);
      for (const r of u.rows) {
        if (!r.clips && r.overflow > 0) console.log(`        overflow ${String(r.overflow).padStart(3)}px  ${r.cls}  '${r.text}'`);
      }
    }

    for (const u of [...m.allies, ...m.foes]) {
      for (const r of u.rows) {
        // 1px of subpixel rounding is not a defect; a stat row painting over the
        // next unit is. Rows that clip themselves (ellipsised name, gauge) pass.
        if (r.clips) continue;
        check(r.overflow <= 1,
          `${u.name}: '${r.cls}' spills out of its plate by ${r.overflow}px ('${r.text}')`);
      }
      check(u.plateOverflow <= 1,
        `${u.name}: plate content overflows by ${u.plateOverflow}px`);
    }

    // Plates written over each other is the landscape half of the report.
    for (const side of ['allies', 'foes']) {
      const units = [...m[side]].sort((a, b) => a.plate.left - b.plate.left);
      for (let i = 0; i + 1 < units.length; i++) {
        check(units[i].plate.right <= units[i + 1].plate.left + 1,
          `${units[i].name} and ${units[i + 1].name} plates overlap ` +
          `(${units[i].plate.right.toFixed(0)} > ${units[i + 1].plate.left.toFixed(0)})`);
      }
    }

    for (const u of [...m.allies, ...m.foes]) {
      check(u.plate.left >= m.stage.left - 1 && u.plate.right <= m.stage.right + 1,
        `${u.name}'s plate leaves the arena (${u.plate.left.toFixed(0)}..` +
        `${u.plate.right.toFixed(0)} vs ${m.stage.left.toFixed(0)}..${m.stage.right.toFixed(0)})`);
    }

    check(m.scrollW <= m.vw + 1 && m.scrollH <= m.vh + 1,
      `the page scrolls (${m.scrollW}x${m.scrollH} vs ${m.vw}x${m.vh})`);
    check(errors.length === 0, `page errors: ${errors.join(' | ')}`);
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
