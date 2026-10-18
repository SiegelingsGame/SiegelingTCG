// A Keep saved before character creation has no knight.made. Begin Dominion must
// not treat that as a first founding: seedStarter replaces comps and deletes
// every joined Siegeling. A brand-new save still has to be named and receives
// exactly one starter. An empty device that then loads a played cloud Keep must
// drop the sheet boot opened first.
//
//   node tests/dominion-existing-knight-check.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
function loadChromium() {
  const candidates = [
    '/opt/node22/lib/node_modules/playwright',
    'playwright',
    '/tmp/pw-demo/node_modules/playwright-core',
    'playwright-core'
  ];
  for (const id of candidates) {
    try { return require(id).chromium; } catch (e) { /* next */ }
  }
  throw new Error('playwright is not installed');
}
const chromium = loadChromium();
function browserExecutable() {
  return ['/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
    .find((p) => fs.existsSync(p));
}

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const PORT = 8773;
const SAVE_KEY = 'siegelingsDominionPrototype';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

function company() {
  return {
    cacty: { species: 'cacty', nick: 'Spike', joined: true, bond: 88, job: { kind: 'rest' }, explore: 0, treats: { day: '', n: 0 }, xp: 40, legend: false },
    sundile: { species: 'sundile', nick: '', joined: true, bond: 55, job: { kind: 'rest' }, explore: 0, treats: { day: '', n: 0 }, xp: 12, legend: false }
  };
}

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
    comps: company(),
    log: [{ t: Date.now() - 1000, text: 'Raised the Woodlot.' }],
    sync: { version: 2 }
  };
}

