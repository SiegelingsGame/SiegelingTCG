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

  // The session rides the httpOnly `__session` cookie, which is named that way
  // precisely so Firebase Hosting forwards it to Cloud Run. The Bearer header is
  // sent as well when a real token is stored, because that is how the battle
  // table authenticates and the two surfaces must agree about who is signed in.
  // The sentinel game.js writes once auth has moved to the cookie is not a
  // credential, so it is never sent.
  var TOKEN_KEY = 'sieglingsAuthToken';
  var COOKIE_SENTINEL = 'cookie';

  function bearer() {
    try {
      var token = localStorage.getItem(TOKEN_KEY);
      return token && token !== COOKIE_SENTINEL ? 'Bearer ' + token : '';
    } catch (e) {
      return '';
    }
  }

  function get(url) {
    var headers = { Accept: 'application/json' };
    var auth = bearer();
    if (auth) headers.Authorization = auth;
    return fetch(url, { credentials: 'same-origin', headers: headers })
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
        get('/api/leaderboards'),
        // The shop's real pack catalog, with the prices and odds the server
        // actually charges - the screen used to show invented packs at an
        // invented 150 each.
        get('/api/shop/packs')
      ];
      var gated = signedIn
        ? [get('/api/player/progression'), get('/api/missions/daily'), get('/api/profile/decks'),
           // Friends + their live presence. Signed-out has no friend list to
           // read, and the endpoint says so rather than returning an empty one.
           get('/api/social/presence'),
           // Keep residents carry the rapport bonus a Siegeling is actually
           // granting, which is the only real "Keep buff" per card.
           get('/api/keep')]
        : [Promise.resolve(null), Promise.resolve(null), Promise.resolve(null),
           Promise.resolve(null), Promise.resolve(null)];

      return Promise.all(core.concat(gated)).then(function (r) {
        var options = r[0], rooms = r[1], siege = r[2], boards = r[3], shop = r[4],
            progressionResponse = r[5], missions = r[6], decks = r[7], presence = r[8], keep = r[9];
        var catalog = (options && options.cardCatalog) || [];
        // /api/player/progression answers {progression:{gold, ownedTotal, …},
        // packs, dailyOffers, …} - the wallet is NESTED. Reading it off the root
        // is why a signed-in player saw an em-dash where their coins should be.
        // /api/auth/me carries the same object plus matchHistory and savedDecks,
        // so it is the fallback when the dedicated call fails.
        var progression = (progressionResponse && progressionResponse.progression)
          || (me && me.progression) || null;
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
          savedDecks: (decks && (decks.decks || decks)) || (me && me.savedDecks) || null,
          lobbies: (rooms && rooms.rooms ? rooms.rooms.length : 0),
          rooms: (rooms && rooms.rooms) || [],
          deckBuilder: (options && options.deckBuilder) || null,
          leaderboards: boards || null,
          siegeRuns: activeRuns(siege),
          gold: progression && (progression.gold != null ? progression.gold : null),
          ownedTotal: progression && progression.ownedTotal,
          // There is no account level or account XP anywhere in the backend -
          // only per-SiegeKnight levels - so the hub reports the knights it has
          // instead of inventing a number for the player.
          knights: (progression && progression.ownedTrainers) || null,
          siegeWins: progression && progression.siegeWins,
          titles: (progression && progression.playerTitles) || null,
          remnants: progression && progression.remnants,
          ownedCards: (progression && progression.ownedCards) || null,
          // Match history lives on the profile, never on the progression record.
          matchHistory: (me && me.matchHistory) || null,
          missions: (missions && !missions.error && (missions.missions || missions.daily)) || null,
          packs: (shop && shop.packs ? shop.packs.filter(function (pk) { return pk && pk.active !== false; }) : null),
          friends: (presence && !presence.error && presence.friends) || (me && me.friends) || null,
          keepResidents: (keep && !keep.error && keep.residents) || null,
          catalogVersion: options && options.catalogVersion
        };
      });
    });
  }

  window.SiegelingsHomeLive = { load: load };
})();
