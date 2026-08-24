/* Siege hand-card sizing guard.
 *
 * Cards in the fan are a fixed box (--playcard-w/h) and .playcard keeps
 * overflow visible for the AP badge, so a card whose text does not fit spills
 * its effect line onto the board instead of being clipped. This asserts that
 * the worst realistic card — a long "Owner: Ability" name plus a wrapping
 * effect line — still ends inside its own content box at every viewport, and
 * that a held card lifts above its overlapping neighbours.
 *
 * Serve src/main/resources/static on :8099, then: node tests/siege-card-size-check.cjs
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = process.env.SIEGE_BASE || 'http://127.0.0.1:8099';

const CARDS = [
  { cost: 2, name: 'Ser Airek: Aero Sphere', owner: '🛡 Ser Airek', eff: 'Shield 4 (all)', cls: 'shield',
    desc: 'Grants a shield to every ally in the warband for one round.' },
  { cost: 2, name: 'Evolve: Dracoil', owner: '🔥 Draco', eff: '🌟 Evolve!', cls: 'evo', desc: '', gauge: [0, 5] },
  { cost: 3, name: 'Shellpack: Tidal Crush Barrage', owner: '💧 Shellpack', eff: '⚔ 12 damage', cls: 'dmg',
    desc: 'Hits the target three times and lowers its speed for two rounds.' },
  { cost: 1, name: 'Draco: Ember', owner: '🔥 Draco', eff: '⚔ 4 damage', cls: 'dmg', desc: 'A quick flame flick.' },
];

// Mirrors playCardMarkup() in adventure.js.
function markup(c) {
  const gauge = c.gauge
    ? `<div class="pc-gauge"><div class="pc-gaugefill" style="width:0%"></div><span>🌟 ${c.gauge[0]}/${c.gauge[1]} AP</span></div>`
    : '';
  return `<div class="pc-cost">${c.cost}</div><div class="pc-name">${c.name}</div>` +
    `<div class="pc-owner">${c.owner}</div><div class="pc-eff ${c.cls}">${c.eff}</div>` +
    `${gauge}<div class="pc-desc">${c.desc}</div>`;
}

const HTML = `<link rel="stylesheet" href="/css/adventure.css">
<div class="siege-app"><div class="hand-fan" id="handRow">` +
  CARDS.map((c) => `<div class="playcard">${markup(c)}</div>`).join('') + `</div></div>`;

const VIEWPORTS = [
  { w: 390, h: 844, n: 'phone-portrait' },
  { w: 995, h: 460, n: 'phone-landscape' },
  { w: 1024, h: 768, n: 'tablet-landscape' },
  { w: 1920, h: 1080, n: 'desktop' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let failures = 0;
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.goto(BASE + '/adventure.html');
    await page.setContent(HTML);
    await page.addStyleTag({ content: 'body{margin:0}' });
    await page.evaluate(() => { document.body.dataset.screen = 'battleScreen'; });
    await page.waitForTimeout(150);

    const cards = await page.evaluate(() => Array.from(document.querySelectorAll('.playcard')).map((card) => {
      const box = card.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(card).paddingBottom);
      // The AP badge is deliberately hung outside the corner — exclude it.
      const rows = Array.from(card.children).filter((k) => !k.classList.contains('pc-cost'));
      const bottom = Math.max.apply(null, rows.map((k) => k.getBoundingClientRect().bottom));
      return {
        name: card.querySelector('.pc-name').textContent,
        w: Math.round(box.width),
        h: Math.round(box.height),
        overflow: Math.round(bottom - (box.bottom - pad)),
      };
    }));

    // Held card must rise above its neighbours the way a tapped one does.
    await page.evaluate(() => document.querySelectorAll('.playcard')[1].classList.add('playcard-pressed'));
    await page.waitForTimeout(120);
    const held = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelectorAll('.playcard')[1]);
      return { z: parseInt(s.zIndex, 10) || 0, transform: s.transform };
    });
    await page.close();

    const shape = cards[0].h / cards[0].w;
    const spilled = cards.filter((c) => c.overflow > 0);
    const ok = !spilled.length && shape >= 1.2 && held.z >= 6 && held.transform !== 'none';
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${vp.n} card=${cards[0].w}x${cards[0].h} ratio=${shape.toFixed(2)} ` +
      `worstOverflow=${Math.max.apply(null, cards.map((c) => c.overflow))}px heldZ=${held.z}`);
    spilled.forEach((c) => console.log(`   text off card: "${c.name}" by ${c.overflow}px`));
  }
  await browser.close();
  if (failures) { console.error(`${failures} viewport(s) failed`); process.exit(1); }
  console.log('all checks passed');
})();
