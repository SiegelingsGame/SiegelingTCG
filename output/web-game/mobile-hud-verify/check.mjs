import fs from "node:fs";
import path from "node:path";
import { chromium } from "file:///C:/Users/AlexTillman/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const outDir = path.resolve("output/web-game/mobile-hud-verify");
fs.mkdirSync(outDir, { recursive: true });

const consoleMessages = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });

function emptyBoard() {
  return [[null, null, null], [null, null, null], [null, null, null]];
}

function buildState() {
  return {
    currentPhase: "DRAW",
    gameOver: false,
    activeSide: "PLAYER",
    activeSideLabel: "You",
    firstPlayer: "PLAYER",
    firstPlayerLabel: "You",
    playerName: "Siegler_99",
    enemyName: "AI Opponent",
    turnNumber: 3,
    multiplayer: false,
    roomId: null,
    battleWaitingOn: null,
    pendingBattle: null,
    playerPlacementUsed: false,
    legalPlacements: [],
    gameLog: ["Draw phase."],
    player: {
      health: 50,
      deckSize: 22,
      handSize: 6,
      fireEnergy: 5,
      earthEnergy: 2,
      windEnergy: 1,
      waterEnergy: 1,
      hand: [
        { id: "h1", name: "Cinder Surge", element: "FIRE", type: "SPELL", rarity: "COMMON", costElement: "FIRE", costAmount: 1, ability: { description: "Deal 1 damage." } },
        { id: "h2", name: "Root Cub", element: "EARTH", type: "SIEGLING", rarity: "COMMON", health: 12, speed: 4, preferredRow: "BACK", notches: [{ direction: "LEFT", element: "EARTH" }], ability: { description: "Hold the back row." } },
        { id: "h3", name: "Breeze Kit", element: "WIND", type: "SIEGLING", rarity: "RARE", health: 14, speed: 8, preferredRow: "MIDDLE", notches: [{ direction: "TOP", element: "WIND" }], ability: { description: "Strike quickly." } },
      ],
      remainingDeck: [],
      trainer: {
        name: "Thornguard Rex",
        tier: "SiegeKnight",
        element: "WIND",
        passiveDescription: "Shield Wall passive",
        active: { name: "Verdant Guard", description: "Give an ally shield.", requiredEnergy: 1, requiredElement: "WIND", targetType: "SINGLE_ALLY" },
      },
    },
    enemy: {
      health: 38,
      deckSize: 28,
      handSize: 4,
      fireEnergy: 3,
      waterEnergy: 2,
      shadowEnergy: 1,
      electricEnergy: 1,
      trainer: {
        name: "Pyro Warlord",
        tier: "SiegeKnight",
        element: "FIRE",
        passiveDescription: "Blaze Aura +2 dmg",
        active: { name: "Blaze Call", description: "Boost an attacker.", requiredEnergy: 1, requiredElement: "FIRE", targetType: "SINGLE_ALLY" },
      },
    },
    playerBoard: emptyBoard(),
    enemyBoard: emptyBoard(),
    mulligan: { active: false, youPending: false, opponentPending: false },
  };
}

function seed(state) {
  window.gameState = state;
  gameState = state;
  if (typeof updateResponsiveLayoutVars === "function") updateResponsiveLayoutVars(true);
  if (typeof render === "function") render();
  window.dispatchEvent(new Event("resize"));
}

async function capture(label, width, height, extra = null) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on("console", (msg) => { if (msg.type() === "error") consoleMessages.push(`${label}: ${msg.text()}`); });
  page.on("pageerror", (err) => pageErrors.push(`${label}: ${String(err)}`));
  await page.addInitScript(() => localStorage.setItem("sieglingsRendererMode", "dom"));
  await page.goto(`http://127.0.0.1:8080/?mobileHudVerify=${Date.now()}-${label}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof render === "function" && typeof updateResponsiveLayoutVars === "function", null, { timeout: 10000 });
  await page.evaluate(seed, buildState());
  await page.waitForTimeout(350);
  if (extra) await extra(page);

  const metrics = await page.evaluate(() => {
    const display = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).display : null;
    };
    const text = (sel) => document.querySelector(sel)?.textContent.replace(/\s+/g, " ").trim() || "";
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    return {
      href: document.querySelector('link[href*="style.css"]')?.href,
      src: document.querySelector('script[src*="game.js"]')?.src,
      topEnemyDisplay: display(".top-bar-enemy"),
      topPlayerDisplay: display(".top-bar-player"),
      energyDetailDisplay: display("#energyDetailDetails"),
      mobileHudDisplay: display("#mobileHud"),
      mobileStatDisplay: display("#mobileStatSheet"),
      enemyRailDisplay: display("#hudRailEnemy"),
      playerRailDisplay: display("#hudRailPlayer"),
      desktopMenuWidth: rect("#desktopMenu")?.width || 0,
      mobileHudRect: rect("#mobileHud"),
      statRect: rect("#mobileStatSheet"),
      battlefieldRect: rect("#boardArea"),
      mobilePhase: text("#mobilePhaseBadge"),
      mobileTurn: text(".mobile-hud-center .m-turn"),
      mobileEnemyName: text("#mobileEnemyName"),
      mobilePlayerName: text("#mobilePlayerName"),
      mobileEnemyCounts: text(".mobile-hud-enemy .m-counts"),
      mobilePlayerCounts: text(".mobile-hud-player .m-counts"),
      enemyTabClass: document.querySelector("#mobileStatEnemyTab")?.className || "",
      playerTabClass: document.querySelector("#mobileStatPlayerTab")?.className || "",
      enemySheetHidden: document.querySelector("#mobileStatEnemySheet")?.hidden ?? null,
      playerSheetHidden: document.querySelector("#mobileStatPlayerSheet")?.hidden ?? null,
      enemySheetText: text("#mobileStatEnemySheet"),
      playerSheetText: text("#mobileStatPlayerSheet"),
      drawText: text("#btnDraw"),
      knightText: text("#btnTrainerAbility"),
    };
  });

  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: false });
  fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(metrics, null, 2));
  await page.close();
  return metrics;
}

await capture("mobile-portrait-enemy-390x844", 390, 844);
await capture("mobile-portrait-player-390x844", 390, 844, async (page) => {
  await page.click("#mobileStatPlayerTab");
  await page.waitForTimeout(150);
});
await capture("mobile-landscape-812x390", 812, 390);
await capture("desktop-1920x963", 1920, 963);

fs.writeFileSync(path.join(outDir, "console-errors.json"), JSON.stringify({ consoleMessages, pageErrors }, null, 2));
await browser.close();
