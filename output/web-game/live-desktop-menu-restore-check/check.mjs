import fs from "node:fs";
import path from "node:path";
import { chromium } from "file:///C:/Users/AlexTillman/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const outDir = path.resolve("output/web-game/live-desktop-menu-restore-check");
const shotPath = path.join(outDir, "desktop-menu-restore.png");
const statePath = path.join(outDir, "state.json");
fs.mkdirSync(outDir, { recursive: true });

const consoleMessages = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (msg) => { if (msg.type() === "error") consoleMessages.push(msg.text()); });
page.on("pageerror", (err) => pageErrors.push(String(err)));

await page.goto("https://siegelingstcgtesting.web.app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const state = await page.evaluate(async () => {
  const emptyBoard = () => [[null, null, null], [null, null, null], [null, null, null]];
  const normalizeNotches = (card) => {
    if (!card || !Array.isArray(card.notches)) return;
    card.notches = card.notches.map((notch) => ({ ...notch, element: notch.element || card.element || "FIRE" }));
  };

  const playerBoard = emptyBoard();
  playerBoard[2][1] = {
    id: "player-hotdog",
    name: "Hotdog",
    element: "FIRE",
    type: "SIEGLING",
    rarity: "RARE",
    hp: 15,
    maxHp: 15,
    spd: 11,
    preferredRow: "FRONT",
    notches: [{ direction: "TOP", element: "FIRE" }, { direction: "LEFT", element: "FIRE" }, { direction: "RIGHT", element: "FIRE" }],
    abilities: [{ name: "Hotdog Strike", description: "Deal 7 damage to 1 enemy", requiredEnergy: 2, requiredElement: "FIRE", affordable: true, index: 0 }],
    ability: { description: "Deal 7 damage to 1 enemy" }
  };
  playerBoard.flat().forEach(normalizeNotches);

  const enemyBoard = emptyBoard();

  gameState = {
    currentPhase: "SETUP",
    gameOver: false,
    activeSide: "PLAYER",
    activeSideLabel: "You",
    firstPlayer: "PLAYER",
    firstPlayerLabel: "You",
    playerName: "PLAYER",
    enemyName: "AI Opponent",
    turnNumber: 4,
    multiplayer: false,
    roomId: null,
    battleWaitingOn: null,
    pendingBattle: null,
    playerPlacementUsed: false,
    legalPlacements: [],
    gameLog: ["Setup phase."],
    player: {
      health: 100,
      deckSize: 40,
      handSize: 5,
      hand: [
        { id: "h1", name: "Hotdog", element: "FIRE", type: "SIEGLING", rarity: "RARE", health: 15, speed: 11, preferredRow: "FRONT", notches: [{ direction: "TOP", element: "FIRE" }], ability: { description: "Deal 7 damage to 1 enemy" } },
        { id: "h2", name: "Cinder Bolt", element: "FIRE", type: "SPELL", rarity: "COMMON", costElement: "FIRE", costAmount: 2, ability: { description: "Deal 2 damage to 1 enemy" } },
        { id: "h3", name: "Backfire Sigil", element: "FIRE", type: "TRAP", rarity: "UNCOMMON", trapBucketElement: "FIRE", trapBucketAmount: 2, ability: { description: "Trigger when the opponent gains enough Fire" } },
        { id: "h4", name: "Draco", element: "FIRE", type: "SIEGLING", rarity: "RARE", health: 10, speed: 8, preferredRow: "MIDDLE", notches: [{ direction: "LEFT", element: "FIRE" }], ability: { description: "Move this Siegling to an open linked point" } },
        { id: "h5", name: "Pylord", element: "FIRE", type: "SIEGLING", rarity: "LEGENDARY", health: 16, speed: 9, preferredRow: "BACK", notches: [{ direction: "BOTTOM", element: "FIRE" }], ability: { description: "Boost all allied Fire damage by 1" } }
      ],
      remainingDeck: [
        { id: "d1", name: "Pylord", element: "FIRE", type: "SIEGLING", rarity: "LEGENDARY" },
        { id: "d2", name: "Solgator", element: "FIRE", type: "SIEGLING", rarity: "EPIC" },
        { id: "d3", name: "Magma Volley", element: "FIRE", type: "SPELL", rarity: "RARE" },
        { id: "d4", name: "Magma Volley", element: "FIRE", type: "SPELL", rarity: "RARE" },
        { id: "d5", name: "Backfire Sigil", element: "FIRE", type: "TRAP", rarity: "UNCOMMON" },
        { id: "d6", name: "Ember Bolt", element: "FIRE", type: "SPELL", rarity: "COMMON" },
        { id: "d7", name: "Ember Furnace", element: "FIRE", type: "SPELL", rarity: "COMMON" },
        { id: "d8", name: "Emberfin", element: "FIRE", type: "SIEGLING", rarity: "COMMON" }
      ],
      trainer: { name: "Knight", tier: "SiegeKnight", element: "FIRE", used: false, active: { name: "Kindle Shot", description: "Deal 2 damage to 1 enemy.", requiredEnergy: 1, requiredElement: "FIRE", targetType: "SINGLE_ENEMY" } }
    },
    enemy: {
      health: 100,
      deckSize: 34,
      handSize: 4,
      trainer: { name: "Enemy Knight", tier: "SiegeKnight", element: "WATER", used: false, active: { name: "Ice Spear", description: "Deal 2 damage to 1 enemy.", requiredEnergy: 1, requiredElement: "WATER", targetType: "SINGLE_ENEMY" } }
    },
    playerBoard,
    enemyBoard,
    mulligan: { active: false, youPending: false, opponentPending: false }
  };

  gameState.player.hand.forEach(normalizeNotches);

  if (typeof render === "function") render();
  await new Promise((resolve) => setTimeout(resolve, 160));

  const inspectRect = document.getElementById("desktopInspectSection")?.getBoundingClientRect();
  const handRect = document.getElementById("desktopHandSection")?.getBoundingClientRect();
  const actionRect = document.getElementById("actionBar")?.getBoundingClientRect();

  return {
    inspectTop: inspectRect ? Math.round(inspectRect.top) : 0,
    handTop: handRect ? Math.round(handRect.top) : 0,
    actionTop: actionRect ? Math.round(actionRect.top) : 0,
    inspectBeforeHand: Boolean(inspectRect && handRect && inspectRect.top < handRect.top),
    handBeforeAction: Boolean(handRect && actionRect && handRect.top < actionRect.top),
    deckTierCount: document.querySelectorAll('.desktop-deck-tier').length,
    deckIconCount: document.querySelectorAll('.desktop-deck-icon-card').length,
    handCardCount: document.querySelectorAll('#playerHand .hand-card').length,
    deckTypeLabels: Array.from(document.querySelectorAll('.desktop-deck-type-label')).map((el) => el.textContent.trim()),
    consoleReady: true
  };
});

await page.screenshot({ path: shotPath, fullPage: false });
fs.writeFileSync(statePath, JSON.stringify({ ...state, consoleMessages, pageErrors }, null, 2));
await browser.close();

