#!/usr/bin/env node
/**
 * Drive the LIVE Arena match via game.js globals, wait for Firebase card art,
 * and save 1920x1080 gameplay plates for the promo cinematic.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let chromium;
try {
  chromium = require('/tmp/promo-pw/node_modules/playwright').chromium;
} catch (_) {
  chromium = require('playwright').chromium;
}

const LIVE = 'https://siegelingstcgtesting.web.app';
const OUT = path.resolve(__dirname, '../../src/main/resources/static/img/promo/gameplay');
const ARTIFACT = '/opt/cursor/artifacts';
const W = 1920;
const H = 1080;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} failed\n${r.stderr || r.stdout}`);
}

async function waitStorageArt(page, min = 4) {
  await page.waitForFunction((need) => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const loaded = imgs.filter((img) => {
      const src = img.currentSrc || img.src || '';
      return /firebasestorage|art-thumbs/.test(src) && img.complete && img.naturalWidth > 40;
    });
    return loaded.length >= need;
  }, min, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function phaseOf(page) {
  return page.evaluate(() => {
    // gameState is file-scoped `let`, but actions close over it — read via HUD.
    const banner = (document.body.innerText || '').match(/\b(DRAW|SETUP|BATTLE|MULLIGAN)\s*T?\d*/i);
    return banner ? banner[0].toUpperCase() : null;
  });
}

async function callGame(page, expr) {
  return page.evaluate(async (code) => {
    // Hide loadout if it somehow reappears over the arena.
    const loadout = document.getElementById('loadoutOverlay');
    if (loadout) loadout.classList.remove('visible');
    // eslint-disable-next-line no-new-func
    return await (new Function(`return (async () => { ${code} })()`)());
  }, expr);
}

async function shot(page, name) {
  const png = path.join(ARTIFACT, `live-gameplay-${name}.png`);
  const webp = path.join(OUT, `${name}.webp`);
  await page.screenshot({ path: png, type: 'png' });
  run('ffmpeg', [
    '-y', '-i', png,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080',
    '-frames:v', '1', '-q:v', '82', webp
  ]);
  console.log('saved', name, fs.statSync(webp).size);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(ARTIFACT, { recursive: true });

  const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/google-chrome',
    args: ['--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('siegelingsInstallGuideDismissed.v2', '1');
      localStorage.setItem('sieglingsTutorialComplete', '1');
    } catch (e) { /* ignore */ }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  console.log('goto play');
  await page.goto(`${LIVE}/play`, { waitUntil: 'domcontentloaded' });
  await page.locator('#btnStartLoadout').waitFor({ state: 'visible' });
  // Walk loadout chips so Start is enabled.
  for (const step of ['setup', 'deck', 'knight', 'review']) {
    const chip = page.locator(`#loadoutStepChip-${step}`);
    if (await chip.count()) await chip.click().catch(() => {});
  }
  console.log('start battle');
  await page.locator('#btnStartLoadout').click();

  // Wait for mulligan overlay or arena HUD.
  await page.waitForFunction(() => {
    const m = document.getElementById('mulliganOverlay');
    return (m && m.classList.contains('visible')) || !!document.getElementById('btnDraw');
  }, null, { timeout: 120000 });

  const mulliganVisible = await page.evaluate(() => {
    const m = document.getElementById('mulliganOverlay');
    return !!(m && m.classList.contains('visible'));
  });
  console.log('mulligan visible', mulliganVisible);
  if (mulliganVisible) {
    await waitStorageArt(page, 3);
    await callGame(page, 'if (typeof submitMulliganKeep === "function") await submitMulliganKeep();');
    await page.waitForTimeout(2000);
  }

  await callGame(page, 'const o=document.getElementById("loadoutOverlay"); if(o) o.classList.remove("visible");');
  await waitStorageArt(page, 4);
  console.log('phase', await phaseOf(page));
  await shot(page, 'battle-board');

  // DRAW → SETUP
  await callGame(page, 'if (typeof playerDraw === "function") await playerDraw();');
  await page.waitForTimeout(1500);
  console.log('phase after draw', await phaseOf(page));

  // Place up to 3 sieglings: select hand slot then placeCard on empty cells.
  for (let n = 0; n < 3; n++) {
    const result = await page.evaluate(async (attempt) => {
      const loadout = document.getElementById('loadoutOverlay');
      if (loadout) loadout.classList.remove('visible');
      const cards = Array.from(document.querySelectorAll('.hand-card, .hand-slot .hand-card, #handStrip .hand-card'));
      // Prefer a card that looks like a Siegeling (has health pip / creature frame).
      let target = cards.find((el) => /siegling|creature|health|hp/i.test(el.className + el.innerHTML))
        || cards[Math.min(attempt + 1, cards.length - 1)]
        || cards[0];
      if (!target) return { ok: false, reason: 'no-hand-dom', count: cards.length };
      target.click();
      await new Promise((r) => setTimeout(r, 200));
      if (typeof placeCard === 'function') {
        // Player board is rows 0..2; try center-ish empties.
        const tries = [[2, 1], [1, 1], [2, 0], [2, 2], [1, 0], [1, 2], [0, 1], [0, 0], [0, 2]];
        for (const [r, c] of tries) {
          try {
            await placeCard(r, c);
            return { ok: true, r, c, attempt };
          } catch (e) { /* try next */ }
        }
      }
      return { ok: false, reason: 'place-failed', hand: cards.length };
    }, n);
    console.log('place', result);
    await page.waitForTimeout(900);
  }

  await waitStorageArt(page, 5);
  await shot(page, 'battle-standby');

  // End turns / battle until BATTLE phase or cards acted.
  for (let i = 0; i < 6; i++) {
    const phase = await phaseOf(page);
    console.log('loop', i, phase);
    if (phase && phase.startsWith('BATTLE')) break;
    await callGame(page, `
      if (typeof endTurn === "function") await endTurn();
      else if (typeof executeBattle === "function") await executeBattle();
    `);
    await page.waitForTimeout(1800);
  }

  await waitStorageArt(page, 4);
  await page.waitForTimeout(1200);
  await shot(page, 'battle-clash');

  // Ability panel / battle actions if present.
  await callGame(page, `
    const btn = document.querySelector("#btnBattlePanel, #btnActNow, .battle-action-btn");
    if (btn) btn.click();
  `);
  await page.waitForTimeout(800);
  await shot(page, 'battle-ability');

  // Siege mode cards (mode picker art is also live Storage art).
  console.log('goto siege');
  await page.goto(`${LIVE}/siege`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await waitStorageArt(page, 3);
  await shot(page, 'siege-hand');

  // Start tutorial for an in-run battle if possible (nothing saved).
  const tut = page.getByRole('button', { name: /Tutorial/i }).first();
  if (await tut.count() && await tut.isVisible().catch(() => false)) {
    await tut.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  for (const name of [/Begin/i, /Start/i, /Continue/i, /Enter/i, /Confirm/i]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
  await waitStorageArt(page, 2);
  await shot(page, 'siege-strike');

  const artStats = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const storage = imgs.filter((i) => /firebasestorage|art-thumbs/.test(i.currentSrc || i.src || ''));
    const loaded = storage.filter((i) => i.complete && i.naturalWidth > 40);
    return { totalImg: imgs.length, storage: storage.length, loaded: loaded.length };
  });
  console.log(JSON.stringify({ ok: true, artStats }, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
