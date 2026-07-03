/* Siege — Siegelings Adventure roguelike client.
 * Talks to /api/siege/**. All rules run server-side; this file renders state
 * and submits actions. Run is addressed by an opaque token in localStorage.
 *
 * Screens: setup (paged: knight → warband) → branching map (SVG DAG) →
 * battle stage / interactive rest camp / cache dig minigame → rewards → result.
 *
 * Battles are round-based (team Speed decides who acts first — shown as a
 * race track). The server streams presentation events that this client plays
 * back as projectiles and action moments. Enemy attacks telegraph the notch
 * they target: red markers on threatened spaces. */
(function () {
  'use strict';

  var TOKEN_KEY = 'siegeToken';
  var state = {
    roster: null,
    run: null,
    knightId: null,
    party: [],          // selected siegeling ids (max 3)
    elementFilter: 'ALL',
    setupStep: 'knight',
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
  var NODE_ICON = { BATTLE: '⚔️', ELITE: '🔺', REST: '🏕️', TREASURE: '💎', BROKER: '🐾', BOSS: '👑' };
  var NODE_TINT = { BATTLE: '#8fa3bf', ELITE: '#ff6e6e', REST: '#7ee787', TREASURE: '#ffd066', BROKER: '#c896ff', BOSS: '#ff9a3c' };
  var CAMP_ICON = { REST: '🔥', SHOP_CARD: '🃏', SHOP_HEAL: '🍲', SHOP_UPGRADE: '⚒️', BROKER: '🐾' };
  var PASSIVE_META = {
    SHIELD: { icon: '🛡', name: 'Bulwark' },
    ATTACK: { icon: '⚔', name: 'Warlord' },
    SPEED: { icon: '⚡', name: 'Vanguard' },
    HEALTH: { icon: '❤', name: 'Warden' },
    LOOT: { icon: '🪙', name: 'Quartermaster' }
  };

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
    ['loadingScreen', 'setupScreen', 'mapScreen', 'campScreen', 'cacheScreen', 'brokerScreen', 'battleScreen', 'rewardScreen', 'resultScreen'].forEach(function (s) {
      var node = $(s); if (node) node.classList.toggle('hidden', s !== id);
    });
    // Battle and map are static, full-viewport screens (no page scroll —
    // only their own internal regions, like the map canvas, scroll).
    document.body.dataset.screen = id;
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
      state.setupStep = 'knight';
      renderSetup();
    }).catch(function (e) { toast(e.message); });
  }

  function wireStaticButtons() {
    $('knightNextBtn').addEventListener('click', function () { state.setupStep = 'party'; renderSetup(); });
    $('partyBackBtn').addEventListener('click', function () { state.setupStep = 'knight'; renderSetup(); });
    $('startRunBtn').addEventListener('click', startRun);
    $('endTurnBtn').addEventListener('click', endTurn);
    $('knightUltBtn').addEventListener('click', useUltimate);
    $('rewardSkipBtn').addEventListener('click', function () { chooseReward('skip'); });
    $('resultBtn').addEventListener('click', function () { setToken(null); location.href = '/play'; });
    $('campLeaveBtn').addEventListener('click', campLeave);
    $('cacheDigBtn').addEventListener('click', cacheDig);
    $('cacheTakeBtn').addEventListener('click', cacheTake);
    $('brokerLeaveBtn').addEventListener('click', brokerLeave);
    $('battleLog').addEventListener('click', function () { toggleLedger(true); });
    $('ledgerClose').addEventListener('click', function () { toggleLedger(false); });
    $('unitModalClose').addEventListener('click', closeUnitModal);
    $('unitModal').addEventListener('click', function (e) { if (e.target === $('unitModal')) closeUnitModal(); });
    $('abandonBtn').addEventListener('click', function () {
      if (confirm('Abandon this expedition?')) { setToken(null); state.run = null; state.party = []; state.knightId = null; loadRoster(); }
    });
  }

  // ---- team select (paged: knight → warband) ---------------------------
  function renderSetup() {
    showScreen('setupScreen');
    $('abandonBtn').classList.add('hidden');
    var onKnight = state.setupStep === 'knight';
    $('setupStepKnight').classList.toggle('hidden', !onKnight);
    $('setupStepParty').classList.toggle('hidden', onKnight);
    $('stepDotKnight').className = 'setup-step' + (onKnight ? ' active' : ' done');
    $('stepDotParty').className = 'setup-step' + (onKnight ? '' : ' active');
    if (onKnight) renderKnightStep(); else renderPartyStep();
  }

  function specSummary(spec) {
    if (!spec) return '';
    switch (spec.effect) {
      case 'DAMAGE': return '⚔ ' + spec.value + ' dmg · ' + spec.actionCost + ' AP';
      case 'HEAL': return '➕ heal ' + spec.value + ' · ' + spec.actionCost + ' AP';
      case 'SHIELD': return '🛡 shield ' + spec.value + ' · ' + spec.actionCost + ' AP';
      case 'BUFF_ATK': return '↑ +' + spec.value + ' attack · ' + spec.actionCost + ' AP';
      case 'BUFF_SPD': return '↑ +' + spec.value + ' speed · ' + spec.actionCost + ' AP';
      case 'SLOW': return '❄ slow · ' + spec.actionCost + ' AP';
      case 'SWAP': return '⇄ swap notches · ' + spec.actionCost + ' AP';
      case 'EVOLVE': return '🌟 evolve · ' + spec.actionCost + ' AP';
      default: return spec.effect;
    }
  }

  function renderKnightStep() {
    var r = state.roster;
    var kg = $('knightGrid'); kg.innerHTML = '';
    r.knights.forEach(function (k) {
      var c = el('div', 'knight-card ' + elClass(k.element) + (k.id === state.knightId ? ' sel' : ''));
      var summary = specSummary(k.active);
      var pm = PASSIVE_META[k.passiveKind];
      var passiveChip = pm
        ? '<span class="kpassive-chip pk-' + k.passiveKind + '">' + pm.icon + ' ' + esc(k.passiveName || pm.name) + '</span>'
        : '';
      c.innerHTML = '<div class="kname">' + icon(k.element) + ' ' + esc(k.name) + '</div>' +
        '<div class="kability"><span class="kability-name">' + esc(k.activeName) + '</span>' +
        (summary ? ' <span class="kability-sum">' + summary + '</span>' : '') + '</div>' +
        (k.activeDesc ? '<div class="kdesc">' + esc(k.activeDesc) + '</div>' : '') +
        '<div class="kpassive">' + passiveChip + ' ' + esc(k.passive || '') + '</div>';
      c.addEventListener('click', function () {
        state.knightId = k.id;
        renderKnightStep();
      });
      kg.appendChild(c);
    });
    var kn = r.knights.find(function (k) { return k.id === state.knightId; });
    $('knightNextBtn').disabled = !kn;
    $('knightSummary').textContent = kn ? (kn.name + ' — ' + kn.activeName) : 'Select a SiegeKnight.';
  }

  function renderPartyStep() {
    var r = state.roster;
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
        '<button class="info-btn" type="button" title="View cards">ⓘ</button>' +
        art +
        '<div class="sname">' + esc(s.name) + (s.evolves ? ' <span class="evo-tag" title="Its Evolution card joins your battle deck — play it for 2 AP to evolve">EVO ↑</span>' : '') + '</div>' +
        '<div class="schip">' + icon(s.element) + ' ' + esc(s.element) + '</div>' +
        '<div class="sstats"><span>❤ ' + s.hp + '</span><span>⚡ ' + s.speed + '</span><span>🃏 ' + s.moveCount + '</span></div>';
      c.addEventListener('click', function () { toggleSiegling(s.id); });
      c.querySelector('.info-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        showUnitModal({
          name: s.name, element: s.element, artUrl: s.artUrl,
          subtitle: '❤ ' + s.hp + ' · ⚡ ' + s.speed + (s.evolves ? ' · Evolution card in battle deck (2 AP)' : ''),
          cards: s.moves || []
        });
      });
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
    $('setupSummary').textContent = 'Warband (' + state.party.length + '/' + need + '): ' + (names.join(', ') || '—');
  }

  function startRun() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/run/new', { method: 'POST', body: { knightId: state.knightId, sieglingIds: state.party } })
      .then(function (run) { setToken(run.token); applyRun(run); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- unit detail modal (cards + abilities) ---------------------------
  function showUnitModal(u) {
    var body = $('unitModalBody');
    var art = u.artUrl
      ? '<div class="um-art" style="background-image:url(\'' + artCss(u.artUrl) + '\')"></div>'
      : '<div class="um-art um-art-fallback">' + icon(u.element) + '</div>';
    var cards = (u.cards || []).map(function (spec) {
      var status = spec.status && spec.statusChance
        ? '<span class="um-status">' + (STATUS_META[spec.status] || {}).icon + ' ' + spec.statusChance + '% ' + (STATUS_META[spec.status] || {}).label + '</span>'
        : '';
      return '<div class="um-card ' + elClass(spec.element) + '">' +
        '<span class="um-cost">' + spec.actionCost + '</span>' +
        '<div class="um-card-main"><div class="um-card-name">' + icon(spec.element) + ' ' + esc(spec.name) + '</div>' +
        '<div class="um-card-eff">' + specSummary(spec) + ' ' + status + '</div>' +
        (spec.description ? '<div class="um-card-desc">' + esc(spec.description) + '</div>' : '') +
        '</div></div>';
    }).join('');
    body.innerHTML =
      '<div class="um-head ' + elClass(u.element) + '">' + art +
      '<div><div class="um-name">' + icon(u.element) + ' ' + esc(u.name) + '</div>' +
      (u.subtitle ? '<div class="um-sub">' + esc(u.subtitle) + '</div>' : '') + '</div></div>' +
      '<div class="um-cards-title">' + (u.cards && u.cards.length ? 'Cards & abilities' : 'No cards') + '</div>' +
      '<div class="um-cards">' + cards + '</div>';
    $('unitModal').classList.remove('hidden');
  }
  function closeUnitModal() { $('unitModal').classList.add('hidden'); }

  // ---- run router ----------------------------------------------------
  function renderRun() {
    var run = state.run;
    if (!run) { loadRoster(); return; }
    $('abandonBtn').classList.toggle('hidden', run.status !== 'ACTIVE');
    if (run.battle) { renderBattle(); return; }
    if (run.status === 'WON' || run.status === 'LOST') { renderResult(); return; }
    if (run.pendingRewards && run.pendingRewards.length) { renderRewards(); return; }
    if (run.camp) { renderCamp(); return; }
    if (run.cache) { renderCache(); return; }
    if (run.broker) { renderBroker(); return; }
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
    $('mapGold').textContent = '🪙 ' + (run.gold || 0);
    $('mapReward').textContent = run.lastReward || '';
    $('mapReward').classList.toggle('hidden', !run.lastReward);
    $('mapDeckCount').textContent = '🃏 ' + (run.deckSize || '—') + (run.checkpoint ? '  ·  💾 saved' : '');
    $('mapHint').textContent = run.currentNodeId < 0 ? 'Choose where to begin' : 'Choose your path';

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

  /** Compact party chips (tap to inspect cards & abilities). */
  function renderPartyStrip(host, party, knight) {
    host.innerHTML = '';
    if (knight && knight.hp != null) {
      var kchip = el('div', 'party-chip knight-chip ' + elClass(knight.element));
      var kpct = Math.max(0, Math.round(100 * knight.hp / Math.max(1, knight.maxHp)));
      kchip.innerHTML = '<div class="pthumb pthumb-fallback">🛡️</div>' +
        '<div class="pbody">' +
        '<div class="pname">' + esc(knight.name) + '</div>' +
        '<div class="phpbar"><div class="phpfill" style="width:' + kpct + '%"></div></div>' +
        '<div class="phptext">' + knight.hp + '/' + knight.maxHp + '</div>' +
        '</div>';
      kchip.addEventListener('click', function () {
        showUnitModal({
          name: knight.name, element: knight.element, artUrl: knight.artUrl,
          subtitle: 'SiegeKnight · HP ' + knight.hp + '/' + knight.maxHp + ' · ' + (knight.passive || ''),
          cards: knight.activeSpec ? [knight.activeSpec] : []
        });
      });
      host.appendChild(kchip);
    }
    party.forEach(function (p) {
      var chip = el('div', 'party-chip ' + elClass(p.element) + (p.alive ? '' : ' dead'));
      var pct = Math.max(0, Math.round(100 * p.hp / Math.max(1, p.maxHp)));
      var thumb = p.artUrl
        ? '<div class="pthumb" style="background-image:url(\'' + artCss(p.artUrl) + '\')"></div>'
        : '<div class="pthumb pthumb-fallback">' + icon(p.element) + '</div>';
      chip.innerHTML = thumb +
        '<div class="pbody">' +
        '<div class="pname">' + esc(p.name) + ' <span class="pinfo">ⓘ</span></div>' +
        '<div class="phpbar"><div class="phpfill" style="width:' + pct + '%"></div></div>' +
        '<div class="phptext">' + p.hp + '/' + p.maxHp + ' · ⚡' + p.speed + '</div>' +
        '</div>';
      chip.addEventListener('click', function () {
        showUnitModal({
          name: p.name, element: p.element, artUrl: p.artUrl,
          subtitle: 'HP ' + p.hp + '/' + p.maxHp + ' · ⚡ ' + p.speed,
          cards: p.cards || []
        });
      });
      host.appendChild(chip);
    });
  }

  // ---- rest camp (interactive stop) -------------------------------------
  function renderCamp() {
    showScreen('campScreen');
    var run = state.run;
    $('campNote').textContent = run.camp.note || '';
    $('campGold').textContent = '🪙 ' + (run.gold || 0);
    $('campReward').textContent = run.lastReward || '';

    // party silhouettes around the fire
    var cp = $('campParty'); cp.innerHTML = '';
    (run.party || []).forEach(function (p, i) {
      if (!p.alive) return;
      var fig = p.artUrl
        ? el('div', 'camp-fig', '<img src="' + artAttr(p.artUrl) + '" alt="">')
        : el('div', 'camp-fig camp-fig-fallback', icon(p.element));
      fig.style.setProperty('--fig-i', i);
      cp.appendChild(fig);
    });

    var grid = $('campGrid'); grid.innerHTML = '';
    (run.camp.options || []).forEach(function (opt) {
      var canUse = !opt.used && opt.affordable;
      var c = el('div', 'camp-card ' + elClass(opt.element) + ' kind-' + opt.kind + (opt.used ? ' used' : '') + (canUse ? '' : ' locked'));
      var art = opt.artUrl
        ? '<div class="camp-art" style="background-image:url(\'' + artCss(opt.artUrl) + '\')"></div>'
        : '<div class="camp-glyph">' + (CAMP_ICON[opt.kind] || '🎁') + '</div>';
      var costChip = opt.cost > 0 ? '<span class="camp-cost' + (opt.affordable ? '' : ' broke') + '">🪙 ' + opt.cost + '</span>' : '<span class="camp-cost free">FREE</span>';
      c.innerHTML =
        '<div class="camp-card-head">' + costChip + (opt.used ? '<span class="camp-used">✓ used</span>' : '') + '</div>' +
        art +
        '<div class="camp-card-title">' + esc(opt.title) + '</div>' +
        '<div class="camp-card-desc">' + esc(opt.desc) + '</div>';
      if (canUse) c.addEventListener('click', function () { campChoose(opt.id); });
      grid.appendChild(c);
    });
  }

  function campChoose(optionId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/camp/choose', { method: 'POST', body: { token: token(), optionId: optionId } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function campLeave() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/camp/leave', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- cache dig minigame -----------------------------------------------
  function renderCache() {
    showScreen('cacheScreen');
    var run = state.run;
    var c = run.cache;
    $('cacheLoot').innerHTML = 'Unbanked loot: <strong>🪙 ' + c.loot + '</strong> · Wallet: 🪙 ' + (run.gold || 0);
    $('cacheRiskFill').style.width = c.bustChance + '%';
    $('cacheRiskText').textContent = 'Collapse risk: ' + c.bustChance + '% · Dig ' + c.digs + '/' + c.maxDigs;
    $('cacheReward').textContent = run.lastReward || '';
    $('cacheChest').textContent = c.digs === 0 ? '🪙' : (c.digs >= 3 ? '💎' : '💰');
  }

  function cacheDig() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/cache/dig', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function cacheTake() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/cache/take', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- broker stall (recruit or swap Siegelings) --------------------------
  function renderBroker() {
    showScreen('brokerScreen');
    var run = state.run;
    var b = run.broker;
    $('brokerGold').textContent = '🪙 ' + (run.gold || 0);
    $('brokerReward').textContent = run.lastReward || '';

    var grid = $('brokerGrid'); grid.innerHTML = '';
    (b.offers || []).forEach(function (offer) {
      var c = el('div', 'camp-card broker-offer ' + elClass(offer.element) + (offer.used ? ' used' : ''));
      var art = offer.artUrl
        ? '<div class="camp-art" style="background-image:url(\'' + artCss(offer.artUrl) + '\')"></div>'
        : '<div class="camp-glyph">' + icon(offer.element) + '</div>';
      var stats = offer.hp != null ? '<div class="camp-card-desc">❤ ' + offer.hp + ' · ⚡ ' + offer.speed +
        (offer.evolves ? ' · <span class="evo-tag">EVO ↑</span>' : '') + '</div>' : '';
      c.innerHTML =
        '<div class="camp-card-head"><button class="info-btn broker-info" type="button">ⓘ</button>' +
        (offer.used ? '<span class="camp-used">✓ hired</span>' : '') + '</div>' +
        art +
        '<div class="camp-card-title">' + esc(offer.name) + '</div>' +
        stats +
        (offer.used ? '' :
          '<div class="broker-actions">' +
          '<button class="siege-btn broker-btn hire" type="button"' +
            ((run.gold >= b.hireCost && !b.partyFull) ? '' : ' disabled') + '>Hire 🪙' + b.hireCost + '</button>' +
          '<button class="siege-btn broker-btn swap" type="button"' + (run.gold >= b.swapCost ? '' : ' disabled') + '>Swap 🪙' + b.swapCost + '</button>' +
          '</div><div class="broker-swap-row hidden"></div>');
      c.querySelector('.broker-info').addEventListener('click', function (e) {
        e.stopPropagation();
        showUnitModal({
          name: offer.name, element: offer.element, artUrl: offer.artUrl,
          subtitle: '❤ ' + offer.hp + ' · ⚡ ' + offer.speed + (offer.evolves ? ' · Evolution card in battle deck' : ''),
          cards: offer.moves || []
        });
      });
      if (!offer.used) {
        var hireBtn = c.querySelector('.broker-btn.hire');
        var swapBtn = c.querySelector('.broker-btn.swap');
        var swapRow = c.querySelector('.broker-swap-row');
        hireBtn.addEventListener('click', function () { brokerHire(offer.id, null); });
        swapBtn.addEventListener('click', function () {
          // Pick which party member is released in the trade.
          swapRow.classList.toggle('hidden');
          if (!swapRow.childNodes.length) {
            (run.party || []).forEach(function (p) {
              var pb = el('button', 'siege-btn broker-member ' + elClass(p.element), '⇄ ' + esc(p.name));
              pb.addEventListener('click', function () { brokerHire(offer.id, p.id); });
              swapRow.appendChild(pb);
            });
          }
        });
      }
      grid.appendChild(c);
    });
  }

  function brokerHire(optionId, replaceId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/broker/hire', { method: 'POST', body: { token: token(), optionId: optionId, replaceId: replaceId } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function brokerLeave() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/broker/leave', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  // ---- battle stage ----------------------------------------------------
  function renderBattle() {
    showScreen('battleScreen');
    var b = state.run.battle;
    if (!b) { renderMap(); return; }

    renderKnightPlate(b);
    renderSpeedTrack(b);
    renderSpriteLine($('enemyRow'), b.enemies, 'enemy', b);
    renderSpriteLine($('allyRow'), b.allies, 'ally', b);

    // log ticker (tap to expand the full turn ledger)
    var log = $('battleLog'); log.innerHTML = '';
    (b.log || []).slice(-2).reverse().forEach(function (line) { if (line) log.appendChild(el('div', 'lg', esc(line))); });
    log.appendChild(el('div', 'lg-more', '☰ ledger'));
    if (!$('ledgerPanel').classList.contains('hidden')) renderLedger(b);

    // hud
    var ap = $('apDisplay'); ap.innerHTML = '<span class="ap-label">AP</span>';
    for (var i = 0; i < (b.maxActionPoints || 5); i++) {
      ap.appendChild(el('span', 'ap-pip' + (i < b.actionPoints ? ' full' : '')));
    }
    $('deckCounts').textContent = '🃏' + b.deckCount + ' · ✋' + b.hand.length + ' · 🗑' + b.discardCount;

    var over = b.phase === 'WON' || b.phase === 'LOST';
    $('endTurnBtn').classList.toggle('hidden', over);
    $('endTurnBtn').disabled = b.phase !== 'PLAYER_INPUT';

    renderHand(b, over);
    updateHint(b, over);
  }

  // ---- expandable turn ledger --------------------------------------------
  function toggleLedger(open) {
    var panel = $('ledgerPanel');
    panel.classList.toggle('hidden', !open);
    if (open && state.run && state.run.battle) renderLedger(state.run.battle);
  }

  /** Every action of the battle, grouped by round, with the card behind it. */
  function renderLedger(b) {
    var body = $('ledgerBody'); body.innerHTML = '';
    var entries = b.turnLog || [];
    if (!entries.length) { body.appendChild(el('div', 'ledger-empty', 'No actions yet.')); return; }
    var lastRound = null;
    entries.forEach(function (e) {
      if (e.round !== lastRound) {
        lastRound = e.round;
        body.appendChild(el('div', 'ledger-round', '— Round ' + e.round + ' —'));
      }
      var costChip = e.cost >= 0 ? '<span class="ledger-cost">' + e.cost + ' AP</span>' : '';
      var cardChip = e.card ? '<span class="ledger-card">🃏 ' + esc(e.card) + '</span>' : '';
      var row = el('div', 'ledger-row ' + (e.side || 'sys'),
        '<span class="ledger-actor">' + esc(e.actor || '') + '</span>' + cardChip + costChip +
        '<span class="ledger-text">' + esc(e.text || '') + '</span>');
      body.appendChild(row);
    });
    body.scrollTop = body.scrollHeight;
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
    ult.textContent = k.ultReady ? '⚡ ULT!' : '⚡' + k.charge + '/' + k.ultCost;
  }

  /** Speed race track: both teams' units race along a line; leader acts first. */
  function renderSpeedTrack(b) {
    var host = $('speedTrack'); host.innerHTML = '';
    var max = Math.max(b.playerSpeed || 0, b.enemySpeed || 0, 1);
    host.appendChild(el('div', 'track-round', 'R' + b.roundNumber));

    var lanes = el('div', 'track-lanes');
    [{ side: 'you', label: 'YOU', total: b.playerSpeed, units: b.allies, first: b.playerActsFirst },
     { side: 'them', label: 'FOE', total: b.enemySpeed, units: b.enemies, first: !b.playerActsFirst }]
      .forEach(function (lane) {
        var row = el('div', 'track-lane ' + lane.side + (lane.first ? ' leads' : ''));
        var bar = el('div', 'lane-bar');
        var fillPct = Math.round(100 * lane.total / max);
        bar.appendChild(el('div', 'lane-fill', ''));
        bar.lastChild.style.width = fillPct + '%';
        // runners: each living unit at its cumulative speed position —
        // shown with its overlay art cutout (element icon as fallback).
        var cum = 0;
        (lane.units || []).forEach(function (u) {
          if (!u.alive) return;
          cum += (u.effectiveSpeed != null ? u.effectiveSpeed : u.speed) || 0;
          var runner;
          if (u.artUrl) {
            runner = el('span', 'lane-runner img ' + elClass(u.element), '');
            runner.style.backgroundImage = 'url("' + String(u.artUrl).replace(/"/g, '%22') + '")';
          } else {
            runner = el('span', 'lane-runner ' + elClass(u.element), icon(u.element));
          }
          runner.style.left = 'calc(' + Math.round(100 * cum / max) + '% - 9px)';
          runner.title = u.name + ' ⚡' + (u.effectiveSpeed != null ? u.effectiveSpeed : u.speed);
          bar.appendChild(runner);
        });
        if (lane.first) bar.appendChild(el('span', 'lane-flag', '🏁'));
        row.appendChild(el('span', 'lane-label', lane.label + ' <b>' + lane.total + '</b>'));
        row.appendChild(bar);
        lanes.appendChild(row);
      });
    host.appendChild(lanes);
    host.appendChild(el('div', 'track-first ' + (b.playerActsFirst ? 'you' : 'them'),
      b.playerActsFirst ? 'You act first' : 'Enemy first'));
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
      // Intent lives inside the plate so it can never clip off-screen.
      var intentLine = '';
      if (side === 'enemy' && u.alive && u.intent) {
        intentLine = '<div class="sp-intent-line">' + intentLabel(u.intent, b) + '</div>';
      }
      var notch = side === 'ally' && u.position >= 0 ? '<div class="sp-notch">' + (u.position + 1) + '</div>' : '';
      // Evolution gauge: fills as this Siegeling spends AP on its own moves.
      var gaugeLine = '';
      if (side === 'ally' && u.alive && u.hasEvolution) {
        gaugeLine = u.evoReady
          ? '<div class="sp-gauge ready" title="Evolution ready!">🌟 EVO READY</div>'
          : '<div class="sp-gauge" title="Evolution gauge: spend ' + u.evoGaugeMax + ' AP of its moves">' +
            '<div class="sp-gaugefill" style="width:' + Math.round(100 * u.evoGauge / Math.max(1, u.evoGaugeMax)) + '%"></div>' +
            '<span class="sp-gaugetext">🌟 ' + u.evoGauge + '/' + u.evoGaugeMax + '</span></div>';
      }
      sp.innerHTML =
        '<div class="sp-plate">' +
          '<div class="sp-name">' + esc(u.name) + ' <span class="sp-el">' + icon(u.element) + '</span></div>' +
          '<div class="sp-hpbar"><div class="sp-hpfill" style="width:' + pct + '%"></div></div>' +
          '<div class="sp-tags"><span class="sp-hp">' + u.hp + '/' + u.maxHp + '</span>' + shield + buff + statusChips + '</div>' +
          gaugeLine +
          intentLine +
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
    if (intent.sweep) return '⚔' + intent.value + ' → ALL';
    var mark = null;
    (b.allies || []).forEach(function (a) { if (a.alive && a.position === intent.position) mark = a; });
    var who = mark ? esc(mark.name) : (intent.position >= 0 ? 'notch ' + (intent.position + 1) : 'the Knight');
    return '⚔' + intent.value + ' → ' + who;
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
      case 'evolve':
        showBanner('🌟 ' + ev.from + ' evolves into ' + ev.to + '!', 'you', ev.element);
        flashSprite(ev.targetId, 'evolving');
        floatText(ev.targetId, '🌟 EVOLVED!', 'status');
        transformHandCards(ev.targetId);
        return 1000;
      case 'gaugeReady':
        flashSprite(ev.targetId, 'evolving');
        floatText(ev.targetId, '🌟 Gauge full!', 'status');
        return 500;
      case 'discardHand':
        discardHandAnimation();
        return 520;
      case 'reshuffle':
        showBanner('♻ ' + ev.count + ' cards shuffle back into the deck', 'you');
        reshuffleAnimation(ev.count);
        return 900;
      case 'draw':
        state.dealAnimation = true;
        return 120;
      case 'apCharge':
        showBanner('Unused AP → +' + ev.amount + ' Ultimate Charge', 'you');
        apChargeAnimation(ev.amount, ev.total);
        return 750;
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

  /** The evolved Siegeling's cards flip and upgrade in the hand. */
  function transformHandCards(ownerId) {
    Array.prototype.forEach.call(document.querySelectorAll('.playcard[data-owner="' + ownerId + '"]'), function (node, i) {
      setTimeout(function () { node.classList.add('card-transform'); }, i * 90);
      setTimeout(function () { node.classList.remove('card-transform'); }, 900 + i * 90);
    });
  }

  /** The hand flies off to the discard pile at end of turn. */
  function discardHandAnimation() {
    Array.prototype.forEach.call(document.querySelectorAll('#handRow .playcard'), function (node, i) {
      setTimeout(function () { node.classList.add('card-discard'); }, i * 45);
    });
  }

  /** The discard pile riffles back into the deck. */
  function reshuffleAnimation(count) {
    var stage = $('battleStage');
    if (!stage) return;
    var n = Math.min(count || 5, 7);
    for (var i = 0; i < n; i++) {
      var cardBack = el('div', 'shuffle-card', '🂠');
      cardBack.style.setProperty('--shuffle-i', i);
      stage.appendChild(cardBack);
      (function (node) { setTimeout(function () { node.remove(); }, 950); })(cardBack);
    }
  }

  /** Writes a charge value onto the knight plate + ult button mid-animation. */
  function updateChargeDisplay(value) {
    var b = state.run && state.run.battle;
    var cost = (b && b.knight && b.knight.ultCost) || 20;
    var txt = document.querySelector('#knightPlate .kp-chargetext');
    if (txt) txt.textContent = '⚡ ' + value + '/' + cost;
    var fill = document.querySelector('#knightPlate .kp-chargefill');
    if (fill) fill.style.width = Math.min(100, Math.round(100 * value / Math.max(1, cost))) + '%';
    var ult = $('knightUltBtn');
    if (ult && !ult.classList.contains('hidden')) {
      ult.textContent = value >= cost ? '⚡ ULT!' : '⚡' + value + '/' + cost;
    }
  }

  /** Leftover AP pips fly from the HUD into the Knight's charge bar — the
   *  charge number ticks up as each orb lands. */
  function apChargeAnimation(amount, total) {
    var apHost = $('apDisplay'), plate = $('knightPlate');
    if (!apHost || !plate || plate.classList.contains('hidden')) return;
    var from = apHost.getBoundingClientRect(), to = plate.getBoundingClientRect();
    var n = Math.min(amount || 1, 5);
    var start = total != null ? total - amount : null;
    for (var i = 0; i < n; i++) {
      (function (i) {
        setTimeout(function () {
          var orb = el('div', 'ap-orb');
          orb.style.left = (from.left + from.width / 2) + 'px';
          orb.style.top = (from.top + from.height / 2) + 'px';
          document.body.appendChild(orb);
          var anim = orb.animate([
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
            { transform: 'translate(calc(-50% + ' + (to.left + to.width / 2 - from.left - from.width / 2) + 'px), calc(-50% + ' +
              (to.top + to.height - 8 - from.top - from.height / 2) + 'px)) scale(.55)', opacity: .9 }
          ], { duration: 480, easing: 'cubic-bezier(.3,.7,.4,1)' });
          anim.onfinish = function () {
            orb.remove();
            plate.classList.add('kp-charge-pop');
            setTimeout(function () { plate.classList.remove('kp-charge-pop'); }, 260);
            if (start != null) {
              // Each impact bumps the visible charge toward the new total.
              updateChargeDisplay(start + Math.round((i + 1) * amount / n));
            }
          };
        }, i * 110);
      })(i);
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
    var sorted = sortHandByOwner(b);
    var n = sorted.length;
    var deal = state.dealAnimation;
    state.dealAnimation = false;
    var prevOwner = null;
    sorted.forEach(function (card, i) {
      var effCls = effectClass(card.effect);
      var mid = (n - 1) / 2;
      var groupStart = i > 0 && card.ownerId !== prevOwner;
      prevOwner = card.ownerId;
      var c = el('div', 'playcard ' + elClass(card.element) + (card.effect === 'EVOLVE' ? ' evo-card' : '') + (card.playable ? '' : ' unplayable') + (card.instanceId === state.selectedCardId ? ' selected' : '') + (deal ? ' dealt' : '') + (groupStart ? ' group-start' : ''));
      c.dataset.owner = card.ownerId;
      c.style.setProperty('--fan-rot', ((i - mid) * 4) + 'deg');
      c.style.setProperty('--fan-y', (Math.abs(i - mid) * 7) + 'px');
      if (deal) c.style.setProperty('--deal-i', i);
      var statusLine = '';
      if (card.status && card.statusChance) {
        var meta = STATUS_META[card.status] || { icon: '', label: card.status };
        statusLine = '<div class="pc-status">' + meta.icon + ' ' + card.statusChance + '% ' + meta.label + '</div>';
      }
      // A locked evolution card shows its gauge instead of the description.
      var gaugeLine = '';
      if (card.effect === 'EVOLVE' && card.gauge != null && card.gauge < card.gaugeMax) {
        gaugeLine = '<div class="pc-gauge"><div class="pc-gaugefill" style="width:' +
          Math.round(100 * card.gauge / Math.max(1, card.gaugeMax)) + '%"></div>' +
          '<span>🌟 ' + card.gauge + '/' + card.gaugeMax + ' AP</span></div>';
      }
      c.innerHTML = '<div class="pc-cost' + (card.actionCost === 0 ? ' free' : '') + '">' + card.actionCost + '</div>' +
        '<div class="pc-name">' + esc(card.name) + '</div>' +
        '<div class="pc-owner">' + icon(card.element) + ' ' + esc(card.ownerName) + '</div>' +
        '<div class="pc-eff ' + effCls + '">' + effectLabel(card) + '</div>' +
        statusLine + gaugeLine +
        '<div class="pc-desc">' + esc(card.description || '') + '</div>';
      c.addEventListener('click', function () { onCardClick(card); });
      hand.appendChild(c);
    });
  }

  /** Groups the hand by owning Siegeling (left-to-right party order), Knight
   *  cards last; cards belonging to the same character always sit together. */
  function sortHandByOwner(b) {
    var rank = {};
    (b.allies || []).forEach(function (a, i) { rank[a.id] = i; });
    return b.hand.slice().sort(function (x, y) {
      var rx = x.ownerId in rank ? rank[x.ownerId] : 999;
      var ry = y.ownerId in rank ? rank[y.ownerId] : 999;
      return rx - ry;
    });
  }

  function effectClass(effect) {
    if (effect === 'DAMAGE') return 'dmg';
    if (effect === 'HEAL') return 'heal';
    if (effect === 'SHIELD') return 'shield';
    if (effect === 'EVOLVE') return 'evo';
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
      case 'EVOLVE': return '🌟 Evolve!';
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
    if (state.busy) return;
    // No card waiting for a target → open this unit's detail popup instead.
    if (!state.selectedCardId || !state.selectedCardNeedsTarget) {
      showBattleUnitDetails(u);
      return;
    }
    var card = currentCard();
    if (!card) return;
    var wantsEnemy = card.target === 'ENEMY_SINGLE';
    if (wantsEnemy && u.side === 'ENEMY' && u.alive) { playCard(card.instanceId, u.id); }
    else if (!wantsEnemy && u.side === 'PLAYER' && u.alive) { playCard(card.instanceId, u.id); }
  }

  /** Cards, abilities, and evolution info for any battlefield unit (allies AND enemies). */
  function showBattleUnitDetails(u) {
    var run = state.run;
    if (u.side === 'ENEMY') {
      var intentNote = u.intent ? ' · Next: ' + u.intent.name : '';
      showUnitModal({
        name: u.name, element: u.element, artUrl: u.artUrl,
        subtitle: 'Enemy · HP ' + u.hp + '/' + u.maxHp + ' · ⚡ ' + u.speed + intentNote,
        cards: u.abilities || []
      });
      return;
    }
    var member = (run.party || []).find(function (p) { return p.id === u.id; });
    var evoNote = '';
    if (u.hasEvolution) {
      var target = member && member.evolvesTo ? ' → ' + member.evolvesTo : '';
      evoNote = u.evoReady ? ' · 🌟 Evolution ready' + target
        : ' · 🌟 Gauge ' + u.evoGauge + '/' + u.evoGaugeMax + target;
    }
    showUnitModal({
      name: u.name, element: u.element, artUrl: u.artUrl,
      subtitle: 'HP ' + u.hp + '/' + u.maxHp + ' · ⚡ ' + u.speed + evoNote,
      cards: member ? (member.cards || []) : []
    });
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
    $('rewardSub').textContent = state.run.lastReward || 'Choose one reward to strengthen the run.';
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
