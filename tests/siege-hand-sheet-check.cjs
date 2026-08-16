/**
 * Siege hand-sheet + card-size check.
 *
 * Drives a REAL expedition against a locally running app (./mvnw spring-boot:run
 * on :8080): picks a knight and warband, walks the map into the first battle,
 * then asserts, at four viewports, that (a) every card in the fan has the same
 * laid-out box however long its description is, and (b) the hand sheet opened
 * from the deck counter lists the whole hand with descriptions, fits the
 * viewport, and hands a picked card back to the fan focused.
 *
 *   node tests/siege-hand-sheet-check.cjs
 *
 * Note: spring-boot:run serves the copy of static/ under target/classes taken
 * at startup — re-copy edited assets there (or restart) before running.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = process.env.SIEGE_OUT || require('os').tmpdir();

async function startBattle(p, log) {
  await p.goto('http://localhost:8080/adventure.html');
  await p.evaluate(() => localStorage.removeItem('siegeToken'));
  await p.goto('http://localhost:8080/adventure.html');
  await p.waitForSelector('#chooseSiegeMode', { timeout: 60000 });
  await p.click('#chooseSiegeMode');
  await p.waitForSelector('.knight-grid .knight-card', { timeout: 90000 });
  await p.click('.knight-grid .knight-card');
  await p.click('#knightNextBtn');
  await p.waitForSelector('#sieglingGrid .sgl-card:not(.locked)', { timeout: 90000 });
  for (let i = 0; i < 6; i++) {
    if (!(await p.$eval('#startRunBtn', e => e.disabled))) break;
    await p.click('#sieglingGrid .sgl-card:not(.locked):not(.sel) .sart');
    await p.waitForTimeout(250);
  }
  await p.click('#startRunBtn');
  await p.waitForSelector('#mapScreen:not(.hidden)', { timeout: 90000 });
  // Walk the map until a battle node opens (rest/shop nodes just re-render).
  for (let i = 0; i < 8; i++) {
    const n = await p.$('#mapSvg .map-node-g.reachable.type-BATTLE, #mapSvg .map-node-g.reachable.type-ELITE')
           || await p.$('#mapSvg .map-node-g.reachable');
    if (!n) break;
    await n.click({ force: true });
    await p.waitForTimeout(1500);
    if (await p.$('#battleScreen:not(.hidden)')) break;
    if (await p.$('#campLeaveBtn:visible')) { await p.click('#campLeaveBtn'); await p.waitForTimeout(1200); }
  }
  await p.waitForSelector('#handRow .playcard', { timeout: 60000 });
}

const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let bad = 0;
  for (const vp of VIEWPORTS) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await startBattle(p);

    // --- uniform card size in the fan -----------------------------------
    const fan = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('#handRow .playcard')];
      // offsetWidth/Height is the laid-out box, free of the fan's rotate+scale
      // transform (a rotated bounding rect differs per card by design).
      const sizes = cards.map(c => ({ w: c.offsetWidth, h: c.offsetHeight,
        desc: (c.querySelector('.pc-desc') || {}).textContent || '' }));
      return { count: cards.length, sizes,
               heights: [...new Set(sizes.map(s => s.h))],
               widths: [...new Set(sizes.map(s => s.w))],
               longest: Math.max(0, ...sizes.map(s => s.desc.length)),
               shortest: Math.min(999, ...sizes.map(s => s.desc.length)) };
    });

    // --- hand sheet -------------------------------------------------------
    const closed = await p.$eval('#handSheet', e => e.classList.contains('hidden'));
    await p.click('#deckCounts');
    await p.waitForTimeout(300);
    const sheet = await p.evaluate(() => {
      const s = document.getElementById('handSheet');
      const grid = document.getElementById('handSheetGrid');
      const cards = [...grid.querySelectorAll('.playcard')];
      const cr = document.querySelector('.hand-sheet-card').getBoundingClientRect();
      const boxes = cards.map(c => { const r = c.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; });
      return {
        open: !s.classList.contains('hidden'),
        expanded: document.getElementById('deckCounts').getAttribute('aria-expanded'),
        handCount: document.querySelectorAll('#handRow .playcard').length,
        sheetCount: cards.length,
        sub: document.getElementById('handSheetSub').textContent,
        descsShown: cards.filter(c => getComputedStyle(c.querySelector('.pc-desc')).display !== 'none'
                                   && c.querySelector('.pc-desc').textContent.trim()).length,
        heights: [...new Set(boxes.map(b => b.h))],
        widths: [...new Set(boxes.map(b => b.w))],
        insideViewport: cr.top >= -1 && cr.left >= -1 && cr.bottom <= innerHeight + 1 && cr.right <= innerWidth + 1,
        gridScrollable: grid.scrollHeight > grid.clientHeight + 1,
      };
    });
    await p.screenshot({ path: OUT + '/hand-sheet-' + vp.name + '.png' });
    // tapping a card closes the sheet and centers that card in the fan
    const pickedName = await p.$eval('#handSheetGrid .playcard:last-child .pc-name', e => e.textContent);
    await p.click('#handSheetGrid .playcard:last-child');
    await p.waitForTimeout(400);
    const afterPick = await p.evaluate((name) => {
      const hand = document.getElementById('handRow');
      const cards = [...hand.querySelectorAll('.playcard')];
      const hit = cards.filter(c => c.querySelector('.pc-name').textContent === name);
      const scrollable = hand.scrollWidth > hand.clientWidth + 1;
      return { closed: document.getElementById('handSheet').classList.contains('hidden'),
               pickedIsFocused: hit.some(c => c.classList.contains('selected')),
               // a fan that fits on screen never scrolls, so centering only
               // applies when there is somewhere to scroll to
               pickedIsCentered: !scrollable || hit.some(c => c.classList.contains('is-centered')),
               scrollable, name };
    }, pickedName);
    // reopening then pressing Escape closes it too
    await p.click('#deckCounts');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    const escClosed = await p.$eval('#handSheet', e => e.classList.contains('hidden'));

    const ok = {
      fanUniformHeight: fan.heights.length === 1,
      fanUniformWidth: fan.widths.length === 1,
      fanHasVariedText: fan.longest !== fan.shortest,
      sheetStartsClosed: closed,
      sheetOpens: sheet.open && sheet.expanded === 'true',
      sheetMatchesHand: sheet.sheetCount === sheet.handCount && sheet.sheetCount > 0,
      sheetShowsDescriptions: sheet.descsShown === sheet.sheetCount,
      sheetUniformCards: sheet.heights.length === 1 && sheet.widths.length === 1,
      sheetInsideViewport: sheet.insideViewport,
      pickClosesAndFocuses: afterPick.closed && afterPick.pickedIsFocused && afterPick.pickedIsCentered,
      escapeCloses: escClosed,
      noPageErrors: errs.length === 0,
    };
    const fails = Object.keys(ok).filter(k => !ok[k]);
    if (fails.length) bad++;
    console.log(vp.name, JSON.stringify({ fan: { count: fan.count, h: fan.heights, w: fan.widths, descLen: [fan.shortest, fan.longest] }, sheet, afterPick, errs, fails }));
    await p.close();
  }
  await b.close();
  console.log(bad ? 'FAILURES: ' + bad : 'ALL VIEWPORTS PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