function legacyCompany(name) {
  return {
    schema: 3,
    t: Date.now(),
    rev: 4,
    knight: { name: name, task: { kind: 'idle' } },
    b: { hall: 1, woodlot: 0 },
    comps: company(),
    log: [],
    sync: { version: 1 }
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
  const posts = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  if (opts && opts.cloud) {
    await page.route(/\/api\/dominion/, (route) => {
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
      posts.push(route.request().postData() || '');
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
  return { page, errors, posts };
}

function sheet(page) {
  return page.evaluate(() => {
    const modal = document.getElementById('ckModal');
    const title = document.getElementById('ckModalTitle');
    const kicker = document.querySelector('#ckModal .ck-kicker');
    const knight = window.dominionDebug.state().knight;
    const s = window.dominionDebug.state();
    const comps = {};
    Object.keys(s.comps || {}).forEach((id) => {
      const c = s.comps[id];
      comps[id] = { joined: !!c.joined, bond: c.bond, xp: c.xp, nick: c.nick || '' };
    });
    return {
      hidden: !modal || modal.hidden,
      title: title ? title.textContent : '',
      kicker: kicker ? kicker.textContent : '',
      name: knight.name,
      made: knight.made === true,
      given: knight.given || '',
      tab: s.ui.tab,
      starter: s.starter || '',
      party: (s.prep.party || []).slice(),
      comps: comps
    };
  });
}

function keptCompany(comps) {
  const ids = Object.keys(comps || {});
  return ids.length === 2 && comps.cacty && comps.sundile
    && comps.cacty.joined && comps.sundile.joined
    && comps.cacty.nick === 'Spike' && comps.cacty.xp === 40 && comps.sundile.xp === 12
    && comps.cacty.bond >= 88 && comps.cacty.bond < 95
    && comps.sundile.bond >= 55 && comps.sundile.bond < 65;
}

async function clickAct(page, act, arg) {
  const sel = arg
    ? '[data-act="' + act + '"][data-arg="' + arg + '"]'
    : '[data-act="' + act + '"]';
  await page.locator(sel).first().click();
}

async function foundCacty(page, given) {
  await page.locator('#dmKnightGiven').fill(given);
  await clickAct(page, 'cc-next');
  await page.waitForFunction(() => document.getElementById('ckModalTitle') && document.getElementById('ckModalTitle').textContent === 'Crest');
  await clickAct(page, 'cc-next');
  await page.waitForFunction(() => document.getElementById('ckModalTitle') && document.getElementById('ckModalTitle').textContent === 'Land');
  await clickAct(page, 'cc', 'biome:woodland');
  await clickAct(page, 'cc-next');
  await page.waitForFunction(() => document.getElementById('ckModalTitle') && document.getElementById('ckModalTitle').textContent === 'Starter');
  await clickAct(page, 'cc', 'starter:cacty');
  await clickAct(page, 'cc-next');
  await page.waitForFunction(() => document.getElementById('ckModalTitle') && document.getElementById('ckModalTitle').textContent === 'Sprite');
  await clickAct(page, 'cc-next');
  await page.waitForFunction(() => document.getElementById('ckModalTitle') && document.getElementById('ckModalTitle').textContent === 'Summary');
  await clickAct(page, 'cc-save');
  await page.waitForFunction(() => {
    const modal = document.getElementById('ckModal');
    return modal && modal.hidden && window.dominionDebug.state().knight.made === true;
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: browserExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const shots = path.join('/opt/cursor/artifacts');
  fs.mkdirSync(shots, { recursive: true });
  try {
    const played = await open(browser, playedSave('Pyra'));
    const playedSheet = await sheet(played.page);
    await played.page.keyboard.press('Escape');
    const playedAfterEsc = await sheet(played.page);
    await played.page.screenshot({ path: path.join(shots, 'dominion-played-keep.png') });
    if (played.errors.length) throw new Error('played page errors: ' + played.errors.join(' | '));
    if (!playedSheet.hidden) throw new Error('played keep opened creation: ' + JSON.stringify(playedSheet));
    if (playedSheet.name !== 'Pyra' || !playedSheet.made || playedSheet.given !== 'Pyra') throw new Error('played knight was rewritten: ' + JSON.stringify(playedSheet));
    if (!keptCompany(playedSheet.comps)) throw new Error('played company was wiped: ' + JSON.stringify(playedSheet.comps));
    if (!playedAfterEsc.hidden || playedAfterEsc.name !== 'Pyra') throw new Error('escape rewrote the played knight: ' + JSON.stringify(playedAfterEsc));
    await played.page.close();

    const legacy = await open(browser, legacyCompany('Pyra'));
    const legacySheet = await sheet(legacy.page);
    await legacy.page.screenshot({ path: path.join(shots, 'dominion-legacy-company.png') });
    if (legacy.errors.length) throw new Error('legacy page errors: ' + legacy.errors.join(' | '));
    if (!legacySheet.hidden || legacySheet.name !== 'Pyra' || !legacySheet.made) throw new Error('legacy company was forced through founding: ' + JSON.stringify(legacySheet));
    if (!keptCompany(legacySheet.comps)) throw new Error('legacy company was wiped: ' + JSON.stringify(legacySheet.comps));
    await legacy.page.close();

    const fresh = await open(browser, null);
    await fresh.page.waitForFunction(() => {
      const title = document.getElementById('ckModalTitle');
      return title && title.textContent === 'Knight';
    });
    await fresh.page.keyboard.press('Escape');
    const freshSheet = await sheet(fresh.page);
    if (fresh.errors.length) throw new Error('fresh page errors: ' + fresh.errors.join(' | '));
    if (freshSheet.hidden || freshSheet.title !== 'Knight' || freshSheet.kicker !== 'Found your Dominion' || freshSheet.made) {
      throw new Error('fresh save skipped creation: ' + JSON.stringify(freshSheet));
    }
    await foundCacty(fresh.page, 'Bram');
    const founded = await sheet(fresh.page);
    await fresh.page.screenshot({ path: path.join(shots, 'dominion-new-knight.png') });
    if (fresh.errors.length) throw new Error('founding page errors: ' + fresh.errors.join(' | '));
    if (founded.name !== 'Ser Bram' || founded.tab !== 'knight' || founded.starter !== 'cacty' || founded.party.join() !== 'cacty') {
      throw new Error('fresh founding did not seed Cacty: ' + JSON.stringify(founded));
    }
    if (Object.keys(founded.comps).length !== 1 || !founded.comps.cacty.joined) throw new Error('fresh founding roster: ' + JSON.stringify(founded.comps));
    await fresh.page.close();

    const trapped = await open(browser, null);
    await trapped.page.waitForFunction(() => document.getElementById('dmKnightGiven'));
    await trapped.page.evaluate((roster) => {
      const s = window.dominionDebug.state();
      s.knight.name = 'Pyra';
      s.knight.made = false;
      s.comps = roster;
    }, company());
    await foundCacty(trapped.page, 'Zed');
    const trappedSheet = await sheet(trapped.page);
    await trapped.page.screenshot({ path: path.join(shots, 'dominion-begin-keeps-company.png') });
    if (trapped.errors.length) throw new Error('begin page errors: ' + trapped.errors.join(' | '));
    if (trappedSheet.name !== 'Pyra' || !trappedSheet.made || !trappedSheet.hidden) throw new Error('Begin rewrote the existing knight: ' + JSON.stringify(trappedSheet));
    if (!keptCompany(trappedSheet.comps)) throw new Error('Begin wiped the company: ' + JSON.stringify(trappedSheet.comps));
    await trapped.page.close();

    const unplayed = await open(browser, freshSaved());
    await unplayed.page.waitForFunction(() => {
      const title = document.getElementById('ckModalTitle');
      return title && title.textContent === 'Knight';
    });
    const unplayedSheet = await sheet(unplayed.page);
    if (unplayed.errors.length) throw new Error('unplayed page errors: ' + unplayed.errors.join(' | '));
    if (unplayedSheet.hidden || unplayedSheet.made || unplayedSheet.kicker !== 'Found your Dominion') throw new Error('unplayed keep skipped creation: ' + JSON.stringify(unplayedSheet));
    await unplayed.page.close();

    const cloud = await open(browser, null, { token: 'test-token', cloud: playedSave('Keeper Voss') });
    await cloud.page.waitForFunction(() => {
      const knight = window.dominionDebug && window.dominionDebug.state() && window.dominionDebug.state().knight;
      const modal = document.getElementById('ckModal');
      return knight && knight.name === 'Keeper Voss' && knight.made === true && modal && modal.hidden;
    });
    const postDeadline = Date.now() + 8000;
    while (!cloud.posts.length && Date.now() < postDeadline) await new Promise((resolve) => setTimeout(resolve, 50));
    const cloudSheet = await sheet(cloud.page);
    await cloud.page.screenshot({ path: path.join(shots, 'dominion-cloud-keep.png') });
    if (cloud.errors.length) throw new Error('cloud page errors: ' + cloud.errors.join(' | '));
    if (!cloudSheet.hidden || cloudSheet.name !== 'Keeper Voss' || !cloudSheet.made) throw new Error('cloud keep stayed on creation: ' + JSON.stringify(cloudSheet));
    if (!keptCompany(cloudSheet.comps)) throw new Error('cloud company was wiped: ' + JSON.stringify(cloudSheet.comps));
    const uploaded = cloud.posts.map((raw) => { try { return JSON.parse(JSON.parse(raw).state); } catch (e) { return null; } }).filter(Boolean);
    if (!uploaded.length) throw new Error('cloud keep was not synced');
    const sent = uploaded[uploaded.length - 1];
    if (!sent.comps || !keptCompany(sent.comps) || sent.knight.name !== 'Keeper Voss') {
      throw new Error('cloud sync uploaded a wiped keep: ' + JSON.stringify({ name: sent.knight && sent.knight.name, comps: sent.comps }));
    }
    await cloud.page.close();

    console.log(JSON.stringify({
      played: { name: playedSheet.name, comps: playedSheet.comps },
      legacy: { name: legacySheet.name, comps: legacySheet.comps },
      founded: { name: founded.name, tab: founded.tab, comps: founded.comps },
      trapped: { name: trappedSheet.name, comps: trappedSheet.comps },
      unplayed: { title: unplayedSheet.title, made: unplayedSheet.made },
      cloud: { name: cloudSheet.name, comps: cloudSheet.comps }
    }));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
