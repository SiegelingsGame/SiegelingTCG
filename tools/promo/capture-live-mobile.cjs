#!/usr/bin/env node
/**
 * Capture live Arena/Siege battles at a phone viewport, then composite each
 * shot into a 1920x1080 plate with a centered phone bezel for the promo.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromium = require('/tmp/promo-pw/node_modules/playwright').chromium;

const LIVE = 'https://siegelingstcgtesting.web.app';
const OUT = path.resolve(__dirname, '../../src/main/resources/static/img/promo/gameplay');
const ART = '/opt/cursor/artifacts';
const TMP = '/tmp/promo-mobile-capture';
const PHONE_W = 390;
const PHONE_H = 844;
const PLATE_W = 1920;
const PLATE_H = 1080;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr || r.stdout}`);
}

/** Pad a portrait phone PNG into a 1920x1080 plate with a dark bezel + soft glow. */
function toPhonePlate(pngPath, webpName) {
  const webp = path.join(OUT, webpName + '.webp');
  const framed = path.join(TMP, webpName + '-framed.png');
  // Scale phone to fit ~78% of plate height, keep aspect, center.
  const targetH = Math.round(PLATE_H * 0.86);
  const targetW = Math.round(targetH * (PHONE_W / PHONE_H));
  const padX = Math.round((PLATE_W - targetW) / 2);
  const padY = Math.round((PLATE_H - targetH) / 2);
  const radius = Math.round(targetW * 0.08);
  const bezel = Math.max(10, Math.round(targetW * 0.035));

  // 1) Scale the capture.
  const scaled = path.join(TMP, webpName + '-scaled.png');
  run('ffmpeg', [
    '-y', '-i', pngPath,
    '-vf', `scale=${targetW}:${targetH}`,
    scaled
  ]);

  // 2) Build plate: navy vignette bg + rounded phone with bezel via geq/overlay.
  // Use a two-pass: create bezel rect, overlay screen inset, round via alphamerge-ish mask.
  run('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `color=c=0x050b1a:s=${PLATE_W}x${PLATE_H}:d=1`,
    '-f', 'lavfi', '-i', `color=c=0x0a1530:s=${PLATE_W}x${PLATE_H}:d=1`,
    '-i', scaled,
    '-filter_complex',
    [
      // Soft radial glow behind the phone
      `[1]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*max(0,1-hypot(X-${PLATE_W}/2\\,Y-${PLATE_H}/2)/(${targetH}*0.72))'[glow]`,
      `[0][glow]overlay=0:0[bg]`,
      // Bezel layer (slightly larger dark rounded rect approximated by boxblur pad)
      `[2]pad=${targetW + bezel * 2}:${targetH + bezel * 2}:${bezel}:${bezel}:color=0x111827[padded]`,
      // Round corners on the padded phone via alphamerge with a rounded mask
      `color=white:s=${targetW + bezel * 2}x${targetH + bezel * 2},format=gray,geq=lum='if(gt(hypot(X-(${radius}+0.5)\\,Y-(${radius}+0.5))\\,${radius})*lt(X\\,${radius})*lt(Y\\,${radius})+gt(hypot(X-(W-${radius}-0.5)\\,Y-(${radius}+0.5))\\,${radius})*gt(X\\,W-${radius})*lt(Y\\,${radius})+gt(hypot(X-(${radius}+0.5)\\,Y-(H-${radius}-0.5))\\,${radius})*lt(X\\,${radius})*gt(Y\\,H-${radius})+gt(hypot(X-(W-${radius}-0.5)\\,Y-(H-${radius}-0.5))\\,${radius})*gt(X\\,W-${radius})*gt(Y\\,H-${radius})\\,0\\,255)'[mask]`,
      `[padded]format=rgba[paddeda]`,
      `[paddeda][mask]alphamerge[phone]`,
      `[bg][phone]overlay=${padX - bezel}:${padY - bezel}`
    ].join(';'),
    '-frames:v', '1', framed
  ]);

  run('ffmpeg', ['-y', '-i', framed, '-frames:v', '1', '-q:v', '82', webp]);
  fs.copyFileSync(framed, path.join(ART, `promo-mobile-${webpName}.png`));
  console.log('plate', webpName, fs.statSync(webp).size);
  return webp;
}

