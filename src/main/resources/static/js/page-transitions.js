/* Page transitions: tapping a control sets off one of five elemental effects,
   picked at random (never the same twice running), that carry the old page
   away and bring the next one in from the spot that was tapped:

   - water: the next page ripples out in rings, its wavefront shimmering.
   - fire:  the old page burns away - a ragged, glowing edge with a scorched
            rim spreads from the tap and embers fly ahead of it.
   - ice:   the old page frosts over, then a sweep wipes the frost away to
            reveal the next page.
   - earth: cracks run out from the tap, then the page crumbles into rock
            chunks that fall away, nearest first.
   - wind:  a rolling dust front sweeps across the screen, the next page
            arriving in its wake.

   Loading screens leave the same way from the centre of the screen
   (splashOut, below).

   How it works: every effect is a View Transition. The new page's snapshot is
   revealed through an animated mask, the old page's snapshot gets a matching
   filter, and an overlay element (#sgFx, with its own view-transition-name so
   it draws above both snapshots) paints the effect itself: rings, flames,
   frost, falling rock, dust. Two registered custom properties drive them:
   --vt-r (a radius) and --vt-t (progress 0..1). Shapes that depend on the tap
   point and the screen (the fire's lumps, the rock cells, the dust bands) are
   generated per transition into one <style> (#sgVtFxCss). <html
   data-vt-fx="..."> selects the effect while it runs.

   Where it applies:
   - Between pages (landing -> hub -> play ...) the CSS opt-in
     `@view-transition { navigation: auto; }` lets the browser animate the
     change itself (Safari 18.2+, Chrome 126+). It has to be present on BOTH
     pages, which is why this file is loaded in the <head> of every page. The
     arriving page picks and paints the effect in `pagereveal`.
   - Inside the hub, screens are re-rendered in place, so home-redesign.js
     wraps that swap in SgTransition.run(), which uses
     document.startViewTransition.
   Browsers without the API, and players who ask for reduced motion, change
   pages exactly as before.

   The tap point travels to the next document through sessionStorage, because
   a cross-document transition is animated by the NEW page, which never saw
   the click. It is stored as a fraction of the viewport and only honoured for
   a few seconds, so a later back/forward starts from the centre instead of a
   stale spot. Loaded synchronously in <head> so the variables and the opt-in
   exist before the first paint the transition captures.

   Turning it off:
   - For everyone: set ENABLED below to false. Pages then change instantly.
   - Per player: Settings > Motion > "Page transitions" (and "Reduced motion")
     in the hub, stored in localStorage `sgHubPrefs` beside the other hub
     switches. The hub calls SgTransition.refresh() when either is flipped.
   - One effect only: list it in EFFECTS below, or for testing on one device,
     SgTransition.force('fire') (null to go back to random). */
