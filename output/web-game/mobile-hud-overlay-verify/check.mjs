import fs from "node:fs";
import path from "node:path";
import { chromium } from "file:///C:/Users/AlexTillman/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const outDir = path.resolve("output/web-game/mobile-hud-overlay-verify");
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
    playerName: "Player",
    enemyName: "AI Opponent",
    turnNumber: 1,
    multiplayer: false,
    roomId: null,
    battleWaitingOn: null,
    pendingBattle: null,
    playerPlacementUsed: false,
    legalPlacements: [],
    gameLog: ["Draw phase."],
    player: {
      health: 50,
      deckSize: 35,
      handSize: 5,
      hand: [
        { id: "h1", name: "Cinder Bolt", element: "FIRE", type: "SPELL", rarity: "COMMON", costElement: "FIRE", costAmount: 1, ability: { description: "Deal 1 damage." } },
        { id: "h2", name: "Sundile", element: "EARTH", type: "SIEGLING", rarity: "COMMON", health: 10, speed: 5, preferredRow: "MIDDLE", notches: [{ direction: "LEFT", element: "EARTH" }, { direction: "RIGHT", element: "EARTH" }], ability: { description: "Buried Scale." } },
        { id: "h3", name: "Cinder Surge", element: "FIRE", type: "SPELL", rarity: "COMMON", costElement: "FIRE", costAmount: 1, ability: { description: "Deal 1 damage." } },
        { id: "h4", name: "Bylood", element: "WATER", type: "SIEGLING", rarity: "RARE", health: 12, speed: 4, preferredRow: "FRONT", notches: [{ direction: "TOP", element: "WATER" }], ability: { description: "Splash." } },
        { id: "h5", name: "Root Lock", element: "EARTH", type: "TRAP", rarity: "COMMON", trapBucketElement: "EARTH", trapBucketAmount: 1, ability: { description: "Snare a target." } },
      ],
      remainingDeck: [],
      trainer: {
        name: "Stone Warden",
        tier: "SiegeKnight",
        element: "EARTH",
        passiveDescription: "All Earth allies gain +1 max Health",
        active: { name: "Stone Oath", description: "Give an ally health.", requiredEnergy: 1, requiredElement: "EARTH", targetType: "SINGLE_ALLY" },
      },
    },
    enemy: {
      health: 50,
      deckSize: 34,
      handSize: 4,
      earthEnergy: 3,
      metalEnergy: 1,
      electricEnergy: 1,
      trainer: {
        name: "Iron Vow",
        tier: "SiegeKnight",
        element: "METAL",
        passiveDescription: "Armor up the front row",
        active: { name: "Brace", description: "Add armor.", requiredEnergy: 1, requiredElement: "METAL", targetType: "SINGLE_ALLY" },
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

function metricScript() {
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
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };
  const overlay = rect("#mobileStatSheet");
  const action = rect("#actionBar");
  const hand = rect("#handTray");
  return {
    href: document.querySelector('link[href*="style.css"]')?.href,
    src: document.querySelector('script[src*="game.js"]')?.src,
    topBarDisplay: display(".top-bar"),
    mobileHudDisplay: display("#mobileHud"),
    mobileStatDisplay: display("#mobileStatSheet"),
    mobileStatOpen: document.querySelector("#mobileStatSheet")?.classList.contains("is-open") || false,
    enemyHudExpanded: document.querySelector(".mobile-hud-enemy")?.getAttribute("aria-expanded"),
    playerHudExpanded: document.querySelector(".mobile-hud-player")?.getAttribute("aria-expanded"),
    enemyRailDisplay: display("#hudRailEnemy"),
    playerRailDisplay: display("#hudRailPlayer"),
    desktopMenuWidth: rect("#desktopMenu")?.width || 0,
    mobileHudRect: rect("#mobileHud"),
    statRect: overlay,
    actionRect: action,
    handRect: hand,
    overlayCoversActions: Boolean(overlay && action && overlay.top <= action.top && overlay.bottom >= action.bottom),
    overlayCoversHand: Boolean(overlay && hand && overlay.top <= hand.top && overlay.bottom >= hand.bottom),
    mobileEnemyCounts: text(".mobile-hud-enemy .m-counts"),
    mobilePlayerCounts: text(".mobile-hud-player .m-counts"),
    enemyDots: document.querySelectorAll("#mobileEnemyElements .m-elem-dot").length,
    playerDots: document.querySelectorAll("#mobilePlayerElements .m-elem-dot").length,
    mobilePhase: text("#mobilePhaseBadge"),
    mobileTurn: text(".mobile-hud-center .m-turn"),
    enemyTabClass: document.querySelector("#mobileStatEnemyTab")?.className || "",
    playerTabClass: document.querySelector("#mobileStatPlayerTab")?.className || "",
    enemySheetHidden: document.querySelector("#mobileStatEnemySheet")?.hidden ?? null,
    playerSheetHidden: document.querySelector("#mobileStatPlayerSheet")?.hidden ?? null,
    enemySheetText: text("#mobileStatEnemySheet"),
    playerSheetText: text("#mobileStatPlayerSheet"),
  };
}

async function setupPage(label, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on("console", (msg) => { if (msg.type() === "error") consoleMessages.push(`${label}: ${msg.text()}`); });
  page.on("pageerror", (err) => pageErrors.push(`${label}: ${String(err)}`));
  await page.addInitScript(() => localStorage.setItem("sieglingsRendererMode", "dom"));
  await page.goto(`http://127.0.0.1:8080/?mobileHudOverlayVerify=${Date.now()}-${label}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof render === "function" && typeof updateResponsiveLayoutVars === "function", null, { timeout: 10000 });
  await page.evaluate(seed, buildState());
  await page.waitForTimeout(300);
  return page;
}

const page = await setupPage("mobile-390x844", 390, 844);
const initial = await page.evaluate(metricScript);
await page.screenshot({ path: path.join(outDir, "mobile-closed-390x844.png"), fullPage: false });
await page.click(".mobile-hud-player");
await page.waitForTimeout(180);
const playerOpen = await page.evaluate(metricScript);
await page.screenshot({ path: path.join(outDir, "mobile-player-open-390x844.png"), fullPage: false });
await page.click(".mobile-hud-enemy");
await page.waitForTimeout(180);
const enemyOpen = await page.evaluate(metricScript);
await page.screenshot({ path: path.join(outDir, "mobile-enemy-open-390x844.png"), fullPage: false });
await page.click(".mobile-hud-enemy");
await page.waitForTimeout(180);
const toggledClosed = await page.evaluate(metricScript);
await page.screenshot({ path: path.join(outDir, "mobile-toggled-closed-390x844.png"), fullPage: false });
await page.close();

const landscape = await setupPage("landscape-812x390", 812, 390);
const landscapeMetrics = await landscape.evaluate(metricScript);
await landscape.screenshot({ path: path.join(outDir, "landscape-812x390.png"), fullPage: false });
await landscape.close();

const desktop = await setupPage("desktop-1920x963", 1920, 963);
const desktopMetrics = await desktop.evaluate(metricScript);
await desktop.screenshot({ path: path.join(outDir, "desktop-1920x963.png"), fullPage: false });
await desktop.close();

fs.writeFileSync(path.join(outDir, "metrics.json"), JSON.stringify({
  initial,
  playerOpen,
  enemyOpen,
  toggledClosed,
  landscape: landscapeMetrics,
  desktop: desktopMetrics,
  consoleMessages,
  pageErrors,
}, null, 2));
await browser.close();
