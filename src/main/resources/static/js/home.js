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
        builderCounts: {}
    };

    window.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindEvents();
        state.route = routeFromPath(location.pathname);
        setActiveRoute();
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
        renderFilters();
        renderProfileMini();
        renderStarterGate();
        renderSections();
        renderCards();
        renderDecks();
        renderShop();
        renderProfile();
        renderRooms();
        renderGold();
    }

    function renderStarterGate() {
        const gate = document.getElementById('starterGate');
        const hub = document.getElementById('hubGrid');
        const mustChoose = state.profile?.authenticated && state.progression && !state.progression.starterChosen;
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
    }

    function renderFilters() {
        renderFilter('elementFilters', ['ALL', ...(state.options?.liveElements || [])], state.elementFilter, (value) => {
            state.elementFilter = value;
            renderCards();
        });
        renderFilter('typeFilters', ['ALL', 'SIEGLING', 'SPELL', 'TRAP'], state.typeFilter, (value) => {
            state.typeFilter = value;
            renderCards();
        });
        renderFilter('rarityFilters', ['ALL', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'], state.rarityFilter, (value) => {
            state.rarityFilter = value;
            renderCards();
        });
    }

    function renderFilter(id, values, active, onPick) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = values.map(value => `<button class="chip${value === active ? ' active' : ''}" type="button" data-value="${value}">${format(value)}</button>`).join('');
        el.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => onPick(btn.dataset.value)));
    }

    function renderCards() {
        const cards = filteredCards();
        const ownedCards = cards.filter(card => ownedCount(card.id) > 0);
        const grids = [
            ['cardGrid', ownedCards.length ? ownedCards : cards],
            ['allCardGrid', cards]
        ];
        grids.forEach(([id, list]) => {
            const grid = document.getElementById(id);
            if (!grid) return;
            grid.innerHTML = list.map(renderCardTile).join('');
            grid.querySelectorAll('[data-card-id]').forEach(tile => tile.addEventListener('click', () => {
                state.selectedCardId = tile.dataset.cardId;
                renderCards();
                renderDetail();
            }));
        });
        document.getElementById('allCardCount').textContent = `${cards.length} cards`;
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
        if (!panel || !card) return;
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

    function renderDecks() {
        const grid = document.getElementById('deckGrid');
        if (!grid) return;
        grid.innerHTML = (state.options?.decks || []).map(deck => {
            const price = deck.elements.length <= 1 ? 300 : deck.elements.length >= 4 ? 700 : 450;
            const owned = state.progression?.purchasedDeckIds?.includes(deck.id);
            return `<article class="deck-tile">
                <strong>${escapeHtml(deck.name)}</strong>
                <span>${deck.elements.map(format).join(' / ')}</span>
                <span>${escapeHtml(deck.description || '')}</span>
                <button class="primary-btn" type="button" data-play-deck="${escapeAttr(deck.id)}">Play Premade</button>
                <button class="ghost-btn" type="button" data-buy-deck="${escapeAttr(deck.id)}">${owned ? 'Purchased' : `Buy ${price} gold`}</button>
            </article>`;
        }).join('');
        grid.querySelectorAll('[data-play-deck]').forEach(btn => btn.addEventListener('click', () => goPlay({ mode: 'solo', deckId: btn.dataset.playDeck })));
        grid.querySelectorAll('[data-buy-deck]').forEach(btn => btn.addEventListener('click', () => purchaseDeck(btn.dataset.buyDeck)));
        renderBuilder();
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
        document.getElementById('shopGoldLabel').textContent = `${state.progression?.gold || 0} gold`;
    }

    function renderPackTile(pack) {
        const starterMode = state.profile?.authenticated && state.progression && !state.progression.starterChosen;
        const label = starterMode && pack.starterEligible ? 'Choose Starter' : `${pack.price} gold`;
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
            body.innerHTML = authMarkup();
            bindAuthForms();
            return;
        }
        const history = state.profile.matchHistory || [];
        body.innerHTML = `
            <div class="stat-tile"><strong>${escapeHtml(state.profile.user.displayName)}</strong><span>${escapeHtml(state.profile.user.email)}</span></div>
            <div class="stat-tile"><strong>${state.progression?.gold || 0}</strong><span>Gold</span></div>
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
            el.innerHTML = `${authMarkup()}`;
            bindAuthForms();
            return;
        }
        el.innerHTML = `<strong>${escapeHtml(state.profile.user.displayName)}</strong><span>${state.progression?.gold || 0} gold / ${state.progression?.ownedTotal || 0} owned copies</span><button class="ghost-btn" type="button" id="logoutBtn">Log out</button>`;
        document.getElementById('logoutBtn')?.addEventListener('click', logout);
    }

    function renderGold() {
        document.getElementById('goldPill').textContent = state.profile?.authenticated ? `${state.progression?.gold || 0} gold` : 'Guest';
        document.getElementById('ownedCountLabel').textContent = `${state.progression?.ownedTotal || 0} owned`;
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
            navigateHub('profile');
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
        if (!state.profile?.authenticated) return navigateHub('profile');
        const data = await fetchJson('/api/shop/purchase-deck', { method: 'POST', body: JSON.stringify({ deckId }) });
        if (data?.error) return alert(data.error);
        state.progression = data.progression;
        render();
    }

    async function saveCustomDeck() {
        if (!state.profile?.authenticated) return navigateHub('profile');
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
    }

    function setActiveRoute() {
        document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === state.route));
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
            <span>Starter packs, gold, owned cards, and custom decks require an account.</span>
            <input class="search-input" id="authEmail" type="email" placeholder="Email">
            <input class="search-input" id="authName" placeholder="Display name for register">
            <input class="search-input" id="authPassword" type="password" placeholder="Password">
            <button class="primary-btn" id="loginBtn" type="button">Log In</button>
            <button class="ghost-btn" id="registerBtn" type="button">Register</button>
        </div>`;
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
    function format(value) {
        return String(value || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
