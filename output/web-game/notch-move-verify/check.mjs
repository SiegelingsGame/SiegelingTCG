import fs from "node:fs";
import path from "node:path";
import { chromium } from "file:///C:/Users/AlexTillman/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const outDir = path.resolve("output/web-game/notch-move-verify");
fs.mkdirSync(outDir, { recursive: true });

function emptyBoard() {
  return [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
}

function playerShell(name) {
  return {
    name,
    health: 50,
    deckSize: 0,
    handSize: 0,
    fireEnergy: 0,
    waterEnergy: 0,
    earthEnergy: 0,
    windEnergy: 0,
    iceEnergy: 0,
    shadowEnergy: 0,
    electricEnergy: 0,
    metalEnergy: 0,
    undeadEnergy: 0,
    psychicEnergy: 0,
    comboPoints: [],
    trainer: { name: `${name} Knight`, element: "WIND", tier: "SiegeKnight" },
  };
}

function boardCard(overrides) {
  return {
    id: overrides.id,
    instanceId: overrides.instanceId,
    name: overrides.name,
    type: "SIEGLING",
    element: overrides.element || "WIND",
    hp: overrides.hp ?? 10,
    maxHp: overrides.maxHp ?? 10,
    printedHealth: overrides.printedHealth ?? 10,
    speed: overrides.speed ?? 5,
    currentSpeed: overrides.speed ?? 5,
    printedSpeed: overrides.speed ?? 5,
    shieldHp: 0,
    damageBoost: 0,
    statuses: [],
    notches: overrides.notches || [],
    abilities: [],
  };
}

function stateWithBoards(playerBoard, enemyBoard) {
  return {
    currentPhase: "BATTLE",
    turnNumber: 4,
    activeSide: "PLAYER",
    activeSideLabel: "You",
    firstPlayer: "PLAYER",
    firstPlayerLabel: "You",
    playerName: "Player",
    enemyName: "AI",
    player: playerShell("Player"),
    enemy: playerShell("AI"),
    playerBoard,
    enemyBoard,
    playerHand: [],
    playerDiscard: [],
    remainingDeck: [],
    legalPlacements: [],
    battleQueue: [],
    pendingBattle: null,
    battleWaitingOn: null,
    gameLog: [],
    gameOver: false,
  };
}

const mover = boardCard({
  id: "wind-mover",
  instanceId: "move-instance-1",
  name: "Breezee",
  element: "WIND",
  notches: [
    { direction: "BOTTOM_LEFT", element: "WIND" },
    { direction: "LEFT", element: "WIND" },
  ],
});
const linkedAlly = boardCard({
  id: "wind-anchor",
  instanceId: "move-anchor-1",
  name: "Cloudpuff",
  element: "WIND",
  notches: [{ direction: "RIGHT", element: "WIND" }],
});

const prevPlayerBoard = emptyBoard();
prevPlayerBoard[1][1] = mover;
prevPlayerBoard[2][0] = linkedAlly;

const nextPlayerBoard = emptyBoard();
nextPlayerBoard[2][1] = { ...mover };
nextPlayerBoard[2][0] = linkedAlly;

const prevState = stateWithBoards(prevPlayerBoard, emptyBoard());
const nextState = stateWithBoards(nextPlayerBoard, emptyBoard());
nextState.gameLog = [
  "[Turn 4 BATTLE] Breezee uses Air Step.",
  "[Turn 4 BATTLE] Breezee moves to Front row, col 1.",
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.text() === "No active game. Start a new game first.") return;
  if (msg.type() === "error") errors.push({ type: "console", text: msg.text() });
});
page.on("pageerror", (err) => errors.push({ type: "pageerror", text: String(err) }));

await page.goto(`http://127.0.0.1:8080/play?notchMoveVerify=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.SieglingsActionQueue && typeof window.render === "function" && document.querySelector("#playerGrid"));

await page.evaluate((state) => {
  window.__verifyState = state;
  window.eval("gameState = window.__verifyState; render();");
}, prevState);
await page.screenshot({ path: path.join(outDir, "before.png"), fullPage: true });

await page.evaluate(({ prevState, nextState }) => {
  window.SieglingsActionQueue.clear();
  window.__verifyPrev = prevState;
  window.__verifyNext = nextState;
  window.eval("gameState = window.__verifyPrev; render();");
  window.SieglingsActionQueue.enqueueFromStateDiff(window.__verifyPrev, window.__verifyNext);
  window.eval("gameState = window.__verifyNext; render();");
}, { prevState, nextState });

await page.waitForFunction(() => Boolean(document.querySelector(".sgl-shift-card")), null, { timeout: 2500 });
const during = await page.evaluate(() => {
  const targetCard = document.querySelector('#playerGrid .board-cell[data-row="2"][data-col="1"] .board-card');
  const targetRect = targetCard?.getBoundingClientRect();
  return {
    shiftCloneVisible: Boolean(document.querySelector(".sgl-shift-card")),
    destroyAnimationVisible: Boolean(document.querySelector(".sgl-destroying, .sgl-death-ghost")),
    targetVisibility: targetCard ? getComputedStyle(targetCard).visibility : null,
    targetOpacity: targetCard ? getComputedStyle(targetCard).opacity : null,
    targetRect: targetRect ? { x: targetRect.x, y: targetRect.y, width: targetRect.width, height: targetRect.height } : null,
    toastText: document.querySelector("#sieglingsToastStack")?.innerText || "",
  };
});
await page.screenshot({ path: path.join(outDir, "during-shift.png"), fullPage: true });

await page.waitForTimeout(1300);
const after = await page.evaluate(() => {
  const originCard = document.querySelector('#playerGrid .board-cell[data-row="1"][data-col="1"] .board-card');
  const targetCard = document.querySelector('#playerGrid .board-cell[data-row="2"][data-col="1"] .board-card');
  const targetRect = targetCard?.getBoundingClientRect();
  return {
    shiftCloneVisible: Boolean(document.querySelector(".sgl-shift-card")),
    destroyAnimationVisible: Boolean(document.querySelector(".sgl-destroying, .sgl-death-ghost")),
    originHasCard: Boolean(originCard),
    targetHasCard: Boolean(targetCard),
    targetVisibility: targetCard ? getComputedStyle(targetCard).visibility : null,
    targetOpacity: targetCard ? getComputedStyle(targetCard).opacity : null,
    targetRect: targetRect ? { x: targetRect.x, y: targetRect.y, width: targetRect.width, height: targetRect.height } : null,
    targetName: targetCard?.innerText || "",
    queueProcessing: window.SieglingsActionQueue.isProcessing(),
  };
});
await page.screenshot({ path: path.join(outDir, "after-shift.png"), fullPage: true });

await browser.close();

const summary = { during, after, errors };
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

if (errors.length) {
  throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
}
if (!during.shiftCloneVisible || during.destroyAnimationVisible) {
  throw new Error(`Unexpected movement playback state: ${JSON.stringify(during)}`);
}
if (after.shiftCloneVisible || after.destroyAnimationVisible || after.originHasCard || !after.targetHasCard || after.targetVisibility !== "visible") {
  throw new Error(`Unexpected final board state: ${JSON.stringify(after)}`);
}
