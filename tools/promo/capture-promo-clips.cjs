#!/usr/bin/env node
/**
 * Capture short LIVE gameplay video clips (mobile phone → 1920×1080 bezel plates)
 * for the Siegelings promo trailer: Arena, Siege, Dominion.
 *
 * Output: src/main/resources/static/video/promo/{arena,siege,dominion}-live.mp4
 * Plus poster webps under img/promo/gameplay/ for fallbacks.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chromium = require('/tmp/promo-pw/node_modules/playwright').chromium;

const LIVE = 'https://siegelingstcgtesting.web.app';
const STATIC = path.resolve(__dirname, '../../src/main/resources/static');
const OUT_VID = path.join(STATIC, 'video/promo');
const OUT_POSTER = path.join(STATIC, 'img/promo/gameplay');
const ART = '/opt/cursor/artifacts';
const TMP = '/tmp/promo-clips-capture';
const PHONE_W = 390;
const PHONE_H = 844;
const PLATE_W = 1920;
const PLATE_H = 1080;
const FPS = 12;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 6).join(' ')}\n${r.stderr || r.stdout}`);
  return r;
}

function pad(n) {
  return String(n).padStart(4, '0');
}

function chromePath() {
  for (const p of ['/opt/google/chrome/google-chrome', '/usr/local/bin/google-chrome', '/opt/google/chrome/chrome']) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/** Composite a portrait phone mp4 into a 16:9 cinematic plate with bezel. */
function toPhonePlateVideo(phoneMp4, outName) {
  const out = path.join(OUT_VID, outName + '.mp4');
  const targetH = Math.round(PLATE_H * 0.88);
  const targetW = Math.round(targetH * (PHONE_W / PHONE_H));
  const padX = Math.round((PLATE_W - targetW) / 2);
  const padY = Math.round((PLATE_H - targetH) / 2);
  const bezel = Math.max(10, Math.round(targetW * 0.035));
  const innerW = targetW;
  const innerH = targetH;
  const boxW = innerW + bezel * 2;
  const boxH = innerH + bezel * 2;
  run('ffmpeg', [
    '-y',
    '-i', phoneMp4,
    '-f', 'lavfi', '-i', `color=c=0x050b1a:s=${PLATE_W}x${PLATE_H}:r=${FPS}`,
    '-f', 'lavfi', '-i', `color=c=0x111827:s=${boxW}x${boxH}:r=${FPS}`,
    '-filter_complex',
    [
      `[0:v]fps=${FPS},scale=${innerW}:${innerH}:flags=lanczos,setsar=1[phone]`,
      `[2:v][phone]overlay=${bezel}:${bezel}:shortest=1[framed]`,
      `[1:v][framed]overlay=${padX - bezel}:${padY - bezel}:shortest=1[out]`
    ].join(';'),
    '-map', '[out]',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    // All-intra so promo record-mode can scrub currentTime frame-accurately.
    '-g', '1', '-keyint_min', '1', '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    out
  ]);
  // Poster still
  const poster = path.join(OUT_POSTER, outName.replace('-live', '') + '-poster.webp');
  const mid = path.join(ART, `clip-${outName}-poster.png`);
  run('ffmpeg', ['-y', '-ss', '1.2', '-i', out, '-frames:v', '1', mid]);
  run('ffmpeg', ['-y', '-i', mid, '-frames:v', '1', '-q:v', '80', poster]);
  fs.copyFileSync(out, path.join(ART, outName + '.mp4'));
  console.log('clip', outName, (fs.statSync(out).size / 1024).toFixed(0) + 'KB', 'poster', path.basename(poster));
  return out;
}

