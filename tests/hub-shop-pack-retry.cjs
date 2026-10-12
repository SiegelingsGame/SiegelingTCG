// Hub shop pack opens must reuse a request id. A dropped response used to mint
// a new hub-<timestamp> id, and the overlay claimed nothing was charged, so the
// retry bought a second pack (or a second x10).
const http = require('http');
const fs = require('fs');
const path = require('path');
function loadChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    '/opt/node22/lib/node_modules/playwright',
    '/tmp/pw/node_modules/playwright-core',
    'playwright'
  ].filter(Boolean);
  for (let i = 0; i < candidates.length; i++) {
    try { return require(candidates[i]).chromium; } catch (e) { /* try the next */ }
  }
  throw new Error('playwright is not installed');
}
const chromium = loadChromium();

const ROOT = path.join(__dirname, '..', 'src', 'main', 'resources', 'static');
const PORT = 8765;
const PACK = {
  id: 'pack_molten_forge',
  name: 'Molten Forge Pack',
  description: 'Fire and Metal cards.',
  active: true,
  price: 100,
  elements: ['FIRE', 'METAL'],
  starterEligible: false,
  odds: { siegeKnight: 0.03, cardsPerPack: 5, holoPerCard: { COMMON: 0.01 } },
  bulk: { count: 10, price: 950 }
};

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '/shop') rel = '/home-next.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(file) });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function card(id) {
  return {
    id: id, name: 'Cinder Cub', type: 'SIEGLING', element: 'FIRE', rarity: 'COMMON',
    granted: true, duplicateAtCap: false, remnantsAwarded: 0, ownedAfter: 1, holo: false
  };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const opens = [];
  let mode = 'drop';
  const charges = [];
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (pathname === '/api/auth/me') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          user: { id: 'player-1', email: 'player@example.com', displayName: 'Ada' }
        })
      });
    }
    if (pathname === '/api/shop/packs') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ packs: [PACK], dailyOffers: [], dailyTitleOffers: [] })
      });
    }
    if (pathname === '/api/player/progression') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          progression: { gold: 5000, starterPackId: 'pack_fire', ownedCards: {}, packHistory: [] }
        })
      });
    }
    if (pathname === '/api/shop/open-pack' && route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      opens.push(body);
      if (mode === 'drop') {
        return route.abort('failed');
      }
      const count = Number(body.count) || 1;
      const price = count > 1 ? PACK.bulk.price : PACK.price;
      charges.push(price);
      const cards = [];
      for (let i = 0; i < count; i++) cards.push(card('cinder-' + i));
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          progression: {
            gold: 5000 - charges.reduce((s, n) => s + n, 0),
            packHistory: [{ requestId: body.requestId, packId: body.packId, cards: cards }]
          }
        })
      });
    }
    return route.fulfill({ contentType: 'application/json', body: 'null' });
  });

  const results = [];
  function check(name, ok, detail) {
    results.push({ name, ok, detail });
    if (!ok) console.error('FAIL', name, detail);
    else console.log('PASS', name, detail || '');
  }

  try {
    await page.goto('http://127.0.0.1:' + PORT + '/home-next.html?screen=shop', { waitUntil: 'domcontentloaded' });
    const one = page.locator('button[data-pack="pack_molten_forge"][data-count="1"]');
    const ten = page.locator('button[data-pack="pack_molten_forge"][data-count="10"]');
    await page.waitForSelector('.boot', { state: 'detached', timeout: 20000 });
    await one.waitFor({ timeout: 20000 });

    mode = 'drop';
    await one.evaluate((btn) => { btn.click(); btn.click(); btn.click(); });
    await page.waitForFunction(() => {
      const note = document.querySelector('[data-gacha-note]');
      return note && /confirm the pull/i.test(note.textContent || '');
    }, null, { timeout: 10000 });
    const note = await page.locator('[data-gacha-note]').innerText();
    check('three clicks send one open', opens.length === 1, 'opens=' + opens.length);
    const firstId = opens[0] && opens[0].requestId;
    check('open has a stable id', Boolean(firstId) && String(firstId).indexOf('hub-') !== 0, firstId);
    check('open is a single pack', opens[0] && opens[0].count === 1, JSON.stringify(opens[0]));
    check('dropped response does not claim the purse was untouched', !/nothing was charged/i.test(note), note);

    mode = 'ok';
    opens.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.boot', { state: 'detached', timeout: 20000 });
    await one.waitFor({ timeout: 20000 });
    await one.click();
    await page.waitForFunction(() => {
      const note = document.querySelector('[data-gacha-note]');
      return note && /1 card/.test(note.textContent || '');
    }, null, { timeout: 10000 });
    check('retry reuses the id', opens.length === 1 && opens[0].requestId === firstId, JSON.stringify(opens[0]));
    check('retry is charged once', charges.length === 1 && charges[0] === 100, JSON.stringify(charges));
    const stored = await page.evaluate((id) => localStorage.getItem('sieglingsPendingPackOpenRequest:player-1'), firstId);
    check('confirmed pull clears the stored id', !stored || stored.indexOf(firstId) === -1, stored);

    await page.screenshot({ path: '/opt/cursor/artifacts/shop-pack-retry-reveal.png' });

    // x10: the first tap only arms. Two confirm taps must send one bundle.
    mode = 'ok';
    opens.length = 0;
    charges.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.boot', { state: 'detached', timeout: 20000 });
    await ten.waitFor({ timeout: 20000 });
    await ten.click();
    await page.waitForTimeout(200);
    check('arming x10 sends nothing', opens.length === 0, 'opens=' + opens.length);
    const label = await ten.locator('.sg-gbtn-label').innerText();
    check('x10 asks for a second tap', /confirm/i.test(label), label);
    await ten.evaluate((btn) => { btn.click(); btn.click(); });
    await page.waitForFunction(() => {
      const note = document.querySelector('[data-gacha-note]');
      return note && /10 cards/.test(note.textContent || '');
    }, null, { timeout: 10000 });
    check('two confirm taps send one x10', opens.length === 1 && opens[0].count === 10, JSON.stringify(opens[0]));
    check('x10 uses one fresh id', opens.length === 1 && opens[0].requestId && opens[0].requestId !== firstId, opens[0] && opens[0].requestId);
    check('x10 is charged once', charges.length === 1 && charges[0] === 950, JSON.stringify(charges));
    await page.screenshot({ path: '/opt/cursor/artifacts/shop-pack-bulk-reveal.png' });
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync('/opt/cursor/artifacts/shop-pack-retry-results.json', JSON.stringify(results, null, 2));
  if (failed.length) {
    console.error(failed.length + ' check(s) failed');
    process.exit(1);
  }
  console.log(results.length + ' checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
