import fs from "node:fs";
import path from "node:path";
import { chromium } from "file:///C:/Users/AlexTillman/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const outDir = path.resolve("output/web-game/menu-info-five-card-verify");
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { label: "desktop-1920x963", width: 1920, height: 963 },
  { label: "desktop-3840x1920", width: 3840, height: 1920 },
  { label: "desktop-3840x2160", width: 3840, height: 2160 },
];

const consoleMessages = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });

function seededStateScript() {
  const emptyBoard = () => [[null, null, null], [null, null, null], [null, null, null]];
  const normalizeNotches = (card) => {
    if (!card || !Array.isArray(card.notches)) return;
    card.notches = card.notches.map((notch) => ({ ...notch, element: notch.element || card.element || "FIRE" }));
  };
  const hand = [
    { id: "h1", name: "Pylme", element: "EARTH", type: "SIEGLING", rarity: "COMMON", health: 12, speed: 4, preferredRow: "BACK", notches: [{ direction: "LEFT", element: "EARTH" }, { direction: "RIGHT", element: "EARTH" }], ability: { description: "Root and grow." } },
    { id: "h2", name: "Magma Breach", element: "FIRE", type: "TRAP", rarity: "RARE", trapBucketElement: "FIRE", trapBucketAmount: 2, ability: { description: "Trigger when the opponent builds Fire." } },
    { id: "h3", name: "Cinder Surge", element: "FIRE", type: "SPELL", rarity: "COMMON", costElement: "FIRE", costAmount: 1, ability: { description: "Deal 1 damage." } },
    { id: "h4", name: "Ember Bolt", element: "FIRE", type: "SPELL", rarity: "COMMON", costElement: "FIRE", costAmount: 1, ability: { description: "Deal 1 damage." } },
    { id: "h5", name: "Guerilla", element: "EARTH", type: "SIEGLING", rarity: "RARE", health: 14, speed: 6, preferredRow: "MIDDLE", notches: [{ direction: "TOP", element: "EARTH" }, { direction: "BOTTOM", element: "EARTH" }], ability: { description: "Hold the line." } },
    { id: "h6", name: "Root Snare", element: "EARTH", type: "SPELL", rarity: "COMMON", costElement: "EARTH", costAmount: 1, ability: { description: "Slow an enemy." } },
    { id: "h7", name: "Kindle Guard", element: "FIRE", type: "SIEGLING", rarity: "UNCOMMON", health: 13, speed: 5, preferredRow: "FRONT", notches: [{ direction: "TOP", element: "FIRE" }], ability: { description: "Protect an ally." } },
    { id: "h8", name: "Ash Step", element: "FIRE", type: "SPELL", rarity: "COMMON", costElement: "FIRE", costAmount: 1, ability: { description: "Move a Siegling." } },
  ];
  hand.forEach(normalizeNotches);

  gameState = {
    currentPhase: "SETUP",
    gameOver: false,
    activeSide: "PLAYER",
    activeSideLabel: "You",
    firstPlayer: "PLAYER",
    firstPlayerLabel: "You",
    playerName: "PLAYER",
    enemyName: "AI Opponent",
    turnNumber: 1,
    multiplayer: false,
    roomId: null,
    battleWaitingOn: null,
    pendingBattle: null,
    playerPlacementUsed: false,
    legalPlacements: [],
    gameLog: ["Setup phase."],
    player: {
      health: 50,
      deckSize: 35,
      handSize: hand.length,
      hand,
      remainingDeck: hand,
      trainer: { name: "Knight", tier: "SiegeKnight", element: "FIRE", used: false, active: { name: "Kindle Shot", description: "Deal 2 damage.", requiredEnergy: 1, requiredElement: "FIRE", targetType: "SINGLE_ENEMY" } },
    },
    enemy: {
      health: 50,
      deckSize: 40,
      handSize: 5,
      trainer: { name: "Enemy Knight", tier: "SiegeKnight", element: "WATER", used: false, active: { name: "Ice Spear", description: "Deal 2 damage.", requiredEnergy: 1, requiredElement: "WATER", targetType: "SINGLE_ENEMY" } },
    },
    playerBoard: emptyBoard(),
    enemyBoard: emptyBoard(),
    mulligan: { active: false, youPending: false, opponentPending: false },
  };

  if (typeof updateResponsiveLayoutVars === "function") updateResponsiveLayoutVars(true);
  if (typeof render === "function") render();
  window.dispatchEvent(new Event("resize"));
}

