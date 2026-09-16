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

  window.SiegelingsLoadingArt = { pool: pool, pick: pick, paint: paint, refresh: refresh };
})();
