import fs from "node:fs";
import path from "node:path";
import { chromium } from "file:///C:/Users/AlexTillman/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const outDir = path.resolve("output/web-game/desktop-battle-drawer-focused-check");
const shotPath = path.join(outDir, "desktop-battle-drawer.png");
const statePath = path.join(outDir, "state.json");
fs.mkdirSync(outDir, { recursive: true });

const consoleMessages = [];
const pageErrors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1728, height: 972 } });
page.on("console", (msg) => {
  if (msg.type() === "error") {
    consoleMessages.push(msg.text());
  }
});
page.on("pageerror", (err) => pageErrors.push(String(err)));

await page.goto("http://127.0.0.1:8080", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const state = await page.evaluate(async () => {
  const emptyBoard = () => [[null, null, null], [null, null, null], [null, null, null]];
  const enemyBoard = emptyBoard();
  const playerBoard = emptyBoard();

  enemyBoard[1][2] = {
    id: "enemy-frostfly",
    name: "Frostfly",
    element: "WATER",
    type: "SIEGLING",
    rarity: "COMMON",
    hp: 12,
    maxHp: 12,
    spd: 7,
    preferredRow: "MIDDLE",
    notches: [
      { direction: "LEFT", energy: "WATER" },
      { direction: "BOTTOM", energy: "WATER" }
    ],
    abilities: [
      {
        name: "Frostfly Strike",
        description: "Deal 3 damage to 1 enemy",
        requiredEnergy: 1,
        requiredElement: "WATER",
        targetType: "SINGLE_ENEMY",
        affordable: true,
        index: 0
      }
    ],
    ability: { description: "Deal 3 damage to 1 enemy" }
  };

  playerBoard[1][0] = {
    id: "player-fawny",
    name: "Fawny",
    element: "FIRE",
    type: "SIEGLING",
    rarity: "COMMON",
    hp: 9,
    maxHp: 13,
    spd: 4,
    preferredRow: "MIDDLE",
    notches: [
      { direction: "RIGHT", energy: "FIRE" },
      { direction: "TOP", energy: "FIRE" }
    ],
    abilities: [
      {
        name: "Fawny Strike",
        description: "Deal 2 damage to 1 enemy",
        requiredEnergy: 0,
        affordable: true,
        index: 0
      }
    ],
    ability: { description: "Deal 2 damage to 1 enemy" }
  };

  const now = Date.now();
  gameState = {
    currentPhase: "BATTLE",
    gameOver: false,
    activeSide: "PLAYER",
    activeSideLabel: "You",
    firstPlayer: "PLAYER",
    firstPlayerLabel: "You",
    playerName: "PLAYER",
    enemyName: "AI Opponent",
    turnNumber: 8,
    multiplayer: false,
    roomId: null,
    battleWaitingOn: "PLAYER",
    pendingBattle: {
      name: "Fawny",
      row: 1,
      col: 0,
      abilities: [
        {
          index: 0,
          name: "Fawny Strike",
          description: "Deal 3 damage to 1 enemy",
          requiredEnergy: 0,
          affordable: true,
          targetType: "SINGLE_ENEMY"
        },
        {
          index: 1,
          name: "Solar Burst",
          description: "Deal 2 damage to the front row",
          requiredEnergy: 1,
          requiredElement: "EARTH",
          affordable: true,
          targetType: "SINGLE_ENEMY"
        }
      ]
    },
    playerPlacementUsed: true,
    legalPlacements: [],
    gameLog: [
      "Battle phase started.",
      "Fawny is acting from speed order."
    ],
    player: {
      health: 100,
      deckSize: 34,
      handSize: 6,
      hand: [
        {
          id: "hand-1",
          name: "Terra Shelter",
          element: "EARTH",
          type: "SPELL",
          rarity: "RARE",
          costElement: "EARTH",
          costAmount: 5,
          ability: { description: "Heal all allies for 10" }
        },
        {
          id: "hand-2",
          name: "Rockspire",
          element: "EARTH",
          type: "SIEGLING",
          rarity: "COMMON",
          health: 11,
          speed: 4,
          notches: [
            { direction: "LEFT", energy: "EARTH" }
          ],
          ability: { description: "Gain +1 defense while in the back row" }
        }
      ],
      remainingDeck: [
        { id: "deck-1", name: "Gritbloom", element: "EARTH", type: "SIEGLING", rarity: "LEGENDARY" },
        { id: "deck-2", name: "Stone Pulse", element: "EARTH", type: "SPELL", rarity: "RARE" },
        { id: "deck-3", name: "Stone Pulse", element: "EARTH", type: "SPELL", rarity: "RARE" },
        { id: "deck-4", name: "Hollow Trap", element: "EARTH", type: "TRAP", rarity: "UNCOMMON" }
      ],
      trainer: {
        name: "Siege Knight",
        element: "EARTH",
        tier: "SiegeKnight",
        used: false,
        active: {
          name: "Earth Ward",
          description: "Grant a front-row ally +2 armor.",
          requiredEnergy: 1,
          requiredElement: "EARTH",
          targetType: "SINGLE_ALLY"
        }
      }
    },
    enemy: {
      health: 100,
      deckSize: 30,
      handSize: 4,
      trainer: {
        name: "Frost Marshal",
        element: "WATER",
        tier: "SiegeKnight",
        used: false,
        active: {
          name: "Ice Spear",
          description: "Deal 2 damage to 1 enemy.",
          requiredEnergy: 1,
          requiredElement: "WATER",
          targetType: "SINGLE_ENEMY"
        }
      }
    },
    playerBoard,
    enemyBoard,
    mulligan: { active: false, youPending: false, opponentPending: false },
    timestamp: now
  };

  const normalizeNotches = (card) => {
    if (!card || !Array.isArray(card.notches)) {
      return;
    }
    card.notches = card.notches
      .filter(Boolean)
      .map((notch) => ({ ...notch, element: notch.element || "FIRE" }));
  };

  [gameState.playerBoard, gameState.enemyBoard].forEach((board) => {
    (board || []).forEach((row) => {
      (row || []).forEach((card) => normalizeNotches(card));
    });
  });
  (gameState.player?.hand || []).forEach((card) => normalizeNotches(card));

  if (typeof resetInteractionState === "function") {
    resetInteractionState(false);
  }
  if (typeof render === "function") {
    render();
  }
  if (typeof openBattlePanel === "function") {
    openBattlePanel(true);
  }

  document.getElementById("loadoutOverlay")?.classList.remove("visible");
  document.getElementById("welcomeOverlay")?.classList.remove("visible");

  await new Promise((resolve) => setTimeout(resolve, 180));

  const desktopDrawer = document.getElementById("desktopBattleDrawer");
  const mobileDrawer = document.getElementById("drawerBattle");
  const desktopPanel = document.getElementById("desktopBattleActionPanel");
  const inspectRect = document.getElementById("desktopInspectSection")?.getBoundingClientRect();
  const handRect = document.getElementById("desktopHandSection")?.getBoundingClientRect();
  const actionRect = document.getElementById("actionBar")?.getBoundingClientRect();
  const drawerRect = desktopDrawer?.getBoundingClientRect();

  return {
    phaseBadge: document.getElementById("phaseBadge")?.textContent?.trim() || "",
    desktopDrawerVisible: Boolean(desktopDrawer?.classList.contains("visible")),
    desktopDrawerWidth: drawerRect ? Math.round(drawerRect.width) : 0,
    desktopDrawerLeft: drawerRect ? Math.round(drawerRect.left) : 0,
    desktopDrawerRight: drawerRect ? Math.round(drawerRect.right) : 0,
    mobileDrawerVisible: Boolean(mobileDrawer?.classList.contains("visible")),
    battlePanelHasButtons: (desktopPanel?.querySelectorAll(".battle-ability-btn")?.length || 0) > 0,
    inspectTop: inspectRect ? Math.round(inspectRect.top) : 0,
    handTop: handRect ? Math.round(handRect.top) : 0,
    actionBarTop: actionRect ? Math.round(actionRect.top) : 0,
    battleDrawerAboveActionBar: Boolean(drawerRect && actionRect && drawerRect.bottom < actionRect.top),
    inspectOverlapsHand: Boolean(inspectRect && handRect && inspectRect.bottom > handRect.top),
    handOverlapsInspect: Boolean(handRect && inspectRect && handRect.bottom > inspectRect.top),
    battlePanelPreview: desktopPanel?.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) || ""
  };
});

await page.screenshot({ path: shotPath, fullPage: false });

const finalState = {
  ...state,
  consoleMessages,
  pageErrors
};
fs.writeFileSync(statePath, JSON.stringify(finalState, null, 2));

await browser.close();
