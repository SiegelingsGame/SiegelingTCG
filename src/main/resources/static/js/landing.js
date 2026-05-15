/**
 * Siegelings Landing Page — interactions
 * - Subtle 3-layer mouse parallax on the hero
 * - Renders the creature showcase grid (placeholder cards keyed on the
 *   canonical element palette so swapping in real art is a one-line edit)
 * - Trailer modal placeholder
 * - Tries the real Siegelings logo asset first; CSS-drawn fallback otherwise
 */
(function () {
    'use strict';

    const FEATURED_SIEGELINGS = [
        { name: 'Pylord',  element: 'FIRE',  sigil: '🔥' },
        { name: 'Glaciemperor', element: 'ICE',   sigil: '❄'  },
        { name: 'Aerovane',   element: 'WIND', sigil: '🌬' },
        { name: 'Gymstone',  element: 'EARTH', sigil: '⛰'  },
    ];

    const FLAVOR_LINES = [
        'Siegelings feed on raw elemental energy.',
        'A SiegeKnight never retreats from the arena.',
        'Element advantage changes everything.',
        'Every notch you link decides what spells you can cast.',
        'The crown belongs to whoever holds the field.',
        'Beware the silence between phases.'
    ];

    function renderCreatureGrid() {
        const grid = document.getElementById('creatureGrid');
        if (!grid) return;
        const html = FEATURED_SIEGELINGS.map((s) => {
            const elKey = String(s.element).toLowerCase();
            return `
                <article class="creature-card" data-element="${elKey}"
                         style="--creature-color: var(--element-${elKey}); --creature-glow: var(--element-${elKey}-glow, rgba(255,255,255,0.4))">
                    <div class="creature-portrait" aria-hidden="true">
                        <span>${s.sigil}</span>
                    </div>
                    <div class="creature-name">${escapeHtml(s.name)}</div>
                    <div class="creature-card-footer">
                        <span class="creature-element">${s.element}</span>
                    </div>
                </article>
            `;
        }).join('');
        grid.innerHTML = html;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── Hero parallax ─────────────────────────────────────────────────────
    function bindParallax() {
        const hero = document.getElementById('hero');
        if (!hero) return;
        const layers = hero.querySelectorAll('[data-parallax]');
        if (!layers.length) return;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        let pending = false;
        let lastX = 0, lastY = 0;
        function apply() {
            pending = false;
            const w = window.innerWidth || 1;
            const h = window.innerHeight || 1;
            const cx = (lastX / w - 0.5) * 2;  // -1 .. 1
            const cy = (lastY / h - 0.5) * 2;
            layers.forEach((layer) => {
                const depth = parseFloat(layer.dataset.parallax || '0');
                const tx = -cx * depth * 40;
                const ty = -cy * depth * 30;
                layer.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
            });
        }
        hero.addEventListener('pointermove', (e) => {
            lastX = e.clientX; lastY = e.clientY;
            if (!pending) {
                pending = true;
                requestAnimationFrame(apply);
            }
        });
        hero.addEventListener('pointerleave', () => {
            layers.forEach((layer) => { layer.style.transform = ''; });
        });
    }

    // ── Trailer modal ─────────────────────────────────────────────────────
    function bindTrailerModal() {
        const modal = document.getElementById('trailerModal');
        const trigger = document.getElementById('ctaTrailer');
        if (!modal || !trigger) return;

        function open() {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
        function close() {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
        trigger.addEventListener('click', open);
        modal.querySelectorAll('[data-close-trailer]').forEach((el) => {
            el.addEventListener('click', close);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
        });
    }

    // ── Footer year ───────────────────────────────────────────────────────
    function setFooterYear() {
        const el = document.getElementById('footerYear');
        if (el) el.textContent = new Date().getFullYear();
    }

    // ── Optional real asset wiring ────────────────────────────────────────
    // If /img/siegelings-logo.png exists, the <img>'s onerror won't fire and
    // the fallback stays hidden. If it 404s, the inline onerror swaps to the
    // CSS-drawn placeholder so the page still renders cleanly.
    function trySiegelingsAsset() {
        const img = document.querySelector('.siegelings-logo-img');
        if (!img) return;
        img.src = '/img/siegelings-logo.png';
    }

    function init() {
        renderCreatureGrid();
        bindParallax();
        bindTrailerModal();
        setFooterYear();
        trySiegelingsAsset();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
