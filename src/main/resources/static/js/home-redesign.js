/* Art-first home concept. Renders three real, tappable screens from the live
   dashboard card snapshot in home-redesign-data.js, so the layout is judged
   against production Siegeling overlay art rather than grey boxes.
   ES5-flavoured on purpose: this is meant to be lifted into home.js later. */
(function () {
  'use strict';

  var EL_COLOR = {
    FIRE: '#f05b2f', EARTH: '#a7773d', WIND: '#64c987', WATER: '#3c8ed8', ICE: '#7ad9e7',
    SHADOW: '#6d4a9e', ELECTRIC: '#f5cf3d', METAL: '#aeb5b8', UNDEAD: '#9f7c73',
    PSYCHIC: '#db73b4', POISON: '#7ecb4d', LIGHT: '#ffe59a', NEUTRAL: '#95a5a6'
  };
  var EL_ICON = {
    FIRE: '/img/elements/element-fire.png', EARTH: '/img/elements/element-earth.png',
    WIND: '/img/elements/element-wind.png', WATER: '/img/elements/element-water.svg',
    ICE: '/img/elements/element-ice.png', SHADOW: '/img/elements/element-shadow.svg',
    ELECTRIC: '/img/elements/element-electric.svg', METAL: '/img/elements/element-metal.svg',
    UNDEAD: '/img/elements/element-undead.svg', PSYCHIC: '/img/elements/element-psychic.svg',
    POISON: '/img/elements/element-poison.svg', LIGHT: '/img/elements/element-light.svg',
    NEUTRAL: '/img/elements/element-neutral.svg'
  };
  // Production Land plates double as hero environments; each element gets the
  // biome that reads as its home so the backdrop and the creature agree.
  var EL_LAND = {
    FIRE: 'fire', EARTH: 'earth', WIND: 'wind', WATER: 'water', ICE: 'ice',
    ELECTRIC: 'electric', METAL: 'metal', PSYCHIC: 'psychic', SHADOW: 'shadow',
    POISON: 'poison', LIGHT: 'light', UNDEAD: 'undead', NEUTRAL: 'relic'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function color(el) { return EL_COLOR[String(el || '').toUpperCase()] || EL_COLOR.NEUTRAL; }
  function icon(el) { return EL_ICON[String(el || '').toUpperCase()] || EL_ICON.NEUTRAL; }
  function land(el) { return '/img/lands/' + (EL_LAND[String(el || '').toUpperCase()] || 'relic') + '.webp'; }
  function title(v) {
    return String(v || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  var DATA = window.HOME_CONCEPT_CARDS || { sieglings: [], knights: [] };
  var CARDS = DATA.sieglings.slice();
  function byId(id) {
    for (var i = 0; i < CARDS.length; i++) if (CARDS[i].id === id) return CARDS[i];
    return CARDS[0];
  }
  function pick(ids) {
    return ids.map(byId).filter(Boolean);
  }

  // Hand-picked so the rotation walks through distinct elements and silhouettes.
  var HERO = pick(['pylord', 'glaciemperor', 'aerovane', 'conchious', 'gymstone']);
  var FEATURED = pick(['dracosleaf', 'sheenx', 'hurricrane', 'clawqueen', 'bleetstrike', 'frostag', 'siegebot', 'solgator']);

  /* ---------- hero (rotating art, parallax, elemental motes) ---------- */

  function heroMarkup() {
    return '' +
      '<section class="sg-hero" data-hero>' +
        '<div class="sg-hero-art">' +
          '<div class="sg-hero-land" data-hero-land></div>' +
          '<div class="sg-hero-glow" data-hero-glow></div>' +
          '<div class="sg-hero-tint"></div>' +
          '<div class="sg-motes" data-motes></div>' +
        '</div>' +
        '<div class="sg-hero-figure" data-hero-figure></div>' +
        '<div class="sg-dots" data-dots></div>' +
        '<div class="sg-hero-copy">' +
          '<div class="sg-eyebrow">The Arena Awaits</div>' +
          '<h1 class="sg-hero-title" data-hero-title></h1>' +
          '<p class="sg-hero-sub" data-hero-sub></p>' +
          '<button class="sg-play" type="button">PLAY</button>' +
        '</div>' +
      '</section>';
  }

  function paintMotes(host, el) {
    var html = '';
    for (var i = 0; i < 14; i++) {
      var left = 12 + Math.random() * 76;
      var dur = 4.5 + Math.random() * 4.5;
      var delay = Math.random() * 6;
      var size = 2 + Math.random() * 4;
      html += '<span class="sg-mote" style="left:' + left.toFixed(1) + '%;bottom:' +
        (12 + Math.random() * 42).toFixed(1) + '%;width:' + size.toFixed(1) + 'px;height:' +
        size.toFixed(1) + 'px;--el:' + color(el) + ';animation-duration:' + dur.toFixed(2) +
        's;animation-delay:-' + delay.toFixed(2) + 's"></span>';
    }
    host.innerHTML = html;
  }

  function mountHero(app, opts) {
    var hero = app.querySelector('[data-hero]');
    if (!hero) return;
    var idx = (opts && opts.heroIndex) || 0;
    var landEl = hero.querySelector('[data-hero-land]');
    var glow = hero.querySelector('[data-hero-glow]');
    var figure = hero.querySelector('[data-hero-figure]');
    var dots = hero.querySelector('[data-dots]');
    var titleEl = hero.querySelector('[data-hero-title]');
    var subEl = hero.querySelector('[data-hero-sub]');
    var motes = hero.querySelector('[data-motes]');

    function paint(i) {
      var card = HERO[i % HERO.length];
      if (!card) return;
      var c = color(card.element);
      hero.style.setProperty('--el', c);
      landEl.style.backgroundImage = "url('" + land(card.element) + "')";
      glow.style.setProperty('--el', c);
      figure.style.setProperty('--elglow', c + '66');
      figure.innerHTML = '<img src="' + esc(card.cardArtUrl) + '" alt="' + esc(card.name) + '">';
      titleEl.textContent = card.name;
      subEl.innerHTML = esc(title(card.rarity)) + ' &middot; ' + esc(title(card.element)) +
        ' &middot; <b>' + esc(card.health) + ' HP</b>';
      paintMotes(motes, card.element);
      var d = '';
      for (var k = 0; k < HERO.length; k++) d += '<i class="sg-dot' + (k === i % HERO.length ? ' on' : '') + '"></i>';
      dots.innerHTML = d;
    }
    paint(idx);

    if (!opts || !opts.freeze) {
      setInterval(function () { idx += 1; paint(idx); }, 7000);
    }

    // Parallax: the plate drifts slower than the scroll, the creature faster,
    // so the hero gains depth without a second render pass.
    var scroll = app.querySelector('.sg-scroll');
    if (scroll) {
      scroll.addEventListener('scroll', function () {
        var y = scroll.scrollTop;
        landEl.style.setProperty('--par', (y * 0.28).toFixed(1) + 'px');
        figure.style.setProperty('--parf', (y * -0.10).toFixed(1) + 'px');
      }, { passive: true });
    }
  }

  /* ---------- collapsible quick-action rail ---------- */

  var QUICK = [
    { id: 'play', ico: '⚔', label: 'Play', items: [['Quick Match', 'vs AI'], ['Ranked Arena', 'Live'], ['Siege Expedition', 'Solo']] },
    { id: 'cards', ico: '◈', label: 'Cards', items: [['Binder', '412'], ['Open Packs', '3'], ['New Arrivals', '7']] },
    { id: 'decks', ico: '▤', label: 'Decks', items: [['My Decks', '6'], ['Deck Builder', ''], ['Auto Build', '']] },
    { id: 'keep', ico: '⌂', label: 'Keep', items: [['Visit Keep', ''], ['Collect Remnants', '2h']] },
    { id: 'social', ico: '☍', label: 'Social', items: [['Friends', '4 on'], ['Open Lobbies', '11']] },
    { id: 'shop', ico: '⬢', label: 'Shop', items: [['Featured Packs', ''], ['Siegelcoins', '']] }
  ];

  function railMarkup() {
    return '<div class="sg-rail" data-rail>' + QUICK.map(function (g) {
      return '<div class="sg-qa" data-qa="' + g.id + '">' +
        '<button class="sg-qa-btn" type="button"><span class="ico">' + g.ico + '</span>' +
        '<span class="lbl">' + esc(g.label) + '</span></button>' +
        '<div class="sg-qa-panel"><div><ul>' + g.items.map(function (it) {
          return '<li>' + esc(it[0]) + (it[1] ? '<span>' + esc(it[1]) + '</span>' : '') + '</li>';
        }).join('') + '</ul></div></div></div>';
    }).join('') + '</div>';
  }

  function mountRail(app, openId) {
    var rail = app.querySelector('[data-rail]');
    if (!rail) return;
    var groups = [].slice.call(rail.querySelectorAll('.sg-qa'));
    function open(target) {
      // Exactly one group is ever expanded, so the rail never grows into a wall.
      groups.forEach(function (g) { g.classList.toggle('open', g === target); });
      var bottom = app.querySelector('[data-bottom]');
      if (target && bottom) bottom.classList.remove('more-open');
    }
    groups.forEach(function (g) {
      g.querySelector('.sg-qa-btn').addEventListener('click', function () {
        open(g.classList.contains('open') ? null : g);
      });
      if (openId && g.getAttribute('data-qa') === openId) g.classList.add('open');
    });
  }

  /* ---------- content sections ---------- */

  function featuredMarkup() {
    return '' +
      '<section class="sg-section">' +
        '<div class="sg-section-head"><h3>Featured Siegelings</h3><a href="#">Gallery</a></div>' +
        '<div class="sg-swipe">' + FEATURED.map(function (c) {
          return '<article class="sg-feat" style="--el:' + color(c.element) + '">' +
            '<div class="sg-feat-plate"></div>' +
            '<div class="sg-feat-art"><img src="' + esc(c.cardArtUrl) + '" alt="' + esc(c.name) + '" loading="lazy"></div>' +
            '<div class="sg-feat-foot"><span class="sg-feat-name">' + esc(c.name) + '</span>' +
            '<span class="sg-feat-marks"><i class="sg-rar ' + esc(String(c.rarity || '').toLowerCase()) + '"></i>' +
            '<img src="' + esc(icon(c.element)) + '" alt="' + esc(title(c.element)) + '"></span></div>' +
          '</article>';
        }).join('') + '</div>' +
      '</section>';
  }

  var QUESTS = [
    ['Win 2 Arena matches', '40 🪙', true],
    ['Forge a link with 3 elements', '25 🪙', true],
    ['Open a pack', '1 Pack', false],
    ['Clear a Siege Land', '80 🪙', false]
  ];

  function questsMarkup() {
    var done = QUESTS.filter(function (q) { return q[2]; }).length;
    return '<div class="sg-strip" data-strip>' +
      '<div class="sg-strip-head"><h4>Daily Objectives</h4><span class="sep">•</span>' +
      '<span class="cnt">' + done + '/' + QUESTS.length + ' Complete</span><span class="caret">›</span></div>' +
      '<div class="sg-strip-body"><div>' + QUESTS.map(function (q) {
        return '<div class="sg-quest' + (q[2] ? ' done' : '') + '"><span class="tick">✓</span>' +
          '<span class="qt">' + esc(q[0]) + '</span><span class="qr">' + esc(q[1]) + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="sg-bar"><i style="width:' + Math.round(done / QUESTS.length * 100) + '%"></i></div>' +
    '</div>';
  }

  function deckMarkup() {
    var lead = byId('solgator');
    return '<section class="sg-section">' +
      '<div class="sg-section-head"><h3>Continue Playing</h3><a href="#">Switch</a></div>' +
      '<div class="sg-deck">' +
        '<div class="sg-deck-bg" style="background-image:url(\'' + land('FIRE') + '\')"></div>' +
        '<div class="sg-deck-veil"></div>' +
        '<div class="sg-deck-art"><img src="' + esc(lead.cardArtUrl) + '" alt="' + esc(lead.name) + '" loading="lazy"></div>' +
        '<div class="sg-deck-body">' +
          '<span class="kicker">Selected Deck</span>' +
          '<h4>Emberwaste Vanguard</h4>' +
          '<div class="sg-deck-els">' +
            '<img src="' + icon('FIRE') + '" alt="Fire">' +
            '<img src="' + icon('EARTH') + '" alt="Earth">' +
            '<img src="' + icon('METAL') + '" alt="Metal">' +
          '</div>' +
          '<div class="sg-deck-rec"><b>18W</b> · 6L &nbsp;·&nbsp; 75% win rate</div>' +
          '<button class="sg-deck-play" type="button">PLAY</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- chrome ---------- */

  function topMarkup() {
    return '<header class="sg-top">' +
      '<img class="sg-logo" src="/img/siegelings-logo.webp" alt="Siegelings">' +
      '<span class="sg-top-spacer"></span>' +
      '<span class="sg-chip coin"><img src="/img/ui/siegel-coin.webp" alt="">2,480</span>' +
      '<span class="sg-avatar"><i>A</i><b>24</b></span>' +
      '<button class="sg-bell" type="button" aria-label="Notifications">✦</button>' +
    '</header>';
  }

  var NAV = [
    { id: 'home', ico: '⌂', label: 'Home' },
    { id: 'play', ico: '⚔', label: 'Play' },
    { id: 'collection', ico: '◈', label: 'Collection' },
    { id: 'decks', ico: '▤', label: 'Decks' },
    { id: 'more', ico: '⋯', label: 'More' }
  ];
  var MORE = [['⌂', 'Keep'], ['☍', 'Social'], ['☺', 'Profile'], ['⬢', 'Shop'], ['⚙', 'Settings'], ['?', 'Help']];

  function bottomMarkup(active, moreOpen, rail) {
    return '<nav class="sg-bottom' + (moreOpen ? ' more-open' : '') + '" data-bottom>' +
      '<div class="sg-more-sheet"><div><div class="sg-more-grid">' + MORE.map(function (m) {
        return '<button type="button"><span class="ico">' + m[0] + '</span>' + esc(m[1]) + '</button>';
      }).join('') + '</div></div></div>' + (rail || '') +
      '<div class="sg-nav">' + NAV.map(function (n) {
        return '<button type="button" data-nav="' + n.id + '" class="' + (n.id === active ? 'on' : '') + '">' +
          '<span class="ico">' + n.ico + '</span>' + esc(n.label) + '</button>';
      }).join('') + '</div>' +
    '</nav>';
  }

  function mountBottom(app) {
    var bottom = app.querySelector('[data-bottom]');
    if (!bottom) return;
    bottom.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var isMore = btn.getAttribute('data-nav') === 'more';
        if (isMore) {
          bottom.classList.toggle('more-open');
          if (bottom.classList.contains('more-open')) {
            app.querySelectorAll('.sg-qa.open').forEach(function (g) { g.classList.remove('open'); });
          }
          return;
        }
        bottom.classList.remove('more-open');
        bottom.querySelectorAll('[data-nav]').forEach(function (b) { b.classList.toggle('on', b === btn); });
      });
    });
  }

  function mountStrip(app) {
    var strip = app.querySelector('[data-strip]');
    if (strip) strip.addEventListener('click', function () { strip.classList.toggle('open'); });
  }

  /* ---------- screens ---------- */

  function homeScreen(opts) {
    opts = opts || {};
    return topMarkup() +
      '<div class="sg-scroll">' + heroMarkup() + featuredMarkup() + questsMarkup() + deckMarkup() +
      '<div style="height:186px"></div></div>' +
      bottomMarkup('home', !!opts.moreOpen, railMarkup());
  }

  function galleryScreen() {
    var elements = ['ALL', 'FIRE', 'WATER', 'EARTH', 'WIND', 'ICE', 'ELECTRIC', 'PSYCHIC', 'METAL'];
    var grid = CARDS.slice(0, 24);
    return topMarkup() +
      '<div class="sg-scroll">' +
        '<div class="sg-gal-head"><h2>The Collection</h2><p>412 of 640 Siegelings discovered</p></div>' +
        '<div class="sg-gal-tools" data-tools>' +
          '<button class="sg-icon-btn" type="button" data-search-toggle aria-label="Search">⌕</button>' +
          '<label class="sg-search"><input type="text" placeholder="Search the collection…" data-search-input></label>' +
          '<button class="sg-icon-btn" type="button" data-filter-toggle aria-label="Filters">≡</button>' +
          '<span class="sg-count" data-count>24 Shown</span>' +
        '</div>' +
        '<div class="sg-filters" data-filters><div><div class="sg-filter-row">' + elements.map(function (e, i) {
          return '<button class="sg-pill' + (i === 0 ? ' on' : '') + '" type="button" data-el="' + e + '" style="--el:' +
            (e === 'ALL' ? '#c8a54f' : color(e)) + '">' +
            (e === 'ALL' ? '' : '<img src="' + icon(e) + '" alt="">') + esc(title(e)) + '</button>';
        }).join('') + '</div></div></div>' +
        '<div class="sg-gal-grid" data-grid>' + grid.map(galleryCard).join('') + '</div>' +
        '<div style="height:90px"></div>' +
      '</div>' +
      '<div class="sg-sheet" data-sheet><div class="sg-sheet-card" data-sheet-card></div></div>' +
      bottomMarkup('collection', false);
  }

  function galleryCard(c) {
    return '<article class="sg-gal-card" data-card="' + esc(c.id) + '" style="--el:' + color(c.element) + '">' +
      '<div class="sg-gal-plate"><div class="sg-gal-art">' +
      '<img src="' + esc(c.cardArtUrl) + '" alt="' + esc(c.name) + '" loading="lazy"></div></div>' +
      '<div class="sg-gal-cap"><span class="nm">' + esc(c.name) + '</span>' +
      '<i class="sg-rar ' + esc(String(c.rarity || '').toLowerCase()) + '"></i>' +
      '<img src="' + esc(icon(c.element)) + '" alt="' + esc(title(c.element)) + '"></div>' +
    '</article>';
  }

  function mountGallery(app, opts) {
    opts = opts || {};
    var tools = app.querySelector('[data-tools]');
    var filters = app.querySelector('[data-filters]');
    var grid = app.querySelector('[data-grid]');
    var count = app.querySelector('[data-count]');
    var sheet = app.querySelector('[data-sheet]');
    var sheetCard = app.querySelector('[data-sheet-card]');
    var activeEl = 'ALL';
    var query = '';

    function repaint() {
      var rows = CARDS.filter(function (c) {
        if (activeEl !== 'ALL' && c.element !== activeEl) return false;
        if (query && c.name.toLowerCase().indexOf(query) === -1) return false;
        return true;
      }).slice(0, 24);
      grid.innerHTML = rows.map(galleryCard).join('');
      count.textContent = rows.length + ' Shown';
    }

    app.querySelector('[data-filter-toggle]').addEventListener('click', function () {
      filters.classList.toggle('open');
      this.classList.toggle('on', filters.classList.contains('open'));
    });
    app.querySelector('[data-search-toggle]').addEventListener('click', function () {
      tools.classList.toggle('searching');
      this.classList.toggle('on', tools.classList.contains('searching'));
      if (tools.classList.contains('searching')) app.querySelector('[data-search-input]').focus();
    });
    app.querySelector('[data-search-input]').addEventListener('input', function () {
      query = this.value.trim().toLowerCase();
      repaint();
    });
    filters.querySelectorAll('[data-el]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        activeEl = pill.getAttribute('data-el');
        filters.querySelectorAll('[data-el]').forEach(function (p) { p.classList.toggle('on', p === pill); });
        repaint();
      });
    });

    function openSheet(card) {
      sheetCard.innerHTML = '<div class="sg-sheet-grab"></div>' +
        '<div class="sg-sheet-art"><img src="' + esc(card.cardArtUrl) + '" alt="' + esc(card.name) + '"></div>' +
        '<h3>' + esc(card.name) + '</h3>' +
        '<div class="sg-sheet-meta"><img src="' + esc(icon(card.element)) + '" alt="">' +
        esc(title(card.element)) + ' · ' + esc(title(card.rarity)) + '</div>' +
        '<div class="sg-sheet-stats">' +
          '<div><span>Health</span><b>' + esc(card.health == null ? '—' : card.health) + '</b></div>' +
          '<div><span>Speed</span><b>' + esc(card.speed == null ? '—' : card.speed) + '</b></div>' +
          '<div><span>Owned</span><b>3</b></div>' +
        '</div>';
      sheet.classList.add('open');
    }
    grid.addEventListener('click', function (e) {
      var host = e.target.closest ? e.target.closest('[data-card]') : null;
      if (host) openSheet(byId(host.getAttribute('data-card')));
    });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.classList.remove('open'); });

    if (opts.filtersOpen) { filters.classList.add('open'); app.querySelector('[data-filter-toggle]').classList.add('on'); }
    if (opts.openCard) openSheet(byId(opts.openCard));
  }

  /* ---------- public mount ---------- */

  function render(host, screen, opts) {
    opts = opts || {};
    var app = document.createElement('div');
    app.className = 'sg-app';
    app.innerHTML = screen === 'collection' ? galleryScreen() : homeScreen(opts);
    host.appendChild(app);
    if (screen === 'collection') {
      mountGallery(app, opts);
    } else {
      mountHero(app, opts);
      mountRail(app, opts.openQuick);
      mountStrip(app);
      if (opts.questsOpen) app.querySelector('[data-strip]').classList.add('open');
    }
    mountBottom(app);
    return app;
  }

  window.SiegelingsHomeConcept = { render: render, cards: CARDS };
})();
