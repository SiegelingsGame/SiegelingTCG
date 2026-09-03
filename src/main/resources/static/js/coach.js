/* Tutorial coach — the shared spotlight overlay.
 *
 * A ring around the thing you should touch, and a tip card that explains it.
 * Both tutorials use it: Siege drives a simulated expedition, Arena follows a
 * real server match, but the guiding is identical, so it lives once here rather
 * than being copied and left to drift. Every placement rule this file carries
 * was paid for by a bug report — the safe area, the buried close control, the
 * hint sitting on the hand — and a second copy would rediscover all of them.
 *
 * A step is:
 *   { id, kicker, title, body, hint, target, highlight, avoid,
 *     until, next, route, skipIf, finish, finale, altLabel }
 * `altLabel` adds a second foot button on a finale (e.g. Advanced Tutorial);
 * the caller handles it via `onAlt`.
 * `highlight` names everything else the player may touch on this step; the
 * spotlight lifts the union, because the dim reads as "disabled". `nodim`
 * drops the shade altogether, for a step that hands the whole screen back.
 * `recommend` marks ONE element as the suggested choice — needed precisely
 * because lifting the union makes the spotlight too broad to single anything
 * out, and a step can both keep every option available and still advise.
 * `until` makes the step wait on the player: the full tip renders, "Got it"
 * collapses it to a one-line hint so the play area is clear, and the step
 * advances itself the moment `until()` comes true.
 * `body` and `hint` may be functions, evaluated at render time, so a tip can
 * name what the player is actually looking at rather than a guess baked in
 * when the script was built.
 *
 * ES5-flavoured (var, function statements, IIFE) to match its two callers.
 */
