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
    // A foe count that fell after having been higher is a kill on the board.
    if (seen.maxTheirs > 0 && theirs() < seen.maxTheirs) seen.enemyDown = true;
    if (phase() === 'BATTLE') seen.sawBattle = true;
    if (turn() > seen.maxTurn) seen.maxTurn = turn();
    if (g.winner) seen.ended = true;
    if (turn() >= 2 && playerEnergyTotal() > 0) seen.hadLinkEnergy = true;
    if (turn() >= 2 && comboCount() > 0) seen.hadCombo = true;

    var btn = document.getElementById('btnTrainerAbility');
    if (btn && (btn.disabled || /used/i.test(btn.textContent || ''))) seen.knightSpent = true;
  }

  // ---- the script ---------------------------------------------------------

  function buildSteps() {
    return [
      { id: 'welcome', kicker: 'Tutorial match', title: 'Welcome to the training grounds',
        body: 'You lead <b>Squire Bob</b> with the <b>Ashen Roots</b> deck against a Training Dummy that starts on low health, and you always move first — so this match plays the same way every time you replay it.' +
          '<span class="tut-p">I will walk you through it move by move. Read a tip, press <b>Got it</b>, and the tip shrinks out of your way while you make the move.</span>' },

      // FIRST, because the match opens on the mulligan overlay and that overlay
      // covers the board completely — teaching 'Reading the board' here rang a
      // grid the player could not even see.
      { id: 'mulligan', hint: 'Keep, or redraw, once', title: 'Your opening hand', target: '#mulliganActions',
        body: 'Before the first round you get <b>one</b> mulligan. Tap any cards you would rather not keep and <b>Redraw selected</b>, or take the hand as dealt with <b>Keep hand</b>.' +
          '<span class="tut-p">You want a Siegeling to open with — you cannot build anything without a body on the board.</span>',
        skipIf: function () { return phase() !== 'MULLIGAN'; },
        until: function () { return phase() !== 'MULLIGAN'; } },

      // No skipIf on the phase here: the mulligan step above already waits for
      // the overlay to close, so this cannot run behind it in normal play — and
      // guarding it meant a player who pressed Skip on the mulligan lost the
      // board lesson outright, which is worse than the case it was guarding.
      { id: 'hud', title: 'Reading the board', target: '#boardArea',
        body: 'The Dummy\'s half is above, yours below — each a <b>3x3 grid</b>. The bar at the top of each half shows that side\'s <b>HP</b> (you both start at 50, the Dummy lower here), its <b>Deck</b> and its <b>Energy</b>.' +
          '<span class="tut-p">Sieglings have only <b>Health</b>, <b>Speed</b>, notches and abilities. There is no printed attack stat — <em>all</em> damage comes from abilities.</span>' },


      { id: 'phases', kicker: 'The round loop', title: 'Draw, Setup, Battle', target: '#phaseBadge',
        body: 'Every round runs three phases, and this badge always says which one you are in.' +
          '<span class="tut-p"><b>Draw</b> take a card · <b>Setup</b> place and cast · <b>Battle</b> everything on the board acts once, in Speed order.</span>' },

      { id: 'draw', hint: 'Tap <b>Draw</b>', title: 'Draw your card', target: '#btnDraw',
        body: 'The round opens on Draw. <b>Tap Draw</b> to take your card for the turn.',
        skipIf: function () { return phase() !== 'DRAW'; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 'setup', title: 'Setup is where you build', target: '#phaseBadge',
        body: 'In Setup you may place <b>one</b> Siegeling, cast Strategies, set Deceptions face-down, and claim surviving Sieglings for temporary energy.' +
          '<span class="tut-p">How much you can do is <b>1 action plus 1 per energy</b> you were holding when the phase began — so energy buys tempo, not just moves.</span>',
        until: function () { return phase() === 'SETUP' || phase() === 'BATTLE'; } },

      { id: 'pick', hint: 'Tap a <b>Siegeling</b> in hand', title: 'Choose a Siegeling', target: '#playerHand',
        body: 'Your hand runs along the bottom. <b>Tap a Siegeling</b> — the cards with an HP and SPD box — and the legal cells on your grid will light up.',
        until: function () { return selectedType() === 'SIEGLING' || mine() > 0; } },

      { id: 'place', hint: 'Tap a lit cell to place', title: 'Place it on the grid',
        target: function () { return firstOf(['#playerGrid .board-cell.legal', '#playerGrid']); },
        body: 'Your first Siegeling can go <b>anywhere</b>. After that, new ones must build off the foundation network you already have, so the first cell shapes the whole board.' +
          '<span class="tut-p">You may hold up to <b>5</b> Sieglings. Evolutions are placed onto their living precursor and are exempt from both the cap and the one-per-turn limit.</span>',
        until: function () { return mine() > 0; } },

      // Deliberately no `until`: casting is optional, and an earlier cut waited
      // on a condition only *leaving* Setup could satisfy — which stranded any
      // player who did not want to cast, since End Turn is the step after this.
      { id: 'spell', title: 'Strategies and Deceptions', target: '#playerHand',
        body: '<b>Strategies</b> are cast on your turn and paid from <b>your</b> elemental energy and any <b>combo</b> energy you have banked — they resolve the moment you play them.' +
          '<span class="tut-p"><b>Deceptions</b> are also set on your turn, face-down, but their cost keys off <b>your opponent\'s</b> energy — set them to punish a specific element you expect them to hold.</span>' +
          '<span class="tut-p">Cast one now if you are holding one and can afford it. It is optional — carry on either way.</span>',
        skipIf: function () { return !handHas('SPELL') && !handHas('TRAP'); } },

      // The ability popup is full-height, so the tip must overlap it — and then
      // WHICH side matters: hugging the top buries the ✕ that dismisses it.
      { id: 'knight', hint: 'Tap <b>Knight</b>', title: 'Your SiegeKnight', target: '#btnTrainerAbility',
        avoid: '.trainer-ability-close',
        body: 'Squire Bob sits behind your board with a <b>passive</b> that is always on and an <b>active</b> you spend. <b>Tap Knight</b> to read what he does — using it here is optional, but knowing it is not.',
        until: function () { return seen.knightSpent || visible('#trainerAbilityOverlay') || seen.knightOpened; } },

      { id: 'endturn', hint: 'Tap <b>End Turn</b>', title: 'Hand over the phase', target: actionBtn,
        body: 'You are done building. <b>End Turn</b> passes to the Dummy; once both sides finish Setup, Battle starts on its own.',
        until: function () { return !myTurn() || phase() === 'BATTLE'; } },

      { id: 'battle', title: 'Battle resolves in Speed order', target: '#boardArea',
        body: 'Every Siegeling on the board now acts once, fastest first, spending energy on its abilities. Watch the order play out — you do not act again until it finishes.' +
          '<span class="tut-p">Elements matter here: <b>Fire &gt; Ice &gt; Wind &gt; Earth &gt; Fire</b>. Your Ashen Roots Fire hits this Ice Dummy hard.</span>',
        until: function () { return seen.sawBattle; } },

      { id: 'target', hint: 'Pick a <b>target</b> when asked', title: 'Choosing targets',
        target: function () { return firstOf(['#enemyGrid .board-cell.targetable', '#enemyGrid']); },
        body: 'When an ability needs a target, the legal cells light up and the board waits for you. Single-target moves ask for one cell; row and board moves take everything in range.' +
          '<span class="tut-p">Tap a lit enemy cell to fire.</span>',
        skipIf: function () { return !visible('#enemyGrid .board-cell.targetable'); },
        until: function () { return !visible('#enemyGrid .board-cell.targetable'); } },

      // No `until`: this explains a rule, it does not ask for a tap.
      { id: 'kill', title: 'Siege Damage', target: '#enemyGrid',
        body: 'When a Siegeling is defeated, its owner takes <b>Siege Damage</b> straight to HP. Higher rarity hits harder — read the card frame: 🟢 Uncommon, 🔵 Rare, 🟣 Epic, 🟡 Legendary, 🔴 the heaviest tiers.' +
          '<span class="tut-p">That is the second way to win: burn a player down through their board without ever touching them directly.</span>' },

      { id: 'claim', title: 'Claiming for energy',
        target: function () { return firstOf(['#playerGrid .board-cell.claimable', '#playerGrid']); },
        body: 'A Siegeling that survives a battle can be <b>claimed</b> in a later Setup for temporary energy. It leaves the board to do it, so claiming is a real trade: a body now, or a bigger play this round.',
        skipIf: function () { return !visible('#playerGrid .board-cell.claimable'); } },

      { id: 't2-draw', hint: 'Tap <b>Draw</b>', title: 'Turn 2 — draw again', target: '#btnDraw',
        body: 'The loop continues. <b>Tap Draw</b> to take your card for round two.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 't2-setup', title: 'Setup again', target: '#phaseBadge',
        body: 'Back in Setup. This is where you grow the board and bank energy for the next battle.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() === 'SETUP' || phase() === 'BATTLE'; } },

      { id: 't2-pick', hint: 'Tap a <b>Siegeling</b> in hand', title: 'Place a second Siegeling', target: '#playerHand',
        body: '<b>Tap another Siegeling</b> from your hand. You will place it beside your first so their notches can link.',
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return selectedType() === 'SIEGLING' || mine() >= 2; } },

      { id: 't2-place', hint: 'Tap a lit cell beside your first', title: 'Build a link', target: function () {
          return firstOf(['#playerGrid .board-cell.legal', '#playerGrid']);
        },
        body: 'Place it in a lit cell <b>next to</b> your first Siegeling with notches pointing at each other. Matching elements bank plain energy; <b>Fire</b> and <b>Earth</b> together bank a <b>combo point</b> instead.',
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return mine() >= 2; } },

      { id: 't2-notches', title: 'Notches make the energy', target: '#playerGrid',
        body: 'Those coloured dots are <b>notches</b>. When two neighbours each point a notch <em>at each other</em>, that is a <b>reciprocal link</b> — it is what generates energy every round.' +
          '<span class="tut-p">A notch with nothing pointing back does nothing. Edge cells can instead anchor to perimeter <b>sockets</b> — the dots outside the grid.</span>',
        skipIf: function () { return turn() < 2 || mine() < 2; } },

      { id: 't2-energy', hint: 'Tap <b>◈</b> for the breakdown', title: 'Your link energy', target: '#btnEnergyDetail',
        body: 'Same-element links add elemental energy to your pool — check the coloured dots beside your HP. That energy plus any combo points is what pays for Strategies on your turn.',
        skipIf: function () { return turn() < 2 || mine() < 2; },
        until: function () { return seen.hadLinkEnergy || comboCount() > 0; } },

      { id: 't2-combo', title: 'Combo links', target: '#btnEnergyDetail',
        body: 'When linked notches carry <b>different</b> elements, the pair banks a <b>combo point</b> — the split-colour token in your energy row. Combo energy unlocks the heavier Strategies and the strongest abilities.' +
          '<span class="tut-p">Ashen Roots mixes Fire and Earth so you can build both. Tap <b>◈</b> any time for the full breakdown.</span>',
        skipIf: function () { return turn() < 2 || mine() < 2; } },

      { id: 'tools', title: 'The tools along the bottom', target: '#btnHint',
        body: '<b>?</b> tells you exactly what the game is waiting on — reach for it whenever you are unsure. <b>≡</b> is the full log of every action. <b>👁</b> blows up the selected card so you can read its notches.' },

      { id: 'loop', title: 'The round loop', target: '#phaseBadge',
        body: 'That is the full loop: <b>Draw</b>, build links and spend energy in <b>Setup</b> — Strategies from your pool, Deceptions keyed to theirs — then <b>Battle</b> resolves and the round repeats.' +
          '<span class="tut-p">You have seen one full round and built your first links. Keep playing this match on your own, or head to the Arena when you are ready.</span>' },

      { id: 'done', kicker: 'Tutorial complete', title: '🎉 Well fought', finish: true, finale: true,
        body: 'That is the Battle Table: notches make energy, energy pays for Strategies and sets Deceptions, and abilities are the only thing that deals damage.' +
          '<span class="tut-p"><b>Where to go next.</b> The <b>Arena</b> is this same game against real opponents. <b>Siege</b> is the single-player expedition — a branching map, a warband you level up, and a boss at the top; win one and you can bank that team for <b>Battlegrounds</b>. Both draw on the collection you build in the Keep.</span>' +
          '<span class="tut-p">You can replay this tutorial match any time.</span>' }
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
      maxMine: 0, maxTheirs: 0, maxTurn: 0, enemyDown: false, sawBattle: false,
      hadLinkEnergy: false, hadCombo: false,
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
      onStop: function () {
        ACTIVE = false;
        if (watchRaf) window.cancelAnimationFrame(watchRaf);
        watchRaf = 0;
      },
      bodyClass: 'arena-tutorial'
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
