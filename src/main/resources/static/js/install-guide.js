/*
 * "Best as a web app" onboarding. Shown once, on a phone browser tab that is
 * not already running standalone, because the fixed 100dvh battle layout is
 * built for the home-screen shell — in a browser tab the URL/toolbar chrome
 * eats the bottom HUD and the address bar collapse/expand fights the layout.
 *
 * ES5-flavoured on purpose: this loads on the landing page for first-time
 * visitors, ahead of any of the game bundles, on whatever browser they arrived
 * with.
 */
(function () {
    'use strict';

    var DISMISS_KEY = 'siegelingsInstallGuideDismissed.v1';
    var SHOW_DELAY_MS = 900;

    function store(op, value) {
        // Private-mode Safari throws on localStorage; never let that break the
        // page the guide is only decorating.
        try {
            if (op === 'get') { return window.localStorage.getItem(DISMISS_KEY); }
            if (op === 'set') { window.localStorage.setItem(DISMISS_KEY, value); }
        } catch (err) { /* no persistence available */ }
        return null;
    }

    function isStandalone() {
        if (window.navigator.standalone === true) { return true; }
        if (!window.matchMedia) { return false; }
        return ['standalone', 'fullscreen', 'minimal-ui'].some(function (mode) {
            return window.matchMedia('(display-mode: ' + mode + ')').matches;
        });
    }

    function platform() {
        var ua = window.navigator.userAgent || '';
        // iPadOS reports a desktop UA, so touch points are the tell.
        var iPadOS = /Macintosh/.test(ua) && (window.navigator.maxTouchPoints || 0) > 1;
        if (/iPhone|iPad|iPod/.test(ua) || iPadOS) { return 'ios'; }
        if (/Android/.test(ua)) { return 'android'; }
        return 'other';
    }

    function isPhoneSized() {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) { return true; }
        return Math.min(window.innerWidth, window.innerHeight) <= 820;
    }

    var SHARE_GLYPH = '<span class="ig-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V3"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span>';
    var MENU_GLYPH = '<span class="ig-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></span>';

    /* Hand-drawn mockups rather than screenshots: the real sheets are restyled
       every OS release, and a stale screenshot is worse than a diagram. */
    function iosMock() {
        return '' +
        '<svg viewBox="0 0 396 150" role="img" aria-label="Three iPhone panels: tap Share in the Safari toolbar, choose Add to Home Screen, then tap Add.">' +
        '<defs><style>' +
        '.igp{fill:#0d1730;stroke:#2b3a63;stroke-width:1.4;rx:9}' +
        '.igr{fill:#1b2748}.igt{fill:#8fa4cc;font:8px -apple-system,sans-serif}' +
        '.igw{fill:#e8eefc;font:8.5px -apple-system,sans-serif}' +
        '.ighl{fill:none;stroke:#e2b714;stroke-width:2}' +
        '</style></defs>' +
        // panel 1 - Safari toolbar
        '<rect class="igp" x="2" y="6" width="124" height="138" rx="10"/>' +
        '<rect class="igr" x="12" y="16" width="104" height="86" rx="6"/>' +
        '<text class="igt" x="22" y="44">Siegelings TCG</text>' +
        '<text class="igt" x="22" y="58">in a browser tab</text>' +
        '<rect class="igr" x="12" y="110" width="104" height="22" rx="7"/>' +
        '<text class="igt" x="20" y="124">AA</text>' +
        '<text class="igt" x="38" y="124">siegelings…</text>' +
        '<path d="M96 126V116m-4 4 4-4 4 4m-7 6v4h6v-4" fill="none" stroke="#e8eefc" stroke-width="1.4" stroke-linecap="round"/>' +
        '<rect class="ighl" x="86" y="110" width="22" height="22" rx="7"/>' +
        '<text class="igw" x="34" y="141">1 · Share</text>' +
        // panel 2 - share sheet row
        '<rect class="igp" x="136" y="6" width="124" height="138" rx="10"/>' +
        '<rect class="igr" x="146" y="16" width="104" height="30" rx="6"/>' +
        '<text class="igw" x="154" y="30">Siegelings TCG</text>' +
        '<text class="igt" x="154" y="41">siegelingstcgtesting…</text>' +
        '<rect class="igr" x="146" y="54" width="104" height="16" rx="5"/>' +
        '<text class="igt" x="154" y="65">Add to Favorites</text>' +
        '<rect class="igr" x="146" y="74" width="104" height="16" rx="5"/>' +
        '<text class="igt" x="154" y="85">Find on Page</text>' +
        '<rect class="igr" x="146" y="94" width="104" height="18" rx="5"/>' +
        '<text class="igw" x="154" y="106">Add to Home Screen</text>' +
        '<rect class="ighl" x="144" y="92" width="108" height="22" rx="7"/>' +
        '<text class="igw" x="158" y="136">2 · Add to Home Screen</text>' +
        // panel 3 - name + Add
        '<rect class="igp" x="270" y="6" width="124" height="138" rx="10"/>' +
        '<rect class="igr" x="280" y="16" width="104" height="22" rx="6"/>' +
        '<text class="igt" x="286" y="30">Add to Home</text>' +
        '<rect class="ighl" x="352" y="18" width="30" height="18" rx="9"/>' +
        '<text class="igw" x="358" y="31">Add</text>' +
        '<rect class="igr" x="280" y="46" width="26" height="26" rx="6"/>' +
        '<text class="igw" x="314" y="60">Siegelings</text>' +
        '<rect class="ighl" x="310" y="48" width="72" height="20" rx="6"/>' +
        '<text class="igt" x="280" y="92">The name and icon are filled in</text>' +
        '<text class="igt" x="280" y="104">for you — just confirm.</text>' +
        '<text class="igw" x="304" y="136">3 · Add</text>' +
        '</svg>';
    }

    function androidMock() {
        return '' +
        '<svg viewBox="0 0 396 150" role="img" aria-label="Two Android panels: open the browser menu, then choose Install app or Add to Home screen.">' +
        '<defs><style>' +
        '.igp{fill:#0d1730;stroke:#2b3a63;stroke-width:1.4}' +
        '.igr{fill:#1b2748}.igt{fill:#8fa4cc;font:8px Roboto,sans-serif}' +
        '.igw{fill:#e8eefc;font:8.5px Roboto,sans-serif}' +
        '.ighl{fill:none;stroke:#e2b714;stroke-width:2}' +
        '</style></defs>' +
        '<rect class="igp" x="24" y="6" width="164" height="138" rx="10"/>' +
        '<rect class="igr" x="34" y="16" width="144" height="20" rx="6"/>' +
        '<text class="igt" x="42" y="30">siegelingstcgtesting.web.app</text>' +
        '<circle cx="168" cy="21" r="1.6" fill="#e8eefc"/><circle cx="168" cy="26" r="1.6" fill="#e8eefc"/><circle cx="168" cy="31" r="1.6" fill="#e8eefc"/>' +
        '<rect class="ighl" x="160" y="16" width="18" height="20" rx="6"/>' +
        '<rect class="igr" x="34" y="46" width="144" height="80" rx="6"/>' +
        '<text class="igt" x="42" y="70">Siegelings TCG</text>' +
        '<text class="igt" x="42" y="84">in a browser tab</text>' +
        '<text class="igw" x="68" y="140">1 · Menu</text>' +
        '<rect class="igp" x="208" y="6" width="164" height="138" rx="10"/>' +
        '<rect class="igr" x="218" y="16" width="144" height="16" rx="5"/>' +
        '<text class="igt" x="226" y="27">New tab</text>' +
        '<rect class="igr" x="218" y="36" width="144" height="16" rx="5"/>' +
        '<text class="igt" x="226" y="47">Bookmarks</text>' +
        '<rect class="igr" x="218" y="56" width="144" height="18" rx="5"/>' +
        '<text class="igw" x="226" y="68">Install app</text>' +
        '<rect class="ighl" x="216" y="54" width="148" height="22" rx="7"/>' +
        '<text class="igt" x="218" y="94">…or “Add to Home screen”,</text>' +
        '<text class="igt" x="218" y="106">depending on your browser.</text>' +
        '<text class="igw" x="242" y="140">2 · Install app</text>' +
        '</svg>';
    }

    function stepsFor(kind, canPrompt) {
        if (kind === 'ios') {
            return [
                'Tap the <strong>Share</strong> button ' + SHARE_GLYPH + ' in the Safari toolbar (bottom of the screen, or top-right on iPad).',
                'Scroll down the share sheet and tap <strong>Add to Home Screen</strong>.',
                'Leave the name as <strong>Siegelings</strong> and tap <strong>Add</strong>. Launch it from your Home Screen from now on.'
            ];
        }
        if (kind === 'android') {
            if (canPrompt) {
                return [
                    'Tap <strong>Install app</strong> below and confirm.',
                    'Chrome adds a <strong>Siegelings</strong> icon to your home screen.',
                    'Open the game from that icon — it runs full screen, with no browser bars.'
                ];
            }
            return [
                'Open the browser menu ' + MENU_GLYPH + ' (top-right in Chrome).',
                'Tap <strong>Install app</strong>, or <strong>Add to Home screen</strong> if your browser words it that way.',
                'Confirm the name <strong>Siegelings</strong> and open the game from that icon from now on.'
            ];
        }
        return [
            'In Chrome or Edge, use the <strong>install</strong> icon at the right of the address bar.',
            'In Safari on macOS, choose <strong>File → Add to Dock</strong>.',
            'On your phone, open this page and follow the Share → <strong>Add to Home Screen</strong> steps.'
        ];
    }

    var root = null;
    var deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function (event) {
        // Chrome's own mini-infobar would compete with this sheet, and the
        // event is the only handle on a real one-tap install.
        event.preventDefault();
        deferredPrompt = event;
        if (root && root.classList.contains('ig-open')) { render(); }
    });

    function render() {
        var kind = platform();
        var canPrompt = Boolean(deferredPrompt);
        var steps = stepsFor(kind, canPrompt);
        var mock = kind === 'ios' ? iosMock() : (kind === 'android' ? androidMock() : '');
        root.innerHTML = '' +
            '<div class="ig-card" role="dialog" aria-modal="true" aria-labelledby="igTitle">' +
            '<div class="ig-head">' +
            '<img class="ig-icon" src="/img/siegelings-icon.png" alt="" aria-hidden="true">' +
            '<div><div class="ig-kicker">Install</div>' +
            '<h2 class="ig-title" id="igTitle">Siegelings TCG is best experienced as a web app</h2></div>' +
            '<button class="ig-close" type="button" data-ig-dismiss aria-label="Close">&times;</button>' +
            '</div>' +
            '<p class="ig-copy">Added to your Home Screen it runs full screen — no address bar eating the board, and it opens straight into the game.</p>' +
            '<ol class="ig-steps">' + steps.map(function (text) {
                return '<li class="ig-step"><span class="ig-step-text">' + text + '</span></li>';
            }).join('') + '</ol>' +
            (mock ? '<div class="ig-mock"><div class="ig-mock-label">What you will see</div>' + mock + '</div>' : '') +
            '<div class="ig-actions">' +
            (canPrompt ? '<button class="ig-btn ig-btn-primary" type="button" data-ig-install>Install app</button>' : '') +
            '<button class="ig-btn" type="button" data-ig-dismiss>' + (canPrompt ? 'Not now' : 'Got it') + '</button>' +
            '</div>' +
            '<p class="ig-foot">You can keep playing in this tab — this tip will not show again.</p>' +
            '</div>';
    }

    function close() {
        store('set', '1');
        if (root) { root.classList.remove('ig-open'); }
    }

    function open() {
        if (!root) {
            root = document.createElement('div');
            root.className = 'ig-root';
            root.id = 'installGuide';
            document.body.appendChild(root);
            root.addEventListener('click', function (event) {
                if (event.target.closest('[data-ig-dismiss]') || event.target === root) {
                    close();
                    return;
                }
                if (event.target.closest('[data-ig-install]') && deferredPrompt) {
                    var prompt = deferredPrompt;
                    deferredPrompt = null;
                    close();
                    prompt.prompt();
                }
            });
        }
        render();
        root.classList.add('ig-open');
    }

    function maybeAutoShow() {
        if (isStandalone() || store('get') || !isPhoneSized()) { return; }
        window.setTimeout(open, SHOW_DELAY_MS);
    }

    window.SieglingsInstallGuide = {
        open: open,
        close: close,
        isStandalone: isStandalone,
        reset: function () { try { window.localStorage.removeItem(DISMISS_KEY); } catch (err) { /* ignore */ } }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeAutoShow);
    } else {
        maybeAutoShow();
    }
}());
