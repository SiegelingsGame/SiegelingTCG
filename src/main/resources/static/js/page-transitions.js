/* Page transitions: the next page swells in from the spot that was tapped,
   with the same motion as Home's shortcut sheets (sgSheetIn in
   home-redesign.css): a scale-up from the button with a slight overshoot and
   a blur that clears as it lands. Keep the two in step.

   Built on the View Transitions API, so it is pure progressive enhancement:
   - Between pages (landing -> hub -> play ...) the CSS opt-in
     `@view-transition { navigation: auto; }` lets the browser cross-fade the
     two documents itself (Safari 18.2+, Chrome 126+). It has to be present on
     BOTH pages, which is why this file is loaded in the <head> of every page.
   - Inside the hub, screens are re-rendered in place, so home-redesign.js
     wraps that swap in SgTransition.run(), which uses
     document.startViewTransition.
   Browsers without the API navigate exactly as before.

   The tap point travels to the next document through sessionStorage, because
   a cross-document transition is animated by the NEW page, which never saw
   the click. It is stored as a fraction of the viewport and only honoured for
   a few seconds, so a later back/forward lands centred instead of at a stale
   spot. Loaded synchronously in <head> so the variables and the opt-in exist
   before the first paint the transition captures. */
(function () {
  'use strict';
  var KEY = 'sgVtOrigin';
  var MAX_AGE_MS = 6000;
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function setOrigin(xFrac, yFrac) {
    root.style.setProperty('--vt-x', (xFrac * 100).toFixed(2) + '%');
    root.style.setProperty('--vt-y', (yFrac * 100).toFixed(2) + '%');
  }

  // Arriving from another page: start the reveal where the player tapped there.
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    sessionStorage.removeItem(KEY);
    if (saved && Date.now() - saved.t < MAX_AGE_MS) setOrigin(saved.x, saved.y);
  } catch (e) { /* storage blocked: the reveal starts from the centre */ }

  var style = document.createElement('style');
  style.setAttribute('data-page-transitions', '');
  style.textContent =
    '@view-transition { navigation: auto; }' +
    // The UA cross-fade blends the two snapshots with plus-lighter, which only
    // looks right when their opacities sum to 1. These don't, so blend normally.
    '::view-transition-old(root), ::view-transition-new(root) { mix-blend-mode: normal; }' +
    '::view-transition-old(root) { animation: sgVtOld .34s cubic-bezier(.4,0,.8,.4) both; }' +
    '::view-transition-new(root) {' +
      ' transform-origin: var(--vt-x, 50%) var(--vt-y, 50%);' +
      ' animation: sgVtNew .5s cubic-bezier(.2,.9,.25,1.12) both; }' +
    // The old page recedes and dims a little, like the art behind a sheet.
    '@keyframes sgVtOld { to { opacity: 0; transform: scale(.97); filter: brightness(.7); } }' +
    '@keyframes sgVtNew {' +
      ' 0% { opacity: 0; transform: scale(.38); filter: blur(10px); }' +
      ' 55% { opacity: 1; filter: blur(0); }' +
      ' 100% { opacity: 1; transform: scale(1); filter: blur(0); } }' +
    '@media (prefers-reduced-motion: reduce) {' +
      ' ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; } }';
  (document.head || root).appendChild(style);

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
      if (!document.startViewTransition || (reduce && reduce.matches) || document.hidden) {
        update();
        return Promise.resolve();
      }
      var vt = document.startViewTransition(update);
      return vt.updateCallbackDone;
    }
  };
})();
