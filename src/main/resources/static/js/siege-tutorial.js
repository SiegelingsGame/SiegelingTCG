/* Siege — guided Tutorial mode.
 *
 * The tutorial is a *simulated expedition*: it drives the real adventure.js
 * screens by standing in for the server. adventure.js keeps posting to
 * /api/siege/** exactly as it does in a live run; while the tutorial is active
 * those calls are answered here from a scripted, in-memory run instead of
 * reaching Cloud Run. Nothing about the tutorial touches the player's account,
 * their saves, or their gold — that is the whole reason it fakes the server
 * rather than starting a real run with training wheels.
 *
 * The cast is REAL card data, not invented placeholders: Squire Bob leads Draco
 * and Fawny, read out of the roster adventure.js already loaded, so the art,
 * stats, moves, passive and Ultimate the tutorial teaches are the ones the
 * player will actually meet — and they follow the dashboard when it retunes
 * them. Baked copies of the same cards stand in only if the roster is missing.
 *
 * The map branches twice. Both lanes of each diamond carry the same node types
 * in the opposite order, so branching is taught honestly while every path still
 * visits every kind of stop.
 *
 * On top sits the coach: a spotlight ring plus a tip card. Steps are addressed
 * by id and can route on live state, which is what lets one script follow
 * either lane of a branch.
 *
 * ES5-flavoured (var, function statements, IIFE) to match adventure.js.
 */
