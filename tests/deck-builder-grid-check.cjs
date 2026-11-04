const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.HUB_BASE_URL || 'http://127.0.0.1:8937';
const output = path.resolve(__dirname, '../output/deck-builder-grid');
fs.mkdirSync(output, { recursive: true });

async function openBuilder(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/home-redesign-preview.html?screen=builder', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SiegelingsHomeConcept && document.querySelector('[data-builder]'));
  await page.evaluate(() => {
    const baseCards = SiegelingsHomeConcept.cards.slice();
    const cards = [];
    for (let i = 0; i < 200; i++) {
      const src = baseCards[i % baseCards.length];
      cards.push(Object.assign({}, src, {
        id: 'card-' + i,
        name: 'Card ' + String(i).padStart(3, '0')
      }));
    }
    const owned = {};
    cards.forEach((c) => { owned[c.id] = 3; });
    document.body.innerHTML = '';
    window.hub = SiegelingsHomeConcept.mountApp(document.body, {
      screen: 'builder',
      guest: false,
      live: {
        cards: cards,
        sieglings: cards,
        ownedCards: owned,
        deckBuilder: { minDeckSize: 30, maxCopies: 3 },
        knights: [{ id: 'pyla' }],
        trainers: [{ id: 'pyla', name: 'Pyla', active: true }],
        gold: 100
      }
    });
  });
  await page.locator('[data-build-layout="cards"]').click();
  return errors;
}

async function gridState(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-builder]');
    const grid = document.querySelector('[data-build-grid]');
    return {
      tiles: document.querySelectorAll('.sg-bld-tile').length,
      shown: grid ? Number(grid.getAttribute('data-shown')) : 0,
      sentinel: !!document.querySelector('[data-build-more]'),
      overflow: scroller.scrollHeight - scroller.clientHeight
    };
  });
}

async function scrollToEnd(page) {
  for (let i = 0; i < 12; i++) {
    const state = await gridState(page);
    if (state.tiles >= 200 && !state.sentinel) return state;
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-builder]');
      scroller.scrollTop = scroller.scrollHeight;
    });
    await page.waitForTimeout(200);
  }
  return gridState(page);
}

(async () => {
  const launchOptions = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launchOptions);
  try {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const phoneErrors = await openBuilder(phone);
    const phoneStart = await gridState(phone);
    assert.equal(phoneStart.tiles, 24, 'a phone should not paint the whole grid up front: ' + JSON.stringify(phoneStart));
    const phoneEnd = await scrollToEnd(phone);
    assert.equal(phoneEnd.tiles, 200, 'scrolling the phone grid should reach every card: ' + JSON.stringify(phoneEnd));
    assert.equal(phoneEnd.sentinel, false);
    assert.deepEqual(phoneErrors, []);
    await phone.close();

    const desk = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    const deskErrors = await openBuilder(desk);
    const deskStart = await gridState(desk);
    assert.ok(deskStart.tiles > 48, 'a tall window must keep loading past one extra chunk: ' + JSON.stringify(deskStart));
    const deskEnd = await scrollToEnd(desk);
    assert.equal(deskEnd.tiles, 200, 'the tall window should reach every card: ' + JSON.stringify(deskEnd));
    assert.equal(deskEnd.sentinel, false);
    const last = desk.locator('[data-build-add="card-199"]');
    await last.click();
    assert.equal(await desk.locator('[data-build-total]').innerText(), '1');
    assert.equal(await desk.locator('[data-build-row="card-199"] [data-build-count]').innerText(), '1/3');
    await desk.screenshot({ path: path.join(output, 'cards-2560.png') });
    assert.deepEqual(deskErrors, []);
    await desk.close();
    console.log('deck builder grid filled on a phone by scrolling and on 2560x1440 without stalling');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
