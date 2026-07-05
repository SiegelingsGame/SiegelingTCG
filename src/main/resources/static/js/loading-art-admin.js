/* Loading screen art upload + preview gallery for the card dashboard. */
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
    var artCache = [];

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

    function openPreview(pieceId) {
        var piece = artCache.find(function (p) { return p.id === pieceId; });
        if (!piece || !overlay) return;
        var orients = orientations(piece);
        if (!orients.length) return;

        previewTitle.textContent = piece.title || piece.id;
        previewTabs.innerHTML = orients.map(function (o, i) {
            return '<button type="button" data-url="' + escapeHtml(o.url) + '"' +
                (i === 0 ? ' class="active"' : '') + '>' + escapeHtml(o.label) + '</button>';
        }).join('');

        previewImg.src = orients[0].url;
        previewImg.alt = (piece.title || piece.id) + ' loading art';
        overlay.classList.remove('hidden');

        Array.prototype.forEach.call(previewTabs.querySelectorAll('button'), function (btn) {
            btn.addEventListener('click', function () {
                Array.prototype.forEach.call(previewTabs.querySelectorAll('button'), function (b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                previewImg.src = btn.getAttribute('data-url');
            });
        });
    }

    function closePreview() {
        if (overlay) overlay.classList.add('hidden');
        if (previewImg) previewImg.src = '';
    }

    function renderGallery(art) {
        artCache = art;
        if (!gallery) return;
        if (!art.length) {
            gallery.innerHTML = '<p class="section-help">No loading art uploaded yet. Upload landscape and/or portrait images above.</p>';
            if (listNote) listNote.textContent = '';
            return;
        }
        gallery.innerHTML = art.map(function (piece) {
            var thumb = piece.landscape || piece.portrait || '';
            var tags = [piece.landscape ? 'landscape' : '', piece.portrait ? 'portrait' : ''].filter(Boolean).join(' + ');
            return '<article class="loading-art-card" data-piece-id="' + escapeHtml(piece.id) + '" tabindex="0" role="button" aria-label="Preview ' + escapeHtml(piece.title || piece.id) + '">' +
                '<div class="loading-art-card-thumb">' +
                (thumb ? '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy">' : '<span class="section-help">No image</span>') +
                '</div>' +
                '<div class="loading-art-card-meta"><strong>' + escapeHtml(piece.title || piece.id) + '</strong>' +
                '<span>' + escapeHtml(tags) + '</span></div></article>';
        }).join('');

        if (listNote) {
            listNote.textContent = art.length + ' piece' + (art.length === 1 ? '' : 's') + ' — click a card to preview.';
        }

        Array.prototype.forEach.call(gallery.querySelectorAll('.loading-art-card'), function (card) {
            function activate() { openPreview(card.getAttribute('data-piece-id')); }
            card.addEventListener('click', activate);
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
            });
        });
    }

    function refreshList() {
        fetch('/api/art/loading').then(function (r) { return r.json(); }).then(function (data) {
            renderGallery((data && data.art) || []);
        }).catch(function () {
            if (gallery) gallery.innerHTML = '<p class="section-help">Could not load loading art.</p>';
        });
    }

    fileInput?.addEventListener('change', function () {
        setStatus(fileInput.files[0] ? fileInput.files[0].name + ' ready' : '');
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
                if (res.d.art) renderGallery(res.d.art);
                else refreshList();
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

    refreshList();
})();
