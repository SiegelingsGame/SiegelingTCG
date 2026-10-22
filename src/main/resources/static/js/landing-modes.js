/**
 * Landing page — Siege and Dominion mechanic demos.
 * Siege: the Advantage token walking the Speed order, and travel on a branching
 * map. Dominion: founding a knight, and raising workshops whose notches link.
 * Both are self-contained teaching toys; the rules they mirror are server-side
 * (SiegeAdvantage.java) or in dominion.js, and the numbers are copied from there.
 */
(function () {
    'use strict';

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, reducedMotion() ? Math.min(ms, 120) : ms));

    function bindTabs(root, onSelect) {
        // The root's first tablist is its own; nested demos carry their own lists.
        const tabs = Array.from(root.querySelector('[role="tablist"]').querySelectorAll('[role="tab"]'));
        function select(tab) {
            tabs.forEach((t) => {
                const on = t === tab;
                t.setAttribute('aria-selected', String(on));
                t.tabIndex = on ? 0 : -1;
                document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
            });
            if (onSelect) onSelect(tab);
        }
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => select(tab));
            tab.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
                select(next);
                next.focus();
            });
        });
        return select;
    }

    function popText(host, text, kind) {
        if (!host) return;
        const pop = document.createElement('span');
        pop.className = 'sg-pop' + (kind ? ' is-' + kind : '');
        pop.textContent = text;
        host.appendChild(pop);
        window.setTimeout(() => pop.remove(), 1300);
    }

    // ── Siege: Advantage ────────────────────────────────────────────────
    // Speeds are illustrative; the order rule (fastest first, both sides in one
    // queue) and the riders are SiegeAdvantage's.
    const SIEGE_UNITS = {
        draco:   { name: 'Draco',   element: 'fire',  speed: 5, side: 'ally' },
        frostag: { name: 'Frostag', element: 'ice',   speed: 4, side: 'foe', move: 'Antler Rime', rider: 'Deep Chill', riderText: 'Slows its target', status: 'Slow' },
        cacty:   { name: 'Cacty',   element: 'earth', speed: 3, side: 'ally' },
        breezee: { name: 'Breezee', element: 'wind',  speed: 2, side: 'foe', move: 'Gale Peck', rider: 'Headwind', riderText: 'Shocks its target', status: 'Shock' }
    };
    const SIEGE_CARDS = [
        { id: 'ember', owner: 'draco', name: 'Ember Snap', element: 'fire', base: 'Deal 4 damage to an enemy.', rider: 'Sear', riderText: '+2 damage', target: 'frostag' },
        { id: 'thorn', owner: 'cacty', name: 'Thorn Guard', element: 'earth', base: 'Grant 4 Shield to an ally.', rider: 'Fortify', riderText: '+4 Shield', target: 'draco' }
    ];

    function spriteMarkup(id) {
        const sheet = window.SiegeSprites?.forCard(id);
        if (!sheet) return '<span class="sg-sprite is-missing"></span>';
        const frames = sheet.frames.idle;
        // Size from the sheet's own fit so every body renders at the same height.
        return `<span class="sg-sprite" style="--frames:${frames};--cell-ratio:${sheet.w / sheet.h};--fit:${sheet.fit};--base:${sheet.base}">` +
            `<img src="${esc(sheet.dir)}idle.webp" alt="" loading="lazy" decoding="async"></span>`;
    }

    function bindSiegeAdvantage(panel) {
        const order = Object.keys(SIEGE_UNITS).sort((a, b) => SIEGE_UNITS[b].speed - SIEGE_UNITS[a].speed);
        const state = { holder: 0, cycle: 1, played: new Set(), busy: false };

        const unitMarkup = (id) => {
            const u = SIEGE_UNITS[id];
            return `<div class="sg-unit is-${u.side}" data-unit="${id}" style="--el:var(--element-${u.element})">
                <span class="sg-token" aria-hidden="true">◆</span>
                ${spriteMarkup(id)}
                <span class="sg-unit-name">${esc(u.name)} <small>SPD ${u.speed}</small></span>
            </div>`;
        };

        panel.innerHTML = `
            <div class="sg-queue" aria-label="Speed order">
                <span class="sg-queue-label">Speed order</span>
                <ol class="sg-queue-list"></ol>
                <span class="sg-cycle"></span>
            </div>
            <div class="sg-arena">
                <div class="sg-side is-ally" aria-label="Your warband">${order.filter((id) => SIEGE_UNITS[id].side === 'ally').map(unitMarkup).join('')}</div>
                <span class="sg-versus" aria-hidden="true">VS</span>
                <div class="sg-side is-foe" aria-label="Enemies">${order.filter((id) => SIEGE_UNITS[id].side === 'foe').map(unitMarkup).join('')}</div>
            </div>
            <div class="placement-feedback sg-feedback" role="status" aria-live="polite"></div>
            <div class="sg-hand" aria-label="Your hand"></div>
            <div class="mode-demo-actions"><button class="mode-demo-btn is-primary" type="button" data-sg-end>End turn <b aria-hidden="true">›</b></button></div>`;

        const queue = panel.querySelector('.sg-queue-list');
        const cycle = panel.querySelector('.sg-cycle');
        const feedback = panel.querySelector('.sg-feedback');
        const hand = panel.querySelector('.sg-hand');
        const endBtn = panel.querySelector('[data-sg-end]');
        const holderId = () => order[state.holder];
        const unitEl = (id) => panel.querySelector(`[data-unit="${id}"]`);

        function render() {
            const holder = holderId();
            queue.innerHTML = order.map((id) => {
                const u = SIEGE_UNITS[id];
                const on = id === holder;
                return `<li class="sg-chip is-${u.side}${on ? ' is-holder' : ''}" style="--el:var(--element-${u.element})"${on ? ' aria-current="true"' : ''}>${on ? '<b aria-hidden="true">◆</b>' : ''}${esc(u.name)}<small>${u.speed}</small></li>`;
            }).join('');
            cycle.textContent = `Cycle ${state.cycle}`;
            panel.querySelectorAll('.sg-unit').forEach((el) => el.classList.toggle('is-holder', el.dataset.unit === holder));
            hand.innerHTML = SIEGE_CARDS.map((card) => {
                const owner = SIEGE_UNITS[card.owner];
                const ready = card.owner === holder;
                const played = state.played.has(card.id);
                return `<button class="sg-card${ready ? ' is-ready' : ''}" type="button" data-sg-card="${card.id}" style="--el:var(--element-${card.element})"${played || state.busy ? ' disabled' : ''}>
                    <span class="sg-card-owner">${esc(owner.name)}</span>
                    <strong>${esc(card.name)}</strong>
                    <small>${esc(card.base)}</small>
                    <span class="sg-card-rider">◆ ${esc(card.rider)}: ${esc(card.riderText)}</span>
                    <span class="sg-card-state">${played ? 'Played' : ready ? '◆ Advantage ready' : 'No token: base effect only'}</span>
                </button>`;
            }).join('');
            endBtn.disabled = state.busy;
        }

        function advance() {
            state.holder += 1;
            if (state.holder >= order.length) {
                state.holder = 0;
                state.cycle += 1;
            }
        }

        function yourTurnText() {
            const holder = SIEGE_UNITS[holderId()];
            return holder.side === 'ally'
                ? `<strong>Your turn.</strong> ${esc(holder.name)} holds ◆ Advantage, so ${esc(holder.name)}'s card gains its rider.`
                : `<strong>Your turn.</strong> ${esc(holder.name)} holds the token, so your cards play at base strength.`;
        }

        hand.addEventListener('click', (event) => {
            const button = event.target.closest('[data-sg-card]');
            if (!button || state.busy) return;
            const card = SIEGE_CARDS.find((c) => c.id === button.dataset.sgCard);
            const owner = SIEGE_UNITS[card.owner];
            const fires = card.owner === holderId();
            state.played.add(card.id);
            const target = unitEl(card.target);
            if (card.id === 'ember') popText(target, fires ? '−6' : '−4', 'damage');
            else popText(target, fires ? '+8 🛡' : '+4 🛡', 'shield');
            feedback.innerHTML = fires
                ? `<strong>${esc(card.rider)} fires!</strong> ${esc(owner.name)} holds ◆, so ${esc(card.name)} adds ${esc(card.riderText)}.`
                : `<strong>${esc(card.name)}: base effect.</strong> ${esc(owner.name)} doesn't hold ◆, so ${esc(card.rider)} stays quiet.`;
            render();
        });

        // The token only passes once its holder's team has had its turn
        // (SiegeAdvantage.advanceAfterTeamTurn), so a foe holding it acts with
        // its rider before it moves on.
        endBtn.addEventListener('click', async () => {
            if (state.busy) return;
            state.busy = true;
            if (SIEGE_UNITS[holderId()].side === 'ally') advance();
            render();
            const holder = SIEGE_UNITS[holderId()];
            if (holder.side === 'foe') {
                const victim = unitEl('draco');
                feedback.innerHTML = `<strong>Enemy turn.</strong> ${esc(holder.name)} took ◆: ${esc(holder.move)} gains ${esc(holder.rider)} and ${esc(holder.riderText.toLowerCase())}.`;
                await wait(450);
                popText(victim, holder.status, 'status');
                await wait(1100);
                advance();
            } else {
                feedback.innerHTML = '<strong>Enemy turn.</strong> No foe holds ◆, so their strikes land plain.';
                await wait(1000);
            }
            state.played.clear();
            state.busy = false;
            feedback.innerHTML = yourTurnText();
            render();
        });

        feedback.innerHTML = yourTurnText();
        render();
    }

    // ── Siege: map ──────────────────────────────────────────────────────
    // Node copy is adventure.js's NODE_LEGEND; positions are in % of the map.
    const MAP_NODES = {
        camp:  { icon: '⚑', label: 'Camp', x: 50, y: 88, text: 'Your warband sets out. Only joined roads are open.' },
        fight: { icon: '⚔️', label: 'Skirmish', x: 26, y: 64, text: 'A standard fight. Win for XP, gold and a reward pick.' },
        event: { icon: '❔', label: 'Event', x: 74, y: 64, text: 'An encounter with a choice; outcomes vary.' },
        elite: { icon: '🔺', label: 'Elite', x: 14, y: 38, text: 'A harder fight with a richer reward, and real risk.' },
        rest:  { icon: '🏕️', label: 'Rest', x: 50, y: 38, text: 'Heal the warband, upgrade a card or shop the camp stock.' },
        cache: { icon: '💎', label: 'Cache', x: 86, y: 38, text: 'Dig for loot. Digging deeper pays more and wakes trouble.' },
        boss:  { icon: '👑', label: 'Siegelord', x: 50, y: 12, text: 'The stage boss. Clearing it ends the stage.' }
    };
    const MAP_EDGES = [['camp', 'fight'], ['camp', 'event'], ['fight', 'elite'], ['fight', 'rest'], ['event', 'rest'], ['event', 'cache'], ['elite', 'boss'], ['rest', 'boss'], ['cache', 'boss']];

    function bindSiegeMap(panel) {
        const state = { at: 'camp', path: ['camp'] };
        const reachable = () => MAP_EDGES.filter(([a]) => a === state.at).map(([, b]) => b);

        panel.innerHTML = `
            <div class="sm-map" aria-label="Expedition map">
                <svg class="sm-roads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
                <div class="sm-nodes"></div>
            </div>
            <div class="placement-feedback sm-feedback" role="status" aria-live="polite"></div>
            <div class="sm-key" aria-hidden="true"><span class="is-current">You are here</span><span class="is-open">Open road</span><span class="is-locked">No road from here</span></div>
            <div class="mode-demo-actions"><button class="mode-demo-btn" type="button" data-sm-reset hidden>New expedition</button></div>`;

        const roads = panel.querySelector('.sm-roads');
        const nodes = panel.querySelector('.sm-nodes');
        const feedback = panel.querySelector('.sm-feedback');
        const reset = panel.querySelector('[data-sm-reset]');

        function render() {
            const open = reachable();
            const travelled = (a, b) => state.path.some((id, i) => id === a && state.path[i + 1] === b);
            roads.innerHTML = MAP_EDGES.map(([a, b]) => {
                const cls = travelled(a, b) ? 'is-travelled' : a === state.at ? 'is-open' : '';
                return `<line class="${cls}" x1="${MAP_NODES[a].x}" y1="${MAP_NODES[a].y}" x2="${MAP_NODES[b].x}" y2="${MAP_NODES[b].y}" vector-effect="non-scaling-stroke"/>`;
            }).join('');
            nodes.innerHTML = Object.keys(MAP_NODES).map((id) => {
                const n = MAP_NODES[id];
                const status = id === state.at ? 'current' : open.includes(id) ? 'open' : state.path.includes(id) ? 'cleared' : 'locked';
                const label = status === 'open' ? `Travel to ${n.label}` : status === 'current' ? `${n.label}, you are here` : `${n.label}, ${status === 'cleared' ? 'cleared' : 'not connected'}`;
                return `<button class="sm-node is-${status}${id === 'boss' ? ' is-boss' : ''}" type="button" data-sm-node="${id}" style="left:${n.x}%;top:${n.y}%" aria-label="${esc(label)}">
                    <span class="sm-node-icon" aria-hidden="true">${status === 'cleared' ? '✓' : n.icon}</span>
                    <span class="sm-node-label" aria-hidden="true">${esc(n.label)}</span>
                </button>`;
            }).join('');
            reset.hidden = state.at === 'camp';
        }

        nodes.addEventListener('click', (event) => {
            const button = event.target.closest('[data-sm-node]');
            if (!button) return;
            const id = button.dataset.smNode;
            const n = MAP_NODES[id];
            if (id === state.at) {
                feedback.innerHTML = `<strong>${esc(n.label)}.</strong> ${esc(n.text)}`;
                return;
            }
            if (!reachable().includes(id)) {
                feedback.innerHTML = state.path.includes(id)
                    ? `<strong>Already cleared.</strong> The march only goes forward.`
                    : `<strong>No road there.</strong> Pick a pulsing node joined to ${esc(MAP_NODES[state.at].label)}.`;
                return;
            }
            state.at = id;
            state.path.push(id);
            feedback.innerHTML = id === 'boss'
                ? `<strong>Siegelord ahead!</strong> ${esc(n.text)} Every road on this map led here.`
                : `<strong>${esc(n.label)}.</strong> ${esc(n.text)}`;
            render();
        });
        reset.addEventListener('click', () => {
            state.at = 'camp';
            state.path = ['camp'];
            feedback.innerHTML = `<strong>Camp.</strong> ${esc(MAP_NODES.camp.text)} Tap a pulsing node.`;
            render();
        });

        feedback.innerHTML = `<strong>Camp.</strong> ${esc(MAP_NODES.camp.text)} Tap a pulsing node.`;
        render();
    }

    // ── Dominion: knight ────────────────────────────────────────────────
    // Mirrors dominion.js's founding sheet: PORTRAITS, KNIGHT_TITLES, CALLINGS, CREST_EMBLEMS.
    const PORTRAITS = ['fire', 'ice', 'earth', 'wind', 'water', 'electric', 'metal', 'psychic', 'light', 'shadow'];
    const TITLES = ['', 'Ser', 'Dame', 'Lady', 'Lord', 'Sir', 'Knight'];
    const CALLINGS = {
        woodwarden: ['🪓', 'Woodwarden', 'Woodcutting & Carpentry'],
        forager: ['🌿', 'Forager', 'Foraging & Cooking'],
        delver: ['⛏️', 'Delver', 'Mining & Excavation'],
        smith: ['⚒️', 'Smith', 'Smelting & Smithing'],
        scholar: ['📚', 'Scholar', 'Elemental Studies & Runecrafting'],
        weaver: ['🧵', 'Weaver', 'Weaving & Alchemy']
    };
    const EMBLEMS = ['🌲', '🔥', '🌊', '⛰️', '⭐', '🌙', '🦁', '🛡️', '🐉', '🌸'];
    const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    function bindDominionKnight(panel) {
        const d = { portrait: 'fire', title: 'Ser', given: 'Aldric', calling: 'woodwarden', emblem: '🦁' };

        panel.innerHTML = `
            <div class="dk-preview">
                <figure class="dk-figure"><img class="dk-portrait" src="/img/dominion/knights/knight-fire.webp" alt="" decoding="async" loading="lazy"></figure>
                <div class="dk-id">
                    <span class="dk-crest" aria-hidden="true"><i></i></span>
                    <b class="dk-name"></b>
                    <span class="dk-calling"></span>
                    <small class="dk-bonus"></small>
                </div>
            </div>
            <div class="dk-controls">
                <label class="dk-field"><span>Name</span><input type="text" maxlength="20" autocomplete="off" spellcheck="false" value="${esc(d.given)}" aria-label="Knight name"></label>
                <div class="dk-row" role="group" aria-label="Title">${TITLES.map((t) => `<button type="button" class="dk-chip" data-dk="title:${esc(t)}">${t ? esc(t) : 'None'}</button>`).join('')}</div>
                <div class="dk-row dk-portraits" role="group" aria-label="Portrait">${PORTRAITS.map((el) => `<button type="button" class="dk-thumb" data-dk="portrait:${el}" style="--el:var(--element-${el})" aria-label="${titleCase(el)} portrait"><img src="/img/dominion/knights/knight-${el}-thumb.webp" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>
                <div class="dk-row dk-callings" role="group" aria-label="Calling">${Object.keys(CALLINGS).map((id) => `<button type="button" class="dk-chip is-calling" data-dk="calling:${id}"><span aria-hidden="true">${CALLINGS[id][0]}</span> ${esc(CALLINGS[id][1])}</button>`).join('')}</div>
                <div class="dk-row dk-emblems" role="group" aria-label="Crest insignia">${EMBLEMS.map((e) => `<button type="button" class="dk-chip is-emblem" data-dk="emblem:${e}" aria-label="Insignia ${e}">${e}</button>`).join('')}</div>
            </div>`;

        const img = panel.querySelector('.dk-portrait');
        const input = panel.querySelector('input');

        function render() {
            const call = CALLINGS[d.calling];
            const name = d.given.trim() || 'Your name';
            panel.style.setProperty('--knight-el', `var(--element-${d.portrait})`);
            img.src = `/img/dominion/knights/knight-${d.portrait}.webp`;
            panel.querySelector('.dk-crest i').textContent = d.emblem;
            panel.querySelector('.dk-name').textContent = (d.title ? d.title + ' ' : '') + name;
            panel.querySelector('.dk-calling').textContent = `${call[0]} ${call[1]} · ${titleCase(d.portrait)} crest`;
            panel.querySelector('.dk-bonus').textContent = `${call[2]} train 10% faster`;
            panel.querySelectorAll('[data-dk]').forEach((b) => {
                const [key, value] = b.dataset.dk.split(':');
                b.setAttribute('aria-pressed', String(d[key] === value));
            });
        }

        panel.addEventListener('click', (event) => {
            const button = event.target.closest('[data-dk]');
            if (!button) return;
            const [key, value] = button.dataset.dk.split(':');
            d[key] = value;
            render();
        });
        input.addEventListener('input', () => { d.given = input.value.slice(0, 20); render(); });
        render();
    }

    // ── Dominion: Keep workshops ────────────────────────────────────────
    // WS / WS_BUILD / RECIPES / PLOT_ORDER / links() from dominion.js, at
    // workshop level 1 (one notch). Build times are seconds here, not hours.
    const WORKSHOPS = {
        forge:   { name: 'Forge',   icon: '🔥', element: 'fire',  timber: 100, stone: 12, makes: 'Ember Ingots' },
        fridge:  { name: 'Fridge',  icon: '❄️', element: 'ice',   timber: 100, stone: 12, makes: 'Frost Crystals' },
        garden:  { name: 'Garden',  icon: '🌱', element: 'earth', timber: 40,  stone: 0,  makes: 'Flax & produce' },
        kitchen: { name: 'Kitchen', icon: '🍲', element: 'water', timber: 60,  stone: 0,  makes: 'Provisions' },
        quarry:  { name: 'Quarry',  icon: '⛏️', element: 'metal', timber: 80,  stone: 0,  makes: 'Stone' }
    };
    const RECIPES = [
        { pair: ['forge', 'fridge'], name: 'Tempered Glass', io: '2 Ember + 2 Frost → Glass' },
        { pair: ['garden', 'kitchen'], name: 'Hearth Rations', io: '2 Produce + Provisions → Rations' },
        { pair: ['fridge', 'kitchen'], name: 'Cold Preserves', io: '2 Produce + Frost → 3 Provisions' },
        { pair: ['quarry', 'garden'], name: 'Living Mortar', io: '4 Stone + 3 Flax → Mortar' }
    ];
    const PLOT_ORDER = [4, 3, 5, 1, 7, 0, 2, 6, 8];
    const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    const DIR_NAMES = ['north', 'east', 'south', 'west'];
    const START_STOCK = { timber: 300, stone: 30 };

    function keepLinks(grid) {
        const out = [];
        grid.forEach((c, i) => {
            if (!c || c.building) return;
            const r = Math.floor(i / 3), col = i % 3;
            const nr = r + DIRS[c.rot][0], nc = col + DIRS[c.rot][1];
            if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
            const j = nr * 3 + nc, o = grid[j];
            if (!o || o.building || j < i || o.rot !== (c.rot + 2) % 4) return;
            const recipe = RECIPES.find((rc) => rc.pair.includes(c.id) && rc.pair.includes(o.id)) || null;
            out.push({ a: i, b: j, recipe });
        });
        return out;
    }

    // New workshops face the centre so the first pair links on its own; the
    // centre faces the second plot in PLOT_ORDER. Linking a third means turning one.
    function faceCentre(plot) {
        if (plot === 4) return 3;
        const dr = 1 - Math.floor(plot / 3), dc = 1 - (plot % 3);
        if (dc !== 0) return dc > 0 ? 1 : 3;
        return dr > 0 ? 2 : 0;
    }

    function bindDominionKeep(panel) {
        const state = { grid: Array(9).fill(null), stock: { ...START_STOCK }, fresh: -1 };

        panel.innerHTML = `
            <div class="dkp-stock" aria-live="polite"></div>
            <div class="dkp-board">
                <div class="dkp-grid" aria-label="Keep plots"></div>
                <div class="dkp-links" aria-hidden="true"></div>
            </div>
            <div class="placement-feedback dkp-feedback" role="status" aria-live="polite"></div>
            <div class="dkp-tray" aria-label="Workshops to build"></div>
            <div class="mode-demo-actions"><button class="mode-demo-btn" type="button" data-dkp-reset hidden>Clear the grounds</button></div>`;

        const stockEl = panel.querySelector('.dkp-stock');
        const gridEl = panel.querySelector('.dkp-grid');
        const linksEl = panel.querySelector('.dkp-links');
        const feedback = panel.querySelector('.dkp-feedback');
        const tray = panel.querySelector('.dkp-tray');
        const reset = panel.querySelector('[data-dkp-reset]');
        const afford = (w) => state.stock.timber >= w.timber && state.stock.stone >= w.stone;

        function render() {
            stockEl.innerHTML = `<span>🪵 Timber <b>${state.stock.timber}</b></span><span>🪨 Stone <b>${state.stock.stone}</b></span>`;
            gridEl.innerHTML = state.grid.map((c, i) => {
                if (!c) return `<div class="dkp-plot is-empty" aria-label="Empty plot"></div>`;
                const w = WORKSHOPS[c.id];
                if (c.building) {
                    return `<div class="dkp-plot is-building" style="--el:var(--element-${w.element})" aria-label="${esc(w.name)} under construction">
                        <span class="dkp-icon" aria-hidden="true">⚒</span><span class="dkp-name">${esc(w.name)}</span><span class="dkp-bar"><i></i></span></div>`;
                }
                return `<button class="dkp-plot is-built${i === state.fresh ? ' is-new' : ''}" type="button" data-dkp-plot="${i}" style="--el:var(--element-${w.element})" aria-label="${esc(w.name)}, notch facing ${DIR_NAMES[c.rot]}. Tap to turn it.">
                    <span class="dkp-notch" data-dir="${c.rot}" style="background-image:url('/img/notches/notch-${w.element}.webp?v=2')" aria-hidden="true"></span>
                    <span class="dkp-icon" aria-hidden="true">${w.icon}</span><span class="dkp-name">${esc(w.name)}</span><span class="dkp-turn" aria-hidden="true">↻</span></button>`;
            }).join('');
            const links = keepLinks(state.grid);
            linksEl.innerHTML = links.map((l) => {
                const r = Math.floor(l.a / 3), c = l.a % 3;
                const across = l.b === l.a + 1;
                const x = across ? (c + 1) / 3 : (2 * c + 1) / 6;
                const y = across ? (2 * r + 1) / 6 : (r + 1) / 3;
                return `<span class="dkp-link${across ? ' is-across' : ' is-down'}${l.recipe ? ' has-recipe' : ''}" style="left:${(x * 100).toFixed(3)}%;top:${(y * 100).toFixed(3)}%"></span>`;
            }).join('');
            tray.innerHTML = Object.keys(WORKSHOPS).map((id) => {
                const w = WORKSHOPS[id];
                const built = state.grid.some((c) => c && c.id === id);
                const cost = `🪵${w.timber}${w.stone ? ` 🪨${w.stone}` : ''}`;
                return `<button class="dkp-build" type="button" data-dkp-build="${id}" style="--el:var(--element-${w.element})"${built ? ' disabled' : ''} aria-label="Build ${esc(w.name)}: ${w.timber} timber${w.stone ? `, ${w.stone} stone` : ''}">
                    <span class="dkp-build-icon" aria-hidden="true">${w.icon}</span><b>${esc(w.name)}</b><small>${built ? 'Built' : cost}</small></button>`;
            }).join('');
            reset.hidden = !state.grid.some(Boolean);
            return links;
        }

        function linkReport(links) {
            if (!links.length) return '';
            return links.map((l) => {
                const a = WORKSHOPS[state.grid[l.a].id].name, b = WORKSHOPS[state.grid[l.b].id].name;
                return l.recipe
                    ? `<strong>${esc(a)} ⇄ ${esc(b)} linked: ${esc(l.recipe.name)}.</strong> ${esc(l.recipe.io)}.`
                    : `<strong>${esc(a)} ⇄ ${esc(b)} linked.</strong> No shared recipe, though; try another neighbour.`;
            }).join(' ');
        }

        tray.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-dkp-build]');
            if (!button) return;
            const id = button.dataset.dkpBuild;
            const w = WORKSHOPS[id];
            if (!afford(w)) {
                feedback.innerHTML = `<strong>Not enough materials.</strong> The ${esc(w.name)} needs ${w.timber} Timber${w.stone ? ` and ${w.stone} Stone` : ''}. In the real Keep your Woodlot and Quarry keep earning while you're away.`;
                return;
            }
            const plot = PLOT_ORDER.find((i) => !state.grid[i]);
            if (plot == null) return;
            state.stock.timber -= w.timber;
            state.stock.stone -= w.stone;
            state.grid[plot] = { id, rot: faceCentre(plot), building: true };
            feedback.innerHTML = `<strong>Construction started.</strong> The crew raises the ${esc(w.name)} (hours in the Keep, a second here).`;
            render();
            await wait(1000);
            if (state.grid[plot]?.id !== id) return;
            state.grid[plot].building = false;
            state.fresh = plot;
            const links = render();
            state.fresh = -1;
            const mine = links.filter((l) => l.a === plot || l.b === plot);
            feedback.innerHTML = mine.length
                ? linkReport(mine)
                : `<strong>${esc(w.name)} built.</strong> It makes ${esc(w.makes)}. Tap a workshop to turn its notch toward a neighbour.`;
        });

        gridEl.addEventListener('click', (event) => {
            const button = event.target.closest('[data-dkp-plot]');
            if (!button) return;
            const plot = Number(button.dataset.dkpPlot);
            const c = state.grid[plot];
            c.rot = (c.rot + 1) % 4;
            const links = render();
            const mine = links.filter((l) => l.a === plot || l.b === plot);
            feedback.innerHTML = mine.length
                ? linkReport(mine)
                : `<strong>${esc(WORKSHOPS[c.id].name)} faces ${DIR_NAMES[c.rot]}.</strong> Links need two notches pointing at each other.`;
            gridEl.querySelector(`[data-dkp-plot="${plot}"]`)?.focus();
        });

        reset.addEventListener('click', () => {
            state.grid = Array(9).fill(null);
            state.stock = { ...START_STOCK };
            feedback.innerHTML = '<strong>Fresh grounds.</strong> Build a workshop; the first lands on the centre plot.';
            render();
        });

        feedback.innerHTML = '<strong>Build a workshop.</strong> Try the Forge, then the Fridge beside it.';
        render();
    }

    // The mode pane: Battle / Siege / Dominion pages. The pane's backdrop follows
    // the mode, and #siege or #dominion links open straight onto that page.
    function bindModePane() {
        const pane = document.getElementById('modes');
        if (!pane) return;
        const select = bindTabs(pane, (tab) => { pane.dataset.mode = tab.dataset.mode; });
        const fromHash = () => {
            const mode = String(window.location.hash || '').replace('#', '');
            const tab = pane.querySelector(`.modes-switch [data-mode="${mode}"]`);
            if (!tab) return;
            select(tab);
            pane.scrollIntoView({ block: 'start' });
        };
        window.addEventListener('hashchange', fromHash);
        fromHash();
    }

    function init() {
        bindModePane();
        const siege = document.getElementById('siegeDemo');
        const dominion = document.getElementById('dominionDemo');
        if (siege) {
            bindTabs(siege);
            bindSiegeAdvantage(document.getElementById('siegePanelAdvantage'));
            bindSiegeMap(document.getElementById('siegePanelMap'));
        }
        if (dominion) {
            bindTabs(dominion);
            bindDominionKnight(document.getElementById('dominionPanelKnight'));
            bindDominionKeep(document.getElementById('dominionPanelKeep'));
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
