const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = __dirname;
const BASE_URL = 'http://127.0.0.1:8080';

async function waitForVisible(page, selector, timeout = 60000) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && rect.width > 0
      && rect.height > 0;
  }, selector, { timeout });
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1
    });

    const consoleMessages = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleMessages.push(`${msg.type()}: ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      consoleMessages.push(`pageerror: ${err.message}`);
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      if (typeof playAsGuest === 'function') {
        playAsGuest();
      }
    });
    await page.waitForFunction(() => document.getElementById('btnStartLoadout') && !document.getElementById('btnStartLoadout').disabled, { timeout: 120000 });
    await page.evaluate(async () => {
      const body = getSelectedLoadoutBody();
      await api('new', 'POST', body, 120000);
    });

    await page.waitForFunction(() => document.getElementById('mulliganOverlay')?.classList.contains('visible'), { timeout: 30000 });
    await page.evaluate(async () => {
      await api('mulligan', 'POST', { mulliganIndices: [] }, 120000);
    });
    await page.waitForFunction(() => !document.getElementById('mulliganOverlay')?.classList.contains('visible'), { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('#playerHand .hand-card').length > 0, { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('phaseTransitionBanner')?.classList.contains('visible') !== true, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3200);

    await waitForVisible(page, '#desktopMenu', 20000);
    await waitForVisible(page, '#playerHand .hand-card', 20000);

    const firstHandCard = page.locator('#playerHand .hand-card').first();
    await firstHandCard.hover();
    await page.waitForTimeout(700);

    const screenshotPath = path.join(OUTPUT_DIR, 'desktop-menu-refine.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const state = await page.evaluate((messages) => {
      const shell = document.querySelector('.app-shell');
      const battlefield = document.getElementById('boardArea');
      const desktopMenu = document.getElementById('desktopMenu');
      const deckSection = document.getElementById('desktopDeckSection');
      const previewSection = document.getElementById('desktopPreviewSection');
      const handSection = document.getElementById('desktopHandSection');
      const actionBar = document.getElementById('actionBar');
      const previewPanel = document.getElementById('desktopCardPreviewPanel');
      const previewCard = previewPanel?.querySelector('.desktop-preview-card');
      const deckPreview = document.getElementById('desktopDeckPreview');
      const playerGrid = document.getElementById('playerGrid');
      const playerPoints = document.querySelectorAll('.bf-player .external-energy-point');
      const firstHandCard = document.querySelector('#playerHand .hand-card');
      const phaseBadge = document.getElementById('phaseBadge');

      const shellRect = shell?.getBoundingClientRect();
      const battlefieldRect = battlefield?.getBoundingClientRect();
      const desktopMenuRect = desktopMenu?.getBoundingClientRect();
      const deckRect = deckSection?.getBoundingClientRect();
      const previewRect = previewSection?.getBoundingClientRect();
      const handRect = handSection?.getBoundingClientRect();
      const actionRect = actionBar?.getBoundingClientRect();
      const previewPanelRect = previewPanel?.getBoundingClientRect();
      const previewCardRect = previewCard?.getBoundingClientRect();
      const firstHandCardRect = firstHandCard?.getBoundingClientRect();
      const playerGridRect = playerGrid?.getBoundingClientRect();

      const beforeStyle = battlefield ? window.getComputedStyle(battlefield, '::before') : null;
      const afterStyle = battlefield ? window.getComputedStyle(battlefield, '::after') : null;

      return {
        phaseBadge: phaseBadge?.textContent?.trim() || null,
        appShellColumns: shell ? window.getComputedStyle(shell).gridTemplateColumns : null,
        battlefieldWidth: battlefieldRect ? Math.round(battlefieldRect.width) : null,
        menuWidth: desktopMenuRect ? Math.round(desktopMenuRect.width) : null,
        deckHeight: deckRect ? Math.round(deckRect.height) : null,
        deckTop: deckRect ? Math.round(deckRect.top) : null,
        previewTop: previewRect ? Math.round(previewRect.top) : null,
        handTop: handRect ? Math.round(handRect.top) : null,
        handHeight: handRect ? Math.round(handRect.height) : null,
        actionTop: actionRect ? Math.round(actionRect.top) : null,
        previewCardWidth: previewCardRect ? Math.round(previewCardRect.width) : null,
        previewCardHeight: previewCardRect ? Math.round(previewCardRect.height) : null,
        firstHandCardWidth: firstHandCardRect ? Math.round(firstHandCardRect.width) : null,
        firstHandCardHeight: firstHandCardRect ? Math.round(firstHandCardRect.height) : null,
        previewWithinBounds: Boolean(previewPanelRect && previewCardRect
          && previewCardRect.right <= previewPanelRect.right + 1
          && previewCardRect.bottom <= previewPanelRect.bottom + 1),
        deckTierCount: deckPreview?.querySelectorAll('.desktop-deck-tier').length || 0,
        deckIconCount: deckPreview?.querySelectorAll('.desktop-deck-icon').length || 0,
        handCardCount: document.querySelectorAll('#playerHand .hand-card').length,
        playerGridFullyVisible: Boolean(playerGridRect && battlefieldRect
          && playerGridRect.top >= battlefieldRect.top
          && playerGridRect.bottom <= battlefieldRect.bottom),
        playerGridBottomGap: playerGridRect && battlefieldRect
          ? Math.round(battlefieldRect.bottom - playerGridRect.bottom)
          : null,
        playerPointCount: playerPoints.length,
        leftGap: shellRect ? Math.round(shellRect.left) : null,
        rightGap: shellRect ? Math.round(window.innerWidth - shellRect.right) : null,
        battlefieldBeforeOpacity: beforeStyle?.opacity || null,
        battlefieldAfterInset: afterStyle?.inset || null,
        battlefieldAfterOpacity: afterStyle?.opacity || null,
        beforeBackgroundSample: beforeStyle?.backgroundImage?.slice(0, 220) || null,
        afterTransform: afterStyle?.transform || null,
        consoleMessages: messages
      };
    }, consoleMessages);

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'state.json'),
      JSON.stringify(state, null, 2),
      'utf8'
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
