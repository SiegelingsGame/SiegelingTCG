/* One CSS custom property, --sg-vh, holding the height the player can actually see.
 *
 * Every fixed, single-screen shell in this app sizes off it rather than off a raw
 * 100dvh or 100%. Both of those measure the LAYOUT viewport:
 *   - `height:100%` resolves against the initial containing block, which on iOS is
 *     the small viewport (toolbars showing). Once Safari hides the toolbar the
 *     glass grows but the box does not, and the bottom bar strands well above the
 *     bottom of the screen with dead space beneath it - which is exactly what the
 *     hub was doing.
 *   - `100dvh` is better but still the layout viewport: it does not shrink when
 *     the page is zoomed and it lags a rotation on iOS.
 * The visual viewport is what the player sees, so that is what shells measure.
 *
 * Siege already solved this for itself with --siege-vh inside adventure.js; this
 * is the same logic, extracted so the hub, the battle table and the Keep share it.
 * The 100dvh fallback in every consumer means a browser without visualViewport
 * (or a page where this script fails to load) still renders correctly.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var vv = window.visualViewport;

  function isStandalone() {
    return window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  // An installed web app with viewport-fit=cover owns the whole glass, but iOS
  // can launch (or resume) it with every viewport measure - innerHeight,
  // visualViewport, dvh - short of the screen, and not correct itself. Every
  // shell then stops above a dead band at the bottom. When the app is running
  // standalone and full-width (so not an iPad window or split view), the screen
  // itself is the true height. The correction is bounded so a keyboard, which
  // legitimately takes ~300px, is never mistaken for the bug.
  var MAX_STANDALONE_SHORTFALL = 200;
  function fullScreenHeight() {
    if (!isStandalone() || !window.screen) return 0;
    var sw = window.screen.width;
    var sh = window.screen.height;
    if (!sw || !sh) return 0;
    var landscape = window.innerWidth > window.innerHeight;
    var fullWidth = landscape ? Math.max(sw, sh) : Math.min(sw, sh);
    if (Math.abs(window.innerWidth - fullWidth) > 2) return 0;
    return landscape ? Math.min(sw, sh) : Math.max(sw, sh);
  }

  function sync() {
    var h = vv ? Math.round(vv.height) : Math.round(window.innerHeight);
    var full = fullScreenHeight();
    if (full > h && full - h <= MAX_STANDALONE_SHORTFALL) h = full;
    // A height this small is a transient mid-rotation or mid-keyboard reading,
    // never a real viewport; writing it would collapse the shell.
    if (h > 240) root.style.setProperty('--sg-vh', h + 'px');
    pinScroll();
  }

  // The pages that load this are single screens: html/body are overflow:hidden
  // and only inner regions scroll. iOS can still leave the DOCUMENT scrolled
  // (restoring a position at launch, or after the shell grows past the layout
  // viewport), which lifts the whole app - the top controls slide up under the
  // status-bar scrim and read as faded, and a band opens at the bottom. The
  // player can never scroll the document back, so it is held at 0. A focused
  // text field is left alone: iOS scrolls the document to keep it above the
  // keyboard, and it is put back on blur.
  function isSingleScreen() {
    var cs = window.getComputedStyle ? window.getComputedStyle(root) : null;
    var bs = document.body && window.getComputedStyle ? window.getComputedStyle(document.body) : null;
    return (cs && cs.overflowY === 'hidden') || (bs && bs.overflowY === 'hidden');
  }
  function editingText() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  function pinScroll() {
    var scroller = document.scrollingElement || root;
    if (!scroller || (!scroller.scrollTop && !window.scrollY)) return;
    if (editingText() || !isSingleScreen()) return;
    window.scrollTo(0, 0);
    scroller.scrollTop = 0;
  }

  // Lets CSS key standalone-only offsets off a class too, for engines that do
  // not implement the display-mode media query.
  if (isStandalone()) root.classList.add('sg-standalone');

  sync();

  if (vv) {
    vv.addEventListener('resize', sync);
    // Scrolling the visual viewport (toolbar collapse on iOS) changes the visible
    // height without firing resize on some versions.
    vv.addEventListener('scroll', sync);
  }
  window.addEventListener('resize', sync);
  window.addEventListener('scroll', pinScroll, { passive: true });
  document.addEventListener('focusout', function () { setTimeout(pinScroll, 60); });
  window.addEventListener('orientationchange', function () {
    // iOS reports the post-rotation size a beat late; one settled re-read beats
    // trusting the value that arrives with the event.
    setTimeout(sync, 260);
  });
  // Returning from the background (or from a match) can restore a different
  // toolbar state than the one the page was measured under.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) setTimeout(sync, 60);
  });
  // A launch from the home screen settles its viewport over the first second or
  // so, and not always with a resize event; re-read on a short schedule.
  function settle() {
    [60, 250, 700, 1500].forEach(function (ms) { setTimeout(sync, ms); });
  }
  window.addEventListener('pageshow', settle);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', settle);
  } else {
    settle();
  }

  window.SiegelingsViewportUnit = { sync: sync };
})();
