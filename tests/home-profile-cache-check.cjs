// Behavioural guard for the hub-side cousin of #683: a successful saved-deck
// save or delete used to write the raw buildProfileResponse into
// sieglingsAuthProfile. That payload omits `progression` when the isolated
// Firestore read fails, which locks a signed-in hub behind the starter gate
// and poisons the Play page's shared cache.
//
//   node tests/home-profile-cache-check.cjs
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() {
  const candidates = [
    '/opt/node22/lib/node_modules/playwright',
    'playwright',
    'playwright-core'
  ];
  for (const id of candidates) {
    try { return require(id); } catch (e) { /* try next */ }
  }
  throw new Error('playwright is not installed');
}
function chromePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    '/opt/pw-browsers/chromium',
    '/opt/google/chrome/chrome',
    '/usr/local/bin/chrome'
  ].filter(Boolean);
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return undefined;
}
const { chromium } = loadPlaywright();
const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const PORT = Number(process.env.PORT || 8976);
const TYPES = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
                '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
                '.webp':'image/webp', '.jpg':'image/jpeg' };

const PROFILE = {
  authenticated: true,
  user: { id: 'u1', email: 'pat@example.com', displayName: 'Pat' },
  progression: {
    starterChosen: true,
    tutorialCompleted: true,
    ownedTotal: 40,
    customDeckUnlocked: true,
    gold: 250,
    remnants: 10,
    ownedCards: { 'fire-ember': 3 },
    marker: 'PRIOR'
  },
  savedDecks: [{
    id: 'deck-1',
    name: 'Mini Flame',
    custom: true,
    customDeckCards: ['fire-ember'],
    trainerId: 'pyla',
    trainerName: 'Pyla'
  }],
  friends: [],
  incomingFriendRequests: [],
  outgoingFriendRequests: [],
  matchHistory: []
};

const OPTIONS = {
  decks: [],
  trainers: [{ id: 'pyla', name: 'Pyla', element: 'FIRE' }],
  cardCatalog: [{ id: 'fire-ember', name: 'Ember', element: 'FIRE', type: 'SIEGLING', rarity: 'COMMON' }],
  liveElements: ['FIRE'],
  catalogVersion: 1
};

const server = http.createServer((req, res) => {
  const clean = req.url.split('?')[0].split('#')[0];
  if (clean.startsWith('/api/')) {
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end('{}');
  }
  const mapped = (clean === '/home' || clean === '/decks' || clean === '/') ? 'home.html' : clean;
  const file = path.join(STATIC, mapped);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const failures = [];
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures.push(name);
}

async function bootDecks(browser, { authMe, deleteBody, progressionBody }) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.addInitScript(({ token, profile }) => {
    localStorage.setItem('sieglingsAuthToken', token);
    localStorage.setItem('sieglingsAuthProfile', JSON.stringify({
      savedAt: Date.now(),
      profile
    }));
  }, { token: 'tok', profile: PROFILE });

  const liveAuth = { ...authMe, savedDecks: [...(authMe.savedDecks || [])] };
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const pathName = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (pathName === '/api/auth/me') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveAuth) });
    }
    if (pathName === '/api/profile/decks/delete') {
      liveAuth.savedDecks = Array.isArray(deleteBody.savedDecks) ? [...deleteBody.savedDecks] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deleteBody) });
    }
    if (pathName === '/api/player/progression') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(progressionBody) });
    }
    if (pathName === '/api/game/options' || pathName === '/api/game/catalog-version') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OPTIONS) });
    }
    if (pathName === '/api/shop/packs') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ packs: [] }) });
    }
    if (pathName === '/assets/creature-descriptions.json') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (pathName.startsWith('/api/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.continue();
  });

  await page.goto(`http://127.0.0.1:${PORT}/decks`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-delete-custom-deck="deck-1"]', { timeout: 15000 });
  return page;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
  try {
    console.log('hub deck delete with omitted progression');
    const omitProgression = { ...PROFILE };
    delete omitProgression.progression;
    omitProgression.savedDecks = [];
    omitProgression.deletedCount = 1;
    omitProgression.deckMissing = false;

    const page = await bootDecks(browser, {
      authMe: PROFILE,
      deleteBody: omitProgression,
      progressionBody: { error: 'unavailable' }
    });

    const gateBefore = await page.locator('#starterGate').evaluate(el => el.classList.contains('hidden'));
    const hubBefore = await page.locator('#hubGrid').evaluate(el => el.classList.contains('hidden'));
    check('hub is open before delete', gateBefore && !hubBefore);

    await page.click('[data-delete-custom-deck="deck-1"]');
    await page.waitForSelector('#deckDeleteConfirmModal:not(.hidden)', { timeout: 5000 });
    await page.click('#deckDeleteConfirmGo');
    await page.waitForFunction(() => !document.querySelector('[data-delete-custom-deck="deck-1"]'), null, { timeout: 5000 });

    const after = await page.evaluate(() => {
      const raw = localStorage.getItem('sieglingsAuthProfile');
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) {}
      const profile = parsed && parsed.profile ? parsed.profile : parsed;
      return {
        gateHidden: document.getElementById('starterGate')?.classList.contains('hidden'),
        hubHidden: document.getElementById('hubGrid')?.classList.contains('hidden'),
        marker: profile && profile.progression ? profile.progression.marker : null,
        starterChosen: profile && profile.progression ? profile.progression.starterChosen : null
      };
    });
    await page.screenshot({ path: '/opt/cursor/artifacts/hub-delete-keeps-progression.png' });
    await page.close();

    const tileGone = await page.locator('[data-delete-custom-deck="deck-1"]').count().then(n => n === 0).catch(() => true);
    check('tile is gone after confirm', tileGone);
    check('cache still has the prior progression marker', after.marker === 'PRIOR', 'marker=' + after.marker);
    check('cache still says starterChosen', after.starterChosen === true);
    check('starter gate stays closed', after.gateHidden === true, 'gateHidden=' + after.gateHidden);
    check('hub stays visible', after.hubHidden === false, 'hubHidden=' + after.hubHidden);

    console.log('hub /api/auth/me omits progression after a live snapshot exists');
    const page2 = await bootDecks(browser, {
      authMe: (() => { const body = { ...PROFILE }; delete body.progression; return body; })(),
      deleteBody: omitProgression,
      progressionBody: { error: 'unavailable' }
    });
    await page2.waitForTimeout(1500);
    const sync = await page2.evaluate(() => {
      const raw = localStorage.getItem('sieglingsAuthProfile');
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) {}
      const profile = parsed && parsed.profile ? parsed.profile : parsed;
      return {
        gateHidden: document.getElementById('starterGate')?.classList.contains('hidden'),
        marker: profile && profile.progression ? profile.progression.marker : null
      };
    });
    await page2.close();
    check('partial auth/me keeps the cached progression', sync.marker === 'PRIOR', 'marker=' + sync.marker);
    check('partial auth/me does not open the starter gate', sync.gateHidden === true, 'gateHidden=' + sync.gateHidden);
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) {
    console.error(`\n${failures.length} failed`);
    process.exit(1);
  }
  console.log('\nall checks passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
