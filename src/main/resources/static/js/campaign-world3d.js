/**
 * Campaign HD-2D world renderer — a port of AnimeVsPlus2/js/world3d.js (three.js r149).
 * Real 3D town: procedural pixel-textured ground (sandstone flagstones, sand, grass, dirt), sandstone
 * houses with pitched shingle roofs and lit windows, a stepped pyramid shrine, a colosseum, obelisk
 * waystones, 3D palms and leaf trees, lamp posts that are real point lights, a fountain and an oasis pool.
 * Squire Bob, the starter follower and ambient Siegelings are upright cut-outs that cast real shadows.
 * The scene renders ~330px tall and is upscaled with nearest-neighbour, then a post pass adds
 * tilt-shift depth of field, glow, warm grading and a vignette — the AnimeVs look.
 * Movement, collision queries and interaction prompts stay in campaign-overworld.js.
 */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  if (!THREE) return;

  var BOB = '/img/sprites/squire-bob/';
  var BOB_ASSET_VERSION = '2';
  var SANC = '/img/campaign/sanctuary/';
  var PX = 16;
  var BOB_DIRS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
  var BOB_POSES = ['idle', 'walk-a', 'walk-b'];

  function V3(x, y, z) { return new THREE.Vector3(x, y, z); }
  function col(c) { return new THREE.Color(c); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(x, a, b) { return THREE.MathUtils.smoothstep(x, a, b); }
  function rng(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    var h = 2166136261, str = String(s), i;
    for (i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function pick(r, a) { return a[Math.floor(r() * a.length)]; }
  function srgb(t) {
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding != null) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function nearest(t) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }
  function canvasTex(w, h, paint) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    return nearest(new THREE.CanvasTexture(c));
  }

  // ------------------------------------------------------------------ looks (golden-hour oasis + one per element)
  var LOOK = {
    oasis: {
      grass: ['#7fae4b', '#6fa043', '#8cbc55', '#5e9038'], sand: ['#d9bb88', '#cfae7a', '#e2c696', '#c29e6c'],
      stone: ['#ecd3a2', '#dfc18e', '#f4dfb4', '#d0b07c'], mortar: '#9a7444', dirt: ['#c9945a', '#b8844c', '#d6a46a'],
      sky: '#f4ad78', fog: '#eeb183', sun: '#ffd29a', sunI: 0.82, hemiS: '#ffe6c8', hemiG: '#6a4a5a', hemiI: 0.5,
      lampI: 0.5, leaf: ['#5e8f3a', '#6fa043', '#4f7d31', '#82b04f'], trunk: '#8a6238',
      frond: ['#4f8a34', '#5e9a3c', '#6fae46', '#3f7a2c'], water: ['#3fa6c8', '#2f8fb8', '#5cc0dc', '#2a7aa6'],
      grade: [1.03, 0.99, 0.93], night: 0.25, edge: 'palm'
    },
    ember: {
      grass: ['#c9a05a', '#bb924e', '#d6b06a', '#a9824a'], sand: ['#d9a46a', '#cc965c', '#e6b47c', '#bf884f'],
      stone: ['#c9a080', '#b88e70', '#d6b08e', '#a87e62'], mortar: '#6a4434', dirt: ['#a86a44', '#985c3a', '#b87a50'],
      sky: '#ff9a62', fog: '#f0946a', sun: '#ffc890', sunI: 0.85, hemiS: '#ffd8b4', hemiG: '#7a3a2a', hemiI: 0.48,
      lampI: 0.45, leaf: ['#9aa040', '#aab04a', '#88903a', '#bac058'], trunk: '#6a4028',
      frond: ['#7a8a30', '#8a9a3a', '#9aaa46', '#6a7a2a'], water: ['#e0602a', '#ff8e3c', '#ffb050', '#c04a1e'],
      grade: [1.05, 0.98, 0.9], night: 0.25, edge: 'palm'
    },
    frost: {
      grass: ['#eef6ff', '#e0ecf8', '#f8fcff', '#d4e4f2'], sand: ['#d6e2ee', '#c8d6e6', '#e2ecf6', '#b8c8dc'],
      stone: ['#b9c4d2', '#a9b6c6', '#c9d2de', '#9daabb'], mortar: '#6f7f94', dirt: ['#a8b8cc', '#98aabe', '#b8c8da'],
      sky: '#c9dcf2', fog: '#d6e4f4', sun: '#ffe8d0', sunI: 0.66, hemiS: '#dfeaff', hemiG: '#6a7a9a', hemiI: 0.5,
      lampI: 0.55, leaf: ['#e8f2fa', '#d4e4f2', '#f6fbff', '#c2d6ea'], trunk: '#5a4636',
      frond: ['#4f7a6a', '#5a8a7a', '#6a9a8a', '#3f6a5a'], water: ['#8fc8ec', '#a8d8f4', '#c8e8fc', '#78b4dc'],
      grade: [0.98, 1.0, 1.07], night: 0.25, edge: 'pine'
    },
    verdant: {
      grass: ['#6fae4b', '#62a142', '#7dbb55', '#57923a'], sand: ['#c9b47e', '#bca670', '#d6c28c', '#ae9862'],
      stone: ['#b8a68a', '#a8967a', '#c6b498', '#9a8a70'], mortar: '#6a5c44', dirt: ['#b98a5a', '#a87a4c', '#c69866'],
      sky: '#f2c08a', fog: '#e8b888', sun: '#ffdca8', sunI: 0.9, hemiS: '#fff0d4', hemiG: '#4a5a4a', hemiI: 0.55,
      lampI: 0.5, leaf: ['#5e8f3a', '#6fa043', '#4f7d31', '#82b04f'], trunk: '#6b4a2b',
      frond: ['#4f8a34', '#5e9a3c', '#6fae46', '#3f7a2c'], water: ['#3f9ac8', '#2f86b4', '#5cb4dc', '#2a72a0'],
      grade: [1.03, 1.0, 0.92], night: 0.25, edge: 'tree'
    },
    tide: {
      grass: ['#78b878', '#6aa86a', '#88c488', '#5a985a'], sand: ['#e2d2aa', '#d6c49a', '#ead9b6', '#c8b488'],
      stone: ['#c8d6dc', '#b8c8d0', '#d6e2e8', '#a8b8c2'], mortar: '#5a7080', dirt: ['#c8b48a', '#b8a47a', '#d6c49a'],
      sky: '#9ad0ee', fog: '#a8d4ec', sun: '#fff0d0', sunI: 0.9, hemiS: '#e4f4ff', hemiG: '#3a5a6a', hemiI: 0.6,
      lampI: 0.45, leaf: ['#4f9a5a', '#5aaa66', '#3f8a4a', '#6aba76'], trunk: '#7a5a3a',
      frond: ['#3f8a4a', '#4f9a56', '#5aaa62', '#2f7a3a'], water: ['#2f9ad0', '#3fb0e0', '#6acaf0', '#2480b8'],
      grade: [0.98, 1.02, 1.06], night: 0.2, edge: 'palm'
    },
    storm: {
      grass: ['#4f5568', '#474c5e', '#585e72', '#40455a'], sand: ['#5a5e70', '#50546a', '#646878', '#484c60'],
      stone: ['#6a6e84', '#5e6278', '#767a90', '#55596e'], mortar: '#2e3142', dirt: ['#3a3e50', '#33374a', '#424658'],
      sky: '#1a1638', fog: '#2a2448', sun: '#8a7cff', sunI: 0.45, hemiS: '#6a6ac8', hemiG: '#201a30', hemiI: 0.6,
      lampI: 2.0, leaf: ['#3f6e46', '#4a7a50', '#35603c', '#58885a'], trunk: '#3a3044',
      frond: ['#3f6e46', '#4a7a50', '#35603c', '#58885a'], water: ['#3a4aa0', '#4a5ac0', '#6a7ae0', '#2a3a80'],
      grade: [0.95, 0.98, 1.12], night: 0.85, edge: 'tree'
    },
    abyss: {
      grass: ['#3b3348', '#342d40', '#433a52', '#2d2738'], sand: ['#443a50', '#3a3246', '#4e4458', '#322a3e'],
      stone: ['#4a4458', '#403b4d', '#55506a', '#3a3546'], mortar: '#1f1a28', dirt: ['#3a3040', '#322838', '#42384a'],
      sky: '#1a0f24', fog: '#2a1a34', sun: '#b38aff', sunI: 0.4, hemiS: '#7a5a9a', hemiG: '#1a1220', hemiI: 0.55,
      lampI: 2.0, leaf: ['#4a3a5a', '#5a466a', '#3a2e48', '#6a557a'], trunk: '#2a2230',
      frond: ['#4a3a5a', '#5a466a', '#3a2e48', '#6a557a'], water: ['#5a2a7a', '#7a3a9a', '#9a5aba', '#4a1a6a'],
      grade: [1.0, 0.94, 1.1], night: 0.9, edge: 'tree'
    },
    toxic: {
      grass: ['#5a7a3a', '#4e6e32', '#668644', '#44622a'], sand: ['#7a7a4a', '#6e6e40', '#868654', '#62623a'],
      stone: ['#6a6a5a', '#5e5e4e', '#767666', '#525244'], mortar: '#2a2a1e', dirt: ['#5a4a3a', '#4e4032', '#665644'],
      sky: '#3a2a4a', fog: '#4a3a4a', sun: '#c8ff8a', sunI: 0.55, hemiS: '#b8e08a', hemiG: '#2a1a30', hemiI: 0.6,
      lampI: 1.6, leaf: ['#6a8a3a', '#7a9a44', '#5a7a30', '#8aaa4e'], trunk: '#3a2a2a',
      frond: ['#5a7a30', '#6a8a3a', '#7a9a44', '#4a6a2a'], water: ['#7ad84a', '#9aee5a', '#b8ff7a', '#5ab83a'],
      grade: [1.0, 1.04, 0.94], night: 0.7, edge: 'tree'
    },
    rift: {
      grass: ['#3d3a7a', '#35326e', '#4a468f', '#2f2c63'], sand: ['#5a56a0', '#4e4a92', '#6662ae', '#46428a'],
      stone: ['#d8daf5', '#c8cbec', '#e6e8ff', '#b8bce0'], mortar: '#6a62b0', dirt: ['#5a56a0', '#4e4a92', '#6662ae'],
      sky: '#1a1648', fog: '#2a2460', sun: '#c9b6ff', sunI: 0.6, hemiS: '#9a8aff', hemiG: '#1a1640', hemiI: 0.7,
      lampI: 1.8, leaf: ['#5a8fd0', '#6a9fe0', '#4a7fc0', '#7ab0f0'], trunk: '#2a2660',
      frond: ['#5a8fd0', '#6a9fe0', '#4a7fc0', '#7ab0f0'], water: ['#8a7aff', '#aa9aff', '#ccc0ff', '#6a5ae0'],
      grade: [0.98, 0.98, 1.1], night: 0.7, edge: 'tree'
    }
  };
  var ELEMENT_LOOK = {
    fire: 'ember', earth: 'verdant', wind: 'verdant', ice: 'frost', water: 'tide', electric: 'storm',
    metal: 'storm', shadow: 'abyss', undead: 'abyss', poison: 'toxic', psychic: 'rift', light: 'oasis', neutral: 'verdant'
  };
  var ELEMENT_GLOW = {
    fire: '#ff7a3a', water: '#3aa8ff', ice: '#9ad8ff', wind: '#7ae0a0', earth: '#c8a050', electric: '#ffe04a',
    metal: '#c8d0dc', poison: '#b06aff', shadow: '#8a5aff', psychic: '#ff6ad0', light: '#fff0a0', undead: '#9affc8', neutral: '#e8e0c8'
  };

  var THEMES = {
    sandstone: { wall: ['#f0dcb2', '#e4cc9c'], beam: '#a8743e', roof: ['#d9823f', '#b86a2f', '#e8954f'], door: '#6b3d1e', window: '#8fd3ff', trim: '#8a5a2b' },
    timber: { wall: ['#efe3c6', '#d9c9a3'], beam: '#6b4a2b', roof: ['#b5473a', '#963629', '#c95a49'], door: '#5a3a20', window: '#8fd3ff', trim: '#4a3220' },
    stone: { wall: ['#b8b4a8', '#a8a498'], beam: '#7a766a', roof: ['#4a5fc9', '#3a4db0', '#6a7fe0'], door: '#3a2a1a', window: '#ffd27a', trim: '#5a564a' }
  };

  // ------------------------------------------------------------------ procedural pixel textures
  /** Irregular flagstones (voronoi cells with mortar), like a hand-laid plaza. */
  function cobbleTex(L, seed) {
    return canvasTex(PX * 2, PX * 2, function (g, w, h) {
      var r = rng(seed), pts = [], P = [], i, x, y, dx, dy;
      for (i = 0; i < 14; i++) pts.push([r() * w, r() * h, pick(r, L.stone)]);
      pts.forEach(function (p) {
        [-w, 0, w].forEach(function (ox) { [-h, 0, h].forEach(function (oy) { P.push([p[0] + ox, p[1] + oy, p[2]]); }); });
      });
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          var a = 1e9, b = 1e9, c = null;
          for (i = 0; i < P.length; i++) {
            dx = P[i][0] - x; dy = P[i][1] - y;
            var d = dx * dx + dy * dy;
            if (d < a) { b = a; a = d; c = P[i][2]; } else if (d < b) b = d;
          }
          var edge = Math.sqrt(b) - Math.sqrt(a);
          g.fillStyle = edge < 1.1 ? L.mortar : c;
          g.fillRect(x, y, 1, 1);
          if (edge >= 1.1 && edge < 2.2 && r() < 0.5) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y, 1, 1); }
          else if (edge > 3 && r() < 0.05) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, 1, 1); }
        }
      }
    });
  }
  /**
   * Clumped ground noise. Per-texel random noise gets foreshortened by the offset camera into
   * horizontal dashes, so colour is laid down in soft 2-3 texel blobs over a flat base instead.
   */
  function clumpPaint(g, w, h, pal, r, density) {
    var x, y, i, n, c;
    g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
    n = Math.round(w * h * density / 5);
    for (i = 0; i < n; i++) {
      x = Math.floor(r() * w); y = Math.floor(r() * h);
      c = r() < 0.6 ? pal[1] : r() < 0.7 ? pal[2] : pal[3];
      g.fillStyle = c;
      g.fillRect(x, y, 2, 2);
      if (r() < 0.5) g.fillRect((x + 2) % w, y, 1, 2);
      if (r() < 0.5) g.fillRect(x, (y + 2) % h, 2, 1);
      if (x > w - 2) g.fillRect(0, y, 2 - (w - x), 2);
      if (y > h - 2) g.fillRect(x, 0, 2, 2 - (h - y));
    }
  }
  function noiseTex(pal, seed, tufts) {
    return canvasTex(PX * 2, PX * 2, function (g, w, h) {
      var r = rng(seed), x, y, i;
      clumpPaint(g, w, h, pal, r, 0.55);
      for (i = 0; i < (tufts || 0); i++) {
        x = Math.floor(r() * w); y = Math.floor(r() * h);
        g.fillStyle = pal[2]; g.fillRect(x, y, 1, 2);
        g.fillStyle = pal[3]; g.fillRect(x + 1, y + 1, 1, 1);
      }
    });
  }
  /** Sand: soft clumps, a few wind ripples and the odd pebble. */
  function sandTex(L, seed) {
    return canvasTex(PX * 2, PX * 2, function (g, w, h) {
      var r = rng(seed), x, y, i;
      clumpPaint(g, w, h, L.sand, r, 0.4);
      for (i = 0; i < 3; i++) {
        x = Math.floor(r() * w); y = Math.floor(r() * h);
        g.fillStyle = 'rgba(120,80,40,.10)'; g.fillRect(x, y, 3, 1); g.fillRect(x + 3, y + 1, 3, 1);
      }
      for (i = 0; i < 3; i++) {
        x = Math.floor(r() * w); y = Math.floor(r() * h);
        g.fillStyle = L.mortar; g.fillRect(x, y, 1, 1);
      }
    });
  }
  function waterTex(L) {
    var t = canvasTex(PX * 2, PX * 2, function (g, w, h) {
      var r = rng(91), x, y, i;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          var v = r();
          g.fillStyle = v < 0.6 ? L.water[0] : v < 0.85 ? L.water[1] : L.water[3];
          g.fillRect(x, y, 1, 1);
        }
      }
      for (i = 0; i < 9; i++) {
        x = Math.floor(r() * w); y = Math.floor(r() * h);
        g.fillStyle = L.water[2]; g.fillRect(x, y, 3 + Math.floor(r() * 3), 1);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function shingleTex(theme, wpx, hpx, seed) {
    return canvasTex(wpx, hpx, function (g, w, h) {
      var r = rng(seed), x, y;
      for (y = 0; y < h; y += 4) {
        for (x = -((y / 4) % 2) * 4; x < w; x += 8) {
          g.fillStyle = pick(r, theme.roof); g.fillRect(x, y, 8, 4);
          g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, y + 3, 8, 1); g.fillRect(x + 7, y, 1, 4);
          g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, 7, 1);
        }
      }
    });
  }
  /** Sandstone blocks with mortar lines and the occasional carved glyph. */
  function brickTex(L, wpx, hpx, seed, glyphs) {
    return canvasTex(wpx, hpx, function (g, w, h) {
      var r = rng(seed), x, y, row = 0;
      for (y = 0; y < h; y += 5, row++) {
        for (x = -(row % 2) * 5; x < w; x += 10) {
          g.fillStyle = pick(r, L.stone); g.fillRect(x, y, 10, 5);
          g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, y + 4, 10, 1); g.fillRect(x + 9, y, 1, 5);
          g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x, y, 9, 1);
          if (glyphs && r() < 0.08) { g.fillStyle = 'rgba(90,50,20,.55)'; g.fillRect(x + 3, y + 1, 1, 3); g.fillRect(x + 5, y + 1, 2, 1); g.fillRect(x + 6, y + 2, 1, 2); }
        }
      }
    });
  }
  /** Wall face: plaster + beams + windows (+ door). Returns colour and emissive (lit windows) maps. */
  function wallTex(theme, wTiles, hUnits, opts) {
    var w = Math.round(wTiles * PX), h = Math.round(hUnits * PX);
    function paint(g, emissive) {
      var r = rng(opts.seed), x, y, i;
      if (!emissive) {
        for (y = 0; y < h; y++) for (x = 0; x < w; x++) { g.fillStyle = r() < 0.8 ? theme.wall[0] : theme.wall[1]; g.fillRect(x, y, 1, 1); }
        g.fillStyle = theme.beam;
        g.fillRect(0, 0, w, 2); g.fillRect(0, h - 3, w, 3); g.fillRect(0, Math.round(h * 0.48), w, 2);
        for (x = 0; x <= w; x += PX * 2) g.fillRect(Math.min(w - 2, x), 0, 2, h);
        if (opts.braces !== false) {
          for (x = PX; x < w - PX; x += PX * 4) for (i = 0; i < PX; i++) g.fillRect(x + i, Math.round(h * 0.48) - Math.round(i * h * 0.46 / PX), 1, 2);
        }
      } else {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      }
      var rows = hUnits > 2.4 ? [0.18, 0.6] : [0.42];
      rows.forEach(function (ry) {
        for (var tx = 0.5; tx < wTiles - 0.4; tx += 2) {
          var cx = Math.round((tx + 0.5) * PX);
          if (opts.door != null && Math.abs(cx - (opts.door + 0.5) * PX) < PX) continue;
          var wx = cx - 5, wy = Math.round(ry * h), ww = 10, wh = 9;
          if (!emissive) {
            g.fillStyle = theme.trim; g.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
            g.fillStyle = theme.window; g.fillRect(wx, wy, ww, wh);
            g.fillStyle = theme.trim; g.fillRect(wx + ww / 2 - 0.5, wy, 1, wh); g.fillRect(wx, wy + Math.floor(wh / 2), ww, 1);
            g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(wx + 1, wy + 1, 2, 2);
          } else {
            g.fillStyle = opts.glow; g.fillRect(wx, wy, ww, wh);
            g.fillStyle = '#000'; g.fillRect(wx + ww / 2 - 0.5, wy, 1, wh); g.fillRect(wx, wy + Math.floor(wh / 2), ww, 1);
          }
        }
      });
      if (opts.door != null) {
        var dx = Math.round(opts.door * PX + 2), dw = PX - 4, dh = Math.min(h - 4, 22);
        if (!emissive) {
          g.fillStyle = theme.trim; g.fillRect(dx - 1, h - dh - 1, dw + 2, dh + 1);
          g.fillStyle = theme.door; g.fillRect(dx, h - dh, dw, dh);
          g.fillStyle = 'rgba(0,0,0,.25)'; for (x = dx + 3; x < dx + dw; x += 4) g.fillRect(x, h - dh, 1, dh);
          g.fillStyle = '#e8c060'; g.fillRect(dx + dw - 3, h - dh / 2, 2, 2);
        } else {
          g.fillStyle = '#3a2410'; g.fillRect(dx, h - 3, dw, 3);
        }
      }
    }
    return {
      map: canvasTex(w, h, function (g) { paint(g, false); }),
      emissive: canvasTex(w, h, function (g) { paint(g, true); })
    };
  }
  /** Colosseum wall: sandstone with two tiers of dark arches. */
  function arenaWallTex(L, wpx, hpx) {
    return canvasTex(wpx, hpx, function (g, w, h) {
      var r = rng(404), x, y, row = 0;
      for (y = 0; y < h; y += 5, row++) {
        for (x = -(row % 2) * 5; x < w; x += 10) {
          g.fillStyle = pick(r, L.stone); g.fillRect(x, y, 10, 5);
          g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + 4, 10, 1);
        }
      }
      [[0.14, 0.4], [0.56, 0.36]].forEach(function (tier) {
        var ay = Math.round(tier[0] * h), ah = Math.round(tier[1] * h);
        for (x = 3; x < w - 8; x += 14) {
          g.fillStyle = 'rgba(70,40,20,.9)'; g.fillRect(x - 1, ay - 1, 10, ah + 1);
          g.fillStyle = '#2a1810'; g.fillRect(x, ay + 2, 8, ah - 2);
          g.fillRect(x + 1, ay + 1, 6, 1); g.fillRect(x + 2, ay, 4, 1);
          g.fillStyle = 'rgba(255,200,120,.25)'; g.fillRect(x, ay + ah - 2, 8, 1);
        }
      });
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, h - 3, w, 3);
      g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, 0, w, 1);
    });
  }
  /** Palm frond: rib + feathered leaflets on transparent ground (alpha-tested). */
  function frondTex() {
    return canvasTex(16, 48, function (g, w, h) {
      var y;
      for (y = 2; y < h; y++) {
        var t = y / h, span = Math.round((1 - Math.abs(t - 0.45) * 1.6) * 7);
        if (span < 1) span = 1;
        g.fillStyle = y % 3 === 0 ? '#c8c8c8' : '#ffffff';
        g.fillRect(8 - span, y, span, 1);
        g.fillStyle = y % 3 === 1 ? '#c8c8c8' : '#eeeeee';
        g.fillRect(8, y, span, 1);
        if (y % 4 === 0) { g.clearRect(8 - span, y, Math.max(1, span - 3), 1); g.clearRect(9 + 3, y, Math.max(1, span - 3), 1); }
      }
      g.fillStyle = '#9a9a9a'; g.fillRect(7, 0, 2, h);
    });
  }
  function trunkTex() {
    return canvasTex(8, 16, function (g, w, h) {
      var y;
      for (y = 0; y < h; y++) { g.fillStyle = y % 4 === 0 ? '#5a3c22' : y % 4 === 1 ? '#a87a4c' : '#8a6238'; g.fillRect(0, y, w, 1); }
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(w - 2, 0, 2, h);
    });
  }
  function stripeTex(a, b) {
    return canvasTex(16, 8, function (g) {
      var x;
      for (x = 0; x < 16; x += 4) { g.fillStyle = (x / 4) % 2 ? b : a; g.fillRect(x, 0, 4, 8); }
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, 7, 16, 1);
    });
  }

  // ------------------------------------------------------------------ geometry helpers
  /** Pitched roof (ridge along X): two slopes, UV'd for the shingle texture. */
  function roofGeo(w, d, rise, over) {
    var x0 = -w / 2 - over, x1 = w / 2 + over, zf = d / 2 + over, zb = -d / 2 - over;
    var v = [], uv = [], gi = [];
    function quad(a, b, c, e) {
      var i = v.length / 3;
      v.push.apply(v, a.concat(b, c, e));
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      gi.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
    quad([x0, 0, zf], [x1, 0, zf], [x1, rise, 0], [x0, rise, 0]);
    quad([x1, 0, zb], [x0, 0, zb], [x0, rise, 0], [x1, rise, 0]);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(gi);
    g.computeVertexNormals();
    g.userData.slope = Math.hypot(d / 2 + over, rise);
    return g;
  }
  function gableGeo(w, d, rise) {
    var v = [], gi = [];
    [-1, 1].forEach(function (sx) {
      var x = sx * w / 2, i = v.length / 3;
      v.push(x, 0, d / 2, x, 0, -d / 2, x, rise, 0);
      if (sx > 0) gi.push(i, i + 1, i + 2); else gi.push(i, i + 2, i + 1);
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(gi);
    g.computeVertexNormals();
    return g;
  }
  /** Drooping palm frond: a bent strip pointing along +X from the crown. */
  function frondGeo() {
    var g = new THREE.PlaneGeometry(0.5, 1.7, 1, 6);
    var p = g.attributes.position, i;
    for (i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i) + 0.85;
      p.setXYZ(i, y * 0.92, 0.5 * y - 0.36 * y * y, x * (1 - y / 2.4));
    }
    g.computeVertexNormals();
    return g;
  }

  // ------------------------------------------------------------------ post (tilt-shift DOF + glow + grade + vignette)
  var POST_FS = [
    'uniform sampler2D tDiffuse; uniform vec2 res; uniform vec3 grade; uniform float night; varying vec2 vUv;',
    'void main() {',
    '  vec3 sharp = texture2D(tDiffuse, vUv).rgb;',
    '  float d = abs(vUv.y - 0.46);',
    '  float amt = smoothstep(0.16, 0.5, d) * 3.2;',
    '  vec3 acc = sharp; float n = 1.0;',
    '  for (int i = 0; i < 10; i++) { float a = float(i) * 0.628318; vec2 o = vec2(cos(a), sin(a)) / res;',
    '    acc += texture2D(tDiffuse, vUv + o * amt).rgb; acc += texture2D(tDiffuse, vUv + o * amt * 0.5).rgb; n += 2.0; }',
    '  vec3 blur = acc / n;',
    '  vec3 c = mix(sharp, blur, clamp(amt / 2.2, 0.0, 1.0));',
    '  vec3 g2 = vec3(0.0);',
    '  for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; vec3 s = texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * 4.0 / res).rgb;',
    '    g2 += s * max(dot(s, vec3(0.299, 0.587, 0.114)) - 0.84, 0.0); }',
    '  c += g2 * (0.18 + night * 0.5);',
    '  c *= grade;',
    '  vec2 q = (vUv - 0.5) * vec2(1.0, 1.15);',
    '  c *= 1.0 - dot(q, q) * 0.95;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');
  var POST_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  function supported() {
    try {
      var c = document.createElement('canvas');
      return !!(root.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }

  // ================================================================== World3D
  function World3D(opts) {
    this.host = opts.host;
    this.ready = false;
    this.buildings = [];
    this.spawn = { x: 16, z: 20 };
    this.mapW = 32;
    this.mapH = 24;
    if (!supported()) return;
    try { this._init(); } catch (e) { this.ready = false; }
  }
  World3D.supported = supported;

  World3D.prototype._init = function () {
    var host = this.host;
    host.innerHTML = '';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cm-ow3-canvas';
    host.appendChild(this.canvas);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'cm-w3-labels';
    host.appendChild(this.labelLayer);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    if (!this.renderer.getContext()) throw new Error('no gl');
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.post = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, res: { value: new THREE.Vector2(4, 4) }, grade: { value: V3(1, 1, 1) }, night: { value: 0 } },
      vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false
    });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));

    this.loader = new THREE.TextureLoader();
    this.imgTex = {};
    this.bobTex = {};
    this._preloadBob();
    this.frondTexture = frondTex();
    this.trunkTexture = trunkTex();
    this.frondTexture.userData.shared = this.trunkTexture.userData.shared = true;

    this.ready = true;
    var self = this;
    this._onResize = function () { self.resize(); };
    root.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(host);
    }
    this.resize();
  };

  /** HD sprites are downsampled hard by the ~330px buffer: mipmaps keep them from shimmering. */
  World3D.prototype._spriteTex = function (url, onload) {
    if (this.imgTex[url]) {
      if (onload && this.imgTex[url].image && this.imgTex[url].image.width) onload(this.imgTex[url]);
      else if (onload) (this.imgTex[url].userData.waiters = this.imgTex[url].userData.waiters || []).push(onload);
      return this.imgTex[url];
    }
    var t = this.loader.load(url, function (tex) {
      (tex.userData.waiters || []).forEach(function (f) { f(tex); });
      tex.userData.waiters = null;
    });
    srgb(t);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.userData.shared = true;
    t.userData.waiters = onload ? [onload] : [];
    this.imgTex[url] = t;
    return t;
  };

  World3D.prototype._preloadBob = function () {
    var self = this;
    BOB_DIRS.forEach(function (d) {
      BOB_POSES.forEach(function (p) {
        var key = d + '-' + p;
        self.bobTex[key] = self._spriteTex(BOB + key + '.webp?v=' + BOB_ASSET_VERSION);
      });
    });
  };

  World3D.prototype.resize = function () {
    if (!this.renderer) return;
    var w = this.host.clientWidth, h = this.host.clientHeight;
    if (w < 8 || h < 8) return;
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    // ~330 rendered rows, upscaled nearest-neighbour: the chunky HD-2D pixel look.
    var pr = clamp(330 / h, 0.25, 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    var bw = Math.round(w * pr), bh = Math.round(h * pr);
    this.rt.setSize(bw, bh);
    this.post.uniforms.res.value.set(bw, bh);
    this.camera.aspect = w / h;
    this.camera.fov = this._fov();
    this.camera.updateProjectionMatrix();
  };
  World3D.prototype._fov = function () {
    var a = this.camera.aspect;
    return a < 0.8 ? 46 : a < 1.2 ? 38 : 30;
  };

  // ------------------------------------------------------------------ scene lifecycle
  World3D.prototype._newScene = function (lookKey, mapW, mapH, seed) {
    this._disposeScene();
    var L = this.L = LOOK[lookKey] || LOOK.oasis;
    this.mapW = mapW; this.mapH = mapH;
    this.rnd = rng(seed);
    var S = this.scene = new THREE.Scene();
    S.background = col(L.sky);
    S.fog = new THREE.Fog(col(L.fog), 26, 60);
    this.post.uniforms.grade.value.set(L.grade[0], L.grade[1], L.grade[2]);
    this.post.uniforms.night.value = L.night;
    this.hemi = new THREE.HemisphereLight(col(L.hemiS), col(L.hemiG), L.hemiI);
    S.add(this.hemi);
    var sun = this.sun = new THREE.DirectionalLight(col(L.sun), L.sunI);
    sun.castShadow = true;
    var mobile = Math.min(root.innerWidth, root.innerHeight) < 600;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    var sc = sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    S.add(sun, sun.target);
    this.sunOff = V3(-9, 13, -7);

    this.solid = new Uint8Array(mapW * mapH);
    this.circles = [];
    this.buildings = [];
    this.lampLights = [];
    this.trees = [];
    this.crystals = [];
    this.npcs = [];
    this.spray = null;
    this.water = null;
    this.motes = null;
    this.actors = {};
    this.trail = [];
    this.camPos = null;
    this.labelLayer.innerHTML = '';
  };

  World3D.prototype._disposeScene = function () {
    if (!this.scene) return;
    this.scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      [].concat(o.material || [], o.customDepthMaterial || []).forEach(function (m) {
        ['map', 'emissiveMap'].forEach(function (k) {
          if (m[k] && !(m[k].userData && m[k].userData.shared)) m[k].dispose();
        });
        m.dispose();
      });
    });
    if (this.sun && this.sun.shadow.map) this.sun.shadow.map.dispose();
    this.scene = null;
  };

  World3D.prototype.dispose = function () {
    this._disposeScene();
    if (this._ro) { try { this._ro.disconnect(); } catch (e) { /* already gone */ } this._ro = null; }
    root.removeEventListener('resize', this._onResize);
    if (this.rt) this.rt.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      // Browsers cap live WebGL contexts (~16); Sanctuary <-> realm swaps would exhaust them.
      this.renderer.forceContextLoss();
    }
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    if (this.labelLayer && this.labelLayer.parentNode) this.labelLayer.parentNode.removeChild(this.labelLayer);
    this.ready = false;
  };

  // ------------------------------------------------------------------ collision bookkeeping
  World3D.prototype._solidRect = function (x0, z0, x1, z1) {
    var x, z;
    for (z = Math.max(0, Math.floor(z0)); z < Math.min(this.mapH, Math.ceil(z1)); z++) {
      for (x = Math.max(0, Math.floor(x0)); x < Math.min(this.mapW, Math.ceil(x1)); x++) this.solid[z * this.mapW + x] = 1;
    }
  };
  /** True when a body of radius r centred at (x,z) would overlap scenery or leave the map. */
  World3D.prototype.isBlocked = function (x, z, r) {
    r = r == null ? 0.26 : r;
    if (x - r < 0.6 || z - r < 0.6 || x + r > this.mapW - 0.6 || z + r > this.mapH - 0.6) return true;
    var pts = [[x - r, z - r], [x + r, z - r], [x - r, z + r], [x + r, z + r], [x, z]], i;
    for (i = 0; i < pts.length; i++) {
      var tx = Math.floor(pts[i][0]), tz = Math.floor(pts[i][1]);
      if (this.solid[tz * this.mapW + tx]) return true;
    }
    for (i = 0; i < this.circles.length; i++) {
      var c = this.circles[i], dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return true;
    }
    return false;
  };

  // ------------------------------------------------------------------ ground
  /** Tiles: kindAt(x,z) → 'plaza' | 'road' | 'sand' | 'grass' | 'water'. */
  World3D.prototype._ground = function (kindAt) {
    var S = this.scene, L = this.L;
    var W = this.mapW, H = this.mapH, x, z, k;
    var lists = { plaza: [], road: [], sand: [], grass: [], water: [] };
    var kinds = new Array(W * H);
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      k = kindAt(x, z) || 'sand';
      kinds[z * W + x] = k;
      lists[k].push([x, z]);
      if (k === 'water') this.solid[z * W + x] = 1;
    }
    this.kinds = kinds;
    var plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    var m4 = new THREE.Matrix4();
    var aniso = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    function half(t) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(0.5, 0.5);
      // Mipmaps + anisotropy stop the shallow-angle floor from aliasing into stripes.
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = aniso;
      t.needsUpdate = true;
      return srgb(t);
    }
    function groundSet(list, texs, y) {
      texs.forEach(function (tex, vi) {
        var mine = list.filter(function (p) { return (hash(p[0] * 131 + p[1] * 7) % texs.length) === vi; });
        if (!mine.length) return;
        var mesh = new THREE.InstancedMesh(plane, new THREE.MeshLambertMaterial({ map: tex }), mine.length);
        mine.forEach(function (p, i) { m4.makeTranslation(p[0] + 0.5, y || 0, p[1] + 0.5); mesh.setMatrixAt(i, m4); });
        mesh.receiveShadow = true;
        S.add(mesh);
      });
    }
    groundSet(lists.plaza, [0, 1, 2, 3].map(function (i) { return half(cobbleTex(L, 11 + i)); }));
    groundSet(lists.road, [0, 1].map(function (i) { return half(noiseTex(L.dirt.concat([L.mortar]), 51 + i, 6)); }));
    groundSet(lists.sand, [0, 1, 2].map(function (i) { return half(sandTex(L, 21 + i)); }));
    groundSet(lists.grass, [0, 1, 2].map(function (i) { return half(noiseTex(L.grass, 31 + i, 26)); }));

    // Water: sunken pool bed + animated surface + bank walls where it meets land.
    if (lists.water.length) {
      groundSet(lists.water, [half(noiseTex([L.dirt[1], L.dirt[0], L.mortar, L.dirt[2]], 61, 0))], -0.32);
      var wt = waterTex(L);
      wt.repeat.set(0.5, 0.5);
      srgb(wt);
      var wmat = new THREE.MeshLambertMaterial({ map: wt, transparent: true, opacity: 0.88, emissive: col(L.water[1]), emissiveIntensity: 0.35 });
      var wm = new THREE.InstancedMesh(plane, wmat, lists.water.length);
      lists.water.forEach(function (p, i) { m4.makeTranslation(p[0] + 0.5, -0.12, p[1] + 0.5); wm.setMatrixAt(i, m4); });
      wm.receiveShadow = true;
      S.add(wm);
      this.water = wt;
      var bankG = new THREE.BoxGeometry(1, 0.34, 0.08), bankM = new THREE.MeshLambertMaterial({ color: col(L.dirt[1]) });
      var banks = [];
      lists.water.forEach(function (p) {
        [[0, -1, 0], [0, 1, 0], [-1, 0, 1], [1, 0, 1]].forEach(function (n) {
          var nx = p[0] + n[0], nz = p[1] + n[1];
          if (nx < 0 || nz < 0 || nx >= W || nz >= H || kinds[nz * W + nx] === 'water') return;
          banks.push([p[0] + 0.5 + n[0] * 0.46, p[1] + 0.5 + n[1] * 0.46, n[2]]);
        });
      });
      if (banks.length) {
        var bm = new THREE.InstancedMesh(bankG, bankM, banks.length), q = new THREE.Quaternion();
        banks.forEach(function (b, i) {
          q.setFromAxisAngle(V3(0, 1, 0), b[2] ? Math.PI / 2 : 0);
          m4.compose(V3(b[0], -0.15, b[1]), q, V3(1, 1, 1));
          bm.setMatrixAt(i, m4);
        });
        S.add(bm);
      }
    }

    // Outer ground beyond the map edge.
    var outer = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshLambertMaterial({ color: col(L.edge === 'palm' ? L.sand[3] : L.grass[3]) }));
    outer.rotation.x = -Math.PI / 2;
    // Well below the tile floor (and the -0.32 pool bed): close coplanar layers z-fight on 16-bit depth buffers.
    outer.position.set(W / 2, -0.6, H / 2);
    outer.receiveShadow = true;
    S.add(outer);

    // Curb: a slight raised edge where flagstones meet softer ground.
    var curbG = new THREE.BoxGeometry(1, 0.06, 0.08), curbM = new THREE.MeshLambertMaterial({ color: col(L.mortar) });
    var curbs = [];
    lists.plaza.forEach(function (p) {
      [[0, -1, 0], [0, 1, 0], [-1, 0, 1], [1, 0, 1]].forEach(function (n) {
        var nx = p[0] + n[0], nz = p[1] + n[1];
        var t = (nx < 0 || nz < 0 || nx >= W || nz >= H) ? 'sand' : kinds[nz * W + nx];
        if (t === 'sand' || t === 'grass') curbs.push([p[0] + 0.5 + n[0] * 0.46, p[1] + 0.5 + n[1] * 0.46, n[2]]);
      });
    });
    if (curbs.length) {
      var cm = new THREE.InstancedMesh(curbG, curbM, curbs.length), cq = new THREE.Quaternion();
      curbs.forEach(function (c, i) {
        cq.setFromAxisAngle(V3(0, 1, 0), c[2] ? Math.PI / 2 : 0);
        m4.compose(V3(c[0], 0.03, c[1]), cq, V3(1, 1, 1));
        cm.setMatrixAt(i, m4);
      });
      cm.receiveShadow = true;
      S.add(cm);
    }
  };

  // ------------------------------------------------------------------ buildings
  World3D.prototype._register = function (def, parts, bounds, approach) {
    parts.forEach(function (p) {
      [].concat(p.material).forEach(function (m) { m.transparent = true; });
    });
    // The prompt fires within reach of the approach point, so it must be standable.
    for (var nudge = 0; nudge < 8 && this.isBlocked(approach[0], approach[1]); nudge++) approach[1] += 0.25;
    var entry = {
      id: def.id, act: def.act, landId: def.landId, label: def.label, sub: def.sub, disabled: !!def.disabled,
      parts: parts, x0: bounds[0], z0: bounds[1], x1: bounds[2], z1: bounds[3], top: bounds[4],
      cx: (bounds[0] + bounds[2]) / 2, cz: (bounds[1] + bounds[3]) / 2,
      approachX: approach[0], approachZ: approach[1], labelY: bounds[4] + 0.5
    };
    if (def.label) {
      var el = document.createElement('div');
      el.className = 'cm-w3-tag' + (def.disabled ? ' is-done' : '');
      el.innerHTML = '<span class="cm-w3-bang" aria-hidden="true">!</span><b></b><small></small>';
      el.querySelector('b').textContent = def.label;
      el.querySelector('small').textContent = def.sub || '';
      this.labelLayer.appendChild(el);
      entry.el = el;
    }
    this.buildings.push(entry);
    return entry;
  };

  /** Sandstone/timber house: plaster walls, beams, lit windows, pitched shingle roof, chimney. */
  World3D.prototype._house = function (def) {
    var S = this.scene, L = this.L;
    var theme = THEMES[def.theme || 'sandstone'];
    var wallH = def.wallH || 2.4, w = def.w, d = def.d;
    var cx = def.x + w / 2, cz = def.z + d / 2;
    var seed = hash(def.id);
    var glow = L.night > 0.5 ? '#ffd27a' : '#ffcf7a';
    var doorOff = def.door != null ? def.door : Math.floor(w / 2);
    var front = wallTex(theme, w, wallH, { seed: seed, door: doorOff, glow: glow, braces: def.braces });
    var side = wallTex(theme, d, wallH, { seed: seed + 1, glow: glow, braces: def.braces });
    var back = wallTex(theme, w, wallH, { seed: seed + 2, glow: glow, braces: def.braces });
    var em = L.night > 0.5 ? 1.0 : 0.55;
    function mat(t) { return new THREE.MeshLambertMaterial({ map: srgb(t.map), emissiveMap: t.emissive, emissive: col('#ffffff'), emissiveIntensity: em }); }
    var plain = new THREE.MeshLambertMaterial({ color: col(theme.wall[1]) });
    var body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), [mat(side), mat(side), plain, plain, mat(front), mat(back)]);
    body.position.set(cx, wallH / 2, cz);
    body.castShadow = body.receiveShadow = true;
    S.add(body);
    var base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.28, d + 0.12), new THREE.MeshLambertMaterial({ color: col(L.mortar) }));
    base.position.set(cx, 0.14, cz);
    base.castShadow = base.receiveShadow = true;
    S.add(base);
    var rise = Math.min(1.9, d * 0.42 + 0.4), over = 0.35;
    var rg = roofGeo(w, d, rise, over);
    var rt = srgb(shingleTex(theme, Math.round((w + over * 2) * PX), Math.round(rg.userData.slope * PX), seed));
    var roof = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ map: rt, side: THREE.DoubleSide }));
    roof.position.set(cx, wallH, cz);
    roof.castShadow = roof.receiveShadow = true;
    S.add(roof);
    var gable = new THREE.Mesh(gableGeo(w, d, rise), new THREE.MeshLambertMaterial({ color: col(theme.wall[0]), side: THREE.DoubleSide }));
    gable.position.copy(roof.position);
    gable.castShadow = true;
    S.add(gable);
    var parts = [body, base, roof, gable];
    var ch = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.45), new THREE.MeshLambertMaterial({ color: col(theme.beam) }));
    ch.position.set(cx + w * 0.28, wallH + rise * 0.75, cz - d * 0.15);
    ch.castShadow = true;
    S.add(ch);
    parts.push(ch);
    if (def.awning) {
      var aw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.7), new THREE.MeshLambertMaterial({ map: srgb(stripeTex(def.awning[0], def.awning[1])) }));
      aw.position.set(def.x + doorOff + 0.5, wallH * 0.62, def.z + d + 0.3);
      aw.rotation.x = 0.32;
      aw.castShadow = true;
      S.add(aw);
      parts.push(aw);
    }
    this._solidRect(def.x, def.z, def.x + w, def.z + d);
    return this._register(def, parts, [def.x, def.z, def.x + w, def.z + d, wallH + rise], [def.x + doorOff + 0.5, def.z + d + 0.45]);
  };

  /** Stepped sandstone pyramid with a glowing doorway and a gilded capstone. */
  World3D.prototype._pyramid = function (def) {
    var S = this.scene, L = this.L, parts = [];
    var w = def.w, d = def.d, cx = def.x + w / 2, cz = def.z + d / 2;
    var tiers = 5, step = 0.62, y = 0, i;
    for (i = 0; i < tiers; i++) {
      var tw = w - i * (w / (tiers + 1)), td = d - i * (d / (tiers + 1));
      var tex = srgb(brickTex(L, Math.round(Math.max(tw, td) * PX), Math.round(step * PX), hash(def.id) + i, true));
      var tier = new THREE.Mesh(new THREE.BoxGeometry(tw, step, td), new THREE.MeshLambertMaterial({ map: tex }));
      tier.position.set(cx, y + step / 2, cz);
      tier.castShadow = tier.receiveShadow = true;
      S.add(tier);
      parts.push(tier);
      y += step;
    }
    var cap = new THREE.Mesh(new THREE.ConeGeometry(w / (tiers + 1) * 0.72, 0.9, 4), new THREE.MeshLambertMaterial({ color: col('#e8c060'), emissive: col('#a87a20'), emissiveIntensity: 0.45 }));
    cap.rotation.y = Math.PI / 4;
    cap.position.set(cx, y + 0.45, cz);
    cap.castShadow = true;
    S.add(cap);
    parts.push(cap);
    // Doorway cut into the front face: dark recess, gilded lintel, glyph glow.
    var fz = def.z + d;
    var door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.12), new THREE.MeshBasicMaterial({ color: col('#1a0f08') }));
    door.position.set(cx, 0.75, fz + 0.01);
    S.add(door);
    var lintel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.24, 0.3), new THREE.MeshLambertMaterial({ color: col('#e8c060'), emissive: col('#ffb040'), emissiveIntensity: 0.35 }));
    lintel.position.set(cx, 1.58, fz + 0.05);
    lintel.castShadow = true;
    S.add(lintel);
    parts.push(door, lintel);
    var glowL = new THREE.PointLight(col('#ffb860'), 0.9, 4.5, 1.8);
    glowL.position.set(cx, 0.9, fz + 0.5);
    S.add(glowL);
    this.lampLights.push(glowL);
    this._solidRect(def.x, def.z, def.x + w, def.z + d);
    return this._register(def, parts, [def.x, def.z, def.x + w, def.z + d, y + 0.9], [cx, fz + 0.5]);
  };

  /** Round colosseum opening toward the camera, with arched tiers, crenellations and banners. */
  World3D.prototype._arena = function (def) {
    var S = this.scene, L = this.L, parts = [];
    var R = def.r || 3, H = 2.3, cx = def.x, cz = def.z, gap = 0.62;
    var circ = 2 * Math.PI * R;
    var wtex = srgb(arenaWallTex(L, Math.round(circ * PX), Math.round(H * PX)));
    var wall = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R * 1.04, H, 28, 1, true, gap / 2, Math.PI * 2 - gap),
      new THREE.MeshLambertMaterial({ map: wtex, side: THREE.DoubleSide })
    );
    wall.position.set(cx, H / 2, cz);
    wall.castShadow = wall.receiveShadow = true;
    S.add(wall);
    parts.push(wall);
    var floor = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 28), new THREE.MeshLambertMaterial({ map: srgb(sandTex(L, 404)) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.02, cz);
    floor.receiveShadow = true;
    S.add(floor);
    var ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.45, R * 0.5, 28), new THREE.MeshBasicMaterial({ color: col('#f0d79a'), transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.03, cz);
    S.add(ring);
    // Crenellations around the rim.
    var merlonG = new THREE.BoxGeometry(0.3, 0.32, 0.24), merlonM = new THREE.MeshLambertMaterial({ color: col(L.stone[1]) });
    var n = 26, merlons = new THREE.InstancedMesh(merlonG, merlonM, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), i, k = 0;
    for (i = 0; i < n; i++) {
      var a = gap / 2 + (i + 0.5) * (Math.PI * 2 - gap) / n;
      q.setFromAxisAngle(V3(0, 1, 0), a);
      m4.compose(V3(cx + Math.sin(a) * R, H + 0.16, cz + Math.cos(a) * R), q, V3(1, 1, 1));
      merlons.setMatrixAt(k++, m4);
    }
    merlons.castShadow = true;
    S.add(merlons);
    parts.push(merlons);
    // Gate pillars flanking the opening + banners on poles.
    [-1, 1].forEach(function (s) {
      var a = s * gap / 2;
      var px = cx + Math.sin(a) * R, pz = cz + Math.cos(a) * R;
      var pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, H + 0.6, 0.5), new THREE.MeshLambertMaterial({ map: srgb(brickTex(L, 8, 40, 7 + s, false)) }));
      pillar.position.set(px, (H + 0.6) / 2, pz);
      pillar.castShadow = true;
      S.add(pillar);
      parts.push(pillar);
      var pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), new THREE.MeshLambertMaterial({ color: col('#3a2a1a') }));
      pole.position.set(px, H + 1.3, pz);
      S.add(pole);
      var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshLambertMaterial({ color: col(def.banner || '#c0392b'), side: THREE.DoubleSide, emissive: col(def.banner || '#c0392b'), emissiveIntensity: 0.2 }));
      flag.position.set(px + s * 0.36, H + 1.75, pz);
      flag.castShadow = true;
      S.add(flag);
      parts.push(pole, flag);
    });
    var torch = new THREE.PointLight(col('#ffb060'), 0.8, 6, 1.8);
    torch.position.set(cx, 1.2, cz + R + 0.4);
    S.add(torch);
    this.lampLights.push(torch);
    this.circles.push({ x: cx, z: cz, r: R + 0.1 });
    return this._register(def, parts, [cx - R, cz - R, cx + R, cz + R, H + 2], [cx, cz + R + 0.55]);
  };

  /** Stone keep: walls, four round towers with coloured cone roofs, battlements and a banner. */
  World3D.prototype._keep = function (def) {
    var S = this.scene, parts = [];
    var w = def.w, d = def.d, cx = def.x + w / 2, cz = def.z + d / 2, H = 3;
    var entry = this._house({ id: def.id + '-hall', x: def.x, z: def.z, w: w, d: d, wallH: H, theme: 'stone', braces: false });
    this.buildings.pop();
    parts = parts.concat(entry.parts);
    var roofCol = def.banner || '#4a5fc9';
    var towerTex = srgb(brickTex({ stone: THEMES.stone.wall.concat(['#9a9688', '#c4c0b4']) }, 24, 64, hash(def.id), false));
    [[def.x, def.z], [def.x + w, def.z], [def.x, def.z + d], [def.x + w, def.z + d]].forEach(function (c) {
      var tower = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, H + 1.1, 12), new THREE.MeshLambertMaterial({ map: towerTex }));
      tower.position.set(c[0], (H + 1.1) / 2, c[1]);
      tower.castShadow = tower.receiveShadow = true;
      S.add(tower);
      var cone = new THREE.Mesh(new THREE.ConeGeometry(0.82, 1.3, 12), new THREE.MeshLambertMaterial({ color: col(roofCol) }));
      cone.position.set(c[0], H + 1.1 + 0.65, c[1]);
      cone.castShadow = true;
      S.add(cone);
      parts.push(tower, cone);
    });
    var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), new THREE.MeshLambertMaterial({ color: col(roofCol), side: THREE.DoubleSide, emissive: col(roofCol), emissiveIntensity: 0.25 }));
    flag.position.set(cx, H * 0.62, def.z + d + 0.04);
    S.add(flag);
    parts.push(flag);
    var gate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.1), new THREE.MeshLambertMaterial({ color: col('#2a1a10') }));
    gate.position.set(cx, 0.8, def.z + d + 0.03);
    S.add(gate);
    parts.push(gate);
    this._solidRect(def.x - 0.6, def.z - 0.6, def.x + w + 0.6, def.z + d);
    return this._register(def, parts, [def.x - 0.6, def.z - 0.6, def.x + w + 0.6, def.z + d + 0.6, H + 2.4], [cx, def.z + d + 0.75]);
  };

  /** Stone archway at the map edge leading into the trees (Palm Woods / Wild Grove). */
  World3D.prototype._gate = function (def) {
    var S = this.scene, L = this.L, parts = [];
    var cx = def.x, z = def.z, span = def.span || 2.6, H = 2.5;
    var tex = srgb(brickTex(L, 10, 40, hash(def.id), true));
    [-1, 1].forEach(function (s) {
      var p = new THREE.Mesh(new THREE.BoxGeometry(0.55, H, 0.55), new THREE.MeshLambertMaterial({ map: tex }));
      p.position.set(cx + s * span / 2, H / 2, z);
      p.castShadow = p.receiveShadow = true;
      S.add(p);
      parts.push(p);
    });
    var beam = new THREE.Mesh(new THREE.BoxGeometry(span + 1, 0.42, 0.7), new THREE.MeshLambertMaterial({ map: srgb(brickTex(L, 56, 8, hash(def.id) + 3, true)) }));
    beam.position.set(cx, H + 0.21, z);
    beam.castShadow = true;
    S.add(beam);
    parts.push(beam);
    var vine = new THREE.Mesh(new THREE.BoxGeometry(span + 0.7, 0.2, 0.74), new THREE.MeshLambertMaterial({ color: col(L.leaf[0]) }));
    vine.position.set(cx, H + 0.5, z);
    S.add(vine);
    parts.push(vine);
    var lantern = new THREE.PointLight(col('#ffd890'), 0.7, 5, 1.8);
    lantern.position.set(cx, H - 0.3, z + 0.6);
    S.add(lantern);
    this.lampLights.push(lantern);
    this.circles.push({ x: cx - span / 2, z: z, r: 0.42 }, { x: cx + span / 2, z: z, r: 0.42 });
    return this._register(def, parts, [cx - span / 2 - 0.4, z - 0.4, cx + span / 2 + 0.4, z + 0.4, H + 0.6], [cx, z + 1.1]);
  };

  /** Obelisk waystone with a floating element crystal and a glowing rune ring. */
  World3D.prototype._obelisk = function (def) {
    var S = this.scene, L = this.L, parts = [];
    var x = def.x, z = def.z, glow = def.glow || '#9ad8ff', H = def.h || 2.2;
    var base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), new THREE.MeshLambertMaterial({ color: col(L.mortar) }));
    base.position.set(x, 0.15, z);
    base.castShadow = base.receiveShadow = true;
    S.add(base);
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, H, 4), new THREE.MeshLambertMaterial({ map: srgb(brickTex(L, 8, Math.round(H * PX), hash(def.id), true)) }));
    shaft.rotation.y = Math.PI / 4;
    shaft.position.set(x, 0.3 + H / 2, z);
    shaft.castShadow = true;
    S.add(shaft);
    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 4), new THREE.MeshLambertMaterial({ color: col('#e8c060'), emissive: col('#a87a20'), emissiveIntensity: 0.4 }));
    tip.rotation.y = Math.PI / 4;
    tip.position.set(x, 0.3 + H + 0.17, z);
    S.add(tip);
    var crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), new THREE.MeshLambertMaterial({ color: col(glow), emissive: col(glow), emissiveIntensity: 0.4 }));
    crystal.position.set(x, 0.3 + H + 0.75, z);
    crystal.castShadow = true;
    S.add(crystal);
    var rune = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.76, 24), new THREE.MeshBasicMaterial({ color: col(glow), transparent: true, opacity: 0.7, depthWrite: false }));
    rune.rotation.x = -Math.PI / 2;
    rune.position.set(x, 0.035, z);
    S.add(rune);
    var light = new THREE.PointLight(col(glow), 0.9, 5, 1.8);
    light.position.set(x, 0.3 + H + 0.6, z);
    S.add(light);
    this.crystals.push({ mesh: crystal, y: crystal.position.y, rune: rune, phase: this.rnd() * 6.28 });
    parts.push(base, shaft, tip, crystal);
    this.circles.push({ x: x, z: z, r: 0.55 });
    return this._register(def, parts, [x - 0.5, z - 0.5, x + 0.5, z + 0.5, H + 1.2], [x, z + 1.0]);
  };

  // ------------------------------------------------------------------ props
  World3D.prototype._lamp = function (x, z, color) {
    var S = this.scene, L = this.L;
    color = color || '#ffc46a';
    var pole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.9, 0.09), new THREE.MeshLambertMaterial({ color: col('#2c2622') }));
    pole.position.set(x, 0.95, z);
    pole.castShadow = true;
    S.add(pole);
    var lan = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), new THREE.MeshBasicMaterial({ color: col(color).lerp(col('#ffffff'), 0.35) }));
    lan.position.set(x, 2.05, z);
    S.add(lan);
    var cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 4), new THREE.MeshLambertMaterial({ color: col('#2c2622') }));
    cap.rotation.y = Math.PI / 4;
    cap.position.set(x, 2.28, z);
    S.add(cap);
    if (!this.haloTex) {
      this.haloTex = canvasTex(32, 32, function (g) {
        var r = g.createRadialGradient(16, 16, 1, 16, 16, 16);
        r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(0.3, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, 32, 32);
      });
      this.haloTex.minFilter = this.haloTex.magFilter = THREE.LinearFilter;
      this.haloTex.userData.shared = true;
    }
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.haloTex, color: col(color), transparent: true, opacity: 0.35 + L.night * 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(x, 2.05, z);
    halo.scale.set(1.3, 1.3, 1);
    S.add(halo);
    var pl = new THREE.PointLight(col(color), L.lampI, 6, 1.8);
    pl.position.set(x, 1.95, z);
    S.add(pl);
    this.lampLights.push(pl);
    this.circles.push({ x: x, z: z, r: 0.12 });
  };

  World3D.prototype._fountain = function (x, z) {
    var S = this.scene;
    var stone = new THREE.MeshLambertMaterial({ map: srgb(cobbleTex({ stone: ['#efe0c4', '#e2d0b0', '#f6ead4', '#d4c09c'], mortar: '#9a8a70' }, 77)) });
    var basin = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.45, 18), stone);
    basin.position.set(x, 0.22, z);
    basin.castShadow = basin.receiveShadow = true;
    S.add(basin);
    var water = new THREE.Mesh(new THREE.CircleGeometry(1.08, 18), new THREE.MeshLambertMaterial({ color: col('#4ab0e8'), emissive: col('#1a6a9a'), emissiveIntensity: 0.6 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, 0.47, z);
    S.add(water);
    var col1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.1, 10), stone);
    col1.position.set(x, 0.85, z);
    col1.castShadow = true;
    S.add(col1);
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.22, 14), stone);
    bowl.position.set(x, 1.42, z);
    bowl.castShadow = true;
    S.add(bowl);
    var g = new THREE.BufferGeometry(), p = [], i, seeds = [];
    for (i = 0; i < 60; i++) { p.push(x, 1.5, z); seeds.push([Math.random() * 6.28, Math.random()]); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    var pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col('#cfeaff'), size: 0.06, transparent: true, opacity: 0.85, depthWrite: false }));
    S.add(pts);
    this.spray = { pts: pts, x: x, z: z, seeds: seeds };
    this.circles.push({ x: x, z: z, r: 1.35 });
  };

  /** Market stall: counter, posts and a striped awning. Decorative + solid. */
  World3D.prototype._stall = function (x, z, a, b) {
    var S = this.scene, L = this.L;
    var counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.8), new THREE.MeshLambertMaterial({ map: srgb(brickTex({ stone: ['#9a6a3e', '#8a5a32', '#aa7a4a'] }, 28, 12, hash(x * 7 + z), false)) }));
    counter.position.set(x, 0.4, z);
    counter.castShadow = counter.receiveShadow = true;
    S.add(counter);
    [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]].forEach(function (o) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.8, 0.07), new THREE.MeshLambertMaterial({ color: col('#5a3a20') }));
      post.position.set(x + o[0], 0.9, z + o[1]);
      post.castShadow = true;
      S.add(post);
    });
    var awning = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 1.2), new THREE.MeshLambertMaterial({ map: srgb(stripeTex(a, b)) }));
    awning.position.set(x, 1.86, z + 0.1);
    awning.rotation.x = 0.22;
    awning.castShadow = true;
    S.add(awning);
    var goods = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshLambertMaterial({ color: col('#ffffff') }), 6);
    var m4 = new THREE.Matrix4(), i, gcols = ['#e8a040', '#c0392b', '#f0d060', L.leaf[1], '#e86a3a', '#f0c070'];
    for (i = 0; i < 6; i++) {
      m4.makeTranslation(x - 0.6 + i * 0.24, 0.88, z + (i % 2 ? 0.1 : -0.1));
      goods.setMatrixAt(i, m4);
      goods.setColorAt(i, col(gcols[i]));
    }
    goods.castShadow = true;
    S.add(goods);
    this._solidRect(x - 0.9, z - 0.4, x + 0.9, z + 0.4);
  };

  /** Pixel-art image as an upright cut-out that casts a real shadow (Egypt pack props). */
  World3D.prototype._cutout = function (url, x, z, height, aspect) {
    var S = this.scene;
    var tex = this._spriteTex(url);
    var mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: col('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.12 });
    var geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
    mesh.visible = false;
    this._spriteTex(url, function () { mesh.visible = true; });
    mesh.scale.set(height * aspect, height, 1);
    mesh.position.set(x, 0, z);
    mesh.rotation.x = -0.12;
    mesh.castShadow = true;
    S.add(mesh);
    return mesh;
  };

  // ------------------------------------------------------------------ trees (instanced, camera-aware)
  /** Palms: curved ringed trunks, drooping fronds, coconuts. spots: [x, z, scale, solid?]. */
  World3D.prototype._palms = function (spots) {
    if (!spots.length) return;
    var S = this.scene, L = this.L, rnd = this.rnd, self = this;
    var SEG = 6;
    var segG = new THREE.CylinderGeometry(0.09, 0.12, 0.42, 6);
    var trunks = new THREE.InstancedMesh(segG, new THREE.MeshLambertMaterial({ map: this.trunkTexture }), spots.length * SEG);
    var fronds = new THREE.InstancedMesh(frondGeo(), new THREE.MeshLambertMaterial({ map: this.frondTexture, alphaTest: 0.5, side: THREE.DoubleSide }), spots.length * 8);
    fronds.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.frondTexture, alphaTest: 0.5 });
    var nuts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshLambertMaterial({ color: col('#6a4a2a') }), spots.length * 3);
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V3(0, 1, 0);
    var ti = 0, fi = 0, ni = 0;
    spots.forEach(function (s) {
      var x = s[0], z = s[1], sc = s[2] || 1;
      var lean = rnd() * 6.28, leanAmt = 0.35 + rnd() * 0.45;
      var lx = Math.cos(lean) * leanAmt, lz = Math.sin(lean) * leanAmt;
      var tree = { x: x, z: z, size: sc, scale: 1, inst: [] };
      var prev = V3(x, 0, z), k, top;
      for (k = 1; k <= SEG; k++) {
        var t = k / SEG;
        var p = V3(x + lx * t * t * sc, t * 2.5 * sc, z + lz * t * t * sc);
        var mid = prev.clone().add(p).multiplyScalar(0.5);
        var dir = p.clone().sub(prev);
        var len = dir.length();
        q.setFromUnitVectors(up, dir.normalize());
        m4.compose(mid, q, V3(sc * (1.1 - t * 0.3), len / 0.42, sc * (1.1 - t * 0.3)));
        trunks.setMatrixAt(ti, m4);
        tree.inst.push({ mesh: trunks, i: ti, base: m4.clone() });
        ti++;
        prev = p;
      }
      top = prev;
      for (k = 0; k < 8; k++) {
        var a = k / 8 * 6.28 + rnd() * 0.4;
        q.setFromEuler(new THREE.Euler(0, a, (rnd() - 0.4) * 0.35));
        var fs = sc * (0.85 + rnd() * 0.3);
        m4.compose(top, q, V3(fs, fs, fs));
        fronds.setMatrixAt(fi, m4);
        fronds.setColorAt(fi, col(pick(rnd, L.frond)));
        tree.inst.push({ mesh: fronds, i: fi, base: m4.clone() });
        fi++;
      }
      for (k = 0; k < 3; k++) {
        var na = k * 2.1 + rnd();
        m4.makeTranslation(top.x + Math.cos(na) * 0.14, top.y - 0.12, top.z + Math.sin(na) * 0.14);
        nuts.setMatrixAt(ni, m4);
        tree.inst.push({ mesh: nuts, i: ni, base: m4.clone() });
        ni++;
      }
      self.trees.push(tree);
      if (s[3] !== false) self.circles.push({ x: x, z: z, r: 0.22 });
    });
    trunks.castShadow = fronds.castShadow = nuts.castShadow = true;
    trunks.receiveShadow = fronds.receiveShadow = true;
    S.add(trunks, fronds, nuts);
    this._treeMeshes = (this._treeMeshes || []).concat([trunks, fronds, nuts]);
  };

  /** Chunky leaf trees (AnimeVs addTrees) or stacked pines for frost. */
  World3D.prototype._leafTrees = function (spots, pine) {
    if (!spots.length) return;
    var S = this.scene, L = this.L, rnd = this.rnd, self = this;
    var leafTex = canvasTex(16, 16, function (g) {
      var r = rng(5), x, y, v;
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { v = r(); g.fillStyle = v < 0.5 ? '#ffffff' : v < 0.8 ? '#dcdcdc' : '#b8b8b8'; g.fillRect(x, y, 1, 1); }
    });
    var trunkG = new THREE.CylinderGeometry(0.14, 0.22, 1.4, 6);
    trunkG.translate(0, 0.7, 0);
    var blobG = pine ? new THREE.ConeGeometry(1, 1.2, 7) : new THREE.IcosahedronGeometry(1, 1);
    var per = pine ? 3 : 4;
    var trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: col(L.trunk) }), spots.length);
    var blobs = new THREE.InstancedMesh(blobG, new THREE.MeshLambertMaterial({ map: leafTex, flatShading: true }), spots.length * per);
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), bi = 0;
    spots.forEach(function (sp, i) {
      var x = sp[0], z = sp[1], s = 0.75 + ((sp[2] || 2) - 1) * 0.35 + rnd() * 0.25;
      var tree = { x: x, z: z, size: s, scale: 1, inst: [] };
      q.identity();
      m4.compose(V3(x, 0, z), q, V3(s, s, s));
      trunks.setMatrixAt(i, m4);
      tree.inst.push({ mesh: trunks, i: i, base: m4.clone() });
      for (var k = 0; k < per; k++) {
        if (pine) {
          var ps = (1.1 - k * 0.28) * s;
          m4.compose(V3(x, (1.2 + k * 0.62) * s, z), q, V3(ps * 0.8, ps, ps * 0.8));
        } else {
          var a = rnd() * 6.28, r = k === 0 ? 0 : 0.42 * s;
          var bs = (k === 0 ? 0.85 : 0.55 + rnd() * 0.2) * s;
          var bq = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
          m4.compose(V3(x + Math.cos(a) * r, (1.55 + (k === 0 ? 0.45 : rnd() * 0.5)) * s, z + Math.sin(a) * r), bq, V3(bs, bs * 0.85, bs));
        }
        blobs.setMatrixAt(bi, m4);
        blobs.setColorAt(bi, col(pick(rnd, L.leaf)));
        tree.inst.push({ mesh: blobs, i: bi, base: m4.clone() });
        bi++;
      }
      self.trees.push(tree);
      if (sp[3] !== false) self.circles.push({ x: x, z: z, r: 0.3 });
    });
    trunks.castShadow = blobs.castShadow = true;
    trunks.receiveShadow = blobs.receiveShadow = true;
    S.add(trunks, blobs);
    this._treeMeshes = (this._treeMeshes || []).concat([trunks, blobs]);
  };

  /** Dense trees beyond the map edge so the world never ends in a void. */
  World3D.prototype._forestEdge = function (kind) {
    var rnd = this.rnd, W = this.mapW, H = this.mapH, x, z, spots = [];
    for (z = -6; z < H + 7; z++) {
      for (x = -7; x < W + 7; x++) {
        if (x >= 0 && x < W && z >= 0 && z < H) continue;
        if (rnd() < (kind === 'palm' ? 0.42 : 0.6)) spots.push([x + 0.5 + (rnd() - 0.5) * 0.5, z + 0.5 + (rnd() - 0.5) * 0.5, kind === 'palm' ? 0.9 + rnd() * 0.35 : 2 + rnd() * 0.6, false]);
      }
    }
    if (kind === 'palm') {
      this._palms(spots.filter(function (s, i) { return i % 3 !== 0; }));
      this._leafTrees(spots.filter(function (s, i) { return i % 3 === 0; }).map(function (s) { return [s[0], s[1], 2.2, false]; }), false);
    } else {
      this._leafTrees(spots, kind === 'pine');
    }
  };

  World3D.prototype._motes = function () {
    var g = new THREE.BufferGeometry(), p = [], i, rnd = this.rnd, L = this.L;
    for (i = 0; i < 160; i++) p.push(rnd() * this.mapW, 0.3 + rnd() * 3.5, rnd() * this.mapH);
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: col(L.night > 0.5 ? '#ffe08a' : '#fff0c8'), size: 0.06, transparent: true, opacity: 0.75, depthWrite: false }));
    this.scene.add(this.motes);
  };

  // ------------------------------------------------------------------ characters
  World3D.prototype._actorMesh = function (w, h, unlit) {
    // Bob's authored colours should survive the low-resolution post pass; world actors still receive scene light.
    var mat = unlit
      ? new THREE.MeshBasicMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, transparent: true })
      : new THREE.MeshLambertMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, emissive: col('#ffffff'), emissiveIntensity: 0.2, transparent: true });
    var geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
    mesh.scale.set(w, h, 1);
    mesh.rotation.x = -0.12;
    mesh.castShadow = true;
    this.scene.add(mesh);
    var shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(shadow);
    return { mesh: mesh, shadow: shadow, texKey: null };
  };
  World3D.prototype._setActorTex = function (a, tex) {
    a.mesh.visible = a.shadow.visible = !!(tex && tex.image && tex.image.width);
    if (a.tex === tex) return;
    a.tex = tex;
    a.mesh.material.map = tex;
    if ('emissiveMap' in a.mesh.material) a.mesh.material.emissiveMap = tex;
    a.mesh.material.needsUpdate = true;
    a.mesh.customDepthMaterial.map = tex;
    a.mesh.customDepthMaterial.needsUpdate = true;
  };

  /**
   * Animated SiegeSprites strip (idle/walk) as a cut-out. Each actor gets its own texture clones
   * so frame offsets and left/right flips stay independent.
   */
  World3D.prototype._siegeling = function (cardId, bodyH) {
    var sheet = root.SiegeSprites && root.SiegeSprites.forCard(cardId);
    if (!sheet) return null;
    var planeH = bodyH / (sheet.fit || 0.8), planeW = planeH * sheet.w / sheet.h;
    var a = this._actorMesh(planeW, planeH);
    a.sheet = sheet;
    a.sink = (sheet.base || 0) * planeH;
    a.shadow.scale.setScalar(Math.min(1.6, planeW * 0.5));
    a.tex = null;
    a.strips = {};
    var self = this;
    ['idle', 'walk'].forEach(function (pose) {
      var base = self._spriteTex(sheet.dir + pose + '.webp');
      var t = base.clone();
      t.userData = {};
      base.userData.waiters = base.userData.waiters || [];
      if (base.image && base.image.width) t.needsUpdate = true;
      else base.userData.waiters.push(function () { t.image = base.image; t.needsUpdate = true; });
      t.repeat.set(1 / (sheet.frames[pose] || 1), 1);
      a.strips[pose] = { tex: t, n: sheet.frames[pose] || 1 };
    });
    this._setActorTex(a, a.strips.idle.tex);
    return a;
  };
  World3D.prototype._animSiegeling = function (a, moving, faceLeft, t) {
    var strip = moving && a.strips.walk ? a.strips.walk : a.strips.idle;
    this._setActorTex(a, strip.tex);
    var f = Math.floor(t / (moving ? 90 : 130)) % strip.n;
    if (faceLeft) { strip.tex.repeat.x = -1 / strip.n; strip.tex.offset.x = (f + 1) / strip.n; }
    else { strip.tex.repeat.x = 1 / strip.n; strip.tex.offset.x = f / strip.n; }
  };

  World3D.prototype.setFollower = function (cardId) {
    if (!this.scene) return;
    if (this.actors.follower && this.followerId === cardId) return;
    if (this.actors.follower) {
      this.scene.remove(this.actors.follower.mesh, this.actors.follower.shadow);
      this.actors.follower = null;
    }
    this.followerId = cardId || null;
    if (cardId) this.actors.follower = this._siegeling(cardId, 0.78);
  };

  /** Ambient Siegelings wandering near a home point (life in the plaza, like AnimeVs NPCs). */
  World3D.prototype._wanderers = function (list) {
    var self = this;
    list.forEach(function (n) {
      var a = self._siegeling(n.id, n.h || 0.7);
      if (!a) return;
      self.npcs.push({ a: a, hx: n.x, hz: n.z, x: n.x, z: n.z, tx: n.x, tz: n.z, wait: 1 + self.rnd() * 3, left: false, moving: false, phase: self.rnd() * 1000, r: n.r || 1.6 });
    });
  };

  // ------------------------------------------------------------------ maps
  World3D.prototype.loadSanctuary = function (cfg) {
    if (!this.ready) return;
    cfg = cfg || {};
    var W = 34, H = 28;
    this._newScene('oasis', W, H, 7);
    var poolC = { x: 6.5, z: 21.5 };
    this._ground(function (x, z) {
      var pdx = (x + 0.5 - poolC.x) / 3.6, pdz = (z + 0.5 - poolC.z) / 2.6;
      if (pdx * pdx + pdz * pdz < 1) return 'water';
      if (pdx * pdx + pdz * pdz < 1.9) return 'grass';
      if (x >= 10 && x <= 23 && z >= 10 && z <= 19) return 'plaza';
      if ((x === 16 || x === 17) && z >= 9) return 'plaza';
      if ((z === 14 || z === 15) && x >= 2 && x <= 31) return 'road';
      if ((x === 9 || x === 10) && z < 14) return 'road';
      if (z <= 3 && (x + z * 3) % 7 < 3) return 'grass';
      return 'sand';
    });

    this._pyramid({ id: 'pyramid', act: 'flavor', label: 'Relic Shrine', sub: 'Sanctuary', x: 14, z: 3.5, w: 6, d: 5 });
    this._house({ id: 'house', act: 'flavor', label: 'Squire Lodge', sub: 'Rest · story', x: 2, z: 9, w: 5, d: 4, door: 2, theme: 'sandstone', awning: ['#c0392b', '#f4e4c4'] });
    this._arena({ id: 'arena', act: 'preset', label: 'Arena Gate', sub: 'Preset deck', x: 27.5, z: 9.5, r: 3, banner: '#c0392b' });
    this._gate({ id: 'woods', act: 'woods', label: 'Palm Woods', sub: 'Wild capture', x: 10, z: 1.2, span: 2.6 });
    this._obelisk({ id: 'realms', act: 'realms', label: 'Realm Map', sub: 'Travel', x: 17, z: 24.5, glow: '#a8b4ff', h: 2.8 });
    var lands = (cfg.lands || []).filter(function (l) { return l.unlocked || l.rallied; }).slice(0, 6);
    var self = this;
    lands.forEach(function (land, i) {
      var el = String((land.elements && land.elements[0]) || 'neutral').toLowerCase();
      self._obelisk({
        id: 'way-' + land.id, act: 'travel', landId: land.id, label: land.name,
        sub: (land.elements && land.elements[0] || '') + (land.rallied ? ' · rallied' : ''),
        x: 23.5 + (i % 3) * 3, z: 19.5 + Math.floor(i / 3) * 3.4, glow: ELEMENT_GLOW[el] || '#e8e0c8', h: 1.9
      });
    });

    this._fountain(17, 14.5);
    this._stall(12, 11.2, '#2a7ab8', '#f4e4c4');
    this._stall(21.8, 11.2, '#2f8a4a', '#f4e4c4');
    [[11, 10], [23, 10], [11, 19], [23, 19], [15.4, 22.5], [18.6, 22.5], [8.4, 13.2], [8.4, 16.8]].forEach(function (p) { self._lamp(p[0], p[1]); });

    // Egypt pixel-pack props as shadow-casting cut-outs.
    var pillarA = 35 / 83, vaseA = 1, bushA = 1;
    [[15.3, 9.1], [18.7, 9.1]].forEach(function (p) { self._cutout(SANC + 'props/pillar.webp', p[0], p[1], 1.7, pillarA); self.circles.push({ x: p[0], z: p[1], r: 0.25 }); });
    [[10.6, 18.4], [23.4, 18.4], [7.8, 13.4], [1.4, 12.2]].forEach(function (p) { self._cutout(SANC + 'props/vase.webp', p[0], p[1], 0.62, vaseA); });
    [[1.4, 13.6], [12.2, 7.6], [30.5, 17.8], [13.4, 25.6], [20.6, 25.6], [26.5, 25.8]].forEach(function (p) { self._cutout(SANC + 'decor/bush.webp', p[0], p[1], 0.8, bushA); });

    // Oasis ring + plaza palms (real 3D), then the Palm Woods belt and the edge forest.
    var palms = [[2.6, 18.6, 1.05], [10.4, 19.6, 0.95], [3.2, 24.8, 1.0], [9.8, 24.6, 1.1], [6.4, 25.6, 0.9], [1.6, 21.8, 0.95],
      [24.6, 5.4, 1.0], [31.2, 4.2, 1.1], [30.6, 17.2, 0.95], [31.4, 24.8, 1.0], [12.2, 21.4, 0.85], [21.8, 21.6, 0.85],
      [1.8, 5.2, 1.0], [12.6, 1.8, 1.05], [12.4, 5.6, 0.95], [3.6, 3.0, 0.9], [7.4, 4.6, 1.0], [22.4, 2.2, 1.0], [27.6, 2.8, 1.1], [32.2, 8.8, 0.95]];
    this._palms(palms);
    this._forestEdge('palm');
    this._motes();
    this._wanderers([
      { id: 'cacty', x: 13.2, z: 17.6, h: 0.62 },
      { id: 'fawny', x: 21.2, z: 16.8, h: 0.6 },
      { id: 'raydile', x: 6.2, z: 17.4, h: 0.55, r: 1.2 },
      { id: 'chilldoe', x: 28.4, z: 17.2, h: 0.6, r: 1.4 }
    ]);

    this.spawn = { x: 17, z: 19.2 };
    this.setFollower(cfg.followerId);
  };

  World3D.prototype.loadRealm = function (cfg) {
    if (!this.ready) return;
    cfg = cfg || {};
    var el = String(cfg.element || 'neutral').toLowerCase();
    var lookKey = ELEMENT_LOOK[el] || 'verdant';
    var glow = ELEMENT_GLOW[el] || '#e8e0c8';
    var W = 30, H = 24;
    this._newScene(lookKey, W, H, hash(cfg.landId || cfg.name || el));
    var L = this.L;
    this._ground(function (x, z) {
      if (x >= 9 && x <= 20 && z >= 8 && z <= 16) return 'plaza';
      if ((x === 14 || x === 15) && z >= 6) return 'plaza';
      if ((z === 12 || z === 13) && x >= 2 && x <= 27) return 'road';
      return (x * 7 + z * 13) % 11 < 3 ? 'sand' : 'grass';
    });
    var rivalDone = !!cfg.rivalDone, rallied = !!cfg.rallied;
    this._keep({ id: 'knight', act: 'knight', label: 'Knight Keep', sub: rallied ? 'Rallied' : 'SiegeKnight', x: 11.5, z: 1.8, w: 7, d: 3.6, banner: glow, disabled: rallied });
    this._arena({ id: 'rival', act: 'rival', label: 'Rival Arena', sub: rivalDone ? 'Cleared' : 'Arena duel', x: 24.5, z: 7.5, r: 2.6, banner: glow, disabled: rivalDone });
    this._gate({ id: 'wild', act: 'wild', label: 'Wild Grove', sub: 'Siege capture', x: 4.5, z: 1.2, span: 2.6 });
    this._obelisk({ id: 'exit', act: 'exit', label: 'Sanctuary', sub: 'Return home', x: 14.95, z: 20.6, glow: '#a8b4ff', h: 2.4 });
    this._obelisk({ id: 'monument', x: 14.95, z: 12.5, glow: glow, h: 2.8 });
    this.buildings.pop();
    var self = this;
    [[9, 8], [21, 8], [9, 17], [21, 17]].forEach(function (p) { self._lamp(p[0], p[1], glow); });
    this._stall(11, 9.2, '#5a4a8a', '#f4e4c4');
    var inner = [[2.4, 6.4], [7.6, 3.6], [2.2, 17.6], [6.4, 21.4], [23.6, 20.6], [27.4, 15.6], [21.2, 2.6], [27.6, 2.4], [5.8, 15.6], [24.4, 17.4]];
    if (L.edge === 'palm') this._palms(inner.map(function (p) { return [p[0], p[1], 1.0]; }));
    else this._leafTrees(inner.map(function (p) { return [p[0], p[1], 2.2]; }), L.edge === 'pine');
    this._forestEdge(L.edge);
    this._motes();
    var natives = { fire: ['sundile', 'draco'], earth: ['cacty', 'generoot'], wind: ['breezee', 'gagglestand'], ice: ['fawny', 'chilldoe'] }[el] || ['raydile', 'floraknight'];
    this._wanderers([
      { id: natives[0], x: 11.2, z: 15.2, h: 0.62 },
      { id: natives[1], x: 19.2, z: 14.6, h: 0.66 }
    ]);
    this.spawn = { x: 14.95, z: 15.8 };
    this.setFollower(cfg.followerId);
  };

  World3D.prototype.getBuildings = function () {
    return this.buildings.filter(function (b) { return !!b.act; }).map(function (b) {
      return {
        id: b.id, act: b.act, landId: b.landId, label: b.label, sub: b.sub, disabled: b.disabled,
        x: b.cx, z: b.cz, approachX: b.approachX, approachZ: b.approachZ
      };
    });
  };

  // ------------------------------------------------------------------ per-frame
  /** Ease trees out of the camera's sightline and restore them as the party passes. */
  World3D.prototype._cutTrees = function (target, offset, first) {
    var mtx = new THREE.Matrix4(), toO = new THREE.Matrix4(), back = new THREE.Matrix4(), sc = new THREE.Matrix4();
    var dirty = {};
    this.trees.forEach(function (td) {
      var gap = td.z - target.z, along = gap / (offset.z || 1);
      var across = Math.abs(td.x - target.x - offset.x * along);
      var height = target.y + offset.y * along;
      var cut = smooth(gap, 0, 0.65) * (1 - smooth(along, 0.85, 1)) *
        (1 - smooth(across, 0.6 * td.size, 1.5 * td.size)) * (1 - smooth(height, 1.3 * td.size, 2.9 * td.size));
      var want = first ? 1 : 1 - 0.92 * cut;
      if (Math.abs(td.scale - want) < 0.002) return;
      td.scale += (want - td.scale) * (first ? 1 : 0.24);
      toO.makeTranslation(-td.x, 0, -td.z);
      back.makeTranslation(td.x, 0, td.z);
      sc.makeScale(td.scale, td.scale, td.scale);
      td.inst.forEach(function (it) {
        mtx.copy(back).multiply(sc).multiply(toO).multiply(it.base);
        it.mesh.setMatrixAt(it.i, mtx);
        dirty[it.mesh.uuid] = it.mesh;
      });
    });
    Object.keys(dirty).forEach(function (k) { dirty[k].instanceMatrix.needsUpdate = true; });
  };

  World3D.prototype._labels = function (px, pz, nearId) {
    var w = this._w, h = this._h, cam = this.camera, v = V3(0, 0, 0);
    this.buildings.forEach(function (b) {
      if (!b.el) return;
      var dx = b.cx - px, dz = b.cz - pz, dist = Math.sqrt(dx * dx + dz * dz);
      var near = b.id === nearId;
      var alpha = near ? 1 : 1 - smooth(dist, 7, 12);
      b.el.classList.toggle('is-near', near);
      v.set(b.cx, b.labelY, b.cz).project(cam);
      if (alpha <= 0.01 || v.z > 1) { b.el.style.opacity = '0'; return; }
      b.el.style.opacity = String(alpha);
      b.el.style.transform = 'translate(' + ((v.x + 1) * w / 2).toFixed(1) + 'px,' + ((1 - v.y) * h / 2).toFixed(1) + 'px) translate(-50%,-100%)';
    });
  };

  World3D.prototype._stepNpcs = function (dt, t) {
    var self = this;
    this.npcs.forEach(function (n) {
      if (n.moving) {
        var dx = n.tx - n.x, dz = n.tz - n.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.05) { n.moving = false; n.wait = 1.5 + self.rnd() * 3.5; }
        else {
          var s = Math.min(d, 0.9 * dt);
          var nx = n.x + dx / d * s, nz = n.z + dz / d * s;
          if (self.isBlocked(nx, nz, 0.2)) { n.moving = false; n.wait = 0.8; }
          else { n.x = nx; n.z = nz; if (Math.abs(dx) > 0.02) n.left = dx < 0; }
        }
      } else if ((n.wait -= dt) <= 0) {
        var a = self.rnd() * 6.28, r = self.rnd() * n.r;
        n.tx = n.hx + Math.cos(a) * r; n.tz = n.hz + Math.sin(a) * r;
        n.moving = true;
      }
      n.a.mesh.position.set(n.x, -n.a.sink, n.z);
      n.a.shadow.position.set(n.x, 0.012, n.z);
      self._animSiegeling(n.a, n.moving, n.left, t + n.phase);
    });
  };

  /** state: { x, z, dir, walking, frame, nearId } — Bob's position in tile units. */
  World3D.prototype.frame = function (state) {
    if (!this.ready || !this.scene || !this._w) return;
    var now = performance.now(), dt = Math.min(0.05, (now - (this._lastT || now)) / 1000);
    this._lastT = now;
    var px = state.x, pz = state.z, dir = state.dir || 'down', walking = !!state.walking;

    if (!this.actors.player) this.actors.player = this._actorMesh(1.36, 1.7, true);
    var p = this.actors.player;
    var pose = walking ? ['idle', 'walk-a', 'idle', 'walk-b'][state.frame & 3] : 'idle';
    this._setActorTex(p, this.bobTex[dir + '-' + pose] || this.bobTex['down-idle']);
    p.mesh.position.set(px, 0, pz);
    p.shadow.position.set(px, 0.012, pz);

    // Follower walks Bob's breadcrumb trail ~1.1 tiles behind.
    var tr = this.trail, last = tr[tr.length - 1];
    if (!last || Math.hypot(last.x - px, last.z - pz) > 0.08) tr.push({ x: px, z: pz });
    if (tr.length > 80) tr.shift();
    var f = this.actors.follower;
    if (f) {
      var need = 1.1, acc = 0, i, fx = tr[0].x, fz = tr[0].z;
      for (i = tr.length - 1; i > 0; i--) {
        var seg = Math.hypot(tr[i].x - tr[i - 1].x, tr[i].z - tr[i - 1].z);
        if (acc + seg >= need) { var k = (need - acc) / seg; fx = tr[i].x + (tr[i - 1].x - tr[i].x) * k; fz = tr[i].z + (tr[i - 1].z - tr[i].z) * k; break; }
        acc += seg;
      }
      if (tr.length < 2) { fx = px - 0.5; fz = pz + 0.7; }
      if (this._fPrev == null) this._fPrev = { x: fx, z: fz, left: false };
      var fdx = fx - this._fPrev.x;
      if (Math.abs(fdx) > 0.004) this._fPrev.left = fdx < 0;
      var fMoving = Math.hypot(fdx, fz - this._fPrev.z) > 0.004;
      this._fPrev.x = fx; this._fPrev.z = fz;
      f.mesh.position.set(fx, -f.sink, fz);
      f.shadow.position.set(fx, 0.012, fz);
      this._animSiegeling(f, fMoving, this._fPrev.left, now);
    }
    this._stepNpcs(dt, now);

    // Offset HD-2D camera (AnimeVs 'offset' pose), eased.
    var tgt = V3(px, 0.62, pz + 0.55);
    var portrait = this.camera.aspect < 0.8;
    var want = tgt.clone().add(portrait ? V3(0, 13.4, 11.5) : V3(0, 12.9, 12.5));
    var first = !this.camPos;
    if (first) { this.camPos = want.clone(); this.camLook = tgt.clone(); }
    else { this.camPos.lerp(want, 0.12); this.camLook.lerp(tgt, 0.12); }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();

    this.sun.position.copy(this.camLook).add(this.sunOff);
    this.sun.target.position.copy(this.camLook);
    this.sun.target.updateMatrixWorld();

    var sight = this.camPos.clone().sub(tgt), distance = sight.length();
    this._cutTrees(tgt, sight, first);
    var ray = new THREE.Ray(tgt, sight.clone().normalize()), box = new THREE.Box3(), hit = V3(0, 0, 0);
    this.buildings.forEach(function (bd) {
      box.min.set(bd.x0 - 0.3, 0, bd.z0 - 0.3);
      box.max.set(bd.x1 + 0.3, bd.top, bd.z1 + 0.3);
      var hides = box.containsPoint(tgt) || (ray.intersectBox(box, hit) && hit.distanceToSquared(tgt) < distance * distance);
      var op = hides ? 0.12 : 1;
      bd.parts.forEach(function (part) {
        [].concat(part.material).forEach(function (m) { m.opacity += (op - m.opacity) * (hides ? 0.35 : 0.15); });
      });
    });

    if (this.motes) {
      var mp = this.motes.geometry.attributes.position;
      for (i = 0; i < mp.count; i++) { var y = mp.getY(i) + 0.003 + Math.sin(now / 700 + i) * 0.002; if (y > 3.9) y = 0.3; mp.setY(i, y); }
      mp.needsUpdate = true;
    }
    if (this.spray) {
      var sp = this.spray.pts.geometry.attributes.position, s = this.spray;
      s.seeds.forEach(function (sd, j) {
        var k2 = ((now / 900) + sd[1]) % 1;
        sp.setXYZ(j, s.x + Math.cos(sd[0]) * k2 * 0.55, 1.5 + k2 * 0.6 - k2 * k2 * 1.4, s.z + Math.sin(sd[0]) * k2 * 0.55);
      });
      sp.needsUpdate = true;
    }
    if (this.water) { this.water.offset.x = (now / 9000) % 1; this.water.offset.y = Math.sin(now / 2400) * 0.05; }
    this.lampLights.forEach(function (l, j) { l.intensity = (l.userData.base || (l.userData.base = l.intensity)) * (0.93 + Math.sin(now / 160 + j * 1.7) * 0.04 + Math.sin(now / 47 + j) * 0.03); });
    this.crystals.forEach(function (c) {
      c.mesh.rotation.y = now / 700 + c.phase;
      c.mesh.position.y = c.y + Math.sin(now / 520 + c.phase) * 0.12;
      c.rune.material.opacity = 0.5 + Math.sin(now / 400 + c.phase) * 0.25;
    });

    this._labels(px, pz, state.nearId);

    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  };

  root.CampaignWorld3D = World3D;
})(window);
