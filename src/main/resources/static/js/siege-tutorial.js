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
 * On top of that sits the coach: a spotlight ring plus a tip card, walking the
 * player through every node type and every verb the mode has (navigate, rest,
 * buy, equip, upgrade, rent, dig, level up, claim a Siegeling, and fight —
 * targeting, the knight's passive and the Ultimate included).
 *
 * ES5-flavoured (var, function statements, IIFE) to match adventure.js.
 */
(function () {
  'use strict';

  var ACTIVE = false;
  var M = null;          // the simulated run (wire-shaped, mutated in place)
  var STEPS = null;
  var idx = -1;
  var flags = null;      // things the coach waits on that state alone can't show

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

  // ---- simulated content ------------------------------------------------

  var MAX_AP = 5;
  var HAND_MAX = 5;
  var ULT_COST = 6;

  function spec(o) {
    return {
      name: o.name, element: o.element, effect: o.effect, value: o.value,
      actionCost: o.cost, target: o.target, description: o.desc
    };
  }

  /** A card as the battle wire format prints it (hand entry). */
  function handCard(tpl, i, ap) {
    var needs = tpl.target === 'ENEMY_SINGLE' || tpl.target === 'ALLY_SINGLE';
    return {
      instanceId: tpl.instanceId, name: tpl.name, element: tpl.element,
      effect: tpl.effect, value: tpl.value, boostedValue: tpl.value,
      target: tpl.target, actionCost: tpl.actionCost, description: tpl.description,
      ownerId: tpl.ownerId, ownerName: tpl.ownerName, needsTarget: needs,
      playable: ap >= tpl.actionCost
    };
  }

  function unit(o) {
    return {
      id: o.id, name: o.name, element: o.element, side: o.side || 'PLAYER',
      hp: o.hp, maxHp: o.hp, shield: 0, speed: o.speed, baseSpeed: o.speed,
      effectiveSpeed: o.speed, attackBuff: 0, attackBuffTimed: 0, attackBuffRounds: 0,
      speedBuffTimed: 0, speedBuffRounds: 0, maxHpBonus: 0,
      level: o.level || 1, xp: o.xp || 0, xpToNext: 40, xpInLevel: o.xp || 0, xpSpan: 40,
      leveledThisBattle: false, sourceCardId: o.id, itemId: null, item: null,
      alive: true, artUrl: null, shadeOf: null, position: o.position == null ? 0 : o.position,
      statuses: [], statusRounds: {}, evoStage: 0, size: o.size || 'MEDIUM',
      hasEvolution: false, hasStage3Evolution: false,
      leader: !!o.leader, cards: o.cards || [], abilities: o.abilities || [],
      evolvesTo: null
    };
  }

  function item(id, name, ic, kind, value, effect, desc) {
    return { id: id, name: name, icon: ic, kind: kind, value: value, effect: effect, desc: desc };
  }

  var NODES = [
    { id: 0, row: 0, type: 'BATTLE', label: 'Ruined Gate' },
    { id: 1, row: 1, type: 'REST', label: 'Ember Camp' },
    { id: 2, row: 2, type: 'CARAVAN', label: 'Dust Caravan' },
    { id: 3, row: 3, type: 'BROKER', label: 'Merc Post' },
    { id: 4, row: 4, type: 'SMITH', label: 'Old Forge' },
    { id: 5, row: 5, type: 'TREASURE', label: 'Buried Cache' },
    { id: 6, row: 6, type: 'EVENT', label: 'Standing Stone' },
    { id: 7, row: 7, type: 'BOSS', label: 'The Siegelord' }
  ];

  function buildModel() {
    var ember = unit({
      id: 'ally-ember', name: 'Emberling', element: 'FIRE', hp: 30, speed: 7, position: 0
    });
    var tide = unit({
      id: 'ally-tide', name: 'Tidepup', element: 'WATER', hp: 34, speed: 5, position: 1
    });
    var deck = [
      { instanceId: 'c1', ownerId: 'ally-ember', ownerName: 'Emberling', name: 'Ember Lash', element: 'FIRE', effect: 'DAMAGE', value: 6, actionCost: 1, target: 'ENEMY_SINGLE', description: 'Strike one foe for 6.' },
      { instanceId: 'c2', ownerId: 'ally-ember', ownerName: 'Emberling', name: 'Cinder Guard', element: 'FIRE', effect: 'SHIELD', value: 4, actionCost: 1, target: 'SELF', description: 'Emberling gains 4 shield.' },
      { instanceId: 'c3', ownerId: 'ally-tide', ownerName: 'Tidepup', name: 'Tide Splash', element: 'WATER', effect: 'DAMAGE', value: 5, actionCost: 1, target: 'ENEMY_SINGLE', description: 'Strike one foe for 5.' },
      { instanceId: 'c4', ownerId: 'ally-tide', ownerName: 'Tidepup', name: 'Spring Tide', element: 'WATER', effect: 'HEAL', value: 5, actionCost: 1, target: 'ALLY_SINGLE', description: 'Heal one Siegeling for 5.' },
      { instanceId: 'c5', ownerId: 'knight-ilyana', ownerName: 'Ser Ilyana', name: 'Rally Banner', element: 'LIGHT', effect: 'BUFF_ATTACK', value: 2, actionCost: 1, target: 'ALL_ALLIES', description: 'Every Siegeling hits for +2 this battle.' },
      { instanceId: 'c6', ownerId: 'ally-ember', ownerName: 'Emberling', name: 'Ember Lash', element: 'FIRE', effect: 'DAMAGE', value: 6, actionCost: 1, target: 'ENEMY_SINGLE', description: 'Strike one foe for 6.' },
      { instanceId: 'c7', ownerId: 'ally-tide', ownerName: 'Tidepup', name: 'Tide Splash', element: 'WATER', effect: 'DAMAGE', value: 5, actionCost: 1, target: 'ENEMY_SINGLE', description: 'Strike one foe for 5.' }
    ];
    ember.cards = deck.filter(function (c) { return c.ownerId === 'ally-ember'; }).map(specOfCard);
    tide.cards = deck.filter(function (c) { return c.ownerId === 'ally-tide'; }).map(specOfCard);

    var map = NODES.map(function (n) {
      return {
        id: n.id, row: n.row, col: 0, type: n.type, label: n.label,
        cleared: false, current: false, reachable: n.row === 0,
        next: n.id < 7 ? [n.id + 1] : []
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
        id: 'knight-ilyana', name: 'Ser Ilyana', element: 'LIGHT',
        passive: 'Every Siegeling starts each battle with 3 shield.',
        passiveKind: 'SHIELD', passiveName: 'Bulwark',
        active: 'Rally Banner', activeSpec: specOfCard(deck[4]),
        ultimateName: 'Aegis Wall',
        ultimateDesc: 'Shields the whole warband for 6 and blasts every foe for 5.',
        ultimateValue: 6, accountLevel: 3,
        unitId: 'knight-unit', hp: 40, maxHp: 40, artUrl: null, alive: true,
        level: 3, xp: 0, xpToNext: 60, xpInLevel: 0, xpSpan: 60, leveledThisBattle: false
      },
      party: [ember, tide],
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

  function specOfCard(c) {
    return spec({
      name: c.name, element: c.element, effect: c.effect, value: c.value,
      cost: c.actionCost, target: c.target, desc: c.description
    });
  }

  // ---- simulated battle -------------------------------------------------

  function livingAllies() {
    return M.battle.allies.filter(function (u) { return u.alive; });
  }
  function livingFoes() {
    return M.battle.enemies.filter(function (u) { return u.alive; });
  }
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
      c.shield = 3;   // Bulwark, the knight's passive — visible from turn one
      return c;
    });
    if (M.mercenary) {
      var merc = clone(M.mercenary);
      merc.side = 'PLAYER';
      merc.position = allies.length;
      allies.push(merc);
    }
    var foes = [
      unit({
        id: 'foe-raider', name: 'Husk Raider', element: 'SHADOW', side: 'ENEMY',
        hp: 16, speed: 3, position: 0, leader: true, size: 'LARGE',
        abilities: [spec({ name: 'Rusted Cleave', element: 'SHADOW', effect: 'DAMAGE', value: 4, cost: 1, target: 'ENEMY_SINGLE', desc: 'Hacks one Siegeling for 4.' })]
      }),
      unit({
        id: 'foe-whelp', name: 'Gloom Whelp', element: 'SHADOW', side: 'ENEMY',
        hp: 10, speed: 2, position: 1,
        abilities: [spec({ name: 'Spite Nip', element: 'SHADOW', effect: 'DAMAGE', value: 3, cost: 1, target: 'ENEMY_SINGLE', desc: 'Bites one Siegeling for 3.' })]
      })
    ];
    foes.forEach(function (f) { f.side = 'ENEMY'; });

    M.battle = {
      phase: 'PLAYER_INPUT', roundNumber: 1, playerActsFirst: true,
      playerSpeed: 0, enemySpeed: 0,
      actionPoints: MAX_AP, maxActionPoints: MAX_AP, handMax: HAND_MAX,
      leadId: allies.length ? allies[0].id : null, nodeType: 'BATTLE',
      deckCount: 0, discardCount: 0, log: ['The Husk Raider bars the Ruined Gate.'],
      turnLog: [], knight: null, allies: allies, enemies: foes,
      targetedPositions: [], sweepIncoming: false, events: [],
      hand: [], deck: [], discard: [],
      _draw: M.deckTemplates.slice(), _hand: [], _discard: []
    };
    shuffleIntents();
    syncSpeeds();
    refillKnight();
    drawTo(HAND_MAX);
    syncPiles();
  }

  function refillKnight() {
    var k = M.knight;
    M.battle.knight = {
      id: 'knight-unit', name: k.name, element: k.element, hp: k.hp, maxHp: k.maxHp,
      artUrl: null, level: k.level, xp: k.xp, xpToNext: k.xpToNext, xpInLevel: k.xpInLevel,
      xpSpan: k.xpSpan, leveledThisBattle: false,
      charge: M.battle.knight ? M.battle.knight.charge : 0, ultCost: ULT_COST,
      passiveKind: k.passiveKind, passiveName: k.passiveName, passive: k.passive,
      ultimateName: k.ultimateName, ultimateDesc: k.ultimateDesc, ultimateValue: k.ultimateValue,
      ultReady: false
    };
    syncUlt();
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
      var ability = f.abilities[0];
      var mark = allies.length ? allies[i % allies.length] : null;
      f.intent = {
        name: ability.name, effect: 'DAMAGE', value: ability.value,
        sweep: false, position: mark ? mark.position : -1
      };
    });
    M.battle.targetedPositions = livingFoes().map(function (f) { return f.intent.position; });
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
    b.hand = b._hand.map(function (c, i) { return handCard(c, i, b.actionPoints); });
    b.deck = b._draw.map(pileCard);
    b.discard = b._discard.slice().reverse().map(pileCard);
    b.deckCount = b._draw.length;
    b.discardCount = b._discard.length;
    syncUlt();
  }
  function pileCard(c) {
    return {
      instanceId: c.instanceId, name: c.name, element: c.element, effect: c.effect,
      value: c.value, target: c.target, actionCost: c.actionCost,
      description: c.description, ownerId: c.ownerId, ownerName: c.ownerName
    };
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

  function logLine(line) {
    M.battle.log.push(line);
    M.battle.turnLog.push({ round: M.battle.roundNumber, text: line, cost: -1 });
  }

  function playCard(cardId, targetId) {
    var b = M.battle;
    if (!b || b.phase !== 'PLAYER_INPUT') return;
    var i = -1;
    b._hand.forEach(function (c, n) { if (c.instanceId === cardId) i = n; });
    if (i < 0) return;
    var card = b._hand[i];
    if (b.actionPoints < card.actionCost) { M.error = 'Not enough AP for that card.'; return; }
    b._hand.splice(i, 1);
    b._discard.push(card);
    b.actionPoints -= card.actionCost;
    b.knight.charge = Math.min(b.knight.ultCost, b.knight.charge + 2);
    flags.played++;

    var owner = findUnit(card.ownerId) || b.knight;
    var events = [{ type: 'card', sourceId: owner.id, name: card.name, element: card.element }];
    b.turnLog.push({
      round: b.roundNumber, actor: owner.name, card: card.name,
      cost: card.actionCost, text: owner.name + ' uses ' + card.name + '.'
    });

    if (card.effect === 'DAMAGE') {
      var foe = findUnit(targetId);
      if (!foe || !foe.alive || foe.side !== 'ENEMY') foe = livingFoes()[0];
      if (foe) {
        var power = card.value + (owner.attackBuff || 0);
        var ko = damage(foe, power, events, owner.id, card.element);
        logLine(owner.name + ' hits ' + foe.name + ' for ' + power + '.');
        if (ko) logLine(foe.name + ' is destroyed!');
      }
    } else if (card.effect === 'HEAL') {
      var ally = findUnit(targetId);
      if (!ally || !ally.alive || ally.side !== 'PLAYER') ally = livingAllies()[0];
      if (ally) {
        ally.hp = Math.min(ally.maxHp, ally.hp + card.value);
        events.push({ type: 'heal', targetId: ally.id, amount: card.value, vitals: vitalsOf([ally.id]) });
        logLine(ally.name + ' recovers ' + card.value + ' HP.');
      }
    } else if (card.effect === 'SHIELD') {
      var me = findUnit(card.ownerId) || livingAllies()[0];
      if (me) {
        me.shield = (me.shield || 0) + card.value;
        events.push({ type: 'shield', targetId: me.id, amount: card.value, vitals: vitalsOf([me.id]) });
        logLine(me.name + ' raises a ' + card.value + ' shield.');
      }
    } else if (card.effect === 'BUFF_ATTACK') {
      var ids = [];
      livingAllies().forEach(function (a) { a.attackBuff += card.value; ids.push(a.id); });
      events.push({ type: 'buff', kind: 'atk', amount: card.value, targetIds: ids });
      logLine('The warband hits for +' + card.value + '.');
    }

    drawTo(Math.max(b._hand.length, 0));
    syncSpeeds();
    finishIfWon(events);
    syncPiles();
    b.events = events;
  }

  function useUltimate() {
    var b = M.battle;
    if (!b || b.knight.charge < b.knight.ultCost) { M.error = 'The Ultimate is not charged yet.'; return; }
    b.knight.charge = 0;
    flags.ulted = true;
    var events = [{ type: 'ultimate', name: M.knight.ultimateName, element: 'LIGHT' }];
    livingAllies().forEach(function (a) {
      a.shield = (a.shield || 0) + 6;
      events.push({ type: 'shield', targetId: a.id, amount: 6, vitals: vitalsOf([a.id]) });
    });
    // Sourced from the lead Siegeling, not the knight: the knight has no sprite
    // on the field, and a projectile with no source silently skips its flight.
    var caster = livingAllies()[0];
    livingFoes().forEach(function (f) { damage(f, 5, events, caster ? caster.id : b.knight.id, 'LIGHT'); });
    logLine(M.knight.name + ' unleashes ' + M.knight.ultimateName + '!');
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
      var intent = f.intent;
      var mark = null;
      livingAllies().forEach(function (a) { if (a.position === intent.position) mark = a; });
      if (!mark) mark = livingAllies()[0];
      events.push({ type: 'enemyAct', sourceId: f.id, name: intent.name, element: f.element });
      if (mark) {
        damage(mark, intent.value, events, f.id, f.element);
        logLine(f.name + ' hits ' + mark.name + ' for ' + intent.value + '.');
      }
    });

    if (!livingAllies().length) {
      b.phase = 'LOST';
      b.events = events;
      syncPiles();
      return;
    }

    b.roundNumber++;
    b.actionPoints = MAX_AP;
    // Round 2 always opens with a charged Ultimate: the tutorial has to be able
    // to teach it, and a player who spent every point in round 1 would otherwise
    // never see the button light up.
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

    M.party.forEach(function (p) { p.xp += 30; });
    M.party[0].level = 2;
    M.party[0].leveledThisBattle = true;
    M.party[0].maxHp += 4;
    M.party[0].hp = M.party[0].maxHp;

    M.xpRecap = {
      totalAwarded: 60,
      units: M.party.map(function (p) {
        return {
          id: p.id, name: p.name, element: p.element, xpGained: 30,
          levelBefore: p.leveledThisBattle ? 1 : 1, levelAfter: p.level,
          leveledUp: !!p.leveledThisBattle
        };
      }),
      levelUps: [{ name: M.party[0].name, levelAfter: 2 }]
    };

    M.ampChoice = {
      unitId: M.party[0].id, unitName: M.party[0].name, element: M.party[0].element,
      artUrl: null, level: 2, levelBefore: 1, hpGained: 4, maxHp: M.party[0].maxHp,
      options: [
        { id: 'amp-power', moveName: 'Ember Lash', kind: 'VALUE', label: '+2 power', element: 'FIRE', desc: 'Ember Lash bites harder every time it is played.', beforeValue: 6, afterValue: 8, beforeCost: 1, afterCost: 1, riderValue: 0 },
        { id: 'amp-cost', moveName: 'Cinder Guard', kind: 'COST', label: '−1 AP', element: 'FIRE', desc: 'Cinder Guard becomes free to hold up.', beforeValue: 4, afterValue: 4, beforeCost: 1, afterCost: 0, riderValue: 0 },
        { id: 'amp-heal', moveName: 'Ember Lash', kind: 'SWAP_HEAL', label: 'Heals on arrival', element: 'FIRE', desc: 'Ember Lash also heals Emberling for 2.', beforeValue: 6, afterValue: 6, beforeCost: 1, afterCost: 1, riderValue: 2 }
      ]
    };

    M.pendingRewards = [
      { id: 'rw-card', kind: 'CARD', title: 'Flame Volley', desc: 'A second heavy Fire attack for the deck.', element: 'FIRE', artUrl: null, cardEffect: 'DAMAGE', cardValue: 8, cardCost: 2, cardTarget: 'ENEMY_SINGLE' },
      { id: 'rw-item', kind: 'ITEM', title: 'Emberheart Charm', desc: 'Equip to a Siegeling: +2 attack for the run.', element: 'FIRE', artUrl: null, itemId: 'tut-charm', itemIcon: '🔥' },
      { id: 'rw-upgrade', kind: 'UPGRADE', title: 'Warband Tonic', desc: 'Heal every Siegeling to full.', element: 'WATER', artUrl: null }
    ];

    M.recruit = {
      id: 'ally-grove', name: 'Grovelet', element: 'EARTH', stage: 2,
      hp: 32, speed: 4, moveCount: 2, artUrl: null
    };
    M.lastReward = 'Victory at the Ruined Gate — 48 gold.';
  }

  function claimRecruit() {
    var r = M.recruit;
    M.recruit = null;
    if (!r) return;
    var grove = unit({ id: 'ally-grove', name: 'Grovelet', element: 'EARTH', hp: 32, speed: 4, position: 2 });
    var cards = [
      { instanceId: 'c8', ownerId: 'ally-grove', ownerName: 'Grovelet', name: 'Root Slam', element: 'EARTH', effect: 'DAMAGE', value: 7, actionCost: 2, target: 'ENEMY_SINGLE', description: 'Slam one foe for 7.' },
      { instanceId: 'c9', ownerId: 'ally-grove', ownerName: 'Grovelet', name: 'Bark Ward', element: 'EARTH', effect: 'SHIELD', value: 6, actionCost: 1, target: 'SELF', description: 'Grovelet gains 6 shield.' }
    ];
    grove.cards = cards.map(specOfCard);
    M.party.push(grove);
    addCards(cards);
    flags.claimed = true;
  }

  function addCards(cards) {
    cards.forEach(function (c) { M.deckTemplates.push(c); });
    M.deckSize = M.deckTemplates.length;
    M.deckList = M.deckTemplates.map(function (c, i) {
      return { index: i, name: c.name, element: c.element, owner: c.ownerName };
    });
  }

  function markCleared(nodeId) {
    M.map.forEach(function (n) { if (n.id === nodeId) n.cleared = true; });
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

  // ---- stop content -----------------------------------------------------

  function openStop(nodeId) {
    M.currentNodeId = nodeId;
    var node = null;
    M.map.forEach(function (n) { if (n.id === nodeId) node = n; });
    if (!node) return;
    M.lastReward = '';
    if (node.type === 'BATTLE') { startBattle(); return; }
    if (node.type === 'REST') {
      M.camp = {
        note: 'A banked fire, a trader, and a broker share the clearing.',
        options: [
          campOpt('camp-rest', 'REST', 'Rest by the fire', 'Heal every Siegeling for 12 HP.', 0),
          campOpt('camp-upgrade', 'SHOP_UPGRADE', 'Whetstone', 'Ember Lash: power 6 → 8.', 25),
          campOpt('camp-card', 'SHOP_CARD', 'Guard Stance', 'Add a 5-shield card to the deck.', 30)
        ]
      };
      return;
    }
    if (node.type === 'CARAVAN') {
      M.caravan = {
        options: [
          campOpt('cv-item', 'SHOP_ITEM', 'Ironbark Ward', 'Equip: +4 max HP for the run.', 35, item('tut-ward', 'Ironbark Ward', '🪵', 'HEALTH', 4, '+4 max HP', 'Field equipment.')),
          campOpt('cv-card', 'SHOP_CARD', 'Flame Volley', 'FIRE · 8 damage · 2 AP.', 45),
          campOpt('cv-heal', 'SHOP_HEAL', 'Hot Rations', 'Heal the warband 8 HP each.', 20)
        ]
      };
      return;
    }
    if (node.type === 'BROKER') {
      M.broker = {
        hireCost: 60, swapCost: 45, merc: false, mercUnderContract: false, partyFull: false,
        offers: [
          {
            id: 'br-merc', kind: 'MERC', merc: true, cost: 40, name: 'Ashvane the Sellsword',
            element: 'METAL', artUrl: null, used: false, hp: 28, speed: 6, evolves: false,
            moves: [spec({ name: 'Coin Cut', element: 'METAL', effect: 'DAMAGE', value: 7, cost: 1, target: 'ENEMY_SINGLE', desc: 'Strike for 7.' })]
          },
          {
            id: 'br-hire', kind: 'HIRE', merc: false, cost: 60, name: 'Stormkit',
            element: 'ELECTRIC', artUrl: null, used: false, hp: 26, speed: 8, evolves: true,
            moves: [spec({ name: 'Static Pounce', element: 'ELECTRIC', effect: 'DAMAGE', value: 6, cost: 1, target: 'ENEMY_SINGLE', desc: 'Strike for 6.' })]
          }
        ]
      };
      return;
    }
    if (node.type === 'SMITH') {
      M.smith = {
        options: [
          campOpt('sm-1', 'UPGRADE', 'Chisel Ember Lash', 'Ember Lash → Ember Lash+ (power 6 → 9)', 0),
          campOpt('sm-2', 'UPGRADE', 'Chisel Tide Splash', 'Tide Splash → Tide Splash+ (power 5 → 8)', 0),
          campOpt('sm-3', 'UPGRADE', 'Chisel Spring Tide', 'Spring Tide → Spring Tide+ (heal 5 → 8)', 0)
        ]
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

  function campOpt(id, kind, title, desc, cost, itm) {
    var o = {
      id: id, kind: kind, title: title, desc: desc, cost: cost, element: null,
      artUrl: null, used: false, affordable: true, templateIndex: -1
    };
    if (itm) o.item = itm;
    return o;
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
    refreshAffordable();
  }
  function refreshAffordable() {
    ['camp', 'caravan', 'smith', 'event', 'cache'].forEach(function (k) {
      var stop = M[k];
      if (stop && stop.options) {
        stop.options.forEach(function (o) { o.affordable = M.gold >= (o.cost || 0); });
      }
    });
  }

  // ---- the fake server --------------------------------------------------

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
    switch (path) {
      case '/api/siege/node/enter':
        openStop(Number(body.nodeId));
        return;

      case '/api/siege/battle/play':
        playCard(body.cardId, body.targetId);
        return;
      case '/api/siege/battle/end-turn':
        endTurn();
        return;
      case '/api/siege/battle/ultimate':
        useUltimate();
        return;
      case '/api/siege/continue':
        battleSpoils();
        return;

      case '/api/siege/recruit/ack':
        claimRecruit();
        return;
      case '/api/siege/level/amp': {
        var amp = M.ampChoice;
        if (amp && body.optionId !== 'skip') {
          M.lastReward = amp.unitName + ' amplified a card.';
        }
        M.ampChoice = null;
        return;
      }
      case '/api/siege/reward/choose': {
        var pick = null;
        (M.pendingRewards || []).forEach(function (r) { if (r.id === body.optionId) pick = r; });
        if (pick) {
          if (pick.kind === 'ITEM') M.inventory.push(item('tut-charm', 'Emberheart Charm', '🔥', 'ATTACK', 2, '+2 attack', 'Run-long equipment for one Siegeling.'));
          else if (pick.kind === 'CARD') {
            addCards([{ instanceId: 'c10', ownerId: M.party[0].id, ownerName: M.party[0].name, name: 'Flame Volley', element: 'FIRE', effect: 'DAMAGE', value: 8, actionCost: 2, target: 'ENEMY_SINGLE', description: 'Strike one foe for 8.' }]);
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
          addCards([{ instanceId: 'c11', ownerId: M.party[0].id, ownerName: M.party[0].name, name: 'Guard Stance', element: 'NEUTRAL', effect: 'SHIELD', value: 5, actionCost: 1, target: 'SELF', description: 'Gain 5 shield.' }]);
          M.lastReward = 'Guard Stance joins the deck.';
        } else M.lastReward = 'Ember Lash sharpened — power 6 → 8.';
        flags.camped = true;
        return;
      }
      case '/api/siege/camp/leave':
        M.camp = null;
        markCleared(M.currentNodeId);
        M.stats.nodesCleared++;
        return;

      case '/api/siege/caravan/buy': {
        var vopt = markOptionUsed(M.caravan && M.caravan.options, body.optionId);
        if (!vopt) return;
        spend(vopt.cost);
        if (vopt.kind === 'SHOP_ITEM') {
          M.inventory.push(item('tut-ward', 'Ironbark Ward', '🪵', 'HEALTH', 4, '+4 max HP', 'Field equipment.'));
          M.lastReward = 'Ironbark Ward stowed in the backpack.';
        } else if (vopt.kind === 'SHOP_CARD') {
          addCards([{ instanceId: 'c12', ownerId: M.party[0].id, ownerName: M.party[0].name, name: 'Flame Volley', element: 'FIRE', effect: 'DAMAGE', value: 8, actionCost: 2, target: 'ENEMY_SINGLE', description: 'Strike one foe for 8.' }]);
          M.lastReward = 'Flame Volley joins the deck.';
        } else { healParty(8); M.lastReward = 'Hot rations all round. +8 HP each.'; }
        flags.bought = true;
        return;
      }
      case '/api/siege/caravan/leave':
        M.caravan = null;
        markCleared(M.currentNodeId);
        M.stats.nodesCleared++;
        return;

      case '/api/siege/broker/hire': {
        var offer = null;
        (M.broker.offers || []).forEach(function (o) { if (o.id === body.optionId) offer = o; });
        if (!offer) return;
        spend(offer.cost);
        offer.used = true;
        if (offer.kind === 'MERC') {
          M.broker.mercUnderContract = true;
          M.mercenary = unit({ id: 'merc-ash', name: offer.name + ' (Merc)', element: offer.element, hp: offer.hp, speed: offer.speed, position: 3 });
          M.mercenary.merc = true;
          M.mercenary.cards = offer.moves;
          M.lastReward = offer.name + ' rides with you for the next battle.';
          flags.rented = true;
        } else {
          var hired = unit({ id: 'ally-storm', name: offer.name, element: offer.element, hp: offer.hp, speed: offer.speed, position: M.party.length });
          hired.cards = offer.moves;
          M.party.push(hired);
          M.lastReward = offer.name + ' joins the warband.';
          flags.rented = true;
        }
        return;
      }
      case '/api/siege/broker/leave':
        M.broker = null;
        markCleared(M.currentNodeId);
        M.stats.nodesCleared++;
        return;

      case '/api/siege/smith/choose': {
        var sopt = markOptionUsed(M.smith && M.smith.options, body.optionId);
        M.smith = null;
        markCleared(M.currentNodeId);
        M.stats.nodesCleared++;
        M.lastReward = sopt ? (sopt.title.replace('Chisel ', '') + ' is awakened.') : 'A card was scrapped.';
        flags.smithed = true;
        return;
      }
      case '/api/siege/smith/leave':
        M.smith = null;
        markCleared(M.currentNodeId);
        M.stats.nodesCleared++;
        return;

      case '/api/siege/cache/dig': {
        M.cache.digs++;
        M.cache.loot += 22;
        M.cache.bustChance = Math.min(85, 15 + M.cache.digs * 20);
        M.lastReward = 'You pry loose another 22 gold. The shaft groans.';
        flags.dug++;
        return;
      }
      case '/api/siege/cache/take':
        M.gold += M.cache.loot;
        M.stats.goldEarned += M.cache.loot;
        M.lastReward = 'Banked ' + M.cache.loot + ' gold.';
        M.cache = null;
        markCleared(M.currentNodeId);
        M.stats.nodesCleared++;
        flags.banked = true;
        return;
      case '/api/siege/cache/choose':
        M.cache = null;
        markCleared(M.currentNodeId);
        return;

      case '/api/siege/event/choose': {
        var eopt = null;
        (M.event.options || []).forEach(function (o) { if (o.id === body.optionId) eopt = o; });
        if (eopt && eopt.id === 'ev-power') {
          M.party.forEach(function (p) { p.hp = Math.max(1, p.hp - 4); });
          M.lastReward = 'The stone drinks. Your warband hits harder.';
        } else if (eopt && eopt.id === 'ev-gold') {
          M.gold += 30;
          M.stats.goldEarned += 30;
          M.lastReward = 'A shard of the monolith is worth 30 gold.';
        } else {
          M.lastReward = 'You leave the stone humming behind you.';
        }
        M.event = null;
        markCleared(M.currentNodeId);
        M.stats.nodesCleared++;
        flags.evented = true;
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

      case '/api/siege/result/ack':
        M.lastReward = '';
        return;

      case '/api/siege/run/save':
        M.checkpoint = true;
        return;
      default:
        return;
    }
  }

  // ---- the coach --------------------------------------------------------

  function step(o) { return o; }

  function buildSteps() {
    return [
      step({
        title: 'Welcome to the Siege',
        body: 'This is a full practice expedition. Nothing here touches your account — no gold spent, no saves written. I will walk you to every kind of stop on the map and show you what to do at each one.',
        kicker: 'Tutorial'
      }),
      step({
        title: 'The expedition map',
        target: '#mapSvg',
        body: 'A Siege run is a branching path read bottom to top. You travel one node at a time, and every node you clear is gone for good — the route you pick <em>is</em> the run.'
      }),
      step({
        title: 'What the emblems mean',
        target: '#mapKeyBtn',
        body: 'Each node type has its own emblem. Tap <b>🗝️ Key</b> to read them.',
        until: function () { return !hidden('legendOverlay'); }
      }),
      step({
        title: 'Read the key',
        target: '.legend-panel',
        body: 'Fights, camps, caches, shops and the Siegelord all live on this list, along with what the ring around a node means. Close it when you are done.',
        until: function () { return hidden('legendOverlay'); }
      }),
      step({
        title: 'Your warband',
        target: '#partyStrip',
        body: 'Your SiegeKnight leads two Siegelings. Every Siegeling contributes its moves to one shared deck. <b>Tap a Siegeling</b> to read its cards.',
        until: function () { return !hidden('unitModal'); }
      }),
      step({
        title: 'Cards come from Siegelings',
        target: '#unitModalCard',
        body: 'These are the moves this Siegeling puts into the deck. Lose the Siegeling and its cards go dead — protecting your line is protecting your hand. Close this when you have looked.',
        until: function () { return hidden('unitModal'); }
      }),
      step({
        title: 'Navigate',
        target: '.map-node-g.reachable',
        body: 'A pulsing ring means you can travel there. <b>Tap the ⚔️ Ruined Gate</b> to start the first fight.',
        until: function () { return screenIs('battleScreen'); }
      }),

      step({
        title: 'Who moves first',
        target: '#speedTrack',
        body: 'Combat is round-based. Your side\'s total <b>Speed</b> against theirs decides who acts first — the runners on this track are your Siegelings at their speed.'
      }),
      step({
        title: 'Passive and Ultimate',
        target: '#knightPlate',
        body: 'Your SiegeKnight does not attack. It contributes a <b>passive</b> — Bulwark, so every Siegeling opened this fight with 3 shield — and charges an <b>Ultimate</b> on the bar below its HP. Tap the plate any time to read both.'
      }),
      step({
        title: 'Action Points',
        target: '#apDisplay',
        body: 'Every card costs AP, and you get ' + MAX_AP + ' per turn. Unspent AP is not wasted: it converts into Ultimate Charge when you end the turn.'
      }),
      step({
        title: 'Your hand',
        target: '#handRow',
        body: 'The fan is your hand. Each card belongs to one Siegeling — its owner is the one who swings, so buffs on that Siegeling change what the card does.'
      }),
      step({
        title: 'Foes telegraph their attacks',
        target: '#enemyRow',
        body: 'Each foe shows its <b>intent</b>: the move it will use and the notch it will hit. A ▼ marker over one of your Siegelings means that blow is aimed at it — shield it, heal it, or kill the attacker first.'
      }),
      step({
        title: 'Targeting',
        target: '#handRow',
        body: '<b>Drag an attack card onto a foe</b> to play it. Cards that need a target draw an arrow while you drag; drop it on the enemy you want.',
        until: function () { return flags.played > 0; }
      }),
      step({
        title: 'End the turn',
        target: '#endTurnBtn',
        body: 'Spend what is worth spending, then <b>End Turn</b>. The foes act on the intents they showed you, and a fresh hand is dealt.',
        until: function () { return M.battle && M.battle.roundNumber > 1; }
      }),
      step({
        title: 'The Ultimate',
        target: '#knightUltBtn',
        body: 'The charge bar is full. <b>Tap ⚡ ULT!</b> — Aegis Wall shields your whole warband and blasts every foe at once. It is your emergency button; spend it deliberately.',
        until: function () { return flags.ulted; },
        skipIf: function () { return !M.battle; }
      }),
      step({
        title: 'Finish the fight',
        target: '#handRow',
        body: 'Play out the rest of the fight — attack, end turn, repeat — until both foes are down.',
        until: function () { return !M.battle || M.battle.phase === 'WON'; }
      }),
      step({
        title: 'Claim the spoils',
        target: '#handRow',
        body: 'Victory. Tap <b>Claim Rewards</b> to collect XP, gold and a pick.',
        until: function () { return !screenIs('battleScreen'); }
      }),

      step({
        title: 'Claiming a Siegeling',
        target: '#gachaClaimBtn',
        body: 'A wild Siegeling wants to join. Claiming it adds it to your warband <em>and</em> adds its moves to your shared deck. <b>Tap Claim</b>.',
        until: function () { return flags.claimed; },
        skipIf: function () { return !M.recruit && !flags.claimed; }
      }),
      step({
        title: 'Level up',
        target: '#ampGrid',
        body: 'Siegelings earn XP from every fight. A level restores health, adds max HP, and lets that Siegeling <b>amplify one of its own cards</b> permanently. <b>Pick one.</b>',
        until: function () { return !M.ampChoice; },
        skipIf: function () { return !M.ampChoice; }
      }),
      step({
        title: 'Choose a reward',
        target: '#rewardGrid',
        body: 'Now the spoils: a new card, an item to equip, or a heal. Cards thicken the deck; items are permanent stat gear. <b>Take one.</b>',
        until: function () { return flags.rewarded; },
        skipIf: function () { return !(M.pendingRewards && M.pendingRewards.length) && !flags.rewarded; }
      }),

      step({
        title: 'Resting',
        target: '.map-node-g.reachable',
        body: 'Back to the map — the cleared node is marked ✓. <b>Travel to the 🏕️ Ember Camp.</b>',
        until: function () { return screenIs('campScreen'); }
      }),
      step({
        title: 'The rest camp',
        target: '#campGrid',
        body: 'A camp gives one free <b>Rest</b> (healing the whole warband) plus a trader and a broker behind their own menus. Shopping does not spend the rest. <b>Take the rest.</b>',
        until: function () { return flags.camped; }
      }),
      step({
        title: 'Break camp',
        target: '#campLeaveBtn',
        body: 'Browse the trader if you like, then <b>Break Camp</b> to return to the map.',
        until: function () { return screenIs('mapScreen'); }
      }),

      step({
        title: 'Purchasing',
        target: '.map-node-g.reachable',
        body: '<b>Travel to the 🐫 Dust Caravan</b> — the run\'s shop.',
        until: function () { return screenIs('caravanScreen'); }
      }),
      step({
        title: 'Buy an item or a card',
        target: '#caravanGrid',
        body: 'Gold buys three kinds of thing: <b>items</b> you equip to a Siegeling, <b>cards</b> that join the shared deck, and healing. <b>Buy the Ironbark Ward</b> so we can equip it next.',
        until: function () { return flags.bought; }
      }),
      step({
        title: 'Move on',
        target: '#caravanLeaveBtn',
        body: 'Bought goods go straight into the backpack. <b>Move On</b> when you are done shopping.',
        until: function () { return screenIs('mapScreen'); }
      }),
      step({
        title: 'Equipping',
        target: '#inventoryBtn',
        body: 'Items do nothing in the backpack. Open <b>🎒 Items</b>.',
        until: function () { return !hidden('invOverlay'); }
      }),
      step({
        title: 'One item per Siegeling',
        target: '#invBag',
        body: '<b>Tap an item in the backpack, then tap a Siegeling</b> to equip it. Each Siegeling holds one item at a time; the ✕ on a filled slot returns it to the bag. The Knight\'s Bag above holds consumables you can use here or mid-battle.',
        until: function () { return flags.equipped; }
      }),
      step({
        title: 'Close the bag',
        target: '#invClose',
        body: 'Equipped. Close the inventory to carry on.',
        until: function () { return hidden('invOverlay'); }
      }),

      step({
        title: 'Renting',
        target: '.map-node-g.reachable',
        body: '<b>Travel to the 🐾 Merc Post.</b>',
        until: function () { return screenIs('brokerScreen'); }
      }),
      step({
        title: 'Hire or rent',
        target: '#brokerGrid',
        body: 'The broker sells two different things. <b>Hire</b> adds a Siegeling to the warband permanently. <b>Rent</b> takes a mercenary who fights your <em>next battle only</em>, then leaves — cheap muscle for a fight you expect to be ugly. <b>Rent Ashvane.</b>',
        until: function () { return flags.rented; }
      }),
      step({
        title: 'Move on',
        target: '#brokerLeaveBtn',
        body: 'Your rental now stands with the warband at every stop until its battle is fought. <b>Move On.</b>',
        until: function () { return screenIs('mapScreen'); }
      }),

      step({
        title: 'The forge',
        target: '.map-node-g.reachable',
        body: '<b>Travel to the 🔨 Old Forge.</b>',
        until: function () { return screenIs('smithScreen'); }
      }),
      step({
        title: 'Upgrading a card',
        target: '#smithGrid',
        body: 'The smith permanently awakens one card in your deck into a stronger form. You can also <b>Scrap a card</b> to thin the deck so your best cards come up more often. <b>Pick an upgrade.</b>',
        until: function () { return screenIs('mapScreen'); }
      }),

      step({
        title: 'The cache',
        target: '.map-node-g.reachable',
        body: '<b>Travel to the 💎 Buried Cache.</b>',
        until: function () { return screenIs('cacheScreen'); }
      }),
      step({
        title: 'Press your luck',
        target: '#cacheDigBtn',
        body: 'A cache is a gamble: every dig adds gold and raises the collapse risk on the bar. <b>Dig Deeper</b> once.',
        until: function () { return flags.dug > 0; }
      }),
      step({
        title: 'Know when to stop',
        target: '#cacheTakeBtn',
        body: 'Loot is unbanked until you take it — a collapse costs you everything in the shaft. <b>Bank the Loot.</b>',
        until: function () { return screenIs('mapScreen'); }
      }),

      step({
        title: 'Events',
        target: '.map-node-g.reachable',
        body: '<b>Travel to the ❔ Standing Stone.</b>',
        until: function () { return screenIs('eventScreen'); }
      }),
      step({
        title: 'Choices with a price',
        target: '#eventChoices',
        body: 'Events trade something for something: HP for power, safety for coin. There is no wrong answer, only what the run needs. <b>Choose one.</b>',
        until: function () { return screenIs('mapScreen'); }
      }),

      step({
        title: 'The Siegelord',
        target: '.map-node-g.type-BOSS',
        body: 'The 👑 node at the top of every stage is the Siegelord. Clearing it ends the stage — and in a real run, winning banks your leveled team for Battlegrounds.'
      }),
      step({
        title: 'That is the loop',
        body: 'Travel, fight, spend, and arrive at the boss stronger than the map expected. Nothing you did here was saved — start a real expedition whenever you are ready.',
        kicker: 'Tutorial complete',
        finish: true
      })
    ];
  }

  // ---- coach overlay ----------------------------------------------------

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

  function advance() {
    idx++;
    while (idx < STEPS.length && STEPS[idx].skipIf && STEPS[idx].skipIf()) idx++;
    if (idx >= STEPS.length) { stop(); return; }
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
    var n = idx + 1, total = STEPS.length;
    cardEl.innerHTML =
      '<div class="tut-head">' +
        '<span class="tut-kicker">' + esc(s.kicker || ('Step ' + n + ' of ' + total)) + '</span>' +
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
    var shown = idx + (det ? '|detour' : '|step');
    if (shown !== renderedKey) { renderedKey = shown; renderStep(); return; }
    var node = targetNode(det || s);
    var r = node ? node.getBoundingClientRect() : null;
    var key = r ? [r.left, r.top, r.width, r.height].join(',') : 'none';
    if (key !== lastRect) { lastRect = key; position(); }
  }

  // ---- lifecycle --------------------------------------------------------

  function start() {
    if (ACTIVE) return;
    ACTIVE = true;
    M = buildModel();
    flags = { played: 0, dug: 0, ulted: false, claimed: false, rewarded: false, camped: false, bought: false, equipped: false, rented: false, smithed: false, evented: false, banked: false, reachedBoss: false };
    STEPS = buildSteps();
    idx = -1;
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
