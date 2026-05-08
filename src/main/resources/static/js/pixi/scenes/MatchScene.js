import { FxLayer } from "../fx/FxLayer.js";
import { TargetArrowLayer } from "../fx/TargetArrowLayer.js";

const CELL_SIZE = 120;
const GRID_GAP = 14;
const ELEMENT_NAMES = [
    "FIRE",
    "EARTH",
    "WIND",
    "WATER",
    "ICE",
    "SHADOW",
    "ELECTRIC",
    "METAL",
    "UNDEAD",
    "PSYCHIC"
];

function containsCoord(list, row, col, side = "player") {
    return Array.isArray(list) && list.some((p) => p.row === row && p.col === col && (p.side || "player") === side);
}

function cardColor(element) {
    switch (element) {
        case "FIRE": return 0xff6b45;
        case "EARTH": return 0xb89055;
        case "WIND": return 0x8cf0ae;
        case "WATER": return 0x4f8dff;
        case "ICE": return 0x7fe6ff;
        case "SHADOW": return 0x7f52b9;
        case "ELECTRIC": return 0xffe34b;
        case "METAL": return 0xa6b0bb;
        case "UNDEAD": return 0x927ea6;
        case "PSYCHIC": return 0xd2a7ff;
        default: return 0x6d7e8f;
    }
}

function cloneBoard(board) {
    return (board || []).map((row) => (row || []).map((cell) => (cell ? { ...cell } : null)));
}

function boardCellHp(cell) {
    if (!cell) {
        return 0;
    }
    const v = cell.hp ?? cell.health;
    return Number(v) || 0;
}

function boardsEqualByHp(prevBoard, nextBoard) {
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            const prev = prevBoard?.[row]?.[col] || null;
            const next = nextBoard?.[row]?.[col] || null;
            const prevKey = prev ? `${prev.instanceId || prev.id || prev.name}:${boardCellHp(prev)}` : "0";
            const nextKey = next ? `${next.instanceId || next.id || next.name}:${boardCellHp(next)}` : "0";
            if (prevKey !== nextKey) {
                return false;
            }
        }
    }
    return true;
}

export class MatchScene {
    constructor(PIXI, bridge) {
        this.PIXI = PIXI;
        this.bridge = bridge;
        this.container = new PIXI.Container();

        this.camera = new PIXI.Container();
        this.container.addChild(this.camera);

        this.bg = new PIXI.Graphics();
        this.camera.addChild(this.bg);

        this.hud = new PIXI.Container();
        this.camera.addChild(this.hud);

        this.boardLayer = new PIXI.Container();
        this.camera.addChild(this.boardLayer);

        this.targetArrowLayer = new TargetArrowLayer(this.PIXI);
        this.camera.addChild(this.targetArrowLayer.container);

        this.handLayer = new PIXI.Container();
        this.camera.addChild(this.handLayer);

        this.dragLayer = new PIXI.Container();
        this.camera.addChild(this.dragLayer);

        this.fx = new FxLayer(PIXI);
        this.camera.addChild(this.fx.container);

        this.lastFrameTs = performance.now();
        this.lastHealth = null;
        this.lastRenderKey = "";
        this.fpsLabel = null;
        this.lastPhase = "";
        this.currentViewModel = null;
        this.playerCellHitZones = [];
        this.dragState = null;
        this.cellSignatureMap = new Map();
        this.prevBoards = null;
        this.lastLogLength = 0;
        this.enemyOrigin = { x: 0, y: 0 };
        this.playerOrigin = { x: 0, y: 0 };

        if (this.bridge?.preview?.setPixiController) {
            this.bridge.preview.setPixiController({
                show: (source, targets, kind) => this.showTargetingPreview(source, targets, kind),
                clear: () => this.clearTargetingPreview(),
                cellCenter: (isPlayer, row, col) => this.cellCenter(isPlayer, row, col)
            });
        }
    }

    show() {
        this.container.visible = true;
    }

    hide() {
        this.container.visible = false;
    }

    resize(width, height) {
        this.size = { width, height };
    }

    updateFx() {
        const now = performance.now();
        const delta = now - this.lastFrameTs;
        this.lastFrameTs = now;
        this.targetArrowLayer.update(delta);
        this.fx.update(delta);
    }

