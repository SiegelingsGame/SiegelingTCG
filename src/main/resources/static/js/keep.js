(function () {
    'use strict';

    const AUTH_TOKEN_KEY = 'sieglingsAuthToken';
    const COOKIE_SESSION_VALUE = 'cookie';
    const apiBase = String(window.SIEGLINGS_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
    const TUTORIAL_KEY = 'sieglingsKeepTutorialSeen';
    const TUTORIAL_STEPS = [
        {
            art: 'âŒ‚', kicker: 'Welcome, Keeper', title: 'The Wounded Ground',
            body: 'This land was stripped bare by the war. Your Keep is a promise to give more than you take. Rebuild at your own pace â€” everything here keeps growing while you are away.'
        },
        {
            art: 'â–°', kicker: 'Grow and gather', title: 'The Woodlot works for you',
            body: 'The Restorative Woodlot produces timber over time â€” the READY counter at the top shows how much is waiting. Tap Collect to store it. Cultivation, never clear-cutting.'
        },
        {
            art: 'âš’', kicker: 'Restore the sanctuary', title: 'Spend timber on Projects',
            body: 'Open Projects and spend timber to raise ruined buildings. Construction finishes on its own, even while you are offline, and every finished project changes the land itself.'
        },
        {
            art: 'â–¤', kicker: 'Step inside and listen', title: 'Buildings open up',
            body: 'Tap any building to step inside it. Read recovered letters in the Chronicle, display memorabilia, and answer the Voices â€” your choices shape trust, never your production.'
        },
        {
            art: 'âœ¦', kicker: 'Choose what comes next', title: 'Build an elemental workshop',
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
        noticeUnread: 0,
        mobileLayout: window.matchMedia('(max-width: 767px)').matches,
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
        bindEvents();
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
            if (event.key === 'Escape') {
                if (!document.getElementById('keepTutorial')?.classList.contains('hidden')) finishTutorial();
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

    /* â€”â€” Scene pan & zoom: buttons for accessibility, pointer drag when zoomed. â€”â€” */
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
            openPanel(panelTrigger.dataset.openPanel);
            return;
        }
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
            void startBuild(build.daÛßtîÚ$z{-®éÜj×ĞĞ¢ĞĞ Ğ¢gVæ7F–öâ&ö¦V7FVDf–Æ&ÆR‚’°Ğ¢&WGW&â&ö¦V7FVE7FF–öäf–Æ&ÆR‡7FFRç6æ6†÷Còç7FF–öâ“°Ğ¢ĞĞ Ğ¢gVæ7F–öâ&ö¦V7FVE7FF–öäf–Æ&ÆR‡7FF–öâ’°Ğ¢–b‚7FF–öâ’&WGW&â°Ğ¢6öç7BVÆ6VDÖ–çWFW2ÒÖF‚æÖ‚ƒÂ†æ÷t×2‚’Ò7FFRç&V6V—fVDD×2’òc“°Ğ¢&WGW&âÖF‚æÖ–â†çVÖ&W"‡7FF–öâç7F÷&vT66—G’’ÂçVÖ&W"‡7FF–öâæf–Æ&ÆR’²ÖF‚æfÆö÷"†VÆ6VDÖ–çWFW2¢çVÖ&W"‡7FF–öâç&FUW$Ö–çWFR’’“°Ğ¢ĞĞ Ğ¢gVæ7F–öâ7FF–öä'”–B†–B’°Ğ¢&WGW&â‡7FFRç6æ6†÷Còç7FF–öç2ÇÂ·7FFRç6æ6†÷Còç7FF–öåÒ’æf–æB‚‡7FF–öâ’Óâ7FF–öãòæ–BÓÓÒ–B’ÇÂçVÆÃ°Ğ¢ĞĞ Ğ¢gVæ7F–öâ76–væÖVçDf÷"‡&W6–FVçD–B’°Ğ¢–b‚&W6–FVçD–B’&WGW&âçVÆÃ°Ğ¢&WGW&â‡7FFRç6æ6†÷Còç7FF–öç2ÇÂµÒ’æf–æB‚‡7FF–öâ’Óâ7FF–öãòç&W6–FVçD–BÓÓÒ&W6–FVçD–BĞ¢ÇÂ‡7FFRç6æ6†÷Còç7FF–öãòç&W6–FVçD–BÓÓÒ&W6–FVçD–Bò7FFRç6æ6†÷Bç7FF–öâ¢çVÆÂ“°Ğ¢ĞĞ Ğ¢gVæ7F–öâ6†÷'E7FF–öäæÖR‡7FF–öâ’°Ğ¢6öç7B6†÷'G2Ò°Ğ¢vööFÆ÷C¢uvööFÆ÷BrÂv&FVã¢tv&FVârÂf÷&vS¢tf÷&vRrÂg&–FvS¢tg&–FvRrÂvVæW&F÷#¢tvVæW&F÷"pĞ¢Ó°Ğ¢–b‡7FF–öãòæ–Bbb6†÷'G5·7FF–öâæ–EÒ’&WGW&â6†÷'G5·7FF–öâæ–EÓ°Ğ¢&WGW&â7G&–ær‡7FF–öãòææÖRÇÂw7FF–öârĞ¢ç&WÆ6R‚õå&W7F÷&F—fUÇ2²ö’ÂrrĞ¢ç&WÆ6R‚õä6÷fVæçEÇ2²ö’ÂrrĞ¢ç&WÆ6R‚õä66÷&EÇ2²ö’ÂrrĞ¢ç&WÆ6R‚õäg&÷7EÇ2²ö’ÂrrĞ¢ç&WÆ6R‚õäVÆVÖVçFÅÇ2²ö’Ârr“°Ğ¢ĞĞ Ğ¢gVæ7F–öâf6–Æ—G•F—FÆR†–B’°Ğ¢&WGW&â‡²vööFÆ÷C¢uvööFÆ÷BrÂv&FVã¢tv&FVârÂf÷&vS¢tf÷&vRrÂg&–FvS¢tg&–FvRrÂvVæW&F÷#¢tvVæW&F÷"rÒ•¶–EÒÇÂF—FÆT66R†–BÇÂwv÷&·6†÷r“°Ğ¢ĞĞ Ğ¢gVæ7F–öâ7&gFVD–6öâ‡G—R’°Ğ¢&WGW&â‡²DôôÃ¢~)©"rÂ$ôåU3¢~)ÊbrÂDT4õ$D”ôã¢~)xrrÒ•µ7G&–ær‡G—RÇÂrr’çFõWW$66R‚•ÒÇÂ~)xbs°Ğ¢ĞĞ Ğ¢gVæ7F–öâ&VÆF–öç6†—7FvR‡G'W7B’°Ğ¢6öç7BfÇVRÒÖF‚æÖ‚ƒÂçVÖ&W"‡G'W7B’“°Ğ¢–b‡fÇVRãÒr’&WGW&ât&öæFVBs°Ğ¢–b‡fÇVRãÒ2’&WGW&âuG'W7FVBs°Ğ¢–b‡fÇVRãÒ’&WGW&ât7V–çFVBs°Ğ¢&WGW&âuv'’s°Ğ¢ĞĞ Ğ¢gVæ7F–öâÖFW&–Ä'”–B†–B’°Ğ¢&WGW&â‡7FFRç6æ6†÷Còç&W6÷W&6W3òæÖFW&–Ç2ÇÂµÒ’æf–æB‚†—FVÒ’Óâ—FVÒæ–BÓÓÒ–B’ÇÂçVÆÃ°Ğ¢ĞĞ Ğ¢gVæ7F–öâÖFW&–Ä–6öâ†–B’°Ğ¢&WGW&â‡²fW&FçEöf–&W#¢~)ÚrrÂVÖ&W%ö–æv÷C¢~)xbrÂg&÷7Eö7'—7FÃ¢~)ØBrÂ7F÷&Õö6VÆÃ¢~)ªrÂ7FöæS¢~)x‚rÂ&÷f—6–öç3¢~)Ø²rÒ•¶–EÒÇÂ~)Êbs°Ğ¢ĞĞ Ğ¢gVæ7F–öâ7FF–öäf–ÆÂ‡7FF–öâ’°Ğ¢&WGW&âÖF‚ç&÷VæB†6Æ×‡&ö¦V7FVE7FF–öäf–Æ&ÆR‡7FF–öâ’òÖF‚æÖ‚ƒÂçVÖ&W"‡7FF–öãòç7F÷&vT66—G’’’ÂÂ’¢“°Ğ¢ĞĞ Ğ¢gVæ7F–öâf6–Æ—G”–6öâ†–B’°Ğ¢&WGW&â‡²v&FVã¢~)ÚrrÂf÷&vS¢~)š‚rÂg&–FvS¢~)ØBrÂvVæW&F÷#¢~)ªrÂvööFÆ÷C¢~)šrrÂV''“¢~)x‚rÂ¶—F6†Vã¢~)Ø²rÒ•¶–EÒÇÂ~)Êbs°Ğ¢ĞĞ Ğ¢gVæ7F–öâ&W6–FVçDff–æ—G’‡&W6–FVçBÂ7FF–öâ’°Ğ¢6öç7Bff–æ—F–W2Ò7FF–öãòæff–æ—F–W2ÇÂ‡7FF–öãòæ–BÓÓÒwvööFÆ÷Brò²tT%D‚rÂut”äBrÂutDU"rÂtÄ”t…BuÒ¢µÒ“°Ğ¢–b†ff–æ—F–W2æ–æ6ÇVFW2‡&W6–FVçBæVÆVÖVçB’’&WGW&âG·F—FÆT66R‡&W6–FVçBæVÆVÖVçB—Òff–æ—G’+r²G·7FF–öãòæ–BÓÓÒwvööFÆ÷BròR¢#ÒV°Ğ¢–b‡&W6–FVçBæVÆVÖVçBÓÓÒtäUUE$Ârbb7FF–öãòæ–BÓÒwvööFÆ÷Br’&WGW&âtæWWG&Âff–æ—G’+r³RRs°Ğ¢&WGW&âtæ÷&ÖÂ&FRs°Ğ¢ĞĞ Ğ¢gVæ7F–öâ6öç7G'V7F–öäVçG'•&VÖ–æ–ær†VçG'’’°Ğ¢6öç7B6ö×ÆWFW2ÒFFRç'6R†VçG'“òæ6ö×ÆWFW4BÇÂrr“°Ğ¢&WGW&âçVÖ&W"æ—4f–æ—FR†6ö×ÆWFW2’òÖF‚æÖ‚ƒÂÖF‚æ6V–Â‚†6ö×ÆWFW2Òæ÷t×2‚’’ò’’¢°Ğ¢ĞĞ Ğ¢gVæ7F–öâ6öç7G'V7F–öå&VÖ–æ–ær‚’°Ğ¢6öç7B6öç7G'V7F–öç2Ò7F—fT6öç7G'V7F–öäÆ—7B‚“°Ğ¢–b‚6öç7G'V7F–öç2æÆVæwF‚’&WGW&â°Ğ¢&WGW&â6öç7G'V7F–öç2ç&VGV6R‚†Ö–âÂ—FVÒ’ÓâÖF‚æÖ–â†Ö–âÂ6öç7G'V7F–öäVçG'•&VÖ–æ–ær†—FVÒ’’Â–æf–æ—G’“°Ğ¢ĞĞ Ğ¢gVæ7F–öâ6öç7G'V7F–öåW&6VçB†–æFW‚Ò’°Ğ¢6öç7B6öç7G'V7F–öâÒ7F—fT6öç7G'V7F–öäÆ—7B‚•¶–æFW…Ó°Ğ¢–b‚6öç7G'V7F–öâ’&WGW&â°Ğ¢6öç7B7F'FVBÒFFRç'6R†6öç7G'V7F–öâç7F'FVDBÇÂrr’ÇÂæ÷t×2‚“°Ğ¢6öç7B6ö×ÆWFW2ÒFFRç'6R†6öç7G'V7F–öâæ6ö×ÆWFW4BÇÂrr’ÇÂæ÷t×2‚“°Ğ¢&WGW&âÖF‚ç&÷VæB†6Æ×‚†æ÷t×2‚’Ò7F'FVB’òÖF‚æÖ‚ƒÂ6ö×ÆWFW2Ò7F'FVB’ÂÂ’¢“°Ğ¢ĞĞ Ğ¢gVæ7F–öâvööFÆ÷Df–ÆÂ‚’°Ğ¢&WGW&âÖF‚ç&÷VæB†6Æ×‡&ö¦V7FVDf–Æ&ÆR‚’òÖF‚æÖ‚ƒÂçVÖ&W"‡7FFRç6æ6†÷Còç7FF–öãòç7F÷&vT66—G’’’ÂÂ’¢“°Ğ¢ĞĞ Ğ¢gVæ7F–öâæ÷t×2‚’²&WGW&âFFRææ÷r‚’²7FFRæFV'VuF–ÖTöfg6WD×3²ĞĞ¢gVæ7F–öâÆ÷&T'”–B†–B’²&WGW&â‡7FFRç6æ6†÷CòæÆ÷&RÇÂµÒ’æf–æB‚†—FVÒ’Óâ—FVÒæ–BÓÓÒ–B“²ĞĞ¢gVæ7F–öâ6öçfW'6F–öä'”–B†–B’²&WGW&â‡7FFRç6æ6†÷Còæf–Æ&ÆT6öçfW'6F–öç2ÇÂµÒ’æf–æB‚†—FVÒ’Óâ—FVÒæ–BÓÓÒ–B“²ĞĞ¢gVæ7F–öâ&ö¦V7DæÖR†–B’°Ğ¢6öç7BæÖW2Ò°Ğ¢&W7F÷&Uö&6†—fS¢u&W7F÷&RF†RÆ—f–ær&6†—fRrÂvööFÆ÷EöÆWfVÅó#¢t7VÇF—fFRF†RvööFÆ÷BrÀĞ¢&—6U÷7F÷&V†÷W6S¢u&—6RF†R6÷fVæçB7F÷&V†÷W6RrÂ'V–ÆEöv&FVã¢uÆçBF†R6÷fVæçBv&FVârÀĞ¢'V–ÆEöf÷&vS¢t¶–æFÆRF†R66÷&Bf÷&vRrÂ'V–ÆEög&–FvS¢u&—6RF†Rg&÷7Bg&–FvRrÀĞ¢'V–ÆEövVæW&F÷#¢uGVæRF†RVÆVÖVçFÂvVæW&F÷"rÂ7F÷&V†÷W6UöÆWfVÅó#¢ufVÇBF†R7F÷&V†÷W6RrÀĞ¢'V–ÆE÷V''“¢t÷VâF†R6÷fVæçBV''’rÂ'V–ÆEö¶—F6†Vã¢uv&ÒF†Rv&FVâ¶—F6†VârÀ¢'V–ÆEöVæ6ÆfS¢u&—6RF†R6–VvVÆ–ærVæ6ÆfRrÀ¢'V–ÆEö'V–ÆFW'5÷–&C¢u&—6RF†R'V–ÆFW.(	—2–&BrÀĞ¢†ÆÅöÆWfVÅó#¢u&—6RF†RF–Ö&W"÷WG÷7BrÂ†ÆÅöÆWfVÅó3¢u6WGFÆRF†R6÷W'G–&BrÀĞ¢†ÆÅöÆWfVÅóC¢t7WBF†R7FöæV†öÆBrÂ†ÆÅöÆWfVÅóS¢u&—6RF†R¶VWvÆÇ2rÀĞ¢†ÆÅöÆWfVÅóc¢tv¶VâF†RVÆVÖVçFÂ7G&öæv†öÆBrÂ†ÆÅöÆWfVÅós¢t7&÷vâF†R†–v‚67FÆRrÀĞ¢†ÆÅöÆWfVÅóƒ¢t6öç6V7&FRF†Rw&æB¶VWpĞ¢Ó°Ğ¢–b†æÖW5¶–EÒ’&WGW&âæÖW5¶–EÓ°Ğ¢–b…7G&–ær†–B’æVæG5v—F‚‚uöÆWfVÅó"r’’&WGW&âW‡æBF†RG·F—FÆT66R…7G&–ær†–B’ç&WÆ6R‚uöÆWfVÅó"rÂrr’ç&WÆ6TÆÂ‚uòrÂrr’—Ö°Ğ¢&WGW&ât6öç7G'V7F–öâ&ö¦V7Bs°Ğ¢ĞĞ¢gVæ7F–öâG—TÆ&VÂ‡G—R’²&WGW&âG—RÓÓÒtÄUEDU"ròu&V6÷fW&VBÆWGFW"r¢G—RÓÓÒtÔTÔõ$$”Ä”ròtÖVÖ÷&&–Æ–r¢t6‡&öæ–6ÆRs²ĞĞ¢gVæ7F–öâf÷&ÖE&FR‡fÇVR’²6öç7B&FRÒçVÖ&W"‡fÇVR“²&WGW&âçVÖ&W"æ—4–çFVvW"‡&FR’ò7G&–ær‡&FR’¢&FRçFôf—†VBƒ"’ç&WÆ6R‚óBòÂrr“²ĞĞ Ğ¢gVæ7F–öâf÷&ÖDGW&F–öâ‡6V6öæG2’°Ğ¢ÆWB&VÖ–æ–ærÒÖF‚æÖ‚ƒÂÖF‚ç&÷VæB†çVÖ&W"‡6V6öæG2’’“°Ğ¢6öç7BF—2ÒÖF‚æfÆö÷"‡&VÖ–æ–æròƒcC“²&VÖ–æ–ærSÒƒcC°Ğ¢6öç7B†÷W'2ÒÖF‚æfÆö÷"‡&VÖ–æ–ærò3c“²&VÖ–æ–ærSÒ3c°Ğ¢6öç7BÖ–çWFW2ÒÖF‚æfÆö÷"‡&VÖ–æ–æròc“²6öç7B6V72Ò&VÖ–æ–ærRc°Ğ¢–b†F—2’&WGW&âG¶F—7ÖBG¶†÷W'7Ö†°Ğ¢–b††÷W'2’&WGW&âG¶†÷W'7Ö‚G¶Ö–çWFW7ÖÖ°Ğ¢&WGW&âG¶Ö–çWFW7Ó¢Gµ7G&–ær‡6V72’çE7F'Bƒ"Âsr—Ö°Ğ¢ĞĞ Ğ¢gVæ7F–öâf÷&ÖDv”GW&F–öâ‡6V6öæG2’°Ğ¢6öç7BF÷FÂÒÖF‚æÖ‚ƒÂÖF‚ç&÷VæB†çVÖ&W"‡6V6öæG2’’“°Ğ¢6öç7BF—2ÒÖF‚æfÆö÷"‡F÷FÂòƒcC“°Ğ¢6öç7B†÷W'2ÒÖF‚æfÆö÷"‚‡F÷FÂRƒcC’ò3c“°Ğ¢6öç7BÖ–çWFW2ÒÖF‚æfÆö÷"‚‡F÷FÂR3c’òc“°Ğ¢–b†F—2’&WGW&âG¶F—7ÖBG¶†÷W'7Ö†°Ğ¢–b††÷W'2’&WGW&âG¶†÷W'7Ö‚G¶Ö–çWFW7ÖÖ°Ğ¢&WGW&âG´ÖF‚æÖ‚ƒÂÖ–çWFW2—ÖÖ°Ğ¢ĞĞ Ğ¢gVæ7F–öâf÷&ÖDFFUF–ÖR‡fÇVR’°Ğ¢6öç7BFFRÒæWrFFR‡fÇVR“°Ğ¢&WGW&âçVÖ&W"æ—4æâ†FFRævWEF–ÖR‚’’òvÆFW"r¢FFRçFôÆö6ÆU7G&–ær…µÒÂ²ÖöçFƒ¢w6†÷'BrÂF“¢vçVÖW&–2rÂ†÷W#¢vçVÖW&–2rÂÖ–çWFS¢s"ÖF–v—BrÒ“°Ğ¢ĞĞ Ğ¢gVæ7F–öâF—FÆT66R‡fÇVR’°Ğ¢&WGW&â7G&–ær‡fÇVRÇÂrr’çFôÆ÷vW$66R‚’ç&WÆ6R‚õÆ%ÇrörÂ†ÆWGFW"’ÓâÆWGFW"çFõWW$66R‚’“°Ğ¢ĞĞ Ğ¢gVæ7F–öâ&W6–FVçDfF$6öçFVçB‡&W6–FVçB’°Ğ¢–b‡&W6–FVçCòæ'EW&Â’&WGW&âÆ–Ör7&3Ò"G¶W66TGG"‡&W6–FVçBæ'EW&Â—Ò"ÇCÒ"#æ°Ğ¢&WGW&âW66T‡FÖÂ†–æ—F–Ç2‡&W6–FVçCòææÖRÇÂu2r’“°Ğ¢ĞĞ Ğ¢ò¢¢66VæR&W6–FVçG2W6R6–VvR×7G–ÆR7FæF–ær÷fW&Æ’7WF÷WG2v†Vâ'B—2f–Æ&ÆRâ¢ğĞ¢gVæ7F–öâ6WE&W6–FVçD÷fW&Æ”'B†æöFRÂ&W6–FVçB’°Ğ¢–b‚æöFR’&WGW&ã°Ğ¢æöFRæ6Æ74Æ—7BçFövvÆR‚v†2Ö÷fW&Æ’Ö'BrÂ&ööÆVâ‡&W6–FVçCòæ'EW&Â’“°Ğ¢æöFRæ–ææW$…DÔÂÒ&W6–FVçBò&W6–FVçDfF$6öçFVçB‡&W6–FVçB’¢rs°Ğ¢ĞĞ Ğ¢gVæ7F–öâ–æ—F–Ç2‡fÇVR’°Ğ¢&WGW&â7G&–ær‡fÇVRÇÂsòr’ç7Æ—B‚õÇ2²ò’æf–ÇFW"„&ööÆVâ’ç6Æ–6RƒÂ"’æÖ‚‡'B’Óâ'E³Ò’æ¦ö–â‚rr’çFõWW$66R‚“°Ğ¢ĞĞ Ğ¢gVæ7F–öâ&öÖâ‡fÇVR’²&WGW&â²t’rÂt”’rÂt””’rÂt•brÂubrÂud’rÂud”’rÂud””’rÂt•‚uÕ´ÖF‚æÖ‚ƒÂÖF‚æÖ–âƒ‚ÂçVÖ&W"‡fÇVR’Ò’•ÒÇÂt’s²ĞĞ¢gVæ7F–öâçVÖ&W"‡fÇVR’²6öç7B'6VBÒçVÖ&W"‡fÇVR“²&WGW&âçVÖ&W"æ—4f–æ—FR‡'6VB’ò'6VB¢²ĞĞ¢gVæ7F–öâ6Æ×‡fÇVRÂÖ–âÂÖ‚’²&WGW&âÖF‚æÖ‚†Ö–âÂÖF‚æÖ–â†Ö‚ÂfÇVR’“²ĞĞ¢gVæ7F–öâ6ÆöæR‡fÇVR’²&WGW&âfÇVRÓÒçVÆÂòfÇVR¢¥4ôâç'6R„¥4ôâç7G&–æv–g’‡fÇVR’“²ĞĞ¢gVæ7F–öâFW‡B†–BÂfÇVR’²6öç7BæöFRÒFö7VÖVçBævWDVÆVÖVçD'”–B†–B“²–b†æöFR’æöFRçFW‡D6öçFVçBÒ7G&–ær‡fÇVRóòrr“²ĞĞ¢gVæ7F–öâ—5G—–ær‡F&vWB’²&WGW&âF&vWB–ç7Fæ6Vöb…DÔÄ–çWDVÆVÖVçBÇÂF&vWB–ç7Fæ6Vöb…DÔÅFW‡D&VVÆVÖVçBÇÂF&vWCòæ—46öçFVçDVF—F&ÆS²ĞĞ¢gVæ7F–öâW66T‡FÖÂ‡fÇVR’²&WGW&â7G&–ær‡fÇVRóòrr’ç&WÆ6R‚õ²cÃâr%ÒörÂ†6†"’Óâ‡²rbs¢rf×²rÂsÂs¢rfÇC²rÂsâs¢rfwC²rÂ"r#¢rb33“²rÂr"s¢rgV÷C²rÒ•¶6†%Ò“²ĞĞ¢gVæ7F–öâW66TGG"‡fÇVR’²&WGW&âW66T‡FÖÂ‡fÇVR’ç&WÆ6R‚öörÂrb3“c²r“²ĞĞ¢gVæ7F–öâ&WVW7D–B‚’²&WGW&âv–æF÷ræ7'—Fóòç&æFöÕUT”Còâ‚’ÇÂ¶VWÒG´FFRææ÷r‚—ÒÒG´ÖF‚ç&æFöÒ‚’çFõ7G&–ærƒb’ç6Æ–6Rƒ"—Ö²ĞĞ Ğ¢7–æ2gVæ7F–öâFövvÆTgVÆÇ67&VVâ‚’°Ğ¢G'’°Ğ¢–b‚Fö7VÖVçBægVÆÇ67&VVäVÆVÖVçB’v—BFö7VÖVçBæFö7VÖVçDVÆVÖVçBç&WVW7DgVÆÇ67&VVãòâ‚“°Ğ¢VÇ6Rv—BFö7VÖVçBæW†—DgVÆÇ67&VVãòâ‚“°Ğ¢Ò6F6‚†W'&÷"’°Ğ¢6öç6öÆRçv&â‚tgVÆÇ67&VVâVæf–Æ&ÆRrÂW'&÷"“°Ğ¢ĞĞ¢ĞĞ Ğ¢v–æF÷ræGfæ6UF–ÖRÒgVæ7F–öâ†×2’°Ğ¢7FFRæFV'VuF–ÖTöfg6WD×2³ÒÖF‚æÖ‚ƒÂçVÖ&W"†×2’“°Ğ¢–b‡7FFRçFW7DÖöFR’6ö×ÆWFTÖö6´6öç7G'V7F–öä–e&VG’‚“°Ğ¢WFFTÆ—fT6÷VçFW'2‚“°Ğ¢Ó°Ğ Ğ¢v–æF÷rç&VæFW%övÖU÷Fõ÷FW‡BÒgVæ7F–öâ‚’°Ğ¢6öç7B6æ6†÷BÒ7FFRç6æ6†÷C°Ğ¢–b‚6æ6†÷B’&WGW&â¥4ôâç7G&–æv–g’‡°Ğ¢ÖöFS¢v¶VWrÀĞ¢7FGW3¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚v¶VWvFRr“òæ6Æ74Æ—7Bæ6öçF–ç2‚v†–FFVâr’òvÆöF–ærr¢w6–vâÖ–â×&WV—&VBpĞ¢Ò“°Ğ¢&WGW&â¥4ôâç7G&–æv–g’‡°Ğ¢ÖöFS¢v¶VWrÀĞ¢6ö÷&F–æFU7—7FVÓ¢uF†R¶VW66VæRW6W2f–Ww÷'BW&6VçFvW3²÷&–v–â—2F÷ÖÆVgBÂ‚–æ7&V6W2&–v‡BÂ’–æ7&V6W2F÷vâârÀĞ¢6†FW#¢6æ6†÷Bæ6†FW"ÀĞ¢&W6÷W&6W3¢°Ğ¢F–Ö&W#¢çVÖ&W"‡6æ6†÷Bç&W6÷W&6W3òçF–Ö&W"’ÂF–Ö&W$66—G“¢çVÖ&W"‡6æ6†÷Bç&W6÷W&6W3òçF–Ö&W$66—G’’ÀĞ¢ÖFW&–Ç3¢‡6æ6†÷Bç&W6÷W&6W3òæÖFW&–Ç2ÇÂµÒ’æÖ‚†—FVÒ’Óâ‡²–C¢—FVÒæ–BÂÖ÷VçC¢çVÖ&W"†—FVÒæÖ÷VçB’Â66—G“¢çVÖ&W"†—FVÒæ66—G’’Ò’’ÀĞ¢6–VvV6ö–ç3¢çVÖ&W"‡6æ6†÷Bç&W6÷W&6W3òævöÆB’Â&VÖæçG3¢çVÖ&W"‡6æ6†÷Bç&W6÷W&6W3òç&VÖæçG2Ğ¢ÒÀĞ¢7FF–öã¢°Ğ¢–C¢wvööFÆ÷BrÂÆWfVÃ¢çVÖ&W"‡6æ6†÷Bç7FF–öãòæÆWfVÂ’Âf–Æ&ÆUF–Ö&W#¢&ö¦V7FVDf–Æ&ÆR‚’ÀĞ¢66—G“¢çVÖ&W"‡6æ6†÷Bç7FF–öãòç7F÷&vT66—G’’Â&FUW$Ö–çWFS¢çVÖ&W"‡6æ6†÷Bç7FF–öãòç&FUW$Ö–çWFR’ÀĞ¢–çf—FVE&W6–FVçC¢6æ6†÷Bç7FF–öãòç&W6–FVçCòææÖRÇÂçVÆÀĞ¢ÒÀĞ¢'V–ÆF–æw3¢‡6æ6†÷Bæ'V–ÆF–æw2ÇÂµÒ’æÖ‚†—FVÒ’Óâ‡²–C¢—FVÒæ–BÂÆWfVÃ¢—FVÒæÆWfVÂÂ7FGW3¢—FVÒç7FGW2Ò’’ÀĞ¢7FF–öç3¢‡6æ6†÷Bç7FF–öç2ÇÂµÒ’æÖ‚‡7FF–öâ’Óâ‡°Ğ¢–C¢7FF–öâæ–BÂÆWfVÃ¢çVÖ&W"‡7FF–öâæÆWfVÂ’Âf–Æ&ÆS¢&ö¦V7FVE7FF–öäf–Æ&ÆR‡7FF–öâ’ÀĞ¢66—G“¢çVÖ&W"‡7FF–öâç7F÷&vT66—G’’Â&FUW$Ö–çWFS¢çVÖ&W"‡7FF–öâç&FUW$Ö–çWFR’ÀĞ¢&W6–FVçC¢7FF–öâç&W6–FVçCòææÖRÇÂçVÆÂÂff–æ—F–W3¢7FF–öâæff–æ—F–W2ÇÂµĞĞ¢Ò’’ÀĞ¢¶VW&æ³¢6æ6†÷Bæ¶VW&æ²ÇÂçVÆÂÀĞ¢†ÆÅF†VÖS¢6æ6†÷Bçf—7VÅ7FFSòæ†ÆÅF†VÖRÇÂv6÷fVæçBrÀĞ¢ff÷&—FS¢6æ6†÷Bæff÷&—FRÇÂçVÆÂÀĞ¢vVV¶Ç”÷&FW#¢6æ6†÷BçvVV¶Ç”÷&FW"ÇÂçVÆÂÀĞ¢6öç7G'V7F–öå6Æ÷G3¢çVÖ&W"‡6æ6†÷Bæ6öç7G'V7F–öå6Æ÷G2’ÇÂÀĞ¢7F—fT6öç7G'V7F–öç3¢7F—fT6öç7G'V7F–öäÆ—7B‚’æÖ‚†—FVÒ’Óâ‡°Ğ¢–C¢—FVÒæ–BÂ&VÖ–æ–æu6V6öæG3¢6öç7G'V7F–öäVçG'•&VÖ–æ–ær†—FVÒĞ¢Ò’’ÀĞ¢66VæUf–Ws¢²¦ööÓ¢f–Wrç¦ööÒÂåƒ¢f–Wrçå‚Âå“¢f–Wrçå’ÒÀĞ¢7Fö6·–ÆUF–W'3¢‡6æ6†÷Bç7FF–öç2ÇÂ·6æ6†÷Bç7FF–öåÒ’æf–ÇFW"„&ööÆVâ’ç&VGV6R‚†÷WBÂ7FF–öâ’Óâ°Ğ¢÷WE·7FF–öâæ–EÒÒf–ÆÅF–W"‡7FF–öâ“°Ğ¢&WGW&â÷WC°Ğ¢ÒÂ·Ò’ÀĞ¢Ö–ÆW7FöæW3¢‡6æ6†÷BæÖ–ÆW7FöæW2ÇÂµÒ’æÖ‚†—FVÒ’Óâ‡²–C¢—FVÒæ–BÂ6ö×ÆWFS¢&ööÆVâ†—FVÒæ6ö×ÆWFR’Â6Æ–ÖVC¢&ööÆVâ†—FVÒæ6Æ–ÖVB’Â6ä6Æ–Ó¢&ööÆVâ†—FVÒæ6ä6Æ–Ò’Ò’’ÀĞ¢vVV¶Ç•G&–'WFS¢6æ6†÷BçvVV¶Ç•G&–'WFRÇÂçVÆÂÀĞ¢&V6—W3¢‡6æ6†÷Bç&V6—W2ÇÂµÒ’æÖ‚†—FVÒ’Óâ‡²–C¢—FVÒæ–BÂ&ööÔ–C¢—FVÒç&ööÔ–BÂG—S¢—FVÒçG—RÂ7&gFVC¢&ööÆVâ†—FVÒæ7&gFVB’Â6ä7&gC¢&ööÆVâ†—FVÒæ6ä7&gB’Ò’’ÀĞ¢&VÆF–öç6†—3¢‡6æ6†÷Bç&VÆF–öç6†—2ÇÂµÒ’æÖ‚†—FVÒ’Óâ‡°Ğ¢ç4–C¢—FVÒæç4–BÂç4æÖS¢—FVÒæç4æÖRÂ7FvS¢—FVÒç7FvRÀĞ¢G'W7C¢çVÖ&W"†—FVÒçG'W7B’ÂG'W7DÖƒ¢çVÖ&W"†—FVÒçG'W7DÖ‚’ÇÂpĞ¢Ò’’ÀĞ¢6VÆV7FVE&VÆF–öç6†—–C¢7FFRç6VÆV7FVE&VÆF–öç6†—–BÇÂçVÆÂÀĞ¢–çfVçF÷'”f–ÇFW#¢7FFRæ–çfVçF÷'”f–ÇFW"ÇÂtÄÂrÀĞ¢Æ6VDFV6÷&F–öç3¢6æ6†÷BçÆ6VDFV6÷&F–öç2ÇÂ·ÒÀ¢Væ6ÆfS¢6æ6†÷BæVæ6ÆfRò°¢'V–ÇC¢&ööÆVâ‡6æ6†÷BæVæ6ÆfRæ'V–ÇB’À¢&W6–FVçD6÷VçC¢çVÖ&W"‡6æ6†÷BæVæ6ÆfRç&W6–FVçD6÷VçB’À¢66—G“¢çVÖ&W"‡6æ6†÷BæVæ6ÆfRæ66—G’’À¢6Æ÷G3¢‡6æ6†÷BæVæ6ÆfRç6Æ÷G2ÇÂµÒ’æÖ‚‡6Æ÷B’Óâ‡°¢6Æ÷C¢çVÖ&W"‡6Æ÷Bç6Æ÷B’Â&W6–FVçC¢6Æ÷Bç&W6–FVçCòææÖRÇÂçVÆÂÀ¢Ö—76–öã¢6Æ÷BæÖ—76–öâò²–C¢6Æ÷BæÖ—76–öâæ–BÂ&öw&W73¢çVÖ&W"‡6Æ÷BæÖ—76–öâç&öw&W72’ÂvöÃ¢çVÖ&W"‡6Æ÷BæÖ—76–öâævöÂ’Â6ö×ÆWFS¢&ööÆVâ‡6Æ÷BæÖ—76–öâæ6ö×ÆWFR’Â6Æ–ÖVC¢&ööÆVâ‡6Æ÷BæÖ—76–öâæ6Æ–ÖVB’Ò¢çVÆÀ¢Ò’¢Ò¢çVÆÂÀ¢æ÷F–6T6VçFW#¢²Vç&VC¢7FFRææ÷F–6UVç&VBÂ6÷VçC¢7FFRææ÷F–6W2æÆVæwF‚Â÷Vã¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚væ÷F–6UG&’r“òæ6Æ74Æ—7Bæ6öçF–ç2‚v†–FFVâr’ÒÀ¢6öç7G'V7F–öã¢6æ6†÷Bæ7F—fT6öç7G'V7F–öâò²–C¢6æ6†÷Bæ7F—fT6öç7G'V7F–öâæ–BÂ&VÖ–æ–æu6V6öæG3¢6öç7G'V7F–öå&VÖ–æ–ær‚’Â&öw&W75W&6VçC¢6öç7G'V7F–öåW&6VçB‚’Â6öÆÆ6VC¢7FFRæ6öç7G'V7F–öä6öÆÆ6VBÒ¢çVÆÂÀĞ¢7F—fUæVÃ¢7FFRçæVÂÇÂçVÆÂÀĞ¢–çFW&–÷#¢7FFRæ–çFW&–÷"ÇÂçVÆÂÀĞ¢GWF÷&–Åf—6–&ÆS¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚v¶VWGWF÷&–Âr“òæ6Æ74Æ—7Bæ6öçF–ç2‚v†–FFVâr’ÀĞ¢öffÆ–æU&W÷'Ef—6–&ÆS¢7FFRæöffÆ–æUf—6–&ÆRÀĞ¢Vç&VDÆ÷&S¢çVÖ&W"‡6æ6†÷BçVç&VDÆ÷&T6÷VçB’ÀĞ¢F—66÷fW&–W3¢‡6æ6†÷BæÆ÷&RÇÂµÒ’æÖ‚†—FVÒ’Óâ‡²–C¢—FVÒæ–BÂG—S¢—FVÒçG—RÂF—FÆS¢—FVÒçF—FÆRÂ&VC¢&ööÆVâ†—FVÒç&VB’ÂF—7Æ–VC¢&ööÆVâ†—FVÒæF—7Æ–VB’Ò’’ÀĞ¢f–Æ&ÆT6öçfW'6F–öç3¢‡6æ6†÷Bæf–Æ&ÆT6öçfW'6F–öç2ÇÂµÒ’æÖ‚†—FVÒ’Óâ‡²–C¢—FVÒæ–BÂç3¢—FVÒæç4æÖRÒ’Ğ¢Ò“°Ğ¢Ó°Ğ§Ò’‚“°Ğ