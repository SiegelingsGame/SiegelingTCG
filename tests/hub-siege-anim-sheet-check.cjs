// Verifies the hub card sheet's Siege tab plays the animated battle sprite for
// Siegelings with a shipped sheet (js/siege-sprites.js), cycling idle -> walk
// -> attack -> cheer, and keeps the still cutout for the Keep tab and for cards
// without a sheet.
//
//   node tests/hub-siege-anim-sheet-check.cjs
//
// Serves src/main/resources/static and opens the real home-next.html on its
// offline catalog (no API), then opens card sheets the way a player does.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const OUT = path.join(ROOT, 'output', 'web-game', 'hub-siege-anim-sheet');
const PORT = 8954;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const VIEWPORTS = [{ name: 'phone-390x844', width: 390, height: 844 }, { name: 'desktop-1920x1080', width: 1920, height: 1080 }];

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'home-next.html';
    const file = path.join(STATIC, rel);
    if (!file.startsWith(STATIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('nope'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(r => server.listen(PORT, '127.0.0.1', () => r(server)));
}

async function openSheet(page, id) {
  await page.evaluate(() => { const b = document.querySelector('.sg-sheet.open .sg-sheet-dismiss'); if (b) b.click(); });
  await page.waitForTimeout(250);
  // The binder pages by element; search for the card by name, as a player would.
  if (!(await page.$('.sg-card-tile[data-card="' + id + '"]'))) {
    await page.evaluate((cid) => {
      const c = (window.HOME_CONCEPT_CARDS.sieglings || []).find(x => x.id === cid);
      const input = document.querySelector('[data-search-input]');
      input.value = c.name; input.dispatchEvent(new Event('input', { bubbles: true }));
    }, id);
    await page.waitForSelector('.sg-card-tile[data-card="' + id + '"]', { timeout: 8000 });
  }
  await page.evaluate((cid) => {
    const t = document.querySelector('.sg-card-tile[data-card="' + cid + '"]');
    t.scrollIntoView({ block: 'center' }); t.click();
  }, id);
  await page.waitForSelector('.sg-sheet.open [data-sheet-tab="siege"]', { timeout: 8000 });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const failures = [];
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    // The offline board: every API call fails, as with no server.
    await page.route('**/api/**', r => r.abort());
    // A returning player who already dismissed the install tip.
    await page.addInitScript(() => { try { localStorage.setItem('siegelingsInstallGuideDismissed.v2', String(Date.now())); } catch (e) {} });
    const check = (c, msg) => { if (!c) failures.push(`[${vp.name}] ${msg}`); else console.log(`  ok  ${msg}`); };
    console.log(`\n== ${vp.name}`);
    await page.goto(`http://127.0.0.1:${PORT}/home-next.html?screen=collection`, { waitUntil: 'load' });
    await page.waitForSelector('.sg-card-tile[data-card]', { timeout: 20000 });

    await openSheet(page, 'fawny');
    await page.click('.sg-sheet.open [data-sheet-tab="siege"]');
    await page.waitForSelector('.sg-sheet.open .sg-anim-strip', { timeout: 5000 });
    // Sample the pose and frame every animation frame for one full cycle.
    const seen = await page.evaluate(() => new Promise(resolve => {
      const order = [], frames = {};
      const t0 = performance.now();
      const step = () => {
        const s = document.querySelector('.sg-sheet.open .sg-anim-strip');
        if (s) {
          const cs = getComputedStyle(s);
          const m = /\/(\w+)-(\w+)\.webp/.exec(cs.backgroundImage);
          const pose = m ? m[2] : '?';
          if (order[order.length - 1] !== pose) order.push(pose);
          const cell = s.parentNode.getBoundingClientRect().width;
          const mt = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
          (frames[pose] = frames[pose] || new Set()).add(Math.round(-mt.m41 / cell));
        }
        if (performance.now() - t0 < 8500) requestAnimationFrame(step);
        else {
          const f = {}; for (const k in frames) f[k] = frames[k].size;
          const box = document.querySelector('.sg-sheet.open .sg-anim').getBoundingClientRect();
          const cut = document.querySelector('.sg-sheet.open .sg-cutout').getBoundingClientRect();
          resolve({ order, frames: f, box: { w: box.width, h: box.height }, cut: { w: cut.width, h: cut.height } });
        }
      };
      requestAnimationFrame(step);
    }));
    check(seen.order.slice(0, 5).join('>') === 'idle>walk>attack>cheer>idle',
      `Fawny cycles idle>walk>attack>cheer>idle (${seen.order.join('>')})`);
    check(seen.frames.idle === 8 && seen.frames.walk === 8 && seen.frames.attack === 4 && seen.frames.cheer === 4,
      `each pose steps through all its frames (${JSON.stringify(seen.frames)})`);
    check(seen.box.h > 40 && seen.box.h < seen.cut.h * 1.2,
      `sprite sized to the cutout (${Math.round(seen.box.w)}x${Math.round(seen.box.h)} in ${Math.round(seen.cut.w)}x${Math.round(seen.cut.h)})`);
    await page.screenshot({ path: path.join(OUT, vp.name + '-fawny-siege.png') });

    await page.click('.sg-sheet.open [data-sheet-tab="keep"]');
    await page.waitForTimeout(200);
    const keep = await page.evaluate(() => ({ anim: !!document.querySelector('.sg-sheet.open .sg-anim'),
      cutout: !!document.querySelector('.sg-sheet.open .sg-cutout.is-keep') }));
    check(!keep.anim, 'Keep tab is not animated');
    await page.click('.sg-sheet.open [data-sheet-tab="arena"]');
    await page.waitForTimeout(200);
    check(!(await page.$('.sg-sheet.open .sg-anim')), 'Arena tab shows the card, not the sprite');

    // A Siegeling with no sheet keeps the still Siege cutout (or the card).
    const noSheet = await page.evaluate(() => {
      const ids = (window.HOME_CONCEPT_CARDS.sieglings || []).map(c => c.id);
      return ids.find(i => !window.SiegeSprites.forCard(i) && /^[a-z]+$/.test(i)) || null;
    });
    if (noSheet) {
      await openSheet(page, noSheet);
      await page.click('.sg-sheet.open [data-sheet-tab="siege"]');
      await page.waitForTimeout(200);
      check(!(await page.$('.sg-sheet.open .sg-anim')), `card without a sheet (${noSheet}) is not animated`);
    }
    for (const id of ['squirebud', 'jackedty', 'hurricrane', 'solgator']) {
      await openSheet(page, id);
      await page.click('.sg-sheet.open [data-sheet-tab="siege"]');
      const sheet = await page.waitForSelector('.sg-sheet.open .sg-anim-strip', { timeout: 5000 }).catch(() => null);
      const img = sheet && await page.evaluate(() => getComputedStyle(document.querySelector('.sg-sheet.open .sg-anim-strip')).backgroundImage);
      check(img && img.indexOf('/' + id + '-idle.webp') >= 0, `${id} opens on its idle strip`);
    }
    await page.screenshot({ path: path.join(OUT, vp.name + '-solgator-siege.png') });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= vp.width, `no horizontal overflow (${sw})`);
    check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
  await browser.close(); server.close();
  if (failures.length) { console.log('\nFAIL\n' + failures.join('\n')); process.exit(1); }
  console.log('\nall checks passed');
})();
