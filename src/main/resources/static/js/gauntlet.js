/* The Gauntlet page: renders the run the server owns (/api/gauntlet/**) and hands
   each floor's fight to the Battle Table (/play?gauntlet=1). No rule lives here;
   every button is one POST that returns the whole run. */
(function () {
  'use strict';

  var RUN_TOKEN_KEY = 'sieglingsGauntletToken';
  var SOLO_TOKEN_KEY = 'sieglingsSoloSessionToken';
  var AUTH_TOKEN_KEY = 'sieglingsAuthToken';
  var COOKIE_SESSION_VALUE = 'cookie';
  var API_TIMEOUT_MS = 60000;

  var ICON_WEBP = { FIRE: 1, EARTH: 1, ICE: 1, WIND: 1 };
  var TYPE_LABEL = { SIEGLING: 'Siegeling', SPELL: 'Strategy', TRAP: 'Deception' };
  var SELECT_TO_VIEW = 'Select to view moves';
  var KIND_LABEL = { WILD: 'Wild fight', PACK: 'Pack fight', ELITE: 'Elite', KNIGHT: 'SiegeKnight boss' };

  var state = {
    options: null,
    run: null,
    deckId: null,
    knightId: null,
    tab: 'deck',
    // The next-floor box: 'details' (HP, blurb, boss) or 'cards' (what the room holds).
    encTab: 'details',
    busy: false,
    // Cards drawn in the encounter preview, indexed by data-enemy-view.
    enemyCards: []
  };

  // ---- plumbing -----------------------------------------------------

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function store(key, value) {
    try {
      if (value) { localStorage.setItem(key, value); } else { localStorage.removeItem(key); }
    } catch (e) { /* storage unavailable: the run still works for this page view */ }
  }

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function authHeaders(extra) {
    var headers = extra || {};
    var token = read(AUTH_TOKEN_KEY) || '';
    if (token && token !== COOKIE_SESSION_VALUE && !headers.Authorization) {
      headers.Authorization = 'Bearer ' + token;
    }
    return headers;
  }

  function api(path, method, body) {
    var headers = authHeaders({ 'Content-Type': 'application/json' });
    var runToken = read(RUN_TOKEN_KEY);
    if (runToken) headers['X-Gauntlet-Token'] = runToken;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, API_TIMEOUT_MS) : null;
    return fetch('/api/gauntlet/' + path, {
      method: method || 'GET',
      headers: headers,
      credentials: 'include',
      cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return { error: 'The server sent an unreadable reply (' + r.status + ').' }; });
    }, function (e) {
      return { error: e && e.name === 'AbortError' ? 'The request timed out. Try again.' : 'Could not reach the server.' };
    }).then(function (data) {
      if (timer) clearTimeout(timer);
      return data || { error: 'Empty reply.' };
    });
  }

  var toastTimer = null;
  function toast(message, info) {
    var node = $('gtToast');
    if (!node || !message) return;
    node.textContent = message;
    node.classList.toggle('is-info', !!info);
    node.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 3800);
  }

  /** Runs one action; on success installs the returned run and redraws. */
  function act(path, body) {
    if (state.busy) return Promise.resolve(null);
    state.busy = true;
    document.body.classList.add('is-busy');
    return api(path, 'POST', body).then(function (data) {
      state.busy = false;
      document.body.classList.remove('is-busy');
      if (data.error) {
        toast(data.error);
        return null;
      }
      setRun(data);
      return data;
    });
  }

  function setRun(run) {
    state.run = run;
    if (run && run.token) store(RUN_TOKEN_KEY, run.token);
    render();
  }

  function setScreen(name) {
    document.body.dataset.screen = name;
  }

  // ---- shared renderers -----------------------------------------------

  function elementIcon(element) {
    var el = String(element || 'NEUTRAL').toLowerCase();
    return ICON_WEBP[String(element || '').toUpperCase()]
      ? '/img/elements/element-' + el + '-96.webp'
      : '/img/elements/element-' + el + '.svg';
  }

  // Last-resort art when the shared renderer is missing: the creature image, and the
  // element sigil in its place if that image fails to load (never a broken-image box).
  function artHtml(item) {
    var url = item && item.cardArtUrl ? String(item.cardArtUrl) : '';
    var icon = elementIcon(item && item.element);
    if (url) {
      var v = window.SieglingsCardBinderVisual;
      var attrs = v && v.artImgAttrs ? v.artImgAttrs(url, 480) : 'src="' + esc(url) + '"';
      return '<img ' + attrs + ' alt="" loading="lazy" decoding="async" data-fallback="' + esc(icon) + '">';
    }
    return '<img class="is-icon" src="' + esc(icon) + '" alt="" loading="lazy">';
  }

  function chip(element) {
    var name = String(element || 'NEUTRAL');
    return '<span class="gt-chip" data-el="' + esc(name) + '">' + esc(name.charAt(0) + name.slice(1).toLowerCase()) + '</span>';
  }

  // Moves arrive in the Battle Table's shape (energyCost/isPassive); knight abilities
  // in the Gauntlet's (energy/passive).
  function abilityLine(ability) {
    if (!ability) return '';
    var energy = ability.energy != null ? ability.energy : ability.energyCost;
    var cost = energy > 0 ? '<span class="gt-cost">' + esc(energy) + '</span>' : '';
    var passive = (ability.passive || ability.isPassive) ? ' <em>(passive)</em>' : '';
    return '<li><b>' + esc(ability.name) + '</b>' + cost + passive + ' &mdash; ' + esc(ability.description || '') + '</li>';
  }

  /**
   * The real card face, drawn by the same renderer as the binder and the battle hand
   * (card-binder-visual.js over game.js): frame, notches, art placement, printed moves.
   * The server sends each card in the Battle Table's own JSON, forged upgrades included.
   */
  function realFace(card, inTray) {
    var v = window.SieglingsCardBinderVisual;
    if (!v || !v.renderBinderCardTile || !card) return '';
    var options;
    if (String(card.type || '').toUpperCase() === 'SIEGLING' && !inTray) {
      // A Siegeling's moves are what the Gauntlet forges, and they do not fit the face's
      // panel legibly; the panel points at the tray that lists them in full.
      options = { summaryMode: 'description', descriptionText: SELECT_TO_VIEW };
    } else {
      var showcase = window.SieglingsCardShowcase;
      var text = showcase && showcase.resolveCardDescriptionText
        ? showcase.resolveCardDescriptionText(card, card.description)
        : (card.description || '');
      options = { descriptionText: text || '' };
    }
    try {
      return v.renderBinderCardTile(card, options) || '';
    } catch (e) {
      return '';
    }
  }

  function cardHtml(card, opts) {
    opts = opts || {};
    var face = realFace(card);
    if (!face) return plainCardHtml(card, opts);
    var attrs = opts.attrs || '';
    var tag = opts.tag || 'button';
    var level = card.level && card.level > 1 ? '<span class="gt-card-level">Lv ' + esc(card.level) + '</span>' : '';
    var upgrades = (card.upgrades && card.upgrades.length && opts.showUpgrades !== false)
      ? '<div class="gt-upgrades">' + card.upgrades.map(function (u) { return '<span>' + esc(u) + '</span>'; }).join('') + '</div>'
      : '';
    var price = opts.price != null ? '<div class="gt-card-price">' + esc(opts.price) + (typeof opts.price === 'number' ? ' gold' : '') + '</div>' : '';
    var foot = upgrades || price ? '<div class="gt-card-foot">' + upgrades + price + '</div>' : '';
    return '<' + tag + (tag === 'button' ? ' type="button"' : '') + ' class="gt-card gt-card-real' + (opts.cls ? ' ' + opts.cls : '') + '" data-el="' + esc(card.element) + '" aria-label="' + esc(card.name) + '" ' + attrs + '>'
      + '<div class="gt-face">' + face + level + '</div>' + foot
      + '</' + tag + '>';
  }

  function plainCardHtml(card, opts) {
    var type = TYPE_LABEL[card.type] || card.type || '';
    var level = card.level && card.level > 1 ? '<span class="gt-card-level">Lv ' + esc(card.level) + '</span>' : '';
    var meta = '<span class="gt-rarity gt-rarity-' + esc(card.rarity) + '">' + esc(String(card.rarity || '').toLowerCase()) + '</span>';
    if (card.type === 'SIEGLING') {
      meta += '<span>HP <b>' + esc(card.health) + '</b></span><span>SPD <b>' + esc(card.speed) + '</b></span>';
    } else if (card.costAmount != null) {
      meta += '<span>Cost <b>' + esc(card.costAmount) + '</b></span>';
    }
    var lines = '';
    if (card.moves && card.moves.length) {
      lines = card.moves.filter(function (m) { return !(m.passive || m.isPassive); }).map(abilityLine).join('');
    } else if (card.ability) {
      lines = abilityLine({ name: 'Effect', description: card.ability.description, energy: 0 });
    }
    var upgrades = (card.upgrades && card.upgrades.length && opts.showUpgrades !== false)
      ? '<div class="gt-upgrades">' + card.upgrades.map(function (u) { return '<span>' + esc(u) + '</span>'; }).join('') + '</div>'
      : '';
    var price = opts.price != null ? '<div class="gt-card-price">' + esc(opts.price) + (typeof opts.price === 'number' ? ' gold' : '') + '</div>' : '';
    var attrs = opts.attrs || '';
    var tag = opts.tag || 'button';
    return '<' + tag + (tag === 'button' ? ' type="button"' : '') + ' class="gt-card' + (opts.cls ? ' ' + opts.cls : '') + '" data-el="' + esc(card.element) + '" ' + attrs + '>'
      + '<div class="gt-card-art">' + artHtml(card) + level + '<span class="gt-card-type">' + esc(type) + '</span></div>'
      + '<div class="gt-card-body">'
      + '<div class="gt-card-name">' + esc(card.name) + '</div>'
      + '<div class="gt-card-meta">' + meta + '</div>'
      + (lines ? '<ul class="gt-moves">' + lines + '</ul>' : '')
      + upgrades + price
      + '</div></' + tag + '>';
  }

  /** A small enemy card; selecting it opens the same tray, view only. tag marks board cards. */
  function miniHtml(card, tag) {
    state.enemyCards.push(card);
    var key = ' data-enemy-view="' + (state.enemyCards.length - 1) + '" aria-label="' + esc(card.name) + '"';
    var badge = tag ? '<span class="gt-mini-tag">' + esc(tag) + '</span>' : '';
    var face = realFace(card);
    if (face) {
      return '<button type="button" class="gt-mini gt-mini-real" data-el="' + esc(card.element) + '" title="' + esc(card.name) + '"' + key + '><div class="gt-face">' + face + '</div>' + badge + '</button>';
    }
    return '<button type="button" class="gt-mini" data-el="' + esc(card.element) + '"' + key + '><div class="gt-card-art">' + artHtml(card) + '</div><span>' + esc(card.name) + '</span>' + badge + '</button>';
  }

  function renderEncTabs() {
    var box = $('gtEncounter');
    if (!box) return;
    var tabs = box.querySelectorAll('[data-enc-tab]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-enc-tab') === state.encTab;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    var pages = box.querySelectorAll('[data-enc-page]');
    for (var j = 0; j < pages.length; j++) {
      pages[j].hidden = pages[j].getAttribute('data-enc-page') !== state.encTab;
    }
  }

  /**
   * A SiegeKnight's printed card. Mirrors the hub's knightCard (home-redesign.js), which
   * in turn mirrors home.js, using the same classes so style.css dresses it identically.
   */
  function knightFace(knight) {
    var v = window.SieglingsCardBinderVisual;
    if (!v || !knight) return '';
    var rarity = String(knight.rarity || 'common').toLowerCase();
    var el = String(knight.element || 'NEUTRAL').toLowerCase();
    var elTitle = el.charAt(0).toUpperCase() + el.slice(1);
    var passive = knight.passive && knight.passive.description ? knight.passive.description : '';
    var body = '<div class="knight-card-body">'
      + '<span class="knight-card-name">' + esc(knight.name) + '</span>'
      + '<span class="knight-card-meta"><span class="knight-element">' + esc(elTitle) + '</span> '
      + '<span class="knight-tier tier-' + esc(String(knight.tier || 'siegeknight').toLowerCase()) + '">' + esc(knight.tier || 'SiegeKnight') + '</span> '
      + '<span class="knight-rarity rarity-' + esc(rarity) + '">' + esc(rarity.charAt(0).toUpperCase() + rarity.slice(1)) + '</span></span>'
      + (passive ? '<span class="knight-card-ability"><span>Passive</span>' + esc(passive) + '</span>' : '')
      + '</div>';
    try {
      if (v.usesFullCardArt && v.usesFullCardArt(knight) && knight.cardArtUrl) {
        var crop = v.buildArtTransformStyle ? v.buildArtTransformStyle(knight) : '';
        var attrs = v.artImgAttrs ? v.artImgAttrs(knight.cardArtUrl, 640) : 'src="' + esc(knight.cardArtUrl) + '"';
        return '<div class="knight-card knight-full-card-art knight-binder-card rarity-frame-' + esc(rarity) + ' el-' + esc(el) + '" role="img" aria-label="' + esc(knight.name) + '">'
          + '<img ' + attrs + ' alt="' + esc(knight.name) + '" loading="lazy"' + (crop ? ' style="' + esc(crop) + '"' : '') + '>'
          + body + '</div>';
      }
      if (v.usesKnightOverlayArt && v.usesKnightOverlayArt(knight)) {
        var tplClass = v.knightTemplateClass ? v.knightTemplateClass(knight) : '';
        return '<div class="knight-card knight-full-card-art knight-overlay-art' + tplClass + ' knight-binder-card rarity-frame-' + esc(rarity) + ' el-' + esc(el)
          + '" style="--knight-color:' + v.elementColor(knight.element)
          + ";--knight-card-back:url('/img/knights/card-back-siegeknight.png');--knight-card-template:url('/img/knights/siegeknight-card-template.png')\">"
          + v.renderKnightOverlayArtWindow(knight)
          + '<div class="knight-card-template" aria-hidden="true"></div>' + body + '</div>';
      }
    } catch (e) { /* fall through to the plain portrait */ }
    return '';
  }

  function knightArt(knight) {
    var face = knightFace(knight);
    if (face) {
      return '<div class="gt-knight-art gt-knight-real" data-el="' + esc(knight && knight.element) + '">' + face + '</div>';
    }
    return '<div class="gt-knight-art" data-el="' + esc(knight && knight.element) + '">' + artHtml(knight) + '</div>';
  }

  /** Text fitting the shared renderer expects after its markup lands. */
  function fitFaces() {
    var showcase = window.SieglingsCardShowcase;
    var v = window.SieglingsCardBinderVisual;
    try {
      if (showcase && showcase.scheduleFramedSummaryFit) showcase.scheduleFramedSummaryFit();
      if (showcase && showcase.scheduleSiegeKnightCardFit) showcase.scheduleSiegeKnightCardFit();
      if (v && v.scheduleDescriptionFit) v.scheduleDescriptionFit();
    } catch (e) { /* fitting is cosmetic */ }
  }

  /**
   * Sizes the cards in every visible .gt-fit rail so the page never scrolls vertically.
   * A card is a face whose height scales with its width plus a fixed caption, so two
   * measuring passes give height(w) = a*w + f. Then it picks the row count that makes
   * the cards largest while all of them fit. If that is narrower than the rail's
   * data-min, the cards flow into rows that scroll sideways instead, using the most
   * rows that keep them at least data-min wide.
   */
  function fitRails(root) {
    var rails = (root || document).querySelectorAll('.gt-fit');
    for (var i = 0; i < rails.length; i++) fitRail(rails[i]);
  }

  function fitRail(rail) {
    var items = rail.children;
    var n = items.length;
    if (!n || !rail.clientHeight || !rail.clientWidth) return;
    var minW = Number(rail.getAttribute('data-min')) || 104;
    var maxW = Number(rail.getAttribute('data-max')) || 240;
    rail.classList.remove('is-fit', 'is-strip');
    rail.classList.add('is-measuring');
    rail.style.gridTemplateColumns = '';
    function tallest(width) {
      rail.style.setProperty('--card-w', width + 'px');
      var h = 0;
      for (var k = 0; k < n; k++) h = Math.max(h, items[k].offsetHeight);
      return h;
    }
    var h1 = tallest(100);
    var h2 = tallest(200);
    rail.classList.remove('is-measuring');
    var slope = (h2 - h1) / 100;
    var fixed = Math.max(0, h1 - slope * 100);
    var style = window.getComputedStyle(rail);
    var gap = parseFloat(style.columnGap) || 10;
    var rowGap = parseFloat(style.rowGap) || gap;
    // A couple of pixels' slack: faces round their heights up.
    var W = rail.clientWidth - 1;
    var H = rail.clientHeight - 3;
    function widthForRows(rows, height) {
      if (slope < 0.05) return Infinity;
      return ((height - (rows - 1) * rowGap) / rows - fixed) / slope;
    }
    var best = null;
    for (var r = 1; r <= n; r++) {
      var cols = Math.ceil(n / r);
      var w = Math.min((W - (cols - 1) * gap) / cols, widthForRows(r, H), maxW);
      if (!best || w > best.w) best = { rows: r, cols: cols, w: w };
    }
    if (best.w >= minW) {
      rail.classList.add('is-fit');
      rail.style.setProperty('--card-w', Math.floor(best.w) + 'px');
      rail.style.gridTemplateColumns = 'repeat(' + best.cols + ', var(--card-w))';
      rail.style.gridTemplateRows = '';
      return;
    }
    // Strip: leave room for the scrollbar, then the most rows that stay readable.
    var stripH = H - 8;
    var rows = 1;
    while (rows < n && widthForRows(rows + 1, stripH) >= minW) rows++;
    var stripW = Math.max(Math.min(widthForRows(rows, stripH), maxW), 40);
    rail.classList.add('is-strip');
    rail.style.setProperty('--card-w', Math.floor(stripW) + 'px');
    rail.style.gridTemplateRows = 'repeat(' + rows + ', auto)';
  }

  /** Fit the rails, then let the shared renderer fit text to the new card sizes. */
  function layout(root) {
    fitRails(root);
    fitFaces();
  }

  var layoutFrame = 0;
  function scheduleLayout() {
    if (layoutFrame) return;
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    layoutFrame = raf(function () {
      layoutFrame = 0;
      layout(document);
    });
  }

  function abilityText(label, ability) {
    if (!ability) return '';
    return '<p class="gt-ability"><b>' + esc(label) + ': ' + esc(ability.name || '') + '</b> &mdash; ' + esc(ability.description || '') + '</p>';
  }

  // ---- render ---------------------------------------------------------

  function render() {
    var run = state.run;
    renderStats(run);
    if (!run) {
      setScreen('start');
      renderStart();
      return;
    }
    if (run.phase !== 'CAMP') $('gtBanner').hidden = true;
    switch (run.phase) {
      case 'DRAFT': renderDraft(run); setScreen('draft'); break;
      case 'CAMP': renderCamp(run); setScreen('camp'); break;
      case 'REWARD': renderReward(run); setScreen('reward'); break;
      case 'LEVEL_UP': renderLevel(run); setScreen('level'); break;
      case 'BATTLE': setScreen('battle'); break;
      case 'OVER': renderOver(run); setScreen('over'); break;
      default: setScreen('start');
    }
    layout(document);
    var log = $('gtLog');
    if (log) log.scrollLeft = log.scrollWidth;
  }

  function renderStats(run) {
    var box = $('gtStats');
    if (!box) return;
    if (!run || run.phase === 'DRAFT') { box.hidden = true; return; }
    box.hidden = false;
    var hearts = '';
    for (var i = 0; i < run.maxLives; i++) hearts += i < run.lives ? '&#9829;' : '&#9825;';
    $('gtLives').innerHTML = '<span style="color:var(--bad)">' + hearts + '</span>';
    $('gtGold').textContent = run.gold + ' gold';
    $('gtForges').hidden = !run.freeForges;
    $('gtForges').textContent = run.freeForges + ' free forge' + (run.freeForges === 1 ? '' : 's');
  }

  function renderStart() {
    var options = state.options;
    var resume = $('gtResume');
    var saved = read(RUN_TOKEN_KEY);
    if (resume) resume.hidden = true;
    if (!options) return;
    if (!saved && options.accountRunToken && resume) {
      resume.hidden = false;
      resume.innerHTML = '<p>You have a Gauntlet run saved to your account.</p>'
        + '<button class="gt-btn gt-btn-small gt-btn-primary" type="button" id="gtResumeAccount">Continue it</button>';
      $('gtResumeAccount').onclick = function () {
        store(RUN_TOKEN_KEY, options.accountRunToken);
        loadRun();
      };
    }
    $('gtDecks').innerHTML = options.decks.map(function (deck) {
      var selected = deck.id === state.deckId ? ' is-selected' : '';
      var locked = deck.locked ? ' is-locked' : '';
      return '<button type="button" class="gt-pick' + selected + locked + '" data-deck="' + esc(deck.id) + '"' + (deck.locked ? ' aria-disabled="true"' : '') + '>'
        + (deck.locked ? '<span class="gt-pick-lock">Locked</span>' : '')
        + '<span class="gt-pick-name">' + esc(deck.name) + '</span>'
        + '<span class="gt-chips">' + deck.elements.map(chip).join('') + '</span>'
        + '</button>';
    }).join('');
    $('gtKnights').innerHTML = options.knights.map(function (knight) {
      var selected = knight.id === state.knightId ? ' is-selected' : '';
      var locked = knight.locked ? ' is-locked' : '';
      return '<button type="button" class="gt-pick gt-knight-pick' + selected + locked + '" data-knight="' + esc(knight.id) + '"' + (knight.locked ? ' aria-disabled="true"' : '') + '>'
        + (knight.locked ? '<span class="gt-pick-lock">Locked</span>' : '')
        + knightArt(knight)
        + '<span class="gt-pick-caption"><span class="gt-pick-name">' + esc(knight.name) + '</span>'
        + '<span class="gt-pick-sub">' + esc(knight.passive ? knight.passive.name : '') + '</span></span>'
        + '</button>';
    }).join('');
    $('gtStartBtn').disabled = !(state.deckId && state.knightId);
    layout(document);
  }

  function renderDraft(run) {
    $('gtDraftNote').textContent = 'Ten cards drafted from ' + run.deckName + ': Siegelings, Strategies and Deceptions in balance. '
      + (run.draftRerollAvailable ? 'You may redraw the whole set once.' : 'Redraw used.');
    $('gtDraftCards').innerHTML = run.deck.map(function (card) {
      return cardHtml(card, { attrs: 'data-uid="' + esc(card.uid) + '"' });
    }).join('');
    $('gtRerollBtn').disabled = !run.draftRerollAvailable;
  }

  function renderCamp(run) {
    var banner = $('gtBanner');
    var last = run.lastBattle;
    if (last && banner) {
      banner.hidden = false;
      banner.className = 'gt-banner ' + (last.won ? 'is-win' : (last.encounter ? 'is-loss' : ''));
      banner.innerHTML = last.won
        ? '<b>Floor ' + esc(last.floor) + ' cleared.</b> +' + esc(last.gold) + ' gold, +' + esc(last.xp) + ' XP. ' + esc(last.note || '')
        : (last.encounter ? '<b>Defeated by ' + esc(last.encounter) + '.</b> ' : '') + esc(last.note || '');
      // Clamped inside, not on the padded box, or a third line peeks into the padding.
      banner.title = banner.textContent;
      banner.innerHTML = '<span class="gt-clamp">' + banner.innerHTML + '</span>';
    } else if (banner) {
      banner.hidden = true;
    }

    $('gtTrack').innerHTML = (run.track || []).map(function (stop) {
      var cls = 'gt-stop' + (stop.cleared ? ' is-cleared' : '') + (stop.current ? ' is-current' : '')
        + (stop.kind === 'ELITE' ? ' is-elite' : '') + (stop.kind === 'KNIGHT' ? ' is-knight' : '');
      var label = stop.kind === 'KNIGHT' ? '&#9819;' : (stop.kind === 'ELITE' ? '&#9733;' : esc(stop.floor));
      var title = 'Floor ' + stop.floor + (stop.kind === 'KNIGHT' ? ': SiegeKnight' : stop.kind === 'ELITE' ? ': Elite' : '');
      return '<div class="' + cls + '" title="' + esc(title) + '">' + label + '</div>';
    }).join('');

    var enc = run.nextEncounter || {};
    state.enemyCards = [];
    var box = $('gtEncounter');
    box.setAttribute('data-el', enc.element || 'NEUTRAL');
    // Two pages in one fixed box: the floor's details, and the cards it holds sized to
    // fill the box (a .gt-fit rail like the deck's).
    var board = enc.board || [];
    var roster = enc.roster || [];
    var minis = board.map(function (card) { return miniHtml(card, 'Board'); }).join('')
      + roster.map(function (card) { return miniHtml(card); }).join('')
      + (enc.knight ? '<button type="button" class="gt-mini gt-mini-knight" data-enemy-knight="1" aria-label="' + esc(enc.knight.name) + '">'
        + knightArt(enc.knight) + '<span class="gt-mini-tag">Boss</span></button>' : '');
    var cardCount = board.length + roster.length + (enc.knight ? 1 : 0);
    if (!cardCount) state.encTab = 'details';
    var counts = [];
    if (board.length) counts.push(board.length + ' on the board');
    if (roster.length) counts.push(roster.length === enc.deckCount ? enc.deckCount + ' in its deck' : roster.length + ' of ' + esc(enc.deckCount) + ' in its deck');
    if (enc.knight) counts.push('its SiegeKnight');
    var abilities = enc.knight ? abilityText('Passive', enc.knight.passive) + abilityText('Active', enc.knight.active) : '';
    box.innerHTML = '<div class="gt-enc-top">'
      + '<div class="gt-encounter-kind">Floor ' + esc(enc.floor) + ' &middot; Act ' + esc(run.act) + ' &middot; ' + esc(KIND_LABEL[enc.kind] || '') + '</div>'
      + (cardCount ? '<div class="gt-enc-tabs" role="tablist">'
        + '<button type="button" role="tab" data-enc-tab="details">Details</button>'
        + '<button type="button" role="tab" data-enc-tab="cards">Cards <span>' + cardCount + '</span></button></div>' : '')
      + '</div>'
      + '<h2>' + esc(enc.name || '') + '</h2>'
      + '<div class="gt-enc-page" data-enc-page="details">'
      + '<div class="gt-encounter-hp"><span class="gt-hp">Enemy ' + esc(enc.enemyHp) + ' HP</span>'
      + '<span class="gt-hp is-you">You ' + esc(run.maxHealth) + ' HP</span>'
      + '<span class="gt-hp is-you">Hand ' + esc(run.openingHand) + '</span></div>'
      + '<div class="gt-enc-text">' + (enc.blurb ? '<p class="gt-enc-blurb">' + esc(enc.blurb) + '</p>' : '') + abilities + '</div>'
      + '</div>'
      + (cardCount ? '<div class="gt-enc-page" data-enc-page="cards">'
        + '<p class="gt-muted gt-note gt-enc-count">' + counts.join(' &middot; ') + '</p>'
        + '<div class="gt-fit gt-foe-rail" data-min="52" data-max="150">' + minis + '</div></div>' : '');
    renderEncTabs();
    $('gtFightBtn').textContent = (enc.kind === 'KNIGHT' ? 'Challenge ' : 'Fight ') + (enc.name || ('floor ' + run.floor));

    renderTabs();
    $('gtDeckNote').textContent = run.deck.length + ' cards. Select one to see its moves and forge it'
      + (run.freeForges ? ' (' + run.freeForges + ' free forge' + (run.freeForges === 1 ? '' : 's') + ').' : '.');
    $('gtDeck').innerHTML = run.deck.map(function (card) {
      return cardHtml(card, { attrs: 'data-uid="' + esc(card.uid) + '"', showUpgrades: false });
    }).join('');
    renderShop(run);
    renderKnight(run);
    $('gtLog').innerHTML = (run.journal || []).map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('');
  }

  function renderTabs() {
    var buttons = document.querySelectorAll('.gt-tabs button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-active', buttons[i].getAttribute('data-tab') === state.tab);
      buttons[i].setAttribute('aria-selected', buttons[i].getAttribute('data-tab') === state.tab ? 'true' : 'false');
    }
    var panels = document.querySelectorAll('.gt-tab');
    for (var j = 0; j < panels.length; j++) {
      panels[j].hidden = panels[j].getAttribute('data-panel') !== state.tab;
    }
  }

  function switchTab(tab) {
    state.tab = tab;
    renderTabs();
    layout(document.querySelector('.gt-camp-panel'));
    if (tab === 'log') { var log = $('gtLog'); if (log) log.scrollLeft = log.scrollWidth; }
  }

  function renderShop(run) {
    $('gtShop').innerHTML = (run.shop || []).map(function (item) {
      var afford = run.gold >= item.price;
      if (item.kind === 'CARD' && item.card) {
        return cardHtml(item.card, {
          price: item.sold ? 'Sold' : item.price,
          cls: item.sold ? 'is-sold' : '',
          attrs: 'data-shop-view="' + esc(item.id) + '"'
        });
      }
      var title = item.kind === 'LIFE' ? 'Mend a life' : 'Remove a card';
      var text = item.kind === 'LIFE'
        ? 'Restore one lost life (max ' + run.maxLives + ').'
        : 'Thin your deck: cut one card (deck stays at least ' + (run.rules ? run.rules.minDeck : 6) + ').';
      var disabled = item.sold || !afford || (item.kind === 'LIFE' && run.lives >= run.maxLives);
      return '<div class="gt-service"><div><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></div>'
        + '<button type="button" class="gt-btn gt-btn-small' + (disabled ? '' : ' gt-btn-primary') + '" data-buy="' + esc(item.id) + '" data-kind="' + esc(item.kind) + '"' + (disabled ? ' disabled' : '') + '>'
        + (item.sold ? 'Done' : esc(item.price) + ' gold') + '</button></div>';
    }).join('');
  }

  function renderKnight(run) {
    var k = run.knight || {};
    var xpPct = k.xpToNext ? Math.round((k.xp / k.xpToNext) * 100) : 100;
    var perks = k.perks || {};
    var perkBits = [];
    if (perks.VITALITY) perkBits.push('Vitality x' + perks.VITALITY);
    if (perks.COMMAND) perkBits.push('Command x' + perks.COMMAND);
    if (perks.TACTICS) perkBits.push('Tactics x' + perks.TACTICS);
    if (perks.PLUNDER) perkBits.push('Plunder x' + perks.PLUNDER);
    $('gtKnight').innerHTML = '<div class="gt-knight-panel">' + knightArt(k)
      + '<div class="gt-knight-text"><h2 class="gt-h2">' + esc(k.name || 'SiegeKnight') + '</h2>'
      + '<div class="gt-card-meta"><span>Level <b>' + esc(k.level) + '</b> / ' + esc(k.maxLevel) + '</span>'
      + '<span>Power <b>' + esc(k.powerLevel) + '</b></span></div>'
      + '<div class="gt-xp" title="XP"><i style="width:' + xpPct + '%"></i></div>'
      + '<p class="gt-muted gt-note" style="margin:0 0 6px">' + (k.xpToNext ? esc(k.xp) + ' / ' + esc(k.xpToNext) + ' XP to the next level. Wins give 1 XP, elites 2, SiegeKnights 4.' : 'Maximum level.') + '</p>'
      + abilityText('Passive', k.passive) + abilityText('Active', k.active)
      + '<p class="gt-muted gt-note">Perks: ' + esc(perkBits.length ? perkBits.join(', ') : 'none yet. Each level-up offers one.') + '</p>'
      + '</div></div>';
  }

  function renderReward(run) {
    var last = run.lastBattle || {};
    $('gtVictory').innerHTML = '<h2>Floor ' + esc(last.floor) + ' cleared</h2>'
      + '<p class="gt-muted">' + esc(last.encounter || '') + ' falls.</p>'
      + '<div class="gt-spoils"><span class="gt-stat gt-gold">+' + esc(last.gold) + ' gold</span>'
      + '<span class="gt-stat">+' + esc(last.xp) + ' XP</span>'
      + (last.note ? '<span class="gt-stat gt-forge">' + esc(last.note) + '</span>' : '') + '</div>';
    $('gtRewardCards').innerHTML = (run.rewardOptions || []).map(function (card) {
      return cardHtml(card, { attrs: 'data-reward-view="' + esc(card.id) + '"' });
    }).join('');
    $('gtSkipBtn').textContent = 'Skip (+' + (run.rewardSkipGold || 0) + ' gold)';
  }

  function renderLevel(run) {
    var k = run.knight || {};
    $('gtLevelHead').innerHTML = '<h2>' + esc(k.name || 'Your SiegeKnight') + ' reached level ' + esc(k.level) + '</h2>'
      + '<p class="gt-muted">Its passive and active grow with every level. Choose a perk as well.</p>';
    $('gtPerks').innerHTML = (run.perkOptions || []).map(function (perk) {
      return '<button type="button" class="gt-perk" data-perk="' + esc(perk.key) + '"><h3>' + esc(perk.title) + '</h3><p>' + esc(perk.text) + '</p></button>';
    }).join('');
  }

  function renderOver(run) {
    var cleared = Math.max(0, (run.bestFloor || 1) - 1);
    $('gtOver').innerHTML = '<h2>The run is over</h2>'
      + '<p>You cleared <b>' + esc(cleared) + '</b> floor' + (cleared === 1 ? '' : 's') + ' with ' + esc(run.deckName) + '.</p>'
      + '<p class="gt-muted">SiegeKnight level ' + esc(run.knight && run.knight.level) + ', ' + esc(run.deck.length) + ' cards, ' + esc(run.gold) + ' gold left.</p>';
  }

  // ---- card sheet / forge ---------------------------------------------

  function findDeckCard(uid) {
    var deck = (state.run && state.run.deck) || [];
    for (var i = 0; i < deck.length; i++) if (deck[i].uid === uid) return deck[i];
    return null;
  }

  /** kind 'picker' gives the sheet a fixed height so its card rail can fit into it. */
  function openSheet(html, kind) {
    $('gtSheetContent').innerHTML = html;
    $('gtSheet').querySelector('.gt-sheet-body').classList.toggle('is-picker', kind === 'picker');
    $('gtSheet').hidden = false;
    layout($('gtSheet'));
  }

  function closeSheet() {
    $('gtSheet').hidden = true;
    $('gtSheetContent').innerHTML = '';
  }

  /**
   * The card tray: the real card, every move in full (forged numbers and added effects
   * included, since the server sends the forged copy), and the upgrades applied so far.
   * extra (forge, take, buy) goes at the end of the body.
   */
  function trayHtml(card, extra) {
    var type = TYPE_LABEL[card.type] || card.type;
    var base = card.base || null;
    var stats = card.type === 'SIEGLING'
      ? '<span>HP ' + changedValue(base && base.health, card.health) + '</span><span>SPD ' + changedValue(base && base.speed, card.speed) + '</span>'
      : (card.costAmount != null ? '<span>Cost ' + changedValue(base && base.costAmount, card.costAmount) + '</span>' : '');
    var element = base && base.element && base.element !== card.element
      ? '<span class="gt-was-chip">' + chip(base.element) + '</span>' + chip(card.element)
      : chip(card.element);
    // Inside the tray the face prints its own moves summary; the full list follows below.
    var face = realFace(card, true);
    var picture = face ? '<div class="gt-face">' + face + '</div>' : '<div class="gt-card-art">' + artHtml(card) + '</div>';
    var headline = '<h2 id="gtSheetTitle">' + esc(card.name) + '</h2><div class="gt-card-meta">' + element
      + '<span>' + esc(type) + '</span>' + (card.level ? '<span>Level <b>' + esc(card.level) + '</b> / ' + esc(card.maxLevel) + '</span>' : '') + stats + '</div>'
      + (card.evolvesFromName ? '<p class="gt-muted gt-note" style="margin:6px 0 0">Evolves from ' + esc(card.evolvesFromName) + '.</p>' : '');
    return trayLayout(card.element, picture, headline, movesSection(card) + upgradesSection(card) + (extra || ''));
  }

  function trayLayout(element, picture, headline, body) {
    return '<div class="gt-tray" data-el="' + esc(element) + '">'
      + '<div class="gt-tray-face">' + picture + '</div>'
      + '<div class="gt-tray-headline">' + headline + '</div>'
      + '<div class="gt-tray-body">' + body + '</div></div>';
  }

  /** The enemy SiegeKnight's card and abilities, view only. */
  function showKnight(knight) {
    if (!knight) return;
    var headline = '<h2 id="gtSheetTitle">' + esc(knight.name) + '</h2><div class="gt-card-meta">' + chip(knight.element) + '<span>SiegeKnight</span></div>';
    var body = '<section class="gt-tray-section"><h3>Abilities</h3>'
      + abilityText('Passive', knight.passive) + abilityText('Active', knight.active) + '</section>';
    openSheet(trayLayout(knight.element, knightArt(knight), headline, body));
  }

  /** "14" as is, or "~~14~~ 17" when an upgrade changed it. */
  function changedValue(before, after) {
    if (before == null || String(before) === String(after)) return '<b>' + esc(after) + '</b>';
    return '<s class="gt-was">' + esc(before) + '</s> <b class="gt-now">' + esc(after) + '</b>';
  }

  // Words, whitespace and punctuation as separate tokens, so "enemy" -> "enemy. Also
  // heals itself 2." diffs as an addition rather than a replaced word.
  function tokens(text) {
    return String(text || '').match(/\s+|[A-Za-z0-9'+-]+|[^\sA-Za-z0-9'+-]+/g) || [];
  }

  /**
   * The forged text with what it replaced struck through and what it added marked:
   * "Deal ~~3~~ 5 damage to 1 enemy. [Also heals itself 2.]" A token-level longest
   * common subsequence, so two upgrades on one move show as two separate edits.
   */
  function diffText(before, after) {
    if (before == null || before === after) return esc(after || '');
    var a = tokens(before);
    var b = tokens(after);
    var n = a.length;
    var m = b.length;
    var lcs = [];
    for (var i = 0; i <= n; i++) { lcs.push(new Array(m + 1).fill(0)); }
    for (var x = n - 1; x >= 0; x--) {
      for (var y = m - 1; y >= 0; y--) {
        lcs[x][y] = a[x] === b[y] ? lcs[x + 1][y + 1] + 1 : Math.max(lcs[x + 1][y], lcs[x][y + 1]);
      }
    }
    var parts = [];
    function push(kind, text) {
      var last = parts[parts.length - 1];
      if (last && last.kind === kind) { last.text += text; } else { parts.push({ kind: kind, text: text }); }
    }
    var p = 0;
    var q = 0;
    while (p < n && q < m) {
      if (a[p] === b[q]) { push('same', a[p]); p++; q++; }
      else if (lcs[p + 1][q] >= lcs[p][q + 1]) { push('was', a[p]); p++; }
      else { push('now', b[q]); q++; }
    }
    while (p < n) { push('was', a[p++]); }
    while (q < m) { push('now', b[q++]); }
    return parts.map(function (part, index) {
      if (part.kind === 'same' || !part.text.trim()) return esc(part.text);
      if (part.kind === 'was') {
        var next = parts[index + 1];
        return '<s class="gt-was">' + esc(part.text) + '</s>' + (next && next.kind === 'now' ? ' ' : '');
      }
      // A sentence added after the old text starts with the period that closes the old
      // one; that period is punctuation, not part of the upgrade.
      var lead = (part.text.match(/^[.,;:]+\s*/) || [''])[0];
      return esc(lead) + '<ins class="gt-now">' + esc(part.text.slice(lead.length)) + '</ins>';
    }).join('');
  }

  function movesSection(card) {
    var upgrades = card.upgrades || [];
    var base = card.base || null;
    var rows;
    if (card.moves && card.moves.length) {
      rows = card.moves.map(function (move, index) {
        // The unforged printing lists the same moves in the same order.
        var was = base && base.moves && base.moves[index] && base.moves[index].name === move.name ? base.moves[index] : null;
        // Upgrade labels name the move they changed ("Sundile Strike: +2 damage").
        var forged = upgrades.some(function (label) { return String(label).indexOf(move.name + ':') === 0; });
        return moveRow(move, forged, was);
      }).join('');
    } else if (card.ability) {
      var forgedEffect = card.type !== 'SIEGLING' && upgrades.length > 0;
      var wasEffect = base && base.ability ? { description: base.ability.description, energyCost: 0 } : null;
      rows = moveRow({ name: TYPE_LABEL[card.type] === 'Deception' ? 'When sprung' : 'Effect', description: card.ability.description, energyCost: 0 }, forgedEffect, wasEffect);
    } else {
      rows = '<li class="gt-muted">No moves printed.</li>';
    }
    var title = card.type === 'SIEGLING' ? 'Moves' : 'Effect';
    return '<section class="gt-tray-section"><h3>' + title + '</h3><ul class="gt-move-list" data-el="' + esc(card.element) + '">' + rows + '</ul></section>';
  }

  function moveEnergy(move) {
    return move ? (move.energy != null ? move.energy : move.energyCost) : null;
  }

  function moveRow(move, forged, was) {
    var energy = moveEnergy(move);
    var wasEnergy = was ? moveEnergy(was) : null;
    var passive = move.passive || move.isPassive;
    var cost;
    if (wasEnergy != null && wasEnergy !== energy) {
      cost = '<span class="gt-cost is-changed" title="Energy cost"><s class="gt-was">' + esc(wasEnergy) + '</s> ' + esc(energy) + '</span>';
    } else if (energy > 0) {
      cost = '<span class="gt-cost" title="Energy cost">' + esc(energy) + '</span>';
    } else {
      cost = passive ? '' : '<span class="gt-cost is-free" title="Energy cost">0</span>';
    }
    var changed = forged || (was && (was.description !== move.description || wasEnergy !== energy));
    return '<li class="gt-move' + (changed ? ' is-forged' : '') + '">'
      + '<div class="gt-move-head"><b>' + esc(move.name) + '</b>' + cost
      + (passive ? '<span class="gt-tag">Passive</span>' : '')
      + (changed ? '<span class="gt-tag is-forged">Forged</span>' : '')
      + '</div>'
      + '<p>' + diffText(was ? was.description : null, move.description || '') + '</p></li>';
  }

  /** Only the run's own cards have upgrades; offered and enemy cards print as they are. */
  function upgradesSection(card) {
    if (!card.uid) return '';
    var upgrades = card.upgrades || [];
    var body = upgrades.length
      ? '<ol class="gt-applied">' + upgrades.map(function (u) { return '<li>' + esc(u) + '</li>'; }).join('') + '</ol>'
      : '<p class="gt-muted">No upgrades yet.</p>';
    return '<section class="gt-tray-section"><h3>Upgrades applied <span class="gt-count">' + upgrades.length + ' / ' + esc((card.maxLevel || 6) - 1) + '</span></h3>' + body + '</section>';
  }

  function showForge(uid) {
    var run = state.run;
    var card = findDeckCard(uid);
    if (!run || !card) return;
    var offers = run.forgeOffers && run.forgeOffers[uid];
    if (card.level >= card.maxLevel) {
      openSheet(trayHtml(card, '<p class="gt-forge-head">Fully forged</p>'));
      return;
    }
    var price = run.freeForges > 0 ? 'Free (' + run.freeForges + ' left)' : card.forgeCost + ' gold';
    var html = '<section class="gt-tray-section"><h3 class="gt-forge-head">Forge &middot; ' + esc(price) + '</h3>';
    if (!offers) {
      html += '<p class="gt-muted gt-note" style="margin:0 0 8px">See three upgrades for this card. Opening the forge does not spend anything.</p>'
        + '<button type="button" class="gt-btn gt-btn-primary gt-btn-block" data-offer="' + esc(uid) + '">Show upgrades</button>';
    } else {
      var cantPay = run.freeForges <= 0 && run.gold < card.forgeCost;
      html += '<div class="gt-forge-options">' + offers.map(function (option, index) {
        return '<button type="button" class="gt-forge-option" data-apply="' + index + '" data-uid="' + esc(uid) + '"' + (cantPay ? ' disabled' : '') + '>'
          + esc(option.label) + '<small>' + esc(upgradeHint(option)) + '</small></button>';
      }).join('') + '</div>'
        + (cantPay ? '<p class="gt-muted gt-note">You need ' + esc(card.forgeCost) + ' gold to forge this card.</p>' : '');
    }
    openSheet(trayHtml(card, html + '</section>'));
  }

  function upgradeHint(option) {
    switch (option.type) {
      case 'HEALTH': return 'More Health on the board.';
      case 'SPEED': return 'Acts earlier in the battle phase.';
      case 'MOVE_POWER': case 'SPELL_POWER': return 'A stronger effect.';
      case 'MOVE_COST': case 'SPELL_COST': return 'Cheaper to use.';
      case 'MOVE_RIDER': case 'SPELL_RIDER': return 'Adds an extra effect after it resolves.';
      case 'ELEMENT': return 'Changes its element, weakness matchups and the energy it uses.';
      default: return '';
    }
  }

  function showCard(card, action) {
    openSheet(trayHtml(card, action ? '<div class="gt-tray-actions">' + action + '</div>' : ''));
  }

  function showReward(cardId) {
    var card = ((state.run && state.run.rewardOptions) || []).filter(function (c) { return c.id === cardId; })[0];
    if (!card) return;
    showCard(card, '<button type="button" class="gt-btn gt-btn-primary" data-reward="' + esc(card.id) + '">Take ' + esc(card.name) + '</button>');
  }

  function showShopItem(itemId) {
    var run = state.run;
    var item = ((run && run.shop) || []).filter(function (i) { return i.id === itemId; })[0];
    if (!item || !item.card) return;
    var afford = run.gold >= item.price;
    var label = item.sold ? 'Already bought' : (afford ? 'Buy for ' + item.price + ' gold' : 'Need ' + item.price + ' gold (you have ' + run.gold + ')');
    showCard(item.card, '<button type="button" class="gt-btn' + (item.sold || !afford ? '' : ' gt-btn-primary') + '" data-buy="' + esc(item.id) + '"'
      + (item.sold || !afford ? ' disabled' : '') + '>' + esc(label) + '</button>');
  }

  function showRemovePicker(itemId) {
    var run = state.run;
    var html = '<h2 id="gtSheetTitle">Remove a card</h2><p class="gt-muted gt-note">Pick the card to cut from your deck.</p><div class="gt-fit" data-min="84">'
      + run.deck.map(function (card) {
        return cardHtml(card, { attrs: 'data-remove="' + esc(card.uid) + '" data-item="' + esc(itemId) + '"', showUpgrades: false });
      }).join('') + '</div>';
    openSheet(html, 'picker');
  }

  // ---- events ---------------------------------------------------------

  function goToFight(soloToken) {
    store(SOLO_TOKEN_KEY, soloToken);
    window.location.href = '/play?gauntlet=1';
  }

  function bind() {
    document.addEventListener('error', function (event) {
      var img = event.target;
      if (!img || img.tagName !== 'IMG' || !img.getAttribute('data-fallback')) return;
      var fallback = img.getAttribute('data-fallback');
      img.removeAttribute('data-fallback');
      img.className = 'is-icon';
      img.src = fallback;
    }, true);
    document.addEventListener('click', function (event) {
      var t = event.target.closest ? event.target.closest('[data-deck],[data-knight],[data-uid],[data-buy],[data-reward],[data-reward-view],[data-shop-view],[data-enemy-view],[data-enemy-knight],[data-perk],[data-offer],[data-apply],[data-remove],[data-close],[data-tab],[data-enc-tab]') : null;
      if (!t) return;
      if (t.hasAttribute('data-close')) { closeSheet(); return; }
      if (t.hasAttribute('data-enc-tab')) {
        state.encTab = t.getAttribute('data-enc-tab');
        renderEncTabs();
        layout($('gtEncounter'));
        return;
      }
      if (t.hasAttribute('data-tab')) {
        switchTab(t.getAttribute('data-tab'));
        return;
      }
      if (t.hasAttribute('data-deck')) {
        if (t.classList.contains('is-locked')) { toast('That deck is locked. Unlock it in Decks.'); return; }
        state.deckId = t.getAttribute('data-deck');
        var deck = state.options.decks.filter(function (d) { return d.id === state.deckId; })[0];
        var recommended = deck && state.options.knights.filter(function (k) { return k.id === deck.recommendedKnightId && !k.locked; })[0];
        if (!state.knightId && recommended) state.knightId = recommended.id;
        renderStart();
        return;
      }
      if (t.hasAttribute('data-knight')) {
        if (t.classList.contains('is-locked')) { toast('Sign in or unlock that SiegeKnight from a pack first.'); return; }
        state.knightId = t.getAttribute('data-knight');
        renderStart();
        return;
      }
      if (t.hasAttribute('data-offer')) {
        var offerUid = t.getAttribute('data-offer');
        act('forge/offer', { uid: offerUid }).then(function (run) { if (run) showForge(offerUid); });
        return;
      }
      if (t.hasAttribute('data-apply')) {
        var applyUid = t.getAttribute('data-uid');
        act('forge/apply', { uid: applyUid, option: Number(t.getAttribute('data-apply')) }).then(function (run) {
          if (run) {
            toast('Forged.', true);
            showForge(applyUid);
          }
        });
        return;
      }
      if (t.hasAttribute('data-remove')) {
        act('shop/buy', { itemId: t.getAttribute('data-item'), removeUid: t.getAttribute('data-remove') }).then(function (run) {
          if (run) { closeSheet(); toast('Card removed.', true); }
        });
        return;
      }
      if (t.hasAttribute('data-reward-view')) { showReward(t.getAttribute('data-reward-view')); return; }
      if (t.hasAttribute('data-shop-view')) { showShopItem(t.getAttribute('data-shop-view')); return; }
      if (t.hasAttribute('data-enemy-knight')) {
        showKnight(state.run && state.run.nextEncounter && state.run.nextEncounter.knight);
        return;
      }
      if (t.hasAttribute('data-enemy-view')) {
        var foe = state.enemyCards[Number(t.getAttribute('data-enemy-view'))];
        if (foe) showCard(foe);
        return;
      }
      if (t.hasAttribute('data-buy')) {
        if (t.getAttribute('data-kind') === 'REMOVE') { showRemovePicker(t.getAttribute('data-buy')); return; }
        act('shop/buy', { itemId: t.getAttribute('data-buy') }).then(function (run) {
          if (run) { closeSheet(); toast('Bought.', true); }
        });
        return;
      }
      if (t.hasAttribute('data-reward')) {
        act('reward', { cardId: t.getAttribute('data-reward') }).then(function (run) { if (run) closeSheet(); });
        return;
      }
      if (t.hasAttribute('data-perk')) {
        act('perk', { perk: t.getAttribute('data-perk') });
        return;
      }
      if (t.hasAttribute('data-uid')) {
        var uid = t.getAttribute('data-uid');
        var card = findDeckCard(uid);
        if (!card) return;
        if (state.run && state.run.phase === 'CAMP') { showForge(uid); } else { showCard(card); }
      }
    });

    $('gtStartBtn').onclick = function () {
      if (!state.deckId || !state.knightId) return;
      act('start', { deckId: state.deckId, knightId: state.knightId, playerName: read('sieglingsPlayerName') || '' });
    };
    $('gtRerollBtn').onclick = function () { act('draft/reroll'); };
    $('gtBeginBtn').onclick = function () { act('begin'); };
    $('gtSkipBtn').onclick = function () { act('reward', {}); };
    $('gtFightBtn').onclick = function () {
      act('battle').then(function (data) { if (data && data.soloToken) goToFight(data.soloToken); });
    };
    $('gtResumeBattleBtn').onclick = function () {
      act('battle').then(function (data) { if (data && data.soloToken) goToFight(data.soloToken); });
    };
    $('gtAbandonBtn').onclick = function () {
      if (window.confirm('End this Gauntlet run? It cannot be resumed.')) act('abandon');
    };
    $('gtNewRunBtn').onclick = function () {
      store(RUN_TOKEN_KEY, null);
      state.run = null;
      loadOptions();
    };
    window.addEventListener('resize', scheduleLayout);
    window.addEventListener('orientationchange', scheduleLayout);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !$('gtSheet').hidden) closeSheet();
    });
  }

  // ---- boot -------------------------------------------------------------

  function loadOptions() {
    setScreen('loading');
    return api('options').then(function (data) {
      if (data.error) {
        toast(data.error);
        return;
      }
      state.options = data;
      var firstDeck = data.decks.filter(function (d) { return !d.locked; })[0];
      if (!state.deckId && firstDeck) state.deckId = firstDeck.id;
      var recommended = firstDeck && data.knights.filter(function (k) { return k.id === firstDeck.recommendedKnightId && !k.locked; })[0];
      var firstKnight = recommended || data.knights.filter(function (k) { return !k.locked; })[0];
      if (!state.knightId && firstKnight) state.knightId = firstKnight.id;
      render();
    });
  }

  function loadRun() {
    setScreen('loading');
    return api('run').then(function (data) {
      if (data.error) {
        store(RUN_TOKEN_KEY, null);
        state.run = null;
        return loadOptions();
      }
      setRun(data);
    });
  }

  bind();
  if (read(RUN_TOKEN_KEY)) {
    loadRun();
  } else {
    loadOptions();
  }
})();
