/* Shared ⓘ help modals for the card dashboard assignment areas. */
(function () {
    'use strict';

    var overlay = document.getElementById('dashboardInfoOverlay');
    var titleEl = document.getElementById('dashboardInfoTitle');
    var bodyEl = document.getElementById('dashboardInfoBody');
    var closeBtn = document.getElementById('dashboardInfoClose');
    var topics = {};
    var siegeOutcomesCache = null;

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function table(rows, headers) {
        var head = (headers || ['Option', 'What it does']).map(function (h) {
            return '<th>' + escapeHtml(h) + '</th>';
        }).join('');
        return '<table class="dash-info-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function row(cells) {
        return '<tr>' + cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }

    function outcomeValueHint(code) {
        var hints = {
            GOLD: 'Value = gold granted.',
            PAY_GOLD: 'Value = gold cost. Ambush if the player cannot pay.',
            HEAL: 'Value = HP healed across the party.',
            SNEAK: 'Value = damage taken if the sneak fails (50% chance).',
            AMBUSH: 'No value needed — starts a normal battle.',
            AMBUSH_ELITE: 'No value needed — starts an elite battle.',
            ITEM_HEALTHCOST: 'Value = HP cost before receiving a random item.',
            BLEED_ITEM: 'Value = HP cost before receiving a random item.',
            RECRUIT_CHANCE: 'Value ignored — recruits if party has room, else grants an item.',
            SEARCH: 'Value ignored — random: item, gold, or ambush.',
            DIG_MAP: 'Value ignored — grants gold and a random item.',
            BLESS_SPEED: 'Value = gold cost. +1 speed to all Siegelings if affordable.',
            NOTHING: 'Value ignored — flavor text only.'
        };
        return hints[code] || '';
    }

    function siegeEventsHtml(outcomes) {
        var rows = (outcomes || []).map(function (o) {
            var hint = outcomeValueHint(o.code);
            return row([
                '<code>' + escapeHtml(o.code) + '</code>',
                escapeHtml(o.description) + (hint ? '<div class="dash-info-hint">' + escapeHtml(hint) + '</div>' : '')
            ]);
        }).join('');
        return '<p>When a player reaches an <strong>Event</strong> node, one event is chosen at random. Each choice uses an <strong>outcome</strong> code, optional <strong>value</strong>, and <strong>flavor</strong> text shown after the pick.</p>' +
            table(rows, ['Outcome', 'Effect']);
    }

    topics['siegling-moves'] = {
        title: 'Assigning Siegeling Moves',
        html: '<p>Each Siegeling stores up to <strong>five move ids</strong> — references into the Shared Abilities pool, not copies of move data.</p>' +
            '<p>Editing a shared ability updates every Siegeling that references that id. Use <strong>Add from pool</strong> to assign an existing move, or <strong>New move</strong> to draft one for this card (saved to the pool on publish).</p>' +
            table([
                row(['<strong>Passive moves</strong>', 'Apply automatically while the Siegeling is on the board.']),
                row(['<strong>Active moves</strong>', 'Appear in battle with an energy cost (0–6). Player chooses when to play them.']),
                row(['<strong>Move id</strong>', 'Stable key used for assignment. Renaming an id in the pool re-points every card that used the old id.'])
            ])
    };

    topics['siegling-notches'] = {
        title: 'Assigning Notches',
        html: '<p>Notches are the directional connection points around a Siegeling card frame. Toggle each direction on, then assign an <strong>element</strong> per active notch.</p>' +
            '<p>In battle, linked notches between adjacent cards drive combo reactions and element chains. Notches always render above custom card art.</p>' +
            table([
                row(['<strong>Direction</strong>', 'N / NE / E / SE / S / SW / W / NW around the card.']),
                row(['<strong>Element</strong>', 'The element assigned to that notch for combo matching.'])
            ])
    };

    topics['action-cards'] = {
        title: 'Strategy & Deception Cards',
        html: '<p><strong>Strategies</strong> (spells) are played from hand for an element + energy cost, often gated by combo size or reaction type.</p>' +
            '<p><strong>Deceptions</strong> (traps) sit in a hidden bucket and trigger when their condition is met.</p>' +
            table([
                row(['<strong>Play cost</strong>', 'Element + amount spent from your energy pool to cast.']),
                row(['<strong>Combo gate</strong>', 'Minimum linked notches or signature required before a Strategy can be played.']),
                row(['<strong>Trap bucket</strong>', 'Element stockpile that charges the deception; triggers when threshold is met.'])
            ])
    };

    topics['card-art'] = {
        title: 'Card Art Modes',
        html: '<p>Choose how custom art is composited onto the Siegeling frame in-game and in the binder.</p>' +
            table([
                row(['<strong>Replace art</strong>', 'Image stays inside the icon window on the frame.']),
                row(['<strong>Overlay art</strong>', 'Illustration extends behind the frame; notches stay on top.']),
                row(['<strong>Full card art</strong>', 'Complete hand-drawn card — skips the template entirely.']),
                row(['<strong>Default icon</strong>', 'Reverts to the generated element frame with no custom upload.'])
            ]) +
            '<p>Upload from a signed-in editor session to store art in cloud storage. Publish live changes to apply globally.</p>'
    };

    topics['deck-composition'] = {
        title: 'Premade Deck Assignment',
        html: '<p>A premade deck is a curated list of card ids shown in the loadout chooser. Assign cards from the catalog on the right; quantities stack when the same id is added twice.</p>' +
            table([
                row(['<strong>Recommended Trainer</strong>', 'Suggested Siegeknight pairing shown with this deck in the loadout UI.']),
                row(['<strong>Active toggle</strong>', 'Inactive decks are hidden from the live game until re-enabled.']),
                row(['<strong>Card ids</strong>', 'Must reference live Siegelings, Strategies, or Deceptions. Removed cards show as missing until you edit the list.'])
            ])
    };

    topics['trainer-abilities'] = {
        title: 'Siegeknight Abilities',
        html: '<p>Each Siegeknight has a <strong>passive</strong> (always on during a match) and an <strong>active</strong> (player-triggered, optionally once per game).</p>' +
            table([
                row(['<strong>Target type</strong>', 'Who the ability can affect — self, ally, enemy row, etc.']),
                row(['<strong>Effect type + value</strong>', 'Mechanical result (heal, damage boost, shield, etc.) and magnitude.']),
                row(['<strong>Required element / energy</strong>', 'Gate for when the passive applies or what the active costs.']),
                row(['<strong>Once per game</strong>', 'Active can only be fired once per match when checked.'])
            ]) +
            '<p>Siege mode uses a separate roguelike class assignment — see <strong>Siege Mode → Classes</strong>.</p>'
    };

    topics['trainer-art'] = {
        title: 'Siegeknight Art Modes',
        html: '<p><strong>Overlay art (keep frame)</strong> — recommended. Keeps the shared card frame and places your character illustration behind it.</p>' +
            '<p><strong>Full card art</strong> — replaces the entire template (e.g. Squire Bob). Use scale and drag in the preview to crop into the 5:7 card ratio.</p>' +
            '<p>Publish live changes after uploading so the hosted URL is available in-game.</p>'
    };

    topics['live-elements'] = {
        title: 'Live Element Roster',
        html: '<p>Toggle which elements are <strong>active</strong> in the live game. Turning an element off hides all content tied to it until you publish it back on.</p>' +
            table([
                row(['<strong>Siegelings</strong>', 'Hidden from deck builder, packs, and binder when their element is off.']),
                row(['<strong>Strategies / Deceptions</strong>', 'Filtered out of the live card pool.']),
                row(['<strong>Siegeknights</strong>', 'Matching-element knights hidden from loadout.']),
                row(['<strong>Premade decks</strong>', 'Decks using a disabled element are hidden.']),
                row(['<strong>Minimum</strong>', 'At least one element must remain active.'])
            ])
    };

    topics['moves-pool'] = {
        title: 'Shared Abilities Pool',
        html: '<p>Central definitions for Siegeling moves. Cards only store <strong>ids</strong> — editing here updates every assignment.</p>' +
            table([
                row(['<strong>Category</strong>', 'Standard, Speciality, or Utility — affects organization and filters.']),
                row(['<strong>Passive</strong>', 'Always-on board effect vs. activated battle move.']),
                row(['<strong>Energy cost</strong>', 'AP required to play an active move in battle (0 = free).']),
                row(['<strong>Used by</strong>', 'Lists Siegelings referencing this id; shown in the review panel.'])
            ])
    };

    topics['loading-art'] = {
        title: 'Loading Screen Art',
        html: '<p>Upload art pieces used on loading screens, the Art Gallery, and custom backgrounds.</p>' +
            table([
                row(['<strong>Piece name</strong>', 'Shared id for pairing files (e.g. <code>ember-hollow</code>).']),
                row(['<strong>Landscape</strong>', 'Wide image — <code>piece-landscape.png</code>']),
                row(['<strong>Portrait</strong>', 'Tall image — <code>piece-portrait.png</code>']),
                row(['<strong>Gallery entry</strong>', 'One name with both orientations becomes a single selectable piece.'])
            ])
    };

    topics['siege-classes'] = {
        title: 'Siege Roguelike Classes',
        html: '<p>Assign each SiegeKnight’s <strong>roguelike class</strong> for Siege expedition mode. Overrides the default hash-based class. Applies immediately to new runs.</p>' +
            table([
                row(['<strong>Bulwark</strong>', '+4 shield to each Siegeling at the start of every battle.']),
                row(['<strong>Warlord</strong>', '+2 attack to the party at battle start.']),
                row(['<strong>Vanguard</strong>', '+2 speed to each Siegeling at battle start.']),
                row(['<strong>Warden</strong>', '+8 max HP to each Siegeling for the whole expedition.']),
                row(['<strong>Quartermaster</strong>', '+40% gold from spoils and caches.']),
                row(['<strong>Marshal</strong>', 'Starts the run with an extra Siegeling in the warband.']),
                row(['<strong>Default</strong>', 'Uses the knight’s built-in hash assignment — no override.'])
            ])
    };

    topics['siege-items'] = {
        title: 'Siege Carryable Items',
        html: '<p>Items a Siegeling can equip (one per member) or consumables in the knight’s bag. Created items apply to new runs immediately.</p>' +
            table([
                row(['<strong>VITALITY</strong>', '+max HP while equipped (value = HP bonus).']),
                row(['<strong>ATTACK</strong>', '+attack applied at the start of each battle.']),
                row(['<strong>SPEED</strong>', '+speed applied at the start of each battle.']),
                row(['<strong>SHIELD</strong>', '+shield applied at the start of each battle.']),
                row(['<strong>REVIVE</strong>', 'Consumable — revives a fallen Siegeling.']),
                row(['<strong>HEAL</strong>', 'Consumable — restores HP to a target.'])
            ], ['Kind', 'Effect'])
    };

    topics['siege-events'] = {
        title: 'Event Choice Outcomes',
        html: '<p class="dash-info-loading">Loading outcome reference…</p>',
        dynamic: true
    };

    function close() {
        if (overlay) overlay.classList.add('hidden');
    }

    function open(topic) {
        var def = topics[topic];
        if (!def || !overlay || !titleEl || !bodyEl) return;

        titleEl.textContent = def.title || 'Help';

        if (def.dynamic && topic === 'siege-events') {
            bodyEl.innerHTML = '<p class="dash-info-loading">Loading outcome reference…</p>';
            overlay.classList.remove('hidden');
            var render = function (outcomes) {
                bodyEl.innerHTML = siegeEventsHtml(outcomes);
            };
            if (siegeOutcomesCache) {
                render(siegeOutcomesCache);
                return;
            }
            fetch('/api/siege/events').then(function (r) { return r.json(); }).then(function (data) {
                siegeOutcomesCache = (data && data.outcomes) || [];
                render(siegeOutcomesCache);
            }).catch(function () {
                bodyEl.innerHTML = '<p>Could not load event outcomes. Check that the server is running.</p>';
            });
            return;
        }

        bodyEl.innerHTML = def.html || '';
        overlay.classList.remove('hidden');
    }

    function onClick(e) {
        var btn = e.target.closest('[data-info-topic]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        open(btn.getAttribute('data-info-topic'));
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) close();
    });
    document.addEventListener('click', onClick);

    window.DashboardInfo = { open: open, close: close };
})();
