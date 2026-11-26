/*
 * Siege animated sprite registry, shared by the Siege battle (adventure.js) and
 * the hub's card sheet (home-redesign.js, Siege tab). One copy of the numbers:
 * a sheet re-cut by tools/sprites/slice-*.py changes here only.
 */
(function () {
  'use strict';
  // w/h: the shared cell; fit: how much of the cell's height the idle body
  // fills (the cell also holds raised swords and attack effects), so every
  // sheet renders its body at the same size; base: share of the cell below the
  // feet (petals lying on the ground), sunk below the floor so the feet meet
  // the shadow; frames: strip length per pose. slice-*.py prints all of these.
  var sheets = {
    squirebud: { dir: '/img/sprites/squirebud/squirebud-', w: 642, h: 337, fit: 0.82, base: 0.018,
      frames: { idle: 4, walk: 4, attack: 4, cheer: 4, hurt: 4, fainted: 4 } },
    floraknight: { dir: '/img/sprites/floraknight/floraknight-', w: 526, h: 264, fit: 0.667, base: 0.091,
      frames: { idle: 7, walk: 9, attack: 7, cheer: 4, hurt: 3, fainted: 2 } },
    generoot: { dir: '/img/sprites/generoot/generoot-', w: 518, h: 258, fit: 0.678, base: 0.027,
      frames: { idle: 8, walk: 9, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    sundile: { dir: '/img/sprites/sundile/sundile-', w: 552, h: 224, fit: 0.723, base: 0.027,
      frames: { idle: 9, walk: 9, attack: 8, cheer: 4, hurt: 3, fainted: 2 } },
    raydile: { dir: '/img/sprites/raydile/raydile-', w: 348, h: 153, fit: 0.941, base: 0.033,
      frames: { idle: 8, walk: 8, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    solgator: { dir: '/img/sprites/solgator/solgator-', w: 460, h: 242, fit: 0.814, base: 0.037,
      frames: { idle: 8, walk: 8, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    cacty: { dir: '/img/sprites/cacty/cacty-', w: 480, h: 250, fit: 0.696, base: 0.032,
      frames: { idle: 9, walk: 9, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    jackedty: { dir: '/img/sprites/jackedty/jackedty-', w: 352, h: 219, fit: 0.744, base: 0.027,
      frames: { idle: 9, walk: 9, attack: 7, cheer: 4, hurt: 3, fainted: 2 } },
    cactyjackedty: { dir: '/img/sprites/cactyjackedty/cactyjackedty-', w: 374, h: 235, fit: 0.681, base: 0.03,
      frames: { idle: 9, walk: 9, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    breezee: { dir: '/img/sprites/breezee/breezee-', w: 640, h: 252, fit: 0.512, base: 0.119,
      frames: { idle: 9, walk: 8, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    gagglestand: { dir: '/img/sprites/gagglestand/gagglestand-', w: 340, h: 270, fit: 0.663, base: 0.115,
      frames: { idle: 9, walk: 9, attack: 7, cheer: 4, hurt: 3, fainted: 2 } },
    hurricrane: { dir: '/img/sprites/hurricrane/hurricrane-', w: 496, h: 276, fit: 0.623, base: 0.029,
      frames: { idle: 9, walk: 9, attack: 4, cheer: 4, hurt: 3, fainted: 2 } },
    fawny: { dir: '/img/sprites/fawny/fawny-', w: 266, h: 207, fit: 0.831, base: 0.024,
      frames: { idle: 8, walk: 8, attack: 4, cheer: 4, hurt: 3, fainted: 2 } },
    chilldoe: { dir: '/img/sprites/chilldoe/chilldoe-', w: 302, h: 221, fit: 0.869, base: 0.032,
      frames: { idle: 8, walk: 8, attack: 7, cheer: 3, hurt: 3, fainted: 2 } },
    frostag: { dir: '/img/sprites/frostag/frostag-', w: 366, h: 240, fit: 0.817, base: 0.025,
      frames: { idle: 8, walk: 8, attack: 7, cheer: 4, hurt: 3, fainted: 2 } },
    draco: { dir: '/img/sprites/draco/draco-', w: 254, h: 153, fit: 0.843, base: 0.059,
      frames: { idle: 8, walk: 8, attack: 6, cheer: 5, hurt: 4, fainted: 4 } },
    dracoil: { dir: '/img/sprites/dracoil/dracoil-', w: 450, h: 159, fit: 0.943, base: 0.025,
      frames: { idle: 7, walk: 7, attack: 7, cheer: 5, hurt: 4, fainted: 4 } }
  };
  // displayCardId -> ANIM_SPRITES key, for Siegelings whose sheets have shipped.
  var cards = { squirebud: 'squirebud', floraknight: 'floraknight', generoot: 'generoot',
    sundile: 'sundile', raydile: 'raydile', solgator: 'solgator',
    cacty: 'cacty', jackedty: 'jackedty', cactyjackedty: 'cactyjackedty',
    breezee: 'breezee', gagglestand: 'gagglestand', hurricrane: 'hurricrane',
    fawny: 'fawny', chilldoe: 'chilldoe', frostag: 'frostag',
    draco: 'draco', dracoil: 'dracoil' };
  // Siegelings are sized by rarity, in even steps from a Common (the basic size,
  // 0.72 of Squire Bob's figure) to twice that for Legendary. Mythic is not a
  // card rarity today; it sizes as Legendary should it appear. The table is the
  // catalog rarity per sheet, used when the caller has no live card to read.
  var rarities = { squirebud: 'COMMON', floraknight: 'UNCOMMON', generoot: 'RARE',
    sundile: 'COMMON', raydile: 'UNCOMMON', solgator: 'EPIC',
    cacty: 'COMMON', jackedty: 'UNCOMMON', cactyjackedty: 'RARE',
    breezee: 'COMMON', gagglestand: 'UNCOMMON', hurricrane: 'EPIC',
    fawny: 'COMMON', chilldoe: 'UNCOMMON', frostag: 'RARE',
    draco: 'COMMON', dracoil: 'RARE' };
  var COMMON_VS_SQUIRE = 0.72;
  var RARITY_SCALE = { COMMON: 1, UNCOMMON: 1.25, RARE: 1.5, EPIC: 1.75, LEGENDARY: 2, MYTHIC: 2 };
  // ---- Overlay cutouts: the fallback figure for a Siegeling with no sheet ----
  // A card's OVERLAY art is its creature on a transparent ground (REPLACE and
  // FULL_CARD art are rectangles that would read as a framed picture).
  var STORAGE_PREFIX = 'https://firebasestorage.googleapis.com/';
  function overlayUrl(card) {
    if (!card) return '';
    var c = card.card || {};
    var mode = String(card.cardArtMode || card.artMode || c.cardArtMode || '').toUpperCase();
    var url = String(card.cardArtUrl || c.cardArtUrl || card.artUrl || '').trim();
    return mode === 'OVERLAY' ? url : '';
  }
  // Storage sends no CORS header, so pixels (and WebGL textures) come through our
  // own art mirror, which also serves a resized copy.
  function cutoutSrc(url, width) {
    return url.indexOf(STORAGE_PREFIX) === 0
      ? '/api/cards/art-mirror?w=' + (width || 480) + '&url=' + encodeURIComponent(url) : url;
  }
  // The creature's alpha bounds as fractions of the image, so a cutout can be
  // sized by its body rather than the file's padding (the hub does the same).
  // Unreadable images fall back to the whole frame.
  var bounds = {};
  function measureCutout(url, width, cb) {
    var key = (width || 480) + '|' + url;
    var hit = bounds[key];
    if (hit && hit.done) { cb(hit.value); return; }
    if (hit) { hit.waiters.push(cb); return; }
    hit = bounds[key] = { done: false, waiters: [cb], value: null };
    function finish(v) {
      hit.done = true; hit.value = v;
      hit.waiters.forEach(function (f) { f(v); });
      hit.waiters = [];
    }
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var aspect = img.naturalWidth / (img.naturalHeight || 1) || 1;
      var full = { top: 0, bottom: 1, left: 0, right: 1, aspect: aspect };
      try {
        var w = 96, h = Math.max(1, Math.round(96 / aspect));
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var px = ctx.getImageData(0, 0, w, h).data;
        var t = h, btm = -1, l = w, r = -1;
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            if (px[(y * w + x) * 4 + 3] > 24) {
              if (y < t) t = y; if (y > btm) btm = y; if (x < l) l = x; if (x > r) r = x;
            }
          }
        }
        finish(btm < 0 ? full : { top: t / h, bottom: (btm + 1) / h, left: l / w, right: (r + 1) / w, aspect: aspect });
      } catch (e) { finish(full); }
    };
    img.onerror = function () { finish({ top: 0, bottom: 1, left: 0, right: 1, aspect: 1 }); };
    img.src = cutoutSrc(url, width);
  }
  window.SiegeSprites = {
    sheets: sheets,
    cards: cards,
    poses: ['idle', 'walk', 'attack', 'cheer', 'hurt', 'fainted'],
    /** The sheet for a card id, or null when it has no animated sprite yet. */
    forCard: function (id) { return id && cards[id] ? sheets[cards[id]] : null; },
    /** Body height as a share of Squire Bob's figure. `rarity` (from live card
        data) wins over the catalog table. */
    overlayUrl: overlayUrl,
    cutoutSrc: cutoutSrc,
    measureCutout: measureCutout,
    heightVsSquire: function (id, rarity) {
      var key = String(rarity || (id && cards[id] && rarities[cards[id]]) || 'COMMON').toUpperCase();
      return COMMON_VS_SQUIRE * (RARITY_SCALE[key] || 1);
    }
  };
})();