async function waitArt(page, min = 3) {
  await page.waitForFunction((need) => {
    const imgs = Array.from(document.images);
    return imgs.filter((i) => i.complete && i.naturalWidth > 40).length >= need;
  }, min, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(ART, { recursive: true });
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/google-chrome',
    args: ['--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });
  const context = await browser.newContext({
    viewport: { width: PHONE_W, height: PHONE_H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('siegelingsInstallGuideDismissed.v2', '1');
      localStorage.setItem('sieglingsTutorialComplete', '1');
    } catch (e) { /* ignore */ }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);

  console.log('goto play (mobile)');
  await page.goto(`${LIVE}/play`, { waitUntil: 'domcontentloaded' });
  await page.locator('#btnStartLoadout').waitFor({ state: 'visible' });
  for (const step of ['setup', 'deck', 'knight', 'review']) {
    const chip = page.locator(`#loadoutStepChip-${step}`);
    if (await chip.count()) await chip.click().catch(() => {});
  }
  await page.locator('#btnStartLoadout').click();

  // Wait through loading gate to mulligan or arena.
  await page.waitForSelector('#mulliganOverlay.visible, button:has-text("Keep hand"), #btnDraw', { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await waitArt(page, 3);

  const mulliganPng = path.join(TMP, 'mulligan.png');
  await page.screenshot({ path: mulliganPng, type: 'png' });
  toPhonePlate(mulliganPng, 'battle-standby');

  await page.evaluate(async () => {
    const o = document.getElementById('loadoutOverlay');
    if (o) o.classList.remove('visible');
    if (typeof submitMulliganKeep === 'function') await submitMulliganKeep();
  });
  await page.waitForTimeout(3000);
  await waitArt(page, 4);

  const boardPng = path.join(TMP, 'board.png');
  await page.screenshot({ path: boardPng, type: 'png' });
  toPhonePlate(boardPng, 'battle-board');

  await page.evaluate(async () => {
    if (typeof playerDraw === 'function') await playerDraw();
  });
  await page.waitForTimeout(1500);

  for (let i = 0; i < 3; i++) {
    await page.evaluate(async (idx) => {
      const cards = Array.from(document.querySelectorAll('.hand-card'));
      const el = cards[idx] || cards[0];
      if (el) el.click();
      await new Promise((r) => setTimeout(r, 120));
      if (typeof placeCard === 'function') {
        for (const [r, c] of [[2, 1], [1, 1], [2, 0], [2, 2], [1, 0], [1, 2]]) {
          try { await placeCard(r, c); return; } catch (e) { /* next */ }
        }
      }
    }, i);
    await page.waitForTimeout(900);
  }

  await waitArt(page, 3);
  const clashPng = path.join(TMP, 'clash.png');
  await page.screenshot({ path: clashPng, type: 'png' });
  toPhonePlate(clashPng, 'battle-clash');

  for (let i = 0; i < 3; i++) {
    await page.evaluate(async () => {
      if (typeof endTurn === 'function') await endTurn();
    });
    await page.waitForTimeout(1800);
  }
  await waitArt(page, 2);
  const abilityPng = path.join(TMP, 'ability.png');
  await page.screenshot({ path: abilityPng, type: 'png' });
  toPhonePlate(abilityPng, 'battle-ability');

  console.log('goto siege (mobile)');
  await page.goto(`${LIVE}/siege`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await waitArt(page, 3);
  const siegePng = path.join(TMP, 'siege.png');
  await page.screenshot({ path: siegePng, type: 'png' });
  toPhonePlate(siegePng, 'siege-hand');

  // Try to enter tutorial for an in-run beat.
  const tut = page.locator('text=Tutorial').first();
  if (await tut.count()) await tut.click().catch(() => {});
  await page.waitForTimeout(800);
  for (const label of ['Continue', 'Begin', 'Start', 'Confirm', 'Next']) {
    const b = page.getByRole('button', { name: label });
    if (await b.count() && await b.first().isVisible().catch(() => false)) {
      await b.first().click().catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  await waitArt(page, 2);
  const strikePng = path.join(TMP, 'strike.png');
  await page.screenshot({ path: strikePng, type: 'png' });
  toPhonePlate(strikePng, 'siege-strike');

  const stats = await page.evaluate(() => {
    const imgs = Array.from(document.images);
    return {
      imgs: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 40).length
    };
  });
  console.log(JSON.stringify({ ok: true, stats, out: OUT }, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
