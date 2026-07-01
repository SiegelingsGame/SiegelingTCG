/* Siege — Siegelings roguelike client.
 * Talks to /api/siege/**. All rules run server-side; this file renders state
 * and submits actions. Run is addressed by an opaque token kept in localStorage. */
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
  var NODE_ICON = { BATTLE: '⚔️', ELITE: '🔺', REST: '🏕️', TREASURE: '💎', BOSS: '👑' };

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
    ['loadingScreen', 'setupScreen', 'mapScreen', 'battleScreen', 'resultScreen'].forEach(function (s) {
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
    $('enterNodeBtn').addEventListener('click', enterNode);
    $('endTurnBtn').addEventListener('click', endTurn);
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
      c.innerHTML =
        (picked >= 0 ? '<div class="selorder">' + (picked + 1) + '</div>' : '') +
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
      .then(function (run) { setToken(run.token); state.run = run; renderRun(); })
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
    renderMap();
  }

  // ---- map -----------------------------------------------------------
  function renderMap() {
    showScreen('mapScreen');
    var run = state.run;
    renderPartyStrip($('partyStrip'), run.party);
    $('mapReward').textContent = run.lastReward || '';

    var track = $('mapTrack'); track.innerHTML = '';
    run.map.forEach(function (n) {
      var node = el('div', 'map-node type-' + n.type + (n.cleared ? ' cleared' : '') + (n.current ? ' current' : ''));
      node.innerHTML = '<div class="nicon">' + (NODE_ICON[n.type] || '•') + '</div>' +
        '<div class="ntype">' + prettyType(n.type) + '</div>' +
        '<div class="nlabel">' + esc(n.label) + '</div>';
      track.appendChild(node);
    });

    var cur = run.map[run.currentIndex];
    var btn = $('enterNodeBtn');
    btn.textContent = cur ? ('Enter: ' + prettyType(cur.type)) : 'Continue';
    btn.disabled = false;
  }

  function prettyType(t) {
    return { BATTLE: 'Skirmish', ELITE: 'Elite', REST: 'Rest', TREASURE: 'Treasure', BOSS: 'Boss' }[t] || t;
  }

  function renderPartyStrip(host, party) {
    host.innerHTML = '';
    party.forEach(function (p) {
      var chip = el('div', 'party-chip ' + elClass(p.element) + (p.alive ? '' : ' dead'));
      var pct = Math.max(0, Math.round(100 * p.hp / Math.max(1, p.maxHp)));
      chip.innerHTML = '<div class="pname">' + icon(p.element) + ' ' + esc(p.name) + '</div>' +
        '<div class="phpbar"><div class="phpfill" style="width:' + pct + '%"></div></div>' +
        '<div class="phptext">HP ' + p.hp + ' / ' + p.maxHp + '  ·  ⚡' + p.speed + '</div>';
      host.appendChild(chip);
    });
  }

  function enterNode() {
    if (state.busy) return; state.busy = true;
    $('enterNodeBtn').disabled = true;
    api('/api/siege/node/enter', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); $('enterNodeBtn').disabled = false; })
      .then(function () { state.busy = false; });
  }

  // ---- battle --------------------------------------------------------
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

    renderUnitRow($('enemyRow'), b.enemies, 'enemy', b);
    renderUnitRow($('allyRow'), b.allies, 'ally', b);

    // log
    var log = $('battleLog'); log.innerHTML = '';
    (b.log || []).slice().reverse().forEach(function (line) { if (line) log.appendChild(el('div', 'lg', esc(line))); });

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

  function renderUnitRow(host, units, side, b) {
    host.innerHTML = '';
    units.forEach(function (u) {
      var unit = el('div', 'unit ' + side + ' ' + elClass(u.element) +
        (u.alive ? '' : ' dead') + (u.id === b.leadId ? ' lead' : ''));
      unit.dataset.id = u.id; unit.dataset.side = u.side;
      var pct = Math.max(0, Math.round(100 * u.hp / Math.max(1, u.maxHp)));
      var ab = (side === 'enemy' && u.abilities && u.abilities.length)
        ? '<div class="uabilities">Moves: ' + esc(u.abilities.join(', ')) + '</div>' : '';
      var shield = u.shield > 0 ? '<span class="ushield">🛡 ' + u.shield + '</span>' : '';
      unit.innerHTML = '<div class="uname"><span>' + esc(u.name) + '</span><span class="uel">' + icon(u.element) + '</span></div>' +
        '<div class="uhpbar"><div class="uhpfill" style="width:' + pct + '%"></div></div>' +
        '<div class="uhptext"><span>' + u.hp + ' / ' + u.maxHp + '</span>' + shield + '</div>' +
        '<div class="uhptext"><span>⚡ ' + u.speed + '</span></div>' + ab;
      unit.addEventListener('click', function () { onUnitClick(u); });
      host.appendChild(unit);
    });
  }

  function renderHand(b, over) {
    var hand = $('handRow'); hand.innerHTML = '';
    if (over) {
      var box = el('div', '', '<div style="text-align:center;width:100%">' +
        '<div style="font-size:22px;font-weight:800;color:' + (b.phase === 'WON' ? 'var(--good)' : 'var(--bad)') + '">' +
        (b.phase === 'WON' ? 'Victory!' : 'Defeat') + '</div></div>');
      var cont = el('button', 'siege-btn primary', b.phase === 'WON' ? 'Claim & Continue' : 'End Expedition');
      cont.style.marginTop = '10px';
      cont.addEventListener('click', continueRun);
      var wrap = el('div', ''); wrap.style.width = '100%'; wrap.style.textAlign = 'center';
      wrap.appendChild(box); wrap.appendChild(cont);
      hand.appendChild(wrap);
      return;
    }
    b.hand.forEach(function (card) {
      var effCls = effectClass(card.effect);
      var c = el('div', 'playcard ' + elClass(card.element) + (card.playable ? '' : ' unplayable') + (card.instanceId === state.selectedCardId ? ' selected' : ''));
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
      case 'DAMAGE': return '⚔ ' + card.value + ' dmg' + (card.target === 'ALL_ENEMIES' ? ' (all)' : '');
      case 'HEAL': return '➕ Heal ' + card.value + (card.target === 'ALLY_ALL' ? ' (all)' : '');
      case 'SHIELD': return '🛡 Shield ' + card.value + (card.target === 'ALLY_ALL' ? ' (all)' : '');
      case 'BUFF_ATK': return '↑ +' + card.value + ' attack';
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
    Array.prototype.forEach.call(document.querySelectorAll('.unit'), function (node) {
      var isEnemy = node.dataset.side === 'ENEMY';
      var alive = !node.classList.contains('dead');
      node.classList.toggle('targetable', alive && (wantsEnemy ? isEnemy : !isEnemy));
    });
  }

  function playCard(cardId, targetId) {
    if (state.busy) return; state.busy = true;
    api('/api/siege/battle/play', { method: 'POST', body: { token: token(), cardId: cardId, targetId: targetId } })
      .then(function (run) { state.run = run; state.selectedCardId = null; state.selectedCardNeedsTarget = false; if (run.battle && run.battle.error) toast(run.battle.error); if (run.error) toast(run.error); renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }

  function endTurn() {
    if (state.busy) return; state.busy = true;
    clearSel();
    api('/api/siege/battle/end-turn', { method: 'POST', body: { token: token() } })
      .then(function (run) { state.run = run; renderRun(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { state.busy = false; });
  }
  function clearSel() { state.selectedCardId = null; state.selectedCardNeedsTarget = false; }

  function continueRun() {
    if (state.busy) return; state.busy = true;
    api('/api/siege/continue', { method: 'POST', body: { token: token() } })
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
