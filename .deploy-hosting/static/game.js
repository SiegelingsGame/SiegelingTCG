let gameState = null;
let selectedHandIndex = -1;
let selectionMode = null; // 'place', 'castTarget', null

// --- API Calls ---

async function api(url, method = 'POST') {
    const resp = await fetch('/api/game' + url, { method });
    return resp.json();
}

async function startGame(deck) {
    gameState = await api('/new?deck=' + deck);
    document.getElementById('deck-chooser').style.display = 'none';
    document.getElementById('game-screen').style.display = 'grid';
    render();
}

async function advancePhase() {
    gameState = await api('/advance');
    render();
}

async function placeSiegling(row, col) {
    if (selectedHandIndex < 0) return;
    gameState = await api(`/place?handIndex=${selectedHandIndex}&row=${row}&col=${col}`);
    cancelSelection();
    render();
}

async function castSpell(targetRow, targetCol) {
    if (selectedHandIndex < 0) return;
    gameState = await api(`/cast?handIndex=${selectedHandIndex}&targetRow=${targetRow}&targetCol=${targetCol}`);
    cancelSelection();
    render();
}

async function playTrainer(handIndex) {
    gameState = await api(`/trainer?handIndex=${handIndex}`);
    cancelSelection();
    render();
}

// --- Selection ---

function selectCard(index) {
    const card = gameState.player.hand[index];
    if (!card) return;

    if (selectedHandIndex === index) {
        cancelSelection();
        return;
    }

    selectedHandIndex = index;

    if (card.type === 'SIEGLING') {
        selectionMode = 'place';
        highlightLegalPlacements();
    } else if (card.type === 'SPELL') {
        selectionMode = 'castTarget';
        highlightEnemyTargets();
    } else if (card.type === 'TRAINER') {
        playTrainer(index);
        return;
    }

    renderHand();
    document.getElementById('btn-cancel').style.display = 'inline-block';
}

function cancelSelection() {
    selectedHandIndex = -1;
    selectionMode = null;
    document.getElementById('btn-cancel').style.display = 'none';
    clearHighlights();
    renderHand();
}

function highlightLegalPlacements() {
    clearHighlights();
    if (!gameState.legalPlacements) return;
    const cells = document.querySelectorAll('#player-board .board-cell');
    for (const pos of gameState.legalPlacements) {
        // Player board is rendered with row 2 (FRONT) at top, row 0 (BACK) at bottom
        const displayRow = 2 - pos[0];
        const idx = displayRow * 3 + pos[1];
        if (cells[idx]) {
            cells[idx].classList.add('legal');
        }
    }
}

function highlightEnemyTargets() {
    clearHighlights();
    const cells = document.querySelectorAll('#ai-board .board-cell');
    cells.forEach(cell => {
        if (cell.dataset.occupied === 'true') {
            cell.classList.add('legal');
        }
    });
}

function clearHighlights() {
    document.querySelectorAll('.board-cell.legal').forEach(c => c.classList.remove('legal'));
    document.querySelectorAll('.notch-projection').forEach(c => c.remove());
    document.querySelectorAll('.board-cell.notch-target').forEach(c => c.classList.remove('notch-target'));
}

/** Direction offsets for notch projections */
const NOTCH_OFFSETS = {
    'TOP': [0, 1], 'TOP_RIGHT': [1, 1], 'RIGHT': [1, 0], 'BOTTOM_RIGHT': [1, -1],
    'BOTTOM': [0, -1], 'BOTTOM_LEFT': [-1, -1], 'LEFT': [-1, 0], 'TOP_LEFT': [-1, 1]
};

/**
 * Show where the selected card's notches would project from a given board position.
 * Called on hover over a legal placement cell.
 */
function showNotchProjections(row, col) {
    // Clear previous projections
    document.querySelectorAll('.notch-projection').forEach(e => e.remove());
    document.querySelectorAll('.board-cell.notch-target').forEach(c => c.classList.remove('notch-target'));

    if (selectedHandIndex < 0) return;
    const card = gameState.player.hand[selectedHandIndex];
    if (!card || card.type !== 'SIEGLING' || !card.notches) return;

    const cells = document.querySelectorAll('#player-board .board-cell');

    // Show notch circles on the hovered cell (same style as placed cards)
    const srcDisplayRow = 2 - row;
    const srcIdx = srcDisplayRow * 3 + col;
    const srcCell = cells[srcIdx];
    if (!srcCell) return;

    for (const notch of card.notches) {
        const colorClass = notch.element === 'FIRE' ? 'cell-notch-fire' : 'cell-notch-water';
        const dot = document.createElement('div');
        dot.className = `notch-projection cell-notch cell-notch-${notch.direction.toLowerCase()} ${colorClass} notch-preview`;
        srcCell.appendChild(dot);
    }
}

function clearNotchProjections() {
    document.querySelectorAll('.notch-projection').forEach(e => e.remove());
    document.querySelectorAll('.board-cell.notch-target').forEach(c => c.classList.remove('notch-target'));
}

