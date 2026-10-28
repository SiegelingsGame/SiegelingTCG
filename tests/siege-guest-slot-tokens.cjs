// A guest's only copy of a Siege run is the token on this device. New run on an
// empty slot must not delete it, and a second slot's token must still resume.
//
//   node tests/siege-guest-slot-tokens.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
function loadChromium() {
  const candidates = [
    '/opt/node22/lib/node_modules/playwright',
    '/tmp/pw-install/node_modules/playwright-core'
  ];
  for (const candidate of candidates) {
    try { return require(candidate).chromium; } catch (e) { /* next */ }
  }
  throw new Error('playwright is not installed');
}
const chromium = loadChromium();
const CHROME = fs.existsSync('/opt/pw-browsers/chromium')
  ? '/opt/pw-browsers/chromium'
  : '/opt/google/chrome/chrome';

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const PORT = 8953;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

const ART = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#7fd0a0"/></svg>');

function run(token, mode) {
  return {
    token: token, status: 'ACTIVE', mode: mode,
    slot: mode === 'ENDLESS' ? 'ENDLESS' : 'EXPEDITION',
    gold: mode === 'ENDLESS' ? 9 : 48, currentNodeId: 4,
    map: [{ id: 4, row: 2, col: 1, type: 'BATTLE', cleared: false }],
    knight: { id: 'k', name: 'Ser Airek', element: 'EARTH', hp: 40, maxHp: 40, level: 3, xpInLevel: 1, xpSpan: 4, artUrl: ART },
    party: [{ id: 'p', name: 'Pursula', element: 'WIND', hp: 20, maxHp: 20, level: 2, xpInLevel: 0, xpSpan: 4, alive: true, artUrl: ART }]
  };
}

const RUNS = {
  'tok-adventure': run('tok-adventure', 'STANDARD'),
  'tok-endless': run('tok-endless', 'ENDLESS')
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

function storage() {
  return {
    token: localStorage.getItem('siegeToken'),
    slots: JSON.parse(localStorage.getItem('siegeSlotTokens') || '{}'),
    screen: document.body.dataset.screen || null,
    badges: Array.from(document.querySelectorAll('#resumeSaves .resume-save:not(.resume-empty) .run-slot-badge'))
      .map(n => (n.textContent || '').replace(/\s+/g, ' ').trim()),
    status: (document.getElementById('bootLoadStatus') || {}).textContent || ''
  };
}

(async () => {
  const failures = [];
  const check = (cond, msg) => { if (!cond) failures.push(msg); };
  const server = await serve();
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript((runs) => {
    // Seed once. A reload must see whatever the page itself left behind.
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('siegeToken', 'tok-adventure');
      localStorage.removeItem('siegeSlotTokens');
      sessionStorage.setItem('seeded', '1');
    }
    const real = window.fetch;
    window.fetch = (url, opts) => {
      const u = String(url);
      const json = (body, status) => Promise.resolve(new Response(JSON.stringify(body),
        { status: status, headers: { 'Content-Type': 'application/json' } }));
      if (u.includes('/api/siege/run/active')) return json({});
      if (u.includes('/api/siege/state')) {
        const token = new URL(u, location.origin).searchParams.get('token');
        const run = runs[token];
        if (!run) return json({ error: 'Run not found. Start a new expedition.' }, 404);
        return json(run, 200);
      }
      if (u.includes('/api/siege/roster')) return json({ error: 'roster down' }, 500);
      return real(url, opts);
    };
  }, RUNS);

  await page.goto(`http://127.0.0.1:${PORT}/adventure.html?v=guest-slots`, { waitUntil: 'load' });
  await page.waitForSelector('#resumeSaves .resume-save', { timeout: 8000 });
  const before = await page.evaluate(storage);
  console.log('before', JSON.stringify(before));
  check(before.token === 'tok-adventure', `boot lost the guest token (${before.token})`);
  check(before.slots.siege === 'tok-adventure', `resume did not record the adventure slot (${JSON.stringify(before.slots)})`);
  check(before.badges.some(b => /Adventure/.test(b)), `adventure save was not shown (${before.badges.join(' | ')})`);

  await page.locator('.resume-empty.endless button').click();
  await page.waitForFunction(() => /roster down/.test((document.getElementById('bootLoadStatus') || {}).textContent || ''), null, { timeout: 8000 });
  const afterClick = await page.evaluate(storage);
  console.log('after New run', JSON.stringify(afterClick));
  check(afterClick.token === 'tok-adventure', `New run cleared the guest token (${afterClick.token})`);
  check(afterClick.slots.siege === 'tok-adventure', `New run dropped the adventure slot (${JSON.stringify(afterClick.slots)})`);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#resumeSaves .resume-save:not(.resume-empty)', { timeout: 8000 });
  const afterReload = await page.evaluate(storage);
  console.log('after reload', JSON.stringify(afterReload));
  check(afterReload.screen === 'resumeScreen', `reload did not return to the save (${afterReload.screen})`);
  check(afterReload.badges.some(b => /Adventure/.test(b)), `reload lost the adventure save (${afterReload.badges.join(' | ')})`);
  check(afterReload.token === 'tok-adventure', `reload lost the guest token (${afterReload.token})`);

  // A second mode that actually started must not erase the first slot.
  await page.evaluate(() => {
    const slots = JSON.parse(localStorage.getItem('siegeSlotTokens') || '{}');
    slots.endless = 'tok-endless';
    slots.missing = 'tok-gone';
    localStorage.setItem('siegeSlotTokens', JSON.stringify(slots));
    localStorage.setItem('siegeToken', 'tok-endless');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#resumeSaves .resume-save:not(.resume-empty)', { timeout: 8000 });
  const both = await page.evaluate(storage);
  console.log('both slots', JSON.stringify(both));
  check(both.badges.some(b => /Adventure/.test(b)) && both.badges.some(b => /Endless/.test(b)),
    `both saves should resume, got ${both.badges.join(' | ')}`);
  check(both.slots.siege === 'tok-adventure' && both.slots.endless === 'tok-endless',
    `slot map changed (${JSON.stringify(both.slots)})`);
  check(!both.slots.missing, `a missing token was kept (${JSON.stringify(both.slots)})`);
  check(both.token === 'tok-endless', `the run just opened should stay the device default (${both.token})`);

  await page.screenshot({ path: '/opt/cursor/artifacts/siege-guest-both-slots.png' });
  check(errors.length === 0, `page errors: ${errors.join(' | ')}`);

  await browser.close();
  server.close();
  if (failures.length) {
    failures.forEach(f => console.log('FAIL ' + f));
    process.exit(1);
  }
  console.log('all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
