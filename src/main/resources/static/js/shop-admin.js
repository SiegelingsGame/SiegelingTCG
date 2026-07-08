/* Shop price admin panel for the card dashboard.
 * Lists the rarity x card-type price grid from /api/shop/prices and lets an
 * authenticated editor override or reset the price for each combination. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('shopPricePanel');
    if (!host) return;

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function titleCase(s) {
        var lower = String(s || '').toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    function cellId(rarity, cardType, suffix) {
        return 'shopCell_' + rarity + '_' + cardType + '_' + suffix;
    }

    function render(data) {
        var rarities = data.rarities || [];
        var cardTypes = data.cardTypes || [];
        var byKey = {};
        (data.prices || []).forEach(function (row) {
            byKey[row.rarity + '|' + row.cardType] = row;
        });

        var headerCells = cardTypes.map(function (ct) {
            return '<th>' + titleCase(ct) + '</th>';
        }).join('');

        var bodyRows = rarities.map(function (rarity) {
            var cells = cardTypes.map(function (cardType) {
                var row = byKey[rarity + '|' + cardType] || { defaultPrice: 0, overridePrice: null, price: 0, isOverride: false };
                var inputId = cellId(rarity, cardType, 'input');
                var saveId = cellId(rarity, cardType, 'save');
                var resetId = cellId(rarity, cardType, 'reset');
                var statusId = cellId(rarity, cardType, 'status');
                return '<td class="shop-price-cell' + (row.isOverride ? ' is-override' : '') + '">' +
                    '<input id="' + inputId + '" type="number" min="0" max="100000" value="' + row.price + '" />' +
                    '<div class="shop-price-cell-actions">' +
                    '<button id="' + saveId + '" type="button" class="btn btn-secondary" data-rarity="' + rarity + '" data-card-type="' + cardType + '">Save</button>' +
                    '<button id="' + resetId + '" type="button" class="btn btn-secondary" data-rarity="' + rarity + '" data-card-type="' + cardType + '"' +
                    (row.isOverride ? '' : ' disabled') + '>Reset</button>' +
                    '</div>' +
                    '<div class="shop-price-cell-hint">' +
                    (row.isOverride ? 'Override (default ' + row.defaultPrice + ')' : 'Default') +
                    '</div>' +
                    '<span id="' + statusId + '" class="siege-class-status"></span>' +
                    '</td>';
            }).join('');
            return '<tr><th>' + escapeHtml(titleCase(rarity)) + '</th>' + cells + '</tr>';
        }).join('');

        host.innerHTML =
            '<p class="siege-class-note">Set a shop price for every card of a given rarity + card type. ' +
            'Overrides apply immediately to packs and daily offers; cells without an override use the default price. ' +
            'Requires an editor login.</p>' +
            '<div class="shop-price-table-wrap">' +
            '<table class="siege-class-table shop-price-table"><thead><tr><th></th>' + headerCells + '</tr></thead>' +
            '<tbody>' + bodyRows + '</tbody></table>' +
            '</div>';

        rarities.forEach(function (rarity) {
            cardTypes.forEach(function (cardType) {
                var saveBtn = document.getElementById(cellId(rarity, cardType, 'save'));
                var resetBtn = document.getElementById(cellId(rarity, cardType, 'reset'));
                if (saveBtn) saveBtn.addEventListener('click', function () { save(rarity, cardType); });
                if (resetBtn) resetBtn.addEventListener('click', function () { reset(rarity, cardType); });
            });
        });
    }

    function save(rarity, cardType) {
        var status = document.getElementById(cellId(rarity, cardType, 'status'));
        var input = document.getElementById(cellId(rarity, cardType, 'input'));
        var price = parseInt(input.value, 10);
        if (isNaN(price)) {
            status.textContent = '✗ enter a number';
            return;
        }
        status.textContent = '…';
        fetch('/api/shop/prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({ rarity: rarity, cardType: cardType, price: price })
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) throw new Error(data && data.error ? data.error : 'Save failed (' + r.status + ')');
                render(data);
                var s = document.getElementById(cellId(rarity, cardType, 'status'));
                if (s) { s.textContent = '✓ saved'; setTimeout(function () { s.textContent = ''; }, 1600); }
            });
        }).catch(function (e) { status.textContent = '✗ ' + e.message; });
    }

    function reset(rarity, cardType) {
        var status = document.getElementById(cellId(rarity, cardType, 'status'));
        status.textContent = '…';
        fetch('/api/shop/prices/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({ rarity: rarity, cardType: cardType })
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) throw new Error(data && data.error ? data.error : 'Reset failed (' + r.status + ')');
                render(data);
                var s = document.getElementById(cellId(rarity, cardType, 'status'));
                if (s) { s.textContent = '✓ reset'; setTimeout(function () { s.textContent = ''; }, 1600); }
            });
        }).catch(function (e) { status.textContent = '✗ ' + e.message; });
    }

    fetch('/api/shop/prices').then(function (r) { return r.json(); }).then(render)
        .catch(function () { host.innerHTML = '<p class="siege-class-note">Could not load shop prices.</p>'; });
})();
