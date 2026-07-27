(function () {
    'use strict';

    const AUTH_TOKEN_KEY = 'sieglingsAuthToken';
    const COOKIE_SESSION_VALUE = 'cookie';
    const apiBase = String(window.SIEGLINGS_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');

    // Auth model mirrors home.js: real sessions ride the httpOnly `__session` cookie
    // (bridged onto the Authorization header server-side), but only once the server
    // has confirmed that cookie actually reaches it. Firebase Hosting forwards no
    // other cookie to Cloud Run, so a session stored under any other name — or read
    // back from the secret-free `sgl_auth` flag — looks alive to the page while the
    // backend never sees it. That mismatch is what made a keeper who had just signed
    // in on the hub land on the My Keep gate and sign in a second time.
    const COOKIE_AUTH_CONFIRMED_KEY = 'sieglingsCookieAuthConfirmed';
    // iOS standalone Web Apps don't reliably send the session cookie across the
    // full-page navigations this multi-page app uses, so there we keep sending the
    // localStorage Bearer token instead of relying on the cookie.
    function isStandalonePWA() {
        try {
            return window.navigator.standalone === true
                || Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
        } catch (e) {
            return false;
        }
    }
    function isLegacyBearerToken(token) {
        return Boolean(token) && token !== COOKIE_SESSION_VALUE;
    }
    function cookieAuthConfirmed() {
        try {
            return localStorage.getItem(COOKIE_AUTH_CONFIRMED_KEY) === '1';
        } catch (e) {
            return false;
        }
    }
    // Keep the real token unless the hub/play pages have recorded a server-confirmed
    // cookie session. Keeps the stored token in step with home.js after login.
    function preferredStoredToken(loginToken) {
        return (cookieAuthConfirmed() && !isStandalonePWA()) ? COOKIE_SESSION_VALUE : (loginToken || '');
    }
    const TUTORIAL_KEY = 'sieglingsKeepTutorialSeen';
    const TUTORIAL_STEPS = [
        {
            art: '⌂', kicker: 'Welcome, Keeper', title: 'The Wounded Ground',
            body: 'This land was stripped bare by the war. Your Keep is a promise to give more than you take. Rebuild at your own pace — everything here keeps growing while you are away.'
        },
        {
            art: '▰', kicker: 'Grow and gather', title: 'The Woodlot works for you',
            body: 'The Restorative Woodlot produces timber over time — the READY counter at the top shows how much is waiting. Tap Collect to store it. Cultivation, never clear-cutting.'
        },
        {
            art: '⚒', kicker: 'Restore the sanctuary', title: 'Spend timber on Projects',
            body: 'Open Projects and spend timber to raise ruined buildings. Construction finishes on its own, even while you are offline, and every finished project changes the land itself.'
        },
        {
            art: '▤', kicker: 'Step inside and listen', title: 'Buildings open up',
            body: 'Tap any building to step inside it. Read recovered letters in the Chronicle, display memorabilia, and answer the Voices — your choices shape trust, never your production.'
        },
        {
            art: '✦', kicker: 'Choose what comes next', title: 'Build an elemental workshop',
            body: 'After restoring the Storehouse, choose which elemental workshop to build first. Each makes a different material used to craft other buildings, production tools, Keep bonuses, and decorations you can place inside.'
        }
    ];

    const state = {
        snapshot: null,
        panel: '',
        interior: '',
        tutorialStep: -1,
        loreFilter: 'ALL',
        expandedLoreId: '',
        // Entries read during this Chronicle visit stay filed under Unread until the panel is
        // reopened, so the card under the player's finger never jumps groups as it is marked read.
        sessionReadLoreIds: [],
        activeConversationId: '',
        receivedAtMs: Date.now(),
        debugTimeOffsetMs: 0,
        busy: false,
        discoveryQueue: [],
        discoveryTimer: null,
        completionRefreshPending: false,
        constructionCollapsed: window.matchMedia('(max-width: 767px)').matches,
        selectedStation: 'woodlot',
        selectedRelationshipId: '',
        inventoryFilter: 'ALL',
        pendingOfflineReport: null,
        offlineVisible: false,
        notices: [],
        mobileLayout: window.matchMedia('(max-width: 767px)').matches,
        gateMode: 'signin',
        testMode: Boolean(window.__KEEP_TEST_SNAPSHOT__)
    };

    const elementColors = {
        FIRE: '#ff6a3d', WATER: '#4da8ff', EARTH: '#c09a65', WIND: '#96ffb4', ICE: '#76e6ff',
        SHADOW: '#9b6bd0', ELECTRIC: '#ffe63c', METAL: '#b7c0c8', UNDEAD: '#9e8aad',
        PSYCHIC: '#d0a7ff', LIGHT: '#ffe9a8', POISON: '#84c55b', NEUTRAL: '#c8b997'
    };

    const RANK_NAMES = ['Ruined Camp', 'Timber Outpost', 'Settled Courtyard', 'Stonehold',
        'Walled Keep', 'Elemental Stronghold', 'High Castle', 'Grand Keep'];
    const HALL_MAX_LEVEL = 8;

    /** Scene pan/zoom is view-only state; the world layers transform, UI chrome stays fixed. */
    const view = { zoom: 1, panX: 0, panY: 0 };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        migrateStoredToken();
        bindEvents();
        bindLoginModal();
        initMusic();
        initSceneView();
        if (state.testMode) {
            applySnapshot(clone(window.__KEEP_TEST_SNAPSHOT__), false);
            hideLoading();
        } else {
            await loadSnapshot();
        }
        maybeShowTutorial();
        maybeShowOfflineReport();
        window.setInterval(updateLiveState, 1000);
    }

    function bindEvents() {
        document.addEventListener('click', handleClick);
        document.getElementById('panelClose')?.addEventListener('click', closePanel);
        document.getElementById('panelScrim')?.addEventListener('click', closePanel);
        document.getElementById('dialogueClose')?.addEventListener('click', closeDialogue);
        document.getElementById('dialogueOverlay')?.addEventListener('click', (event) => {
            if (event.target.id === 'dialogueOverlay') closeDialogue();
        });
        document.getElementById('collectButton')?.addEventListener('click', collectTimber);
        document.getElementById('fullscreenButton')?.addEventListener('click', toggleFullscreen);
        document.getElementById('discoveryOpen')?.addEventListener('click', openLatestDiscovery);
        document.getElementById('noticeButton')?.addEventListener('click', toggleNoticeTray);
        document.getElementById('noticeClose')?.addEventListener('click', closeNoticeTray);
        document.getElementById('interiorExit')?.addEventListener('click', closeInterior);
        document.getElementById('helpButton')?.addEventListener('click', () => openTutorial(0));
        document.getElementById('tutorialSkip')?.addEventListener('click', finishTutorial);
        document.getElementById('tutorialNext')?.addEventListener('click', tutorialAdvance);
        document.getElementById('offlineDismiss')?.addEventListener('click', dismissOfflineReport);
        // The scene caption doubles as the Keeper's Journey button; keyboard-activate it.
        document.getElementById('sceneCaption')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openJourney(); }
        });
        // iOS Safari can leave the document scrolled after a rotation even with
        // overflow hidden, hiding the fixed header; snap back whenever it happens.
        window.addEventListener('resize', resetViewportScroll);
        window.addEventListener('orientationchange', () => {
            resetViewportScroll();
            window.setTimeout(resetViewportScroll, 250);
            window.setTimeout(resetViewportScroll, 700);
        });
        window.addEventListener('scroll', resetViewportScroll, { passive: true });
        document.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 'f' && !isTyping(event.target)) toggleFullscreen();
            // Arrow keys walk the interior tour, but only when no overlay owns the focus.
            if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && state.interior && !state.panel
                && !isTyping(event.target)
                && document.getElementById('keepTutorial')?.classList.contains('hidden') !== false
                && document.getElementById('dialogueOverlay')?.classList.contains('hidden') !== false) {
                event.preventDefault();
                stepInterior(event.key === 'ArrowLeft' ? -1 : 1);
            }
            if (event.key === 'Escape') {
                if (!document.getElementById('keepTutorial')?.classList.contains('hidden')) finishTutorial();
                else if (!document.getElementById('journeyOverlay')?.classList.contains('hidden')) closeJourney();
                else if (!document.getElementById('dialogueOverlay')?.classList.contains('hidden')) closeDialogue();
                else if (state.panel) closePanel();
                else closeInterior();
            }
        });
    }

    function resetViewportScroll() {
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        const main = document.querySelector('.keep-main');
        if (main?.scrollLeft || main?.scrollTop) main.scrollTo(0, 0);
        const mobile = window.matchMedia('(max-width: 767px)').matches;
        if (mobile && !state.mobileLayout) {
            state.constructionCollapsed = true;
            renderConstructionCollapseState();
        }
        state.mobileLayout = mobile;
    }

    /* —— Scene pan & zoom: buttons for accessibility, pointer drag when zoomed. —— */
    function initSceneView() {
        document.getElementById('zoomIn')?.addEventListener('click', () => setZoom(view.zoom + 0.3));
        document.getElementById('zoomOut')?.addEventListener('click', () => setZoom(view.zoom - 0.3));
        document.getElementById('zoomReset')?.addEventListener('click', () => setZoom(1));
        const viewport = document.querySelector('.keep-scene-viewport');
        if (!viewport) return;
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let baseX = 0;
        let baseY = 0;
        let dragged = false;
        viewport.addEventListener('pointerdown', (event) => {
            if (view.zoom <= 1 || event.button > 0 || event.target.closest('.scene-zoom')) return;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            baseX = view.panX;
            baseY = view.panY;
            dragged = false;
        });
        viewport.addEventListener('pointermove', (event) => {
            if (pointerId === null || event.pointerId !== pointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (!dragged && Math.hypot(dx, dy) < 7) return;
            dragged = true;
            document.getElementById('keepScene')?.classList.add('is-dragging');
            view.panX = baseX + dx;
            view.panY = baseY + dy;
            applySceneView();
        });
        const release = (event) => {
            if (pointerId === null || event.pointerId !== pointerId) return;
            pointerId = null;
            document.getElementById('keepScene')?.classList.remove('is-dragging');
            // A drag must not fire the hotspot tap underneath the finger.
            if (dragged) suppressNextSceneClick();
        };
        viewport.addEventListener('pointerup', release);
        viewport.addEventListener('pointercancel', release);
        window.addEventListener('resize', applySceneView);
    }

    function setZoom(next) {
        view.zoom = clamp(Math.round(number(next) * 100) / 100, 1, 2.2);
        if (view.zoom <= 1) {
            view.panX = 0;
            view.panY = 0;
        }
        applySceneView();
    }

    function applySceneView() {
        const scene = document.getElementById('keepScene');
        const viewport = document.querySelector('.keep-scene-viewport');
        if (!scene || !viewport) return;
        const maxX = (view.zoom - 1) * viewport.clientWidth / 2;
        const maxY = (view.zoom - 1) * viewport.clientHeight / 2;
        view.panX = clamp(view.panX, -maxX, maxX);
        view.panY = clamp(view.panY, -maxY, maxY);
        scene.style.transform = view.zoom === 1
            ? '' : `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`;
        viewport.classList.toggle('is-pannable', view.zoom > 1);
        const zoomIn = document.getElementById('zoomIn');
        const zoomOut = document.getElementById('zoomOut');
        if (zoomIn) zoomIn.disabled = view.zoom >= 2.2;
        if (zoomOut) zoomOut.disabled = view.zoom <= 1;
    }

    function suppressNextSceneClick() {
        const stop = (event) => {
            event.stopPropagation();
            event.preventDefault();
        };
        document.addEventListener('click', stop, { capture: true, once: true });
        window.setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 150);
    }

    function handleClick(event) {
        if (event.target.closest('#constructionToggle')) {
            toggleConstructionBanner();
            return;
        }
        const panelTrigger = event.target.closest('[data-open-panel]');
        if (panelTrigger) {
            if (panelTrigger.dataset.selectStation) state.selectedStation = panelTrigger.dataset.selectStation;
            if (panelTrigger.closest('#noticeTray')) closeNoticeTray();
            openPanel(panelTrigger.dataset.openPanel);
            return;
        }
        if (event.target.closest('[data-open-journey]')) { openJourney(); return; }
        if (event.target.closest('#journeyClose') || event.target.closest('[data-close-journey]')) { closeJourney(); return; }
        const building = event.target.closest('[data-building]');
        if (building) {
            if (building.dataset.building === 'facilities') openPanel('facilities');
            else if (building.dataset.building === 'enclave' && !state.snapshot?.enclave?.built) openPanel('projects');
            else openInterior(building.dataset.building);
            return;
        }
        const enclaveResident = event.target.closest('[data-enclave-resident]');
        if (enclaveResident) {
            void setEnclaveResident(number(enclaveResident.dataset.enclaveSlot), enclaveResident.dataset.enclaveResident);
            return;
        }
        const noticeLore = event.target.closest('[data-notice-lore]');
        if (noticeLore) {
            closeNoticeTray();
            state.loreFilter = 'ALL';
            openPanel('chronicle');
            void openLore(noticeLore.dataset.noticeLore);
            return;
        }
        const enterFacility = event.target.closest('[data-enter-facility]');
        if (enterFacility) {
            openInterior(enterFacility.dataset.enterFacility);
            return;
        }
        const interiorStep = event.target.closest('[data-interior-step]');
        if (interiorStep) {
            stepInterior(number(interiorStep.dataset.interiorStep));
            return;
        }
        const interiorGoto = event.target.closest('[data-interior-goto]');
        if (interiorGoto) {
            if (interiorGoto.dataset.interiorGoto !== state.interior) openInterior(interiorGoto.dataset.interiorGoto);
            return;
        }
        const stationChoice = event.target.closest('[data-resident-station]');
        if (stationChoice) {
            state.selectedStation = stationChoice.dataset.residentStation || 'woodlot';
            renderPanel();
            return;
        }
        const inventoryFilter = event.target.closest('[data-inventory-filter]');
        if (inventoryFilter) {
            state.inventoryFilter = inventoryFilter.dataset.inventoryFilter || 'ALL';
            renderPanel();
            return;
        }
        const relationship = event.target.closest('[data-relationship-id]');
        if (relationship) {
            const id = relationship.dataset.relationshipId || '';
            state.selectedRelationshipId = state.selectedRelationshipId === id ? '' : id;
            renderPanel();
            return;
        }
        const filter = event.target.closest('[data-lore-filter]');
        if (filter) {
            state.loreFilter = filter.dataset.loreFilter || 'ALL';
            renderPanel();
            return;
        }
        const lore = event.target.closest('[data-lore-id]');
        if (lore && !event.target.closest('[data-memorabilia-id]')) {
            void openLore(lore.dataset.loreId);
            return;
        }
        const memorabilia = event.target.closest('[data-memorabilia-id]');
        if (memorabilia) {
            event.stopPropagation();
            void toggleMemorabilia(memorabilia.dataset.memorabiliaId, memorabilia.dataset.displayed !== 'true');
            return;
        }
        const invite = event.target.closest('[data-invite-resident]');
        if (invite) {
            void inviteResident(invite.dataset.inviteResident, invite.dataset.stationId || state.selectedStation);
            return;
        }
        const stationCollect = event.target.closest('[data-collect-station]');
        if (stationCollect) {
            void collectStation(stationCollect.dataset.collectStation);
            return;
        }
        const reward = event.target.closest('[data-claim-keep-reward]');
        if (reward) {
            void claimReward(reward.dataset.claimKeepReward);
            return;
        }
        const craft = event.target.closest('[data-craft-recipe]');
        if (craft) {
            void craftRecipe(craft.dataset.craftRecipe);
            return;
        }
        const decoration = event.target.closest('[data-place-decoration]');
        if (decoration) {
            void placeDecoration(decoration.dataset.roomId, decoration.dataset.placeDecoration,
                decoration.dataset.displayed !== 'true');
            return;
        }
        const build = event.target.closest('[data-start-build]');
        if (build) {
            void startBuild(build.dataset.startBuild);
            return;
        }
        const theme = event.target.closest('[data-set-theme]');
        if (theme) {
            void setHallTheme(theme.dataset.setTheme);
            return;
        }
        const favorite = event.target.closest('[data-set-favorite]');
        if (favorite) {
            void setFavorite(favorite.dataset.setFavorite);
            return;
        }
        const conversation = event.target.closest('[data-conversation-id]');
        if (conversation) {
            openConversation(conversation.dataset.conversationId);
            return;
        }
        const choice = event.target.closest('[data-dialogue-choice]');
        if (choice) {
            void chooseDialogue(choice.dataset.dialogueChoice);
            return;
        }
        if (event.target.closest('[data-dialogue-done]')) closeDialogue();
        if (event.target.closest('[data-collect-inline]')) void collectTimber();
    }

    async function loadSnapshot(announceDiscoveries = false) {
        const data = await fetchJson('/api/keep');
        if (data?.error) {
            // Only an authoritative 401 means "sign in". A dropped connection or a
            // backend blip must not ask a keeper who is already signed in to hand
            // over their password again — offer a retry instead.
            showGate(data.error, data.status === 401 ? 'signin' : 'retry');
            hideLoading();
            return;
        }
        applySnapshot(data, announceDiscoveries);
        hideLoading();
    }

    async function perform(path, payload) {
        if (state.busy || !state.snapshot) return null;
        state.busy = true;
        document.body.classList.add('keep-busy');
        try {
            const previous = state.snapshot;
            const data = await fetchJson(path, {
                method: 'POST',
                body: JSON.stringify({
                    ...payload,
                    requestId: requestId(),
                    expectedVersion: Number(previous.stateVersion) || 0
                })
            });
            if (data?.error) {
                if (data.status === 409 && !state.testMode) {
                    await loadSnapshot();
                }
                showNotice(data.error, 'Keep update');
                return null;
            }
            applySnapshot(data, true);
            return data;
        } finally {
            state.busy = false;
            document.body.classList.remove('keep-busy');
        }
    }

    async function collectTimber() {
        if (projectedAvailable() <= 0) return;
        await collectStation('woodlot');
    }

    async function collectStation(stationId) {
        const station = stationById(stationId);
        if (!station || projectedStationAvailable(station) <= 0) return;
        const data = await perform('/api/keep/collect', { stationId });
        if (data?.collected) playCollectBurst(stationId, number(data.collected.amount));
    }

    async function setHallTheme(themeId) {
        const data = await perform('/api/keep/theme', { themeId });
        if (data?.themeChanged) showNotice(`${data.themeChanged.name} colors raised over the hall.`, 'Hall theme');
    }

    async function setFavorite(residentId) {
        const current = state.snapshot?.favorite?.residentId || '';
        const next = current === residentId ? '' : residentId;
        const data = await perform('/api/keep/favorite', { residentId: next });
        if (data?.favoriteChanged) {
            showNotice(data.favoriteChanged.residentId
                ? `${data.favoriteChanged.name} inspires the whole keep · +${number(data.favoriteChanged.bonusPercent)}% output.`
                : 'The shrine stands ready for a new favorite.', 'Favorite Siegeling');
        }
    }

    async function inviteResident(residentId, stationId) {
        const station = stationById(stationId);
        const current = station?.residentId || '';
        await perform('/api/keep/resident', { stationId, residentId: current === residentId ? '' : residentId });
    }

    async function setEnclaveResident(slot, residentId) {
        const current = state.snapshot?.enclave?.slots?.[slot]?.residentId || '';
        await perform('/api/keep/enclave/resident', { slot, residentId: current === residentId ? '' : residentId });
    }

    async function claimReward(rewardId) {
        const data = await perform('/api/keep/reward', { rewardId });
        if (data?.rewardClaimed) {
            const reward = data.rewardClaimed;
            const parts = [`+${number(reward.gold)} Siegecoins`, `+${number(reward.remnants)} Remnants`];
            if (reward.decorationName) parts.push(`✿ ${reward.decorationName}`);
            showNotice(parts.join(' · '), 'Sanctuary reward');
        }
    }

    async function startBuild(buildId) {
        const data = await perform('/api/keep/build', { buildId });
        if (data) openPanel('projects');
    }

    async function openLore(loreId) {
        const item = loreById(loreId);
        if (!item) return;
        state.expandedLoreId = state.expandedLoreId === loreId ? '' : loreId;
        if (!item.read) {
            if (!state.sessionReadLoreIds.includes(loreId)) state.sessionReadLoreIds.push(loreId);
            await perform('/api/keep/lore/read', { loreId });
            state.expandedLoreId = loreId;
        } else {
            renderPanel();
        }
    }

    async function toggleMemorabilia(loreId, displayed) {
        await perform('/api/keep/memorabilia', { loreId, displayed });
    }

    function openConversation(conversationId) {
        const conversation = conversationById(conversationId);
        if (!conversation) return;
        state.activeConversationId = conversation.id;
        const portrait = document.getElementById('dialoguePortrait');
        portrait?.classList.toggle('is-archivist', conversation.npcId === 'archivist_pell');
        const kind = String(conversation.kind || '').toUpperCase();
        portrait?.classList.toggle('is-visitor', kind === 'VISITOR' || kind === 'INTERACTION');
        portrait?.classList.toggle('is-interaction', kind === 'INTERACTION');
        text('dialogueRole', conversation.npcRole);
        text('dialogueName', conversation.npcName);
        text('dialogueKicker', conversation.kicker);
        text('dialoguePrompt', conversation.prompt);
        const summary = document.getElementById('dialogueSummary');
        if (summary) {
            summary.textContent = '';
            summary.classList.add('hidden');
        }
        const affinity = document.getElementById('dialogueAffinity');
        if (affinity) {
            affinity.textContent = '';
            affinity.classList.add('hidden');
        }
        const choices = document.getElementById('dialogueChoices');
        if (choices) {
            choices.innerHTML = (conversation.choices || []).map((choice) => {
                const cost = choiceCostHint(choice);
                const disabled = choice.affordable === false;
                const rng = choice.hasRng ? '<i class="choice-rng">chance</i>' : '';
                return `<button type="button" data-dialogue-choice="${escapeAttr(choice.id)}" ${disabled ? 'disabled' : ''}>
                    <span>${escapeHtml(choice.label)}</span>
                    ${cost || rng ? `<small>${escapeHtml(cost)}${cost && rng ? ' · ' : ''}${rng ? 'chance' : ''}</small>` : ''}
                </button>`;
            }).join('');
        }
        document.getElementById('dialogueOverlay')?.classList.remove('hidden');
    }

    function choiceCostHint(choice) {
        const parts = [];
        if (number(choice.timberCost) > 0) parts.push(`${number(choice.timberCost)} timber`);
        for (const cost of choice.materialCosts || []) {
            if (number(cost.amount) > 0) parts.push(`${number(cost.amount)} ${cost.name || cost.id}`);
        }
        return parts.join(' · ');
    }

    async function chooseDialogue(choiceId) {
        const conversationId = state.activeConversationId;
        const data = await perform('/api/keep/dialogue/choose', { conversationId, choiceId });
        if (!data) return;
        const result = data.dialogueResult || {};
        text('dialoguePrompt', result.response || 'The conversation settles into a thoughtful silence.');
        const summary = document.getElementById('dialogueSummary');
        if (summary) {
            summary.textContent = result.summary || '';
            summary.classList.toggle('hidden', !result.summary);
        }
        const affinity = document.getElementById('dialogueAffinity');
        if (affinity) {
            const delta = number(result.relationshipDelta);
            const stage = result.stage || relationshipStage(result.trust);
            const trust = number(result.trust);
            const trustMax = Math.max(1, number(result.trustMax) || 7);
            let line = '';
            if (delta > 0) line = `Affinity +${delta} · ${stage} (${trust}/${trustMax})`;
            else if (delta < 0) line = `Affinity ${delta} · ${stage} (${trust}/${trustMax})`;
            else if (result.trust != null) line = `Affinity unchanged · ${stage} (${trust}/${trustMax})`;
            affinity.textContent = line;
            affinity.classList.toggle('hidden', !line);
            affinity.classList.toggle('is-up', delta > 0);
            affinity.classList.toggle('is-down', delta < 0);
        }
        if (result.summary && result.summary !== 'No stores changed.') {
            showNotice(result.summary, result.npcName || 'Visitor');
        } else if (number(result.relationshipDelta) !== 0) {
            const delta = number(result.relationshipDelta);
            showNotice(delta > 0 ? `Affinity +${delta}` : `Affinity ${delta}`, result.npcName || 'Voice');
        }
        const choices = document.getElementById('dialogueChoices');
        if (choices) choices.innerHTML = '<button type="button" data-dialogue-done>Return to the keep</button>';
        renderPanel();
    }

    function closeDialogue() {
        state.activeConversationId = '';
        document.getElementById('dialogueOverlay')?.classList.add('hidden');
    }

    function applySnapshot(next, announceDiscoveries) {
        if (!next || typeof next !== 'object') return;
        const previousLore = new Set((state.snapshot?.lore || []).map((item) => item.id));
        state.snapshot = next;
        if (next.offlineReport) state.pendingOfflineReport = clone(next.offlineReport);
        state.receivedAtMs = Date.now() + state.debugTimeOffsetMs;
        announceKeeperProgress(next);
        renderAll();
        if (announceDiscoveries) {
            const ids = Array.isArray(next.newLoreUnlocks)
                ? next.newLoreUnlocks
                : (next.lore || []).map((item) => item.id).filter((id) => !previousLore.has(id));
            enqueueDiscoveries(ids);
        }
    }

    function renderAll() {
        const snapshot = state.snapshot;
        if (!snapshot) return;
        text('keepName', snapshot.keepName || 'My Keep');
        text('chapterLabel', `Chapter ${roman(snapshot.chapter?.number || 1)} · ${snapshot.chapter?.title || 'The Wounded Ground'}`);
        const materials = snapshot.resources?.materials || [];
        const materialAmount = number(snapshot.resources?.timber)
            + materials.reduce((sum, item) => sum + number(item.amount), 0);
        const materialCapacity = number(snapshot.resources?.timberCapacity)
            + materials.reduce((sum, item) => sum + (number(item.capacity) || number(snapshot.resources?.materialCapacity)), 0);
        text('materialAmount', `${materialAmount}/${materialCapacity}`);
        renderHeaderCapacityCounters();

        const scene = document.getElementById('keepScene');
        const visual = snapshot.visualState || {};
        const hallLevel = Math.max(1, number(visual.hallLevel) || 1);
        if (scene) {
            scene.dataset.healingStage = String(number(visual.healingStage));
            scene.dataset.archiveRestored = String(Boolean(visual.archiveRestored));
            scene.dataset.woodlotLevel = String(number(visual.woodlotLevel) || 1);
            scene.dataset.storehouseLevel = String(number(visual.storehouseLevel));
            scene.dataset.gardenLevel = String(number(visual.gardenLevel));
            scene.dataset.forgeLevel = String(number(visual.forgeLevel));
            scene.dataset.fridgeLevel = String(number(visual.fridgeLevel));
            scene.dataset.generatorLevel = String(number(visual.generatorLevel));
            scene.dataset.quarryLevel = String(number(visual.quarryLevel));
            scene.dataset.kitchenLevel = String(number(visual.kitchenLevel));
            scene.dataset.buildersYardLevel = String(number(visual.buildersYardLevel));
            scene.dataset.enclaveLevel = String(number(visual.enclaveLevel));
            scene.dataset.hallLevel = String(hallLevel);
            scene.dataset.hallTheme = visual.hallTheme || 'covenant';
            for (let level = 2; level <= HALL_MAX_LEVEL; level++) scene.classList.toggle(`hall-l${level}`, hallLevel >= level);
            // Space-separated targets let CSS [data-constructing~="x"] scaffold both crews' sites.
            scene.dataset.constructing = activeConstructionList()
                .map((item) => constructionTarget(item.id)).filter(Boolean).join(' ');
        }
        renderFavoriteShrine();
        renderJourney();
        const rank = snapshot.keepRank || {};
        text('hallRankLabel', rank.name
            ? `${rank.name} · Rank ${number(rank.level) || 1}/${number(rank.maxLevel) || HALL_MAX_LEVEL}`
            : 'Sanctuary founded');
        const builtFacilities = ['garden', 'forge', 'fridge', 'generator', 'quarry', 'kitchen']
            .filter((id) => number(visual[`${id}Level`]) > 0).length + (number(visual.buildersYardLevel) > 0 ? 1 : 0);
        text('quarterLabel', builtFacilities ? `${builtFacilities}/7 facilities restored` : 'Foundations awaiting restoration');
        const enclave = snapshot.enclave || {};
        text('enclaveLabel', enclave.built
            ? `${number(enclave.residentCount)}/${number(enclave.capacity) || 5} residents · missions`
            : 'Build separately from the work quarter');
        const readyMissions = (enclave.slots || []).filter((slot) => slot.mission?.complete && !slot.mission?.claimed).length;
        document.getElementById('enclaveMissionAlert')?.classList.toggle('hidden', readyMissions <= 0);
        renderEnclaveResidents();

        const station = snapshot.station || {};
        text('woodlotLabel', `Level ${number(station.level) || 1} · ${formatRate(station.ratePerMinute)}/min`);
        const resident = station.resident;
        const worker = document.getElementById('residentWorker');
        worker?.classList.toggle('hidden', !resident);
        setResidentOverlayArt(document.getElementById('residentWorkerArt'), resident);

        const archiveRestored = Boolean(visual.archiveRestored);
        text('archiveName', archiveRestored ? 'Living Archive' : 'Ruined Archive');
        text('archiveLabel', archiveRestored ? 'Letters, relics, and remembered voices' : 'Records buried beneath the stones');
        const archiveUnread = (snapshot.lore || []).some((item) => !item.read && item.id !== 'charter_three_promises');
        document.getElementById('archiveAlert')?.classList.toggle('hidden', !archiveRestored || !archiveUnread);
        const unread = number(snapshot.unreadLoreCount);
        text('unreadBadge', unread);
        document.getElementById('unreadBadge')?.classList.toggle('hidden', unread <= 0);
        document.getElementById('conversationDot')?.classList.toggle('hidden', !(snapshot.availableConversations || []).length);
        renderConstruction();
        renderNoticeCenter();
        updateLiveCounters();
        if (state.panel) renderPanel();
        if (state.interior) renderInterior();
        resetViewportScroll();
    }

    function updateLiveState() {
        if (!state.snapshot) return;
        if (state.testMode) completeMockConstructionIfReady();
        updateLiveCounters();
        const construction = activeConstructionList().length > 0;
        if (construction && constructionRemaining() <= 0 && !state.testMode && !state.completionRefreshPending) {
            state.completionRefreshPending = true;
            window.setTimeout(async () => {
                await loadSnapshot(true);
                state.completionRefreshPending = false;
            }, 800);
        }
    }

    function updateLiveCounters() {
        if (!state.snapshot) return;
        const available = projectedAvailable();
        const totalReady = (state.snapshot.stations || [state.snapshot.station]).reduce(
            (sum, station) => sum + projectedStationAvailable(station), 0);
        text('stationAvailable', totalReady);
        renderHeaderCapacityCounters();
        text('collectAmount', `${available} timber`);
        const collect = document.getElementById('collectButton');
        if (collect) collect.disabled = available <= 0 || number(state.snapshot.resources?.timber) >= number(state.snapshot.resources?.timberCapacity) || state.busy;
        document.getElementById('productionReady')?.classList.toggle('hidden', available <= 0);
        updateStockpileVisuals();
        renderConstruction();
        // The Keep Activity tray also owns live construction clocks. Updating
        // these lightweight data-bound values every second keeps both the tray
        // and any open project/interior panel synchronized without rebuilding
        // either surface and disturbing its scroll position.
        updatePanelLiveValues();
    }

    /** Stockpiles in the scene grow with each station's uncollected stores:
        tier 0 empty → 4 full (overgrowth). Claiming clears them with a burst. */
    function updateStockpileVisuals() {
        const scene = document.getElementById('keepScene');
        if (!scene) return;
        for (const station of state.snapshot.stations || [state.snapshot.station]) {
            if (!station?.id) continue;
            const key = `fill${station.id.charAt(0).toUpperCase()}${station.id.slice(1)}`;
            scene.dataset[key] = String(fillTier(station));
        }
        const interior = document.getElementById('keepInterior');
        if (interior) {
            const station = stationById(state.interior);
            interior.dataset.fill = station ? String(fillTier(station)) : '';
        }
    }

    function fillTier(station) {
        if (!station) return 0;
        const capacity = Math.max(1, number(station.storageCapacity));
        const ratio = projectedStationAvailable(station) / capacity;
        if (ratio >= 1) return 4;
        if (ratio >= 0.66) return 3;
        if (ratio >= 0.33) return 2;
        return ratio > 0 ? 1 : 0;
    }

    function activeConstructionList() {
        const snapshot = state.snapshot || {};
        if (Array.isArray(snapshot.activeConstructions)) return snapshot.activeConstructions.filter(Boolean);
        return snapshot.activeConstruction ? [snapshot.activeConstruction] : [];
    }

    function renderHeaderCapacityCounters() {
        const snapshot = state.snapshot || {};
        const slots = snapshot.siegelingSlots || {};
        const activeSiegelings = (snapshot.stations || [snapshot.station]).filter((station) => station?.residentId).length
            + (snapshot.enclave?.slots || []).filter((slot) => slot?.residentId).length;
        const siegelingCapacity = Math.max(1, activeSiegelings, number(slots.capacity));
        text('siegelingSlotAmount', `${activeSiegelings}/${siegelingCapacity}`);
        const siegelingPill = document.querySelector('.siegeling-pill');
        if (siegelingPill) {
            const available = Math.max(0, siegelingCapacity - activeSiegelings);
            siegelingPill.setAttribute('aria-label', `Open Siegeling assignments: ${activeSiegelings} active, ${available} available`);
            siegelingPill.title = `${activeSiegelings} active · ${available} available`;
        }

        const activeTeams = activeConstructionList().length;
        const teamCapacity = Math.max(1, number(snapshot.constructionSlots) || 1);
        text('constructionTeamAmount', `${activeTeams}/${teamCapacity}`);
        const constructionPill = document.querySelector('.construction-team-pill');
        if (constructionPill) {
            const available = Math.max(0, teamCapacity - activeTeams);
            constructionPill.setAttribute('aria-label', `Open construction projects: ${activeTeams} active, ${available} available`);
            constructionPill.title = `${activeTeams} active · ${available} available`;
        }
    }

    function renderFavoriteShrine() {
        const favorite = state.snapshot?.favorite || {};
        const shrine = document.getElementById('favoriteShrine');
        if (!shrine) return;
        const resident = favorite.resident || null;
        shrine.classList.toggle('has-favorite', Boolean(resident));
        setResidentOverlayArt(document.getElementById('favoriteShrineArt'), resident);
        text('favoriteShrineLabel', resident
            ? `${resident.name} · +${number(favorite.bonusPercent)}%`
            : 'Favorite');
        shrine.setAttribute('aria-label', resident
            ? `Favorite Siegeling: ${resident.name}, +${number(favorite.bonusPercent)}% keep-wide. Change inside the Covenant Hall.`
            : 'Choose a favorite Siegeling inside the Covenant Hall');
    }

    function renderEnclaveResidents() {
        const slots = state.snapshot?.enclave?.slots || [];
        document.querySelectorAll('[data-enclave-resident-slot]').forEach((node) => {
            const slot = slots[number(node.dataset.enclaveResidentSlot)] || {};
            node.classList.toggle('has-resident', Boolean(slot.resident));
            setResidentOverlayArt(node, slot.resident || null);
            node.title = slot.resident?.name || '';
        });
    }

    function constructionTarget(constructionId) {
        const id = String(constructionId || '');
        if (!id) return '';
        if (id.startsWith('hall_level_')) return 'hall';
        if (id === 'restore_archive') return 'archive';
        if (id === 'build_enclave') return 'enclave';
        if (id === 'woodlot_level_2') return 'woodlot';
        if (id === 'raise_storehouse' || id === 'storehouse_level_2') return 'storehouse';
        if (id.startsWith('build_')) return id.slice('build_'.length);
        if (id.endsWith('_level_2')) return id.slice(0, -'_level_2'.length);
        return '';
    }

    function playCollectBurst(stationId, amount) {
        const anchor = stationId === 'woodlot'
            ? document.querySelector('.woodlot-hotspot')
            : document.querySelector(`.quarter-building[data-stockpile="${stationId}"]`)
                || document.querySelector('.quarter-hotspot');
        if (!anchor) return;
        anchor.classList.remove('is-clearing');
        void anchor.offsetWidth; // restart the clearing animation on rapid re-collects
        anchor.classList.add('is-clearing');
        window.setTimeout(() => anchor.classList.remove('is-clearing'), 1100);
        const scene = document.getElementById('keepScene');
        if (!scene || !(amount > 0)) return;
        const chip = document.createElement('span');
        chip.className = 'collect-float';
        chip.textContent = `+${amount}`;
        const rect = anchor.getBoundingClientRect();
        const sceneRect = scene.getBoundingClientRect();
        if (sceneRect.width > 0 && sceneRect.height > 0) {
            chip.style.left = `${((rect.left + rect.width / 2 - sceneRect.left) / sceneRect.width) * 100}%`;
            chip.style.top = `${((rect.top - sceneRect.top) / sceneRect.height) * 100}%`;
        }
        scene.appendChild(chip);
        window.setTimeout(() => chip.remove(), 1500);
    }

    function constructionBannerSignature(constructions) {
        return constructions.map((item) => String(item?.id || '')).join('|');
    }

    function constructionEntryProgress(entry) {
        if (!entry) return 0;
        const started = Date.parse(entry.startedAt || '') || nowMs();
        const completes = Date.parse(entry.completesAt || '') || nowMs();
        if (completes <= started) return 1;
        return clamp((nowMs() - started) / (completes - started), 0, 1);
    }

    function renderConstruction() {
        const constructions = activeConstructionList();
        const banner = document.getElementById('constructionBanner');
        const jobs = document.getElementById('constructionBannerJobs');
        banner?.classList.toggle('hidden', !constructions.length);
        if (!jobs) {
            renderConstructionCollapseState();
            return;
        }
        if (!constructions.length) {
            jobs.innerHTML = '';
            delete jobs.dataset.signature;
            renderConstructionCollapseState();
            return;
        }
        // Rebuild only when the crew set changes so the progress bars keep a
        // continuous width transition while timers tick every second.
        const signature = constructionBannerSignature(constructions);
        if (jobs.dataset.signature !== signature) {
            jobs.dataset.signature = signature;
            jobs.innerHTML = constructions.map((item, index) => {
                const progress = Math.round(constructionEntryProgress(item) * 100);
                return `<div class="construction-job" data-construction-index="${index}">
                    <span><strong>${escapeHtml(projectName(item.id))}</strong><small data-live-banner-time="${index}">${escapeHtml(formatDuration(constructionEntryRemaining(item)))}</small></span>
                    <i aria-hidden="true"><b data-live-banner-meter="${index}" style="width:${progress}%"></b></i>
                </div>`;
            }).join('');
        }
        constructions.forEach((item, index) => {
            const time = jobs.querySelector(`[data-live-banner-time="${index}"]`);
            const meter = jobs.querySelector(`[data-live-banner-meter="${index}"]`);
            if (time) time.textContent = formatDuration(constructionEntryRemaining(item));
            if (meter) meter.style.width = `${Math.round(constructionEntryProgress(item) * 100)}%`;
        });
        renderConstructionCollapseState();
    }

    function toggleConstructionBanner() {
        state.constructionCollapsed = !state.constructionCollapsed;
        renderConstructionCollapseState();
    }

    function renderConstructionCollapseState() {
        const banner = document.getElementById('constructionBanner');
        const toggle = document.getElementById('constructionToggle');
        banner?.classList.toggle('is-collapsed', state.constructionCollapsed);
        if (!toggle) return;
        const expanded = !state.constructionCollapsed;
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', expanded ? 'Collapse construction status' : 'Expand construction status');
        const icon = toggle.querySelector('[aria-hidden="true"]');
        if (icon) icon.textContent = expanded ? '−' : '+';
    }

    function openPanel(panel) {
        // Entering the Chronicle afresh files everything read on the last visit under Read.
        if (panel !== state.panel) state.sessionReadLoreIds = [];
        state.panel = panel || '';
        document.querySelector('.keep-main')?.classList.add('panel-open');
        document.getElementById('keepPanel')?.setAttribute('aria-hidden', 'false');
        renderPanel();
    }

    function closePanel() {
        state.panel = '';
        document.querySelector('.keep-main')?.classList.remove('panel-open');
        document.getElementById('keepPanel')?.setAttribute('aria-hidden', 'true');
    }

    function renderPanel() {
        if (!state.snapshot || !state.panel) return;
        const body = document.getElementById('panelBody');
        if (!body) return;
        if (state.panel.startsWith('building:')) {
            const id = state.panel.split(':')[1];
            renderBuildingPanel(id, body);
        } else if (state.panel === 'residents') {
            setPanelHeading('Covenant residents', 'Invite a partner');
            body.innerHTML = residentsMarkup();
        } else if (state.panel === 'projects') {
            setPanelHeading('Restoration projects', 'Build the promise');
            body.innerHTML = projectsMarkup();
        } else if (state.panel === 'facilities') {
            setPanelHeading('Elemental Quarter', 'Shared work, willing hands');
            body.innerHTML = facilitiesMarkup();
        } else if (state.panel === 'chronicle') {
            setPanelHeading('The Living Chronicle', 'Letters & memorabilia');
            body.innerHTML = chronicleMarkup();
        } else if (state.panel === 'conversations') {
            setPanelHeading('Voices of the sanctuary', 'Conversations');
            body.innerHTML = conversationsMarkup();
        } else if (state.panel === 'inventory') {
            setPanelHeading('Keep inventory', 'Raw & manufactured');
            body.innerHTML = inventoryMarkup();
        }
    }

    function renderBuildingPanel(id, body) {
        const heading = buildingHeading(id);
        setPanelHeading(heading.title, heading.kicker);
        body.innerHTML = buildingMarkup(id);
    }

    function buildingHeading(id) {
        if (id === 'woodlot') {
            const station = state.snapshot.station || {};
            return { title: 'Restorative Woodlot', kicker: `Level ${number(station.level) || 1}` };
        }
        if (id === 'archive') {
            const restored = Boolean(state.snapshot.visualState?.archiveRestored);
            return { title: restored ? 'Living Archive' : 'Ruined Archive', kicker: restored ? 'Recovered voices' : 'Buried history' };
        }
        if (id === 'enclave') {
            const enclave = state.snapshot.enclave || {};
            return { title: 'Siegeling Enclave', kicker: enclave.built ? `${number(enclave.residentCount)}/${number(enclave.capacity) || 5} residents` : 'A sanctuary within the sanctuary' };
        }
        const station = stationById(id);
        if (station) return { title: station.name, kicker: `Level ${number(station.level)} · ${station.resourceName || 'Elemental workshop'}` };
        const rank = state.snapshot.keepRank || {};
        return { title: 'Covenant Hall', kicker: rank.name ? `${rank.name} · Rank ${number(rank.level) || 1}` : 'The three promises' };
    }

    function buildingMarkup(id) {
        if (id === 'woodlot') {
            const station = state.snapshot.station || {};
            return `
                <p class="panel-intro">The grove is cultivated with resident Siegelings. Fallen limbs and willing growth replace clear-cutting.</p>
                <section class="detail-card">
                    <h3>${escapeHtml(String(projectedAvailable()))} timber ready</h3>
                    <div class="meter"><i data-live-woodlot-meter style="width:${woodlotFill()}%"></i></div>
                    <div class="cost-row"><span>${escapeHtml(formatRate(station.ratePerMinute))} per minute</span><strong>${escapeHtml(String(station.storageCapacity || 0))} storage</strong></div>
                    <div class="button-row"><button class="panel-button" type="button" data-collect-inline ${projectedAvailable() <= 0 ? 'disabled' : ''}>Collect timber</button><button class="panel-button secondary" type="button" data-open-panel="residents">Invite resident</button></div>
                </section>
                ${station.resident ? `<section class="detail-card"><span class="eyebrow">Current partner</span><h3>${escapeHtml(station.resident.name)}</h3><p>${escapeHtml(station.resident.affinityLabel || '')}. Invited residents remain available in decks and expeditions.</p></section>` : `<div class="empty-state">No resident has been invited. The Woodlot still produces normally.</div>`}
                ${craftingMarkup('woodlot')}`;
        }
        if (id === 'archive') {
            const restored = Boolean(state.snapshot.visualState?.archiveRestored);
            return restored
                ? `<p class="panel-intro">Letters, artifacts, and translated memories are preserved with their disagreements intact.</p><section class="detail-card"><h3>${number(state.snapshot.lore?.length)} discoveries</h3><p>${number(state.snapshot.unreadLoreCount)} entries remain unread. Memorabilia displayed here also appears in the sanctuary scene.</p><div class="button-row"><button class="panel-button" type="button" data-open-panel="chronicle">Open Chronicle</button><button class="panel-button secondary" type="button" data-open-panel="conversations">Speak with visitors</button></div></section>`
                : `<p class="panel-intro">A collapsed record hall lies beneath the eastern wall. Its stones protect letters from the Age Before Cards.</p>${projectsMarkup()}`;
        }
        if (id === 'enclave') return enclaveMarkup();
        if (stationById(id)) return facilityInteriorMarkup(id);
        return `<p class="panel-intro">The sanctuary is founded on Stewardship, Consent, and Shelter.</p>${rankCardMarkup()}${favoriteChooserMarkup()}<section class="detail-card"><h3>The Keeper's Charter</h3><p>No Siegeling will be compelled to labor or fight. The land will be repaired rather than consumed, and those hunted by Akhar may seek refuge here.</p><div class="button-row"><button class="panel-button" type="button" data-open-panel="chronicle">Read the charter</button></div></section>${themePickerMarkup()}${craftingMarkup('great_hall')}`;
    }

    function enclaveMarkup() {
        const enclave = state.snapshot.enclave || {};
        if (!enclave.built) return `<p class="panel-intro">The Enclave is a home apart from the Elemental Quarter. Residents gather here by choice, socialize, and offer personal missions.</p>${projectsMarkup()}`;
        const residents = state.snapshot.residents || [];
        const slots = enclave.slots || [];
        return `<p class="panel-intro">Invite up to five owned Siegelings. They remain available everywhere else, appear together in this room, and each brings one sanctuary mission.</p>
            <div class="enclave-slot-list">${slots.map((slot, index) => {
                const resident = slot.resident;
                const mission = slot.mission;
                const missionMarkup = mission ? `<div class="enclave-mission ${mission.complete ? 'is-complete' : ''}"><span class="eyebrow">${mission.claimed ? 'Mission complete' : 'Resident mission'}</span><h4>${escapeHtml(mission.name)}</h4><p>${escapeHtml(mission.description)}</p><div class="meter"><i style="width:${clamp(number(mission.progress) / Math.max(1, number(mission.goal)) * 100, 0, 100)}%"></i></div><div class="cost-row"><span>${number(mission.progress)}/${number(mission.goal)}</span><strong>${number(mission.gold)} Siegecoins · ${number(mission.remnants)} Remnants</strong></div>${mission.claimed ? '<small>Reward claimed</small>' : `<button class="panel-button" type="button" data-claim-keep-reward="${escapeAttr(mission.id)}" ${mission.complete ? '' : 'disabled'}>${mission.complete ? 'Claim mission reward' : 'Mission in progress'}</button>`}</div>` : '';
                const choices = residents.map((choice) => `<button type="button" class="enclave-resident-choice ${choice.id === slot.residentId ? 'active' : ''}" data-enclave-resident="${escapeAttr(choice.id)}" data-enclave-slot="${index}" style="--resident-color:${escapeAttr(elementColors[choice.element] || elementColors.NEUTRAL)}"><span>${residentAvatarContent(choice)}</span><small>${escapeHtml(choice.name)}</small></button>`).join('');
                return `<section class="detail-card enclave-slot-card"><span class="eyebrow">Enclave space ${index + 1}</span>${resident ? `<div class="enclave-current"><span style="--resident-color:${escapeAttr(elementColors[resident.element] || elementColors.NEUTRAL)}">${residentAvatarContent(resident)}</span><div><h3>${escapeHtml(resident.name)}</h3><small>${escapeHtml(titleCase(resident.element))} · ${escapeHtml(titleCase(resident.rarity))}</small></div><button type="button" data-enclave-resident="${escapeAttr(resident.id)}" data-enclave-slot="${index}">Clear</button></div>` : '<p>This space is open.</p>'}${missionMarkup}<details><summary>${resident ? 'Change resident' : 'Invite a resident'}</summary><div class="enclave-resident-choices">${choices}</div></details></section>`;
            }).join('')}</div>`;
    }

    /** Choosing a favorite happens inside the Covenant Hall — a keep-wide honor,
        not a per-station assignment, so it lives here rather than the residents dock. */
    function favoriteChooserMarkup() {
        const residents = state.snapshot.residents || [];
        const favorite = state.snapshot.favorite || {};
        if (!residents.length) {
            return `<section class="detail-card favorite-card"><span class="eyebrow">Favorite Siegeling</span><h3>The Keeper's Favor</h3><p>Owned Siegelings will gather here. Honor one to inspire the whole keep.</p></section>`;
        }
        const current = favorite.resident
            ? `<div class="favorite-current"><span class="favorite-current-avatar" style="--resident-color:${escapeAttr(elementColors[favorite.resident.element] || elementColors.NEUTRAL)}">${residentAvatarContent(favorite.resident)}</span><span><strong>${escapeHtml(favorite.resident.name)}</strong><small>${escapeHtml(favorite.label || '')}</small></span></div>`
            : `<p>No favorite is honored yet. Choose one to inspire the whole keep — the bonus scales with their rarity and lifts every station's output, tribute, and orders.</p>`;
        const choices = residents.map((resident) => {
            const isFavorite = favorite.residentId === resident.id;
            return `<button type="button" class="favorite-choice ${isFavorite ? 'active' : ''}" data-set-favorite="${escapeAttr(resident.id)}" style="--resident-color:${escapeAttr(elementColors[resident.element] || elementColors.NEUTRAL)}" aria-pressed="${isFavorite ? 'true' : 'false'}">
                <span class="favorite-choice-avatar">${residentAvatarContent(resident)}</span>
                <span class="favorite-choice-copy"><strong>${escapeHtml(resident.name)}</strong><small>${escapeHtml(titleCase(resident.element))} · ${escapeHtml(titleCase(resident.rarity || 'COMMON'))}</small></span>
                <i class="favorite-choice-star" aria-hidden="true">${isFavorite ? '★' : '☆'}</i>
            </button>`;
        }).join('');
        return `<section class="detail-card favorite-card"><span class="eyebrow">Favorite Siegeling</span><h3>The Keeper's Favor</h3>${current}<div class="favorite-choices">${choices}</div></section>`;
    }

    function rankCardMarkup() {
        const rank = state.snapshot.keepRank || {};
        const level = number(rank.level) || 1;
        const max = number(rank.maxLevel) || HALL_MAX_LEVEL;
        const dots = Array.from({ length: max }, (item, index) =>
            `<i class="${index < level ? 'filled' : ''}"></i>`).join('');
        const next = rank.nextName
            ? `<p>Next rank: <strong>${escapeHtml(rank.nextName)}</strong>. ${escapeHtml(rank.nextHint || 'Upgrade the hall from Projects.')}</p>`
            : '<p>The Grand Keep stands complete — every rank of the sanctuary has been raised.</p>';
        return `<section class="detail-card rank-card"><span class="eyebrow">Keep rank ${level}/${max}</span>
            <h3>${escapeHtml(rank.name || 'Ruined Camp')}</h3>
            <div class="rank-dots" aria-hidden="true">${dots}</div>${next}
            <div class="button-row"><button class="panel-button secondary" type="button" data-open-panel="projects">Open Projects</button></div></section>`;
    }

    function themePickerMarkup() {
        const themes = state.snapshot.hallThemes || [];
        if (!themes.length) return '';
        return `<section class="detail-card theme-card"><span class="eyebrow">Hall colors</span><h3>Banners & light</h3>
            <p>Recolor the hall's banners, lanterns, and tower light across the whole keep. Purely cosmetic — production never changes.</p>
            <div class="theme-swatches">${themes.map((theme) => `
                <button type="button" class="theme-swatch ${theme.active ? 'active' : ''}" data-set-theme="${escapeAttr(theme.id)}"
                    style="--swatch:${escapeAttr(theme.accent)};--swatch-trim:${escapeAttr(theme.trim)}" title="${escapeAttr(theme.name)}">
                    <i aria-hidden="true"></i><small>${escapeHtml(theme.name)}</small>
                </button>`).join('')}</div></section>`;
    }

    function facilityInteriorMarkup(id) {
        const station = stationById(id) || {};
        const ready = projectedStationAvailable(station);
        return `<p class="panel-intro">${facilityInteriorDescription(id)}</p>
            <section class="detail-card"><h3>${ready} ${escapeHtml(station.resourceName || 'materials')} ready</h3>
            <div class="meter"><i data-station-meter="${escapeAttr(id)}" style="width:${stationFill(station)}%"></i></div>
            <div class="cost-row"><span>${escapeHtml(formatRate(station.ratePerMinute))} per minute</span><strong>${number(station.storageCapacity)} local storage</strong></div>
            <div class="button-row"><button class="panel-button" type="button" data-collect-station="${escapeAttr(id)}" ${ready <= 0 ? 'disabled' : ''}>Collect ${escapeHtml(station.resourceName || 'materials')}</button><button class="panel-button secondary" type="button" data-open-panel="residents" data-select-station="${escapeAttr(id)}">Assign resident</button></div></section>
            ${craftingMarkup(id)}`;
    }

    function craftingMarkup(roomId) {
        const recipes = (state.snapshot.recipes || []).filter((item) => item.roomId === roomId && item.available);
        const decorations = (state.snapshot.decorations || []).filter((item) => item.roomId === roomId && item.crafted);
        const tools = recipes.filter((item) => item.type === 'TOOL');
        const roomDecorations = recipes.filter((item) => item.type === 'DECORATION');
        const cards = recipes.length ? recipes.map((recipe) => `<section class="craft-card ${recipe.crafted ? 'is-crafted' : ''}">
            <span class="craft-type">${escapeHtml(recipe.type)}${number(recipe.tier) ? ` · ${number(recipe.tier)}/5` : ''}</span><h3>${escapeHtml(recipe.name)}</h3><p>${escapeHtml(recipe.description || '')}</p>
            <small>${escapeHtml(recipe.bonus || '')}</small><div class="craft-costs">${(recipe.costs || []).map((cost) => `<span class="${materialHeld(cost.id) >= number(cost.amount) ? 'is-met' : 'is-short'}">${materialIcon(cost.id)} ${number(cost.amount)} ${escapeHtml(cost.name)}</span>`).join('')}</div>
            <button class="panel-button" type="button" data-craft-recipe="${escapeAttr(recipe.id)}" ${recipe.canCraft ? '' : 'disabled'}>${recipe.crafted ? 'Crafted' : recipe.levelMet === false ? 'Upgrade room to level 2' : recipe.prerequisiteMet === false ? 'Craft previous tool' : recipe.canCraft ? 'Craft item' : 'Gather materials'}</button>
        </section>`).join('') : '<div class="empty-state">This room has no available blueprints yet.</div>';
        const placements = decorations.map((decoration) => `<section class="decoration-control"><span><small>Interior decoration ${number(decoration.tier) ? `${number(decoration.tier)}/5` : ''}</small><strong>${escapeHtml(decoration.name)}</strong></span><button class="panel-button secondary" type="button" data-place-decoration="${escapeAttr(decoration.id)}" data-room-id="${escapeAttr(roomId)}" data-displayed="${String(Boolean(decoration.displayed))}">${decoration.displayed ? 'Store decoration' : 'Place decoration'}</button></section>`).join('');
        const progress = tools.length || roomDecorations.length ? `<div class="room-upgrade-summary"><span><b>${tools.filter((item) => item.crafted).length}/5</b><small>Tools installed</small></span><span><b>${roomDecorations.filter((item) => item.crafted).length}/5</b><small>Decorations crafted</small></span></div>` : '';
        const blueprintLabel = roomId === 'woodlot' ? 'Woodlot blueprints' : 'Workshop blueprints';
        return `<div class="crafting-section"><span class="eyebrow">${blueprintLabel}</span>${progress}${cards}${placements}</div>`;
    }

    function facilityInteriorDescription(id) {
        return ({
            garden: 'Living beds turn patient cultivation into Verdant Fiber for weaving, tools, and restorative construction.',
            forge: 'A consent-bound hearth shapes Ember Ingots without forcing a resident to remain at the bellows.',
            fridge: 'Frost-lined vaults preserve food and form Frost Crystals without draining the surrounding water.',
            generator: 'Balanced elemental currents condense into Storm Cells that power advanced tools and shared upgrades.',
            quarry: 'Cut faces yield stone along its willing grain — footings for the Builder’s Yard, walls, and keep ranks.',
            kitchen: 'A warm hearth turns the garden’s bounty into Provisions for weekly orders and visiting Siegelings.'
        })[id] || 'A workshop built around partnership.';
    }

    function openInterior(id) {
        if (!state.snapshot || !id) return;
        if (id === 'enclave' && !state.snapshot.enclave?.built) {
            openPanel('projects');
            return;
        }
        state.interior = id;
        closePanel();
        const interior = document.getElementById('keepInterior');
        if (interior) {
            interior.dataset.room = id;
            interior.setAttribute('aria-hidden', 'false');
        }
        setGroundsSuppressed(true);
        renderInterior();
    }

    /* —— Interior tour: walk the keep room by room without returning to the grounds. —— */
    const INTERIOR_TOUR = ['great_hall', 'woodlot', 'garden', 'forge', 'fridge', 'generator', 'quarry', 'kitchen', 'enclave', 'archive'];
    const INTERIOR_SHORT_NAMES = {
        great_hall: 'Hall', woodlot: 'Woodlot', garden: 'Garden', forge: 'Forge', fridge: 'Fridge',
        generator: 'Generator', quarry: 'Quarry', kitchen: 'Kitchen', enclave: 'Enclave', archive: 'Archive'
    };

    /** Only rooms the player can actually stand in — unbuilt facilities are skipped. */
    function interiorRooms() {
        if (!state.snapshot) return [];
        return INTERIOR_TOUR.filter((id) => {
            if (id === 'great_hall' || id === 'woodlot' || id === 'archive') return true;
            if (id === 'enclave') return Boolean(state.snapshot.enclave?.built);
            return Boolean(stationById(id));
        });
    }

    function stepInterior(delta) {
        const rooms = interiorRooms();
        if (rooms.length < 2) return;
        const index = rooms.indexOf(state.interior);
        if (index < 0) return;
        openInterior(rooms[(index + delta + rooms.length) % rooms.length]);
    }

    function renderInteriorNav() {
        const nav = document.getElementById('interiorNav');
        if (!nav) return;
        const rooms = interiorRooms();
        const index = rooms.indexOf(state.interior);
        nav.classList.toggle('hidden', rooms.length < 2 || index < 0);
        if (rooms.length < 2 || index < 0) return;
        const previous = rooms[(index - 1 + rooms.length) % rooms.length];
        const next = rooms[(index + 1) % rooms.length];
        text('interiorPrevLabel', INTERIOR_SHORT_NAMES[previous] || previous);
        text('interiorNextLabel', INTERIOR_SHORT_NAMES[next] || next);
        document.getElementById('interiorPrev')?.setAttribute('aria-label', `Go to ${INTERIOR_SHORT_NAMES[previous] || previous}`);
        document.getElementById('interiorNext')?.setAttribute('aria-label', `Go to ${INTERIOR_SHORT_NAMES[next] || next}`);
        const rail = document.getElementById('interiorRail');
        if (rail) {
            rail.innerHTML = rooms.map((id) => `<button type="button" role="tab" class="rail-dot ${id === state.interior ? 'is-current' : ''}"
                data-interior-goto="${escapeAttr(id)}" aria-selected="${id === state.interior}"
                aria-label="${escapeAttr(INTERIOR_SHORT_NAMES[id] || id)}" title="${escapeAttr(INTERIOR_SHORT_NAMES[id] || id)}"></button>`).join('');
        }
    }

    function closeInterior() {
        state.interior = '';
        document.getElementById('keepInterior')?.setAttribute('aria-hidden', 'true');
        setGroundsSuppressed(false);
    }

    function setGroundsSuppressed(suppressed) {
        const grounds = document.getElementById('sceneViewport');
        if (!grounds) return;
        grounds.classList.toggle('is-suppressed', suppressed);
        grounds.toggleAttribute('inert', suppressed);
        if (suppressed) grounds.setAttribute('aria-hidden', 'true');
        else grounds.removeAttribute('aria-hidden');
    }

    function renderInterior() {
        if (!state.snapshot || !state.interior) return;
        const interior = document.getElementById('keepInterior');
        if (!interior) return;
        const heading = buildingHeading(state.interior);
        text('interiorTitle', heading.title);
        text('interiorKicker', heading.kicker);
        interior.dataset.archiveRestored = String(Boolean(state.snapshot.visualState?.archiveRestored));
        interior.dataset.hallTheme = state.snapshot.visualState?.hallTheme || 'covenant';
        const interiorStation = stationById(state.interior);
        interior.dataset.fill = interiorStation ? String(fillTier(interiorStation)) : '';
        const resident = state.interior === 'woodlot' ? state.snapshot.station?.resident : stationById(state.interior)?.resident;
        document.getElementById('interiorResident')?.classList.toggle('hidden', !resident);
        setResidentOverlayArt(document.getElementById('interiorResidentArt'), resident);
        text('interiorResidentName', resident ? resident.name : '');
        interior.querySelectorAll('[data-facility-resident]').forEach((node) => node.classList.toggle('hidden', !resident));
        interior.querySelectorAll('[data-facility-resident-art]').forEach((node) => setResidentOverlayArt(node, resident));
        interior.querySelectorAll('[data-facility-resident-name]').forEach((node) => { node.textContent = resident?.name || ''; });
        const placed = state.snapshot.placedDecorations || {};
        const placedIds = new Set(String(placed[state.interior] || '').split(',').map((id) => id.trim()).filter(Boolean));
        interior.querySelectorAll('[data-decoration-art]').forEach((node) => {
            node.classList.toggle('is-placed', placedIds.has(node.dataset.decorationArt));
        });
        const toolTier = (state.snapshot.recipes || []).filter((recipe) => recipe.roomId === state.interior
            && recipe.type === 'TOOL' && recipe.crafted).length;
        interior.dataset.toolTier = String(toolTier);
        interior.querySelectorAll('[data-tool-tier]').forEach((node) => {
            node.classList.toggle('is-crafted', number(node.dataset.toolTier) <= toolTier);
        });
        interior.querySelectorAll('.room-tool-set').forEach((rack) => {
            rack.classList.toggle('has-installed-tools', Boolean(rack.querySelector('.is-crafted')));
        });
        renderEnclaveResidents();
        renderInteriorNav();
        const root = loreById('memorabilia_petrified_root');
        document.getElementById('interiorPlinth')?.classList.toggle('hidden', !root?.displayed);
        const actions = document.getElementById('interiorActions');
        if (actions) actions.innerHTML = buildingMarkup(state.interior);
    }

    function maybeShowTutorial() {
        if (!state.snapshot) return;
        let seen = '';
        try { seen = localStorage.getItem(TUTORIAL_KEY) || ''; } catch (error) { seen = ''; }
        if (!seen) openTutorial(0);
    }

    function openTutorial(step) {
        state.tutorialStep = clamp(number(step), 0, TUTORIAL_STEPS.length - 1);
        renderTutorial();
        document.getElementById('keepTutorial')?.classList.remove('hidden');
    }

    function renderTutorial() {
        const stepDef = TUTORIAL_STEPS[state.tutorialStep];
        if (!stepDef) return;
        text('tutorialArt', stepDef.art);
        text('tutorialKicker', stepDef.kicker);
        text('tutorialTitle', stepDef.title);
        text('tutorialBody', stepDef.body);
        const dots = document.getElementById('tutorialDots');
        if (dots) dots.innerHTML = TUTORIAL_STEPS.map((item, index) => `<i class="${index === state.tutorialStep ? 'active' : ''}"></i>`).join('');
        const next = document.getElementById('tutorialNext');
        if (next) next.textContent = state.tutorialStep >= TUTORIAL_STEPS.length - 1 ? 'Begin' : 'Next';
        document.getElementById('tutorialSkip')?.classList.toggle('hidden', state.tutorialStep >= TUTORIAL_STEPS.length - 1);
    }

    function tutorialAdvance() {
        if (state.tutorialStep >= TUTORIAL_STEPS.length - 1) finishTutorial();
        else openTutorial(state.tutorialStep + 1);
    }

    function finishTutorial() {
        state.tutorialStep = -1;
        try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (error) { /* private browsing */ }
        document.getElementById('keepTutorial')?.classList.add('hidden');
        maybeShowOfflineReport();
    }

    async function craftRecipe(recipeId) {
        const data = await perform('/api/keep/craft', { recipeId });
        if (data?.crafted) showNotice(`${data.crafted.name} is ready.`, 'Crafting complete');
    }

    async function placeDecoration(roomId, decorationId, displayed) {
        await perform('/api/keep/decoration', { roomId, decorationId, displayed });
    }

    function maybeShowOfflineReport() {
        if (!state.pendingOfflineReport || !document.getElementById('keepTutorial')?.classList.contains('hidden')) return;
        const report = state.pendingOfflineReport;
        text('offlineDuration', `Away for ${formatAwayDuration(report.awaySeconds)}. Here is what changed.`);
        const rows = [];
        for (const item of report.produced || []) {
            const icon = item.resource === 'TIMBER' ? '▰' : '✦';
            rows.push(offlineRow(icon, `+${number(item.amount)} ${item.resourceName || titleCase(item.resource)}`, item.stationName || item.stationId));
        }
        for (const name of report.completedProjects || []) rows.push(offlineRow('⚒', 'Construction complete', name));
        for (const title of report.loreFound || []) rows.push(offlineRow('▤', 'Lore discovered', title));
        for (const name of report.capsReached || []) rows.push(offlineRow('!', 'Storage reached capacity', `${name} stopped until collected`, true));
        const results = document.getElementById('offlineResults');
        if (results) results.innerHTML = rows.join('') || offlineRow('✓', 'The Keep held steady', 'No stores were lost.');
        document.getElementById('offlineOverlay')?.classList.remove('hidden');
        state.offlineVisible = true;
    }

    function offlineRow(icon, heading, detail, warning = false) {
        return `<div class="offline-result ${warning ? 'warning' : ''}"><i>${escapeHtml(icon)}</i><span><strong>${escapeHtml(heading)}</strong><small>${escapeHtml(detail)}</small></span></div>`;
    }

    function dismissOfflineReport() {
        document.getElementById('offlineOverlay')?.classList.add('hidden');
        state.pendingOfflineReport = null;
        state.offlineVisible = false;
    }

    function facilitiesMarkup() {
        const facilities = (state.snapshot.stations || []).filter((station) => station.id !== 'woodlot');
        const intro = '<p class="panel-intro">Every workshop has its own resident slot. Matching elements increase output by 20%; Neutral residents lend a 5% bonus anywhere.</p>';
        if (!facilities.length) return `${intro}<div class="empty-state">Restore the Storehouse, then plant the Covenant Garden to open the Elemental Quarter.</div>${rewardsMarkup()}`;
        return `${intro}<div class="facility-grid">${facilities.map((station) => {
            const ready = projectedStationAvailable(station);
            const full = ready >= number(station.storageCapacity);
            return `<section class="facility-card ${full ? 'is-full' : ''}">
                <span class="facility-icon facility-${escapeAttr(station.id)}">${facilityIcon(station.id)}</span>
                <span class="eyebrow">Level ${number(station.level)} · ${escapeHtml(formatRate(station.ratePerMinute))}/min</span>
                <h3>${escapeHtml(station.name)}</h3>
                <p>${ready}/${number(station.storageCapacity)} ${escapeHtml(station.resourceName || 'materials')} ready${full ? ' · Storage full' : ''}</p>
                <div class="meter"><i data-station-meter="${escapeAttr(station.id)}" style="width:${stationFill(station)}%"></i></div>
                <small>Affinity: ${escapeHtml((station.affinityNames || []).join(', '))}</small>
                <div class="facility-resident">${station.resident ? `${residentAvatarContent(station.resident)} <span><strong>${escapeHtml(station.resident.name)}</strong><small>${escapeHtml(station.resident.affinityLabel || '')}</small></span>` : '<span><strong>Open resident slot</strong><small>Production continues at base rate</small></span>'}</div>
                <div class="button-row"><button class="panel-button" type="button" data-collect-station="${escapeAttr(station.id)}" ${ready <= 0 ? 'disabled' : ''}>Collect ${ready}</button><button class="panel-button secondary" type="button" data-open-panel="residents" data-select-station="${escapeAttr(station.id)}">Assign</button><button class="panel-button secondary" type="button" data-enter-facility="${escapeAttr(station.id)}">Enter & craft</button></div>
            </section>`;
        }).join('')}</div>${rewardsMarkup()}`;
    }

    function rewardsMarkup() {
        const milestones = state.snapshot.milestones || [];
        const tribute = state.snapshot.weeklyTribute || {};
        const milestoneCards = milestones.map((item) => `<section class="reward-card ${item.claimed ? 'is-claimed' : ''}">
            <span><small>${item.claimed ? 'Claimed' : item.complete ? 'Complete' : 'Milestone'}</small><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description || '')}</p></span>
            <span class="reward-value">${number(item.reward?.gold)} Siegecoins<br>${number(item.reward?.remnants)} Remnants</span>
            <button class="panel-button" type="button" data-claim-keep-reward="${escapeAttr(item.id)}" ${item.canClaim ? '' : 'disabled'}>${item.claimed ? 'Claimed' : item.complete ? 'Claim' : 'In progress'}</button>
        </section>`).join('');
        const tributeTime = tribute.ready ? 'Ready now' : tribute.nextClaimAt ? `Returns ${formatDateTime(tribute.nextClaimAt)}` : 'Build the Elemental Generator';
        const order = state.snapshot.weeklyOrder || {};
        const orderChips = (order.requirements || []).map((req) =>
            `<span class="${number(req.have) >= number(req.amount) ? 'is-met' : ''}">${materialIcon(req.id)} ${number(req.have)}/${number(req.amount)} ${escapeHtml(req.name)}</span>`).join('');
        const orderStatus = !order.unlocked ? 'Warm the Garden Kitchen to take orders'
            : order.claimed ? 'Filled this week — a new manifest arrives Monday'
                : 'Deliver this week’s materials for coin';
        const orderCard = `<section class="reward-card order-card ${order.claimed ? 'is-claimed' : ''}">
            <span><small>Weekly crafting order</small><strong>The Caravan Manifest</strong><p>${escapeHtml(orderStatus)}</p>${orderChips ? `<div class="order-reqs">${orderChips}</div>` : ''}</span>
            <span class="reward-value">${number(order.reward?.gold)} Siegecoins<br>${number(order.reward?.remnants)} Remnants</span>
            <button class="panel-button" type="button" data-claim-keep-reward="weekly_order" ${order.canClaim ? '' : 'disabled'}>${order.claimed ? 'Filled' : order.canClaim ? 'Fill order' : 'Gather materials'}</button>
        </section>`;
        return `<div class="rewards-section"><span class="eyebrow">Keep rewards</span>${milestoneCards}${orderCard}<section class="reward-card tribute-card">
            <span><small>Weekly sanctuary tribute</small><strong>A Gift Returned</strong><p>${escapeHtml(tributeTime)}</p></span>
            <span class="reward-value">${number(tribute.reward?.gold)} Siegecoins<br>${number(tribute.reward?.remnants)} Remnants</span>
            <button class="panel-button" type="button" data-claim-keep-reward="weekly_tribute" ${tribute.ready ? '' : 'disabled'}>${tribute.ready ? 'Claim tribute' : 'Not ready'}</button>
        </section></div>`;
    }

    function residentsMarkup() {
        const residents = state.snapshot.residents || [];
        const stations = state.snapshot.stations || [state.snapshot.station];
        if (!stations.some((station) => station?.id === state.selectedStation)) state.selectedStation = stations[0]?.id || 'woodlot';
        const station = stationById(state.selectedStation) || {};
        const stationTabs = `<div class="station-tabs">${stations.map((item) => `<button class="${item.id === state.selectedStation ? 'active' : ''}" type="button" data-resident-station="${escapeAttr(item.id)}">${escapeHtml(item.name)}</button>`).join('')}</div>`;
        if (!residents.length) return `${stationTabs}<div class="empty-state">Owned Siegeling cards introduce their evolution family to the sanctuary. Choose a starter pack to meet your first residents.</div>`;
        const favorite = state.snapshot.favorite || {};
        // The favorite is honored inside the Covenant Hall; the residents panel is for work assignment.
        const favoriteHint = favorite.resident
            ? `<p class="panel-intro">${escapeHtml(favorite.resident.name)} is your favorite (${escapeHtml(favorite.label || '')}). Change it inside the Covenant Hall.</p>`
            : '';
        return `${stationTabs}${favoriteHint}<p class="panel-intro">Assigning a resident to ${escapeHtml(station.name || 'this station')} moves it from any previous work slot. Cards remain available in decks and expeditions.</p>${residents.map((resident) => {
            const assigned = assignmentFor(resident.id);
            const invited = station.residentId === resident.id;
            const isFavorite = favorite.residentId === resident.id;
            const affinity = residentAffinity(resident, station);
            let action;
            if (invited) {
                action = `<button class="panel-button secondary" type="button" data-station-id="${escapeAttr(station.id || 'woodlot')}" data-invite-resident="${escapeAttr(resident.id)}">Rest</button>`;
            } else if (assigned) {
                // Already working elsewhere — show the post, not a second Assign that looks free.
                action = `<button class="panel-button secondary assigned-elsewhere" type="button" data-resident-station="${escapeAttr(assigned.id)}" title="Open ${escapeAttr(assigned.name || 'station')}">${escapeHtml(`At ${shortStationName(assigned)}`)}</button>`;
            } else {
                action = `<button class="panel-button" type="button" data-station-id="${escapeAttr(station.id || 'woodlot')}" data-invite-resident="${escapeAttr(resident.id)}">Assign</button>`;
            }
            return `<section class="resident-card ${invited ? 'is-invited' : assigned ? 'is-assigned-elsewhere' : ''} ${isFavorite ? 'is-favorite' : ''}">
                <span class="resident-avatar" style="--resident-color:${escapeAttr(elementColors[resident.element] || elementColors.NEUTRAL)}">${residentAvatarContent(resident)}${isFavorite ? '<i class="resident-fav-mark" aria-hidden="true">★</i>' : ''}</span>
                <span class="resident-copy"><h3>${escapeHtml(resident.name)}</h3><small>${escapeHtml(resident.element)} · ${escapeHtml(titleCase(resident.rarity || 'COMMON'))} · ${escapeHtml(affinity)}</small></span>
                ${action}
            </section>`;
        }).join('')}`;
    }

    function residentsMarkupLegacy() {
        const residents = state.snapshot.residents || [];
        if (!residents.length) return '<div class="empty-state">Owned Siegeling cards will introduce their evolution family to the sanctuary. Choose a starter pack to meet your first residents.</div>';
        const current = state.snapshot.station?.residentId || '';
        return `<p class="panel-intro">Invitations never lock a card. Affinity reflects what a resident enjoys doing—not its rarity or power.</p>${residents.map((resident) => {
            const invited = current === resident.id;
            return `<section class="resident-card ${invited ? 'is-invited' : ''}">
                <span class="resident-avatar" style="--resident-color:${escapeAttr(elementColors[resident.element] || elementColors.NEUTRAL)}">${residentAvatarContent(resident)}</span>
                <span class="resident-copy"><h3>${escapeHtml(resident.name)}</h3><small>${escapeHtml(resident.element)} · ${escapeHtml(resident.affinityLabel || '')}</small></span>
                <button class="panel-button ${invited ? 'secondary' : ''}" type="button" data-invite-resident="${escapeAttr(resident.id)}">${invited ? 'Rest' : 'Invite'}</button>
            </section>`;
        }).join('')}`;
    }

    function projectsMarkup() {
        const constructions = activeConstructionList();
        const slots = Math.max(1, number(state.snapshot.constructionSlots) || 1);
        const crewNote = slots > 1 || constructions.length
            ? `<p class="panel-intro crew-note">Construction teams: ${constructions.length}/${slots} active${slots > 1 ? ` · Keeper Level ${number(state.snapshot.keeper?.level) || 1} coordinates ${slots} simultaneous projects` : ''}.</p>`
            : '';
        const inProgress = constructions.map((item, index) => `<section class="project-card"><span class="eyebrow">In progress${slots > 1 ? ` · Crew ${index + 1}` : ''}</span><h3>${escapeHtml(projectName(item.id))}</h3><p>The site changes through foundations, scaffolding, and completion. No progress is lost while you are away.</p><div class="meter"><i data-live-construction-meter="${index}" style="width:${constructionPercent(index)}%"></i></div><div class="cost-row"><span data-live-construction-time="${index}">${escapeHtml(formatDuration(constructionEntryRemaining(item)))}</span><strong>Workers active</strong></div></section>`).join('');
        // Parity with KeepService.buildOptions: a project a crew already holds is never offered again,
        // so a stale snapshot cannot render a "Begin project" button the server will reject.
        const busyIds = new Set(constructions.map((item) => item.id));
        const options = (state.snapshot.buildOptions || []).filter((option) => !busyIds.has(option.id));
        const optionCards = options.map((option) => {
            const costs = [`▰ ${number(option.timberCost)} timber`];
            for (const cost of option.materialCosts || []) costs.push(`${materialIcon(cost.id)} ${number(cost.amount)} ${cost.name}`);
            const shortages = [];
            if (number(state.snapshot.resources?.timber) < number(option.timberCost)) shortages.push('timber');
            for (const cost of option.materialCosts || []) {
                if (number(materialById(cost.id)?.amount) < number(cost.amount)) shortages.push(cost.name);
            }
            const levelLocked = option.levelMet === false;
            const blockedLabel = levelLocked ? `Reach Keeper Level ${number(option.requiredLevel)}`
                : constructions.length >= slots ? 'Crews busy'
                : `Need ${escapeHtml(shortages.join(' & ') || 'prior project')}`;
            const eyebrow = levelLocked ? `Locked · Keeper Level ${number(option.requiredLevel)}`
                : option.rankName ? `Keep rank · ${escapeHtml(option.rankName)}` : 'Visible restoration';
            return `<section class="project-card ${option.rankName ? 'is-rank-project' : ''}${levelLocked ? ' is-level-locked' : ''}"><span class="eyebrow">${eyebrow}</span><h3>${escapeHtml(option.name)}</h3><p>${escapeHtml(option.description || '')}</p>
                <div class="cost-row"><span>${escapeHtml(formatDuration(option.durationSeconds))}</span><strong>${escapeHtml(costs.join(' · '))}</strong></div>
                <div class="button-row"><button class="panel-button" type="button" data-start-build="${escapeAttr(option.id)}" ${option.canStart ? '' : 'disabled'}>${option.canStart ? 'Begin project' : blockedLabel}</button></div></section>`;
        }).join('');
        const projects = inProgress + optionCards;
        return `${crewNote}${projects || '<div class="empty-state">Every current restoration is complete. Weekly tribute and resident affinities keep the sanctuary useful while future chapters arrive.</div>'}${rewardsMarkup()}`;
    }

    function projectsMarkupLegacy() {
        const construction = state.snapshot.activeConstruction;
        if (construction) {
            return `<section class="project-card"><span class="eyebrow">In progress</span><h3>${escapeHtml(projectName(construction.id))}</h3><p>The site changes through foundations, scaffolding, and completion. No progress is lost while you are away.</p><div class="meter"><i data-live-construction-meter style="width:${constructionPercent()}%"></i></div><div class="cost-row"><span data-live-construction-time>${escapeHtml(formatDuration(constructionRemaining()))}</span><strong>Workers active</strong></div></section>`;
        }
        const options = state.snapshot.buildOptions || [];
        if (!options.length) return '<div class="empty-state">The first restoration chain is complete. Future milestones will open the Warehouse, gardens, walls, and elemental workshops.</div>';
        return options.map((option) => `<section class="project-card">
            <span class="eyebrow">Visible restoration</span><h3>${escapeHtml(option.name)}</h3><p>${escapeHtml(option.description || '')}</p>
            <div class="cost-row"><span>${escapeHtml(formatDuration(option.durationSeconds))}</span><strong>▰ ${number(option.timberCost)} timber</strong></div>
            <div class="button-row"><button class="panel-button" type="button" data-start-build="${escapeAttr(option.id)}" ${option.canStart ? '' : 'disabled'}>${option.canStart ? 'Begin project' : `Need ${number(option.timberCost)} timber`}</button></div>
        </section>`).join('');
    }

    function chronicleMarkup() {
        const tabs = [
            ['ALL', 'All'], ['LETTER', 'Letters'], ['MEMORABILIA', 'Relics'], ['CHRONICLE', 'Chronicle']
        ];
        const entries = (state.snapshot.lore || []).filter((item) => state.loreFilter === 'ALL' || item.type === state.loreFilter);
        const unread = entries.filter((item) => !item.read || state.sessionReadLoreIds.includes(item.id));
        const read = entries.filter((item) => !unread.includes(item));
        const groups = listSection('Unread', unread.filter((item) => !item.read).length, unread.map(loreCardMarkup))
            + listSection('Read', read.length, read.map(loreCardMarkup));
        return `<div class="lore-tabs">${tabs.map(([id, label]) => `<button class="${state.loreFilter === id ? 'active' : ''}" type="button" data-lore-filter="${id}">${label}</button>`).join('')}</div>
            ${entries.length ? groups : '<div class="empty-state">No discoveries in this collection yet. Production, construction, and conversations uncover new records.</div>'}`;
    }

    /** Shared read/unread divider for the Chronicle, the Voices list, and the notice tray. */
    function listSection(label, count, cards) {
        if (!cards.length) return '';
        return `<div class="list-section-heading"><span>${escapeHtml(label)}</span><strong>${number(count)}</strong></div>${cards.join('')}`;
    }

    function loreCardMarkup(item) {
        const expanded = state.expandedLoreId === item.id;
        const memorabilia = item.type === 'MEMORABILIA';
        return `<article class="lore-card ${item.read ? 'is-read' : 'unread'} ${expanded ? 'expanded' : ''}" data-lore-id="${escapeAttr(item.id)}">
            ${memorabilia && expanded ? '<div class="memorabilia-figure"><span class="root-art"></span></div>' : ''}
            <span class="eyebrow">${escapeHtml(typeLabel(item.type))}</span><h3>${escapeHtml(item.title)}</h3>
            <div class="card-meta"><span>${escapeHtml(item.perspective || 'Unknown source')}</span><span>${escapeHtml(item.era || '')}</span></div>
            <p>${escapeHtml(item.summary || '')}</p>
            ${expanded ? `<p class="lore-body">${escapeHtml(item.body || '')}</p><small>${escapeHtml(item.source || '')}</small>${memorabilia ? `<div class="button-row"><button class="panel-button ${item.displayed ? 'secondary' : ''}" type="button" data-memorabilia-id="${escapeAttr(item.id)}" data-displayed="${String(Boolean(item.displayed))}">${item.displayed ? 'Return to collection' : 'Display in keep'}</button></div>` : ''}` : ''}
        </article>`;
    }

    function conversationsMarkup() {
        const conversations = state.snapshot.availableConversations || [];
        const relationships = state.snapshot.relationships || [];
        const cards = conversations.map((conversation) => {
            const kind = String(conversation.kind || '').toUpperCase();
            const visitor = kind === 'VISITOR';
            const interaction = kind === 'INTERACTION';
            const tag = visitor
                ? '<em class="visitor-tag">Trade · gift · risk</em>'
                : interaction
                    ? '<em class="visitor-tag interaction-tag">Returns · affinity</em>'
                    : '';
            const role = visitor ? 'Road visitor' : interaction ? 'Interaction' : conversation.npcRole;
            return `<section class="conversation-card ${visitor ? 'is-visitor' : ''} ${interaction ? 'is-interaction' : ''}" data-conversation-id="${escapeAttr(conversation.id)}"><span class="npc-mini">${escapeHtml(initials(conversation.npcName))}</span><span><small>${escapeHtml(role)}</small><h3>${escapeHtml(conversation.npcName)}</h3><p>${escapeHtml(conversation.kicker || 'Waiting to speak')}</p>${tag}</span></section>`;
        });
        const available = cards.length
            ? listSection('Waiting to speak', cards.length, cards)
            : '<div class="empty-state">No one is waiting to speak. Interaction NPCs return after a cooldown; the road still brings new visitors.</div>';
        const bonds = relationships.length
            ? listSection('Spoken with', relationships.length, [
                '<p class="panel-intro relationship-hint">Select a voice to view affinity — Distant, Acquainted, Trusted, or Bonded. How you answer when they return moves the bar.</p>',
                ...relationships.map((item) => relationshipCardMarkup(item))
            ])
            : '';
        return `<p class="panel-intro">Story voices shape the Chronicle. Interaction NPCs (yard life, steward check-ins) return on occasion so your answers can raise or lower affinity. Road visitors still bring trades, gifts, and risks.</p>${available}${bonds}`;
    }

    function relationshipCardMarkup(item) {
        const selected = state.selectedRelationshipId === item.npcId;
        const trust = Math.max(0, number(item.trust));
        const trustMax = Math.max(1, number(item.trustMax) || 7);
        const fill = Math.round(clamp(trust / trustMax, 0, 1) * 100);
        const stage = item.stage || relationshipStage(trust);
        const feeling = trust >= 7 ? 'They stand with you.'
            : trust >= 3 ? 'They trust your word.'
                : trust >= 1 ? 'They know your name.'
                    : 'They keep their distance.';
        return `<button class="relationship-card ${selected ? 'is-selected' : ''}" type="button" data-relationship-id="${escapeAttr(item.npcId)}" aria-expanded="${selected ? 'true' : 'false'}">
            <span class="relationship-head"><strong>${escapeHtml(item.npcName)}</strong><span class="relationship-stage">${escapeHtml(stage)}</span></span>
            <span class="relationship-spectrum" role="meter" aria-valuemin="0" aria-valuemax="${trustMax}" aria-valuenow="${trust}" aria-label="${escapeAttr(`${item.npcName} relationship: ${stage}`)}">
                <span class="spectrum-ends" aria-hidden="true"><i>Distant</i><i>Bonded</i></span>
                <span class="spectrum-track"><i style="width:${fill}%"></i><em style="left:${fill}%"></em></span>
                <span class="spectrum-labels" aria-hidden="true"><i>Distant</i><i>Acquainted</i><i>Trusted</i><i>Bonded</i></span>
            </span>
            ${selected ? `<span class="relationship-detail"><small>Affinity ${trust}/${trustMax}</small><p>${escapeHtml(feeling)}</p></span>` : ''}
        </button>`;
    }

    function inventoryMarkup() {
        const resources = state.snapshot.resources || {};
        const materials = resources.materials || [];
        const recipes = state.snapshot.recipes || [];
        const crafted = recipes.filter((item) => item.crafted);
        const filter = state.inventoryFilter || 'ALL';
        const tabs = [
            ['ALL', 'All'],
            ['RAW', 'Raw'],
            ['CRAFTED', 'Manufactured']
        ];
        const showRaw = filter === 'ALL' || filter === 'RAW';
        const showCrafted = filter === 'ALL' || filter === 'CRAFTED';
        const timberCap = number(resources.timberCapacity);
        const materialCap = number(resources.materialCapacity);
        const rawCards = `
            <section class="inventory-card raw-card">
                <span class="inventory-icon" aria-hidden="true">▰</span>
                <span class="inventory-copy"><small>Raw · Woodlot</small><h3>Timber</h3>
                <div class="meter"><i style="width:${Math.round(clamp(number(resources.timber) / Math.max(1, timberCap), 0, 1) * 100)}%"></i></div>
                <strong>${number(resources.timber)} / ${timberCap}</strong></span>
            </section>
            ${materials.map((item) => `<section class="inventory-card raw-card">
                <span class="inventory-icon" aria-hidden="true">${materialIcon(item.id)}</span>
                <span class="inventory-copy"><small>Raw · ${escapeHtml(facilityTitle(item.facilityId))}</small><h3>${escapeHtml(item.name)}</h3>
                <div class="meter"><i style="width:${Math.round(clamp(number(item.amount) / Math.max(1, number(item.capacity) || materialCap), 0, 1) * 100)}%"></i></div>
                <strong>${number(item.amount)} / ${number(item.capacity) || materialCap}</strong></span>
            </section>`).join('')}`;
        const craftedCards = crafted.length
            ? crafted.map((item) => `<section class="inventory-card crafted-card">
                <span class="inventory-icon" aria-hidden="true">${craftedIcon(item.type)}</span>
                <span class="inventory-copy"><small>Manufactured · ${escapeHtml(titleCase(item.type || 'item'))}</small><h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.bonus || item.description || 'Ready in the Keep.')}</p>
                <strong>×${Math.max(1, number(item.count))}</strong></span>
            </section>`).join('')
            : '<div class="empty-state">No manufactured goods yet. Craft tools, bonuses, and decorations inside restored workshops.</div>';
        return `<p class="panel-intro">Raw stocks come from the Woodlot and elemental workshops. Manufactured goods are crafted items held by the Keep.</p>
            <div class="lore-tabs inventory-tabs">${tabs.map(([id, label]) => `<button class="${filter === id ? 'active' : ''}" type="button" data-inventory-filter="${id}">${label}</button>`).join('')}</div>
            ${showRaw ? `<span class="eyebrow">Raw materials</span>${rawCards}` : ''}
            ${showCrafted ? `<span class="eyebrow">Manufactured</span>${craftedCards}` : ''}`;
    }

    function updatePanelLiveValues() {
        document.querySelectorAll('[data-live-woodlot-meter]').forEach((meter) => { meter.style.width = `${woodlotFill()}%`; });
        document.querySelectorAll('[data-station-meter]').forEach((meter) => {
            meter.style.width = `${stationFill(stationById(meter.dataset.stationMeter))}%`;
        });
        document.querySelectorAll('[data-live-construction-time]').forEach((time) => {
            const entry = activeConstructionList()[number(time.dataset.liveConstructionTime)];
            time.textContent = formatDuration(entry ? constructionEntryRemaining(entry) : 0);
        });
        document.querySelectorAll('[data-live-construction-meter]').forEach((meter) => {
            meter.style.width = `${constructionPercent(number(meter.dataset.liveConstructionMeter))}%`;
        });
    }

    function setPanelHeading(title, kicker) {
        text('panelTitle', title);
        text('panelKicker', kicker);
    }

    function enqueueDiscoveries(ids) {
        for (const id of ids || []) {
            const item = loreById(id);
            if (item && !state.discoveryQueue.some((queued) => queued.id === id)) {
                state.discoveryQueue.push(item);
                addNotice(item.title, 'Lore discovered', item.id);
            }
        }
    }

    function showNextDiscovery() {
        renderNoticeCenter();
    }

    function dismissDiscovery() {
        document.getElementById('discoveryToast')?.classList.add('hidden');
    }

    function openLatestDiscovery() {
        const id = state.notices.find((notice) => notice.loreId)?.loreId || '';
        closeNoticeTray();
        state.loreFilter = 'ALL';
        openPanel('chronicle');
        if (id) void openLore(id);
    }

    function showNotice(message, heading) {
        addNotice(message || 'Something changed.', heading || 'My Keep', '');
    }

    function addNotice(message, heading, loreId) {
        state.notices.unshift({ message, heading, loreId: loreId || '', at: nowMs(), read: false });
        state.notices = state.notices.slice(0, 20);
        renderNoticeCenter();
    }

    function unreadNoticeCount() {
        return state.notices.filter((notice) => !notice.read).length;
    }

    /**
     * Messages are marked read when the tray closes, not when it opens: closing is the moment the
     * player has actually seen them, and it keeps the New group and the header badge in agreement.
     */
    function markNoticesRead() {
        if (!unreadNoticeCount()) return;
        for (const notice of state.notices) notice.read = true;
        renderNoticeCenter();
    }

    function renderNoticeCenter() {
        const list = document.getElementById('noticeList');
        const constructions = activeConstructionList();
        const constructionMarkup = constructions.length ? `<section class="notice-construction-group">
            <div class="notice-section-heading"><span>Active construction</span><strong>${constructions.length} crew${constructions.length === 1 ? '' : 's'}</strong></div>
            ${constructions.map((construction, index) => `<button class="notice-construction-card" type="button" data-open-panel="projects" aria-label="Open Projects for ${escapeAttr(projectName(construction.id))}">
                <span class="notice-construction-row"><i aria-hidden="true">⚒</i><span><small>Crew ${index + 1}</small><strong>${escapeHtml(projectName(construction.id))}</strong></span><time data-live-construction-time="${index}">${escapeHtml(formatDuration(constructionEntryRemaining(construction)))}</time></span>
                <span class="notice-construction-meter"><i data-live-construction-meter="${index}" style="width:${constructionPercent(index)}%"></i></span>
            </button>`).join('')}
        </section>` : '';
        const card = (notice) => {
            const tag = notice.loreId ? 'button' : 'div';
            const action = notice.loreId ? ` type="button" data-notice-lore="${escapeAttr(notice.loreId)}"` : '';
            return `<${tag} class="notice-item ${notice.read ? 'is-read' : 'unread'}"${action}><i aria-hidden="true">${notice.loreId ? '▤' : '✦'}</i><span><small>${escapeHtml(notice.heading)}</small><strong>${escapeHtml(notice.message)}</strong></span></${tag}>`;
        };
        const unread = state.notices.filter((notice) => !notice.read);
        const read = state.notices.filter((notice) => notice.read);
        const activityMarkup = state.notices.length
            ? listSection('New', unread.length, unread.map(card)) + listSection('Earlier', read.length, read.map(card))
            : `<div class="notice-empty">${constructions.length ? 'Construction is underway. New sanctuary updates will appear here.' : 'No new Keep activity. Start a project or continue restoring the sanctuary.'}</div>`;
        if (list) list.innerHTML = constructionMarkup + activityMarkup;
        text('noticeBadge', unreadNoticeCount());
        document.getElementById('noticeBadge')?.classList.toggle('hidden', unreadNoticeCount() <= 0);
    }

    function toggleNoticeTray() {
        const tray = document.getElementById('noticeTray');
        if (!tray) return;
        const opening = tray.classList.contains('hidden');
        tray.classList.toggle('hidden', !opening);
        document.getElementById('noticeButton')?.setAttribute('aria-expanded', String(opening));
        if (opening) renderNoticeCenter();
        else markNoticesRead();
    }

    function closeNoticeTray() {
        const tray = document.getElementById('noticeTray');
        const wasOpen = tray && !tray.classList.contains('hidden');
        tray?.classList.add('hidden');
        document.getElementById('noticeButton')?.setAttribute('aria-expanded', 'false');
        if (wasOpen) markNoticesRead();
    }

    // ── Theme music ───────────────────────────────────────────────────────────
    // Loops the main theme in Keep mode behind a header toggle. Preference persists;
    // browsers block autoplay-with-sound until a user gesture, so when the saved
    // preference is "on" we also arm a one-shot gesture starter.
    const MUSIC_KEY = 'sieglingsKeepMusicOn';

    function initMusic() {
        const audio = document.getElementById('keepTheme');
        const button = document.getElementById('musicToggle');
        if (!audio || !button) return;
        audio.volume = 0.32;
        let on;
        try { on = (localStorage.getItem(MUSIC_KEY) || '1') === '1'; } catch (e) { on = true; }

        function reflect() {
            button.classList.toggle('is-muted', !on);
            button.setAttribute('aria-pressed', String(on));
            button.title = on ? 'Mute theme music' : 'Play theme music';
        }
        function tryPlay() {
            if (!on) return;
            const promise = audio.play();
            if (promise && promise.catch) promise.catch(() => { /* autoplay blocked until a gesture */ });
        }
        function armGestureStart() {
            const starter = () => {
                document.removeEventListener('pointerdown', starter);
                document.removeEventListener('keydown', starter);
                tryPlay();
            };
            document.addEventListener('pointerdown', starter);
            document.addEventListener('keydown', starter);
        }

        reflect();
        if (on) { tryPlay(); armGestureStart(); }

        button.addEventListener('click', () => {
            on = !on;
            try { localStorage.setItem(MUSIC_KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
            reflect();
            if (on) tryPlay(); else audio.pause();
        });
        // Don't keep playing over a backgrounded tab; resume on return if still enabled.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) audio.pause();
            else if (on) tryPlay();
        });
    }

    // ── Keeper's Journey (leveling / battlepass timeline) ─────────────────────

    function keeperData() { return state.snapshot?.keeper || null; }

    function keeperProgressPercent(keeper) {
        if (!keeper) return 0;
        if (keeper.atMax) return 100;
        const forLevel = number(keeper.xpForLevel);
        return forLevel > 0 ? Math.max(0, Math.min(100, Math.round(number(keeper.xpIntoLevel) / forLevel * 100))) : 0;
    }

    function toggleBadge(id, count) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = count > 9 ? '9+' : String(count);
        el.classList.toggle('hidden', count <= 0);
    }

    /** Updates the scene caption (chapter + XP bar) and the journey badge every render. */
    function renderJourney() {
        const keeper = keeperData();
        if (!keeper) return;
        const level = number(keeper.level) || 1;
        const chapters = keeper.chapters || [];
        const current = chapters.find((c) => c.current) || chapters[0] || {};
        text('captionChapter', `Chapter ${roman(number(current.number) || 1)} · Keeper Level ${level}`);
        text('captionTitle', current.title || 'The Wounded Ground');
        text('captionSubtitle', current.subtitle || '');
        const fill = document.getElementById('captionXpFill');
        if (fill) fill.style.width = keeperProgressPercent(keeper) + '%';
        text('captionXpLabel', keeper.atMax
            ? `Keeper Level ${level} · Max · ${number(keeper.totalXp)} XP`
            : `${number(keeper.xpIntoLevel)} / ${number(keeper.xpForLevel)} XP to Level ${level + 1}`);
        toggleBadge('journeyBadge', number(keeper.unclaimedRewards));
        if (!document.getElementById('journeyOverlay')?.classList.contains('hidden')) renderJourneyTrack();
    }

    function renderJourneyTrack() {
        const keeper = keeperData();
        const track = document.getElementById('journeyTrack');
        if (!keeper || !track) return;
        const level = number(keeper.level) || 1;
        const unclaimed = number(keeper.unclaimedRewards);
        text('journeyEyebrow', `${keeper.rankName || 'The Keep'} · The Keeper's Journey`);
        text('journeyTitle', keeper.atMax ? `Keeper Level ${level} · Max` : `Keeper Level ${level}`);
        const fill = document.getElementById('journeyXpFill');
        if (fill) fill.style.width = keeperProgressPercent(keeper) + '%';
        text('journeyXpLabel', keeper.atMax
            ? `${number(keeper.totalXp)} XP earned · every reward on the free track is within reach`
            : `${number(keeper.xpIntoLevel)} / ${number(keeper.xpForLevel)} XP to Level ${level + 1}`
                + (unclaimed > 0 ? ` · ${unclaimed} reward${unclaimed === 1 ? '' : 's'} ready to claim` : ''));
        const levels = keeper.levels || [];
        track.innerHTML = (keeper.chapters || []).map((ch) => {
            const nodes = levels.filter((l) => number(l.chapterNumber) === number(ch.number)).map(journeyNodeMarkup).join('');
            const cls = `journey-chapter${ch.current ? ' is-current' : ''}${ch.complete ? ' is-complete' : ''}`;
            return `<section class="${cls}">
                <header class="chapter-head"><span class="eyebrow">Chapter ${roman(number(ch.number))}${ch.complete ? ' · Complete' : ch.current ? ' · In progress' : ''}</span>
                    <strong>${escapeHtml(ch.title || '')}</strong><small>${escapeHtml(ch.subtitle || '')}</small></header>
                <div class="journey-nodes">${nodes}</div></section>`;
        }).join('');
        track.querySelector('.journey-chapter.is-current')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    function journeyNodeMarkup(l) {
        const lv = number(l.level);
        const stateClass = l.claimed ? 'is-claimed' : l.canClaim ? 'is-ready' : l.reached ? 'is-earned' : 'is-locked';
        const gold = number(l.reward?.gold);
        const remnants = number(l.reward?.remnants);
        const decoration = l.reward?.decorationName
            ? `<p class="node-decoration" title="Decoration"><span aria-hidden="true">✿</span> ${escapeHtml(l.reward.decorationName)}</p>` : '';
        const unlock = l.unlockLabel ? `<p class="node-unlock">${escapeHtml(l.unlockLabel)}</p>` : '';
        const action = l.canClaim
            ? `<button class="node-claim" type="button" data-claim-keep-reward="keeper_level:${lv}">Claim</button>`
            : `<span class="node-status">${l.claimed ? 'Claimed' : l.reached ? 'Earned' : `Reach Lv ${lv}`}</span>`;
        return `<article class="journey-node ${stateClass}${l.current ? ' is-current' : ''}">
            <div class="node-badge"><small>LV</small><strong>${lv}</strong></div>
            <div class="node-reward"><span class="reward-gold" title="Siegecoins">◈ ${gold}</span><span class="reward-rem" title="Remnants">✦ ${remnants}</span></div>
            ${decoration}${unlock}${action}</article>`;
    }

    function openJourney() {
        renderJourneyTrack();
        document.getElementById('journeyOverlay')?.classList.remove('hidden');
    }

    function closeJourney() {
        document.getElementById('journeyOverlay')?.classList.add('hidden');
    }

    /** Surfaces level-ups and daily-visit XP as non-blocking notices. */
    function announceKeeperProgress(next) {
        const keeper = next?.keeper;
        if (!keeper) return;
        const level = number(keeper.level) || 1;
        if (typeof state.lastKeeperLevel === 'number' && level > state.lastKeeperLevel) {
            showNotice(`Keeper Level ${level} reached · ${keeper.rankName || 'new rewards'} · open the Journey to claim`, 'Level up');
        }
        state.lastKeeperLevel = level;
        const daily = number(next.keeperDailyXpAwarded);
        if (daily > 0) showNotice(`+${daily} XP for today's visit`, 'Keeper XP');
    }

    // `mode` is 'signin' (the keeper genuinely has no session) or 'retry' (the keep
    // could not be reached). They must stay distinct: presenting a login form for a
    // transient failure is what teaches players their session keeps evaporating.
    function showGate(message, mode) {
        state.gateMode = mode === 'retry' ? 'retry' : 'signin';
        const retry = state.gateMode === 'retry';
        text('gateMessage', message || 'Sign in and choose a starter pack to begin rebuilding My Keep.');
        const heading = document.querySelector('#keepGate h1');
        if (heading) heading.textContent = retry ? 'The road is quiet' : 'Found your sanctuary';
        const action = document.getElementById('gateSignIn');
        if (action) action.textContent = retry ? 'Try again' : 'Sign in';
        document.getElementById('keepGate')?.classList.remove('hidden');
    }

    function hideGate() {
        document.getElementById('keepGate')?.classList.add('hidden');
    }

    // Collapse a lingering real Bearer token to the cookie sentinel only where the
    // server has already confirmed it receives the session cookie. My Keep never
    // calls /api/auth/me itself, so it defers to the confirmation the hub/play pages
    // recorded rather than re-deriving it from a readable cookie — deriving it here
    // is exactly how a valid session got thrown away and the gate reappeared.
    function migrateStoredToken() {
        if (state.testMode) return;
        try {
            const stored = localStorage.getItem(AUTH_TOKEN_KEY) || '';
            if (isLegacyBearerToken(stored) && cookieAuthConfirmed() && !isStandalonePWA()) {
                localStorage.setItem(AUTH_TOKEN_KEY, COOKIE_SESSION_VALUE);
            }
        } catch (e) { /* private browsing / storage disabled */ }
    }

    // In-page sign-in. Signing in from My Keep re-loads the keep in place rather
    // than bouncing the keeper back to /home.
    function bindLoginModal() {
        const modal = document.getElementById('keepLogin');
        const body = document.getElementById('keepLoginBody');
        if (!modal || !body) return;

        let step = 'credentials';            // 'credentials' | 'display-name'
        let draft = { email: '', password: '' };
        let busy = false;

        function open() {
            step = 'credentials';
            draft = { email: '', password: '' };
            render();
            modal.classList.remove('hidden');
            window.setTimeout(() => body.querySelector('input')?.focus(), 30);
        }
        function close() {
            modal.classList.add('hidden');
        }

        function render() {
            body.innerHTML = step === 'display-name' ? displayNameMarkup() : credentialsMarkup();
            bindCard();
        }

        function credentialsMarkup() {
            return '<span class="eyebrow">A covenant requires a keeper</span>'
                + '<strong id="keepLoginTitle">Sign in to your Keep</strong>'
                + '<span class="keep-login-note">Your sanctuary, Siegecoins, and cards live with your account. Sign in and rebuilding continues right here.</span>'
                + '<input class="keep-login-input" id="keepLoginEmail" type="email" autocomplete="email" placeholder="Email" value="' + escapeAttr(draft.email) + '">'
                + '<input class="keep-login-input" id="keepLoginPassword" type="password" autocomplete="current-password" placeholder="Password" value="' + escapeAttr(draft.password) + '">'
                + '<p class="keep-login-error" id="keepLoginError" role="alert"></p>'
                + '<button class="keep-login-btn primary" id="keepLoginSubmit" type="button">Log In</button>'
                + '<button class="keep-login-btn ghost" id="keepLoginRegister" type="button">Register</button>';
        }

        function displayNameMarkup() {
            return '<span class="eyebrow">A covenant requires a keeper</span>'
                + '<strong id="keepLoginTitle">Choose your display name</strong>'
                + '<span class="keep-login-note">Confirm how other keepers will see you (' + escapeHtml(draft.email) + ').</span>'
                + '<input class="keep-login-input" id="keepLoginName" maxlength="20" placeholder="Display name">'
                + '<p class="keep-login-error" id="keepLoginError" role="alert"></p>'
                + '<button class="keep-login-btn primary" id="keepLoginConfirm" type="button">Confirm</button>'
                + '<button class="keep-login-btn ghost" id="keepLoginBack" type="button">Back</button>';
        }

        function showError(message) {
            const el = body.querySelector('#keepLoginError');
            if (el) el.textContent = message || '';
        }

        function readCredentials() {
            return {
                email: (body.querySelector('#keepLoginEmail')?.value || '').trim(),
                password: body.querySelector('#keepLoginPassword')?.value || ''
            };
        }

        function beginRegister() {
            const creds = readCredentials();
            if (!creds.email.includes('@') || creds.email.startsWith('@') || creds.email.endsWith('@')) {
                return showError('Enter a valid email address.');
            }
            if (!creds.password || creds.password.length < 6) {
                return showError('Passwords must be at least 6 characters.');
            }
            draft = { email: creds.email, password: creds.password };
            step = 'display-name';
            render();
            window.setTimeout(() => body.querySelector('#keepLoginName')?.focus(), 30);
        }

        async function submit(mode) {
            if (busy) return;
            const payload = mode === 'register'
                ? { email: draft.email, password: draft.password, displayName: (body.querySelector('#keepLoginName')?.value || '').trim() }
                : readCredentials();
            if (mode === 'login' && (!payload.email || !payload.password)) {
                return showError('Enter your email and password.');
            }
            busy = true;
            const submitBtn = body.querySelector('#keepLoginSubmit, #keepLoginConfirm');
            const originalLabel = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Please wait…'; }
            try {
                const resp = await fetch(`${apiBase}/api/auth/${mode}`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                let data = null;
                try { data = await resp.json(); } catch (_ignored) { /* non-JSON */ }
                if (!resp.ok || !data || data.error || !data.token) {
                    showError((data && data.error) || 'Something went wrong. Please try again.');
                    return;
                }
                try { localStorage.setItem(AUTH_TOKEN_KEY, preferredStoredToken(data.token)); } catch (e) { /* storage off */ }
                // Continue rebuilding in place: dismiss the gate/modal and reload the keep.
                close();
                hideGate();
                document.getElementById('keepLoading')?.classList.remove('hidden');
                await loadSnapshot(true);
                maybeShowTutorial();
                maybeShowOfflineReport();
            } catch (_networkError) {
                showError('Network error. Check your connection and try again.');
            } finally {
                busy = false;
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
            }
        }

        function bindCard() {
            body.querySelector('#keepLoginSubmit')?.addEventListener('click', () => submit('login'));
            body.querySelector('#keepLoginRegister')?.addEventListener('click', beginRegister);
            body.querySelector('#keepLoginConfirm')?.addEventListener('click', () => submit('register'));
            body.querySelector('#keepLoginBack')?.addEventListener('click', () => { step = 'credentials'; render(); });
            body.querySelector('#keepLoginPassword')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit('login');
            });
            body.querySelector('#keepLoginName')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit('register');
            });
        }

        document.getElementById('gateSignIn')?.addEventListener('click', () => {
            if (state.gateMode !== 'retry') {
                open();
                return;
            }
            hideGate();
            document.getElementById('keepLoading')?.classList.remove('hidden');
            void loadSnapshot();
        });
        document.getElementById('keepLoginClose')?.addEventListener('click', close);
        modal.querySelectorAll('[data-close-login]').forEach((el) => el.addEventListener('click', close));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
        });
    }

    function hideLoading() {
        document.getElementById('keepLoading')?.classList.add('hidden');
    }

    async function fetchJson(path, options = {}) {
        if (state.testMode) return mockApi(path, options);
        const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        // Send the real token whenever we still hold one. It is the credential the
        // player just signed in with, so it is at least as valid as the cookie; the
        // sentinel means the token was deliberately dropped after the server
        // confirmed cookie auth, and only then does the cookie carry the session.
        if (isLegacyBearerToken(token)) headers.Authorization = `Bearer ${token}`;
        try {
            const response = await fetch(`${apiBase}${path}`, { credentials: 'same-origin', ...options, headers });
            const raw = await response.text();
            let data = {};
            if (raw) {
                try {
                    data = JSON.parse(raw);
                } catch (error) {
                    data = { error: response.ok ? 'My Keep received an unexpected server response.' : (response.statusText || 'Request failed.') };
                }
            }
            if (!response.ok) data = { ...data, error: data.error || response.statusText || 'Request failed.', status: response.status };
            return data;
        } catch (error) {
            console.error(error);
            return { error: 'My Keep could not reach the server. Check your connection and try again.' };
        }
    }

    function mockApi(path, options) {
        if (typeof window.__KEEP_TEST_API__ === 'function') {
            return Promise.resolve(window.__KEEP_TEST_API__(path, options, clone(state.snapshot)));
        }
        const snapshot = clone(state.snapshot || window.__KEEP_TEST_SNAPSHOT__);
        delete snapshot.newLoreUnlocks;
        if (!options?.method || options.method === 'GET') return Promise.resolve(snapshot);
        const body = options.body ? JSON.parse(options.body) : {};
        snapshot.stateVersion = number(snapshot.stateVersion) + 1;
        snapshot.serverTime = new Date(nowMs()).toISOString();
        if (path.endsWith('/collect')) {
            const stationId = body.stationId || 'woodlot';
            const station = (snapshot.stations || [snapshot.station]).find((item) => item.id === stationId) || snapshot.station;
            const amount = projectedStationAvailable(station);
            if (stationId === 'woodlot') {
                snapshot.resources.timber = Math.min(snapshot.resources.timberCapacity, snapshot.resources.timber + amount);
                snapshot.station.collectCount = number(snapshot.station.collectCount) + 1;
                if (snapshot.station.collectCount === 1) mockUnlock(snapshot, 'letter_forester_maren');
                if (snapshot.station.collectCount >= 3) mockUnlock(snapshot, 'memorabilia_petrified_root');
            } else {
                const material = (snapshot.resources.materials || []).find((item) => item.id === station.resource);
                if (material) material.amount = Math.min(number(material.capacity || snapshot.resources.materialCapacity), number(material.amount) + amount);
            }
            station.available = 0;
            snapshot.collected = { resource: stationId === 'woodlot' ? 'TIMBER' : 'ESSENCE', amount, stationId };
        } else if (path.endsWith('/keep/resident')) {
            const stationId = body.stationId || 'woodlot';
            const stations = snapshot.stations || [snapshot.station];
            for (const item of stations) {
                if (item.residentId === body.residentId) { item.residentId = ''; item.resident = null; }
            }
            const station = stations.find((item) => item.id === stationId) || snapshot.station;
            station.residentId = body.residentId || '';
            station.resident = (snapshot.residents || []).find((item) => item.id === body.residentId) || null;
        } else if (path.endsWith('/enclave/resident')) {
            const slots = snapshot.enclave?.slots || [];
            for (const slot of slots) {
                if (body.residentId && slot.residentId === body.residentId) {
                    slot.residentId = ''; slot.resident = null; slot.mission = null;
                }
            }
            const slot = slots[number(body.slot)];
            if (slot) {
                const resident = (snapshot.residents || []).find((item) => item.id === body.residentId) || null;
                slot.residentId = resident?.id || '';
                slot.resident = resident;
                slot.mission = resident ? { id: `enclave_mission:${resident.id}`, name: 'Resident mission', description: 'Help the sanctuary together.', progress: 0, goal: 3, complete: false, claimed: false, gold: 90, remnants: 20 } : null;
            }
            if (snapshot.enclave) snapshot.enclave.residentCount = slots.filter((item) => item.resident).length;
        } else if (path.endsWith('/build')) {
            const option = (snapshot.buildOptions || []).find((item) => item.id === body.buildId);
            if (option) {
                snapshot.resources.timber -= option.timberCost;
                for (const cost of option.materialCosts || []) {
                    const material = (snapshot.resources.materials || []).find((item) => item.id === cost.id);
                    if (material) material.amount = Math.max(0, number(material.amount) - number(cost.amount));
                }
                const entry = {
                    id: option.id,
                    startedAt: new Date(nowMs()).toISOString(),
                    completesAt: new Date(nowMs() + option.durationSeconds * 1000).toISOString(),
                    remainingSeconds: option.durationSeconds,
                    progress: 0
                };
                snapshot.activeConstructions = [...(snapshot.activeConstructions || []), entry];
                snapshot.activeConstruction = snapshot.activeConstructions[0];
                snapshot.buildOptions = (snapshot.buildOptions || []).filter((item) => item.id !== option.id);
            }
        } else if (path.endsWith('/favorite')) {
            const resident = (snapshot.residents || []).find((item) => item.id === body.residentId) || null;
            const bonus = resident
                ? ({ UNCOMMON: 8, RARE: 12, EPIC: 16, LEGENDARY: 20 })[resident.rarity] || 5
                : 0;
            snapshot.favorite = {
                residentId: resident ? resident.id : '',
                resident,
                bonusPercent: bonus,
                label: resident ? `${titleCase(resident.rarity || 'COMMON')} favorite · +${bonus}% keep-wide` : 'No favorite chosen'
            };
            if (snapshot.visualState) snapshot.visualState.favoriteSet = Boolean(resident);
            snapshot.favoriteChanged = { residentId: snapshot.favorite.residentId, name: resident?.name || '', bonusPercent: bonus };
        } else if (path.endsWith('/lore/read')) {
            const entry = (snapshot.lore || []).find((item) => item.id === body.loreId);
            if (entry && !entry.read) {
                entry.read = true;
                snapshot.unreadLoreCount = Math.max(0, number(snapshot.unreadLoreCount) - 1);
            }
        } else if (path.endsWith('/memorabilia')) {
            const entry = (snapshot.lore || []).find((item) => item.id === body.loreId);
            if (entry) entry.displayed = Boolean(body.displayed);
        } else if (path.endsWith('/dialogue/choose')) {
            const conversation = (snapshot.availableConversations || []).find((item) => item.id === body.conversationId);
            const choice = conversation?.choices?.find((item) => item.id === body.choiceId);
            snapshot.availableConversations = (snapshot.availableConversations || []).filter((item) => item.id !== body.conversationId);
            if (number(choice?.timberCost) > 0) {
                snapshot.resources.timber = Math.max(0, number(snapshot.resources.timber) - number(choice.timberCost));
            }
            for (const cost of choice?.materialCosts || []) {
                const material = (snapshot.resources.materials || []).find((item) => item.id === cost.id);
                if (material) material.amount = Math.max(0, number(material.amount) - number(cost.amount));
            }
            const delta = number(choice?.relationshipDelta);
            const prior = (snapshot.relationships || []).find((item) => item.npcId === conversation?.npcId);
            const trust = Math.max(0, Math.min(7, number(prior?.trust) + delta));
            const stage = relationshipStage(trust);
            const relationships = (snapshot.relationships || []).filter((item) => item.npcId !== conversation?.npcId);
            if (conversation?.npcId) {
                relationships.unshift({ npcId: conversation.npcId, npcName: conversation.npcName, trust, trustMax: 7, stage });
            }
            snapshot.relationships = relationships;
            snapshot.dialogueResult = {
                npcId: conversation?.npcId,
                npcName: conversation?.npcName,
                kind: conversation?.kind || 'STORY',
                response: choice?.response || 'The sanctuary remembers your answer.',
                relationshipDelta: delta,
                trust,
                trustMax: 7,
                stage,
                summary: choiceCostHint(choice || {}) ? `Spent ${choiceCostHint(choice)}.` : 'No stores changed.'
            };
        } else if (path.endsWith('/reward')) {
            const item = (snapshot.milestones || []).find((milestone) => milestone.id === body.rewardId);
            const mission = (snapshot.enclave?.slots || []).map((slot) => slot.mission).find((entry) => entry?.id === body.rewardId);
            const reward = item?.reward || mission || snapshot.weeklyTribute?.reward || {};
            snapshot.resources.gold = number(snapshot.resources.gold) + number(reward.gold);
            snapshot.resources.remnants = number(snapshot.resources.remnants) + number(reward.remnants);
            if (item) { item.claimed = true; item.canClaim = false; }
            if (mission) mission.claimed = true;
            if (body.rewardId === 'weekly_tribute' && snapshot.weeklyTribute) snapshot.weeklyTribute.ready = false;
            snapshot.rewardClaimed = { id: body.rewardId, gold: number(reward.gold), remnants: number(reward.remnants) };
        } else if (path.endsWith('/craft')) {
            const recipe = (snapshot.recipes || []).find((item) => item.id === body.recipeId);
            if (recipe) {
                for (const cost of recipe.costs || []) {
                    const material = (snapshot.resources.materials || []).find((item) => item.id === cost.id);
                    if (material) material.amount = Math.max(0, number(material.amount) - number(cost.amount));
                }
                recipe.crafted = true; recipe.canCraft = false; recipe.count = 1;
                const decoration = (snapshot.decorations || []).find((item) => item.id === recipe.id);
                if (decoration) decoration.crafted = true;
                snapshot.crafted = { id: recipe.id, name: recipe.name, type: recipe.type };
            }
        } else if (path.endsWith('/decoration')) {
            snapshot.placedDecorations = snapshot.placedDecorations || {};
            const placed = new Set(String(snapshot.placedDecorations[body.roomId] || '').split(',').filter(Boolean));
            if (body.displayed) placed.add(body.decorationId);
            else placed.delete(body.decorationId);
            if (placed.size) snapshot.placedDecorations[body.roomId] = [...placed].join(',');
            else delete snapshot.placedDecorations[body.roomId];
            const decoration = (snapshot.decorations || []).find((item) => item.id === body.decorationId);
            if (decoration) decoration.displayed = Boolean(body.displayed);
        } else if (path.endsWith('/theme')) {
            const themes = snapshot.hallThemes || [];
            const picked = themes.find((item) => item.id === (body.themeId || 'covenant')) || themes[0];
            for (const item of themes) item.active = Boolean(picked) && item.id === picked.id;
            if (snapshot.visualState) snapshot.visualState.hallTheme = picked?.id || 'covenant';
            if (picked) {
                snapshot.hallTheme = { id: picked.id, name: picked.name, accent: picked.accent, trim: picked.trim };
                snapshot.themeChanged = { id: picked.id, name: picked.name };
            }
        }
        window.__KEEP_TEST_SNAPSHOT__ = clone(snapshot);
        return Promise.resolve(snapshot);
    }

    function mockUnlock(snapshot, id) {
        const catalog = window.__KEEP_TEST_LORE_CATALOG__ || [];
        const entry = catalog.find((item) => item.id === id);
        if (entry && !(snapshot.lore || []).some((item) => item.id === id)) {
            snapshot.lore.push(clone(entry));
            snapshot.unreadLoreCount = number(snapshot.unreadLoreCount) + 1;
            snapshot.newLoreUnlocks = [...(snapshot.newLoreUnlocks || []), id];
        }
    }

    function completeMockConstructionIfReady() {
        const snapshot = state.snapshot;
        if (!snapshot) return;
        const pending = activeConstructionList();
        const due = pending.filter((item) => constructionEntryRemaining(item) <= 0);
        if (!due.length) return;
        for (const item of due) applyMockConstruction(snapshot, item);
        snapshot.activeConstructions = pending.filter((item) => constructionEntryRemaining(item) > 0);
        snapshot.activeConstruction = snapshot.activeConstructions[0] || null;
        snapshot.stateVersion = number(snapshot.stateVersion) + 1;
        applySnapshot(snapshot, true);
    }

    function applyMockConstruction(snapshot, construction) {
        if (construction.id === 'restore_archive') {
            snapshot.visualState.archiveRestored = true;
            const archive = (snapshot.buildings || []).find((item) => item.id === 'archive');
            if (archive) { archive.level = 1; archive.status = 'COMPLETE'; archive.name = 'Living Archive'; }
            mockUnlock(snapshot, 'chronicle_living_elements');
            mockUnlock(snapshot, 'letter_pre_covenant_watch');
        } else if (construction.id === 'woodlot_level_2') {
            snapshot.visualState.woodlotLevel = 2;
            snapshot.station.level = 2;
            snapshot.station.ratePerMinute *= 2;
            mockUnlock(snapshot, 'letter_green_covenant');
        } else if (construction.id === 'build_enclave') {
            snapshot.visualState.enclaveLevel = 1;
            snapshot.enclave = snapshot.enclave || { capacity: 5, residentCount: 0, slots: [] };
            snapshot.enclave.built = true;
            snapshot.enclave.level = 1;
            while (snapshot.enclave.slots.length < 5) snapshot.enclave.slots.push({ slot: snapshot.enclave.slots.length, residentId: '', resident: null, mission: null });
            const enclave = (snapshot.buildings || []).find((item) => item.id === 'enclave');
            if (enclave) { enclave.level = 1; enclave.status = 'COMPLETE'; enclave.name = 'Siegeling Enclave'; }
        } else if (String(construction.id).startsWith('hall_level_')) {
            const level = number(String(construction.id).slice('hall_level_'.length));
            if (snapshot.visualState) snapshot.visualState.hallLevel = level;
            if (snapshot.keepRank) {
                snapshot.keepRank.level = level;
                snapshot.keepRank.name = RANK_NAMES[level - 1] || snapshot.keepRank.name;
                snapshot.keepRank.nextName = RANK_NAMES[level] || null;
            }
            const hall = (snapshot.buildings || []).find((item) => item.id === 'great_hall');
            if (hall) { hall.level = level; hall.status = 'COMPLETE'; }
        }
    }

    function projectedAvailable() {
        return projectedStationAvailable(state.snapshot?.station);
    }

    function projectedStationAvailable(station) {
        if (!station) return 0;
        const elapsedMinutes = Math.max(0, (nowMs() - state.receivedAtMs) / 60000);
        return Math.min(number(station.storageCapacity), number(station.available) + Math.floor(elapsedMinutes * number(station.ratePerMinute)));
    }

    /** Held amount of a raw material, used to flag shortfalls on cross-workshop recipes. */
    function materialHeld(id) {
        return number((state.snapshot?.resources?.materials || []).find((item) => item.id === id)?.amount);
    }

    function stationById(id) {
        return (state.snapshot?.stations || [state.snapshot?.station]).find((station) => station?.id === id) || null;
    }

    function assignmentFor(residentId) {
        if (!residentId) return null;
        return (state.snapshot?.stations || []).find((station) => station?.residentId === residentId)
            || (state.snapshot?.station?.residentId === residentId ? state.snapshot.station : null);
    }

    function shortStationName(station) {
        const shorts = {
            woodlot: 'Woodlot', garden: 'Garden', forge: 'Forge', fridge: 'Fridge', generator: 'Generator'
        };
        if (station?.id && shorts[station.id]) return shorts[station.id];
        return String(station?.name || 'station')
            .replace(/^Restorative\s+/i, '')
            .replace(/^Covenant\s+/i, '')
            .replace(/^Accord\s+/i, '')
            .replace(/^Frost\s+/i, '')
            .replace(/^Elemental\s+/i, '');
    }

    function facilityTitle(id) {
        return ({ woodlot: 'Woodlot', garden: 'Garden', forge: 'Forge', fridge: 'Fridge', generator: 'Generator' })[id] || titleCase(id || 'workshop');
    }

    function craftedIcon(type) {
        return ({ TOOL: '⚒', BONUS: '✦', DECORATION: '◇' })[String(type || '').toUpperCase()] || '◆';
    }

    function relationshipStage(trust) {
        const value = Math.max(0, number(trust));
        if (value >= 7) return 'Bonded';
        if (value >= 3) return 'Trusted';
        if (value >= 1) return 'Acquainted';
        return 'Distant';
    }

    function materialById(id) {
        return (state.snapshot?.resources?.materials || []).find((item) => item.id === id) || null;
    }

    function materialIcon(id) {
        return ({ verdant_fiber: '❧', ember_ingot: '◆', frost_crystal: '❄', storm_cell: '⚡', stone: '◈', provisions: '❋' })[id] || '✦';
    }

    function stationFill(station) {
        return Math.round(clamp(projectedStationAvailable(station) / Math.max(1, number(station?.storageCapacity)), 0, 1) * 100);
    }

    function facilityIcon(id) {
        return ({ garden: '❧', forge: '♨', fridge: '❄', generator: '⚡', woodlot: '♧', quarry: '◈', kitchen: '❋' })[id] || '✦';
    }

    function residentAffinity(resident, station) {
        const affinities = station?.affinities || (station?.id === 'woodlot' ? ['EARTH', 'WIND', 'WATER', 'LIGHT'] : []);
        if (affinities.includes(resident.element)) return `${titleCase(resident.element)} affinity · +${station?.id === 'woodlot' ? 15 : 20}%`;
        if (resident.element === 'NEUTRAL' && station?.id !== 'woodlot') return 'Neutral affinity · +5%';
        return 'Normal rate';
    }

    function constructionEntryRemaining(entry) {
        const completes = Date.parse(entry?.completesAt || '');
        return Number.isFinite(completes) ? Math.max(0, Math.ceil((completes - nowMs()) / 1000)) : 0;
    }

    function constructionRemaining() {
        const constructions = activeConstructionList();
        if (!constructions.length) return 0;
        return constructions.reduce((min, item) => Math.min(min, constructionEntryRemaining(item)), Infinity);
    }

    function constructionPercent(index = 0) {
        const construction = activeConstructionList()[index];
        if (!construction) return 0;
        const started = Date.parse(construction.startedAt || '') || nowMs();
        const completes = Date.parse(construction.completesAt || '') || nowMs();
        return Math.round(clamp((nowMs() - started) / Math.max(1, completes - started), 0, 1) * 100);
    }

    function woodlotFill() {
        return Math.round(clamp(projectedAvailable() / Math.max(1, number(state.snapshot?.station?.storageCapacity)), 0, 1) * 100);
    }

    function nowMs() { return Date.now() + state.debugTimeOffsetMs; }
    function loreById(id) { return (state.snapshot?.lore || []).find((item) => item.id === id); }
    function conversationById(id) { return (state.snapshot?.availableConversations || []).find((item) => item.id === id); }
    function projectName(id) {
        const names = {
            restore_archive: 'Restore the Living Archive', woodlot_level_2: 'Cultivate the Woodlot',
            raise_storehouse: 'Raise the Covenant Storehouse', build_garden: 'Plant the Covenant Garden',
            build_forge: 'Kindle the Accord Forge', build_fridge: 'Raise the Frost Fridge',
            build_generator: 'Tune the Elemental Generator', storehouse_level_2: 'Vault the Storehouse',
            build_quarry: 'Open the Covenant Quarry', build_kitchen: 'Warm the Garden Kitchen',
            build_enclave: 'Raise the Siegeling Enclave',
            build_builders_yard: 'Raise the Builder’s Yard',
            hall_level_2: 'Raise the Timber Outpost', hall_level_3: 'Settle the Courtyard',
            hall_level_4: 'Cut the Stonehold', hall_level_5: 'Raise the Keep Walls',
            hall_level_6: 'Awaken the Elemental Stronghold', hall_level_7: 'Crown the High Castle',
            hall_level_8: 'Consecrate the Grand Keep'
        };
        if (names[id]) return names[id];
        if (String(id).endsWith('_level_2')) return `Expand the ${titleCase(String(id).replace('_level_2', '').replaceAll('_', ' '))}`;
        return 'Construction project';
    }
    function typeLabel(type) { return type === 'LETTER' ? 'Recovered letter' : type === 'MEMORABILIA' ? 'Memorabilia' : 'Chronicle'; }
    function formatRate(value) { const rate = number(value); return Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/0$/, ''); }

    function formatDuration(seconds) {
        let remaining = Math.max(0, Math.round(number(seconds)));
        const days = Math.floor(remaining / 86400); remaining %= 86400;
        const hours = Math.floor(remaining / 3600); remaining %= 3600;
        const minutes = Math.floor(remaining / 60); const secs = remaining % 60;
        if (days) return `${days}d ${hours}h`;
        if (hours) return `${hours}h ${minutes}m`;
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    function formatAwayDuration(seconds) {
        const total = Math.max(0, Math.round(number(seconds)));
        const days = Math.floor(total / 86400);
        const hours = Math.floor((total % 86400) / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        if (days) return `${days}d ${hours}h`;
        if (hours) return `${hours}h ${minutes}m`;
        return `${Math.max(1, minutes)}m`;
    }

    function formatDateTime(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'later' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function titleCase(value) {
        return String(value || '').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function residentAvatarContent(resident) {
        if (resident?.artUrl) return `<img src="${escapeAttr(resident.artUrl)}" alt="">`;
        return escapeHtml(initials(resident?.name || 'S'));
    }

    /** Placed residents share one paper-cutout treatment, independent of the source art format. */
    function setResidentOverlayArt(node, resident) {
        if (!node) return;
        const hasArt = Boolean(resident?.artUrl);
        node.classList.toggle('has-overlay-art', hasArt);
        node.classList.toggle('is-paper-cutout', hasArt);
        node.classList.toggle('is-paper-token', Boolean(resident) && !hasArt);
        node.innerHTML = resident ? residentAvatarContent(resident) : '';
    }

    function initials(value) {
        return String(value || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    }

    function roman(value) { return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][Math.max(0, Math.min(8, number(value) - 1))] || 'I'; }
    function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function text(id, value) { const node = document.getElementById(id); if (node) node.textContent = String(value ?? ''); }
    function isTyping(target) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable; }
    function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
    function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
    function requestId() { return window.crypto?.randomUUID?.() || `keep-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
            else await document.exitFullscreen?.();
        } catch (error) {
            console.warn('Fullscreen unavailable', error);
        }
    }

    window.advanceTime = function (ms) {
        state.debugTimeOffsetMs += Math.max(0, number(ms));
        if (state.testMode) completeMockConstructionIfReady();
        updateLiveCounters();
    };

    window.render_game_to_text = function () {
        const snapshot = state.snapshot;
        if (!snapshot) return JSON.stringify({
            mode: 'keep',
            status: document.getElementById('keepGate')?.classList.contains('hidden') ? 'loading' : 'sign-in-required'
        });
        return JSON.stringify({
            mode: 'keep',
            coordinateSystem: 'The keep scene uses viewport percentages; origin is top-left, x increases right, y increases down.',
            chapter: snapshot.chapter,
            resources: {
                timber: number(snapshot.resources?.timber), timberCapacity: number(snapshot.resources?.timberCapacity),
                materials: (snapshot.resources?.materials || []).map((item) => ({ id: item.id, amount: number(item.amount), capacity: number(item.capacity) })),
                siegecoins: number(snapshot.resources?.gold), remnants: number(snapshot.resources?.remnants)
            },
            station: {
                id: 'woodlot', level: number(snapshot.station?.level), availableTimber: projectedAvailable(),
                capacity: number(snapshot.station?.storageCapacity), ratePerMinute: number(snapshot.station?.ratePerMinute),
                invitedResident: snapshot.station?.resident?.name || null
            },
            buildings: (snapshot.buildings || []).map((item) => ({ id: item.id, level: item.level, status: item.status })),
            stations: (snapshot.stations || []).map((station) => ({
                id: station.id, level: number(station.level), available: projectedStationAvailable(station),
                capacity: number(station.storageCapacity), ratePerMinute: number(station.ratePerMinute),
                resident: station.resident?.name || null, affinities: station.affinities || []
            })),
            keepRank: snapshot.keepRank || null,
            keeper: snapshot.keeper || null,
            siegelingSlots: snapshot.siegelingSlots || null,
            hallTheme: snapshot.visualState?.hallTheme || 'covenant',
            favorite: snapshot.favorite || null,
            weeklyOrder: snapshot.weeklyOrder || null,
            constructionSlots: number(snapshot.constructionSlots) || 1,
            activeConstructions: activeConstructionList().map((item) => ({
                id: item.id, remainingSeconds: constructionEntryRemaining(item)
            })),
            sceneView: { zoom: view.zoom, panX: view.panX, panY: view.panY },
            stockpileTiers: (snapshot.stations || [snapshot.station]).filter(Boolean).reduce((out, station) => {
                out[station.id] = fillTier(station);
                return out;
            }, {}),
            milestones: (snapshot.milestones || []).map((item) => ({ id: item.id, complete: Boolean(item.complete), claimed: Boolean(item.claimed), canClaim: Boolean(item.canClaim) })),
            weeklyTribute: snapshot.weeklyTribute || null,
            recipes: (snapshot.recipes || []).map((item) => ({ id: item.id, roomId: item.roomId, type: item.type, crafted: Boolean(item.crafted), canCraft: Boolean(item.canCraft) })),
            relationships: (snapshot.relationships || []).map((item) => ({
                npcId: item.npcId, npcName: item.npcName, stage: item.stage,
                trust: number(item.trust), trustMax: number(item.trustMax) || 7
            })),
            selectedRelationshipId: state.selectedRelationshipId || null,
            inventoryFilter: state.inventoryFilter || 'ALL',
            placedDecorations: snapshot.placedDecorations || {},
            enclave: snapshot.enclave ? {
                built: Boolean(snapshot.enclave.built),
                residentCount: number(snapshot.enclave.residentCount),
                capacity: number(snapshot.enclave.capacity),
                slots: (snapshot.enclave.slots || []).map((slot) => ({
                    slot: number(slot.slot), resident: slot.resident?.name || null,
                    mission: slot.mission ? { id: slot.mission.id, progress: number(slot.mission.progress), goal: number(slot.mission.goal), complete: Boolean(slot.mission.complete), claimed: Boolean(slot.mission.claimed) } : null
                }))
            } : null,
            noticeCenter: {
                unread: unreadNoticeCount(),
                read: state.notices.length - unreadNoticeCount(),
                count: state.notices.length,
                open: !document.getElementById('noticeTray')?.classList.contains('hidden'),
                constructionTimers: activeConstructionList().map((item, index) => ({
                    id: item.id,
                    name: projectName(item.id),
                    remainingSeconds: constructionEntryRemaining(item),
                    progressPercent: constructionPercent(index)
                }))
            },
            construction: snapshot.activeConstruction ? { id: snapshot.activeConstruction.id, remainingSeconds: constructionRemaining(), progressPercent: constructionPercent(), collapsed: state.constructionCollapsed } : null,
            constructionBanner: {
                visible: activeConstructionList().length > 0,
                collapsed: state.constructionCollapsed,
                jobs: activeConstructionList().map((item, index) => ({
                    id: item.id,
                    name: projectName(item.id),
                    remainingSeconds: constructionEntryRemaining(item),
                    progressPercent: constructionPercent(index)
                }))
            },
            activePanel: state.panel || null,
            interior: state.interior || null,
            tutorialVisible: !document.getElementById('keepTutorial')?.classList.contains('hidden'),
            offlineReportVisible: state.offlineVisible,
            unreadLore: number(snapshot.unreadLoreCount),
            discoveries: (snapshot.lore || []).map((item) => ({ id: item.id, type: item.type, title: item.title, read: Boolean(item.read), displayed: Boolean(item.displayed) })),
            availableConversations: (snapshot.availableConversations || []).map((item) => ({ id: item.id, npc: item.npcName }))
        });
    };
})();
