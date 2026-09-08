/* Keep Guide — coach walkthrough of My Keep.
 *
 * Uses the shared TutorialCoach spotlight (same ring + tip card as Arena and
 * Siege). Guests get a local demo sanctuary so the guide can highlight real UI
 * without signing in; signed-in keepers walk their live Keep. Official Keep
 * play still requires a session — ending the guest guide returns the gate.
 *
 * ES5-flavoured to match coach.js / siege-tutorial.js.
 */
(function () {
  'use strict';

  var ACTIVE = false;
  var TUTORIAL_KEY = 'sieglingsKeepTutorialSeen';

  function host() { return window.KeepGuideHost || null; }

  function hidden(id) {
    var n = document.getElementById(id);
    return !n || n.classList.contains('hidden') || n.getAttribute('aria-hidden') === 'true';
  }

  function panelIs(id) {
    var h = host();
    return Boolean(h && h.panel() === id);
  }

  function interiorIs(id) {
    var h = host();
    return Boolean(h && h.interior() === id);
  }

  function interiorOpen() {
    var h = host();
    return Boolean(h && h.interior());
  }

  /** Demo sanctuary for guests — early keep with ready timber, a live build timer,
   *  and a resident so every spotlight has something real to point at. */
  function demoSnapshot() {
    var now = Date.now();
    return {
      serverTime: new Date(now).toISOString(),
      stateVersion: 1,
      keepName: 'My Keep',
      chapter: { id: 'wounded_ground', number: 1, title: 'The Wounded Ground' },
      resources: {
        timber: 42,
        timberCapacity: 120,
        materialCapacity: 80,
        materials: [
          { id: 'verdant_fiber', amount: 6, capacity: 80 },
          { id: 'ember_ingot', amount: 2, capacity: 80 }
        ],
        gold: 100,
        remnants: 0
      },
      station: {
        id: 'woodlot', name: 'Restorative Woodlot', level: 1,
        available: 7, storageCapacity: 40, ratePerMinute: 1,
        residentId: 'demo-emberkit',
        resident: { id: 'demo-emberkit', name: 'Emberkit', element: 'FIRE', rarity: 'COMMON' },
        resource: 'TIMBER', resourceName: 'Timber', affinities: ['EARTH', 'FIRE']
      },
      // Keep counters iterate `stations || [station]`; an empty array is truthy and
      // would hide the Woodlot from Ready / Siegeling pills during the demo.
      stations: [{
        id: 'woodlot', name: 'Restorative Woodlot', level: 1,
        available: 7, storageCapacity: 40, ratePerMinute: 1,
        residentId: 'demo-emberkit',
        resident: { id: 'demo-emberkit', name: 'Emberkit', element: 'FIRE', rarity: 'COMMON' },
        resource: 'TIMBER', resourceName: 'Timber', affinities: ['EARTH', 'FIRE']
      }],
      residents: [
        { id: 'demo-emberkit', name: 'Emberkit', element: 'FIRE', rarity: 'COMMON',
          assignment: { assigned: true, type: 'STATION', id: 'woodlot', label: 'Restorative Woodlot' },
          rapport: { level: 1 } },
        { id: 'demo-brookpaw', name: 'Brookpaw', element: 'WATER', rarity: 'COMMON',
          assignment: { assigned: false }, rapport: { level: 0 } }
      ],
      siegelingSlots: { active: 1, capacity: 3, available: 2 },
      constructionTeams: { active: 1, capacity: 1, available: 0 },
      buildings: [
        { id: 'great_hall', level: 1, status: 'COMPLETE' },
        { id: 'woodlot', level: 1, status: 'COMPLETE' }
      ],
      buildOptions: [
        { id: 'archive_restore', name: 'Restore the Living Archive', canStart: true, timberCost: 20, durationSeconds: 120 },
        { id: 'storehouse', name: 'Raise the Storehouse', canStart: true, timberCost: 35, durationSeconds: 180 }
      ],
      activeConstruction: {
        id: 'archive_restore',
        name: 'Restore the Living Archive',
        startedAt: new Date(now - 30000).toISOString(),
        completesAt: new Date(now + 90000).toISOString(),
        durationSeconds: 120,
        timeSavers: { materialCost: { verdant_fiber: 4 }, coinCost: 25, canUseMaterials: true, canUseSiegecoins: true }
      },
      activeConstructions: [{
        id: 'archive_restore',
        name: 'Restore the Living Archive',
        startedAt: new Date(now - 30000).toISOString(),
        completesAt: new Date(now + 90000).toISOString(),
        durationSeconds: 120,
        timeSavers: { materialCost: { verdant_fiber: 4 }, coinCost: 25, canUseMaterials: true, canUseSiegecoins: true }
      }],
      constructionSlots: 1,
      visualState: {
        archiveRestored: false, woodlotLevel: 1, healingStage: 1,
        hallLevel: 1, hallTheme: 'covenant', akharsFrontLevel: 0
      },
      keepRank: { level: 1, maxLevel: 8, name: 'Ruined Camp' },
      keeper: { level: 1, xp: 0, rankName: 'Keeper', levels: [] },
      favorite: {},
      enclave: { built: false, slots: [], capacity: 5, residentCount: 0 },
      akharsFront: { built: false, level: 0, capacity: 0, slots: [], residentCount: 0 },
      hallThemes: [{ id: 'covenant', name: 'Covenant', unlocked: true }],
      lore: [],
      unreadLoreCount: 0,
      availableConversations: [],
      relationships: [],
      choiceFlags: [],
      keepEvents: { catalogSize: 0 },
      recipes: [],
      decorations: [],
      placedDecorations: {},
      milestones: [],
      weeklyTribute: {},
      weeklyOrder: {},
      notices: [],
      progressionReady: true
    };
  }

  function markSeen() {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) { /* private browsing */ }
  }

  function buildSteps() {
    return [
      {
        id: 'welcome',
        kicker: 'Keep Guide',
        title: 'The Wounded Ground',
        target: '#keepScene',
        body: 'My Keep is your elemental sanctuary. Workshops keep producing and construction timers keep ticking while you are away. Siegelings volunteer by invitation — nothing here forces them to labor.'
      },
      {
        id: 'dock',
        kicker: 'Command bar',
        title: 'Everything starts at the dock',
        target: '.keep-dock',
        body: 'Residents, Projects, Collect, Chronicle, and Voices live here. The rest of this guide walks each one on the real sanctuary.'
      },
      {
        id: 'projects-open',
        kicker: 'Projects',
        title: 'Raise the ruins',
        hint: 'Tap <b>Projects</b>',
        target: '.keep-dock [data-open-panel="projects"]',
        body: 'Open Projects to spend timber raising ruined buildings. Each job uses a construction team and a timer.',
        until: function () { return panelIs('projects'); }
      },
      {
        id: 'projects-read',
        kicker: 'Projects',
        title: 'Spend timber, change the land',
        hint: 'Close with <b>×</b> when you are ready',
        target: '#keepPanel',
        avoid: '#panelClose',
        highlight: ['#keepPanel', '#panelClose'],
        body: 'Finished projects change the sanctuary scene itself — halls rise, workshops appear, the Archive wakes. Close the panel to continue.',
        until: function () { return !panelIs('projects'); }
      },
      {
        id: 'timers',
        kicker: 'Timers',
        title: 'Construction keeps working',
        target: function () {
          if (document.querySelector('.construction-banner:not(.hidden)')) return '.construction-banner';
          if (document.querySelector('.construction-team-pill')) return '.construction-team-pill';
          return '.keep-dock [data-open-panel="projects"]';
        },
        body: 'Active builds tick down here — even offline. Need it sooner? Spend workshop materials to cut the remaining time, or Siegecoins to finish now.'
      },
      {
        id: 'collect',
        kicker: 'Gather',
        title: 'Collect materials',
        target: '#collectButton',
        highlight: ['#collectButton', '.station-pill'],
        body: 'The Woodlot and elemental workshops produce timber and materials over time. The READY counter shows what is waiting. Tap Collect to store it all at once — or collect from inside a single building.'
      },
      {
        id: 'residents-open',
        kicker: 'Siegelings',
        title: 'Assign partners',
        hint: 'Tap <b>Residents</b>',
        target: '.keep-dock [data-open-panel="residents"]',
        body: 'Owned Siegeling cards introduce their families as residents. Invite them to workshops for affinity bonuses.',
        until: function () { return panelIs('residents'); }
      },
      {
        id: 'residents-read',
        kicker: 'Siegelings',
        title: 'Workshops, Enclave, Front',
        hint: 'Close with <b>×</b> when you are ready',
        target: '#keepPanel',
        avoid: '#panelClose',
        highlight: ['#keepPanel', '#panelClose'],
        body: 'House Siegelings in the Enclave for rapport tasks, or post volunteers on Akhar\'s Front. Assigned Siegelings stay available for decks and expeditions. Close the panel to continue.',
        until: function () { return !panelIs('residents'); }
      },
      {
        id: 'building-open',
        kicker: 'Buildings',
        title: 'Step inside',
        hint: 'Tap the <b>Restorative Woodlot</b>',
        target: '.woodlot-hotspot',
        body: 'Tap any restored building to enter it. Inside you craft tools and decorations, start upgrades, and manage who works there.',
        until: function () { return interiorIs('woodlot'); }
      },
      {
        id: 'building-inside',
        kicker: 'Interiors',
        title: 'Build inside your buildings',
        hint: 'Tap <b>Grounds</b> when ready',
        target: '#keepInterior',
        avoid: '#interiorExit',
        highlight: ['#keepInterior', '#interiorExit'],
        body: 'Craft from gathered materials, place memorabilia, and invite residents from the room itself. Return to the grounds when you are ready.',
        until: function () { return !interiorOpen(); }
      },
      {
        id: 'voices',
        kicker: 'Listen',
        title: 'Voices & the Chronicle',
        target: '.keep-dock [data-open-panel="conversations"]',
        highlight: [
          '.keep-dock [data-open-panel="conversations"]',
          '.keep-dock [data-open-panel="chronicle"]'
        ],
        body: 'Visitors bring conversations — your answers shape trust and rapport, never production rates. The Chronicle holds recovered letters and lore.'
      },
      {
        id: 'finale',
        kicker: 'You are ready',
        title: 'Restore the sanctuary',
        target: '#helpButton',
        finish: true,
        finale: true,
        body: 'After the Storehouse, choose which elemental workshop to raise first. Reopen this Keep Guide anytime from the <b>?</b> button. Guests: sign in when you are ready to found your own Keep.'
      }
    ];
  }

  function start(options) {
    if (ACTIVE) return;
    if (!window.TutorialCoach) {
      console.warn('Keep Guide needs TutorialCoach');
      return;
    }
    if (window.TutorialCoach.active()) return;
    var h = host();
    if (!h) {
      console.warn('Keep Guide needs KeepGuideHost');
      return;
    }
    options = options || {};
    ACTIVE = true;
    h.prepareGuide({ demo: demoSnapshot, manual: Boolean(options.manual) });
    window.TutorialCoach.start({
      steps: buildSteps(),
      playAreas: ['#keepPanel', '#keepInterior', '.keep-dock', '#sceneViewport'],
      onStop: finish,
      bodyClass: 'keep-guide-active'
    });
  }

  function finish() {
    if (!ACTIVE) return;
    ACTIVE = false;
    markSeen();
    var h = host();
    if (h) h.restoreAfterGuide();
  }

  function stop() {
    if (!ACTIVE) return;
    if (window.TutorialCoach && window.TutorialCoach.active()) window.TutorialCoach.stop();
    else finish();
  }

  window.KeepGuide = {
    start: start,
    stop: stop,
    active: function () { return ACTIVE; }
  };
})();
