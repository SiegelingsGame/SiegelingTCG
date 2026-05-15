/**
 * Sieglings TCG — Loading Gate
 *
 * Console-style splash that runs between "Start Match" and the first game
 * state rendering. Builds its DOM on demand (no markup in index.html), so
 * the only integration point is window.SieglingsLoadingGate.
 *
 * Public API:
 *   show(opts) — opts: { player, opponent, minDurationMs }
 *     each side: { name, element, trainerName, sigil? }
 *   hide()
 *   setProgress(0..1)
 *   isVisible()
 *
 * If show() is called without explicit opts, the gate falls back to neutral
 * placeholders. The minimum-duration option ensures the splash is visible
 * long enough for players to register it even when the API responds in
 * <300ms.
 */
(function () {
    'use strict';

    const ELEMENT_SIGIL = {
        FIRE: '🔥', WATER: '💧', EARTH: '⛰', WIND: '🌪', ICE: '❄',
        SHADOW: '🌑', ELECTRIC: '⚡', STORM: '⚡', METAL: '⚙', MECH: '⚙',
        UNDEAD: '☠', PSYCHIC: '✦', LOVE: '💗', NEUTRAL: '◆'
    };

    const ELEMENT_TO_CSS = {
        FIRE:     'var(--element-fire)',
        WATER:    'var(--element-water, var(--element-ice))',
        EARTH:    'var(--element-earth)',
        WIND:     'var(--element-wind)',
        ICE:      'var(--element-ice)',
        SHADOW:   'var(--element-storm)',
        ELECTRIC: 'var(--element-storm)',
        STORM:    'var(--element-storm)',
        METAL:    'var(--element-mech)',
        MECH:     'var(--element-mech)',
        UNDEAD:   'var(--element-storm)',
        PSYCHIC:  'var(--element-storm)',
        LOVE:     'var(--element-love)',
        NEUTRAL:  'var(--siegelings-blue)'
    };

    const FLAVOR_LINES = [
        'Siegelings feed on raw elemental energy.',
        'A SiegeKnight never retreats from the arena.',
        'Element advantage changes everything.',
        'Every notch you link decides what spells you can cast.',
        'The crown belongs to whoever holds the field.',
        'Beware the silence between phases.'
    ];

    const PARTICLE_PALETTE = [
        'var(--element-fire)',
        'var(--element-ice)',
        'var(--element-storm)',
        'var(--element-wind)',
        'var(--siegelings-gold)'
    ];

    let root = null;
    let flavorEl = null;
    let progressFill = null;
    let progressWalker = null;
    let flavorTimer = null;
    let progressInterval = null;
    let showStartedAt = 0;
    let minDurationMs = 1800;
    let visible = false;
    let pendingHide = null;
    let stylesheetEnsured = false;

    function ensureStylesheet() {
        if (stylesheetEnsured) return;
        // landing.css holds the gate styles. Inject it lazily so callers in
        // index.html don't need to remember to add the <link> tag.
        const existing = document.querySelector('link[data-sgl-landing-css]');
        if (!existing) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/css/landing.css?v=1';
            link.dataset.sglLandingCss = '1';
            document.head.appendChild(link);
        }
        stylesheetEnsured = true;
    }

    function elementSigil(element) {
        const k = String(element || '').toUpperCase();
        return ELEMENT_SIGIL[k] || ELEMENT_SIGIL.NEUTRAL;
    }
    function elementCss(element) {
        const k = String(element || '').toUpperCase();
        return ELEMENT_TO_CSS[k] || ELEMENT_TO_CSS.NEUTRAL;
    }
    function elementGlow(element) {
        const map = {
            FIRE: 'var(--element-fire-glow)',  ICE: 'var(--element-ice-glow)',
            STORM: 'var(--element-storm-glow)',LOVE: 'var(--element-love-glow)',
            EARTH: 'var(--element-earth-glow)',WIND: 'var(--element-wind-glow)'
        };
        const k = String(element || '').toUpperCase();
        return map[k] || 'rgba(30, 144, 255, 0.5)';
    }
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function buildParticleField(container, count) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            const p = document.createElement('span');
            p.className = 'sgl-gate-particle';
            const color = PARTICLE_PALETTE[i % PARTICLE_PALETTE.length];
            p.style.setProperty('--p-color', color);
            p.style.setProperty('--p-left', `${Math.random() * 100}%`);
            p.style.setProperty('--p-duration', `${6 + Math.random() * 6}s`);
            p.style.setProperty('--p-delay', `-${Math.random() * 8}s`);
            p.style.setProperty('--p-drift', `${(Math.random() - 0.5) * 80}px`);
            p.style.width = p.style.height = `${4 + Math.random() * 6}px`;
            frag.appendChild(p);
        }
        container.appendChild(frag);
    }

    function buildKnightCard(side, info, isRight) {
        const el = String(info?.element || 'NEUTRAL').toUpperCase();
        const color = elementCss(el);
        const glow  = elementGlow(el);
        const sigil = info?.sigil || elementSigil(el);
        const sideClass = isRight ? 'right' : 'left';
        const safeName = escapeHtml(info?.name || (isRight ? 'Opponent' : 'Player'));
        const trainerLabel = info?.trainerName
            ? `<div class="sgl-knight-trainer">${escapeHtml(info.trainerName)}</div>`
            : '';
        return `
            <div class="sgl-knight-card ${sideClass}"
                 style="--knight-color: ${color}; --knight-glow: ${glow}; animation-delay: ${isRight ? '120ms' : '0ms'}">
                <div class="sgl-knight-portrait" aria-hidden="true">${sigil}</div>
                <div class="sgl-knight-name">${safeName}</div>
                ${trainerLabel}
                <span class="sgl-knight-element">${escapeHtml(el)}</span>
            </div>
        `;
    }

    function buildRoot() {
        if (root) return root;
        ensureStylesheet();

        root = document.createElement('div');
        root.className = 'sgl-loading-gate';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.innerHTML = `
            <div class="sgl-gate-bg" aria-hidden="true"></div>
            <div class="sgl-gate-vignette" aria-hidden="true"></div>
            <div class="sgl-gate-particles" id="sglGateParticles" aria-hidden="true"></div>

            <div class="sgl-gate-content">
                <div class="sgl-gate-pcg">
                    <div class="pcg-bubble-logo" aria-hidden="true">
                        <span class="pcg-letter pcg-l-1">P</span><span class="pcg-letter pcg-l-2">C</span><span class="pcg-letter pcg-l-3">G</span>
                        <span class="pcg-controller-dot" style="--x:80%;--y:22%;--c:var(--pcg-yellow)"></span>
                    </div>
                    <span class="sgl-gate-pcg-text">PartyChatGaming presents</span>
                </div>

                <div class="sgl-gate-vs" id="sglGateVs"></div>

                <div class="sgl-gate-loading">
                    <div class="sgl-progress-track" aria-hidden="true">
                        <div class="sgl-progress-fill" id="sglProgressFill"></div>
                        <div class="sgl-progress-walker" id="sglProgressWalker" style="left:0%">★</div>
                    </div>
                    <div class="sgl-gate-flavor" id="sglGateFlavor"></div>
                </div>
            </div>

            <div class="sgl-gate-watermark" aria-hidden="true">
                <div class="pcg-bubble-logo" style="padding:2px 6px;border-radius:10px;">
                    <span class="pcg-letter pcg-l-1" style="font-size:0.7rem;padding:2px 3px;">P</span><span class="pcg-letter pcg-l-2" style="font-size:0.7rem;padding:2px 3px;">C</span><span class="pcg-letter pcg-l-3" style="font-size:0.7rem;padding:2px 3px;">G</span>
                </div>
                <span>PartyChatGaming.com</span>
            </div>
        `;
        document.body.appendChild(root);

        buildParticleField(root.querySelector('#sglGateParticles'), 28);
        flavorEl = root.querySelector('#sglGateFlavor');
        progressFill = root.querySelector('#sglProgressFill');
        progressWalker = root.querySelector('#sglProgressWalker');
        return root;
    }

    function renderKnights(opts) {
        const vs = root.querySelector('#sglGateVs');
        if (!vs) return;
        const player = opts?.player || { name: 'Player', element: 'NEUTRAL' };
        const opponent = opts?.opponent || { name: 'Opponent', element: 'NEUTRAL' };
        vs.innerHTML = `
            ${buildKnightCard('PLAYER', player, false)}
            <div class="sgl-vs-emblem" aria-hidden="true">
                <span class="sgl-vs-emblem-text">VS</span>
            </div>
            ${buildKnightCard('OPPONENT', opponent, true)}
        `;
    }

    function startFlavorRotation() {
        if (!flavorEl) return;
        let idx = Math.floor(Math.random() * FLAVOR_LINES.length);
        flavorEl.textContent = FLAVOR_LINES[idx];
        if (flavorTimer) clearInterval(flavorTimer);
        flavorTimer = setInterval(() => {
            flavorEl.classList.add('fading');
            setTimeout(() => {
                idx = (idx + 1) % FLAVOR_LINES.length;
                flavorEl.textContent = FLAVOR_LINES[idx];
                flavorEl.classList.remove('fading');
            }, 340);
        }, 2600);
    }

    function startProgressSim() {
        if (!progressFill) return;
        // Simulated progress ramps toward 90% — the actual completion is
        // driven by hide(), which fills to 100% before fading.
        let pct = 6;
        setProgress(pct / 100);
        if (progressInterval) clearInterval(progressInterval);
        progressInterval = setInterval(() => {
            const ceiling = 90;
            if (pct >= ceiling) return;
            const step = (ceiling - pct) * 0.08 + Math.random() * 1.4;
            pct = Math.min(ceiling, pct + step);
            setProgress(pct / 100);
        }, 220);
    }

    function setProgress(frac) {
        if (!progressFill) return;
        const pct = Math.max(0, Math.min(1, Number(frac) || 0)) * 100;
        progressFill.style.width = `${pct}%`;
        if (progressWalker) {
            progressWalker.style.left = `${pct}%`;
        }
    }

    function show(opts = {}) {
        buildRoot();
        renderKnights(opts);
        minDurationMs = Number.isFinite(opts.minDurationMs) ? opts.minDurationMs : 1800;
        showStartedAt = performance.now();
        startFlavorRotation();
        startProgressSim();
        // Reset knight-card slide-in animations by toggling a class flicker.
        const cards = root.querySelectorAll('.sgl-knight-card');
        cards.forEach((c) => {
            c.style.animation = 'none';
            // force reflow
            void c.offsetWidth;
            c.style.animation = '';
        });
        requestAnimationFrame(() => root.classList.add('visible'));
        visible = true;
        if (pendingHide) { clearTimeout(pendingHide); pendingHide = null; }
    }

    function hide() {
        if (!root || !visible) return;
        const elapsed = performance.now() - showStartedAt;
        const remaining = Math.max(0, minDurationMs - elapsed);

        const finish = () => {
            if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
            if (flavorTimer)      { clearInterval(flavorTimer);      flavorTimer = null; }
            setProgress(1);
            // Allow the final fill animation to be perceived before fading.
            setTimeout(() => {
                root.classList.remove('visible');
                visible = false;
                pendingHide = null;
            }, 240);
        };

        if (remaining > 0) {
            pendingHide = setTimeout(finish, remaining);
        } else {
            finish();
        }
    }

    function isVisible() { return visible; }

    window.SieglingsLoadingGate = { show, hide, setProgress, isVisible };
})();
