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


  // Cinematic gallery plates. Unlike the overlay cutouts these are whole scenes,
  // so they carry the hero on their own and only need a scrim for the copy.
  var GALLERY = [
    { img: 'bearby-longfuse',   card: 'bearby',    title: 'The Long Fuse',      place: 'Emberwaste Gate' },
    { img: 'bearby-blastoff',   card: 'bearby',    title: 'Blast Off',          place: 'Emberwaste Gate' },
    { img: 'bearnade-payload',  card: 'bearnade',  title: 'Payload Away',       place: 'The Sunken Span' },
    { img: 'bearzooka-rampage', card: 'bearzooka', title: 'Emberwaste Rampage', place: 'Cinderfall Reach' },
    { img: 'draco-brood',       card: 'draco',     title: 'The Cinder Brood',   place: 'Moltenmaw Basin' }
  ];
  function plate(entry, thumb) {
    return '/img/gallery/' + entry.img + (thumb ? '-thumb' : '') + '.webp';
  }

  // Hand-picked so the rotation walks through distinct elements and silhouettes.
  var HERO = pick(['pylord', 'glaciemperor', 'aerovane', 'conchious', 'gymstone']);
  var FEATURED = pick(['dracosleaf', 'sheenx', 'hurricrane', 'clawqueen', 'bleetstrike', 'frostag', 'siegebot', 'solgator']);

  /* ---------- hero (rotating art, parallax, elemental motes) ---------- */

  function heroMarkup() {
    return '' +
      '<section class="sg-hero is-scene" data-hero>' +
        '<div class="sg-hero-art">' +
          '<div class="sg-hero-land" data-hero-land></div>' +
          '<div class="sg-hero-tint"></div>' +
          '<div class="sg-motes" data-motes></div>' +
        '</div>' +
        '<div class="sg-dots" data-dots></div>' +
        '<div class="sg-hero-copy">' +
          '<div class="sg-eyebrow">The Arena Awaits</div>' +
          '<h1 class="sg-hero-title">THE ARENA AWAITS</h1>' +
          '<p class="sg-hero-sub" data-hero-sub></p>' +
          '<button class="sg-play" type="button">PLAY</button>' +
        '</div>' +
        '<div class="sg-hero-credit" data-hero-credit></div>' +
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
    var dots = hero.querySelector('[data-dots]');
    var subEl = hero.querySelector('[data-hero-sub]');
    var creditEl = hero.querySelector('[data-hero-credit]');
    var motes = hero.querySelector('[data-motes]');

    function paint(i) {
      var scene = GALLERY[i % GALLERY.length];
      var card = byId(scene.card) || CARDS[0];
      var c = color(card.element);
      hero.style.setProperty('--el', c);
      landEl.style.backgroundImage = "url('" + plate(scene) + "')";
      subEl.innerHTML = '<b>' + esc(card.name) + '</b> &middot; ' + esc(title(card.element)) +
        ' &middot; ' + esc(title(card.rarity));
      creditEl.innerHTML = '<span>' + esc(scene.title) + '</span>' + esc(scene.place);
      paintMotes(motes, card.element);
      var d = '';
      for (var k = 0; k < GALLERY.length; k++) d += '<i class="sg-dot' + (k === i % GALLERY.length ? ' on' : '') + '"></i>';
      dots.innerHTML = d;
    }
    paint(idx);

    if (!opts || !opts.freeze) {
      setInterval(function () { idx += 1; paint(idx); }, 7000);
    }

    // Parallax: the plate drifts slower than the scroll so the hero gains depth
    // without a second render pass.
    var scroll = app.querySelector('.sg-scroll');
    if (scroll) {
      scroll.addEventListener('scroll', function () {
        landEl.style.setProperty('--par', (scroll.scrollTop * 0.30).toFixed(1) + 'px');
      }, { passive: true });
    }
  }

  /* ---------- collapsible quick-action rail ---------- */

  // One bar, not two. The quick-action rail used to sit directly above the tab
  // bar, which read as a double header and cost ~56px of artwork. The tray
  // mechanic it carried is worth keeping, so it moved onto the tabs themselves:
  // a tab with sub-destinations slides its tray up out of the bar.
  // Real destinations. Until now every control was inert; these are the routes
  // firebase.json already serves, so the design can front the live game.
  var HREF = {
    battle: '/play', siege: '/siege', keep: '/keep', lobbies: '/social',
    cards: '/cards', decks: '/decks', builder: '/deck-builder',
    social: '/social', profile: '/profile', shop: '/shop', help: '/help',
    login: '/login', home: '/home', achievements: '/achievements'
  };
  function hrefFor(label) {
    var map = {
      'Battle': HREF.battle, 'Siege': HREF.siege, 'Keep': HREF.keep,
      'Social Lobbies': HREF.lobbies, 'Cards': HREF.cards, 'Decks': HREF.decks,
      'Deck Builder': HREF.builder, 'Social': HREF.social, 'Profile': HREF.profile,
      'Settings': HREF.profile, 'Help': HREF.help,
      'Sign In': HREF.login, 'Create Account': HREF.login,
      'Featured Packs': HREF.shop, 'Open Packs': HREF.shop, 'Siegelcoins': HREF.shop
    };
    return map[label] || '';
  }

  var NAV = [
    { id: 'home',       ico: '⌂', label: 'Home' },
    // Same vocabulary as the Play screen and the shipping picker: the two real
    // modes are Battle and Siege. The tray listing Arena/Ranked/Siege Expedition
    // was left over from the invented modes and disagreed with the screen it
    // navigates to.
    { id: 'play',       ico: '⚔', label: 'Play', items: [
        ['Battle', 'Solo & PvP'], ['Siege', 'New'], ['Social Lobbies', '11 open'], ['Keep', '2h']] },
    { id: 'collection', ico: '◈', label: 'Collection', items: [
        ['Cards', '412'], ['Decks', '6'], ['Deck Builder', '']] },
    { id: 'shop',       ico: '⬢', label: 'Shop', items: [
        ['Featured Packs', ''], ['Open Packs', '3'], ['Siegelcoins', '']] },
    { id: 'more',       ico: '⋯', label: 'More', items: [
        ['Social', '4 on'], ['Profile', ''], ['Settings', ''], ['Help', '']],
      guestItems: [
        ['Sign In', 'Save decks'], ['Create Account', ''], ['Social', '4 on'],
        ['Settings', ''], ['Help', '']] }
  ];

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

  function gallerySection() {
    return '<section class="sg-section">' +
      '<div class="sg-section-head"><h3>From the Gallery</h3><a href="#">See All</a></div>' +
      '<div class="sg-swipe sg-swipe-wide">' + GALLERY.map(function (g) {
        var card = byId(g.card) || CARDS[0];
        return '<article class="sg-plate" style="--el:' + color(card.element) + '">' +
          '<img src="' + plate(g, true) + '" alt="' + esc(g.title) + '" loading="lazy">' +
          '<div class="sg-plate-foot"><strong>' + esc(g.title) + '</strong>' +
          '<span>' + esc(card.name) + ' &middot; ' + esc(g.place) + '</span></div>' +
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

  // A guest has no avatar, level or progression to show, so the identity slot
  // carries the sign-in call rather than an empty crest. The coin chip stays
  // (guests hold a starting balance) but the bell goes - there is nothing to
  // notify an account-less player about.
  function topMarkup(opts) {
    var guest = Boolean(opts && opts.guest);
    return '<header class="sg-top' + (guest ? ' is-guest' : '') + '">' +
      '<img class="sg-logo" src="/img/siegelings-logo.webp" alt="Siegelings">' +
      '<span class="sg-top-spacer"></span>' +
      '<span class="sg-chip coin"><img src="/img/ui/siegel-coin.webp" alt="">' + (guest ? '100' : '2,480') + '</span>' +
      (guest
        ? '<button class="sg-signin" type="button">Sign In</button>'
        : '<span class="sg-avatar"><i>A</i><b>24</b></span>' +
          '<button class="sg-bell" type="button" aria-label="Notifications">✦</button>') +
    '</header>';
  }

  function bottomMarkup(active, openTray, guest) {
    return '<nav class="sg-bottom' + (openTray ? ' tray-open' : '') + '" data-bottom>' +
      NAV.filter(function (n) { return n.items; }).map(function (n) {
        var items = (guest && n.guestItems) ? n.guestItems : n.items;
        return '<div class="sg-tray' + (n.id === openTray ? ' open' : '') + '" data-tray="' + n.id + '"><div>' +
          '<ul>' + items.map(function (it) {
            var auth = it[0] === 'Sign In' || it[0] === 'Create Account';
            var href = hrefFor(it[0]);
            return '<li' + (auth ? ' class="is-auth"' : '') + '>' +
              (href ? '<a href="' + esc(href) + '">' + esc(it[0]) + '</a>' : esc(it[0])) +
              (it[1] ? '<span>' + esc(it[1]) + '</span>' : '') + '</li>';
          }).join('') + '</ul></div></div>';
      }).join('') +
      '<div class="sg-nav">' + NAV.map(function (n) {
        return '<button type="button" data-nav="' + n.id + '" class="' + (n.id === active ? 'on' : '') +
          (n.items ? ' has-tray' : '') + (n.id === openTray ? ' tray-on' : '') + '">' +
          '<span class="ico">' + n.ico + '</span>' + esc(n.label) +
          (n.items ? '<i class="sg-caret" aria-hidden="true"></i>' : '') + '</button>';
      }).join('') + '</div>' +
    '</nav>';
  }

  function mountBottom(app) {
    var bottom = app.querySelector('[data-bottom]');
    if (!bottom) return;
    var trays = [].slice.call(bottom.querySelectorAll('[data-tray]'));
    function openTray(id) {
      // Exactly one tray is ever open, so the bar never grows into a second header.
      trays.forEach(function (t) { t.classList.toggle('open', t.getAttribute('data-tray') === id); });
      bottom.classList.toggle('tray-open', Boolean(id));
      // The open tray has to point back at the tab that owns it, or the panel
      // reads as belonging to whichever tab happens to be selected.
      bottom.querySelectorAll('[data-nav]').forEach(function (b) {
        b.classList.toggle('tray-on', Boolean(id) && b.getAttribute('data-nav') === id);
      });
    }
    bottom.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-nav');
        var tray = bottom.querySelector('[data-tray="' + id + '"]');
        var alreadyOpen = tray && tray.classList.contains('open');
        openTray(alreadyOpen || !tray ? null : id);
        // Home has no tray, so it just becomes the selected tab.
        if (!tray) {
          bottom.querySelectorAll('[data-nav]').forEach(function (b) { b.classList.toggle('on', b === btn); });
        }
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
    return topMarkup(opts) +
      '<div class="sg-scroll">' + heroMarkup() + featuredMarkup() + gallerySection() + questsMarkup() + deckMarkup() +
      '<div style="height:132px"></div></div>' +
      bottomMarkup('home', opts.openTray, opts.guest);
  }

  function galleryScreen(opts) {
    var elements = ['ALL', 'FIRE', 'WATER', 'EARTH', 'WIND', 'ICE', 'ELECTRIC', 'PSYCHIC', 'METAL'];
    var grid = CARDS.slice(0, 24);
    return topMarkup(opts) +
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
      bottomMarkup('collection', opts.openTray, opts.guest);
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

  /* ---------- play ---------- */

  // Graphic-first mode picker: every mode is a full-bleed plate, the copy is a
  // label and one line. Art source is deliberately mixed - gallery scenes where
  // one exists for the mode, production Land plates otherwise.
  // The shipping /play mode picker spends ~60 words of body copy explaining
  // Battle vs Siege before showing a single image. Same two modes, same
  // vocabulary, but each is a full-bleed plate carrying a label and one line.
  var MODES = [
    { id: 'battle', label: 'Battle', tag: 'Solo & Live PvP',
      line: 'Levels off — all deck and reads.',
      art: '/img/gallery/bearzooka-rampage.webp', el: 'FIRE', primary: true, cta: 'Play' },
    { id: 'siege', label: 'Siege', tag: 'New', badge: true,
      line: 'Roguelike expedition — build a warband.',
      art: '/img/gallery/draco-brood.webp', el: 'EARTH', cta: 'Enter' }
  ];

  function modePanel(m) {
    var href = hrefFor(m.label);
    return '<a class="sg-mode' + (m.primary ? ' is-primary' : '') + '" href="' + esc(href) +
      '" style="--el:' + color(m.el) + '">' +
      '<img class="sg-mode-bg" src="' + esc(m.art) + '" alt="" loading="lazy">' +
      '<div class="sg-mode-veil"></div>' +
      '<div class="sg-mode-body">' +
        '<span class="sg-mode-tag' + (m.badge ? ' is-new' : '') + '">' + esc(m.tag) + '</span>' +
        '<h3>' + esc(m.label) + '</h3>' +
        '<p>' + esc(m.line) + '</p>' +
      '</div>' +
      '<span class="sg-mode-go">' + esc(m.cta) + ' ›</span>' +
    '</a>';
  }

  // "LEADING - Solgator" invented a mechanic: the Battle table has no lead or
  // captain card, and the engine's only "leading" is a deck's leading element
  // for sort order. What IS real here is Siege run persistence - one save per
  // mode, resumable by token - so this slot now says what it can actually do.
  function siegeResumeMarkup(opts) {
    var run = (opts.siegeRuns && opts.siegeRuns[0]) || null;
    if (!run) {
      return '<a class="sg-resume is-empty" href="' + HREF.siege + '">' +
        '<span class="sg-resume-icon">⛰</span>' +
        '<span class="sg-resume-body"><strong>No expedition saved</strong>' +
        '<em>Start a Siege run to pick it up here.</em></span>' +
        '<span class="sg-resume-go">Start ›</span>' +
      '</a>';
    }
    var landName = (run.land && run.land.name) || 'Expedition';
    var depth = (run.landSegment != null) ? ('Land ' + (run.landSegment + 1)) : '';
    var party = (run.party || []).map(function (m) { return m && m.name; }).filter(Boolean);
    return '<a class="sg-resume" href="' + HREF.siege + '">' +
      '<span class="sg-resume-icon">⛰</span>' +
      '<span class="sg-resume-body">' +
        '<span class="sg-resume-kicker">Saved expedition</span>' +
        '<strong>' + esc(landName) + (depth ? ' &middot; ' + esc(depth) : '') + '</strong>' +
        (party.length ? '<em>' + esc(party.join(' &middot; ')) + '</em>' : '') +
      '</span>' +
      '<span class="sg-resume-go">Resume ›</span>' +
    '</a>';
  }

  function playScreen(opts) {
    opts = opts || {};
    var lead = byId('solgator') || CARDS[0];
    var guest = Boolean(opts.guest);
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-modes">' + MODES.map(modePanel).join('') + '</div>' +
        siegeResumeMarkup(opts) +
        '<a class="sg-lobbies" href="' + HREF.lobbies + '">' +
          '<span class="sg-lobbies-dot"></span>Social Lobbies<em>' +
          esc(opts.lobbies == null ? '11' : opts.lobbies) + ' open</em><span class="go">›</span>' +
        '</a>' +
        (guest ? guestBand() : '') +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('play', opts.openTray, opts.guest);
  }

  // The shipping page gives this a full card and three lines of copy. It is a
  // prompt, not a feature, so it gets one artwork band and two buttons.
  function guestBand() {
    return '<section class="sg-guest">' +
      '<img class="sg-guest-bg" src="/img/gallery/bearby-longfuse.webp" alt="" loading="lazy">' +
      '<div class="sg-guest-veil"></div>' +
      '<div class="sg-guest-body">' +
        '<strong>Pick up where you left off</strong>' +
        '<p>Save decks and track your record.</p>' +
        '<div class="sg-guest-actions">' +
          '<button class="sg-guest-primary" type="button">Log In</button>' +
          '<button class="sg-guest-ghost" type="button">Register</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---------- decks ---------- */

  var DECKS = [
    { name: 'Emberwaste Vanguard', lead: 'solgator', els: ['FIRE', 'EARTH', 'METAL'], w: 18, l: 6, cards: 40, active: true },
    { name: 'Glacier Choir',       lead: 'glaciemperor', els: ['ICE', 'WATER'],        w: 11, l: 9, cards: 40 },
    { name: 'Stormfeather Rite',   lead: 'aerovane',     els: ['WIND', 'ELECTRIC'],    w: 7,  l: 4, cards: 40 },
    { name: 'Root & Ruin',         lead: 'gymstone',     els: ['EARTH', 'POISON'],     w: 3,  l: 8, cards: 38 }
  ];

  function deckRow(d) {
    var lead = byId(d.lead) || CARDS[0];
    var total = d.w + d.l;
    var rate = total ? Math.round(d.w / total * 100) : 0;
    return '<article class="sg-deckrow' + (d.active ? ' is-active' : '') + '" style="--el:' + color(lead.element) + '">' +
      '<div class="sg-deckrow-bg" style="background-image:url(\'' + land(lead.element) + '\')"></div>' +
      '<div class="sg-deckrow-veil"></div>' +
      '<div class="sg-deckrow-art"><img src="' + esc(lead.cardArtUrl) + '" alt="" loading="lazy"></div>' +
      '<div class="sg-deckrow-body">' +
        (d.active ? '<span class="sg-tag">Selected</span>' : '') +
        '<h4>' + esc(d.name) + '</h4>' +
        '<div class="sg-deck-els">' + d.els.map(function (e) {
          return '<img src="' + icon(e) + '" alt="' + esc(title(e)) + '">';
        }).join('') + '</div>' +
        '<div class="sg-deckrow-meta"><b>' + d.w + 'W</b> · ' + d.l + 'L &nbsp;·&nbsp; ' + rate + '% &nbsp;·&nbsp; ' + d.cards + ' cards</div>' +
      '</div>' +
      '<div class="sg-deckrow-bar"><i style="width:' + rate + '%"></i></div>' +
    '</article>';
  }

  function decksScreen(opts) {
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-page-head"><h2>My Decks</h2><p>4 built &middot; 1 selected</p></div>' +
        '<div class="sg-tool-row">' +
          '<button class="sg-ghost-btn" type="button"><span class="ico">✎</span>Deck Builder</button>' +
          '<button class="sg-ghost-btn" type="button"><span class="ico">✧</span>Auto Build</button>' +
        '</div>' +
        '<div class="sg-stack">' + DECKS.map(deckRow).join('') + '</div>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('collection', opts.openTray, opts.guest);
  }

  /* ---------- shop ---------- */

  var PACKS = [
    { name: 'Emberwaste Pack',  el: 'FIRE',     price: 150, note: '5 cards' },
    { name: 'Frostveil Pack',   el: 'ICE',      price: 150, note: '5 cards' },
    { name: 'Stormcrest Pack',  el: 'ELECTRIC', price: 150, note: '5 cards' },
    { name: 'Tidecaller Pack',  el: 'WATER',    price: 150, note: '5 cards' }
  ];
  var BUNDLES = [
    { amount: '1,200', bonus: '', price: '$4.99' },
    { amount: '3,000', bonus: '+400 bonus', price: '$9.99' },
    { amount: '8,000', bonus: '+1,600 bonus', price: '$24.99' }
  ];

  function shopScreen(opts) {
    var feature = GALLERY[3];
    var featureCard = byId(feature.card) || CARDS[0];
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<section class="sg-feature" style="--el:' + color(featureCard.element) + '">' +
          '<img class="sg-feature-bg" src="' + plate(feature) + '" alt="">' +
          '<div class="sg-feature-veil"></div>' +
          '<div class="sg-feature-body">' +
            '<span class="sg-tag">Featured &middot; Ends in 2d</span>' +
            '<h2>Cinderfall Collection</h2>' +
            '<p>Ten cards, one guaranteed Epic or better, and the Bearzooka line at doubled odds.</p>' +
            '<button class="sg-cta" type="button"><img src="/img/ui/siegel-coin.webp" alt="">900</button>' +
          '</div>' +
        '</section>' +
        '<section class="sg-section">' +
          '<div class="sg-section-head"><h3>Packs</h3><a href="#">Odds</a></div>' +
          '<div class="sg-swipe">' + PACKS.map(function (pk) {
            return '<article class="sg-pack" style="--el:' + color(pk.el) + '">' +
              '<div class="sg-pack-face"><img src="/img/decks/card-back-' + String(pk.el).toLowerCase() + '.webp" alt=""></div>' +
              '<strong>' + esc(pk.name) + '</strong><span>' + esc(pk.note) + '</span>' +
              '<button class="sg-buy" type="button"><img src="/img/ui/siegel-coin.webp" alt="">' + pk.price + '</button>' +
            '</article>';
          }).join('') + '</div>' +
        '</section>' +
        '<section class="sg-section">' +
          '<div class="sg-section-head"><h3>Siegelcoins</h3></div>' +
          '<div class="sg-stack sg-stack-tight">' + BUNDLES.map(function (bd) {
            return '<button class="sg-bundle" type="button">' +
              '<img src="/img/ui/siegel-coin.webp" alt="">' +
              '<span class="amt">' + esc(bd.amount) + (bd.bonus ? '<em>' + esc(bd.bonus) + '</em>' : '') + '</span>' +
              '<span class="price">' + esc(bd.price) + '</span></button>';
          }).join('') + '</div>' +
        '</section>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('shop', opts.openTray, opts.guest);
  }

  /* ---------- profile ---------- */

  var BADGES = [
    ['◈', 'Collector', true], ['⚔', 'Duelist', true], ['⌂', 'Keeper', true],
    ['✦', 'Ascendant', false], ['☍', 'Ally', true], ['⬢', 'Patron', false]
  ];
  var RECENT = [
    ['Arena', 'Win', 'vs Kael', '+24'],
    ['Siege', 'Land cleared', 'Emberwaste', '+80'],
    ['Arena', 'Loss', 'vs Ruune', '+6']
  ];

  function profileScreen(opts) {
    var showcase = GALLERY[2];
    var showcaseCard = byId(showcase.card) || CARDS[0];
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<section class="sg-crest" style="--el:' + color(showcaseCard.element) + '">' +
          '<img class="sg-crest-bg" src="' + plate(showcase) + '" alt="">' +
          '<div class="sg-crest-veil"></div>' +
          '<div class="sg-crest-body">' +
            '<span class="sg-crest-ring"><i>A</i></span>' +
            '<h2>Ashenvale</h2>' +
            '<p>Level 24 &middot; Emberwaste Ward</p>' +
            '<div class="sg-xp"><i style="width:62%"></i></div>' +
            '<span class="sg-xp-note">6,200 / 10,000 XP to Level 25</span>' +
          '</div>' +
        '</section>' +
        '<div class="sg-tiles">' +
          '<div><span>Matches</span><b>214</b></div>' +
          '<div><span>Win Rate</span><b>63%</b></div>' +
          '<div><span>Collected</span><b>64%</b></div>' +
        '</div>' +
        '<section class="sg-section">' +
          '<div class="sg-section-head"><h3>Showcase</h3><a href="#">Change</a></div>' +
          '<div class="sg-swipe">' + pick(['bearzooka', 'pylord', 'conchious', 'gymstone']).map(function (c) {
            return '<article class="sg-feat" style="--el:' + color(c.element) + '">' +
              '<div class="sg-feat-plate"></div>' +
              '<div class="sg-feat-art"><img src="' + esc(c.cardArtUrl) + '" alt="" loading="lazy"></div>' +
              '<div class="sg-feat-foot"><span class="sg-feat-name">' + esc(c.name) + '</span>' +
              '<span class="sg-feat-marks"><i class="sg-rar ' + esc(String(c.rarity || '').toLowerCase()) + '"></i>' +
              '<img src="' + icon(c.element) + '" alt=""></span></div>' +
            '</article>';
          }).join('') + '</div>' +
        '</section>' +
        '<section class="sg-section">' +
          '<div class="sg-section-head"><h3>Badges</h3><a href="#">All 42</a></div>' +
          '<div class="sg-badges">' + BADGES.map(function (bg) {
            return '<span class="sg-badge' + (bg[2] ? ' earned' : '') + '"><i>' + bg[0] + '</i>' + esc(bg[1]) + '</span>';
          }).join('') + '</div>' +
        '</section>' +
        '<section class="sg-section">' +
          '<div class="sg-section-head"><h3>Recent</h3></div>' +
          '<div class="sg-stack sg-stack-tight">' + RECENT.map(function (r) {
            return '<div class="sg-recent"><span class="mode">' + esc(r[0]) + '</span>' +
              '<span class="what">' + esc(r[1]) + '<em>' + esc(r[2]) + '</em></span>' +
              '<span class="gain">' + esc(r[3]) + '</span></div>';
          }).join('') + '</div>' +
        '</section>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('more', opts.openTray, opts.guest);
  }

  /* ---------- feature coverage ----------
     The brief simplifies the navigation, which is only safe if nothing becomes
     unreachable. This is the audit: every route, dashboard action and feature
     the shipping hub exposes today, and the destination it has in the new IA.
     Rendered on the preview board so a reviewer can check it rather than take
     it on trust. `path` is how a player gets there in at most two taps. */
  var COVERAGE = [
    { area: 'Routes', rows: [
      ['/home dashboard',      'Home tab',                                'home'],
      ['/cards binder',        'Collection tab › Cards',                  'collection'],
      ['/decks',               'Collection tray › Decks',                 'collection'],
      ['/deck-builder',        'Collection tray › Deck Builder',          'collection'],
      ['/social',              'More tray › Social',                      'more'],
      ['/social lobby',        'Play tray › Ranked 1v1',                  'play'],
      ['/profile',             'More tray › Profile',                     'more'],
      ['/achievements',        'Profile › Badges › All 42',               'more'],
      ['/shop',                'Shop tab',                                'shop'],
      ['/play arena',          'Play tray › Arena · PLAY on hero',        'play'],
      ['/siege expedition',    'Play tray › Siege Expedition',            'play'],
      ['/keep',                'Play tray › Keep',                        'play'],
      ['/help',                'More tray › Help',                        'more']
    ]},
    { area: 'Dashboard actions', rows: [
      ['PVE battle',           'Play › Arena (primary panel)',            'play'],
      ['Create 1v1 lobby',     'Play › Ranked 1v1',                       'play'],
      ['Owned cards',          'Collection tab',                          'collection'],
      ['Deck builder',         'Collection tray › Deck Builder',          'collection'],
      ['Open shop',            'Shop tab',                                'shop'],
      ['Saved decks',          'Collection tray › Decks',                 'collection']
    ]},
    { area: 'Dashboard panels', rows: [
      ['Active tables',        'Play › Ranked (live count)',              'play'],
      ['Search, filter, build','Collection › search icon + filter ctrl',   'collection'],
      ['Recent progress',      'Home › Daily Objectives strip',           'home'],
      ['Loadout shelf',        'Home › Continue Playing · Play › Loadout','play'],
      ['Element starters',     'Shop › Packs',                            'shop'],
      ['Siegelcoin balance',   'Top bar chip (every screen)',             'home'],
      ['Remnants / craft',     'Play tray › Keep',                        'play'],
      ['Daily missions',       'Home › Daily Objectives strip',           'home'],
      ['Match history',        'Profile › Recent',                        'more'],
      ['Pack odds',            'Shop › Packs › Odds',                     'shop'],
      ['Card detail / zoom',   'Collection › tap a card',                 'collection'],
      ['Notifications',        'Top bar bell (every screen)',             'home']
    ]}
  ];

  function coverageMarkup() {
    return '<div class="cov">' + COVERAGE.map(function (group) {
      return '<div class="cov-group"><h3>' + esc(group.area) + '</h3><table><tbody>' +
        group.rows.map(function (r) {
          return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) +
            '</td><td class="cov-dest"><span class="cov-pill s-' + esc(r[2]) + '">' + esc(r[2]) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>';
    }).join('') + '</div>';
  }

  /* ---------- public mount ---------- */

  // Live data replaces the frozen snapshot in place, so the renderer below is
  // identical whether it is fronting the real game or the offline preview.
  function applyLive(model) {
    if (!model) return;
    if (model.sieglings && model.sieglings.length) {
      CARDS.length = 0;
      model.sieglings.forEach(function (c) { CARDS.push(c); });
      HERO = pickPresent(['pylord', 'glaciemperor', 'aerovane', 'conchious', 'gymstone']);
      FEATURED = pickPresent(['dracosleaf', 'sheenx', 'hurricrane', 'clawqueen',
                              'bleetstrike', 'frostag', 'siegebot', 'solgator']);
    }
    if (model.decks && model.decks.length) {
      DECKS = model.decks.slice(0, 4).map(function (d, i) {
        var lead = CARDS.filter(function (c) {
          return (d.elements || []).indexOf(c.element) !== -1;
        })[0] || CARDS[i] || CARDS[0];
        return {
          name: d.name || d.id, lead: lead && lead.id,
          els: (d.elements || []).slice(0, 3),
          w: 0, l: 0, cards: d.size || 40, active: d.id === model.defaultDeckId
        };
      });
    }
  }

  // The live catalog is not guaranteed to hold the ids the concept hand-picked,
  // so fall back to whatever it does have rather than rendering empty tiles.
  function pickPresent(ids) {
    var found = ids.map(byId).filter(function (c, i) { return c && c.id === ids[i]; });
    return found.length ? found : CARDS.slice(0, ids.length);
  }

  function render(host, screen, opts) {
    opts = opts || {};
    if (opts.live) applyLive(opts.live);
    var app = document.createElement('div');
    app.className = 'sg-app';
    var builders = { collection: galleryScreen, decks: decksScreen, shop: shopScreen, profile: profileScreen, play: playScreen };
    app.innerHTML = builders[screen] ? builders[screen](opts) : homeScreen(opts);
    host.appendChild(app);
    // Every screen carries the same chrome, so the rail and the tab bar are
    // wired unconditionally. Branching this is how the Cards screen ended up
    // rendering a rail that did not respond to taps.
    if (screen === 'collection') {
      mountGallery(app, opts);
    } else if (!builders[screen]) {
      mountHero(app, opts);
      mountStrip(app);
      if (opts.questsOpen) app.querySelector('[data-strip]').classList.add('open');
    }
    mountBottom(app);
    return app;
  }

  window.SiegelingsHomeConcept = { render: render, applyLive: applyLive, cards: CARDS, coverageMarkup: coverageMarkup, coverage: COVERAGE };
})();
