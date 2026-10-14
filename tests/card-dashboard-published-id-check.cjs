/*
 * Published dashboard ids must survive clearing the ID field.
 *
 * ID autofill hands a draft back to its name when the field is cleared. The same
 * gesture on a card, premade deck, or SiegeKnight that is already live used to
 * rewrite the id to the name slug (or arm name-following), so the next rename
 * published a new id and orphaned collections, saved decks, and unlocks.
 *
 *   node tests/card-dashboard-published-id-check.cjs
 * Serve the statics first, e.g.
 *   (cd src/main/resources/static && python3 -m http.server 8766)
 */
function loadChromium() {
  const modules = [
    '/opt/node22/lib/node_modules/playwright',
    'playwright',
    '/tmp/pw-core/node_modules/playwright-core',
    'playwright-core'
  ];
  for (const id of modules) {
    try {
      return require(id).chromium;
    } catch (error) {
      // Try the next install location. CI has the global package; this sandbox may not.
    }
  }
  throw new Error('playwright is not installed');
}

const chromium = loadChromium();
const CHROME = ['/opt/pw-browsers/chromium', '/opt/google/chrome/chrome', '/usr/local/bin/google-chrome']
  .find((path) => { try { return require('fs').existsSync(path); } catch (error) { return false; } });

const BASE = process.argv[2] || 'http://127.0.0.1:8766';

const EDITOR = {
  source: 'PROJECT_FILE',
  canSaveToProjectFile: false,
  liveEditingEnabled: false,
  firestoreAvailable: false,
  metadata: {
    elements: ['FIRE', 'ICE', 'EARTH', 'WIND', 'WATER', 'ELECTRIC', 'METAL', 'POISON', 'PSYCHIC', 'UNDEAD', 'LIGHT', 'SHADOW', 'NEUTRAL'],
    cardTypes: ['SIEGLING', 'SPELL', 'TRAP'],
    rarities: ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'],
    rows: ['FRONT', 'BACK'],
    targetTypes: ['SINGLE_ENEMY', 'ALL_ALLIES', 'PASSIVE'],
    effectTypes: [{ key: 'damage', label: 'Damage' }],
    reactions: [],
    sieglingSizes: ['SMALL', 'MEDIUM', 'LARGE', 'GIGANTIC'],
    moveCategories: ['STANDARD']
  },
  data: {
    cards: [
      {
        id: 'custom-live-id', name: 'Blaze Pup', type: 'SIEGLING', element: 'FIRE',
        rarity: 'COMMON', health: 10, speed: 5, moveIds: []
      },
      {
        id: 'draco', name: 'Draco', type: 'SIEGLING', element: 'FIRE',
        rarity: 'LEGENDARY', health: 20, speed: 4, moveIds: []
      }
    ],
    decks: [
      {
        id: 'preset-fire-01', name: 'Fire Deck', description: '', elements: ['FIRE'],
        active: true, cardIds: ['custom-live-id', 'draco']
      }
    ],
    trainers: [
      {
        id: 'knight-custom', name: 'Cinder Knight', element: 'FIRE', rarity: 'RARE',
        tier: 'Raider', active: true,
        passiveAbility: { name: 'Warm', description: 'Hand written passive.', effectType: 'damage', effectValue: 1, targetType: 'SINGLE_ENEMY', passive: true },
        activeAbility: { name: 'Spark', description: 'Hand written active.', effectType: 'damage', effectValue: 1, targetType: 'SINGLE_ENEMY', passive: false }
      }
    ],
    moves: [],
    liveElements: { elements: [{ element: 'FIRE', active: true }] }
  }
};

async function val(page, selector) {
  return page.locator(selector).inputValue();
}

