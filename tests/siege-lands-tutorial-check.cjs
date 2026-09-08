const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ROOT = path.resolve(__dirname, '..');
const STATIC = path.join(ROOT, 'src/main/resources/static');
const PORT = 8966;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };

function bootStub() {
  const original = window.fetch;
  window.__siegeTutorialCalls = [];
  window.fetch = function (url, options) {
    if (!String(url).includes('/api/')) return original(url, options);
    window.__siegeTutorialCalls.push(String(url));
    const data = String(url).includes('/api/siege/run/active') ? { runs: [] } :
      String(url).includes('/api/siege/roster') ? {
        siegelings: [], knights: [], partySize: 1, partyMax: 3, loggedIn: false,
        gold: 0, veterans: [], veteranTeams: [], warmarks: 0,
        battlegroundsTier: 0, battlegroundsMaxTier: 5,
        battlegroundsUnlockedTier: 1, battlegroundsUnlocks: []
      } : {};
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(data); } });
  };
}

function createServer() {
  return http.createServer(function (req, res) {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(STATIC, '.' + (url.pathname === '/' ? '/adventure.html' : url.pathname));
    if (!file.startsWith(STATIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    let body = fs.readFileSync(file);
    if (path.extname(file) === '.html') {
      body = body.toString().replace('<head>', '<head><script>(' + bootStub.toString() + ')();</script>');
    }
    res.end(body);
  });
}

async function assertInViewport(page, selector) {
  const box = await page.locator(selector).boundingBox();
  assert(box, selector + ' has no box');
  const vp = page.viewportSize();
  assert(box.x >= -1 && box.y >= -1 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1,
    selector + ' escaped ' + JSON.stringify(vp) + ': ' + JSON.stringify(box));
}

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:' + PORT + '/adventure.html', { waitUntil: 'load' });
  await page.locator('#chooseTutorialMode').waitFor({ state: 'visible' });
  await page.locator('#chooseTutorialMode').click();

  async function step(id) {
    await page.locator('.tut-card[data-step-id="' + id + '"]').waitFor({ state: 'visible' });
    await assertInViewport(page, '.tut-card');
  }

  await step('welcome');
  await page.locator('.tut-next').click();
  await step('land');
  assert((await page.locator('.tut-card').textContent()).includes('Every stage has a Land'));
  assert((await page.locator('#mapLand').textContent()).includes('Emberfall'));
  const art = await page.locator('#mapScroll').evaluate(async function (el) {
    const url = getComputedStyle(el).backgroundImage.match(/url\("?([^"\)]+)/)[1];
    const image = new Image(); image.src = url; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  assert.deepEqual(art, { width: 1024, height: 1536 });

  await page.locator('.tut-next').click();
  await step('land-open');
  await page.locator('.tut-next').click();
  await page.locator('#mapLand').click();
  await step('land-rules');
  assert((await page.locator('#landDetails').textContent()).includes('FIRE Siegelings start battles with +1 Attack.'));
  assert((await page.locator('.tut-card').textContent()).includes('Terrain, encounters and landmarks'));
  await assertInViewport(page, '.land-modal-card');
  await page.waitForTimeout(300);
  const focus = await page.evaluate(function () {
    const target = document.querySelector('.land-modal-card').getBoundingClientRect();
    const ring = document.querySelector('.tut-ring').getBoundingClientRect();
    return { target: { x: target.x, y: target.y, width: target.width, height: target.height },
      ring: { x: ring.x, y: ring.y, width: ring.width, height: ring.height } };
  });
  const centerX = focus.target.x + focus.target.width / 2;
  const centerY = focus.target.y + focus.target.height / 2;
  assert(centerX >= focus.ring.x && centerX <= focus.ring.x + focus.ring.width &&
    centerY >= focus.ring.y && centerY <= focus.ring.y + focus.ring.height,
    'Land details spotlight missed its target: ' + JSON.stringify(focus));
  if (viewport.width === 390) {
    await page.screenshot({ path: path.join(ROOT, 'output/lands/tutorial-land-rules-390x844.png') });
  }
  await page.locator('.tut-next').click();
  await page.locator('#landClose').click();
  await step('land-change');
  const changeCopy = await page.locator('.tut-card').textContent();
  assert(changeCopy.includes('Rare Lands') && changeCopy.includes('Badlands'));
  await page.locator('.tut-next').click();
  await step('map');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(ROOT, 'output/lands/tutorial-' + viewport.width + 'x' + viewport.height + '.png') });
  await page.close();
}

(async function () {
  const server = createServer();
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  if (process.argv.includes('--serve')) {
    console.log('Lands tutorial preview at http://127.0.0.1:' + PORT + '/adventure.html');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
      await runViewport(browser, viewport);
    }
    console.log('Lands tutorial passed at 320x568, 390x844, 844x390 and 1920x1080');
  } finally {
    await browser.close(); server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
