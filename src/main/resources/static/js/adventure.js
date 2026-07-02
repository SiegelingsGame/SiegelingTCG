/* Siege — Siegelings Adventure roguelike client.
 * Talks to /api/siege/**. All rules run server-side; this file renders state
 * and submits actions. Run is addressed by an opaque token in localStorage.
 *
 * Screens: setup (warband select) → branching map (SVG DAG) → battle stage
 * (overlay-art character sprites + fanned card hand) → reward picks → result. */
(function () {
  'use strict';

  var TOKEN_KEY = 'siegeToken';
  var state = {
    roster: null,
    run: null,
    knightId: null,
    party: [],          // selected siegeling ids (max 3)
    elementFilter: 'ALL',
    selectedCardId: null,
    selectedCardNeedsTarget: false,
    busy: false,
    prevUnits: {}       // combatant id -> {hp, alive} for hit/heal animation diffs
  };

  var EL_ICON = {
    FIRE: '🔥', WATER: '💧', EARTH: '🪨', WIND: '🌪️', ICE: '❄️', SHADOW: '🌑',
    ELECTRIC: '⚡', METAL: '⚙️', UNDEAD: '💀', PSYCHIC: '🔮', POISON: '☠️', LIGHT: '✨', NEUTRAL: '◇'
  };
  var NODE_ICON = { BATTLE: '⚔️', ELITE: '🔺', REST: '🏕️', TREASURE: '💎', BOSS: '👑' };
  var NODE_TINT = { BATTLE: '#8fa3bf', ELITE: '#ff6e6e', REST: '#7ee787', TREASURE: '#ffd066', BOSS: '#ff9a3c' };

  // ---- API -----------------------------------------------------------
  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) { throw new Error(data && data.error ? data.error : ('Request failed (' + r.status + ')')); }
        return data;
      });
    });
  }

  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // ---- helpers -------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function elClass(element) { return 'el-' + (element || 'NEUTRAL'); }
  function icon(element) { return EL_ICON[element] || '◇'; }

  function showScreen(id) {
    ['loadingScreen', 'setupScreen', 'mapScreen', 'battleScreen', 'rewardScreen', 'resultScreen'].forEach(function (s) {
      var node = $(s); if (node) node.classList.toggle('hidden', s !== id);
    });
  }
  function toast(msg) {
    var t = $('siegeToast'); if (!t) return;
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._h); toast._h = setTimeout(function () { t.classList.add('hidden'); }, 2600);
  }

  // ---- boot ----------------------------------------------------------
  function boot() {
    wireStaticButtons();
    var t = token();
    if (t) {
      api('/api/siege/state?token=' + encodeURIComponent(t)).then(function (run) {
        state.run = run;
        if (run.status === 'ACTIVE') { renderRun(); }
        else { setToken(null); loadRoster(); }
      }).catch(function () { setToken(null); loadRoster(); });
    } else {
      loadRoster();
    }
  }

  function loadRoster() {
    showScreen('loadingScreen');
    api('/api/siege/roster').then(function (data) {
      state.roster = data;
      renderSetup();
    }).catch(function (e) { toast(e.message); });
  }

  function wireStaticButtons() {
    $('startRunBtn').addEventListener('click', startRun);
    $('endTurnBtn').addEventListener('click', endTurn);
    $('rewardSkipBtn').addEventListener('click', function () { chooseReward('skip'); });
    $('resultBtn').addEventListener('click', function () { setToken(null); location.href = '/play'; });
    $('abandonBtn').addEventListener('click', function () {
      if (confirm('Abandon this expedition?')) { setToken(null); state.run = null; state.party = []; state.knightId = null; loadRoster(); }
    });
  }

  // ---- team select ---------------------------------------------------
  function renderSetup() {
    showScreen('setupScreen');
    $('abandonBtn').classList.add('hidden');
    var r = state.roster;
    $('partyReq').textContent = '— choose ' + (r.partySize || 3);

    // knights
    var kg = $('knightGrid'); kg.innerHTML = '';
    r.knights.forEach(function (k) {
      var c = el('div', 'knight-card ' + elClass(k.element));
      c.innerHTML = '<div class="kname">' + icon(k.element) + ' ' + esc(k.name) + '</div>' +
        '<div class="kmeta">' + esc(k.element) + ' · Active: ' + esc(k.activeName) + '</div>' +
        '<div class="kpassive">' + esc(k.passive || '') + '</div>';
      c.addEventListener('click', function () {
        state.knightId = k.id;
        Array.prototype.forEach.call(kg.children, function (n) { n.classList.remove('sel'); });
        c.classList.add('sel');
        refreshSetupFooter();
      });
      kg.appendChild(c);
    });

    // element filter
    var elements = ['ALL'];
    r.sieglings.forEach(function (s) { if (elements.indexOf(s.element) < 0) elements.push(s.element); });
    var fr = $('elementFilter'); fr.innerHTML = '';
    elements.forEach(function (elm) {
      var chip = el('button', 'filter-chip' + (elm === state.elementFilter ? ' active' : ''), elm === 'ALL' ? 'All' : (icon(elm) + ' ' + elm));
      chip.addEventListener('click', function () { state.elementFilter = elm; renderSieglingGrid(); Array.prototype.forEach.call(fr.children, function (n) { n.classList.remove('active'); }); chip.classList.add('active'); });
      fr.appendChild(chip);
    });

    renderSieglingGrid();
    refreshSetupFooter();
  }

  function renderSieglingGrid() {
    var grid = $('sieglingGrid'); grid.innerHTML = '';
    state.roster.sieglings.filter(function (s) {
      return state.elementFilter === 'ALL' || s.element === state.elementFilter;
    }).forEach(function (s) {
      var picked = state.party.indexOf(s.id);
      var c = el('div', 'sgl-card ' + elClass(s.element) + (picked >= 0 ? ' sel' : ''));
      var art = s.artUrl
        ? '<div class="sart" style="background-image:url(\'' + encodeURI(s.artUrl) + '\')"></div>'
        : '<div class="sart sart-fallback">' + icon(s.element) + '</div>';
      c.innerHTML =
        (picked >= 0 ? '<div class="selorder">' + (picked + 1) + '</div>' : '') +
        art +
        '<div class="sname">' + esc(s.name) + '</div>' +
        '<div class="schip">' + icon(s.element) + ' ' + esc(s.element) + '</div>' +
        '<div class="sstats"><span>❤ ' + s.hp + '</span><span>⚡ ' + s.speed + '</span><span>🃏 ' + s.moveCount + '</span></div>';
      c.addEventListener('click', function () { toggleSiegling(s.id); });
      grid.appendChild(c);
    });
  }

  function toggleSiegling(id) {
    var i = state.party.indexOf(id);
    if (i >= 0) { state.party.splice(i, 1); }
    else {
      if (state.party.length >= (state.roster.partySize || 3)) { toast('You already have ' + (state.roster.partySize || 3) + ' Siegelings.'); return; }
      state.party.push(id);
    }
    renderSieglingGrid();
    refreshSetupFooter();
  }

  function refreshSetupFooter() {
    var need = state.roster.partySize || 3;
    var ready = state.knightId && state.party.length === need;
    $('startRunBtn').disabled = !ready;
    var names = state.party.map(function (id) {
      var s = state.roster.sieglings.find(function (x) { return x.id === id; });
      return s ? s.name : id;
    });
    var kn = state.roster.knights.find(function (k) { return k.id === state.knightId; });
    $('setupSummary').textContent = (kn ? ('Knight: ' + kn.name + '  ·  ') : 'Choose a knight  ·  ') +
      'Party (' + state.party.length + '/' + need + '): ' + (names.join(', ') || '—');
  }

  function startRun() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/run/new', { method: 'POST', body: { knightId: state.knightId, sieglingIds: state.party } })
      .then(function (run) { setToken(run.token); state.run = run; state.prevUnits = {}; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- run router ----------------------------------------------------
  function renderRun() {
    var run = state.run;
    if (!run) { loadRoster(); return; }
    $('abandonBtn').classList.toggle('hidden', run.status !== 'ACTIVE');
    if (run.status === 'WON' || run.status === 'LOST') { renderResult(); return; }
    if (run.battle) { renderBattle(); return; }
    if (run.pendingRewards && run.pendingRewards.length) { renderRewards(); return; }
    renderMap();
  }

  // ---- branching map (SVG DAG, boss at the top) ------------------------
  var MAP = { colGap: 96, rowGap: 104, pad: 56, r: 24 };

  function renderMap() {
    showScreen('mapScreen');
    var run = state.run;
    renderPartyStrip($('partyStrip'), run.party);
    $('mapReward').textContent = run.lastReward || '';
    $('mapDeckCount').textContent = '🃏 Deck: ' + (run.deckSize || '—') + ' cards';
    $('mapHint').textContent = run.currentNodeId < 0 ? 'Choose where the expedition begins' : 'Choose your path';

    var nodes = run.map || [];
    var rows = 1 + Math.max.apply(null, nodes.map(function (n) { return n.row; }));
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    // Center each row horizontally within the widest row.
    var rowCounts = {};
    nodes.forEach(function (n) { rowCounts[n.row] = (rowCounts[n.row] || 0) + 1; });
    var maxCount = Math.max.apply(null, Object.keys(rowCounts).map(function (k) { return rowCounts[k]; }));
    var width = MAP.pad * 2 + (maxCount - 1) * MAP.colGap;
    var height = MAP.pad * 2 + (rows - 1) * MAP.rowGap;

    function pos(n) {
      var count = rowCounts[n.row];
      var x = MAP.pad + ((maxCount - count) / 2 + n.col) * MAP.colGap;
      var y = height - MAP.pad - n.row * MAP.rowGap; // row 0 at the bottom, boss on top
      return { x: x, y: y };
    }

    var svg = $('mapSvg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.innerHTML = '';
    var NS = 'http://www.w3.org/2000/svg';

    // edges first (under the nodes)
    nodes.forEach(function (n) {
      var from = pos(n);
      (n.next || []).forEach(function (toId) {
        var to = pos(byId[toId]);
        var path = document.createElementNS(NS, 'path');
        var midY = (from.y + to.y) / 2;
        path.setAttribute('d', 'M' + from.x + ' ' + from.y + ' C ' + from.x + ' ' + midY + ', ' + to.x + ' ' + midY + ', ' + to.x + ' ' + to.y);
        var walked = n.cleared && (byId[toId].current || byId[toId].cleared);
        var open = n.current && byId[toId].reachable;
        path.setAttribute('class', 'map-edge' + (walked ? ' walked' : '') + (open ? ' open' : ''));
        svg.appendChild(path);
      });
    });

    // nodes
    nodes.forEach(function (n) {
      var p = pos(n);
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'map-node-g' +
        (n.cleared ? ' cleared' : '') +
        (n.current ? ' current' : '') +
        (n.reachable ? ' reachable' : '') +
        ' type-' + n.type);
      g.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');

      if (n.reachable) {
        var halo = document.createElementNS(NS, 'circle');
        halo.setAttribute('r', MAP.r + 8);
        halo.setAttribute('class', 'map-halo');
        g.appendChild(halo);
      }

      var circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('r', n.type === 'BOSS' ? MAP.r + 6 : MAP.r);
      circle.setAttribute('class', 'map-circle');
      circle.setAttribute('style', '--node-tint:' + (NODE_TINT[n.type] || '#8fa3bf'));
      g.appendChild(circle);

      var glyph = document.createElementNS(NS, 'text');
      glyph.setAttribute('class', 'map-glyph');
      glyph.setAttribute('text-anchor', 'middle');
      glyph.setAttribute('dominant-baseline', 'central');
      glyph.setAttribute('y', '1');
      glyph.textContent = NODE_ICON[n.type] || '•';
      g.appendChild(glyph);

      var label = document.createElementNS(NS, 'text');
      label.setAttribute('class', 'map-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('y', MAP.r + 18);
      label.textContent = n.label;
      g.appendChild(label);

      if (n.cleared) {
        var check = document.createElementNS(NS, 'text');
        check.setAttribute('class', 'map-check');
        check.setAttribute('text-anchor', 'middle');
        check.setAttribute('y', -MAP.r - 6);
        check.textContent = '✓';
        g.appendChild(check);
      }

      if (n.reachable) {
        g.addEventListener('click', function () { travelTo(n.id); });
      }
      svg.appendChild(g);
    });

    // Keep the action in view: scroll to the current position (or the start).
    var scroll = $('mapScroll');
    var focus = nodes.find(function (n) { return n.current; });
    var focusY = focus ? pos(focus).y : height;
    setTimeout(function () {
      scroll.scrollTop = Math.max(0, focusY - scroll.clientHeight * 0.6);
    }, 30);
  }

  function travelTo(nodeId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/node/enter', { method: 'POST', body: { token: token(), nodeId: nodeId } })
      .then(function (run) { state.run = run; state.prevUnits = {}; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function renderPartyStrip(host, party) {
    host.innerHTML = '';
    party.forEach(function (p) {
      var chip = el('div', 'party-chip ' + elClass(p.element) + (p.alive ? '' : ' dead'));
      var pct = Math.max(0, Math.round(100 * p.hp / Math.max(1, p.maxHp)));
      var thumb = p.artUrl
        ? '<div class="pthumb" style="background-image:url(\'' + encodeURI(p.artUrl) + '\')"></div>'
        : '<div class="pthumb pthumb-fallback">' + icon(p.element) + '</div>';
      var buff = p.attackBuff > 0 ? '  ·  <span class="pbuff">⚔ +' + p.attackBuff + '</span>' : '';
      chip.innerHTML = thumb +
        '<div class="pbody">' +
        '<div class="pname">' + icon(p.element) + ' ' + esc(p.name) + '</div>' +
        '<div class="phpbar"><div class="phpfill" style="width:' + pct + '%"></div></div>' +
        '<div class="phptext">HP ' + p.hp + ' / ' + p.maxHp + '  ·  ⚡' + p.speed + buff + '</div>' +
        '</div>';
      host.appendChild(chip);
    });
  }

  // ---- battle stage ----------------------------------------------------
  function renderBattle() {
    showScreen('battleScreen');
    var b = state.run.battle;
    if (!b) { renderMap(); return; }

    // initiative order
    var ib = $('initiativeBar'); ib.innerHTML = '<span class="init-label">Next up:</span>';
    var byId = {};
    b.allies.concat(b.enemies).forEach(function (c) { byId[c.id] = c; });
    (b.order || []).slice(0, 8).forEach(function (id) {
      var c = byId[id]; if (!c) return;
      var pip = el('span', 'init-pip ' + elClass(c.element) + (c.side === 'ENEMY' ? ' enemy' : ''), icon(c.element) + ' ' + esc(c.name));
      ib.appendChild(pip);
    });

    renderSpriteLine($('enemyRow'), b.enemies, 'enemy', b);
    renderSpriteLine($('allyRow'), b.allies, 'ally', b);

    // damage/heal reactions from the previous state snapshot
    animateDiffs(b);
    snapshotUnits(b);

    // log ticker
    var log = $('battleLog'); log.innerHTML = '';
    (b.log || []).slice(-3).reverse().forEach(function (line) { if (line) log.appendChild(el('div', 'lg', esc(line))); });

    // hud
    var ap = $('apDisplay'); ap.innerHTML = '<span class="ap-label">Actions</span>';
    for (var i = 0; i < (b.maxActionPoints || 3); i++) {
      ap.appendChild(el('span', 'ap-pip' + (i < b.actionPoints ? ' full' : '')));
    }
    $('deckCounts').textContent = 'Deck ' + b.deckCount + ' · Discard ' + b.discardCount;

    var over = b.phase === 'WON' || b.phase === 'LOST';
    $('endTurnBtn').classList.toggle('hidden', over);
    $('endTurnBtn').disabled = b.phase !== 'PLAYER_INPUT';

    renderHand(b, over);
    updateHint(b, over);
  }

  function renderSpriteLine(host, units, side, b) {
    host.innerHTML = '';
    units.forEach(function (u, idx) {
      var sp = el('div', 'sprite ' + side + ' ' + elClass(u.element) +
        (u.alive ? '' : ' dead') + (u.id === b.leadId ? ' lead' : ''));
      sp.dataset.id = u.id; sp.dataset.side = u.side;
      sp.style.setProperty('--idle-delay', (idx * 0.45) + 's');
      var pct = Math.max(0, Math.round(100 * u.hp / Math.max(1, u.maxHp)));
      var shield = u.shield > 0 ? '<span class="sp-shield">🛡' + u.shield + '</span>' : '';
      var buff = u.attackBuff > 0 ? '<span class="sp-buff">⚔+' + u.attackBuff + '</span>' : '';
      var body = u.artUrl
        ? '<div class="sp-art"><img src="' + encodeURI(u.artUrl) + '" alt="" draggable="false"></div>'
        : '<div class="sp-art sp-art-fallback"><span>' + icon(u.element) + '</span></div>';
      sp.innerHTML =
        '<div class="sp-plate">' +
          '<div class="sp-name">' + esc(u.name) + ' <span class="sp-el">' + icon(u.element) + '</span></div>' +
          '<div class="sp-hpbar"><div class="sp-hpfill" style="width:' + pct + '%"></div></div>' +
          '<div class="sp-tags"><span class="sp-hp">' + u.hp + '/' + u.maxHp + '</span>' + shield + buff + '</div>' +
        '</div>' +
        body +
        '<div class="sp-shadow"></div>';
      sp.addEventListener('click', function () { onUnitClick(u); });
      host.appendChild(sp);
    });
  }

  function snapshotUnits(b) {
    var snap = {};
    b.allies.concat(b.enemies).forEach(function (u) { snap[u.id] = { hp: u.hp, alive: u.alive }; });
    state.prevUnits = snap;
  }

  function animateDiffs(b) {
    var prev = state.prevUnits || {};
    b.allies.concat(b.enemies).forEach(function (u) {
      var before = prev[u.id];
      if (!before) return;
      var node = document.querySelector('.sprite[data-id="' + u.id + '"]');
      if (!node) return;
      if (u.hp < before.hp) {
        node.classList.add('hurt');
        var amt = el('div', 'sp-float dmg', '-' + (before.hp - u.hp));
        node.appendChild(amt);
        setTimeout(function () { node.classList.remove('hurt'); amt.remove(); }, 900);
      } else if (u.hp > before.hp) {
        node.classList.add('healed');
        var plus = el('div', 'sp-float heal', '+' + (u.hp - before.hp));
        node.appendChild(plus);
        setTimeout(function () { node.classList.remove('healed'); plus.remove(); }, 900);
      }
    });
  }

  // ---- hand ------------------------------------------------------------
  function renderHand(b, over) {
    var hand = $('handRow'); hand.innerHTML = '';
    if (over) {
      var wrap = el('div', 'battle-endwrap');
      wrap.appendChild(el('div', 'battle-endtitle ' + (b.phase === 'WON' ? 'win' : 'lose'),
        b.phase === 'WON' ? 'Victory!' : 'Defeat'));
      var cont = el('button', 'siege-btn primary', b.phase === 'WON' ? 'Claim Rewards' : 'End Expedition');
      cont.addEventListener('click', continueRun);
      wrap.appendChild(cont);
      hand.appendChild(wrap);
      return;
    }
    var n = b.hand.length;
    b.hand.forEach(function (card, i) {
      var effCls = effectClass(card.effect);
      var mid = (n - 1) / 2;
      var c = el('div', 'playcard ' + elClass(card.element) + (card.playable ? '' : ' unplayable') + (card.instanceId === state.selectedCardId ? ' selected' : ''));
      c.style.setProperty('--fan-rot', ((i - mid) * 4) + 'deg');
      c.style.setProperty('--fan-y', (Math.abs(i - mid) * 7) + 'px');
      c.innerHTML = '<div class="pc-cost">' + card.actionCost + '</div>' +
        '<div class="pc-name">' + esc(card.name) + '</div>' +
        '<div class="pc-owner">' + icon(card.element) + ' ' + esc(card.ownerName) + '</div>' +
        '<div class="pc-eff ' + effCls + '">' + effectLabel(card) + '</div>' +
        '<div class="pc-desc">' + esc(card.description || '') + '</div>';
      c.addEventListener('click', function () { onCardClick(card); });
      hand.appendChild(c);
    });
  }

  function effectClass(effect) {
    if (effect === 'DAMAGE') return 'dmg';
    if (effect === 'HEAL') return 'heal';
    if (effect === 'SHIELD') return 'shield';
    return 'buff';
  }
  function effectLabel(card) {
    switch (card.effect) {
      case 'DAMAGE': {
        var boosted = (card.boostedValue != null && card.boostedValue > card.value)
          ? '<span class="pc-boost">' + card.boostedValue + '</span> <s>' + card.value + '</s>'
          : card.value;
        return '⚔ ' + boosted + ' dmg' + (card.target === 'ALL_ENEMIES' ? ' (all)' : '');
      }
      case 'HEAL': return '➕ Heal ' + card.value + (card.target === 'ALLY_ALL' ? ' (all)' : '');
      case 'SHIELD': return '🛡 Shield ' + card.value + (card.target === 'ALLY_ALL' ? ' (all)' : '');
      case 'BUFF_ATK': return '↑ +' + card.value + ' attack (party)';
      case 'BUFF_SPD': return '↑ +' + card.value + ' speed';
      case 'SLOW': return '❄ Slow enemies';
      default: return card.effect;
    }
  }

  function onCardClick(card) {
    var b = state.run.battle;
    if (!b || b.phase !== 'PLAYER_INPUT' || !card.playable) return;
    if (card.needsTarget) {
      if (state.selectedCardId === card.instanceId) { clearSelection(); }
      else { state.selectedCardId = card.instanceId; state.selectedCardNeedsTarget = true; renderBattle(); }
    } else {
      playCard(card.instanceId, null);
    }
  }

  function onUnitClick(u) {
    if (!state.selectedCardId || !state.selectedCardNeedsTarget) return;
    var card = currentCard();
    if (!card) return;
    var wantsEnemy = card.target === 'ENEMY_SINGLE';
    if (wantsEnemy && u.side === 'ENEMY' && u.alive) { playCard(card.instanceId, u.id); }
    else if (!wantsEnemy && u.side === 'PLAYER' && u.alive) { playCard(card.instanceId, u.id); }
  }

  function currentCard() {
    var b = state.run.battle; if (!b) return null;
    return b.hand.find(function (c) { return c.instanceId === state.selectedCardId; });
  }
  function clearSelection() { state.selectedCardId = null; state.selectedCardNeedsTarget = false; renderBattle(); }

  function updateHint(b, over) {
    var hint = $('battleHint');
    if (over) { hint.textContent = ''; return; }
    if (b.phase !== 'PLAYER_INPUT') { hint.textContent = 'Enemies are acting…'; return; }
    var card = currentCard();
    if (card && card.needsTarget) {
      hint.textContent = 'Select a ' + (card.target === 'ENEMY_SINGLE' ? 'target enemy' : 'friendly Siegeling') + ' for ' + card.name + '.';
      highlightTargets(card);
    } else {
      hint.textContent = 'Play cards (' + b.actionPoints + ' actions left) or End Turn.';
    }
  }

  function highlightTargets(card) {
    var wantsEnemy = card.target === 'ENEMY_SINGLE';
    Array.prototype.forEach.call(document.querySelectorAll('.sprite'), function (node) {
      var isEnemy = node.dataset.side === 'ENEMY';
      var alive = !node.classList.contains('dead');
      node.classList.toggle('targetable', alive && (wantsEnemy ? isEnemy : !isEnemy));
    });
  }

  function playCard(cardId, targetId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/battle/play', { method: 'POST', body: { token: token(), cardId: cardId, targetId: targetId } })
      .then(function (run) { state.run = run; state.selectedCardId = null; state.selectedCardNeedsTarget = false; if (run.error) toast(run.error); renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function endTurn() {
    if (state.busy) return; state.busy = true;
    state.selectedCardId = null; state.selectedCardNeedsTarget = false;
    api('/api/siege/battle/end-turn', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function continueRun() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/continue', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- rewards ----------------------------------------------------------
  var REWARD_ICON = { CARD: '🃏', UPGRADE: '⬆️', RECRUIT: '🐾' };

  function renderRewards() {
    showScreen('rewardScreen');
    var grid = $('rewardGrid'); grid.innerHTML = '';
    (state.run.pendingRewards || []).forEach(function (opt) {
      var c = el('div', 'reward-card ' + elClass(opt.element) + ' kind-' + opt.kind);
      var art = opt.artUrl
        ? '<div class="reward-art" style="background-image:url(\'' + encodeURI(opt.artUrl) + '\')"></div>'
        : '<div class="reward-glyph">' + (REWARD_ICON[opt.kind] || '🎁') + '</div>';
      var meta = '';
      if (opt.kind === 'CARD' && opt.cardEffect) {
        meta = '<div class="reward-cardmeta">' + icon(opt.element) + ' ' + esc(opt.cardEffect) + ' · power ' + opt.cardValue + ' · ' + opt.cardCost + ' AP</div>';
      }
      c.innerHTML =
        '<div class="reward-kind">' + esc(kindLabel(opt.kind)) + '</div>' +
        art +
        '<div class="reward-title">' + esc(opt.title) + '</div>' +
        meta +
        '<div class="reward-desc">' + esc(opt.desc) + '</div>';
      c.addEventListener('click', function () { chooseReward(opt.id); });
      grid.appendChild(c);
    });
  }

  function kindLabel(kind) {
    return { CARD: 'New Card', UPGRADE: 'Upgrade', RECRUIT: 'Recruit' }[kind] || 'Reward';
  }

  function chooseReward(optionId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/reward/choose', { method: 'POST', body: { token: token(), optionId: optionId } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- result --------------------------------------------------------
  function renderResult() {
    showScreen('resultScreen');
    var won = state.run.status === 'WON';
    var title = $('resultTitle');
    title.textContent = won ? 'Expedition Won' : 'Expedition Lost';
    title.className = won ? 'win' : 'lose';
    $('resultText').textContent = state.run.lastReward || (won ? 'The Siegelord has fallen.' : 'Your warband was overwhelmed.');
    setToken(null);
    $('resultBtn').textContent = 'Return to Play';
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
