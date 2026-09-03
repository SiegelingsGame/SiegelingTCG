// Behavioural guard for two Play-page regressions that shipped with only
// source-text assertions in GameJavaScriptRegressionTest ("does game.js
// contain this string in this order"). Those prove the code was written, not
// that it runs, so both bugs are reproduced here against the real bundles.
//
//   node tests/play-match-and-profile-check.cjs
//
//   1. #691 — Mulligan "Leave match" abandoned a STARTED online game without a
//      forfeit: leaveOnlineMatch() posted /api/match/close (host-only lobby
//      teardown) and cleared local session anyway, stranding the opponent with
//      no win recorded. An unstarted lobby may still close.
//   2. #683 — /api/auth/me omits `progression` when that isolated Firestore
//      read fails. syncAuthProfileNow() wrote that progression-less body into
//      the shared sieglingsAuthProfile cache, so Home then treated a signed-in
//      account as starter-gate locked. The prior SAME-USER snapshot must be
//      preserved, and must NOT be carried across a different user id.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT = path.dirname(__dirname);
const STATIC = path.join(ROOT, 'src', 'main', 'resources', 'static');
const PORT = Number(process.env.PORT || 8974);
const TYPES = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
                '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
                '.webp':'image/webp', '.jpg':'image/jpeg' };

const server = http.createServer((req, res) => {
  const clean = req.url.split('?')[0].split('#')[0];
  // /api/** is stubbed per-test in the page via window.fetch; anything the page
  // requests during boot just needs to not hang.
  if (clean.startsWith('/api/')) { res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{}'); }
  const file = path.join(STATIC, clean === '/play' ? 'play.html' : clean);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const failures = [];
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures.push(name);
}

async function freshPage(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/play`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  return page;
}

// leaveOnlineMatch / syncAuthProfileNow are top-level declarations in game.js,
// so they hang off window; gameState / multiplayerSession / authState are
// top-level `let` bindings, reachable by assignment from page scope via eval.
async function leaveMatch(page, { started }) {
  return page.evaluate(async (started) => {
    const calls = [];
    window.fetch = async (u, o) => {
      calls.push({ url: String(u).replace(/^https?:\/\/[^/]+/, ''), method: (o && o.method) || 'GET' });
      return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '{"ok":true}' };
    };
    window.confirm = () => true;
    window.__loadoutAt = -1;
    eval('openLoadoutSelector = function () { window.__loadoutAt = window.__calls_len(); }');
    window.__calls_len = () => calls.length;
    eval(started ? 'gameState = { multiplayer: true, players: [] }' : 'gameState = null');
    eval('multiplayerSession = { roomId: "R1", playerToken: "T1" }');

    await window.leaveOnlineMatch();

    const forfeitAt = calls.findIndex(c => c.url.includes('/api/match/forfeit'));
    return {
      urls: calls.map(c => c.url),
      forfeited: forfeitAt >= 0,
      closed: calls.some(c => c.url.includes('/api/match/close')),
      forfeitBeforeLoadout: forfeitAt >= 0 && (window.__loadoutAt === -1 || forfeitAt < window.__loadoutAt),
      sessionCleared: eval('multiplayerSession') === null,
    };
  }, started);
}

async function authRefresh(page, { sameUser }) {
  return page.evaluate(async (sameUser) => {
    const body = { authenticated: true, user: { id: sameUser ? 'u1' : 'u2', email: 'x@y.z' } }; // no progression
    window.fetch = async (u) => String(u).includes('/api/auth/me')
      ? { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
      : { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    eval('authState.token = "tok"');
    eval('authState.profile = { authenticated:true, user:{id:"u1"}, progression:{ ownedTotal: 42, marker:"PRIOR" } }');
    localStorage.removeItem('sieglingsAuthProfile');
    try { await window.syncAuthProfileNow(true); } catch (e) { /* renders may throw headless; the cache write precedes them */ }
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem('sieglingsAuthProfile') || 'null'); } catch (e) {}
    const cached = raw && raw.profile ? raw.profile : raw;   // cache shape is { savedAt, profile }
    return {
      cacheWritten: !!raw,
      cachedUserId: cached && cached.user ? cached.user.id : null,
      cachedMarker: cached && cached.progression ? cached.progression.marker : null,
      cachedOwnedTotal: cached && cached.progression ? cached.progression.ownedTotal : null,
    };
  }, sameUser);
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    console.log('#691 mulligan Leave match');
    let p = await freshPage(browser);
    const started = await leaveMatch(p, { started: true });
    await p.close();
    check('a started match forfeits server-side', started.forfeited, started.urls.join(','));
    check('a started match does NOT use host-only close', !started.closed);
    check('forfeit is issued before the loadout reopens', started.forfeitBeforeLoadout);
    check('local session is cleared after forfeiting', started.sessionCleared);

    p = await freshPage(browser);
    const lobby = await leaveMatch(p, { started: false });
    await p.close();
    check('an unstarted lobby may still close', lobby.closed, lobby.urls.join(','));
    check('an unstarted lobby does not forfeit', !lobby.forfeited);

    console.log('#683 auth refresh with progression omitted');
    p = await freshPage(browser);
    const same = await authRefresh(p, { sameUser: true });
    await p.close();
    check('cache is written', same.cacheWritten);
    check('same-user progression survives an omitted progression', same.cachedMarker === 'PRIOR' && same.cachedOwnedTotal === 42,
          `marker=${same.cachedMarker} ownedTotal=${same.cachedOwnedTotal}`);

    p = await freshPage(browser);
    const diff = await authRefresh(p, { sameUser: false });
    await p.close();
    check('a different user does not inherit the prior progression', diff.cachedMarker === null,
          `cachedUserId=${diff.cachedUserId} marker=${diff.cachedMarker}`);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures.length ? `\nFAILED: ${failures.length}\n  - ${failures.join('\n  - ')}` : '\nAll checks passed.');
  process.exit(failures.length ? 1 : 0);
})();