(function () {
  'use strict';

  var ACTIVE = false;
  var cfg = null;
  var STEPS = null;
  var idx = -1;
  var shown = 0;         // steps actually rendered, for the "Step N of T" counter
  var collapsed = false; // a read tip shrinks to a one-line hint so the play area is clear
  var total = 0;
  var visited = null;    // step ids the coach has actually rendered, for fork routing

  var layer = null, ringEl = null, cardEl = null, safeProbe = null;
  var raf = 0, lastRect = '', renderedKey = '';

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function buildLayer() {
    layer = el('div', 'tut-layer');
    ringEl = el('div', 'tut-ring');
    cardEl = el('div', 'tut-card');
    safeProbe = el('div', 'tut-safe');
    layer.appendChild(ringEl);
    layer.appendChild(cardEl);
    layer.appendChild(safeProbe);
    document.body.appendChild(layer);
    cardEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      if (btn.classList.contains('tut-next')) {
        if (btn.getAttribute('data-detour')) {
          if (cfg.onDetourContinue) cfg.onDetourContinue();
          return;
        }
        var cur = current();
        if (cur && cur.until && !detour()) {
          // Read it — now get out of the way and let them play.
          collapsed = true;
          lastRect = '';
          renderStep();
          return;
        }
        advance();
      } else if (btn.classList.contains('tut-alt')) {
        if (cfg && cfg.onAlt) cfg.onAlt(current());
      } else if (btn.classList.contains('tut-skip')) advance();
      else if (btn.classList.contains('tut-quit')) stop();
    });
  }

  function current() { return (STEPS && STEPS[idx]) || null; }

  function indexOfId(id) {
    for (var i = 0; i < STEPS.length; i++) { if (STEPS[i].id === id) return i; }
    return -1;
  }

  /**
   * Move to the next step. A step names its successor with `next` (a branch lane
   * rejoining the trunk), otherwise the script runs in order; `route` steps
   * render nothing and hand straight on to whichever id they resolve to, which
   * is what lets one script follow either lane of a fork.
   */
  function advance() {
    var cur = current();
    var target = null;
    if (cur && cur.next) target = typeof cur.next === 'function' ? cur.next() : cur.next;
    idx = target ? indexOfId(target) : idx + 1;

    var guard = 0;
    while (idx >= 0 && idx < STEPS.length && guard++ < 60) {
      var s = STEPS[idx];
      if (s.skipIf && s.skipIf()) { idx++; continue; }
      if (s.route) {
        var j = indexOfId(s.route());
        if (j < 0) { idx++; continue; }
        idx = j;
        continue;
      }
      break;
    }
    if (idx < 0 || idx >= STEPS.length) { stop(); return; }
    if (STEPS[idx].id) visited[STEPS[idx].id] = true;
    collapsed = false;
    shown++;
    lastRect = '';
    renderedKey = idx + (detour() ? '|detour' : '|step');
    renderStep();
  }

  /** A modal the caller says is interrupting the script — point at its way out
   *  rather than at a button that is no longer reachable. */
  function detour() {
    return cfg && cfg.detour ? (cfg.detour() || null) : null;
  }

  /** A step's copy may be a string or a function of live state. Resolved at
   *  render time — which also means a rotation re-render picks up any change. */
  function text(v) {
    if (typeof v !== 'function') return v;
    try { return v(); } catch (e) { return ''; }
  }

  function renderStep() {
    var det = detour();
    var s = det || current();
    if (!s) return;
    var waits = !!s.until && !det;
    // A free-play step ("carry on until you win") has no one control to point
    // at, and shading the board it is inviting you to use is the same
    // misleading grey-out as a dimmed choice. Drop the shade for those.
    if (layer) layer.classList.toggle('tut-nodim', !!s.nodim);

    // Second stage: the player has read the tip and now needs the screen. The
    // card shrinks to a single line naming the tap, so it can sit clear of the
    // hand, the board or whatever the step is actually about.
    if (waits && collapsed) {
      cardEl.className = 'tut-card is-hint';
      cardEl.dataset.step = s.title;
      // Stable identity alongside the title, which is copy and gets reworded.
      cardEl.dataset.stepId = s.id || '';
      cardEl.innerHTML =
        '<span class="tut-hint">' + (text(s.hint) || esc(s.title)) + '</span>' +
        '<button class="tut-skip" type="button" title="Skip this step">Skip &#9656;</button>';
      position();
      return;
    }

    // EVERY tip carries a button. A step that waits on an action still advances
    // itself when the player performs it, but they must never be able to end up
    // with a card on screen and no way past it — which is exactly what happened
    // when a tall overlay put its own close control behind this card.
    cardEl.className = 'tut-card' + (s.finale ? ' is-finale' : '');
    cardEl.dataset.step = s.title;
    cardEl.dataset.stepId = s.id || '';
    var label = s.finish ? 'Finish' : 'Got it ▸';
    cardEl.innerHTML =
      '<div class="tut-head">' +
        '<span class="tut-kicker">' + esc(s.kicker || ('Step ' + shown + ' of ' + total)) + '</span>' +
        '<button class="tut-quit" type="button" aria-label="Exit tutorial">✕</button>' +
      '</div>' +
      '<h3 class="tut-title">' + esc(s.title) + '</h3>' +
      '<p class="tut-body">' + text(s.body) + '</p>' +
      (s.finale ? '<div class="tut-reward" id="tutReward">Claiming your first-time reward…</div>' : '') +
      '<div class="tut-foot">' +
        (waits ? '<span class="tut-wait">Waiting for you</span>' : '') +
        (s.altLabel && !det && !waits
          ? '<button class="tut-alt" type="button">' + esc(s.altLabel) + '</button>'
          : '') +
        // On a detour the button dismisses the popup it is describing, rather
        // than advancing a step the player has not reached the end of.
        '<button class="tut-next" type="button"' + (det ? ' data-detour="1"' : '') + '>' + label + '</button>' +
      '</div>';
    position();
    applyRecommendation(s);
    if (s.finale && cfg.onFinale) cfg.onFinale(document.getElementById('tutReward'), position);
  }

  /** A step's target may be a selector, or a function returning one — the
   *  Arena needs the latter, because the cells it points at only exist once a
   *  card is selected and it must fall back to the grid until then. */
  var recommended = null;

  /** Marks the step's suggested choice, so a broad spotlight can still advise.
   *  Exactly one element carries the class at a time, and it is always cleared
   *  when the step changes or the coach stops. */
  function applyRecommendation(s) {
    var sel = s && s.recommend;
    if (typeof sel === 'function') { try { sel = sel(); } catch (e) { sel = null; } }
    var node = null;
    if (sel) { try { node = document.querySelector(sel); } catch (e) { node = null; } }
    if (node === recommended) return;
    if (recommended) recommended.classList.remove('tut-pick');
    recommended = node;
    if (recommended) recommended.classList.add('tut-pick');
  }

  function targetNode(s) {
    if (!s || !s.target) return null;
    var sel = typeof s.target === 'function' ? s.target() : s.target;
    if (!sel) return null;
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function rectOfNode(n) {
    if (!n || !n.getClientRects || !n.getClientRects().length) return null;
    var r = n.getBoundingClientRect();
    return (r.width || r.height) ? r : null;
  }

  /**
   * The rect the spotlight lifts out of the dim. A step may name `highlight`
   * selectors alongside its target, and the hole becomes the union of them all.
   *
   * This matters because the dim reads as "disabled": the mulligan ringed only
   * its Keep/Redraw buttons, so the cards above — which you tap to choose what
   * to redraw — sat under the shade and looked greyed out. Anything the player
   * may touch on this step has to be inside the light. Selectors are matched
   * with querySelectorAll, so "every legal cell" and "every reachable node" are
   * one entry, not one per element.
   */
  function spotlightRect(s) {
    var rects = [];
    var first = rectOfNode(targetNode(s));
    if (first) rects.push(first);
    var extra = s && s.highlight;
    if (typeof extra === 'function') { try { extra = extra(); } catch (e) { extra = null; } }
    if (extra) {
      (typeof extra === 'string' ? [extra] : extra).forEach(function (sel) {
        var nodes = [];
        try { nodes = document.querySelectorAll(sel); } catch (e) { return; }
        for (var i = 0; i < nodes.length; i++) {
          var r = rectOfNode(nodes[i]);
          if (r) rects.push(r);
        }
      });
    }
    if (!rects.length) return null;
    var top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    rects.forEach(function (r) {
      if (r.top < top) top = r.top;
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
      if (r.bottom > bottom) bottom = r.bottom;
    });
    return { top: top, left: left, right: right, bottom: bottom,
             width: right - left, height: bottom - top };
  }

  /**
   * The safe area the phone actually leaves us, measured rather than assumed:
   * a hidden probe carries the env() insets as padding, so the tip card clears
   * the notch and the home indicator instead of tucking its Got it button
   * underneath them.
   */
  function safeInsets() {
    if (!safeProbe) return { top: 0, bottom: 0 };
    var cs = window.getComputedStyle(safeProbe);
    return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  }

  function position() {
    var s = detour() || current();
    var vh = window.innerHeight, vw = window.innerWidth;
    var safe = safeInsets();
    var gap = 14;
    // The card's real height. An earlier cut clamped against a hard-coded
    // 150px guess, so every card taller than that hung off the bottom edge.
    var h = cardEl.offsetHeight || 160;
    var minTop = safe.top + 10;
    var maxTop = vh - safe.bottom - h - 10;
    if (maxTop < minTop) maxTop = minTop;   // card taller than the viewport: pin it high
    function place(top) {
      cardEl.style.bottom = 'auto';
      cardEl.style.top = Math.round(Math.max(minTop, Math.min(maxTop, top))) + 'px';
    }

    var r = spotlightRect(s);
    if (!r || (!r.width && !r.height)) {
      // Nothing to point at: the opening and closing tips, or a step whose
      // control is briefly off screen (the action bar during battle playback).
      // Centre it — but a *collapsed* hint centred on a short landscape screen
      // lands squarely on the hand, so let the play areas move it if they must.
      ringEl.classList.add('off');
      var mid = (vh - h) / 2;
      var free = collapsed ? playAreas() : [];
      if (!free.length) { place(mid); return; }
      var candidates = [mid, minTop, maxTop];
      var pick = mid, pickCost = Infinity;
      for (var m = 0; m < candidates.length; m++) {
        var cTop = Math.max(minTop, Math.min(maxTop, candidates[m]));
        var cost = 0;
        for (var q = 0; q < free.length; q++) {
          var o = Math.min(cTop + h, free[q].bottom) - Math.max(cTop, free[q].top);
          if (o > 0) cost += o;
        }
        if (cost < pickCost) { pickCost = cost; pick = cTop; }
      }
      place(pick);
      return;
    }
    var pad = 8;
    ringEl.classList.remove('off');
    ringEl.style.left = Math.max(2, r.left - pad) + 'px';
    ringEl.style.top = Math.max(2, r.top - pad) + 'px';
    ringEl.style.width = Math.min(vw - 4, r.width + pad * 2) + 'px';
    ringEl.style.height = Math.min(vh - 4, r.height + pad * 2) + 'px';

    // Sit on whichever side of the highlight the card actually fits. When
    // neither side has room — a target as tall as the board — the card has to
    // overlap it, and then WHICH side matters: an overlay carries its close
    // button at the top, so hugging the top buried the only control that could
    // dismiss it. A step names that control with `avoid` and the card takes the
    // first placement that clears it.
    var below = (vh - safe.bottom) - r.bottom;
    var above = r.top - safe.top;
    var roomier = below >= above;
    var options = [];
    if (below >= h + gap) options.push(r.bottom + gap);
    if (above >= h + gap) options.push(r.top - gap - h);
    options.push(roomier ? maxTop : minTop);
    options.push(roomier ? minTop : maxTop);

    var keepClear = s && s.avoid ? rectOf(s.avoid) : null;
    // Once collapsed the hint is small enough to fit somewhere that leaves the
    // hand, the board or the shop grid completely alone — so try for that
    // first. A tip the player has already read must not cost them a card they
    // cannot reach, or a cell they cannot drop onto.
    var playRects = collapsed ? playAreas() : [];

    function fits(top, rects) {
      for (var k = 0; k < rects.length; k++) {
        var r2 = rects[k];
        if (r2 && Math.min(top + h, r2.bottom) - Math.max(top, r2.top) > 8) return false;
      }
      return true;
    }
    var avoidList = keepClear ? [keepClear] : [];
    // One strict pass: a placement that clears the step's `avoid` control AND
    // every play region wins outright.
    var strict = avoidList.concat(playRects);
    for (var i = 0; i < options.length; i++) {
      var top = Math.max(minTop, Math.min(maxTop, options[i]));
      if (fits(top, strict)) { place(top); return; }
    }
    // Nothing clears everything — a short landscape screen, or a board lighting
    // up cells in several rows at once. Score every candidate instead of taking
    // the first that merely clears `avoid`: that shortcut always chose the slot
    // directly above the target, which for a bottom-docked button is exactly on
    // top of the hand. `avoid` still dominates, so a close control is never
    // buried to save a few pixels of hand.
    var best = options[0], bestCost = Infinity;
    for (var j = 0; j < options.length; j++) {
      var t = Math.max(minTop, Math.min(maxTop, options[j]));
      var cost = overlap(t, avoidList) * 1000 + overlap(t, playRects);
      if (cost < bestCost) { bestCost = cost; best = t; }
    }
    place(best);

    function overlap(top, rects) {
      var sum = 0;
      for (var k = 0; k < rects.length; k++) {
        var r2 = rects[k];
        if (!r2) continue;
        var o = Math.min(top + h, r2.bottom) - Math.max(top, r2.top);
        if (o > 0) sum += o;
      }
      return sum;
    }
  }

  /** The regions a player touches to actually play, which a read hint must clear. */
  function playAreas() {
    var out = [];
    (cfg.playAreas || []).forEach(function (sel) {
      var nodes = [];
      // querySelectorAll, not querySelector: the Arena names the *lit cells*
      // rather than the whole grid, because a 3x3 board fills a phone and
      // demanding the hint clear all of it leaves nowhere for it to go.
      try { nodes = document.querySelectorAll(sel); } catch (e) { return; }
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        // getClientRects, not offsetParent: offsetParent is null for a
        // position:fixed element, and the Arena's action bar and hand fan are
        // both fixed on a phone — testing offsetParent called them invisible
        // and let the hint sit straight on top of End Turn.
        if (!n || !n.getClientRects || !n.getClientRects().length) continue;
        var r = n.getBoundingClientRect();
        if (r.height > 40) out.push(r);
      }
    });
    return out;
  }

  /** Rect of a selector, or null — used for the control a card must not cover. */
  function rectOf(sel) {
    var n = null;
    try { n = document.querySelector(sel); } catch (e) { return null; }
    if (!n || !n.getBoundingClientRect) return null;
    var r = n.getBoundingClientRect();
    return (r.width || r.height) ? r : null;
  }

  function tick() {
    if (!ACTIVE) return;
    raf = window.requestAnimationFrame(tick);
    var s = current();
    if (!s) return;
    if (s.until && !detour()) {
      var done = false;
      try { done = !!s.until(); } catch (e) { done = false; }
      if (done) { advance(); return; }
    }
    // Cheap re-layout: only touch the DOM when the copy or the target moved.
    var det = detour();
    var key = idx + (det ? '|detour' : '|step');
    if (key !== renderedKey) { renderedKey = key; renderStep(); return; }
    // Watch the whole spotlight, not just the target: a step highlighting the
    // legal cells has to re-light when the set of lit cells changes.
    var r = spotlightRect(det || s);
    var rect = r ? [r.left, r.top, r.width, r.height].join(',') : 'none';
    if (rect !== lastRect) { lastRect = rect; position(); }
    applyRecommendation(det || s);
  }

  // ---- rotation -----------------------------------------------------------

  var viewportTimer = 0;

  /**
   * A rotation invalidates everything the placement was measured from: the
   * safe-area insets swap, the card's own width changes with the landscape
   * media query (so its height does too), the play areas move, and in Siege the
   * map is re-drawn on a transposed axis entirely.
   *
   * The rAF tick alone is not enough. It repositions only when the spotlight
   * RECT STRING changes, which silently misses the case where it reads 'none'
   * both before and after — a target that exists in only one layout, like the
   * Arena's desktop-only #btnEndTurn — leaving the card parked where the old
   * orientation put it. So a viewport change forces a full re-render.
   *
   * Debounced past adventure.js's own 150ms map re-render, because resize fires
   * in bursts through a rotation and the ring has to land on the transposed
   * nodes rather than on their old geometry.
   */
  function onViewportChange() {
    if (!ACTIVE) return;
    if (viewportTimer) clearTimeout(viewportTimer);
    viewportTimer = setTimeout(function () {
      viewportTimer = 0;
      if (!ACTIVE) return;
      lastRect = '';
      renderStep();
      // Re-measure once more on the next frame: the card's height is only
      // final after the new width has reflowed its copy.
      window.requestAnimationFrame(function () { if (ACTIVE) position(); });
    }, 220);
  }

  var VIEWPORT_EVENTS = ['resize', 'orientationchange'];

  function watchViewport(on) {
    var fn = on ? 'addEventListener' : 'removeEventListener';
    VIEWPORT_EVENTS.forEach(function (ev) { window[fn](ev, onViewportChange); });
    // iOS reports a rotation on visualViewport before window.resize settles.
    if (window.visualViewport) window.visualViewport[fn]('resize', onViewportChange);
  }

  // ---- lifecycle ----------------------------------------------------------

  /**
   * @param options {steps, playAreas, detour, onDetourContinue, onFinale, onAlt,
   *                 onStop, bodyClass}
   */
  function start(options) {
    if (ACTIVE) return;
    cfg = options || {};
    STEPS = cfg.steps || [];
    if (!STEPS.length) { cfg = null; return; }
    ACTIVE = true;
    visited = {};
    total = STEPS.filter(function (s) { return !s.route; }).length;
    idx = -1;
    shown = 0;
    collapsed = false;
    lastRect = '';
    renderedKey = '';
    if (!layer) buildLayer();
    layer.classList.remove('hidden');
    if (cfg.bodyClass) document.body.classList.add(cfg.bodyClass);
    advance();
    watchViewport(true);
    raf = window.requestAnimationFrame(tick);
  }

  /**
   * Swap in a new chapter without tearing the overlay down — used when the
   * Arena finale offers an Advanced Tutorial and the same match keeps going.
   */
  function continueWith(newSteps, patch) {
    if (!ACTIVE) {
      var opts = patch || {};
      opts.steps = newSteps || [];
      start(opts);
      return;
    }
    if (patch) {
      Object.keys(patch).forEach(function (k) {
        if (k === 'steps') return;
        cfg[k] = patch[k];
      });
    }
    STEPS = newSteps || [];
    if (!STEPS.length) { stop(); return; }
    total = STEPS.filter(function (s) { return !s.route; }).length;
    idx = -1;
    shown = 0;
    collapsed = false;
    visited = {};
    lastRect = '';
    renderedKey = '';
    advance();
  }

  function stop() {
    if (!ACTIVE) return;
    ACTIVE = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    watchViewport(false);
    if (viewportTimer) { clearTimeout(viewportTimer); viewportTimer = 0; }
    if (recommended) { recommended.classList.remove('tut-pick'); recommended = null; }
    if (layer) layer.classList.add('hidden');
    var done = cfg;
    if (done && done.bodyClass) document.body.classList.remove(done.bodyClass);
    cfg = null;
    STEPS = null;
    if (done && done.onStop) done.onStop();
  }

  window.TutorialCoach = {
    start: start,
    stop: stop,
    continueWith: continueWith,
    active: function () { return ACTIVE; },
    /** Which step ids have actually been shown — fork routing keys off this. */
    visited: function () { return visited || {}; }
  };
})();
