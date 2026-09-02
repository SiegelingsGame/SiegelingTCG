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
    if (visible('.status-badge, .affliction-badge, .sbadge, [class*="status-badge"]')) seen.sawBadge = true;

    var board = (g.playerBoard || []);
    board.forEach(function (row) {
      (row || []).forEach(function (c) {
        if (!c) return;
        if (c.evolvesFromId || c.evolved || (c.name && /raydile|flora|pyleer/i.test(c.name))) {
          seen.hadEvolution = true;
        }
        if (c.afflictions && c.afflictions.length) seen.sawBadge = true;
        if (c.statusEffects && c.statusEffects.length) seen.sawBadge = true;
      });
    });
    var eboard = (g.enemyBoard || []);
    eboard.forEach(function (row) {
      (row || []).forEach(function (c) {
        if (!c) return;
        if (c.afflictions && c.afflictions.length) seen.sawBadge = true;
        if (c.statusEffects && c.statusEffects.length) seen.sawBadge = true;
      });
    });

    var btn = document.getElementById('btnTrainerAbility');
    if (btn && (btn.disabled || /used/i.test(btn.textContent || ''))) seen.knightSpent = true;
  }

  // ---- the script ---------------------------------------------------------

  function buildSteps() {
    return [
      { id: 'welcome', kicker: 'Tutorial match', title: 'Welcome',
        body: 'You lead <b>Squire Bob</b> with <b>Ashen Roots</b> against a Training Dummy. I will tip you, you press <b>Got it</b>, then make the play.' },

      { id: 'mulligan', hint: 'Keep, or practice one redraw', title: 'Opening hand',
        target: '#mulliganHandPreview .mulligan-card-slot[data-index="4"]',
        highlight: ['#mulliganHandPreview', '#mulliganActions'],
        body: 'This hand is scripted. Four cards stay locked for the lesson. Tap <b>Pylook</b> to practice one redraw, or <b>Keep hand</b>.',
        skipIf: function () { return phase() !== 'MULLIGAN'; },
        until: function () { return phase() !== 'MULLIGAN'; } },

      { id: 'hud', title: 'The board', target: '#boardArea',
        body: 'Dummy above, you below — each a <b>3×3</b>. Bars show <b>HP</b>, deck, and energy. Sieglings have Health, Speed, notches, and abilities — no printed attack.' },

      { id: 'phases', kicker: 'The round', title: 'Draw → Setup → Battle', target: '#phaseBadge',
        body: '<b>Draw</b> a card. <b>Setup</b> place and cast. <b>Battle</b> every Siegeling acts once, fastest first.' },

      { id: 'draw', hint: 'Tap <b>Draw</b>', title: 'Draw', target: '#btnDraw',
        body: '<b>Tap Draw</b> to take your card.',
        skipIf: function () { return phase() !== 'DRAW'; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 'setup', title: 'Setup', target: '#phaseBadge',
        body: 'Place up to <b>one</b> Siegeling, cast cards you can afford, or claim later. Actions scale with the energy you held when Setup began.',
        until: function () { return phase() === 'SETUP' || phase() === 'BATTLE'; } },

      { id: 'pick', hint: 'Tap a <b>Siegeling</b>', title: 'Pick a Siegeling', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Tap a Siegeling</b> (HP + SPD). Legal cells light up.',
        until: function () { return selectedType() === 'SIEGLING' || mine() > 0; } },

      { id: 'place', hint: 'Place on the <b>gold</b> cell', title: 'Reach a socket',
        target: recommendedCell,
        highlight: ['#playerGrid .board-cell.legal'],
        recommend: recommendedCell,
        body: 'Dots outside the grid are <b>sockets</b>. The <b>gold</b> cell is where this card\'s notches reach one — that starts your energy. Place there.',
        until: function () { return mine() > 0; } },

      { id: 'strategy', title: 'Strategies', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Strategies</b> cast on your turn from <b>your</b> energy (and combo). They resolve right away. Cast one if you can — optional.',
        skipIf: function () { return !handHas('SPELL'); } },

      { id: 'knight', hint: 'Tap <b>Knight</b>', title: 'SiegeKnight', target: '#btnTrainerAbility',
        avoid: '.trainer-ability-close',
        body: 'Your Knight has an always-on <b>passive</b> and a spendable <b>active</b>. Tap <b>Knight</b> to read them.',
        until: function () { return seen.knightSpent || visible('#trainerAbilityOverlay') || seen.knightOpened; } },

      { id: 'endturn', hint: 'Tap <b>End Turn</b>', title: 'End Setup', target: actionBtn,
        body: '<b>End Turn</b>. When both sides finish Setup, Battle starts.',
        until: function () { return !myTurn() || phase() === 'BATTLE'; } },

      { id: 'battle', title: 'Battle', target: '#boardArea',
        body: 'Fastest Siegeling acts first. Abilities spend energy. Fire hits Ice hard here.',
        until: function () { return seen.sawBattle; } },

      { id: 'target', hint: 'Pick a <b>target</b>', title: 'Targets',
        target: function () { return firstOf(['#enemyGrid .board-cell.targetable', '#enemyGrid']); },
        highlight: ['#enemyGrid .board-cell.targetable', '#playerGrid .board-cell.targetable'],
        body: 'Lit cells are legal targets. Tap one to fire.',
        skipIf: function () { return !visible('#enemyGrid .board-cell.targetable'); },
        until: function () { return !visible('#enemyGrid .board-cell.targetable'); } },

      { id: 'damage', title: 'Damage', target: '#boardArea',
        body: 'All damage comes from <b>abilities</b>. Weakness adds +1 when your element beats theirs.' },

      { id: 'kill', title: 'Siege Damage', target: '#enemyGrid',
        body: 'A defeated Siegeling deals <b>Siege Damage</b> to its owner\'s HP. Higher rarity hits harder: ⚪ Common · 🟢 Uncommon · 🔵 Rare · 🟣 Epic · 🟡 Legendary · 🔴 heaviest.' },

      { id: 'status', title: 'Status & badges', target: '#boardArea',
        body: 'Hits can leave <b>badges</b> — burn, freeze, buffs, shields. Tap a badge or <b>?</b> anytime to read what it does.' },

      // ---- Turn 2 ---------------------------------------------------------

      { id: 't2-draw', hint: 'Tap <b>Draw</b>', title: 'Turn 2 — Draw', target: '#btnDraw',
        body: '<b>Tap Draw</b>. Round two.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 't2-setup', title: 'Setup again', target: '#phaseBadge',
        body: 'Grow the board, spend energy, claim, or evolve.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() === 'SETUP' || phase() === 'BATTLE'; } },

      { id: 't2-pick', hint: 'Tap a <b>Siegeling</b>', title: 'Second Siegeling', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Tap another Siegeling</b> to place beside the first and link notches.',
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return selectedType() === 'SIEGLING' || mine() >= 2; } },

      { id: 't2-place', hint: 'Place next to your first', title: 'Make a link',
        target: function () { return firstOf(['#playerGrid .board-cell.legal', '#playerGrid']); },
        highlight: ['#playerGrid .board-cell.legal'],
        body: 'Place so notches point <b>at each other</b>. Same element → energy. Fire + Earth → a <b>combo</b>.',
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return mine() >= 2; } },

      { id: 't2-notches', title: 'Links & energy', target: '#playerGrid',
        body: 'A <b>reciprocal link</b> (both notches face each other) banks energy every round. One-way notches do nothing.',
        skipIf: function () { return turn() < 2 || mine() < 2; } },

      { id: 't2-energy', hint: 'Tap <b>◈</b>', title: 'Energy pool', target: '#btnEnergyDetail',
        body: 'Your coloured dots are spendable energy. Tap <b>◈</b> for the breakdown.',
        skipIf: function () { return turn() < 2 || mine() < 2; },
        until: function () { return seen.hadLinkEnergy || comboCount() > 0 || phase() === 'BATTLE'; } },

      { id: 't2-combo', title: 'Combo links', target: '#btnEnergyDetail',
        body: 'Different-element links bank a <b>combo</b> (split-colour token). Combos unlock heavier Strategies and abilities.',
        skipIf: function () { return turn() < 2 || mine() < 2; } },

      { id: 't2-deception', title: 'Deceptions', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Deceptions</b> play like Strategies — on your turn, from hand — but their cost uses <b>opponent</b> energy of a chosen element. Punish what they are holding. Play one if you can.',
        skipIf: function () { return turn() < 2 || !handHas('TRAP'); } },

      { id: 't2-evolve', hint: 'Play an evolution onto its base', title: 'Evolutions', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: 'After a Siegeling survives a battle, you may play its <b>evolution</b> onto it. Evolutions skip the one-per-turn place limit.',
        skipIf: function () {
          if (turn() < 2) return true;
          return !hand().some(function (c) { return c && c.type === 'SIEGLING' && c.evolvesFromId; });
        } },

      { id: 't2-claim', title: 'Claiming',
        target: function () { return firstOf(['#playerGrid .board-cell.claimable', '#playerGrid']); },
        highlight: ['#playerGrid .board-cell.claimable'],
        body: 'A survivor can be <b>claimed</b> for temporary energy — it leaves the board. Body now, or a bigger play this round.',
        skipIf: function () { return turn() < 2 || !visible('#playerGrid .board-cell.claimable'); } },

      { id: 't2-end', hint: 'Tap <b>End Turn</b>', title: 'Into battle 2', target: actionBtn,
        body: '<b>End Turn</b> to resolve battle two.',
        skipIf: function () { return turn() < 2 || phase() === 'BATTLE' || seen.sawBattle2; },
        until: function () { return !myTurn() || phase() === 'BATTLE' || seen.sawBattle2; } },

      { id: 't2-battle', title: 'Battle 2', target: '#boardArea',
        body: 'Same loop: Speed order, abilities, badges. Watch damage and statuses land.',
        skipIf: function () { return !seen.sawBattle; },
        until: function () { return seen.sawBattle2 || seen.ended; } },

      { id: 'tools', title: 'Tools', target: '#btnHint',
        body: '<b>?</b> = what the game wants. <b>≡</b> = full log. <b>👁</b> = inspect notches.' },

      { id: 'done', kicker: 'Tutorial complete', title: '🎉 Well fought', finish: true, finale: true,
        altLabel: 'Advanced Tutorial ▸',
        body: 'You know the loop: energy, Strategies, Deceptions, battle.' +
          '<span class="tut-p">Want badges, shields, and elemental statuses? Start the <b>Advanced Tutorial</b> — or Finish and head to Arena / Siege.</span>' }
    ];
  }

  function buildAdvancedSteps() {
    return [
      { id: 'adv-welcome', kicker: 'Advanced', title: 'Badges & statuses',
        body: 'Same match. Next tips cover <b>elemental afflictions</b>, <b>buff badges</b>, <b>shields</b>, and <b>debuffs</b>. Your deck already holds the cards.' },

      { id: 'adv-burn', title: 'Elemental afflictions', target: '#boardArea',
        body: 'Fire damage leaves <b>Burn</b> badges. Ice leaves <b>Chill</b>. Stacks tick on that owner\'s Setup — tap a badge anytime to read it.' },

      { id: 'adv-buff', hint: 'Cast a boost Strategy if you can', title: 'Buff badges', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Cinder Volley</b> and <b>Root Guard</b> put attack / max-Health badges on allies. Cast one when you can afford it — optional.' },

      { id: 'adv-shield', hint: 'Cast Ashen Ward on an ally', title: 'Shields', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Ashen Ward</b> grants temporary <b>Shield</b> — it absorbs damage before HP, then drops. Cast it on an ally if you are holding it.' },

      { id: 'adv-debuff', title: 'Debuffs', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Root Bind</b> / Flora Knight\'s Rootbind set Speed to 0 for the turn. Debuffs show as status badges on the foe.' },

      { id: 'adv-read', title: 'Reading badges', target: '#btnHint',
        body: 'Tap any badge on a card, or <b>?</b>, for the full effect. Buffs, shields, burns, freezes — same place.' },

      { id: 'adv-done', kicker: 'Advanced complete', title: 'You are ready', finish: true, finale: true,
        body: 'Afflictions tick, buffs and shields show as badges, debuffs slow the foe. Keep playing this match, or Finish for Arena and Siege.' }
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
        box.innerHTML = '<b>Advanced complete</b> keep playing, or Finish when you are done.';
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