function rectFor(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    left: Math.round(r.left * 100) / 100,
    top: Math.round(r.top * 100) / 100,
    width: Math.round(r.width * 100) / 100,
    height: Math.round(r.height * 100) / 100,
    right: Math.round(r.right * 100) / 100,
    bottom: Math.round(r.bottom * 100) / 100,
  };
}

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  page.on("console", (msg) => { if (msg.type() === "error") consoleMessages.push(`${viewport.label}: ${msg.text()}`); });
  page.on("pageerror", (err) => pageErrors.push(`${viewport.label}: ${String(err)}`));
  await page.addInitScript(() => {
    localStorage.setItem("sieglingsRendererMode", "dom");
  });
  await page.goto(`http://127.0.0.1:8080/?verify=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof render === "function" && typeof updateResponsiveLayoutVars === "function", null, { timeout: 10000 });
  await page.evaluate(seededStateScript);
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    if (typeof scheduleDesktopHandSelectorCardScale === "function") scheduleDesktopHandSelectorCardScale();
  });
  await page.waitForTimeout(350);

  const metrics = await page.evaluate(({ width, height }) => {
    const rectFor = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left * 100) / 100,
        top: Math.round(r.top * 100) / 100,
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        bottom: Math.round(r.bottom * 100) / 100,
      };
    };
    const rail = document.getElementById("playerHand");
    const cards = Array.from(document.querySelectorAll("#playerHand .hand-card"));
    const railRect = rail?.getBoundingClientRect();
    const cardRects = cards.map((card) => {
      const r = card.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    });
    const fullyVisible = railRect
      ? cardRects.filter((r) => r.left >= railRect.left - 0.5 && r.right <= railRect.right + 0.5).length
      : 0;
    const firstFiveFit = railRect && cardRects.length >= 5
      ? cardRects.slice(0, 5).every((r) => r.left >= railRect.left - 0.5 && r.right <= railRect.right + 0.5)
      : false;
    const styles = getComputedStyle(document.documentElement);
    return {
      viewport: { width, height },
      menu: rectFor(document.querySelector(".desktop-menu")),
      handSection: rectFor(document.getElementById("desktopHandSection")),
      rail: rectFor(rail),
      firstCard: rectFor(cards[0]),
      fifthCard: rectFor(cards[4]),
      visibleFullCardsAtStart: fullyVisible,
      firstFiveFit,
      handCardCount: cards.length,
      cssSidebarWidth: styles.getPropertyValue("--desktop-sidebar-width").trim(),
      cssHandWidth: styles.getPropertyValue("--hand-card-width").trim(),
      cssHandGap: styles.getPropertyValue("--hand-card-gap").trim(),
      cssHandSectionHeight: styles.getPropertyValue("--desktop-hand-section-height").trim(),
      styleHref: document.querySelector('link[href*="style.css"]')?.href,
      gameSrc: document.querySelector('script[src*="game.js"]')?.src,
    };
  }, viewport);

  await page.screenshot({ path: path.join(outDir, `${viewport.label}.png`), fullPage: false });
  fs.writeFileSync(path.join(outDir, `${viewport.label}.json`), JSON.stringify(metrics, null, 2));
  await page.close();
}

fs.writeFileSync(path.join(outDir, "console-errors.json"), JSON.stringify({ consoleMessages, pageErrors }, null, 2));
await browser.close();
