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
