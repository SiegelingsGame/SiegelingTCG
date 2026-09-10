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

  /** Phone card-preview drawer is open — tips that sit on the board hide under it. */
  function selectedDrawerOpen() {
    var n = null;
    try { n = document.getElementById('drawerSelected'); } catch (e) { return false; }
    return !!n && n.classList && n.classList.contains('visible')
      && !!n.getClientRects && n.getClientRects().length > 0;
  }

  /** The reference list, as opposed to the single-affliction sheet. The overlay
   *  is the same element for both, so read the kicker it swaps. */
  function allEffectsOpen() {
    if (!effectKeyOpen()) return false;
    var k = null;
    try { k = document.getElementById('effectKeyKicker'); } catch (e) { return false; }
    return !!k && /reference/i.test(k.textContent || '');
  }

  /** True while the single Burn (or other) affliction sheet is open — not the full reference. */
  function burnSheetOpen() {
    return effectKeyOpen() && !allEffectsOpen();
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
      'The <b>opponent card</b> gained Burn from your Fire hit. The badge number shows its stacks. Each stack deals damage at the start of its owner’s next Setup. ' +
      '<b>Tap the card</b>, then its Burn tag, to read the effect.';
  }

  /** Battle-panel badge copy — separate from the opponent-Burn lesson above. */
  function actingBadgeCopy() {
    var selector = firstBattleField('.sb-badge');
    var badge = selector && document.querySelector(selector);
    var detail = badge && badge.getAttribute('title');
    return (detail ? '<b>' + esc(detail) + '</b><br>' : '') +
      'This badge shows an effect on the Siegeling. The number is its <b>stack count</b>, or the remaining amount for Shield. ' +
      'Applying an effect again can add more stacks.';
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

  /**
   * Matchup badges (Weak / Strong) appear on enemy cards while aiming a damage
   * ability. Prefer the Weak badge — that is what the Fire opener shows on the
   * Ice Dummy — then any Strong, then any overlay. Selector-based so the coach
   * can re-resolve every frame the same way badgeSelector does.
   */
  function matchupBadgeSelector() {
    return firstOf([
      '.matchup-badge-overlay[data-kind="WEAK"]',
      '.matchup-badge-overlay[data-kind="STRONG"]',
      '.matchup-badge-overlay'
    ]);
  }

  /** Board cell wearing a live matchup badge, for a tight ring on the card. */
  function matchupCellSelector() {
    var badge = null;
    try {
      badge = document.querySelector('.matchup-badge-overlay[data-kind="WEAK"]')
        || document.querySelector('.matchup-badge-overlay[data-kind="STRONG"]')
        || document.querySelector('.matchup-badge-overlay');
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

  function matchupHighlight() {
    var cell = matchupCellSelector();
    if (cell) return [cell];
    var badge = matchupBadgeSelector();
    return badge ? [badge] : ['#enemyGrid'];
  }

  function hasMatchupBadge() {
    return visible('.matchup-badge-overlay');
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
    var target = plan.target ? '<b>' + esc(plan.target) + '</b>' : 'The target';
    var weak = plan.weak ? ' including <b>1 bonus damage</b> from Fire weakness' : '';
    return target + ' has <b>' + plan.hp + ' HP</b>. The hit deals <b>' + plan.hit + ' damage</b>' + weak +
      ', leaving <b>' + plan.left + ' HP</b>. <b>Burn</b> deals <b>' + plan.burn +
      ' damage</b> at the start of its owner’s next Setup, enough to knock it out.';
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
      { id: 'welcome', kicker: 'Tutorial match', title: 'Learn to play Arena',
        body: function () {
          var k = knightName();
          return 'Your SiegeKnight is ' + (k ? '<b>' + esc(k) + '</b>' : 'leading your team') +
            '. In this practice match against the Training Dummy, you will learn to place Siegelings, build energy and use abilities. Reduce the opponent’s <b>HP to zero</b> to win.';
        } },

      { id: 'mulligan',
        hint: function () {
          var n = swapCardName();
          return n ? 'Tap <b>' + esc(n) + '</b>, then <b>Redraw selected</b>' : 'Tap the marked card, then <b>Redraw selected</b>';
        },
        title: 'Redraw your opening hand',
        target: '#mulliganHandPreview .mulligan-card-slot[data-index="4"]',
        highlight: ['#mulliganHandPreview', '#mulliganActions'],
        body: function () {
          var n = swapCardName();
          return 'A <b>mulligan</b> lets you replace cards in your opening hand once before the first round. ' +
            'For this tutorial, tap ' + (n ? '<b>' + esc(n) + '</b>' : 'the marked card') +
            ', then <b>Redraw selected</b> to draw its replacement.';
        },
        skipIf: function () { return phase() !== 'MULLIGAN' && !revealingMulligan(); },
        // Hold through the reveal as well as the phase: the redraw ends MULLIGAN
        // server-side straight away, and letting the next tip open there put the
        // board lesson on screen while the cards were still turning over.
        until: function () { return phase() !== 'MULLIGAN' && !revealingMulligan(); } },

      { id: 'hud', title: 'The board', target: '#boardArea',
        body: 'Your <b>3×3 board</b> is below the opponent’s. The bars show each player’s <b>HP</b>, remaining deck and energy.' },

      { id: 'phases', kicker: 'The round', title: 'Draw → Setup → Battle', target: '#phaseBadge',
        body: 'Each round has three phases: <b>Draw</b> a card, <b>Setup</b> your board, then <b>Battle</b>. Siegelings act in Speed order, fastest first.' },

      { id: 'draw', hint: 'Tap <b>Draw</b>', title: 'Draw a card', target: '#btnDraw',
        body: 'Tap <b>Draw</b> to add one card to your hand.',
        skipIf: function () { return phase() !== 'DRAW'; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 'setup', title: 'Setup actions', target: '#phaseBadge',
        body: 'During <b>Setup</b>, you can place Siegelings, evolve them, cast cards and claim survivors. You get one Setup action plus one for each unit of energy in your pool.',
        until: function () { return phase() === 'SETUP' || phase() === 'BATTLE'; } },

      { id: 'pick', title: 'Choose your first Siegeling', target: openerTarget,
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
            return 'Choose a Siegeling with good <b>Health</b>, <b>Speed</b> and notches that can reach a socket. ' +
              (c ? 'Tap the marked <b>' + esc(c.name) + '</b>. ' : 'Tap a Siegeling in your hand. ') +
              'The board highlights where you can place it.';
          }
          return 'Start with <b>' + esc(pair.base.name) + '</b>. It can evolve into <b>' + esc(pair.evolution.name) +
            '</b> after surviving a Battle phase. Tap it to see where you can place it.';
        },
        until: function () { return selectedType() === 'SIEGLING' || mine() > 0; } },

      { id: 'place', hint: 'Place on the <b>gold</b> cell', title: 'Connect to a socket',
        target: recommendedCell,
        highlight: ['#playerGrid .board-cell.legal'],
        recommend: recommendedCell,
        body: 'The dots around the grid are <b>sockets</b>. A notch facing a socket generates energy. Tap the <b>gold cell</b> to place your Siegeling where it can connect.',
        until: function () { return mine() > 0; } },

      { id: 'knight', hint: 'Tap <b>Knight</b>', title: 'Your SiegeKnight', target: '#btnTrainerAbility',
        avoid: '.trainer-ability-close',
        body: function () {
          var k = knightName();
          return (k ? '<b>' + esc(k) + '</b>' : 'Your SiegeKnight') +
            ' has a <b>passive ability</b> that stays active and an <b>active ability</b> you can use once per match. Tap <b>Knight</b> to read both.';
        },
        until: function () { return seen.knightSpent || visible('#trainerAbilityOverlay') || seen.knightOpened; } },

      { id: 'endturn', hint: 'Tap <b>End Turn</b>', title: 'Finish Setup', target: actionBtn,
        body: 'Tap <b>End Turn</b> when you have finished Setup. Battle begins after both players finish.',
        until: function () { return !myTurn() || phase() === 'BATTLE'; } },

      { id: 'battle', title: 'Battle order', target: '#boardArea',
        body: 'Siegelings act in <b>Speed order</b>, fastest first. Fire has an elemental advantage against Ice, adding <b>1 damage</b> to the hit.',
        until: function () { return seen.sawBattle; } },

      { id: 'first-action-ready', skipTo: 'target',
        hint: 'Wait for your Siegeling to act',
        gate: function () { return !!actingCard() || phase() !== 'BATTLE'; } },

      { id: 'first-actor', title: 'The active Siegeling',
        target: function () { return firstBattleField('.battle-queue-card-title'); },
        body: 'This is the <b>Siegeling taking its turn</b>. It is marked <b>Acting</b> on the board, and its abilities appear below.',
        skipIf: function () { return !actingCard(); } },
      { id: 'first-health', title: 'Current health',
        target: function () { return firstBattleField('.card-stat-pill-hp'); },
        body: 'The heart shows this Siegeling’s <b>current Health</b>. Damage lowers Health. At zero, the Siegeling is knocked out.',
        skipIf: function () { return !actingCard(); } },
      { id: 'first-speed', title: 'Current speed',
        target: function () { return firstBattleField('.card-stat-pill-spd'); },
        body: 'The lightning symbol shows <b>Speed</b>, including any effects changing it. Higher Speed lets a Siegeling act earlier in battle.',
        skipIf: function () { return !actingCard(); } },
      { id: 'first-action-badges', title: 'Active effects',
        target: function () { return firstBattleField('.sb-badge'); },
        body: actingBadgeCopy,
        skipIf: function () { return !firstBattleField('.sb-badge'); } },
      { id: 'first-options', title: 'Available abilities',
        target: function () { return firstBattleField('.battle-queue-actions'); },
        body: 'Each ability shows its effect, target and energy cost. <b>Free</b> abilities use zero energy. The weakness preview includes any bonus damage.',
        skipIf: function () { return !actingCard(); } },
      { id: 'first-pass', title: 'Passing', target: '#btnBattlePass',
        body: '<b>Pass</b> skips this Siegeling’s action and moves to the next one. For this lesson, choose an ability.',
        skipIf: function () { return !visible('#btnBattlePass'); } },
      { id: 'first-next', title: 'The next Siegeling', target: '#btnBattlePassNext',
        body: 'The <b>Next</b> line shows which Siegeling acts after this one and who owns it.',
        skipIf: function () { return !visible('#btnBattlePassNext'); } },
      { id: 'first-choose', title: 'Choose an ability',
        target: function () { return firstBattleField('.battle-queue-actions'); },
        hint: 'Tap an <b>ability</b>',
        body: 'Tap an ability that targets an enemy Siegeling. The board will highlight valid targets. Abilities aimed at the opponent directly resolve when selected.',
        skipIf: function () { return !actingCard(); },
        until: function () { return battleTargeting() || !actingCard() || phase() !== 'BATTLE'; } },

      // Badges paint on a double-rAF after targeting opens, so a skipIf here
      // would drop the lesson before the overlay exists. Gate until a badge is
      // live (or targeting already ended — non-damage aims never show one).
      { id: 'gate-matchup', skipTo: 'target',
        hint: 'Watch for matchup badges on enemies',
        gate: function () { return hasMatchupBadge() || !battleTargeting(); } },

      { id: 'matchup', title: 'Weakness badges',
        target: function () { return matchupCellSelector() || matchupBadgeSelector() || '#enemyGrid'; },
        highlight: matchupHighlight,
        body: 'While you aim, <b>matchup badges</b> appear on enemy cards. A red <b>Weak</b> badge means your element beats theirs — the hit deals <b>+1 damage</b>. A gold <b>Strong</b> badge means their element beats yours, so the hit is resisted for <b>-1 damage</b>. No badge means the elements share no matchup and the hit deals flat damage. Read the badges to see who is weak or strong against this attack.',
        skipIf: function () { return !hasMatchupBadge(); } },

      { id: 'target', hint: 'Pick a <b>target</b>', title: 'Choose a target',
        target: function () { return firstOf(['#enemyGrid .board-cell.targetable', '#enemyGrid']); },
        highlight: ['#enemyGrid .board-cell.targetable', '#playerGrid .board-cell.targetable'],
        body: 'Tap a <b>highlighted cell</b> to choose a target. Prefer a card with a <b>Weak</b> badge when you can — that hit deals bonus damage. A row ability lets you select and confirm an entire row.',
        skipIf: function () { return !visible('#enemyGrid .board-cell.targetable'); },
        until: function () { return !visible('#enemyGrid .board-cell.targetable'); } },

      // Opponent Burn first: ring the enemy card wearing the flame, wait for the
      // card view, then the chip / All Effects beats open the Fire element tag
      // and the full burn sheet. Damage and kill come after that chapter so the
      // drawer is not covering the board tips. `status` keeps its id for parity
      // with the older badge chapter — first-stack is the Burn-specific opener.
      { id: 'first-stack', hint: 'Tap the <b>opponent</b> card', title: 'Burn stacks',
        target: firstStackTarget, highlight: firstStackHighlight,
        body: firstStackCopy,
        skipIf: function () { return !firstStackTarget(); },
        until: function () { return cardViewOpen() || !firstStackTarget(); } },

      { id: 'status', hint: 'Tap the card wearing a <b>badge</b>', title: 'Status badges',
        target: badgeSelector, highlight: badgeHighlight,
        body: '<b>Badges</b> show effects on a Siegeling, such as Burn, Chill, Shield or a boost. Tap the <b>opponent card</b> with Burn to open its details.',
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
        body: 'Tap the <b>Burn tag</b> to read its effect. The sheet shows the <b>Fire</b> element tag and explains the damage per stack at the start of the owner’s next Setup. The stacks then clear.',
        skipIf: function () { return !chipButton(); },
        until: function () { return effectKeyOpen() || !cardViewOpen(); } },

      { id: 'badge-chip-read', title: 'The Burn tag',
        target: function () { return previewChipSelector() || allEffectsSelector(); },
        highlight: function () { return [previewChipSelector() || allEffectsSelector()]; },
        body: 'The <b>Burn tag</b> shows the effect name and stack count. Open <b>All Effects</b> to see its Fire element and damage rules.',
        skipIf: function () { return !!chipButton() || !previewChipSelector(); } },

      // After the Burn tag opens the affliction sheet, hold on that sheet so the
      // tip is not buried under the card preview and the player actually reads it.
      { id: 'badge-burn-sheet', title: 'Burn',
        target: function () {
          return firstOf([
            '#effectKeyOverlay .effect-key-single',
            '#effectKeyOverlay .trainer-ability-modal',
            '#effectKeyOverlay'
          ]);
        },
        highlight: function () {
          return [firstOf([
            '#effectKeyOverlay .effect-key-single',
            '#effectKeyOverlay .trainer-ability-modal',
            '#effectKeyOverlay'
          ])];
        },
        avoid: '.trainer-ability-close',
        body: 'Burn deals <b>1 damage per stack</b> at the start of the owner’s next Setup, then the stacks clear. The <b>Fire</b> tag marks it as a Fire affliction.',
        skipIf: function () { return !burnSheetOpen(); } },

      { id: 'badge-all', hint: 'Tap <b>All Effects</b>', title: 'Effect reference',
        target: allEffectsSelector,
        highlight: function () { return [allEffectsSelector()]; },
        avoid: '.trainer-ability-close',
        body: '<b>All Effects</b> lists buffs and afflictions by element, including Burn under Fire and Chill under Ice. You can open it during a match to check any effect.',
        skipIf: function () { return !cardViewOpen() && !effectKeyOpen(); },
        until: function () { return allEffectsOpen() || (!cardViewOpen() && !effectKeyOpen()); } },

      // Between open and dismiss: let the player actually read the reference.
      // Ringing only × (as badge-close used to) dims the list and makes every
      // row look disabled the moment the sheet appears.
      { id: 'badge-all-browse', hint: 'Tap <b>×</b> when ready', title: 'Look through the list',
        target: function () {
          return firstOf([
            '#effectKeyOverlay .trainer-ability-close',
            '#effectKeyOverlay .trainer-ability-modal',
            '#effectKeyOverlay'
          ]);
        },
        highlight: function () {
          return [firstOf([
            '#effectKeyOverlay .trainer-ability-modal',
            '#effectKeyBody',
            '#effectKeyOverlay'
          ])];
        },
        nodim: true,
        avoid: '.trainer-ability-close',
        body: 'Take a look at the list — buffs, afflictions, every element. Hit <b>×</b> when you are ready.',
        skipIf: function () { return !allEffectsOpen(); },
        until: function () { return !effectKeyOpen(); } },

      { id: 'badge-close', hint: 'Tap <b>Close</b>', title: 'Return to the battle',
        target: function () { return firstOf(['#effectKeyOverlay .trainer-ability-close', '#boardArea']); },
        highlight: function () {
          return [firstOf([
            '#effectKeyOverlay .trainer-ability-modal',
            '#effectKeyOverlay'
          ])];
        },
        nodim: true,
        avoid: '.trainer-ability-close',
        body: 'Tap <b>Close</b> to leave the effect sheet. Next, close the card preview so the board tips are visible.',
        skipIf: function () { return !visible('#effectKeyOverlay:not(.hidden)'); },
        until: function () { return !visible('#effectKeyOverlay:not(.hidden)'); } },

      // Damage / kill tips target the board; on phones the card preview drawer
      // covers that region (and sat above the coach layer). Ask to dismiss it.
      { id: 'preview-close', hint: 'Swipe down to close', title: 'Close the card preview',
        target: function () {
          return firstOf(['#drawerSelected .drawer-handle', '#drawerSelected h3', '#drawerSelected']);
        },
        highlight: function () {
          return [firstOf(['#drawerSelected .drawer-handle', '#drawerSelected'])];
        },
        body: 'Swipe the card preview <b>down</b> to close it (or tap the handle). The next tips sit on the board behind it.',
        skipIf: function () { return !selectedDrawerOpen(); },
        until: function () { return !selectedDrawerOpen(); } },

      { id: 'damage', title: 'Ability damage', target: '#boardArea',
        body: 'An <b>ability</b> determines how much damage a hit deals. Elemental advantage adds <b>1 damage</b> against a Siegeling that is weak to the attacking element.' },

      { id: 'kill', title: 'Siege Damage', target: '#enemyGrid',
        body: 'Knocking out a Siegeling deals <b>Siege Damage</b> to its owner’s HP. Rarer Siegelings deal more Siege Damage when defeated.' },

      // ---- Turn 2 ---------------------------------------------------------
      //
      // Everything below is round-two material, and MUST NOT be reached while
      // round one is still playing. Written as `skipIf: turn() < 2` it was:
      // skipIf is evaluated once, on arrival, so the whole chapter was skipped
      // in a single pass during the first Battle phase and the coach stranded
      // itself on the last step standing, which then sat there as a stale hint
      // through all of round two. A gate holds instead of discarding.

      { id: 'gate-t2', skipTo: 'tools',
        hint: 'Finish this battle to begin round two',
        gate: function () { return turn() >= 2 && seen.sawBattle; } },

      { id: 't2-draw', hint: 'Tap <b>Draw</b>', title: 'Draw for round two', target: '#btnDraw',
        body: 'Tap <b>Draw</b> to add your next card to your hand.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() !== 'DRAW'; } },

      { id: 't2-setup', title: 'Use your energy', target: '#phaseBadge',
        body: 'Your energy gives you more Setup actions. This round, you will connect two Siegelings and evolve one.',
        skipIf: function () { return turn() < 2 || !seen.sawBattle; },
        until: function () { return phase() === 'SETUP' || phase() === 'BATTLE'; } },

      // Cost is a real rule and it is NOT the same rule for both card kinds:
      // GameService checks `canAfford` for a Siegling and never spends it
      // (energy is recomputed from links each turn), while a spell or trap goes
      // through `spendEnergy`. Saying "pay" for a Siegling would be wrong.
      { id: 't2-cost', title: 'Energy requirements', target: costTarget,
        nodim: true,
        body: function () {
          var c = costedCard();
          var named = c
            ? '<b>' + esc(c.name) + '</b> requires <b>' + c.costAmount + ' ' + esc(String(c.costElement).toLowerCase()) + ' energy</b>. '
            : '';
          return named + 'Compare the card’s <b>energy requirement</b> with your pool at the top. Siegelings require energy of their element, and that energy stays in your pool when you place them.';
        },
        skipIf: function () { return !costedCard() && !visible('#playerHand .card-corner-cost'); } },

      { id: 't2-pick', title: 'Add a second Siegeling', target: '#playerHand',
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
            ? ' The link will help you reach the <b>' + (evo.costAmount || 0) + ' ' +
              esc(String(evo.costElement || '').toLowerCase()) + ' energy</b> required for <b>' + esc(evo.name) + '</b>.'
            : '';
          return (mate ? 'Select <b>' + esc(mate.name) + '</b>' : 'Select another Siegeling') +
            ' to place beside your first Siegeling with their notches facing each other.' + goal;
        },
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return selectedType() === 'SIEGLING' || mine() >= 2; } },

      { id: 't2-place', hint: 'Place next to your first', title: 'Connect the notches',
        // The spotlight stays on every legal cell — the placement is still the
        // player's to make — but the one that actually connects is marked.
        target: linkCellOrLegal,
        recommend: linkCell,
        highlight: ['#playerGrid .board-cell.legal'],
        body: 'Place the Siegeling so its notch faces the other card’s notch. Matching elements generate <b>elemental energy</b>. Different elements generate a <b>combo point</b>.',
        skipIf: function () { return turn() < 2 || mine() >= 2; },
        until: function () { return mine() >= 2; } },

      // Spotlight the two cards that are actually linked, not the whole grid —
      // the lesson names a connection the player then has to go find.
      { id: 't2-notches', title: 'Notch links',
        target: function () {
          var cells = linkedCellSelectors();
          return cells.length ? cells[0] : '#playerGrid';
        },
        highlight: function () {
          var cells = linkedCellSelectors();
          return cells.length ? cells : ['#playerGrid'];
        },
        body: 'Facing notches form a <b>link</b>. Connected Siegelings generate energy each round while the link remains in place.',
        skipIf: function () { return turn() < 2 || mine() < 2; } },

      // Two payouts, two different lessons. Matching elements bank that
      // element; mixed ones bank a split-colour combo instead. Both wait for
      // the player to actually make one — and both give up the wait the moment
      // Setup ends, so neither can hold the match hostage (the badge lesson
      // taught us that the hard way).
      { id: 't2-link-same', hint: 'Face two <b>matching</b> notches at each other',
        title: 'Matching elements', target: '#playerGrid',
        highlight: ['#playerGrid .board-cell.legal', '#playerGrid'],
        body: 'Connect two notches of the <b>same element</b> to generate energy of that element each round.',
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
      { id: 't2-evolve', hint: 'Play an evolution onto its base', title: 'Evolution requirements',
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
          var named = evo ? 'You can evolve ' + (base ? '<b>' + esc(base) + '</b>' : 'your Siegeling') +
            ' into <b>' + esc(evo.name) + '</b>. ' : '';
          return named + 'A Siegeling must have <b>survived a full battle phase</b> in its current form. You also need the evolution’s required <b>energy</b> in your pool.';
        },
        skipIf: function () {
          if (turn() < 2) return true;
          return !evolutionInHand();
        } },

      { id: 't2-evolve-pick', title: 'Select the evolution',
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
            ' in your hand. Its base Siegeling will be highlighted on your board. Place the evolution <b>on that base</b>.';
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

      { id: 't2-evolve-place', title: 'Place the evolution',
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
          return 'Tap ' + (base ? '<b>' + esc(base) + '</b>' : 'the highlighted cell') + ' on your board. ' +
            (evo ? '<b>' + esc(evo.name) + '</b>' : 'The evolution') +
            ' replaces it in the same cell. Check the new card’s notches to see which links it forms.';
        },
        skipIf: function () {
          return turn() < 2 || !evolutionInHand() || !evolutionReady();
        },
        until: function () {
          // Placed (the card left the hand), or Setup ended — the lesson never
          // holds the match hostage over a move the player chose to skip.
          return !evolutionInHand() || phase() !== 'SETUP';
        } },

      { id: 't2-end', hint: 'Tap <b>End Turn</b>', title: 'Finish Setup', target: actionBtn,
        body: 'Tap <b>End Turn</b> to finish Setup and continue to the next battle.',
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
        hint: 'Choose moves until Pylook’s turn',
        gate: function () { return !!actingRowAbility() || battleTwoDone(); } },

      { id: 'row-attack', title: 'Row abilities',
        target: rowMoveButton,
        highlight: function () {
          var button = rowMoveButton();
          return button ? [button] : [];
        },
        body: function () {
          var row = actingRowAbility();
          var actor = actingCard();
          var lead = actor && actor.name ? '<b>' + esc(actor.name) + '</b> can use ' : 'Use ';
          var named = row && row.name ? '<b>' + esc(row.name) + '</b>' : 'this row ability';
          return lead + named + ' to hit <b>every Siegeling in one enemy row</b>. ' +
            'Each target also gains <b>Burn</b> from the Fire hit. Tap the ability, then choose a row.';
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
      { id: 'row-target', title: 'Choose a row',
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
          var named = row && row.name ? '<b>' + esc(row.name) + '</b>' : 'This ability';
          if (!best) {
            return 'Tap a <b>highlighted card</b> to select its row. ' + named + ' will hit each Siegeling in that row.';
          }
          var n = best.count;
          return 'The marked row has <b>' + n + '</b> ' + (n === 1 ? 'Siegeling' : 'Siegelings') + '. ' +
            named + ' hits each one for a single energy cost. Tap any card in the <b>marked row</b>.';
        },
        skipIf: function () { return !battleTargeting(); },
        // Picking the row does not fire the move — it arms the Confirm prompt,
        // which the next step teaches. Releasing on `!battleTargeting()` alone
        // left this tip up over that prompt, still asking for a row the player
        // had already marked.
        until: function () { return rowPicked() || !battleTargeting() || battleTwoDone(); } },

      // The second half of a row move: the swing is not spent until it is
      // confirmed, so the player can compare rows before committing.
      { id: 'row-confirm', title: 'Confirm the row',
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
          var named = row && row.name ? '<b>' + esc(row.name) + '</b>' : 'the ability';
          return 'The arrows show which cards ' + named + ' will hit. Tap <b>Confirm</b> to use the ability and spend its energy, or <b>Change Row</b> to select another row.';
        },
        skipIf: function () { return !rowPicked(); },
        until: function () { return !rowPicked() || !battleTargeting() || battleTwoDone(); } },

      // The row swing spread Burn across a row; the next Fire attacker can cash
      // that in. Gated rather than skipped for the same reason `gate-row` is:
      // whoever acts next has not taken the floor yet when the coach arrives
      // here, so a skipIf would drop the lesson before it could ever be true.
      { id: 'gate-burn', skipTo: 't2-battle',
        hint: 'Choose moves until your next Fire Siegeling acts',
        gate: function () { return !!burnPlan() || battleTwoDone(); } },

      { id: 'burn-kill', title: 'Damage from Burn',
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
          return plan && plan.abilityName ? 'Tap <b>' + esc(plan.abilityName) + '</b>' : 'Tap the highlighted Fire ability';
        },
        body: function () {
          var plan = burnPlan();
          if (!plan) return 'Elemental <b>weakness</b> adds damage to the hit. <b>Burn</b> deals damage at the start of the owner’s next Setup.';
          var move = plan.abilityName ? '<b>' + esc(plan.abilityName) + '</b>' : 'the highlighted Fire ability';
          return burnMathSentence(plan) + ' Tap ' + move + '.';
        },
        skipIf: function () { return !burnPlan(); },
        // Released by the move being chosen, or by the plan going away — the
        // board moved on, the target died to something else, the battle ended.
        until: function () { return battleTargeting() || !burnPlan() || battleTwoDone(); } },

      { id: 'burn-target', title: 'Choose the Burn target',
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
          if (!plan) return 'Choose a Siegeling whose remaining Health can be removed by the hit and Burn together.';
          var target = plan.target ? '<b>' + esc(plan.target) + '</b>' : 'the marked card';
          return 'Tap ' + target + '. The hit deals <b>' + plan.hit + ' damage</b>, and Burn deals <b>' + plan.burn +
            '</b> at the start of its owner’s next Setup. Together, they knock this Siegeling out.';
        },
        skipIf: function () { return !battleTargeting() || !burnPlan(); },
        until: function () { return !battleTargeting() || !burnPlan() || battleTwoDone(); } },


      // Same defect as the gate above: `seen.sawBattle2` is true from the first
      // frame of the battle this step is asking the player to watch, so it
      // resolved immediately and the tip flashed past the fight it named.
      // "Now watch" alone was misleading: the rest of the battle still asks the
      // player to pick a move and a target for every Siegeling they own.
      { id: 't2-battle', title: 'Finish the battle', target: '#boardArea',
        hint: 'Choose each Siegeling\'s move',
        body: 'Choose an <b>ability</b> and any required target for each of your Siegelings as its turn comes up. They act in Speed order.',
        skipIf: function () { return !seen.sawBattle; },
        until: function () { return battleTwoDone(); } },

      // ---- Turn 3 ---------------------------------------------------------
      //
      // Round two is deliberately only two moves — link, then evolve — because
      // that is all one Setup affords. The combo link needs a THIRD Siegeling of
      // a different element, so it waits for round three, where GameService's
      // scripted tutorial draw guarantees an Earth partner in hand.

      { id: 'gate-t3', skipTo: 'tools',
        hint: 'Finish round two to continue the tutorial',
        gate: function () { return turn() >= 3 && seen.sawBattle2; } },

      { id: 't3-draw', hint: 'Tap <b>Draw</b>', title: 'Draw for round three',
        target: '#btnDraw',
        body: function () {
          var earth = comboPartnerInHand();
          return 'Tap <b>Draw</b>. This round, you will connect a Siegeling of a <b>different element</b> to create a combo.' +
            (earth ? ' Use <b>' + esc(earth.name) + '</b> for this link.' : ' Look for a different element in your hand.');
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
          return (earth ? 'Select <b>' + esc(earth.name) + '</b>' : 'Select a Siegeling of a different element') +
            ' and place it beside one of your Siegelings. Facing notches of <b>different elements</b> form a <b>combo link</b>.';
        },
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; },
        until: function () { return selectedType() === 'SIEGLING' || comboCount() > 0 || phase() !== 'SETUP'; } },

      { id: 't3-link-combo', hint: 'Now face two <b>different</b> elements at each other',
        title: 'Create a combo link', target: '#playerGrid',
        highlight: ['#playerGrid .board-cell.legal', '#playerGrid'],
        body: 'Place the Siegeling so two notches of <b>different elements</b> face each other. This creates a <b>combo point</b>, shown in both colours. Some cards require combo points.',
        // Same redundancy guard as the same-element lesson: the placement step
        // before this one often banks the combo on its own, and asking for one
        // already sitting in the pool reads as the coach not watching.
        skipIf: function () { return turn() < 3 || !seen.sawBattle2 || comboCount() > 0; },
        until: function () { return comboCount() > 0 || phase() !== 'SETUP'; } },

      { id: 't3-energy', hint: 'Tap <b>◈</b>', title: 'Your energy pool', target: '#btnEnergyDetail',
        body: 'The coloured dots show your available energy. Tap <b>◈</b> to see which links and sockets generated it.',
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; },
        until: function () { return seen.hadLinkEnergy || comboCount() > 0 || phase() === 'BATTLE'; } },

      { id: 't3-combo', title: 'Combo points', target: '#btnEnergyDetail',
        body: 'Links between different elements generate <b>combo points</b>, shown in both colours. Check a card’s requirements to see which combo it uses.',
        skipIf: function () { return turn() < 3 || !seen.sawBattle2; } },

      { id: 't3-strategy', hint: 'Tap <b>Ashfall</b> to inspect it', title: 'Inspect a Strategy',
        target: ashfallTarget, recommend: ashfallTarget,
        lock: function () { return ashfallTarget() ? HAND_CARDS : null; },
        body: 'Tap <b>Ashfall</b> to open its card preview. <b>Strategies</b> spend energy from your pool when cast. Check the card’s cost and effect before playing it.',
        skipIf: function () { return turn() < 3 || !ashfallTarget(); },
        until: function () { return ashfallPreviewOpen() || !ashfallTarget(); } },
      { id: 'ashfall-art', title: 'Card preview',
        target: function () { return previewField('.selected-preview-card', '.desktop-preview-card'); },
        body: 'The preview shows <b>Ashfall’s</b> card art, name and cost symbol.',
        skipIf: function () { return !ashfallPreviewOpen(); } },
      { id: 'ashfall-cost', title: 'Ashfall’s energy cost',
        target: function () { return previewField('.selected-copy-cost', '.desktop-preview-stats'); },
        body: '<b>Play Cost: 3 Fire</b> means you need three Fire energy to cast Ashfall. The availability message shows how much more Fire you need.',
        skipIf: function () { return !ashfallPreviewOpen(); } },
      { id: 'ashfall-effect', title: 'Read the effect',
        target: function () { return previewField('.selected-copy-detail', '.desktop-preview-description'); },
        body: 'Ashfall <b>destroys every enemy Siegeling</b> when cast. You will use it after claiming a Siegeling for more Fire energy.',
        skipIf: function () { return !ashfallPreviewOpen(); } },
      { id: 'ashfall-pages', title: 'Preview pages',
        target: function () { return previewField('.selected-preview-dots', '.desktop-preview-card'); },
        body: 'On phones, swipe or tap the page dots to view the card summary and abilities. On desktop, the preview appears beside the board. Tap <b>Got it</b> to continue.',
        skipIf: function () { return !ashfallPreviewOpen(); } },

      { id: 't3-deception', title: 'Deception requirements', target: '#playerHand',
        highlight: ['#playerHand', '#handTray'],
        body: 'A <b>Deception</b> requires the opponent to have the amount and element of energy shown on the card. Check their pool to see which Deceptions you can play.',
        skipIf: function () { return turn() < 3 || !handHas('TRAP'); } },

      // Claiming used to be taught in a vacuum: "cash in a survivor" with nothing
      // to spend it on, which asked the student to bin their best Siegeling for
      // no reason. The claim now BUYS something — it is the last Fire needed for
      // Ashfall — so the cost reads as a trade instead of a sacrifice.
      { id: 't3-claim', hint: 'Claim a highlighted Siegeling', title: 'Claim a Siegeling for energy',
        target: function () { return firstOf(['#playerGrid .board-cell.claimable', '#playerGrid']); },
        highlight: ['#playerGrid .board-cell.claimable'],
        recommend: function () { return firstOf(['#playerGrid .board-cell.claimable', '']) || null; },
        body: function () {
          var f = fireEnergy();
          var wipe = handCardNamed('tutorial_ashfall');
          var have = 'You have <b>' + f + ' Fire energy</b>. ';
          return have + '<b>Claiming</b> removes a surviving Siegeling from your board and gives you <b>1 energy of its element</b>. ' +
            'Claim a Fire Siegeling to help reach the 3 Fire required for ' + (wipe ? '<b>' + esc(wipe.name) + '</b>' : 'your Strategy') + '.';
        },
        skipIf: function () { return turn() < 3 || !visible('#playerGrid .board-cell.claimable'); },
        until: function () { return fireEnergy() >= 3 || phase() !== 'SETUP'; } },

      { id: 't3-wipe', hint: 'Cast <b>Ashfall</b>', title: 'Cast Ashfall',
        target: '#playerHand', highlight: ['#playerHand', '#handTray'],
        body: function () {
          var wipe = handCardNamed('tutorial_ashfall');
          return 'Cast ' + (wipe ? '<b>' + esc(wipe.name) + '</b>' : 'the Strategy') +
            ' for <b>3 Fire energy</b> to destroy every enemy Siegeling. Each knockout deals <b>Siege Damage</b> to the opponent.';
        },
        skipIf: function () { return turn() < 3 || !handCardNamed('tutorial_ashfall'); },
        until: function () { return theirs() === 0 || phase() !== 'SETUP'; } },

      // One act left after the wipe, and a card worth spending it on. This is
      // also the first time the budget MATTERS, so the next step reads it back.
      { id: 't3-summon', hint: 'Place another Siegeling', title: 'Use your remaining action',
        target: function () { return firstOf(['#playerHand', '#handTray']); },
        highlight: ['#playerHand', '#handTray', '#playerGrid .board-cell.legal'],
        body: function () {
          var next = hand().filter(function (c) {
            return c && c.type === 'SIEGLING' && !c.evolvesFromId;
          })[0];
          return 'You still have a Setup action. Place ' + (next ? '<b>' + esc(next.name) + '</b>' : 'another Siegeling') +
            ' on a highlighted cell to prepare for battle.';
        },
        skipIf: function () { return turn() < 3 || actsRemaining() <= 0; },
        until: function () { return actsRemaining() <= 0 || phase() !== 'SETUP'; } },

      { id: 't3-acts', title: 'The action counter', target: actionBtn,
        highlight: function () { return [actionBtn()]; },
        body: 'The <b>action counter</b> shows your remaining Setup actions. Each Setup gives you one action plus one for each unit of energy in your pool.' },

      // The knight has been READY since round one and never been used; with the
      // board cleared there is nothing to lose by spending it.
      { id: 't3-knight', hint: 'Tap <b>Knight</b>', title: 'Use your Knight ability',
        target: '#btnTrainerAbility', highlight: ['#btnTrainerAbility'],
        body: function () {
          var k = knightName();
          return (k ? '<b>' + esc(k) + '</b>' : 'Your SiegeKnight') +
            ' has an active ability available. Tap <b>Knight</b> to use it. Your Setup action count stays the same.';
        },
        skipIf: function () { return turn() < 3 || seen.knightSpent; },
        until: function () { return seen.knightSpent || seen.knightOpened || phase() !== 'SETUP'; } },

      { id: 't3-end', hint: 'Tap <b>End Turn</b>', title: 'Finish Setup', target: actionBtn,
        body: 'Tap <b>End Turn</b> to continue to battle.',
        skipIf: function () { return turn() < 3 || phase() === 'BATTLE'; },
        until: function () { return !myTurn() || phase() === 'BATTLE'; } },

      { id: 'tools', title: 'Help during a match', target: '#btnHint',
        body: 'Tap <b>?</b> for guidance on your next action, <b>≡</b> for the game log, or <b>👁</b> to inspect the selected card.' },

      { id: 'done', kicker: 'Tutorial complete', title: 'Arena basics complete', finish: true, finale: true,
        altLabel: 'Advanced Tutorial',
        body: 'You have practised placing, linking and evolving Siegelings, building energy and using abilities.<span class="tut-p">Continue with the <b>Advanced Tutorial</b> to learn more about effects and battle controls, or start another Arena match.</span>' }
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
      { id: 'adv-welcome', kicker: 'Advanced', title: 'Advanced practice match',
        target: '#boardArea',
        body: 'Both teams start with <b>five Siegelings</b> already placed. You begin in <b>Setup</b> with Fire and Earth energy. The opponent has Ice energy.' },
      { id: 'adv-enemy-energy', title: 'Check the opponent’s energy',
        target: function () { return firstOf(['#mobileEnemyEnergyCount', '#enemyEnergy']); },
        body: '<b>Shatter Seal</b> requires the opponent to have <b>3 Ice energy</b>. Their energy pool is shown here.' },
      { id: 'adv-cast-deception', title: 'Cast Shatter Seal',
        target: function () { return handCardTarget(hand().find(function(c) { return c.id === 'trap13'; })); },
        body: 'Tap <b>Shatter Seal</b> and check its energy requirement. The opponent has enough Ice energy, so you can cast it on a highlighted enemy.',
        skipIf: function () { return !hand().some(function(c) { return c.id === 'trap13'; }); },
        until: function () { return !hand().some(function(c) { return c.id === 'trap13'; }) || phase() !== 'SETUP'; } },
      { id: 'adv-start-battle', title: 'Begin battle', target: actionBtn,
        body: 'Tap <b>End Turn</b> to finish Setup. After the opponent finishes, the battle panel shows the active Siegeling and its abilities.',
        until: function () { return phase() === 'BATTLE' || seen.ended; } },
      { id: 'adv-wait-action', hint: 'Wait for your next Siegeling to act', skipTo: 'adv-hud',
        gate: function () { return !!actingCard() || seen.ended; } },
      { id: 'adv-action-preview', title: 'The active Siegeling',
        target: function () { return firstBattleField('.battle-queue-topbar'); },
        body: 'The header shows the Siegeling taking its turn, along with its current <b>Health</b>, <b>Speed</b> and effect badges.' },
      { id: 'adv-action-moves', title: 'Choose an ability',
        target: function () { return firstBattleField('.battle-queue-actions'); },
        body: 'Each ability shows its effect, energy cost and damage preview. Select an ability, then choose a highlighted target if prompted. <b>Pass</b> moves to the next Siegeling.' },

      { id: 'adv-shield', title: 'Shields and badges',
        target: function () { return badgeCellSelector() || badgeSelector(); },
        body: 'Both lead Siegelings start with <b>3 Shield</b>. Shield absorbs damage before Health. Badges also show afflictions and boosts. Open a card’s effects to read what each one does.' },

      // ---- The HUD ---------------------------------------------------------
      //
      // One step per control, in the order they sit on screen, each skipped if
      // it is not currently rendered: the action row swaps buttons with the
      // phase, so Draw, Auto Battle, Pass and Cancel Move are never all up at
      // once.

      { id: 'adv-hud', kicker: 'Controls', title: 'Battle controls',
        target: '#actionBar', highlight: ['#actionBar'],
        body: 'The bar at the bottom holds your match controls. The next steps explain each button.',
        skipIf: function () { return !visible('#actionBar'); } },

      { id: 'adv-hud-knight', title: 'Knight', target: '#btnTrainerAbility',
        body: 'Opens your SiegeKnight’s abilities. The <b>passive</b> stays active throughout the match. The <b>active</b> can be used once and shows <b>Ready</b> while available.',
        skipIf: function () { return !visible('#btnTrainerAbility'); } },

      // On a phone the action row collapses to ONE button whose label follows the
      // phase, so Draw / End Turn / Auto Battle / Pass are never all on screen —
      // a step each would silently skip most of them there. One step covers
      // whichever is live (that is what actionBtn() is for) and names the rest;
      // the individual steps below still fire on desktop, where they coexist.
      { id: 'adv-hud-action', title: 'The action button', target: actionBtn,
        body: '<b>Draw</b> adds a card, and <b>End Turn</b> finishes Setup. During battle, <b>Battle Action</b> opens your active Siegeling’s abilities. <b>Queue Live</b> and <b>Queue Locked</b> show the current battle status.',
        skipIf: function () { return !actionBtn(); } },

      { id: 'adv-hud-draw', title: 'Draw', target: '#btnDraw',
        body: 'Adds one card to your hand during the <b>Draw phase</b>.',
        skipIf: function () { return !visible('#btnDraw'); } },

      { id: 'adv-hud-end', title: 'End Turn', target: '#btnEndTurn',
        body: 'Finishes your Setup. Battle begins once both players have finished.',
        skipIf: function () { return !visible('#btnEndTurn'); } },

      { id: 'adv-hud-battle', title: 'Battle queue', target: '#btnBattle',
        body: 'Opens the battle queue. On your turn, it shows <b>Battle Action</b> so you can choose an ability for the active Siegeling.',
        skipIf: function () { return !visible('#btnBattle'); } },

      { id: 'adv-hud-pass', title: 'Pass', target: '#btnBattlePass',
        body: 'Skips the active Siegeling’s action and continues to the next one.',
        skipIf: function () { return !visible('#btnBattlePass'); } },

      { id: 'adv-hud-cancel', title: 'Cancel Move', target: '#btnCancelBattleMove',
        body: 'Clears your current ability selection so you can choose another move.',
        skipIf: function () { return !visible('#btnCancelBattleMove'); } },

      { id: 'adv-hud-home', title: 'Back to Home', target: '.action-bar-aux a[aria-label="Back to Home"]',
        body: 'Returns to the Home page.',
        skipIf: function () { return !visible('.action-bar-aux a[aria-label="Back to Home"]'); } },
      { id: 'adv-hud-menu', title: 'Site menu', target: '#playHubMenuFlyout summary',
        body: 'Opens navigation to your Keep, cards, decks and other pages.',
        skipIf: function () { return !visible('#playHubMenuFlyout summary'); } },

      { id: 'adv-hud-act', title: 'Setup actions', target: '#setupActionsCounter',
        body: 'Shows how many <b>Setup actions</b> you have left. Placing, casting and claiming each use an action.',
        skipIf: function () { return !visible('#setupActionsCounter'); } },

      { id: 'adv-hud-preview', title: 'Card Preview', target: '#btnSelectedPreview',
        body: 'Opens the selected card’s art, stats, abilities and costs.',
        skipIf: function () { return !visible('#btnSelectedPreview'); } },

      { id: 'adv-hud-hint', title: 'Hints', target: '#btnHint',
        body: 'Shows guidance for the action the game is waiting for.',
        skipIf: function () { return !visible('#btnHint'); } },

      { id: 'adv-hud-queue', title: 'Hand and battle view', target: '#btnBattlePanel',
        body: 'Switches between your hand and the battle action panel during battle. During Setup, it opens a preview of your Siegelings’ attacks.',
        skipIf: function () { return !visible('#btnBattlePanel'); } },

      { id: 'adv-hud-log', title: 'Game Log', target: '#btnGameLog',
        body: 'Lists battle events in order, including damage, healing and effects.',
        skipIf: function () { return !visible('#btnGameLog'); } },

      { id: 'adv-hud-energy', title: 'Energy Detail', target: '#btnEnergyDetail',
        body: 'Shows the links, sockets and combos that generated your energy.',
        skipIf: function () { return !visible('#btnEnergyDetail'); } },

      { id: 'adv-hud-speed', title: 'Playback speed', target: '#sglSpeedToggle',
        body: 'Tap to change the speed of battle animations.',
        skipIf: function () { return !visible('#sglSpeedToggle'); } },

      { id: 'adv-hud-sound', title: 'Sound', target: '#btnMuteSound',
        body: 'Turns game sound on or off.',
        skipIf: function () { return !visible('#btnMuteSound'); } },

      { id: 'adv-hud-quit', title: 'Quit', target: '#btnQuitOrNewGame',
        body: 'Leaves this match and opens setup for a new one.',
        skipIf: function () { return !visible('#btnQuitOrNewGame'); } },

      { id: 'adv-read', title: 'Check an effect or action', target: '#btnHint',
        body: 'Use <b>Hints</b> for the next action and <b>All Effects</b> to look up a badge’s rules during play.' },

      { id: 'adv-done', kicker: 'Advanced complete', title: 'Advanced tutorial complete', finish: true, finale: true,
        body: 'You have reviewed Deceptions, shields, effect badges and battle controls. Continue this practice match or start another Arena match.' }
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
        box.innerHTML = '<b>Tutorial reward</b> A second starter pack and 250 Siegecoins have been added to your account.';
      } else if (r && r.already) {
        box.className = 'tut-reward is-claimed';
        box.innerHTML = '<b>Tutorial reward</b> You have already claimed this reward.';
      } else {
        box.className = 'tut-reward';
        box.innerHTML = 'Sign in to claim your tutorial reward.';
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
