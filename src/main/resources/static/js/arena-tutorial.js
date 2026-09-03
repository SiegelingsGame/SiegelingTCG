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
      { id: 'welcome', kicker: 'Tutorial match', title: 'Let\'s get you fighting',
        body: 'You are <b>Squire Bob</b>, leading <b>Ashen Roots</b> against a Training Dummy that hits back. I will point, you play.' },

      { id: 'mulligan',
        hint: function () {
          var n = swapCardName();
          return n ? 'Tap <b>' + esc(n) + '</b>, then <b>Redraw selected</b>' : 'Tap the marked card, then <b>Redraw selected</b>';
        },
        title: 'Swap a card before you start',
        target: '#mulliganHandPreview .mulligan-card-slot[data-index="4"]',
        highlight: ['#mulliganHandPreview', '#mulliganActions'],
        body: function () {
          var n = swapCardName();
          return 'You get one swap before the first round. ' +
            (n ? 'Tap <b>' + esc(n) + '</b> — the card marked <b>Tap to redraw</b> — ' : 'Tap the marked card ') +
            'then hit <b>Redraw selected</b> and see what you get.';
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

      { id: 'pick', hint: 'Tap a <b>Siegeling</b>', title: 'Who is going in?', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: 'Pick your opener — anything with <b>HP</b> and <b>SPD</b>. Tap it and the board shows you where it can go.',
        until: function () { return selectedType() === 'SIEGLING' || mine() > 0; } },

      { id: 'place', hint: 'Place on the <b>gold</b> cell', title: 'Plug into a socket',
        target: recommendedCell,
        highlight: ['#playerGrid .board-cell.legal'],
        recommend: recommendedCell,
        body: 'See the dots outside the grid? Those are <b>sockets</b>, and touching one starts your energy flowing. The <b>gold</b> cell is where this card reaches one. Put it there.',
        until: function () { return mine() > 0; } },

      { id: 'strategy', title: 'Spend that energy', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Strategies</b> spend your own energy and go off immediately. Got one you can afford? Fire it.',
        skipIf: function () { return !handHas('SPELL'); } },

      { id: 'knight', hint: 'Tap <b>Knight</b>', title: 'Meet your Knight', target: '#btnTrainerAbility',
        avoid: '.trainer-ability-close',
        body: 'Squire Bob is not just standing there — he has a <b>passive</b> always running and an <b>active</b> you spend. <b>Tap Knight</b> and see what he brings.',
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
        body: 'Burns, freezes, shields and buffs all show up as <b>badges</b>. Tap one any time to see what it is doing.' },

      // ---- Turn 2 ---------------------------------------------------------

      { id: 't2-draw', hint: 'Tap <b>Draw</b>', title: 'Round two', target: '#btnDraw',
        body: 'Round two. <b>Tap Draw</b>.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 't2-setup', title: 'Build on it', target: '#phaseBadge',
        body: 'Now you have energy to spend. Grow the board, cast, claim, evolve — your call.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() === 'SETUP' || phase() === 'BATTLE'; } },

      { id: 't2-pick', hint: 'Tap a <b>Siegeling</b>', title: 'Bring a friend', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: 'Grab another Siegeling. This one goes <b>next to</b> the first.',
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return selectedType() === 'SIEGLING' || mine() >= 2; } },

      { id: 't2-place', hint: 'Place next to your first', title: 'Point them at each other',
        target: function () { return firstOf(['#playerGrid .board-cell.legal', '#playerGrid']); },
        highlight: ['#playerGrid .board-cell.legal'],
        body: 'Line the notches up so they face <b>each other</b>. Matching elements pay energy; mixed ones pay a <b>combo</b>.',
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return mine() >= 2; } },

      { id: 't2-notches', title: 'That is a link', target: '#playerGrid',
        body: 'Both notches facing each other pays you <b>every round</b>. One pointing at nothing pays you nothing.',
        skipIf: function () { return turn() < 2 || mine() < 2; } },

      { id: 't2-energy', hint: 'Tap <b>◈</b>', title: 'Look what you made', target: '#btnEnergyDetail',
        body: 'Those coloured dots are yours to spend. Tap <b>◈</b> to see where they came from.',
        skipIf: function () { return turn() < 2 || mine() < 2; },
        until: function () { return seen.hadLinkEnergy || comboCount() > 0 || phase() === 'BATTLE'; } },

      { id: 't2-combo', title: 'Mix it up', target: '#btnEnergyDetail',
        body: 'Mixed links bank a split-colour <b>combo</b>. Your heaviest cards only take these — worth building for.',
        skipIf: function () { return turn() < 2 || mine() < 2; } },

      { id: 't2-deception', title: 'Spend their energy', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: 'Here is the sneaky one: a <b>Deception</b> is paid for with <b>their</b> energy, not yours. Play one if you have it.',
        skipIf: function () { return turn() < 2 || !handHas('TRAP'); } },

      { id: 't2-evolve', hint: 'Play an evolution onto its base', title: 'Grow one up', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: 'Survive a battle and a Siegeling can <b>evolve</b> — play the bigger version straight onto it. Free of the one-per-turn limit.',
        skipIf: function () {
          if (turn() < 2) return true;
          return !hand().some(function (c) { return c && c.type === 'SIEGLING' && c.evolvesFromId; });
        } },

      { id: 't2-claim', title: 'Cash one in',
        target: function () { return firstOf(['#playerGrid .board-cell.claimable', '#playerGrid']); },
        highlight: ['#playerGrid .board-cell.claimable'],
        body: 'Need energy right now? <b>Claim</b> a survivor and cash it in. You lose the body — worth it sometimes.',
        skipIf: function () { return turn() < 2 || !visible('#playerGrid .board-cell.claimable'); } },

      { id: 't2-end', hint: 'Tap <b>End Turn</b>', title: 'Send it', target: actionBtn,
        body: 'Let us see it work. <b>End Turn</b>.',
        skipIf: function () { return turn() < 2 || phase() === 'BATTLE' || seen.sawBattle2; },
        until: function () { return !myTurn() || phase() === 'BATTLE' || seen.sawBattle2; } },

      { id: 't2-battle', title: 'Now watch', target: '#boardArea',
        body: 'Same rhythm, bigger board. Watch what your links bought you.',
        skipIf: function () { return !seen.sawBattle; },
        until: function () { return seen.sawBattle2 || seen.ended; } },

      { id: 'tools', title: 'If you get stuck', target: '#btnHint',
        body: 'Tap <b>?</b> and it tells you exactly what it is waiting for. <b>≡</b> is the log, <b>👁</b> zooms a card.' },

      { id: 'done', kicker: 'Tutorial complete', title: '🎉 Well fought', finish: true, finale: true,
        altLabel: 'Advanced Tutorial ▸',
        body: 'That is the whole loop — links pay energy, energy buys abilities, abilities win fights.' +
          '<span class="tut-p">Want the deeper stuff — badges, shields, elemental statuses? Take the <b>Advanced Tutorial</b>. Otherwise go pick a real fight in Arena or Siege.</span>' }
    ];
  }

  function buildAdvancedSteps() {
    return [
      { id: 'adv-welcome', kicker: 'Advanced', title: 'The sneaky stuff',
        body: 'Same match, deeper cuts — burns, buffs, shields and debuffs. Your deck is already holding everything we need.' },

      { id: 'adv-burn', title: 'Elemental afflictions', target: '#boardArea',
        body: 'Fire leaves them <b>Burning</b>, Ice leaves them <b>Chilled</b>, and it keeps biting on their own turn. Free damage while you do something else.' },

      { id: 'adv-buff', hint: 'Cast a boost Strategy if you can', title: 'Make one hit harder', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Cinder Volley</b> and <b>Root Guard</b> pin a badge on an ally — more punch, more health. Got the energy? Stack one up.' },

      { id: 'adv-shield', hint: 'Cast Ashen Ward on an ally', title: 'Shields', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Ashen Ward</b> drops a <b>Shield</b> that eats damage before HP does. Put it on whoever is about to get hit.' },

      { id: 'adv-debuff', title: 'Slow them down', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: '<b>Root Bind</b> drops a foe to <b>0 Speed</b> — they act dead last, or not at all. Look for the badge on their card.' },

      { id: 'adv-read', title: 'Never guess', target: '#btnHint',
        body: 'Tap any badge and it tells you exactly what it does. Same for <b>?</b> when you are not sure whose turn it is.' },

      { id: 'adv-done', kicker: 'Advanced complete', title: 'Go win something', finish: true, finale: true,
        body: 'Burns tick, shields soak, debuffs stall — that is the whole toolkit. Play this one out, or take it to Arena and Siege.' }
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