// --- Rendering ---

function render() {
    if (!gameState) return;

    renderTurnInfo();
    renderEnergy();
    renderBoard('ai-board', gameState.ai.board, false);
    renderBoard('player-board', gameState.player.board, true);
    renderHand();
    renderDeckInfo();
    renderTrainers();
    renderGameLog();

    if (gameState.gameOver) {
        document.getElementById('game-over').style.display = 'flex';
        document.getElementById('game-over-text').textContent =
            gameState.winner === 'Player' ? 'VICTORY!' : 'DEFEAT!';
    }

    // Update advance button text
    const btn = document.getElementById('btn-advance');
    const phase = gameState.currentPhase;
    if (phase === 'DRAW') btn.textContent = 'Draw Card';
    else if (phase === 'SETUP') btn.textContent = 'Start Battle';
    else if (phase === 'BATTLE') btn.textContent = 'End Phase';
    else if (phase === 'END') btn.textContent = 'Next Turn';
}

function renderTurnInfo() {
    const el = document.getElementById('turn-info');
    el.innerHTML = `
        <div class="phase-indicator">${gameState.currentPhase} PHASE</div>
        <p>Turn: ${gameState.turnNumber}</p>
        <p>Active: ${gameState.currentPlayer}</p>
    `;
}

function renderEnergy() {
    document.getElementById('player-energy').innerHTML = buildEnergyHTML(gameState.player);
    document.getElementById('ai-energy').innerHTML = buildEnergyHTML(gameState.ai);
}

function buildEnergyHTML(playerData) {
    let html = '<div class="energy-bar">';
    html += `<span class="energy-item energy-fire">&#x1F525; ${playerData.fireEnergy}</span>`;
    html += `<span class="energy-item energy-water">&#x1F4A7; ${playerData.waterEnergy}</span>`;
    html += '</div>';
    if (playerData.reactions && playerData.reactions.length > 0) {
        html += '<div style="margin-top:4px;">';
        for (const r of playerData.reactions) {
            html += `<span class="reaction-badge">${r}</span> `;
        }
        html += '</div>';
    }
    return html;
}

function renderBoard(elementId, boardData, isPlayer) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';

    // For AI board: row 0 (BACK) at top, row 2 (FRONT) at bottom
    // For Player board: row 2 (FRONT) at top, row 0 (BACK) at bottom (mirrored)
    const rowOrder = isPlayer ? [2, 1, 0] : [0, 1, 2];
    const rowNames = ['BACK', 'MIDDLE', 'FRONT'];

    for (const ri of rowOrder) {
        for (let c = 0; c < 3; c++) {
            const space = boardData[ri][c];
            const cell = document.createElement('div');
            cell.className = 'board-cell';
            cell.dataset.row = ri;
            cell.dataset.col = c;

            if (!space.empty) {
                cell.classList.add('occupied');
                cell.dataset.occupied = 'true';
                const elemClass = space.element === 'FIRE' ? 'card-element-fire' : 'card-element-water';
                cell.classList.add(elemClass);

                let statusHTML = '';
                if (space.statuses && space.statuses.length > 0) {
                    statusHTML = space.statuses.map(s => `<span class="status-badge">${s}</span>`).join(' ');
                }

                cell.innerHTML = `
                    ${renderCellNotches(space.notches)}
                    <div class="card-on-board">
                        <div class="card-name">${space.name}</div>
                        <div class="card-stats">
                            <span class="stat-atk">&#x2694;${space.attack}</span>
                            <span class="stat-def">&#x1F6E1;${space.defense}</span>
                            <span class="stat-hp">&#x2764;${space.health}/${space.maxHealth}</span>
                        </div>
                        <div class="card-stats">
                            <span class="stat-spd">&#x26A1;${space.speed}</span>
                            ${statusHTML}
                        </div>
                        <div class="tooltip">
                            <strong>${space.name}</strong> [${space.element}]<br>
                            ATK:${space.attack} DEF:${space.defense} HP:${space.health}/${space.maxHealth} SPD:${space.speed}<br>
                            ${space.ability || ''}
                        </div>
                    </div>
                `;

                // Click on enemy board card to target with spell
                if (!isPlayer && selectionMode === 'castTarget') {
                    cell.onclick = () => castSpell(ri, c);
                }
            } else {
                cell.dataset.occupied = 'false';
                cell.innerHTML = `<span style="color:#333;font-size:0.7em;">${rowNames[ri]}</span>`;

                // Click on player board cell to place, hover to show notch projections
                if (isPlayer && selectionMode === 'place') {
                    cell.onclick = () => placeSiegling(ri, c);
                    cell.onmouseenter = () => showNotchProjections(ri, c);
                    cell.onmouseleave = () => clearNotchProjections();
                }
            }

            container.appendChild(cell);
        }
    }
}

