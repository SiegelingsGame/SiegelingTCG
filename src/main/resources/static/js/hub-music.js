/* Hub soundtrack: the biome themes plus the main and battle tracks, shuffled, behind one on/off preference.

   The hub is a single page that re-renders its screens by emptying
   document.body, and removing a media element from the document pauses it. So
   the player is never attached to the DOM at all: a detached <audio> plays
   fine, and switching from Home to Cards cannot stop the song. Controls in the shell are plain elements
   carrying data-music-* attributes; this module wires them by delegation and
   repaints them on every change, so a re-rendered top bar needs no rebinding.

   Browsers refuse audible autoplay until a gesture, so a saved "on" preference
   arms a one-shot starter on the first tap, exactly as the Keep does. Tracks use
   preload="none" and only the current one is ever fetched: each is ~5-6 MB. */
(function () {
  'use strict';

  var KEY = 'sgHubMusicOn';
  var VOLUME = 0.32;
  // ?v= because Hosting serves mp3 as immutable for a year.
  var TRACKS = [
    { id: 'fire',     title: 'Fire Biome',     el: 'FIRE' },
    { id: 'water',    title: 'Water Biome',    el: 'WATER' },
    { id: 'wind',     title: 'Wind Biome',     el: 'WIND' },
    { id: 'electric', title: 'Electric Biome', el: 'ELECTRIC' },
    { id: 'desert',   title: 'Desert Biome',   el: 'EARTH' },
    { id: 'cave',     title: 'Cave Biome',     el: 'SHADOW' },
    { id: 'earth',    title: 'Earth Biome',    el: 'EARTH' },
    { id: 'ice',      title: 'Ice Biome',      el: 'ICE' },
    { id: 'poison',   title: 'Poison Biome',   el: 'POISON' },
    { id: 'metal',    title: 'Metal Biome',    el: 'METAL' },
    { id: 'light',    title: 'Light Biome',    el: 'LIGHT' },
    { id: 'undead',   title: 'Undead Biome',   el: 'UNDEAD' }
  ].map(function (t) { t.src = '/audio/biomes/' + t.id + '.mp3?v=1'; return t; }).concat([
    // The rest of the soundtrack: the Keep and Siege play these in place, and
    // the hub player is where every song can be heard on demand.
    { id: 'main',          title: 'Siegelings Theme',     el: 'NEUTRAL',  src: '/audio/sieglings-theme.mp3?v=1' },
    { id: 'loading',       title: 'Loading Theme',       el: 'NEUTRAL',  src: '/audio/sieglings-loading-theme.mp3?v=1' },
    { id: 'battle',        title: 'Battle Theme',        el: 'NEUTRAL',  src: '/audio/sieglings-battle-theme.mp3?v=1' },
    { id: 'battle-2',      title: 'Battle Theme II',     el: 'NEUTRAL',  src: '/audio/battle/sieglings-battle-theme-2.mp3?v=1' },
    { id: 'desert-gym',    title: 'Desert Gym Battle',   el: 'EARTH',    src: '/audio/battle/desert-gym-battle.mp3?v=1' },
    { id: 'electric-gym',  title: 'Electric Gym Battle', el: 'ELECTRIC', src: '/audio/battle/electric-gym-battle.mp3?v=1' },
    { id: 'fire-gym',      title: 'Fire Gym Battle',     el: 'FIRE',     src: '/audio/battle/fire-gym-battle.mp3?v=1' },
    { id: 'water-gym',     title: 'Water Gym Battle',    el: 'WATER',    src: '/audio/battle/water-gym-battle.mp3?v=1' },
    { id: 'earth-gym',     title: 'Earth Gym Battle',    el: 'EARTH',    src: '/audio/battle/earth-gym-battle.mp3?v=1' },
    { id: 'wind-gym',      title: 'Wind Gym Battle',     el: 'WIND',     src: '/audio/battle/wind-gym-battle.mp3?v=1' },
    { id: 'ice-gym',       title: 'Ice Gym Battle',      el: 'ICE',      src: '/audio/battle/ice-gym-battle.mp3?v=1' },
    { id: 'cave-gym',      title: 'Cave Gym Battle',     el: 'SHADOW',   src: '/audio/battle/cave-gym-battle.mp3?v=1' },
    { id: 'metal-gym',     title: 'Metal Gym Battle',    el: 'METAL',    src: '/audio/battle/metal-gym-battle.mp3?v=1' },
    { id: 'poison-gym',    title: 'Poison Gym Battle',   el: 'POISON',   src: '/audio/battle/poison-gym-battle.mp3?v=1' },
    { id: 'light-gym',     title: 'Light Gym Battle',    el: 'LIGHT',    src: '/audio/battle/light-gym-battle.mp3?v=1' }
  ]);

  var audio = null;
  var order = [];
  var pos = 0;
  /* A scene can take the player over: an Arena match plays the two knights'
     battle themes, a Siege Land its biome song. While one holds, the queue
     is the scene's own (looping) and the shuffle waits where it was, picking
     up from the same second when the scene ends. A song the player picks by
     hand ends the scene until a different one starts. */
  var ctx = null;          // { id, list: [track index], at, label }
  var dismissed = null;    // id of a scene the player overrode
  var hubSeek = 0;         // the shuffle's place while a scene holds
  var on = true;
  var started = false;   // true once a gesture has let play() through
  var pendingSeek = 0;   // where a restored song picks up, applied once it loads

  /* Resume across page loads. A full navigation (the gacha return to /shop, a
     sign-in redirect, Siege and back) tears the player down, and restarting a
     fresh shuffle from 0:00 every time made the soundtrack feel like it reset.
     The shuffle order, the song and its position are saved as the page goes
     and restored on the next load, so the same song carries on from the same
     second. Stale state (a visit hours later) starts a fresh shuffle instead.
     The browser still decides when sound may start: a new page needs its own
     tap before it plays, and the song then continues from where it was. */
  var RESUME_KEY = 'sgHubMusicResume2';
  var RESUME_TTL_MS = 30 * 60 * 1000;
  var lastSave = 0;

  function saveResume() {
    if (!order.length) return;
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({
        order: order, pos: pos,
        t: ctx ? hubSeek : (audio && audio.currentTime ? Math.floor(audio.currentTime) : pendingSeek),
        at: Date.now()
      }));
    } catch (e) { /* private mode */ }
  }

  function restoreResume() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved || !Array.isArray(saved.order) || Date.now() - (saved.at || 0) > RESUME_TTL_MS) return false;
    // The track list may have changed since the save; only an exact permutation is trusted.
    if (saved.order.length !== TRACKS.length) return false;
    var seen = {};
    for (var i = 0; i < saved.order.length; i++) {
      var n = saved.order[i];
      if (typeof n !== 'number' || n < 0 || n >= TRACKS.length || seen[n]) return false;
      seen[n] = true;
    }
    order = saved.order.slice();
    pos = Math.max(0, Math.min(order.length - 1, Number(saved.pos) || 0));
    pendingSeek = Math.max(0, Number(saved.t) || 0);
    return true;
  }

  function readPref() {
    try { return (localStorage.getItem(KEY) || '1') === '1'; } catch (e) { return true; }
  }
  function writePref() {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
  }

  // Every visit opens on the Loading Theme then the Siegelings Theme; the rest is
  // shuffled per visit, with the aggressive battle tracks held for the end.
  var LEAD_IDS = ['loading', 'main'];
  function isBattle(t) { return t.id.indexOf('battle') === 0 || /-gym$/.test(t.id); }

  function shuffled(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function shuffle() {
    var lead = [], calm = [], battle = [];
    LEAD_IDS.forEach(function (id) {
      for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) lead.push(i);
    });
    TRACKS.forEach(function (t, i) {
      if (lead.indexOf(i) >= 0) return;
      (isBattle(t) ? battle : calm).push(i);
    });
    order = lead.concat(shuffled(calm), shuffled(battle));
  }

  function current() { return ctx ? TRACKS[ctx.list[ctx.at]] : TRACKS[order[pos]]; }

  // Scenes name songs by id or by file, whichever the page already has.
  function trackIndex(ref) {
    for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === ref || TRACKS[i].src === ref) return i;
    return -1;
  }

  // The battle theme for an element: its gym song. Psychic fights to the
  // desert gym as Siege's Dreamfold does; an element with no gym song yet
  // (Undead, Neutral) gets the main battle theme.
  var GYM = { FIRE: 'fire-gym', WATER: 'water-gym', EARTH: 'earth-gym', WIND: 'wind-gym', ICE: 'ice-gym',
    ELECTRIC: 'electric-gym', SHADOW: 'cave-gym', METAL: 'metal-gym', POISON: 'poison-gym',
    LIGHT: 'light-gym', PSYCHIC: 'desert-gym' };
  function battleTrackFor(el) { return GYM[String(el || '').toUpperCase()] || 'battle'; }

  function setContext(id, refs, label) {
    if (!id) { clearContext(); return; }
    if ((ctx && ctx.id === id) || dismissed === id) return;
    var list = [];
    (refs || []).forEach(function (r) {
      var i = trackIndex(r);
      if (i >= 0 && list.indexOf(i) < 0) list.push(i);
    });
    if (!list.length) { clearContext(); return; }
    ensureAudio();
    if (!ctx) hubSeek = audio.currentTime ? Math.floor(audio.currentTime) : pendingSeek;
    dismissed = null;
    ctx = { id: id, list: list, at: 0, label: label || '' };
    pendingSeek = 0;
    load();
    if (on) play(); else paint();
  }

  function clearContext() {
    dismissed = null;
    if (!ctx) return;
    ctx = null;
    ensureAudio();
    pendingSeek = hubSeek;
    load();
    if (on) play(); else paint();
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = document.createElement('audio');
    audio.preload = 'none';
    audio.volume = VOLUME;
    audio.addEventListener('ended', function () { step(1); });
    audio.addEventListener('loadedmetadata', function () {
      if (!pendingSeek) return;
      var to = pendingSeek;
      pendingSeek = 0;
      // A position at the very end would just fire 'ended'; start that song over.
      if (isFinite(audio.duration) && to < audio.duration - 2) {
        try { audio.currentTime = to; } catch (e) { /* not seekable yet */ }
      }
    });
    audio.addEventListener('timeupdate', function () {
      paintProgress();
      var now = Date.now();
      if (now - lastSave > 3000) { lastSave = now; saveResume(); }
    });
    audio.addEventListener('play', paint);
    audio.addEventListener('durationchange', paintProgress);
    audio.addEventListener('pause', paint);
    // A missing or undecodable file skips on rather than leaving silence.
    audio.addEventListener('error', function () { if (on && started) step(1); });
    load();
    return audio;
  }

  function load() {
    audio.src = current().src;
  }

  function play() {
    if (!on || document.hidden) return;
    var p = ensureAudio().play();
    if (p && p.then) {
      p.then(function () { started = true; paint(); }, function () { /* waits for a gesture */ });
    } else {
      started = true;
    }
  }

  function step(delta) {
    ensureAudio();
    if (ctx) ctx.at = (ctx.at + delta + ctx.list.length) % ctx.list.length;
    else pos = (pos + delta + order.length) % order.length;
    pendingSeek = 0;
    load();
    saveResume();
    if (on) play(); else paint();
  }

  function setOn(next) {
    on = next;
    writePref();
    if (on) play(); else if (audio) audio.pause();
    paint();
  }

  function playing() { return Boolean(audio && !audio.paused); }

  var ICON = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M19 5l-10 7 10 7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M5 5l10 7-10 7z"/></svg>',
    play: '<svg class="hm-ic-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
    pause: '<svg class="hm-ic-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>'
  };
  var EQ = '<span class="hm-eq" aria-hidden="true"><i></i><i></i><i></i></span>';

  /* "Now playing" panel, opened from the top-bar note on any screen and in
     either orientation - the landscape stage has its own pill, but a portrait
     player had no way to change songs. Built on open into the current shell
     (a screen change re-renders the shell and so simply closes it).
     It wears the hub's glass sheet: it swells out of the note button, and the
     playing song's element dresses it - its land as the hero art, its notch
     as the song's mark, its colour as the tint - the same marks a card uses. */
  var EL_LAND = { FIRE: 'fire', EARTH: 'earth', WIND: 'wind', WATER: 'water', ICE: 'ice',
    ELECTRIC: 'electric', METAL: 'metal', PSYCHIC: 'psychic', SHADOW: 'shadow',
    POISON: 'poison', LIGHT: 'light', UNDEAD: 'undead', NEUTRAL: 'relic' };
  function landArt(el) { return '/img/lands/' + (EL_LAND[el] || 'relic') + '.webp'; }
  function notchArt(el) { return '/img/notches/notch-' + String(el || 'NEUTRAL').toLowerCase() + '.webp'; }
  function kind(t) { return isBattle(t) ? 'battle' : (t.id === 'main' || t.id === 'loading') ? 'theme' : 'biome'; }
  var KIND_LABEL = { biome: 'Biomes', theme: 'Themes', battle: 'Battle' };
  var KIND_ONE = { biome: 'Biome theme', theme: 'Siegelings soundtrack', battle: 'Battle track' };

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    sec = Math.floor(sec);
    return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
  }

  function panelMarkup() {
    var groups = ['biome', 'theme', 'battle'].map(function (k) {
      var rows = TRACKS.map(function (t, i) {
        if (kind(t) !== k) return '';
        return '<li><button type="button" data-music-pick="' + i + '" data-el="' + t.el + '">' +
          '<img class="hm-notch" src="' + notchArt(t.el) + '" alt="" decoding="async">' +
          '<span>' + t.title + '</span>' + EQ + '</button></li>';
      }).join('');
      return '<li class="hm-group"><h4>' + KIND_LABEL[k] + '</h4><ul>' + rows + '</ul></li>';
    }).join('');
    return '<div class="hm-panel" data-music-panel role="dialog" aria-label="Music">' +
      '<section class="hm-hero">' +
        '<div class="hm-hero-art" data-music-art aria-hidden="true"></div>' +
        '<div class="hm-head"><strong>Now Playing</strong>' +
          '<button type="button" class="hm-close" data-music-close aria-label="Close">\u00d7</button></div>' +
        '<div class="hm-now">' +
          '<img class="hm-now-notch" data-music-notch alt="" decoding="async">' +
          '<div class="hm-now-text"><span class="hm-now-title" data-music-title></span>' +
            '<span class="hm-now-sub" data-music-sub></span></div>' + EQ +
        '</div>' +
        '<div class="hm-progress">' +
          '<span data-music-elapsed>0:00</span>' +
          '<input type="range" min="0" max="1000" value="0" step="1" data-music-seek aria-label="Seek">' +
          '<span data-music-duration>0:00</span>' +
        '</div>' +
        '<div class="hm-controls">' +
          '<button type="button" data-music-prev aria-label="Previous song">' + ICON.prev + '</button>' +
          '<button type="button" class="hm-main" data-music-toggle aria-label="Pause music">' + ICON.play + ICON.pause + '</button>' +
          '<button type="button" data-music-next aria-label="Next song">' + ICON.next + '</button>' +
        '</div>' +
      '</section>' +
      '<ul class="hm-list">' + groups + '</ul>' +
    '</div>';
  }

  function panel() { return document.querySelector('[data-music-panel]'); }

  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function closePanel() {
    var p = panel();
    var opens = document.querySelectorAll('[data-music-open]');
    for (var i = 0; i < opens.length; i++) opens[i].setAttribute('aria-expanded', 'false');
    if (!p || p.classList.contains('is-closing')) return;
    if (reduceMotion.matches) { p.parentNode.removeChild(p); return; }
    // Shrinks back into the note button, then goes.
    p.classList.add('is-closing');
    setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 200);
  }

  function openPanel(btn) {
    var open = panel();
    if (open && !open.classList.contains('is-closing')) { closePanel(); return; }
    if (open) open.parentNode.removeChild(open);
    var host = (btn && btn.closest('.sg-app')) || document.body;
    var wrap = document.createElement('div');
    wrap.innerHTML = panelMarkup();
    var p = wrap.firstChild;
    host.appendChild(p);
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      // Swells out of the button that opened it, as the hub's sheets do.
      var box = p.getBoundingClientRect(), r = btn.getBoundingClientRect();
      p.style.setProperty('--hm-ox', Math.round(r.left + r.width / 2 - box.left) + 'px');
      p.style.setProperty('--hm-oy', Math.round(r.top + r.height / 2 - box.top) + 'px');
    }
    paint();
    // The playing song is in view without hunting for it.
    var cur = p.querySelector('[data-music-pick].on');
    var list = p.querySelector('.hm-list');
    if (cur && list) list.scrollTop = Math.max(0, cur.offsetTop - list.clientHeight / 2 + cur.offsetHeight / 2);
  }

  function pick(trackIndex) {
    var at = order.indexOf(trackIndex);
    if (at < 0) return;
    var wasScene = Boolean(ctx);
    if (ctx) { dismissed = ctx.id; ctx = null; }
    if (!on) { on = true; writePref(); }
    if (at === pos && playing() && !wasScene) return;
    ensureAudio();
    pos = at;
    pendingSeek = 0;
    load();
    saveResume();
    play();
    paint();
  }

  function paint() {
    var t = current();
    var isOn = on;
    var opens = document.querySelectorAll('[data-music-open]');
    for (var o = 0; o < opens.length; o++) {
      opens[o].classList.toggle('is-muted', !isOn);
      opens[o].classList.toggle('is-playing', playing());
      opens[o].setAttribute('data-el', t.el);
    }
    var picks = document.querySelectorAll('[data-music-pick]');
    for (var q = 0; q < picks.length; q++) {
      var cur = Number(picks[q].getAttribute('data-music-pick')) === (ctx ? ctx.list[ctx.at] : order[pos]);
      picks[q].classList.toggle('on', cur);
      picks[q].classList.toggle('is-playing', cur && playing());
      picks[q].setAttribute('aria-current', cur ? 'true' : 'false');
    }
    var p = panel();
    if (p) p.classList.toggle('is-playing', playing());
    var nodes = document.querySelectorAll('[data-music-toggle]');
    for (var i = 0; i < nodes.length; i++) {
      var b = nodes[i];
      b.classList.toggle('is-muted', !isOn);
      b.classList.toggle('is-playing', playing());
      b.setAttribute('aria-pressed', String(isOn));
      // The panel's main button is play/pause; the stage pill's bars are a mute.
      var verb = b.classList.contains('hm-main')
        ? (playing() ? 'Pause music' : 'Play music')
        : (isOn ? 'Mute music' : 'Play music');
      b.setAttribute('aria-label', verb);
      b.title = verb;
    }
    var titles = document.querySelectorAll('[data-music-title]');
    for (var k = 0; k < titles.length; k++) {
      titles[k].textContent = t.title;
      titles[k].setAttribute('data-el', t.el);
    }
    if (p) {
      p.setAttribute('data-el', t.el);
      var art = p.querySelector('[data-music-art]');
      var url = landArt(t.el);
      if (art && art.getAttribute('data-src') !== url) {
        art.setAttribute('data-src', url);
        // A fresh layer per song so the land crossfades instead of snapping.
        var layer = document.createElement('i');
        layer.style.backgroundImage = "url('" + url + "')";
        art.appendChild(layer);
        var old = art.querySelectorAll('i');
        for (var m = 0; m < old.length - 2; m++) art.removeChild(old[m]);
      }
      var notch = p.querySelector('[data-music-notch]');
      if (notch && notch.getAttribute('src') !== notchArt(t.el)) notch.setAttribute('src', notchArt(t.el));
      var sub = p.querySelector('[data-music-sub]');
      if (sub) sub.textContent = ctx && ctx.label ? ctx.label : KIND_ONE[kind(t)];
    }
    paintProgress();
  }

  var seeking = false;
  function paintProgress() {
    var p = panel();
    if (!p) return;
    var d = audio && isFinite(audio.duration) ? audio.duration : 0;
    var c = audio ? audio.currentTime || 0 : 0;
    var el = p.querySelector('[data-music-elapsed]');
    var du = p.querySelector('[data-music-duration]');
    var seek = p.querySelector('[data-music-seek]');
    if (el) el.textContent = fmt(c);
    if (du) du.textContent = d ? fmt(d) : '--:--';
    if (seek && !seeking) {
      seek.value = d ? String(Math.round(c / d * 1000)) : '0';
      seek.disabled = !d;
    }
    if (seek) seek.style.setProperty('--hm-fill', (seek.value / 10) + '%');
  }

  var CONTROLS = '[data-music-toggle],[data-music-next],[data-music-prev],[data-music-pick],[data-music-open],[data-music-close]';

  function onClick(e) {
    var el = e.target && e.target.closest && e.target.closest(CONTROLS);
    if (!el) {
      // A tap anywhere else closes the panel, like the notification tray.
      if (panel() && !(e.target.closest && e.target.closest('[data-music-panel]'))) closePanel();
      return;
    }
    e.preventDefault();
    if (el.hasAttribute('data-music-open')) { openPanel(el); return; }
    if (el.hasAttribute('data-music-close')) { closePanel(); return; }
    if (el.hasAttribute('data-music-pick')) { pick(Number(el.getAttribute('data-music-pick'))); return; }
    if (el.hasAttribute('data-music-toggle')) {
      // Still silent because autoplay was refused: the control reads "on", so
      // the player's tap means "start", not "mute".
      if (on && !playing()) { play(); return; }
      setOn(!on);
      return;
    }
    // Skipping a track is asking to hear one, so it also unmutes.
    if (!on) { on = true; writePref(); }
    step(el.hasAttribute('data-music-next') ? 1 : -1);
  }

  function armGestureStart() {
    var events = ['pointerdown', 'touchend', 'keydown'];
    function starter(e) {
      // A tap on a music control handles itself; starting here too would
      // immediately undo a mute.
      // Opening the panel is not a playback choice, so it still counts as the
      // first gesture.
      if (e && e.target && e.target.closest &&
          e.target.closest('[data-music-toggle],[data-music-next],[data-music-prev],[data-music-pick]')) return;
      if (started) { off(); return; }
      play();
      if (started || !on) off();
    }
    function off() { events.forEach(function (n) { document.removeEventListener(n, starter, true); }); }
    events.forEach(function (n) { document.addEventListener(n, starter, true); });
  }

  var ready = false;

  function init() {
    if (ready) return;
    ready = true;
    ensureAudio();
    document.addEventListener('click', onClick);
    // The seek bar: dragging previews the time, letting go moves the song.
    document.addEventListener('input', function (e) {
      if (!e.target.matches || !e.target.matches('[data-music-seek]')) return;
      seeking = true;
      var d = audio && isFinite(audio.duration) ? audio.duration : 0;
      var el = panel() && panel().querySelector('[data-music-elapsed]');
      if (el && d) el.textContent = fmt(e.target.value / 1000 * d);
      e.target.style.setProperty('--hm-fill', (e.target.value / 10) + '%');
    });
    document.addEventListener('change', function (e) {
      if (!e.target.matches || !e.target.matches('[data-music-seek]')) return;
      seeking = false;
      var d = audio && isFinite(audio.duration) ? audio.duration : 0;
      if (d) { try { audio.currentTime = e.target.value / 1000 * d; } catch (err) { /* not seekable */ } }
      paintProgress();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
    // pagehide is the reliable "leaving" signal on iOS, where unload never fires.
    window.addEventListener('pagehide', saveResume);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { saveResume(); if (audio) audio.pause(); }
      else if (on && started) play();
    });
    if (on) { play(); armGestureStart(); }
    paint();
  }

  // Settled at load, not in init(): the shell paints its controls (sync) before
  // init() runs, and they should already show the right state and song.
  on = readPref();
  if (!restoreResume()) shuffle();

  window.SiegelingsHubMusic = {
    init: init,
    sync: paint,
    setContext: setContext,
    clearContext: clearContext,
    battleTrackFor: battleTrackFor,
    setOn: setOn,
    tracks: function () { return TRACKS.slice(); },
    element: function () { return audio; },
    state: function () {
      return { on: on, playing: playing(), track: current().id, title: current().title, started: started,
        scene: ctx ? ctx.id : null };
    }
  };

  // Pages other than the hub ask for the player with data-autoinit on the tag.
  var self = document.currentScript;
  if (self && self.hasAttribute('data-autoinit')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
