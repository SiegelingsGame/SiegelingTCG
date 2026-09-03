/* Arena — guided Tutorial Match coach.
 *
 * The Siege tutorial simulates its expedition; this one does not, and does not
 * need to. The Arena tutorial match is already pinned server-side — Squire Bob
 * with Ashen Roots against a fixed Ice Training Dummy, the player always first,
 * the partner started on reduced health — so every run deals the same board and
 * the script can simply FOLLOW the real match. Nothing here fakes a response or
 * writes into game state: each step names what to touch and waits for the live
 * `gameState` to show the player did it.
 *
 * That is also why the steps are written as predicates over state rather than
 * as a fixed sequence of taps. A player who places on a different cell, casts a
 * different Strategy, or takes an extra round to finish the Dummy still walks
 * the same lesson list — the coach waits for the *kind* of thing to happen, not
 * for one exact move.
 *
 * The overlay itself is coach.js, shared with Siege.
 *
 * ES5-flavoured to match game.js's older half and siege-tutorial.js.
 */
(function () {
  'use strict';

  var ACTIVE = false;
  /** Latched observations: things a single state snapshot cannot show, such as
   *  "a Siegeling died at some point during that battle phase". */
  var seen = null;
  var linkBaseline = null;   // elemental energy when the same-element lesson opened
  var watchRaf = 0;

  /** game.js declares its state with `let`, which in a classic script is
   *  script-scoped and never lands on window — so it hands us a reader instead
   *  of us reaching for a global that would always read undefined. */
  function bridge() { return window.ArenaTutorialBridge || null; }
  function gs() { var b = bridge(); return b ? b.state() : null; }
  function phase() { var g = gs(); return g ? g.currentPhase : null; }
  function myTurn() { var g = gs(); return !!g && g.activeSide === 'PLAYER'; }
  function turn() { var g = gs(); return g ? (g.turnNumber || 0) : 0; }

  function boardCount(board) {
    var n = 0;
    (board || []).forEach(function (row) {
      (row || []).forEach(function (c) { if (c) n++; });
    });
    return n;
  }

  function mine() { var g = gs(); return g ? boardCount(g.playerBoard) : 0; }
  function theirs() { var g = gs(); return g ? boardCount(g.enemyBoard) : 0; }

  function hand() { var g = gs(); return (g && g.player && g.player.hand) || []; }
  function handHas(type) {
    return hand().some(function (c) { return c && c.type === type; });
  }
  function selectedType() {
    var b = bridge();
    var card = b ? b.selected() : null;
    return card ? card.type : null;
  }

  var ENERGY_KEYS = ['fire', 'earth', 'wind', 'water', 'ice', 'shadow', 'poison', 'electric', 'metal', 'psychic', 'light', 'undead'];

  function playerEnergyTotal() {
    var g = gs();
    if (!g || !g.player) return 0;
    var total = 0;
    ENERGY_KEYS.forEach(function (key) {
      total += Number(g.player[key + 'Energy'] || 0);
    });
    return total;
  }

  /** Energy actually banked in the elemental pools — what a SAME-ELEMENT link
   *  pays. A combo goes to comboPoints instead, so the two are distinguishable
   *  and each lesson can wait for the thing it is actually teaching. */
  function elementalEnergy() { return playerEnergyTotal(); }

  /** A hand card that actually asks for energy, or null. The tutorial's starter
   *  Sieglings are all free (cost 0) — it is the EVOLUTIONS that carry a cost
   *  (Raydile and Dracoil are FIRE 2), so the lesson has to read the hand
   *  rather than assume a Siegling costs something. */
  function costedCard() {
    var cards = hand().filter(function (c) { return c && c.costAmount > 0 && c.costElement; });
    return cards[0] || null;
  }

  /** The cost chip the game actually renders — `.card-corner-cost`, not the
   *  summary row, which the hand fan does not use. */
  function costTarget() {
    return firstOf(['#playerHand .card-corner-cost', '#handTray .card-corner-cost', '#playerHand']);
  }

  function comboCount() {
    var g = gs();
    return g && g.player && g.player.comboPoints ? g.player.comboPoints.length : 0;
  }
  /** offsetParent is null for a position:fixed element, and the action bar and
   *  hand fan are both fixed on a phone — so measure rects instead. */
  function visible(sel) {
    var n = null;
    try { n = document.querySelector(sel); } catch (e) { return false; }
    return !!n && !!n.getClientRects && n.getClientRects().length > 0;
  }

  /**
   * A step's target may not exist yet (the legal cells only light up once a
   * Siegeling is selected). Falling back keeps the ring on something real
   * instead of dropping it to the centre of the screen mid-lesson.
   */
  function firstOf(list) {
    for (var i = 0; i < list.length; i++) { if (visible(list[i])) return list[i]; }
    return list[list.length - 1];
  }

  /** The phone collapses the action bar to a single button whose label changes
   *  with the phase, so #btnEndTurn — a desktop-only control — points at nothing
   *  there. Always ring whichever action button is actually on screen. */
  function actionBtn() {
    return firstOf(['#btnEndTurn', '#btnDraw']);
  }

  // ---- recommending the opening cell ---------------------------------------

  /**
   * How many of `card`'s notches would reach a perimeter socket from cell (r,c).
   *
   * Mirrors PlacementService.resolveExternalSocketKey for the player's side:
   * a LEFT notch in column 0, a RIGHT notch in column 2, a BOTTOM notch in
   * row 0. Diagonals never reach a socket, and a NEUTRAL notch opens no call
   * well (EnergyService.collectExternalSocketTouches skips it). This is the
   * frontend half of a server rule, so it has to stay in step with both.
   */
  function socketScore(card, r, c) {
    var notches = (card && card.notches) || [];
    var n = 0;
    notches.forEach(function (notch) {
      if (!notch || notch.element === 'NEUTRAL') return;
      var d = notch.direction;
      if ((d === 'LEFT' && c === 0) || (d === 'RIGHT' && c === 2) || (d === 'BOTTOM' && r === 0)) n++;
    });
    return n;
  }

  /**
   * The cell the coach rings for the opening placement: whichever legal cell
   * earns the selected card the most socket energy. Ringing the first legal
   * cell taught nothing — the opening play IS "reach a socket", because with
   * no neighbours to link to, a socket is the only energy on offer.
   * Falls back to the legal set, then the grid, when nothing scores.
   */
  function recommendedCell() {
    var b = bridge();
    var card = b && b.selected ? b.selected() : null;
    var cells = (b && b.legalPlacements) ? (b.legalPlacements() || []) : [];
    var best = null, bestScore = 0;
    cells.forEach(function (p) {
      var r = p[0], c = p[1];
      var score = socketScore(card, r, c);
      if (score > bestScore) { bestScore = score; best = p; }
    });
    if (!best) return firstOf(['#playerGrid .board-cell.legal', '#playerGrid']);
    var sel = '#playerGrid .board-cell[data-row="' + best[0] + '"][data-col="' + best[1] + '"]';
    return visible(sel) ? sel : firstOf(['#playerGrid .board-cell.legal', '#playerGrid']);
  }

  /** Card names come from the catalog and land inside tip HTML, so escape them
   *  here rather than trusting them. coach.js has its own copy in its closure;
   *  this file cannot see it. */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** The card the scripted mulligan lets you swap, by name. Read live rather
   *  than baked into the copy: the tip used to say "Pylook" while the slot held
   *  whatever the deal put there. */
  function swapCardName() {
    var g = gs();
    var h = (g && g.player && g.player.hand) || [];
    var allowed = g && g.mulligan && g.mulligan.allowedIndices;
    var i = (allowed && allowed.length) ? Number(allowed[0]) : h.length - 1;
    var card = h[i];
    return (card && card.name) || '';
  }

  /** The hand Siegeling that an evolution in hand grows out of — Sundile for
   *  Raydile in the pinned tutorial deal. Named live rather than hard-coded so
   *  a retuned deck cannot make the lesson point at a card you do not hold. */
  function baseOfEvolutionInHand() {
    var h = hand();
    var evo = h.filter(function (c) { return c && c.type === 'SIEGLING' && c.evolvesFromId; })[0];
    if (!evo) return null;
    var base = h.filter(function (c) { return c && c.id === evo.evolvesFromId; })[0];
    return base ? { base: base, evolution: evo } : null;
  }

  /** A plain (non-evolution) Siegeling in hand that is NOT the named base — the
   *  partner the round-two link is built with. */
  function partnerSiegling(excludeId) {
    return hand().filter(function (c) {
      return c && c.type === 'SIEGLING' && !c.evolvesFromId && c.id !== excludeId;
    })[0] || null;
  }

  var OPPOSITE_DIR = {
    TOP: 'BOTTOM', TOP_RIGHT: 'BOTTOM_LEFT', RIGHT: 'LEFT', BOTTOM_RIGHT: 'TOP_LEFT',
    BOTTOM: 'TOP', BOTTOM_LEFT: 'TOP_RIGHT', LEFT: 'RIGHT', TOP_LEFT: 'BOTTOM_RIGHT'
  };

  /** Player-side notch travel. Mirrors game.js directionDelta(dir, true), which
   *  itself mirrors the server — the player's grid is drawn flipped, so TOP
   *  walks toward increasing row on this half. */
  function playerDelta(direction) {
    switch (direction) {
      case 'TOP': return [1, 0];
      case 'TOP_RIGHT': return [1, 1];
      case 'RIGHT': return [0, 1];
      case 'BOTTOM_RIGHT': return [-1, 1];
      case 'BOTTOM': return [-1, 0];
      case 'BOTTOM_LEFT': return [-1, -1];
      case 'LEFT': return [0, -1];
      case 'TOP_LEFT': return [1, -1];
      default: return [0, 0];
    }
  }

  /** Selectors for every player cell holding a Siegeling that is in a live
   *  reciprocal link. The link lesson spotlights the two cards it is talking
   *  about; ringing the whole grid left the player hunting for them. */
  function linkedCellSelectors() {
    var g = gs();
    var board = (g && g.playerBoard) || [];
    var out = [];
    function push(r, c) {
      var sel = '#playerGrid .board-cell[data-row="' + r + '"][data-col="' + c + '"]';
      if (out.indexOf(sel) < 0 && visible(sel)) out.push(sel);
    }
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < (board[r] || []).length; c++) {
        var card = board[r][c];
        if (!card) continue;
        (card.notches || []).forEach(function (notch) {
          if (!notch || !notch.direction) return;
          var d = playerDelta(notch.direction);
          var nr = r + d[0], nc = c + d[1];
          if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
          var neighbour = board[nr] && board[nr][nc];
          if (!neighbour) return;
          var wanted = OPPOSITE_DIR[notch.direction];
          var reciprocal = (neighbour.notches || []).some(function (n) {
            return n && n.direction === wanted;
          });
          if (!reciprocal) return;
          push(r, c);
          push(nr, nc);
        });
      }
    }
    return out;
  }

  /** The turn-three combo partner: a hand Siegeling whose element is NOT already
   *  on your board. GameService hoists one (Earth, in the pinned Fire/Earth
   *  deck) to the top of the tutorial deck for the round-three draw, so this
   *  reads what actually arrived rather than naming a card by hand. */
  function comboPartnerInHand() {
    var g = gs();
    var onBoard = {};
    ((g && g.playerBoard) || []).forEach(function (row) {
      (row || []).forEach(function (c) { if (c && c.element) onBoard[c.element] = true; });
    });
    return hand().filter(function (c) {
      return c && c.type === 'SIEGLING' && !c.evolvesFromId && c.element && !onBoard[c.element];
    })[0] || null;
  }

  // ---- latching watcher ---------------------------------------------------

  /** Some lessons are about an outcome, not a tap: a Siegeling destroyed, the
   *  Knight ability spent. Those are latched here from live state, because by
   *  the time the coach next looks the board has already been redrawn. */
  function watch() {
    if (!ACTIVE) return;
    watchRaf = window.requestAnimationFrame(watch);
    var g = gs();
    if (!g) return;

    if (mine() > seen.maxMine) seen.maxMine = mine();
    if (theirs() > seen.maxTheirs) seen.maxTheirs = theirs();
    if (seen.maxTheirs > 0 && theirs() < seen.maxTheirs) seen.enemyDown = true;
    if (phase() === 'BATTLE') {
      if (turn() <= 1) seen.sawBattle = true;
      if (turn() >= 2) seen.sawBattle2 = true;
    }
    if (turn() > seen.maxTurn) seen.maxTurn = turn();
    if (g.winner) seen.ended = true;
    if (turn() >= 2 && playerEnergyTotal() > 0) seen.hadLinkEnergy = true;
    if (turn() >= 2 && comboCount() > 0) seen.hadCombo = true;
    if (handHas('TRAP') && turn() >= 2) seen.hadTrap = true;
    // `.sb-badge` is what renderStatusBadge actually emits; the earlier list here
    // (.status-badge, .sbadge, ...) matched no element in the DOM, so this only
    // ever fired off the board data below.
    if (visible('.sb-badge')) seen.sawBadge = true;

    var board = (g.playerBoard || []);
    board.forEach(function (row) {
      (row || []).forEach(function (c) {
        if (!c) return;
        if (c.evolvesFromId || c.evolved || (c.name && /raydile|flora|pyleer/i.test(c.name))) {
          seen.hadEvolution = true;
        }
        if (c.afflictions && c.afflictions.length) seen.sawBadge = true;
        if (c.statuses && c.statuses.length) seen.sawBadge = true;
      });
    });
    var eboard = (g.enemyBoard || []);
    eboard.forEach(function (row) {
      (row || []).forEach(function (c) {
        if (!c) return;
        if (c.afflictions && c.afflictions.length) seen.sawBadge = true;
        if (c.statuses && c.statuses.length) seen.sawBadge = true;
      });
    });

    var btn = document.getElementById('btnTrainerAbility');
    if (btn && (btn.disabled || /used/i.test(btn.textContent || ''))) seen.knightSpent = true;
  }

  // ---- the script ---------------------------------------------------------

  function buildSteps() {
    return [
      { id: 'welcome', kicker: 'Tutorial match', title: 'Let\'s get you fighting',
        body: function () {
          var k = knightName();
          return 'You are ' + (k ? '<b>' + esc(k) + '</b>' : 'the Knight') +
            ', leading a warband against a Training Dummy that hits back. I will point, you play.';
        } },

      { id: 'mulligan',
        hint: function () {
          var n = swapCardName();
          return n ? 'Tap <b>' + esc(n) + '</b>, then <b>Redraw selected</b>' : 'Tap the marked card, then <b>Redraw selected</b>';
        },
        title: 'Mulligan before you start',
        target: '#mulliganHandPreview .mulligan-card-slot[data-index="4"]',
        highlight: ['#mulliganHandPreview', '#mulliganActions'],
        body: function () {
          var n = swapCardName();
          return 'One mulligan before the first round: tap every card you do not want and you draw that many back. ' +
            'Let\'s try it with ' + (n ? '<b>' + esc(n) + '</b> — the card marked <b>Tap to redraw</b>. ' : 'the marked card. ') +
            'Tap it, then hit <b>Redraw selected</b> and see what you get.';
        },
        skipIf: function () { return phase() !== 'MULLIGAN'; },
        until: function () { return phase() !== 'MULLIGAN'; } },

      { id: 'hud', title: 'Your half, their half', target: '#boardArea',
        body: 'Dummy up top, you down below, <b>3×3</b> each. The bars track <b>HP</b>, deck and energy.' },

      { id: 'phases', kicker: 'The round', title: 'Draw → Setup → Battle', target: '#phaseBadge',
        body: 'Three beats, every round. <b>Draw</b> one. <b>Setup</b> your board. <b>Battle</b> — everyone swings, fastest first.' },

      { id: 'draw', hint: 'Tap <b>Draw</b>', title: 'Take a card', target: '#btnDraw',
        body: 'Your round starts here. <b>Tap Draw</b>.',
        skipIf: function () { return phase() !== 'DRAW'; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 'setup', title: 'This is your turn', target: '#phaseBadge',
        body: 'One Siegeling down, plus whatever you can pay for. The more energy you walked in with, the more you get to do.',
        until: function () { return phase() === 'SETUP' || phase() === 'BATTLE'; } },

      { id: 'pick', title: 'Who is going in?', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        hint: function () {
          var pair = baseOfEvolutionInHand();
          return pair ? 'Tap <b>' + esc(pair.base.name) + '</b>' : 'Tap a <b>Siegeling</b>';
        },
        body: function () {
          var pair = baseOfEvolutionInHand();
          if (!pair) return 'Pick your opener — anything with <b>HP</b> and <b>SPD</b>. Tap it and the board shows you where it can go.';
          // Named on purpose: this opener is the base the round-two evolution
          // grows out of, and evolving needs it to have survived a full battle
          // phase — so it has to go down NOW, not next round.
          return 'Open with <b>' + esc(pair.base.name) + '</b>. It grows into <b>' + esc(pair.evolution.name) +
            '</b> later, and that only works if it has already fought a round — so it goes down first. Tap it and the board shows you where it can go.';
        },
        until: function () { return selectedType() === 'SIEGLING' || mine() > 0; } },

      { id: 'place', hint: 'Place on the <b>gold</b> cell', title: 'Plug into a socket',
        target: recommendedCell,
        highlight: ['#playerGrid .board-cell.legal'],
        recommend: recommendedCell,
        body: 'See the dots outside the grid? Those are <b>sockets</b>, and touching one starts your energy flowing. The <b>gold</b> cell is where this card reaches one. Put it there.',
        until: function () { return mine() > 0; } },

      { id: 'knight', hint: 'Tap <b>Knight</b>', title: 'Meet your Knight', target: '#btnTrainerAbility',
        avoid: '.trainer-ability-close',
        body: function () {
          var k = knightName();
          return (k ? '<b>' + esc(k) + '</b>' : 'Your Knight') +
            ' is not just standing there — a <b>passive</b> always running, and an <b>active</b> you spend. ' +
            '<b>Tap Knight</b> and see what they bring.';
        },
        until: function () { return seen.knightSpent || visible('#trainerAbilityOverlay') || seen.knightOpened; } },

      { id: 'endturn', hint: 'Tap <b>End Turn</b>', title: 'Hand it over', target: actionBtn,
        body: 'Done building? <b>End Turn</b> and let them swing.',
        until: function () { return !myTurn() || phase() === 'BATTLE'; } },

      { id: 'battle', title: 'Watch them go', target: '#boardArea',
        body: 'Fastest acts first, all the way down the line. Your Fire is very rude to their Ice.',
        until: function () { return seen.sawBattle; } },

      { id: 'target', hint: 'Pick a <b>target</b>', title: 'Pick your victim',
        target: function () { return firstOf(['#enemyGrid .board-cell.targetable', '#enemyGrid']); },
        highlight: ['#enemyGrid .board-cell.targetable', '#playerGrid .board-cell.targetable'],
        body: 'Lit cells are fair game. Pick one.',
        skipIf: function () { return !visible('#enemyGrid .board-cell.targetable'); },
        until: function () { return !visible('#enemyGrid .board-cell.targetable'); } },

      { id: 'damage', title: 'Where damage comes from', target: '#boardArea',
        body: 'Every point of it comes from <b>abilities</b> — there is no attack stat. Hit an element you beat and you get <b>+1</b> for free.' },

      { id: 'kill', title: 'Knocking one out hurts them', target: '#enemyGrid',
        body: 'Drop a Siegeling and its owner takes <b>Siege Damage</b> straight to the face — more the rarer it was. You can win through their board.' },

      { id: 'status', title: 'Little icons, big deal', target: '#boardArea',
        body: 'Fire leaves them <b>Burning</b>, Ice leaves them <b>Chilled</b>, and shields and boosts ride along the same way. They all show up as <b>badges</b> on the card, and they keep working after your turn ends.' },

      // Deliberately NOT a waiting step. A badge is transient — it expires, and
      // the board re-renders under it — so gating on "now tap it" either strands
      // the player on a tap that is no longer possible or holds the match
      // hostage while they ignore it. It points at a live badge and invites the
      // tap; the two steps below pick the thread up only if they took it.
      { id: 'badge-open', title: 'Look one up',
        target: function () { return firstOf(['#playerGrid .sb-badge', '#enemyGrid .sb-badge', '#playerGrid']); },
        highlight: ['#playerGrid', '#enemyGrid'],
        body: 'Never guess what a badge is doing. <b>Tap the card</b> wearing one and its preview opens underneath, with the badge listed as a chip.',
        skipIf: function () { return !visible('.sb-badge'); } },

      { id: 'badge-key', hint: 'Tap the badge chip', title: 'The badge screen',
        target: function () { return firstOf(['.buff-pill:not(.buff-pill-all)', '.buff-pill-all', '#boardArea']); },
        highlight: ['.selected-copy-buffs .buff-pill'],
        avoid: '.trainer-ability-close',
        body: 'Tap the chip. It spells out exactly what that badge does — how hard it bites, how long it lasts, what happens if it stacks. <b>All Effects</b> lists every one in the game.',
        skipIf: function () { return !visible('.buff-pill') && !visible('#effectKeyOverlay:not(.hidden)'); },
        until: function () { return visible('#effectKeyOverlay:not(.hidden)') || !visible('.buff-pill'); } },

      { id: 'badge-close', hint: 'Tap <b>Close</b>', title: 'Always one tap away',
        target: function () { return firstOf(['#effectKeyOverlay .trainer-ability-close', '#boardArea']); },
        avoid: '.trainer-ability-close',
        body: 'That key is open to you mid-fight, for any badge on any card, yours or theirs. Close it and let us finish the round.',
        skipIf: function () { return !visible('#effectKeyOverlay:not(.hidden)'); },
        until: function () { return !visible('#effectKeyOverlay:not(.hidden)'); } },

      // ---- Turn 2 ---------------------------------------------------------
      //
      // Everything below is round-two material, and MUST NOT be reached while
      // round one is still playing. Written as `skipIf: turn() < 2` it was:
      // skipIf is evaluated once, on arrival, so the whole chapter was skipped
      // in a single pass during the first Battle phase and the coach stranded
      // itself on the last step standing, which then sat there as a stale hint
      // through all of round two. A gate holds instead of discarding.

      { id: 'gate-t2', skipTo: 'tools',
        hint: 'Play the battle out — round two is next',
        gate: function () { return turn() >= 2 && seen.sawBattle; } },

      { id: 't2-draw', hint: 'Tap <b>Draw</b>', title: 'Round two, fresh card', target: '#btnDraw',
        body: 'Every round opens by drawing one card into your hand. <b>Tap Draw</b> and see what you got.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 't2-setup', title: 'Build on it', target: '#phaseBadge',
        body: 'Now you have energy to spend. Grow the board, cast, claim, evolve — your call.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() === 'SETUP' || phase() === 'BATTLE'; } },

      // Cost is a real rule and it is NOT the same rule for both card kinds:
      // GameService checks `canAfford` for a Siegling and never spends it
      // (energy is recomputed from links each turn), while a spell or trap goes
      // through `spendEnergy`. Saying "pay" for a Siegling would be wrong.
      { id: 't2-cost', title: 'What a card asks for', target: costTarget,
        highlight: ['#playerHand', '#handTray'],
        body: function () {
          var c = costedCard();
          var named = c
            ? '<b>' + esc(c.name) + '</b> wants <b>' + c.costAmount + ' ' + esc(String(c.costElement).toLowerCase()) + '</b>. '
            : '';
          return 'That little corner number is the <b>cost</b>. ' + named +
            'Your starters are free, but the heavier Siegelings — <b>evolutions especially</b> — ask for energy of their element, and you must <b>have</b> it on tap: a Siegeling checks the pool, it does not drain it. <b>Strategies</b> and <b>Deceptions</b> are what actually spend.';
        },
        skipIf: function () { return !costedCard() && !visible('#playerHand .card-corner-cost'); } },

      { id: 't2-pick', title: 'Bring a friend', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        hint: function () {
          var mate = partnerSiegling();
          return mate ? 'Tap <b>' + esc(mate.name) + '</b>' : 'Tap a <b>Siegeling</b>';
        },
        body: function () {
          var pair = baseOfEvolutionInHand();
          var mate = partnerSiegling(pair && pair.base ? pair.base.id : null);
          var evo = pair ? pair.evolution : hand().filter(function (c) {
            return c && c.type === 'SIEGLING' && c.evolvesFromId;
          })[0];
          var goal = evo
            ? ' You are building toward <b>' + esc(evo.name) + '</b> — it wants <b>' + (evo.costAmount || 0) + ' ' +
              esc(String(evo.costElement || '').toLowerCase()) + '</b>, and this link is where that energy comes from.'
            : '';
          return (mate ? 'Play <b>' + esc(mate.name) + '</b> right ' : 'Grab another Siegeling and put it ') +
            'next to the one already out, so their notches meet.' + goal;
        },
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return selectedType() === 'SIEGLING' || mine() >= 2; } },

      { id: 't2-place', hint: 'Place next to your first', title: 'Point them at each other',
        target: function () { return firstOf(['#playerGrid .board-cell.legal', '#playerGrid']); },
        highlight: ['#playerGrid .board-cell.legal'],
        body: 'Line the notches up so they face <b>each other</b>. Matching elements pay energy; mixed ones pay a <b>combo</b>.',
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return mine() >= 2; } },

      // Spotlight the two cards that are actually linked, not the whole grid —
      // the lesson names a connection the player then has to go find.
      { id: 't2-notches', title: 'That is a link',
        target: function () {
          var cells = linkedCellSelectors();
          return cells.length ? cells[0] : '#playerGrid';
        },
        highlight: function () {
          var cells = linkedCellSelectors();
          return cells.length ? cells : ['#playerGrid'];
        },
        body: 'These two are wired together. Both notches facing each other pays you <b>every round</b>. One pointing at nothing pays you nothing.',
        skipIf: function () { return turn() < 2 || mine() < 2; } },

      // Two payouts, two different lessons. Matching elements bank that
      // element; mixed ones bank a split-colour combo instead. Both wait for
      // the player to actually make one — and both give up the wait the moment
      // Setup ends, so neither can hold the match hostage (the badge lesson
      // taught us that the hard way).
      { id: 't2-link-same', hint: 'Face two <b>matching</b> notches at each other',
        title: 'Your first same-element link', target: '#playerGrid',
        highlight: ['#playerGrid .board-cell.legal', '#playerGrid'],
        body: 'Two notches of the <b>same element</b> pointing at each other bank that element, every single round. That is the steady income — build it first.',
        skipIf: function () { return turn() < 2 || mine() < 2; },
        until: function () {
          // Latch where the pools stood when the lesson opened. Waiting on
          // "energy > 0" completed instantly, because a turn-one socket has
          // already banked some — the step never rendered. What is being
          // taught is the INCREASE a new matching link pays.
          if (linkBaseline == null) linkBaseline = elementalEnergy();
          return elementalEnergy() > linkBaseline || phase() !== 'SETUP';
        } },

      { id: 't2-evolve', hint: 'Play an evolution onto its base', title: 'Grow one up', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: function () {
          var evo = hand().filter(function (c) { return c && c.type === 'SIEGLING' && c.evolvesFromId; })[0];
          var named = evo ? 'Your opener fought last round and this link is paying — so <b>' + esc(evo.name) +
            '</b> can go down on top of it right now. ' : '';
          return named + 'Two things before a Siegeling can <b>evolve</b>: it has to have <b>survived a full battle phase</b> in its current form, and you need the evolution\'s own <b>energy</b> on tap. Play the bigger card straight onto it — evolutions ignore the one-per-turn limit <em>and</em> the five-on-board cap.';
        },
        skipIf: function () {
          if (turn() < 2) return true;
          return !hand().some(function (c) { return c && c.type === 'SIEGLING' && c.evolvesFromId; });
        } },

      { id: 't2-end', hint: 'Tap <b>End Turn</b>', title: 'Send it', target: actionBtn,
        body: 'Linked and evolved — that is round two spent. <b>End Turn</b> and watch it fight.',
        skipIf: function () { return turn() < 2 || phase() === 'BATTLE' || seen.sawBattle2; },
        until: function () { return !myTurn() || phase() === 'BATTLE' || seen.sawBattle2; } },

      { id: 't2-battle', title: 'Now watch', target: '#boardArea',
        body: 'Same rhythm, bigger board. Watch what your link and your evolution bought you.',
        skipIf: function () { return !seen.sawBattle; },
        until: function () { return seen.sawBattle2 || seen.ended; } },

      // ---- Turn 3 ---------------------------------------------------------
      //
      // Round two is deliberately only two moves — link, then evolve — because
      // that is all one Setup affords. The combo link needs a THIRD Siegeling of
      // a different element, so it waits for round three, where GameService's
      // scripted tutorial draw guarantees an Earth partner in hand.

      { id: 'gate-t3', skipTo: 'tools',
        hint: 'Finish round two — there is one more lesson after it',
        gate: function () { return turn() >= 3 && seen.sawBattle2; } },

      { id: 't3-draw', hint: 'Tap <b>Draw</b>', title: 'Round three, and a new element',
        target: '#btnDraw',
        body: function () {
          var earth = comboPartnerInHand();
          return 'Draw your card. ' + (earth
            ? 'That is <b>' + esc(earth.name) + '</b> — a <b>different element</b> to what is already on your board, which is exactly what a combo needs.'
            : 'Watch for a Siegeling of a <b>different element</b> to the ones already out — that is what a combo needs.');
        },
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 't3-pick', title: 'A different element', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        hint: function () {
          var earth = comboPartnerInHand();
          return earth ? 'Tap <b>' + esc(earth.name) + '</b>' : 'Tap a Siegeling of a <b>different element</b>';
        },
        body: function () {
          var earth = comboPartnerInHand();
          return (earth ? 'Play <b>' + esc(earth.name) + '</b>' : 'Play that off-element Siegeling') +
            ' next to what you already have, notches facing. Same elements bank that element; <b>different</b> ones bank a <b>combo</b>.';
        },
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; },
        until: function () { return selectedType() === 'SIEGLING' || comboCount() > 0 || phase() !== 'SETUP'; } },

      { id: 't3-link-combo', hint: 'Now face two <b>different</b> elements at each other',
        title: 'Your first combo link', target: '#playerGrid',
        highlight: ['#playerGrid .board-cell.legal', '#playerGrid'],
        body: 'Point <b>two different</b> elements at each other and you bank a <b>combo</b> instead — a split-colour point. Your heaviest cards take nothing else, so it is worth building for.',
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; },
        until: function () { return comboCount() > 0 || phase() !== 'SETUP'; } },

      { id: 't3-energy', hint: 'Tap <b>◈</b>', title: 'Look what you made', target: '#btnEnergyDetail',
        body: 'Those coloured dots are yours to spend. Tap <b>◈</b> to see where they came from.',
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; },
        until: function () { return seen.hadLinkEnergy || comboCount() > 0 || phase() === 'BATTLE'; } },

      { id: 't3-combo', title: 'Mix it up', target: '#btnEnergyDetail',
        body: 'Mixed links bank a split-colour <b>combo</b>. Your heaviest cards only take these — worth building for.',
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; } },

      { id: 't3-strategy', hint: 'Cast a <b>Strategy</b> you can afford', title: 'Now you can afford things',
        target: '#playerHand', highlight: ['#playerHand', '#handTray'],
        body: 'Two rounds of link energy have piled up, so now you can actually pay for one. <b>Strategies</b> spend your own energy and resolve the moment you play them — cast one.',
        skipIf: function () { return turn() < 3 || !handHas('SPELL'); } },

      { id: 't3-deception', title: 'Spend their energy', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: 'Here is the sneaky one: a <b>Deception</b> is paid for with <b>their</b> energy, not yours. Play one if you have it.',
        skipIf: function () { return turn() < 3 || !handHas('TRAP'); } },

      { id: 't3-claim', title: 'Cash one in',
        target: function () { return firstOf(['#playerGrid .board-cell.claimable', '#playerGrid']); },
        highlight: ['#playerGrid .board-cell.claimable'],
        body: 'Need energy right now? <b>Claim</b> a survivor and cash it in. You lose the body — worth it sometimes.',
        skipIf: function () { return turn() < 3 || !visible('#playerGrid .board-cell.claimable'); } },

      { id: 't3-end', hint: 'Tap <b>End Turn</b>', title: 'Send it', target: actionBtn,
        body: 'That is everything a round can hold — board, links, spells. <b>End Turn</b>.',
        skipIf: function () { return turn() < 3 || phase() === 'BATTLE'; },
        until: function () { return !myTurn() || phase() === 'BATTLE'; } },

      { id: 'tools', title: 'If you get stuck', target: '#btnHint',
        body: 'Tap <b>?</b> and it tells you exactly what it is waiting for. <b>≡</b> is the log, <b>👁</b> zooms a card.' },

      { id: 'done', kicker: 'Tutorial complete', title: '🎉 Well fought', finish: true, finale: true,
        altLabel: 'Advanced Tutorial ▸',
        body: 'That is the whole loop — links pay energy, energy buys abilities, abilities win fights.' +
          '<span class="tut-p">Want the deeper stuff — badges, shields, elemental statuses? Take the <b>Advanced Tutorial</b>. Otherwise go pick a real fight in Arena or Siege.</span>' }
    ];
  }

  /** The name of a card of `type` that is ACTUALLY in hand, or null.
   *  Every "cast X" line goes through this. The advanced tips used to name
   *  Cinder Volley, Root Guard and Root Bind outright and the hand held none of
   *  them, which is the same lie the mulligan told about Pylook: the deck can
   *  be reshuffled or retuned, and a tutorial that names a card you cannot see
   *  reads as broken. `match` narrows it further when a step wants a specific
   *  kind of card (a shield, a boost). */
  function handCardName(type, match) {
    var cards = hand().filter(function (c) {
      if (!c || c.type !== type) return false;
      if (!match) return true;
      var text = ((c.name || '') + ' ' + (c.description || '') + ' ' +
        ((c.ability && c.ability.description) || '')).toLowerCase();
      return match.test(text);
    });
    return (cards[0] && cards[0].name) || null;
  }

  /** The player's SiegeKnight, by name, read from the match. The tips said
   *  "Squire Bob" outright — true for today's pinned tutorial loadout and a lie
   *  the moment it is retuned, which is the same trap the card names fell into. */
  function knightName() {
    var g = gs();
    return (g && g.player && g.player.trainer && g.player.trainer.name) || '';
  }

  /** "Cast <b>Name</b>" when we can see it, an honest generic line when we
   *  cannot — never a card the player does not hold. */
  function castLine(type, match, generic) {
    var n = handCardName(type, match);
    return n ? 'Cast <b>' + esc(n) + '</b>' : generic;
  }

  function buildAdvancedSteps() {
    return [
      { id: 'adv-welcome', kicker: 'Advanced', title: 'The sneaky stuff',
        body: 'Same match, deeper cuts — burns, buffs, shields and debuffs, and every button along the bottom of your screen.' },

      { id: 'adv-burn', title: 'Elemental afflictions', target: '#boardArea',
        body: 'Fire leaves them <b>Burning</b>, Ice leaves them <b>Chilled</b>, and it keeps biting on their own turn. Free damage while you do something else.' },

      { id: 'adv-buff', title: 'Make one hit harder', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        hint: function () {
          return castLine('SPELL', /boost|attack|damage|strength|max health|health up/,
            'Cast a boost Strategy when you draw one');
        },
        body: function () {
          var n = handCardName('SPELL', /boost|attack|damage|strength|max health|health up/);
          return n
            ? '<b>' + esc(n) + '</b> pins a badge on an ally — more punch, or more health. Got the energy? Stack it up.'
            : 'Some Strategies pin a badge on an ally — more punch, or more health. None in your hand this second; when one turns up, that is what it does.';
        } },

      { id: 'adv-shield', title: 'Shields', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        hint: function () { return castLine('SPELL', /shield|ward|absorb|guard/, 'Cast a shield Strategy when you draw one'); },
        body: function () {
          var n = handCardName('SPELL', /shield|ward|absorb|guard/);
          return n
            ? '<b>' + esc(n) + '</b> drops a <b>Shield</b> that eats damage before HP does. Put it on whoever is about to get hit.'
            : 'A <b>Shield</b> eats damage before HP does — worth saving for whoever is about to get hit.';
        } },

      { id: 'adv-debuff', title: 'Slow them down', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: function () {
          var n = handCardName('SPELL', /bind|slow|speed|root/) || handCardName('TRAP', /bind|slow|speed|root/);
          return n
            ? '<b>' + esc(n) + '</b> drags a foe down the Speed order — they act last, or not at all. Look for the badge on their card.'
            : 'Some cards drag a foe down to <b>0 Speed</b> — they act dead last, or not at all. Look for the badge on their card.';
        } },

      // ---- The HUD ---------------------------------------------------------
      //
      // One step per control, in the order they sit on screen, each skipped if
      // it is not currently rendered: the action row swaps buttons with the
      // phase, so Draw, Auto Battle, Pass and Cancel Move are never all up at
      // once.

      { id: 'adv-hud', kicker: 'The bar', title: 'Everything down there',
        target: '#actionBar', highlight: ['#actionBar'],
        body: 'The strip along the bottom is your whole control panel. Let us go along it.',
        skipIf: function () { return !visible('#actionBar'); } },

      { id: 'adv-hud-knight', title: '⚔ Knight', target: '#btnTrainerAbility',
        body: 'Your SiegeKnight. A <b>passive</b> that is always on, and an <b>active</b> you get to spend once. It reads <b>Ready</b> until you use it.',
        skipIf: function () { return !visible('#btnTrainerAbility'); } },

      // On a phone the action row collapses to ONE button whose label follows the
      // phase, so Draw / End Turn / Auto Battle / Pass are never all on screen —
      // a step each would silently skip most of them there. One step covers
      // whichever is live (that is what actionBtn() is for) and names the rest;
      // the individual steps below still fire on desktop, where they coexist.
      { id: 'adv-hud-action', title: 'The big action button', target: actionBtn,
        body: 'The wide one changes with the phase: <b>Draw</b> takes your card, <b>End Turn</b> hands the round over, <b>Auto Battle</b> gets on with the fighting, and mid-battle it becomes <b>Pass</b> — skip this Siegeling rather than spend energy — or <b>Cancel Move</b> to back out of a move you have not aimed yet.',
        skipIf: function () { return !actionBtn(); } },

      { id: 'adv-hud-draw', title: '🎴 Draw', target: '#btnDraw',
        body: 'Takes your one card for the round. Only lit during the Draw phase.',
        skipIf: function () { return !visible('#btnDraw'); } },

      { id: 'adv-hud-end', title: 'End Turn', target: '#btnEndTurn',
        body: 'Hands the round over. Once both sides are done building, Battle runs itself.',
        skipIf: function () { return !visible('#btnEndTurn'); } },

      { id: 'adv-hud-battle', title: 'Auto Battle', target: '#btnBattle',
        body: 'Runs the Battle phase without waiting. It starts on its own after both sides finish Setup — this just gets on with it.',
        skipIf: function () { return !visible('#btnBattle'); } },

      { id: 'adv-hud-pass', title: 'Pass', target: '#btnBattlePass',
        body: 'Mid-battle, skips the Siegeling whose turn it is instead of spending energy on a move.',
        skipIf: function () { return !visible('#btnBattlePass'); } },

      { id: 'adv-hud-cancel', title: 'Cancel Move', target: '#btnCancelBattleMove',
        body: 'Backs out of a move you have picked but not aimed yet — no cost, pick again.',
        skipIf: function () { return !visible('#btnCancelBattleMove'); } },

      { id: 'adv-hud-act', title: 'Act — your Setup budget', target: '#setupActionsCounter',
        body: 'How many Setup actions you have left this round. It ticks down as you place, cast and claim.',
        skipIf: function () { return !visible('#setupActionsCounter'); } },

      { id: 'adv-hud-preview', title: '👁 Card Preview', target: '#btnSelectedPreview',
        body: 'Opens the full face of whatever card is selected — art, stats, every move and what each one costs.',
        skipIf: function () { return !visible('#btnSelectedPreview'); } },

      { id: 'adv-hud-hint', title: '? Hints', target: '#btnHint',
        body: 'The one to remember. It tells you exactly what the game is waiting for, whenever you are stuck.',
        skipIf: function () { return !visible('#btnHint'); } },

      { id: 'adv-hud-queue', title: '⚔ Queue Action', target: '#btnBattlePanel',
        body: 'The battle panel: which of your Siegelings acts next, what it can do, and what each move costs.',
        skipIf: function () { return !visible('#btnBattlePanel'); } },

      { id: 'adv-hud-log', title: '≡ Game Log', target: '#btnGameLog',
        body: 'Every hit, heal and badge, in order. Worth a look when a number surprises you.',
        skipIf: function () { return !visible('#btnGameLog'); } },

      { id: 'adv-hud-energy', title: '◈ Energy Detail', target: '#btnEnergyDetail',
        body: 'Where each drop of energy came from — which link, which socket, which combo.',
        skipIf: function () { return !visible('#btnEnergyDetail'); } },

      { id: 'adv-hud-speed', title: '▶ Playback speed', target: '#sglSpeedToggle',
        body: 'Battle animations too slow? Tap to cycle the speed. Nothing about the fight changes.',
        skipIf: function () { return !visible('#sglSpeedToggle'); } },

      { id: 'adv-hud-sound', title: '🔊 Sound', target: '#btnMuteSound',
        body: 'Mutes and unmutes.',
        skipIf: function () { return !visible('#btnMuteSound'); } },

      { id: 'adv-hud-quit', title: 'Quit', target: '#btnQuitOrNewGame',
        body: 'Leaves this match and sets up a new one. Your progress is already banked.',
        skipIf: function () { return !visible('#btnQuitOrNewGame'); } },

      { id: 'adv-read', title: 'Never guess', target: '#btnHint',
        body: 'Between <b>?</b> and tapping a badge, the game will always tell you what it is doing. You never have to guess.' },

      { id: 'adv-done', kicker: 'Advanced complete', title: 'You are ready', finish: true, finale: true,
        body: 'Afflictions tick, shields soak, debuffs stall, and every button down there now has a name. Play this one out, or take it to Arena and Siege.' }
    ];
  }

  /** Regions the collapsed hint must never cover, because a hint lying across
   *  them blocks the very tap it is asking for. Deliberately the *lit* cells
   *  rather than the whole grids: two 3x3 boards plus the hand is the entire
   *  phone screen, so requiring all of it to stay clear leaves the hint nowhere
   *  to go and it falls back onto the hand anyway. The cells that are actually
   *  waiting for a tap are what must stay reachable. */
  var PLAY_AREAS = ['#playerHand', '#handTray', '#mulliganActions', '#mulliganHandPreview',
    '#playerGrid .board-cell.legal', '#playerGrid .board-cell.claimable',
    '#enemyGrid .board-cell.targetable', '#playerGrid .board-cell.targetable'];

  // ---- lifecycle ----------------------------------------------------------

  function start() {
    if (ACTIVE || !window.TutorialCoach) return;
    if (window.TutorialCoach.active()) return;
    ACTIVE = true;
    seen = {
      maxMine: 0, maxTheirs: 0, maxTurn: 0, enemyDown: false,
      sawBattle: false, sawBattle2: false,
      hadLinkEnergy: false, hadCombo: false, hadTrap: false,
      hadEvolution: false, sawBadge: false,
      knightSpent: false, knightOpened: false, ended: false
    };
    linkBaseline = null;
    var knightBtn = document.getElementById('btnTrainerAbility');
    if (knightBtn) {
      knightBtn.addEventListener('click', function () { seen.knightOpened = true; }, { once: true });
    }
    watchRaf = window.requestAnimationFrame(watch);
    window.TutorialCoach.start({
      steps: buildSteps(),
      playAreas: PLAY_AREAS,
      onFinale: claimReward,
      onAlt: startAdvanced,
      onStop: function () {
        ACTIVE = false;
        if (watchRaf) window.cancelAnimationFrame(watchRaf);
        watchRaf = 0;
      },
      bodyClass: 'arena-tutorial'
    });
  }

  function startAdvanced() {
    if (!window.TutorialCoach || !window.TutorialCoach.continueWith) return;
    // Keep the live match and the watcher; swap the script to the badge chapter.
    window.TutorialCoach.continueWith(buildAdvancedSteps(), {
      onFinale: function (box, reposition) {
        if (!box) return;
        box.className = 'tut-reward is-claimed';
        // The finale body already says keep playing or Finish, and this box sits
        // directly under it — repeating the sentence read like a stutter.
        box.innerHTML = '<b>Nothing left to teach</b> the rest is practice.';
        if (reposition) reposition();
      },
      onAlt: null
    });
  }

  var rewardClaim = null;

  /** The Arena tutorial's own one-time reward, claimed on reaching the finale.
   *  Winning already claims it through game.js; this is the same endpoint, and
   *  the server's own flag makes a second call a harmless "already claimed". */
  function claimReward(box, reposition) {
    if (!rewardClaim) {
      rewardClaim = fetch('/api/player/tutorial-complete', {
        method: 'POST',
        headers: (bridge() && bridge().authHeaders
          ? bridge().authHeaders({ 'Content-Type': 'application/json' })
          : { 'Content-Type': 'application/json' }),
        credentials: 'include'
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, body: d || {} }; });
      }).then(function (res) {
        var d = res.body;
        if (!res.ok || d.error) {
          return { claimed: false, already: String(d.error || '').toLowerCase().indexOf('already') >= 0 };
        }
        return { claimed: true };
      }).catch(function () { return { claimed: false, already: false }; });
    }
    rewardClaim.then(function (r) {
      if (!box) return;
      if (r && r.claimed) {
        box.className = 'tut-reward is-claimed';
        box.innerHTML = '<b>First-time reward</b> a second starter pack and 250 Siegecoins are on your account.';
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

  function stop() {
    if (window.TutorialCoach && window.TutorialCoach.active()) window.TutorialCoach.stop();
  }

  window.ArenaTutorial = {
    start: start,
    stop: stop,
    active: function () { return ACTIVE; }
  };
})();
