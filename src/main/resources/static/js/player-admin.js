/* Registered-player admin panel for the card dashboard.
 * Lists accountUsers, loads each player's progression, and lets an authenticated
 * editor patch gold / remnants / warmarks, owned cards, unlock lists, and display name.
 * Editor fields are grouped into collapsible sections (same details pattern as Siege Mode). */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var SECTION_STATE_KEY = 'sieglingsPlayerAdminSections';
    var host = document.getElementById('playerAdminPanel');
    var listHost = document.getElementById('playerList');
    var searchInput = document.getElementById('playerSearchInput');
    var reloadBtn = document.getElementById('reloadPlayersBtn');
    var titleEl = document.getElementById('playerEditorTitle');
    if (!host || !listHost) return;

    var players = [];
    var selectedId = null;
    var detail = null;
    var search = '';
    var listStatus = '';

    // Defaults: account + currency open; heavier list editors stay collapsed.
    var DEFAULT_OPEN = {
        account: true,
        currency: true,
        collection: false,
        trainers: false,
        shop: false,
        siege: false,
        finishes: false,
        battlegrounds: false
    };

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }
    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function status(message, tone) {
        var node = document.getElementById('playerAdminStatus');
        if (!node) return;
        node.textContent = message || '';
        node.className = 'siege-class-status' + (tone ? ' tone-' + tone : '');
    }
    function mapToText(map) {
        if (!map) return '';
        return Object.keys(map).map(function (key) {
            return key + ' ' + map[key];
        }).join('\n');
    }
    function listToText(list) {
        return (list || []).join('\n');
    }
    function readInt(id, fallback) {
        var node = document.getElementById(id);
        if (!node) return fallback;
        var parsed = parseInt(node.value, 10);
        return isNaN(parsed) ? fallback : parsed;
    }
    function readChecked(id) {
        var node = document.getElementById(id);
        return !!(node && node.checked);
    }
    function readText(id) {
        var node = document.getElementById(id);
        return node ? String(node.value || '') : '';
    }

    function loadSectionState() {
        try {
            var raw = window.localStorage.getItem(SECTION_STATE_KEY);
            if (!raw) return Object.assign({}, DEFAULT_OPEN);
            return Object.assign({}, DEFAULT_OPEN, JSON.parse(raw) || {});
        } catch (e) {
            return Object.assign({}, DEFAULT_OPEN);
        }
    }
    function saveSectionState(state) {
        try {
            window.localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(state));
        } catch (e) { /* best-effort */ }
    }
    function readOpenFromDom() {
        var state = loadSectionState();
        host.querySelectorAll('details.player-admin-section[data-section]').forEach(function (node) {
            state[node.getAttribute('data-section')] = !!node.open;
        });
        return state;
    }
    function setAllSections(open) {
        var state = loadSectionState();
        Object.keys(DEFAULT_OPEN).forEach(function (key) { state[key] = open; });
        saveSectionState(state);
        host.querySelectorAll('details.player-admin-section[data-section]').forEach(function (node) {
            node.open = open;
        });
    }

    function section(id, title, hint, bodyHtml, openMap) {
        var isOpen = !!openMap[id];
        return '<details class="siege-collapse-section player-admin-section" data-section="' +
            escapeHtml(id) + '"' + (isOpen ? ' open' : '') + '>' +
            '<summary class="siege-collapse-summary">' +
            '<span class="siege-collapse-title">' + escapeHtml(title) + '</span>' +
            '<span class="siege-collapse-hint">' + escapeHtml(hint) + '</span>' +
            '</summary>' +
            '<div class="siege-collapse-body">' +
            '<div class="form-grid player-admin-form">' + bodyHtml + '</div>' +
            '</div>' +
            '</details>';
    }

    function filteredPlayers() {
        var q = String(search || '').trim().toLowerCase();
        if (!q) return players.slice();
        return players.filter(function (row) {
            return String(row.displayName || '').toLowerCase().indexOf(q) >= 0
                || String(row.email || '').toLowerCase().indexOf(q) >= 0
                || String(row.id || '').toLowerCase().indexOf(q) >= 0;
        });
    }

    function renderList() {
        var rows = filteredPlayers();
        if (listStatus) {
            listHost.innerHTML = '<div class="empty-browser">' + escapeHtml(listStatus) + '</div>';
            return;
        }
        if (!rows.length) {
            listHost.innerHTML = '<div class="empty-browser">' +
                (players.length ? 'No players match the search.' : 'No registered accounts found.') +
                '</div>';
            return;
        }
        listHost.innerHTML = rows.map(function (row) {
            var active = row.id === selectedId ? ' active' : '';
            return '<button type="button" class="card-row player-row' + active + '" data-player-id="' +
                escapeHtml(row.id) + '">' +
                '<div class="card-row-title">' +
                '<strong>' + escapeHtml(row.displayName || row.email || row.id) + '</strong>' +
                '<span class="summary-badge">' + escapeHtml(String(row.gold || 0)) + ' coins · ' +
                escapeHtml(String(row.uniqueOwned || 0)) + ' cards</span>' +
                '</div>' +
                '<div class="card-meta">' + escapeHtml(row.email || row.id) + '</div>' +
                '</button>';
        }).join('');
        listHost.querySelectorAll('[data-player-id]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                selectPlayer(btn.getAttribute('data-player-id'));
            });
        });
    }

    function renderEditor() {
        if (!selectedId) {
            if (titleEl) titleEl.textContent = 'Player';
            host.innerHTML = '<div class="empty-state">Select a registered account on the left. ' +
                'Editor sign-in is required to load or change player data.</div>';
            return;
        }
        if (!detail) {
            if (titleEl) titleEl.textContent = selectedId;
            host.innerHTML = '<div class="empty-state">Loading player…</div>';
            return;
        }
        var account = detail.account || {};
        var progression = detail.progression || {};
        var openMap = loadSectionState();
        if (titleEl) titleEl.textContent = account.displayName || account.email || selectedId;

        var ownedCount = Object.keys(progression.ownedCards || {}).length;
        var trainerCount = Object.keys(progression.trainerLevels || {}).length;

        host.innerHTML =
            '<p class="siege-class-note">Manual edits write straight to Firestore progression for this account. ' +
            'Owned cards use one <code>cardId count</code> line each. Id lists are one id per line (or comma-separated).</p>' +
            '<div class="player-admin-meta">' +
            '<div><span class="section-kicker">Email</span><strong>' + escapeHtml(account.email || '') + '</strong></div>' +
            '<div><span class="section-kicker">Created</span><strong>' + escapeHtml(account.createdAt || '—') + '</strong></div>' +
            '<div><span class="section-kicker">Updated</span><strong>' + escapeHtml(progression.updatedAt || '—') + '</strong></div>' +
            '</div>' +
            '<div class="inline-actions player-admin-section-tools">' +
            '<button class="btn btn-secondary" id="playerExpandAllBtn" type="button">Expand All</button>' +
            '<button class="btn btn-secondary" id="playerCollapseAllBtn" type="button">Collapse All</button>' +
            '</div>' +
            '<div class="player-admin-sections">' +
            section('account', 'Account', 'Name, starter, tutorials',
                field('Display name', '<input id="playerDisplayName" type="text" maxlength="40" value="' + escapeHtml(account.displayName || '') + '">') +
                field('Starter pack id', '<input id="playerStarterPack" type="text" value="' + escapeHtml(progression.starterPackId || '') + '">') +
                checkField('Arena tutorial completed', 'playerTutorial', !!progression.tutorialCompleted) +
                checkField('Siege tutorial completed', 'playerSiegeTutorial', !!progression.siegeTutorialCompleted),
                openMap) +
            section('currency', 'Currency & Streaks',
                escapeHtml(String(progression.gold || 0)) + ' coins',
                field('Siegecoins (gold)', '<input id="playerGold" type="number" min="0" max="100000000" value="' + escapeHtml(progression.gold || 0) + '">') +
                field('Remnants', '<input id="playerRemnants" type="number" min="0" max="100000000" value="' + escapeHtml(progression.remnants || 0) + '">') +
                field('Warmarks', '<input id="playerWarmarks" type="number" min="0" max="100000000" value="' + escapeHtml(progression.warmarks || 0) + '">') +
                field('Battlegrounds tier', '<input id="playerBgTier" type="number" min="0" max="99" value="' + escapeHtml(progression.battlegroundsTier || 0) + '">') +
                field('Solo win streak', '<input id="playerSoloStreak" type="number" min="0" value="' + escapeHtml(progression.soloWinStreak || 0) + '">') +
                field('Online win streak', '<input id="playerOnlineStreak" type="number" min="0" value="' + escapeHtml(progression.onlineWinStreak || 0) + '">') +
                field('Craft count', '<input id="playerCraftCount" type="number" min="0" value="' + escapeHtml(progression.craftCount || 0) + '">'),
                openMap) +
            section('collection', 'Collection', ownedCount + ' unique card ids',
                fieldFull('Owned cards', '<textarea id="playerOwnedCards" rows="8" spellcheck="false">' + escapeHtml(mapToText(progression.ownedCards)) + '</textarea>'),
                openMap) +
            section('trainers', 'Siegeknights', trainerCount + ' owned',
                fieldFull('Trainer levels', '<textarea id="playerTrainerLevels" rows="4" spellcheck="false">' + escapeHtml(mapToText(progression.trainerLevels)) + '</textarea>') +
                fieldFull('Trainer points', '<textarea id="playerTrainerPoints" rows="4" spellcheck="false">' + escapeHtml(mapToText(progression.trainerPoints)) + '</textarea>'),
                openMap) +
            section('shop', 'Shop Unlocks', 'Decks, titles, battlefields',
                fieldFull('Purchased deck ids', '<textarea id="playerPurchasedDecks" rows="3" spellcheck="false">' + escapeHtml(listToText(progression.purchasedDeckIds)) + '</textarea>') +
                fieldFull('Purchased title ids', '<textarea id="playerPurchasedTitles" rows="3" spellcheck="false">' + escapeHtml(listToText(progression.purchasedTitleIds)) + '</textarea>') +
                fieldFull('Battlefield skin ids', '<textarea id="playerBattlefieldSkins" rows="3" spellcheck="false">' + escapeHtml(listToText(progression.purchasedBattlefieldSkinIds)) + '</textarea>') +
                field('Equipped battlefield skin', '<input id="playerEquippedSkin" type="text" value="' + escapeHtml(progression.equippedBattlefieldSkinId || '') + '">'),
                openMap) +
            section('siege', 'Siege Unlocks', 'Expedition roster',
                fieldFull('Siege unlocked knights', '<textarea id="playerSiegeKnights" rows="3" spellcheck="false">' + escapeHtml(listToText(progression.siegeUnlockedKnights)) + '</textarea>') +
                fieldFull('Siege unlocked Siegelings', '<textarea id="playerSiegeSieglings" rows="3" spellcheck="false">' + escapeHtml(listToText(progression.siegeUnlockedSieglings)) + '</textarea>'),
                openMap) +
            section('finishes', 'Card Finishes', 'Holo / gold tiers',
                fieldFull('Holo flair card ids', '<textarea id="playerHoloFlair" rows="2" spellcheck="false">' + escapeHtml(listToText(progression.holographicCardIds)) + '</textarea>') +
                fieldFull('Holo art card ids', '<textarea id="playerHoloArt" rows="2" spellcheck="false">' + escapeHtml(listToText(progression.holoArtCardIds)) + '</textarea>') +
                fieldFull('Plain holo card ids', '<textarea id="playerPlainHolo" rows="2" spellcheck="false">' + escapeHtml(listToText(progression.plainHoloCardIds)) + '</textarea>') +
                fieldFull('Gold card ids', '<textarea id="playerGoldCards" rows="2" spellcheck="false">' + escapeHtml(listToText(progression.goldCardIds)) + '</textarea>') +
                fieldFull('Holo gold card ids', '<textarea id="playerHoloGold" rows="2" spellcheck="false">' + escapeHtml(listToText(progression.holoGoldCardIds)) + '</textarea>'),
                openMap) +
            section('battlegrounds', 'Battlegrounds', 'Warmark unlocks',
                fieldFull('Battlegrounds unlocks', '<textarea id="playerBgUnlocks" rows="2" spellcheck="false">' + escapeHtml(listToText(progression.battlegroundsUnlocks)) + '</textarea>'),
                openMap) +
            '</div>' +
            '<div class="inline-actions player-admin-actions">' +
            '<button class="btn btn-primary" id="playerSaveBtn" type="button">Save Player Changes</button>' +
            '<button class="btn btn-secondary" id="playerReloadDetailBtn" type="button">Reload Detail</button>' +
            '<span id="playerAdminStatus" class="siege-class-status"></span>' +
            '</div>';

        host.querySelectorAll('details.player-admin-section').forEach(function (node) {
            node.addEventListener('toggle', function () {
                saveSectionState(readOpenFromDom());
            });
        });
        var expandBtn = document.getElementById('playerExpandAllBtn');
        var collapseBtn = document.getElementById('playerCollapseAllBtn');
        if (expandBtn) expandBtn.addEventListener('click', function () { setAllSections(true); });
        if (collapseBtn) collapseBtn.addEventListener('click', function () { setAllSections(false); });
        var saveBtn = document.getElementById('playerSaveBtn');
        var reloadDetailBtn = document.getElementById('playerReloadDetailBtn');
        if (saveBtn) saveBtn.addEventListener('click', savePlayer);
        if (reloadDetailBtn) reloadDetailBtn.addEventListener('click', function () { selectPlayer(selectedId); });
    }

    function field(label, controlHtml) {
        return '<label><span>' + escapeHtml(label) + '</span>' + controlHtml + '</label>';
    }
    function fieldFull(label, controlHtml) {
        return '<label class="full-width"><span>' + escapeHtml(label) + '</span>' + controlHtml + '</label>';
    }
    function checkField(label, id, checked) {
        return '<label class="player-admin-check"><span>' + escapeHtml(label) + '</span>' +
            '<input id="' + id + '" type="checkbox"' + (checked ? ' checked' : '') + '></label>';
    }

    function parseOwnedText(text) {
        var out = {};
        String(text || '').split(/[\n,]+/).forEach(function (line) {
            var trimmed = line.trim();
            if (!trimmed) return;
            var parts = trimmed.split(/[\s:=]+/).filter(Boolean);
            if (parts.length < 2) return;
            var count = parseInt(parts[1], 10);
            if (!isNaN(count) && count > 0) out[parts[0]] = count;
        });
        return out;
    }
    function parseMapText(text) {
        var out = {};
        String(text || '').split(/[\n,]+/).forEach(function (line) {
            var trimmed = line.trim();
            if (!trimmed) return;
            var parts = trimmed.split(/[\s:=]+/).filter(Boolean);
            if (parts.length < 2) return;
            var count = parseInt(parts[1], 10);
            if (!isNaN(count) && count >= 0) out[parts[0]] = count;
        });
        return out;
    }
    function parseListText(text) {
        var out = [];
        String(text || '').split(/[\n,]+/).forEach(function (chunk) {
            var id = chunk.trim();
            if (id && out.indexOf(id) < 0) out.push(id);
        });
        return out;
    }

    function savePlayer() {
        if (!selectedId) return;
        // Persist open/closed before re-render so the editor stays where the user left it.
        saveSectionState(readOpenFromDom());
        status('Saving…');
        var body = {
            displayName: readText('playerDisplayName').trim(),
            gold: readInt('playerGold', 0),
            remnants: readInt('playerRemnants', 0),
            warmarks: readInt('playerWarmarks', 0),
            battlegroundsTier: readInt('playerBgTier', 0),
            starterPackId: readText('playerStarterPack').trim(),
            tutorialCompleted: readChecked('playerTutorial'),
            siegeTutorialCompleted: readChecked('playerSiegeTutorial'),
            soloWinStreak: readInt('playerSoloStreak', 0),
            onlineWinStreak: readInt('playerOnlineStreak', 0),
            craftCount: readInt('playerCraftCount', 0),
            ownedCards: parseOwnedText(readText('playerOwnedCards')),
            trainerLevels: parseMapText(readText('playerTrainerLevels')),
            trainerPoints: parseMapText(readText('playerTrainerPoints')),
            purchasedDeckIds: parseListText(readText('playerPurchasedDecks')),
            purchasedTitleIds: parseListText(readText('playerPurchasedTitles')),
            purchasedBattlefieldSkinIds: parseListText(readText('playerBattlefieldSkins')),
            equippedBattlefieldSkinId: readText('playerEquippedSkin').trim(),
            siegeUnlockedKnights: parseListText(readText('playerSiegeKnights')),
            siegeUnlockedSieglings: parseListText(readText('playerSiegeSieglings')),
            holographicCardIds: parseListText(readText('playerHoloFlair')),
            holoArtCardIds: parseListText(readText('playerHoloArt')),
            plainHoloCardIds: parseListText(readText('playerPlainHolo')),
            goldCardIds: parseListText(readText('playerGoldCards')),
            holoGoldCardIds: parseListText(readText('playerHoloGold')),
            battlegroundsUnlocks: parseListText(readText('playerBgUnlocks'))
        };
        fetch('/api/players/admin/' + encodeURIComponent(selectedId), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Card-Editor-Token': editorToken()
            },
            body: JSON.stringify(body)
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) {
                    throw new Error((data && data.error) || ('Save failed (' + response.status + ')'));
                }
                detail = data;
                var savedAccount = data.account || {};
                var savedProgression = data.progression || {};
                players = players.map(function (row) {
                    if (row.id !== selectedId) return row;
                    return Object.assign({}, row, {
                        displayName: savedAccount.displayName,
                        email: savedAccount.email,
                        gold: savedProgression.gold || 0,
                        remnants: savedProgression.remnants || 0,
                        warmarks: savedProgression.warmarks || 0,
                        ownedCardCount: savedProgression.ownedTotal || 0,
                        uniqueOwned: savedProgression.uniqueOwned || 0,
                        starterChosen: !!savedProgression.starterChosen
                    });
                });
                renderList();
                renderEditor();
                status('Saved', 'success');
                setTimeout(function () { status(''); }, 1600);
            });
        }).catch(function (error) {
            status(error.message || 'Save failed', 'error');
        });
    }

    function selectPlayer(userId) {
        selectedId = userId;
        detail = null;
        renderList();
        renderEditor();
        if (!userId) return;
        fetch('/api/players/admin/' + encodeURIComponent(userId), {
            headers: { 'X-Card-Editor-Token': editorToken() }
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) {
                    throw new Error((data && data.error) || ('Load failed (' + response.status + ')'));
                }
                if (selectedId !== userId) return;
                detail = data;
                renderEditor();
            });
        }).catch(function (error) {
            if (selectedId !== userId) return;
            host.innerHTML = '<div class="empty-state tone-error">' + escapeHtml(error.message || 'Load failed') + '</div>';
        });
    }

    function loadPlayers() {
        listStatus = 'Loading players…';
        renderList();
        fetch('/api/players/admin', {
            headers: { 'X-Card-Editor-Token': editorToken() }
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) {
                    throw new Error((data && data.error) || ('Load failed (' + response.status + ')'));
                }
                listStatus = '';
                players = data.players || [];
                if (selectedId && !players.some(function (row) { return row.id === selectedId; })) {
                    selectedId = null;
                    detail = null;
                }
                renderList();
                renderEditor();
            });
        }).catch(function (error) {
            listStatus = error.message || 'Unable to load players.';
            players = [];
            renderList();
            renderEditor();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            search = searchInput.value || '';
            renderList();
        });
    }
    if (reloadBtn) reloadBtn.addEventListener('click', loadPlayers);

    window.SiegelingsPlayerAdmin = {
        refresh: loadPlayers,
        isReady: function () { return true; }
    };

    renderEditor();
})();
