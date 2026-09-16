// Browser regression for hub -> Arena -> Siege account continuity.
// Public catalog/roster fixtures are cached in output/account-check-*.json.
// The first run fetches public read-only data; no live account is used.
// All account data and mutations stay on this local fixture server.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const staticRoot = path.join(root, 'src/main/resources/static');
const out = path.join(root, 'output/web-game/account-selection');
async function read(name, endpoint) {
  const file = path.join(root, 'output', name);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const response = await fetch('https://siegelingstcgtesting.web.app' + endpoint, { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Public fixture failed: ${endpoint}`);
  const data = await response.json();
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data));
  return data;
}
let options, roster, paid, progression, saved, profile;
async function prepare() {
[options, roster] = await Promise.all([read('account-check-options.json', '/api/game/options'), read('account-check-roster.json', '/api/siege/roster')]);
paid = options.decks.find(d => d.elements.includes('WATER') || d.elements.includes('ELECTRIC'));
assert.ok(paid);
progression = {
  gold: 3130, remnants: 40, ownedTotal: 100, customDeckUnlocked: true,
  ownedCards: Object.fromEntries(options.cardCatalog.map(c => [c.id, 3])),
  ownedTrainers: options.trainers.map(t => ({ id: t.id, level: 1 })),
  starterPackId: 'pack_water', purchasedDeckIds: [paid.id],
  unlockedDeckIds: options.decks.map(d => d.id), premadeDeckPrice: 500
};
saved = [{ id: 'owned-custom', name: 'My Owned Custom Deck', custom: true,
  customDeckCards: options.cardCatalog.slice(0, 10).flatMap(c => [c.id, c.id, c.id]),
  trainerId: options.defaultTrainerId, trainerName: 'Pyla' }];
profile = { authenticated: true, cookieSession: true, user: { id: 'fixture-owner', displayName: 'Rook', email: 'fixture@example.test' }, progression, savedDecks: saved, matchHistory: [] };
Object.assign(roster, { loggedIn: true, accountReady: true, accountName: 'Rook', gold: 3130, veteranTeams: [], veterans: [] });
roster.siegelings.forEach(s => { s.owned = true; if (s.purchaseOnly) { s.canUnlock = true; s.lockReason = 'BUY'; } });
}
let holdAuth = false, requests = [], unlockCalls = 0;
const json = (res, value) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8954');
  if (url.pathname.startsWith('/api/')) {
    requests.push({ path: url.pathname, auth: req.headers.authorization });
    if (url.pathname === '/api/auth/me') {
      if (holdAuth) return; // cached hub profile must paint Arena before this answers
      return json(res, profile);
    }
    if (url.pathname === '/api/game/options') return json(res, options);
    if (url.pathname === '/api/player/progression') return json(res, { progression });
    if (url.pathname === '/api/profile/decks') return json(res, { decks: saved });
    if (url.pathname === '/api/siege/roster') return json(res, roster);
    if (url.pathname === '/api/siege/run/active') return json(res, { runs: [] });
    if (url.pathname === '/api/siege/siegling/unlock') {
      let body = ''; for await (const part of req) body += part;
      const s = roster.siegelings.find(s => s.id === JSON.parse(body).sieglingId);
      roster.gold -= s.unlockCost; s.expeditionStarter = true; s.canUnlock = false; s.lockReason = null;
      unlockCalls++; return json(res, roster);
    }
    return json(res, {});
  }
  const routes = { '/home': 'home-next.html', '/decks': 'home-next.html', '/battle': 'play.html', '/play': 'play.html', '/siege': 'adventure.html' };
  const file = path.resolve(staticRoot, routes[url.pathname] || decodeURIComponent(url.pathname).replace(/^\/+/, ''));
  if (!file.startsWith(staticRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
async function main() {
  await prepare();
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(8954, '127.0.0.1', resolve));
  if (process.argv.includes('--serve')) { console.log('Account fixture at http://127.0.0.1:8954'); return; }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let assertions = 0;
  const check = (value, message) => { assert.ok(value, message); assertions++; };
  try {
    await page.goto('http://127.0.0.1:8954/decks');
    await page.locator('[data-decks-content]').waitFor();
    const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('sieglingsAuthProfile')));
    check(cache.profile.user.id === profile.user.id && cache.profile.savedDecks.length === 1, 'Hub stores same-user saved decks for Arena');
    check(cache.profile.progression.unlockedDeckIds.includes(paid.id), 'Hub stores purchased preset ownership');
    check(await page.evaluate(() => localStorage.getItem('sieglingsAuthToken')) === 'cookie', 'Cookie-only login gets a cross-page session marker');
    check((await page.locator('.coin img').getAttribute('src')).includes('home-stats/siegecoin.png'), 'Hub uses transparent existing coin');
    await page.route('**/api/player/progression', route => route.fulfill({ status: 503, body: '{}' }));
    await page.route('**/api/auth/me', route => route.fulfill({ json: { ...profile, progression: null } }));
    await page.reload(); await page.locator('[data-decks-content]').waitFor();
    check((await page.locator('.coin').textContent()).includes('3,130'), 'Same-user progression survives a transient read failure');
    await page.unroute('**/api/auth/me');
    await page.route('**/api/auth/me', route => route.fulfill({ json: { ...profile, user: { ...profile.user, id: 'different-account' }, progression: null } }));
    await page.reload(); await page.locator('[data-decks-content]').waitFor();
    check(!(await page.locator('.coin').textContent()).includes('3,130'), 'A different account never inherits cached ownership or balance');
    await page.unroute('**/api/auth/me'); await page.unroute('**/api/player/progression');
    await page.reload(); await page.locator('[data-decks-content]').waitFor();
    holdAuth = true;
    await page.goto('http://127.0.0.1:8954/battle', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof gameOptions !== 'undefined' && gameOptions);
    check((await page.locator('#welcomeAuthCard').textContent()).includes('Rook'), 'Arena account paints while refresh is stalled');
    check(!(await page.locator('#welcomeAuthCard').textContent()).includes('Restoring'), 'Arena does not block on account restore');
    await page.evaluate(() => { welcomeDismissed = true; openLoadoutSelector(); setLoadoutStep('deck'); });
    await page.locator('#deckOptions .deck-card').first().waitFor();
    check((await page.locator('#deckOptions').textContent()).includes(paid.name), 'Purchased deck remains available before auth refresh');
    check((await page.locator('#loadoutAccountNote').textContent()).includes('1 saved'), 'Deck source summary shows saved count');
    await page.locator('#savedTab').click();
    check((await page.locator('#savedDeckOptions').textContent()).includes(saved[0].name), 'Custom deck is selectable in Arena');
    await page.screenshot({ path: path.join(out, 'arena-saved-phone.png') });
    await page.locator('#presetTab').click();
    await page.screenshot({ path: path.join(out, 'arena-presets-phone.png') });
    holdAuth = false;

    await page.goto('http://127.0.0.1:8954/siege', { waitUntil: 'domcontentloaded' });
    await page.locator('#chooseSiegeMode').waitFor({ state: 'visible', timeout: 45000 });
    await page.locator('#chooseSiegeMode').click();
    await page.locator('#knightNextBtn').click();
    await page.locator('#sieglingGrid .sgl-card').first().waitFor();
    check((await page.locator('#siegeAccountStatus').textContent()).includes('3,130'), 'Siege confirms signed-in balance');
    check(requests.filter(r => r.path === '/api/siege/roster').every(r => !r.auth), 'Cookie sentinel is never sent as a Bearer credential');
    await page.locator('#warbandStatusFilter button').filter({ hasText: 'Owned cards' }).click();
    check(await page.locator('#sieglingGrid .sgl-card').count() === roster.siegelings.length, 'Owned filter includes all elements');
    const water = roster.siegelings.find(s => s.element === 'WATER' && s.canUnlock);
    await page.locator('#elementFilter button').filter({ hasText: 'WATER' }).click();
    const tile = page.locator('#sieglingGrid .sgl-card').filter({ has: page.locator('.sname', { hasText: water.name }) });
    check((await tile.textContent()).includes('Card owned') && (await tile.textContent()).includes('Siege locked'), 'Ownership and expedition lock are distinct');
    check(await tile.evaluate(el => getComputedStyle(el).opacity) === '1', 'Locked card text stays legible');
    await tile.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'siege-owned-water-phone.png') });
    await tile.locator('.sunlock-btn').click();
    await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).busy);
    check(unlockCalls === 1, 'Siege unlock submits once');
    check((await tile.textContent()).includes('Ready') && !await tile.locator('.sunlock-btn').count(), 'Successful unlock becomes ready to use');
    await page.locator('#siegeAccountRefresh').click();
    await page.waitForFunction(() => !document.getElementById('siegeAccountRefresh').disabled);
    check((await page.locator('#siegeAccountStatus').textContent()).includes(roster.gold.toLocaleString()), 'Refresh preserves current account and balance');
    await page.locator('#warbandStatusFilter button').filter({ hasText: 'Ready to use' }).click();
    check(await page.locator('#sieglingGrid .sgl-card.locked').count() === 0, 'Ready filter hides locked cards');
    check(errors.length === 0, `No runtime errors: ${errors.join('; ')}`);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ passed: true, assertions, errors }, null, 2));
    console.log(`${assertions} assertions passed`);
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png') });
    console.error('Runtime errors:', errors);
    throw error;
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
