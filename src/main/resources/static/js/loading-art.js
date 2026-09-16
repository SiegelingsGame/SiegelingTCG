/* Loading-screen art for the art-first surfaces.
   The redesigned hub booted onto a bare spinner on a flat colour, and the Siege
   expedition onto a spinner and a status line, while the game already owns two
   bodies of artwork that exist for exactly this:

   - `/img/gallery/*` - the cinematic scenes the hub shows on its home screen.
   - `/api/art/loading` - the original site's loading library, which scans
     `static/img/art/loading` for `<piece>-landscape.*` / `<piece>-portrait.*`
     pairs (24 pieces at the time of writing) and is what home.html has always
     used. Uploading more from the card dashboard extends it with no code change.

   Both feed one pool. The gallery scenes are compiled in so the very first paint
   never waits on a request; the API list is fetched in the background and cached
   to localStorage, so from the second visit on the rotation is the full library.

   ES5-flavoured: adventure.html loads it beside `adventure.js`. */
(function () {
  'use strict';

  var CACHE_KEY = 'sgLoadingArtCache';

  // Landscape-only on purpose: these are 16:9 scenes, and the plate is painted
  // with `cover`, so a portrait viewport crops rather than letterboxes.
  var GALLERY = [
    { id: 'bearby-longfuse',   title: 'The Long Fuse',      place: 'Emberwaste Gate' },
    { id: 'bearby-blastoff',   title: 'Blast Off',          place: 'Emberwaste Gate' },
    { id: 'bearnade-payload',  title: 'Payload Away',       place: 'The Sunken Span' },
    { id: 'bearzooka-rampage', title: 'Emberwaste Rampage', place: 'Cinderfall Reach' },
    { id: 'draco-brood',       title: 'The Cinder Brood',   place: 'Moltenmaw Basin' }
  ].map(function (g) {
    return { id: g.id, title: g.title, place: g.place,
             landscape: '/img/gallery/' + g.id + '.webp' };
  });

  /* Loading-screen filler copy. A loading screen that shows only a spinner
     teaches the player nothing, so the wait carries the world instead: a mix of
     rules hints (things the tutorial says once and never again) and Siegeling
     lore. Kept here rather than per-page so the hub, the expedition and the
     match gate all draw from one pool.

     `kind` is presentational only — callers that want to label the line use it;
     the rotator itself treats every entry the same. */
  var HINTS = [
    { kind: 'HINT', text: 'Notches are the whole game. Two adjacent Siegelings whose notches point at each other form a link, and links are what pay for your spells.' },
    { kind: 'HINT', text: 'A Siegeling on the board edge can anchor to a socket instead: the left column reaches LEFT, the right column RIGHT, the outer rows TOP and BOTTOM.' },
    { kind: 'HINT', text: 'Siegelings carry no printed attack value. Every point of damage comes from an ability you chose to pay for.' },
    { kind: 'HINT', text: 'Speed decides the order of the Battle phase, not the strength of the blow. A fragile Siegeling that acts first can end a fight before it starts.' },
    { kind: 'HINT', text: 'You may place one Siegeling per turn — but evolutions are free of that limit, and free of the five-Siegeling board cap.' },
    { kind: 'HINT', text: 'Claim a surviving Siegeling during Setup for a burst of temporary energy. Energy you do not spend this round is energy you never had.' },
    { kind: 'HINT', text: 'Fire melts Ice, Ice stills Wind, Wind erodes Earth, Earth smothers Fire. Water drowns Fire and Ice alike.' },
    { kind: 'HINT', text: 'Metal breaks Earth and Wind. Electric splits Wind and Fire. Poison seeps through Ice and Earth.' },
    { kind: 'HINT', text: 'Shadow devours Psychic, Psychic outwits Light, Light burns the Undead, and the Undead swallow Shadow. The circle never closes in your favour twice.' },
    { kind: 'HINT', text: 'A defeated Siegeling pays a bounty in damage to its own SiegeKnight. The rarer the Siegeling, the heavier the debt.' },
    { kind: 'HINT', text: 'Traps cost energy to set, not to spring. Lay them on a round you have to spare.' },
    { kind: 'HINT', text: 'Your SiegeKnight is always working: the passive runs every round whether or not you spend on the active.' },
    { kind: 'LORE', text: 'Siegelings are not summoned. They are found — asleep in orchards, frozen in river ice, curled in the hollow of a lightning-split oak.' },
    { kind: 'LORE', text: 'The notches along a Siegeling\'s edge are said to be scars from the first Siege, when the elements were torn apart and each creature kept the direction it was pulled.' },
    { kind: 'LORE', text: 'Energy does not come from a Siegeling. It comes from the space between two of them that agree.' },
    { kind: 'LORE', text: 'A lone Siegeling glows faintly. A linked pair lights a whole field. Nobody has ever recorded what a fully linked board looks like from outside.' },
    { kind: 'LORE', text: 'SiegeKnights do not command their warband. They keep pace with it, and the oldest knights admit the Siegelings chose them first.' },
    { kind: 'LORE', text: 'An evolution is not a new creature. It is the same one finally remembering what it was.' },
    { kind: 'LORE', text: 'The apple groves on the frost line are contested ground: Ice Siegelings nest in the branches, Earth Siegelings sleep in the roots, and neither has ever won.' },
    { kind: 'LORE', text: 'Sockets are the old anchor-stones that ring every arena. Long before the game, they were the only thing holding the elements still.' },
    { kind: 'LORE', text: 'Expedition maps redraw themselves between runs. Cartographers gave up; the Siegelings never needed one.' },
    { kind: 'LORE', text: 'Every deck is forty cards because forty is how many the first SiegeKnight could carry and still run.' }
  ];

  function hints() { return HINTS.slice(); }

  /* Rotates hint copy through `el` until the returned stop() is called (or the
     host is removed). Fades via the `is-fading` class so each surface can style
     the transition in its own stylesheet; a caller that styles nothing still
     gets working text. Honours prefers-reduced-motion by skipping the fade. */
  function mountHints(el, opts) {
    if (!el) return function () {};
    var o = opts || {};
    var everyMs = Number(o.everyMs) > 0 ? Number(o.everyMs) : 5200;
    var withLabel = o.label !== false;
    var list = hints();
    var idx = Math.floor(Math.random() * list.length);
    var reduce = Boolean(window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var timer = null;
    var fadeTimer = null;

    function write() {
      var h = list[idx];
      el.setAttribute('data-hint-kind', h.kind);
      el.textContent = (withLabel ? h.kind + ' — ' : '') + h.text;
    }

    write();
    timer = setInterval(function () {
      idx = (idx + 1) % list.length;
      if (reduce) { write(); return; }
      el.classList.add('is-fading');
      fadeTimer = setTimeout(function () {
        write();
        el.classList.remove('is-fading');
      }, 320);
    }, everyMs);

    return function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    };
  }

  function cached() {
    try {
      var list = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function pool() {
    return GALLERY.concat(cached());
  }

  function prefersPortrait() {
    return Boolean(window.matchMedia && window.matchMedia('(orientation: portrait)').matches);
  }

  function imageFor(piece) {
    if (!piece) return '';
    return prefersPortrait()
      ? (piece.portrait || piece.landscape || '')
      : (piece.landscape || piece.portrait || '');
  }

  function pick() {
    var list = pool().filter(function (p) { return imageFor(p); });
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  /* Paints a piece onto `host` and returns it. The caller owns the markup; this
     only fills the two slots it agrees to provide, so a host that wants no
     caption simply omits `[data-art-title]`. */
  function paint(host) {
    if (!host) return null;
    var piece = pick();
    var url = imageFor(piece);
    if (!url) return null;
    var plate = host.querySelector('[data-art-plate]') || host;
    plate.style.backgroundImage = 'url("' + url + '")';
    var titleEl = host.querySelector('[data-art-title]');
    if (titleEl) {
      titleEl.textContent = piece.title || '';
      if (piece.place) titleEl.setAttribute('data-place', piece.place);
    }
    return piece;
  }

  /* Background refresh. It never blocks a paint: whatever it finds lands in the
     cache for the next load. */
  function refresh() {
    return fetch('/api/art/loading', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var art = data && Array.isArray(data.art) ? data.art : null;
        if (!art || !art.length) return null;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(art)); } catch (e) { /* private mode */ }
        return art;
      })
      .catch(function () { return null; });
  }

  window.SiegelingsLoadingArt = { pool: pool, pick: pick, paint: paint, refresh: refresh,
                                  hints: hints, mountHints: mountHints };
})();
