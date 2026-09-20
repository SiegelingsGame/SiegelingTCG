/*
 * Hub top-chrome edge guard.
 *
 * The coin chip, the crest and the bell float on full-bleed hero art. Three
 * separate passes "fixed" them reading blurred and the report came back each
 * time, because each pass removed a different suspected blur and nothing
 * pinned the property that actually decides whether they look crisp: the edge.
 * A control whose border is mostly transparent and whose shadow has a wide
 * radius has no line against bright artwork - it has a gradient, and a
 * gradient over a sunlit sky reads as a blur however opaque the fill is.
 *
 * This asserts the contract at the bottom of home-redesign.css, at both a
 * phone and a desktop viewport, in both the default and the guest header:
 *   1. no control, and no ancestor of one, carries filter/backdrop-filter;
 *   2. nothing paints OVER a control that is translucent, blurred or blended;
 *   3. every control's border is opaque (alpha >= 0.85) and non-zero width;
 *   4. no shadow on a control has a blur radius above 3px.
 *
 *   node tests/hub-top-chrome-check.cjs [baseUrl]
 * Serve the statics first, e.g.
 *   (cd src/main/resources/static && python3 -m http.server 8777)
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = process.argv[2] || 'http://localhost:8777';
const PAGE = BASE + '/home-next.html';
const CONTROLS = ['.sg-top .sg-chip', '.sg-top .sg-bell', '.sg-top .sg-avatar', '.sg-top .sg-signin'];
const MAX_SHADOW_BLUR = 3;
const MIN_BORDER_ALPHA = 0.85;

// The signed-out header shows the coin chip + Sign In pill; the signed-in one
// swaps the pill for the crest and the bell. The report this guard exists for
// was a signed-in header, so both are driven rather than whichever one the
// environment happens to produce.
const ACCOUNTS = [
  { name: 'guest', me: { authenticated: false } },
  { name: 'signed in', me: {
      authenticated: true,
      user: { id: 'guard-user', displayName: 'Guard', email: 'guard@example.com' },
      progression: { gold: 2870, xp: 40, xpToNext: 100, ownedTotal: 12 },
      matchHistory: [], savedDecks: []
    } }
];

const VIEWPORTS = [
  { name: 'phone 390x844', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'desktop 1920x1080', width: 1920, height: 1080, deviceScaleFactor: 1 }
];

let failures = 0;
function check(ok, label, detail) {
  if (!ok) failures++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (detail ? ' -> ' + detail : ''));
}

function probe(args) {
  const selectors = args.selectors;
  const alpha = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return 1;
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return parts.length > 3 ? parts[3] : 1;
  };
  // Every length in a box-shadow; the third is the blur radius of that layer.
  const shadowBlurs = (shadow) => {
    if (!shadow || shadow === 'none') return [];
    return shadow.split(/,(?![^(]*\))/).map((layer) => {
      const lengths = (layer.match(/-?[\d.]+px/g) || []).map(parseFloat);
      return lengths.length >= 3 ? lengths[2] : 0;
    });
  };

  return selectors.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const out = {
      sel,
      borderWidth: parseFloat(cs.borderTopWidth) || 0,
      borderAlpha: alpha(cs.borderTopColor),
      bgAlpha: alpha(cs.backgroundColor),
      filter: cs.filter,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      maxShadowBlur: Math.max(0, ...shadowBlurs(cs.boxShadow)),
      shadow: cs.boxShadow,
      ancestors: [],
      painters: []
    };
    for (let n = el.parentElement; n; n = n.parentElement) {
      const a = getComputedStyle(n);
      if (a.filter !== 'none' || (a.backdropFilter && a.backdropFilter !== 'none')) {
        out.ancestors.push(n.tagName + '.' + n.className + ' filter=' + a.filter + ' backdrop=' + a.backdropFilter);
      }
    }
    // Anything overlapping the control's box that is not an ancestor or a
    // child: a scrim, a tint ramp or a blurred overlay laid across the row.
    document.querySelectorAll('*').forEach((o) => {
      if (o === el || el.contains(o) || o.contains(el)) return;
      const q = o.getBoundingClientRect();
      if (!q.width || !q.height) return;
      if (q.right < r.left || q.left > r.right || q.bottom < r.top || q.top > r.bottom) return;
      const c = getComputedStyle(o);
      if (c.display === 'none' || c.visibility === 'hidden' || c.opacity === '0') return;
      const blurs = (c.backdropFilter && c.backdropFilter !== 'none') || c.filter !== 'none';
      const blends = c.mixBlendMode !== 'normal';
      const paints = c.backgroundImage !== 'none' || alpha(c.backgroundColor) > 0;
      // Only report painters that sit ABOVE the control in paint order.
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const above = stack.indexOf(o) !== -1 && stack.indexOf(o) < stack.indexOf(el);
      if (above && (blurs || blends || paints)) {
        out.painters.push(o.tagName + '.' + o.className + ' backdrop=' + c.backdropFilter +
          ' filter=' + c.filter + ' blend=' + c.mixBlendMode + ' bg=' + c.backgroundColor);
      }
    });
    return out;
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const vp of VIEWPORTS) {
  for (const account of ACCOUNTS) {
    const context = await browser.newContext(vp);
    // Only /api/auth/me is stubbed: every other endpoint 404s exactly as it
    // does when the statics are served without the backend, and the hub is
    // built to fall back honestly rather than break on that.
    await context.route('**/api/auth/me*', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(account.me)
    }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(PAGE, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForSelector('.sg-top', { timeout: 20000 });
    // The add-to-home-screen guide is a full-screen blurred veil by design and
    // auto-opens outside a standalone display mode; it is not hub chrome.
    await page.evaluate(() => { const g = document.querySelector('.ig-root'); if (g) g.remove(); });
    await page.waitForTimeout(500);

    console.log('\n' + vp.name + ' - ' + account.name);
    const results = await page.evaluate(probe, { selectors: CONTROLS });
    let seen = 0;
    for (const r of results) {
      if (r.missing) continue; // guest vs signed-in header shows one identity slot or the other
      seen++;
      check(r.filter === 'none', r.sel + ' has no filter of its own', r.filter);
      check(!r.backdrop || r.backdrop === 'none', r.sel + ' has no backdrop-filter', r.backdrop);
      check(r.ancestors.length === 0, r.sel + ' has no blurred ancestor', r.ancestors.join(' | '));
      check(r.painters.length === 0, r.sel + ' has nothing painting over it', r.painters.join(' | '));
      // The crest is a conic-gradient ring with no border to harden, so its
      // edge is the dark contact ring in its shadow rather than a border.
      if (r.sel.indexOf('avatar') === -1) {
        check(r.borderWidth > 0 && r.borderAlpha >= MIN_BORDER_ALPHA,
          r.sel + ' is edged by an opaque line', 'width=' + r.borderWidth + ' alpha=' + r.borderAlpha);
      }
      check(/0(px)? 0(px)? 0(px)? 1px|inset/.test(r.shadow) || r.sel.indexOf('avatar') === -1,
        r.sel + ' carries a contact ring', r.shadow);
      check(r.maxShadowBlur <= MAX_SHADOW_BLUR,
        r.sel + ' shadow is a contact edge, not a halo', 'blur=' + r.maxShadowBlur + 'px');
    }
    check(seen >= 2, 'found the top controls', seen + ' present');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
    await page.close();
    await context.close();
    }
  }
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
