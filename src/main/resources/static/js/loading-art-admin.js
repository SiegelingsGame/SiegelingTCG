/* Loading screen art upload + preview gallery for the card dashboard.
   Catalog comes from GET /api/art/loading — every loading-folder plate and every
   cinematic img/gallery plate. Designers search/filter here and Edit/replace
   to overwrite an orientation (cinematic landscape writes back to gallery). */
(function () {
    'use strict';

    var fileInput = document.getElementById('loadingArtFileInput');
    var status = document.getElementById('loadingArtStatus');
    var gallery = document.getElementById('loadingArtGallery');
    var listNote = document.getElementById('loadingArtList');
    var overlay = document.getElementById('loadingArtPreviewOverlay');
    var previewTitle = document.getElementById('loadingArtPreviewTitle');
    var previewTabs = document.getElementById('loadingArtPreviewTabs');
    var previewImg = document.getElementById('loadingArtPreviewImg');
    var previewClose = document.getElementById('loadingArtPreviewClose');
    var searchInput = document.getElementById('loadingArtSearch');
    var filterRow = document.getElementById('loadingArtFilters');
    var artCache = [];
    var activeFilter = 'all';

    // The workspace panel it is written inside creates a containing block
    // (backdrop-filter), so `position: fixed` pinned the overlay to the panel
    // and it scrolled away with the page. Hosted on <body>, it covers the screen.
    if (overlay && overlay.parentNode !== document.body) document.body.appendChild(overlay);

    /* ---- Cards in this image ----
       Each piece carries the cards it shows and the shop stages it backs
       (PUT /api/art/tags/{id}, ArtCardTagService). The hub reads them for
       "Cards in this image" and to pick shop backdrops. */
    var tagCardsEl = document.getElementById('loadingArtTagCards');
    var tagShopEl = document.getElementById('loadingArtTagShop');
    var cardInput = document.getElementById('loadingArtCardInput');
    var cardResults = document.getElementById('loadingArtCardResults');
    var shopKind = document.getElementById('loadingArtShopKind');
    var shopTarget = document.getElementById('loadingArtShopTarget');
    var focusInput = document.getElementById('loadingArtFocus');
    var focusDot = document.getElementById('loadingArtFocusDot');
    var tagStatus = document.getElementById('loadingArtTagsStatus');
    var ELEMENTS = ['FIRE', 'ICE', 'EARTH', 'WIND', 'WATER', 'ELECTRIC', 'METAL', 'POISON',
        'PSYCHIC', 'UNDEAD', 'LIGHT', 'SHADOW', 'NEUTRAL'];
    var packIds = [];
    var draft = null;

    function tagCatalog() {
        return (window.SieglingsCardCatalog || []).concat(window.SieglingsTrainerCatalog || [])
            .filter(function (c) { return c && c.id; });
    }

    function cardLabel(id) {
        var card = tagCatalog().find(function (c) { return c.id === id; });
        return card ? (card.name || id) : null;
    }

    // Name or id, case-insensitive; exact hits first, then prefix, then
    // anywhere. A tappable list rather than a <datalist>, which iOS Safari
    // shows only as a cramped strip above the keyboard.
    function searchCards(text) {
        var q = String(text || '').trim().toLowerCase();
        if (!q) return [];
        function rank(c) {
            var name = String(c.name || '').toLowerCase();
            var id = String(c.id).toLowerCase();
            if (name === q || id === q) return 0;
            if (name.indexOf(q) === 0 || id.indexOf(q) === 0) return 1;
            if (name.indexOf(q) !== -1 || id.indexOf(q) !== -1) return 2;
            return -1;
        }
        return tagCatalog()
            .map(function (c) { return { card: c, rank: rank(c) }; })
            .filter(function (r) { return r.rank >= 0; })
            .sort(function (x, y) {
                return x.rank - y.rank || String(x.card.name || x.card.id).localeCompare(String(y.card.name || y.card.id));
            })
            .slice(0, 8)
            .map(function (r) { return r.card; });
    }

    function renderResults() {
        if (!cardResults) return;
        var q = cardInput ? cardInput.value.trim() : '';
        var hits = searchCards(q);
        if (!q) { cardResults.innerHTML = ''; return; }
        if (!hits.length) {
            cardResults.innerHTML = '<p class="section-help">' +
                (tagCatalog().length ? 'No card matches "' + escapeHtml(q) + '".' : 'The card catalog is still loading…') + '</p>';
            return;
        }
        cardResults.innerHTML = hits.map(function (c) {
            var added = draft && draft.cards.indexOf(c.id) !== -1;
            return '<button type="button" role="option" class="loading-art-tag-result' + (added ? ' is-added' : '') +
                '" data-add-card="' + escapeHtml(c.id) + '"' + (added ? ' aria-disabled="true"' : '') + '>' +
                '<strong>' + escapeHtml(c.name || c.id) + '</strong>' +
                '<small>' + escapeHtml([c.element, c.type, added ? 'added' : c.id].filter(Boolean).join(' · ').toLowerCase()) + '</small>' +
                '</button>';
        }).join('');
    }

    function fillOptions() {
        if (!shopTarget || !shopKind) return;
        var kind = shopKind.value;
        var values = kind === 'pack' ? packIds : ELEMENTS;
        var keep = shopTarget.value;
        shopTarget.innerHTML = values.length
            ? values.map(function (v) {
                var label = kind === 'pack' ? v : v.charAt(0) + v.slice(1).toLowerCase();
                return '<option value="' + escapeHtml(v) + '">' + escapeHtml(label) + '</option>';
            }).join('')
            : '<option value="">No packs loaded</option>';
        if (values.indexOf(keep) !== -1) shopTarget.value = keep;
    }

    function chip(label, value, kind, unknown) {
        return '<span class="loading-art-tag-chip' + (unknown ? ' is-unknown' : '') + '"' +
            (unknown ? ' title="Not in the loaded catalog"' : '') + '>' + escapeHtml(label) +
            '<button type="button" data-remove-' + kind + '="' + escapeHtml(value) + '" aria-label="Remove ' +
            escapeHtml(label) + '">&times;</button></span>';
    }

    function renderDraft() {
        if (!draft) return;
        if (tagCardsEl) {
            tagCardsEl.innerHTML = draft.cards.map(function (id) {
                var name = cardLabel(id);
                return chip(name ? name + ' · ' + id : id, id, 'card', !name && tagCatalog().length > 0);
            }).join('');
        }
        if (tagShopEl) {
            tagShopEl.innerHTML = draft.shop.map(function (slot) { return chip(slot, slot, 'slot', false); }).join('');
        }
        if (focusInput) focusInput.value = draft.focus || '';
        placeFocusDot();
    }

    function placeFocusDot() {
        if (!focusDot || !previewImg) return;
        var m = /^(\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%$/.exec(draft && draft.focus || '');
        if (!m || previewImg.classList.contains('hidden') || !previewImg.naturalWidth) {
            focusDot.classList.add('hidden');
            return;
        }
        focusDot.style.left = (previewImg.offsetLeft + previewImg.offsetWidth * Number(m[1]) / 100) + 'px';
        focusDot.style.top = (previewImg.offsetTop + previewImg.offsetHeight * Number(m[2]) / 100) + 'px';
        focusDot.classList.remove('hidden');
    }

    var nameInput = document.getElementById('loadingArtName');
    var placeInput = document.getElementById('loadingArtPlace');
    var removeBtn = document.getElementById('loadingArtRemove');

    // A piece's own name, as opposed to the one its file gives it.
    function customTitle(piece) {
        return piece.title && piece.title !== piece.defaultTitle ? piece.title : '';
    }

    function syncRemoveButton(piece) {
        if (!removeBtn) return;
        var hidden = Boolean(piece && piece.hidden);
        removeBtn.textContent = hidden ? 'Restore to game' : 'Remove from game';
        removeBtn.classList.toggle('btn-danger', !hidden);
    }

    function startDraft(piece) {
        if (nameInput) {
            nameInput.value = customTitle(piece);
            nameInput.placeholder = piece.defaultTitle || piece.title || piece.id;
        }
        if (placeInput) placeInput.value = piece.place || '';
        syncRemoveButton(piece);
        draft = {
            pieceId: piece.id,
            cards: (piece.cards || []).slice(),
            shop: (piece.shop || []).slice(),
            focus: piece.focus || ''
        };
        if (tagStatus) tagStatus.textContent = '';
        if (cardInput) cardInput.value = '';
        fillOptions();
        renderResults();
        renderDraft();
    }

    function markDirty() {
        if (tagStatus) tagStatus.textContent = 'Unsaved changes.';
    }

    function addCard(id) {
        if (!draft || !id) return;
        if (draft.cards.indexOf(id) === -1) draft.cards.push(id);
        // Keep the query so several cards from one search can be tapped in turn.
        markDirty();
        renderDraft();
        renderResults();
    }

    function addSlot() {
        if (!draft || !shopKind || !shopTarget || !shopTarget.value) return;
        var slot = shopKind.value + ':' + shopTarget.value;
        if (draft.shop.indexOf(slot) === -1) draft.shop.push(slot);
        markDirty();
        renderDraft();
    }

    // Every failure used to read "network error": an unreachable server, a
    // reply that was not JSON (a proxy error page) and a throw while redrawing
    // after a save that had worked. Each now says which it was.
    function saveDraft() {
        if (!draft) return;
        if (focusInput) draft.focus = focusInput.value.trim();
        putTag({
            cards: draft.cards, shop: draft.shop, focus: draft.focus,
            title: nameInput ? nameInput.value.trim() : undefined,
            place: placeInput ? placeInput.value.trim() : undefined
        }, 'Saved. Players see it on their next art refresh.');
    }

    // Takes the piece out of the game (or puts it back) on its own, without
    // touching unsaved tag edits; the server keeps every other field.
    function toggleRemoved() {
        if (!draft) return;
        var piece = artCache.find(function (p) { return p.id === draft.pieceId; });
        var hide = !(piece && piece.hidden);
        if (hide && !window.confirm('Remove "' + ((piece && piece.title) || draft.pieceId) +
                '" from the game? It leaves the gallery, loading screens, backgrounds and the shop. ' +
                'You can restore it from the Removed filter.')) {
            return;
        }
        putTag({ hidden: hide }, hide
            ? 'Removed from the game. Restore it any time from the Removed filter.'
            : 'Restored. Players see it on their next art refresh.');
    }

    function putTag(body, doneMessage) {
        var pieceId = draft.pieceId;
        var headers = { 'Content-Type': 'application/json' };
        try {
            var token = localStorage.getItem('sieglingsCardEditorToken');
            if (token) headers['X-Card-Editor-Token'] = token;
            var gate = localStorage.getItem('sieglingsCardDashboardGate');
            if (gate) headers['X-Card-Editor-Gate'] = gate;
        } catch (e) { /* anonymous save attempt */ }
        if (tagStatus) tagStatus.textContent = 'Saving…';
        var request = {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify(body)
        };
        var url = '/api/art/tags/' + encodeURIComponent(pieceId);
        // A PUT of the whole tag set is safe to repeat, so a dropped phone
        // connection gets one more try before the save is reported as failed.
        fetch(url, request)
            .catch(function () {
                if (tagStatus) tagStatus.textContent = 'Saving… (retrying)';
                return new Promise(function (resolve) { setTimeout(resolve, 1200); })
                    .then(function () { return fetch(url, request); });
            })
            .then(function (r) {
                return r.text().then(function (text) {
                    var d = null;
                    try { d = text ? JSON.parse(text) : null; } catch (e) { d = null; }
                    return { ok: r.ok, status: r.status, d: d };
                });
            }, function () {
                throw new Error('unreachable');
            })
            .then(function (res) {
                if (!res.d) {
                    if (tagStatus) tagStatus.textContent = 'Save failed — the server replied ' + res.status +
                        ' without data. Try again in a moment.';
                    return;
                }
                if (!res.ok) {
                    if (tagStatus) tagStatus.textContent = res.d.error ||
                        (res.status === 401 ? 'Save failed. Sign in under Live Publishing first.' : 'Save failed (' + res.status + ').');
                    return;
                }
                if (tagStatus) tagStatus.textContent = doneMessage;
                if (res.d.art) {
                    artCache = res.d.art;
                    var saved = artCache.find(function (p) { return p.id === pieceId; });
                    if (saved) {
                        syncRemoveButton(saved);
                        if (previewTitle) previewTitle.textContent = (saved.title || saved.id) + (saved.place ? ' — ' + saved.place : '');
                    }
                    try { renderGallery(); } catch (e) { /* the save stands; the list redraws on the next load */ }
                }
            })
            .catch(function () {
                if (tagStatus) tagStatus.textContent = 'Save failed — could not reach the server. Check the connection and try again.';
            });
    }

    document.getElementById('loadingArtShopAdd')?.addEventListener('click', addSlot);
    document.getElementById('loadingArtTagsSave')?.addEventListener('click', saveDraft);
    removeBtn?.addEventListener('click', toggleRemoved);
    nameInput?.addEventListener('input', markDirty);
    placeInput?.addEventListener('input', markDirty);
    shopKind?.addEventListener('change', fillOptions);
    cardInput?.addEventListener('input', renderResults);
    cardInput?.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var first = searchCards(cardInput.value)[0];
        if (first) addCard(first.id);
    });
    cardResults?.addEventListener('click', function (e) {
        var hit = e.target.closest('[data-add-card]');
        if (hit) addCard(hit.getAttribute('data-add-card'));
    });
    document.getElementById('loadingArtFocusClear')?.addEventListener('click', function () {
        if (!draft) return;
        draft.focus = '';
        markDirty();
        renderDraft();
    });
    focusInput?.addEventListener('input', function () {
        if (!draft) return;
        draft.focus = focusInput.value.trim();
        placeFocusDot();
    });
    [tagCardsEl, tagShopEl].forEach(function (host) {
        host?.addEventListener('click', function (e) {
            var card = e.target.closest('[data-remove-card]');
            var slot = e.target.closest('[data-remove-slot]');
            if (!draft || (!card && !slot)) return;
            if (card) draft.cards = draft.cards.filter(function (id) { return id !== card.getAttribute('data-remove-card'); });
            if (slot) draft.shop = draft.shop.filter(function (v) { return v !== slot.getAttribute('data-remove-slot'); });
            markDirty();
            renderDraft();
            renderResults();
        });
    });
    // The point clicked becomes the crop focus the shop uses on a phone.
    previewImg?.addEventListener('click', function (e) {
        if (!draft) return;
        var box = previewImg.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var x = Math.round(Math.min(100, Math.max(0, (e.clientX - box.left) / box.width * 100)));
        var y = Math.round(Math.min(100, Math.max(0, (e.clientY - box.top) / box.height * 100)));
        draft.focus = x + '% ' + y + '%';
        if (tagStatus) tagStatus.textContent = 'Unsaved changes.';
        renderDraft();
    });
    previewImg?.addEventListener('load', placeFocusDot);
    fetch('/api/shop/packs').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        packIds = ((d && d.packs) || []).map(function (p) { return p && p.id; }).filter(Boolean);
        fillOptions();
    }).catch(function () { /* pack slots can still be typed */ });

    function setStatus(msg) {
        if (status) status.textContent = msg;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function orientations(piece) {
        var out = [];
        if (piece.landscape) out.push({ key: 'landscape', label: 'Landscape', url: piece.landscape });
        if (piece.portrait) out.push({ key: 'portrait', label: 'Portrait', url: piece.portrait });
        return out;
    }

    function missingSlots(piece) {
        var missing = [];
        if (!piece.landscape) missing.push('landscape');
        if (!piece.portrait && piece.source !== 'cinematic') missing.push('portrait');
        return missing;
    }

    /* Prefills the upload form so a designer can replace a plate without
       retyping the piece id — that is what makes the gallery "editable" here. */
    function selectForEdit(pieceId, preferredOrientation) {
        var piece = artCache.find(function (p) { return p.id === pieceId; });
        if (!piece) return;
        var idInput = document.getElementById('loadingArtPieceId');
        var orientSelect = document.getElementById('loadingArtOrientation');
        if (idInput) idInput.value = piece.id;
        if (orientSelect) {
            var prefer = preferredOrientation
                || (piece.landscape ? 'landscape' : (piece.portrait ? 'portrait' : 'landscape'));
            var missing = missingSlots(piece);
            if (missing.indexOf(prefer) >= 0 || !piece[prefer]) {
                prefer = missing[0] || (piece.landscape ? 'landscape' : 'portrait') || 'landscape';
            }
            if (!piece[prefer] && piece.portrait) prefer = 'portrait';
            if (!piece[prefer] && piece.landscape) prefer = 'landscape';
            orientSelect.value = prefer;
        }
        var label = piece.title || piece.id;
        var miss = missingSlots(piece);
        setStatus(
            'Selected "' + label + '"' +
            (piece.source === 'cinematic' ? ' (cinematic)' : '') +
            (miss.length ? ' — missing ' + miss.join(' + ') : '') +
            ' — choose a new image and Upload to replace.'
        );
    }

    function openPreview(pieceId) {
        var piece = artCache.find(function (p) { return p.id === pieceId; });
        if (!piece || !overlay) return;
        var orients = orientations(piece);
        var missing = missingSlots(piece);
        if (!orients.length && !missing.length) return;

        var startOrient = orients.length ? orients[0].key : missing[0];
        selectForEdit(pieceId, startOrient);
        startDraft(piece);
        previewTitle.textContent = (piece.title || piece.id) +
            (piece.place ? ' — ' + piece.place : '');

        var tabsHtml = orients.map(function (o, i) {
            return '<button type="button" data-url="' + escapeHtml(o.url) + '" data-orient="' +
                escapeHtml(o.key) + '"' +
                (i === 0 ? ' class="active"' : '') + '>' + escapeHtml(o.label) + '</button>';
        }).join('');
        missing.forEach(function (slot) {
            tabsHtml += '<button type="button" class="loading-art-missing-slot" data-orient="' +
                escapeHtml(slot) + '" data-edit-piece="' + escapeHtml(piece.id) + '">Add ' +
                escapeHtml(slot) + '</button>';
        });
        tabsHtml += '<button type="button" class="loading-art-edit-btn" data-edit-piece="' +
            escapeHtml(piece.id) + '">Edit / replace</button>';
        previewTabs.innerHTML = tabsHtml;

        if (orients.length) {
            previewImg.src = orients[0].url;
            previewImg.alt = (piece.title || piece.id) + ' loading art';
            previewImg.classList.remove('hidden');
        } else {
            previewImg.removeAttribute('src');
            previewImg.alt = '';
            previewImg.classList.add('hidden');
        }
        overlay.classList.remove('hidden');
        lockPageScroll();

        Array.prototype.forEach.call(previewTabs.querySelectorAll('button[data-url]'), function (btn) {
            btn.addEventListener('click', function () {
                Array.prototype.forEach.call(previewTabs.querySelectorAll('button[data-url]'), function (b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                previewImg.src = btn.getAttribute('data-url');
                previewImg.classList.remove('hidden');
                placeFocusDot();
                selectForEdit(pieceId, btn.getAttribute('data-orient'));
            });
        });
        Array.prototype.forEach.call(previewTabs.querySelectorAll('[data-edit-piece]'), function (editBtn) {
            editBtn.addEventListener('click', function () {
                var active = previewTabs.querySelector('button[data-url].active');
                var orient = editBtn.getAttribute('data-orient')
                    || (active ? active.getAttribute('data-orient') : null);
                selectForEdit(pieceId, orient);
                closePreview();
                idInputFocus();
            });
        });
    }

    function idInputFocus() {
        var idInput = document.getElementById('loadingArtPieceId');
        if (!idInput) return false;
        idInput.focus();
        idInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return true;
    }

    // iOS scrolls the page under a fixed overlay, which carried the editor off
    // screen mid-edit. Pinning the body in place (and restoring the scroll
    // position after) is the one lock Safari honours.
    var lockedScrollY = null;
    function lockPageScroll() {
        if (lockedScrollY !== null) return;
        lockedScrollY = window.scrollY || window.pageYOffset || 0;
        var body = document.body.style;
        body.position = 'fixed';
        body.top = (-lockedScrollY) + 'px';
        body.left = '0';
        body.right = '0';
        body.overflow = 'hidden';
    }
    function unlockPageScroll() {
        if (lockedScrollY === null) return;
        var body = document.body.style;
        body.position = '';
        body.top = '';
        body.left = '';
        body.right = '';
        body.overflow = '';
        window.scrollTo(0, lockedScrollY);
        lockedScrollY = null;
    }

    function closePreview() {
        if (overlay && !overlay.classList.contains('hidden')) unlockPageScroll();
        if (overlay) overlay.classList.add('hidden');
        if (previewImg) {
            previewImg.src = '';
            previewImg.classList.remove('hidden');
        }
    }

    function matchesFilter(piece) {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'cinematic') return piece.source === 'cinematic';
        if (activeFilter === 'loading') return piece.source !== 'cinematic';
        if (activeFilter === 'incomplete') return missingSlots(piece).length > 0;
        if (activeFilter === 'landscape-only') return !!piece.landscape && !piece.portrait;
        if (activeFilter === 'portrait-only') return !!piece.portrait && !piece.landscape;
        if (activeFilter === 'removed') return !!piece.hidden;
        return true;
    }

    function matchesSearch(piece) {
        if (!searchInput) return true;
        var q = (searchInput.value || '').trim().toLowerCase();
        if (!q) return true;
        var hay = [piece.id, piece.title, piece.defaultTitle, piece.place, piece.source].concat(piece.cards || [], piece.shop || [])
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return hay.indexOf(q) >= 0;
    }

    function filteredArt() {
        return artCache.filter(function (piece) {
            return matchesFilter(piece) && matchesSearch(piece);
        });
    }

    function renderGallery() {
        if (!gallery) return;
        var art = filteredArt();
        if (!artCache.length) {
            gallery.innerHTML = '<p class="section-help">No loading art uploaded yet. Upload landscape and/or portrait images above.</p>';
            if (listNote) listNote.textContent = '';
            return;
        }
        if (!art.length) {
            gallery.innerHTML = '<p class="section-help">No pieces match this search or filter.</p>';
        } else {
            gallery.innerHTML = art.map(function (piece) {
                var thumb = piece.landscape || piece.portrait || '';
                var tags = [];
                if (piece.landscape) tags.push('landscape');
                if (piece.portrait) tags.push('portrait');
                var missing = missingSlots(piece);
                if (missing.length) tags.push('needs ' + missing.join('+'));
                if (piece.source === 'cinematic') tags.push('cinematic');
                if (piece.cards && piece.cards.length) tags.push(piece.cards.length + ' card' + (piece.cards.length === 1 ? '' : 's'));
                if (piece.shop && piece.shop.length) tags.push('shop');
                if (piece.hidden) tags.unshift('removed from game');
                return '<article class="loading-art-card' +
                    (missing.length ? ' is-incomplete' : '') +
                    (piece.source === 'cinematic' ? ' is-cinematic' : '') +
                    (piece.hidden ? ' is-removed' : '') +
                    '" data-piece-id="' + escapeHtml(piece.id) + '" tabindex="0" role="button" aria-label="Preview ' +
                    escapeHtml(piece.title || piece.id) + '">' +
                    '<div class="loading-art-card-thumb">' +
                    (thumb ? '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy">' : '<span class="section-help">No image</span>') +
                    '</div>' +
                    '<div class="loading-art-card-meta"><strong>' + escapeHtml(piece.title || piece.id) + '</strong>' +
                    '<span>' + escapeHtml(tags.join(' · ')) + '</span></div></article>';
            }).join('');
        }

        if (listNote) {
            var incomplete = artCache.filter(function (p) { return missingSlots(p).length; }).length;
            var cinematic = artCache.filter(function (p) { return p.source === 'cinematic'; }).length;
            listNote.textContent = artCache.length + ' piece' + (artCache.length === 1 ? '' : 's') +
                ' cataloged (' + cinematic + ' cinematic' +
                (incomplete ? ', ' + incomplete + ' missing an orientation' : '') +
                ')' +
                (art.length !== artCache.length ? ' — showing ' + art.length : '') +
                ' — click a card to preview; use Edit / replace to refill the upload form.';
        }

        Array.prototype.forEach.call(gallery.querySelectorAll('.loading-art-card'), function (card) {
            function activate() { openPreview(card.getAttribute('data-piece-id')); }
            card.addEventListener('click', activate);
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
            });
        });
    }

    function syncFilterButtons() {
        if (!filterRow) return;
        Array.prototype.forEach.call(filterRow.querySelectorAll('[data-art-filter]'), function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-art-filter') === activeFilter);
        });
    }

    function refreshList() {
        return fetch('/api/art/loading?all=true').then(function (r) { return r.json(); }).then(function (data) {
            artCache = (data && data.art) || [];
            renderGallery();
            return artCache;
        }).catch(function () {
            if (gallery) gallery.innerHTML = '<p class="section-help">Could not load loading art.</p>';
            return [];
        });
    }

    fileInput?.addEventListener('change', function () {
        setStatus(fileInput.files[0] ? fileInput.files[0].name + ' ready' : '');
    });

    searchInput?.addEventListener('input', function () {
        renderGallery();
    });

    filterRow?.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-art-filter]');
        if (!btn) return;
        activeFilter = btn.getAttribute('data-art-filter') || 'all';
        syncFilterButtons();
        renderGallery();
    });

    document.getElementById('loadingArtUploadBtn')?.addEventListener('click', function () {
        var pieceId = (document.getElementById('loadingArtPieceId')?.value || '').trim();
        var file = fileInput?.files?.[0];
        if (!pieceId) return setStatus('Enter a piece name first.');
        if (!file) return setStatus('Choose an image file first.');
        var form = new FormData();
        form.append('pieceId', pieceId);
        form.append('orientation', document.getElementById('loadingArtOrientation')?.value || 'landscape');
        form.append('file', file);
        var headers = {};
        try {
            var token = localStorage.getItem('sieglingsCardEditorToken');
            if (token) headers['X-Card-Editor-Token'] = token;
        } catch (e) { /* anonymous upload attempt */ }
        setStatus('Uploading...');
        fetch('/api/art/loading', { method: 'POST', body: form, headers: headers })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                if (!res.ok) return setStatus(res.d?.error || 'Upload failed. Sign in under Live Publishing first.');
                setStatus('Uploaded ' + res.d.url);
                if (fileInput) fileInput.value = '';
                if (res.d.art) {
                    artCache = res.d.art;
                    renderGallery();
                } else {
                    refreshList();
                }
            })
            .catch(function () { setStatus('Upload failed — network error.'); });
    });

    previewClose?.addEventListener('click', closePreview);
    overlay?.addEventListener('click', function (e) {
        if (e.target === overlay) closePreview();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) closePreview();
    });

    syncFilterButtons();
    refreshList();

    window.SiegelingsLoadingArtAdmin = {
        refresh: refreshList,
        selectForEdit: selectForEdit
    };
})();
