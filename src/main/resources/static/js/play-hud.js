/* Play-page HUD extras: Siegecoins, Join With Code, Friends, notifications and
   the Field Guide popup.

   The hub (home.js) owns the same five controls, but that bundle is a 10k-line
   IIFE wired to hub routing/state and is not loaded on play.html. This file is
   the play-side implementation: it reads the account snapshot game.js already
   keeps in `authState` (the /api/auth/me payload carries friends, requests and
   progression) and shares the hub's per-account notification feed in
   localStorage, so the bell shows the same entries on both pages.

   Loaded after game.js, which declares `authState`, `escapeHtml`, `fetchJson`
   and the loadout helpers as script-level globals. */
(function () {
    'use strict';

    const nav = document.querySelector('.play-hub-nav');
    if (!nav || !document.getElementById('playHudNotifBtn')) {
        return;
    }

    const NOTIF_LIMIT = 60;
    const NOTIF_TYPE_LABELS = {
        match: 'Match', mission: 'Missions', friend: 'Friends', gold: 'Rewards',
        pack: 'Packs', title: 'Titles', badge: 'Badges', rank: 'Rank', server: 'Server'
    };

    const state = {
        notifications: [],
        notifKey: '',
        friendSearch: '',
        requestsOpen: false,
        friendMessage: '',
        friendMessageType: '',
        chatPeer: '',
        busy: false
    };

    const $ = (id) => document.getElementById(id);

    function profile() {
        return (typeof authState !== 'undefined' && authState) ? authState.profile : null;
    }

    function isSignedIn() {
        return Boolean(profile()?.authenticated);
    }

    function esc(value) {
        return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value == null ? '' : value);
    }

    function escAttr(value) {
        return typeof escapeHtmlAttribute === 'function'
            ? escapeHtmlAttribute(value)
            : esc(value).replace(/"/g, '&quot;');
    }

    // ── Siegecoins ───────────────────────────────────────────────────────
    // Signed-out mirrors the hub's placeholder balance so the pill never reads
    // as an empty wallet before the account resolves.
    function renderCoins() {
        const value = $('playHubCoinValue');
        if (!value) return;
        const gold = isSignedIn() ? Number(profile()?.progression?.gold) || 0 : 100;
        value.textContent = gold.toLocaleString('en-US');
    }

    // ── Notification feed (shared with the hub via localStorage) ─────────
    function notifStorageKey() {
        return `sieglingsNotifs:${profile()?.user?.email || 'anon'}`;
    }

    function loadNotifications() {
        state.notifKey = notifStorageKey();
        try {
            const parsed = JSON.parse(localStorage.getItem(state.notifKey) || '[]');
            state.notifications = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            state.notifications = [];
        }
        renderNotifications();
    }

    function saveNotifications() {
        try {
            localStorage.setItem(state.notifKey, JSON.stringify(state.notifications.slice(0, NOTIF_LIMIT)));
        } catch (error) {
            // The feed is a convenience mirror; a full quota just costs persistence.
        }
    }

    function formatNotifTime(time) {
        const date = new Date(Number(time) || Date.now());
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function renderNotifications() {
        const unread = state.notifications.filter((row) => !row.read).length;
        const badge = $('playHudNotifBadge');
        if (badge) {
            badge.textContent = unread > 9 ? '9+' : String(unread);
            badge.classList.toggle('hidden', !unread);
        }
        const list = $('playHudNotifList');
        if (!list) return;
        list.innerHTML = state.notifications.length
            ? state.notifications.map((row) => `<div class="play-hud-notif-row${row.read ? '' : ' is-unread'}">
                <div class="play-hud-notif-head-row">
                    <span class="play-hud-notif-type">${esc(NOTIF_TYPE_LABELS[row.type] || 'Update')}</span>
                    <time>${esc(formatNotifTime(row.time))}</time>
                </div>
                <strong>${esc(row.title)}</strong>
                ${row.body ? `<p>${esc(row.body)}</p>` : ''}
            </div>`).join('')
            : '<div class="play-hud-empty">No notifications yet. Match results, rewards, invites, and unlocks show up here.</div>';
    }

    function toggleNotifPanel(force) {
        const panel = $('playHudNotifPanel');
        if (!panel) return;
        const open = typeof force === 'boolean' ? force : panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !open);
        const btn = $('playHudNotifBtn');
        btn?.classList.toggle('active', open);
        btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) return;
        toggleHelpModal(false);
        if (state.notifKey !== notifStorageKey()) {
            loadNotifications();
        } else {
            renderNotifications();
        }
        // Opening clears the badge; rows keep their unread styling until the
        // next open so the player can still spot what arrived.
        if (state.notifications.some((row) => !row.read)) {
            state.notifications.forEach((row) => { row.read = true; });
            saveNotifications();
            $('playHudNotifBadge')?.classList.add('hidden');
        }
    }

    // ── Field Guide ──────────────────────────────────────────────────────
    function toggleHelpModal(force) {
        const modal = $('playHudHelpModal');
        if (!modal) return;
        const open = typeof force === 'boolean' ? force : modal.classList.contains('hidden');
        modal.classList.toggle('hidden', !open);
        modal.setAttribute('aria-hidden', open ? 'false' : 'true');
        const btn = $('playHudHelpBtn');
        btn?.classList.toggle('active', open);
        btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) return;
        toggleNotifPanel(false);
        const frame = $('playHudHelpFrame');
        // Load the static file (not the /help rewrite) so the popup works under
        // Firebase Hosting, Spring Boot, and a plain static server alike.
        if (frame && frame.getAttribute('src') === 'about:blank') {
            frame.src = '/help.html?embed=1';
        }
    }

    // ── Join With Code ───────────────────────────────────────────────────
    // Drops straight into the loadout's online Join Room step with the code
    // field focused, instead of bouncing the player to the hub.
    function applyJoinRoomMode() {
        if (typeof setMatchMode === 'function') setMatchMode('online');
        if (typeof setOnlineRoomMode === 'function') setOnlineRoomMode('join');
        if (typeof setLoadoutStep === 'function') setLoadoutStep('setup');
        window.setTimeout(() => $('roomCodeInput')?.focus(), 60);
    }

    function openJoinWithCode() {
        if (typeof gameState !== 'undefined' && gameState
            && !window.confirm('Leave the current match and open the room join screen?')) {
            return;
        }
        closeAll();
        if (typeof openLoadoutSelector === 'function') openLoadoutSelector();
        applyJoinRoomMode();
        // On a cold load the catalog fetch is still in flight, so the loadout
        // has nothing to paint yet and the Join Room tab would be lost. Re-apply
        // once the options land (LOADOUT_ACTION_TIMEOUT_MS is generous; give up
        // after ~10s so a dead backend doesn't leave a timer running).
        if (typeof gameOptions !== 'undefined' && gameOptions) return;
        let tries = 0;
        const timer = window.setInterval(() => {
            tries += 1;
            if (typeof gameOptions !== 'undefined' && gameOptions) {
                window.clearInterval(timer);
                applyJoinRoomMode();
            } else if (tries > 50) {
                window.clearInterval(timer);
            }
        }, 200);
    }

    // ── Friends ──────────────────────────────────────────────────────────
    function friendDisplayName(friend) {
        const name = String(friend?.displayName || '').trim();
        if (name) return name;
        const email = String(friend?.email || '').trim();
        return email ? email.split('@')[0] : 'Player';
    }

    function incomingRequests() {
        return profile()?.incomingFriendRequests || [];
    }

    function openFriendsModal() {
        const modal = $('playHudFriendsModal');
        if (!modal) return;
        closeAll();
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        state.requestsOpen = incomingRequests().length > 0;
        showChatView(false);
        setAddFriendOpen(false);
        renderFriends();
    }

    function closeFriendsModal() {
        const modal = $('playHudFriendsModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        state.chatPeer = '';
    }

    function friendsModalOpen() {
        return !$('playHudFriendsModal')?.classList.contains('hidden');
    }

    function setAddFriendOpen(open) {
        $('playHudAddFriendForm')?.classList.toggle('hidden', !open);
        if (open) $('playHudFriendEmail')?.focus();
    }

    function showChatView(open) {
        $('playHudFriendsView')?.classList.toggle('hidden', open);
        $('playHudChatView')?.classList.toggle('hidden', !open);
        const title = $('playHudFriendsTitle');
        if (title) title.textContent = open ? 'Messages' : 'Friends';
        $('playHudRequestsBtn')?.classList.toggle('hidden', open);
        $('playHudAddFriendBtn')?.classList.toggle('hidden', open);
    }

    function setFriendMessage(message, type = '') {
        state.friendMessage = message;
        state.friendMessageType = type;
        const el = $('playHudFriendMessage');
        if (!el) return;
        el.textContent = message || '';
        el.className = `play-hud-friend-message ${type}`.trim();
    }

    function renderFriends() {
        renderFriendRequests();
        const list = $('playHudFriendList');
        const count = $('playHudFriendCount');
        if (!list) return;
        const friends = profile()?.friends || [];
        if (count) count.textContent = `${friends.length} friend${friends.length === 1 ? '' : 's'}`;
        if (!isSignedIn()) {
            list.innerHTML = '<div class="play-hud-empty"><strong>Sign in to add friends</strong><br>Friends are saved to your account and added by email.</div>';
            return;
        }
        const visible = friends.filter((friend) => {
            if (!state.friendSearch) return true;
            return `${friend.displayName || ''} ${friend.email || ''}`.toLowerCase().includes(state.friendSearch);
        });
        list.innerHTML = visible.length
            ? visible.map((friend) => {
                const name = friendDisplayName(friend);
                const email = String(friend.email || '').trim();
                return `<article class="play-hud-friend-tile">
                    <div class="play-hud-friend-main">
                        <span class="play-hud-friend-avatar" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</span>
                        <div class="play-hud-friend-copy">
                            <strong>${esc(name)}</strong>
                            <span>${esc(email)}</span>
                        </div>
                    </div>
                    <div class="play-hud-friend-actions">
                        <button class="play-hub-ghost play-hud-compact" type="button" data-friend-message="${escAttr(email)}">Message</button>
                        <a class="play-hub-ghost play-hud-compact" href="/profile/${encodeURIComponent(friend.userId || email)}">Profile</a>
                        <button class="play-hub-ghost play-hud-compact" type="button" data-friend-remove="${escAttr(email)}" aria-label="Remove friend" title="Remove friend">&times;</button>
                    </div>
                </article>`;
            }).join('')
            : '<div class="play-hud-empty"><strong>No friends found</strong><br>Use the + button above to add a registered player by email.</div>';
        list.querySelectorAll('[data-friend-message]').forEach((btn) => {
            btn.addEventListener('click', () => openChat(btn.dataset.friendMessage));
        });
        list.querySelectorAll('[data-friend-remove]').forEach((btn) => {
            btn.addEventListener('click', () => removeFriend(btn.dataset.friendRemove));
        });
    }

    function renderFriendRequests() {
        const incoming = incomingRequests();
        const outgoing = profile()?.outgoingFriendRequests || [];
        const badges = [$('playHudRequestsBadge'), $('playHudFriendsBadge')];
        badges.forEach((badge) => {
            if (!badge) return;
            badge.textContent = incoming.length > 9 ? '9+' : String(incoming.length);
            badge.classList.toggle('hidden', !incoming.length);
        });
        $('playHudRequestsBtn')?.classList.toggle('active', state.requestsOpen);
        const block = $('playHudRequestsBlock');
        const list = $('playHudRequestList');
        const count = $('playHudRequestCount');
        if (count) count.textContent = `${incoming.length} pending`;
        block?.classList.toggle('hidden', !isSignedIn() || !state.requestsOpen);
        if (!list) return;
        if (!incoming.length && !outgoing.length) {
            list.innerHTML = '<div class="play-hud-empty">No pending requests.</div>';
            return;
        }
        list.innerHTML = `${incoming.map((request) => `<article class="play-hud-request-tile">
                <div class="play-hud-friend-copy">
                    <strong>${esc(request.displayName || request.peerEmail || 'Player')}</strong>
                    <span>${esc(request.peerEmail || '')} wants to be friends</span>
                </div>
                <div class="play-hud-request-actions">
                    <button class="play-hub-primary play-hud-compact" type="button" data-request-accept="${escAttr(request.fromUserId || request.peerEmail)}">Accept</button>
                    <button class="play-hub-ghost play-hud-compact" type="button" data-request-deny="${escAttr(request.fromUserId || request.peerEmail)}">Decline</button>
                </div>
            </article>`).join('')}${outgoing.map((request) => `<article class="play-hud-request-tile">
                <div class="play-hud-friend-copy">
                    <strong>${esc(request.displayName || request.peerEmail || 'Player')}</strong>
                    <span>Request sent &middot; waiting for a reply</span>
                </div>
            </article>`).join('')}`;
        list.querySelectorAll('[data-request-accept]').forEach((btn) => {
            btn.addEventListener('click', () => respondToRequest(btn.dataset.requestAccept, 'accept'));
        });
        list.querySelectorAll('[data-request-deny]').forEach((btn) => {
            btn.addEventListener('click', () => respondToRequest(btn.dataset.requestDeny, 'deny'));
        });
    }

    // Every friend endpoint answers with the full profile payload, so a single
    // assignment keeps the whole page (welcome card, coins, badges) in step.
    // buildProfileResponse omits progression when that isolated Firestore read
    // fails — never let that wipe the live snapshot or the shared
    // sieglingsAuthProfile cache. Home treats a missing progression as starter-
    // gate lockout for an otherwise signed-in account.
    function applyProfileResponse(data) {
        if (!data || data.error || typeof authState === 'undefined') return false;
        const previous = authState.profile;
        const sameUser = previous?.user?.id && previous.user.id === data.user?.id;
        const progression = data.progression || (sameUser ? previous.progression : null);
        const merged = progression && !data.progression ? { ...data, progression } : data;
        authState.profile = merged;
        if (typeof saveCachedAuthProfile === 'function') saveCachedAuthProfile(merged);
        if (typeof renderWelcomeAuth === 'function') {
            renderWelcomeAuth();
        } else {
            syncAuth();
        }
        return true;
    }

    async function postFriendAction(path, body) {
        if (state.busy) return null;
        state.busy = true;
        try {
            const urls = typeof apiUrls === 'function' ? apiUrls(path) : path;
            return await fetchJson(urls, {
                method: 'POST',
                headers: typeof getAuthHeaders === 'function'
                    ? getAuthHeaders({ 'Content-Type': 'application/json' })
                    : { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } finally {
            state.busy = false;
        }
    }

    async function addFriend(event) {
        event?.preventDefault();
        if (!isSignedIn()) {
            setFriendMessage('Sign in to add friends.', 'error');
            return;
        }
        const input = $('playHudFriendEmail');
        const email = input?.value?.trim() || '';
        if (!email) {
            setFriendMessage('Enter a friend email first.', 'error');
            return;
        }
        const data = await postFriendAction('/api/profile/friends', { email });
        if (!data || data.error) {
            setFriendMessage(data?.error || 'Could not send that request.', 'error');
            return;
        }
        if (input) input.value = '';
        applyProfileResponse(data);
        setFriendMessage('Friend request sent.', 'success');
        renderFriends();
    }

    async function respondToRequest(fromUserId, action) {
        const data = await postFriendAction(
            action === 'accept' ? '/api/profile/friends/accept' : '/api/profile/friends/deny',
            { fromUserId }
        );
        if (!data || data.error) {
            setFriendMessage(data?.error || 'Could not update that request.', 'error');
            return;
        }
        applyProfileResponse(data);
        state.requestsOpen = incomingRequests().length > 0;
        setFriendMessage(action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.', 'success');
        renderFriends();
    }

    async function removeFriend(email) {
        const data = await postFriendAction('/api/profile/friends/delete', { email });
        if (!data || data.error) {
            setFriendMessage(data?.error || 'Could not remove that friend.', 'error');
            return;
        }
        applyProfileResponse(data);
        setFriendMessage('Friend removed.', 'success');
        renderFriends();
    }

    // ── Direct messages ──────────────────────────────────────────────────
    async function openChat(peerId, focusInput = true) {
        if (!peerId || !isSignedIn()) return;
        state.chatPeer = peerId;
        showChatView(true);
        const friend = (profile()?.friends || []).find((row) => row.email === peerId);
        const title = $('playHudChatTitle');
        if (title) title.textContent = friendDisplayName(friend || { email: peerId });
        const log = $('playHudChatLog');
        if (log) log.innerHTML = '<div class="play-hud-empty">Loading messages...</div>';
        const urls = typeof apiUrls === 'function'
            ? apiUrls(`/api/social/messages/with/${encodeURIComponent(peerId)}`)
            : `/api/social/messages/with/${encodeURIComponent(peerId)}`;
        const data = await fetchJson(urls, { headers: typeof getAuthHeaders === 'function' ? getAuthHeaders() : {} });
        if (state.chatPeer !== peerId) return;
        if (!data || data.error) {
            if (log) log.innerHTML = `<div class="play-hud-empty">${esc(data?.error || 'Could not load this chat.')}</div>`;
            return;
        }
        const messages = data.messages || [];
        if (log) {
            log.innerHTML = messages.length
                ? messages.map((message) => `<div class="play-hud-chat-bubble${message.mine ? ' mine' : ''}">
                    <small>${esc(message.mine ? 'You' : friendDisplayName(friend || { email: peerId }))}</small>
                    ${esc(message.text || '')}
                </div>`).join('')
                : '<div class="play-hud-empty">No messages yet. Say hello.</div>';
            log.scrollTop = log.scrollHeight;
        }
        if (focusInput) $('playHudChatInput')?.focus();
    }

    async function sendChatMessage(event) {
        event?.preventDefault();
        const input = $('playHudChatInput');
        const text = input?.value?.trim() || '';
        if (!state.chatPeer || !text) return;
        const urls = typeof apiUrls === 'function' ? apiUrls('/api/social/messages/send') : '/api/social/messages/send';
        const data = await fetchJson(urls, {
            method: 'POST',
            headers: typeof getAuthHeaders === 'function'
                ? getAuthHeaders({ 'Content-Type': 'application/json' })
                : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipientId: state.chatPeer, text })
        });
        if (!data || data.error) {
            const log = $('playHudChatLog');
            if (log) log.insertAdjacentHTML('beforeend', `<div class="play-hud-empty">${esc(data?.error || 'Could not send that message.')}</div>`);
            return;
        }
        if (input) input.value = '';
        await openChat(state.chatPeer, false);
    }

    // ── Shared open/close plumbing ───────────────────────────────────────
    function closeAll() {
        toggleNotifPanel(false);
        toggleHelpModal(false);
        closeFriendsModal();
    }

    function syncAuth() {
        renderCoins();
        if (state.notifKey !== notifStorageKey()) {
            loadNotifications();
        }
        renderFriendRequests();
        if (friendsModalOpen()) renderFriends();
    }

    function bind() {
        $('playHudNotifBtn')?.addEventListener('click', () => toggleNotifPanel());
        $('playHudNotifClear')?.addEventListener('click', () => {
            state.notifications = [];
            saveNotifications();
            renderNotifications();
        });
        $('playHudHelpBtn')?.addEventListener('click', () => toggleHelpModal());
        $('playHubJoinCodeBtn')?.addEventListener('click', openJoinWithCode);
        $('playHubFriendsBtn')?.addEventListener('click', openFriendsModal);
        $('playHudRequestsBtn')?.addEventListener('click', () => {
            state.requestsOpen = !state.requestsOpen;
            renderFriendRequests();
        });
        $('playHudAddFriendBtn')?.addEventListener('click', () => {
            setAddFriendOpen($('playHudAddFriendForm')?.classList.contains('hidden'));
        });
        $('playHudAddFriendForm')?.addEventListener('submit', addFriend);
        $('playHudFriendSearch')?.addEventListener('input', (event) => {
            state.friendSearch = event.target.value.trim().toLowerCase();
            renderFriends();
        });
        $('playHudChatBack')?.addEventListener('click', () => {
            state.chatPeer = '';
            showChatView(false);
        });
        $('playHudChatForm')?.addEventListener('submit', sendChatMessage);

        document.querySelectorAll('[data-play-hud-close]').forEach((el) => {
            el.addEventListener('click', () => {
                toggleHelpModal(false);
                closeFriendsModal();
            });
        });

        document.addEventListener('click', (event) => {
            const panel = $('playHudNotifPanel');
            if (!panel || panel.classList.contains('hidden')) return;
            if (panel.contains(event.target) || $('playHudNotifBtn')?.contains(event.target)) return;
            toggleNotifPanel(false);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeAll();
        });

        // Starting a match hides the HUD on phones; a popup left open would
        // float over the board with no way back to its trigger.
        new MutationObserver(() => {
            if (document.body.classList.contains('gameplay-active')) closeAll();
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // Another tab (the hub) pushing a notification updates this page's bell.
        window.addEventListener('storage', (event) => {
            if (!event.key || event.key === state.notifKey) loadNotifications();
        });
    }

    bind();
    loadNotifications();
    syncAuth();

    window.SieglingsPlayHud = { syncAuth, openFriendsModal, openJoinWithCode, toggleHelpModal, toggleNotifPanel };
})();
