// Real hub boot and purchase flow against local account fixtures. No live writes.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
// Pass --serve to leave the fixture running for the standard web-game client.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const STATIC = path.join(ROOT, 'src/main/resources/static');
const OUT = path.join(ROOT, 'output/web-game/preset-decks');
const PORT = Number(process.env.PRESET_TEST_PORT || 8952);
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(STATIC, 'js/home-redesign-data.js'), 'utf8'), context);
const cards = JSON.parse(JSON.stringify(context.window.HOME_CONCEPT_CARDS.sieglings))
  .map(c => ({ ...c, type: 'SIEGLING', cardArtMode: 'OVERLAY' }));
const names = ['Emberbound', 'Frostforged', 'Rootsworn', 'Galeborn', 'Tidecalled', 'Stormcharged', 'Umbral', 'Radiant'];
const decks = ['FIRE', 'ICE', 'EARTH', 'WIND', 'WATER', 'ELECTRIC', 'SHADOW', 'LIGHT'].map((element, i) => ({
  id: `deck_${element.toLowerCase()}`, name: names[i], elements: [element],
  cards: [{ id: (cards.find(c => c.element === element) || cards[0]).id, count: 40 }]
}));
const baseline = () => ({
  gold: 3230, premadeDeckPrice: 625, starterPackId: 'pack_water_starter',
  purchasedDeckIds: ['deck_electric'], unlockedDeckIds: decks.slice(0, 6).map(d => d.id),
  ownedCards: {}, ownedTotal: 30, ownedTrainers: [], remnants: 0
});
const savedDecks = [
  { id: 'custom-1', name: 'Custom Binder Deck', customDeckCards: Array(30).fill(cards[0].id), custom: true },
  { id: 'saved-preset', name: 'Saved Fire Deck', deckId: 'deck_fire', customDeckCards: [] }
];
let state;
function reset(overrides = {}) {
  state = { progression: baseline(), saved: savedDecks, guest: false, calls: [], failure: null, delay: 0, ...overrides };
}
reset();
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/auth/me') return json(res, { authenticated: !state.guest, user: { id: 'preset-fixture', displayName: 'Rook' }, progression: state.guest ? null : state.progression, savedDecks: state.guest ? [] : state.saved });
    if (url.pathname === '/api/game/options') return json(res, { decks: state.noCatalog ? [] : decks, cardCatalog: cards, trainers: [], deckBuilder: { minDeckSize: 30, maxCopies: 3 } });
    if (url.pathname === '/api/profile/decks') return json(res, { decks: state.saved });
    if (url.pathname === '/api/player/progression') return json(res, { progression: state.progression });
    if (url.pathname === '/api/shop/purchase-deck') {
      let body = ''; for await (const part of req) body += part;
      const { deckId } = JSON.parse(body);
      state.calls.push({ deckId, method: req.method, authorization: req.headers.authorization });
      await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.failure) return json(res, { error: state.failure }, state.failureStatus || 200);
      if (!state.progression.purchasedDeckIds.includes(deckId)) {
        state.progression.gold -= state.progression.premadeDeckPrice;
        state.progression.purchasedDeckIds.push(deckId);
        state.progression.unlockedDeckIds.push(deckId);
      }
      return json(res, { progression: state.progression });
    }
    return json(res, {});
  }
  const routed = ['/decks', '/home', '/cards', '/shop', '/login', '/profile', '/deck-builder'];
  const relative = routed.includes(url.pathname) ? 'home-next.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(STATIC, relative);
  if (!file.startsWith(STATIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  if (process.argv.includes('--serve')) { console.log(`Fixture at http://127.0.0.1:${PORT}/decks`); return; }
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true });
  let assertions = 0;
  const check = (condition, message) => { assert.ok(condition, message); assertions++; };
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const group = key => page.locator(`[data-deck-section="${key}"]`);
  const row = (key, id) => group(key).locator(`[data-deck-id="${id}"]`);
  const boot = async () => { await page.goto(`http://127.0.0.1:${PORT}/decks`); await page.locator('[data-decks-content]').waitFor(); await page.waitForTimeout(500); };
  const textState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  try {
    await boot();
    check(await group('saved').locator('.sg-deckrow').count() === 2, 'Saved decks stay visible');
    check((await row('saved', 'custom-1').textContent()).includes('30 cards'), 'Custom cards counted from real payload');
    check((await row('saved', 'saved-preset').textContent()).includes('40 cards'), 'Saved preset resolves catalog contents');
    check(await group('owned').locator('.sg-deckrow').count() === 6, 'All six owned presets show (no four-row cap)');
    check((await row('owned', 'deck_electric').textContent()).includes('Owned'), 'Purchased preset is owned');
    check((await row('owned', 'deck_water').textContent()).includes('Included'), 'Starter preset is included');
    check(await group('presets').locator('.sg-deckrow').count() === 2, 'Locked decks are in purchase section');
    check((await group('presets').textContent()).includes('625'), 'Price comes from progression, not a hardcoded 500');
    check((await textState()).ownedPresets.length === 6, 'Text state agrees with owned deck UI');
    await page.screenshot({ path: path.join(OUT, 'phone-decks.png') });
    await row('presets', 'deck_shadow').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, 'phone-presets.png') });
    for (const width of [320, 390, 844, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.querySelector('[data-decks-content]').scrollWidth <= innerWidth), `No horizontal overflow at ${width}`);
      check(await page.locator('.sg-deck-buy').evaluateAll(buttons => buttons.every(b => b.getBoundingClientRect().height >= 40)), `Purchase targets remain usable at ${width}`);
    }
    await page.screenshot({ path: path.join(OUT, 'desktop-presets.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    state.delay = 350;
    await page.evaluate(() => localStorage.setItem('sieglingsAuthToken', 'fixture-token'));
    await page.locator('[data-buy-deck="deck_shadow"]').click();
    check(await page.locator('[data-buy-deck]').evaluateAll(nodes => nodes.every(n => n.disabled)), 'All purchases disabled while pending');
    await page.locator('[data-buy-deck="deck_shadow"]').evaluate(b => { b.click(); b.click(); });
    await row('owned', 'deck_shadow').waitFor();
    check(state.calls.length === 1 && state.calls[0].deckId === 'deck_shadow', 'Repeated clicks submit only one purchase');
    check(state.calls[0].authorization === 'Bearer fixture-token' && state.calls[0].method === 'POST', 'Authenticated POST uses existing API');
    check((await page.locator('.sg-chip.coin').textContent()).includes('2,605'), 'Server balance updates immediately');
    check(await row('presets', 'deck_shadow').count() === 0, 'Purchased row leaves store');
    check((await textState()).ownedPresets.length === 7, 'Text state reflects purchase');
    const shared = await page.evaluate(() => JSON.parse(localStorage.getItem('sieglingsAuthProfile')).profile);
    check(shared.progression.gold === 2605 && shared.progression.unlockedDeckIds.includes('deck_shadow'), 'Purchase updates Arena shared profile');
    await page.screenshot({ path: path.join(OUT, 'phone-purchased.png') });
    await page.reload(); await page.locator('[data-decks-content]').waitFor();
    check(await row('owned', 'deck_shadow').count() === 1, 'Ownership persists after reload');

    state.failure = 'Not enough Siegecoins for that premade deck.';
    await page.locator('[data-buy-deck="deck_light"]').click();
    await page.locator('[data-deck-notice][role="alert"]').waitFor();
    check((await page.locator('[data-deck-notice]').textContent()) === state.failure, 'Business errors are shown');
    check(await row('owned', 'deck_light').count() === 0 && !await page.locator('[data-buy-deck="deck_light"]').isDisabled(), 'Failure does not grant ownership and can be retried');
    state.failure = null;
    await page.locator('[data-buy-deck="deck_light"]').click();
    await row('owned', 'deck_light').waitFor();
    check((await group('presets').textContent()).includes('every available preset'), 'All-owned empty store state');

    reset({ progression: { ...baseline(), gold: 24 }, saved: [] });
    await boot();
    check((await group('saved').textContent()).includes('No saved decks yet'), 'Zero saved decks does not replace owned presets');
    check(await group('owned').locator('.sg-deckrow').count() === 6, 'Owned presets show without a custom deck');
    check(await page.locator('[data-buy-deck="deck_shadow"]').isDisabled(), 'Insufficient funds blocks buying');
    check((await row('presets', 'deck_shadow').textContent()).includes('601 more'), 'Exact coin shortfall is visible');
    reset({ saved: Array.from({ length: 8 }, (_, i) => ({ ...savedDecks[0], id: `custom-${i}`, name: `Saved deck ${i + 1}` })) });
    await boot();
    check(await group('saved').locator('.sg-deckrow').count() === 8, 'Saved deck list is not capped at six');

    reset({ guest: true });
    await page.evaluate(() => localStorage.removeItem('sieglingsAuthToken'));
    await boot();
    check(await group('owned').locator('.sg-deckrow').count() === 4, 'Guests see the four free presets');
    check(await page.locator('[data-buy-deck]').count() === 0, 'Guests have no purchase buttons');
    await group('presets').locator('a.sg-deck-buy').first().click();
    check(new URL(page.url()).pathname === '/login' && state.calls.length === 0, 'Guest unlock opens sign-in without a purchase');
    reset({ noCatalog: true }); await boot();
    check(await page.locator('.sg-deckrow').count() === 2, 'Missing catalog does not invent preset decks');
    check((await group('presets').textContent()).includes('unavailable'), 'Missing catalog has an honest empty state');

    check(errors.length === 0, `No browser errors: ${errors.join('\n')}`);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ passed: true, assertions, errors }, null, 2));
    console.log(`${assertions} assertions passed; screenshots in ${OUT}`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
