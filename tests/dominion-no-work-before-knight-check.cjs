/* Dominion: nothing earns until the knight is founded. */
function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
    '/opt/node22/lib/node_modules/playwright',
    '/tmp/pw-demo/node_modules/playwright-core'
  ].filter(Boolean);
  for (const id of candidates) {
    try { return require(id); } catch (_) { /* try next */ }
  }
  throw new Error('playwright not found; set PLAYWRIGHT_MODULE');
}
const { chromium } = loadPlaywright();
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../src/main/resources/static');
const PORT = 8947;
const OUT = '/opt/cursor/artifacts';
const SAVE_KEY = 'siegelingsDominionPrototype';

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/' || url === '/dominion') url = '/dominion.html';
  const file = path.join(ROOT, url.replace(/^\//, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('missing'); return;
  }
  res.writeHead(200, { 'Content-Type': contentType(file) });
  fs.createReadStream(file).pipe(res);
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const exe = process.env.PLAYWRIGHT_CHROMIUM
    || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '/usr/local/bin/google-chrome');
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // —— 1. Fresh save: idle, no XP even after a long advance ——
  await page.goto('http://127.0.0.1:' + PORT + '/dominion.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dominionDebug && window.dominionDebug.state());

  let snap = await page.evaluate(() => {
    const s = window.dominionDebug.state();
    return {
      made: !!s.knight.made,
      task: s.knight.task,
      woodXp: s.knight.skills.woodcutting || 0,
      timber: s.inv.timber || 0,
      modal: document.querySelector('#ckModal:not([hidden])') ? document.querySelector('#ckModal').dataset.kind : null,
      createOpen: !!(document.querySelector('.dm-cc-sheet') && !document.getElementById('ckModal').hidden)
    };
  });
  assert(!snap.made, 'fresh knight should not be made');
  assert(snap.task && snap.task.kind === 'idle', 'fresh task should be idle, got ' + JSON.stringify(snap.task));
  assert(snap.woodXp === 0, 'fresh woodcutting XP should be 0');
  assert(snap.createOpen, 'create sheet should be open');
  const timberStart = snap.timber;

  await page.evaluate(() => window.dominionDebug.advance(4 * 60 * 60 * 1000));
  snap = await page.evaluate(() => {
    const s = window.dominionDebug.state();
    return { made: !!s.knight.made, task: s.knight.task, woodXp: s.knight.skills.woodcutting || 0, timber: s.inv.timber || 0 };
  });
  assert(!snap.made, 'still unfounded after advance');
  assert(snap.task.kind === 'idle', 'still idle after advance');
  assert(snap.woodXp === 0, 'no woodcutting XP before founding, got ' + snap.woodXp);
  assert(snap.timber === timberStart, 'timber should not rise before founding');

  await page.screenshot({ path: path.join(OUT, 'dominion-unfounded-idle.png'), fullPage: true });

  // —— 2. Corrupt mid-create save (old chop_pine + XP) is wiped on reload ——
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    raw.knight.made = false;
    raw.knight.task = { kind: 'gather', id: 'chop_pine' };
    raw.knight.skills.woodcutting = 5000;
    raw.knight.prog = 0.5;
    localStorage.setItem(key, JSON.stringify(raw));
  }, SAVE_KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dominionDebug && window.dominionDebug.state());
  snap = await page.evaluate(() => {
    const s = window.dominionDebug.state();
    return { made: !!s.knight.made, task: s.knight.task, woodXp: s.knight.skills.woodcutting || 0, prog: s.knight.prog };
  });
  assert(!snap.made, 'corrupt save stays unfounded');
  assert(snap.task.kind === 'idle', 'corrupt chop_pine should sanitize to idle');
  assert(snap.woodXp === 0, 'pre-founding woodcutting XP should be wiped');
  assert(snap.prog === 0, 'prog should reset');

  // —— 3. Found knight → still idle → choose work → then XP flows ——
  await page.fill('#dmKnightGiven', 'Test');
  for (let i = 0; i < 5; i++) {
    const label = await page.locator('.dm-cc-sheet footer .ck-btn.is-primary').textContent();
    if (/Begin Dominion/i.test(label)) break;
    const pageName = await page.locator('.dm-cc-sheet').getAttribute('data-page');
    if (pageName === 'biome') await page.click('.dm-cc-biome[data-arg="biome:woodland"]');
    if (pageName === 'starter') await page.click('.dm-cc-starter[data-arg="starter:fawny"]');
    await page.click('.dm-cc-sheet footer .ck-btn.is-primary');
    await page.waitForTimeout(50);
  }
  await page.click('.dm-cc-sheet footer .ck-btn.is-primary'); // Begin Dominion
  await page.waitForFunction(() => window.dominionDebug.state().knight.made);

  snap = await page.evaluate(() => {
    const s = window.dominionDebug.state();
    return {
      made: !!s.knight.made,
      name: s.knight.name,
      task: s.knight.task,
      woodXp: s.knight.skills.woodcutting || 0,
      tab: s.ui.tab,
      working: document.body.innerText.includes('Working') && s.knight.task.kind !== 'idle'
    };
  });
  assert(snap.made, 'knight should be made after Begin Dominion');
  assert(/Test/.test(snap.name), 'name should include Test, got ' + snap.name);
  assert(snap.task.kind === 'idle', 'after founding, knight rests until player picks work');
  assert(snap.woodXp === 0, 'still no XP right after founding');
  assert(snap.tab === 'knight', 'lands on knight tab');

  await page.screenshot({ path: path.join(OUT, 'dominion-founded-idle.png'), fullPage: true });

  // Start pine work via debug act
  const taskMsg = await page.evaluate(() => window.dominionDebug.act('task', 'gather:chop_pine'));
  snap = await page.evaluate(() => {
    const s = window.dominionDebug.state();
    return { task: s.knight.task, woodXp: s.knight.skills.woodcutting || 0 };
  });
  assert(snap.task.kind === 'gather' && snap.task.id === 'chop_pine', 'task assigned after founding');

  await page.evaluate(() => window.dominionDebug.advance(60 * 60 * 1000));
  snap = await page.evaluate(() => {
    const s = window.dominionDebug.state();
    return { woodXp: s.knight.skills.woodcutting || 0, timber: s.inv.timber || 0, task: s.knight.task };
  });
  assert(snap.woodXp > 0, 'woodcutting XP should rise after choosing work');
  assert(snap.timber > timberStart, 'timber should rise while chopping');

  await page.evaluate(() => window.dominionDebug.act('tab', 'work'));
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, 'dominion-work-after-choose.png'), fullPage: true });

  assert(errors.length === 0, 'page errors: ' + errors.join(' | '));
  console.log('PASS: dominion no-work-before-knight (8 checks)');
  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error('FAIL:', e);
  try { server.close(); } catch (_) {}
  process.exit(1);
});
