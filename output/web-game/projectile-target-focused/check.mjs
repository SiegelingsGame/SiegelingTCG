import playwright from 'file:///C:/Users/AlexTillman/AppData/Local/CodexTools/playwright-runtime/node_modules/playwright/index.js';

const { chromium } = playwright;

const url = 'http://127.0.0.1:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 963 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(err.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.SieglingsActionQueue && window.SieglingsFx);

const result = await page.evaluate(async () => {
  const gridHtml = '<div class="board-cell" data-row="0" data-col="0"><div class="board-card">Test</div></div>';
  const playerGrid = document.getElementById('playerGrid');
  const enemyGrid = document.getElementById('enemyGrid');
  playerGrid.innerHTML = gridHtml;
  enemyGrid.innerHTML = gridHtml;

  const appShell = document.querySelector('.app-shell');
  if (appShell) appShell.style.display = 'grid';
  const loadout = document.getElementById('loadoutOverlay');
  if (loadout) loadout.style.display = 'none';
  document.body.classList.remove('welcome-active');

  const centerOf = (selector) => {
    const el = document.querySelector(selector);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
  };
  const closeTo = (a, b) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

  const attacks = [];
  const originalAttackPoint = window.SieglingsFx.attackPoint;
  window.SieglingsFx.attackPoint = (fromIsPlayer, fr, fc, toX, toY, element, options) => {
    attacks.push({ fromIsPlayer, fr, fc, toX, toY, element, duration: options?.duration });
  };
  const enemyHp = centerOf('#hudRailEnemy .hud-hp-row');
  const playerHp = centerOf('#hudRailPlayer .hud-hp-row');

  window.SieglingsActionQueue.clear();
  window.SieglingsActionQueue.setSpeed('fast');

  const base = {
    kind: 'ATTACK',
    amount: 3,
    knightElement: 'FIRE',
    elementColor: 'FIRE',
    gapAfterMs: 40
  };

  window.SieglingsActionQueue.enqueueAction({
    ...base,
    side: 'PLAYER',
    actorName: 'Player A',
    targetName: 'Player B',
    source: { isPlayer: true, row: 0, col: 0 },
    target: { healthBar: true, isPlayer: false, element: 'FIRE' }
  });

  await new Promise((resolve) => setTimeout(resolve, 700));

  window.SieglingsActionQueue.enqueueAction({
    ...base,
    side: 'ENEMY',
    actorName: 'Player B',
    targetName: 'Player A',
    source: { isPlayer: false, row: 0, col: 0 },
    target: { healthBar: true, isPlayer: true, element: 'FIRE' }
  });

  await new Promise((resolve) => setTimeout(resolve, 900));
  window.SieglingsFx.attackPoint = originalAttackPoint;

  return {
    attacks,
    enemyHp,
    playerHp,
    playerATargetsPlayerB: closeTo({ x: attacks[0]?.toX, y: attacks[0]?.toY }, enemyHp),
    playerBTargetsPlayerA: closeTo({ x: attacks[1]?.toX, y: attacks[1]?.toY }, playerHp)
  };
});

await page.screenshot({ path: 'output/web-game/projectile-target-focused/direct-health-targets.png', fullPage: true });
await browser.close();

if (errors.length) {
  console.error(JSON.stringify({ errors }, null, 2));
  process.exit(1);
}
if (!result.playerATargetsPlayerB || !result.playerBTargetsPlayerA) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
