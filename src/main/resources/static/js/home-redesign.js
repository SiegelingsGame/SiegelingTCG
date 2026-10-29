/* Art-first home concept. Renders three real, tappable screens from the live
   dashboard card snapshot in home-redesign-data.js, so the layout is judged
   against production Siegeling overlay art rather than grey boxes.
   ES5-flavoured on purpose: this is meant to be lifted into home.js later. */
(function () {
  'use strict';

  var EL_COLOR = {
    FIRE: '#f05b2f', EARTH: '#a7773d', WIND: '#64c987', WATER: '#3c8ed8', ICE: '#7ad9e7',
    SHADOW: '#6d4a9e', ELECTRIC: '#f5cf3d', METAL: '#aeb5b8', UNDEAD: '#9f7c73',
    PSYCHIC: '#db73b4', POISON: '#7ecb4d', LIGHT: '#ffe59a', NEUTRAL: '#95a5a6'
  };
  // Production Land plates double as hero environments; each element gets the
  // biome that reads as its home so the backdrop and the creature agree.
  var EL_LAND = {
    FIRE: 'fire', EARTH: 'earth', WIND: 'wind', WATER: 'water', ICE: 'ice',
    ELECTRIC: 'electric', METAL: 'metal', PSYCHIC: 'psychic', SHADOW: 'shadow',
    POISON: 'poison', LIGHT: 'light', UNDEAD: 'undead', NEUTRAL: 'relic'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function color(el) { return EL_COLOR[String(el || '').toUpperCase()] || EL_COLOR.NEUTRAL; }

  // Elements are shown with the round notch art, not the square element badges.
  // The notch is the mark a player already reads off a card's perimeter, so it
  // is the one they recognise; the square badges belong to the old hub.
  //
  // game.js owns the canonical paths (NOTCH_ICON_PATHS, cache-busted per file),
  // and it is loaded ahead of this script on every page that serves the hub, so
  // they are read from there rather than copied. EL_NOTCH is only the offline
  // fallback for the preview board, which loads no game.js.
  var EL_NOTCH = {
    FIRE: '/img/notches/notch-fire.png?v=2', EARTH: '/img/notches/notch-earth.png?v=2',
    WIND: '/img/notches/notch-wind.png?v=2', WATER: '/img/notches/notch-water.png?v=2',
    ICE: '/img/notches/notch-ice.png?v=2', SHADOW: '/img/notches/notch-shadow.png?v=2',
    ELECTRIC: '/img/notches/notch-electric.png?v=2', METAL: '/img/notches/notch-metal.png?v=2',
    UNDEAD: '/img/notches/notch-undead.png?v=2', PSYCHIC: '/img/notches/notch-psychic.png?v=2',
    POISON: '/img/notches/notch-poison.png?v=2', LIGHT: '/img/notches/notch-light.png?v=2',
    NEUTRAL: '/img/notches/notch-neutral.png?v=2'
  };

  // Matches the .sg-rar swatches in the vibrance pass, so a card's aura before it
  // is turned over is the same colour as the pip it will show afterwards.
  var RARITY_COLOR = {
    COMMON: '#8fa2bd', UNCOMMON: '#64c987', RARE: '#4cc2ff',
    EPIC: '#b06fe0', LEGENDARY: '#ffe066'
  };
  function rarityColor(r) {
    return RARITY_COLOR[String(r || '').toUpperCase()] || RARITY_COLOR.COMMON;
  }

  function notchArt() {
    return (typeof NOTCH_ICON_PATHS !== 'undefined' && NOTCH_ICON_PATHS) || EL_NOTCH;
  }

  // The canonical notch/card-back paths are .png literals; every one has a
  // WebP twin a fraction of the size, which the binder helper swaps in.
  function webp(url) {
    var visual = window.SieglingsCardBinderVisual;
    return visual && visual.preferWebp ? visual.preferWebp(url) : url;
  }

  function icon(el) {
    var key = String(el || '').toUpperCase();
    var map = notchArt();
    return webp(map[key] || map.NEUTRAL || EL_NOTCH.NEUTRAL);
  }
  function land(el) { return '/img/lands/' + (EL_LAND[String(el || '').toUpperCase()] || 'relic') + '.webp'; }
  function title(v) {
    return String(v || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  var DATA = window.HOME_CONCEPT_CARDS || { sieglings: [], knights: [] };
  var CARDS = DATA.sieglings.slice();
  // Binder pool: every card type. Falls back to the Siegeling snapshot offline.
  var ALL_CARDS = DATA.sieglings.slice();
  // Holographic finishes this account bought with remnants (or pulled foil),
  // keyed by lowercased id. The catalog's own `holographic` flag only covers
  // cards that ship foil, so every face rendered here consults this as well.
  var PLAYER_HOLO = {};
  // The tier below it: the card's holo art, no foil shimmer. Kept as a list
  // too because the card renderer takes ids, and every tile would rebuild it.
  var PLAYER_HOLO_ART = {};
  var PLAYER_HOLO_ART_IDS = [];
  function holoIdMap(ids) {
    var map = {};
    (ids || []).forEach(function (id) {
      var key = String(id || '').trim().toLowerCase();
      if (key) map[key] = true;
    });
    return map;
  }
  function setPlayerHolo(ids) { PLAYER_HOLO = holoIdMap(ids); }
  function setPlayerHoloArt(ids) {
    PLAYER_HOLO_ART = holoIdMap(ids);
    PLAYER_HOLO_ART_IDS = Object.keys(PLAYER_HOLO_ART);
  }
  // GOLD: the standard art on a gold card (every gold tier also stays in PLAYER_HOLO).
  var PLAYER_PLAIN_GOLD = {};
  var PLAYER_PLAIN_GOLD_IDS = [];
  function setPlayerPlainGold(ids) {
    PLAYER_PLAIN_GOLD = holoIdMap(ids);
    PLAYER_PLAIN_GOLD_IDS = Object.keys(PLAYER_PLAIN_GOLD);
  }
  function hasPlayerPlainGold(card) {
    return Boolean(card && PLAYER_PLAIN_GOLD[String(card.id || '').trim().toLowerCase()]);
  }
  // CARAT: the standard art with the whole card cast in gold.
  var PLAYER_CARAT = {};
  var PLAYER_CARAT_IDS = [];
  function setPlayerCarat(ids) {
    PLAYER_CARAT = holoIdMap(ids);
    PLAYER_CARAT_IDS = Object.keys(PLAYER_CARAT);
  }
  function hasPlayerCarat(card) {
    return Boolean(card && PLAYER_CARAT[String(card.id || '').trim().toLowerCase()]);
  }
  // GSP: the SP art on a gold card (the server's goldCards list).
  var PLAYER_GOLD = {};
  var PLAYER_GOLD_IDS = [];
  function setPlayerGold(ids) {
    PLAYER_GOLD = holoIdMap(ids);
    PLAYER_GOLD_IDS = Object.keys(PLAYER_GOLD);
  }
  function hasPlayerGold(card) {
    return Boolean(card && PLAYER_GOLD[String(card.id || '').trim().toLowerCase()]);
  }
  // GSPx, the final finish: the SP art cast in gold (a GSPx card also stays in PLAYER_GOLD).
  var PLAYER_HOLO_GOLD = {};
  var PLAYER_HOLO_GOLD_IDS = [];
  function setPlayerHoloGold(ids) {
    PLAYER_HOLO_GOLD = holoIdMap(ids);
    PLAYER_HOLO_GOLD_IDS = Object.keys(PLAYER_HOLO_GOLD);
  }
  function hasPlayerHoloGold(card) {
    return Boolean(card && PLAYER_HOLO_GOLD[String(card.id || '').trim().toLowerCase()]);
  }
  // HOLO, the first finish: a plain sheen over the standard art.
  var PLAYER_HOLO_PLAIN = {};
  var PLAYER_HOLO_PLAIN_IDS = [];
  function setPlayerHoloPlain(ids) {
    PLAYER_HOLO_PLAIN = holoIdMap(ids);
    PLAYER_HOLO_PLAIN_IDS = Object.keys(PLAYER_HOLO_PLAIN);
  }
  function hasPlayerHoloPlain(card) {
    return Boolean(card && PLAYER_HOLO_PLAIN[String(card.id || '').trim().toLowerCase()]);
  }
  function hasPlayerHolo(card) {
    return Boolean(card && PLAYER_HOLO[String(card.id || '').trim().toLowerCase()]);
  }
  function hasPlayerHoloArt(card) {
    return Boolean(card && PLAYER_HOLO_ART[String(card.id || '').trim().toLowerCase()]);
  }
  function withPlayerHolo(card) {
    if (!card) return card;
    var holo = card.holographic !== true && hasPlayerHolo(card);
    var gold = card.goldFinish !== true && hasPlayerGold(card);
    var holoGold = card.holoGoldFinish !== true && hasPlayerHoloGold(card);
    var plainGold = card.plainGoldFinish !== true && hasPlayerPlainGold(card);
    var carat = card.caratFinish !== true && hasPlayerCarat(card);
    var holoPlain = card.holoPlainFinish !== true && hasPlayerHoloPlain(card);
    if (!holo && !gold && !holoGold && !plainGold && !carat && !holoPlain) return card;
    var copy = {};
    for (var key in card) if (Object.prototype.hasOwnProperty.call(card, key)) copy[key] = card[key];
    if (holo) copy.holographic = true;
    if (gold) copy.goldFinish = true;
    if (holoGold) copy.holoGoldFinish = true;
    if (plainGold) copy.plainGoldFinish = true;
    if (carat) copy.caratFinish = true;
    if (holoPlain) copy.holoPlainFinish = true;
    return copy;
  }
  function byIdIn(pool, id) {
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }

  function byId(id) {
    for (var i = 0; i < CARDS.length; i++) if (CARDS[i].id === id) return CARDS[i];
    return CARDS[0];
  }
  function pick(ids) {
    return ids.map(byId).filter(Boolean);
  }


  // Cinematic gallery plates. Unlike the overlay cutouts these are whole scenes,
  // so they carry the hero on their own and only need a scrim for the copy.
  // Every plate the hub owns. `portrait` plates also ship a 9:16 file, which a
  // portrait screen uses instead of cropping a 16:9 band out of a tall scene.
  // Surfaces that want one particular scene name it with scene(id), never by
  // position, so reordering or adding plates cannot swap their art.
  var GALLERY = [
    { img: 'bearby-longfuse',     card: 'bearby',     title: 'The Long Fuse',      place: 'Emberwaste Gate' },
    { img: 'skydon-skyreach',     card: 'skydon',     title: 'Above the Skyreach', place: 'The Drifting Isles' },
    { img: 'frostag-training',    card: 'frostag',    title: 'Morning Drills',     place: 'Rimewood Yard', portrait: true },
    { img: 'bearzooka-rampage',   card: 'bearzooka',  title: 'Emberwaste Rampage', place: 'Cinderfall Reach' },
    { img: 'hurricrane-skyruins', card: 'hurricrane', title: 'First Flight',       place: 'The Pillared Heights', portrait: true },
    { img: 'draco-brood',         card: 'draco',      title: 'The Cinder Brood',   place: 'Moltenmaw Basin' },
    { img: 'bearby-blastoff',     card: 'bearby',     title: 'Blast Off',          place: 'Emberwaste Gate' },
    { img: 'bearnade-payload',    card: 'bearnade',   title: 'Payload Away',       place: 'The Sunken Span' },
    { img: 'cactyjackedty-ruins', card: 'cactyjacked-ty', title: 'Deeper Roots',     place: 'The Sunscar Ruins' }
  ];
  // The home hero shows each of the four main elements exactly once, in the
  // order of the weakness chart (Fire > Ice > Wind > Earth > Fire), so the
  // front door never reads as a fire game. Draco is filed as Fire, not Earth.
  var HERO_SCENES = ['bearby-longfuse', 'frostag-training', 'skydon-skyreach', 'cactyjackedty-ruins'];
  // The dashboard can rename a scene or take it out of the game; the art pool
  // (loading-art.js) carries both, so the hub's own plates follow it too.
  function artRemoved(id) {
    var la = window.SiegelingsLoadingArt;
    return Boolean(la && la.isRemoved && la.isRemoved(id));
  }
  function liveScene(g, byPiece) {
    var p = byPiece[g.img];
    if (!p || (!p.customTitle && !p.place)) return g;
    var copy = {};
    for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)) copy[k] = g[k];
    if (p.customTitle) copy.title = p.title;
    if (p.place) copy.place = p.place;
    return copy;
  }
  function galleryScenes() {
    var la = window.SiegelingsLoadingArt;
    var byPiece = {};
    ((la && la.pool()) || []).forEach(function (p) { byPiece[p.id] = p; });
    var list = GALLERY.filter(function (g) { return !artRemoved(g.img); });
    return (list.length ? list : GALLERY).map(function (g) { return liveScene(g, byPiece); });
  }
  function scene(id) {
    var list = galleryScenes();
    for (var i = 0; i < list.length; i++) if (list[i].img === id) return list[i];
    return list[0];
  }
  function isPortraitScreen() {
    return Boolean(window.matchMedia && window.matchMedia('(orientation: portrait)').matches);
  }
  function plate(entry, thumb) {
    return '/img/gallery/' + entry.img + (thumb ? '-thumb' : '') + '.webp';
  }
  // Full-screen surfaces (the home hero) take the tall file on a tall screen.
  function heroPlate(entry) {
    return entry.portrait && isPortraitScreen()
      ? '/img/gallery/' + entry.img + '-portrait.webp'
      : plate(entry);
  }

  // Hand-picked so the rotation walks through distinct elements and silhouettes.
  var HERO = pick(['pylord', 'glaciemperor', 'aerovane', 'conchious', 'gymstone']);

  /* ---------- daily featured rotation ----------
     The rail used to be the same eight ids forever, so a player who came back
     tomorrow saw yesterday's shelf. It is drawn from the whole Siegeling
     catalog now and reshuffled once a day.

     Deterministic, not random: the day number seeds the order, so every player
     sees the same rail on the same day and a re-render within the day (tab
     switch, live catalog arriving) does not reshuffle under them. No server
     round trip is involved.

     Three, not eight: Home's Featured tile opens the day's picks as a single
     panel, and a trio is a set a player takes in at a glance - eight read as a
     second binder rather than a "Siegelings of the day". */
  var FEATURED_COUNT = 3;
  // Days since the epoch in the player's own timezone, so the rail turns over
  // at their local midnight rather than at UTC - a player in UTC+13 should not
  // get tomorrow's rail at lunchtime.
  function dayIndex(when) {
    var d = when || new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }
  // A card's own draw for a given day. Hashing the id with the seed (rather
  // than shuffling the array) keeps the order stable when the catalog gains or
  // loses a card: only the new card moves.
  function dailyScore(id, seed) {
    var h = (seed * 2654435761) >>> 0;
    for (var i = 0; i < id.length; i++) {
      h = (h ^ id.charCodeAt(i)) >>> 0;
      h = (h * 16777619) >>> 0;
    }
    // xorshift finish: the multiply alone leaves low bits correlated, which
    // showed as the same handful of ids clustering day to day.
    h ^= h >>> 13; h = (h * 1274126177) >>> 0; h ^= h >>> 16;
    return h >>> 0;
  }
  /* Picks the day's rail, preferring one card per element before doubling up so
     the shelf reads as a spread rather than five Fire cards in a row. */
  function dailyFeatured(pool, seed, count) {
    var list = (pool || []).filter(function (c) { return c && c.id; });
    if (list.length <= count) return list.slice();
    var ordered = list.slice().sort(function (a, b) {
      return dailyScore(a.id, seed) - dailyScore(b.id, seed);
    });
    var out = [], seen = {}, spill = [];
    ordered.forEach(function (c) {
      var el = String(c.element || '').toUpperCase();
      if (out.length < count && !seen[el]) { seen[el] = 1; out.push(c); }
      else spill.push(c);
    });
    return out.concat(spill.slice(0, count - out.length));
  }
  /* Drawing from the whole catalog means the shelf can land on whatever the
     dashboard happens to be holding, so two kinds of card are kept off it: one
     with no art (the tile is nothing but art) and one still carrying a
     scaffold id like `new-siegling-3`, which is a card someone is mid-way
     through authoring rather than one to show off. */
  function featurable(c) {
    return Boolean(c && c.id && c.cardArtUrl) && !/^(new-siegling|placeholder|test)[-_]?\d*$/i.test(c.id);
  }
  function featuredForToday() {
    var pool = CARDS.filter(featurable);
    return dailyFeatured(pool.length >= FEATURED_COUNT ? pool : CARDS,
                         dayIndex(), FEATURED_COUNT);
  }

  var FEATURED = featuredForToday();

  /* ---------- hero (rotating art, parallax, elemental motes) ---------- */

  function heroMarkup() {
    return '' +
      '<section class="sg-hero is-scene" data-hero>' +
        '<div class="sg-hero-art">' +
          '<div class="sg-hero-land is-on" data-hero-land></div>' +
          '<div class="sg-hero-land" data-hero-land></div>' +
          '<div class="sg-hero-tint"></div>' +
          '<div class="sg-motes" data-motes></div>' +
        '</div>' +
        '<div class="sg-dots" data-dots></div>' +
        '<div class="sg-hero-copy">' +
          '<div class="sg-eyebrow">The Arena Awaits</div>' +
          '<h1 class="sg-hero-title">THE ARENA AWAITS</h1>' +
          '<p class="sg-hero-sub" data-hero-sub></p>' +
          '<a class="sg-play" href="' + HREF.battle + '">PLAY</a>' +
        '</div>' +
        '<div class="sg-hero-credit" data-hero-credit></div>' +
      '</section>';
  }

  function paintMotes(host, el) {
    var html = '';
    for (var i = 0; i < 14; i++) {
      var left = 12 + Math.random() * 76;
      var dur = 4.5 + Math.random() * 4.5;
      var delay = Math.random() * 6;
      var size = 2 + Math.random() * 4;
      html += '<span class="sg-mote" style="left:' + left.toFixed(1) + '%;bottom:' +
        (12 + Math.random() * 42).toFixed(1) + '%;width:' + size.toFixed(1) + 'px;height:' +
        size.toFixed(1) + 'px;--el:' + color(el) + ';animation-duration:' + dur.toFixed(2) +
        's;animation-delay:-' + delay.toFixed(2) + 's"></span>';
    }
    host.innerHTML = html;
  }

  /* ---------- art-driven page colour ----------
     Home's ground takes its colours from the piece on the wall, so Bearby's
     Emberwaste plate sits on embers and black and Frostag's yard on ice blue.
     Each plate is read once at 40px: the two strongest hues (weighted by
     saturation, ignoring near-black and near-white) and the darkest quarter
     of the pixels. The ground is built from deep tints of those so the white
     copy above it keeps its contrast whatever the art. */
  var artPaletteCache = {};
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, sat = 0;
    if (max !== min) {
      var d = max - min;
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, sat, l];
  }
  function hsl(h, sat, l) {
    return 'hsl(' + Math.round(h) + ' ' + Math.round(sat * 100) + '% ' + Math.round(l * 100) + '%)';
  }
  // Equal HSL lightness is not equal brightness: orange at 42% reads light and
  // brown, blue at 42% reads dark. Each tone is pitched to a target luminance
  // instead, which deepens warm art toward ember red and lifts cool art to ice.
  function hslAtLuminance(h, sat, target) {
    function lum(l) {
      var a = sat * Math.min(l, 1 - l);
      function ch(n) {
        var k = (n + h / 30) % 12, v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      }
      return 0.2126 * ch(0) + 0.7152 * ch(8) + 0.0722 * ch(4);
    }
    var lo = 0.02, hi = 0.8;
    for (var i = 0; i < 18; i++) { var mid = (lo + hi) / 2; if (lum(mid) < target) lo = mid; else hi = mid; }
    return hsl(h, sat, (lo + hi) / 2);
  }
  function readArtPalette(img) {
    var size = 40, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    var data = ctx.getImageData(0, 0, size, size).data;
    var bins = [], lums = [];
    for (var b = 0; b < 24; b++) bins.push({ w: 0, h: 0, s: 0 });
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      var c = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      lums.push(c);
      if (c[1] < 0.22 || c[2] < 0.1 || c[2] > 0.88) continue;
      // Squared saturation lets a vivid accent (Bearby's red mask) outweigh a
      // larger muted field (the dusty rock behind him).
      var w = c[1] * c[1] * (1 - Math.abs(c[2] - 0.5) * 1.3);
      var bin = bins[Math.floor(c[0] / 15) % 24];
      bin.w += w; bin.h += c[0] * w; bin.s += c[1] * w;
    }
    var order = bins.map(function (x, k) { return k; }).sort(function (a, z) { return bins[z].w - bins[a].w; });
    var first = bins[order[0]];
    if (!first.w) return null;
    // The second hue has to be a different colour, not the next bin over.
    var second = null;
    for (var o = 1; o < order.length; o++) {
      var gap = Math.abs(order[o] - order[0]); gap = Math.min(gap, 24 - gap);
      if (gap >= 3 && bins[order[o]].w > first.w * 0.12) { second = bins[order[o]]; break; }
    }
    lums.sort(function (a, z) { return a[2] - z[2]; });
    var dark = lums.slice(0, Math.max(1, Math.floor(lums.length / 4)));
    var dh = 0, ds = 0, dl = 0, dw = 0;
    dark.forEach(function (c) { var w = c[1] + 0.05; dh += c[0] * w; ds += c[1] * w; dl += c[2]; dw += w; });
    var p1 = [first.h / first.w, first.s / first.w];
    var darkHue = dh / dw, darkSat = Math.min(ds / dw, 0.45), darkL = dl / dark.length;
    // A one-colour plate pairs its hue with its own shadows (Bearby: red and
    // black) rather than repeating the hue.
    var p2 = second ? [second.h / second.w, second.s / second.w] : null;
    var shadow = hsl(darkHue, darkSat, Math.min(Math.max(darkL, 0.04), 0.07));
    return {
      glow: hslAtLuminance(p1[0], Math.min(p1[1] * 1.15, 0.9), 0.15),
      glowTwo: p2 ? hslAtLuminance(p2[0], Math.min(p2[1] * 1.1, 0.8), 0.1) : hsl(darkHue, darkSat, 0.1),
      baseA: hslAtLuminance(p1[0], Math.min(p1[1], 0.8), 0.028),
      baseB: shadow,
      baseC: p2 ? hslAtLuminance(p2[0], Math.min(p2[1], 0.7), 0.018) : shadow
    };
  }
  function applyArtPalette(app, pal) {
    if (!pal) return;
    app.style.setProperty('--hero-glow', pal.glow);
    app.style.setProperty('--hero-glow-two', pal.glowTwo);
    app.style.setProperty('--hero-base-a', pal.baseA);
    app.style.setProperty('--hero-base-b', pal.baseB);
    app.style.setProperty('--hero-base-c', pal.baseC);
  }
  // Loads a plate and its palette once; `done` runs when both are ready, so
  // the crossfade and the colour fade can start on the same frame.
  function loadArtPlate(url, done) {
    if (artPaletteCache[url] !== undefined) { if (done) done(artPaletteCache[url]); return; }
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () {
      // A tainted or undecodable plate keeps the default ground.
      try { artPaletteCache[url] = readArtPalette(img); } catch (e) { artPaletteCache[url] = null; }
      if (done) done(artPaletteCache[url]);
    };
    img.onerror = function () { artPaletteCache[url] = null; if (done) done(null); };
    img.src = url;
  }

  function mountHero(app, opts) {
    var hero = app.querySelector('[data-hero]');
    if (!hero) return;
    var idx = (opts && opts.heroIndex) || 0;
    // Two plates crossfade, so the picture eases over in step with the colour.
    var lands = [].slice.call(hero.querySelectorAll('[data-hero-land]')), front = 0;
    var artBox = hero.querySelector('.sg-hero-art');
    var dots = hero.querySelector('[data-dots]');
    var subEl = hero.querySelector('[data-hero-sub]');
    var creditEl = hero.querySelector('[data-hero-credit]');
    var motes = hero.querySelector('[data-motes]');

    var heroScenes = HERO_SCENES.filter(function (id) { return !artRemoved(id); }).map(scene);
    if (!heroScenes.length) heroScenes = galleryScenes().slice(0, HERO_SCENES.length);
    function label(i) {
      var scene = heroScenes[i % heroScenes.length];
      var card = byId(scene.card) || CARDS[0];
      hero.style.setProperty('--el', color(card.element));
      subEl.innerHTML = '<b>' + esc(card.name) + '</b> &middot; ' + esc(title(card.element)) +
        ' &middot; ' + esc(title(card.rarity));
      creditEl.innerHTML = '<span>' + esc(scene.title) + '</span>' + esc(scene.place);
      paintMotes(motes, card.element);
      var d = '';
      for (var k = 0; k < heroScenes.length; k++) d += '<i class="sg-dot' + (k === i % heroScenes.length ? ' on' : '') + '"></i>';
      dots.innerHTML = d;
    }
    function paint(i, instant) {
      var art = heroPlate(heroScenes[i % heroScenes.length]);
      loadArtPlate(art, function (pal) {
        if (!hero.isConnected || idx !== i) return;
        var next = instant ? lands[front] : lands[1 - front];
        next.style.backgroundImage = "url('" + art + "')";
        if (!instant) {
          lands[front].classList.remove('is-on');
          front = 1 - front;
        }
        next.classList.add('is-on');
        applyArtPalette(app, pal);
        label(i);
        // Warm the next plate so its swap never waits on the network.
        loadArtPlate(heroPlate(heroScenes[(i + 1) % heroScenes.length]));
      });
    }
    label(idx);
    paint(idx, true);

    if (!opts || !opts.freeze) {
      // Home re-renders on every visit; a detached hero stops its own timer so
      // stale rotations never repaint the page colour.
      var heroTimer = setInterval(function () {
        if (!hero.isConnected) { clearInterval(heroTimer); return; }
        idx += 1; paint(idx);
      }, 7000);
    }

    // Parallax: the plate drifts slower than the scroll so the hero gains depth
    // without a second render pass.
    var scroll = app.querySelector('.sg-scroll');
    if (scroll) {
      scroll.addEventListener('scroll', function () {
        artBox.style.setProperty('--par', (scroll.scrollTop * 0.30).toFixed(1) + 'px');
      }, { passive: true });
    }
  }

  /* ---------- collapsible quick-action rail ---------- */

  // One bar, not two. The quick-action rail used to sit directly above the tab
  // bar, which read as a double header and cost ~56px of artwork. The tray
  // mechanic it carried is worth keeping, so it moved onto the tabs themselves:
  // a tab with sub-destinations slides its tray up out of the bar.
  // Real destinations. Until now every control was inert; these are the routes
  // firebase.json already serves, so the design can front the live game.
  // The new design owns these paths now; the old hub moved to /legacy/*. Screens
  // are addressed by real URLs rather than ?screen=, so a link, a bookmark and
  // the Back button all behave like a normal site.
  var PATH_SCREEN = {
    '/home': 'home', '/cards': 'collection', '/decks': 'decks',
    '/deck-builder': 'builder', '/shop': 'shop', '/profile': 'profile',
    '/social': 'social', '/settings': 'settings', '/help': 'help',
    '/achievements': 'profile', '/next': 'home',
    // Sign-in used to leave the new design entirely: /login forwarded to the old
    // hub, so tapping Sign In dropped the player onto the page this redesign
    // replaced. It is a screen here now.
    '/login': 'auth', '/lobbies': 'lobbies', '/gallery': 'art'
  };
  var SCREEN_PATH = {
    home: '/home', collection: '/cards', decks: '/decks', builder: '/deck-builder',
    shop: '/shop', profile: '/profile', social: '/social', settings: '/settings',
    help: '/help', play: '/home', auth: '/login', art: '/gallery', lobbies: '/lobbies'
  };
  function screenForPath(pathname) {
    var clean = String(pathname || '/home').replace(/\/+$/, '') || '/home';
    // A table's room carries its code in the path: /room/AB12CD.
    if (clean === '/room' || /^\/room\/[A-Za-z0-9]+$/.test(clean)) return 'room';
    return PATH_SCREEN[clean] || null;
  }
  function pathForScreen(screen) {
    // The room's path is its table, so it is never rebuilt from the screen name.
    if (screen === 'room') return location.pathname + location.search;
    return SCREEN_PATH[screen] || ('/home');
  }

  // Two kinds of destination, and conflating them is what made the new HUD feel
  // broken: tapping Cards or Shop bounced the player back into the OLD hub.
  //   INTERNAL - a screen this design already owns; routed in place, no reload.
  //   EXTERNAL - the actual game or a feature not yet redesigned. Battle and
  //              Siege belong here on purpose: they are gameplay, not layout.
  // Battle points at /battle, not /play: /play still opens the old welcome/mode
  // screen, and a player who already pressed Battle has made that choice.
  var INTERNAL = {
    'Home': 'home', 'Cards': 'collection', 'Collection': 'collection',
    'Decks': 'decks', 'Shop': 'shop', 'Profile': 'profile', 'Play': 'play',
    'Deck Builder': 'builder', 'Social': 'social', 'Settings': 'settings', 'Help': 'help',
    'Sign In': 'auth', 'Create Account': 'auth', 'Log In': 'auth', 'Register': 'auth',
    'Gallery': 'art'
  };
  var EXTERNAL = {
    'Arena': '/battle', 'Battle': '/battle', 'Siege': '/siege', 'Gauntlet': '/gauntlet', 'Keep': '/keep', 'Chronicles': '/chronicles', 'Dominion': '/dominion',
    'Social Lobbies': 'social',
    'Featured Packs': 'shop', 'Open Packs': 'shop', 'Siegelcoins': 'shop'
  };
  var HREF = { battle: '/battle', siege: '/siege', keep: '/keep', chronicles: '/chronicles',
               lobbies: '/lobbies', login: '/login', help: '/help' };

  // Every "Lobbies" control opens the Lobbies screen (open tables plus the
  // day's tournament). They used to point at /social, which lands on the
  // player's own profile.
  function lobbiesAttrs() {
    return ' href="' + HREF.lobbies + '" data-screen="lobbies"';
  }

  // Returns the anchor attributes for a label: an in-app screen swap where this
  // design owns the destination, a real navigation where it does not.
  function linkAttrs(label) {
    if (label === 'Social Lobbies' || label === 'Lobbies & Tournaments') return lobbiesAttrs();
    if (INTERNAL[label]) return ' href="' + pathForScreen(INTERNAL[label]) + '" data-screen="' + INTERNAL[label] + '"';
    var ext = EXTERNAL[label];
    if (!ext) return '';
    if (ext.charAt(0) !== '/') return ' href="' + pathForScreen(ext) + '" data-screen="' + ext + '"';
    return ' href="' + ext + '"';
  }

  // Tray badges were invented ("412" cards, "6" decks, "11 open", "4 on", a "2h"
  // Keep timer). They are derived from the live payload now, and a count the
  // payload cannot supply is simply not drawn - a blank badge is honest, a
  // plausible one is not.
  function navFor(opts) {
    var live = (opts && opts.live) || {};
    var n = function (v) { return (v == null || v === 0) ? '' : String(v); };
    var rooms = (opts && opts.lobbies != null) ? opts.lobbies : live.lobbies;
    var saved = live.savedDecks && live.savedDecks.length;
    var runs = (opts && opts.siegeRuns && opts.siegeRuns.length) || 0;
    var online = (live.friends || []).filter(function (f) {
      return f && f.presence && f.presence.online;
    }).length;
    var openQuests = (liveQuests(opts) || []).filter(function (q) { return !q[2]; }).length;
    return [
      // Home carried no tray, so it was the one tab in the bar with no caret -
      // and the caret is not decoration, it rotates when a tray opens. Rather
      // than print a control that promises nothing, Home now has what every
      // other tab has: its rows are the Home screen's own sections, and they
      // take you to the section rather than to a screen of their own, because
      // that is where Leaderboards, Objectives and Expeditions actually live.
      { id: 'home', ico: '⌂', label: 'Home', screen: 'home', items: [
          ['Featured Siegelings', ''],
          ['Hall of Siege', ''],
          ['From the Gallery', ''],
          ['Daily Objectives', n(openQuests)],
          ['Continue Playing', runs ? n(runs) : '']] },
      // Keep this tray aligned with the top-level Play destinations.
      { id: 'play', ico: '⚔', label: 'Play', screen: 'play', items: [
          ['Arena', ''], ['Siege', runs ? 'Saved' : ''], ['Dominion', ''],
          ['Lobbies & Tournaments', n(rooms) ? n(rooms) + ' open' : '']] },
      { id: 'collection', ico: '◈', label: 'Collection', screen: 'collection', items: [
          ['Cards', n(live.ownedTotal != null ? live.ownedTotal : (ALL_CARDS.length || null))],
          ['Decks', n(saved)], ['Deck Builder', '']] },
      { id: 'shop', ico: '⬢', label: 'Shop', screen: 'shop', items: [
          ['Featured Packs', n(live.packs && live.packs.length)],
          ['Open Packs', ''], ['Siegelcoins', '']] },
      // Social is its own tab now rather than a row inside More: it is where the
      // player's own profile, their friends and their messages all live, and it
      // is checked far too often to sit two taps deep. Its tray mirrors the
      // screen's own three tabs, so Social carries the same caret and the same
      // "tap again for sub-destinations" contract as every other tab with
      // somewhere to go - a lone tray-less tab read as a broken one. The third
      // tuple slot is the screen tab the row opens.
      { id: 'social', ico: '☻', label: 'Social', screen: 'social',
        badge: unreadThreadCount(opts), items: [
          ['Profile', '', 'profile'],
          ['Friends', n(online), 'friends'],
          ['Messages', n(unreadThreadCount(opts)), 'messages']] },
      // Profile and Social are gone from here; what remains is genuinely
      // miscellaneous.
      { id: 'more', ico: '⋯', label: 'More', items: [
          ['Settings', ''], ['Help', '']],
        guestItems: [
          ['Sign In', 'Save decks'], ['Create Account', ''],
          ['Settings', ''], ['Help', '']] }
    ];
  }

  /* ---------- content sections ---------- */

  /* ---------- art fitting ----------
     Card art is a cutout on transparency, but how much empty margin each file
     carries around its creature varies wildly - Generoot sits in the upper half
     of its own canvas while Claw Queen fills hers. A single CSS scale therefore
     cannot make the rail read evenly: it enlarges the padding along with the
     creature, so one tile looks full and the next looks half empty.

     So measure instead. Each art URL is drawn once to a small offscreen canvas,
     its alpha bounding box found, and a transform written that puts the CREATURE
     - not the file - at the size and position the tile wants. Measurements are
     cached per URL in localStorage, so the rail pays for this once per card.

     Reading pixels needs the image to be CORS-clean. Card art is served from
     Firebase Storage, which may or may not send the header, so a tainted canvas
     is expected rather than exceptional: it throws, we catch, and the tile keeps
     the plain CSS framing it has today. Nothing depends on the measurement. */
  var ART_FIT_KEY = 'sgArtFitV1';
  var ART_FIT_SAMPLE = 64;      // plenty for a bounding box, cheap to scan
  var ART_FIT_ALPHA = 12;       // below this a pixel is padding, not art
  var ART_FIT_MAX_SCALE = 2.1;  // a tiny cutout blown up past this turns to mush
  var artFitCache = null;

  function artFitStore() {
    if (artFitCache) return artFitCache;
    try { artFitCache = JSON.parse(localStorage.getItem(ART_FIT_KEY) || '{}'); }
    catch (e) { artFitCache = {}; }
    if (!artFitCache || typeof artFitCache !== 'object') artFitCache = {};
    return artFitCache;
  }
  function artFitSave() {
    try { localStorage.setItem(ART_FIT_KEY, JSON.stringify(artFitCache || {})); }
    catch (e) { /* private mode: measuring again next load is fine */ }
  }

  /* Alpha bounding box as fractions of the image, or null when the pixels are
     unreadable.

     The pixels are read from a SEPARATE probe image, never from the one on
     screen. Card art is served cross-origin from Firebase Storage, so reading it
     needs `crossOrigin = "anonymous"` - and that attribute makes the load FAIL
     outright when the server sends no CORS header. Putting it on the visible
     tile would trade uneven sizing for blank tiles; on a throwaway probe the
     same failure costs nothing and the tile keeps its CSS framing. */
  /* Card art is served from Firebase Storage with no Access-Control-Allow-Origin,
     so a direct probe can never be read - it was failing on every card, which is
     why every tile fell back to the blanket scale and overflowed its frame. The
     same bytes come back CORS-clean from our own origin via the art mirror, so
     that is what the probe loads. A non-storage URL (the offline snapshot's
     `/img/...` art) is already same-origin and is probed directly. */
  /* The probe samples a 64px canvas, so it asks the mirror for its smallest
     cut rather than the full original. Tiles show a ready-made Storage cut
     (artAttrs); the mirror answers a probe of one from that art's stored 160px
     cut, without resizing. */
  function probeUrlFor(src) {
    return /^https?:\/\/firebasestorage\.googleapis\.com\//.test(src)
      ? '/api/cards/art-mirror?w=160&url=' + encodeURIComponent(src)
      : src;
  }

  /* Storage creature art is up to ~2.4 MB per file, and these surfaces draw it
     at most ~470 device px, so they take a ready-made WebP cut (falling back to
     the art mirror, then the original - see card-binder-visual artImgAttrs). */
  function artAttrs(url, width) {
    var visual = window.SieglingsCardBinderVisual;
    return visual && visual.artImgAttrs
      ? visual.artImgAttrs(url, width || 480)
      : 'src="' + esc(url) + '"';
  }

  function measureArtBox(src) {
    return new Promise(function (resolve) {
      var probe = new Image();
      probe.crossOrigin = 'anonymous';
      probe.decoding = 'async';
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      probe.onerror = function () { finish(null); };   // no CORS header, or gone
      probe.onload = function () {
        var w = probe.naturalWidth, h = probe.naturalHeight;
        if (!w || !h) return finish(null);
        var cw = Math.min(ART_FIT_SAMPLE, w), ch = Math.min(ART_FIT_SAMPLE, h);
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return finish(null);
        var data;
        try {
          ctx.drawImage(probe, 0, 0, cw, ch);
          data = ctx.getImageData(0, 0, cw, ch).data;
        } catch (e) {
          return finish(null);   // tainted despite the attribute
        }
        var x0 = cw, y0 = ch, x1 = -1, y1 = -1;
        for (var y = 0; y < ch; y++) {
          for (var x = 0; x < cw; x++) {
            if (data[(y * cw + x) * 4 + 3] > ART_FIT_ALPHA) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) return finish(null);   // fully transparent
        finish({ x0: x0 / cw, y0: y0 / ch, x1: (x1 + 1) / cw, y1: (y1 + 1) / ch });
      };
      probe.src = probeUrlFor(src);
      // A probe that neither loads nor errors must not leave the tile waiting.
      setTimeout(function () { finish(null); }, 6000);
    });
  }

  /* Turns a bounding box into the numbers that seat the creature in its tile:
     the scale at which it fills the frame in whichever axis runs out first
     (callers may use less), the shift that centres it horizontally on the
     creature rather than on the file, and the shift that sits it on the
     frame's bottom edge. */
  function artFitTransform(box, el) {
    if (!box) return null;
    var bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    if (bw <= 0 || bh <= 0) return null;
    // object-fit:contain letterboxes the image inside the element, so the
    // painted content is what the fractions actually apply to.
    var ew = el.clientWidth, eh = el.clientHeight;
    if (!ew || !eh || !el.naturalWidth || !el.naturalHeight) return null;
    var nat = el.naturalWidth / el.naturalHeight;
    var pw = ew, ph = ew / nat;
    if (ph > eh) { ph = eh; pw = eh * nat; }
    /* Fit against the TILE, not against the letterbox. The art files are 2:3
       portrait while the tile frame is close to square, so `contain` already
       leaves a wide empty margin on both sides; scaling by 1/max(bw,bh) only
       fills that narrow painted column, which is why a broad creature such as
       Hydroxyl (alpha box 0.95 wide x 0.52 tall) sat tiny in the middle of its
       plate while a tall one filled it. Measuring the creature in element
       pixels and fitting it to ew x eh uses the horizontal room the letterbox
       wastes, and still cannot clip: each axis is bounded by the frame. */
    return {
      /* The largest scale that still fits inside the frame on both axes. */
      fill: Math.min(ew / (bw * pw), eh / (bh * ph)),
      // With transform-origin at centre bottom: shift the creature's centre onto
      // the frame's centre line, and its feet onto the frame's bottom.
      dx: (0.5 - (box.x0 + box.x1) / 2) * pw,
      dy: (1 - box.y1) * ph
    };
  }

  function artFitStyle(fit, scale) {
    return 'scale(' + Math.min(ART_FIT_MAX_SCALE, scale).toFixed(3) + ') ' +
           'translate(' + fit.dx.toFixed(1) + 'px, ' + fit.dy.toFixed(1) + 'px)';
  }

  /* The size a designer gave this creature on its card face in the dashboard.
     Mirrors card-binder-visual's own clamp, so a tile and a binder card read
     the same authored size; a card with no authored scale is 1, as it is
     there. */
  function authoredArtScale(img) {
    var v = Number(img.getAttribute('data-art-scale'));
    return (isFinite(v) && v > 0) ? Math.min(3, Math.max(0.25, v)) : 1;
  }

  /* One measurement, cached: null is a real answer (unreadable pixels) and is
     stored so the probe does not run again. */
  function artBoxFor(img) {
    var src = img.currentSrc || img.src;
    if (!src) return Promise.resolve(null);
    var store = artFitStore();
    if (store[src] !== undefined) return Promise.resolve(store[src]);
    return measureArtBox(src).then(function (box) {
      store[src] = box || null;
      artFitSave();
      return box;
    });
  }

  /* The art stays hidden (CSS, until data-art-fit="done") so a player never
     sees it at the scale(1) fallback and then jump to its fit. The transform is
     applied while the image is still hidden and transition-less, and the style
     flushed, so the reveal fades the art in at its final size rather than
     animating the resize. */
  function revealArtFit(img, transform) {
    if (transform) {
      img.style.setProperty('--art-fit', transform);
      void img.offsetWidth;
    }
    img.dataset.artFit = 'done';
  }

  function applyArtFit(img) {
    if (!img || img.dataset.artFit) return;
    img.dataset.artFit = 'pending';
    artBoxFor(img).then(function (box) {
      var fit = box && artFitTransform(box, img);
      revealArtFit(img, fit && artFitStyle(fit, fit.fill));
    });
  }

  /* ---------- relative fit (Showcase) ----------
     Everywhere else a tile fits its creature to its own frame, which is right
     for a rail the app picked: each card gets the best look it can. The
     Showcase is the player's own six, standing together, and there a Bearby
     that fills its tile exactly as much as a Glaciemperor tells them nothing
     about either. These tiles share ONE factor instead, so the sizes stay
     relative.

     The reference is the size the designer authored on the card face in the
     dashboard (`cardArtScale`), because that is where a Siegeling's size is
     decided. A card face shows the creature at (alpha box x cardArtScale), and
     every tile here shares a frame and a 2:3 source, so rendering each one at
     `K x cardArtScale` reproduces the binder's proportions exactly. K is the
     largest factor that still clips nobody: the tightest per-tile fill bound
     divided by that tile's authored scale. Tiles whose pixels could not be
     read sit out - they keep the CSS fallback rather than drag K down on a
     bounding box nobody measured. */
  function applyArtFitGroup(rail) {
    var imgs = Array.prototype.slice.call(rail.querySelectorAll('.sg-feat-art img'));
    if (!imgs.length) return;
    Promise.all(imgs.map(artBoxFor)).then(function (boxes) {
      var seats = [], k = Infinity;
      imgs.forEach(function (img, i) {
        var fit = boxes[i] && artFitTransform(boxes[i], img);
        if (!fit) return;
        var authored = authoredArtScale(img);
        seats.push({ img: img, fit: fit, authored: authored });
        k = Math.min(k, fit.fill / authored);
      });
      imgs.forEach(function (img) {
        var seat = seats.filter(function (s) { return s.img === img; })[0];
        revealArtFit(img, seat ? artFitStyle(seat.fit, k * seat.authored) : null);
      });
    });
  }

  // A grouped rail cannot be fitted one image at a time - K is only known once
  // every tile in it has been measured - so it waits for the whole row to load.
  function whenLoaded(imgs) {
    return Promise.all(imgs.map(function (img) {
      if (img.complete && img.naturalWidth) return Promise.resolve();
      return new Promise(function (resolve) {
        img.addEventListener('load', function () { resolve(); });
        img.addEventListener('error', function () { resolve(); });
      });
    }));
  }

  function mountArtFit(app) {
    if (!app) return;
    var rails = Array.prototype.slice.call(app.querySelectorAll('[data-art-fit-group]'));
    rails.forEach(function (rail) {
      if (rail.dataset.artFitGroup === 'done') return;
      rail.dataset.artFitGroup = 'done';
      var imgs = Array.prototype.slice.call(rail.querySelectorAll('.sg-feat-art img'));
      imgs.forEach(function (img) { img.dataset.artFit = 'pending'; });
      whenLoaded(imgs).then(function () { applyArtFitGroup(rail); });
    });
    var imgs = app.querySelectorAll('.sg-feat-art img');
    Array.prototype.forEach.call(imgs, function (img) {
      if (img.complete && img.naturalWidth) applyArtFit(img);
      else {
        img.addEventListener('load', function () { applyArtFit(img); });
        // Hidden-until-fitted must never mean hidden for good: once the
        // fallback chain has run out, show whatever the browser has.
        img.addEventListener('error', function () {
          setTimeout(function () {
            if (!img.dataset.artFit && !(img.complete && img.naturalWidth)) revealArtFit(img, null);
          }, 4000);
        });
      }
    });
  }

  function featuredMarkup() {
    return '' +
      '<section class="sg-section" data-home-section="Featured Siegelings">' +
        '<div class="sg-section-head"><h3>Featured Siegelings</h3>' +
          '<span class="sg-feat-note">Today\'s three &middot; new at midnight</span>' +
          '<a href="/cards" data-screen="collection">Binder</a></div>' +
        '<div class="sg-swipe sg-feat-trio">' + FEATURED.map(function (c) {
          return '<article class="sg-feat" data-card="' + esc(c.id) + '" tabindex="0" style="--el:' + color(c.element) + '">' +
            '<div class="sg-feat-plate"></div>' +
            '<div class="sg-feat-art"><img ' + artAttrs(c.cardArtUrl) + ' alt="' + esc(c.name) + '" loading="lazy"></div>' +
            '<div class="sg-feat-foot"><span class="sg-feat-name">' + esc(c.name) + '</span>' +
            '<span class="sg-feat-marks"><i class="sg-rar ' + esc(String(c.rarity || '').toLowerCase()) + '"></i>' +
            '<img src="' + esc(icon(c.element)) + '" alt="' + esc(title(c.element)) + '"></span></div>' +
          '</article>';
        }).join('') + '</div>' +
      '</section>';
  }

  function gallerySection() {
    return '<section class="sg-section" data-home-section="From the Gallery">' +
      '<div class="sg-section-head"><h3>From the Gallery</h3><a href="/gallery" data-screen="art">See All</a></div>' +
      '<div class="sg-swipe sg-swipe-wide">' + galleryScenes().map(function (g) {
        var card = byId(g.card) || CARDS[0];
        return '<a class="sg-plate" href="/gallery" data-screen="art" style="--el:' + color(card.element) + '">' +
          '<img src="' + plate(g, true) + '" alt="' + esc(g.title) + '" loading="lazy">' +
          '<div class="sg-plate-foot"><strong>' + esc(g.title) + '</strong>' +
          '<span>' + esc(card.name) + ' &middot; ' + esc(g.place) + '</span></div>' +
        '</a>';
      }).join('') + '</div>' +
    '</section>';
  }

  // The four sample objectives that used to back this strip were invented, and a
  // signed-out player was shown them as if they were their own. There is no
  // honest fallback for someone else's daily progress, so when
  // /api/missions/daily does not answer the strip says what it is waiting on.
  function liveQuests(opts) {
    var m = opts && opts.live && opts.live.missions;
    if (!m || !m.length) return null;
    return m.slice(0, 5).map(function (q) {
      return [q.title || q.name || q.description || 'Objective',
              q.rewardLabel || (q.reward != null ? q.reward + ' 🪙' : ''),
              Boolean(q.completed || q.claimed || q.complete)];
    });
  }

  function questsMarkup(opts) {
    var quests = liveQuests(opts);
    if (!quests) {
      return '<div class="sg-strip is-empty" data-home-section="Daily Objectives">' +
        '<div class="sg-strip-head"><h4>Daily Objectives</h4><span class="sep">•</span>' +
        '<span class="cnt">' + (opts && opts.guest ? 'Sign in to track them' : 'Unavailable') +
        '</span></div>' +
      '</div>';
    }
    var done = quests.filter(function (q) { return q[2]; }).length;
    return '<div class="sg-strip" data-strip data-home-section="Daily Objectives">' +
      '<div class="sg-strip-head"><h4>Daily Objectives</h4><span class="sep">•</span>' +
      '<span class="cnt">' + done + '/' + quests.length + ' Complete</span><span class="caret">›</span></div>' +
      '<div class="sg-strip-body"><div>' + quests.map(function (q) {
        return '<div class="sg-quest' + (q[2] ? ' done' : '') + '"><span class="tick">✓</span>' +
          '<span class="qt">' + esc(q[0]) + '</span><span class="qr">' + esc(q[1]) + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="sg-bar"><i style="width:' + Math.round(done / Math.max(1, quests.length) * 100) + '%"></i></div>' +
    '</div>';
  }

  /* ---------- active expeditions ----------
     This slot used to show a "Selected Deck" with an 18W-6L record and a 75%
     win rate. None of those numbers existed: the Battle table has no selected
     deck outside a loadout, and no per-deck record is stored anywhere. What IS
     persisted per account is the Siege checkpoint - one save per mode, resumable
     by token - so the slot now shows only that, and says so plainly when there
     is nothing saved. */

  function partyPip(m) {
    var el = color(m.element);
    var hp = Number(m.maxHp) > 0 ? Math.max(0, Math.min(100, Math.round(Number(m.hp) / Number(m.maxHp) * 100))) : 100;
    return '<span class="sg-exp-pip' + (m.alive === false ? ' is-down' : '') + '" style="--el:' + el + '">' +
      (m.artUrl ? '<img src="' + esc(m.artUrl) + '" alt="" loading="lazy">' : '<i class="sg-exp-pip-blank"></i>') +
      (m.level != null ? '<b class="sg-exp-lv">' + esc(m.level) + '</b>' : '') +
      '<i class="sg-exp-hp"><u style="width:' + hp + '%"></u></i>' +
    '</span>';
  }

  // Everything here is read off the run the server handed back; nothing is
  // invented. A field the payload omits is simply not drawn.
  function expeditionCard(run) {
    var knight = run.knight || {};
    var el = knight.element || (run.land && run.land.element) || 'NEUTRAL';
    var landName = (run.land && run.land.name) || run.slotLabel || 'Expedition';
    var floor = (run.landSegment != null) ? ('Floor ' + (Number(run.landSegment) + 1)) : '';
    var party = (run.party || []).slice(0, 5);
    var inBattle = Boolean(run.battle);
    return '<article class="sg-exp" style="--el:' + color(el) + '">' +
      '<div class="sg-exp-bg" style="background-image:url(\'' + land(el) + '\')"></div>' +
      '<div class="sg-exp-veil"></div>' +
      (knight.artUrl ? '<div class="sg-exp-knight"><img src="' + esc(knight.artUrl) + '" alt="" loading="lazy"></div>' : '') +
      '<div class="sg-exp-body">' +
        '<span class="sg-exp-kicker">' + esc(run.slotLabel || 'Siege Expedition') + '</span>' +
        '<h4>' + esc(landName) + '</h4>' +
        '<div class="sg-exp-meta">' +
          (knight.name ? '<span>' + esc(knight.name) + '</span>' : '') +
          (floor ? '<span>' + esc(floor) + '</span>' : '') +
          (run.gold != null ? '<span class="sg-exp-gold">' + esc(run.gold) + 'g</span>' : '') +
        '</div>' +
        (party.length ? '<div class="sg-exp-party">' + party.map(partyPip).join('') + '</div>' : '') +
        (inBattle ? '<span class="sg-exp-flag">Battle in progress</span>' : '') +
        '<a class="sg-exp-go" href="' + HREF.siege + '">Resume &rsaquo;</a>' +
      '</div>' +
    '</article>';
  }

  function expeditionsSection(opts) {
    var runs = (opts && opts.siegeRuns) || [];
    var body = runs.length
      ? runs.map(expeditionCard).join('')
      : '<a class="sg-exp is-empty" href="' + HREF.siege + '">' +
          '<span class="sg-exp-icon">&#9968;</span>' +
          '<span class="sg-exp-empty-body"><strong>No expedition in progress</strong>' +
          '<em>Start a Siege run and it waits for you here.</em></span>' +
          '<span class="sg-exp-go">Start &rsaquo;</span>' +
        '</a>';
    return '<section class="sg-section" data-home-section="Continue Playing">' +
      '<div class="sg-section-head"><h3>Continue Playing</h3>' +
      '<a href="' + HREF.siege + '">Siege</a></div>' +
      '<div class="sg-exps">' + body + '</div>' +
    '</section>';
  }

  /* ---------- chrome ---------- */

  // Notifications live in the same localStorage key the shipping hub writes, so
  // match results and rewards a player already earned on /legacy keep showing up
  // here. The redesign previously painted a decorative sparkle with no panel.
  var NOTIF_LIMIT = 40;
  var NOTIF_TYPE_LABELS = {
    match: 'Match', reward: 'Reward', invite: 'Invite', unlock: 'Unlock',
    pack: 'Packs', title: 'Titles', badge: 'Badges', rank: 'Rank', server: 'Server'
  };

  function notifStorageKey(opts) {
    var email = opts && opts.live && (opts.live.email || (opts.live.user && opts.live.user.email));
    return 'sieglingsNotifs:' + (email || 'anon');
  }

  function loadNotifs(opts) {
    try {
      var rows = JSON.parse(localStorage.getItem(notifStorageKey(opts)) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      return [];
    }
  }

  function saveNotifs(opts, rows) {
    try {
      localStorage.setItem(notifStorageKey(opts), JSON.stringify((rows || []).slice(0, NOTIF_LIMIT)));
    } catch (e) { /* private mode */ }
  }

  function unreadNotifCount(opts) {
    return loadNotifs(opts).filter(function (n) { return n && !n.read; }).length;
  }

  function formatNotifTime(ms) {
    var t = Number(ms) || 0;
    if (!t) return '';
    var mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm';
    var hrs = Math.round(mins / 60);
    if (hrs < 48) return hrs + 'h';
    return Math.round(hrs / 24) + 'd';
  }

  function notifPanelMarkup(opts) {
    var rows = loadNotifs(opts);
    var list = rows.length
      ? rows.map(function (n) {
          return '<div class="sg-notif-row' + (n.read ? '' : ' is-unread') + '">' +
            '<div class="sg-notif-row-head">' +
              '<span class="sg-notif-type">' + esc(NOTIF_TYPE_LABELS[n.type] || 'Update') + '</span>' +
              '<time>' + esc(formatNotifTime(n.time)) + '</time>' +
            '</div>' +
            '<strong>' + esc(n.title || 'Update') + '</strong>' +
            (n.body ? '<p>' + esc(n.body) + '</p>' : '') +
          '</div>';
        }).join('')
      : '<div class="sg-notif-empty">No notifications yet. Match results, rewards, invites, and unlocks will show up here.</div>';
    return '<div class="sg-notif-panel hidden" id="sgNotifPanel" role="dialog" aria-label="Notifications" data-notif-panel>' +
      '<div class="sg-notif-panel-head">' +
        '<strong>Notifications</strong>' +
        '<button class="sg-notif-clear" type="button" data-notif-clear>Clear</button>' +
      '</div>' +
      '<div class="sg-notif-list" data-notif-list>' + list + '</div>' +
    '</div>';
  }

  function mountNotifs(app, opts) {
    if (!app || (opts && opts.guest)) return;
    var bell = app.querySelector('[data-notif-toggle]');
    var panel = app.querySelector('[data-notif-panel]');
    if (!bell || !panel) return;

    function paintBadge() {
      var badge = bell.querySelector('[data-notif-badge]');
      var unread = unreadNotifCount(opts);
      if (!badge) return;
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.classList.toggle('hidden', !unread);
    }

    function setOpen(open) {
      panel.classList.toggle('hidden', !open);
      bell.classList.toggle('active', open);
      bell.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        var rows = loadNotifs(opts);
        if (rows.some(function (n) { return n && !n.read; })) {
          rows.forEach(function (n) { if (n) n.read = true; });
          saveNotifs(opts, rows);
          paintBadge();
        }
      }
    }

    bell.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(panel.classList.contains('hidden'));
    });
    var clear = panel.querySelector('[data-notif-clear]');
    if (clear) {
      clear.addEventListener('click', function (e) {
        e.preventDefault();
        saveNotifs(opts, []);
        var list = panel.querySelector('[data-notif-list]');
        if (list) {
          list.innerHTML = '<div class="sg-notif-empty">No notifications yet. Match results, rewards, invites, and unlocks will show up here.</div>';
        }
        paintBadge();
      });
    }
    app.addEventListener('click', function (e) {
      if (panel.classList.contains('hidden')) return;
      if (e.target.closest && (e.target.closest('[data-notif-panel]') || e.target.closest('[data-notif-toggle]'))) return;
      setOpen(false);
    });
    paintBadge();
  }

  // A guest has no avatar, level or progression to show, so the identity slot
  // carries the sign-in call rather than an empty crest. The coin chip stays
  // (guests hold a starting balance) but the bell goes - there is nothing to
  // notify an account-less player about.
  // Real balance when progression answers; the guest starter otherwise. A guest
  // genuinely holds 100, so that is a fact rather than a placeholder.
  // Number of SiegeKnights the account owns, or nothing at all. Never a made-up
  // level.
  function knightBadge(opts) {
    var knights = opts && opts.live && opts.live.knights;
    var n = knights && knights.length;
    return n ? '<b title="SiegeKnights owned">' + esc(n) + '</b>' : '';
  }

  function accountInitial(opts) {
    var n = (opts && opts.live && opts.live.displayName) || '';
    return n ? n.charAt(0).toUpperCase() : '·';
  }

  // A guest holds no balance - 100 is what an account is *created* with, not
  // what a signed-out visitor has, so showing it was a made-up number too.
  function formatCoins(opts) {
    var gold = opts && opts.live && opts.live.gold;
    return gold != null ? Number(gold).toLocaleString() : '—';
  }

  // Bell glyph matches the legacy hub's notification control rather than the
  // decorative sparkle that read as a cosmetic chip instead of an alert button.
  var BELL_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';

  var MUSIC_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle><path class="sg-music-slash" d="M3 3l18 18"></path></svg>';

  // `extra` lets a screen add its own header controls: { logoHref, afterLogo,
  // beforeMusic }. Only Home's landscape stage uses it today.
  function topMarkup(opts, extra) {
    extra = extra || {};
    var guest = Boolean(opts && opts.guest);
    var logo = '<img class="sg-logo" src="/img/siegelings-icon-256.webp" alt="Siegelings">';
    var unread = unreadNotifCount(opts);
    return '<header class="sg-top' + (guest ? ' is-guest' : '') + '">' +
      // Home's logo is a real page change to the landing, so it carries no
      // data-screen. Everywhere else the logo is the way back to Home, routed
      // in place like any other hub link.
      (extra.logoHref
        ? '<a class="sg-logo-link" href="' + esc(extra.logoHref) + '" aria-label="Siegelings home page">' + logo + '</a>'
        : '<a class="sg-logo-link" href="' + pathForScreen('home') + '" data-screen="home" aria-label="Back to Home">' + logo + '</a>') +
      (extra.afterLogo || '') +
      '<span class="sg-top-spacer"></span>' +
      '<span class="sg-chip coin"><img src="/img/ui/home-stats/siegecoin.png" alt="">' +
        esc(formatCoins(opts, guest)) + '</span>' +
      // hub-music.js owns the state and repaints this on every change.
      (extra.beforeMusic || '') +
      '<button class="sg-music" type="button" data-music-open aria-label="Music" aria-haspopup="dialog" aria-expanded="false">' + MUSIC_ICON + '</button>' +
      (guest
        ? '<a class="sg-signin" href="/login" data-screen="auth">Sign In</a>'
        // The badge used to read a `level` the backend has never had: there is
        // no account level anywhere, only per-SiegeKnight levels. It shows how
        // many knights the account owns, which is real, and the crest is a link
        // to the profile because that is what tapping your own name should do.
        // Notifications sit immediately to the right of the profile crest, same
        // order the shipping hub used (avatar cluster → bell).
        : '<a class="sg-avatar" href="/profile" data-screen="profile" aria-label="Your profile">' +
          '<i>' + esc(accountInitial(opts)) + '</i>' + knightBadge(opts) + '</a>' +
          '<button class="sg-bell" type="button" data-notif-toggle aria-label="Notifications" ' +
            'aria-haspopup="dialog" aria-controls="sgNotifPanel" aria-expanded="false">' +
            BELL_ICON +
            '<span class="sg-notif-badge' + (unread ? '' : ' hidden') + '" data-notif-badge>' +
              (unread > 9 ? '9+' : String(unread)) +
            '</span></button>') +
    '</header>' +
    (guest ? '' : notifPanelMarkup(opts));
  }

  function bottomMarkup(active, opts) {
    opts = opts || {};
    var openTray = opts.openTray;
    var guest = opts.guest;
    var NAV = navFor(opts);
    return '<nav class="sg-bottom' + (openTray ? ' tray-open' : '') + '" data-bottom>' +
      NAV.filter(function (n) { return n.items; }).map(function (n) {
        var items = (guest && n.guestItems) ? n.guestItems : n.items;
        return '<div class="sg-tray' + (n.id === openTray ? ' open' : '') + '" data-tray="' + n.id + '"><div>' +
          '<ul>' + items.map(function (it) {
            var auth = it[0] === 'Sign In' || it[0] === 'Create Account';
            // A row that names a Social sub-tab routes to the Social screen and
            // carries the tab with it, rather than to a screen of its own.
            var attrs;
            if (n.id === 'home') {
              // Home's rows address sections of the Home screen, not screens of
              // their own; the row carries the section it wants and the router
              // scrolls there once Home is rendered.
              attrs = ' href="' + pathForScreen('home') + '" data-screen="home" data-home-goto="' + esc(it[0]) + '"';
            } else if (it[2]) {
              attrs = ' href="' + pathForScreen('social') + '" data-screen="social" data-social-goto="' + esc(it[2]) + '"';
            } else {
              attrs = linkAttrs(it[0]);
            }
            return '<li' + (auth ? ' class="is-auth"' : '') + '>' +
              (attrs ? '<a' + attrs + '>' + esc(it[0]) + '</a>' : esc(it[0])) +
              (it[1] ? '<span>' + esc(it[1]) + '</span>' : '') + '</li>';
          }).join('') + '</ul></div></div>';
      }).join('') +
      '<div class="sg-nav">' + NAV.map(function (n) {
        return '<button type="button" data-nav="' + n.id + '" data-screen="' + esc(n.screen || '') +
          '" class="' + (n.id === active ? 'on' : '') +
          (n.items ? ' has-tray' : '') + (n.id === openTray ? ' tray-on' : '') + '">' +
          '<span class="ico">' + n.ico + '</span>' + esc(n.label) +
          // An unread count belongs on the tab, not only inside the screen:
          // otherwise a waiting message is invisible until you go looking.
          (n.badge ? '<i class="sg-nav-badge">' + esc(n.badge > 9 ? '9+' : String(n.badge)) + '</i>' : '') +
          (n.items ? '<i class="sg-caret" aria-hidden="true"></i>' : '') + '</button>';
      }).join('') + '</div>' +
    '</nav>';
  }

  // A Home tray row lands on the section it names. scroll-margin-top in the
  // stylesheet holds it clear of the floating top chrome, so the offset is not
  // duplicated here; a section the current payload did not render (no live
  // quests, say) simply leaves the player at the top of Home rather than
  // scrolling to nothing.
  function scrollToHomeSection(host, name) {
    if (!host || !name) return;
    requestAnimationFrame(function () {
      var target = host.querySelector('[data-home-section="' + name.replace(/"/g, '\\"') + '"]');
      if (!target) return;
      try {
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch (e) {
        target.scrollIntoView(true);
      }
    });
  }

  var onNavigate = null;

  function mountBottom(app) {
    var bottom = app.querySelector('[data-bottom]');
    if (!bottom) return;
    var trays = [].slice.call(bottom.querySelectorAll('[data-tray]'));
    function openTray(id) {
      // Exactly one tray is ever open, so the bar never grows into a second header.
      trays.forEach(function (t) { t.classList.toggle('open', t.getAttribute('data-tray') === id); });
      bottom.classList.toggle('tray-open', Boolean(id));
      // The open tray has to point back at the tab that owns it, or the panel
      // reads as belonging to whichever tab happens to be selected.
      bottom.querySelectorAll('[data-nav]').forEach(function (b) {
        b.classList.toggle('tray-on', Boolean(id) && b.getAttribute('data-nav') === id);
      });
    }
    bottom.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-nav');
        var screen = btn.getAttribute('data-screen');
        var tray = bottom.querySelector('[data-tray="' + id + '"]');
        var isCurrent = btn.classList.contains('on');
        // First tap on another tab goes to that screen; tapping the tab you are
        // already on opens its tray, which is where the sub-destinations live.
        if (screen && !isCurrent && typeof onNavigate === 'function') {
          openTray(null);
          // The tab itself always lands on Profile; the tray rows are what
          // address Friends and Messages directly.
          if (screen === 'social') setSocialTab('profile');
          onNavigate(screen);
          return;
        }
        var alreadyOpen = tray && tray.classList.contains('open');
        openTray(alreadyOpen || !tray ? null : id);
        if (!tray) {
          bottom.querySelectorAll('[data-nav]').forEach(function (b) { b.classList.toggle('on', b === btn); });
        }
      });
    });
  }

  function mountStrip(app) {
    var strip = app.querySelector('[data-strip]');
    if (strip) strip.addEventListener('click', function () { strip.classList.toggle('open'); });
  }

  /* ---------- landscape stage (experiment) ----------
     A phone on its side has ~390px of height, so the scrolling Home became a
     letterbox you thumb through to reach anything. On a landscape phone Home is
     instead one screen of artwork with every destination floating over it, in
     the manner of a gacha lobby: nothing scrolls, the art is the point, and the
     panels that used to be sections (Objectives, Hall of Siege, Continue
     Playing) open on demand over the art. A portrait phone gets the same
     stage stood on end (the "tall stage"), hung only with art painted tall:
     a 16:9 scene cropped to a 9:19 phone keeps a sliver of its subject, so
     wide-only pieces sit out of the portrait rotation rather than be cut.

     The player chooses which gallery pieces rotate behind it, up to
     STAGE_MAX. Like the binder look this is a device preference (localStorage):
     profileSettings is a fixed server contract and a wallpaper needs no round
     trip. Earned-only pieces are offered but stay locked until earned. */
  var STAGE_KEY = 'sgStageRotation';
  var STAGE_MAX = 10;
  var STAGE_DWELL_MS = 9000;
  // Matches the .sg-stage-panel.is-closing animation in home-redesign.css.
  var STAGE_SHEET_CLOSE_MS = 200;
  var STAGE_TALL_QUERY = '(orientation: portrait) and (max-width: 1023px)';
  // The tall stage's first rotation: the hub's own tall scenes, then the
  // loading library's, up to this many, one per Siegeling where it can.
  var STAGE_TALL_DEFAULT = 6;

  function stageTall() {
    return Boolean(window.matchMedia && window.matchMedia(STAGE_TALL_QUERY).matches);
  }

  function stagePieces(tall) {
    // Each orientation hangs the art painted for it. A wide stage still takes a
    // tall piece when it has nothing else; a tall stage never takes a wide one.
    var src = (window.SiegelingsLoadingArt && window.SiegelingsLoadingArt.pool()) || [];
    var out = src.map(function (p) {
      var art = tall ? p.portrait || '' : p.landscape || p.portrait || '';
      return { id: p.id, title: p.title || title(p.id), place: p.place || '', thumb: art, art: art };
    }).filter(function (p) { return p.art; });
    // The hub's own plates are not all in the loading pool (the Sunscar Ruins
    // scene is hub-only), and the default rotation names them.
    galleryScenes().forEach(function (g) {
      if (out.some(function (p) { return p.id === g.img; })) return;
      if (tall && !g.portrait) return;
      var art = tall ? heroPlate(g) : plate(g);
      out.push({ id: g.img, title: g.title, place: g.place, thumb: tall ? art : plate(g, true), art: art });
    });
    return out;
  }

  // A choice made for the wide wall says nothing about the tall one (most of
  // its pieces cannot hang there), so each orientation keeps its own list.
  function stageKey(tall) { return tall ? STAGE_KEY + 'Tall' : STAGE_KEY; }

  function stageDefault(pieces, tall) {
    if (!tall) return HERO_SCENES;
    var ids = [], cards = {};
    galleryScenes().forEach(function (g) { if (g.portrait) ids.push(g.img); });
    pieces.forEach(function (p) {
      var card = String(p.id).split('-')[0];
      if (ids.indexOf(p.id) >= 0 || cards[card] || galleryLock(p.id)) return;
      cards[card] = true;
      ids.push(p.id);
    });
    return ids.slice(0, STAGE_TALL_DEFAULT);
  }

  function readStageRotation(tall) {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(stageKey(tall)) || 'null'); } catch (e) { saved = null; }
    var pieces = stagePieces(tall);
    var known = {};
    pieces.forEach(function (p) { known[p.id] = p; });
    var fallback = stageDefault(pieces, tall);
    var ids = (Array.isArray(saved) ? saved : fallback).filter(function (id) {
      return known[id] && !galleryLock(id);
    }).slice(0, STAGE_MAX);
    // An emptied or fully-locked selection still needs something on the wall.
    if (!ids.length) ids = fallback.filter(function (id) { return known[id]; });
    if (!ids.length && pieces.length) ids = [pieces[0].id];
    return ids.map(function (id) { return known[id]; });
  }

  function writeStageRotation(ids, tall) {
    try { localStorage.setItem(stageKey(tall), JSON.stringify(ids.slice(0, STAGE_MAX))); } catch (e) { /* private mode */ }
  }

  // The card a piece portrays, for the caption. Gallery scenes name it; API
  // pieces usually open with the card id ("bearby-longfuse" -> bearby).
  function stageCard(piece) {
    var tagged = artCards(piece)[0];
    if (tagged) return tagged;
    for (var i = 0; i < GALLERY.length; i++) {
      if (GALLERY[i].img === piece.id) return byId(GALLERY[i].card);
    }
    return byId(String(piece.id).split('-')[0]);
  }

  var STAGE_ICON = {
    quests: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg>',
    hall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    expedition: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20l6-11 4 6 3-4 5 9z"/><circle cx="17" cy="5" r="2"/></svg>',
    featured: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg>',
    gallery: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    lobbies: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2 .8-3.8 2-5 2.2 0 4 2.2 4 5"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M19 5l-10 7 10 7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M5 5l10 7-10 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
    frames: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  // The soundtrack's own pill, like the lobby jukebox it is modelled on.
  function stageMusicMarkup() {
    return '<div class="sg-stage-music">' +
      '<button type="button" class="sg-stage-music-toggle" data-music-toggle aria-label="Mute music">' +
        '<span class="sg-stage-eq" aria-hidden="true"><i></i><i></i><i></i></span></button>' +
      '<span class="sg-stage-music-title" data-music-title></span>' +
      '<button type="button" data-music-prev aria-label="Previous song">' + STAGE_ICON.prev + '</button>' +
      '<button type="button" data-music-next aria-label="Next song">' + STAGE_ICON.next + '</button>' +
    '</div>';
  }

  // The wallpaper picker and the art's own transport share one header pill.
  function stageArtBarMarkup() {
    return '<div class="sg-stage-player">' +
      '<button type="button" class="sg-stage-pick-btn" data-stage-pick aria-haspopup="dialog">' +
        STAGE_ICON.frames + '<span>Rotation</span></button>' +
      '<button type="button" data-stage-prev aria-label="Previous art">' + STAGE_ICON.prev + '</button>' +
      '<button type="button" data-stage-pause aria-label="Pause rotation">' + STAGE_ICON.pause + '</button>' +
      '<button type="button" data-stage-next aria-label="Next art">' + STAGE_ICON.next + '</button>' +
      '<span class="sg-stage-dots" data-stage-dots></span>' +
      '<button type="button" data-stage-hide aria-label="Hide menus to view the art">' + STAGE_ICON.eye + '</button>' +
    '</div>';
  }

  function stageMarkup(opts) {
    var runs = (opts && opts.siegeRuns) || [];
    var quests = liveQuests(opts);
    var openQuests = quests ? quests.filter(function (q) { return !q[2]; }).length : 0;
    var run = runs[0];
    function tile(key, label, attrs, badge) {
      return '<button type="button" class="sg-stage-tile" ' + attrs + '>' +
        '<span class="sg-stage-tile-ico">' + STAGE_ICON[key] + '</span>' +
        '<span class="sg-stage-tile-label">' + esc(label) + '</span>' +
        (badge ? '<i class="sg-stage-badge">' + esc(badge) + '</i>' : '') + '</button>';
    }
    function link(key, label, href, attrs) {
      return '<a class="sg-stage-tile" href="' + href + '"' + (attrs || '') + '>' +
        '<span class="sg-stage-tile-ico">' + STAGE_ICON[key] + '</span>' +
        '<span class="sg-stage-tile-label">' + esc(label) + '</span></a>';
    }
    return '<section class="sg-stage" data-stage aria-label="Home">' +
      '<div class="sg-stage-art" data-stage-art>' +
        '<div class="sg-stage-plate is-on" data-stage-plate></div>' +
        '<div class="sg-stage-plate" data-stage-plate></div>' +
      '</div>' +
      '<div class="sg-stage-veil"></div>' +
      // Tapping bare art while the chrome is hidden brings it back.
      '<button type="button" class="sg-stage-reveal" data-stage-reveal aria-label="Show menus"></button>' +
      '<div class="sg-stage-ui">' +
        '<div class="sg-stage-lead">' +
        // The main destinations wear the shop's portrait plates down the left;
        // the panel shortcuts sit as launcher icons atop the mode column.
        '<nav class="sg-stage-cards" aria-label="Main destinations">' +
          [['play', 'Play'], ['collection', 'Collection'], ['shop', 'Shop'], ['social', 'Social'], ['settings', 'Settings']].map(function (item) {
            return '<a class="sg-gtab" href="' + pathForScreen(item[0]) + '" data-screen="' + item[0] + '">' +
              '<span class="sg-gtab-art">' + hubPanelImage('stage-' + item[0]) + '</span>' +
              '<span class="sg-gtab-label">' + item[1] + '</span><i class="sg-gtab-gem" aria-hidden="true"></i></a>';
          }).join('') +
        '</nav>' +
        '</div>' +
        '<div class="sg-stage-right">' +
          '<nav class="sg-stage-left" aria-label="Home shortcuts">' +
          tile('quests', 'Objectives', 'data-stage-panel="Daily Objectives"', openQuests ? String(openQuests) : '') +
          tile('hall', 'Hall', 'data-stage-panel="Hall of Siege"') +
          tile('expedition', 'Expedition', 'data-stage-panel="Continue Playing"', runs.length ? '!' : '') +
          tile('featured', 'Featured', 'data-stage-panel="Featured Siegelings"') +
          link('gallery', 'Gallery', pathForScreen('art'), ' data-screen="art"') +
          link('lobbies', 'Lobbies', HREF.lobbies, lobbiesAttrs().replace(' href="' + HREF.lobbies + '"', '')) +
        '</nav>' +
          '<a class="sg-stage-mode" href="' + HREF.siege + '">' +
            '<span class="sg-stage-mode-kicker">' + (run ? 'Expedition saved' : 'Roguelike') + '</span>' +
            '<strong>' + (run ? 'Resume Siege' : 'Siege') + '</strong></a>' +
          '<a class="sg-stage-mode is-keep" href="/dominion">' +
            '<span class="sg-stage-mode-kicker">Knight &amp; Keep</span><strong>Dominion</strong></a>' +
          '<a class="sg-stage-play" href="' + HREF.battle + '">Arena</a>' +
        '</div>' +
        '<div class="sg-stage-deck">' +
          // The title of the piece on the wall holds the far bottom-left corner.
          '<div class="sg-stage-caption" data-stage-caption></div>' +
        '</div>' +
      '</div>' +
      '<div class="sg-stage-panel" data-stage-sheet hidden role="dialog" aria-modal="false" aria-labelledby="sgStageSheetTitle">' +
        // Tapping the dimmed art around the glass closes it.
        '<button type="button" class="sg-stage-scrim" data-stage-close tabindex="-1" aria-label="Close"></button>' +
        '<div class="sg-stage-panel-card">' +
          '<header>' +
            '<span class="sg-stage-panel-ico" data-stage-sheet-icon aria-hidden="true"></span>' +
            '<div class="sg-stage-panel-titles"><h3 id="sgStageSheetTitle" data-stage-sheet-title></h3>' +
              '<p data-stage-sheet-sub hidden></p></div>' +
            '<span class="sg-stage-panel-slot" data-stage-sheet-slot></span>' +
            '<button type="button" class="sg-stage-close" data-stage-close aria-label="Close">×</button></header>' +
          '<div class="sg-stage-panel-body" data-stage-sheet-body></div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function stagePickerMarkup(selected, tall) {
    var pieces = stagePieces(tall);
    return '<p class="sg-stage-pick-note">Choose up to ' + STAGE_MAX + ' pieces to rotate behind Home' +
        (tall ? ' in portrait. Only art painted tall hangs here.' : '.') + ' ' +
        '<b data-stage-count>' + selected.length + '/' + STAGE_MAX + '</b></p>' +
      '<div class="sg-stage-pick-grid">' + pieces.map(function (p) {
        var lock = galleryLock(p.id);
        var order = selected.indexOf(p.id);
        return '<button type="button" class="sg-stage-pick' + (order >= 0 ? ' on' : '') + (lock ? ' is-locked' : '') +
          '" data-stage-piece="' + esc(p.id) + '"' + (lock ? ' disabled' : '') +
          ' aria-pressed="' + (order >= 0) + '">' +
          '<img ' + artAttrs(p.thumb, 320) + ' alt="" loading="lazy">' +
          '<span class="sg-stage-pick-order">' + (order >= 0 ? order + 1 : '') + '</span>' +
          '<span class="sg-stage-pick-foot">' + esc(p.title) +
            (lock ? '<em>' + LOCK_ICON + esc(lock.achievement || 'Achievement') + '</em>' : '') + '</span>' +
        '</button>';
      }).join('') + '</div>';
  }

  function mountStage(app, opts) {
    var stage = app.querySelector('[data-stage]');
    if (!stage) return;
    // Home is the stage at every size now; only the orientation of the wall
    // changes, and with it which art can hang there.
    var mq = window.matchMedia ? window.matchMedia(STAGE_TALL_QUERY) : null;
    var plates = [].slice.call(stage.querySelectorAll('[data-stage-plate]'));
    var caption = stage.querySelector('[data-stage-caption]');
    // The art controls render in the header, so they are found from the app.
    var stageBar = app.querySelector('.sg-top .sg-stage-player');
    var dots = app.querySelector('[data-stage-dots]');
    var pauseBtn = app.querySelector('[data-stage-pause]');
    var sheet = stage.querySelector('[data-stage-sheet]');
    var sheetTitle = stage.querySelector('[data-stage-sheet-title]');
    var sheetBody = stage.querySelector('[data-stage-sheet-body]');
    var sheetSub = stage.querySelector('[data-stage-sheet-sub]');
    var sheetIcon = stage.querySelector('[data-stage-sheet-icon]');
    var sheetSlot = stage.querySelector('[data-stage-sheet-slot]');
    var tall = stageTall();
    var rotation = readStageRotation(tall);
    var idx = 0, front = 0, timer = null, paused = false;
    var borrowed = null;   // { node, marker } while a Home section is shown in the panel

    function paint(i, instant) {
      if (!rotation.length) return;
      idx = (i + rotation.length) % rotation.length;
      var piece = rotation[idx];
      var next = instant ? plates[front] : plates[1 - front];
      next.style.backgroundImage = "url('" + piece.art + "')";
      if (!instant) {
        plates[front].classList.remove('is-on');
        front = 1 - front;
        // Restart the drift so each piece eases in from its own start.
        next.classList.remove('is-on'); void next.offsetWidth;
      }
      next.classList.add('is-on');
      var card = stageCard(piece);
      stage.style.setProperty('--el', color(card && card.element));
      // The header bar is outside the stage, so it takes the accent itself.
      if (stageBar) stageBar.style.setProperty('--el', color(card && card.element));
      caption.innerHTML = '<strong>' + esc(piece.title) + '</strong>' +
        '<span>' + esc([card && card.name, piece.place].filter(Boolean).join(' · ')) + '</span>';
      var d = '';
      for (var k = 0; k < rotation.length; k++) d += '<i class="' + (k === idx ? 'on' : '') + '"></i>';
      dots.innerHTML = d;
      // Warm the next plate so the crossfade never lands on an unpainted box.
      if (rotation.length > 1) { var pre = new Image(); pre.src = rotation[(idx + 1) % rotation.length].art; }
    }

    function schedule() {
      clearInterval(timer); timer = null;
      if (paused || rotation.length < 2) return;
      timer = setInterval(function () {
        // Home re-renders on every screen change; a detached stage stops itself.
        if (!stage.isConnected) { clearInterval(timer); return; }
        paint(idx + 1);
      }, STAGE_DWELL_MS);
    }

    function setPaused(on) {
      paused = on;
      pauseBtn.innerHTML = on ? STAGE_ICON.play : STAGE_ICON.pause;
      pauseBtn.setAttribute('aria-label', on ? 'Resume rotation' : 'Pause rotation');
      schedule();
    }

    function returnBorrowed() {
      if (!borrowed) return;
      // Changing board or period redraws the leaderboard by replacing its
      // section, so the node that was lent may no longer be the live one.
      var node = borrowed.node.isConnected ? borrowed.node
        : sheetBody.querySelector('[data-home-section="' + borrowed.name + '"]');
      if (node) borrowed.marker.parentNode.replaceChild(node, borrowed.marker);
      else borrowed.marker.parentNode.removeChild(borrowed.marker);
      borrowed = null;
    }

    // What each lent section says under its title, now that its own head row
    // is folded into the sheet's header.
    function sheetSubtitle(name, node) {
      if (name === 'Featured Siegelings') return 'Today\'s three \u00b7 new at midnight';
      if (name === 'Hall of Siege') return 'Leaderboards';
      if (name === 'Home Rotation') return 'The art behind Home';
      if (name === 'Daily Objectives') {
        var cnt = node && node.querySelector('.sg-strip-head .cnt');
        return cnt ? cnt.textContent : '';
      }
      if (name === 'Continue Playing') {
        var n = node ? node.querySelectorAll('.sg-exp:not(.is-empty)').length : 0;
        return n ? n + ' saved expedition' + (n === 1 ? '' : 's') : 'Nothing saved yet';
      }
      return '';
    }

    var closing = null;
    function finishClose() {
      clearTimeout(closing); closing = null;
      returnBorrowed();
      sheet.hidden = true;
      sheet.classList.remove('is-closing');
      sheetBody.innerHTML = '';
      sheetBody.onclick = null;
      stage.classList.remove('is-sheet-open');
    }

    function closeSheet(instant) {
      if (sheet.hidden) return;
      if (instant || closing) { finishClose(); return; }
      // The glass shrinks back toward the button it came from before it goes.
      sheet.classList.add('is-closing');
      closing = setTimeout(finishClose, STAGE_SHEET_CLOSE_MS);
    }

    // The sheet grows out of the shortcut that opened it, so the transform
    // origin is that button's centre in the card's own coordinates.
    function aimSheet(from) {
      var card = sheet.querySelector('.sg-stage-panel-card');
      var box = card.getBoundingClientRect();
      var r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
      var ox = r && r.width ? r.left + r.width / 2 - box.left : box.width / 2;
      var oy = r && r.height ? r.top + r.height / 2 - box.top : 0;
      card.style.setProperty('--sheet-ox', Math.round(ox) + 'px');
      card.style.setProperty('--sheet-oy', Math.round(oy) + 'px');
    }

    // The section's own action (Binder, the period cycle, Siege) rides in the
    // header beside the close button; the slot reserves its width so a long
    // title ellipsizes instead of running under it.
    function fitSheetHead() {
      var act = sheetBody.querySelector('.sg-section-head');
      sheetSlot.style.width = act && act.offsetWidth ? (act.offsetWidth + 8) + 'px' : '0px';
    }

    function openSheet(name, html, from) {
      if (closing) finishClose();
      returnBorrowed();
      sheetBody.onclick = null;
      sheetTitle.textContent = name;
      sheetBody.innerHTML = '';
      var ico = from && from.querySelector ? from.querySelector('.sg-stage-tile-ico, svg') : null;
      sheetIcon.innerHTML = ico ? (ico.matches('svg') ? ico.outerHTML : ico.innerHTML) : STAGE_ICON.featured;
      if (html != null) {
        sheetBody.innerHTML = html;
      } else {
        // The section already rendered (and wired) in the portrait scroller is
        // lent to the panel rather than rendered twice, so the leaderboard's
        // chips and the objectives strip keep their handlers and their state.
        var node = app.querySelector('.sg-scroll [data-home-section="' + name + '"]');
        if (!node) return;
        var marker = document.createComment('stage');
        node.parentNode.replaceChild(marker, node);
        borrowed = { node: node, marker: marker, name: name };
        sheetBody.appendChild(node);
        var strip = node.matches('[data-strip]') ? node : null;
        if (strip) strip.classList.add('open');
      }
      var sub = sheetSubtitle(name, sheetBody);
      sheetSub.textContent = sub;
      sheetSub.hidden = !sub;
      sheet.hidden = false;
      stage.classList.add('is-sheet-open');
      fitSheetHead();
      aimSheet(from);
      // Restart the entrance even when one sheet replaces another.
      sheet.classList.remove('is-opening'); void sheet.offsetWidth; sheet.classList.add('is-opening');
    }

    function openPicker() {
      var selected = rotation.map(function (p) { return p.id; });
      openSheet('Home Rotation', stagePickerMarkup(selected, tall), app.querySelector('[data-stage-pick]'));
      sheetBody.onclick = function (e) {
        var btn = e.target.closest && e.target.closest('[data-stage-piece]');
        if (!btn || btn.disabled) return;
        var id = btn.getAttribute('data-stage-piece');
        var at = selected.indexOf(id);
        if (at >= 0) {
          if (selected.length === 1) return;   // the wall is never left bare
          selected.splice(at, 1);
        } else {
          if (selected.length >= STAGE_MAX) {
            var count = sheetBody.querySelector('[data-stage-count]');
            count.classList.remove('is-full'); void count.offsetWidth; count.classList.add('is-full');
            return;
          }
          selected.push(id);
        }
        writeStageRotation(selected, tall);
        sheetBody.querySelectorAll('[data-stage-piece]').forEach(function (b) {
          var o = selected.indexOf(b.getAttribute('data-stage-piece'));
          b.classList.toggle('on', o >= 0);
          b.setAttribute('aria-pressed', String(o >= 0));
          b.querySelector('.sg-stage-pick-order').textContent = o >= 0 ? String(o + 1) : '';
        });
        sheetBody.querySelector('[data-stage-count]').textContent = selected.length + '/' + STAGE_MAX;
        var showing = rotation[idx] && rotation[idx].id;
        rotation = readStageRotation(tall);
        var keep = -1;
        rotation.forEach(function (p, i) { if (p.id === showing) keep = i; });
        // Adding a piece shows it at once, so the choice is visibly made.
        paint(at >= 0 ? (keep >= 0 ? keep : 0) : rotation.length - 1, false);
        schedule();
      };
    }

    function onStageClick(e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      var panelBtn = t.closest('[data-stage-panel]');
      if (panelBtn) { openSheet(panelBtn.getAttribute('data-stage-panel'), null, panelBtn); return; }
      if (t.closest('[data-stage-close]')) { closeSheet(); return; }
      if (t.closest('[data-stage-prev]')) { paint(idx - 1); schedule(); return; }
      if (t.closest('[data-stage-next]')) { paint(idx + 1); schedule(); return; }
      if (t.closest('[data-stage-pause]')) { setPaused(!paused); return; }
      if (t.closest('[data-stage-pick]')) { openPicker(); return; }
      if (t.closest('[data-stage-hide]')) { closeSheet(true); app.classList.add('is-stage-bare'); return; }
      if (t.closest('[data-stage-reveal]')) { app.classList.remove('is-stage-bare'); return; }
    }
    stage.addEventListener('click', onStageClick);
    // The header is outside the stage, and it carries the art controls.
    if (stageBar) stageBar.addEventListener('click', onStageClick);

    // Swiping the art steps through the rotation.
    var sx = null, sy = 0;
    stage.addEventListener('touchstart', function (e) {
      if (e.target.closest('.sg-stage-panel, .sg-stage-ui a, .sg-stage-ui button')) { sx = null; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (sx == null) return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { paint(idx + (dx < 0 ? 1 : -1)); schedule(); }
    }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && stage.isConnected && !sheet.hidden) closeSheet();
    });

    if (mq) {
      // Turning the phone keeps the picture on the wall: the same piece in the
      // other orientation's file (its portrait version on a tall stage when
      // the dashboard has one, otherwise its landscape file cropped to fill),
      // and the rotation carries on from it through that orientation's list.
      var onChange = function () {
        if (!stage.isConnected) return;
        closeSheet(true);
        var showing = rotation[idx] && rotation[idx].id;
        tall = mq.matches;
        rotation = readStageRotation(tall);
        var at = -1;
        rotation.forEach(function (p, i) { if (at < 0 && p.id === showing) at = i; });
        if (at < 0 && showing) {
          var find = function (list) { return list.filter(function (p) { return p.id === showing; })[0]; };
          var same = find(stagePieces(tall)) || find(stagePieces(false));
          if (same) { rotation = [same].concat(rotation); at = 0; }
        }
        paint(Math.max(0, at), true);
        schedule();
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }

    paint(0, true);
    schedule();
  }

  /* ---------- screens ---------- */

  function homeScreen(opts) {
    opts = opts || {};
    // The stage precedes the scroller so the landscape rule can retire the
    // scroller with a sibling selector rather than :has().
    // The stage's soundtrack pill rides in the header beside the music button,
    // its wallpaper picker and art controls beside the logo, and the logo leads
    // to the landing.
    return topMarkup(opts, {
        logoHref: '/landing',
        // The slot spans logo to coin chip; the bar sizes itself to it.
        afterLogo: '<div class="sg-stage-player-slot">' + stageArtBarMarkup() + '</div>',
        beforeMusic: stageMusicMarkup() }) + stageMarkup(opts) +
      '<div class="sg-scroll">' + heroMarkup() + featuredMarkup() + leaderboardSection(opts) + gallerySection() + questsMarkup(opts) + expeditionsSection(opts) +
      '<div style="height:96px"></div></div>' +
      sheetHost() +
      bottomMarkup('home', opts);
  }

  /* ---------- binder look ----------
     The binder was a grid of cards on the app's flat purple: nothing said
     "binder", and two players' collections looked identical. The dressing is
     three stacked layers - a cover photo, a page surface, and a sleeve tint on
     each pocket - and all three are the player's to choose. The choice is a
     device preference (localStorage), not part of the server profile, because
     profileSettings is a fixed contract the backend validates; a cosmetic that
     needs no server round-trip should not wait on one.
     Cover art reuses what the app already ships - the Siege land plates and the
     loading-art gallery - so no new image bytes are added for this. */
  var BINDER_LOOK_KEY = 'sgBinderLook';
  var BINDER_COVERS = [
    { id: 'midnight', label: 'Midnight', art: '' },
    { id: 'fire', label: 'Emberwaste', art: '/img/lands/fire.webp' },
    { id: 'ice', label: 'Rimeholt', art: '/img/lands/ice.webp' },
    { id: 'water', label: 'Sunken Span', art: '/img/lands/water.webp' },
    { id: 'earth', label: 'Rootreach', art: '/img/lands/earth.webp' },
    { id: 'wind', label: 'Galecrest', art: '/img/lands/wind.webp' },
    { id: 'electric', label: 'Stormspire', art: '/img/lands/electric.webp' },
    { id: 'metal', label: 'Forgeworks', art: '/img/lands/metal.webp' },
    { id: 'poison', label: 'Mirewood', art: '/img/lands/poison.webp' },
    { id: 'psychic', label: 'Dreamfold', art: '/img/lands/psychic.webp' },
    { id: 'light', label: 'Dawnhall', art: '/img/lands/light.webp' },
    { id: 'shadow', label: 'Duskmarch', art: '/img/lands/shadow.webp' },
    { id: 'undead', label: 'Gravewatch', art: '/img/lands/undead.webp' },
    { id: 'aurora', label: 'Aurora', art: '/img/lands/aurora.webp' },
    { id: 'badlands', label: 'Badlands', art: '/img/lands/badlands.webp' },
    { id: 'obsidian', label: 'Obsidian', art: '/img/lands/obsidian.webp' },
    { id: 'relic', label: 'Relic Vault', art: '/img/lands/relic.webp' }
  ];
  var BINDER_PAGES = [
    ['leather', 'Leather'], ['parchment', 'Parchment'], ['slate', 'Slate'], ['velvet', 'Velvet']
  ];
  var BINDER_SLEEVES = [
    ['gold', 'Gold', '#e6cd8c'], ['steel', 'Steel', '#8fa2bd'], ['ember', 'Ember', '#f0713f'],
    ['violet', 'Violet', '#b45cff'], ['clear', 'Clear', 'transparent']
  ];
  var BINDER_LOOK_DEFAULT = { cover: 'midnight', page: 'leather', sleeve: 'gold' };

  function readBinderLook() {
    var look = { cover: BINDER_LOOK_DEFAULT.cover, page: BINDER_LOOK_DEFAULT.page,
                 sleeve: BINDER_LOOK_DEFAULT.sleeve };
    var raw;
    try { raw = JSON.parse(localStorage.getItem(BINDER_LOOK_KEY) || '{}') || {}; }
    catch (e) { raw = {}; }
    if (raw.cover) look.cover = String(raw.cover);
    if (raw.page) look.page = String(raw.page);
    if (raw.sleeve) look.sleeve = String(raw.sleeve);
    return look;
  }

  function writeBinderLook(look) {
    try { localStorage.setItem(BINDER_LOOK_KEY, JSON.stringify(look)); }
    catch (e) { /* private mode: the look still applies for this session */ }
  }

  /* ---------- gallery rewards ----------
     Siegeling scenes in the art gallery are earned through achievements
     (catalog/gallery-rewards.json on the server); the element and place
     backdrops, and any art without an entry, are free. The server enforces
     profile backgrounds; binder covers live on this device, so they are
     enforced here. */
  var GALLERY_REWARDS = null;   // { pieceId: { achievement, requirement } } once /api/art/rewards answers
  var GALLERY_UNLOCKED = null;  // pieces this player earned; [] for a guest; null while unknown

  // The reward still to earn for a piece, or null when it is free or earned.
  // While the player's unlocks are unknown, rewards read as locked: picking one
  // waits until it can be checked.
  function galleryLock(pieceId) {
    var id = String(pieceId || '').toLowerCase();
    var reward = GALLERY_REWARDS && GALLERY_REWARDS[id];
    if (!reward) return null;
    if (GALLERY_UNLOCKED && GALLERY_UNLOCKED.indexOf(id) >= 0) return null;
    return reward;
  }

  // Only a definite answer may take something away from the player.
  function galleryLockKnown() {
    return Boolean(GALLERY_REWARDS) && Array.isArray(GALLERY_UNLOCKED);
  }

  var LOCK_ICON = '<i class="sg-lock" aria-hidden="true"></i>';

  /* Newly earned art goes into the notification feed. The first look on a device
     only records what is already earned, so a returning player is not handed a
     backlog of every piece at once. */
  function noteNewGalleryUnlocks(model) {
    if (!model.signedIn || !model.accountId || !GALLERY_REWARDS || !Array.isArray(GALLERY_UNLOCKED)) return;
    var key = 'sgGalleryUnlocked:' + model.accountId;
    var seen = null;
    try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { seen = null; }
    try { localStorage.setItem(key, JSON.stringify(GALLERY_UNLOCKED)); } catch (e) { /* private mode */ }
    if (!Array.isArray(seen)) return;
    var fresh = GALLERY_UNLOCKED.filter(function (id) { return seen.indexOf(id) < 0; });
    if (!fresh.length) return;
    var notifOpts = { live: model };
    var rows = loadNotifs(notifOpts);
    fresh.forEach(function (id) {
      var piece = profileArtPiece(id);
      var reward = GALLERY_REWARDS[id];
      rows.unshift({
        id: Date.now() + '-' + id, type: 'unlock', time: Date.now(), read: false,
        title: 'Gallery art unlocked: ' + (piece ? piece.title : title(id)),
        body: (reward ? 'Earned with \u201c' + reward.achievement + '\u201d. ' : '') +
          'Hang it as your binder cover or profile background.'
      });
    });
    saveNotifs(notifOpts, rows);
  }

  // A cover is either a shipped land plate or 'gallery:<pieceId>' - the player
  // can hang any piece of the art gallery behind their collection.
  function binderCoverArt(coverId) {
    var id = String(coverId || '');
    if (id.indexOf('gallery:') === 0) {
      var piece = profileArtPiece(id.slice(8));
      return piece ? (piece.thumb || piece.full || '') : '';
    }
    for (var i = 0; i < BINDER_COVERS.length; i++) {
      if (BINDER_COVERS[i].id === id) return BINDER_COVERS[i].art;
    }
    return '';
  }

  function applyBinderLook(app, look) {
    if (!app) return;
    app.setAttribute('data-binder-page', look.page);
    app.setAttribute('data-binder-sleeve', look.sleeve);
    var cover = app.querySelector('[data-binder-cover]');
    if (!cover) return;
    var art = binderCoverArt(look.cover);
    cover.style.backgroundImage = art ? 'url("' + art + '")' : '';
    cover.classList.toggle('is-art', Boolean(art));
  }

  function binderSkinMarkup() {
    return '<div class="sg-binder-skin" aria-hidden="true">' +
      '<div class="sg-binder-cover" data-binder-cover></div>' +
      '<div class="sg-binder-veil"></div>' +
    '</div>';
  }

  /* A swatch is ~120x62 CSS px on a phone, so the 320 cut is close to 3x for
     a scenic backdrop at a fraction of the original's weight. It is an <img>,
     not a CSS background, so Storage-hosted plates get the same fallback chain
     as card art (ready-made cut, art mirror, original): a background image
     that fails just leaves the swatch blank. */
  // The tile shimmers until its art loads; once every fallback has failed it
  // settles to the plain tile instead (sgWebpFallback clears onerror then).
  function swatchArtAttrs(url) {
    var attrs = artAttrs(url, 320);
    var failed = 'this.classList.add(\'is-failed\')';
    return attrs.indexOf('onerror="sgWebpFallback(this)"') >= 0
      ? attrs.replace('onerror="sgWebpFallback(this)"', 'onerror="sgWebpFallback(this);if(!this.onerror)' + failed + '"')
      : attrs + ' onerror="' + failed + '"';
  }

  function binderSwatch(attr, value, label, art, on) {
    return '<button class="sg-look-swatch' + (on ? ' on' : '') + '" type="button" ' +
      attr + '="' + esc(value) + '" aria-pressed="' + on + '">' +
      (art ? '<img class="sg-look-swatch-art" ' + swatchArtAttrs(art) + ' alt="" loading="lazy" decoding="async" ' +
        'onload="this.classList.add(\'is-loaded\')">' : '') +
      '<span>' + esc(label) + '</span></button>';
  }

  // The Cover tab holds only what the player owns: the shipped plates, the free
  // backdrops and every scene they have earned - earned art simply appears here.
  function binderSwatchRow(look) {
    var covers = BINDER_COVERS.map(function (c) {
      return binderSwatch('data-look-cover', c.id, c.label, c.art, c.id === look.cover);
    });
    // Gallery pieces load from /api/art/loading, so this list is empty offline -
    // the shipped covers above are always there to fall back on.
    var pieces = galleryPieces();
    pieces.forEach(function (p) {
      if (galleryLock(p.id)) return;
      covers.push(binderSwatch('data-look-cover', 'gallery:' + p.id, p.title, p.thumb, look.cover === 'gallery:' + p.id));
    });
    return galleryEarnedLine(pieces, 'sg-look-earned') + covers.join('');
  }

  /* Scenes still to earn, each with what earns it. Read-only rows rather than
     swatches: none of them can be hung on the binder yet. Shared by the binder
     sheet's Unowned tab and the profile background picker. */
  function unownedArtList(pieces) {
    var locked = pieces.filter(function (p) { return galleryLock(p.id); });
    if (!GALLERY_REWARDS) return '<p class="sg-unowned-note">Achievement rewards are still loading.</p>';
    if (!locked.length) return '<p class="sg-unowned-note">Every Siegeling scene is yours.</p>';
    return '<p class="sg-unowned-note">' + LOCK_ICON + esc(locked.length) + ' scene' + (locked.length === 1 ? '' : 's') +
        ' to earn. Each unlocks with an achievement.</p>' +
      '<ul class="sg-unowned-list">' + locked.map(function (p) {
        var reward = galleryLock(p.id);
        return '<li class="sg-unowned-row">' +
          '<span class="sg-unowned-art"><img ' + swatchArtAttrs(p.thumb) + ' alt="" loading="lazy" decoding="async"></span>' +
          '<span class="sg-unowned-text"><strong>' + esc(p.title) + '</strong>' +
            '<em>\u201c' + esc(reward.achievement) + '\u201d \u2014 ' + esc(reward.requirement) + '</em></span>' +
        '</li>';
      }).join('') + '</ul>';
  }

  // "12 of 103 reward pieces earned" - only once both halves are known.
  function galleryEarnedLine(pieces, className) {
    if (!galleryLockKnown()) return '';
    var rewards = 0, earned = 0;
    pieces.forEach(function (p) {
      if (!GALLERY_REWARDS[String(p.id).toLowerCase()]) return;
      rewards++;
      if (!galleryLock(p.id)) earned++;
    });
    if (!rewards) return '';
    return '<p class="' + className + '">' + LOCK_ICON + esc(earned + ' of ' + rewards) +
      ' Siegeling scenes earned through achievements</p>';
  }

  var BINDER_LOOK_TABS = [['cover', 'Cover'], ['unowned', 'Unowned'], ['page', 'Page'], ['sleeve', 'Sleeves']];

  function binderLookMarkup(look, tab) {
    return '<div class="sg-look-grab"></div>' +
      '<div class="sg-look-head"><h3>Dress the binder</h3>' +
        '<button class="sg-look-x" type="button" data-look-close aria-label="Close">×</button></div>' +
      '<div class="sg-look-tabs" role="tablist" aria-label="Binder part">' + BINDER_LOOK_TABS.map(function (t) {
        var on = t[0] === tab;
        return '<button class="sg-look-tab' + (on ? ' on' : '') + '" type="button" role="tab" id="sgLookTab-' + t[0] + '" ' +
          'data-look-tab="' + t[0] + '" aria-controls="sgLookPanel-' + t[0] + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' +
          esc(t[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="sg-look-body">' +
        '<div class="sg-look-panel sg-look-covers" role="tabpanel" id="sgLookPanel-cover" aria-labelledby="sgLookTab-cover"' +
          (tab === 'cover' ? '' : ' hidden') + '>' + binderSwatchRow(look) + '</div>' +
        '<div class="sg-look-panel" role="tabpanel" id="sgLookPanel-unowned" aria-labelledby="sgLookTab-unowned"' +
          (tab === 'unowned' ? '' : ' hidden') + '>' + unownedArtList(galleryPieces()) + '</div>' +
        '<div class="sg-look-panel sg-look-grid" role="tabpanel" id="sgLookPanel-page" aria-labelledby="sgLookTab-page"' +
          (tab === 'page' ? '' : ' hidden') + '>' + BINDER_PAGES.map(function (p) {
          var on = p[0] === look.page;
          return '<button class="sg-look-chip' + (on ? ' on' : '') + '" type="button" ' +
            'data-look-page="' + esc(p[0]) + '" aria-pressed="' + on + '"><i class="sg-look-page-dot page-' + esc(p[0]) + '"></i>' +
            esc(p[1]) + '</button>';
        }).join('') + '</div>' +
        '<div class="sg-look-panel sg-look-grid" role="tabpanel" id="sgLookPanel-sleeve" aria-labelledby="sgLookTab-sleeve"' +
          (tab === 'sleeve' ? '' : ' hidden') + '>' + BINDER_SLEEVES.map(function (sl) {
          var on = sl[0] === look.sleeve;
          return '<button class="sg-look-chip' + (on ? ' on' : '') + '" type="button" ' +
            'data-look-sleeve="' + esc(sl[0]) + '" aria-pressed="' + on + '"><i class="sg-look-dot" style="--sw:' + esc(sl[2]) +
            '"></i>' + esc(sl[1]) + '</button>';
        }).join('') + '</div>' +
      '</div>';
  }

  function binderLookHost(look) {
    return '<div class="sg-look" data-look aria-hidden="true">' +
      '<button class="sg-look-scrim" type="button" data-look-close aria-label="Close binder styling"></button>' +
      // Filled by open(): every swatch is a full gallery backdrop, and the sheet
      // stays closed for most visits, so rendering it up front downloaded ~25
      // backdrops (~9 MB) alongside the binder's card art.
      '<div class="sg-look-card" role="dialog" aria-modal="true" aria-label="Dress the binder" data-look-card></div>' +
    '</div>';
  }

  /* A swatch is a preview, so the binder behind the sheet changes while the
     sheet stays open. A pick only moves the highlight - the sheet is never
     re-rendered, because rebuilding it threw the player back to the top of a
     long cover list on every tap. */
  function mountBinderLook(app) {
    var host = app.querySelector('[data-look]');
    var toggle = app.querySelector('[data-look-toggle]');
    if (!host || !toggle) return;
    var card = host.querySelector('[data-look-card]');
    var look = readBinderLook();
    var tab = 'cover';
    // A cover that is now an unearned reward goes back to the default.
    var coverId = String(look.cover || '');
    if (coverId.indexOf('gallery:') === 0 && galleryLockKnown() && galleryLock(coverId.slice(8))) {
      look.cover = BINDER_LOOK_DEFAULT.cover;
      writeBinderLook(look);
    }
    applyBinderLook(app, look);

    function open() {
      card.innerHTML = binderLookMarkup(look, tab);
      host.classList.add('open');
      host.setAttribute('aria-hidden', 'false');
      toggle.classList.add('on');
      revealSelection();
    }
    // Opening on a long cover list lands with the current cover in view.
    function revealSelection() {
      var body = card.querySelector('.sg-look-body');
      var sel = card.querySelector('.sg-look-panel:not([hidden]) .on');
      if (!body || !sel) return;
      body.scrollTop = Math.max(0, sel.offsetTop - body.offsetTop - (body.clientHeight - sel.offsetHeight) / 2);
    }
    function showTab(next, focus) {
      tab = next;
      card.querySelectorAll('[data-look-tab]').forEach(function (b) {
        var on = b.getAttribute('data-look-tab') === next;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      card.querySelectorAll('.sg-look-panel').forEach(function (panel) {
        panel.hidden = panel.id !== 'sgLookPanel-' + next;
      });
      var body = card.querySelector('.sg-look-body');
      if (body) body.scrollTop = 0;
      revealSelection();
    }
    function close() {
      host.classList.remove('open');
      host.setAttribute('aria-hidden', 'true');
      toggle.classList.remove('on');
      toggle.focus({ preventScroll: true });
    }
    function pick(key, value, button) {
      look[key] = value;
      writeBinderLook(look);
      applyBinderLook(app, look);
      var attr = 'data-look-' + key;
      card.querySelectorAll('[' + attr + ']').forEach(function (b) {
        var on = b === button;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }

    toggle.addEventListener('click', function () {
      if (host.classList.contains('open')) close(); else open();
    });
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-look-close]')) { close(); return; }
      var tabButton = e.target.closest('[data-look-tab]');
      if (tabButton) { showTab(tabButton.getAttribute('data-look-tab')); return; }
      var cover = e.target.closest('[data-look-cover]');
      if (cover) { pick('cover', cover.getAttribute('data-look-cover'), cover); return; }
      var page = e.target.closest('[data-look-page]');
      if (page) { pick('page', page.getAttribute('data-look-page'), page); return; }
      var sleeve = e.target.closest('[data-look-sleeve]');
      if (sleeve) { pick('sleeve', sleeve.getAttribute('data-look-sleeve'), sleeve); }
    });
    // Arrow keys move between tabs, as a tablist should.
    host.addEventListener('keydown', function (e) {
      if (!e.target.closest('[data-look-tab]') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      var ids = BINDER_LOOK_TABS.map(function (t) { return t[0]; });
      var i = ids.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1);
      showTab(ids[(i + ids.length) % ids.length], true);
      e.preventDefault();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && host.classList.contains('open')) close();
    });
  }

  /* ---------- filter flavour ----------
     The three filter rows were identical grey pills: nothing about a row said
     which axis it filtered, and "Siegelings / Strategies / Deceptions" were
     three words with no picture of the thing they select. Each pill now wears
     its own subject - elements keep their canonical hex from style.css (CLAUDE.md
     convention 4), rarities take their gem colour, and the card types get a
     drawn glyph of the card itself. The glyphs are inline SVG rather than image
     files: they inherit the pill's colour, so one drawing works for the resting,
     hovered and selected states without three assets. */
  var TYPE_TINT = {
    ALL: 'var(--acc-lemon, #c8a54f)',
    SIEGLING: 'var(--acc-emerald, #4fd07a)',
    SPELL: 'var(--acc-sky, #54a8f0)',
    TRAP: 'var(--acc-magenta, #f06ec0)',
    SIEGEKNIGHT: 'var(--gold-bright, #e6cd8c)'
  };
  var RARITY_TINT = {
    ALL: 'var(--acc-lemon, #c8a54f)',
    COMMON: '#c9c0f0',
    UNCOMMON: 'var(--acc-emerald, #4fd07a)',
    RARE: 'var(--acc-sky, #54a8f0)',
    EPIC: 'var(--acc-violet, #9b7bf0)',
    LEGENDARY: 'var(--acc-lemon, #ffe9a8)'
  };
  // Drawn at 20x20 on a 24-box so the strokes line up with the element icons
  // sitting beside them in the row above.
  var TYPE_GLYPH = {
    // two cards in a fan: the binder as a whole
    ALL: '<rect x="4" y="5" width="10" height="14" rx="1.6"/>' +
      '<path d="M16.4 6.6l3.4 1.3-3.6 9.6-1.4-.5"/>',
    // a card wearing notches on three edges - the Siegeling's own tell
    SIEGLING: '<rect x="5" y="3.5" width="14" height="17" rx="2"/>' +
      '<circle cx="12" cy="3.5" r="1.9" fill="currentColor" stroke="none"/>' +
      '<circle cx="5" cy="12" r="1.9" fill="currentColor" stroke="none"/>' +
      '<circle cx="19" cy="15.5" r="1.9" fill="currentColor" stroke="none"/>',
    // an unrolled scroll: the Strategy being cast
    SPELL: '<path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10.5v13.5A2.5 2.5 0 0 0 20 20H7"/>' +
      '<path d="M7 20a2.5 2.5 0 0 1-2.5-2.5V6.5"/><path d="M9 8.5h6M9 12h6"/>',
    // a mask, because at 17px a sprung snare reads as a smudge and a Deception
    // is the card that pretends to be something else
    TRAP: '<path d="M3.5 8.2c3-1.5 14-1.5 17 0 0 5.4-2.4 9-5.5 9-1.4 0-2.4-1-3-2-.6 1-1.6 2-3 2-3.1 0-5.5-3.6-5.5-9z"/>' +
      '<circle cx="8" cy="11.4" r="1.5" fill="currentColor" stroke="none"/>' +
      '<circle cx="16" cy="11.4" r="1.5" fill="currentColor" stroke="none"/>',
    // a visored helm: the SiegeKnight who leads the warband
    SIEGEKNIGHT: '<path d="M12 2.6l8 3.2v5.8c0 4.6-3.2 7.8-8 9.8-4.8-2-8-5.2-8-9.8V5.8z"/>' +
      '<path d="M8.5 10h7M12 10v6"/>'
  };
  function typeGlyph(id) {
    var d = TYPE_GLYPH[id] || TYPE_GLYPH.ALL;
    return '<svg class="sg-pill-glyph" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      d + '</svg>';
  }

  // Owned / All / Unowned. Only offered when the payload can tell what is
  // owned (see binderOwnership); Owned is the binder's default view.
  var OWNERSHIP_PILLS = [['OWNED', 'Owned'], ['ALL', 'All'], ['MISSING', 'Unowned']];
  var UNOWNED_GLYPH = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="3 2.4">' +
    '<rect x="5" y="3" width="14" height="18" rx="2.2"/></svg>';

  function binderFilterRowsMarkup(elements, rarities, withOwnership) {
    return '' +
      (withOwnership
        ? '<div class="sg-filter-label">Collection</div>' +
          '<div class="sg-filter-row sg-filter-row-owned">' + OWNERSHIP_PILLS.map(function (o, i) {
            return '<button class="sg-pill sg-pill-owned' + (i === 0 ? ' on' : '') + '" type="button" data-owned="' + o[0] + '" ' +
              'style="--el:' + (o[0] === 'ALL' ? 'var(--acc-lemon)' : o[0] === 'OWNED' ? '#5fd38a' : '#9aa3c7') + '">' +
              (o[0] === 'ALL' ? '<i class="sg-pill-prism" aria-hidden="true"></i>'
                : (o[0] === 'OWNED' ? OWNED_GLYPH : UNOWNED_GLYPH).replace('<svg ', '<svg class="sg-pill-glyph" ')) +
              esc(o[1]) + '</button>';
          }).join('') + '</div>'
        : '') +
      '<div class="sg-filter-label">Element</div>' +
      '<div class="sg-filter-row sg-filter-row-element">' + elements.map(function (e, i) {
        return '<button class="sg-pill sg-pill-element' + (i === 0 ? ' on' : '') + '" type="button" data-el="' + e + '" style="--el:' +
          (e === 'ALL' ? 'var(--acc-lemon)' : color(e)) + '">' +
          (e === 'ALL' ? '<i class="sg-pill-prism" aria-hidden="true"></i>' : '<img src="' + icon(e) + '" alt="">') +
          esc(title(e)) + '</button>';
      }).join('') + '</div>' +
      '<div class="sg-filter-label">Type</div>' +
      '<div class="sg-filter-row sg-filter-row-type">' + [['ALL','All'],['SIEGLING','Siegelings'],['SPELL','Strategies'],['TRAP','Deceptions'],['SIEGEKNIGHT','SiegeKnights']].map(function (t, i) {
        return '<button class="sg-pill sg-pill-type' + (i === 0 ? ' on' : '') + '" type="button" data-type="' + t[0] + '" ' +
          'style="--el:' + TYPE_TINT[t[0]] + '">' + typeGlyph(t[0]) + esc(t[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="sg-filter-label">Rarity</div>' +
      '<div class="sg-filter-row sg-filter-row-rarity">' + rarities.map(function (r, i) {
        return '<button class="sg-pill sg-pill-rarity' + (i === 0 ? ' on' : '') + '" type="button" data-rarity="' + r + '" ' +
          'style="--el:' + (RARITY_TINT[r] || RARITY_TINT.ALL) + '">' +
          (r === 'ALL' ? '<i class="sg-pill-prism" aria-hidden="true"></i>'
                       : '<i class="sg-rar ' + r.toLowerCase() + '"></i>') +
          esc(title(r)) + '</button>';
      }).join('') + '</div>';
  }

  // The one element order every hub surface uses (binder sections and filters,
  // shop summons and packs, profile pickers). Keep in sync with
  // LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER; Neutral is last
  // because it is not part of the gameplay roster.
  var ELEMENT_ORDER = ['FIRE', 'ICE', 'EARTH', 'WIND', 'WATER', 'ELECTRIC', 'METAL',
    'POISON', 'PSYCHIC', 'UNDEAD', 'LIGHT', 'SHADOW', 'NEUTRAL'];
  var BINDER_TYPE_ORDER = { SIEGLING: 0, SPELL: 1, TRAP: 2 };

  function binderElementKey(card) {
    var el = String((card && card.element) || 'NEUTRAL').toUpperCase();
    return ELEMENT_ORDER.indexOf(el) === -1 ? 'NEUTRAL' : el;
  }

  /* Element by element, Fire first. Inside an element every card climbs from
     Common to Legendary, and that element's SiegeKnights follow its Legendaries
     (also by rarity) rather than all knights heading the binder. Ties keep the
     catalog's order, which already runs each evolution line in sequence. */
  function elementRank(el) {
    var i = ELEMENT_ORDER.indexOf(String(el || '').toUpperCase());
    return i === -1 ? ELEMENT_ORDER.length : i;
  }

  function binderSort(cards) {
    return cards.map(function (c, i) { return { c: c, i: i }; }).sort(function (a, b) {
      var ea = elementRank(binderElementKey(a.c));
      var eb = elementRank(binderElementKey(b.c));
      if (ea !== eb) return ea - eb;
      var ka = String(a.c.type || '').toUpperCase() === 'SIEGEKNIGHT' ? 1 : 0;
      var kb = String(b.c.type || '').toUpperCase() === 'SIEGEKNIGHT' ? 1 : 0;
      if (ka !== kb) return ka - kb;
      var ra = rarityRank(a.c) - rarityRank(b.c);
      if (ra) return ra;
      var ta = BINDER_TYPE_ORDER[String(a.c.type || 'SIEGLING').toUpperCase()];
      var tb = BINDER_TYPE_ORDER[String(b.c.type || 'SIEGLING').toUpperCase()];
      if (ta !== tb) return (ta == null ? 3 : ta) - (tb == null ? 3 : tb);
      return a.i - b.i;
    }).map(function (row) { return row.c; });
  }

  // Ownership for the binder's Owned filter. Catalog cards are counted copies in
  // `ownedCards`; SiegeKnights are not cards in that map but trainers in
  // `knights`. Null means this payload cannot say (guest, offline board), so
  // the filter is not offered at all rather than emptying the binder.
  function binderOwnership(live) {
    var cards = live && live.ownedCards;
    if (!cards) return null;
    var knights = {};
    ((live && live.knights) || []).forEach(function (k) {
      var id = k && (k.id || k);
      if (id) knights[String(id).toLowerCase()] = true;
    });
    return function (c) {
      if (!c) return false;
      if (String(c.type || '').toUpperCase() === 'SIEGEKNIGHT') return Boolean(knights[String(c.id).toLowerCase()]);
      return Number(cards[c.id]) > 0;
    };
  }

  var OWNED_GLYPH = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="5" y="3" width="14" height="18" rx="2.2"/><path d="M8.6 12.2l2.4 2.4 4.4-4.8"/></svg>';

  function galleryScreen(opts) {
    opts = opts || {};
    // Keep in sync with LiveElementCatalogService.DEFAULT_GAMEPLAY_ELEMENT_ORDER.
    var elements = ['ALL'].concat(ELEMENT_ORDER);
    var rarities = ['ALL', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
    var total = ALL_CARDS.length;
    // "X of Y cards owned" compared copies held against unique cards, so a player
    // with duplicates was told they owned more cards than exist. Collected counts
    // distinct cards on both sides of the "of".
    var counts = collectionCounts(opts.live);
    var filterRows = binderFilterRowsMarkup(elements, rarities, Boolean(binderOwnership(opts.live)));
    return topMarkup(opts) +
      binderSkinMarkup() +
      '<div class="sg-scroll" data-gal-scroll>' +
        // Title and tools share one row so the binder page starts higher; the
        // tools drop to their own row only while search or the pills are open.
        '<div class="sg-gal-headrow" data-gal-headrow>' +
        '<div class="sg-gal-head"><h2>The Binder</h2><p>' +
          (counts ? esc(counts.held) + ' of ' + esc(counts.total) + ' cards collected'
                  : esc(total) + ' cards — every Siegeling, Strategy, Deception and SiegeKnight') +
        '</p></div>' +
        '<div class="sg-filter-chrome" data-filter-chrome>' +
          '<div class="sg-filter-chrome-inner">' +
            '<div class="sg-gal-tools" data-tools>' +
              '<button class="sg-icon-btn" type="button" data-search-toggle aria-label="Search">⌕</button>' +
              '<label class="sg-search"><input type="text" placeholder="Search the binder…" data-search-input></label>' +
              '<button class="sg-icon-btn sg-filter-toggle" type="button" data-filter-toggle aria-label="Filters">≡' +
                '<span class="sg-filter-toggle-badge" data-filter-toggle-badge hidden>0</span></button>' +
              '<button class="sg-icon-btn" type="button" data-look-toggle aria-label="Dress the binder">\u2756</button>' +
              (binderOwnership(opts.live)
                ? '<button class="sg-icon-btn sg-owned-toggle on" type="button" data-owned-toggle aria-pressed="true" ' +
                  'aria-label="Owned cards only" title="Owned cards only">' + OWNED_GLYPH + '</button>'
                : '') +
              '<span class="sg-count" data-count></span>' +
            '</div>' +
            '<div class="sg-filters" data-filters><div>' + filterRows + '</div></div>' +
          '</div>' +
        '</div>' +
        '</div>' +
        '<div class="sg-binder-page"><div class="sg-gal-grid" data-grid></div></div>' +
        '<div class="sg-gal-more" data-more hidden><button type="button">Show more</button></div>' +
        '<div style="height:96px"></div>' +
      '</div>' +
      '<button class="sg-filter-fab" type="button" data-filter-fab aria-label="Open filters and search" hidden>' +
        '<span class="sg-filter-fab-ico" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none">' +
            '<path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
            '<circle cx="18.5" cy="6" r="2.2" fill="currentColor"/>' +
            '<circle cx="8.5" cy="12" r="2.2" fill="currentColor"/>' +
            '<circle cx="13.5" cy="18" r="2.2" fill="currentColor"/>' +
          '</svg>' +
        '</span>' +
        '<span class="sg-filter-fab-badge" data-filter-fab-badge hidden>0</span>' +
      '</button>' +
      '<div class="sg-filter-glass" data-filter-glass aria-hidden="true">' +
        '<button class="sg-filter-glass-scrim" type="button" data-filter-glass-close aria-label="Close filters"></button>' +
        '<div class="sg-filter-glass-card" role="dialog" aria-modal="true" aria-label="Filters and search">' +
          '<div class="sg-filter-glass-head">' +
            '<div>' +
              '<strong>Find cards</strong>' +
              '<span data-glass-count></span>' +
            '</div>' +
            '<div class="sg-filter-glass-actions">' +
              '<button class="sg-filter-glass-clear" type="button" data-filter-clear hidden>Clear</button>' +
              '<button class="sg-filter-glass-x" type="button" data-filter-glass-close aria-label="Close">✕</button>' +
            '</div>' +
          '</div>' +
          '<label class="sg-filter-glass-search">' +
            '<span aria-hidden="true">⌕</span>' +
            '<input type="search" placeholder="Search the binder…" data-glass-search enterkeyhint="search">' +
          '</label>' +
          '<div class="sg-filter-glass-body" data-glass-filters>' + filterRows + '</div>' +
        '</div>' +
      '</div>' +
      binderLookHost(readBinderLook()) +
      sheetHost() +
      bottomMarkup('collection', opts);
  }


  // SiegeKnight faces: card-binder-visual exposes the art helpers but the knight
  // composition itself lives in home.js, which this page cannot load (it drives
  // the old hub). Mirrored here using the same class names, so style.css dresses
  // it identically to the shipping binder.
  function knightCard(card) {
    var visual = window.SieglingsCardBinderVisual;
    if (!visual) return '';
    var rarity = String(card.rarity || 'common').toLowerCase();
    var el = String(card.element || 'NEUTRAL').toLowerCase();
    // CARAT and GSPx cast the card in gold; GOLD and GSP give it a gold frame.
    var holoGold = card.holoGoldFinish === true || (card.caratFinish === true && card.goldFinish !== true);
    var gold = !holoGold && (card.goldFinish === true || card.plainGoldFinish === true);
    var holo = card.holographic === true || gold || holoGold;
    var plain = !holo && card.holoPlainFinish === true;
    var holoClass = (holo ? ' is-holographic' : plain ? ' is-holo-plain' : '') +
      (holoGold ? ' is-holo-gold-finish' : gold ? ' is-gold-finish' : '');
    var holoOverlay = holoGold && visual.renderHoloGoldFinish ? visual.renderHoloGoldFinish()
      : gold && visual.renderGoldFinish ? visual.renderGoldFinish()
      : holo ? '<div class="card-holographic-overlay" aria-hidden="true"></div>'
      : plain ? '<div class="card-holo-plain-overlay" aria-hidden="true"></div>' : '';
    var body = '<div class="knight-card-body">' +
      '<span class="knight-card-name">' + esc(card.name) + '</span>' +
      '<span class="knight-card-meta"><span class="knight-element">' + esc(title(card.element)) + '</span> ' +
      '<span class="knight-tier tier-' + esc(String(card.tier || 'siegeknight').toLowerCase()) + '">' +
      esc(card.tier || 'SiegeKnight') + '</span> ' +
      '<span class="knight-rarity rarity-' + esc(rarity) + '">' + esc(title(card.rarity)) + '</span></span>' +
      (card.passive ? '<span class="knight-card-ability"><span>Passive</span>' + esc(card.passive) + '</span>' : '') +
    '</div>';
    if (visual.usesFullCardArt && visual.usesFullCardArt(card)) {
      var crop = visual.buildArtTransformStyle ? visual.buildArtTransformStyle(card) : '';
      return '<div class="knight-card knight-full-card-art knight-binder-card rarity-frame-' + esc(rarity) +
        ' el-' + esc(el) + holoClass + '" role="img" aria-label="' + esc(card.name) + '">' +
        '<img ' + artAttrs(card.cardArtUrl, 640) +
        ' alt="' + esc(card.name) + '" loading="lazy"' + (crop ? ' style="' + esc(crop) + '"' : '') + '>' +
        holoOverlay + body + '</div>';
    }
    if (visual.usesKnightOverlayArt && visual.usesKnightOverlayArt(card)) {
      var tplClass = visual.knightTemplateClass ? visual.knightTemplateClass(card) : '';
      return '<div class="knight-card knight-full-card-art knight-overlay-art' + tplClass + ' knight-binder-card rarity-frame-' +
        esc(rarity) + ' el-' + esc(el) + holoClass + '" style="--knight-color:' + visual.elementColor(card.element) +
        ";--knight-card-back:url('/img/knights/card-back-siegeknight.png');--knight-card-template:url('/img/knights/siegeknight-card-template.png')\">" +
        visual.renderKnightOverlayArtWindow(card) +
        '<div class="knight-card-template" aria-hidden="true"></div>' + holoOverlay + body + '</div>';
    }
    return '';
  }

  // Printed face copy: flavour when the catalog has it, otherwise the effect
  // text Strategies and Deceptions carry on ability.description.
  function cardFaceText(card) {
    var showcase = window.SieglingsCardShowcase;
    if (showcase && typeof showcase.resolveCardDescriptionText === 'function') {
      return showcase.resolveCardDescriptionText(card, card && card.description) || '';
    }
    var direct = String(card && card.description || '').trim();
    if (direct) return direct;
    var ability = card && (card.ability || (card.abilities && card.abilities[0]));
    return String(ability && ability.description || card && card.effect || '').trim();
  }

  // The production renderer composes the real card: frame, notches, rarity
  // treatment, stats and description, with overlay art composited in and full
  // card art used whole. Reimplementing that here would have drifted from the
  // dashboard the moment a designer changed a frame.
  function galleryCard(c) {
    var visual = window.SieglingsCardBinderVisual;
    c = withPlayerHolo(c);
    if (String(c.type || '').toUpperCase() === 'SIEGEKNIGHT') {
      var knight = knightCard(c);
      if (knight) return '<button class="sg-card-tile" type="button" data-card="' + esc(c.id) + '">' + knight + '</button>';
    }
    if (visual && visual.renderBinderCardTile) {
      return '<button class="sg-card-tile" type="button" data-card="' + esc(c.id) + '">' +
        visual.renderBinderCardTile(c, {
          descriptionText: cardFaceText(c),
          useHolographicFullCardArt: true,
          playerHoloArtIds: PLAYER_HOLO_ART_IDS,
          playerGoldIds: PLAYER_GOLD_IDS,
          playerHoloGoldIds: PLAYER_HOLO_GOLD_IDS,
          playerPlainGoldIds: PLAYER_PLAIN_GOLD_IDS,
          playerCaratIds: PLAYER_CARAT_IDS,
          playerHoloPlainIds: PLAYER_HOLO_PLAIN_IDS
        }) +
      '</button>';
    }
    // Offline preview board: no renderer loaded, so fall back to the plate.
    return '<article class="sg-gal-card" data-card="' + esc(c.id) + '" style="--el:' + color(c.element) + '">' +
      '<div class="sg-gal-plate"><div class="sg-gal-art">' +
      '<img src="' + esc(c.cardArtUrl) + '" alt="' + esc(c.name) + '" loading="lazy"></div></div>' +
      '<div class="sg-gal-cap"><span class="nm">' + esc(c.name) + '</span>' +
      '<i class="sg-rar ' + esc(String(c.rarity || '').toLowerCase()) + '"></i>' +
      '<img src="' + esc(icon(c.element)) + '" alt="' + esc(title(c.element)) + '"></div>' +
    '</article>';
  }

  /* ---------- scroll reveal ----------
     A binder page arriving all at once reads as a screenshot; the cards should
     settle into their pockets as you come to them. Each tile fades and lifts in
     when it enters the scroller, staggered so a row resolves left to right.
     The stagger is not a constant: it is read from how fast the player is
     actually scrolling, because a delay that feels graceful at a slow browse
     leaves a flicking thumb staring at empty pockets. Fast scrolling collapses
     the queue towards an instant paint, slow scrolling opens it back up.
     IntersectionObserver does the watching - a scroll handler measuring every
     tile would cost a layout read per frame on a 166-card grid. */
  var REVEAL_SLOW_STEP = 52;   // ms between neighbours at a resting scroll
  var REVEAL_FAST_STEP = 8;    // ms between neighbours when the thumb is flicking
  var REVEAL_FAST_VELOCITY = 2.6; // px/ms at which the stagger is fully collapsed
  // A desktop binder shows a whole batch at once (nine columns), and 24 tiles
  // at the resting step would cascade for 1.2s - past the point where it reads
  // as arrival rather than lag. The step compresses so one batch always
  // finishes inside this window, however many tiles it holds.
  var REVEAL_MAX_CASCADE = 620;

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Velocity is smoothed rather than taken raw: a single frame's delta swings
  // wildly on touch, and the stagger would jitter with it.
  function makeScrollVelocity(scroller) {
    var last = scroller ? scroller.scrollTop : 0;
    var lastAt = 0;
    var smoothed = 0;
    function sample() {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      var top = scroller ? scroller.scrollTop : 0;
      var dt = now - lastAt;
      if (lastAt && dt > 0) {
        var v = Math.abs(top - last) / dt;
        smoothed = smoothed * 0.65 + v * 0.35;
      }
      last = top;
      lastAt = now;
    }
    if (scroller) scroller.addEventListener('scroll', sample, { passive: true });
    return {
      // Decays towards rest so a stopped scroll opens the stagger back up
      // without waiting for another scroll event to report zero.
      value: function () {
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (lastAt && now - lastAt > 140) smoothed *= 0.5;
        return smoothed;
      }
    };
  }

  function makeTileReveal(grid, scroller) {
    if (!grid || !window.IntersectionObserver || prefersReducedMotion()) {
      return { observe: function () {}, settle: function () {} };
    }
    var velocity = makeScrollVelocity(scroller);
    grid.classList.add('sg-reveal');
    // rootMargin lets a tile start its fade just before it clears the fold, so
    // it is already settling by the time it is properly on screen.
    var io = new IntersectionObserver(function (entries) {
      var arriving = 0;
      entries.forEach(function (entry) { if (entry.isIntersecting) arriving++; });
      var step = Math.min(revealStep(), REVEAL_MAX_CASCADE / Math.max(1, arriving - 1));
      var slot = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var tile = entry.target;
        io.unobserve(tile);
        tile.style.transitionDelay = (slot * step) + 'ms';
        slot++;
        // Two frames: one for the browser to accept the starting state of a
        // tile that was inserted this tick, one to run the transition.
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { tile.classList.add('is-in'); });
        });
      });
    }, { root: scroller || null, rootMargin: '0px 0px 12% 0px', threshold: 0.01 });

    function revealStep() {
      var v = velocity.value();
      var t = Math.min(1, v / REVEAL_FAST_VELOCITY);
      return REVEAL_SLOW_STEP + (REVEAL_FAST_STEP - REVEAL_SLOW_STEP) * t;
    }

    return {
      // `settled` tiles were already on screen before this repaint (Show more
      // re-renders the whole grid); re-animating them would flash the page the
      // player is reading.
      observe: function (settled) {
        var tiles = grid.children;
        for (var i = 0; i < tiles.length; i++) {
          var tile = tiles[i];
          if (settled && i < settled) { tile.classList.add('is-in'); continue; }
          io.observe(tile);
        }
      },
      settle: function () {
        io.disconnect();
        for (var i = 0; i < grid.children.length; i++) grid.children[i].classList.add('is-in');
      }
    };
  }

  function mountGallery(app, opts) {
    opts = opts || {};
    var scroll = app.querySelector('[data-gal-scroll]') || app.querySelector('.sg-scroll');
    var tools = app.querySelector('[data-tools]');
    var filters = app.querySelector('[data-filters]');
    var headrow = app.querySelector('[data-gal-headrow]');
    var glass = app.querySelector('[data-filter-glass]');
    var glassFilters = app.querySelector('[data-glass-filters]');
    var glassSearch = app.querySelector('[data-glass-search]');
    var glassCount = app.querySelector('[data-glass-count]');
    var fab = app.querySelector('[data-filter-fab]');
    var fabBadge = app.querySelector('[data-filter-fab-badge]');
    var filterToggle = app.querySelector('[data-filter-toggle]');
    var filterToggleBadge = app.querySelector('[data-filter-toggle-badge]');
    var clearBtn = app.querySelector('[data-filter-clear]');
    var grid = app.querySelector('[data-grid]');
    var count = app.querySelector('[data-count]');
    var more = app.querySelector('[data-more]');
    var openSheet = mountSheet(app, opts) || function () {};
    mountBinderLook(app);
    var reveal = makeTileReveal(grid, scroll);
    var ownedToggle = app.querySelector('[data-owned-toggle]');
    var isOwned = binderOwnership(opts.live);
    // Owned is the default view whenever the payload can tell what is owned;
    // the Collection pills also offer every card, or only the unowned ones.
    var ownership = isOwned && ownedToggle ? 'OWNED' : 'ALL';
    var activeEl = 'ALL', activeRarity = 'ALL', activeType = 'ALL', query = '';
    var COMPACT_AFTER = 72;
    // The binder loads one element section at a time: a section is appended as
    // the reader nears the end of the last one, so a phone never paints ~200
    // art-heavy tiles up front.
    var sections = [], shownSections = 0;

    function matches() {
      return binderSort(ALL_CARDS.filter(function (c) {
        if (ownership === 'OWNED' && !isOwned(c)) return false;
        if (ownership === 'MISSING' && isOwned(c)) return false;
        if (activeType !== 'ALL' && String(c.type || 'SIEGLING').toUpperCase() !== activeType) return false;
        if (activeEl !== 'ALL' && c.element !== activeEl) return false;
        if (activeRarity !== 'ALL' && String(c.rarity || '').toUpperCase() !== activeRarity) return false;
        if (query && String(c.name || '').toLowerCase().indexOf(query) === -1) return false;
        return true;
      }));
    }

    function groupSections(rows) {
      var out = [];
      rows.forEach(function (c) {
        var key = binderElementKey(c);
        var last = out[out.length - 1];
        if (!last || last.key !== key) out.push(last = { key: key, cards: [] });
        last.cards.push(c);
      });
      return out;
    }

    function sectionMarkup(section) {
      // A heading spans the grid row; it is not a tile, so the reveal observer
      // and the tile handlers (which look for [data-card]) pass over it.
      return '<div class="sg-gal-section" role="heading" aria-level="3" style="--el:' + color(section.key) + '">' +
        '<img src="' + icon(section.key) + '" alt="">' +
        '<span>' + esc(title(section.key)) + '</span>' +
        '<em>' + esc(section.cards.length) + '</em></div>' +
        section.cards.map(galleryCard).join('');
    }

    function activeFilterCount() {
      return (activeEl !== 'ALL' ? 1 : 0) + (activeType !== 'ALL' ? 1 : 0) +
        (activeRarity !== 'ALL' ? 1 : 0) + (query ? 1 : 0) + (ownership === 'MISSING' ? 1 : 0);
    }

    function syncPills(root, attr, value) {
      if (!root) return;
      root.querySelectorAll('[' + attr + ']').forEach(function (pill) {
        pill.classList.toggle('on', pill.getAttribute(attr) === value);
      });
    }

    function syncChrome() {
      syncPills(filters, 'data-el', activeEl);
      syncPills(filters, 'data-type', activeType);
      syncPills(filters, 'data-rarity', activeRarity);
      syncPills(glassFilters, 'data-el', activeEl);
      syncPills(glassFilters, 'data-type', activeType);
      syncPills(glassFilters, 'data-rarity', activeRarity);
      syncPills(filters, 'data-owned', ownership);
      syncPills(glassFilters, 'data-owned', ownership);
      if (ownedToggle) {
        ownedToggle.classList.toggle('on', ownership === 'OWNED');
        ownedToggle.setAttribute('aria-pressed', String(ownership === 'OWNED'));
      }
      var inlineSearch = app.querySelector('[data-search-input]');
      if (inlineSearch && inlineSearch.value !== query) inlineSearch.value = query;
      if (glassSearch && glassSearch.value !== query) glassSearch.value = query;
      var n = activeFilterCount();
      if (fabBadge) {
        fabBadge.hidden = n === 0;
        fabBadge.textContent = String(n);
      }
      if (clearBtn) clearBtn.hidden = n === 0;
      if (fab) fab.classList.toggle('has-filters', n > 0);
      // The rows start collapsed, so the toggle is the only thing on screen
      // that can say the grid is already narrowed. It carries the same count
      // the FAB does rather than leaving a filtered binder looking unfiltered.
      if (filterToggle) filterToggle.classList.toggle('has-filters', n > 0);
      if (filterToggleBadge) {
        filterToggleBadge.hidden = n === 0;
        filterToggleBadge.textContent = String(n);
      }
    }

    function emptyMarkup() {
      return '<p class="sg-gal-empty">' + (ownership === 'OWNED'
        ? 'No owned cards match. Pick All under Collection to browse the whole binder.'
        : ownership === 'MISSING' ? 'You own every card that matches.'
        : 'No cards match these filters.') + '</p>';
    }

    // Appends the next element section without repainting the ones already on
    // the page, so the reader's place and the settled tiles stay put.
    function showNextSection() {
      if (shownSections >= sections.length) return;
      var settled = grid.children.length;
      grid.insertAdjacentHTML('beforeend', sectionMarkup(sections[shownSections]));
      shownSections++;
      reveal.observe(settled);
      scheduleFit(app);
      syncMore();
    }

    function syncMore() {
      var left = shownSections < sections.length;
      if (more) {
        more.hidden = !left;
        var btn = more.querySelector('button');
        if (btn && left) btn.textContent = 'Show ' + title(sections[shownSections].key);
      }
      if (sentinel) {
        sentinel.unobserve(more);
        // Re-observing fires a fresh initial callback, so a short section that
        // leaves the trigger already on screen loads the next one straight away.
        if (left) sentinel.observe(more);
      }
    }

    function repaint() {
      var rows = matches();
      sections = groupSections(rows);
      shownSections = 0;
      grid.innerHTML = rows.length ? '' : emptyMarkup();
      showNextSection();
      if (!rows.length) syncMore();
      var label = rows.length + (rows.length === 1 ? ' card' : ' cards');
      if (count) count.textContent = label;
      if (glassCount) glassCount.textContent = label;
      syncChrome();
    }

    var sentinel = more && window.IntersectionObserver ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) showNextSection(); });
    }, { root: scroll || null, rootMargin: '0px 0px 900px 0px' }) : null;

    // The inline tools are too narrow beside the title for a search field or
    // the pill rows, so either one widens the chrome to a full row.
    function syncHeadrow() {
      if (!headrow) return;
      headrow.classList.toggle('is-wide',
        filters.classList.contains('open') || tools.classList.contains('searching'));
    }

    function setCompact(on) {
      app.classList.toggle('is-filter-compact', on);
      if (fab) fab.hidden = !on;
      if (!on) closeGlass();
    }

    function openGlass() {
      if (!glass) return;
      app.classList.add('is-filter-glass-open');
      glass.setAttribute('aria-hidden', 'false');
      if (fab) fab.setAttribute('aria-expanded', 'true');
      if (glassSearch) {
        setTimeout(function () { try { glassSearch.focus(); } catch (e) {} }, 280);
      }
    }

    function closeGlass() {
      if (!glass) return;
      app.classList.remove('is-filter-glass-open');
      glass.setAttribute('aria-hidden', 'true');
      if (fab) fab.setAttribute('aria-expanded', 'false');
    }

    function onScroll() {
      setCompact((scroll && scroll.scrollTop || 0) > COMPACT_AFTER);
    }

    function bindPillGroup(root, attr, apply) {
      if (!root) return;
      root.querySelectorAll('[' + attr + ']').forEach(function (pill) {
        pill.addEventListener('click', function () {
          apply(pill.getAttribute(attr));
          repaint();
        });
      });
    }

    bindPillGroup(filters, 'data-el', function (v) { activeEl = v; });
    bindPillGroup(filters, 'data-type', function (v) { activeType = v; });
    bindPillGroup(filters, 'data-rarity', function (v) { activeRarity = v; });
    bindPillGroup(glassFilters, 'data-el', function (v) { activeEl = v; });
    bindPillGroup(glassFilters, 'data-type', function (v) { activeType = v; });
    bindPillGroup(glassFilters, 'data-rarity', function (v) { activeRarity = v; });
    bindPillGroup(filters, 'data-owned', function (v) { ownership = v; });
    bindPillGroup(glassFilters, 'data-owned', function (v) { ownership = v; });

    // (looked up above, beside the other chrome handles)
    if (filterToggle) {
      filterToggle.addEventListener('click', function () {
        filters.classList.toggle('open');
        this.classList.toggle('on', filters.classList.contains('open'));
        syncHeadrow();
      });
    }
    var searchToggle = app.querySelector('[data-search-toggle]');
    if (searchToggle) {
      searchToggle.addEventListener('click', function () {
        tools.classList.toggle('searching');
        this.classList.toggle('on', tools.classList.contains('searching'));
        syncHeadrow();
        if (tools.classList.contains('searching')) {
          var input = app.querySelector('[data-search-input]');
          if (input) input.focus();
        }
      });
    }
    var inlineSearch = app.querySelector('[data-search-input]');
    if (inlineSearch) {
      inlineSearch.addEventListener('input', function () {
        query = this.value.trim().toLowerCase(); repaint();
      });
    }
    if (glassSearch) {
      glassSearch.addEventListener('input', function () {
        query = this.value.trim().toLowerCase(); repaint();
      });
    }
    if (fab) {
      fab.addEventListener('click', openGlass);
      fab.setAttribute('aria-expanded', 'false');
    }
    app.querySelectorAll('[data-filter-glass-close]').forEach(function (btn) {
      btn.addEventListener('click', closeGlass);
    });
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        activeEl = 'ALL'; activeType = 'ALL'; activeRarity = 'ALL'; query = '';
        if (ownership === 'MISSING') ownership = 'OWNED';
        repaint();
      });
    }
    if (more) {
      var moreBtn = more.querySelector('button');
      if (moreBtn) moreBtn.addEventListener('click', showNextSection);
    }
    if (ownedToggle) {
      ownedToggle.addEventListener('click', function () {
        ownership = ownership === 'OWNED' ? 'ALL' : 'OWNED';
        repaint();
      });
    }
    if (scroll) scroll.addEventListener('scroll', onScroll, { passive: true });
    app.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && app.classList.contains('is-filter-glass-open')) {
        ev.preventDefault();
        closeGlass();
      }
    });

    // The binder opens on the cards, not on its controls: three rows of pills
    // cost most of the first screen of artwork before a player has asked to
    // narrow anything. The filter rows start collapsed behind the tools row's
    // toggle (and the FAB, once the page is scrolled); search is optional the
    // same way. Any filter a player does set stays visible in the toggle's
    // active state and the FAB badge, so a collapsed row never hides a
    // narrowed grid.
    setCompact(false);
    repaint();
    onScroll();
    if (opts.openCard) openSheet(byId(opts.openCard));
  }


  /* ---------- play ---------- */

  // Graphic-first mode picker: every mode is a full-bleed plate, the copy is a
  // label and one line. Art source is deliberately mixed - gallery scenes where
  // one exists for the mode, production Land plates otherwise.
  // The shipping /play mode picker spends ~60 words of body copy explaining
  // Battle vs Siege before showing a single image. Same two modes, same
  // vocabulary, but each is a full-bleed plate carrying a label and one line.
  var MODES = [
    { id: 'battle', label: 'Arena', tag: 'Battle · Gauntlet · Tutorial',
      line: 'Levels off — all deck and reads.',
      art: '/img/gallery/frostag-training.webp', el: 'ICE', primary: true, cta: 'Play' },
    { id: 'siege', label: 'Siege', tag: 'Adventure · Battlegrounds · Endless',
      line: 'Roguelike expedition — build a warband.',
      art: '/img/gallery/bearzooka-rampage.webp', el: 'FIRE', cta: 'Enter' },
    { id: 'dominion', label: 'Dominion', tag: 'Kingdom & Idle RPG',
      line: 'Build your keep, train your SiegeKnight, and explore.',
      art: '/img/gallery/cactyjackedty-ruins.webp', el: 'EARTH', cta: 'Enter' }
  ];

  // The Siege panel's tag said "New" with a badge. Whether a run is waiting is
  // a fact the payload knows, so it says that instead.
  function modePanel(m, opts) {
    if (m.id === 'siege' && opts && opts.siegeRuns && opts.siegeRuns.length) {
      m = { id: m.id, label: m.label, tag: 'Run saved', badge: true, line: m.line,
            art: m.art, el: m.el, cta: 'Resume' };
    }
    return '<a class="sg-mode sg-mode-' + m.id + (m.primary ? ' is-primary' : '') + '"' + linkAttrs(m.label) +
      ' style="--el:' + color(m.el) + '">' +
      '<img class="sg-mode-bg" src="' + esc(m.art) + '" alt="" loading="lazy">' +
      '<div class="sg-mode-veil"></div>' +
      '<div class="sg-mode-body">' +
        '<span class="sg-mode-tag' + (m.badge ? ' is-new' : '') + '">' + esc(m.tag) + '</span>' +
        '<h3>' + esc(m.label) + '</h3>' +
        '<p>' + esc(m.line) + '</p>' +
      '</div>' +
      '<span class="sg-mode-go">' + esc(m.cta) + ' ›</span>' +
    '</a>';
  }

  function compactPlayResume(opts) {
    var runs = opts.siegeRuns || [];
    if (runs.length <= 1) return expeditionsSection(opts);
    return '<section class="sg-section" data-home-section="Continue Playing"><div class="sg-exps"><a class="sg-exp is-empty" href="' + HREF.siege + '"><span class="sg-exp-empty-body"><strong>Continue your expeditions</strong><em>' + runs.length + ' saved runs</em></span><span class="sg-exp-go">Choose ›</span></a></div></section>';
  }

  function playScreen(opts) {
    opts = opts || {};
    var lead = byId('solgator') || CARDS[0];
    var guest = Boolean(opts.guest);
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-modes">' + MODES.map(function (m) { return modePanel(m, opts); }).join('') + '</div>' +
        compactPlayResume(opts) +
        (function () {
          // The count is whatever /api/match/rooms reported. Unknown says so
          // rather than showing the "11 open" the concept shipped with.
          var open = opts.lobbies != null ? opts.lobbies : (opts.live && opts.live.lobbies);
          var label = open == null ? 'Browse' : (open + ' open');
          return '<a class="sg-lobbies"' + lobbiesAttrs() + '>' +
            '<span class="sg-lobbies-dot"></span>Lobbies &amp; Tournaments<em>' +
            esc(label) + '</em><span class="go">›</span></a>';
        })() +
        (guest ? guestBand() : '') +
        '<div style="height:96px"></div>' +
      '</div>' +
      bottomMarkup('play', opts);
  }

  // The shipping page gives this a full card and three lines of copy. It is a
  // prompt, not a feature, so it gets one artwork band and two buttons.
  function guestBand() {
    return '<section class="sg-guest">' +
      '<img class="sg-guest-bg" src="/img/gallery/hurricrane-skyruins.webp" alt="" loading="lazy">' +
      '<div class="sg-guest-veil"></div>' +
      '<div class="sg-guest-body">' +
        '<strong>Pick up where you left off</strong>' +
        '<p>Save decks and track your record.</p>' +
        '<div class="sg-guest-actions">' +
          '<a class="sg-guest-primary" href="/login" data-screen="auth">Log In</a>' +
          '<a class="sg-guest-ghost" href="/login" data-screen="auth">Register</a>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- decks ---------- */

  function deckRow(d, action) {
    var lead = byId(d.lead) || CARDS[0];
    var total = (d.w || 0) + (d.l || 0);
    var rate = total ? Math.round(d.w / total * 100) : 0;
    // Openable, but not a <button>: a preset row already carries its Unlock
    // button and nesting one button in another is invalid HTML that browsers
    // silently un-nest. The handler ignores clicks that land on the action.
    return '<article class="sg-deckrow' + (d.active ? ' is-active' : '') + (action ? ' has-action' : '') +
      '" data-deck-id="' + esc(d.id || '') + '" data-deck-open="' + esc(d.id || '') +
      '" role="button" tabindex="0" aria-label="' + esc(d.name + ', ' + d.cards + ' cards') +
      '" style="--el:' + color(lead.element) + '">' +
      '<div class="sg-deckrow-bg" style="background-image:url(\'' + land(lead.element) + '\')"></div>' +
      '<div class="sg-deckrow-veil"></div>' +
      '<div class="sg-deckrow-art"><img ' + artAttrs(lead.cardArtUrl) + ' alt="" loading="lazy"></div>' +
      '<div class="sg-deckrow-body">' +
        (d.active ? '<span class="sg-tag">Selected</span>' : '') +
        (d.label ? '<span class="sg-deck-kind">' + esc(d.label) + '</span>' : '') +
        '<h4>' + esc(d.name) + '</h4>' +
        '<div class="sg-deck-els">' + d.els.map(function (e) {
          return '<img src="' + icon(e) + '" alt="' + esc(title(e)) + '">';
        }).join('') + '</div>' +
        '<div class="sg-deckrow-meta">' +
          (total ? '<b>' + d.w + 'W</b> · ' + d.l + 'L &nbsp;·&nbsp; ' + rate + '% &nbsp;·&nbsp; ' : '') +
          esc(d.cards) + ' cards</div>' +
        (action || '') +
      '</div>' +
      (total ? '<div class="sg-deckrow-bar"><i style="width:' + rate + '%"></i></div>' : '') +
    '</article>';
  }

  function deckEntries(d, catalog) {
    if (Array.isArray(d.customDeckCards) && d.customDeckCards.length) return d.customDeckCards;
    if (Array.isArray(d.cards)) return d.cards;
    var preset = (catalog || []).filter(function (p) { return p.id === d.deckId; })[0];
    return preset && preset.cards || [];
  }

  function deckSummary(d, entries) {
    var cards = entries.map(function (c) { return byIdIn(ALL_CARDS, c.id || c); }).filter(Boolean);
    var els = d.elements || cards.map(function (c) { return c.element; }).filter(function (el, i, all) {
      return el && all.indexOf(el) === i;
    });
    var lead = cards.filter(function (c) { return c.type === 'SIEGLING'; })[0]
      || CARDS.filter(function (c) { return els.indexOf(c.element) !== -1; })[0] || CARDS[0];
    return {
      id: d.id, name: d.name || 'Untitled deck', lead: lead && lead.id,
      els: els, w: d.wins || 0, l: d.losses || 0,
      cards: entries.reduce(function (n, c) { return n + (typeof c === 'string' ? 1 : Number(c.count) || 1); }, 0),
      active: Boolean(d.selected || d.active),
      // The detail sheet and the builder both need the list itself, not only how
      // long it is. Normalised to {id, count} so a preset (which carries counts)
      // and a saved custom deck (a flat array of ids, repeated per copy) read the
      // same way downstream.
      entries: countedEntries(entries),
      trainerId: d.trainerId || null
    };
  }

  function countedEntries(entries) {
    var order = [], counts = {};
    (entries || []).forEach(function (c) {
      var id = typeof c === 'string' ? c : c && c.id;
      if (!id) return;
      var n = typeof c === 'string' ? 1 : Number(c.count) || 1;
      if (counts[id] == null) { counts[id] = 0; order.push(id); }
      counts[id] += n;
    });
    return order.map(function (id) { return { id: id, count: counts[id] }; });
  }

  // A saved custom deck is stored as one id per copy, which is the shape
  // /api/profile/decks wants back.
  function flatCardIds(entries) {
    var out = [];
    (entries || []).forEach(function (e) {
      for (var i = 0; i < (e.count || 0); i++) out.push(e.id);
    });
    return out;
  }

  // Saved lists and unlocked presets coexist. Saved decks carry customDeckCards
  // (an array of ids), or deckId pointing to the catalog; neither is d.cards.
  function playerDecks(opts) {
    var saved = opts && opts.live && opts.live.savedDecks;
    if (!Array.isArray(saved)) return [];
    return saved.map(function (d) {
      var row = deckSummary(d, deckEntries(d, opts.live.decks));
      row.kind = 'saved';
      return row;
    });
  }

  function presetUnlocked(d, live) {
    if (Array.isArray(live.unlockedDeckIds)) return live.unlockedDeckIds.indexOf(d.id) !== -1;
    if ((live.purchasedDeckIds || []).indexOf(d.id) !== -1) return true;
    // Same guest/legacy fallback as the battle picker. Signed-in ownership from
    // the server takes precedence, including the player's starter element.
    var free = ['FIRE', 'EARTH', 'WIND', 'ICE'];
    var starter = /^pack_([a-z0-9]+)/i.exec(live.starterPackId || '');
    if (starter) free.push(starter[1].toUpperCase());
    return Boolean(d.elements && d.elements.length) && d.elements.every(function (el) {
      return free.indexOf(String(el).toUpperCase()) !== -1;
    });
  }

  function deckGroups(opts) {
    var live = opts.live || {};
    var owned = [], shop = [];
    (live.decks || []).forEach(function (d) {
      var row = deckSummary(d, deckEntries(d));
      if (presetUnlocked(d, live)) {
        row.label = (live.purchasedDeckIds || []).indexOf(d.id) !== -1 ? 'Owned' : 'Included';
        row.kind = 'owned';
        owned.push(row);
      } else {
        row.kind = 'presets';
        shop.push(row);
      }
    });
    return { saved: playerDecks(opts), owned: owned, shop: shop };
  }

  function presetBuyAction(d, opts) {
    if (opts.guest) return '<a class="sg-deck-buy" href="/login" data-screen="auth">Sign in to unlock</a>';
    var live = opts.live || {};
    var price = live.premadeDeckPrice;
    var known = price != null && live.gold != null;
    var pending = opts.deckPurchasePendingId === d.id;
    var shortage = known ? Math.max(0, Number(price) - Number(live.gold)) : 0;
    var disabled = !known || shortage > 0 || opts.deckPurchasePendingId;
    return '<button class="sg-deck-buy" type="button" data-buy-deck="' + esc(d.id) + '"' +
      (disabled ? ' disabled' : '') + ' aria-label="' + esc('Unlock ' + d.name + (price != null ? ' for ' + price + ' Siegecoins' : '')) + '">' +
      (pending ? 'Unlocking\u2026' : known ? 'Unlock <img src="/img/ui/home-stats/siegecoin.png" alt="Siegecoins"> ' + esc(Number(price).toLocaleString()) : 'Unavailable') +
      '</button>' + (shortage ? '<span class="sg-deck-shortage">' + esc(shortage.toLocaleString()) + ' more Siegecoins needed</span>' : '');
  }

  function deckSection(name, rows, key, opts, empty) {
    return '<section class="sg-section sg-deck-section" data-deck-section="' + key + '">' +
      '<div class="sg-section-head"><h3>' + name + '</h3><span>' + rows.length + '</span></div>' +
      (rows.length ? '<div class="sg-stack">' + rows.map(function (d) {
        return deckRow(d, key === 'presets' ? presetBuyAction(d, opts) : '');
      }).join('') + '</div>' : '<p class="sg-empty-row">' + esc(empty) + '</p>') + '</section>';
  }

  /* ---------- auto build ----------
     There is no auto-build endpoint, and inventing one would put deck theory in
     two places. This composes a list the server will accept on the rules the
     server already publishes (`deckBuilder.minDeckSize` / `maxCopies`) out of
     cards the player actually owns, then saves it through the ordinary
     /api/profile/decks path so it is a real saved deck, not a client fiction.

     It builds around one element rather than taking the first N cards, because a
     pile of unrelated cards cannot link - notches are the whole game - and it
     keeps roughly the preset ratio of Siegelings to Strategies to Deceptions. */

  function builderRules(opts) {
    var rules = (opts.live && opts.live.deckBuilder) || {};
    return {
      minDeckSize: Number(rules.minDeckSize) || 30,
      maxCopies: Number(rules.maxCopies) || 3
    };
  }

  function ownedCount(opts, id) {
    var owned = opts.live && opts.live.ownedCards;
    if (!owned) return 0;
    return Math.max(0, Number(owned[id]) || 0);
  }

  // A SiegeKnight the player owns AND the catalog still lists as active; the
  // server refuses a save on either count.
  function autoTrainerId(opts) {
    var live = opts.live || {};
    var owned = (live.knights || []).map(function (k) { return k && k.id; }).filter(Boolean);
    var active = {};
    (live.trainers || []).forEach(function (t) {
      if (t && t.id && t.active !== false) active[String(t.id).toLowerCase()] = true;
    });
    var usable = owned.filter(function (id) { return active[String(id).toLowerCase()]; });
    if (!usable.length) return null;
    if (live.defaultTrainerId && usable.indexOf(live.defaultTrainerId) !== -1) return live.defaultTrainerId;
    return usable[0];
  }

  function autoBuildList(opts) {
    var rules = builderRules(opts);
    var pool = ownedPool(opts).filter(function (c) {
      return c && String(c.type || 'SIEGLING').toUpperCase() !== 'SIEGEKNIGHT';
    });
    if (!pool.length) return null;

    // Lead with whichever element the player has most of, so the deck can link.
    var byElement = {};
    pool.forEach(function (c) {
      var el = String(c.element || 'NEUTRAL').toUpperCase();
      byElement[el] = (byElement[el] || 0) + Math.min(ownedCount(opts, c.id), rules.maxCopies);
    });
    var lead = Object.keys(byElement).sort(function (a, b) { return byElement[b] - byElement[a]; })[0];

    function rank(c) {
      var el = String(c.element || 'NEUTRAL').toUpperCase();
      // Same element first, then neutral, then everything else; rarer last so a
      // deck is not three copies of one legendary and nothing else.
      return (el === lead ? 0 : el === 'NEUTRAL' ? 1 : 2) * 10 +
        (String(c.rarity || '').toUpperCase() === 'LEGENDARY' ? 2 : 0);
    }
    function ofType(type) {
      return pool.filter(function (c) { return String(c.type || 'SIEGLING').toUpperCase() === type; })
        .sort(function (a, b) { return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)); });
    }

    // The preset shape is 20/10/10 of 40; scaled to the minimum and topped up
    // from whatever is left, because a player may own no Deceptions at all.
    var want = {
      SIEGLING: Math.round(rules.minDeckSize * 0.5),
      SPELL: Math.round(rules.minDeckSize * 0.25),
      TRAP: Math.round(rules.minDeckSize * 0.25)
    };
    var picked = [], counts = {};
    function take(list, limit) {
      for (var pass = 0; pass < rules.maxCopies; pass++) {
        for (var i = 0; i < list.length && picked.length < limit; i++) {
          var c = list[i];
          var have = counts[c.id] || 0;
          if (have >= Math.min(rules.maxCopies, ownedCount(opts, c.id))) continue;
          counts[c.id] = have + 1;
          picked.push(c.id);
        }
        if (picked.length >= limit) break;
      }
    }
    var running = 0;
    ['SIEGLING', 'SPELL', 'TRAP'].forEach(function (type) {
      running += want[type];
      take(ofType(type), running);
    });
    // Short of the minimum because the collection is thin in one slot: fill from
    // everything owned rather than refusing to build.
    take(ofType('SIEGLING').concat(ofType('SPELL'), ofType('TRAP')), rules.minDeckSize);

    if (picked.length < rules.minDeckSize) return { shortfall: rules.minDeckSize - picked.length, cards: picked };
    return { cards: picked.slice(0, rules.minDeckSize) };
  }

  function autoBuildName(opts) {
    var used = {};
    ((opts.live && opts.live.savedDecks) || []).forEach(function (d) {
      if (d && d.name) used[String(d.name).toLowerCase()] = true;
    });
    var base = 'Auto Build';
    if (!used[base.toLowerCase()]) return base;
    for (var n = 2; n < 99; n++) {
      if (!used[(base + ' ' + n).toLowerCase()]) return base + ' ' + n;
    }
    return base + ' ' + Date.now();
  }

  function saveDeck(payload) {
    var api = liveApi();
    if (!api) return Promise.reject(new Error('Sign in to save decks.'));
    return api.post('/api/profile/decks', payload).then(function (res) {
      if (!res || res.error) throw new Error((res && res.error) || 'That deck could not be saved.');
      return res;
    });
  }

  // The save returns the whole profile, so the screen is repainted from the
  // server's list rather than from a guess about what it now contains.
  function adoptSavedDecks(opts, res) {
    if (!res) return;
    opts.live = opts.live || {};
    if (Array.isArray(res.savedDecks)) opts.live.savedDecks = res.savedDecks;
    else if (res.profile && Array.isArray(res.profile.savedDecks)) opts.live.savedDecks = res.profile.savedDecks;
  }

  /* ---------- deck detail ----------
     Tapping a deck row did nothing at all: the rows carried a data-deck-id that
     nothing listened for, so a player could see that they owned six decks and
     never look inside one. This is that look - the list itself, grouped the way
     a deck is read (Siegelings, then Strategies, then Deceptions), with the
     cards as real faces so tapping one opens the card sheet on top.

     Its own host, not the card sheet's: the two are stacked, and sharing one
     would mean opening a card from a deck destroyed the deck behind it. */
  function deckSheetHost() {
    return '<div class="sg-sheet sg-deck-sheet" data-deck-sheet>' +
      '<div class="sg-sheet-card" data-deck-sheet-card></div></div>';
  }

  var DECK_GROUPS = [['SIEGLING', 'Siegelings'], ['SPELL', 'Strategies'], ['TRAP', 'Deceptions']];

  function deckCardGroups(entries) {
    var seen = {}, groups = {};
    DECK_GROUPS.forEach(function (g) { groups[g[0]] = []; });
    (entries || []).forEach(function (e) {
      var card = byIdIn(ALL_CARDS, e.id) || byId(e.id);
      if (!card) return;
      var type = String(card.type || 'SIEGLING').toUpperCase();
      if (!groups[type]) groups[type] = [];
      if (seen[e.id]) return;
      seen[e.id] = true;
      groups[type].push({ card: card, count: e.count });
    });
    return groups;
  }

  function deckSheetMarkup(d, opts) {
    var groups = deckCardGroups(d.entries);
    var known = (d.entries || []).filter(function (e) {
      return byIdIn(ALL_CARDS, e.id) || byId(e.id);
    }).length;
    var order = DECK_GROUPS.slice();
    Object.keys(groups).forEach(function (k) {
      if (!order.some(function (g) { return g[0] === k; })) order.push([k, title(k) + 's']);
    });
    var body = order.map(function (g) {
      var rows = groups[g[0]] || [];
      if (!rows.length) return '';
      var total = rows.reduce(function (n, r) { return n + r.count; }, 0);
      return '<div class="sg-decksheet-group">' +
        '<h4>' + esc(g[1]) + '<em>' + esc(total) + '</em></h4>' +
        '<div class="sg-decksheet-grid">' + rows.map(function (r) {
          return '<div class="sg-decksheet-slot">' + galleryCard(r.card) +
            (r.count > 1 ? '<span class="sg-build-count">x' + esc(r.count) + '</span>' : '') + '</div>';
        }).join('') + '</div>' +
      '</div>';
    }).join('');

    var actions = '';
    if (d.kind === 'saved' && !opts.guest) {
      actions = '<button class="sg-guest-primary" type="button" data-deck-edit="' + esc(d.id) + '">Edit deck</button>' +
        '<button class="sg-ghost-btn" type="button" data-deck-delete="' + esc(d.id) + '">Delete</button>';
    } else if (d.kind === 'owned' && !opts.guest) {
      // A preset is the game's list, not the player's, so it is copied into a
      // new saved deck rather than edited in place.
      actions = '<button class="sg-guest-primary" type="button" data-deck-copy="' + esc(d.id) + '">Copy to a new deck</button>';
    } else if (d.kind === 'presets') {
      actions = '<p class="sg-sheet-note">Unlock this preset to build with it.</p>';
    }

    return '<button class="sg-sheet-dismiss" type="button" aria-label="Close deck"></button>' +
      '<div class="sg-decksheet">' +
        '<div class="sg-decksheet-head">' +
          '<h3>' + esc(d.name) + '</h3>' +
          '<div class="sg-deck-els">' + (d.els || []).map(function (e) {
            return '<img src="' + icon(e) + '" alt="' + esc(title(e)) + '">';
          }).join('') + '</div>' +
          '<p>' + esc(d.cards) + ' cards' +
            (known < (d.entries || []).length
              ? ' \u00b7 ' + esc((d.entries || []).length - known) + ' not in your catalog yet' : '') +
          '</p>' +
        '</div>' +
        (body || '<p class="sg-sheet-empty">This deck\'s cards are not in the catalog this page loaded.</p>') +
        (actions ? '<div class="sg-decksheet-actions">' + actions + '</div>' : '') +
      '</div>';
  }

  // Every navigation destination gets distinct artwork and a deliberate crop.
  // Full scenes often put their character off-center; the tiny panes need their
  // own focal points instead of inheriting the stage's cover crop.
  var HUB_PANEL_IMAGES = {
    my: { src:'/img/gallery/bearby-longfuse.webp', thumb:'38% 50%', stage:'46% 45%' },
    saved: { src:'/img/gallery/earth-warband.webp', thumb:'84% 45%', stage:'65% 45%' },
    presets: { src:'/img/gallery/skydon-skyreach.webp', thumb:'60% 45%', stage:'50% 40%' },
    add: { src:'/img/gallery/frostag-training-portrait.webp', thumb:'48% 40%', card:'48% 45%', stage:'48% 45%' },
    review: { src:'/img/gallery/hurricrane-skyruins-portrait.webp', thumb:'50% 8%', stage:'50% 35%' },
    auto: { src:'/img/shop/scene-electric.webp', thumb:'50% 12%', card:'50% 30%', stage:'50% 28%' },
    save: { src:'/img/gallery/cactyjackedty-ruins.webp', thumb:'52% 45%', stage:'50% 45%' },
    'saved-card': { src:'/img/shop/scene-water.webp', thumb:'55% 30%', card:'55% 35%', stage:'55% 40%' },
    profile: { src:'/img/gallery/bearzooka-rampage.webp', thumb:'60% 45%', stage:'53% 45%' },
    friends: { src:'/img/shop/scene-poison.webp', thumb:'50% 30%', stage:'50% 35%' },
    messages: { src:'/img/shop/scene-psychic.webp', thumb:'60% 30%', stage:'55% 40%' },
    lobbies: { src:'/img/gallery/bearnade-payload.webp', thumb:'10% 50%', stage:'32% 45%' },
    history: { src:'/img/gallery/draco-brood.webp', thumb:'65% 45%', stage:'55% 45%' },
    // Home stage plates are at most ~110px of art, so they take the small cuts.
    'stage-play': { src:'/img/gallery/bearby-blastoff-thumb.webp', thumb:'30% 40%' },
    'stage-collection': { src:'/img/shop/scene-cards-480.webp', thumb:'22% 45%' },
    'stage-shop': { src:'/img/shop/scene-market-480.webp', thumb:'20% 40%' },
    'stage-social': { src:'/img/shop/scene-throne-480.webp', thumb:'85% 50%' },
    'stage-settings': { src:'/img/shop/scene-armory-480.webp', thumb:'15% 45%' }
  };

  function hubPanelImage(key, use) {
    var art = HUB_PANEL_IMAGES[key] || HUB_PANEL_IMAGES.my;
    var focus = art[use || 'thumb'] || art.stage || '50% 50%';
    return '<img src="' + esc(art.src) + '" alt="" data-hub-art="' + esc(key) + '" style="object-position:' + focus + '">';
  }

  function panelButton(id, label, active, attribute) {
    return '<button class="sg-gtab' + (active === id ? ' on' : '') + '" type="button" ' + attribute + '="' + id +
      '" aria-pressed="' + (active === id) + '"><span class="sg-gtab-art">' + hubPanelImage(id) +
      '</span><span class="sg-gtab-label">' + label + '</span><i class="sg-gtab-gem" aria-hidden="true"></i></button>';
  }

  function decksScreen(opts) {
    opts = opts || {};
    var groups = deckGroups(opts);
    var tab = opts.deckPanel || 'my';
    var heading = {my:'My Decks', saved:'Saved Decks', presets:'Presets'};
    return topMarkup(opts) +
      '<div class="sg-deck-backdrop" aria-hidden="true">' + hubPanelImage(tab, 'stage') + '</div>' +
      '<nav class="sg-work-nav" aria-label="Deck library">' +
        panelButton('my','My Decks',tab,'data-deck-panel') + panelButton('saved','Saved Decks',tab,'data-deck-panel') +
        panelButton('presets','Presets',tab,'data-deck-panel') + '</nav>' +
      '<div class="sg-scroll sg-deck-workspace" data-decks-content aria-busy="' + Boolean(opts.deckPurchasePendingId) + '">' +
        '<header class="sg-work-head"><h2>' + heading[tab] + '</h2><p>' + groups.saved.length + ' saved · ' + groups.owned.length +
          (opts.guest ? ' included presets' : ' owned presets') + '</p></header>' +
        (opts.deckPurchaseNotice ? '<p class="sg-deck-notice" data-deck-notice tabindex="-1" role="status">' + esc(opts.deckPurchaseNotice) + '</p>' : '') +
        (tab === 'my' ? '<div class="sg-deck-launchers">' +
          '<button class="sg-task-card" type="button" data-open-builder>' + hubPanelImage('add', 'card') + '<span><strong>Deck Builder</strong><small>Create a deck from your binder</small></span></button>' +
          '<button class="sg-task-card" type="button" data-open-auto-builder>' + hubPanelImage('auto', 'card') + '<span><strong>Auto Build</strong><small>Build a starting deck from cards you own</small></span></button>' +
          '<button class="sg-task-card" type="button" data-deck-panel="saved">' + hubPanelImage('saved-card', 'card') + '<span><strong>Saved Decks</strong><small>' + groups.saved.length + ' decks in your library</small></span></button></div>' :
          tab === 'saved' ? deckSection('Saved decks',groups.saved,'saved',opts,opts.guest ? 'Sign in to save your own decks.' : 'Create your first deck in Deck Builder.') :
          deckSection(opts.guest ? 'Included presets' : 'Owned presets',groups.owned,'owned',opts,'No unlocked presets yet.') +
          deckSection('Unlock presets',groups.shop,'presets',opts,'You have unlocked every available preset.')) +
      '</div>' + deckSheetHost() + sheetHost() + bottomMarkup('collection',opts);
  }

  function refreshDecks(opts, announce) {
    var current = document.querySelector('.sg-app [data-decks-content]');
    if (!current) return;
    var scrollTop = current.scrollTop;
    var app = current.closest('.sg-app');
    var next = render(document.createElement('div'), 'decks', opts);
    app.replaceWith(next);
    next.querySelector('.sg-scroll').scrollTop = scrollTop;
    var notice = next.querySelector('[data-deck-notice]');
    if (announce && notice) notice.focus();
  }

  function allDeckRows(opts) {
    var groups = deckGroups(opts);
    return groups.saved.concat(groups.owned, groups.shop);
  }

  function findDeckRow(opts, id) {
    return allDeckRows(opts).filter(function (d) { return d.id === id; })[0] || null;
  }

  // Downward swipe-to-dismiss shared by the card sheet and the deck sheet.
  // Claims only a pull begun at the top of the named scroll region (or on the
  // grab handle); native scrolling keeps ownership of upward / mid-scroll
  // gestures. opts.blocked() skips the gesture when a higher layer is open.
  function wireSheetSwipe(sheet, sheetCard, closeFn, opts) {
    opts = opts || {};
    var scrollSelector = opts.scrollSelector || '.sg-sheet-panels';
    var drag = null;
    function resetDrag() {
      drag = null;
      sheet.classList.remove('is-dragging');
      sheetCard.style.removeProperty('--sg-sheet-drag');
    }
    sheetCard.addEventListener('touchstart', function (e) {
      resetDrag();
      if (!sheet.classList.contains('open') || e.touches.length !== 1) return;
      if (opts.blocked && opts.blocked()) return;
      var control = e.target.closest('a, button, input, select, textarea');
      if (control && !control.classList.contains('sg-sheet-dismiss')) return;
      var panel = e.target.closest(scrollSelector);
      if (panel && panel.scrollTop > 0) return;
      var touch = e.touches[0];
      drag = { id: touch.identifier, x: touch.clientX, y: touch.clientY,
        started: performance.now(), distance: 0, active: false };
    }, { passive: true });
    sheetCard.addEventListener('touchmove', function (e) {
      if (!drag) return;
      if (e.touches.length !== 1 || e.touches[0].identifier !== drag.id) {
        resetDrag();
        return;
      }
      var dx = e.touches[0].clientX - drag.x;
      var dy = e.touches[0].clientY - drag.y;
      if (!drag.active) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (dy <= 0 || dy <= Math.abs(dx) * 1.2 || !e.cancelable) {
          resetDrag();
          return;
        }
        drag.active = true;
        sheet.classList.add('is-dragging');
      }
      if (e.cancelable) e.preventDefault();
      drag.distance = Math.max(0, dy);
      sheetCard.style.setProperty('--sg-sheet-drag', drag.distance + 'px');
    }, { passive: false });
    sheetCard.addEventListener('touchend', function (e) {
      if (!drag) return;
      var distance = drag.distance;
      var speed = distance / Math.max(1, performance.now() - drag.started);
      if (drag.active && e.cancelable) e.preventDefault();
      if (drag.active && (distance >= 80 || (distance >= 28 && speed > 0.5))) closeFn();
      else resetDrag();
    }, { passive: false });
    sheetCard.addEventListener('touchcancel', resetDrag, { passive: true });
    return { resetDrag: resetDrag };
  }

  function mountDeckSheet(app, opts) {
    var sheet = app.querySelector('[data-deck-sheet]');
    if (!sheet) return;
    var card = sheet.querySelector('[data-deck-sheet-card]');
    var opener = null;
    var swipe = null;

    function close() {
      sheet.classList.remove('open');
      if (swipe) swipe.resetDrag();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    }
    function open(id, from) {
      var d = findDeckRow(opts, id);
      if (!d) return;
      opener = from || null;
      if (swipe) swipe.resetDrag();
      card.innerHTML = deckSheetMarkup(d, opts);
      card.scrollTop = 0;
      sheet.classList.add('open');
      var dismiss = card.querySelector('.sg-sheet-dismiss');
      if (dismiss) dismiss.focus({ preventScroll: true });
      scheduleFit(sheet);
    }

    swipe = wireSheetSwipe(sheet, card, close, {
      scrollSelector: '.sg-decksheet',
      // Card sheet / zoom sit above this one; ignore pulls while they own the
      // screen so a swipe cannot close the deck out from under them.
      blocked: function () {
        var cardSheet = app.querySelector('[data-sheet].open');
        var zoom = app.querySelector('[data-zoom].open');
        return Boolean(cardSheet || zoom);
      }
    });

    app.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      // The Unlock button owns its own clicks, and so does anything inside the
      // sheet itself - reopening the deck from within it would reset the scroll.
      if (e.target.closest('[data-buy-deck]')) return;
      var row = e.target.closest('[data-deck-open]');
      if (!row || sheet.contains(row)) return;
      open(row.getAttribute('data-deck-open'), row);
    });
    app.addEventListener('keydown', function (e) {
      var row = e.target.closest && e.target.closest('[data-deck-open]');
      if (row && !sheet.contains(row) && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        open(row.getAttribute('data-deck-open'), row);
        return;
      }
      // The card sheet sits above this one and is mounted first, so it claims
      // Escape before this handler sees it.
      if (e.key === 'Escape' && !e.sgEscapeHandled && sheet.classList.contains('open')) {
        close();
        e.sgEscapeHandled = true;
      }
    });
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('.sg-sheet-dismiss')) { close(); return; }

      var edit = e.target.closest('[data-deck-edit]');
      if (edit) { close(); openBuilderFor(edit.getAttribute('data-deck-edit'), opts); return; }

      var copy = e.target.closest('[data-deck-copy]');
      if (copy) { close(); openBuilderFor(copy.getAttribute('data-deck-copy'), opts, true); return; }

      var del = e.target.closest('[data-deck-delete]');
      if (del) {
        var row = findDeckRow(opts, del.getAttribute('data-deck-delete'));
        if (!row) return;
        if (!window.confirm('Delete "' + row.name + '"? This cannot be undone.')) return;
        del.disabled = true;
        var api = liveApi();
        if (!api) return;
        api.post('/api/profile/decks/delete', { id: row.id }).then(function (res) {
          if (!res || res.error) {
            del.disabled = false;
            return;
          }
          adoptSavedDecks(opts, res);
          close();
          opts.deckPurchaseNotice = row.name + ' deleted.';
          opts.deckPurchaseError = false;
          refreshDecks(opts, true);
        });
      }
    });
  }

  function runAutoBuild(opts, note) {
    if (opts.guest) return;
    var rules = builderRules(opts);
    var trainerId = autoTrainerId(opts);
    if (!trainerId) {
      note('Auto Build needs a SiegeKnight. Open a pack to pull one first.', true);
      return;
    }
    var built = autoBuildList(opts);
    if (!built) {
      note('Auto Build needs cards in your collection. Open a pack first.', true);
      return;
    }
    if (built.shortfall) {
      note('Auto Build is ' + built.shortfall + ' card' + (built.shortfall === 1 ? '' : 's') +
        ' short of the ' + rules.minDeckSize + '-card minimum. Open more packs and try again.', true);
      return;
    }
    var name = autoBuildName(opts);
    note('Building ' + name + '\u2026');
    saveDeck({
      name: name,
      trainerId: trainerId,
      customDeckCards: built.cards,
      clientDeckId: 'auto-' + Date.now()
    }).then(function (res) {
      adoptSavedDecks(opts, res);
      note(name + ' built and saved \u2014 ' + built.cards.length + ' cards.');
    }).catch(function (err) {
      note(err.message || 'That deck could not be saved.', true);
    });
  }

  function mountDecks(app, opts) {
    mountSheet(app, opts);
    mountDeckSheet(app, opts);

    function note(message, isError) {
      opts.deckPurchaseNotice = message;
      opts.deckPurchaseError = Boolean(isError);
      refreshDecks(opts, true);
    }

    app.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var deckPanel = e.target.closest('[data-deck-panel]');
      if (deckPanel) { opts.deckPanel = deckPanel.getAttribute('data-deck-panel'); refreshDecks(opts); return; }
      if (e.target.closest('[data-open-auto-builder]')) { BUILD = newBuild(opts); BUILD.view = 'auto'; if (onNavigate) onNavigate('builder'); return; }
      if (e.target.closest('[data-open-builder]')) {
        openBuilderFor(null, opts);
        return;
      }
      if (e.target.closest('[data-auto-build]')) {
        runAutoBuild(opts, note);
        return;
      }
    });

    app.addEventListener('click', function (e) {
      var button = e.target.closest && e.target.closest('[data-buy-deck]');
      if (!button || button.disabled || opts.guest || opts.deckPurchasePendingId) return;
      var live = opts.live || {};
      var deck = (live.decks || []).filter(function (d) { return d.id === button.getAttribute('data-buy-deck'); })[0];
      if (!deck || presetUnlocked(deck, live)) return;
      opts.deckPurchasePendingId = deck.id;
      opts.deckPurchaseNotice = '';
      opts.deckPurchaseError = false;
      refreshDecks(opts);
      fetch('/api/shop/purchase-deck', {
        method: 'POST', credentials: 'same-origin', headers: authHeaders(),
        body: JSON.stringify({ deckId: deck.id })
      }).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          if (!response.ok || !data || data.error || !data.progression) throw new Error(data && data.error || 'The deck could not be unlocked. Refresh to check your decks before trying again.');
          return data.progression;
        });
      }).then(function (progression) {
        // Keep the server's balance and unlocks, including a successful purchase
        // even if an older serializer returns a stale derived unlock list.
        live.gold = progression.gold;
        live.premadeDeckPrice = progression.premadeDeckPrice != null ? progression.premadeDeckPrice : live.premadeDeckPrice;
        live.starterPackId = progression.starterPackId || live.starterPackId;
        ['purchasedDeckIds', 'unlockedDeckIds'].forEach(function (key) {
          live[key] = (live[key] || []).concat(progression[key] || [], [deck.id]).filter(function (id, i, all) {
            return all.indexOf(id) === i;
          });
        });
        if (typeof loadCachedAuthProfile === 'function' && typeof saveCachedAuthProfile === 'function') {
          var profile = loadCachedAuthProfile();
          if (live.accountId && profile && profile.user && profile.user.id === live.accountId) {
            profile.progression = Object.assign({}, profile.progression, progression, {
              purchasedDeckIds: live.purchasedDeckIds, unlockedDeckIds: live.unlockedDeckIds
            });
            saveCachedAuthProfile(profile);
          }
        }
        opts.deckPurchaseNotice = deck.name + ' unlocked. It is now in your owned presets.';
      }).catch(function (error) {
        opts.deckPurchaseError = true;
        opts.deckPurchaseNotice = error.name === 'TypeError' ? 'Unable to confirm the purchase. Refresh to check your decks, then try again.' : error.message;
      }).then(function () {
        opts.deckPurchasePendingId = '';
        refreshDecks(opts, true);
      });
    });
  }

  /* ---------- shop ---------- */

  // Every value on this screen used to be invented: four packs that do not exist
  // at a flat 150, three Siegelcoin bundles with dollar prices nothing sells,
  // and a "Cinderfall Collection, ends in 2d, 900" promotion. /api/shop/packs is
  // public and returns the real catalog - id, name, description, price, elements
  // and odds - so the screen renders that, and says the shop is unavailable when
  // the call fails rather than falling back to fiction.
  function packElement(pk) {
    return (pk.elements && pk.elements[0]) || 'NEUTRAL';
  }

  // A pack wears the card back of the element it deals, so an Electric Summon
  // looks Electric from the shelf to the wrapper. Only the random Siegeling
  // pack has no element of its own (its element list is the whole live mix),
  // and an element without a printed back would 404, so both take the shared
  // Siegeling back instead of falling through to Fire.
  var PACK_BACK = {
    pack_siegeling_random: '/img/packs/siegeling-back.webp'
  };

  function packBack(pk) {
    if (PACK_BACK[pk.id]) return PACK_BACK[pk.id];
    var entry = cardBackEntry(packElement(pk));
    return entry ? '/img/decks/card-back-' + entry.element.toLowerCase() + '.webp' : PACK_BACK.pack_siegeling_random;
  }

  // Starters lead (a new player's first choice), cheapest first within each
  // group, then the shared element order (Fire first) on the pack's lead element.
  function featuredPacks(packs) {
    function price(pk) { return pk.price == null ? 1e9 : pk.price; }
    return packs.slice().sort(function (x, y) {
      return (y.starterEligible ? 1 : 0) - (x.starterEligible ? 1 : 0) || price(x) - price(y) ||
        elementRank(packElement(x)) - elementRank(packElement(y));
    });
  }

  /* ---------- daily offers ----------
     /api/shop/packs carries today's single-card offers and the day's shop
     titles alongside the packs. The redesign dropped both, which left the shop
     selling packs only; they are back as their own rows. Buying is two taps -
     the first arms the button with its price, the second spends - because a
     single stray tap on a phone should never spend coins. */
  function offerCard(offer) {
    var catalog = byIdIn(ALL_CARDS, offer.cardId) || {};
    var card = {};
    for (var k in catalog) if (Object.prototype.hasOwnProperty.call(catalog, k)) card[k] = catalog[k];
    card.id = offer.cardId;
    card.name = offer.cardName || card.name;
    card.type = offer.type || card.type;
    card.element = offer.element || card.element;
    card.rarity = offer.rarity || card.rarity;
    if (offer.description && !card.description) card.description = offer.description;
    if (offer.cardArtUrl) card.cardArtUrl = offer.cardArtUrl;
    if (offer.cardArtMode) card.cardArtMode = offer.cardArtMode;
    if (card.type === 'TRAINER') card.type = 'SIEGEKNIGHT';
    return card;
  }

  // A title already unlocked (bought, or earned elsewhere) is read off the
  // account's own title list, since the shop payload is the same for everyone.
  function titleOwned(t, live) {
    if (t.unlocked) return true;
    return (live.titles || []).some(function (own) { return own.id === t.id && own.unlocked; });
  }

  function refreshShop(opts, notice, isError) {
    var current = document.querySelector('.sg-app .sg-scroll');
    var app = current && current.closest('.sg-app');
    if (!app) return;
    opts.shopNotice = notice || '';
    opts.shopNoticeError = Boolean(isError);
    // Re-rendering must not jump the page, and a picker row the player has
    // swiped along keeps its place: picking the tenth pack used to snap the row
    // back to the first. Rows are matched by their label, so a row that only
    // exists on another tab starts at its beginning.
    var scrollTop = current.scrollTop;
    var rows = {};
    app.querySelectorAll('.sg-gselect, .sg-arena-skins').forEach(function (row) {
      rows[row.getAttribute('aria-label')] = row.scrollLeft;
    });
    var next = render(document.createElement('div'), 'shop', Object.assign({}, opts, { freeze: true }));
    app.replaceWith(next);
    next.querySelector('.sg-scroll').scrollTop = scrollTop;
    next.querySelectorAll('.sg-gselect, .sg-arena-skins').forEach(function (row) {
      var label = row.getAttribute('aria-label');
      if (Object.prototype.hasOwnProperty.call(rows, label)) row.scrollLeft = rows[label];
      // A choice made from outside the row (a remembered element, say) is
      // brought into view without moving a row that already shows it.
      var on = row.querySelector('.on');
      if (on) {
        var r = row.getBoundingClientRect(), b = on.getBoundingClientRect();
        if (b.left < r.left) row.scrollLeft -= r.left - b.left + 6;
        else if (b.right > r.right) row.scrollLeft += b.right - r.right + 6;
      }
    });
  }

  // A guest has no account to grant the cards to, so the buy sends them to
  // sign in rather than to a server error.
  function mountShop(app, opts) {
    var packs = (opts.live && opts.live.packs) || [];
    mountSheet(app, opts);
    // Backdrops come from art tags, which can land after the first paint (a
    // first visit has no cached art list), so the stage repaints once they do.
    function onArt() {
      if (!app.isConnected) { window.removeEventListener('sg:art-refreshed', onArt); return; }
      if (!app.querySelector('.sg-godds, .sg-sheet.open')) refreshShop(opts);
    }
    window.addEventListener('sg:art-refreshed', onArt);
    // A picker row that runs past its space says so: its ends fade and an
    // arrow shows on each side that has more, so packs added to the catalog
    // are never hidden off the edge of a row that looks complete.
    function syncRow(row) {
      var wrap = row.parentNode;
      if (!wrap || !wrap.classList.contains('sg-gselwrap')) return;
      var max = row.scrollWidth - row.clientWidth;
      wrap.classList.toggle('has-prev', row.scrollLeft > 2);
      wrap.classList.toggle('has-next', row.scrollLeft < max - 2);
    }
    function syncRows() {
      if (!app.isConnected) { window.removeEventListener('resize', syncRows); return; }
      app.querySelectorAll('.sg-gselect').forEach(syncRow);
    }
    app.addEventListener('scroll', function (e) {
      if (e.target.classList && e.target.classList.contains('sg-gselect')) syncRow(e.target);
    }, true);
    window.addEventListener('resize', syncRows);
    // After refreshShop has put each row back where the player left it.
    window.requestAnimationFrame(syncRows);
    // The arrows sit over the row's ends, and a swipe that starts on one would
    // otherwise go nowhere: the browser pans the element under the finger, and
    // the arrow is not inside the row. A drag that starts there moves the row
    // by hand instead, and only a touch that stays put counts as a tap.
    var drag = null;
    app.addEventListener('touchstart', function (e) {
      var more = e.target.closest && e.target.closest('[data-shop-more]');
      if (!more || e.touches.length !== 1) { drag = null; return; }
      drag = { row: more.parentNode.querySelector('.sg-gselect'), x: e.touches[0].clientX, left: 0, moved: false };
      drag.left = drag.row.scrollLeft;
    }, { passive: true });
    app.addEventListener('touchmove', function (e) {
      if (!drag || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - drag.x;
      if (Math.abs(dx) > 8) drag.moved = true;
      if (drag.moved) drag.row.scrollLeft = drag.left - dx;
    }, { passive: true });
    app.addEventListener('touchend', function () {
      if (drag && drag.moved) app._sgSwiped = Date.now();
      drag = null;
    }, { passive: true });
    app.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var more = e.target.closest('[data-shop-more]');
      if (more) {
        // The click a browser may still send after a drag off an arrow.
        if (app._sgSwiped && Date.now() - app._sgSwiped < 400) return;
        var row = more.parentNode.querySelector('.sg-gselect');
        row.scrollBy({ left: Number(more.getAttribute('data-shop-more')) * row.clientWidth * 0.75, behavior: 'smooth' });
        return;
      }
      var tab = e.target.closest('[data-shop-tab]');
      var arenaPick = e.target.closest('[data-arena-skin]');
      var arenaBuy = e.target.closest('[data-arena-buy]');
      var arenaEquip = e.target.closest('[data-arena-equip]');
      var el = e.target.closest('[data-shop-element]');
      var pick = e.target.closest('[data-shop-pack]');
      var offer = e.target.closest('[data-shop-offer]');
      var odds = e.target.closest('[data-shop-odds]');
      var inArt = e.target.closest('[data-art-cards]');
      var preview = e.target.closest('[data-title-preview]');
      if (tab) {
        opts.shopTab = shopPref('tab', tab.getAttribute('data-shop-tab'));
        refreshShop(opts);
      } else if (arenaPick) {
        opts.arenaSkinPreview = arenaPick.getAttribute('data-arena-skin');
        refreshShop(opts);
      } else if (arenaBuy || arenaEquip) {
        if (opts.guest) { window.location.href = '/login'; return; }
        var skinId = (arenaBuy || arenaEquip).getAttribute(arenaBuy ? 'data-arena-buy' : 'data-arena-equip');
        (arenaBuy ? window.SiegelingsHomeLive.post('/api/shop/purchase-battlefield', { skinId: skinId })
          : window.SiegelingsHomeLive.post('/api/shop/equip-battlefield', { skinId: skinId }))
          .then(function (result) {
            if (!result || result.error || !result.progression) throw new Error((result && result.error) || 'Arena update failed.');
            opts.live.progression = result.progression;
            opts.live.gold = result.progression.gold;
            opts.live.battlefieldSkins = (result.battlefieldSkins || opts.live.battlefieldSkins || []).map(function (skin) {
              var owned = (result.progression.battlefieldSkins || []).filter(function (item) { return item.id === skin.id; })[0];
              return Object.assign({}, skin, owned || {});
            });
            if (!opts.live.battlefieldSkins.length) opts.live.battlefieldSkins = result.progression.battlefieldSkins || [];
            refreshShop(opts, arenaBuy ? 'Arena added to your collection.' : 'Arena equipped.');
          }).catch(function (error) { refreshShop(opts, error.message || 'Arena update failed.', true); });
      } else if (el) {
        opts.shopElement = shopPref('element', el.getAttribute('data-shop-element'));
        refreshShop(opts);
      } else if (pick) {
        opts.shopPack = pick.getAttribute('data-shop-pack');
        refreshShop(opts);
      } else if (offer) {
        opts.shopOffer = offer.getAttribute('data-shop-offer');
        refreshShop(opts);
      } else if (odds) {
        var pk = packs.filter(function (p) { return p.id === odds.getAttribute('data-shop-odds'); })[0];
        if (pk) showOdds(app, pk);
      } else if (inArt) {
        var piece = artPiece(inArt.getAttribute('data-art-cards'));
        if (piece) showArtCards(app, piece);
      } else if (preview) {
        opts.shopTitlePreview = preview.getAttribute('data-title-preview');
        refreshShop(opts);
      }
    });
    // ×1 opens on one tap, as packs always have. A ×10 spends ten packs' worth
    // of coins at once, so it takes a second tap to confirm, like the daily buys.
    app.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-pack]') : null;
      if (!btn || btn.disabled) return;
      if (opts.guest) { window.location.href = '/login'; return; }
      var count = Number(btn.getAttribute('data-count')) || 1;
      if (count > 1 && !btn.classList.contains('is-armed')) {
        btn.classList.add('is-armed');
        btn.querySelector('.sg-gbtn-label').textContent = 'Tap to confirm';
        return;
      }
      var pk = packs.filter(function (p) { return p.id === btn.getAttribute('data-pack'); })[0];
      if (pk) openPack(pk, opts, count);
    });

    var pending = false;
    app.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-buy-offer],[data-buy-title]') : null;
      if (!btn || btn.disabled || pending) return;
      if (opts.guest) { window.location.href = '/login'; return; }
      if (!btn.classList.contains('is-armed')) {
        app.querySelectorAll('.sg-buy.is-armed').forEach(function (other) {
          other.classList.remove('is-armed');
          if (other._label) other.innerHTML = other._label;
        });
        btn._label = btn.innerHTML;
        btn.classList.add('is-armed');
        btn.innerHTML = 'Buy &middot; ' + esc(btn.getAttribute('data-price'));
        return;
      }
      var offerId = btn.getAttribute('data-buy-offer');
      var titleId = btn.getAttribute('data-buy-title');
      pending = true;
      btn.disabled = true;
      btn.textContent = 'Buying…';
      fetch(offerId ? '/api/shop/purchase-card' : '/api/shop/purchase-title', {
        method: 'POST', credentials: 'same-origin', headers: authHeaders(),
        body: JSON.stringify(offerId ? { offerId: offerId } : { titleId: titleId })
      }).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          if (!response.ok || !data || data.error || !data.progression) {
            throw new Error((data && data.error) || 'That purchase did not go through. Refresh to check your purse before trying again.');
          }
          return data;
        });
      }).then(function (data) {
        var live = opts.live;
        var p = data.progression;
        live.gold = p.gold;
        live.ownedCards = p.ownedCards || live.ownedCards;
        live.ownedTotal = p.ownedTotal != null ? p.ownedTotal : live.ownedTotal;
        live.titles = p.playerTitles || live.titles;
        live.purchasedDailyOfferIds = p.purchasedDailyOfferIds || live.purchasedDailyOfferIds;
        if (data.dailyOffers) live.dailyOffers = data.dailyOffers;
        if (data.dailyTitleOffers) live.dailyTitleOffers = data.dailyTitleOffers;
        if (typeof loadCachedAuthProfile === 'function' && typeof saveCachedAuthProfile === 'function') {
          var profile = loadCachedAuthProfile();
          if (live.accountId && profile && profile.user && profile.user.id === live.accountId) {
            profile.progression = Object.assign({}, profile.progression, p);
            saveCachedAuthProfile(profile);
          }
        }
        pending = false;
        refreshShop(opts, offerId ? 'Added to your binder.' : 'Title unlocked. Equip it from your profile.');
      }).catch(function (error) {
        pending = false;
        refreshShop(opts, error.name === 'TypeError' ? 'Unable to confirm the purchase. Refresh to check your purse, then try again.' : error.message, true);
      });
    });
  }

  /* ---------- gacha storefront ----------
     The shop is laid out like a summon screen: a full-bleed art stage, framed
     portrait tabs stacked down its left edge (the left of each scene is
     background, so they cover scenery rather than the characters), a plaque
     with the offer's name, a pennant of what it holds, and the buy buttons
     bottom right - blue for one, gold for ten. Every tab is drawn from the real
     /api/shop/packs payload; a tab with nothing to sell is left out rather than
     shown empty. */
  var SHOP_BANNER = { FIRE: 1, WATER: 1, ICE: 1, WIND: 1, EARTH: 1 };
  var SUMMON_PREFIX = 'pack_siegeling_';

  // Painted shop scenes. `face` is where a tab's portrait crop finds the
  // character in the 16:9 plate.
  var SHOP_SCENE = {
    market: { face: '14% 30%' },
    cards:  { face: '18% 30%' },
    throne: { face: '15% 28%' },
    armory: { face: '15% 40%' }
  };
  function sceneArt(id, thumb) { return '/img/shop/scene-' + id + (thumb ? '-480' : '') + '.webp'; }

  // Commissioned element banners where they exist, then a Siegeling scene the
  // element owns in the shop (with its own tab thumb), then the element's Land
  // plate, so the backdrop always matches what is being summoned.
  function summonArt(el, thumb) {
    var key = String(el || '').toUpperCase();
    var tagged = artForSlot('summon:' + key);
    if (tagged) return pieceStage(tagged, thumb).art;
    if (SUMMON_SCENE[key]) return sceneArt(SUMMON_SCENE[key], thumb);
    if (SHOP_BANNER[key]) return '/img/shop/banner-' + key.toLowerCase() + (thumb ? '-480' : '') + '.webp';
    return thumb ? '/img/lands/thumbs/' + (EL_LAND[key] || 'relic') + '.webp' : land(key);
  }

  // SiegeKnight portraits, keyed by card id (several ids share one portrait).
  // `pos` keeps the knight in frame when a 16:9 portrait is cropped to a phone.
  var KNIGHT_ART = {
    'isaac-tesla':       { file: 'isaac-tesla', pos: '46% 30%' },
    'pyla':              { file: 'pyla', pos: '40% 30%' },
    'trainer10':         { file: 'pyla', pos: '40% 30%' },
    'lady-clarice':      { file: 'lady-clarice', pos: '48% 30%' },
    'cera':              { file: 'cera', pos: '44% 30%' },
    'hera':              { file: 'hera', pos: '50% 30%' },
    'new-siegeknight':   { file: 'catherine', pos: '50% 30%' },
    'new-siegeknight-3': { file: 'high-cleric-catherine', pos: '52% 30%' },
    'squire-bob':        { file: 'squire-bob', pos: '38% 35%' },
    'squirebobsp':       { file: 'squire-bob', pos: '38% 35%' },
    'new-siegeknight-2': { file: 'ser-bob', pos: '56% 30%' },
    // Portrait plates (2:3, Shadow 1:2): `pos` keeps the face in the band a
    // wide screen crops to.
    'anton':             { file: 'anton', pos: '49% 25%' },
    'virelia':           { file: 'virelia', pos: '46% 23%' },
    'morgana':           { file: 'morgana', pos: '53% 19%' },
    'celeste':           { file: 'celeste', pos: '48% 22%' },
    'damian':            { file: 'damian', pos: '49% 24%' }
  };
  function knightArt(id, thumb) {
    var k = KNIGHT_ART[id];
    return k ? '/img/shop/knight-' + k.file + (thumb ? '-480' : '') + '.webp' : '';
  }
  // The summon tab is dressed as that element's SiegeKnights. The live catalog
  // carries knights in ALL_CARDS; the offline snapshot keeps them apart.
  function elementKnights(el) {
    var key = String(el || '').toUpperCase();
    var pool = ALL_CARDS.filter(isKnight);
    if (!pool.length) pool = DATA.knights || [];
    return pool.filter(function (k) { return String(k.element || '').toUpperCase() === key; })
      .sort(function (a, b) { return rarityRank(b) - rarityRank(a); });
  }
  // Highest-rarity knight of the element that has a shop portrait, else null
  // and the summon keeps its element scene.
  function summonKnight(el) {
    return elementKnights(el).filter(function (k) { return KNIGHT_ART[k.id]; })[0] || null;
  }
  // Elements whose summon stands on a shop scene (`scene-<id>.webp`) rather
  // than a banner; the same scene backs that element's packs and cards.
  var SUMMON_SCENE = {
    ELECTRIC: 'electric', METAL: 'metal',
    PSYCHIC: 'psychic', UNDEAD: 'undead', POISON: 'poison', SHADOW: 'shadow',
    LIGHT: 'light'
  };

  // The backdrop behind a pack or a daily card is its element: a scene of that
  // element's Siegelings where one exists (a gallery plate, or a shop scene
  // given as `src`), the commissioned banner next, and the element's Land plate
  // otherwise. `pos` keeps the creatures in
  // frame when a 16:9 scene is cropped to a portrait screen.
  var ELEMENT_STAGE = {
    FIRE:  { img: 'draco-brood', pos: '50% 45%' },
    ICE:   { img: 'frostag-training', pos: '45% 40%' },
    WIND:  { img: 'hurricrane-skyruins', pos: '62% 40%' },
    EARTH: { img: 'cactyjackedty-ruins', pos: '36% 40%' },
    // Portrait-only plate: a wide screen shows the band with the big turtle.
    WATER: { src: '/img/shop/scene-water.webp', pos: '58% 42%' },
    // Portrait-only plate: a wide screen shows the band with the big ape.
    ELECTRIC: { src: '/img/shop/scene-electric.webp', pos: '50% 18%' },
    // 16:9: a portrait crop centres on the spiked armoured lizard.
    METAL: { src: '/img/shop/scene-metal.webp', pos: '66% 50%' },
    // Portrait plates (941x1672): wide screens keep the named Siegeling in band.
    PSYCHIC: { src: '/img/shop/scene-psychic.webp', pos: '52% 48%' }, // Luvyduvy huddle + reader
    UNDEAD:  { src: '/img/shop/scene-undead.webp',  pos: '50% 38%' }, // Ragguette in the graveyard
    POISON:  { src: '/img/shop/scene-poison.webp',  pos: '50% 22%' }, // Slandy skull burst
    SHADOW:  { src: '/img/shop/scene-shadow.webp',  pos: '50% 20%' }, // Voidmaw over the planet
    LIGHT:   { src: '/img/shop/scene-light.webp',   pos: '50% 28%' }  // radiant light spirit
  };
  // Molten Forge leads with Fire too; it gets the other Fire scene so it does
  // not look like the Fire starter.
  var PACK_STAGE = { pack_molten_forge: { img: 'bearzooka-rampage', pos: '55% 45%' } };
  function elementStage(el) {
    var key = String(el || '').toUpperCase();
    var tagged = artForSlot('element:' + key);
    if (tagged) return pieceStage(tagged);
    var pick = ELEMENT_STAGE[key];
    if (pick && pick.img && artRemoved(pick.img)) pick = null;
    if (pick) return { art: pick.src || heroPlate(scene(pick.img)), pos: pick.pos };
    if (SHOP_BANNER[key]) return { art: summonArt(key), pos: '66% 34%' };
    return { art: land(key), pos: '50% 50%' };
  }

  function isSummonPack(pk) {
    return pk.id.indexOf(SUMMON_PREFIX) === 0 && pk.id !== 'pack_siegeling_random';
  }

  function shopPref(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem('sgShop.' + key) || '';
      window.localStorage.setItem('sgShop.' + key, value);
    } catch (err) { /* private mode: the choice just isn't remembered */ }
    return value;
  }

  // Daily offers roll at the server's midnight, and Cloud Run runs on UTC.
  function dailyResetText() {
    var now = new Date();
    var next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    var mins = Math.max(1, Math.round((next - now.getTime()) / 60000));
    var h = Math.floor(mins / 60), m = mins % 60;
    return 'Resets in ' + (h ? h + 'h ' : '') + m + 'm';
  }

  function shopModel(opts) {
    var live = opts.live || {};
    var all = live.packs || [];
    var summons = all.filter(isSummonPack).sort(function (x, y) {
      return elementRank(packElement(x)) - elementRank(packElement(y));
    });
    var packs = featuredPacks(all.filter(function (pk) { return !isSummonPack(pk); }));
    var offers = live.dailyOffers || [];
    var titles = live.dailyTitleOffers || [];
    var arenas = live.battlefieldSkins || [];
    var wanted = String(opts.shopElement || shopPref('element') || '').toUpperCase();
    var summon = summons.filter(function (pk) { return packElement(pk) === wanted; })[0] || summons[0] || null;
    var pack = packs.filter(function (pk) { return pk.id === opts.shopPack; })[0] || packs[0] || null;
    var tabs = [];
    var summonTag = summon && artForSlot('summon:' + packElement(summon));
    var summonLead = summon && summonKnight(packElement(summon));
    if (summon) tabs.push({ id: 'summon', label: 'Siegeknight',
      art: summonLead ? knightArt(summonLead.id, true) : summonArt(packElement(summon), true),
      face: summonLead ? KNIGHT_ART[summonLead.id].pos : summonTag ? summonTag.focus || '50% 50%' : SUMMON_SCENE[packElement(summon)] ? ELEMENT_STAGE[packElement(summon)].pos : SHOP_BANNER[packElement(summon)] ? '72% 22%' : '50% 50%',
      el: packElement(summon) });
    if (pack) tabs.push({ id: 'packs', label: 'Pack Market', art: sceneArt('market', true), face: SHOP_SCENE.market.face, el: 'EARTH' });
    if (offers.length) tabs.push({ id: 'daily', label: 'Daily Offerings', art: sceneArt('cards', true), face: SHOP_SCENE.cards.face, el: 'LIGHT' });
    if (titles.length) tabs.push({ id: 'titles', label: 'Title Hall', art: sceneArt('throne', true), face: SHOP_SCENE.throne.face, el: 'WATER' });
    if (arenas.length) tabs.push({ id: 'arenas', label: 'Arena Art', art: '/img/board-skins/board-haunted-harvest-thumb.webp', face: '50% 50%', el: 'FIRE' });
    var want = opts.shopTab || shopPref('tab');
    var tab = tabs.filter(function (t) { return t.id === want; })[0] || tabs[0] || null;
    return { live: live, summons: summons, summon: summon, packs: packs, pack: pack, offers: offers, titles: titles, arenas: arenas, tabs: tabs, tab: tab };
  }

  function shopTabsMarkup(m) {
    if (m.tabs.length < 2) return '';
    return '<nav class="sg-gtabs" role="tablist" aria-label="Shop">' + m.tabs.map(function (t) {
      var on = t === m.tab;
      return '<button class="sg-gtab' + (on ? ' on' : '') + '" type="button" role="tab"' +
          ' aria-selected="' + (on ? 'true' : 'false') + '" data-shop-tab="' + esc(t.id) + '" style="--el:' + color(t.el) + '">' +
        '<span class="sg-gtab-art"><img src="' + esc(t.art) + '" alt="" loading="lazy" style="object-position:' + esc(t.face) + ';--face:' + esc(t.face) + '"></span>' +
        '<span class="sg-gtab-label">' + esc(t.label) + '</span>' +
        '<i class="sg-gtab-gem" aria-hidden="true"></i>' +
      '</button>';
    }).join('') + '</nav>';
  }

  // One stage, every tab: the art, the plaque (name, then the ribbon with the
  // utility pills beside it, then the pitch), an optional selector row, the
  // pennant, and the buy buttons docked either side of the shield FAB.
  function stage(o) {
    if (o.piece && artCards(o.piece).length) {
      o.utils = (o.utils || []).concat(utilBtn('&#9673;', 'In art', 'data-art-cards="' + esc(o.piece.id) + '"'));
    }
    return '<section class="sg-gstage is-' + esc(o.kind) + '" style="--el:' + color(o.el) + ';--ribbon:' + esc(o.ribbon || color(o.el)) + '">' +
      '<img class="sg-gstage-bg" src="' + esc(o.art) + '" alt=""' + (o.pos ? ' style="object-position:' + esc(o.pos) + '"' : '') + '>' +
      '<div class="sg-gstage-veil"></div>' +
      (o.card ? '<div class="sg-gstage-card">' + o.card + '</div>' : '') +
      (o.pennant ? '<aside class="sg-gpennant"><b>' + esc(o.pennant.title) + '</b>' + o.pennant.items + '</aside>' : '') +
      '<div class="sg-gstage-body">' +
        '<header class="sg-gplaque">' +
          '<span class="sg-gplaque-kicker"><img src="/img/siegelings-icon-256.webp" alt="">' + esc(o.kicker) + '</span>' +
          '<h2>' + esc(o.title) + '</h2>' +
          '<div class="sg-gtagrow">' +
            (o.ribbon !== false && o.sub ? '<span class="sg-gribbon">' + esc(o.sub) + '</span>' : '') +
            ((o.utils || []).length ? '<nav class="sg-gutil" aria-label="More about this offer">' + o.utils.join('') + '</nav>' : '') +
          '</div>' +
          (o.extra || '') +
          (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
        '</header>' +
        (o.select
          ? '<div class="sg-gselwrap">' + o.select +
              '<button type="button" class="sg-gmore is-prev" data-shop-more="-1" aria-label="Scroll back">&lsaquo;</button>' +
              '<button type="button" class="sg-gmore is-next" data-shop-more="1" aria-label="Scroll for more">&rsaquo;</button>' +
            '</div>'
          : '') +
      '</div>' +
      '<div class="sg-gbuy sn-dock">' + o.buy + '</div>' +
    '</section>';
  }

  function utilBtn(glyph, label, attrs) {
    return '<' + (attrs.indexOf('href=') === 0 ? 'a ' : 'button type="button" ') + attrs + ' class="sg-gutil-btn">' +
      '<span aria-hidden="true">' + glyph + '</span><em>' + esc(label) + '</em>' +
    '</' + (attrs.indexOf('href=') === 0 ? 'a' : 'button') + '>';
  }

  function coinLine(price) {
    return '<span class="sg-gbtn-price"><img src="/img/ui/home-stats/siegecoin.png" alt="">' + esc(price != null ? price : '—') + '</span>';
  }

  // Blue ×1 left of the FAB and gold ×10 right of it, the pair every summon
  // screen ends on. ×10 is the server's own bulk bundle and price; a pack
  // without one gets only ×1.
  function packButtons(pk, verb) {
    var bulk = pk.bulk && pk.bulk.count > 1 ? pk.bulk : null;
    return '<button class="sg-gbtn sn-flank is-left is-blue" type="button" data-pack="' + esc(pk.id) + '" data-count="1">' +
        '<span class="sg-gbtn-label">' + esc(verb) + ' &times;1</span>' + coinLine(pk.price) +
      '</button>' +
      (bulk
        ? '<button class="sg-gbtn sn-flank is-right is-gold" type="button" data-pack="' + esc(pk.id) + '" data-count="' + esc(bulk.count) + '">' +
            '<span class="sg-gbtn-label">' + esc(verb) + ' &times;' + esc(bulk.count) + '</span>' + coinLine(bulk.price) +
          '</button>'
        : '');
  }

  function oddsUtil(pk) { return utilBtn('%', 'Odds', 'data-shop-odds="' + esc(pk.id) + '"'); }
  var BINDER_UTIL = utilBtn('&#9707;', 'Binder', 'href="/cards" data-screen="collection"');

  function pennantFacts(pk) {
    var odds = pk.odds || {};
    var knight = odds.siegeKnight != null ? Math.round(odds.siegeKnight * 100) + '%' : null;
    return {
      title: 'Every pack',
      items:
        '<span class="sg-gpennant-fact"><strong>' + esc(odds.cardsPerPack || 5) + '</strong>cards</span>' +
        (knight ? '<span class="sg-gpennant-fact"><strong>' + esc(knight) + '</strong>SiegeKnight</span>' : '') +
        '<span class="sg-gpennant-fact"><strong>&#10022;</strong>Holo chance</span>'
    };
  }

  function pennantFaces(title, cards) {
    var withArt = cards.filter(function (c) { return c && c.cardArtUrl; }).slice(0, 4);
    if (!withArt.length) return null;
    return {
      title: title,
      items: withArt.map(function (c) {
        return '<span class="sg-gpennant-face" style="--el:' + color(c.element) + ';--rar:' + rarityColor(c.rarity) + '">' +
          '<img src="' + esc(c.cardArtUrl) + '" alt="" loading="lazy"><em>' + esc(c.name) + '</em></span>';
      }).join('')
    };
  }

  // Knight faces: the shop portrait where one exists (framed by its own `pos`),
  // else a thumb of the card art.
  function knightPennant(knights, odds) {
    var visual = window.SieglingsCardBinderVisual;
    var seen = {};
    var withArt = knights.filter(function (k) {
      // Several ids share one portrait (Pyla's two cards); show that face once.
      var key = KNIGHT_ART[k.id] ? KNIGHT_ART[k.id].file : k.cardArtUrl;
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    }).slice(0, 4);
    if (!withArt.length) return null;
    return {
      title: odds && odds.siegeKnight != null ? 'SiegeKnight ' + (Math.round(odds.siegeKnight * 1000) / 10) + '%' : 'SiegeKnights',
      items: withArt.map(function (k) {
        var src = KNIGHT_ART[k.id] ? knightArt(k.id, true)
          : visual && visual.artThumbSrc ? visual.artThumbSrc(k.cardArtUrl, 160) : k.cardArtUrl;
        var pos = KNIGHT_ART[k.id] ? ' style="object-position:' + esc(KNIGHT_ART[k.id].pos) + '"' : '';
        return '<span class="sg-gpennant-face" style="--el:' + color(k.element) + ';--rar:' + rarityColor(k.rarity) + '">' +
          '<img src="' + esc(src) + '" alt="" loading="lazy"' + pos + '><em>' + esc(k.name) + '</em></span>';
      }).join('')
    };
  }

  function summonPanel(m) {
    var pk = m.summon;
    var el = packElement(pk);
    var knights = elementKnights(el);
    var lead = summonKnight(el);
    var tagged = lead ? null : artForSlot('summon:' + el);
    return stage({
        kind: 'summon', el: el, art: lead ? knightArt(lead.id) : summonArt(el), piece: tagged,
        pos: lead ? KNIGHT_ART[lead.id].pos : tagged ? tagged.focus : ELEMENT_STAGE[el] && SUMMON_SCENE[el] ? ELEMENT_STAGE[el].pos : '',
        kicker: 'Siegeknight', title: title(el) + ' Siegeknight Pack', sub: title(el) + ' only',
        text: pk.description,
        pennant: knightPennant(knights, pk.odds),
        select: '<div class="sg-gselect" role="radiogroup" aria-label="Summon element">' + m.summons.map(function (s) {
          var e = packElement(s);
          var on = s === pk;
          return '<button type="button" role="radio" aria-checked="' + (on ? 'true' : 'false') + '"' +
            ' class="sg-gel' + (on ? ' on' : '') + '" data-shop-element="' + esc(e) + '" style="--el:' + color(e) + '"' +
            ' aria-label="' + esc(title(e)) + '"><img src="' + esc(icon(e)) + '" alt=""></button>';
        }).join('') + '</div>',
        utils: [oddsUtil(pk), BINDER_UTIL],
        buy: packButtons(pk, 'Summon')
      });
  }

  // The selector is the packs themselves, face-up as their card backs, and it
  // holds the whole catalog - the shop is one screen, so there is no grid below.
  function packsPanel(m) {
    var pk = m.pack;
    var el = packElement(pk);
    // The all-element Siegeling pack has no one element, so it keeps the
    // market; a pack with a scene of its own uses it over its element's.
    var mixed = (pk.elements || []).length > 2;
    var own = PACK_STAGE[pk.id] && !artRemoved(PACK_STAGE[pk.id].img) ? PACK_STAGE[pk.id] : null;
    var tagged = artForSlot('pack:' + pk.id);
    var bg = tagged ? pieceStage(tagged)
      : own ? { art: heroPlate(scene(own.img)), pos: own.pos } : mixed ? { art: sceneArt('market') } : elementStage(el);
    return stage({
        kind: 'packs', el: el, art: bg.art, pos: bg.pos, piece: bg.piece,
        kicker: 'Pack Market', title: pk.name || pk.id,
        sub: pk.starterEligible ? 'Starter' : mixed ? 'All Elements' : (pk.elements || []).map(title).join(' · '),
        text: pk.description,
        pennant: pennantFacts(pk),
        select: '<div class="sg-gselect is-packs" role="radiogroup" aria-label="Pack">' + m.packs.map(function (p) {
          var on = p === pk;
          return '<button type="button" role="radio" aria-checked="' + (on ? 'true' : 'false') + '"' +
            ' class="sg-gpk' + (on ? ' on' : '') + '" data-shop-pack="' + esc(p.id) + '" style="--el:' + color(packElement(p)) + '"' +
            ' aria-label="' + esc(p.name || p.id) + '"><img src="' + esc(packBack(p)) + '" alt="" loading="lazy"></button>';
        }).join('') + '</div>',
        utils: [oddsUtil(pk), BINDER_UTIL],
        buy: packButtons(pk, 'Open')
      });
  }

  // The rotation is the selector: each offer's art in a row, and the one picked
  // is shown big on the stage with its own buy button. It opens on the first
  // slot, which is always a SiegeKnight when one is live.
  function dailyPanel(m, opts) {
    var bought = m.live.purchasedDailyOfferIds || [];
    var head = m.offers.filter(function (o) { return o.id === opts.shopOffer; })[0] || m.offers[0];
    var card = offerCard(head);
    var owned = bought.indexOf(head.id) !== -1;
    // A SiegeKnight offer stands on the knight's own portrait; any other card
    // on a scene it was tagged in, then on its element's.
    var ownArt = !KNIGHT_ART[head.cardId] && artForCard(head.cardId);
    var bg = KNIGHT_ART[head.cardId]
      ? { art: knightArt(head.cardId), pos: KNIGHT_ART[head.cardId].pos }
      : ownArt ? pieceStage(ownArt) : elementStage(card.element);
    return stage({
      kind: 'daily' + (KNIGHT_ART[head.cardId] ? ' is-knight' : ''), el: card.element, art: bg.art, pos: bg.pos, piece: bg.piece,
      kicker: 'Daily Offerings', title: card.name || head.cardId, sub: dailyResetText(),
      text: title(card.rarity) + ' · ' + title(card.element) + ' · ' +
        (card.type === 'SIEGEKNIGHT' ? 'SiegeKnight' : title(card.type)) +
        '. One copy, today only.',
      card: galleryCard(card),
      select: '<div class="sg-gselect" role="radiogroup" aria-label="Today\u2019s offers">' + m.offers.map(function (o) {
        var c = offerCard(o);
        var on = o === head;
        var have = bought.indexOf(o.id) !== -1;
        return '<button type="button" role="radio" aria-checked="' + (on ? 'true' : 'false') + '"' +
          ' class="sg-goffer' + (on ? ' on' : '') + (have ? ' is-owned' : '') + '" data-shop-offer="' + esc(o.id) + '"' +
          ' style="--el:' + color(c.element) + ';--rar:' + rarityColor(c.rarity) + '" aria-label="' + esc(c.name || o.cardId) + (have ? ', owned' : '') + '">' +
          (c.cardArtUrl ? '<img src="' + esc(c.cardArtUrl) + '" alt="" loading="lazy">' : '<img src="' + esc(icon(c.element)) + '" alt="">') +
        '</button>';
      }).join('') + '</div>',
      utils: [BINDER_UTIL],
      buy: owned
        ? '<button class="sg-gbtn sn-flank is-right is-gold" type="button" disabled><span class="sg-gbtn-label">Owned</span></button>'
        : '<button class="sg-buy sg-gbtn sn-flank is-right is-gold" type="button" data-buy-offer="' + esc(head.id) + '" data-price="' + esc(head.price) + '">' +
            '<img src="/img/ui/home-stats/siegecoin.png" alt="">' + esc(head.price) + '</button>'
    });
  }

  // The nameplate previews a title the way it reads under the player's name;
  // the chip row swaps which one it shows.
  function titlesPanel(m, opts) {
    var pick = m.titles.filter(function (t) { return t.id === opts.shopTitlePreview; })[0] ||
      m.titles.filter(function (t) { return !titleOwned(t, m.live); })[0] || m.titles[0];
    var name = (opts.live && opts.live.displayName) || 'Your name';
    return stage({
        kind: 'titles', el: 'LIGHT', art: sceneArt('throne'), ribbon: '#3c4fa8',
        kicker: 'Title Hall', title: 'Wear your legend', sub: dailyResetText(),
        extra: '<div class="sg-gplate"><b>' + esc(name) + '</b><i>' + esc(pick.label || 'Title') + '</i></div>',
        text: pick.description || 'Shown under your name in rooms, on the leaderboard and on your profile.',
        select: '<div class="sg-gselect is-titles" role="radiogroup" aria-label="Today\u2019s titles">' + m.titles.map(function (t) {
          var on = t === pick;
          var have = titleOwned(t, m.live);
          return '<button type="button" role="radio" aria-checked="' + (on ? 'true' : 'false') + '"' +
            ' class="sg-gtitle' + (on ? ' on' : '') + (have ? ' is-owned' : '') + '" data-title-preview="' + esc(t.id) + '">' +
            esc(t.label || 'Title') + (have ? ' <i aria-label="owned">&#10003;</i>' : '') + '</button>';
        }).join('') + '</div>',
        utils: [utilBtn('&#9819;', 'Equip', 'href="/profile" data-screen="profile"')],
        buy: titleOwned(pick, m.live)
          ? '<button class="sg-gbtn sn-flank is-right is-gold" type="button" disabled><span class="sg-gbtn-label">Owned</span></button>'
          : '<button class="sg-buy sg-gbtn sn-flank is-right is-gold" type="button" data-buy-title="' + esc(pick.id) + '" data-price="' + esc(pick.shopPrice) + '">' +
              '<img src="/img/ui/home-stats/siegecoin.png" alt="">' + esc(pick.shopPrice || 0) + '</button>'
      });
  }

  function arenaArtPanel(m, opts) {
    var skins = m.arenas || [];
    var progression = m.live.progression || {};
    var equippedId = progression.equippedBattlefieldSkinId || '';
    var ownedIds = progression.purchasedBattlefieldSkinIds || [];
    var selected = skins.filter(function (s) { return s.id === opts.arenaSkinPreview; })[0]
      || skins.filter(function (s) { return s.id === equippedId; })[0] || skins[0];
    if (!selected) return '';
    opts.arenaSkinPreview = selected.id;
    var saved = (progression.battlefieldSkins || []).filter(function (s) { return s.id === selected.id; })[0] || {};
    var owned = Boolean(saved.owned || ownedIds.indexOf(selected.id) !== -1);
    var equipped = Boolean(saved.equipped || equippedId === selected.id);
    var locked = selected.collection === 'prestige';
    var eventClosed = selected.collection === 'holiday' && selected.availableForPurchase === false;
    var action = opts.guest
      ? '<button class="sg-guest-primary" type="button" data-arena-buy="' + esc(selected.id) + '">Sign in to collect</button>'
      : owned
        ? '<button class="sg-guest-primary" type="button" data-arena-equip="' + esc(selected.id) + '"' + (equipped ? ' disabled' : '') + '>' + (equipped ? 'Equipped' : 'Equip arena') + '</button>'
        : locked
          ? '<span class="sg-arena-lock">Earn through ' + esc(selected.requirement || selected.achievementId || 'an achievement') + '</span>'
          : eventClosed
            ? '<span class="sg-arena-lock">Available during ' + esc(selected.event || 'the seasonal event') + '</span>'
            : '<button class="sg-guest-primary" type="button" data-arena-buy="' + esc(selected.id) + '"><img src="/img/ui/home-stats/siegecoin.png" alt=""> ' + esc(selected.price || 0) + '</button>';
    var playerArt = selected.artwork || selected.assetUrl || '/img/board-skins/board-neutral.webp';
    return '<section class="sg-arena-gallery" aria-label="Arena art showroom">' +
      '<header class="sg-arena-heading"><span class="sg-gplaque-kicker">BATTLEFIELD COLLECTION</span><h2>Choose your arena</h2><p>Your arena faces the AI’s neutral board. The artwork is only a backdrop; battle cards and hit areas remain separate.</p></header>' +
      '<div class="sg-arena-faceoff">' +
        '<div class="sg-arena-half is-ai"><img src="/img/board-skins/board-neutral.webp" alt="AI side with neutral arena artwork" loading="eager" decoding="async"><span>AI <i>NEUTRAL ARENA</i></span></div>' +
        '<div class="sg-arena-vs" aria-hidden="true"><b>VS</b></div>' +
        '<div class="sg-arena-half is-player"><img src="' + esc(playerArt) + '" alt="' + esc(selected.name || 'Arena') + ' artwork on your side" loading="eager" decoding="async" onerror="this.onerror=null;this.src=\'/img/board-skins/board-neutral.webp\'"><span>YOU <i>' + esc(selected.name || 'ARENA') + '</i></span></div>' +
      '</div>' +
      '<div class="sg-arena-dock"><div class="sg-arena-selected"><div class="sg-arena-copy"><small>' + esc(selected.collection === 'prestige' ? 'PRESTIGE · ACHIEVEMENT' : selected.collection === 'holiday' ? (selected.event || 'SEASONAL').toUpperCase() + ' EVENT' : 'PREMIUM ARENA') + '</small><h3>' + esc(selected.name || 'Battlefield') + '</h3><p>' + esc(selected.description || '') + '</p></div><div class="sg-arena-action">' + action + '</div></div>' +
      '<div class="sg-arena-skins" role="list" aria-label="Arena artworks">' + skins.map(function (skin) {
        return '<button type="button" role="listitem" class="sg-arena-skin' + (skin.id === selected.id ? ' on' : '') + '" data-arena-skin="' + esc(skin.id) + '" aria-pressed="' + (skin.id === selected.id ? 'true' : 'false') + '"><img src="' + esc(skin.thumbnailUrl || skin.thumbnail || '') + '" alt="" loading="lazy" decoding="async"><span>' + esc(skin.name || 'Arena') + '</span></button>';
      }).join('') + '</div>' +
      '</div>' +
    '</section>';
  }

  // Published odds, read straight off the pack payload - the same numbers the
  // server rolls with, never a restatement of them.
  function showOdds(app, pk) {
    var odds = pk.odds || {};
    var finishOdds = odds.finishPerCard || {};
    var rarities = Object.keys(finishOdds);
    // Tiny odds read better as "1 in N" than as a string of zeros.
    function chance(p) {
      if (!p) return '\u2014';
      if (p >= 0.001) return (Math.round(p * 1000) / 10) + '%';
      var n = 1 / p;
      return '1 in ' + (n >= 10000 ? Math.round(n / 1000) + 'k' : (Math.round(n / 100) / 10) + 'k');
    }
    var layer = document.createElement('div');
    layer.className = 'sg-godds';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', (pk.name || 'Pack') + ' odds');
    layer.innerHTML =
      '<div class="sg-godds-card">' +
        '<h3>' + esc(pk.name || pk.id) + '</h3>' +
        '<dl>' +
          '<div><dt>Cards per pack</dt><dd>' + esc(odds.cardsPerPack || 5) + '</dd></div>' +
          (odds.siegeKnight != null ? '<div><dt>Bonus SiegeKnight</dt><dd>' + esc(Math.round(odds.siegeKnight * 1000) / 10) + '%</dd></div>' : '') +
          (odds.siegeKnightPool || []).map(function (k) {
            return '<div class="sg-godds-knight"><dt>' + esc(k.name || k.id) + '</dt><dd>' + esc(chance(k.chance)) + '</dd></div>';
          }).join('') +
          (rarities.length
            ? '<div class="sg-godds-finish"><dt>Finish per card</dt><dd><table>' +
                '<tr><th></th>' + rarities.map(function (r) { return '<th>' + esc(title(r).slice(0, 4)) + '</th>'; }).join('') + '</tr>' +
                ['HOLO', 'SP', 'HSP', 'GOLD', 'CARAT', 'GSP', 'GSPX'].map(function (f) {
                  return '<tr><th class="is-' + f.toLowerCase() + '">' + esc(versionLabel(f)) + '</th>' + rarities.map(function (r) {
                    return '<td>' + esc(chance((finishOdds[r] || {})[f])) + '</td>';
                  }).join('') + '</tr>';
                }).join('') +
              '</table></dd></div>'
            : '') +
          (pk.bulk && pk.bulk.count > 1
            ? '<div><dt>&times;' + esc(pk.bulk.count) + ' bundle</dt><dd>' + esc(pk.bulk.price) + ' coins</dd></div>'
            : '') +
        '</dl>' +
        '<button class="sg-guest-primary" type="button" data-godds-close>Close</button>' +
      '</div>';
    function close() { layer.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    layer.addEventListener('click', function (e) {
      if (e.target === layer || (e.target.closest && e.target.closest('[data-godds-close]'))) close();
    });
    document.addEventListener('keydown', onKey);
    app.appendChild(layer);
    layer.querySelector('[data-godds-close]').focus();
  }

  // "In art": who is in the backdrop. Same dialog shell as the odds; a chip
  // closes it and the app's [data-card] delegation opens the card sheet.
  function showArtCards(app, piece) {
    var layer = document.createElement('div');
    layer.className = 'sg-godds';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Cards in this image');
    layer.innerHTML =
      '<div class="sg-godds-card">' +
        '<h3>Cards in this image</h3>' +
        '<p class="sg-artcards-sub">' + esc(piece.title) + (piece.place ? ' \u00b7 ' + esc(piece.place) : '') + '</p>' +
        '<div class="sg-artcards is-sheet"><div>' + artCardChips(piece) + '</div></div>' +
        '<button class="sg-guest-primary" type="button" data-godds-close>Close</button>' +
      '</div>';
    function close() { layer.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    layer.addEventListener('click', function (e) {
      if (e.target === layer || (e.target.closest && e.target.closest('[data-godds-close], [data-card]'))) close();
    });
    document.addEventListener('keydown', onKey);
    app.appendChild(layer);
    layer.querySelector('[data-godds-close]').focus();
  }

  // One screen, no scroll: the stage fills the viewport behind the top bar and
  // the tab bar, and everything a tab offers is on it.
  function shopScreen(opts) {
    opts = opts || {};
    var m = shopModel(opts);
    var panel = !m.tab ? ''
      : m.tab.id === 'summon' ? summonPanel(m)
      : m.tab.id === 'packs' ? packsPanel(m)
      : m.tab.id === 'daily' ? dailyPanel(m, opts)
      : m.tab.id === 'arenas' ? arenaArtPanel(m, opts)
      : titlesPanel(m, opts);
    var notice = opts.shopNotice
      ? '<p class="sg-shop-notice' + (opts.shopNoticeError ? ' is-error' : '') + '" role="status">' + esc(opts.shopNotice) + '</p>'
      : '';
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-shop"' + (m.tab ? ' data-shop-panel="' + esc(m.tab.id) + '"' : '') + '>' +
          (m.tab
            ? shopTabsMarkup(m) + panel
            : '<section class="sg-gstage is-closed" style="--el:' + color('EARTH') + '">' +
                '<img class="sg-gstage-bg" src="' + sceneArt('armory') + '" alt="">' +
                '<div class="sg-gstage-veil"></div>' +
                '<div class="sg-gstage-body"><header class="sg-gplaque">' +
                  '<h2>The stall is closed</h2>' +
                  '<p>The pack catalog did not answer. Try again in a moment.</p>' +
                '</header></div>' +
              '</section>') +
          notice +
        '</div>' +
      '</div>' +
      sheetHost() +
      bottomMarkup('shop', opts);
  }

  /* ---------- art gallery ----------
     "From the Gallery" on the home screen showed five scenes and its See All
     went nowhere. This is the whole collection in the same style: the cinematic
     gallery scenes plus the original site's loading-art library, which
     loading-art.js already pools and caches from /api/art/loading. Tapping a
     plate opens it full-bleed with its title. No pagination and no filters -
     it is an art gallery, so the art is the interface. */

  function galleryPieces() {
    var art = (window.SiegelingsLoadingArt && window.SiegelingsLoadingArt.pool()) || [];
    return art.map(function (piece) {
      return {
        id: piece.id,
        title: piece.title || title(piece.id),
        place: piece.place || '',
        thumb: piece.landscape || piece.portrait || '',
        full: piece.portrait || piece.landscape || '',
        landscape: piece.landscape || '',
        portrait: piece.portrait || '',
        cards: piece.cards || [],
        shop: piece.shop || [],
        focus: piece.focus || ''
      };
    }).filter(function (p) { return p.thumb; });
  }

  /* ---------- cards in the art ----------
     Designers tag each gallery piece in the dashboard with the cards it shows
     and the shop stages it backs (ArtCardTagService, merged into
     /api/art/loading). The tags are what let a scene say who is in it, and let
     the shop choose art by what it is selling instead of a hard-coded table -
     the tables below stay as the fallback for untagged stages. */

  function artPiece(id) {
    var key = String(id || '').toLowerCase();
    return galleryPieces().filter(function (p) { return String(p.id).toLowerCase() === key; })[0] || null;
  }

  // byId() falls back to the first card, which would put a stranger in the art.
  function artCards(piece) {
    return ((piece && piece.cards) || []).map(function (id) {
      return byIdIn(ALL_CARDS, id) || byIdIn(CARDS, id);
    }).filter(Boolean);
  }

  function artForSlot(slot) {
    return galleryPieces().filter(function (p) { return p.shop.indexOf(slot) !== -1; })[0] || null;
  }

  // The scene most about this card: of the pieces that show it, the one with
  // the fewest other cards in frame.
  function artForCard(cardId) {
    var best = null;
    galleryPieces().forEach(function (p) {
      if (p.cards.indexOf(cardId) === -1) return;
      if (!best || p.cards.length < best.cards.length) best = p;
    });
    return best;
  }

  // A tagged piece as a shop backdrop; the tall file on a tall screen, like heroPlate.
  function pieceStage(p, thumb) {
    var art = !thumb && p.portrait && isPortraitScreen() ? p.portrait : (p.landscape || p.portrait);
    return { art: art, pos: p.focus || '50% 50%', piece: p };
  }

  function chipArtAttrs(url, fallback) {
    var attrs = artAttrs(url, 96);
    var failed = 'this.src=\'' + esc(fallback) + '\'';
    return attrs.indexOf('onerror="sgWebpFallback(this)"') >= 0
      ? attrs.replace('onerror="sgWebpFallback(this)"', 'onerror="sgWebpFallback(this);if(!this.onerror){this.onerror=null;' + failed + '}"')
      : attrs + ' onerror="this.onerror=null;' + failed + '"';
  }

  function artCardChips(piece) {
    return artCards(piece).map(function (c) {
      return '<button class="sg-artcard" type="button" data-card="' + esc(c.id) + '"' +
        ' style="--el:' + color(c.element) + ';--rar:' + rarityColor(c.rarity) + '">' +
        // A 32px face: the smallest Storage cut, and the element icon if
        // there is no art or every fallback fails.
        (c.cardArtUrl
          ? '<img ' + chipArtAttrs(c.cardArtUrl, icon(c.element)) + ' alt="" loading="lazy">'
          : '<img src="' + esc(icon(c.element)) + '" alt="" loading="lazy">') +
        '<em>' + esc(c.name || c.id) + '</em></button>';
    }).join('');
  }

  function artScreen(opts) {
    opts = opts || {};
    var pieces = galleryPieces();
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-page-head"><h2>The Gallery</h2><p>' +
          esc(pieces.length) + ' piece' + (pieces.length === 1 ? '' : 's') + '</p></div>' +
        // Every piece is on view here, earned or not; achievements decide only
        // what can be hung on the binder or the profile.
        (pieces.length
          ? '<div class="sg-art-grid" data-art-grid>' + pieces.map(function (p, i) {
              return '<button class="sg-art" type="button" data-art="' + i + '">' +
                '<img ' + artAttrs(p.thumb, 480) + ' alt="' + esc(p.title) + '" loading="lazy">' +
                '<span class="sg-art-veil"></span>' +
                '<span class="sg-art-foot"><strong>' + esc(p.title) + '</strong>' +
                  (p.place ? '<em>' + esc(p.place) + '</em>' : '') + '</span>' +
              '</button>';
            }).join('') + '</div>'
          : '<div class="sg-empty-row">The gallery has not loaded yet.</div>') +
        '<div style="height:96px"></div>' +
      '</div>' +
      '<div class="sg-lightbox" data-lightbox hidden>' +
        '<img data-lightbox-img alt="">' +
        '<div class="sg-lightbox-foot" data-lightbox-foot></div>' +
        '<button class="sg-lightbox-close" type="button" data-lightbox-close aria-label="Close">\u00d7</button>' +
      '</div>' +
      sheetHost() +
      bottomMarkup('collection', opts);
  }

  function mountArt(app, opts) {
    // A tagged card opens the same sheet the binder does, over the lightbox.
    mountSheet(app, opts || {});
    var grid = app.querySelector('[data-art-grid]');
    var box = app.querySelector('[data-lightbox]');
    if (!box) return;
    var img = box.querySelector('[data-lightbox-img]');
    var foot = box.querySelector('[data-lightbox-foot]');
    var pieces = galleryPieces();

    function close() { box.hidden = true; img.removeAttribute('src'); }
    box.querySelector('[data-lightbox-close]').addEventListener('click', close);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !box.hidden) close();
    });

    if (!grid) return;
    grid.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-art]') : null;
      if (!btn) return;
      var p = pieces[Number(btn.getAttribute('data-art'))];
      if (!p) return;
      img.src = p.full;
      img.alt = p.title;
      // Read by id at tap time: the background refresh may have brought tags
      // the grid's own snapshot of the pool did not have.
      var chips = artCardChips(artPiece(p.id) || p);
      foot.innerHTML = '<strong>' + esc(p.title) + '</strong>' + (p.place ? '<em>' + esc(p.place) + '</em>' : '') +
        (chips ? '<div class="sg-artcards"><span>Cards in this image</span><div>' + chips + '</div></div>' : '');
      box.hidden = false;
    });
  }

  /* ---------- card detail sheet ----------
     Tapping a Featured Siegeling did nothing. It now opens the same sheet the
     binder uses, widened to the three places a Siegeling actually exists:

       Arena  - health, speed, preferred row, its notch ring and its abilities
                with the energy each one costs. All printed on the card.
       Siege  - the abilities a Siegeling carries become the cards it plays in an
                expedition, and an evolution is a real progression, so both are
                named. Nothing about AP is claimed: the Siege engine derives that
                server-side and the catalog does not carry it.
       Keep   - real only when this Siegeling is a resident of YOUR Keep, in which
                case its rapport level and the bonus it is granting come straight
                from /api/keep. Otherwise the sheet says it is not in residence
                rather than inventing a buff.

     It also shows the composed card face rather than the bare art, because that
     is the object the player recognises. */

  // Eight directions, not four: the catalog uses the four edges AND the four
  // corners (TOP_LEFT … BOTTOM_RIGHT). Filtering to the edges alone silently
  // dropped two thirds of a card's notches - Dracosleaf's six read as two.
  var NOTCH_EDGES = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'];
  // Half of the 16px art, so each notch straddles the edge the way it does on a
  // real card rather than sitting inside it.
  var NOTCH_CORNER = {
    TOP_LEFT:     'top:-9px;left:-9px',
    TOP_RIGHT:    'top:-9px;right:-9px',
    BOTTOM_LEFT:  'bottom:-9px;left:-9px',
    BOTTOM_RIGHT: 'bottom:-9px;right:-9px'
  };

  // The ring draws the actual notch art rather than a coloured dot: this is the
  // mark a player matches edge-to-edge on the table, so the sheet shows the same
  // thing the card does - and the same way. The art is a square plate whose
  // content is a round token, so style.css composites it as a background on a
  // circular element over the element colour (`.notch-dot[style*="--notch-icon"]`)
  // rather than drawing it as a bare <img>, which would show the plate's corners.
  function notchDot(n, style) {
    return '<i class="sg-sheet-notch" style="--notch:' + color(n.element) +
      ';--notch-icon:url(\'' + icon(n.element) + '\');' + style +
      '" title="' + esc(title(n.element) + ' ' + title(n.direction)) + '"></i>';
  }

  function notchRing(card) {
    var notches = (card.notches || []).filter(function (n) {
      var d = String((n && n.direction) || '').toUpperCase();
      return NOTCH_EDGES.indexOf(d) !== -1 || NOTCH_CORNER[d];
    });
    if (!notches.length) return '';
    var dots = '';
    // A corner holds one notch, so it is placed directly.
    notches.forEach(function (n) {
      var d = String(n.direction).toUpperCase();
      if (NOTCH_CORNER[d]) dots += notchDot(n, NOTCH_CORNER[d]);
    });
    // An edge can hold several, so they are spread along it rather than stacked
    // on the midpoint.
    NOTCH_EDGES.forEach(function (edge) {
      var onEdge = notches.filter(function (n) {
        return String(n.direction).toUpperCase() === edge;
      });
      onEdge.forEach(function (n, i) {
        var at = ((i + 1) / (onEdge.length + 1) * 100).toFixed(1) + '%';
        var style = (edge === 'TOP' || edge === 'BOTTOM')
          ? (edge === 'TOP' ? 'top:-9px;' : 'bottom:-9px;') + 'left:' + at + ';transform:translateX(-50%)'
          : (edge === 'LEFT' ? 'left:-9px;' : 'right:-9px;') + 'top:' + at + ';transform:translateY(-50%)';
        dots += notchDot(n, style);
      });
    });
    return '<div class="sg-sheet-notches" aria-label="Notches">' + dots +
      '<span>' + notches.length + ' notch' + (notches.length === 1 ? '' : 'es') + '</span></div>';
  }

  function abilityRows(card) {
    var abilities = card.abilities || (card.ability ? [card.ability] : []);
    if (!abilities.length) return '<p class="sg-sheet-empty">No printed ability.</p>';
    return abilities.map(function (a) {
      var cost = a.requiredEnergy;
      return '<div class="sg-sheet-ability">' +
        '<strong><span class="sg-sheet-move-name">' + esc(a.name || 'Ability') + '</span>' +
          (a.passive ? '<em class="sg-sheet-pill">Passive</em>' : '') +
          (cost ? '<em class="sg-sheet-cost">' + esc(cost) + ' energy</em>' : '') +
        '</strong>' +
        (a.description ? '<span>' + esc(a.description) + '</span>' : '') +
      '</div>';
    }).join('');
  }

  // ---- Keep: what this Siegeling gives the Keep, and what it is giving now ----
  // Two different facts, and both are real. The affinity guide
  // (/api/keep/affinities) is account-free game data - which stations this
  // element helps at and by how much - so it shows for a guest too. The rapport
  // block only appears when this card is actually a resident of YOUR Keep.
  function keepBlock(card, opts) {
    var el = String(card.element || '').toUpperCase();
    var stations = (opts.live && opts.live.keepAffinities) || null;
    var out = '';

    if (stations) {
      var helps = [];
      stations.forEach(function (st) {
        var has = (st.elements || []).indexOf(el) !== -1;
        var pct = has ? st.affinityPercent : (el === 'NEUTRAL' ? st.neutralPercent : 0);
        if (pct) helps.push({ name: st.name, resource: st.resourceName, pct: pct, affinity: has });
      });
      out += helps.length
        ? '<div class="sg-sheet-rows">' + helps.map(function (h) {
            return '<div class="sg-sheet-row">' +
              '<span class="sg-sheet-row-name">' + esc(h.name) +
                (h.resource ? '<em>' + esc(h.resource) + '</em>' : '') + '</span>' +
              '<b class="sg-sheet-row-val">+' + esc(h.pct) + '%</b>' +
            '</div>';
          }).join('') + '</div>'
        : '<p class="sg-sheet-empty">' + esc(title(el)) +
          ' grants no station bonus at the Keep.</p>';
    } else {
      out += '<p class="sg-sheet-empty">Station bonuses are unavailable right now.</p>';
    }

    var residents = (opts.live && opts.live.keepResidents) || null;
    var res = residents ? residents.filter(function (r) { return r && r.id === card.id; })[0] : null;
    if (res) {
      var rap = res.rapport || {};
      var bits = '';
      // assignment is {assigned, type, id, label} from KeepService — never stringify the object.
      var posted = '';
      if (typeof res.assignment === 'string') {
        posted = res.assignment;
      } else if (res.assignment && res.assignment.assigned) {
        posted = res.assignment.label || 'Keep post';
      }
      if (posted) bits += '<div><span>Posted</span><b>' + esc(posted) + '</b></div>';
      if (rap.label) bits += '<div><span>Rapport</span><b>' + esc(rap.label) + '</b></div>';
      if (rap.buffPercent != null) bits += '<div><span>Rapport bonus</span><b>+' + esc(rap.buffPercent) + '%</b></div>';
      out += '<div class="sg-sheet-sub">In residence</div>' +
        (bits ? '<div class="sg-sheet-stats">' + bits + '</div>'
              : '<p class="sg-sheet-empty">Granting no bonus yet.</p>');
    } else if (!opts.guest) {
      out += '<p class="sg-sheet-note">Not in residence at your Keep.</p>';
    }
    return out;
  }

  // ---- Siege: the cards this Siegeling brings, and the Advantage rider each
  // gains while it holds the token. The rider table comes from the server
  // (/api/siege/advantage-riders) rather than a copy of SiegeAdvantage in JS.
  // An explicit table, not a substring test. Matching on 'ENEMY' missed
  // ALL_ENEMIES and ROW_ENEMIES - which spell it "ENEMIES" - so every row and
  // board-wide card silently lost its rider; and matching 'ALL' would have
  // claimed ALL_ENEMIES as friendly. TargetType is a closed enum, so it is
  // listed. PASSIVE has no target and takes no rider.
  var TARGET_SIDE = {
    SINGLE_ENEMY: false, ALL_ENEMIES: false, ROW_ENEMIES: false,
    ROW_SELECT_ENEMIES: false, ENEMY_PLAYER: false,
    SINGLE_ALLY: true, ALL_ALLIES: true, ROW_ALLIES: true,
    ROW_SELECT_ALLIES: true, SELF: true
  };

  function friendlyTarget(targetType) {
    var t = String(targetType || '').toUpperCase();
    return Object.prototype.hasOwnProperty.call(TARGET_SIDE, t) ? TARGET_SIDE[t] : null;
  }

  function isKnight(card) {
    return String(card && card.type || '').toUpperCase() === 'SIEGEKNIGHT';
  }

  function knightAbility(name, pill, cost, text) {
    return '<div class="sg-sheet-ability">' +
      '<strong><span class="sg-sheet-move-name">' + esc(name) + '</span>' +
        (pill ? '<em class="sg-sheet-pill">' + esc(pill) + '</em>' : '') +
        (cost ? '<em class="sg-sheet-cost">' + esc(cost) + '</em>' : '') +
      '</strong>' +
      (text ? '<span>' + esc(text) + '</span>' : '') +
    '</div>';
  }

  // A knight never enters play, so the Arena panel is its passive and its
  // active rather than notches and moves. The text is /api/game/options' own,
  // so it is the same copy the battle table's trainer panel quotes.
  function knightArenaBlock(card) {
    var out = '';
    if (card.passive) out += knightAbility(card.passiveName || 'Passive', 'Passive', null, card.passive);
    if (card.active) {
      out += knightAbility(card.activeName || 'Active', card.oncePerGame ? 'Once per game' : 'Once per turn',
        card.activeEnergy ? card.activeEnergy + ' energy' : null, card.active);
    }
    return out || '<p class="sg-sheet-empty">No Arena abilities listed.</p>';
  }

  /* Siege runs its knights through a different kit - a class passive, a
     combat active and an Ultimate - and those only exist server-side in
     /api/siege/roster. That call reads the account's veterans and progression,
     so it is fetched the first time a knight sheet opens rather than on every
     hub load, and cached for the page. Undefined = not asked yet, null = asked
     and failed. */
  var siegeKnights;
  var siegeKnightsPending = null;

  function loadSiegeKnights() {
    if (siegeKnights !== undefined) return Promise.resolve(siegeKnights);
    if (siegeKnightsPending) return siegeKnightsPending;
    var api = window.SiegelingsHomeLive;
    if (!api || !api.get) { siegeKnights = null; return Promise.resolve(null); }
    siegeKnightsPending = api.get('/api/siege/roster').then(function (roster) {
      siegeKnightsPending = null;
      if (!roster || !Array.isArray(roster.knights)) { siegeKnights = null; return null; }
      siegeKnights = {};
      roster.knights.forEach(function (k) {
        if (k && k.id) siegeKnights[String(k.id).toLowerCase()] = k;
      });
      return siegeKnights;
    });
    return siegeKnightsPending;
  }

  function knightSiegeBlock(card) {
    if (siegeKnights === undefined) {
      return '<p class="sg-sheet-note" data-knight-siege-loading>Loading Siege abilities…</p>';
    }
    if (siegeKnights === null) {
      return '<p class="sg-sheet-empty">Siege abilities are unavailable right now.</p>';
    }
    var k = siegeKnights[String(card.id || '').toLowerCase()];
    if (!k) return '<p class="sg-sheet-empty">Does not lead expeditions.</p>';
    var notes = [];
    if (k.startingParty) notes.push('Leads a warband of ' + k.startingParty);
    // The roster scales the passive and Ultimate to this account's level, so
    // say which level the numbers are quoted at.
    if (k.level) notes.push('Values at level ' + k.level);
    var active = k.active || {};
    return (notes.length ? '<p class="sg-sheet-note">' + esc(notes.join(' · ')) + '</p>' : '') +
      (k.passive ? knightAbility(k.passiveName || 'Passive', 'Passive', null, k.passive) : '') +
      (k.activeDesc ? knightAbility(k.activeName || active.name || 'Active', 'Active',
        active.actionCost ? active.actionCost + ' AP' : null, k.activeDesc) : '') +
      (k.ultimateDesc ? knightAbility(k.ultimateName || 'Ultimate', 'Ultimate', null, k.ultimateDesc) : '');
  }

  function siegeBlock(card, opts) {
    if (isKnight(card)) return knightSiegeBlock(card);
    var abilities = card.abilities || (card.ability ? [card.ability] : []);
    var riders = (opts.live && opts.live.advantageRiders) || null;
    var rider = riders && riders[String(card.element || '').toUpperCase()];
    var meta = [];
    if (card.evolvesFromName) meta.push('Evolves from ' + card.evolvesFromName);
    if (card.preferredRow) meta.push('Fields to the ' + String(card.preferredRow).toLowerCase() + ' row');

    if (!abilities.length) {
      return '<p class="sg-sheet-empty">Brings no cards of its own to an expedition.</p>' +
        (meta.length ? '<p class="sg-sheet-note">' + esc(meta.join(' \u00b7 ')) + '</p>' : '');
    }

    return (meta.length ? '<p class="sg-sheet-note">' + esc(meta.join(' \u00b7 ')) + '</p>' : '') +
      abilities.map(function (a) {
        var friendly = friendlyTarget(a.targetType);
        var text = rider ? (friendly === true ? rider.friendly
                          : friendly === false ? rider.enemy : null) : null;
        return '<div class="sg-sheet-ability">' +
          '<strong><span class="sg-sheet-move-name">' + esc(a.name || 'Card') + '</span>' +
            (a.requiredEnergy ? '<em class="sg-sheet-cost">' + esc(a.requiredEnergy) + ' energy</em>' : '') +
          '</strong>' +
          (a.description ? '<span>' + esc(a.description) + '</span>' : '') +
          (text ? '<span class="sg-sheet-rider"><i>Advantage</i>' + esc(text) + '</span>' : '') +
        '</div>';
      }).join('') +
      (rider ? '' : '<p class="sg-sheet-note">Advantage riders are unavailable right now.</p>');
  }

  /* ---------- evolution line ----------
     A card only ever states the one link backwards (`evolvesFromId`), so the
     rest of its family has to be recovered from the catalog: walk that pointer
     up to the base, then scan for whoever points at each card in turn to walk
     down. Lines in the catalog are strictly linear and at most three stages, so
     the chain is a list rather than a tree - but both walks carry a seen-set,
     because a dashboard edit can point a card at itself or at its own
     descendant, and a hung sheet is far worse than a short chain. */
  function evolutionLine(card) {
    if (!card || !card.id) return null;
    if (String(card.type || '').toUpperCase() !== 'SIEGLING') return null;
    var pool = (ALL_CARDS && ALL_CARDS.length) ? ALL_CARDS : CARDS;
    if (!pool || !pool.length) return null;

    var seen = {};
    seen[card.id] = true;
    var chain = [card];

    var cur = card;
    while (cur && cur.evolvesFromId && !seen[cur.evolvesFromId]) {
      var prev = byIdIn(pool, cur.evolvesFromId);
      if (!prev) break;
      seen[prev.id] = true;
      chain.unshift(prev);
      cur = prev;
    }

    cur = card;
    while (cur) {
      var next = null;
      for (var i = 0; i < pool.length; i++) {
        var c = pool[i];
        if (c && c.id && c.evolvesFromId === cur.id && !seen[c.id]) { next = c; break; }
      }
      if (!next) break;
      seen[next.id] = true;
      chain.push(next);
      cur = next;
    }

    return chain.length > 1 ? chain : null;
  }

  /* The binder tile rather than a bare <img>: at this size the frame, notches
     and rarity treatment are what make a stage recognisable, and reusing the
     production renderer is what keeps these thumbnails from drifting the next
     time a frame changes. No [data-card] button around it - these sit inside
     the sheet, where that delegation is deliberately skipped. */
  function evolutionThumb(c) {
    var visual = window.SieglingsCardBinderVisual;
    if (visual && visual.renderBinderCardTile) {
      return visual.renderBinderCardTile(c, { descriptionText: cardFaceText(c) });
    }
    return '<img ' + artAttrs(c.cardArtUrl || '') + ' alt="" loading="lazy">';
  }

  /* The head-corner preview. Deliberately the raw cutout rather than
     `renderCardRowThumb`, which answers an element icon for OVERLAY art - and
     OVERLAY is what nearly every Siegeling uses, so all three stages would have
     come back as the same icon and previewed nothing. A 26px creature
     silhouette is the one thing that reads at this size. */
  function evolutionPeekThumb(c) {
    var art = String(c && c.cardArtUrl || '').trim();
    if (art) return '<img src="' + esc(art) + '" alt="" loading="lazy">';
    return '<img src="' + esc(icon(c && c.element)) + '" alt="" loading="lazy">';
  }

  function evolutionPeek(card) {
    var chain = evolutionLine(card);
    if (!chain) return '';
    return '<button class="sg-sheet-evopeek" type="button" data-sheet-goto="evolution" ' +
      'aria-label="View the evolution line for ' + esc(card.name) + ' \u2014 ' + chain.length + ' stages">' +
      '<span class="sg-sheet-evopeek-thumbs">' + chain.map(function (c) {
        return '<span class="sg-sheet-evopeek-thumb' + (c.id === card.id ? ' is-here' : '') + '">' +
          evolutionPeekThumb(c) + '</span>';
      }).join('') + '</span>' +
      '<span class="sg-sheet-evopeek-label">' + chain.length + ' stages \u203a</span>' +
    '</button>';
  }

  /* The chain thumbnails are 92px wide. The frame's own title sizing is relative
     to a full-size card, so at that width a name like "Chilldoe" wrapped to two
     lines and pushed the printed layout apart. No single font-size fits every
     name, so measure: nowrap, then step down until it fits. Runs when the panel
     becomes visible rather than at render, because a hidden panel measures zero
     and every name would appear to fit. */
  function fitEvolutionNames(root) {
    var titles = root.querySelectorAll('.sg-sheet-evo-art .card-title');
    [].forEach.call(titles, function (t) {
      t.style.whiteSpace = 'nowrap';
      t.style.fontSize = '';
      if (!t.clientWidth) return;
      var size = parseFloat(window.getComputedStyle(t).fontSize);
      if (!size) return;
      var guard = 0;
      // A floor, not "shrink until it fits": the title box is 53px, so the
      // catalog's longest line member ("CactyJacked'ty") would end up around 5px
      // and unreadable. It ellipsises below 8px instead - the caption under the
      // thumbnail carries the full name anyway, so nothing is actually lost.
      while (t.scrollWidth > t.clientWidth + 0.5 && size > 8 && guard++ < 30) {
        size -= 0.5;
        t.style.fontSize = size + 'px';
      }
    });
  }

  function evolutionBlock(card) {
    var chain = evolutionLine(card);
    if (!chain) return '';
    var steps = chain.map(function (c, i) {
      var here = c.id === card.id;
      // "Stage 2 · this card" wrapped to two lines and made the current tile
      // taller than the ones either side of it, which broke the row's read as a
      // single chain. The stage number is already implied by its position.
      var stage = here ? 'This card' : 'Stage ' + (i + 1);
      var inner =
        '<span class="sg-sheet-evo-art">' + evolutionThumb(c) + '</span>' +
        '<span class="sg-sheet-evo-name">' + esc(c.name) + '</span>' +
        '<span class="sg-sheet-evo-stage">' + esc(stage) + '</span>';
      return '<li class="sg-sheet-evo-step' + (here ? ' is-here' : '') + '">' + (here
        ? '<span class="sg-sheet-evo-card" aria-current="true">' + inner + '</span>'
        : '<button class="sg-sheet-evo-card" type="button" data-sheet-evo="' + esc(c.id) + '" ' +
          'aria-label="View ' + esc(c.name) + '">' + inner + '</button>') + '</li>';
    });
    return '<div class="sg-sheet-evo">' +
      '<div class="sg-sheet-evo-head">Evolution line' +
        '<span>' + chain.length + ' stages</span></div>' +
      '<ol class="sg-sheet-evo-chain">' +
        steps.join('<li class="sg-sheet-evo-arrow" aria-hidden="true">\u203a</li>') +
      '</ol></div>';
  }

  // Three tabs, not one long scroll. The sheet was taller than the phone: the
  // card face was cut off at the top and Keep sat below the fold. Each panel is
  // now short enough to read whole, so the sheet is a fixed-height card with one
  // panel visible at a time and the face always in view.
  var SHEET_TABS = [['arena', 'Arena'], ['siege', 'Siege'], ['keep', 'Keep']];

  // Evolution earns a tab only when there is a line to put in it, so a card
  // that evolves from nothing and into nothing still shows the same three.
  function sheetTabsFor(card) {
    return evolutionLine(card)
      ? SHEET_TABS.concat([['evolution', 'Evolution']])
      : SHEET_TABS;
  }

  function cardSheetMarkup(card, opts) {
    var notches = notchRing(card);
    var description = cardFaceText(card);
    var tabs = sheetTabsFor(card);
    var peek = evolutionPeek(card);
    // Face type drives whether the 108px print shows a description: Siegelings
    // keep HP/SPD only (Arena lists the flavour); Strategies/Deceptions keep
    // the effect in that slot.
    var faceType = String(card.type || 'SIEGLING').toUpperCase();
    var knight = isKnight(card);
    return '<button class="sg-sheet-dismiss" type="button" aria-label="Close card details"></button>' +
      '<div class="sg-sheet-head">' +
        '<div class="sg-sheet-face" data-face-type="' + esc(faceType) + '">' +
          sheetFaceMarkup(card, bestVersion(card), 'arena') + '</div>' +
        '<div class="sg-sheet-id">' +
          '<div class="sg-sheet-idtop' + (peek ? ' has-peek' : '') + '">' +
            '<div class="sg-sheet-idname">' +
              '<h3>' + esc(card.name) + '</h3>' +
              '<div class="sg-sheet-meta"><img src="' + esc(icon(card.element)) + '" alt="">' +
                esc(title(card.element)) + ' \u00b7 ' + esc(title(card.rarity)) + '</div>' +
            '</div>' +
            peek +
          '</div>' +
          '<div class="sg-sheet-stats is-tight">' + (knight
            // A knight has no Health, Speed or row - it never takes the board -
            // so its slots carry what does vary between knights.
            ? '<div><span>Tier</span><b>' + esc(card.tier || 'Knight') + '</b></div>' +
              '<div><span>Level</span><b>' + esc(card.owned && card.level ? card.level : '\u2014') + '</b></div>' +
              '<div><span>Active</span><b>' + (card.active ? (card.oncePerGame ? '1/game' : '1/turn') : '\u2014') + '</b></div>'
            : '<div><span>HP</span><b>' + esc(card.health == null ? '\u2014' : card.health) + '</b></div>' +
              '<div><span>SPD</span><b>' + esc(card.speed == null ? '\u2014' : card.speed) + '</b></div>' +
              '<div><span>Row</span><b>' + esc(card.preferredRow ? title(card.preferredRow) : '\u2014') + '</b></div>') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="sg-sheet-tabs' + (tabs.length > 3 ? ' is-four' : '') + '" role="tablist">' + tabs.map(function (t, i) {
        return '<button class="sg-sheet-tab' + (i === 0 ? ' on' : '') + '" type="button" role="tab" ' +
          'aria-selected="' + (i === 0) + '" data-sheet-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="sg-sheet-panels">' +
        '<div class="sg-sheet-panel" data-sheet-panel="arena">' +
          (knight
            ? (card.description ? '<p class="sg-sheet-note">' + esc(card.description) + '</p>' : '') +
              knightArenaBlock(card)
            : (description ? '<div class="sg-sheet-summary">' + notches +
                '<p class="sg-sheet-description">' + esc(description) + '</p></div>' : notches) +
              abilityRows(card)) +
        '</div>' +
        '<div class="sg-sheet-panel" data-sheet-panel="siege" hidden>' +
          siegeBlock(card, opts) +
        '</div>' +
        '<div class="sg-sheet-panel" data-sheet-panel="keep" hidden>' +
          keepBlock(card, opts) +
        '</div>' +
        (tabs.length > 3
          ? '<div class="sg-sheet-panel" data-sheet-panel="evolution" hidden>' +
              evolutionBlock(card) +
            '</div>'
          : '') +
      '</div>' +
      holoBlock(card, opts) +
      '<a class="sg-sheet-cta" href="/deck-builder" data-screen="builder">Use in a deck \u203a</a>';
  }

  /* ---------- card finishes ----------
     The ladder (CardFinish on the server): Standard -> Holo (a plain sheen over
     the standard art) -> SP (the card's holo art; only cards that have some) ->
     HSP (holo art plus the rainbow foil) -> GOLD (the standard art on a gold
     card) -> CARAT (the standard art cast in gold) -> GSP (the SP art on a gold
     card) -> GSPx (the SP art cast in gold, notches left in colour). GSP and
     GSPx show the standard art on a card with no SP art yet. Each tier has a
     cumulative price in craft-cost multiples and a step costs the difference,
     so climbing one at a time costs what jumping does. Packs and other card
     grants can drop any finish too. The server re-checks ownership, balance and
     the starter pack, so this only decides what to offer. */
  var CRAFT_COST = { COMMON: 500, UNCOMMON: 1000, RARE: 2000, EPIC: 4000, LEGENDARY: 8000 };
  var FINISH_LADDER = [
    { key: 'STANDARD', label: 'Standard', name: 'Standard', total: 0 },
    { key: 'HOLO', label: 'Holo', name: 'Holographic', total: 1 },
    { key: 'SP', label: 'SP', name: 'Special', total: 2 },
    { key: 'HSP', label: 'HSP', name: 'Holographic Special', total: 4 },
    { key: 'GOLD', label: 'Gold', name: 'Gold', total: 6 },
    { key: 'CARAT', label: 'CARAT', name: 'Carat', total: 9 },
    { key: 'GSP', label: 'GSP', name: 'Gold Special', total: 12 },
    { key: 'GSPX', label: 'GSPx', name: 'Gold Special Cast', total: 28 }
  ];

  function finishIndex(key) {
    for (var i = 0; i < FINISH_LADDER.length; i++) if (FINISH_LADDER[i].key === key) return i;
    return 0;
  }

  function craftCost(card) {
    return CRAFT_COST[String(card && card.rarity || 'COMMON').toUpperCase()] || CRAFT_COST.COMMON;
  }

  function hasHoloArtwork(card) {
    return Boolean(String(card && card.holographicCardArtUrl || '').trim());
  }

  // Every version a card can be looked at in; SP only exists with holo art.
  function versionsFor(card) {
    return FINISH_LADDER.filter(function (v) { return v.key !== 'SP' || hasHoloArtwork(card); });
  }

  function isGoldKey(key) {
    return key === 'GOLD' || key === 'CARAT' || key === 'GSP' || key === 'GSPX';
  }

  function versionLabel(key) {
    return FINISH_LADDER[finishIndex(key)].label;
  }

  // The finish the player's own copy shows everywhere else in the hub.
  function bestVersion(card) {
    if (!card) return 'STANDARD';
    if (card.holoGoldFinish === true || hasPlayerHoloGold(card)) return 'GSPX';
    if (card.goldFinish === true || hasPlayerGold(card)) return 'GSP';
    if (card.caratFinish === true || hasPlayerCarat(card)) return 'CARAT';
    if (card.plainGoldFinish === true || hasPlayerPlainGold(card)) return 'GOLD';
    if (card.holographic === true || hasPlayerHolo(card)) return 'HSP';
    if (hasHoloArtwork(card) && hasPlayerHoloArt(card)) return 'SP';
    if (card.holoPlainFinish === true || hasPlayerHoloPlain(card)) return 'HOLO';
    return 'STANDARD';
  }

  // What the next purchase is for this card, or null at the top of the ladder.
  function nextHoloStep(card) {
    var current = finishIndex(bestVersion(card));
    var next = versionsFor(card).filter(function (v) { return finishIndex(v.key) > current; })[0];
    if (!next) return null;
    return {
      tier: next.key,
      cost: craftCost(card) * (next.total - FINISH_LADDER[current].total),
      label: (current === 0 ? 'Make ' : 'Upgrade to ') + next.label
    };
  }

  function holoButtonLabel(step) {
    return '✦ ' + step.label + ' · ' + step.cost.toLocaleString() + ' remnants';
  }

  // Each tier includes the ones below it. null when ownership is unknown
  // (guest, offline board): no locks are drawn then.
  function versionOwned(card, key, opts) {
    var live = opts && opts.live;
    var isOwned = live && !opts.guest ? binderOwnership(live) : null;
    if (!isOwned) return null;
    if (!isOwned(card)) return false;
    return finishIndex(key) <= finishIndex(bestVersion(card));
  }

  function copyCard(card, extra) {
    var out = {};
    for (var key in card) if (Object.prototype.hasOwnProperty.call(card, key)) out[key] = card[key];
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    return out;
  }

  // One version of a card, rendered with the same production renderer the
  // binder uses but independent of what this account owns.
  function versionFace(card, key) {
    var visual = window.SieglingsCardBinderVisual;
    if (!visual || !visual.renderBinderCardTile) return galleryCard(card);
    // The `finish` stamp is what the shared showcase renderer (game.js) treats
    // as the whole truth; without it, a false flag falls back to this account's
    // finish lists, so the Standard face would wear the player's holo or SP art.
    var base = copyCard(card, {
      holographic: key === 'HSP', plainGoldFinish: key === 'GOLD', caratFinish: key === 'CARAT',
      goldFinish: key === 'GSP', holoGoldFinish: key === 'GSPX', holoPlainFinish: key === 'HOLO',
      finish: key === 'STANDARD' ? '' : key
    });
    var inner;
    if (isKnight(card)) {
      inner = knightCard(base);
    }
    if (!inner) {
      inner = visual.renderBinderCardTile(base, {
        descriptionText: cardFaceText(card),
        useHolographicFullCardArt: finishIndex(key) >= finishIndex('SP'),
        playerHoloArtIds: key === 'SP' ? [String(card.id || '').toLowerCase()] : []
      });
    }
    return '<button class="sg-card-tile" type="button" data-card="' +
      esc(card.id) + '" data-version="' + key + '">' + inner + '</button>';
  }

  var LOCK_GLYPH = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" fill="currentColor">' +
    '<path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h.5A1 1 0 0 1 13 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1.6 0h3.8V5a1.9 1.9 0 0 0-3.8 0z"/></svg>';

  function versionsRow(card, viewing, opts) {
    return '<div class="sg-sheet-versions" role="group" aria-label="Card versions">' +
      versionsFor(card).map(function (v) {
        var owned = versionOwned(card, v.key, opts);
        var cls = 'sg-sheet-version' + (v.key === viewing ? ' on' : '') +
          (owned === true ? ' is-owned' : owned === false ? ' is-locked' : '') +
          (isGoldKey(v.key) ? ' is-gold' : v.key === 'HSP' ? ' is-holo' : v.key === 'HOLO' ? ' is-holo-lite' : '');
        return '<button class="' + cls + '" type="button" data-sheet-version="' + v.key + '"' +
          ' aria-pressed="' + (v.key === viewing) + '" title="' + esc(v.name) + '"' +
          (owned === false ? ' aria-label="' + esc(v.label) + ' (not owned)"' : '') + '>' +
          (owned === false ? LOCK_GLYPH : '') + esc(v.label) + '</button>';
      }).join('') +
    '</div>';
  }

  function holoBlock(card, opts, viewing) {
    var live = opts && opts.live;
    var out = '<div class="sg-sheet-holo">' + versionsRow(card, viewing || bestVersion(card), opts);
    // Cards that ship foil have nothing to buy; guests and the offline board
    // cannot spend remnants.
    var isOwned = live && !opts.guest ? binderOwnership(live) : null;
    var step = nextHoloStep(card);
    if (step && isOwned && isOwned(card)) {
      var balance = Number(live.remnants);
      var known = isFinite(balance);
      var short = known && balance < step.cost;
      out += '<button class="sg-sheet-holo-btn" type="button" data-holo-buy="' + esc(card.id) + '"' +
          ' data-holo-tier="' + step.tier + '" data-holo-cost="' + step.cost + '"' + (short ? ' disabled' : '') + '>' +
          holoButtonLabel(step) + '</button>' +
        '<p class="sg-sheet-holo-note" data-holo-note>' + (known
          ? (short ? 'You have ' + balance.toLocaleString() + ' remnants. Duplicates and wins earn more.'
                   : 'You have ' + balance.toLocaleString() + ' remnants.')
          : '') + '</p>';
    }
    return out + '</div>';
  }

  /* ---------- Siege / Keep views of the sheet face ----------
     On the Siege and Keep tabs the face shows the Siegeling as it stands in
     that mode: its overlay cutout, scaled by its size band with the same
     multipliers adventure.css (--sprite-scale) and keep.css (--cutout-scale)
     use, against the tallest band so a Small reads small beside a Gigantic.
     The Keep view adds the Keep's die-cut paper filter. */
  var SIZE_BANDS = ['SMALL', 'MEDIUM', 'LARGE', 'GIGANTIC'];
  var MODE_SCALE = {
    siege: { SMALL: 1, MEDIUM: 1.19, LARGE: 1.48, GIGANTIC: 1.93 },
    keep: { SMALL: 0.84, MEDIUM: 1, LARGE: 1.24, GIGANTIC: 1.62 }
  };

  // The server resolves it (GameController#sizeBandOf); rarity is the fallback an
  // older payload gets, the same one keep.js uses.
  function sizeBand(card) {
    var size = String(card && card.size || '').toUpperCase();
    if (SIZE_BANDS.indexOf(size) !== -1) return size;
    var r = String(card && card.rarity || '').toUpperCase();
    return r === 'LEGENDARY' ? 'GIGANTIC' : r === 'EPIC' ? 'LARGE' : r === 'RARE' ? 'MEDIUM' : 'SMALL';
  }

  function hasCutout(card) {
    return String(card && card.type || 'SIEGLING').toUpperCase() === 'SIEGLING' &&
      String(card.cardArtMode || '').toUpperCase() === 'OVERLAY' && Boolean(card.cardArtUrl);
  }

  // Siege animated sprites (js/siege-sprites.js). On the Siege tab a Siegeling
  // with a shipped sheet walks through its battle poses instead of standing as
  // a still cutout: idle, walk, attack, cheer, round and round.
  var SIEGE_ANIM_CYCLE = [['idle', 2, 1], ['walk', 2, 0.7], ['attack', 1, 0.6], ['cheer', 2, 0.8]];
  // The idle body stands at this share of the cutout figure, like the battle line.
  var SIEGE_ANIM_BODY = 0.9;

  function siegeAnimSheet(card) {
    var reg = window.SiegeSprites;
    return reg && card && card.id != null ? reg.forCard(String(card.id)) : null;
  }

  function siegeAnimPoseStyle(sheet, step) {
    var c = SIEGE_ANIM_CYCLE[step];
    return '--n:' + sheet.frames[c[0]] + ';background-image:url(' + sheet.dir + c[0] + '.webp);' +
      'animation-name:sg-anim-' + c[0] + ';animation-duration:' + c[2] + 's;animation-iteration-count:' + c[1];
  }

  function siegeAnimMarkup(card, sheet) {
    var cellPct = 100 * SIEGE_ANIM_BODY / sheet.fit;
    return '<div class="sg-anim" role="img" aria-label="' + esc(card.name) + ' animated" style="aspect-ratio:' +
      sheet.w + '/' + sheet.h + ';height:' + cellPct.toFixed(1) + '%;bottom:' + (-cellPct * (sheet.base || 0)).toFixed(1) + '%">' +
      '<i class="sg-anim-strip" data-anim-card="' + esc(String(card.id)) + '" data-anim-step="0" style="' +
      siegeAnimPoseStyle(sheet, 0) + '"></i></div>';
  }

  // Each pose plays its loops, then hands over to the next: driven by the
  // animation's own end, so nothing keeps ticking once the sheet is closed, and
  // reduced motion (no animation) simply rests on the first idle frame.
  document.addEventListener('animationend', function (e) {
    var strip = e.target;
    if (!strip.classList || !strip.classList.contains('sg-anim-strip')) return;
    var sheet = window.SiegeSprites && window.SiegeSprites.forCard(strip.getAttribute('data-anim-card'));
    if (!sheet) return;
    var step = (Number(strip.getAttribute('data-anim-step')) + 1) % SIEGE_ANIM_CYCLE.length;
    strip.setAttribute('data-anim-step', String(step));
    strip.setAttribute('style', siegeAnimPoseStyle(sheet, step));
  });

  function preloadSiegeAnim(sheet) {
    SIEGE_ANIM_CYCLE.forEach(function (c) { var im = new Image(); im.src = sheet.dir + c[0] + '.webp'; });
  }

  function cutoutFace(card, mode) {
    var anim = mode === 'siege' ? siegeAnimSheet(card) : null;
    if (anim) preloadSiegeAnim(anim);
    var scales = MODE_SCALE[mode];
    var size = sizeBand(card);
    var top = scales.GIGANTIC;
    var heightPct = function (band) { return (scales[band] / top * 76).toFixed(1); };
    var ruler = SIZE_BANDS.map(function (band) {
      return '<i class="' + (band === size ? 'on' : '') + '" style="bottom:calc(' + heightPct(band) + '% + 15%)">' +
        esc(band.charAt(0)) + '</i>';
    }).join('');
    return '<div class="sg-cutout is-' + mode + '" data-size="' + size + '" style="--cut-h:' + heightPct(size) + '%">' +
      '<div class="sg-cutout-ruler" aria-hidden="true">' + ruler + '</div>' +
      '<i class="sg-cutout-ground" aria-hidden="true"></i>' +
      (anim
        ? '<div class="sg-cutout-figure has-anim">' + siegeAnimMarkup(card, anim) + '</div>'
        : '<div class="sg-cutout-figure"><img ' + artAttrs(card.cardArtUrl, 480) + ' alt="' + esc(card.name) + '" draggable="false"></div>') +
      '<span class="sg-cutout-tag">' + esc(mode === 'siege' ? 'Siege' : 'Keep') + ' · ' + esc(title(size)) + '</span>' +
    '</div>';
  }

  // What the sheet face shows: the chosen version on Arena (and Evolution),
  // the in-world cutout on Siege and Keep.
  function sheetFaceMarkup(card, version, mode) {
    if ((mode === 'siege' || mode === 'keep') && hasCutout(card)) return cutoutFace(card, mode);
    // A sheet needs no cutout art: the sprite is the in-world look.
    if (mode === 'siege' && siegeAnimSheet(card)) return cutoutFace(card, mode);
    return versionFace(card, version);
  }

  // Repaints every face of this card already on the page (binder tiles behind
  // the sheet) so the foil is there when the sheet closes, without rebuilding
  // the binder and losing their scroll position. `skip` is the sheet face,
  // which the twirl swaps itself at the moment it is edge-on.
  function repaintCardFaces(app, card, skip) {
    var tmp = document.createElement('div');
    tmp.innerHTML = galleryCard(card);
    var fresh = tmp.querySelector('.sg-card-tile');
    if (!fresh) return '';
    [].slice.call(app.querySelectorAll('.sg-card-tile[data-card]')).forEach(function (tile) {
      if (tile === skip) return;
      if (tile.getAttribute('data-card') === String(card.id)) tile.innerHTML = fresh.innerHTML;
    });
    scheduleFit(app);
    return fresh.innerHTML;
  }

  /* ---------- holo unlock: twirl + diamond burst ----------
     The card spins up on its vertical axis and is swapped for its foil face at
     exactly the frame it is edge-on (rotateY 630deg at the halfway keyframe),
     so the change itself is never seen - it simply comes out of the spin holo.
     Sparkles converge on the card while it winds up and burst out of it at the
     swap. Particles live in a fixed layer on <body>: the sheet clips, and the
     burst is meant to spill over it. Web Animations, not CSS classes, because
     every particle has its own random path. */
  var HOLO_TWIRL_MS = 1500;
  var HOLO_COLORS = ['#ffffff', '#9ff3ff', '#ff9cf0', '#fff59a', '#a6ffcf', '#c9a6ff'];
  var HOLO_COLORS_DEFAULT = HOLO_COLORS;
  var GOLD_COLORS = ['#fff6d5', '#ffd66b', '#f5b937', '#ffe9a3', '#e09a1f', '#fff1bd'];

  function holoRand(min, max) { return min + Math.random() * (max - min); }

  function holoParticle(layer, cls, size, color) {
    var el = document.createElement('i');
    el.className = cls;
    el.style.setProperty('--s', size.toFixed(1) + 'px');
    if (color) el.style.setProperty('--c', color);
    layer.appendChild(el);
    return el;
  }

  function holoBurst(layer, w, h, delay, colors) {
    var HOLO_COLORS = colors || HOLO_COLORS_DEFAULT;
    var n, i, el, a, d, size, spin;
    // Converge: a ring of glints drawn in towards the card as it winds up.
    for (i = 0; i < 10; i++) {
      a = (i / 10) * Math.PI * 2 + holoRand(-0.2, 0.2);
      d = holoRand(120, 170);
      el = holoParticle(layer, 'sg-holo-star', holoRand(8, 14), HOLO_COLORS[i % HOLO_COLORS.length]);
      el.animate([
        { transform: 'translate(' + Math.cos(a) * d + 'px,' + Math.sin(a) * d + 'px) scale(.2) rotate(0deg)', opacity: 0 },
        { opacity: 1, offset: 0.4 },
        { transform: 'translate(0px,0px) scale(1) rotate(180deg)', opacity: 0.9 }
      ], { duration: delay, delay: 0, easing: 'cubic-bezier(.55,0,.9,.5)', fill: 'forwards' });
    }
    // Shockwave at the swap.
    var ring = holoParticle(layer, 'sg-holo-ring', Math.max(w, h));
    ring.animate([
      { transform: 'scale(.35)', opacity: 0 },
      { transform: 'scale(.6)', opacity: 1, offset: 0.15 },
      { transform: 'scale(1.9)', opacity: 0 }
    ], { duration: 700, delay: delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
    // Diamonds: faceted rainbow gems thrown out of the card, tumbling.
    n = 22;
    for (i = 0; i < n; i++) {
      a = (i / n) * Math.PI * 2 + holoRand(-0.25, 0.25);
      d = holoRand(Math.max(w, h) * 0.55, Math.max(w, h) * 1.15);
      size = holoRand(9, 18);
      spin = holoRand(-540, 540);
      el = holoParticle(layer, 'sg-holo-diamond', size, HOLO_COLORS[i % HOLO_COLORS.length]);
      el.animate([
        { transform: 'translate(0px,0px) rotate(45deg) scale(.2)', opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: 'translate(' + (Math.cos(a) * d).toFixed(1) + 'px,' + (Math.sin(a) * d + 30).toFixed(1) +
          'px) rotate(' + (45 + spin).toFixed(0) + 'deg) scale(' + holoRand(0.5, 1).toFixed(2) + ')', opacity: 0 }
      ], { duration: holoRand(800, 1150), delay: delay + holoRand(0, 90), easing: 'cubic-bezier(.12,.75,.3,1)', fill: 'both' });
    }
    // Twinkles: stars that wink on and off around the card after the burst.
    for (i = 0; i < 12; i++) {
      el = holoParticle(layer, 'sg-holo-star', holoRand(9, 18), HOLO_COLORS[(i + 2) % HOLO_COLORS.length]);
      var x = holoRand(-w * 0.75, w * 0.75), y = holoRand(-h * 0.7, h * 0.7);
      el.animate([
        { transform: 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(0) rotate(0deg)', opacity: 0 },
        { transform: 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(1.15) rotate(90deg)', opacity: 1, offset: 0.4 },
        { transform: 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(0) rotate(180deg)', opacity: 0 }
      ], { duration: holoRand(450, 700), delay: delay + 120 + holoRand(0, 650), easing: 'ease-in-out', fill: 'both' });
    }
  }

  /* Screen-edge glow: a rotating rainbow rim masked to the viewport border,
     over a soft inset bloom. It warms up with the wind-up, flares at the swap
     and fades with the twinkles. */
  function holoScreenGlow(half, gold) {
    var glow = document.createElement('div');
    glow.className = 'sg-holo-screen' + (gold ? ' is-gold' : '');
    glow.setAttribute('aria-hidden', 'true');
    glow.innerHTML = '<i class="sg-holo-screen-rim"><b></b></i>';
    document.body.appendChild(glow);
    var total = half * 2 + 900;
    var at = function (ms) { return Math.min(1, ms / total); };
    glow.animate([
      { opacity: 0, filter: 'hue-rotate(0deg)' },
      { opacity: 0.45, offset: at(half * 0.8) },
      { opacity: 1, filter: gold ? 'hue-rotate(0deg)' : 'hue-rotate(120deg)', offset: at(half + 60) },
      { opacity: 0.7, offset: at(half + 500) },
      // GOLD stays gold; the holo glow cycles the rainbow.
      { opacity: 0, filter: gold ? 'hue-rotate(0deg)' : 'hue-rotate(360deg)' }
    ], { duration: total, easing: 'linear', fill: 'both' });
    glow.querySelector('b').animate([
      { transform: 'translate(-50%,-50%) rotate(0deg)' },
      { transform: 'translate(-50%,-50%) rotate(540deg)' }
    ], { duration: total, easing: 'cubic-bezier(.4,0,.2,1)' });
    window.setTimeout(function () { if (glow.parentNode) glow.parentNode.removeChild(glow); }, total + 50);
  }

  /* ---------- holo unlock sound ----------
     Synthesised with Web Audio rather than shipped as a file: a rising shimmer
     and spin ticks under the wind-up, then at the swap a sub thump, a bright
     bell chord and a scatter of glitter pings. The context is created (or
     resumed) inside the confirming tap - iOS only unlocks audio in a gesture -
     and played once the purchase lands. Honours the Sound effects setting. */
  var holoAudio = null;

  function holoAudioPrime() {
    if (!prefValue('sfx', true)) return null;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      if (!holoAudio) holoAudio = new Ctx();
      if (holoAudio.state === 'suspended' && holoAudio.resume) holoAudio.resume();
    } catch (e) { holoAudio = null; }
    return holoAudio;
  }

  function playHoloSound(half) {
    var ctx = holoAudio;
    if (!ctx || !prefValue('sfx', true)) return;
    try {
      var t0 = ctx.currentTime + 0.02;
      var swap = t0 + half / 1000;
      var master = ctx.createGain();
      master.gain.value = 0.32;
      var comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);

      var tone = function (type, freq, start, dur, peak, freqEnd) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, start);
        if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.012, dur / 4));
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        o.connect(g);
        g.connect(master);
        o.start(start);
        o.stop(start + dur + 0.05);
      };

      // Wind-up whoosh: filtered noise sweeping up into the swap.
      var len = Math.floor(ctx.sampleRate * (half / 1000 + 0.3));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      var noise = ctx.createBufferSource();
      noise.buffer = buf;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2.5;
      bp.frequency.setValueAtTime(400, t0);
      bp.frequency.exponentialRampToValueAtTime(6000, swap);
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(0.5, swap - 0.05);
      ng.gain.exponentialRampToValueAtTime(0.0001, swap + 0.25);
      noise.connect(bp); bp.connect(ng); ng.connect(master);
      noise.start(t0);
      noise.stop(swap + 0.3);

      // Rising shimmer under it.
      tone('triangle', 220, t0, half / 1000, 0.12, 1760);
      // Spin ticks, accelerating with the spin: one per half-turn.
      var ticks = 7;
      for (var k = 0; k < ticks; k++) {
        var p = Math.pow(k / ticks, 0.6);
        tone('sine', 900 + k * 180, t0 + p * (half / 1000), 0.07, 0.10);
      }

      // The swap: thump, bell chord (C major across two octaves), glitter.
      tone('sine', 140, swap, 0.45, 0.6, 45);
      [1046.5, 1318.5, 1568, 2093, 2637].forEach(function (f, n) {
        tone('sine', f, swap + n * 0.025, 1.6 - n * 0.15, 0.16);
        tone('sine', f * 2.01, swap + n * 0.025, 0.5, 0.04);
      });
      for (var g = 0; g < 14; g++) {
        tone('sine', 2500 + Math.random() * 3500, swap + 0.08 + Math.random() * 0.9, 0.12, 0.05 + Math.random() * 0.05);
      }
    } catch (e) { /* audio is decoration; never break the unlock */ }
  }

  // `freshTile` is the full markup of the face to land on; the spinning tile
  // keeps its node (the animation runs on it) and takes the new content and class.
  function playHoloTwirl(face, freshTile, done, gold) {
    var tile = face && face.querySelector('.sg-card-tile');
    function swap() {
      if (tile && tile.isConnected && freshTile) {
        var tmp = document.createElement('div');
        tmp.innerHTML = freshTile;
        var fresh = tmp.querySelector('.sg-card-tile');
        if (fresh) {
          tile.innerHTML = fresh.innerHTML;
          tile.className = fresh.className;
          tile.setAttribute('data-version', fresh.getAttribute('data-version') || '');
        }
      }
      if (face && face.isConnected) fitCardDescriptions(face);
    }
    if (!tile || !tile.animate || prefersReducedMotion()) {
      swap();
      if (done) done();
      return;
    }
    var box = tile.getBoundingClientRect();
    var layer = document.createElement('div');
    layer.className = 'sg-holo-fx';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.left = (box.left + box.width / 2).toFixed(1) + 'px';
    layer.style.top = (box.top + box.height / 2).toFixed(1) + 'px';
    document.body.appendChild(layer);
    face.classList.add('is-holo-twirl');
    var half = HOLO_TWIRL_MS / 2;
    holoScreenGlow(half, gold);
    playHoloSound(half);
    tile.animate([
      { transform: 'translateY(0) rotateY(0deg) rotateZ(0deg) scale(1)', filter: 'brightness(1)', easing: 'cubic-bezier(.3,0,.4,1)' },
      { transform: 'translateY(4px) rotateY(-28deg) rotateZ(3deg) scale(.95)', filter: 'brightness(.9)', offset: 0.14, easing: 'cubic-bezier(.55,0,.95,.55)' },
      { transform: 'translateY(-14px) rotateY(630deg) rotateZ(-5deg) scale(1.16)', filter: 'brightness(2.4) saturate(1.6)', offset: 0.5, easing: 'cubic-bezier(.12,.62,.22,1)' },
      { transform: 'translateY(-4px) rotateY(1060deg) rotateZ(1deg) scale(1.05)', filter: 'brightness(1.25) saturate(1.2)', offset: 0.86, easing: 'cubic-bezier(.3,0,.3,1)' },
      { transform: 'translateY(0) rotateY(1080deg) rotateZ(0deg) scale(1)', filter: 'brightness(1)' }
    ], { duration: HOLO_TWIRL_MS });
    holoBurst(layer, box.width, box.height, half, gold ? GOLD_COLORS : HOLO_COLORS);
    window.setTimeout(swap, half);
    window.setTimeout(function () {
      face.classList.remove('is-holo-twirl');
      if (done) done();
    }, HOLO_TWIRL_MS);
    window.setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, HOLO_TWIRL_MS + 1200);
  }

  // Copies a progression payload's finish lists onto the live model and the
  // lookup sets every card face reads (after a purchase or a pack pull).
  function applyFinishLists(live, p) {
    if (!p) return;
    [['holoCards', setPlayerHoloPlain], ['holoArtCards', setPlayerHoloArt], ['holographicCards', setPlayerHolo],
     ['plainGoldCards', setPlayerPlainGold], ['caratCards', setPlayerCarat],
     ['goldCards', setPlayerGold], ['holoGoldCards', setPlayerHoloGold]].forEach(function (pair) {
      if (!Array.isArray(p[pair[0]])) return;
      if (live) live[pair[0]] = p[pair[0]];
      pair[1](p[pair[0]]);
    });
  }

  function buyHoloFinish(app, opts, sheetCard, btn) {
    var api = window.SiegelingsHomeLive;
    var id = btn.getAttribute('data-holo-buy');
    var requested = btn.getAttribute('data-holo-tier');
    var tier = FINISH_LADDER[finishIndex(requested)].key;
    var cost = Number(btn.getAttribute('data-holo-cost')) || 0;
    var restingLabel = btn.textContent;
    var note = sheetCard.querySelector('[data-holo-note]');
    // Up to 32,000 remnants in one tap is too easy to spend by accident, so
    // the first tap arms and the second one spends.
    if (!btn.classList.contains('is-armed')) {
      btn.classList.add('is-armed');
      btn.textContent = 'Tap again to spend ' + cost.toLocaleString() + ' remnants';
      return;
    }
    if (!api || !api.post) return;
    holoAudioPrime();
    btn.disabled = true;
    btn.textContent = 'Applying finish\u2026';
    api.post('/api/cards/holographic', { cardId: id, tier: tier }).then(function (data) {
      if (!data || data.error || !data.progression) {
        btn.disabled = false;
        btn.classList.remove('is-armed');
        btn.textContent = restingLabel;
        if (note) note.textContent = (data && data.error) || 'The finish could not be applied. Try again.';
        return;
      }
      var p = data.progression;
      var live = opts.live;
      if (p.remnants != null) live.remnants = p.remnants;
      applyFinishLists(live, p);
      if (typeof loadCachedAuthProfile === 'function' && typeof saveCachedAuthProfile === 'function') {
        var profile = loadCachedAuthProfile();
        if (live.accountId && profile && profile.user && profile.user.id === live.accountId) {
          profile.progression = Object.assign({}, profile.progression, p);
          saveCachedAuthProfile(profile);
        }
      }
      var card = byIdIn(ALL_CARDS, id) || byId(id);
      var onSheet = sheetCard.getAttribute('data-zoom-card') === String(id);
      // The unlock plays on the card itself, so a purchase made from the Siege or
      // Keep tab brings the Arena face back first.
      if (onSheet && sheetCard.getAttribute('data-mode') !== 'arena' && sheetCard.sgShowTab) {
        sheetCard.sgShowTab('arena');
      }
      var face = onSheet ? sheetCard.querySelector('.sg-sheet-face') : null;
      repaintCardFaces(app, card, face && face.querySelector('.sg-card-tile'));
      var version = bestVersion(card);
      if (onSheet) sheetCard.setAttribute('data-version', version);
      var block = sheetCard.querySelector('.sg-sheet-holo');
      if (block) block.outerHTML = holoBlock(card, opts, version);
      playHoloTwirl(face, versionFace(card, version), null, isGoldKey(tier));
    });
  }

  function wireTabs(sheetCard, onShow) {
    var tabs = [].slice.call(sheetCard.querySelectorAll('[data-sheet-tab]'));
    var panels = [].slice.call(sheetCard.querySelectorAll('[data-sheet-panel]'));
    var panelHost = sheetCard.querySelector('.sg-sheet-panels');
    function show(id) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-sheet-tab') === id;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-sheet-panel') !== id; });
      // Each panel is its own scroll context, so switching tabs starts at the
      // top of the new one rather than at the old one's offset.
      if (panelHost) panelHost.scrollTop = 0;
      // Now that the panel has a width, the chain's names can be measured.
      fitEvolutionNames(sheetCard);
      if (onShow) onShow(id);
    }
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { show(tab.getAttribute('data-sheet-tab')); });
    });
    // Returned so re-opening the sheet on another card can land on the tab the
    // player was already reading rather than resetting them to Arena.
    var api = show;
    // The head-corner preview is a shortcut into a tab, not a control of its
    // own: it lives outside the panels, so it drives the same switch the tab
    // bar does rather than duplicating the line up there.
    [].slice.call(sheetCard.querySelectorAll('[data-sheet-goto]')).forEach(function (go) {
      go.addEventListener('click', function () { show(go.getAttribute('data-sheet-goto')); });
    });
    return api;
  }

  // One sheet host per screen; any tile with data-card opens it.
  function sheetHost() {
    return '<div class="sg-sheet" data-sheet><div class="sg-sheet-card" data-sheet-card></div></div>' +
      '<div class="sg-zoom" data-zoom tabindex="-1" hidden>' +
        '<button class="sg-zoom-scrim" type="button" data-zoom-close aria-label="Close full screen card"></button>' +
        '<div class="sg-zoom-stage" data-zoom-stage></div>' +
        '<div class="sg-zoom-dots" data-zoom-dots aria-hidden="true"></div>' +
        '<div class="sg-zoom-foot">' +
          '<div class="sg-zoom-version" data-zoom-version aria-live="polite"></div>' +
          '<p class="sg-zoom-hint">Drag to turn the card \u00b7 Swipe up or down for versions</p>' +
        '</div>' +
        '<button class="sg-zoom-close" type="button" data-zoom-close aria-label="Close full screen card">\u00d7</button>' +
      '</div>';
  }

  /* ---------- full-screen card ----------
     The sheet's face is a 168px thumbnail: the frame reads, the printed text
     does not. Tapping it opens the same renderer at the largest size the
     viewport allows, so the card can actually be read rather than recognised.
     It is the identical `.sg-card-tile` markup, which is what keeps the
     description fitter - the rules that hold the box off the bottom notch -
     applying here exactly as it does in the binder. */
  /* The full-screen card is a 3D object, not a picture of one.

     Structure: .sg-zoom-mover (vertical travel, for changing versions) >
     .sg-zoom-card (scale + rotateX/rotateY, preserve-3d) > a front face (the
     printed card) and a back face (the card back), each hidden when turned away.

     Drag sideways and the card turns on its vertical axis, tilting a little with
     the finger's height; let go and it settles face-on or back-on, a flick
     carrying it round to the other side. Swipe up or down and the card leaves
     the screen that way and the next version (Standard, Holo, SP, HSP, Gold, CARAT, GSP, GSPx)
     comes in from the opposite edge. Arrow keys and the wheel do the same.

     The card is still magnified rather than re-laid-out: it is measured and its
     description fitted at natural size, then the whole composition is scaled,
     so every placement stays the printed one. */
  var ZOOM_SETTLE = 'transform .42s cubic-bezier(.2,.8,.25,1)';
  var ZOOM_EXIT_MS = 240;

  function mountZoom(app, opts) {
    var zoom = app.querySelector('[data-zoom]');
    if (!zoom) return null;
    var stage = zoom.querySelector('[data-zoom-stage]');
    var label = zoom.querySelector('[data-zoom-version]');
    var dots = zoom.querySelector('[data-zoom-dots]');
    var opener = null;
    var card = null, versions = [], index = 0;
    var mover = null, obj = null;
    var scale = 1, rx = 0, ry = 0, ty = 0;
    var busy = false, drag = null, wheelAt = 0;

    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function apply(transition, s) {
      if (!obj) return;
      mover.style.transition = obj.style.transition = transition || 'none';
      mover.style.transform = 'translate3d(0,' + ty.toFixed(1) + 'px,0)';
      obj.style.transform = 'scale(' + (s || scale).toFixed(3) + ') rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
    }

    function backArt(c) {
      var type = String(c.type || 'SIEGLING').toUpperCase();
      if (type === 'SIEGEKNIGHT') return '/img/knights/card-back-siegeknight.webp';
      if (type === 'SPELL') return '/img/packs/spell-card-back.webp';
      if (type === 'TRAP') return '/img/packs/trap-card-back.webp';
      // The player's chosen sleeve when they have one, else the card's own element.
      var entry = cardBackEntry(prefs().preferredCardBack) || cardBackEntry(c.element);
      return entry ? cardBackArt(entry) : '/img/packs/siegeling-back.webp';
    }

    function paintLabel() {
      var v = versions[index];
      var owned = versionOwned(card, v.key, opts);
      label.innerHTML = '<b>' + esc(v.label) + '</b>' +
        (v.name && v.name !== v.label ? '<em>' + esc(v.name) + '</em>' : '') +
        (owned === true ? '<span class="is-owned">Owned</span>'
          : owned === false ? '<span>Not owned</span>' : '');
      label.setAttribute('data-version', v.key);
      dots.innerHTML = versions.length > 1 ? versions.map(function (x, i) {
        return '<i class="' + (i === index ? 'on' : '') + '" title="' + esc(x.label) + '"></i>';
      }).join('') : '';
    }

    function build() {
      stage.innerHTML = '<div class="sg-zoom-mover"><div class="sg-zoom-card">' +
        '<div class="sg-zoom-face sg-zoom-front">' + versionFace(card, versions[index].key) + '</div>' +
        '<div class="sg-zoom-face sg-zoom-back"><img src="' + esc(backArt(card)) +
          '" alt="Card back" draggable="false"></div>' +
      '</div></div>';
      mover = stage.firstChild;
      obj = mover.firstChild;
      // The tile is a button in the binder because it opens this; here it IS
      // the content, so it stops being a control.
      var tile = obj.querySelector('.sg-card-tile');
      if (tile) {
        tile.setAttribute('tabindex', '-1');
        tile.removeAttribute('data-card');
      }
      // A press focuses the tile button, and rebuilding for a new version
      // removes it - focus would fall to <body>, past the key handlers.
      if (zoom.classList.contains('open') && !zoom.contains(document.activeElement)) {
        zoom.focus({ preventScroll: true });
      }
      paintLabel();
    }

    function close() {
      zoom.classList.remove('open');
      zoom.hidden = true;
      stage.innerHTML = '';
      mover = obj = null;
      drag = null;
      busy = false;
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    }

    function open(c, from, versionKey) {
      if (!c) return;
      card = c;
      opener = from || document.activeElement;
      versions = versionsFor(c);
      var keys = versions.map(function (v) { return v.key; });
      index = Math.max(0, keys.indexOf(versionKey || bestVersion(c)));
      rx = ry = ty = 0;
      busy = false;
      build();
      zoom.hidden = false;
      zoom.classList.add('open');
      var closer = zoom.querySelector('.sg-zoom-close');
      if (closer) closer.focus({ preventScroll: true });
      window.requestAnimationFrame(function () { layout(true); });
    }

    /* Fit first, scale second. `fitOneDescription` mixes scroll metrics
       (unscaled) with getBoundingClientRect (scaled), so measuring through a
       transform would put the notch clearance out by the scale factor. A
       transition is suspended for the measurement too, or the rect is the
       animated size rather than the natural one. */
    function layout(pop) {
      if (!obj) return;
      zoom.classList.add('is-measuring');
      mover.style.transition = obj.style.transition = 'none';
      mover.style.transform = obj.style.transform = 'none';
      fitCardDescriptions(zoom);
      fitTileNames(zoom);
      var box = obj.getBoundingClientRect();
      var room = stage.getBoundingClientRect();
      zoom.classList.remove('is-measuring');
      if (!box.width || !box.height || !room.width || !room.height) return;
      // Never shrink: below the printed size scaling only adds blur.
      scale = Math.max(1, Math.min(room.width / box.width, room.height / box.height) * 0.96);
      if (pop) {
        apply('none', scale * 0.92);
        void obj.offsetWidth;
      }
      apply(pop ? ZOOM_SETTLE : 'none');
    }

    // Leaves through one edge, swaps the version, arrives from the other.
    function cycle(dir) {
      if (!obj || busy) return;
      if (versions.length < 2) { ty = rx = 0; apply(ZOOM_SETTLE); return; }
      busy = true;
      var h = (window.innerHeight || 800) * 1.05;
      ty = dir > 0 ? -h : h;
      rx = dir > 0 ? 16 : -16;
      apply('transform ' + ZOOM_EXIT_MS + 'ms cubic-bezier(.5,0,.9,.6)');
      window.setTimeout(function () {
        if (!zoom.classList.contains('open')) return;
        index = (index + dir + versions.length) % versions.length;
        ry = 0;
        build();
        layout(false);
        ty = dir > 0 ? h : -h;
        rx = dir > 0 ? -14 : 14;
        apply('none');
        void obj.offsetWidth;
        ty = rx = 0;
        apply(ZOOM_SETTLE);
        window.setTimeout(function () { busy = false; }, 420);
      }, ZOOM_EXIT_MS);
    }

    function turn(dir) {
      if (!obj || busy) return;
      ry = Math.round(ry / 180) * 180 + dir * 180;
      rx = 0;
      apply(ZOOM_SETTLE);
    }

    stage.addEventListener('pointerdown', function (e) {
      if (!obj || busy || !(e.target.closest && e.target.closest('.sg-zoom-card'))) return;
      var t = now();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, rx: rx, ry: ry, axis: null,
        lx: e.clientX, ly: e.clientY, lt: t, vx: 0, vy: 0 };
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
      // Pressing a plain div drops focus to <body>, outside the app listeners
      // that handle Escape and the arrow keys; keep it inside the overlay.
      if (!zoom.contains(document.activeElement)) zoom.focus({ preventScroll: true });
      apply('none');
    });
    stage.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      // The axis is locked on the first real movement so a slightly diagonal
      // turn never also starts a version change.
      if (!drag.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      var t = now(), dt = t - drag.lt;
      if (dt > 0) {
        drag.vx = drag.vx * 0.6 + ((e.clientX - drag.lx) / dt) * 0.4;
        drag.vy = drag.vy * 0.6 + ((e.clientY - drag.ly) / dt) * 0.4;
      }
      drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = t;
      if (drag.axis === 'x') {
        ry = drag.ry + dx * 0.55;
        rx = clamp(drag.rx - dy * 0.25, -22, 22);
      } else {
        ty = dy;
        rx = clamp(-dy * 0.05, -12, 12);
      }
      apply('none');
      e.preventDefault();
    });
    function release(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag;
      drag = null;
      if (!d.axis) return;
      if (d.axis === 'x') {
        // Settle on the nearest face; a flick carries it on to the next one.
        var target = Math.round(ry / 180) * 180;
        if (Math.abs(d.vx) > 0.45) {
          target = d.vx > 0 ? Math.ceil(ry / 180) * 180 : Math.floor(ry / 180) * 180;
          if (target === ry) target += d.vx > 0 ? 180 : -180;
        }
        ry = target;
        rx = 0;
        apply(ZOOM_SETTLE);
        return;
      }
      var moved = (e ? e.clientY : d.ly) - d.y;
      if (Math.abs(moved) > 70 || Math.abs(d.vy) > 0.55) {
        cycle(moved < 0 ? 1 : -1);
      } else {
        ty = rx = 0;
        apply(ZOOM_SETTLE);
      }
    }
    stage.addEventListener('dragstart', function (e) { e.preventDefault(); });
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);

    zoom.addEventListener('wheel', function (e) {
      if (!zoom.classList.contains('open') || Math.abs(e.deltaY) < 12) return;
      e.preventDefault();
      // A trackpad fires dozens of wheel events per gesture; one change each.
      var t = now();
      if (t - wheelAt < 600) return;
      wheelAt = t;
      cycle(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    app.addEventListener('keydown', function (e) {
      if (!zoom.classList.contains('open') || e.sgEscapeHandled) return;
      var keys = { ArrowUp: function () { cycle(1); }, ArrowDown: function () { cycle(-1); },
        ArrowLeft: function () { turn(-1); }, ArrowRight: function () { turn(1); } };
      if (keys[e.key]) { keys[e.key](); e.preventDefault(); }
    });

    window.addEventListener('resize', function () {
      if (zoom.classList.contains('open') && !busy) window.requestAnimationFrame(function () { layout(false); });
    });
    zoom.addEventListener('click', function (e) {
      if (e.target.closest('[data-zoom-close]')) close();
    });
    // Escape is owned by mountSheet, which unwinds the two layers in order. A
    // second listener here fired on the same keypress and closed both at once.
    return { open: open, close: close, isOpen: function () { return zoom.classList.contains('open'); } };
  }

  function mountSheet(app, opts) {
    var sheet = app.querySelector('[data-sheet]');
    if (!sheet) return null;
    var sheetCard = sheet.querySelector('[data-sheet-card]');
    var zoom = mountZoom(app, opts);
    var opener = null;
    var swipe = null;
    function close() {
      sheet.classList.remove('open');
      if (swipe) swipe.resetDrag();
      if (zoom) zoom.close();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    }
    function open(card, tab) {
      if (!card) return;
      if (swipe) swipe.resetDrag();
      opener = document.activeElement;
      sheetCard.innerHTML = cardSheetMarkup(card, opts);
      sheetCard.setAttribute('data-zoom-card', String(card.id == null ? '' : card.id));
      sheetCard.setAttribute('data-version', bestVersion(card));
      sheetCard.setAttribute('data-mode', 'arena');
      sheetCard.scrollTop = 0;
      var show = wireTabs(sheetCard, function (id) {
        // Siege and Keep stand the Siegeling up as it looks there; every other
        // tab keeps the card itself.
        var mode = id === 'siege' || id === 'keep' ? id : 'arena';
        if (sheetCard.getAttribute('data-mode') === mode) return;
        sheetCard.setAttribute('data-mode', mode);
        paintSheetFace(card);
      });
      sheetCard.sgShowTab = show;
      if (tab && sheetCard.querySelector('[data-sheet-tab="' + tab + '"]')) show(tab);
      if (isKnight(card) && sheetCard.querySelector('[data-knight-siege-loading]')) {
        loadSiegeKnights().then(function () {
          // Only repaint if the sheet still shows this knight; the player may
          // have moved on to another card while the roster was in flight.
          if (sheetCard.getAttribute('data-zoom-card') !== String(card.id)) return;
          var panel = sheetCard.querySelector('[data-sheet-panel="siege"]');
          if (panel) panel.innerHTML = knightSiegeBlock(card);
        });
      }
      sheet.classList.add('open');
      sheetCard.querySelector('.sg-sheet-dismiss').focus({ preventScroll: true });
    }
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('.sg-sheet-dismiss')) close();
    });
    // The face inside the sheet opens the card full screen. It sits inside the
    // sheet, so the gallery's own [data-card] delegation deliberately skips it.
    function paintSheetFace(card) {
      var face = sheetCard.querySelector('.sg-sheet-face');
      if (!face) return;
      face.innerHTML = sheetFaceMarkup(card, sheetCard.getAttribute('data-version') || 'STANDARD',
        sheetCard.getAttribute('data-mode') || 'arena');
      face.setAttribute('data-face-view', sheetCard.getAttribute('data-mode') || 'arena');
      fitCardDescriptions(face);
      fitTileNames(face);
    }
    sheetCard.addEventListener('click', function (e) {
      var versionBtn = e.target.closest ? e.target.closest('[data-sheet-version]') : null;
      if (versionBtn) {
        var vCard = byIdIn(ALL_CARDS, sheetCard.getAttribute('data-zoom-card')) || byId(sheetCard.getAttribute('data-zoom-card'));
        sheetCard.setAttribute('data-version', versionBtn.getAttribute('data-sheet-version'));
        [].slice.call(sheetCard.querySelectorAll('[data-sheet-version]')).forEach(function (b) {
          var on = b === versionBtn;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        // A version is a look of the card, so picking one from Siege or Keep
        // brings the card face back to show it.
        if (sheetCard.getAttribute('data-mode') !== 'arena' && sheetCard.sgShowTab) sheetCard.sgShowTab('arena');
        else paintSheetFace(vCard);
        return;
      }
      var holoBtn = e.target.closest ? e.target.closest('[data-holo-buy]') : null;
      if (holoBtn) {
        if (!holoBtn.disabled) buyHoloFinish(app, opts || {}, sheetCard, holoBtn);
        return;
      }
      // Walking the line re-opens the sheet in place rather than stacking a
      // second one, so a player can step base -> final and back without
      // building a pile of sheets they have to dismiss one at a time.
      var evo = e.target.closest ? e.target.closest('[data-sheet-evo]') : null;
      if (evo) {
        var evoId = evo.getAttribute('data-sheet-evo');
        var target = byIdIn(ALL_CARDS, evoId) || byIdIn(CARDS, evoId);
        // Stay on whichever tab the chain was tapped from: stepping through the
        // line from the Evolution tab and landing back on Arena each time makes
        // the line unbrowsable.
        var from = sheetCard.querySelector('.sg-sheet-tab.on');
        if (target) open(target, from ? from.getAttribute('data-sheet-tab') : null);
        return;
      }
      var face = e.target.closest ? e.target.closest('.sg-sheet-face') : null;
      if (!face || !zoom) return;
      var id = sheetCard.getAttribute('data-zoom-card');
      zoom.open(byIdIn(ALL_CARDS, id) || byId(id), face.querySelector('.sg-card-tile') || face,
        sheetCard.getAttribute('data-version') || 'STANDARD');
    });
    app.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.sgEscapeHandled) return;
      // Three layers can be stacked here - a deck sheet, a card sheet over it,
      // and the full-screen card over that - and they all listen on `app`. One
      // Escape must unwind exactly one, so whichever acts first claims the key.
      if (zoom && zoom.isOpen()) { zoom.close(); e.sgEscapeHandled = true; return; }
      if (sheet.classList.contains('open')) { close(); e.sgEscapeHandled = true; }
    });
    swipe = wireSheetSwipe(sheet, sheetCard, close, {
      scrollSelector: '.sg-sheet-panels',
      blocked: function () { return zoom && zoom.isOpen(); }
    });
    app.addEventListener('click', function (e) {
      var host = e.target.closest ? e.target.closest('[data-card]') : null;
      if (!host || sheet.contains(host)) return;
      open(byIdIn(ALL_CARDS, host.getAttribute('data-card')) || byId(host.getAttribute('data-card')));
    });
    return open;
  }

  /* ---------- pack opening ----------
     Buying a pack did nothing at all. This runs the real purchase
     (/api/shop/open-pack) and reveals what it returned: the response carries the
     pull as `progression.packHistory[0].cards`, each entry with its element,
     rarity, whether the copy was granted, and the remnants a duplicate-at-cap
     converted into. Every card shown is a card the account now owns - the flip
     is presentation over a completed transaction, never a simulation of one. */

  function gachaMarkup(pk, count) {
    return '<div class="sg-gacha" data-gacha style="--el:' + color(packElement(pk)) + '">' +
      '<div class="sg-gacha-veil"></div>' +
      '<div class="sg-gacha-motes" data-gacha-motes></div>' +
      '<div class="sg-gacha-body">' +
        '<div class="sg-gacha-head">' +
          '<span class="sg-gacha-kicker" data-gacha-kicker>Opening</span>' +
          '<h3 data-gacha-title>' + esc(pk.name || 'Pack') + (count > 1 ? ' &times;' + esc(count) : '') + '</h3>' +
        '</div>' +
        // The stage starts in the exact layout the reveal uses, and the pile is
        // built here rather than at reveal: the packs fly in while the
        // purchase is in flight, and the reveal only adds the cards behind
        // them, so nothing is torn down and redrawn (which read as a pop).
        '<div class="sg-gacha-stage is-stack is-pack-ready" data-gacha-stage>' +
          packPile(pk, count) +
        '</div>' +
        '<p class="sg-gacha-note" data-gacha-note>Tearing the seal\u2026</p>' +
        // Up close the pack's own prompt is off-screen below, so the zoomed
        // view carries its instruction here, outside the scaled stage.
        '<div class="sg-gacha-ziphint" data-zip-hint hidden><span>Drag across the seal to rip</span></div>' +
        // The shards a duplicate crumbles into need somewhere to land, or the
        // remnants it paid are just a number that appears. This is that place.
        '<div class="sg-gacha-bucket" data-gacha-bucket hidden>' +
          '<span class="sg-gacha-bucket-sigil">\u25c8</span>' +
          '<span class="sg-gacha-bucket-count" data-gacha-bucket-count>0</span>' +
          '<em>remnants</em>' +
        '</div>' +
        '<div class="sg-gacha-actions" data-gacha-actions hidden>' +
          '<button class="sg-ghost-btn" type="button" data-gacha-all>View all</button>' +
          '<button class="sg-guest-primary" type="button" data-gacha-done>Done</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* The wrapper is a retail-style foil pouch: the shared Siegelings "S" back
     printed full bleed across the whole front, with silver crimped foil only
     at the top and bottom ends. Every pack wears that one wrapper, so the pack
     name is what tells them apart; the element's own back is saved for the
     cards that come out of it. Body and tear strip draw the same skin and
     each clips to its own half, so ripping the strip off leaves an open mouth
     on the body that the cards then rise out of. */
  function packSkin(pk, art) {
    return '<span class="sg-pack-skin">' +
      '<span class="sg-pack-foil" aria-hidden="true"></span>' +
      // Not draggable: with a mouse, dragging across the art started the
      // browser's own image drag, which cancels the pointer stream mid-turn.
      '<span class="sg-pack-window"><img src="' + art + '" alt="" draggable="false"></span>' +
      '<span class="sg-pack-name">' + esc(pk.name || 'Pack') + '</span>' +
      '<span class="sg-pack-sheen" aria-hidden="true"></span>' +
    '</span>';
  }

  // Cut to the wrapper's largest rendered box at 3x (262px wide), rather than
  // the 1024x1536 card back: ten packs draw it twice each.
  var PACK_WRAPPER_ART = '/img/packs/pack-wrapper-720.webp';

  // A ×10 pull is ten packs. They stand in one straight line in a real 3D pile
  // (`preserve-3d`), each a fixed step deeper than the one in front, so turning
  // the pile shows the packs behind. The ones behind are pure dressing - one
  // pack takes the gesture and every pack in the pile tears with it.
  var PACK_ENTER_STEP_MS = 90;
  var PACK_ENTER_MS = 620;

  function packPile(pk, count) {
    var n = Math.max(1, Math.min(count || 1, 10));
    var html = '';
    for (var i = n - 1; i >= 1; i--) html += ghostPack(pk, i, n);
    return '<div class="sg-pack-pile' + (n > 1 ? ' is-many' : '') + '" data-pack-pile style="--pile-n:' + n +
      ';--pile-mid:' + ((n - 1) / 2) + '">' +
      html + packShell(pk, 'is-loading', n) + '</div>';
  }

  // The packs fall in from above one at a time, deepest first, so the pile
  // builds front to back the way a hand lays packs down.
  function enterDelay(i, n) {
    return (n - 1 - i) * PACK_ENTER_STEP_MS;
  }

  function ghostPack(pk, i, n) {
    var art = esc(PACK_WRAPPER_ART);
    return '<span class="sg-gacha-pack is-ghost" aria-hidden="true" style="--pack-i:' + i +
      ';--enter-delay:' + enterDelay(i, n) + 'ms">' +
      '<span class="sg-pack-body">' + packSkin(pk, art) + '</span>' +
      '<span class="sg-pack-top">' + packSkin(pk, art) + '</span>' +
    '</span>';
  }

  function packShell(pk, state, n) {
    var art = esc(PACK_WRAPPER_ART);
    return '<button class="sg-gacha-pack ' + (state || '') + '" type="button" data-rip-pack ' +
      'style="--pack-i:0;--enter-delay:' + enterDelay(0, n || 1) + 'ms" ' +
      ((state || '').indexOf('is-loading') >= 0 ? 'disabled ' : '') + 'aria-label="Rip open ' +
      esc(pk.name || 'pack') + '">' +
      '<span class="sg-pack-body">' + packSkin(pk, art) + '</span>' +
      '<span class="sg-pack-top">' + packSkin(pk, art) + '</span>' +
      '<span class="sg-pack-seam" aria-hidden="true"></span>' +
      '<span class="sg-pack-prompt">Tap the pack to open</span>' +
    '</button>';
  }

  // Each card's back is its own element's back, never the pack's, so a mixed
  // pack does not show one element's sigil behind another element's card.
  function cardBackFor(card, fallback) {
    var entry = cardBackEntry(card && card.element);
    return entry ? cardBackArt(entry) : fallback;
  }

  // Cards come out face up: the stack is read by swiping the top card away, so
  // the back only shows edge-on when the pile is tilted.
  // The aura is honest about rarity because the pull is already decided
  // server-side; it marks what is there rather than teasing it.
  function gachaSlot(card, back, i, pos) {
    var slot = pos == null ? i : pos;
    return '<button class="sg-flip is-open rarity-' + esc(String(card.rarity || '').toLowerCase()) +
      '" type="button" data-flip="' + i + '" data-stack-pos="' + slot + '" style="--el:' + color(card.element) +
      ';--rar:' + rarityColor(card.rarity) + ';--slot:' + slot + '">' +
      '<span class="sg-flip-aura" aria-hidden="true"></span>' +
      '<span class="sg-flip-inner">' +
        '<span class="sg-flip-back"><img src="' + esc(cardBackFor(card, back)) + '" alt="" aria-hidden="true"></span>' +
        '<span class="sg-flip-front" data-flip-front></span>' +
      '</span>' +
      '<span class="sg-flip-shards" data-flip-shards aria-hidden="true"></span>' +
      '<span class="sg-flip-tag" hidden data-flip-tag></span>' +
    '</button>';
  }

  var GACHA_RANK = { COMMON:1, UNCOMMON:2, RARE:3, EPIC:4, LEGENDARY:5 };
  // Vibration escalates with rarity: nothing for a Common, a single tick for an
  // Uncommon, a rolling pattern for a Legendary. Browsers ignore it outside a
  // user gesture, which every reveal here is.
  var GACHA_BUZZ = {
    COMMON: null, UNCOMMON: [12], RARE: [18,40,18],
    EPIC: [24,40,24,40,34], LEGENDARY: [30,40,30,40,30,60,90]
  };

  function rarityRank(card) {
    return GACHA_RANK[String((card && card.rarity) || 'COMMON').toUpperCase()] || 1;
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches);
  }

  function buzzForRarity(card) {
    var pattern = GACHA_BUZZ[String((card && card.rarity) || 'COMMON').toUpperCase()];
    if (!pattern || !navigator.vibrate || reducedMotion()) return;
    try { navigator.vibrate(pattern); } catch (err) { /* a nicety, never required */ }
  }

  // Particle count and reach come from rarity; hue comes from the card's own
  // element, so a Legendary Fire pull reads differently from an Uncommon Ice one.
  function gachaSparks(btn, card) {
    if (!btn || reducedMotion()) return;
    var rank = rarityRank(card);
    var layer = document.createElement('span');
    layer.className = 'sg-flip-sparks';
    var count = 6 + rank * 7;
    var tint = color(card.element);
    var accent = rarityColor(card.rarity);
    var html = '';
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      var dist = 54 + rank * 20 + Math.random() * 60;
      html += '<i style="--sx:' + (Math.cos(angle) * dist).toFixed(0) + 'px;--sy:' +
        (Math.sin(angle) * dist).toFixed(0) + 'px;--sz:' + (3 + Math.random() * (1 + rank)).toFixed(1) +
        'px;--d:' + (Math.random() * 200).toFixed(0) + 'ms;--tint:' + (i % 3 === 0 ? accent : tint) + '"></i>';
    }
    layer.innerHTML = html;
    btn.appendChild(layer);
    // Swiping fast through a big pull fired a fresh 40-speck layer per card
    // before the last ones had faded; iOS Safari ran out of compositor memory
    // and killed the tab. Only the newest few layers are kept alive.
    LIVE_SPARKS.push(layer);
    while (LIVE_SPARKS.length > 3) LIVE_SPARKS.shift().remove();
    setTimeout(function () {
      layer.remove();
      var at = LIVE_SPARKS.indexOf(layer);
      if (at >= 0) LIVE_SPARKS.splice(at, 1);
    }, 1400);
  }
  var LIVE_SPARKS = [];

  // Rare and up get a light sweep across the face on top of the sparks.
  function gachaFlourish(btn, card) {
    gachaSparks(btn, card);
    if (rarityRank(card) >= 3 && !reducedMotion()) {
      btn.classList.remove('is-flaring');
      void btn.offsetWidth;
      btn.classList.add('is-flaring');
      setTimeout(function () { btn.classList.remove('is-flaring'); }, 1300);
    }
    buzzForRarity(card);
  }

  /* A pulled finish gets its moment. HSP throws a rainbow burst; the gold tiers
     are rare enough to be an event - the gold screen glow, a gold burst and the
     unlock chime, twice over for GSPx. The flip is a tap, so audio may start. */
  // The full-screen bursts are the heaviest effect on the page, and the best
  // cards now sit together at the back of the pile, so a fast swipe through
  // them used to stack several bursts and screen glows at once. One runs at a
  // time; a card swiped past mid-burst still gets its sparks and badge.
  var lastFinishFx = 0;
  function finishFlourish(btn, finish) {
    var rank = finishIndex(finish);
    if (rank < finishIndex('HSP') || reducedMotion()) return;
    var now = Date.now();
    if (now - lastFinishFx < 1100) return;
    lastFinishFx = now;
    var gold = rank >= finishIndex('GOLD');
    function burst(delay) {
      var box = btn.getBoundingClientRect();
      var layer = document.createElement('div');
      layer.className = 'sg-holo-fx';
      layer.setAttribute('aria-hidden', 'true');
      layer.style.left = (box.left + box.width / 2).toFixed(1) + 'px';
      layer.style.top = (box.top + box.height / 2).toFixed(1) + 'px';
      document.body.appendChild(layer);
      holoBurst(layer, box.width, box.height, delay, gold ? GOLD_COLORS : HOLO_COLORS);
      setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, delay + 2200);
    }
    burst(80);
    if (gold) {
      holoAudioPrime();
      holoScreenGlow(420, true);
      playHoloSound(300);
      if (finish === 'GSPX') {
        setTimeout(function () { holoScreenGlow(520, true); burst(60); }, 900);
      }
    }
  }

  function openPack(pk, opts, count) {
    var host = document.querySelector('.sg-app');
    if (!host) return;
    count = count > 1 ? count : 1;
    var wrap = document.createElement('div');
    wrap.innerHTML = gachaMarkup(pk, count);
    var gacha = wrap.firstChild;
    host.appendChild(gacha);
    var stage = gacha.querySelector('[data-gacha-stage]');
    // Same drifting motes the hero uses, in the pack's element.
    paintMotes(gacha.querySelector('[data-gacha-motes]'), packElement(pk));
    var note = gacha.querySelector('[data-gacha-note]');
    var actions = gacha.querySelector('[data-gacha-actions]');
    var kicker = gacha.querySelector('[data-gacha-kicker]');
    // The pile's turn lives on the stage as the two angles plus their sines;
    // each pack derives its own parallax offset from the sines in CSS (CSS
    // trig is not something every iOS version this runs on has). A pile of
    // several rests a little turned so it reads as a stack untouched.
    // The values are written on the pile, not the stage: a custom property
    // changed on the stage re-resolves style for every card under it on each
    // pointer move, where on the pile it only touches the packs.
    // The pile rests square: it only turns while the player is turning it.
    var PILE_REST = { y: 0, x: 0 };
    var pileEl = stage.querySelector('[data-pack-pile]');
    function setPile(ry, rx) {
      if (!pileEl) return;
      pileEl.style.setProperty('--ptilt-y', ry.toFixed(2) + 'deg');
      pileEl.style.setProperty('--ptilt-x', rx.toFixed(2) + 'deg');
      pileEl.style.setProperty('--pile-sy', Math.sin(ry * Math.PI / 180).toFixed(4));
      pileEl.style.setProperty('--pile-sx', Math.sin(rx * Math.PI / 180).toFixed(4));
    }
    setPile(PILE_REST.y, PILE_REST.x);
    // When the last pack has landed; a rip before then is held until it has.
    var enteredAt = Date.now() + (reducedMotion() ? 0 :
      enterDelay(0, Math.min(count, 10)) + PACK_ENTER_MS);

    function close() { gacha.remove(); }
    gacha.querySelector('[data-gacha-done]').addEventListener('click', function () {
      // The purse and the collection both changed, so the hub re-reads rather
      // than patching two numbers by hand.
      window.location.href = '/shop';
    });
    gacha.addEventListener('click', function (e) {
      if (e.target === gacha || e.target.classList.contains('sg-gacha-veil')) {
        if (!actions.hidden) window.location.href = '/shop';
      }
    });

    function fail(message) {
      kicker.textContent = 'Not opened';
      stage.innerHTML = '';
      note.textContent = message;
      actions.hidden = false;
      gacha.querySelector('[data-gacha-all]').hidden = true;
    }

    fetch('/api/shop/open-pack', {
      method: 'POST', credentials: 'same-origin',
      headers: authHeaders(),
      body: JSON.stringify({ packId: pk.id, count: count, requestId: 'hub-' + Date.now() })
    }).then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (data) {
        if (!data || data.error) { fail((data && data.error) || 'That pack could not be opened.'); return; }
        var history = (data.progression && data.progression.packHistory) || [];
        var cards = (history[0] && history[0].cards) || [];
        if (!cards.length) { fail('The pack came back empty. Nothing was charged.'); return; }
        // A pull can raise a card's finish, so every face drawn after this
        // (binder, sheet) reads the new lists.
        applyFinishLists(opts && opts.live, data.progression);
        reveal(cards);
      })
      .catch(function () { fail('The server did not answer. Nothing was charged.'); });

    function reveal(cards) {
      var back = packBack(pk);
      kicker.textContent = 'Pack ready';
      // The pack carries its own "drag across the seal" prompt; repeating it
      // here stacked the same words twice under the pile.
      note.textContent = '';

      // Best last, the way a real pack is sorted: commons on top, rarer cards
      // toward the back, and every special finish (holo up to GSPx) behind all
      // the plain cards, so the pull builds to its headline card. A finish
      // outranks rarity - a GSPx Common is the story of the pull, not the plain
      // Legendary beside it. A `holo` flag without a finish still counts as Holo.
      function finishRank(card) {
        return Math.max(finishIndex(card.finish), card.holo ? finishIndex('HOLO') : 0);
      }
      var order = cards.map(function (c, i) { return i; }).sort(function (a, b) {
        return (finishRank(cards[a]) - finishRank(cards[b])) ||
          (rarityRank(cards[a]) - rarityRank(cards[b])) || (a - b);
      });
      // Even a single card is dealt as a one-card stack: the cards rise out of
      // the pack into the pile, and swiping past the last card fans the pull out.
      var stackMode = true;
      // The pile has been on stage since the overlay opened; the cards go in
      // behind it and the front pack is armed, without redrawing the packs.
      stage.insertAdjacentHTML('beforeend', order.map(function (idx, pos) {
        return gachaSlot(cards[idx], back, idx, pos);
      }).join(''));
      var frontPack = stage.querySelector('[data-rip-pack]');
      if (frontPack) {
        frontPack.disabled = false;
        frontPack.classList.remove('is-loading');
      }

      var slots = [].slice.call(stage.querySelectorAll('[data-flip]'));
      // The pile rises together with its deepest cards leading by a beat, so the
      // top card - the one the player reads first - is the last to clear the foil.
      slots.forEach(function (btn, pos) {
        btn.style.setProperty('--deal-delay', Math.min((Math.min(slots.length, 6) - 1 - Math.min(pos, 5)) * 70, 350) + 'ms');
        // Only the cards near the top are drawn now; the rest are drawn as
        // they come within sight (layoutStack) or when the grid opens.
        // Building all fifty faces of a ×10 at once - art requests and
        // all - landed in the middle of the pile's entrance and stalled it.
        if (pos <= 5) paintFace(btn, cards[Number(btn.getAttribute('data-flip'))]);
      });
      var all = gacha.querySelector('[data-gacha-all]');
      var bucket = gacha.querySelector('[data-gacha-bucket]');
      var bucketCount = gacha.querySelector('[data-gacha-bucket-count]');
      var banked = 0;
      var left = slots.length;
      var stackLocked = true;
      // Duplicates crumbling into remnants while they were the top of the stack
      // ate the card the player was reading. A pull is held here until the
      // stage fans out into the full view, where the whole pull is on screen
      // and a crumble is something to watch.
      var pendingRemnants = [];

      // The controls stay out until the cards have risen clear of the pack.
      // Offering "View all" while the foil is still tearing asks the player to
      // act on something they cannot see yet.
      var risen = reducedMotion() ? 0 : 1180 + Math.min(slots.length - 1, 5) * 70;

      // A duplicate is worth remnants, so it does not just sit there wearing a
      // label: the card crumbles and its shards fly to the bucket, which counts
      // up by exactly what the server said that copy paid.
      function bankRemnants(btn, card) {
        var amount = Number(card.remnantsAwarded) || 0;
        var host = btn.querySelector('[data-flip-shards]');
        var from = btn.getBoundingClientRect();
        bucket.hidden = false;
        var to = bucket.getBoundingClientRect();
        var dx = (to.left + to.width / 2) - (from.left + from.width / 2);
        var dy = (to.top + to.height / 2) - (from.top + from.height / 2);

        var shards = '';
        for (var i = 0; i < 12; i++) {
          // Each shard scatters a little before being pulled in, so the flight
          // reads as debris rather than twelve copies of one tween.
          var spreadX = (Math.random() - 0.5) * 70;
          var spreadY = (Math.random() - 0.5) * 70;
          shards += '<i class="sg-shard" style="--sx:' + spreadX.toFixed(0) + 'px;--sy:' +
            spreadY.toFixed(0) + 'px;--dx:' + dx.toFixed(0) + 'px;--dy:' + dy.toFixed(0) +
            'px;--d:' + (i * 34) + 'ms"></i>';
        }
        host.innerHTML = shards;
        btn.classList.add('is-dissolving');

        // Count up as the shards land rather than all at once on arrival.
        var landed = 0;
        var step = Math.max(1, Math.round(amount / 12));
        var ticker = setInterval(function () {
          landed = Math.min(amount, landed + step);
          bucketCount.textContent = (banked + landed).toLocaleString();
          bucket.classList.add('is-hit');
          setTimeout(function () { bucket.classList.remove('is-hit'); }, 140);
          if (landed >= amount) {
            clearInterval(ticker);
            banked += amount;
            bucketCount.textContent = banked.toLocaleString();
          }
        }, 70);

        setTimeout(function () {
          host.innerHTML = '';
          btn.classList.remove('is-dissolving');
          btn.classList.add('is-spent');
        }, 1150);
      }

      // The face is drawn up front because the cards come out face up. Tags
      // and finish badges ride on every card; the stack hides them on all but
      // the top one so the pile edges stay clean.
      function paintFace(btn, card) {
        if (btn.getAttribute('data-painted')) return;
        btn.setAttribute('data-painted', '1');
        var front = btn.querySelector('[data-flip-front]');
        var known = byIdIn(ALL_CARDS, card.id);
        var finish = FINISH_LADDER[finishIndex(card.finish)].key;
        // The card is shown in the finish it was pulled in.
        front.innerHTML = known ? versionFace(known, finish) : cardPlate(card);
        if (finish !== 'STANDARD') {
          var badge = document.createElement('span');
          badge.className = 'sg-flip-finish is-' + finish.toLowerCase();
          badge.textContent = versionLabel(finish) + (card.finishUpgraded ? ' · upgraded' : '');
          btn.appendChild(badge);
        }
        var tag = btn.querySelector('[data-flip-tag]');
        if (card.duplicateAtCap) {
          tag.textContent = 'Owned · +' + (card.remnantsAwarded || 0);
          tag.hidden = false;
          btn.classList.add('is-dupe');
        } else if (card.ownedAfter === 1) {
          tag.textContent = 'New';
          tag.hidden = false;
          btn.classList.add('is-new');
        } else if (card.ownedAfter > 1) {
          // Granted, but not the first copy - which the old build showed as
          // nothing at all, so a second copy looked identical to a new card.
          tag.textContent = 'Copy ' + card.ownedAfter;
          tag.hidden = false;
          btn.classList.add('is-copy');
        }
        if (card.holo) btn.classList.add('is-holo');
      }

      // A card's moment is when it becomes the one on top: that is when its
      // rarity sparks, finish burst and buzz fire, once per card.
      function announce(btn) {
        if (!btn || btn.classList.contains('is-seen')) return;
        var card = cards[Number(btn.getAttribute('data-flip'))];
        btn.classList.add('is-seen');
        gachaFlourish(btn, card);
        finishFlourish(btn, FINISH_LADDER[finishIndex(card.finish)].key);

        // In the grid the card keeps its slot while it crumbles, so it pays out
        // once it has been read. On the stack it is the only card the player
        // can see, so it waits for the full view.
        if (card.duplicateAtCap) {
          if (stackMode) pendingRemnants.push({ btn: btn, card: card });
          else setTimeout(function () { bankRemnants(btn, card); }, 700);
        }

        left -= 1;
        if (!left) {
          kicker.textContent = 'Opened';
          note.textContent = summary(cards);
        }
      }

      /* ---- the stack ----
         One leaning pile of face-up cards. Dragging tilts every card by the
         same rotation, so the pile swings as one body in 3D and the cards
         underneath show their borders; a swipe or a tap sends the top card away
         to expose the one beneath. Past the last card the stage fans out into
         the grid, which is also where "View all" goes, so the whole pull stays
         comparable at the end. */
      var stackPos = 0;
      var stackBar = null;
      var stackCounter = null;
      var stackHint = null;

      function stackBtn(pos) {
        return slots[pos] || null;
      }

      function layoutStack() {
        if (!stackMode) return;
        slots.forEach(function (btn, pos) {
          var depth = pos - stackPos;
          btn.classList.toggle('is-stack-out', depth < 0);
          btn.classList.toggle('is-stack-top', depth === 0);
          // Depth 5 is rendered but transparent, so the next card to surface
          // fades up into the pile instead of appearing out of nothing.
          btn.classList.toggle('is-stack-buried', depth > 4);
          // Cards more than one swipe gone, or too deep to see, leave the
          // render tree entirely. Each face-up card is a 3D compositing layer,
          // and fifty of them (a ×10 pull) held at opacity 0 exhausted iOS
          // Safari's GPU memory - the freeze on the sealed pile and the crash
          // on a fast swipe.
          btn.classList.toggle('is-stack-gone', depth < -2 || depth > 5);
          if (depth >= 0 && depth <= 5) paintFace(btn, cards[Number(btn.getAttribute('data-flip'))]);
          btn.style.setProperty('--depth', String(Math.max(0, Math.min(depth, 5))));
          btn.style.zIndex = String(Math.max(1, 200 - pos));
          btn.tabIndex = depth === 0 ? 0 : -1;
        });
        if (stackCounter) stackCounter.textContent = (stackPos + 1) + ' / ' + slots.length;
        if (stackHint) {
          stackHint.textContent = stackPos >= slots.length - 1
            ? 'Swipe to see the whole pull'
            : 'Swipe for the card underneath';
        }
      }

      function bindPackRip() {
        var pack = stage.querySelector('[data-rip-pack]');
        if (!pack) return;
        var startX = 0, startY = 0, dragged = false, tearing = false, suppressClick = false;
        // The sealed pile is a 3D object: moving a finger (or the mouse) over it
        // swings every pack together, and because each pack sits at its own
        // depth the swing parallaxes them apart so the whole stack shows.
        function tiltPile(e) {
          if (tearing || zoomed) return;
          var box = pack.getBoundingClientRect();
          if (!box.width) return;
          var nx = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width / 2)) / (box.width / 2)));
          var ny = Math.max(-1, Math.min(1, (e.clientY - (box.top + box.height / 2)) / (box.height / 2)));
          stage.classList.add('is-tilting');
          setPile(nx * 36, -ny * 14);
        }
        function settlePile() {
          if (tearing) return;
          stage.classList.remove('is-tilting');
          setPile(PILE_REST.y, PILE_REST.x);
        }
        // Only a pressed pointer turns the pile - a touch, or a mouse with a
        // button down. A bare mouse hover used to swing it, so on desktop it
        // was never still.
        stage.addEventListener('pointermove', function (e) {
          if (!stage.classList.contains('is-pack-ready')) return;
          if (e.buttons || e.pointerType === 'touch') tiltPile(e);
        });
        stage.addEventListener('pointerup', settlePile);
        stage.addEventListener('pointerleave', settlePile);
        pack.addEventListener('pointercancel', settlePile);

        /* ---- the zoom ----
           Opening is two beats: a tap brings the camera in on the perforated
           seal, and the rip happens there, up close. The zoom scales the whole
           stage (pile and the cards waiting behind it) about the tear line, so
           when the cards come up out of the mouth they come up out of the
           zoomed pack, and the camera pulls back out as they settle. The
           numbers are measured from the pack as it sits, so the seal lands in
           the same place on any screen. */
        var zoomed = false;
        var zipHint = gacha.querySelector('[data-zip-hint]');
        function zoomIn() {
          if (zoomed || tearing) return;
          var wait = enteredAt - Date.now();
          if (wait > 0) { window.setTimeout(zoomIn, wait); return; }
          settlePile();
          var box = pack.getBoundingClientRect();
          var st = stage.getBoundingClientRect();
          if (!box.width || !st.width) return;
          var vw = window.innerWidth || document.documentElement.clientWidth;
          var vh = window.innerHeight || document.documentElement.clientHeight;
          // The tear line sits 10% down the pack (see .sg-pack-body's clip).
          var tx = box.left + box.width / 2;
          var ty = box.top + box.height * 0.10;
          var scale = Math.max(1, Math.min(1.7, (vw - 20) / box.width));
          stage.style.setProperty('--zoom-ox', (tx - st.left).toFixed(1) + 'px');
          stage.style.setProperty('--zoom-oy', (ty - st.top).toFixed(1) + 'px');
          stage.style.setProperty('--zoom-tx', (vw / 2 - tx).toFixed(1) + 'px');
          stage.style.setProperty('--zoom-ty', (vh * 0.42 - ty).toFixed(1) + 'px');
          stage.style.setProperty('--zoom-s', scale.toFixed(3));
          zoomed = true;
          stage.classList.add('is-zoomed');
          gacha.classList.add('is-zoomed');
          kicker.textContent = 'Break the seal';
          if (zipHint) zipHint.hidden = false;
        }
        function zoomOut() {
          if (!zoomed) return;
          zoomed = false;
          stage.classList.remove('is-zoomed');
          gacha.classList.remove('is-zoomed');
          if (zipHint) zipHint.hidden = true;
        }
        // A tap that is not a rip, up close: the strip twitches to show which
        // way it wants to go rather than silently doing nothing.
        function nudge() {
          pack.classList.remove('is-nudged');
          void pack.offsetWidth;
          pack.classList.add('is-nudged');
          window.setTimeout(function () { pack.classList.remove('is-nudged'); }, 520);
        }
        // Tapping anywhere off the pack backs the camera out. Up close the
        // pack fills the whole stage, so this listens on the overlay.
        gacha.addEventListener('click', function (e) {
          if (!zoomed || tearing) return;
          if (e.target.closest && e.target.closest('[data-rip-pack]')) return;
          zoomOut();
          kicker.textContent = 'Pack ready';
        });
        function tear(dir) {
          if (tearing) return;
          // A rip that lands while the packs are still falling in waits for
          // the last one to settle, so the tear never cuts the entrance short.
          var wait = enteredAt - Date.now();
          if (wait > 0) {
            tearing = true;
            window.setTimeout(function () { tearing = false; tear(dir); }, wait);
            return;
          }
          tearing = true;
          // The pile eases back square while the strips fly, so the drop that
          // follows starts from where the packs already are.
          stage.classList.remove('is-tilting');
          setPile(0, 0);
          pack.disabled = true;
          stage.classList.add('is-ripping');
          // The rip lands with a jolt: the whole overlay shakes, harder and
          // longer when a pile of packs tears at once.
          if (!reducedMotion()) {
            gacha.classList.remove('is-shaking', 'is-shaking-big');
            void gacha.offsetWidth;
            gacha.classList.add(count > 1 ? 'is-shaking-big' : 'is-shaking');
            setTimeout(function () { gacha.classList.remove('is-shaking', 'is-shaking-big'); }, 700);
            if (navigator.vibrate) {
              try { navigator.vibrate(count > 1 ? [40, 30, 60] : [26]); } catch (err) { /* optional */ }
            }
          }
          pack.style.setProperty('--rip-dir', dir < 0 ? '-1' : '1');
          if (zipHint) zipHint.hidden = true;
          kicker.textContent = 'Seal broken';
          note.textContent = '';
          // The strip flies off first; then the pile climbs out of the open
          // mouth while the foil slides away underneath it. The pack stays in
          // front of the cards the whole time, so only what has cleared the
          // opening is ever visible.
          layoutStack();
          window.setTimeout(function () {
            stage.classList.remove('is-pack-ready');
            stage.classList.add('is-rising');
            // The camera pulls back as the pile reaches the top of its climb,
            // so the cards settle into the stack at full view.
            window.setTimeout(zoomOut, reducedMotion() ? 0 : 620);
            window.setTimeout(function () {
              var pile = stage.querySelector('[data-pack-pile]');
              if (pile) pile.remove();
              stage.classList.remove('is-rising', 'is-ripping');
              stackLocked = false;
              layoutStack();
              if (stackBar) {
                stackBar.hidden = false;
                stackBar.classList.add('is-in');
              }
              kicker.textContent = 'Your pull';
              note.textContent = cards.length + ' card' + (cards.length === 1 ? '' : 's');
              actions.hidden = false;
              if (slots.length < 2) all.hidden = true;
              announce(stackBtn(stackPos));
            }, risen);
          }, reducedMotion() ? 0 : 420);
        }
        pack.addEventListener('pointerdown', function (e) {
          if (tearing) return;
          startX = e.clientX;
          startY = e.clientY;
          dragged = false;
          if (pack.setPointerCapture) pack.setPointerCapture(e.pointerId);
        });
        // The glint follows the pile's tilt in CSS (moved, never repainted).
        // It used to be a gradient re-centred under the finger on every move,
        // which repainted the whole front pack each time - on iPhone that
        // showed as the pack going soft and dropping frames mid-turn.
        // Up close, a sideways drag peels the strip toward the finger, either
        // way; at a distance the same drag only turns the pile.
        pack.addEventListener('pointermove', function (e) {
          if (tearing || !pack.hasPointerCapture || !pack.hasPointerCapture(e.pointerId)) return;
          var dx = e.clientX - startX;
          var dy = e.clientY - startY;
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) dragged = true;
          if (zoomed && Math.abs(dx) > Math.abs(dy)) {
            var dir = dx < 0 ? -1 : 1;
            var progress = Math.min(1, Math.abs(dx) / Math.max(90, pack.offsetWidth * .55));
            pack.style.setProperty('--rip-x', (dir * progress * 12) + 'px');
            pack.style.setProperty('--rip-y', (progress * -6) + 'px');
            pack.style.setProperty('--rip-angle', (dir * progress * 3) + 'deg');
          }
        });
        function resetStrip() {
          pack.style.removeProperty('--rip-x');
          pack.style.removeProperty('--rip-y');
          pack.style.removeProperty('--rip-angle');
        }
        pack.addEventListener('pointerup', function (e) {
          if (!dragged || tearing) return;
          suppressClick = true;
          window.setTimeout(function () { suppressClick = false; }, 0);
          var dx = e.clientX - startX;
          var dy = e.clientY - startY;
          if (zoomed && Math.abs(dx) > Math.max(48, pack.offsetWidth * .28) && Math.abs(dx) > Math.abs(dy)) {
            e.preventDefault();
            tear(dx < 0 ? -1 : 1);
          } else {
            settlePile();
            resetStrip();
          }
        });
        // A tap zooms in; up close a tap only nudges the strip, because the rip
        // is the drag. Keyboard activation (no pointer, detail 0) has no drag
        // to give, so Enter/Space zooms in and then opens.
        pack.addEventListener('click', function (e) {
          if (suppressClick || tearing) return;
          if (!zoomed) { zoomIn(); return; }
          if (e.detail === 0) tear(1);
          else nudge();
        });
      }

      // Every duplicate the stack held back, paid out one after another so the
      // shard flights read as a sequence instead of one indistinct shower.
      function drainRemnants() {
        var queued = pendingRemnants.splice(0, pendingRemnants.length);
        queued.forEach(function (entry, i) {
          setTimeout(function () { bankRemnants(entry.btn, entry.card); }, 560 + i * 220);
        });
      }

      function toGrid() {
        // The switch to the grid is animated FLIP-style: every card the player
        // can see is measured in the pile, laid out in the grid, then played
        // from where it was to where it is, so nothing jumps. Cards that were
        // not on screen (swiped away or still deep in the pile) fade up into
        // their slots instead.
        var before = {};
        slots.forEach(function (btn) {
          if (btn.classList.contains('is-stack-gone') || btn.classList.contains('is-stack-out') ||
              btn.classList.contains('is-stack-buried')) return;
          before[btn.getAttribute('data-flip')] = btn.getBoundingClientRect();
        });
        stackMode = false;
        slots.forEach(function (btn) {
          paintFace(btn, cards[Number(btn.getAttribute('data-flip'))]);
          btn.classList.remove('is-stack-gone');
        });
        stage.className = 'sg-gacha-stage is-grid' + (slots.length > 5 ? ' is-bulk' : '');
        if (stackBar) stackBar.hidden = true;
        all.hidden = true;
        slots.forEach(function (btn) {
          btn.classList.remove('is-stack-top', 'is-stack-out', 'is-stack-buried');
          btn.style.removeProperty('--depth');
          btn.style.removeProperty('z-index');
          btn.tabIndex = 0;
        });
        stage.style.removeProperty('--tilt-x');
        stage.style.removeProperty('--tilt-y');
        stage.style.removeProperty('--drag-x');
        stage.style.removeProperty('--drag-y');
        if (!reducedMotion() && slots[0] && slots[0].animate) {
          var fresh = 0;
          slots.forEach(function (btn) {
            var was = before[btn.getAttribute('data-flip')];
            var now = btn.getBoundingClientRect();
            if (!now.width) return;
            if (was && was.width) {
              var dx = (was.left + was.width / 2) - (now.left + now.width / 2);
              var dy = (was.top + was.height / 2) - (now.top + now.height / 2);
              btn.animate([
                { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + (was.width / now.width).toFixed(3) + ')' },
                { transform: 'none' }
              ], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
            } else {
              btn.animate([
                { opacity: 0, transform: 'translateY(14px) scale(.94)' },
                { opacity: 1, transform: 'none' }
              ], { duration: 360, delay: Math.min(fresh++ * 18, 420), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
            }
          });
        }
        // After the layout switch, so each card's shards fly from the slot it
        // actually occupies in the grid rather than from its place in the pile.
        requestAnimationFrame(drainRemnants);
        // Cards skipped past with "View all" still get their moment, in order.
        slots.filter(function (btn) { return !btn.classList.contains('is-seen'); })
          .forEach(function (btn, i) { setTimeout(function () { announce(btn); }, 120 + i * 150); });
      }

      // A swipe faster than the exit transition is still honoured, but a burst
      // of taps landing inside one frame budget is read as one advance.
      var lastAdvance = 0;
      function advanceStack(dir) {
        var top = stackBtn(stackPos);
        if (!top) return;
        var now = Date.now();
        if (now - lastAdvance < 140) return;
        lastAdvance = now;
        // A duplicate is mid-crumble for about a second; let it finish paying
        // out before its slot is swept off the top of the pile.
        if (top.classList.contains('is-dissolving')) return;
        top.style.setProperty('--exit-dir', dir >= 0 ? '1' : '-1');
        if (stackPos >= slots.length - 1) { toGrid(); return; }
        stackPos += 1;
        layoutStack();
        announce(stackBtn(stackPos));
      }

      function bindStack() {
        var bar = document.createElement('div');
        bar.className = 'sg-gacha-stackbar';
        bar.innerHTML = '<span class="sg-gacha-stackcount" data-stack-count></span>' +
          '<span class="sg-gacha-stackhint" data-stack-hint></span>';
        stage.parentNode.insertBefore(bar, note);
        stackBar = bar;
        stackBar.hidden = true;
        stackCounter = bar.querySelector('[data-stack-count]');
        stackHint = bar.querySelector('[data-stack-hint]');

        var active = null;
        var sx = 0, sy = 0, moved = 0, startedAt = 0;

        function setTilt(dx, dy, top) {
          stage.style.setProperty('--tilt-y', Math.max(-26, Math.min(26, dx / 7)) + 'deg');
          stage.style.setProperty('--tilt-x', Math.max(-16, Math.min(16, -dy / 9)) + 'deg');
          stage.style.setProperty('--drag-x', Math.max(-240, Math.min(240, dx)) + 'px');
          stage.style.setProperty('--drag-y', Math.max(-80, Math.min(80, dy * 0.3)) + 'px');
          // The same drag also rolls the top card on its own axes, so the
          // player can inspect the front in 3D before the swipe that sends it away.
          if (top) {
            top.style.setProperty('--inspect-y', Math.max(-18, Math.min(18, dx / 9)) + 'deg');
            top.style.setProperty('--inspect-x', Math.max(-12, Math.min(12, -dy / 11)) + 'deg');
          }
        }
        function clearTilt() {
          stage.style.removeProperty('--tilt-x');
          stage.style.removeProperty('--tilt-y');
          stage.style.removeProperty('--drag-x');
          stage.style.removeProperty('--drag-y');
          var top = stackBtn(stackPos);
          if (top) {
            top.style.removeProperty('--inspect-x');
            top.style.removeProperty('--inspect-y');
          }
        }

        stage.addEventListener('pointerdown', function (e) {
          if (!stackMode || stackLocked || active !== null) return;
          active = e.pointerId; sx = e.clientX; sy = e.clientY; moved = 0; startedAt = Date.now();
          stage.classList.add('is-dragging');
          if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
        });
        stage.addEventListener('pointermove', function (e) {
          if (e.pointerId !== active) return;
          var dx = e.clientX - sx, dy = e.clientY - sy;
          moved = Math.max(moved, Math.sqrt(dx * dx + dy * dy));
          setTilt(dx, dy, stackBtn(stackPos));
        });
        stage.addEventListener('pointerup', function (e) {
          if (e.pointerId !== active) return;
          active = null;
          stage.classList.remove('is-dragging');
          if (stage.releasePointerCapture) stage.releasePointerCapture(e.pointerId);
          var dx = e.clientX - sx, dy = e.clientY - sy;
          clearTilt();
          if (!stackMode) return;
          var threshold = Math.max(56, stage.getBoundingClientRect().width * 0.12);
          var tap = moved < 10 && Date.now() - startedAt < 600;
          var swiped = Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy);
          if (!tap && !swiped) return;
          advanceStack(swiped ? (dx < 0 ? -1 : 1) : 1);
        });
        stage.addEventListener('pointercancel', function (e) {
          if (e.pointerId !== active) return;
          active = null;
          stage.classList.remove('is-dragging');
          clearTilt();
        });

        layoutStack();
      }
      bindStack();
      bindPackRip();

      all.addEventListener('click', function () {
        if (stackLocked || !stackMode) return;
        toGrid();
      });
    }

    function summary(cards) {
      var fresh = cards.filter(function (c) { return c.ownedAfter === 1; }).length;
      var copies = cards.filter(function (c) { return !c.duplicateAtCap && c.ownedAfter > 1; }).length;
      var remnants = cards.reduce(function (n, c) { return n + (c.remnantsAwarded || 0); }, 0);
      var bits = [];
      if (fresh) bits.push(fresh + ' new');
      if (copies) bits.push(copies + ' extra cop' + (copies === 1 ? 'y' : 'ies'));
      if (remnants) bits.push(remnants.toLocaleString() + ' remnants');
      return bits.length ? bits.join(' \u00b7 ') : 'Nothing gained';
    }
  }

  // Fallback face for a pulled card the loaded catalog does not carry.
  function cardPlate(card) {
    return '<span class="sg-flip-plate" style="--el:' + color(card.element) + '">' +
      '<img src="' + esc(icon(card.element)) + '" alt="">' +
      '<b>' + esc(card.name) + '</b>' +
      '<i class="sg-rar ' + esc(String(card.rarity || '').toLowerCase()) + '"></i>' +
    '</span>';
  }

  function authHeaders() {
    var headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    try {
      var token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token && token !== 'cookie') headers.Authorization = 'Bearer ' + token;
    } catch (e) { /* private mode */ }
    return headers;
  }

  /* ---------- profile ----------
     The redesign shipped this screen hard-coded: the crest always drew
     GALLERY[2], the avatar was always an initial, and the Showcase rail was a
     literal `pick(['bearzooka','pylord','conchious','gymstone'])`. Everything a
     player had chosen about their own profile - background art, title, avatar
     style, card back, favourite card and the three showcase cards - was already
     stored server-side under /api/profile/settings and simply not read.

     This reads it, renders from it, and gives it back an editor. The endpoint is
     the same one the legacy hub writes, so a profile customised on either
     surface shows up on both. */

  // Whatever /api/profile/settings last returned, normalised. Null until the
  // gated fetch lands (or forever, for a guest), and every reader falls back to
  // the concept defaults rather than rendering an empty crest.
  var PREFS = null;
  // The editor edits a copy. Nothing touches PREFS until the server has accepted
  // the save, so a failed request leaves the rendered profile exactly as it was.
  var PROFILE_DRAFT = null;
  var PROFILE_SHOWCASE_MAX = 3;

  var PROFILE_ELEMENTS = ['FIRE', 'ICE', 'EARTH', 'WIND', 'WATER', 'ELECTRIC',
                          'METAL', 'POISON', 'PSYCHIC', 'UNDEAD', 'LIGHT', 'SHADOW', 'NEUTRAL'];

  // The premade backs, named exactly as the legacy hub names them, because the
  // stored value is the NAME and the two surfaces have to agree on it.
  var CARD_BACKS = [
    { name: 'Molten Sigil', element: 'FIRE' },
    { name: 'Tidal Sigil', element: 'WATER' },
    { name: 'Frost Sigil', element: 'ICE' },
    { name: 'Gale Sigil', element: 'WIND' },
    { name: 'Stone Sigil', element: 'EARTH' },
    { name: 'Storm Sigil', element: 'ELECTRIC' },
    { name: 'Iron Sigil', element: 'METAL' },
    { name: 'Venom Sigil', element: 'POISON' },
    { name: 'Mind Sigil', element: 'PSYCHIC' },
    { name: 'Umbral Sigil', element: 'SHADOW' },
    { name: 'Radiant Sigil', element: 'LIGHT' },
    { name: 'Spectral Sigil', element: 'UNDEAD' }
  ];

  function cardBackEntry(name) {
    var wanted = String(name || '').trim().toLowerCase();
    for (var i = 0; i < CARD_BACKS.length; i++) {
      if (CARD_BACKS[i].name.toLowerCase() === wanted) return CARD_BACKS[i];
      if (CARD_BACKS[i].element.toLowerCase() === wanted) return CARD_BACKS[i];
    }
    return null;
  }
  function cardBackArt(entry) {
    return webp('/img/decks/card-back-' + String(entry.element).toLowerCase() + '.png');
  }

  function normalizePrefs(raw) {
    if (!raw) return null;
    return {
      displayName: raw.displayName || '',
      avatarMode: raw.avatarMode === 'ELEMENT' ? 'ELEMENT' : 'INITIAL',
      avatarUrl: raw.avatarUrl || '',
      favoriteElement: String(raw.favoriteElement || 'FIRE').toUpperCase(),
      profileArtId: raw.profileArtId || '',
      playerTitleId: raw.playerTitleId || '',
      playerTitle: raw.playerTitle || '',
      bio: raw.bio || '',
      preferredCardBack: raw.preferredCardBack || '',
      favoriteCardId: raw.favoriteCardId || raw.favoriteSieglingId || '',
      favoriteCardVariant: raw.favoriteCardVariant === 'HOLOGRAPHIC' ? 'HOLOGRAPHIC' : 'STANDARD',
      favoriteCardIds: (raw.favoriteCardIds || []).filter(Boolean).slice(0, PROFILE_SHOWCASE_MAX)
    };
  }

  function prefs() { return PREFS || {}; }

  // Cards the account actually owns. `ownedCards` is an id -> copies map; when it
  // is absent (guest, or the offline preview board) every catalog card is
  // offered, because there is nothing to filter against and an empty picker is
  // worse than a permissive one.
  function ownedPool(opts) {
    var owned = opts && opts.live && opts.live.ownedCards;
    if (!owned) return ALL_CARDS.slice();
    return ALL_CARDS.filter(function (c) { return c && Number(owned[c.id]) > 0; });
  }

  function profileArtPiece(id) {
    if (!id) return null;
    var pieces = galleryPieces();
    for (var i = 0; i < pieces.length; i++) if (pieces[i].id === id) return pieces[i];
    return null;
  }

  // The chosen gallery piece, or the concept plate it always used to draw.
  function crestBackground() {
    var piece = profileArtPiece(prefs().profileArtId);
    if (piece) return piece.full || piece.thumb;
    return plate(scene('bearnade-payload'));
  }

  function crestElement() {
    var fav = byIdIn(ALL_CARDS, prefs().favoriteCardId);
    if (fav && fav.element) return fav.element;
    return prefs().favoriteElement || 'NEUTRAL';
  }

  // Three ways to wear a face, in the order the stored settings resolve them: an
  // uploaded image, the favourite element's notch, or the first initial.
  function crestAvatar(opts) {
    var p = prefs();
    if (p.avatarUrl) {
      return '<span class="sg-crest-ring"><img src="' + esc(p.avatarUrl) + '" alt=""></span>';
    }
    if (p.avatarMode === 'ELEMENT') {
      return '<span class="sg-crest-ring is-element"><img src="' + esc(icon(p.favoriteElement)) + '" alt=""></span>';
    }
    return '<span class="sg-crest-ring"><i>' + esc(accountInitial(opts)) + '</i></span>';
  }

  // The concept's Showcase was four hand-picked ids. It is now the player's own
  // three, falling back to those ids only while nothing has been chosen.
  function showcaseCards() {
    var p = prefs();
    var chosen = mergeFavorite(p.favoriteCardIds, p.favoriteCardId);
    if (chosen.length) return chosen;
    return pickPresent(['bearzooka', 'pylord', 'conchious', 'gymstone']).slice(0, PROFILE_SHOWCASE_MAX);
  }

  // The favourite card always stands in the showcase, first and framed, so the
  // two never disagree: it leads the player's own picks (up to three) and is
  // never listed twice.
  function mergeFavorite(ids, favoriteId) {
    var fav = favoriteId ? byIdIn(ALL_CARDS, favoriteId) : null;
    var rest = (ids || []).filter(function (id) { return id && id !== favoriteId; }).map(function (id) {
      return byIdIn(ALL_CARDS, id);
    }).filter(Boolean).slice(0, PROFILE_SHOWCASE_MAX);
    return (fav ? [fav] : []).concat(rest);
  }

  function featTile(c, favoriteId) {
    var fav = favoriteId && c.id === favoriteId;
    return '<article class="sg-feat' + (fav ? ' is-favorite' : '') + '" data-card="' + esc(c.id) + '" tabindex="0" style="--el:' + color(c.element) + '">' +
      (fav ? '<span class="sg-feat-fav">\u2605 Favorite</span>' : '') +
      '<div class="sg-feat-plate"></div>' +
      '<div class="sg-feat-art"><img ' + artAttrs(c.cardArtUrl) + ' alt="" loading="lazy"' +
      // The authored card-face size, carried to the tile so a grouped rail can
      // size these cards against each other instead of each to its own frame.
      (c.cardArtScale != null ? ' data-art-scale="' + esc(c.cardArtScale) + '"' : '') + '></div>' +
      '<div class="sg-feat-foot"><span class="sg-feat-name">' + esc(c.name) + '</span>' +
      '<span class="sg-feat-marks"><i class="sg-rar ' + esc(String(c.rarity || '').toLowerCase()) + '"></i>' +
      '<img src="' + icon(c.element) + '" alt=""></span></div>' +
    '</article>';
  }

  // The six badges and their earned/unearned states were invented, as was the
  // "All 42" beside them: no endpoint reports a badge, so the section is gone
  // rather than decorated with fiction. Recent now reads the account's own
  // match history, which /api/player/progression really does return.
  function recentMarkup(opts, limit) {
    limit = limit || 5;
    var live = opts.live || {};
    var review = window.SiegelingsMatchReview;
    var hist = live.matchHistory || [];
    var sieges = live.siegeHistory || [];
    if (!hist.length && !sieges.length) {
      return '<div class="sg-empty-row">' +
        esc(opts.guest ? 'Sign in to keep a match record.' : 'No matches recorded yet.') +
      '</div>';
    }
    // Each row opens its review (js/match-review.js); without that script the
    // list still renders as plain rows.
    if (review) {
      return '<div class="sg-stack sg-stack-tight">' +
        review.mergeRecent(hist, sieges, limit).map(review.rowMarkup).join('') + '</div>';
    }
    return '<div class="sg-stack sg-stack-tight">' + hist.slice(0, limit).map(function (m) {
      var won = m.result === 'WIN' || m.result === 'win' || m.won === true;
      var mode = title(m.matchType || 'Match');
      var against = m.opponentName ? 'vs ' + m.opponentName : (m.loadoutLabel || '');
      return '<div class="sg-recent' + (won ? ' is-win' : '') + '">' +
        '<span class="mode">' + esc(mode) + '</span>' +
        '<span class="what">' + esc(won ? 'Win' : 'Loss') +
          (against ? '<em>' + esc(against) + '</em>' : '') + '</span>' +
        '<span class="gain">' + esc(m.turnNumber != null ? 'T' + m.turnNumber : '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  // Progression only answers for a signed-in player, so the bar states that
  // rather than inventing a number.
  /* Collection completion.

     This read `ownedTotal / ALL_CARDS.length`, which is wrong twice over:
     ownedTotal counts every COPY a player holds (so duplicates pushed it past
     100% - 214% in one report) and ALL_CARDS is the catalog PLUS the SiegeKnight
     cards spliced in for the binder, which are not in ownedCards at all and so
     can never be collected from this pool.

     The server decides it now (`collectedPercent`: distinct live cards owned over
     distinct live cards collectable) so the owner and a visitor to their profile
     cannot read two different numbers. This stays as the fallback for an older
     payload, computed the same way - distinct owned ids intersected with the live
     catalog, knights excluded. Because the catalog the server serves is already
     filtered to the elements that are switched on, an element unlocking later
     widens the denominator on its own and every percentage adjusts with it. */
  function collectibleCards() {
    return ALL_CARDS.filter(function (c) {
      return c && String(c.type || 'SIEGLING').toUpperCase() !== 'SIEGEKNIGHT';
    });
  }

  function collectionCounts(live) {
    if (!live) return null;
    var pool = collectibleCards();
    var owned = live.ownedCards;
    if (owned && pool.length) {
      var held = 0;
      for (var i = 0; i < pool.length; i++) {
        if (Number(owned[pool[i].id]) > 0) held++;
      }
      return { held: held, total: pool.length };
    }
    // No per-card map on this payload, but the server counted for us.
    if (live.uniqueOwned != null && live.collectibleTotal) {
      return { held: live.uniqueOwned, total: live.collectibleTotal };
    }
    return null;
  }

  function collectedPercent(live) {
    if (!live) return null;
    if (live.collectedPercent != null) return Math.round(live.collectedPercent);
    var counts = collectionCounts(live);
    return counts && counts.total ? Math.round(counts.held / counts.total * 100) : null;
  }

  function profileTiles(opts) {
    var live = opts.live || {};
    var hist = live.matchHistory || [];
    var played = hist.length || null;
    var wins = hist.filter(function (m) { return m && (m.won === true || m.result === 'WIN'); }).length;
    var rate = played ? Math.round(wins / played * 100) + '%' : '—';
    var pct = collectedPercent(live);
    var owned = pct == null ? '—' : pct + '%';
    return '<div class="sg-tiles is-four" data-prof-block="tiles">' +
      '<div><span>Matches</span><b>' + esc(played != null ? played : '—') + '</b></div>' +
      '<div><span>Win Rate</span><b>' + esc(rate) + '</b></div>' +
      '<div><span>Collected</span><b>' + esc(owned) + '</b></div>' +
      '<div><span>Siege Best</span><b>' + esc(siegeBest(live.siegeBestScore, live.siegeHistory)) + '</b></div>' +
    '</div>';
  }

  // The progression record holds the best score ever banked; the recent run
  // list is a fallback for a payload that predates it.
  function siegeBest(best, runs) {
    var n = Number(best) || 0;
    (runs || []).forEach(function (r) { if (r && Number(r.score) > n) n = Number(r.score); });
    return n > 0 ? n.toLocaleString() : '—';
  }

  // This drew an XP bar toward an account level. Neither exists: the backend
  // tracks gold, remnants and per-knight levels, and nothing else about a
  // player's "progress". So it reports the purse, which is real, and says
  // plainly when there is nothing to report.
  function xpMarkup(opts) {
    var live = opts.live || {};
    if (opts.guest) return '<span class="sg-xp-note">Sign in to track your collection</span>';
    var bits = [];
    if (live.gold != null) bits.push(Number(live.gold).toLocaleString() + ' Siegecoins');
    if (live.remnants != null) bits.push(Number(live.remnants).toLocaleString() + ' remnants');
    if (live.knights && live.knights.length) {
      bits.push(live.knights.length + ' SiegeKnight' + (live.knights.length === 1 ? '' : 's'));
    }
    if (!bits.length) return '<span class="sg-xp-note">Loading your account…</span>';
    return '<span class="sg-xp-note">' + esc(bits.join(' · ')) + '</span>';
  }

  // A real one-liner about the account, or an honest "Signed out".
  function profileSubtitle(opts) {
    if (opts.guest) return 'Signed out';
    var live = opts.live || {};
    var bits = [];
    if (live.siegeWins) bits.push(live.siegeWins + ' Siege win' + (live.siegeWins === 1 ? '' : 's'));
    if (live.matchHistory && live.matchHistory.length) {
      bits.push(live.matchHistory.length + ' recorded match' + (live.matchHistory.length === 1 ? '' : 'es'));
    }
    return bits.length ? bits.join(' · ') : 'Signed in';
  }

  // The favourite card and the card back a player will see across the table.
  // Favorite used to paint the bare cutout, which sat tiny at the foot of the
  // slot while the card back filled its box - the same composed face the binder
  // and card sheet already show, scaled to fill the slot the same way.
  function favoriteFace(card) {
    if (!card) return '';
    var visual = window.SieglingsCardBinderVisual;
    if (String(card.type || '').toUpperCase() === 'SIEGEKNIGHT') {
      var knight = knightCard(card);
      if (knight) return knight;
    }
    if (visual && visual.renderBinderCardPreview) {
      return visual.renderBinderCardPreview(card, {
        previewClass: 'detail-card-preview sg-sig-showcase',
        descriptionText: cardFaceText(card)
      });
    }
    if (visual && visual.renderBinderCardTile) {
      return visual.renderBinderCardTile(card, { descriptionText: cardFaceText(card) });
    }
    return '<img ' + artAttrs(card.cardArtUrl) + ' alt="' + esc(card.name) + '" loading="lazy">';
  }

  function signatureSection(opts) {
    var back = cardBackEntry(prefs().preferredCardBack) || CARD_BACKS[0];
    // The favourite card now leads the showcase, so Signature is the card back.
    return '<section class="sg-section" data-prof-block="signature">' +
      '<div class="sg-section-head"><h3>Card back</h3>' +
        (opts.guest ? '' : '<a href="#" data-prof-open="favorite">Change</a>') + '</div>' +
      '<div class="sg-sig is-back-only">' +
        '<div class="sg-sig-slot">' +
          '<span class="sg-sig-label">Card back</span>' +
          '<div class="sg-sig-back"><img src="' + esc(cardBackArt(back)) + '" alt="' + esc(back.name) + '"></div>' +
          '<span class="sg-sig-name">' + esc(back.name) + '</span>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function profileNavigation(opts, active) {
    var items = [['profile', 'Profile', 'profile'], ['friends', 'Friends', 'social'],
      ['messages', 'Messages', 'social'], ['lobbies', 'Lobbies', 'lobbies']];
    return '<nav class="sg-profile-nav" aria-label="Profile and social">' + items.map(function (item) {
      var social = item[2] === 'social' ? ' data-social-goto="' + item[0] + '"' : '';
      return '<a class="sg-gtab' + (active === item[0] ? ' on' : '') + '" href="' + pathForScreen(item[2]) +
        '" data-screen="' + item[2] + '"' + social + (active === item[0] ? ' aria-current="page"' : '') + '>' +
        '<span class="sg-gtab-art">' + hubPanelImage(item[0]) + '</span>' +
        '<span class="sg-gtab-label">' + item[1] + '</span><i class="sg-gtab-gem"></i>' +
        (item[0] === 'messages' && unreadThreadCount(opts) ? '<i class="sg-tab-badge">' + esc(unreadThreadCount(opts)) + '</i>' : '') + '</a>';
    }).join('') + '<button class="sg-gtab" type="button" data-profile-history aria-pressed="false"><span class="sg-gtab-art">' + hubPanelImage('history') + '</span><span class="sg-gtab-label">Recent matches</span><i class="sg-gtab-gem"></i></button></nav>';
  }

  /* Match history is a view of the profile, not a popup: the Recent matches
     plate swaps the profile's blocks for the full list in the same space, the
     list swelling out of the plate the way Home's panels grow from their
     buttons. The Profile plate (or the list's close) swaps back. From Friends,
     Messages or Lobbies the plate opens the profile straight on the list. */
  var PROFILE_HISTORY_LIMIT = 40;
  var profileOpenHistory = false;
  var PROFILE_VIEW_CLOSE_MS = 200;

  function profileHistoryMarkup(opts) {
    var live = opts.live || {};
    var hist = live.matchHistory || [];
    var wins = hist.filter(function (m) { return m && (m.won === true || String(m.result).toUpperCase() === 'WIN'); }).length;
    var runs = (live.siegeHistory || []).length;
    var bits = [];
    if (hist.length) bits.push(wins + 'W \u2013 ' + (hist.length - wins) + 'L');
    if (runs) bits.push(runs + ' Siege run' + (runs === 1 ? '' : 's'));
    return '<section class="sg-section sg-prof-history" data-prof-block="history" hidden aria-label="Match history">' +
      '<header class="sg-prof-history-head">' +
        '<div><h3>Match history</h3>' + (bits.length ? '<p>' + esc(bits.join(' \u00b7 ')) + '</p>' : '') + '</div>' +
        '<button type="button" class="sg-prof-history-x" data-prof-history-close aria-label="Back to profile">&times;</button>' +
      '</header>' +
      '<div class="sg-prof-history-list">' + recentMarkup(opts, PROFILE_HISTORY_LIMIT) + '</div>' +
    '</section>';
  }

  // Grow from (or shrink back into) `from`: the origin is its centre in the
  // panel's own coordinates, as aimSheet does for Home's panels.
  function aimFrom(panel, from) {
    var box = panel.getBoundingClientRect();
    var r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
    panel.style.setProperty('--sheet-ox', Math.round(r && r.width ? r.left + r.width / 2 - box.left : box.width / 2) + 'px');
    panel.style.setProperty('--sheet-oy', Math.round(r && r.height ? r.top + r.height / 2 - box.top : 0) + 'px');
  }

  function setProfileView(app, history, animate) {
    var layout = app.querySelector('.sg-prof-layout');
    var panel = layout && layout.querySelector('[data-prof-block="history"]');
    if (!panel) return false;
    var plate = app.querySelector('[data-profile-history]');
    var home = app.querySelector('.sg-profile-nav [data-screen="profile"]');
    var showing = layout.classList.contains('is-history');
    if (plate) { plate.classList.toggle('on', history); plate.setAttribute('aria-pressed', String(history)); }
    if (home) home.classList.toggle('on', !history);
    if (history === showing && !panel.classList.contains('is-closing')) return true;
    clearTimeout(layout.__viewTimer);
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (history) {
      panel.classList.remove('is-closing');
      panel.hidden = false;
      layout.classList.add('is-history');
      layout.classList.remove('is-returning');
      if (animate && !still) {
        aimFrom(panel, plate);
        panel.classList.remove('is-opening'); void panel.offsetWidth; panel.classList.add('is-opening');
      }
      var list = panel.querySelector('.sg-prof-history-list');
      if (list) list.scrollTop = 0;
      return true;
    }
    function done() {
      panel.hidden = true;
      panel.classList.remove('is-opening', 'is-closing');
      layout.classList.remove('is-history');
      layout.classList.remove('is-returning'); void layout.offsetWidth; layout.classList.add('is-returning');
    }
    if (!animate || still) { done(); return true; }
    aimFrom(panel, plate);
    panel.classList.remove('is-opening');
    panel.classList.add('is-closing');
    layout.__viewTimer = setTimeout(done, PROFILE_VIEW_CLOSE_MS);
    return true;
  }

  function mountProfileNavigation(app, opts) {
    if (profileOpenHistory) { profileOpenHistory = false; setProfileView(app, true, true); }
    app.addEventListener('click', function (event) {
      if (!event.target.closest) return;
      var plate = event.target.closest('[data-profile-history]');
      if (plate) {
        var layout = app.querySelector('.sg-prof-layout');
        // Friends, Messages and Lobbies carry no profile: open it on the list.
        if (!layout) {
          profileOpenHistory = true;
          if (onNavigate) onNavigate('profile');
          return;
        }
        setProfileView(app, !layout.classList.contains('is-history'), true);
        return;
      }
      if (event.target.closest('[data-prof-history-close]')) { setProfileView(app, false, true); return; }
      // The Profile plate, while the list is showing, swaps back in place
      // rather than re-rendering the screen it is already on.
      var home = event.target.closest('.sg-profile-nav [data-screen="profile"]');
      var open = app.querySelector('.sg-prof-layout.is-history');
      if (home && open) {
        event.preventDefault();
        event.stopPropagation();
        setProfileView(app, false, true);
      }
    });
    app.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && app.querySelector('.sg-prof-layout.is-history') &&
          !app.querySelector('.sg-sheet.open')) setProfileView(app, false, true);
    });
  }

  function profileBackdrop() {
    return '<div class="sg-profile-backdrop" aria-hidden="true"><img src="' + esc(crestBackground()) + '" alt=""></div>';
  }

  /* Landscape and desktop carry the crest's details in the header's empty
     middle instead of a bubble: avatar, name, title and rank on one line, and
     below it one line of flavour that cycles through everything the crest
     said (record, purse, bio, favourite). Hidden in portrait, where the crest
     stays. */
  function profileFlavorLines(opts) {
    var p = prefs(), live = opts.live || {}, lines = [];
    if (p.bio) lines.push('\u201c' + p.bio + '\u201d');
    var record = profileSubtitle(opts);
    if (record && record !== 'Signed in') lines.push(record);
    var purse = [];
    if (live.gold != null) purse.push(Number(live.gold).toLocaleString() + ' Siegecoins');
    if (live.remnants != null) purse.push(Number(live.remnants).toLocaleString() + ' remnants');
    if (purse.length) lines.push(purse.join(' \u00b7 '));
    var fav = byIdIn(ALL_CARDS, p.favoriteCardId);
    if (fav) lines.push('Fights beside ' + fav.name + ', ' + title(fav.element) + ' ' + title(fav.rarity));
    if (live.knights && live.knights.length) {
      lines.push('Commands ' + live.knights.length + ' SiegeKnight' + (live.knights.length === 1 ? '' : 's'));
    }
    if (!lines.length) lines.push(opts.guest ? 'Sign in to keep your record' : 'A new legend takes the field');
    return lines;
  }
  function profileHeadMarkup(opts) {
    var p = prefs();
    var name = p.displayName || (opts.live && opts.live.displayName) || (opts.guest ? 'Guest' : 'Siegelord');
    var lines = profileFlavorLines(opts);
    return '<div class="sg-prof-head" style="--el:' + color(crestElement()) + '">' +
      crestAvatar(opts) +
      '<div class="sg-prof-head-text">' +
        '<div class="sg-prof-head-line"><strong>' + esc(name) + '</strong>' +
          (p.playerTitle ? '<span class="sg-crest-title">' + esc(p.playerTitle) + '</span>' : '') +
          (opts.guest ? '' : '<button class="sg-prof-head-edit" type="button" data-prof-open="look">Customize</button>') +
        '</div>' +
        '<p class="sg-prof-flavor" data-prof-flavor data-lines="' + esc(JSON.stringify(lines)) + '">' + esc(lines[0]) + '</p>' +
      '</div>' +
    '</div>';
  }
  var profFlavorTimer = null;
  // The strip ends where the header's chips begin, which varies with the coin
  // count and sign-in state, so it is measured rather than guessed.
  function fitProfileHead(app) {
    var head = app.querySelector('.sg-prof-head');
    if (!head || !head.getClientRects().length) return;
    var left = Infinity;
    [].forEach.call(app.querySelectorAll('.sg-top > *'), function (el) {
      if (el.classList.contains('sg-logo') || el.classList.contains('sg-logo-link') ||
          el.classList.contains('sg-top-spacer') || !el.getClientRects().length) return;
      left = Math.min(left, el.getBoundingClientRect().left);
    });
    if (left !== Infinity) head.style.setProperty('--prof-head-right', Math.max(12, window.innerWidth - left + 12) + 'px');
  }
  function mountProfileHead(app) {
    clearInterval(profFlavorTimer);
    fitProfileHead(app);
    if (!app.__profHeadResize) {
      app.__profHeadResize = true;
      window.addEventListener('resize', function () { fitProfileHead(app); });
    }
    var el = app.querySelector('[data-prof-flavor]');
    if (!el) return;
    var lines = [];
    try { lines = JSON.parse(el.getAttribute('data-lines') || '[]'); } catch (e) { lines = []; }
    if (lines.length < 2) return;
    var i = 0;
    profFlavorTimer = setInterval(function () {
      if (!el.isConnected) { clearInterval(profFlavorTimer); return; }
      el.classList.add('is-out');
      setTimeout(function () {
        i = (i + 1) % lines.length;
        el.textContent = lines[i];
        el.classList.remove('is-out');
      }, 380);
    }, 4200);
  }

  function profileScreen(opts) {
    return profileBackdrop() + topMarkup(opts) + profileHeadMarkup(opts) + profileNavigation(opts, 'profile') +
      '<div class="sg-scroll">' + profileBody(opts) + '</div>' +
      // mountSheet runs for this screen; without the host it had nothing to bind,
      // so tapping a showcase card here did nothing.
      sheetHost() +
      (opts.guest ? '' : profileEditorHost()) +
      // Profile is reached through Social now, so the Social tab is the one lit.
      bottomMarkup('social', opts);
  }

  /* The profile's own content, without chrome. The Social screen renders this as
     its first tab, and /profile still renders it as a screen of its own, so the
     two can never drift apart. */
  function profileBody(opts) {
    var cards = showcaseCards();
    /* The blocks carry data-prof-block so the desktop layer can place them in
       two columns without a second markup path. The wrapper is display:contents
       below 1024px, so the phone DOM order and rendering are unchanged. */
    return '<div class="sg-prof-layout">' +
        '<section class="sg-crest" data-prof-block="crest" style="--el:' + color(crestElement()) + '">' +
          '<img class="sg-crest-bg" src="' + esc(crestBackground()) + '" alt="">' +
          '<div class="sg-crest-veil"></div>' +
          (opts.guest ? ''
            : '<button class="sg-crest-edit" type="button" data-prof-open="look">Customize</button>') +
          '<div class="sg-crest-body">' +
            crestAvatar(opts) +
            '<h2>' + esc(prefs().displayName || (opts.live && opts.live.displayName) ||
                         (opts.guest ? 'Guest' : 'Siegelord')) + '</h2>' +
            (prefs().playerTitle
              ? '<span class="sg-crest-title">' + esc(prefs().playerTitle) + '</span>' : '') +
            '<p>' + esc(profileSubtitle(opts)) + '</p>' +
            xpMarkup(opts) +
            (prefs().bio ? '<p class="sg-crest-bio" title="' + esc(prefs().bio) + '">' + esc(prefs().bio) + '</p>' : '') +
          '</div>' +
        '</section>' +
        profileTiles(opts) +
        '<section class="sg-section" data-prof-block="showcase">' +
          '<div class="sg-section-head"><h3>Showcase</h3>' +
            (opts.guest
              ? '<a href="/cards" data-screen="collection">Browse</a>'
              : '<a href="#" data-prof-open="showcase">Change</a>') + '</div>' +
          '<div class="sg-swipe" data-art-fit-group="showcase" data-count="' + cards.length + '">' + cards.map(function (c) { return featTile(c, prefs().favoriteCardId); }).join('') + '</div>' +
        '</section>' +
        signatureSection(opts) +
        profileHistoryMarkup(opts) +
      '</div>';
  }

  /* ---------- profile editor ----------
     One bottom sheet, four tabs, because on a phone a nine-field form is a wall.
     Showcase is first and opens by default from the rail's Change, which is the
     thing a player comes here to do most often. */

  var PROFILE_TABS = [
    ['showcase', 'Showcase'], ['favorite', 'Signature'], ['look', 'Look'], ['details', 'Details']
  ];

  function profileEditorHost() {
    return '<div class="sg-sheet sg-prof-sheet" data-prof-sheet>' +
      '<div class="sg-sheet-card" data-prof-card></div></div>';
  }

  function draft() {
    if (!PROFILE_DRAFT) {
      var p = prefs();
      PROFILE_DRAFT = {
        displayName: p.displayName || '',
        avatarMode: p.avatarMode || 'INITIAL',
        avatarUrl: p.avatarUrl || '',
        favoriteElement: p.favoriteElement || 'FIRE',
        profileArtId: p.profileArtId || '',
        playerTitleId: p.playerTitleId || '',
        bio: p.bio || '',
        preferredCardBack: p.preferredCardBack || '',
        favoriteCardId: p.favoriteCardId || '',
        favoriteCardIds: (p.favoriteCardIds || []).slice(0, PROFILE_SHOWCASE_MAX)
      };
    }
    return PROFILE_DRAFT;
  }

  function pickTile(c, on, attr, badge) {
    return '<button class="sg-pick' + (on ? ' on' : '') + '" type="button" ' + attr + '="' + esc(c.id) + '" ' +
      'style="--el:' + color(c.element) + '">' +
      '<img ' + artAttrs(c.cardArtUrl) + ' alt="" loading="lazy">' +
      '<span class="sg-pick-name">' + esc(c.name) + '</span>' +
      (badge ? '<i class="sg-pick-badge">' + esc(badge) + '</i>' : '') +
    '</button>';
  }

  function emptyPickNote(opts) {
    return '<div class="sg-empty-row">' +
      esc(opts.live && opts.live.ownedCards
        ? 'Open packs to collect cards you can showcase.'
        : 'Your collection is still loading.') + '</div>';
  }

  function showcasePanel(opts) {
    var d = draft();
    var pool = ownedPool(opts);
    if (!pool.length) return emptyPickNote(opts);
    return '<p class="sg-prof-hint">Pick up to ' + PROFILE_SHOWCASE_MAX +
      ' cards. Tap a picked card to drop it. Your favourite card (set under Signature) always leads the showcase.</p>' +
      '<div class="sg-pick-grid">' + pool.map(function (c) {
        var at = d.favoriteCardIds.indexOf(c.id);
        return pickTile(c, at >= 0, 'data-pick-showcase', at >= 0 ? String(at + 1) : '');
      }).join('') + '</div>';
  }

  function favoritePanel(opts) {
    var d = draft();
    var pool = ownedPool(opts);
    return '<p class="sg-prof-hint">Your favourite card leads your showcase with a gold frame. Below, the back your decks wear.</p>' +
      (pool.length
        ? '<div class="sg-pick-grid">' + pool.map(function (c) {
            return pickTile(c, c.id === d.favoriteCardId, 'data-pick-favorite', '');
          }).join('') + '</div>'
        : emptyPickNote(opts)) +
      '<h4 class="sg-prof-sub">Card back</h4>' +
      '<div class="sg-back-row">' + CARD_BACKS.map(function (b) {
        return '<button class="sg-back' + (b.name === d.preferredCardBack ? ' on' : '') + '" type="button" ' +
          'data-pick-back="' + esc(b.name) + '">' +
          '<img src="' + esc(cardBackArt(b)) + '" alt="' + esc(b.name) + '">' +
          '<span>' + esc(b.name) + '</span></button>';
      }).join('') + '</div>';
  }

  function lookPanel(opts) {
    var d = draft();
    var pieces = galleryPieces();
    return '<h4 class="sg-prof-sub">Background</h4>' +
      (pieces.length
        ? '<div class="sg-bg-grid">' +
            '<button class="sg-bg' + (d.profileArtId ? '' : ' on') + '" type="button" data-pick-art="">' +
              '<span class="sg-bg-none">Default</span></button>' +
            // Only art the player owns can be a background; the rest waits in
            // the Unowned list below until its achievement is earned.
            pieces.filter(function (p) { return !galleryLock(p.id); }).map(function (p) {
              return '<button class="sg-bg' + (p.id === d.profileArtId ? ' on' : '') + '" type="button" ' +
                'data-pick-art="' + esc(p.id) + '">' +
                '<img ' + artAttrs(p.thumb, 320) + ' alt="' + esc(p.title) + '" loading="lazy">' +
                '<span>' + esc(p.title) + '</span></button>';
            }).join('') + '</div>' + galleryEarnedLine(pieces, 'sg-bg-earned') +
            (pieces.some(function (p) { return galleryLock(p.id); })
              ? '<details class="sg-bg-unowned"><summary>Unowned backgrounds</summary>' + unownedArtList(pieces) + '</details>'
              : '')
        : '<div class="sg-empty-row">The gallery has not loaded yet.</div>') +
      '<h4 class="sg-prof-sub">Icon style</h4>' +
      '<div class="sg-chip-row">' +
        '<button class="sg-chip-opt' + (d.avatarMode === 'INITIAL' ? ' on' : '') + '" type="button" ' +
          'data-pick-avatar="INITIAL">First initial</button>' +
        '<button class="sg-chip-opt' + (d.avatarMode === 'ELEMENT' ? ' on' : '') + '" type="button" ' +
          'data-pick-avatar="ELEMENT">Element notch</button>' +
      '</div>' +
      '<h4 class="sg-prof-sub">Favorite element</h4>' +
      '<div class="sg-el-row">' + PROFILE_ELEMENTS.map(function (el) {
        return '<button class="sg-el' + (el === d.favoriteElement ? ' on' : '') + '" type="button" ' +
          'data-pick-element="' + esc(el) + '" style="--el:' + color(el) + '" ' +
          'aria-label="' + esc(title(el)) + '"><img src="' + esc(icon(el)) + '" alt=""></button>';
      }).join('') + '</div>';
  }

  // Titles are a real unlock: the catalog reports every one with an `unlocked`
  // flag, and the server rejects a locked id outright, so the locked ones are
  // shown (they are the reason to keep playing) but cannot be picked.
  function titlePanel(opts) {
    var d = draft();
    var titles = (opts.live && opts.live.titles) || [];
    if (!titles.length) {
      return '<div class="sg-empty-row">No titles have loaded yet.</div>';
    }
    return '<div class="sg-title-list">' + titles.map(function (t) {
      var on = t.id === d.playerTitleId;
      return '<button class="sg-title-opt' + (on ? ' on' : '') + (t.unlocked ? '' : ' locked') + '" ' +
        'type="button"' + (t.unlocked ? ' data-pick-title="' + esc(t.id) + '"' : ' disabled') + '>' +
        '<strong>' + esc(t.label) + '</strong>' +
        '<em>' + esc(t.unlocked ? (t.description || '') : 'Locked') + '</em></button>';
    }).join('') + '</div>';
  }

  function detailsPanel(opts) {
    var d = draft();
    return '<label class="sg-prof-field"><span>Display name</span>' +
        '<input type="text" maxlength="20" data-prof-input="displayName" value="' + esc(d.displayName) + '"></label>' +
      '<label class="sg-prof-field"><span>Status message</span>' +
        '<input type="text" maxlength="240" data-prof-input="bio" value="' + esc(d.bio) + '" ' +
        'placeholder="Say something on your crest"></label>' +
      '<label class="sg-prof-field"><span>Avatar image URL</span>' +
        '<input type="url" maxlength="500" data-prof-input="avatarUrl" value="' + esc(d.avatarUrl) + '" ' +
        'placeholder="Leave blank to use your icon style"></label>' +
      '<h4 class="sg-prof-sub">Title</h4>' + titlePanel(opts);
  }

  function profileEditorMarkup(opts, tab) {
    var panels = { showcase: showcasePanel, favorite: favoritePanel, look: lookPanel, details: detailsPanel };
    var active = panels[tab] ? tab : 'showcase';
    return '<div class="sg-sheet-grab"></div>' +
      '<div class="sg-prof-sheet-head"><h3>Customize profile</h3>' +
        '<button class="sg-prof-x" type="button" data-prof-close aria-label="Close">×</button></div>' +
      '<div class="sg-sheet-tabs" role="tablist">' + PROFILE_TABS.map(function (t) {
        return '<button class="sg-sheet-tab' + (t[0] === active ? ' on' : '') + '" type="button" role="tab" ' +
          'aria-selected="' + (t[0] === active) + '" data-prof-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="sg-prof-panel" data-prof-panel>' + panels[active](opts) + '</div>' +
      '<p class="sg-prof-error" data-prof-error hidden></p>' +
      '<div class="sg-prof-actions">' +
        '<button class="sg-prof-cancel sn-flank is-left" type="button" data-prof-close>Cancel</button>' +
        '<button class="sg-prof-save sn-flank is-right is-gold" type="button" data-prof-save>Save</button>' +
      '</div>';
  }

  // Re-render the profile in place after a save, the way the decks screen does:
  // a router navigation would push a duplicate history entry for the screen the
  // player is already on.
  function refreshProfile(opts) {
    var current = document.querySelector('.sg-app [data-prof-sheet]');
    if (!current) return;
    var app = current.closest('.sg-app');
    var scroll = app.querySelector('.sg-scroll');
    var scrollTop = scroll ? scroll.scrollTop : 0;
    var next = render(document.createElement('div'), 'profile', opts);
    app.replaceWith(next);
    var nextScroll = next.querySelector('.sg-scroll');
    if (nextScroll) nextScroll.scrollTop = scrollTop;
  }

  function mountProfile(app, opts) {
    var sheet = app.querySelector('[data-prof-sheet]');
    if (!sheet) return;
    var card = sheet.querySelector('[data-prof-card]');
    var tab = 'showcase';

    // A pick repaints the whole panel to refresh the selected/badge state, which
    // threw the player back to the top of a long grid (and the card-back row back
    // to its first back). Picks carry the scroll positions across the rebuild;
    // only opening the sheet or changing tab starts at the top.
    function paint(keepScroll) {
      var kept = null;
      if (keepScroll) {
        var oldPanel = card.querySelector('[data-prof-panel]');
        if (oldPanel) {
          kept = { top: oldPanel.scrollTop, rows: [] };
          oldPanel.querySelectorAll('.sg-back-row, .sg-el-row, .sg-chip-row').forEach(function (row) {
            kept.rows.push(row.scrollLeft);
          });
        }
      }
      card.innerHTML = profileEditorMarkup(opts, tab);
      card.scrollTop = 0;
      if (!kept) return;
      var panel = card.querySelector('[data-prof-panel]');
      if (!panel) return;
      panel.scrollTop = kept.top;
      panel.querySelectorAll('.sg-back-row, .sg-el-row, .sg-chip-row').forEach(function (row, i) {
        if (kept.rows[i]) row.scrollLeft = kept.rows[i];
      });
    }
    // Opens like Home's panels: the card swells out of the button that was
    // tapped, and shrinks back toward it on close.
    var opener = null, closing = null;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    function open(which, from) {
      clearTimeout(closing); closing = null;
      sheet.classList.remove('is-closing');
      tab = which || 'showcase';
      PROFILE_DRAFT = null;
      draft();
      paint();
      opener = from || null;
      sheet.classList.add('open');
      if (still && still.matches) return;
      aimFrom(card, opener);
      sheet.classList.remove('is-opening'); void sheet.offsetWidth; sheet.classList.add('is-opening');
    }
    function close() {
      PROFILE_DRAFT = null;
      if (!sheet.classList.contains('open') || closing) return;
      if (still && still.matches) { sheet.classList.remove('open', 'is-opening'); return; }
      aimFrom(card, opener && opener.isConnected ? opener : null);
      sheet.classList.remove('is-opening');
      sheet.classList.add('is-closing');
      closing = setTimeout(function () {
        closing = null;
        sheet.classList.remove('open', 'is-closing');
      }, PROFILE_VIEW_CLOSE_MS);
    }
    function fail(message) {
      var box = card.querySelector('[data-prof-error]');
      if (!box) return;
      box.textContent = message || '';
      box.hidden = !message;
    }

    app.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-prof-open]') : null;
      if (btn && !sheet.contains(btn)) {
        e.preventDefault();
        open(btn.getAttribute('data-prof-open'), btn);
      }
    });
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet) { close(); return; }
      if (!e.target.closest) return;
      var d = draft();

      var tabBtn = e.target.closest('[data-prof-tab]');
      if (tabBtn) { tab = tabBtn.getAttribute('data-prof-tab'); paint(); return; }
      if (e.target.closest('[data-prof-close]')) { close(); return; }

      var show = e.target.closest('[data-pick-showcase]');
      if (show) {
        var id = show.getAttribute('data-pick-showcase');
        var at = d.favoriteCardIds.indexOf(id);
        var full = false;
        if (at >= 0) d.favoriteCardIds.splice(at, 1);
        else if (d.favoriteCardIds.length < PROFILE_SHOWCASE_MAX) d.favoriteCardIds.push(id);
        else full = true;
        paint(true);
        // After the repaint: the rebuild recreates the error box hidden.
        if (full) fail('Drop one of your three picks first.');
        return;
      }
      var fav = e.target.closest('[data-pick-favorite]');
      if (fav) { d.favoriteCardId = fav.getAttribute('data-pick-favorite'); paint(true); return; }
      var back = e.target.closest('[data-pick-back]');
      if (back) { d.preferredCardBack = back.getAttribute('data-pick-back'); paint(true); return; }
      var art = e.target.closest('[data-pick-art]');
      if (art) { d.profileArtId = art.getAttribute('data-pick-art'); paint(true); return; }
      var avatar = e.target.closest('[data-pick-avatar]');
      if (avatar) { d.avatarMode = avatar.getAttribute('data-pick-avatar'); paint(true); return; }
      var element = e.target.closest('[data-pick-element]');
      if (element) { d.favoriteElement = element.getAttribute('data-pick-element'); paint(true); return; }
      var titleBtn = e.target.closest('[data-pick-title]');
      if (titleBtn) { d.playerTitleId = titleBtn.getAttribute('data-pick-title'); paint(true); return; }
      if (e.target.closest('[data-prof-save]')) save();
    });

    // Text fields are read on input rather than at save time, because a repaint
    // (switching tabs) rebuilds the panel and would otherwise drop what was typed.
    sheet.addEventListener('input', function (e) {
      var field = e.target.getAttribute && e.target.getAttribute('data-prof-input');
      if (field) draft()[field] = e.target.value;
    });

    function save() {
      var d = draft();
      var btn = card.querySelector('[data-prof-save]');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      fail('');
      var body = {
        avatarMode: d.avatarMode,
        avatarUrl: d.avatarUrl,
        favoriteElement: d.favoriteElement,
        profileArtId: d.profileArtId,
        bio: d.bio,
        preferredCardBack: d.preferredCardBack,
        favoriteCardIds: d.favoriteCardIds
      };
      // The server treats a blank display name, title or favourite as "leave it
      // alone", so they are only sent when they carry a value.
      if (d.displayName) body.displayName = d.displayName;
      if (d.playerTitleId) body.playerTitleId = d.playerTitleId;
      if (d.favoriteCardId) body.favoriteCardId = d.favoriteCardId;

      fetch('/api/profile/settings', {
        method: 'POST', credentials: 'same-origin',
        headers: authHeaders(), body: JSON.stringify(body)
      }).then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (data) {
          if (!data || data.error) {
            if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            fail((data && data.error) || 'Could not save your profile.');
            return;
          }
          PREFS = normalizePrefs(data.profileSettings) || PREFS;
          if (opts.live) opts.live.profileSettings = data.profileSettings;
          if (PREFS && PREFS.displayName && opts.live) opts.live.displayName = PREFS.displayName;
          close();
          refreshProfile(opts);
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
          fail('Could not reach the server.');
        });
    }
  }

  /* ---------- sign in ----------
     Sign In used to be a link to /login, which forwarded to the OLD hub: the one
     control a signed-out player is most likely to press took them straight out
     of the redesign. This is the same two endpoints the rest of the app uses
     (/api/auth/login and /api/auth/register), on the new design's own screen.

     It stores the returned token under the key game.js reads
     (`sieglingsAuthToken`) as well as relying on the `__session` cookie the
     endpoint sets, because the battle table authenticates with the Bearer token
     until the server confirms the cookie reached it. Signing in on the hub has
     to leave /play signed in too. */
  var AUTH_TOKEN_KEY = 'sieglingsAuthToken';

  function authScreen(opts) {
    opts = opts || {};
    var register = Boolean(opts.authMode === 'register');
    var authScene = scene('draco-brood');
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<section class="sg-crest sg-crest-short">' +
          '<img class="sg-crest-bg" src="' + plate(authScene) + '" alt="">' +
          '<div class="sg-crest-veil"></div>' +
          '<div class="sg-crest-body">' +
            '<h2>' + (register ? 'Join the arena' : 'Welcome back') + '</h2>' +
            '<p>' + (register ? 'An account keeps your decks, record and collection.'
                              : 'Sign in to pick up your decks and record.') + '</p>' +
          '</div>' +
        '</section>' +
        '<form class="sg-auth" data-auth novalidate>' +
          '<div class="sg-auth-tabs">' +
            '<button class="sg-auth-tab' + (register ? '' : ' on') + '" type="button" data-auth-mode="login">Log In</button>' +
            '<button class="sg-auth-tab' + (register ? ' on' : '') + '" type="button" data-auth-mode="register">Register</button>' +
          '</div>' +
          '<label class="sg-auth-field' + (register ? '' : ' is-hidden') + '" data-auth-name>' +
            '<span>Display name</span>' +
            '<input type="text" name="displayName" maxlength="20" autocomplete="nickname" placeholder="Your arena name">' +
          '</label>' +
          '<label class="sg-auth-field"><span>Email</span>' +
            '<input type="email" name="email" autocomplete="email" placeholder="you@example.com" required></label>' +
          '<label class="sg-auth-field"><span>Password</span>' +
            '<input type="password" name="password" autocomplete="current-password" placeholder="At least 6 characters" required></label>' +
          '<p class="sg-auth-error" data-auth-error hidden></p>' +
          '<button class="sg-auth-submit" type="submit" data-auth-submit>' +
            (register ? 'Create account' : 'Log in') + '</button>' +
          '<a class="sg-auth-guest" href="/home" data-screen="home">Continue as guest</a>' +
        '</form>' +
        '<div style="height:96px"></div>' +
      '</div>' +
      bottomMarkup('more', opts);
  }

  function storeAuthToken(token) {
    if (!token) return;
    try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch (e) { /* private mode */ }
  }

  function mountAuth(app) {
    var form = app.querySelector('[data-auth]');
    if (!form) return;
    var errorEl = form.querySelector('[data-auth-error]');
    var submit = form.querySelector('[data-auth-submit]');
    var nameField = form.querySelector('[data-auth-name]');
    var mode = form.querySelector('.sg-auth-tab.on').getAttribute('data-auth-mode');

    function setMode(next) {
      mode = next;
      [].slice.call(form.querySelectorAll('.sg-auth-tab')).forEach(function (t) {
        t.classList.toggle('on', t.getAttribute('data-auth-mode') === next);
      });
      nameField.classList.toggle('is-hidden', next !== 'register');
      form.querySelector('[name=password]').setAttribute(
        'autocomplete', next === 'register' ? 'new-password' : 'current-password');
      submit.textContent = next === 'register' ? 'Create account' : 'Log in';
      fail('');
    }

    function fail(message) {
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
    }

    [].slice.call(form.querySelectorAll('.sg-auth-tab')).forEach(function (tab) {
      tab.addEventListener('click', function () { setMode(tab.getAttribute('data-auth-mode')); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = {
        email: String(form.email.value || '').trim(),
        password: String(form.password.value || '')
      };
      if (!body.email || !body.password) { fail('Enter your email and password.'); return; }
      if (mode === 'register') {
        body.displayName = String(form.displayName.value || '').trim();
        if (!body.displayName) { fail('Choose a display name.'); return; }
      }
      fail('');
      submit.disabled = true;
      submit.textContent = 'Working…';
      fetch('/api/auth/' + mode, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (data) {
          if (!data || !data.authenticated) {
            submit.disabled = false;
            submit.textContent = mode === 'register' ? 'Create account' : 'Log in';
            fail((data && data.error) || 'That did not work. Try again.');
            return;
          }
          storeAuthToken(data.token);
          if (typeof saveCachedAuthProfile === 'function') saveCachedAuthProfile(data);
          // A full load, not an in-app swap: every screen reads the signed-in
          // payload at boot, so the whole hub has to re-fetch.
          window.location.href = '/home';
        })
        .catch(function () {
          submit.disabled = false;
          submit.textContent = mode === 'register' ? 'Create account' : 'Log in';
          fail('The server did not answer. Try again in a moment.');
        });
    });
  }

  // Deletion needs the literal word DELETE: AccountService rejects anything else,
  // so the button stays disabled until the player has typed it rather than
  // letting them press it and bounce off a server error.
  function mountDeleteAccount(app) {
    var host = app.querySelector('[data-danger]');
    if (!host) return;
    var panel = host.querySelector('[data-delete-panel]');
    var input = host.querySelector('[data-delete-input]');
    var go = host.querySelector('[data-delete-go]');
    var errorEl = host.querySelector('[data-delete-error]');

    function setError(message) {
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
    }
    function armed() { return String(input.value || '').trim() === 'DELETE'; }
    function sync() { go.disabled = !armed(); }

    host.querySelector('[data-delete-open]').addEventListener('click', function () {
      panel.hidden = false;
      setError('');
      sync();
      input.focus();
    });
    host.querySelector('[data-delete-cancel]').addEventListener('click', function () {
      panel.hidden = true;
      input.value = '';
      setError('');
    });
    input.addEventListener('input', function () { setError(''); sync(); });
    sync();

    go.addEventListener('click', function () {
      if (!armed()) return;
      go.disabled = true;
      go.textContent = 'Deleting\u2026';
      fetch('/api/auth/delete-account', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ confirmationText: 'DELETE' })
      }).then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (data) {
          if (!data || data.error) {
            go.disabled = false;
            go.textContent = 'Permanently delete';
            setError((data && data.error) || 'That did not work. Try again.');
            return;
          }
          try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch (e) { /* private mode */ }
          window.location.href = '/home';
        })
        .catch(function () {
          go.disabled = false;
          go.textContent = 'Permanently delete';
          setError('The server did not answer. Try again in a moment.');
        });
    });
  }

  function signOut() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(function () { /* the local clear below still matters */ })
      .then(function () {
        try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch (e) { /* private mode */ }
        window.location.href = '/home';
      });
  }

  /* ---------- leaderboard ----------
     `/api/leaderboards` returns {periods:{daily,weekly,...}, boards:{wins,
     matchesPlayed, spellsCast, trapsSprung, siegelingsDefeated, pvpWinRate}},
     each board a list of {rank, displayName, value, detail}. On this environment
     every board is currently empty (no match history yet), so the empty state is
     not an afterthought - it is what most players will see first. */
  var BOARD_META = {
    wins:               { label: 'Victories',   unit: 'wins',    el: 'FIRE',     icon: '⚔' },
    pvpWinRate:         { label: 'Win Rate',    unit: 'matches', el: 'LIGHT',    icon: '◈' },
    matchesPlayed:      { label: 'Matches',     unit: 'played',  el: 'WIND',     icon: '↻' },
    siegelingsDefeated: { label: 'Felled',      unit: 'downed',  el: 'SHADOW',   icon: '☠' },
    spellsCast:         { label: 'Strategies',  unit: 'cast',    el: 'PSYCHIC',  icon: '✧' },
    trapsSprung:        { label: 'Deceptions',  unit: 'sprung',  el: 'POISON',   icon: '✦' },
    // Best single Siege run in the period, not a sum - see LeaderboardService.
    siegeScore:         { label: 'Siege Score', unit: 'pts',     el: 'EARTH',    icon: '⛰', siege: true }
  };
  var BOARD_ORDER = ['wins', 'siegeScore', 'pvpWinRate', 'matchesPlayed', 'siegelingsDefeated', 'spellsCast', 'trapsSprung'];
  var PERIOD_LABEL = { daily: 'Today', weekly: 'This week', monthly: 'This month', year: 'This year', allTime: 'All time' };

  function boardRows(live, boardId, period) {
    var lb = live && live.leaderboards;
    if (!lb) return [];
    var scope = (period && lb.periods && lb.periods[period]) || lb.boards || {};
    return scope[boardId] || [];
  }

  function leaderboardSection(opts) {
    var live = opts.live;
    var period = opts.lbPeriod || (live && live.leaderboards && live.leaderboards.defaultPeriod) || 'daily';
    var boardId = opts.lbBoard || 'wins';
    var meta = BOARD_META[boardId] || BOARD_META.wins;
    var rows = boardRows(live, boardId, period);
    var periods = (live && live.leaderboards && live.leaderboards.periods)
      ? Object.keys(live.leaderboards.periods) : ['daily', 'weekly', 'allTime'];

    return '<section class="sg-section sg-lb" data-home-section="Hall of Siege" style="--el:' + color(meta.el) + '">' +
      '<div class="sg-section-head"><h3>Hall of Siege</h3>' +
        '<button type="button" class="sg-lb-cycle" data-lb-cycle>' +
        esc(PERIOD_LABEL[period] || title(period)) + ' ›</button></div>' +
      '<div class="sg-lb-boards">' + BOARD_ORDER.map(function (id) {
        var m = BOARD_META[id];
        return '<button class="sg-lb-chip' + (id === boardId ? ' on' : '') + '" type="button" data-lb-board="' + id +
          '" style="--el:' + color(m.el) + '" aria-pressed="' + (id === boardId) + '"><span>' + m.icon + '</span>' +
          '<b class="sg-lb-chip-label">' + esc(m.label) + '</b></button>';
      }).join('') + '</div>' +
      '<div class="sg-lb-body" data-lb-body>' +
        (rows.length ? rows.slice(0, 10).map(function (r, i) { return lbRow(r, i, meta); }).join('')
                     : lbEmpty(meta, period)) +
      '</div>' +
    '</section>';
  }

  function lbRow(row, i, meta) {
    var rank = row.rank != null ? row.rank : i + 1;
    var medal = rank <= 3 ? ' is-podium rank-' + rank : '';
    return '<div class="sg-lb-row' + medal + '">' +
      '<span class="sg-lb-rank">' + esc(rank) + '</span>' +
      '<span class="sg-lb-name">' + esc(row.displayName || '?') +
        (meta.siege && row.knightName ? '<em class="sg-lb-sub">' + esc(row.knightName) +
          (row.floorReached ? ' · F' + esc(row.floorReached) : '') + '</em>' : '') + '</span>' +
      '<span class="sg-lb-value">' + esc(row.detail || (Number(row.value || 0).toLocaleString() + ' ' + meta.unit)) + '</span>' +
    '</div>';
  }

  // Every board is empty until matches are played, so this is the common case,
  // not the exception - it gets artwork and a call to action rather than a dash.
  function lbEmpty(meta, period) {
    return '<div class="sg-lb-empty">' +
      '<img src="/img/gallery/hurricrane-skyruins.webp" alt="" loading="lazy">' +
      '<div class="sg-lb-empty-veil"></div>' +
      '<div class="sg-lb-empty-body">' +
        '<strong>The hall is empty</strong>' +
        '<p>No ' + esc(String(meta.label).toLowerCase()) + ' recorded ' +
        esc((PERIOD_LABEL[period] || title(period)).toLowerCase()) + '. Be the first name on it.</p>' +
        (meta.siege
          ? '<a class="sg-lb-cta" href="' + HREF.siege + '">Start an expedition ›</a>'
          : '<a class="sg-lb-cta" href="' + HREF.battle + '">Play a match ›</a>') +
      '</div>' +
    '</div>';
  }

  function mountLeaderboard(app, opts) {
    var section = app.querySelector('.sg-lb');
    if (!section) return;
    section.querySelectorAll('[data-lb-board]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        opts.lbBoard = chip.getAttribute('data-lb-board');
        redrawLeaderboard(app, opts);
      });
    });
    var cycle = section.querySelector('[data-lb-cycle]');
    if (cycle) cycle.addEventListener('click', function (e) {
      e.preventDefault();
      var lb = opts.live && opts.live.leaderboards;
      var keys = (lb && lb.periods) ? Object.keys(lb.periods) : ['daily', 'weekly', 'allTime'];
      var cur = keys.indexOf(opts.lbPeriod || (lb && lb.defaultPeriod) || 'daily');
      opts.lbPeriod = keys[(cur + 1) % keys.length];
      redrawLeaderboard(app, opts);
    });
  }

  function redrawLeaderboard(app, opts) {
    var section = app.querySelector('.sg-lb');
    if (!section) return;
    var holder = document.createElement('div');
    holder.innerHTML = leaderboardSection(opts);
    section.replaceWith(holder.firstChild);
    mountLeaderboard(app, opts);
  }

  /* ---------- deck builder ---------- */

  // Rules come from the catalog payload (deckBuilder.minDeckSize / maxCopies),
  // not from hardcoded numbers - the preset-deck shape (40 cards, 20/10/10) is a
  // different rule and does not govern a custom build.
  /* The builder edits ONE deck, held here between renders.

     It used to render `live.decks[0]` - always the same preset, whatever the
     player tapped - with no way to add, remove, rename or save: Clear was an
     `href="#"`, and Auto Build and Save Deck were buttons with no handler. This
     is real state: the deck being composed, the cards in it by count, and the
     SiegeKnight it saves with. */
  var BUILD = null;

  function newBuild(opts) {
    return {
      id: null,              // server id; null until first save
      clientDeckId: 'build-' + Date.now() + '-' + Math.round(Math.random() * 1e6),
      name: autoBuildName(opts),
      trainerId: autoTrainerId(opts),
      counts: {},            // cardId -> copies
      order: [],             // insertion order, so the tray does not reshuffle
      notice: '', error: false, saving: false, query: '', view: 'add', element: 'ALL', type: 'ALL', rarity: 'ALL', sort: 'name', page: 0
    };
  }

  function buildTotal(b) {
    return b.order.reduce(function (n, id) { return n + (b.counts[id] || 0); }, 0);
  }

  function loadBuild(opts, deckId, asCopy) {
    var b = newBuild(opts);
    var row = deckId ? findDeckRow(opts, deckId) : null;
    if (row) {
      b.name = asCopy ? (row.name + ' copy').slice(0, 40) : row.name;
      if (!asCopy && row.kind === 'saved') b.id = row.id;
      if (row.trainerId) b.trainerId = row.trainerId;
      (row.entries || []).forEach(function (e) {
        if (!byIdIn(ALL_CARDS, e.id) && !byId(e.id)) return;
        b.counts[e.id] = e.count;
        b.order.push(e.id);
      });
    }
    return b;
  }

  function openBuilderFor(deckId, opts, asCopy) {
    BUILD = loadBuild(opts, deckId, asCopy);
    if (onNavigate) onNavigate('builder');
  }

  function builderPool(opts, query) {
    var q = String(query || '').trim().toLowerCase();
    return ownedPool(opts).filter(function (c) {
      if (!c || String(c.type || 'SIEGLING').toUpperCase() === 'SIEGEKNIGHT') return false;
      return !q || String(c.name || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function buildKnightOptions(opts) {
    var live = opts.live || {};
    var owned = (live.knights || []).map(function (k) { return k && k.id; });
    return (live.trainers || []).filter(function (t) { return t && t.id && t.active !== false && owned.indexOf(t.id) !== -1; });
  }

  function buildFilteredCards(opts, review) {
    var b = BUILD;
    var pool = review ? b.order.map(function (id) { return byIdIn(ALL_CARDS,id) || byId(id); }).filter(Boolean) : builderPool(opts,b.query);
    var q = String(b.query || '').trim().toLowerCase();
    pool = pool.filter(function (c) {
      return (!q || String(c.name || '').toLowerCase().indexOf(q) !== -1) &&
        (b.element === 'ALL' || String(c.element).toUpperCase() === b.element) &&
        (b.type === 'ALL' || String(c.type || 'SIEGLING').toUpperCase() === b.type) &&
        (b.rarity === 'ALL' || String(c.rarity).toUpperCase() === b.rarity);
    });
    pool.sort(function (a,c) {
      if (b.sort === 'element') return String(a.element).localeCompare(String(c.element)) || a.name.localeCompare(c.name);
      if (b.sort === 'rarity') return rarityRank(c) - rarityRank(a) || a.name.localeCompare(c.name);
      if (b.sort === 'copies') return (b.counts[c.id] || 0) - (b.counts[a.id] || 0) || a.name.localeCompare(c.name);
      return a.name.localeCompare(c.name);
    });
    return pool;
  }

  function buildFilterSelect(key, label, entries) {
    return '<label><span>' + label + '</span><select data-build-filter="' + key + '">' + entries.map(function (entry) {
      var id = Array.isArray(entry) ? entry[0] : entry, name = Array.isArray(entry) ? entry[1] : title(entry);
      return '<option value="' + id + '"' + (BUILD[key] === id ? ' selected' : '') + '>' + name + '</option>';
    }).join('') + '</select></label>';
  }

  function builderScreen(opts) {
    opts = opts || {};
    if (!BUILD) BUILD = newBuild(opts);
    var b = BUILD, rules = builderRules(opts), total = buildTotal(b), view = b.view || 'add';
    var review = view === 'review', pool = buildFilteredCards(opts,review);
    var size = window.innerWidth >= 1024 ? 6 : 4;
    var pages = Math.max(1,Math.ceil(pool.length / size));
    b.page = Math.max(0,Math.min(b.page || 0,pages - 1));
    var knights = buildKnightOptions(opts);
    var titleText = {add:'Add from your binder',review:'Deck Review',auto:'Auto Build',save:'Save your deck'}[view];
    var filters = '<div class="sg-build-filters"><input class="sg-build-search" data-build-search value="' + esc(b.query) + '" placeholder="Search cards" aria-label="Search cards">' +
      buildFilterSelect('element','Element',['ALL'].concat(PROFILE_ELEMENTS)) +
      buildFilterSelect('type','Type',[['ALL','All types'],['SIEGLING','Siegelings'],['SPELL','Strategies'],['TRAP','Deceptions']]) +
      buildFilterSelect('rarity','Rarity',['ALL','COMMON','UNCOMMON','RARE','EPIC','LEGENDARY']) +
      buildFilterSelect('sort','Sort',[['name','Name'],['element','Element'],['rarity','Rarity'],['copies','Copies']]) + '</div>';
    var binder = filters + '<div class="sg-build-book" aria-label="' + (review ? 'Deck binder' : 'Collection binder') + '">' +
      (pool.length ? pool.slice(b.page * size,(b.page + 1) * size).map(function (c) {
        var have = b.counts[c.id] || 0, cap = Math.min(rules.maxCopies,ownedCount(opts,c.id));
        return '<div class="sg-build-pocket">' + galleryCard(c) + '<div class="sg-build-pocket-actions"><span>' + esc(review ? have + ' in deck' : have + ' / ' + cap + ' added') + '</span>' +
          (review ? '<button type="button" data-build-remove="' + esc(c.id) + '" aria-label="Remove one ' + esc(c.name) + '">−</button>' : '') +
          '<button type="button" data-build-add="' + esc(c.id) + '"' + (have >= cap ? ' disabled' : '') + ' aria-label="Add one ' + esc(c.name) + '">+</button></div></div>';
      }).join('') : '<p class="sg-empty-row">' + (review ? 'No cards match. Add cards from your binder or clear the filters.' : 'No cards match your filters. Try another search.') + '</p>') +
      '</div><footer class="sg-build-pager"><button type="button" data-build-page="-1"' + (!b.page ? ' disabled' : '') + '>‹ Previous</button><span>Page ' + (b.page + 1) + ' of ' + pages + ' · ' + pool.length + ' cards</span><button type="button" data-build-page="1"' + (b.page >= pages - 1 ? ' disabled' : '') + '>Next ›</button>' +
      (review && total ? '<button type="button" data-build-clear>Clear deck</button>' : '') + '</footer>';
    var save = '<div class="sg-build-save-panel"><label class="sg-auth-field"><span>Deck name</span><input class="sg-build-name" data-build-name value="' + esc(b.name) + '" maxlength="40"></label>' +
      '<label class="sg-auth-field"><span>Choose a SiegeKnight</span><select class="sg-build-knight" data-build-knight><option value="">Select a SiegeKnight</option>' + knights.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === b.trainerId ? ' selected' : '') + '>' + esc(t.name || t.id) + '</option>';
      }).join('') + '</select></label>' + (!knights.length ? '<p>' + (opts.guest ? 'Sign in to save your deck.' : 'Collect a SiegeKnight before saving a deck.') + '</p>' : '') +
      '<p>' + total + ' cards · minimum ' + rules.minDeckSize + '</p><button class="sg-guest-primary" type="button" data-build-confirm' + (b.saving || opts.guest ? ' disabled' : '') + '>' + (b.saving ? 'Saving…' : 'Save deck') + '</button></div>';
    return topMarkup(opts) + '<div class="sg-deck-backdrop" aria-hidden="true">' + hubPanelImage(view, 'stage') + '</div>' +
      '<nav class="sg-work-nav" aria-label="Deck builder">' + panelButton('add','Add Cards',view,'data-builder-view') + panelButton('review','Deck Review',view,'data-builder-view') +
      panelButton('auto','Auto Build',view,'data-builder-view') + panelButton('save','Save Deck',view,'data-builder-view') + '<a class="sg-work-back" href="/decks" data-screen="decks">‹ My Decks</a></nav>' +
      '<div class="sg-scroll sg-builder-workspace" data-builder><header class="sg-work-head"><h2>' + titleText + '</h2><p>' + total + ' cards · ' + rules.minDeckSize + ' minimum · max ' + rules.maxCopies + ' copies</p></header>' +
      (b.notice ? '<p class="sg-deck-notice' + (b.error ? ' is-error' : '') + '" data-build-notice tabindex="-1" role="' + (b.error ? 'alert' : 'status') + '">' + esc(b.notice) + '</p>' : '') +
      (view === 'save' ? save : view === 'auto' ? '<div class="sg-build-auto-panel">' + hubPanelImage('auto', 'card') + '<div><h3>A starting point for your next victory</h3><p>Use cards you own to build a playable deck. Review every card before saving. Auto Build replaces the cards currently in this draft.</p><button class="sg-guest-primary" type="button" data-build-auto>Build my deck</button></div></div>' : binder) +
      '</div>' + sheetHost() + bottomMarkup('collection',opts);
  }

  function refreshBuilder(opts, focusNotice) {
    var current = document.querySelector('.sg-app [data-builder]');
    if (!current) return;
    var scrollTop = current.scrollTop;
    var app = current.closest('.sg-app');
    var next = render(document.createElement('div'), 'builder', opts);
    app.replaceWith(next);
    var scroll = next.querySelector('[data-builder]');
    if (scroll) scroll.scrollTop = scrollTop;
    var notice = next.querySelector('[data-build-notice]');
    if (focusNotice && notice) notice.focus();
  }

  function mountBuilder(app, opts) {
    mountSheet(app, opts);
    var b = BUILD;
    if (!b) return;
    var rules = builderRules(opts);

    function say(message, isError) {
      b.notice = message || '';
      b.error = Boolean(isError);
      refreshBuilder(opts, Boolean(message));
    }

    app.addEventListener('click', function (e) {
      if (!e.target.closest) return;

      var viewButton = e.target.closest('[data-builder-view]');
      if (viewButton) { b.view = viewButton.getAttribute('data-builder-view'); b.page = 0; b.notice = ''; refreshBuilder(opts); return; }
      var pageButton = e.target.closest('[data-build-page]');
      if (pageButton) { b.page += Number(pageButton.getAttribute('data-build-page')); refreshBuilder(opts); return; }
      var add = e.target.closest('[data-build-add]');
      if (add) {
        var id = add.getAttribute('data-build-add');
        var cap = Math.min(rules.maxCopies, ownedCount(opts, id));
        var have = b.counts[id] || 0;
        if (have >= cap) {
          say(cap === 0 ? 'You do not own that card yet.'
            : 'That is all ' + cap + ' cop' + (cap === 1 ? 'y' : 'ies') + ' you own.', true);
          return;
        }
        if (!have) b.order.push(id);
        b.counts[id] = have + 1;
        b.notice = '';
        refreshBuilder(opts);
        return;
      }

      var remove = e.target.closest('[data-build-remove]');
      if (remove) {
        var rid = remove.getAttribute('data-build-remove');
        var left = (b.counts[rid] || 0) - 1;
        if (left > 0) b.counts[rid] = left;
        else {
          delete b.counts[rid];
          b.order = b.order.filter(function (x) { return x !== rid; });
        }
        b.notice = '';
        refreshBuilder(opts);
        return;
      }

      if (e.target.closest('[data-build-clear]')) {
        e.preventDefault();
        if (!buildTotal(b) || window.confirm('Remove every card from this deck?')) {
          b.counts = {}; b.order = [];
          say('');
        }
        return;
      }

      if (e.target.closest('[data-build-auto]')) {
        var built = autoBuildList(opts);
        if (!built || built.shortfall) {
          say('Auto Build needs at least ' + rules.minDeckSize +
            ' cards in your collection. Open more packs and try again.', true);
          return;
        }
        b.counts = {}; b.order = [];
        built.cards.forEach(function (id) {
          if (!b.counts[id]) { b.counts[id] = 0; b.order.push(id); }
          b.counts[id]++;
        });
        b.view = 'review'; b.page = 0; b.query = ''; b.type = b.element = b.rarity = 'ALL';
        say('Auto Build filled ' + built.cards.length + ' cards. Save when you are happy with it.');
        return;
      }

      if (e.target.closest('[data-build-confirm]')) {
        if (opts.guest || b.saving) return;
        var total = buildTotal(b);
        if (!b.name.trim()) { say('Give this deck a name before saving.', true); return; }
        if (!b.trainerId) { say('Choose a SiegeKnight before saving.', true); return; }
        if (total < rules.minDeckSize) {
          say('This deck needs ' + (rules.minDeckSize - total) + ' more card' +
            (rules.minDeckSize - total === 1 ? '' : 's') + ' before it can be saved.', true);
          return;
        }
        b.saving = true;
        say('Saving\u2026');
        saveDeck({
          id: b.id || undefined,
          clientDeckId: b.clientDeckId,
          name: b.name.trim(),
          trainerId: b.trainerId,
          customDeckCards: flatCardIds(b.order.map(function (id) {
            return { id: id, count: b.counts[id] };
          }))
        }).then(function (res) {
          adoptSavedDecks(opts, res);
          b.saving = false;
          // The server minted the id on a create; without adopting it the next
          // save would create a second deck instead of updating this one.
          var mine = ((opts.live && opts.live.savedDecks) || []).filter(function (d) {
            return d && (d.id === b.clientDeckId || d.name === b.name.trim());
          })[0];
          if (mine && mine.id) b.id = mine.id;
          say(b.name.trim() + ' saved.');
        }).catch(function (err) {
          b.saving = false;
          say(err.message || 'That deck could not be saved.', true);
        });
      }
    });

    app.querySelectorAll('[data-build-filter]').forEach(function (field) {
      field.addEventListener('change', function () { b[this.getAttribute('data-build-filter')] = this.value; b.page = 0; refreshBuilder(opts); });
    });
    app.addEventListener('keydown', function (event) {
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.closest('[data-sheet]')) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      var pageButton = app.querySelector('[data-build-page="' + (event.key === 'ArrowRight' ? '1' : '-1') + '"]');
      if (pageButton && !pageButton.disabled) { event.preventDefault(); pageButton.click(); }
    });
    var name = app.querySelector('[data-build-name]');
    if (name) {
      name.addEventListener('input', function () { b.name = this.value; });
    }
    var knight = app.querySelector('[data-build-knight]');
    if (knight) {
      knight.addEventListener('change', function () { b.trainerId = this.value; });
    }
    // Repainting on every keystroke would steal the caret, so the grid is
    // refreshed on a pause rather than per character.
    var search = app.querySelector('[data-build-search]');
    if (search) {
      var timer = null;
      search.addEventListener('input', function () {
        b.query = this.value; b.page = 0;
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          refreshBuilder(opts);
          var field = document.querySelector('.sg-app [data-build-search]');
          if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
        }, 260);
      });
    }
  }

  /* ---------- social ---------- */

  /* ---------- social ----------
     One screen, three tabs: the player's own Profile, their Friends, and their
     Messages. It replaced a Social row buried in the More tray, which put the
     two things people check most - who is online and who has written - two taps
     deep behind a menu.

     The tab is module state rather than part of the URL: tapping SOCIAL in the
     tab bar always lands on Profile, which is what makes a second tap on the
     same button a way back rather than a no-op. */
  var socialTab = 'profile';
  var SOCIAL_TABS = [['profile', 'Profile'], ['friends', 'Friends'], ['messages', 'Messages']];

  function setSocialTab(tab) {
    socialTab = tab;
  }

  /* Threads whose last message came from the other person. The server decides
     this (`unread` on the thread summary) - the client never guesses. */
  function unreadThreadCount(opts) {
    var threads = (opts && opts.live && opts.live.threads) || [];
    var n = 0;
    for (var i = 0; i < threads.length; i++) if (threads[i] && threads[i].unread) n++;
    return n;
  }

  /* ---------- Lobbies ----------
     Its own screen: the day's rotating tournament (rule, countdown, prizes,
     live standings) and every open table, with Host and Join. Hosting and
     joining open the Room screen (/room, /room/CODE), which owns deck and
     SiegeKnight choice and the wait for an opponent; a tournament table
     carries its id so the room applies the rule and the server enforces it. The tournament feed is fetched when the screen mounts, so the
     hub's boot payload does not grow. */
  var LOBBY_POLL_MS = 15000;
  var lobbyPoll = null;
  var lobbyTick = null;

  function countdown(endsAt) {
    var ms = Date.parse(endsAt) - Date.now();
    if (!(ms > 0)) return 'Ending now';
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? h + 'h ' + (m < 10 ? '0' : '') + m + 'm left' : m + 'm left';
  }

  var MEDAL = ['🥇', '🥈', '🥉'];

  function lobbyTable(room, i, opts) {
    var lead = CARDS[i % Math.max(1, CARDS.length)] || CARDS[0];
    var code = room.roomId || room.id || '';
    var host = room.hostName || room.playerName || 'Open table';
    var me = opts && opts.live && opts.live.accountId;
    var mine = me && room.hostUserId === me;
    var tour = room.tournamentId ? room.tournamentName || 'Tournament' : '';
    var full = room.status === 'Started' || Number(room.playerCount) >= 2;
    var href = '/room/' + encodeURIComponent(code);
    return '<article class="sg-lt' + (tour ? ' is-tour' : '') + (full ? ' is-full' : '') + '" style="--el:' + color(lead && lead.element) + '">' +
      '<div class="sg-lt-bg" style="background-image:url(\'' + land(lead && lead.element) + '\')"></div>' +
      (lead ? '<div class="sg-lt-art"><img ' + artAttrs(lead.cardArtUrl) + ' alt="" loading="lazy"></div>' : '') +
      '<div class="sg-lt-veil"></div>' +
      '<div class="sg-lt-body">' +
        '<span class="sg-lt-tag">' + esc(tour || 'Open 1v1') + '</span>' +
        '<strong>' + esc(host) + '</strong>' +
        '<em>' + esc(code) + (full ? ' · In progress' : ' · Waiting') + '</em>' +
      '</div>' +
      (full ? '<span class="sg-lt-go is-off">Full</span>'
            : '<a class="sg-lt-go" href="' + href + '">' + (mine ? 'Open' : 'Join') + ' ›</a>') +
    '</article>';
  }

  /* On a landscape phone the screen is two columns: the tournament pinned on
     the left, and on the right one section at a time, chosen with these
     buttons. It used to be one long side-scrolling rail, which hid the open
     tables and the standings off the edge of the screen. Portrait and desktop
     have the height to stack every section, so the buttons are CSS-hidden there. */
  var LOBBY_VIEWS = [['tables', 'Tables'], ['board', 'Standings'], ['next', 'Coming up']];
  var lobbyView = 'tables';

  function lobbySwitch(rooms) {
    return '<nav class="sg-lobby-switch" data-lobby-switch aria-label="Lobby sections">' +
      LOBBY_VIEWS.map(function (v) {
        var on = v[0] === lobbyView;
        return '<button type="button" data-lobby-view="' + v[0] + '" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '"' +
          (v[0] === 'tables' ? '' : ' hidden') + '>' + esc(v[1]) +
          (v[0] === 'tables' ? ' <b data-table-count-pill>' + esc(rooms.length) + '</b>' : '') + '</button>';
      }).join('') +
    '</nav>';
  }

  function lobbiesScreen(opts) {
    opts = opts || {};
    var rooms = (opts.live && opts.live.rooms) || [];
    // Standings and Coming up only exist once the tournament feed arrives.
    lobbyView = 'tables';
    return topMarkup(opts) +
      '<div class="sg-scroll" data-lobbies data-lobby-view="' + lobbyView + '">' +
        '<section class="sg-lobbies-tour" data-tour>' +
          '<div class="sg-tour-loading">Loading today’s tournament…</div>' +
        '</section>' +
        lobbySwitch(rooms) +
        '<div class="sg-lobbies-claims" data-tour-claims hidden></div>' +
        '<section class="sg-section sg-tour-board" data-tour-board hidden></section>' +
        '<section class="sg-section sg-lobbies-tables" data-tables>' +
          '<div class="sg-section-head"><h3>Open tables</h3><span class="sg-count" data-table-count>' + esc(rooms.length) + '</span></div>' +
          '<div class="sg-lobbies-actions">' +
            '<a class="sg-lobby-host" href="/room">+ Host open table</a>' +
            '<form class="sg-lobby-code" data-join-code>' +
              '<input name="code" maxlength="6" placeholder="Room code" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
              '<button type="submit">Join</button>' +
            '</form>' +
          '</div>' +
          '<div class="sg-lobbies-grid" data-table-list>' +
            (rooms.length ? rooms.map(function (r, i) { return lobbyTable(r, i, opts); }).join('') : emptyLobbies()) +
          '</div>' +
        '</section>' +
        '<section class="sg-section sg-tour-next" data-tour-next hidden></section>' +
        '<div style="height:96px"></div>' +
      '</div>' +
      bottomMarkup('play', opts);
  }

  function tourHero(t, data, opts) {
    var guest = !data.signedIn;
    var prizes = (t.prizes || []).map(function (p, i) {
      return '<span class="sg-tour-prize"><i>' + MEDAL[i] + '</i>' + esc(p) + '</span>';
    }).join('');
    var me = t.me;
    return '<div class="sg-tour-bg" style="background-image:url(\'' + land(t.element) + '\')"></div>' +
      '<div class="sg-tour-veil"></div>' +
      '<div class="sg-tour-body">' +
        '<span class="sg-tour-kicker">Today’s Tournament · <b data-tour-clock>' + esc(countdown(t.endsAt)) + '</b></span>' +
        '<h2>' + esc(t.name) + '</h2>' +
        '<p>' + esc(t.tagline) + '</p>' +
        '<div class="sg-tour-rule">' + esc(t.rule) + '</div>' +
        '<div class="sg-tour-prizes">' + prizes + '<em>Siegecoins to the top 3</em></div>' +
        '<div class="sg-tour-cta">' +
          (guest
            ? '<a class="sg-tour-host" href="/login" data-screen="auth">Sign in to compete</a>'
            : '<a class="sg-tour-host" href="/room?tournament=' + encodeURIComponent(t.id) + '">Host tournament table</a>') +
          (me ? '<span class="sg-tour-me">You’re #' + esc(me.place) + ' · ' + esc(me.points) + ' pts</span>'
              : (guest ? '' : '<span class="sg-tour-me">Win a table to get on the board</span>')) +
        '</div>' +
      '</div>';
  }

  function tourBoard(t) {
    var rows = t.standings || [];
    var me = t.me;
    var body;
    if (t.standingsAvailable === false) {
      body = '<div class="sg-empty-row">Standings are warming up. Check back in a moment.</div>';
    } else if (!rows.length) {
      body = '<div class="sg-empty-row">No results yet today. The first win takes the top spot.</div>';
    } else {
      body = '<ol class="sg-tour-rows">' + rows.map(function (r) {
        var isMe = me && me.userId === r.userId;
        return '<li class="sg-tour-row' + (r.place <= 3 ? ' is-podium p' + r.place : '') + (isMe ? ' is-me' : '') + '">' +
          '<span class="sg-tour-place">' + (r.place <= 3 ? MEDAL[r.place - 1] : esc(r.place)) + '</span>' +
          '<span class="sg-tour-name">' + esc(r.displayName) + '<em>' + esc(r.wins) + 'W · ' + esc(r.losses) + 'L</em></span>' +
          '<b>' + esc(r.points) + '</b>' +
        '</li>';
      }).join('') + '</ol>' +
      (me && me.place > rows.length
        ? '<div class="sg-tour-row is-me is-below"><span class="sg-tour-place">' + esc(me.place) + '</span>' +
            '<span class="sg-tour-name">You<em>' + esc(me.wins) + 'W · ' + esc(me.losses) + 'L</em></span><b>' + esc(me.points) + '</b></div>'
        : '');
    }
    return '<div class="sg-section-head"><h3>Standings</h3><span class="sg-section-note">' +
      esc(t.entrants || 0) + ' playing · win 3 · loss 1</span></div>' + body;
  }

  function tourNext(list) {
    return '<div class="sg-section-head"><h3>Coming up</h3></div>' +
      '<div class="sg-tour-next-list">' + (list || []).map(function (t, i) {
        return '<div class="sg-tour-card" style="--el:' + color(t.element) + '">' +
          '<div class="sg-tour-card-bg" style="background-image:url(\'' + land(t.element) + '\')"></div>' +
          '<span>' + (i === 0 ? 'Tomorrow' : esc(new Date(t.startsAt).toLocaleDateString(undefined, { weekday: 'long' }))) + '</span>' +
          '<strong>' + esc(t.name) + '</strong><em>' + esc(t.rule) + '</em>' +
        '</div>';
      }).join('') + '</div>';
  }

  function tourClaims(list) {
    return (list || []).map(function (c) {
      return '<div class="sg-tour-claim">' +
        '<span class="sg-tour-claim-medal">' + (MEDAL[c.place - 1] || '') + '</span>' +
        '<span class="sg-tour-claim-copy"><strong>You placed #' + esc(c.place) + ' in ' + esc(c.name) + '</strong>' +
          '<em>' + esc(c.day) + '</em></span>' +
        '<button type="button" class="sg-tour-claim-btn" data-tour-claim="' + esc(c.tournamentId) + '">Claim ' + esc(c.prize) + '</button>' +
      '</div>';
    }).join('');
  }

  function stopLobbyTimers() {
    if (lobbyPoll) { clearInterval(lobbyPoll); lobbyPoll = null; }
    if (lobbyTick) { clearInterval(lobbyTick); lobbyTick = null; }
  }

  function mountLobbies(app, opts) {
    var root = app.querySelector('[data-lobbies]');
    if (!root) return;
    var api = liveApi();
    var tour = null;

    function setLobbyView(view) {
      lobbyView = view;
      root.setAttribute('data-lobby-view', view);
      root.querySelectorAll('[data-lobby-view]').forEach(function (b) {
        if (b === root) return;
        var on = b.getAttribute('data-lobby-view') === view;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }

    function setSwitchAvailable(view, available) {
      var btn = root.querySelector('button[data-lobby-view="' + view + '"]');
      if (btn) btn.hidden = !available;
      if (!available && lobbyView === view) setLobbyView('tables');
    }

    function paintTour(data) {
      var t = data && data.current;
      var hero = root.querySelector('[data-tour]');
      if (!t) {
        hero.innerHTML = '<div class="sg-tour-loading">Tournaments are unavailable right now.</div>';
        return;
      }
      tour = t;
      hero.style.setProperty('--el', color(t.element));
      hero.innerHTML = tourHero(t, data, opts);
      var board = root.querySelector('[data-tour-board]');
      board.innerHTML = tourBoard(t);
      board.hidden = false;
      var next = root.querySelector('[data-tour-next]');
      next.innerHTML = tourNext(data.upcoming);
      next.hidden = !(data.upcoming && data.upcoming.length);
      var claims = root.querySelector('[data-tour-claims]');
      claims.innerHTML = tourClaims(data.claimable);
      claims.hidden = !(data.claimable && data.claimable.length);
      setSwitchAvailable('board', true);
      setSwitchAvailable('next', !next.hidden);
    }

    function paintTables(rooms) {
      var list = root.querySelector('[data-table-list]');
      if (!list) return;
      list.innerHTML = rooms.length ? rooms.map(function (r, i) { return lobbyTable(r, i, opts); }).join('') : emptyLobbies();
      var count = root.querySelector('[data-table-count]');
      if (count) count.textContent = String(rooms.length);
      var pill = root.querySelector('[data-table-count-pill]');
      if (pill) pill.textContent = String(rooms.length);
    }

    function loadTour() {
      if (!api) return;
      api.get('/api/tournaments').then(paintTour).catch(function () { paintTour(null); });
    }

    function loadTables() {
      if (!api) return;
      api.get('/api/match/rooms').then(function (res) {
        var rooms = (res && res.rooms) || [];
        if (opts.live) { opts.live.rooms = rooms; opts.live.lobbies = rooms.length; }
        paintTables(rooms);
      }).catch(function () { /* keep what is shown */ });
    }

    root.addEventListener('submit', function (e) {
      var form = e.target.closest && e.target.closest('[data-join-code]');
      if (!form) return;
      e.preventDefault();
      var code = String(form.code.value || '').trim().toUpperCase();
      if (!code) return;
      window.location.href = '/room/' + encodeURIComponent(code);
    });

    root.addEventListener('click', function (e) {
      var viewBtn = e.target.closest && e.target.closest('button[data-lobby-view]');
      if (viewBtn) { setLobbyView(viewBtn.getAttribute('data-lobby-view')); return; }
      var btn = e.target.closest && e.target.closest('[data-tour-claim]');
      if (!btn || !api) return;
      btn.disabled = true;
      api.post('/api/tournaments/claim', { tournamentId: btn.getAttribute('data-tour-claim') }).then(function (res) {
        if (!res || res.error) {
          btn.disabled = false;
          btn.textContent = (res && res.error) || 'Try again';
          return;
        }
        btn.textContent = res.alreadyClaimed ? 'Claimed' : '+' + res.awarded + ' claimed';
        btn.classList.add('is-done');
        if (opts.live && res.awarded) {
          opts.live.gold = (Number(opts.live.gold) || 0) + res.awarded;
          var chip = app.querySelector('.sg-chip.coin');
          if (chip) chip.lastChild.textContent = formatCoins(opts);
        }
      });
    });

    stopLobbyTimers();
    loadTour();
    lobbyPoll = setInterval(function () {
      if (!root.isConnected) { stopLobbyTimers(); return; }
      loadTables();
    }, LOBBY_POLL_MS);
    lobbyTick = setInterval(function () {
      if (!root.isConnected) { stopLobbyTimers(); return; }
      var clock = root.querySelector('[data-tour-clock]');
      if (clock && tour) clock.textContent = countdown(tour.endsAt);
      // The day rolled over: fetch the new tournament.
      if (tour && Date.parse(tour.endsAt) <= Date.now()) { tour = null; loadTour(); }
    }, 30000);
  }

  /* ---------- Room ----------
     One table's waiting room, for tournament and open tables alike. It replaced
     a hand-off to the old hub's /social/lobby page, which shared nothing with
     this design. Three ways in:
       /room?tournament=ID  host a table for today's tournament (or /room for an
                            open table): pick a loadout, then Open table.
       /room/CODE           a table you host or joined (the session is in
                            localStorage), or someone's invite link, which
                            shows the table and a Join button.
     The server owns everything about the table: who is in it, readiness, the
     tournament's deck rule (create, join and ready all re-check it). This
     screen polls /api/match/status and, once both players are ready and the
     server starts the match, hands the session to /play exactly as the old
     waiting room did. Session keys are the old hub's own, so a table opened
     from either page resumes on the other. */
  var ROOM_POLL_MS = 2000;
  var ROOM_HOST_KEY = 'sieglingsHostLobby';
  var ROOM_SESSION_KEY = 'sieglingsLobbySession';
  var ROOM_MATCH_KEY = 'sieglingsMultiplayerSession';
  var ROOM_PENDING_KEY = 'sieglingsPendingLoadout';
  var ROOM_NAME_KEY = 'sieglingsPlayerName';
  var GUEST_KNIGHTS = ['squire-bob', 'pyla', 'ser-airek'];
  var roomPoll = null;
  var roomTick = null;
  var rv = null;

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJson(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private mode: the table still works for this page */ }
  }

  function roomCodeFromPath() {
    var m = /^\/room\/([A-Za-z0-9]{3,12})\/?$/.exec(location.pathname);
    return m ? m[1].toUpperCase() : '';
  }

  // The room endpoints authenticate the table with X-Room-Id / X-Player-Token,
  // which the shared live helper does not send, so these carry their own headers.
  function roomFetch(url, method, body, session) {
    var headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    try {
      var token = localStorage.getItem('sieglingsAuthToken');
      if (token && token !== 'cookie') headers.Authorization = 'Bearer ' + token;
    } catch (e) { /* no stored token: the session cookie still rides along */ }
    if (session) {
      headers['X-Room-Id'] = session.roomId;
      headers['X-Player-Token'] = session.playerToken;
    }
    return fetch(url, {
      method: method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return r.ok ? {} : { error: 'Request failed.' }; });
    }).catch(function () { return { error: 'Network error. Check your connection and try again.' }; });
  }

  function roomPlayerName(opts) {
    var live = opts.live || {};
    if (live.displayName) return live.displayName;
    try { return localStorage.getItem(ROOM_NAME_KEY) || 'Guest'; } catch (e) { return 'Guest'; }
  }

  // Same three tests the battle loadout and the server apply.
  function tourDeckProblem(t, els, custom) {
    if (!t) return '';
    if (t.presetOnly && custom) return 'Preset decks only';
    if (t.monoElement && els.length !== 1) return 'Needs a single-element deck';
    var allowed = t.allowedElements;
    if (Array.isArray(allowed) && els.some(function (e) { return allowed.indexOf(String(e).toUpperCase()) === -1; })) {
      return 'Off today’s rule';
    }
    return '';
  }

  // Every deck this account may bring: saved custom decks, then unlocked presets.
  // Off-rule decks stay listed but disabled, so the rule reads as a reason.
  function roomDecks(opts) {
    var groups = deckGroups(opts);
    var saved = (opts.live && opts.live.savedDecks) || [];
    var out = [];
    groups.saved.forEach(function (d) {
      var raw = saved.filter(function (s) { return s.id === d.id; })[0] || {};
      var list = Array.isArray(raw.customDeckCards) && raw.customDeckCards.length ? raw.customDeckCards
        : Array.isArray(raw.cards) ? raw.cards.map(function (c) { return c.id || c; }) : [];
      if (!list.length) return;
      out.push({ key: 'saved:' + d.id, name: d.name, els: d.els, lead: d.lead, custom: true,
        customDeckCards: list, trainerId: d.trainerId });
    });
    groups.owned.forEach(function (d) {
      out.push({ key: 'preset:' + d.id, deckId: d.id, name: d.name, els: d.els, lead: d.lead, custom: false });
    });
    out.forEach(function (d) { d.problem = tourDeckProblem(rv && rv.tournament, d.els || [], d.custom); });
    return out;
  }

  function roomKnights(opts) {
    var live = opts.live || {};
    return (live.trainers || []).filter(function (t) {
      if (!t || !t.id || t.active === false) return false;
      return opts.guest ? GUEST_KNIGHTS.indexOf(t.id) !== -1 : t.owned !== false;
    });
  }

  function chosenDeck(opts) {
    var decks = roomDecks(opts);
    var pick = decks.filter(function (d) { return d.key === rv.deckKey && !d.problem; })[0];
    if (!pick) pick = decks.filter(function (d) { return !d.problem; })[0] || null;
    if (pick) rv.deckKey = pick.key;
    return pick;
  }

  function chosenKnight(opts) {
    var knights = roomKnights(opts);
    var pick = knights.filter(function (k) { return k.id === rv.trainerId; })[0];
    if (!pick) {
      var live = opts.live || {};
      pick = knights.filter(function (k) { return k.id === live.defaultTrainerId; })[0] || knights[0] || null;
    }
    if (pick) rv.trainerId = pick.id;
    return pick;
  }

  function loadoutBody(opts) {
    var deck = chosenDeck(opts);
    var knight = chosenKnight(opts);
    if (!deck || !knight) return null;
    var body = { playerName: roomPlayerName(opts), trainerId: knight.id, loadoutLabel: deck.custom ? deck.name : '' };
    if (deck.custom) { body.deckId = 'deck_fire_earth'; body.customDeckCards = deck.customDeckCards; }
    else body.deckId = deck.deckId;
    return body;
  }

  function roomRole() {
    if (!rv.session) return 'visitor';
    if (rv.session.role === 'host' || (rv.status && rv.status.viewerIsHost)) return 'host';
    return 'guest';
  }

  // A tournament table wears the tournament's element; an open table wears its
  // host's deck, so every table on the board looks like whoever is hosting it.
  function roomTheme(opts) {
    var t = rv.tournament;
    var el = t && t.element;
    if (!el) {
      var hostSeat = ((rv.status && rv.status.players) || []).filter(function (p) { return p.role === 'host'; })[0];
      var deckId = hostSeat ? hostSeat.deckId : rv.preview ? rv.preview.deckId : '';
      if (!deckId && rv.mode === 'host' && !rv.session) {
        var mine = chosenDeck(opts);
        el = mine && mine.els && mine.els[0];
      } else {
        el = deckElsById(opts, deckId)[0];
      }
    }
    return { el: el || 'NEUTRAL', tour: Boolean(t || rv.tournamentId) };
  }

  function knightById(opts, id) {
    var list = (opts.live && opts.live.trainers) || [];
    return list.filter(function (t) { return t.id === id; })[0] || null;
  }

  function deckNameById(opts, id) {
    var d = ((opts.live && opts.live.decks) || []).filter(function (x) { return x.id === id; })[0];
    return d ? d.name : '';
  }

  function deckElsById(opts, id) {
    var d = ((opts.live && opts.live.decks) || []).filter(function (x) { return x.id === id; })[0];
    return (d && d.elements) || [];
  }

  /* ---- markup ---- */

  function roomScreen(opts) {
    opts = opts || {};
    return '<div class="sg-room-backdrop" data-room-backdrop aria-hidden="true"></div>' +
      topMarkup(opts) +
      '<div class="sg-scroll sg-room" data-room>' +
        '<section class="sg-room-hero" data-room-hero></section>' +
        '<section class="sg-room-stage" data-room-stage>' +
          '<div class="sg-room-loading">Opening the table…</div>' +
        '</section>' +
        '<section class="sg-room-panel" data-room-panel hidden></section>' +
        '<div class="sg-room-spacer"></div>' +
      '</div>' +
      bottomMarkup('play', opts);
  }

  function roomHeroHtml(opts) {
    var t = rv.tournament;
    var theme = roomTheme(opts);
    var st = rv.status || {};
    var code = rv.code || '';
    var title = t ? t.name : (roomRole() === 'host' || rv.mode === 'host' ? 'Your Table' : ((st.hostName || (rv.preview && rv.preview.hostName) || 'Open') + '’s Table'));
    var kicker = t ? 'Tournament Table' : 'Open 1v1 Table';
    var bits = [];
    if (t && t.endsAt) bits.push('<b data-room-clock>' + esc(countdown(t.endsAt)) + '</b>');
    if (st.expiresAt && !st.guestJoined) bits.push('<span data-room-expiry>' + esc(roomExpiry(st.expiresAt)) + '</span>');
    return '<div class="sg-room-hero-bg" style="background-image:url(\'' + land(theme.el) + '\')"></div>' +
      '<div class="sg-room-hero-veil"></div>' +
      '<div class="sg-room-hero-body">' +
        '<span class="sg-room-kicker">' + esc(kicker) + (bits.length ? ' · ' + bits.join(' · ') : '') + '</span>' +
        '<h2>' + esc(title) + '</h2>' +
        (t ? '<p>' + esc(t.tagline || '') + '</p><div class="sg-room-rule">' + esc(t.rule) + '</div>' : '<p>Best of one. Winner takes the table.</p>') +
        (t && t.prizes ? '<div class="sg-room-prizes">' + t.prizes.map(function (p, i) {
          return '<span><i>' + MEDAL[i] + '</i>' + esc(p) + '</span>';
        }).join('') + '</div>' : '') +
        (code ? '<button type="button" class="sg-room-code" data-room-copy="code" aria-label="Copy room code ' + esc(code) + '">' +
          '<em>Room</em><strong>' + esc(code) + '</strong><i data-room-copied>Copy</i></button>' : '') +
      '</div>';
  }

  function roomExpiry(expiresAt) {
    var ms = Date.parse(expiresAt) - Date.now();
    if (!(ms > 0)) return 'Closing';
    return 'Open ' + Math.ceil(ms / 60000) + ' min';
  }

  function seatHtml(opts, p, side, label) {
    if (!p) {
      return '<div class="sg-seat is-open" data-side="' + side + '">' +
        '<div class="sg-seat-art"><span class="sg-seat-pulse"></span><span class="sg-seat-q">?</span></div>' +
        '<strong>Open seat</strong><em>' + (roomRole() === 'host' ? 'Invite a challenger' : 'Waiting') + '</em></div>';
    }
    var knight = knightById(opts, p.trainerId);
    var els = p.els || deckElsById(opts, p.deckId);
    var deckName = p.loadoutLabel || deckNameById(opts, p.deckId) || (p.deckId ? 'Custom deck' : '');
    var el = (knight && knight.element) || els[0] || 'NEUTRAL';
    return '<div class="sg-seat' + (p.ready ? ' is-ready' : '') + (p.me ? ' is-me' : '') + '" data-side="' + side + '" style="--el:' + color(el) + '">' +
      '<div class="sg-seat-art">' +
        (knight && knight.cardArtUrl ? '<img ' + artAttrs(knight.cardArtUrl, 320) + ' alt="">' : '<span class="sg-seat-q">' + esc(String(p.name || '?').charAt(0).toUpperCase()) + '</span>') +
        '<span class="sg-seat-flag">' + esc(label) + '</span>' +
      '</div>' +
      '<strong>' + esc(p.name || label) + (p.me ? ' <small>(you)</small>' : '') + '</strong>' +
      '<em>' + esc(knight ? knight.name : 'Choosing a knight') + (deckName ? ' · ' + esc(deckName) : '') + '</em>' +
      '<span class="sg-seat-state">' + (p.ready ? 'Ready' : 'Choosing loadout') + '</span>' +
    '</div>';
  }

  function stageHtml(opts) {
    var st = rv.status || {};
    var role = roomRole();
    var host = null, guest = null;
    if (rv.session) {
      (st.players || []).forEach(function (p) {
        var seat = { name: p.name, ready: p.ready, deckId: p.deckId, trainerId: p.trainerId, loadoutLabel: p.loadoutLabel,
          me: (p.role === 'host') === (role === 'host') };
        // Your own seat previews the loadout you are choosing, not the one last sent.
        if (seat.me && !p.ready) {
          var d = chosenDeck(opts), k = chosenKnight(opts);
          if (d) { seat.deckId = d.deckId; seat.loadoutLabel = d.custom ? d.name : ''; seat.els = d.els; }
          if (k) seat.trainerId = k.id;
        }
        if (p.role === 'host') host = seat; else guest = seat;
      });
    } else if (rv.mode === 'host') {
      var dk = chosenDeck(opts), kn = chosenKnight(opts);
      host = { name: roomPlayerName(opts), me: true, deckId: dk && dk.deckId, loadoutLabel: dk && dk.custom ? dk.name : '',
        els: dk && dk.els, trainerId: kn && kn.id };
    } else if (rv.preview) {
      host = { name: rv.preview.hostName, deckId: rv.preview.deckId, trainerId: rv.preview.trainerId };
      var dv = chosenDeck(opts), kv = chosenKnight(opts);
      guest = { name: roomPlayerName(opts), me: true, deckId: dv && dv.deckId, loadoutLabel: dv && dv.custom ? dv.name : '',
        els: dv && dv.els, trainerId: kv && kv.id };
    }
    return '<div class="sg-room-vs">' +
        seatHtml(opts, host, 'host', 'Host') +
        '<div class="sg-room-vs-mark"><span>VS</span></div>' +
        seatHtml(opts, guest, 'guest', 'Rival') +
      '</div>' +
      '<p class="sg-room-status" data-room-status role="status">' + esc(statusLine(opts)) + '</p>' +
      ctaHtml(opts) +
      (rv.error ? '<p class="sg-room-error" role="alert">' + esc(rv.error) + '</p>' : '');
  }

  function statusLine(opts) {
    var st = rv.status || {};
    var role = roomRole();
    if (rv.gone) return rv.gone;
    if (!lockedLoadout()) {
      if (!chosenDeck(opts)) return rv.tournament ? 'None of your decks fits today’s rule. Unlock one in Decks.' : 'Unlock a deck in Decks to play.';
      if (!chosenKnight(opts)) return 'You need a SiegeKnight to play. Unlock one in Shop.';
    }
    if (rv.mode === 'host' && !rv.session) return 'Choose your deck and knight, then open the table.';
    if (role === 'visitor') return rv.preview ? 'Pick a loadout and take the open seat.' : 'Looking for this table…';
    if (st.started) return 'Match starting…';
    if (!st.guestJoined) return 'Share the code or invite a friend. The match starts once they join and you both ready up.';
    var meReady = role === 'host' ? st.hostReady : st.guestReady;
    var themReady = role === 'host' ? st.guestReady : st.hostReady;
    if (meReady && !themReady) return 'Ready. Waiting for your opponent to lock in.';
    if (!meReady && themReady) return 'Your opponent is ready. Lock in to start the match.';
    return 'Opponent joined. Lock in your loadout to start.';
  }

  function ctaHtml(opts) {
    var st = rv.status || {};
    var role = roomRole();
    var guestNeedsAuth = rv.tournament && opts.guest;
    var label, attr = '', disabled = rv.busy;
    if (rv.gone) {
      return '<div class="sg-room-cta"><a class="sg-room-go" href="/lobbies" data-screen="lobbies">Back to Lobbies</a></div>';
    }
    if (guestNeedsAuth) {
      return '<div class="sg-room-cta"><a class="sg-room-go" href="/login" data-screen="auth">Sign in to play this tournament</a></div>';
    }
    if (role === 'visitor') {
      if (rv.mode === 'host') { label = 'Open table'; attr = 'data-room-act="create"'; }
      else { label = 'Join table'; attr = 'data-room-act="join"'; disabled = disabled || !rv.preview; }
    } else {
      var meReady = role === 'host' ? st.hostReady : st.guestReady;
      if (st.started) { label = 'Entering the arena…'; disabled = true; }
      else if (meReady) { label = 'Locked in'; disabled = true; }
      else if (role === 'host' && !st.guestJoined) { label = 'Waiting for a challenger'; disabled = true; }
      else { label = role === 'host' ? 'Start match' : 'Ready up'; attr = 'data-room-act="ready"'; }
    }
    if (!loadoutBody(opts) && attr) { disabled = true; }
    var secondary = role === 'host'
      ? '<button type="button" class="sg-room-ghost" data-room-act="close">Close table</button>'
      : role === 'guest'
        ? '<button type="button" class="sg-room-ghost" data-room-act="leave">Leave table</button>'
        : '';
    return '<div class="sg-room-cta">' +
      '<button type="button" class="sg-room-go' + (st.guestJoined && !disabled ? ' is-hot' : '') + '" ' + attr + (disabled ? ' disabled' : '') + '>' +
        esc(rv.busy ? 'Working…' : label) + '</button>' +
      secondary +
      '<a class="sg-room-ghost" href="/lobbies" data-screen="lobbies">Lobbies</a>' +
    '</div>';
  }

  var ROOM_TABS = [['deck', 'Deck'], ['knight', 'Knight'], ['invite', 'Invite'], ['chat', 'Chat']];

  function panelHtml(opts) {
    var tabs = ROOM_TABS.filter(function (t) {
      // Invite and chat need a table; before one exists there is nothing to share.
      return rv.session || (t[0] !== 'invite' && t[0] !== 'chat');
    });
    if (!tabs.some(function (t) { return t[0] === rv.tab; })) rv.tab = tabs[0][0];
    return '<div class="sg-room-tabs" role="tablist">' + tabs.map(function (t) {
        var on = t[0] === rv.tab;
        return '<button type="button" role="tab" data-room-tab="' + t[0] + '" class="' + (on ? 'on' : '') + '" aria-selected="' + on + '">' +
          esc(t[1]) + (t[0] === 'chat' && rv.unread ? '<i class="sg-room-dot"></i>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="sg-room-pane" data-room-pane>' + paneHtml(opts) + '</div>';
  }

  function lockedLoadout() {
    var st = rv.status || {};
    var role = roomRole();
    return Boolean(st.started || (role === 'host' ? st.hostReady : role === 'guest' ? st.guestReady : false));
  }

  function paneHtml(opts) {
    if (rv.tab === 'deck') {
      var decks = roomDecks(opts);
      var current = chosenDeck(opts);
      var locked = lockedLoadout();
      if (!decks.length) return '<p class="sg-room-empty">No decks available. Unlock a preset in Decks.</p>';
      return (rv.tournament ? '<p class="sg-room-note">' + esc(rv.tournament.rule) + '</p>' : '') +
        '<div class="sg-room-picks">' + decks.map(function (d) {
          var lead = byIdIn(ALL_CARDS, d.lead) || byId(d.lead);
          var on = current && d.key === current.key;
          return '<button type="button" class="sg-room-pick' + (on ? ' on' : '') + (d.problem ? ' is-off' : '') + '"' +
            ' data-room-deck="' + esc(d.key) + '" style="--el:' + color((d.els || [])[0]) + '"' +
            (d.problem || locked ? ' disabled' : '') + ' aria-pressed="' + Boolean(on) + '">' +
            '<span class="sg-room-pick-art">' + (lead && lead.cardArtUrl ? '<img ' + artAttrs(lead.cardArtUrl, 200) + ' alt="" loading="lazy">' : '') + '</span>' +
            '<span class="sg-room-pick-copy"><strong>' + esc(d.name) + '</strong>' +
              '<em>' + (d.els || []).map(function (e) { return '<img src="' + icon(e) + '" alt="' + esc(title(e)) + '">'; }).join('') +
              (d.custom ? '<b>Custom</b>' : '') + '</em>' +
              (d.problem ? '<small>' + esc(d.problem) + '</small>' : '') + '</span>' +
          '</button>';
        }).join('') + '</div>';
    }
    if (rv.tab === 'knight') {
      var knights = roomKnights(opts);
      var k = chosenKnight(opts);
      var lockedK = lockedLoadout();
      if (!knights.length) return '<p class="sg-room-empty">No SiegeKnights available yet.</p>';
      return '<div class="sg-room-picks is-knights">' + knights.map(function (t) {
        var on = k && t.id === k.id;
        return '<button type="button" class="sg-room-pick' + (on ? ' on' : '') + '" data-room-knight="' + esc(t.id) + '"' +
          ' style="--el:' + color(t.element) + '"' + (lockedK ? ' disabled' : '') + ' aria-pressed="' + Boolean(on) + '">' +
          '<span class="sg-room-pick-art">' + (t.cardArtUrl ? '<img ' + artAttrs(t.cardArtUrl, 200) + ' alt="" loading="lazy">' : '') + '</span>' +
          '<span class="sg-room-pick-copy"><strong>' + esc(t.name) + '</strong>' +
            '<em><img src="' + icon(t.element) + '" alt="' + esc(title(t.element)) + '">' + esc(title(t.rarity || '')) + '</em></span>' +
        '</button>';
      }).join('') + '</div>';
    }
    if (rv.tab === 'invite') {
      var url = (rv.status && rv.status.shareUrl) || (location.origin + '/room/' + rv.code);
      var friends = ((opts.live && opts.live.friends) || []).slice().sort(function (a, b) {
        return Number(Boolean(b.presence && b.presence.online)) - Number(Boolean(a.presence && a.presence.online));
      });
      return '<div class="sg-room-invite">' +
        '<div class="sg-room-link"><input readonly value="' + esc(url) + '" aria-label="Invite link" data-room-link>' +
          '<button type="button" data-room-copy="link">Copy</button></div>' +
        (navigator.share ? '<button type="button" class="sg-room-share" data-room-act="share">Share invite…</button>' : '') +
        '<h4>Invite a friend</h4>' +
        (opts.guest ? '<p class="sg-room-empty">Sign in to invite friends directly.</p>'
          : friends.length ? '<ul class="sg-room-friends">' + friends.map(function (f) {
              var id = f.id || f.userId || '';
              var online = f.presence && f.presence.online;
              var sent = rv.invited[id];
              return '<li><i class="sg-room-presence' + (online ? ' on' : '') + '"></i><span>' + esc(friendName(f)) +
                '<em>' + (online ? 'Online' : 'Offline') + '</em></span>' +
                '<button type="button" data-room-invite="' + esc(id) + '"' + (sent ? ' disabled' : '') + '>' + (sent ? 'Sent' : 'Invite') + '</button></li>';
            }).join('') + '</ul>'
          : '<p class="sg-room-empty">No friends yet. Add some from Social, or share the link.</p>') +
      '</div>';
    }
    return '<div class="sg-room-chat">' +
      '<div class="sg-room-chat-log" data-room-chat-log>' + chatLogHtml() + '</div>' +
      '<form class="sg-room-chat-form" data-room-chat>' +
        '<input name="message" maxlength="120" placeholder="Say something…" autocomplete="off" aria-label="Message the table">' +
        '<button type="submit">Send</button></form>' +
    '</div>';
  }

  function chatLogHtml() {
    var lines = ((rv.status && rv.status.lobbyChat) || []).slice(-30);
    if (!lines.length) return '<p class="sg-room-empty">Say hello while you wait.</p>';
    return lines.map(function (l) {
      return '<p class="' + (l.role === 'system' ? 'is-system' : '') + '"><b>' + esc(l.author || 'Player') + '</b>' + esc(l.text || '') + '</p>';
    }).join('');
  }

  /* ---- behaviour ---- */

  function stopRoomTimers() {
    if (roomPoll) { clearInterval(roomPoll); roomPoll = null; }
    if (roomTick) { clearInterval(roomTick); roomTick = null; }
  }

  function mountRoom(app, opts) {
    var root = app.querySelector('[data-room]');
    if (!root) return;
    var params = new URLSearchParams(location.search);
    var code = roomCodeFromPath();
    rv = {
      code: code, mode: code ? 'table' : 'host', session: null, status: null, preview: null,
      tournament: null, tournamentId: code ? '' : (params.get('tournament') || ''),
      deckKey: '', trainerId: '', tab: 'deck', busy: false, error: '', gone: '',
      invited: {}, chatSeen: 0, unread: false, launched: false
    };
    stopRoomTimers();

    function paintHero() {
      var hero = root.querySelector('[data-room-hero]');
      var theme = roomTheme(opts);
      root.style.setProperty('--el', color(theme.el));
      paintBackdrop(theme);
      hero.classList.toggle('is-tour', theme.tour);
      hero.innerHTML = roomHeroHtml(opts);
    }
    // The whole screen stands in the table's Land: a tournament in that Land's
    // boss arena, an open table in its elite arena (the Siege location scenes,
    // 3:2), and a portrait phone in the Land's own tall painting, which a wide
    // scene would only crop to a sliver.
    function paintBackdrop(theme) {
      var back = app.querySelector('[data-room-backdrop]');
      if (!back) return;
      var key = EL_LAND[String(theme.el || '').toUpperCase()] || 'relic';
      var wide = '/img/lands/locations/' + key + (theme.tour ? '-boss' : '-elite') + '.webp';
      if (back.getAttribute('data-src') === wide) return;
      back.setAttribute('data-src', wide);
      back.style.setProperty('--room-wide', 'url(\'' + wide + '\')');
      back.style.setProperty('--room-tall', 'url(\'' + land(theme.el) + '\')');
      back.style.setProperty('--el', color(theme.el));
    }
    function paintStage() {
      root.querySelector('[data-room-stage]').innerHTML = stageHtml(opts);
    }
    function paintPanel() {
      var panel = root.querySelector('[data-room-panel]');
      panel.hidden = Boolean(rv.gone);
      if (rv.gone) return;
      var pane = panel.querySelector('[data-room-pane]');
      var scroll = pane ? pane.scrollTop : 0;
      panel.innerHTML = panelHtml(opts);
      pane = panel.querySelector('[data-room-pane]');
      if (pane) pane.scrollTop = scroll;
      scrollChat();
    }
    function paintAll() {
      app.setAttribute('data-room-role', roomRole());
      paintHero(); paintStage(); paintPanel();
    }
    function scrollChat() {
      var log = root.querySelector('[data-room-chat-log]');
      if (log) log.scrollTop = log.scrollHeight;
    }
    // A poll repaints only what can change under the player: the seats, the
    // status line and the chat. The pickers and a half-typed message survive.
    function paintLive() {
      paintStage();
      var log = root.querySelector('[data-room-chat-log]');
      if (log) {
        var stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        log.innerHTML = chatLogHtml();
        if (stick) scrollChat();
      }
      var chatTab = root.querySelector('[data-room-tab="chat"]');
      if (chatTab) {
        var dot = chatTab.querySelector('.sg-room-dot');
        if (rv.unread && !dot) chatTab.insertAdjacentHTML('beforeend', '<i class="sg-room-dot"></i>');
        if (!rv.unread && dot) dot.remove();
      }
      var expiry = root.querySelector('[data-room-expiry]');
      if (expiry && rv.status && rv.status.guestJoined) paintHero();
    }

    function adopt(status, session) {
      rv.session = session;
      rv.status = status;
      rv.code = status.roomId || rv.code;
      if (status.tournament) rv.tournament = status.tournament;
      var chat = (status.lobbyChat || []).length;
      if (rv.tab === 'chat') rv.chatSeen = chat;
      rv.unread = chat > rv.chatSeen && rv.tab !== 'chat';
      writeJson(ROOM_SESSION_KEY, session);
      if (location.pathname !== '/room/' + rv.code) {
        try { history.replaceState({ screen: 'room' }, '', '/room/' + rv.code); } catch (e) { /* sandboxed */ }
      }
    }

    function launch() {
      if (rv.launched || !rv.session) return;
      rv.launched = true;
      stopRoomTimers();
      var s = rv.session;
      writeJson(ROOM_MATCH_KEY, { roomId: s.roomId, playerToken: s.playerToken,
        viewerSide: (rv.status && rv.status.viewerSide) || (roomRole() === 'host' ? 'PLAYER' : 'ENEMY') });
      var body = loadoutBody(opts) || {};
      writeJson(ROOM_PENDING_KEY, { createdAt: Date.now(), mode: 'online', onlineRoomMode: 'join', roomId: s.roomId,
        battleLaunch: true, deckId: body.deckId || '', trainerId: body.trainerId || '', playerName: roomPlayerName(opts),
        customDeckCards: body.customDeckCards || null, loadoutLabel: body.loadoutLabel || '' });
      if (roomRole() === 'host') writeJson(ROOM_HOST_KEY, null);
      paintStage();
      window.location.href = '/play';
    }

    function closed(message) {
      stopRoomTimers();
      var s = rv.session;
      if (s) {
        var host = readJson(ROOM_HOST_KEY);
        if (host && host.roomId === s.roomId) writeJson(ROOM_HOST_KEY, null);
        var saved = readJson(ROOM_SESSION_KEY);
        if (saved && saved.roomId === s.roomId) writeJson(ROOM_SESSION_KEY, null);
      }
      rv.session = null;
      rv.gone = message || 'This table has closed.';
      paintAll();
    }

    function poll() {
      if (!root.isConnected) { stopRoomTimers(); return; }
      if (!rv.session || rv.launched) return;
      roomFetch('/api/match/status', 'GET', null, rv.session).then(function (st) {
        if (!root.isConnected || rv.launched) return;
        if (!st || st.error || st.closed) {
          // A network blip keeps the table; a server answer that it is gone ends it.
          if (st && (st.closed || /not found|closed|expired|no longer/i.test(st.error || ''))) closed(st.error || 'The host closed this table.');
          return;
        }
        adopt(st, rv.session);
        if (st.started) { launch(); return; }
        paintLive();
      });
    }

    function startPolling() {
      stopRoomTimers();
      roomPoll = setInterval(poll, ROOM_POLL_MS);
      roomTick = setInterval(function () {
        if (!root.isConnected) { stopRoomTimers(); return; }
        var clock = root.querySelector('[data-room-clock]');
        if (clock && rv.tournament) clock.textContent = countdown(rv.tournament.endsAt);
        var exp = root.querySelector('[data-room-expiry]');
        if (exp && rv.status && rv.status.expiresAt) exp.textContent = roomExpiry(rv.status.expiresAt);
      }, 15000);
    }

    // Which seat, if any, this browser already holds at this table.
    function findSession(code) {
      var candidates = [];
      var host = readJson(ROOM_HOST_KEY);
      if (host && String(host.roomId).toUpperCase() === code && host.playerToken) {
        candidates.push({ roomId: host.roomId, playerToken: host.playerToken, role: 'host' });
      }
      var saved = readJson(ROOM_SESSION_KEY);
      if (saved && String(saved.roomId).toUpperCase() === code && saved.playerToken) candidates.push(saved);
      var match = readJson(ROOM_MATCH_KEY);
      if (match && String(match.roomId).toUpperCase() === code && match.playerToken) {
        candidates.push({ roomId: match.roomId, playerToken: match.playerToken, role: match.viewerSide === 'ENEMY' ? 'guest' : 'host' });
      }
      function next(i) {
        if (i >= candidates.length) {
          if (opts.guest) return Promise.resolve(null);
          // A signed-in host on a new device: the server knows the table is theirs.
          return roomFetch('/api/match/reconnect-host', 'POST', { roomId: code }).then(function (res) {
            if (!res || res.error || !res.playerToken) return null;
            var s = { roomId: res.roomId, playerToken: res.playerToken, role: 'host' };
            writeJson(ROOM_HOST_KEY, { roomId: res.roomId, playerToken: res.playerToken, expiresAt: res.expiresAt || null });
            return roomFetch('/api/match/status', 'GET', null, s).then(function (st) {
              return st && !st.error ? { session: s, status: st } : null;
            });
          });
        }
        var c = candidates[i];
        return roomFetch('/api/match/status', 'GET', null, c).then(function (st) {
          if (st && !st.error && !st.closed) return { session: c, status: st };
          return next(i + 1);
        });
      }
      return next(0);
    }

    function loadPreview() {
      return roomFetch('/api/match/rooms', 'GET').then(function (res) {
        var list = (res && res.rooms) || [];
        var hit = list.filter(function (r) { return String(r.roomId || '').toUpperCase() === rv.code; })[0];
        if (!hit) { rv.gone = 'Table ' + rv.code + ' is not open any more. It may have started or closed.'; return; }
        if (hit.status === 'Started' || Number(hit.playerCount) >= 2) { rv.gone = 'Table ' + rv.code + ' is already full.'; return; }
        rv.preview = hit;
        rv.tournamentId = hit.tournamentId || '';
        if (rv.tournamentId) return loadTournament();
      });
    }

    function loadTournament() {
      return roomFetch('/api/tournaments', 'GET').then(function (data) {
        var t = data && data.current;
        if (t && t.id === rv.tournamentId) rv.tournament = t;
        else if (rv.mode === 'host') {
          rv.tournamentId = '';
          rv.error = 'That tournament has ended. This will be an open table.';
        }
      });
    }

    function boot() {
      if (rv.mode === 'host') {
        var ready = rv.tournamentId ? loadTournament() : Promise.resolve();
        return ready.then(paintAll);
      }
      return findSession(rv.code).then(function (found) {
        if (found) {
          adopt(found.status, found.session);
          if (found.status.started) { launch(); return; }
          paintAll();
          startPolling();
          return;
        }
        return loadPreview().then(paintAll);
      });
    }

    function act(kind) {
      if (rv.busy) return;
      var body = loadoutBody(opts);
      if (kind === 'share') {
        var url = (rv.status && rv.status.shareUrl) || (location.origin + '/room/' + rv.code);
        navigator.share({ title: 'Siegelings table ' + rv.code,
          text: (rv.tournament ? rv.tournament.name + ' table' : 'Join my Siegelings table') + ' — code ' + rv.code, url: url })
          .catch(function () { /* dismissed */ });
        return;
      }
      rv.error = '';
      var request;
      if (kind === 'create') {
        if (!body) return;
        if (rv.tournamentId) body.tournamentId = rv.tournamentId;
        request = roomFetch('/api/match/create', 'POST', body).then(function (res) {
          if (!res || res.error) throw new Error((res && res.error) || 'Could not open the table.');
          var s = { roomId: res.roomId, playerToken: res.playerToken, role: 'host' };
          writeJson(ROOM_HOST_KEY, { roomId: res.roomId, playerToken: res.playerToken, expiresAt: res.expiresAt || null, shareUrl: res.shareUrl || '' });
          rv.mode = 'table';
          rv.tab = 'invite';
          adopt(res, s);
          startPolling();
        });
      } else if (kind === 'join') {
        if (!body) return;
        body.roomId = rv.code;
        request = roomFetch('/api/match/join', 'POST', body).then(function (res) {
          if (!res || res.error) throw new Error((res && res.error) || 'Could not join this table.');
          adopt(res, { roomId: res.roomId, playerToken: res.playerToken, role: 'guest' });
          if (res.started) { launch(); return; }
          startPolling();
        });
      } else if (kind === 'ready') {
        if (!body) return;
        body.roomId = rv.session.roomId;
        request = roomFetch('/api/match/ready', 'POST', body, rv.session).then(function (res) {
          if (!res || res.error) throw new Error((res && res.error) || 'Could not lock in.');
          adopt(res, rv.session);
          if (res.started) launch();
        });
      } else if (kind === 'leave' || kind === 'close') {
        if (kind === 'close' && !window.confirm('Close this table? Anyone waiting in it will be sent back.')) return;
        var s = rv.session;
        request = roomFetch(kind === 'close' ? '/api/match/close' : '/api/match/leave', 'POST', { roomId: s.roomId }, s)
          .then(function (res) {
            if (res && res.error && !/not found|closed/i.test(res.error)) throw new Error(res.error);
            writeJson(ROOM_MATCH_KEY, null);
            closed(kind === 'close' ? 'Table closed.' : 'You left the table.');
          });
      }
      if (!request) return;
      rv.busy = true;
      paintStage();
      request.catch(function (err) { rv.error = err.message; }).then(function () {
        rv.busy = false;
        if (!rv.launched) paintAll();
      });
    }

    root.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      var btn = t.closest('[data-room-act]');
      if (btn && !btn.disabled) { act(btn.getAttribute('data-room-act')); return; }
      var tab = t.closest('[data-room-tab]');
      if (tab) {
        rv.tab = tab.getAttribute('data-room-tab');
        if (rv.tab === 'chat') { rv.chatSeen = ((rv.status && rv.status.lobbyChat) || []).length; rv.unread = false; }
        paintPanel();
        return;
      }
      var deck = t.closest('[data-room-deck]');
      if (deck && !deck.disabled) { rv.deckKey = deck.getAttribute('data-room-deck'); paintAll(); return; }
      var knight = t.closest('[data-room-knight]');
      if (knight && !knight.disabled) { rv.trainerId = knight.getAttribute('data-room-knight'); paintPanel(); paintStage(); return; }
      var copy = t.closest('[data-room-copy]');
      if (copy) {
        var what = copy.getAttribute('data-room-copy');
        var text = what === 'code' ? rv.code : ((rv.status && rv.status.shareUrl) || (location.origin + '/room/' + rv.code));
        var done = function () {
          var label = what === 'code' ? copy.querySelector('[data-room-copied]') : copy;
          if (label) { label.textContent = 'Copied'; setTimeout(function () { label.textContent = 'Copy'; }, 1600); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this:', text); });
        else window.prompt('Copy this:', text);
        return;
      }
      var invite = t.closest('[data-room-invite]');
      if (invite && !invite.disabled) {
        var id = invite.getAttribute('data-room-invite');
        var url = (rv.status && rv.status.shareUrl) || (location.origin + '/room/' + rv.code);
        invite.disabled = true;
        invite.textContent = 'Sending…';
        roomFetch('/api/social/messages/send', 'POST', { recipientId: id,
          text: (rv.tournament ? 'Join my ' + rv.tournament.name + ' table' : 'Join my table') + ' — room ' + rv.code + ': ' + url })
          .then(function (res) {
            if (!res || res.error) { invite.disabled = false; invite.textContent = 'Retry'; return; }
            rv.invited[id] = true;
            invite.textContent = 'Sent';
          });
      }
    });

    root.addEventListener('submit', function (e) {
      var form = e.target.closest && e.target.closest('[data-room-chat]');
      if (!form) return;
      e.preventDefault();
      var text = String(form.message.value || '').trim();
      if (!text || !rv.session) return;
      form.message.value = '';
      roomFetch('/api/match/lobby-chat', 'POST', { roomId: rv.session.roomId, message: text }, rv.session).then(function (res) {
        if (!res || res.error) { form.message.value = text; return; }
        if (rv.status) rv.status.lobbyChat = res.lobbyChat || [];
        rv.chatSeen = (rv.status && rv.status.lobbyChat || []).length;
        paintLive();
        scrollChat();
      });
    });

    paintAll();
    boot();
  }

  /* Profile and Social share the Shop-style destination rail. Keeping it
     outside data-social-body preserves navigation during live inbox refreshes. */
  function socialScreen(opts) {
    opts = opts || {};
    var tab = socialTab;
    return profileBackdrop() + topMarkup(opts) + profileNavigation(opts, tab) +
      '<div class="sg-scroll" data-social-scroll>' +
        '<div data-social-body>' + socialTabBody(opts, tab) + '</div>' +
      '</div>' +
      sheetHost() +
      (opts.guest ? '' : profileEditorHost()) +
      bottomMarkup('social', opts);
  }

  var FAB_ICONS = {
    profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    friends: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9.5" r="2.8"/><path d="M2.5 20c0-3.8 3-6 6.5-6s6.5 2.2 6.5 6"/><path d="M15.5 14.3c3 .1 6 1.9 6 5.7"/></svg>',
    messages: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>'
  };

  function socialFab(opts, tab) {
    var unread = unreadThreadCount(opts);
    var badge = function (n) {
      return n ? '<i class="sg-tab-badge">' + esc(n > 9 ? '9+' : String(n)) + '</i>' : '';
    };
    return '<div class="sg-fab-wrap" data-fab>' +
      '<button class="sg-fab-scrim" type="button" data-fab-close tabindex="-1" aria-hidden="true"></button>' +
      '<div class="sg-fab-menu" role="menu" aria-label="Social">' +
        SOCIAL_TABS.map(function (t) {
          return '<button class="sg-fab-item' + (t[0] === tab ? ' on' : '') + '" type="button" role="menuitem" ' +
            'data-social-tab="' + t[0] + '" aria-selected="' + (t[0] === tab ? 'true' : 'false') + '">' +
            '<span class="sg-fab-label">' + esc(t[1]) + '</span>' +
            '<span class="sg-fab-ico">' + FAB_ICONS[t[0]] + '</span>' +
            (t[0] === 'messages' ? badge(unread) : '') +
          '</button>';
        }).join('') +
      '</div>' +
      '<button class="sg-fab" type="button" data-fab-toggle aria-expanded="false" aria-label="Friends and messages">' +
        '<span class="sg-fab-ico">' + FAB_ICONS.friends + '</span>' +
        '<i class="sg-fab-badge" data-fab-badge' + (unread ? '' : ' hidden') + '>' + esc(unread > 9 ? '9+' : String(unread)) + '</i>' +
      '</button>' +
    '</div>';
  }

  // Friends and Messages clear the fixed top bar with a spacer and a title.
  // Profile does not: its artwork runs to the top edge behind the bar, the
  // same as the standalone Profile screen.
  function socialTitle(text) {
    return '<div class="sg-social-head"></div><div class="sg-social-title"><h2>' + esc(text) + '</h2></div>';
  }

  function socialTabBody(opts, tab) {
    if (tab === 'friends') return socialTitle('Friends') + friendsTab(opts);
    if (tab === 'messages') return socialTitle('Messages') + messagesTab(opts);
    return profileBody(opts);
  }

  /* ---------- friends tab ---------- */

  function friendName(f) {
    return (f && (f.displayName || f.name || f.email)) || 'Player';
  }
  function friendInitial(f) {
    return String(friendName(f)).charAt(0).toUpperCase();
  }

  function friendsTab(opts) {
    if (opts.guest) {
      return '<div class="sg-social-pad">' + guestBand() + '</div>';
    }
    var live = opts.live || {};
    var friends = live.friends || [];
    var incoming = live.incomingRequests || [];
    var rooms = live.rooms || [];
    return '<div class="sg-social-pad">' +
      // Adding someone is the first thing a new player needs, so it leads.
      '<section class="sg-section" data-friends-block="add">' +
        '<div class="sg-section-head"><h3>Add a friend</h3></div>' +
        '<form class="sg-add-friend" data-add-friend>' +
          '<input type="email" name="email" placeholder="Their account email" ' +
            'autocomplete="off" autocapitalize="off" spellcheck="false" required>' +
          '<button type="submit">Send</button>' +
        '</form>' +
        '<p class="sg-social-note" data-friend-note hidden></p>' +
      '</section>' +
      (incoming.length
        ? '<section class="sg-section" data-friends-block="requests">' +
            '<div class="sg-section-head"><h3>Requests</h3></div>' +
            '<div class="sg-stack sg-stack-tight">' + incoming.map(function (r) {
              var id = r.fromUserId || r.userId || r.id || '';
              return '<div class="sg-friend">' +
                '<span class="sg-friend-crest">' + esc(friendInitial(r)) + '</span>' +
                '<span class="sg-friend-body"><strong>' + esc(friendName(r)) + '</strong>' +
                  '<em>Wants to be friends</em></span>' +
                '<span class="sg-friend-acts">' +
                  '<button class="sg-mini-btn is-yes" type="button" data-friend-accept="' + esc(id) + '">Accept</button>' +
                  '<button class="sg-mini-btn" type="button" data-friend-deny="' + esc(id) + '">Deny</button>' +
                '</span>' +
              '</div>';
            }).join('') + '</div>' +
          '</section>'
        : '') +
      '<section class="sg-section" data-friends-block="friends">' +
        '<div class="sg-section-head"><h3>Friends</h3>' +
          (friends.length ? '<span class="sg-count">' + esc(friends.length) + '</span>' : '') + '</div>' +
        (friends.length
          ? '<div class="sg-stack sg-stack-tight">' + friends.map(friendRow).join('') + '</div>'
          : '<div class="sg-empty-row">No friends yet. Add someone by their account email above.</div>') +
      '</section>' +
      '<section class="sg-section" data-friends-block="tables">' +
        '<div class="sg-section-head"><h3>Open tables</h3></div>' +
        (rooms.length
          ? '<div class="sg-stack">' + rooms.slice(0, 8).map(lobbyRow).join('') + '</div>'
          : emptyLobbies()) +
      '</section>' +
      '<div style="height:96px"></div>' +
    '</div>';
  }

  /* A friend has no element of their own in the payload, so each one is given
     a land by a stable hash of their id: the landscape Friends rail paints
     friends as art tiles, and the same friend keeps the same plate every visit. */
  var FRIEND_LANDS = ['FIRE', 'WATER', 'WIND', 'EARTH', 'ICE', 'ELECTRIC', 'METAL', 'POISON', 'PSYCHIC', 'SHADOW', 'LIGHT', 'UNDEAD'];
  function friendElement(f) {
    var key = String((f && (f.favoriteElement || (f.presence && f.presence.favoriteElement))) || '').toUpperCase();
    if (FRIEND_LANDS.indexOf(key) >= 0) return key;
    var id = String((f && (f.id || f.userId || f.email)) || friendName(f));
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return FRIEND_LANDS[h % FRIEND_LANDS.length];
  }

  function friendRow(f) {
    var p = f.presence || {};
    var id = f.id || f.userId || '';
    var email = f.email || '';
    var status = p.online ? title(p.status || 'ONLINE') : 'Offline';
    var el = friendElement(f);
    return '<div class="sg-friend' + (p.online ? ' is-on' : '') + '" data-friend-id="' + esc(id) + '" ' +
      'style="--el:' + color(el) + ';--friend-land:url(\'' + land(el) + '\')">' +
      '<button class="sg-friend-crest is-link" type="button" data-friend-view="' + esc(id) + '" ' +
        'aria-label="View ' + esc(friendName(f)) + '\'s profile">' + esc(friendInitial(f)) + '</button>' +
      '<button class="sg-friend-body is-link" type="button" data-friend-view="' + esc(id) + '">' +
        '<strong>' + esc(friendName(f)) + '</strong><em>' + esc(status) + '</em></button>' +
      '<span class="sg-friend-acts">' +
        '<button class="sg-mini-btn" type="button" data-friend-msg="' + esc(id) + '" ' +
          'data-friend-name="' + esc(friendName(f)) + '">Message</button>' +
        '<button class="sg-mini-btn is-no" type="button" data-friend-remove="' + esc(email) + '" ' +
          'data-friend-name="' + esc(friendName(f)) + '">Remove</button>' +
      '</span>' +
    '</div>';
  }

  /* ---------- messages tab ----------
     An open thread is module state for the same reason the tab is: coming back
     to Social should not silently reopen a conversation the player left. */
  var openThread = null;   // { id, name }

  function threadPeerName(opts, peerId) {
    var friends = (opts.live && opts.live.friends) || [];
    for (var i = 0; i < friends.length; i++) {
      var f = friends[i];
      if ((f.id || f.userId) === peerId) return friendName(f);
    }
    return 'Player';
  }

  function messagesTab(opts) {
    if (opts.guest) {
      return '<div class="sg-social-pad">' + guestBand() + '</div>';
    }
    if (openThread) return threadView(opts);
    var threads = (opts.live && opts.live.threads) || [];
    return '<div class="sg-social-pad">' +
      '<section class="sg-section">' +
        '<div class="sg-section-head"><h3>Messages</h3></div>' +
        (threads.length
          ? '<div class="sg-stack sg-stack-tight">' + threads.map(function (t) {
              var name = threadPeerName(opts, t.peerId);
              return '<button class="sg-thread' + (t.unread ? ' is-unread' : '') + '" type="button" ' +
                'data-thread-open="' + esc(t.peerId) + '" data-thread-name="' + esc(name) + '">' +
                '<span class="sg-friend-crest">' + esc(String(name).charAt(0).toUpperCase()) + '</span>' +
                '<span class="sg-thread-body"><strong>' + esc(name) + '</strong>' +
                  '<em>' + esc(t.lastMessage || '') + '</em></span>' +
                (t.unread ? '<i class="sg-thread-dot" aria-label="Unread"></i>' : '') +
              '</button>';
            }).join('') + '</div>'
          : '<div class="sg-empty-row">No messages yet. Open a friend and say hello.</div>') +
      '</section>' +
      '<div style="height:96px"></div>' +
    '</div>';
  }

  function threadView() {
    return '<div class="sg-thread-view" data-thread-view>' +
      '<div class="sg-thread-head">' +
        '<button class="sg-thread-back" type="button" data-thread-close aria-label="Back to messages">‹</button>' +
        '<strong>' + esc(openThread.name) + '</strong>' +
      '</div>' +
      '<div class="sg-thread-log" data-thread-log>' +
        '<div class="sg-empty-row">Loading…</div>' +
      '</div>' +
      '<form class="sg-thread-compose" data-thread-send>' +
        '<input type="text" name="text" placeholder="Message ' + esc(openThread.name) + '" ' +
          'autocomplete="off" maxlength="500" required>' +
        '<button type="submit" aria-label="Send">➤</button>' +
      '</form>' +
    '</div>';
  }

  function lobbyRow(room, i) {
    var lead = CARDS[i % Math.max(1, CARDS.length)] || CARDS[0];
    var host = room.hostName || room.playerName || 'Open table';
    return '<article class="sg-lobby" style="--el:' + color(lead && lead.element) + '">' +
      '<div class="sg-lobby-bg" style="background-image:url(\'' + land(lead && lead.element) + '\')"></div>' +
      '<div class="sg-lobby-veil"></div>' +
      (lead ? '<div class="sg-lobby-art"><img ' + artAttrs(lead.cardArtUrl) + ' alt="" loading="lazy"></div>' : '') +
      '<div class="sg-lobby-body">' +
        '<span class="sg-lobby-kicker">Waiting</span>' +
        '<strong>' + esc(host) + '</strong>' +
        '<em>' + esc(room.roomId || room.id || 'Table') + '</em>' +
      '</div>' +
      '<span class="sg-lobby-go">Join ›</span>' +
    '</article>';
  }

  function emptyLobbies() {
    return '<div class="sg-empty-plate">' +
      '<img src="/img/gallery/frostag-training.webp" alt="" loading="lazy">' +
      '<div class="sg-empty-veil"></div>' +
      '<div class="sg-empty-body"><strong>Nobody is waiting</strong>' +
      '<p>Host a table and it shows up here for everyone.</p></div>' +
    '</div>';
  }

  /* ---------- social behaviour ----------
     Everything here talks to endpoints that already existed; what was missing
     was any way to reach them. Friend actions return the whole refreshed profile
     (that is what the auth endpoints answer with), so each one re-seeds the
     live model in place rather than forcing a reload. */
  var threadPoll = null;

  function liveApi() {
    return window.SiegelingsHomeLive || null;
  }

  function stopThreadPoll() {
    if (threadPoll) { clearInterval(threadPoll); threadPoll = null; }
  }

  function showFriendNote(app, text, bad) {
    var note = app.querySelector('[data-friend-note]');
    if (!note) return;
    note.textContent = text;
    note.hidden = false;
    note.classList.toggle('is-bad', Boolean(bad));
  }

  /* Re-renders the Social screen in place, carrying whatever the server just
     told us about friends and requests so the list is never a tap behind. */
  function paintSocialTabs(app, opts) {
    app.setAttribute('data-social-view', socialTab);
    var unread = unreadThreadCount(opts);
    var fabBadge = app.querySelector('[data-fab-badge]');
    if (fabBadge) {
      fabBadge.hidden = !unread;
      fabBadge.textContent = unread > 9 ? '9+' : String(unread);
    }
    app.querySelectorAll('[data-social-tab], .sg-profile-nav [data-social-goto], .sg-profile-nav [data-screen="profile"]').forEach(function (b) {
      var id = b.getAttribute('data-social-tab') || b.getAttribute('data-social-goto') || 'profile';
      var on = id === socialTab;
      b.classList.toggle('on', on);
      if (b.tagName === 'A') {
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      } else b.setAttribute('aria-selected', on ? 'true' : 'false');
      var badge = b.querySelector('.sg-tab-badge');
      if (id === 'messages') {
        if (!unread && badge) badge.remove();
        else if (unread && badge) badge.textContent = unread > 9 ? '9+' : String(unread);
        else if (unread && !badge) {
          var pip = document.createElement('i');
          pip.className = 'sg-tab-badge';
          pip.textContent = unread > 9 ? '9+' : String(unread);
          b.appendChild(pip);
        }
      }
    });
  }

  /* An open thread should fill the space between the page title and the tab bar.
     A fixed height cannot do that: the head spacer moves with the
     status-bar inset. Measured from where the view actually starts. */
  function layoutThread(app) {
    var view = app.querySelector('[data-thread-view]');
    if (!view) return;
    var nav = app.querySelector('.sg-bottom');
    var navH = nav ? nav.getBoundingClientRect().height : 90;
    var top = view.getBoundingClientRect().top;
    var glass = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    view.style.height = Math.max(240, glass - top - navH - 8) + 'px';
  }

  function refreshSocial(app, opts, patch) {
    if (patch) {
      opts.live = opts.live || {};
      if (patch.friends) opts.live.friends = patch.friends;
      if (patch.incomingFriendRequests) opts.live.incomingRequests = patch.incomingFriendRequests;
      if (patch.outgoingFriendRequests) opts.live.outgoingRequests = patch.outgoingFriendRequests;
      if (patch.threads) opts.live.threads = patch.threads;
    }
    var body = app.querySelector('[data-social-body]');
    if (body) body.innerHTML = socialTabBody(opts, socialTab);
    paintSocialTabs(app, opts);
    var bar = app.querySelector('[data-bottom]');
    if (bar) {
      // The tab badge is part of the bar, so it has to be repainted too.
      var badge = bar.querySelector('[data-nav="social"] .sg-nav-badge');
      var count = unreadThreadCount(opts);
      if (badge && !count) badge.remove();
      else if (badge) badge.textContent = count > 9 ? '9+' : String(count);
    }
    if (socialTab === 'messages' && openThread) startThread(app, opts);
    scheduleFit(app);
  }

  function loadThread(app, opts, scrollToEnd) {
    var api = liveApi();
    if (!api || !openThread) return Promise.resolve();
    return api.get('/api/social/messages/with/' + encodeURIComponent(openThread.id)).then(function (res) {
      var log = app.querySelector('[data-thread-log]');
      if (!log || !openThread) return;
      var messages = (res && res.messages) || [];
      if (res && res.error) {
        log.innerHTML = '<div class="sg-empty-row">' + esc(res.error) + '</div>';
        return;
      }
      if (!messages.length) {
        log.innerHTML = '<div class="sg-empty-row">No messages yet.</div>';
        return;
      }
      var next = messages.map(function (m) {
        return '<div class="sg-msg' + (m.mine ? ' is-mine' : '') + '">' +
          '<span>' + esc(m.text || '') + '</span>' +
        '</div>';
      }).join('');
      // Only touch the DOM when something actually changed: repainting under a
      // poll would fight the player's own scrolling every few seconds.
      if (log.innerHTML !== next) {
        log.innerHTML = next;
        log.scrollTop = log.scrollHeight;
      } else if (scrollToEnd) {
        log.scrollTop = log.scrollHeight;
      }
    });
  }

  function startThread(app, opts) {
    stopThreadPoll();
    layoutThread(app);
    loadThread(app, opts, true);
    // Polling, because this codebase has no WebSocket anywhere - the multiplayer
    // lobbies poll too. Slow enough to be cheap, quick enough to feel live.
    threadPoll = setInterval(function () {
      if (!openThread || !app.isConnected) return stopThreadPoll();
      loadThread(app, opts, false);
    }, 5000);
  }

  function isFabOpen(app) {
    var wrap = app.querySelector('[data-fab]');
    return Boolean(wrap && wrap.classList.contains('open'));
  }
  function setFabOpen(app, open) {
    var wrap = app.querySelector('[data-fab]');
    if (!wrap) return;
    wrap.classList.toggle('open', open);
    var btn = wrap.querySelector('[data-fab-toggle]');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function mountSocial(app, opts) {
    var api = liveApi();

    app.addEventListener('click', function (e) {
      var fabToggle = e.target.closest && e.target.closest('[data-fab-toggle], [data-fab-close]');
      if (fabToggle) {
        setFabOpen(app, fabToggle.hasAttribute('data-fab-toggle') && !isFabOpen(app));
        return;
      }

      var tabBtn = e.target.closest && e.target.closest('[data-social-tab]');
      if (tabBtn) {
        setFabOpen(app, false);
        setSocialTab(tabBtn.getAttribute('data-social-tab'));
        openThread = null;
        stopThreadPoll();
        refreshSocial(app, opts);
        var scroller = app.querySelector('[data-social-scroll]');
        if (scroller) scroller.scrollTop = 0;
        return;
      }

      var view = e.target.closest && e.target.closest('[data-friend-view]');
      if (view) {
        // A friend's public profile is a real endpoint; the card sheet is the
        // place this design already shows "someone else's thing".
        openFriendProfile(app, opts, view.getAttribute('data-friend-view'));
        return;
      }

      var msg = e.target.closest && e.target.closest('[data-friend-msg]');
      if (msg) {
        setSocialTab('messages');
        openThread = { id: msg.getAttribute('data-friend-msg'), name: msg.getAttribute('data-friend-name') };
        refreshSocial(app, opts);
        return;
      }

      var openT = e.target.closest && e.target.closest('[data-thread-open]');
      if (openT) {
        openThread = { id: openT.getAttribute('data-thread-open'), name: openT.getAttribute('data-thread-name') };
        refreshSocial(app, opts);
        return;
      }

      if (e.target.closest && e.target.closest('[data-thread-close]')) {
        openThread = null;
        stopThreadPoll();
        // Coming out of a thread re-reads the inbox, so the row that was just
        // read stops claiming to be unread.
        if (api) {
          api.get('/api/social/messages/threads').then(function (res) {
            refreshSocial(app, opts, { threads: (res && res.threads) || [] });
          });
        } else refreshSocial(app, opts);
        return;
      }

      var accept = e.target.closest && e.target.closest('[data-friend-accept]');
      if (accept && api) {
        accept.disabled = true;
        api.post('/api/profile/friends/accept', { fromUserId: accept.getAttribute('data-friend-accept') })
          .then(function (res) {
            if (res && res.error) return showFriendNote(app, res.error, true);
            refreshSocial(app, opts, res);
          });
        return;
      }

      var deny = e.target.closest && e.target.closest('[data-friend-deny]');
      if (deny && api) {
        deny.disabled = true;
        api.post('/api/profile/friends/deny', { fromUserId: deny.getAttribute('data-friend-deny') })
          .then(function (res) {
            if (res && res.error) return showFriendNote(app, res.error, true);
            refreshSocial(app, opts, res);
          });
        return;
      }

      var remove = e.target.closest && e.target.closest('[data-friend-remove]');
      if (remove && api) {
        var who = remove.getAttribute('data-friend-name') || 'this player';
        // Removing a friend is not undoable from here, so it asks first.
        if (!window.confirm('Remove ' + who + ' from your friends?')) return;
        remove.disabled = true;
        api.post('/api/profile/friends/delete', { email: remove.getAttribute('data-friend-remove') })
          .then(function (res) {
            if (res && res.error) return showFriendNote(app, res.error, true);
            refreshSocial(app, opts, res);
            showFriendNote(app, who + ' removed.');
          });
        return;
      }
    });

    app.addEventListener('submit', function (e) {
      var addForm = e.target.closest && e.target.closest('[data-add-friend]');
      if (addForm && api) {
        e.preventDefault();
        var input = addForm.querySelector('input[name="email"]');
        var email = (input && input.value || '').trim();
        if (!email) return;
        var btn = addForm.querySelector('button');
        if (btn) btn.disabled = true;
        api.post('/api/profile/friends', { email: email }).then(function (res) {
          if (btn) btn.disabled = false;
          if (res && res.error) return showFriendNote(app, res.error, true);
          if (input) input.value = '';
          refreshSocial(app, opts, res);
          showFriendNote(app, 'Request sent to ' + email + '.');
        });
        return;
      }

      var sendForm = e.target.closest && e.target.closest('[data-thread-send]');
      if (sendForm && api && openThread) {
        e.preventDefault();
        var field = sendForm.querySelector('input[name="text"]');
        var text = (field && field.value || '').trim();
        if (!text) return;
        // Clear the field immediately: a message that sits there while the
        // request is in flight gets sent twice by an impatient thumb.
        if (field) field.value = '';
        api.post('/api/social/messages/send', { recipientId: openThread.id, text: text })
          .then(function (res) {
            if (res && res.error) {
              var log = app.querySelector('[data-thread-log]');
              if (log) {
                var err = document.createElement('div');
                err.className = 'sg-empty-row';
                err.textContent = res.error;
                log.appendChild(err);
              }
              if (field) field.value = text;   // hand it back rather than losing it
              return;
            }
            loadThread(app, opts, true);
            // Sending makes the thread read (the server's unread flag is "the
            // last message is not mine"), so re-read the inbox and let the
            // badges settle now rather than when the player backs out.
            api.get('/api/social/messages/threads').then(function (list) {
              opts.live = opts.live || {};
              opts.live.threads = (list && list.threads) || [];
              paintSocialTabs(app, opts);
              var badge = app.querySelector('[data-nav="social"] .sg-nav-badge');
              var count = unreadThreadCount(opts);
              if (badge && !count) badge.remove();
              else if (badge) badge.textContent = count > 9 ? '9+' : String(count);
            });
          });
      }
    });
  }

  /* Another player's profile, read-only.

     This read flat keys - `p.displayName`, `p.matches`, `p.wins` - off a payload
     that has none of them. `/api/social/players/{id}/profile` answers with
     `profileSettings`, `stats`, `presence` and `recentMatches` as nested
     objects, so every lookup missed and the sheet rendered "Player" over three
     em-dashes. It reads the real shape now, and shows what the player's own
     profile shows - crest, title, bio, record, showcase, signature, recent -
     minus every control that edits it. Non-friends get the crest and the record
     but no match list, because that is what the server sends them. */

  function friendPresenceLabel(presence) {
    if (!presence) return '';
    if (presence.online) {
      var status = String(presence.status || '').toUpperCase();
      return status && status !== 'ONLINE' ? title(status) : 'Online';
    }
    if (!presence.lastSeenAt) return 'Offline';
    var seen = new Date(presence.lastSeenAt);
    if (isNaN(seen.getTime())) return 'Offline';
    var mins = Math.max(0, Math.round((Date.now() - seen.getTime()) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + 'h ago';
    return Math.round(hours / 24) + 'd ago';
  }

  function friendCrestAvatar(settings, name) {
    if (settings.avatarUrl) {
      return '<span class="sg-crest-ring"><img src="' + esc(settings.avatarUrl) + '" alt=""></span>';
    }
    if (String(settings.avatarMode || '').toUpperCase() === 'ELEMENT') {
      return '<span class="sg-crest-ring is-element"><img src="' +
        esc(icon(settings.favoriteElement)) + '" alt=""></span>';
    }
    var initial = settings.avatar || String(name || '?').charAt(0);
    return '<span class="sg-crest-ring"><i>' + esc(String(initial).charAt(0).toUpperCase()) + '</i></span>';
  }

  // The visitor's own gallery is the only art index the client has, so a piece
  // the host chose that this client never loaded simply falls back to the
  // default plate rather than leaving the crest flat.
  function friendCrestBackground(settings) {
    var piece = profileArtPiece(settings.profileArtId);
    return piece ? (piece.full || piece.thumb) : plate(scene('bearnade-payload'));
  }

  function friendSubtitle(stats, presence) {
    var bits = [];
    if (stats.siegeWins) bits.push(stats.siegeWins + ' Siege win' + (stats.siegeWins === 1 ? '' : 's'));
    if (stats.matches) bits.push(stats.matches + ' recorded match' + (stats.matches === 1 ? '' : 'es'));
    var seen = friendPresenceLabel(presence);
    if (seen) bits.push(seen);
    return bits.length ? bits.join(' \u00b7 ') : 'Siegelord';
  }

  function friendProfileMarkup(res) {
    var settings = res.profileSettings || {};
    var stats = res.stats || {};
    var presence = res.presence || {};
    var name = settings.displayName || 'Siegelord';
    var el = settings.favoriteElement || 'NEUTRAL';

    var favId = settings.favoriteCardId || settings.favoriteSieglingId || '';
    var showcase = mergeFavorite(settings.favoriteCardIds, favId);

    // The server's own completion figure, so a visitor reads exactly what the
    // owner sees. `collectibleTotal` is the live catalog as the SERVER counts it,
    // which is the right denominator even when this visitor's page loaded its
    // catalog before an element unlocked.
    var pct = stats.collectedPercent != null ? Math.round(stats.collectedPercent)
      : (stats.uniqueOwned != null && stats.collectibleTotal
          ? Math.round(stats.uniqueOwned / stats.collectibleTotal * 100) : null);
    var collected = pct == null ? '\u2014' : pct + '%';
    var rate = stats.matches ? (stats.winRate != null ? stats.winRate : 0) + '%' : '\u2014';

    var matches = Array.isArray(res.recentMatches) ? res.recentMatches : null;
    var sieges = Array.isArray(res.recentSiegeRuns) ? res.recentSiegeRuns : [];

    return '<button class="sg-sheet-dismiss" type="button" aria-label="Close profile"></button>' +
      '<div class="sg-friend-view">' +
        '<section class="sg-crest is-readonly" style="--el:' + color(el) + '">' +
          '<img class="sg-crest-bg" src="' + esc(friendCrestBackground(settings)) + '" alt="">' +
          '<div class="sg-crest-veil"></div>' +
          '<div class="sg-crest-body">' +
            friendCrestAvatar(settings, name) +
            '<h2>' + esc(name) + '</h2>' +
            (settings.playerTitle ? '<span class="sg-crest-title">' + esc(settings.playerTitle) + '</span>' : '') +
            '<p>' + esc(friendSubtitle(stats, presence)) + '</p>' +
            (settings.bio ? '<p class="sg-crest-bio">' + esc(settings.bio) + '</p>' : '') +
          '</div>' +
        '</section>' +
        '<div class="sg-tiles is-four">' +
          '<div><span>Matches</span><b>' + esc(stats.matches != null ? stats.matches : '\u2014') + '</b></div>' +
          '<div><span>Win Rate</span><b>' + esc(rate) + '</b></div>' +
          '<div><span>Collected</span><b>' + esc(collected) + '</b></div>' +
          '<div><span>Siege Best</span><b>' + esc(siegeBest(stats.siegeBestScore, sieges)) + '</b></div>' +
        '</div>' +
        (showcase.length
          ? '<section class="sg-section"><div class="sg-section-head"><h3>Showcase</h3></div>' +
              '<div class="sg-swipe" data-art-fit-group="showcase" data-count="' + showcase.length + '">' + showcase.map(function (c) { return featTile(c, favId); }).join('') + '</div></section>'
          : '') +
        '<section class="sg-section"><div class="sg-section-head"><h3>Recent</h3></div>' +
          (matches === null
            ? '<div class="sg-empty-row">Add ' + esc(name) + ' as a friend to see their match record.</div>'
            : (matches.length || sieges.length) && window.SiegelingsMatchReview
              ? '<div class="sg-stack sg-stack-tight">' + window.SiegelingsMatchReview.mergeRecent(matches, sieges, 5)
                  .map(window.SiegelingsMatchReview.rowMarkup).join('') + '</div>'
            : matches.length
              ? '<div class="sg-stack sg-stack-tight">' + matches.slice(0, 5).map(function (m) {
                  var won = String(m.result || '').toUpperCase() === 'WIN';
                  var against = m.opponentName ? 'vs ' + m.opponentName : (m.loadoutLabel || '');
                  return '<div class="sg-recent' + (won ? ' is-win' : '') + '">' +
                    '<span class="mode">' + esc(title(m.matchType || 'Match')) + '</span>' +
                    '<span class="what">' + esc(won ? 'Win' : 'Loss') +
                      (against ? '<em>' + esc(against) + '</em>' : '') + '</span>' +
                    '<span class="gain">' + esc(m.turnNumber != null ? 'T' + m.turnNumber : '') + '</span>' +
                  '</div>';
                }).join('') + '</div>'
              : '<div class="sg-empty-row">No matches recorded yet.</div>') +
        '</section>' +
      '</div>';
  }

  function openFriendProfile(app, opts, userId) {
    var api = liveApi();
    if (!api || !userId) return;
    var sheet = app.querySelector('[data-sheet]');
    api.get('/api/social/players/' + encodeURIComponent(userId) + '/profile').then(function (res) {
      if (!res || res.error) {
        showFriendNote(app, (res && res.error) || 'That profile could not be loaded.', true);
        return;
      }
      if (!sheet) {
        var fallbackName = (res.profileSettings && res.profileSettings.displayName) || 'That player';
        showFriendNote(app, fallbackName + ' \u2014 profile needs a newer version of this page.');
        return;
      }
      var card = sheet.querySelector('[data-sheet-card]');
      if (card) {
        card.innerHTML = friendProfileMarkup(res);
        card.scrollTop = 0;
      }
      sheet.classList.add('open');
      var dismiss = sheet.querySelector('.sg-sheet-dismiss');
      if (dismiss) dismiss.focus({ preventScroll: true });
      // Showcase tiles are real cards, so let the binder's fitter dress them.
      mountArtFit(sheet);
      scheduleFit(sheet);
    });
  }

  /* ---------- settings ---------- */

  // Settings cannot be art-led without lying about what it is - these are
  // switches. It gets the gallery plate, the palette and the spacing; the rows
  // stay rows, because a toggle pretending to be a hero is worse design.
  // These switches used to render invented on/off states and do nothing when
  // tapped. They are real device preferences now: keyed, defaulted honestly
  // (Reduced motion follows the OS setting), persisted to localStorage and read
  // back on the next paint, so what the screen shows is what is stored.
  var SETTINGS_KEY = 'sgHubPrefs';
  // Same invite the shipping hub's support row uses.
  var DISCORD_URL = 'https://discord.gg/T4WrHCGJ9b';
  var SETTINGS = [
    ['Audio', [['music', 'Music', true], ['sfx', 'Sound effects', true], ['voice', 'Battle voice', false]]],
    ['Motion', [['cardAnim', 'Card animations', true], ['pageTransitions', 'Page transitions', true],
                ['reducedMotion', 'Reduced motion', null], ['parallax', 'Background parallax', true]]],
    ['Notifications', [['inviteNotify', 'Match invites', true], ['keepNotify', 'Keep ready', true],
                       ['resetNotify', 'Daily reset', false]]]
  ];

  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writePref(key, on) {
    var prefs = readPrefs();
    prefs[key] = on;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ }
  }
  function prefValue(key, fallback) {
    var prefs = readPrefs();
    if (Object.prototype.hasOwnProperty.call(prefs, key)) return Boolean(prefs[key]);
    if (fallback === null) {
      return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    return Boolean(fallback);
  }
  function mountSettings(app) {
    var out = app.querySelector('[data-signout]');
    if (out) out.addEventListener('click', signOut);
    mountDeleteAccount(app);
    [].slice.call(app.querySelectorAll('[data-pref]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var on = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        btn.classList.toggle('on', on);
        writePref(btn.getAttribute('data-pref'), on);
        // page-transitions.js reads both of these; let it re-check now rather
        // than on the next page load.
        if (window.SgTransition && window.SgTransition.refresh) window.SgTransition.refresh();
      });
    });
  }

  function settingsScreen(opts) {
    opts = opts || {};
    return topMarkup(opts) +
      // Landscape and desktop lay the sections out as a no-scroll grid of
      // cards over the full artwork (hub-workspaces.css .sg-settings-workspace).
      '<div class="sg-scroll sg-settings-workspace">' +
        '<section class="sg-crest sg-crest-short">' +
          '<img class="sg-crest-bg" src="/img/gallery/skydon-skyreach.webp" alt="">' +
          '<div class="sg-crest-veil"></div>' +
          '<div class="sg-crest-body"><h2>Settings</h2><p>' +
            esc(opts.guest ? 'Signed out'
                 : ((opts.live && opts.live.displayName) || 'Signed in')) +
            '</p></div>' +
        '</section>' +
        SETTINGS.map(function (group, gi) {
          return '<section class="sg-section sg-settings-card" style="--sec:' +
            ['var(--acc-coral)', 'var(--acc-cyan)', 'var(--acc-violet)'][gi % 3] + '">' +
            '<div class="sg-section-head"><h3>' + esc(group[0]) + '</h3></div>' +
            '<div class="sg-stack sg-stack-tight">' + group[1].map(function (row) {
              var on = prefValue(row[0], row[2]);
              return '<div class="sg-toggle-row"><span>' + esc(row[1]) + '</span>' +
                '<button class="sg-switch' + (on ? ' on' : '') + '" type="button" data-pref="' + esc(row[0]) + '" ' +
                'role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><i></i></button></div>';
            }).join('') + '</div>' +
          '</section>';
        }).join('') +
        '<section class="sg-section sg-settings-card" style="--sec:var(--acc-lemon)">' +
          '<div class="sg-section-head"><h3>Account</h3></div>' +
          '<div class="sg-stack sg-stack-tight">' +
            (opts.guest
              ? '<a class="sg-toggle-row is-link" href="/login" data-screen="auth"><span>Sign in</span><em>\u203a</em></a>' +
                '<a class="sg-toggle-row is-link" href="/login" data-screen="auth"><span>Create account</span><em>\u203a</em></a>'
              // Sign out actually signs out now: it used to be a link to
              // /profile, which did nothing at all.
              : '<a class="sg-toggle-row is-link" href="/profile" data-screen="profile"><span>Profile</span><em>\u203a</em></a>' +
                '<button class="sg-toggle-row is-link" type="button" data-signout><span>Sign out</span><em>\u203a</em></button>') +
          '</div>' +
        '</section>' +
        // These three were on the old hub and were simply not carried over.
        '<section class="sg-section sg-settings-card" style="--sec:var(--acc-cyan)">' +
          '<div class="sg-section-head"><h3>Community &amp; tools</h3></div>' +
          '<div class="sg-stack sg-stack-tight">' +
            '<a class="sg-toggle-row is-link" href="' + DISCORD_URL + '" target="_blank" rel="noreferrer noopener">' +
              '<span>Discord server<em class="sg-row-note">Help, bug reports and feedback</em></span><em>\u2197</em></a>' +
            '<a class="sg-toggle-row is-link" href="/card-dashboard.html">' +
              '<span>Card dashboard<em class="sg-row-note">Live card, deck and trainer data</em></span><em>\u2197</em></a>' +
            '<a class="sg-toggle-row is-link" href="/help" data-screen="help"><span>Help &amp; rules</span><em>\u203a</em></a>' +
          '</div>' +
        '</section>' +
        // Deletion is irreversible, so it is its own section, behind a typed
        // confirmation, and never a row a thumb can hit by accident.
        (opts.guest ? '' :
          '<section class="sg-section sg-settings-card" style="--sec:var(--acc-coral)">' +
            '<div class="sg-section-head"><h3>Danger zone</h3></div>' +
            '<div class="sg-danger" data-danger>' +
              '<button class="sg-toggle-row is-link is-danger" type="button" data-delete-open>' +
                '<span>Delete account</span><em>\u203a</em></button>' +
              '<div class="sg-danger-body" hidden data-delete-panel>' +
                '<p>This erases your decks, collection, match history and Siege saves. ' +
                'It cannot be undone.</p>' +
                '<label class="sg-auth-field"><span>Type DELETE to confirm</span>' +
                  '<input type="text" data-delete-input autocomplete="off" placeholder="DELETE"></label>' +
                '<p class="sg-auth-error" data-delete-error hidden></p>' +
                '<div class="sg-danger-actions">' +
                  '<button class="sg-ghost-btn" type="button" data-delete-cancel>Cancel</button>' +
                  '<button class="sg-danger-go" type="button" data-delete-go>Permanently delete</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</section>') +
        '<div style="height:96px"></div>' +
      '</div>' +
      bottomMarkup('more', opts);
  }

  /* ---------- help ---------- */

  // Player-facing chapters for the hub's /help route. Keep mode and feature
  // guidance aligned with help.html, which still serves legacy and embedded
  // readers. The fifth slot holds escaped blocks for the chapter popup.
  var HELP = [
    ["Game modes", "Choose your next adventure", "/img/lands/earth.webp", "EARTH", [
      ["defs", [
        ["Battle Table / Arena", "Solo against AI or live 1v1 with a deck and SiegeKnight. Standard Battle starts at 50 HP; Siege leveling bonuses do not apply."],
        ["Siege, Endless & Battlegrounds", "AP-based expedition combat. Siege banks veterans; Endless chases a score; Battlegrounds fields an extracted squad. Open /siege to choose a mode or its simulated Tutorial."],
        ["Gauntlet", "Draft ten cards and climb floors using Battle Table combat, with 25 HP each fight and three losses per run."],
        ["Dominion", "Build your keep, train your SiegeKnight, and explore — the kingdom and idle RPG in one save."]
      ]],
      ["link", ["/battle", "Choose a Battle mode"]]
    ]],
    ['Basics', 'How a match runs end to end', '/img/lands/relic.webp', 'NEUTRAL', [
      ['p', 'Siegelings is a tactical elemental card game. Each player builds a 3×3 board half. Creature cards — Siegelings — fight with abilities paid for by elemental energy. There is no printed ATK or DEF: all damage comes from abilities.'],
      ['facts', [['50', 'Player Health'], ['3×3', 'Board half'], ['5', 'Siegelings max'], ['+1 / -1', 'Weak / resist']]],
      ['list', [
        'Player HP starts at 50. When one of your Siegelings is defeated you take rarity-based bounty damage.',
        'A Siegeling’s printed stats are Health, Speed, notches (directional coloured dots) and abilities.',
        'Board cap is 5 Siegelings per side. Evolutions do not count against the cap or the one-placement-per-turn limit.',
        'You win by reducing the opponent’s HP to 0.'
      ]]
    ]],
    ['Turn loop', 'Draw, Setup, Battle, repeat', '/img/lands/fire.webp', 'FIRE', [
      ['p', 'Each round cycles through three phases for the active player.'],
      ['steps', [
        ['Draw', 'Draw cards into your hand to prepare the turn.'],
        ['Setup', 'Place at most one new Siegeling, play Strategies and Deceptions, and optionally claim surviving Siegelings for temporary energy. Afflictions like Burn and Wither resolve at the start of your Setup.'],
        ['Battle', 'Every ready Siegeling acts in Speed order, spending energy on its abilities. Then the next round begins.']
      ]]
    ]],
    ['Card types', 'Siegeling, Strategy, Deception', '/img/gallery/draco-brood.webp', 'EARTH', [
      ['defs', [
        ['Siegeling', 'Creatures you place on the board. They carry notches, Health, Speed and battle abilities.'],
        ['Strategy', 'Immediate effects played from hand during Setup. Older card data calls this role Spell.'],
        ['Deception', 'Reactive cards set face down. They reveal when their condition is met, often during the opponent’s actions. Older data calls this role Trap.'],
        ['Evolution', 'Placed onto a live precursor already on your board. Skips the placement cap and the one-per-turn limit.'],
        ['SiegeKnight', 'Your trainer. Grants a passive plus an active or ultimate that shapes the whole match.']
      ]],
      ['note', 'Standard premade decks are 40 cards: 20 Siegelings, 10 Strategies and 10 Deceptions, at most 3 copies of a card, full evolution lines only.']
    ]],
    ['Board, notches & energy', 'Links, sockets and what they pay for', '/img/lands/electric.webp', 'ELECTRIC', [
      ['p', 'The coloured dots on a Siegeling’s edges are notches. When two adjacent cards’ notches point at each other — a reciprocal link — they connect and generate elemental energy.'],
      ['list', [
        'Sockets on the board perimeter anchor edge cells instead: left column LEFT, right column RIGHT, outer row TOP or BOTTOM.',
        'Energy pays for Strategies, Deceptions and battle abilities, and the element of the cost matters.',
        'Claim, during Setup, spends a surviving Siegeling’s presence for temporary energy. Cursed units cannot be claimed.',
        'Placement must stay legal on your half — foundation and network rules decide which cells light up.'
      ]],
      ['note', 'Energy pools: every element has its own pool — Fire, Ice, Earth, Wind, Water, Electric, Metal, Poison, Psychic, Undead, Light and Shadow. Neutral costs can be paid from any pool.']
    ]],
    ['Evolution', 'Growing a Siegeling mid-match', '/img/gallery/bearzooka-rampage.webp', 'FIRE', [
      ['p', 'An Evolution card is not placed on an empty cell. It is placed onto its live precursor, replacing it in the same cell and keeping that cell’s links.'],
      ['list', [
        'The precursor must be alive and on your board; the Evolution names which card it grows from.',
        'Evolving is exempt from the 5-Siegeling board cap and from the one-placement-per-turn limit, so you can still place a fresh Siegeling the same turn.',
        'A unit carrying any Curse stack cannot evolve until the Curse is gone.',
        'Decks may only run full evolution lines, so a stage-2 card always ships with the stage it grows from.'
      ]]
    ]],
    ['SiegeKnight', 'Passives, actives and ultimates', '/img/lands/light.webp', 'LIGHT', [
      ['p', 'Your SiegeKnight is the trainer behind the board. You pick one per match and it never enters play as a card.'],
      ['defs', [
        ['Passive', 'Always on for the whole match — usually a standing bonus to your Siegelings or your energy.'],
        ['Active', 'A deliberate ability you trigger, paid for from your energy pools like any other cost.'],
        ['Ultimate', 'A once-per-match swing, gated behind a heavier cost or condition.']
      ]],
      ['note', 'SiegeKnight XP upgrades passives and actives in Siege mode only. Those bonuses never change Standard Battle values.']
    ]],
    ['Buffs & afflictions', 'Temporary statuses and elemental damage', '/img/lands/poison.webp', 'POISON', [
      ['p', 'Abilities and trainer passives apply short-lived badges. Separately, when an elemental attack deals Health damage it can add a stack of that element’s affliction. Neutral damage never inflicts.'],
      ['sub', 'Temporary statuses'],
      ['defs', [
        ['Shield', 'Temporary hit points absorbed before Health. Cleared when depleted or when temporary effects lapse after Battle.'],
        ['Damage Boost', 'Outgoing ability damage is temporarily increased.'],
        ['Speed Boost', 'Higher effective Speed, so the unit tends to act earlier in the Battle queue.'],
        ['Max Health', 'Maximum Health raised, often with a matching heal. Distinct from a Shield stack.'],
        ['Frozen', 'Cannot act during Battle.'],
        ['Weak / Strong', 'The elemental matchup is against or for this unit — expect +1 or -1 damage.']
      ]],
      ['sub', 'Elemental afflictions'],
      ['aff', [
        ['Fire', 'FIRE', 'Burn', '5', 'Owner Setup: deal 1 damage per stack, then clear.'],
        ['Electric', 'ELECTRIC', 'Shock', '5', 'This card may spend 1 less energy per stack on its abilities.'],
        ['Poison', 'POISON', 'Toxin', '5', 'Cannot heal. Heal attempts remove Toxin stacks 1:1 instead.'],
        ['Wind', 'WIND', 'Disorient', '3', '+1 cost per stack on the lowest-cost ability.'],
        ['Shadow', 'SHADOW', 'Curse', '2', 'Cannot claim or evolve while any Curse remains.'],
        ['Water', 'WATER', 'Soak', '5', 'Attacks against this unit deal +1 damage per stack.'],
        ['Earth', 'EARTH', 'Leech', '2', 'The second Earth hit heals its attacker for the damage dealt, then clears.'],
        ['Ice', 'ICE', 'Chill', '3', '-1 Speed per stack. At 3, Freeze until the owner’s next Setup.'],
        ['Psychic', 'PSYCHIC', 'Insight', '3', 'At 3 stacks the inflicter draws 1 card, then all Insight clears.'],
        ['Light', 'LIGHT', 'Blind', '3', 'Ability effect values reduced by 1 per stack.'],
        ['Metal', 'METAL', 'Rust', '3', 'Next Metal attack deals +1 per stack, then clears Rust.'],
        ['Undead', 'UNDEAD', 'Wither', '3', 'Owner Setup: clamp HP as if max were -1 per stack, then clear.']
      ]]
    ]],
    ['Element chart', 'What beats what', '/img/lands/ice.webp', 'ICE', [
      ['p', 'Hitting a weak defender deals +1 damage. Attacking into a defender whose element beats yours is resisted for -1, which reduces a 1-damage hit to nothing. Elements with no matchup either way deal flat damage.'],
      ['chart', [
        ['FIRE', ['ICE', 'METAL']], ['ICE', ['WIND', 'POISON']], ['WIND', ['EARTH', 'WATER']],
        ['EARTH', ['FIRE', 'ELECTRIC']], ['WATER', ['FIRE', 'ICE']], ['METAL', ['EARTH', 'WIND']],
        ['ELECTRIC', ['WIND', 'FIRE']], ['POISON', ['ICE', 'EARTH']], ['SHADOW', ['PSYCHIC', 'LIGHT']],
        ['PSYCHIC', ['LIGHT', 'UNDEAD']], ['LIGHT', ['UNDEAD', 'SHADOW']], ['UNDEAD', ['SHADOW', 'PSYCHIC']]
      ]]
    ]],
    ['Siege mode', 'Expeditions, Endless and Battlegrounds', '/img/lands/badlands.webp', 'EARTH', [
      ['p', 'Siege is the solo roguelike. Pick a SiegeKnight and a starter warband, cross a branching map of battles, elites, rest camps, caches, the broker, the smith, the caravan and events, then fight AP-based card battles up to a boss.'],
      ['defs', [
        ['Build a run', 'Earn gold, recruit Siegelings, collect items and level your warband as you climb.'],
        ['Spend AP', 'Drag cards from the hand fan onto the battlefield, resolve them, and End Turn when your plan is set.'],
        ['Advantage', 'The unit holding the Advantage token adds a rider to its cards. Watch the ADV lane to see who holds it.'],
        ['Different rules', 'There is no elemental weakness chart in Siege. Its server-driven rules have their own shields and affliction counterparts.']
      ]],
      ['sub', 'Modes'],
      ['defs', [
        ['Expedition', 'The standard run: map, battles, boss. Win to bank your Siegelings as veterans.'],
        ['Endless', 'Climb with fresh picks or rested banked veterans. Finish a battle before ending the run to bank your score. Your team is extracted only after at least one boss kill; defeat records the score but extracts no team.'],
        ['Battlegrounds', 'Requires three banked veteran Siegelings. Select three veterans and an extracted knight, choose an unlocked tier and march. Pick boons when offered and spend earned Warmarks in the Battlegrounds shop.'],
        ['Tutorial', 'A simulated expedition covering map nodes, shops, equipment, recruitment, leveling and combat, including targeting, passives and Ultimates. Nothing is saved.']
      ]],
      ['sub', 'Skins'],
      ['p', 'Tap one of your Siegelings in battle to open its sheet, then pick a skin under Look. There is one skin per card finish, and each unlocks when you own that version of the card (or a higher one) in your Collection. Skins are cosmetic only.'],
      ['defs', [
        ['Holographic (Holo)', 'A soft pastel sheen.'],
        ['Special (SP)', 'An iridescent colour drift.'],
        ['Holographic Special (HSP)', 'The iridescent drift inside a rainbow aura.'],
        ['Gold', 'Its own colours inside a pulsing gold aura.'],
        ['CARAT', 'The whole creature cast in gold. Owning GSP or GSPx unlocks both gold skins.']
      ]],
      ['link', ['/siege', 'Start an expedition']]
    ]],
    ['Getting started', 'A first-day guide', '/img/lands/aurora.webp', 'LIGHT', [
      ['steps', [
        ['Choose a starter pack', 'It sets your first element, grants its SiegeKnight and fills a playable deck.'],
        ['Play the Arena', 'Fight the AI from Play. Wins pay Siegecoins and Remnants, and a win streak pays more.'],
        ['Build a deck', 'Collection › Deck Builder, from the cards you own, with at most 3 copies of any card. Preset decks run 40 cards: 20 Siegelings, 10 Strategies and 10 Deceptions.'],
        ['Open packs', 'Spend Siegecoins in the Shop. Every card can arrive with a finish, from Holo all the way up to GSPx.'],
        ['Upgrade finishes', 'Spend Remnants on a card in your Collection to climb its finish ladder.'],
        ['Go on a Siege', 'Take a warband on the roguelike, bank veterans, then try Endless and Battlegrounds.'],
        ['Enter Dominion', 'Found your knight, raise the keep, and send expeditions between matches.']
      ]],
      ['note', 'Missions on Home refresh daily, and the Daily Objectives strip shows what is left.']
    ]],
    ['Card finishes', 'Holo, SP, HSP, Gold, CARAT, GSP and GSPx', '/img/lands/light.webp', 'LIGHT', [
      ['p', 'Every card can be owned in a finish. The ladder runs Standard › Holo › SP › HSP › Gold › CARAT › GSP › GSPx, and a card only ever moves up. The four gold finishes pair a gold look with an art: Gold and GSP put the art on a gold card, CARAT and GSPx cast the whole card in gold; Gold and CARAT keep the standard art, GSP and GSPx show the special art.'],
      ['defs', [
        ['Standard', 'The printed card.'],
        ['Holographic (Holo)', 'A plain holographic sheen over the standard art.'],
        ['Special (SP)', 'The card’s special holo artwork. Only cards that have holo art can be Special.'],
        ['Holographic Special (HSP)', 'The special holo artwork with the full rainbow foil.'],
        ['Gold', 'The standard art on a polished gold card with a gold shine.'],
        ['CARAT', 'The standard art with the whole card cast in gold, notches left in colour.'],
        ['Gold Special (GSP)', 'The special holo artwork on a polished gold card with a gold shine.'],
        ['GSPx', 'The final finish: the special holo artwork with the whole card cast in gold, notches left in colour so they still read in play. A card with no special art yet shows its standard art in GSP and GSPx.']
      ]],
      ['sub', 'How to get them'],
      ['list', [
        'Upgrade with Remnants from a card’s sheet in your Collection. Each finish has a running price in craft costs (Holo 1, SP 2, HSP 4, Gold 6, CARAT 9, GSP 12, GSPx 28), and a step costs the difference.',
        'Drops: any card you get, from packs, daily shop cards, crafting, Siege prizes or missions, can arrive in a finish. A dropped finish above yours upgrades your card, even when the copy itself turns into Remnants.',
        'Each finish is rarer than the one below it and rarer on rarer cards. GSP is a once-in-thousands pull, and GSPx is an act of god: about 1 in 20,000 on a Common and 1 in 100,000 on a Legendary. Shop › Packs › Odds lists every number.'
      ]],
      ['sub', 'Where they show'],
      ['list', [
        'Your binder, deck builder, pack reveals and the full-screen card.',
        'Arena matches: each card shows its owner’s finish, so online opponents see yours and you see theirs.',
        'Siege: every finish you own for a Siegeling unlocks its matching skin for that Siegeling’s battle sprite.'
      ]],
      ['note', 'Open a card full screen to see every version: drag sideways to turn it over, swipe up or down to step through Standard to GSPx.']
    ]],
    ['Arena & multiplayer', 'Solo, rooms and tournaments', '/img/lands/fire.webp', 'FIRE', [
      ['p', 'The Arena is the core card game. Play it solo against the AI, or live against another player.'],
      ['defs', [
        ['Solo', 'Play › Arena. Pick a deck and a SiegeKnight and fight the AI. Wins pay Siegecoins and Remnants.'],
        ['Rooms', 'Host a table and share its code or invite link; your opponent joins it from the Room screen.'],
        ['Tournaments', 'A daily tournament sets an element rule for the day. Every day has a free-element entry.'],
        ['Arena art', 'Your board half shows your equipped battlefield skin from Shop › Arena Art. In solo play the AI keeps the Neutral arena; in live play each side shows that player’s equipped skin. Skins are cosmetic only.'],
        ['History', 'Finished matches appear under Profile › Recent, with replays where they were recorded.']
      ]]
    ]],
    ['Dominion', 'Kingdom & idle RPG', '/img/lands/relic.webp', 'NEUTRAL', [
      ['p', 'Dominion is the kingdom and idle RPG: rebuild your keep, train your own SiegeKnight, and explore from one save. Open it from Play › Dominion.'],
      ['defs', [
        ['Base', 'Raise the hall, workshops, Storehouse, Builder’s Yard crews and Akhar’s Wall. Visitors bring requests and trust; decorations and tools deepen production.'],
        ['Knight & companions', 'Create your knight (name, title, elemental portrait, crest and calling). After founding you land on the Knight page. Craft gear through Work, tame Siegelings on journeys, assign jobs, build bonds, and level, evolve or rename them.'],
        ['Keeper’s Favor', 'Honor one companion in the Great Hall to lift whole-keep output by rarity (and rapport). A damaged Hall suspends the bonus.'],
        ['Inventory & Daily Store', 'Open inventory from the resource strip or 🎒. Tabs cover raw, refined and made goods, refining, and the Daily Store (refreshes at local midnight, open from day one). Bulk market lots join the Store tab once the Storehouse stands.'],
        ['Expeditions & work', 'Send the company on routes with provisions and cooked meals, or park them on professions while you are away.'],
        ['Wall & sieges', 'Post defenders on Akhar’s Wall, drill them, and hold siege waves for Crowns and Silver.'],
        ['Mentors', 'Meet SiegeSquires, SiegeKnights, Raiders and Lords at the gate, on roads or after sieges. Talk, gift and share deeds to build rapport; meet their proof before asking them to train you. A sworn active mentor walks with you and improves their element’s affinity gain.'],
        ['Realm & saves', 'Guilds, Siege Operations and a Crowns market. The +4h control advances the shared clock; ⋯ reopens the guide or resets Dominion. Signed-in play syncs to your account.']
      ]],
      ['link', ['/dominion', 'Enter Dominion']]
    ]],
    ["Gauntlet", "Draft, forge and climb", "/img/lands/earth.webp", "EARTH", [
      ["defs", [
        ["Draft", "Choose a source deck and SiegeKnight. Draft 10 cards, with one redraw before beginning the climb."],
        ["Fight", "Each fight opens on the Battle Table with 25 player HP. Preview the next floor using Details and Cards; tap cards or the boss knight to inspect them. Floor 10 brings a SiegeKnight boss."],
        ["Improve", "After a win, choose a reward card or skip it. At camp, spend gold in the Shop or use Deck & Forge to improve cards. Choose SiegeKnight perks when offered."],
        ["Lives & returning", "Three losses end the run. Return to Gauntlet to resume; if a floor fight is still open, use Return to the fight. End this run is in Log."]
      ]],
      ["link", ["/gauntlet", "Enter the Gauntlet"]]
    ]],
    ["Collection, decks & shop", "Find cards and build a loadout", "/img/lands/fire.webp", "FIRE", [
      ["defs", [
        ["Collection", "Search and filter your binder, then tap a card for its abilities, evolution line and finishes. Its Arena, Siege and Keep tabs explain battle roles and station bonuses in Dominion."],
        ["Decks", "Use a preset or save your own deck from owned cards in Deck Builder. Standard presets are 40 cards: 20 Siegelings, 10 Strategies and 10 Deceptions; at most three copies of a card and complete evolution lines. Follow the builder’s validation before saving."],
        ["Summons & packs", "Spend Siegecoins in the Shop on the available summons, packs, decks or daily card offers. Check Odds for current drop rates and the displayed price before buying. Daily Offerings refresh at midnight UTC."],
        ["Crafting", "Use Remnants from a card’s Collection sheet to craft copies or upgrade finishes. Extra copies past the three-copy cap become Remnants."],
        ["Arena Art", "Shop › Arena Art is the battlefield collection showroom. Browse premium, seasonal holiday and prestige (achievement) arenas. Buy with Siegecoins when available, then Equip. Your Battle Table half shows the equipped arena; the AI’s solo side stays Neutral. With default Elemental Confluence, each half follows that side’s SiegeKnight element art. Cosmetic only."]
      ]],
      ["link", ["/shop", "Open the Shop"]]
    ]],
    ["Social, rooms & tournaments", "Find another player", "/img/lands/water.webp", "WATER", [
      ["defs", [
        ["Friends & messages", "Use Social for friend requests, direct messages and online presence. Open a public profile to view another player’s showcase."],
        ["Host or join", "Host a multiplayer table and share its room code or invite link. Join using the supplied code or link; wait for both players to be ready before the match."],
        ["Lobbies & tournaments", "Browse Lobbies for open tables and the current tournament. Read the event’s element and preset-deck restrictions before choosing a deck; an expired event requires a current table."],
        ["Match records", "Profile › Recent lists finished matches, with replays where a recording is available."]
      ]],
      ["link", ["/lobbies", "Browse Lobbies"]]
    ]],
    ["Progression & rewards", "Missions, titles and cosmetics", "/img/lands/light.webp", "LIGHT", [
      ["defs", [
        ["Daily objectives", "Check Home’s Daily Objectives for current missions and reward progress. Missions refresh daily; use the displayed requirements and claim controls."],
        ["Achievements & titles", "Open Achievements to see goals and unlocks. Profile holds your level, titles, match history and showcase settings."],
        ["Leaderboards", "Compare the current leaderboard categories, including run-specific scores where available. Endless records include best score and floor."],
        ["Gallery & profile", "Visit the Gallery for unlocked art. Customize your public profile with your favourite cards, element, avatar, title and available profile art."],
        ["Separate progression", "Siege levels, veteran teams, Gauntlet upgrades and Dominion progress follow their own mode rules. A cosmetic finish or Arena Art skin does not increase Standard Battle stats."]
      ]],
      ["link", ["/achievements", "View achievements"]]
    ]],
    ["Saving, tutorials & settings", "Resume safely and adjust your experience", "/img/lands/ice.webp", "ICE", [
      ["defs", [
        ["Account progress", "Sign in for account-backed collections, decks, progression and persistent modes. Some guest or test experiences keep state in this browser; read that mode’s save notice."],
        ["Siege saves", "Return to /siege to resume an available expedition or Battlegrounds checkpoint. Use the run menu’s save option when needed; finish claiming a battle result before saving. Starting over discards that run."],
        ["Tutorials", "Battle has a guided tutorial. Siege’s Tutorial simulates the expedition nodes and combat without saving progress. Dominion’s ⋯ menu reopens its guide."],
        ["Settings", "Adjust music, sound effects, battle voice, card animations, reduced motion, background parallax and notifications in Settings. Reduced motion follows your device preference until overridden."],
        ["Connection & offline", "The installable web app can show an offline shell and cached assets, but online battles, purchases and account actions need a connection. Reconnect before retrying an action and check the resulting state."]
      ]],
      ["link", ["/settings", "Open Settings"]]
    ]],
    ['Glossary', 'Terms used across the game', '/img/lands/psychic.webp', 'PSYCHIC', [
      ['defs', [
        ['Siegeling', 'A creature card. It has Health, Speed, notches and abilities, but no printed attack: its damage comes from its abilities.'],
        ['Strategy / Deception', 'The spell and trap card types.'],
        ['SiegeKnight', 'Your trainer. It gives a passive and an active or ultimate, and never enters the board.'],
        ['Notch', 'A coloured dot on a card’s edge. Two adjacent cards whose notches point at each other form a link.'],
        ['Link', 'A pair of reciprocal notches. Links generate elemental energy.'],
        ['Socket', 'A board-edge anchor that a card on the outside of your 3x3 can link into instead of a neighbour.'],
        ['Energy', 'Elemental pools filled by links and sockets that pay for Strategies, Deceptions and abilities.'],
        ['Claim', 'Retire a surviving Siegeling during Setup for temporary energy.'],
        ['Speed order', 'Siegelings act in Battle from fastest to slowest.'],
        ['Bounty', 'Damage dealt to a player when one of their Siegelings is defeated, set by its rarity.'],
        ['Evolution', 'A card placed onto its living precursor. It ignores the board cap and the one-placement limit.'],
        ['Siegecoins', 'The main currency: packs, decks, daily shop cards and some Dominion store lots.'],
        ['Remnants', 'Earned from duplicates past the 3-copy cap, wins and pack openings. Spent on crafting cards and upgrading finishes.'],
        ['Crowns', 'Dominion’s currency for the keep economy, gifts and realm market.'],
        ['Finish', 'A card’s look: Standard, Holographic (Holo), Special (SP), Holographic Special (HSP), Gold, CARAT, Gold Special (GSP) or GSPx. See Card finishes.'],
        ['Arena Art', 'A cosmetic battlefield skin for your board half, bought or earned in Shop › Arena Art and equipped from there.'],
        ['Veteran', 'A Siegeling banked from a won Siege run, used again in Endless and Battlegrounds.']
      ]]
    ]]
  ];

  // Chapter bodies are small, declarative block lists rather than raw HTML so
  // the popup escapes everything it prints and a new chapter cannot smuggle
  // markup into the page.
  function guideBlocks(blocks) {
    return (blocks || []).map(function (b) {
      var kind = b[0];
      var v = b[1];
      if (kind === 'p') return '<p>' + esc(v) + '</p>';
      if (kind === 'sub') return '<h4 class="sg-guide-sub">' + esc(v) + '</h4>';
      if (kind === 'note') return '<p class="sg-guide-note">' + esc(v) + '</p>';
      if (kind === 'list') {
        return '<ul class="sg-guide-list">' + v.map(function (li) {
          return '<li>' + esc(li) + '</li>';
        }).join('') + '</ul>';
      }
      if (kind === 'facts') {
        return '<div class="sg-guide-facts">' + v.map(function (f) {
          return '<span><strong>' + esc(f[0]) + '</strong>' + esc(f[1]) + '</span>';
        }).join('') + '</div>';
      }
      if (kind === 'steps') {
        return '<ol class="sg-guide-steps">' + v.map(function (s) {
          return '<li><strong>' + esc(s[0]) + '</strong><span>' + esc(s[1]) + '</span></li>';
        }).join('') + '</ol>';
      }
      if (kind === 'defs') {
        return '<div class="sg-guide-defs">' + v.map(function (d) {
          return '<div class="sg-guide-def"><strong>' + esc(d[0]) + '</strong><span>' + esc(d[1]) + '</span></div>';
        }).join('') + '</div>';
      }
      if (kind === 'aff') {
        return '<div class="sg-guide-affs">' + v.map(function (a) {
          return '<div class="sg-guide-aff" style="--el:' + color(a[1]) + '">' +
            '<span class="sg-guide-chip">' + esc(a[0]) + '</span>' +
            '<strong>' + esc(a[2]) + '</strong>' +
            '<em>cap ' + esc(a[3]) + '</em>' +
            '<p>' + esc(a[4]) + '</p></div>';
        }).join('') + '</div>';
      }
      if (kind === 'chart') {
        return '<div class="sg-guide-chart">' + v.map(function (row) {
          return '<div class="sg-guide-chart-row">' +
            '<span class="sg-guide-chip" style="--el:' + color(row[0]) + '">' + esc(title(row[0])) + '</span>' +
            '<i>›</i>' + row[1].map(function (t) {
              return '<span class="sg-guide-chip" style="--el:' + color(t) + '">' + esc(title(t)) + '</span>';
            }).join('') + '</div>';
        }).join('') + '</div>';
      }
      if (kind === 'link') {
        return '<a class="sg-guide-cta" href="' + esc(v[0]) + '">' + esc(v[1]) + ' ›</a>';
      }
      return '';
    }).join('');
  }

  function guideMarkup(chapter) {
    return '<button class="sg-guide-dismiss" type="button" aria-label="Close chapter">×</button>' +
      '<header class="sg-guide-head">' +
        '<img src="' + esc(chapter[2]) + '" alt="">' +
        '<div class="sg-guide-veil"></div>' +
        '<div class="sg-guide-title"><strong>' + esc(chapter[0]) + '</strong><span>' + esc(chapter[1]) + '</span></div>' +
      '</header>' +
      '<div class="sg-guide-body">' + guideBlocks(chapter[4]) + '</div>';
  }

  // The popup is the whole point of the chapter grid, so it is mounted with the
  // help screen and never navigates: the old tiles pointed at /help, which is
  // this screen, and a full reload only re-showed the loading state.
  function mountHelp(app) {
    var guide = app.querySelector('[data-guide]');
    if (!guide) return;
    var panel = guide.querySelector('[data-guide-panel]');
    var scroll = app.querySelector('.sg-scroll');
    var opener = null;

    function close() {
      if (!guide.classList.contains('open')) return;
      guide.classList.remove('open');
      guide.hidden = true;
      panel.innerHTML = '';
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    }
    function open(index, from) {
      var chapter = HELP[index];
      if (!chapter) return;
      opener = from || document.activeElement;
      panel.innerHTML = guideMarkup(chapter);
      panel.style.setProperty('--el', color(chapter[3]));
      panel.scrollTop = 0;
      guide.hidden = false;
      guide.classList.add('open');
      panel.querySelector('.sg-guide-dismiss').focus({ preventScroll: true });
    }

    app.addEventListener('click', function (e) {
      var jump = e.target.closest ? e.target.closest('.sg-help-jump-chip') : null;
      if (jump) {
        var id = (jump.getAttribute('href') || '').replace(/^#/, '');
        var target = id && app.querySelector('#' + id);
        if (target && scroll) {
          e.preventDefault();
          // Scroll inside the help column — window.scrollTo would miss the
          // fixed hub shell and leave the section under the top bar.
          var top = target.offsetTop - 8;
          if (typeof scroll.scrollTo === 'function') scroll.scrollTo({ top: top, behavior: 'smooth' });
          else scroll.scrollTop = top;
        }
        return;
      }
      var card = e.target.closest ? e.target.closest('[data-help-chapter]') : null;
      if (!card) return;
      e.preventDefault();
      open(Number(card.getAttribute('data-help-chapter')), card);
    });
    guide.addEventListener('click', function (e) {
      if (e.target === guide || (e.target.closest && e.target.closest('.sg-guide-dismiss'))) close();
    });
    app.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  // Section the flat HELP list so the How to Play screen reads as Modes,
  // Battle, Advanced, Menus and Reference instead of one undivided grid.
  // Titles are looked up so reordering a chapter inside HELP does not require
  // rewriting index numbers here.
  var HELP_SECTIONS = [
    { id: 'modes', title: 'Modes', note: 'Every way to play',
      chapters: ['Game modes', 'Arena & multiplayer', 'Siege mode', 'Gauntlet', 'Dominion'] },
    { id: 'battle', title: 'Battle basics', note: 'How a match works',
      chapters: ['Getting started', 'Basics', 'Turn loop', 'Card types', 'Board, notches & energy'] },
    { id: 'advanced', title: 'Advanced', note: 'Finishes, statuses and matchups',
      chapters: ['Evolution', 'SiegeKnight', 'Buffs & afflictions', 'Element chart', 'Card finishes'] },
    { id: 'menus', title: 'Menus', note: 'Collection, shop, social and settings',
      chapters: ['Collection, decks & shop', 'Social, rooms & tournaments', 'Progression & rewards', 'Saving, tutorials & settings'] },
    { id: 'reference', title: 'Reference', note: 'Quick look-ups',
      chapters: ['Glossary'] }
  ];

  function helpChapterIndex(title) {
    for (var i = 0; i < HELP.length; i++) {
      if (HELP[i][0] === title) return i;
    }
    return -1;
  }

  function helpCardMarkup(index) {
    var h = HELP[index];
    if (!h) return '';
    return '<button class="sg-help-card" type="button" data-help-chapter="' + index + '" ' +
      'style="--el:' + color(h[3]) + '">' +
      '<img src="' + esc(h[2]) + '" alt="" loading="lazy">' +
      '<div class="sg-help-veil"></div>' +
      '<div class="sg-help-body"><strong>' + esc(h[0]) + '</strong><span>' + esc(h[1]) + '</span></div>' +
    '</button>';
  }

  function helpScreen(opts) {
    opts = opts || {};
    var covered = {};
    var sectionsHtml = HELP_SECTIONS.map(function (sec) {
      var cards = sec.chapters.map(function (title) {
        var idx = helpChapterIndex(title);
        if (idx < 0) return '';
        covered[idx] = true;
        return helpCardMarkup(idx);
      }).join('');
      if (!cards) return '';
      return '<section class="sg-section sg-help-section" id="help-' + esc(sec.id) + '">' +
        '<div class="sg-section-head">' +
          '<h3>' + esc(sec.title) + '</h3>' +
          '<span class="sg-section-note">' + esc(sec.note) + '</span>' +
        '</div>' +
        '<div class="sg-help-grid">' + cards + '</div>' +
      '</section>';
    }).join('');
    // Any chapter left out of HELP_SECTIONS still appears, so a new chapter
    // cannot vanish just because the section map was not updated.
    var orphans = [];
    for (var i = 0; i < HELP.length; i++) {
      if (!covered[i]) orphans.push(helpCardMarkup(i));
    }
    if (orphans.length) {
      sectionsHtml += '<section class="sg-section sg-help-section" id="help-more">' +
        '<div class="sg-section-head"><h3>More</h3><span class="sg-section-note">Additional chapters</span></div>' +
        '<div class="sg-help-grid">' + orphans.join('') + '</div></section>';
    }
    var jump = '<nav class="sg-help-jump" aria-label="Help sections">' +
      HELP_SECTIONS.map(function (sec) {
        return '<a class="sg-help-jump-chip" href="#help-' + esc(sec.id) + '">' + esc(sec.title) + '</a>';
      }).join('') +
    '</nav>';
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-page-head"><h2>How to Play</h2><p>' + HELP.length + ' chapters · ' + HELP_SECTIONS.length + ' sections</p></div>' +
        jump +
        sectionsHtml +
        '<div style="height:96px"></div>' +
      '</div>' +
      '<div class="sg-guide" data-guide hidden>' +
        '<div class="sg-guide-panel" data-guide-panel role="dialog" aria-modal="true" aria-label="Rules chapter"></div>' +
      '</div>' +
      bottomMarkup('more', opts);
  }

  /* ---------- feature coverage ----------
     The brief simplifies the navigation, which is only safe if nothing becomes
     unreachable. This is the audit: every route, dashboard action and feature
     the shipping hub exposes today, and the destination it has in the new IA.
     Rendered on the preview board so a reviewer can check it rather than take
     it on trust. `path` is how a player gets there in at most two taps. */
  var COVERAGE = [
    { area: 'Routes', rows: [
      ['/home dashboard',      'Home tab',                                'home'],
      ['/cards binder',        'Collection tab › Cards',                  'collection'],
      ['/decks',               'Collection tray › Decks',                 'collection'],
      ['/deck-builder',        'Collection tray › Deck Builder',          'collection'],
      ['/social',              'More tray › Social',                      'more'],
      ['/social lobby',        'Play tray › Ranked 1v1',                  'play'],
      ['/profile',             'More tray › Profile',                     'more'],
      ['/achievements',        'Profile › Badges › All 42',               'more'],
      ['/shop',                'Shop tab',                                'shop'],
      ['/play arena',          'Play tray › Arena · PLAY on hero',        'play'],
      ['/siege expedition',    'Play tray › Siege Expedition',            'play'],
      ['/gauntlet',            'Battle modes › Gauntlet',                 'play'],
      ['/dominion',            'Play tray › Dominion',                   'play'],
      ['/help',                'More tray › Help',                        'more']
    ]},
    { area: 'Dashboard actions', rows: [
      ['PVE battle',           'Play › Arena (primary panel)',            'play'],
      ['Create 1v1 lobby',     'Play › Ranked 1v1',                       'play'],
      ['Owned cards',          'Collection tab',                          'collection'],
      ['Deck builder',         'Collection tray › Deck Builder',          'collection'],
      ['Open shop',            'Shop tab',                                'shop'],
      ['Saved decks',          'Collection tray › Decks',                 'collection']
    ]},
    { area: 'Dashboard panels', rows: [
      ['Active tables',        'Play › Ranked (live count)',              'play'],
      ['Search, filter, build','Collection › search icon + filter ctrl',   'collection'],
      ['Recent progress',      'Home › Daily Objectives strip',           'home'],
      ['Loadout shelf',        'Home › Continue Playing · Play › Loadout','play'],
      ['Element starters',     'Shop › Packs',                            'shop'],
      ['Siegelcoin balance',   'Top bar chip (every screen)',             'home'],
      ['Remnants / craft',     'Play tray › Dominion',                    'play'],
      ['Daily missions',       'Home › Daily Objectives strip',           'home'],
      ['Match history',        'Profile › Recent',                        'more'],
      ['Pack odds',            'Shop › Packs › Odds',                     'shop'],
      ['Card detail / zoom',   'Collection › tap a card',                 'collection'],
      ['Notifications',        'Top bar bell (every screen)',             'home']
    ]}
  ];

  function coverageMarkup() {
    return '<div class="cov">' + COVERAGE.map(function (group) {
      return '<div class="cov-group"><h3>' + esc(group.area) + '</h3><table><tbody>' +
        group.rows.map(function (r) {
          return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) +
            '</td><td class="cov-dest"><span class="cov-pill s-' + esc(r[2]) + '">' + esc(r[2]) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>';
    }).join('') + '</div>';
  }

  /* ---------- public mount ---------- */

  // Live data replaces the frozen snapshot in place, so the renderer below is
  // identical whether it is fronting the real game or the offline preview.
  function applyLive(model) {
    if (!model) return;
    if (model.profileSettings) PREFS = normalizePrefs(model.profileSettings);
    if (model.galleryRewards) GALLERY_REWARDS = model.galleryRewards;
    if (Array.isArray(model.galleryUnlockedIds)) {
      GALLERY_UNLOCKED = model.galleryUnlockedIds.map(function (id) { return String(id).toLowerCase(); });
    }
    noteNewGalleryUnlocks(model);
    if (Array.isArray(model.holographicCards)) setPlayerHolo(model.holographicCards);
    if (Array.isArray(model.holoArtCards)) setPlayerHoloArt(model.holoArtCards);
    if (Array.isArray(model.plainGoldCards)) setPlayerPlainGold(model.plainGoldCards);
    if (Array.isArray(model.caratCards)) setPlayerCarat(model.caratCards);
    if (Array.isArray(model.goldCards)) setPlayerGold(model.goldCards);
    if (Array.isArray(model.holoGoldCards)) setPlayerHoloGold(model.holoGoldCards);
    if (Array.isArray(model.holoCards)) setPlayerHoloPlain(model.holoCards);
    if (model.cards && model.cards.length) {
      ALL_CARDS = model.cards.slice();
    }
    if (model.sieglings && model.sieglings.length) {
      CARDS.length = 0;
      model.sieglings.forEach(function (c) { CARDS.push(c); });
      HERO = pickPresent(['pylord', 'glaciemperor', 'aerovane', 'conchious', 'gymstone']);
      // Re-picked against the live catalog, which is far larger than the
      // offline snapshot; the day seed means this lands on the same rail the
      // snapshot would have chosen for today from the same pool.
      FEATURED = featuredForToday();
    }
  }

  // The live catalog is not guaranteed to hold the ids the concept hand-picked,
  // so fall back to whatever it does have rather than rendering empty tiles.
  function pickPresent(ids) {
    var found = ids.map(byId).filter(function (c, i) { return c && c.id === ids[i]; });
    return found.length ? found : CARDS.slice(0, ids.length);
  }

  function render(host, screen, opts) {
    opts = opts || {};
    if (opts.live) {
      applyLive(opts.live);
      if (opts.ownedTotal == null) opts.ownedTotal = opts.live.ownedTotal;
    }
    var app = document.createElement('div');
    app.className = 'sg-app';
    var builders = { collection: galleryScreen, decks: decksScreen, shop: shopScreen,
                     profile: profileScreen, play: playScreen, builder: builderScreen,
                     social: socialScreen, settings: settingsScreen, help: helpScreen,
                     auth: authScreen, art: artScreen, lobbies: lobbiesScreen, room: roomScreen };
    // Screen-scoped layout hooks: the landscape-phone layout in
    // home-redesign.css lays each screen out differently, and the Social
    // screen's three tabs share one shell. Not data-social-tab: that attribute
    // marks the tab buttons, and mountSocial treats anything carrying it as one.
    app.setAttribute('data-screen', builders[screen] ? screen : 'home');
    if (screen === 'social') app.setAttribute('data-social-view', socialTab);
    app.innerHTML = builders[screen] ? builders[screen](opts) : homeScreen(opts);
    host.appendChild(app);
    // Every screen carries the same chrome, so the rail and the tab bar are
    // wired unconditionally. Branching this is how the Cards screen ended up
    // rendering a rail that did not respond to taps.
    if (screen === 'shop') mountShop(app, opts);
    if (screen === 'decks') mountDecks(app, opts);
    if (screen === 'builder') mountBuilder(app, opts);
    if (screen === 'art') mountArt(app, opts);
    if (screen === 'lobbies') mountLobbies(app, opts); else stopLobbyTimers();
    if (screen === 'room') mountRoom(app, opts); else stopRoomTimers();
    if (screen === 'profile' || screen === 'social') mountProfileNavigation(app, opts);
    if (screen === 'profile') { mountSheet(app, opts); mountProfile(app, opts); mountProfileHead(app); }
    if (screen === 'social') { mountSheet(app, opts); mountProfile(app, opts); mountSocial(app, opts); }
    if (screen !== 'social') { openThread = null; stopThreadPoll(); }
    if (screen === 'collection') {
      mountGallery(app, opts);
    } else if (!builders[screen]) {
      mountHero(app, opts);
      mountLeaderboard(app, opts);
      mountStage(app, opts);
      mountStrip(app);
      mountSheet(app, opts);
      var strip = opts.questsOpen && app.querySelector('[data-strip]');
      if (strip) strip.classList.add('open');
    }
    if (screen === 'settings') mountSettings(app);
    if (screen === 'help') mountHelp(app);
    if (screen === 'auth') mountAuth(app);
    mountBottom(app);
    mountNotifs(app, opts);
    if (window.SiegelingsHubMusic) window.SiegelingsHubMusic.sync();
    mountArtFit(app);
    scheduleFit(app);
    return app;
  }

  /* ---------- description fitting ----------
     The showcase card's description sits in a `.card-summary-list` that is
     `overflow:hidden`, so long flavour text is simply cut off - measured at 8 of
     24 tiles, every one of them also running into the bottom notch row, worst
     case 45px past the centre notch. `card-binder-visual`'s own fitter only
     targets `.binder-card-description`, a different element, so it never saw
     these.

     This shrinks the text until it fits BOTH the panel and the space above the
     centre bottom notch, which is the tighter of the two constraints and the one
     that actually looks broken. Scoped to `.sg-card-tile` so the shipping
     binder's rendering is untouched. */
  /* The floor was 6px, which on a binder thumbnail clamped most flavour text to
     two lines and dropped the rest. On a thumbnail the description is read as a
     SHAPE, not as words: all of it tiny beats a third of it legibly, because the
     full text is now one tap away - the full-screen card magnifies this same
     layout, so 4px here lands around 15px there. 4px is still the floor rather
     than nothing, because below it the fitter is only pretending. */
  var FIT_MIN_PX = 4;
  var NOTCH_CLEARANCE = 3;
  var fitFrame = null;

  function fitOneDescription(desc) {
    var list = desc.closest && desc.closest('.card-summary-list');
    if (!list) return;
    var tile = desc.closest('.sg-card-tile');
    var floor = FIT_MIN_PX;
    desc.style.fontSize = '';
    desc.style.lineHeight = '';
    desc.style.webkitLineClamp = '';
    desc.style.display = '';
    desc.style.overflow = '';
    desc.style.maxHeight = '';

    // The centre bottom notch is what the text visibly runs into; the corner
    // notches sit outside the panel's width. Measured at 360px, the panel can
    // overlap it by ~3px on its own, so shrinking text alone cannot fix this -
    // the box has to be capped too.
    var centre = tile && tile.querySelector('.notch-dot.notch-BOTTOM');
    function measureLimit() {
      var room = list.clientHeight;
      if (centre) {
        var available = centre.getBoundingClientRect().top - desc.getBoundingClientRect().top - NOTCH_CLEARANCE;
        // One line is the least that can be shown; below that the description is
        // not worth drawing over the frame.
        room = Math.min(room, Math.max(available, floor * 1.15));
      }
      return room;
    }

    var limit = measureLimit();
    if (limit <= 0) return;

    var size = parseFloat(window.getComputedStyle(desc).fontSize) || 9;
    if (desc.scrollHeight > limit + 1) {
      desc.style.lineHeight = '1.15';
      var guard = 30;
      while (desc.scrollHeight > limit + 1 && size > floor && guard-- > 0) {
        size = Math.max(floor, size * 0.94);
        desc.style.fontSize = size.toFixed(2) + 'px';
      }
      // The panel is sized by its own content, so shrinking the text shrinks the
      // box it had to fit into. Measuring once left the last line clipped on a
      // full-screen card. Re-measure against the settled panel and keep going.
      var settle = 3;
      var next = measureLimit();
      while (settle-- > 0 && next < limit - 0.5 && desc.scrollHeight > next + 1 && size > floor) {
        limit = next;
        guard = 30;
        while (desc.scrollHeight > limit + 1 && size > floor && guard-- > 0) {
          size = Math.max(floor, size * 0.94);
          desc.style.fontSize = size.toFixed(2) + 'px';
        }
        next = measureLimit();
      }
      limit = Math.min(limit, Math.max(next, floor * 1.15));
    }
    // Cap unconditionally: this is what keeps the BOX off the notch, whether or
    // not the text needed shrinking.
    desc.style.maxHeight = limit.toFixed(1) + 'px';
    if (desc.scrollHeight > limit + 1) {
      var lineH = size * 1.15;
      desc.style.display = '-webkit-box';
      desc.style.webkitLineClamp = String(Math.max(1, Math.floor(limit / lineH)));
      desc.style.overflow = 'hidden';
    }
  }

  /* Tile names shrink to fit rather than truncating.

     `.sg-feat-name` was a fixed 12px with `text-overflow:ellipsis`, so a long
     name lost its tail - "Glaciemperor" read as "Glaciempero…" on the Showcase
     rail. A name is an identifier: clipping it is worse than setting it a
     point smaller, and unlike a description it is one line, so the fit is a
     width comparison rather than a height one. The floor keeps it legible; a
     name still too long at the floor keeps the ellipsis as a last resort. */
  var NAME_FIT_MIN_PX = 9;

  function fitOneName(el) {
    el.style.fontSize = '';
    var available = el.clientWidth;
    if (!available) return;
    var size = parseFloat(window.getComputedStyle(el).fontSize) || 12;
    // scrollWidth exceeds clientWidth exactly when the text does not fit.
    while (el.scrollWidth > available && size > NAME_FIT_MIN_PX) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  }

  function fitTileNames(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('.sg-feat-name');
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].getClientRects().length) continue;
      fitOneName(nodes[i]);
    }
  }

  // Shop tab labels wrap between words, but a single long word ("Siegeknight")
  // cannot, and on a phone it ran into the tab's gem; shrink it to its box.
  function fitTabLabels(root) {
    var nodes = (root || document).querySelectorAll('.sg-gtab-label');
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].getClientRects().length) continue;
      fitOneName(nodes[i]);
    }
  }

  function fitCardDescriptions(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('.sg-card-tile .card-summary-description');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // Skip anything not laid out yet; it will be caught by the next pass.
      if (!el.getClientRects().length) continue;
      fitOneDescription(el);
    }
  }

  // Art loads after first paint and changes nothing about the text box, but a
  // web font or a viewport change does, so re-fit on both.
  function scheduleFit(root) {
    if (fitFrame != null) window.cancelAnimationFrame(fitFrame);
    fitFrame = window.requestAnimationFrame(function () {
      fitFrame = null;
      fitCardDescriptions(root);
      fitTileNames(root);
      fitTabLabels(root);
    });
  }

  /* ---------- in-app router ----------
     Everything this design owns is swapped in place: no reload, no flash, and
     the browser Back button still works. Anything it does not own (the Battle
     table, Siege, Keep, Social) is a real navigation, deliberately. */
  /* The binder holds each card back until its creature art is ready
     (art-reveal.js). Fetching the first page's art in idle time from whichever
     screen the player lands on means opening Cards usually finds it cached, so
     the grid paints whole at once. Same URLs the tiles request (the binder's
     480px mirror cut), so this is a cache warm, never a second download. */
  var BINDER_WARM_COUNT = 12;
  var warmedBinderArt = [];
  function warmBinderArt(screen) {
    var visual = window.SieglingsCardBinderVisual;
    if (screen === 'collection' || !visual || !visual.artThumbSrc) return;
    if (navigator.connection && navigator.connection.saveData) return;
    var urls = [];
    for (var i = 0; i < ALL_CARDS.length && urls.length < BINDER_WARM_COUNT; i++) {
      var c = ALL_CARDS[i];
      var mode = String(c && c.cardArtMode || '').toUpperCase();
      if (!c || !c.cardArtUrl) continue;
      // Knights lead the binder and their tiles ask for bigger cuts (knightCard:
      // 960 overlay window, 640 full card); warming the 480 cut would download twice.
      if (String(c.type || '').toUpperCase() === 'SIEGEKNIGHT') {
        if (mode === 'OVERLAY') urls.push(visual.artThumbSrc(c.cardArtUrl, 960));
        else if (mode === 'FULL_CARD') urls.push(visual.artThumbSrc(c.cardArtUrl, 640));
      } else if (mode === 'OVERLAY' || mode === 'REPLACE') {
        urls.push(visual.artThumbSrc(c.cardArtUrl, 480));
      }
    }
    var run = function () {
      // Held for the page's lifetime: a live Image keeps its bitmap in the
      // in-memory image cache, so the tile's <img> is complete on insertion and
      // art-reveal shows the card before the first paint instead of a frame later.
      warmedBinderArt = urls.map(function (url) {
        var img = new Image(); img.decoding = 'async'; img.src = url; return img;
      });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
    else window.setTimeout(run, 1500);
  }

  function mountApp(host, opts) {
    opts = opts || {};
    var current = null;
    var shieldNavigation = null;
    var priorTextState = window.render_game_to_text;
    window.render_game_to_text = function () {
      var sheet = host.querySelector('[data-sheet].open');
      var name = sheet && sheet.querySelector('.sg-sheet-id h3');
      if (name) {
        var description = sheet.querySelector('.sg-sheet-description');
        return JSON.stringify({ screen: current, cardDetail: {
          name: name.textContent,
          tab: sheet.querySelector('[data-sheet-tab].on').getAttribute('data-sheet-tab'),
          description: description ? description.textContent : '',
          notches: sheet.querySelectorAll('.sg-sheet-notch').length
        } });
      }
      if (current !== 'decks') return priorTextState ? priorTextState() : JSON.stringify({ screen: current });
      var groups = deckGroups(opts);
      return JSON.stringify({ screen: current, gold: opts.live && opts.live.gold,
        savedDecks: groups.saved.map(function (d) { return { id: d.id, name: d.name, cards: d.cards }; }),
        ownedPresets: groups.owned.map(function (d) { return { id: d.id, name: d.name, cards: d.cards }; }),
        availablePresets: groups.shop.map(function (d) { return { id: d.id, name: d.name }; }),
        presetPrice: opts.live && opts.live.premadeDeckPrice,
        purchasing: opts.deckPurchasePendingId || null, notice: opts.deckPurchaseNotice || null });
    };

    // `animate` routes the swap through page-transitions.js, so the new screen
    // swells in from the tap like a page change does. The swap then runs a
    // frame later (after the old screen is captured), so show() returns a
    // promise for anything that needs the new DOM.
    function show(screen, push, animate) {
      screen = screen || 'home';
      current = screen;
      if (push) {
        try {
          history.pushState({ screen: screen }, '', pathForScreen(screen));
        } catch (e) { /* file:// and sandboxed frames reject pushState */ }
      }
      function swap() {
        if (shieldNavigation) {
          shieldNavigation.reset();
          shieldNavigation.element.remove();
        }
        host.innerHTML = '';
        render(host, screen, opts);
        if (shieldNavigation) host.appendChild(shieldNavigation.element);
        host.scrollTop = 0;
        scheduleFit(host);
      }
      if (animate && window.SgTransition) return window.SgTransition.run(swap);
      swap();
      return Promise.resolve();
    }

    onNavigate = function (screen) { show(screen, true, true); };

    // One delegated listener survives every re-render, which a per-element
    // binding would not.
    host.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a[data-screen]');
      if (!link) return;
      e.preventDefault();
      // Social tray rows name the tab they want before the screen renders.
      var socialTabAttr = link.getAttribute('data-social-goto');
      if (socialTabAttr) setSocialTab(socialTabAttr);
      var homeSection = link.getAttribute('data-home-goto');
      // show() re-renders Home and resets the scroller, so the section can only
      // be found - and only stays put - after that has happened.
      show(link.getAttribute('data-screen'), true, true).then(function () {
        if (homeSection) scrollToHomeSection(host, homeSection);
      });
    });

    // Rotation and width changes re-flow the tiles, so the fit has to be redone.
    window.addEventListener('resize', function () { scheduleFit(host); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { scheduleFit(host); });
    }

    // An edge-swipe back on iOS already animates the page itself, and a second
    // transition on top of it reads as a stutter.
    window.addEventListener('popstate', function (e) {
      show((e.state && e.state.screen) || screenForPath(location.pathname) ||
           new URLSearchParams(location.search).get('screen') || 'home', false, !e.hasUAVisualTransition);
    });

    // ?screen= still works so existing links and the preview board keep going.
    show(opts.screen || new URLSearchParams(location.search).get('screen') ||
         screenForPath(location.pathname) || 'home', false);
    if (window.SiegelingsShieldNavigation) {
      shieldNavigation = window.SiegelingsShieldNavigation.mount(host, function (screen) {
        // Messages is a tab of Social, so it names the tab before the render.
        if (screen === 'messages') { setSocialTab('messages'); screen = 'social'; }
        show(screen, true, true);
      }, function () { return current; });
    }
    warmBinderArt(current);
    return { show: show, currentScreen: function () { return current; } };
  }

  window.SiegelingsHomeConcept = { render: render, mountApp: mountApp, applyLive: applyLive,
    screenForPath: screenForPath, pathForScreen: pathForScreen,
    fitCardDescriptions: fitCardDescriptions, cards: CARDS, coverageMarkup: coverageMarkup, coverage: COVERAGE,
    // Exposed so the daily rail can be driven at an arbitrary day without
    // waiting for midnight - the only way to check the rotation honestly.
    dailyFeatured: dailyFeatured, dayIndex: dayIndex,
    featured: function () { return FEATURED.slice(); } };
})();
