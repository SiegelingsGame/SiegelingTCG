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

  function sync() {
    var h = vv ? Math.round(vv.height) : Math.round(window.innerHeight);
    // A height this small is a transient mid-rotation or mid-keyboard reading,
    // never a real viewport; writing it would collapse the shell.
    if (h > 240) root.style.setProperty('--sg-vh', h + 'px');
  }

  sync();

  if (vv) {
    vv.addEventListener('resize', sync);
    // Scrolling the visual viewport (toolbar collapse on iOS) changes the visible
    // height without firing resize on some versions.
    vv.addEventListener('scroll', sync);
  }
  window.addEventListener('resize', sync);
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

  window.SiegelingsViewportUnit = { sync: sync };
})();