async function waitArt(page, min = 3) {
  await page.waitForFunction((need) => {
    return Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 40).length >= need;
  }, min, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function hideChrome(page) {
  await page.evaluate(() => {
    const o = document.getElementById('loadoutOverlay');
    if (o) o.classList.remove('visible');
    const ig = document.getElementById('installGuide');
    if (ig) ig.remove();
    document.querySelectorAll('.tc-root, .tutorial-coach, .coach-overlay, .tc-overlay')
      .forEach((el) => { el.style.pointerEvents = 'none'; el.style.opacity = '0'; el.style.display = 'none'; });
  });
}

async function prepPlayback(page) {
  await page.evaluate(() => {
    try {
      if (window.SieglingsActionQueue?.setSpeed) window.SieglingsActionQueue.setSpeed('fast');
      localStorage.setItem('sglPlaybackSpeed', 'fast');
    } catch (e) { /* ignore */ }
  });
}

async function waitQueueIdle(page, maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const busy = await page.evaluate(async () => {
      const q = window.SieglingsActionQueue;
      if (!q) return false;
      if (q.isProcessing?.() || q.isPresentationBusy?.()) {
        if (typeof q.onIdle === 'function') {
          await Promise.race([q.onIdle(), new Promise((r) => setTimeout(r, 1500))]);
        }
        return !!(q.isProcessing?.() || q.isPresentationBusy?.());
      }
      return false;
    });
    if (!busy) return true;
    await page.waitForTimeout(180);
  }
  return false;
}

async function boardSnap(page) {
  return page.evaluate(() => {
    const gs = typeof gameState !== 'undefined' ? gameState : null;
    const player = gs ? gs.playerBoard.flat().filter(Boolean) : [];
    const enemy = gs ? gs.enemyBoard.flat().filter(Boolean) : [];
    return {
      phase: gs && gs.currentPhase,
      turn: gs && gs.turnNumber,
      active: gs && gs.activeSide,
      pending: !!(gs && gs.pendingBattle),
      player: player.map((c) => c.name),
      enemy: enemy.map((c) => c.name),
      linked: document.querySelectorAll('.notch-dot.linked, .bc-notch.linked').length
    };
  });
}

async function placeOne(page) {
  return page.evaluate(async () => {
    const before = gameState.playerBoard.flat().filter(Boolean).length;
    if (before >= 5) return { ok: false, reason: 'cap' };
    if (gameState.currentPhase !== 'SETUP' || gameState.activeSide !== 'PLAYER') {
      return { ok: false, reason: 'phase', phase: gameState.currentPhase };
    }
    if (window.SieglingsActionQueue?.isProcessing?.()) {
      await Promise.race([
        window.SieglingsActionQueue.onIdle(),
        new Promise((r) => setTimeout(r, 2500))
      ]);
    }
    const hand = gameState.player.hand || [];
    const idxs = [];
    hand.forEach((c, i) => {
      if (c && c.type === 'SIEGLING' && !c.evolvesFromId) idxs.push(i);
    });
    for (const hi of idxs) {
      const card = hand[hi];
      let cells = [];
      if (typeof getLegalPlacementsForCard === 'function') {
        try { cells = getLegalPlacementsForCard(card) || []; } catch (e) { cells = []; }
      }
      if (!cells.length) cells = gameState.legalPlacements || [];
      for (const cell of cells) {
        const r = cell.row != null ? cell.row : cell[0];
        const c = cell.col != null ? cell.col : cell[1];
        try {
          const data = await api('place', 'POST', { cardId: card.id, row: r, col: c, handIndex: hi });
          await new Promise((x) => setTimeout(x, 250));
          const after = (data && data.playerBoard)
            ? data.playerBoard.flat().filter(Boolean).length
            : gameState.playerBoard.flat().filter(Boolean).length;
          if (after > before) return { ok: true, name: card.name, after };
        } catch (e) { /* next */ }
      }
    }
    return { ok: false, reason: 'no-place' };
  });
}

/**
 * Capture screenshots for `durationMs` while `driveFn` runs actions.
 * Encodes a raw phone mp4 then composites the cinematic plate.
 */
