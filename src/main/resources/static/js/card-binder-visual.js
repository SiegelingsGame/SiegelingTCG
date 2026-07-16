(function () {
    const ELEMENT_COLORS = {
        FIRE: '#f05b2f', EARTH: '#a7773d', WIND: '#64c987', WATER: '#3c8ed8', ICE: '#7ad9e7',
        SHADOW: '#6d4a9e', ELECTRIC: '#f5cf3d', METAL: '#aeb5b8', UNDEAD: '#9f7c73', PSYCHIC: '#db73b4',
        POISON: '#7ecb4d', LIGHT: '#ffe59a',
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
        POISON: '/img/elements/element-poison.svg',
        LIGHT: '/img/elements/element-light.svg',
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
        return mode === 'REPLACE' || mode === 'OVERLAY' || mode === 'FULL_CARD' ? mode : '';
    }

    function clampNumber(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function normalizeArtTransform(card) {
        const x = Number(card?.cardArtOffsetX);
        const y = Number(card?.cardArtOffsetY);
        // Percentage offsets (fraction of the art element) are card-relative, so a
        // dragged position holds the same relative spot at any card size. They take
        // precedence over the legacy pixel offsets, which shift differently per card
        // size. Older cards (no *Pct fields) keep their pixel behavior.
        const xPct = Number(card?.cardArtOffsetXPct);
        const yPct = Number(card?.cardArtOffsetYPct);
        const scale = Number(card?.cardArtScale);
        const rotation = Number(card?.cardArtRotation);
        return {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            xPct: Number.isFinite(xPct) ? clampNumber(xPct, -200, 200) : null,
            yPct: Number.isFinite(yPct) ? clampNumber(yPct, -200, 200) : null,
            scale: Number.isFinite(scale) ? clampNumber(scale, 0.25, 3) : 1,
            rotation: Number.isFinite(rotation) ? clampNumber(rotation, -180, 180) : 0
        };
    }

    function buildArtTransformStyle(card) {
        const transform = normalizeArtTransform(card);
        const usePct = transform.xPct !== null || transform.yPct !== null;
        const tx = usePct ? `${transform.xPct || 0}%` : `${transform.x}px`;
        const ty = usePct ? `${transform.yPct || 0}%` : `${transform.y}px`;
        const noOffset = usePct
            ? (!transform.xPct && !transform.yPct)
            : (!transform.x && !transform.y);
        if (noOffset && transform.scale === 1 && !transform.rotation) {
            return '';
        }
        return `transform:translate(${tx},${ty}) scale(${transform.scale}) rotate(${transform.rotation}deg);transform-origin:center center;`;
    }

    function renderCustomArtImage(className, artUrl, card) {
        const style = buildArtTransformStyle(card);
        const original = String(artUrl || '');
        const preferred = preferWebp(original);
        const fallbackAttrs = preferred !== original
            ? ` data-img-fallback="${escapeAttr(original)}" onerror="sgWebpFallback(this)"`
            : '';
        return `<img class="${className}" src="${escapeAttr(preferred)}" alt=""${style ? ` style="${style}"` : ''}${fallbackAttrs}>`;
    }

    function holographicFullCardArtUrl(card, options = {}) {
        if (!options.useHolographicFullCardArt || !isHolographic(card, options)) {
            return '';
        }
        return String(card?.holographicCardArtUrl || '').trim();
    }

    function fullCardArtUrl(card, options = {}) {
        const holographicUrl = holographicFullCardArtUrl(card, options);
        if (holographicUrl) {
            return holographicUrl;
        }
        const artUrl = String(card?.cardArtUrl || '').trim();
        return artUrl && normalizeArtMode(card?.cardArtMode) === 'FULL_CARD' ? artUrl : '';
    }

    function usesFullCardArt(card, options = {}) {
        return Boolean(fullCardArtUrl(card, options));
    }

    // Overlay art for SiegeKnights: the upload is the character illustration
    // only, composited behind the shared template frame (transparent art
    // window + semi-transparent description box + opaque shield/border) so the
    // frame and caption box stay identical across every card.
    function knightOverlayArtUrl(card) {
        const artUrl = String(card?.cardArtUrl || '').trim();
        return artUrl && normalizeArtMode(card?.cardArtMode) === 'OVERLAY' ? artUrl : '';
    }

    function usesKnightOverlayArt(card) {
        return normalizeCardType(card) === 'SIEGEKNIGHT' && Boolean(knightOverlayArtUrl(card));
    }

    function renderKnightOverlayArtWindow(card) {
        const artUrl = knightOverlayArtUrl(card);
        if (!artUrl) return '';
        const style = buildArtTransformStyle(card);
        const preferred = preferWebp(artUrl);
        const fallbackAttrs = preferred !== artUrl
            ? ` data-img-fallback="${escapeAttr(artUrl)}" onerror="sgWebpFallback(this)"`
            : '';
        return `<div class="knight-overlay-art-window"><img class="knight-overlay-art-img" src="${escapeAttr(preferred)}" alt=""${style ? ` style="${style}"` : ''}${fallbackAttrs}></div>`;
    }

    function isHolographic(card, options = {}) {
        if (card?.holographic === true) {
            return true;
        }
        const ids = options.playerHolographicIds || options.holographicCardIds;
        const cardId = String(card?.id || '').trim().toLowerCase();
        if (!cardId || !ids) {
            return false;
        }
        if (ids instanceof Set) {
            return ids.has(cardId);
        }
        if (Array.isArray(ids)) {
            return ids.some((entry) => String(entry || '').trim().toLowerCase() === cardId);
        }
        return false;
    }

    function holographicClass(card, options = {}) {
        return isHolographic(card, options) ? ' is-holographic' : '';
    }

    function renderHolographicOverlay() {
        return '<div class="card-holographic-overlay" aria-hidden="true"></div>';
    }

    function holographicCardArtScale(card) {
        const scale = Number(card?.holographicCardArtScale);
        return Number.isFinite(scale) ? clampNumber(scale, 0.25, 3) : 1;
    }

    function holographicCardCopy(card, options = {}) {
        const hasDedicatedDescription = Object.prototype.hasOwnProperty.call(options, 'holographicDescriptionText');
        const description = String(
            hasDedicatedDescription
                ? options.holographicDescriptionText
                : (options.descriptionText || card?.description || '')
        ).trim();
        if (description) {
            return `<div class="holographic-card-description">${escapeHtml(description)}</div>`;
        }
        const abilities = Array.isArray(card?.abilities) ? card.abilities : [];
        const candidates = abilities.length ? abilities : (card?.ability ? [card.ability] : []);
        if (!candidates.length) {
            return '<div class="holographic-card-description is-placeholder">Description coming soon.</div>';
        }
        return `<div class="holographic-card-abilities">${candidates.slice(0, 3).map((ability) => {
            const name = String(ability?.name || '').trim();
            const copy = String(ability?.description || '').trim();
            const prefix = name ? `<strong>${escapeHtml(name)}${copy ? ':' : ''}</strong>` : '';
            return `<div class="holographic-card-ability">${prefix}${copy ? ` ${escapeHtml(copy)}` : ''}</div>`;
        }).join('')}</div>`;
    }

    function renderHolographicCardData(card, options = {}) {
        const type = normalizeCardType(card);
        const health = card?.health ?? card?.hp;
        const speed = card?.speed;
        const stats = type === 'SIEGLING'
            ? `<div class="holographic-card-stats"><span>HP: ${escapeHtml(health ?? '—')}</span><span>SPD: ${escapeHtml(speed ?? '—')}</span></div>`
            : `<div class="holographic-card-stats holographic-card-type"><span>${escapeHtml(format(type || 'Card'))}</span><span>${escapeHtml(format(card?.element || 'Neutral'))}</span></div>`;
        return `<div class="holographic-card-data">
            <div class="holographic-card-name">${escapeHtml(card?.name || 'Unnamed Card')}</div>
            ${stats}
            <div class="holographic-card-copy">${holographicCardCopy(card, options)}</div>
        </div>`;
    }

    function renderFullCardArt(card, options = {}) {
        const artUrl = fullCardArtUrl(card, options);
        if (!artUrl) return '';
        const extraClass = options.previewClass ? ` ${options.previewClass}` : '';
        const usesHolographicArtwork = Boolean(holographicFullCardArtUrl(card, options));
        const holographicClassName = usesHolographicArtwork ? ' is-holographic-full-art' : '';
        const content = usesHolographicArtwork
            ? `<div class="holographic-card-art-canvas" style="--holographic-card-art-scale:${holographicCardArtScale(card)}">
                <img class="binder-full-card-art-image" src="${escapeAttr(artUrl)}" alt="" loading="lazy">
                ${renderHolographicCardData(card, options)}
            </div>`
            : `<img class="binder-full-card-art-image" src="${escapeAttr(artUrl)}" alt="" loading="lazy">`;
        return `<div class="binder-full-card-art${extraClass}${holographicClassName}${holographicClass(card, options)}" role="img" aria-label="${escapeAttr(card?.name || 'Full art card')}">
            ${content}
            ${isHolographic(card, options) ? renderHolographicOverlay() : ''}
        </div>`;
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
                : 'Deception set';
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

    function usesFramedCardTemplate(card) {
        const type = normalizeCardType(card);
        if (type === 'SIEGEKNIGHT') {
            return false;
        }
        const showcase = window.SieglingsCardShowcase;
        if (!showcase?.renderShowcaseCard) {
            return false;
        }
        if (typeof showcase.cardFrameClass === 'function') {
            return Boolean(showcase.cardFrameClass(card).trim());
        }
        if (typeof showcase.hasElementFrame === 'function') {
            return showcase.hasElementFrame(card?.element);
        }
        return ['FIRE', 'ICE', 'EARTH', 'WIND'].includes(String(card?.element || '').toUpperCase());
    }

    function renderFramedShowcaseCard(card, options = {}) {
        const showcase = window.SieglingsCardShowcase;
        if (!usesFramedCardTemplate(card) || !showcase?.renderShowcaseCard) {
            return '';
        }
        // Binder surfaces show the card description in the painted info
        // panel instead of the move list (cost/evo live in the corner chips).
        return showcase.renderShowcaseCard(card, {
            artVariant: options.artVariant || 'preview',
            cardClass: options.cardClass || 'mulligan-showcase binder-grid-showcase',
            compactAbilityLimit: options.compactAbilityLimit ?? 2,
            summaryMode: options.summaryMode || 'description',
            descriptionText: options.descriptionText || ''
        });
    }

    function renderBinderCardTile(card, options = {}) {
        if (usesFullCardArt(card, options)) {
            return renderFullCardArt(card, options);
        }
        const framed = renderFramedShowcaseCard(card, {
            cardClass: options.cardClass || 'mulligan-showcase binder-grid-showcase',
            compactAbilityLimit: options.compactAbilityLimit ?? 2,
            summaryMode: options.summaryMode,
            descriptionText: options.descriptionText
        });
        if (framed) {
            const holoClass = holographicClass(card, options);
            return `<div class="mulligan-card-slot binder-framed-slot${holoClass}" aria-hidden="true">${framed}${isHolographic(card, options) ? renderHolographicOverlay() : ''}</div>`;
        }
        return renderBinderCardShell(card, options);
    }

    function renderBinderCardPreview(card, options = {}) {
        if (usesFullCardArt(card, options)) {
            return renderFullCardArt(card, options);
        }
        const element = card?.element || 'FIRE';
        const extraClass = options.previewClass ? ` ${options.previewClass}` : '';
        const previewClass = String(options.previewClass || '').includes('detail')
            ? `selected-preview-card detail-card-preview${extraClass}`
            : `mulligan-showcase binder-showcase-card${extraClass}`;
        const framed = renderFramedShowcaseCard(card, {
            cardClass: previewClass.trim(),
            compactAbilityLimit: options.compactAbilityLimit ?? 3,
            summaryMode: options.summaryMode,
            descriptionText: options.descriptionText
        });
        if (framed) {
            return framed;
        }
        const shell = renderBinderCardShell(card, options);
        const modeClass = resolveArtModeClass(card);
        return `<div class="binder-card card-visual-preview${extraClass}${modeClass}${holographicClass(card, options)}" style="--el:${elementColor(element)}">${shell}${isHolographic(card, options) ? renderHolographicOverlay() : ''}</div>`;
    }

    // ── WebP delivery ──────────────────────────────────────────────
    // Every local raster card asset has a .webp twin (committed + on Storage).
    // preferWebp() swaps the extension when the browser supports WebP; the
    // <img onerror> handler falls back to the original file if a .webp is ever
    // missing, so this can never leave a broken image.
    let __webpSupport = null;
    function webpSupported() {
        if (__webpSupport !== null) {
            return __webpSupport;
        }
        try {
            const c = document.createElement('canvas');
            __webpSupport = !!(c.getContext && c.getContext('2d'))
                && c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        } catch (e) {
            __webpSupport = false;
        }
        return __webpSupport;
    }

    function preferWebp(url) {
        const u = String(url || '');
        if (!u || !webpSupported()) {
            return u;
        }
        return u.replace(/^(\/(?:img|assets)\/[^?#]+)\.(png|jpe?g)(\?[^#]*)?$/i, '$1.webp$3');
    }

    // onerror handler: revert a failed .webp <img> to its original source once.
    window.sgWebpFallback = function (img) {
        if (!img) {
            return;
        }
        const fallback = img.getAttribute('data-img-fallback');
        img.onerror = null;
        if (fallback && img.getAttribute('src') !== fallback) {
            img.setAttribute('src', fallback);
        }
    };

    // Fit every card description fully inside its painted info window: long
    // flavor text used to clip mid-sentence past the panel. Steps the font
    // down (tightening line-height) until the whole text fits; only if even
    // the floor size overflows does the ellipsis line-clamp come back.
    var descriptionFitFrame = null;
    function fitBinderCardDescriptions() {
        var nodes = document.querySelectorAll('.binder-card-description');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (!el.offsetParent && el.getClientRects().length === 0) continue;
            el.style.display = 'block';
            el.style.webkitLineClamp = 'unset';
            el.style.fontSize = '';
            el.style.lineHeight = '';
            if (el.scrollHeight <= el.clientHeight + 1) continue;
            var size = parseFloat(window.getComputedStyle(el).fontSize) || 7.6;
            var guard = 22;
            el.style.lineHeight = '1.12';
            while (el.scrollHeight > el.clientHeight + 1 && size > 4.8 && guard-- > 0) {
                size = Math.max(4.8, size * 0.93);
                el.style.fontSize = size.toFixed(2) + 'px';
            }
            if (el.scrollHeight > el.clientHeight + 1) {
                el.style.display = '';
                el.style.webkitLineClamp = '';
            }
        }
    }

    function scheduleDescriptionFit() {
        if (descriptionFitFrame != null) {
            window.cancelAnimationFrame(descriptionFitFrame);
        }
        descriptionFitFrame = window.requestAnimationFrame(function () {
            descriptionFitFrame = null;
            fitBinderCardDescriptions();
        });
    }

    var descriptionFitResizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(descriptionFitResizeTimer);
        descriptionFitResizeTimer = setTimeout(scheduleDescriptionFit, 160);
    });

    window.SieglingsCardBinderVisual = {
        scheduleDescriptionFit,
        renderBinderCardPreview,
        renderBinderCardTile,
        renderBinderCardShell,
        renderBinderCardArt,
        renderBinderCardOverlay,
        renderElementIcon,
        elementColor,
        usesFramedCardTemplate,
        usesFullCardArt,
        holographicFullCardArtUrl,
        usesKnightOverlayArt,
        knightOverlayArtUrl,
        renderKnightOverlayArtWindow,
        isHolographic,
        holographicClass,
        normalizeArtMode,
        normalizeArtTransform,
        buildArtTransformStyle,
        resolveArtModeClass,
        preferWebp,
        webpSupported
    };
})();
