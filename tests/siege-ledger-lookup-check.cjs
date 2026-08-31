/**
 * Siege turn-ledger lookup check.
 *
 * Drives a REAL expedition against a locally running app (./mvnw spring-boot:run
 * on :8080): walks into the first battle, plays a card, ends the turn so the
 * ledger carries both sides' rows, then asserts that an actor name and a card
 * chip in the ledger each open the matching detail modal.
 *
 *   node tests/siege-ledger-lookup-check.cjs
 *
 * Note: spring-boot:run serves the copy of static/ under target/classes taken
 * at startup — re-copy edited assets there (or restart) before running.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

async function startBattle(p) {
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

    // End the turn so both sides put rows in the ledger, then reopen it.
    await p.click('#endTurnBtn');
    await p.waitForTimeout(9000);
    await p.click('.lg-more');
    await p.waitForSelector('#ledgerPanel:not(.hidden)', { timeout: 15000 });
    await p.waitForTimeout(600);

    const rows = await p.evaluate(() => ({
      total: document.querySelectorAll('#ledgerBody .ledger-row').length,
      actors: document.querySelectorAll('#ledgerBody button.ledger-actor').length,
      cards: document.querySelectorAll('#ledgerBody button.ledger-card').length,
    }));
    const ok = (label, cond, extra) => {
      console.log(`${cond ? 'OK  ' : 'FAIL'} [${vp.name}] ${label}${extra ? ' — ' + extra : ''}`);
      if (!cond) bad++;
    };
    ok('ledger has rows', rows.total > 0, JSON.stringify(rows));
    ok('actor names are tappable', rows.actors > 0);
    ok('card chips are tappable', rows.cards > 0);

    // Tapping an actor opens that unit's sheet.
    if (rows.actors) {
      const name = await p.$eval('#ledgerBody button.ledger-actor', e => e.textContent.trim());
      await p.click('#ledgerBody button.ledger-actor');
      await p.waitForTimeout(400);
      const modal = await p.evaluate(() => ({
        open: !document.getElementById('unitModal').classList.contains('hidden'),
        name: (document.querySelector('#unitModalBody .um-name') || {}).textContent || '',
      }));
      ok('actor tap opens its unit', modal.open && modal.name.includes(name), `${name} -> "${modal.name.trim()}"`);
      await p.click('#unitModalClose').catch(() => {});
      await p.waitForTimeout(300);
    }

    // Tapping a card chip opens that card.
    if (rows.cards) {
      await p.click('.lg-more').catch(() => {});
      await p.waitForTimeout(300);
      const card = await p.$eval('#ledgerBody button.ledger-card', e => e.textContent.replace(/^\S+\s*/, '').trim());
      await p.click('#ledgerBody button.ledger-card');
      await p.waitForTimeout(400);
      const modal = await p.evaluate(() => ({
        open: !document.getElementById('unitModal').classList.contains('hidden'),
        name: (document.querySelector('#unitModalBody .um-name') || {}).textContent || '',
        sub: (document.querySelector('#unitModalBody .um-sub') || {}).textContent || '',
        cards: document.querySelectorAll('#unitModalBody .um-card').length,
      }));
      ok('card tap opens that card', modal.open && modal.name.includes(card) && modal.cards === 1,
          `${card} -> "${modal.name.trim()}" / "${modal.sub.trim()}" / ${modal.cards} card`);
    }

    ok('no page errors', errs.length === 0, errs.join(' | '));
    await p.close();
  }
  await b.close();
  console.log(bad ? `${bad} FAILURES` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})();