async function captureWhile(page, clipName, durationMs, driveFn) {
  const framesDir = path.join(TMP, clipName + '-frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  let idx = 0;
  let stop = false;
  const interval = 1000 / FPS;
  const start = Date.now();
  const shooter = (async () => {
    while (!stop) {
      const t0 = Date.now();
      await page.screenshot({
        path: path.join(framesDir, `f-${pad(idx++)}.png`),
        type: 'png',
        animations: 'allow'
      });
      const spent = Date.now() - t0;
      await page.waitForTimeout(Math.max(0, interval - spent));
      if (Date.now() - start >= durationMs) break;
    }
  })();

  try {
    await driveFn();
  } catch (e) {
    console.warn('drive', clipName, e.message || e);
  }
  // Hold until the full clip budget is filled so short drives still yield ~4–5s.
  const remain = durationMs - (Date.now() - start);
  if (remain > 0) await page.waitForTimeout(remain);
  stop = true;
  await shooter;

  if (idx < 8) throw new Error(`clip ${clipName} captured too few frames (${idx})`);
  const phoneMp4 = path.join(TMP, clipName + '-phone.mp4');
  run('ffmpeg', [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(framesDir, 'f-%04d.png'),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',
    phoneMp4
  ]);
  return toPhonePlateVideo(phoneMp4, clipName);
}

async function dismissCoaches(page) {
  for (let i = 0; i < 14; i++) {
    const gotIt = page.getByRole('button', { name: /Got it|Continue|Next|OK|Skip/i }).first();
    if (await gotIt.count() && await gotIt.isVisible().catch(() => false)) {
      await gotIt.click({ force: true }).catch(() => {});
      await page.waitForTimeout(280);
    } else break;
  }
  await hideChrome(page);
  // Hard-hide leftover coach chrome only — avoid broad [class*=tutorial] matches
  // that can blank the whole Siege screen.
  await page.evaluate(() => {
    document.querySelectorAll(
      '.tc-root, .tutorial-coach, .coach-overlay, .tc-overlay, .tc-panel, .coach-card, .adv-coach, .tc-backdrop'
    ).forEach((el) => {
      el.style.display = 'none';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
    });
  });
}

async function startArena(page) {
  console.log('arena setup');
  await page.goto(`${LIVE}/play`, { waitUntil: 'domcontentloaded' });
  await page.locator('#btnStartLoadout').waitFor({ state: 'visible' });
  for (const step of ['setup', 'deck', 'knight', 'review']) {
    const chip = page.locator(`#loadoutStepChip-${step}`);
    if (await chip.count()) await chip.click().catch(() => {});
  }
  await page.locator('#btnStartLoadout').click();
  await page.waitForSelector('button:has-text("Keep hand"), #mulliganOverlay.visible', { timeout: 180000 });
  await page.waitForTimeout(1200);
  await waitArt(page, 3);
  await hideChrome(page);
  await page.evaluate(async () => { if (typeof submitMulliganKeep === 'function') await submitMulliganKeep(); });
  await page.waitForTimeout(1200);
  await prepPlayback(page);
  await waitQueueIdle(page, 45000);
}

/** Advance a few turns so both sides have Siegelings on board. */
async function buildBoard(page, minEach = 2) {
  for (let turn = 0; turn < 10; turn++) {
    await hideChrome(page);
    await waitQueueIdle(page, 10000);
    let st = await boardSnap(page);
    console.log('build', turn, st.phase, 'P', st.player.length, 'E', st.enemy.length);
    if (st.player.length >= minEach && st.enemy.length >= minEach) return st;

    if (st.phase === 'BATTLE') {
      for (let i = 0; i < 12; i++) {
        st = await boardSnap(page);
        if (st.phase !== 'BATTLE') break;
        await page.evaluate(async () => {
          const q = window.SieglingsActionQueue;
          if (q?.isProcessing?.()) {
            await Promise.race([q.onIdle(), new Promise((r) => setTimeout(r, 2000))]);
          }
          try {
            if (gameState.pendingBattle) {
              const abs = gameState.pendingBattle.abilities || [];
              const hit = abs.find((a) => a.canAfford !== false) || null;
              if (hit) await submitBattleAction(hit.index, -1, -1);
              else await submitBattleAction(-1, -1, -1);
            } else if (!q?.isProcessing?.()) {
              await api('battle');
            }
          } catch (e) {}
        });
        await page.waitForTimeout(220);
      }
      continue;
    }
    if (st.phase === 'DRAW') {
      await page.evaluate(async () => { try { await playerDraw(); } catch (e) {} });
      await page.waitForTimeout(400);
      await waitQueueIdle(page, 8000);
      st = await boardSnap(page);
    }
    if (st.phase === 'SETUP' && st.active === 'PLAYER') {
      await placeOne(page);
      await page.waitForTimeout(350);
      await waitQueueIdle(page, 8000);
      try { await page.evaluate(async () => { await endTurn(); }); } catch (e) {}
      await page.waitForTimeout(500);
      await waitQueueIdle(page, 18000);
    }
  }
  return boardSnap(page);
}

/** Drain one full Arena BATTLE phase (abilities / passes until SETUP/DRAW). */
async function resolveArenaBattle(page, maxSteps = 28) {
  for (let i = 0; i < maxSteps; i++) {
    const st = await boardSnap(page);
    if (st.phase !== 'BATTLE') return st;
    await page.evaluate(async () => {
      const q = window.SieglingsActionQueue;
      if (q?.isProcessing?.()) {
        await Promise.race([q.onIdle(), new Promise((r) => setTimeout(r, 2200))]);
      }
      try {
        if (gameState.pendingBattle) {
          const abs = gameState.pendingBattle.abilities || [];
          const hit = abs.find((a) => a.canAfford !== false && /damage|deal|strike|burst|blast|flame|ember|shot|spark/i.test((a.name || '') + (a.description || '')))
            || abs.find((a) => a.canAfford !== false)
            || null;
          if (hit) await submitBattleAction(hit.index, -1, -1);
          else await submitBattleAction(-1, -1, -1);
        } else if (!q?.isProcessing?.()) {
          await api('battle');
        }
      } catch (e) { /* keep draining */ }
    });
    await page.waitForTimeout(320);
  }
  return boardSnap(page);
}

async function captureArena(page) {
  await startArena(page);
  // Seed a short board so the filmed battle has Siegelings on both sides.
  const st = await buildBoard(page, 1);
  console.log('arena board ready', st);

  // Get to the brink of battle (SETUP done / about to fight) before the camera rolls.
  for (let i = 0; i < 4; i++) {
    let snap = await boardSnap(page);
    if (snap.phase === 'BATTLE') break;
    if (snap.phase === 'DRAW') {
      await page.evaluate(async () => { try { await playerDraw(); } catch (e) {} });
      await page.waitForTimeout(400);
      await waitQueueIdle(page, 8000);
      continue;
    }
    if (snap.phase === 'SETUP' && snap.active === 'PLAYER') {
      await placeOne(page);
      await page.waitForTimeout(300);
      break;
    }
    await page.waitForTimeout(300);
  }

  // Clip: enter battle → resolve abilities → leave BATTLE (start + resolve).
  return captureWhile(page, 'arena-live', 6500, async () => {
    let snap = await boardSnap(page);
    console.log('arena clip start', snap.phase, 'P', snap.player.length, 'E', snap.enemy.length);
    if (snap.phase === 'DRAW') {
      await page.evaluate(async () => { try { await playerDraw(); } catch (e) {} });
      await page.waitForTimeout(450);
      snap = await boardSnap(page);
    }
    if (snap.phase === 'SETUP') {
      if (snap.active === 'PLAYER') {
        await placeOne(page);
        await page.waitForTimeout(450);
      }
      try { await page.evaluate(async () => { await endTurn(); }); } catch (e) {}
      await page.waitForTimeout(900);
      await waitQueueIdle(page, 12000);
    }
    snap = await boardSnap(page);
    console.log('arena entering battle?', snap.phase);
    if (snap.phase === 'BATTLE') {
      const done = await resolveArenaBattle(page, 24);
      console.log('arena battle resolved →', done.phase, 'P', done.player.length, 'E', done.enemy.length);
    } else {
      // Force into battle if AI is still setting up.
      for (let i = 0; i < 6; i++) {
        snap = await boardSnap(page);
        if (snap.phase === 'BATTLE') {
          await resolveArenaBattle(page, 20);
          break;
        }
        if (snap.phase === 'SETUP' && snap.active === 'PLAYER') {
          try { await page.evaluate(async () => { await endTurn(); }); } catch (e) {}
        }
        await page.waitForTimeout(700);
      }
    }
  });
}

async function startStandardSiege(page) {
  console.log('siege standard setup');
  await page.goto(`${LIVE}/siege`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await waitArt(page, 1);

  // Dismiss resume / account banners if any.
  for (const name of [/New run|Fresh|Dismiss|Close|Continue without/i]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) {
      await b.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }

  await page.locator('#chooseSiegeMode').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#chooseSiegeMode').click();
  console.log('chose Adventure (standard) mode');

  // Knight step
  await page.waitForSelector('#setupStepKnight:not(.hidden), .knight-card', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.waitForFunction(() => {
    return document.querySelectorAll('.knight-card:not(.locked)').length > 0;
  }, null, { timeout: 60000 }).catch(() => {});

  const knightPicked = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.knight-card:not(.locked)'));
    const pick = cards[0];
    if (!pick) return null;
    pick.click();
    return pick.getAttribute('data-kid');
  });
  console.log('knight', knightPicked);
  await page.waitForTimeout(500);
  await page.locator('#knightNextBtn').click({ force: true });
  await page.waitForTimeout(1000);

  // Warband step — wait for ready siegelings, pick enough for the knight.
  await page.waitForSelector('#setupStepParty:not(.hidden), .sgl-card', { timeout: 90000 });
  await page.waitForFunction(() => {
    const panel = document.getElementById('warbandLoadPanel');
    const loading = panel && !panel.classList.contains('hidden');
    const ready = document.querySelectorAll('.sgl-card:not(.locked)').length;
    return !loading && ready > 0;
  }, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(600);

  const party = await page.evaluate(() => {
    const needText = (document.getElementById('setupSummary') || {}).textContent || '';
    const m = /Warband \((\d+)\/(\d+)\)/.exec(needText);
    let need = m ? parseInt(m[2], 10) : 1;
    const cards = Array.from(document.querySelectorAll('.sgl-card:not(.locked)'));
    const picked = [];
    for (const c of cards) {
      if (picked.length >= need) break;
      c.click();
      picked.push(c.getAttribute('data-sid') || c.querySelector('.sname')?.textContent || '?');
    }
    return { need, picked };
  });
  console.log('warband', party);
  await page.waitForTimeout(500);

  // Ensure Begin Expedition is enabled
  await page.waitForFunction(() => {
    const btn = document.getElementById('startRunBtn');
    return btn && !btn.disabled;
  }, null, { timeout: 30000 }).catch(() => {});
  await page.locator('#startRunBtn').click({ force: true });
  console.log('Begin Expedition clicked');

  await page.waitForFunction(() => document.body.dataset.screen === 'mapScreen', { timeout: 90000 });
  await page.waitForTimeout(1200);
  await waitArt(page, 2);
  const screen = await page.evaluate(() => document.body.dataset.screen);
  console.log('siege on map', screen, 'reachable', await page.locator('.map-node-g.reachable').count());
}

async function dismissSiegeModals(page) {
  await page.evaluate(() => {
    // Battlegrounds is a setup-only secondary mode — strip it so it cannot
    // steal the map/battle clip (Got it / entry clicks were leaking mid-run).
    ['bgModal', 'battlegroundsEntry', 'chooseBattlegroundsMode'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    document.querySelectorAll('.bg-modal, .bg-entry, [id*="bgModal"]').forEach((el) => el.remove());
  });
}

async function captureSiege(page) {
  await startStandardSiege(page);
  await dismissSiegeModals(page);

  // Prefer a battle / skirmish node among reachable ones.
  await page.evaluate(() => {
    const battle = document.querySelector('.map-node-g.reachable.type-BATTLE')
      || document.querySelector('.map-node-g.reachable');
    if (battle) battle.scrollIntoView({ block: 'center', inline: 'center' });
  });
  await page.waitForTimeout(400);

  let pre = await page.evaluate(() => document.body.dataset.screen);
  console.log('siege pre-clip screen', pre);

  // Clip: hold map → tap a Skirmish/battle point → fight (no tutorial coaches).
  return captureWhile(page, 'siege-live', 7200, async () => {
    await dismissSiegeModals(page);
    // Let the map read for ~1.6s before travel.
    await page.waitForTimeout(1600);

    await page.evaluate(() => {
      const n = document.querySelector('.map-node-g.reachable.type-BATTLE')
        || document.querySelector('.map-node-g.reachable')
        || document.querySelector('.map-node-g');
      if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(1000);
    await dismissSiegeModals(page);

    // Confirm travel/fight only — avoid loose /go/ which matches "Got it".
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const hit = btns.find((b) => /^(fight|begin battle|enter|travel|embark)/i.test((b.textContent || '').trim()));
      if (hit) hit.click();
    });
    await page.waitForTimeout(1100);
    await dismissSiegeModals(page);

    let screen = await page.evaluate(() => document.body.dataset.screen);
    console.log('siege after node', screen);

    // Non-battle nodes: leave and try another reachable battle.
    if (screen !== 'battleScreen') {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const hit = btns.find((b) => /^(continue|done|leave|back to map|claim)$/i.test((b.textContent || '').trim()));
        if (hit) hit.click();
      });
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const n = document.querySelector('.map-node-g.reachable.type-BATTLE')
          || document.querySelector('.map-node-g.reachable');
        if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      await page.waitForTimeout(900);
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const hit = btns.find((b) => /^(fight|begin battle|enter|travel)/i.test((b.textContent || '').trim()));
        if (hit) hit.click();
      });
      await page.waitForTimeout(1000);
      screen = await page.evaluate(() => document.body.dataset.screen);
      console.log('siege second try', screen);
    }

    await dismissSiegeModals(page);
    screen = await page.evaluate(() => document.body.dataset.screen);
    if (screen === 'battleScreen') {
      await waitArt(page, 2);
      await page.waitForTimeout(500);
      // Play one card for motion, then linger on the battle — avoid End Turn
      // (skirmish victory was bouncing back into setup + Battlegrounds modal).
      await page.evaluate(() => {
        const card = document.querySelector('.hand-card, .card-fan .card, .battle-hand .card, .hand .card, .fan-card');
        if (card) card.click();
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const slot = document.querySelector(
          '.foe-unit, .enemy-unit, .battle-unit, .battlefield, [data-side="enemy"], .lane'
        );
        if (slot) slot.click();
      });
      await page.waitForTimeout(2500);
      await dismissSiegeModals(page);
      const still = await page.evaluate(() => document.body.dataset.screen);
      console.log('siege linger screen', still);
    } else {
      await page.evaluate(() => {
        const scroll = document.getElementById('mapScroll');
        if (scroll) scroll.scrollTop += 90;
      });
      await page.waitForTimeout(1200);
    }
  });
}

