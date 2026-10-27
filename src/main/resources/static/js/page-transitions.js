/* Page transitions: tapping is like touching the surface of water - the next
   page ripples out from the spot that was tapped. Loading screens leave with
   the same ripple from the centre of the screen (splashOut, below).

   Two layers make the ripple:
   - The new page is revealed through a radial mask whose radius (--vt-r)
     grows from the tap to the farthest corner. Its leading edge is a few soft
     alternating bands rather than a hard line, so the old page shimmers
     through the wavefront.
   - A ring overlay (#sgRipple) draws light crests at the wavefront and two
     fading echoes behind it. It is a real element with its own
     view-transition-name, so it renders above both snapshots, and it is
     removed when the transition ends.
   --vt-r is registered with @property so it can be animated; both layers run
   the same keyframes and stay in lock-step.

   Built on the View Transitions API, so it is pure progressive enhancement:
   - Between pages (landing -> hub -> play ...) the CSS opt-in
     `@view-transition { navigation: auto; }` lets the browser animate the
     change itself (Safari 18.2+, Chrome 126+). It has to be present on BOTH
     pages, which is why this file is loaded in the <head> of every page.
   - Inside the hub, screens are re-rendered in place, so home-redesign.js
     wraps that swap in SgTransition.run(), which uses
     document.startViewTransition.
   Browsers without the API, and players who ask for reduced motion, change
   pages exactly as before.

   The tap point travels to the next document through sessionStorage, because
   a cross-document transition is animated by the NEW page, which never saw
   the click. It is stored as a fraction of the viewport and only honoured for
   a few seconds, so a later back/forward ripples from the centre instead of a
   stale spot. Loaded synchronously in <head> so the variables and the opt-in
   exist before the first paint the transition captures.

   Turning it off:
   - For everyone: set ENABLED below to false. Pages then change instantly.
   - Per player: Settings > Motion > "Page transitions" (and "Reduced motion")
     in the hub, stored in localStorage `sgHubPrefs` beside the other hub
     switches. The hub calls SgTransition.refresh() when either is flipped. */
