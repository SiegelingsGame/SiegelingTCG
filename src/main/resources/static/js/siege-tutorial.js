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
 * and Cacty, read out of the roster adventure.js already loaded, so the art,
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
  var total = 0;
  var flags = null;      // things the coach waits on that state alone cannot show

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
    cacty: {
      id: 'cacty', name: 'Cacty', element: 'EARTH', hp: 78, speed: 8, evolves: true, artUrl: null,
      moves: [
        { name: 'Sproutspray', element: 'EARTH', effect: 'DAMAGE', value: 3, actionCost: 0, target: 'ALL_ENEMIES', description: 'Deal 1 Damage to Selected row Enemies', status: 'LEECH', statusChance: 20 },
        { name: 'Pollinate', element: 'EARTH', effect: 'HEAL', value: 6, actionCost: 0, target: 'ALLY_SINGLE', description: 'Heal an Ally +3 Health' }
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
      artUrl: 'https://firebasestorage.googleapis.com/v0/b/siegelingstcgtesting.firebasestorage.app/o/cards%2Fdracoil.png?alt=media&token=9c268396-5eab-4679-a448-dcab83a334ce'
    },
    cacty: {
      id: 'jackedty', name: "Jacked'ty", hp: 86, speed: 7,
      artUrl: 'https://firebasestorage.googleapis.com/v0/b/siegelingstcgtesting.firebasestorage.app/o/cards%2Fjackedty.png?alt=media&token=a3ef266d-83f2-4596-aa2d-6d76d8227569'
    }
  };

  function card(id) {
    var r = roster();
    return (r && fromRoster(r.siegelings, id)) || BAKED[id] || null;
  }
  function knightCard() {
    var r = roster();
    return (r && fromRoster(r.knights, 'squire-bob')) || BAKED['squire-bob'];
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

  function handCard(tpl, ap) {
    var needs = tpl.target === 'ENEMY_SINGLE' || tpl.target === 'ALLY_SINGLE';
    var h = {
      instanceId: tpl.instanceId, name: tpl.name, element: tpl.element,
      effect: tpl.effect, value: tpl.value, boostedValue: tpl.value,
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

  /* Two diamonds. Each lane of a diamond carries the same two node types in the
   * opposite order, so whichever way the player goes they still meet every kind
   * of stop — the tutorial can teach branching without a route that skips a
   * lesson. A real expedition's lanes differ in what they hold; the coach says so. */
  var NODES = [
    { id: 0, row: 0, col: 0, type: 'BATTLE', label: 'Ruined Gate', next: [1, 2] },
    { id: 1, row: 1, col: 0, type: 'REST', label: 'Ember Camp', next: [3] },
    { id: 2, row: 1, col: 1, type: 'CARAVAN', label: 'Dust Caravan', next: [4] },
    { id: 3, row: 2, col: 0, type: 'CARAVAN', label: 'Wayside Wagon', next: [5, 6] },
    { id: 4, row: 2, col: 1, type: 'REST', label: 'Quiet Hollow', next: [5, 6] },
    { id: 5, row: 3, col: 0, type: 'BROKER', label: 'Merc Post', next: [7] },
    { id: 6, row: 3, col: 1, type: 'SMITH', label: 'Old Forge', next: [8] },
    { id: 7, row: 4, col: 0, type: 'SMITH', label: 'Ember Forge', next: [9] },
    { id: 8, row: 4, col: 1, type: 'BROKER', label: 'Hedge Broker', next: [9] },
    { id: 9, row: 5, col: 0, type: 'TREASURE', label: 'Buried Cache', next: [10] },
    { id: 10, row: 6, col: 0, type: 'EVENT', label: 'Standing Stone', next: [11] },
    { id: 11, row: 7, col: 0, type: 'BOSS', label: 'The Siegelord', next: [] }
  ];

  function nodeById(id) {
    for (var i = 0; i < M.map.length; i++) { if (M.map[i].id === id) return M.map[i]; }
    return null;
  }
  function nodeType(id) { var n = nodeById(id); return n ? n.type : null; }

  // ---- the simulated run -------------------------------------------------

  function buildModel() {
    var k = knightCard();
    var dracoSrc = card('draco');
    var cactySrc = card('cacty');
    var draco = unitFrom(dracoSrc, { id: 'ally-draco', position: 0 });
    var cacty = unitFrom(cactySrc, { id: 'ally-cacty', position: 1, size: 'LARGE' });

    var deck = deckCardsFor('ally-draco', draco.name, dracoSrc.moves, 'd')
      .concat(deckCardsFor('ally-cacty', cacty.name, cactySrc.moves, 'c'));
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
      stats: { nodesCleared: 0, bossKills: 0, enemiesDefeated: 0, goldEarned: 0 },
      endRewards: null, xpRecap: null, ampChoice: null, ampsPending: 0,
      extraction: null, recruit: null, mercenary: null,
      camp: null, cache: null, broker: null, smith: null, caravan: null,
      event: null, minigame: null, checkpoint: false,
      knight: {
        id: k.id, name: k.name, element: k.element,
        passive: k.passive, passiveKind: k.passiveKind, passiveName: k.passiveName,
        active: active.name, activeSpec: active,
        ultimateName: k.ultimateName, ultimateDesc: k.ultimateDesc,
        ultimateValue: 2, accountLevel: k.level || 1,
        unitId: 'knight-unit', hp: 40, maxHp: 40, artUrl: null, alive: true,
        level: 1, xp: 0, xpToNext: 60, xpInLevel: 0, xpSpan: 60, leveledThisBattle: false
      },
      party: [draco, cacty],
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
    drawTo(HAND_MAX);
    syncPiles();
  }

  function refillKnight() {
    var k = M.knight;
    M.battle.knight = {
      id: 'knight-unit', name: k.name, element: k.element, hp: k.hp, maxHp: k.maxHp,
      artUrl: null, level: k.level, xp: k.xp, xpToNext: k.xpToNext,
      xpInLevel: k.xpInLevel, xpSpan: k.xpSpan, leveledThisBattle: false,
      charge: 0, ultCost: ULT_COST,
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

  /** Enemy intents are public in Siege: each foe telegraphs the notch it will hit. */
  function shuffleIntents() {
    var allies = livingAllies();
    livingFoes().forEach(function (f, i) {
      var ability = (f.abilities || [])[0];
      if (!ability) return;
      var mark = allies.length ? allies[i % allies.length] : null;
      f.intent = {
        name: ability.name, effect: 'DAMAGE', value: ability.value,
        sweep: false, position: mark ? mark.position : -1
      };
    });
    M.battle.targetedPositions = livingFoes()
      .map(function (f) { return f.intent ? f.intent.position : -1; })
      .filter(function (p) { return p >= 0; });
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
    b.knight.charge = Math.min(b.knight.ultCost, b.knight.charge + 2);
    flags.played++;

    var owner = findUnit(c.ownerId) || b.knight;
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

  /* Squire Bob is a Marshal, so his Ultimate is Muster the Line: it evolves
   * Siegelings on the spot. The tutorial plays the real evolve event and takes
   * the evolved form's name, art and stats; it keeps the pre-evolution cards,
   * which a real run would swap — the lesson here is what evolving *is*. */
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
      a.evolvesTo = null;
      events.push({
        type: 'evolve', targetId: a.id, from: was, to: evo.name,
        element: a.element, vitals: vitalsOf([a.id])
      });
      logLine(was + ' evolves into ' + evo.name + '!');
      // The party carries the evolution out of the battle, like a real run.
      M.party.forEach(function (p) {
        if (p.id !== a.id) return;
        p.name = a.name; p.sourceCardId = a.sourceCardId; p.artUrl = a.artUrl;
        p.maxHp = a.maxHp; p.hp = a.hp; p.speed = a.speed;
        p.effectiveSpeed = a.speed; p.evoStage = 1; p.hasEvolution = false; p.evolvesTo = null;
      });
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

    livingFoes().forEach(function (f) {
      if (!f.intent) return;
      var mark = null;
      livingAllies().forEach(function (a) { if (a.position === f.intent.position) mark = a; });
      if (!mark) mark = livingAllies()[0];
      events.push({ type: 'enemyAct', sourceId: f.id, name: f.intent.name, element: f.element });
      if (mark) {
        damage(mark, f.intent.value, events, f.id, f.element);
        logLine(f.name + ' hits ' + mark.name + ' for ' + f.intent.value + '.');
      }
    });

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
    // Round 2 always opens with a charged Ultimate: a tutorial that cannot
    // demonstrate the button is not teaching it.
    if (b.roundNumber === 2) b.knight.charge = b.knight.ultCost;
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
      M.event || M.recruit || M.ampChoice || (M.pendingRewards && M.pendingRewards.length);
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
    if (node.type === 'EVENT') {
      M.event = {
        title: 'The Standing Stone', icon: '🗿',
        prompt: 'A humming monolith offers a bargain: strength for blood, or coin for nothing.',
        options: [
          campOpt('ev-power', 'EVENT', 'Touch the stone', 'Every Siegeling loses 4 HP and gains +1 attack.', 0),
          campOpt('ev-gold', 'EVENT', 'Pry loose a shard', 'Take 30 gold and walk away.', 0),
          campOpt('ev-leave', 'EVENT', 'Leave it alone', 'Nothing ventured.', 0)
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

  function leadName() { return M.party[0] ? M.party[0].name : 'your Siegeling'; }
  function knightName() { return M.knight.name; }

  function buildSteps() {
    var k = M.knight;
    return [
      { id: 'welcome', kicker: 'Tutorial', title: 'Welcome to the Siege',
        body: 'This is a full practice expedition, fought with real cards — ' + esc(knightName()) +
          ' leading ' + esc(M.party[0].name) + ' and ' + esc(M.party[1].name) +
          '. Nothing here touches your account: no gold spent, no saves written. I will walk you to every kind of stop on the map.' },
      { id: 'map', title: 'The expedition map', target: '#mapSvg',
        body: 'A Siege run is a branching path read bottom to top. You travel one node at a time, and every node you clear is gone for good — the route you pick <em>is</em> the run.' },
      { id: 'key', title: 'What the emblems mean', target: '#mapKeyBtn',
        body: 'Each node type has its own emblem. Tap <b>🗝️ Key</b> to read them.',
        until: function () { return !hidden('legendOverlay'); } },
      { id: 'key-read', title: 'Read the key', target: '.legend-panel',
        body: 'Fights, camps, caches, shops and the Siegelord all live on this list, along with what the ring around a node means. Close it when you are done.',
        until: function () { return hidden('legendOverlay'); } },
      { id: 'warband', title: 'Your warband', target: '#partyStrip',
        body: esc(knightName()) + ' is a <b>' + esc(k.passiveName) + '</b>: ' + esc(k.passive) +
          ' That is why two Siegelings stand with him. <b>Tap one</b> to read its cards.',
        until: function () { return !hidden('unitModal'); } },
      { id: 'warband-cards', title: 'Cards come from Siegelings', target: '#unitModalCard',
        body: 'These are the moves this Siegeling puts into the shared deck. Lose the Siegeling and its cards go dead — protecting your line is protecting your hand. Close this when you have looked.',
        until: function () { return hidden('unitModal'); } },
      { id: 'navigate', title: 'Navigate', target: '.map-node-g.reachable',
        body: 'A pulsing ring means you can travel there. <b>Tap the ⚔️ Ruined Gate</b> to start the first fight.',
        until: function () { return screenIs('battleScreen'); } },

      { id: 'speed', title: 'Who moves first', target: '#speedTrack',
        body: 'Combat is round-based. Your side\'s total <b>Speed</b> against theirs decides who acts first — the runners on this track are your Siegelings at their speed.' },
      { id: 'passive', title: 'Passive and Ultimate', target: '#knightPlate',
        body: 'Your SiegeKnight does not attack. He contributes a <b>passive</b> — ' + esc(k.passiveName) + ', above — and charges an <b>Ultimate</b> on the bar below his HP: <em>' +
          esc(k.ultimateName) + '</em>, which ' + esc(String(k.ultimateDesc || '').charAt(0).toLowerCase() + String(k.ultimateDesc || '').slice(1)) +
          ' Tap the plate any time to read both.' },
      { id: 'ap', title: 'Action Points', target: '#apDisplay',
        body: 'You get ' + MAX_AP + ' AP a turn, and a card costs whatever is printed in its corner. Unspent AP is not wasted: it converts into Ultimate Charge when you end the turn.' },
      { id: 'hand', title: 'Your hand', target: '#handRow',
        body: 'The fan is your hand. Each card belongs to one Siegeling — its owner is the one who swings, so buffs on that Siegeling change what the card does.' },
      { id: 'intents', title: 'Foes telegraph their attacks', target: '#enemyRow',
        body: 'These are corrupted Siegelings — <b>shades</b>. Each shows its <b>intent</b>: the move it will use and the notch it will hit. A ▼ over one of your Siegelings means that blow is aimed at it — heal it, or kill the attacker first.' },
      { id: 'targeting', title: 'Targeting', target: '#handRow',
        body: '<b>Drag an attack card onto a foe</b> to play it. Cards that need a target draw an arrow while you drag; drop it on the enemy you want.',
        until: function () { return flags.played > 0; } },
      { id: 'endturn', title: 'End the turn', target: '#endTurnBtn',
        body: 'Spend what is worth spending, then <b>End Turn</b>. The foes act on the intents they showed you, and a fresh hand is dealt.',
        until: function () { return M.battle && M.battle.roundNumber > 1; } },
      { id: 'ultimate', title: 'The Ultimate', target: '#knightUltBtn',
        body: 'The charge bar is full. <b>Tap ⚡ ULT!</b> — ' + esc(k.ultimateName) + ' ' +
          esc(String(k.ultimateDesc || '').charAt(0).toLowerCase() + String(k.ultimateDesc || '').slice(1)) +
          ' Watch your line when it lands.',
        until: function () { return flags.ulted; },
        skipIf: function () { return !M.battle; } },
      { id: 'evolved', title: 'Evolution', target: '#allyRow',
        body: 'That is an <b>evolution</b>: a Siegeling becomes its next form, with more HP and a stronger kit, and it stays evolved for the rest of the run. Normally you earn it by spending AP on that Siegeling until its gauge fills — ' + esc(knightName()) + '\'s Ultimate simply skips the wait.',
        skipIf: function () { return !flags.ulted; } },
      { id: 'finish', title: 'Finish the fight', target: '#handRow',
        body: 'Play out the rest of the fight — attack, end turn, repeat — until both shades are down.',
        until: function () { return !M.battle || M.battle.phase === 'WON'; } },
      { id: 'spoils', title: 'Claim the spoils', target: '#handRow',
        body: 'Victory. Tap <b>Claim Rewards</b> to collect XP, gold and a pick.',
        until: function () { return !screenIs('battleScreen'); } },

      { id: 'recruit', title: 'Claiming a Siegeling', target: '#gachaClaimBtn',
        body: 'A wild Siegeling wants to join. Claiming it adds it to your warband <em>and</em> adds its moves to your shared deck. <b>Tap Claim</b>.',
        until: function () { return flags.claimed; },
        skipIf: function () { return !M.recruit && !flags.claimed; } },
      { id: 'levelup', title: 'Level up', target: '#ampGrid',
        body: 'Siegelings earn XP from every fight. A level restores health, adds max HP, and lets that Siegeling <b>amplify one of its own cards</b> permanently. <b>Pick one.</b>',
        until: function () { return !M.ampChoice; },
        skipIf: function () { return !M.ampChoice; } },
      { id: 'reward', title: 'Choose a reward', target: '#rewardGrid',
        body: 'Now the spoils: an item to equip, a new card, or a heal. <b>Take the Emberheart Charm</b> — we will equip it shortly.',
        until: function () { return flags.rewarded; },
        skipIf: function () { return !(M.pendingRewards && M.pendingRewards.length) && !flags.rewarded; } },

      // ---- first branch ----------------------------------------------------
      { id: 'branch-1', title: 'The path forks', target: '#mapSvg',
        body: 'Two routes open out of the gate, and you may only walk one. <b>In this tutorial both lanes reach the same two stops in the opposite order</b>, so you will see everything either way — in a real run they hold different things, and choosing is the game. <b>Tap either node.</b>',
        until: function () { return screenIs('campScreen') || screenIs('caravanScreen'); } },
      { id: 'branch-1-route', route: function () { return screenIs('campScreen') ? 'camp-a' : 'caravan-a'; } },

      { id: 'camp-a', title: 'Resting', target: '#campGrid',
        body: 'A camp gives one free <b>Rest</b> (healing the whole warband) plus a trader and a broker behind their own menus. Shopping does not spend the rest. <b>Take the rest.</b>',
        until: function () { return flags.camped; }, next: 'camp-b' },
      { id: 'camp-b', title: 'Break camp', target: '#campLeaveBtn',
        body: 'Browse the trader if you like, then <b>Break Camp</b> to return to the map.',
        until: function () { return screenIs('mapScreen'); }, next: 'stop-1-done' },

      { id: 'caravan-a', title: 'Purchasing', target: '#caravanGrid',
        body: 'The caravan is the run\'s shop. Gold buys <b>items</b> you equip to a Siegeling, <b>cards</b> that join the shared deck, and healing. <b>Buy the Ironbark Ward.</b>',
        until: function () { return flags.bought; }, next: 'caravan-b' },
      { id: 'caravan-b', title: 'Move on', target: '#caravanLeaveBtn',
        body: 'Bought goods go straight into the backpack. <b>Move On</b> when you are done shopping.',
        until: function () { return screenIs('mapScreen'); }, next: 'equip-a' },

      { id: 'equip-a', title: 'Equipping', target: '#inventoryBtn',
        body: 'Items do nothing in the backpack. Open <b>🎒 Items</b>.',
        until: function () { return !hidden('invOverlay'); }, next: 'equip-b' },
      { id: 'equip-b', title: 'One item per Siegeling', target: '#invBag',
        body: '<b>Tap an item in the backpack, then tap a Siegeling</b> to equip it. Each Siegeling holds one item at a time; the ✕ on a filled slot returns it to the bag. The Knight\'s Bag above holds consumables you can use here or mid-battle.',
        until: function () { return flags.equipped; }, next: 'equip-c' },
      { id: 'equip-c', title: 'Close the bag', target: '#invClose',
        body: 'Equipped. Close the inventory to carry on.',
        until: function () { return hidden('invOverlay'); }, next: 'stop-1-done' },

      { id: 'stop-1-done', route: function () {
        return (flags.camped && flags.bought) ? 'branch-2' : 'other-lane-1';
      } },
      { id: 'other-lane-1', title: 'The other lane', target: '.map-node-g.reachable',
        body: 'This lane rejoins the other one — the stop ahead is the type you did not just visit. <b>Travel there.</b>',
        until: function () { return screenIs('campScreen') || screenIs('caravanScreen'); },
        next: 'other-lane-1-route' },
      { id: 'other-lane-1-route', route: function () { return screenIs('campScreen') ? 'camp-a' : 'caravan-a'; } },

      // ---- second branch ---------------------------------------------------
      { id: 'branch-2', title: 'Another fork', target: '#mapSvg',
        body: 'The path splits again, this time between a <b>🐾 broker</b> and a <b>🔨 smith</b>. Same deal: both lanes visit both, in opposite order. <b>Pick one.</b>',
        until: function () { return screenIs('brokerScreen') || screenIs('smithScreen'); } },
      { id: 'branch-2-route', route: function () { return screenIs('brokerScreen') ? 'broker-a' : 'smith-a'; } },

      { id: 'broker-a', title: 'Renting', target: '#brokerGrid',
        body: 'The broker sells two different things. <b>Hire</b> adds a Siegeling to the warband permanently. <b>Rent</b> takes a mercenary who fights your <em>next battle only</em>, then leaves — cheap muscle for a fight you expect to be ugly. <b>Rent the mercenary.</b>',
        until: function () { return flags.rented; }, next: 'broker-b' },
      { id: 'broker-b', title: 'Move on', target: '#brokerLeaveBtn',
        body: 'Your rental now stands with the warband at every stop until its battle is fought. <b>Move On.</b>',
        until: function () { return screenIs('mapScreen'); }, next: 'stop-2-done' },

      { id: 'smith-a', title: 'Upgrading a card', target: '#smithGrid',
        body: 'The smith permanently awakens one card in your deck into a stronger form. You can also <b>Scrap a card</b> to thin the deck so your best cards come up more often. <b>Pick an upgrade.</b>',
        until: function () { return screenIs('mapScreen'); }, next: 'stop-2-done' },

      { id: 'stop-2-done', route: function () {
        return (flags.rented && flags.smithed) ? 'cache-a' : 'other-lane-2';
      } },
      { id: 'other-lane-2', title: 'The other lane', target: '.map-node-g.reachable',
        body: 'And this lane carries the stop you skipped. <b>Travel there.</b>',
        until: function () { return screenIs('brokerScreen') || screenIs('smithScreen'); },
        next: 'other-lane-2-route' },
      { id: 'other-lane-2-route', route: function () { return screenIs('brokerScreen') ? 'broker-a' : 'smith-a'; } },

      // ---- the shared tail --------------------------------------------------
      { id: 'cache-a', title: 'The cache', target: '.map-node-g.reachable',
        body: 'The lanes have rejoined — from here there is one road. <b>Travel to the 💎 Buried Cache.</b>',
        until: function () { return screenIs('cacheScreen'); } },
      { id: 'cache-b', title: 'Press your luck', target: '#cacheDigBtn',
        body: 'A cache is a gamble: every dig adds gold and raises the collapse risk on the bar. <b>Dig Deeper</b> once.',
        until: function () { return flags.dug > 0; } },
      { id: 'cache-c', title: 'Know when to stop', target: '#cacheTakeBtn',
        body: 'Loot is unbanked until you take it — a collapse costs you everything in the shaft. <b>Bank the Loot.</b>',
        until: function () { return screenIs('mapScreen'); } },

      { id: 'event-a', title: 'Events', target: '.map-node-g.reachable',
        body: '<b>Travel to the ❔ Standing Stone.</b>',
        until: function () { return screenIs('eventScreen'); } },
      { id: 'event-b', title: 'Choices with a price', target: '#eventChoices',
        body: 'Events trade something for something: HP for power, safety for coin. There is no wrong answer, only what the run needs. <b>Choose one.</b>',
        until: function () { return screenIs('mapScreen'); } },

      { id: 'boss', title: 'The Siegelord', target: '.map-node-g.type-BOSS',
        body: 'The 👑 node at the top of every stage is the Siegelord. Clearing it ends the stage — and in a real run, winning banks your leveled team for Battlegrounds.' },
      { id: 'done', kicker: 'Tutorial complete', title: 'That is the loop', finish: true,
        body: 'Travel, fight, spend, and arrive at the boss stronger than the map expected. Nothing you did here was saved — start a real expedition whenever you are ready.' }
    ];
  }

  // ---- coach overlay ------------------------------------------------------

  var layer = null, ringEl = null, cardEl = null, raf = 0, lastRect = '', renderedKey = '';

  function buildLayer() {
    layer = el('div', 'tut-layer');
    ringEl = el('div', 'tut-ring');
    cardEl = el('div', 'tut-card');
    layer.appendChild(ringEl);
    layer.appendChild(cardEl);
    document.body.appendChild(layer);
    cardEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      if (btn.classList.contains('tut-next')) advance();
      else if (btn.classList.contains('tut-quit')) stop();
    });
  }

  function current() { return STEPS[idx] || null; }

  function indexOfId(id) {
    for (var i = 0; i < STEPS.length; i++) { if (STEPS[i].id === id) return i; }
    return -1;
  }

  /**
   * Move to the next step. A step names its successor with `next` (a branch lane
   * rejoining the trunk), otherwise the script runs in order; `route` steps
   * render nothing and hand straight on to whichever id they resolve to, which
   * is what lets one script follow either lane of a fork.
   */
  function advance() {
    var cur = current();
    var target = null;
    if (cur && cur.next) target = typeof cur.next === 'function' ? cur.next() : cur.next;
    idx = target ? indexOfId(target) : idx + 1;

    var guard = 0;
    while (idx >= 0 && idx < STEPS.length && guard++ < 60) {
      var s = STEPS[idx];
      if (s.skipIf && s.skipIf()) { idx++; continue; }
      if (s.route) {
        var j = indexOfId(s.route());
        if (j < 0) { idx++; continue; }
        idx = j;
        continue;
      }
      break;
    }
    if (idx < 0 || idx >= STEPS.length) { stop(); return; }
    shown++;
    lastRect = '';
    renderedKey = idx + (detour() ? '|detour' : '|step');
    renderStep();
  }

  /** The interaction-result popup interrupts every stop; say so rather than
   *  pointing the spotlight at a button that is no longer on screen. */
  function detour() {
    if (screenIs('interactionResultScreen')) {
      return {
        title: 'Outcome', kicker: 'Result',
        body: 'Every stop reports what it gave you. Tap <b>Continue ▸</b> to carry on.',
        target: '#interactionResultBtn'
      };
    }
    return null;
  }

  function renderStep() {
    var det = detour();
    var s = det || current();
    if (!s) return;
    // A detour never carries its own Next button: advancing is still the real
    // step's job, and the popup it describes has to be dismissed first.
    var waiting = !!det || !!s.until;
    cardEl.innerHTML =
      '<div class="tut-head">' +
        '<span class="tut-kicker">' + esc(s.kicker || ('Step ' + shown + ' of ' + total)) + '</span>' +
        '<button class="tut-quit" type="button" aria-label="Exit tutorial">✕</button>' +
      '</div>' +
      '<h3 class="tut-title">' + esc(s.title) + '</h3>' +
      '<p class="tut-body">' + s.body + '</p>' +
      '<div class="tut-foot">' +
        (waiting
          ? '<span class="tut-wait">Your move ▸</span>'
          : '<button class="tut-next" type="button">' + (s.finish ? 'Finish' : 'Got it ▸') + '</button>') +
      '</div>';
    position();
  }

  function targetNode(s) {
    if (!s || !s.target) return null;
    try { return document.querySelector(s.target); } catch (e) { return null; }
  }

  function position() {
    var s = detour() || current();
    var node = targetNode(s);
    var vh = window.innerHeight, vw = window.innerWidth;
    if (!node || !node.getBoundingClientRect) {
      ringEl.classList.add('off');
      cardEl.classList.remove('at-top');
      cardEl.style.top = '';
      cardEl.style.bottom = '18px';
      return;
    }
    var r = node.getBoundingClientRect();
    if (!r.width && !r.height) { ringEl.classList.add('off'); return; }
    var pad = 8;
    ringEl.classList.remove('off');
    ringEl.style.left = Math.max(2, r.left - pad) + 'px';
    ringEl.style.top = Math.max(2, r.top - pad) + 'px';
    ringEl.style.width = Math.min(vw - 4, r.width + pad * 2) + 'px';
    ringEl.style.height = Math.min(vh - 4, r.height + pad * 2) + 'px';
    // Put the tip on whichever side of the highlight has more room, so the card
    // never covers the thing the player has to tap.
    var below = vh - r.bottom;
    if (below >= r.top) {
      cardEl.classList.add('at-top');
      cardEl.style.top = Math.min(vh - 150, r.bottom + 14) + 'px';
      cardEl.style.bottom = 'auto';
    } else {
      cardEl.classList.remove('at-top');
      cardEl.style.top = 'auto';
      cardEl.style.bottom = Math.min(vh - 150, vh - r.top + 14) + 'px';
    }
  }

  function tick() {
    if (!ACTIVE) return;
    raf = window.requestAnimationFrame(tick);
    var s = current();
    if (!s) return;
    if (s.until && !detour()) {
      var done = false;
      try { done = !!s.until(); } catch (e) { done = false; }
      if (done) { advance(); return; }
    }
    // Cheap re-layout: only touch the DOM when the copy or the target moved.
    var det = detour();
    var key = idx + (det ? '|detour' : '|step');
    if (key !== renderedKey) { renderedKey = key; renderStep(); return; }
    var node = targetNode(det || s);
    var r = node ? node.getBoundingClientRect() : null;
    var rect = r ? [r.left, r.top, r.width, r.height].join(',') : 'none';
    if (rect !== lastRect) { lastRect = rect; position(); }
  }

  // ---- lifecycle ----------------------------------------------------------

  function start() {
    if (ACTIVE) return;
    ACTIVE = true;
    M = buildModel();
    flags = {
      played: 0, dug: 0, ulted: false, claimed: false, rewarded: false, camped: false,
      bought: false, equipped: false, rented: false, smithed: false, reachedBoss: false
    };
    STEPS = buildSteps();
    total = STEPS.filter(function (s) { return !s.route; }).length;
    idx = -1;
    shown = 0;
    if (!layer) buildLayer();
    layer.classList.remove('hidden');
    document.body.classList.add('siege-tutorial');
    refreshReachable();
    if (window.SiegeClient) window.SiegeClient.applyRun(clone(M));
    advance();
    raf = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (!ACTIVE) return;
    ACTIVE = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    if (layer) layer.classList.add('hidden');
    document.body.classList.remove('siege-tutorial');
    M = null;
    if (window.SiegeClient) window.SiegeClient.exitTutorial();
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