    render(viewModel) {
        this.updateFx();
        this.currentViewModel = viewModel;
        const width = this.size?.width || 1280;
        const height = this.size?.height || 720;
        // Run every frame so attack FX still fire if renderKey skips a heavy redraw (Pixi ticker vs. DOM render).
        this.detectStateEffects(viewModel, width, height);

        if (viewModel.renderKey && viewModel.renderKey === this.lastRenderKey) {
            if (this.fpsLabel) {
                this.fpsLabel.text = `FPS ${viewModel.fps || 0}`;
            }
            return;
        }
        this.lastRenderKey = viewModel.renderKey || "";

        this.bg.clear();
        this.bg.rect(0, 0, width, height).fill(0x131a2a);
        this.bg.rect(0, 0, width, 74).fill(0x0f1730);
        this.bg.rect(0, height - 210, width, 210).fill(0x10182e);

        this.renderHud(viewModel, width);
        this.renderBoards(viewModel, width, height);
        this.renderHand(viewModel, width, height);
    }

    renderHud(viewModel, width) {
        this.hud.removeChildren();

        const title = new this.PIXI.Text({
            text: `${viewModel.enemyName} ${viewModel.enemyHealth} HP   |   ${viewModel.phase} T${viewModel.turnNumber}   |   ${viewModel.playerName} ${viewModel.playerHealth} HP`,
            style: {
                fill: 0xf0f3ff,
                fontSize: 22,
                fontWeight: "700"
            }
        });
        title.anchor.set(0.5, 0);
        title.position.set(width / 2, 20);
        this.hud.addChild(title);

        const hint = new this.PIXI.Text({
            text: viewModel.targetMode
                ? "Select a highlighted target cell"
                : "Click a hand card, then click a highlighted board cell",
            style: {
                fill: viewModel.targetMode ? 0xffd580 : 0x91a9c8,
                fontSize: 16
            }
        });
        hint.anchor.set(0.5, 0);
        hint.position.set(width / 2, 50);
        this.hud.addChild(hint);

        const controls = [
            { label: "Draw", action: () => this.bridge.actions.playerDraw() },
            { label: "Battle", action: () => this.bridge.actions.executeBattle() },
            { label: "End Turn", action: () => this.bridge.actions.endTurn() },
            { label: "Loadout", action: () => this.bridge.actions.openLoadoutSelector() }
        ];
        let x = Math.max(120, (width / 2) - 270);
        for (const control of controls) {
            const btn = this.createActionButton(control.label, x, 104, control.action);
            this.hud.addChild(btn);
            x += 180;
        }

        const perf = new this.PIXI.Text({
            text: `FPS ${viewModel.fps || 0}`,
            style: { fill: 0x7f9cc2, fontSize: 13 }
        });
        perf.anchor.set(1, 0);
        perf.position.set(width - 20, 16);
        this.hud.addChild(perf);
        this.fpsLabel = perf;
    }

    createActionButton(label, x, y, onTap) {
        const button = new this.PIXI.Container();
        const bg = new this.PIXI.Graphics();
        bg.roundRect(-70, -18, 140, 36, 10).fill(0x30476f);
        bg.roundRect(-70, -18, 140, 36, 10).stroke({ color: 0x86a0d8, width: 2 });
        button.addChild(bg);
        const text = new this.PIXI.Text({
            text: label,
            style: { fill: 0xf5f8ff, fontSize: 15, fontWeight: "700" }
        });
        text.anchor.set(0.5);
        button.addChild(text);
        button.position.set(x, y);
        button.eventMode = "static";
        button.cursor = "pointer";
        button.on("pointertap", onTap);
        return button;
    }

    renderBoards(viewModel, width, height) {
        this.boardLayer.removeChildren();
        this.playerCellHitZones = [];

        const boardW = (CELL_SIZE * 3) + (GRID_GAP * 2);
        const enemyOrigin = {
            x: Math.round((width - boardW) / 2),
            y: Math.round(height * 0.16)
        };
        const playerOrigin = {
            x: Math.round((width - boardW) / 2),
            y: Math.round(height * 0.48)
        };
        this.enemyOrigin = enemyOrigin;
        this.playerOrigin = playerOrigin;

        this.drawBoard("Enemy", viewModel.enemyBoard, enemyOrigin, false, viewModel);
        this.drawBoard("Player", viewModel.playerBoard, playerOrigin, true, viewModel);
    }

