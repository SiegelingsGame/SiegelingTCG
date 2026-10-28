(function () {
  'use strict';
  // One persistent overlay; the hub retains ownership of routing and live state.
  var outline = 'M200 12 C155 65 75 72 17 91 C17 260 17 390 45 428 C70 467 161 484 200 522 C239 484 330 467 355 428 C383 390 383 260 383 91 C325 72 245 65 200 12Z';
  var icons = {
    play: '<path d="m5 3 14 14m-1-5 4 4-5 5-4-4M19 3 5 17m1-5-4 4 5 5 4-4"/>',
    collection: '<path d="m3 5 13-2 3 17-13 2zM8 5h13v17H8"/><path d="m14 9 3 4-3 4-3-4z"/>',
    decks: '<path d="M3 3h14v17H3zM7 6h14v17H7zM11 10h6m-6 4h6m-6 4h4"/>',
    shop: '<path d="M3 9h18v12H3zM3 9c0-9 18-9 18 0M3 13h18M10 11h4v5h-4z"/>',
    profile: '<circle cx="12" cy="7" r="4"/><path d="M3 22v-4c0-8 18-8 18 0v4z"/>',
    settings: '<path d="m9 3 1-2h4l1 2 3 2 3 1v4l-2 2 2 3v4l-3 1-3 2h-5l-2-2-4-1v-4l2-3-2-2V6l3-1z"/><circle cx="12" cy="12" r="4"/>',
    home: '<path d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10"/>',
    messages: '<path d="M3 5h18v12H8l-5 4z"/><path d="M7 9h10M7 13h6"/>'
  };
  // Home and Messages ride the shield's top corners, mirroring the close button.
  function corner(id, label) {
    return '<button type="button" class="sn-corner sn-corner-' + id + '" data-destination="' + id + '" aria-label="' + label + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + icons[id] + '</svg></button>';
  }
  function gem(cls) { return '<span class="sn-gem ' + cls + '" aria-hidden="true"></span>'; }
  function mount(host, navigate, current) {
    var existing = host.querySelector('.sn-root');
    if (existing) return existing.shieldNavigation;
    var root = document.createElement('div');
    root.className = 'sn-root';
    root.dataset.state = 'closed';
    root.innerHTML = '<div class="sn-overlay" hidden>' +
      '<div class="sn-scrim" aria-hidden="true"></div>' +
      '<section class="sn-shield" role="dialog" aria-modal="true" aria-label="Siegelings navigation" tabindex="-1">' +
        '<svg class="sn-frame" viewBox="0 0 400 540" preserveAspectRatio="none" aria-hidden="true">' +
          '<defs><linearGradient id="sn-gold" x2=".8" y2="1"><stop stop-color="#fff1bd"/><stop offset=".25" stop-color="#a77435"/><stop offset=".5" stop-color="#ffe9a7"/><stop offset=".75" stop-color="#936129"/><stop offset="1" stop-color="#e6bc70"/></linearGradient><linearGradient id="sn-navy" x2=".5" y2="1"><stop stop-color="#142b43"/><stop offset="1" stop-color="#050d1b"/></linearGradient></defs>' +
          '<path class="sn-fill" d="' + outline + '" fill="url(#sn-navy)"/>' +
          '<path class="sn-metal" d="' + outline + '" pathLength="1" fill="none" stroke="url(#sn-gold)" stroke-width="9"/>' +
          '<path d="' + outline + '" fill="none" stroke="#f6daa0" stroke-width="1" transform="translate(12 17) scale(.94 .935)" opacity=".45"/>' +
          '<path class="sn-energy" d="' + outline + '" pathLength="1" fill="none" stroke="#69caff" stroke-width="3"/>' +
          '<path class="sn-sweep" d="' + outline + '" pathLength="1" fill="none" stroke="#fff3c3" stroke-width="5" stroke-dasharray=".07 .93"/>' +
        '</svg>' + gem('sn-crown') + gem('sn-tip') +
        '<div class="sn-content"><div class="sn-brand"><img src="/img/siegelings-icon-256.webp" alt=""><strong>Siegelings</strong><small>YOUR NEXT LEGEND AWAITS</small></div>' +
        '<nav class="sn-options" aria-label="Main navigation">' +
          [['play','Play',0],['collection','Collection',1],['decks','Decks',1],['shop','Shop',2],['profile','Profile',2],['settings','Settings',3]].map(function (item) {
            return '<button type="button" class="sn-option sn-' + item[0] + '" data-destination="' + item[0] + '" data-group="' + item[2] + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + icons[item[0]] + '</svg><span>' + item[1] + '</span><b aria-hidden="true">›</b><i class="sn-option-light" aria-hidden="true"></i></button>';
          }).join('') + '</nav><nav class="sn-utilities" aria-label="More destinations"><button data-destination="social">Social</button><button data-destination="help">Help</button></nav></div>' +
        corner('home', 'Home') + corner('messages', 'Messages') +
        '<button class="sn-close" type="button" aria-label="Close navigation">×</button>' +
      '</section></div>' +
      '<button class="sn-fab" type="button" aria-label="Summon navigation" aria-haspopup="dialog" aria-expanded="false"><span class="sn-corona" aria-hidden="true"><i class="sn-corona-glow"></i><i class="sn-corona-rays"></i><i class="sn-corona-rays sn-corona-rays-b"></i><i class="sn-corona-rim"></i></span><span class="sn-pulse"></span><span class="sn-emblem"><img src="/img/siegelings-icon-256.webp" alt="">' + gem('sn-core') + '</span></button>';
    host.appendChild(root);
    host.classList.add('has-shield-navigation');
    var overlay = root.querySelector('.sn-overlay'), shield = root.querySelector('.sn-shield');
    var fab = root.querySelector('.sn-fab'), scrim = root.querySelector('.sn-scrim');
    var options = Array.from(root.querySelectorAll('.sn-option'));
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var animations = [], generation = 0, desired = false, pending = null, restoreFocus = null, blocked = [];
    var collapsed = '';
    function lock() {
      if (blocked.length) return;
      Array.from(host.children).forEach(function (el) {
        if (el !== root && !el.inert) { blocked.push(el); el.inert = true; }
      });
    }
    function unlock() { blocked.forEach(function (el) { el.inert = false; }); blocked = []; }
    function cancel() { generation++; animations.forEach(function (a) { a.cancel(); }); animations = []; }
    function animate(el, frames, duration, delay) {
      var a = el.animate(frames, { duration: duration, delay: delay || 0, fill: 'both', easing: 'cubic-bezier(.2,.7,.2,1)' });
      animations.push(a); return a;
    }
    function measure() {
      // Geometry is measured once per transition, never on an animation frame.
      var f = fab.getBoundingClientRect(), s = shield.getBoundingClientRect();
      collapsed = 'translate(' + (f.left + f.width / 2 - s.left - s.width / 2) + 'px,' +
        (f.top + f.height / 2 - s.top - s.height / 2) + 'px) scale(.12) rotateX(24deg) rotateY(-9deg)';
    }
    function finishClosed(restore) {
      cancel(); overlay.hidden = true; root.dataset.state = 'closed';
      root.classList.remove('sn-selecting');
      options.forEach(function (b) { b.classList.remove('sn-selected'); });
      unlock();
      if (restore && restoreFocus && restoreFocus.isConnected) restoreFocus.focus({ preventScroll: true });
    }
    function transition(open) {
      if (desired === open && root.dataset.state !== 'closed') return;
      var interrupted = root.dataset.state === 'opening' || root.dataset.state === 'closing';
      var snapshots = new Map();
      if (interrupted) animations.forEach(function (a) {
        var el = a.effect.target, style = getComputedStyle(el);
        snapshots.set(el, { transform: style.transform, opacity: style.opacity, strokeDashoffset: style.strokeDashoffset });
      });
      cancel(); desired = open;
      var token = generation;
      fab.setAttribute('aria-expanded', String(open));
      fab.setAttribute('aria-label', open ? 'Recall navigation' : 'Summon navigation');
      if (open) {
        pending = null;
        if (overlay.hidden) { restoreFocus = document.activeElement; overlay.hidden = false; measure(); }
        lock(); root.dataset.state = 'opening'; shield.inert = false;
        shield.focus({ preventScroll: true });
      } else {
        root.dataset.state = 'closing'; shield.inert = true; fab.focus({ preventScroll: true });
      }
      function run(el, frames, duration, delay) {
        if (snapshots.has(el)) frames[0] = Object.assign({}, frames[0], snapshots.get(el));
        return animate(el, frames, duration, delay);
      }
      var duration = motion.matches ? (open ? 120 : 100) : (open ? 750 : 320);
      var done;
      if (motion.matches) {
        done = run(overlay, [{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }], duration);
      } else if (open) {
        run(scrim, [{opacity:0},{opacity:1}], 350);
        done = run(shield, [
          {transform:collapsed,opacity:0,offset:0},
          {transform:interrupted ? snapshots.get(shield).transform : collapsed,opacity:interrupted ? snapshots.get(shield).opacity : 0,offset:.12},
          {transform:interrupted ? snapshots.get(shield).transform : collapsed.replace('scale(.12)', 'scale(.18)'),opacity:1,offset:.16},
          {transform:'translateY(-6px) scale(1.035) rotateX(-2deg)',opacity:1,offset:.47},
          {transform:'translateY(2px) scale(.995)',opacity:1,offset:.60},
          {transform:'none',opacity:1,offset:.67}, {transform:'none',opacity:1}
        ], duration);
        run(root.querySelector('.sn-metal'), [{strokeDashoffset:1},{strokeDashoffset:0}], 230, 120);
        run(root.querySelector('.sn-energy'), [{strokeDashoffset:1,opacity:0},{strokeDashoffset:.45,opacity:1},{strokeDashoffset:0,opacity:0}], 310, 100);
        run(root.querySelector('.sn-fill'), [{opacity:0},{opacity:1}], 190, 160);
        run(root.querySelector('.sn-sweep'), [{strokeDashoffset:1,opacity:0},{strokeDashoffset:.7,opacity:1},{strokeDashoffset:0,opacity:0}], 240, 350);
        run(root.querySelector('.sn-brand'), [{opacity:0,transform:'translateY(8px) scale(.96)'},{opacity:1,transform:'none'}], 180, 370);
        run(root.querySelector('.sn-crown'), [{opacity:.4},{opacity:1,transform:'rotate(45deg) scale(1.25)'},{opacity:1,transform:'rotate(45deg)'}], 160, 350);
        run(root.querySelector('.sn-emblem'), [{transform:'scale(1)'},{transform:'scale(.9)',offset:.1},{transform:'translateY(-13px) scale(1.06)',offset:.4},{transform:'none'}], 400);
        run(root.querySelector('.sn-core'), [{opacity:.3},{opacity:1},{opacity:.4}], 420);
        run(root.querySelector('.sn-pulse'), [{opacity:0,transform:'scale(.7)'},{opacity:.8,offset:.2},{opacity:0,transform:'scale(2.2)'}], 400);
        options.forEach(function (b) {
          var delay = 450 + Number(b.dataset.group) * 55;
          run(b, [{opacity:0,transform:'translateY(10px) scale(.96)'},{opacity:1,transform:'none'}], 135, delay);
          run(b.querySelector('.sn-option-light'), [{opacity:0},{opacity:b.dataset.group === '0' ? .8 : .45},{opacity:0}], 135, delay);
        });
        run(root.querySelector('.sn-utilities'), [{opacity:0},{opacity:1}], 100, 640);
      } else {
        run(scrim, [{opacity:1},{opacity:0}], duration);
        done = run(shield, [{transform:'none',opacity:1,offset:0},{transform:'scale(1.015)',opacity:1,offset:.25},{transform:collapsed,opacity:0}], duration);
        run(root.querySelector('.sn-brand'), [{opacity:1},{opacity:0}], 100);
        run(root.querySelector('.sn-crown'), [{opacity:1},{opacity:.2}], 100);
        run(root.querySelector('.sn-sweep'), [{opacity:0},{opacity:1},{opacity:0}], 150);
        options.forEach(function (b) {
          run(b, [{opacity:1,transform:'none'},{opacity:0,transform:'translateY(6px) scale(.96)'}], 85, (3 - Number(b.dataset.group)) * 22);
        });
        run(root.querySelector('.sn-utilities'), [{opacity:1},{opacity:0}], 65);
        run(root.querySelector('.sn-emblem'), [{transform:'scale(.9)',opacity:.5},{transform:'scale(1.07)',opacity:1},{transform:'none',opacity:1}], 170, 150);
      }
      done.finished.then(function () {
        if (token !== generation) return;
        if (open) {
          cancel(); root.dataset.state = 'open';
          // After the hub has swapped screens beneath it, Chromium can keep
          // hit-testing the Social/Help row against stale data once the
          // entrance animations are cancelled, so taps land on .sn-content.
          // One re-layout of that row brings its hit-testing up to date.
          var utilities = root.querySelector('.sn-utilities');
          utilities.style.display = 'none'; void utilities.offsetHeight; utilities.style.display = '';
          if (document.activeElement === shield) options[0].focus({ preventScroll: true });
        } else {
          var destination = pending; pending = null;
          finishClosed(!destination);
          if (destination && destination !== current()) navigate(destination);
        }
      }).catch(function () { /* A new gesture owns completion after cancellation. */ });
    }
    fab.addEventListener('click', function () { if (!pending) transition(!desired); });
    root.querySelector('.sn-close').addEventListener('click', function () { transition(false); });
    scrim.addEventListener('click', function () { if (!pending) transition(false); });
    root.querySelectorAll('[data-destination]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (pending || !desired) return;
        pending = button.dataset.destination;
        root.classList.add('sn-selecting'); button.classList.add('sn-selected');
        transition(false);
      });
    });
    root.addEventListener('keydown', function (e) {
      if (overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!pending) transition(false); }
      if (e.key === 'Tab') {
        var focusable = Array.from(root.querySelectorAll('button')).filter(function (b) { return !b.closest('[inert]'); });
        var i = focusable.indexOf(document.activeElement);
        e.preventDefault(); focusable[(i + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
      }
    });
    function reset() { pending = null; desired = false; fab.setAttribute('aria-expanded','false'); fab.setAttribute('aria-label','Summon navigation'); finishClosed(false); }
    // A changed viewport invalidates the FAB origin. Settle safely instead of
    // flying toward stale coordinates, including on an iOS toolbar resize.
    window.addEventListener('resize', function () { if (!overlay.hidden) reset(); });
    motion.addEventListener('change', reset);
    // Launch screens share their page with a battle or a map, where the FAB has
    // no place; hiding it also settles an open shield.
    function setHidden(hidden) {
      hidden = !!hidden;
      if (hidden === root.hidden) return;
      if (hidden) reset();
      root.hidden = hidden;
    }
    root.shieldNavigation = { element: root, reset: reset, setHidden: setHidden };
    return root.shieldNavigation;
  }
  // The play-mode launch screens (Arena, Siege, Gauntlet, Dominion) are their
  // own pages, so a destination there is a hub URL rather than a hub screen.
  var HUB_PATHS = {
    home: '/home', play: '/home?screen=play', collection: '/cards', decks: '/decks',
    shop: '/shop', profile: '/profile', settings: '/settings', social: '/social',
    messages: '/social', help: '/help'
  };
  function mountLinks() {
    if (navigator.standalone) document.documentElement.classList.add('sg-standalone');
    return mount(document.body, function (destination) {
      window.location.href = HUB_PATHS[destination] || '/home';
    }, function () { return null; });
  }
  window.SiegelingsShieldNavigation = { mount: mount, mountLinks: mountLinks };
})();
