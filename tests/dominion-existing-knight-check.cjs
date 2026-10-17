// A Keep saved before character creation has no knight.made. Boot must not trap
// that knight in the undismissable "Make your knight" sheet (Begin replaces
// knight.name). A brand-new save still has to be named. An empty device that
// then loads a played cloud Keep must drop the sheet that boot opened first.
//
//   node tests/dominion-existing-knight-check.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
function loadChromium() {
  try { return require('/opt/node22/lib/node_modules/playwright').chromium; } catch (e) { /* this image */ }
  try { return require('playwright').chromium; } catch (e) { /* local */ }
  return require('playwright-core').chromium;
}
const chromium = loadChromium();
function browserExecutable() {
  return ['/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
    .find((p) => fs.existsSync(p));
}

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const PORT = 8767;
const SAVE_KEY = 'siegelingsDominionPrototype';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'dominion.html';
    const file = path.join(STATIC, rel);
    if (!file.startsWith(STATIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('nope'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

function playedSave(name) {
  return {
    schema: 3,
    t: Date.now(),
    rev: 12,
    runs: 3,
    knight: { name: name, task: { kind: 'idle' } },
    b: { hall: 3, woodlot: 2 },
    log: [{ t: Date.now() - 1000, text: 'Raised the Woodlot.' }],
    sync: { version: 2 }
  };
}

function freshSaved() {
  return {
    schema: 3,
    t: Date.now(),
    knight: { name: 'Ser Airek', task: { kind: 'idle' } },
    b: { hall: 1, woodlot: 0 },
    log: [],
    sync: { version: 0 }
  };
}

async function open(browser, seed, opts) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  if (opts && opts.cloud) {
    await page.route('**/api/dominion**', (route) => {
      const url = route.request().url();
      if (url.indexOf('/api/dominion/art') >= 0) {
        route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: 4, name: 'Account Name', state: JSON.stringify(opts.cloud), inbox: [] })
        });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 5, inbox: [] }) });
    });
  }
  await page.addInitScript((arg) => {
    localStorage.clear();
    if (arg.token) localStorage.setItem('sieglingsAuthToken', arg.token);
    if (arg.save) localStorage.setItem(arg.key, JSON.stringify(arg.save));
  }, { key: SAVE_KEY, save: seed || null, token: opts && opts.token || '' });
  await page.goto('http://127.0.0.1:' + PORT + '/dominion.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dominionDebug && window.dominionDebug.state());
  return { page, errors };
}

function sheet(page) {
  return page.evaluate(() => {
    const modal = document.getElementById('ckModal');
    const title = document.getElementById('ckModalTitle');
    const knight = window.dominionDebug.state().knight;
    return {
      hidden: !modal || modal.hidden,
      title: title ? title.textContent : '',
      name: knight.name,
      made: knight.made === true,
      given: knight.given || ''
    };
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: browserExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const shots = path.join('/opt/cursor/artifacts');
  try {
    const played = await open(browser, playedSave('Pyra'));
    const playedSheet = await sheet(played.page);
    await played.page.keyboard.press('Escape');
    const playedAfterEsc = await sheet(played.page);
    await played.page.screenshot({ path: path.join(shots, 'dominion-played-keep.png') });
    if (played.errors.length) throw new Error('played page errors: ' + played.errors.join(' | '));
    if (!playedSheet.hidden || playedSheet.title === 'Make your knight') throw new Error('played keep opened creation: ' + JSON.stringify(playedSheet));
    if (playedSheet.name !== 'Pyra' || !playedSheet.made || playedSheet.given !== 'Pyra') throw new Error('played knight was rewritten: ' + JSON.stringify(playedSheet));
    if (!playedAfterEsc.hidden || playedAfterEsc.name !== 'Pyra') throw new Error('escape rewrote the played knight: ' + JSON.stringify(playedAfterEsc));
    await played.page.close();

    const fresh = await open(browser, null);
    await fresh.page.waitForFunction(() => {
      const title = document.getElementById('ckModalTitle');
      return title && title.textContent === 'Make your knight';
    });
    await fresh.page.keyboard.press('Escape');
    const freshSheet = await sheet(fresh.page);
    await fresh.page.screenshot({ path: path.join(shots, 'dominion-new-knight.png') });
    if (fresh.errors.length) throw new Error('fresh page errors: ' + fresh.errors.join(' | '));
    if (freshSheet.hidden || freshSheet.title !== 'Make your knight' || freshSheet.made) throw new Error('fresh save skipped creation: ' + JSON.stringify(freshSheet));
    await fresh.page.close();

    const unplayed = await open(browser, freshSaved());
    await unplayed.page.waitForFunction(() => {
      const title = document.getElementById('ckModalTitle');
      return title && title.textContent === 'Make your knight';
    });
    const unplayedSheet = await sheet(unplayed.page);
    if (unplayed.errors.length) throw new Error('unplayed page errors: ' + unplayed.errors.join(' | '));
    if (unplayedSheet.hidden || unplayedSheet.made) throw new Error('unplayed keep skipped creation: ' + JSON.stringify(unplayedSheet));
    await unplayed.page.close();

    const cloud = await open(browser, null, { token: 'test-token', cloud: playedSave('Keeper Voss') });
    await cloud.page.waitForFunction(() => {
      const knight = window.dominionDebug && window.dominionDebug.state() && window.dominionDebug.state().knight;
      const modal = document.getElementById('ckModal');
      return knight && knight.name === 'Keeper Voss' && knight.made === true && modal && modal.hidden;
    });
    const cloudSheet = await sheet(cloud.page);
    await cloud.page.screenshot({ path: path.join(shots, 'dominion-cloud-keep.png') });
    if (cloud.errors.length) throw new Error('cloud page errors: ' + cloud.errors.join(' | '));
    if (!cloudSheet.hidden || cloudSheet.name !== 'Keeper Voss' || !cloudSheet.made) throw new Error('cloud keep stayed on creation: ' + JSON.stringify(cloudSheet));
    await cloud.page.close();

    console.log(JSON.stringify({ played: playedSheet, fresh: freshSheet, unplayed: unplayedSheet, cloud: cloudSheet }));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