    drawBoard(label, board, origin, isPlayer, viewModel) {
        const labelText = new this.PIXI.Text({
            text: label,
            style: {
                fill: isPlayer ? 0x8cf5b1 : 0xff9ea0,
                fontSize: 20,
                fontWeight: "700"
            }
        });
        labelText.position.set(origin.x, origin.y - 30);
        this.boardLayer.addChild(labelText);

        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const x = origin.x + (col * (CELL_SIZE + GRID_GAP));
                const y = origin.y + (row * (CELL_SIZE + GRID_GAP));
                const cell = board?.[row]?.[col] || null;

                const boardSide = isPlayer ? "player" : "enemy";
                const legal = isPlayer && containsCoord(viewModel.legalPlacements, row, col, "player");
                const targetable = containsCoord(viewModel.targetableCells, row, col, boardSide);
                const claimable = isPlayer && containsCoord(viewModel.claimableCells, row, col, "player");

                const ah = viewModel.arenaHighlight;
                const arenaSelected = Boolean(
                    cell
                    && ah
                    && ah.isPlayer === isPlayer
                    && ah.row === row
                    && ah.col === col
                    && cell.instanceId === ah.instanceId
                );

                const cellGraphic = new this.PIXI.Graphics();
                cellGraphic.roundRect(x, y, CELL_SIZE, CELL_SIZE, 14).fill(0x1d2945);
                cellGraphic.roundRect(x, y, CELL_SIZE, CELL_SIZE, 14).stroke({
                    color: arenaSelected
                        ? 0xffe08a
                        : (legal ? 0x65ff99 : (targetable ? 0xffc270 : (claimable ? 0x84d0ff : 0x4b6284))),
                    width: arenaSelected ? 5 : (legal || targetable || claimable ? 4 : 2)
                });
                cellGraphic.eventMode = "static";
                cellGraphic.cursor = legal || targetable || claimable || cell ? "pointer" : "default";
                cellGraphic.on("pointertap", () => {
                    if (legal) {
                        this.bridge.actions.placeCard(row, col);
                    } else if (targetable) {
                        this.bridge.actions.onTargetSelected(row, col, isPlayer);
                    } else if (claimable) {
                        this.bridge.actions.openClaimPopup(row, col);
                    } else if (cell) {
                        this.bridge.actions.focusArenaCard(isPlayer, row, col);
                    }
                });
                this.boardLayer.addChild(cellGraphic);
                if (isPlayer) {
                    this.playerCellHitZones.push({
                        row,
                        col,
                        x,
                        y,
                        w: CELL_SIZE,
                        h: CELL_SIZE,
                        legal,
                        targetable,
                        claimable
                    });
                }

                if (!cell) {
                    if (legal) {
                        const text = new this.PIXI.Text({
                            text: "+ Place",
                            style: { fill: 0x89ffb0, fontSize: 18, fontWeight: "700" }
                        });
                        text.anchor.set(0.5);
                        text.position.set(x + (CELL_SIZE / 2), y + (CELL_SIZE / 2));
                        this.boardLayer.addChild(text);
                    }
                    continue;
                }

                const slot = new this.PIXI.Container();
                slot.position.set(x, y);
                this.boardLayer.addChild(slot);

                this.drawBoardCard(slot, cell);

                const slotKey = `${isPlayer ? "P" : "E"}:${row}:${col}`;
                const slotSignature = `${cell.instanceId || cell.id || cell.name}:${cell.hp || 0}:${cell.maxHp || 0}`;
                const previousSig = this.cellSignatureMap.get(slotKey) || "";
                this.cellSignatureMap.set(slotKey, slotSignature);
                if (previousSig && previousSig !== slotSignature) {
                    slot.scale.set(0.86);
                    slot.alpha = 0.2;
                    this.fx.tween(210, (t) => {
                        slot.scale.set(0.86 + (0.14 * t));
                        slot.alpha = 0.2 + (0.8 * t);
                    });
                    this.fx.glowPulse(slot, 0xffdd80, 260);
                } else if (!previousSig) {
                    slot.scale.set(0.92);
                    slot.alpha = 0.35;
                    this.fx.tween(190, (t) => {
                        slot.scale.set(0.92 + (0.08 * t));
                        slot.alpha = 0.35 + (0.65 * t);
                    });
                }
            }
        }
    }

    drawBoardCard(slot, cell) {
        const PAD = 8;
        const inner = CELL_SIZE - PAD * 2;
        const elColor = cardColor(cell.element);

        // Card background
        const bg = new this.PIXI.Graphics();
        bg.roundRect(PAD, PAD, inner, inner, 10).fill(0x19253c);
        bg.roundRect(PAD, PAD, inner, inner, 10).stroke({ color: 0x0e1220, width: 1.5 });
        slot.addChild(bg);

        // Element colour band across the top (6px strip)
        const band = new this.PIXI.Graphics();
        band.roundRect(PAD, PAD, inner, 6, { tl: 10, tr: 10, bl: 0, br: 0 }).fill(elColor);
        slot.addChild(band);

        // Card name
        const name = new this.PIXI.Text({
            text: cell.name || "Siegling",
            style: {
                fill: 0xf0f4ff,
                fontSize: 12,
                fontWeight: "700",
                wordWrap: true,
                wordWrapWidth: inner - 8
            }
        });
        name.anchor.set(0.5, 0);
        name.position.set(CELL_SIZE / 2, PAD + 10);
        slot.addChild(name);

        // HP bar background + fill
        const hp = Math.max(0, cell.hp ?? 0);
        const maxHp = Math.max(1, cell.maxHp ?? hp);
        const hpRatio = hp / maxHp;
        const barX = PAD + 6;
        const barY = CELL_SIZE - PAD - 18;
        const barW = inner - 12;
        const barH = 6;

        const barBg = new this.PIXI.Graphics();
        barBg.roundRect(barX, barY, barW, barH, 3).fill(0x0a1020);
        slot.addChild(barBg);

        const hpColor = hpRatio > 0.5 ? 0x3de87a : hpRatio > 0.25 ? 0xffc940 : 0xff4444;
        const barFill = new this.PIXI.Graphics();
        barFill.roundRect(barX, barY, Math.max(4, barW * hpRatio), barH, 3).fill(hpColor);
        slot.addChild(barFill);

        // HP and SPD text below bar
        const stats = new this.PIXI.Text({
            text: `${hp}/${maxHp}  ⚡${cell.spd ?? "?"}`,
            style: { fill: 0xb0c4de, fontSize: 10, fontWeight: "600" }
        });
        stats.anchor.set(0.5, 0);
        stats.position.set(CELL_SIZE / 2, barY + barH + 2);
        slot.addChild(stats);

        // Notch dots — up to 4 cardinal positions shown as small coloured circles
        if (Array.isArray(cell.notches) && cell.notches.length > 0) {
            const notchPositions = {
                TOP:    { dx: CELL_SIZE / 2, dy: PAD + 2 },
                BOTTOM: { dx: CELL_SIZE / 2, dy: CELL_SIZE - PAD - 2 },
                LEFT:   { dx: PAD + 2,       dy: CELL_SIZE / 2 },
                RIGHT:  { dx: CELL_SIZE - PAD - 2, dy: CELL_SIZE / 2 }
            };
            const notchG = new this.PIXI.Graphics();
            for (const notch of cell.notches) {
                const pos = notchPositions[notch.direction];
                if (!pos) continue;
                const nc = cardColor(notch.element || cell.element);
                notchG.circle(pos.dx, pos.dy, 4).fill(nc);
                notchG.circle(pos.dx, pos.dy, 4).stroke({ color: 0x000000, width: 1 });
            }
            slot.addChild(notchG);
        }

        // Status tint — frozen cards get a blue overlay
        if (Array.isArray(cell.statuses) && cell.statuses.some(s => String(s).toUpperCase() === "FREEZE")) {
            const frost = new this.PIXI.Graphics();
            frost.roundRect(PAD, PAD, inner, inner, 10).fill({ color: 0x7adfff, alpha: 0.22 });
            slot.addChild(frost);
        }
    }

    createHandCardContainer(card, x, y, cardW, cardH, selected, lockReason) {
        const cardContainer = new this.PIXI.Container();
        cardContainer.position.set(x, y - (selected ? 22 : 0));
        cardContainer.eventMode = "static";
        cardContainer.cursor = "pointer";
        cardContainer.hitArea = new this.PIXI.Rectangle(0, 0, cardW, cardH);
        cardContainer.cardId = card.id;
        cardContainer.handLocked = Boolean(lockReason);

        const elColor = cardColor(card.element);
        const borderColor = lockReason ? 0x3a4558 : (selected ? 0xffd76a : elColor);
        const borderW = selected ? 3 : 1.5;

        // Card body
        const bg = new this.PIXI.Graphics();
        bg.roundRect(0, 0, cardW, cardH, 10).fill(lockReason ? 0x111825 : 0x18243c);
        bg.roundRect(0, 0, cardW, cardH, 10).stroke({ color: borderColor, width: borderW });
        cardContainer.addChild(bg);

        // Element band at top
        const band = new this.PIXI.Graphics();
        band.roundRect(0, 0, cardW, 5, { tl: 10, tr: 10, bl: 0, br: 0 }).fill(lockReason ? 0x3a4558 : elColor);
        cardContainer.addChild(band);

        // Selected glow
        if (selected) {
            const glow = new this.PIXI.Graphics();
            glow.roundRect(-3, -3, cardW + 6, cardH + 6, 13).stroke({ color: 0xffd76a, width: 2, alpha: 0.45 });
            cardContainer.addChild(glow);
        }

        // Card name
        const title = new this.PIXI.Text({
            text: card.name || card.type,
            style: {
                fill: lockReason ? 0x6a7a94 : 0xf0f4ff,
                fontSize: Math.max(10, Math.round(cardW * 0.105)),
                fontWeight: "700",
                wordWrap: true,
                wordWrapWidth: cardW - 8
            }
        });
        title.anchor.set(0.5, 0);
        title.position.set(cardW / 2, 9);
        cardContainer.addChild(title);

        // Type badge pill
        const typeColors = { SIEGLING: 0x533483, SPELL: 0xa02038, TRAP: 0x1a5a7a };
        const typeColor = typeColors[card.type] || 0x2a3755;
        const badgeY = 9 + title.height + 3;
        const badge = new this.PIXI.Graphics();
        badge.roundRect(cardW / 2 - 26, badgeY, 52, 14, 4).fill(typeColor);
        cardContainer.addChild(badge);

        const badgeText = new this.PIXI.Text({
            text: card.type,
            style: { fill: 0xe8eeff, fontSize: 9, fontWeight: "700" }
        });
        badgeText.anchor.set(0.5, 0.5);
        badgeText.position.set(cardW / 2, badgeY + 7);
        cardContainer.addChild(badgeText);

        // Stats for Sieglings (HP / SPD)
        if (card.type === "SIEGLING" && (card.health || card.speed)) {
            const statsY = badgeY + 18;
            const statsText = new this.PIXI.Text({
                text: `HP ${card.health ?? "?"}  SPD ${card.speed ?? "?"}`,
                style: { fill: 0x8aaccc, fontSize: 10, fontWeight: "600" }
            });
            statsText.anchor.set(0.5, 0);
            statsText.position.set(cardW / 2, statsY);
            cardContainer.addChild(statsText);
        }

        // Cost or trigger line at bottom
        let costLabel = "";
        if (card.costAmount && card.costElement) {
            costLabel = `${card.costAmount} ${card.costElement.charAt(0) + card.costElement.slice(1).toLowerCase()}`;
        } else if (card.trapBucketAmount && card.trapBucketElement) {
            costLabel = `Trigger: ${card.trapBucketAmount} ${card.trapBucketElement}`;
        } else if (card.requiredComboSize) {
            costLabel = `Combo ×${card.requiredComboSize}`;
        }
        if (costLabel) {
            const costText = new this.PIXI.Text({
                text: costLabel,
                style: { fill: 0xe2b714, fontSize: 9, fontWeight: "600" }
            });
            costText.anchor.set(0.5, 1);
            costText.position.set(cardW / 2, cardH - 6);
            cardContainer.addChild(costText);
        }

        // Lock reason overlay
        if (lockReason) {
            const lockOverlay = new this.PIXI.Graphics();
            lockOverlay.roundRect(0, 0, cardW, cardH, 10).fill({ color: 0x000000, alpha: 0.35 });
            cardContainer.addChild(lockOverlay);
            cardContainer.alpha = 0.65;
        }

        return cardContainer;
    }

    beginDrag(card, handIndex, event, cardContainer) {
        const pointer = event.global;
        const origin = cardContainer.getGlobalPosition();
        this.dragState = {
            card,
            cardId: card.id,
            handIndex,
            container: cardContainer,
            startX: pointer.x,
            startY: pointer.y,
            originX: origin.x,
            originY: origin.y,
            offsetX: pointer.x - origin.x,
            offsetY: pointer.y - origin.y,
            moved: false,
            isDragging: false
        };
    }

    updateDrag(event) {
        if (!this.dragState) {
            return;
        }
        const pointer = event.global;
        const dx = pointer.x - this.dragState.startX;
        const dy = pointer.y - this.dragState.startY;
        if (!this.dragState.isDragging && ((dx * dx) + (dy * dy)) > 64) {
            const locks = this.currentViewModel?.playerHandLockReasons;
            if (locks && locks[this.dragState.handIndex]) {
                return;
            }
            this.dragState.isDragging = true;
            this.dragState.container.alpha = 0.92;
            this.dragLayer.addChild(this.dragState.container);
        }
        if (this.dragState.isDragging) {
            const localX = pointer.x - this.dragState.offsetX;
            const localY = pointer.y - this.dragState.offsetY;
            this.dragState.container.position.set(localX, localY);
        }
    }

    findDropZone(point) {
        return this.playerCellHitZones.find((zone) =>
            point.x >= zone.x
            && point.x <= (zone.x + zone.w)
            && point.y >= zone.y
            && point.y <= (zone.y + zone.h)
        ) || null;
    }

    endDrag(event) {
        if (!this.dragState) {
            return;
        }
        const drag = this.dragState;
        this.dragState = null;
        drag.container.alpha = drag.container.handLocked ? 0.55 : 1;

        if (!drag.isDragging) {
            this.bridge.actions.selectCard(drag.handIndex);
            return;
        }

        const dropPoint = event.global;
        const zone = this.findDropZone(dropPoint);
        if (!zone) {
            return;
        }

        const executeDrop = () => {
            if (zone.legal) {
                this.bridge.actions.placeCard(zone.row, zone.col);
                return;
            }
            if (zone.targetable) {
                this.bridge.actions.onTargetSelected(zone.row, zone.col, true);
                return;
            }
            if (zone.claimable) {
                this.bridge.actions.openClaimPopup(zone.row, zone.col);
            }
        };

        if (this.currentViewModel?.selectedHandIndex !== drag.handIndex) {
            this.bridge.actions.selectCard(drag.handIndex);
            window.setTimeout(executeDrop, 0);
        } else {
            executeDrop();
        }
    }

    renderHand(viewModel, width, height) {
        this.dragLayer.removeChildren();
        this.handLayer.removeChildren();
        const cards = viewModel.playerHand || [];
        if (cards.length === 0) {
            return;
        }

        const cardW = Math.min(128, Math.max(92, Math.round(width / 12)));
        const cardH = Math.round(cardW * 1.4);
        const gap = Math.max(10, Math.round(cardW * 0.14));
        const total = (cards.length * cardW) + ((cards.length - 1) * gap);
        let x = Math.max(16, Math.round((width - total) / 2));
        const y = height - cardH - 24;

        for (let handIndex = 0; handIndex < cards.length; handIndex++) {
            const card = cards[handIndex];
            const selected = viewModel.selectedHandIndex === handIndex;
            const lockReason = viewModel.playerHandLockReasons?.[handIndex] || "";
            const cardContainer = this.createHandCardContainer(card, x, y, cardW, cardH, selected, lockReason);
            cardContainer.handIndex = handIndex;
            cardContainer.on("pointerdown", (event) => this.beginDrag(card, handIndex, event, cardContainer));
            cardContainer.on("pointermove", (event) => this.updateDrag(event));
            cardContainer.on("pointerup", (event) => this.endDrag(event));
            cardContainer.on("pointerupoutside", (event) => this.endDrag(event));
            this.handLayer.addChild(cardContainer);

            x += cardW + gap;
        }
    }

    detectStateEffects(viewModel, width, height) {
        this.animateDamageEvents(viewModel, width, height);

        if (this.lastPhase && viewModel.phase !== this.lastPhase) {
            this.fx.phaseFlash(width, height, viewModel.phase);
            this.fx.cameraShake(this.camera, 6, 180);
        }
        this.lastPhase = viewModel.phase;

        if (!this.lastHealth) {
            this.lastHealth = {
                playerHealth: viewModel.playerHealth,
                enemyHealth: viewModel.enemyHealth
            };
            return;
        }

        if (viewModel.playerHealth < this.lastHealth.playerHealth) {
            this.fx.cameraShake(this.camera, 10, 260);
            this.fx.floatingText(`-${this.lastHealth.playerHealth - viewModel.playerHealth}`, width * 0.75, 120, 0xff6a6a);
            this.fx.impactBurst(width * 0.75, 140, 0xff6a6a);
        }

        if (viewModel.enemyHealth < this.lastHealth.enemyHealth) {
            this.fx.cameraShake(this.camera, 8, 220);
            this.fx.floatingText(`-${this.lastHealth.enemyHealth - viewModel.enemyHealth}`, width * 0.25, 120, 0x7dff8f);
            this.fx.impactBurst(width * 0.25, 140, 0x7dff8f);
        }

        this.lastHealth.playerHealth = viewModel.playerHealth;
        this.lastHealth.enemyHealth = viewModel.enemyHealth;
    }

    inferElementFromLogLines(lines) {
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            const text = String(lines[i] || "").toUpperCase();
            for (const element of ELEMENT_NAMES) {
                if (text.includes(element)) {
                    return element;
                }
            }
        }
        return null;
    }

    classifyPattern(events) {
        if (events.length <= 1) {
            return "single";
        }
        const firstRow = events[0].row;
        const sameRow = events.every((entry) => entry.row === firstRow);
        if (sameRow) {
            return "row";
        }
        return events.length >= 3 ? "all" : "single";
    }

    getCellCenter(targetSide, row, col) {
        const origin = targetSide === "enemy" ? this.enemyOrigin : this.playerOrigin;
        return {
            x: origin.x + (col * (CELL_SIZE + GRID_GAP)) + (CELL_SIZE / 2),
            y: origin.y + (row * (CELL_SIZE + GRID_GAP)) + (CELL_SIZE / 2)
        };
    }

    cellCenter(isPlayer, row, col) {
        const origin = isPlayer ? this.playerOrigin : this.enemyOrigin;
        if (!origin) {
            return null;
        }
        return {
            x: origin.x + (col * (CELL_SIZE + GRID_GAP)) + (CELL_SIZE / 2),
            y: origin.y + (row * (CELL_SIZE + GRID_GAP)) + (CELL_SIZE / 2)
        };
    }

    sceneCenterY() {
        if (!this.playerOrigin || !this.enemyOrigin) {
            return 0;
        }
        const boardHeight = (CELL_SIZE * 3) + (GRID_GAP * 2);
        return (this.enemyOrigin.y + this.playerOrigin.y + boardHeight) / 2;
    }

    showTargetingPreview(sourceCoord, targetCoords, kind) {
        if (!sourceCoord || !Array.isArray(targetCoords) || targetCoords.length === 0) {
            this.targetArrowLayer.clear();
            return;
        }
        this.targetArrowLayer.setPreview(sourceCoord, targetCoords, kind, this.sceneCenterY());
    }

    clearTargetingPreview() {
        this.targetArrowLayer.clear();
    }

    getAttackOrigin(targetSide, width, height) {
        if (targetSide === "enemy") {
            return { x: width * 0.5, y: height * 0.84 };
        }
        return { x: width * 0.5, y: height * 0.14 };
    }

    animateDamagePattern(targetSide, events, pattern, element, width, height) {
        const color = cardColor(element || "");
        const from = this.getAttackOrigin(targetSide, width, height);
        const sorted = [...events].sort((a, b) => a.col - b.col);
        const projectileMs = this.bridge.attackProjectileMs ?? 1000;
        const baseHoldMs = this.bridge.battleBoardHoldMs ?? 1000;
        let maxEndMs = baseHoldMs;
        sorted.forEach((event, index) => {
            const to = this.getCellCenter(targetSide, event.row, event.col);
            let delay = 0;
            if (pattern === "row") {
                delay = index * 140;
            } else if (pattern === "all") {
                delay = index * 110;
            }
            maxEndMs = Math.max(maxEndMs, delay + projectileMs);
            this.fx.launchProjectile(from, to, {
                color,
                element,
                radius: pattern === "all" ? 8 : 7,
                duration: projectileMs,
                arc: pattern === "single" ? 40 : 58,
                delay,
                onHit: () => {
                    this.fx.impactBurst(to.x, to.y, color);
                    this.fx.floatingDamageText(`-${event.amount}`, to.x, to.y - 8, color);
                }
            });
        });
        const extraHold = Math.max(0, maxEndMs - baseHoldMs);
        if (typeof this.bridge.extendBattleAnimHold === "function") {
            this.bridge.extendBattleAnimHold(extraHold);
        }
    }

    animateDamageEvents(viewModel, width, height) {
        const prevBoards = this.prevBoards;
        const nextBoards = {
            playerBoard: cloneBoard(viewModel.truePlayerBoard || viewModel.playerBoard),
            enemyBoard: cloneBoard(viewModel.trueEnemyBoard || viewModel.enemyBoard)
        };
        const logs = Array.isArray(viewModel.gameLog) ? viewModel.gameLog : [];
        const newLines = logs.slice(this.lastLogLength);
        this.lastLogLength = logs.length;

        if (!prevBoards) {
            this.prevBoards = nextBoards;
            return;
        }

        if (boardsEqualByHp(prevBoards.playerBoard, nextBoards.playerBoard)
            && boardsEqualByHp(prevBoards.enemyBoard, nextBoards.enemyBoard)) {
            this.prevBoards = nextBoards;
            return;
        }

        const collectDamage = (sideKey) => {
            const prev = prevBoards[sideKey] || [];
            const next = nextBoards[sideKey] || [];
            const entries = [];
            for (let row = 0; row < 3; row += 1) {
                for (let col = 0; col < 3; col += 1) {
                    const prevCell = prev?.[row]?.[col] || null;
                    const nextCell = next?.[row]?.[col] || null;
                    if (!prevCell || !nextCell) {
                        continue;
                    }
                    const amount = boardCellHp(prevCell) - boardCellHp(nextCell);
                    if (amount <= 0) {
                        continue;
                    }
                    const sameCard = (prevCell.instanceId && nextCell.instanceId
                        && prevCell.instanceId === nextCell.instanceId)
                        || (prevCell.id && nextCell.id && prevCell.id === nextCell.id)
                        || (String(prevCell.name || "") === String(nextCell.name || "")
                            && String(prevCell.name || "").length > 0);
                    if (!sameCard) {
                        continue;
                    }
                    entries.push({ row, col, amount });
                }
            }
            return entries;
        };

        const enemyDamage = collectDamage("enemyBoard");
        const playerDamage = collectDamage("playerBoard");
        const element = this.inferElementFromLogLines(newLines) || this.inferElementFromLogLines(logs.slice(-4)) || "FIRE";

        if (enemyDamage.length > 0) {
            this.animateDamagePattern("enemy", enemyDamage, this.classifyPattern(enemyDamage), element, width, height);
        }
        if (playerDamage.length > 0) {
            this.animateDamagePattern("player", playerDamage, this.classifyPattern(playerDamage), element, width, height);
        }

        this.prevBoards = nextBoards;
    }
}
