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

  function paint() {
    var t = current();
    var isOn = on;
    var nodes = document.querySelectorAll('[data-music-toggle]');
    for (var i = 0; i < nodes.length; i++) {
      var b = nodes[i];
      b.classList.toggle('is-muted', !isOn);
      b.classList.toggle('is-playing', playing());
      b.setAttribute('aria-pressed', String(isOn));
      b.setAttribute('aria-label', isOn ? 'Mute music' : 'Play music');
      b.title = isOn ? 'Mute music' : 'Play music';
    }
    var titles = document.querySelectorAll('[data-music-title]');
    for (var k = 0; k < titles.length; k++) {
      titles[k].textContent = t.title;
      titles[k].setAttribute('data-el', t.el);
    }
  }

  function onClick(e) {
    var el = e.target && e.target.closest && e.target.closest('[data-music-toggle],[data-music-next],[data-music-prev]');
    if (!el) return;
    e.preventDefault();
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
      if (e && e.target && e.target.closest && e.target.closest('[data-music-toggle],[data-music-next],[data-music-prev]')) return;
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