(function () {
  'use strict';
  var ENABLED = true;
  var PREFS_KEY = 'sgHubPrefs';
  var KEY = 'sgVtOrigin';
  var MAX_AGE_MS = 6000;
  var DURATION = '.8s';
  // Fast off the mark, long glide out - the way a ripple slows as it spreads.
  var EASE = 'cubic-bezier(.22,.61,.36,1)';
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function setOrigin(xFrac, yFrac) {
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    root.style.setProperty('--vt-x', (xFrac * 100).toFixed(2) + '%');
    root.style.setProperty('--vt-y', (yFrac * 100).toFixed(2) + '%');
    // The ripple ends once it has passed the farthest corner, plus the width of
    // its banded edge, so the new page is fully clear when it stops.
    var dx = Math.max(xFrac, 1 - xFrac) * w, dy = Math.max(yFrac, 1 - yFrac) * h;
    root.style.setProperty('--vt-max', Math.ceil(Math.sqrt(dx * dx + dy * dy) + 90) + 'px');
  }
  setOrigin(0.5, 0.5);

  // Arriving from another page: ripple from where the player tapped there.
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    sessionStorage.removeItem(KEY);
    if (saved && Date.now() - saved.t < MAX_AGE_MS) setOrigin(saved.x, saved.y);
  } catch (e) { /* storage blocked: the ripple starts from the centre */ }

  var AT = 'circle at var(--vt-x, 50%) var(--vt-y, 50%)';
  var R = 'var(--vt-r)';
  // Solid inside, then two dips in opacity before the edge: the wavefront.
  var MASK = 'radial-gradient(' + AT + ', #000 calc(' + R + ' - 78px),' +
    ' rgba(0,0,0,.5) calc(' + R + ' - 58px), #000 calc(' + R + ' - 40px),' +
    ' rgba(0,0,0,.28) calc(' + R + ' - 20px), rgba(0,0,0,.55) calc(' + R + ' - 9px), transparent ' + R + ')';
  function ring(scale, width, alpha, at) {
    var r = scale === 1 ? R : 'calc(' + R + ' * ' + scale + ')';
    return 'radial-gradient(' + (at || AT) + ', transparent calc(' + r + ' - ' + width + 'px),' +
      ' rgba(214,238,255,' + alpha + ') calc(' + r + ' - ' + (width * 0.45).toFixed(1) + 'px),' +
      ' rgba(255,255,255,' + Math.min(1, alpha * 1.4).toFixed(2) + ') calc(' + r + ' - ' + (width * 0.28).toFixed(1) + 'px),' +
      ' rgba(120,175,230,' + (alpha * 0.35).toFixed(2) + ') calc(' + r + ' - ' + (width * 0.1).toFixed(1) + 'px),' +
      ' transparent ' + r + ')';
  }
  var RINGS = [ring(1, 34, 0.34), ring(0.72, 22, 0.2), ring(0.46, 14, 0.12)].join(', ');

  // Loading screens leave the same way, but from the centre of the screen and
  // the other way round: the loader stays on top and the water clears it from
  // the middle outward, so the page beneath shows through the widening ring.
  // --sp-x/--sp-y are the screen's centre in the loader's own box (it is not
  // always full-screen), so the hole and the rings stay concentric.
  var SPLASH_AT = 'circle at var(--sp-x, 50%) var(--sp-y, 50%)';
  var SPLASH_MASK = 'radial-gradient(' + SPLASH_AT + ', transparent calc(' + R + ' - 78px),' +
    ' rgba(0,0,0,.5) calc(' + R + ' - 58px), transparent calc(' + R + ' - 40px),' +
    ' rgba(0,0,0,.72) calc(' + R + ' - 20px), rgba(0,0,0,.45) calc(' + R + ' - 9px), #000 ' + R + ')';
  var SPLASH_RINGS = [ring(1, 34, 0.34, 'circle at 50% 50%'), ring(0.72, 22, 0.2, 'circle at 50% 50%'),
    ring(0.46, 14, 0.12, 'circle at 50% 50%')].join(', ');
  var SPLASH_DURATION = '.9s';

  // The player's own switches, read fresh each time so a change in Settings
  // takes effect without a reload.
  function enabled() {
    if (!ENABLED) return false;
    if (reduce && reduce.matches) return false;
    try {
      var prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
      if (prefs.pageTransitions === false || prefs.reducedMotion === true) return false;
    } catch (e) { /* storage blocked: keep the default */ }
    return true;
  }

  var style = document.createElement('style');
  style.setAttribute('data-page-transitions', '');
  style.textContent =
    '@property --vt-r { syntax: "<length>"; inherits: true; initial-value: 0px; }' +
    '@view-transition { navigation: auto; }' +
    // The UA cross-fade blends the two snapshots with plus-lighter, which only
    // looks right when their opacities sum to 1. These don't, so blend normally.
    '::view-transition-old(root), ::view-transition-new(root) { mix-blend-mode: normal; }' +
    // The old page stays put under the spreading water, dimming slightly.
    '::view-transition-old(root) { animation: sgVtSink ' + DURATION + ' ease-out both; }' +
    '::view-transition-new(root) {' +
      ' transform-origin: var(--vt-x, 50%) var(--vt-y, 50%);' +
      ' -webkit-mask-image: ' + MASK + '; mask-image: ' + MASK + ';' +
      ' animation: sgVtRipple ' + DURATION + ' ' + EASE + ' both; }' +
    // The rings are drawn by the overlay element itself; its snapshot is live,
    // so the group needs no animation of its own.
    '::view-transition-group(sg-ripple), ::view-transition-new(sg-ripple), ::view-transition-old(sg-ripple) { animation: none; }' +
    '#sgRipple { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;' +
      ' view-transition-name: sg-ripple; background: ' + RINGS + ';' +
      ' animation: sgVtRings ' + DURATION + ' ' + EASE + ' both; }' +
    '@keyframes sgVtSink { to { filter: brightness(.82); transform: scale(.99); } }' +
    // A touch of surface lift as the water settles.
    '@keyframes sgVtRipple { from { --vt-r: 0px; transform: scale(1.03); } to { --vt-r: var(--vt-max); transform: scale(1); } }' +
    '@keyframes sgVtRings { from { --vt-r: 0px; opacity: 1; } 70% { opacity: .9; } to { --vt-r: var(--vt-max); opacity: 0; } }' +
    // z-index is forced: the hub's own chrome stacks above its boot screen's
    // usual 80 once the boot screen is lifted out of <body>.
    '.sg-splash-out { z-index: 2147483000 !important; pointer-events: none !important;' +
      ' -webkit-mask-image: ' + SPLASH_MASK + '; mask-image: ' + SPLASH_MASK + ';' +
      ' animation: sgSplashOut ' + SPLASH_DURATION + ' ' + EASE + ' both; }' +
    '.sg-splash-rings { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;' +
      ' background: ' + SPLASH_RINGS + '; animation: sgSplashRings ' + SPLASH_DURATION + ' ' + EASE + ' both; }' +
    '@keyframes sgSplashOut { from { --vt-r: 0px; } to { --vt-r: var(--sp-max); } }' +
    '@keyframes sgSplashRings { from { --vt-r: 0px; opacity: 1; } 70% { opacity: .9; } to { --vt-r: var(--sp-max); opacity: 0; } }' +
    '@media (prefers-reduced-motion: reduce) {' +
      ' ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }' +
      ' #sgRipple, .sg-splash-rings { display: none; } }';
  // Without the stylesheet there is no cross-page opt-in, so the browser
  // changes pages instantly; it is attached or detached to follow the switches.
  function refresh() {
    var on = enabled();
    if (on && !style.isConnected) (document.head || root).appendChild(style);
    if (!on && style.isConnected) style.parentNode.removeChild(style);
    return on;
  }
  refresh();

  function addRipple() {
    removeRipple();
    var el = document.createElement('div');
    el.id = 'sgRipple';
    el.setAttribute('aria-hidden', 'true');
    // On <html>, not <body>: the hub mounts into <body> and clears it on every
    // render, including its boot render mid-way through an arriving ripple.
    root.appendChild(el);
  }
  function removeRipple() {
    var el = document.getElementById('sgRipple');
    if (el) el.parentNode.removeChild(el);
  }

  /* Dissolves a loading screen from the centre of the screen outward. `el`
     must already be painted on top of the page (fixed); it is left in place
     and `done` runs once it is fully clear, which is where the caller hides or
     removes it. Returns false - having touched nothing - when the effect is
     off or the browser cannot animate the ripple's radius (no @property), so
     the caller falls back to its usual exit. Synchronous: the page beneath can
     be rendered and measured straight away. */
  function splashOut(el, done) {
    if (!el || !refresh() || !(window.CSS && CSS.registerProperty) || document.hidden) return false;
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    var box = el.getBoundingClientRect();
    var reach = Math.ceil(Math.sqrt(w * w + h * h) / 2 + 90) + 'px';
    el.style.setProperty('--sp-x', (w / 2 - box.left) + 'px');
    el.style.setProperty('--sp-y', (h / 2 - box.top) + 'px');
    el.style.setProperty('--sp-max', reach);
    var rings = document.createElement('div');
    rings.className = 'sg-splash-rings';
    rings.setAttribute('aria-hidden', 'true');
    rings.style.setProperty('--sp-max', reach);
    root.appendChild(rings);
    el.classList.add('sg-splash-out');
    var over = false;
    function finish() {
      if (over) return;
      over = true;
      clearTimeout(guard);
      el.removeEventListener('animationend', onEnd);
      if (rings.parentNode) rings.parentNode.removeChild(rings);
      el.classList.remove('sg-splash-out');
      if (done) done();
    }
    function onEnd(e) { if (e.target === el && e.animationName === 'sgSplashOut') finish(); }
    el.addEventListener('animationend', onEnd);
    // A backgrounded tab can hold animations; the loader must never stick.
    var guard = setTimeout(finish, 1800);
    return true;
  }

  // A page arriving through a cross-document transition adds its rings before
  // its first frame, which is when the browser captures the new state.
  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    // The previous page opted in, but this player has the effect off.
    if (!enabled()) { e.viewTransition.skipTransition(); return; }
    addRipple();
    e.viewTransition.finished.then(removeRipple, removeRipple);
  });

  // Every tap is remembered, not only taps on links: plenty of buttons here
  // navigate by assigning location.href after a request.
  function remember(e) {
    var x = e.clientX, y = e.clientY;
    // A keyboard "click" has no pointer position; use the control's centre.
    if (!e.detail && e.target && e.target.getBoundingClientRect) {
      var r = e.target.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + r.height / 2;
    }
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    var xf = Math.min(1, Math.max(0, x / w)), yf = Math.min(1, Math.max(0, y / h));
    setOrigin(xf, yf);
    try { sessionStorage.setItem(KEY, JSON.stringify({ x: xf, y: yf, t: Date.now() })); } catch (err) { /* ignore */ }
  }
  document.addEventListener('click', remember, true);

  window.SgTransition = {
    // Runs `update` (a synchronous DOM swap) inside a view transition when the
    // browser supports one. Always resolves after `update` has run, so callers
    // can chain work that needs the new DOM.
    run: function (update) {
      if (!document.startViewTransition || !refresh() || document.hidden) {
        update();
        return Promise.resolve();
      }
      var vt = document.startViewTransition(function () { update(); addRipple(); });
      vt.finished.then(removeRipple, removeRipple);
      return vt.updateCallbackDone;
    },
    splashOut: splashOut,
    enabled: enabled,
    refresh: refresh
  };
})();
