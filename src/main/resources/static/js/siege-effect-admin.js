/* Shared Siege ability-effect settings panel for the card dashboard.
 * One tile per Effect in a grid rather than a page-tall table of rows: the
 * settings are read together and usually changed together, so the panel edits
 * them all in place and publishes the whole screen in a single request.
 * Only tiles the editor actually touched are sent. */
(function () {
    'use strict';
    var TOKEN_KEY = 'sieglingsCardEditorToken';
    var host = document.getElementById('siegeEffectPanel');
    if (!host) return;

    var FIELD_LABEL = {
        valueBonus: 'Value bonus',
        valueCap: 'Value cap',
        minActionCost: 'Min AP',
        durationRounds: 'Duration'
    };
    var FIELD_HINT = {
        valueBonus: 'Added to the printed board value when the move becomes a Siege card.',
        valueCap: 'Ceiling on the magnitude. 0 means uncapped.',
        minActionCost: 'AP floor for cards with this effect, however cheap the board version is.',
        durationRounds: 'Rounds a buff or shield from this effect holds.'
    };

    /* Server state, and the edits made on top of it. Kept apart so the panel can
     * show what changed, revert without a reload, and send only what moved. */
    var data = null;
    var dirtyEffects = {};   // effect -> { field: valueOrNull }
    var dirtyGlobals = {};   // key -> valueOrNull
    var resetEffects = {};   // effect -> true

    function editorToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function effectRow(name) {
        for (var i = 0; i < (data.effects || []).length; i++) {
            if (data.effects[i].effect === name) return data.effects[i];
        }
        return null;
    }

    /** What a field shows right now: the pending edit if there is one, else the saved value. */
    function shownValue(row, field) {
        if (resetEffects[row.effect]) return row.defaults[field];
        var pending = dirtyEffects[row.effect];
        if (pending && Object.prototype.hasOwnProperty.call(pending, field)) {
            return pending[field] == null ? row.defaults[field] : pending[field];
        }
        return row[field];
    }

    function shownGlobal(g) {
        if (Object.prototype.hasOwnProperty.call(dirtyGlobals, g.key)) {
            return dirtyGlobals[g.key] == null ? g.defaultValue : dirtyGlobals[g.key];
        }
        return g.value;
    }

    function pendingCount() {
        var n = Object.keys(dirtyEffects).length + Object.keys(dirtyGlobals).length;
        for (var effect in resetEffects) {
            if (resetEffects.hasOwnProperty(effect) && !dirtyEffects[effect]) n++;
        }
        return n;
    }

    function field(row, name) {
        var value = shownValue(row, name);
        var isDefault = value === row.defaults[name];
        return '<label class="siege-effect-field' + (isDefault ? '' : ' is-set') + '">' +
            '<span class="siege-effect-field-name" title="' + escapeHtml(FIELD_HINT[name]) + '">' +
            FIELD_LABEL[name] + '</span>' +
            '<input type="number" data-effect="' + escapeHtml(row.effect) + '" data-field="' + name + '" ' +
            'value="' + value + '" min="0" max="99" ' +
            'placeholder="' + row.defaults[name] + '" title="Default ' + row.defaults[name] + '" />' +
            '<span class="siege-effect-hint">def ' + row.defaults[name] + '</span></label>';
    }

    function tile(row) {
        var touched = !!dirtyEffects[row.effect] || !!resetEffects[row.effect];
        var overridden = row.isOverride && !resetEffects[row.effect];
        var classes = 'siege-effect-tile' +
            (overridden ? ' is-override' : '') +
            (touched ? ' is-dirty' : '') +
            ((row.fields || []).length ? '' : ' is-inert');
        return '<div class="' + classes + '" data-tile="' + escapeHtml(row.effect) + '">' +
            '<div class="siege-effect-tile-head">' +
            '<b>' + escapeHtml(row.label) + '</b>' +
            '<code>' + escapeHtml(row.effect) + '</code>' +
            (overridden ? '<button type="button" class="siege-effect-revert" ' +
                'title="Return this effect to its built-in settings">reset</button>' : '') +
            '</div>' +
            ((row.fields || []).length
                ? '<div class="siege-effect-fields">' +
                    row.fields.map(function (f) { return field(row, f); }).join('') + '</div>'
                : '<p class="siege-effect-inert">No shared settings — this effect has no magnitude ' +
                  'of its own.</p>') +
            '</div>';
    }

    function globalRow(g) {
        var value = shownGlobal(g);
        var dirty = Object.prototype.hasOwnProperty.call(dirtyGlobals, g.key);
        return '<label class="siege-effect-global' + (g.isOverride && !dirty ? ' is-override' : '') +
            (dirty ? ' is-dirty' : '') + '">' +
            '<span><b>' + escapeHtml(g.label) + '</b><small>' + escapeHtml(g.description) + '</small></span>' +
            '<span class="siege-effect-global-input">' +
            '<input type="number" data-global="' + escapeHtml(g.key) + '" value="' + value + '" ' +
            'min="0" max="100" placeholder="' + g.defaultValue + '" title="Default ' + g.defaultValue + '" />' +
            '<span class="siege-effect-hint">def ' + g.defaultValue + '</span></span></label>';
    }

    function render() {
        var pending = pendingCount();
        var source = data.source === 'FIRESTORE'
            ? 'Publishes live to Firestore'
            : 'Publishes to the local project file (no Firestore credentials here)';
        var who = data.updatedBy ? ' · last edited by ' + escapeHtml(data.updatedBy) : '';
        var overridden = (data.effects || []).filter(function (r) { return r.isOverride; }).length +
            (data.globals || []).filter(function (g) { return g.isOverride; }).length;

        host.innerHTML =
            '<p class="siege-class-note">Shared settings for every Siege ability of a given effect — ' +
            'change one tile and every card using that effect follows. Edit as many as you like, then ' +
            'publish once. A box left at its default is not sent; clearing a box returns that setting to ' +
            'the default. Requires an editor login; saves apply to battles started afterwards. ' +
            '<em>' + source + who + '</em></p>' +
            '<div class="siege-effect-toolbar">' +
            '<span class="siege-effect-count">' + overridden + ' setting' + (overridden === 1 ? '' : 's') +
            ' differ from the shipped balance</span>' +
            '<label class="siege-effect-filter"><input type="checkbox" id="siegeEffectOnlySet"' +
            (host.dataset.onlySet === '1' ? ' checked' : '') + ' /> Show only changed</label>' +
            '</div>' +
            '<div class="siege-effect-grid">' +
            (data.effects || []).filter(function (row) {
                return host.dataset.onlySet !== '1' || row.isOverride || dirtyEffects[row.effect];
            }).map(tile).join('') +
            '</div>' +
            '<h4 class="siege-effect-subhead">Cross-effect settings</h4>' +
            '<div class="siege-effect-globals">' + (data.globals || []).map(globalRow).join('') + '</div>' +
            '<div class="siege-effect-bar' + (pending ? ' is-active' : '') + '">' +
            '<span class="siege-effect-bar-text">' +
            (pending ? pending + ' unsaved change' + (pending === 1 ? '' : 's') : 'No unsaved changes') +
            '</span>' +
            '<span class="siege-class-status" id="siegeEffectStatus"></span>' +
            '<button type="button" id="siegeEffectRevert"' + (pending ? '' : ' disabled') + '>Discard</button>' +
            '<button type="button" id="siegeEffectSave" class="primary"' + (pending ? '' : ' disabled') +
            '>Publish changes</button></div>';
        bind();
    }

    function bind() {
        Array.prototype.forEach.call(host.querySelectorAll('input[data-field]'), function (input) {
            input.addEventListener('input', function () {
                var effect = input.getAttribute('data-effect');
                var name = input.getAttribute('data-field');
                var row = effectRow(effect);
                var raw = input.value.trim();
                var value = raw === '' ? null : parseInt(raw, 10);
                if (raw !== '' && isNaN(value)) return;
                // Editing a tile takes it out of "reset" — the editor is setting
                // values again, not clearing the row.
                delete resetEffects[effect];
                var pending = dirtyEffects[effect] || (dirtyEffects[effect] = {});
                pending[name] = value;
                // Back to exactly what the server holds? Then it is not a change.
                if (value === row[name]) delete pending[name];
                if (!Object.keys(pending).length) delete dirtyEffects[effect];
                refreshBar();
                input.parentNode.classList.toggle('is-set', Number(input.value) !== row.defaults[name]);
                var tileEl = host.querySelector('.siege-effect-tile[data-tile="' + effect + '"]');
                if (tileEl) tileEl.classList.toggle('is-dirty', !!dirtyEffects[effect]);
            });
        });
        Array.prototype.forEach.call(host.querySelectorAll('input[data-global]'), function (input) {
            input.addEventListener('input', function () {
                var key = input.getAttribute('data-global');
                var g = (data.globals || []).filter(function (x) { return x.key === key; })[0];
                var raw = input.value.trim();
                var value = raw === '' ? null : parseInt(raw, 10);
                if (raw !== '' && isNaN(value)) return;
                dirtyGlobals[key] = value;
                if (value === g.value) delete dirtyGlobals[key];
                input.parentNode.parentNode.classList.toggle('is-dirty',
                    Object.prototype.hasOwnProperty.call(dirtyGlobals, key));
                refreshBar();
            });
        });
        Array.prototype.forEach.call(host.querySelectorAll('.siege-effect-revert'), function (btn) {
            btn.addEventListener('click', function () {
                var effect = btn.closest('.siege-effect-tile').getAttribute('data-tile');
                delete dirtyEffects[effect];
                resetEffects[effect] = true;
                render();
            });
        });
        var onlySet = document.getElementById('siegeEffectOnlySet');
        if (onlySet) {
            onlySet.addEventListener('change', function () {
                host.dataset.onlySet = onlySet.checked ? '1' : '0';
                render();
            });
        }
        var save = document.getElementById('siegeEffectSave');
        if (save) save.addEventListener('click', publish);
        var discard = document.getElementById('siegeEffectRevert');
        if (discard) discard.addEventListener('click', function () {
            dirtyEffects = {};
            dirtyGlobals = {};
            resetEffects = {};
            render();
        });
    }

    /** Updates the save bar without re-rendering: a re-render would steal focus mid-typing. */
    function refreshBar() {
        var pending = pendingCount();
        var bar = host.querySelector('.siege-effect-bar');
        if (!bar) return;
        bar.classList.toggle('is-active', pending > 0);
        bar.querySelector('.siege-effect-bar-text').textContent = pending
            ? pending + ' unsaved change' + (pending === 1 ? '' : 's')
            : 'No unsaved changes';
        document.getElementById('siegeEffectSave').disabled = !pending;
        document.getElementById('siegeEffectRevert').disabled = !pending;
    }

    function publish() {
        var status = document.getElementById('siegeEffectStatus');
        var effects = [];
        for (var effect in resetEffects) {
            if (resetEffects.hasOwnProperty(effect) && !dirtyEffects[effect]) {
                effects.push({ effect: effect, reset: true });
            }
        }
        for (var name in dirtyEffects) {
            if (!dirtyEffects.hasOwnProperty(name)) continue;
            var patch = { effect: name };
            for (var f in dirtyEffects[name]) {
                if (dirtyEffects[name].hasOwnProperty(f)) patch[f] = dirtyEffects[name][f];
            }
            effects.push(patch);
        }
        status.textContent = 'Publishing…';
        fetch('/api/siege/effects/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Card-Editor-Token': editorToken() },
            body: JSON.stringify({ effects: effects, globals: dirtyGlobals })
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body && body.error ? body.error : 'Save failed (' + r.status + ')');
                data = body;
                dirtyEffects = {};
                dirtyGlobals = {};
                resetEffects = {};
                render();
                var el = document.getElementById('siegeEffectStatus');
                el.textContent = '✓ published';
                setTimeout(function () {
                    if (el.textContent === '✓ published') el.textContent = '';
                }, 2200);
            });
        }).catch(function (e) {
            // The edits stay on screen so nothing typed is lost to a failed save.
            status.textContent = '✗ ' + e.message;
        });
    }

    fetch('/api/siege/effects').then(function (r) { return r.json(); }).then(function (body) {
        data = body;
        render();
    }).catch(function () {
        host.innerHTML = '<p class="siege-class-note">Could not load Siege ability effects.</p>';
    });
})();
