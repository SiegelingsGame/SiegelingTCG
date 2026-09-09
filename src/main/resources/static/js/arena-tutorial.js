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
  var linkBaseline = null;   // same-element links standing when that lesson opened
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

  /**
   * The live status badge to ring. Prefer opponent Burn — that is the Fire hit
   * the student just landed, and the first-stack / badge chapter walks that
   * card into the Burn tag. Falls back through any enemy badge, then the
   * player's, then the grid so the ring always lands on something real — a
   * badge is transient and the board re-renders under it.
   *
   * Selector-based, so it follows the badge wherever the layout puts it: phone
   * portrait, landscape and desktop all position the ring off the element's own
   * rect, and both tutorials share this script.
   */
  function badgeSelector() {
    return firstOf([
      '#enemyGrid .sb-badge[data-status="BURN"]',
      '#enemyGrid .sb-badge',
      '#playerGrid .sb-badge',
      '#enemyGrid',
      '#playerGrid',
      '#boardArea'
    ]);
  }

  /**
   * The board cell holding the badge, as a selector. Walks up from the live badge
   * to its cell and rebuilds the selector from data-row/data-col, the same way
   * linkedCellSelectors() names a cell — the coach re-resolves highlights every
   * frame, so it needs a selector it can look up again, not a node reference.
   * Prefer opponent Burn so the ring stays on the card first-stack introduced.
   */
  function badgeCellSelector() {
    var badge = null;
    try {
      badge = document.querySelector('#enemyGrid .sb-badge[data-status="BURN"]')
        || document.querySelector('#enemyGrid .sb-badge')
        || document.querySelector('#playerGrid .sb-badge');
    } catch (e) { return null; }
    if (!badge || !badge.closest) return null;
    var cell = badge.closest('.board-cell');
    if (!cell) return null;
    var grid = badge.closest('#playerGrid') ? '#playerGrid' : '#enemyGrid';
    var r = cell.getAttribute('data-row'), c = cell.getAttribute('data-col');
    if (r == null || c == null) return null;
    var sel = grid + ' .board-cell[data-row="' + r + '"][data-col="' + c + '"]';
    return visible(sel) ? sel : null;
  }

  function badgeHighlight() {
    // Ring the CARD wearing the badge, not the grid it sits in. Ringing badge +
    // grid together spanned the whole board, because the union of the two is the
    // grid — so the spotlight was back to "somewhere on your half". The cell
    // contains the badge, so one selector covers both and the ring closes right
    // down onto the card being talked about.
    var cell = badgeCellSelector();
    if (cell) return [cell];
    var sel = badgeSelector();
    return [sel];
  }

  // ---- the card view, and the badge chips inside it -------------------------
  //
  // Two layouts render the same lesson differently. The phone puts the preview
  // in a bottom drawer whose chips are BUTTONS that open the affliction sheet;
  // the desktop panel renders its effect list as plain spans and offers only
  // "View All Effects". So the chip lesson has to know which one it is looking
  // at, and must not demand a tap the desktop layout has no control for.

  /** The badge chip in the open card view — the "Chill 1" pill. Null when the
   *  view is closed or the card is wearing nothing. */
  function previewChipSelector() {
    return firstOf2([
      '.selected-copy-buffs .buff-pill:not(.buff-pill-all)',
      '.desktop-preview-effect-pill'
    ]);
  }

  /** The chip only where it is a real button that opens the affliction sheet.
   *  The desktop panel's pills are spans, so this is null there and the lesson
   *  that asks for a tap steps aside for the one that does not. */
  function chipButton() {
    return firstOf2(['.selected-copy-buffs .buff-pill:not(.buff-pill-all)']);
  }

  /** firstOf, but null rather than the last entry when nothing is on screen —
   *  a step that must SKIP when its subject is absent cannot be handed a
   *  fallback selector that always resolves. */
  function firstOf2(list) {
    for (var i = 0; i < list.length; i++) { if (visible(list[i])) return list[i]; }
    return null;
  }

  /** True once tapping a card has opened its preview. Keyed on the effects
   *  block rather than the drawer, because that block is what the next two
   *  lessons point at, and it is the same class in both layouts' markup. */
  function cardViewOpen() {
    return visible('.selected-copy-buffs') || visible('.desktop-preview-effects-body');
  }

  /** The control that opens the full reference. Inside the effect sheet once
   *  that is open, otherwise the one sitting in the card view. */
  function allEffectsSelector() {
    if (effectKeyOpen()) return firstOf(['#btnEffectKeyAll', '#effectKeyOverlay']);
    return firstOf(['.buff-pill-all', '.desktop-preview-effects-all', '.selected-copy-buffs', '#boardArea']);
  }

  function effectKeyOpen() {
    return visible('#effectKeyOverlay:not(.hidden)');
  }

  /** The reference list, as opposed to the single-affliction sheet. The overlay
   *  is the same element for both, so read the kicker it swaps. */
  function allEffectsOpen() {
    if (!effectKeyOpen()) return false;
    var k = null;
    try { k = document.getElementById('effectKeyKicker'); } catch (e) { return false; }
    return !!k && /reference/i.test(k.textContent || '');
  }

  /** True while the mulligan's redraw reveal is still playing. The server ends
   *  the MULLIGAN phase the moment the redraw lands, so any step that waits on
   *  the phase alone would open on top of the cards turning over. */
  function revealingMulligan() {
    var b = bridge();
    try { return !!(b && b.mulliganRevealing && b.mulliganRevealing()); } catch (e) { return false; }
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
    return cards.find(function (c) { return String(c.id || c.name).toLowerCase() === 'raydile'; }) || cards[0] || null;
  }

  function costTarget() {
    var card = handCardTarget(costedCard());
    document.querySelectorAll('.tutorial-cost-card').forEach(function (node) { node.classList.remove('tutorial-cost-card'); });
    if (!card) return null;
    var node = document.querySelector(card);
    node.classList.add('tutorial-cost-card');
    return firstOf([card + ' .hand-cost-badge', card + ' .card-corner-cost']);
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

  /**
   * The legal cell where the SELECTED card would actually connect: one of its
   * notches and a neighbour's facing each other. Round two's lesson is "point
   * them at each other", and ringing every legal cell left the player to work
   * out which one of three actually makes the link — so the coach names it.
   *
   * Same-element pairs score above mixed ones, because the lesson that follows
   * this placement is the same-element link; a mixed pair still connects, so it
   * is taken when nothing matches. Returns null when no legal cell links at all,
   * which leaves the broad legal-cell spotlight as the only guidance rather than
   * pointing confidently at a cell that would teach nothing.
   *
   * Same adjacency rule as forEachPlayerLink, one board deeper: that walks links
   * that EXIST, this scores links a placement WOULD make.
   */
  function linkCell() {
    var b = bridge();
    var card = b && b.selected ? b.selected() : null;
    var cells = (b && b.legalPlacements) ? (b.legalPlacements() || []) : [];
    var g = gs();
    var board = (g && g.playerBoard) || [];
    if (!card || !cells.length) return null;
    var best = null, bestScore = 0;
    cells.forEach(function (p) {
      var r = p[0], c = p[1], score = 0;
      (card.notches || []).forEach(function (notch) {
        if (!notch || !notch.direction) return;
        var d = playerDelta(notch.direction);
        var nr = r + d[0], nc = c + d[1];
        if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
        var neighbour = board[nr] && board[nr][nc];
        if (!neighbour) return;
        var wanted = OPPOSITE_DIR[notch.direction];
        (neighbour.notches || []).forEach(function (n) {
          if (!n || n.direction !== wanted) return;
          var same = notch.element && n.element
            && String(notch.element).toUpperCase() === String(n.element).toUpperCase();
          score = Math.max(score, same ? 2 : 1);
        });
      });
      if (score > bestScore) { bestScore = score; best = p; }
    });
    if (!best) return null;
    var sel = '#playerGrid .board-cell[data-row="' + best[0] + '"][data-col="' + best[1] + '"]';
    return visible(sel) ? sel : null;
  }

  /** Fire in the pool — the claim lesson is about reaching Ashfall's cost of 3. */
  function fireEnergy() {
    var g = gs();
    return (g && g.player && Number(g.player.fireEnergy)) || 0;
  }

  /** A hand card by id, so copy can name it without hard-coding the name. */
  function handCardNamed(id) {
    return hand().filter(function (c) {
      return c && String(c.id || '').toLowerCase() === String(id).toLowerCase();
    })[0] || null;
  }

  /** Placements still available this Setup. The budget is one placement plus one
   *  per unit of pooled energy, and the lesson after the wipe reads it back. */
  function actsRemaining() {
    var b = bridge();
    var data = null;
    try { data = b && b.setupActions ? b.setupActions() : null; } catch (e) { data = null; }
    if (!data || !Number.isFinite(Number(data.remaining))) return 1;
    return Math.max(0, Number(data.remaining));
  }

  /** Any Siegeling on either board wearing a status/affliction whose kind
   *  matches. The advanced lessons wait on the EFFECT appearing, not on a
   *  particular card being played, so any route to it counts. */
  function anyStatus(re) {
    var g = gs();
    if (!g) return false;
    var found = false;
    [g.playerBoard, g.enemyBoard].forEach(function (board) {
      (board || []).forEach(function (row) {
        (row || []).forEach(function (c) {
          if (!c || found) return;
          (c.statuses || []).concat(c.afflictions || []).forEach(function (st) {
            if (found || !st) return;
            var kind = String(st.kind || st.type || st).toUpperCase();
            if (re.test(kind)) found = true;
          });
          if (!found && re.test('SHIELD') && Number(c.shield) > 0) found = true;
          if (!found && re.test('DAMAGE_BOOST') && Number(c.damageBoost) > 0) found = true;
        });
      });
    });
    return found;
  }

  // Scope every action-bar tip to the visible layout, never a hidden duplicate.
  function firstBattleField(field) {
    var panels = ['#battleActionPanel', '#desktopHandBattlePanel', '#desktopBattleActionPanel'];
    for (var i = 0; i < panels.length; i++) {
      var selector = panels[i] + ' ' + field;
      if (visible(selector)) return selector;
    }
    return null;
  }

  function ashfallTarget() {
    return handCardTarget(hand().find(function (c) { return c.id === 'tutorial_ashfall'; }));
  }
  function previewField(mobile, desktop) {
    return firstOf2(['#drawerSelected ' + mobile, '#desktopCardPreviewPanel ' + mobile, '#desktopCardPreviewPanel ' + desktop]);
  }
  function ashfallPreviewOpen() {
    var b = bridge();
    var card = b && b.previewCard ? b.previewCard() : null;
    return card && card.id === 'tutorial_ashfall' && !!previewField('.selected-preview-card', '.desktop-preview-card');
  }

  /**
   * Opponent Burn on the board — the Fire hit you just landed. Prefer the
   * CELL (card) over the badge node so the ring closes onto Cozycub itself,
   * matching the later badge chapter's badgeCellSelector pattern.
   */
  function enemyBurnCellSelector() {
    var badge = null;
    try { badge = document.querySelector('#enemyGrid .sb-badge[data-status="BURN"]'); } catch (e) { return null; }
    if (!badge || !badge.closest) return null;
    var cell = badge.closest('.board-cell');
    if (!cell) return null;
    var r = cell.getAttribute('data-row'), c = cell.getAttribute('data-col');
    if (r == null || c == null) return null;
    var sel = '#enemyGrid .board-cell[data-row="' + r + '"][data-col="' + c + '"]';
    return visible(sel) ? sel : null;
  }

  function enemyBurnBadgeSelector() {
    return visible('#enemyGrid .sb-badge[data-status="BURN"]')
      ? '#enemyGrid .sb-badge[data-status="BURN"]'
      : null;
  }

  /** First-stack lesson: always the opponent's Burn when present. Never the
   *  battle-panel badge or your own Chill — those are a different lesson. */
  function firstStackTarget() {
    return enemyBurnCellSelector() ||
      enemyBurnBadgeSelector() ||
      (visible('#enemyGrid .sb-badge') ? '#enemyGrid .sb-badge' : null);
  }

  function firstStackHighlight() {
    var cell = enemyBurnCellSelector();
    if (cell) return [cell];
    var sel = firstStackTarget();
    return sel ? [sel] : ['#enemyGrid'];
  }

  /** Burn intro on the opponent card — leads into the Burn tag / Fire element
   *  tag / full burn sheet in the next beats. */
  function firstStackCopy() {
    var badge = null;
    try { badge = document.querySelector('#enemyGrid .sb-badge[data-status="BURN"]'); } catch (e) { badge = null; }
    var detail = badge && badge.getAttribute('title');
    return (detail ? '<b>' + esc(detail) + '</b><br>' : '<b>Burn</b><br>') +
      'Your Fire hit left that flame on the <b>opponent card</b>. The number is the Burn stack count — more stacks, more damage at their next Setup. ' +
      '<b>Tap the card</b> to open it, then its Burn tag, to see the Fire element tag and the full burn rules.';
  }

  /** Battle-panel badge copy — separate from the opponent-Burn lesson above. */
  function actingBadgeCopy() {
    var selector = firstBattleField('.sb-badge');
    var badge = selector && document.querySelector(selector);
    var detail = badge && badge.getAttribute('title');
    return (detail ? '<b>' + esc(detail) + '</b><br>' : '') +
      'This badge shows an effect already on the creature. Its number is the current stack count (or shield amount for a shield badge). ' +
      'Ice adds Chill; Fire adds Burn. Further applications can add stacks.';
  }

  // ---- multi-target lesson --------------------------------------------------

  /** The Siegeling whose turn to act it is, read from the battle queue's pick. */
  function actingCard() {
    var g = gs();
    var p = g && g.pendingBattle;
    if (!p) return null;
    var board = (g.playerBoard) || [];
    var cell = board[p.row] && board[p.row][p.col];
    return cell || null;
  }

  function abilitiesOf(card) {
    if (!card) return [];
    if (Array.isArray(card.abilities) && card.abilities.length) return card.abilities.filter(Boolean);
    return card.ability ? [card.ability] : [];
  }

  function isRowAbility(a) {
    var t = String((a && a.targetType) || '').trim().toUpperCase();
    return t === 'ROW_ENEMIES' || t === 'ROW_SELECT_ENEMIES';
  }

  /** A row-hitting move on whoever is acting, or null. Pylook's Flameburst and
   *  Lavaburst are the first ones the student meets. */
  function actingRowAbility() {
    var list = abilitiesOf(actingCard()).filter(isRowAbility);
    return list.find(function (ability) {
      return String(ability.name || '').trim().toLowerCase() === 'lavaburst';
    }) || list[0] || null;
  }

  function battleTargeting() {
    var b = bridge();
    try { return !!(b && b.battleTargeting && b.battleTargeting()); } catch (e) { return false; }
  }

  /** True once a row is marked and the board is waiting on Confirm. A row move
   *  costs two taps, so "pick a row" and "confirm the row" are separate lessons
   *  — one tip covering both would sit over a board that already moved on. */
  function rowPicked() {
    var b = bridge();
    try { return !!(b && b.battleRowPicked && b.battleRowPicked()); } catch (e) { return false; }
  }

  /** The confirm button's own label, so the coach quotes what the player sees. */
  function rowConfirmText() {
    var b = bridge();
    try { return String((b && b.battleRowConfirmText && b.battleRowConfirmText()) || ''); } catch (e) { return ''; }
  }

  /** Both layouts render the confirm pair; the overlay copy is the one on
   *  screen on a phone, the panel copy on desktop. */
  var ROW_CONFIRM_BTNS = '.battle-row-confirm-btn';

  function rowConfirmButton() {
    return firstOf2(['#battleRowConfirmOverlay .battle-row-confirm-primary',
                     '.battle-row-confirm-primary']);
  }

  // ---- burn-kill lesson -----------------------------------------------------

  /** The best "the swing does not kill it, the Burn does" play on the board, as
   *  {abilityName, target, row, col, hp, hit, weak, burn, left} — or null when
   *  no such play exists. game.js computes it from the same damage/weakness
   *  helpers the move panel prints, so the coach never promises a kill the
   *  board disagrees with. */
  function burnPlan() {
    var b = bridge();
    try { return (b && b.burnKillPlan && b.burnKillPlan()) || null; } catch (e) { return null; }
  }

  /** The plan's move button, matched on the printed name for the same reason
   *  rowMoveButton() is: the panel's ability index comes from a different walk
   *  than this file does. */
  function burnMoveButton() {
    var plan = burnPlan();
    if (!plan || !plan.abilityName) return null;
    var want = String(plan.abilityName).trim().toLowerCase();
    var btns;
    try { btns = document.querySelectorAll(MOVE_BTNS); } catch (e) { return null; }
    for (var i = 0; i < btns.length; i++) {
      var label = btns[i].querySelector('.battle-ability-move-name');
      if (!label || String(label.textContent || '').trim().toLowerCase() !== want) continue;
      var idx = btns[i].getAttribute('data-ability-index');
      if (idx == null) continue;
      var sel = '.battle-ability-btn[data-ability-index="' + idx + '"]';
      return visible(sel) ? sel : null;
    }
    return null;
  }

  /** The plan's victim on the enemy grid. */
  function burnTargetCell() {
    var plan = burnPlan();
    if (!plan) return null;
    var sel = '#enemyGrid .board-cell.targetable[data-row="' + plan.row + '"][data-col="' + plan.col + '"]';
    return visible(sel) ? sel : null;
  }

  /** The arithmetic, said out loud: hit, weakness bonus, burn tick, HP. */
  function burnMathSentence(plan) {
    if (!plan) return '';
    var target = plan.target ? '<b>' + esc(plan.target) + '</b>' : 'it';
    var weak = plan.weak
      ? ' — it is <b>weak to Fire</b>, so the hit lands for <b>' + plan.hit + '</b> instead of ' + (plan.hit - 1) + ' —'
      : ' for <b>' + plan.hit + '</b>';
    return target + ' is on <b>' + plan.hp + ' HP</b>' + weak + ' leaving <b>' + plan.left + '</b>. ' +
      'Fire also leaves <b>Burn</b>, and burn ticks for <b>' + plan.burn + '</b> at the start of their next Setup — ' +
      'so ' + target + ' is dead before it acts again, without spending a second swing on it.';
  }

  /** Every move button on the acting Siegeling's panel, whichever layout is up. */
  var MOVE_BTNS = '#battleActionPanel .battle-ability-btn, #desktopBattleActionPanel .battle-ability-btn';

  /**
   * The button for the acting Siegeling's row move, found by the move NAME the
   * button prints rather than by ability index. The index the panel renders is
   * assigned while it walks the card's usable moves, which is not the same walk
   * this file does — matching on the name the player can actually read keeps the
   * two from drifting.
   */
  function rowMoveButton() {
    var row = actingRowAbility();
    if (!row || !row.name) return null;
    var want = String(row.name).trim().toLowerCase();
    var btns;
    try { btns = document.querySelectorAll(MOVE_BTNS); } catch (e) { return null; }
    for (var i = 0; i < btns.length; i++) {
      var label = btns[i].querySelector('.battle-ability-move-name');
      if (!label || String(label.textContent || '').trim().toLowerCase() !== want) continue;
      var idx = btns[i].getAttribute('data-ability-index');
      if (idx == null) continue;
      var panel = btns[i].closest('#battleActionPanel, #desktopBattleActionPanel');
      if (!panel) continue;
      var sel = '#' + panel.id + ' .battle-ability-btn[data-ability-index="' + idx + '"]';
      if (visible(sel)) return sel;
    }
    return null;
  }

  /**
   * The enemy row currently offering the most targets, as {row, count}. This is
   * the whole point of the lesson — a row move is worth picking when the row is
   * full — so the coach names the row that actually pays rather than a fixed
   * "middle", which would be wrong the moment the board differs.
   */
  function fullestEnemyRow() {
    var best = null;
    for (var r = 0; r < 3; r++) {
      var sel = '#enemyGrid .board-cell.targetable[data-row="' + r + '"]';
      var n = 0;
      try { n = document.querySelectorAll(sel).length; } catch (e) { n = 0; }
      if (n > 0 && (!best || n > best.count)) best = { row: r, count: n };
    }
    return best;
  }

  /** One targetable card in that row, for the coach to mark. */
  function fullestRowTarget() {
    var best = fullestEnemyRow();
    if (!best) return null;
    var sel = '#enemyGrid .board-cell.targetable[data-row="' + best.row + '"]';
    return visible(sel) ? sel : null;
  }

  /**
   * Round two's battle is OVER — the escape for the lessons that play out
   * during it. Deliberately not `seen.sawBattle2`, which means "it started":
   * that latches on the battle's first frame, so any wait keyed to it is
   * already satisfied when the coach gets there. The battle is done once the
   * phase has left BATTLE again, or the round counter has moved on.
   */
  function battleTwoDone() {
    if (seen.ended) return true;
    if (!seen.sawBattle2) return false;
    return phase() !== 'BATTLE' || turn() >= 3;
  }

  /** A single-target move already seen, to contrast against — Sundile's Strike
   *  in the pinned deck, but read from the board so the copy cannot go stale. */
  function singleTargetExample() {
    var g = gs();
    var board = (g && g.playerBoard) || [];
    var found = null;
    board.forEach(function (row) {
      (row || []).forEach(function (cell) {
        if (found || !cell) return;
        abilitiesOf(cell).forEach(function (a) {
          if (found) return;
          var t = String((a && a.targetType) || '').trim().toUpperCase();
          if (t === 'SINGLE_ENEMY') found = { card: cell, ability: a };
        });
      });
    });
    return found;
  }

  /** The linking cell when there is one, else whatever legal cells are lit. */
  function linkCellOrLegal() {
    return linkCell() || firstOf(['#playerGrid .board-cell.legal', '#playerGrid']);
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

  /**
   * The evolution in hand that can actually go down RIGHT NOW — one whose base
   * is standing on the board, has survived a battle phase and is not cursed.
   *
   * This used to be "the first evolution in hand", full stop, and that stranded
   * the chapter outright: the tutorial hand holds two of them (Raydile over
   * Sundile, Flora Knight over Squire Bud). Play Raydile and the reader still
   * answered Flora Knight — whose base is not on the board — so the place step's
   * `until` never came true, no cell could light for it, and the hint fell back
   * to "Tap the lit cell on your board" with nothing lit and no way forward.
   * A lesson about a move must only ever name a move the game would allow.
   */
  function evolutionInHand() {
    return hand().filter(function (c) {
      return c && c.type === 'SIEGLING' && c.evolvesFromId && evolutionBaseCells(c).length > 0;
    })[0] || null;
  }

  /** Board coords of the bases an in-hand evolution could actually go down on.
   *  Mirrors game.js getEvolutionPlacements — same cardId, at least one battle
   *  phase survived, not cursed — because a coach that rings a cell the game
   *  would refuse is worse than no ring at all. Board cells carry `cardId`
   *  where hand cards carry `id`; that asymmetry is the server's, not a typo. */
  function evolutionBaseCells(evo) {
    var g = gs();
    var board = (g && g.playerBoard) || [];
    var out = [];
    if (!evo || !evo.evolvesFromId) return out;
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < (board[r] || []).length; c++) {
        var cell = board[r][c];
        if (!cell || cell.cardId !== evo.evolvesFromId) continue;
        if (!(Number(cell.battlePhasesSeen || 0) > 0)) continue;
        if (hasCurse(cell)) continue;
        out.push([r, c, cell]);
      }
    }
    return out;
  }

  function hasCurse(cell) {
    var rows = (cell && cell.afflictions) || [];
    return rows.some(function (row) {
      return row && String(row.kind || '').toUpperCase() === 'CURSE' && Number(row.stacks) > 0;
    });
  }

  /** The base cell the evolve lesson rings — the actual card on the board the
   *  evolution grows out of, not the grid at large. */
  function evolutionBaseTarget() {
    var cells = evolutionBaseCells(evolutionInHand());
    if (cells.length) {
      var sel = '#playerGrid .board-cell[data-row="' + cells[0][0] + '"][data-col="' + cells[0][1] + '"]';
      if (visible(sel)) return sel;
    }
    return firstOf(['#playerGrid .board-cell.legal', '#playerGrid']);
  }

  function evolutionBaseName() {
    var cells = evolutionBaseCells(evolutionInHand());
    return (cells.length && cells[0][2] && cells[0][2].name) || '';
  }

  /** Both halves of the evolution are on the table: the card is in hand AND a
   *  base it may legally land on is on the board. The guided pick/place pair
   *  only runs when this holds — otherwise the coach would ask for a move the
   *  match cannot accept, which is how a lesson strands itself. */
  function evolutionReady() {
    return evolutionBaseCells(evolutionInHand()).length > 0;
  }

  function selectedIsEvolution() {
    var b = bridge();
    var card = b ? b.selected() : null;
    return !!(card && card.evolvesFromId);
  }

  /** Where a given hand card is rendered, so a step can mark that one card.
   *  Hand cards carry data-hand-index, which is stable for a given hand. */
  function handCardTarget(card) {
    var h = hand();
    for (var i = 0; i < h.length; i++) {
      if (h[i] === card) {
        var sel = '#playerHand .hand-card[data-hand-index="' + i + '"]';
        if (visible(sel)) return sel;
      }
    }
    return null;
  }

  /**
   * The opener the pick step marks. First choice is the base the round-two
   * evolution grows out of — that is a sequencing requirement, not a
   * preference: evolving needs the base to have already survived a battle
   * phase, so it must go down now.
   *
   * Not every deal holds the evolution at this point though (the tutorial hand
   * after a Keep is Sundile, Pylook, Ashfall, Shatter Seal, Pylook —
   * no Raydile), and there the tip falls back to generic wording. Rather than
   * mark an arbitrary card, fall back to the rule the very next step teaches:
   * whichever playable Siegeling reaches the most perimeter sockets.
   */
  function openerCard() {
    var pair = baseOfEvolutionInHand();
    if (pair) return pair.base;
    var h = hand();
    var best = null, bestScore = -1;
    for (var i = 0; i < h.length; i++) {
      var c = h[i];
      if (!c || c.type !== 'SIEGLING' || c.evolvesFromId) continue;
      var score = 0;
      for (var r = 0; r < 3; r++) {
        for (var col = 0; col < 3; col++) {
          var v = socketScore(c, r, col);
          if (v > score) score = v;
        }
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  function openerTarget() {
    var sel = handCardTarget(openerCard());
    return sel || firstOf(['#playerHand .hand-card', '#playerHand']);
  }

  /** A plain (non-evolution) Siegeling in hand that is NOT the named base — the
   *  partner the round-two link is built with. */
  function partnerSiegling(excludeId) {
    return hand().filter(function (c) {
      return c && c.type === 'SIEGLING' && !c.evolvesFromId && c.id !== excludeId;
    })[0] || null;
  }

  /**
   * The one card the round-two pick step names, marks and leaves open. It used
   * to be worked out three times in that step — the hint excluding nothing, the
   * body excluding the evolution's base — so the tip could name one card while
   * a different one was the "right" answer. One reader now, and the lock is fed
   * from the same place as the copy.
   */
  function partnerCard() {
    var pair = baseOfEvolutionInHand();
    return partnerSiegling(pair && pair.base ? pair.base.id : null);
  }

  function partnerTarget() {
    return handCardTarget(partnerCard());
  }

  /** Every card in the hand, as one selector — the candidate set a pick step
   *  narrows to its recommendation. */
  var HAND_CARDS = '#playerHand .hand-card';

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

  /** Walks every live reciprocal link on the player's board, calling back with
   *  both cells and the two facing notches. One adjacency rule for the whole
   *  file: the lesson that spotlights a link and the check for whether one
   *  already exists must never disagree about what counts as linked. */
  function forEachPlayerLink(cb) {
    var g = gs();
    var board = (g && g.playerBoard) || [];
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < (board[r] || []).length; c++) {
        var card = board[r][c];
        if (!card) continue;
        /* jshint loopfunc:true */
        (function (row, col, self) {
          (self.notches || []).forEach(function (notch) {
            if (!notch || !notch.direction) return;
            var d = playerDelta(notch.direction);
            var nr = row + d[0], nc = col + d[1];
            if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
            var neighbour = board[nr] && board[nr][nc];
            if (!neighbour) return;
            var wanted = OPPOSITE_DIR[notch.direction];
            var facing = null;
            (neighbour.notches || []).forEach(function (n) {
              if (!facing && n && n.direction === wanted) facing = n;
            });
            if (!facing) return;
            cb({ row: row, col: col }, { row: nr, col: nc }, notch, facing);
          });
        }(r, c, card));
      }
    }
  }

  /** Selectors for every player cell holding a Siegeling that is in a live
   *  reciprocal link. The link lesson spotlights the two cards it is talking
   *  about; ringing the whole grid left the player hunting for them. */
  function linkedCellSelectors() {
    var out = [];
    function push(r, c) {
      var sel = '#playerGrid .board-cell[data-row="' + r + '"][data-col="' + c + '"]';
      if (out.indexOf(sel) < 0 && visible(sel)) out.push(sel);
    }
    forEachPlayerLink(function (a, b) {
      push(a.row, a.col);
      push(b.row, b.col);
    });
    return out;
  }

  /** How many live links already pay a single element — both facing notches
   *  carrying the same one. The same-element lesson must not ask for a link the
   *  board already has: the natural play of dropping the second Siegeling
   *  beside the first usually makes one on the spot, which left the coach
   *  demanding something the player had already done. */
  function sameElementLinkCount() {
    var n = 0;
    forEachPlayerLink(function (a, b, notch, facing) {
      var one = String((notch && notch.element) || '').toUpperCase();
      var two = String((facing && facing.element) || '').toUpperCase();
      if (one && one === two) n++;
    });
    return n / 2 || 0;   // each link is walked from both ends
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
        skipIf: function () { return phase() !== 'MULLIGAN' && !revealingMulligan(); },
        // Hold through the reveal as well as the phase: the redraw ends MULLIGAN
        // server-side straight away, and letting the next tip open there put the
        // board lesson on screen while the cards were still turning over.
        until: function () { return phase() !== 'MULLIGAN' && !revealingMulligan(); } },

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

      { id: 'pick', title: 'Who is going in?', target: openerTarget,
        highlight: ['#playerHand', '#handTray'],
        // The tip named the opener but nothing on screen pointed at it, so the
        // player picked whichever card they liked and then met a gold cell
        // computed for a card they had never been aimed at. The marker the
        // placement step uses for its cell now also lands on this card.
        recommend: openerTarget,
        // Same reason as t2-pick: the opener is the base the round-two
        // evolution grows out of, so opening with a different card costs the
        // player the evolution lesson entirely. Gated on the real card being
        // findable, because openerTarget falls back to the FIRST hand card —
        // locking every other card to an arbitrary slot is worse than not
        // locking at all.
        lock: function () { return handCardTarget(openerCard()) ? HAND_CARDS : null; },
        hint: function () {
          var c = openerCard();
          return c ? 'Tap <b>' + esc(c.name) + '</b>' : 'Tap a <b>Siegeling</b>';
        },
        body: function () {
          var pair = baseOfEvolutionInHand();
          if (!pair) {
            var c = openerCard();
            return 'Pick your opener — it wants <b>HP</b>, <b>SPD</b> and notches that reach the edge. ' +
              (c ? 'Take <b>' + esc(c.name) + '</b>, marked for you. ' : '') +
              'Tap it and the board shows you where it can go.';
          }
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

      { id: 'first-action-ready', skipTo: 'target',
        hint: 'Watch for your creature’s action',
        gate: function () { return !!actingCard() || phase() !== 'BATTLE'; } },

      { id: 'first-actor', title: 'Who is acting?',
        target: function () { return firstBattleField('.battle-queue-card-title'); },
        body: 'This is the <b>active creature’s name</b>. The board marks the same creature <b>Acting</b>. These moves belong to it.',
        skipIf: function () { return !actingCard(); } },
      { id: 'first-health', title: 'Current health',
        target: function () { return firstBattleField('.card-stat-pill-hp'); },
        body: 'The heart shows this creature’s <b>current Health</b>. Damage lowers it; reaching zero knocks the creature out.',
        skipIf: function () { return !actingCard(); } },
      { id: 'first-speed', title: 'Current speed',
        target: function () { return firstBattleField('.card-stat-pill-spd'); },
        body: 'The lightning number is <b>Speed</b>, including current effects. Speed determines the battle order; it is not attack damage.',
        skipIf: function () { return !actingCard(); } },
      { id: 'first-action-badges', title: 'Badges travel with the creature',
        target: function () { return firstBattleField('.sb-badge'); },
        body: actingBadgeCopy,
        skipIf: function () { return !firstBattleField('.sb-badge'); } },
      { id: 'first-options', title: 'Your ability options',
        target: function () { return firstBattleField('.battle-queue-actions'); },
        body: 'Each button is an <b>ability choice</b>. Read its damage and target, then its energy cost on the right. <b>Free</b> costs no energy. The weakness line previews any bonus damage.',
        skipIf: function () { return !actingCard(); } },
      { id: 'first-pass', title: 'Pass this action', target: '#btnBattlePass',
        body: '<b>Pass</b> skips this creature’s action without using an ability. It does not end the whole battle. You can keep your attack for this lesson — you do not need to pass.',
        skipIf: function () { return !visible('#btnBattlePass'); } },
      { id: 'first-next', title: 'Who acts next?', target: '#btnBattlePassNext',
        body: 'The <b>Next</b> line names the next acting creature and its owner. It previews who follows after your action or a pass.',
        skipIf: function () { return !visible('#btnBattlePassNext'); } },
      { id: 'first-choose', title: 'Choose your first move',
        target: function () { return firstBattleField('.battle-queue-actions'); },
        hint: 'Tap an <b>ability</b>',
        body: 'Tap a move that targets an enemy creature to try targeting. A move aimed directly at the enemy player resolves without choosing a board card.',
        skipIf: function () { return !actingCard(); },
        until: function () { return battleTargeting() || !actingCard() || phase() !== 'BATTLE'; } },

      { id: 'target', hint: 'Pick a <b>target</b>', title: 'Pick your victim',
        target: function () { return firstOf(['#enemyGrid .board-cell.targetable', '#enemyGrid']); },
        highlight: ['#enemyGrid .board-cell.targetable', '#playerGrid .board-cell.targetable'],
        body: 'The <b>highlighted cells</b> are valid targets for your chosen ability. Tap one to select it. A single-target move hits that creature; a row move asks you to select and confirm a row. Read the arrows before confirming.',
        skipIf: function () { return !visible('#enemyGrid .board-cell.targetable'); },
        until: function () { return !visible('#enemyGrid .board-cell.targetable'); } },

      // Opponent Burn first: ring the enemy card wearing the flame, wait for the
      // card view, then the chip / All Effects beats open the Fire element tag
      // and the full burn sheet. Damage and kill come after that chapter so the
      // drawer is not covering the board tips. `status` keeps its id for parity
      // with the older badge chapter — first-stack is the Burn-specific opener.
      { id: 'first-stack', hint: 'Tap the <b>opponent</b> card', title: 'Your first effect stack',
        target: firstStackTarget, highlight: firstStackHighlight,
        body: firstStackCopy,
        skipIf: function () { return !firstStackTarget(); },
        until: function () { return cardViewOpen() || !firstStackTarget(); } },

      { id: 'status', hint: 'Tap the card wearing a <b>badge</b>', title: 'Little icons, big deal',
        target: badgeSelector, highlight: badgeHighlight,
        body: 'Fire leaves them <b>Burning</b>, Ice leaves them <b>Chilled</b>, and shields and boosts ride along the same way. They all show up as <b>badges</b> on the card. <b>Tap the opponent card</b> wearing Burn if its card view is not open yet.',
        // Already opened from first-stack — do not ask again. Escape if the
        // badge expired so a wait cannot hold the match hostage.
        skipIf: function () { return cardViewOpen() || !visible('.sb-badge'); },
        until: function () { return cardViewOpen() || !visible('.sb-badge'); } },

      // The chip lesson exists twice on purpose, because the two layouts offer
      // different controls: the phone's chips are BUTTONS that open the
      // affliction sheet, while the desktop panel renders plain spans and only
      // its reference button is clickable. One step with a layout branch cannot
      // express that — the coach decides "does this step wait?" from whether
      // `until` exists at all, so a single step either strands the desktop
      // player on a tap they cannot make or, as first written, satisfied its own
      // wait on arrival and skipped the lesson there entirely. Two steps with
      // complementary skipIf let the layout on screen pick one, which is exactly
      // what skipIf-evaluated-once is good for.
      { id: 'badge-chip', hint: 'Tap the <b>Burn</b> tag', title: 'The Burn tag',
        // Ring the chip itself. The card view also carries the card's stats and
        // its whole move list, so spotlighting the panel points at everything.
        target: function () { return chipButton() || allEffectsSelector(); },
        highlight: function () { return [chipButton() || allEffectsSelector()]; },
        avoid: '.trainer-ability-close',
        body: 'That chip is the <b>Burn tag</b>. <b>Tap it</b> — the sheet names Burn, shows the <b>Fire</b> element tag, and spells out the stacks: flat damage per badge at their next Setup, then clear.',
        skipIf: function () { return !chipButton(); },
        until: function () { return effectKeyOpen() || !cardViewOpen(); } },

      { id: 'badge-chip-read', title: 'The Burn tag',
        target: function () { return previewChipSelector() || allEffectsSelector(); },
        highlight: function () { return [previewChipSelector() || allEffectsSelector()]; },
        body: 'That chip is the <b>Burn tag</b> — name and stack count. Open <b>All Effects</b> next for the Fire element tag and the full burn rules.',
        skipIf: function () { return !!chipButton() || !previewChipSelector(); } },

      { id: 'badge-all', hint: 'Tap <b>All Effects</b>', title: 'Every badge in one list',
        target: allEffectsSelector,
        highlight: function () { return [allEffectsSelector()]; },
        avoid: '.trainer-ability-close',
        body: '<b>All Effects</b> opens the full reference — Burn under Fire, Chill under Ice, every buff and affliction. It is here mid-fight for any badge on any card, yours or theirs.',
        skipIf: function () { return !cardViewOpen() && !effectKeyOpen(); },
        until: function () { return allEffectsOpen() || (!cardViewOpen() && !effectKeyOpen()); } },

      { id: 'badge-close', hint: 'Tap <b>Close</b>', title: 'Always one tap away',
        target: function () { return firstOf(['#effectKeyOverlay .trainer-ability-close', '#boardArea']); },
        avoid: '.trainer-ability-close',
        body: 'Nothing here is hidden from you — the list is one tap away whenever you want it. Close it and let us finish the round.',
        skipIf: function () { return !visible('#effectKeyOverlay:not(.hidden)'); },
        until: function () { return !visible('#effectKeyOverlay:not(.hidden)'); } },

      { id: 'damage', title: 'Where damage comes from', target: '#boardArea',
        body: 'Every point of it comes from <b>abilities</b> — there is no attack stat. Hit an element you beat and you get <b>+1</b> for free.' },

      { id: 'kill', title: 'Knocking one out hurts them', target: '#enemyGrid',
        body: 'Drop a Siegeling and its owner takes <b>Siege Damage</b> straight to the face — more the rarer it was. You can win through their board.' },

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
        nodim: true,
        body: function () {
          var c = costedCard();
          var named = c
            ? '<b>' + esc(c.name) + '</b> wants <b>' + c.costAmount + ' ' + esc(String(c.costElement).toLowerCase()) + '</b>. '
            : '';
          return 'Compare your <b>available energy at the top</b> with the marked <b>cost</b>. ' + named +
            'Your starters are free, but the heavier Siegelings — <b>evolutions especially</b> — ask for energy of their element.';
        },
        skipIf: function () { return !costedCard() && !visible('#playerHand .card-corner-cost'); } },

      { id: 't2-pick', title: 'Bring a friend', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        // Marked AND locked. The placement step after this one scores cells for
        // whichever Siegeling is selected, and every lesson downstream reads a
        // board built from this choice — so a player who taps the card next to
        // the named one does not lose a beat, they derail the chapter.
        recommend: partnerTarget,
        lock: HAND_CARDS,
        hint: function () {
          var mate = partnerCard();
          return mate ? 'Tap <b>' + esc(mate.name) + '</b>' : 'Tap a <b>Siegeling</b>';
        },
        body: function () {
          var pair = baseOfEvolutionInHand();
          var mate = partnerCard();
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
        // The spotlight stays on every legal cell — the placement is still the
        // player's to make — but the one that actually connects is marked.
        target: linkCellOrLegal,
        recommend: linkCell,
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
        // Skipped outright once a matching link is already standing. The step
        // before this one has the player place beside their opener, and with a
        // mono-element opening hand that placement IS the same-element link —
        // so the coach was asking for a connection the board already had, and
        // the hint sat there through a link it could see.
        skipIf: function () {
          return turn() < 2 || mine() < 2 || sameElementLinkCount() > 0;
        },
        until: function () {
          // Ask the board, not the energy pool. The pool moves for sockets and
          // abilities too, and a turn-one socket has already banked some, so an
          // energy test either fired early or waited on the wrong thing.
          if (linkBaseline == null) linkBaseline = sameElementLinkCount();
          return sameElementLinkCount() > linkBaseline || phase() !== 'SETUP';
        } },

      // Evolving is the one move the coach used to describe and then leave the
      // player to find: a single step ringing the whole hand, with no wait, so
      // the script walked on to "End Turn" whether or not anything evolved.
      // It is now the same taught-then-guided shape as the placement lesson —
      // the rule, then "tap this card", then "tap that cell" — because it is
      // a TWO-tap move on a board where the only legal cell is already
      // occupied, which reads as illegal until you have done it once.
      { id: 't2-evolve', hint: 'Play an evolution onto its base', title: 'Grow one up',
        target: function () { return handCardTarget(evolutionInHand()) || '#playerHand'; },
        highlight: function () {
          var sel = handCardTarget(evolutionInHand());
          return sel ? [sel, '#playerHand', '#handTray'] : ['#playerHand', '#handTray'];
        },
        // Locked here too, not just on the pick that follows. This step names
        // the evolution and lights the whole hand behind it, so it was the one
        // place the player could still pick the wrong card — and the two steps
        // after it are written entirely around the evolution going down.
        recommend: function () { return handCardTarget(evolutionInHand()); },
        lock: function () { return handCardTarget(evolutionInHand()) ? HAND_CARDS : null; },
        body: function () {
          var evo = evolutionInHand();
          var base = evolutionBaseName();
          var named = evo ? 'Your opener fought last round and this link is paying — so <b>' + esc(evo.name) +
            '</b> can go down on top of ' + (base ? '<b>' + esc(base) + '</b>' : 'it') + ' right now. ' : '';
          return named + 'Two things before a Siegeling can <b>evolve</b>: it has to have <b>survived a full battle phase</b> in its current form, and you need the evolution\'s own <b>energy</b> on tap. Play the bigger card straight onto it.';
        },
        skipIf: function () {
          if (turn() < 2) return true;
          return !evolutionInHand();
        } },

      { id: 't2-evolve-pick', title: 'Pick the evolution up',
        hint: function () {
          var evo = evolutionInHand();
          return evo ? 'Tap <b>' + esc(evo.name) + '</b> in your hand' : 'Tap the evolution in your hand';
        },
        target: function () { return handCardTarget(evolutionInHand()) || '#playerHand'; },
        highlight: function () {
          var sel = handCardTarget(evolutionInHand());
          return sel ? [sel, '#playerHand', '#handTray'] : ['#playerHand', '#handTray'];
        },
        // Marked AND locked, for the same reason as the two pick steps. The
        // lesson is "an evolution lands ON TOP OF its base", and it can only be
        // shown with the evolution in hand: picking any other card lights a set
        // of empty cells instead and demonstrates the opposite. Gated on the
        // card being findable, because the target falls back to the whole hand
        // and locking every card against that fallback would leave nothing to
        // tap.
        recommend: function () { return handCardTarget(evolutionInHand()); },
        lock: function () { return handCardTarget(evolutionInHand()) ? HAND_CARDS : null; },
        body: function () {
          var evo = evolutionInHand();
          return 'Tap ' + (evo ? '<b>' + esc(evo.name) + '</b>' : 'the evolution') +
            ' to pick it up. The board will light the <b>one</b> cell it can go on — and that cell already has a Siegeling standing in it. That is the point: an evolution lands <b>on top of</b> its base, it does not take an empty square.';
        },
        // Only runs when the move is genuinely available — the card in hand AND
        // a base it may legally land on. Anything else and this pair is skipped
        // rather than asking for a tap the game would reject.
        skipIf: function () {
          return turn() < 2 || !evolutionReady() || selectedIsEvolution();
        },
        until: function () {
          return selectedIsEvolution() || !evolutionInHand() || phase() !== 'SETUP';
        } },

      { id: 't2-evolve-place', title: 'Drop it on the base',
        hint: function () {
          var base = evolutionBaseName();
          return base ? 'Tap <b>' + esc(base) + '</b> on your board' : 'Tap the lit cell on your board';
        },
        target: evolutionBaseTarget,
        highlight: function () {
          var sel = evolutionBaseTarget();
          return sel === '#playerGrid' ? ['#playerGrid'] : [sel, '#playerGrid .board-cell.legal'];
        },
        body: function () {
          var evo = evolutionInHand();
          var base = evolutionBaseName();
          return 'Now tap ' + (base ? '<b>' + esc(base) + '</b>' : 'the lit cell') + '. ' +
            (evo ? '<b>' + esc(evo.name) + '</b>' : 'The evolution') +
            ' takes its place — same square, same links, bigger Siegeling — and it keeps every notch it is drawn with, so check what your link does after it grows.';
        },
        skipIf: function () {
          return turn() < 2 || !evolutionInHand() || !evolutionReady();
        },
        until: function () {
          // Placed (the card left the hand), or Setup ended — the lesson never
          // holds the match hostage over a move the player chose to skip.
          return !evolutionInHand() || phase() !== 'SETUP';
        } },

      { id: 't2-end', hint: 'Tap <b>End Turn</b>', title: 'Send it', target: actionBtn,
        body: 'Linked and evolved — that is round two spent. <b>End Turn</b> and watch it fight.',
        skipIf: function () { return turn() < 2 || phase() === 'BATTLE' || seen.sawBattle2; },
        until: function () { return !myTurn() || phase() === 'BATTLE' || seen.sawBattle2; } },

      // Round TWO's battle, not round one's. This lived in the round-one chapter
      // and was skipped permanently the moment the coach arrived there: only
      // Sundile is down in round one, so actingRowAbility() was null and skipIf
      // fires once, on arrival. Pylook is placed in round two, so the lesson
      // belongs to that battle — and it is GATED rather than skipped, so it waits
      // for a row attacker to actually take the floor instead of giving up.
      // The escape used to be `seen.sawBattle2`, which is set the instant round
      // two's BATTLE phase opens — the exact moment the coach arrives here,
      // because `t2-end` releases on the same signal. So the gate opened on
      // arrival every time, before any Siegeling had taken the floor, and
      // `row-attack`'s skipIf then found nobody acting and dropped the lesson
      // for good. A gate's escape has to be strictly LATER than the moment it
      // is reached, or it is not a gate: it now waits out the whole battle.
      { id: 'gate-row', skipTo: 't2-battle',
        hint: 'Watch Pylook take its swing',
        gate: function () { return !!actingRowAbility() || battleTwoDone(); } },

      { id: 'row-attack', title: 'One swing, a whole row',
        target: rowMoveButton,
        highlight: function () {
          var button = rowMoveButton();
          return button ? [button] : [];
        },
        body: function () {
          var row = actingRowAbility();
          var single = singleTargetExample();
          var actor = actingCard();
          var lead = actor && actor.name
            ? '<b>' + esc(actor.name) + '</b> does not pick one card — '
            : 'This one does not pick one card — ';
          var named = row && row.name
            ? '<b>' + esc(row.name) + '</b> hits <b>every Siegeling in the enemy row</b> you choose.'
            : 'its attack hits <b>every Siegeling in the enemy row</b> you choose.';
          var contrast = single && single.card && single.card.name && single.ability && single.ability.name
            ? ' <b>' + esc(single.card.name) + '</b>\'s <b>' + esc(single.ability.name) +
              '</b> spends its whole hit on one target; this spreads the same swing across the row.'
            : ' A single-target move spends its whole hit on one card; this spreads it across the row.';
          return lead + named + contrast +
            ' Fire burns what it touches, so <b>every card in that row</b> walks away <b>Burning</b>, not just one.' +
            ' <b>Tap it</b> and the board will ask you which row.';
        },
        // Marked and locked to the row move. The battle phase is not a
        // cutscene — the player picks the move — and the whole lesson is about
        // this move rather than the single-target one sitting beside it.
        recommend: rowMoveButton,
        lock: function () { return rowMoveButton() ? MOVE_BTNS : null; },
        hint: function () {
          var row = actingRowAbility();
          return row && row.name ? 'Tap <b>' + esc(row.name) + '</b>' : 'Tap the row move';
        },
        skipIf: function () { return !actingRowAbility(); },
        // Released by the move being chosen, or by the actor losing the floor —
        // never held past the moment it is about.
        until: function () { return battleTargeting() || !actingRowAbility() || battleTwoDone(); } },

      // The payoff. A row move is worth picking when the row is full, so the
      // coach marks the row actually holding the most enemies and says how many
      // the swing will catch. Computed from the board, never a fixed "middle" —
      // that would be wrong the moment the enemy stands somewhere else.
      { id: 'row-target', title: 'Pick the fullest row',
        target: function () { return fullestRowTarget() || '#enemyGrid'; },
        highlight: function () {
          var best = fullestEnemyRow();
          return best
            ? ['#enemyGrid .board-cell.targetable[data-row="' + best.row + '"]']
            : ['#enemyGrid .board-cell.targetable', '#enemyGrid'];
        },
        recommend: fullestRowTarget,
        hint: 'Tap a card in the <b>marked row</b>',
        body: function () {
          var best = fullestEnemyRow();
          var row = actingRowAbility();
          var named = row && row.name ? '<b>' + esc(row.name) + '</b>' : 'This move';
          if (!best) {
            return named + ' needs a row. <b>Tap any highlighted card</b> and everything standing in ' +
              'that row takes the hit.';
          }
          var n = best.count;
          return 'Now choose <b>where</b>. The marked row is holding <b>' + n + '</b> ' +
            (n === 1 ? 'Siegeling' : 'Siegelings') + ', so ' + named + ' lands on ' +
            (n === 1 ? 'it' : 'all ' + n + ' of them') + ' for the same cost — that is the whole point of a ' +
            'row move. <b>Tap any card in the marked row</b>.';
        },
        skipIf: function () { return !battleTargeting(); },
        // Picking the row does not fire the move — it arms the Confirm prompt,
        // which the next step teaches. Releasing on `!battleTargeting()` alone
        // left this tip up over that prompt, still asking for a row the player
        // had already marked.
        until: function () { return rowPicked() || !battleTargeting() || battleTwoDone(); } },

      // The second half of a row move: the swing is not spent until it is
      // confirmed, so the player can compare rows before committing.
      { id: 'row-confirm', title: 'Confirm the swing',
        target: function () { return rowConfirmButton() || firstOf(['#battleRowConfirmOverlay', '#enemyGrid']); },
        highlight: function () {
          var btn = rowConfirmButton();
          var best = fullestEnemyRow();
          var marks = best ? ['#enemyGrid .board-cell.targetable[data-row="' + best.row + '"]'] : [];
          return btn ? [btn].concat(marks) : marks;
        },
        recommend: rowConfirmButton,
        lock: function () { return rowConfirmButton() ? ROW_CONFIRM_BTNS : null; },
        hint: 'Tap <b>Confirm</b>',
        body: function () {
          var row = actingRowAbility();
          var named = row && row.name ? '<b>' + esc(row.name) + '</b>' : 'The move';
          var label = rowConfirmText();
          var quoted = label ? ' The button spells out exactly who it catches — <b>' + esc(label) + '</b>.' : '';
          return 'Marking a row does not swing yet. The arrows show every card ' + named +
            ' is about to hit, so you can check the row before you spend the energy.' + quoted +
            ' <b>Confirm</b> to send it, or <b>Change Row</b> to look somewhere else.';
        },
        skipIf: function () { return !rowPicked(); },
        until: function () { return !rowPicked() || !battleTargeting() || battleTwoDone(); } },

      // The row swing spread Burn across a row; the next Fire attacker can cash
      // that in. Gated rather than skipped for the same reason `gate-row` is:
      // whoever acts next has not taken the floor yet when the coach arrives
      // here, so a skipIf would drop the lesson before it could ever be true.
      { id: 'gate-burn', skipTo: 't2-battle',
        hint: 'Watch for your next Fire attacker',
        gate: function () { return !!burnPlan() || battleTwoDone(); } },

      { id: 'burn-kill', title: 'Let the burn finish it',
        target: function () {
          return burnMoveButton()
            || firstOf(['#battleActionPanel', '#desktopBattleActionPanel', '#boardArea']);
        },
        highlight: function () {
          var btn = burnMoveButton();
          var cell = burnTargetCell();
          var marks = [];
          if (btn) marks.push(btn);
          if (cell) marks.push(cell);
          return marks.length ? marks : [firstOf(['#battleActionPanel', '#desktopBattleActionPanel', '#boardArea'])];
        },
        recommend: burnMoveButton,
        lock: function () { return burnMoveButton() ? MOVE_BTNS : null; },
        hint: function () {
          var plan = burnPlan();
          return plan && plan.abilityName ? 'Tap <b>' + esc(plan.abilityName) + '</b>' : 'Tap the bigger Fire move';
        },
        body: function () {
          var plan = burnPlan();
          if (!plan) return 'Damage is not the whole number — <b>weakness</b> adds to the hit, and <b>Burn</b> ticks after it.';
          var actor = plan.attacker ? '<b>' + esc(plan.attacker) + '</b>' : 'This one';
          var move = plan.abilityName ? '<b>' + esc(plan.abilityName) + '</b>' : 'the bigger move';
          return actor + ' picks <b>one</b> card, so pick the one the numbers already finish. ' +
            burnMathSentence(plan) + ' Tap ' + move + '.';
        },
        skipIf: function () { return !burnPlan(); },
        // Released by the move being chosen, or by the plan going away — the
        // board moved on, the target died to something else, the battle ended.
        until: function () { return battleTargeting() || !burnPlan() || battleTwoDone(); } },

      { id: 'burn-target', title: 'Spend it on the right card',
        target: function () { return burnTargetCell() || '#enemyGrid'; },
        highlight: function () {
          var cell = burnTargetCell();
          return cell ? [cell] : ['#enemyGrid .board-cell.targetable', '#enemyGrid'];
        },
        recommend: burnTargetCell,
        hint: function () {
          var plan = burnPlan();
          return plan && plan.target ? 'Tap <b>' + esc(plan.target) + '</b>' : 'Tap the marked card';
        },
        body: function () {
          var plan = burnPlan();
          if (!plan) return 'Choose the card the hit and the burn finish together.';
          var target = plan.target ? '<b>' + esc(plan.target) + '</b>' : 'the marked card';
          return 'Now spend it on ' + target + '. Anything else soaks the same damage and lives; ' +
            target + ' is the one that <b>' + plan.hit + '</b> plus <b>' + plan.burn + '</b> burn adds up to kill. ' +
            'That is a whole enemy removed for one move — <b>tap it</b>.';
        },
        skipIf: function () { return !battleTargeting() || !burnPlan(); },
        until: function () { return !battleTargeting() || !burnPlan() || battleTwoDone(); } },


      // Same defect as the gate above: `seen.sawBattle2` is true from the first
      // frame of the battle this step is asking the player to watch, so it
      // resolved immediately and the tip flashed past the fight it named.
      // "Now watch" alone was misleading: the rest of the battle still asks the
      // player to pick a move and a target for every Siegeling they own.
      { id: 't2-battle', title: 'Play the round out', target: '#boardArea',
        hint: 'Choose each Siegeling\'s move',
        body: 'Same rhythm, bigger board. Every Siegeling you own gets its turn in speed order — <b>pick a move</b> for each one as it comes up, and watch what your link and your evolution bought you.',
        skipIf: function () { return !seen.sawBattle; },
        until: function () { return battleTwoDone(); } },

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
        // Same redundancy guard as the same-element lesson: the placement step
        // before this one often banks the combo on its own, and asking for one
        // already sitting in the pool reads as the coach not watching.
        skipIf: function () { return turn() < 3 || !seen.sawBattle2 || comboCount() > 0; },
        until: function () { return comboCount() > 0 || phase() !== 'SETUP'; } },

      { id: 't3-energy', hint: 'Tap <b>◈</b>', title: 'Look what you made', target: '#btnEnergyDetail',
        body: 'Those coloured dots are yours to spend. Tap <b>◈</b> to see where they came from.',
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; },
        until: function () { return seen.hadLinkEnergy || comboCount() > 0 || phase() === 'BATTLE'; } },

      { id: 't3-combo', title: 'Mix it up', target: '#btnEnergyDetail',
        body: 'Mixed links bank a split-colour <b>combo</b>. Your heaviest cards only take these — worth building for.',
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; } },

      { id: 't3-strategy', hint: 'Tap <b>Ashfall</b> to inspect it', title: 'Review Ashfall before casting',
        target: ashfallTarget, recommend: ashfallTarget,
        lock: function () { return ashfallTarget() ? HAND_CARDS : null; },
        body: '<b>Tap Ashfall</b> to open its card preview. Check the Strategy’s cost and effect before choosing what to play. You can inspect it even when you cannot afford it.',
        skipIf: function () { return turn() < 3 || !ashfallTarget(); },
        until: function () { return ashfallPreviewOpen() || !ashfallTarget(); } },
      { id: 'ashfall-art', title: 'Card preview',
        target: function () { return previewField('.selected-preview-card', '.desktop-preview-card'); },
        body: 'This is Ashfall’s card. Its name and cost symbol identify the Strategy you are reviewing.',
        skipIf: function () { return !ashfallPreviewOpen(); } },
      { id: 'ashfall-cost', title: 'Three Fire, not three total energy',
        target: function () { return previewField('.selected-copy-cost', '.desktop-preview-stats'); },
        body: '<b>Play Cost: 3 Fire</b> means three Fire energy. Earth energy and combo points do not replace Fire. The availability message tells you what is missing.',
        skipIf: function () { return !ashfallPreviewOpen(); } },
      { id: 'ashfall-effect', title: 'Read the effect',
        target: function () { return previewField('.selected-copy-detail', '.desktop-preview-description'); },
        body: 'Ashfall <b>destroys every enemy Siegeling</b>. It is a tutorial Strategy for the upcoming claim lesson. Reviewing it does not cast it or spend energy.',
        skipIf: function () { return !ashfallPreviewOpen(); } },
      { id: 'ashfall-pages', title: 'Preview pages',
        target: function () { return previewField('.selected-preview-dots', '.desktop-preview-card'); },
        body: 'On phones, swipe or tap the page dots to switch between the card summary and moves. Review the effect and cost, then tap Got it to continue. On desktop, the inspector keeps the summary alongside the board.',
        skipIf: function () { return !ashfallPreviewOpen(); } },

      { id: 't3-deception', title: 'Check their energy', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: 'Here is the sneaky one: a <b>Deception</b> requires a matching amount in the <b>opponent’s energy pool</b>. Play one if you have it.',
        skipIf: function () { return turn() < 3 || !handHas('TRAP'); } },

      // Claiming used to be taught in a vacuum: "cash in a survivor" with nothing
      // to spend it on, which asked the student to bin their best Siegeling for
      // no reason. The claim now BUYS something — it is the last Fire needed for
      // Ashfall — so the cost reads as a trade instead of a sacrifice.
      { id: 't3-claim', hint: 'Claim your survivor', title: 'Trade a body for the win',
        target: function () { return firstOf(['#playerGrid .board-cell.claimable', '#playerGrid']); },
        highlight: ['#playerGrid .board-cell.claimable'],
        recommend: function () { return firstOf(['#playerGrid .board-cell.claimable', '']) || null; },
        body: function () {
          var f = fireEnergy();
          var wipe = handCardNamed('tutorial_ashfall');
          var have = f > 0 ? 'You are on <b>' + f + ' Fire</b>. ' : '';
          return have + 'Claiming a survivor cashes it in for <b>+1 energy of its element</b> — '
            + 'you lose the body, and that is the point: it is the last Fire you need for '
            + (wipe ? '<b>' + esc(wipe.name) + '</b>' : 'the Strategy in your hand') + '.';
        },
        skipIf: function () { return turn() < 3 || !visible('#playerGrid .board-cell.claimable'); },
        until: function () { return fireEnergy() >= 3 || phase() !== 'SETUP'; } },

      { id: 't3-wipe', hint: 'Cast it', title: 'Spend it all at once',
        target: '#playerHand', highlight: ['#playerHand', '#handTray'],
        body: function () {
          var wipe = handCardNamed('tutorial_ashfall');
          return (wipe ? '<b>' + esc(wipe.name) + '</b>' : 'That Strategy')
            + ' costs every Fire you just scraped together and <b>destroys their whole board</b>. '
            + 'Each one that drops pays you <b>Siege Damage</b> on the way out.';
        },
        skipIf: function () { return turn() < 3 || !handCardNamed('tutorial_ashfall'); },
        until: function () { return theirs() === 0 || phase() !== 'SETUP'; } },

      // One act left after the wipe, and a card worth spending it on. This is
      // also the first time the budget MATTERS, so the next step reads it back.
      { id: 't3-summon', hint: 'Place your last Siegeling', title: 'One act left',
        target: function () { return firstOf(['#playerHand', '#handTray']); },
        highlight: ['#playerHand', '#handTray', '#playerGrid .board-cell.legal'],
        body: function () {
          var next = hand().filter(function (c) {
            return c && c.type === 'SIEGLING' && !c.evolvesFromId;
          })[0];
          return 'Their side is empty and you still have an action. '
            + (next ? 'Put <b>' + esc(next.name) + '</b> down' : 'Put another Siegeling down')
            + ' — an empty board is the safest time to grow yours.';
        },
        skipIf: function () { return turn() < 3 || actsRemaining() <= 0; },
        until: function () { return actsRemaining() <= 0 || phase() !== 'SETUP'; } },

      { id: 't3-acts', title: 'That is the whole budget', target: actionBtn,
        highlight: function () { return [actionBtn()]; },
        body: 'Every Setup gives you <b>one placement</b>, plus one more for each unit of '
          + 'pooled energy. You just spent all of it — the <b>action counter</b> is where you '
          + 'check what is left before you commit.' },

      // The knight has been READY since round one and never been used; with the
      // board cleared there is nothing to lose by spending it.
      { id: 't3-knight', hint: 'Tap <b>Knight</b>', title: 'Your Knight has been waiting',
        target: '#btnTrainerAbility', highlight: ['#btnTrainerAbility'],
        body: function () {
          var k = knightName();
          return (k ? '<b>' + esc(k) + '</b> has' : 'Your SiegeKnight has')
            + ' been <b>READY</b> since round one. It costs no action — spend it now.';
        },
        skipIf: function () { return turn() < 3 || seen.knightSpent; },
        until: function () { return seen.knightSpent || seen.knightOpened || phase() !== 'SETUP'; } },

      { id: 't3-end', hint: 'Tap <b>End Turn</b>', title: 'Send it', target: actionBtn,
        body: 'Board cleared, board rebuilt, Knight spent. <b>End Turn</b>.',
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
      { id: 'adv-welcome', kicker: 'Advanced', title: 'A prepared five-versus-five battle',
        target: '#boardArea',
        body: 'Both teams already have <b>five Siegelings</b>. You start in <b>Setup</b> with Fire and Earth energy, and the opponent has Ice energy. No opening placement or mulligan is needed.' },
      { id: 'adv-enemy-energy', title: 'Deceptions check enemy energy',
        target: function () { return firstOf(['#mobileEnemyEnergyCount', '#enemyEnergy']); },
        body: 'Your <b>Shatter Seal</b> requires the opponent to have <b>3 Ice energy</b>. Read their pool here, rather than your own Fire or Earth pool.' },
      { id: 'adv-cast-deception', title: 'Cast Shatter Seal',
        target: function () { return handCardTarget(hand().find(function(c) { return c.id === 'trap13'; })); },
        body: 'Tap <b>Shatter Seal</b>, review its enemy-energy requirement, and cast it at a highlighted enemy. The prepared Ice pool makes it available.',
        skipIf: function () { return !hand().some(function(c) { return c.id === 'trap13'; }); },
        until: function () { return !hand().some(function(c) { return c.id === 'trap13'; }) || phase() !== 'SETUP'; } },
      { id: 'adv-start-battle', title: 'Open the battle queue', target: actionBtn,
        body: 'Finish Setup with <b>End Turn</b>. After the opponent’s Setup, the battle action bar shows the acting creature and its available moves.',
        until: function () { return phase() === 'BATTLE' || seen.ended; } },
      { id: 'adv-wait-action', hint: 'Watch for your next acting creature', skipTo: 'adv-hud',
        gate: function () { return !!actingCard() || seen.ended; } },
      { id: 'adv-action-preview', title: 'Battle action preview',
        target: function () { return firstBattleField('.battle-queue-topbar'); },
        body: 'The header shows the active creature, current Health, Speed and badges. This is the creature choosing an action now.' },
      { id: 'adv-action-moves', title: 'Choose a battle ability',
        target: function () { return firstBattleField('.battle-queue-actions'); },
        body: 'Each move shows its effect, energy cost and damage preview. Targeted moves light valid cells; direct-player moves resolve without a board target. Pass skips this creature and names the next actor.' },

      { id: 'adv-shield', title: 'Read the badges',
        target: function () { return badgeCellSelector() || badgeSelector(); },
        body: 'Both lead creatures start with <b>3 Shield</b>, which absorbs damage before Health. Tap a badge to read its effect. New afflictions and boosts appear as badges too.' },

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

      { id: 'adv-hud-home', title: 'Back to Home', target: '.action-bar-aux a[aria-label="Back to Home"]',
        body: 'The back arrow returns to Home. Stay here while practicing this battle.',
        skipIf: function () { return !visible('.action-bar-aux a[aria-label="Back to Home"]'); } },
      { id: 'adv-hud-menu', title: 'Site menu', target: '#playHubMenuFlyout summary',
        body: 'The site menu opens navigation to your Keep, cards, decks and other pages.',
        skipIf: function () { return !visible('#playHubMenuFlyout summary'); } },

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

  function start() { begin(buildSteps, startAdvanced); }

  /** Boot straight into the advanced script on a FRESH match. The end screen
   *  deals a new tutorial game before calling this, because the advanced lessons
   *  (shields, afflictions, the HUD in use) need a live board to happen on —
   *  swapping the script over a finished match left it a slideshow. */
  function startAdvancedFromFreshMatch() { begin(buildAdvancedSteps, null); }

  function begin(stepsFn, altHandler) {
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
      steps: stepsFn(),
      playAreas: PLAY_AREAS,
      onFinale: claimReward,
      onAlt: altHandler,
      onStop: function () {
        ACTIVE = false;
        if (watchRaf) window.cancelAnimationFrame(watchRaf);
        watchRaf = 0;
      },
      bodyClass: 'arena-tutorial'
    });
  }

  function startAdvanced() {
    if (window.startAdvancedTutorialMatch) window.startAdvancedTutorialMatch();
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
    startAdvanced: startAdvancedFromFreshMatch,
    stop: stop,
    active: function () { return ACTIVE; },
    shouldPreviewCard: function (card) {
      var step = document.querySelector('.tut-layer:not(.hidden) .tut-card');
      var id = step && step.getAttribute('data-step-id');
      return ACTIVE && card && card.id === 'tutorial_ashfall' &&
        (id === 't3-strategy' || (id && id.indexOf('ashfall-') === 0));
    }
  };
})();
