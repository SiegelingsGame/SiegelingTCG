/* Live data for the art-first hub.
   The concept renders from a frozen catalog snapshot so the preview board works
   offline; this module fetches the real thing and hands back the same shape, so
   the renderer does not care which it got.

   Two rules learned from the endpoints themselves:
   - /api/player/progression, /api/missions/daily and /api/profile/decks throw or
     error for a signed-out player (the user-data stores have no row to read), so
     they are only called once /api/auth/me reports authenticated.
   - Everything else degrades: a failed fetch leaves that slice null and the
     renderer falls back to its snapshot rather than rendering an empty screen. */
(function () {
  'use strict';

  function get(url) {
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // A run is resumable only while it is ACTIVE. The endpoint returns either a
  // `runs` list (one save per mode) or a single `run`, so normalise both.
  function activeRuns(payload) {
    if (!payload) return [];
    var list = payload.runs || (payload.run ? [payload.run] : []);
    return list.filter(function (r) { return r && r.status === 'ACTIVE'; });
  }

  function load() {
    return get('/api/auth/me').then(function (me) {
      var signedIn = Boolean(me && me.authenticated);
      var core = [
        get('/api/game/options'),
        get('/api/match/rooms'),
        get('/api/siege/run/active'),
        get('/api/leaderboards')
      ];
      var gated = signedIn
        ? [get('/api/player/progression'), get('/api/missions/daily'), get('/api/profile/decks')]
        : [Promise.resolve(null), Promise.resolve(null), Promise.resolve(null)];

      return Promise.all(core.concat(gated)).then(function (r) {
        var options = r[0], rooms = r[1], siege = r[2], boards = r[3],
            progression = r[4], missions = r[5], decks = r[6];
        var catalog = (options && options.cardCatalog) || [];
        return {
          signedIn: signedIn,
          guest: !signedIn,
          displayName: (me && me.user && me.user.displayName) || null,
          // The binder shows the whole catalog as real card faces - Siegelings,
          // Strategies and Deceptions alike - because the production renderer
          // composes a frame for every type, art or not. Siegelings stay
          // separated for the hero and featured rails, which need a creature.
          // SiegeKnights live in `trainers`, not the card catalog, but a binder
          // that omits them is not the binder. Tag them so the renderer picks the
          // knight treatment (full card art, or overlay art behind the template).
          cards: catalog.concat(((options && options.trainers) || []).map(function (t) {
            var k = {}; for (var key in t) if (Object.prototype.hasOwnProperty.call(t, key)) k[key] = t[key];
            k.type = 'SIEGEKNIGHT';
            return k;
          })),
          sieglings: catalog.filter(function (c) {
            return c && c.cardArtUrl && c.cardArtMode === 'OVERLAY' && c.type === 'SIEGLING';
          }),
          decks: (options && options.decks) || [],
          trainers: (options && options.trainers) || [],
          defaultDeckId: options && options.defaultDeckId,
          defaultTrainerId: options && options.defaultTrainerId,
          savedDecks: (decks && (decks.decks || decks)) || null,
          lobbies: (rooms && rooms.rooms ? rooms.rooms.length : 0),
          rooms: (rooms && rooms.rooms) || [],
          deckBuilder: (options && options.deckBuilder) || null,
          leaderboards: boards || null,
          siegeRuns: activeRuns(siege),
          gold: progression && (progression.gold != null ? progression.gold : null),
          ownedTotal: progression && progression.ownedTotal,
          level: progression && progression.level,
          xp: progression && progression.xp,
          xpToNext: progression && (progression.xpToNext || progression.nextLevelXp),
          remnants: progression && progression.remnants,
          ownedCards: (progression && progression.ownedCards) || null,
          matchHistory: (progression && progression.matchHistory) || null,
          missions: (missions && !missions.error && (missions.missions || missions.daily)) || null,
          catalogVersion: options && options.catalogVersion
        };
      });
    });
  }

  window.SiegelingsHomeLive = { load: load };
})();
