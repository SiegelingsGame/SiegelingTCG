/* Hub soundtrack: the biome themes, shuffled, behind one on/off preference.

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
    { id: 'jungle',   title: 'Jungle',         el: 'POISON' }
  ].map(function (t) { t.src = '/audio/biomes/' + t.id + '.mp3?v=1'; return t; });

  var audio = null;
  var order = [];
  var pos = 0;
  var on = true;
  var started = false;   // true once a gesture has let play() through

  function readPref() {
    try { return (localStorage.getItem(KEY) || '1') === '1'; } catch (e) { return true; }
  }
  function writePref() {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
  }

  // A fresh shuffle per visit, so the hub does not open on the same song daily.
  function shuffle() {
    order = TRACKS.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
  }

  function current() { return TRACKS[order[pos]]; }

  function ensureAudio() {
    if (audio) return audio;
    audio = document.createElement('audio');
    audio.preload = 'none';
    audio.volume = VOLUME;
    audio.addEventListener('ended', function () { step(1); });
    audio.addEventListener('play', paint);
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
    pos = (pos + delta + order.length) % order.length;
    load();
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
     (a screen change re-renders the shell and so simply closes it). */
  function panelMarkup() {
    return '<div class="hm-panel" data-music-panel role="dialog" aria-label="Music">' +
      '<div class="hm-head"><strong>Now Playing</strong>' +
        '<button type="button" class="hm-close" data-music-close aria-label="Close">\u00d7</button></div>' +
      '<div class="hm-now">' + EQ + '<span class="hm-now-title" data-music-title></span></div>' +
      '<div class="hm-controls">' +
        '<button type="button" data-music-prev aria-label="Previous song">' + ICON.prev + '</button>' +
        '<button type="button" class="hm-main" data-music-toggle aria-label="Pause music">' + ICON.play + ICON.pause + '</button>' +
        '<button type="button" data-music-next aria-label="Next song">' + ICON.next + '</button>' +
      '</div>' +
      '<ul class="hm-list">' + TRACKS.map(function (t, i) {
        return '<li><button type="button" data-music-pick="' + i + '" data-el="' + t.el + '">' +
          '<i class="hm-pip"></i><span>' + t.title + '</span>' + EQ + '</button></li>';
      }).join('') + '</ul>' +
    '</div>';
  }

  function panel() { return document.querySelector('[data-music-panel]'); }

  function closePanel() {
    var p = panel();
    if (p) p.parentNode.removeChild(p);
    var opens = document.querySelectorAll('[data-music-open]');
    for (var i = 0; i < opens.length; i++) opens[i].setAttribute('aria-expanded', 'false');
  }

  function openPanel(btn) {
    if (panel()) { closePanel(); return; }
    var host = (btn && btn.closest('.sg-app')) || document.body;
    var wrap = document.createElement('div');
    wrap.innerHTML = panelMarkup();
    host.appendChild(wrap.firstChild);
    if (btn) btn.setAttribute('aria-expanded', 'true');
    paint();
  }

  function pick(trackIndex) {
    var at = order.indexOf(trackIndex);
    if (at < 0) return;
    if (!on) { on = true; writePref(); }
    if (at === pos && playing()) return;
    ensureAudio();
    pos = at;
    load();
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
    }
    var picks = document.querySelectorAll('[data-music-pick]');
    for (var q = 0; q < picks.length; q++) {
      var cur = Number(picks[q].getAttribute('data-music-pick')) === order[pos];
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
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (audio) audio.pause(); }
      else if (on && started) play();
    });
    if (on) { play(); armGestureStart(); }
    paint();
  }

  // Settled at load, not in init(): the shell paints its controls (sync) before
  // init() runs, and they should already show the right state and song.
  on = readPref();
  shuffle();

  window.SiegelingsHubMusic = {
    init: init,
    sync: paint,
    tracks: function () { return TRACKS.slice(); },
    element: function () { return audio; },
    state: function () {
      return { on: on, playing: playing(), track: current().id, title: current().title, started: started };
    }
  };
})();
