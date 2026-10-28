/* Page transitions: tapping a control sets off one of five elemental effects,
   picked at random (never the same twice running), that carry the old page
   away and bring the next one in from the spot that was tapped:

   - water: the next page ripples out in rings, its wavefront shimmering.
   - fire:  the old page burns away - a ragged, glowing edge with a scorched
            rim spreads from the tap and embers fly ahead of it.
   - ice:   the old page frosts over, then a sweep wipes the frost away to
            reveal the next page.
   - earth: the ground cracks into salt-flat plates from the tap and dries
            to a pale crust, then the plates give way, nearest first, with a
            puff of sand, and the next page shows from beneath.
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
  // Set for the rest of the session once a transition plays below LITE_FPS:
  // from then on only the water ripple (one mask layer) plays.
  var FX_LITE = 'sgVtLite';
  var LITE_FPS = 40;
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
      // Six circles: each one is three gradient layers repainted every frame.
      var cx = ox * w, cy = oy * h, n = 5, holes = [], edges = [], outside = [];
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
          for (var j = 0; j < 14; j++) {
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

    // Salt flat: the ground cracks into irregular plates (a Voronoi pattern,
    // the shape real dried salt and mud crack into), the cracks running out
    // from the tap while the old page dries to a pale crust. Then the plates
    // give way nearest-first, each one opening from its middle out to its own
    // cracks with a small puff of sand, and the new page shows from beneath.
    // Each plate is one mask layer - its own polygon, grown about its centroid.
    earth: function (w, h) {
      // About 20 plates at most: every plate is a mask layer, redrawn each frame.
      var size = Math.max(110, Math.sqrt(w * h / 20));
      var cols = Math.max(3, Math.min(6, Math.round(w / size))), rows = Math.max(3, Math.min(7, Math.round(h / size)));
      var cw = w / cols, ch = h / rows, cx = ox * w, cy = oy * h, sites = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          // Odd rows shift half a cell, so the plates come out hex-like, not square.
          sites.push([(c + 0.5 + (r % 2 ? 0.25 : -0.25) + rand(-0.22, 0.22)) * cw, (r + 0.5 + rand(-0.22, 0.22)) * ch]);
        }
      }
      var far = Math.sqrt(Math.pow(Math.max(cx, w - cx), 2) + Math.pow(Math.max(cy, h - cy), 2)) || 1;
      var imgs = [], sizes = [], poss = [], plates = [];
      sites.forEach(function (site, k) {
        var poly = voronoiCell(site, sites, k, w, h);
        if (poly.length < 3) return;
        var g = centroid(poly), bx = Infinity, by = Infinity, bx2 = -Infinity, by2 = -Infinity;
        poly.forEach(function (p) { bx = Math.min(bx, p[0]); by = Math.min(by, p[1]); bx2 = Math.max(bx2, p[0]); by2 = Math.max(by2, p[1]); });
        var dist = Math.sqrt(Math.pow(g[0] - cx, 2) + Math.pow(g[1] - cy, 2)) / far;
        var d = Math.min(0.76, 0.3 + 0.44 * dist + rand(0, 0.04));
        var s = 'clamp(0, (var(--vt-t) - ' + d.toFixed(3) + ') * 4.5, 1)';
        // The polygon is drawn with a stroke, so neighbouring plates overlap a
        // hair and no seam shows once they have all opened.
        imgs.push(polyImage(poly, bx - 3, by - 3, bx2 - bx + 6, by2 - by + 6));
        sizes.push('calc(' + px(bx2 - bx + 6) + ' * ' + s + ') calc(' + px(by2 - by + 6) + ' * ' + s + ')');
        poss.push('calc(' + px(g[0]) + ' + ' + px(bx - 3 - g[0]) + ' * ' + s + ') calc(' + px(g[1]) + ' + ' + px(by - 3 - g[1]) + ' * ' + s + ')');
        plates.push({ poly: poly, g: g, d: d, crack: 0.04 + 0.26 * dist });
      });
      // Whatever slivers remain are covered in the last frames.
      imgs.push('linear-gradient(#000, #000)');
      sizes.push('calc(100% * clamp(0, (var(--vt-t) - .97) * 1000, 1)) 100%');
      poss.push('0 0');
      return {
        css: 'html[data-vt-fx="earth"]::view-transition-new(root){' + mask(imgs, { size: sizes, pos: poss, repeat: 'no-repeat' }) + '}',
        fill: function (el) {
          var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">';
          plates.forEach(function (pl) {
            // Each plate's rim is drawn as a slightly wavering line, starting as
            // the crack front from the tap reaches it.
            var pts = [];
            pl.poly.forEach(function (p, i) {
              var q = pl.poly[(i + 1) % pl.poly.length], ex = q[0] - p[0], ey = q[1] - p[1], L = Math.sqrt(ex * ex + ey * ey) || 1;
              pts.push(px0(p[0], p[1]));
              for (var f = 1; f < 3; f++) {
                var wob = rand(-2.2, 2.2);
                pts.push(px0(p[0] + ex * f / 3 - ey / L * wob, p[1] + ey * f / 3 + ex / L * wob));
              }
            });
            var at = ' points="' + pts.join(' ') + '" style="animation-delay:' + (pl.crack * EARTH_S).toFixed(3) + 's"/>';
            // A wide faint stroke under the seam is its glow; drop-shadow
            // filters on a redrawn SVG cost a full repaint every frame.
            svg += '<polygon class="is-glow" pathLength="1"' + at + '<polygon pathLength="1"' + at;
          });
          var wrap = document.createElement('div');
          wrap.className = 'sg-fx-cracks';
          wrap.innerHTML = svg + '</svg>';
          el.appendChild(wrap);
          plates.forEach(function (pl) {
            var puff = document.createElement('i'), sz = Math.min(cw, ch) * rand(0.7, 1);
            puff.className = 'sg-fx-sand';
            puff.style.cssText = 'left:' + px(pl.g[0] - sz / 2) + ';top:' + px(pl.g[1] - sz / 2) + ';width:' + px(sz) + ';height:' + px(sz) +
              ';--rise:' + px(-rand(10, 28)) + ';animation-delay:' + (pl.d * EARTH_S).toFixed(3) + 's';
            el.appendChild(puff);
          });
        }
      };
    },

    // The new page arrives behind a wavy front: the screen is cut into bands,
    // each with its front a little ahead or behind, and a cloud of dust puffs
    // rolls along that front with wind streaks overtaking it.
    wind: function (w, h) {
      var ltr = ox < 0.5, ang = ltr ? '90deg' : '270deg', bands = 8, bh = h / bands, phase = rand(0, 6);
      var imgs = [], sizes = [], poss = [];
      for (var i = 0; i < bands; i++) {
        var off = (Math.sin(i * 1.3 + phase) * 7 + rand(-2, 2)).toFixed(1);
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
          for (var j = 0; j < 10; j++) {
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
  // The plate around `site`: the viewport, cut by the perpendicular bisector
  // with every other site (Sutherland-Hodgman against each half-plane).
  function voronoiCell(site, sites, self, w, h) {
    var poly = [[0, 0], [w, 0], [w, h], [0, h]];
    for (var i = 0; i < sites.length && poly.length; i++) {
      if (i === self) continue;
      var o = sites[i], mx = (site[0] + o[0]) / 2, my = (site[1] + o[1]) / 2, nx = o[0] - site[0], ny = o[1] - site[1];
      // Sites far away cannot cut this plate; skipping them keeps it cheap.
      if (nx * nx + ny * ny > 9 * (w * h / sites.length)) continue;
      var inside = function (p) { return (p[0] - mx) * nx + (p[1] - my) * ny <= 0; }, out = [];
      for (var k = 0; k < poly.length; k++) {
        var a = poly[k], b = poly[(k + 1) % poly.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) {
          var da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny, t = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      poly = out;
    }
    return poly;
  }
  function centroid(poly) {
    var x = 0, y = 0;
    poly.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / poly.length, y / poly.length];
  }
  function polyImage(poly, x, y, bw, bh) {
    var pts = poly.map(function (p) { return (p[0] - x).toFixed(1) + ',' + (p[1] - y).toFixed(1); }).join(' ');
    return 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 ' + bw.toFixed(1) + ' ' + bh.toFixed(1) +
      '\' preserveAspectRatio=\'none\'%3E%3Cpolygon points=\'' + pts + '\' stroke=\'%23000\' stroke-width=\'3\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")';
  }

  var EARTH_S = 1.4;
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
    // The gradient is the glow: a box-shadow per ember cost a repaint each frame.
    '.sg-fx-ember { border-radius: 50%; margin: -6px 0 0 -6px; padding: 3px; box-sizing: content-box;' +
      ' background: radial-gradient(circle, #fff6c8 0 18%, #ffb43c 38%, rgba(255,140,40,.45) 58%, rgba(255,90,20,0) 72%);' +
      ' animation: sgFxEmber .8s ease-out both; }' +
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
    // No blur: re-blurring a whole-screen snapshot every frame stalled phones.
    '@keyframes sgFxFreeze { 0% { filter: none; } 42%, 100% { filter: saturate(.35) brightness(1.12) contrast(.9); } }' +
    '@keyframes sgFxSweep { 0%, 42% { --vt-t: 0; animation-timing-function: cubic-bezier(.5,.05,.3,1); } 100% { --vt-t: 1; } }' +
    '@keyframes sgFxFrost { 0% { opacity: 0; transform: scale(1.06); } 40% { opacity: 1; transform: scale(1); } 100% { opacity: 1; transform: scale(1); } }' +

    // earth (salt flat)
    FX + 'earth"]::view-transition-old(root) { animation: sgFxSalt ' + EARTH_S + 's ease-out both; }' +
    FX + 'earth"]::view-transition-new(root) { animation: sgFxT ' + EARTH_S + 's linear both; }' +
    '#sgFx.is-earth { animation: sgFxOut ' + EARTH_S + 's linear both; }' +
    // The cracks are light from the page itself, not paint on top of it: the
    // overlay's snapshot colour-dodges onto the snapshots beneath, so each seam
    // brightens whatever colour it crosses - sky stays blue, embers gold.
    FX + 'earth"]::view-transition-group(sg-fx) { mix-blend-mode: color-dodge; }' +
    '.sg-fx-cracks { position: absolute; inset: 0; animation: sgFxCrackFade ' + EARTH_S + 's linear both; }' +
    '.sg-fx-cracks svg { width: 100%; height: 100%; overflow: visible; }' +
    // Seams of light. Neutral grey, not white: under colour-dodge a mid grey
    // lifts the page's own colours along the seam instead of burning to white.
    '.sg-fx-cracks polygon { fill: none; stroke: rgb(170,170,170); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round;' +
      ' stroke-dasharray: 1; stroke-dashoffset: 1; animation: sgFxCrack .4s ease-out forwards; }' +
    '.sg-fx-cracks polygon.is-glow { stroke: rgba(120,120,120,.45); stroke-width: 9; }' +
    '.sg-fx-sand { opacity: 0; border-radius: 50%; background: radial-gradient(circle, rgba(140,140,140,.7) 0, rgba(110,110,110,.4) 38%, rgba(110,110,110,0) 70%);' +
      ' animation: sgFxSand .5s ease-out forwards; }' +
    '@keyframes sgFxT { from { --vt-t: 0; } to { --vt-t: 1; } }' +
    // The old page dries out to a pale, salty crust before it gives way.
    '@keyframes sgFxSalt { 0% { filter: none; } 30%, 100% { filter: sepia(.32) saturate(.45) brightness(1.2) contrast(.86); } }' +
    '@keyframes sgFxCrack { to { stroke-dashoffset: 0; } }' +
    '@keyframes sgFxCrackFade { 0%, 70% { opacity: 1; } 100% { opacity: 0; } }' +
    '@keyframes sgFxSand { 0% { opacity: 0; transform: translateY(0) scale(.5); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(var(--rise)) scale(1.3); } }' +

    // wind
    FX + 'wind"]::view-transition-old(root) { animation: sgFxGust 1.05s ease-in both; }' +
    FX + 'wind"]::view-transition-new(root) { animation: sgFxT 1.05s cubic-bezier(.4,.1,.5,1) both; }' +
    '#sgFx.is-wind { animation: sgFxT 1.05s cubic-bezier(.4,.1,.5,1) both, sgFxOut 1.05s linear both; }' +
    '.sg-fx-dust { position: absolute; top: 0; left: 0; width: 70vw; height: 100%; }' +
    '.sg-fx-dust > i { position: absolute; display: block; border-radius: 50%; margin: -50px 0 0 -50px;' +
      ' background: radial-gradient(circle, rgba(226,208,172,.58) 0, rgba(204,184,148,.34) 34%, rgba(190,170,135,.12) 54%, rgba(190,170,135,0) 70%);' +
      ' animation: sgFxRoll 1.05s linear both; }' +
    '.sg-fx-streak { height: 2px; left: 0; border-radius: 2px; background: linear-gradient(90deg, rgba(255,250,235,0), rgba(255,250,235,.6), rgba(255,250,235,0));' +
      ' opacity: 0; animation: sgFxStreak .55s ease-in both; }' +
    '@keyframes sgFxGust { to { transform: translateX(calc(var(--vt-dir, 1) * 2%)); filter: brightness(.88) sepia(.2); } }' +
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
    try { if (sessionStorage.getItem(FX_LITE)) return 'water'; } catch (e) { /* ignore */ }
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
  // Counts frames while an effect plays. A device that can't hold LITE_FPS
  // drops to the water ripple for the session instead of stuttering through
  // the heavier effects on every navigation.
  function watchFrames(run) {
    if (run.fx === 'water' || !window.requestAnimationFrame || !window.performance) return function () {};
    var frames = 0, start = performance.now(), live = true;
    (function tick() { if (!live) return; frames++; requestAnimationFrame(tick); })();
    return function () {
      live = false;
      var secs = (performance.now() - start) / 1000;
      // Too short to judge: a skipped or interrupted transition.
      if (secs < 0.5) return;
      if (frames / secs < LITE_FPS) {
        try { sessionStorage.setItem(FX_LITE, '1'); } catch (e) { /* ignore */ }
      }
    };
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
    var judge = watchFrames(r);
    var done = function () { judge(); cleanup(r); };
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
    var judge = watchFrames(r);
    var done = function () { judge(); cleanup(r); };
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
