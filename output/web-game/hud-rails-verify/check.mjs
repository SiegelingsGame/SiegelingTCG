import fs from "node:fs";
import path from "node:path";
import { chromium } from "file:///C:/Users/AlexTillman/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const outDir = path.resolve("output/web-game/hud-rails-verify");
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { label: "desktop-wide-1920x963", width: 1920, height: 963 },
  { label: "desktop-narrow-1100x820", width: 1100, height: 820 },
  { label: "mobile-900x760", width: 900, height: 760 },
];

const consoleMessages = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });

function emptyBoard() {
  return [[null, null, null], [null, null, null], [null, null, null]];
}

function buildState(phase = "DRAW") {
  const playerActive = true;
  return {
    currentPhase: phase,
    gameOver: false,
    activeSide: playerActive ? "PLAYER" : "ENEMY",
    activeSideLabel: playerActive ? "You" : "Opponent",
    firstPlayer: "PLAYER",
    firstPlayerLabel: "You",
    playerName: "PLAYER",
    enemyName: "AI OPPONENT",
    turnNumber: 3,
    multiplayer: false,
    roomId: null,
    battleWaitingOn: null,
    pendingBattle: null,
    playerPlacementUsed: false,
    legalPlacements: [],
    gameLog: ["Setup phase."],
    player: {
      health: 42,
      deckSize: 35,
      handSize: 5,
      fireEnergy: 3,
      earthEnergy: 1,
      waterEnergy: 2,
      hand: [
        { id: "h1", name: "Pylme", element: "EARTH", type: "SIEGLING", rarity: "COMMON", health: 12, speed: 4, preferredRow: "BACK", notches: [{ direction: "LEFT", element: "EARTH" }], ability: { description: "Root and grow." } },
        { id: "h2", name: "Magma Breach", element: "FIRE", type: "TRAP", rarity: "RARE", trapBucketElement: "FIRE", trapBucketAmount: 2, ability: { description: "Trigger when the opponent builds Fire." } },
        { id: "h3", name: "Cinder Surge", element: "FIRE", type: "SPELL", rarity: "COMMON", costElement: "FIRE", costAmount: 1, ability: { description: "Deal 1 damage." } },
        { id: "h4", name: "Ember Bolt", element: "FIRE", type: "SPELL", rarity: "COMMON", costElement: "FIRE", costAmount: 1, ability: { description: "Deal 1 damage." } },
        { id: "h5", name: "Guerilla", element: "EARTH", type: "SIEGLING", rarity: "RARE", health: 14, speed: 6, preferredRow: "MIDDLE", notches: [{ direction: "TOP", element: "EARTH" }], ability: { description: "Hold the line." } },
      ],
      remainingDeck: [],
      trainer: {
        name: "Iron Vow",
        tier: "SiegeKnight",
        element: "FIRE",
        passiveDescription: "First attack each battle gets +1 damage.",
        active: { name: "Kindle Shot", description: "Deal 2 damage.", requiredEnergy: 1, requiredElement: "FIRE", targetType: "SINGLE_ENEMY" },
      },
    },
    enemy: {
      health: 31,
      deckSize: 40,
      handSize: 4,
      shadowEnergy: 2,
      electricEnergy: 1,
      trainer: {
        name: "Night Regent",
        tier: "SiegeKnight",
        element: "SHADOW",
        passiveDescription: "The first enemy claim each battle costs more.",
        active: { name: "Night Lash", description: "Deal 2 damage.", requiredEnergy: 1, requiredElement: "SHADOW", targetType: "SINGLE_ENEMY" },
      },
    },
    playerBoard: emptyBoard(),
    enemyBoard: emptyBoard(),
    mulligan: { active: false, youPending: false, opponentPending: false },
  };
}

function seedScript(state) {
  gameState = state;
  if (typeof updateResponsiveLayoutVars === "function") updateResponsiveLayoutVars(true);
  if (typeof render === "function") render();
  window.dispatchEvent(new Event("resize"));
}

function rect(el) {
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
  await page.addInitScript(() => localStorage.setItem("sieglingsRendererMode", "dom"));
  await page.goto(`http://127.0.0.1:8080/?hudRailsVerify=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof render === "function" && typeof updateResponsiveLayoutVars === "function", null, { timeout: 10000 });
  await page.evaluate(seedScript, buildState("DRAW"));
  await page.waitForTimeout(300);

  const drawMetrics = await page.evaluate(({ width, height }) => {
    const css = getComputedStyle(document.documentElement);
    const enemyRail = document.getElementById("hudRailEnemy");
    const playerRail = document.getElementById("hudRailPlayer");
    const menu = document.getElementById("desktopMenu");
    const topEnemy = document.querySelector(".top-bar-enemy");
    const topPlayer = document.querySelector(".top-bar-player");
    const energyDetails = document.getElementById("energyDetailDetails");
    const btnDraw = document.getElementById("btnDraw");
    const rectFor = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      viewport: { width, height },
      cssSidebarWidth: css.getPropertyValue("--desktop-sidebar-width").trim(),
      cssHudRailWidth: css.getPropertyValue("--hud-rail-width").trim(),
      enemyRailDisplay: getComputedStyle(enemyRail).display,
      playerRailDisplay: getComputedStyle(playerRail).display,
      topEnemyDisplay: getComputedStyle(topEnemy).display,
      topPlayerDisplay: getComputedStyle(topPlayer).display,
      energyDetailsDisplay: getComputedStyle(energyDetails).display,
      menuWidth: Math.round(rectFor(menu)?.width || 0),
      enemyRailWidth: Math.round(rectFor(enemyRail)?.width || 0),
      playerRailWidth: Math.round(rectFor(playerRail)?.width || 0),
      battlefield: rectFor(document.getElementById("boardArea")),
      railPlayerHealth: document.getElementById("railPlayerHealth")?.textContent,
      railEnemyHealth: document.getElementById("railEnemyHealth")?.textContent,
      railPlayerElementsText: document.getElementById("railPlayerElements")?.textContent.replace(/\s+/g, " ").trim(),
      railEnemyElementsText: document.getElementById("railEnemyElements")?.textContent.replace(/\s+/g, " ").trim(),
      drawButtonText: btnDraw?.textContent.replace(/\s+/g, " ").trim(),
      drawButtonDrawn: btnDraw?.classList.contains("ab-drawn"),
      styleHref: document.querySelector('link[href*="style.css"]')?.href,
      gameSrc: document.querySelector('script[src*="game.js"]')?.src,
    };
  }, viewport);

  await page.evaluate(seedScript, buildState("SETUP"));
  await page.waitForTimeout(1300);
  const setupMetrics = await page.evaluate(() => {
    const btnDraw = document.getElementById("btnDraw");
    return {
      drawButtonText: btnDraw?.textContent.replace(/\s+/g, " ").trim(),
      drawButtonDrawn: btnDraw?.classList.contains("ab-drawn"),
      drawButtonDisabled: btnDraw?.disabled,
    };
  });

  await page.screenshot({ path: path.join(outDir, `${viewport.label}.png`), fullPage: false });
  fs.writeFileSync(path.join(outDir, `${viewport.label}.json`), JSON.stringify({ drawMetrics, setupMetrics }, null, 2));
  await page.close();
}

fs.writeFileSync(path.join(outDir, "console-errors.json"), JSON.stringify({ consoleMessages, pageErrors }, null, 2));
await browser.close();
