import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const repo = process.cwd();
const skillScript = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".codex/skills/develop-web-game/scripts/web_game_playwright_client.js"
);
const require = createRequire(pathToFileURL(skillScript));
const { chromium } = require("playwright");
const actionQueuePath = path.join(repo, "src/main/resources/static/js/action-queue.js");
const stylePath = path.join(repo, "src/main/resources/static/css/style.css");
const outDir = path.join(repo, "output/web-game/status-skip-focused");

function boardWith(card) {
  return [
    [null, null, null],
    [null, card, null],
    [null, null, null],
  ];
}

const cardBefore = {
  instanceId: "frostling-1",
  id: "frostling-1",
  name: "Frostling",
  element: "ICE",
  hp: 10,
  maxHp: 10,
  statuses: ["FREEZE"],
};
const cardAfter = {
  ...cardBefore,
  statuses: [],
};
const prevBoard = boardWith(cardBefore);
const nextBoard = boardWith(cardAfter);
const emptyBoard = [[null, null, null], [null, null, null], [null, null, null]];

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #101827;
      color: #f8fbff;
      font-family: Arial, sans-serif;
    }
    #playerGrid {
      display: grid;
      grid-template-columns: repeat(3, 120px);
      grid-template-rows: repeat(3, 150px);
      gap: 12px;
    }
    .board-cell {
      border: 1px solid rgba(255,255,255,.25);
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: rgba(255,255,255,.05);
    }
    .board-card {
      width: 100px;
      height: 130px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      border: 2px solid #76e6ff;
      background: linear-gradient(180deg, #27405d, #152238);
      font-weight: 800;
    }
  </style>
</head>
<body>
  <div id="playerGrid">
    <div class="board-cell" data-row="0" data-col="0"></div>
    <div class="board-cell" data-row="0" data-col="1"></div>
    <div class="board-cell" data-row="0" data-col="2"></div>
    <div class="board-cell" data-row="1" data-col="0"></div>
    <div class="board-cell" data-row="1" data-col="1"><div class="board-card">Frostling</div></div>
    <div class="board-cell" data-row="1" data-col="2"></div>
    <div class="board-cell" data-row="2" data-col="0"></div>
    <div class="board-cell" data-row="2" data-col="1"></div>
    <div class="board-cell" data-row="2" data-col="2"></div>
  </div>
  <div id="enemyGrid"></div>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
const consoleMessages = [];
const pageErrors = [];
page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
page.on("pageerror", (err) => pageErrors.push(err.message));
await page.setContent(html, { waitUntil: "load" });
await page.addStyleTag({ path: stylePath });
await page.addScriptTag({ path: actionQueuePath });
await page.waitForFunction(() => Boolean(window.SieglingsActionQueue));

await page.evaluate(({ prevBoard, nextBoard, emptyBoard }) => {
  window.SieglingsActionQueue.setSpeed("normal");
  window.SieglingsActionQueue.enqueueFromStateDiff(
    {
      currentPhase: "BATTLE",
      activeSide: "PLAYER",
      player: { name: "Player", trainer: { element: "ICE" } },
      enemy: { name: "AI", trainer: { element: "FIRE" } },
      playerBoard: prevBoard,
      enemyBoard: emptyBoard,
      gameLog: [],
    },
    {
      currentPhase: "BATTLE",
      activeSide: "PLAYER",
      player: { name: "Player", trainer: { element: "ICE" } },
      enemy: { name: "AI", trainer: { element: "FIRE" } },
      playerBoard: nextBoard,
      enemyBoard: emptyBoard,
      gameLog: ["[Turn 1 BATTLE] Frostling is Frozen and cannot act!"],
    }
  );
}, { prevBoard, nextBoard, emptyBoard });

await page.waitForTimeout(1200);

const result = await page.evaluate(() => ({
  toastText: document.querySelector("#sieglingsToastStack")?.innerText || "",
  toastHtml: document.querySelector("#sieglingsToastStack")?.innerHTML || "",
  cardClasses: document.querySelector(".board-card")?.className || "",
  processing: window.SieglingsActionQueue?.isProcessing?.() || false,
}));
result.consoleMessages = consoleMessages;
result.pageErrors = pageErrors;
result.ok = result.toastText.includes("Frostling") && result.toastText.includes("Frozen");

await page.screenshot({ path: path.join(outDir, "status-skip-toast.png"), fullPage: true });
await browser.close();

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exit(1);
}