(function () {
  'use strict';
  var ENABLED = true;
  var EFFECTS = ['water', 'fire', 'ice', 'earth', 'wind'];
  var PREFS_KEY = 'sgHubPrefs';
  var KEY = 'sgVtOrigin';
  var FX_LAST = 'sgVtLastFx';
  var FX_FORCE = 'sgVtFx';
  var MAX_AGE_MS = 6000;
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  // Where the effect starts, as fractions of the viewport.
  var ox = 0.5, oy = 0.5;

  function setOrigin(xFrac, yFrac) {
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    ox = xFrac; oy = yFrac;
    root.style.setProperty('--vt-x', (xFrac * 100).toFixed(2) + '%');
    root.style.setProperty('--vt-y', (yFrac * 100).toFixed(2) + '%');
    // A spreading effect ends once it has passed the farthest corner, plus the
    // width of its edge, so the new page is fully clear when it stops.
    var dx = Math.max(xFrac, 1 - xFrac) * w, dy = Math.max(yFrac, 1 - yFrac) * h;
    root.style.setProperty('--vt-max', Math.ceil(Math.sqrt(dx * dx + dy * dy) + 90) + 'px');
  }
  setOrigin(0.5, 0.5);

  // Arriving from another page: start where the player tapped there.
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    sessionStorage.removeItem(KEY);
    if (saved && Date.now() - saved.t < MAX_AGE_MS) setOrigin(saved.x, saved.y);
  } catch (e) { /* storage blocked: the effect starts from the centre */ }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function px(n) { return n.toFixed(1) + 'px'; }
  // Every mask is written prefixed and unprefixed: Safari before 15.4 only
  // reads -webkit-mask-*, and its composite keywords are the old ones.
  function mask(images, o) {
    o = o || {};
    var out = '-webkit-mask-image:' + images.join(',') + ';mask-image:' + images.join(',') + ';';
    if (o.size) out += '-webkit-mask-size:' + o.size.join(',') + ';mask-size:' + o.size.join(',') + ';';
    if (o.pos) out += '-webkit-mask-position:' + o.pos.join(',') + ';mask-position:' + o.pos.join(',') + ';';
    if (o.repeat) out += '-webkit-mask-repeat:' + o.repeat + ';mask-repeat:' + o.repeat + ';';
    if (o.intersect) out += '-webkit-mask-composite:source-in;mask-composite:intersect;';
    return out;
  }

  /* ---------- water ---------- */
  var AT = 'circle at var(--vt-x, 50%) var(--vt-y, 50%)';
  var R = 'var(--vt-r)';
  // Solid inside, then two dips in opacity before the edge: the wavefront.
  var WATER_MASK = 'radial-gradient(' + AT + ', #000 calc(' + R + ' - 78px),' +
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

  /* ---------- per-transition builders ----------
     Each returns the CSS for that one transition and fills the overlay. */
  var BUILD = {
    water: function () { return { css: '', fill: null }; },

    // The burnt hole is the union of a few circles whose centres drift outward
    // as it grows, so its edge is lumpy at every size. The overlay paints the
    // glowing edge and scorch for each circle, and is itself masked to the
    // outside of that union (an intersection of complements) so no circle's
    // edge shows inside another's hole.
    fire: function (w, h) {
      var cx = ox * w, cy = oy * h, n = 9, holes = [], edges = [], outside = [];
      for (var i = 0; i <= n; i++) {
        var a = i === n ? 0 : (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
        var off = i === n ? 0 : rand(0.1, 0.2), k = i === n ? 0.86 : rand(0.82, 0.92);
        var at = 'circle at calc(' + px(cx) + ' + ' + R + ' * ' + (Math.cos(a) * off).toFixed(3) + ') calc(' + px(cy) + ' + ' + R + ' * ' + (Math.sin(a) * off).toFixed(3) + ')';
        var r = 'calc(' + R + ' * ' + k.toFixed(3);
        holes.push('radial-gradient(' + at + ', #000 ' + r + ' - 6px), transparent ' + r + '))');
        outside.push('radial-gradient(' + at + ', transparent ' + r + ' - 14px), #000 ' + r + ' - 6px))');
        edges.push('radial-gradient(' + at + ', transparent ' + r + ' - 16px), rgba(255,170,60,.55) ' + r + ' - 10px),' +
          ' rgba(255,238,170,.98) ' + r + ' - 5px), rgba(255,96,20,.95) ' + r + ' - 1px), rgba(74,26,8,.85) ' + r + ' + 4px),' +
          ' rgba(28,12,6,.45) ' + r + ' + 20px), transparent ' + r + ' + 40px))');
      }
      return {
        css: 'html[data-vt-fx="fire"]::view-transition-new(root){' + mask(holes) + '}' +
          '#sgFx.is-fire{background:' + edges.join(',') + ';' + mask(outside, { intersect: true }) + '}',
        fill: function (el) {
          var dist = Math.sqrt(w * w + h * h);
          for (var j = 0; j < 22; j++) {
            var e = document.createElement('i'), t = rand(0, Math.PI * 2), d = rand(0.2, 0.55) * dist, s = rand(3, 7);
            e.className = 'sg-fx-ember';
            e.style.cssText = 'left:' + px(cx) + ';top:' + px(cy) + ';width:' + px(s) + ';height:' + px(s) +
              ';--dx:' + px(Math.cos(t) * d) + ';--dy:' + px(Math.sin(t) * d - rand(20, 90)) +
              ';animation-duration:' + rand(0.55, 0.95).toFixed(2) + 's;animation-delay:' + rand(0, 0.3).toFixed(2) + 's';
            el.appendChild(e);
          }
        }
      };
    },

    // Frost gathers over the old page, then a diagonal sweep from the tap's
    // side clears it. The new page and the frost share the sweep line.
    ice: function () {
      var ang = ox < 0.5 ? '112deg' : '248deg';
      var P = 'calc(var(--vt-t) * 130%';
      return {
        css: 'html[data-vt-fx="ice"]::view-transition-new(root){' +
            mask(['linear-gradient(' + ang + ', #000 ' + P + ' - 16%), transparent ' + P + ' - 2%))']) + '}' +
          '#sgFx.is-ice{' + mask(['linear-gradient(' + ang + ', transparent ' + P + ' - 4%), #000 ' + P + ' + 6%))']) + '}' +
          '#sgFx.is-ice::after{background:linear-gradient(' + ang + ', transparent ' + P + ' - 3%), rgba(255,255,255,.9) ' + P + ' + 1%), rgba(190,230,255,0) ' + P + ' + 5%))}',
        fill: null
      };
    },

    // The screen splits into rock-shaped cells that open nearest-first. Each
    // cell's mask grows from nothing to an overlapping rock; as it opens, a
    // stone shard drops from the same spot, and cracks run out from the tap
    // before any of it falls.
    earth: function (w, h) {
      // About 45 cells at most: every cell is a mask layer, redrawn each frame.
      var cell = Math.max(95, Math.sqrt(w * h / 44));
      var cols = Math.max(3, Math.min(10, Math.round(w / cell))), rows = Math.max(3, Math.min(10, Math.round(h / cell)));
      var cw = w / cols, ch = h / rows, cx = ox * w, cy = oy * h;
      var far = Math.sqrt(Math.pow(Math.max(cx, w - cx), 2) + Math.pow(Math.max(cy, h - cy), 2)) || 1;
      var imgs = [], sizes = [], poss = [], cells = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var mx = (c + 0.5) * cw + rand(-0.12, 0.12) * cw, my = (r + 0.5) * ch + rand(-0.12, 0.12) * ch;
          var d = Math.min(0.66, 0.05 + 0.55 * Math.sqrt(Math.pow(mx - cx, 2) + Math.pow(my - cy, 2)) / far + rand(0, 0.06));
          var bw = cw * 1.5, bh = ch * 1.5, shape = ROCKS[(r * cols + c) % ROCKS.length];
          var s = 'clamp(0, (var(--vt-t) - ' + d.toFixed(3) + ') * 6, 1)';
          imgs.push(rockImage(shape));
          sizes.push('calc(' + px(bw) + ' * ' + s + ') calc(' + px(bh) + ' * ' + s + ')');
          poss.push('calc(' + px(mx) + ' - ' + px(bw / 2) + ' * ' + s + ') calc(' + px(my) + ' - ' + px(bh / 2) + ' * ' + s + ')');
          cells.push({ x: mx, y: my, d: d, shape: shape });
        }
      }
      // Whatever slivers the rocks miss are covered in the last frames.
      imgs.push('linear-gradient(#000, #000)');
      sizes.push('calc(100% * clamp(0, (var(--vt-t) - .9) * 1000, 1)) 100%');
      poss.push('0 0');
      return {
        css: 'html[data-vt-fx="earth"]::view-transition-new(root){' + mask(imgs, { size: sizes, pos: poss, repeat: 'no-repeat' }) + '}',
        fill: function (el) {
          cells.forEach(function (cell) {
            var sh = document.createElement('i');
            sh.className = 'sg-fx-shard';
            sh.style.cssText = 'left:' + px(cell.x - cw * 0.55) + ';top:' + px(cell.y - ch * 0.55) + ';width:' + px(cw * 1.1) + ';height:' + px(ch * 1.1) +
              ';clip-path:polygon(' + cell.shape.map(function (p) { return p[0] + '% ' + p[1] + '%'; }).join(',') + ')' +
              ';--fall:' + px(h * rand(0.45, 0.7)) + ';--drift:' + px(rand(-40, 40)) + ';--spin:' + rand(-70, 70).toFixed(0) + 'deg' +
              ';animation-delay:' + (cell.d * EARTH_S).toFixed(3) + 's';
            el.appendChild(sh);
          });
          var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">';
          var len = Math.sqrt(w * w + h * h) * 0.38;
          for (var k = 0; k < 7; k++) {
            var a = (k / 7) * Math.PI * 2 + rand(-0.35, 0.35), x = cx, y = cy, pts = [px0(x, y)];
            for (var seg = 0; seg < 6; seg++) {
              a += rand(-0.5, 0.5);
              x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6;
              pts.push(px0(x, y));
            }
            svg += '<polyline pathLength="1" points="' + pts.join(' ') + '"/>';
          }
          var wrap = document.createElement('div');
          wrap.className = 'sg-fx-cracks';
          wrap.innerHTML = svg + '</svg>';
          el.appendChild(wrap);
        }
      };
    },

    // The new page arrives behind a wavy front: the screen is cut into bands,
    // each with its front a little ahead or behind, and a cloud of dust puffs
    // rolls along that front with wind streaks overtaking it.
    wind: function (w, h) {
      var ltr = ox < 0.5, ang = ltr ? '90deg' : '270deg', bands = 12, bh = h / bands, phase = rand(0, 6);
      var imgs = [], sizes = [], poss = [];
      for (var i = 0; i < bands; i++) {
        var off = (Math.sin(i * 0.9 + phase) * 7 + rand(-2, 2)).toFixed(1);
        var P = 'calc(var(--vt-t) * 150% - 20% + ' + off + '%)';
        imgs.push('linear-gradient(' + ang + ', #000 calc(' + P + ' - 20%), transparent ' + P + ')');
        sizes.push('100% ' + px(bh + 2));
        poss.push('0 ' + px(i * bh - 1));
      }
      return {
        css: 'html[data-vt-fx="wind"]::view-transition-new(root){' + mask(imgs, { size: sizes, pos: poss, repeat: 'no-repeat' }) + '}' +
          // The dust rides the front: 1.5t - .3 of the width from the side it starts on.
          '#sgFx.is-wind .sg-fx-dust{transform:translateX(calc(' + (ltr ? '' : '100vw - ') + '(1.5 * var(--vt-t) - .3) * 100vw - 50%))}',
        fill: function (el) {
          var dust = document.createElement('div');
          dust.className = 'sg-fx-dust';
          for (var j = 0; j < 16; j++) {
            var p = document.createElement('i'), s = rand(90, 230);
            p.style.cssText = 'top:' + rand(-8, 92).toFixed(1) + '%;left:' + rand(15, 70).toFixed(1) + '%;width:' + px(s) + ';height:' + px(s) +
              ';--spin:' + (ltr ? 1 : -1) * rand(180, 420) + 'deg;animation-delay:' + rand(-0.4, 0).toFixed(2) + 's';
            dust.appendChild(p);
          }
          el.appendChild(dust);
          for (var k = 0; k < 9; k++) {
            var st = document.createElement('i');
            st.className = 'sg-fx-streak';
            st.style.cssText = 'top:' + rand(4, 96).toFixed(1) + '%;width:' + rand(28, 60).toFixed(0) + 'vw;--from:' + (ltr ? '-60vw' : '110vw') +
              ';--to:' + (ltr ? '110vw' : '-60vw') + ';animation-delay:' + rand(0, 0.45).toFixed(2) + 's';
            el.appendChild(st);
          }
        }
      };
    }
  };
  function px0(x, y) { return x.toFixed(1) + ',' + y.toFixed(1); }
  // Rough rock outlines, as points in a 100x100 box.
  var ROCKS = [
    [[8, 22], [38, 4], [76, 10], [97, 38], [90, 78], [60, 97], [22, 92], [3, 60]],
    [[14, 6], [58, 2], [94, 24], [98, 64], [74, 96], [30, 98], [4, 72], [2, 30]],
    [[4, 14], [46, 8], [88, 2], [99, 46], [86, 90], [48, 99], [10, 86], [0, 48]]
  ];
  function rockImage(shape) {
    return 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\' preserveAspectRatio=\'none\'%3E%3Cpolygon points=\'' +
      shape.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '\'/%3E%3C/svg%3E")';
  }

  var EARTH_S = 1.15;
  // Frost grain: a static noise tile, so nothing is computed per frame.
  var FROST_NOISE = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'220\' height=\'220\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.85\' numOctaves=\'2\' seed=\'4\'/%3E%3CfeColorMatrix values=\'0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 -.32\'/%3E%3C/filter%3E%3Crect width=\'220\' height=\'220\' filter=\'url(%23n)\'/%3E%3C/svg%3E")';

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

  var FX = 'html[data-vt-fx="';
  var style = document.createElement('style');
  style.setAttribute('data-page-transitions', '');
  style.textContent =
    '@property --vt-r { syntax: "<length>"; inherits: true; initial-value: 0px; }' +
    '@property --vt-t { syntax: "<number>"; inherits: true; initial-value: 0; }' +
    '@view-transition { navigation: auto; }' +
    // The UA cross-fade blends the two snapshots with plus-lighter, which only
    // looks right when their opacities sum to 1. These don't, so blend normally.
    '::view-transition-old(root), ::view-transition-new(root) { mix-blend-mode: normal; }' +
    // The overlay paints itself; its snapshot is live, so its group needs no
    // animation of its own.
    '::view-transition-group(sg-fx), ::view-transition-new(sg-fx), ::view-transition-old(sg-fx) { animation: none; }' +
    '#sgFx { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; overflow: hidden; view-transition-name: sg-fx; }' +
    '#sgFx > i { position: absolute; display: block; }' +

    // water
    FX + 'water"]::view-transition-old(root) { animation: sgVtSink .8s ease-out both; }' +
    FX + 'water"]::view-transition-new(root) { transform-origin: var(--vt-x, 50%) var(--vt-y, 50%);' +
      mask([WATER_MASK]) + ' animation: sgVtRipple .8s cubic-bezier(.22,.61,.36,1) both; }' +
    '#sgFx.is-water { background: ' + RINGS + '; animation: sgVtRings .8s cubic-bezier(.22,.61,.36,1) both; }' +
    '@keyframes sgVtSink { to { filter: brightness(.82); transform: scale(.99); } }' +
    // A touch of surface lift as the water settles.
    '@keyframes sgVtRipple { from { --vt-r: 0px; transform: scale(1.03); } to { --vt-r: var(--vt-max); transform: scale(1); } }' +
    '@keyframes sgVtRings { from { --vt-r: 0px; opacity: 1; } 70% { opacity: .9; } to { --vt-r: var(--vt-max); opacity: 0; } }' +

    // fire
    FX + 'fire"]::view-transition-old(root) { animation: sgFxHeat 1s ease-in both; }' +
    FX + 'fire"]::view-transition-new(root) { animation: sgFxBurn 1s cubic-bezier(.45,.05,.35,1) both; }' +
    '#sgFx.is-fire { animation: sgFxBurn 1s cubic-bezier(.45,.05,.35,1) both, sgFxOut 1s linear both; }' +
    '.sg-fx-ember { border-radius: 50%; margin: -3px 0 0 -3px; background: radial-gradient(circle, #fff6c8 0 30%, #ffb43c 55%, rgba(255,90,20,0) 72%);' +
      ' box-shadow: 0 0 8px 2px rgba(255,140,40,.75); animation: sgFxEmber .8s ease-out both; }' +
    '@keyframes sgFxHeat { to { filter: sepia(.4) saturate(1.5) brightness(.9); } }' +
    '@keyframes sgFxBurn { from { --vt-r: 0px; } to { --vt-r: calc(var(--vt-max) * 1.2); } }' +
    '@keyframes sgFxOut { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }' +
    '@keyframes sgFxEmber { 0% { opacity: 0; transform: translate(0, 0) scale(.6); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1.1); } }' +

    // ice
    FX + 'ice"]::view-transition-old(root) { animation: sgFxFreeze 1.25s ease-out both; }' +
    FX + 'ice"]::view-transition-new(root) { animation: sgFxSweep 1.25s both; }' +
    '#sgFx.is-ice { animation: sgFxSweep 1.25s both, sgFxFrost 1.25s ease-out both;' +
      ' background: radial-gradient(ellipse at 50% 50%, rgba(220,240,255,.08) 25%, rgba(220,240,255,.5) 72%, rgba(240,250,255,.85) 100%),' +
      ' repeating-linear-gradient(62deg, rgba(255,255,255,0) 0 26px, rgba(255,255,255,.16) 26px 27px),' +
      ' repeating-linear-gradient(118deg, rgba(255,255,255,0) 0 34px, rgba(255,255,255,.12) 34px 35px),' +
      ' ' + FROST_NOISE + ', linear-gradient(rgba(200,230,255,.28), rgba(200,230,255,.28)); }' +
    '#sgFx.is-ice::after { content: ""; position: absolute; inset: 0; }' +
    '@keyframes sgFxFreeze { 0% { filter: none; } 42%, 100% { filter: saturate(.35) brightness(1.12) contrast(.9) blur(1.5px); } }' +
    '@keyframes sgFxSweep { 0%, 42% { --vt-t: 0; animation-timing-function: cubic-bezier(.5,.05,.3,1); } 100% { --vt-t: 1; } }' +
    '@keyframes sgFxFrost { 0% { opacity: 0; transform: scale(1.06); } 40% { opacity: 1; transform: scale(1); } 100% { opacity: 1; transform: scale(1); } }' +

    // earth
    FX + 'earth"]::view-transition-old(root) { animation: sgFxQuake ' + EARTH_S + 's linear both; }' +
    FX + 'earth"]::view-transition-new(root) { animation: sgFxT ' + EARTH_S + 's linear both; }' +
    '#sgFx.is-earth { animation: sgFxOut ' + EARTH_S + 's linear both; }' +
    '.sg-fx-shard { opacity: 0; background: radial-gradient(120% 90% at 28% 22%, #cdb48c 0, #9a7f5d 30%, #6b5440 62%, #3c2e21 100%),' +
      ' repeating-linear-gradient(35deg, rgba(0,0,0,0) 0 9px, rgba(0,0,0,.08) 9px 11px);' +
      ' animation: sgFxShard .62s cubic-bezier(.55,0,.9,.6) forwards; }' +
    '.sg-fx-cracks { position: absolute; inset: 0; animation: sgFxCrackFade ' + EARTH_S + 's linear both; }' +
    '.sg-fx-cracks svg { width: 100%; height: 100%; }' +
    '.sg-fx-cracks polyline { fill: none; stroke: rgba(40,26,14,.9); stroke-width: 4; stroke-linejoin: round;' +
      ' stroke-dasharray: 1; stroke-dashoffset: 1; filter: drop-shadow(0 0 1.5px rgba(255,230,190,.6)); animation: sgFxCrack .3s ease-out forwards; }' +
    '@keyframes sgFxT { from { --vt-t: 0; } to { --vt-t: 1; } }' +
    '@keyframes sgFxQuake { 0% { transform: none; } 6% { transform: translate(-4px, 2px); } 12% { transform: translate(4px, -2px); }' +
      ' 18% { transform: translate(-3px, -1px); } 24% { transform: translate(2px, 2px); } 30% { transform: none; filter: none; } 100% { filter: brightness(.7) sepia(.3); } }' +
    '@keyframes sgFxShard { 0% { opacity: 1; transform: translate(0, 0) rotate(0) scale(1); } 100% { opacity: 0; transform: translate(var(--drift), var(--fall)) rotate(var(--spin)) scale(.8); } }' +
    '@keyframes sgFxCrack { to { stroke-dashoffset: 0; } }' +
    '@keyframes sgFxCrackFade { 0%, 35% { opacity: 1; } 65%, 100% { opacity: 0; } }' +

    // wind
    FX + 'wind"]::view-transition-old(root) { animation: sgFxGust 1.05s ease-in both; }' +
    FX + 'wind"]::view-transition-new(root) { animation: sgFxT 1.05s cubic-bezier(.4,.1,.5,1) both; }' +
    '#sgFx.is-wind { animation: sgFxT 1.05s cubic-bezier(.4,.1,.5,1) both, sgFxOut 1.05s linear both; }' +
    '.sg-fx-dust { position: absolute; top: 0; left: 0; width: 70vw; height: 100%; }' +
    '.sg-fx-dust > i { position: absolute; display: block; border-radius: 50%; margin: -50px 0 0 -50px;' +
      ' background: radial-gradient(circle, rgba(226,208,172,.62) 0, rgba(204,184,148,.38) 38%, rgba(190,170,135,0) 70%);' +
      ' filter: blur(5px); animation: sgFxRoll 1.05s linear both; }' +
    '.sg-fx-streak { height: 2px; left: 0; border-radius: 2px; background: linear-gradient(90deg, rgba(255,250,235,0), rgba(255,250,235,.6), rgba(255,250,235,0));' +
      ' opacity: 0; animation: sgFxStreak .55s ease-in both; }' +
    '@keyframes sgFxGust { to { transform: translateX(calc(var(--vt-dir, 1) * 2%)); filter: blur(1.5px) brightness(.88) sepia(.2); } }' +
    '@keyframes sgFxRoll { from { transform: rotate(0) scale(.7); } to { transform: rotate(var(--spin)) scale(1.3); } }' +
    '@keyframes sgFxStreak { 0% { opacity: 0; transform: translateX(var(--from)); } 25% { opacity: 1; } 100% { opacity: 0; transform: translateX(var(--to)); } }' +

    // Loading screens on browsers without View Transitions: the water ripple,
    // dissolving the loader itself. z-index is forced: the hub's own chrome
    // stacks above its boot screen's usual 80 once the boot screen is lifted
    // out of <body>.
    '.sg-splash-out { z-index: 2147483000 !important; pointer-events: none !important;' + mask([SPLASH_MASK()]) +
      ' animation: sgSplashOut .9s cubic-bezier(.22,.61,.36,1) both; }' +
    '.sg-splash-rings { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;' +
      ' background: ' + [ring(1, 34, 0.34, 'circle at 50% 50%'), ring(0.72, 22, 0.2, 'circle at 50% 50%'), ring(0.46, 14, 0.12, 'circle at 50% 50%')].join(', ') + ';' +
      ' animation: sgSplashRings .9s cubic-bezier(.22,.61,.36,1) both; }' +
    '@keyframes sgSplashOut { from { --vt-r: 0px; } to { --vt-r: var(--sp-max); } }' +
    '@keyframes sgSplashRings { from { --vt-r: 0px; opacity: 1; } 70% { opacity: .9; } to { --vt-r: var(--sp-max); opacity: 0; } }' +

    '@media (prefers-reduced-motion: reduce) {' +
      ' ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }' +
      ' #sgFx, .sg-splash-rings { display: none; } }';

  function SPLASH_MASK() {
    var at = 'circle at var(--sp-x, 50%) var(--sp-y, 50%)';
    return 'radial-gradient(' + at + ', transparent calc(' + R + ' - 78px),' +
      ' rgba(0,0,0,.5) calc(' + R + ' - 58px), transparent calc(' + R + ' - 40px),' +
      ' rgba(0,0,0,.72) calc(' + R + ' - 20px), rgba(0,0,0,.45) calc(' + R + ' - 9px), #000 ' + R + ')';
  }

  // Without the stylesheet there is no cross-page opt-in, so the browser
  // changes pages instantly; it is attached or detached to follow the switches.
  function refresh() {
    var on = enabled();
    if (on && !style.isConnected) (document.head || root).appendChild(style);
    if (!on && style.isConnected) style.parentNode.removeChild(style);
    return on;
  }
  refresh();

  var fxCss = document.createElement('style');
  fxCss.id = 'sgVtFxCss';
  var current = null, gen = 0;

  function pickEffect() {
    try {
      var forced = localStorage.getItem(FX_FORCE);
      if (forced && EFFECTS.indexOf(forced) !== -1) return forced;
    } catch (e) { /* storage blocked: random */ }
    var last = '';
    try { last = sessionStorage.getItem(FX_LAST) || ''; } catch (e) { /* ignore */ }
    var pool = EFFECTS.length > 1 ? EFFECTS.filter(function (f) { return f !== last; }) : EFFECTS;
    var fx = pool[Math.floor(Math.random() * pool.length)];
    try { sessionStorage.setItem(FX_LAST, fx); } catch (e) { /* ignore */ }
    return fx;
  }

  // Chooses the effect for one transition and writes its styles. The overlay
  // is added separately (attach), inside the update or on pagereveal, so it
  // is only in the NEW state and never in the old snapshot.
  function prepare() {
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    var fx = pickEffect(), built = BUILD[fx](w, h);
    current = { fx: fx, fill: built.fill, gen: ++gen };
    fxCss.textContent = built.css;
    if (!fxCss.isConnected) (document.head || root).appendChild(fxCss);
    root.setAttribute('data-vt-fx', fx);
    root.style.setProperty('--vt-dir', ox < 0.5 ? '1' : '-1');
    return current;
  }
  function attach(run) {
    var old = document.getElementById('sgFx');
    if (old) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.id = 'sgFx';
    el.className = 'is-' + run.fx;
    el.setAttribute('aria-hidden', 'true');
    if (run.fill) run.fill(el);
    // On <html>, not <body>: the hub mounts into <body> and clears it on every
    // render, including its boot render mid-way through an arriving effect.
    root.appendChild(el);
  }
  // A newer transition may have started before an older one's promise settles;
  // only the latest one tidies up.
  function cleanup(run) {
    if (!current || current.gen !== run.gen) return;
    current = null;
    var el = document.getElementById('sgFx');
    if (el) el.parentNode.removeChild(el);
    root.removeAttribute('data-vt-fx');
    fxCss.textContent = '';
  }

  function run(update) {
    if (!document.startViewTransition || !refresh() || document.hidden) {
      update();
      return Promise.resolve();
    }
    var r = prepare();
    var vt = document.startViewTransition(function () { update(); attach(r); });
    var done = function () { cleanup(r); };
    vt.finished.then(done, done);
    // A transition is skipped (and `ready` rejects) when another is already
    // playing - say the hub finishes loading while the page's arrival effect
    // still runs. The update still happens; there is just nothing to animate.
    vt.ready.catch(function () { /* skipped */ });
    return vt.updateCallbackDone;
  }

  /* Takes a loading screen away with one of the effects, from the centre of
     the screen. `el` must already be painted on top of the page; `done` is
     where the caller hides or removes it, and runs as the transition swaps
     state. Returns false - having touched nothing - when the effect is off,
     so the caller falls back to its usual exit. Synchronous for the caller:
     the page beneath can be rendered and measured straight away, since the
     loader still covers it until the transition captures the old state. */
  function splashOut(el, done) {
    if (!el || !refresh() || document.hidden) return false;
    if (document.startViewTransition) {
      setOrigin(0.5, 0.5);
      run(function () { if (done) done(); });
      return true;
    }
    // No View Transitions: dissolve the loader itself with the water ripple.
    if (!(window.CSS && CSS.registerProperty)) return false;
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

  // A page arriving through a cross-document transition picks its effect and
  // adds the overlay before its first frame, which is when the browser
  // captures the new state.
  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    // The previous page opted in, but this player has the effect off.
    if (!enabled()) { e.viewTransition.skipTransition(); return; }
    var r = prepare();
    attach(r);
    var done = function () { cleanup(r); };
    e.viewTransition.finished.then(done, done);
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
    run: run,
    splashOut: splashOut,
    enabled: enabled,
    refresh: refresh,
    effects: EFFECTS.slice(),
    // Pins one effect on this device (testing); null returns to random.
    force: function (name) {
      try {
        if (name && EFFECTS.indexOf(name) !== -1) localStorage.setItem(FX_FORCE, name);
        else localStorage.removeItem(FX_FORCE);
      } catch (e) { /* ignore */ }
    }
  };
})();
