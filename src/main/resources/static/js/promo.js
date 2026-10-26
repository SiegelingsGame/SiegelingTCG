/* Siegelings promo — seekable timeline + spark canvas (extended w/ gameplay).
   Live: plays in real time. Record (?record=1): awaits __promoSeek(ms). */
(function () {
    'use strict';

    var DURATION_MS = 36000;
    var params = new URLSearchParams(window.location.search);
    var recordMode = params.get('record') === '1';
    var autoplay = !recordMode || params.get('autoplay') === '1';

    document.body.dataset.mode = recordMode ? 'record' : 'live';

    /* Beat schedule: [startMs, beatName, flash?]
       Brand → Battle once → distinct Arena board + attack → Siege → Dominion → end.
       Do not remount the clash plate or re-smash "Battle." — that reads as a stutter. */
    var BEATS = [
        [0, 'void', false],
        [600, 'presents', false],
        [1800, 'art0', true],
        [3600, 'collect', true],
        [3800, 'art1', false],
        [5200, 'command', true],
        [5400, 'art2', false],
        [6800, 'conquer', true],
        [7000, 'art3', false],
        [8400, 'battle', true],
        [8600, 'game0', false],
        [11200, 'game1', true],
        [14200, 'game2', true],
        [17200, 'game3', true],
        [21000, 'game4', true],
        [24800, 'game5', true],
        [28600, 'game6', false],
        [31800, 'end', true]
    ];

    var ART_BEATS = {
        art0: '0',
        collect: '1',
        art1: '1',
        command: '2',
        art2: '2',
        conquer: '3',
        art3: '3',
        battle: 'g0',
        game0: 'g0',
        game1: 'g1',
        game2: 'g2',
        game3: 'g3',
        game4: 'g4',
        game5: 'g5',
        game6: 'g5',
        end: '5'
    };

    var canvas = document.getElementById('promoSparks');
    var ctx = canvas && canvas.getContext('2d');
    var sparks = [];
    var raf = 0;
    var startTs = 0;
    var playing = false;
    var lastBeat = '';
    var lastFlashAt = -9999;
    var seekMs = 0;

    function resize() {
        if (!canvas) return;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnSparks(count, hot) {
        var w = window.innerWidth;
        var h = window.innerHeight;
        var colors = ['#FF4500', '#00CFFF', '#6EE7B7', '#A855F7', '#F5A623', '#FFE59A'];
        for (var i = 0; i < count; i++) {
            sparks.push({
                x: Math.random() * w,
                y: h * (0.15 + Math.random() * 0.7),
                vx: (Math.random() - 0.5) * (hot ? 4.5 : 1.2),
                vy: (Math.random() - 0.5) * (hot ? 3.2 : 0.8) - (hot ? 0.6 : 0.1),
                life: 0.4 + Math.random() * 0.9,
                age: 0,
                r: hot ? 1.5 + Math.random() * 2.8 : 0.8 + Math.random() * 1.6,
                color: colors[(Math.random() * colors.length) | 0],
                born: seekMs
            });
        }
    }

    function drawSparks(dt) {
        if (!ctx) return;
        var w = window.innerWidth;
        var h = window.innerHeight;
        ctx.clearRect(0, 0, w, h);
        for (var i = sparks.length - 1; i >= 0; i--) {
            var s = sparks[i];
            s.age += dt;
            s.x += s.vx;
            s.y += s.vy;
            var t = s.age / s.life;
            if (t >= 1) {
                sparks.splice(i, 1);
                continue;
            }
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r * (1 - t * 0.35), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function beatAt(ms) {
        var beat = BEATS[0];
        for (var i = 0; i < BEATS.length; i++) {
            if (ms >= BEATS[i][0]) beat = BEATS[i];
            else break;
        }
        return beat;
    }

    function localProgress(ms, beatStart) {
        var next = DURATION_MS;
        for (var i = 0; i < BEATS.length; i++) {
            if (BEATS[i][0] > beatStart) {
                next = BEATS[i][0];
                break;
            }
        }
        var span = Math.max(1, next - beatStart);
        return Math.min(1, Math.max(0, (ms - beatStart) / span));
    }

    function applyKenBurns(artId, p, smash) {
        var plates = document.querySelectorAll('.art-plate');
        for (var i = 0; i < plates.length; i++) {
            var plate = plates[i];
            var id = plate.getAttribute('data-art');
            if (id === artId) {
                var isGameplay = String(artId).charAt(0) === 'g';
                plate.style.opacity = artId === '5' ? '0.35' : '1';
                // Phone plates are already composed into 16:9 — keep Ken Burns gentle
                // so the mobile HUD isn't cropped off the bezel.
                var scale = smash
                    ? (isGameplay ? (1.06 - p * 0.04) : (1.22 - p * 0.18))
                    : (isGameplay ? (1.03 - p * 0.02) : (1.16 - p * 0.12));
                var x = smash ? 0 : (id === '2' ? (-3 + p * 5) : 0);
                var y = smash ? 0 : (id === '0' ? (2 - p * 2) : 0);
                plate.style.transform = 'scale(' + scale + ') translate(' + x + '%, ' + y + '%)';
                plate.style.filter = artId === '5'
                    ? 'saturate(0.85) brightness(0.55) contrast(1.1)'
                    : (isGameplay
                        ? 'saturate(1.04) contrast(1.06) brightness(1.01)'
                        : 'saturate(1.15) contrast(1.05)');
            } else {
                plate.style.opacity = '0';
            }
        }
    }

    function fade(el, visible, blur) {
        if (!el) return;
        el.style.opacity = String(visible);
        el.style.filter = blur ? 'blur(' + blur + 'px)' : '';
        if (el.classList.contains('verb') || el.classList.contains('presents') || el.classList.contains('whisper')) {
            el.style.transform = 'translate(-50%, -50%) scale(' + (visible > 0.01 ? (1 + (1 - visible) * 0.08) : 1.2) + ')';
        }
    }

    function applyCopy(name, p) {
        var presents = document.querySelector('.presents');
        var whisper = document.querySelector('.whisper:not(.whisper-game):not(.whisper-mode)');
        var whisperGame = document.querySelector('.whisper-game');
        var whisperSiege = document.querySelector('.whisper-siege');
        var whisperDominion = document.querySelector('.whisper-dominion');
        var verbs = document.querySelectorAll('.verb');
        var endCard = document.querySelector('.end-card');
        var ring = document.querySelector('.energy-ring');
        var flash = document.querySelector('.flash');
        var i;

        fade(presents, 0);
        fade(whisper, 0);
        fade(whisperGame, 0);
        fade(whisperSiege, 0);
        fade(whisperDominion, 0);
        for (i = 0; i < verbs.length; i++) fade(verbs[i], 0);
        if (endCard) {
            endCard.style.opacity = '0';
            endCard.style.transform = '';
        }
        if (ring) {
            ring.style.opacity = '0';
            ring.style.transform = 'translate(-50%, -50%) scale(0.4)';
        }
        if (flash) flash.style.opacity = '0';

        if (name === 'void' || name === 'presents') {
            if (ring) {
                var rp = name === 'void' ? Math.min(1, seekMs / 600) : 1;
                ring.style.opacity = String(0.35 + rp * 0.65);
                ring.style.transform = 'translate(-50%, -50%) scale(' + (0.35 + rp * 0.65) + ') rotate(' + (rp * 8) + 'deg)';
            }
        }
        if (name === 'presents') {
            var pp = p < 0.7 ? Math.min(1, p / 0.25) : Math.max(0, 1 - (p - 0.7) / 0.3);
            fade(presents, pp, (1 - pp) * 4);
            if (presents) presents.style.letterSpacing = (0.42 + (1 - pp) * 0.12) + 'em';
        }
        if (name === 'art0') {
            var wp = p < 0.75 ? Math.min(1, p / 0.2) : Math.max(0, 1 - (p - 0.75) / 0.25);
            fade(whisper, wp, (1 - wp) * 3);
        }

        function smashVerb(selector, active) {
            var verb = document.querySelector(selector);
            var vp = active ? Math.min(1, p / 0.35) : Math.max(0, 1 - p / 0.85);
            fade(verb, vp);
            if (verb) verb.style.transform = 'translate(-50%, -50%) scale(' + (1.35 - vp * 0.35) + ')';
        }

        if (name === 'collect' || name === 'art1') smashVerb('.verb[data-verb="collect"]', name === 'collect');
        if (name === 'command' || name === 'art2') {
            smashVerb('.verb[data-verb="command"]', name === 'command');
            if (ring && name === 'command') {
                ring.style.opacity = String(0.9 - p * 0.4);
                ring.style.transform = 'translate(-50%, -50%) scale(' + (0.7 + p * 0.55) + ') rotate(' + (p * 25) + 'deg)';
            }
        }
        if (name === 'conquer' || name === 'art3') smashVerb('.verb[data-verb="conquer"]', name === 'conquer');

        /* "Battle." smash only on the battle beat — later Arena cuts keep the plate, not the verb. */
        if (name === 'battle') {
            smashVerb('.verb[data-verb="battle"]', true);
        }
        if (name === 'game0' || name === 'game1' || name === 'game2') {
            var gp = p < 0.18 ? p / 0.18 : (p > 0.78 ? Math.max(0, 1 - (p - 0.78) / 0.22) : 1);
            fade(whisperGame, gp * 0.95);
        }

        if (name === 'game3' || name === 'game4') {
            var sp = p < 0.18 ? p / 0.18 : (p > 0.78 ? Math.max(0, 1 - (p - 0.78) / 0.22) : 1);
            fade(whisperSiege, sp * 0.95);
        }

        if (name === 'game5' || name === 'game6') {
            var dp = p < 0.18 ? p / 0.18 : (p > 0.78 ? Math.max(0, 1 - (p - 0.78) / 0.22) : 1);
            fade(whisperDominion, dp * 0.95);
        }

        if (name === 'end' && endCard) {
            endCard.style.opacity = String(Math.min(1, p / 0.2 + 0.15));
            endCard.style.transform = 'translateY(' + ((1 - Math.min(1, p / 0.25)) * 18) + 'px)';
        }

        if (flash && seekMs - lastFlashAt < 200) {
            flash.style.opacity = String(Math.max(0, 0.85 - (seekMs - lastFlashAt) / 200));
        }
    }

    function renderAt(ms) {
        seekMs = Math.max(0, Math.min(DURATION_MS, ms));
        var beat = beatAt(seekMs);
        var name = beat[1];
        var flash = beat[2];
        var p = localProgress(seekMs, beat[0]);

        document.body.dataset.beat = name;
        if (name !== lastBeat) {
            if (flash) {
                lastFlashAt = beat[0];
                spawnSparks(28, true);
            }
            lastBeat = name;
        }

        var artId = ART_BEATS[name];
        if (artId != null) {
            var smash = name === 'art1' || name === 'collect' || name === 'battle'
                || name === 'game1' || name === 'game2'
                || name === 'game3' || name === 'game4' || name === 'game5';
            applyKenBurns(artId, p, smash);
        } else {
            applyKenBurns(null, 0, false);
            var plates = document.querySelectorAll('.art-plate');
            for (var i = 0; i < plates.length; i++) plates[i].style.opacity = '0';
        }

        applyCopy(name, p);

        if (seekMs < 2500 && seekMs % 90 < 20) spawnSparks(1, false);
        else if (seekMs < 30000 && seekMs % 160 < 20) spawnSparks(2, false);

        drawSparks(recordMode ? (1 / 24) : 0.016);

        if (seekMs >= DURATION_MS) document.body.dataset.complete = '1';
        else document.body.removeAttribute('data-complete');
    }

    function tick(now) {
        if (!playing) return;
        var elapsed = now - startTs;
        renderAt(elapsed);
        if (elapsed >= DURATION_MS) {
            playing = false;
            if (typeof window.__promoOnComplete === 'function') window.__promoOnComplete();
            return;
        }
        raf = requestAnimationFrame(tick);
    }

    function play() {
        cancelAnimationFrame(raf);
        sparks = [];
        lastBeat = '';
        lastFlashAt = -9999;
        document.body.removeAttribute('data-complete');
        playing = true;
        startTs = performance.now();
        spawnSparks(18, false);
        renderAt(0);
        if (!recordMode) raf = requestAnimationFrame(tick);
    }

    function seek(ms) {
        playing = false;
        cancelAnimationFrame(raf);
        renderAt(ms);
    }

    window.__promoPlay = play;
    window.__promoSeek = seek;
    window.__promoDurationMs = DURATION_MS;

    window.addEventListener('resize', resize);
    resize();

    var replay = document.getElementById('promoReplay');
    if (replay) replay.addEventListener('click', play);

    if (recordMode) {
        renderAt(0);
        return;
    }

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
            if (autoplay) window.setTimeout(play, 80);
        });
    } else {
        window.setTimeout(play, 120);
    }
})();