/**
 * Render notch indicators positioned around the edges of the board cell.
 * Each notch is an absolutely-positioned element on the cell border.
 */
function renderCellNotches(notches) {
    if (!notches || notches.length === 0) return '';
    let html = '';
    for (const n of notches) {
        const color = n.element === 'FIRE' ? 'fire' : 'water';
        html += `<div class="cell-notch cell-notch-${n.direction.toLowerCase()} cell-notch-${color}"></div>`;
    }
    return html;
}

/**
 * Small notch grid for hand cards (compact view).
 */
function renderNotchGrid(notches, defaultElement) {
    if (!notches || notches.length === 0) return '';

    const dirMap = {
        'TOP_LEFT': 0, 'TOP': 1, 'TOP_RIGHT': 2,
        'LEFT': 3, 'RIGHT': 5,
        'BOTTOM_LEFT': 6, 'BOTTOM': 7, 'BOTTOM_RIGHT': 8
    };

    const cells = Array(9).fill('');
    cells[4] = 'center';

    for (const n of notches) {
        const pos = dirMap[n.direction];
        if (pos !== undefined) {
            cells[pos] = n.element === 'FIRE' ? 'active-fire' : 'active-water';
        }
    }

    let html = '<div class="notch-indicator">';
    for (const cls of cells) {
        html += `<div class="notch-dot ${cls}"></div>`;
    }
    html += '</div>';
    return html;
}

function renderHand() {
    const container = document.getElementById('hand-cards');
    const hand = gameState.player.hand;
    document.getElementById('hand-count').textContent = hand.length;
    container.innerHTML = '';

    hand.forEach((card, i) => {
        const div = document.createElement('div');
        div.className = 'hand-card';
        if (i === selectedHandIndex) div.classList.add('selected');

        const elemClass = card.element === 'FIRE' ? 'element-fire' : 'element-water';
        let badgeClass = 'badge-siegling';
        if (card.type === 'SPELL') badgeClass = 'badge-spell';
        else if (card.type === 'TRAINER') badgeClass = 'badge-trainer';

        let details = '';
        if (card.type === 'SIEGLING') {
            details = `
                <div class="card-detail"><span class="stat-atk">ATK:${card.attack}</span> <span class="stat-def">DEF:${card.defense}</span></div>
                <div class="card-detail"><span class="stat-hp">HP:${card.health}</span> <span class="stat-spd">SPD:${card.speed}</span></div>
                ${renderNotchGrid(card.notches, card.element)}
                <div class="card-detail" style="font-size:0.8em;color:#888;">${card.ability || ''}</div>
            `;
        } else if (card.type === 'SPELL') {
            details = `
                <div class="card-detail">Cost: ${card.cost} ${card.element}</div>
                ${card.requiresReaction ? `<div class="card-detail">Requires: ${card.requiresReaction}</div>` : ''}
                <div class="card-detail" style="font-size:0.8em;color:#888;">${card.effect || ''}</div>
            `;
        } else if (card.type === 'TRAINER') {
            details = `
                <div class="card-detail" style="font-size:0.8em;color:#888;">${card.passive || ''}</div>
                ${card.active ? `<div class="card-detail" style="font-size:0.8em;color:#f7dc6f;">${card.active}</div>` : ''}
            `;
        }

        div.innerHTML = `
            <span class="card-type-badge ${badgeClass}">${card.type}</span>
            <div class="card-name ${elemClass}">${card.name}</div>
            ${details}
        `;

        div.onclick = () => selectCard(i);
        container.appendChild(div);
    });
}

function renderDeckInfo() {
    document.getElementById('deck-info').innerHTML = `
        <p>Your Deck: ${gameState.player.deckSize} cards</p>
        <p>Your Discard: ${gameState.player.discardSize}</p>
        <hr style="border-color:#0f3460;margin:4px 0;">
        <p>AI Hand: ${gameState.ai.handSize} cards</p>
        <p>AI Deck: ${gameState.ai.deckSize} cards</p>
        <p>AI Discard: ${gameState.ai.discardSize}</p>
    `;
}

function renderTrainers() {
    const pt = gameState.player.trainer;
    document.getElementById('player-trainer').innerHTML = pt
        ? `<div class="card-name ${pt.element === 'FIRE' ? 'element-fire' : 'element-water'}">${pt.name}</div><div class="card-detail">${pt.passive || ''}</div>`
        : 'None';

    const at = gameState.ai.trainer;
    document.getElementById('ai-trainer').innerHTML = at
        ? `<div class="card-name ${at.element === 'FIRE' ? 'element-fire' : 'element-water'}">${at.name}</div><div class="card-detail">${at.passive || ''}</div>`
        : 'None';
}

function renderGameLog() {
    const container = document.getElementById('game-log');
    const log = gameState.gameLog || [];
    container.innerHTML = log.map(entry => `<p>${entry}</p>`).join('');
    container.scrollTop = container.scrollHeight;
}