async function finishDominionFounder(page) {
  // Push through the founder wizard (Knight → Crest → Land → Starter → Sprite → summary).
  for (let step = 0; step < 16; step++) {
    await dismissCoaches(page);
    const title = await page.evaluate(() => (document.body.innerText || '').slice(0, 400));
    const stillFounding = /FOUND YOUR DOMINION|Crest|Choose your|Starter|Sprite|summary/i.test(title)
      && !/Expedition|Raise your|Keep|Company|Wilds/i.test(title);
    const next = page.getByRole('button', { name: /Next|Confirm|Found|Begin|Enter Keep|Finish|Start|Claim/i }).first();
    const choice = page.locator(
      '.dm-cc-sheet button.is-selected, .dm-cc-sheet button, .ck-choice, [data-calling], .dm-crest-swatch, .dm-option, [role="option"]'
    ).first();
    if (await choice.count() && await choice.isVisible().catch(() => false)) {
      await choice.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
    // Color / insignia grids — click a second option for motion if present.
    const swatch = page.locator('button.dm-swatch, .dm-color button, .dm-insignia button, .color-swatch').nth(1);
    if (await swatch.count() && await swatch.isVisible().catch(() => false)) {
      await swatch.click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
    }
    if (await next.count() && await next.isVisible().catch(() => false)) {
      const enabled = await next.isEnabled().catch(() => true);
      if (!enabled) {
        const opt = page.locator('.dm-cc-sheet button, .ck-choice, [role="button"]').nth(1);
        if (await opt.count()) await opt.click({ force: true }).catch(() => {});
        await page.waitForTimeout(250);
      }
      await next.click({ force: true }).catch(() => {});
      await page.waitForTimeout(550);
    } else if (!stillFounding) {
      break;
    } else {
      await page.waitForTimeout(300);
    }
  }
  await dismissCoaches(page);
}

async function captureDominion(page) {
  console.log('dominion setup');
  await page.goto(`${LIVE}/dominion`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await waitArt(page, 1);
  await dismissCoaches(page);

  const nameInput = page.locator('input[placeholder*="name" i], input[type="text"]').first();
  if (await nameInput.count() && await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('Roc').catch(() => {});
    await page.waitForTimeout(200);
  }
  await finishDominionFounder(page);

  const dock = page.locator('button:has-text("Expedition"), button:has-text("Company"), button:has-text("Base")').first();
  console.log('dominion dock visible', await dock.count() > 0 && await dock.isVisible().catch(() => false));

  return captureWhile(page, 'dominion-live', 4800, async () => {
    await page.waitForTimeout(400);
    for (const label of ['Expedition', 'Company', 'Base', 'Work', 'Wilds', 'Realm']) {
      const t = page.locator(`button:has-text("${label}")`).first();
      if (await t.count() && await t.isVisible().catch(() => false)) {
        await t.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(850);
      }
    }
    // If still in founder, click through crest options for visible motion.
    const crest = page.locator('button:has-text("Next")').first();
    if (await crest.count() && await crest.isVisible().catch(() => false)) {
      for (let i = 0; i < 5; i++) {
        const sw = page.locator('.dm-cc-sheet button, .dm-swatch, .color-swatch, [class*="swatch"]').nth(i % 4);
        if (await sw.count()) await sw.click({ force: true }).catch(() => {});
        await page.waitForTimeout(350);
        await crest.click({ force: true }).catch(() => {});
        await page.waitForTimeout(450);
      }
    }
    await page.evaluate(() => {
      const scroller = document.querySelector('.dm-keep, .dominion-main, main, .ck-scroll, .dm-scroll, [data-screen]');
      if (scroller) scroller.scrollTop = (scroller.scrollTop || 0) + 140;
      window.scrollBy(0, 100);
    });
  });
}

async function main() {
  fs.mkdirSync(OUT_VID, { recursive: true });
  fs.mkdirSync(OUT_POSTER, { recursive: true });
  fs.mkdirSync(ART, { recursive: true });
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const browser = await chromium.launch({
    executablePath: chromePath(),
    args: ['--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });
  const context = await browser.newContext({
    viewport: { width: PHONE_W, height: PHONE_H },
    deviceScaleFactor: 1,
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

  const want = new Set((process.argv.slice(2).filter((a) => !a.startsWith('-'))));
  const all = want.size === 0;
  const results = {};
  const errors = {};
  async function runOne(name, fn) {
    try {
      results[name] = await fn();
    } catch (e) {
      errors[name] = String(e && e.message ? e.message : e);
      console.error('FAILED', name, e);
    }
  }
  if (all || want.has('arena')) await runOne('arena', () => captureArena(page));
  if (all || want.has('siege')) await runOne('siege', () => captureSiege(page));
  if (all || want.has('dominion')) await runOne('dominion', () => captureDominion(page));

  console.log(JSON.stringify({ ok: Object.keys(errors).length === 0, results, errors }, null, 2));
  await browser.close();
  if (Object.keys(errors).length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