async function clearField(page, selector) {
  const field = page.locator(selector);
  await field.click();
  await field.fill('');
  await field.blur();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/cards/editor/auth/gate', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ required: false, unlocked: true }) });
  });
  await page.route('**/api/cards/editor', (route) => {
    if (route.request().method() !== 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EDITOR) });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EDITOR) });
  });

  let fail = 0;
  const check = (ok, label, detail) => {
    if (!ok) fail += 1;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (detail ? ' -> ' + detail : ''));
  };

  await page.goto(BASE + '/card-dashboard.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const input = document.getElementById('cardIdInput');
    return input && input.value === 'custom-live-id';
  }, null, { timeout: 20000 });

  await clearField(page, '#cardIdInput');
  check(await val(page, '#cardIdInput') === 'custom-live-id', 'clearing a published card id restores it', await val(page, '#cardIdInput'));
  await page.fill('#cardNameInput', 'Blaze Pup Alpha');
  check(await val(page, '#cardIdInput') === 'custom-live-id', 'renaming that card keeps the live id', await val(page, '#cardIdInput'));

  await page.click('[data-card-id="draco"]');
  await page.waitForFunction(() => document.getElementById('cardIdInput').value === 'draco');
  const draco = page.locator('#cardIdInput');
  await draco.click();
  for (let i = 0; i < 5; i += 1) await draco.press('Backspace');
  await draco.blur();
  check(await val(page, '#cardIdInput') === 'draco', 'backspacing a slug id away restores it', await val(page, '#cardIdInput'));
  await page.fill('#cardNameInput', 'Draco Prime');
  check(await val(page, '#cardIdInput') === 'draco', 'renaming Draco keeps draco', await val(page, '#cardIdInput'));
  await page.screenshot({ path: '/opt/cursor/artifacts/published-id-kept.png' });

  await page.click('#newSieglingBtn');
  await page.waitForFunction(() => document.getElementById('cardIdInput').value === 'new-siegeling');
  await page.fill('#cardNameInput', 'Ash Cub');
  check(await val(page, '#cardIdInput') === 'ash-cub', 'a new Siegeling id still follows its name', await val(page, '#cardIdInput'));
  await clearField(page, '#cardIdInput');
  check(await val(page, '#cardIdInput') === 'ash-cub', 'clearing a draft id hands it back to the name', await val(page, '#cardIdInput'));

  await page.click('#showDecksBtn');
  await page.waitForFunction(() => document.getElementById('deckIdInput').value === 'preset-fire-01');
  check(await page.locator('[data-remove-deck-card-id="draco"]').count() === 1,
    'backspacing Draco did not orphan it inside the premade deck');
  await clearField(page, '#deckIdInput');
  check(await val(page, '#deckIdInput') === 'preset-fire-01', 'clearing a published deck id restores it', await val(page, '#deckIdInput'));
  await page.fill('#deckNameInput', 'Fire Deck Renamed');
  check(await val(page, '#deckIdInput') === 'preset-fire-01', 'renaming that deck keeps the live id', await val(page, '#deckIdInput'));
  await page.click('#newDeckBtn');
  await page.waitForFunction(() => document.getElementById('deckIdInput').value === 'new-premade-deck');
  await page.fill('#deckNameInput', 'Ash Rally');
  check(await val(page, '#deckIdInput') === 'ash-rally', 'a new deck id still follows its name', await val(page, '#deckIdInput'));

  await page.click('#showTrainersBtn');
  await page.waitForFunction(() => document.getElementById('trainerIdInput').value === 'knight-custom');
  await clearField(page, '#trainerIdInput');
  check(await val(page, '#trainerIdInput') === 'knight-custom', 'clearing a published knight id restores it', await val(page, '#trainerIdInput'));
  await page.fill('#trainerNameInput', 'Cinder Knight Renamed');
  check(await val(page, '#trainerIdInput') === 'knight-custom', 'renaming that knight keeps the live id', await val(page, '#trainerIdInput'));
  await page.click('#newTrainerBtn');
  await page.waitForFunction(() => document.getElementById('trainerIdInput').value === 'new-siegeknight');
  await page.fill('#trainerNameInput', 'Ash Warden');
  check(await val(page, '#trainerIdInput') === 'ash-warden', 'a new knight id still follows its name', await val(page, '#trainerIdInput'));

  check(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nAll checks passed.');
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
