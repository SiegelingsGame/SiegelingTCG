(function () {
    const ELEMENT_COLORS = {
        FIRE: '#f05b2f', EARTH: '#a7773d', WIND: '#64c987', WATER: '#3c8ed8', ICE: '#7ad9e7',
        SHADOW: '#6d4a9e', ELECTRIC: '#f5cf3d', METAL: '#aeb5b8', UNDEAD: '#9f7c73', PSYCHIC: '#db73b4',
        NEUTRAL: '#95a5a6'
    };
    const ELEMENT_ICON_PATHS = {
        FIRE: '/img/elements/element-fire.png',
        EARTH: '/img/elements/element-earth.png',
        WIND: '/img/elements/element-wind.png',
        WATER: '/img/elements/element-water.svg',
        ICE: '/img/elements/element-ice.png',
        SHADOW: '/img/elements/element-shadow.svg',
        ELECTRIC: '/img/elements/element-electric.svg',
        METAL: '/img/elements/element-metal.svg',
        UNDEAD: '/img/elements/element-undead.svg',
        PSYCHIC: '/img/elements/element-psychic.svg',
        NEUTRAL: '/img/elements/element-neutral.svg'
    };
    const NOTCH_ICON_PATHS = {
        FIRE: '/img/notches/notch-fire.png',
        EARTH: '/img/notches/notch-earth.png',
        WIND: '/img/notches/notch-wind.png',
        ICE: '/img/notches/notch-ice.png',
        SHADOW: '/img/notches/notch-shadow.png'
    };
    const NOTCH_DIRECTIONS = ['TOP_LEFT', 'TOP', 'TOP_RIGHT', 'LEFT', 'RIGHT', 'BOTTOM_LEFT', 'BOTTOM', 'BOTTOM_RIGHT'];

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function format(value) {
        const normalized = String(value || '');
        if (normalized === 'SIEGLING') return 'Siegeling';
        if (normalized === 'SIEGLINGS') return 'Siegelings';
        return normalized
            .toLowerCase()
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .replace(/\bSiegling\b/g, 'Siegeling')
            .replace(/\bSieglings\b/g, 'Siegelings');
    }

    function elementColor(element) {
        return ELEMENT_COLORS[String(element || '').toUpperCase()] || ELEMENT_COLORS.FIRE;
    }

    function elementIconPath(element) {
        return ELEMENT_ICON_PATHS[String(element || '').toUpperCase()] || '';
    }

    function notchIconPath(element) {
        const normalized = String(element || '').toUpperCase();
        return NOTCH_ICON_PATHS[normalized] || elementIconPath(normalized);
    }

    function notchIconStyle(element) {
        const normalized = String(element || 'NEUTRAL').toUpperCase();
        const iconPath = notchIconPath(normalized);
        const color = elementColor(normalized);
        return `--notch:${color};${iconPath ? `--notch-icon:url('${escapeAttr(iconPath)}');` : ''}`;
    }

    function normalizeCardType(card) {
        return String(card?.type || card?.cardType || '').toUpperCase();
    }

    function cardEnergyCost(card) {
        const directCost = Number(card?.costAmount);
        if (Number.isFinite(directCost) && directCost > 0) return directCost;
        const trapCost = Number(card?.trapBucketAmount);
        if (Number.isFinite(trapCost) && trapCost > 0) return trapCost;
        const comboCost = Number(card?.requiredComboSize);
        if (Number.isFinite(comboCost) && comboCost > 0) return comboCost;
        return 0;
    }

    function normalizeArtMode(value) {
        const mode = String(value || '').trim().toUpperCase();
        return mode === 'REPLACE' || mode === 'OVERLAY' ? mode : '';
    }

    function clampNumber(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function normalizeArtTransform(card) {
        const x = Number(card?.cardArtOffsetX);
        const y = Number(card?.cardArtOffsetY);
        const scale = Number(card?.cardArtScale);
        const rotation = Number(card?.cardArtRotation);
        return {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            scale: Number.isFinite(scale) ? clampNumber(scale, 0.25, 3) : 1,
            rotation: Number.isFinite(rotation) ? clampNumber(rotation, -180, 180) : 0
        };
    }

    function buildArtTransformStyle(card) {
        const transform = normalizeArtTransform(card);
        if (!transform.x && !transform.y && transform.scale === 1 && !transform.rotation) {
            return '';
        }
        return `transform:translate(${transform.x}px,${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg);transform-origin:center center;`;
    }

    function renderCustomArtImage(className, artUrl, card) {
        const style = buildArtTransformStyle(card);
        return `<img class="${className}" src="${escapeAttr(artUrl)}" alt=""${style ? ` style="${style}"` : ''}>`;
    }

    function renderElementIcon(element) {
        const normalized = String(element || 'NEUTRAL').toUpperCase();
        const iconPath = elementIconPath(normalized);
        if (iconPath) {
            return `<img class="element-icon-art" src="${escapeAttr(iconPath)}" alt="${escapeAttr(format(normalized))} icon" loading="lazy">`;
        }
        return `<span class="binder-card-fallback-element">${escapeHtml(format(normalized).slice(0, 1) || '?')}</span>`;
    }

    function renderBinderCardArt(card) {
        const artUrl = String(card?.cardArtUrl || '').trim();
        const mode = normalizeArtMode(card?.cardArtMode);

        if (!artUrl || mode === 'OVERLAY') {
            return renderElementIcon(card?.element);
        }
        if (mode === 'REPLACE') {
            return renderCustomArtImage('binder-card-custom-art', artUrl, card);
        }
        return renderElementIcon(card?.element);
    }

    function renderBinderCardOverlay(card) {
        const artUrl = String(card?.cardArtUrl || '').trim();
        const mode = normalizeArtMode(card?.cardArtMode);
        if (!artUrl || mode !== 'OVERLAY') {
            return '';
        }
        return renderCustomArtImage('binder-card-overlay-art-card', artUrl, card);
    }

    function resolveArtModeClass(card) {
        const artUrl = String(card?.cardArtUrl || '').trim();
        const mode = normalizeArtMode(card?.cardArtMode);
        if (!artUrl) {
            return '';
        }
        if (mode === 'OVERLAY') {
            return ' art-mode-overlay';
        }
        if (mode === 'REPLACE') {
            return ' art-mode-replace';
        }
        return '';
    }

    function renderBinderNotches(notches = []) {
        const notchMap = Object.fromEntries(notches.map((notch) => [String(notch.direction || '').toUpperCase(), notch]));
        return `<div class="binder-notches" aria-hidden="true">${NOTCH_DIRECTIONS.map((direction) => {
            const notch = notchMap[direction];
            return `<span class="binder-notch notch-${direction.toLowerCase().replace(/_/g, '-')}${notch ? ' filled' : ''}" style="${notch ? notchIconStyle(notch.element) : ''}"></span>`;
        }).join('')}</div>`;
    }

    function renderBinderCardEnergyCost(cost, element) {
        const amount = Number(cost);
        if (!Number.isFinite(amount) || amount <= 0) {
            return '<div class="binder-card-cost binder-card-cost-empty">No energy cost</div>';
        }
        const normalized = String(element || 'NEUTRAL').toLowerCase();
        const label = format(element || 'NEUTRAL');
        const tokensToDraw = Math.min(amount, 12);
        const tokenStyle = notchIconStyle(element || 'NEUTRAL');
        const token = `<span class="energy-token notch-token token-${escapeAttr(normalized)}" style="${tokenStyle}"></span>`;
        let rows = '';
        for (let drawn = 0; drawn < tokensToDraw; drawn += 6) {
            const lineCount = Math.min(6, tokensToDraw - drawn);
            rows += `<span class="binder-card-cost-emblems-row">${token.repeat(lineCount)}</span>`;
        }
        const overflow = amount > tokensToDraw ? `<span class="binder-card-cost-count">+${amount - tokensToDraw}</span>` : '';
        return `<div class="binder-card-cost binder-card-cost-emblems" aria-label="Cost ${amount} ${escapeAttr(label)} energy">
            ${rows}${overflow}
        </div>`;
    }

    function renderShopCardStats(card) {
        const type = normalizeCardType(card);
        if (type === 'SIEGLING') {
            const hp = card.health ?? card.hp ?? '-';
            const speed = card.speed ?? card.spd ?? '-';
            return `<div class="binder-card-stats"><span>HP:${escapeHtml(hp)}</span><span>SPD:${escapeHtml(speed)}</span></div>`;
        }
        if (type === 'SPELL') {
            const reaction = format(card.requiredReaction || 'None');
            const row = card.preferredRow ? format(card.preferredRow) : 'Any row';
            return `<div class="binder-card-stats shop-card-stats-alt"><span>${escapeHtml(reaction)}</span><span>${escapeHtml(row)}</span></div>`;
        }
        if (type === 'TRAP') {
            const reaction = format(card.requiredReaction || 'Trigger');
            const bucket = card.trapBucketAmount
                ? `${card.trapBucketAmount} ${format(card.trapBucketElement || card.element)}`
                : 'Trap set';
            return `<div class="binder-card-stats shop-card-stats-alt"><span>${escapeHtml(reaction)}</span><span>${escapeHtml(bucket)}</span></div>`;
        }
        return `<div class="binder-card-stats shop-card-stats-alt"><span>${escapeHtml(format(type || 'Card'))}</span><span>${escapeHtml(format(card.element || 'Neutral'))}</span></div>`;
    }

    function renderShopCardAbilityLine(card) {
        const abilities = card?.abilities || (card?.ability ? [card.ability] : []);
        const primary = abilities[0];
        if (!primary?.name) return '';
        return `<div class="shop-card-ability">${escapeHtml(primary.name)}</div>`;
    }

    function renderShopCardDescription(card, descriptionText = '') {
        const description = String(descriptionText || card?.description || '').trim() || 'Description coming soon.';
        return `<div class="binder-card-description shop-card-description" title="${escapeAttr(description)}">${escapeHtml(description)}</div>`;
    }

    function renderBinderCardShell(card, options = {}) {
        const owned = Number.isFinite(options.ownedOverride) ? options.ownedOverride : 0;
        const ownedLabel = options.ownedLabel || (owned ? `Owned x${owned}` : 'Unowned');
        const type = normalizeCardType(card);
        const typeLabel = [format(type), format(card.element)].filter(Boolean).join(' / ');
        const cost = cardEnergyCost(card);
        const costElement = card.costElement || card.trapBucketElement || card.element || 'NEUTRAL';
        const isSiegling = type === 'SIEGLING';
        const descriptionText = options.descriptionText || '';

        return `${isSiegling ? renderBinderNotches(card.notches) : ''}
            ${renderBinderCardOverlay(card)}
            <div class="binder-card-shell">
                <div class="binder-card-header">
                    <strong>${escapeHtml(card.name || 'Unnamed Card')}</strong>
                    <span>${escapeHtml(typeLabel)}</span>
                </div>
                <div class="binder-card-art">
                    ${renderBinderCardArt(card)}
                </div>
                <div class="binder-card-body shop-card-body">
                    ${renderShopCardStats(card)}
                    <div class="binder-card-meta">${escapeHtml(format(card.rarity))} / ${escapeHtml(ownedLabel)}</div>
                    ${renderBinderCardEnergyCost(cost, costElement)}
                    ${renderShopCardAbilityLine(card)}
                    ${renderShopCardDescription(card, descriptionText)}
                </div>
            </div>`;
    }

    function renderBinderCardPreview(card, options = {}) {
        const element = card?.element || 'FIRE';
        const shell = renderBinderCardShell(card, options);
        const extraClass = options.previewClass ? ` ${options.previewClass}` : '';
        const modeClass = resolveArtModeClass(card);
        return `<div class="binder-card card-visual-preview${extraClass}${modeClass}" style="--el:${elementColor(element)}">${shell}</div>`;
    }

    window.SieglingsCardBinderVisual = {
        renderBinderCardPreview,
        renderBinderCardShell,
        renderBinderCardArt,
        renderBinderCardOverlay,
        renderElementIcon,
        elementColor,
        normalizeArtMode,
        normalizeArtTransform,
        buildArtTransformStyle,
        resolveArtModeClass
    };
})();
