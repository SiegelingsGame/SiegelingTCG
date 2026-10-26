#!/usr/bin/env node
/**
 * Capture mobile promo plates from the LIVE site for the trailer:
 *  - Arena: multi-angle full board (≤5/side), linked notches, attack beat
 *  - Siege: tutorial map navigate + battle
 *  - Dominion: keep + expedition
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chromium = require('/tmp/promo-pw/node_modules/playwright').chromium;

const LIVE = 'https://siegelingstcgtesting.web.app';
const OUT = path.resolve(__dirname, '../../src/main/resources/static/img/promo/gameplay');
const ART = '/opt/cursor/artifacts';
const TMP = '/tmp/promo-modes-capture';
const PHONE_W = 390;
const PHONE_H = 844;
const PLATE_W = 1920;
const PLATE_H = 1080;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd}\n${r.stderr || r.stdout}`);
}

function toPhonePlate(pngPath, webpName) {
  const webp = path.join(OUT, webpName + '.webp');
  const framed = path.join(TMP, webpName + '-framed.png');
  const targetH = Math.round(PLATE_H * 0.88);
  const targetW = Math.round(targetH * (PHONE_W / PHONE_H));
  const padX = Math.round((PLATE_W - targetW) / 2);
  const padY = Math.round((PLATE_H - targetH) / 2);
  const radius = Math.round(targetW * 0.08);
  const bezel = Math.max(10, Math.round(targetW * 0.035));
  const scaled = path.join(TMP, webpName + '-scaled.png');
  run('ffmpeg', ['-y', '-i', pngPath, '-vf', `scale=${targetW}:${targetH}`, scaled]);
  run('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `color=c=0x050b1a:s=${PLATE_W}x${PLATE_H}:d=1`,
    '-f', 'lavfi', '-i', `color=c=0x0a1530:s=${PLATE_W}x${PLATE_H}:d=1`,
    '-i', scaled,
    '-filter_complex',
    [
      `[1]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*max(0,1-hypot(X-${PLATE_W}/2\\,Y-${PLATE_H}/2)/(${targetH}*0.72))'[glow]`,
      `[0][glow]overlay=0:0[bg]`,
      `[2]pad=${targetW + bezel * 2}:${targetH + bezel * 2}:${bezel}:${bezel}:color=0x111827[padded]`,
      `color=white:s=${targetW + bezel * 2}x${targetH + bezel * 2},format=gray,geq=lum='if(gt(hypot(X-(${radius}+0.5)\\,Y-(${radius}+0.5))\\,${radius})*lt(X\\,${radius})*lt(Y\\,${radius})+gt(hypot(X-(W-${radius}-0.5)\\,Y-(${radius}+0.5))\\,${radius})*gt(X\\,W-${radius})*lt(Y\\,${radius})+gt(hypot(X-(${radius}+0.5)\\,Y-(H-${radius}-0.5))\\,${radius})*lt(X\\,${radius})*gt(Y\\,H-${radius})+gt(hypot(X-(W-${radius}-0.5)\\,Y-(H-${radius}-0.5))\\,${radius})*gt(X\\,W-${radius})*gt(Y\\,H-${radius})\\,0\\,255)'[mask]`,
      `[padded]format=rgba[paddeda]`,
      `[paddeda][mask]alphamerge[phone]`,
      `[bg][phone]overlay=${padX - bezel}:${padY - bezel}`
    ].join(';'),
    '-frames:v', '1', framed
  ]);
  run('ffmpeg', ['-y', '-i', framed, '-frames:v', '1', '-q:v', '82', webp]);
  fs.copyFileSync(framed, path.join(ART, `promo-mode-${webpName}.png`));
  console.log('plate', webpName, fs.statSync(webp).size);
}

async function waitArt(page, min = 3) {
  await page.waitForFunction((need) => {
    return Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 40).length >= need;
  }, min, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function hideChrome(page) {
  await page.evaluate(() => {
    const o = document.getElementById('loadoutOverlay');
    if (o) o.classList.remove('visible');
    const ig = document.getElementById('installGuide');
    if (ig) ig.remove();
    document.querySelectorAll('.tc-root, .tutorial-coach, .coach-overlay, .tc-overlay')
      .forEach((el) => { el.style.pointerEvents = 'none'; el.style.opacity = '0'; });
  });
}

async function boardSnap(page) {
  return page.evaluate(() => {
    const gs = typeof gameState !== 'undefined' ? gameState : null;
    const player = gs ? gs.playerBoard.flat().filter(Boolean) : [];
    const enemy = gs ? gs.enemyBoard.flat().filter(Boolean) : [];
    const linked = document.querySelectorAll('.notch-dot.linked, .bc-notch.linked').length;
    const notches = document.querySelectorAll('.notch-dot, .bc-notch').length;
    return {
      phase: gs && gs.currentPhase,
      turn: gs && gs.turnNumber,
      active: gs && gs.activeSide,
      waiting: gs && gs.battleWaitingOn,
      pending: !!(gs && gs.pendingBattle),
      pendingName: gs && gs.pendingBattle && (gs.pendingBattle.name || gs.pendingBattle.cardName),
      queue: !!(window.SieglingsActionQueue && window.SieglingsActionQueue.isProcessing && window.SieglingsActionQueue.isProcessing()),
      player: player.map((c) => c.name),
      enemy: enemy.map((c) => c.name),
      linked,
      notches
    };
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

async function waitQueueIdle(page, maxMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const status = await page.evaluate(async () => {
      const q = window.SieglingsActionQueue;
      if (!q) return { busy: false };
      const busy = !!(q.isProcessing?.() || q.isPresentationBusy?.());
      if (!busy) return { busy: false };
      // Prefer the real idle promise over blind polling.
      if (typeof q.onIdle === 'function') {
        await Promise.race([
          q.onIdle(),
          new Promise((r) => setTimeout(r, 2000))
        ]);
      }
      return { busy: !!(q.isProcessing?.() || q.isPresentationBusy?.()) };
    });
    if (!status.busy) {
      await page.waitForTimeout(200);
      const again = await page.evaluate(() => !!(window.SieglingsActionQueue?.isProcessing?.() || window.SieglingsActionQueue?.isPresentationBusy?.()));
      if (!again) return true;
    }
    await page.waitForTimeout(200);
  }
  // Timed out — return false so callers can decide. Avoid clear() during battle.
  return false;
}

/** Place via api('place') directly — avoids selectedCard scope / deselect races. */
async function placeOne(page) {
  return page.evaluate(async () => {
    const before = gameState.playerBoard.flat().filter(Boolean).length;
    if (before >= 5) return { ok: false, reason: 'cap' };
    if (gameState.currentPhase !== 'SETUP' || gameState.activeSide !== 'PLAYER') {
      return { ok: false, reason: 'phase', phase: gameState.currentPhase, active: gameState.activeSide };
    }
    if (window.SieglingsActionQueue?.isProcessing?.()) {
      await Promise.race([
        window.SieglingsActionQueue.onIdle(),
        new Promise((r) => setTimeout(r, 3000))
      ]);
    }
    const hand = gameState.player.hand || [];
    const idxs = [];
    hand.forEach((c, i) => {
      if (c && c.type === 'SIEGLING' && !c.evolvesFromId) idxs.push(i);
    });
    // Evolutions only after we already have something on board
    if (before > 0) {
      hand.forEach((c, i) => {
        if (c && c.type === 'SIEGLING' && c.evolvesFromId && !idxs.includes(i)) idxs.push(i);
      });
    }
    for (const hi of idxs) {
      const card = hand[hi];
      let cells = [];
      if (typeof getLegalPlacementsForCard === 'function') {
        try { cells = getLegalPlacementsForCard(card) || []; } catch (e) { cells = []; }
      }
      if (!cells.length) cells = gameState.legalPlacements || [];
      // Prefer adjacency for notch links
      const scored = cells.slice().sort((a, b) => {
        const score = (rc) => {
          const rr = rc.row != null ? rc.row : rc[0];
          const cc = rc.col != null ? rc.col : rc[1];
          let s = 0;
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = rr + dr;
            const nc = cc + dc;
            if (nr >= 0 && nr < 3 && nc >= 0 && nc < 3 && gameState.playerBoard[nr][nc]) s += 2;
          }
          return -s;
        };
        return score(a) - score(b);
      });
      for (const cell of scored) {
        const r = cell.row != null ? cell.row : cell[0];
        const c = cell.col != null ? cell.col : cell[1];
        try {
          const data = await api('place', 'POST', { cardId: card.id, row: r, col: c, handIndex: hi });
          await new Promise((x) => setTimeout(x, 350));
          const after = (data && data.playerBoard)
            ? data.playerBoard.flat().filter(Boolean).length
            : gameState.playerBoard.flat().filter(Boolean).length;
          if (after > before) {
            return { ok: true, name: card.name, r, c, after, legal: scored.length };
          }
        } catch (e) { /* next cell */ }
      }
    }
    return {
      ok: false,
      reason: 'no-place',
      hand: hand.map((c) => c.type + ':' + c.name).slice(0, 8),
      legal: gameState.legalPlacements || []
    };
  });
}

