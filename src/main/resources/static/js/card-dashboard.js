(function () {
    const EDITOR_TOKEN_KEY = "sieglingsCardEditorToken";
    const NOTCH_LAYOUT = [
        "TOP_LEFT", "TOP", "TOP_RIGHT",
        "LEFT", "CENTER", "RIGHT",
        "BOTTOM_LEFT", "BOTTOM", "BOTTOM_RIGHT"
    ];

    /** Must match server live-element roster order (see LiveElementCatalogService). */
    const DEFAULT_LIVE_ELEMENT_ORDER = [
        "FIRE", "EARTH", "WIND", "WATER", "ICE", "SHADOW", "ELECTRIC", "METAL", "UNDEAD", "PSYCHIC"
    ];

    function defaultLiveElements() {
        return DEFAULT_LIVE_ELEMENT_ORDER.map((element) => ({ element, active: true }));
    }

    function normalizeLiveElements(rows) {
        const map = new Map();
        (rows || []).forEach((row) => {
            const el = String(row?.element || "").trim().toUpperCase();
            if (DEFAULT_LIVE_ELEMENT_ORDER.includes(el)) {
                map.set(el, row?.active !== false);
            }
        });
        return DEFAULT_LIVE_ELEMENT_ORDER.map((element) => ({
            element,
            active: map.has(element) ? map.get(element) : true
        }));
    }

    const DEFAULT_STATUS = {
        message: "Loading the current override file...",
        tone: "warning"
    };

    const DEFAULT_AUTH = {
        available: false,
        bootstrappable: false,
        authenticated: false,
        canEdit: false,
        email: "",
        displayName: ""
    };

    const state = {
        metadata: null,
        cards: [],
        decks: [],
        packs: [],
        trainers: [],
        liveElements: defaultLiveElements(),
        selectedCardId: null,
        selectedDeckId: null,
        selectedTrainerId: null,
        selectedMoveId: null,
        movesPoolSearch: "",
        movesPoolFilterElement: "ALL",
        movesPoolFilterCategory: "ALL",
        movesPoolFilterActivation: "ALL",
        movesPoolFilterTarget: "ALL",
        movesPoolFilterEnergy: "99",
        movesPoolSort: "name-asc",
        movesPoolIsNewDraft: false,
        movesPoolFormEpoch: 0,
        movesPoolFormEpochApplied: -1,
        moveDraftEditingOriginalId: null,
        selectedAbilityIndex: 0,
        editorPage: "SIEGLING",
        actionTypeFilter: "ALL",
        search: "",
        elementFilter: "ALL",
        deckSearch: "",
        deckStatusFilter: "ALL",
        trainerSearch: "",
        trainerStatusFilter: "ALL",
        deckCatalogSearch: "",
        deckCatalogElementFilter: "ALL",
        deckCatalogTypeFilter: "ALL",
        dirty: false,
        previewMode: "card",
        validation: [],
        movesPool: [],
        movePickerSlot: 0,
        moveDraftSourceId: null,
        filePath: "",
        source: "Loading...",
        canSaveToProjectFile: false,
        liveEditingEnabled: false,
        firestoreAvailable: false,
        firestoreError: "",
        updatedBy: "",
        updatedAt: "",
        auth: { ...DEFAULT_AUTH },
        status: { ...DEFAULT_STATUS },
        ephemeralCardArtPreview: null
    };

    const refs = {};

    window.addEventListener("DOMContentLoaded", init);

    function init() {
        cacheRefs();
        bindEvents();
        renderAll();
        loadCurrentData();
    }

    function cacheRefs() {
        [
            "reloadCurrentBtn",
            "importFileInput",
            "saveProjectBtn",
            "downloadJsonBtn",
            "copyJsonBtn",
            "showSieglingsBtn",
            "showActionsBtn",
            "showTrainersBtn",
            "showDecksBtn",
            "showPacksBtn",
            "showLiveElementsBtn",
            "showMovesPoolBtn",
            "showLoadingArtBtn",
            "cardWorkspace",
            "movesPoolWorkspace",
            "loadingArtWorkspace",
            "deckWorkspace",
            "packWorkspace",
            "packList",
            "packsJsonPreview",
            "trainerWorkspace",
            "liveElementsWorkspace",
            "liveElementToggles",
            "liveElementValidationList",
            "liveElementsJsonPreview",
            "browserTitle",
            "newSieglingBtn",
            "newSpellBtn",
            "newTrapBtn",
            "duplicateCardBtn",
            "deleteCardBtn",
            "cardSearchInput",
            "elementFilterSelect",
            "actionTypeFilterSelect",
            "cardList",
            "cardEditorPanel",
            "authModePill",
            "authStatePill",
            "authSummaryText",
            "bootstrapForm",
            "bootstrapEmailInput",
            "bootstrapDisplayNameInput",
            "bootstrapPasswordInput",
            "bootstrapSubmitBtn",
            "loginForm",
            "loginEmailInput",
            "loginPasswordInput",
            "loginSubmitBtn",
            "authSessionPanel",
            "authSessionText",
            "logoutBtn",
            "dirtyPill",
            "cardCountPill",
            "statusMessage",
            "emptyEditorState",
            "cardEditorContent",
            "cardIdInput",
            "cardTypeSelect",
            "cardNameInput",
            "cardElementSelect",
            "cardRaritySelect",
            "sieglingStatsSection",
            "cardHealthInput",
            "cardSpeedInput",
            "cardPreferredRowSelect",
            "cardEvolvesFromInput",
            "cardCostElementSelect",
            "cardCostAmountInput",
            "actionCardSection",
            "actionCardSectionTitle",
            "actionCardHelpText",
            "spellCostElementField",
            "actionCostElementSelect",
            "spellCostAmountField",
            "actionCostAmountInput",
            "trapBucketElementField",
            "trapBucketElementSelect",
            "trapBucketAmountField",
            "trapBucketAmountInput",
            "spellRequiredReactionField",
            "cardRequiredReactionSelect",
            "spellRequiredComboSizeField",
            "cardRequiredComboSizeInput",
            "spellRequiredComboSignatureField",
            "cardRequiredComboSignatureInput",
            "notchesSection",
            "notchGrid",
            "activeNotchList",
            "addAbilityBtn",
            "duplicateAbilityBtn",
            "deleteAbilityBtn",
            "abilitySectionTitle",
            "abilityTabs",
            "abilityEditor",
            "abilityNameInput",
            "abilityPassiveSelect",
            "abilityDescriptionInput",
            "abilityTargetTypeSelect",
            "abilityTargetRowField",
            "abilityTargetRowSelect",
            "abilityEffectTypeSelect",
            "abilityEffectValueInput",
            "abilityRequiredElementField",
            "abilityRequiredElementSelect",
            "abilityRequiredEnergyField",
            "abilityRequiredEnergyInput",
            "abilityRequiredReactionField",
            "abilityRequiredReactionSelect",
            "abilityTargetHelper",
            "abilityEffectHelper",
            "sieglingMovesSection",
            "actionAbilitySection",
            "sieglingAssignedMoves",
            "newMoveBtn",
            "openMovePickerBtn",
            "moveDraftPanel",
            "moveDraftIdInput",
            "moveDraftNameInput",
            "moveDraftElementSelect",
            "moveDraftCategorySelect",
            "moveDraftTargetSelect",
            "moveDraftTargetElementWrap",
            "moveDraftTargetElementSelect",
            "moveDraftTargetRowWrap",
            "moveDraftTargetRowSelect",
            "moveDraftEffectSelect",
            "moveDraftEffectValueInput",
            "moveDraftEnergyInput",
            "moveDraftDescInput",
            "moveDraftPassiveSelect",
            "saveMoveDraftBtn",
            "cancelMoveDraftBtn",
            "moveDraftPanelHostSiegling",
            "moveDraftPanelHostPool",
            "movesPoolEditorPanel",
            "movesPoolEditorTitle",
            "emptyMovesPoolEditorState",
            "movesPoolEditorContent",
            "movesPoolUsedBy",
            "movesPoolList",
            "movesPoolSearchInput",
            "movesPoolElementFilter",
            "movesPoolCategoryFilter",
            "movesPoolActivationFilter",
            "movesPoolTargetFilter",
            "movesPoolEnergyFilter",
            "movesPoolSortSelect",
            "newPoolMoveBtn",
            "deletePoolMoveBtn",
            "movesPoolSummaryPanel",
            "movesPoolJsonPreview",
            "movesPoolValidationList",
            "movePickerOverlay",
            "movePickerSearch",
            "movePickerElementFilter",
            "movePickerEnergyFilter",
            "movePickerCategoryFilter",
            "movePickerList",
            "movePickerCloseBtn",
            "cardVisualStage",
            "cardArtControls",
            "cardArtFileInput",
            "cardArtUrlInput",
            "clearCardArtBtn",
            "cardArtTransformControls",
            "cardArtTransformHelp",
            "cardArtScaleInput",
            "cardArtScaleNumber",
            "cardArtRotationInput",
            "cardArtRotationNumber",
            "resetCardArtTransformBtn",
            "cardHolographicCheckbox",
            "cardSummary",
            "jsonPreviewMode",
            "jsonPreview",
            "validationList",
            "cardIdOptions",
            "deckList",
            "newDeckBtn",
            "duplicateDeckBtn",
            "deleteDeckBtn",
            "deckSearchInput",
            "deckStatusFilterSelect",
            "emptyDeckState",
            "deckEditorContent",
            "deckIdInput",
            "deckNameInput",
            "deckDescriptionInput",
            "deckTrainerSelect",
            "deckActiveCheckbox",
            "deckSummaryChips",
            "deckSummaryHelp",
            "clearDeckCardsBtn",
            "deckCompositionList",
            "deckCatalogSearchInput",
            "deckCatalogElementFilterSelect",
            "deckCatalogTypeFilterSelect",
            "deckCatalogList",
            "deckSummaryPanel",
            "deckJsonPreview",
            "deckValidationList",
            "trainerList",
            "newTrainerBtn",
            "duplicateTrainerBtn",
            "trainerSearchInput",
            "trainerStatusFilterSelect",
            "emptyTrainerState",
            "trainerEditorContent",
            "trainerIdInput",
            "trainerTierInput",
            "trainerNameInput",
            "trainerElementSelect",
            "trainerRaritySelect",
            "trainerActiveCheckbox",
            "trainerOncePerGameCheckbox",
            "trainerHolographicCheckbox",
            "trainerArtStage",
            "trainerArtMeta",
            "trainerArtStatus",
            "trainerArtControls",
            "trainerArtFileInput",
            "trainerArtUrlInput",
            "clearTrainerArtBtn",
            "trainerArtTransformControls",
            "trainerArtScaleInput",
            "trainerArtScaleNumber",
            "trainerArtRotationInput",
            "trainerArtRotationNumber",
            "resetTrainerArtTransformBtn",
            "trainerPassiveNameInput",
            "trainerPassiveDescriptionInput",
            "trainerPassiveTargetTypeSelect",
            "trainerPassiveTargetRowField",
            "trainerPassiveTargetRowSelect",
            "trainerPassiveEffectTypeSelect",
            "trainerPassiveEffectValueInput",
            "trainerPassiveRequiredElementSelect",
            "trainerPassiveRequiredEnergyInput",
            "trainerPassiveRequiredReactionSelect",
            "trainerPassiveTargetHelper",
            "trainerPassiveEffectHelper",
            "trainerActiveNameInput",
            "trainerActiveDescriptionInput",
            "trainerActiveTargetTypeSelect",
            "trainerActiveTargetRowField",
            "trainerActiveTargetRowSelect",
            "trainerActiveEffectTypeSelect",
            "trainerActiveEffectValueInput",
            "trainerActiveRequiredElementSelect",
            "trainerActiveRequiredEnergyInput",
            "trainerActiveRequiredReactionSelect",
            "trainerActiveTargetHelper",
            "trainerActiveEffectHelper",
            "trainerSummaryPanel",
            "trainerJsonPreview",
            "trainerValidationList"
        ].forEach((id) => {
            refs[id] = document.getElementById(id);
        });
    }

    function bindEvents() {
        refs.reloadCurrentBtn.addEventListener("click", loadCurrentData);
        refs.importFileInput.addEventListener("change", importJsonFile);
        refs.saveProjectBtn.addEventListener("click", saveToProjectFile);
        refs.downloadJsonBtn.addEventListener("click", downloadJson);
        refs.copyJsonBtn.addEventListener("click", copyJson);
        refs.bootstrapForm.addEventListener("submit", submitBootstrap);
        refs.loginForm.addEventListener("submit", submitLogin);
        refs.logoutBtn.addEventListener("click", logoutEditor);
        refs.showSieglingsBtn.addEventListener("click", () => setEditorPage("SIEGLING"));
        refs.showActionsBtn.addEventListener("click", () => setEditorPage("ACTION"));
        refs.showTrainersBtn.addEventListener("click", () => setEditorPage("TRAINERS"));
        refs.showDecksBtn.addEventListener("click", () => setEditorPage("DECKS"));
        refs.showPacksBtn.addEventListener("click", () => setEditorPage("PACKS"));
        refs.showLiveElementsBtn.addEventListener("click", () => setEditorPage("LIVE_ELEMENTS"));
        refs.showMovesPoolBtn.addEventListener("click", () => setEditorPage("MOVES_POOL"));
        refs.showLoadingArtBtn.addEventListener("click", () => setEditorPage("LOADING_ART"));
        refs.liveElementsWorkspace.addEventListener("change", (event) => {
            const input = event.target.closest("input[data-live-element-index]");
            if (!input || input.type !== "checkbox") {
                return;
            }
            const index = Number(input.dataset.liveElementIndex);
            if (!Number.isFinite(index) || !state.liveElements[index]) {
                return;
            }
            state.liveElements[index].active = input.checked;
            state.dirty = true;
            state.validation = validateDashboard();
            setStatus("You have unsaved changes in the dashboard.", "warning");
            renderLiveElementsPanel();
            renderValidation();
            renderButtons();
        });
        refs.newSieglingBtn.addEventListener("click", () => createCard("SIEGLING"));
        refs.newSpellBtn.addEventListener("click", () => createCard("SPELL"));
        refs.newTrapBtn.addEventListener("click", () => createCard("TRAP"));
        refs.duplicateCardBtn.addEventListener("click", duplicateCard);
        refs.deleteCardBtn.addEventListener("click", deleteCard);
        refs.cardSearchInput.addEventListener("input", (event) => {
            state.search = event.target.value || "";
            renderCardList();
        });
        refs.elementFilterSelect.addEventListener("change", (event) => {
            state.elementFilter = event.target.value || "ALL";
            renderCardList();
        });
        refs.actionTypeFilterSelect.addEventListener("change", (event) => {
            state.actionTypeFilter = event.target.value || "ALL";
            syncSelectionToEditorPage();
            renderAll();
        });
        refs.jsonPreviewMode.addEventListener("change", (event) => {
            state.previewMode = event.target.value || "card";
            renderPreview();
        });

        refs.cardList.addEventListener("click", (event) => {
            const row = event.target.closest("[data-card-id]");
            if (!row) {
                return;
            }
            const nextCardId = row.dataset.cardId;
            if (nextCardId !== state.selectedCardId) {
                clearEphemeralCardArtPreview();
            }
            state.selectedCardId = nextCardId;
            state.selectedAbilityIndex = 0;
            renderAll();
        });

        refs.cardArtControls?.addEventListener("change", (event) => {
            const modeInput = event.target.closest('input[name="cardArtMode"]');
            if (!modeInput) {
                return;
            }
            mutateSelectedCard((card) => {
                card.cardArtMode = normalizeCardArtMode(modeInput.value);
                if (!card.cardArtMode) {
                    clearEphemeralCardArtPreview();
                    card.cardArtUrl = "";
                }
            });
        });

        refs.cardArtUrlInput?.addEventListener("input", (event) => {
            mutateSelectedCard((card) => {
                card.cardArtUrl = String(event.target.value || "").trim();
                if (card.cardArtUrl && !card.cardArtMode) {
                    card.cardArtMode = "REPLACE";
                }
                if (!card.cardArtUrl) {
                    card.cardArtMode = "";
                }
            });
        });

        refs.cardHolographicCheckbox?.addEventListener("change", (event) => {
            const card = getSelectedCard();
            if (!card) {
                return;
            }
            card.holographic = Boolean(event.target.checked);
            renderCardVisualPreview();
            renderPreview();
            queueValidation();
        });

        refs.cardArtFileInput?.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                return;
            }
            const card = getSelectedCard();
            const cardId = String(card?.id || "").trim();
            if (!cardId) {
                setStatus("Set a card id before uploading art.", "error");
                event.target.value = "";
                return;
            }
            if (state.liveEditingEnabled && !state.auth?.canEdit) {
                setStatus("Sign in under Live Publishing before uploading card art.", "error");
                event.target.value = "";
                renderStatus();
                return;
            }

            const localPreviewUrl = URL.createObjectURL(file);
            setEphemeralCardArtPreview(cardId, localPreviewUrl);
            mutateSelectedCard((selected) => {
                if (!selected.cardArtMode) {
                    selected.cardArtMode = "REPLACE";
                }
            }, { render: false });

            setStatus("Uploading card art...", "warning");
            renderStatus();
            renderCardVisual();
            try {
                const payload = await uploadCardArtFile(cardId, file);
                const hostedUrl = String(payload?.url || "").trim();
                if (!hostedUrl) {
                    throw new Error("Upload finished but the server did not return an image URL.");
                }
                clearEphemeralCardArtPreview();
                mutateCardById(cardId, (selected) => {
                    selected.cardArtUrl = hostedUrl;
                    selected.cardArtMode = normalizeCardArtMode(selected.cardArtMode) || "REPLACE";
                }, { render: false });
                setStatus(
                    state.liveEditingEnabled
                        ? `Uploaded art for ${cardId}. Adjust scale/placement below, then click Publish Live Changes.`
                        : `Uploaded art for ${cardId}. Adjust scale/placement below, then click Save To Project File.`,
                    "success"
                );
                refs.cardArtTransformControls?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            } catch (error) {
                setStatus(
                    `${error?.message || "Unable to upload card art."} Your local preview is still visible; fix the issue above and try Upload Image again.`,
                    "error"
                );
            } finally {
                event.target.value = "";
                renderAll();
            }
        });

        refs.clearCardArtBtn?.addEventListener("click", () => {
            clearEphemeralCardArtPreview();
            mutateSelectedCard((card) => {
                card.cardArtUrl = "";
                card.cardArtMode = "";
                resetCardArtTransform(card);
            });
            if (refs.cardArtFileInput) {
                refs.cardArtFileInput.value = "";
            }
        });

        refs.cardArtScaleInput?.addEventListener("input", (event) => {
            updateSelectedCardArtTransform((card) => {
                card.cardArtScale = clampCardArtScale(event.target.value);
            });
        });

        refs.cardArtRotationInput?.addEventListener("input", (event) => {
            updateSelectedCardArtTransform((card) => {
                card.cardArtRotation = clampCardArtRotation(event.target.value);
            });
        });

        refs.cardArtScaleNumber?.addEventListener("input", (event) => {
            updateSelectedCardArtTransform((card) => {
                card.cardArtScale = clampCardArtScale(event.target.value);
            });
        });

        refs.cardArtScaleNumber?.addEventListener("change", (event) => {
            event.target.value = formatCardArtScaleValue(event.target.value);
        });

        refs.cardArtRotationNumber?.addEventListener("input", (event) => {
            updateSelectedCardArtTransform((card) => {
                card.cardArtRotation = clampCardArtRotation(event.target.value);
            });
        });

        refs.cardArtRotationNumber?.addEventListener("change", (event) => {
            event.target.value = String(Math.round(clampCardArtRotation(event.target.value)));
        });

        refs.resetCardArtTransformBtn?.addEventListener("click", () => {
            updateSelectedCardArtTransform((card) => {
                resetCardArtTransform(card);
            });
        });

        refs.notchGrid.addEventListener("click", (event) => {
            const button = event.target.closest("[data-notch-direction]");
            if (!button) {
                return;
            }
            const direction = button.dataset.notchDirection;
            if (!direction) {
                return;
            }
            mutateSelectedCard((card) => toggleNotch(card, direction));
        });

        refs.activeNotchList.addEventListener("change", (event) => {
            const select = event.target.closest("[data-notch-index]");
            if (!select) {
                return;
            }
            const notchIndex = Number(select.dataset.notchIndex);
            mutateSelectedCard((card) => {
                if (!card.notches[notchIndex]) {
                    return;
                }
                card.notches[notchIndex].element = select.value;
            });
        });

        refs.activeNotchList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-remove-notch-index]");
            if (!button) {
                return;
            }
            const notchIndex = Number(button.dataset.removeNotchIndex);
            mutateSelectedCard((card) => {
                card.notches.splice(notchIndex, 1);
            });
        });

        refs.addAbilityBtn.addEventListener("click", addAbility);
        refs.duplicateAbilityBtn.addEventListener("click", duplicateAbility);
        refs.deleteAbilityBtn.addEventListener("click", deleteAbility);

        refs.newMoveBtn?.addEventListener("click", startNewMoveDraft);
        refs.openMovePickerBtn?.addEventListener("click", () => openMovePickerModal(-1));
        refs.saveMoveDraftBtn?.addEventListener("click", saveMoveDraftToPool);
        refs.cancelMoveDraftBtn?.addEventListener("click", onCancelMoveDraft);
        refs.newPoolMoveBtn?.addEventListener("click", startNewPoolMoveDraft);
        refs.deletePoolMoveBtn?.addEventListener("click", deleteSelectedPoolMove);
        refs.movesPoolList?.addEventListener("click", onMovesPoolListClick);
        refs.movesPoolSearchInput?.addEventListener("input", (event) => {
            state.movesPoolSearch = event.target.value || "";
            renderMovesPoolBrowser();
        });
        refs.movesPoolElementFilter?.addEventListener("change", (event) => {
            state.movesPoolFilterElement = event.target.value || "ALL";
            renderMovesPoolBrowser();
        });
        refs.movesPoolCategoryFilter?.addEventListener("change", (event) => {
            state.movesPoolFilterCategory = event.target.value || "ALL";
            renderMovesPoolBrowser();
        });
        refs.movesPoolActivationFilter?.addEventListener("change", (event) => {
            state.movesPoolFilterActivation = event.target.value || "ALL";
            renderMovesPoolBrowser();
        });
        refs.movesPoolTargetFilter?.addEventListener("change", (event) => {
            state.movesPoolFilterTarget = event.target.value || "ALL";
            renderMovesPoolBrowser();
        });
        refs.movesPoolEnergyFilter?.addEventListener("change", (event) => {
            state.movesPoolFilterEnergy = event.target.value || "99";
            renderMovesPoolBrowser();
        });
        refs.movesPoolSortSelect?.addEventListener("change", (event) => {
            state.movesPoolSort = event.target.value || "name-asc";
            renderMovesPoolBrowser();
        });
        refs.moveDraftElementSelect?.addEventListener("change", () => {
            if (state.editorPage === "MOVES_POOL") {
                applyMovesPoolEditorPanelTheme();
            }
        });
        refs.movePickerCloseBtn?.addEventListener("click", closeMovePickerModal);
        refs.movePickerOverlay?.addEventListener("click", closeMovePickerModal);
        refs.movePickerSearch?.addEventListener("input", renderMovePickerList);
        refs.movePickerElementFilter?.addEventListener("change", renderMovePickerList);
        refs.movePickerEnergyFilter?.addEventListener("change", renderMovePickerList);
        refs.movePickerCategoryFilter?.addEventListener("change", renderMovePickerList);
        refs.movePickerList?.addEventListener("click", onMovePickerListClick);
        refs.sieglingAssignedMoves?.addEventListener("click", onSieglingAssignedMovesClick);
        refs.moveDraftTargetSelect?.addEventListener("change", () => {
            syncMoveDraftTargetRowUi();
            syncMoveDraftTargetElementUi();
            syncMoveDraftAutoDescription();
            renderMoveDraftLivePanels();
        });
        refs.moveDraftTargetElementSelect?.addEventListener("change", () => {
            syncMoveDraftAutoDescription();
            renderMoveDraftLivePanels();
        });
        refs.moveDraftTargetRowSelect?.addEventListener("change", () => {
            syncMoveDraftAutoDescription();
            renderMoveDraftLivePanels();
        });
        refs.moveDraftEffectSelect?.addEventListener("change", () => {
            syncMoveDraftAutoDescription();
            renderMoveDraftLivePanels();
        });
        refs.moveDraftEffectValueInput?.addEventListener("input", () => {
            syncMoveDraftAutoDescription();
            renderMoveDraftLivePanels();
        });
        refs.moveDraftEnergyInput?.addEventListener("input", () => {
            syncMoveDraftAutoDescription();
            renderMoveDraftLivePanels();
        });
        refs.moveDraftDescInput?.addEventListener("input", renderMoveDraftLivePanels);
        refs.moveDraftPassiveSelect?.addEventListener("change", onMoveDraftPassiveChange);
        refs.moveDraftNameInput?.addEventListener("input", onMoveDraftNameInput);
        refs.moveDraftIdInput?.addEventListener("input", onMoveDraftIdInput);

        refs.abilityTabs.addEventListener("click", (event) => {
            const tab = event.target.closest("[data-ability-index]");
            if (!tab) {
                return;
            }
            state.selectedAbilityIndex = Number(tab.dataset.abilityIndex) || 0;
            renderEditor();
            renderSummary();
            renderPreview();
            renderButtons();
        });

        bindCardFieldEvents();
        bindAbilityFieldEvents();
        bindDeckFieldEvents();
        bindTrainerFieldEvents();
    }

    function bindCardFieldEvents() {
        refs.cardIdInput.addEventListener("input", (event) => updateSelectedCardField("id", event.target.value));
        refs.cardTypeSelect.addEventListener("change", (event) => changeSelectedCardType(event.target.value));
        refs.cardNameInput.addEventListener("input", (event) => onCardNameChanged(event.target.value));
        refs.cardElementSelect.addEventListener("change", (event) => {
            mutateSelectedCard((card) => {
                card.element = event.target.value;
                card.notches.forEach((notch) => {
                    if (!notch.element) {
                        notch.element = card.element;
                    }
                });
                if (!card.costElement && card.cardType !== "TRAP") {
                    card.costElement = card.element;
                }
                if (!card.trapBucketElement && card.cardType === "TRAP") {
                    card.trapBucketElement = card.element;
                }
            });
        });
        refs.cardRaritySelect.addEventListener("change", (event) => updateSelectedCardField("rarity", event.target.value));
        refs.cardHealthInput.addEventListener("input", (event) => updateSelectedCardField("health", toNumber(event.target.value, 0)));
        refs.cardSpeedInput.addEventListener("input", (event) => updateSelectedCardField("speed", toNumber(event.target.value, 0)));
        refs.cardPreferredRowSelect.addEventListener("change", (event) => updateSelectedCardField("preferredRow", event.target.value));
        refs.cardEvolvesFromInput.addEventListener("input", (event) => updateSelectedCardField("evolvesFromId", event.target.value));
        refs.cardCostElementSelect.addEventListener("change", (event) => updateSelectedCardField("costElement", event.target.value));
        refs.cardCostAmountInput.addEventListener("input", (event) => updateSelectedCardField("costAmount", toNumber(event.target.value, 0)));
        refs.actionCostElementSelect.addEventListener("change", (event) => updateSelectedCardField("costElement", event.target.value));
        refs.actionCostAmountInput.addEventListener("input", (event) => updateSelectedCardField("costAmount", toNumber(event.target.value, 0)));
        refs.trapBucketElementSelect.addEventListener("change", (event) => updateSelectedCardField("trapBucketElement", event.target.value));
        refs.trapBucketAmountInput.addEventListener("input", (event) => updateSelectedCardField("trapBucketAmount", toNumber(event.target.value, 0)));
        refs.cardRequiredReactionSelect.addEventListener("change", (event) => updateSelectedCardField("requiredReaction", event.target.value));
        refs.cardRequiredComboSizeInput.addEventListener("input", (event) => updateSelectedCardField("requiredComboSize", toNumber(event.target.value, 0)));
        refs.cardRequiredComboSignatureInput.addEventListener("input", (event) => updateSelectedCardField("requiredComboSignature", event.target.value));
    }

    function bindAbilityFieldEvents() {
        refs.abilityNameInput.addEventListener("input", (event) => updateSelectedAbilityField("name", event.target.value));
        refs.abilityPassiveSelect.addEventListener("change", (event) => updateSelectedAbilityField("passive", event.target.value === "true"));
        refs.abilityDescriptionInput.addEventListener("input", (event) => updateSelectedAbilityField("description", event.target.value));
        refs.abilityTargetTypeSelect.addEventListener("change", (event) => {
            mutateSelectedAbility((ability) => {
                ability.targetType = event.target.value;
                applyTargetRule(ability);
            });
        });
        refs.abilityTargetRowSelect.addEventListener("change", (event) => updateSelectedAbilityField("targetRow", event.target.value));
        refs.abilityEffectTypeSelect.addEventListener("change", (event) => updateSelectedAbilityField("effectType", event.target.value));
        refs.abilityEffectValueInput.addEventListener("input", (event) => updateSelectedAbilityField("effectValue", toNumber(event.target.value, 0)));
        refs.abilityRequiredElementSelect.addEventListener("change", (event) => updateSelectedAbilityField("requiredElement", event.target.value));
        refs.abilityRequiredEnergyInput.addEventListener("input", (event) => updateSelectedAbilityField("requiredEnergy", toNumber(event.target.value, 0)));
        refs.abilityRequiredReactionSelect.addEventListener("change", (event) => updateSelectedAbilityField("requiredReaction", event.target.value));
    }

    function bindDeckFieldEvents() {
        refs.newDeckBtn.addEventListener("click", createDeck);
        refs.duplicateDeckBtn.addEventListener("click", duplicateDeck);
        refs.deleteDeckBtn.addEventListener("click", deleteDeck);
        refs.deckSearchInput.addEventListener("input", (event) => {
            state.deckSearch = event.target.value || "";
            renderDeckList();
        });
        refs.deckStatusFilterSelect.addEventListener("change", (event) => {
            state.deckStatusFilter = event.target.value || "ALL";
            renderDeckList();
        });
        refs.deckList.addEventListener("click", (event) => {
            const row = event.target.closest("[data-deck-id]");
            if (!row) {
                return;
            }
            state.selectedDeckId = row.dataset.deckId;
            renderAll();
        });
        refs.deckIdInput.addEventListener("input", (event) => updateSelectedDeckField("id", slugify(event.target.value)));
        refs.deckNameInput.addEventListener("input", (event) => updateSelectedDeckField("name", event.target.value));
        refs.deckDescriptionInput.addEventListener("input", (event) => updateSelectedDeckField("description", event.target.value));
        refs.deckTrainerSelect.addEventListener("change", (event) => updateSelectedDeckField("recommendedTrainerId", event.target.value));
        refs.deckActiveCheckbox.addEventListener("change", (event) => updateSelectedDeckField("active", Boolean(event.target.checked)));
        refs.clearDeckCardsBtn.addEventListener("click", () => {
            mutateSelectedDeck((deck) => {
                deck.cardIds = [];
            });
        });
        refs.deckCompositionList.addEventListener("click", (event) => {
            const addButton = event.target.closest("[data-add-deck-card-id]");
            if (addButton) {
                addCardToSelectedDeck(addButton.dataset.addDeckCardId);
                return;
            }
            const removeButton = event.target.closest("[data-remove-deck-card-id]");
            if (removeButton) {
                removeCardFromSelectedDeck(removeButton.dataset.removeDeckCardId);
                return;
            }
        });
        refs.deckCatalogSearchInput.addEventListener("input", (event) => {
            state.deckCatalogSearch = event.target.value || "";
            renderDeckCatalog();
        });
        refs.deckCatalogElementFilterSelect.addEventListener("change", (event) => {
            state.deckCatalogElementFilter = event.target.value || "ALL";
            renderDeckCatalog();
        });
        refs.deckCatalogTypeFilterSelect.addEventListener("change", (event) => {
            state.deckCatalogTypeFilter = event.target.value || "ALL";
            renderDeckCatalog();
        });
        refs.deckCatalogList.addEventListener("click", (event) => {
            const addButton = event.target.closest("[data-add-catalog-card-id]");
            if (!addButton) {
                return;
            }
            addCardToSelectedDeck(addButton.dataset.addCatalogCardId);
        });
    }

    function bindTrainerFieldEvents() {
        refs.newTrainerBtn.addEventListener("click", createTrainer);
        refs.duplicateTrainerBtn.addEventListener("click", duplicateTrainer);
        refs.trainerSearchInput.addEventListener("input", (event) => {
            state.trainerSearch = event.target.value || "";
            renderTrainerList();
        });
        refs.trainerStatusFilterSelect.addEventListener("change", (event) => {
            state.trainerStatusFilter = event.target.value || "ALL";
            renderTrainerList();
        });
        refs.trainerList.addEventListener("click", (event) => {
            const row = event.target.closest("[data-trainer-id]");
            if (!row) {
                return;
            }
            state.selectedTrainerId = row.dataset.trainerId;
            renderAll();
        });
        refs.trainerIdInput.addEventListener("input", (event) => updateSelectedTrainerField("id", slugify(event.target.value)));
        refs.trainerTierInput.addEventListener("input", (event) => updateSelectedTrainerField("tier", event.target.value));
        refs.trainerNameInput.addEventListener("input", (event) => updateSelectedTrainerField("name", event.target.value));
        refs.trainerElementSelect.addEventListener("change", (event) => {
            mutateSelectedTrainer((trainer) => {
                trainer.element = event.target.value;
                if (trainer.passiveAbility?.requiredEnergy > 0 && !trainer.passiveAbility.requiredElement) {
                    trainer.passiveAbility.requiredElement = trainer.element;
                }
                if (trainer.activeAbility?.requiredEnergy > 0 && !trainer.activeAbility.requiredElement) {
                    trainer.activeAbility.requiredElement = trainer.element;
                }
            });
        });
        refs.trainerRaritySelect.addEventListener("change", (event) => updateSelectedTrainerField("rarity", event.target.value));
        refs.trainerActiveCheckbox.addEventListener("change", (event) => updateSelectedTrainerField("active", Boolean(event.target.checked)));
        refs.trainerOncePerGameCheckbox.addEventListener("change", (event) => updateSelectedTrainerField("oncePerGame", Boolean(event.target.checked)));
        refs.trainerHolographicCheckbox?.addEventListener("change", (event) => updateSelectedTrainerField("holographic", Boolean(event.target.checked)));
        bindTrainerArtFieldEvents();

        bindTrainerAbilityFieldEvents("passive", {
            nameInput: refs.trainerPassiveNameInput,
            descriptionInput: refs.trainerPassiveDescriptionInput,
            targetTypeSelect: refs.trainerPassiveTargetTypeSelect,
            targetRowSelect: refs.trainerPassiveTargetRowSelect,
            effectTypeSelect: refs.trainerPassiveEffectTypeSelect,
            effectValueInput: refs.trainerPassiveEffectValueInput,
            requiredElementSelect: refs.trainerPassiveRequiredElementSelect,
            requiredEnergyInput: refs.trainerPassiveRequiredEnergyInput,
            requiredReactionSelect: refs.trainerPassiveRequiredReactionSelect
        });
        bindTrainerAbilityFieldEvents("active", {
            nameInput: refs.trainerActiveNameInput,
            descriptionInput: refs.trainerActiveDescriptionInput,
            targetTypeSelect: refs.trainerActiveTargetTypeSelect,
            targetRowSelect: refs.trainerActiveTargetRowSelect,
            effectTypeSelect: refs.trainerActiveEffectTypeSelect,
            effectValueInput: refs.trainerActiveEffectValueInput,
            requiredElementSelect: refs.trainerActiveRequiredElementSelect,
            requiredEnergyInput: refs.trainerActiveRequiredEnergyInput,
            requiredReactionSelect: refs.trainerActiveRequiredReactionSelect
        });
    }

    function bindTrainerAbilityFieldEvents(kind, refsForAbility) {
        refsForAbility.nameInput.addEventListener("input", (event) => updateSelectedTrainerAbilityField(kind, "name", event.target.value));
        refsForAbility.descriptionInput.addEventListener("input", (event) => updateSelectedTrainerAbilityField(kind, "description", event.target.value));
        refsForAbility.targetTypeSelect.addEventListener("change", (event) => {
            mutateSelectedTrainerAbility(kind, (ability) => {
                ability.targetType = event.target.value;
                applyTargetRule(ability);
            });
        });
        refsForAbility.targetRowSelect.addEventListener("change", (event) => updateSelectedTrainerAbilityField(kind, "targetRow", event.target.value));
        refsForAbility.effectTypeSelect.addEventListener("change", (event) => updateSelectedTrainerAbilityField(kind, "effectType", event.target.value));
        refsForAbility.effectValueInput.addEventListener("input", (event) => updateSelectedTrainerAbilityField(kind, "effectValue", toNumber(event.target.value, 0)));
        refsForAbility.requiredElementSelect.addEventListener("change", (event) => updateSelectedTrainerAbilityField(kind, "requiredElement", event.target.value));
        refsForAbility.requiredEnergyInput.addEventListener("input", (event) => updateSelectedTrainerAbilityField(kind, "requiredEnergy", toNumber(event.target.value, 0)));
        refsForAbility.requiredReactionSelect.addEventListener("change", (event) => updateSelectedTrainerAbilityField(kind, "requiredReaction", event.target.value));
    }

    async function loadCurrentData() {
        setStatus("Loading the current override file...", "warning");
        try {
            const payload = await requestJson(apiUrl("/api/cards/editor"), { method: "GET" });
            if (!payload || payload.error) {
                throw new Error(payload?.error || "Unable to load the current override data.");
            }
            applyServerPayload(payload);
            applyDataSet(payload.data, false);
            setStatus(buildLoadedMessage(), "success");
            renderAll();
        } catch (error) {
            setStatus(error.message || "Unable to load the current override file.", "error");
            renderAll();
        }
    }

    function importJsonFile(event) {
        const [file] = event.target.files || [];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                const importSummary = applyDataSet(parsed, true);
                const conversionNote = importSummary.convertedLegacyMoves > 0
                    ? ` and converted ${importSummary.convertedLegacyMoves} legacy Siegeling ${importSummary.convertedLegacyMoves === 1 ? "ability" : "abilities"} into shared abilities`
                    : "";
                setStatus(`Imported ${file.name}${conversionNote}. Review and save when ready.`, "warning");
                renderAll();
            } catch (error) {
                setStatus("That file could not be parsed as card override JSON.", "error");
                renderStatus();
            } finally {
                refs.importFileInput.value = "";
            }
        };
        reader.readAsText(file);
    }

    async function saveToProjectFile() {
        const errors = state.validation.filter((issue) => issue.severity === "error");
        const alerts = state.validation.filter((issue) => issue.severity === "warn");
        const verb = state.liveEditingEnabled ? "publish live changes" : "save to the project file";

        if (!state.liveEditingEnabled && errors.length > 0) {
            setStatus(`Fix validation errors before you ${verb}.`, "error");
            renderStatus();
            renderValidation();
            return;
        }

        const blockers = state.liveEditingEnabled
            ? state.validation.filter((issue) => issue.severity === "error" || issue.severity === "warn")
            : alerts;
        if (blockers.length > 0) {
            const summary = blockers
                .slice(0, 5)
                .map((issue) => `- [${issue.severity}] ${issue.message}`)
                .join("\n");
            const extra = blockers.length > 5 ? `\n- ...and ${blockers.length - 5} more` : "";
            const firstPrompt = `There are ${blockers.length} validation issue(s). Do you want to ${verb} anyway?\n\n${summary}${extra}`;
            if (!window.confirm(firstPrompt)) {
                setStatus(`Cancelled — review the ${blockers.length} validation issue(s) and try again.`, "warning");
                renderStatus();
                renderValidation();
                return;
            }
            const typed = window.prompt(`Type PUBLISH to ${verb}. This will proceed even with validation issues.`);
            if (String(typed || "").trim().toUpperCase() !== "PUBLISH") {
                setStatus(`Cancelled — no changes were ${state.liveEditingEnabled ? "published" : "saved"}.`, "warning");
                renderStatus();
                return;
            }
        }

        if (!canSaveCurrentData()) {
            setStatus(saveUnavailableMessage(), "error");
            renderStatus();
            return;
        }

        setStatus(state.liveEditingEnabled ? "Publishing live changes..." : "Saving changes...", "warning");
        renderStatus();
        try {
            const payload = await requestJson(apiUrl("/api/cards/editor"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildExportData())
            });
            if (!payload || payload.error) {
                throw new Error(payload?.error || "Unable to save the override file.");
            }
            applyServerPayload(payload);
            applyDataSet(payload.data, false);
            if (typeof SieglingsCatalogSync !== "undefined") {
                SieglingsCatalogSync.notifyCatalogPublished(payload.catalogVersion);
            }
            setStatus(
                state.liveEditingEnabled
                    ? "Published the live card, Siegeknight, premade deck, live element roster, and shared abilities to Firestore."
                    : "Saved the card, Siegeknight, premade deck, live element, and shared ability JSON back to the project files.",
                "success"
            );
            renderAll();
        } catch (error) {
            const message = error?.message || "Unable to save the override file.";
            setStatus(message, "error");
            if (state.liveEditingEnabled) {
                try {
                    window.alert(message);
                } catch (ignored) {
                    // Ignore alert failures and fall back to inline status.
                }
            }
            renderAll();
        }
    }

    async function submitBootstrap(event) {
        event.preventDefault();
        try {
            const payload = await requestJson(apiUrl("/api/cards/editor/auth/bootstrap"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: refs.bootstrapEmailInput.value,
                    displayName: refs.bootstrapDisplayNameInput.value,
                    password: refs.bootstrapPasswordInput.value
                })
            });
            applyAuthPayload(payload);
            refs.bootstrapPasswordInput.value = "";
            setStatus("Created the dashboard admin account and signed in.", "success");
            await loadCurrentData();
        } catch (error) {
            setStatus(error.message || "Unable to create the dashboard admin account.", "error");
            renderAll();
        }
    }

    async function submitLogin(event) {
        event.preventDefault();
        try {
            const payload = await requestJson(apiUrl("/api/cards/editor/auth/login"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: refs.loginEmailInput.value,
                    password: refs.loginPasswordInput.value
                })
            });
            applyAuthPayload(payload);
            refs.loginPasswordInput.value = "";
            setStatus("Signed in to the live card editor.", "success");
            await loadCurrentData();
        } catch (error) {
            setStatus(error.message || "Unable to sign in to the live card editor.", "error");
            renderAll();
        }
    }

    async function logoutEditor() {
        try {
            await requestJson(apiUrl("/api/cards/editor/auth/logout"), { method: "POST" });
        } catch (error) {
            setStatus(error.message || "Unable to sign out of the live card editor.", "error");
            renderAll();
            return;
        }
        clearEditorToken();
        state.auth = { ...DEFAULT_AUTH, available: state.firestoreAvailable };
        setStatus("Signed out of the live card editor.", "success");
        await loadCurrentData();
    }

    function downloadJson() {
        const json = JSON.stringify(buildExportData(), null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "sieglings-dashboard-export.json";
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus("Downloaded the current dashboard data as JSON.", "success");
        renderStatus();
    }

    async function copyJson() {
        const json = JSON.stringify(buildExportData(), null, 2);
        try {
            await navigator.clipboard.writeText(json);
            setStatus("Copied the current JSON export to the clipboard.", "success");
        } catch (error) {
            setStatus("Clipboard copy failed. Use the download button instead.", "error");
        }
        renderStatus();
    }

    function createCard(cardType) {
        const card = createBlankCard(cardType);
        state.cards.unshift(card);
        state.selectedCardId = card.id;
        state.selectedAbilityIndex = 0;
        state.editorPage = pageForCardType(card.cardType);
        if (card.cardType !== "SIEGLING") {
            state.actionTypeFilter = card.cardType;
        }
        state.dirty = true;
        setStatus(`Created a new ${formatEnumLabel(card.cardType).toLowerCase()} draft.`, "warning");
        renderAll();
    }

    function duplicateCard() {
        const card = getSelectedCard();
        if (!card) {
            return;
        }
        const copy = normalizeCard({
            ...buildExportCard(card),
            id: createUniqueCardId(`${card.id || "card"}-copy`),
            name: `${card.name || "Unnamed"} Copy`
        });
        state.cards.unshift(copy);
        state.selectedCardId = copy.id;
        state.selectedAbilityIndex = 0;
        state.editorPage = pageForCardType(copy.cardType);
        if (copy.cardType !== "SIEGLING") {
            state.actionTypeFilter = copy.cardType;
        }
        state.dirty = true;
        setStatus(`Duplicated ${card.name || card.id || "the card"}.`, "warning");
        renderAll();
    }

    function deleteCard() {
        const card = getSelectedCard();
        if (!card) {
            return;
        }
        const label = card.name || card.id || "this card";
        if (!window.confirm(`Delete ${label}?`)) {
            return;
        }
        const index = state.cards.findIndex((entry) => entry.id === card.id);
        state.cards.splice(index, 1);
        state.selectedCardId = state.cards[Math.max(0, index - 1)]?.id || state.cards[0]?.id || null;
        state.selectedAbilityIndex = 0;
        state.dirty = true;
        syncSelectionToEditorPage();
        setStatus(`Deleted ${label}.`, "warning");
        renderAll();
    }

    function addAbility() {
        mutateSelectedCard((card) => {
            if (card.cardType !== "SIEGLING") {
                return;
            }
            card.abilities.push(createBlankAbility(card.element));
            state.selectedAbilityIndex = card.abilities.length - 1;
        });
    }

    function duplicateAbility() {
        const card = getSelectedCard();
        const ability = getSelectedAbility();
        if (!card || !ability) {
            return;
        }
        mutateSelectedCard((selectedCard) => {
            if (selectedCard.cardType !== "SIEGLING") {
                return;
            }
            const copy = normalizeAbility({
                ...buildExportAbility(ability),
                name: `${ability.name || "Ability"} Copy`
            }, selectedCard.element);
            selectedCard.abilities.splice(state.selectedAbilityIndex + 1, 0, copy);
            state.selectedAbilityIndex += 1;
        });
    }

    function deleteAbility() {
        const card = getSelectedCard();
        if (!card || card.abilities.length <= 1) {
            setStatus("Each card needs at least one ability.", "warning");
            renderStatus();
            return;
        }
        const ability = getSelectedAbility();
        const label = ability?.name || `Ability ${state.selectedAbilityIndex + 1}`;
        if (!window.confirm(`Delete ${label}?`)) {
            return;
        }
        mutateSelectedCard((selectedCard) => {
            selectedCard.abilities.splice(state.selectedAbilityIndex, 1);
            state.selectedAbilityIndex = Math.max(0, Math.min(state.selectedAbilityIndex, selectedCard.abilities.length - 1));
        });
    }

    function updateSelectedCardField(field, value) {
        mutateSelectedCard((card) => {
            card[field] = typeof value === "string" ? value : value ?? "";
            if (field === "requiredReaction") {
                card.requiredReaction = value || "";
            }
            if (field === "requiredComboSignature") {
                card.requiredComboSignature = String(value || "").trim().toUpperCase();
            }
        });
    }

    function onCardNameChanged(nextName) {
        const card = getSelectedCard();
        if (!card) {
            return;
        }
        const previousAutoId = refs.cardIdInput.dataset.autoId || "";
        const previousAbilityAutoName = refs.abilityNameInput.dataset.autoName || "";
        const idIsAuto = (card.id || "") === previousAutoId;
        mutateSelectedCard((c) => {
            c.name = nextName;
            if (idIsAuto) {
                const nextId = computeAutoCardId(c, nextName);
                if (nextId && nextId !== c.id) {
                    migrateCardIdReferences(c.id, nextId);
                    c.id = nextId;
                }
            }
            if (c.cardType !== "SIEGLING" && Array.isArray(c.abilities) && c.abilities[0]) {
                const ability = c.abilities[0];
                if ((ability.name || "") === previousAbilityAutoName) {
                    ability.name = nextName;
                }
            }
        });
    }

    function computeAutoCardId(card, name) {
        const slugBase = slugify(name) || "card";
        let candidate = slugBase;
        let counter = 2;
        const otherIds = new Set(state.cards.filter((other) => other !== card).map((other) => other.id));
        while (otherIds.has(candidate)) {
            candidate = `${slugBase}-${counter}`;
            counter += 1;
        }
        return candidate;
    }

    function migrateCardIdReferences(oldId, newId) {
        const o = String(oldId || "").trim();
        const n = String(newId || "").trim();
        if (!o || !n || o === n) {
            return;
        }
        if (state.selectedCardId === o) {
            state.selectedCardId = n;
        }
        state.cards.forEach((card) => {
            if (card.evolvesFromId && card.evolvesFromId.trim() === o) {
                card.evolvesFromId = n;
            }
        });
        state.decks.forEach((deck) => {
            if (Array.isArray(deck.cardIds)) {
                deck.cardIds = deck.cardIds.map((id) => (String(id || "").trim() === o ? n : id));
            }
        });
    }

    function changeSelectedCardType(nextType) {
        const normalizedType = normalizeCardType(nextType);
        mutateSelectedCard((card) => {
            const converted = normalizeCard({
                ...buildExportCard(card),
                type: normalizedType
            });
            Object.keys(card).forEach((key) => delete card[key]);
            Object.assign(card, converted);
            state.selectedAbilityIndex = 0;
            state.editorPage = pageForCardType(normalizedType);
            if (normalizedType !== "SIEGLING") {
                state.actionTypeFilter = normalizedType;
            }
        });
    }

    function updateSelectedAbilityField(field, value) {
        mutateSelectedAbility((ability) => {
            ability[field] = typeof value === "string" ? value : value ?? "";
            if (field === "requiredElement" || field === "requiredReaction") {
                ability[field] = value || "";
            }
        });
    }

    function mutateSelectedCard(mutator, options = {}) {
        const card = getSelectedCard();
        if (!card) {
            return;
        }
        mutator(card);
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        if (options.render !== false) {
            renderAll();
        }
    }

    function mutateCardById(cardId, mutator, options = {}) {
        const card = findCardById(cardId);
        if (!card) {
            return;
        }
        mutator(card);
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        if (options.render !== false) {
            renderAll();
        }
    }

    function updateSelectedCardArtTransform(mutator) {
        const card = getSelectedCard();
        if (!card) {
            return;
        }
        mutator(card);
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        applyCardArtTransformToPreview(card);
        syncCardArtTransformControls(card);
        renderPreview();
        renderValidation();
        renderChrome();
        renderStatus();
    }

    function clearEphemeralCardArtPreview() {
        if (state.ephemeralCardArtPreview?.url) {
            URL.revokeObjectURL(state.ephemeralCardArtPreview.url);
        }
        state.ephemeralCardArtPreview = null;
    }

    function setEphemeralCardArtPreview(cardId, url) {
        clearEphemeralCardArtPreview();
        state.ephemeralCardArtPreview = {
            cardId: String(cardId || "").trim(),
            url
        };
    }

    function getEphemeralCardArtPreviewUrl(cardId) {
        const preview = state.ephemeralCardArtPreview;
        if (!preview?.url) {
            return "";
        }
        if (preview.cardId !== String(cardId || "").trim()) {
            return "";
        }
        return preview.url;
    }

    function mutateSelectedAbility(mutator) {
        const ability = getSelectedAbility();
        if (!ability) {
            return;
        }
        mutator(ability);
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        renderAll();
    }

    function mutateSelectedDeck(mutator) {
        const deck = getSelectedDeck();
        if (!deck) {
            return;
        }
        mutator(deck);
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        renderAll();
    }

    function updateSelectedTrainerField(field, value) {
        mutateSelectedTrainer((trainer) => {
            trainer[field] = typeof value === "string" ? value : value ?? "";
        });
    }

    function updateSelectedTrainerAbilityField(kind, field, value) {
        mutateSelectedTrainerAbility(kind, (ability) => {
            ability[field] = typeof value === "string" ? value : value ?? "";
            if (field === "requiredElement" || field === "requiredReaction") {
                ability[field] = value || "";
            }
        });
    }

    function mutateSelectedTrainer(mutator) {
        const trainer = getSelectedTrainer();
        if (!trainer) {
            return;
        }
        mutator(trainer);
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        renderAll();
    }

    function mutateTrainerById(trainerId, mutator, options = {}) {
        const trainer = findTrainerById(trainerId);
        if (!trainer) {
            return;
        }
        mutator(trainer);
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        if (options.render !== false) {
            renderAll();
        }
    }

    function mutateSelectedTrainerAbility(kind, mutator) {
        const ability = getSelectedTrainerAbility(kind);
        if (!ability) {
            return;
        }
        mutator(ability);
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("You have unsaved changes in the dashboard.", "warning");
        renderAll();
    }

    function applyDataSet(data, dirty) {
        if (!dirty) {
            clearEphemeralCardArtPreview();
        }
        const preparedData = prepareImportedDataSet(data);
        const resolvedData = preparedData.data;
        const cards = Array.isArray(resolvedData?.cards)
            ? resolvedData.cards.map((card) => normalizeCard(card))
            : state.cards.map((card) => normalizeCard(buildExportCard(card)));
        const decks = Array.isArray(resolvedData?.decks)
            ? resolvedData.decks.map((deck) => normalizeDeck(deck))
            : state.decks.map((deck) => normalizeDeck(buildExportDeck(deck)));
        const trainers = Array.isArray(resolvedData?.trainers)
            ? resolvedData.trainers.map((trainer) => normalizeTrainer(trainer))
            : state.trainers.map((trainer) => normalizeTrainer(buildExportTrainer(trainer)));
        const packs = Array.isArray(resolvedData?.packs)
            ? resolvedData.packs.map((pack) => ({ ...pack }))
            : state.packs.map((pack) => ({ ...pack }));
        let liveElements;
        if (Array.isArray(resolvedData?.liveElements?.elements)) {
            liveElements = normalizeLiveElements(resolvedData.liveElements.elements);
        } else if (resolvedData && (Array.isArray(resolvedData.cards) || Array.isArray(resolvedData.decks) || Array.isArray(resolvedData.trainers))) {
            liveElements = defaultLiveElements();
        } else {
            liveElements = state.liveElements.length
                ? state.liveElements.map((row) => ({ element: row.element, active: row.active !== false }))
                : defaultLiveElements();
        }
        state.cards = cards;
        state.decks = decks;
        state.packs = packs;
        state.trainers = trainers;
        state.liveElements = liveElements;
        if (resolvedData && Object.prototype.hasOwnProperty.call(resolvedData, "moves")) {
            state.movesPool = Array.isArray(resolvedData.moves)
                ? resolvedData.moves.map((m) => normalizeMoveFromServer(m)).filter((m) => m && m.id)
                : [];
        }
        state.selectedCardId = cards.find((card) => card.id === state.selectedCardId)?.id || cards[0]?.id || null;
        state.selectedDeckId = decks.find((deck) => deck.id === state.selectedDeckId)?.id || decks[0]?.id || null;
        state.selectedTrainerId = trainers.find((trainer) => trainer.id === state.selectedTrainerId)?.id || trainers[0]?.id || null;
        state.selectedAbilityIndex = 0;
        state.dirty = dirty;
        state.validation = validateDashboard();
        syncSelectionToEditorPage();
        if (state.editorPage === "MOVES_POOL") {
            state.movesPoolFormEpoch += 1;
        }
        return preparedData;
    }

    function prepareImportedDataSet(data) {
        if (!data || typeof data !== "object" || !Array.isArray(data.cards)) {
            return { data, convertedLegacyMoves: 0 };
        }
        const explicitMoves = Array.isArray(data.moves) ? data.moves : null;
        const usedMoveIds = new Set((explicitMoves || [])
            .map((move) => String(move?.id || "").trim())
            .filter(Boolean));
        const generatedMoves = [];
        let convertedLegacyMoves = 0;
        let touchedLegacySiegling = false;

        const cards = data.cards.map((card) => {
            const cardType = normalizeCardType(card?.type || card?.cardType || inferCardType(card));
            if (cardType !== "SIEGLING") {
                return card;
            }
            const existingMoveIds = Array.isArray(card?.moveIds)
                ? card.moveIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 5)
                : [];
            if (existingMoveIds.length > 0) {
                return { ...card, moveIds: existingMoveIds };
            }
            const legacyAbilities = legacySieglingAbilities(card);
            if (!legacyAbilities.length) {
                return card;
            }
            touchedLegacySiegling = true;
            const element = String(card?.element || firstMetaValue("elements", "FIRE")).trim() || firstMetaValue("elements", "FIRE");
            const moveIds = legacyAbilities.slice(0, 5).map((ability, index) => {
                const move = buildLegacyImportedMove(card, ability, element, index, usedMoveIds);
                if (!move) {
                    return null;
                }
                generatedMoves.push(buildExportMove(move));
                convertedLegacyMoves += 1;
                return move.id;
            }).filter(Boolean);
            return { ...card, moveIds };
        });

        if (!touchedLegacySiegling) {
            return { data, convertedLegacyMoves: 0 };
        }

        return {
            data: {
                ...data,
                cards,
                moves: [...(explicitMoves || []), ...generatedMoves]
            },
            convertedLegacyMoves
        };
    }

    function legacySieglingAbilities(card) {
        if (Array.isArray(card?.abilities) && card.abilities.length > 0) {
            return card.abilities;
        }
        return card?.ability ? [card.ability] : [];
    }

    function buildLegacyImportedMove(card, ability, element, index, usedMoveIds) {
        const normalizedAbility = normalizeAbility(ability, element);
        const baseId = [
            String(card?.id || "").trim() || String(card?.name || "").trim() || "imported-siegling",
            normalizedAbility.name || `move-${index + 1}`
        ].join("-");
        const moveId = createImportedMoveId(baseId, usedMoveIds);
        const move = normalizeMoveFromServer({
            id: moveId,
            name: normalizedAbility.name || `${String(card?.name || "Imported Siegeling").trim()} Move ${index + 1}`,
            element,
            category: normalizedAbility.passive ? "UTILITY" : "STANDARD",
            targetType: normalizedAbility.targetType,
            targetElement: null,
            targetRow: normalizedAbility.targetRow || null,
            targetCount: normalizedAbility.targetCount,
            effectType: normalizedAbility.effectType,
            effectValue: normalizedAbility.effectValue,
            energyCost: normalizedAbility.requiredEnergy,
            description: normalizedAbility.description,
            isPassive: normalizedAbility.passive,
            requiredElement: normalizedAbility.requiredElement || null,
            requiredReaction: normalizedAbility.requiredReaction || null
        });
        if (!move) {
            return null;
        }
        usedMoveIds.add(move.id);
        return move;
    }

    function createImportedMoveId(baseId, usedMoveIds) {
        const seed = slugify(baseId) || "imported-move";
        let candidate = seed;
        let suffix = 2;
        while (usedMoveIds.has(candidate)) {
            candidate = `${seed}-${suffix}`;
            suffix += 1;
        }
        return candidate;
    }

    function normalizeCardArtMode(value) {
        const mode = String(value || "").trim().toUpperCase();
        return mode === "REPLACE" || mode === "OVERLAY" || mode === "FULL_CARD" ? mode : "";
    }

    function defaultCardArtPath(cardId) {
        const normalizedId = slugify(cardId);
        return normalizedId ? `/assets/cards/${normalizedId}.png` : "";
    }

    function isHostedCardArtUrl(cardArtUrl) {
        const url = String(cardArtUrl || "").trim();
        return /^https?:\/\//i.test(url);
    }

    function isProjectRelativeCardArtPath(cardArtUrl) {
        const url = String(cardArtUrl || "").trim();
        return url.startsWith("/assets/cards/") && !isHostedCardArtUrl(url);
    }

    function cardArtPathMatchesCardId(cardId, cardArtUrl) {
        const normalizedId = slugify(cardId);
        const url = String(cardArtUrl || "").trim().toLowerCase();
        if (!normalizedId || !url) {
            return true;
        }
        if (url.startsWith("data:") || /^https?:\/\//i.test(url)) {
            return true;
        }
        return url.includes(normalizedId);
    }

    function clampCardArtScale(value) {
        const scale = Number(value);
        if (!Number.isFinite(scale)) {
            return 1;
        }
        return Math.min(3, Math.max(0.25, scale));
    }

    function clampCardArtRotation(value) {
        const rotation = Number(value);
        if (!Number.isFinite(rotation)) {
            return 0;
        }
        return Math.min(180, Math.max(-180, rotation));
    }

    function normalizeCardArtTransformFields(card) {
        return {
            cardArtOffsetX: toNumber(card?.cardArtOffsetX, 0),
            cardArtOffsetY: toNumber(card?.cardArtOffsetY, 0),
            cardArtScale: clampCardArtScale(card?.cardArtScale ?? 1),
            cardArtRotation: clampCardArtRotation(card?.cardArtRotation ?? 0)
        };
    }

    function resetCardArtTransform(card) {
        card.cardArtOffsetX = 0;
        card.cardArtOffsetY = 0;
        card.cardArtScale = 1;
        card.cardArtRotation = 0;
    }

    function hasCustomCardArt(card) {
        const { cardArtUrl, cardArtMode } = normalizeCardArtFields(card);
        return Boolean(cardArtUrl && cardArtMode);
    }

    function hasTransformableCardArt(card) {
        const { cardArtUrl, cardArtMode } = normalizeCardArtFields(card);
        return Boolean(cardArtUrl && (cardArtMode === "REPLACE" || cardArtMode === "OVERLAY"));
    }

    function formatCardArtScaleValue(scale) {
        return clampCardArtScale(scale).toFixed(2);
    }

    function buildCardArtTransformStyle(card) {
        return window.SieglingsCardBinderVisual?.buildArtTransformStyle(card) || "";
    }

    function getCardArtDragTargets(card) {
        const mode = normalizeCardArtMode(card?.cardArtMode);
        const previewCard = refs.cardVisualStage?.querySelector(".binder-card");
        if (!previewCard) {
            return { artFrame: null, artImg: null };
        }
        if (mode === "OVERLAY") {
            return {
                artFrame: previewCard,
                artImg: previewCard.querySelector(".binder-card-overlay-art-card")
            };
        }
        const artFrame = previewCard.querySelector(".binder-card-art");
        return {
            artFrame,
            artImg: artFrame?.querySelector(".binder-card-custom-art") || null
        };
    }

    function applyCardArtTransformToPreview(card) {
        const { artImg } = getCardArtDragTargets(card);
        if (!artImg) {
            return;
        }
        const style = buildCardArtTransformStyle(card);
        if (style) {
            artImg.setAttribute("style", style);
        } else {
            artImg.removeAttribute("style");
        }
    }

    let cardArtDragAbortController = null;

    function teardownCardArtDragInteraction() {
        cardArtDragAbortController?.abort();
        cardArtDragAbortController = null;
    }

    function setupCardArtDragInteraction(card) {
        teardownCardArtDragInteraction();
        if (!hasCustomCardArt(card)) {
            return;
        }

        const { artFrame, artImg } = getCardArtDragTargets(card);
        if (!artFrame || !artImg) {
            return;
        }

        cardArtDragAbortController = new AbortController();
        const { signal } = cardArtDragAbortController;
        let dragState = null;

        const finishDrag = (event) => {
            if (!dragState) {
                return;
            }
            artFrame.classList.remove("is-art-dragging");
            if (artImg.hasPointerCapture?.(event.pointerId)) {
                artImg.releasePointerCapture(event.pointerId);
            }
            const nextX = dragState.startOffsetX + (event.clientX - dragState.startClientX);
            const nextY = dragState.startOffsetY + (event.clientY - dragState.startClientY);
            dragState = null;
            mutateSelectedCard((selectedCard) => {
                selectedCard.cardArtOffsetX = nextX;
                selectedCard.cardArtOffsetY = nextY;
            });
        };

        artImg.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            dragState = {
                startClientX: event.clientX,
                startClientY: event.clientY,
                startOffsetX: toNumber(card.cardArtOffsetX, 0),
                startOffsetY: toNumber(card.cardArtOffsetY, 0)
            };
            artFrame.classList.add("is-art-dragging");
            artImg.setPointerCapture?.(event.pointerId);
        }, { signal });

        artImg.addEventListener("pointermove", (event) => {
            if (!dragState) {
                return;
            }
            event.preventDefault();
            const previewCard = {
                ...card,
                cardArtOffsetX: dragState.startOffsetX + (event.clientX - dragState.startClientX),
                cardArtOffsetY: dragState.startOffsetY + (event.clientY - dragState.startClientY)
            };
            applyCardArtTransformToPreview(previewCard);
        }, { signal });

        artImg.addEventListener("pointerup", finishDrag, { signal });
        artImg.addEventListener("pointercancel", finishDrag, { signal });
    }

    function syncCardArtTransformControls(card) {
        const showTransform = hasTransformableCardArt(card);
        refs.cardArtTransformControls?.classList.toggle("hidden", !showTransform);
        if (!showTransform) {
            return;
        }

        const scale = clampCardArtScale(card?.cardArtScale ?? 1);
        const rotation = clampCardArtRotation(card?.cardArtRotation ?? 0);
        if (refs.cardArtScaleInput && document.activeElement !== refs.cardArtScaleInput) {
            refs.cardArtScaleInput.value = String(scale);
        }
        if (refs.cardArtRotationInput && document.activeElement !== refs.cardArtRotationInput) {
            refs.cardArtRotationInput.value = String(rotation);
        }
        if (refs.cardArtScaleNumber && document.activeElement !== refs.cardArtScaleNumber) {
            refs.cardArtScaleNumber.value = formatCardArtScaleValue(scale);
        }
        if (refs.cardArtRotationNumber && document.activeElement !== refs.cardArtRotationNumber) {
            refs.cardArtRotationNumber.value = String(Math.round(rotation));
        }
        if (refs.cardArtTransformHelp) {
            const mode = normalizeCardArtMode(card?.cardArtMode);
            refs.cardArtTransformHelp.textContent = mode === "OVERLAY"
                ? "Drag overlay art anywhere on the card. Scale and rotate freely; it can extend past the icon frame."
                : "Drag replace art within the icon frame. The full image stays visible while editing; scale and move it behind the frame border.";
        }
    }

    function normalizeCardArtFields(card) {
        const cardArtUrl = String(card?.cardArtUrl || "").trim();
        let cardArtMode = normalizeCardArtMode(card?.cardArtMode);
        if (cardArtUrl && !cardArtMode) {
            cardArtMode = "REPLACE";
        }
        return {
            cardArtUrl,
            cardArtMode,
            holographic: card?.holographic === true,
            ...normalizeCardArtTransformFields(card)
        };
    }

    function appendCardArtExport(exported, card) {
        const url = String(card?.cardArtUrl || "").trim();
        if (url) {
            exported.cardArtUrl = url;
            exported.cardArtMode = normalizeCardArtMode(card?.cardArtMode) || "REPLACE";
            const offsetX = toNumber(card.cardArtOffsetX, 0);
            const offsetY = toNumber(card.cardArtOffsetY, 0);
            const scale = clampCardArtScale(card.cardArtScale ?? 1);
            const rotation = clampCardArtRotation(card.cardArtRotation ?? 0);
            if (offsetX !== 0) {
                exported.cardArtOffsetX = offsetX;
            }
            if (offsetY !== 0) {
                exported.cardArtOffsetY = offsetY;
            }
            if (scale !== 1) {
                exported.cardArtScale = scale;
            }
            if (rotation !== 0) {
                exported.cardArtRotation = rotation;
            }
        }
        if (card?.holographic === true) {
            exported.holographic = true;
        }
        return exported;
    }

    function normalizeCard(card) {
        const cardType = normalizeCardType(card?.type || card?.cardType || inferCardType(card));
        const baseElement = card?.element || firstMetaValue("elements", "FIRE");
        if (cardType === "SIEGLING") {
            let moveIds = Array.isArray(card?.moveIds)
                ? card.moveIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 5)
                : [];
            if (!moveIds.length && Array.isArray(card?.abilities) && card.abilities.length > 0) {
                moveIds = [];
            }
            return {
                cardType,
                id: String(card?.id || ""),
                name: String(card?.name || ""),
                element: baseElement,
                rarity: card?.rarity || firstMetaValue("rarities", "COMMON"),
                health: toNumber(card?.health, 10),
                speed: toNumber(card?.speed, 5),
                preferredRow: card?.preferredRow || firstMetaValue("rows", "FRONT"),
                evolvesFromId: String(card?.evolvesFromId || ""),
                costElement: card?.costElement || "",
                costAmount: toNumber(card?.costAmount, 0),
                trapBucketElement: card?.trapBucketElement || card?.costElement || "",
                trapBucketAmount: toNumber(card?.trapBucketAmount ?? card?.costAmount, 0),
                requiredReaction: String(card?.requiredReaction || ""),
                requiredComboSize: toNumber(card?.requiredComboSize, 0),
                requiredComboSignature: String(card?.requiredComboSignature || "").trim().toUpperCase(),
                notches: Array.isArray(card?.notches) ? card.notches.map((notch) => normalizeNotch(notch, baseElement)) : [],
                moveIds,
                abilities: [],
                ...normalizeCardArtFields(card)
            };
        }
        const abilities = Array.isArray(card?.abilities) && card.abilities.length > 0
            ? card.abilities.map((ability) => normalizeAbility(ability, baseElement))
            : (card?.ability ? [normalizeAbility(card.ability, baseElement)] : [createBlankAbility(baseElement)]);
        return {
            cardType,
            id: String(card?.id || ""),
            name: String(card?.name || ""),
            element: baseElement,
            rarity: card?.rarity || firstMetaValue("rarities", "COMMON"),
            health: toNumber(card?.health, 10),
            speed: toNumber(card?.speed, 5),
            preferredRow: card?.preferredRow || firstMetaValue("rows", "FRONT"),
            evolvesFromId: String(card?.evolvesFromId || ""),
            costElement: card?.costElement || "",
            costAmount: toNumber(card?.costAmount, 0),
            trapBucketElement: card?.trapBucketElement || card?.costElement || "",
            trapBucketAmount: toNumber(card?.trapBucketAmount ?? card?.costAmount, 0),
            requiredReaction: String(card?.requiredReaction || ""),
            requiredComboSize: toNumber(card?.requiredComboSize, 0),
            requiredComboSignature: String(card?.requiredComboSignature || "").trim().toUpperCase(),
            notches: Array.isArray(card?.notches) ? card.notches.map((notch) => normalizeNotch(notch, baseElement)) : [],
            abilities: normalizeCardAbilities(cardType, abilities, baseElement),
            ...normalizeCardArtFields(card)
        };
    }

    function normalizeCardAbilities(cardType, abilities, baseElement) {
        const safeAbilities = Array.isArray(abilities) && abilities.length > 0 ? abilities : [createBlankAbility(baseElement)];
        if (cardType === "SIEGLING") {
            return safeAbilities;
        }
        return [safeAbilities[0] || createBlankAbility(baseElement)];
    }

    function normalizeDeck(deck) {
        return {
            id: String(deck?.id || ""),
            name: String(deck?.name || ""),
            description: String(deck?.description || ""),
            elements: Array.isArray(deck?.elements) ? deck.elements.filter(Boolean) : [],
            recommendedTrainerId: String(deck?.recommendedTrainerId || ""),
            active: deck?.active !== false,
            cardIds: Array.isArray(deck?.cardIds) ? deck.cardIds.map((cardId) => String(cardId || "").trim()).filter(Boolean) : [],
            usesGeneratedPreset: Boolean(deck?.usesGeneratedPreset)
        };
    }

    function normalizeTrainer(trainer) {
        const element = trainer?.element || firstMetaValue("elements", "FIRE");
        const passiveAbility = normalizeAbility(trainer?.passiveAbility || createBlankTrainerPassiveAbility(element), element);
        const activeAbility = normalizeAbility(trainer?.activeAbility || createBlankTrainerActiveAbility(element), element);
        passiveAbility.passive = true;
        activeAbility.passive = false;
        return {
            id: String(trainer?.id || ""),
            name: String(trainer?.name || ""),
            element,
            rarity: trainer?.rarity || firstMetaValue("rarities", "RARE"),
            tier: String(trainer?.tier || "SiegeKnight"),
            active: trainer?.active !== false,
            oncePerGame: Boolean(trainer?.oncePerGame),
            passiveAbility,
            activeAbility,
            ...normalizeCardArtFields(trainer)
        };
    }

    function normalizeAbility(ability, fallbackElement) {
        const normalized = {
            name: String(ability?.name || ""),
            description: String(ability?.description || ""),
            targetType: ability?.targetType || firstMetaValue("targetTypes", "SINGLE_ENEMY"),
            targetRow: ability?.targetRow || "",
            targetCount: toNumber(ability?.targetCount, 0),
            effectType: ability?.effectType || firstEffectKey(),
            effectValue: toNumber(ability?.effectValue, 0),
            passive: Boolean(ability?.passive),
            requiredElement: ability?.requiredElement || "",
            requiredEnergy: toNumber(ability?.requiredEnergy, 0),
            requiredReaction: ability?.requiredReaction || ""
        };
        if (!normalized.requiredElement && normalized.requiredEnergy > 0) {
            normalized.requiredElement = fallbackElement || "";
        }
        applyTargetRule(normalized);
        return normalized;
    }

    function normalizeNotch(notch, fallbackElement) {
        return {
            direction: notch?.direction || "TOP",
            element: notch?.element || fallbackElement || firstMetaValue("elements", "FIRE")
        };
    }

    function createBlankCard(cardType = defaultNewCardType()) {
        switch (normalizeCardType(cardType)) {
            case "SPELL":
                return createBlankSpellCard();
            case "TRAP":
                return createBlankTrapCard();
            default:
                return createBlankSieglingCard();
        }
    }

    function createBlankSieglingCard() {
        const element = firstMetaValue("elements", "FIRE");
        return normalizeCard({
            type: "SIEGLING",
            id: createUniqueCardId("new-siegling"),
            name: "New Siegeling",
            element,
            rarity: firstMetaValue("rarities", "COMMON"),
            health: 10,
            speed: 5,
            preferredRow: firstMetaValue("rows", "FRONT"),
            costElement: element,
            costAmount: 0,
            notches: [{ direction: "TOP", element }],
            moveIds: []
        });
    }

    function createBlankSpellCard() {
        const element = firstMetaValue("elements", "FIRE");
        const name = "New Strategy";
        return normalizeCard({
            type: "SPELL",
            id: createUniqueCardId("new-spell"),
            name,
            element,
            rarity: firstMetaValue("rarities", "COMMON"),
            costElement: element,
            costAmount: 0,
            requiredReaction: "",
            requiredComboSize: 0,
            requiredComboSignature: "",
            ability: createBlankAbility(element, name)
        });
    }

    function createBlankTrapCard() {
        const element = firstMetaValue("elements", "FIRE");
        const name = "New Deception";
        return normalizeCard({
            type: "TRAP",
            id: createUniqueCardId("new-trap"),
            name,
            element,
            rarity: firstMetaValue("rarities", "UNCOMMON"),
            trapBucketElement: element,
            trapBucketAmount: 3,
            ability: createBlankAbility(element, name)
        });
    }

    function createBlankAbility(element, name) {
        return normalizeAbility({
            name: name || "New Ability",
            description: "",
            targetType: "SINGLE_ENEMY",
            effectType: firstEffectKey(),
            effectValue: 0,
            passive: false,
            requiredElement: "",
            requiredEnergy: 0,
            requiredReaction: ""
        }, element);
    }

    function createBlankDeck() {
        return normalizeDeck({
            id: createUniqueDeckId("new-deck"),
            name: "New Premade Deck",
            description: "",
            elements: [],
            recommendedTrainerId: state.trainers.find((trainer) => trainer.active)?.id || state.trainers[0]?.id || "",
            active: false,
            cardIds: []
        });
    }

    function createBlankTrainer() {
        const element = firstMetaValue("elements", "FIRE");
        return normalizeTrainer({
            id: createUniqueTrainerId("new-siegeknight"),
            name: "New Siegeknight",
            element,
            rarity: firstMetaValue("rarities", "RARE"),
            tier: "SiegeKnight",
            active: false,
            oncePerGame: false,
            passiveAbility: createBlankTrainerPassiveAbility(element),
            activeAbility: createBlankTrainerActiveAbility(element)
        });
    }

    function createBlankTrainerPassiveAbility(element) {
        return normalizeAbility({
            name: "New Passive",
            description: "",
            targetType: "PASSIVE",
            effectType: firstEffectKey(),
            effectValue: 0,
            passive: true,
            requiredElement: "",
            requiredEnergy: 0,
            requiredReaction: ""
        }, element);
    }

    function createBlankTrainerActiveAbility(element) {
        return normalizeAbility({
            name: "New Active",
            description: "",
            targetType: "SINGLE_ENEMY",
            effectType: firstEffectKey(),
            effectValue: 0,
            passive: false,
            requiredElement: "",
            requiredEnergy: 0,
            requiredReaction: ""
        }, element);
    }

    function defaultNewCardType() {
        if (state.editorPage === "ACTION") {
            return state.actionTypeFilter === "TRAP" ? "TRAP" : "SPELL";
        }
        return "SIEGLING";
    }

    function normalizeCardType(value) {
        const normalized = String(value || "SIEGLING").trim().toUpperCase();
        return ["SIEGLING", "SPELL", "TRAP"].includes(normalized) ? normalized : "SIEGLING";
    }

    function inferCardType(card) {
        if (card?.trapBucketElement != null || card?.trapBucketAmount != null) {
            return "TRAP";
        }
        if (card?.requiredComboSize != null || card?.requiredComboSignature != null || card?.requiredReaction != null) {
            return "SPELL";
        }
        if (card?.ability != null && !looksLikeSiegling(card)) {
            return "SPELL";
        }
        return "SIEGLING";
    }

    function looksLikeSiegling(card) {
        return card?.health != null
            || card?.speed != null
            || card?.preferredRow != null
            || card?.evolvesFromId != null
            || Array.isArray(card?.notches)
            || Array.isArray(card?.moveIds);
    }

    function pageForCardType(cardType) {
        return normalizeCardType(cardType) === "SIEGLING" ? "SIEGLING" : "ACTION";
    }

    function setEditorPage(page) {
        if (page === "ACTION") {
            state.editorPage = "ACTION";
        } else if (page === "DECKS") {
            state.editorPage = "DECKS";
        } else if (page === "TRAINERS") {
            state.editorPage = "TRAINERS";
        } else if (page === "LIVE_ELEMENTS") {
            state.editorPage = "LIVE_ELEMENTS";
        } else if (page === "LOADING_ART") {
            state.editorPage = "LOADING_ART";
        } else if (page === "MOVES_POOL") {
            const prev = state.editorPage;
            state.editorPage = "MOVES_POOL";
            if (prev !== "MOVES_POOL") {
                state.movesPoolFormEpoch += 1;
            }
        } else {
            state.editorPage = "SIEGLING";
        }
        syncSelectionToEditorPage();
        renderAll();
    }

    function syncSelectionToEditorPage() {
        if (state.editorPage === "TRAINERS") {
            const selectedTrainer = state.trainers.find((trainer) => trainer.id === state.selectedTrainerId) || null;
            if (selectedTrainer) {
                return;
            }
            state.selectedTrainerId = state.trainers[0]?.id || null;
            return;
        }
        if (state.editorPage === "DECKS") {
            const selectedDeck = state.decks.find((deck) => deck.id === state.selectedDeckId) || null;
            if (selectedDeck) {
                return;
            }
            state.selectedDeckId = state.decks[0]?.id || null;
            return;
        }
        if (state.editorPage === "MOVES_POOL") {
            if (state.movesPoolIsNewDraft) {
                return;
            }
            const selectedMove = findMoveById(state.selectedMoveId);
            if (selectedMove) {
                return;
            }
            state.selectedMoveId = state.movesPool[0]?.id || null;
            state.movesPoolIsNewDraft = false;
            state.moveDraftEditingOriginalId = null;
            return;
        }
        const selectedCard = state.cards.find((card) => card.id === state.selectedCardId) || null;
        if (selectedCard && matchesEditorPage(selectedCard)) {
            return;
        }
        state.selectedCardId = getPageCards()[0]?.id || null;
        state.selectedAbilityIndex = 0;
    }

    function createDeck() {
        const deck = createBlankDeck();
        state.decks.unshift(deck);
        state.selectedDeckId = deck.id;
        state.editorPage = "DECKS";
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("Created a new premade deck draft.", "warning");
        renderAll();
    }

    function createTrainer() {
        const trainer = createBlankTrainer();
        state.trainers.unshift(trainer);
        state.selectedTrainerId = trainer.id;
        state.editorPage = "TRAINERS";
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("Created a new Siegeknight draft.", "warning");
        renderAll();
    }

    function duplicateTrainer() {
        const trainer = getSelectedTrainer();
        if (!trainer) {
            return;
        }
        const clone = normalizeTrainer({
            ...buildExportTrainer(trainer),
            id: createUniqueTrainerId(`${trainer.id}-copy`),
            name: `${trainer.name} Copy`,
            active: false
        });
        state.trainers.unshift(clone);
        state.selectedTrainerId = clone.id;
        state.editorPage = "TRAINERS";
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus(`Duplicated ${trainer.name || trainer.id}.`, "warning");
        renderAll();
    }

    function duplicateDeck() {
        const deck = getSelectedDeck();
        if (!deck) {
            return;
        }
        const clone = normalizeDeck({
            ...buildExportDeck(deck),
            id: createUniqueDeckId(`${deck.id}-copy`),
            name: `${deck.name} Copy`,
            active: false
        });
        state.decks.unshift(clone);
        state.selectedDeckId = clone.id;
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus(`Duplicated ${deck.name || deck.id}.`, "warning");
        renderAll();
    }

    function deleteDeck() {
        const deck = getSelectedDeck();
        if (!deck) {
            return;
        }
        state.decks = state.decks.filter((entry) => entry.id !== deck.id);
        state.selectedDeckId = state.decks[0]?.id || null;
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus(`Deleted ${deck.name || deck.id}.`, "warning");
        renderAll();
    }

    function updateSelectedDeckField(field, value) {
        mutateSelectedDeck((deck) => {
            deck[field] = typeof value === "string" ? value : value ?? "";
        });
    }

    function addCardToSelectedDeck(cardId) {
        if (!cardId) {
            return;
        }
        mutateSelectedDeck((deck) => {
            deck.cardIds.push(cardId);
            deck.elements = inferDeckElements(deck.cardIds);
            deck.usesGeneratedPreset = false;
        });
    }

    function removeCardFromSelectedDeck(cardId) {
        if (!cardId) {
            return;
        }
        mutateSelectedDeck((deck) => {
            const index = deck.cardIds.findIndex((entry) => entry === cardId);
            if (index >= 0) {
                deck.cardIds.splice(index, 1);
            }
            deck.elements = inferDeckElements(deck.cardIds);
            deck.usesGeneratedPreset = false;
        });
    }

    function toggleNotch(card, direction) {
        const existingIndex = card.notches.findIndex((notch) => notch.direction === direction);
        if (existingIndex >= 0) {
            card.notches.splice(existingIndex, 1);
            return;
        }
        card.notches.push({
            direction,
            element: card.element || firstMetaValue("elements", "FIRE")
        });
        card.notches.sort((left, right) => notchOrder(left.direction) - notchOrder(right.direction));
    }

    function notchOrder(direction) {
        return NOTCH_LAYOUT.indexOf(direction);
    }

    function applyTargetRule(ability) {
        const rule = getTargetRule(ability.targetType);
        ability.targetCount = Number.isFinite(rule.fixedTargetCount) ? rule.fixedTargetCount : 0;
        if (!rule.requiresRow) {
            ability.targetRow = "";
        } else if (!ability.targetRow) {
            ability.targetRow = firstMetaValue("rows", "FRONT");
        }
        if (ability.targetType === "PASSIVE") {
            ability.passive = true;
        }
    }

    function renderAll() {
        syncSelectionToEditorPage();
        state.validation = validateDashboard();
        renderAuth();
        renderStatus();
        renderFilterOptions();
        refs.cardWorkspace.classList.toggle("hidden", state.editorPage === "DECKS" || state.editorPage === "PACKS" || state.editorPage === "TRAINERS" || state.editorPage === "LIVE_ELEMENTS" || state.editorPage === "MOVES_POOL" || state.editorPage === "LOADING_ART");
        refs.movesPoolWorkspace.classList.toggle("hidden", state.editorPage !== "MOVES_POOL");
        refs.deckWorkspace.classList.toggle("hidden", state.editorPage !== "DECKS");
        refs.packWorkspace.classList.toggle("hidden", state.editorPage !== "PACKS");
        refs.trainerWorkspace.classList.toggle("hidden", state.editorPage !== "TRAINERS");
        refs.liveElementsWorkspace.classList.toggle("hidden", state.editorPage !== "LIVE_ELEMENTS");
        refs.loadingArtWorkspace.classList.toggle("hidden", state.editorPage !== "LOADING_ART");
        if (state.editorPage === "MOVES_POOL") {
            mountMoveDraftPanel(refs.moveDraftPanelHostPool);
            renderMovesPoolBrowser();
            renderMovesPoolEditorShell();
        } else {
            mountMoveDraftPanel(refs.moveDraftPanelHostSiegling);
        }
        renderCardList();
        renderEditor();
        renderCardVisual();
        renderSummary();
        renderPreview();
        renderDeckList();
        renderDeckEditor();
        renderDeckSummary();
        renderDeckCatalog();
        renderDeckPreview();
        renderPackPanel();
        renderTrainerList();
        renderTrainerEditor();
        renderTrainerSummary();
        renderTrainerPreview();
        renderLiveElementsPanel();
        renderValidation();
        renderButtons();
        renderCardIdOptions();
        if (state.editorPage === "MOVES_POOL") {
            renderMovesPoolSidePanels();
        }
    }

    function renderAuth() {
        const liveMode = state.liveEditingEnabled || state.firestoreAvailable;
        const auth = state.auth || DEFAULT_AUTH;

        refs.bootstrapForm.classList.add("hidden");
        refs.loginForm.classList.add("hidden");
        refs.authSessionPanel.classList.add("hidden");

        refs.authModePill.className = `status-pill ${liveMode ? "is-success" : "is-warning"}`;
        refs.authModePill.textContent = liveMode ? "Live Firestore mode" : "Local file mode";

        refs.authStatePill.className = `status-pill ${auth.authenticated ? "is-success" : "is-warning"}`;
        refs.authStatePill.textContent = auth.authenticated ? `Signed in as ${auth.displayName || auth.email}` : "Not signed in";

        if (!liveMode) {
            refs.authSummaryText.textContent = state.firestoreError
                ? `Live publishing is unavailable in this runtime. ${state.firestoreError}`
                : "This runtime is using local JSON files, so publishing from other devices is not available here yet.";
            return;
        }

        if (auth.authenticated) {
            refs.authSummaryText.textContent = "Changes you publish here go live in the game.";
            refs.authSessionText.textContent = state.updatedBy
                ? `Last publish: ${state.updatedBy}${state.updatedAt ? ` on ${formatTimestamp(state.updatedAt)}` : ""}.`
                : "";
            refs.authSessionPanel.classList.remove("hidden");
            return;
        }

        if (auth.bootstrappable) {
            refs.authSummaryText.textContent = "No live dashboard admin exists yet. Create the first admin account here to unlock publishing from any device.";
            refs.bootstrapForm.classList.remove("hidden");
            return;
        }

        refs.authSummaryText.textContent = "Live publishing is enabled. Sign in with your dashboard admin account to publish Firestore updates.";
        refs.loginForm.classList.remove("hidden");
    }

    function renderStatus() {
        refs.dirtyPill.textContent = state.dirty ? "Unsaved changes" : "Saved";
        refs.cardCountPill.textContent = state.editorPage === "DECKS"
            ? `${state.decks.length} preset deck${state.decks.length === 1 ? "" : "s"}`
            : (state.editorPage === "PACKS"
                ? `${state.packs.length} pack group${state.packs.length === 1 ? "" : "s"}`
            : (state.editorPage === "TRAINERS"
                ? `${state.trainers.length} Siegeknight${state.trainers.length === 1 ? "" : "s"}`
                : (state.editorPage === "LIVE_ELEMENTS"
                    ? `${state.liveElements.filter((row) => row.active !== false).length} active element${state.liveElements.filter((row) => row.active !== false).length === 1 ? "" : "s"}`
                    : (state.editorPage === "MOVES_POOL"
                        ? `${state.movesPool.length} shared abilit${state.movesPool.length === 1 ? "y" : "ies"}`
                    : (state.editorPage === "LOADING_ART"
                        ? "Loading screen art"
                        : `${state.cards.length} card${state.cards.length === 1 ? "" : "s"}`)))));
        refs.statusMessage.textContent = state.status.message;

        refs.dirtyPill.className = `status-pill ${state.dirty ? "is-dirty" : "is-success"}`;
        refs.cardCountPill.className = `status-pill ${state.validation.some((issue) => issue.severity === "error") ? "is-error" : "is-success"}`;
        refs.statusMessage.className = "status-message";
        if (state.status.tone === "error") {
            refs.statusMessage.classList.add("tone-error");
        } else if (state.status.tone === "warning") {
            refs.statusMessage.classList.add("tone-warning");
        } else if (state.status.tone === "success") {
            refs.statusMessage.classList.add("tone-success");
        }
    }

    function renderPackPanel() {
        if (!refs.packList || !refs.packsJsonPreview) {
            return;
        }
        const packs = Array.isArray(state.packs) ? state.packs : [];
        refs.packList.innerHTML = packs.length
            ? packs.map((pack) => `
                <div class="deck-row">
                    <div class="deck-row-main">
                        <strong>${escapeHtml(pack.name || pack.id)}</strong>
                        <div class="card-meta">${escapeHtml((pack.elements || []).map(formatEnumLabel).join(" / "))} | ${pack.starterEligible ? "Starter eligible" : "Shop pack"} | ${Number(pack.price || 0)} gold</div>
                        <div class="card-meta">${escapeHtml(pack.description || "")}</div>
                    </div>
                    <span class="status-pill ${pack.active === false ? "is-warning" : "is-success"}">${pack.active === false ? "Inactive" : "Active"}</span>
                </div>
            `).join("")
            : `<div class="empty-browser">No pack groups are available. The live game will use generated element packs.</div>`;
        refs.packsJsonPreview.value = JSON.stringify(packs, null, 2);
    }

    function renderFilterOptions() {
        if (!state.metadata) {
            refs.elementFilterSelect.innerHTML = `<option value="ALL">All Elements</option>`;
            return;
        }
        const options = [`<option value="ALL">All Elements</option>`]
            .concat((state.metadata.elements || []).map((element) => `<option value="${element}">${formatEnumLabel(element)}</option>`))
            .join("");
        refs.elementFilterSelect.innerHTML = options;
        refs.elementFilterSelect.value = state.elementFilter;
        refs.actionTypeFilterSelect.value = state.actionTypeFilter;
        refs.actionTypeFilterSelect.classList.toggle("hidden", state.editorPage !== "ACTION");
        refs.browserTitle.textContent = state.editorPage === "ACTION"
            ? "Strategies And Deceptions"
            : (state.editorPage === "MOVES_POOL" ? "Shared Abilities" : "Siegelings");
        refs.showSieglingsBtn.classList.toggle("active", state.editorPage === "SIEGLING");
        refs.showActionsBtn.classList.toggle("active", state.editorPage === "ACTION");
        refs.showTrainersBtn.classList.toggle("active", state.editorPage === "TRAINERS");
        refs.showDecksBtn.classList.toggle("active", state.editorPage === "DECKS");
        refs.showPacksBtn.classList.toggle("active", state.editorPage === "PACKS");
        refs.showLiveElementsBtn.classList.toggle("active", state.editorPage === "LIVE_ELEMENTS");
        refs.showMovesPoolBtn.classList.toggle("active", state.editorPage === "MOVES_POOL");
        refs.showLoadingArtBtn.classList.toggle("active", state.editorPage === "LOADING_ART");
        if (state.editorPage === "LIVE_ELEMENTS") {
            refs.browserTitle.textContent = "Live Elements";
        }
    }

    function renderCardList() {
        const cards = getFilteredCards();
        if (cards.length === 0) {
            refs.cardList.innerHTML = `<div class="empty-browser">No cards match the current page, search, and filter settings.</div>`;
            return;
        }
        refs.cardList.innerHTML = cards.map((card) => {
            const active = card.id === state.selectedCardId ? " active" : "";
            const elementTheme = elementThemeClass(card.element);
            return `
                <div class="card-row ${elementTheme}${active}" data-card-id="${escapeHtml(card.id)}">
                    <div class="card-row-title">
                        <strong>${escapeHtml(card.name || "Unnamed Card")}</strong>
                        <span class="summary-badge">${escapeHtml(formatEnumLabel(card.cardType))} | ${escapeHtml(formatEnumLabel(card.element))}</span>
                    </div>
                    <div class="card-meta">${escapeHtml(formatCardMeta(card))}</div>
                    <div class="card-id">${escapeHtml(card.id || "missing-id")}</div>
                </div>
            `;
        }).join("");
    }

    function renderEditor() {
        const card = getSelectedCard();
        const ability = getSelectedAbility();

        refs.cardEditorPanel.className = `panel editor-panel${card ? ` ${elementThemeClass(card.element)}` : ""}`;

        refs.emptyEditorState.classList.toggle("hidden", Boolean(card));
        refs.cardEditorContent.classList.toggle("hidden", !card);
        if (!card) {
            refs.cardSummary.innerHTML = `<div class="validation-empty">Select a card to see its live summary.</div>`;
            refs.jsonPreview.value = "";
            return;
        }

        const isSiegling = card.cardType === "SIEGLING";
        const isSpell = card.cardType === "SPELL";
        const isTrap = card.cardType === "TRAP";

        populateSelect(refs.cardTypeSelect, state.metadata?.cardTypes || ["SIEGLING", "SPELL", "TRAP"], card.cardType);
        populateSelect(refs.cardElementSelect, state.metadata?.elements || [], card.element);
        populateSelect(refs.cardRaritySelect, state.metadata?.rarities || [], card.rarity);
        populateSelect(refs.cardPreferredRowSelect, state.metadata?.rows || [], card.preferredRow);
        populateSelect(refs.cardCostElementSelect, ["", ...(state.metadata?.elements || [])], card.costElement, true);
        populateSelect(refs.actionCostElementSelect, ["", ...(state.metadata?.elements || [])], card.costElement, true);
        populateSelect(refs.trapBucketElementSelect, ["", ...(state.metadata?.elements || [])], card.trapBucketElement, true);
        populateSelect(refs.cardRequiredReactionSelect, ["", ...(state.metadata?.reactions || [])], card.requiredReaction, true);

        setInputValue(refs.cardIdInput, card.id);
        setInputValue(refs.cardNameInput, card.name);
        refs.cardIdInput.dataset.autoId = computeAutoCardId(card, card.name);
        setInputValue(refs.cardHealthInput, card.health);
        setInputValue(refs.cardSpeedInput, card.speed);
        setInputValue(refs.cardEvolvesFromInput, card.evolvesFromId);
        setInputValue(refs.cardCostAmountInput, card.costAmount);
        setInputValue(refs.actionCostAmountInput, card.costAmount);
        setInputValue(refs.trapBucketAmountInput, card.trapBucketAmount);
        setInputValue(refs.cardRequiredComboSizeInput, card.requiredComboSize);
        setInputValue(refs.cardRequiredComboSignatureInput, card.requiredComboSignature);

        refs.sieglingStatsSection.classList.toggle("hidden", !isSiegling);
        refs.notchesSection.classList.toggle("hidden", !isSiegling);
        refs.actionCardSection.classList.toggle("hidden", isSiegling);
        refs.spellCostElementField.classList.toggle("hidden", !isSpell);
        refs.spellCostAmountField.classList.toggle("hidden", !isSpell);
        refs.spellRequiredReactionField.classList.toggle("hidden", !isSpell);
        refs.spellRequiredComboSizeField.classList.toggle("hidden", !isSpell);
        refs.spellRequiredComboSignatureField.classList.toggle("hidden", !isSpell);
        refs.trapBucketElementField.classList.toggle("hidden", !isTrap);
        refs.trapBucketAmountField.classList.toggle("hidden", !isTrap);
        refs.actionCardSectionTitle.textContent = isTrap ? "Deception Trigger And Effect" : "Strategy Cost And Requirements";
        refs.actionCardHelpText.textContent = isTrap
            ? "Deception cards trigger from the opponent's bucket, so choose the enemy element threshold that springs this effect."
            : "Strategy cards can use a normal energy cost, a reaction gate, or a combo signature to control when they can be cast.";
        refs.abilitySectionTitle.textContent = isSiegling ? "Ability Editor" : (isTrap ? "Deception Effect" : "Strategy Effect");

        if (refs.sieglingMovesSection) {
            refs.sieglingMovesSection.classList.toggle("hidden", !isSiegling);
        }
        if (refs.actionAbilitySection) {
            refs.actionAbilitySection.classList.toggle("hidden", isSiegling);
        }

        renderNotches(card);
        if (isSiegling) {
            renderSieglingMovesUI(card);
            if (refs.saveMoveDraftBtn) {
                refs.saveMoveDraftBtn.textContent = "Save to pool";
            }
            refs.abilityEditor.classList.add("hidden");
            return;
        }

        renderAbilityTabs(card);

        if (!ability) {
            refs.abilityEditor.classList.add("hidden");
            return;
        }

        refs.abilityEditor.classList.remove("hidden");
        populateSelect(refs.abilityTargetTypeSelect, state.metadata?.targetTypes || [], ability.targetType);
        populateSelect(refs.abilityTargetRowSelect, state.metadata?.rows || [], ability.targetRow || firstMetaValue("rows", "FRONT"));
        populateSelect(
            refs.abilityEffectTypeSelect,
            (state.metadata?.effectTypes || []).map((effect) => effect.key),
            ability.effectType,
            false,
            effectLabelMap()
        );
        populateSelect(refs.abilityRequiredElementSelect, ["", ...(state.metadata?.elements || [])], ability.requiredElement, true);
        populateSelect(refs.abilityRequiredReactionSelect, ["", ...(state.metadata?.reactions || [])], ability.requiredReaction, true);

        const isActionAbility = !isSiegling;
        refs.abilityRequiredElementField.classList.toggle("hidden", isActionAbility);
        refs.abilityRequiredEnergyField.classList.toggle("hidden", isActionAbility);
        refs.abilityRequiredReactionField.classList.toggle("hidden", isActionAbility);

        if (isActionAbility) {
            const autoDescription = buildAutoAbilityDescription(ability);
            const previousAutoDescription = refs.abilityDescriptionInput.dataset.autoDescription || "";
            const currentDescription = ability.description || "";
            if (!autoDescription) {
                if (currentDescription === previousAutoDescription) {
                    ability.description = "";
                }
                refs.abilityDescriptionInput.dataset.autoDescription = "";
            } else {
                if (!currentDescription.trim() || currentDescription === previousAutoDescription) {
                    ability.description = autoDescription;
                }
                refs.abilityDescriptionInput.dataset.autoDescription = autoDescription;
            }
        } else {
            refs.abilityDescriptionInput.dataset.autoDescription = "";
        }

        setInputValue(refs.abilityNameInput, ability.name);
        refs.abilityNameInput.dataset.autoName = isActionAbility ? (card.name || "") : "";
        refs.abilityPassiveSelect.value = ability.passive ? "true" : "false";
        setInputValue(refs.abilityDescriptionInput, ability.description);
        setInputValue(refs.abilityEffectValueInput, ability.effectValue);
        setInputValue(refs.abilityRequiredEnergyInput, ability.requiredEnergy);

        const targetRule = getTargetRule(ability.targetType);
        refs.abilityTargetRowField.classList.toggle("hidden", !targetRule.requiresRow);
        refs.abilityTargetHelper.textContent = buildTargetHelperText(ability, targetRule);
        refs.abilityEffectHelper.textContent = buildEffectHelperText(ability.effectType);
    }

    function buildAutoAbilityDescription(ability) {
        return buildAutoMoveDescription({
            targetType: ability?.targetType || "",
            targetElement: "",
            targetRow: ability?.targetRow || "",
            effectType: ability?.effectType || "",
            effectValue: ability?.effectValue,
            energyCost: ability?.requiredEnergy,
            isPassive: Boolean(ability?.passive)
        });
    }

    function buildAutoTrainerPassiveDescription(ability, trainer) {
        const effectType = String(ability?.effectType || "").trim();
        const value = Math.max(0, toNumber(ability?.effectValue, 0));
        const signedValue = `+${value}`;
        const scope = trainerPassiveTargetScope(ability, trainer);
        const gainVerb = trainerPassiveGainVerb(ability);
        switch (effectType) {
            case "damage_boost":
                return `${scope} ${gainVerb} ${signedValue} Attack Damage`;
            case "health_boost":
                return `${scope} ${gainVerb} ${signedValue} max HP`;
            case "draw":
                return `Draw ${value} ${value === 1 ? "card" : "cards"}`;
            case "shield":
                return `${scope} ${gainVerb} ${signedValue} Shield`;
            case "speed_boost":
                return `${scope} ${gainVerb} ${signedValue} Speed`;
            case "slow":
                return `${scope} lose ${value} Speed`;
            case "connected_allies_damage_boost":
                return `Connected allies gain ${signedValue} Attack Damage`;
            case "connected_allies_health_boost":
                return `Connected allies gain ${signedValue} max HP`;
            case "connected_allies_shield":
                return `Connected allies gain ${signedValue} Shield`;
            case "connected_allies_slow":
                return `Connected allies lose ${value} Speed`;
            case "connected_allies_speed_boost":
                return `Connected allies gain ${signedValue} Speed`;
            default:
                return buildAutoMoveDescription({
                    targetType: ability?.targetType || "",
                    targetElement: trainer?.element || "",
                    targetRow: ability?.targetRow || "",
                    effectType,
                    effectValue: ability?.effectValue,
                    energyCost: 0,
                    isPassive: true
                });
        }
    }

    function trainerPassiveTargetScope(ability, trainer) {
        const targetType = String(ability?.targetType || "").trim();
        const element = String(trainer?.element || "").trim();
        const elementPrefix = element && element !== "NEUTRAL" ? `${formatEnumLabel(element)} ` : "";
        if (targetType === "ROW_ALLIES") {
            const row = formatEnumLabel(ability?.targetRow || firstMetaValue("rows", "FRONT"));
            return `${row} Row ${elementPrefix}allies`;
        }
        if (targetType === "SINGLE_ALLY") {
            return `1 ${elementPrefix}ally`;
        }
        if (targetType === "SELF") {
            return "This SiegeKnight";
        }
        return `All ${elementPrefix}allies`;
    }

    function trainerPassiveGainVerb(ability) {
        const targetType = String(ability?.targetType || "").trim();
        return targetType === "SINGLE_ALLY" || targetType === "SELF" ? "gains" : "gain";
    }

    function renderNotches(card) {
        refs.notchGrid.innerHTML = NOTCH_LAYOUT.map((direction) => {
            if (direction === "CENTER") {
                return `<div class="notch-center">Card</div>`;
            }
            const activeNotch = card.notches.find((notch) => notch.direction === direction);
            return `
                <button class="notch-button${activeNotch ? " active" : ""}" type="button" data-notch-direction="${direction}">
                    ${escapeHtml(shortDirection(direction))}
                </button>
            `;
        }).join("");

        if (card.notches.length === 0) {
            refs.activeNotchList.innerHTML = `<div class="validation-empty">No active notches yet. Toggle directions above to add them.</div>`;
            return;
        }

        refs.activeNotchList.innerHTML = card.notches.map((notch, index) => `
            <div class="notch-row">
                <div class="notch-label">${escapeHtml(formatEnumLabel(notch.direction))}</div>
                <select data-notch-index="${index}">
                    ${buildOptionMarkup(state.metadata?.elements || [], notch.element)}
                </select>
                <button class="btn btn-secondary" type="button" data-remove-notch-index="${index}">Remove</button>
            </div>
        `).join("");
    }

    function renderAbilityTabs(card) {
        refs.abilityTabs.innerHTML = card.abilities.map((ability, index) => `
            <button class="ability-tab${index === state.selectedAbilityIndex ? " active" : ""}" type="button" data-ability-index="${index}">
                <span class="ability-tab-name">${escapeHtml(ability.name || `Ability ${index + 1}`)}</span>
                <span class="ability-tab-meta">${escapeHtml(formatEnumLabel(ability.targetType))} | ${escapeHtml(effectLabel(ability.effectType))}</span>
            </button>
        `).join("");
    }

    function toBinderPreviewCard(card) {
        const ephemeralArtUrl = getEphemeralCardArtPreviewUrl(card.id);
        const preview = {
            ...card,
            type: card.cardType,
            abilities: card.cardType === "SIEGLING" ? [] : (card.abilities || [])
        };
        if (ephemeralArtUrl) {
            preview.cardArtUrl = ephemeralArtUrl;
            preview.cardArtMode = preview.cardArtMode || "REPLACE";
        }
        if (card.cardType !== "SIEGLING" && preview.abilities[0]) {
            preview.ability = preview.abilities[0];
        }
        if (card.cardType === "SIEGLING" && (card.moveIds || []).length > 0) {
            const firstMove = findMoveById(card.moveIds[0]);
            if (firstMove) {
                preview.abilities = [{
                    name: firstMove.name,
                    description: firstMove.description || ""
                }];
            }
        }
        return preview;
    }

    function renderCardVisual() {
        if (!refs.cardVisualStage) {
            return;
        }
        const card = getSelectedCard();
        if (!card) {
            refs.cardVisualStage.innerHTML = `<div class="validation-empty">Select a card to preview.</div>`;
            refs.cardArtControls?.classList.add("hidden");
            teardownCardArtDragInteraction();
            return;
        }

        const binder = window.SieglingsCardBinderVisual;
        if (!binder) {
            refs.cardVisualStage.innerHTML = `<div class="validation-empty">Card preview module failed to load.</div>`;
            refs.cardArtControls?.classList.remove("hidden");
            return;
        }

        const previewCard = toBinderPreviewCard(card);
        const descriptionText = card.cardType === "SIEGLING"
            ? ((card.moveIds || []).map((id) => findMoveById(id)?.description).find(Boolean) || "Preview card art and notches as players see them in the Cards menu.")
            : (card.abilities?.[0]?.description || "Preview card art as players see it in the Cards menu.");

        refs.cardVisualStage.innerHTML = binder.renderBinderCardPreview(previewCard, {
            ownedLabel: "Preview",
            descriptionText
        });
        refs.cardArtControls?.classList.remove("hidden");

        const mode = normalizeCardArtMode(card.cardArtMode);
        refs.cardArtControls?.querySelectorAll('input[name="cardArtMode"]').forEach((input) => {
            input.checked = input.value === mode;
        });
        if (refs.cardArtUrlInput && document.activeElement !== refs.cardArtUrlInput) {
            setInputValue(refs.cardArtUrlInput, card.cardArtUrl || "");
            refs.cardArtUrlInput.placeholder = defaultCardArtPath(card.id) || "/assets/cards/example.png";
        }
        if (refs.cardHolographicCheckbox) {
            refs.cardHolographicCheckbox.checked = Boolean(card.holographic);
        }
        syncCardArtTransformControls(card);
        setupCardArtDragInteraction(card);
        attachCardArtPreviewErrorHandler(card);
    }

    function attachCardArtPreviewErrorHandler(card) {
        if (getEphemeralCardArtPreviewUrl(card.id)) {
            return;
        }
        const artImg = refs.cardVisualStage?.querySelector(".binder-card-custom-art, .binder-card-overlay-art-card, .binder-full-card-art img");
        if (!artImg) {
            return;
        }
        artImg.addEventListener("error", () => {
            const artUrl = String(card.cardArtUrl || "").trim();
            if (!artUrl) {
                return;
            }
            setStatus(
                `Card art did not load (${artUrl}). Use Upload Image to host the file, or fix the Art URL path (expected ${defaultCardArtPath(card.id) || "/assets/cards/<card-id>.png"}).`,
                "error"
            );
            renderStatus();
        }, { once: true });
    }

    function renderSummary() {
        const card = getSelectedCard();
        if (!card) {
            refs.cardSummary.innerHTML = `<div class="validation-empty">Select a card to see a summary.</div>`;
            return;
        }
        if (card.cardType !== "SIEGLING") {
            refs.cardSummary.innerHTML = renderActionCardSummary(card);
            return;
        }
        const summaryTags = [];
        if (card.evolvesFromId.trim()) {
            summaryTags.push(`Evolves from ${card.evolvesFromId.trim()}`);
        }
        if (card.costAmount > 0) {
            summaryTags.push(`Cost ${card.costAmount} ${formatEnumLabel(card.costElement || card.element)}`);
        }
        if (card.notches.length > 0) {
            summaryTags.push(`${card.notches.length} notch${card.notches.length === 1 ? "" : "es"}`);
        }

        refs.cardSummary.innerHTML = `
            <div class="summary-card-shell">
                <div class="summary-top">
                    <div>
                        <h3>${escapeHtml(card.name || "Unnamed Card")}</h3>
                        <div class="card-summary-copy">${escapeHtml(card.id || "missing-id")}</div>
                    </div>
                    <span class="summary-badge">${escapeHtml(formatEnumLabel(card.element))}</span>
                </div>
                <div class="stat-strip">
                    <span class="stat-chip">Rarity: ${escapeHtml(formatEnumLabel(card.rarity))}</span>
                    <span class="stat-chip">Health: ${card.health}</span>
                    <span class="stat-chip">Speed: ${card.speed}</span>
                    <span class="stat-chip">Row: ${escapeHtml(formatEnumLabel(card.preferredRow))}</span>
                </div>
                <div class="summary-tags">
                    ${summaryTags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("") || `<span class="tag-chip">Base card</span>`}
                </div>
            </div>
            <div class="summary-card-shell">
                <div class="section-kicker">Notches</div>
                <div class="summary-tags">
                    ${card.notches.length > 0
                        ? card.notches.map((notch) => `<span class="tag-chip">${escapeHtml(formatEnumLabel(notch.direction))} ${escapeHtml(formatEnumLabel(notch.element))}</span>`).join("")
                        : `<span class="tag-chip">No notches yet</span>`}
                </div>
            </div>
            <div class="summary-ability-list">
                ${(card.moveIds || []).length > 0
                    ? (card.moveIds || []).map((mid) => {
                        const mv = findMoveById(mid);
                        const title = mv ? mv.name : mid;
                        const desc = mv ? mv.description : "Unknown move id (add it to the moves pool).";
                        const meta = mv ? describeMove(mv) : "";
                        return `
                    <div class="summary-ability">
                        <strong>${escapeHtml(title)}</strong>
                        <div class="card-summary-copy">${escapeHtml(desc)}</div>
                        ${meta ? `<div class="card-summary-copy">${escapeHtml(meta)}</div>` : ""}
                    </div>`;
                    }).join("")
                    : `<div class="summary-ability"><div class="card-summary-copy">No moves assigned yet.</div></div>`}
            </div>
        `;
    }

    function renderActionCardSummary(card) {
        const summaryTags = [
            `${formatEnumLabel(card.cardType)} card`,
            card.cardType === "TRAP"
                ? `Trigger ${card.trapBucketAmount || 0} ${formatEnumLabel(card.trapBucketElement || card.element)}`
                : `Cost ${card.costAmount || 0} ${formatEnumLabel(card.costElement || card.element)}`
        ];
        if (card.cardType === "SPELL" && card.requiredComboSize > 0) {
            summaryTags.push(`Combo ${card.requiredComboSize}${card.requiredComboSignature ? `: ${card.requiredComboSignature}` : ""}`);
        }
        if (card.cardType === "SPELL" && card.requiredReaction) {
            summaryTags.push(`Needs ${formatEnumLabel(card.requiredReaction)}`);
        }
        return `
            <div class="summary-card-shell">
                <div class="summary-top">
                    <div>
                        <h3>${escapeHtml(card.name || "Unnamed Card")}</h3>
                        <div class="card-summary-copy">${escapeHtml(card.id || "missing-id")}</div>
                    </div>
                    <span class="summary-badge">${escapeHtml(formatEnumLabel(card.element))}</span>
                </div>
                <div class="stat-strip">
                    <span class="stat-chip">Type: ${escapeHtml(formatEnumLabel(card.cardType))}</span>
                    <span class="stat-chip">Rarity: ${escapeHtml(formatEnumLabel(card.rarity))}</span>
                    ${card.cardType === "TRAP"
                        ? `<span class="stat-chip">Trigger: ${card.trapBucketAmount || 0} ${escapeHtml(formatEnumLabel(card.trapBucketElement || card.element))}</span>`
                        : `<span class="stat-chip">Play Cost: ${card.costAmount || 0} ${escapeHtml(formatEnumLabel(card.costElement || card.element))}</span>`}
                </div>
                <div class="summary-tags">
                    ${summaryTags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}
                </div>
            </div>
            <div class="summary-ability-list">
                ${card.abilities.map((ability, index) => `
                    <div class="summary-ability">
                        <strong>${escapeHtml(ability.name || `${formatEnumLabel(card.cardType)} Effect ${index + 1}`)}</strong>
                        <div class="card-summary-copy">${escapeHtml(ability.description || "No description yet.")}</div>
                        <div class="card-summary-copy">${escapeHtml(describeAbility(ability))}</div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderDeckList() {
        if (state.editorPage !== "DECKS") {
            return;
        }
        const decks = getFilteredDecks();
        if (decks.length === 0) {
            refs.deckList.innerHTML = `<div class="empty-browser">No premade decks match the current search and status filter.</div>`;
            return;
        }
        refs.deckList.innerHTML = decks.map((deck) => {
            const active = deck.id === state.selectedDeckId ? " active" : "";
            const theme = elementThemeClass(primaryDeckElement(deck));
            const statusBadge = deck.active ? "Active" : "Inactive";
            const counts = deckTypeCounts(deck.cardIds);
            return `
                <div class="card-row ${theme}${active}" data-deck-id="${escapeHtml(deck.id)}">
                    <div class="card-row-title">
                        <strong>${escapeHtml(deck.name || "Unnamed Deck")}</strong>
                        <span class="summary-badge">${escapeHtml(statusBadge)} | ${deck.cardIds.length} cards</span>
                    </div>
                    <div class="card-meta">${escapeHtml(`${counts.sieglings} Siegelings | ${counts.spells} Strategies | ${counts.traps} Deceptions`)}</div>
                    <div class="card-id">${escapeHtml(deck.id || "missing-id")}</div>
                </div>
            `;
        }).join("");
    }

    function renderDeckEditor() {
        if (state.editorPage !== "DECKS") {
            return;
        }
        const deck = getSelectedDeck();
        refs.emptyDeckState.classList.toggle("hidden", Boolean(deck));
        refs.deckEditorContent.classList.toggle("hidden", !deck);
        if (refs.deckEditorPanel) {
            refs.deckEditorPanel.className = deck
                ? `panel deck-editor-panel editor-panel ${elementThemeClass(primaryDeckElement(deck))}`
                : "panel deck-editor-panel editor-panel el-neutral";
        }
        if (!deck) {
            refs.deckCompositionList.innerHTML = "";
            return;
        }

        populateSelect(
            refs.deckTrainerSelect,
            state.trainers.map((trainer) => trainer.id),
            deck.recommendedTrainerId,
            false,
            Object.fromEntries(state.trainers.map((trainer) => [
                trainer.id,
                `${trainer.name} (${formatEnumLabel(trainer.element)})${trainer.active ? "" : " - Inactive"}`
            ]))
        );
        setInputValue(refs.deckIdInput, deck.id);
        setInputValue(refs.deckNameInput, deck.name);
        setInputValue(refs.deckDescriptionInput, deck.description);
        refs.deckActiveCheckbox.checked = Boolean(deck.active);
        refs.deckSummaryChips.innerHTML = buildDeckSummaryChips(deck).map((chip) => `<span class="tag-chip">${escapeHtml(chip)}</span>`).join("");
        refs.deckSummaryHelp.textContent = deck.usesGeneratedPreset
            ? "This deck still mirrors the legacy generated preset list. The first composition change will convert it into an explicit premade deck."
            : "The live game will use this exact card list whenever this premade deck is selected.";

        const composition = getDeckCompositionEntries(deck);
        if (composition.length === 0) {
            refs.deckCompositionList.innerHTML = `<div class="validation-empty">This deck has no cards yet. Use the catalog on the right to start building it.</div>`;
            return;
        }
        refs.deckCompositionList.innerHTML = composition.map((entry) => `
            <div class="deck-card-row">
                <div class="deck-card-main">
                    <strong>${escapeHtml(entry.card?.name || entry.cardId)}</strong>
                    <div class="card-meta">${escapeHtml(entry.card ? formatCardMeta(entry.card) : "Missing from the current card catalog")}</div>
                </div>
                <div class="dashboard-deck-card-actions">
                    <button class="btn btn-danger btn-sm deck-card-action-btn" type="button" data-remove-deck-card-id="${escapeHtml(entry.cardId)}">Remove</button>
                    <span class="deck-card-count">${entry.count}</span>
                    <button class="btn btn-secondary btn-sm deck-card-action-btn" type="button" data-add-deck-card-id="${escapeHtml(entry.cardId)}">Add</button>
                </div>
            </div>
        `).join("");
    }

    function renderDeckSummary() {
        if (state.editorPage !== "DECKS") {
            return;
        }
        const deck = getSelectedDeck();
        if (!deck) {
            refs.deckSummaryPanel.innerHTML = `<div class="validation-empty">Select a premade deck to review its live configuration.</div>`;
            return;
        }
        const counts = deckTypeCounts(deck.cardIds);
        const elementChips = inferDeckElements(deck.cardIds).length > 0 ? inferDeckElements(deck.cardIds) : deck.elements;
        refs.deckSummaryPanel.innerHTML = `
            <div class="summary-card-shell">
                <div class="summary-top">
                    <div>
                        <h3>${escapeHtml(deck.name || "Unnamed Deck")}</h3>
                        <div class="card-summary-copy">${escapeHtml(deck.id || "missing-id")}</div>
                    </div>
                    <span class="summary-badge">${deck.active ? "Active" : "Inactive"}</span>
                </div>
                <div class="stat-strip">
                    <span class="stat-chip">${deck.cardIds.length} cards</span>
                    <span class="stat-chip">${counts.sieglings} Siegelings</span>
                    <span class="stat-chip">${counts.spells} Strategies</span>
                    <span class="stat-chip">${counts.traps} Deceptions</span>
                </div>
                <div class="summary-tags">
                    ${(elementChips.length > 0
                        ? elementChips.map((element) => `<span class="tag-chip">${escapeHtml(formatEnumLabel(element))}</span>`).join("")
                        : `<span class="tag-chip">No element focus yet</span>`)}
                </div>
            </div>
            <div class="summary-card-shell">
                <div class="section-kicker">Description</div>
                <div class="card-summary-copy">${escapeHtml(deck.description || "No description yet.")}</div>
            </div>
        `;
    }

    function renderDeckCatalog() {
        if (state.editorPage !== "DECKS") {
            return;
        }
        populateSelect(refs.deckCatalogElementFilterSelect, ["ALL", ...(state.metadata?.elements || [])], state.deckCatalogElementFilter, false, { ALL: "All Elements" });
        const filteredCards = getFilteredDeckCatalogCards();
        if (filteredCards.length === 0) {
            refs.deckCatalogList.innerHTML = `<div class="empty-browser">No cards match the current deck-builder search and filters.</div>`;
            return;
        }
        refs.deckCatalogList.innerHTML = filteredCards.map((card) => `
            <div class="card-row ${elementThemeClass(card.element)}">
                <div class="card-row-title">
                    <strong>${escapeHtml(card.name || "Unnamed Card")}</strong>
                    <span class="summary-badge">${escapeHtml(formatEnumLabel(card.cardType))}</span>
                </div>
                <div class="card-meta">${escapeHtml(formatCardMeta(card))}</div>
                <div class="deck-catalog-row-footer">
                    <span class="card-id">${escapeHtml(card.id || "missing-id")}</span>
                    <button class="btn btn-secondary" type="button" data-add-catalog-card-id="${escapeHtml(card.id)}">Add</button>
                </div>
            </div>
        `).join("");
    }

    function renderDeckPreview() {
        if (state.editorPage !== "DECKS") {
            return;
        }
        const deck = getSelectedDeck();
        refs.deckJsonPreview.value = deck ? JSON.stringify(buildExportDeck(deck), null, 2) : "";
    }

    function renderTrainerList() {
        if (state.editorPage !== "TRAINERS") {
            return;
        }
        const trainers = getFilteredTrainers();
        if (trainers.length === 0) {
            refs.trainerList.innerHTML = `<div class="empty-browser">No Siegeknights match the current search and status filter.</div>`;
            return;
        }
        refs.trainerList.innerHTML = trainers.map((trainer) => {
            const activeClass = trainer.id === state.selectedTrainerId ? " active" : "";
            const statusBadge = trainer.active ? "Active" : "Inactive";
            return `
                <div class="card-row ${elementThemeClass(trainer.element)}${activeClass}" data-trainer-id="${escapeHtml(trainer.id)}">
                    <div class="card-row-title">
                        <strong>${escapeHtml(trainer.name || "Unnamed Siegeknight")}</strong>
                        <span class="summary-badge">${escapeHtml(statusBadge)} | ${escapeHtml(trainer.tier || "Tier")}</span>
                    </div>
                    <div class="card-meta">${escapeHtml(`${formatEnumLabel(trainer.rarity)} | ${formatEnumLabel(trainer.element)}${trainer.oncePerGame ? " | Once Per Game" : ""}`)}</div>
                    <div class="card-id">${escapeHtml(trainer.id || "missing-id")}</div>
                </div>
            `;
        }).join("");
    }

    function renderTrainerEditor() {
        if (state.editorPage !== "TRAINERS") {
            return;
        }
        const trainer = getSelectedTrainer();
        refs.emptyTrainerState.classList.toggle("hidden", Boolean(trainer));
        refs.trainerEditorContent.classList.toggle("hidden", !trainer);
        if (!trainer) {
            refs.trainerSummaryPanel.innerHTML = `<div class="validation-empty">Select a Siegeknight to review its live setup.</div>`;
            refs.trainerJsonPreview.value = "";
            return;
        }

        populateSelect(refs.trainerElementSelect, state.metadata?.elements || [], trainer.element);
        populateSelect(refs.trainerRaritySelect, state.metadata?.rarities || [], trainer.rarity);

        setInputValue(refs.trainerIdInput, trainer.id);
        setInputValue(refs.trainerTierInput, trainer.tier);
        setInputValue(refs.trainerNameInput, trainer.name);
        refs.trainerActiveCheckbox.checked = Boolean(trainer.active);
        refs.trainerOncePerGameCheckbox.checked = Boolean(trainer.oncePerGame);
        if (refs.trainerHolographicCheckbox) {
            refs.trainerHolographicCheckbox.checked = Boolean(trainer.holographic);
        }

        renderTrainerAbilityEditor("passive", trainer.passiveAbility, {
            nameInput: refs.trainerPassiveNameInput,
            descriptionInput: refs.trainerPassiveDescriptionInput,
            targetTypeSelect: refs.trainerPassiveTargetTypeSelect,
            targetRowField: refs.trainerPassiveTargetRowField,
            targetRowSelect: refs.trainerPassiveTargetRowSelect,
            effectTypeSelect: refs.trainerPassiveEffectTypeSelect,
            effectValueInput: refs.trainerPassiveEffectValueInput,
            requiredElementSelect: refs.trainerPassiveRequiredElementSelect,
            requiredEnergyInput: refs.trainerPassiveRequiredEnergyInput,
            requiredReactionSelect: refs.trainerPassiveRequiredReactionSelect,
            targetHelper: refs.trainerPassiveTargetHelper,
            effectHelper: refs.trainerPassiveEffectHelper
        });
        renderTrainerAbilityEditor("active", trainer.activeAbility, {
            nameInput: refs.trainerActiveNameInput,
            descriptionInput: refs.trainerActiveDescriptionInput,
            targetTypeSelect: refs.trainerActiveTargetTypeSelect,
            targetRowField: refs.trainerActiveTargetRowField,
            targetRowSelect: refs.trainerActiveTargetRowSelect,
            effectTypeSelect: refs.trainerActiveEffectTypeSelect,
            effectValueInput: refs.trainerActiveEffectValueInput,
            requiredElementSelect: refs.trainerActiveRequiredElementSelect,
            requiredEnergyInput: refs.trainerActiveRequiredEnergyInput,
            requiredReactionSelect: refs.trainerActiveRequiredReactionSelect,
            targetHelper: refs.trainerActiveTargetHelper,
            effectHelper: refs.trainerActiveEffectHelper
        });

        renderTrainerArtControls(trainer);
    }

    function renderTrainerAbilityEditor(kind, ability, refsForAbility) {
        populateSelect(refsForAbility.targetTypeSelect, state.metadata?.targetTypes || [], ability.targetType);
        populateSelect(refsForAbility.targetRowSelect, state.metadata?.rows || [], ability.targetRow || firstMetaValue("rows", "FRONT"));
        populateSelect(
            refsForAbility.effectTypeSelect,
            (state.metadata?.effectTypes || []).map((effect) => effect.key),
            ability.effectType,
            false,
            effectLabelMap()
        );
        populateSelect(refsForAbility.requiredElementSelect, ["", ...(state.metadata?.elements || [])], ability.requiredElement, true);
        populateSelect(refsForAbility.requiredReactionSelect, ["", ...(state.metadata?.reactions || [])], ability.requiredReaction, true);

        syncTrainerAbilityAutoDescription(kind, ability, refsForAbility);

        setInputValue(refsForAbility.nameInput, ability.name);
        setInputValue(refsForAbility.descriptionInput, ability.description);
        setInputValue(refsForAbility.effectValueInput, ability.effectValue);
        setInputValue(refsForAbility.requiredEnergyInput, ability.requiredEnergy);

        const targetRule = getTargetRule(ability.targetType);
        refsForAbility.targetRowField.classList.toggle("hidden", !targetRule.requiresRow);
        refsForAbility.targetHelper.textContent = buildTargetHelperText(ability, targetRule);
        refsForAbility.effectHelper.textContent = buildEffectHelperText(ability.effectType);
    }

    function syncTrainerAbilityAutoDescription(kind, ability, refsForAbility) {
        if (kind !== "passive" || !ability || !refsForAbility.descriptionInput) {
            if (refsForAbility.descriptionInput) {
                refsForAbility.descriptionInput.dataset.autoDescription = "";
            }
            return;
        }
        const trainer = getSelectedTrainer();
        const generated = buildAutoTrainerPassiveDescription(ability, trainer);
        const previousGenerated = refsForAbility.descriptionInput.dataset.autoDescription || "";
        const current = ability.description || "";
        if (!generated) {
            refsForAbility.descriptionInput.dataset.autoDescription = "";
            if (current === previousGenerated) {
                ability.description = "";
            }
            return;
        }
        refsForAbility.descriptionInput.dataset.autoDescription = generated;
        if (!current.trim() || current === previousGenerated) {
            ability.description = generated;
        }
    }

    function renderTrainerSummary() {
        if (state.editorPage !== "TRAINERS") {
            return;
        }
        const trainer = getSelectedTrainer();
        if (!trainer) {
            refs.trainerSummaryPanel.innerHTML = `<div class="validation-empty">Select a Siegeknight to see its summary.</div>`;
            return;
        }
        refs.trainerSummaryPanel.innerHTML = `
            <div class="summary-card-shell">
                <div class="summary-top">
                    <div>
                        <h3>${escapeHtml(trainer.name || "Unnamed Siegeknight")}</h3>
                        <div class="card-summary-copy">${escapeHtml(trainer.id || "missing-id")}</div>
                    </div>
                    <span class="summary-badge">${trainer.active ? "Active" : "Inactive"}</span>
                </div>
                <div class="stat-strip">
                    <span class="stat-chip">Tier: ${escapeHtml(trainer.tier || "SiegeKnight")}</span>
                    <span class="stat-chip">Element: ${escapeHtml(formatEnumLabel(trainer.element))}</span>
                    <span class="stat-chip">Rarity: ${escapeHtml(formatEnumLabel(trainer.rarity))}</span>
                    <span class="stat-chip">${trainer.oncePerGame ? "Active is once per game" : "Active can be used each turn"}</span>
                </div>
            </div>
            <div class="summary-ability-list">
                <div class="summary-ability">
                    <strong>Passive: ${escapeHtml(trainer.passiveAbility.name || "Unnamed Passive")}</strong>
                    <div class="card-summary-copy">${escapeHtml(trainer.passiveAbility.description || "No description yet.")}</div>
                    <div class="card-summary-copy">${escapeHtml(describeAbility(trainer.passiveAbility))}</div>
                </div>
                <div class="summary-ability">
                    <strong>Active: ${escapeHtml(trainer.activeAbility.name || "Unnamed Active")}</strong>
                    <div class="card-summary-copy">${escapeHtml(trainer.activeAbility.description || "No description yet.")}</div>
                    <div class="card-summary-copy">${escapeHtml(describeAbility(trainer.activeAbility))}</div>
                </div>
            </div>
        `;
    }

    function renderTrainerPreview() {
        if (state.editorPage !== "TRAINERS") {
            return;
        }
        const trainer = getSelectedTrainer();
        refs.trainerJsonPreview.value = trainer ? JSON.stringify(buildExportTrainer(trainer), null, 2) : "";
    }

    // SiegeKnights reuse the shared card-art fields (cardArtUrl / cardArtMode) and the
    // generic /api/cards/editor/art upload. In-game they render in FULL_CARD mode — the
    // uploaded image is a complete, hand-drawn card that replaces the template — so the
    // editor only offers Default vs Full card art.
    // Inline status shown inside the Custom Art panel so feedback is visible on
    // mobile (the global status bar lives at the top of the page, off-screen here).
    function setTrainerArtStatus(message, tone) {
        const el = refs.trainerArtStatus;
        if (!el) {
            return;
        }
        el.textContent = message || "";
        el.classList.toggle("hidden", !message);
        el.dataset.tone = message ? (tone || "info") : "";
    }

    function bindTrainerArtFieldEvents() {
        refs.trainerArtControls?.addEventListener("change", (event) => {
            const modeInput = event.target.closest('input[name="trainerArtMode"]');
            if (!modeInput) {
                return;
            }
            mutateSelectedTrainer((trainer) => {
                trainer.cardArtMode = normalizeCardArtMode(modeInput.value);
                if (!trainer.cardArtMode) {
                    trainer.cardArtUrl = "";
                }
            });
        });

        refs.trainerArtUrlInput?.addEventListener("input", (event) => {
            mutateSelectedTrainer((trainer) => {
                trainer.cardArtUrl = String(event.target.value || "").trim();
                if (trainer.cardArtUrl && !trainer.cardArtMode) {
                    trainer.cardArtMode = "FULL_CARD";
                }
                if (!trainer.cardArtUrl) {
                    trainer.cardArtMode = "";
                }
            });
        });

        refs.clearTrainerArtBtn?.addEventListener("click", () => {
            mutateSelectedTrainer((trainer) => {
                trainer.cardArtUrl = "";
                trainer.cardArtMode = "";
                trainer.cardArtOffsetX = 0;
                trainer.cardArtOffsetY = 0;
                trainer.cardArtScale = 1;
                trainer.cardArtRotation = 0;
            });
            if (refs.trainerArtFileInput) {
                refs.trainerArtFileInput.value = "";
            }
            setTrainerArtStatus("");
        });

        refs.trainerArtScaleInput?.addEventListener("input", (event) => {
            mutateSelectedTrainer((trainer) => {
                trainer.cardArtScale = clampCardArtScale(event.target.value);
            });
        });

        refs.trainerArtRotationInput?.addEventListener("input", (event) => {
            mutateSelectedTrainer((trainer) => {
                trainer.cardArtRotation = clampCardArtRotation(event.target.value);
            });
        });

        refs.trainerArtScaleNumber?.addEventListener("input", (event) => {
            mutateSelectedTrainer((trainer) => {
                trainer.cardArtScale = clampCardArtScale(event.target.value);
            });
        });

        refs.trainerArtScaleNumber?.addEventListener("change", (event) => {
            event.target.value = formatCardArtScaleValue(event.target.value);
        });

        refs.trainerArtRotationNumber?.addEventListener("input", (event) => {
            mutateSelectedTrainer((trainer) => {
                trainer.cardArtRotation = clampCardArtRotation(event.target.value);
            });
        });

        refs.trainerArtRotationNumber?.addEventListener("change", (event) => {
            event.target.value = String(Math.round(clampCardArtRotation(event.target.value)));
        });

        refs.resetTrainerArtTransformBtn?.addEventListener("click", () => {
            mutateSelectedTrainer((trainer) => {
                trainer.cardArtOffsetX = 0;
                trainer.cardArtOffsetY = 0;
                trainer.cardArtScale = 1;
                trainer.cardArtRotation = 0;
            });
        });

        refs.trainerArtFileInput?.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                return;
            }
            const trainer = getSelectedTrainer();
            const trainerId = String(trainer?.id || "").trim();
            if (!trainerId) {
                setStatus("Set a Siegeknight id before uploading art.", "error");
                setTrainerArtStatus("Set a Siegeknight ID (in Identity, above) before uploading art.", "error");
                event.target.value = "";
                renderStatus();
                return;
            }
            if (state.liveEditingEnabled && !state.auth?.canEdit) {
                setStatus("Sign in under Live Publishing before uploading SiegeKnight art.", "error");
                setTrainerArtStatus("Sign in under Live Publishing (top of page) before uploading art.", "error");
                event.target.value = "";
                renderStatus();
                return;
            }
            mutateSelectedTrainer((selected) => {
                if (!selected.cardArtMode) {
                    selected.cardArtMode = "FULL_CARD";
                }
            });
            setStatus("Uploading SiegeKnight art...", "warning");
            setTrainerArtStatus("Uploading art…", "warning");
            renderStatus();
            try {
                const payload = await uploadCardArtFile(trainerId, file);
                const hostedUrl = String(payload?.url || "").trim();
                if (!hostedUrl) {
                    throw new Error("Upload finished but the server did not return an image URL.");
                }
                mutateTrainerById(trainerId, (selected) => {
                    selected.cardArtUrl = hostedUrl;
                    selected.cardArtMode = normalizeCardArtMode(selected.cardArtMode) || "FULL_CARD";
                }, { render: false });
                const applyMsg = state.liveEditingEnabled
                    ? `Uploaded ✓ — now click Publish Live Changes to apply.`
                    : `Uploaded ✓ — now click Save To Project File to apply.`;
                setStatus(`Uploaded art for ${trainerId}. ${applyMsg}`, "success");
                setTrainerArtStatus(applyMsg, "success");
            } catch (error) {
                const detail = error?.message || "Unable to upload SiegeKnight art.";
                setStatus(detail, "error");
                // Image upload needs a Firebase Storage bucket. If it's unavailable,
                // pasting a hosted /img/knights/... path is the reliable path.
                setTrainerArtStatus(
                    `Upload failed: ${detail} You can instead paste a hosted path (e.g. /img/knights/${trainerId}-full-card.png) into Art URL below.`,
                    "error"
                );
            } finally {
                event.target.value = "";
                renderAll();
            }
        });
    }

    function setTrainerArtMeta(message, tone) {
        const el = refs.trainerArtMeta;
        if (!el) {
            return;
        }
        el.textContent = message || "";
        el.classList.toggle("hidden", !message);
        el.dataset.tone = message ? (tone || "info") : "";
    }

    let trainerArtDragController = null;

    function teardownTrainerArtDrag() {
        trainerArtDragController?.abort();
        trainerArtDragController = null;
    }

    // Drag the preview art to reposition it (updates cardArtOffsetX/Y in px),
    // mirroring the creature card-art crop interaction.
    function setupTrainerArtDrag(trainer, img, portrait) {
        if (!img || !hasCustomCardArt(trainer)) {
            return;
        }
        trainerArtDragController = new AbortController();
        const { signal } = trainerArtDragController;
        let drag = null;
        const finish = (event) => {
            if (!drag) {
                return;
            }
            portrait.classList.remove("is-art-dragging");
            if (img.hasPointerCapture?.(event.pointerId)) {
                img.releasePointerCapture(event.pointerId);
            }
            const nx = drag.ox + (event.clientX - drag.cx);
            const ny = drag.oy + (event.clientY - drag.cy);
            drag = null;
            mutateSelectedTrainer((t) => {
                t.cardArtOffsetX = nx;
                t.cardArtOffsetY = ny;
            });
        };
        img.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            drag = {
                cx: event.clientX,
                cy: event.clientY,
                ox: toNumber(trainer.cardArtOffsetX, 0),
                oy: toNumber(trainer.cardArtOffsetY, 0)
            };
            portrait.classList.add("is-art-dragging");
            img.setPointerCapture?.(event.pointerId);
        }, { signal });
        img.addEventListener("pointermove", (event) => {
            if (!drag) {
                return;
            }
            event.preventDefault();
            const preview = {
                ...trainer,
                cardArtOffsetX: drag.ox + (event.clientX - drag.cx),
                cardArtOffsetY: drag.oy + (event.clientY - drag.cy)
            };
            const style = buildCardArtTransformStyle(preview);
            if (style) {
                img.setAttribute("style", style);
            } else {
                img.removeAttribute("style");
            }
        }, { signal });
        img.addEventListener("pointerup", finish, { signal });
        img.addEventListener("pointercancel", finish, { signal });
    }

    function renderTrainerArtControls(trainer) {
        const stage = refs.trainerArtStage;
        if (!stage) {
            return;
        }
        const url = String(trainer?.cardArtUrl || "").trim();
        const mode = normalizeCardArtMode(trainer?.cardArtMode);
        const hasArt = Boolean(url && mode);

        // Clear stale upload feedback when switching between SiegeKnights.
        if (state._lastArtTrainerId !== trainer?.id) {
            state._lastArtTrainerId = trainer?.id;
            setTrainerArtStatus("");
        }

        const radios = refs.trainerArtControls?.querySelectorAll('input[name="trainerArtMode"]') || [];
        radios.forEach((radio) => {
            radio.checked = radio.value === mode;
        });

        if (refs.trainerArtUrlInput && document.activeElement !== refs.trainerArtUrlInput) {
            refs.trainerArtUrlInput.value = url;
        }

        // Crop & scale controls (only meaningful once there's art).
        refs.trainerArtTransformControls?.classList.toggle("hidden", !hasArt);
        if (hasArt) {
            const scale = clampCardArtScale(trainer?.cardArtScale ?? 1);
            const rotation = clampCardArtRotation(trainer?.cardArtRotation ?? 0);
            if (refs.trainerArtScaleInput && document.activeElement !== refs.trainerArtScaleInput) {
                refs.trainerArtScaleInput.value = String(scale);
            }
            if (refs.trainerArtRotationInput && document.activeElement !== refs.trainerArtRotationInput) {
                refs.trainerArtRotationInput.value = String(rotation);
            }
            if (refs.trainerArtScaleNumber && document.activeElement !== refs.trainerArtScaleNumber) {
                refs.trainerArtScaleNumber.value = formatCardArtScaleValue(scale);
            }
            if (refs.trainerArtRotationNumber && document.activeElement !== refs.trainerArtRotationNumber) {
                refs.trainerArtRotationNumber.value = String(Math.round(rotation));
            }
        }

        teardownTrainerArtDrag();
        stage.innerHTML = "";
        const isOverlay = mode === "OVERLAY";
        const portrait = document.createElement("div");
        portrait.className = isOverlay ? "trainer-art-portrait is-overlay" : "trainer-art-portrait";
        if (url) {
            const img = document.createElement("img");
            img.className = "trainer-art-full-img";
            img.alt = "";
            const transformStyle = buildCardArtTransformStyle(trainer);
            if (transformStyle) {
                img.setAttribute("style", transformStyle);
            }
            img.onload = () => {
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                if (!w || !h) {
                    setTrainerArtMeta("");
                    return;
                }
                const ratio = w / h;
                const goodFit = ratio >= 0.66 && ratio <= 0.77; // ~5:7 portrait
                const target = isOverlay ? "art window" : "card";
                setTrainerArtMeta(
                    goodFit
                        ? `${w}×${h} · good 5:7 fit — fills the ${target} with no cropping.`
                        : `${w}×${h} · ${ratio > 5 / 7 ? "wider" : "taller"} than a 5:7 ${target}, so it's cropped to fit. Drag the art and use Scale below to frame it.`,
                    goodFit ? "ok" : "warn"
                );
                // Clear any stale "could not load" error now that a good image rendered.
                if (refs.trainerArtStatus?.dataset.tone === "error") {
                    setTrainerArtStatus("");
                }
            };
            img.onerror = () => {
                setTrainerArtMeta("Could not load this image — check the URL/path is hosted and correct.", "warn");
                setTrainerArtStatus("Preview could not load that image. Use a hosted https:// URL or a deployed /img/... path.", "error");
            };
            img.src = url;
            if (isOverlay) {
                // Art fills an inset window that clips it to the frame, then the
                // template is drawn on top — matching the in-game overlay render
                // (transparent window + caption box, nothing outside the border).
                const window_ = document.createElement("div");
                window_.className = "trainer-art-overlay-window";
                window_.appendChild(img);
                portrait.appendChild(window_);
                const template = document.createElement("div");
                template.className = "trainer-art-template";
                template.setAttribute("aria-hidden", "true");
                portrait.appendChild(template);
            } else {
                portrait.appendChild(img);
            }
            setupTrainerArtDrag(trainer, img, portrait);
        } else {
            setTrainerArtMeta("");
            const placeholder = document.createElement("div");
            placeholder.className = "trainer-art-placeholder";
            placeholder.textContent = "No custom art yet. Upload a full SiegeKnight card image or paste a hosted URL/path.";
            portrait.appendChild(placeholder);
        }
        stage.appendChild(portrait);
    }

    function renderLiveElementsPanel() {
        if (state.editorPage !== "LIVE_ELEMENTS") {
            return;
        }
        if (!state.liveElements.length) {
            state.liveElements = defaultLiveElements();
        }
        refs.liveElementToggles.innerHTML = state.liveElements.map((row, index) => `
            <label class="toggle-field">
                <input type="checkbox" data-live-element-index="${index}" ${row.active !== false ? "checked" : ""}>
                <span>${escapeHtml(formatEnumLabel(row.element))} — ${escapeHtml(row.element)}</span>
            </label>
        `).join("");
        refs.liveElementsJsonPreview.value = JSON.stringify({
            liveElements: {
                elements: state.liveElements.map((row) => ({
                    element: row.element,
                    active: row.active !== false
                }))
            }
        }, null, 2);
    }

    function renderPreview() {
        refs.jsonPreviewMode.value = state.previewMode;
        if (state.previewMode === "card") {
            const card = getSelectedCard();
            refs.jsonPreview.value = card ? JSON.stringify(buildExportCard(card), null, 2) : "";
            return;
        }
        refs.jsonPreview.value = JSON.stringify(buildExportData(), null, 2);
    }

    function renderValidation() {
        const cardIssues = state.validation.filter((issue) => issue.scope === "cards");
        const deckIssues = state.validation.filter((issue) => issue.scope === "decks");
        const trainerIssues = state.validation.filter((issue) => issue.scope === "trainers");

        if (cardIssues.length === 0) {
            refs.validationList.innerHTML = `<div class="validation-empty">No validation issues right now.</div>`;
        } else {
            refs.validationList.innerHTML = cardIssues.map((issue) => `
                <div class="validation-item ${issue.severity}">
                    <span class="validation-severity">${escapeHtml(issue.severity)}</span>
                    <div>${escapeHtml(issue.message)}</div>
                </div>
            `).join("");
        }

        if (deckIssues.length === 0) {
            refs.deckValidationList.innerHTML = `<div class="validation-empty">No deck validation issues right now.</div>`;
        } else {
            refs.deckValidationList.innerHTML = deckIssues.map((issue) => `
                <div class="validation-item ${issue.severity}">
                    <span class="validation-severity">${escapeHtml(issue.severity)}</span>
                    <div>${escapeHtml(issue.message)}</div>
                </div>
            `).join("");
        }

        if (trainerIssues.length === 0) {
            refs.trainerValidationList.innerHTML = `<div class="validation-empty">No Siegeknight validation issues right now.</div>`;
        } else {
            refs.trainerValidationList.innerHTML = trainerIssues.map((issue) => `
                <div class="validation-item ${issue.severity}">
                    <span class="validation-severity">${escapeHtml(issue.severity)}</span>
                    <div>${escapeHtml(issue.message)}</div>
                </div>
            `).join("");
        }

        const liveIssues = state.validation.filter((issue) => issue.scope === "liveElements");
        if (liveIssues.length === 0) {
            refs.liveElementValidationList.innerHTML = `<div class="validation-empty">No live roster issues.</div>`;
        } else {
            refs.liveElementValidationList.innerHTML = liveIssues.map((item) => `
                <div class="validation-item ${item.severity}">
                    <span class="validation-severity">${escapeHtml(item.severity)}</span>
                    <div>${escapeHtml(item.message)}</div>
                </div>
            `).join("");
        }
    }

    function renderButtons() {
        const hasCard = Boolean(getSelectedCard());
        const hasAbility = Boolean(getSelectedAbility());
        const hasDeck = Boolean(getSelectedDeck());
        const hasTrainer = Boolean(getSelectedTrainer());
        const hasErrors = state.validation.some((issue) => issue.severity === "error");
        const selectedCard = getSelectedCard();
        const canEditMultipleAbilities = selectedCard?.cardType !== "SIEGLING";
        refs.saveProjectBtn.textContent = state.liveEditingEnabled ? "Publish Live Changes" : "Save To Project File";
        refs.newSieglingBtn.classList.toggle("hidden", state.editorPage !== "SIEGLING");
        refs.newSpellBtn.classList.toggle("hidden", state.editorPage !== "ACTION");
        refs.newTrapBtn.classList.toggle("hidden", state.editorPage !== "ACTION");
        refs.newTrainerBtn.classList.toggle("hidden", state.editorPage !== "TRAINERS");
        if (refs.deletePoolMoveBtn) {
            const poolMove = findMoveById(state.selectedMoveId);
            refs.deletePoolMoveBtn.disabled = state.editorPage !== "MOVES_POOL" || state.movesPoolIsNewDraft || !poolMove;
        }
        refs.duplicateCardBtn.disabled = !hasCard;
        refs.deleteCardBtn.disabled = !hasCard;
        refs.addAbilityBtn.disabled = !hasCard || !canEditMultipleAbilities;
        refs.duplicateAbilityBtn.disabled = !hasAbility || !canEditMultipleAbilities;
        refs.deleteAbilityBtn.disabled = !hasAbility || !canEditMultipleAbilities
            || (getSelectedCard()?.abilities?.length ?? 0) <= 1;
        const sieg = selectedCard?.cardType === "SIEGLING";
        if (refs.newMoveBtn) {
            refs.newMoveBtn.disabled = !sieg;
        }
        if (refs.openMovePickerBtn) {
            refs.openMovePickerBtn.disabled = !sieg || (selectedCard?.moveIds?.length ?? 0) >= 5;
        }
        refs.duplicateDeckBtn.disabled = !hasDeck;
        refs.deleteDeckBtn.disabled = !hasDeck;
        refs.clearDeckCardsBtn.disabled = !hasDeck;
        refs.duplicateTrainerBtn.disabled = !hasTrainer;
        const saveDisabled = !canSaveCurrentData() || (!state.liveEditingEnabled && hasErrors) || !state.dirty;
        refs.saveProjectBtn.disabled = saveDisabled;
        refs.saveProjectBtn.title = saveDisabled ? describeSaveButtonState(hasErrors) : "";
    }

    function describeSaveButtonState(hasErrors) {
        if (!state.dirty) {
            return "No unsaved changes yet.";
        }
        if (!canSaveCurrentData()) {
            return saveUnavailableMessage();
        }
        if (!state.liveEditingEnabled && hasErrors) {
            return "Fix validation errors before saving to the project file.";
        }
        return "";
    }

    function renderCardIdOptions() {
        refs.cardIdOptions.innerHTML = state.cards
            .filter((card) => card.cardType === "SIEGLING")
            .map((card) => `<option value="${escapeHtml(card.id)}">${escapeHtml(card.name)}</option>`)
            .join("");
    }

    function getFilteredCards() {
        const search = state.search.trim().toLowerCase();
        return getPageCards().filter((card) => {
            const elementMatch = state.elementFilter === "ALL" || card.element === state.elementFilter;
            const searchMatch = !search
                || card.name.toLowerCase().includes(search)
                || card.id.toLowerCase().includes(search);
            return elementMatch && searchMatch;
        });
    }

    function getPageCards() {
        return state.cards.filter((card) => matchesEditorPage(card));
    }

    function matchesEditorPage(card) {
        if (!card) {
            return false;
        }
        if (state.editorPage === "SIEGLING") {
            return card.cardType === "SIEGLING";
        }
        if (state.editorPage !== "ACTION") {
            return false;
        }
        return card.cardType !== "SIEGLING"
            && (state.actionTypeFilter === "ALL" || card.cardType === state.actionTypeFilter);
    }

    function getFilteredDecks() {
        const search = state.deckSearch.trim().toLowerCase();
        return state.decks.filter((deck) => {
            const statusMatch = state.deckStatusFilter === "ALL"
                || (state.deckStatusFilter === "ACTIVE" && deck.active)
                || (state.deckStatusFilter === "INACTIVE" && !deck.active);
            const searchMatch = !search
                || deck.name.toLowerCase().includes(search)
                || deck.id.toLowerCase().includes(search);
            return statusMatch && searchMatch;
        });
    }

    function getFilteredTrainers() {
        const search = state.trainerSearch.trim().toLowerCase();
        return state.trainers.filter((trainer) => {
            const statusMatch = state.trainerStatusFilter === "ALL"
                || (state.trainerStatusFilter === "ACTIVE" && trainer.active)
                || (state.trainerStatusFilter === "INACTIVE" && !trainer.active);
            const searchMatch = !search
                || trainer.name.toLowerCase().includes(search)
                || trainer.id.toLowerCase().includes(search);
            return statusMatch && searchMatch;
        });
    }

    function getFilteredDeckCatalogCards() {
        const search = state.deckCatalogSearch.trim().toLowerCase();
        return state.cards.filter((card) => {
            const elementMatch = state.deckCatalogElementFilter === "ALL" || card.element === state.deckCatalogElementFilter;
            const typeMatch = state.deckCatalogTypeFilter === "ALL" || card.cardType === state.deckCatalogTypeFilter;
            const searchMatch = !search
                || card.name.toLowerCase().includes(search)
                || card.id.toLowerCase().includes(search);
            return elementMatch && typeMatch && searchMatch;
        });
    }

    function getSelectedCard() {
        return state.cards.find((card) => card.id === state.selectedCardId) || null;
    }

    function getSelectedDeck() {
        return state.decks.find((deck) => deck.id === state.selectedDeckId) || null;
    }

    function getSelectedTrainer() {
        return state.trainers.find((trainer) => trainer.id === state.selectedTrainerId) || null;
    }

    function getSelectedTrainerAbility(kind) {
        const trainer = getSelectedTrainer();
        if (!trainer) {
            return null;
        }
        return kind === "active" ? trainer.activeAbility : trainer.passiveAbility;
    }

    function getSelectedAbility() {
        const card = getSelectedCard();
        if (!card || card.cardType === "SIEGLING") {
            return null;
        }
        if (card.abilities.length === 0) {
            return null;
        }
        state.selectedAbilityIndex = Math.max(0, Math.min(state.selectedAbilityIndex, card.abilities.length - 1));
        return card.abilities[state.selectedAbilityIndex];
    }

    function findCardById(cardId) {
        return state.cards.find((card) => card.id === cardId) || null;
    }

    function findTrainerById(trainerId) {
        return state.trainers.find((trainer) => trainer.id === trainerId) || null;
    }

    function countsById(cardIds) {
        return (cardIds || []).reduce((counts, cardId) => {
            counts[cardId] = (counts[cardId] || 0) + 1;
            return counts;
        }, {});
    }

    function getDeckCompositionEntries(deck) {
        return Object.entries(countsById(deck?.cardIds || []))
            .map(([cardId, count]) => ({
                cardId,
                count,
                card: findCardById(cardId)
            }))
            .sort((left, right) => {
                const leftName = left.card?.name || left.cardId;
                const rightName = right.card?.name || right.cardId;
                return leftName.localeCompare(rightName);
            });
    }

    function deckTypeCounts(cardIds) {
        return (cardIds || []).reduce((counts, cardId) => {
            const card = findCardById(cardId);
            if (!card) {
                return counts;
            }
            if (card.cardType === "SIEGLING") {
                counts.sieglings += 1;
            } else if (card.cardType === "SPELL") {
                counts.spells += 1;
            } else if (card.cardType === "TRAP") {
                counts.traps += 1;
            }
            return counts;
        }, { sieglings: 0, spells: 0, traps: 0 });
    }

    function inferDeckElements(cardIds) {
        return Array.from(new Set((cardIds || [])
            .map((cardId) => findCardById(cardId)?.element || "")
            .filter((element) => element && element !== "NEUTRAL")));
    }

    /** First element for theming: inferred from cards, then stored deck.elements, then recommended trainer. */
    function primaryDeckElement(deck) {
        if (!deck) {
            return "NEUTRAL";
        }
        const inferred = inferDeckElements(deck.cardIds);
        if (inferred.length > 0) {
            return inferred[0];
        }
        const stored = Array.isArray(deck.elements) ? deck.elements.filter(Boolean) : [];
        if (stored.length > 0) {
            return stored[0];
        }
        if (deck.recommendedTrainerId) {
            const tr = findTrainerById(deck.recommendedTrainerId);
            if (tr?.element) {
                return tr.element;
            }
        }
        return "NEUTRAL";
    }

    function buildDeckSummaryChips(deck) {
        const counts = deckTypeCounts(deck.cardIds);
        const elements = inferDeckElements(deck.cardIds).length > 0 ? inferDeckElements(deck.cardIds) : deck.elements;
        return [
            deck.active ? "Active in loadout" : "Hidden from loadout",
            `${deck.cardIds.length} cards`,
            `${counts.sieglings} Siegelings`,
            `${counts.spells} Strategies`,
            `${counts.traps} Deceptions`,
            elements.length > 0 ? elements.map(formatEnumLabel).join(" / ") : "No element focus"
        ];
    }

    function validateDashboard() {
        const issues = [];
        const ids = new Map();
        state.cards.forEach((card) => {
            const trimmedId = card.id.trim();
            if (!trimmedId) {
                issues.push(issue("error", `${card.name || "A card"} is missing an id.`));
            } else {
                ids.set(trimmedId, (ids.get(trimmedId) || 0) + 1);
            }
            if (!card.name.trim()) {
                issues.push(issue("error", `${trimmedId || "A card"} is missing a name.`));
            }
            if (!card.element) {
                issues.push(issue("error", `${trimmedId || card.name || "A card"} is missing an element.`));
            }
            if (!card.rarity) {
                issues.push(issue("error", `${trimmedId || card.name || "A card"} is missing a rarity.`));
            }
            const cardArtUrl = String(card.cardArtUrl || "").trim();
            if (cardArtUrl.startsWith("data:")) {
                issues.push(issue(
                    "error",
                    `${trimmedId || card.name || "A card"} still uses an embedded image upload. Use Upload Image again or set cardArtUrl to a path like /assets/cards/${trimmedId || "example"}.png before publishing.`
                ));
            } else if (cardArtUrl.length > 2048) {
                issues.push(issue("error", `${trimmedId || card.name || "A card"} cardArtUrl is too long for Firestore.`));
            } else if (state.liveEditingEnabled && isProjectRelativeCardArtPath(cardArtUrl)) {
                issues.push(issue(
                    "error",
                    `${trimmedId || card.name || "A card"} uses ${cardArtUrl}, which is not hosted for the live game. Use Upload Image so art is stored in cloud storage, then publish again.`
                ));
            } else if (card.cardArtMode && !cardArtPathMatchesCardId(trimmedId, cardArtUrl)) {
                issues.push(issue(
                    "warn",
                    `${trimmedId || card.name || "A card"} art path "${cardArtUrl}" does not include the card id "${trimmedId}". Use Upload Image or ${defaultCardArtPath(trimmedId) || "/assets/cards/<card-id>.png"}.`
                ));
            }
            if (card.cardType === "SIEGLING") {
                if (card.health <= 0) {
                    issues.push(issue("error", `${trimmedId || card.name || "A card"} must have health above 0.`));
                }
                if (card.speed < 0) {
                    issues.push(issue("error", `${trimmedId || card.name || "A card"} cannot have negative speed.`));
                }
                if (card.notches.length === 0) {
                    issues.push(issue("warn", `${trimmedId || card.name || "A card"} has no notches yet.`));
                }
                if (card.evolvesFromId.trim() && card.costAmount <= 0) {
                    issues.push(issue("warn", `${trimmedId || card.name || "A card"} evolves from another card but has no cost amount.`));
                }
                if (card.costAmount > 0 && !card.costElement) {
                    issues.push(issue("error", `${trimmedId || card.name || "A card"} needs a cost element when cost amount is above 0.`));
                }
                const mids = card.moveIds || [];
                if (mids.length === 0) {
                    issues.push(issue("error", `${trimmedId || card.name || "A Siegeling"} needs at least one move id from the shared moves pool.`));
                }
                const seenMid = new Set();
                mids.forEach((mid) => {
                    if (seenMid.has(mid)) {
                        issues.push(issue("error", `${trimmedId || card.name || "A Siegeling"} lists move "${mid}" more than once.`));
                    }
                    seenMid.add(mid);
                    if (!findMoveById(mid)) {
                        issues.push(issue("error", `${trimmedId || card.name || "A Siegeling"} references unknown move id "${mid}".`));
                    }
                });
            } else if (card.cardType === "SPELL") {
                if (card.costAmount > 0 && !card.costElement) {
                    issues.push(issue("error", `${trimmedId || card.name || "A spell"} needs a play cost element when cost amount is above 0.`));
                }
                if (card.requiredComboSize < 0) {
                    issues.push(issue("error", `${trimmedId || card.name || "A spell"} cannot have a negative combo size.`));
                }
                if (card.requiredComboSize > 0 && !card.requiredComboSignature.trim()) {
                    issues.push(issue("warn", `${trimmedId || card.name || "A spell"} has a combo size but no combo signature.`));
                }
            } else if (card.cardType === "TRAP") {
                if (card.trapBucketAmount <= 0) {
                    issues.push(issue("error", `${trimmedId || card.name || "A trap"} needs a trigger amount above 0.`));
                }
                if (!card.trapBucketElement) {
                    issues.push(issue("error", `${trimmedId || card.name || "A trap"} needs a trigger element.`));
                }
            }
            if (card.cardType !== "SIEGLING") {
                if (!card.abilities.length) {
                    issues.push(issue("error", `${trimmedId || card.name || "A card"} needs at least one ability.`));
                }
                if (card.abilities.length !== 1) {
                    issues.push(issue("error", `${trimmedId || card.name || "An action card"} must have exactly one effect ability.`));
                }
                card.abilities.forEach((ability, index) => {
                    const label = `${trimmedId || card.name || "A card"} ability ${index + 1}`;
                    if (!ability.name.trim()) {
                        issues.push(issue("error", `${label} is missing a name.`));
                    }
                    if (!ability.description.trim()) {
                        issues.push(issue("warn", `${label} has no description yet.`));
                    }
                    if (!ability.targetType) {
                        issues.push(issue("error", `${label} is missing a target type.`));
                    }
                    if (getTargetRule(ability.targetType).requiresRow && !ability.targetRow) {
                        issues.push(issue("error", `${label} needs a target row because it targets a row.`));
                    }
                    if (!ability.effectType) {
                        issues.push(issue("error", `${label} is missing an effect type.`));
                    }
                    if (!effectByKey()[ability.effectType]) {
                        issues.push(issue("error", `${label} uses unsupported effect type ${ability.effectType}.`));
                    }
                    if (ability.requiredEnergy < 0) {
                        issues.push(issue("error", `${label} cannot require negative energy.`));
                    }
                    if (ability.requiredEnergy > 0 && !ability.requiredElement && !ability.requiredReaction) {
                        issues.push(issue("warn", `${label} spends energy but has no required element or reaction set.`));
                    }
                });
            }
        });

        const poolIdCounts = new Map();
        (state.movesPool || []).forEach((m) => {
            const moveId = String(m?.id || "").trim();
            if (!moveId) {
                issues.push(issue("error", "A move in the shared pool is missing an id."));
                return;
            }
            poolIdCounts.set(moveId, (poolIdCounts.get(moveId) || 0) + 1);
            if (!String(m.name || "").trim()) {
                issues.push(issue("error", `Move '${moveId}' needs a name.`));
            }
            if (m.effectType && !effectByKey()[m.effectType]) {
                issues.push(issue("error", `Move '${moveId}' uses unsupported effect type ${m.effectType}.`));
            }
        });
        poolIdCounts.forEach((count, moveId) => {
            if (count > 1) {
                issues.push(issue("error", `Move id '${moveId}' is duplicated ${count} times in the moves pool.`));
            }
        });

        ids.forEach((count, id) => {
            if (count > 1) {
                issues.push(issue("error", `Card id '${id}' is duplicated ${count} times.`));
            }
        });

        const trainerIds = new Map();
        const activeTrainers = state.trainers.filter((trainer) => trainer.active);
        state.trainers.forEach((trainer) => {
            const trimmedId = trainer.id.trim();
            if (!trimmedId) {
                issues.push(issue("error", `${trainer.name || "A Siegeknight"} is missing an id.`, "trainers"));
            } else {
                trainerIds.set(trimmedId, (trainerIds.get(trimmedId) || 0) + 1);
            }
            if (!trainer.name.trim()) {
                issues.push(issue("error", `${trimmedId || "A Siegeknight"} is missing a name.`, "trainers"));
            }
            if (!trainer.element) {
                issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} is missing an element.`, "trainers"));
            }
            if (!trainer.rarity) {
                issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} is missing a rarity.`, "trainers"));
            }
            if (!trainer.tier.trim()) {
                issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} is missing a tier.`, "trainers"));
            }
            [
                { label: "passive", ability: trainer.passiveAbility, shouldBePassive: true },
                { label: "active", ability: trainer.activeAbility, shouldBePassive: false }
            ].forEach(({ label, ability, shouldBePassive }) => {
                if (!ability) {
                    issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} needs a ${label} ability.`, "trainers"));
                    return;
                }
                if (!ability.name.trim()) {
                    issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} ${label} ability is missing a name.`, "trainers"));
                }
                if (!ability.description.trim()) {
                    issues.push(issue("warn", `${trimmedId || trainer.name || "A Siegeknight"} ${label} ability has no description yet.`, "trainers"));
                }
                if (!ability.targetType) {
                    issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} ${label} ability needs a target type.`, "trainers"));
                }
                if (getTargetRule(ability.targetType).requiresRow && !ability.targetRow) {
                    issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} ${label} ability needs a target row.`, "trainers"));
                }
                if (!ability.effectType) {
                    issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} ${label} ability needs an effect type.`, "trainers"));
                }
                if (!effectByKey()[ability.effectType]) {
                    issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} ${label} ability uses unsupported effect type ${ability.effectType}.`, "trainers"));
                }
                if (ability.requiredEnergy < 0) {
                    issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} ${label} ability cannot require negative energy.`, "trainers"));
                }
                if (Boolean(ability.passive) !== shouldBePassive) {
                    issues.push(issue("error", `${trimmedId || trainer.name || "A Siegeknight"} ${label} ability has the wrong passive flag.`, "trainers"));
                }
            });
        });

        trainerIds.forEach((count, id) => {
            if (count > 1) {
                issues.push(issue("error", `Siegeknight id '${id}' is duplicated ${count} times.`, "trainers"));
            }
        });
        if (state.trainers.length > 0 && activeTrainers.length === 0) {
            issues.push(issue("error", "Keep at least one Siegeknight active so the live game has a selectable leader.", "trainers"));
        }

        const deckIds = new Map();
        const activeDecks = state.decks.filter((deck) => deck.active);
        state.decks.forEach((deck) => {
            const trimmedId = deck.id.trim();
            if (!trimmedId) {
                issues.push(issue("error", `${deck.name || "A premade deck"} is missing an id.`, "decks"));
            } else {
                deckIds.set(trimmedId, (deckIds.get(trimmedId) || 0) + 1);
            }
            if (!deck.name.trim()) {
                issues.push(issue("error", `${trimmedId || "A premade deck"} is missing a name.`, "decks"));
            }
            if (!deck.recommendedTrainerId) {
                issues.push(issue("error", `${trimmedId || deck.name || "A premade deck"} needs a recommended trainer.`, "decks"));
            } else if (!findTrainerById(deck.recommendedTrainerId)) {
                issues.push(issue("error", `${trimmedId || deck.name || "A premade deck"} uses unknown recommended trainer '${deck.recommendedTrainerId}'.`, "decks"));
            } else if (deck.active && !findTrainerById(deck.recommendedTrainerId)?.active) {
                issues.push(issue("error", `${trimmedId || deck.name || "A premade deck"} is active but points at an inactive recommended Siegeknight.`, "decks"));
            }
            const counts = countsById(deck.cardIds);
            Object.entries(counts).forEach(([cardId, count]) => {
                if (!findCardById(cardId)) {
                    issues.push(issue("error", `${trimmedId || deck.name || "A premade deck"} contains unknown card id '${cardId}'.`, "decks"));
                }
                if (count > (state.metadata?.deckRules?.maxCopies || 3)) {
                    issues.push(issue("error", `${trimmedId || deck.name || "A premade deck"} uses ${count} copies of '${cardId}', above the live max copy limit.`, "decks"));
                }
            });
            if (deck.active && deck.cardIds.length < (state.metadata?.deckRules?.minDeckSize || 30)) {
                issues.push(issue("error", `${trimmedId || deck.name || "A premade deck"} is active but has fewer than ${state.metadata?.deckRules?.minDeckSize || 30} cards.`, "decks"));
            }
            if (deck.active && deck.cardIds.length > 0) {
                const inferredElements = inferDeckElements(deck.cardIds);
                if (inferredElements.length === 0) {
                    issues.push(issue("warn", `${trimmedId || deck.name || "A premade deck"} is active but has no elemental identity yet.`, "decks"));
                }
            }
            if (!deck.active && deck.cardIds.length === 0) {
                issues.push(issue("warn", `${trimmedId || deck.name || "A premade deck"} is inactive and still empty.`, "decks"));
            }
        });

        deckIds.forEach((count, id) => {
            if (count > 1) {
                issues.push(issue("error", `Premade deck id '${id}' is duplicated ${count} times.`, "decks"));
            }
        });
        if (state.decks.length > 0 && activeDecks.length === 0) {
            issues.push(issue("error", "Keep at least one premade deck active so the live game has a preset option.", "decks"));
        }

        const liveNames = new Set(state.liveElements.filter((row) => row.active !== false).map((row) => row.element));
        const activeLiveCount = liveNames.size;
        if (activeLiveCount === 0) {
            issues.push(issue("error", "Keep at least one live element active for the game.", "liveElements"));
        }
        state.decks.forEach((deck) => {
            if (!deck.active) {
                return;
            }
            (deck.elements || []).forEach((el) => {
                if (el && !liveNames.has(el)) {
                    issues.push(issue("error", `Active premade deck '${deck.id.trim() || deck.name}' uses element ${el}, which is off in Live Elements.`, "decks"));
                }
            });
        });
        state.trainers.forEach((trainer) => {
            if (!trainer.active || !trainer.element || trainer.element === "NEUTRAL") {
                return;
            }
            if (!liveNames.has(trainer.element)) {
                issues.push(issue("error", `Active Siegeknight '${trainer.id.trim() || trainer.name}' uses element ${trainer.element}, which is off in Live Elements.`, "trainers"));
            }
        });

        return issues;
    }

    function buildExportData() {
        return {
            cards: state.cards.map((card) => buildExportCard(card)),
            moves: state.movesPool.map((m) => buildExportMove(m)),
            decks: state.decks.map((deck) => buildExportDeck(deck)),
            packs: state.packs.map((pack) => ({ ...pack })),
            trainers: state.trainers.map((trainer) => buildExportTrainer(trainer)),
            liveElements: {
                elements: state.liveElements.map((row) => ({
                    element: row.element,
                    active: row.active !== false
                }))
            }
        };
    }

    function buildExportCard(card) {
        if (card.cardType === "SPELL") {
            const exportedSpell = {
                type: "SPELL",
                id: card.id.trim(),
                name: card.name.trim(),
                element: card.element,
                rarity: card.rarity,
                ability: buildExportAbility(card.abilities[0] || createBlankAbility(card.element))
            };
            if (card.costAmount > 0) {
                exportedSpell.costElement = card.costElement || card.element;
                exportedSpell.costAmount = toNumber(card.costAmount, 0);
            }
            if (card.requiredReaction) {
                exportedSpell.requiredReaction = card.requiredReaction;
            }
            if (card.requiredComboSize > 0) {
                exportedSpell.requiredComboSize = toNumber(card.requiredComboSize, 0);
            }
            if (card.requiredComboSignature.trim()) {
                exportedSpell.requiredComboSignature = card.requiredComboSignature.trim().toUpperCase();
            }
            return appendCardArtExport(exportedSpell, card);
        }

        if (card.cardType === "TRAP") {
            const exportedTrap = {
                type: "TRAP",
                id: card.id.trim(),
                name: card.name.trim(),
                element: card.element,
                rarity: card.rarity,
                ability: buildExportAbility(card.abilities[0] || createBlankAbility(card.element))
            };
            if (card.trapBucketAmount > 0) {
                exportedTrap.trapBucketElement = card.trapBucketElement || card.element;
                exportedTrap.trapBucketAmount = toNumber(card.trapBucketAmount, 0);
            }
            return appendCardArtExport(exportedTrap, card);
        }

        const exported = {
            type: "SIEGLING",
            id: card.id.trim(),
            name: card.name.trim(),
            element: card.element,
            rarity: card.rarity,
            health: toNumber(card.health, 0),
            speed: toNumber(card.speed, 0),
            notches: card.notches.map((notch) => ({
                direction: notch.direction,
                element: notch.element || card.element
            })),
            preferredRow: card.preferredRow,
            moveIds: (card.moveIds || []).map((id) => String(id || "").trim()).filter(Boolean).slice(0, 5)
        };

        if (card.evolvesFromId.trim()) {
            exported.evolvesFromId = card.evolvesFromId.trim();
        }
        if (card.costAmount > 0) {
            exported.costElement = card.costElement || card.element;
            exported.costAmount = toNumber(card.costAmount, 0);
        }

        return appendCardArtExport(exported, card);
    }

    function buildExportDeck(deck) {
        return {
            id: deck.id.trim(),
            name: deck.name.trim(),
            description: deck.description.trim(),
            elements: inferDeckElements(deck.cardIds).length > 0 ? inferDeckElements(deck.cardIds) : deck.elements,
            recommendedTrainerId: deck.recommendedTrainerId,
            active: Boolean(deck.active),
            cardIds: deck.cardIds.map((cardId) => String(cardId || "").trim()).filter(Boolean)
        };
    }

    function buildExportTrainer(trainer) {
        const exported = {
            id: trainer.id.trim(),
            name: trainer.name.trim(),
            element: trainer.element,
            rarity: trainer.rarity,
            tier: trainer.tier.trim(),
            active: Boolean(trainer.active),
            oncePerGame: Boolean(trainer.oncePerGame),
            passiveAbility: { ...buildExportAbility(trainer.passiveAbility || createBlankTrainerPassiveAbility(trainer.element)), passive: true },
            activeAbility: { ...buildExportAbility(trainer.activeAbility || createBlankTrainerActiveAbility(trainer.element)), passive: false }
        };
        return appendCardArtExport(exported, trainer);
    }

    function buildExportAbility(ability) {
        const rule = getTargetRule(ability.targetType);
        const exported = {
            name: ability.name.trim(),
            description: ability.description.trim(),
            targetType: ability.targetType,
            targetCount: rule.fixedTargetCount,
            effectType: ability.effectType,
            effectValue: toNumber(ability.effectValue, 0),
            passive: Boolean(ability.passive),
            requiredEnergy: toNumber(ability.requiredEnergy, 0)
        };

        if (rule.requiresRow && ability.targetRow) {
            exported.targetRow = ability.targetRow;
        }
        if (ability.requiredElement) {
            exported.requiredElement = ability.requiredElement;
        }
        if (ability.requiredReaction) {
            exported.requiredReaction = ability.requiredReaction;
        }
        return exported;
    }

    function buildTargetHelperText(ability, rule) {
        const rowNote = rule.requiresRow
            ? ` Current row: ${formatEnumLabel(ability.targetRow || firstMetaValue("rows", "FRONT"))}.`
            : "";
        const targetCountNote = rule.fixedTargetCount === 0
            ? " Target count is handled automatically for this target type."
            : ` Target count is fixed at ${rule.fixedTargetCount}.`;
        return `${rule.helperText}${rowNote}${targetCountNote}`;
    }

    function buildEffectHelperText(effectType) {
        const effect = effectByKey()[effectType];
        if (!effect) {
            return "Choose an effect type the rules engine understands.";
        }
        const targetHints = Array.isArray(effect.targetHints) && effect.targetHints.length > 0
            ? ` Typical targets: ${effect.targetHints.map(formatEnumLabel).join(", ")}.`
            : "";
        return `${effect.description}${targetHints}`;
    }

    function describeAbility(ability) {
        const pieces = [
            ability.passive ? "Passive" : "Activated",
            `${effectLabel(ability.effectType)} -> ${describeAbilityTarget(ability)}`
        ];
        if (ability.requiredEnergy > 0) {
            if (ability.requiredElement) {
                pieces.push(`Cost ${ability.requiredEnergy} ${formatEnumLabel(ability.requiredElement)}`);
            } else if (ability.requiredReaction) {
                pieces.push(`Needs ${ability.requiredReaction}`);
            } else {
                pieces.push(`Cost ${ability.requiredEnergy} energy`);
            }
        } else if (ability.requiredReaction) {
            pieces.push(`Needs ${ability.requiredReaction}`);
        }
        return pieces.join(" | ");
    }

    function describeAbilityTarget(ability) {
        switch (ability.targetType) {
            case "SINGLE_ENEMY":
                return "1 enemy";
            case "ALL_ENEMIES":
                return "all enemies";
            case "ROW_ENEMIES":
                return `all enemies in ${formatEnumLabel(ability.targetRow || firstMetaValue("rows", "FRONT"))}`;
            case "SINGLE_ALLY":
                return "1 ally";
            case "ALL_ALLIES":
                return "all allies";
            case "ROW_ALLIES":
                return `all allies in ${formatEnumLabel(ability.targetRow || firstMetaValue("rows", "FRONT"))}`;
            case "ROW_SELECT_ENEMIES":
                return "player-selected enemy row";
            case "ROW_SELECT_ALLIES":
                return "player-selected allied row";
            case "ENEMY_PLAYER":
                return "the enemy player";
            case "SELF":
                return "self";
            case "PASSIVE":
                return "passive aura";
            default:
                return ability.targetType || "unknown target";
        }
    }

    function getTargetRule(targetType) {
        const rules = state.metadata?.targetRules || {};
        return rules[targetType] || { requiresRow: false, fixedTargetCount: 0, helperText: "No targeting rule found for this selection." };
    }

    function effectByKey() {
        return Object.fromEntries((state.metadata?.effectTypes || []).map((effect) => [effect.key, effect]));
    }

    function effectLabelMap() {
        return Object.fromEntries((state.metadata?.effectTypes || []).map((effect) => [effect.key, effect.label]));
    }

    function effectLabel(key) {
        return effectLabelMap()[key] || formatEnumLabel(key || "");
    }

    function formatCardMeta(card) {
        if (card.cardType === "SPELL") {
            const details = [
                formatEnumLabel(card.rarity),
                card.requiredComboSize > 0
                    ? `Combo ${card.requiredComboSize}${card.requiredComboSignature ? ` ${card.requiredComboSignature}` : ""}`
                    : `Cost ${card.costAmount || 0} ${formatEnumLabel(card.costElement || card.element)}`
            ];
            if (card.requiredReaction) {
                details.push(`Needs ${formatEnumLabel(card.requiredReaction)}`);
            }
            return details.join(" | ");
        }
        if (card.cardType === "TRAP") {
            return [
                formatEnumLabel(card.rarity),
                `Trigger ${card.trapBucketAmount || 0} ${formatEnumLabel(card.trapBucketElement || card.element)}`,
                `${card.abilities.length} effect`
            ].join(" | ");
        }
        if (card.cardType === "SIEGLING") {
            const n = (card.moveIds || []).length;
            return [
                formatEnumLabel(card.rarity),
                `${n} move${n === 1 ? "" : "s"}`,
                `HP ${card.health}`,
                `SPD ${card.speed}`
            ].join(" | ");
        }
        return [
            formatEnumLabel(card.rarity),
            `${card.abilities.length} ${card.abilities.length === 1 ? "ability" : "abilities"}`,
            `HP ${card.health}`,
            `SPD ${card.speed}`
        ].join(" | ");
    }

    function buildOptionMarkup(values, currentValue, customLabels) {
        return values.map((value) => {
            const selected = value === currentValue ? " selected" : "";
            const label = customLabels?.[value] || formatEnumLabel(value);
            return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
        }).join("");
    }

    function populateSelect(select, values, currentValue, allowBlank, customLabels) {
        const items = allowBlank ? ["", ...values.filter((value) => value !== "")] : values;
        const previous = select.value;
        const optionMarkup = items.map((value) => {
            const label = value === "" ? "None" : (customLabels?.[value] || formatEnumLabel(value));
            return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
        }).join("");
        if (select.dataset.options !== optionMarkup) {
            select.innerHTML = optionMarkup;
            select.dataset.options = optionMarkup;
        }
        const desired = currentValue ?? previous ?? "";
        select.value = items.includes(desired) ? desired : (allowBlank ? "" : items[0] || "");
    }

    function setInputValue(input, value) {
        const desired = value == null ? "" : String(value);
        if (document.activeElement !== input && input.value !== desired) {
            input.value = desired;
        }
    }

    function firstMetaValue(key, fallback) {
        return state.metadata?.[key]?.[0] || fallback;
    }

    function firstEffectKey() {
        return state.metadata?.effectTypes?.[0]?.key || "damage";
    }

    function createUniqueCardId(base) {
        const slugBase = slugify(base || "card");
        let candidate = slugBase;
        let counter = 2;
        const existingIds = new Set(state.cards.map((card) => card.id));
        while (existingIds.has(candidate)) {
            candidate = `${slugBase}-${counter}`;
            counter += 1;
        }
        return candidate;
    }

    function createUniqueDeckId(base) {
        const slugBase = slugify(base || "deck");
        let candidate = slugBase;
        let counter = 2;
        const existingIds = new Set(state.decks.map((deck) => deck.id));
        while (existingIds.has(candidate)) {
            candidate = `${slugBase}-${counter}`;
            counter += 1;
        }
        return candidate;
    }

    function createUniqueTrainerId(base) {
        const slugBase = slugify(base || "siegeknight");
        let candidate = slugBase;
        let counter = 2;
        const existingIds = new Set(state.trainers.map((trainer) => trainer.id));
        while (existingIds.has(candidate)) {
            candidate = `${slugBase}-${counter}`;
            counter += 1;
        }
        return candidate;
    }

    function elementThemeClass(element) {
        const token = String(element || "NEUTRAL").trim().toLowerCase();
        return `el-${token || "neutral"}`;
    }

    function applyServerPayload(payload) {
        state.metadata = payload.metadata
            ? { cardTypes: ["SIEGLING", "SPELL", "TRAP"], trainers: [], deckRules: {}, ...payload.metadata }
            : state.metadata;
        state.filePath = payload.filePath || "";
        state.source = payload.source || "PROJECT_FILE";
        state.canSaveToProjectFile = Boolean(payload.canSaveToProjectFile);
        state.liveEditingEnabled = Boolean(payload.liveEditingEnabled);
        state.firestoreAvailable = Boolean(payload.firestoreAvailable);
        state.firestoreError = payload.firestoreError || "";
        state.updatedBy = payload.updatedBy || "";
        state.updatedAt = payload.updatedAt || "";
        state.auth = {
            ...DEFAULT_AUTH,
            ...(payload.auth || {}),
            available: Boolean(payload.auth?.available || payload.firestoreAvailable)
        };
    }

    function applyAuthPayload(payload) {
        if (payload?.token) {
            saveEditorToken(payload.token);
        }
        state.firestoreAvailable = Boolean(payload?.firestoreAvailable || state.firestoreAvailable);
        state.firestoreError = payload?.firestoreError || state.firestoreError;
        state.auth = {
            ...DEFAULT_AUTH,
            ...(payload?.auth || {}),
            available: Boolean(payload?.auth?.available || payload?.firestoreAvailable)
        };
    }

    function canSaveCurrentData() {
        return state.liveEditingEnabled ? Boolean(state.auth?.canEdit) : state.canSaveToProjectFile;
    }

    function saveUnavailableMessage() {
        if (state.liveEditingEnabled) {
            return state.auth?.authenticated
                ? "Your account cannot publish live changes right now."
                : "Sign in to publish live card, Siegeknight, premade deck, and live element data from this dashboard.";
        }
        return "This runtime cannot write to the project file. Download the JSON instead.";
    }

    function buildLoadedMessage() {
        return state.liveEditingEnabled ? "Loaded live data." : "Loaded local data.";
    }

    function apiUrl(path) {
        const base = String(window.SIEGLINGS_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");
        return base ? `${base}${path}` : path;
    }

    async function requestJson(url, options) {
        const requestOptions = buildRequestOptions(options);
        const response = await fetch(url, requestOptions);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.error || `Request failed with status ${response.status}.`);
        }
        return data;
    }

    async function uploadCardArtFile(cardId, file) {
        const formData = new FormData();
        formData.append("cardId", cardId);
        formData.append("file", file);
        const response = await fetch(apiUrl("/api/cards/editor/art"), buildRequestOptions({
            method: "POST",
            body: formData
        }));
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(formatCardArtUploadError(data?.error, response.status));
        }
        return data;
    }

    function formatCardArtUploadError(message, status) {
        const detail = String(message || "").trim();
        if (status === 404) {
            return detail || "Card art upload is not available on this server (missing /api/cards/editor/art). Deploy the latest Firebase api function.";
        }
        if (status === 401 || status === 403) {
            return detail || "Sign in under Live Publishing before uploading card art.";
        }
        if (detail) {
            return detail;
        }
        return `Card art upload failed with status ${status}.`;
    }

    function buildRequestOptions(options) {
        const headers = new Headers(options?.headers || {});
        const editorToken = getEditorToken();
        if (editorToken) {
            headers.set("X-Card-Editor-Token", editorToken);
        }
        return { ...options, headers };
    }

    function saveEditorToken(token) {
        try {
            window.localStorage.setItem(EDITOR_TOKEN_KEY, token);
        } catch (error) {
            // Ignore storage failures and continue with the in-memory session.
        }
    }

    function getEditorToken() {
        try {
            return window.localStorage.getItem(EDITOR_TOKEN_KEY) || "";
        } catch (error) {
            return "";
        }
    }

    function clearEditorToken() {
        try {
            window.localStorage.removeItem(EDITOR_TOKEN_KEY);
        } catch (error) {
            // Ignore storage failures and continue.
        }
    }

    function formatTimestamp(value) {
        if (!value) {
            return "";
        }
        const timestamp = new Date(value);
        if (Number.isNaN(timestamp.getTime())) {
            return value;
        }
        return timestamp.toLocaleString();
    }

    function setStatus(message, tone) {
        state.status = { message, tone };
    }

    function issue(severity, message, scope = "cards") {
        return { severity, message, scope };
    }

    function toNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function slugify(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "card";
    }

    function formatEnumLabel(value) {
        const normalized = String(value || "");
        if (normalized === "SIEGLING") return "Siegeling";
        if (normalized === "SIEGLINGS") return "Siegelings";
        return normalized
            .toLowerCase()
            .split("_")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    function shortDirection(direction) {
        switch (direction) {
            case "TOP_LEFT":
                return "TL";
            case "TOP":
                return "T";
            case "TOP_RIGHT":
                return "TR";
            case "LEFT":
                return "L";
            case "RIGHT":
                return "R";
            case "BOTTOM_LEFT":
                return "BL";
            case "BOTTOM":
                return "B";
            case "BOTTOM_RIGHT":
                return "BR";
            default:
                return direction;
        }
    }

    function findMoveById(id) {
        const key = String(id || "").trim();
        if (!key) {
            return null;
        }
        return state.movesPool.find((m) => m.id === key) || null;
    }

    function normalizeMoveFromServer(raw) {
        if (!raw || typeof raw !== "object") {
            return null;
        }
        const id = String(raw.id || "").trim();
        if (!id) {
            return null;
        }
        const targetType = String(raw.targetType || "SINGLE_ENEMY").trim();
        const rule = getTargetRule(targetType);
        const passiveFlag = Boolean(raw.isPassive) || targetType === "PASSIVE";
        const targetRow = raw.targetRow != null && String(raw.targetRow).trim()
            ? String(raw.targetRow).trim()
            : (rule.requiresRow ? firstMetaValue("rows", "FRONT") : "");
        const targetCount = raw.targetCount != null && raw.targetCount !== ""
            ? toNumber(raw.targetCount, 0)
            : rule.fixedTargetCount;
        let energyCost = Math.max(0, toNumber(raw.energyCost, 0));
        if (passiveFlag || targetType === "PASSIVE") {
            energyCost = 0;
        }
        return {
            id,
            name: String(raw.name || "").trim() || "Unnamed Move",
            element: String(raw.element || firstMetaValue("elements", "FIRE")).trim(),
            category: String(raw.category || "STANDARD").trim(),
            targetType,
            targetElement: raw.targetElement ? String(raw.targetElement).trim() : "",
            targetRow,
            targetCount,
            effectType: String(raw.effectType || firstEffectKey()).trim(),
            effectValue: toNumber(raw.effectValue, 0),
            energyCost,
            description: String(raw.description || ""),
            isPassive: passiveFlag,
            requiredElement: raw.requiredElement ? String(raw.requiredElement).trim() : "",
            requiredReaction: raw.requiredReaction ? String(raw.requiredReaction).trim() : ""
        };
    }

    function buildExportMove(m) {
        const rule = getTargetRule(m.targetType);
        const rawTargetElement = m.targetElement != null ? String(m.targetElement).trim() : "";
        const exportTargetElement = rawTargetElement && rawTargetElement !== "ALL" ? rawTargetElement : null;
        return {
            id: m.id.trim(),
            name: m.name.trim(),
            element: m.element,
            category: m.category || "STANDARD",
            targetType: m.targetType,
            targetElement: exportTargetElement,
            targetRow: m.targetRow && String(m.targetRow).trim() ? m.targetRow : null,
            targetCount: m.targetCount != null ? toNumber(m.targetCount, rule.fixedTargetCount) : rule.fixedTargetCount,
            effectType: m.effectType,
            effectValue: toNumber(m.effectValue, 0),
            energyCost: toNumber(m.energyCost, 0),
            description: String(m.description || ""),
            isPassive: Boolean(m.isPassive) || m.targetType === "PASSIVE",
            requiredElement: m.requiredElement ? String(m.requiredElement).trim() : null,
            requiredReaction: m.requiredReaction ? String(m.requiredReaction).trim() : null
        };
    }

    function buildMoveDraftAutoDescription() {
        return buildAutoMoveDescription({
            targetType: String(refs.moveDraftTargetSelect?.value || "SINGLE_ENEMY").trim(),
            targetElement: String(refs.moveDraftTargetElementSelect?.value || "").trim(),
            targetRow: String(refs.moveDraftTargetRowSelect?.value || "").trim(),
            effectType: String(refs.moveDraftEffectSelect?.value || firstEffectKey()).trim(),
            effectValue: refs.moveDraftEffectValueInput?.value,
            energyCost: refs.moveDraftEnergyInput?.value,
            isPassive: refs.moveDraftPassiveSelect?.value === "true"
        });
    }

    function syncMoveDraftAutoDescription() {
        if (!refs.moveDraftDescInput) {
            return;
        }
        const generated = buildMoveDraftAutoDescription();
        const previousGenerated = refs.moveDraftDescInput.dataset.autoDescription || "";
        const current = refs.moveDraftDescInput.value || "";
        if (!generated) {
            refs.moveDraftDescInput.dataset.autoDescription = "";
            if (current === previousGenerated) {
                setInputValue(refs.moveDraftDescInput, "");
            }
            return;
        }
        refs.moveDraftDescInput.dataset.autoDescription = generated;
        if (!current.trim() || current === previousGenerated) {
            setInputValue(refs.moveDraftDescInput, generated);
        }
    }

    function renderMoveDraftLivePanels() {
        if (state.editorPage === "MOVES_POOL") {
            renderMovesPoolSidePanels();
        }
    }

    function onMoveDraftNameInput() {
        if (refs.moveDraftIdInput && refs.moveDraftIdInput.dataset.idIsAuto !== "false") {
            const name = String(refs.moveDraftNameInput?.value || "");
            const editingId = state.moveDraftEditingOriginalId
                ? String(state.moveDraftEditingOriginalId).trim()
                : null;
            const nextId = computeUniqueAutoMoveId(name, editingId);
            if (refs.moveDraftIdInput.value !== nextId) {
                refs.moveDraftIdInput.value = nextId;
            }
        }
        renderMoveDraftLivePanels();
    }

    function onMoveDraftIdInput() {
        if (refs.moveDraftIdInput) {
            refs.moveDraftIdInput.dataset.idIsAuto = "false";
        }
        renderMoveDraftLivePanels();
    }

    function computeUniqueAutoMoveId(name, editingOriginalId) {
        const base = slugify(name) || "ability";
        let candidate = base;
        let counter = 2;
        while (moveIdConflicts(candidate, editingOriginalId)) {
            candidate = `${base}-${counter}`;
            counter += 1;
        }
        return candidate;
    }

    function moveIdConflicts(candidate, editingOriginalId) {
        return state.movesPool.some((m) => m.id === candidate && m.id !== editingOriginalId);
    }

    function buildAutoMoveDescription(move) {
        const effectType = String(move?.effectType || "").trim();
        const targetType = String(move?.targetType || "").trim();
        const isPassive = Boolean(move?.isPassive) || targetType === "PASSIVE";
        const value = Math.max(0, toNumber(move?.effectValue, 0));
        const signedValue = `+${value}`;
        const targetElement = String(move?.targetElement || "").trim();
        const elementPrefix = targetElement && targetElement !== "ALL" ? `${formatEnumLabel(targetElement)} ` : "";
        const selectedEnemyRow = selectedRowTargetPhrase("enemy", elementPrefix);
        const selectedAlliedRow = selectedRowTargetPhrase("allied", elementPrefix);

        switch (effectType) {
            case "damage":
                return buildDamageMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow);
            case "player_damage":
                return `Deal ${value} damage to the enemy player`;
            case "draw":
                return `Draw ${value} ${value === 1 ? "card" : "cards"}`;
            case "heal":
                return buildHealMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow);
            case "freeze":
                return buildFreezeMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow);
            case "speed_zero":
                return buildSpeedZeroMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow);
            case "slow":
                return buildSlowMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow);
            case "damage_boost":
                return buildStatBoostMoveDescription(signedValue, "Attack Damage", targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow, isPassive);
            case "health_boost":
                return buildStatBoostMoveDescription(signedValue, "max HP", targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow, isPassive);
            case "shield":
                return buildStatBoostMoveDescription(signedValue, "Shield", targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow, isPassive);
            case "speed_boost":
                return buildStatBoostMoveDescription(signedValue, "Speed", targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow, isPassive);
            case "connected_allies_damage_boost":
                return `Connected allies gain ${signedValue} Attack Damage`;
            case "connected_allies_health_boost":
                return `Connected allies gain ${signedValue} max HP`;
            case "connected_allies_shield":
                return `Connected allies gain ${signedValue} Shield`;
            case "connected_allies_slow":
                return `Connected allies lose ${value} Speed`;
            case "connected_allies_speed_boost":
                return `Connected allies gain ${signedValue} Speed`;
            case "destroy":
                return buildDestroyMoveDescription(targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow);
            case "move_link":
                return `Move to an open linked point (${Math.max(0, toNumber(move?.energyCost, 0))} Cost)`;
            default:
                return "";
        }
    }

    function selectedRowTargetPhrase(sideLabel, elementPrefix) {
        const elementText = elementPrefix ? `${elementPrefix.toLowerCase()}` : "";
        return `the selected ${elementText}${sideLabel} row`;
    }

    function buildDamageMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow) {
        switch (targetType) {
            case "SINGLE_ENEMY":
                return `Deal ${value} damage to 1 ${elementPrefix}enemy`;
            case "SINGLE_ALLY":
                return `Deal ${value} damage to 1 ${elementPrefix}ally`;
            case "ROW_ENEMIES":
                return elementPrefix
                    ? `Deal ${value} damage to ${elementPrefix.toLowerCase()}row enemies`
                    : `Deal ${value} damage to the row`;
            case "ROW_ALLIES":
                return elementPrefix
                    ? `Deal ${value} damage to ${elementPrefix.toLowerCase()}row allies`
                    : `Deal ${value} damage to row allies`;
            case "ROW_SELECT_ENEMIES":
                return `Deal ${value} damage to ${selectedEnemyRow}`;
            case "ROW_SELECT_ALLIES":
                return `Deal ${value} damage to ${selectedAlliedRow}`;
            case "ALL_ENEMIES":
                return `Deal ${value} damage to all ${elementPrefix}enemies`;
            case "ALL_ALLIES":
                return `Deal ${value} damage to all ${elementPrefix}allies`;
            case "SELF":
            case "PASSIVE":
                return `Deal ${value} damage to self`;
            case "ENEMY_PLAYER":
                return `Deal ${value} damage to the enemy player`;
            default:
                return "";
        }
    }

    function buildHealMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow) {
        switch (targetType) {
            case "SINGLE_ENEMY":
                return `Heal 1 ${elementPrefix}enemy for ${value} HP`;
            case "SINGLE_ALLY":
                return `Heal 1 ${elementPrefix}ally for ${value} HP`;
            case "ROW_ENEMIES":
                return elementPrefix
                    ? `Heal ${elementPrefix}row enemies for ${value} HP`
                    : `Heal row enemies for ${value} HP`;
            case "ROW_ALLIES":
                return elementPrefix
                    ? `Heal ${elementPrefix}row allies for ${value} HP`
                    : `Heal Row allies for ${value} HP`;
            case "ROW_SELECT_ENEMIES":
                return `Heal ${selectedEnemyRow} for ${value} HP`;
            case "ROW_SELECT_ALLIES":
                return `Heal ${selectedAlliedRow} for ${value} HP`;
            case "ALL_ENEMIES":
                return `Heal all ${elementPrefix}enemies for ${value} HP`;
            case "ALL_ALLIES":
                return `Heal all ${elementPrefix}allies for ${value} HP`;
            case "SELF":
            case "PASSIVE":
                return `Heal self for ${value} HP`;
            default:
                return "";
        }
    }

    function buildFreezeMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow) {
        const turns = turnText(value);
        switch (targetType) {
            case "SINGLE_ENEMY":
                return `Freeze 1 ${elementPrefix}enemy for ${turns}`;
            case "SINGLE_ALLY":
                return `Freeze 1 ${elementPrefix}ally for ${turns}`;
            case "ROW_ENEMIES":
                return elementPrefix
                    ? `Freeze ${elementPrefix}row enemies for ${turns}`
                    : `Freeze Row enemies for ${turns}`;
            case "ROW_ALLIES":
                return elementPrefix
                    ? `Freeze ${elementPrefix}row allies for ${turns}`
                    : `Freeze row allies for ${turns}`;
            case "ROW_SELECT_ENEMIES":
                return `Freeze ${selectedEnemyRow} for ${turns}`;
            case "ROW_SELECT_ALLIES":
                return `Freeze ${selectedAlliedRow} for ${turns}`;
            case "ALL_ENEMIES":
                return `Freeze All ${elementPrefix}enemies for ${turns}`;
            case "ALL_ALLIES":
                return `Freeze all ${elementPrefix}allies for ${turns}`;
            case "SELF":
            case "PASSIVE":
                return `Freeze self for ${turns}`;
            default:
                return "";
        }
    }

    function buildSpeedZeroMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow) {
        const turns = turnText(value);
        switch (targetType) {
            case "SINGLE_ENEMY":
                return `Reduce 1 ${elementPrefix}enemy speed to 0 (${turns})`;
            case "SINGLE_ALLY":
                return `Reduce 1 ${elementPrefix}ally speed to 0 (${turns})`;
            case "ROW_ENEMIES":
                return elementPrefix
                    ? `Nullify ${elementPrefix}row enemies' speed (${turns})`
                    : `Nullify Row enemies' speed (${turns})`;
            case "ROW_ALLIES":
                return elementPrefix
                    ? `Nullify ${elementPrefix}row allies' speed (${turns})`
                    : `Nullify row allies' speed (${turns})`;
            case "ROW_SELECT_ENEMIES":
                return `Nullify ${selectedEnemyRow}'s speed (${turns})`;
            case "ROW_SELECT_ALLIES":
                return `Nullify ${selectedAlliedRow}'s speed (${turns})`;
            case "ALL_ENEMIES":
                return `Nullify All ${elementPrefix}enemies' speed (${turns})`;
            case "ALL_ALLIES":
                return `Nullify all ${elementPrefix}allies' speed (${turns})`;
            case "SELF":
            case "PASSIVE":
                return `Nullify self speed (${turns})`;
            default:
                return "";
        }
    }

    function buildSlowMoveDescription(value, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow) {
        const amount = Math.max(1, toNumber(value, 1));
        switch (targetType) {
            case "SINGLE_ENEMY":
                return `Reduce 1 ${elementPrefix}enemy speed by ${amount}`;
            case "SINGLE_ALLY":
                return `Reduce 1 ${elementPrefix}ally speed by ${amount}`;
            case "ROW_ENEMIES":
                return elementPrefix
                    ? `Reduce ${elementPrefix}row enemies' speed by ${amount}`
                    : `Reduce row enemies' speed by ${amount}`;
            case "ROW_ALLIES":
                return elementPrefix
                    ? `Reduce ${elementPrefix}row allies' speed by ${amount}`
                    : `Reduce row allies' speed by ${amount}`;
            case "ROW_SELECT_ENEMIES":
                return `Reduce ${selectedEnemyRow}'s speed by ${amount}`;
            case "ROW_SELECT_ALLIES":
                return `Reduce ${selectedAlliedRow}'s speed by ${amount}`;
            case "ALL_ENEMIES":
                return `Reduce all ${elementPrefix}enemies' speed by ${amount}`;
            case "ALL_ALLIES":
                return `Reduce all ${elementPrefix}allies' speed by ${amount}`;
            case "SELF":
            case "PASSIVE":
                return `Reduce self speed by ${amount}`;
            default:
                return "";
        }
    }

    function buildStatBoostMoveDescription(signedValue, statLabel, targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow, isPassive) {
        if (targetType === "PASSIVE" || (isPassive && targetType === "SELF")) {
            return `Passively gains ${signedValue} ${statLabel}`;
        }
        switch (targetType) {
            case "SINGLE_ENEMY":
                return `1 ${elementPrefix}enemy gains ${signedValue} ${statLabel}`;
            case "SINGLE_ALLY":
                return `1 ${elementPrefix}ally gains ${signedValue} ${statLabel}`;
            case "ROW_ENEMIES":
                return elementPrefix
                    ? `${elementPrefix}row enemies gain ${signedValue} ${statLabel}`
                    : `Row enemies gain ${signedValue} ${statLabel}`;
            case "ROW_ALLIES":
                return elementPrefix
                    ? `${elementPrefix}row allies gain ${signedValue} ${statLabel}`
                    : `Row allies gain ${signedValue} ${statLabel}`;
            case "ROW_SELECT_ENEMIES":
                return `${sentenceCase(selectedEnemyRow)} gains ${signedValue} ${statLabel}`;
            case "ROW_SELECT_ALLIES":
                return `${sentenceCase(selectedAlliedRow)} gains ${signedValue} ${statLabel}`;
            case "ALL_ENEMIES":
                return `All ${elementPrefix}enemies gain ${signedValue} ${statLabel}`;
            case "ALL_ALLIES":
                return `All ${elementPrefix}allies gain ${signedValue} ${statLabel}`;
            case "SELF":
                return `This Siegeling gains ${signedValue} ${statLabel}`;
            default:
                return "";
        }
    }

    function buildDestroyMoveDescription(targetType, elementPrefix, selectedEnemyRow, selectedAlliedRow) {
        switch (targetType) {
            case "SINGLE_ENEMY":
                return `Destroy 1 ${elementPrefix}enemy`;
            case "SINGLE_ALLY":
                return `Destroy 1 ${elementPrefix}ally`;
            case "ROW_ENEMIES":
                return elementPrefix ? `Destroy ${elementPrefix}row enemies` : "Destroy Row enemies";
            case "ROW_ALLIES":
                return elementPrefix ? `Destroy ${elementPrefix}row allies` : "Destroy row allies";
            case "ROW_SELECT_ENEMIES":
                return `Destroy ${selectedEnemyRow}`;
            case "ROW_SELECT_ALLIES":
                return `Destroy ${selectedAlliedRow}`;
            case "ALL_ENEMIES":
                return `Destroy all ${elementPrefix}enemies`;
            case "ALL_ALLIES":
                return `Destroy all ${elementPrefix}allies`;
            case "SELF":
            case "PASSIVE":
                return "Destroy self";
            default:
                return "";
        }
    }

    function sentenceCase(value) {
        const text = String(value || "");
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
    }

    function turnText(value) {
        const turns = Math.max(1, toNumber(value, 1));
        return `${turns} turn${turns === 1 ? "" : "s"}`;
    }

    function describeMove(move) {
        const passive = Boolean(move.isPassive) || move.targetType === "PASSIVE";
        const pieces = [
            passive ? "Passive" : "Activated",
            `${effectLabel(move.effectType)} -> ${formatEnumLabel(move.targetType)}`
        ];
        if (!passive && move.energyCost > 0) {
            if (move.requiredElement) {
                pieces.push(`Cost ${move.energyCost} ${formatEnumLabel(move.requiredElement)}`);
            } else if (move.requiredReaction) {
                pieces.push(`Needs ${move.requiredReaction}`);
            } else {
                pieces.push(`Energy ${move.energyCost}`);
            }
        }
        return pieces.join(" · ");
    }

    function createBlankMoveFromElement(element) {
        const tt = "SINGLE_ENEMY";
        const rule = getTargetRule(tt);
        return normalizeMoveFromServer({
            id: "temp",
            name: "New Move",
            element: element || firstMetaValue("elements", "FIRE"),
            category: "STANDARD",
            targetType: tt,
            targetElement: null,
            targetRow: rule.requiresRow ? firstMetaValue("rows", "FRONT") : null,
            targetCount: rule.fixedTargetCount,
            effectType: firstEffectKey(),
            effectValue: 0,
            energyCost: 0,
            description: "",
            isPassive: false,
            requiredElement: null,
            requiredReaction: null
        });
    }

    function createUniqueMoveId(base) {
        let candidate = slugify(base) || "move";
        if (!findMoveById(candidate)) {
            return candidate;
        }
        let n = 2;
        while (findMoveById(`${candidate}-${n}`)) {
            n += 1;
        }
        return `${candidate}-${n}`;
    }

    function hideMoveDraft() {
        state.moveDraftSourceId = null;
        state.moveDraftEditingOriginalId = null;
        if (refs.moveDraftPanel) {
            refs.moveDraftPanel.style.display = "none";
        }
    }

    function onCancelMoveDraft() {
        if (state.editorPage === "MOVES_POOL") {
            state.movesPoolIsNewDraft = false;
            state.selectedMoveId = state.movesPool[0]?.id || null;
            state.moveDraftEditingOriginalId = null;
            state.movesPoolFormEpoch += 1;
            renderAll();
            return;
        }
        hideMoveDraft();
    }

    function mountMoveDraftPanel(targetHost) {
        if (!refs.moveDraftPanel || !targetHost) {
            return;
        }
        if (refs.moveDraftPanel.parentElement !== targetHost) {
            targetHost.appendChild(refs.moveDraftPanel);
        }
    }

    function getSieglingsUsingMoveId(moveId) {
        const key = String(moveId || "").trim();
        if (!key) {
            return [];
        }
        return state.cards.filter((card) => {
            if (card.cardType !== "SIEGLING") {
                return false;
            }
            return (card.moveIds || []).some((id) => String(id || "").trim() === key);
        });
    }

    function migrateMoveIdOnAllCards(oldId, newId) {
        const o = String(oldId || "").trim();
        const n = String(newId || "").trim();
        if (!o || !n || o === n) {
            return;
        }
        state.cards.forEach((card) => {
            if (card.cardType !== "SIEGLING" || !Array.isArray(card.moveIds)) {
                return;
            }
            card.moveIds = card.moveIds.map((id) => (String(id || "").trim() === o ? n : id));
        });
    }

    function isMovePassiveForFilter(m) {
        return Boolean(m?.isPassive) || m?.targetType === "PASSIVE";
    }

    function moveEffectiveEnergyForFilter(m) {
        return isMovePassiveForFilter(m) ? 0 : toNumber(m?.energyCost, 0);
    }

    function compareMovesPoolSort(a, b, sortKey) {
        const enA = moveEffectiveEnergyForFilter(a);
        const enB = moveEffectiveEnergyForFilter(b);
        switch (sortKey) {
            case "name-desc":
                return b.name.localeCompare(a.name) || a.id.localeCompare(b.id);
            case "element-asc":
                return a.element.localeCompare(b.element) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
            case "category-asc":
                return String(a.category || "").localeCompare(String(b.category || "")) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
            case "target-asc":
                return String(a.targetType || "").localeCompare(String(b.targetType || "")) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
            case "energy-asc":
                if (enA !== enB) {
                    return enA - enB;
                }
                return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
            case "energy-desc":
                if (enA !== enB) {
                    return enB - enA;
                }
                return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
            case "name-asc":
            default:
                return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
        }
    }

    function syncMovesPoolFilterUi() {
        if (state.editorPage !== "MOVES_POOL" || !refs.movesPoolElementFilter) {
            return;
        }
        const elements = state.metadata?.elements || [];
        const categories = state.metadata?.moveCategories || ["STANDARD", "SPECIALITY", "UTILITY"];
        const targets = state.metadata?.targetTypes || [];

        const optsHtml = (allLabel, values, formatLabel) => {
            const rows = [`<option value="ALL">${escapeHtml(allLabel)}</option>`];
            values.forEach((v) => {
                rows.push(`<option value="${escapeHtml(v)}">${escapeHtml(formatLabel(v))}</option>`);
            });
            return rows.join("");
        };

        const elHtml = optsHtml("All elements", elements, formatEnumLabel);
        if (refs.movesPoolElementFilter.dataset.opts !== elHtml) {
            refs.movesPoolElementFilter.dataset.opts = elHtml;
            refs.movesPoolElementFilter.innerHTML = elHtml;
        }
        refs.movesPoolElementFilter.value = state.movesPoolFilterElement;
        if (refs.movesPoolElementFilter.value !== state.movesPoolFilterElement) {
            state.movesPoolFilterElement = "ALL";
            refs.movesPoolElementFilter.value = "ALL";
        }

        if (refs.movesPoolCategoryFilter) {
            const catHtml = optsHtml("All categories", categories, formatEnumLabel);
            if (refs.movesPoolCategoryFilter.dataset.opts !== catHtml) {
                refs.movesPoolCategoryFilter.dataset.opts = catHtml;
                refs.movesPoolCategoryFilter.innerHTML = catHtml;
            }
            refs.movesPoolCategoryFilter.value = state.movesPoolFilterCategory;
            if (refs.movesPoolCategoryFilter.value !== state.movesPoolFilterCategory) {
                state.movesPoolFilterCategory = "ALL";
                refs.movesPoolCategoryFilter.value = "ALL";
            }
        }

        if (refs.movesPoolTargetFilter) {
            const tgtHtml = optsHtml("All targets", targets, formatEnumLabel);
            if (refs.movesPoolTargetFilter.dataset.opts !== tgtHtml) {
                refs.movesPoolTargetFilter.dataset.opts = tgtHtml;
                refs.movesPoolTargetFilter.innerHTML = tgtHtml;
            }
            refs.movesPoolTargetFilter.value = state.movesPoolFilterTarget;
            if (refs.movesPoolTargetFilter.value !== state.movesPoolFilterTarget) {
                state.movesPoolFilterTarget = "ALL";
                refs.movesPoolTargetFilter.value = "ALL";
            }
        }

        if (refs.movesPoolActivationFilter) {
            refs.movesPoolActivationFilter.value = state.movesPoolFilterActivation;
            if (refs.movesPoolActivationFilter.value !== state.movesPoolFilterActivation) {
                state.movesPoolFilterActivation = "ALL";
                refs.movesPoolActivationFilter.value = "ALL";
            }
        }
        if (refs.movesPoolEnergyFilter) {
            refs.movesPoolEnergyFilter.value = state.movesPoolFilterEnergy;
            if (!refs.movesPoolEnergyFilter.value) {
                state.movesPoolFilterEnergy = "99";
                refs.movesPoolEnergyFilter.value = "99";
            }
        }
        if (refs.movesPoolSortSelect) {
            refs.movesPoolSortSelect.value = state.movesPoolSort;
            if (refs.movesPoolSortSelect.value !== state.movesPoolSort) {
                state.movesPoolSort = "name-asc";
                refs.movesPoolSortSelect.value = "name-asc";
            }
        }
    }

    function applyMovesPoolEditorPanelTheme() {
        if (!refs.movesPoolEditorPanel || state.editorPage !== "MOVES_POOL") {
            return;
        }
        const hasEditor = state.movesPoolIsNewDraft || Boolean(findMoveById(state.selectedMoveId));
        if (!hasEditor) {
            refs.movesPoolEditorPanel.className = "panel deck-editor-panel editor-panel el-neutral";
            return;
        }
        let el = firstMetaValue("elements", "FIRE");
        if (state.movesPoolIsNewDraft) {
            const draft = readMoveDraftFromForm();
            if (draft?.element) {
                el = draft.element;
            }
        } else {
            const move = findMoveById(state.selectedMoveId);
            if (move?.element) {
                el = move.element;
            }
        }
        refs.movesPoolEditorPanel.className = `panel deck-editor-panel editor-panel ${elementThemeClass(el)}`;
    }

    function getFilteredMovesPoolRows() {
        const q = state.movesPoolSearch.trim().toLowerCase();
        const maxEn = toNumber(state.movesPoolFilterEnergy, 99);
        const rows = (state.movesPool || []).filter((m) => {
            if (!m || !m.id) {
                return false;
            }
            if (state.movesPoolFilterElement !== "ALL" && m.element !== state.movesPoolFilterElement) {
                return false;
            }
            if (state.movesPoolFilterCategory !== "ALL" && String(m.category || "STANDARD") !== state.movesPoolFilterCategory) {
                return false;
            }
            const passive = isMovePassiveForFilter(m);
            if (state.movesPoolFilterActivation === "PASSIVE" && !passive) {
                return false;
            }
            if (state.movesPoolFilterActivation === "ACTIVATED" && passive) {
                return false;
            }
            if (state.movesPoolFilterTarget !== "ALL" && String(m.targetType || "") !== state.movesPoolFilterTarget) {
                return false;
            }
            const cost = moveEffectiveEnergyForFilter(m);
            if (maxEn < 99 && cost > maxEn) {
                return false;
            }
            if (q && !m.id.toLowerCase().includes(q) && !String(m.name || "").toLowerCase().includes(q)) {
                return false;
            }
            return true;
        });
        rows.sort((a, b) => compareMovesPoolSort(a, b, state.movesPoolSort));
        return rows;
    }

    function renderMovesPoolBrowser() {
        if (!refs.movesPoolList) {
            return;
        }
        syncMovesPoolFilterUi();
        const rows = getFilteredMovesPoolRows();
        if (rows.length === 0) {
            const empty = (state.movesPool || []).length === 0
                ? "The moves pool is empty. Create a new ability or reload data."
                : "No abilities match the current search and filters.";
            refs.movesPoolList.innerHTML = `<div class="empty-browser">${escapeHtml(empty)}</div>`;
            if (refs.movesPoolSearchInput && refs.movesPoolSearchInput.value !== state.movesPoolSearch) {
                refs.movesPoolSearchInput.value = state.movesPoolSearch;
            }
            applyMovesPoolEditorPanelTheme();
            return;
        }
        refs.movesPoolList.innerHTML = rows.map((m) => {
            const users = getSieglingsUsingMoveId(m.id);
            const active = m.id === state.selectedMoveId && !state.movesPoolIsNewDraft ? " active" : "";
            const useLabel = users.length === 0 ? "Unused" : `${users.length} Siegeling${users.length === 1 ? "" : "s"}`;
            const theme = elementThemeClass(m.element);
            return `
                <div class="card-row ${theme}${active}" data-pool-move-id="${escapeHtml(m.id)}">
                    <div class="card-row-title">
                        <strong>${escapeHtml(m.name || "Unnamed")}</strong>
                        <span class="summary-badge">${escapeHtml(formatEnumLabel(m.element))} · ${escapeHtml(useLabel)}</span>
                    </div>
                    <div class="card-meta">${escapeHtml(describeMove(m))}</div>
                    <div class="card-id">${escapeHtml(m.id)}</div>
                </div>
            `;
        }).join("");
        if (refs.movesPoolSearchInput && refs.movesPoolSearchInput.value !== state.movesPoolSearch) {
            refs.movesPoolSearchInput.value = state.movesPoolSearch;
        }
        applyMovesPoolEditorPanelTheme();
    }

    function renderMovesPoolEditorShell() {
        if (state.editorPage !== "MOVES_POOL" || !refs.emptyMovesPoolEditorState || !refs.movesPoolEditorContent) {
            return;
        }
        const hasEditor = state.movesPoolIsNewDraft || Boolean(findMoveById(state.selectedMoveId));
        refs.emptyMovesPoolEditorState.classList.toggle("hidden", hasEditor);
        refs.movesPoolEditorContent.classList.toggle("hidden", !hasEditor);
        if (refs.saveMoveDraftBtn) {
            refs.saveMoveDraftBtn.textContent = "Save ability";
        }
        if (!hasEditor) {
            if (refs.moveDraftPanel) {
                refs.moveDraftPanel.style.display = "none";
            }
            applyMovesPoolEditorPanelTheme();
            return;
        }
        if (state.movesPoolFormEpoch !== state.movesPoolFormEpochApplied) {
            state.movesPoolFormEpochApplied = state.movesPoolFormEpoch;
            if (state.movesPoolIsNewDraft) {
                const draft = createBlankMoveFromElement(firstMetaValue("elements", "FIRE"));
                draft.id = createUniqueMoveId("ability");
                ensureMoveDraftPopulatedWith(draft, null);
            } else {
                const move = findMoveById(state.selectedMoveId);
                if (move) {
                    ensureMoveDraftPopulatedWith(move, move.id);
                }
            }
        }
        if (refs.movesPoolEditorTitle) {
            refs.movesPoolEditorTitle.textContent = state.movesPoolIsNewDraft ? "New Shared Ability" : "Edit Shared Ability";
        }
        if (refs.movesPoolUsedBy) {
            const idInForm = String(refs.moveDraftIdInput?.value || "").trim();
            const storedId = state.movesPoolIsNewDraft ? "" : String(state.selectedMoveId || "").trim();
            const list = storedId ? getSieglingsUsingMoveId(storedId) : [];
            const renameNote = !state.movesPoolIsNewDraft && storedId && idInForm && idInForm !== storedId
                ? `<p class="section-help">Move id changed in the form — saving will point every Siegeling that used <strong>${escapeHtml(storedId)}</strong> at <strong>${escapeHtml(idInForm)}</strong> instead.</p>`
                : "";
            if (state.movesPoolIsNewDraft) {
                refs.movesPoolUsedBy.innerHTML = `<p class="section-help">Save to add this ability to the pool, then assign it from any Siegeling’s move list.</p>`;
            } else if (list.length === 0) {
                refs.movesPoolUsedBy.innerHTML = `${renameNote}<p class="section-help"><strong>Not assigned</strong> — no Siegeling references this id yet.</p>`;
            } else {
                refs.movesPoolUsedBy.innerHTML = `
                    ${renameNote}
                    <p class="section-help"><strong>Used by ${list.length} Siegeling${list.length === 1 ? "" : "s"}</strong> (by move id). Edits to name, effect, and cost apply to every assignment.</p>
                    <ul class="moves-pool-used-list">${list.map((c) => `<li>${escapeHtml(c.name || c.id)} <span class="card-id-inline">${escapeHtml(c.id)}</span></li>`).join("")}</ul>
                `;
            }
        }
        if (refs.moveDraftPanel) {
            refs.moveDraftPanel.style.display = "grid";
        }
        applyMovesPoolEditorPanelTheme();
    }

    function renderMovesPoolSidePanels() {
        if (state.editorPage !== "MOVES_POOL") {
            return;
        }
        const editingVisible = refs.moveDraftPanel && refs.moveDraftPanel.style.display !== "none";
        const move = state.movesPoolIsNewDraft || editingVisible ? readMoveDraftFromForm() : findMoveById(state.selectedMoveId);
        if (refs.movesPoolSummaryPanel) {
            if (!move) {
                refs.movesPoolSummaryPanel.innerHTML = `<div class="validation-empty">Select an ability to preview.</div>`;
            } else {
                refs.movesPoolSummaryPanel.innerHTML = `
                    <div class="summary-ability">
                        <strong>${escapeHtml(move.name || move.id)}</strong>
                        <div class="card-summary-copy">${escapeHtml(move.description || "No description.")}</div>
                        <div class="card-summary-copy">${escapeHtml(describeMove(move))}</div>
                        <div class="card-id">${escapeHtml(move.id)}</div>
                    </div>
                `;
            }
        }
        if (refs.movesPoolJsonPreview) {
            refs.movesPoolJsonPreview.value = JSON.stringify(state.movesPool.map((m) => buildExportMove(m)), null, 2);
        }
        if (refs.movesPoolValidationList) {
            const cardIssues = state.validation.filter((issue) => issue.scope === "cards");
            if (cardIssues.length === 0) {
                refs.movesPoolValidationList.innerHTML = `<div class="validation-empty">No validation issues right now.</div>`;
            } else {
                refs.movesPoolValidationList.innerHTML = cardIssues.map((issue) => `
                    <div class="validation-item ${issue.severity}">
                        <span class="validation-severity">${escapeHtml(issue.severity)}</span>
                        <div>${escapeHtml(issue.message)}</div>
                    </div>
                `).join("");
            }
        }
    }

    function onMovesPoolListClick(event) {
        const row = event.target.closest("[data-pool-move-id]");
        if (!row) {
            return;
        }
        selectMovesPoolMove(row.dataset.poolMoveId);
    }

    function selectMovesPoolMove(moveId) {
        const id = String(moveId || "").trim();
        if (!id || !findMoveById(id)) {
            return;
        }
        state.movesPoolIsNewDraft = false;
        state.selectedMoveId = id;
        state.moveDraftEditingOriginalId = id;
        state.movesPoolFormEpoch += 1;
        state.validation = validateDashboard();
        renderAll();
    }

    function startNewPoolMoveDraft() {
        state.editorPage = "MOVES_POOL";
        state.movesPoolIsNewDraft = true;
        state.selectedMoveId = null;
        state.moveDraftEditingOriginalId = null;
        state.movesPoolFormEpoch += 1;
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus("New shared ability draft — set id and fields, then save.", "warning");
        renderAll();
    }

    function deleteSelectedPoolMove() {
        const id = String(state.selectedMoveId || "").trim();
        if (!id || !findMoveById(id) || state.movesPoolIsNewDraft) {
            return;
        }
        const users = getSieglingsUsingMoveId(id);
        const warn = users.length > 0
            ? `Delete "${id}" from the pool? It will be removed from ${users.length} Siegeling deck list${users.length === 1 ? "" : "s"}.`
            : `Delete "${id}" from the shared pool?`;
        if (!window.confirm(warn)) {
            return;
        }
        state.movesPool = state.movesPool.filter((m) => m.id !== id);
        state.cards.forEach((card) => {
            if (card.cardType === "SIEGLING" && Array.isArray(card.moveIds)) {
                card.moveIds = card.moveIds.filter((x) => String(x || "").trim() !== id);
            }
        });
        state.selectedMoveId = state.movesPool[0]?.id || null;
        state.movesPoolIsNewDraft = false;
        state.moveDraftEditingOriginalId = null;
        state.movesPoolFormEpoch += 1;
        if (refs.moveDraftPanel) {
            refs.moveDraftPanel.style.display = "none";
        }
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus(`Removed "${id}" from the pool.`, "warning");
        renderAll();
    }

    function ensureMoveDraftPopulatedWith(move, editingOriginalId = null) {
        const categories = state.metadata?.moveCategories || ["STANDARD", "SPECIALITY", "UTILITY"];
        populateSelect(refs.moveDraftElementSelect, state.metadata?.elements || [], move.element);
        populateSelect(refs.moveDraftCategorySelect, categories, move.category || "STANDARD");
        populateSelect(refs.moveDraftTargetSelect, state.metadata?.targetTypes || [], move.targetType);
        populateMoveDraftTargetElementOptions();
        if (refs.moveDraftTargetElementSelect) {
            const chosen = move.targetElement && String(move.targetElement).trim() ? String(move.targetElement).trim() : "ALL";
            refs.moveDraftTargetElementSelect.value = chosen;
        }
        populateSelect(refs.moveDraftTargetRowSelect, state.metadata?.rows || [], move.targetRow || firstMetaValue("rows", "FRONT"));
        populateSelect(
            refs.moveDraftEffectSelect,
            (state.metadata?.effectTypes || []).map((effect) => effect.key),
            move.effectType,
            false,
            effectLabelMap()
        );
        setInputValue(refs.moveDraftIdInput, move.id);
        setInputValue(refs.moveDraftNameInput, move.name);
        if (refs.moveDraftIdInput) {
            const slugOfName = slugify(move.name || "");
            const isFreshDraft = !editingOriginalId;
            refs.moveDraftIdInput.dataset.idIsAuto = (isFreshDraft || move.id === slugOfName) ? "true" : "false";
        }
        setInputValue(refs.moveDraftEffectValueInput, move.effectValue);
        setInputValue(refs.moveDraftEnergyInput, move.energyCost);
        setInputValue(refs.moveDraftDescInput, move.description);
        refs.moveDraftPassiveSelect.value = move.isPassive || move.targetType === "PASSIVE" ? "true" : "false";
        syncMoveDraftTargetRowUi();
        syncMoveDraftTargetElementUi();
        syncMoveDraftAutoDescription();
        if (editingOriginalId != null && String(editingOriginalId).trim()) {
            state.moveDraftEditingOriginalId = String(editingOriginalId).trim();
        } else {
            state.moveDraftEditingOriginalId = null;
        }
    }

    function startNewMoveDraft() {
        const card = getSelectedCard();
        if (!card || card.cardType !== "SIEGLING") {
            return;
        }
        state.moveDraftSourceId = null;
        const draft = createBlankMoveFromElement(card.element);
        draft.id = createUniqueMoveId(`${slugify(card.name)}-move`);
        ensureMoveDraftPopulatedWith(draft);
        if (refs.moveDraftPanel) {
            refs.moveDraftPanel.style.display = "grid";
        }
    }

    function copyMoveToDraft(sourceMoveId) {
        const src = findMoveById(sourceMoveId);
        if (!src) {
            setStatus(`Move "${sourceMoveId}" is not in the pool.`, "warning");
            return;
        }
        state.moveDraftSourceId = sourceMoveId;
        const exported = buildExportMove(src);
        const draft = normalizeMoveFromServer({
            ...exported,
            id: createUniqueMoveId(`copy-of-${slugify(src.name)}`),
            name: `${src.name.trim()} Copy`
        });
        ensureMoveDraftPopulatedWith(draft);
        if (refs.moveDraftPanel) {
            refs.moveDraftPanel.style.display = "grid";
        }
    }

    function readMoveDraftFromForm() {
        const id = String(refs.moveDraftIdInput?.value || "").trim();
        const name = String(refs.moveDraftNameInput?.value || "").trim();
        const targetType = String(refs.moveDraftTargetSelect?.value || "SINGLE_ENEMY").trim();
        const rule = getTargetRule(targetType);
        const rawTargetElement = String(refs.moveDraftTargetElementSelect?.value || "ALL").trim();
        const targetElement = rawTargetElement && rawTargetElement !== "ALL" ? rawTargetElement : null;
        let targetRow = String(refs.moveDraftTargetRowSelect?.value || "").trim();
        if (!rule.requiresRow) {
            targetRow = "";
        }
        let passive = refs.moveDraftPassiveSelect?.value === "true";
        let energy = Math.max(0, toNumber(refs.moveDraftEnergyInput?.value, 0));
        if (passive || targetType === "PASSIVE") {
            passive = true;
            energy = 0;
        }
        return normalizeMoveFromServer({
            id: id || "missing-id",
            name: name || "Unnamed Move",
            element: refs.moveDraftElementSelect?.value || firstMetaValue("elements", "FIRE"),
            category: refs.moveDraftCategorySelect?.value || "STANDARD",
            targetType,
            targetElement,
            targetRow: targetRow || null,
            targetCount: rule.fixedTargetCount,
            effectType: refs.moveDraftEffectSelect?.value || firstEffectKey(),
            effectValue: refs.moveDraftEffectValueInput?.value,
            energyCost: energy,
            description: refs.moveDraftDescInput?.value || "",
            isPassive: passive,
            requiredElement: null,
            requiredReaction: null
        });
    }

    function syncMoveDraftTargetRowUi() {
        if (!refs.moveDraftTargetSelect || !refs.moveDraftTargetRowWrap) {
            return;
        }
        const rule = getTargetRule(refs.moveDraftTargetSelect.value);
        refs.moveDraftTargetRowWrap.classList.toggle("hidden", !rule.requiresRow);
    }

    function populateMoveDraftTargetElementOptions() {
        if (!refs.moveDraftTargetElementSelect) {
            return;
        }
        const elements = state.metadata?.elements || [];
        const options = ["ALL", ...elements];
        const prev = String(refs.moveDraftTargetElementSelect.value || "ALL").trim() || "ALL";
        const markup = options.map((v) => {
            const label = v === "ALL" ? "All" : formatEnumLabel(v);
            const sel = v === prev ? " selected" : "";
            return `<option value="${escapeHtml(v)}"${sel}>${escapeHtml(label)}</option>`;
        }).join("");
        if (refs.moveDraftTargetElementSelect.dataset.options !== markup) {
            refs.moveDraftTargetElementSelect.innerHTML = markup;
            refs.moveDraftTargetElementSelect.dataset.options = markup;
        }
    }

    function syncMoveDraftTargetElementUi() {
        if (!refs.moveDraftTargetElementWrap || !refs.moveDraftPassiveSelect || !refs.moveDraftTargetSelect) {
            return;
        }
        const passive = refs.moveDraftPassiveSelect.value === "true";
        const tt = String(refs.moveDraftTargetSelect.value || "").trim();
        const supportsElementFilter = tt.includes("ALLY") || tt.includes("ENEMY");
        refs.moveDraftTargetElementWrap.classList.toggle("hidden", !(passive && supportsElementFilter));
    }

    function onMoveDraftPassiveChange() {
        if (!refs.moveDraftPassiveSelect || !refs.moveDraftTargetSelect) {
            return;
        }
        if (refs.moveDraftPassiveSelect.value === "true") {
            // Passives can still have real targets (e.g. ALL_ALLIES) — don't force PASSIVE.
            const current = String(refs.moveDraftTargetSelect.value || "").trim();
            if (!current || current === "PASSIVE") {
                populateSelect(refs.moveDraftTargetSelect, state.metadata?.targetTypes || [], "ALL_ALLIES");
            } else {
                populateSelect(refs.moveDraftTargetSelect, state.metadata?.targetTypes || [], current);
            }
            if (refs.moveDraftEnergyInput) {
                refs.moveDraftEnergyInput.value = "0";
            }
        }
        syncMoveDraftTargetRowUi();
        populateMoveDraftTargetElementOptions();
        syncMoveDraftTargetElementUi();
        syncMoveDraftAutoDescription();
        renderMoveDraftLivePanels();
    }

    function saveMoveDraftToPool() {
        const draftRaw = readMoveDraftFromForm();
        const id = String(refs.moveDraftIdInput?.value || "").trim();
        if (!id) {
            setStatus("Give the move a non-empty id before saving to the pool.", "warning");
            return;
        }
        if (!draftRaw.name.trim()) {
            setStatus("Give the move a name before saving.", "warning");
            return;
        }
        const next = normalizeMoveFromServer({ ...buildExportMove(draftRaw), id });
        if (!next) {
            setStatus("Could not normalize this move; check required fields.", "warning");
            return;
        }
        const originalId = state.moveDraftEditingOriginalId
            ? String(state.moveDraftEditingOriginalId).trim()
            : null;
        if (originalId && originalId !== next.id) {
            const oldIdx = state.movesPool.findIndex((m) => m.id === originalId);
            if (oldIdx >= 0) {
                state.movesPool.splice(oldIdx, 1);
                migrateMoveIdOnAllCards(originalId, next.id);
            }
        }
        const idx = state.movesPool.findIndex((m) => m.id === next.id);
        if (idx >= 0) {
            state.movesPool.splice(idx, 1, next);
        } else {
            state.movesPool.push(next);
        }
        state.movesPool.sort((a, b) => {
            const elCmp = a.element.localeCompare(b.element);
            return elCmp !== 0 ? elCmp : a.name.localeCompare(b.name);
        });
        state.dirty = true;
        state.validation = validateDashboard();
        setStatus(`Saved move "${next.id}" to the shared pool.`, "warning");
        state.moveDraftEditingOriginalId = next.id;
        state.movesPoolIsNewDraft = false;
        state.selectedMoveId = next.id;
        state.movesPoolFormEpoch += 1;
        if (state.editorPage === "MOVES_POOL") {
            if (refs.moveDraftPanel) {
                refs.moveDraftPanel.style.display = "grid";
            }
        } else {
            hideMoveDraft();
        }
        renderAll();
    }

    function populateMovePickerElementFilterOptions() {
        if (!refs.movePickerElementFilter) {
            return;
        }
        const elements = state.metadata?.elements || [];
        const options = ["ALL", ...elements];
        const prev = refs.movePickerElementFilter.value;
        const markup = options.map((v) => {
            const label = v === "ALL" ? "All" : formatEnumLabel(v);
            const sel = v === (prev || "ALL") ? " selected" : "";
            return `<option value="${escapeHtml(v)}"${sel}>${escapeHtml(label)}</option>`;
        }).join("");
        if (refs.movePickerElementFilter.dataset.options !== markup) {
            refs.movePickerElementFilter.innerHTML = markup;
            refs.movePickerElementFilter.dataset.options = markup;
        }
        if (options.includes(prev)) {
            refs.movePickerElementFilter.value = prev;
        }
    }

    function openMovePickerModal(slotIndex) {
        const card = getSelectedCard();
        if (!card || card.cardType !== "SIEGLING") {
            return;
        }
        let slot = slotIndex;
        if (slot < 0) {
            slot = Math.min(4, (card.moveIds || []).length);
        }
        state.movePickerSlot = Math.max(0, Math.min(4, slot));
        populateMovePickerElementFilterOptions();
        refs.movePickerOverlay?.classList.remove("hidden");
        document.body.classList.add("move-picker-open");
        renderMovePickerList();
    }

    function closeMovePickerModal() {
        refs.movePickerOverlay?.classList.add("hidden");
        document.body.classList.remove("move-picker-open");
    }

    function renderMovePickerList() {
        if (!refs.movePickerList) {
            return;
        }
        const q = String(refs.movePickerSearch?.value || "").trim().toLowerCase();
        const elFilter = refs.movePickerElementFilter?.value || "ALL";
        const maxEn = toNumber(refs.movePickerEnergyFilter?.value, 99);
        const catFilter = refs.movePickerCategoryFilter?.value || "ALL";
        const list = (state.movesPool || []).filter((m) => {
            if (elFilter !== "ALL" && m.element !== elFilter) {
                return false;
            }
            if (catFilter !== "ALL" && m.category !== catFilter) {
                return false;
            }
            const passive = m.isPassive || m.targetType === "PASSIVE";
            const cost = passive ? 0 : toNumber(m.energyCost, 0);
            if (maxEn < 99 && cost > maxEn) {
                return false;
            }
            if (!q) {
                return true;
            }
            return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
        });
        if (list.length === 0) {
            refs.movePickerList.innerHTML = `<div class="move-picker-empty">No moves match these filters.</div>`;
            return;
        }
        refs.movePickerList.innerHTML = list.map((m) => {
            const passive = m.isPassive || m.targetType === "PASSIVE";
            const costLabel = passive ? "Passive" : `${m.energyCost} en`;
            return `
            <div class="move-picker-row">
                <div class="move-picker-row-main">
                    <strong>${escapeHtml(m.name)}</strong>
                    <span class="move-picker-meta">${escapeHtml(formatEnumLabel(m.element))} · ${escapeHtml(costLabel)} · ${escapeHtml(m.category || "STANDARD")}</span>
                    <div class="move-picker-desc">${escapeHtml(m.description || "")}</div>
                    <div class="move-picker-id">${escapeHtml(m.id)}</div>
                </div>
                <div class="move-picker-row-actions">
                    <button type="button" class="btn btn-primary btn-sm" data-pick-move-id="${escapeHtml(m.id)}">Assign</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-copy-pool-move-id="${escapeHtml(m.id)}">Copy to editor</button>
                </div>
            </div>`;
        }).join("");
    }

    function pickMoveForSlot(moveId) {
        const card = getSelectedCard();
        if (!card || card.cardType !== "SIEGLING") {
            return;
        }
        const mid = String(moveId || "").trim();
        if (!mid || !findMoveById(mid)) {
            return;
        }
        const slot = state.movePickerSlot ?? 0;
        mutateSelectedCard((c) => {
            const ids = [...(c.moveIds || [])].slice(0, 5);
            if (slot < ids.length) {
                ids[slot] = mid;
            } else if (ids.length < 5) {
                ids.push(mid);
            }
            c.moveIds = ids.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 5);
        });
        closeMovePickerModal();
    }

    function onMovePickerListClick(event) {
        const pick = event.target.closest("[data-pick-move-id]");
        if (pick) {
            pickMoveForSlot(pick.dataset.pickMoveId);
            return;
        }
        const copyBtn = event.target.closest("[data-copy-pool-move-id]");
        if (copyBtn) {
            copyMoveToDraft(copyBtn.dataset.copyPoolMoveId);
            closeMovePickerModal();
        }
    }

    function onSieglingAssignedMovesClick(event) {
        const rm = event.target.closest("[data-remove-move-slot]");
        if (rm) {
            const slot = Number(rm.dataset.removeMoveSlot);
            mutateSelectedCard((c) => {
                const ids = [...(c.moveIds || [])];
                if (!Number.isFinite(slot) || slot < 0 || slot >= ids.length) {
                    return;
                }
                ids.splice(slot, 1);
                c.moveIds = ids;
            });
            return;
        }
        const assign = event.target.closest("[data-assign-move-slot]");
        if (assign && !assign.disabled) {
            openMovePickerModal(Number(assign.dataset.assignMoveSlot));
        }
        const copyAssigned = event.target.closest("[data-copy-assigned-move]");
        if (copyAssigned) {
            copyMoveToDraft(copyAssigned.dataset.copyAssignedMove);
        }
    }

    function renderSieglingMovesUI(card) {
        if (state.editorPage === "SIEGLING") {
            hideMoveDraft();
        }
        if (!refs.sieglingAssignedMoves) {
            return;
        }
        const ids = (card.moveIds || []).slice(0, 5);
        const rows = [];
        for (let i = 0; i < 5; i += 1) {
            if (i < ids.length) {
                const mid = ids[i];
                const mv = findMoveById(mid);
                const title = mv ? mv.name : mid;
                const passive = mv && (mv.isPassive || mv.targetType === "PASSIVE");
                const costLabel = mv ? (passive ? "Passive" : `${mv.energyCost} energy`) : "?";
                rows.push(`
                <div class="move-assigned-row">
                    <div class="move-assigned-body">
                        <div class="move-assigned-title">${escapeHtml(title)}</div>
                        <div class="move-assigned-meta">${escapeHtml(costLabel)}${mv ? ` · ${escapeHtml(formatEnumLabel(mv.element))}` : ""}${mv ? ` · ${escapeHtml(mv.category || "STANDARD")}` : ""}</div>
                        <div class="move-assigned-desc">${escapeHtml(mv?.description || "Resolve this id in the moves pool.")}</div>
                        <div class="move-assigned-id">${escapeHtml(mid)}</div>
                    </div>
                    <div class="move-assigned-actions">
                        <button type="button" class="btn btn-secondary btn-sm" data-assign-move-slot="${i}">Change</button>
                        <button type="button" class="btn btn-secondary btn-sm" data-copy-assigned-move="${escapeHtml(mid)}">Copy</button>
                        <button type="button" class="btn btn-danger btn-sm" data-remove-move-slot="${i}">Remove</button>
                    </div>
                </div>`);
            } else if (i === ids.length && ids.length < 5) {
                rows.push(`
                <div class="move-assigned-row move-assigned-row-empty">
                    <div class="move-assigned-body">
                        <div class="move-assigned-title">Add move (${ids.length + 1} / 5)</div>
                        <div class="move-assigned-desc">Pick from the pool or create a new move, then assign it here.</div>
                    </div>
                    <div class="move-assigned-actions">
                        <button type="button" class="btn btn-primary btn-sm" data-assign-move-slot="${i}">Pick move</button>
                    </div>
                </div>`);
            } else {
                rows.push(`
                <div class="move-assigned-row move-assigned-row-locked">
                    <div class="move-assigned-body">
                        <div class="move-assigned-title">Slot ${i + 1}</div>
                        <div class="move-assigned-desc">Fill previous slots first.</div>
                    </div>
                </div>`);
            }
        }
        refs.sieglingAssignedMoves.innerHTML = rows.join("");
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
