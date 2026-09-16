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
  // Binder pool: every card type. Falls back to the Siegeling snapshot offline.
  var ALL_CARDS = DATA.sieglings.slice();
  function byIdIn(pool, id) {
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }

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
          '<a class="sg-play" href="' + HREF.battle + '">PLAY</a>' +
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
  // The new design owns these paths now; the old hub moved to /legacy/*. Screens
  // are addressed by real URLs rather than ?screen=, so a link, a bookmark and
  // the Back button all behave like a normal site.
  var PATH_SCREEN = {
    '/home': 'home', '/cards': 'collection', '/decks': 'decks',
    '/deck-builder': 'builder', '/shop': 'shop', '/profile': 'profile',
    '/social': 'social', '/settings': 'settings', '/help': 'help',
    '/achievements': 'profile', '/next': 'home'
  };
  var SCREEN_PATH = {
    home: '/home', collection: '/cards', decks: '/decks', builder: '/deck-builder',
    shop: '/shop', profile: '/profile', social: '/social', settings: '/settings',
    help: '/help', play: '/home'
  };
  function screenForPath(pathname) {
    var clean = String(pathname || '/home').replace(/\/+$/, '') || '/home';
    return PATH_SCREEN[clean] || null;
  }
  function pathForScreen(screen) { return SCREEN_PATH[screen] || ('/home'); }

  // Two kinds of destination, and conflating them is what made the new HUD feel
  // broken: tapping Cards or Shop bounced the player back into the OLD hub.
  //   INTERNAL - a screen this design already owns; routed in place, no reload.
  //   EXTERNAL - the actual game or a feature not yet redesigned. Battle and
  //              Siege belong here on purpose: they are gameplay, not layout.
  // Battle points at /battle, not /play: /play still opens the old welcome/mode
  // screen, and a player who already pressed Battle has made that choice.
  var INTERNAL = {
    'Home': 'home', 'Cards': 'collection', 'Collection': 'collection',
    'Decks': 'decks', 'Shop': 'shop', 'Profile': 'profile', 'Play': 'play',
    'Deck Builder': 'builder', 'Social': 'social', 'Settings': 'settings', 'Help': 'help'
  };
  var EXTERNAL = {
    'Battle': '/battle', 'Siege': '/siege', 'Keep': '/keep',
    'Social Lobbies': 'social', 'Sign In': '/login', 'Create Account': '/login',
    'Featured Packs': 'shop', 'Open Packs': 'shop', 'Siegelcoins': 'shop'
  };
  var HREF = { battle: '/battle', siege: '/siege', keep: '/keep',
               lobbies: '/social', login: '/login', help: '/help' };

  // Returns the anchor attributes for a label: an in-app screen swap where this
  // design owns the destination, a real navigation where it does not.
  function linkAttrs(label) {
    if (INTERNAL[label]) return ' href="' + pathForScreen(INTERNAL[label]) + '" data-screen="' + INTERNAL[label] + '"';
    var ext = EXTERNAL[label];
    if (!ext) return '';
    if (ext.charAt(0) !== '/') return ' href="' + pathForScreen(ext) + '" data-screen="' + ext + '"';
    return ' href="' + ext + '"';
  }
  function hrefFor(label) {
    if (INTERNAL[label]) return pathForScreen(INTERNAL[label]);
    return EXTERNAL[label] || '';
  }

  // Tray badges were invented ("412" cards, "6" decks, "11 open", "4 on", a "2h"
  // Keep timer). They are derived from the live payload now, and a count the
  // payload cannot supply is simply not drawn - a blank badge is honest, a
  // plausible one is not.
  function navFor(opts) {
    var live = (opts && opts.live) || {};
    var n = function (v) { return (v == null || v === 0) ? '' : String(v); };
    var rooms = (opts && opts.lobbies != null) ? opts.lobbies : live.lobbies;
    var saved = live.savedDecks && live.savedDecks.length;
    var runs = (opts && opts.siegeRuns && opts.siegeRuns.length) || 0;
    var online = (live.friends || []).filter(function (f) {
      return f && f.presence && f.presence.online;
    }).length;
    return [
      { id: 'home', ico: '⌂', label: 'Home', screen: 'home' },
      // Same vocabulary as the Play screen and the shipping picker: the two real
      // modes are Battle and Siege.
      { id: 'play', ico: '⚔', label: 'Play', screen: 'play', items: [
          ['Battle', ''], ['Siege', runs ? 'Saved' : ''],
          ['Social Lobbies', n(rooms) ? n(rooms) + ' open' : ''], ['Keep', '']] },
      { id: 'collection', ico: '◈', label: 'Collection', screen: 'collection', items: [
          ['Cards', n(live.ownedTotal != null ? live.ownedTotal : (ALL_CARDS.length || null))],
          ['Decks', n(saved)], ['Deck Builder', '']] },
      { id: 'shop', ico: '⬢', label: 'Shop', screen: 'shop', items: [
          ['Featured Packs', n(live.packs && live.packs.length)],
          ['Open Packs', ''], ['Siegelcoins', '']] },
      { id: 'more', ico: '⋯', label: 'More', items: [
          ['Social', n(online) ? n(online) + ' on' : ''], ['Profile', ''],
          ['Settings', ''], ['Help', '']],
        guestItems: [
          ['Sign In', 'Save decks'], ['Create Account', ''], ['Social', ''],
          ['Settings', ''], ['Help', '']] }
    ];
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

  // The four sample objectives that used to back this strip were invented, and a
  // signed-out player was shown them as if they were their own. There is no
  // honest fallback for someone else's daily progress, so when
  // /api/missions/daily does not answer the strip says what it is waiting on.
  function liveQuests(opts) {
    var m = opts && opts.live && opts.live.missions;
    if (!m || !m.length) return null;
    return m.slice(0, 5).map(function (q) {
      return [q.title || q.name || q.description || 'Objective',
              q.rewardLabel || (q.reward != null ? q.reward + ' 🪙' : ''),
              Boolean(q.completed || q.claimed || q.complete)];
    });
  }

  function questsMarkup(opts) {
    var quests = liveQuests(opts);
    if (!quests) {
      return '<div class="sg-strip is-empty">' +
        '<div class="sg-strip-head"><h4>Daily Objectives</h4><span class="sep">•</span>' +
        '<span class="cnt">' + (opts && opts.guest ? 'Sign in to track them' : 'Unavailable') +
        '</span></div>' +
      '</div>';
    }
    var done = quests.filter(function (q) { return q[2]; }).length;
    return '<div class="sg-strip" data-strip>' +
      '<div class="sg-strip-head"><h4>Daily Objectives</h4><span class="sep">•</span>' +
      '<span class="cnt">' + done + '/' + quests.length + ' Complete</span><span class="caret">›</span></div>' +
      '<div class="sg-strip-body"><div>' + quests.map(function (q) {
        return '<div class="sg-quest' + (q[2] ? ' done' : '') + '"><span class="tick">✓</span>' +
          '<span class="qt">' + esc(q[0]) + '</span><span class="qr">' + esc(q[1]) + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="sg-bar"><i style="width:' + Math.round(done / Math.max(1, quests.length) * 100) + '%"></i></div>' +
    '</div>';
  }

  /* ---------- active expeditions ----------
     This slot used to show a "Selected Deck" with an 18W-6L record and a 75%
     win rate. None of those numbers existed: the Battle table has no selected
     deck outside a loadout, and no per-deck record is stored anywhere. What IS
     persisted per account is the Siege checkpoint - one save per mode, resumable
     by token - so the slot now shows only that, and says so plainly when there
     is nothing saved. */

  function partyPip(m) {
    var el = color(m.element);
    var hp = Number(m.maxHp) > 0 ? Math.max(0, Math.min(100, Math.round(Number(m.hp) / Number(m.maxHp) * 100))) : 100;
    return '<span class="sg-exp-pip' + (m.alive === false ? ' is-down' : '') + '" style="--el:' + el + '">' +
      (m.artUrl ? '<img src="' + esc(m.artUrl) + '" alt="" loading="lazy">' : '<i class="sg-exp-pip-blank"></i>') +
      (m.level != null ? '<b class="sg-exp-lv">' + esc(m.level) + '</b>' : '') +
      '<i class="sg-exp-hp"><u style="width:' + hp + '%"></u></i>' +
    '</span>';
  }

  // Everything here is read off the run the server handed back; nothing is
  // invented. A field the payload omits is simply not drawn.
  function expeditionCard(run) {
    var knight = run.knight || {};
    var el = knight.element || (run.land && run.land.element) || 'NEUTRAL';
    var landName = (run.land && run.land.name) || run.slotLabel || 'Expedition';
    var floor = (run.landSegment != null) ? ('Floor ' + (Number(run.landSegment) + 1)) : '';
    var party = (run.party || []).slice(0, 5);
    var inBattle = Boolean(run.battle);
    return '<article class="sg-exp" style="--el:' + color(el) + '">' +
      '<div class="sg-exp-bg" style="background-image:url(\'' + land(el) + '\')"></div>' +
      '<div class="sg-exp-veil"></div>' +
      (knight.artUrl ? '<div class="sg-exp-knight"><img src="' + esc(knight.artUrl) + '" alt="" loading="lazy"></div>' : '') +
      '<div class="sg-exp-body">' +
        '<span class="sg-exp-kicker">' + esc(run.slotLabel || 'Siege Expedition') + '</span>' +
        '<h4>' + esc(landName) + '</h4>' +
        '<div class="sg-exp-meta">' +
          (knight.name ? '<span>' + esc(knight.name) + '</span>' : '') +
          (floor ? '<span>' + esc(floor) + '</span>' : '') +
          (run.gold != null ? '<span class="sg-exp-gold">' + esc(run.gold) + 'g</span>' : '') +
        '</div>' +
        (party.length ? '<div class="sg-exp-party">' + party.map(partyPip).join('') + '</div>' : '') +
        (inBattle ? '<span class="sg-exp-flag">Battle in progress</span>' : '') +
        '<a class="sg-exp-go" href="' + HREF.siege + '">Resume &rsaquo;</a>' +
      '</div>' +
    '</article>';
  }

  function expeditionsSection(opts) {
    var runs = (opts && opts.siegeRuns) || [];
    var body = runs.length
      ? runs.map(expeditionCard).join('')
      : '<a class="sg-exp is-empty" href="' + HREF.siege + '">' +
          '<span class="sg-exp-icon">&#9968;</span>' +
          '<span class="sg-exp-empty-body"><strong>No expedition in progress</strong>' +
          '<em>Start a Siege run and it waits for you here.</em></span>' +
          '<span class="sg-exp-go">Start &rsaquo;</span>' +
        '</a>';
    return '<section class="sg-section">' +
      '<div class="sg-section-head"><h3>Continue Playing</h3>' +
      '<a href="' + HREF.siege + '">Siege</a></div>' +
      '<div class="sg-exps">' + body + '</div>' +
    '</section>';
  }

  /* ---------- chrome ---------- */

  // A guest has no avatar, level or progression to show, so the identity slot
  // carries the sign-in call rather than an empty crest. The coin chip stays
  // (guests hold a starting balance) but the bell goes - there is nothing to
  // notify an account-less player about.
  // Real balance when progression answers; the guest starter otherwise. A guest
  // genuinely holds 100, so that is a fact rather than a placeholder.
  function accountInitial(opts) {
    var n = (opts && opts.live && opts.live.displayName) || '';
    return n ? n.charAt(0).toUpperCase() : '·';
  }

  // A guest holds no balance - 100 is what an account is *created* with, not
  // what a signed-out visitor has, so showing it was a made-up number too.
  function formatCoins(opts) {
    var gold = opts && opts.live && opts.live.gold;
    return gold != null ? Number(gold).toLocaleString() : '—';
  }

  function topMarkup(opts) {
    var guest = Boolean(opts && opts.guest);
    return '<header class="sg-top' + (guest ? ' is-guest' : '') + '">' +
      '<img class="sg-logo" src="/img/siegelings-logo.webp" alt="Siegelings">' +
      '<span class="sg-top-spacer"></span>' +
      '<span class="sg-chip coin"><img src="/img/ui/siegel-coin.webp" alt="">' +
        esc(formatCoins(opts, guest)) + '</span>' +
      (guest
        ? '<button class="sg-signin" type="button">Sign In</button>'
        : '<span class="sg-avatar"><i>' + esc(accountInitial(opts)) + '</i><b>' +
          esc((opts && opts.live && opts.live.level) || '—') + '</b></span>' +
          '<button class="sg-bell" type="button" aria-label="Notifications">✦</button>') +
    '</header>';
  }

  function bottomMarkup(active, opts) {
    opts = opts || {};
    var openTray = opts.openTray;
    var guest = opts.guest;
    var NAV = navFor(opts);
    return '<nav class="sg-bottom' + (openTray ? ' tray-open' : '') + '" data-bottom>' +
      NAV.filter(function (n) { return n.items; }).map(function (n) {
        var items = (guest && n.guestItems) ? n.guestItems : n.items;
        return '<div class="sg-tray' + (n.id === openTray ? ' open' : '') + '" data-tray="' + n.id + '"><div>' +
          '<ul>' + items.map(function (it) {
            var auth = it[0] === 'Sign In' || it[0] === 'Create Account';
            var attrs = linkAttrs(it[0]);
            return '<li' + (auth ? ' class="is-auth"' : '') + '>' +
              (attrs ? '<a' + attrs + '>' + esc(it[0]) + '</a>' : esc(it[0])) +
              (it[1] ? '<span>' + esc(it[1]) + '</span>' : '') + '</li>';
          }).join('') + '</ul></div></div>';
      }).join('') +
      '<div class="sg-nav">' + NAV.map(function (n) {
        return '<button type="button" data-nav="' + n.id + '" data-screen="' + esc(n.screen || '') +
          '" class="' + (n.id === active ? 'on' : '') +
          (n.items ? ' has-tray' : '') + (n.id === openTray ? ' tray-on' : '') + '">' +
          '<span class="ico">' + n.ico + '</span>' + esc(n.label) +
          (n.items ? '<i class="sg-caret" aria-hidden="true"></i>' : '') + '</button>';
      }).join('') + '</div>' +
    '</nav>';
  }

  var onNavigate = null;

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
        var screen = btn.getAttribute('data-screen');
        var tray = bottom.querySelector('[data-tray="' + id + '"]');
        var isCurrent = btn.classList.contains('on');
        // First tap on another tab goes to that screen; tapping the tab you are
        // already on opens its tray, which is where the sub-destinations live.
        if (screen && !isCurrent && typeof onNavigate === 'function') {
          openTray(null);
          onNavigate(screen);
          return;
        }
        var alreadyOpen = tray && tray.classList.contains('open');
        openTray(alreadyOpen || !tray ? null : id);
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
      '<div class="sg-scroll">' + heroMarkup() + featuredMarkup() + leaderboardSection(opts) + gallerySection() + questsMarkup(opts) + expeditionsSection(opts) +
      '<div style="height:132px"></div></div>' +
      bottomMarkup('home', opts);
  }

  function galleryScreen(opts) {
    opts = opts || {};
    var elements = ['ALL', 'FIRE', 'WATER', 'EARTH', 'WIND', 'ICE', 'ELECTRIC', 'PSYCHIC', 'METAL'];
    var rarities = ['ALL', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
    var total = ALL_CARDS.length;
    var owned = opts.ownedTotal != null ? opts.ownedTotal : null;
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-gal-head"><h2>The Binder</h2><p>' +
          (owned != null ? esc(owned) + ' of ' + esc(total) + ' cards owned'
                         : esc(total) + ' cards — every Siegeling, Strategy, Deception and SiegeKnight') +
        '</p></div>' +
        '<div class="sg-gal-tools" data-tools>' +
          '<button class="sg-icon-btn" type="button" data-search-toggle aria-label="Search">⌕</button>' +
          '<label class="sg-search"><input type="text" placeholder="Search the binder…" data-search-input></label>' +
          '<button class="sg-icon-btn" type="button" data-filter-toggle aria-label="Filters">≡</button>' +
          '<span class="sg-count" data-count></span>' +
        '</div>' +
        '<div class="sg-filters" data-filters><div>' +
          '<div class="sg-filter-label">Element</div>' +
          '<div class="sg-filter-row">' + elements.map(function (e, i) {
            return '<button class="sg-pill' + (i === 0 ? ' on' : '') + '" type="button" data-el="' + e + '" style="--el:' +
              (e === 'ALL' ? 'var(--acc-lemon)' : color(e)) + '">' +
              (e === 'ALL' ? '' : '<img src="' + icon(e) + '" alt="">') + esc(title(e)) + '</button>';
          }).join('') + '</div>' +
          '<div class="sg-filter-label">Type</div>' +
          '<div class="sg-filter-row">' + [['ALL','All'],['SIEGLING','Siegelings'],['SPELL','Strategies'],['TRAP','Deceptions'],['SIEGEKNIGHT','SiegeKnights']].map(function (t, i) {
            return '<button class="sg-pill' + (i === 0 ? ' on' : '') + '" type="button" data-type="' + t[0] + '">' + esc(t[1]) + '</button>';
          }).join('') + '</div>' +
          '<div class="sg-filter-label">Rarity</div>' +
          '<div class="sg-filter-row">' + rarities.map(function (r, i) {
            return '<button class="sg-pill sg-pill-rarity' + (i === 0 ? ' on' : '') + '" type="button" data-rarity="' + r + '">' +
              (r === 'ALL' ? '' : '<i class="sg-rar ' + r.toLowerCase() + '"></i>') + esc(title(r)) + '</button>';
          }).join('') + '</div>' +
        '</div></div>' +
        '<div class="sg-gal-grid" data-grid></div>' +
        '<div class="sg-gal-more" data-more hidden><button type="button">Show more</button></div>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      '<div class="sg-sheet" data-sheet><div class="sg-sheet-card" data-sheet-card></div></div>' +
      bottomMarkup('collection', opts);
  }

  // SiegeKnight faces: card-binder-visual exposes the art helpers but the knight
  // composition itself lives in home.js, which this page cannot load (it drives
  // the old hub). Mirrored here using the same class names, so style.css dresses
  // it identically to the shipping binder.
  function knightCard(card) {
    var visual = window.SieglingsCardBinderVisual;
    if (!visual) return '';
    var rarity = String(card.rarity || 'common').toLowerCase();
    var el = String(card.element || 'NEUTRAL').toLowerCase();
    var body = '<div class="knight-card-body">' +
      '<span class="knight-card-name">' + esc(card.name) + '</span>' +
      '<span class="knight-card-meta"><span class="knight-element">' + esc(title(card.element)) + '</span> ' +
      '<span class="knight-tier tier-' + esc(String(card.tier || 'siegeknight').toLowerCase()) + '">' +
      esc(card.tier || 'SiegeKnight') + '</span> ' +
      '<span class="knight-rarity rarity-' + esc(rarity) + '">' + esc(title(card.rarity)) + '</span></span>' +
      (card.passive ? '<span class="knight-card-ability"><span>Passive</span>' + esc(card.passive) + '</span>' : '') +
    '</div>';
    if (visual.usesFullCardArt && visual.usesFullCardArt(card)) {
      var crop = visual.buildArtTransformStyle ? visual.buildArtTransformStyle(card) : '';
      return '<div class="knight-card knight-full-card-art knight-binder-card rarity-frame-' + esc(rarity) +
        ' el-' + esc(el) + '" role="img" aria-label="' + esc(card.name) + '">' +
        '<img src="' + esc(visual.preferWebp ? visual.preferWebp(card.cardArtUrl) : card.cardArtUrl) +
        '" alt="' + esc(card.name) + '" loading="lazy"' + (crop ? ' style="' + esc(crop) + '"' : '') + '>' +
        body + '</div>';
    }
    if (visual.usesKnightOverlayArt && visual.usesKnightOverlayArt(card)) {
      return '<div class="knight-card knight-full-card-art knight-overlay-art knight-binder-card rarity-frame-' +
        esc(rarity) + ' el-' + esc(el) + '" style="--knight-color:' + visual.elementColor(card.element) +
        ";--knight-card-back:url('/img/knights/card-back-siegeknight.png');--knight-card-template:url('/img/knights/siegeknight-card-template.png')\">" +
        visual.renderKnightOverlayArtWindow(card) +
        '<div class="knight-card-template" aria-hidden="true"></div>' + body + '</div>';
    }
    return '';
  }

  // The production renderer composes the real card: frame, notches, rarity
  // treatment, stats and description, with overlay art composited in and full
  // card art used whole. Reimplementing that here would have drifted from the
  // dashboard the moment a designer changed a frame.
  function galleryCard(c) {
    var visual = window.SieglingsCardBinderVisual;
    if (String(c.type || '').toUpperCase() === 'SIEGEKNIGHT') {
      var knight = knightCard(c);
      if (knight) return '<button class="sg-card-tile" type="button" data-card="' + esc(c.id) + '">' + knight + '</button>';
    }
    if (visual && visual.renderBinderCardTile) {
      return '<button class="sg-card-tile" type="button" data-card="' + esc(c.id) + '">' +
        visual.renderBinderCardTile(c, { descriptionText: c.description || '' }) +
      '</button>';
    }
    // Offline preview board: no renderer loaded, so fall back to the plate.
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
    var more = app.querySelector('[data-more]');
    var sheet = app.querySelector('[data-sheet]');
    var sheetCard = app.querySelector('[data-sheet-card]');
    var activeEl = 'ALL', activeRarity = 'ALL', activeType = 'ALL', query = '', limit = 24;

    function matches() {
      return ALL_CARDS.filter(function (c) {
        if (activeType !== 'ALL' && String(c.type || 'SIEGLING').toUpperCase() !== activeType) return false;
        if (activeEl !== 'ALL' && c.element !== activeEl) return false;
        if (activeRarity !== 'ALL' && String(c.rarity || '').toUpperCase() !== activeRarity) return false;
        if (query && String(c.name || '').toLowerCase().indexOf(query) === -1) return false;
        return true;
      });
    }

    function repaint() {
      var rows = matches();
      grid.innerHTML = rows.slice(0, limit).map(galleryCard).join('');
      count.textContent = rows.length + (rows.length === 1 ? ' card' : ' cards');
      // Every filter change and Show more paints fresh card faces, so the
      // descriptions have to be re-fitted - the initial render's pass only saw
      // the first page.
      scheduleFit(app);
      // A binder is browsed, not scrolled forever: page it rather than paint
      // hundreds of art-heavy tiles at once.
      more.hidden = rows.length <= limit;
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
      query = this.value.trim().toLowerCase(); limit = 24; repaint();
    });
    filters.querySelectorAll('[data-el]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        activeEl = pill.getAttribute('data-el'); limit = 24;
        filters.querySelectorAll('[data-el]').forEach(function (p2) { p2.classList.toggle('on', p2 === pill); });
        repaint();
      });
    });
    filters.querySelectorAll('[data-type]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        activeType = pill.getAttribute('data-type'); limit = 24;
        filters.querySelectorAll('[data-type]').forEach(function (p2) { p2.classList.toggle('on', p2 === pill); });
        repaint();
      });
    });
    filters.querySelectorAll('[data-rarity]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        activeRarity = pill.getAttribute('data-rarity'); limit = 24;
        filters.querySelectorAll('[data-rarity]').forEach(function (p2) { p2.classList.toggle('on', p2 === pill); });
        repaint();
      });
    });
    more.querySelector('button').addEventListener('click', function () { limit += 24; repaint(); });

    function openSheet(card) {
      var abilities = card.abilities || (card.ability ? [card.ability] : []);
      sheetCard.innerHTML = '<div class="sg-sheet-grab"></div>' +
        '<div class="sg-sheet-art"><img src="' + esc(card.cardArtUrl) + '" alt="' + esc(card.name) + '"></div>' +
        '<h3>' + esc(card.name) + '</h3>' +
        '<div class="sg-sheet-meta"><img src="' + esc(icon(card.element)) + '" alt="">' +
        esc(title(card.element)) + ' · ' + esc(title(card.rarity)) + '</div>' +
        '<div class="sg-sheet-stats">' +
          '<div><span>Health</span><b>' + esc(card.health == null ? '—' : card.health) + '</b></div>' +
          '<div><span>Speed</span><b>' + esc(card.speed == null ? '—' : card.speed) + '</b></div>' +
          '<div><span>Cost</span><b>' + esc(card.costAmount || '—') + '</b></div>' +
        '</div>' +
        (abilities.length
          ? '<div class="sg-sheet-abilities">' + abilities.slice(0, 3).map(function (a) {
              return '<div class="sg-sheet-ability"><strong>' + esc(a.name || 'Ability') + '</strong>' +
                (a.description ? '<span>' + esc(a.description) + '</span>' : '') + '</div>';
            }).join('') + '</div>'
          : (card.description ? '<p class="sg-sheet-desc">' + esc(card.description) + '</p>' : '')) +
        '<a class="sg-sheet-cta" href="/deck-builder">Use in a deck ›</a>';
      sheet.classList.add('open');
    }
    grid.addEventListener('click', function (e) {
      var host = e.target.closest ? e.target.closest('[data-card]') : null;
      if (host) openSheet(byIdIn(ALL_CARDS, host.getAttribute('data-card')) || byId(host.getAttribute('data-card')));
    });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.classList.remove('open'); });

    if (opts.filtersOpen) { filters.classList.add('open'); app.querySelector('[data-filter-toggle]').classList.add('on'); }
    repaint();
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
    { id: 'siege', label: 'Siege', tag: 'Expedition',
      line: 'Roguelike expedition — build a warband.',
      art: '/img/gallery/draco-brood.webp', el: 'EARTH', cta: 'Enter' }
  ];

  // The Siege panel's tag said "New" with a badge. Whether a run is waiting is
  // a fact the payload knows, so it says that instead.
  function modePanel(m, opts) {
    if (m.id === 'siege' && opts && opts.siegeRuns && opts.siegeRuns.length) {
      m = { id: m.id, label: m.label, tag: 'Run saved', badge: true, line: m.line,
            art: m.art, el: m.el, cta: 'Resume' };
    }
    return '<a class="sg-mode' + (m.primary ? ' is-primary' : '') + '"' + linkAttrs(m.label) +
      ' style="--el:' + color(m.el) + '">' +
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

  function playScreen(opts) {
    opts = opts || {};
    var lead = byId('solgator') || CARDS[0];
    var guest = Boolean(opts.guest);
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-modes">' + MODES.map(function (m) { return modePanel(m, opts); }).join('') + '</div>' +
        expeditionsSection(opts) +
        (function () {
          // The count is whatever /api/match/rooms reported. Unknown says so
          // rather than showing the "11 open" the concept shipped with.
          var open = opts.lobbies != null ? opts.lobbies : (opts.live && opts.live.lobbies);
          var label = open == null ? 'Browse' : (open + ' open');
          return '<a class="sg-lobbies" href="' + HREF.lobbies + '">' +
            '<span class="sg-lobbies-dot"></span>Social Lobbies<em>' +
            esc(label) + '</em><span class="go">›</span></a>';
        })() +
        (guest ? guestBand() : '') +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('play', opts);
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

  // Offline stand-ins for the preset decks the catalog supplies. No win/loss:
  // these are catalog presets, and a preset has no record - the 18W-6L, 11W-9L
  // and 75% rates this list used to carry were invented outright.
  var DECKS = [
    { name: 'Emberwaste Vanguard', lead: 'solgator',     els: ['FIRE', 'EARTH', 'METAL'], cards: 40 },
    { name: 'Glacier Choir',       lead: 'glaciemperor', els: ['ICE', 'WATER'],           cards: 40 },
    { name: 'Stormfeather Rite',   lead: 'aerovane',     els: ['WIND', 'ELECTRIC'],       cards: 40 },
    { name: 'Root & Ruin',         lead: 'gymstone',     els: ['EARTH', 'POISON'],        cards: 40 }
  ];

  function deckRow(d) {
    var lead = byId(d.lead) || CARDS[0];
    var total = (d.w || 0) + (d.l || 0);
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
        '<div class="sg-deckrow-meta">' +
          (total ? '<b>' + d.w + 'W</b> · ' + d.l + 'L &nbsp;·&nbsp; ' + rate + '% &nbsp;·&nbsp; ' : '') +
          esc(d.cards) + ' cards</div>' +
      '</div>' +
      (total ? '<div class="sg-deckrow-bar"><i style="width:' + rate + '%"></i></div>' : '') +
    '</article>';
  }

  // A signed-in player's own saved decks replace the catalog presets.
  function playerDecks(opts) {
    var saved = opts && opts.live && opts.live.savedDecks;
    if (!saved || !saved.length) return null;
    return saved.slice(0, 6).map(function (d, i) {
      var lead = (d.cards || []).map(function (c) { return byIdIn(ALL_CARDS, c.id || c); })
        .filter(Boolean)[0] || CARDS[i] || CARDS[0];
      return {
        name: d.name || 'Untitled deck', lead: lead && lead.id,
        els: d.elements || [], w: d.wins || 0, l: d.losses || 0,
        cards: (d.cards || []).reduce(function (n, c) { return n + (c.count || 1); }, 0),
        active: Boolean(d.selected || d.active)
      };
    });
  }

  function decksScreen(opts) {
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-page-head"><h2>My Decks</h2><p>' + (function () {
          var d = playerDecks(opts);
          return d ? esc(d.length) + ' saved' : esc(DECKS.length) + ' preset decks';
        })() + '</p></div>' +
        '<div class="sg-tool-row">' +
          '<button class="sg-ghost-btn" type="button"><span class="ico">✎</span>Deck Builder</button>' +
          '<button class="sg-ghost-btn" type="button"><span class="ico">✧</span>Auto Build</button>' +
        '</div>' +
        '<div class="sg-stack">' + (playerDecks(opts) || DECKS).map(deckRow).join('') + '</div>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('collection', opts);
  }

  /* ---------- shop ---------- */

  // Every value on this screen used to be invented: four packs that do not exist
  // at a flat 150, three Siegelcoin bundles with dollar prices nothing sells,
  // and a "Cinderfall Collection, ends in 2d, 900" promotion. /api/shop/packs is
  // public and returns the real catalog - id, name, description, price, elements
  // and odds - so the screen renders that, and says the shop is unavailable when
  // the call fails rather than falling back to fiction.
  function packElement(pk) {
    return (pk.elements && pk.elements[0]) || 'NEUTRAL';
  }

  function packCard(pk) {
    var el = packElement(pk);
    var cardsPer = pk.odds && pk.odds.cardsPerPack;
    return '<article class="sg-pack" style="--el:' + color(el) + '">' +
      '<div class="sg-pack-face"><img src="/img/decks/card-back-' + String(el).toLowerCase() +
        '.webp" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"></div>' +
      '<strong>' + esc(pk.name || pk.id) + '</strong>' +
      '<span>' + esc(cardsPer ? cardsPer + ' cards' : '') + '</span>' +
      '<button class="sg-buy" type="button"><img src="/img/ui/siegel-coin.webp" alt="">' +
        esc(pk.price != null ? pk.price : '—') + '</button>' +
    '</article>';
  }

  // The hero is a real pack, not a promotion: the cheapest starter pack when the
  // catalog marks one, otherwise the first active pack.
  function featuredPack(packs) {
    var starters = packs.filter(function (pk) { return pk.starterEligible; });
    var pool = starters.length ? starters : packs;
    return pool.slice().sort(function (x, y) {
      return (x.price == null ? 1e9 : x.price) - (y.price == null ? 1e9 : y.price);
    })[0];
  }

  function shopScreen(opts) {
    opts = opts || {};
    var packs = (opts.live && opts.live.packs) || [];
    var feature = GALLERY[3];
    var hero = packs.length ? featuredPack(packs) : null;
    var heroEl = hero ? packElement(hero) : 'FIRE';
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        (hero
          ? '<section class="sg-feature" style="--el:' + color(heroEl) + '">' +
              '<img class="sg-feature-bg" src="' + plate(feature) + '" alt="">' +
              '<div class="sg-feature-veil"></div>' +
              '<div class="sg-feature-body">' +
                '<span class="sg-tag">' + esc(title(heroEl)) + ' &middot; Starter</span>' +
                '<h2>' + esc(hero.name || hero.id) + '</h2>' +
                '<p>' + esc(hero.description || '') + '</p>' +
                '<button class="sg-cta" type="button"><img src="/img/ui/siegel-coin.webp" alt="">' +
                  esc(hero.price != null ? hero.price : '—') + '</button>' +
              '</div>' +
            '</section>'
          : '') +
        '<section class="sg-section">' +
          '<div class="sg-section-head"><h3>Packs</h3>' +
            (packs.length ? '<span class="sg-section-note">' + esc(packs.length) + '</span>' : '') +
          '</div>' +
          (packs.length
            // A grid, not a swipe rail: the real catalog is 17 packs, and a
            // horizontal rail hides all but three of them.
            ? '<div class="sg-pack-grid">' + packs.map(packCard).join('') + '</div>'
            : '<div class="sg-empty-plate">' +
                '<img src="' + plate(GALLERY[1]) + '" alt="" loading="lazy">' +
                '<div class="sg-empty-veil"></div>' +
                '<div class="sg-empty-body"><strong>The stall is closed</strong>' +
                '<p>The pack catalog did not answer. Try again in a moment.</p></div>' +
              '</div>') +
        '</section>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('shop', opts);
  }

  /* ---------- profile ---------- */

  // The six badges and their earned/unearned states were invented, as was the
  // "All 42" beside them: no endpoint reports a badge, so the section is gone
  // rather than decorated with fiction. Recent now reads the account's own
  // match history, which /api/player/progression really does return.
  function recentMarkup(opts) {
    var hist = (opts.live && opts.live.matchHistory) || [];
    if (!hist.length) {
      return '<div class="sg-empty-row">' +
        esc(opts.guest ? 'Sign in to keep a match record.' : 'No matches recorded yet.') +
      '</div>';
    }
    return '<div class="sg-stack sg-stack-tight">' + hist.slice(0, 5).map(function (m) {
      var won = m.result === 'WIN' || m.result === 'win' || m.won === true;
      var mode = title(m.matchType || 'Match');
      var against = m.opponentName ? 'vs ' + m.opponentName : (m.loadoutLabel || '');
      return '<div class="sg-recent' + (won ? ' is-win' : '') + '">' +
        '<span class="mode">' + esc(mode) + '</span>' +
        '<span class="what">' + esc(won ? 'Win' : 'Loss') +
          (against ? '<em>' + esc(against) + '</em>' : '') + '</span>' +
        '<span class="gain">' + esc(m.turnNumber != null ? 'T' + m.turnNumber : '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  // Progression only answers for a signed-in player, so the bar states that
  // rather than inventing a number.
  function profileTiles(opts) {
    var live = opts.live || {};
    var hist = live.matchHistory || [];
    var played = hist.length || null;
    var wins = hist.filter(function (m) { return m && (m.won === true || m.result === 'WIN'); }).length;
    var rate = played ? Math.round(wins / played * 100) + '%' : '—';
    var owned = live.ownedTotal != null && ALL_CARDS.length
      ? Math.round(live.ownedTotal / ALL_CARDS.length * 100) + '%' : '—';
    return '<div class="sg-tiles">' +
      '<div><span>Matches</span><b>' + esc(played != null ? played : '—') + '</b></div>' +
      '<div><span>Win Rate</span><b>' + esc(rate) + '</b></div>' +
      '<div><span>Collected</span><b>' + esc(owned) + '</b></div>' +
    '</div>';
  }

  function xpMarkup(opts) {
    var live = opts.live || {};
    if (live.xp == null || !live.xpToNext) {
      return '<span class="sg-xp-note">' +
        (opts.guest ? 'Sign in to track your progress' : 'Progress unavailable') + '</span>';
    }
    var pct = Math.max(0, Math.min(100, Math.round(live.xp / live.xpToNext * 100)));
    return '<div class="sg-xp"><i style="width:' + pct + '%"></i></div>' +
      '<span class="sg-xp-note">' + Number(live.xp).toLocaleString() + ' / ' +
      Number(live.xpToNext).toLocaleString() + ' XP to Level ' + ((live.level || 0) + 1) + '</span>';
  }

  function profileScreen(opts) {
    var showcase = GALLERY[2];
    var showcaseCard = byId(showcase.card) || CARDS[0];
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<section class="sg-crest" style="--el:' + color(showcaseCard.element) + '">' +
          '<img class="sg-crest-bg" src="' + plate(showcase) + '" alt="">' +
          '<div class="sg-crest-veil"></div>' +
          '<div class="sg-crest-body">' +
            '<span class="sg-crest-ring"><i>' + esc(accountInitial(opts)) + '</i></span>' +
            '<h2>' + esc((opts.live && opts.live.displayName) || (opts.guest ? 'Guest' : 'Siegelord')) + '</h2>' +
            '<p>' + esc(opts.live && opts.live.level != null ? 'Level ' + opts.live.level : 'Signed out') + '</p>' +
            xpMarkup(opts) +
          '</div>' +
        '</section>' +
        profileTiles(opts) +
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
          '<div class="sg-section-head"><h3>Recent</h3></div>' +
          recentMarkup(opts) +
        '</section>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('more', opts);
  }

  /* ---------- leaderboard ----------
     `/api/leaderboards` returns {periods:{daily,weekly,...}, boards:{wins,
     matchesPlayed, spellsCast, trapsSprung, siegelingsDefeated, pvpWinRate}},
     each board a list of {rank, displayName, value, detail}. On this environment
     every board is currently empty (no match history yet), so the empty state is
     not an afterthought - it is what most players will see first. */
  var BOARD_META = {
    wins:               { label: 'Victories',   unit: 'wins',    el: 'FIRE',     icon: '⚔' },
    pvpWinRate:         { label: 'Win Rate',    unit: 'matches', el: 'LIGHT',    icon: '◈' },
    matchesPlayed:      { label: 'Matches',     unit: 'played',  el: 'WIND',     icon: '↻' },
    siegelingsDefeated: { label: 'Felled',      unit: 'downed',  el: 'SHADOW',   icon: '☠' },
    spellsCast:         { label: 'Strategies',  unit: 'cast',    el: 'PSYCHIC',  icon: '✧' },
    trapsSprung:        { label: 'Deceptions',  unit: 'sprung',  el: 'POISON',   icon: '✦' }
  };
  var BOARD_ORDER = ['wins', 'pvpWinRate', 'matchesPlayed', 'siegelingsDefeated', 'spellsCast', 'trapsSprung'];
  var PERIOD_LABEL = { daily: 'Today', weekly: 'This week', monthly: 'This month', year: 'This year', allTime: 'All time' };

  function boardRows(live, boardId, period) {
    var lb = live && live.leaderboards;
    if (!lb) return [];
    var scope = (period && lb.periods && lb.periods[period]) || lb.boards || {};
    return scope[boardId] || [];
  }

  function leaderboardSection(opts) {
    var live = opts.live;
    var period = opts.lbPeriod || (live && live.leaderboards && live.leaderboards.defaultPeriod) || 'daily';
    var boardId = opts.lbBoard || 'wins';
    var meta = BOARD_META[boardId] || BOARD_META.wins;
    var rows = boardRows(live, boardId, period);
    var periods = (live && live.leaderboards && live.leaderboards.periods)
      ? Object.keys(live.leaderboards.periods) : ['daily', 'weekly', 'allTime'];

    return '<section class="sg-section sg-lb" style="--el:' + color(meta.el) + '">' +
      '<div class="sg-section-head"><h3>Hall of Siege</h3>' +
        '<a href="#" data-lb-cycle>' + esc(PERIOD_LABEL[period] || title(period)) + ' ›</a></div>' +
      '<div class="sg-lb-boards">' + BOARD_ORDER.map(function (id) {
        var m = BOARD_META[id];
        return '<button class="sg-lb-chip' + (id === boardId ? ' on' : '') + '" type="button" data-lb-board="' + id +
          '" style="--el:' + color(m.el) + '"><span>' + m.icon + '</span>' + esc(m.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="sg-lb-body" data-lb-body>' +
        (rows.length ? rows.slice(0, 10).map(function (r, i) { return lbRow(r, i, meta); }).join('')
                     : lbEmpty(meta, period)) +
      '</div>' +
    '</section>';
  }

  function lbRow(row, i, meta) {
    var rank = row.rank != null ? row.rank : i + 1;
    var medal = rank <= 3 ? ' is-podium rank-' + rank : '';
    return '<div class="sg-lb-row' + medal + '">' +
      '<span class="sg-lb-rank">' + esc(rank) + '</span>' +
      '<span class="sg-lb-name">' + esc(row.displayName || '?') + '</span>' +
      '<span class="sg-lb-value">' + esc(row.detail || (row.value + ' ' + meta.unit)) + '</span>' +
    '</div>';
  }

  // Every board is empty until matches are played, so this is the common case,
  // not the exception - it gets artwork and a call to action rather than a dash.
  function lbEmpty(meta, period) {
    return '<div class="sg-lb-empty">' +
      '<img src="/img/gallery/bearzooka-rampage.webp" alt="" loading="lazy">' +
      '<div class="sg-lb-empty-veil"></div>' +
      '<div class="sg-lb-empty-body">' +
        '<strong>The hall is empty</strong>' +
        '<p>No ' + esc(String(meta.label).toLowerCase()) + ' recorded ' +
        esc((PERIOD_LABEL[period] || title(period)).toLowerCase()) + '. Be the first name on it.</p>' +
        '<a class="sg-lb-cta" href="' + HREF.battle + '">Play a match ›</a>' +
      '</div>' +
    '</div>';
  }

  function mountLeaderboard(app, opts) {
    var section = app.querySelector('.sg-lb');
    if (!section) return;
    section.querySelectorAll('[data-lb-board]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        opts.lbBoard = chip.getAttribute('data-lb-board');
        redrawLeaderboard(app, opts);
      });
    });
    var cycle = section.querySelector('[data-lb-cycle]');
    if (cycle) cycle.addEventListener('click', function (e) {
      e.preventDefault();
      var lb = opts.live && opts.live.leaderboards;
      var keys = (lb && lb.periods) ? Object.keys(lb.periods) : ['daily', 'weekly', 'allTime'];
      var cur = keys.indexOf(opts.lbPeriod || (lb && lb.defaultPeriod) || 'daily');
      opts.lbPeriod = keys[(cur + 1) % keys.length];
      redrawLeaderboard(app, opts);
    });
  }

  function redrawLeaderboard(app, opts) {
    var section = app.querySelector('.sg-lb');
    if (!section) return;
    var holder = document.createElement('div');
    holder.innerHTML = leaderboardSection(opts);
    section.replaceWith(holder.firstChild);
    mountLeaderboard(app, opts);
  }

  /* ---------- deck builder ---------- */

  // Rules come from the catalog payload (deckBuilder.minDeckSize / maxCopies),
  // not from hardcoded numbers - the preset-deck shape (40 cards, 20/10/10) is a
  // different rule and does not govern a custom build.
  function builderScreen(opts) {
    opts = opts || {};
    var rules = (opts.live && opts.live.deckBuilder) || { minDeckSize: 30, maxCopies: 3 };
    var deck = (opts.live && opts.live.decks && opts.live.decks[0]) || null;
    var entries = (deck && deck.cards) || [];
    var total = entries.reduce(function (n, e) { return n + (e.count || 0); }, 0);
    var pct = Math.min(100, Math.round(total / rules.minDeckSize * 100));
    var els = (deck && deck.elements) || ['FIRE'];
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-page-head"><h2>Deck Builder</h2><p>' +
          esc(total) + ' of ' + esc(rules.minDeckSize) + ' minimum &middot; max ' +
          esc(rules.maxCopies) + ' copies</p></div>' +
        '<div class="sg-build-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="sg-build-id" style="--el:' + color(els[0]) + '">' +
          '<input class="sg-build-name" value="' + esc(deck ? deck.name : 'New Deck') + '" aria-label="Deck name">' +
          '<div class="sg-deck-els">' + els.map(function (e) {
            return '<img src="' + icon(e) + '" alt="' + esc(title(e)) + '">';
          }).join('') + '</div>' +
        '</div>' +
        '<section class="sg-section">' +
          '<div class="sg-section-head"><h3>In this deck</h3><a href="#">Clear</a></div>' +
          '<div class="sg-swipe">' + (entries.length
            ? entries.map(function (e) {
                var c = byIdIn(ALL_CARDS, e.id) || byId(e.id);
                if (!c) return '';
                return '<div class="sg-build-slot">' + galleryCard(c) +
                  '<span class="sg-build-count">x' + esc(e.count) + '</span></div>';
              }).join('')
            : '<p class="sg-empty">Nothing added yet.</p>') + '</div>' +
        '</section>' +
        '<section class="sg-section">' +
          '<div class="sg-section-head"><h3>Add from your binder</h3>' +
            '<a href="/cards" data-screen="collection">Browse</a></div>' +
          '<div class="sg-gal-grid">' + ALL_CARDS.slice(0, 6).map(galleryCard).join('') + '</div>' +
        '</section>' +
        '<div class="sg-build-actions">' +
          '<button class="sg-ghost-btn" type="button"><span class="ico">✧</span>Auto Build</button>' +
          '<button class="sg-guest-primary" type="button">Save Deck</button>' +
        '</div>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('collection', opts);
  }

  /* ---------- social ---------- */

  function socialScreen(opts) {
    opts = opts || {};
    var rooms = (opts.live && opts.live.rooms) || [];
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-page-head"><h2>Social</h2><p>' +
          (rooms.length ? esc(rooms.length) + ' table' + (rooms.length === 1 ? '' : 's') + ' open now'
                        : 'No tables open right now') + '</p></div>' +
        '<div class="sg-tool-row">' +
          '<button class="sg-ghost-btn" type="button"><span class="ico">＋</span>Host a table</button>' +
          '<button class="sg-ghost-btn" type="button"><span class="ico">#</span>Join code</button>' +
        '</div>' +
        '<section class="sg-section">' +
          '<div class="sg-section-head"><h3>Open tables</h3></div>' +
          (rooms.length
            ? '<div class="sg-stack">' + rooms.slice(0, 8).map(lobbyRow).join('') + '</div>'
            : emptyLobbies()) +
        '</section>' +
        (opts.guest ? guestBand() : friendsSection(opts)) +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('more', opts);
  }

  function lobbyRow(room, i) {
    var lead = CARDS[i % Math.max(1, CARDS.length)] || CARDS[0];
    var host = room.hostName || room.playerName || 'Open table';
    return '<article class="sg-lobby" style="--el:' + color(lead && lead.element) + '">' +
      '<div class="sg-lobby-bg" style="background-image:url(\'' + land(lead && lead.element) + '\')"></div>' +
      '<div class="sg-lobby-veil"></div>' +
      (lead ? '<div class="sg-lobby-art"><img src="' + esc(lead.cardArtUrl) + '" alt="" loading="lazy"></div>' : '') +
      '<div class="sg-lobby-body">' +
        '<span class="sg-lobby-kicker">Waiting</span>' +
        '<strong>' + esc(host) + '</strong>' +
        '<em>' + esc(room.roomId || room.id || 'Table') + '</em>' +
      '</div>' +
      '<span class="sg-lobby-go">Join ›</span>' +
    '</article>';
  }

  function emptyLobbies() {
    return '<div class="sg-empty-plate">' +
      '<img src="/img/gallery/bearby-longfuse.webp" alt="" loading="lazy">' +
      '<div class="sg-empty-veil"></div>' +
      '<div class="sg-empty-body"><strong>Nobody is waiting</strong>' +
      '<p>Host a table and it shows up here for everyone.</p></div>' +
    '</div>';
  }

  // Kael, Ruune, Sable and Wren were invented people with invented statuses.
  // /api/social/presence returns the signed-in account's real friends with live
  // presence, so the list is that or it is empty.
  function friendsSection(opts) {
    var friends = (opts && opts.live && opts.live.friends) || [];
    return '<section class="sg-section">' +
      '<div class="sg-section-head"><h3>Friends</h3></div>' +
      (friends.length
        ? '<div class="sg-stack sg-stack-tight">' + friends.slice(0, 12).map(function (f) {
            var p = f.presence || {};
            var name = f.displayName || f.email || 'Player';
            var status = p.online ? title(p.status || 'ONLINE') : 'Offline';
            return '<div class="sg-friend' + (p.online ? ' is-on' : '') + '">' +
              '<span class="sg-friend-crest">' + esc(String(name).charAt(0).toUpperCase()) + '</span>' +
              '<span class="sg-friend-body"><strong>' + esc(name) + '</strong><em>' + esc(status) + '</em></span>' +
              (p.online ? '<button class="sg-friend-go" type="button">Invite</button>' : '') +
            '</div>';
          }).join('') + '</div>'
        : '<div class="sg-empty-row">No friends added yet.</div>') +
    '</section>';
  }

  /* ---------- settings ---------- */

  // Settings cannot be art-led without lying about what it is - these are
  // switches. It gets the gallery plate, the palette and the spacing; the rows
  // stay rows, because a toggle pretending to be a hero is worse design.
  // These switches used to render invented on/off states and do nothing when
  // tapped. They are real device preferences now: keyed, defaulted honestly
  // (Reduced motion follows the OS setting), persisted to localStorage and read
  // back on the next paint, so what the screen shows is what is stored.
  var SETTINGS_KEY = 'sgHubPrefs';
  var SETTINGS = [
    ['Audio', [['music', 'Music', true], ['sfx', 'Sound effects', true], ['voice', 'Battle voice', false]]],
    ['Motion', [['cardAnim', 'Card animations', true], ['reducedMotion', 'Reduced motion', null],
                ['parallax', 'Background parallax', true]]],
    ['Notifications', [['inviteNotify', 'Match invites', true], ['keepNotify', 'Keep ready', true],
                       ['resetNotify', 'Daily reset', false]]]
  ];

  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writePref(key, on) {
    var prefs = readPrefs();
    prefs[key] = on;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ }
  }
  function prefValue(key, fallback) {
    var prefs = readPrefs();
    if (Object.prototype.hasOwnProperty.call(prefs, key)) return Boolean(prefs[key]);
    if (fallback === null) {
      return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    return Boolean(fallback);
  }
  function mountSettings(app) {
    [].slice.call(app.querySelectorAll('[data-pref]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var on = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        btn.classList.toggle('on', on);
        writePref(btn.getAttribute('data-pref'), on);
      });
    });
  }

  function settingsScreen(opts) {
    opts = opts || {};
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<section class="sg-crest sg-crest-short">' +
          '<img class="sg-crest-bg" src="/img/gallery/bearby-blastoff.webp" alt="">' +
          '<div class="sg-crest-veil"></div>' +
          '<div class="sg-crest-body"><h2>Settings</h2><p>' +
            esc(opts.guest ? 'Signed out'
                 : ((opts.live && opts.live.displayName) || 'Signed in') +
                   (opts.live && opts.live.level != null ? ' \u00b7 Level ' + opts.live.level : '')) +
            '</p></div>' +
        '</section>' +
        SETTINGS.map(function (group, gi) {
          return '<section class="sg-section" style="--sec:' +
            ['var(--acc-coral)', 'var(--acc-cyan)', 'var(--acc-violet)'][gi % 3] + '">' +
            '<div class="sg-section-head"><h3>' + esc(group[0]) + '</h3></div>' +
            '<div class="sg-stack sg-stack-tight">' + group[1].map(function (row) {
              var on = prefValue(row[0], row[2]);
              return '<div class="sg-toggle-row"><span>' + esc(row[1]) + '</span>' +
                '<button class="sg-switch' + (on ? ' on' : '') + '" type="button" data-pref="' + esc(row[0]) + '" ' +
                'role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><i></i></button></div>';
            }).join('') + '</div>' +
          '</section>';
        }).join('') +
        '<section class="sg-section" style="--sec:var(--acc-lemon)">' +
          '<div class="sg-section-head"><h3>Account</h3></div>' +
          '<div class="sg-stack sg-stack-tight">' +
            (opts.guest
              ? '<a class="sg-toggle-row is-link" href="/login"><span>Sign in</span><em>›</em></a>' +
                '<a class="sg-toggle-row is-link" href="/login"><span>Create account</span><em>›</em></a>'
              : '<a class="sg-toggle-row is-link" href="/profile" data-screen="profile"><span>Profile</span><em>›</em></a>' +
                '<a class="sg-toggle-row is-link" href="/profile"><span>Manage account</span><em>›</em></a>' +
                '<a class="sg-toggle-row is-link is-danger" href="/profile"><span>Sign out</span><em>›</em></a>') +
            '<a class="sg-toggle-row is-link" href="/help" data-screen="help"><span>Help &amp; rules</span><em>›</em></a>' +
          '</div>' +
        '</section>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('more', opts);
  }

  /* ---------- help ---------- */

  // The real help page's own topic list, kept verbatim so the redesign does not
  // quietly drop a rules chapter. Art per topic comes from the element or Land
  // the chapter is about.
  var HELP = [
    ['Basics', 'How a match runs end to end', '/img/lands/relic.webp', 'NEUTRAL'],
    ['Turn loop', 'Draw, Setup, Battle, repeat', '/img/lands/fire.webp', 'FIRE'],
    ['Card types', 'Siegling, Strategy, Deception', '/img/gallery/draco-brood.webp', 'EARTH'],
    ['Board, notches & energy', 'Links, sockets and what they pay for', '/img/lands/electric.webp', 'ELECTRIC'],
    ['Evolution', 'Growing a Siegling mid-match', '/img/gallery/bearzooka-rampage.webp', 'FIRE'],
    ['SiegeKnight', 'Passives, actives and ultimates', '/img/lands/light.webp', 'LIGHT'],
    ['Buffs & afflictions', 'Temporary statuses and elemental damage', '/img/lands/poison.webp', 'POISON'],
    ['Element chart', 'What beats what', '/img/lands/ice.webp', 'ICE'],
    ['Siege mode', 'The roguelike expedition', '/img/lands/badlands.webp', 'EARTH']
  ];

  function helpScreen(opts) {
    opts = opts || {};
    return topMarkup(opts) +
      '<div class="sg-scroll">' +
        '<div class="sg-page-head"><h2>How to Play</h2><p>' + HELP.length + ' chapters</p></div>' +
        '<div class="sg-help-grid">' + HELP.map(function (h) {
          return '<a class="sg-help-card" href="/help" style="--el:' + color(h[3]) + '">' +
            '<img src="' + esc(h[2]) + '" alt="" loading="lazy">' +
            '<div class="sg-help-veil"></div>' +
            '<div class="sg-help-body"><strong>' + esc(h[0]) + '</strong><span>' + esc(h[1]) + '</span></div>' +
          '</a>';
        }).join('') + '</div>' +
        '<div style="height:132px"></div>' +
      '</div>' +
      bottomMarkup('more', opts);
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
    if (model.cards && model.cards.length) {
      ALL_CARDS = model.cards.slice();
    }
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
    if (opts.live) {
      applyLive(opts.live);
      if (opts.ownedTotal == null) opts.ownedTotal = opts.live.ownedTotal;
    }
    var app = document.createElement('div');
    app.className = 'sg-app';
    var builders = { collection: galleryScreen, decks: decksScreen, shop: shopScreen,
                     profile: profileScreen, play: playScreen, builder: builderScreen,
                     social: socialScreen, settings: settingsScreen, help: helpScreen };
    app.innerHTML = builders[screen] ? builders[screen](opts) : homeScreen(opts);
    host.appendChild(app);
    // Every screen carries the same chrome, so the rail and the tab bar are
    // wired unconditionally. Branching this is how the Cards screen ended up
    // rendering a rail that did not respond to taps.
    if (screen === 'collection') {
      mountGallery(app, opts);
    } else if (!builders[screen]) {
      mountHero(app, opts);
      mountLeaderboard(app, opts);
      mountStrip(app);
      var strip = opts.questsOpen && app.querySelector('[data-strip]');
      if (strip) strip.classList.add('open');
    }
    if (screen === 'settings') mountSettings(app);
    mountBottom(app);
    scheduleFit(app);
    return app;
  }

  /* ---------- description fitting ----------
     The showcase card's description sits in a `.card-summary-list` that is
     `overflow:hidden`, so long flavour text is simply cut off - measured at 8 of
     24 tiles, every one of them also running into the bottom notch row, worst
     case 45px past the centre notch. `card-binder-visual`'s own fitter only
     targets `.binder-card-description`, a different element, so it never saw
     these.

     This shrinks the text until it fits BOTH the panel and the space above the
     centre bottom notch, which is the tighter of the two constraints and the one
     that actually looks broken. Scoped to `.sg-card-tile` so the shipping
     binder's rendering is untouched. */
  // 6px is the floor because below it the text stops being readable on a phone,
  // and unreadable text that technically fits is not a fix. Past the floor the
  // box is capped and the text clamped with an ellipsis instead.
  var FIT_MIN_PX = 6;
  var NOTCH_CLEARANCE = 3;
  var fitFrame = null;

  function fitOneDescription(desc) {
    var list = desc.closest && desc.closest('.card-summary-list');
    if (!list) return;
    var tile = desc.closest('.sg-card-tile');
    desc.style.fontSize = '';
    desc.style.lineHeight = '';
    desc.style.webkitLineClamp = '';
    desc.style.display = '';
    desc.style.overflow = '';
    desc.style.maxHeight = '';

    var limit = list.clientHeight;
    // The centre bottom notch is what the text visibly runs into; the corner
    // notches sit outside the panel's width. Measured at 360px, the panel can
    // overlap it by ~3px on its own, so shrinking text alone cannot fix this -
    // the box has to be capped too.
    var centre = tile && tile.querySelector('.notch-dot.notch-BOTTOM');
    if (centre) {
      var available = centre.getBoundingClientRect().top - desc.getBoundingClientRect().top - NOTCH_CLEARANCE;
      // One line is the least that can be shown; below that the description is
      // not worth drawing over the frame.
      limit = Math.min(limit, Math.max(available, FIT_MIN_PX * 1.15));
    }
    if (limit <= 0) return;

    var size = parseFloat(window.getComputedStyle(desc).fontSize) || 9;
    if (desc.scrollHeight > limit + 1) {
      desc.style.lineHeight = '1.15';
      var guard = 30;
      while (desc.scrollHeight > limit + 1 && size > FIT_MIN_PX && guard-- > 0) {
        size = Math.max(FIT_MIN_PX, size * 0.94);
        desc.style.fontSize = size.toFixed(2) + 'px';
      }
    }
    // Cap unconditionally: this is what keeps the BOX off the notch, whether or
    // not the text needed shrinking.
    desc.style.maxHeight = limit.toFixed(1) + 'px';
    if (desc.scrollHeight > limit + 1) {
      var lineH = size * 1.15;
      desc.style.display = '-webkit-box';
      desc.style.webkitLineClamp = String(Math.max(1, Math.floor(limit / lineH)));
      desc.style.overflow = 'hidden';
    }
  }

  function fitCardDescriptions(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('.sg-card-tile .card-summary-description');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // Skip anything not laid out yet; it will be caught by the next pass.
      if (!el.getClientRects().length) continue;
      fitOneDescription(el);
    }
  }

  // Art loads after first paint and changes nothing about the text box, but a
  // web font or a viewport change does, so re-fit on both.
  function scheduleFit(root) {
    if (fitFrame != null) window.cancelAnimationFrame(fitFrame);
    fitFrame = window.requestAnimationFrame(function () {
      fitFrame = null;
      fitCardDescriptions(root);
    });
  }

  /* ---------- in-app router ----------
     Everything this design owns is swapped in place: no reload, no flash, and
     the browser Back button still works. Anything it does not own (the Battle
     table, Siege, Keep, Social) is a real navigation, deliberately. */
  function mountApp(host, opts) {
    opts = opts || {};
    var current = null;

    function show(screen, push) {
      screen = screen || 'home';
      host.innerHTML = '';
      render(host, screen, opts);
      current = screen;
      if (push) {
        try {
          history.pushState({ screen: screen }, '', pathForScreen(screen));
        } catch (e) { /* file:// and sandboxed frames reject pushState */ }
      }
      host.scrollTop = 0;
      scheduleFit(host);
    }

    onNavigate = function (screen) { show(screen, true); };

    // One delegated listener survives every re-render, which a per-element
    // binding would not.
    host.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a[data-screen]');
      if (!link) return;
      e.preventDefault();
      show(link.getAttribute('data-screen'), true);
    });

    // Rotation and width changes re-flow the tiles, so the fit has to be redone.
    window.addEventListener('resize', function () { scheduleFit(host); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { scheduleFit(host); });
    }

    window.addEventListener('popstate', function (e) {
      show((e.state && e.state.screen) || screenForPath(location.pathname) ||
           new URLSearchParams(location.search).get('screen') || 'home', false);
    });

    // ?screen= still works so existing links and the preview board keep going.
    show(opts.screen || new URLSearchParams(location.search).get('screen') ||
         screenForPath(location.pathname) || 'home', false);
    return { show: show, currentScreen: function () { return current; } };
  }

  window.SiegelingsHomeConcept = { render: render, mountApp: mountApp, applyLive: applyLive,
    screenForPath: screenForPath, pathForScreen: pathForScreen,
    fitCardDescriptions: fitCardDescriptions, cards: CARDS, coverageMarkup: coverageMarkup, coverage: COVERAGE };
})();
