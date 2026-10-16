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
  var KIND_LABEL = { WILD: 'Wild fight', PACK: 'Pack fight', ELITE: 'Elite', KNIGHT: 'SiegeKnight boss' };

  var state = {
    options: null,
    run: null,
    deckId: null,
    knightId: null,
    tab: 'deck',
    busy: false
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
  function realFace(card) {
    var v = window.SieglingsCardBinderVisual;
    if (!v || !v.renderBinderCardTile || !card) return '';
    var showcase = window.SieglingsCardShowcase;
    var text = showcase && showcase.resolveCardDescriptionText
      ? showcase.resolveCardDescriptionText(card, card.description)
      : (card.description || '');
    try {
      return v.renderBinderCardTile(card, { descriptionText: text || '' }) || '';
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

  function miniHtml(card) {
    var face = realFace(card);
    if (face) {
      return '<div class="gt-mini gt-mini-real" data-el="' + esc(card.element) + '" title="' + esc(card.name) + '"><div class="gt-face">' + face + '</div></div>';
    }
    return '<div class="gt-mini" data-el="' + esc(card.element) + '"><div class="gt-card-art">' + artHtml(card) + '</div><span>' + esc(card.name) + '</span></div>';
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

  function abilityText(label, ability) {
    if (!ability) return '';
    return '<p class="gt-ability"><b>' + esc(label) + ': ' + esc(ability.name || '') + '</b> &mdash; ' + esc(ability.description || '') + '</p>';
  }

  // ---- render ---------------------------------------------------------

  function render() {
    var run = state.run;
    renderStats(run);
    if (!run) {
      renderStart();
      setScreen('start');
      return;
    }
    switch (run.phase) {
      case 'DRAFT': renderDraft(run); setScreen('draft'); break;
      case 'CAMP': renderCamp(run); setScreen('camp'); break;
      case 'REWARD': renderReward(run); setScreen('reward'); break;
      case 'LEVEL_UP': renderLevel(run); setScreen('level'); break;
      case 'BATTLE': setScreen('battle'); break;
      case 'OVER': renderOver(run); setScreen('over'); break;
      default: setScreen('start');
    }
    fitFaces();
    var main = $('gtMain');
    if (main && render.lastPhase !== run.phase) main.scrollTop = 0;
    render.lastPhase = run.phase;
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
    fitFaces();
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
    var box = $('gtEncounter');
    box.setAttribute('data-el', enc.element || 'NEUTRAL');
    var knight = enc.knight
      ? '<div class="gt-knight-panel" style="margin-top:10px">' + knightArt(enc.knight)
        + '<div><b>' + esc(enc.knight.name) + '</b>' + abilityText('Passive', enc.knight.passive) + abilityText('Active', enc.knight.active) + '</div></div>'
      : '';
    box.innerHTML = '<div class="gt-encounter-kind">Floor ' + esc(enc.floor) + ' &middot; Act ' + esc(run.act) + ' &middot; ' + esc(KIND_LABEL[enc.kind] || '') + '</div>'
      + '<h2>' + esc(enc.name || '') + '</h2>'
      + '<p>' + esc(enc.blurb || '') + '</p>'
      + '<div class="gt-encounter-hp"><span class="gt-hp">Enemy ' + esc(enc.enemyHp) + ' HP</span>'
      + '<span class="gt-hp is-you">You ' + esc(run.maxHealth) + ' HP</span>'
      + '<span class="gt-hp is-you">Hand ' + esc(run.openingHand) + '</span></div>'
      + (enc.board && enc.board.length ? '<div class="gt-mini-label">Already on the board</div><div class="gt-mini-row">' + enc.board.map(miniHtml).join('') + '</div>' : '')
      + (enc.roster && enc.roster.length ? '<div class="gt-mini-label">In its deck (' + esc(enc.deckCount) + ')</div><div class="gt-mini-row">' + enc.roster.map(miniHtml).join('') + '</div>' : '')
      + knight;
    $('gtFightBtn').textContent = (enc.kind === 'KNIGHT' ? 'Challenge ' : 'Fight ') + (enc.name || ('floor ' + run.floor));

    renderTabs();
    $('gtDeckNote').textContent = run.deck.length + ' cards. Tap a card to forge it'
      + (run.freeForges ? ' (' + run.freeForges + ' free).' : ' (gold cost shown on the card).');
    $('gtDeck').innerHTML = run.deck.map(function (card) {
      return cardHtml(card, { attrs: 'data-uid="' + esc(card.uid) + '"' });
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

  function renderShop(run) {
    $('gtShop').innerHTML = (run.shop || []).map(function (item) {
      var afford = run.gold >= item.price;
      if (item.kind === 'CARD' && item.card) {
        return cardHtml(item.card, {
          price: item.sold ? 'Sold' : item.price,
          cls: item.sold ? 'is-sold' : '',
          attrs: 'data-buy="' + esc(item.id) + '"' + (afford ? '' : ' data-cant="1"')
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
      + '<div><h2 class="gt-h2" style="margin-top:0">' + esc(k.name || 'SiegeKnight') + '</h2>'
      + '<div class="gt-card-meta"><span>Level <b>' + esc(k.level) + '</b> / ' + esc(k.maxLevel) + '</span>'
      + '<span>Power <b>' + esc(k.powerLevel) + '</b></span></div>'
      + '<div class="gt-xp" title="XP"><i style="width:' + xpPct + '%"></i></div>'
      + '<p class="gt-muted" style="margin:0 0 8px">' + (k.xpToNext ? esc(k.xp) + ' / ' + esc(k.xpToNext) + ' XP to the next level. Wins give 1 XP, elites 2, SiegeKnights 4.' : 'Maximum level.') + '</p>'
      + abilityText('Passive', k.passive) + abilityText('Active', k.active)
      + '<p class="gt-muted">Perks: ' + esc(perkBits.length ? perkBits.join(', ') : 'none yet. Each level-up offers one.') + '</p>'
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
      return cardHtml(card, { attrs: 'data-reward="' + esc(card.id) + '"' });
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

  function openSheet(html) {
    $('gtSheetContent').innerHTML = html;
    $('gtSheet').hidden = false;
    fitFaces();
  }

  function closeSheet() {
    $('gtSheet').hidden = true;
    $('gtSheetContent').innerHTML = '';
  }

  function sheetHead(card) {
    var type = TYPE_LABEL[card.type] || card.type;
    var stats = card.type === 'SIEGLING'
      ? '<span>HP <b>' + esc(card.health) + '</b></span><span>SPD <b>' + esc(card.speed) + '</b></span>'
      : (card.costAmount != null ? '<span>Cost <b>' + esc(card.costAmount) + '</b></span>' : '');
    var lines = card.moves && card.moves.length
      ? card.moves.map(abilityLine).join('')
      : (card.ability ? abilityLine({ name: 'Effect', description: card.ability.description, energy: 0 }) : '');
    var face = realFace(card);
    var picture = face ? '<div class="gt-sheet-face"><div class="gt-face">' + face + '</div></div>' : '<div class="gt-card-art">' + artHtml(card) + '</div>';
    return '<div class="gt-sheet-head' + (face ? ' has-real-face' : '') + '" data-el="' + esc(card.element) + '">' + picture
      + '<div><h2>' + esc(card.name) + '</h2><div class="gt-card-meta">' + chip(card.element)
      + '<span>' + esc(type) + '</span>' + (card.level ? '<span>Level <b>' + esc(card.level) + '</b> / ' + esc(card.maxLevel) + '</span>' : '') + stats + '</div>'
      + (card.evolvesFromName ? '<p class="gt-muted" style="margin:6px 0 0">Evolves from ' + esc(card.evolvesFromName) + '.</p>' : '')
      + '</div></div>'
      + (lines ? '<ul class="gt-moves" style="margin-top:12px" data-el="' + esc(card.element) + '">' + lines + '</ul>' : '')
      + (card.upgrades && card.upgrades.length ? '<div class="gt-upgrades" style="margin-top:10px">' + card.upgrades.map(function (u) { return '<span>' + esc(u) + '</span>'; }).join('') + '</div>' : '');
  }

  function showForge(uid) {
    var run = state.run;
    var card = findDeckCard(uid);
    if (!run || !card) return;
    var offers = run.forgeOffers && run.forgeOffers[uid];
    var html = sheetHead(card);
    if (card.level >= card.maxLevel) {
      openSheet(html + '<p class="gt-forge-head">Fully forged</p>');
      return;
    }
    var price = run.freeForges > 0 ? 'Free (' + run.freeForges + ' left)' : card.forgeCost + ' gold';
    html += '<h3 class="gt-forge-head">Forge &middot; ' + esc(price) + '</h3>';
    if (!offers) {
      html += '<p class="gt-muted">See three upgrades for this card. Opening the forge does not spend anything.</p>'
        + '<button type="button" class="gt-btn gt-btn-primary" data-offer="' + esc(uid) + '">Show upgrades</button>';
    } else {
      var cantPay = run.freeForges <= 0 && run.gold < card.forgeCost;
      html += '<div class="gt-forge-options">' + offers.map(function (option, index) {
        return '<button type="button" class="gt-forge-option" data-apply="' + index + '" data-uid="' + esc(uid) + '"' + (cantPay ? ' disabled' : '') + '>'
          + esc(option.label) + '<small>' + esc(upgradeHint(option)) + '</small></button>';
      }).join('') + '</div>'
        + (cantPay ? '<p class="gt-muted">You need ' + esc(card.forgeCost) + ' gold to forge this card.</p>' : '');
    }
    openSheet(html);
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

  function showCard(card) {
    openSheet(sheetHead(card));
  }

  function showRemovePicker(itemId) {
    var run = state.run;
    var html = '<h2>Remove a card</h2><p class="gt-muted">Pick the card to cut from your deck.</p><div class="gt-remove-list">'
      + run.deck.map(function (card) {
        return cardHtml(card, { attrs: 'data-remove="' + esc(card.uid) + '" data-item="' + esc(itemId) + '"', showUpgrades: false });
      }).join('') + '</div>';
    openSheet(html);
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
      var t = event.target.closest ? event.target.closest('[data-deck],[data-knight],[data-uid],[data-buy],[data-reward],[data-perk],[data-offer],[data-apply],[data-remove],[data-close],[data-tab]') : null;
      if (!t) return;
      if (t.hasAttribute('data-close')) { closeSheet(); return; }
      if (t.hasAttribute('data-tab')) {
        state.tab = t.getAttribute('data-tab');
        renderTabs();
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
      if (t.hasAttribute('data-buy')) {
        if (t.getAttribute('data-kind') === 'REMOVE') { showRemovePicker(t.getAttribute('data-buy')); return; }
        if (t.hasAttribute('data-cant')) { toast('Not enough gold.'); return; }
        act('shop/buy', { itemId: t.getAttribute('data-buy') }).then(function (run) { if (run) toast('Bought.', true); });
        return;
      }
      if (t.hasAttribute('data-reward')) {
        act('reward', { cardId: t.getAttribute('data-reward') });
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
