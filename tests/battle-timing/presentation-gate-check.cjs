// Deterministic regression check for the battle-dock presentation gate.
//
//   Start the app (./mvnw spring-boot:run), then:
//     node tests/battle-timing/presentation-gate-check.cjs
//
// Uses a real server-captured BATTLE state (with pendingBattle) fed through the
// page's own api() + render(), driving the real ActionQueue.
//
// The question this answers is exactly the reported bug: when a state carrying
// the next acting Siegeling lands WHILE playback is still running, does the
// dock paint its ability buttons immediately, or does it wait for the banner?
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const STATE = JSON.parse(fs.readFileSync(__dirname + '/battle-state-fixture.json', 'utf8')).next2;
const VIEWPORTS = [
  { name: 'phone',   width: 390,  height: 844 },
  { name: 'desktop', width: 1920, height: 1080 }
];

async function run(vp) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('http://localhost:8080/play', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.api === 'function', { timeout: 30000 });

  const out = await page.evaluate(async (battleState) => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const probe = () => ({
      abilityButtons: document.querySelectorAll('.battle-ability-btn').length,
      dockState: document.querySelector('.battle-queue-state')?.textContent || null,
      bannerUp: Boolean(document.getElementById('phaseTransitionBanner')?.classList.contains('visible')),
      queueBusy: Boolean(window.SieglingsActionQueue?.isProcessing?.())
    });

    // Serve the canned BATTLE state to the page's own api()/fetchJson path.
    const realFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (String(url).includes('/api/game/')) {
        return new Response(JSON.stringify(battleState), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
      return realFetch(url, opts);
    };

    // 1. Quiet baseline: the acting Siegeling's moves SHOULD be up.
    await window.api('state', 'GET');
    await sleep(400);
    const idle = probe();

    // 2. Playback in flight: enqueue a real PHASE action, then land the same
    //    state — this is the sequence api() performs on a live transition.
    window.SieglingsActionQueue.enqueueAction({
      kind: 'PHASE', phase: 'BATTLE', activeSide: 'PLAYER',
      side: 'PLAYER', holdMs: 2500, gapAfterMs: 200
    });
    await sleep(150);
    await window.api('state', 'GET');
    await sleep(200);
    const duringPlayback = probe();

    // 3. After playback drains, the moves must come back.
    for (let i = 0; i < 80 && window.SieglingsActionQueue.isProcessing(); i++) await sleep(200);
    await sleep(600);
    const afterIdle = probe();

    window.fetch = realFetch;
    return { idle, duringPlayback, afterIdle };
  }, STATE);

  await browser.close();
  return { vp: vp.name, ...out, pageErrors };
}

(async () => {
  let failed = false;
  for (const vp of VIEWPORTS) {
    const r = await run(vp);
    console.log(`\n===== ${r.vp} =====`);
    console.log('  idle before playback :', JSON.stringify(r.idle));
    console.log('  during playback      :', JSON.stringify(r.duringPlayback));
    console.log('  after playback drains:', JSON.stringify(r.afterIdle));
    if (r.pageErrors.length) { console.log('  PAGE ERRORS:', r.pageErrors); failed = true; }

    const checks = [
      ['moves are up when nothing is playing', r.idle.abilityButtons > 0],
      ['playback was actually in flight for the measurement', r.duringPlayback.queueBusy || r.duringPlayback.bannerUp],
      ['NO ability buttons while playback/banner is running', r.duringPlayback.abilityButtons === 0],
      ['dock shows a standby shell during playback', r.duringPlayback.dockState !== 'Acting Now'],
      ['moves return once playback drains', r.afterIdle.abilityButtons > 0],
      ['dock returns to Acting Now', r.afterIdle.dockState === 'Acting Now']
    ];
    for (const [label, ok] of checks) {
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
      if (!ok) failed = true;
    }
  }
  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  process.exit(failed ? 1 : 0);
})();