async function drainBattle(page) {
  // Do NOT clear() the action queue during battle — wiping mid-playback can
  // leave pendingBattle set with battleWaitingOn=null, after which /battle
  // no-ops forever. Wait for idle, then advance / pass.
  for (let i = 0; i < 40; i++) {
    const st = await boardSnap(page);
    if (st.phase !== 'BATTLE') return st;
    await page.evaluate(async () => {
      const q = window.SieglingsActionQueue;
      if (q?.isProcessing?.()) {
        await Promise.race([
          q.onIdle(),
          new Promise((r) => setTimeout(r, 2500))
        ]);
      }
      try {
        // pendingBattle can be set while battleWaitingOn is still null after
        // playback; always resolve it with an action/pass before /battle.
        if (gameState.pendingBattle) {
          const abs = gameState.pendingBattle.abilities || [];
          const hit = abs.find((a) => a.canAfford !== false && /damage|deal|strike|burst|blast|flame|ember|shot/i.test((a.name || '') + (a.description || '')))
            || abs.find((a) => a.canAfford !== false)
            || null;
          if (hit) await submitBattleAction(hit.index, -1, -1);
          else await submitBattleAction(-1, -1, -1);
        } else if (!q?.isProcessing?.()) {
          await api('battle');
        }
      } catch (e) { /* keep draining */ }
    });
    await page.waitForTimeout(280);
  }
  return boardSnap(page);
}

