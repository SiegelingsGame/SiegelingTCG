/**
 * The hub's primary Play button used to drop the player straight into an Arena
 * match, which made the other two things they might have wanted — a Siege run
 * or their Keep — unreachable from the one control that says "play". This picker
 * puts the choice in front of the launch instead.
 *
 * It lives in its own file, and injects its own stylesheet once, because both
 * hub shells need it: home.html (`#playNowBtn`, home.css) and play.html
 * (`#playHubPlayBtn`, style.css). Both stylesheets define --accent, so the
 * panel inherits each page's palette rather than carrying a second one.
 */
(function () {
    'use strict';

    const STYLE_ID = 'playModePickerStyle';
    const OVERLAY_ID = 'playModePicker';

    const MODES = [
        {
            id: 'arena',
            icon: '⚔️',
            name: 'Arena',
            sub: 'Face the table head-on. Solo skirmishes and live 1v1 duels — knight levels off, so it is your deck and your nerve.'
        },
        {
            id: 'siege',
            icon: '🏰',
            name: 'Siege Battlegrounds',
            sub: 'March a branching warpath. Muster a warband, level your knight, and see how deep you get before it ends you.',
            href: '/siege'
        },
        {
            id: 'keep',
            icon: '🛡️',
            name: 'My Keep',
            sub: 'Your stronghold between battles — spoils, chronicles and the veterans you brought home alive.',
            href: '/keep'
        }
    ];

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
.pmp-overlay{position:fixed; inset:0; z-index:4000; display:flex; align-items:center; justify-content:center;
  padding:max(16px,env(safe-area-inset-top,0px)) 16px max(16px,env(safe-area-inset-bottom,0px));}
.pmp-overlay[hidden]{display:none !important;}
/* No backdrop-filter: it makes the backdrop a compositing root that the panel's
   own background then samples, so bright hub headlines ghost through the panel
   and its option tiles. The flat dim reads the same and composites reliably. */
.pmp-backdrop{position:absolute; inset:0; background:rgba(4,7,14,.82);}
/* Opaque on purpose, for the same reason — nothing behind this panel should be
   legible through it. */
.pmp-panel{position:relative; width:min(760px,100%); max-height:100%; overflow:auto;
  border-radius:18px; border:1px solid var(--line,rgba(255,255,255,.12));
  background:linear-gradient(180deg,#16213e,#0a1020);
  box-shadow:0 26px 70px rgba(0,0,0,.6); padding:18px; animation:pmp-rise .18s ease-out;}
@keyframes pmp-rise{from{opacity:0; transform:translateY(14px);} to{opacity:1; transform:none;}}
.pmp-title{margin:0 0 14px; font-size:19px; font-weight:800; color:#fff;}
/* Three across on anything wide enough to read them side by side; stacked on a
   phone, where a row of three would clip each sub-line to nothing. */
.pmp-options{display:grid; grid-template-columns:repeat(3,1fr); gap:10px;}
@media (max-width:719px){ .pmp-options{grid-template-columns:1fr;} }
.pmp-option{display:flex; flex-direction:column; align-items:flex-start; gap:5px; text-align:left;
  padding:14px 14px 15px; border-radius:14px; cursor:pointer; font:inherit; text-decoration:none;
  border:1px solid var(--line,rgba(255,255,255,.12)); background:rgba(255,255,255,.045); color:#fff;
  min-height:44px; transition:border-color .15s ease, background .15s ease, transform .15s ease;}
.pmp-option:hover{border-color:var(--accent,#ffd700); background:rgba(255,255,255,.09); transform:translateY(-2px);}
.pmp-option:active{transform:translateY(0);}
.pmp-option:focus-visible{outline:2px solid var(--accent,#ffd700); outline-offset:2px;}
.pmp-option-icon{font-size:22px; line-height:1;}
.pmp-option-name{font-size:15px; font-weight:800; letter-spacing:.01em;}
.pmp-option-sub{font-size:11.5px; line-height:1.45; color:rgba(255,255,255,.66);}
/* Arena keeps the primary weight the orange button had, so the old one-tap
   habit still lands on the same choice. */
.pmp-option.is-primary{border-color:color-mix(in srgb,var(--accent,#ffd700) 60%,transparent);
  background:linear-gradient(180deg,rgba(255,215,0,.15),rgba(255,215,0,.05));}
.pmp-option.is-primary .pmp-option-name{color:var(--accent,#ffd700);}
.pmp-foot{display:flex; justify-content:flex-end; margin-top:14px;}
.pmp-cancel{padding:9px 18px; min-height:40px; border-radius:10px; cursor:pointer; font:inherit; font-weight:700;
  border:1px solid var(--line,rgba(255,255,255,.12)); background:transparent; color:rgba(255,255,255,.72);}
.pmp-cancel:hover{color:#fff; border-color:rgba(255,255,255,.3);}
@media (prefers-reduced-motion:reduce){ .pmp-panel{animation:none;} .pmp-option:hover{transform:none;} }
`;
        document.head.appendChild(style);
    }

    let lastFocus = null;

    function close() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.hidden = true;
        document.removeEventListener('keydown', onKeydown, true);
        // Send focus back where the player left it, so closing with Escape does
        // not dump keyboard users at the top of the page.
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
        lastFocus = null;
    }

    function onKeydown(event) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        // Captured, and stopped here: game.js is loaded on both shells and binds
        // a document-level Escape that clears the battle table's selection. An
        // Escape aimed at this dialog is not aimed at that.
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        close();
    }

    function build(handlers) {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'pmp-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Choose where to play');

        const options = MODES.map(mode => `
            <button class="pmp-option${mode.id === 'arena' ? ' is-primary' : ''}" type="button" data-pmp-mode="${mode.id}">
                <span class="pmp-option-icon" aria-hidden="true">${mode.icon}</span>
                <span class="pmp-option-name">${mode.name}</span>
                <span class="pmp-option-sub">${mode.sub}</span>
            </button>`).join('');

        overlay.innerHTML = `
            <div class="pmp-backdrop" data-pmp-close></div>
            <div class="pmp-panel">
                <h2 class="pmp-title">Pick a mode</h2>
                <div class="pmp-options">${options}</div>
                <div class="pmp-foot"><button class="pmp-cancel" type="button" data-pmp-close>Cancel</button></div>
            </div>`;

        overlay.addEventListener('click', event => {
            if (event.target.closest('[data-pmp-close]')) { close(); return; }
            const choice = event.target.closest('[data-pmp-mode]');
            if (!choice) return;
            const id = choice.getAttribute('data-pmp-mode');
            const mode = MODES.find(m => m.id === id);
            close();
            const handler = handlers && handlers['on' + id.charAt(0).toUpperCase() + id.slice(1)];
            if (typeof handler === 'function') handler();
            else if (mode && mode.href) window.location.href = mode.href;
        });

        document.body.appendChild(overlay);
        return overlay;
    }

    /**
     * @param {{onArena?:Function,onSiege?:Function,onKeep?:Function}} handlers
     *        Arena differs per shell — the hub queues a loadout and navigates,
     *        the play table starts a solo match in place — so its launch is
     *        always supplied by the caller. Siege and Keep fall back to their
     *        routes.
     */
    function open(handlers) {
        injectStyle();
        lastFocus = document.activeElement;
        const overlay = build(handlers);
        overlay.hidden = false;
        document.addEventListener('keydown', onKeydown, true);
        const first = overlay.querySelector('[data-pmp-mode]');
        if (first) first.focus();
    }

    window.SieglingsPlayModePicker = { open, close };
})();
