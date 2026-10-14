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

    /* ---- Cards in this image ----
       Each piece carries the cards it shows and the shop stages it backs
       (PUT /api/art/tags/{id}, ArtCardTagService). The hub reads them for
       "Cards in this image" and to pick shop backdrops. */
    var tagCardsEl = document.getElementById('loadingArtTagCards');
    var tagShopEl = document.getElementById('loadingArtTagShop');
    var cardInput = document.getElementById('loadingArtCardInput');
    var shopInput = document.getElementById('loadingArtShopInput');
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

    // Accepts an id, an exact name, or a datalist pick ("Name (id)").
    function resolveCardId(text) {
        var value = String(text || '').trim();
        if (!value) return null;
        var list = tagCatalog();
        var paren = /\(([^()]+)\)\s*$/.exec(value);
        if (paren && list.some(function (c) { return c.id === paren[1]; })) return paren[1];
        var byId = list.find(function (c) { return c.id === value; });
        if (byId) return byId.id;
        var lower = value.toLowerCase();
        var byName = list.find(function (c) { return String(c.name || '').toLowerCase() === lower; });
        return byName ? byName.id : null;
    }

    function fillOptions() {
        var cardList = document.getElementById('loadingArtCardOptions');
        if (cardList) {
            cardList.innerHTML = tagCatalog().map(function (c) {
                return '<option value="' + escapeHtml((c.name || c.id) + ' (' + c.id + ')') + '"></option>';
            }).join('');
        }
        var shopList = document.getElementById('loadingArtShopOptions');
        if (shopList) {
            var slots = [];
            ELEMENTS.forEach(function (el) { slots.push('summon:' + el, 'element:' + el); });
            packIds.forEach(function (id) { slots.push('pack:' + id); });
            shopList.innerHTML = slots.map(function (v) {
                return '<option value="' + escapeHtml(v) + '"></option>';
            }).join('');
        }
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

    function startDraft(piece) {
        draft = {
            pieceId: piece.id,
            cards: (piece.cards || []).slice(),
            shop: (piece.shop || []).slice(),
            focus: piece.focus || ''
        };
        if (tagStatus) tagStatus.textContent = '';
        if (cardInput) cardInput.value = '';
        if (shopInput) shopInput.value = '';
        fillOptions();
        renderDraft();
    }

    function addCard() {
        if (!draft || !cardInput) return;
        var id = resolveCardId(cardInput.value);
        if (!id) {
            if (tagStatus) tagStatus.textContent = 'No card matches "' + cardInput.value.trim() + '".';
            return;
        }
        if (draft.cards.indexOf(id) === -1) draft.cards.push(id);
        cardInput.value = '';
        if (tagStatus) tagStatus.textContent = 'Unsaved changes.';
        renderDraft();
    }

    function addSlot() {
        if (!draft || !shopInput) return;
        var raw = shopInput.value.trim();
        var m = /^(summon|element|pack):\s*([A-Za-z0-9_-]+)$/i.exec(raw);
        if (!m) {
            if (tagStatus) tagStatus.textContent = 'Slots look like summon:FIRE, element:ICE or pack:pack_id.';
            return;
        }
        var kind = m[1].toLowerCase();
        var slot = kind + ':' + (kind === 'pack' ? m[2] : m[2].toUpperCase());
        if (draft.shop.indexOf(slot) === -1) draft.shop.push(slot);
        shopInput.value = '';
        if (tagStatus) tagStatus.textContent = 'Unsaved changes.';
        renderDraft();
    }

    function saveDraft() {
        if (!draft) return;
        if (focusInput) draft.focus = focusInput.value.trim();
        var headers = { 'Content-Type': 'application/json' };
        try {
            var token = localStorage.getItem('sieglingsCardEditorToken');
            if (token) headers['X-Card-Editor-Token'] = token;
        } catch (e) { /* anonymous save attempt */ }
        if (tagStatus) tagStatus.textContent = 'Saving…';
        var pieceId = draft.pieceId;
        fetch('/api/art/tags/' + encodeURIComponent(pieceId), {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({ cards: draft.cards, shop: draft.shop, focus: draft.focus })
        })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                if (!res.ok) {
                    if (tagStatus) tagStatus.textContent = (res.d && res.d.error) || 'Save failed. Sign in under Live Publishing first.';
                    return;
                }
                if (tagStatus) tagStatus.textContent = 'Saved. Players see it on their next art refresh.';
                if (res.d.art) {
                    artCache = res.d.art;
                    renderGallery();
                }
            })
            .catch(function () { if (tagStatus) tagStatus.textContent = 'Save failed — network error.'; });
    }

    document.getElementById('loadingArtCardAdd')?.addEventListener('click', addCard);
    document.getElementById('loadingArtShopAdd')?.addEventListener('click', addSlot);
    document.getElementById('loadingArtTagsSave')?.addEventListener('click', saveDraft);
    cardInput?.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addCard(); } });
    shopInput?.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addSlot(); } });
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
            if (tagStatus) tagStatus.textContent = 'Unsaved changes.';
            renderDraft();
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

    function closePreview() {
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
        return true;
    }

    function matchesSearch(piece) {
        if (!searchInput) return true;
        var q = (searchInput.value || '').trim().toLowerCase();
        if (!q) return true;
        var hay = [piece.id, piece.title, piece.place, piece.source].concat(piece.cards || [], piece.shop || [])
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
                return '<article class="loading-art-card' +
                    (missing.length ? ' is-incomplete' : '') +
                    (piece.source === 'cinematic' ? ' is-cinematic' : '') +
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
        return fetch('/api/art/loading').then(function (r) { return r.json(); }).then(function (data) {
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