(function () {
  'use strict';

  var ACTIVE = false;
  var M = null;          // the simulated run (wire-shaped, mutated in place)
  var STEPS = null;
  var idx = -1;
  var shown = 0;         // steps actually rendered, for the "Step N of T" counter
  var collapsed = false; // a read tip shrinks to a one-line hint so the play area is clear
  var total = 0;
  var flags = null;      // things the coach waits on that state alone cannot show
  var visited = null;    // mirror of the coach's visited map, for fork routing

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hidden(id) { var n = $(id); return !n || n.classList.contains('hidden'); }
  function screenIs(id) { return document.body.dataset.screen === id; }

  var MAX_AP = 5;
  var HAND_MAX = 5;
  var ULT_COST = 6;      // lower than a real run's 20: the tutorial has to reach it
  var EVOLVE_GAUGE = 5;  // SiegeBattle.EVOLVE_GAUGE — AP a Siegeling spends to evolve

  // ---- real card data ---------------------------------------------------

  /* The roster adventure.js loaded before the mode screen rendered. Everything
   * below prefers it, so the tutorial teaches whatever the dashboard currently
   * ships rather than a snapshot that silently rots. */
  function roster() {
    try {
      var r = window.SiegeClient && window.SiegeClient.roster ? window.SiegeClient.roster() : null;
      if (!r) return null;
      return {
        siegelings: r.siegelings || r.sieglings || [],
        knights: r.knights || []
      };
    } catch (e) { return null; }
  }

  function fromRoster(list, id) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  /* Baked stand-ins, used only when the roster never arrived. Values mirror the
   * live cards at the time of writing; the roster path is the one that stays
   * correct, so these are a floor, not a source of truth. */
  var BAKED = {
    'squire-bob': {
      id: 'squire-bob', name: 'Squire Bob', element: 'NEUTRAL',
      // Same path a live run puts on knight.artUrl — party strip falls back to a
      // shield glyph when this is missing (the tutorial used to hardcode null).
      artUrl: '/img/knights/squire-bob-full-card.png',
      passive: 'Musters an extra Siegeling: choose 2 starting Siegelings instead of 1.',
      passiveKind: 'MARSHAL', passiveName: 'Marshal', level: 1,
      ultimateName: 'Muster the Line',
      ultimateDesc: 'Evolves up to 2 Siegelings on the spot — no AP gauge, no card.',
      active: { name: 'Squire Bob: Pep Talk', element: 'NEUTRAL', effect: 'HEAL', value: 4, actionCost: 2, target: 'ALLY_SINGLE', description: 'Heal 1 ally for 2' }
    },
    draco: {
      id: 'draco', name: 'Draco', element: 'FIRE', hp: 54, speed: 8, evolves: true, artUrl: null,
      moves: [
        { name: 'Embers', element: 'FIRE', effect: 'DAMAGE', value: 5, actionCost: 0, target: 'ENEMY_SINGLE', description: 'Deal 3 Fire Damage to an Enemy', status: 'BURN', statusChance: 20 },
        { name: 'Spark', element: 'FIRE', effect: 'BUFF_ATK', value: 2, actionCost: 0, target: 'ALLY_SINGLE', description: 'Grant Ally +2 Damage', durationRounds: 2 }
      ]
    },
    fawny: {
      id: 'fawny', name: 'Fawny', element: 'ICE', hp: 46, speed: 4, evolves: true, artUrl: null,
      moves: [
        { name: 'Frozen Fist', element: 'ICE', effect: 'DAMAGE', value: 3, actionCost: 1, target: 'ENEMY_SINGLE', description: 'Deal 1 damage to 1 enemy', status: 'SLOW', statusChance: 25 },
        { name: 'Snowball Fight', element: 'ICE', effect: 'DAMAGE', value: 4, actionCost: 2, target: 'ALL_ENEMIES', description: 'Deal 2 damage to the selected enemy row', status: 'SLOW', statusChance: 30 }
      ]
    },
    applehead: {
      id: 'applehead', name: 'Applehead', element: 'EARTH', hp: 82, speed: 8, evolves: false, artUrl: null,
      moves: [
        { name: 'Fruit Fight', element: 'EARTH', effect: 'DAMAGE', value: 4, actionCost: 0, target: 'ENEMY_SINGLE', description: 'Deal 4 damage to an Enemy' },
        { name: 'Share Berries', element: 'EARTH', effect: 'HEAL', value: 6, actionCost: 1, target: 'ALLY_ALL', description: 'Heal the warband' }
      ]
    },
    shellpack: {
      id: 'shellpack', name: 'Shellpack', element: 'WATER', hp: 74, speed: 6, evolves: false, artUrl: null,
      moves: [{ name: 'Bubble Blast', element: 'WATER', effect: 'DAMAGE', value: 3, actionCost: 0, target: 'ENEMY_SINGLE', description: 'Deal 3 damage to an Enemy' }]
    },
    monkwatt: {
      id: 'monkwatt', name: 'Monkwatt', element: 'ELECTRIC', hp: 70, speed: 7, evolves: false, artUrl: null,
      moves: [{ name: 'Zap', element: 'ELECTRIC', effect: 'DAMAGE', value: 4, actionCost: 0, target: 'ENEMY_SINGLE', description: 'Deal 4 damage to an Enemy' }]
    }
  };

  /* Evolutions are not selectable, so they never appear in the roster — these
   * two are read from the live card catalog and baked. Only what the evolved
   * form has to *show* is needed: its name, its art and the stats it gains. */
  var EVOLUTIONS = {
    draco: {
      id: 'dracoil', name: 'Dracoil', hp: 82, speed: 12,
      artUrl: 'https://firebasestorage.googleapis.com/v0/b/siegelingstcgtesting.firebasestorage.app/o/cards%2Fdracoil.png?alt=media&token=9c268396-5eab-4679-a448-dcab83a334ce',
      // The evolved form brings its OWN cards, as a real run does — the deck is
      // rebuilt around the new Siegeling rather than keeping the basic's.
      moves: [
        { name: 'Magma Lash', element: 'FIRE', effect: 'DAMAGE', value: 8, actionCost: 0, target: 'ENEMY_SINGLE', description: 'Deal 8 Fire damage to an Enemy', status: 'BURN', statusChance: 35 },
        // Keep a BUFF_ATK in slot 1: Draco's Spark sits there, and it is the
        // only card in the tutorial that demonstrates an attack buff — swapping
        // it out for a second damage move would quietly delete that lesson.
        { name: 'Emberbrand', element: 'FIRE', effect: 'BUFF_ATK', value: 3, actionCost: 0, target: 'ALLY_SINGLE', description: 'Grant Ally +3 Damage', durationRounds: 2 }
      ]
    },
    fawny: {
      id: 'chilldoe', name: 'Chilldoe', hp: 58, speed: 5,
      artUrl: 'https://firebasestorage.googleapis.com/v0/b/siegelingstcgtesting.firebasestorage.app/o/cards%2Fchilldoe.png?alt=media&token=500918f8-06c5-4353-ac5c-af96f850ef97',
      moves: [
        { name: 'Glacier Fist', element: 'ICE', effect: 'DAMAGE', value: 6, actionCost: 1, target: 'ENEMY_SINGLE', description: 'Deal 6 Ice damage to an Enemy', status: 'SLOW', statusChance: 40 },
        { name: 'Whiteout', element: 'ICE', effect: 'DAMAGE', value: 7, actionCost: 2, target: 'ALL_ENEMIES', description: 'Deal 7 Ice damage to every Enemy', status: 'SLOW', statusChance: 45 }
      ]
    }
  };

  function card(id) {
    var r = roster();
    return (r && fromRoster(r.siegelings, id)) || BAKED[id] || null;
  }
  function knightCard() {
    var r = roster();
    var live = r && fromRoster(r.knights, 'squire-bob');
    var baked = BAKED['squire-bob'];
    if (!live) return baked;
    // Roster knights omit artUrl today; keep the baked floor so the party strip
    // matches a real expedition (which resolves art via knightArtUrl).
    if (!live.artUrl && baked && baked.artUrl) {
      var out = {};
      for (var key in live) {
        if (Object.prototype.hasOwnProperty.call(live, key)) out[key] = live[key];
      }
      out.artUrl = baked.artUrl;
      return out;
    }
    return live;
  }

  // ---- wire-shape builders ----------------------------------------------

  function unitFrom(src, opts) {
    opts = opts || {};
    var hp = opts.hp != null ? opts.hp : src.hp;
    return {
      id: opts.id || ('u-' + src.id), name: src.name, element: src.element,
      side: opts.side || 'PLAYER', hp: hp, maxHp: hp, shield: 0,
      speed: src.speed, baseSpeed: src.speed, effectiveSpeed: src.speed,
      attackBuff: 0, attackBuffTimed: 0, attackBuffRounds: 0,
      speedBuffTimed: 0, speedBuffRounds: 0, maxHpBonus: 0,
      level: 1, xp: 0, xpToNext: 40, xpInLevel: 0, xpSpan: 40, leveledThisBattle: false,
      sourceCardId: src.id, itemId: null, item: null, alive: true,
      artUrl: src.artUrl || null, shadeOf: opts.shadeOf || null,
      position: opts.position == null ? 0 : opts.position,
      statuses: [], statusRounds: {}, evoStage: 0, size: opts.size || 'MEDIUM',
      hasEvolution: !!src.evolves, hasStage3Evolution: false,
      // The gauge the plate draws. hasEvolution without these printed
      // "undefined/undefined" on the badge; the real payload always carries
      // them together. apSpent drives it, the way a real run does.
      apSpent: 0, evoGauge: 0, evoGaugeMax: EVOLVE_GAUGE, evoReady: false,
      leader: !!opts.leader, cards: (src.moves || []).slice(),
      abilities: opts.side === 'ENEMY' ? (src.moves || []).slice() : [],
      evolvesTo: src.evolves && EVOLUTIONS[src.id] ? EVOLUTIONS[src.id].name : null
    };
  }

  /** One deck card per move, exactly as a real run builds its deck. */
  function deckCardsFor(ownerId, ownerName, moves, tag) {
    return (moves || []).map(function (m, i) {
      return {
        instanceId: tag + '-' + i, ownerId: ownerId, ownerName: ownerName,
        name: m.name, element: m.element, effect: m.effect, value: m.value,
        actionCost: m.actionCost, target: m.target, description: m.description,
        status: m.status, statusChance: m.statusChance, durationRounds: m.durationRounds
      };
    });
  }

  /** What a damage card will ACTUALLY hit for, owner's attack buff included.
   *  `resolve` already adds it (`c.value + owner.attackBuff`) but the card face
   *  was built with `boostedValue: tpl.value`, so a buffed Siegeling's cards
   *  kept advertising the unbuffed number — standard Siege strikes through the
   *  old value and shows the new one, and the tutorial did not. */
  function boostedFor(tpl) {
    if (tpl.effect !== 'DAMAGE' && tpl.effect !== 'EXECUTE') return tpl.value;
    var owner = M.battle ? findUnit(tpl.ownerId) : null;
    return tpl.value + ((owner && owner.attackBuff) || 0);
  }

  function handCard(tpl, ap) {
    var needs = tpl.target === 'ENEMY_SINGLE' || tpl.target === 'ALLY_SINGLE';
    var h = {
      instanceId: tpl.instanceId, name: tpl.name, element: tpl.element,
      effect: tpl.effect, value: tpl.value, boostedValue: boostedFor(tpl),
      target: tpl.target, actionCost: tpl.actionCost, description: tpl.description,
      ownerId: tpl.ownerId, ownerName: tpl.ownerName, needsTarget: needs,
      playable: ap >= tpl.actionCost
    };
    if (tpl.durationRounds) h.durationRounds = tpl.durationRounds;
    if (tpl.status && tpl.statusChance) { h.status = tpl.status; h.statusChance = tpl.statusChance; }
    return h;
  }

  function pileCard(c) {
    var m = {
      instanceId: c.instanceId, name: c.name, element: c.element, effect: c.effect,
      value: c.value, target: c.target, actionCost: c.actionCost,
      description: c.description, ownerId: c.ownerId, ownerName: c.ownerName
    };
    if (c.durationRounds) m.durationRounds = c.durationRounds;
    if (c.status && c.statusChance) { m.status = c.status; m.statusChance = c.statusChance; }
    return m;
  }

  function item(id, name, ic, kind, value, effect, desc) {
    return { id: id, name: name, icon: ic, kind: kind, value: value, effect: effect, desc: desc };
  }

  // ---- the branching map -------------------------------------------------

  /* Three diamonds, then the shared tail. Each lane of a diamond carries the
   * same two node types in the opposite order, so whichever way the player goes
   * they still meet every kind of stop — the tutorial can teach branching
   * without a route that skips a lesson. A real expedition's lanes differ in
   * what they hold; the coach says so. Cache/Rift mirrors broker/smith:
   * Buried Cache → Deep Rift, and Rift → Sealed Cache. */
  var NODES = [
    { id: 0, row: 0, col: 0, type: 'BATTLE', label: 'Ruined Gate', next: [1, 2] },
    { id: 1, row: 1, col: 0, type: 'REST', label: 'Ember Camp', next: [3] },
    { id: 2, row: 1, col: 1, type: 'CARAVAN', label: 'Dust Caravan', next: [4] },
    { id: 3, row: 2, col: 0, type: 'CARAVAN', label: 'Wayside Wagon', next: [5, 6] },
    { id: 4, row: 2, col: 1, type: 'REST', label: 'Quiet Hollow', next: [5, 6] },
    { id: 5, row: 3, col: 0, type: 'BROKER', label: 'Merc Post', next: [7] },
    { id: 6, row: 3, col: 1, type: 'SMITH', label: 'Old Forge', next: [8] },
    { id: 7, row: 4, col: 0, type: 'SMITH', label: 'Ember Forge', next: [9, 10] },
    { id: 8, row: 4, col: 1, type: 'BROKER', label: 'Hedge Broker', next: [9, 10] },
    { id: 9, row: 5, col: 0, type: 'TREASURE', label: 'Buried Cache', next: [11] },
    { id: 10, row: 5, col: 1, type: 'RIFT', label: 'Rift', next: [12] },
    { id: 11, row: 6, col: 0, type: 'RIFT', label: 'Deep Rift', next: [13] },
    { id: 12, row: 6, col: 1, type: 'TREASURE', label: 'Sealed Cache', next: [13] },
    { id: 13, row: 7, col: 0, type: 'EVENT', label: 'Standing Stone', next: [14] },
    { id: 14, row: 8, col: 0, type: 'BOSS', label: 'The Siegelord', next: [] }
  ];

  function nodeById(id) {
    for (var i = 0; i < M.map.length; i++) { if (M.map[i].id === id) return M.map[i]; }
    return null;
  }
  function nodeType(id) { var n = nodeById(id); return n ? n.type : null; }

  // ---- the simulated run -------------------------------------------------

  function buildModel() {
    var k = knightCard();
    var land = {
      id: 'fire', name: 'Emberfall', kind: 'ELEMENTAL', elements: ['FIRE'],
      background: '/img/lands/fire.webp', feature: 'Ember Forge', featureType: 'SMITH',
      terrain: 'Cinder heat', effect: 'FIRE Siegelings start battles with +1 Attack.',
      encounters: 'Favored Siegelings have 4× draw weight in recruits, broker stock and card prizes.',
      eventTitle: 'The Cinder Smith'
    };
    var dracoSrc = card('draco');
    var fawnySrc = card('fawny');
    var draco = unitFrom(dracoSrc, { id: 'ally-draco', position: 0 });
    var fawny = unitFrom(fawnySrc, { id: 'ally-fawny', position: 1 });

    var deck = deckCardsFor('ally-draco', draco.name, dracoSrc.moves, 'd')
      .concat(deckCardsFor('ally-fawny', fawny.name, fawnySrc.moves, 'f'));
    var active = k.active || BAKED['squire-bob'].active;
    deck.push({
      instanceId: 'k-0', ownerId: 'knight-squire-bob', ownerName: k.name,
      name: active.name, element: active.element, effect: active.effect,
      value: active.value, actionCost: active.actionCost, target: active.target,
      description: active.description
    });

    var map = NODES.map(function (n) {
      return {
        id: n.id, row: n.row, col: n.col, type: n.type, label: n.label,
        cleared: false, current: false, reachable: n.row === 0, next: n.next.slice()
      };
    });

    return {
      token: 'tutorial', status: 'ACTIVE', currentNodeId: -1, lastReward: '',
      deckSize: deck.length, gold: 140, mode: 'STANDARD', slot: 'SIEGE',
      slotLabel: 'Tutorial', score: 0, loop: 0, partyMax: 3, tutorial: true,
      land: land, landHistory: [land], landSegment: 0, landSegmentRows: 8,
      landBoons: [], boonOffer: null,
      stats: { nodesCleared: 0, bossKills: 0, enemiesDefeated: 0, goldEarned: 0 },
      endRewards: null, xpRecap: null, ampChoice: null, ampsPending: 0,
      extraction: null, recruit: null, mercenary: null,
      camp: null, cache: null, broker: null, smith: null, caravan: null,
      event: null, rift: null, minigame: null, checkpoint: false,
      knight: {
        id: k.id, name: k.name, element: k.element,
        passive: k.passive, passiveKind: k.passiveKind, passiveName: k.passiveName,
        active: active.name, activeSpec: active,
        ultimateName: k.ultimateName, ultimateDesc: k.ultimateDesc,
        ultimateValue: 2, accountLevel: k.level || 1,
        unitId: 'knight-unit', hp: 40, maxHp: 40, artUrl: k.artUrl || null, alive: true,
        level: 1, xp: 0, xpToNext: 60, xpInLevel: 0, xpSpan: 60, leveledThisBattle: false
      },
      party: [draco, fawny],
      deckTemplates: deck,
      deckList: deck.map(function (c, i) {
        return { index: i, name: c.name, element: c.element, owner: c.ownerName };
      }),
      inventory: [],
      knightBag: [item('tut-tonic', 'Field Tonic', '🧪', 'HEAL', 6, 'Heal 6 HP', 'A knight consumable — usable on the map or mid-battle.')],
      map: map,
      pendingRewards: [],
      battle: null
    };
  }

  function refreshDeckList() {
    M.deckSize = M.deckTemplates.length;
    M.deckList = M.deckTemplates.map(function (c, i) {
      return { index: i, name: c.name, element: c.element, owner: c.ownerName };
    });
  }

  // ---- simulated battle ---------------------------------------------------

  function livingAllies() { return M.battle.allies.filter(function (u) { return u.alive; }); }
  function livingFoes() { return M.battle.enemies.filter(function (u) { return u.alive; }); }
  function findUnit(id) {
    var all = M.battle.allies.concat(M.battle.enemies);
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; }
    if (M.battle.knight.id === id) return M.battle.knight;
    return null;
  }
  function vitalsOf(ids) {
    return ids.map(function (id) {
      var u = findUnit(id);
      return u ? { id: u.id, hp: u.hp, maxHp: u.maxHp, shield: u.shield || 0, alive: u.alive } : null;
    }).filter(Boolean);
  }

  function startBattle() {
    var allies = M.party.map(function (p) {
      var c = clone(p);
      c.side = 'PLAYER';
      return c;
    });
    if (M.mercenary) {
      var merc = clone(M.mercenary);
      merc.side = 'PLAYER';
      merc.position = allies.length;
      allies.push(merc);
    }
    // Foes are real Siegelings worn as shades, the way the expedition dresses
    // them. Their HP is cut well below the catalog value: a tutorial fight has
    // to end in three rounds, not fifteen.
    var foes = [
      unitFrom(card('shellpack'), { id: 'foe-shell', side: 'ENEMY', hp: 22, position: 0, leader: true, shadeOf: card('shellpack').name, size: 'LARGE' }),
      unitFrom(card('monkwatt'), { id: 'foe-monk', side: 'ENEMY', hp: 14, position: 1, shadeOf: card('monkwatt').name })
    ];
    foes.forEach(function (f) { f.name = 'Shade of ' + f.name; });

    M.battle = {
      phase: 'PLAYER_INPUT', roundNumber: 1, playerActsFirst: true,
      playerSpeed: 0, enemySpeed: 0,
      actionPoints: MAX_AP, maxActionPoints: MAX_AP, handMax: HAND_MAX,
      leadId: allies.length ? allies[0].id : null, nodeType: 'BATTLE',
      deckCount: 0, discardCount: 0,
      log: ['Shades bar the Ruined Gate.'], turnLog: [],
      knight: null, allies: allies, enemies: foes,
      targetedPositions: [], sweepIncoming: false, events: [],
      hand: [], deck: [], discard: [],
      _draw: M.deckTemplates.slice(), _hand: [], _discard: []
    };
    refillKnight();
    shuffleIntents();
    syncSpeeds();
    rebuildAdvantage(false);
    drawTo(HAND_MAX);
    syncPiles();
  }

  function refillKnight() {
    var k = M.knight;
    M.battle.knight = {
      id: 'knight-unit', name: k.name, element: k.element, hp: k.hp, maxHp: k.maxHp,
      artUrl: k.artUrl || null, level: k.level, xp: k.xp, xpToNext: k.xpToNext,
      xpInLevel: k.xpInLevel, xpSpan: k.xpSpan, leveledThisBattle: false,
      charge: 1, ultCost: ULT_COST,
      passiveKind: k.passiveKind, passiveName: k.passiveName, passive: k.passive,
      ultimateName: k.ultimateName, ultimateDesc: k.ultimateDesc,
      ultimateValue: k.ultimateValue, ultReady: false
    };
  }
  function syncUlt() {
    var kb = M.battle.knight;
    kb.ultReady = kb.charge >= kb.ultCost && M.battle.phase === 'PLAYER_INPUT';
  }
  function syncSpeeds() {
    M.battle.playerSpeed = livingAllies().reduce(function (s, u) { return s + u.effectiveSpeed; }, 0);
    M.battle.enemySpeed = livingFoes().reduce(function (s, u) { return s + u.effectiveSpeed; }, 0);
    M.battle.playerActsFirst = M.battle.playerSpeed >= M.battle.enemySpeed;
  }

  function rebuildAdvantage(wrapped) {
    var b = M.battle;
    var firstSide = b.playerActsFirst ? 'PLAYER' : 'ENEMY';
    var units = livingAllies().concat(livingFoes());
    units.sort(function (a, c) {
      var speed = (c.effectiveSpeed || c.speed) - (a.effectiveSpeed || a.speed);
      if (speed) return speed;
      var position = (a.position == null ? 999 : a.position) - (c.position == null ? 999 : c.position);
      if (position) return position;
      if (a.side !== c.side) return a.side === firstSide ? -1 : 1;
      return String(a.id).localeCompare(String(c.id));
    });
    b.advantageOrder = units.map(function (u) {
      return {
        id: u.id, name: u.name, element: u.element, side: u.side,
        effectiveSpeed: u.effectiveSpeed || u.speed, position: u.position,
        artUrl: u.artUrl, alive: u.alive
      };
    });
    b.advantageIndex = units.length ? 0 : -1;
    b.advantageHolderId = units.length ? units[0].id : null;
    b.advantageCycle = (b.advantageCycle || 0) + ((wrapped || !b.advantageCycle) ? 1 : 0);
    syncAdvantageFlags();
  }

  function syncAdvantageFlags() {
    var b = M.battle;
    (b.advantageOrder || []).forEach(function (entry) {
      var unit = findUnit(entry.id);
      if (!unit) return;
      entry.name = unit.name;
      entry.element = unit.element;
      entry.effectiveSpeed = unit.effectiveSpeed || unit.speed;
      entry.artUrl = unit.artUrl;
      entry.alive = unit.alive;
    });
    var holder = findUnit(b.advantageHolderId);
    b.advantageActiveForPlayer = b.phase === 'PLAYER_INPUT' && holder && holder.side === 'PLAYER' && holder.alive;
    // A shade that holds Advantage telegraphs its rider next to its intent, the
    // same way an advantaged hand card prints one (SiegeService#combatantView).
    livingAllies().concat(livingFoes()).forEach(function (u) {
      u.advantaged = !!holder && u.id === holder.id;
      u.advantageText = u.advantaged && u.intent ? riderTextFor(u.intent) : null;
    });
  }

  function advanceAdvantage(events, completedSide) {
    var b = M.battle;
    var previous = b.advantageHolderId;
    var holder = findUnit(previous);
    // Hold the token through the other team's turn. Passing on every team turn
    // made some Siegelings hold it only while their cards were unplayable.
    if (holder && holder.alive && holder.side !== completedSide) return;
    for (var i = b.advantageIndex + 1; i < (b.advantageOrder || []).length; i++) {
      var next = findUnit(b.advantageOrder[i].id);
      if (next && next.alive) {
        b.advantageIndex = i;
        b.advantageHolderId = next.id;
        syncAdvantageFlags();
        events.push({ type: 'advantage-pass', fromId: previous, holderId: next.id, cycle: b.advantageCycle });
        return;
      }
    }
    rebuildAdvantage(true);
    if (b.advantageHolderId) events.push({ type: 'advantage-pass', fromId: previous, holderId: b.advantageHolderId, cycle: b.advantageCycle });
  }

  /** Enemy intents are public in Siege: each foe telegraphs the notch it will hit. */
  function shuffleIntents() {
    var allies = livingAllies();
    livingFoes().forEach(function (f, i) {
      var ability = (f.abilities || [])[0];
      if (!ability) return;
      var mark = allies.length ? allies[i % allies.length] : null;
      f.intent = {
        name: ability.name, effect: 'DAMAGE', value: ability.value,
        element: ability.element || f.element, target: 'ENEMY_SINGLE',
        sweep: false, position: mark ? mark.position : -1
      };
    });
    M.battle.targetedPositions = livingFoes()
      .map(function (f) { return f.intent ? f.intent.position : -1; })
      .filter(function (p) { return p >= 0; });
    // Rider copy on a plate is derived from the intent, so it is refreshed here too.
    syncAdvantageFlags();
  }

  function drawTo(n) {
    var b = M.battle;
    while (b._hand.length < n) {
      if (!b._draw.length) {
        if (!b._discard.length) break;
        b._draw = b._discard.slice();
        b._discard = [];
      }
      b._hand.push(b._draw.shift());
    }
  }

  function syncPiles() {
    var b = M.battle;
    b.hand = b._hand.map(function (c) { return handCard(c, b.actionPoints); });
    b.hand.forEach(function (c) {
      c.advantaged = c.ownerId === b.advantageHolderId;
      if (c.advantaged) c.advantageText = riderTextFor(c);
    });
    b.deck = b._draw.map(pileCard);
    b.discard = b._discard.slice().reverse().map(pileCard);
    b.deckCount = b._draw.length;
    b.discardCount = b._discard.length;
    syncUlt();
  }

  function damage(target, amount, events, sourceId, element) {
    var absorbed = Math.min(target.shield || 0, amount);
    target.shield = (target.shield || 0) - absorbed;
    target.hp = Math.max(0, target.hp - (amount - absorbed));
    if (target.hp <= 0) target.alive = false;
    events.push({
      type: 'hit', sourceId: sourceId, targetId: target.id, element: element,
      amount: amount, ko: !target.alive, vitals: vitalsOf([target.id])
    });
    return !target.alive;
  }

  /* Riders are rolled at their printed chance so the card's "20% BURN" is not a
   * decoration. Only the damage-over-time tick is modelled; other statuses show
   * their chip and nothing more. */
  function applyStatus(target, card, events) {
    if (!card.status || !card.statusChance) return;
    if (Math.random() * 100 >= card.statusChance) return;
    if ((target.statuses || []).indexOf(card.status) >= 0) return;
    target.statuses.push(card.status);
    target.statusRounds[card.status] = 2;
    events.push({ type: 'status', targetId: target.id, status: card.status, element: card.element, vitals: vitalsOf([target.id]) });
  }

  function logLine(line) { M.battle.log.push(line); }

  function isFriendlyTarget(target) {
    return target === 'ALLY_SINGLE' || target === 'ALLY_ALL' || target === 'SELF';
  }

  /* One source of rider wording: adventure.js already prints it on every card
   * sheet, and the server's SiegeAdvantage#riderText is the original. The rider
   * itself is gated on the element list below, not on this copy, so a rider
   * still lands if the wording is unavailable. */
  var ADVANTAGE_ELEMENTS = ['FIRE', 'EARTH', 'WIND', 'WATER', 'ICE',
    'ELECTRIC', 'METAL', 'SHADOW', 'UNDEAD', 'PSYCHIC'];

  /* A step whose condition is met the instant the sim resolves would open its
   * successor's tip over the projectile it just asked the player to fire, so a
   * battle wait also holds until the presentation has finished playing. */
  function settled(condition) {
    return function () {
      if (!condition()) return false;
      return !(window.SiegeClient && window.SiegeClient.presentationBusy
        && window.SiegeClient.presentationBusy());
    };
  }

  function riderTextFor(spec) {
    return (window.SiegeClient && window.SiegeClient.advantageRiderText
      ? window.SiegeClient.advantageRiderText(spec) : '') || null;
  }

  function healUnit(target, amount, events) {
    if (!target || !target.alive || amount <= 0) return;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    events.push({ type: 'heal', targetId: target.id, amount: amount, vitals: vitalsOf([target.id]) });
  }

  function shieldUnit(target, amount, events) {
    if (!target || !target.alive || amount <= 0) return;
    target.shield = (target.shield || 0) + amount;
    events.push({ type: 'shield', targetId: target.id, amount: amount, vitals: vitalsOf([target.id]) });
  }

  function inflict(target, status, events, element) {
    if (!target || !target.alive) return;
    if ((target.statuses || []).indexOf(status) >= 0) return;
    target.statuses.push(status);
    target.statusRounds[status] = 2;
    events.push({ type: 'status', targetId: target.id, status: status, element: element, vitals: vitalsOf([target.id]) });
  }

  function triggerAdvantage(owner, c, targets, events) {
    var b = M.battle;
    targets = (targets || []).filter(function (target) { return target && target.alive; });
    if (!owner || owner.id !== b.advantageHolderId || !targets.length) return;
    var friendly = isFriendlyTarget(c.target);
    if (ADVANTAGE_ELEMENTS.indexOf(c.element) < 0) return;
    var text = riderTextFor(c);
    // The rider lands on the single worst-off resolved target, as the server does,
    // except where the printed wording says "target" of a multi-hit card.
    var focus = targets.slice().sort(function (a, d) {
      return (a.hp / Math.max(1, a.maxHp)) - (d.hp / Math.max(1, d.maxHp));
    })[0];
    var others = (owner.side === 'PLAYER' ? livingFoes() : livingAllies()).filter(function (u) {
      return targets.indexOf(u) < 0;
    });
    switch (c.element) {
      case 'FIRE':
        if (friendly) {
          targets.forEach(function (target) {
            target.attackBuff = (target.attackBuff || 0) + 1;
            events.push({ type: 'buff', kind: 'atk', amount: 1, targetIds: [target.id] });
          });
        } else {
          targets.forEach(function (target) { damage(target, 2, events, owner.id, c.element); });
        }
        break;
      case 'EARTH':
        if (friendly) shieldUnit(focus, 4, events);
        else inflict(focus, 'SLOW', events, c.element);
        break;
      case 'WIND':
        if (friendly) {
          if (owner.side === 'PLAYER') b.actionPoints += 1;
        } else inflict(focus, 'SHOCK', events, c.element);
        break;
      case 'WATER':
        if (friendly) healUnit(focus, 3, events);
        else healUnit(owner, 2, events);
        break;
      case 'ICE':
        if (friendly) shieldUnit(focus, 3, events);
        else if ((focus.statuses || []).indexOf('SLOW') >= 0) inflict(focus, 'STUN', events, c.element);
        else inflict(focus, 'SLOW', events, c.element);
        break;
      case 'ELECTRIC':
        if (friendly) {
          if (owner.side === 'PLAYER') b.knight.charge = Math.min(b.knight.ultCost, b.knight.charge + 1);
        } else if (others[0]) damage(others[0], 2, events, owner.id, c.element);
        break;
      case 'METAL':
        if (friendly) shieldUnit(focus, 5, events);
        else if ((focus.shield || 0) > 0) {
          focus.shield = Math.max(0, focus.shield - 4);
          events.push({ type: 'shield', targetId: focus.id, amount: 0, vitals: vitalsOf([focus.id]) });
        } else damage(focus, 1, events, owner.id, c.element);
        break;
      case 'SHADOW':
        if (friendly) { healUnit(focus, 2, events); shieldUnit(focus, 2, events); }
        else { damage(focus, 2, events, owner.id, c.element); healUnit(owner, 2, events); }
        break;
      case 'UNDEAD':
        if (focus.hp * 2 < focus.maxHp) {
          if (friendly) healUnit(focus, 3, events);
          else damage(focus, 3, events, owner.id, c.element);
        }
        break;
      case 'PSYCHIC':
        if (friendly) {
          if (owner.side === 'PLAYER') drawTo(b._hand.length + 1);
        } else inflict(focus, 'SHOCK', events, c.element);
        break;
      default:
        return;
    }
    events.push({
      type: 'advantage-trigger', sourceId: owner.id, targetId: focus.id,
      element: c.element, friendly: friendly, text: text
    });
    if (text) logLine('Advantage — ' + text);
  }

  function playCard(cardId, targetId) {
    var b = M.battle;
    if (!b || b.phase !== 'PLAYER_INPUT') return;
    var i = -1;
    b._hand.forEach(function (c, n) { if (c.instanceId === cardId) i = n; });
    if (i < 0) return;
    var c = b._hand[i];
    if (b.actionPoints < c.actionCost) { M.error = 'Not enough AP for that card.'; return; }
    b._hand.splice(i, 1);
    b._discard.push(c);
    b.actionPoints -= c.actionCost;
    if (String(c.ownerId).indexOf('knight-') === 0) {
      b.knight.charge = Math.min(b.knight.ultCost, b.knight.charge + 1);
    }
    flags.played++;

    var owner = findUnit(c.ownerId) || b.knight;
    if (owner && owner.hasEvolution) {
      owner.apSpent = (owner.apSpent || 0) + c.actionCost;
      owner.evoGauge = Math.min(owner.apSpent, EVOLVE_GAUGE);
      owner.evoReady = owner.evoGauge >= EVOLVE_GAUGE;
    }
    var events = [{ type: 'card', sourceId: owner.id, name: c.name, element: c.element }];
    b.turnLog.push({
      round: b.roundNumber, actor: owner.name, card: c.name,
      cost: c.actionCost, text: owner.name + ' uses ' + c.name + '.'
    });

    if (c.effect === 'DAMAGE') {
      var marks = c.target === 'ALL_ENEMIES' ? livingFoes() : [];
      if (!marks.length) {
        var foe = findUnit(targetId);
        if (!foe || !foe.alive || foe.side !== 'ENEMY') foe = livingFoes()[0];
        if (foe) marks = [foe];
      }
      marks.forEach(function (foe) {
        var power = c.value + (owner.attackBuff || 0);
        var ko = damage(foe, power, events, owner.id, c.element);
        logLine(owner.name + ' hits ' + foe.name + ' for ' + power + '.');
        if (ko) logLine(foe.name + ' is destroyed!');
        else applyStatus(foe, c, events);
      });
      triggerAdvantage(owner, c, marks, events);
    } else if (c.effect === 'HEAL') {
      var pool = c.target === 'ALLY_ALL' ? livingAllies() : [];
      if (!pool.length) {
        var ally = findUnit(targetId);
        if (!ally || !ally.alive || ally.side !== 'PLAYER') ally = livingAllies()[0];
        if (ally) pool = [ally];
      }
      pool.forEach(function (a) {
        a.hp = Math.min(a.maxHp, a.hp + c.value);
        events.push({ type: 'heal', targetId: a.id, amount: c.value, vitals: vitalsOf([a.id]) });
        logLine(a.name + ' recovers ' + c.value + ' HP.');
      });
      triggerAdvantage(owner, c, pool, events);
    } else if (c.effect === 'SHIELD') {
      var me = findUnit(c.ownerId) || livingAllies()[0];
      if (me) {
        me.shield = (me.shield || 0) + c.value;
        events.push({ type: 'shield', targetId: me.id, amount: c.value, vitals: vitalsOf([me.id]) });
        logLine(me.name + ' raises a ' + c.value + ' shield.');
      }
    } else if (c.effect === 'BUFF_ATK' || c.effect === 'BUFF_ATTACK') {
      var mark = findUnit(targetId);
      if (!mark || !mark.alive || mark.side !== 'PLAYER') mark = livingAllies()[0];
      if (mark) {
        mark.attackBuff += c.value;
        mark.attackBuffTimed = mark.attackBuff;
        mark.attackBuffRounds = c.durationRounds || 2;
        events.push({ type: 'buff', kind: 'atk', amount: c.value, targetIds: [mark.id], rounds: c.durationRounds || 2 });
        logLine(mark.name + ' hits for +' + c.value + '.');
        triggerAdvantage(owner, c, [mark], events);
      }
    } else if (c.effect === 'BUFF_SPD') {
      var sm = findUnit(targetId) || livingAllies()[0];
      if (sm) {
        sm.speedBuffTimed = c.value;
        sm.speedBuffRounds = c.durationRounds || 2;
        sm.effectiveSpeed = sm.speed + c.value;
        events.push({ type: 'buff', kind: 'spd', amount: c.value, targetIds: [sm.id], rounds: c.durationRounds || 2 });
      }
    }

    syncSpeeds();
    finishIfWon(events);
    syncPiles();
    b.events = events;
  }

  /**
   * An evolved Siegeling fights with its OWN cards. This used to be skipped —
   * the comment said the lesson was "what evolving is" — and the result was a
   * board showing Chilldoe while the hand still held a card labelled Fawny,
   * which reads as a bug rather than a simplification. Every card this unit
   * owns, in hand, draw pile and discard, is rebuilt from the evolved form's
   * moves; a card mid-flight keeps its instanceId so the DOM node it is
   * animating survives the swap.
   */
  function swapCardsForEvolution(unit, evo) {
    var b = M.battle;
    var moves = (evo.moves && evo.moves.length) ? evo.moves : null;
    ['_hand', '_draw', '_discard'].forEach(function (pile) {
      b[pile] = (b[pile] || []).map(function (c) {
        if (!c || c.ownerId !== unit.id) return c;
        if (!moves) {
          // No evolved moveset baked: at least stop the card claiming the
          // pre-evolution owner.
          c.ownerName = evo.name;
          return c;
        }
        var m = moves[cardSlotOf(c)] || moves[0];
        return {
          instanceId: c.instanceId, ownerId: unit.id, ownerName: evo.name,
          name: m.name, element: m.element, effect: m.effect, value: m.value,
          actionCost: m.actionCost, target: m.target, description: m.description,
          status: m.status, statusChance: m.statusChance, durationRounds: m.durationRounds
        };
      });
    });
    unit.cards = moves ? moves.slice() : unit.cards;
  }

  /** Deck cards are built one per move and tagged "<tag>-<i>", so the trailing
   *  index says which of its owner's moves a card came from. */
  function cardSlotOf(c) {
    var m = /-(\d+)$/.exec(String(c.instanceId || ''));
    return m ? Number(m[1]) : 0;
  }

  /* Squire Bob is a Marshal, so his Ultimate is Muster the Line: it evolves
   * Siegelings on the spot. The tutorial plays the real evolve event and takes
   * the evolved form's name, art, stats and cards, as a real run does. */
  function useUltimate() {
    var b = M.battle;
    if (!b || b.knight.charge < b.knight.ultCost) { M.error = 'The Ultimate is not charged yet.'; return; }
    b.knight.charge = 0;
    flags.ulted = true;
    var events = [{ type: 'ultimate', name: M.knight.ultimateName, element: M.knight.element }];
    var evolved = 0;
    livingAllies().forEach(function (a) {
      var evo = EVOLUTIONS[a.sourceCardId];
      if (!evo || evolved >= 2 || a.evoStage > 0) return;
      evolved++;
      var was = a.name;
      a.name = evo.name;
      a.sourceCardId = evo.id;
      a.artUrl = evo.artUrl;
      a.maxHp = evo.hp;
      a.hp = evo.hp;
      a.speed = evo.speed;
      a.effectiveSpeed = evo.speed + (a.speedBuffTimed || 0);
      a.evoStage = 1;
      a.hasEvolution = false;
      a.evoGauge = 0;
      a.evoReady = false;
      a.evolvesTo = null;
      events.push({
        type: 'evolve', targetId: a.id, from: was, to: evo.name,
        element: a.element, vitals: vitalsOf([a.id])
      });
      swapCardsForEvolution(a, evo);
      logLine(was + ' evolves into ' + evo.name + '!');
      // Deliberately NOT written back to M.party: evolution lasts the battle
      // and no longer (SiegeCombatEngine#clearBattleBuffs). An equipped
      // Evolution Sigil is what re-applies it at the start of every fight.
    });
    if (!evolved) {
      logLine(M.knight.name + ' calls the muster, but no Siegeling can evolve.');
    }
    syncSpeeds();
    finishIfWon(events);
    syncPiles();
    b.events = events;
  }

  function endTurn() {
    var b = M.battle;
    if (!b || b.phase !== 'PLAYER_INPUT') return;
    var events = [];
    b.knight.charge = Math.min(b.knight.ultCost, b.knight.charge + b.actionPoints);
    if (b.actionPoints > 0) {
      events.push({ type: 'apCharge', amount: b.actionPoints, total: b.knight.charge });
    }

    advanceAdvantage(events, 'PLAYER');

    livingFoes().forEach(function (f) {
      if (!f.intent) return;
      var mark = null;
      livingAllies().forEach(function (a) { if (a.position === f.intent.position) mark = a; });
      if (!mark) mark = livingAllies()[0];
      events.push({ type: 'enemyAct', sourceId: f.id, name: f.intent.name, element: f.element });
      if (mark) {
        damage(mark, f.intent.value, events, f.id, f.element);
        logLine(f.name + ' hits ' + mark.name + ' for ' + f.intent.value + '.');
        triggerAdvantage(f, {
          element: f.element, target: 'ENEMY_SINGLE'
        }, [mark], events);
      }
    });

    advanceAdvantage(events, 'ENEMY');

    // End-of-round damage-over-time on whatever is still standing.
    livingFoes().concat(livingAllies()).forEach(function (u) {
      ['BURN', 'POISON'].forEach(function (s) {
        if ((u.statuses || []).indexOf(s) < 0 || !u.alive) return;
        u.hp = Math.max(0, u.hp - 1);
        if (u.hp <= 0) u.alive = false;
        events.push({ type: s.toLowerCase(), targetId: u.id, amount: 1, vitals: vitalsOf([u.id]) });
      });
    });

    if (!livingAllies().length) {
      b.phase = 'LOST';
      b.events = events;
      syncPiles();
      return;
    }
    if (!livingFoes().length) {
      finishIfWon(events);
      syncPiles();
      b.events = events;
      return;
    }

    b.roundNumber++;
    b.actionPoints = MAX_AP;
    b.knight.charge = Math.min(b.knight.ultCost, b.knight.charge + 1);   // the Knight steels
    // Round 2 always opens with a charged Ultimate: a tutorial that cannot
    // demonstrate the button is not teaching it. With the real accrual above a
    // player who banked their AP is already there; this only tops up one who
    // spent it all.
    if (b.roundNumber === 2 && b.knight.charge < b.knight.ultCost) {
      b.knight.charge = b.knight.ultCost;
    }
    b._discard = b._discard.concat(b._hand);
    b._hand = [];
    events.push({ type: 'discardHand' });
    drawTo(HAND_MAX);
    shuffleIntents();
    syncSpeeds();
    events.push({
      type: 'round', round: b.roundNumber, playerSpeed: b.playerSpeed,
      enemySpeed: b.enemySpeed, playerFirst: b.playerActsFirst
    });
    syncPiles();
    b.events = events;
  }

  function finishIfWon(events) {
    var b = M.battle;
    if (livingFoes().length) return;
    b.phase = 'WON';
    logLine('The Ruined Gate is clear!');
    events.push({ type: 'loot', name: '48 gold recovered' });
  }

  /** Battle over → XP, a level-up pick, spoils, and a Siegeling asking to join. */
  function battleSpoils() {
    // Battle over: the party keeps its base form and carries the damage home,
    // exactly as clearBattleBuffs does — evolution does not survive the fight.
    if (M.battle) {
      M.battle.allies.forEach(function (a) {
        M.party.forEach(function (p) {
          if (p.id !== a.id) return;
          p.hp = Math.min(p.maxHp, a.hp);
          p.alive = a.alive;
        });
      });
    }
    M.battle = null;
    M.gold += 48;
    M.stats.goldEarned += 48;
    M.stats.enemiesDefeated += 2;
    M.stats.nodesCleared += 1;
    markCleared(0);

    var lead = M.party[0];
    M.party.forEach(function (p) { p.xp += 30; });
    lead.level = 2;
    lead.leveledThisBattle = true;
    lead.maxHp += 4;
    lead.hp = lead.maxHp;

    M.xpRecap = {
      totalAwarded: 60,
      units: M.party.map(function (p) {
        return {
          id: p.id, name: p.name, element: p.element, xpGained: 30,
          levelBefore: 1, levelAfter: p.level, leveledUp: !!p.leveledThisBattle
        };
      }),
      levelUps: [{ name: lead.name, levelAfter: 2 }]
    };

    var move = (lead.cards || [])[0] || { name: 'Strike', value: 5, actionCost: 0 };
    var move2 = (lead.cards || [])[1] || move;
    M.ampChoice = {
      unitId: lead.id, unitName: lead.name, element: lead.element,
      artUrl: lead.artUrl, level: 2, levelBefore: 1, hpGained: 4, maxHp: lead.maxHp,
      options: [
        { id: 'amp-power', moveName: move.name, kind: 'VALUE', label: '+2 power', element: lead.element, desc: move.name + ' bites harder every time it is played.', beforeValue: move.value, afterValue: move.value + 2, beforeCost: move.actionCost, afterCost: move.actionCost, riderValue: 0 },
        { id: 'amp-cost', moveName: move2.name, kind: 'COST', label: '−1 AP', element: lead.element, desc: move2.name + ' becomes cheaper to hold up.', beforeValue: move2.value, afterValue: move2.value, beforeCost: move2.actionCost + 1, afterCost: move2.actionCost, riderValue: 0 },
        { id: 'amp-heal', moveName: move.name, kind: 'SWAP_HEAL', label: 'Heals on arrival', element: lead.element, desc: move.name + ' also heals ' + lead.name + ' for 2.', beforeValue: move.value, afterValue: move.value, beforeCost: move.actionCost, afterCost: move.actionCost, riderValue: 2 }
      ]
    };

    M.pendingRewards = [
      { id: 'rw-item', kind: 'ITEM', title: 'Emberheart Charm', desc: 'Equip to a Siegeling: +2 attack for the run.', element: 'FIRE', artUrl: null, itemId: 'tut-charm', itemIcon: '🔥' },
      { id: 'rw-card', kind: 'CARD', title: 'Second ' + move.name, desc: 'A second copy of ' + move.name + ' for the deck.', element: lead.element, artUrl: null, cardEffect: 'DAMAGE', cardValue: move.value, cardCost: move.actionCost, cardTarget: 'ENEMY_SINGLE' },
      { id: 'rw-heal', kind: 'UPGRADE', title: 'Warband Tonic', desc: 'Heal every Siegeling to full.', element: 'WATER', artUrl: null }
    ];

    var joiner = card('applehead');
    M.recruit = {
      id: joiner.id, name: joiner.name, element: joiner.element, stage: 2,
      hp: joiner.hp, speed: joiner.speed, moveCount: (joiner.moves || []).length,
      artUrl: joiner.artUrl || null
    };
    M.lastReward = 'Victory at the Ruined Gate — 48 gold.';
  }

  function claimRecruit() {
    var r = M.recruit;
    M.recruit = null;
    if (!r) return;
    var src = card(r.id);
    var joined = unitFrom(src, { id: 'ally-' + src.id, position: M.party.length });
    M.party.push(joined);
    M.deckTemplates = M.deckTemplates.concat(deckCardsFor(joined.id, joined.name, src.moves, 'j'));
    refreshDeckList();
    flags.claimed = true;
  }

  function markCleared(nodeId) {
    var n = nodeById(nodeId);
    if (n) n.cleared = true;
  }

  /** Reachability mirrors SiegeRun#reachableNodeIds: nothing is open mid-stop. */
  function refreshReachable() {
    var busy = M.battle || M.camp || M.cache || M.broker || M.smith || M.caravan ||
      M.event || M.rift || M.recruit || M.ampChoice || (M.pendingRewards && M.pendingRewards.length);
    var current = null;
    M.map.forEach(function (n) {
      n.current = n.id === M.currentNodeId;
      if (n.current) current = n;
    });
    var open = busy ? [] : (current ? current.next : [0]);
    M.map.forEach(function (n) { n.reachable = open.indexOf(n.id) >= 0 && !n.cleared; });
  }

  // ---- stops --------------------------------------------------------------

  function campOpt(id, kind, title, desc, cost, itm) {
    var o = {
      id: id, kind: kind, title: title, desc: desc, cost: cost, element: null,
      artUrl: null, used: false, affordable: true, templateIndex: -1
    };
    if (itm) o.item = itm;
    return o;
  }

  function openStop(nodeId) {
    M.currentNodeId = nodeId;
    var node = nodeById(nodeId);
    if (!node) return;
    M.lastReward = '';
    var lead = M.party[0];
    if (node.type === 'BATTLE') { startBattle(); return; }
    if (node.type === 'REST') {
      M.camp = {
        note: 'A banked fire, a trader, and a broker share the clearing.',
        options: [
          campOpt('camp-rest', 'REST', 'Rest by the fire', 'Heal every Siegeling for 12 HP.', 0),
          campOpt('camp-upgrade', 'SHOP_UPGRADE', 'Whetstone', lead.name + "'s " + ((lead.cards || [])[0] || {}).name + ': +2 power.', 25),
          campOpt('camp-card', 'SHOP_CARD', 'Guard Stance', 'Add a 5-shield card to the deck.', 30)
        ]
      };
      return;
    }
    if (node.type === 'CARAVAN') {
      M.caravan = {
        options: [
          campOpt('cv-item', 'SHOP_ITEM', 'Ironbark Ward', 'Equip: +4 max HP for the run.', 35, item('tut-ward', 'Ironbark Ward', '🪵', 'HEALTH', 4, '+4 max HP', 'Field equipment.')),
          campOpt('cv-card', 'SHOP_CARD', 'Emberflask', 'FIRE · 8 damage · 2 AP.', 45),
          campOpt('cv-heal', 'SHOP_HEAL', 'Hot Rations', 'Heal the warband 8 HP each.', 20)
        ]
      };
      return;
    }
    if (node.type === 'BROKER') {
      var mercSrc = card('shellpack');
      var hireSrc = card('monkwatt');
      M.broker = {
        hireCost: 60, swapCost: 45, merc: false, mercUnderContract: !!M.mercenary, partyFull: false,
        offers: [
          {
            id: 'br-merc', kind: 'MERC', merc: true, cost: 40, name: mercSrc.name,
            element: mercSrc.element, artUrl: mercSrc.artUrl || null, used: false,
            hp: mercSrc.hp, speed: mercSrc.speed, evolves: !!mercSrc.evolves, moves: mercSrc.moves
          },
          {
            id: 'br-hire', kind: 'HIRE', merc: false, cost: 60, name: hireSrc.name,
            element: hireSrc.element, artUrl: hireSrc.artUrl || null, used: false,
            hp: hireSrc.hp, speed: hireSrc.speed, evolves: !!hireSrc.evolves, moves: hireSrc.moves
          }
        ]
      };
      return;
    }
    if (node.type === 'SMITH') {
      var cards = M.deckTemplates;
      M.smith = {
        options: [0, 1, 2].map(function (i) {
          var c = cards[i % cards.length];
          return campOpt('sm-' + i, 'UPGRADE', 'Chisel ' + c.name,
            c.name + ' → ' + c.name + '+ (power ' + c.value + ' → ' + (c.value + 3) + ')', 0);
        })
      };
      return;
    }
    if (node.type === 'TREASURE') {
      M.cache = { game: 'DIG', options: [], loot: 0, digs: 0, maxDigs: 4, bustChance: 15 };
      return;
    }
    if (node.type === 'RIFT') {
      M.rift = { open: true };
      return;
    }
    if (node.type === 'EVENT') {
      M.event = {
        title: 'The Standing Stone', icon: '🗿',
        prompt: 'A humming monolith offers a bargain: strength for blood, or coin for nothing.',
        // Action only, no outcome — the same payload the real server now sends,
        // so the tutorial teaches the rule it demonstrates.
        options: [
          campOpt('ev-power', 'EVENT_CHOICE', 'Touch the stone', '', 0),
          campOpt('ev-gold', 'EVENT_CHOICE', 'Pry loose a shard', '', 0),
          campOpt('ev-leave', 'EVENT_CHOICE', 'Leave it alone', '', 0)
        ]
      };
      return;
    }
    if (node.type === 'BOSS') {
      markCleared(nodeId);
      flags.reachedBoss = true;
      M.lastReward = 'Tutorial complete — a real expedition would fight the Siegelord here.';
    }
  }

  function markOptionUsed(list, optionId) {
    var found = null;
    (list || []).forEach(function (o) { if (o.id === optionId) { o.used = true; found = o; } });
    return found;
  }
  function healParty(amount) {
    M.party.forEach(function (p) {
      if (!p.alive) return;
      p.hp = Math.min(p.maxHp, p.hp + amount);
    });
  }
  function spend(cost) {
    M.gold = Math.max(0, M.gold - (cost || 0));
    ['camp', 'caravan', 'smith', 'event', 'cache'].forEach(function (k) {
      var stop = M[k];
      if (stop && stop.options) {
        stop.options.forEach(function (o) { o.affordable = M.gold >= (o.cost || 0); });
      }
    });
  }
  function clearStop(key) {
    M[key] = null;
    markCleared(M.currentNodeId);
    M.stats.nodesCleared++;
  }
  function addCard(c) {
    M.deckTemplates.push(c);
    refreshDeckList();
  }

  // ---- the fake server ----------------------------------------------------

  function respond(path, body) {
    body = body || {};
    M.error = null;
    handle(path, body);
    refreshReachable();
    var out = clone(M);
    if (M.error) out.error = M.error;
    if (M.battle) M.battle.events = [];   // events are delivered exactly once
    return Promise.resolve(out);
  }

  function handle(path, body) {
    var lead = M.party[0];
    switch (path) {
      case '/api/siege/node/enter':
        openStop(Number(body.nodeId));
        return;

      case '/api/siege/battle/play': playCard(body.cardId, body.targetId); return;
      case '/api/siege/battle/end-turn': endTurn(); return;
      case '/api/siege/battle/ultimate': useUltimate(); return;
      case '/api/siege/continue': battleSpoils(); return;
      case '/api/siege/recruit/ack': claimRecruit(); return;

      case '/api/siege/level/amp':
        if (M.ampChoice && body.optionId !== 'skip') {
          M.lastReward = M.ampChoice.unitName + ' amplified a card.';
        }
        M.ampChoice = null;
        return;

      case '/api/siege/reward/choose': {
        var pick = null;
        (M.pendingRewards || []).forEach(function (r) { if (r.id === body.optionId) pick = r; });
        if (pick) {
          if (pick.kind === 'ITEM') {
            M.inventory.push(item('tut-charm', 'Emberheart Charm', '🔥', 'ATTACK', 2, '+2 attack', 'Run-long equipment for one Siegeling.'));
          } else if (pick.kind === 'CARD') {
            var base = (lead.cards || [])[0] || {};
            addCard({
              instanceId: 'rw-0', ownerId: lead.id, ownerName: lead.name,
              name: base.name || 'Strike', element: base.element || lead.element,
              effect: 'DAMAGE', value: base.value || 5, actionCost: base.actionCost || 0,
              target: 'ENEMY_SINGLE', description: base.description || 'Strike one foe.'
            });
          } else healParty(999);
          M.lastReward = pick.title + ' taken.';
          flags.rewarded = true;
        }
        M.pendingRewards = [];
        return;
      }

      case '/api/siege/camp/choose': {
        var copt = markOptionUsed(M.camp && M.camp.options, body.optionId);
        if (!copt) return;
        spend(copt.cost);
        if (copt.kind === 'REST') { healParty(12); M.lastReward = 'The warband rests. +12 HP each.'; }
        else if (copt.kind === 'SHOP_CARD') {
          addCard({
            instanceId: 'camp-0', ownerId: lead.id, ownerName: lead.name, name: 'Guard Stance',
            element: 'NEUTRAL', effect: 'SHIELD', value: 5, actionCost: 1, target: 'SELF',
            description: 'Gain 5 shield.'
          });
          M.lastReward = 'Guard Stance joins the deck.';
        } else M.lastReward = 'The whetstone bites. +2 power.';
        flags.camped = true;
        return;
      }
      case '/api/siege/camp/leave': clearStop('camp'); return;

      case '/api/siege/caravan/buy': {
        var vopt = markOptionUsed(M.caravan && M.caravan.options, body.optionId);
        if (!vopt) return;
        spend(vopt.cost);
        if (vopt.kind === 'SHOP_ITEM') {
          M.inventory.push(item('tut-ward', 'Ironbark Ward', '🪵', 'HEALTH', 4, '+4 max HP', 'Field equipment.'));
          M.lastReward = 'Ironbark Ward stowed in the backpack.';
        } else if (vopt.kind === 'SHOP_CARD') {
          addCard({
            instanceId: 'cv-0', ownerId: lead.id, ownerName: lead.name, name: 'Emberflask',
            element: 'FIRE', effect: 'DAMAGE', value: 8, actionCost: 2, target: 'ENEMY_SINGLE',
            description: 'Strike one foe for 8.'
          });
          M.lastReward = 'Emberflask joins the deck.';
        } else { healParty(8); M.lastReward = 'Hot rations all round. +8 HP each.'; }
        flags.bought = true;
        return;
      }
      case '/api/siege/caravan/leave': clearStop('caravan'); return;

      case '/api/siege/broker/hire': {
        var offer = null;
        (M.broker.offers || []).forEach(function (o) { if (o.id === body.optionId) offer = o; });
        if (!offer) return;
        spend(offer.cost);
        offer.used = true;
        var src = card(offer.kind === 'MERC' ? 'shellpack' : 'monkwatt');
        if (offer.kind === 'MERC') {
          M.broker.mercUnderContract = true;
          M.mercenary = unitFrom(src, { id: 'merc-' + src.id, position: 3 });
          M.mercenary.name = src.name + ' (Merc)';
          M.mercenary.merc = true;
          M.lastReward = src.name + ' rides with you for the next battle.';
        } else {
          var hired = unitFrom(src, { id: 'ally-' + src.id, position: M.party.length });
          M.party.push(hired);
          M.deckTemplates = M.deckTemplates.concat(deckCardsFor(hired.id, hired.name, src.moves, 'h'));
          refreshDeckList();
          M.lastReward = src.name + ' joins the warband.';
        }
        flags.rented = true;
        return;
      }
      case '/api/siege/broker/leave': clearStop('broker'); return;

      case '/api/siege/smith/choose': {
        var sopt = markOptionUsed(M.smith && M.smith.options, body.optionId);
        clearStop('smith');
        M.lastReward = sopt ? (sopt.title.replace('Chisel ', '') + ' is awakened.') : 'A card was scrapped.';
        flags.smithed = true;
        return;
      }
      case '/api/siege/smith/leave': clearStop('smith'); return;

      case '/api/siege/cache/dig':
        M.cache.digs++;
        M.cache.loot += 22;
        M.cache.bustChance = Math.min(85, 15 + M.cache.digs * 20);
        M.lastReward = 'You pry loose another 22 gold. The shaft groans.';
        flags.dug++;
        return;
      case '/api/siege/cache/take':
        M.gold += M.cache.loot;
        M.stats.goldEarned += M.cache.loot;
        M.lastReward = 'Banked ' + M.cache.loot + ' gold.';
        clearStop('cache');
        return;
      case '/api/siege/cache/choose': clearStop('cache'); return;

      case '/api/siege/rift/cross': {
        // Deterministic destination so the lesson names a Land the banner will show.
        var frost = {
          id: 'ice', name: 'Frostveil', kind: 'ELEMENTAL', elements: ['ICE'],
          background: '/img/lands/ice.webp', feature: 'Frost Shelter', featureType: 'REST',
          terrain: 'Glacial cover', effect: 'ICE Siegelings start battles with +5 Shield.',
          encounters: 'Favored Siegelings have 4× draw weight in recruits, broker stock and card prizes.',
          eventTitle: 'The Frozen Waystation'
        };
        M.land = frost;
        M.landHistory = (M.landHistory || []).concat([frost]);
        M.lastReward = 'The Rift closes. You stand in Frostveil.';
        flags.rifted = true;
        clearStop('rift');
        return;
      }
      case '/api/siege/rift/pass': {
        var stay = (M.land && M.land.name) || 'this Land';
        M.lastReward = 'You travel past the Rift. ' + stay + ' still holds.';
        flags.rifted = true;
        clearStop('rift');
        return;
      }

      case '/api/siege/event/choose': {
        var eopt = null;
        (M.event.options || []).forEach(function (o) { if (o.id === body.optionId) eopt = o; });
        if (eopt && eopt.id === 'ev-power') {
          M.party.forEach(function (p) { p.hp = Math.max(1, p.hp - 4); p.attackBuff += 1; });
          M.lastReward = 'The stone drinks. Your warband hits harder.';
        } else if (eopt && eopt.id === 'ev-gold') {
          M.gold += 30;
          M.stats.goldEarned += 30;
          M.lastReward = 'A shard of the monolith is worth 30 gold.';
        } else {
          M.lastReward = 'You leave the stone humming behind you.';
        }
        clearStop('event');
        return;
      }

      case '/api/siege/item/equip': {
        var eq = null, rest = [];
        M.inventory.forEach(function (it) { if (!eq && it.id === body.itemId) eq = it; else rest.push(it); });
        if (!eq) return;
        M.inventory = rest;
        M.party.forEach(function (p) {
          if (p.id !== body.memberId) return;
          if (p.item) M.inventory.push(p.item);
          p.item = eq;
          p.itemId = eq.id;
          if (eq.kind === 'ATTACK') p.attackBuff += eq.value;
          if (eq.kind === 'HEALTH') { p.maxHp += eq.value; p.hp += eq.value; }
        });
        flags.equipped = true;
        return;
      }
      case '/api/siege/item/unequip':
        M.party.forEach(function (p) {
          if (p.id !== body.memberId || !p.item) return;
          if (p.item.kind === 'ATTACK') p.attackBuff -= p.item.value;
          if (p.item.kind === 'HEALTH') { p.maxHp -= p.item.value; p.hp = Math.min(p.hp, p.maxHp); }
          M.inventory.push(p.item);
          p.item = null;
          p.itemId = null;
        });
        return;
      case '/api/siege/knight/use': {
        var target = null;
        M.party.forEach(function (p) { if (p.id === body.targetId) target = p; });
        if (M.battle) {
          M.battle.allies.forEach(function (a) { if (a.id === body.targetId) target = a; });
          if (M.battle.knight.id === body.targetId) target = M.battle.knight;
        }
        if (target) target.hp = Math.min(target.maxHp, target.hp + 6);
        M.knightBag = M.knightBag.filter(function (it) { return it.id !== body.itemId; });
        M.lastReward = 'Field Tonic used.';
        return;
      }

      case '/api/siege/result/ack': M.lastReward = ''; return;
      case '/api/siege/run/save': M.checkpoint = true; return;
      default: return;
    }
  }

  // ---- the coach script ---------------------------------------------------

  /* Which lane of a fork to teach next. The screen the player actually landed
   * on wins; when they clicked the tip through instead of travelling, fall back
   * to whichever lane the coach has not shown yet — routing on "did the action
   * happen" instead would loop forever on a click-through. */
  function lane1() {
    visited = window.TutorialCoach.visited();
    if (screenIs('campScreen')) return 'camp-a';
    if (screenIs('caravanScreen')) return 'caravan-a';
    return visited['camp-a'] ? 'caravan-a' : 'camp-a';
  }
  function lane2() {
    visited = window.TutorialCoach.visited();
    if (screenIs('brokerScreen')) return 'broker-a';
    if (screenIs('smithScreen')) return 'smith-a';
    return visited['broker-a'] ? 'smith-a' : 'broker-a';
  }
  function lane3() {
    visited = window.TutorialCoach.visited();
    if (screenIs('cacheScreen')) return 'cache-a';
    if (screenIs('riftScreen')) return 'rift-a';
    return visited['cache-a'] ? 'rift-a' : 'cache-a';
  }

  function leadName() { return M.party[0] ? M.party[0].name : 'your Siegeling'; }
  function knightName() { return M.knight.name; }

  function buildSteps() {
    var k = M.knight;
    return [
      { id: 'welcome', kicker: 'Tutorial', title: 'Welcome to the Siege',
        body: 'A full practice expedition, fought with real cards — ' + esc(knightName()) +
          ' leading ' + esc(M.party[0].name) + ' and ' + esc(M.party[1].name) +
          '. Nothing here touches your account: no gold spent, no saves written. I will walk you to every kind of stop on the map.' },
      { id: 'land', kicker: 'Lands', title: 'Every stage has a Land', target: '#mapLand',
        body: 'The banner names your current <b>Land</b>, and the painted terrain behind the route belongs to it. This practice stage is <b>' + esc(M.land.name) + '</b>, a Fire Land.' +
          '<span class="tut-p">A Land changes which Siegelings, people, events and map stops you are more likely to find.</span>' },
      { id: 'land-open', hint: 'Tap <b>Details ↗</b>', title: 'Read the Land before choosing a path', target: '#mapLand',
        body: 'Every Land also changes combat or rewards. Tap the <b>' + esc(M.land.name) + '</b> banner to open its rules.',
        until: function () { return !hidden('landModal'); } },
      { id: 'land-rules', hint: 'Tap <b>Close</b>', title: 'Terrain, encounters and landmarks', target: '.land-modal-card', avoid: '#landClose',
        body: '<b>Terrain</b> is the battle bonus. <b>Encounters & discoveries</b> tells you which elements are favored. The final section names this Land’s special map feature and event. Close the panel when you are ready.',
        until: function () { return hidden('landModal'); } },
      { id: 'land-change', title: 'Bosses — and Rifts — lead to new Lands', target: '#mapLand',
        body: 'Defeat a Land’s boss and the next stage rolls a <b>different Land</b>. Later bosses can reveal <b>Rare Lands</b> with mixed elements or richer drops — or the <b>Badlands</b>, where enemies are stronger and you choose a special boon for the run.' +
          '<span class="tut-p">A rare <b>🌀 Rift</b> on the map can also tear you into another Land mid-run — or you can travel past and stay put. Stepping through lands you somewhere random.</span>' },
      // Naming BOTH readings rather than the current one: the map genuinely
      // transposes (adventure.js isPhoneLandscape -> "start left, boss right"),
      // and a step's body is built once, so a tip that named only the live
      // orientation would be wrong the moment the player rotated mid-step.
      { id: 'map', title: 'The expedition map', target: '#mapSvg',
        body: 'A Siege run is a branching path: read it <b>bottom to top</b> in portrait, or <b>left to right</b> in landscape — either way you start at the near end and the boss waits at the far one.' +
          '<span class="tut-p">You travel one node at a time, and every node you clear is gone for good — the route you pick <em>is</em> the run.</span>' },
      { id: 'key', hint: 'Tap <b>🗝️ Key</b>', title: 'What the emblems mean', target: '#mapKeyBtn',
        body: 'Each node type has its own emblem. Tap <b>🗝️ Key</b> to read them.',
        until: function () { return !hidden('legendOverlay'); } },
      { id: 'key-read', hint: 'Close the key with <b>✕</b>', title: 'Read the key', target: '.legend-panel', avoid: '#legendClose',
        body: 'Fights, camps, caches, Rifts, shops and the Siegelord all live on this list, along with what the ring around a node means. Close it with the ✕ when you are done.',
        until: function () { return hidden('legendOverlay'); } },
      { id: 'warband', hint: 'Tap a <b>Siegeling</b>', title: 'Your warband', target: '#partyStrip',
        body: esc(knightName()) + ' is a <b>' + esc(k.passiveName) + '</b>: ' + esc(k.passive) +
          ' That is why two Siegelings stand with him. <b>Tap one</b> to read its cards.',
        until: function () { return !hidden('unitModal'); } },
      { id: 'warband-cards', hint: 'Close with <b>✕</b>', title: 'Cards come from Siegelings', target: '#unitModalCard', avoid: '#unitModalClose',
        body: 'These are the moves this Siegeling puts into the shared deck. Lose the Siegeling and its cards go dead — protecting your line is protecting your hand. Close this with the ✕ when you have looked.',
        until: function () { return hidden('unitModal'); } },
      { id: 'navigate', hint: 'Tap the <b>⚔️ Ruined Gate</b>', title: 'Navigate', target: '.map-node-g.reachable', highlight: ['.map-node-g.reachable'],
        body: 'A pulsing ring means you can travel there. <b>Tap the ⚔️ Ruined Gate</b> to start the first fight.',
        until: function () { return screenIs('battleScreen'); } },

      { id: 'speed', title: 'Who moves first', target: '#speedTrack',
        body: '<b>Team Speed</b> is every living Siegeling\'s Speed added together; the higher team takes the first turn each round. The <b>Advantage</b> token is separate: it cycles through every Siegeling, fastest to slowest. A holder keeps it until their team completes a turn, so every Siegeling gets to use it; then it passes to the next holder. Every card owned by the active holder gains its elemental rider.' +
          '<span class="tut-p"><b>Advantage key</b> · Ally = friendly target · Foe = enemy target</span>' +
          '<span class="tut-adv-key">' +
            '<span>🔥 <b>Fire</b> Ally +1 ATK · Foe +2 dmg</span>' +
            '<span>🪨 <b>Earth</b> Ally +4 shield · Foe Slow</span>' +
            '<span>🌪️ <b>Wind</b> Ally +1 AP · Foe Shock</span>' +
            '<span>💧 <b>Water</b> Ally +3 heal · Foe holder heals 2</span>' +
            '<span>❄️ <b>Ice</b> Ally +3 shield · Foe Slow→Stun</span>' +
            '<span>⚡ <b>Electric</b> Ally +1 Ult · Foe Arc 2</span>' +
            '<span>⚙️ <b>Metal</b> Ally +5 shield · Foe break 4 / 1 dmg</span>' +
            '<span>🌑 <b>Shadow</b> Ally heal/shield 2 · Foe drain 2</span>' +
            '<span>💀 <b>Undead</b> Below half: Ally heal 3 · Foe +3 dmg</span>' +
            '<span>🔮 <b>Psychic</b> Ally draw 1 · Foe Shock</span>' +
          '</span>' },
      // The step used to say "tap the plate to read both" and then walk on, so
      // the sheet it was describing never opened and the two effects it named
      // were never seen. It waits for the tap now, and the lesson that explains
      // them rings the effect cards themselves.
      { id: 'passive', hint: 'Tap your <b>SiegeKnight</b>', title: 'Passive and Ultimate', target: '#knightPlate',
        body: 'Your SiegeKnight does not attack. He gives a <b>passive</b> that is always running, and charges an <b>Ultimate</b> on the bar under his HP. <b>Tap the plate</b> to read both.',
        until: function () { return !hidden('unitModal'); } },
      // Title is NOT esc()'d — the coach escapes titles itself, so a name with
      // an apostrophe would come out as an entity.
      { id: 'passive-cards', hint: 'Close with <b>✕</b>', title: knightName() + '’s two effects',
        // Ring the effect cards, not the whole sheet: the sheet also lists his
        // own cards, and the lesson is about the two above them.
        target: '.um-effects', highlight: ['.um-effects'], avoid: '#unitModalClose',
        body: 'Under <b>Active effects</b> sit the two. <b>' + esc(k.passiveName) + '</b> is the <b>passive</b> — ' +
          esc(k.passive) + ' It costs nothing and never runs out. <b>' + esc(k.ultimateName) +
          '</b> is the <b>Ultimate</b>: it fills the charge bar as the fight goes on, and once full it ' +
          esc(String(k.ultimateDesc || '').charAt(0).toLowerCase() + String(k.ultimateDesc || '').slice(1)) +
          ' Close this with the ✕ when you have read them.',
        until: function () { return hidden('unitModal'); } },
      { id: 'ap', title: 'Action Points', target: '#apDisplay',
        body: 'You get ' + MAX_AP + ' AP a turn, and a card costs whatever is printed in its corner. AP does not carry over — but it is never wasted either, and the next steps show where it goes.' },
      { id: 'hand', title: 'Your hand', target: '#handRow',
        body: 'The fan is your hand. Each card belongs to one Siegeling — its owner is the one who swings, so buffs on that Siegeling change what the card does.' },
      { id: 'intents', title: 'Foes telegraph their attacks', target: '#enemyRow',
        body: 'These are corrupted Siegelings — <b>shades</b>. Each shows its <b>intent</b>: the move it will use and the notch it will hit. A ▼ over one of your Siegelings means that blow is aimed at it — heal it, or kill the attacker first.' },
      { id: 'targeting', hint: 'Drag an attack card <b>onto a foe</b>', title: 'Targeting', target: '#handRow', highlight: ['#handRow', '#enemyRow', '#allyRow'],
        body: '<b>Drag an attack card onto a foe</b> to play it. Cards that need a target draw an arrow while you drag; drop it on the enemy you want.',
        until: settled(function () { return flags.played > 0; }) },
      { id: 'endturn', hint: 'Tap <b>End Turn</b>', title: 'End the turn', target: '#endTurnBtn',
        body: 'Spend what is worth spending, then <b>End Turn</b>: the foes act on the intents they showed you, and a fresh hand is dealt.' +
          '<span class="tut-p">Watch <b>⚡ Charge</b> on the Knight\'s plate. It comes from three places — <b>unspent AP</b> at end of turn, <b>+1 every turn</b> whatever you do, and <b>+1 per Knight card</b>. Banking AP buys the Ultimate sooner.</span>',
        until: settled(function () { return M.battle && M.battle.roundNumber > 1; }) },
      { id: 'ultimate', hint: 'Tap <b>⚡ ULT!</b>', title: 'The Ultimate', target: '#knightUltBtn',
        body: 'The charge bar is full. <b>Tap ⚡ ULT!</b> — ' + esc(k.ultimateName) + ' ' +
          esc(String(k.ultimateDesc || '').charAt(0).toLowerCase() + String(k.ultimateDesc || '').slice(1)) +
          ' Watch your line when it lands.',
        until: settled(function () { return flags.ulted; }),
        skipIf: function () { return !M.battle; } },
      { id: 'evolved', title: 'Evolution', target: '#allyRow',
        body: 'An <b>evolution</b>: the next form, with more HP and a stronger kit. It holds <b>until this battle ends</b>, then reverts, keeping the damage it took.' +
          '<span class="tut-p">You normally earn it mid-fight by spending AP on that Siegeling until its 🌟 gauge fills — the Ultimate skips the wait. Equip an <b>Evolution Sigil</b> to have one start <em>every</em> battle evolved.</span>',
        skipIf: function () { return !flags.ulted; } },
      { id: 'finish', hint: 'Attack, <b>End Turn</b>, repeat', title: 'Finish the fight', nodim: true, target: '#handRow', highlight: ['#handRow', '#enemyRow', '#allyRow'],
        body: 'Play out the rest of the fight — attack, end turn, repeat — until both shades are down.',
        until: settled(function () { return !M.battle || M.battle.phase === 'WON'; }) },
      { id: 'spoils', hint: 'Tap <b>Claim Rewards</b>', title: 'Claim the spoils', target: '#handRow',
        body: 'Victory. Tap <b>Claim Rewards</b> to collect XP, gold and a pick.',
        until: function () { return !screenIs('battleScreen'); } },

      { id: 'recruit', hint: 'Tap <b>Claim</b>', title: 'Claiming a Siegeling', target: '#gachaClaimBtn',
        body: 'A wild Siegeling wants to join. Claiming it adds it to your warband <em>and</em> adds its moves to your shared deck. <b>Tap Claim</b>.',
        until: function () { return flags.claimed; },
        skipIf: function () { return !M.recruit && !flags.claimed; } },
      { id: 'levelup', hint: 'Pick a card to <b>amplify</b>', title: 'Level up', target: '#ampGrid',
        body: 'Siegelings earn XP from every fight. A level restores health, adds max HP, and lets that Siegeling <b>amplify one of its own cards</b> permanently. <b>Pick one.</b>',
        until: function () { return !M.ampChoice; },
        skipIf: function () { return !M.ampChoice; } },
      { id: 'reward', hint: 'Take the <b>Emberheart Charm</b>', title: 'Choose a reward', target: '#rewardGrid',
        body: 'Now the spoils: an item to equip, a new card, or a heal. <b>Take the Emberheart Charm</b> — we will equip it shortly.',
        until: function () { return flags.rewarded; },
        skipIf: function () { return !(M.pendingRewards && M.pendingRewards.length) && !flags.rewarded; } },

      // ---- first branch ----------------------------------------------------
      { id: 'branch-1', hint: 'Tap <b>either</b> node', title: 'The path forks', target: '#mapSvg',
        body: 'Two routes open out of the gate, and you may only walk one. <b>In this tutorial both lanes reach the same two stops in the opposite order</b>, so you will see everything either way — in a real run they hold different things, and choosing is the game. <b>Tap either node.</b>',
        until: function () { return screenIs('campScreen') || screenIs('caravanScreen'); } },
      { id: 'branch-1-route', route: function () { return lane1(); } },

      { id: 'camp-a', hint: 'Take the free <b>Rest</b>', title: 'Resting', target: '#campGrid',
        body: 'A camp gives one free <b>Rest</b> (healing the whole warband) plus a trader and a broker behind their own menus. Shopping does not spend the rest. <b>Take the rest.</b>',
        until: function () { return flags.camped; }, next: 'camp-b' },
      { id: 'camp-b', hint: 'Tap <b>Break Camp</b>', title: 'Break camp', target: '#campLeaveBtn',
        body: 'Browse the trader if you like, then <b>Break Camp</b> to return to the map.',
        until: function () { return screenIs('mapScreen'); }, next: 'stop-1-done' },

      { id: 'caravan-a', hint: 'Buy the <b>Ironbark Ward</b>', title: 'Purchasing', target: '#caravanGrid',
        body: 'The caravan is the run\'s shop. Gold buys <b>items</b> you equip to a Siegeling, <b>cards</b> that join the shared deck, and healing. <b>Buy the Ironbark Ward.</b>',
        until: function () { return flags.bought; }, next: 'caravan-b' },
      { id: 'caravan-b', hint: 'Tap <b>Move On</b>', title: 'Move on', target: '#caravanLeaveBtn',
        body: 'Bought goods go straight into the backpack. <b>Move On</b> when you are done shopping.',
        until: function () { return screenIs('mapScreen'); }, next: 'equip-a' },

      { id: 'equip-a', hint: 'Open <b>🎒 Items</b>', title: 'Equipping', target: '#inventoryBtn',
        body: 'Items do nothing in the backpack. Open <b>🎒 Items</b>.',
        until: function () { return !hidden('invOverlay'); }, next: 'equip-b' },
      { id: 'equip-b', hint: 'Tap an item, then a <b>Siegeling</b>', title: 'One item per Siegeling', target: '#invBag',
        highlight: ['#invBag', '#invParty'],
        body: '<b>Tap an item in the backpack, then tap a Siegeling</b> to equip it. Each Siegeling holds one item at a time; the ✕ on a filled slot returns it to the bag. The Knight\'s Bag above holds consumables you can use here or mid-battle.',
        until: function () { return flags.equipped; }, next: 'equip-c' },
      { id: 'equip-c', hint: 'Tap <b>✕</b> to close the bag', title: 'Close the bag', target: '#invClose',
        body: 'Equipped. Close the inventory to carry on.',
        until: function () { return hidden('invOverlay'); }, next: 'stop-1-done' },

      { id: 'stop-1-done', route: function () {
        return (visited['camp-a'] && visited['caravan-a']) ? 'branch-2' : 'other-lane-1';
      } },
      { id: 'other-lane-1', hint: 'Tap the <b>open node</b>', title: 'The other lane', target: '.map-node-g.reachable', highlight: ['.map-node-g.reachable'],
        body: 'This lane rejoins the other one — the stop ahead is the type you did not just visit. <b>Travel there.</b>',
        until: function () { return screenIs('campScreen') || screenIs('caravanScreen'); },
        next: 'other-lane-1-route' },
      { id: 'other-lane-1-route', route: function () { return lane1(); } },

      // ---- second branch ---------------------------------------------------
      { id: 'branch-2', hint: 'Pick <b>either</b> lane', title: 'Another fork', target: '#mapSvg',
        body: 'The path splits again, this time between a <b>🐾 broker</b> and a <b>🔨 smith</b>. Same deal: both lanes visit both, in opposite order. <b>Pick one.</b>',
        until: function () { return screenIs('brokerScreen') || screenIs('smithScreen'); } },
      { id: 'branch-2-route', route: function () { return lane2(); } },

      { id: 'broker-a', hint: 'Tap <b>Rent</b> on the mercenary', title: 'Renting', target: '#brokerGrid',
        body: 'The broker sells two different things. <b>Hire</b> adds a Siegeling to the warband permanently. <b>Rent</b> takes a mercenary who fights your <em>next battle only</em>, then leaves — cheap muscle for a fight you expect to be ugly. <b>Rent the mercenary.</b>',
        until: function () { return flags.rented; }, next: 'broker-b' },
      { id: 'broker-b', hint: 'Tap <b>Move On</b>', title: 'Move on', target: '#brokerLeaveBtn',
        body: 'Your rental now stands with the warband at every stop until its battle is fought. <b>Move On.</b>',
        until: function () { return screenIs('mapScreen'); }, next: 'stop-2-done' },

      { id: 'smith-a', hint: 'Pick an <b>upgrade</b>', title: 'Upgrading a card', target: '#smithGrid',
        body: 'The smith permanently awakens one card in your deck into a stronger form. You can also <b>Scrap a card</b> to thin the deck so your best cards come up more often. <b>Pick an upgrade.</b>',
        until: function () { return screenIs('mapScreen'); }, next: 'stop-2-done' },

      { id: 'stop-2-done', route: function () {
        return (visited['broker-a'] && visited['smith-a']) ? 'branch-3' : 'other-lane-2';
      } },
      { id: 'other-lane-2', hint: 'Tap the <b>open node</b>', title: 'The other lane', target: '.map-node-g.reachable', highlight: ['.map-node-g.reachable'],
        body: 'And this lane carries the stop you skipped. <b>Travel there.</b>',
        until: function () { return screenIs('brokerScreen') || screenIs('smithScreen'); },
        next: 'other-lane-2-route' },
      { id: 'other-lane-2-route', route: function () { return lane2(); } },

      // ---- cache / rift fork -----------------------------------------------
      { id: 'branch-3', hint: 'Pick <b>either</b> lane', title: 'Cache or Rift', target: '#mapSvg',
        body: 'The path splits one last time between a <b>💎 cache</b> and a rare <b>🌀 Rift</b>. Same deal as Merc Post → Ember Forge: each lane visits both, in opposite order — Buried Cache leads to a Rift, and the Rift leads to a Cache. <b>Pick one.</b>',
        until: function () { return screenIs('cacheScreen') || screenIs('riftScreen'); } },
      { id: 'branch-3-route', route: function () { return lane3(); } },

      { id: 'cache-a', hint: 'Tap <b>Dig Deeper</b>', title: 'Press your luck', target: '#cacheDigBtn',
        body: 'A cache is a gamble: every dig adds gold and raises the collapse risk on the bar. <b>Dig Deeper</b> once.',
        until: function () { return flags.dug > 0; }, next: 'cache-b' },
      { id: 'cache-b', hint: 'Tap <b>Bank the Loot</b>', title: 'Know when to stop', target: '#cacheTakeBtn',
        body: 'Loot is unbanked until you take it — a collapse costs you everything in the shaft. <b>Bank the Loot.</b>',
        until: function () { return screenIs('mapScreen'); }, next: 'stop-3-done' },

      { id: 'rift-a', hint: 'Tap <b>Step through the Rift</b>', title: 'A tear between Lands', target: '#riftCrossBtn',
        body: 'A Rift is rare. You can <b>step through</b> into a <b>random</b> new Land, or <b>travel past</b> and keep the one you are in. In a real run a cross can land elemental, Rare, or even the Badlands once bosses are behind you. <b>Step through</b> — this practice Rift opens onto <b>Frostveil</b>.',
        until: function () { return screenIs('mapScreen') && flags.rifted; }, next: 'stop-3-done' },

      { id: 'stop-3-done', route: function () {
        return (visited['cache-a'] && visited['rift-a']) ? 'event-a' : 'other-lane-3';
      } },
      { id: 'other-lane-3', hint: 'Tap the <b>open node</b>', title: 'The other stop', target: '.map-node-g.reachable', highlight: ['.map-node-g.reachable'],
        body: 'This lane carries the stop you have not visited yet — just like Ember Forge after Merc Post. <b>Travel there.</b>',
        until: function () { return screenIs('cacheScreen') || screenIs('riftScreen'); },
        next: 'other-lane-3-route' },
      { id: 'other-lane-3-route', route: function () { return lane3(); } },

      // ---- the shared tail --------------------------------------------------
      { id: 'event-a', hint: 'Travel to the <b>❔ stone</b>', title: 'Events', target: '.map-node-g.reachable', highlight: ['.map-node-g.reachable'],
        body: 'The lanes have rejoined. <b>Travel to the ❔ Standing Stone.</b>',
        until: function () { return screenIs('eventScreen'); } },
      { id: 'event-b', hint: 'Choose an <b>option</b>', title: 'Choices with a price', target: '#eventChoices',
        body: 'Events trade something for something: HP for power, safety for coin. A choice names only the <b>action</b> — never what it pays — so read the scene and commit. <b>Choose one.</b>',
        until: function () { return screenIs('mapScreen'); } },

      { id: 'boss', title: 'The Siegelord', target: '.map-node-g.type-BOSS',
        body: 'The 👑 node at the top of every stage is the Siegelord. Clearing it ends the stage — and in a real run, winning lets you <b>bank</b> the team you just leveled.' },
      { id: 'done', kicker: 'Tutorial complete', title: '🎉 Congratulations, Marshal', finish: true, finale: true,
        body: 'You have run the whole loop: travel, fight, spend, and arrive at the boss stronger than the map expected.' +
          '<span class="tut-p"><b>What it all builds toward.</b> Win an expedition and you can bank that warband as a <b>veteran team</b> — up to ten of them are kept. Once you hold <b>3 banked veterans</b>, they can march into <b>Battlegrounds</b>: five tiers, each unlocked by clearing the one below, paying <b>Warmarks</b> for its own shop. Lose there and the team is fatigued until its timer runs out, so Siege never stops being the place you rebuild.</span>' +
          '<span class="tut-p">Nothing you did here was saved. Start a real expedition whenever you are ready.</span>' }
    ];
  }

  // ---- the finale's first-time reward -------------------------------------

  // The first-time purse is claimed once per arrival at the finale, not once per
  // repaint: position() and the resize tick both re-render this card.
  var rewardClaim = null;

  /** Fills the finale's reward strip. Never blocks the player: any failure just
   *  reports that the purse is still claimable, since the flag is server-side. */
  function claimFinaleReward(box0, reposition) {
    if (!rewardClaim) {
      rewardClaim = (window.SiegeClient && window.SiegeClient.claimTutorialReward)
        ? window.SiegeClient.claimTutorialReward()
        : Promise.resolve({ claimed: false, already: false });
    }
    rewardClaim.then(function (r) {
      var box = box0 || document.getElementById('tutReward');
      if (!box) return;
      if (r && r.claimed) {
        box.className = 'tut-reward is-claimed';
        box.innerHTML = '<b>First-time reward</b> 🪙 ' + (r.gold || 0) + ' Siegecoins &nbsp;·&nbsp; 🔮 '
          + (r.remnants || 0) + ' Remnants';
      } else if (r && r.already) {
        box.className = 'tut-reward is-claimed';
        box.innerHTML = '<b>First-time reward</b> already claimed on this account.';
      } else {
        box.className = 'tut-reward';
        box.innerHTML = 'Sign in to claim the first-time reward — it stays available.';
      }
      if (reposition) reposition();
    });
  }

  /** The modal that interrupts every stop: point at its way out, not at a
   *  button that is no longer on screen. */
  function eventDetour() {
    if (!screenIs('interactionResultScreen')) return null;
    return {
      title: 'Outcome', kicker: 'Result',
      body: 'Every stop reports what it gave you. Tap <b>Continue \u25B8</b> to carry on.',
      target: '#interactionResultBtn'
    };
  }

  /** The regions a player taps to actually play, which a read hint should clear.
   *  The arena counts: a card is played by dragging it ONTO a sprite, so a hint
   *  lying across the foe line blocks the drop itself. */
  var PLAY_AREAS = ['#handRow', '#enemyRow', '#allyRow', '#campGrid', '#smithGrid',
    '#caravanGrid', '#brokerGrid', '#rewardGrid', '#ampGrid', '#eventChoices',
    '#riftChoices', '#invBag', '#cacheOptions'];

  // ---- lifecycle ----------------------------------------------------------

  function start() {
    if (ACTIVE) return;
    ACTIVE = true;
    M = buildModel();
    flags = {
      played: 0, dug: 0, ulted: false, claimed: false, rewarded: false, camped: false,
      bought: false, equipped: false, rented: false, smithed: false, rifted: false, reachedBoss: false
    };
    visited = {};
    rewardClaim = null;   // a second run must re-ask the server, not replay the first answer
    refreshReachable();
    if (window.SiegeClient) window.SiegeClient.applyRun(clone(M));
    window.TutorialCoach.start({
      steps: buildSteps(),
      playAreas: PLAY_AREAS,
      detour: eventDetour,
      onDetourContinue: function () {
        var cont = $('interactionResultBtn');
        if (cont) cont.click();
      },
      onFinale: claimFinaleReward,
      onStop: finish,
      bodyClass: 'siege-tutorial'
    });
  }

  /** Called when the coach ends, however it ended. */
  function finish() {
    if (!ACTIVE) return;
    ACTIVE = false;
    M = null;
    if (window.SiegeClient) window.SiegeClient.exitTutorial();
  }

  function stop() {
    if (!ACTIVE) return;
    // Ending the coach calls finish() back, which is what tears the run down.
    if (window.TutorialCoach.active()) window.TutorialCoach.stop();
    else finish();
  }

  window.SiegeTutorial = {
    start: start,
    stop: stop,
    active: function () { return ACTIVE; },
    respond: function (path, body) {
      // run/abandon means "get me out" — hand the session back to the real API.
      if (path === '/api/siege/run/abandon') { stop(); return Promise.resolve({}); }
      return respond(path, body);
    }
  };
})();
