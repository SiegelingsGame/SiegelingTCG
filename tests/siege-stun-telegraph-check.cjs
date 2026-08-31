/**
 * Siege stun-telegraph check.
 *
 * A stunned foe skips its action, so it must not telegraph a swing: its plate
 * reads "Stunned" and no target ring is drawn under the Siegeling it had been
 * aiming at. Drives the REAL bundle (served by a local app on :8080) against a
 * canned run captured from the API — `tests/fixtures-siege-stun-run.json`, a
 * real first battle with two foes telegraphing Strike at notches 1 and 2.
 *
 *   node tests/siege-stun-telegraph-check.cjs
 *
 * The stunned fixture deliberately keeps the server's pre-stun
 * `targetedPositions`, so this measures the CLIENT's own reading of the foes'
 * intents (the frontend/backend parity rule); SiegeStunTelegraphTest covers the
 * server dropping them.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = process.env.SIEGE_BASE || 'http://localhost:8080';
const OUT = process.env.SIEGE_OUT || path.join(require('os').tmpdir(), 'siege-stun');
const RUN = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-siege-stun-run.json'), 'utf8'));

const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'desktop', width: 1920, height: 1080 },
];

function stunned() {
  const r = JSON.parse(JSON.stringify(RUN));
  // Every foe stunned, but the threat list left as the server sent it before
  // the stun landed — the client must not draw a ring off a stale list.
  r.battle.enemies.forEach(e => { e.statuses = ['STUN']; e.statusRounds = { STUN: 1 }; });
  return r;
}

/** Only the first foe stunned — the other's ring must survive. */
function halfStunned() {
  const r = JSON.parse(JSON.stringify(RUN));
  r.battle.enemies[0].statuses = ['STUN'];
  r.battle.enemies[0].statusRounds = { STUN: 1 };
  return r;
}

async function screen(browser, vp, state, shot) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript((r) => {
    localStorage.setItem('siegeToken', 't');
    const orig = window.fetch;
    const json = v => Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve(JSON.parse(JSON.stringify(v))) });
    window.fetch = (url, opts) => {
      const u = String(url);
      if (u.indexOf('/api/siege/') < 0) return orig(url, opts);
      if (u.indexOf('/run/active') >= 0) return json({ runs: [r] });
      return json(r);
    };
  }, state);
  await page.goto(`${BASE}/adventure.html?v=check`, { waitUntil: 'load' });
  const resume = await page.$('#resumeSaves .siege-btn.primary');
  if (resume) await resume.click();
  await page.waitForSelector('#battleScreen:not(.hidden)', { timeout: 20000 });
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => ({
    rings: document.querySelectorAll('#allyRow .sp-target-ring').length,
    ringedNames: Array.from(document.querySelectorAll('#allyRow .sprite.threatened'))
      .map(s => ((s.querySelector('.sp-name') || {}).textContent || '').trim()),
    threatened: document.querySelectorAll('#allyRow .sprite.threatened').length,
    foes: Array.from(document.querySelectorAll('#enemyRow .sprite')).map(s => {
      const line = s.querySelector('.sp-intent-line');
      return {
        name: (s.querySelector('.sp-name') || {}).textContent || '',
        intent: line ? line.textContent.trim() : '',
        stunClass: !!(line && line.classList.contains('is-stunned')),
        chip: !!s.querySelector('.sp-status.st-STUN'),
        // The line must still be painted, not just present in the DOM.
        painted: !!(line && line.getBoundingClientRect().height > 0),
      };
    }),
  }));
  if (shot) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, shot + '.png') }); }
  await page.close();
  return Object.assign(m, { errors });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let bad = 0;
  for (const vp of VIEWPORTS) {
    const ok = (label, cond, extra) => {
      console.log(`${cond ? 'OK  ' : 'FAIL'} [${vp.name}] ${label}${extra ? ' — ' + extra : ''}`);
      if (!cond) bad++;
    };
    console.log(`\n== ${vp.name} (${vp.width}x${vp.height})`);

    const before = await screen(browser, vp, RUN, vp.name + '-telegraphing');
    ok('baseline: both notches ringed', before.rings === 2 && before.threatened === 2,
       `rings=${before.rings} threatened=${before.threatened}`);
    ok('baseline: foes telegraph their swing',
       before.foes.length === 2 && before.foes.every(f => /^⚔\d/.test(f.intent)),
       before.foes.map(f => f.intent).join(' | '));
    ok('baseline: no page errors', before.errors.length === 0, before.errors.slice(0, 2).join(' | '));

    const after = await screen(browser, vp, stunned(), vp.name + '-stunned');
    ok('stunned: no target ring under any Siegeling', after.rings === 0 && after.threatened === 0,
       `rings=${after.rings} threatened=${after.threatened}`);
    ok('stunned: every foe plate reads "Stunned"',
       after.foes.length === 2 && after.foes.every(f => /Stunned/.test(f.intent) && !/⚔/.test(f.intent)),
       after.foes.map(f => f.intent).join(' | '));
    ok('stunned: the line is painted and styled apart from a threat',
       after.foes.every(f => f.painted && f.stunClass));
    ok('stunned: the STUN chip is still on the plate', after.foes.every(f => f.chip));
    ok('stunned: no page errors', after.errors.length === 0, after.errors.slice(0, 2).join(' | '));

    // One foe stunned, one still swinging: exactly one ring, and it is under the
    // Siegeling the awake foe is aimed at.
    const ringed = await screen(browser, vp, halfStunned(), vp.name + '-half-stunned');
    ok('half: exactly one notch stays ringed', ringed.rings === 1 && ringed.threatened === 1,
       `rings=${ringed.rings} threatened=${ringed.threatened} under ${ringed.ringedNames.join(',')}`);
    ok('half: the ring sits under the awake foe\'s target',
       ringed.ringedNames.length === 1 && ringed.ringedNames[0] === 'Applehead',
       ringed.ringedNames.join(','));
    ok('half: the stunned foe reads "Stunned", the other still telegraphs',
       /Stunned/.test(ringed.foes[0].intent) && /^⚔\d/.test(ringed.foes[1].intent),
       ringed.foes.map(f => f.intent).join(' | '));
    ok('half: no page errors', ringed.errors.length === 0, ringed.errors.slice(0, 2).join(' | '));
  }
  await browser.close();
  console.log(bad ? `\n${bad} FAILURES` : '\nALL PASS');
  process.exit(bad ? 1 : 0);
})();
