(function () {
    'use strict';

    var sections = Array.prototype.slice.call(document.querySelectorAll('.help-section'));
    var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc-nav a'));
    var chipLinks = Array.prototype.slice.call(document.querySelectorAll('.help-chip-nav a'));
    var fabLinks = Array.prototype.slice.call(document.querySelectorAll('#helpFabMenu a'));
    var searchInput = document.getElementById('helpSearch');
    var fab = document.getElementById('helpFab');
    var fabMenu = document.getElementById('helpFabMenu');

    function setActive(id) {
        var href = '#' + id;
        tocLinks.concat(fabLinks).forEach(function (link) {
            link.classList.toggle('is-active', link.getAttribute('href') === href);
        });
    }

    function setFabOpen(open) {
        if (!fab || !fabMenu) return;
        fab.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) fabMenu.removeAttribute('hidden');
        else fabMenu.setAttribute('hidden', '');
    }

    function onScroll() {
        var marker = window.scrollY + 100;
        var current = sections[0] && sections[0].id;
        sections.forEach(function (section) {
            if (section.classList.contains('is-hidden')) return;
            if (section.offsetTop <= marker) current = section.id;
        });
        if (current) setActive(current);
    }

    function filterSections(query) {
        var q = String(query || '').trim().toLowerCase();
        sections.forEach(function (section) {
            if (!q) {
                section.classList.remove('is-hidden');
                return;
            }
            var keywords = (section.getAttribute('data-help-keywords') || '').toLowerCase();
            var text = (section.textContent || '').toLowerCase();
            var match = keywords.indexOf(q) !== -1 || text.indexOf(q) !== -1;
            section.classList.toggle('is-hidden', !match);
        });
        onScroll();
    }

    function jumpTo(id) {
        var target = document.getElementById(id) || (id === 'top' ? document.getElementById('top') : null);
        if (!target) return;
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        setActive(id === 'top' ? (sections[0] && sections[0].id) : id);
        setFabOpen(false);
    }

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            filterSections(searchInput.value);
        });
    }

    if (fab) {
        fab.addEventListener('click', function (event) {
            event.stopPropagation();
            var open = fab.getAttribute('aria-expanded') !== 'true';
            setFabOpen(open);
        });
    }

    fabLinks.forEach(function (link) {
        link.addEventListener('click', function (event) {
            var id = (link.getAttribute('href') || '').replace('#', '');
            if (!id) return;
            event.preventDefault();
            jumpTo(id);
        });
    });

    document.addEventListener('click', function (event) {
        if (!fabMenu || fabMenu.hasAttribute('hidden')) return;
        var wrap = document.getElementById('helpFabWrap');
        if (wrap && wrap.contains(event.target)) return;
        setFabOpen(false);
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') setFabOpen(false);
    });

    /**
     * The guide must not document an element the dashboard has switched off — a
     * player who reads about Blind cannot inflict it while Light is dark. The
     * roster is fetched rather than baked in; a failed fetch leaves the full
     * page standing, which is better than hiding real mechanics on a blip.
     */
    function elementOfChip(chip) {
        var classes = (chip.className || '').split(/\s+/);
        for (var i = 0; i < classes.length; i++) {
            if (classes[i] && classes[i] !== 'el-chip') return classes[i];
        }
        return '';
    }

    function titleCase(name) {
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    function joinWithAnd(names) {
        if (names.length <= 1) return names.join('');
        if (names.length === 2) return names[0] + ' and ' + names[1];
        return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
    }

    function applyLiveElements(live) {
        Array.prototype.forEach.call(document.querySelectorAll('.aff-row[data-el]'), function (row) {
            if (!live[row.getAttribute('data-el')]) row.remove();
        });

        Array.prototype.forEach.call(document.querySelectorAll('.str-row'), function (row) {
            var chips = Array.prototype.slice.call(row.querySelectorAll('.el-chip'));
            if (chips.length === 0) return;
            // First chip is the attacker; the rest are the defenders it beats.
            if (!live[elementOfChip(chips[0])]) {
                row.remove();
                return;
            }
            var survivors = 0;
            chips.slice(1).forEach(function (chip) {
                if (live[elementOfChip(chip)]) survivors += 1;
                else chip.remove();
            });
            if (survivors === 0) row.remove();
        });

        var note = document.getElementById('energyPoolsNote');
        if (note) {
            var pooled = (note.getAttribute('data-pool-elements') || '').split(',')
                .filter(function (name) { return live[name]; }).map(titleCase);
            var neutral = (note.getAttribute('data-neutral-elements') || '').split(',')
                .filter(function (name) { return live[name]; });
            var riders = { poison: 'Toxin', light: 'Blind' };
            var html = '<strong>Energy pools:</strong> ' + joinWithAnd(pooled)
                + (pooled.length === 1 ? ' has a dedicated pool.' : ' have dedicated pools.');
            if (neutral.length > 0) {
                html += ' ' + joinWithAnd(neutral.map(titleCase)) + ' attacks still apply '
                    + joinWithAnd(neutral.map(function (name) { return riders[name] || titleCase(name); }))
                    + ', but ' + (neutral.length === 1 ? 'its' : 'their') + ' action cards use Neutral costs.';
            }
            if (pooled.length > 0) note.innerHTML = html;
        }

        onScroll();
    }

    fetch('/api/game/live-elements')
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (data) {
            var names = data && data.liveElements;
            if (!names || !names.length) return;
            var live = {};
            names.forEach(function (name) { live[String(name).toLowerCase()] = true; });
            applyLiveElements(live);
        })
        .catch(function () { /* Keep the full guide when the roster is unreachable. */ });

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (location.hash) {
        var hashId = location.hash.replace('#', '');
        var hashTarget = document.getElementById(hashId);
        if (hashTarget) {
            requestAnimationFrame(function () {
                hashTarget.scrollIntoView({ block: 'start' });
            });
        }
    }

    chipLinks.concat(tocLinks).forEach(function (link) {
        link.addEventListener('click', function () {
            var id = (link.getAttribute('href') || '').replace('#', '');
            if (id) setActive(id);
        });
    });
}());
