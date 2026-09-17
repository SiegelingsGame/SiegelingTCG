// Hub shop pack-open idempotency. The art-first shop used to mint a unique
// requestId on every tap, so a retry after a dropped response charged twice.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const STATIC = path.join(ROOT, 'src/main/resources/static');
const OUT = path.join(ROOT, 'output/web-game/pack-open');
const ARTIFACTS = '/opt/cursor/artifacts';
const PORT = Number(process.env.PACK_OPEN_TEST_PORT || 8953);
const packs = [
  { id: 'pack_fire', name: 'Fire Pack', price: 150, elements: ['FIRE'], active: true, odds: { cardsPerPack: 5 } }
];
const pull = [
  { id: 'emberling', name: 'Emberling', element: 'FIRE', rarity: 'COMMON', granted: true, remnantsAwarded: 0, ownedAfter: 1 },
  { id: 'cinder', name: 'Cinder', element: 'FIRE', rarity: 'RARE', granted: true, remnantsAwarded: 0, ownedAfter: 1 }
];
const baseline = () => ({
  gold: 500, remnants: 0, starterPackId: 'pack_fire_starter',
  purchasedDeckIds: [], unlockedDeckIds: [], ownedCards: {}, packHistory: []
});
let state;
function reset(overrides = {}) {
  state = {
    progression: baseline(),
    completed: {},
    calls: [],
    delay: 0,
    dropNext: false,
    guest: false,
    ...overrides
  };
}
reset();
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function openPackFromBody(body) {
  const { packId, count, requestId } = JSON.parse(body || '{}');
  const entry = { packId, count: Number(count) || 1, requestId, method: 'POST' };
  state.calls.push(entry);
  if (requestId && state.completed[requestId]) {
    return { replay: true, progression: state.progression };
  }
  state.progression.gold -= 150;
  const historyEntry = { packId, requestId, cards: pull.map((card) => ({ ...card })) };
  state.progression.packHistory = [historyEntry, ...state.progression.packHistory];
  if (requestId) state.completed[requestId] = true;
  return { replay: false, progression: state.progression };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/auth/me') {
      return json(res, {
        authenticated: !state.guest,
        user: { id: 'pack-fixture', displayName: 'Rook', email: 'rook@example.test' },
        progression: state.guest ? null : state.progression
      });
    }
    if (url.pathname === '/api/game/options') return json(res, { decks: [], cardCatalog: [], trainers: [] });
    if (url.pathname === '/api/player/progression') return json(res, { progression: state.progression });
    if (url.pathname === '/api/shop/packs') return json(res, { packs });
    if (url.pathname === '/api/shop/open-pack') {
      let body = '';
      for await (const part of req) body += part;
      await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (state.dropNext) {
        state.dropNext = false;
        openPackFromBody(body);
        res.writeHead(500);
        res.end();
        return;
      }
      const result = openPackFromBody(body);
      return json(res, { progression: result.progression });
    }
    return json(res, {});
  }
  const routed = ['/shop', '/home', '/cards', '/decks', '/login', '/profile'];
  const relative = routed.includes(url.pathname) ? 'home-next.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(STATIC, relative);
  if (!file.startsWith(STATIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  const playwrightModule = process.env.PLAYWRIGHT_MODULE
    || ['playwright', 'playwright-core', '/tmp/pw-core/node_modules/playwright-core', '/opt/node22/lib/node_modules/playwright']
      .map((id) => { try { return require.resolve(id); } catch (e) { return null; } })
      .find(Boolean);
  if (!playwrightModule) throw new Error('Playwright is not installed');
  const { chromium } = require(playwrightModule);
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM
    || ['/opt/pw-browsers/chromium', '/opt/google/chrome/chrome', '/usr/local/bin/google-chrome']
      .find((candidate) => fs.existsSync(candidate));
  const browser = await chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  let assertions = 0;
  const check = (condition, message) => { assert.ok(condition, message); assertions++; };
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/status of 500/.test(msg.text())) errors.push(msg.text());
  });
  const boot = async () => {
    await page.goto(`http://127.0.0.1:${PORT}/shop`);
    await page.locator('.sg-pack[data-pack="pack_fire"]').waitFor();
    await page.waitForTimeout(300);
  };
  const pendingKey = () => page.evaluate(() => localStorage.getItem('sieglingsPendingPackOpenRequest:pack-fixture'));
  try {
    await page.addInitScript(() => localStorage.setItem('sieglingsAuthToken', 'fixture-token'));
    state.delay = 400;
    await boot();
    await page.locator('.sg-pack[data-pack="pack_fire"]').evaluate((button) => { button.click(); button.click(); button.click(); });
    await page.locator('[data-gacha]').waitFor();
    await page.locator('[data-flip]').first().waitFor({ timeout: 8000 });
    check(state.calls.length === 1, `Repeated clicks submit only one open-pack, got ${state.calls.length}`);
    check(state.progression.gold === 350, `Gold charged once, got ${state.progression.gold}`);
    check(Boolean(state.calls[0].requestId), 'Open-pack sends a requestId');
    check((await page.locator('[data-gacha-note]').textContent()).includes('2 cards'), 'Reveal shows the server pull');
    check(!(await pendingKey()), 'Successful reveal clears the pending request id');
    await page.screenshot({ path: path.join(OUT, 'phone-pack-reveal.png') });
    await page.screenshot({ path: path.join(ARTIFACTS, 'hub-pack-open-once.png') });

    reset({ delay: 50, dropNext: true });
    await boot();
    await page.locator('.sg-pack[data-pack="pack_fire"]').click();
    await page.locator('[data-gacha-note]').waitFor();
    await page.waitForFunction(() => {
      const note = document.querySelector('[data-gacha-note]');
      return note && /collection/i.test(note.textContent || '');
    });
    check(state.calls.length === 1 && state.progression.gold === 350, 'Dropped response still charged once');
    const stored = JSON.parse(await pendingKey());
    check(stored.requests[0].requestId === state.calls[0].requestId, 'Unconfirmed open keeps the same request id');
    await page.screenshot({ path: path.join(OUT, 'phone-pack-unconfirmed.png') });
    await page.screenshot({ path: path.join(ARTIFACTS, 'hub-pack-open-retry-needed.png') });

    await page.locator('[data-gacha-done]').click();
    await page.locator('.sg-pack[data-pack="pack_fire"]').waitFor();
    await page.locator('.sg-pack[data-pack="pack_fire"]').click();
    await page.locator('[data-flip]').first().waitFor({ timeout: 8000 });
    check(state.calls.length === 2, 'Retry posts again with the stored id');
    check(state.calls[0].requestId === state.calls[1].requestId, 'Retry reuses the original requestId');
    check(state.progression.gold === 350, 'Idempotent retry does not charge a second pack');
    check((await page.locator('[data-gacha-note]').textContent()).includes('2 cards'), 'Retry reveals the original pull');
    await page.screenshot({ path: path.join(OUT, 'phone-pack-retry.png') });
    await page.screenshot({ path: path.join(ARTIFACTS, 'hub-pack-open-idempotent-retry.png') });

    check(errors.length === 0, `No browser errors: ${errors.join('\n')}`);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ passed: true, assertions, gold: state.progression.gold, calls: state.calls }, null, 2));
    console.log(`${assertions} assertions passed; screenshots in ${OUT}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
