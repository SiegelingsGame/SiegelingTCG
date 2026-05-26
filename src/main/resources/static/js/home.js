(function () {
    const AUTH_TOKEN_KEY = 'sieglingsAuthToken';
    const PENDING_LOADOUT_KEY = 'sieglingsPendingLoadout';
    const ELEMENT_COLORS = {
        FIRE: '#f05b2f', EARTH: '#a7773d', WIND: '#64c987', WATER: '#3c8ed8', ICE: '#7ad9e7',
        SHADOW: '#6d4a9e', ELECTRIC: '#f5cf3d', METAL: '#aeb5b8', UNDEAD: '#9f7c73', PSYCHIC: '#db73b4'
    };
    const RARITY_ORDER = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5 };

    const state = {
        route: 'home',
        token: localStorage.getItem(AUTH_TOKEN_KEY) || '',
        profile: null,
        progression: null,
        options: null,
        packs: [],
        rooms: [],
        selectedCardId: null,
        search: '',
        elementFilter: 'ALL',
        typeFilter: 'ALL',
        rarityFilter: 'ALL',
        sort: 'owned-desc',
        builderCounts: {},
        filterTrayOpen: false,
        cardTrayOpen: false,
        authOpen: false
    };

    window.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindEvents();
        state.route = routeFromPath(location.pathname);
        setActiveRoute();
        renderSections();
        renderHudTools();
        renderGold();
        renderHomeDashboard();
        renderProfile();
        await loadAll();
        render();
    }

    function bindEvents() {
        document.getElementById('cardSearchInput')?.addEventListener('input', (event) => {
            state.search = event.target.value.trim().toLowerCase();
            renderCards();
        });
        document.getElementById('cardSortSelect')?.addEventListener('change', (event) => {
            state.sort = event.target.value;
            renderCards();
        });
        document.getElementById('playNowBtn')?.addEventListener('click', () => goPlay({ mode: 'solo' }));
        document.getElementById('startPveBtn')?.addEventListener('click', () => goPlay({ mode: 'solo' }));
        document.getElementById('createLobbyBtn')?.addEventListener('click', createLobbyFromHome);
        document.getElementById('shopShortcutBtn')?.addEventListener('click', () => navigateHub('shop'));
        document.getElementById('joinByCodeBtn')?.addEventListener('click', () => navigateHub('lobbies'));
        document.getElementById('joinRoomBtn')?.addEventListener('click', joinRoomFromHome);
        document.getElementById('refreshRoomsBtn')?.addEventListener('click', refreshRooms);
        document.getElementById('saveCustomDeckBtn')?.addEventListener('click', saveCustomDeck);
        document.getElementById('filterTrayBtn')?.addEventListener('click', () => toggleTray('filter'));
        document.getElementById('cardTrayBtn')?.addEventListener('click', () => toggleTray('card'));
        document.getElementById('trayBackdrop')?.addEventListener('click', closeTrays);
        document.getElementById('authHudBtn')?.addEventListener('click', openAuth);
        document.getElementById('closeAuthBtn')?.addEventListener('click', closeAuth);
        document.querySelectorAll('[data-home-focus]').forEach((btn) => {
            btn.addEventListener('click', () => navigateHub(btn.dataset.homeFocus === 'matches' ? 'lobbies' : btn.dataset.homeFocus === 'builder' ? 'decks' : 'home'));
        });
        window.addEventListener('popstate', () => {
            state.route = routeFromPath(location.pathname);
            setActiveRoute();
            renderSections();
        });
    }

    async function loadAll() {
        const [options, packs, profile] = await Promise.all([
            fetchJson('/api/game/options'),
            fetchJson('/api/shop/packs'),
            syncProfile()
        ]);
        state.options = options || { decks: [], trainers: [], cardCatalog: [], liveElements: [] };
        state.packs = packs?.packs || [];
        if (!state.selectedCardId) {
            state.selectedCardId = state.options.cardCatalog?.[0]?.id || null;
        }
        await refreshRooms();
    }

    async function syncProfile() {
        if (!state.token) {
            state.profile = null;
            state.progression = null;
            return null;
        }
        const data = await fetchJson('/api/auth/me');
        if (!data?.authenticated) {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            state.token = '';
            state.profile = null;
            state.progression = null;
            return null;
        }
        state.profile = data;
        state.progression = data.progression || null;
        return data;
    }

    async function refreshRooms() {
        const data = await fetchJson('/api/match/rooms');
        state.rooms = data?.rooms || [];
        renderRooms();
    }

    function render() {
        safeRender(renderFilters);
        safeRender(renderProfileMini);
        safeRender(renderSections);
        safeRender(renderStarterGate);
        safeRender(renderCards);
        safeRender(renderDecks);
        safeRender(renderHomeDashboard);
        safeRender(renderShop);
        safeRender(renderProfile);
        safeRender(renderRooms);
        safeRender(renderGold);
        safeRender(renderHudTools);
        safeRender(renderAuthModal);
    }

    function safeRender(fn) {
        try {
            fn();
        } catch (error) {
            console.error(error);
        }
    }

    function renderStarterGate() {
        const gate = document.getElementById('starterGate');
        const hub = document.getElementById('hubGrid');
        const mustChoose = Boolean(state.profile?.authenticated && state.progression && !state.progression.starterChosen);
        gate.classList.toggle('hidden', !mustChoose);
        hub.classList.toggle('hidden', mustChoose);
        const grid = document.getElementById('starterPackGrid');
        if (!grid) return;
        grid.innerHTML = state.packs.filter(pack => pack.starterEligible).map(renderPackTile).join('');
    }

    function renderSections() {
        ['home', 'cards', 'decks', 'lobbies', 'profile', 'shop'].forEach((route) => {
            document.getElementById(`${route}Section`)?.classList.toggle('hidden', state.route !== route);
        });
        if (!isBinderRoute()) {
            state.filterTrayOpen = false;
            state.cardTrayOpen = false;
        }
        renderHudTools();
    }

    function renderFilters() {
        renderFilter('elementFilters', ['ALL', ...(state.options?.liveElements || [])], state.elementFilter, (value) => {
            state.elementFilter = value;
            renderFilters();
            renderCards();
        });
        renderFilter('typeFilters', ['ALL', 'SIEGLING', 'SPELL', 'TRAP'], state.typeFilter, (value) => {
            state.typeFilter = value;
            renderFilters();
            renderCards();
        });
        renderFilter('rarityFilters', ['ALL', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'], state.rarityFilter, (value) => {
            state.rarityFilter = value;
            renderFilters();
            renderCards();
        });
    }

    function renderFilter(id, values, active, onPick) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = values.map(value => {
            const isActive = value === active;
            return `<button class="chip${isActive ? ' active' : ''}" type="button" data-value="${escapeAttr(value)}" aria-pressed="${isActive}">${format(value)}</button>`;
        }).join('');
        el.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => onPick(btn.dataset.value)));
    }

    function renderCards() {
        const cards = filteredCards();
        const grids = [
            ['allCardGrid', cards]
        ];
        grids.forEach(([id, list]) => {
            const grid = document.getElementById(id);
            if (!grid) return;
            grid.innerHTML = list.map(renderCardTile).join('');
            grid.querySelectorAll('[data-card-id]').forEach(tile => tile.addEventListener('click', () => {
                state.selectedCardId = tile.dataset.cardId;
                openCardTray();
                renderCards();
                renderDetail();
            }));
        });
        const allCount = document.getElementById('allCardCount');
        if (allCount) allCount.textContent = `${cards.length} cards`;
        renderDetail();
        renderUnlock();
    }

    function filteredCards() {
        const cards = [...(state.options?.cardCatalog || [])].filter(card => {
            if (state.elementFilter !== 'ALL' && card.element !== state.elementFilter) return false;
            if (state.typeFilter !== 'ALL' && card.type !== state.typeFilter) return false;
            if (state.rarityFilter !== 'ALL' && card.rarity !== state.rarityFilter) return false;
            if (state.search) {
                const text = JSON.stringify(card).toLowerCase();
                if (!text.includes(state.search)) return false;
            }
            return true;
        });
        return cards.sort((a, b) => {
            if (state.sort === 'name-asc') return a.name.localeCompare(b.name);
            if (state.sort === 'speed-desc') return (b.speed || 0) - (a.speed || 0);
            if (state.sort === 'health-desc') return (b.health || 0) - (a.health || 0);
            if (state.sort === 'rarity-desc') return (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
            return ownedCount(b.id) - ownedCount(a.id) || a.name.localeCompare(b.name);
        });
    }

    function renderCardTile(card) {
        const selected = card.id === state.selectedCardId ? ' selected' : '';
        const owned = ownedCount(card.id);
        return `<button class="card-tile${selected}" type="button" data-card-id="${escapeAttr(card.id)}">
            <div class="art" style="--el:${elementColor(card.element)}"></div>
            <div><strong>${escapeHtml(card.name)}</strong><span>${format(card.element)} / ${format(card.rarity)} / ${owned ? `Owned x${owned}` : 'Unowned'}</span></div>
        </button>`;
    }

    function renderDetail() {
        const panel = document.getElementById('detailPanel');
        const card = selectedCard();
        if (!panel) return;
        if (!card) {
            panel.innerHTML = '<div class="unlock-card"><strong>Card details loading</strong><span>Select a card from Cards or Decks to inspect art, abilities, notches, and energy costs.</span></div>';
            return;
        }
        const abilities = card.abilities || (card.ability ? [card.ability] : []);
        panel.innerHTML = `
            <div class="detail-art art" style="--el:${elementColor(card.element)}"></div>
            <span class="eyebrow">${format(card.type)} / ${format(card.element)}</span>
            <h2>${escapeHtml(card.name)}</h2>
            <div class="chip-wrap">
                <span class="chip">Owned x${ownedCount(card.id)}</span>
                <span class="chip">${format(card.rarity)}</span>
                ${card.notches ? card.notches.map(n => `<span class="chip">${format(n.direction)} ${format(n.element)}</span>`).join('') : ''}
            </div>
            <div class="detail-grid">
                <div><span>Health</span><strong>${card.health ?? '-'}</strong></div>
                <div><span>Speed</span><strong>${card.speed ?? '-'}</strong></div>
                <div><span>Row</span><strong>${format(card.preferredRow || '-')}</strong></div>
                <div><span>Cost</span><strong>${card.costAmount ?? 0} ${format(card.costElement || card.element)}</strong></div>
                <div><span>Evolution</span><strong>${escapeHtml(card.evolvesFromName || card.evolvesFromId || 'Base')}</strong></div>
                <div><span>Reaction</span><strong>${format(card.requiredReaction || 'None')}</strong></div>
            </div>
            <h3>Abilities</h3>
            ${abilities.length ? abilities.map(a => `<p><strong>${escapeHtml(a.name || 'Ability')}</strong><br>${escapeHtml(a.description || '')}</p>`).join('') : '<p>No printed ability.</p>'}
            <button class="primary-btn" type="button" id="addSelectedToBuilder">Add to Custom Deck</button>
        `;
        document.getElementById('addSelectedToBuilder')?.addEventListener('click', () => adjustBuilder(card.id, 1));
    }

    function renderHomeDashboard() {
        const el = document.getElementById('homeDashboard');
        if (!el) return;
        const ownedTotal = state.progression?.ownedTotal || 0;
        const recentRooms = state.rooms.slice(0, 3);
        const featuredPacks = state.packs.slice(0, 3);
        const customState = state.progression?.customDeckUnlocked ? 'Unlocked' : `${ownedTotal}/30 copies`;
        el.innerHTML = `
            <div class="home-stat-row">
                <div class="stat-tile"><strong>${state.profile?.authenticated ? (state.progression?.gold || 0) : 100}</strong><span>Coins ${state.profile?.authenticated ? 'available' : 'after sign up'}</span></div>
                <div class="stat-tile"><strong>${ownedTotal}</strong><span>Owned card copies</span></div>
                <div class="stat-tile"><strong>${customState}</strong><span>Custom deck builder</span></div>
            </div>
            <div class="home-flow-grid">
                <article class="home-flow-panel">
                    <span class="eyebrow">Start Matches</span>
                    <h2>Premade battles are ready now</h2>
                    <p>Play PVE or host PVP with premade decks, earn Coins, then open packs to grow your owned binder.</p>
                    <div class="flow-actions">
                        <button class="primary-btn" type="button" data-flow-play>PVE Battle</button>
                        <button class="ghost-btn" type="button" data-flow-lobbies>Lobbies</button>
                    </div>
                </article>
                <article class="home-flow-panel">
                    <span class="eyebrow">Owned Binder</span>
                    <h2>Cards live on Cards and Decks</h2>
                    <p>Use the HUD tray filters to search elements, rarity, card type, notches, and abilities without crowding every page.</p>
                    <div class="flow-actions">
                        <button class="primary-btn" type="button" data-flow-cards>Browse Cards</button>
                        <button class="ghost-btn" type="button" data-flow-decks>Build Deck</button>
                    </div>
                </article>
            </div>
            <div class="home-strip-grid">
                <div class="home-flow-panel">
                    <span class="eyebrow">Open Lobbies</span>
                    ${recentRooms.length ? recentRooms.map(room => `<div class="mini-row"><strong>${escapeHtml(room.hostName || 'Host')}</strong><span>${escapeHtml(room.roomId)} / ${escapeHtml(room.status || 'Open')}</span></div>`).join('') : '<div class="mini-row"><strong>No open rooms</strong><span>Create a 1v1 lobby when ready.</span></div>'}
                </div>
                <div class="home-flow-panel">
                    <span class="eyebrow">Shop Packs</span>
                    ${featuredPacks.length ? featuredPacks.map(pack => `<div class="mini-row"><strong>${escapeHtml(pack.name)}</strong><span>${pack.price} Coins / ${pack.elements.map(format).join(' / ')}</span></div>`).join('') : '<div class="mini-row"><strong>Packs loading</strong><span>Element packs will appear here.</span></div>'}
                </div>
            </div>
        `;
        el.querySelector('[data-flow-play]')?.addEventListener('click', () => goPlay({ mode: 'solo' }));
        el.querySelector('[data-flow-lobbies]')?.addEventListener('click', () => navigateHub('lobbies'));
        el.querySelector('[data-flow-cards]')?.addEventListener('click', () => navigateHub('cards'));
        el.querySelector('[data-flow-decks]')?.addEventListener('click', () => navigateHub('decks'));
    }

    function renderDecks() {
        const grid = document.getElementById('deckGrid');
        if (!grid) return;
        grid.innerHTML = (state.options?.decks || []).map(renderPremadeDeckTile).join('');
        grid.querySelectorAll('[data-play-deck]').forEach(btn => btn.addEventListener('click', () => goPlay({ mode: 'solo', deckId: btn.dataset.playDeck })));
        grid.querySelectorAll('[data-buy-deck]').forEach(btn => btn.addEventListener('click', () => purchaseDeck(btn.dataset.buyDeck)));
        renderBuilder();
        renderSavedDecks();
    }

    function renderPremadeDeckTile(deck) {
        const price = deck.elements.length <= 1 ? 300 : deck.elements.length >= 4 ? 700 : 450;
        const owned = state.progression?.purchasedDeckIds?.includes(deck.id);
        const primary = deck.elements?.[0] || 'FIRE';
        const accent = elementColor(primary);
        const elementLabels = deck.elements.map(format).join(' / ');
        const spineBands = deck.elements.map(el => `<span style="background:${elementColor(el)}"></span>`).join('');
        const sigils = deck.elements.slice(0, 4).map(el => `<span style="--sigil:${elementColor(el)}">${format(el).slice(0, 1)}</span>`).join('');
        return `<article class="deck-tile hub-deck-card" style="--deck-accent:${accent};--deck-bg:${deckGradient(deck.elements)}">
            <div class="deck-card-spine">${spineBands}</div>
            <div class="deck-card-sigils">${sigils}</div>
            <span class="deck-card-state">${owned ? 'Purchased' : 'Premade'}</span>
            <div class="deck-card-body">
                <strong class="deck-card-name">${escapeHtml(deck.name)}</strong>
                <span class="deck-card-elements">${escapeHtml(elementLabels)}</span>
                <span class="deck-card-desc">${escapeHtml(deck.description || 'Ready-to-play battle deck.')}</span>
            </div>
            <div class="deck-card-actions">
                <button class="primary-btn" type="button" data-play-deck="${escapeAttr(deck.id)}">Play</button>
                <button class="ghost-btn" type="button" data-buy-deck="${escapeAttr(deck.id)}">${owned ? 'Owned' : `${price} Coins`}</button>
            </div>
        </article>`;
    }

    function renderSavedDecks() {
        const grid = document.getElementById('customDeckGrid');
        const count = document.getElementById('deckCardCount');
        if (!grid) return;
        const savedDecks = state.profile?.savedDecks || [];
        if (count) count.textContent = `${savedDecks.length} saved`;
        if (!state.profile?.authenticated) {
            grid.innerHTML = '<div class="unlock-card"><strong>Sign in to save custom decks</strong><span>Your deck binder will show saved custom decks after login.</span></div>';
            return;
        }
        grid.innerHTML = savedDecks.length ? savedDecks.map(renderSavedDeckTile).join('') : '<div class="unlock-card"><strong>No saved custom decks yet</strong><span>Build a 30-card custom deck from owned cards, then save it here.</span></div>';
        grid.querySelectorAll('[data-play-custom-deck]').forEach(btn => btn.addEventListener('click', () => {
            const deck = savedDecks.find(item => item.id === btn.dataset.playCustomDeck);
            if (!deck) return;
            goPlay({ mode: 'solo', deckId: deck.deckId, customDeckCards: deck.customDeckCards || null, trainerId: deck.trainerId, loadoutLabel: deck.name });
        }));
    }

    function renderSavedDeckTile(deck) {
        const cardIds = deck.customDeckCards || [];
        const elements = [...new Set(cardIds.map(id => findCard(id)?.element).filter(Boolean))].slice(0, 4);
        const fallbackDeck = (state.options?.decks || []).find(item => item.id === deck.deckId);
        const displayElements = elements.length ? elements : (fallbackDeck?.elements || ['FIRE']);
        const accent = elementColor(displayElements[0]);
        const sigils = displayElements.map(el => `<span style="--sigil:${elementColor(el)}">${format(el).slice(0, 1)}</span>`).join('');
        return `<article class="deck-tile hub-deck-card custom-saved-deck" style="--deck-accent:${accent};--deck-bg:${deckGradient(displayElements)}">
            <div class="deck-card-sigils">${sigils}</div>
            <span class="deck-card-state">${deck.custom ? 'Custom' : 'Saved'}</span>
            <div class="deck-card-body">
                <strong class="deck-card-name">${escapeHtml(deck.name || 'Saved Deck')}</strong>
                <span class="deck-card-elements">${displayElements.map(format).join(' / ')}</span>
                <span class="deck-card-desc">${deck.custom ? `${cardIds.length} owned cards` : escapeHtml(deck.deckName || 'Premade loadout')} / ${escapeHtml(deck.trainerName || 'SiegeKnight')}</span>
            </div>
            <div class="deck-card-actions">
                <button class="primary-btn" type="button" data-play-custom-deck="${escapeAttr(deck.id)}">Play</button>
            </div>
        </article>`;
    }

    function renderBuilder() {
        const lock = document.getElementById('deckBuilderLock');
        const panel = document.getElementById('builderPanel');
        const unlocked = Boolean(state.progression?.customDeckUnlocked);
        lock.innerHTML = unlocked
            ? '<div class="unlock-card"><strong>Custom deckbuilding unlocked</strong><span>Use owned cards with max 3 copies each.</span></div>'
            : `<div class="unlock-card"><strong>Own 30 total card copies to build custom decks.</strong><span>${state.progression?.ownedTotal || 0}/30 owned copies. Play premade decks and open packs to unlock.</span></div>`;
        panel.innerHTML = unlocked
            ? `<div class="section-head"><h2>Custom Deck Draft (${builderTotal()}/30)</h2><button class="primary-btn" type="button" id="playCustomBtn">Play Custom</button></div><div class="builder-list">${Object.entries(state.builderCounts).map(([cardId, count]) => {
                const card = findCard(cardId);
                return `<div class="card-tile"><div class="art" style="--el:${elementColor(card?.element)}"></div><div><strong>${escapeHtml(card?.name || cardId)}</strong><span>${count} copies</span><button class="ghost-btn" type="button" data-remove-card="${escapeAttr(cardId)}">Remove</button></div></div>`;
            }).join('') || '<div class="unlock-card">Select owned cards from the browser to start building.</div>'}</div>`
            : '';
        document.getElementById('playCustomBtn')?.addEventListener('click', () => goPlay({ mode: 'solo', customDeckCards: builderCards(), loadoutLabel: 'Custom Binder Deck' }));
        panel.querySelectorAll('[data-remove-card]').forEach(btn => btn.addEventListener('click', () => adjustBuilder(btn.dataset.removeCard, -1)));
    }

    function renderShop() {
        const grid = document.getElementById('shopPackGrid');
        if (!grid) return;
        const packs = state.progression?.starterChosen ? state.packs : state.packs.filter(pack => pack.starterEligible);
        grid.innerHTML = packs.map(renderPackTile).join('');
        document.getElementById('shopGoldLabel').textContent = `${state.progression?.gold || 0} Coins`;
    }

    function renderPackTile(pack) {
        const starterMode = state.profile?.authenticated && state.progression && !state.progression.starterChosen;
        const label = starterMode && pack.starterEligible ? 'Choose Starter' : `${pack.price} Coins`;
        return `<article class="pack-tile">
            <strong>${escapeHtml(pack.name)}</strong>
            <span>${pack.elements.map(format).join(' / ')}</span>
            <span>${escapeHtml(pack.description || '')}</span>
            <button class="primary-btn" type="button" data-pack-id="${escapeAttr(pack.id)}">${label}</button>
        </article>`;
    }

    function renderRooms() {
        const list = document.getElementById('roomList');
        if (!list) return;
        list.innerHTML = state.rooms.length ? state.rooms.map(room => `<article class="room-tile">
            <strong>Room ${escapeHtml(room.roomId)}</strong>
            <span>${escapeHtml(room.hostName || 'Host')} / ${room.playerCount || 1}-2 / ${escapeHtml(room.format || 'PVP 1v1')}</span>
            <span>Status: ${escapeHtml(room.status || 'Open')} / Wagers coming soon</span>
            <button class="primary-btn" type="button" data-room-id="${escapeAttr(room.roomId)}">Join</button>
        </article>`).join('') : '<div class="unlock-card">No open 1v1 lobbies right now. Create one to host the table.</div>';
        list.querySelectorAll('[data-room-id]').forEach(btn => btn.addEventListener('click', () => {
            document.getElementById('roomCodeInput').value = btn.dataset.roomId;
            joinRoomFromHome();
        }));
    }

    function renderProfile() {
        const body = document.getElementById('profileSectionBody');
        if (!body) return;
        if (!state.profile?.authenticated) {
            body.innerHTML = `<div class="stat-tile profile-callout"><strong>Sign in from the HUD</strong><span>Use the Sign In button to save Coins, starter packs, owned cards, custom decks, friends, and match history.</span><button class="primary-btn" type="button" id="profileSignInBtn">Sign In</button></div>`;
            document.getElementById('profileSignInBtn')?.addEventListener('click', openAuth);
            return;
        }
        const history = state.profile.matchHistory || [];
        body.innerHTML = `
            <div class="stat-tile"><strong>${escapeHtml(state.profile.user.displayName)}</strong><span>${escapeHtml(state.profile.user.email)}</span></div>
            <div class="stat-tile"><strong>${state.progression?.gold || 0}</strong><span>Coins</span></div>
            <div class="stat-tile"><strong>${state.progression?.ownedTotal || 0}</strong><span>Owned card copies</span></div>
            <div class="stat-tile"><strong>${state.profile.savedDecks?.length || 0}</strong><span>Saved decks</span></div>
            <div class="stat-tile"><strong>Find Players</strong><span>Friends list and player search placeholder for v1.</span></div>
            <div class="stat-tile"><strong>Recent Battles</strong>${history.slice(0, 5).map(row => `<span>${escapeHtml(row.result)} vs ${escapeHtml(row.opponentName || 'Opponent')} / ${escapeHtml(row.loadoutLabel || 'Loadout')}</span>`).join('') || '<span>No completed matches yet.</span>'}</div>
        `;
    }

    function renderProfileMini() {
        const el = document.getElementById('profileMini');
        if (!el) return;
        if (!state.profile?.authenticated) {
            el.innerHTML = `<strong>Guest</strong><span>Sign in from the HUD to save Coins and owned cards.</span>`;
            return;
        }
        el.innerHTML = `<strong>${escapeHtml(state.profile.user.displayName)}</strong><span>${state.progression?.gold || 0} Coins / ${state.progression?.ownedTotal || 0} owned copies</span><button class="ghost-btn" type="button" id="logoutBtn">Log out</button>`;
        document.getElementById('logoutBtn')?.addEventListener('click', logout);
    }

    function renderGold() {
        document.getElementById('goldPill').textContent = state.profile?.authenticated ? `${state.progression?.gold || 0} Coins` : '100 Coins';
        document.getElementById('ownedCountLabel').textContent = `${state.progression?.ownedTotal || 0} owned`;
        const authBtn = document.getElementById('authHudBtn');
        if (authBtn) {
            authBtn.textContent = state.profile?.authenticated ? 'Log Out' : 'Sign In';
            authBtn.classList.toggle('is-authenticated', Boolean(state.profile?.authenticated));
        }
    }

    function renderUnlock() {
        const el = document.getElementById('customUnlockCard');
        if (!el) return;
        el.innerHTML = state.progression?.customDeckUnlocked
            ? '<strong>Custom decks unlocked</strong><span>Max 3 copies of any card.</span>'
            : `<strong>Deck builder locked</strong><span>${state.progression?.ownedTotal || 0}/30 owned copies.</span>`;
    }

    async function choosePack(packId) {
        if (!state.profile?.authenticated) {
            openAuth();
            return;
        }
        const starterMode = state.progression && !state.progression.starterChosen;
        const endpoint = starterMode ? '/api/player/starter-pack' : '/api/shop/open-pack';
        const data = await fetchJson(endpoint, { method: 'POST', body: JSON.stringify({ packId }) });
        if (data?.error) return alert(data.error);
        state.progression = data.progression;
        state.packs = data.packs || state.packs;
        renderPackResult();
        render();
    }

    function renderPackResult() {
        const result = document.getElementById('packResult');
        const latest = state.progression?.packHistory?.[0];
        if (!result || !latest) return;
        result.classList.remove('hidden');
        result.innerHTML = `<strong>${escapeHtml(latest.packName)} opened</strong><div class="card-grid">${latest.cards.map(card => `<div class="card-tile"><div class="art" style="--el:${elementColor(card.element)}"></div><div><strong>${escapeHtml(card.name)}</strong><span>${format(card.element)} / ${format(card.rarity)}</span></div></div>`).join('')}</div>`;
    }

    async function purchaseDeck(deckId) {
        if (!state.profile?.authenticated) return openAuth();
        const data = await fetchJson('/api/shop/purchase-deck', { method: 'POST', body: JSON.stringify({ deckId }) });
        if (data?.error) return alert(data.error);
        state.progression = data.progression;
        render();
    }

    async function saveCustomDeck() {
        if (!state.profile?.authenticated) return openAuth();
        const cards = builderCards();
        if (cards.length < 30) return alert('Custom decks need 30 cards.');
        const trainerId = state.options?.defaultTrainerId || state.options?.trainers?.[0]?.id;
        const data = await fetchJson('/api/profile/decks', {
            method: 'POST',
            body: JSON.stringify({ trainerId, customDeckCards: cards, name: 'Custom Binder Deck' })
        });
        if (data?.error) return alert(data.error);
        state.profile = data;
        state.progression = data.progression;
        renderProfile();
        renderDecks();
    }

    function createLobbyFromHome() {
        goPlay({ mode: 'online', onlineRoomMode: 'create', deckId: selectedDeckId() });
    }

    function joinRoomFromHome() {
        const room = document.getElementById('roomCodeInput')?.value?.trim()?.toUpperCase();
        if (!room) return;
        goPlay({ mode: 'online', onlineRoomMode: 'join', roomId: room, deckId: selectedDeckId() });
    }

    function goPlay(payload) {
        localStorage.setItem(PENDING_LOADOUT_KEY, JSON.stringify({
            createdAt: Date.now(),
            deckId: payload.deckId || selectedDeckId(),
            trainerId: payload.trainerId || state.options?.defaultTrainerId || state.options?.trainers?.[0]?.id,
            mode: payload.mode || 'solo',
            onlineRoomMode: payload.onlineRoomMode || 'create',
            roomId: payload.roomId || '',
            customDeckCards: payload.customDeckCards || null,
            loadoutLabel: payload.loadoutLabel || ''
        }));
        window.location.href = '/play';
    }

    function navigateHub(route) {
        state.route = route;
        history.pushState(null, '', route === 'home' ? '/home' : `/${route}`);
        setActiveRoute();
        renderSections();
        renderCards();
        renderHomeDashboard();
    }

    function setActiveRoute() {
        document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === state.route));
    }

    function isBinderRoute() {
        return state.route === 'cards' || state.route === 'decks';
    }

    function toggleTray(type) {
        if (!isBinderRoute()) return;
        if (type === 'filter') {
            state.filterTrayOpen = !state.filterTrayOpen;
            if (state.filterTrayOpen) state.cardTrayOpen = false;
        }
        if (type === 'card') {
            state.cardTrayOpen = !state.cardTrayOpen;
            if (state.cardTrayOpen) state.filterTrayOpen = false;
        }
        renderHudTools();
    }

    function openCardTray() {
        if (!isBinderRoute()) return;
        state.cardTrayOpen = true;
        state.filterTrayOpen = false;
        renderHudTools();
    }

    function closeTrays() {
        state.filterTrayOpen = false;
        state.cardTrayOpen = false;
        renderHudTools();
    }

    function renderHudTools() {
        const binder = isBinderRoute();
        const filterBtn = document.getElementById('filterTrayBtn');
        const cardBtn = document.getElementById('cardTrayBtn');
        const filterTray = document.getElementById('filterTray');
        const cardTray = document.getElementById('detailPanel');
        const backdrop = document.getElementById('trayBackdrop');
        filterBtn?.classList.toggle('hidden', !binder);
        cardBtn?.classList.toggle('hidden', !binder);
        filterBtn?.classList.toggle('active', binder && state.filterTrayOpen);
        cardBtn?.classList.toggle('active', binder && state.cardTrayOpen);
        filterTray?.classList.toggle('is-closed', !binder || !state.filterTrayOpen);
        cardTray?.classList.toggle('is-closed', !binder || !state.cardTrayOpen);
        filterTray?.setAttribute('aria-hidden', String(!binder || !state.filterTrayOpen));
        cardTray?.setAttribute('aria-hidden', String(!binder || !state.cardTrayOpen));
        backdrop?.classList.toggle('hidden', !binder || (!state.filterTrayOpen && !state.cardTrayOpen));
    }

    async function fetchJson(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (state.token) headers.Authorization = `Bearer ${state.token}`;
        try {
            const resp = await fetch(path, { ...options, headers });
            return await resp.json();
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    function authMarkup() {
        return `<div class="auth-card">
            <strong>Sign in to save progression</strong>
            <span>Starter packs, Coins, owned cards, and custom decks require an account. New players start with 100 Coins.</span>
            <input class="search-input" id="authEmail" type="email" placeholder="Email">
            <input class="search-input" id="authName" placeholder="Display name for register">
            <input class="search-input" id="authPassword" type="password" placeholder="Password">
            <button class="primary-btn" id="loginBtn" type="button">Log In</button>
            <button class="ghost-btn" id="registerBtn" type="button">Register</button>
        </div>`;
    }

    function openAuth() {
        if (state.profile?.authenticated) return logout();
        state.authOpen = true;
        renderAuthModal();
    }

    function closeAuth() {
        state.authOpen = false;
        renderAuthModal();
    }

    function renderAuthModal() {
        const modal = document.getElementById('authModal');
        const body = document.getElementById('authPanelBody');
        if (!modal || !body) return;
        modal.classList.toggle('hidden', !state.authOpen);
        if (state.authOpen) {
            body.innerHTML = authMarkup();
            bindAuthForms();
        }
    }

    function bindAuthForms() {
        document.querySelectorAll('#loginBtn').forEach(btn => btn.addEventListener('click', () => submitAuth('login')));
        document.querySelectorAll('#registerBtn').forEach(btn => btn.addEventListener('click', () => submitAuth('register')));
    }

    async function submitAuth(mode) {
        const email = document.getElementById('authEmail')?.value || '';
        const password = document.getElementById('authPassword')?.value || '';
        const displayName = document.getElementById('authName')?.value || '';
        const data = await fetchJson(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password, displayName }) });
        if (data?.error) return alert(data.error);
        state.token = data.token || '';
        localStorage.setItem(AUTH_TOKEN_KEY, state.token);
        state.profile = data;
        state.progression = data.progression;
        state.authOpen = false;
        render();
    }

    async function logout() {
        await fetchJson('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem(AUTH_TOKEN_KEY);
        state.token = '';
        state.profile = null;
        state.progression = null;
        render();
    }

    function adjustBuilder(cardId, delta) {
        if (!state.progression?.customDeckUnlocked) return navigateHub('decks');
        const owned = ownedCount(cardId);
        const current = state.builderCounts[cardId] || 0;
        const next = Math.max(0, Math.min(3, owned, current + delta));
        if (next) state.builderCounts[cardId] = next;
        else delete state.builderCounts[cardId];
        navigateHub('decks');
        renderBuilder();
    }

    function builderCards() {
        return Object.entries(state.builderCounts).flatMap(([cardId, count]) => Array.from({ length: count }, () => cardId));
    }

    function builderTotal() { return builderCards().length; }
    function selectedCard() { return findCard(state.selectedCardId) || state.options?.cardCatalog?.[0]; }
    function findCard(id) { return (state.options?.cardCatalog || []).find(card => card.id === id); }
    function ownedCount(id) { return state.progression?.ownedCards?.[id] || 0; }
    function selectedDeckId() { return state.options?.defaultDeckId || state.options?.decks?.[0]?.id || 'deck_fire_earth'; }
    function routeFromPath(path) {
        const route = String(path || '/home').replace(/^\/+/, '').split('/')[0] || 'home';
        return ['cards', 'decks', 'lobbies', 'profile', 'shop'].includes(route) ? route : 'home';
    }
    function elementColor(element) { return ELEMENT_COLORS[element] || '#f05b2f'; }
    function deckGradient(elements = []) {
        const colors = (elements.length ? elements : ['FIRE']).map(elementColor);
        if (colors.length === 1) return `linear-gradient(145deg, ${colors[0]}, #07101f 82%)`;
        return `linear-gradient(145deg, ${colors.map((color, index) => `${color} ${Math.round(index * 100 / (colors.length - 1))}%`).join(', ')})`;
    }
    function format(value) {
        const normalized = String(value || '');
        if (normalized === 'SIEGLING') return 'Siegeling';
        if (normalized === 'SIEGLINGS') return 'Siegelings';
        return normalized
            .toLowerCase()
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .replace(/\bSiegling\b/g, 'Siegeling')
            .replace(/\bSieglings\b/g, 'Siegelings');
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function escapeAttr(value) { return escapeHtml(value); }

    document.addEventListener('click', (event) => {
        const packButton = event.target.closest('[data-pack-id]');
        if (packButton) choosePack(packButton.dataset.packId);
    });
})();
