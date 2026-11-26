/*
 * PixelForge core — procedural pixel-art VFX + cutscene generator.
 *
 * Inspired by Pixel Composer's model (generate -> colorize -> filter -> compose -> export),
 * but expressed as plain JSON specs so the same file renders identically in the browser
 * editor, in Node build scripts, and (later) in a Godot port.
 *
 * Pure module: no DOM, no canvas, no Math.random. Every random choice goes through the
 * seeded RNG so a spec + seed always produces the same pixels on every machine.
 *
 *   PixelForge.render(spec, {assets}) -> { w, h, n, fps, loop, frames:[Uint8ClampedArray RGBA], meta }
 *   PixelForge.sheet(result, cols?)    -> { w, h, cols, rows, data }
 *   PixelForge.metaJson(result, name, sheet) -> Aseprite-compatible JSON (+ "pf" block)
 *   PixelForge.encodeGIF(result, {scale}) -> Uint8Array
 *
 * Spec shape (see README.md for the full reference):
 *   { w, h, frames, fps, loop, seed, pivot:[x,y], shake, layers:[{type, ...params}], post:[...] }
 * Any numeric param may be animated: a number, {from,to,ease,start,end}, or {keys:[[t,v]...],ease}.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PixelForge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0';
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  // ── math / rng ────────────────────────────────────────────────────────────
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // Value noise is deliberately blocky-friendly: at pixel-art resolutions Perlin's extra
  // smoothness is invisible, and value noise is trivial to reproduce in GDScript.
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, s, oct) {
    var sum = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < (oct || 3); i++) { sum += amp * vnoise(x * f, y * f, s + i * 17); norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  }

  var EASE = {
    linear: function (t) { return t; },
    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inExpo: function (t) { return t <= 0 ? 0 : Math.pow(2, 10 * t - 10); },
    outBack: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: function (t) { return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * TAU / 3) + 1; },
    pulse: function (t) { return Math.sin(t * Math.PI); },
    flicker: function (t) { return 0.5 + 0.5 * Math.sin(t * 40) * Math.sin(t * 13); },
    step: function (t) { return t < 1 ? 0 : 1; }
  };

  // Resolve an animatable parameter at local time t (0..1).
  function P(v, t) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseFloat(v) || 0;
    if (Array.isArray(v)) v = { keys: v };
    var ease = EASE[v.ease] || EASE.linear;
    if (v.keys) {
      var k = v.keys;
      if (!k.length) return 0;
      if (t <= k[0][0]) return k[0][1];
      for (var i = 1; i < k.length; i++) {
        if (t <= k[i][0]) {
          var u = (t - k[i - 1][0]) / Math.max(1e-6, k[i][0] - k[i - 1][0]);
          return lerp(k[i - 1][1], k[i][1], ease(u));
        }
      }
      return k[k.length - 1][1];
    }
    var s = v.start == null ? 0 : v.start, e = v.end == null ? 1 : v.end;
    var u2 = clamp((t - s) / Math.max(1e-6, e - s), 0, 1);
    return lerp(v.from == null ? 0 : v.from, v.to == null ? 0 : v.to, ease(u2));
  }

  // ── colour ────────────────────────────────────────────────────────────────
  function hex(c) {
    if (Array.isArray(c)) return c;
    c = String(c || '#000').replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c.slice(0, 6), 16);
    var a = c.length >= 8 ? parseInt(c.slice(6, 8), 16) : 255;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  function toHex(c) { return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1); }

  // Element ramps run dark -> bright. Hues mirror the SiegelingTCG --element CSS palette so
  // effects generated here sit naturally on every project's UI.
  var RAMPS = {
    fire: ['#3b0d0d', '#8a1c12', '#d8431b', '#ff7b22', '#ffc23d', '#fff4b0'],
    ice: ['#0d2140', '#1d4f8a', '#3e8fd1', '#76e6ff', '#c6f6ff', '#ffffff'],
    water: ['#0a1a3d', '#123f8c', '#3296ff', '#6cc0ff', '#bfe8ff'],
    electric: ['#2a1a4a', '#6b4cff', '#a99cff', '#ffe63c', '#fff9c4', '#ffffff'],
    wind: ['#13402e', '#2f8a5e', '#5fd39a', '#96ffb4', '#e2ffe9'],
    earth: ['#2b1c10', '#5c3d20', '#8a6236', '#b48c50', '#e0c48c'],
    poison: ['#1d1030', '#4b2a6b', '#4f8a2a', '#7ecb4d', '#c9f58a'],
    shadow: ['#0b0614', '#2a0f45', '#4d1f7a', '#7832b4', '#b77ae6'],
    light: ['#5a3d12', '#b08423', '#ffd25a', '#ffe59a', '#fffbe6', '#ffffff'],
    psychic: ['#2a0f3d', '#6b2a8a', '#b05cd6', '#c896ff', '#f0dcff'],
    metal: ['#1e232a', '#4a5563', '#7b8794', '#a0aab4', '#e6ecf2', '#ffffff'],
    undead: ['#120f18', '#3a2f4a', '#5e4f73', '#8c78a0', '#c6f0d0'],
    arcane: ['#140a3a', '#3a1f9e', '#6c4cff', '#3be8ff', '#d8fbff'],
    blood: ['#1a0508', '#5c0a14', '#a8162a', '#e0394a', '#ff9aa0'],
    heal: ['#0f3a1e', '#1f7a3e', '#4fd16e', '#a8ff9a', '#f2fff0'],
    gold: ['#3d2405', '#8a5a0e', '#d69a1e', '#ffd34d', '#fff3c2'],
    smoke: ['#1a1a22', '#3a3a46', '#5e5e6c', '#8a8a96', '#b4b4bc'],
    mono: ['#111111', '#555555', '#aaaaaa', '#ffffff'],
    white: ['#ffffff'],
    ink: ['#08060c'],
    hero: ['#ff3d7f', '#ff7aa8', '#ffd1e0', '#ffffff'],
    sky: ['#0d0f1a', '#1b1f36', '#2f3561', '#3be8ff']
  };
  // Whole-image palettes for the `palette` post pass: snapping every project's effects to a
  // shared palette is what makes them read as one "set".
  var PALETTES = {
    pico8: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    db16: ['#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346524', '#d04648', '#757161', '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6'],
    sieglings: ['#0b0614', '#1b1f36', '#ff501e', '#ffc23d', '#b48c50', '#96ffb4', '#3296ff', '#76e6ff', '#7832b4', '#ffe63c', '#a0aab4', '#8c78a0', '#c896ff', '#7ecb4d', '#ffe59a', '#ffffff']
  };
  function ramp(r) {
    var list = Array.isArray(r) ? r : (RAMPS[r] || RAMPS.fire);
    return list.map(hex);
  }

  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(x, y) { return BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5 + 1 / 32; }

  // ── field primitives (intensity buffers, 0..1+) ──────────────────────────
  function Field(w, h) { this.w = w; this.h = h; this.d = new Float32Array(w * h); }
  Field.prototype.put = function (x, y, v, add) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    var i = y * this.w + x;
    if (add) this.d[i] += v; else if (v > this.d[i]) this.d[i] = v;
  };
  // Disc with a hardness curve: hard=1 is a crisp pixel disc, hard=0 a cone falloff.
  Field.prototype.disc = function (cx, cy, r, v, hard, add) {
    if (r <= 0 || v <= 0) return;
    if (r < 0.75) { this.put(Math.round(cx - 0.5), Math.round(cy - 0.5), v, add); return; }
    hard = hard == null ? 0.6 : hard;
    var x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy) / r;
      if (d > 1) continue;
      var f = d <= hard ? 1 : 1 - (d - hard) / Math.max(1e-6, 1 - hard);
      this.put(x, y, v * f, add);
    }
  };
  Field.prototype.line = function (x0, y0, x1, y1, r0, r1, v0, v1, hard) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(len / 0.5));
    for (var i = 0; i <= steps; i++) {
      var u = i / steps;
      this.disc(x0 + dx * u, y0 + dy * u, lerp(r0, r1, u), lerp(v0, v1 == null ? v0 : v1, u), hard);
    }
  };
  Field.prototype.poly = function (pts, v) {
    var minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, i, j;
    for (i = 0; i < pts.length; i++) { minX = Math.min(minX, pts[i][0]); maxX = Math.max(maxX, pts[i][0]); minY = Math.min(minY, pts[i][1]); maxY = Math.max(maxY, pts[i][1]); }
    for (var y = Math.floor(minY); y <= Math.ceil(maxY); y++) for (var x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      var px = x + 0.5, py = y + 0.5, inside = false;
      for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) this.put(x, y, typeof v === 'function' ? v(px, py) : v);
    }
  };
  Field.prototype.ring = function (cx, cy, R, th, v, squash, fn) {
    squash = squash || 1;
    var ext = R + th + 1;
    for (var y = Math.floor(cy - ext * squash); y <= Math.ceil(cy + ext * squash); y++)
      for (var x = Math.floor(cx - ext); x <= Math.ceil(cx + ext); x++) {
        var dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / squash, d = Math.sqrt(dx * dx + dy * dy);
        var e = Math.abs(d - R);
        if (e > th) continue;
        var val = v * (1 - e / (th + 0.5));
        if (fn) val *= fn(Math.atan2(dy, dx), d, x, y);
        this.put(x, y, val);
      }
  };

  // ── layer types ───────────────────────────────────────────────────────────
  // Each entry: { field:bool, params:{name:[default,min,max,step] | {select:[...]} | {text} | {color}}, render(L,c) }.
  // Field layers write intensity into c.F and are coloured by the shared ramp+dither stage;
  // direct layers paint RGBA into c.img themselves (backgrounds, text, imported sprites).
  var COMMON = {
    start: [0, 0, 1, 0.01], end: [1, 0, 1, 0.01],
    ramp: { ramp: 'fire' }, dither: [0.6, 0, 1, 0.05], cut: [0.08, 0, 0.9, 0.01],
    blend: { select: ['normal', 'add', 'erase', 'behind'] }, gain: [1, 0, 3, 0.05]
  };
  var POSES = {
    // [headX, headY, (shoulder->hand) x2, (hip->foot) x2, weaponAngle]; units = figure height fraction.
    stand: { lean: 0, armL: [-0.18, 0.55], armR: [0.2, 0.5], legL: [-0.1, 1], legR: [0.1, 1], weapon: -70 },
    lunge: { lean: 0.12, armL: [-0.15, 0.4], armR: [0.42, 0.33], legL: [-0.32, 1], legR: [0.28, 1], weapon: -8 },
    cast: { lean: -0.04, armL: [-0.3, 0.2], armR: [0.34, 0.18], legL: [-0.14, 1], legR: [0.14, 1], weapon: -100 },
    leap: { lean: 0.08, armL: [-0.3, 0.12], armR: [0.3, 0.05], legL: [-0.2, 0.82], legR: [0.24, 0.9], weapon: -150 },
    guard: { lean: -0.06, armL: [0.12, 0.42], armR: [0.24, 0.36], legL: [-0.18, 1], legR: [0.18, 1], weapon: -60 },
    kneel: { lean: 0.05, armL: [-0.1, 0.62], armR: [0.26, 0.62], legL: [-0.2, 0.85], legR: [0.26, 1], weapon: 80 }
  };


  // 7x7 glyphs for buff/debuff/trait read-outs; coloured by the layer ramp like any field layer.
  var ICONS = {
    up: ['...#...', '..###..', '.#####.', '#######', '..###..', '..###..', '..###..'],
    down: ['..###..', '..###..', '..###..', '#######', '.#####.', '..###..', '...#...'],
    heart: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    shield: ['#######', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    sword: ['......#', '.....#.', '....#..', '#..#...', '.##....', '.##....', '#..#...'],
    skull: ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '.#.#.#.', '.......'],
    link: ['.####..', '#....#.', '#..####', '#.##..#', '.####.#', '...#..#', '....##.'],
    die: ['#######', '#.....#', '#.#.#.#', '#.....#', '#.#.#.#', '#.....#', '#######'],
    hourglass: ['#######', '.#...#.', '..#.#..', '...#...', '..###..', '.#####.', '#######'],
    star: ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
    cross: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
    plus: ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
    gem: ['.#####.', '##.#.##', '#######', '.#####.', '..###..', '...#...', '.......'],
    leaf: ['....###', '..#####', '.###.##', '.##.##.', '###.#..', '#.##...', '#......'],
    eye: ['.......', '..###..', '.#####.', '##.#.##', '.#####.', '..###..', '.......'],
    z: ['#######', '.....#.', '....#..', '...#...', '..#....', '.#.....', '#######'],
    bolt: ['...###.', '..###..', '.#####.', '...##..', '..##...', '.##....', '#......'],
    flame: ['...#...', '..##...', '..###.#', '.####.#', '#######', '#######', '.#####.'],
    fist: ['.......', '.####..', '######.', '######.', '######.', '.####..', '.......'],
    crown: ['#..#..#', '#.###.#', '#######', '#######', '#######', '.......', '.......'],
    drop: ['...#...', '..###..', '.#####.', '#######', '#######', '.#####.', '..###..'],
    spiral: ['.#####.', '#.....#', '#.###.#', '#.#.#.#', '#.#...#', '#.#####', '.......'],
    log: ['.......', '.#####.', '##.#.##', '#.###.#', '##.#.##', '.#####.', '.......'],
    moon: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
    gear: ['.#.#.#.', '#######', '.##.##.', '###.###', '.##.##.', '#######', '.#.#.#.'],
    arrow: ['....#..', '.....#.', '#######', '.....#.', '....#..', '.......', '.......']
  };

  var TYPES = {
    particles: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [32, -64, 256, 1], count: [40, 1, 400, 1], spawn: [0.2, 0, 1, 0.01],
        life: [0.6, 0.05, 1, 0.01], angle: [-90, -360, 360, 1], spread: [360, 0, 360, 1],
        speed: [50, 0, 400, 1], speedVar: [0.6, 0, 1, 0.05], gravity: [0, -400, 400, 1], drag: [2, 0, 12, 0.1],
        areaX: [2, 0, 128, 1], areaY: [2, 0, 128, 1], size: [1.5, 0.2, 12, 0.1], sizeEnd: [0.4, 0, 12, 0.1],
        shape: { select: ['dot', 'square', 'streak', 'spark'] }, streak: [1, 0, 6, 0.1],
        bright: [1, 0, 2, 0.05], fade: [1, 0, 3, 0.05], hard: [0.7, 0, 1, 0.05], swirl: [0, -20, 20, 0.5]
      },
      render: function (L, c) {
        var n = Math.round(P(L.count, 0)), lt = c.t;
        for (var i = 0; i < n; i++) {
          var r = mulberry(c.seed * 7919 + i * 131 + 1);
          var spawn = r() * P(L.spawn, 0), life = P(L.life, 0) * (0.6 + 0.4 * r());
          // Looping clips wrap particle age so frame 0 already holds the steady-state crowd.
          var dt = lt - spawn;
          if (c.loop && dt < 0) dt += 1;
          var age = dt / life;
          if (age < 0 || age > 1) continue;
          var a = (P(L.angle, lt) + (r() - 0.5) * P(L.spread, 0)) * DEG;
          var sp = P(L.speed, lt) * (1 - P(L.speedVar, 0) * r());
          var ox = (r() - 0.5) * 2 * P(L.areaX, 0), oy = (r() - 0.5) * 2 * P(L.areaY, 0);
          var tt = age * life, drag = P(L.drag, 0);
          var disp = drag > 0 ? (1 - Math.exp(-drag * tt)) / drag : tt;
          var sw = P(L.swirl, 0) * tt;
          var ca = a + sw;
          var px = P(L.x, lt) + ox + Math.cos(ca) * sp * disp;
          var py = P(L.y, lt) + oy + Math.sin(ca) * sp * disp + 0.5 * P(L.gravity, 0) * tt * tt;
          var sz = lerp(P(L.size, 0), P(L.sizeEnd, 0), age) * (0.7 + 0.6 * r());
          var v = P(L.bright, 0) * Math.pow(1 - age, P(L.fade, 0)) * (0.75 + 0.25 * r());
          var shape = L.shape || 'dot';
          if (shape === 'streak' || shape === 'spark') {
            var vel = drag > 0 ? Math.exp(-drag * tt) : 1;
            var vx = Math.cos(ca) * sp * vel, vy = Math.sin(ca) * sp * vel + P(L.gravity, 0) * tt;
            var k = 0.05 * P(L.streak, 0);
            c.F.line(px - vx * k, py - vy * k, px, py, sz * 0.5, sz * 0.5, v * 0.5, v, 1);
            if (shape === 'spark' && age < 0.3) c.F.disc(px, py, sz + 0.6, v, 0.9);
          } else if (shape === 'square') {
            var s = Math.max(1, Math.round(sz));
            for (var yy = 0; yy < s; yy++) for (var xx = 0; xx < s; xx++) c.F.put(Math.round(px - s / 2) + xx, Math.round(py - s / 2) + yy, v);
          } else c.F.disc(px, py, sz, v, P(L.hard, 0));
        }
      }
    },

    ring: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [32, -64, 256, 1], radius: [{ from: 2, to: 28, ease: 'outCubic' }, 0, 200, 0.5],
        thickness: [{ from: 4, to: 0.5 }, 0, 40, 0.25], bright: [1, 0, 2, 0.05], breakup: [0.3, 0, 1, 0.05],
        squash: [1, 0.1, 1, 0.05], noiseScale: [0.3, 0.02, 2, 0.01]
      },
      render: function (L, c) {
        var br = P(L.breakup, c.t), ns = P(L.noiseScale, 0), seed = c.seed, T = c.t;
        c.F.ring(P(L.x, c.t), P(L.y, c.t), P(L.radius, c.t), P(L.thickness, c.t), P(L.bright, c.t), P(L.squash, 0),
          br > 0 ? function (ang, d, x, y) { return clamp(1 - br + (vnoise(x * ns, y * ns + T * 3, seed) - 0.5) * 2 * br + br * 0.5, 0, 1); } : null);
      }
    },

    slash: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [32, -64, 256, 1], radius: [20, 1, 200, 0.5], angle: [-30, -360, 360, 1],
        arc: [200, 10, 360, 1], thickness: [5, 0.5, 40, 0.25], progress: [{ from: 0, to: 1.5, ease: 'outCubic' }, -1, 3, 0.01],
        trail: [0.6, 0.05, 1, 0.01], bright: [1, 0, 2, 0.05], squash: [0.6, 0.1, 1, 0.05], tilt: [0, -90, 90, 1],
        flip: { select: ['cw', 'ccw'] }, inner: [0.45, 0, 1, 0.05]
      },
      render: function (L, c) {
        var t = c.t, pr = P(L.progress, t), tr = P(L.trail, t);
        var head = clamp(pr, 0, 1), tail = clamp(pr - tr, 0, 1);
        if (head - tail < 0.02) return;
        // Thin the stroke as the tail catches the head so the swing ends without a stray dot.
        var thin = clamp((head - tail) / (tr * 0.6), 0, 1);
        var R = P(L.radius, t), arc = P(L.arc, t) * DEG, a0 = P(L.angle, t) * DEG - arc / 2;
        var dir = L.flip === 'ccw' ? -1 : 1, th = P(L.thickness, t), sq = P(L.squash, t), tilt = P(L.tilt, t) * DEG;
        var cx = P(L.x, t), cy = P(L.y, t), br = P(L.bright, t), inner = P(L.inner, t);
        var cosT = Math.cos(tilt), sinT = Math.sin(tilt);
        var steps = Math.max(8, Math.ceil(arc * R * (head - tail) * 1.5));
        for (var i = 0; i <= steps; i++) {
          var u = lerp(tail, head, i / steps), k = (u - tail) / Math.max(1e-6, head - tail);
          var ang = a0 + dir * arc * u;
          var w = thin * th * Math.pow(Math.sin(Math.PI * clamp(k * 0.9 + 0.05, 0, 1)), 0.6) * (0.35 + 0.65 * k);
          // Crescent: the stroke is pushed outward as it thickens, so the inner edge stays sharp.
          var rr = R + w * (1 - inner) * 0.5;
          var lx = Math.cos(ang) * rr, ly = Math.sin(ang) * rr * sq;
          var px = cx + lx * cosT - ly * sinT, py = cy + lx * sinT + ly * cosT;
          c.F.disc(px, py, Math.max(0.5, w * 0.5), br * (0.45 + 0.55 * k), 0.75);
        }
      }
    },

    beam: {
      field: true,
      params: {
        x0: [4, -64, 256, 1], y0: [32, -64, 256, 1], x1: [60, -64, 256, 1], y1: [32, -64, 256, 1],
        width: [{ keys: [[0, 0], [0.15, 6], [0.8, 5], [1, 0]] }, 0, 60, 0.25], extend: [{ from: 0, to: 1, end: 0.2, ease: 'outQuad' }, 0, 1, 0.01],
        wobble: [0.3, 0, 1, 0.05], scroll: [6, -30, 30, 0.5], core: [0.5, 0, 1, 0.05], bright: [1, 0, 2, 0.05], noiseScale: [0.25, 0.02, 2, 0.01]
      },
      render: function (L, c) {
        var t = c.t, x0 = P(L.x0, t), y0 = P(L.y0, t), x1 = P(L.x1, t), y1 = P(L.y1, t);
        var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
        var W = P(L.width, t), ext = P(L.extend, t) * len, wob = P(L.wobble, t), sc = P(L.scroll, t), core = P(L.core, t), br = P(L.bright, t), ns = P(L.noiseScale, 0);
        if (W <= 0 || ext <= 0) return;
        var pad = W * 2 + 2;
        var bx0 = Math.floor(Math.min(x0, x1) - pad), bx1 = Math.ceil(Math.max(x0, x1) + pad), by0 = Math.floor(Math.min(y0, y1) - pad), by1 = Math.ceil(Math.max(y0, y1) + pad);
        for (var y = by0; y <= by1; y++) for (var x = bx0; x <= bx1; x++) {
          var rx = x + 0.5 - x0, ry = y + 0.5 - y0, s = rx * ux + ry * uy, d = Math.abs(-rx * uy + ry * ux);
          if (s < -W * 0.5 || s > ext) continue;
          var n = vnoise(s * ns - t * sc, d * ns * 2, c.seed);
          var w = W * (1 + (n - 0.5) * 2 * wob) * (s < 0 ? Math.sqrt(1 - Math.pow(-s / (W * 0.5), 2)) : 1);
          if (d > w) continue;
          var tip = clamp((ext - s) / (W + 1), 0, 1);
          var v = (1 - d / (w + 0.5)) * (1 - core) + core * (d < w * 0.4 ? 1 : 0.5);
          c.F.put(x, y, br * v * (0.6 + 0.4 * tip));
        }
      }
    },

    bolt: {
      field: true,
      params: {
        x0: [32, -64, 256, 1], y0: [0, -64, 256, 1], x1: [32, -64, 256, 1], y1: [60, -64, 256, 1],
        jag: [0.35, 0, 1, 0.01], depth: [5, 1, 8, 1], branches: [3, 0, 12, 1], width: [1, 0.5, 6, 0.25],
        regen: [2, 1, 30, 1], bright: [{ keys: [[0, 1], [0.6, 1], [1, 0]] }, 0, 2, 0.05], glow: [2.5, 0, 8, 0.25],
        extend: [{ from: 0, to: 1, end: 0.15 }, 0, 1, 0.01]
      },
      render: function (L, c) {
        var t = c.t, br = P(L.bright, t);
        if (br <= 0) return;
        var r = mulberry(c.seed * 31 + Math.floor(c.frame / Math.max(1, P(L.regen, 0))) * 977);
        var jag = P(L.jag, t), depth = Math.round(P(L.depth, 0));
        function build(ax, ay, bx, by, dp) {
          var pts = [[ax, ay], [bx, by]];
          for (var d = 0; d < dp; d++) {
            var nx = [pts[0]];
            for (var i = 1; i < pts.length; i++) {
              var p = pts[i - 1], q = pts[i], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
              var len = Math.hypot(q[0] - p[0], q[1] - p[1]), off = (r() - 0.5) * len * jag;
              var ux = -(q[1] - p[1]) / (len || 1), uy = (q[0] - p[0]) / (len || 1);
              nx.push([mx + ux * off, my + uy * off], q);
            }
            pts = nx;
          }
          return pts;
        }
        var ext = P(L.extend, t);
        var main = build(P(L.x0, t), P(L.y0, t), P(L.x1, t), P(L.y1, t), depth), W = P(L.width, t), G = P(L.glow, t);
        function draw(pts, w, v) {
          var upto = Math.max(1, Math.floor((pts.length - 1) * ext));
          for (var i = 1; i <= upto; i++) {
            if (G > 0) c.F.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w + G, w + G, v * 0.35, v * 0.35, 0);
            c.F.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w * 0.5, w * 0.5, v, v, 1);
          }
        }
        draw(main, W, br);
        var nb = Math.round(P(L.branches, 0));
        for (var b = 0; b < nb; b++) {
          var at = main[Math.floor(r() * main.length * ext * 0.8)] || main[0];
          var len = Math.hypot(P(L.x1, t) - P(L.x0, t), P(L.y1, t) - P(L.y0, t)) * (0.15 + 0.25 * r());
          var a = Math.atan2(P(L.y1, t) - P(L.y0, t), P(L.x1, t) - P(L.x0, t)) + (r() - 0.5) * 1.8;
          draw(build(at[0], at[1], at[0] + Math.cos(a) * len, at[1] + Math.sin(a) * len, Math.max(1, depth - 2)), W * 0.6, br * 0.7);
        }
      }
    },

    orb: {
      field: true,
      params: {
        x0: [6, -64, 256, 1], y0: [32, -64, 256, 1], x1: [58, -64, 256, 1], y1: [32, -64, 256, 1],
        travel: [{ from: 0, to: 1, ease: 'inQuad' }, 0, 1, 0.01], arcHeight: [0, -80, 80, 1],
        radius: [5, 0.5, 60, 0.25], tail: [10, 0, 40, 1], boil: [0.35, 0, 1, 0.05], bright: [1, 0, 2, 0.05], spin: [4, -20, 20, 0.5]
      },
      render: function (L, c) {
        var t = c.t, R = P(L.radius, t), br = P(L.bright, t), boil = P(L.boil, t), tr = P(L.travel, t);
        var x0 = P(L.x0, t), y0 = P(L.y0, t), x1 = P(L.x1, t), y1 = P(L.y1, t), ah = P(L.arcHeight, 0);
        function at(u) { return [lerp(x0, x1, u), lerp(y0, y1, u) - Math.sin(Math.PI * u) * ah]; }
        var tail = Math.round(P(L.tail, t));
        for (var i = tail; i >= 1; i--) {
          var u = tr - i * 0.012;
          if (u < 0) continue;
          var p = at(u), k = 1 - i / (tail + 1);
          c.F.disc(p[0], p[1], R * (0.25 + 0.6 * k), br * 0.75 * k, 0.4);
        }
        var h = at(tr), sp = P(L.spin, 0) * t, seed = c.seed;
        var ext = R + 2;
        for (var y = Math.floor(h[1] - ext); y <= h[1] + ext; y++) for (var x = Math.floor(h[0] - ext); x <= h[0] + ext; x++) {
          var dx = x + 0.5 - h[0], dy = y + 0.5 - h[1], d = Math.sqrt(dx * dx + dy * dy);
          var ang = Math.atan2(dy, dx);
          var edge = R * (1 + (vnoise(Math.cos(ang) * 2 + sp, Math.sin(ang) * 2 + c.frame * 0.4, seed) - 0.5) * boil);
          if (d > edge) continue;
          c.F.put(x, y, br * (0.55 + 0.6 * (1 - d / edge)));
        }
      }
    },

    rays: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [32, -64, 256, 1], count: [10, 1, 64, 1], length: [{ keys: [[0, 2], [0.3, 26], [1, 30]], ease: 'outQuad' }, 0, 200, 0.5],
        width: [2.5, 0.25, 20, 0.25], rotate: [0, -360, 360, 1], spin: [0, -360, 360, 1], variance: [0.5, 0, 1, 0.05],
        inner: [{ keys: [[0, 0], [0.5, 4], [1, 26]] }, 0, 200, 0.5], bright: [{ keys: [[0, 1], [0.7, 0.9], [1, 0]] }, 0, 2, 0.05], squash: [1, 0.1, 1, 0.05]
      },
      render: function (L, c) {
        var t = c.t, n = Math.round(P(L.count, 0)), r = mulberry(c.seed * 13 + 5);
        var cx = P(L.x, t), cy = P(L.y, t), len = P(L.length, t), inn = P(L.inner, t), W = P(L.width, t), sq = P(L.squash, 0);
        var rot = (P(L.rotate, 0) + P(L.spin, 0) * t) * DEG, va = P(L.variance, 0), br = P(L.bright, t);
        for (var i = 0; i < n; i++) {
          var a = rot + i / n * TAU + (r() - 0.5) * va * TAU / n, l = len * (1 - va * 0.6 * r());
          if (l <= inn) continue;
          var ca = Math.cos(a), sa = Math.sin(a) * sq;
          c.F.line(cx + ca * inn, cy + sa * inn, cx + ca * l, cy + sa * l, W * 0.5, 0.3, br, br * 0.6, 0.8);
        }
      }
    },

    circle: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [32, -64, 256, 1], radius: [{ from: 0, to: 26, end: 0.3, ease: 'outBack' }, 0, 200, 0.5],
        rings: [2, 1, 5, 1], runes: [12, 0, 48, 1], star: [5, 0, 12, 1], starStep: [2, 1, 5, 1],
        spin: [90, -720, 720, 1], squash: [0.5, 0.1, 1, 0.05], bright: [{ keys: [[0, 1], [0.8, 1], [1, 0]] }, 0, 2, 0.05]
      },
      render: function (L, c) {
        var t = c.t, R = P(L.radius, t);
        if (R < 1) return;
        var cx = P(L.x, t), cy = P(L.y, t), sq = P(L.squash, 0), br = P(L.bright, t), rot = P(L.spin, 0) * t * DEG;
        var rings = Math.round(P(L.rings, 0)), F = c.F;
        for (var k = 0; k < rings; k++) F.ring(cx, cy, R * (1 - k * 0.22), 0.6, br, sq);
        var runes = Math.round(P(L.runes, 0)), rr = R * 0.89;
        for (var i = 0; i < runes; i++) {
          var a = rot + i / runes * TAU, h = (i % 3 === 0) ? 0.09 : 0.05;
          F.line(cx + Math.cos(a) * rr * (1 - h), cy + Math.sin(a) * rr * (1 - h) * sq, cx + Math.cos(a) * rr * (1 + h * 0.3), cy + Math.sin(a) * rr * (1 + h * 0.3) * sq, 0.5, 0.5, br * 0.9, br * 0.9, 1);
        }
        var sp = Math.round(P(L.star, 0)), st = Math.round(P(L.starStep, 0)), sr = R * (1 - (rings - 1) * 0.22) - 1;
        if (sp >= 3) for (var j = 0; j < sp; j++) {
          var a1 = -rot * 0.5 - Math.PI / 2 + j / sp * TAU, a2 = -rot * 0.5 - Math.PI / 2 + ((j + st) % sp) / sp * TAU;
          F.line(cx + Math.cos(a1) * sr, cy + Math.sin(a1) * sr * sq, cx + Math.cos(a2) * sr, cy + Math.sin(a2) * sr * sq, 0.5, 0.5, br * 0.8, br * 0.8, 1);
        }
      }
    },

    flame: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [58, -64, 256, 1], width: [12, 1, 128, 0.5], height: [{ keys: [[0, 0], [0.2, 40], [0.8, 44], [1, 0]], ease: 'outQuad' }, 0, 200, 0.5],
        scroll: [3, -10, 10, 0.1], turbulence: [0.8, 0, 2, 0.05], taper: [0.9, 0, 1, 0.05], noiseScale: [0.18, 0.02, 1, 0.01],
        bright: [1.15, 0, 2, 0.05], mode: { select: ['flame', 'smoke', 'pillar'] }
      },
      render: function (L, c) {
        var t = c.t, x0 = P(L.x, t), y0 = P(L.y, t), W = P(L.width, t), H = P(L.height, t);
        if (H <= 0.5) return;
        var tu = P(L.turbulence, t), tp = P(L.taper, t), ns = P(L.noiseScale, 0), sc = P(L.scroll, 0), br = P(L.bright, t), mode = L.mode || 'flame';
        for (var y = Math.floor(y0 - H - 2); y <= y0 + 2; y++) for (var x = Math.floor(x0 - W - 2); x <= x0 + W + 2; x++) {
          var ny = (y0 - (y + 0.5)) / H, nx = (x + 0.5 - x0) / W;
          if (ny < -0.08 || ny > 1.1) continue;
          var n = fbm((x + 0.5) * ns, (y + 0.5) * ns + c.frame * sc * ns, c.seed, 3);
          var v;
          if (mode === 'pillar') {
            v = (1 - Math.abs(nx) * (1.2 + (n - 0.5) * tu)) * (1 - smooth(0.75, 1.1, ny)) * (0.65 + 0.7 * n);
          } else {
            var wid = 1 - ny * tp;
            if (wid <= 0) continue;
            var sway = Math.sin(ny * 4 + c.frame * 0.5) * 0.12 * tu;
            v = (1 - Math.abs(nx / wid - sway)) * 1.1 - ny * (mode === 'smoke' ? 0.4 : 0.9) + (n - 0.5) * tu * 1.4;
            if (ny < 0) v *= 1 + ny * 10;
          }
          if (v > 0) c.F.put(x, y, v * br);
        }
      }
    },

    cloud: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [34, -64, 256, 1], count: [9, 1, 60, 1], radius: [{ from: 3, to: 9, ease: 'outCubic' }, 0.5, 60, 0.25],
        spread: [{ from: 2, to: 16, ease: 'outCubic' }, 0, 128, 0.5], rise: [{ from: 0, to: -8 }, -80, 80, 0.5],
        dissolve: [{ keys: [[0, 0], [0.5, 0.1], [1, 1]], ease: 'inQuad' }, 0, 1, 0.01], noiseScale: [0.35, 0.02, 2, 0.01],
        bright: [{ from: 1.1, to: 0.6 }, 0, 2, 0.05], squash: [0.8, 0.1, 1.5, 0.05]
      },
      render: function (L, c) {
        var t = c.t, n = Math.round(P(L.count, 0)), r = mulberry(c.seed * 17 + 3);
        var cx = P(L.x, t), cy = P(L.y, t) + P(L.rise, t), sp = P(L.spread, t), R = P(L.radius, t), dis = P(L.dissolve, t), ns = P(L.noiseScale, 0), br = P(L.bright, t), sq = P(L.squash, 0);
        var blobs = [];
        for (var i = 0; i < n; i++) { var a = r() * TAU, d = Math.sqrt(r()) * sp; blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * sq, R * (0.6 + 0.6 * r())]); }
        var ext = sp + R * 1.3 + 2;
        for (var y = Math.floor(cy - ext); y <= cy + ext; y++) for (var x = Math.floor(cx - ext); x <= cx + ext; x++) {
          var best = 0;
          for (var b = 0; b < blobs.length; b++) {
            var dx = x + 0.5 - blobs[b][0], dy = y + 0.5 - blobs[b][1], f = 1 - Math.sqrt(dx * dx + dy * dy) / blobs[b][2];
            if (f > best) best = f;
          }
          if (best <= 0) continue;
          var nz = fbm(x * ns, y * ns - c.frame * 0.2, c.seed + 9, 3);
          if (nz < dis) continue;
          c.F.put(x, y, br * clamp(best * 1.6, 0, 1) * (0.5 + nz * 0.8));
        }
      }
    },

    shards: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [32, -64, 256, 1], count: [10, 1, 80, 1], speed: [70, 0, 400, 1], angle: [-90, -360, 360, 1], spread: [360, 0, 360, 1],
        size: [3, 0.5, 20, 0.25], gravity: [60, -400, 400, 1], spin: [6, -30, 30, 0.5], life: [0.8, 0.05, 1, 0.01], drag: [2, 0, 12, 0.1],
        shape: { select: ['tri', 'diamond', 'rock'] }, bright: [1, 0, 2, 0.05]
      },
      render: function (L, c) {
        var t = c.t, n = Math.round(P(L.count, 0));
        for (var i = 0; i < n; i++) {
          var r = mulberry(c.seed * 997 + i * 61 + 7);
          var life = P(L.life, 0) * (0.7 + 0.3 * r()), age = t / life;
          if (age > 1) continue;
          var a = (P(L.angle, 0) + (r() - 0.5) * P(L.spread, 0)) * DEG, sp = P(L.speed, 0) * (0.4 + 0.6 * r()), drag = P(L.drag, 0), tt = age * life;
          var disp = drag > 0 ? (1 - Math.exp(-drag * tt)) / drag : tt;
          var px = P(L.x, 0) + Math.cos(a) * sp * disp, py = P(L.y, 0) + Math.sin(a) * sp * disp + 0.5 * P(L.gravity, 0) * tt * tt;
          var s = P(L.size, 0) * (0.6 + 0.8 * r()) * (1 - age * 0.4), rot = r() * TAU + P(L.spin, 0) * tt * (r() < 0.5 ? -1 : 1);
          var shape = L.shape || 'tri', pts = [];
          var verts = shape === 'tri' ? [[1.4, 0], [-0.7, 0.6], [-0.7, -0.6]] : shape === 'diamond' ? [[1.5, 0], [0, 0.55], [-1.5, 0], [0, -0.55]] : [[1, 0.2], [0.3, 0.9], [-0.8, 0.6], [-0.9, -0.4], [0.2, -0.9]];
          for (var k = 0; k < verts.length; k++) {
            var vx = verts[k][0] * s, vy = verts[k][1] * s;
            pts.push([px + vx * Math.cos(rot) - vy * Math.sin(rot), py + vx * Math.sin(rot) + vy * Math.cos(rot)]);
          }
          var br = P(L.bright, t) * (1 - Math.pow(age, 3)), lx = Math.cos(rot), ly = Math.sin(rot);
          c.F.poly(pts, function (qx, qy) { return br * (0.6 + 0.4 * clamp(((qx - px) * lx + (qy - py) * ly) / (s + 0.01) * -0.5 + 0.5, 0, 1)); });
        }
      }
    },

    vortex: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [32, -64, 256, 1], radius: [{ keys: [[0, 0], [0.25, 24], [0.85, 26], [1, 0]], ease: 'outQuad' }, 0, 200, 0.5],
        arms: [3, 1, 12, 1], twist: [3, -12, 12, 0.25], spin: [-540, -1440, 1440, 10], squash: [1, 0.1, 1, 0.05],
        sharp: [3, 1, 12, 0.5], core: [0.35, 0, 1, 0.05], hole: [0, 0, 1, 0.05], bright: [1.1, 0, 2, 0.05]
      },
      render: function (L, c) {
        var t = c.t, R = P(L.radius, t);
        if (R < 1) return;
        var cx = P(L.x, t), cy = P(L.y, t), arms = Math.round(P(L.arms, 0)), tw = P(L.twist, 0), rot = P(L.spin, 0) * t * DEG, sq = P(L.squash, 0);
        var sh = P(L.sharp, 0), core = P(L.core, 0), hole = P(L.hole, 0), br = P(L.bright, t);
        for (var y = Math.floor(cy - R * sq - 1); y <= cy + R * sq + 1; y++) for (var x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
          var dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sq, d = Math.sqrt(dx * dx + dy * dy) / R;
          if (d > 1) continue;
          var ang = Math.atan2(dy, dx);
          var s = Math.pow(0.5 + 0.5 * Math.cos(arms * (ang + tw * d) + rot), sh);
          var v = s * (1 - d) * 1.6 + (d < core ? (1 - d / core) * 0.8 : 0);
          if (hole > 0 && d < hole) v = 0;
          if (v > 0) c.F.put(x, y, v * br);
        }
      }
    },

    tornado: {
      field: true,
      params: {
        x: [32, -64, 256, 1], y: [60, -64, 256, 1], height: [{ keys: [[0, 0], [0.2, 52], [0.85, 54], [1, 0]] }, 0, 200, 0.5],
        baseWidth: [3, 0.5, 40, 0.5], topWidth: [16, 1, 80, 0.5], bands: [9, 2, 30, 1], sway: [4, 0, 30, 0.5], spin: [5, 0, 20, 0.5], bright: [1, 0, 2, 0.05]
      },
      render: function (L, c) {
        var t = c.t, H = P(L.height, t);
        if (H < 1) return;
        var bands = Math.round(P(L.bands, 0)), x0 = P(L.x, t), y0 = P(L.y, t), br = P(L.bright, t);
        for (var i = 0; i < bands; i++) {
          var k = i / (bands - 1), yy = y0 - k * H, w = lerp(P(L.baseWidth, 0), P(L.topWidth, 0), Math.pow(k, 1.2));
          var xx = x0 + Math.sin(k * 3 + c.frame * 0.3) * P(L.sway, 0) * k, ph = c.frame * P(L.spin, 0) * 0.1 + i;
          c.F.ring(xx, yy, w, 0.7, br * (0.6 + 0.4 * k), 0.28, function (ang) { return 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(ang + ph), 2); });
        }
      }
    },

    spikes: {
      field: true,
      params: {
        x: [8, -64, 256, 1], y: [58, -64, 256, 1], count: [5, 1, 30, 1], spacing: [11, 1, 60, 0.5], height: [22, 1, 120, 0.5], width: [4, 0.5, 30, 0.25],
        grow: [{ keys: [[0, 0], [0.5, 1], [0.8, 1], [1, 0]], ease: 'outBack' }, 0, 1.5, 0.01], stagger: [0.08, 0, 0.3, 0.01], lean: [0.2, 0, 1, 0.05], bright: [1, 0, 2, 0.05]
      },
      render: function (L, c) {
        var t = c.t, n = Math.round(P(L.count, 0)), r = mulberry(c.seed * 41);
        for (var i = 0; i < n; i++) {
          var g = clamp(P(L.grow, clamp(t - i * P(L.stagger, 0), 0, 1)), 0, 1.5), hgt = P(L.height, 0) * (0.65 + 0.35 * r()) * g;
          var bx = P(L.x, 0) + i * P(L.spacing, 0), by = P(L.y, 0), w = P(L.width, 0) * (0.8 + 0.4 * r()), ln = (r() - 0.5) * P(L.lean, 0) * hgt;
          if (hgt < 0.5) continue;
          var br = P(L.bright, t);
          c.F.poly([[bx - w, by], [bx + w, by], [bx + ln, by - hgt]], function (qx) { return br * (qx < bx + ln * 0.5 ? 0.95 : 0.6); });
        }
      }
    },

    speedlines: {
      field: true,
      params: {
        x: [80, -64, 512, 1], y: [45, -64, 512, 1], mode: { select: ['radial', 'horizontal', 'vertical'] }, count: [40, 1, 200, 1],
        inner: [30, 0, 300, 1], length: [60, 1, 400, 1], width: [1, 0.25, 6, 0.25], jitter: [1, 1, 10, 1], bright: [0.8, 0, 2, 0.05], speed: [200, 0, 800, 5]
      },
      render: function (L, c) {
        var t = c.t, n = Math.round(P(L.count, 0)), seedFrame = Math.floor(c.frame / Math.max(1, P(L.jitter, 0)));
        var r = mulberry(c.seed * 23 + seedFrame * 101), mode = L.mode || 'radial', W = P(L.width, t), br = P(L.bright, t);
        for (var i = 0; i < n; i++) {
          if (mode === 'radial') {
            var a = r() * TAU, inn = P(L.inner, t) * (0.8 + 0.5 * r()), l = P(L.length, t) * (0.5 + r());
            c.F.line(P(L.x, t) + Math.cos(a) * inn, P(L.y, t) + Math.sin(a) * inn, P(L.x, t) + Math.cos(a) * (inn + l), P(L.y, t) + Math.sin(a) * (inn + l), 0.2, W, br * 0.5, br, 1);
          } else {
            var horiz = mode === 'horizontal', span = horiz ? c.h : c.w, lenAx = horiz ? c.w : c.h;
            var off = r() * span, ln = P(L.length, t) * (0.4 + r()), pos = ((r() * lenAx + t * P(L.speed, 0) * (0.6 + r())) % (lenAx + ln)) - ln;
            if (horiz) c.F.line(lenAx - pos, off, lenAx - pos - ln, off, W * 0.5, W * 0.5, br, br * 0.3, 1);
            else c.F.line(off, pos, off, pos + ln, W * 0.5, W * 0.5, br * 0.3, br, 1);
          }
        }
      }
    },

    cutin: {
      field: true,
      params: {
        y: [45, -64, 512, 1], height: [{ keys: [[0, 0], [0.12, 34], [0.85, 34], [1, 0]], ease: 'outCubic' }, 0, 300, 1], angle: [-8, -45, 45, 1],
        stripes: [6, 0, 40, 1], scroll: [80, -400, 400, 5], edge: [2, 0, 10, 1], bright: [0.55, 0, 2, 0.05]
      },
      render: function (L, c) {
        var t = c.t, H = P(L.height, t) / 2;
        if (H < 0.5) return;
        var tan = Math.tan(P(L.angle, 0) * DEG), cy = P(L.y, t), st = P(L.stripes, 0), sc = P(L.scroll, 0) * t, ed = P(L.edge, 0), br = P(L.bright, t);
        for (var y = 0; y < c.h; y++) for (var x = 0; x < c.w; x++) {
          var d = (y + 0.5) - (cy + (x - c.w / 2) * tan);
          if (Math.abs(d) > H) continue;
          var v = br;
          if (Math.abs(d) > H - ed) v = 1;
          else if (st > 0 && Math.floor((x + sc + d) / Math.max(1, (c.w / st))) % 2 === 0) v = br * 0.75;
          c.F.put(x, y, v);
        }
      }
    },

    figure: {
      field: true,
      params: {
        x: [40, -64, 512, 1], y: [80, -64, 512, 1], height: [48, 8, 300, 1], pose: { select: Object.keys(POSES) },
        weapon: { select: ['sword', 'staff', 'spear', 'none'] }, facing: { select: ['right', 'left'] },
        slide: [0, -300, 300, 1], bob: [0, 0, 10, 0.5], bright: [0.3, 0, 2, 0.05], cape: [1, 0, 1, 1]
      },
      render: function (L, c) {
        var t = c.t, pose = POSES[L.pose] || POSES.stand, H = P(L.height, t), s = L.facing === 'left' ? -1 : 1;
        var fx = P(L.x, t) + P(L.slide, t), fy = P(L.y, t) - Math.abs(Math.sin(c.frame * 0.35)) * P(L.bob, 0), br = P(L.bright, t), F = c.F;
        var lean = pose.lean * H * s;
        function X(u) { return fx + u * H * s; }
        var hip = [fx + lean * 0.4, fy - H * 0.47], neck = [fx + lean, fy - H * 0.78], head = [fx + lean * 1.15, fy - H * 0.88];
        var lw = H * 0.05;
        if (P(L.cape, 0) > 0) {
          var flap = Math.sin(c.frame * 0.5) * H * 0.04;
          F.poly([[neck[0] - s * lw, neck[1]], [neck[0] + s * lw, neck[1]], [X(-0.3) + flap, fy - H * 0.22], [X(-0.42) + flap, fy - H * 0.3]], br * 0.8);
        }
        F.line(hip[0], hip[1], X(pose.legL[0]), fy - (1 - pose.legL[1]) * H, lw * 1.2, lw * 0.9, br, br, 1);
        F.line(hip[0], hip[1], X(pose.legR[0]), fy - (1 - pose.legR[1]) * H, lw * 1.2, lw * 0.9, br, br, 1);
        F.line(hip[0], hip[1], neck[0], neck[1], lw * 1.9, lw * 2.2, br, br, 1);
        var sh = [neck[0], neck[1] + H * 0.03];
        var hl = [X(pose.armL[0]) + lean, fy - (1 - pose.armL[1]) * H], hr = [X(pose.armR[0]) + lean, fy - (1 - pose.armR[1]) * H];
        F.line(sh[0], sh[1], hl[0], hl[1], lw, lw * 0.8, br, br, 1);
        F.line(sh[0], sh[1], hr[0], hr[1], lw, lw * 0.8, br, br, 1);
        F.disc(head[0], head[1], H * 0.085, br, 1);
        var wpn = L.weapon || 'sword';
        if (wpn !== 'none') {
          var wa = pose.weapon * DEG, wl = H * (wpn === 'sword' ? 0.5 : 0.75);
          var ex = hr[0] + Math.cos(wa) * wl * s, ey = hr[1] + Math.sin(wa) * wl;
          var bx = hr[0] - Math.cos(wa) * (wpn === 'sword' ? H * 0.06 : wl * 0.25) * s, by = hr[1] - Math.sin(wa) * (wpn === 'sword' ? H * 0.06 : wl * 0.25);
          F.line(bx, by, ex, ey, wpn === 'sword' ? lw * 0.7 : lw * 0.45, wpn === 'spear' ? 0.4 : lw * 0.4, Math.min(1, br * 3.2), 1, 1);
          if (wpn === 'staff') F.disc(ex, ey, H * 0.05, 1, 0.9);
        }
      }
    },

    icon: {
      field: true,
      params: {
        icon: { select: Object.keys(ICONS) }, x: [32, -64, 256, 1], y: [32, -64, 256, 1], scale: [2, 1, 8, 1], count: [1, 1, 12, 1],
        spacing: [14, 0, 80, 1], rise: [{ from: 0, to: -14, ease: 'outCubic' }, -120, 120, 0.5], stagger: [0.1, 0, 0.5, 0.01],
        pop: [0.15, 0, 1, 0.01], fade: [0.75, 0, 1, 0.01], bob: [0, 0, 6, 0.5], arc: [0, -40, 40, 1], bright: [1, 0, 2, 0.05]
      },
      render: function (L, c) {
        var g = ICONS[L.icon] || ICONS.star, n = Math.round(P(L.count, 0)), s = Math.max(1, Math.round(P(L.scale, 0)));
        for (var i = 0; i < n; i++) {
          var lt = clamp((c.t - i * P(L.stagger, 0)) / Math.max(0.05, 1 - (n - 1) * P(L.stagger, 0)), 0, 1);
          if (c.t < i * P(L.stagger, 0)) continue;
          var pop = P(L.pop, 0), fd = P(L.fade, 0);
          // Pop in (grow from 1px), hold, then dither away: reads at tiny sizes where alpha fades don't.
          var k = pop > 0 ? clamp(lt / pop, 0, 1) : 1, v = P(L.bright, lt) * (lt > fd ? 1 - (lt - fd) / Math.max(0.01, 1 - fd) : 1);
          if (v <= 0.02) continue;
          var off = (i - (n - 1) / 2), ss = Math.max(1, Math.round(s * (k < 1 ? 0.5 + 0.5 * k : 1)));
          var cx = P(L.x, lt) + off * P(L.spacing, 0), cy = P(L.y, lt) + P(L.rise, lt) + Math.abs(off) * P(L.arc, 0) / Math.max(1, n) + Math.sin((c.frame + i * 2) * 0.6) * P(L.bob, 0);
          var x0 = Math.round(cx - 3.5 * ss), y0 = Math.round(cy - 3.5 * ss);
          for (var gy = 0; gy < 7; gy++) for (var gx = 0; gx < 7; gx++) {
            if (g[gy].charAt(gx) !== '#') continue;
            // Top rows brighter so the ramp gives each glyph a lit/shaded side.
            var shade = v * (1 - gy * 0.06);
            for (var sy = 0; sy < ss; sy++) for (var sx = 0; sx < ss; sx++) c.F.put(x0 + gx * ss + sx, y0 + gy * ss + sy, shade);
          }
        }
      }
    },

    // ── direct (RGBA) layers ───────────────────────────────────────────────
    bg: {
      field: false,
      params: { top: { color: '#0d0f1a' }, bottom: { color: '#2f3561' }, bands: [6, 1, 32, 1], mode: { select: ['vertical', 'radial', 'solid'] }, x: [80, -64, 512, 1], y: [45, -64, 512, 1], alpha: [1, 0, 1, 0.05] },
      render: function (L, c) {
        var a = hex(L.top || '#0d0f1a'), b = hex(L.bottom || '#2f3561'), n = Math.round(P(L.bands, 0)), al = P(L.alpha, c.t), mode = L.mode || 'vertical';
        var cx = P(L.x, c.t), cy = P(L.y, c.t), maxd = Math.hypot(c.w, c.h) * 0.6;
        for (var y = 0; y < c.h; y++) for (var x = 0; x < c.w; x++) {
          var u = mode === 'solid' ? 0 : mode === 'radial' ? clamp(Math.hypot(x - cx, y - cy) / maxd, 0, 1) : y / Math.max(1, c.h - 1);
          var q = clamp(Math.floor(u * n + bayer(x, y) * 0.9) / Math.max(1, n - 1), 0, 1);
          blendPx(c.img, c.w, x, y, [lerp(a[0], b[0], q), lerp(a[1], b[1], q), lerp(a[2], b[2], q)], al);
        }
      }
    },
    letterbox: {
      field: false,
      params: { size: [{ keys: [[0, 0], [0.1, 12], [0.9, 12], [1, 0]], ease: 'outCubic' }, 0, 200, 1], color: { color: '#000000' } },
      render: function (L, c) {
        var s = Math.round(P(L.size, c.t)), col = hex(L.color || '#000');
        for (var y = 0; y < c.h; y++) if (y < s || y >= c.h - s) for (var x = 0; x < c.w; x++) blendPx(c.img, c.w, x, y, col, 1);
      }
    },
    flash: {
      field: false,
      params: { color: { color: '#ffffff' }, amount: [{ keys: [[0, 1], [1, 0]], ease: 'outQuad' }, 0, 1, 0.01], steps: [4, 1, 16, 1] },
      render: function (L, c) {
        var steps = Math.round(P(L.steps, 0)), amt = Math.round(P(L.amount, c.t) * steps) / steps, col = hex(L.color || '#fff');
        if (amt <= 0) return;
        for (var y = 0; y < c.h; y++) for (var x = 0; x < c.w; x++) {
          // Ordered-dither the flash instead of alpha-blending it so the frame stays on-palette.
          if (amt >= 1 || bayer(x, y) + 0.5 < amt) blendPx(c.img, c.w, x, y, col, 1);
        }
      }
    },
    invert: {
      field: false,
      params: { amount: [1, 0, 1, 1] },
      render: function (L, c) {
        // Anime "impact frame": the whole image collapses to two tones for a beat.
        if (P(L.amount, c.t) < 0.5) return;
        var d = c.img;
        for (var i = 0; i < d.length; i += 4) {
          var l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11, v = l > 96 ? 0 : 255;
          d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
        }
      }
    },
    text: {
      field: false,
      params: {
        text: { text: 'ULTIMATE' }, x: [80, -64, 512, 1], y: [45, -64, 512, 1], scale: [2, 1, 8, 1], color: { color: '#ffffff' }, outline: { color: '#000000' },
        reveal: [{ from: 0, to: 1, end: 0.4 }, 0, 1, 0.01], wave: [0, 0, 6, 0.5], align: { select: ['center', 'left', 'right'] }, slide: [0, -300, 300, 1]
      },
      render: function (L, c) { drawText(c, L); }
    },
    image: {
      field: false,
      params: {
        src: { text: '' }, x: [40, -64, 512, 1], y: [80, -64, 512, 1], scale: [1, 1, 8, 1], flipX: [0, 0, 1, 1],
        slide: [0, -300, 300, 1], bob: [0, 0, 10, 0.5], whiten: [0, 0, 1, 0.05], silhouette: { color: '' }, alpha: [1, 0, 1, 0.05]
      },
      render: function (L, c) {
        var im = c.assets && c.assets[L.src];
        if (!im) return;
        var s = Math.max(1, Math.round(P(L.scale, 0))), t = c.t, al = P(L.alpha, t), wh = P(L.whiten, t), sil = L.silhouette ? hex(L.silhouette) : null, flip = P(L.flipX, 0) >= 0.5;
        var ox = Math.round(P(L.x, t) + P(L.slide, t) - im.w * s / 2), oy = Math.round(P(L.y, t) - im.h * s - Math.abs(Math.sin(c.frame * 0.35)) * P(L.bob, 0));
        for (var y = 0; y < im.h * s; y++) for (var x = 0; x < im.w * s; x++) {
          var sx = Math.floor(x / s), sy = Math.floor(y / s);
          if (flip) sx = im.w - 1 - sx;
          var i = (sy * im.w + sx) * 4;
          if (im.data[i + 3] < 128) continue;
          var col = sil || [lerp(im.data[i], 255, wh), lerp(im.data[i + 1], 255, wh), lerp(im.data[i + 2], 255, wh)];
          blendPx(c.img, c.w, ox + x, oy + y, col, al);
        }
      }
    },
    effect: {
      field: false,
      params: { preset: { preset: 'fire-slash' }, x: [0, -256, 512, 1], y: [0, -256, 512, 1], scale: [1, 1, 8, 1], speed: [1, 0.1, 4, 0.05], loopSub: [0, 0, 1, 1] },
      render: function (L, c) {
        var sub = c.sub(L.preset);
        if (!sub) return;
        var u = c.t * P(L.speed, 0);
        if (P(L.loopSub, 0) >= 0.5) u = u % 1; else if (u > 1) return;
        var f = sub.frames[Math.min(sub.n - 1, Math.floor(u * sub.n))], s = Math.max(1, Math.round(P(L.scale, 0)));
        var ox = Math.round(P(L.x, c.t)), oy = Math.round(P(L.y, c.t));
        for (var y = 0; y < sub.h * s; y++) for (var x = 0; x < sub.w * s; x++) {
          var i = ((Math.floor(y / s)) * sub.w + Math.floor(x / s)) * 4;
          if (f[i + 3] < 8) continue;
          blendPx(c.img, c.w, ox + x, oy + y, [f[i], f[i + 1], f[i + 2]], f[i + 3] / 255);
        }
      }
    }
  };

  // ── 3x5 pixel font: 15 chars per glyph, rows top->bottom, '1' = ink ───────
  var FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
    '!': '010010010000010', '?': '110001010000010', '.': '000000000000010', ',': '000000000010100', '-': '000000111000000',
    '+': '000010111010000', ':': '000010000010000', "'": '010010000000000', '/': '001001010100100', ' ': '000000000000000'
  };
  function glyphBit(code, gx, gy) { return code.charAt(gy * 3 + gx) === '1'; }
  function textWidth(str, s) { return str.length * 4 * s - s; }
  function drawText(c, L) {
    var t = c.t, str = String(L.text == null ? '' : L.text).toUpperCase(), s = Math.max(1, Math.round(P(L.scale, 0)));
    var shown = Math.ceil(str.length * clamp(P(L.reveal, t), 0, 1)), col = hex(L.color || '#fff'), ol = L.outline ? hex(L.outline) : null, wave = P(L.wave, t);
    var w = textWidth(str, s), align = L.align || 'center';
    var x0 = Math.round(P(L.x, t) + P(L.slide, t) - (align === 'center' ? w / 2 : align === 'right' ? w : 0)), y0 = Math.round(P(L.y, t) - 2.5 * s);
    var pass, ci, gx, gy, sx, sy;
    for (pass = ol ? 0 : 1; pass < 2; pass++) {
      for (ci = 0; ci < shown; ci++) {
        var code = FONT[str[ci]];
        if (code == null) code = FONT['?'];
        var yo = wave ? Math.round(Math.sin(c.frame * 0.4 + ci * 0.8) * wave) : 0;
        for (gy = 0; gy < 5; gy++) for (gx = 0; gx < 3; gx++) {
          if (!glyphBit(code, gx, gy)) continue;
          for (sy = 0; sy < s; sy++) for (sx = 0; sx < s; sx++) {
            var px = x0 + ci * 4 * s + gx * s + sx, py = y0 + yo + gy * s + sy;
            if (pass === 0) { for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) blendPx(c.img, c.w, px + ox, py + oy, ol, 1); }
            else blendPx(c.img, c.w, px, py, col, 1);
          }
        }
      }
    }
  }

  function blendPx(img, w, x, y, col, a) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= w || y * w * 4 >= img.length) return;
    var i = (y * w + x) * 4, ia = img[i + 3] / 255, oa = a + ia * (1 - a);
    if (oa <= 0) return;
    img[i] = (col[0] * a + img[i] * ia * (1 - a)) / oa;
    img[i + 1] = (col[1] * a + img[i + 1] * ia * (1 - a)) / oa;
    img[i + 2] = (col[2] * a + img[i + 2] * ia * (1 - a)) / oa;
    img[i + 3] = oa * 255;
  }

  // Ramp + ordered dither: this is the stage that turns smooth procedural fields into
  // pixel art with a fixed number of colour steps (Pixel Composer's Colorize + Dither nodes).
  function colorize(L, F, img, w, h) {
    var rp = ramp(L.ramp || 'fire'), n = rp.length, dith = L.dither == null ? 0.6 : +L.dither, cut = L.cut == null ? 0.08 : +L.cut;
    var gain = L.gain == null ? 1 : +L.gain, mode = L.blend || 'normal', d = F.d;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var v = d[y * w + x] * gain;
      if (v <= 0) continue;
      var b = bayer(x, y) * dith;
      if (v + b * cut * 2 < cut) continue;
      var idx = clamp(Math.floor(clamp((v - cut) / (1 - cut), 0, 1) * n + b), 0, n - 1);
      var col = rp[idx], i = (y * w + x) * 4;
      if (mode === 'erase') { img[i + 3] = 0; continue; }
      if (mode === 'behind' && img[i + 3] > 0) continue;
      if (mode === 'add' && img[i + 3] > 0) {
        img[i] = Math.min(255, img[i] + col[0] * 0.6); img[i + 1] = Math.min(255, img[i + 1] + col[1] * 0.6); img[i + 2] = Math.min(255, img[i + 2] + col[2] * 0.6);
        continue;
      }
      img[i] = col[0]; img[i + 1] = col[1]; img[i + 2] = col[2]; img[i + 3] = col[3];
    }
  }

  // ── post passes ───────────────────────────────────────────────────────────
  var POST = {
    outline: {
      params: { color: { color: '#120a1a' }, corners: [0, 0, 1, 1] },
      run: function (o, img, w, h) {
        var col = hex(o.color || '#120a1a'), src = new Uint8ClampedArray(img), diag = (o.corners | 0) === 1;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4;
          if (src[i + 3] > 0) continue;
          var hit = false;
          for (var dy = -1; dy <= 1 && !hit; dy++) for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (!diag && dx && dy) continue;
            var nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && src[(ny * w + nx) * 4 + 3] > 0) { hit = true; break; }
          }
          if (hit) { img[i] = col[0]; img[i + 1] = col[1]; img[i + 2] = col[2]; img[i + 3] = 255; }
        }
      }
    },
    glow: {
      params: { radius: [2, 1, 6, 1], strength: [0.5, 0.05, 1, 0.05], threshold: [170, 0, 255, 1] },
      run: function (o, img, w, h) {
        // Stepped-alpha halo around bright pixels: smooth bloom would break the palette.
        var r = o.radius || 2, st = o.strength == null ? 0.5 : o.strength, th = o.threshold == null ? 170 : o.threshold, src = new Uint8ClampedArray(img);
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4;
          if (src[i + 3] > 0) continue;
          var best = -1, bd = 99;
          for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            var j = (ny * w + nx) * 4, d = Math.max(Math.abs(dx), Math.abs(dy));
            if (src[j + 3] > 0 && (src[j] + src[j + 1] + src[j + 2]) / 3 >= th && d < bd) { bd = d; best = j; }
          }
          if (best >= 0) {
            img[i] = src[best]; img[i + 1] = src[best + 1]; img[i + 2] = src[best + 2];
            img[i + 3] = Math.min(255, Math.round(255 * st * (1 - (bd - 1) / r)));
          }
        }
      }
    },
    palette: {
      params: { palette: { select: Object.keys(PALETTES) } },
      run: function (o, img) {
        var pal = (Array.isArray(o.palette) ? o.palette : PALETTES[o.palette] || PALETTES.db16).map(hex), cache = {};
        for (var i = 0; i < img.length; i += 4) {
          if (img[i + 3] === 0) continue;
          var key = (img[i] << 16) | (img[i + 1] << 8) | img[i + 2], best = cache[key];
          if (best == null) {
            var bd = 1e9;
            for (var p = 0; p < pal.length; p++) {
              var dr = img[i] - pal[p][0], dg = img[i + 1] - pal[p][1], db = img[i + 2] - pal[p][2], d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
              if (d < bd) { bd = d; best = p; }
            }
            cache[key] = best;
          }
          img[i] = pal[best][0]; img[i + 1] = pal[best][1]; img[i + 2] = pal[best][2];
        }
      }
    },
    alphaSteps: {
      params: { steps: [3, 1, 8, 1] },
      run: function (o, img) {
        var s = o.steps || 3;
        for (var i = 3; i < img.length; i += 4) if (img[i] > 0) img[i] = Math.max(1, Math.round(img[i] / 255 * s) / s * 255);
      }
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  function normalize(spec) {
    var s = JSON.parse(JSON.stringify(spec || {}));
    s.w = s.w || 64; s.h = s.h || 64; s.frames = s.frames || 16; s.fps = s.fps || 12;
    s.seed = s.seed == null ? 1 : s.seed; s.layers = s.layers || []; s.post = s.post || [];
    if (s.loop == null) s.loop = false;
    // Presets and hand-written specs list only what they change; everything else takes the
    // schema default so a spec stays short and survives new params being added later.
    s.layers = s.layers.map(function (L) {
      if (!TYPES[L.type]) return L;
      var d = defaults(L.type);
      for (var key in L) d[key] = L[key];
      return d;
    });
    return s;
  }

  function render(specIn, opts) {
    opts = opts || {};
    var spec = normalize(specIn), w = spec.w, h = spec.h, n = spec.frames, frames = [];
    var subCache = opts._subCache || {}, presets = opts.presets || api.presets, depth = opts._depth || 0;
    function sub(name) {
      if (depth > 3) return null;
      if (!subCache[name]) {
        var ps = presets[name];
        if (!ps) return null;
        subCache[name] = render(ps.spec || ps, { assets: opts.assets, presets: presets, _subCache: subCache, _depth: depth + 1 });
      }
      return subCache[name];
    }
    var F = new Field(w, h);
    for (var f = 0; f < n; f++) {
      // Looping clips sample t on [0,1) so the last frame flows into the first.
      var T = spec.loop ? f / n : (n > 1 ? f / (n - 1) : 0);
      var img = new Uint8ClampedArray(w * h * 4);
      for (var li = 0; li < spec.layers.length; li++) {
        var L = spec.layers[li];
        if (L.hidden) continue;
        var type = TYPES[L.type];
        if (!type) continue;
        var s0 = L.start == null ? 0 : L.start, s1 = L.end == null ? 1 : L.end;
        if (T < s0 || T > s1 + 1e-9) continue;
        var ctx = {
          w: w, h: h, T: T, t: clamp((T - s0) / Math.max(1e-6, s1 - s0), 0, 1), frame: f, n: n,
          seed: (spec.seed * 1000 + (L.seed == null ? li : L.seed)) | 0, loop: !!spec.loop, img: img, F: F, assets: opts.assets, sub: sub
        };
        if (type.field) {
          F.d.fill(0);
          type.render(L, ctx);
          colorize(L, F, img, w, h);
        } else type.render(L, ctx);
      }
      for (var pi = 0; pi < spec.post.length; pi++) {
        var po = spec.post[pi], pt = POST[po.type];
        if (pt && !po.hidden) pt.run(po, img, w, h);
      }
      var amp = P(spec.shake, T);
      if (amp >= 0.5) img = shift(img, w, h, Math.round((hash2(f, 1, spec.seed) - 0.5) * 2 * amp), Math.round((hash2(f, 2, spec.seed) - 0.5) * 2 * amp));
      frames.push(img);
    }
    return { w: w, h: h, n: n, fps: spec.fps, loop: !!spec.loop, frames: frames, spec: spec, meta: analyse(frames, w, h, spec) };
  }

  function shift(img, w, h, dx, dy) {
    var out = new Uint8ClampedArray(img.length);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var sx = clamp(x - dx, 0, w - 1), sy = clamp(y - dy, 0, h - 1), i = (y * w + x) * 4, j = (sy * w + sx) * 4;
      out[i] = img[j]; out[i + 1] = img[j + 1]; out[i + 2] = img[j + 2]; out[i + 3] = img[j + 3];
    }
    return out;
  }

  // Impact frame = the frame with the most bright coverage; games sync damage numbers / shake to it.
  function analyse(frames, w, h, spec) {
    var best = 0, bestScore = -1, colours = {};
    for (var f = 0; f < frames.length; f++) {
      var d = frames[f], score = 0;
      for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 0) {
        score += (d[i] + d[i + 1] + d[i + 2]) / 765;
        colours[(d[i] << 16) | (d[i + 1] << 8) | d[i + 2]] = 1;
      }
      if (score > bestScore) { bestScore = score; best = f; }
    }
    var pv = spec.pivot || [w / 2, h / 2];
    return { hit: spec.hit == null ? best : spec.hit, px: pv[0], py: pv[1], colors: Object.keys(colours).length };
  }

  function sheet(res, cols) {
    cols = cols || Math.min(res.n, Math.ceil(Math.sqrt(res.n * res.h / res.w)) || 1);
    var rows = Math.ceil(res.n / cols), W = cols * res.w, H = rows * res.h, data = new Uint8ClampedArray(W * H * 4);
    for (var f = 0; f < res.n; f++) {
      var ox = (f % cols) * res.w, oy = Math.floor(f / cols) * res.h, src = res.frames[f];
      for (var y = 0; y < res.h; y++) data.set(src.subarray(y * res.w * 4, (y + 1) * res.w * 4), ((oy + y) * W + ox) * 4);
    }
    return { w: W, h: H, cols: cols, rows: rows, data: data };
  }

  // Aseprite "array" JSON so Phaser/Godot/Aseprite importers read it as-is; the extra "pf"
  // block matches the AnimeVsPlus2 AVFX record ({fw,fh,cols,n,fps,loop,px,py,hit}).
  function metaJson(res, name, sh, image) {
    var dur = Math.round(1000 / res.fps), frames = [];
    for (var f = 0; f < res.n; f++) frames.push({
      filename: name + ' ' + f, frame: { x: (f % sh.cols) * res.w, y: Math.floor(f / sh.cols) * res.h, w: res.w, h: res.h },
      rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: res.w, h: res.h }, sourceSize: { w: res.w, h: res.h }, duration: dur
    });
    return {
      frames: frames,
      meta: {
        app: 'PixelForge', version: VERSION, image: image || (name + '.png'), format: 'RGBA8888', size: { w: sh.w, h: sh.h }, scale: '1',
        frameTags: [{ name: name, from: 0, to: res.n - 1, direction: 'forward' }]
      },
      pf: { name: name, fw: res.w, fh: res.h, cols: sh.cols, n: res.n, fps: res.fps, loop: res.loop, px: res.meta.px, py: res.meta.py, hit: res.meta.hit, seed: res.spec.seed }
    };
  }

  // ── GIF89a encoder (palette + LZW) ────────────────────────────────────────
  function encodeGIF(res, opt) {
    opt = opt || {};
    var s = Math.max(1, opt.scale | 0 || 1), W = res.w * s, H = res.h * s, bg = opt.background ? hex(opt.background) : null;
    var counts = {}, f, i, key;
    function px(fr, i4) {
      var a = fr[i4 + 3];
      if (bg) { var k = a / 255; return [Math.round(fr[i4] * k + bg[0] * (1 - k)), Math.round(fr[i4 + 1] * k + bg[1] * (1 - k)), Math.round(fr[i4 + 2] * k + bg[2] * (1 - k)), 255]; }
      return [fr[i4], fr[i4 + 1], fr[i4 + 2], a];
    }
    for (f = 0; f < res.n; f++) for (i = 0; i < res.frames[f].length; i += 4) {
      var p = px(res.frames[f], i);
      if (p[3] < 128) continue;
      key = (p[0] << 16) | (p[1] << 8) | p[2];
      counts[key] = (counts[key] || 0) + 1;
    }
    var keys = Object.keys(counts).map(Number).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 255);
    var pal = [[0, 0, 0]].concat(keys.map(function (k) { return [(k >> 16) & 255, (k >> 8) & 255, k & 255]; }));
    var index = {}, cache = {};
    keys.forEach(function (k, j) { index[k] = j + 1; });
    function lookup(p) {
      if (p[3] < 128) return 0;
      var k = (p[0] << 16) | (p[1] << 8) | p[2];
      if (index[k] != null) return index[k];
      if (cache[k] != null) return cache[k];
      var bd = 1e9, b = 1;
      for (var q = 1; q < pal.length; q++) { var d = Math.pow(p[0] - pal[q][0], 2) + Math.pow(p[1] - pal[q][1], 2) + Math.pow(p[2] - pal[q][2], 2); if (d < bd) { bd = d; b = q; } }
      return (cache[k] = b);
    }
    while (pal.length < 256) pal.push([0, 0, 0]);
    var out = [];
    function b8(v) { out.push(v & 255); }
    function b16(v) { out.push(v & 255, (v >> 8) & 255); }
    function str(t) { for (var k = 0; k < t.length; k++) out.push(t.charCodeAt(k)); }
    str('GIF89a'); b16(W); b16(H); b8(0xF7); b8(0); b8(0);
    for (i = 0; i < 256; i++) { b8(pal[i][0]); b8(pal[i][1]); b8(pal[i][2]); }
    str('\x21\xFF\x0BNETSCAPE2.0'); b8(3); b8(1); b16(res.loop || opt.loop !== false ? 0 : 1); b8(0);
    var delay = Math.max(2, Math.round(100 / res.fps));
    for (f = 0; f < res.n; f++) {
      b8(0x21); b8(0xF9); b8(4); b8(bg ? 0x04 : 0x09); b16(delay); b8(0); b8(0);
      b8(0x2C); b16(0); b16(0); b16(W); b16(H); b8(0);
      var idx = new Uint8Array(W * H), fr = res.frames[f];
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) idx[y * W + x] = lookup(px(fr, (Math.floor(y / s) * res.w + Math.floor(x / s)) * 4));
      lzw(idx, 8, out);
    }
    b8(0x3B);
    return new Uint8Array(out);
  }
  function lzw(pixels, minCode, out) {
    out.push(minCode);
    var clear = 1 << minCode, eoi = clear + 1, codeSize = minCode + 1, next = eoi + 1, dict = new Map();
    var bitBuf = 0, bitCnt = 0, block = [];
    function emit(code) {
      bitBuf |= code << bitCnt; bitCnt += codeSize;
      while (bitCnt >= 8) { block.push(bitBuf & 255); bitBuf >>>= 8; bitCnt -= 8; if (block.length === 255) { out.push(255); for (var k = 0; k < 255; k++) out.push(block[k]); block = []; } }
    }
    emit(clear);
    var prefix = pixels[0];
    for (var i = 1; i < pixels.length; i++) {
      var c = pixels[i], key = prefix * 256 + c, got = dict.get(key);
      if (got !== undefined) { prefix = got; continue; }
      emit(prefix);
      if (next < 4096) { dict.set(key, next++); if (next > (1 << codeSize) && codeSize < 12) codeSize++; }
      else { emit(clear); dict.clear(); codeSize = minCode + 1; next = eoi + 1; }
      prefix = c;
    }
    emit(prefix); emit(eoi);
    if (bitCnt > 0) block.push(bitBuf & 255);
    if (block.length) { out.push(block.length); for (var k = 0; k < block.length; k++) out.push(block[k]); }
    out.push(0);
  }

  // Schema for UI generation: common keys + per-type params.
  function schema(type) {
    var t = TYPES[type];
    if (!t) return null;
    var out = {};
    for (var k in t.params) out[k] = t.params[k];
    if (t.field) for (var c in COMMON) out[c] = COMMON[c];
    else { out.start = COMMON.start; out.end = COMMON.end; }
    return out;
  }
  function defaults(type) {
    var sc = schema(type), L = { type: type };
    for (var k in sc) {
      var d = sc[k];
      if (Array.isArray(d)) L[k] = JSON.parse(JSON.stringify(d[0]));
      else if (d.select) L[k] = d.select[0];
      else if (d.ramp) L[k] = d.ramp;
      else if (d.color != null) L[k] = d.color;
      else if (d.text != null) L[k] = d.text;
      else if (d.preset) L[k] = d.preset;
    }
    return L;
  }

  var api = {
    VERSION: VERSION, render: render, sheet: sheet, metaJson: metaJson, encodeGIF: encodeGIF,
    TYPES: TYPES, POST: POST, RAMPS: RAMPS, PALETTES: PALETTES, EASE: EASE, POSES: POSES,
    schema: schema, defaults: defaults, param: P, hex: hex, toHex: toHex, presets: {}, ICONS: ICONS,
    // Presets register themselves here (presets.js) so render() can resolve `effect` layers.
    register: function (name, def) { api.presets[name] = def; }
  };
  return api;
});