async function playUntilFull(page) {
  let midTaken = false;
  let boardPlateTaken = false;
  let bestScore = -1;
  for (let turn = 0; turn < 14; turn++) {
    await hideChrome(page);
    await waitQueueIdle(page, 12000);
    let st = await boardSnap(page);
    console.log('turn', turn, st.phase, 'P', st.player.length, st.player.join(','), 'E', st.enemy.length, st.enemy.join(','), 'linked', st.linked, 'wait', st.waiting, 'pending', st.pending);

    // Keep the fullest both-sides board as the clash hero (not the endgame wipe).
    const score = st.player.length * 3 + st.enemy.length * 3 + st.linked;
    if (st.player.length >= 2 && st.enemy.length >= 2 && score > bestScore) {
      bestScore = score;
      const peak = path.join(TMP, `arena-peak-${turn}.png`);
      await page.screenshot({ path: peak, type: 'png' });
      toPhonePlate(peak, 'battle-clash');
      toPhonePlate(peak, 'battle-standby');
      console.log('  peak board saved', st.player.length, 'v', st.enemy.length, 'linked', st.linked);
    }

    if (st.phase === 'BATTLE') {
      if (!midTaken && st.player.length + st.enemy.length >= 3) {
        await waitQueueIdle(page, 5000);
        await page.evaluate(async () => {
          try {
            if (gameState.pendingBattle) {
              const abs = gameState.pendingBattle.abilities || [];
              const hit = abs.find((a) => a.canAfford !== false) || null;
              if (hit) await submitBattleAction(hit.index, -1, -1);
              else await submitBattleAction(-1, -1, -1);
            } else if (!window.SieglingsActionQueue?.isProcessing?.()) {
              await api('battle');
            }
          } catch (e) {}
        });
        await page.waitForTimeout(700);
        const atk = path.join(TMP, 'arena-attack-live.png');
        await page.screenshot({ path: atk, type: 'png' });
        toPhonePlate(atk, 'battle-attack');
        midTaken = true;
      }
      const drained = await drainBattle(page);
      console.log('  drained', drained.phase, 'T' + drained.turn, 'P', drained.player.length, 'E', drained.enemy.length);
      st = drained;
    }

    if (st.phase === 'DRAW') {
      await waitQueueIdle(page, 8000);
      await page.evaluate(async () => { try { await playerDraw(); } catch (e) {} });
      await page.waitForTimeout(500);
      await waitQueueIdle(page, 8000);
      st = await boardSnap(page);
    }

    if (st.phase === 'SETUP' && st.active === 'PLAYER') {
      await waitQueueIdle(page, 8000);
      const placed = await placeOne(page);
      console.log('  place', placed);
      await page.waitForTimeout(400);
      await waitQueueIdle(page, 8000);
      st = await boardSnap(page);
      if (st.player.length >= 2 && !boardPlateTaken) {
        const mid = path.join(TMP, `arena-mid-${turn}.png`);
        await page.screenshot({ path: mid, type: 'png' });
        toPhonePlate(mid, 'battle-board');
        boardPlateTaken = true;
      }
      try {
        await page.evaluate(async () => { await endTurn(); });
      } catch (e) { /* ignore */ }
      await page.waitForTimeout(600);
      // Let solo AI end-turn playback finish — never clear() here.
      await waitQueueIdle(page, 20000);
    }

    st = await boardSnap(page);
    if (st.player.length >= 5 && st.enemy.length >= 4) {
      console.log('board full enough', st);
      const peak = path.join(TMP, 'arena-full-enough.png');
      await page.screenshot({ path: peak, type: 'png' });
      toPhonePlate(peak, 'battle-clash');
      toPhonePlate(peak, 'battle-standby');
      break;
    }
  }
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

  // ── Arena ───────────────────────────────────────────────────────────────
  console.log('arena start');
  await page.goto(`${LIVE}/play`, { waitUntil: 'domcontentloaded' });
  await page.locator('#btnStartLoadout').waitFor({ state: 'visible' });
  for (const step of ['setup', 'deck', 'knight', 'review']) {
    const chip = page.locator(`#loadoutStepChip-${step}`);
    if (await chip.count()) await chip.click().catch(() => {});
  }
  await page.locator('#btnStartLoadout').click();
  await page.waitForSelector('button:has-text("Keep hand"), #mulliganOverlay.visible', { timeout: 180000 });
  await page.waitForTimeout(1500);
  await waitArt(page, 3);
  await hideChrome(page);
  await page.evaluate(async () => { if (typeof submitMulliganKeep === 'function') await submitMulliganKeep(); });
  await page.waitForTimeout(1500);
  await prepPlayback(page);
  await waitQueueIdle(page, 60000);

  await playUntilFull(page);

  await waitArt(page, 4);
  let st = await boardSnap(page);
  console.log('final board', st);

  const fullPng = path.join(TMP, 'arena-full.png');
  await page.screenshot({ path: fullPng, type: 'png' });
  toPhonePlate(fullPng, 'battle-clash');

  // Second angle: nudge battle dock / board
  await page.evaluate(() => {
    const board = document.querySelector('.arena-board, .board-area, #boardArea, .play-board, .play-main');
    if (board) board.scrollTop = 36;
  });
  await page.waitForTimeout(400);
  const anglePng = path.join(TMP, 'arena-angle.png');
  await page.screenshot({ path: anglePng, type: 'png' });
  toPhonePlate(anglePng, 'battle-board-angle');
  // Keep standby as another filled board view
  toPhonePlate(fullPng, 'battle-standby');

  // Ensure we have an attack plate — force into a battle action if needed
  for (let i = 0; i < 6; i++) {
    st = await boardSnap(page);
    if (st.phase === 'DRAW') {
      await page.evaluate(async () => { try { await playerDraw(); } catch (e) {} });
      await page.waitForTimeout(500);
      await page.evaluate(async () => { try { await endTurn(); } catch (e) {} });
      await waitQueueIdle(page, 15000);
    }
    st = await boardSnap(page);
    if (st.phase === 'BATTLE') {
      await page.evaluate(async () => {
        try {
          if (!gameState.pendingBattle) await api('battle');
          if (gameState.pendingBattle && gameState.battleWaitingOn === 'PLAYER') {
            const abs = gameState.pendingBattle.abilities || [];
            const hit = abs.find((a) => a.canAfford !== false) || null;
            if (hit) await submitBattleAction(hit.index, -1, -1);
          }
        } catch (e) {}
      });
      await page.waitForTimeout(800);
      const atk = path.join(TMP, 'arena-attack-2.png');
      await page.screenshot({ path: atk, type: 'png' });
      toPhonePlate(atk, 'battle-ability');
      // also refresh attack plate
      toPhonePlate(atk, 'battle-attack');
      break;
    }
  }

  // ── Siege tutorial: map + battle ────────────────────────────────────────
  console.log('siege tutorial');
  await page.goto(`${LIVE}/siege`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await waitArt(page, 2);
  await page.locator('#chooseTutorialMode').click();
  await page.waitForTimeout(2200);
  await hideChrome(page);

  // Dismiss tutorial coach overlays so the map/battle are visible in plates.
  for (let i = 0; i < 6; i++) {
    const gotIt = page.getByRole('button', { name: /Got it|Continue|Next|OK/i }).first();
    if (await gotIt.count() && await gotIt.isVisible().catch(() => false)) {
      await gotIt.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    } else break;
  }
  await page.evaluate(() => {
    document.querySelectorAll('.tc-root, .tutorial-coach, .coach-overlay, .tc-overlay, .tc-panel, [class*="tutorial-modal"]')
      .forEach((el) => { el.style.display = 'none'; el.style.pointerEvents = 'none'; });
  });

  // Map plate
  await page.waitForFunction(() => document.body.dataset.screen === 'mapScreen', { timeout: 30000 }).catch(() => {});
  const mapPng = path.join(TMP, 'siege-map.png');
  await page.screenshot({ path: mapPng, type: 'png' });
  toPhonePlate(mapPng, 'siege-map');

  // Navigate: click reachable node (may enter battle)
  const reachable = page.locator('.map-node-g.reachable').first();
  if (await reachable.count()) {
    await reachable.click({ force: true });
    await page.waitForTimeout(1800);
  }
  // Dismiss any post-travel coach beat
  for (const name of [/Got it/i, /Continue/i, /Next/i, /Fight/i, /Begin/i]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) {
      await b.click({ force: true }).catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  await page.evaluate(() => {
    document.querySelectorAll('.tc-root, .tutorial-coach, .coach-overlay, .tc-overlay, .tc-panel')
      .forEach((el) => { el.style.display = 'none'; el.style.pointerEvents = 'none'; });
  });
  // Nav mid-frame (map with selection / travel) — if still on map, reshoot; else use map again as hand plate
  let screen = await page.evaluate(() => document.body.dataset.screen);
  console.log('siege after nav', screen);
  if (screen === 'mapScreen') {
    const navPng = path.join(TMP, 'siege-map-nav.png');
    await page.screenshot({ path: navPng, type: 'png' });
    toPhonePlate(navPng, 'siege-hand');
    // Try again
    if (await page.locator('.map-node-g.reachable').count()) {
      await page.locator('.map-node-g.reachable').first().click({ force: true });
      await page.waitForTimeout(2000);
    }
  } else {
    // Use the pre-nav map as the "navigating" plate too if we jumped straight to battle
    toPhonePlate(mapPng, 'siege-hand');
  }

  screen = await page.evaluate(() => document.body.dataset.screen);
  console.log('siege screen', screen);
  if (screen === 'battleScreen') {
    await waitArt(page, 2);
    await page.waitForTimeout(800);
    // Play a card if possible for a livelier battle frame
    await page.evaluate(() => {
      const card = document.querySelector('.hand-card, .card-fan .card, .battle-hand .card');
      if (card) card.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const foe = document.querySelector('.foe-unit, .enemy-unit, .battle-unit, [data-side="enemy"]');
      if (foe) foe.click();
    });
    await page.waitForTimeout(900);
    const battlePng = path.join(TMP, 'siege-battle.png');
    await page.screenshot({ path: battlePng, type: 'png' });
    toPhonePlate(battlePng, 'siege-strike');
  } else {
    const battlePng = path.join(TMP, 'siege-fallback.png');
    await page.screenshot({ path: battlePng, type: 'png' });
    toPhonePlate(battlePng, 'siege-strike');
  }

  // ── Dominion ────────────────────────────────────────────────────────────
  console.log('dominion');
  await page.goto(`${LIVE}/dominion`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await waitArt(page, 1);
  for (const name of [/Got it/i, /Continue/i, /Close/i]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) {
      await b.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }

  // If still in the founder wizard, push through name → Next steps into the keep.
  const nameInput = page.locator('input[placeholder*="name" i], input[type="text"]').first();
  if (await nameInput.count() && await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('Roc').catch(() => {});
    await page.waitForTimeout(200);
    for (let step = 0; step < 8; step++) {
      const next = page.getByRole('button', { name: /Next|Confirm|Found|Begin|Enter Keep|Finish/i }).first();
      if (!(await next.count()) || !(await next.isVisible().catch(() => false))) break;
      // Pick first calling/land/starter tile if the wizard needs a selection
      const choice = page.locator('.dm-cc-sheet button.is-selected, .dm-cc-sheet button, [data-calling], .ck-choice').first();
      if (await choice.count() && await choice.isVisible().catch(() => false)) {
        await choice.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
      const enabled = await next.isEnabled().catch(() => false);
      if (!enabled) {
        // Click a visible option card then retry
        const opt = page.locator('.dm-cc-sheet button, .ck-choice, [role="button"]').nth(1);
        if (await opt.count()) await opt.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
      await next.click({ force: true }).catch(() => {});
      await page.waitForTimeout(700);
    }
  }

  const dom1 = path.join(TMP, 'dominion-1.png');
  await page.screenshot({ path: dom1, type: 'png' });
  toPhonePlate(dom1, 'dominion-keep');

  // Prefer text match that includes emoji labels in the Dominion dock.
  for (const label of ['Expedition', 'Company', 'Base', 'Work', 'Wilds']) {
    const t = page.locator(`button:has-text("${label}")`).first();
    if (await t.count() && await t.isVisible().catch(() => false)) {
      await t.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(1200);
      break;
    }
  }
  const dom2 = path.join(TMP, 'dominion-2.png');
  await page.screenshot({ path: dom2, type: 'png' });
  toPhonePlate(dom2, 'dominion-expedition');

  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
