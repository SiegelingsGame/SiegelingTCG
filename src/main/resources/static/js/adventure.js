/* Siege — Siegelings Adventure roguelike client.
 * Talks to /api/siege/**. All rules run server-side; this file renders state
 * and submits actions. Run is addressed by an opaque token in localStorage.
 *
 * Screens: setup (warband select) → branching map (SVG DAG) → battle stage
 * (overlay-art character sprites + fanned card hand) → reward picks → result.
 *
 * Battles are round-based (team Speed decides who acts first). The server
 * streams presentation events (attacks, statuses, KOs) that this client plays
 * back as projectiles and action moments before rendering the final state.
 * Enemy attacks telegraph the notch they target — shown as red markers. */
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
    busy: false
  };

  var EL_ICON = {
    FIRE: '🔥', WATER: '💧', EARTH: '🪨', WIND: '🌪️', ICE: '❄️', SHADOW: '🌑',
    ELECTRIC: '⚡', METAL: '⚙️', UNDEAD: '💀', PSYCHIC: '🔮', POISON: '☠️', LIGHT: '✨', NEUTRAL: '◇'
  };
  var EL_COLOR = {
    FIRE: '#ff501e', WATER: '#3296ff', EARTH: '#b48c50', WIND: '#96ffb4', ICE: '#76e6ff',
    SHADOW: '#9a63d6', ELECTRIC: '#ffe63c', METAL: '#a0aab4', UNDEAD: '#8c78a0',
    PSYCHIC: '#c896ff', POISON: '#78dc50', LIGHT: '#fff0b0', NEUTRAL: '#95a5a6'
  };
  var STATUS_META = {
    BURN: { icon: '🔥', label: 'Burn' },
    SLOW: { icon: '❄️', label: 'Slow' },
    STUN: { icon: '💫', label: 'Stun' },
    SHOCK: { icon: '⚡', label: 'Shock' }
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
  /* Art URLs may already be percent-encoded (Firebase Storage object paths use
   * %2F). encodeURI would double-encode the % and 404 the image, so only
   * HTML/CSS-escape them. */
  function artAttr(url) { return esc(url); }
  function artCss(url) { return esc(String(url == null ? '' : url).replace(/'/g, '%27').replace(/\)/g, '%29')); }
  function elClass(element) { return 'el-' + (element || 'NEUTRAL'); }
  function icon(element) { return EL_ICON[element] || '◇'; }
  function elColor(element) { return EL_COLOR[element] || '#95a5a6'; }

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
    $('knightUltBtn').addEventListener('click', useUltimate);
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
        ? '<div class="sart" style="background-image:url(\'' + artCss(s.artUrl) + '\')"></div>'
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
      .then(function (run) { setToken(run.token); applyRun(run); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- run router ----------------------------------------------------
  function renderRun() {
    var run = state.run;
    if (!run) { loadRoster(); return; }
    $('abandonBtn').classList.toggle('hidden', run.status !== 'ACTIVE');
    if (run.battle) { renderBattle(); return; }
    if (run.status === 'WON' || run.status === 'LOST') { renderResult(); return; }
    if (run.pendingRewards && run.pendingRewards.length) { renderRewards(); return; }
    renderMap();
  }

  /** Applies a fresh server state: plays pending battle events first, then renders. */
  function applyRun(run) {
    var events = run && run.battle && run.battle.events ? run.battle.events : [];
    var hadBattleDom = state.run && state.run.battle && !$('battleScreen').classList.contains('hidden');
    state.run = run;
    if (events.length && hadBattleDom) {
      playEvents(events, function () { renderRun(); });
    } else {
      renderRun();
    }
  }

  // ---- branching map (SVG DAG, boss at the top) ------------------------
  var MAP = { colGap: 96, rowGap: 104, pad: 56, r: 24 };

  function renderMap() {
    showScreen('mapScreen');
    var run = state.run;
    renderPartyStrip($('partyStrip'), run.party, run.knight);
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
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function renderPartyStrip(host, party, knight) {
    host.innerHTML = '';
    if (knight && knight.hp != null) {
      var kchip = el('div', 'party-chip knight-chip ' + elClass(knight.element));
      var kpct = Math.max(0, Math.round(100 * knight.hp / Math.max(1, knight.maxHp)));
      kchip.innerHTML = '<div class="pthumb pthumb-fallback">🛡️</div>' +
        '<div class="pbody">' +
        '<div class="pname">' + icon(knight.element) + ' ' + esc(knight.name) + '</div>' +
        '<div class="phpbar"><div class="phpfill" style="width:' + kpct + '%"></div></div>' +
        '<div class="phptext">Knight HP ' + knight.hp + ' / ' + knight.maxHp + '</div>' +
        '</div>';
      host.appendChild(kchip);
    }
    party.forEach(function (p) {
      var chip = el('div', 'party-chip ' + elClass(p.element) + (p.alive ? '' : ' dead'));
      var pct = Math.max(0, Math.round(100 * p.hp / Math.max(1, p.maxHp)));
      var thumb = p.artUrl
        ? '<div class="pthumb" style="background-image:url(\'' + artCss(p.artUrl) + '\')"></div>'
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

    // round + speed readout
    var ib = $('initiativeBar'); ib.innerHTML = '';
    ib.appendChild(el('span', 'round-chip', 'Round ' + b.roundNumber));
    ib.appendChild(el('span', 'speed-chip' + (b.playerActsFirst ? ' you' : ' them'),
      '⚡ ' + b.playerSpeed + ' vs ' + b.enemySpeed + ' · ' + (b.playerActsFirst ? 'You act first' : 'Enemy acts first')));
    if (b.sweepIncoming) {
      ib.appendChild(el('span', 'sweep-chip', '⚠ Sweep incoming — every notch is threatened'));
    }

    renderKnightPlate(b);
    renderSpriteLine($('enemyRow'), b.enemies, 'enemy', b);
    renderSpriteLine($('allyRow'), b.allies, 'ally', b);

    // log ticker
    var log = $('battleLog'); log.innerHTML = '';
    (b.log || []).slice(-3).reverse().forEach(function (line) { if (line) log.appendChild(el('div', 'lg', esc(line))); });

    // hud
    var ap = $('apDisplay'); ap.innerHTML = '<span class="ap-label">AP</span>';
    for (var i = 0; i < (b.maxActionPoints || 5); i++) {
      ap.appendChild(el('span', 'ap-pip' + (i < b.actionPoints ? ' full' : '')));
    }
    $('deckCounts').textContent = 'Deck ' + b.deckCount + ' · Hand ' + b.hand.length + '/' + (b.handMax || 8) + ' · Discard ' + b.discardCount;

    var over = b.phase === 'WON' || b.phase === 'LOST';
    $('endTurnBtn').classList.toggle('hidden', over);
    $('endTurnBtn').disabled = b.phase !== 'PLAYER_INPUT';

    renderHand(b, over);
    updateHint(b, over);
  }

  function renderKnightPlate(b) {
    var host = $('knightPlate');
    var k = b.knight;
    if (!k || k.hp == null) { host.classList.add('hidden'); return; }
    host.classList.remove('hidden');
    host.className = 'knight-plate ' + elClass(k.element) + (k.hp <= 0 ? ' dead' : '');
    var pct = Math.max(0, Math.round(100 * k.hp / Math.max(1, k.maxHp)));
    var chargePct = Math.min(100, Math.round(100 * k.charge / Math.max(1, k.ultCost)));
    host.innerHTML =
      '<div class="kp-head"><span class="kp-name">🛡️ ' + esc(k.name) + '</span>' +
      '<span class="kp-hp">' + k.hp + '/' + k.maxHp + '</span></div>' +
      '<div class="kp-hpbar"><div class="kp-hpfill" style="width:' + pct + '%"></div></div>' +
      '<div class="kp-chargebar" title="Knight Ultimate Charge"><div class="kp-chargefill" style="width:' + chargePct + '%"></div>' +
      '<span class="kp-chargetext">⚡ ' + k.charge + '/' + k.ultCost + '</span></div>';
    var ult = $('knightUltBtn');
    ult.classList.toggle('hidden', b.phase === 'WON' || b.phase === 'LOST');
    ult.disabled = !(k.ultReady && b.phase === 'PLAYER_INPUT');
    ult.textContent = k.ultReady ? '⚡ ULTIMATE' : '⚡ Ult ' + k.charge + '/' + k.ultCost;
  }

  function renderSpriteLine(host, units, side, b) {
    host.innerHTML = '';
    var targeted = b.targetedPositions || [];
    units.forEach(function (u, idx) {
      var isThreatened = side === 'ally' && u.alive &&
        (targeted.indexOf(u.position) >= 0 || b.sweepIncoming);
      var sp = el('div', 'sprite ' + side + ' ' + elClass(u.element) +
        (u.alive ? '' : ' dead') + (u.id === b.leadId ? ' lead' : '') +
        (isThreatened ? ' threatened' : ''));
      sp.dataset.id = u.id; sp.dataset.side = u.side;
      sp.style.setProperty('--idle-delay', (idx * 0.45) + 's');
      var pct = Math.max(0, Math.round(100 * u.hp / Math.max(1, u.maxHp)));
      var shield = u.shield > 0 ? '<span class="sp-shield">🛡' + u.shield + '</span>' : '';
      var buff = u.attackBuff > 0 ? '<span class="sp-buff">⚔+' + u.attackBuff + '</span>' : '';
      var statusChips = (u.statuses || []).map(function (s) {
        var meta = STATUS_META[s];
        return meta ? '<span class="sp-status st-' + s + '" title="' + meta.label + '">' + meta.icon + '</span>' : '';
      }).join('');
      var body = u.artUrl
        ? '<div class="sp-art"><img src="' + artAttr(u.artUrl) + '" alt="" draggable="false" ' +
          'onerror="this.parentNode.className=\'sp-art sp-art-fallback\';this.outerHTML=\'<span>' + icon(u.element) + '</span>\'"></div>'
        : '<div class="sp-art sp-art-fallback"><span>' + icon(u.element) + '</span></div>';
      var intent = '';
      if (side === 'enemy' && u.alive && u.intent) {
        intent = '<div class="sp-intent">' + intentLabel(u.intent, b) + '</div>';
      }
      var notch = side === 'ally' && u.position >= 0 ? '<div class="sp-notch">' + (u.position + 1) + '</div>' : '';
      sp.innerHTML =
        intent +
        '<div class="sp-plate">' +
          '<div class="sp-name">' + esc(u.name) + ' <span class="sp-el">' + icon(u.element) + '</span></div>' +
          '<div class="sp-hpbar"><div class="sp-hpfill" style="width:' + pct + '%"></div></div>' +
          '<div class="sp-tags"><span class="sp-hp">' + u.hp + '/' + u.maxHp + '</span>' + shield + buff + statusChips + '</div>' +
        '</div>' +
        body +
        (isThreatened ? '<div class="sp-target-ring"><span class="sp-target-x">▼</span></div>' : '') +
        '<div class="sp-shadow"></div>' +
        notch;
      sp.addEventListener('click', function () { onUnitClick(u); });
      host.appendChild(sp);
    });
  }

  function intentLabel(intent, b) {
    if (intent.effect === 'HEAL') return '💚 ' + esc(intent.name);
    if (intent.effect === 'SHIELD') return '🛡 ' + esc(intent.name);
    if (intent.effect !== 'DAMAGE') return esc(intent.name);
    if (intent.sweep) return '⚔ ' + esc(intent.name) + ' ' + intent.value + ' → ALL';
    var mark = null;
    (b.allies || []).forEach(function (a) { if (a.alive && a.position === intent.position) mark = a; });
    var who = mark ? esc(mark.name) : (intent.position >= 0 ? 'notch ' + (intent.position + 1) : 'the Knight');
    return '⚔ ' + esc(intent.name) + ' ' + intent.value + ' → ' + who;
  }

  // ---- event playback (projectiles + action moments) --------------------
  function playEvents(events, done) {
    state.busy = true;
    var stage = $('battleStage');
    // Compress long sequences so playback stays snappy.
    var scale = events.length > 10 ? 10 / events.length : 1;
    var i = 0;

    function step() {
      if (i >= events.length) {
        hideBanner();
        state.busy = false;
        done();
        return;
      }
      var ev = events[i++];
      var wait = playEvent(ev, stage) * scale;
      setTimeout(step, Math.max(60, wait));
    }
    step();
  }

  function playEvent(ev, stage) {
    switch (ev.type) {
      case 'round':
        showBanner('Round ' + ev.round + ' — ⚡' + ev.playerSpeed + ' vs ' + ev.enemySpeed +
          ' — ' + (ev.playerFirst ? 'You act first' : 'Enemy acts first'), ev.playerFirst ? 'you' : 'them');
        return 950;
      case 'card':
        showBanner(nameOf(ev.sourceId) + ' uses ' + ev.name, 'you', ev.element);
        return 550;
      case 'enemyAct':
        showBanner(nameOf(ev.sourceId) + ' uses ' + ev.name, 'them', ev.element);
        flashSprite(ev.sourceId, 'acting');
        return 700;
      case 'ultimate':
        showBanner('⚡ ' + ev.name + '!', 'you', ev.element);
        return 800;
      case 'hit':
        fireProjectile(stage, ev.sourceId, ev.targetId, ev.element, function () {
          impact(ev.targetId, ev.amount, ev.ko);
        });
        return 720;
      case 'burn':
        flashSprite(ev.targetId, 'hurt');
        floatText(ev.targetId, '-' + ev.amount + ' 🔥', 'dmg');
        return 420;
      case 'heal':
        flashSprite(ev.targetId, 'healed');
        floatText(ev.targetId, '+' + ev.amount, 'heal');
        return 420;
      case 'shield':
        flashSprite(ev.targetId, 'shielded');
        floatText(ev.targetId, '🛡+' + ev.amount, 'shield');
        return 400;
      case 'buff':
        showBanner(ev.kind === 'atk' ? 'The party gains +' + ev.amount + ' attack!' : '+' + ev.amount + ' speed!', 'you');
        return 480;
      case 'status': {
        var meta = STATUS_META[ev.status] || { icon: '', label: ev.status };
        flashSprite(ev.targetId, 'statused');
        floatText(ev.targetId, meta.icon + ' ' + meta.label + '!', 'status');
        return 480;
      }
      case 'swap':
        flashSprite(ev.aId, 'swapping');
        flashSprite(ev.bId, 'swapping');
        showBanner(nameOf(ev.aId) + ' ⇄ ' + nameOf(ev.bId) + ' swap notches', 'you');
        return 550;
      case 'whiff':
        showBanner(nameOf(ev.sourceId) + '\'s ' + ev.name + ' hits empty ground!', 'them');
        return 620;
      case 'stunned':
        flashSprite(ev.sourceId, 'statused');
        floatText(ev.sourceId, '💫 Stunned!', 'status');
        return 480;
      case 'knightHit':
        floatKnight('-' + ev.amount);
        return 450;
      case 'charge':
        floatKnight('+' + ev.amount + ' ⚡');
        return 260;
      default:
        return 60;
    }
  }

  function nameOf(id) {
    var b = state.run && state.run.battle;
    if (!b) return '';
    var all = (b.allies || []).concat(b.enemies || []);
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) return all[i].name; }
    if (b.knight && b.knight.id === id) return b.knight.name;
    return '';
  }

  function spriteOf(id) { return document.querySelector('.sprite[data-id="' + id + '"]'); }

  function showBanner(text, side, element) {
    var banner = $('actionBanner');
    banner.textContent = text;
    banner.className = 'action-banner show ' + (side || '');
    banner.style.borderColor = element ? elColor(element) : '';
    clearTimeout(showBanner._h);
    showBanner._h = setTimeout(hideBanner, 1400);
  }
  function hideBanner() {
    var banner = $('actionBanner');
    if (banner) banner.className = 'action-banner';
  }

  function flashSprite(id, cls) {
    var node = spriteOf(id);
    if (!node) return;
    node.classList.add(cls);
    setTimeout(function () { node.classList.remove(cls); }, 700);
  }

  function floatText(id, text, cls) {
    var node = spriteOf(id);
    if (!node) return;
    var f = el('div', 'sp-float ' + cls, esc(text));
    node.appendChild(f);
    setTimeout(function () { f.remove(); }, 900);
  }

  function floatKnight(text) {
    var plate = $('knightPlate');
    if (!plate || plate.classList.contains('hidden')) return;
    plate.classList.add('kp-pulse');
    var f = el('div', 'sp-float dmg', esc(text));
    f.style.top = '-4px';
    plate.appendChild(f);
    setTimeout(function () { plate.classList.remove('kp-pulse'); f.remove(); }, 800);
  }

  function impact(targetId, amount, ko) {
    var node = spriteOf(targetId);
    if (node) {
      node.classList.add('hurt');
      setTimeout(function () { node.classList.remove('hurt'); if (ko) node.classList.add('dead'); }, 480);
      floatText(targetId, '-' + amount, 'dmg');
    } else if (state.run && state.run.battle && state.run.battle.knight && state.run.battle.knight.id === targetId) {
      floatKnight('-' + amount);
    }
  }

  /** Element-colored orb that flies from the source sprite to the target. */
  function fireProjectile(stage, sourceId, targetId, element, onArrive) {
    var src = spriteOf(sourceId), dst = spriteOf(targetId);
    if (!src || !dst || !stage) { if (onArrive) onArrive(); return; }
    var sRect = src.getBoundingClientRect(), dRect = dst.getBoundingClientRect(), gRect = stage.getBoundingClientRect();
    var x0 = sRect.left + sRect.width / 2 - gRect.left, y0 = sRect.top + sRect.height * 0.55 - gRect.top;
    var x1 = dRect.left + dRect.width / 2 - gRect.left, y1 = dRect.top + dRect.height * 0.55 - gRect.top;
    var orb = el('div', 'projectile');
    var color = elColor(element);
    orb.style.background = 'radial-gradient(circle at 35% 30%, #fff, ' + color + ')';
    orb.style.boxShadow = '0 0 14px ' + color + ', 0 0 30px ' + color;
    orb.style.left = x0 + 'px'; orb.style.top = y0 + 'px';
    stage.appendChild(orb);
    var anim = orb.animate([
      { transform: 'translate(-50%,-50%) scale(.6)', offset: 0 },
      { transform: 'translate(calc(-50% + ' + ((x1 - x0) / 2) + 'px), calc(-50% + ' + ((y1 - y0) / 2 - 34) + 'px)) scale(1.15)', offset: 0.5 },
      { transform: 'translate(calc(-50% + ' + (x1 - x0) + 'px), calc(-50% + ' + (y1 - y0) + 'px)) scale(.9)', offset: 1 }
    ], { duration: 340, easing: 'ease-in' });
    anim.onfinish = function () {
      orb.remove();
      var burst = el('div', 'impact-burst');
      burst.style.left = x1 + 'px'; burst.style.top = y1 + 'px';
      burst.style.background = 'radial-gradient(circle, ' + color + ', transparent 65%)';
      stage.appendChild(burst);
      setTimeout(function () { burst.remove(); }, 420);
      if (onArrive) onArrive();
    };
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
      var statusLine = '';
      if (card.status && card.statusChance) {
        var meta = STATUS_META[card.status] || { icon: '', label: card.status };
        statusLine = '<div class="pc-status">' + meta.icon + ' ' + card.statusChance + '% ' + meta.label + '</div>';
      }
      c.innerHTML = '<div class="pc-cost' + (card.actionCost === 0 ? ' free' : '') + '">' + card.actionCost + '</div>' +
        '<div class="pc-name">' + esc(card.name) + '</div>' +
        '<div class="pc-owner">' + icon(card.element) + ' ' + esc(card.ownerName) + '</div>' +
        '<div class="pc-eff ' + effCls + '">' + effectLabel(card) + '</div>' +
        statusLine +
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
      case 'SWAP': return '⇄ Swap notches';
      default: return card.effect;
    }
  }

  function onCardClick(card) {
    var b = state.run.battle;
    if (!b || b.phase !== 'PLAYER_INPUT' || !card.playable || state.busy) return;
    if (card.needsTarget) {
      if (state.selectedCardId === card.instanceId) { clearSelection(); }
      else { state.selectedCardId = card.instanceId; state.selectedCardNeedsTarget = true; renderBattle(); }
    } else {
      playCard(card.instanceId, null);
    }
  }

  function onUnitClick(u) {
    if (!state.selectedCardId || !state.selectedCardNeedsTarget || state.busy) return;
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
      hint.textContent = card.effect === 'SWAP'
        ? 'Select the Siegeling to swap notches with.'
        : 'Select a ' + (card.target === 'ENEMY_SINGLE' ? 'target enemy' : 'friendly Siegeling') + ' for ' + card.name + '.';
      highlightTargets(card);
    } else {
      hint.textContent = 'Play cards (' + b.actionPoints + ' AP left) or End Turn.';
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
      .then(function (run) {
        state.selectedCardId = null; state.selectedCardNeedsTarget = false;
        if (run.error) toast(run.error);
        state.busy = false;
        applyRun(run);
      })
      .catch(function (e) { toast(e.message); state.busy = false; });
  }

  function endTurn() {
    if (state.busy) return; state.busy = true;
    state.selectedCardId = null; state.selectedCardNeedsTarget = false;
    api('/api/siege/battle/end-turn', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.busy = false; applyRun(run); })
      .catch(function (e) { toast(e.message); state.busy = false; });
  }

  function useUltimate() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/battle/ultimate', { method: 'POST', body: { token: token() } })
      .then(function (run) { if (run.error) toast(run.error); state.busy = false; applyRun(run); })
      .catch(function (e) { toast(e.message); state.busy = false; });
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
        ? '<div class="reward-art" style="background-image:url(\'' + artCss(opt.artUrl) + '\')"></div>'
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
