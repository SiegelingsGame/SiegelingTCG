/* Siegeknight Chronicles client. Every rule runs server-side (ChroniclesService);
 * this file renders the snapshot, animates idle progress from server timestamps,
 * and posts the player's choices. */
(function () {
  'use strict';

  var AUTH_TOKEN_KEY = 'sieglingsAuthToken';
  var COOKIE_SESSION_VALUE = 'cookie';
  var TAB_KEY = 'sieglingsChroniclesTab';
  var apiBase = String((window.SIEGLINGS_CONFIG && window.SIEGLINGS_CONFIG.apiBaseUrl) || '').replace(/\/$/, '');
  var STORAGE_ART_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/siegelingstcgtesting.firebasestorage.app/o/';
  var ART_THUMB_WIDTHS = [160, 240, 320, 480, 640, 960];
  var RASTER_ELEMENTS = { FIRE: 1, EARTH: 1, ICE: 1, WIND: 1 };

  var state = {
    snap: null,
    tab: readTab(),
    clockOffset: 0,
    busy: false,
    pollTimer: 0,
    oathPick: '',
    supplies: {},
    rune: '',
    openCompanion: ''
  };

  var $ = function (id) { return document.getElementById(id); };
  var main = $('ckMain');

  // ── utilities ────────────────────────────────────────────────────────────

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readTab() {
    try { return localStorage.getItem(TAB_KEY) || 'work'; } catch (e) { return 'work'; }
  }

  function saveTab(tab) {
    try { localStorage.setItem(TAB_KEY, tab); } catch (e) { /* per-viewer nicety only */ }
  }

  function serverNow() { return Date.now() + state.clockOffset; }

  function pct(into, span) {
    if (!span) return 0;
    return Math.max(0, Math.min(100, Math.round((into / span) * 100)));
  }

  function bar(into, span, cls) {
    return '<span class="ck-bar' + (cls ? ' ' + cls : '') + '"><i style="width:' + pct(into, span) + '%"></i></span>';
  }

  function duration(ms) {
    ms = Math.max(0, ms);
    var s = Math.round(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
    if (m > 0) return m + 'm ' + (sec < 10 ? '0' : '') + sec + 's';
    return sec + 's';
  }

  function elKey(el) { return String(el || 'NEUTRAL').toLowerCase(); }

  function elementIcon(el, size) {
    var key = elKey(el);
    var src = RASTER_ELEMENTS[String(el || '').toUpperCase()]
      ? '/img/elements/element-' + key + '-96.webp' : '/img/elements/element-' + key + '.svg';
    return '<img class="ck-el-ico" src="' + src + '" alt="" width="' + (size || 16) + '" height="' + (size || 16) + '">';
  }

  function chip(text, cls) { return '<span class="ck-chip' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>'; }

  function elChip(el, label) {
    return '<span class="ck-chip ck-el" style="--el:var(--' + elKey(el) + ')">' + elementIcon(el, 14) + esc(label || el) + '</span>';
  }

  // Same thumbnail chain as Siege (adventure.js artThumbChain): pre-cut WebP, mirror, original.
  function artChain(url, width) {
    var u = String(url || '');
    if (!u) return [];
    var local = u.match(/^(\/(?:img|assets)\/[^?#]+)\.png$/i);
    if (local) return [local[1] + '.webp', u];
    if (u.indexOf(STORAGE_ART_PREFIX) !== 0) return [u];
    var mirror = '/api/cards/art-mirror?w=' + width + '&url=' + encodeURIComponent(u);
    var token = (u.match(/[?&]token=([0-9A-Za-z-]{8,64})(?:&|$)/) || [])[1];
    if (!token) return [mirror, u];
    var bucket = ART_THUMB_WIDTHS[ART_THUMB_WIDTHS.length - 1];
    for (var i = 0; i < ART_THUMB_WIDTHS.length; i++) {
      if (ART_THUMB_WIDTHS[i] >= width) { bucket = ART_THUMB_WIDTHS[i]; break; }
    }
    return [STORAGE_ART_PREFIX + encodeURIComponent('art-thumbs/' + token + '/w' + bucket + '.webp') +
      '?alt=media&token=' + token, mirror, u];
  }

  window.ckArtNext = function (img) {
    var chain = artChain(img.getAttribute('data-art'), Number(img.getAttribute('data-w')) || 240);
    var step = Number(img.getAttribute('data-step') || 0) + 1;
    if (step >= chain.length) {
      img.onerror = null;
      img.parentNode.classList.add('is-noart');
      img.remove();
      return;
    }
    img.setAttribute('data-step', String(step));
    img.src = chain[step];
  };

  function portrait(unit, width, cls) {
    var chain = artChain(unit.artUrl, width || 240);
    var initial = esc(String(unit.nickname || unit.species || '?').charAt(0));
    var inner = chain.length
      ? '<img src="' + esc(chain[0]) + '" data-art="' + esc(unit.artUrl) + '" data-w="' + (width || 240) +
        '" alt="" loading="lazy" decoding="async" onerror="ckArtNext(this)">'
      : '';
    return '<span class="ck-portrait' + (chain.length ? '' : ' is-noart') + (cls ? ' ' + cls : '') +
      '" style="--el:var(--' + elKey(unit.element) + ')" data-initial="' + initial + '">' + inner + '</span>';
  }

  function find(list, key, value) {
    for (var i = 0; i < (list || []).length; i++) if (list[i][key] === value) return list[i];
    return null;
  }

  function companion(id) { return state.snap ? find(state.snap.companions, 'id', id) : null; }

  function invQty(id) {
    var row = state.snap ? find(state.snap.inventory, 'id', id) : null;
    return row ? row.qty : 0;
  }

  // ── network ──────────────────────────────────────────────────────────────

  function hasSession() {
    try { return Boolean(localStorage.getItem(AUTH_TOKEN_KEY)); } catch (e) { return false; }
  }

  function requestId() {
    return 'ck-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function api(path, body) {
    var token = '';
    try { token = localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch (e) { token = ''; }
    var headers = { 'Content-Type': 'application/json' };
    // The sentinel means the session rides the cookie; anything else is a real Bearer token.
    if (token && token !== COOKIE_SESSION_VALUE) headers.Authorization = 'Bearer ' + token;
    var opts = { method: body ? 'POST' : 'GET', headers: headers, credentials: 'same-origin' };
    if (body) opts.body = JSON.stringify(body);
    return fetch(apiBase + path, opts).then(function (res) {
      return res.text().then(function (raw) {
        var data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = { error: 'Unexpected server response.' }; }
        if (!res.ok) { data.error = data.error || res.statusText || 'Request failed.'; data.status = res.status; }
        return data;
      });
    }, function () {
      return { error: 'Could not reach the server. Check your connection and try again.', status: 0 };
    });
  }

  function load() {
    if (!hasSession()) { renderGate(); return Promise.resolve(); }
    return api('/api/chronicles').then(function (data) {
      if (data.status === 401) { renderGate(); return; }
      if (data.error) { renderError(data.error); return; }
      accept(data);
    });
  }

  function act(path, body, after) {
    if (state.busy) return Promise.resolve();
    state.busy = true;
    document.body.classList.add('is-busy');
    body = body || {};
    body.requestId = requestId();
    if (state.snap && state.snap.version != null) body.expectedVersion = state.snap.version;
    return api(path, body).then(function (data) {
      state.busy = false;
      document.body.classList.remove('is-busy');
      if (data.status === 409) { toast(data.error, 'warn'); return load(); }
      if (data.status === 401) { renderGate(); return; }
      if (data.error) { toast(data.error, 'bad'); return; }
      // A collect's milestones are listed inside the report rather than stacked over it.
      accept(data, Boolean(data.report));
      if (after) after(data);
    });
  }

  function accept(data, quiet) {
    if (data.serverNow) state.clockOffset = data.serverNow - Date.now();
    if (!data.started) { state.snap = null; renderOath(data); return; }
    state.snap = data;
    if (!quiet) (data.events || []).forEach(function (e) { toast(e, 'good'); });
    render();
    schedulePoll();
    if (data.away && !$('ckModal').dataset.kind) showAway(data.away);
  }

  // While the company is out, the server reveals the road a few entries at a time.
  function schedulePoll() {
    clearTimeout(state.pollTimer);
    var e = state.snap && state.snap.expedition;
    if (!e || e.done) return;
    var wait = Math.min(30000, Math.max(4000, e.completesAt - serverNow() + 800));
    state.pollTimer = setTimeout(function () { if (!document.hidden) load(); else schedulePoll(); }, wait);
  }

  // ── toasts / modal ───────────────────────────────────────────────────────

  function toast(text, tone) {
    var host = $('ckToasts');
    var el = document.createElement('div');
    el.className = 'ck-toast is-' + (tone || 'info');
    el.textContent = text;
    host.appendChild(el);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(function () { el.classList.add('is-out'); }, 3800);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4300);
  }

  function openModal(kind, html) {
    var modal = $('ckModal');
    modal.dataset.kind = kind;
    $('ckModalBody').innerHTML = html;
    modal.hidden = false;
  }

  function closeModal() {
    var modal = $('ckModal');
    modal.hidden = true;
    modal.dataset.kind = '';
    $('ckModalBody').innerHTML = '';
  }

  function itemLines(items) {
    if (!items || !items.length) return '<p class="ck-muted">Nothing.</p>';
    return '<ul class="ck-loot">' + items.map(function (i) {
      return '<li><b>' + esc(i.qty) + '×</b> ' + esc(i.name) + '</li>';
    }).join('') + '</ul>';
  }

  function xpLines(rows) {
    if (!rows || !rows.length) return '';
    return '<ul class="ck-xp">' + rows.map(function (r) {
      return '<li><span>' + esc(r.label) + '</span><b>+' + esc(r.xp) + ' xp</b></li>';
    }).join('') + '</ul>';
  }

  function showAway(away) {
    var span = duration(away.toAt - away.fromAt);
    openModal('away',
      '<h2 id="ckModalTitle">While you were away</h2>' +
      '<p class="ck-muted">' + esc(span) + ' of ' + esc(away.activityName) + ' · ' + esc(away.actions) + ' actions' +
      (away.capped ? ' · <b>reached the 12h idle cap</b>' : '') + '</p>' +
      (away.stoppedReason ? '<p class="ck-warn">' + esc(away.stoppedReason) + '</p>' : '') +
      '<h3>Gained</h3>' + itemLines(away.items) +
      (away.consumed && away.consumed.length ? '<h3>Used</h3>' + itemLines(away.consumed) : '') +
      xpLines(away.xp) +
      '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="ack-away">Continue</button></div>');
  }

  function showReport(report, events) {
    var tone = report.outcome === 'complete' ? 'Expedition complete' :
      report.outcome === 'retreat' ? 'The company retreated' : 'The company was overwhelmed';
    openModal('report',
      '<h2 id="ckModalTitle">' + esc(report.route) + '</h2>' +
      '<p class="ck-outcome is-' + esc(report.outcome) + '">' + esc(tone) + ' · ' + esc(report.encountersWon) + '/' +
      esc(report.encountersTotal) + ' battles won</p>' +
      (events && events.length ? '<h3>Milestones</h3><ul class="ck-milestones">' + events.map(function (e) {
        return '<li>' + esc(e) + '</li>';
      }).join('') + '</ul>' : '') +
      '<h3>Company</h3><ul class="ck-xp">' + (report.companions || []).map(function (c) {
        return '<li><span>' + esc(c.name) + '</span><b>+' + esc(c.xp) + ' xp · +' + esc(c.bond) + ' bond</b></li>';
      }).join('') + '</ul>' +
      '<h3>Knowledge</h3>' + xpLines(report.xp) +
      '<h3>Loot</h3>' + itemLines(report.items) +
      (report.suppliesReturned && report.suppliesReturned.length ? '<h3>Supplies returned</h3>' + itemLines(report.suppliesReturned) : '') +
      (report.sightings ? '<p class="ck-rare">' + esc(report.sightings) + ' wild Siegeling' + (report.sightings > 1 ? 's' : '') +
        ' spotted. Visit the Wilds to tame.</p>' : '') +
      '<details class="ck-log"><summary>Full road log</summary>' + timelineHtml(report.timeline) + '</details>' +
      '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="close-modal">Home again</button></div>');
  }

  // ── gate / oath ──────────────────────────────────────────────────────────

  function setScreen(name) {
    document.body.dataset.screen = name;
    $('ckTabs').hidden = name !== 'main';
    $('ckRank').hidden = name !== 'main';
    $('ckStatus').hidden = name !== 'main';
  }

  function renderGate() {
    setScreen('gate');
    main.innerHTML =
      '<section class="ck-hero">' +
        '<p class="ck-kicker">Idle RPG · Creature Bonding · Skill Mastery</p>' +
        '<h1>Become a Siegeknight.</h1>' +
        '<p>Train professions, master the elements, and forge bonds with your Siegelings. Your company explores, ' +
        'fights and gathers while you are away.</p>' +
        '<div class="ck-actions"><a class="ck-btn is-primary" href="/login">Sign in at the hub</a>' +
        '<a class="ck-btn" href="/home">Back to the hub</a></div>' +
        '<p class="ck-muted">Your chronicle is saved to your account. Sign in, then come back to /chronicles.</p>' +
      '</section>';
  }

  function renderError(message) {
    setScreen('gate');
    main.innerHTML = '<section class="ck-hero"><h1>The road is closed.</h1><p>' + esc(message) + '</p>' +
      '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="reload">Try again</button></div></section>';
  }

  function renderOath(data) {
    setScreen('oath');
    $('ckKnightName').textContent = 'Take the oath';
    var starters = data.starters || [];
    if (!state.oathPick && starters.length) state.oathPick = starters[0].speciesId;
    main.innerHTML =
      '<section class="ck-oath">' +
        '<h1>The Siegeknight\'s Oath</h1>' +
        '<p>You begin as a Siege Squire with a plain sword and one companion. The Siegeknight unlocks possibilities. ' +
        'The Siegelings make them achievable.</p>' +
        '<label class="ck-field"><span>Your knight\'s name</span>' +
          '<input id="ckOathName" maxlength="20" autocomplete="off" value="' + esc(data.suggestedName || '') + '"></label>' +
        '<h2>Choose your first companion</h2>' +
        '<div class="ck-starters">' + starters.map(function (s) {
          return '<button type="button" class="ck-starter' + (s.speciesId === state.oathPick ? ' is-picked' : '') +
            '" data-act="oath-pick" data-id="' + esc(s.speciesId) + '" style="--el:var(--' + elKey(s.element) + ')">' +
            portrait(s, 320) +
            '<span class="ck-starter-name">' + esc(s.species) + '</span>' +
            '<span class="ck-chips">' + elChip(s.element, s.elementLabel) + chip(s.class) + '</span>' +
            '<span class="ck-starter-line">' + esc(s.identity) + '</span>' +
            '<span class="ck-starter-line ck-muted">Bond 50: ' + esc(s.bondTechnique) + '</span>' +
          '</button>';
        }).join('') + '</div>' +
        '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="oath">Take the oath</button></div>' +
      '</section>';
  }

  // ── main render ──────────────────────────────────────────────────────────

  function render() {
    var s = state.snap;
    setScreen('main');
    $('ckKnightName').textContent = 'Sir ' + s.knight.name;
    $('ckRankNum').textContent = s.knight.rank;
    $('ckRankTitle').textContent = s.knight.rankTitle;
    $('ckRankBar').style.width = pct(s.knight.xpInto, s.knight.xpSpan) + '%';
    var badge = $('ckWildsBadge');
    badge.hidden = !(s.sightings && s.sightings.length);
    badge.textContent = s.sightings ? s.sightings.length : '';
    Array.prototype.forEach.call(document.querySelectorAll('#ckTabs button'), function (b) {
      b.classList.toggle('is-on', b.dataset.tab === state.tab);
      b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false');
    });
    renderStatus();
    var scroll = main.scrollTop;
    var view = { knight: viewKnight, company: viewCompany, work: viewWork, expedition: viewExpedition, wilds: viewWilds }[state.tab] || viewWork;
    main.innerHTML = view(s);
    main.scrollTop = scroll;
    tick();
  }

  function renderStatus() {
    var s = state.snap;
    var parts = [];
    if (s.activity) {
      parts.push('<button type="button" class="ck-stat" data-act="tab" data-tab="work"><span class="ck-dot is-on"></span>' +
        '<span>' + esc(s.activity.name) + '</span><span class="ck-bar is-thin"><i data-live="activity"></i></span></button>');
    } else {
      parts.push('<button type="button" class="ck-stat" data-act="tab" data-tab="work"><span class="ck-dot"></span><span>Knight resting</span></button>');
    }
    if (s.expedition) {
      parts.push('<button type="button" class="ck-stat" data-act="tab" data-tab="expedition"><span class="ck-dot ' +
        (s.expedition.done ? 'is-ready' : 'is-on') + '"></span><span>' + esc(s.expedition.route) + '</span>' +
        '<b data-live="exp-left">' + (s.expedition.done ? 'Home!' : '') + '</b></button>');
    } else {
      parts.push('<button type="button" class="ck-stat" data-act="tab" data-tab="expedition"><span class="ck-dot"></span><span>Company at home</span></button>');
    }
    $('ckStatus').innerHTML = parts.join('');
  }

  // Knight ─────────────────────────────────────────────────────────────────

  function viewKnight(s) {
    var eq = s.equipment;
    var groups = {};
    s.skills.forEach(function (k) { (groups[k.group] = groups[k.group] || []).push(k); });
    var gear = s.inventory.filter(function (i) { return i.kind === 'WEAPON' || i.kind === 'ARMOR' || i.kind === 'RELIC'; });
    var bag = s.inventory.filter(function (i) { return i.kind !== 'WEAPON' && i.kind !== 'ARMOR' && i.kind !== 'RELIC'; });
    return '' +
      '<section class="ck-card ck-sheet">' +
        '<div class="ck-sheet-head"><div><p class="ck-kicker">Rank ' + esc(s.knight.rank) + ' · ' + esc(s.knight.rankTitle) + '</p>' +
        '<h2>Sir ' + esc(s.knight.name) + '</h2>' +
        (s.knight.titles && s.knight.titles.length ? '<p class="ck-small is-ready">' + esc(s.knight.titles.join(' · ')) + '</p>' : '') +
        '</div>' +
        '<div class="ck-sheet-stats"><span><b>' + esc(s.knight.expeditionsCompleted) + '</b> expeditions</span>' +
        '<span><b>' + esc(s.knight.tamed) + '</b> tamed</span></div></div>' +
        bar(s.knight.xpInto, s.knight.xpSpan) +
        '<p class="ck-muted">Rank grows with everything your knight learns. It opens new destinations.</p>' +
      '</section>' +
      '<section class="ck-card"><h3>Equipment</h3><div class="ck-gear">' +
        gearSlot('Weapon', eq.weapon) + gearSlot('Armor', eq.armor) + gearSlot('Relic', eq.relic) +
      '</div>' + (gear.length > 1 ? '<div class="ck-gear-list">' + gear.map(function (g) {
        var on = (eq.weapon && eq.weapon.id === g.id) || (eq.armor && eq.armor.id === g.id) || (eq.relic && eq.relic.id === g.id);
        return '<button type="button" class="ck-pill' + (on ? ' is-on' : '') + '" data-act="equip" data-id="' + esc(g.id) + '">' +
          esc(g.name) + '</button>';
      }).join('') + '</div>' : '') + '</section>' +
      ['Gathering', 'Production', 'Siegeling', 'Expedition', 'Knowledge'].map(function (g) {
        if (!groups[g]) return '';
        return '<section class="ck-card"><h3>' + esc(g) + ' professions</h3><div class="ck-skills">' +
          groups[g].map(skillRow).join('') + '</div></section>';
      }).join('') +
      '<section class="ck-card"><h3>Elemental Affinity</h3>' +
        '<p class="ck-muted">Earned by adventuring with Siegelings of each element and exploring its lands. ' +
        'Affinity 10 unlocks a technique to prepare for expeditions.</p>' +
        '<div class="ck-affinities">' + s.affinities.map(affinityRow).join('') + '</div></section>' +
      '<section class="ck-card"><h3>Class Mastery</h3>' +
        '<p class="ck-muted">Every battle teaches you how its Siegelings fight. Mastery strengthens that class in your company.</p>' +
        '<div class="ck-masteries">' + s.masteries.map(function (m) {
          return '<div class="ck-mastery"><div class="ck-row"><b>' + esc(m.class) + '</b><span>Lv ' + esc(m.level) + '</span></div>' +
            '<span class="ck-muted">' + esc(m.path) + ' · ' + esc(m.identity) + '</span>' + bar(m.xpInto, m.xpSpan) +
            '<span class="ck-small">+' + esc(m.bonusPct) + '% to ' + esc(m.class) + ' Siegelings</span></div>';
        }).join('') + '</div>' +
        '<h4>Cross-class techniques</h4><ul class="ck-cross">' + s.crossClass.map(function (c) {
          return '<li class="' + (c.unlocked ? 'is-on' : '') + '"><b>' + esc(c.name) + '</b> <span class="ck-small">' +
            esc(c.classes.join(' + ')) + ' ' + esc(c.needs) + '</span><span class="ck-small ck-muted">' + esc(c.text) + '</span></li>';
        }).join('') + '</ul></section>' +
      '<section class="ck-card"><h3>Elemental Convergence</h3><p class="ck-muted">At Affinity 75 in two elements, prepare their ' +
        'combination when both fight in your company.</p><ul class="ck-cross">' + s.combos.map(function (c) {
          return '<li class="' + (c.unlocked ? 'is-on' : '') + '"><b>' + esc(c.name) + '</b> <span class="ck-small">' +
            esc(c.labels.join(' + ')) + ' ' + esc(c.needs) + '</span><span class="ck-small ck-muted">' + esc(c.text) + '</span></li>';
        }).join('') + '</ul></section>' +
      '<section class="ck-card"><h3>Weapon Disciplines</h3><div class="ck-weapons">' + s.weapons.map(function (w) {
        return '<div class="ck-weapon' + (w.equipped ? ' is-on' : '') + '"><div class="ck-row"><b>' + esc(w.name) + '</b><span>Lv ' + esc(w.level) +
          '</span></div><span class="ck-small">' + esc(w.specialty) + '</span>' + bar(w.xpInto, w.xpSpan) +
          '<span class="ck-small"><b>' + esc(w.command) + ':</b> ' + esc(w.commandText) + '</span></div>';
      }).join('') + '</div></section>' +
      '<section class="ck-card"><h3>Pack</h3>' + (bag.length ? '<ul class="ck-bag">' + bag.map(function (i) {
        return '<li title="' + esc(i.blurb) + '"><span>' + esc(i.name) + '</span><b>' + esc(i.qty) + '</b></li>';
      }).join('') + '</ul>' : '<p class="ck-muted">Empty. Set your knight to work.</p>') + '</section>' +
      '<section class="ck-card ck-keep-link"><h3>Home base</h3><p class="ck-muted">Your Keep is your stronghold. ' +
        'Its rooms and residents live in My Keep.</p><a class="ck-btn" href="/keep">Visit your Keep</a></section>';
  }

  function gearSlot(label, item) {
    return '<div class="ck-gear-slot"><span class="ck-kicker">' + esc(label) + '</span><b>' + esc(item ? item.name : 'Empty') + '</b>' +
      '<span class="ck-small">' + esc(item ? item.blurb : 'Forge one at Smithing.') + '</span></div>';
  }

  function skillRow(k) {
    return '<div class="ck-skill' + (k.unlocked ? '' : ' is-locked') + '">' +
      '<div class="ck-row"><b>' + esc(k.name) + '</b><span>' + (k.unlocked ? 'Lv ' + esc(k.level) : 'Locked') + '</span></div>' +
      (k.unlocked ? bar(k.xpInto, k.xpSpan) : '<span class="ck-small">Needs ' + esc(k.unlockText.join(', ')) + '</span>') +
      '<span class="ck-small ck-muted">' + esc(k.blurb) + '</span>' +
      (k.unlocked && k.effect ? '<span class="ck-small is-ready">' + esc(k.effect) + '</span>' : '') +
      (k.leadsTo.length ? '<span class="ck-small">Unlocks ' + esc(k.leadsTo.join(', ')) + '</span>' : '') +
    '</div>';
  }

  function affinityRow(a) {
    return '<button type="button" class="ck-affinity' + (a.studied ? '' : ' is-dim') + '" data-act="affinity" data-id="' + esc(a.element) +
      '" style="--el:var(--' + elKey(a.element) + ')">' +
      '<div class="ck-row">' + elementIcon(a.element, 18) + '<b>' + esc(a.label) + '</b><span>Lv ' + esc(a.level) + '</span></div>' +
      bar(a.xpInto, a.xpSpan, 'is-el') +
      '<span class="ck-small">' + esc(a.milestone) + (a.nextMilestone ? ' · next ' + esc(a.nextMilestoneName) + ' at ' + esc(a.nextMilestone) : '') + '</span>' +
      '<span class="ck-small' + (a.technique.unlocked ? ' is-ready' : ' ck-muted') + '">' + (a.technique.unlocked ? '★ ' : '10: ') +
      esc(a.technique.name) + '</span></button>';
  }

  function showAffinity(el) {
    var a = find(state.snap.affinities, 'element', el);
    if (!a) return;
    var combos = state.snap.combos.filter(function (c) { return c.elements.indexOf(el) >= 0; });
    openModal('affinity',
      '<h2 id="ckModalTitle">' + elementIcon(a.element, 22) + ' ' + esc(a.label) + ' Affinity · ' + esc(a.level) + '</h2>' +
      '<p class="ck-muted">' + esc(a.milestone) + '. Grows with every battle a ' + esc(a.label) +
      ' Siegeling fights, every trip into its lands, studies of its essence, and taming.</p>' +
      bar(a.xpInto, a.xpSpan, 'is-el') +
      '<ol class="ck-ladder" style="--el:var(--' + elKey(a.element) + ')">' + a.milestones.map(function (m) {
        return '<li class="' + (m.unlocked ? 'is-on' : '') + '"><b>' + esc(m.level) + ' · ' + esc(m.name) + '</b><span>' + esc(m.text) + '</span></li>';
      }).join('') + '</ol>' +
      (combos.length ? '<h3>Combinations</h3><ul class="ck-cross">' + combos.map(function (c) {
        return '<li class="' + (c.unlocked ? 'is-on' : '') + '"><b>' + esc(c.name) + '</b> <span class="ck-small">' + esc(c.labels.join(' + ')) +
          ' ' + esc(c.needs) + '</span><span class="ck-small ck-muted">' + esc(c.text) + '</span></li>';
      }).join('') + '</ul>' : '') +
      '<div class="ck-actions"><button type="button" class="ck-btn" data-act="close-modal">Close</button></div>');
  }

  // Company ────────────────────────────────────────────────────────────────

  function viewCompany(s) {
    var p = s.party;
    var away = Boolean(s.expedition);
    var slots = p.positions.map(function (pos, i) {
      var id = p.members[i] || '';
      var c = id ? companion(id) : null;
      var locked = i >= p.slots;
      var need = i === 1 ? 3 : 10;
      return '<div class="ck-slot' + (locked ? ' is-locked' : '') + '"><span class="ck-kicker">' + esc(pos) + '</span>' +
        (locked ? '<span class="ck-small">Command ' + need + '</span>' :
          c ? portrait(c, 160, 'is-sm') + '<b>' + esc(c.nickname) + '</b><span class="ck-small">' + esc(c.class) + ' · Lv ' + esc(c.level) + '</span>' +
            (away ? '' : '<button type="button" class="ck-link" data-act="party-clear" data-slot="' + i + '">Remove</button>')
            : '<span class="ck-small ck-muted">Empty</span>') +
      '</div>';
    }).join('');
    var reserve = p.reserveUnlocked ? (p.reserveId ? companion(p.reserveId) : null) : null;
    return '' +
      '<section class="ck-card"><h3>Expedition Company</h3>' +
        (away ? '<p class="ck-warn">The company is on the road. Changes wait until it returns.</p>' : '') +
        '<div class="ck-formation">' + slots + '</div>' +
        '<p class="ck-small">' + (p.reserveUnlocked ? 'Reserve: ' + esc(reserve ? reserve.nickname : 'none') + ' (steps in once when someone falls).' :
          'A reserve slot opens at Command ' + esc(p.reserveCommandLevel) + '.') +
          (p.nextSlotAt ? ' Next slot at Command ' + esc(p.nextSlotAt) + '.' : '') + '</p>' +
        (p.synergies.length ? '<div class="ck-synergies">' + p.synergies.map(function (sy) {
          return '<span class="ck-chip is-syn" title="' + esc(sy.text) + '"><b>' + esc(sy.label) + '</b> ' + esc(sy.text) + '</span>';
        }).join('') + '</div>' : '<p class="ck-small ck-muted">Two Siegelings of one element or class form a synergy (RBX tiers: two and three).</p>') +
        (p.crossClass.length ? '<p class="ck-small is-ready">' + p.crossClass.map(function (c) { return esc(c.name); }).join(', ') + ' active.</p>' : '') +
      '</section>' +
      '<section class="ck-card"><div class="ck-row"><h3>Sanctuary</h3><span class="ck-small">' + esc(s.companions.length) + '/' + esc(s.rosterCap) + '</span></div>' +
      '<div class="ck-roster">' + s.companions.map(function (c) { return companionCard(s, c, away); }).join('') + '</div></section>';
  }

  function companionCard(s, c, away) {
    var open = state.openCompanion === c.id;
    var p = s.party;
    var inParty = p.members.indexOf(c.id) >= 0;
    var foods = s.inventory.filter(function (i) { return i.kind === 'FOOD'; });
    var status = c.onExpedition ? chip('On expedition', 'is-away') : c.helping ? chip('Helping your knight', 'is-help') : inParty ? chip('In company', 'is-on') : '';
    var evo = c.evolution;
    var body = '';
    if (open) {
      var slotButtons = '';
      if (!away && !inParty) {
        for (var i = 0; i < p.slots; i++) {
          slotButtons += '<button type="button" class="ck-pill" data-act="party-set" data-slot="' + i + '" data-id="' + esc(c.id) + '">' +
            esc(p.positions[i].charAt(0) + p.positions[i].slice(1).toLowerCase()) + '</button>';
        }
        if (p.reserveUnlocked && p.reserveId !== c.id) {
          slotButtons += '<button type="button" class="ck-pill" data-act="party-reserve" data-id="' + esc(c.id) + '">Reserve</button>';
        }
      }
      body = '<div class="ck-comp-body">' +
        '<div class="ck-stats"><span>HP <b>' + esc(c.stats.health) + '</b></span><span>ATK <b>' + esc(c.stats.attack) + '</b></span>' +
          '<span>DEF <b>' + esc(c.stats.defense) + '</b></span><span>SPD <b>' + esc(c.stats.speed) + '</b></span></div>' +
        '<p class="ck-small">Behaviour: ' + esc(c.behavior) + ' · ' + esc(c.expeditions) + ' expeditions · ' + esc(c.battlesWon) + ' battles won</p>' +
        '<p class="ck-small' + (c.bondTechnique.unlocked ? ' is-ready' : '') + '"><b>Bond 50 · ' + esc(c.bondTechnique.name) + ':</b> ' +
          esc(c.bondTechnique.text) + '</p>' +
        (slotButtons ? '<div class="ck-pills"><span class="ck-small">Place in company:</span>' + slotButtons + '</div>' : '') +
        (!c.onExpedition ? '<div class="ck-pills">' + (c.helping
          ? '<button type="button" class="ck-pill" data-act="helper" data-id="">Stop helping</button>'
          : '<button type="button" class="ck-pill" data-act="helper" data-id="' + esc(c.id) + '">Help the knight\'s work</button>') + '</div>' : '') +
        (!c.onExpedition && foods.length ? '<div class="ck-pills"><span class="ck-small">Treat (' + esc(c.treatsLeft) + ' left today):</span>' +
          foods.map(function (f) {
            var loves = (f.prefers || []).indexOf(c.elementLabel) >= 0;
            return '<button type="button" class="ck-pill' + (loves ? ' is-love' : '') + '" data-act="feed" data-id="' + esc(c.id) + '" data-food="' + esc(f.id) + '"' +
              (c.treatsLeft <= 0 ? ' disabled' : '') + '>' + esc(f.name) + ' ×' + esc(f.qty) + (loves ? ' ♥' : '') + '</button>';
          }).join('') + '</div>' : '') +
        (evo ? '<div class="ck-evo"><b>Evolves into ' + esc(evo.to) + '</b>' + (evo.toClass !== c.class ? ' <span class="ck-small">(becomes ' + esc(evo.toClass) + ')</span>' : '') +
          '<span class="ck-small">Needs level ' + esc(evo.level) + ' · ' + evo.cost.map(function (x) {
            return esc(x.qty) + ' ' + esc(x.name) + ' (' + esc(x.have) + ')';
          }).join(', ') + '</span>' +
          '<button type="button" class="ck-btn is-sm' + (evo.ready ? ' is-primary' : '') + '" data-act="evolve" data-id="' + esc(c.id) + '"' + (evo.ready ? '' : ' disabled') + '>Evolve</button></div>' : '') +
        '<div class="ck-pills"><button type="button" class="ck-link" data-act="rename" data-id="' + esc(c.id) + '">Rename</button></div>' +
      '</div>';
    }
    return '<article class="ck-comp' + (open ? ' is-open' : '') + '" style="--el:var(--' + elKey(c.element) + ')">' +
      '<button type="button" class="ck-comp-head" data-act="comp-toggle" data-id="' + esc(c.id) + '" aria-expanded="' + open + '">' +
        portrait(c, 240) +
        '<span class="ck-comp-main"><span class="ck-row"><b>' + esc(c.nickname) + '</b><span class="ck-small">Lv ' + esc(c.level) + '/' + esc(c.levelCap) + '</span></span>' +
          '<span class="ck-chips">' + elChip(c.element, c.elementLabel) + chip(c.class) + (c.nickname !== c.species ? chip(c.species) : '') + status + '</span>' +
          '<span class="ck-meter"><span class="ck-small">' + (c.level >= c.levelCap
            ? (c.evolution ? 'Max level · ready to evolve' : 'Max level') : 'XP') + '</span>' +
            (c.level >= c.levelCap ? bar(1, 1, 'is-max') : bar(c.xpInto, c.xpSpan)) + '</span>' +
          '<span class="ck-meter"><span class="ck-small">Bond ' + esc(c.bond) + ' · ' + esc(c.bondTitle) + '</span>' + bar(c.bondInto, c.bondSpan, 'is-bond') + '</span>' +
        '</span>' +
      '</button>' + body + '</article>';
  }

  // Work ───────────────────────────────────────────────────────────────────

  function viewWork(s) {
    var a = s.activity;
    var current = a
      ? '<section class="ck-card ck-now"><p class="ck-kicker">Your knight is working</p><h2>' + esc(a.name) + '</h2>' +
        '<p class="ck-small">' + esc(a.skill) + ' · ' + esc(a.output) + (a.place ? ' · ' + esc(a.place) : '') +
        ' · one every ' + esc(Math.round(a.actionMs / 100) / 10) + 's' + (a.left != null ? ' · ' + esc(a.left) + ' more possible' : '') + '</p>' +
        '<span class="ck-bar is-live"><i data-live="activity"></i></span>' +
        '<p class="ck-small">' + (a.helper ? esc(a.helper) + ' is helping.' : 'Assign a helper Siegeling from the Company tab to work faster.') +
        ' Keeps running offline for up to ' + esc(a.offlineCapHours) + 'h.</p>' +
        '<div class="ck-actions"><button type="button" class="ck-btn" data-act="activity-stop">Rest</button></div></section>'
      : '<section class="ck-card ck-now"><p class="ck-kicker">Your knight is resting</p><h2>Pick a task below</h2>' +
        '<p class="ck-small">Gathering and idle crafting run while you are away (up to 12 hours).</p></section>';
    var bySkill = {};
    s.activities.forEach(function (x) { (bySkill[x.skill] = bySkill[x.skill] || []).push(x); });
    var gather = Object.keys(bySkill).map(function (skill) {
      return '<h4>' + esc(skill) + '</h4><div class="ck-tasks">' + bySkill[skill].map(function (x) {
        var on = a && a.kind === 'gather' && a.id === x.id;
        return '<button type="button" class="ck-task' + (on ? ' is-on' : '') + '" data-act="activity" data-kind="gather" data-id="' + esc(x.id) + '"' +
          (x.unlocked ? '' : ' disabled') + '><b>' + esc(x.name) + '</b><span class="ck-small">' + esc(x.output) + ' · ' + esc(x.seconds) + 's · +' + esc(x.xp) + 'xp</span>' +
          (x.bonus ? '<span class="ck-small">+ ' + esc(x.bonus) + '</span>' : '') +
          '<span class="ck-small ck-muted">' + (x.unlocked ? 'Helpers: ' + esc(x.helpers.join(', ')) : 'Needs ' + esc(x.lockText)) + '</span></button>';
      }).join('') + '</div>';
    }).join('');
    var recipesBySkill = {};
    var hiddenStudies = 0;
    s.recipes.forEach(function (r) {
      // Twelve study rows would bury the list; show the essences the knight actually holds.
      if (r.kind === 'STUDY' && !(r.inputs[0] && r.inputs[0].have > 0) && !(a && a.id === r.id)) { hiddenStudies++; return; }
      (recipesBySkill[r.skill] = recipesBySkill[r.skill] || []).push(r);
    });
    var crafts = Object.keys(recipesBySkill).map(function (skill) {
      return '<h4>' + esc(skill) + '</h4><div class="ck-recipes">' + recipesBySkill[skill].map(function (r) { return recipeRow(r, a); }).join('') + '</div>';
    }).join('');
    return current +
      '<section class="ck-card"><h3>Gathering</h3>' + gather + '</section>' +
      '<section class="ck-card"><h3>Crafting</h3><p class="ck-muted">Bars, potions, lures and meals can be worked idly. ' +
        'Gear is forged once.</p>' + crafts +
      (hiddenStudies ? '<p class="ck-small ck-muted">Elemental Studies: collect other elements&#39; essences from battles to study them too.</p>' : '') +
      '</section>';
  }

  function recipeRow(r, a) {
    var on = a && a.kind === 'craft' && a.id === r.id;
    var inputs = r.inputs.map(function (i) {
      return '<span class="' + (i.have >= i.qty ? '' : 'is-short') + '">' + esc(i.qty) + ' ' + esc(i.name) + ' (' + esc(i.have) + ')</span>';
    }).join(', ');
    var buttons;
    if (!r.unlocked) buttons = '<span class="ck-small ck-muted">Needs ' + esc(r.missing.join(', ')) + '</span>';
    else if (r.repeatable) {
      buttons = '<button type="button" class="ck-pill' + (on ? ' is-on' : '') + '" data-act="activity" data-kind="craft" data-id="' + esc(r.id) + '"' +
        (r.canMake > 0 ? '' : ' disabled') + '>' + (on ? 'Working' : 'Work idly') + '</button>' +
        '<button type="button" class="ck-pill" data-act="craft" data-id="' + esc(r.id) + '" data-qty="1"' + (r.canMake > 0 ? '' : ' disabled') + '>' +
          (r.kind === 'STUDY' ? 'Study 1' : 'Make 1') + '</button>' +
        (r.canMake >= 5 ? '<button type="button" class="ck-pill" data-act="craft" data-id="' + esc(r.id) + '" data-qty="5">' +
          (r.kind === 'STUDY' ? 'Study 5' : 'Make 5') + '</button>' : '');
    } else if (r.owned) buttons = '<span class="ck-small is-ready">Owned</span>';
    else buttons = '<button type="button" class="ck-pill is-forge" data-act="craft" data-id="' + esc(r.id) + '" data-qty="1"' +
      (r.canMake > 0 ? '' : ' disabled') + '>Forge</button>';
    return '<div class="ck-recipe' + (r.unlocked ? '' : ' is-locked') + '"><div class="ck-row"><b>' + esc(r.output.name) + '</b>' +
      '<span class="ck-small">Lv ' + esc(r.level) + ' · +' + esc(r.xp) + 'xp</span></div>' +
      '<span class="ck-small ck-muted">' + esc(r.output.blurb) + '</span>' +
      '<span class="ck-small">' + inputs + '</span>' +
      (r.requirements.length ? '<span class="ck-small">Also needs ' + esc(r.requirements.join(', ')) + '</span>' : '') +
      '<div class="ck-pills">' + buttons + '</div></div>';
  }

  // Expedition ─────────────────────────────────────────────────────────────

  function timelineHtml(rows) {
    return '<ol class="ck-timeline">' + (rows || []).map(function (r) {
      var t = new Date(r.at);
      var hh = t.getHours(); var mm = t.getMinutes();
      return '<li class="is-' + esc(r.tone) + '"><time>' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + '</time>' +
        '<span>' + esc(r.text) + '</span></li>';
    }).join('') + '</ol>';
  }

  function viewExpedition(s) {
    var e = s.expedition;
    if (e) {
      return '<section class="ck-card ck-now" style="--el:var(--' + elKey(e.element) + ')"><p class="ck-kicker">' + esc(e.region) + '</p>' +
        '<h2>' + esc(e.route) + '</h2>' +
        (e.done
          ? '<p class="ck-good">The company is home.</p><div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="collect">Welcome them home</button></div>'
          : '<span class="ck-bar is-live"><i data-live="exp-bar"></i></span><p class="ck-small">Returns in <b data-live="exp-left"></b>' +
            (e.technique ? ' · Prepared: ' + esc(e.technique) : '') + (e.combo ? ' · ' + esc(e.combo) : '') + '</p>') +
        '</section>' +
        '<section class="ck-card"><h3>The road so far</h3>' + timelineHtml(e.timeline) +
        (e.done ? '' : '<p class="ck-small ck-muted">News arrives as it happens.</p>') + '</section>';
    }
    var t = s.tactics;
    var techniques = s.affinities.filter(function (a) { return a.technique.unlocked; });
    var potions = s.inventory.filter(function (i) { return i.kind === 'POTION'; });
    var runes = s.inventory.filter(function (i) { return i.kind === 'RUNE'; });
    var members = s.party.members.filter(Boolean).map(companion).filter(Boolean);
    var partyLine = members.length ? members.map(function (c) { return esc(c.nickname) + ' (' + esc(c.elementLabel) + ' ' + esc(c.class) + ')'; }).join(', ') : 'No one assigned';
    return '' +
      '<section class="ck-card"><h3>Prepare</h3>' +
        '<p class="ck-small">Company: ' + partyLine + ' · <button type="button" class="ck-link" data-act="tab" data-tab="company">Change</button></p>' +
        '<div class="ck-tactics">' +
          '<label class="ck-field"><span>Retreat below <b>' + esc(t.retreatAt) + '%</b> company health</span>' +
            '<input type="range" min="0" max="60" step="5" value="' + esc(t.retreatAt) + '" data-tactic="retreatAt"></label>' +
          '<label class="ck-field"><span>Give potions below <b>' + esc(t.potionAt) + '%</b> health</span>' +
            '<input type="range" min="0" max="80" step="5" value="' + esc(t.potionAt) + '" data-tactic="potionAt"></label>' +
          '<label class="ck-field"><span>Use your weapon command</span><select data-tactic="trigger">' + t.triggers.map(function (o) {
            return '<option value="' + esc(o.id) + '"' + (o.id === t.trigger ? ' selected' : '') + '>' + esc(o.label) + '</option>';
          }).join('') + '</select></label>' +
          '<label class="ck-field"><span>Prepared technique</span><select data-tactic="techniqueId"><option value="">None</option>' +
            techniques.map(function (a) {
              return '<option value="' + esc(a.technique.id) + '"' + (a.technique.id === t.techniqueId ? ' selected' : '') + '>' +
                esc(a.technique.name) + ' (' + esc(a.label) + ')</option>';
            }).join('') + '</select>' +
            (techniques.length ? '' : '<span class="ck-small ck-muted">Reach Affinity 10 with an element to learn its technique.</span>') + '</label>' +
          (s.combos.some(function (c) { return c.unlocked; })
            ? '<label class="ck-field"><span>Prepared combination</span><select data-tactic="comboId"><option value="">None</option>' +
              s.combos.filter(function (c) { return c.unlocked; }).map(function (c) {
                return '<option value="' + esc(c.id) + '"' + (c.id === t.comboId ? ' selected' : '') + '>' + esc(c.name) +
                  ' (' + esc(c.labels.join(' + ')) + ')</option>';
              }).join('') + '</select></label>' : '') +
        '</div>' +
        '<h4>Supplies</h4>' + (potions.length ? '<div class="ck-supplies">' + potions.map(function (p) {
          var n = Math.min(state.supplies[p.id] || 0, p.qty);
          return '<div class="ck-supply"><span>' + esc(p.name) + ' <span class="ck-small">(' + esc(p.qty) + ')</span></span>' +
            '<span class="ck-stepper"><button type="button" data-act="supply" data-id="' + esc(p.id) + '" data-d="-1" aria-label="Fewer">−</button>' +
            '<b>' + n + '</b><button type="button" data-act="supply" data-id="' + esc(p.id) + '" data-d="1" aria-label="More">+</button></span></div>';
        }).join('') + '</div>' : '<p class="ck-small ck-muted">No potions. Brew Herb Tonics at Alchemy.</p>') +
        (runes.length ? '<h4>Rune (one per expedition, spent on the road)</h4><div class="ck-pills">' +
          '<button type="button" class="ck-pill' + (state.rune ? '' : ' is-on') + '" data-act="rune" data-id="">None</button>' +
          runes.map(function (r) {
            return '<button type="button" class="ck-pill' + (state.rune === r.id ? ' is-on' : '') + '" data-act="rune" data-id="' + esc(r.id) +
              '" title="' + esc(r.blurb) + '">' + esc(r.name) + ' ×' + esc(r.qty) + '</button>';
          }).join('') + '</div>' : '') +
      '</section>' +
      '<section class="ck-card"><h3>Destinations</h3><div class="ck-routes">' + s.routes.map(routeCard).join('') + '</div></section>';
  }

  function routeCard(r) {
    return '<article class="ck-route' + (r.unlocked ? '' : ' is-locked') + '" style="--el:var(--' + elKey(r.element) + ')">' +
      '<div class="ck-row"><b>' + esc(r.name) + '</b>' + chip(r.type.charAt(0) + r.type.slice(1).toLowerCase(), 'is-type') + '</div>' +
      '<span class="ck-chips">' + elChip(r.element, r.elementLabel) + chip(r.minutes + ' min') + chip('Lv ' + r.levels) +
        (r.taming ? chip('Taming', 'is-help') : '') + (r.boss ? chip('Boss: ' + r.boss, 'is-boss') : '') + '</span>' +
      '<span class="ck-small">' + esc(r.blurb) + '</span>' +
      (r.hazardText ? '<span class="ck-small ck-warn">' + esc(r.hazardText) + '</span>' : '') +
      '<span class="ck-small ck-muted">Finds: ' + esc(r.loot.join(', ')) + '</span>' +
      '<div class="ck-actions">' + (r.unlocked
        ? '<button type="button" class="ck-btn is-primary is-sm" data-act="launch" data-id="' + esc(r.id) + '">Send the company</button>'
        : '<span class="ck-small">Opens at Rank ' + esc(r.rankReq) + '</span>') + '</div></article>';
  }

  // Wilds ──────────────────────────────────────────────────────────────────

  var BEHAVIOR_TIPS = {
    gentle: 'Gentle: a patient approach works well.',
    skittish: 'Skittish: flees when approached. A lure works far better than patience.',
    aggressive: 'Aggressive: hard to calm. A bonded partner helps.',
    lone: 'Lone: wary of other Siegelings. Patience or a lure.',
    pack: 'Pack: responds to a bonded partner of its element.'
  };

  function viewWilds(s) {
    if (!s.sightings.length) {
      return '<section class="ck-card ck-now"><h2>No fresh trails</h2><p class="ck-muted">Hunts and patrols can spot wild Siegelings. ' +
        'Each sighting waits 48 hours for you to try taming it. Every Siegeling you tame is its own individual with its own bond.</p>' +
        '<div class="ck-actions"><button type="button" class="ck-btn" data-act="tab" data-tab="expedition">Plan a hunt</button></div></section>';
    }
    return s.sightings.map(function (w) {
      var o = w.odds;
      var left = w.expiresAt - serverNow();
      return '<section class="ck-card ck-wild" style="--el:var(--' + elKey(w.element) + ')">' +
        '<div class="ck-wild-head">' + portrait(w, 320) + '<div><p class="ck-kicker">A wild Siegeling appears!</p><h2>' + esc(w.species) + '</h2>' +
        '<span class="ck-chips">' + elChip(w.element, w.elementLabel) + chip(w.class) + chip('Lv ' + w.level) + chip(w.rarity.charAt(0) + w.rarity.slice(1).toLowerCase()) + '</span>' +
        '<p class="ck-small">' + esc(BEHAVIOR_TIPS[w.behavior] || w.behavior) + '</p>' +
        '<p class="ck-small ck-muted">Spotted on ' + esc(w.route) + ' · trail goes cold in ' + esc(duration(left)) + '</p></div></div>' +
        '<div class="ck-approaches">' +
          approach('Patient Approach', 'Uses your Taming skill. Costs nothing.', o.patient, 'data-act="tame" data-id="' + esc(w.id) + '" data-plan="patient"') +
          approach('Partner Approach', o.partner == null ? 'Needs a ' + esc(w.elementLabel) + ' Siegeling at Bond 10 or higher.' :
            esc(o.partnerName) + ' coaxes it closer.', o.partner, 'data-act="tame" data-id="' + esc(w.id) + '" data-plan="partner"') +
          (o.lures.length ? o.lures.map(function (l) {
            return approach(l.name, 'Spends one lure (' + esc(l.qty) + ' left).', l.chance,
              'data-act="tame" data-id="' + esc(w.id) + '" data-plan="lure" data-lure="' + esc(l.id) + '"');
          }).join('') : approach('Lure', 'Brew lures at Alchemy. Element lures work best.', null, '')) +
        '</div>' +
        '<div class="ck-actions"><button type="button" class="ck-link" data-act="tame" data-id="' + esc(w.id) + '" data-plan="leave">Let it go</button></div>' +
      '</section>';
    }).join('');
  }

  function approach(name, text, chance, attrs) {
    var ok = chance != null && attrs;
    return '<button type="button" class="ck-approach"' + (ok ? ' ' + attrs : ' disabled') + '><b>' + esc(name) + '</b>' +
      '<span class="ck-small">' + text + '</span>' + (chance != null ? '<span class="ck-odds">' + esc(chance) + '%</span>' : '') + '</button>';
  }

  // ── live ticking ─────────────────────────────────────────────────────────

  function tick() {
    var s = state.snap;
    if (!s) return;
    var now = serverNow();
    if (s.activity) {
      var a = s.activity;
      var into = (a.remainderMs + (now - a.lastTickAt)) % a.actionMs;
      Array.prototype.forEach.call(document.querySelectorAll('[data-live="activity"]'), function (el) {
        el.style.width = pct(into, a.actionMs) + '%';
      });
    }
    var e = s.expedition;
    if (e) {
      var total = e.completesAt - e.startedAt;
      var left = e.completesAt - now;
      Array.prototype.forEach.call(document.querySelectorAll('[data-live="exp-bar"]'), function (el) {
        el.style.width = pct(now - e.startedAt, total) + '%';
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-live="exp-left"]'), function (el) {
        el.textContent = e.done ? 'Home!' : left > 0 ? duration(left) : 'arriving…';
      });
      if (!e.done && left <= -1500 && !state.busy && !state.refreshing) {
        state.refreshing = true;
        load().then(function () { state.refreshing = false; });
      }
    }
  }

  // ── events ───────────────────────────────────────────────────────────────

  document.addEventListener('click', function (ev) {
    var tabBtn = ev.target.closest('#ckTabs button[data-tab]');
    if (tabBtn) { switchTab(tabBtn.dataset.tab); return; }
    var el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var d = el.dataset;
    switch (d.act) {
      case 'reload': load(); break;
      case 'tab': switchTab(d.tab); break;
      case 'close-modal': closeModal(); render(); break;
      case 'ack-away': closeModal(); act('/api/chronicles/away/ack', {}); break;
      case 'oath-pick':
        state.oathPick = d.id;
        Array.prototype.forEach.call(document.querySelectorAll('.ck-starter'), function (b) {
          b.classList.toggle('is-picked', b.dataset.id === d.id);
        });
        break;
      case 'oath':
        api('/api/chronicles/start', { starterId: state.oathPick, knightName: ($('ckOathName') || {}).value || '', requestId: requestId() })
          .then(function (data) {
            if (data.error) { toast(data.error, 'bad'); return; }
            state.tab = 'work';
            saveTab('work');
            accept(data);
          });
        break;
      case 'equip': act('/api/chronicles/equip', { itemId: d.id }); break;
      case 'affinity': showAffinity(d.id); break;
      case 'activity': act('/api/chronicles/activity', { kind: d.kind, id: d.id }); break;
      case 'activity-stop': act('/api/chronicles/activity', { kind: '', id: '' }); break;
      case 'craft': act('/api/chronicles/craft', { recipeId: d.id, quantity: Number(d.qty) || 1 }); break;
      case 'comp-toggle': state.openCompanion = state.openCompanion === d.id ? '' : d.id; render(); break;
      case 'helper': act('/api/chronicles/helper', { companionId: d.id }); break;
      case 'feed': act('/api/chronicles/feed', { companionId: d.id, foodId: d.food }); break;
      case 'evolve': act('/api/chronicles/evolve', { companionId: d.id }); break;
      case 'rename': {
        var c = companion(d.id);
        var name = window.prompt('A new name for ' + (c ? c.nickname : 'your Siegeling') + ':', c ? c.nickname : '');
        if (name != null) act('/api/chronicles/rename', { companionId: d.id, nickname: name });
        break;
      }
      case 'party-set': case 'party-clear': case 'party-reserve': changeParty(d); break;
      case 'supply': {
        var have = invQty(d.id);
        var total = Object.keys(state.supplies).reduce(function (n, k) { return n + (state.supplies[k] || 0); }, 0);
        var next = Math.max(0, Math.min(have, (state.supplies[d.id] || 0) + Number(d.d)));
        if (Number(d.d) > 0 && total >= 20) { toast('A company can carry 20 potions.', 'warn'); break; }
        state.supplies[d.id] = next;
        render();
        break;
      }
      case 'rune': state.rune = d.id || ''; render(); break;
      case 'launch': {
        var supplies = {};
        Object.keys(state.supplies).forEach(function (k) { if (state.supplies[k] > 0) supplies[k] = Math.min(state.supplies[k], invQty(k)); });
        if (state.rune && invQty(state.rune) > 0) supplies[state.rune] = 1;
        act('/api/chronicles/expedition/launch', { routeId: d.id, supplies: supplies }, function () { state.supplies = {}; state.rune = ''; });
        break;
      }
      case 'collect':
        act('/api/chronicles/expedition/collect', {}, function (data) { if (data.report) showReport(data.report, data.events); });
        break;
      case 'tame':
        act('/api/chronicles/tame', { sightingId: d.id, strategy: d.plan, lureId: d.lure || '' }, function (data) {
          var t = data.taming || {};
          if (t.result === 'tamed') { state.openCompanion = t.companionId || ''; }
        });
        break;
      default: break;
    }
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target.closest('[data-tactic]');
    if (!el) return;
    var body = {};
    var key = el.dataset.tactic;
    body[key] = el.type === 'range' ? Number(el.value) : el.value;
    act('/api/chronicles/tactics', body);
  });

  document.addEventListener('input', function (ev) {
    var el = ev.target.closest('input[type="range"][data-tactic]');
    if (!el) return;
    var label = el.parentNode.querySelector('b');
    if (label) label.textContent = el.value + '%';
  });

  function changeParty(d) {
    var p = state.snap.party;
    var members = [0, 1, 2].map(function (i) { return p.members[i] || ''; });
    var reserve = p.reserveId || '';
    if (d.act === 'party-clear') members[Number(d.slot)] = '';
    else if (d.act === 'party-set') {
      members = members.map(function (m) { return m === d.id ? '' : m; });
      members[Number(d.slot)] = d.id;
      if (reserve === d.id) reserve = '';
    } else if (d.act === 'party-reserve') {
      members = members.map(function (m) { return m === d.id ? '' : m; });
      reserve = d.id;
    }
    act('/api/chronicles/party', { members: members, reserveId: reserve });
  }

  function switchTab(tab) {
    state.tab = tab;
    saveTab(tab);
    main.scrollTop = 0;
    render();
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !$('ckModal').hidden && $('ckModal').dataset.kind === 'report') { closeModal(); render(); }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.snap) load();
  });

  setInterval(tick, 1000);
  load();

  // Test hook: headless checks inject a snapshot without a server.
  window.__ckAccept = accept;
})();
