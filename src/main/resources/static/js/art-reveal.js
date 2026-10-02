/* Reveal framed cards only once their creature art is ready.

   A binder card is the painted frame and scenery, with the Siegeling itself
   composited on top from a separate remote image. Painted as soon as the markup
   landed, the frame showed first and the creature popped in a moment later - or
   seconds later on a phone connection. Surfaces that draw a card once (the
   binder, the landing roster) now mark its wrapper `sg-art-pending`: the card
   stays invisible until its art has loaded (or definitively failed), then rises
   in whole, in reading order with any cards that landed alongside it. Art that
   is already cached is revealed before the first paint, with no fade at all.

   Battle re-renders are deliberately not opted in: they rebuild the board many
   times per match and keep their art warm with preloading instead, so a fade
   there would read as flicker.

   Safety: a CSS animation reveals any card still pending 8s after its art was
   requested, so a lost load event can never leave a card invisible. Callers
   add the class only when this script is present (window.SieglingsArtReveal), so a page that does not
   load it renders exactly as before. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.SieglingsArtReveal) return;

  var PENDING = 'sg-art-pending';
  var FADE = 'sg-art-reveal';

  var style = document.createElement('style');
  style.textContent =
    '.' + PENDING + '{opacity:0}' +
    // The failsafe clock starts once the art is actually requested: a card whose
    // image is still deferred (data-src, landing marquee) has nothing to time
    // out yet, and neither does lazy art, which the browser only fetches once it
    // is on screen - expiring first would show exactly the empty frame this
    // script exists to hide. Its own rule, so a browser without :has() only
    // loses the failsafe.
    '.' + PENDING + ':not(:has(img[data-src], .card-art img[loading="lazy"])){animation:sg-art-failsafe .3s ease 8s forwards}' +
    '.' + FADE + '{animation:sg-art-fade .42s cubic-bezier(.2,.8,.2,1) both}' +
    '@keyframes sg-art-fade{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}' +
    '@keyframes sg-art-failsafe{to{opacity:1}}' +
    '@media (prefers-reduced-motion:reduce){.' + FADE + '{animation:none}}';
  (document.head || document.documentElement).appendChild(style);

  // The creature image a pending card waits for. Notch and element icons inside
  // the same card are small and shared, so they never gate the reveal.
  function artOf(card) {
    return card.querySelector('.card-art img');
  }

  function reveal(card, fade) {
    if (!card.classList.contains(PENDING)) return;
    card.classList.remove(PENDING);
    if (!fade) return;
    card.classList.add(FADE);
    card.addEventListener('animationend', function done(event) {
      if (event.target !== card) return;
      card.classList.remove(FADE);
      card.removeEventListener('animationend', done);
    });
  }

  // A failed thumbnail with an untried original is about to retry with it
  // (sgWebpFallback / sgArtThumbFallback run after this capture listener).
  function awaitingFallback(img) {
    var fallback = img.getAttribute('data-img-fallback');
    return Boolean(fallback) && img.getAttribute('src') !== fallback;
  }

  /* Cards whose art lands together are revealed in reading order, a beat
     apart, so a grid fills as a quick cascade instead of tiles blinking on in
     whatever order the network finished them. The beat shrinks as the queue
     grows, so even a full screen of tiles is out within ~0.4s. */
  var queue = [];
  var flushTimer = 0;

  function flush() {
    flushTimer = 0;
    queue = queue.filter(function (card) { return card.isConnected && card.classList.contains(PENDING); });
    if (!queue.length) return;
    queue.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    reveal(queue.shift(), true);
    if (queue.length) flushTimer = setTimeout(flush, Math.max(16, Math.min(45, 400 / queue.length)));
  }

  function settle(img, failed) {
    var card = img.closest('.' + PENDING);
    if (!card || artOf(card) !== img) return;
    if (failed && awaitingFallback(img)) return;
    if (queue.indexOf(card) < 0) queue.push(card);
    if (!flushTimer) flushTimer = setTimeout(flush, 0);
  }

  // load/error do not bubble, but they do pass through the capture phase, so one
  // pair of listeners covers every card however its markup was inserted.
  document.addEventListener('load', function (event) {
    if (event.target && event.target.tagName === 'IMG') settle(event.target, false);
  }, true);
  document.addEventListener('error', function (event) {
    if (event.target && event.target.tagName === 'IMG') settle(event.target, true);
  }, true);

  /* Cards whose art is already in memory are revealed here, in the mutation
     microtask before the first paint, so cached art never fades. This also
     catches an image that finished loading before its markup was attached,
     whose load event the document never saw. */
  function sweep(root) {
    if (!root || root.nodeType !== 1) return;
    var cards = root.classList.contains(PENDING) ? [root] : [];
    var nested = root.querySelectorAll('.' + PENDING);
    for (var i = 0; i < nested.length; i++) cards.push(nested[i]);
    cards.forEach(function (card) {
      var img = artOf(card);
      if (!img) {
        reveal(card, false);
      } else if (img.complete && img.naturalWidth > 0) {
        reveal(card, false);
      } else if (img.complete && img.getAttribute('src') && !awaitingFallback(img)) {
        reveal(card, false);   // already broken, nothing more is coming
      }
    });
  }

  new MutationObserver(function (records) {
    for (var r = 0; r < records.length; r++) {
      var added = records[r].addedNodes;
      for (var n = 0; n < added.length; n++) sweep(added[n]);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.SieglingsArtReveal = { PENDING: PENDING, sweep: sweep };
})();
