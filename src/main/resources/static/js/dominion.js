/* Siegelings: Dominion — idle prototype joining the Keep and Chronicles.
   Everything runs client-side against one localStorage save so it can never touch live
   accounts. One resolver (advance) moves every activity forward; the "+4h" control and
   offline catch-up both call it, so demo time and real time follow identical rules. */
(function () {
    'use strict';

    const SAVE_KEY = 'siegelingsDominionPrototype';
    const SCHEMA = 3;
    const MIN = 60000;
    const HOUR = 60 * MIN;
    // Five-minute slices keep refining batches (30-60 min) accurate without a heavy loop.
    const STEP = 5 * MIN;
    const OFFLINE_CAP = 7 * 24 * HOUR;

    // —— Art (existing project assets; crops aim at the subject) ——
    const ART = {
        knight: { src: '/img/knights/ser-airek-full-card.webp', pos: '50% 0%', origin: '46% 34%', zoom: 1.8 },
        rootwild: { src: '/img/chronicles/scenes/earth-journey.webp' },
        ruins: { src: '/img/chronicles/scenes/relic-journey.webp' },
        vault: { src: '/img/chronicles/scenes/water-journey.webp' }
    };

    // Workshop illustrations: the finished stage of each Keep construction drawing (keep.js).
    const WORKSHOP_ART = {
        "forge": "<svg class=\"build-art-svg\" viewBox=\"40 40 320 186\" preserveAspectRatio=\"xMidYMax meet\" aria-hidden=\"true\"><g data-phase-min=\"0\"><ellipse class=\"b-shadow\" cx=\"200\" cy=\"215\" rx=\"158\" ry=\"14\"/> <path class=\"b-soil\" d=\"M150 208a50 22 0 01100 0z\"/> <rect class=\"b-brick\" x=\"72\" y=\"180\" width=\"76\" height=\"12\" rx=\"2\"/> <rect class=\"b-brick\" x=\"80\" y=\"166\" width=\"60\" height=\"12\" rx=\"2\"/> <rect class=\"b-tim-d\" x=\"66\" y=\"192\" width=\"90\" height=\"10\" rx=\"4\"/> </g> <g data-phase-min=\"1\"> <path class=\"b-beam\" d=\"M156 202V52M252 202V52\"/> <path class=\"b-beam-d\" d=\"M156 84h96M156 130h96M156 172h96\"/></g> <g data-phase-min=\"2\"> <rect class=\"b-brick\" x=\"172\" y=\"150\" width=\"64\" height=\"16\" rx=\"2\"/> <rect class=\"b-brick\" x=\"172\" y=\"130\" width=\"64\" height=\"16\" rx=\"2\"/> <rect class=\"b-brick\" x=\"176\" y=\"110\" width=\"56\" height=\"16\" rx=\"2\"/> <path class=\"b-anvil\" d=\"M276 196h56l-10-14h-14l4-14h-18l4 14h-12z\"/> <path class=\"b-beam-d\" d=\"M282 202h44\"/></g> <g data-phase-min=\"3\"> <rect class=\"b-brick\" x=\"180\" y=\"88\" width=\"48\" height=\"16\" rx=\"2\"/> <path class=\"b-fire\" d=\"M204 190q-22-16-14-38 10 12 16 4 6 16 16 6 8 22-18 28z\"/> <g class=\"b-sparks\"><circle cx=\"188\" cy=\"140\" r=\"3\"/><circle cx=\"222\" cy=\"126\" r=\"2.4\"/><circle cx=\"206\" cy=\"108\" r=\"2\"/></g></g></svg>",
        "fridge": "<svg class=\"build-art-svg\" viewBox=\"40 40 320 186\" preserveAspectRatio=\"xMidYMax meet\" aria-hidden=\"true\"><g data-phase-min=\"0\"><ellipse class=\"b-shadow\" cx=\"200\" cy=\"215\" rx=\"158\" ry=\"14\"/> <path class=\"b-straw\" d=\"M70 202h110\"/> <rect class=\"b-ice\" x=\"80\" y=\"176\" width=\"38\" height=\"26\" rx=\"3\"/> <rect class=\"b-ice\" x=\"122\" y=\"176\" width=\"38\" height=\"26\" rx=\"3\"/> <rect class=\"b-canvas\" x=\"286\" y=\"164\" width=\"66\" height=\"38\" rx=\"4\"/> </g> <g data-phase-min=\"1\"> <path class=\"b-beam\" d=\"M150 202V64M256 202V64M144 68h118M146 132h114\"/></g> <g data-phase-min=\"2\"> <rect class=\"b-panel\" x=\"156\" y=\"76\" width=\"46\" height=\"48\" rx=\"3\"/> <rect class=\"b-panel\" x=\"206\" y=\"76\" width=\"46\" height=\"48\" rx=\"3\"/> <rect class=\"b-panel\" x=\"156\" y=\"140\" width=\"46\" height=\"52\" rx=\"3\"/> <rect class=\"b-panel\" x=\"206\" y=\"140\" width=\"46\" height=\"52\" rx=\"3\"/></g> <g data-phase-min=\"3\"> <path class=\"b-coil\" d=\"M170 168h68M170 152h68M170 184h68\"/> <path class=\"b-ice b-crystal\" d=\"M203 84l20 30-20 30-20-30z\"/> <circle class=\"b-glow b-lamp b-frost\" cx=\"300\" cy=\"120\" r=\"10\"/></g></svg>",
        "generator": "<svg class=\"build-art-svg\" viewBox=\"40 40 320 186\" preserveAspectRatio=\"xMidYMax meet\" aria-hidden=\"true\"><g data-phase-min=\"0\"><ellipse class=\"b-shadow\" cx=\"200\" cy=\"215\" rx=\"158\" ry=\"14\"/> <circle class=\"b-spool\" cx=\"106\" cy=\"180\" r=\"26\"/><circle class=\"b-spool-hub\" cx=\"106\" cy=\"180\" r=\"9\"/> <rect class=\"b-canvas\" x=\"272\" y=\"170\" width=\"76\" height=\"34\" rx=\"4\"/> <path class=\"b-beam-d\" d=\"M272 186h76\"/> </g> <g data-phase-min=\"1\"> <path class=\"b-ring\" d=\"M138 148a64 64 0 01128 0\"/> <path class=\"b-beam\" d=\"M138 148v54M266 148v54\"/></g> <g data-phase-min=\"2\"> <path class=\"b-winding\" d=\"M152 122l16 34M172 104l16 40M196 96l14 44M222 104l14 40M246 122l14 34\"/> <path class=\"b-beam\" d=\"M202 96V60\"/><rect class=\"b-tim-l\" x=\"188\" y=\"52\" width=\"28\" height=\"12\" rx=\"4\"/></g> <g data-phase-min=\"3\"> <path class=\"b-arc\" d=\"M172 132q30 22 60 0M162 158q40 30 80 0\"/> <circle class=\"b-glow b-lamp\" cx=\"202\" cy=\"176\" r=\"12\"/></g></svg>",
        "garden": "<svg class=\"build-art-svg\" viewBox=\"40 40 320 186\" preserveAspectRatio=\"xMidYMax meet\" aria-hidden=\"true\"><g data-phase-min=\"0\"><ellipse class=\"b-shadow\" cx=\"200\" cy=\"215\" rx=\"158\" ry=\"14\"/> <path class=\"b-soil\" d=\"M78 202h110v14H78zM212 202h110v14H212z\"/> <path class=\"b-chalk\" d=\"M86 196h94M220 196h94\"/> <rect class=\"b-tim-d\" x=\"176\" y=\"178\" width=\"48\" height=\"26\" rx=\"4\"/> </g> <g data-phase-min=\"1\"> <path class=\"b-beam\" d=\"M104 200V92M172 200V80M228 200V80M296 200V92M100 84h200\"/></g> <g data-phase-min=\"2\"> <path class=\"b-lattice\" d=\"M104 120h192M104 152h192M136 200V88M200 200V84M264 200V88\"/> <path class=\"b-hoop\" d=\"M92 200a34 34 0 0168 0M240 200a34 34 0 0168 0\"/></g> <g data-phase-min=\"3\"> <path class=\"b-leaf\" d=\"M116 118q26 6 26 34-26-4-26-34zM196 96q28 8 26 38-28-6-26-38zM266 132q26 8 24 36-26-6-24-36z\"/> <circle class=\"b-bloom\" cx=\"150\" cy=\"106\" r=\"7\"/><circle class=\"b-bloom\" cx=\"238\" cy=\"132\" r=\"6\"/> <circle class=\"b-glow b-lamp\" cx=\"322\" cy=\"128\" r=\"9\"/></g></svg>",
        "kitchen": "<svg class=\"build-art-svg\" viewBox=\"40 40 320 186\" preserveAspectRatio=\"xMidYMax meet\" aria-hidden=\"true\"><g data-phase-min=\"0\"><ellipse class=\"b-shadow\" cx=\"200\" cy=\"215\" rx=\"158\" ry=\"14\"/> <path class=\"b-chalk\" d=\"M132 204h136\"/> <rect class=\"b-brick\" x=\"66\" y=\"180\" width=\"72\" height=\"12\" rx=\"2\"/> <rect class=\"b-brick\" x=\"74\" y=\"166\" width=\"56\" height=\"12\" rx=\"2\"/> <rect class=\"b-tim-d\" x=\"126\" y=\"192\" width=\"148\" height=\"12\" rx=\"4\"/> </g> <g data-phase-min=\"1\"> <path class=\"b-former\" d=\"M140 192a60 60 0 01120 0\"/> <path class=\"b-beam-d\" d=\"M200 192v-60M170 192l14-52M230 192l-14-52\"/></g> <g data-phase-min=\"2\"> <path class=\"b-dome\" d=\"M132 192a68 68 0 01136 0z\"/> <path class=\"b-line\" d=\"M148 160h104M162 138h76M180 122h40\"/> <rect class=\"b-tim\" x=\"286\" y=\"150\" width=\"64\" height=\"9\" rx=\"4\"/></g> <g data-phase-min=\"3\"> <rect class=\"b-brick\" x=\"238\" y=\"88\" width=\"30\" height=\"52\" rx=\"3\"/> <path class=\"b-fire\" d=\"M200 190q-18-14-12-32 8 10 14 3 5 13 13 5 7 18-15 24z\"/> <path class=\"b-steam\" d=\"M254 76q10-14 0-26M270 78q10-14 0-26\"/> <circle class=\"b-glow b-lamp\" cx=\"322\" cy=\"120\" r=\"9\"/></g></svg>",
        "quarry": "<svg class=\"build-art-svg\" viewBox=\"40 40 320 186\" preserveAspectRatio=\"xMidYMax meet\" aria-hidden=\"true\"><g data-phase-min=\"0\"><ellipse class=\"b-shadow\" cx=\"200\" cy=\"215\" rx=\"158\" ry=\"14\"/> <path class=\"b-face\" d=\"M60 204V70h116l-14 134z\"/> <path class=\"b-chalk\" d=\"M72 104h92M72 142h84M72 178h76\"/> <path class=\"b-rubble\" d=\"M186 204l24-24 24 24z\"/> </g> <g data-phase-min=\"1\"> <path class=\"b-beam\" d=\"M300 202V56M300 60L212 92\"/> <path class=\"b-rope\" d=\"M300 84l-64 26M300 202l-48-30\"/></g> <g data-phase-min=\"2\"> <g class=\"b-hoist\"><path class=\"b-rope\" d=\"M214 94v34\"/><rect class=\"b-stone\" x=\"196\" y=\"128\" width=\"38\" height=\"26\" rx=\"3\"/></g> <rect class=\"b-tim-d\" x=\"180\" y=\"192\" width=\"96\" height=\"10\" rx=\"4\"/> <circle class=\"b-tim\" cx=\"196\" cy=\"204\" r=\"7\"/><circle class=\"b-tim\" cx=\"260\" cy=\"204\" r=\"7\"/></g> <g data-phase-min=\"3\"> <rect class=\"b-stone\" x=\"188\" y=\"168\" width=\"40\" height=\"20\" rx=\"3\"/> <rect class=\"b-stone-d\" x=\"232\" y=\"168\" width=\"40\" height=\"20\" rx=\"3\"/> <rect class=\"b-stone\" x=\"208\" y=\"146\" width=\"40\" height=\"20\" rx=\"3\"/> <circle class=\"b-glow b-lamp\" cx=\"330\" cy=\"104\" r=\"9\"/></g></svg>"
    };

    // Keep resources. Chronicles items join them below; a few Chronicles ids are the same
    // goods as a Keep resource, so they share one stock instead of two lookalikes.
    const RES = {
        timber: { name: 'Timber', kind: 'MATERIAL', icon: '<circle cx="8" cy="12" r="5" fill="#c08a55" stroke="#5b3c25" stroke-width="1.5"/><circle cx="16" cy="12" r="5" fill="#d9a46a" stroke="#5b3c25" stroke-width="1.5"/><circle cx="16" cy="12" r="1.6" fill="#7c5330"/>' },
        stone: { name: 'Stone', kind: 'MATERIAL', icon: '<path d="M4 17l3-8 6-3 7 4-1 8-8 2z" fill="#98a2a6" stroke="#5a6266" stroke-width="1.4"/>' },
        ore: { name: 'Copper Ore', kind: 'MATERIAL', icon: '<path d="M4 16l4-9 8-1 4 8-6 5z" fill="#5b5f66" stroke="#33363b" stroke-width="1.4"/><circle cx="10" cy="12" r="1.8" fill="#e08a4a"/><circle cx="14.5" cy="10" r="1.3" fill="#e08a4a"/>' },
        fiber: { name: 'Flax', kind: 'MATERIAL', icon: '<path d="M6 20c2-6 1-10-1-14M12 20c0-6 1-11 3-15M18 20c-1-5-3-8-6-10" fill="none" stroke="#7fb35c" stroke-width="2" stroke-linecap="round"/>' },
        produce: { name: 'Garden Produce', kind: 'MATERIAL', icon: '<circle cx="12" cy="14" r="6" fill="#e0624a"/><path d="M12 8c0-2 1-4 3-4" stroke="#4e7a44" stroke-width="2" fill="none"/>' },
        provisions: { name: 'Provisions', kind: 'FOOD', icon: '<path d="M6 9h12l-1 11H7z" fill="#b58a55" stroke="#6d4b2c" stroke-width="1.4"/><path d="M8 9c0-3 2-5 4-5s4 2 4 5" fill="none" stroke="#6d4b2c" stroke-width="1.6"/>' },
        ember: { name: 'Ember Ingot', kind: 'MATERIAL', icon: '<path d="M3 16l3-6h12l3 6z" fill="#ff8a4e" stroke="#9c3f1c" stroke-width="1.4"/>' },
        frost: { name: 'Frost Crystal', kind: 'MATERIAL', icon: '<path d="M12 3l5 9-5 9-5-9z" fill="#a9e8f2" stroke="#4f9fb0" stroke-width="1.4"/>' },
        storm: { name: 'Storm Cell', kind: 'MATERIAL', icon: '<path d="M13 3L6 13h5l-2 8 8-11h-5z" fill="#ffe63c" stroke="#9c8a10" stroke-width="1.2"/>' },
        glass: { name: 'Tempered Glass', kind: 'MATERIAL', icon: '<rect x="5" y="4" width="14" height="16" rx="2" fill="rgba(169,232,242,.55)" stroke="#bfefff" stroke-width="1.5"/><path d="M8 9l4-3M8 14l7-6" stroke="#fff" stroke-width="1.4"/>' },
        alloy: { name: 'Charged Alloy', kind: 'MATERIAL', icon: '<path d="M3 16l3-6h12l3 6z" fill="#9c8cff" stroke="#4d3f9c" stroke-width="1.4"/><path d="M12 9l-2 4h3l-2 4" stroke="#ffe63c" stroke-width="1.4" fill="none"/>' },
        rations: { name: 'Hearth Rations', kind: 'FOOD', icon: '<path d="M4 11h16a8 8 0 01-16 0z" fill="#c9824a" stroke="#6d4b2c" stroke-width="1.4"/><path d="M9 8c0-2 2-2 2-4M14 8c0-2 2-2 2-4" stroke="#e6e6e6" stroke-width="1.4" fill="none"/>' },
        relic: { name: 'Relic Shard', kind: 'MATERIAL', icon: '<path d="M12 3l6 7-6 11-6-11z" fill="#b99cff" stroke="#5d4a9c" stroke-width="1.4"/>' },
        insight: { name: 'Insight', kind: 'MATERIAL', icon: '<path d="M12 3l2.4 6.2L21 10l-5 4.3L17.5 21 12 17.6 6.5 21 8 14.3 3 10l6.6-.8z" fill="#d9ccff" stroke="#7e6bc4" stroke-width="1.2"/>' },
        crowns: { name: 'Crowns', kind: 'CURRENCY', blurb: 'Chronicles’ own currency: earned on the road, spent at the guild market.', icon: '<circle cx="12" cy="12" r="8" fill="#f4cc62" stroke="#9c7a20" stroke-width="1.5"/><path d="M8 14l1-5 3 3 3-3 1 5z" fill="#9c7a20"/>' },
        silver: { name: 'Silver', kind: 'CURRENCY', blurb: 'The Keep’s wallet: earned from repairs and stewardship, spent at the Keep market.', icon: '<circle cx="12" cy="12" r="8" fill="#cfd6dc" stroke="#7a848c" stroke-width="1.5"/><path d="M9 12h6M12 9v6" stroke="#7a848c" stroke-width="1.6"/>' },
        // Dominion-only: closes a Chronicles gap (Smithing unlocks at 1 but its first recipe
        // needs 2) and gives forged goods a use in Keep construction.
        fittings: { name: 'Copper Fittings', kind: 'MATERIAL', blurb: 'Nails, hinges and brackets for Keep construction.', icon: '<path d="M7 4h4v16H7zM13 8h5v3h-5zM13 14h5v3h-5z" fill="#d08a55" stroke="#7a4a26" stroke-width="1.2"/>' },
        woodaxe: { name: 'Woodaxe', kind: 'TOOL', tool: 'woodcutting', blurb: 'Woodcutting +60%. Fallen ironwood on the road becomes Timber.' },
        pickaxe: { name: 'Pickaxe', kind: 'TOOL', tool: 'mining', blurb: 'Mining and Excavation +60%. Copper seams on the road become Ore.' },
        // Dominion gear starts as a carved Wooden Sword. Every other weapon or garment the Knight
        // wears is made at the workbench (ids kept from the old Hall rack so saves still load).
        wooden_sword: { name: 'Wooden Sword', kind: 'WEAPON', weaponType: 'sword', tier: 0, blurb: 'A whittled pine practice blade. Every Knight starts here.' },
        practice_spear: { name: 'Wooden Spear', kind: 'WEAPON', weaponType: 'spear', tier: 0, blurb: 'A fire-hardened pine spear, carved at the Keep.' },
        practice_bow: { name: 'Pine Shortbow', kind: 'WEAPON', weaponType: 'bow', tier: 0, blurb: 'A plank bow strung with flax.' },
        practice_staff: { name: 'Ash Staff', kind: 'WEAPON', weaponType: 'staff', tier: 0, blurb: 'A carved staff with a sunleaf wrap for channelling.' },
        practice_hammer: { name: 'Wooden Mallet', kind: 'WEAPON', weaponType: 'hammer', tier: 0, blurb: 'A mallet with a stone-weighted head.' },
        practice_daggers: { name: 'Wooden Daggers', kind: 'WEAPON', weaponType: 'daggers', tier: 0, blurb: 'Paired carved knives.' }
    };
    const CH = window.DOMINION_CHRONICLES || { skills: {}, activities: {}, recipes: {}, items: {}, weapons: {}, gearBonuses: {}, hazardWards: {}, routes: {}, buildings: {}, bondMilestones: [], affinityMilestones: [] };
    const ALIAS = { pine_log: 'timber', copper_ore: 'ore', frost_crystal: 'frost', relic_shard: 'relic', flax: 'fiber' };
    const al = (id) => ALIAS[id] || id;
    const alMap = (m) => { const o = {}; Object.keys(m || {}).forEach((k) => { o[al(k)] = (o[al(k)] || 0) + m[k]; }); return o; };
    Object.keys(CH.items).forEach((id) => {
        const it = CH.items[id], k = al(id);
        if (RES[k]) { if (!RES[k].blurb) RES[k].blurb = it.blurb; return; }
        RES[k] = { name: it.name, kind: it.kind, tier: it.tier, blurb: it.blurb, weaponType: it.weaponType, armor: it.armor,
            heatWard: it.heatWard, relicEffect: it.relicEffect, bondXp: it.bondXp, healPct: it.healPct, lureElement: it.lureElement, prefers: it.prefers };
    });
    const STRIP = ['timber', 'stone', 'glass', 'provisions'];
    const KIND_ORDER = ['CURRENCY', 'MATERIAL', 'ESSENCE', 'FOOD', 'POTION', 'LURE', 'RUNE', 'WEAPON', 'ARMOR', 'HELMET', 'BOOTS', 'ACCESSORY', 'RELIC', 'TOOL'];
    const KIND_LABEL = { CURRENCY: 'Currencies', MATERIAL: 'Materials', ESSENCE: 'Essences', FOOD: 'Food', POTION: 'Potions', LURE: 'Lures', RUNE: 'Runes', WEAPON: 'Weapons', ARMOR: 'Armor', HELMET: 'Helmets', BOOTS: 'Boots', ACCESSORY: 'Accessories', RELIC: 'Relics', TOOL: 'Tools' };
    const SLOTS = [['weapon', 'WEAPON', 'Weapon'], ['armor', 'ARMOR', 'Armor'], ['helmet', 'HELMET', 'Helmet'], ['boots', 'BOOTS', 'Boots'], ['accessory', 'ACCESSORY', 'Accessory'], ['relic', 'RELIC', 'Relic']];

    // Workshop blurbs are the Keep's own facility descriptions.
    const WS = {
        forge: { name: 'Forge', el: 'fire', makes: { ember: 1 }, blurb: 'A consent-bound hearth shapes Ember Ingots without forcing a resident to remain at the bellows.' },
        fridge: { name: 'Fridge', el: 'ice', makes: { frost: 1 }, blurb: 'Frost-lined vaults form Frost Crystals without draining the surrounding water.' },
        generator: { name: 'Generator', el: 'electric', makes: { storm: 0.6 }, blurb: 'Balanced elemental currents condense into Storm Cells.' },
        garden: { name: 'Garden', el: 'earth', makes: { fiber: 4, produce: 2, sunleaf: 6 }, blurb: 'Living beds grow Flax, Sunleaf and produce while you are away.' },
        kitchen: { name: 'Kitchen', el: 'water', makes: { provisions: 1 }, blurb: 'A warm hearth packs Provisions for the road.' },
        quarry: { name: 'Quarry', el: 'metal', makes: { stone: 6 }, blurb: 'Cut faces yield stone along its willing grain.' }
    };
    const RECIPES = {
        glass: { name: 'Tempered Glass', pair: ['forge', 'fridge'], input: { ember: 2, frost: 2 }, output: { glass: 1 }, mins: 45 },
        alloy: { name: 'Charged Alloy', pair: ['forge', 'generator'], input: { ember: 1, storm: 1, ore: 1 }, output: { alloy: 1 }, mins: 60 },
        rations: { name: 'Hearth Rations', pair: ['garden', 'kitchen'], input: { produce: 2, provisions: 1 }, output: { rations: 1 }, mins: 30 },
        // Extra partners so a workshop with more notches has more than one link worth making.
        mortar: { name: 'Living Mortar', pair: ['quarry', 'garden'], input: { stone: 4, fiber: 3 }, output: { living_mortar: 1 }, mins: 90 },
        preserves: { name: 'Cold Preserves', pair: ['fridge', 'kitchen'], input: { produce: 2, frost: 1 }, output: { provisions: 3 }, mins: 40 },
        smelt: { name: 'Charged Ore', pair: ['generator', 'quarry'], input: { stone: 4, storm: 1 }, output: { ore: 2 }, mins: 50 }
    };
    // A workshop's level sets its notches: 1 facing its rotation, then the opposite side,
    // then both flanks. Two facing notches on neighbouring plots make a link, like the TCG.
    const MAX_WS_LEVEL = 4;
    const notchCount = (s, id) => Math.max(1, Math.min(MAX_WS_LEVEL, (s && s.wsl && s.wsl[id]) || 1));
    function notchDirs(rot, n) {
        if (n >= 4) return [0, 1, 2, 3];
        if (n === 3) return [rot, (rot + 1) % 4, (rot + 3) % 4];
        if (n === 2) return [rot, (rot + 2) % 4];
        return [rot];
    }
    const RESERVABLE = ['ember', 'frost', 'storm', 'ore', 'produce', 'provisions'];

    // Costs follow the Keep's own scale (Woodlot 1 Timber/min, Archive 60 Timber).
    const BUILDINGS = {
        hall: {
            name: 'Great Hall', blurb: 'The heart of the Keep. The Knight musters here between journeys.',
            levels: [null, { label: 'Covenant Hall' }, { label: 'Banner Hall', cost: { timber: 240, stone: 40, alloy: 2, fittings: 10 }, hours: 6,
                unlock: 'Expeditions need 1 fewer provision and weapon proficiency grows 25% faster.' }]
        },
        woodlot: {
            name: 'Woodlot', blurb: 'Restorative forestry: every tree taken is replanted by the residents.',
            levels: [null, { label: 'Level 1', rate: 60 }, { label: 'Level 2', rate: 120, cost: { timber: 140, stone: 20 }, hours: 2,
                unlock: 'A second log store: 120 Timber/h instead of 60.' }]
        },
        archive: {
            name: 'Archive', blurb: 'Records of the first Covenant lie buried beneath the stones.',
            levels: [{ label: 'Ruined' }, { label: 'Restored', cost: { timber: 60, glass: 3 }, hours: 8,
                unlock: 'Opens Elemental Studies and Runecrafting for the Knight.' }]
        }
    };
    // The Keep is raised piece by piece: [timber, materials, seconds]. A new Keep owns exactly
    // WOODLOT_COST Timber, so the Woodlot is the only thing it can afford on day one.
    const WOODLOT_COST = 30;
    const WS_BUILD = { garden: [40, {}, 1800], kitchen: [60, {}, 2700], quarry: [80, {}, 3600],
        forge: [100, { stone: 12 }, 7200], fridge: [100, { stone: 12 }, 7200], generator: [140, { stone: 20, ore: 6 }, 10800] };
    const wsBuilt = (s, id) => ((s.wsl && s.wsl[id]) || 0) >= 1;
    // Centre plots first so the first few workshops land next to each other, ready to link.
    const PLOT_ORDER = [4, 3, 5, 1, 7, 0, 2, 6, 8];
    function placeWorkshop(s, id) {
        if (s.grid.some((c) => c && c.id === id)) return;
        const free = PLOT_ORDER.find((i) => !s.grid[i]);
        if (free != null) s.grid[free] = { id: id, rot: 0 };
    }
    const HELP_TARGETS = ['woodlot', 'forge', 'fridge', 'generator', 'garden', 'kitchen', 'quarry'];

    // Chronicles' progression curves (ChroniclesContent.xpForLevel / bondForLevel).
    const MAX_LEVEL = 100;
    const xpForLevel = (l) => { const n = Math.max(0, l - 1); return 40 * n * n + 60 * n; };
    const bondForLevel = (l) => 8 * l * l;
    // One Chronicles action-second is ten Dominion seconds, so a Copper Vein swing (8s there)
    // takes 80s here: Chronicles' relative balance on the Keep's hourly clock.
    const ACTION_SCALE = 10;
    const STUDY_AFFINITY_XP = 8;
    const ELEMENTS = ['FIRE', 'ICE', 'WIND', 'EARTH', 'WATER', 'ELECTRIC', 'METAL', 'POISON', 'PSYCHIC', 'UNDEAD', 'LIGHT', 'SHADOW'];
    const CLASSES = ['Guardian', 'Bruiser', 'Assassin', 'Mage', 'Support'];

    // Professions come from Chronicles; the Keep decides where each is practised.
    const SKILLS = CH.skills;
    const SKILL_GROUPS = [['Gathering', 'Gather'], ['Production', 'Craft'], ['Knowledge', 'Study'], ['Siegeling', 'Siegeling'], ['Expedition', 'Road']];
    const SKILL_PLACE = { mining: 'Quarry', woodcutting: 'Woodlot', foraging: 'Garden', fishing: 'River', excavation: 'Quarry', smelting: 'Forge', smithing: 'Forge',
        carpentry: 'Woodlot sawpit', weaving: 'Garden loom', cooking: 'Kitchen', alchemy: 'Garden', runecrafting: 'Archive', elemental_studies: 'Archive' };
    const ARCHIVE_SKILLS = ['elemental_studies', 'runecrafting'];
    const TRAINED_BY = {
        taming: 'Taming wild Siegelings you spot on expeditions (taming arrives in the next stage).',
        bonding: 'Every bond point your companions earn. Each level adds 1% to bond gains.',
        husbandry: 'Feeding treats. Each level adds 0.3% to rest bond (max 20%).',
        pathfinding: 'Every minute on the road. Each level shortens journeys by 0.4% (max 30%).',
        survival: 'Facing hazards. Each level cuts hazard losses by 1% (max 60%).',
        cartography: 'Every encounter explored. Each level adds 0.3% to the haul.',
        command: 'Leading companions. Party slots: 1, then 2 at Command 3, 3 at Command 10.',
        class_tactics: 'Encounters your party handles. Opens cross-class techniques later.'
    };
    // Dominion milestones layered on top of the Chronicles unlocks each profession already has.
    const MILESTONES = {
        woodcutting: [[10, 'Ironwood Eye: fallen ironwood on expeditions yields double'], [20, 'Woodwright: the Woodlot produces +20 Timber/h']],
        mining: [[10, 'Seam Reader: copper seams on expeditions yield double'], [20, 'Ember Vein: every 4th swing also turns up an Ember Ingot']],
        elemental_studies: [[3, 'Socket Glyphs: connected workshops refine 25% faster'], [8, 'Ward Script: elemental hazards no longer cost supplies'], [10, 'Vault Cipher: reads the Sealed Vault Map']]
    };
    // Extra Knight work that only exists at the Keep.
    const ACTIVITIES = Object.assign({}, CH.activities, {
        read_records: { id: 'read_records', skillId: 'elemental_studies', name: 'Covenant Records', place: 'Archive', level: 1, actionSeconds: 12, xp: 6, output: 'insight', bonusOutput: null, bonusEvery: 0, helperElements: ['PSYCHIC', 'LIGHT'], dominion: true }
    });
    const CRAFTS = Object.assign({}, CH.recipes, {
        forge_fittings: { id: 'forge_fittings', skillId: 'smithing', output: 'fittings', outputQty: 2, level: 1, extraReqs: [], inputs: { copper_bar: 1 }, actionSeconds: 12, xp: 12, repeatable: true, helperElements: ['FIRE', 'METAL'], studyElement: null, dominion: true },
        // Wooden gear so a Knight who only owns the starter sword can still arm every approach.
        carve_wooden_sword: { id: 'carve_wooden_sword', skillId: 'carpentry', output: 'wooden_sword', outputQty: 1, level: 1, extraReqs: [], inputs: { pine_plank: 2 }, actionSeconds: 0, xp: 16, repeatable: false, helperElements: [], studyElement: null, dominion: true },
        carve_practice_spear: { id: 'carve_practice_spear', skillId: 'carpentry', output: 'practice_spear', outputQty: 1, level: 1, extraReqs: [], inputs: { pine_plank: 3 }, actionSeconds: 0, xp: 20, repeatable: false, helperElements: [], studyElement: null, dominion: true },
        carve_practice_daggers: { id: 'carve_practice_daggers', skillId: 'carpentry', output: 'practice_daggers', outputQty: 1, level: 2, extraReqs: [], inputs: { pine_plank: 2, fiber: 2 }, actionSeconds: 0, xp: 20, repeatable: false, helperElements: [], studyElement: null, dominion: true },
        carve_practice_bow: { id: 'carve_practice_bow', skillId: 'carpentry', output: 'practice_bow', outputQty: 1, level: 2, extraReqs: [], inputs: { pine_plank: 3, fiber: 3 }, actionSeconds: 0, xp: 20, repeatable: false, helperElements: [], studyElement: null, dominion: true },
        carve_practice_staff: { id: 'carve_practice_staff', skillId: 'carpentry', output: 'practice_staff', outputQty: 1, level: 3, extraReqs: [], inputs: { pine_plank: 3, sunleaf: 2 }, actionSeconds: 0, xp: 24, repeatable: false, helperElements: [], studyElement: null, dominion: true },
        carve_practice_hammer: { id: 'carve_practice_hammer', skillId: 'carpentry', output: 'practice_hammer', outputQty: 1, level: 3, extraReqs: [], inputs: { pine_plank: 2, stone: 6 }, actionSeconds: 0, xp: 24, repeatable: false, helperElements: [], studyElement: null, dominion: true },
        sew_travelers_coat: { id: 'sew_travelers_coat', skillId: 'weaving', output: 'travelers_coat', outputQty: 1, level: 1, extraReqs: [], inputs: { linen: 3 }, actionSeconds: 0, xp: 20, repeatable: false, helperElements: [], studyElement: null, dominion: true }
    });

    const WEAPONS = {
        sword: { name: 'Sword', approach: 'Protects supplies', detail: 'Raiders at the pack are driven off, so no loot is lost.', glyph: '<path d="M6 18L17 7l1-3-3 1L4 16M5 15l4 4M3 21l3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
        spear: { name: 'Spear', approach: 'Protects companions', detail: 'Ambushes are held at reach, and companions gain 50% more bond.', glyph: '<path d="M4 20L18 6M15 3l6 0 0 6-3-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' },
        bow: { name: 'Bow', approach: 'Scouting and hunting', detail: 'Game trails yield produce and fiber, and scouting turns up rare tracks.', glyph: '<path d="M6 3c8 3 11 9 9 18M6 3v18M6 12h12M15 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
        staff: { name: 'Staff', approach: 'Handles elemental hazards', detail: 'Ember vents and frost mist are calmed and harvested.', glyph: '<path d="M8 21L16 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>' },
        hammer: { name: 'Hammer', approach: 'Clears obstacles and ruins', detail: 'Collapsed galleries and sealed doors are broken open.', glyph: '<path d="M5 20l8-8M10 5l7 7 3-3-7-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' },
        daggers: { name: 'Daggers', approach: 'Ambush and evasion', detail: 'Strikes first: raiders and ambushes are partly handled.', glyph: '<path d="M5 19L14 10M10 5l9 9M14 6l4-2-2 4M6 14l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' }
    };
    const TOOL_GLYPH = {
        woodaxe: '<path d="M6 21L15 6M12 4c4-1 7 1 8 4l-5 2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
        pickaxe: '<path d="M7 21l8-12M4 8c5-4 11-4 16 1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
    };
    // Hand-written flavour for the starters; every other species takes its element's trait.
    const STARTER_TRAITS = {
        cacty: { name: 'Cacty', el: 'earth', cls: 'Bruiser', role: 'Earth Bruiser', trait: 'Grovefinder',
            traitText: 'Finds hidden groves on wild trails, bringing extra Timber and Flax.', likes: ['woodlot', 'garden'] },
        sundile: { name: 'Sundile', el: 'fire', cls: 'Guardian', role: 'Fire Guardian', trait: 'Ember Ward',
            traitText: 'Stands over the supplies when raiders come and walks through ember vents unharmed.', likes: ['forge', 'kitchen'] },
        fawny: { name: 'Fawny', el: 'ice', cls: 'Mage', role: 'Ice Mage', trait: 'Frost Sight',
            traitText: 'Calms frost mist and notices hidden doors.', likes: ['fridge'],
            findText: 'Scout the Rootwild Trail with a Bow to find Fawny’s tracks.' }
    };
    const EXPLORE_HOURS = 3;
    const EXPLORE_CACHE = { earth: { timber: 20, fiber: 6 }, fire: { stone: 8, ember: 1 }, ice: { stone: 6, frost: 1 } };
    const DAILY_TREATS = 5;

    // —— Roster: any Siegeling from the creature registry, tamed on the road ——
    const SPECIES = {};
    (CH.creatures || []).forEach((c) => { SPECIES[c.id] = c; });
    const EL_LIKES = { EARTH: ['woodlot', 'garden'], FIRE: ['forge', 'kitchen'], ICE: ['fridge'], ELECTRIC: ['generator'], METAL: ['quarry'], WATER: ['kitchen'], WIND: ['garden'], POISON: ['garden'], PSYCHIC: [], LIGHT: [], SHADOW: [], UNDEAD: [] };
    // One road trait per element, so every tamed Siegeling changes some encounter.
    const EL_TRAIT = {
        EARTH: ['Grovefinder', 'Finds hidden groves on wild trails, bringing extra Timber and Flax.'],
        FIRE: ['Ember Ward', 'Stands over the supplies when raiders come and walks through ember vents unharmed.'],
        ICE: ['Frost Sight', 'Calms frost mist and notices hidden doors.'],
        ELECTRIC: ['Stormcaller', 'Leads the party safely through lightning storms.'],
        WATER: ['Tidecaller', 'Finds safe footing when the tide floods the road.'],
        METAL: ['Forgeborn', 'Shrugs off the heat and grit of the forge wastes.'],
        WIND: ['Windscout', 'Ranges ahead on game trails, so even without a bow the hunt yields something.'],
        LIGHT: ['Dawnbearer', 'Exposes ambushes and settles the restless dead.'],
        SHADOW: ['Nightstalker', 'Turns ambushes back on the ambushers.'],
        PSYCHIC: ['Seer', 'Sees through mirages and senses hidden doors.'],
        POISON: ['Blightward', 'Breathes easy where the blight spreads.'],
        UNDEAD: ['Gravewalker', 'Walks among the restless dead untroubled.']
    };
    const RARITY_TAME = { COMMON: 0.55, UNCOMMON: 0.42, RARE: 0.3, EPIC: 0.18, LEGENDARY: 0.08 };
    const companionXpFor = (l) => { const n = Math.max(0, l - 1); return 24 * n * n + 36 * n; };
    // Chronicles' level caps: base forms 10, first evolutions 25, finals and single-stage 50.
    const levelCap = (sp) => (!sp || !sp.to ? 50 : sp.stage <= 1 ? 10 : 25);
    function speciesOf(uid) {
        const c = S && S.comps[uid];
        return SPECIES[(c && c.species) || uid] || { id: uid, name: titleCase(uid), element: 'EARTH', cls: 'Bruiser', rarity: 'COMMON', stage: 1, to: null };
    }
    function C(uid) {
        const c = (S && S.comps[uid]) || {}, sp = speciesOf(uid), el = sp.element || 'EARTH';
        const starter = STARTER_TRAITS[sp.id] || STARTER_TRAITS[uid] || {};
        const t = EL_TRAIT[el] || EL_TRAIT.EARTH;
        return {
            name: c.nick || sp.name, species: sp.name, speciesId: sp.id, el: el.toLowerCase(), EL: el, cls: sp.cls, role: titleCase(el) + ' ' + sp.cls,
            rarity: sp.rarity, stage: sp.stage, to: sp.to, cap: levelCap(sp), trait: starter.trait || t[0], traitText: starter.traitText || t[1],
            likes: starter.likes || EL_LIKES[el] || [], findText: starter.findText || ''
        };
    }
    const compLevel = (c) => { const sp = SPECIES[c.species] || {}; let l = 1; const cap = levelCap(sp); while (l < cap && (c.xp || 0) >= companionXpFor(l + 1)) l++; return l; };
    const rosterCap = (s) => (CH.realm ? CH.realm.rosterCap : 12) + 3 * ((s.wings && s.wings.sanctuary) || 0);
    const joinedIds = (s) => Object.keys(s.comps).filter((id) => s.comps[id].joined);
    function addCompanion(s, species, extra) {
        if (joinedIds(s).length >= rosterCap(s)) return '';
        let uid = species;
        if (s.comps[uid] && s.comps[uid].joined) { let n = 2; while (s.comps[species + '-' + n]) n++; uid = species + '-' + n; }
        s.comps[uid] = Object.assign({ species: species, nick: '', joined: true, bond: 20, job: { kind: 'rest' }, explore: 0, treats: { day: '', n: 0 }, xp: 0, legend: false }, extra || {});
        return uid;
    }
    // Live card art for any species; the three starters keep their hand-aimed local crops.
    let ART_URLS = {};
    const STORAGE_ART_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/siegelingstcgtesting.firebasestorage.app/o/';
    function catalogArt(speciesId, width) {
        const u = ART_URLS[speciesId];
        if (!u) return '';
        const token = (u.match(/[?&]token=([0-9A-Za-z-]{8,64})(?:&|$)/) || [])[1];
        if (u.indexOf(STORAGE_ART_PREFIX) === 0 && token) return STORAGE_ART_PREFIX + encodeURIComponent('art-thumbs/' + token + '/w' + (width || 240) + '.webp') + '?alt=media&token=' + token;
        return u;
    }
    window.dmArtFallback = function (img) {
        const raw = img.getAttribute('data-raw');
        if (raw && img.src !== raw) { img.src = raw; img.removeAttribute('data-raw'); return; }
        img.onerror = null;
        img.style.display = 'none';
    };
    // Siegelings are drawn as the Keep draws residents: the card's overlay cutout on a
    // die-cut paper rim (#paper-siegling-cutout in dominion.html), never a cropped landscape.
    function speciesArt(speciesId, alt, element) {
        const thumb = catalogArt(speciesId, 240);
        if (thumb) return '<img class="dm-paper" src="' + esc(thumb) + '" data-raw="' + esc(ART_URLS[speciesId] || '') + '" alt="' + esc(alt || '') + '" loading="lazy" onerror="dmArtFallback(this)">';
        const sp = SPECIES[speciesId] || {};
        return '<span class="dm-paper-token" style="--el:' + (EL_HEX[element || sp.element] || '#c9b98a') + '">' + esc(((sp.name || speciesId || '?')[0] || '?').toUpperCase()) + '</span>';
    }
    function compArt(uid, alt) { const sp = speciesOf(uid); return speciesArt(sp.id, alt, sp.element); }
    // Deterministic per-journey luck: the same expedition always rolls the same way, so a
    // reload or a second device can never re-roll a sighting.
    function rng(seedText) {
        let h = 1779033703 ^ seedText.length;
        for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
        let a = h >>> 0;
        return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }

    const DEST = {
        rootwild: { name: 'Rootwild Trail', hours: 4, provisions: 2, element: 'EARTH', blurb: 'The old forest road west of the Keep. Gathering and exploration.',
            loot: { timber: 40, fiber: 10, produce: 4, sunleaf: 6 }, xp: 120, prof: 40, bond: 30,
            encounters: ['pack', 'trail', 'ironwood', 'ambush', 'grove'] },
        ruins: { name: 'Covenant Ruins', hours: 8, provisions: 4, element: 'METAL', blurb: 'Collapsed halls of the first Covenant. Ruins and materials.',
            loot: { stone: 30, ore: 20, timber: 20, relic: 1, fossil: 3, rune_stone: 1 }, xp: 240, prof: 80, bond: 40,
            encounters: ['rubble', 'hazard', 'seam', 'pack', 'sealed', 'ambush'] },
        vault: { name: 'Sunken Vault', planned: true, blurb: 'Needs the Sealed Vault Map and Elemental Studies 10.' },
        trial: { name: 'Legendary Bond Trial', special: true, hours: 8, provisions: 0, element: 'LIGHT', encounters: [], loot: {}, blurb: 'A solo journey with one Bond 100 companion.' },
        operation: { name: 'Siege Operation', special: true, hours: 8, provisions: 2, element: 'FIRE', encounters: [], loot: {}, blurb: 'Your guild\u2019s weekly threat.' }
    };

    // —— Chronicles routes as Dominion destinations ——
    // Route minutes become hours at 8x (clamped 2–24h) so a 15-minute Chronicles patrol is a
    // two-hour outing on the Keep's clock. Encounters come from the route's type, hazard,
    // twists and boss instead of turn-based combat.
    const HAZARD_ENC = { heat: 'hazard_heat', storm: 'hazard_storm', tide: 'hazard_tide', forge: 'hazard_forge', maze: 'maze' };
    function routeEncounters(r) {
        const out = [];
        const add = (e) => out.push(e);
        if (r.type === 'PATROL') { add('pack'); add('trail'); add('ambush'); if (r.element === 'EARTH') add('grove'); }
        else if (r.type === 'HUNT') { add('trail'); add('ambush'); add('pack'); add('elite'); }
        else if (r.type === 'RESOURCE') { add('seam'); add('ironwood'); add('rubble'); add('pack'); }
        else if (r.type === 'DUNGEON') { add('rubble'); add('sealed'); add('elite'); }
        else if (r.type === 'GRAND') { add('pack'); add('trail'); add('ambush'); add('rubble'); add('elite'); add('elite'); }
        if (r.hazard && HAZARD_ENC[r.hazard]) add(HAZARD_ENC[r.hazard]);
        (r.twists || []).forEach((t) => add('twist:' + t));
        if (r.bossId) add('boss');
        return out;
    }
    Object.keys(CH.routes || {}).forEach((id) => {
        const r = CH.routes[id];
        const hours = Math.max(2, Math.min(24, Math.round(r.minutes / 7.5)));
        const loot = {};
        (r.loot || []).forEach((l) => { loot[al(l.item)] = (loot[al(l.item)] || 0) + Math.max(1, Math.round((l.min + l.max) / 2 * l.chance * r.encounters / 3)); });
        DEST[id] = {
            name: r.name, hours: hours, provisions: Math.max(1, Math.ceil(hours / 3)), element: r.element, blurb: r.blurb, region: r.region, type: r.type, tier: r.tier,
            loot: loot, lootTable: r.loot || [], xp: 20 * r.encounters, prof: 10 * r.encounters, bond: 20 + 3 * r.encounters, encounters: routeEncounters(r),
            rankReq: r.rankReq, reqs: r.requirements || [], hidden: r.hidden, levelMin: r.levelMin, levelMax: r.levelMax, bossId: r.bossId, bossLevel: r.bossLevel,
            sighting: r.sightingChance, hazardKind: r.hazard, twists: r.twists || [], chronicles: true,
            scene: (r.bossId ? '-boss' : r.type === 'HUNT' ? '-elite' : '-journey')
        };
    });
    DEST.rootwild.tier = 0; DEST.ruins.tier = 0; DEST.vault.tier = 0;
    DEST.rootwild.sighting = 0.15; DEST.ruins.sighting = 0.1;
    function destBlock(s, id) {
        const d = DEST[id];
        if (!d) return 'Unknown destination.';
        if (d.planned) return d.blurb;
        if (d.rankReq && rankLvl(s) < d.rankReq) return 'Needs Knight Rank ' + d.rankReq + '.';
        const miss = (d.reqs || []).filter((r) => !meets(s, r));
        if (miss.length) return 'Needs ' + miss.map(reqText).join(', ') + '.';
        return '';
    }
    // Hidden Chronicles routes only appear once their requirements are met.
    const destVisible = (s, id) => !DEST[id].hidden || !destBlock(s, id);
    const SCENE_DIR = '/img/chronicles/scenes/';
    function sceneUrl(id) {
        const d = DEST[id];
        const key = d && d.chronicles ? d.element.toLowerCase() + d.scene : null;
        if (key) return (window.DOMINION_SCENES && window.DOMINION_SCENES[key]) || SCENE_DIR + key + '.webp';
        return (ART[id] || ART.rootwild).src;
    }
    function partyPower(s, x) {
        let p = x.tier * 5 + x.profLvl + Math.floor(x.armor / 2) + (x.rune ? 5 : 0);
        x.party.forEach((id) => { const c = s.comps[id]; if (c) p += compLevel(c) + (c.legend ? 5 : 0); });
        return p;
    }

    // —— Helpers ——
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const fl = (v) => Math.floor((v || 0) + 1e-9);
    const levelFor = (xp) => { let l = 1; while (l < MAX_LEVEL && (xp || 0) + 1e-9 >= xpForLevel(l + 1)) l++; return l; };
    const bondLevelFor = (p) => { let l = 0; while (l < 100 && (p || 0) + 1e-9 >= bondForLevel(l + 1)) l++; return l; };
    const skillLvl = (s, id) => levelFor(s.knight.skills[id] || 0);
    const profLvl = (s, id) => levelFor(s.knight.prof[id] || 0);
    const affLvl = (s, el) => levelFor(s.knight.affinity[el] || 0);
    const masteryLvl = (s, cls) => levelFor(s.knight.mastery[cls] || 0);
    const rankLvl = (s) => levelFor(s.knight.rankXp || 0);
    const bondLvl = (c) => bondLevelFor(c.bond || 0);
    const bondName = (c) => { const l = bondLvl(c), names = CH.bondMilestones || []; let n = names[0] || ''; [0, 10, 25, 50, 75, 100].forEach((t, i) => { if (l >= t && names[i]) n = names[i]; }); return n; };
    function xpProgress(xp) {
        const l = levelFor(xp);
        if (l >= MAX_LEVEL) return { l, pct: 100, label: 'Max' };
        const lo = xpForLevel(l), hi = xpForLevel(l + 1);
        return { l, pct: Math.max(0, Math.min(100, ((xp || 0) - lo) / (hi - lo) * 100)), label: fl((xp || 0) - lo) + ' / ' + (hi - lo) };
    }
    function bondProgress(p) {
        const l = bondLevelFor(p);
        if (l >= 100) return { l, pct: 100, label: 'Max' };
        const lo = bondForLevel(l), hi = bondForLevel(l + 1);
        return { l, pct: Math.max(0, Math.min(100, ((p || 0) - lo) / (hi - lo) * 100)), label: fl((p || 0) - lo) + ' / ' + (hi - lo) };
    }
    function fmtDur(ms) {
        ms = Math.max(0, ms);
        const h = Math.floor(ms / HOUR), m = Math.floor((ms % HOUR) / MIN), sec = Math.floor((ms % MIN) / 1000);
        if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
        if (m > 0) return m + 'm ' + String(sec).padStart(2, '0') + 's';
        return sec + 's';
    }
    const fmtRate = (v) => (Math.round(v * 10) / 10).toString();
    const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|_)(\w)/g, (m, a, b) => (a ? ' ' : '') + b.toUpperCase());
    const itemName = (k) => (RES[k] ? RES[k].name : titleCase(k));

    // Chronicles items have no art, so each kind gets a small drawn glyph tinted per item.
    const EL_HEX = { FIRE: '#ff7a4a', ICE: '#8fe6ff', WIND: '#9cf0b8', EARTH: '#c49a5c', WATER: '#5aa8ff', ELECTRIC: '#ffe63c', METAL: '#b4bcc4', POISON: '#b48cff', PSYCHIC: '#d6a8ff', UNDEAD: '#a08cb4', LIGHT: '#fff0b0', SHADOW: '#9a5cd6' };
    const TINT = { iron_ore: '#8c9096', ember_shard: '#ff7a4a', oak_log: '#9a6a3c', heartwood: '#b0533c', sunleaf: '#8fd068', frostbloom: '#9ee8ff', galeberry: '#a07ce0', gale_feather: '#d8f0e8',
        minnow: '#9fc4d8', silverfin: '#c8dce8', copper_bar: '#d8874a', iron_bar: '#a6aeb6', ancient_relic: '#e8c46a', fossil: '#d8ccb0', rune_stone: '#7c8ab0', linen: '#ede4cc', rope: '#c8a565',
        pine_plank: '#d9ad63', oak_plank: '#a87a44', tide_pearl: '#e8f4ff', storm_glass: '#ffe97a', umbral_crystal: '#7a4ab0', mind_prism: '#d0a8ff', living_alloy: '#7ad8b0', grave_dust: '#a89ab8' };
    const SHAPE = {
        log: (c) => '<rect x="3" y="8" width="15" height="8" rx="4" fill="' + c + '" stroke="#4a3220" stroke-width="1.2"/><ellipse cx="18" cy="12" rx="3" ry="4" fill="#e2b276" stroke="#4a3220" stroke-width="1.2"/>',
        ore: (c) => '<path d="M4 16l4-9 8-1 4 8-6 5z" fill="' + c + '" stroke="#33363b" stroke-width="1.2"/>',
        gem: (c) => '<path d="M12 3l6 7-6 11-6-11z" fill="' + c + '" stroke="rgba(0,0,0,.45)" stroke-width="1.2"/>',
        leaf: (c) => '<path d="M5 19C5 9 11 5 19 5c0 8-4 14-14 14z" fill="' + c + '" stroke="rgba(0,0,0,.4)" stroke-width="1.2"/><path d="M5 19L14 10" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/>',
        berry: (c) => '<circle cx="9" cy="14" r="4" fill="' + c + '"/><circle cx="15" cy="15" r="4" fill="' + c + '"/><circle cx="12" cy="9" r="4" fill="' + c + '"/>',
        fish: (c) => '<path d="M3 12c4-6 11-6 14 0-3 6-10 6-14 0zM17 12l4-4v8z" fill="' + c + '" stroke="rgba(0,0,0,.4)" stroke-width="1.1"/>',
        bar: (c) => '<path d="M3 16l3-6h12l3 6z" fill="' + c + '" stroke="rgba(0,0,0,.45)" stroke-width="1.2"/>',
        plank: (c) => '<rect x="3" y="8" width="18" height="8" rx="1" fill="' + c + '" stroke="rgba(0,0,0,.4)" stroke-width="1.2"/><path d="M7 10h6M10 14h7" stroke="rgba(0,0,0,.25)"/>',
        cloth: (c) => '<path d="M4 6h16v12H4z" fill="' + c + '" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/><path d="M4 10h16M4 14h16" stroke="rgba(0,0,0,.15)"/>',
        coil: (c) => '<circle cx="12" cy="12" r="7" fill="none" stroke="' + c + '" stroke-width="3"/><circle cx="12" cy="12" r="3" fill="none" stroke="' + c + '" stroke-width="2"/>',
        orb: (c) => '<circle cx="12" cy="12" r="7" fill="' + c + '" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/><circle cx="9.5" cy="9.5" r="2" fill="rgba(255,255,255,.6)"/>',
        flask: (c) => '<path d="M9 3h6v5l4 9a3 3 0 01-3 4H8a3 3 0 01-3-4l4-9z" fill="' + c + '" stroke="rgba(0,0,0,.4)" stroke-width="1.2"/>',
        bowl: (c) => '<path d="M4 11h16a8 8 0 01-16 0z" fill="' + c + '" stroke="rgba(0,0,0,.4)" stroke-width="1.2"/>',
        hook: (c) => '<path d="M12 3v11a4 4 0 11-4-4" fill="none" stroke="' + c + '" stroke-width="2.4" stroke-linecap="round"/>',
        shield: (c) => '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="' + c + '" stroke="rgba(0,0,0,.4)" stroke-width="1.2"/>',
        helm: (c) => '<path d="M5 15a7 7 0 0114 0v3H5z" fill="' + c + '" stroke="rgba(0,0,0,.4)" stroke-width="1.2"/><path d="M8 15h8" stroke="rgba(0,0,0,.4)"/>',
        boot: (c) => '<path d="M8 3h5v11l6 3v3H7z" fill="' + c + '" stroke="rgba(0,0,0,.4)" stroke-width="1.2"/>',
        ring: (c) => '<circle cx="12" cy="14" r="6" fill="none" stroke="' + c + '" stroke-width="2.6"/><path d="M12 8l2-4h-4z" fill="' + c + '"/>',
        rune: (c) => '<circle cx="12" cy="12" r="8" fill="#3a4258" stroke="' + c + '" stroke-width="1.6"/><path d="M9 8l3 8 3-8M9.5 12h5" fill="none" stroke="' + c + '" stroke-width="1.6"/>'
    };
    function itemIcon(k) {
        const r = RES[k];
        if (!r) return '';
        if (r.icon) return r.icon;
        if (r.kind === 'TOOL') return TOOL_GLYPH[k] || '';
        if (r.kind === 'WEAPON') return '<g style="color:#e8dcc0">' + (WEAPONS[r.weaponType] || WEAPONS.sword).glyph + '</g>';
        const tierHex = ['#b8a88a', '#d8874a', '#a6aeb6', '#8fd0ff', '#f4cc62'][r.tier || 0] || '#d8c8a0';
        const c = TINT[k] || tierHex;
        if (r.kind === 'ESSENCE') return SHAPE.orb(EL_HEX[k.replace('essence_', '').toUpperCase()] || c);
        if (r.kind === 'POTION') return SHAPE.flask(k.indexOf('frost') >= 0 ? '#9ee8ff' : '#8fd068');
        if (r.kind === 'LURE') return SHAPE.hook(r.lureElement ? EL_HEX[r.lureElement] : '#d8c8a0');
        if (r.kind === 'FOOD') return SHAPE.bowl('#c9824a');
        if (r.kind === 'RUNE') return SHAPE.rune('#bfe0ff');
        if (r.kind === 'ARMOR') return SHAPE.shield(tierHex);
        if (r.kind === 'HELMET') return SHAPE.helm(tierHex);
        if (r.kind === 'BOOTS') return SHAPE.boot(tierHex);
        if (r.kind === 'ACCESSORY') return SHAPE.ring(tierHex);
        if (r.kind === 'RELIC') return SHAPE.gem('#e8c46a');
        if (/_log$|heartwood/.test(k)) return SHAPE.log(c);
        if (/_ore$/.test(k)) return SHAPE.ore(c);
        if (/_bar$/.test(k)) return SHAPE.bar(c);
        if (/plank/.test(k)) return SHAPE.plank(c);
        if (/linen/.test(k)) return SHAPE.cloth(c);
        if (/rope/.test(k)) return SHAPE.coil(c);
        if (/minnow|silverfin/.test(k)) return SHAPE.fish(c);
        if (/sunleaf|frostbloom/.test(k)) return SHAPE.leaf(c);
        if (/berry/.test(k)) return SHAPE.berry(c);
        if (/pearl/.test(k)) return SHAPE.orb(c);
        return SHAPE.gem(c);
    }
    const icon = (k, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + itemIcon(k) + '</svg>';
    const glyph = (g) => '<svg class="dm-glyph" viewBox="0 0 24 24" aria-hidden="true">' + g + '</svg>';
    function artImg(key, alt) {
        const a = ART[key];
        if (!a) return '';
        const z = a.zoom ? ' style="object-position:' + a.pos + ';transform:scale(' + a.zoom + ');transform-origin:' + a.origin + '"' : '';
        return '<img src="' + a.src + '" alt="' + esc(alt || '') + '" loading="lazy"' + z + '>';
    }
    function costChips(cost, s) {
        return Object.keys(cost).map((k) => {
            const have = s ? fl(s.inv[k]) : 0;
            const ok = !s || have >= cost[k];
            return '<span class="dm-chip ' + (s ? (ok ? 'good' : 'bad') : '') + '">' + icon(k) + (s ? have + '/' : '') + cost[k] + ' ' + esc(itemName(k)) + '</span>';
        }).join('');
    }
    function gainChips(g) {
        const keys = Object.keys(g || {}).filter((k) => g[k] > 0);
        if (!keys.length) return '<span class="dm-muted">Nothing yet</span>';
        return keys.map((k) => '<span class="dm-chip">' + icon(k) + '+' + fl(g[k]) + ' ' + esc(itemName(k)) + '</span>').join('');
    }
    const canAfford = (s, cost) => Object.keys(cost).every((k) => fl(s.inv[k]) >= cost[k]);
    function spend(s, cost) {
        if (!canAfford(s, cost)) return false;
        Object.keys(cost).forEach((k) => { s.inv[k] = Math.max(0, s.inv[k] - cost[k]); });
        return true;
    }
    // The Keep's timber store holds 300 (KeepService.TIMBER_INVENTORY_CAPACITY); a Storehouse raises it in a later stage.
    function add(s, gains, mul) {
        Object.keys(gains || {}).forEach((k) => {
            const v = Math.max(0, (s.inv[k] || 0) + gains[k] * (mul == null ? 1 : mul));
            s.inv[k] = k === 'timber' ? Math.min(Math.max(timberCap(s), s.inv[k] || 0), v) : v;
        });
    }

    // —— State ——
    function defaults(t) {
        const inv = {};
        Object.keys(RES).forEach((k) => { inv[k] = 0; });
        // A fresh Keep is bare ground: just enough Timber to raise the Woodlot, the Knight's
        // carved sword and two hand tools. Everything else is built, gathered or crafted.
        Object.assign(inv, { timber: WOODLOT_COST, wooden_sword: 1, woodaxe: 1, pickaxe: 1 });
        const skills = {};
        Object.keys(SKILLS).forEach((k) => { skills[k] = 0; });
        const affinity = {}, mastery = {}, prof = {};
        ELEMENTS.forEach((e) => { affinity[e] = 0; });
        CLASSES.forEach((c) => { mastery[c] = 0; });
        Object.keys(WEAPONS).forEach((w) => { prof[w] = 0; });
        return {
            schema: SCHEMA, t: t, offset: 0, rev: 0, runs: 0, seq: 0,
            inv: inv,
            reserve: { ember: 0, frost: 0, storm: 0, ore: 0, produce: 0, provisions: 2 },
            b: { hall: 1, woodlot: 0, archive: 0, storehouse: 0, yard: 0, front: 0 },
            // Workshop level 0 = not built yet; each one is a construction project.
            wsl: { forge: 0, fridge: 0, generator: 0, garden: 0, kitchen: 0, quarry: 0 }, annex: {},
            wings: { sanctuary: 0, forge: 0, garden: 0, war_room: 0, stable: 0, library: 0 },
            stored: {}, loreOpen: { charter_three_promises: true }, visitors: { active: [], npc: {}, nextAt: t + 10 * MIN }, requests: [], tasks: {}, rapport: {}, placed: {}, placedEver: {},
            builds: [], rebirths: 0, events: [], nextEventAt: t + 12 * HOUR, market: null, crafted: {}, theme: 'covenant',
            sync: { version: 0 }, applied: [], opReports: [],
            lore: {}, voices: { done: {}, flags: {}, rapport: {}, nextAt: 0, log: [] }, claims: {}, steward: '', loadouts: [],
            // 3x3 Quarter: index = row*3+col; rot 0=N 1=E 2=S 3=W. Empty until workshops are built.
            grid: [null, null, null, null, null, null, null, null, null],
            refine: { glass: 0, alloy: 0, rations: 0, mortar: 0, preserves: 0, smelt: 0 },
            made: { glass: 0, alloy: 0, rations: 0, mortar: 0, preserves: 0, smelt: 0 },
            knight: {
                name: 'Ser Airek', task: { kind: 'gather', id: 'chop_pine' }, prog: 0, stall: '', counts: {},
                equip: { weapon: 'wooden_sword', armor: null, helmet: null, boots: null, accessory: null, relic: null }, tool: 'woodaxe',
                skills: skills, prof: prof, affinity: affinity, mastery: mastery, rankXp: 0
            },
            comps: {
                cacty: { species: 'cacty', nick: '', joined: true, bond: 30, job: { kind: 'help', target: 'woodlot' }, explore: 0, treats: { day: '', n: 0 }, xp: 0, legend: false },
                sundile: { species: 'sundile', nick: '', joined: true, bond: 20, job: { kind: 'rest' }, explore: 0, treats: { day: '', n: 0 }, xp: 0, legend: false },
                fawny: { species: 'fawny', nick: '', joined: false, bond: 0, job: { kind: 'rest' }, explore: 0, treats: { day: '', n: 0 }, xp: 0, legend: false }
            },
            exp: null,
            done: {},
            reports: [],
            disc: { fawny: false, vaultMap: false },
            obj: {},
            prep: { dest: 'rootwild', party: ['cacty'], useRations: false, rune: '', potions: {} },
            sightings: [],
            log: [],
            ui: { tab: 'keep', knight: 'work', act: 'expedition', group: 'Gathering', prof: 'woodcutting', slot: '' }
        };
    }
    function merge(base, saved) {
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;
        Object.keys(saved).forEach((k) => {
            const b = base[k], v = saved[k];
            if (b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v)) base[k] = merge(b, v);
            else if (v !== undefined) base[k] = v;
        });
        return base;
    }
    // Schema 1 had three hand-made professions and free weapon choice. Schema 2 started with a
    // standing Woodlot and all six workshops; those Keeps keep what they had.
    function migrate(saved) {
        if ((saved.schema || 1) === 2) {
            saved.b = Object.assign({ woodlot: 1 }, saved.b);
            saved.wsl = saved.wsl || {};
            Object.keys(WS).forEach((w) => { saved.wsl[w] = Math.max(1, saved.wsl[w] || 0); });
            saved.loreOpen = Object.assign({ charter_three_promises: true }, saved.lore || {});
            saved.schema = 3;
            return saved;
        }
        if ((saved.schema || 1) >= 3) return saved;
        const k = saved.knight || {};
        const sk = k.skills || {};
        saved.knight = {
            name: k.name, prof: k.prof, tool: k.tool,
            task: k.job === 'mining' ? { kind: 'gather', id: 'mine_copper' } : k.job === 'studies' ? { kind: 'gather', id: 'read_records' } : k.job === 'idle' ? { kind: 'idle' } : { kind: 'gather', id: 'chop_pine' },
            skills: { woodcutting: (sk.woodcutting || 0) * 5, mining: (sk.mining || 0) * 5, elemental_studies: (sk.studies || 0) * 5 }
        };
        if (saved.ui) { saved.ui.knight = 'work'; }
        Object.keys(saved.comps || {}).forEach((id) => { saved.comps[id].bond = (saved.comps[id].bond || 0) * 5; });
        saved.schema = 2;
        return migrate(saved);
    }
    // Repairs anything an older or hand-edited save could break: grids missing a
    // workshop, negative stock, parties naming companions who never joined.
    function sanitize(s) {
        Object.keys(s.inv).forEach((k) => { s.inv[k] = Math.max(0, Number(s.inv[k]) || 0); });
        if (!Array.isArray(s.grid) || s.grid.length !== 9) s.grid = defaults(s.t).grid;
        const seen = {};
        s.grid = s.grid.map((c) => (c && WS[c.id] && wsBuilt(s, c.id) && !seen[c.id] && (seen[c.id] = true)) ? { id: c.id, rot: ((c.rot | 0) % 4 + 4) % 4 } : null);
        Object.keys(WS).forEach((id) => { if (wsBuilt(s, id) && !seen[id]) placeWorkshop(s, id); });
        Object.keys(s.comps).forEach((id) => {
            const c = s.comps[id];
            if (!c.job || !['help', 'explore', 'rest', 'knight', 'front'].includes(c.job.kind)) c.job = { kind: 'rest' };
            if (c.job.kind === 'help' && !HELP_TARGETS.includes(c.job.target)) c.job = { kind: 'rest' };
        });
        const k = s.knight, t = k.task || {};
        if (!(t.kind === 'idle' || (t.kind === 'gather' && ACTIVITIES[t.id]) || (t.kind === 'craft' && CRAFTS[t.id] && CRAFTS[t.id].repeatable))) k.task = { kind: 'idle' };
        SLOTS.forEach((sl) => { const id = k.equip[sl[0]]; if (id && (!RES[id] || RES[id].kind !== sl[1] || fl(s.inv[id]) < 1)) k.equip[sl[0]] = null; });
        if (!k.equip.weapon) k.equip.weapon = ['wooden_sword', 'squires_sword'].find((w) => fl(s.inv[w]) >= 1) || null;
        if (!RES[k.tool] || fl(s.inv[k.tool]) < 1) k.tool = fl(s.inv.woodaxe) ? 'woodaxe' : fl(s.inv.pickaxe) ? 'pickaxe' : '';
        s.prep.party = (s.prep.party || []).filter((id) => s.comps[id] && s.comps[id].joined);
        if (s.exp && (!DEST[s.exp.dest] || !(s.exp.endAt > 0))) s.exp = null;
        s.builds = (s.builds || []).filter((b) => b && b.id && b.endAt > 0);
        Object.keys(s.comps).forEach((id) => { const c = s.comps[id]; if (!c.species) c.species = id; if (c.xp == null) c.xp = 0; if (!c.treats) c.treats = { day: '', n: 0 }; });
        return s;
    }
    function load() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { saved = null; }
        if (!saved || typeof saved.t !== 'number' || (saved.schema || 0) > SCHEMA) return defaults(Date.now());
        if (saved.build) { const id = saved.build.id; saved.builds = [{ id: id === 'woodlot' ? 'woodlot_2' : id === 'hall' ? 'hall_2' : 'archive', name: titleCase(id), startAt: saved.build.startAt, endAt: saved.build.endAt }]; delete saved.build; }
        return sanitize(merge(defaults(saved.t), migrate(saved)));
    }
    function save() {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage blocked: session-only play */ }
    }
    const now = () => Date.now() + (S ? S.offset : 0);
    function logEvent(s, text) {
        s.log.unshift({ t: s.t, text: text });
        if (s.log.length > 40) s.log.length = 40;
    }
    let FRESH = []; // toasts raised while resolving; drained by the UI

    // —— Rules ——
    const onExpedition = (s, compId) => !!(s.exp && s.exp.party.includes(compId));
    const knightBusy = (s) => !!s.exp;
    function helperOf(s, target) {
        return Object.keys(s.comps).find((id) => {
            const c = s.comps[id];
            return c.joined && c.job.kind === 'help' && c.job.target === target;
        }) || null;
    }
    function knightHelper(s) {
        return Object.keys(s.comps).find((id) => s.comps[id].joined && s.comps[id].job.kind === 'knight' && !onExpedition(s, id)) || null;
    }
    function helperMul(s, target) {
        const id = helperOf(s, target);
        if (!id || onExpedition(s, id)) return 1;
        const c = s.comps[id];
        return 1 + (0.3 + Math.min(0.5, bondLvl(c) * 0.02) + (C(id).likes.includes(target) ? 0.3 : 0)) * (1 + 0.1 * rapportLvl(s, id));
    }
    function woodlotRate(s) {
        if (damaged(s, 'woodlot') || s.b.woodlot < 1) return 0;
        const base = (s.b.woodlot >= 2 ? 120 : 60) + (skillLvl(s, 'woodcutting') >= 20 ? 20 : 0);
        return base * helperMul(s, 'woodlot') * prodMul(s) * toolMul(s, 'woodlot');
    }
    function workshopRates(s, id) {
        const mul = damaged(s, id) || !wsBuilt(s, id) ? 0 : helperMul(s, id) * prodMul(s) * toolMul(s, id) * ((s.wsl[id] || 0) >= 2 ? 2 + 0.5 * Math.max(0, (s.wsl[id] || 0) - 2) : 1) * (s.annex[id] ? 1.25 : 1), out = {};
        Object.keys(WS[id].makes).forEach((k) => { out[k] = WS[id].makes[k] * mul; });
        return out;
    }

    // —— Progression (mirrors ChroniclesService.grantSkill and friends) ——
    function meets(s, req) {
        if (req.kind === 'SKILL') return skillLvl(s, req.key) >= req.level;
        if (req.kind === 'RANK') return rankLvl(s) >= req.level;
        if (req.kind === 'AFFINITY') return affLvl(s, req.key) >= req.level;
        if (req.kind === 'MASTERY') return masteryLvl(s, req.key) >= req.level;
        return true;
    }
    function reqText(req) {
        if (req.kind === 'SKILL') return (SKILLS[req.key] ? SKILLS[req.key].name : titleCase(req.key)) + ' ' + req.level;
        if (req.kind === 'RANK') return 'Rank ' + req.level;
        if (req.kind === 'AFFINITY') return titleCase(req.key) + ' Affinity ' + req.level;
        if (req.kind === 'MASTERY') return req.key + ' Mastery ' + req.level;
        return '';
    }
    // The Archive replaces Chronicles' Rank 5 gate on Elemental Studies: the Keep's ruin is the lock.
    function skillReqs(id) {
        const sk = SKILLS[id];
        if (!sk) return [];
        return id === 'elemental_studies' ? sk.unlock.filter((r) => r.kind !== 'RANK') : sk.unlock;
    }
    function skillUnlocked(s, id) {
        if (ARCHIVE_SKILLS.includes(id) && s.b.archive < 1) return false;
        if ((s.knight.skills[id] || 0) > 0) return true;
        return skillReqs(id).every((r) => meets(s, r));
    }
    function lockText(s, id) {
        const parts = [];
        if (ARCHIVE_SKILLS.includes(id) && s.b.archive < 1) parts.push('restore the Archive');
        skillReqs(id).forEach((r) => { if (!meets(s, r)) parts.push(reqText(r)); });
        return parts.length ? 'Unlocks at ' + parts.join(', ') : '';
    }
    function levelUp(s, label, before, after, toast) {
        if (after <= before) return;
        logEvent(s, label + ' reached level ' + after + '.');
        if (toast) FRESH.push(label + ' reached level ' + after + '.');
    }
    function grantSkill(s, id, xp) {
        // A locked profession earns nothing, or it would unlock itself (Chronicles' rule).
        if (!(xp > 0) || !SKILLS[id] || !skillUnlocked(s, id)) return;
        const before = skillLvl(s, id);
        s.knight.skills[id] = (s.knight.skills[id] || 0) + xp;
        const after = skillLvl(s, id);
        levelUp(s, SKILLS[id].name, before, after, true);
        if (id === 'command' && partySlotsFor(after) > partySlotsFor(before)) FRESH.push('Your company can now field ' + partySlotsFor(after) + ' Siegelings.');
    }
    function grantAffinity(s, el, xp) {
        if (!(xp > 0) || !(el in s.knight.affinity)) return;
        xp *= 1 + 0.02 * ((s.wings && s.wings.library) || 0);
        const before = affLvl(s, el);
        s.knight.affinity[el] += xp;
        levelUp(s, titleCase(el) + ' Affinity', before, affLvl(s, el), false);
    }
    function grantMastery(s, cls, xp) {
        if (!(xp > 0) || !(cls in s.knight.mastery)) return;
        const before = masteryLvl(s, cls);
        s.knight.mastery[cls] += xp;
        levelUp(s, cls + ' Mastery', before, masteryLvl(s, cls), false);
    }
    function grantRank(s, xp) {
        if (!(xp > 0)) return;
        const before = rankLvl(s);
        s.knight.rankXp += xp;
        levelUp(s, 'Knight Rank', before, rankLvl(s), true);
    }
    function grantBond(s, id, points) {
        if (!(points > 0)) return 0;
        const c = s.comps[id];
        grantSkill(s, 'bonding', Math.max(1, points / 2));
        points *= 1 + 0.01 * bonusLvl(s, 'bonding');
        const before = bondLvl(c);
        c.bond += points;
        const after = bondLvl(c);
        if (after > before && [10, 25, 50, 75, 100].some((m) => before < m && after >= m)) FRESH.push(C(id).name + ' is now ' + bondName(c) + '.');
        return points;
    }
    // Passive profession bonuses start once the profession is trained, not at a locked level 1.
    const bonusLvl = (s, id) => ((s.knight.skills[id] || 0) > 0 ? skillLvl(s, id) : 0);
    const partySlotsFor = (command) => (command >= 10 ? 3 : command >= 3 ? 2 : 1);
    const partySlots = (s) => partySlotsFor(skillLvl(s, 'command'));

    // —— The Knight's work ——
    const taskDef = (t) => (!t ? null : t.kind === 'gather' ? ACTIVITIES[t.id] : t.kind === 'craft' ? CRAFTS[t.id] : null);
    function taskBlock(s, def) {
        if (!def) return 'Nothing to do.';
        if (!skillUnlocked(s, def.skillId)) return lockText(s, def.skillId) + '.';
        if (skillLvl(s, def.skillId) < def.level) return 'Needs ' + SKILLS[def.skillId].name + ' ' + def.level + '.';
        const miss = (def.extraReqs || []).filter((r) => !meets(s, r));
        if (miss.length) return 'Needs ' + miss.map(reqText).join(', ') + '.';
        return '';
    }
    function toolBonus(s, def) {
        const t = RES[s.knight.tool];
        if (!t || !def || ACTIVITIES[def.id] !== def) return 0;
        if (t.tool === def.skillId || (t.tool === 'mining' && def.skillId === 'excavation')) return 0.6;
        return 0;
    }
    function helperBonus(s, def) {
        const id = knightHelper(s);
        if (!id || !def) return 0;
        const match = (def.helperElements || []).includes(C(id).el.toUpperCase());
        return match ? 0.25 + Math.min(0.25, bondLvl(s.comps[id]) * 0.01) : 0.1;
    }
    function knightSpeed(s, def) {
        const wing = wingFor(def.skillId);
        return 1 + toolBonus(s, def) + helperBonus(s, def) + (wing ? wingSpeed(s, wing) : 0) + (skillLvl(s, def.skillId) >= 100 ? 0.2 : 0);
    }
    const actionMs = (s, def) => def.actionSeconds * ACTION_SCALE * 1000 / knightSpeed(s, def);
    function usable(s, inputs) {
        return Object.keys(inputs).every((k) => (s.inv[k] || 0) + 1e-9 >= inputs[k] && (s.inv[k] || 0) - inputs[k] + 1e-9 >= (s.reserve[k] || 0));
    }
    function missingText(s, inputs) {
        return Object.keys(inputs).filter((k) => !((s.inv[k] || 0) + 1e-9 >= inputs[k] && (s.inv[k] || 0) - inputs[k] + 1e-9 >= (s.reserve[k] || 0)))
            .map((k) => itemName(k) + ((s.reserve[k] || 0) ? ' (above reserve ' + s.reserve[k] + ')' : '')).join(', ');
    }
    // Hourly view of the current task, for the Keep scene, the Knight card and storage.
    function knightRates(s, task) {
        const t = task || s.knight.task, def = taskDef(t), out = { gain: {}, use: {}, xp: 0 };
        if (!def || taskBlock(s, def)) return out;
        const per = HOUR / actionMs(s, def);
        out.xp = per * def.xp;
        if (t.kind === 'gather') {
            out.gain[al(def.output)] = per;
            if (def.bonusOutput && def.bonusEvery) out.gain[al(def.bonusOutput)] = (out.gain[al(def.bonusOutput)] || 0) + per / def.bonusEvery;
            if (def.skillId === 'mining' && skillLvl(s, 'mining') >= 20) out.gain.ember = (out.gain.ember || 0) + per / 4;
        } else {
            const inp = alMap(def.inputs);
            Object.keys(inp).forEach((k) => { out.use[k] = per * inp[k]; });
            if (def.output) out.gain[al(def.output)] = per * (def.outputQty || 1);
        }
        return out;
    }
    function tickKnight(s, ms) {
        const k = s.knight;
        if (knightBusy(s) || k.task.kind === 'idle') return;
        const def = taskDef(k.task), block = taskBlock(s, def);
        if (block) { k.stall = block; return; }
        k.prog += ms / actionMs(s, def);
        let guard = 0;
        while (k.prog >= 1 && guard++ < 5000) {
            if (k.task.kind === 'craft') {
                const inp = alMap(def.inputs);
                if (!usable(s, inp)) { k.prog = 1; k.stall = 'Waiting for ' + missingText(s, inp) + '.'; return; }
                Object.keys(inp).forEach((x) => { s.inv[x] = Math.max(0, s.inv[x] - inp[x]); });
                if (def.studyElement) { grantAffinity(s, def.studyElement, STUDY_AFFINITY_XP); k.counts.study = (k.counts.study || 0) + 1; }
                else add(s, { [al(def.output)]: def.outputQty || 1 });
            } else {
                const n = (k.counts[def.id] || 0) + 1;
                k.counts[def.id] = n;
                add(s, { [al(def.output)]: 1 });
                if (def.bonusOutput && def.bonusEvery && n % def.bonusEvery === 0) add(s, { [al(def.bonusOutput)]: 1 });
                if (def.skillId === 'mining' && skillLvl(s, 'mining') >= 20 && n % 4 === 0) add(s, { ember: 1 });
            }
            k.prog -= 1;
            k.stall = '';
            grantSkill(s, def.skillId, def.xp);
        }
    }
    // One-off gear (Chronicles' actionSeconds 0) is made on the spot from shared storage.
    function craftBlock(s, id) {
        const def = CRAFTS[id];
        const b = taskBlock(s, def);
        if (b) return b;
        if (knightBusy(s)) return 'The Knight is away.';
        if (!canAfford(s, alMap(def.inputs))) return 'Missing ' + Object.keys(alMap(def.inputs)).filter((x) => fl(s.inv[x]) < alMap(def.inputs)[x]).map(itemName).join(', ') + '.';
        return '';
    }
    function craftOnce(s, id) {
        if (craftBlock(s, id)) return false;
        const def = CRAFTS[id];
        spend(s, alMap(def.inputs));
        add(s, { [al(def.output)]: def.outputQty || 1 });
        grantSkill(s, def.skillId, def.xp);
        keepEvent(s, 'CRAFTING');
        logEvent(s, 'The Knight made ' + itemName(al(def.output)) + '.');
        s.rev++;
        return true;
    }
    function setTask(s, kind, id) {
        if (knightBusy(s)) return 'The Knight is on an expedition.';
        if (kind === 'idle') { s.knight.task = { kind: 'idle' }; s.knight.prog = 0; s.rev++; return ''; }
        const def = kind === 'gather' ? ACTIVITIES[id] : CRAFTS[id];
        if (!def || (kind === 'craft' && !def.repeatable)) return 'That is not repeatable work.';
        const b = taskBlock(s, def);
        if (b) return b;
        if (s.knight.task.kind !== kind || s.knight.task.id !== id) s.knight.prog = 0;
        s.knight.task = { kind: kind, id: id };
        s.knight.stall = '';
        s.rev++;
        return '';
    }
    function taskLabel(s, t) {
        const def = taskDef(t || s.knight.task);
        if (!def) return 'Idle at the Hall';
        if (def.studyElement) return titleCase(def.studyElement) + ' studies';
        return ACTIVITIES[def.id] === def ? def.name : itemName(al(def.output));
    }

    // —— Gear ——
    const equipped = (s) => SLOTS.map((sl) => s.knight.equip[sl[0]]).filter(Boolean);
    const weaponItem = (s) => RES[s.knight.equip.weapon] || { weaponType: 'sword', tier: 0, name: 'Bare hands' };
    function gearStats(s) {
        const g = { armor: 0, roadCut: 0, crit: 0, rest: 0, heat: false, wards: {} };
        equipped(s).forEach((id) => {
            const it = RES[id], b = CH.gearBonuses[id];
            g.armor += it.armor || 0;
            if (b) { g.armor += b.armor || 0; g.roadCut += b.roadCut || 0; g.crit += b.crit || 0; g.rest += b.rest || 0; }
            if (it.heatWard) g.heat = true;
            if (it.relicEffect && it.relicEffect.indexOf('ward:') === 0) g.wards[it.relicEffect.slice(5)] = true;
            (CH.hazardWards[id] || []).forEach((w) => { g.wards[w] = true; });
        });
        return g;
    }
    function equip(s, slot, id) {
        if (knightBusy(s)) return 'Equipment is locked during a journey.';
        const sl = SLOTS.find((x) => x[0] === slot);
        if (!sl) return '';
        if (id && (!RES[id] || RES[id].kind !== sl[1] || fl(s.inv[id]) < 1)) return 'You do not own that.';
        if (!id && slot === 'weapon') return 'The Knight always carries a weapon.';
        s.knight.equip[slot] = id || null;
        s.rev++;
        return '';
    }

    const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    // A link needs both sockets pointing at each other, like the TCG's reciprocal notches.
    function links(grid) {
        const out = [];
        grid.forEach((c, i) => {
            if (!c) return;
            const r = Math.floor(i / 3), col = i % 3;
            notchDirs(c.rot, notchCount(S, c.id)).forEach((d) => {
                const nr = r + DIRS[d][0], nc = col + DIRS[d][1];
                if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
                const j = nr * 3 + nc, o = grid[j];
                // Each pair is found from its lower-index plot, so j is to the right (1) or below (2).
                if (!o || j < i || !notchDirs(o.rot, notchCount(S, o.id)).includes((d + 2) % 4)) return;
                const recipe = Object.keys(RECIPES).find((rid) => {
                    const p = RECIPES[rid].pair;
                    return (p[0] === c.id && p[1] === o.id) || (p[1] === c.id && p[0] === o.id);
                }) || null;
                out.push({ a: i, b: j, dir: d, recipe: recipe });
            });
        });
        return out;
    }
    const activeRecipes = (s) => links(s.grid).filter((l) => l.recipe).map((l) => l.recipe);
    const refineSpeed = (s) => (skillLvl(s, 'elemental_studies') >= 3 ? 1.25 : 1);
    function canRefine(s, rid) {
        const inp = RECIPES[rid].input;
        return Object.keys(inp).every((k) => s.inv[k] + 1e-9 >= inp[k] && s.inv[k] - inp[k] + 1e-9 >= (s.reserve[k] || 0));
    }

    function tick(s, ms) {
        const h = ms / HOUR;
        // Basic production never needs connections.
        produce(s, 'woodlot', { timber: woodlotRate(s) }, h);
        Object.keys(WS).forEach((id) => produce(s, id, workshopRates(s, id), h));
        tickKnight(s, ms);
        const restBoost = 1 + Math.min(0.2, bonusLvl(s, 'husbandry') * 0.003);
        const sanct = (s.wings && s.wings.sanctuary) || 0, gw = (s.wings && s.wings.garden) || 0;
        // Chronicles' Alchemy Garden beds (gardenYield) grow in the Keep's Garden.
        if (gw) add(s, { sunleaf: 6 * gw * h, fiber: 4 * gw * h, frostbloom: gw >= 2 ? 2 * (gw - 1) * h : 0, galeberry: gw >= 3 ? 2 * (gw - 2) * h : 0 });
        const def = defenders(s).slice(0, frontCap(s));
        if (def.length) add(s, { crowns: frontRatePer(s) * def.length * h });
        Object.keys(S.comps).forEach((id) => {
            const c = s.comps[id];
            if (!c.joined || onExpedition(s, id)) return;
            if (c.job.kind === 'help' || c.job.kind === 'knight') grantBond(s, id, 4 * h);
            else if (c.job.kind === 'rest') grantBond(s, id, (8 + 6 * sanct) * h * restBoost);
            else if (c.job.kind === 'front') grantBond(s, id, 4 * h);
            else if (c.job.kind === 'explore') {
                grantBond(s, id, 3 * h);
                c.explore += h;
                while (c.explore >= EXPLORE_HOURS) {
                    c.explore -= EXPLORE_HOURS;
                    const cache = EXPLORE_CACHE[C(id).el];
                    add(s, cache);
                    logEvent(s, C(id).name + ' came back from exploring with ' + Object.keys(cache).map((k) => cache[k] + ' ' + itemName(k)).join(' and ') + '.');
                }
            }
        });
        // Automatic refining consumes real stock but never dips below the player's reserve.
        const speed = refineSpeed(s);
        activeRecipes(s).forEach((rid) => {
            const r = RECIPES[rid];
            s.refine[rid] = (s.refine[rid] || 0) + h * 60 / r.mins * speed;
            while (s.refine[rid] >= 1) {
                if (!canRefine(s, rid)) { s.refine[rid] = 1; break; }
                Object.keys(r.input).forEach((k) => { s.inv[k] = Math.max(0, s.inv[k] - r.input[k]); });
                add(s, r.output);
                s.made[rid] = (s.made[rid] || 0) + 1;
                s.refine[rid] -= 1;
            }
        });
    }

    function advance(s, target) {
        if (!(target > s.t)) return;
        if (target - s.t > OFFLINE_CAP) s.t = target - OFFLINE_CAP;
        let guard = 0;
        while (s.t < target && guard++ < 100000) {
            let next = target;
            if (s.exp) next = Math.min(next, s.exp.endAt);
            (s.builds || []).forEach((b) => { next = Math.min(next, b.endAt); });
            const step = Math.min(Math.max(0, next - s.t), STEP);
            if (step > 0) { tick(s, step); s.t += step; }
            // Completions fire at their exact timestamp, so time after a return is spent on resumed jobs.
            if (s.exp && s.t >= s.exp.endAt) finishExpedition(s);
            (s.builds || []).filter((b) => s.t >= b.endAt).forEach((b) => finishBuild(s, b));
            if (s.t >= s.nextEventAt) { rollEvent(s); s.nextEventAt += EVENT_EVERY; if (s.nextEventAt < s.t) s.nextEventAt = s.t + EVENT_EVERY; }
            tickRepairs(s);
            if (s.t >= (s.visitors.nextAt || 0)) { rollVisitors(s); s.visitors.nextAt = Math.max((s.visitors.nextAt || s.t) + VISITOR_EVERY, s.t - VISITOR_EVERY + 1); }
            if (s.requests.some((q) => q.until <= s.t)) s.requests = s.requests.filter((q) => q.until > s.t);
            if (step === 0 && !(s.exp && s.t >= s.exp.endAt) && !(s.builds || []).some((b) => s.t >= b.endAt)) break;
        }
        latchObjectives(s);
    }

    // —— Keep systems (numbers from KeepService, KeepEconomy and KeepRebirth) ——
    const KEEP_ALIAS = { verdant_fiber: 'fiber', ember_ingot: 'ember', frost_crystal: 'frost', storm_cell: 'storm', hearth_ration: 'rations', tempered_glass: 'glass', charged_alloy: 'alloy' };
    const ka = (m) => { const o = {}; Object.keys(m || {}).forEach((k) => { const id = KEEP_ALIAS[k] || al(k); o[id] = (o[id] || 0) + m[k]; }); return o; };
    const HALL_RANKS = ['Ruined Camp', 'Timber Outpost', 'Settled Courtyard', 'Stonehold', 'Walled Keep', 'Elemental Stronghold', 'High Castle', 'Grand Keep'];
    // [project name, timber, materials, seconds] for hall levels 2..8.
    const HALL_PROJECTS = {
        2: ['Raise the Timber Outpost', 120, {}, 900], 3: ['Settle the Courtyard', 220, {}, 5400],
        4: ['Cut the Stonehold', 300, { stone: 16, ember_ingot: 10 }, 14400],
        5: ['Raise the Keep Walls', 380, { stone: 22, verdant_fiber: 12, ember_ingot: 12 }, 28800],
        6: ['Awaken the Elemental Stronghold', 460, { verdant_fiber: 16, ember_ingot: 16, frost_crystal: 12, storm_cell: 10 }, 43200],
        7: ['Crown the High Castle', 540, { verdant_fiber: 22, ember_ingot: 22, frost_crystal: 18, storm_cell: 14 }, 64800],
        8: ['Consecrate the Grand Keep', 640, { verdant_fiber: 28, ember_ingot: 28, frost_crystal: 22, storm_cell: 18 }, 86400]
    };
    const HALL_THEMES = [['covenant', 'Covenant Gold', '#f4cc62', 1], ['ember', 'Ember Accord', '#ff6a3d', 3], ['verdant', 'Verdant Bough', '#8fce6f', 3], ['tide', 'Tidewoven', '#4da8ff', 4],
        ['frost', 'Frostglass', '#a9e8f2', 4], ['storm', 'Stormcall', '#ffe63c', 5], ['shadow', 'Shadowveil', '#b087e0', 6], ['light', 'Dawnlight', '#ffe9a8', 7]];
    const WS_LEVEL2 = { garden: { frost_crystal: 18, ember_ingot: 14 }, forge: { verdant_fiber: 24, storm_cell: 10 }, fridge: { verdant_fiber: 20, ember_ingot: 16 },
        generator: { verdant_fiber: 12, ember_ingot: 12, frost_crystal: 12 }, quarry: { ember_ingot: 14, storm_cell: 8 }, kitchen: { stone: 14, frost_crystal: 10 } };
    // [timber, materials, seconds, hall level] for a workshop's third and fourth notches.
    const WS_NOTCH_UP = { 3: [320, { stone: 24, living_mortar: 2 }, 28800, 4], 4: [420, { living_mortar: 3, tempered_glass: 3, charged_alloy: 2 }, 43200, 6] };
    const FRONT_PROJECTS = { 1: ['Raise Akhar’s Wall', 240, { stone: 20 }, 7200], 2: ['Reinforce the Rampart', 320, { stone: 24 }, 21600],
        3: ['Raise the Battlements', 420, { stone: 32, ember_ingot: 14 }, 36000], 4: ['Crown the Bastion', 540, { stone: 44, ember_ingot: 18, frost_crystal: 14 }, 57600] };
    const WING_HOME = { sanctuary: 'Enclave', forge: 'Forge', garden: 'Garden', war_room: 'Great Hall', stable: 'Stable yard', library: 'Archive' };
    const WING_EFFECT = {
        sanctuary: (l) => 'Roster +' + 3 * l + ', resting bond +' + 6 * l + '/h',
        forge: (l) => 'Smelting, Smithing and Carpentry ' + Math.round(Math.min(0.3, 0.06 * l) * 100) + '% faster',
        garden: (l) => 'Alchemy and Cooking ' + Math.round(Math.min(0.3, 0.06 * l) * 100) + '% faster; beds grow herbs',
        war_room: (l) => l + ' saved loadout' + (l > 1 ? 's' : ''),
        stable: (l) => 'Carry ' + (20 + 4 * l) + ' potions; +' + 2 * l + '% road bond',
        library: (l) => 'Elemental Studies ' + Math.round(Math.min(0.3, 0.06 * l) * 100) + '% faster; affinity +' + 2 * l + '%'
    };
    // Keep refined goods (KeepEconomy.REFINED); tier 1 needs the Storehouse, 2 the vaulted Storehouse, 3 the Elemental Stronghold.
    const REFINED = {
        living_mortar: { name: 'Living Mortar', tier: 1, blurb: 'Stone bound with fiber that keeps growing into the joints.', inputs: { stone: 6, verdant_fiber: 4, timber: 20 } },
        glass: { name: 'Tempered Glass', tier: 1, blurb: 'Forge heat quenched in frost.', inputs: { ember_ingot: 5, frost_crystal: 5 } },
        alloy: { name: 'Charged Alloy', tier: 1, blurb: 'Ingot folded around a storm cell.', inputs: { storm_cell: 5, ember_ingot: 4 } },
        rations: { name: 'Hearth Ration', tier: 1, blurb: 'Provisions packed with fiber for the road.', inputs: { provisions: 6, verdant_fiber: 3 } },
        covenant_keystone: { name: 'Covenant Keystone', tier: 2, blurb: 'The stone every rebuilt arch is set around.', inputs: { living_mortar: 2, tempered_glass: 2, charged_alloy: 1 } },
        aether_core: { name: 'Aether Core', tier: 2, blurb: 'A sealed heart of charge and light.', inputs: { charged_alloy: 2, tempered_glass: 2, hearth_ration: 1, timber: 30 } },
        heartwood_relic: { name: 'Heartwood Relic', tier: 3, blurb: 'Grown from the first grove and carried through every rebirth.', inputs: { covenant_keystone: 1, aether_core: 1, living_mortar: 2 } }
    };
    ['living_mortar', 'covenant_keystone', 'aether_core', 'heartwood_relic'].forEach((k) => { RES[k] = { name: REFINED[k].name, kind: 'MATERIAL', tier: REFINED[k].tier, blurb: REFINED[k].blurb, icon: SHAPE.gem(['', '#c8b08a', '#8fd0ff', '#e8c46a'][REFINED[k].tier]) }; });
    const RAW = ['stone', 'fiber', 'ember', 'frost', 'storm', 'provisions'];
    // KeepEconomy.POOL with Siegecoin lots priced in Crowns: Dominion never touches real coins.
    const MARKET_POOL = [
        ['timber_lot', 'timber', 50, 6, 'silver', 'COMMON', 5], ['verdant_fiber_lot', 'fiber', 10, 18, 'silver', 'COMMON', 3], ['ember_ingot_lot', 'ember', 10, 22, 'silver', 'COMMON', 3],
        ['frost_crystal_lot', 'frost', 10, 24, 'silver', 'COMMON', 3], ['storm_cell_lot', 'storm', 10, 22, 'silver', 'COMMON', 3], ['stone_lot', 'stone', 10, 18, 'silver', 'COMMON', 3],
        ['provisions_lot', 'provisions', 10, 16, 'silver', 'COMMON', 3], ['living_mortar_lot', 'living_mortar', 1, 16, 'silver', 'UNCOMMON', 2], ['tempered_glass_lot', 'glass', 1, 18, 'silver', 'UNCOMMON', 2],
        ['charged_alloy_lot', 'alloy', 1, 18, 'silver', 'UNCOMMON', 2], ['hearth_ration_lot', 'rations', 1, 14, 'silver', 'UNCOMMON', 2], ['stone_crate', 'stone', 30, 48, 'silver', 'UNCOMMON', 1],
        ['timber_wagon', 'timber', 200, 20, 'silver', 'UNCOMMON', 1], ['ember_crate_offer', 'ember', 40, 90, 'crowns', 'RARE', 1], ['frost_crate_offer', 'frost', 40, 95, 'crowns', 'RARE', 1],
        ['storm_crate_offer', 'storm', 40, 90, 'crowns', 'RARE', 1], ['covenant_keystone_offer', 'covenant_keystone', 1, 180, 'crowns', 'RARE', 1], ['aether_core_offer', 'aether_core', 1, 200, 'crowns', 'RARE', 1],
        ['mortar_bundle_offer', 'living_mortar', 3, 110, 'crowns', 'RARE', 1], ['glass_bundle_offer', 'glass', 3, 120, 'crowns', 'RARE', 1], ['heartwood_relic_offer', 'heartwood_relic', 1, 600, 'crowns', 'EPIC', 1]
    ].map((m) => ({ id: m[0], res: m[1], amount: m[2], price: m[3], currency: m[4], rarity: m[5], stock: m[6] }));
    // Keep crafts (KeepService.createRecipes): tools lift a room 20%, bonuses lift storage or all workshops, decorations are for looks.
    const KEEP_CRAFTS = {
        coppice_hooks: ['Coppice Hooks', 'TOOL', 'woodlot', { verdant_fiber: 8 }], gardener_tools: ['Rootwise Pruning Kit', 'TOOL', 'garden', { verdant_fiber: 12, ember_ingot: 6 }],
        tempered_tongs: ['Consent-Forged Tongs', 'TOOL', 'forge', { ember_ingot: 12, frost_crystal: 5 }], coldseal_kit: ['Coldseal Preservation Kit', 'TOOL', 'fridge', { frost_crystal: 12, verdant_fiber: 8 }],
        tuning_key: ['Resonance Tuning Key', 'TOOL', 'generator', { storm_cell: 10, ember_ingot: 6 }], mason_mauls: ['Stonewise Mason Mauls', 'TOOL', 'quarry', { stone: 12, ember_ingot: 6 }],
        hearth_set: ['Shared-Table Hearth Set', 'TOOL', 'kitchen', { stone: 8, ember_ingot: 8 }],
        covenant_crates: ['Covenant Storage Crates', 'BONUS', 'great_hall', { verdant_fiber: 18, ember_ingot: 10 }], insulated_channels: ['Insulated Element Channels', 'BONUS', 'generator', { frost_crystal: 10, storm_cell: 10 }],
        living_trellis: ['Living Covenant Trellis', 'DECORATION', 'garden', { verdant_fiber: 8 }], ember_lantern: ['Emberglass Lantern', 'DECORATION', 'forge', { ember_ingot: 7 }],
        frostglass_mobile: ['Frostglass Memory Mobile', 'DECORATION', 'fridge', { frost_crystal: 7 }], harmonic_orb: ['Harmonic Current Orb', 'DECORATION', 'generator', { storm_cell: 6 }],
        covenant_tapestry: ['Tapestry of Four Currents', 'DECORATION', 'great_hall', { verdant_fiber: 4, ember_ingot: 4, frost_crystal: 4, storm_cell: 4 }],
        stone_sentinel: ['Quarry Stone Sentinel', 'DECORATION', 'quarry', { stone: 8 }], hearth_garland: ['Harvest Hearth Garland', 'DECORATION', 'kitchen', { provisions: 7 }],
        carved_waypost: ['Carved Covenant Waypost', 'DECORATION', 'woodlot', { verdant_fiber: 6 }]
    };
    const REBIRTH_LADDER = [
        [['enclave'], { timber: 200 }], [['builders_yard'], { timber: 300, stone: 20 }], [['enclave', 'builders_yard'], { timber: 400, stone: 30, living_mortar: 2 }],
        [['workshops_built:6', 'storehouse:2'], { timber: 600, living_mortar: 3, tempered_glass: 3, charged_alloy: 2 }],
        [['workshops_l2:3', 'akhars_front:1'], { timber: 800, hearth_ration: 3, covenant_keystone: 1 }], [['workshops_l2:6', 'akhars_front:2'], { timber: 1000, covenant_keystone: 2, aether_core: 1 }],
        [['akhars_front:3', 'annexes:3'], { timber: 1200, covenant_keystone: 2, aether_core: 2, heartwood_relic: 1 }], [['akhars_front:4', 'annexes:5', 'keeper_level:15'], { timber: 1400, covenant_keystone: 3, heartwood_relic: 3 }],
        [['annexes:7', 'keeper_level:20'], { timber: 1600, aether_core: 3, heartwood_relic: 4 }], [['annexes:7', 'keeper_level:25'], { timber: 1800, covenant_keystone: 4, aether_core: 4, heartwood_relic: 6 }]
    ];
    const REBIRTH_TITLES = ['', 'Reborn', 'Twice-Risen', 'Thrice-Risen', 'Evergreen', 'Ageless', 'Undying', 'Eternal', 'Mythic', 'Legendary', 'Covenant Eternal'];
    const rebirths = (s) => Math.min(10, s.rebirths || 0);
    const costMul = (s) => 1 + rebirths(s) * 0.15;
    const timeMul = (s) => Math.max(0.4, 1 - rebirths(s) * 0.1);
    const scaleCost = (s, m) => { const o = {}; Object.keys(m).forEach((k) => { o[k] = Math.round(m[k] * costMul(s)); }); return o; };
    const timberCap = (s) => Math.round((300 + 300 * (s.b.storehouse || 0) + (s.crafted && s.crafted.covenant_crates ? 75 : 0)) * (1 + rebirths(s) * 0.2));
    const crews = (s) => 1 + ((s.b.yard || 0) >= 1 ? 1 : 0);
    const KEY_OF = (id) => id.indexOf('hall_') === 0 ? 'hall' : /^woodlot_/.test(id) ? 'woodlot' : /^ws_\w+_1$/.test(id) ? 'quarter' : id === 'archive' ? 'archive' : id.indexOf('front_') === 0 ? 'front' : '';
    const buildFor = (s, key) => (s.builds || []).find((b) => KEY_OF(b.id) === key) || null;
    const damaged = (s, target) => (s.events || []).some((e) => e.target === target && !e.repaired);
    function prodMul(s) {
        return (1 + 0.05 * ((s.b.hall || 1) - 1) * (damaged(s, 'great_hall') ? 0 : 1)) * (1 + rebirths(s) * 0.25) * (s.crafted && s.crafted.insulated_channels ? 1.1 : 1);
    }
    const wingSpeed = (s, wing) => Math.min(0.3, 0.06 * ((s.wings && s.wings[wing]) || 0));
    function wingFor(skill) {
        if (['smelting', 'smithing', 'carpentry'].includes(skill)) return 'forge';
        if (['alchemy', 'cooking'].includes(skill)) return 'garden';
        if (skill === 'elemental_studies') return 'library';
        return '';
    }
    const frontRatePer = (s) => 2 * (s.b.front || 0);
    const frontCap = (s) => s.b.front || 0;
    const defenders = (s) => Object.keys(s.comps).filter((id) => s.comps[id].joined && s.comps[id].job.kind === 'front' && !onExpedition(s, id));

    // Every buildable project, generated from current levels; finished ones drop out.
    function projectList(s) {
        const P = [];
        const push = (id, group, name, timber, mats, secs, effect, block) => {
            const cost = scaleCost(s, Object.assign(timber ? { timber: timber } : {}, ka(mats)));
            P.push({ id: id, group: group, name: name, cost: cost, ms: Math.round(secs * 1000 * timeMul(s)), effect: effect, block: block || '' });
        };
        const busy = (id) => (s.builds || []).some((b) => b.id === id);
        if (s.b.archive < 1) push('archive', 'Archive', 'Restore the Living Archive', 60, { tempered_glass: 3 }, 8 * 3600, 'Opens Elemental Studies and Runecrafting for the Knight, and the Archive’s lore.');
        if (s.b.hall < 8) {
            const n = s.b.hall + 1, hp = HALL_PROJECTS[n], need = Math.max(0, (n - 2) * 3);
            push('hall_' + n, 'Great Hall', hp[0], hp[1], hp[2], hp[3], 'Keep rank: ' + HALL_RANKS[n - 1] + '. +5% Keep production per rank' + (n === 2 ? '; expeditions need 1 fewer provision; proficiency +25%' : '') + '.', rankLvl(s) < need ? 'Needs Knight Rank ' + need + '.' : '');
        }
        if (s.b.woodlot < 1) push('woodlot_1', 'Woodlot', 'Raise the Woodlot', WOODLOT_COST, {}, 600, 'Restorative forestry: 60 Timber/h for the rest of the Keep.');
        else if (s.b.woodlot < 2) push('woodlot_2', 'Woodlot', 'Cultivate the Woodlot', 140, { stone: 20 }, 2 * 3600, 'Woodlot produces 120 Timber/h instead of 60.');
        if ((s.b.storehouse || 0) < 1) push('storehouse_1', 'Storehouse', 'Raise the Covenant Storehouse', 180, {}, 1800, 'Timber store +300; opens Keep refining, recycling and the market.', s.b.woodlot < 2 ? 'Cultivate the Woodlot first.' : '');
        else if (s.b.storehouse < 2) push('storehouse_2', 'Storehouse', 'Vault the Storehouse', 320, { verdant_fiber: 18, ember_ingot: 12, frost_crystal: 12, storm_cell: 8 }, 28800, 'Timber store +300 more; opens tier 2 refining.', !s.b.yard ? 'Raise the Builder’s Yard first.' : '');
        if (!s.b.yard) push('yard', 'Builder’s Yard', 'Raise the Builder’s Yard', 260, { stone: 18 }, 10800, 'A second construction crew, workshop expansions and annexes.', s.b.hall < 2 ? 'Raise the Timber Outpost first.' : '');
        if ((s.b.front || 0) < 4) {
            const n = (s.b.front || 0) + 1, fp = FRONT_PROJECTS[n];
            push('front_' + n, 'Akhar’s Wall', fp[0], fp[1], fp[2], fp[3], n + ' defender post' + (n > 1 ? 's' : '') + ' on the rampart, ' + 2 * n + ' Crowns/h each.', s.b.hall < 2 ? 'Needs the Timber Outpost (Hall 2).' : '');
        }
        Object.keys(WS).forEach((w) => {
            const wb = WS_BUILD[w], makes = Object.keys(WS[w].makes).map((k) => RES[k].name).join(', ');
            if (!wsBuilt(s, w)) push('ws_' + w + '_1', 'Elemental Quarter', 'Build the ' + WS[w].name, wb[0], wb[1], wb[2], 'A ' + titleCase(WS[w].el) + ' workshop in the Elemental Quarter: makes ' + makes + '. Its socket can link to a neighbour.', s.b.woodlot < 1 ? 'Raise the Woodlot first.' : '');
            else {
                const lv = s.wsl[w] || 0;
                if (lv < 2) push('ws_' + w + '_2', 'Workshops', 'Expand the ' + WS[w].name, 260, WS_LEVEL2[w], 21600, WS[w].name + ' produces twice as much and opens a second notch on the far side.', !s.b.yard ? 'Raise the Builder’s Yard first.' : '');
                else if (lv < MAX_WS_LEVEL) {
                    const up = WS_NOTCH_UP[lv + 1];
                    push('ws_' + w + '_' + (lv + 1), 'Workshops', (lv === 2 ? 'Notch the flanks of the ' : 'Open every side of the ') + WS[w].name, up[0], up[1], up[2],
                        WS[w].name + ' gains ' + (lv === 2 ? 'a third notch on its flanks' : 'its fourth notch: it can link on every side') + ', and +25% output.', s.b.hall < up[3] ? 'Needs ' + HALL_RANKS[up[3] - 1] + ' (Hall ' + up[3] + ').' : '');
                }
                if (lv >= 2 && !s.annex[w]) push('annex_' + w, 'Workshops', WS[w].name + ' storage annex', 220, { stone: 10 }, 14400, WS[w].name + ' output +25%.');
            }
        });
        Object.keys(CH.buildings || {}).forEach((id) => {
            const B = CH.buildings[id], lvl = (s.wings[id] || 0);
            if (lvl >= 5) return;
            const need = (CH.buildingRank || [2, 6, 12, 20, 30])[lvl];
            push('wing_' + id + '_' + (lvl + 1), 'Chronicles wings', B.name + ' ' + (lvl + 1) + ' (' + WING_HOME[id] + ')', 0, B.costs[lvl], (lvl + 1) * 2 * 3600, WING_EFFECT[id](lvl + 1) + '.', rankLvl(s) < need ? 'Needs Knight Rank ' + need + '.' : '');
        });
        return P.filter((p) => !busy(p.id));
    }
    function applyProject(s, id) {
        let m;
        if (id === 'archive') s.b.archive = 1;
        else if ((m = id.match(/^hall_(\d)$/))) s.b.hall = Math.max(s.b.hall, +m[1]);
        else if (id === 'woodlot_1') s.b.woodlot = Math.max(1, s.b.woodlot);
        else if (id === 'woodlot_2') s.b.woodlot = 2;
        else if ((m = id.match(/^ws_(\w+)_1$/))) { s.wsl[m[1]] = Math.max(1, s.wsl[m[1]] || 0); placeWorkshop(s, m[1]); }
        else if ((m = id.match(/^storehouse_(\d)$/))) s.b.storehouse = Math.max(s.b.storehouse || 0, +m[1]);
        else if (id === 'yard') s.b.yard = 1;
        else if ((m = id.match(/^front_(\d)$/))) s.b.front = Math.max(s.b.front || 0, +m[1]);
        else if ((m = id.match(/^ws_(\w+)_([234])$/))) s.wsl[m[1]] = Math.max(s.wsl[m[1]] || 0, +m[2]);
        else if ((m = id.match(/^annex_(\w+)$/))) s.annex[m[1]] = true;
        else if ((m = id.match(/^wing_(\w+)_(\d)$/))) s.wings[m[1]] = Math.max(s.wings[m[1]] || 0, +m[2]);
    }
    function projectLabel(id) { const p = (S && projectList(Object.assign({}, S, { builds: [] }))).find((x) => x.id === id); return p ? p.name : titleCase(id); }
    function buildBlock(s, id) {
        const p = projectList(s).find((x) => x.id === id);
        if (!p) return 'Already built or under way.';
        if (p.block) return p.block;
        if ((s.builds || []).length >= crews(s)) return 'Every crew is busy (' + crews(s) + ').';
        if (!canAfford(s, p.cost)) return 'Not enough materials yet.';
        return '';
    }
    function startBuild(s, id) {
        if (buildBlock(s, id)) return false;
        const p = projectList(s).find((x) => x.id === id);
        spend(s, p.cost);
        s.builds.push({ id: id, name: p.name, startAt: s.t, endAt: s.t + p.ms });
        logEvent(s, 'Construction started: ' + p.name + '.');
        s.rev++;
        return true;
    }
    function finishBuild(s, bd) {
        s.builds = s.builds.filter((b) => b !== bd);
        applyProject(s, bd.id);
        (LORE_ON_BUILD[bd.id] || []).forEach((id) => unlockLore(s, id));
        keepEvent(s, 'CONSTRUCTION');
        logEvent(s, bd.name + ' is complete.');
        FRESH.push(bd.name + ' is complete.');
        grantRank(s, Math.round((bd.endAt - bd.startAt) / HOUR * 30));
        s.rev++;
    }

    // —— Keep events (keep-events.json): damage suspends a building until repaired ——
    const EVENT_EVERY = 12 * HOUR;
    function rollEvent(s) {
        const list = ((window.DOMINION_KEEP && window.DOMINION_KEEP.events) || []).filter((e) => (e.minHallLevel || 1) <= s.b.hall && !(s.events || []).some((x) => x.id === e.id && !x.repaired)
            && (e.targetType === 'DECORATION' ? s.crafted[e.targetId] : ['great_hall', 'archive', 'enclave'].includes(e.targetId) || (e.targetId === 'woodlot' && s.b.woodlot >= 1) || (WS[e.targetId] && wsBuilt(s, e.targetId)) || (e.targetId === 'storehouse' && s.b.storehouse) || (e.targetId === 'builders_yard' && s.b.yard)));
        const r = rng('event:' + Math.floor(s.t / EVENT_EVERY));
        if (!list.length || r() > 0.4 || (s.events || []).filter((e) => !e.repaired).length >= 2) return;
        const e = list[Math.floor(r() * list.length)];
        s.events.push({ id: e.id, title: e.title, kicker: e.kicker, text: e.description, target: e.targetId, targetName: e.targetName, cost: e.coinCost, repairMs: e.repairSeconds * 4000, at: s.t, repairEndAt: 0, repaired: false });
        logEvent(s, e.title + '.');
        FRESH.push(e.title + '. Repair it from Activities › Keep.');
        s.rev++;
    }
    function repairBlock(s, id) {
        const e = (s.events || []).find((x) => x.id === id && !x.repaired);
        if (!e) return 'Nothing to repair.';
        if (e.repairEndAt) return 'Repairs under way.';
        if (fl(s.inv.timber) < e.cost) return 'Repairs need ' + e.cost + ' Timber.';
        return '';
    }
    function startRepair(s, id) {
        if (repairBlock(s, id)) return false;
        const e = s.events.find((x) => x.id === id && !x.repaired);
        s.inv.timber -= e.cost;
        e.repairEndAt = s.t + e.repairMs;
        s.rev++;
        return true;
    }
    function tickRepairs(s) {
        (s.events || []).forEach((e) => {
            if (!e.repaired && e.repairEndAt && s.t >= e.repairEndAt) {
                e.repaired = true;
                add(s, { silver: 6 });
                grantRank(s, 20);
                logEvent(s, 'Repaired: ' + e.title + ' (+6 Silver).');
                FRESH.push('Repaired: ' + e.targetName + '. +6 Silver.');
                s.rev++;
            }
        });
        s.events = (s.events || []).filter((e) => !e.repaired || s.t - e.repairEndAt < 24 * HOUR);
    }

    // —— Storehouse: refining, recycling, market, stewardship ——
    function refineBlock(s, id) {
        const r = REFINED[id];
        if (!r) return 'Unknown recipe.';
        if (!(s.b.storehouse >= 1)) return 'Raise the Storehouse first.';
        if (r.tier === 2 && s.b.storehouse < 2) return 'Needs the vaulted Storehouse.';
        if (r.tier === 3 && s.b.hall < 6) return 'Needs the Elemental Stronghold (Hall 6).';
        if (!canAfford(s, ka(r.inputs))) return 'Missing materials.';
        return '';
    }
    function refine(s, id) { if (refineBlock(s, id)) return false; spend(s, ka(REFINED[id].inputs)); add(s, { [id]: 1 }); keepEvent(s, 'CRAFTING'); s.rev++; return true; }
    function recycleBlock(s, from, to) {
        if (!(s.b.storehouse >= 1)) return 'Raise the Storehouse first.';
        if (REFINED[from]) return fl(s.inv[from]) >= 1 ? '' : 'None to salvage.';
        if (!RAW.includes(to) || from === to) return 'Pick another material.';
        const need = from === 'timber' ? 15 : 3;
        return fl(s.inv[from]) >= need ? '' : 'Needs ' + need + ' ' + itemName(from) + '.';
    }
    function recycle(s, from, to) {
        if (recycleBlock(s, from, to)) return false;
        if (REFINED[from]) { s.inv[from] -= 1; const back = {}; const inp = ka(REFINED[from].inputs); Object.keys(inp).forEach((k) => { if (Math.floor(inp[k] / 2) > 0) back[k] = Math.floor(inp[k] / 2); }); add(s, back); }
        else { s.inv[from] -= from === 'timber' ? 15 : 3; add(s, { [to]: 1 }); }
        s.rev++;
        return true;
    }
    const dayKey = (s) => new Date(s.t).toDateString();
    function marketOffers(s) {
        const day = dayKey(s), r = rng('market:' + day + ':' + (s.knight.name || ''));
        const pick = (rar, n, out) => { const c = MARKET_POOL.filter((m) => m.rarity === rar && !out.includes(m)); const got = []; while (got.length < n && c.length) got.push(c.splice(Math.floor(r() * c.length), 1)[0]); return got; };
        const out = [MARKET_POOL[0]];
        out.push(...pick('COMMON', 3, out)); out.push(...pick('UNCOMMON', 2, out));
        out.push(...pick(r() < 0.15 ? 'EPIC' : 'RARE', 1, out));
        return out;
    }
    function marketLeft(s, m) { const b = s.market && s.market.day === dayKey(s) ? (s.market.bought[m.id] || 0) : 0; return m.stock - b; }
    function buyBlock(s, id) {
        if (!(s.b.storehouse >= 1)) return 'Raise the Storehouse to open the market.';
        const m = marketOffers(s).find((x) => x.id === id);
        if (!m) return 'Not on offer today.';
        if (marketLeft(s, m) <= 0) return 'Sold out today.';
        if (fl(s.inv[m.currency]) < m.price) return 'Needs ' + m.price + ' ' + itemName(m.currency) + '.';
        return '';
    }
    function buy(s, id) {
        if (buyBlock(s, id)) return false;
        const m = marketOffers(s).find((x) => x.id === id);
        if (!s.market || s.market.day !== dayKey(s)) s.market = { day: dayKey(s), bought: {} };
        s.market.bought[id] = (s.market.bought[id] || 0) + 1;
        s.inv[m.currency] -= m.price;
        add(s, { [m.res]: m.amount });
        s.rev++;
        return true;
    }
    const stewardReady = (s) => s.steward !== dayKey(s);
    function steward(s) { if (!stewardReady(s)) return false; s.steward = dayKey(s); add(s, { silver: 4 }); grantRank(s, 15); s.rev++; return true; }
    function keepCraftBlock(s, id) {
        const k = KEEP_CRAFTS[id];
        if (!k) return 'Unknown craft.';
        if (s.crafted[id]) return 'Already made.';
        if (!canAfford(s, ka(k[3]))) return 'Missing materials.';
        return '';
    }
    function keepCraft(s, id) { if (keepCraftBlock(s, id)) return false; spend(s, ka(KEEP_CRAFTS[id][3])); s.crafted[id] = true; keepEvent(s, 'CRAFTING'); s.rev++; return true; }
    const toolMul = (s, room) => Object.keys(KEEP_CRAFTS).some((k) => KEEP_CRAFTS[k][1] === 'TOOL' && KEEP_CRAFTS[k][2] === room && s.crafted[k]) ? 1.2 : 1;

    // —— The Chronicle: Keep lore unlocks as in KeepService; reading only marks it read ——
    const LORE = () => (window.DOMINION_KEEP && window.DOMINION_KEEP.lore) || { entries: [], conversations: [] };
    // KeepService.applyConstructionEffects and the Woodlot collect counts, by Dominion project id.
    const LORE_ON_BUILD = { woodlot_2: ['letter_green_covenant'], archive: ['chronicle_living_elements', 'letter_pre_covenant_watch'], storehouse_1: ['ledger_quartermaster_sera'],
        ws_garden_1: ['fieldnote_covenant_garden'], ws_forge_1: ['letter_ember_forge'], ws_fridge_1: ['inventory_frost_fridge'], ws_generator_1: ['schematic_elemental_generator'] };
    const DECIPHER_COST = 10;
    const loreOpen = (s, id) => !!(s.loreOpen && s.loreOpen[id]) || !!s.lore[id];
    function unlockLore(s, id) {
        if (!id || loreOpen(s, id) || !LORE().entries.some((e) => e.id === id)) return false;
        s.loreOpen[id] = true;
        const e = LORE().entries.find((x) => x.id === id);
        FRESH.push('New in the Chronicle: ' + e.title + '.');
        logEvent(s, 'A record surfaced: ' + e.title + '.');
        s.rev++;
        return true;
    }
    function readLoreBlock(s, id) {
        if (!LORE().entries.some((e) => e.id === id)) return 'Unknown record.';
        if (loreOpen(s, id)) return '';
        if (s.b.archive < 1) return 'Still buried. Restore the Archive to decipher records early.';
        if (fl(s.inv.insight) < DECIPHER_COST) return 'Decipher with ' + DECIPHER_COST + ' Insight (read the Covenant Records), or uncover it in play.';
        return '';
    }
    // Opening an unlocked record marks it read; a buried one can be deciphered with Insight.
    function readLore(s, id) {
        if (s.lore[id]) return true;
        if (readLoreBlock(s, id)) return false;
        if (!loreOpen(s, id)) { s.inv.insight -= DECIPHER_COST; s.loreOpen[id] = true; }
        s.lore[id] = true;
        grantRank(s, 25);
        s.rev++;
        return true;
    }

    // —— Visitors (KeepService.refreshVisitors): up to 3 at the gate, a roll every 2 hours ——
    const VISITOR_EVERY = 2 * HOUR, MAX_VISITORS = 3, TRUST_MAX = 7;
    const trustStage = (t) => (t >= TRUST_MAX ? 'Bonded' : t >= 3 ? 'Trusted' : t >= 1 ? 'Acquainted' : 'Distant');
    const npcOf = (s, id) => (s.visitors.npc[id] = s.visitors.npc[id] || { trust: 0, met: false, cooldownUntil: 0, name: '', role: '', keepsake: false });
    function visitorEligible(s, c) {
        if (c.oneTime !== false && s.voices.done[c.id]) return false;
        if ((c.requiresLoreIds || []).some((id) => !loreOpen(s, id))) return false;
        if ((c.requiresFlags || []).some((f) => !s.voices.flags[f])) return false;
        if (c.minStorehouseLevel && (s.b.storehouse || 0) < c.minStorehouseLevel) return false;
        const n = s.visitors.npc[c.npcId];
        if (n && n.cooldownUntil > s.t) return false;
        return !s.visitors.active.some((a) => a.id === c.id || LORE().conversations.find((x) => x.id === a.id).npcId === c.npcId);
    }
    function rollVisitors(s) {
        if (s.visitors.active.length >= MAX_VISITORS) return;
        const r = rng('visit:' + Math.floor(s.t / VISITOR_EVERY));
        // Story beats come first, like the Keep's charter scenes; then weighted visitors.
        const pool = LORE().conversations.filter((c) => visitorEligible(s, c));
        if (!pool.length) return;
        const story = pool.find((c) => c.kind === 'STORY');
        let pick = story;
        if (!pick) {
            const w = pool.map((c) => (c.weight || 10) * (s.visitors.npc[c.npcId] && s.visitors.npc[c.npcId].met ? 3 : 1));
            let x = r() * w.reduce((a, b) => a + b, 0);
            pick = pool[pool.length - 1];
            for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) { pick = pool[i]; break; } }
        }
        s.visitors.active.push({ id: pick.id, at: s.t });
        FRESH.push(pick.npcName + ' is at the gate.');
        s.rev++;
    }
    const visitorsHere = (s) => s.visitors.active.map((a) => LORE().conversations.find((c) => c.id === a.id)).filter(Boolean);
    const voicesReady = visitorsHere;
    function choiceCost(ch) {
        const c = ka(ch.materialCosts || {});
        if (ch.timberCost) c.timber = (c.timber || 0) + ch.timberCost;
        return c;
    }
    function voiceBlock(s, convId, choiceId) {
        const c = visitorsHere(s).find((x) => x.id === convId);
        if (!c) return 'They have moved on.';
        const ch = (c.choices || []).find((x) => x.id === choiceId);
        if (!ch) return 'Unknown answer.';
        if (!canAfford(s, choiceCost(ch))) return 'Needs ' + Object.keys(choiceCost(ch)).map((k) => choiceCost(ch)[k] + ' ' + itemName(k)).join(', ') + '.';
        return '';
    }
    function chooseVoice(s, convId, choiceId) {
        if (voiceBlock(s, convId, choiceId)) return null;
        const c = visitorsHere(s).find((x) => x.id === convId), ch = c.choices.find((x) => x.id === choiceId);
        spend(s, choiceCost(ch));
        // A weighted outcome replaces the choice's own effects, as KeepService resolves it.
        let o = ch;
        if ((ch.outcomes || []).length) {
            const r = rng('voice:' + c.id + ':' + ch.id + ':' + s.seq++), tot = ch.outcomes.reduce((a, x) => a + (x.weight || 1), 0);
            let x = r() * tot;
            o = ch.outcomes[ch.outcomes.length - 1];
            for (const oc of ch.outcomes) { x -= oc.weight || 1; if (x <= 0) { o = oc; break; } }
        }
        const gains = ka(o.materialDeltas || {}), loss = {};
        if (o.timberDelta > 0) gains.timber = (gains.timber || 0) + o.timberDelta;
        if (o.timberDelta < 0) loss.timber = -o.timberDelta;
        Object.keys(gains).forEach((k) => { if (gains[k] < 0) { loss[k] = -gains[k]; delete gains[k]; } });
        add(s, gains);
        Object.keys(loss).forEach((k) => { s.inv[k] = Math.max(0, (s.inv[k] || 0) - loss[k]); });
        const n = npcOf(s, c.npcId);
        const before = n.trust;
        n.trust = Math.max(0, Math.min(TRUST_MAX, n.trust + (o.relationshipDelta != null ? o.relationshipDelta : ch.relationshipDelta || 0)));
        n.met = true; n.name = c.npcName; n.role = c.npcRole || ''; n.cooldownUntil = s.t + (c.cooldownHours || 6) * HOUR;
        if (o.flag || ch.flag) s.voices.flags[o.flag || ch.flag] = true;
        s.voices.done[c.id] = true;
        s.visitors.active = s.visitors.active.filter((a) => a.id !== c.id);
        const reply = o.response || ch.response || '';
        s.voices.log.unshift({ npc: c.npcName, npcId: c.npcId, prompt: c.prompt, said: ch.label, reply: reply, at: s.t, gains: gains, trust: n.trust - before });
        if (s.voices.log.length > 30) s.voices.log.length = 30;
        unlockLore(s, o.unlockLoreId || ch.unlockLoreId);
        add(s, { silver: 2 });
        grantRank(s, 25);
        keepEvent(s, 'CONVERSATION');
        maybeRequest(s, c.npcId);
        if (n.trust >= TRUST_MAX && !n.keepsake) { n.keepsake = true; add(s, { crowns: 100, relic: 1 }); FRESH.push(c.npcName + ' is Bonded to the Keep and leaves a keepsake: 100 Crowns and a relic.'); }
        s.rev++;
        return { reply: reply, gains: gains, loss: loss, trust: n.trust, delta: n.trust - before, stage: trustStage(n.trust) };
    }

    // —— Visitor requests: Dominion's quest layer on top of the Keep's visitors ——
    // A visitor you have met comes back with an errand. Trusted visitors pay half again, and
    // every delivery deepens trust, so the people at the gate become a reason to plan work.
    const REQUEST_POOL = [
        [0, 'timber', 40], [0, 'stone', 18], [0, 'provisions', 6], [0, 'fiber', 12], [0, 'produce', 8], [0, 'sunleaf', 10],
        [1, 'ember', 8], [1, 'frost', 8], [1, 'copper_bar', 3], [1, 'pine_plank', 5], [1, 'glass', 2], [1, 'linen', 3],
        [3, 'alloy', 2], [3, 'rations', 3], [3, 'herb_tonic', 2], [3, 'living_mortar', 1], [3, 'iron_bar', 3], [3, 'oak_plank', 4]
    ];
    const MAX_REQUESTS = 3, REQUEST_HOURS = 24;
    function maybeRequest(s, npcId) {
        const n = s.visitors.npc[npcId];
        if (!n || n.trust < 1 || s.requests.length >= MAX_REQUESTS || s.requests.some((q) => q.npc === npcId)) return;
        const r = rng('req:' + npcId + ':' + s.t);
        if (r() > 0.7) return;
        const pool = REQUEST_POOL.filter((p) => p[0] <= n.trust && RES[p[1]]);
        const p = pool[Math.floor(r() * pool.length)];
        const qty = Math.max(1, Math.round(p[2] * (1 + Math.min(1, n.trust / TRUST_MAX))));
        const mul = n.trust >= 3 ? 1.5 : 1;
        s.requests.push({ id: 'q' + s.t + npcId, npc: npcId, name: n.name, role: n.role, item: p[1], qty: qty,
            reward: { silver: Math.round((4 + qty / 2) * mul), crowns: Math.round((8 + 6 * p[0]) * mul) }, until: s.t + REQUEST_HOURS * HOUR });
        FRESH.push(n.name + ' asks for ' + qty + ' ' + itemName(p[1]) + '.');
    }
    function requestBlock(s, id) {
        const q = s.requests.find((x) => x.id === id);
        if (!q) return 'That request has lapsed.';
        if (fl(s.inv[q.item]) < q.qty) return 'Needs ' + q.qty + ' ' + itemName(q.item) + ' (you have ' + fl(s.inv[q.item]) + ').';
        return '';
    }
    function deliver(s, id) {
        if (requestBlock(s, id)) return null;
        const q = s.requests.find((x) => x.id === id);
        s.inv[q.item] -= q.qty;
        add(s, q.reward);
        const n = npcOf(s, q.npc);
        n.trust = Math.min(TRUST_MAX, n.trust + 1);
        s.requests = s.requests.filter((x) => x.id !== id);
        grantRank(s, 40);
        keepEvent(s, 'CONVERSATION');
        if (n.trust >= TRUST_MAX && !n.keepsake) { n.keepsake = true; add(s, { crowns: 100, relic: 1 }); FRESH.push(q.name + ' is Bonded to the Keep and leaves a keepsake: 100 Crowns and a relic.'); }
        logEvent(s, 'Delivered ' + q.qty + ' ' + itemName(q.item) + ' to ' + q.name + '.');
        s.rev++;
        return q;
    }

    // —— Enclave rapport (KeepEnclaveTaskCatalog): each resident's three-task ladder ——
    const RAPPORT_AT = [0, 5, 12, 22, 36, 55];
    const RAPPORT_NAMES = ['Newly arrived', 'Familiar', 'Trusted', 'Kindred', 'Sworn', 'Bonded'];
    const rapportLvl = (s, uid) => { const p = (s.rapport[uid] || 0); let l = 0; RAPPORT_AT.forEach((t, i) => { if (p >= t) l = i; }); return l; };
    function hashOf(t) { let h = 0; for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0; return h; }
    function residentTasks(uid) {
        const T = (window.DOMINION_KEEP && window.DOMINION_KEEP.enclaveTasks) || { elements: {}, bond: [] };
        const el = C(uid).EL, name = C(uid).name;
        const ladder = (T.elements[el] || T.elements.NEUTRAL || []).slice();
        if (T.bond.length) ladder.push(T.bond[((hashOf(C(uid).speciesId) % T.bond.length) + T.bond.length) % T.bond.length]);
        return ladder.map((t) => Object.assign({}, t, { name: t.name.replace(/\{name\}/g, name), description: t.description.replace(/\{name\}/g, name) }));
    }
    // Every resident at home watches what the Keep does; a task fills when its kind of work happens.
    function keepEvent(s, type, n) {
        joinedIds(s).forEach((uid) => {
            if (onExpedition(s, uid)) return;
            residentTasks(uid).forEach((t) => {
                if (t.event !== type) return;
                const p = (s.tasks[uid] = s.tasks[uid] || {});
                p[t.id] = Math.min(t.goal, (p[t.id] || 0) + (n || 1));
            });
        });
    }
    function bankTask(s, uid, taskId) {
        const t = residentTasks(uid).find((x) => x.id === taskId), p = s.tasks[uid] || {};
        if (!t || (p[taskId] || 0) < t.goal) return null;
        const before = rapportLvl(s, uid);
        p[taskId] = 0;
        s.rapport[uid] = (s.rapport[uid] || 0) + t.rapport;
        add(s, { silver: Math.round(t.gold / 10), crowns: Math.round(t.remnants / 4) });
        grantBond(s, uid, t.rapport * 2);
        if (rapportLvl(s, uid) > before) FRESH.push(C(uid).name + ' is now ' + RAPPORT_NAMES[rapportLvl(s, uid)] + ': +' + 10 * rapportLvl(s, uid) + '% to everything they help with.');
        s.rev++;
        return t;
    }

    // —— Collecting (KeepService): rooms fill their own stores; the Knight carries it in ——
    const STORE_HOURS = 8;
    function produce(s, id, rates, h) {
        const st = (s.stored[id] = s.stored[id] || {});
        Object.keys(rates).forEach((k) => {
            if (!(rates[k] > 0)) return;
            const cap = Math.max(st[k] || 0, rates[k] * STORE_HOURS * (1 + 0.25 * (s.b.storehouse || 0)) * (s.annex[id] ? 1.5 : 1));
            st[k] = Math.min(cap, (st[k] || 0) + rates[k] * h);
        });
    }
    const storedOf = (s, id) => s.stored[id] || {};
    const storedCount = (s, id) => Object.keys(storedOf(s, id)).reduce((a, k) => a + fl(storedOf(s, id)[k]), 0);
    function storeFill(s, id) {
        const rates = id === 'woodlot' ? { timber: woodlotRate(s) } : workshopRates(s, id), st = storedOf(s, id);
        const k = Object.keys(rates).find((x) => rates[x] > 0) || Object.keys(st)[0];
        if (!k) return 0;
        const cap = (rates[k] || 0) * STORE_HOURS * (1 + 0.25 * (s.b.storehouse || 0)) * (s.annex[id] ? 1.5 : 1);
        return cap > 0 ? Math.min(1, (st[k] || 0) / cap) : 0;
    }
    function collect(s, id) {
        const st = storedOf(s, id), got = {};
        Object.keys(st).forEach((k) => {
            let n = Math.floor(st[k]);
            if (k === 'timber') n = Math.min(n, Math.max(0, Math.floor(timberCap(s) - s.inv.timber)));
            if (n <= 0) return;
            st[k] -= n;
            got[k] = n;
        });
        if (!Object.keys(got).length) return null;
        add(s, got);
        grantRank(s, 5);
        if (id === 'woodlot') {
            s.knight.counts.woodlotCollect = (s.knight.counts.woodlotCollect || 0) + 1;
            if (s.knight.counts.woodlotCollect === 1) unlockLore(s, 'letter_forester_maren');
            if (s.knight.counts.woodlotCollect >= 3) unlockLore(s, 'memorabilia_petrified_root');
            keepEvent(s, 'TIMBER_COLLECTION');
        } else keepEvent(s, 'MATERIAL_COLLECTION');
        s.rev++;
        return got;
    }
    function collectAll(s) {
        const got = {};
        ['woodlot'].concat(Object.keys(WS)).forEach((id) => { const g = collect(s, id); if (g) Object.keys(g).forEach((k) => { got[k] = (got[k] || 0) + g[k]; }); });
        return got;
    }

    // —— Decorations: crafted pieces can be displayed in their room or stored ——
    function placeDecoration(s, id, on) {
        const k = KEEP_CRAFTS[id];
        if (!k || k[1] !== 'DECORATION' || !s.crafted[id]) return false;
        const first = on && !s.placedEver[id];
        s.placed[id] = !!on;
        if (first) { s.placedEver[id] = true; keepEvent(s, 'DECORATION'); }
        s.rev++;
        return true;
    }

    // —— The Keeper's Journey: each Knight Rank pays a one-time reward ——
    const journeyReward = (lvl) => ({ silver: 5 * lvl, crowns: 10 * lvl });
    function claimJourney(s, lvl) {
        if (lvl > rankLvl(s) || lvl < 2 || s.claims['rank_' + lvl]) return false;
        s.claims['rank_' + lvl] = true;
        add(s, journeyReward(lvl));
        s.rev++;
        return true;
    }

    // —— Rebirth (KeepRebirth): reset the Keep for permanent production, storage and speed ——
    function rebirthReq(s) {
        const n = rebirths(s) + 1;
        if (n > 10) return null;
        const step = REBIRTH_LADDER[n - 1];
        return { n: n, hall: Math.max(2, Math.min(8, n + 1)), checks: step[0], cost: scaleCost(s, ka(step[1])) };
    }
    function checkMet(s, chk) {
        const [k, v] = chk.split(':'), n = +v || 0;
        if (k === 'enclave') return true;
        if (k === 'workshops_built') return Object.keys(WS).filter((w) => wsBuilt(s, w)).length >= (n || 6);
        if (k === 'builders_yard') return !!s.b.yard;
        if (k === 'storehouse') return (s.b.storehouse || 0) >= n;
        if (k === 'workshops_l2') return Object.keys(WS).filter((w) => (s.wsl[w] || 0) >= 2).length >= n;
        if (k === 'akhars_front') return (s.b.front || 0) >= n;
        if (k === 'annexes') return Object.keys(s.annex).filter((w) => s.annex[w]).length >= n;
        if (k === 'keeper_level') return rankLvl(s) >= n;
        return false;
    }
    const checkText = (chk) => { const [k, v] = chk.split(':'); return ({ enclave: 'Enclave', builders_yard: 'Builder’s Yard', storehouse: 'Storehouse ' + v, workshops_built: 'All six workshops', workshops_l2: v + ' expanded workshops', akhars_front: 'Akhar’s Wall ' + v, annexes: v + ' storage annexes', keeper_level: 'Knight Rank ' + v })[k] || chk; };
    function rebirthBlock(s) {
        const r = rebirthReq(s);
        if (!r) return 'The Keep has been reborn ten times.';
        if (s.b.hall < r.hall) return 'Needs ' + HALL_RANKS[r.hall - 1] + ' (Hall ' + r.hall + ').';
        const miss = r.checks.filter((c) => !checkMet(s, c));
        if (miss.length) return 'Needs ' + miss.map(checkText).join(', ') + '.';
        if (s.builds.length) return 'Finish construction first.';
        if (!canAfford(s, r.cost)) return 'Missing materials for the rebirth.';
        return '';
    }
    function rebirth(s) {
        if (rebirthBlock(s)) return false;
        const r = rebirthReq(s);
        spend(s, r.cost);
        s.rebirths = r.n;
        // Rapport, lore, voices, crafts and the Knight carry over; the Keep's buildings start again.
        s.b.hall = 1; s.b.woodlot = 1; s.b.storehouse = 0; s.b.yard = 0; s.b.front = 0;
        Object.keys(WS).forEach((w) => { s.wsl[w] = s.wsl[w] ? 1 : 0; s.annex[w] = false; });
        s.inv.timber = Math.max(s.inv.timber, 80 + 120 * r.n);
        RAW.forEach((k) => { s.inv[k] = 0; });
        Object.keys(s.comps).forEach((id) => { if (s.comps[id].job.kind === 'front') s.comps[id].job = { kind: 'rest' }; });
        logEvent(s, 'The Keep was reborn: ' + REBIRTH_TITLES[r.n] + '.');
        FRESH.push('Rebirth ' + r.n + ': ' + REBIRTH_TITLES[r.n] + '. Keep production +' + 25 * r.n + '%.');
        s.rev++;
        return true;
    }

    // —— War Room loadouts (Chronicles): save and re-apply gear sets ——
    const loadoutSlots = (s) => (s.wings && s.wings.war_room) || 0;
    function saveLoadout(s, i) { if (i >= loadoutSlots(s)) return false; s.loadouts[i] = { equip: Object.assign({}, s.knight.equip), tool: s.knight.tool, party: s.prep.party.slice(), rune: s.prep.rune }; s.rev++; return true; }
    function applyLoadout(s, i) {
        const l = s.loadouts[i];
        if (!l || knightBusy(s)) return false;
        SLOTS.forEach((sl) => { const id = l.equip[sl[0]]; s.knight.equip[sl[0]] = id && fl(s.inv[id]) > 0 ? id : (sl[0] === 'weapon' ? s.knight.equip.weapon : null); });
        if (fl(s.inv[l.tool]) > 0) s.knight.tool = l.tool;
        s.prep.party = l.party.filter((id) => s.comps[id] && s.comps[id].joined);
        s.prep.rune = l.rune || '';
        s.rev++;
        return true;
    }

    // —— Expeditions ——
    function needProvisions(s, dest) { return DEST[dest] ? Math.max(0, DEST[dest].provisions - (s.b.hall >= 2 ? 1 : 0)) : 0; }
    function tripMs(s, dest) {
        const cut = Math.min(0.3, bonusLvl(s, 'pathfinding') * 0.004) + gearStats(s).roadCut;
        return Math.round((DEST[dest] ? DEST[dest].hours : 8) * HOUR * Math.max(0.5, 1 - cut));
    }
    const supplyCap = (s) => 20 + 4 * ((s.wings && s.wings.stable) || 0);
    function packPlan(s) {
        const need = needProvisions(s, s.prep.dest);
        const rations = s.prep.useRations ? Math.min(fl(s.inv.rations), need) : 0;
        return { need: need, rations: rations, provisions: need - rations };
    }
    const prepParty = (s) => s.prep.party.filter((id) => s.comps[id] && s.comps[id].joined).slice(0, partySlots(s));
    const POTIONS = () => Object.keys(RES).filter((k) => RES[k].kind === 'POTION');
    function prepPotions(s) {
        const out = {};
        let room = supplyCap(s);
        Object.keys(s.prep.potions || {}).forEach((k) => { const n = Math.min(fl(s.inv[k]), s.prep.potions[k] | 0, room); if (n > 0) { out[k] = n; room -= n; } });
        return out;
    }
    function departBlock(s) {
        const d = DEST[s.prep.dest];
        if (s.exp) return 'The Knight is already on an expedition.';
        if (!d || d.planned) return 'This destination is planned content.';
        const b = destBlock(s, s.prep.dest);
        if (b) return b;
        const p = packPlan(s);
        if (fl(s.inv.provisions) < p.provisions) return 'Pack ' + p.provisions + ' Provisions to depart (you have ' + fl(s.inv.provisions) + ').';
        return '';
    }
    function context(s, party, dest) {
        const w = weaponItem(s), g = gearStats(s);
        const rune = s.prep.rune && fl(s.inv[s.prep.rune]) > 0 ? s.prep.rune : '';
        return {
            dest: dest, weapon: w.weaponType || 'sword', weaponId: s.knight.equip.weapon, tier: w.tier || 0, tool: RES[s.knight.tool] ? s.knight.tool : '',
            party: party, hazard: s.runs % 2 ? 'frost' : 'ember', armor: g.armor, crit: g.crit, rest: g.rest + 0.02 * ((s.wings && s.wings.stable) || 0), heat: g.heat, wards: g.wards, rune: rune,
            skills: { woodcutting: skillLvl(s, 'woodcutting'), mining: skillLvl(s, 'mining'), studies: skillLvl(s, 'elemental_studies'),
                survival: bonusLvl(s, 'survival'), cartography: bonusLvl(s, 'cartography'), taming: bonusLvl(s, 'taming') },
            profLvl: profLvl(s, w.weaponType || 'sword')
        };
    }
    function depart(s) {
        if (departBlock(s)) return false;
        const d = DEST[s.prep.dest], p = packPlan(s);
        s.inv.provisions = Math.max(0, s.inv.provisions - p.provisions);
        s.inv.rations = Math.max(0, s.inv.rations - p.rations);
        const potions = prepPotions(s);
        Object.keys(potions).forEach((k) => { s.inv[k] = Math.max(0, s.inv[k] - potions[k]); });
        s.seq++;
        const ms = tripMs(s, s.prep.dest);
        const x = context(s, prepParty(s), s.prep.dest);
        if (x.rune) s.inv[x.rune] = Math.max(0, s.inv[x.rune] - 1);
        s.exp = Object.assign(x, { id: 'x' + s.seq + '-' + s.t, startAt: s.t, endAt: s.t + ms, rations: p.rations, potions: potions });
        logEvent(s, 'The Knight left for ' + d.name + ' with ' + (s.exp.party.length ? s.exp.party.map((id) => C(id).name).join(', ') : 'no companions') + '.');
        s.rev++;
        return true;
    }
    // A Legendary Bond Trial is a solo journey with one Bond 100 companion (Chronicles' trial).
    const TRIAL_HOURS = 8;
    function trialBlock(s, uid) {
        const c = s.comps[uid];
        if (!c || !c.joined) return 'Not in your roster.';
        if (c.legend) return C(uid).name + ' is already Legendary.';
        if (bondLvl(c) < 100) return 'Needs Bond 100 (now ' + bondLvl(c) + ').';
        if (s.exp) return 'The Knight is away.';
        return '';
    }
    function startTrial(s, uid) {
        if (trialBlock(s, uid)) return false;
        s.seq++;
        s.exp = Object.assign(context(s, [uid], 'trial'), { id: 'x' + s.seq + '-' + s.t, trial: uid, startAt: s.t, endAt: s.t + TRIAL_HOURS * HOUR, rations: 0, potions: {}, rune: '' });
        logEvent(s, 'The Knight and ' + C(uid).name + ' set out on a Legendary Bond Trial.');
        s.rev++;
        return true;
    }

    const RUNE_HAZARD = { rune_embers: ['heat', 'ember'], rune_frost: ['frost', 'tide'], rune_gales: ['storm', 'maze'], rune_stone_skin: ['forge', 'rubble'] };
    const HAZARD_INFO = {
        ember: { title: 'Ember vents', el: 'FIRE', gain: { ember: 2, ember_shard: 1 } },
        frost: { title: 'Frost mist', el: 'ICE', gain: { frost: 2 } },
        heat: { title: 'Volcanic heat', el: 'FIRE', gain: { ember_shard: 2 } },
        storm: { title: 'Lightning storm', el: 'ELECTRIC', gain: { storm_glass: 1, storm: 2 } },
        tide: { title: 'Flooding tide', el: 'WATER', gain: { tide_pearl: 1 } },
        forge: { title: 'Forge-waste fumes', el: 'METAL', gain: { living_alloy: 1 } }
    };
    // One function both previews encounters on the prep screen and resolves them on
    // return, so what the player is shown is exactly what will happen.
    function encounter(id, x, s) {
        const d = DEST[x.dest] || {};
        const pick = (pred) => x.party.find((u) => s.comps[u] && pred(C(u)));
        const nm = (u) => C(u).name;
        const pm = 1 + 0.15 * (x.profLvl - 1) + 0.2 * x.tier;
        const r = { id: id, status: 'ok', by: '', title: '', text: '', need: '', gain: {}, loss: 0, bondMul: 1, xp: {}, disc: null, hazard: false };
        const hazard = (kind) => {
            const h = HAZARD_INFO[kind];
            r.title = h.title; r.need = 'Staff'; r.hazard = true;
            const helper = pick((c) => c.EL === h.el);
            const runed = x.rune && (RUNE_HAZARD[x.rune] || []).includes(kind);
            if (x.weapon === 'staff') {
                r.by = 'Staff'; r.gain = {};
                Object.keys(h.gain).forEach((k) => { r.gain[k] = Math.round(h.gain[k] * pm); });
                r.gain['essence_' + h.el.toLowerCase()] = 1;
                r.text = 'Your staff calmed the ' + h.title.toLowerCase() + ' and drew its power into the pack.';
            } else if (helper || (kind === 'ember' || kind === 'heat') && x.heat || x.wards[kind] || runed) {
                r.status = 'part'; r.by = helper ? nm(helper) : runed ? RES[x.rune].name : 'warded gear';
                r.text = 'The ' + (helper ? nm(helper) : r.by) + ' led the party safely through, but nothing was harvested.';
            } else if (x.skills.studies >= 8) {
                r.status = 'part'; r.by = 'Ward Script'; r.text = 'Ward Script carried the party through the hazard.';
            } else { r.status = 'miss'; r.loss = 0.2; r.text = 'The party detoured around the ' + h.title.toLowerCase() + ' and lost supplies.'; }
        };
        switch (id) {
        case 'pack': {
            r.title = 'Raiders at the pack'; r.need = 'Sword';
            const g = pick((c) => c.cls === 'Guardian' || c.EL === 'FIRE');
            if (x.weapon === 'sword') { r.by = 'Sword'; r.text = 'Your sword held the raiders away from the pack. Nothing was lost.'; }
            else if (g) { r.status = 'part'; r.by = nm(g); r.loss = 0.1; r.text = nm(g) + ' stood over the supplies and scattered them, but a few bundles were torn open.'; }
            else if (x.weapon === 'daggers') { r.status = 'part'; r.by = 'Daggers'; r.loss = 0.1; r.text = 'Your daggers struck first and the raiders fled with only a little.'; }
            else { r.status = 'miss'; r.loss = 0.25; r.text = 'Raiders tore into the pack. A quarter of the haul was lost.'; }
            break;
        }
        case 'ambush': {
            r.title = 'Ambush on the companions'; r.need = 'Spear';
            const g = pick((c) => c.EL === 'LIGHT' || c.EL === 'SHADOW');
            if (!x.party.length) { r.status = 'skip'; r.text = 'No companions travelled, so there was no one to ambush.'; }
            else if (x.weapon === 'spear') { r.by = 'Spear'; r.text = 'Your spear kept the pack at bay and the party together.'; }
            else if (x.wards.ambush || g) { r.status = 'part'; r.by = g ? nm(g) : 'Dawn Lantern'; r.bondMul = 0.85; r.text = 'The ' + r.by + ' showed the ambush early. The party scattered only briefly.'; }
            else if (x.weapon === 'daggers') { r.status = 'part'; r.by = 'Daggers'; r.bondMul = 0.85; r.text = 'Your daggers broke the ambush, but the party was shaken.'; }
            else { r.status = 'miss'; r.bondMul = 0.6; r.text = 'The companions were scattered and spent the night regrouping. Bonds grew less.'; }
            break;
        }
        case 'trail': {
            r.title = 'Game trail'; r.need = 'Bow';
            const w = pick((c) => c.EL === 'WIND');
            if (x.weapon === 'bow') {
                r.by = 'Bow'; r.gain = { produce: Math.round(4 * pm), fiber: Math.round(3 * pm), minnow: 2 };
                r.text = 'Your bow brought down game along the trail.';
                if (x.dest === 'rootwild' && !s.disc.fawny && !(s.comps.fawny && s.comps.fawny.joined)) { r.disc = 'fawny'; r.text += ' Scouting ahead, you found small hoofprints in the frost. Fawny followed you home.'; }
            } else if (w) { r.status = 'part'; r.by = nm(w); r.gain = { produce: 2, fiber: 1 }; r.text = nm(w) + ' ranged ahead and turned up a little game.'; }
            else { r.status = 'miss'; r.text = 'The game slipped away before anyone got close.'; }
            break;
        }
        case 'ironwood':
            r.title = 'Fallen ironwood'; r.need = 'Woodaxe';
            if (x.tool === 'woodaxe') {
                r.by = 'Woodaxe'; r.gain = { timber: 20 * (x.skills.woodcutting >= 10 ? 2 : 1), oak_log: 2 }; r.xp = { woodcutting: 40 };
                r.text = 'Your woodaxe split a fallen ironwood into Timber' + (x.skills.woodcutting >= 10 ? ' (Ironwood Eye doubled it).' : '.');
            } else { r.status = 'part'; r.gain = { timber: 4 }; r.text = 'Without a woodaxe only loose branches came home.'; }
            break;
        case 'grove': {
            r.title = 'Hidden grove'; r.need = 'an Earth Siegeling';
            const e = pick((c) => c.EL === 'EARTH');
            if (e) {
                r.by = nm(e); r.gain = { timber: 15, fiber: 6, sunleaf: 4 };
                if (bondLvl(s.comps[e]) >= 5) r.gain.produce = 3;
                r.text = nm(e) + ' found a hidden grove.';
            } else { r.status = 'miss'; r.text = 'A grove went unnoticed. An earth Siegeling might have sensed it.'; }
            break;
        }
        case 'rubble':
            r.title = 'Collapsed gallery'; r.need = 'Hammer';
            if (x.weapon === 'hammer') { r.by = 'Hammer'; r.gain = { stone: Math.round(15 * pm), relic: 1, fossil: 2 }; r.text = 'Your hammer broke through the collapsed gallery.'; }
            else if (x.rune === 'rune_stone_skin') { r.status = 'part'; r.by = 'Rune of Stoneskin'; r.text = 'The Rune of Stoneskin let the party squeeze past the rubble.'; }
            else { r.status = 'miss'; r.loss = 0.1; r.text = 'The party took the long way round and dropped some of the haul.'; }
            break;
        case 'hazard': hazard(x.hazard); break;
        case 'hazard_heat': hazard('heat'); break;
        case 'hazard_storm': hazard('storm'); break;
        case 'hazard_tide': hazard('tide'); break;
        case 'hazard_forge': hazard('forge'); break;
        case 'maze':
            r.title = 'Shifting maze'; r.need = 'Cartography 10'; r.hazard = true;
            if (x.skills.cartography >= 10) { r.by = 'Cartography'; r.text = 'Your maps led straight through the maze.'; }
            else if (x.rune === 'rune_gales') { r.status = 'part'; r.by = 'Rune of Gales'; r.text = 'The Rune of Gales found a draught to follow.'; }
            else { r.status = 'miss'; r.loss = 0.15; r.text = 'The party wandered the maze for hours and dropped supplies.'; }
            break;
        case 'seam':
            r.title = 'Copper seam'; r.need = 'Pickaxe';
            if (x.tool === 'pickaxe') {
                r.by = 'Pickaxe'; r.gain = { ore: 15 * (x.skills.mining >= 10 ? 2 : 1), iron_ore: 2 }; r.xp = { mining: 40 };
                r.text = 'Your pickaxe opened a copper seam' + (x.skills.mining >= 10 ? ' (Seam Reader doubled it).' : '.');
            } else { r.status = 'part'; r.gain = { ore: 3 }; r.text = 'Without a pickaxe only a few loose nuggets came home.'; }
            break;
        case 'sealed': {
            r.title = 'Sealed door'; r.need = 'Hammer';
            const spot = pick((c) => c.EL === 'ICE' || c.EL === 'PSYCHIC');
            if (x.weapon === 'hammer') {
                r.by = 'Hammer'; r.gain = { relic: 2, rune_stone: 2 }; r.text = 'Your hammer broke the seal.';
                if (x.dest === 'ruins' && !s.disc.vaultMap) { r.disc = 'vaultMap'; r.text += ' Behind the door lay the Sealed Vault Map.'; }
            } else if (spot) { r.status = 'part'; r.by = nm(spot); r.text = nm(spot) + ' noticed a draft under a sealed door. A hammer could open it.'; }
            else { r.status = 'miss'; r.text = 'A sealed door blocked a side hall. A hammer could open it.'; }
            break;
        }
        case 'elite': {
            const need = d.levelMax || 10, power = partyPower(s, x);
            r.title = 'Elite ' + titleCase(d.element || 'wild') + ' Siegeling'; r.need = 'party power ' + need;
            if (power >= need) { r.by = 'Power ' + power; r.gain = { ['essence_' + (d.element || 'EARTH').toLowerCase()]: 1 }; r.text = 'The party outmatched an elite Siegeling and drove it off.'; }
            else { r.status = 'miss'; r.loss = 0.15; r.text = 'An elite Siegeling forced the party to retreat (power ' + power + ' of ' + need + ').'; }
            break;
        }
        case 'boss': {
            const lvl = d.bossLevel || 20, power = partyPower(s, x), boss = SPECIES[d.bossId];
            r.title = (boss ? boss.name : titleCase(d.bossId || 'Boss')) + ', level ' + lvl; r.need = 'party power ' + Math.ceil(lvl * 1.2);
            if (power >= lvl * 1.2) { r.by = 'Power ' + power; r.gain = { ancient_relic: 1, relic: 3, ['essence_' + (d.element || 'EARTH').toLowerCase()]: 3 }; r.text = 'The party defeated ' + (boss ? boss.name : 'the boss') + '.'; }
            else if (power >= lvl * 0.8) { r.status = 'part'; r.by = 'Power ' + power; r.loss = 0.1; r.text = 'The party held off ' + (boss ? boss.name : 'the boss') + ' and withdrew in order.'; }
            else { r.status = 'miss'; r.loss = 0.3; r.text = (boss ? boss.name : 'The boss') + ' routed the party (power ' + power + ' of ' + Math.ceil(lvl * 1.2) + ').'; }
            break;
        }
        default:
            if (id.indexOf('twist:') === 0) {
                const t = (CH.twists || {})[id.slice(6)] || { name: titleCase(id.slice(6)), text: '', wards: [] };
                const ward = pick((c) => (t.wards || []).includes(c.EL));
                r.title = 'Twist: ' + t.name; r.need = (t.wards || []).map(titleCase).join(' or ') + ' Siegeling' + (t.relicWard ? ', or ' + itemName(t.relicWard) : '');
                if (ward || x.wards[t.id]) { r.by = ward ? nm(ward) : itemName(t.relicWard); r.text = 'The ' + r.by + ' warded off the ' + t.name.toLowerCase() + '.'; }
                else { r.status = 'miss'; r.loss = 0.1; r.text = t.text; }
            }
        }
        return r;
    }
    const previewContext = (s) => context(s, prepParty(s), s.prep.dest);

    function rollLoot(d, seed, mul) {
        const out = {};
        if (!d.lootTable || !d.lootTable.length) { Object.keys(d.loot).forEach((k) => { out[k] = Math.round(d.loot[k] * mul); }); return out; }
        const rand = rng(seed);
        const rolls = Math.max(1, Math.round(d.encounters.length * 0.8));
        for (let i = 0; i < rolls; i++) {
            d.lootTable.forEach((l) => {
                if (rand() < l.chance) { const n = l.min + Math.floor(rand() * (l.max - l.min + 1)); out[al(l.item)] = (out[al(l.item)] || 0) + n; }
            });
        }
        Object.keys(out).forEach((k) => { out[k] = Math.round(out[k] * mul); });
        return out;
    }
    function rollSighting(s, x, d, okN) {
        if (!d || !d.sighting || !d.element) return null;
        const rand = rng(x.id + ':sighting');
        const chance = d.sighting * (x.weapon === 'bow' ? 1.5 : 1) * (1 + okN * 0.05);
        if (rand() >= chance) return null;
        const pool = Object.keys(SPECIES).filter((k) => SPECIES[k].element === d.element && SPECIES[k].stage === 1);
        if (!pool.length) return null;
        // Rarer species surface on higher-tier roads.
        const weight = (sp) => ({ COMMON: 6, UNCOMMON: 3 + (d.tier || 0), RARE: 1 + (d.tier || 0), EPIC: Math.max(0, (d.tier || 0) - 1), LEGENDARY: Math.max(0, (d.tier || 0) - 2) })[sp.rarity] || 1;
        const total = pool.reduce((a, k) => a + weight(SPECIES[k]), 0);
        let roll = rand() * total, chosen = pool[0];
        for (const k of pool) { roll -= weight(SPECIES[k]); if (roll <= 0) { chosen = k; break; } }
        return { id: x.id + '-s', species: chosen, foundAt: x.endAt, expiresAt: x.endAt + ((CH.realm && CH.realm.tamingExpiryMs) || 48 * HOUR), route: x.dest, tier: d.tier || 1 };
    }

    function finishExpedition(s) {
        const x = s.exp;
        s.exp = null;
        // The id ledger is the duplicate-reward guard: a resolved journey can never pay twice.
        if (s.done[x.id]) return;
        s.done[x.id] = true;
        if (x.trial) return finishTrial(s, x);
        if (x.operation) return finishOperation(s, x);
        s.runs++;
        const d = DEST[x.dest];
        const lines = d.encounters.map((id) => encounter(id, x, s));
        let loss = 0, bondMul = 1, hazards = 0;
        const gains = {}, xp = {}, discs = [];
        lines.forEach((r) => {
            loss += r.hazard ? r.loss * (1 - Math.min(0.6, x.skills.survival * 0.01)) : r.loss;
            bondMul *= r.bondMul;
            if (r.hazard) hazards++;
            Object.keys(r.gain).forEach((k) => { gains[k] = (gains[k] || 0) + r.gain[k]; });
            Object.keys(r.xp).forEach((k) => { xp[k] = (xp[k] || 0) + r.xp[k]; });
            if (r.disc) discs.push(r.disc);
        });
        loss *= 1 - Math.min(0.5, x.armor * 0.02);
        if (x.rune === 'rune_warding') loss = Math.max(0, loss - 0.06);
        // Potions patch up after a bad encounter: each point of healing trims the losses.
        const heal = Object.keys(x.potions || {}).reduce((a, k) => a + (RES[k].healPct || 0.3) * x.potions[k], 0);
        loss = Math.max(0, loss - heal * 0.15);
        const okN = lines.filter((r) => r.status === 'ok').length;
        const lootMul = Math.max(0.4, 1 - loss) + 0.05 * x.rations + x.skills.cartography * 0.003 + x.crit;
        const total = rollLoot(d, x.id + ':loot', lootMul);
        Object.keys(gains).forEach((k) => { total[k] = (total[k] || 0) + gains[k]; });
        // Essences: the road's element, plus one for each companion's element.
        const ess = 'essence_' + d.element.toLowerCase();
        total[ess] = (total[ess] || 0) + 2;
        x.party.forEach((id) => { const e = 'essence_' + C(id).el; total[e] = (total[e] || 0) + 1; });
        const avgLevel = d.levelMin ? (d.levelMin + d.levelMax) / 2 : 2 + (d.hours || 4) / 4;
        total.crowns = (total.crowns || 0) + Math.round(((CH.realm && CH.realm.crownsPerLevel) || 2) * avgLevel * okN);
        add(s, total);
        const minutes = Math.round((x.endAt - x.startAt) / MIN);
        // Same sources Chronicles uses for road skills (ChroniclesService rewards).
        if (x.tool && RES[x.tool]) xp[RES[x.tool].tool] = (xp[RES[x.tool].tool] || 0) + d.xp;
        xp.command = (xp.command || 0) + okN * 15 + (x.party.length ? minutes / 2 : 0);
        xp.pathfinding = (xp.pathfinding || 0) + minutes;
        if (hazards) xp.survival = (xp.survival || 0) + hazards * 10;
        xp.cartography = (xp.cartography || 0) + lines.length * 5;
        if (okN) xp.class_tactics = (xp.class_tactics || 0) + okN * 4;
        const gained = {};
        Object.keys(xp).forEach((k) => { const before = s.knight.skills[k] || 0; grantSkill(s, k, xp[k]); const g = (s.knight.skills[k] || 0) - before; if (g > 0) gained[k] = Math.round(g); });
        const prof = Math.round(d.prof * (s.b.hall >= 2 ? 1.25 : 1));
        const pb = profLvl(s, x.weapon);
        s.knight.prof[x.weapon] = (s.knight.prof[x.weapon] || 0) + prof;
        levelUp(s, WEAPONS[x.weapon].name + ' proficiency', pb, profLvl(s, x.weapon), true);
        grantRank(s, minutes * 2);
        grantAffinity(s, d.element, okN * 4 + 12);
        const bonds = {}, levels = {};
        x.party.forEach((id) => {
            const c = s.comps[id];
            if (!c) return;
            const raw = (d.bond + 10 * okN) * bondMul * (x.weapon === 'spear' ? 1.5 : 1) * (1 + x.rest) + 2 * x.rations;
            bonds[id] = Math.round(grantBond(s, id, raw));
            grantAffinity(s, C(id).EL, okN * 12);
            grantMastery(s, C(id).cls, okN * 12);
            const before = compLevel(c);
            c.xp = (c.xp || 0) + okN * ((d.levelMax || 4) * 6) + 20;
            const cap = companionXpFor(C(id).cap);
            if (c.xp > cap) c.xp = cap;
            if (compLevel(c) > before) { levels[id] = compLevel(c); if (compLevel(c) >= C(id).cap && C(id).to) FRESH.push(C(id).name + ' can evolve.'); }
        });
        discs.forEach((k) => {
            s.disc[k] = true;
            if (k === 'fawny') { const f = s.comps.fawny || {}; s.comps.fawny = Object.assign({ species: 'fawny', nick: '', explore: 0, treats: { day: '', n: 0 }, xp: 0, legend: false }, f, { joined: true, job: { kind: 'rest' }, bond: Math.max(f.bond || 0, 20) }); }
        });
        const sighting = rollSighting(s, x, d, okN);
        if (sighting) {
            s.sightings = (s.sightings || []).filter((v) => v.expiresAt > s.t);
            const max = (CH.realm && CH.realm.maxPendingTamings) || 3;
            if (s.sightings.length >= max) s.sightings.shift();
            s.sightings.push(sighting);
        }
        const ok = lines.filter((r) => r.status === 'ok').map((r) => r.text.split('. ')[0].replace(/\.$/, '') + '.');
        const gotWhat = Object.keys(total).filter((k) => total[k] > 0).slice(0, 4).map(itemName);
        const summary = ok.slice(0, 2).join(' ') + ' You returned with ' + gotWhat.join(', ') + ', ' + WEAPONS[x.weapon].name.toLowerCase() + ' proficiency' + (x.party.length ? ', and stronger bonds.' : '.');
        const resumed = [];
        if (s.knight.task.kind !== 'idle') resumed.push('Knight: ' + taskLabel(s));
        x.party.forEach((id) => { if (s.comps[id]) resumed.push(C(id).name + ': ' + jobLabel(s, id)); });
        pushReport(s, {
            id: x.id, dest: x.dest, at: x.endAt, seen: false, weapon: x.weapon, weaponId: x.weaponId, tool: x.tool, party: x.party, rations: x.rations,
            lines: lines.filter((r) => r.status !== 'skip').map((r) => ({ status: r.status, title: r.title, by: r.by, text: r.text, need: r.need })),
            total: total, xp: gained, prof: prof, bonds: bonds, levels: levels, discs: discs, sighting: sighting, summary: summary, resumed: resumed,
            lootPct: Math.round(lootMul * 100), minutes: minutes, rune: x.rune, potions: x.potions
        });
        logEvent(s, 'Returned from ' + d.name + '.');
        FRESH.push('The Knight returned from ' + d.name + '. Report ready.');
        s.rev++;
    }
    function pushReport(s, rep) {
        s.reports.unshift(rep);
        if (s.reports.length > 12) s.reports.length = 12;
    }
    function finishTrial(s, x) {
        const uid = x.trial, c = s.comps[uid];
        if (!c) return;
        // Level 20, or the form's cap for base forms that stop at 10.
        const need = Math.min(20, C(uid).cap), lvl = compLevel(c), ok = lvl >= need;
        if (ok) { c.legend = true; grantBond(s, uid, 50); }
        grantRank(s, TRIAL_HOURS * 60);
        pushReport(s, {
            id: x.id, dest: 'trial', trial: uid, at: x.endAt, seen: false, weapon: x.weapon, weaponId: x.weaponId, tool: '', party: [uid], rations: 0,
            lines: [{ status: ok ? 'ok' : 'miss', title: 'Legendary Bond Trial', by: ok ? C(uid).name : '', need: 'level ' + need,
                text: ok ? C(uid).name + ' and the Knight fought as one. ' + C(uid).name + ' is now Legendary: +5 party power and +5% at any post.' : C(uid).name + ' was not ready (level ' + lvl + ' of ' + need + '). The trial can be tried again.' }],
            total: {}, xp: {}, prof: 0, bonds: {}, levels: {}, discs: [], summary: ok ? C(uid).name + ' became Legendary.' : 'The trial ended without a bond-forged victory.', resumed: [], lootPct: 100, minutes: TRIAL_HOURS * 60
        });
        FRESH.push(ok ? C(uid).name + ' is now Legendary.' : 'The Bond Trial failed. Try again at level ' + need + '.');
        s.rev++;
    }

    function jobLabel(s, id) {
        const j = s.comps[id].job;
        if (j.kind === 'help') return 'Helping the ' + (WS[j.target] ? WS[j.target].name : 'Woodlot');
        if (j.kind === 'explore') return 'Exploring the wilds';
        if (j.kind === 'knight') return 'Assisting the Knight';
        if (j.kind === 'front') return 'Defending Akhar’s Wall';
        return 'Resting at the Enclave';
    }
    function feedBlock(s, id, food) {
        const c = s.comps[id], it = RES[food];
        if (!c || !c.joined) return 'Not in your roster.';
        if (onExpedition(s, id)) return 'Away with the Knight.';
        if (!it || it.kind !== 'FOOD' || !it.bondXp) return 'Not a treat.';
        if (fl(s.inv[food]) < 1) return 'None in storage.';
        const day = new Date(s.t).toDateString();
        if (c.treats.day === day && c.treats.n >= DAILY_TREATS) return 'Had ' + DAILY_TREATS + ' treats today.';
        return '';
    }
    function feed(s, id, food) {
        if (feedBlock(s, id, food)) return false;
        const c = s.comps[id], it = RES[food], day = new Date(s.t).toDateString();
        if (c.treats.day !== day) c.treats = { day: day, n: 0 };
        c.treats.n++;
        s.inv[food] = Math.max(0, s.inv[food] - 1);
        const liked = (it.prefers || []).includes(C(id).EL);
        grantBond(s, id, it.bondXp * (liked ? 1.5 : 1));
        grantSkill(s, 'husbandry', Math.max(1, Math.floor(it.bondXp / 4)));
        s.rev++;
        return true;
    }
    // —— Taming (Chronicles: strategy + lure against rarity; Taming XP 40 + 30 per tier) ——
    function tameChance(s, sg, lure) {
        const sp = SPECIES[sg.species] || {};
        let p = RARITY_TAME[sp.rarity] || 0.3;
        p += bonusLvl(s, 'taming') * 0.005;
        if (affLvl(s, sp.element) >= 25) p += 0.05;
        const it = lure && RES[lure];
        if (it && it.kind === 'LURE' && (!it.lureElement || it.lureElement === sp.element)) p += (CH.items[lure] ? CH.items[lure].lureBonus : 10) / 100;
        return Math.max(0.02, Math.min(0.95, p));
    }
    function tameBlock(s, sgId, lure) {
        const sg = (s.sightings || []).find((v) => v.id === sgId);
        if (!sg) return 'That sighting has gone.';
        if (sg.expiresAt <= s.t) return 'The trail went cold.';
        if (joinedIds(s).length >= rosterCap(s)) return 'Your roster is full (' + rosterCap(s) + '). Raise the Enclave to make room.';
        if (lure && fl(s.inv[lure]) < 1) return 'No ' + itemName(lure) + ' in storage.';
        return '';
    }
    function tame(s, sgId, lure) {
        if (tameBlock(s, sgId, lure)) return null;
        const sg = s.sightings.find((v) => v.id === sgId);
        const chance = tameChance(s, sg, lure);
        if (lure) s.inv[lure] = Math.max(0, s.inv[lure] - 1);
        s.sightings = s.sightings.filter((v) => v.id !== sgId);
        const won = rng(sg.id + ':tame:' + (lure || ''))() < chance;
        // Taming is always open: Chronicles has no unlock for it, so its XP always counts.
        grantSkill(s, 'taming', won ? 40 + 30 * (sg.tier || 1) : 15);
        let uid = '';
        if (won) { uid = addCompanion(s, sg.species, { caughtAt: s.t }); logEvent(s, 'Tamed ' + SPECIES[sg.species].name + '.'); }
        s.rev++;
        return { won: won, uid: uid, chance: chance };
    }
    function evolveBlock(s, uid) {
        const c = s.comps[uid];
        if (!c || !c.joined) return 'Not in your roster.';
        const cc = C(uid);
        if (!cc.to || !SPECIES[cc.to]) return cc.name + ' has no further form.';
        if (compLevel(c) < cc.cap) return 'Reach level ' + cc.cap + ' first (now ' + compLevel(c) + ').';
        if (onExpedition(s, uid)) return 'Away with the Knight.';
        return '';
    }
    function evolve(s, uid) {
        if (evolveBlock(s, uid)) return false;
        const c = s.comps[uid], from = C(uid).species;
        c.species = C(uid).to;
        logEvent(s, from + ' evolved into ' + SPECIES[c.species].name + '.');
        FRESH.push(from + ' evolved into ' + SPECIES[c.species].name + '!');
        s.rev++;
        return true;
    }

    // —— Objectives ——
    const OBJECTIVES = [
        { chapter: 'Breaking Ground', steps: [
            { id: 'woodlot', title: 'Raise the Woodlot', hint: 'Tap the cleared ground by the river. Your 30 Timber is exactly enough.', done: (s) => s.b.woodlot >= 1 },
            { id: 'garden', title: 'Build the Garden', hint: 'Open the Elemental Quarter and build its first workshop. The Garden grows Flax, Sunleaf and produce.', done: (s) => wsBuilt(s, 'garden') },
            { id: 'quarry', title: 'Build the Quarry', hint: 'Stone for the Forge, the Fridge and the walls.', done: (s) => wsBuilt(s, 'quarry') },
            { id: 'kitchen', title: 'Build the Kitchen', hint: 'Provisions for the road: expeditions need them.', done: (s) => wsBuilt(s, 'kitchen') },
            { id: 'pair', title: 'Build the Forge and the Fridge', hint: 'Both need Stone from the Quarry. Linked, they make Tempered Glass.', done: (s) => wsBuilt(s, 'forge') && wsBuilt(s, 'fridge') },
            { id: 'carve', title: 'Carve a second weapon', hint: 'Knight › Work › Craft › Carpentry (opens at Woodcutting 5). Every weapon and garment is crafted.', done: (s) => Object.keys(s.inv).some((k) => k !== 'wooden_sword' && RES[k] && RES[k].kind === 'WEAPON' && fl(s.inv[k]) >= 1) }
        ] },
        { chapter: 'Restoration: the Archive', steps: [
            { id: 'link', title: 'Connect the Forge and Fridge', hint: 'Open the Elemental Quarter, tap Arrange, then turn both sockets to face each other.', done: (s) => activeRecipes(s).includes('glass') },
            { id: 'glass', title: 'Refine 3 Tempered Glass', hint: 'The link turns Ember Ingots and Frost Crystals into glass. A companion at the Fridge speeds it up.', done: (s) => fl(s.inv.glass) >= 3 },
            { id: 'timber', title: 'Stock 60 Timber', hint: 'The Woodlot, the Knight’s woodcutting and the Rootwild Trail all bring Timber.', done: (s) => fl(s.inv.timber) >= 60 },
            { id: 'restore', title: 'Restore the Archive', hint: 'Tap the ruined Archive and start construction.', done: (s) => s.b.archive >= 1 || !!buildFor(s, 'archive') },
            { id: 'wait', title: 'Let the crew finish', hint: '8 hours. Work, refining and expeditions carry on meanwhile.', done: (s) => s.b.archive >= 1 },
            { id: 'study', title: 'Begin Elemental Studies', hint: 'Knight › Work › Study: read the Covenant Records at the Archive.', done: (s) => (s.knight.skills.elemental_studies || 0) > 0 }
        ] },
        { chapter: 'Forge and Field', steps: [
            { id: 'mining5', title: 'Reach Mining 5', hint: 'Mine the Copper Vein with a Pickaxe. Mining 5 opens Smelting.', done: (s) => skillLvl(s, 'mining') >= 5 },
            { id: 'bars', title: 'Smelt 4 Copper Bars', hint: 'Knight › Work › Craft › Smelting. Bars feed Smithing, the Hall upgrade and gear.', done: (s) => fl(s.inv.copper_bar) >= 4 },
            { id: 'essence', title: 'Study an essence', hint: 'Expeditions bring essences. Study one at the Archive to grow that element’s Affinity.', done: (s) => (s.knight.counts.study || 0) > 0 },
            { id: 'command3', title: 'Reach Command 3', hint: 'Lead companions on expeditions. Command 3 opens a second party slot.', done: (s) => skillLvl(s, 'command') >= 3 }
        ] },
        { chapter: 'The Sealed Door', steps: [
            { id: 'map', title: 'Open the sealed door in the Covenant Ruins', hint: 'Bring a Hammer. A Siegeling with Frost Sight can spot the door, but cannot open it.', done: (s) => s.disc.vaultMap },
            { id: 'cipher', title: 'Reach Elemental Studies 10', hint: 'Vault Cipher lets the Knight read the map.', done: (s) => skillLvl(s, 'elemental_studies') >= 10 },
            { id: 'vault', title: 'Sunken Vault (planned, beyond this slice)', hint: 'The next destination and its rewards are not built yet.', done: () => false, planned: true }
        ] }
    ];
    function latchObjectives(s) {
        OBJECTIVES.forEach((ch) => ch.steps.forEach((st) => { if (!s.obj[st.id] && st.done(s)) { s.obj[st.id] = true; s.rev++; } }));
    }
    function currentObjective(s) {
        for (const ch of OBJECTIVES) {
            const i = ch.steps.findIndex((st) => !s.obj[st.id]);
            if (i >= 0) return { ch: ch, i: i, step: ch.steps[i] };
        }
        return null;
    }

    // —— Account sync and the shared realm (server: DominionController) ——
    // dominion.html sets DOMINION_ONLINE; the offline artifact preview never calls the API.
    const ONLINE = !!window.DOMINION_ONLINE;
    const AUTH_TOKEN_KEY = 'sieglingsAuthToken';
    const COOKIE_SESSION_VALUE = 'cookie';
    const API_BASE = String((window.SIEGLINGS_CONFIG && window.SIEGLINGS_CONFIG.apiBaseUrl) || '').replace(/\/$/, '');
    const NET = { signedIn: false, checked: false, busy: false, lastSync: 0, syncedRev: -1, error: '', guild: null, market: null, loading: '', pending: null };
    const DOMINION_GOODS = ['timber', 'stone', 'ore', 'fiber', 'produce', 'provisions', 'ember', 'frost', 'storm', 'glass', 'alloy', 'rations', 'relic', 'insight', 'fittings', 'living_mortar', 'covenant_keystone', 'aether_core', 'heartwood_relic'];
    // Weapons and garments are worn only by the Knight who made them, so they never reach the market.
    const GEAR_KINDS = ['WEAPON', 'ARMOR', 'HELMET', 'BOOTS', 'ACCESSORY', 'RELIC'];
    const tradeable = (k) => DOMINION_GOODS.includes(k) || (!!CH.items[k] && !ALIAS[k] && (CH.tradeable || []).includes(CH.items[k].kind) && !GEAR_KINDS.includes(CH.items[k].kind));
    function authToken() { try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch (e) { return ''; } }
    function api(path, body) {
        const t = authToken(), headers = { 'Content-Type': 'application/json' };
        // The sentinel means the session rides the cookie; anything else is a Bearer token.
        if (t && t !== COOKIE_SESSION_VALUE) headers.Authorization = 'Bearer ' + t;
        const opts = { method: body ? 'POST' : 'GET', headers: headers, credentials: 'same-origin' };
        if (body) opts.body = JSON.stringify(body);
        return fetch(API_BASE + path, opts).then((res) => res.text().then((raw) => {
            let data = {};
            try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = { error: 'Unexpected server response.' }; }
            if (!res.ok) { data.error = data.error || res.statusText || 'Request failed.'; data.status = res.status; }
            return data;
        }), () => ({ error: 'Could not reach the server. Progress is kept on this device.', status: 0 }));
    }
    // Realm deltas (escrow, sales, spoils) arrive once each; the ids applied ride the next sync.
    function applyInbox(s, list) {
        let n = 0;
        (list || []).forEach((e) => {
            if (!e || !e.id || s.applied.includes(e.id)) return;
            Object.keys(e.delta || {}).forEach((k) => { s.inv[k] = Math.max(0, (s.inv[k] || 0) + Number(e.delta[k] || 0)); });
            s.applied.push(e.id);
            logEvent(s, (e.note || 'Realm') + ': ' + Object.keys(e.delta || {}).map((k) => (e.delta[k] > 0 ? '+' : '') + e.delta[k] + ' ' + itemName(k)).join(', ') + '.');
            n++;
        });
        if (s.applied.length > 300) s.applied = s.applied.slice(-300);
        if (n) s.rev++;
        return n;
    }
    function adoptServer(stateText, version) {
        try {
            const saved = JSON.parse(stateText);
            if (!saved || typeof saved.t !== 'number') return false;
            S = sanitize(merge(defaults(saved.t), migrate(saved)));
            S.sync.version = version;
            return true;
        } catch (e) { return false; }
    }
    function bootOnline() {
        if (!ONLINE) return Promise.resolve();
        api('/api/dominion/art').then((m) => { if (m && !m.error) { ART_URLS = m; renderAll(); } });
        if (!authToken()) { NET.checked = true; renderAll(); return Promise.resolve(); }
        return api('/api/dominion').then((d) => {
            NET.checked = true;
            if (d.status === 401) { NET.signedIn = false; renderAll(); return; }
            if (d.error) { NET.error = d.error; renderAll(); return; }
            NET.signedIn = true;
            if (d.name && S.knight.name === 'Ser Airek') S.knight.name = d.name;
            const v = Number(d.version) || 0;
            if (d.state && v > (S.sync.version || 0)) { if (adoptServer(d.state, v)) toast('Loaded your synced Dominion progress.'); }
            applyInbox(S, d.inbox);
            advance(S, now());
            save();
            renderAll();
            return syncNow(true);
        });
    }
    function syncNow(force) {
        if (!ONLINE || !NET.signedIn) return Promise.resolve();
        if (NET.busy) return NET.pending || Promise.resolve();
        if (!force && S.rev === NET.syncedRev && Date.now() - NET.lastSync < 120000) return Promise.resolve();
        NET.busy = true;
        const rev = S.rev;
        NET.pending = api('/api/dominion/save', { state: JSON.stringify(S), baseVersion: S.sync.version || 0, applied: S.applied.slice(-300) }).then((d) => {
            NET.busy = false;
            if (d.status === 409 && d.state) {
                if (adoptServer(d.state, Number(d.version) || 0)) { applyInbox(S, d.inbox); advance(S, now()); save(); renderAll(); toast(d.error); }
                return;
            }
            if (d.status === 401) { NET.signedIn = false; renderAll(); return; }
            if (d.error) { NET.error = d.error; return; }
            NET.error = '';
            S.sync.version = Number(d.version) || S.sync.version;
            NET.syncedRev = rev;
            NET.lastSync = Date.now();
            if (applyInbox(S, d.inbox)) renderAll();
            save();
            flushReports();
        });
        return NET.pending;
    }
    // Operation returns are reported once each (the server dedupes by journey id).
    function flushReports() {
        (S.opReports || []).slice().forEach((r) => {
            api('/api/dominion/operation/report', { reportId: r.id, front: r.front, damage: r.damage }).then((d) => {
                if (!d.error || d.status === 400) { S.opReports = S.opReports.filter((x) => x.id !== r.id); save(); }
                if (!d.error) { NET.guild = d; renderView(); }
            });
        });
    }
    function realmCall(path, body) {
        if (NET.loading) return Promise.resolve();
        NET.loading = path;
        renderView();
        return syncNow(true).then(() => api(path, body)).then((d) => {
            NET.loading = '';
            if (d.error) { toast(d.error); renderView(); return d; }
            applyInbox(S, d.inbox);
            if (path.indexOf('/market') >= 0) NET.market = d; else NET.guild = d;
            save();
            renderAll();
            syncNow(true);
            return d;
        });
    }
    function loadRealm() {
        if (!ONLINE || !NET.signedIn || NET.loading) return;
        NET.loading = 'load';
        Promise.all([api('/api/dominion/guild'), api('/api/dominion/market')]).then((r) => {
            NET.loading = '';
            if (!r[0].error) { NET.guild = r[0]; applyInbox(S, r[0].inbox); }
            if (!r[1].error) NET.market = r[1];
            NET.realmAt = Date.now();
            renderView();
        });
    }
    window.dmRealmSubmit = function (f) {
        const val = (n) => { const el = f.querySelector('[name="' + n + '"]'); return el ? el.value : ''; };
        if (f.dataset.form === 'guild-create') realmCall('/api/dominion/guild/create', { name: val('name') });
        if (f.dataset.form === 'guild-join') realmCall('/api/dominion/guild/join', { code: val('code') });
        if (f.dataset.form === 'market-list') realmCall('/api/dominion/market/list', { itemId: val('item'), qty: Number(val('qty')) || 1, price: Number(val('price')) || 1 });
    };

    // —— Siege Operation journeys (the guild's weekly threat) ——
    const OPERATION_HOURS = 8;
    function operationBlock(s) {
        if (!NET.guild || !NET.guild.guild) return 'Join a guild first.';
        if (s.exp) return 'The Knight is away.';
        if (NET.guild.guild.operation.won) return 'This week’s threat has fallen.';
        return '';
    }
    function startOperation(s, front) {
        if (operationBlock(s) || !(CH.fronts || {})[front]) return false;
        s.seq++;
        const x = context(s, prepParty(s), 'operation');
        s.exp = Object.assign(x, { id: 'x' + s.seq + '-' + s.t + '-op', operation: true, front: front, threatEl: NET.guild.guild.operation.element, startAt: s.t, endAt: s.t + OPERATION_HOURS * HOUR, rations: 0, potions: {}, rune: '' });
        logEvent(s, 'The Knight marched to the ' + CH.fronts[front].name + ' front.');
        s.rev++;
        return true;
    }
    function finishOperation(s, x) {
        const f = (CH.fronts || {})[x.front] || { favoredClasses: [], favoredElements: [], name: 'front' };
        const favored = x.party.filter((id) => s.comps[id] && (f.favoredClasses.includes(C(id).cls) || f.favoredElements.includes(C(id).EL))).length;
        const damage = Math.min(600, partyPower(s, x) * 8 + favored * 60 + 40);
        s.opReports = s.opReports || [];
        s.opReports.push({ id: x.id, front: x.front, damage: damage });
        add(s, { crowns: 20 });
        grantRank(s, OPERATION_HOURS * 60);
        grantSkill(s, 'command', 60 + 20 * x.party.length);
        x.party.forEach((id) => { if (s.comps[id]) { grantBond(s, id, 30); grantMastery(s, C(id).cls, 24); } });
        pushReport(s, {
            id: x.id, dest: 'operation', operation: true, at: x.endAt, seen: false, weapon: x.weapon, weaponId: x.weaponId, tool: '', party: x.party, rations: 0,
            lines: [{ status: 'ok', title: 'Siege Operation: ' + f.name, by: favored ? favored + ' favoured companion' + (favored > 1 ? 's' : '') : '', need: '',
                text: 'The party struck the threat on the ' + f.name + ' front for ' + damage + ' damage (power ' + partyPower(s, x) + (favored ? ', ' + favored + ' suited to this front' : '') + ').' }],
            total: { crowns: 20 }, xp: {}, prof: 0, bonds: {}, levels: {}, discs: [], summary: 'The guild’s threat took ' + damage + ' damage.', resumed: [], lootPct: 100, minutes: OPERATION_HOURS * 60
        });
        FRESH.push('Back from the Siege Operation: ' + damage + ' damage dealt.');
        s.rev++;
        if (ONLINE) setTimeout(flushReports, 0);
    }

    // ═══════════════ UI: the Chronicles shell, with the Keep inside Base ═══════════════
    // Markup follows chronicles.js class for class so chronicles.css styles it unchanged;
    // the Keep scene and interiors come from keep.html/keep.css (dominion-keep.css).
    let S = null;
    let quarterSel = -1;
    let arranging = false;
    let confirmReset = false;
    let lastSig = '';
    let lastRev = -1;
    let modal = null; // { kind, arg }
    let recipePick = '';
    let openComp = '';
    let scrollToRoom = false;
    const TABS = ['knight', 'company', 'work', 'expedition', 'base', 'realm', 'wilds'];
    const OLD_TAB = { keep: 'base', activities: 'expedition', companions: 'company' };

    const elKey = (el) => String(el || 'NEUTRAL').toLowerCase();
    const RASTER_ELEMENTS = { FIRE: 1, EARTH: 1, ICE: 1, WIND: 1 };
    function elementIcon(el, size) {
        const key = elKey(el);
        const src = RASTER_ELEMENTS[String(el || '').toUpperCase()] ? '/img/elements/element-' + key + '-96.webp' : '/img/elements/element-' + key + '.svg';
        return '<img class="ck-el-ico" src="' + src + '" alt="" width="' + (size || 16) + '" height="' + (size || 16) + '">';
    }
    const chip = (text, cls) => '<span class="ck-chip' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>';
    const elChip = (el, label) => '<span class="ck-chip ck-el" style="--el:var(--' + elKey(el) + ')">' + elementIcon(el, 14) + esc(label || titleCase(el)) + '</span>';
    const pctOf = (into, span) => (!span ? 0 : Math.max(0, Math.min(100, Math.round(into / span * 100))));
    const barP = (p, cls, live) => '<span class="ck-bar' + (cls ? ' ' + cls : '') + '"><i' + (live || '') + ' style="width:' + Math.round(p) + '%"></i></span>';
    const liveBar = (start, end, cls) => barP(Math.max(0, Math.min(100, (S.t - start) / Math.max(1, end - start) * 100)), cls, ' data-live="bar" data-start="' + start + '" data-end="' + end + '"');
    const eta = (end) => '<b data-live="eta" data-end="' + end + '">' + fmtDur(end - S.t) + '</b>';
    const namedScene = (name) => SCENE_DIR + name + '.webp';
    function hero(o) {
        return '<section class="ck-banner' + (o.cls ? ' ' + o.cls : '') + '"' + (o.el ? ' style="--el:var(--' + elKey(o.el) + ')"' : '') + '>' +
            '<img class="ck-banner-img" src="' + esc(o.scene) + '" alt="" decoding="async">' +
            '<span class="ck-banner-shade" aria-hidden="true"></span>' +
            (o.art ? '<div class="ck-banner-art">' + o.art + '</div>' : '') +
            '<div class="ck-banner-body">' + (o.kicker ? '<p class="ck-banner-kicker">' + o.kicker + '</p>' : '') +
            '<h2 class="ck-banner-title">' + o.title + '</h2>' + (o.body || '') + '</div>' +
            (o.foot ? '<div class="ck-banner-foot">' + o.foot + '</div>' : '') + '</section>';
    }

    // Colour emoji for items (iOS renders them in full colour), as Chronicles does.
    const SKILL_EMOJI = { mining: '⛏️', woodcutting: '🪓', foraging: '🌿', fishing: '🎣', excavation: '🦴', smelting: '🔥', smithing: '⚒️', carpentry: '🪚',
        weaving: '🧵', cooking: '🍳', alchemy: '⚗️', runecrafting: '🔮', taming: '🪢', bonding: '💞', husbandry: '🧺', pathfinding: '🧭', survival: '⛺',
        cartography: '🗺️', command: '🚩', elemental_studies: '📚', class_tactics: '♟️' };
    const SKILL_LOOK = { mining: 'earth', woodcutting: 'wind', foraging: 'poison', fishing: 'water', excavation: 'metal', smelting: 'fire', smithing: 'metal',
        carpentry: 'earth', weaving: 'psychic', cooking: 'fire', alchemy: 'poison', runecrafting: 'shadow', elemental_studies: 'light' };
    const PROFESSION_SCENES = { mining: 'metal-journey', woodcutting: 'earth-journey', foraging: 'wind-journey', fishing: 'water-shelter', excavation: 'relic-journey',
        smelting: 'fire-journey', smithing: 'fire-shelter', carpentry: 'earth-shelter', weaving: 'wind-shelter', cooking: 'ice-shelter', alchemy: 'poison-shelter',
        runecrafting: 'psychic-shelter', elemental_studies: 'aurora-journey' };
    const BUILDING_SCENES = { sanctuary: 'wind-shelter', forge: 'fire-shelter', garden: 'poison-shelter', war_room: 'metal-shelter', stable: 'earth-shelter', library: 'psychic-shelter' };
    const CLASS_EMOJI = { Guardian: '🛡️', Bruiser: '👊', Assassin: '🗡️', Mage: '🔮', Support: '💚' };
    const CLASS_HUE = { Guardian: 'metal', Bruiser: 'fire', Assassin: 'shadow', Mage: 'psychic', Support: 'poison' };
    const WEAPON_EMOJI = { sword: '🗡️', spear: '🔱', bow: '🏹', staff: '🪄', hammer: '🔨', daggers: '🔪' };
    const KIND_EMOJI = { MATERIAL: '🪨', ESSENCE: '✨', POTION: '🧪', LURE: '🪝', FOOD: '🍲', WEAPON: '🗡️', ARMOR: '🛡️', RELIC: '🏺', RUNE: '📜',
        HELMET: '⛑️', BOOTS: '👢', ACCESSORY: '💍', TOOL: '🪓', CURRENCY: '🪙' };
    const ITEM_EMOJI = { timber: '🪵', stone: '🪨', ore: '🟤', ember: '🔥', frost: '❄️', storm: '⚡', fiber: '🌾', produce: '🥕', provisions: '🥖', glass: '🔷',
        alloy: '⚙️', rations: '🍱', relic: '💠', insight: '📜', fittings: '🔩', silver: '🪙', crowns: '👑', living_mortar: '🧱', covenant_keystone: '🗝️',
        aether_core: '💠', heartwood_relic: '🌳', woodaxe: '🪓', pickaxe: '⛏️', sunleaf: '🌿', frostbloom: '🌸', galeberry: '🫐', gale_feather: '🪶',
        minnow: '🐟', silverfin: '🐠', copper_bar: '🧱', iron_bar: '🧱', ancient_relic: '🏺', fossil: '🦴', rune_stone: '🔷', linen: '🧶', rope: '🪢',
        pine_plank: '🪵', oak_plank: '🪵', oak_log: '🪵', heartwood: '🌳', ember_shard: '🔥', tide_pearl: '🦪', storm_glass: '⚡', umbral_crystal: '🔮',
        mind_prism: '💎', living_alloy: '⚙️', grave_dust: '💀', wild_bait: '🪱', snare_crate: '📦', breezewoven_net: '🕸️', grilled_minnow: '🍢',
        sunleaf_salad: '🥗', silverfin_stew: '🍲', berry_tart: '🥧', travelers_coat: '🧥', frostweave_cloak: '🧥', tidewarden_cloak: '🧥', stormward_cloak: '🧥',
        linen_robe: '🥻', ember_robe: '🥻', grandmasters_mantle: '🧥', runeheart: '❤️‍🔥', dawn_lantern: '🏮', clarity_charm: '🧿', alloy_breaker: '⚙️',
        grave_ward: '🪦', emberward_charm: '🔥', rally_banner: '🚩', bastion_crest: '🛡️', mending_amulet: '📿', prism_pendant: '🔷' };
    const HUE_WORDS = [['copper', 'earth'], ['iron', 'metal'], ['ember', 'fire'], ['frost', 'ice'], ['gale', 'wind'], ['storm', 'electric'], ['tide', 'water'],
        ['pearl', 'water'], ['silverfin', 'water'], ['minnow', 'water'], ['pine', 'earth'], ['oak', 'earth'], ['heart', 'earth'], ['sunleaf', 'poison'],
        ['berry', 'psychic'], ['flax', 'light'], ['linen', 'light'], ['rope', 'earth'], ['relic', 'light'], ['fossil', 'light'], ['rune', 'psychic'],
        ['umbral', 'shadow'], ['grave', 'undead'], ['alloy', 'metal'], ['herb', 'poison'], ['timber', 'earth'], ['stone', 'metal'], ['fiber', 'light'],
        ['produce', 'poison'], ['provisions', 'fire'], ['glass', 'ice'], ['crowns', 'light'], ['silver', 'metal'], ['insight', 'psychic']];
    function itemHue(id) {
        const k = String(id || ''), m = k.match(/^essence_([a-z]+)/);
        if (m) return m[1];
        for (const h of HUE_WORDS) if (k.indexOf(h[0]) >= 0) return h[1];
        return 'neutral';
    }
    function itemEmoji(id) {
        const k = String(id || ''), r = RES[k] || {};
        if (ITEM_EMOJI[k]) return ITEM_EMOJI[k];
        if (r.kind === 'WEAPON') return WEAPON_EMOJI[r.weaponType] || '🗡️';
        return KIND_EMOJI[r.kind] || '📦';
    }
    function itemIcon(id, cls) {
        const k = String(id || ''), m = k.match(/^essence_([a-z]+)/);
        return '<span class="ck-ico' + (cls ? ' ' + cls : '') + '" style="--ih:var(--' + itemHue(k) + ')" aria-hidden="true">' + (m ? elementIcon(m[1].toUpperCase(), 26) : itemEmoji(k)) + '</span>';
    }
    const emojiIcon = (e, hue, cls) => '<span class="ck-ico' + (cls ? ' ' + cls : '') + '" style="--ih:var(--' + (hue || 'neutral') + ')" aria-hidden="true">' + e + '</span>';
    function costRow(cost) {
        return '<div class="ck-costs">' + Object.keys(cost).map((k) => '<span class="ck-cost' + (fl(S.inv[k]) >= cost[k] ? '' : ' is-short') + '" title="' + esc(itemName(k)) + '">' +
            itemIcon(k, 'is-xs') + fl(S.inv[k]) + '/' + cost[k] + '</span>').join('') + '</div>';
    }
    function lootRow(g) {
        const keys = Object.keys(g || {}).filter((k) => g[k] > 0);
        if (!keys.length) return '<p class="ck-muted ck-small">Nothing.</p>';
        return '<ul class="ck-loot">' + keys.map((k) => '<li>' + itemIcon(k, 'is-sm') + '<span><b>' + fl(g[k]) + '×</b> ' + esc(itemName(k)) + '</span></li>').join('') + '</ul>';
    }
    // A paper standee portrait: the Keep's die-cut cutout inside Chronicles' portrait frame.
    function portrait(uid, cls) {
        const cc = C(uid);
        return '<span class="ck-portrait dm-paper-frame' + (cls ? ' ' + cls : '') + '" style="--el:var(--' + cc.el + ')">' + compArt(uid, '') + '</span>';
    }
    function speciesPortrait(speciesId, el, cls) {
        return '<span class="ck-portrait dm-paper-frame' + (cls ? ' ' + cls : '') + '" style="--el:var(--' + elKey(el) + ')">' + speciesArt(speciesId, '', el) + '</span>';
    }
    const KNIGHT_ART = '/img/knights/ser-airek-full-card.webp';
    const leadComp = () => prepParty(S)[0] || joinedIds(S)[0] || '';

    function toast(text) {
        const host = $('ckToasts');
        if (!host) return;
        const el = document.createElement('div');
        el.className = 'ck-toast is-info';
        el.textContent = text;
        host.appendChild(el);
        // Three at most: a +4h jump can raise several at once and they must not bury the screen.
        while (host.children.length > 3) host.removeChild(host.firstChild);
        setTimeout(() => el.classList.add('is-out'), 3200);
        setTimeout(() => el.remove(), 3700);
    }
    function flushToasts() { FRESH.splice(0).forEach(toast); }

    function openModal(kind, arg) { modal = { kind: kind, arg: arg }; renderModal(); }
    function closeModal() {
        if (modal && modal.kind === 'report') markSeen(modal.arg);
        if (modal && modal.kind === 'away') S.away = null;
        modal = null; confirmReset = false;
        const m = $('ckModal');
        m.hidden = true; m.dataset.kind = ''; $('ckModalBody').innerHTML = '';
        save();
        renderAll();
    }
    function renderModal() {
        if (!modal) return;
        const m = $('ckModal'), body = $('ckModalBody');
        const html = ({ report: reportModal, away: awayModal, plan: planModal, item: itemModal, skill: skillModal, menu: menuModal, objective: objectiveModal, lore: loreModal, voice: voiceModal, comp: null }[modal.kind] || (() => ''))(modal.arg);
        const scroll = body.scrollTop;
        m.dataset.kind = modal.kind;
        body.innerHTML = html;
        body.scrollTop = scroll;
        m.hidden = false;
    }
    function markSeen(id) {
        const r = S.reports.find((x) => x.id === id);
        if (r && !r.seen) { r.seen = true; S.rev++; }
    }

    function renderHeader() {
        $('ckKnightName').textContent = S.knight.name;
        const lead = leadComp();
        $('ckAvatar').innerHTML = lead ? portrait(lead) : '';
        $('ckCrownsNum').textContent = fl(S.inv.crowns);
        $('ckRankNum').textContent = rankLvl(S);
        $('ckRankTitle').textContent = HALL_RANKS[S.b.hall - 1] + (rebirths(S) ? ' · ' + REBIRTH_TITLES[rebirths(S)] : '');
        $('ckRankBar').style.width = xpProgress(S.knight.rankXp).pct + '%';
        const wilds = (S.sightings || []).filter((v) => v.expiresAt > S.t).length;
        const badge = $('ckWildsBadge');
        badge.hidden = !wilds; badge.textContent = wilds || '';
        const baseBadge = $('ckBaseBadge'), baseN = visitorsHere(S).length + S.requests.filter((q) => !requestBlock(S, q.id)).length + LORE().entries.filter((e) => loreOpen(S, e.id) && !S.lore[e.id]).length;
        baseBadge.hidden = !baseN; baseBadge.textContent = baseN || '';
        const expBadge = $('ckExpBadge'), unseen = S.reports.filter((r) => !r.seen).length;
        expBadge.hidden = !unseen; expBadge.textContent = unseen || '';
        document.querySelectorAll('#ckTabs button').forEach((b) => {
            b.classList.toggle('is-on', b.dataset.tab === S.ui.tab);
            b.setAttribute('aria-current', b.dataset.tab === S.ui.tab ? 'page' : 'false');
        });
        const d = new Date(now()), off = Math.round(S.offset / HOUR);
        $('ckClock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        $('ckClock').title = off ? 'Test clock: ' + off + 'h ahead' : '';
    }
    function renderStatus() {
        const parts = [];
        const td = taskDef(S.knight.task);
        if (S.exp) parts.push('<button type="button" class="ck-stat" data-act="tab" data-arg="expedition"><span class="ck-dot is-on"></span><span>' + esc(expTitle(S.exp)) + '</span>' + eta(S.exp.endAt) + '</button>');
        else if (td) parts.push('<button type="button" class="ck-stat" data-act="work-skill" data-arg="' + esc(td.skillId) + '"><span class="ck-dot is-on"></span><span>' + esc(taskLabel(S)) + '</span><span class="ck-bar is-thin"><i data-live="action"></i></span></button>');
        else parts.push('<button type="button" class="ck-stat" data-act="tab" data-arg="work"><span class="ck-dot"></span><span>Knight resting</span></button>');
        const st = ['woodlot'].concat(Object.keys(WS)).reduce((a, id) => a + storedCount(S, id), 0);
        if (st > 0) parts.push('<button type="button" class="ck-stat" data-act="collect-all"><span class="ck-dot is-ready"></span><span>Collect ' + st + '</span></button>');
        if ((S.builds || []).length) parts.push('<button type="button" class="ck-stat" data-act="base-sec" data-arg="build"><span class="ck-dot is-on"></span><span>' + esc(S.builds[0].name) + '</span>' + eta(S.builds[0].endAt) + '</button>');
        parts.push('<button type="button" class="ck-stat dm-pass" data-act="pass" data-arg="4" title="Test control: advances the shared clock by 4 hours"><span>⏩ +4h</span></button>');
        $('ckStatus').innerHTML = parts.join('');
    }

    function renderView() {
        const view = { knight: viewKnight, company: viewCompany, work: viewWork, expedition: viewExpedition, base: viewBase, realm: viewRealm, wilds: viewWilds }[S.ui.tab] || viewBase;
        const main = $('ckMain');
        const scroll = main.scrollTop;
        parkScene();
        // A journey already on screen keeps walking: the same trip's node survives the re-render.
        const keepJ = {};
        main.querySelectorAll('.dm-journey').forEach((j) => { keepJ[j.dataset.start + ':' + j.dataset.end] = j; });
        main.innerHTML = view();
        main.querySelectorAll('.dm-journey').forEach((j) => { const old = keepJ[j.dataset.start + ':' + j.dataset.end]; if (old) j.replaceWith(old); });
        main.dataset.tab = S.ui.tab;
        main.classList.toggle('dm-fill', S.ui.tab === 'base' && (S.ui.base || 'grounds') === 'grounds' && !S.ui.room);
        mountScene();
        decorateRoom();
        setBackdrop(tabScene());
        main.scrollTop = scroll;
        // Stepping into a room brings its stage to the top of the tab.
        if (scrollToRoom) { scrollToRoom = false; const r = main.querySelector('.dm-interior'); if (r) main.scrollTop = r.offsetTop - 8; }
        updateLive();
    }
    function setBackdrop(url) {
        const el = $('ckBackdrop');
        if (el.dataset.src === url) return;
        el.dataset.src = url;
        el.style.setProperty('--scene', 'url("' + url + '")');
    }
    function tabScene() {
        switch (S.ui.tab) {
        case 'knight': return namedScene('light-shelter');
        case 'company': { const l = leadComp(); return namedScene((l ? C(l).el : 'earth') + '-journey'); }
        case 'work': return namedScene(PROFESSION_SCENES[S.ui.workSkill] || 'earth-journey');
        case 'expedition': return S.exp && !S.exp.trial && !S.exp.operation ? sceneUrl(S.exp.dest) : namedScene('wind-journey');
        case 'realm': return namedScene('metal-boss');
        case 'wilds': return namedScene('wind-elite');
        default: return namedScene('relic-shelter');
        }
    }
    // Re-rendering restores focus by data-act/arg so keyboard users keep their place.
    function renderAll() {
        const a = document.activeElement;
        const key = a && a.dataset && a.dataset.act ? [a.dataset.act, a.dataset.arg] : null;
        renderHeader();
        renderStatus();
        renderView();
        if (modal) renderModal();
        if (key) {
            const sel = '[data-act="' + key[0] + '"]' + (key[1] != null ? '[data-arg="' + CSS.escape(key[1]) + '"]' : '');
            const el = document.querySelector('#ckModal:not([hidden]) ' + sel) || document.querySelector(sel);
            if (el && el !== document.activeElement) el.focus({ preventScroll: true });
        }
        lastSig = signature();
        lastRev = S.rev;
    }
    function signature() {
        return Object.keys(RES).map((k) => fl(S.inv[k])).join(',') + '|' + S.rev + '|' + Math.floor(S.t / MIN);
    }
    function updateLive() {
        const t = S.t;
        document.querySelectorAll('[data-res]').forEach((e) => { e.textContent = fl(S.inv[e.dataset.res]); });
        document.querySelectorAll('[data-live="eta"]').forEach((e) => { e.textContent = fmtDur(Number(e.dataset.end) - t); });
        document.querySelectorAll('[data-live="bar"]').forEach((e) => {
            const a = Number(e.dataset.start), b = Number(e.dataset.end);
            e.style.width = Math.max(0, Math.min(100, (t - a) / (b - a) * 100)) + '%';
        });
        document.querySelectorAll('[data-live="action"]').forEach((e) => { e.style.width = Math.round(Math.min(1, S.knight.prog) * 100) + '%'; });
        updateJourneys(t);
        document.querySelectorAll('[data-live="walker"]').forEach((e) => {
            const a = Number(e.dataset.start), b = Number(e.dataset.end);
            e.style.left = Math.max(0, Math.min(100, (t - a) / (b - a) * 100)) + '%';
        });
    }
    // —— Knight ——
    const GEAR_SLOT = { WEAPON: 'weapon', ARMOR: 'armor', HELMET: 'helmet', BOOTS: 'boots', ACCESSORY: 'accessory', RELIC: 'relic' };
    function viewKnight() {
        const k = S.knight, g = gearStats(S), busy = knightBusy(S), rp = xpProgress(k.rankXp);
        const tamed = joinedIds(S).length;
        const gear = Object.keys(RES).filter((x) => GEAR_SLOT[RES[x].kind] && fl(S.inv[x]) > 0);
        const worn = SLOTS.map((sl) => k.equip[sl[0]]);
        const bag = Object.keys(RES).filter((x) => !GEAR_SLOT[RES[x].kind] && RES[x].kind !== 'CURRENCY' && fl(S.inv[x]) > 0);
        let h = hero({
            cls: 'is-knight', scene: namedScene('light-shelter'), kicker: 'Rank ' + rankLvl(S) + ' · ' + esc(HALL_RANKS[S.b.hall - 1]), title: esc(k.name),
            art: '<span class="ck-portrait is-hero dm-knight-portrait"><img src="' + KNIGHT_ART + '" alt=""></span>',
            body: barP(rp.pct, 'is-fat') + '<p class="ck-banner-line">' + esc(rp.label) + ' rank XP</p>' +
                '<div class="ck-bubbles"><span class="ck-bubble">🗺️ <b>' + (S.runs || 0) + '</b> trips</span><span class="ck-bubble">🐾 <b>' + tamed + '</b> companions</span>' +
                '<span class="ck-bubble">👑 <b>' + fl(S.inv.crowns) + '</b></span><span class="ck-bubble">🪙 <b>' + fl(S.inv.silver) + '</b></span></div>'
        });
        h += '<section class="ck-card"><div class="ck-row"><h3>🛡️ Equipment</h3>' + chip('Armor ' + g.armor) + '</div><div class="ck-gear">' + SLOTS.map((sl) => {
            const id = k.equip[sl[0]], it = RES[id];
            return '<div class="ck-gear-slot' + (it ? ' is-on' : '') + '">' + (it ? itemIcon(id) : emojiIcon('➕', 'neutral', 'is-empty')) +
                '<span class="ck-gear-text"><span class="ck-kicker">' + sl[2] + '</span><b>' + esc(it ? it.name : 'Empty') + '</b><span class="ck-small">' + esc(it ? (it.blurb || '') + gearNote(id) : 'Craft one in Work.') + '</span></span>' +
                (it && sl[0] !== 'weapon' && !busy ? '<button type="button" class="ck-pill" data-act="equip" data-arg="' + sl[0] + ':">Remove</button>' : '') + '</div>';
        }).join('') + '</div>' +
            (gear.length ? '<h4>Gear bag · tap to wear' + (busy ? ' (locked while away)' : '') + '</h4><div class="ck-tiles is-gear">' + gear.map((x) => {
                const on = worn.includes(x);
                return '<button type="button" class="ck-tile' + (on ? ' is-on' : '') + '" data-act="equip" data-arg="' + GEAR_SLOT[RES[x].kind] + ':' + x + '"' + (busy ? ' disabled' : '') + ' title="' + esc(RES[x].blurb || '') + '">' +
                    itemIcon(x) + '<b>' + esc(RES[x].name) + '</b>' + (on ? '<span class="ck-tile-tag">Worn</span>' : '') + '</button>';
            }).join('') + '</div>' : '') +
            '<p class="ck-hint">Every weapon and garment is crafted: Carpentry carves wooden gear, Smithing forges metal, Weaving sews cloth. Weapon tier adds 20% to that weapon’s rewards on the road.</p>' +
            '<h4>Gathering tool</h4><div class="ck-tiles is-gear">' + ['woodaxe', 'pickaxe'].filter((t) => fl(S.inv[t]) > 0).map((t) =>
                '<button type="button" class="ck-tile' + (k.tool === t ? ' is-on' : '') + '" data-act="tool" data-arg="' + t + '"' + (busy ? ' disabled' : '') + ' title="' + esc(RES[t].blurb) + '">' + itemIcon(t) + '<b>' + esc(RES[t].name) + '</b>' + (k.tool === t ? '<span class="ck-tile-tag">Carried</span>' : '') + '</button>').join('') + '</div></section>';
        const GROUP_EMOJI = { Gathering: '🌿', Production: '⚒️', Siegeling: '🐾', Expedition: '🧭', Knowledge: '📚' };
        SKILL_GROUPS.forEach((gp) => {
            const ids = Object.keys(SKILLS).filter((id) => SKILLS[id].group === gp[0]);
            if (!ids.length) return;
            h += '<section class="ck-card"><h3>' + (GROUP_EMOJI[gp[0]] || '⭐') + ' ' + esc(gp[0] === 'Production' ? 'Crafting' : gp[0]) + '</h3><div class="ck-tiles is-skills">' + ids.map((id) => {
                const un = skillUnlocked(S, id), pr = xpProgress(k.skills[id]), hue = SKILL_LOOK[id] || 'neutral';
                return '<button type="button" class="ck-tile is-skill' + (un ? '' : ' is-locked') + '" data-act="skill" data-arg="' + id + '" style="--el:var(--' + hue + ')">' + emojiIcon(SKILL_EMOJI[id] || '⭐', hue) +
                    '<b>' + esc(SKILLS[id].name.replace(/^Elemental Studies$/, 'Studies')) + '</b><span class="ck-tile-lv">' + (un ? 'Lv ' + pr.l : 'Locked') + '</span>' + (un ? barP(pr.pct, 'is-el') : '') + '</button>';
            }).join('') + '</div></section>';
        });
        h += '<section class="ck-card"><h3>✨ Elemental Affinity</h3><div class="ck-tiles is-elements">' + ELEMENTS.map((e) => {
            const pr = xpProgress(k.affinity[e]);
            return '<div class="ck-tile is-element' + (pr.l > 1 || k.affinity[e] ? '' : ' is-dim') + '" style="--el:var(--' + elKey(e) + ')"><span class="ck-ico is-art">' + elementIcon(e, 30) + '</span><b>' + titleCase(e) + '</b><span class="ck-tile-lv">Lv ' + pr.l + '</span>' + barP(pr.pct, 'is-el') + '</div>';
        }).join('') + '</div><p class="ck-hint">Studies and journeys with Siegelings of an element raise its affinity. Some recipes need it.</p></section>';
        h += '<section class="ck-card"><h3>⚔️ Class Mastery</h3><div class="ck-tiles is-classes">' + CLASSES.map((c) => {
            const pr = xpProgress(k.mastery[c]), hue = CLASS_HUE[c] || 'neutral';
            return '<div class="ck-tile is-stat" style="--el:var(--' + hue + ')">' + emojiIcon(CLASS_EMOJI[c] || '⭐', hue) + '<b>' + esc(c) + '</b><span class="ck-tile-lv">Lv ' + pr.l + '</span>' + barP(pr.pct, 'is-el') + '</div>';
        }).join('') + '</div></section>';
        h += '<section class="ck-card"><h3>🏹 Weapon Disciplines</h3><div class="ck-tiles is-classes">' + Object.keys(WEAPONS).map((w) => {
            const pr = xpProgress(k.prof[w]), on = weaponItem(S).weaponType === w;
            return '<div class="ck-tile is-stat' + (on ? ' is-on' : '') + '" style="--el:var(--metal)" title="' + esc(WEAPONS[w].approach + ': ' + WEAPONS[w].detail) + '">' + emojiIcon(WEAPON_EMOJI[w] || '⚔️', 'metal') +
                '<b>' + esc(WEAPONS[w].name) + '</b><span class="ck-tile-lv">Lv ' + pr.l + '</span>' + barP(pr.pct) + '<span class="ck-tile-sub">' + esc(WEAPONS[w].approach) + '</span></div>';
        }).join('') + '</div></section>';
        const slots = loadoutSlots(S);
        if (slots) {
            h += '<section class="ck-card"><h3>🗂️ War Room loadouts</h3><div class="ck-loadouts">' + Array.from({ length: slots }, (_, i) => {
                const l = S.loadouts[i];
                return '<div class="ck-loadout"><div><b>' + (l ? esc(itemName(l.equip.weapon)) : 'Empty slot ' + (i + 1)) + '</b>' + (l && l.party.length ? '<span class="ck-small ck-muted">' + esc(l.party.map((p) => S.comps[p] ? C(p).name : p).join(', ')) + '</span>' : '') + '</div>' +
                    '<span class="ck-pills">' + (l ? '<button type="button" class="ck-pill" data-act="loadout-apply" data-arg="' + i + '"' + (busy ? ' disabled' : '') + '>Use</button>' : '') +
                    '<button type="button" class="ck-pill" data-act="loadout-save" data-arg="' + i + '">' + (l ? 'Overwrite' : 'Save current') + '</button></span></div>';
            }).join('') + '</div></section>';
        }
        const top = Math.max(10, rankLvl(S) + 2), ready = [];
        for (let l = 2; l <= top; l++) if (rankLvl(S) >= l && !S.claims['rank_' + l]) ready.push(l);
        h += '<section class="ck-card"><div class="ck-row"><h3>🎖️ Keeper’s Journey</h3>' + (ready.length ? chip(ready.length + ' to claim', 'is-help') : '') + '</div><p class="ck-small ck-muted">Every Knight Rank pays once in Silver and Crowns.</p>' +
            (ready.length ? '<div class="ck-pills">' + ready.map((l) => '<button type="button" class="ck-pill is-on" data-act="claim" data-arg="' + l + '">Rank ' + l + ' · 🪙' + journeyReward(l).silver + ' 👑' + journeyReward(l).crowns + '</button>').join('') + '</div>' : '<p class="ck-hint">Next reward at Rank ' + (rankLvl(S) + 1) + '.</p>') + '</section>';
        h += '<section class="ck-card"><h3>🎒 Storage</h3>' + (bag.length ? '<div class="ck-bank">' + bag.sort((a, b) => KIND_ORDER.indexOf(RES[a].kind) - KIND_ORDER.indexOf(RES[b].kind)).map((x) =>
            '<button type="button" class="ck-bank-slot" data-act="item" data-arg="' + x + '" title="' + esc(RES[x].name) + '">' + itemIcon(x) + '<span class="ck-bank-qty" data-res="' + x + '">' + fl(S.inv[x]) + '</span><span class="ck-bank-name">' + esc(RES[x].name) + '</span></button>').join('') + '</div>' : '<p class="ck-muted">Empty. Set your knight to work.</p>') +
            '<p class="ck-hint">One storage for the Keep, the Quarter and the Knight. ' + esc(incomeText()) + '</p></section>';
        return h;
    }
    function gearNote(id) {
        const it = RES[id], b = CH.gearBonuses[id], bits = [];
        if (it.weaponType) bits.push(WEAPONS[it.weaponType].name + ', tier ' + (it.tier || 0));
        if (it.armor) bits.push('armor ' + it.armor);
        if (b) { if (b.armor) bits.push('armor ' + b.armor); if (b.roadCut) bits.push(Math.round(b.roadCut * 100) + '% shorter journeys'); if (b.crit) bits.push('+' + Math.round(b.crit * 100) + '% haul'); if (b.rest) bits.push('+' + Math.round(b.rest * 100) + '% road bond'); }
        if (it.heatWard) bits.push('wards heat');
        if (it.relicEffect && it.relicEffect.indexOf('ward:') === 0) bits.push('wards ' + it.relicEffect.slice(5));
        return bits.length ? ' · ' + bits.join(', ') : '';
    }
    function incomeText() {
        const r = { timber: woodlotRate(S) };
        Object.keys(WS).forEach((id) => { const w = workshopRates(S, id); Object.keys(w).forEach((k) => { r[k] = (r[k] || 0) + w[k]; }); });
        if (!S.exp) { const k = knightRates(S); Object.keys(k.gain).forEach((x) => { r[x] = (r[x] || 0) + k.gain[x]; }); Object.keys(k.use).forEach((x) => { r[x] = (r[x] || 0) - k.use[x]; }); }
        const keys = Object.keys(r).filter((k) => Math.abs(r[k]) > 0.05);
        return 'Hourly flow: ' + (keys.map((k) => (r[k] > 0 ? '+' : '') + fmtRate(r[k]) + ' ' + itemName(k)).join(', ') || 'nothing yet') + '.';
    }
    function itemModal(id) {
        const r = RES[id] || {};
        return '<div class="ck-item-card">' + itemIcon(id, 'is-xl') + '<div><h2 id="ckModalTitle">' + esc(r.name || id) + '</h2><p class="ck-muted">' + esc(titleCase(r.kind || '')) + ' · ' + fl(S.inv[id]) + ' in storage</p><p>' + esc(r.blurb || '') + '</p></div></div>' +
            '<div class="ck-actions"><button type="button" class="ck-btn" data-act="close-modal">Close</button></div>';
    }
    function skillModal(id) {
        const sk = SKILLS[id], un = skillUnlocked(S, id), pr = xpProgress(S.knight.skills[id]);
        const ms = MILESTONES[id] || [];
        const opens = Object.keys(SKILLS).filter((o) => SKILLS[o].unlock.some((r) => r.kind === 'SKILL' && r.key === id));
        return '<h2 id="ckModalTitle">' + emojiIcon(SKILL_EMOJI[id] || '⭐', SKILL_LOOK[id], 'is-sm') + ' ' + esc(sk.name) + '</h2>' +
            '<div class="ck-skill' + (un ? '' : ' is-locked') + '"><div class="ck-row"><b>' + (un ? 'Level ' + pr.l : 'Locked') + '</b><span>' + (un ? esc(pr.label) : '') + '</span></div>' + (un ? barP(pr.pct) : '<span class="ck-small">' + esc(lockText(S, id)) + '</span>') +
            '<span class="ck-small ck-muted">' + esc(sk.blurb || '') + '</span>' + (TRAINED_BY[id] ? '<span class="ck-small">Trained by: ' + esc(TRAINED_BY[id]) + '</span>' : '') +
            (opens.length ? '<span class="ck-small">Unlocks ' + esc(opens.map((o) => SKILLS[o].name + ' at ' + SKILLS[o].unlock.find((r) => r.key === id).level).join(', ')) + '</span>' : '') + '</div>' +
            (ms.length ? '<ol class="ck-ladder" style="--el:var(--' + (SKILL_LOOK[id] || 'gold') + ')">' + ms.map((m) => '<li class="' + (skillLvl(S, id) >= m[0] ? 'is-on' : '') + '"><b>' + m[0] + '</b><span>' + esc(m[1]) + '</span></li>').join('') + '</ol>' : '') +
            '<div class="ck-actions"><button type="button" class="ck-btn" data-act="close-modal">Close</button></div>';
    }

    // —— Company ——
    function viewCompany() {
        const away = !!S.exp, party = prepParty(S), slots = partySlots(S);
        const POS = ['Vanguard', 'Flank', 'Rear'];
        const stage = [0, 1, 2].map((i) => {
            const id = party[i], locked = i >= slots;
            return '<div class="ck-stage-slot' + (locked ? ' is-locked' : id ? '' : ' is-empty') + '"' + (id ? ' style="--el:var(--' + C(id).el + ')"' : '') + '><span class="ck-stage-pos">' + POS[i] + '</span>' +
                (locked ? '<span class="ck-stage-ring">🔒</span><span class="ck-stage-name">Command ' + (i === 1 ? 3 : 10) + '</span>'
                    : id ? '<button type="button" class="ck-stage-ring" data-act="comp-toggle" data-arg="' + id + '" aria-label="' + esc(C(id).name) + '">' + portrait(id) + '</button><span class="ck-stage-name">' + esc(C(id).name) + '</span><span class="ck-stage-sub">' + (CLASS_EMOJI[C(id).cls] || '') + ' Lv ' + compLevel(S.comps[id]) + '</span>' +
                        (away ? '' : '<button type="button" class="ck-stage-x" data-act="party" data-arg="' + id + '" aria-label="Remove ' + esc(C(id).name) + '">&times;</button>')
                    : '<span class="ck-stage-ring">➕</span><span class="ck-stage-name">Empty</span>') + '</div>';
        }).join('');
        const lead = leadComp();
        let h = hero({ cls: 'is-stage', scene: namedScene((lead ? C(lead).el : 'earth') + '-journey'), kicker: away ? 'On the road · changes wait until they return' : 'Your expedition company', title: 'The Company', foot: '<div class="ck-stage">' + stage + '</div>' });
        h += '<section class="ck-card is-tight"><p class="ck-hint">Command ' + skillLvl(S, 'command') + ' fields ' + slots + ' Siegeling' + (slots > 1 ? 's' : '') + ' (2 at Command 3, 3 at Command 10). Each Siegeling also holds one Keep job; it pauses on the road and resumes on return.</p></section>';
        h += '<div class="ck-section-head"><h3>🐾 Sanctuary</h3><span class="ck-count">' + joinedIds(S).length + '/' + rosterCap(S) + '</span></div><div class="ck-roster">' + joinedIds(S).map(companionCard).join('') + '</div>';
        if (S.comps.fawny && !S.comps.fawny.joined) {
            h += '<section class="ck-card"><div class="ck-row">' + speciesPortrait('fawny', 'ICE', 'is-sm dm-locked') + '<div><span class="ck-kicker">Undiscovered</span><b>A Siegeling in the frost</b><p class="ck-small ck-muted">' + esc(STARTER_TRAITS.fawny.findText) + '</p></div></div></section>';
        }
        return h;
    }
    function companionCard(id) {
        const cc = C(id), c = S.comps[id], open = openComp === id, away = onExpedition(S, id), inParty = prepParty(S).includes(id);
        const lvl = compLevel(c), lo = companionXpFor(lvl), hi = companionXpFor(Math.min(cc.cap, lvl + 1)), bp = bondProgress(c.bond);
        const hearts = Array.from({ length: 5 }, (_, i) => (i < Math.min(5, Math.floor(bp.l / 20)) ? '❤️' : '🤍')).join('');
        const rl = rapportLvl(S, id);
        let body = '';
        if (open) {
            let status = jobLabel(S, id);
            if (c.job.kind === 'help') status += ' (+' + Math.round((helperMul(S, c.job.target) - 1) * 100) + '% output)';
            if (c.job.kind === 'knight') { const td = taskDef(S.knight.task); status += td ? ' (+' + Math.round(helperBonus(S, td) * 100) + '% speed on ' + taskLabel(S) + ')' : ' (the Knight is idle)'; }
            const jobs = [['help', 'Building'], ['knight', 'Assist Knight'], ['explore', 'Explore'], ['rest', 'Rest']];
            if (S.b.front >= 1) jobs.push(['front', 'Akhar’s Wall']);
            const foods = Object.keys(RES).filter((x) => RES[x].kind === 'FOOD' && RES[x].bondXp && fl(S.inv[x]) > 0);
            const day = new Date(S.t).toDateString(), used = c.treats.day === day ? c.treats.n : 0;
            const ev = evolveBlock(S, id), tr = trialBlock(S, id);
            body = '<div class="ck-comp-body">' +
                '<p class="ck-small"><b>' + esc(cc.trait) + ':</b> ' + esc(cc.traitText) + '</p>' +
                '<p class="ck-small">Level ' + lvl + '/' + cc.cap + ' · ' + (lvl >= cc.cap ? 'max' : fl(c.xp - lo) + ' / ' + (hi - lo) + ' xp') + ' · Bond ' + bp.l + ' (' + esc(bondName(c)) + ') · Rapport: ' + esc(RAPPORT_NAMES[rl]) + (rl ? ' (+' + 10 * rl + '%)' : '') + '</p>' +
                '<p class="ck-small' + (away ? ' ck-warn' : ' is-ready') + '">' + (away ? 'Travelling with the Knight. ' : '') + esc(status) + '</p>' +
                (c.job.kind === 'explore' && !away ? barP(c.explore / EXPLORE_HOURS * 100) + '<span class="ck-small ck-muted">Next cache in ' + fmtDur((EXPLORE_HOURS - c.explore) * HOUR) + '</span>' : '') +
                '<div class="ck-pills"><span class="ck-small">Keep job:</span>' + jobs.map((j) => '<button type="button" class="ck-pill' + (c.job.kind === j[0] ? ' is-on' : '') + '" data-act="cjob" data-arg="' + id + ':' + j[0] + '"' + (away ? ' disabled' : '') + '>' + j[1] + '</button>').join('') + '</div>' +
                (c.job.kind === 'help' ? '<div class="ck-pills"><span class="ck-small">Post at:</span>' + helpTargets().map((t) => {
                    const other = helperOf(S, t), taken = other && other !== id;
                    return '<button type="button" class="ck-pill' + (c.job.target === t ? ' is-on' : '') + (cc.likes.includes(t) ? ' is-love' : '') + '" data-act="cjob" data-arg="' + id + ':help:' + t + '"' + (taken || away ? ' disabled' : '') + '>' + esc(roomName(t)) + (cc.likes.includes(t) ? ' ♥' : '') + (taken ? ' · ' + esc(C(other).name) : '') + '</button>';
                }).join('') + '</div>' : '') +
                (!away && !inParty ? '<div class="ck-pills"><span class="ck-small">Company:</span><button type="button" class="ck-pill" data-act="party" data-arg="' + id + '">Add to company</button></div>' : '') +
                (!away ? '<div class="ck-pills"><span class="ck-small">Treats (' + used + '/' + DAILY_TREATS + ' today):</span>' + (foods.length ? foods.map((f) => { const b = feedBlock(S, id, f); return '<button type="button" class="ck-pill" data-act="feed" data-arg="' + id + ':' + f + '"' + (b ? ' disabled title="' + esc(b) + '"' : '') + '>' + esc(RES[f].name) + ' ×' + fl(S.inv[f]) + '</button>'; }).join('') : '<span class="ck-small ck-muted">Cook food at the Kitchen to feed.</span>') + '</div>' : '') +
                (cc.to && SPECIES[cc.to] ? '<div class="ck-evo"><b>Evolves into ' + esc(SPECIES[cc.to].name) + '</b><span class="ck-small">' + esc(ev || 'Ready!') + '</span><button type="button" class="ck-btn is-sm' + (ev ? '' : ' is-primary') + '" data-act="evolve" data-arg="' + id + '"' + (ev ? ' disabled' : '') + '>Evolve</button></div>' : '') +
                (!c.legend ? '<div class="ck-trial"><b>Legendary Bond Trial</b> <span class="ck-small">' + esc(tr || 'A solo journey with this companion. Passing makes it a Legend.') + '</span><button type="button" class="ck-btn is-sm' + (tr ? '' : ' is-primary') + '" data-act="trial" data-arg="' + id + '"' + (tr ? ' disabled' : '') + '>Begin the trial</button></div>' : '') +
                '<div class="ck-pills"><button type="button" class="ck-link" data-act="rename" data-arg="' + id + '">Rename</button></div></div>';
        }
        return '<article class="ck-comp' + (open ? ' is-open' : '') + (c.legend ? ' is-legend' : '') + '" style="--el:var(--' + cc.el + ')">' +
            '<button type="button" class="ck-comp-head" data-act="comp-toggle" data-arg="' + id + '" aria-expanded="' + open + '"><span class="ck-comp-art">' + portrait(id, 'is-card') +
            '<span class="ck-comp-lv">Lv ' + lvl + '</span><span class="ck-comp-el">' + elementIcon(cc.EL, 22) + '</span>' +
            (away ? '<span class="ck-comp-flag">🧭 Away</span>' : inParty ? '<span class="ck-comp-flag is-on">⚔️ Company</span>' : c.job.kind === 'help' ? '<span class="ck-comp-flag">⚒️ ' + esc(roomName(c.job.target)) + '</span>' : '') + '</span>' +
            '<span class="ck-comp-main"><span class="ck-comp-name">' + esc(cc.name) + (c.legend ? ' <span class="ck-legend-star">★</span>' : '') + '</span>' +
            '<span class="ck-comp-sub">' + (CLASS_EMOJI[cc.cls] || '') + ' ' + esc(cc.cls) + (c.nick ? ' · ' + esc(cc.species) : '') + '</span>' +
            (lvl >= cc.cap ? barP(100, 'is-max') : barP((c.xp - lo) / Math.max(1, hi - lo) * 100)) +
            '<span class="ck-hearts" title="Bond ' + bp.l + '">' + hearts + '<small>' + bp.l + '</small></span>' +
            (lvl >= cc.cap && cc.to && !evolveBlock(S, id) ? '<span class="ck-comp-ready">✨ Ready to evolve</span>' : '') + '</span></button>' + body + '</article>';
    }
    const helpTargets = () => HELP_TARGETS.filter((t) => (t === 'woodlot' ? S.b.woodlot >= 1 : wsBuilt(S, t)));
    const roomName = (t) => (t === 'woodlot' ? 'Woodlot' : WS[t] ? WS[t].name : titleCase(t));

    // —— Work: one page per profession, gathering or crafting, as in Chronicles ——
    const gatherSkills = () => Object.keys(SKILLS).filter((id) => Object.keys(ACTIVITIES).some((a) => ACTIVITIES[a].skillId === id));
    const craftSkills = () => Object.keys(SKILLS).filter((id) => !gatherSkills().includes(id) && Object.keys(CRAFTS).some((r) => CRAFTS[r].skillId === id));
    function activeSkill() { const d = taskDef(S.knight.task); return d ? d.skillId : ''; }
    function workSkill() {
        const all = gatherSkills().concat(craftSkills());
        if (all.includes(S.ui.workSkill)) return S.ui.workSkill;
        return activeSkill() || all[0];
    }
    function viewWork() {
        const sk = workSkill(), isCraft = craftSkills().includes(sk), group = isCraft ? craftSkills() : gatherSkills(), working = activeSkill();
        S.ui.workSkill = sk;
        return nowStrip(working) +
            '<div class="ck-worktype" role="tablist" aria-label="Task type">' +
            '<button type="button" role="tab" aria-selected="' + !isCraft + '" class="ck-type' + (!isCraft ? ' is-on' : '') + '" data-act="work-type" data-arg="gather">Gathering' + (gatherSkills().includes(working) ? '<span class="ck-dot is-on"></span>' : '') + '</button>' +
            '<button type="button" role="tab" aria-selected="' + isCraft + '" class="ck-type' + (isCraft ? ' is-on' : '') + '" data-act="work-type" data-arg="craft">Crafting' + (craftSkills().includes(working) ? '<span class="ck-dot is-on"></span>' : '') + '</button></div>' +
            '<div class="ck-skillbar" aria-label="Professions">' + group.map((id) => {
                const un = skillUnlocked(S, id), hue = SKILL_LOOK[id] || 'neutral';
                return '<button type="button" class="ck-skilltab' + (id === sk ? ' is-on' : '') + (un ? '' : ' is-locked') + '" data-act="work-skill" data-arg="' + id + '" style="--el:var(--' + hue + ')"' + (id === sk ? ' aria-current="page"' : '') + '>' +
                    emojiIcon(SKILL_EMOJI[id] || '⭐', hue, 'is-sm') + '<b>' + esc(SKILLS[id].name.replace(/^Elemental Studies$/, 'Studies')) + '</b><span class="ck-skilltab-lv">' + (un ? 'Lv ' + skillLvl(S, id) : 'Locked') + '</span>' + (id === working ? '<span class="ck-dot is-on"></span>' : '') + '</button>';
            }).join('') + '</div>' + skillHead(sk) + (isCraft ? craftPage(sk) : gatherPage(sk));
    }
    function nowStrip(working) {
        if (S.exp) return '<div class="ck-nowbar is-idle"><span class="ck-dot is-on"></span><span class="ck-nowbar-text"><b>On the road: ' + esc(expTitle(S.exp)) + '.</b><span class="ck-small ck-muted">' + esc(taskLabel(S)) + ' resumes when the Knight returns in ' + fmtDur(S.exp.endAt - S.t) + '.</span></span></div>';
        const def = taskDef(S.knight.task);
        if (!def) return '<div class="ck-nowbar is-idle"><span class="ck-dot"></span><span class="ck-nowbar-text"><b>Your knight is resting.</b><span class="ck-small ck-muted">Tap a task to start. Work runs while you are away.</span></span></div>';
        const r = knightRates(S), help = knightHelper(S);
        const g = Object.keys(r.gain).map((x) => '+' + fmtRate(r.gain[x]) + ' ' + itemName(x)), u = Object.keys(r.use).map((x) => '−' + fmtRate(r.use[x]) + ' ' + itemName(x));
        return '<div class="ck-nowbar"><button type="button" class="ck-nowbar-main" data-act="work-skill" data-arg="' + esc(working) + '">' + emojiIcon(SKILL_EMOJI[working] || '✨', SKILL_LOOK[working], 'is-sm is-spin') +
            '<span class="ck-nowbar-text"><b>' + esc(taskLabel(S)) + '</b><span class="ck-small ' + (S.knight.stall ? 'ck-warn' : 'ck-muted') + '">' + esc(S.knight.stall || (g.concat(u).join(', ') + ' per hour' + (help ? ' · ' + C(help).name + ' assisting' : ''))) + '</span></span>' +
            '<span class="ck-bar is-live"><i data-live="action"></i></span></button><button type="button" class="ck-btn is-sm" data-act="task" data-arg="idle:">Rest</button></div>';
    }
    function skillHead(id) {
        const sk = SKILLS[id], un = skillUnlocked(S, id), pr = xpProgress(S.knight.skills[id]), hue = SKILL_LOOK[id] || 'neutral';
        return hero({
            cls: 'is-skill', el: hue.toUpperCase(), scene: namedScene(PROFESSION_SCENES[id] || 'earth-journey'), kicker: (sk.group === 'Gathering' ? 'Gathering' : 'Crafting') + (un ? '' : ' · Locked') + (SKILL_PLACE[id] ? ' · ' + esc(SKILL_PLACE[id]) : ''),
            title: '<span class="ck-banner-emoji" aria-hidden="true">' + (SKILL_EMOJI[id] || '⭐') + '</span>' + esc(sk.name),
            art: '<span class="ck-level-orb' + (un ? '' : ' is-locked') + '"><small>Level</small><b>' + (un ? pr.l : '&#128274;') + '</b></span>',
            body: (un ? barP(pr.pct, 'is-fat') + '<p class="ck-banner-line">' + esc(pr.label) + ' XP</p>' : '<p class="ck-banner-line is-warn">' + esc(lockText(S, id)) + '</p>') + '<p class="ck-banner-line">' + esc(sk.blurb || '') + '</p>'
        });
    }
    const cellTop = (lv, xp) => '<span class="ck-cell-top"><span class="ck-cell-lv">Lv ' + lv + '</span><span class="ck-cell-xp">' + xp + ' xp</span></span>';
    const cellLive = () => '<span class="ck-bar is-live"><i data-live="action"></i></span><span class="ck-cell-state is-on">Working</span>';
    function gatherPage(id) {
        const rows = Object.keys(ACTIVITIES).map((a) => ACTIVITIES[a]).filter((a) => a.skillId === id).sort((a, b) => a.level - b.level);
        return '<div class="ck-cells" style="--el:var(--' + (SKILL_LOOK[id] || 'neutral') + ')">' + rows.map((a) => {
            const on = S.knight.task.kind === 'gather' && S.knight.task.id === a.id, b = taskBlock(S, a);
            const act = on || b || S.exp ? '' : ' data-act="task" data-arg="gather:' + a.id + '"';
            return '<button type="button" class="ck-cell' + (on ? ' is-on' : '') + (b ? ' is-locked' : '') + '"' + act + (b ? ' disabled' : '') + ' title="' + esc(a.place || '') + '">' + cellTop(a.level, a.xp) +
                itemIcon(al(a.output), 'is-cell') + '<b class="ck-cell-name">' + esc(a.name) + (a.dominion ? ' ·Keep' : '') + '</b><span class="ck-cell-sub">' + esc(itemName(al(a.output))) + ' · ' + fmtDur(actionMs(S, a)) + '</span>' +
                (on ? cellLive() : b ? '<span class="ck-cell-state is-lock">' + esc(b) + '</span>' : '') + '</button>';
        }).join('') + '</div>';
    }
    function recipeName(r) { return r.studyElement ? titleCase(r.studyElement) + ' studies' : itemName(al(r.output)); }
    function craftPage(id) {
        const rows = Object.keys(CRAFTS).map((r) => CRAFTS[r]).filter((r) => r.skillId === id).sort((a, b) => a.level - b.level);
        const running = S.knight.task.kind === 'craft' ? rows.find((r) => r.id === S.knight.task.id) : null;
        const pick = rows.find((r) => r.id === recipePick) || running || rows.find((r) => !craftBlock(S, r.id)) || rows.find((r) => !taskBlock(S, r)) || rows[0];
        return (pick ? '<section class="ck-card ck-pick" style="--el:var(--' + (SKILL_LOOK[id] || 'neutral') + ')">' + recipeRow(pick) + '</section>' : '') +
            '<div class="ck-cells" style="--el:var(--' + (SKILL_LOOK[id] || 'neutral') + ')">' + rows.map((r) => {
                const on = running && running.id === r.id, lock = taskBlock(S, r), out = r.studyElement ? null : al(r.output);
                const owned = out && GEAR_SLOT[(RES[out] || {}).kind] ? fl(S.inv[out]) : 0;
                const status = lock ? '<span class="ck-cell-state is-lock">' + esc(lock) + '</span>' : !r.repeatable && owned ? '<span class="ck-cell-state is-ready">Owned ' + owned + '</span>'
                    : !craftBlock(S, r.id) ? '<span class="ck-cell-state is-ready">' + (r.repeatable ? 'Can make' : 'Ready to make') + '</span>' : '<span class="ck-cell-state">Needs materials</span>';
                return '<button type="button" class="ck-cell' + (on ? ' is-on' : '') + (lock ? ' is-locked' : '') + (pick && pick.id === r.id ? ' is-picked' : '') + '" data-act="recipe-pick" data-arg="' + r.id + '" aria-pressed="' + !!(pick && pick.id === r.id) + '">' +
                    cellTop(r.level, r.xp) + (r.studyElement ? '<span class="ck-ico is-cell is-art">' + elementIcon(r.studyElement, 30) + '</span>' : itemIcon(out, 'is-cell')) + '<b class="ck-cell-name">' + esc(recipeName(r)) + '</b>' +
                    '<span class="ck-cell-sub">' + (r.repeatable ? fmtDur(actionMs(S, r)) + ' each' : 'Made once') + (r.dominion ? ' · Keep' : '') + '</span>' + (on ? cellLive() : status) + '</button>';
            }).join('') + '</div>';
    }
    function recipeRow(r) {
        const on = S.knight.task.kind === 'craft' && S.knight.task.id === r.id, lock = taskBlock(S, r), cb = craftBlock(S, r.id), inp = alMap(r.inputs), out = r.studyElement ? null : al(r.output);
        const inputs = Object.keys(inp).map((x) => '<span class="' + (fl(S.inv[x]) >= inp[x] ? '' : 'is-short') + '">' + inp[x] + ' ' + esc(itemName(x)) + ' (' + fl(S.inv[x]) + ')</span>').join(', ');
        let buttons;
        if (lock) buttons = '<span class="ck-small ck-warn">' + esc(lock) + '</span>';
        else if (r.repeatable) buttons = '<button type="button" class="ck-pill' + (on ? ' is-on' : '') + '" data-act="task" data-arg="craft:' + r.id + '"' + (on || S.exp ? ' disabled' : '') + '>' + (on ? 'Working' : 'Work idly') + '</button>' +
            '<button type="button" class="ck-pill" data-act="craft" data-arg="' + r.id + '"' + (cb ? ' disabled' : '') + '>' + (r.studyElement ? 'Study 1' : 'Make 1') + '</button>';
        else buttons = '<button type="button" class="ck-pill is-forge" data-act="craft" data-arg="' + r.id + '"' + (cb ? ' disabled' : '') + '>' + (out && fl(S.inv[out]) ? 'Make another' : 'Make') + '</button>' + (cb && !lock ? '<span class="ck-small ck-muted">' + esc(cb) + '</span>' : '');
        const blurb = r.studyElement ? 'Grows ' + titleCase(r.studyElement) + ' Affinity.' : (RES[out] && RES[out].blurb) || '';
        return '<div class="ck-recipe' + (lock ? ' is-locked' : '') + '">' + (r.studyElement ? '<span class="ck-ico is-lg is-art">' + elementIcon(r.studyElement, 40) + '</span>' : itemIcon(out, 'is-lg')) +
            '<div class="ck-recipe-main"><div class="ck-row"><b>' + esc(recipeName(r)) + (r.outputQty > 1 ? ' ×' + r.outputQty : '') + '</b><span class="ck-small">Lv ' + r.level + ' · +' + r.xp + 'xp</span></div>' +
            '<span class="ck-small ck-muted">' + esc(blurb) + (out && RES[out] && GEAR_SLOT[RES[out].kind] ? esc(gearNote(out)) : '') + '</span><span class="ck-small">' + inputs + '</span>' +
            '<div class="ck-pills">' + buttons + '</div></div></div>';
    }
    // —— Expedition ——
    function destName(id) { return DEST[id] ? DEST[id].name : titleCase(id); }
    function expTitle(x) { return x.trial ? 'Bond Trial with ' + C(x.trial).name : x.operation ? 'Siege Operation · ' + titleCase(x.front || '') : destName(x.dest); }
    function reportTitle(r) { return r.trial ? 'Bond Trial with ' + C(r.trial).name : r.operation ? 'Siege Operation' : destName(r.dest); }
    const ROUTE_EMOJI = { PATROL: '🥾', RESOURCE: '⛏️', HUNT: '🎯', DUNGEON: '💀', GRAND: '🌟' };
    const TIER_NAMES = { 0: 'The Keep’s roads', 1: 'Tier I · The Inner Wilds', 2: 'Tier II · The Outer Frontiers', 3: 'Tier III · The Forgotten Regions', 4: 'Tier IV · Legendary Expeditions' };
    function partyFaces(ids) {
        if (!ids.length) return '<span class="ck-faces is-empty">No one in the company yet</span>';
        return '<span class="ck-faces">' + ids.filter((id) => S.comps[id]).map((id) => '<span class="ck-face" style="--el:var(--' + C(id).el + ')" title="' + esc(C(id).name) + '">' + portrait(id) + '</span>').join('') + '</span>';
    }
    // —— The road, watched: the squad walks through one area per encounter on the route ——
    // Presentation only: areas split the trip evenly and read the same encounter preview the
    // report uses, so what the player watches matches what the journey resolves to.
    const BIOME_OF = { EARTH: 'forest', WIND: 'meadow', POISON: 'bog', ICE: 'snow', FIRE: 'ember', WATER: 'coast', METAL: 'ruins', ELECTRIC: 'storm',
        SHADOW: 'dusk', UNDEAD: 'dusk', PSYCHIC: 'dusk', LIGHT: 'dawn' };
    const AREA_KIND = (id) => (/^hazard/.test(id) ? 'hazard' : /^twist:/.test(id) ? 'twist' : ['pack', 'ambush', 'elite', 'boss'].includes(id) ? 'foe'
        : ['rubble', 'sealed', 'maze'].includes(id) ? 'ruin' : ['seam', 'ironwood'].includes(id) ? 'resource' : id === 'grove' ? 'grove' : 'trail');
    const AREA_PROP = { foe: '', ruin: '<i class="dm-j-arch"></i>', resource: '<i class="dm-j-rock"></i><i class="dm-j-log"></i>', grove: '<i class="dm-j-bloom"></i><i class="dm-j-bloom"></i><i class="dm-j-bloom"></i>',
        hazard: '<i class="dm-j-motes"></i>', twist: '<i class="dm-j-fog"></i>', trail: '<i class="dm-j-prints"></i>' };
    function treeStrip(biome) {
        const tree = (x, h, k) => biome === 'snow' || biome === 'forest' || biome === 'storm'
            ? '<path d="M' + x + ' ' + (100 - h) + 'l' + (k * 9) + ' ' + (h * 0.45) + 'h-' + (k * 5) + 'l' + (k * 8) + ' ' + (h * 0.35) + 'h-' + (k * 24) + 'l' + (k * 8) + '-' + (h * 0.35) + 'h-' + (k * 5) + 'z" class="t-crown"/><rect x="' + (x - 1.5) + '" y="' + (100 - h * 0.2) + '" width="3" height="' + (h * 0.2) + '" class="t-trunk"/>'
            : biome === 'ember' || biome === 'dusk' ? '<path d="M' + x + ' 100V' + (100 - h) + 'm0 ' + (h * 0.3) + 'l-' + (k * 7) + '-' + (h * 0.18) + 'M' + x + ' ' + (100 - h * 0.55) + 'l' + (k * 8) + '-' + (h * 0.2) + '" class="t-dead"/>'
            : biome === 'coast' ? '<path d="M' + x + ' 100q-2-' + (h * 0.6) + ' 3-' + h + 'M' + (x + 3) + ' ' + (100 - h) + 'q-9 2-12 8M' + (x + 3) + ' ' + (100 - h) + 'q9 1 12 8M' + (x + 3) + ' ' + (100 - h) + 'q-2-6-9-7" class="t-palm"/>'
            : biome === 'ruins' ? '<rect x="' + (x - 4) + '" y="' + (100 - h * 0.7) + '" width="8" height="' + (h * 0.7) + '" class="t-pillar"/><rect x="' + (x - 6) + '" y="' + (100 - h * 0.74) + '" width="12" height="4" class="t-pillar"/>'
            : '<circle cx="' + x + '" cy="' + (100 - h * 0.62) + '" r="' + (h * 0.32) + '" class="t-crown"/><rect x="' + (x - 1.5) + '" y="' + (100 - h * 0.35) + '" width="3" height="' + (h * 0.35) + '" class="t-trunk"/>';
        let g = '';
        for (let i = 0; i < 12; i++) g += tree(10 + i * 33 + (i % 3) * 6, 38 + ((i * 37) % 30), 1);
        return '<svg viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">' + g + '</svg>';
    }
    function journeyView(o) {
        const n = Math.max(1, o.areas.length), strip = treeStrip(o.biome);
        return '<section class="dm-journey" data-biome="' + o.biome + '" data-live="journey" data-start="' + o.start + '" data-end="' + o.end + '" data-n="' + n + '">' +
            '<img class="dm-j-far" src="' + esc(o.scene) + '" alt="" decoding="async"><i class="dm-j-sky"></i>' +
            '<div class="dm-j-layer dm-j-hills"><i></i><i></i></div>' +
            '<div class="dm-j-layer dm-j-trees is-back">' + strip + strip + '</div>' +
            '<div class="dm-j-areas">' + o.areas.map((a, i) => '<div class="dm-j-area" data-kind="' + a.kind + '" data-i="' + i + '">' + (AREA_PROP[a.kind] || '') +
                (a.kind === 'foe' && a.foe ? '<b class="dm-j-foe"><img class="dm-shade" src="' + esc(a.foe) + '" alt=""></b>' : a.kind === 'foe' ? '<b class="dm-j-foe is-blank"></b>' : '') + '</div>').join('') + '</div>' +
            '<div class="dm-j-ground"><i></i></div>' +
            '<div class="dm-j-squad">' + o.walkers.map((w, i) => '<b class="dm-j-walker' + (w.knight ? ' is-knight' : '') + '" style="--i:' + i + '">' + w.html + '</b>').join('') + '</div>' +
            '<div class="dm-j-layer dm-j-trees is-front">' + strip + strip + '</div>' +
            '<div class="dm-j-hud"><span class="ck-kicker">' + o.kicker + '</span><b class="dm-j-title">' + esc(o.title) + '</b>' +
            '<span class="dm-j-now" data-j="label">' + esc(o.areas[0] ? o.areas[0].title : 'On the road') + '</span></div>' +
            '<div class="dm-j-track">' + o.areas.map((a, i) => '<i class="dm-j-stop is-' + a.status + '" style="left:' + ((i + 0.5) / n * 100) + '%" title="' + esc(a.title) + '"></i>').join('') +
            '<span class="dm-j-marker" data-live="walker" data-start="' + o.start + '" data-end="' + o.end + '"></span></div>' +
            '<script type="application/json" class="dm-j-labels">' + JSON.stringify(o.areas.map((a) => a.title + (a.status === 'ok' ? ' · handled' : a.status === 'part' ? ' · a struggle' : a.status === 'miss' ? ' · unanswered' : ''))).replace(/</g, '\\u003c') + '</script></section>';
    }
    const knightWalker = () => ({ knight: true, html: '<span class="dm-j-knight"><img src="' + KNIGHT_ART + '" alt=""></span>' });
    const compWalker = (id) => ({ html: compArt(id, C(id).name) });
    function foeArt(seed, element) {
        const pool = Object.keys(SPECIES).filter((k) => (!element || SPECIES[k].element === element) && catalogArt(k, 240));
        const any = pool.length ? pool : Object.keys(SPECIES).filter((k) => catalogArt(k, 240));
        return any.length ? catalogArt(any[(hashOf(seed) % any.length + any.length) % any.length], 240) : '';
    }
    function expeditionJourney(x) {
        const d = DEST[x.dest] || {};
        const el = x.trial ? C(x.trial).EL : x.operation ? (x.threatEl || 'FIRE') : (d.element || 'EARTH');
        let areas;
        if (x.trial || x.operation) {
            areas = [0, 1, 2].map((i) => ({ kind: i === 2 ? 'foe' : 'trail', title: x.trial ? ['The echo stirs', 'Facing its own echo', 'The strongest of its element'][i] : ['The march out', 'Skirmish lines', 'Breaking the threat'][i], status: 'pending', foe: i === 2 ? foeArt(x.id, el) : '' }));
        } else {
            areas = (d.encounters || []).map((id) => { const r = encounter(id, x, S); return { id: id, r: r }; }).filter((a) => a.r.status !== 'skip')
                .map((a, i) => ({ kind: AREA_KIND(a.id), title: a.r.title, status: a.r.status, foe: AREA_KIND(a.id) === 'foe' ? foeArt(x.id + i, d.element) : '' }));
        }
        return journeyView({ biome: x.dest === 'ruins' ? 'ruins' : BIOME_OF[el] || 'forest', scene: x.trial || x.operation ? namedScene(elKey(el) + (x.operation ? '-boss' : '-journey')) : sceneUrl(x.dest),
            kicker: esc(x.trial ? 'Legendary Bond Trial' : x.operation ? 'Siege Operation' : (d.region || 'On the road')), title: expTitle(x), start: x.startAt, end: x.endAt,
            areas: areas, walkers: (x.trial ? [] : [knightWalker()]).concat(x.party.filter((id) => S.comps[id]).map(compWalker)) });
    }
    // Siegelings on the Explore job wander the Rootwild in a little party of their own.
    function scoutJourney() {
        const scouts = joinedIds(S).filter((id) => S.comps[id].job.kind === 'explore' && !onExpedition(S, id));
        if (!scouts.length) return '';
        const c = S.comps[scouts[0]], start = Math.round((S.t - c.explore * HOUR) / MIN) * MIN, end = start + EXPLORE_HOURS * HOUR;
        return '<div class="ck-section-head"><h3>🧭 Scouting party</h3><span class="ck-count">' + scouts.length + '</span></div>' +
            journeyView({ biome: BIOME_OF[C(scouts[0]).EL] || 'forest', scene: namedScene(C(scouts[0]).el + '-journey'), kicker: 'Exploring the wilds', title: scouts.map((id) => C(id).name).join(', '),
                start: start, end: end, areas: [{ kind: 'trail', title: 'Following old trails', status: 'pending' }, { kind: 'grove', title: 'Searching for a cache', status: 'pending' }], walkers: scouts.map(compWalker) }) +
            '<p class="ck-hint">Each scout brings back a cache every ' + EXPLORE_HOURS + ' hours. Their Keep job is Explore, so nothing else pauses.</p>';
    }
    function updateJourneys(t) {
        document.querySelectorAll('[data-live="journey"]').forEach((j) => {
            const a = Number(j.dataset.start), b = Number(j.dataset.end), n = Number(j.dataset.n) || 1;
            const p = Math.max(0, Math.min(0.9999, (t - a) / Math.max(1, b - a))), seg = p * n, idx = Math.floor(seg), f = seg - idx;
            j.style.setProperty('--f', f.toFixed(3));
            j.querySelectorAll('.dm-j-area').forEach((el) => el.classList.toggle('is-here', Number(el.dataset.i) === idx));
            if (j.dataset.area !== String(idx)) {
                j.dataset.area = String(idx);
                const labels = JSON.parse((j.querySelector('.dm-j-labels') || {}).textContent || '[]'), lab = j.querySelector('[data-j="label"]');
                if (lab && labels[idx]) lab.textContent = 'Area ' + (idx + 1) + '/' + n + ' · ' + labels[idx];
            }
        });
    }
    function viewExpedition() {
        let h = '';
        S.reports.filter((r) => !r.seen).forEach((r) => {
            h += '<button type="button" class="ck-card dm-report-card" data-act="report" data-arg="' + esc(r.id) + '"><span class="ck-kicker is-ready">New report</span><b>' + esc(reportTitle(r)) + '</b><span class="ck-small ck-muted">' + esc(r.summary) + '</span></button>';
        });
        if (S.exp) {
            const x = S.exp, d = DEST[x.dest] || {};
            h += expeditionJourney(x) + '<section class="ck-card is-tight"><div class="ck-row"><span class="ck-small">Back in ' + eta(x.endAt) + ' · ' + esc(RES[x.weaponId] ? RES[x.weaponId].name : WEAPONS[x.weapon].name) + (x.tool ? ' and ' + esc(itemName(x.tool)) : '') + '</span>' + partyFaces(x.party) + '</div>' + liveBar(x.startAt, x.endAt, 'is-fat') + '</section>';
            if (!x.trial && !x.operation && d.encounters) {
                const enc = d.encounters.map((id) => encounter(id, x, S)).filter((r) => r.status !== 'skip');
                h += '<section class="ck-card"><h3>📜 What the road holds</h3><ol class="ck-timeline">' + enc.map((r) => '<li class="is-' + (r.status === 'ok' ? 'good' : r.status === 'part' ? 'info' : 'bad') + '"><time>' + (r.status === 'ok' ? '✓' : r.status === 'part' ? '~' : '✕') + '</time><span><b>' + esc(r.title) + '.</b> ' +
                    esc(r.status === 'ok' ? 'Handled by ' + r.by + '.' : 'Best answer: ' + r.need + '.') + '</span></li>').join('') + '</ol><p class="ck-hint">The full report arrives with the company.</p></section>';
            }
            h += '<section class="ck-card"><h3>While the Knight travels</h3><p class="ck-small">Paused: ' + esc(S.knight.task.kind === 'idle' ? 'rest' : taskLabel(S)) + (x.party.length ? ', and the Keep jobs of ' + esc(x.party.filter((id) => S.comps[id]).map((id) => C(id).name).join(', ')) : '') + '.</p>' +
                '<p class="ck-small is-ready">Still running: the Woodlot, every built workshop, refining, construction, visitors and residents who stayed home.</p></section>';
            return h;
        }
        const party = prepParty(S), p = packPlan(S), wi = weaponItem(S);
        const runes = Object.keys(RES).filter((k) => RES[k].kind === 'RUNE' && fl(S.inv[k]) > 0), pots = POTIONS().filter((k) => fl(S.inv[k]) > 0);
        const weapons = Object.keys(RES).filter((w) => RES[w].kind === 'WEAPON' && fl(S.inv[w]) > 0);
        const packed = Object.keys(S.prep.potions || {}).reduce((a, k) => a + Math.min(S.prep.potions[k] || 0, fl(S.inv[k])), 0);
        h += hero({ cls: 'is-road', scene: namedScene('wind-journey'), kicker: 'Expeditions', title: 'Choose your road',
            body: '<p class="ck-banner-line">Preparation decides every encounter: weapon, tool, gear, runes and the company you bring.</p>',
            foot: partyFaces(party) + '<button type="button" class="ck-btn is-glass is-sm" data-act="tab" data-arg="company">Change company</button>' });
        h += scoutJourney();
        h += '<details class="ck-card ck-prep"' + (S.ui.prepOpen ? ' open' : '') + '><summary data-act="prep-toggle"><span class="ck-prep-title">⚙️ Loadout &amp; supplies</span><span class="ck-prep-sum">' +
            '<span class="ck-chip">' + (WEAPON_EMOJI[wi.weaponType] || '🗡️') + ' ' + esc(wi.name) + '</span><span class="ck-chip">🥖 ' + fl(S.inv.provisions) + '</span><span class="ck-chip">🧪 ' + packed + '</span>' + (S.prep.rune ? '<span class="ck-chip is-rare">📜 Rune</span>' : '') + '</span></summary>' +
            '<h4>Weapon</h4><div class="ck-pills">' + weapons.map((w) => '<button type="button" class="ck-pill' + (S.knight.equip.weapon === w ? ' is-on' : '') + '" data-act="equip" data-arg="weapon:' + w + '">' + (WEAPON_EMOJI[RES[w].weaponType] || '') + ' ' + esc(RES[w].name) + '</button>').join('') + '</div>' +
            '<p class="ck-small ck-muted">' + esc(WEAPONS[wi.weaponType || 'sword'].approach + ': ' + WEAPONS[wi.weaponType || 'sword'].detail) + '</p>' +
            '<h4>Tool</h4><div class="ck-pills">' + ['woodaxe', 'pickaxe'].filter((t) => fl(S.inv[t]) > 0).map((t) => '<button type="button" class="ck-pill' + (S.knight.tool === t ? ' is-on' : '') + '" data-act="tool" data-arg="' + t + '">' + itemEmoji(t) + ' ' + esc(RES[t].name) + '</button>').join('') + '</div>' +
            '<h4>Provisions</h4><p class="ck-small">' + fl(S.inv.provisions) + ' in store. The Kitchen packs more.</p>' +
            '<div class="ck-pills"><button type="button" class="ck-pill' + (S.prep.useRations ? ' is-on' : '') + '" data-act="rations"' + (fl(S.inv.rations) < 1 ? ' disabled' : '') + '>🍱 Pack Hearth Rations first (' + fl(S.inv.rations) + ')</button></div>' +
            '<h4>Rune (one, spent on the road)</h4>' + (runes.length ? '<div class="ck-pills"><button type="button" class="ck-pill' + (S.prep.rune ? '' : ' is-on') + '" data-act="rune" data-arg="">None</button>' + runes.map((k) => '<button type="button" class="ck-pill' + (S.prep.rune === k ? ' is-on' : '') + '" data-act="rune" data-arg="' + k + '">📜 ' + esc(RES[k].name) + ' ×' + fl(S.inv[k]) + '</button>').join('') + '</div>' : '<p class="ck-hint">Inscribe runes with Runecrafting at the Archive.</p>') +
            '<h4>Potions (up to ' + supplyCap(S) + ')</h4>' + (pots.length ? '<div class="ck-supplies">' + pots.map((k) => '<div class="ck-supply">' + itemIcon(k, 'is-sm') + '<span class="ck-supply-name">' + esc(RES[k].name) + ' <span class="ck-small">(' + fl(S.inv[k]) + ')</span></span><span class="ck-stepper"><button type="button" data-act="potion" data-arg="' + k + ':-1" aria-label="Fewer">−</button><b>' + ((S.prep.potions || {})[k] || 0) + '</b><button type="button" data-act="potion" data-arg="' + k + ':1" aria-label="More">+</button></span></div>').join('') + '</div>' : '<p class="ck-hint">Brew Herb Tonics with Alchemy.</p>') + '</details>';
        [0, 1, 2, 3, 4].forEach((tier) => {
            const ids = Object.keys(DEST).filter((id) => !DEST[id].special && (DEST[id].tier || 0) === tier && destVisible(S, id));
            if (!ids.length) return;
            h += '<div class="ck-section-head"><h3>🗺️ ' + esc(TIER_NAMES[tier]) + '</h3></div><div class="ck-routes">' + ids.map(routeCard).join('') + '</div>';
        });
        return h;
    }
    function routeCard(id) {
        const d = DEST[id], b = d.planned ? d.blurb : destBlock(S, id);
        return '<article class="ck-route' + (b ? ' is-locked' : '') + '" style="--el:var(--' + elKey(d.element) + ')"><div class="ck-route-art"><img src="' + esc(sceneUrl(id)) + '" alt="" loading="lazy" decoding="async">' +
            '<span class="ck-route-tags">' + (d.type ? '<span class="ck-tag">' + (ROUTE_EMOJI[d.type] || '🧭') + ' ' + esc(titleCase(d.type)) + '</span>' : '') + (d.hours ? '<span class="ck-tag">⏱️ ' + fmtDur(tripMs(S, id)) + '</span>' : '') + '</span>' +
            '<span class="ck-route-name">' + (d.element ? elementIcon(d.element, 20) : '') + '<b>' + esc(d.name) + '</b></span>' + (b ? '<span class="ck-route-lock">🔒</span>' : '') + '</div>' +
            '<div class="ck-route-body"><span class="ck-chips">' + (d.levelMin ? chip('Lv ' + d.levelMin + '–' + d.levelMax) : '') + (d.hours ? chip('🥖 ' + needProvisions(S, id)) : '') + (d.sighting ? chip('🪢 Sightings', 'is-help') : '') + (d.bossId ? chip('👹 Boss', 'is-boss') : '') + (d.hidden ? chip('🔍 Discovered', 'is-rare') : '') + '</span>' +
            '<span class="ck-small">' + esc(d.blurb || '') + '</span>' + (b ? '<span class="ck-small ck-warn">' + esc(b) + '</span>' : '') +
            (d.loot && Object.keys(d.loot).length ? '<span class="ck-small ck-muted">🎁 ' + esc(Object.keys(d.loot).slice(0, 5).map(itemName).join(', ')) + '</span>' : '') +
            '<div class="ck-actions">' + (d.planned ? '' : '<button type="button" class="ck-btn is-primary is-sm" data-act="plan" data-arg="' + id + '"' + (b ? ' disabled' : '') + '>🚀 Plan the road</button>') + '</div></div></article>';
    }
    function planModal(id) {
        const d = DEST[id];
        if (!d) return '';
        const prevDest = S.prep.dest;
        S.prep.dest = id;
        const x = previewContext(S), enc = d.encounters.map((e) => encounter(e, x, S)).filter((r) => r.status !== 'skip'), okN = enc.filter((r) => r.status === 'ok').length;
        const block = departBlock(S);
        S.prep.dest = prevDest;
        return '<h2 id="ckModalTitle">' + (d.element ? elementIcon(d.element, 22) + ' ' : '') + esc(d.name) + '</h2>' +
            '<p class="ck-muted">' + esc((d.region ? d.region + ' · ' : '') + fmtDur(tripMs(S, id)) + ' · ' + needProvisions(S, id) + ' provisions · party power ' + partyPower(S, x)) + '</p>' +
            '<p class="ck-small">' + esc(d.blurb || '') + (d.sighting ? ' Wild Siegeling sighting chance about ' + Math.round(d.sighting * (x.weapon === 'bow' ? 150 : 100)) + '%.' : '') + '</p>' +
            '<h3>Expected encounters · ' + okN + '/' + enc.length + '</h3><ol class="ck-timeline">' + enc.map((r) => '<li class="is-' + (r.status === 'ok' ? 'good' : r.status === 'part' ? 'info' : 'bad') + '"><time>' + (r.status === 'ok' ? '✓' : r.status === 'part' ? '~' : '✕') + '</time><span><b>' + esc(r.title) + '.</b> ' +
                esc(r.status === 'ok' ? 'Handled by ' + r.by + '.' : r.status === 'part' ? (r.by ? r.by + ' helps a little. ' : '') + 'Best answer: ' + r.need + '.' : 'Answer: ' + r.need + '.') + '</span></li>').join('') + '</ol>' +
            '<div class="ck-row">' + partyFaces(prepParty(S)) + '<span class="ck-small">' + esc(weaponItem(S).name) + (S.knight.tool ? ' · ' + esc(itemName(S.knight.tool)) : '') + '</span></div>' +
            '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="depart" data-arg="' + id + '"' + (block && !/destination/i.test(block) ? ' disabled' : '') + '>🚀 Set out</button><button type="button" class="ck-btn" data-act="close-modal">Not yet</button></div>' +
            (block ? '<p class="ck-small ck-warn">' + esc(block) + '</p>' : '');
    }
    function reportModal(id) {
        const r = S.reports.find((x) => x.id === id);
        if (!r) return '<p class="ck-muted">This report is no longer stored.</p><div class="ck-actions"><button type="button" class="ck-btn" data-act="close-modal">Close</button></div>';
        return '<h2 id="ckModalTitle">' + esc(reportTitle(r)) + '</h2><p class="ck-outcome is-complete">' + esc(r.summary) + '</p>' +
            '<h3>How preparation shaped the journey</h3><ol class="ck-timeline">' + r.lines.map((l) => '<li class="is-' + (l.status === 'ok' ? 'good' : l.status === 'miss' ? 'bad' : 'info') + '"><time>' + (l.status === 'ok' ? '✓' : l.status === 'part' ? '~' : '✕') + '</time><span><b>' + esc(l.title) + '.</b> ' + esc(l.text) + (l.status !== 'ok' && l.need ? ' <i>Next time: ' + esc(l.need) + '</i>' : '') + '</span></li>').join('') + '</ol>' +
            (r.discs.length || r.sighting ? '<h3>Discoveries</h3><ul class="ck-milestones">' + r.discs.map((d) => '<li>' + (d === 'fawny' ? 'Fawny joined the Keep.' : 'The Sealed Vault Map.') + '</li>').join('') + (r.sighting ? '<li>A wild ' + esc((SPECIES[r.sighting.species] || {}).name || r.sighting.species) + ' was sighted. Visit the Wilds within 48 hours.</li>' : '') + '</ul>' : '') +
            '<h3>Company</h3><ul class="ck-xp">' + Object.keys(r.bonds).map((k) => '<li><span>' + esc(S.comps[k] ? C(k).name : k) + '</span><b>+' + r.bonds[k] + ' bond' + (r.levels && r.levels[k] ? ' · Lv ' + r.levels[k] : '') + '</b></li>').join('') + '</ul>' +
            '<h3>Knowledge</h3><ul class="ck-xp">' + Object.keys(r.xp).map((k) => '<li><span>' + esc(SKILLS[k].name) + '</span><b>+' + r.xp[k] + ' xp</b></li>').join('') + (r.prof ? '<li><span>' + esc(WEAPONS[r.weapon].name) + '</span><b>+' + r.prof + ' xp</b></li>' : '') + '</ul>' +
            '<h3>Loot</h3>' + lootRow(r.total) + '<p class="ck-small ck-muted">Haul kept: ' + r.lootPct + '% of the base find.' + (r.resumed.length ? ' Resumed: ' + esc(r.resumed.join(' · ')) + '.' : '') + '</p>' +
            '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="close-modal">Home again</button></div>';
    }
    function awayModal() {
        const a = S.away || { ms: 0, gains: {}, notes: [] };
        return '<h2 id="ckModalTitle">While you were away</h2><p class="ck-muted">' + fmtDur(a.ms) + ' passed. Rooms filled their stores; collect them in Base.</p><h3>Gained</h3>' + lootRow(a.gains) +
            (a.notes.length ? '<h3>Around the Keep</h3><ul class="ck-milestones">' + a.notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '') +
            '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="close-modal">Continue</button></div>';
    }

    // —— Wilds ——
    function viewWilds() {
        const list = (S.sightings || []).filter((v) => v.expiresAt > S.t);
        if (!list.length) {
            return hero({ cls: 'is-road', scene: namedScene('wind-elite'), kicker: 'The Wilds', title: 'No fresh trails',
                body: '<p class="ck-banner-line">Expeditions spot wild Siegelings. Each trail waits 48 hours for you to try taming it. A Bow scouts more of them.</p>',
                foot: '<button type="button" class="ck-btn is-primary" data-act="tab" data-arg="expedition">🎯 Plan a road</button>' });
        }
        return list.map((sg) => {
            const sp = SPECIES[sg.species] || { name: sg.species, element: 'EARTH', rarity: 'COMMON', cls: 'Bruiser' };
            const lures = Object.keys(RES).filter((k) => RES[k].kind === 'LURE' && fl(S.inv[k]) > 0 && (!RES[k].lureElement || RES[k].lureElement === sp.element));
            const block = tameBlock(S, sg.id, '');
            return '<section class="ck-encounter" style="--el:var(--' + elKey(sp.element) + ')"><div class="ck-encounter-stage"><img class="ck-banner-img" src="' + esc(namedScene(elKey(sp.element) + '-journey')) + '" alt="" decoding="async"><span class="ck-banner-shade" aria-hidden="true"></span>' +
                '<p class="ck-encounter-kicker">A wild Siegeling appears!</p>' + speciesPortrait(sg.species, sp.element, 'is-encounter') +
                '<div class="ck-encounter-name"><h2>' + esc(sp.name) + '</h2><span class="ck-chips">' + elChip(sp.element) + chip((CLASS_EMOJI[sp.cls] || '') + ' ' + sp.cls) + chip(titleCase(sp.rarity)) + '</span></div></div>' +
                '<div class="ck-encounter-body"><p class="ck-hint">Spotted near ' + esc(destName(sg.route)) + ' · trail goes cold in ' + eta(sg.expiresAt) + '</p>' + (block ? '<p class="ck-small ck-warn">' + esc(block) + '</p>' : '') +
                '<div class="ck-approaches">' + approach('🧘', 'Patient approach', 'Uses your Taming skill. Costs nothing.', block ? null : Math.round(tameChance(S, sg, '') * 100), 'data-act="tame" data-arg="' + esc(sg.id) + ':"') +
                (lures.length ? lures.map((k) => approach(itemEmoji(k), RES[k].name, 'Spends one lure (' + fl(S.inv[k]) + ' left).', block ? null : Math.round(tameChance(S, sg, k) * 100), 'data-act="tame" data-arg="' + esc(sg.id) + ':' + k + '"')).join('')
                    : approach('🪝', 'Lure', 'Brew lures with Alchemy. Element lures work best.', null, '')) + '</div></div></section>';
        }).join('');
    }
    function approach(emoji, name, text, chance, attrs) {
        const ok = chance != null && attrs;
        return '<button type="button" class="ck-approach"' + (ok ? ' ' + attrs : ' disabled') + '><span class="ck-approach-ico" aria-hidden="true">' + emoji + '</span>' +
            '<span class="ck-approach-text"><b>' + esc(name) + '</b><span class="ck-small">' + esc(text) + '</span></span>' + (chance != null ? '<span class="ck-odds" style="--p:' + chance + '"><b>' + chance + '%</b></span>' : '') + '</button>';
    }

    // —— Realm: guilds, the weekly Siege Operation and the Crowns market (server) ——
    function viewRealm() {
        let h = hero({ cls: 'is-road', scene: namedScene('metal-boss'), kicker: 'Guilds &amp; the marketplace', title: 'The Realm',
            art: '<span class="ck-crowns" title="Crowns"><span aria-hidden="true">👑</span><b>' + fl(S.inv.crowns) + '</b></span>',
            body: '<p class="ck-banner-line">Shared with every Dominion tester. Your save syncs to your account.</p>' });
        if (!ONLINE) return h + '<section class="ck-card"><p class="ck-muted">This preview is offline. Guilds, operations and the market run on the live server at /dominion.</p></section>';
        if (!NET.checked) return h + '<section class="ck-card"><p class="ck-muted">Checking your account…</p></section>';
        if (!NET.signedIn) return h + '<section class="ck-card"><h3>Sign in to join the realm</h3><p class="ck-muted">Dominion plays on this device until you sign in. Signing in syncs your progress and opens guilds, operations and the market.</p><div class="ck-actions"><a class="ck-btn is-primary" href="/login">Sign in at the hub</a></div></section>';
        if (!NET.realmAt && !NET.loading) setTimeout(loadRealm, 0);
        h += '<section class="ck-card is-tight"><div class="ck-row"><span class="ck-small ck-muted">' + (NET.error ? esc(NET.error) : 'Synced ' + (NET.lastSync ? new Date(NET.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—') + ' · save v' + (S.sync.version || 0)) + '</span><button type="button" class="ck-pill" data-act="realm-refresh">Refresh</button></div></section>';
        const G = NET.guild;
        if (!G) return h + '<section class="ck-card"><p class="ck-muted">' + (NET.loading ? 'Gathering news from the realm…' : 'The realm could not be reached. Try Refresh.') + '</p></section>';
        if (!G.guild) {
            h += '<section class="ck-card"><h3>Guild</h3><p class="ck-muted">Knights join forces in guilds to break a great threat each week. Needs Knight Rank ' + G.guildRank + ' (you are ' + G.rank + ').</p>' +
                '<form data-form="guild-join"><label class="ck-field"><span>Join with a code</span><input name="code" id="dmGuildCode" maxlength="8" autocomplete="off" placeholder="ABC123"></label><div class="ck-actions"><button type="submit" class="ck-btn">Join guild</button></div></form>' +
                '<form data-form="guild-create"><label class="ck-field"><span>Or found your own</span><input name="name" id="dmGuildName" maxlength="24" autocomplete="off" placeholder="Guild name"></label><div class="ck-actions"><button type="submit" class="ck-btn is-primary">Found a guild</button></div></form></section>';
        } else {
            const g = G.guild, op = g.operation, nextT = (g.defenseThresholds || []).find((t) => t > g.defensePoints), ob = operationBlock(S);
            h += '<section class="ck-card"><div class="ck-row"><h3>🚩 ' + esc(g.name) + '</h3><span class="ck-chip">Code ' + esc(g.code) + '</span></div>' +
                '<ul class="ck-members">' + g.members.map((m) => '<li class="' + (m.you ? 'is-you' : '') + '"><span>' + esc(m.name) + '</span><b>' + m.contribution + '</b></li>').join('') + '</ul></section>' +
                '<section class="ck-card ck-operation" style="--el:var(--' + elKey(op.element) + ')"><div class="ck-operation-art"><img src="' + esc(namedScene(elKey(op.element) + '-boss')) + '" alt="" loading="lazy" decoding="async"><span class="ck-banner-shade" aria-hidden="true"></span>' +
                '<p class="ck-banner-kicker">⚔️ Siege Operation · ' + esc(op.week) + '</p><h2 class="ck-banner-title">' + elementIcon(op.element, 26) + ' ' + esc(op.threat) + '</h2></div>' +
                '<p class="ck-small">' + esc(op.blurb) + '</p><span class="ck-bar is-fat is-el is-threat"><i style="width:' + pctOf(op.damage, op.maxHp) + '%"></i></span>' +
                '<p class="ck-small">' + op.damage + ' / ' + op.maxHp + ' broken · your share ' + op.yours + ((S.opReports || []).length ? ' · ' + S.opReports.length + ' report waiting to send' : '') + '</p>' +
                (op.won ? '<p class="ck-good">The threat is broken!</p><div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="op-claim"' + (op.claimed || !op.yours ? ' disabled' : '') + '>' + (op.claimed ? 'Spoils claimed' : op.yours ? 'Claim your share' : 'Fight next week to share') + '</button></div>'
                    : '<div class="ck-fronts">' + Object.keys(CH.fronts || {}).map((fid) => '<div class="ck-front"><b>' + ({ assault: '⚔️', supply: '📦', scouting: '🔭' }[fid] || '🚩') + ' ' + esc(CH.fronts[fid].name) + '</b><span class="ck-small">' + esc(CH.fronts[fid].text) + '</span>' +
                        '<button type="button" class="ck-btn is-sm is-primary" data-act="op-go" data-arg="' + fid + '"' + (ob ? ' disabled' : '') + '>Send · 8h</button></div>').join('') + '</div>' + (ob ? '<p class="ck-small ck-muted">' + esc(ob) + '</p>' : '')) +
                '<h4>Siege defenses · level ' + g.defenseLevel + '</h4><p class="ck-small">' + g.defensePoints + (nextT ? ' / ' + nextT : '') + ' points. Each level adds 10% to every sortie.</p>' +
                '<div class="ck-pills">' + Object.keys(CH.donationPoints || {}).filter((k) => fl(S.inv[k]) > 0).map((k) => '<button type="button" class="ck-pill" data-act="donate" data-arg="' + k + '">' + esc(itemName(k)) + ' ×' + Math.min(10, fl(S.inv[k])) + ' · +' + CH.donationPoints[k] * Math.min(10, fl(S.inv[k])) + '</button>').join('') +
                (Object.keys(CH.donationPoints || {}).some((k) => fl(S.inv[k]) > 0) ? '' : '<span class="ck-small ck-muted">Planks, bars, rope, linen, rune stones, tonics and relics count.</span>') + '</div>' +
                '<div class="ck-actions"><button type="button" class="ck-link" data-act="guild-leave">Leave guild</button></div></section>';
        }
        const M = NET.market;
        if (M) {
            const owned = Object.keys(S.inv).filter((k) => tradeable(k) && fl(S.inv[k]) > 0).sort(), others = M.open.filter((l) => !l.mine);
            h += '<section class="ck-card"><h3>🛒 Marketplace</h3><p class="ck-small ck-muted">Trade materials and consumables for Crowns. Gear is never sold: a Knight wears what they craft. Sellers pay a ' + Math.round(M.fee * 100) + '% fee.</p>' +
                (others.length ? '<div class="ck-listings">' + others.map((l) => '<div class="ck-listing">' + itemIcon(l.itemId, 'is-sm') + '<div><b>' + l.qty + '× ' + esc(itemName(l.itemId)) + '</b><span class="ck-small ck-muted">' + esc(l.seller) + '</span></div><button type="button" class="ck-btn is-sm' + (fl(S.inv.crowns) >= l.price ? ' is-primary' : '') + '" data-act="mk-buy" data-arg="' + esc(l.id) + '"' + (fl(S.inv.crowns) < l.price ? ' disabled' : '') + '>👑 ' + l.price + '</button></div>').join('') + '</div>' : '<p class="ck-small ck-muted">Nothing for sale right now.</p>') +
                '<h4>Sell</h4>' + (owned.length ? '<form class="ck-sell" data-form="market-list"><select name="item" id="dmListItem" aria-label="Item">' + owned.map((k) => '<option value="' + k + '">' + esc(itemName(k)) + ' (' + fl(S.inv[k]) + ')</option>').join('') + '</select>' +
                    '<input name="qty" id="dmListQty" type="number" min="1" value="1" inputmode="numeric" aria-label="Quantity"><input name="price" id="dmListPrice" type="number" min="1" value="10" inputmode="numeric" aria-label="Price in crowns"><button type="submit" class="ck-btn is-sm">List</button></form>' : '<p class="ck-small ck-muted">Nothing to sell yet.</p>') +
                (M.mine.length ? '<h4>Your listings</h4><div class="ck-listings">' + M.mine.map((l) => '<div class="ck-listing">' + itemIcon(l.itemId, 'is-sm') + '<div><b>' + l.qty + '× ' + esc(itemName(l.itemId)) + '</b><span class="ck-small ck-muted">👑 ' + l.price + ' · ' + l.status + '</span></div>' + (l.status === 'open' ? '<button type="button" class="ck-btn is-sm" data-act="mk-cancel" data-arg="' + esc(l.id) + '">Cancel</button>' : '') + '</div>').join('') + '</div>' : '') + '</section>';
        }
        return h;
    }
    // —— Base: the Keep ——
    const BASE_SECS = [['grounds', 'Grounds'], ['visitors', 'Visitors'], ['chronicle', 'Chronicle'], ['build', 'Build'], ['keep', 'Stores'], ['log', 'Log']];
    function baseCounts() {
        return {
            visitors: visitorsHere(S).length + S.requests.filter((q) => !requestBlock(S, q.id)).length,
            chronicle: LORE().entries.filter((e) => loreOpen(S, e.id) && !S.lore[e.id]).length,
            build: projectList(S).filter((p) => !buildBlock(S, p.id)).length,
            keep: (S.events || []).filter((e) => !e.repaired && !e.repairEndAt).length
        };
    }
    function viewBase() {
        const sec = S.ui.base || 'grounds', n = baseCounts();
        // The open Grounds is one screen: the scene fills the tab and everything floats on it.
        if (sec === 'grounds' && !S.ui.room) return groundsHud(n);
        const strip = ['timber', 'stone', 'provisions', 'glass', 'silver'].map((k) => '<span class="ck-chip dm-res" title="' + esc(itemName(k)) + '">' + itemEmoji(k) + ' <b data-res="' + k + '">' + fl(S.inv[k]) + '</b>' + (k === 'timber' ? '<small>/' + timberCap(S) + '</small>' : '') + '</span>').join('');
        let h = '<div class="dm-base-head"><div class="ck-chips dm-res-strip">' + strip + '</div></div>' +
            '<div class="ck-worktype dm-base-nav" role="tablist" aria-label="Keep sections">' + BASE_SECS.map((x) =>
                '<button type="button" role="tab" aria-selected="' + (sec === x[0]) + '" class="ck-type' + (sec === x[0] ? ' is-on' : '') + '" data-act="base-sec" data-arg="' + x[0] + '">' + x[1] + (n[x[0]] ? '<span class="ck-badge dm-inline-badge">' + n[x[0]] + '</span>' : '') + '</button>').join('') + '</div>';
        if (sec === 'visitors') return h + visitorsSection();
        if (sec === 'chronicle') return h + chronicleSection();
        if (sec === 'build') return h + buildSection();
        if (sec === 'keep') return h + storesSection();
        if (sec === 'log') return h + logSection();
        return h + groundsSection();
    }
    function objectiveCard() {
        const obj = currentObjective(S);
        if (!obj) return '';
        return '<button type="button" class="ck-card dm-objective-card" data-act="objective"><span class="ck-kicker">' + esc(obj.ch.chapter) + ' · ' + (obj.i + 1) + '/' + obj.ch.steps.length + '</span><b>' + esc(obj.step.title) + '</b>' +
            '<span class="ck-small ck-muted">' + esc(obj.step.hint) + '</span><span class="dm-steps">' + obj.ch.steps.map((st, i) => '<i class="' + (S.obj[st.id] ? 'done' : i === obj.i ? 'now' : '') + '"></i>').join('') + '</span></button>';
    }
    const DOCK = [['visitors', '🚪', 'Visitors'], ['chronicle', '📜', 'Chronicle'], ['build', '🔨', 'Build'], ['keep', '📦', 'Stores'], ['log', '📓', 'Log']];
    function groundsHud(n) {
        const stored = ['woodlot'].concat(Object.keys(WS)).reduce((a, id) => a + storedCount(S, id), 0), obj = currentObjective(S);
        const res = ['timber', 'stone', 'provisions', 'glass', 'silver'].map((k) => '<span class="dm-hud-res" title="' + esc(itemName(k)) + '">' + itemEmoji(k) + '<b data-res="' + k + '">' + fl(S.inv[k]) + '</b></span>').join('');
        return '<div class="dm-grounds"><div class="dm-scene-box" id="dmSceneSlot"></div>' +
            '<div class="dm-hud-top"><div class="dm-hud-resrow">' + res + '</div>' +
            (obj ? '<button type="button" class="dm-hud-obj" data-act="objective"><span>' + (obj.i + 1) + '/' + obj.ch.steps.length + '</span><b>' + esc(obj.step.title) + '</b><i aria-hidden="true">›</i></button>' : '') + '</div>' +
            // One bar along the bottom: collect, the Quarter, then each Keep section with its count.
            '<nav class="dm-dock" aria-label="Keep actions">' +
            '<button type="button" class="' + (stored ? 'is-hot' : '') + '" data-act="collect-all"' + (stored ? '' : ' disabled') + ' aria-label="Collect everything"><span aria-hidden="true">🧺</span><small>' + (stored ? stored : 'Collect') + '</small></button>' +
            '<button type="button" data-act="room" data-arg="quarter" aria-label="Elemental Quarter"><span aria-hidden="true">⚙️</span><small>Quarter</small></button>' +
            DOCK.map((d) => '<button type="button" data-act="base-sec" data-arg="' + d[0] + '" aria-label="' + d[2] + '"><span aria-hidden="true">' + d[1] + '</span><small>' + d[2] + '</small>' +
                (n[d[0]] ? '<i class="dm-dock-badge">' + n[d[0]] + '</i>' : '') + '</button>').join('') + '</nav></div>';
    }
    function groundsSection() {
        const room = S.ui.room;
        let h = objectiveCard();
        if (room) h += roomView(room);
        else {
            const stored = ['woodlot'].concat(Object.keys(WS)).reduce((a, id) => a + storedCount(S, id), 0);
            h += '<div class="dm-scene-box" id="dmSceneSlot"></div>' +
                '<div class="ck-actions dm-grounds-actions"><button type="button" class="ck-btn' + (stored ? ' is-primary' : '') + '" data-act="collect-all"' + (stored ? '' : ' disabled') + '>🧺 Collect everything' + (stored ? ' (' + stored + ')' : '') + '</button>' +
                '<button type="button" class="ck-btn" data-act="room" data-arg="quarter">⚙️ Elemental Quarter</button></div>' +
                '<p class="ck-hint">Tap a building to step inside. Rooms fill their own stores for up to ' + STORE_HOURS + ' hours; collect them to bring the goods into storage.</p>';
        }
        return h;
    }

    // The scene is one persistent DOM node (heavy SVG), moved between a hidden host and the tab.
    function parkScene() { const sc = $('dmScene'); if (sc && sc.parentNode !== $('dmKeepHost')) $('dmKeepHost').appendChild(sc); }
    function mountScene() {
        const slot = $('dmSceneSlot');
        if (!slot) return;
        renderScene();
        slot.appendChild($('dmScene'));
    }
    function renderScene() {
        const sc = $('dmScene');
        sc.dataset.hall = String(S.b.hall);
        sc.dataset.woodlot = String(S.b.woodlot);
        sc.dataset.archive = S.b.archive >= 1 ? '1' : '0';
        sc.dataset.front = String(S.b.front || 0);
        sc.dataset.heal = String(Math.min(2, (S.b.archive >= 1 ? 1 : 0) + (S.b.woodlot >= 2 ? 1 : 0) + (S.b.hall >= 2 ? 1 : 0)));
        sc.querySelectorAll('.building-hotspot').forEach((b) => {
            const key = b.dataset.building;
            b.classList.toggle('is-building', !!buildFor(S, key) || (key === 'quarter' && (S.builds || []).some((x) => KEY_OF(x.id) === 'quarter')));
            b.classList.toggle('is-damaged', damaged(S, key === 'hall' ? 'great_hall' : key));
            b.classList.toggle('is-ready', key === 'woodlot' ? storedCount(S, 'woodlot') > 0 : key === 'quarter' ? Object.keys(WS).some((w) => storedCount(S, w) > 0) : false);
        });
        for (let n = 2; n <= 8; n++) sc.classList.toggle('hall-l' + n, S.b.hall >= n);
        sc.dataset.theme = S.theme || 'covenant';
        const th = HALL_THEMES.find((t) => t[0] === S.theme);
        sc.style.setProperty('--hall-accent', th ? th[2] : '#f4cc62');
        const lbl = (k, v) => { const e = sc.querySelector('[data-label="' + k + '"]'); if (e) e.textContent = v; };
        lbl('hall', HALL_RANKS[S.b.hall - 1] + (rebirths(S) ? ' · ' + REBIRTH_TITLES[rebirths(S)] : ''));
        lbl('woodlot', S.b.woodlot >= 1 ? 'Lv ' + S.b.woodlot + ' · ' + storedCount(S, 'woodlot') + ' to collect' : 'Cleared ground · ' + WOODLOT_COST + ' Timber');
        lbl('archiveName', S.b.archive >= 1 ? 'Archive' : 'Ruined Archive');
        lbl('archive', S.b.archive >= 1 ? 'Studies · Chronicle' : '60 Timber + 3 Glass');
        const built = Object.keys(WS).filter((w) => wsBuilt(S, w)).length, act = activeRecipes(S);
        lbl('quarter', !built ? 'Empty plots · build workshops' : built + '/6 workshops' + (act.length ? ' · ' + act.length + ' linked' : ''));
        const resting = joinedIds(S).filter((id) => S.comps[id].job.kind === 'rest' && !onExpedition(S, id));
        lbl('enclave', resting.length ? resting.map((id) => C(id).name).join(', ') + ' resting' : 'Residents rest here');
        lbl('front', S.b.front >= 1 ? 'Rank ' + S.b.front + ' · ' + Math.min(defenders(S).length, frontCap(S)) + '/' + frontCap(S) + ' posted' : 'Unbuilt · Hall 2');
        $('dmQuarterMini').innerHTML = S.grid.map((c, i) => c ? '<i class="quarter-building quarter-' + c.id + '" style="left:' + (4 + (i % 3) * 33) + '%;bottom:' + (6 + (2 - Math.floor(i / 3)) * 31) + '%"><b></b></i>' : '').join('') +
            links(S.grid).filter((l) => l.recipe).map((l) => {
                const ra = Math.floor(l.a / 3), ca = l.a % 3, rb = Math.floor(l.b / 3), cb = l.b % 3;
                if (ra === rb) return '<i class="quarter-link" style="left:' + (24 + Math.min(ca, cb) * 33) + '%;bottom:' + (18 + (2 - ra) * 31) + '%;width:16%"></i>';
                return '<i class="quarter-link" style="left:' + (15 + ca * 33) + '%;bottom:' + (6 + (2 - Math.max(ra, rb)) * 31 + 22) + '%;width:4px;height:12%"></i>';
            }).join('');
        // Posted defenders stand on the wall as paper standees; Akhar's raiders are shades.
        $('dmWallDefenders').innerHTML = defenders(S).slice(0, frontCap(S)).map((id) => '<b>' + compArt(id, '') + '</b>').join('');
        const ov = [];
        if (S.exp) ov.push('<button class="dm-knight" type="button" data-act="tab" data-arg="expedition" style="top:auto;bottom:31%" aria-label="Knight on expedition"><span class="dm-art" style="opacity:.55">' + artImg('knight', '') + '</span><span class="dm-pip">' + esc(expTitle(S.exp)) + ' · <span data-live="eta" data-end="' + S.exp.endAt + '"></span></span></button>');
        else {
            const td = taskDef(S.knight.task);
            ov.push('<button class="dm-knight" type="button" data-act="tab" data-arg="work" aria-label="The Knight"><span class="dm-art">' + artImg('knight', '') + '</span><span class="dm-pip green">' + esc(td ? taskLabel(S) : 'Resting') + '</span></button>');
        }
        const spot = { woodlot: 'left:30%;bottom:22%', forge: 'left:6%;top:41%', fridge: 'left:30%;top:52%', generator: 'left:30%;top:39%', garden: 'left:6%;top:52%', kitchen: 'left:18%;top:52%', quarry: 'left:18%;top:41%' };
        let restSlot = 0, exploreSlot = 0;
        joinedIds(S).slice(0, 12).forEach((id) => {
            const c = S.comps[id];
            if (onExpedition(S, id) || c.job.kind === 'front' || c.job.kind === 'knight') return;
            if (c.job.kind === 'rest' && restSlot >= 4) return;
            let pos;
            if (c.job.kind === 'help') pos = spot[c.job.target];
            else if (c.job.kind === 'rest') pos = 'right:' + (8 + restSlot++ * 11) + '%;top:42%';
            else pos = 'left:' + (44 + exploreSlot++ * 9) + '%;bottom:2%;opacity:.7';
            if (pos) ov.push('<span class="dm-resident" style="' + pos + '" title="' + esc(C(id).name) + '">' + compArt(id, C(id).name) + '</span>');
        });
        const pipPos = { hall: 'left:50%;top:12%;transform:translateX(-50%)', woodlot: 'left:8%;bottom:30%', archive: 'right:8%;bottom:31%', front: 'left:4%;top:20%', quarter: 'left:4%;top:37%' };
        (S.builds || []).forEach((b, i) => {
            const pos = pipPos[KEY_OF(b.id)] || ('left:50%;bottom:' + (14 + i * 6) + '%;transform:translateX(-50%)');
            ov.push('<span class="dm-pip" style="' + pos + '">⚒ <span data-live="eta" data-end="' + b.endAt + '"></span></span>');
        });
        const dmg = (S.events || []).filter((e) => !e.repaired);
        if (dmg.length) ov.push('<button class="dm-pip" type="button" data-act="base-sec" data-arg="keep" style="right:4%;top:31%;pointer-events:auto;border-color:rgba(255,138,115,.7);color:#ffb3a3">' + dmg.length + ' to repair</button>');
        // Visitors at the gate are counted on the Grounds dock, not as a pip over the Archive.
        $('dmSceneOverlay').innerHTML = ov.join('');
    }

    // —— Interiors: the Keep's rooms, entered from the scene ——
    const ROOM_KEY = { hall: 'great_hall', woodlot: 'woodlot', archive: 'archive', enclave: 'enclave', garden: 'garden', forge: 'forge', fridge: 'fridge', generator: 'generator', quarry: 'quarry', kitchen: 'kitchen' };
    const ROOM_TITLE = { hall: 'Great Hall', woodlot: 'Woodlot Lodge', archive: 'Archive', enclave: 'Siegeling Enclave', quarter: 'Elemental Quarter', front: 'Akhar’s Wall' };
    function tourRooms() { return ['hall', 'woodlot', 'archive', 'quarter'].concat(Object.keys(WS).filter((w) => wsBuilt(S, w)), ['enclave', 'front']); }
    const roomTitle = (id) => (WS[id] ? WS[id].name : id === 'archive' && S.b.archive < 1 ? 'Ruined Archive' : ROOM_TITLE[id] || titleCase(id));
    function roomBuilt(id) {
        if (id === 'woodlot') return S.b.woodlot >= 1;
        if (id === 'archive') return true;
        if (id === 'front') return S.b.front >= 1;
        if (WS[id]) return wsBuilt(S, id);
        return true;
    }
    let ROOM_HTML = {};
    function roomStage(id) {
        if (id === 'front') return wallStage();
        if (id === 'quarter') return '<div class="dm-quarter-stage">' + quarterGrid() + '</div>';
        const key = ROOM_KEY[id], tpl = ROOM_HTML[key] || '';
        let site = '';
        const b = (S.builds || []).find((x) => (id === 'woodlot' && x.id === 'woodlot_1') || x.id === 'ws_' + id + '_1' || (id === 'archive' && x.id === 'archive'));
        if (!roomBuilt(id) || b) {
            site = '<div class="dm-site' + (b ? ' is-working' : '') + '"><span class="dm-site-scaffold"><i></i><i></i><i></i></span><span class="dm-site-crates"><i></i><i></i></span>' +
                '<span class="dm-site-label">' + (b ? '⚒ ' + esc(b.name) + ' · ' + eta(b.endAt) : 'Cleared ground, waiting for a crew') + '</span>' + (b ? liveBar(b.startAt, b.endAt, 'dm-site-bar') : '') + '</div>';
        }
        return tpl + site;
    }
    function roomView(id) {
        const rooms = tourRooms(), i = Math.max(0, rooms.indexOf(id)), prev = rooms[(i - 1 + rooms.length) % rooms.length], next = rooms[(i + 1) % rooms.length];
        const fill = Math.round((id === 'woodlot' || WS[id] ? storeFill(S, id) : 0) * 4);
        return '<section class="dm-interior"><div class="keep-interior" aria-hidden="false" data-room="' + (ROOM_KEY[id] || id) + '" data-hall-theme="' + esc(S.theme || 'covenant') + '" data-fill="' + fill + '" data-archive-restored="' + (S.b.archive >= 1) + '">' +
            '<header class="interior-bar"><button class="interior-exit" type="button" data-act="room" data-arg=""><span aria-hidden="true">⟵</span> Grounds</button><div class="interior-heading"><span class="eyebrow">' + (roomBuilt(id) ? 'Inside' : 'Building site') + '</span><h2>' + esc(roomTitle(id)) + '</h2></div></header>' +
            '<div class="interior-viewport"><div class="interior-stage" id="dmRoomStage">' + roomStage(id) + '</div>' +
            '<nav class="interior-nav" aria-label="Move between buildings"><button class="interior-arrow arrow-prev" type="button" data-act="room" data-arg="' + prev + '"><span aria-hidden="true">‹</span><small>' + esc(roomTitle(prev)) + '</small></button>' +
            '<button class="interior-arrow arrow-next" type="button" data-act="room" data-arg="' + next + '"><small>' + esc(roomTitle(next)) + '</small><span aria-hidden="true">›</span></button>' +
            '<div class="interior-rail" role="tablist">' + rooms.map((r) => '<button type="button" class="rail-dot' + (r === id ? ' is-current' : '') + '" data-act="room" data-arg="' + r + '" aria-label="' + esc(roomTitle(r)) + '"></button>').join('') + '</div></nav></div></div>' +
            '<div class="dm-room-actions">' + roomActions(id) + '</div></section>';
    }
    // After the interior is in the DOM: residents, installed tools and displayed decorations.
    function decorateRoom() {
        const st = $('dmRoomStage');
        if (!st) return;
        const id = S.ui.room;
        const helper = id === 'hall' ? (joinedIds(S)[0] || '') : helperOf(S, id);
        const res = st.querySelector('.lodge-resident, .facility-room-resident, .hall-favorite-resident');
        // Only a standing room has a resident, and only real card art makes a standee.
        if (res && helper && !onExpedition(S, helper) && roomBuilt(id) && catalogArt(speciesOf(helper).id, 240)) {
            res.classList.remove('hidden');
            const art = res.querySelector('span'), name = res.querySelector('small');
            if (art) { art.className = 'dm-room-cutout'; art.innerHTML = compArt(helper, ''); }
            if (name) name.textContent = C(helper).name;
        }
        st.querySelectorAll('[data-enclave-resident-slot]').forEach((b, i) => {
            const here = joinedIds(S).filter((u) => S.comps[u].job.kind === 'rest' && !onExpedition(S, u));
            const show = here[i] && catalogArt(speciesOf(here[i]).id, 240);
            b.innerHTML = show ? compArt(here[i], '') : '';
            b.className = show ? 'dm-room-cutout' : '';
        });
        st.querySelectorAll('[data-decoration-art]').forEach((d) => d.classList.toggle('is-placed', !!S.placed[d.dataset.decorationArt]));
        const tool = Object.keys(KEEP_CRAFTS).find((k) => KEEP_CRAFTS[k][1] === 'TOOL' && KEEP_CRAFTS[k][2] === id && S.crafted[k]);
        st.querySelectorAll('.room-tool-set').forEach((t) => { t.classList.toggle('has-installed-tools', !!tool); const one = t.querySelector('[data-tool-tier="1"]'); if (one) one.classList.toggle('is-crafted', !!tool); });
        const plinth = st.querySelector('.arch-plinth');
        if (plinth) plinth.classList.toggle('hidden', !loreOpen(S, 'memorabilia_petrified_root'));
    }
    function wallStage() {
        const lvl = S.b.front || 0, defs = defenders(S).slice(0, frontCap(S));
        const pool = Object.keys(SPECIES).filter((k) => SPECIES[k].rarity === 'COMMON');
        const raiders = lvl ? [0, 1, 2].map((i) => pool[(hashOf('raid' + Math.floor(S.t / HOUR) + i) % pool.length + pool.length) % pool.length]) : [];
        return '<div class="dm-wall-stage" data-level="' + lvl + '"><i class="dm-wall-sky"></i><i class="dm-wall-hills"></i>' +
            '<div class="dm-wall-raiders">' + raiders.map((sp) => '<b>' + (catalogArt(sp, 240) ? '<img class="dm-shade" src="' + esc(catalogArt(sp, 240)) + '" alt="">' : '') + '</b>').join('') + '</div>' +
            (lvl ? '<svg class="dm-wall-svg" viewBox="0 0 360 150" preserveAspectRatio="none"><path d="M0 64h28V37h32v27h30V37h32v27h30V37h32v27h30V37h32v27h30V37h32v27h52v86H0z" fill="#b48b58" stroke="#3d2a1b" stroke-width="5"/><path d="M0 77h360" stroke="#e0bd83" stroke-width="4" opacity=".6"/></svg>'
                : '<svg class="dm-wall-svg is-ruin" viewBox="0 0 360 150" preserveAspectRatio="none"><path d="M0 128h60v-14h40v14h70v-8h50v8h140v22H0z" fill="#7b6650" stroke="#3d2a1b" stroke-width="4"/><path d="M20 112l14-10 10 12M200 116l18-12 8 10M290 118l12-8 10 10" stroke="#5a4634" stroke-width="5" fill="none"/></svg>') +
            '<div class="dm-wall-defenders">' + defs.map((id) => '<b class="dm-room-cutout">' + compArt(id, '') + '</b>').join('') + '</div>' +
            (lvl ? '' : '<span class="dm-site-label">Foundations of Akhar’s Wall</span>') + '</div>';
    }
    function quarterGrid() {
        return '<div class="dm-quarter' + (arranging ? ' is-arranging' : '') + (quarterSel >= 0 && arranging ? ' has-selection' : '') + '" role="grid" aria-label="Elemental Quarter plots">' + S.grid.map((c, i) => plotHtml(i)).join('') + '</div>';
    }
    function plotHtml(i) {
        const c = S.grid[i], sel = i === quarterSel, lab = 'Plot ' + (Math.floor(i / 3) + 1) + '-' + (i % 3 + 1);
        if (!c) return '<button class="dm-plot is-empty' + (sel ? ' is-selected' : '') + '" type="button" data-act="plot" data-arg="' + i + '" aria-label="' + lab + ', empty"></button>';
        const W = WS[c.id];
        let extra = '';
        links(S.grid).forEach((l) => {
            if (l.a !== i) return;
            const waiting = l.recipe && !canRefine(S, l.recipe) && S.refine[l.recipe] >= 1 - 1e-9, cls = l.recipe ? (waiting ? 'wait' : '') : 'dead';
            const name = l.recipe ? RECIPES[l.recipe].name + (waiting ? ' (waiting)' : '') : 'No recipe';
            if (l.dir === 1) extra += '<i class="dm-link ' + cls + '" style="right:-12px;top:calc(50% - 3px);width:14px;height:6px"></i><span class="dm-link-label" style="left:100%;top:50%">' + esc(name) + '</span>';
            else extra += '<i class="dm-link ' + cls + '" style="bottom:-12px;left:calc(50% - 3px);height:14px;width:6px"></i><span class="dm-link-label" style="left:50%;top:100%">' + esc(name) + '</span>';
        });
        return '<button class="dm-plot' + (sel ? ' is-selected' : '') + '" type="button" data-act="plot" data-arg="' + i + '" style="--el:var(--' + W.el + ')" aria-label="' + esc(W.name) + ', ' + lab + ', ' + notchCount(S, c.id) + ' notch' + (notchCount(S, c.id) > 1 ? 'es' : '') + ' facing ' + notchDirs(c.rot, notchCount(S, c.id)).map((d) => ['north', 'east', 'south', 'west'][d]).join(', ') + '" aria-pressed="' + sel + '">' +
            '<span class="dm-ws-art">' + (WORKSHOP_ART[c.id] || '') + '</span><span class="dm-ws-name">' + esc(W.name) + (storedCount(S, c.id) ? ' · ' + storedCount(S, c.id) : '') + '</span>' +
            notchDirs(c.rot, notchCount(S, c.id)).map((d) => '<i class="dm-socket' + (linkedOn(i, d) ? ' is-linked' : '') + '" data-dir="' + d + '"></i>').join('') + extra + '</button>';
    }
    // A notch is lit when it is one end of a link, so the grid shows which sides are working.
    function linkedOn(i, d) {
        return links(S.grid).some((l) => (l.a === i && l.dir === d) || (l.b === i && (l.dir + 2) % 4 === d));
    }
    function projectCard(p) {
        const b = buildBlock(S, p.id);
        return '<section class="ck-card dm-project"><div class="ck-row"><b>' + esc(p.name) + '</b>' + chip('⏱️ ' + fmtDur(p.ms)) + '</div><p class="ck-small ck-muted">' + esc(p.effect) + '</p>' + costRow(p.cost) +
            '<div class="ck-actions"><button type="button" class="ck-btn is-sm' + (b ? '' : ' is-primary') + '" data-act="build" data-arg="' + p.id + '"' + (b ? ' disabled' : '') + '>🔨 Build</button>' + (b ? '<span class="ck-small ck-muted">' + esc(b) + '</span>' : '') + '</div></section>';
    }
    function underway(filter) {
        return (S.builds || []).filter((b) => filter(b.id)).map((b) => '<section class="ck-card"><div class="ck-row"><b>⚒ ' + esc(b.name) + '</b>' + eta(b.endAt) + '</div>' + liveBar(b.startAt, b.endAt) + '</section>').join('');
    }
    const projects = (re) => underway((id) => re.test(id)) + projectList(S).filter((p) => re.test(p.id)).map(projectCard).join('');
    function produceCard(id) {
        const rates = id === 'woodlot' ? { timber: woodlotRate(S) } : workshopRates(S, id), st = storedOf(S, id), helper = helperOf(S, id), n = storedCount(S, id);
        const keys = Object.keys(rates).filter((k) => rates[k] > 0);
        return '<section class="ck-card"><div class="ck-row"><h3>🧺 Stores</h3>' + chip(Math.round(storeFill(S, id) * 100) + '% full') + '</div>' +
            barP(storeFill(S, id) * 100, 'is-fat') + '<p class="ck-small">' + (keys.length ? keys.map((k) => fmtRate(rates[k]) + ' ' + esc(itemName(k)) + '/h').join(' · ') : 'Not producing.') + (damaged(S, id === 'hall' ? 'great_hall' : id) ? ' <span class="ck-warn">Damaged: repair it in Stores.</span>' : '') + '</p>' +
            (Object.keys(st).length ? lootRow(Object.fromEntries(Object.keys(st).map((k) => [k, fl(st[k])]))) : '') +
            '<div class="ck-actions"><button type="button" class="ck-btn' + (n ? ' is-primary' : '') + '" data-act="collect" data-arg="' + id + '"' + (n ? '' : ' disabled') + '>Collect' + (n ? ' ' + n : '') + '</button></div>' +
            '<h4>Resident</h4><div class="ck-pills">' + (helper ? '<span class="ck-chip is-help">' + esc(C(helper).name) + ' +' + Math.round((helperMul(S, id) - 1) * 100) + '%' + (onExpedition(S, helper) ? ' (away)' : '') + '</span><button type="button" class="ck-pill" data-act="cjob" data-arg="' + helper + ':rest">Send to rest</button>' : '') +
            joinedIds(S).filter((u) => u !== helper && !onExpedition(S, u) && !(S.comps[u].job.kind === 'help' && S.comps[u].job.target !== id && false)).slice(0, 8).map((u) => '<button type="button" class="ck-pill' + (C(u).likes.includes(id) ? ' is-love' : '') + '" data-act="cjob" data-arg="' + u + ':help:' + id + '"' + (helper ? ' disabled' : '') + '>' + esc(C(u).name) + (C(u).likes.includes(id) ? ' ♥' : '') + '</button>').join('') + '</div>' +
            '<p class="ck-hint">♥ marks a favourite room: +30%. Rapport from the Enclave lifts every helper further.</p></section>';
    }
    function roomCrafts(room) {
        const ids = Object.keys(KEEP_CRAFTS).filter((k) => KEEP_CRAFTS[k][2] === room);
        if (!ids.length) return '';
        return '<section class="ck-card"><h3>🛠️ Tools &amp; decorations</h3>' + ids.map((k) => {
            const c = KEEP_CRAFTS[k], b = keepCraftBlock(S, k), made = !!S.crafted[k];
            return '<div class="ck-recipe">' + emojiIcon(c[1] === 'TOOL' ? '🔧' : c[1] === 'BONUS' ? '📦' : '🎨', 'earth', 'is-lg') + '<div class="ck-recipe-main"><div class="ck-row"><b>' + esc(c[0]) + '</b><span class="ck-small">' + titleCase(c[1]) + '</span></div>' +
                '<span class="ck-small ck-muted">' + (c[1] === 'TOOL' ? 'Lifts this room’s output 20%.' : c[1] === 'BONUS' ? 'A lasting bonus for the Keep.' : 'Displayed in the room. Residents notice new pieces.') + '</span>' + (made ? '' : costRow(ka(c[3]))) +
                '<div class="ck-pills">' + (made ? (c[1] === 'DECORATION' ? '<button type="button" class="ck-pill' + (S.placed[k] ? ' is-on' : '') + '" data-act="decor" data-arg="' + k + '">' + (S.placed[k] ? 'Displayed · store it' : 'Display it') + '</button>' : '<span class="ck-small is-ready">Installed</span>')
                    : '<button type="button" class="ck-pill is-forge" data-act="kcraft" data-arg="' + k + '"' + (b ? ' disabled title="' + esc(b) + '"' : '') + '>Craft</button>') + '</div></div></div>';
        }).join('') + '</section>';
    }
    function roomActions(id) {
        if (id === 'quarter') return quarterActions();
        if (id === 'front') {
            let h = '<section class="ck-card"><h3>🏰 Akhar’s Wall</h3><p class="ck-small ck-muted">Akhar’s raiders test the Keep from the east. Siegelings posted on the rampart hold them back and earn ' + frontRatePer(S) + ' Crowns an hour each.</p>';
            if (S.b.front >= 1) {
                h += '<h4>Rampart posts · ' + Math.min(defenders(S).length, frontCap(S)) + '/' + frontCap(S) + '</h4><div class="ck-pills">' + joinedIds(S).filter((u) => !onExpedition(S, u)).map((u) => {
                    const on = S.comps[u].job.kind === 'front';
                    return '<button type="button" class="ck-pill' + (on ? ' is-on' : '') + '" data-act="cjob" data-arg="' + u + ':' + (on ? 'rest' : 'front') + '">' + esc(C(u).name) + (on ? ' · posted' : '') + '</button>';
                }).join('') + '</div>';
            }
            return h + '</section>' + projects(/^front_/);
        }
        if (!roomBuilt(id)) {
            const re = id === 'woodlot' ? /^woodlot_1$/ : new RegExp('^ws_' + id + '_1$');
            return '<section class="ck-card"><p class="ck-small">' + esc(id === 'woodlot' ? BUILDINGS.woodlot.blurb : WS[id].blurb) + '</p></section>' + projects(re);
        }
        if (id === 'woodlot') {
            return produceCard('woodlot') + '<section class="ck-card"><h3>🪓 The Knight</h3><p class="ck-small">' + (S.exp ? 'Away on the road.' : S.knight.task.kind === 'gather' && S.knight.task.id === 'chop_pine' ? 'Cutting pine here: ' + fmtRate(knightRates(S).gain.timber || 0) + ' Timber/h straight to storage.' : 'Working elsewhere.') + '</p>' +
                (!S.exp && !(S.knight.task.kind === 'gather' && S.knight.task.id === 'chop_pine') ? '<div class="ck-actions"><button type="button" class="ck-btn is-sm" data-act="task" data-arg="gather:chop_pine">Cut pine here</button></div>' : '') + '</section>' +
                roomCrafts('woodlot') + projects(/^(woodlot_2|wing_stable)/);
        }
        if (WS[id]) {
            const rs = Object.keys(RECIPES).filter((r) => RECIPES[r].pair.includes(id));
            const nn = notchCount(S, id);
            return produceCard(id) + '<section class="ck-card"><div class="ck-row"><h3>🔗 Notches &amp; links</h3>' + chip('Level ' + (S.wsl[id] || 1) + ' · ' + nn + '/4 notches') + '</div><p class="ck-small ck-muted">' + esc(WS[id].blurb) + ' Upgrading opens more notches, so it can link to more neighbours at once.</p><ul class="ck-cross">' + rs.map((r) => {
                const on = activeRecipes(S).includes(r);
                return '<li class="' + (on ? 'is-on' : '') + '"><b>' + esc(RECIPES[r].name) + '</b> <span class="ck-small">' + esc(WS[RECIPES[r].pair[0]].name + ' + ' + WS[RECIPES[r].pair[1]].name) + '</span><span class="ck-small ck-muted">' + (on ? 'Linked and refining.' : 'Face the two sockets at each other in the Quarter.') + '</span></li>';
            }).join('') + '</ul><div class="ck-actions"><button type="button" class="ck-btn is-sm" data-act="room" data-arg="quarter">Arrange the Quarter</button></div></section>' +
                roomCrafts(id) + projects(new RegExp('^(ws_' + id + '_[234]|annex_' + id + ')$'));
        }
        if (id === 'archive') {
            if (S.b.archive < 1) return '<section class="ck-card"><p class="ck-small">' + esc(BUILDINGS.archive.blurb) + '</p></section>' + projects(/^archive$/);
            const unread = LORE().entries.filter((e) => loreOpen(S, e.id) && !S.lore[e.id]).length;
            return '<section class="ck-card"><h3>📚 Elemental Studies</h3><p class="ck-small">Elemental Studies Lv ' + skillLvl(S, 'elemental_studies') + ' · Runecrafting ' + (skillUnlocked(S, 'runecrafting') ? 'Lv ' + skillLvl(S, 'runecrafting') : esc(lockText(S, 'runecrafting'))) + ' · Insight ' + fl(S.inv.insight) + '</p>' +
                '<div class="ck-actions">' + (!S.exp && !(S.knight.task.kind === 'gather' && S.knight.task.id === 'read_records') ? '<button type="button" class="ck-btn is-sm is-primary" data-act="task" data-arg="gather:read_records">Read the Covenant Records</button>' : '') +
                '<button type="button" class="ck-btn is-sm" data-act="work-skill" data-arg="elemental_studies">Essence studies</button></div></section>' +
                '<section class="ck-card"><h3>📜 The Chronicle</h3><p class="ck-small">' + LORE().entries.filter((e) => loreOpen(S, e.id)).length + ' of ' + LORE().entries.length + ' records recovered' + (unread ? ', ' + unread + ' unread' : '') + '.</p><div class="ck-actions"><button type="button" class="ck-btn is-sm" data-act="base-sec" data-arg="chronicle">Open the Chronicle</button><button type="button" class="ck-btn is-sm" data-act="base-sec" data-arg="visitors">Speak with visitors</button></div></section>' +
                (S.disc.vaultMap ? '<section class="ck-card"><h3>🗺️ Sealed Vault Map</h3><p class="ck-small ck-muted">' + (skillLvl(S, 'elemental_studies') >= 10 ? 'Vault Cipher reads the map: it points to the Sunken Vault, not built in this slice.' : 'Its script needs Elemental Studies 10 to read.') + '</p></section>' : '') +
                projects(/^wing_library/);
        }
        if (id === 'enclave') {
            const here = joinedIds(S);
            return '<section class="ck-card"><h3>🐾 Residents · ' + here.length + '/' + rosterCap(S) + '</h3><p class="ck-small ck-muted">Each resident asks three things of the Keep. Finish a task, then bank it here for rapport, Silver and Crowns. Rapport lifts everything they help with by 10% a level.</p></section>' +
                here.map((u) => {
                    const lvl = rapportLvl(S, u), pts = S.rapport[u] || 0, nextAt = RAPPORT_AT[lvl + 1], p = S.tasks[u] || {};
                    return '<section class="ck-card dm-resident-card" style="--el:var(--' + C(u).el + ')"><div class="ck-row">' + portrait(u, 'is-sm') + '<div class="dm-grow"><b>' + esc(C(u).name) + '</b><span class="ck-small ck-muted"> · ' + esc(RAPPORT_NAMES[lvl]) + (lvl ? ' (+' + 10 * lvl + '%)' : '') + '</span>' +
                        barP(nextAt ? (pts - RAPPORT_AT[lvl]) / (nextAt - RAPPORT_AT[lvl]) * 100 : 100, 'is-el') + '<span class="ck-small ck-muted">' + (nextAt ? pts + ' / ' + nextAt + ' rapport' : 'Bonded') + ' · ' + esc(onExpedition(S, u) ? 'Away with the Knight' : jobLabel(S, u)) + '</span></div></div>' +
                        '<ul class="ck-cross">' + residentTasks(u).map((t) => {
                            const v = p[t.id] || 0, done = v >= t.goal;
                            return '<li class="' + (done ? 'is-on' : '') + '"><b>' + esc(t.name) + '</b> <span class="ck-small">' + v + '/' + t.goal + ' · +' + t.rapport + ' rapport</span><span class="ck-small ck-muted">' + esc(t.description) + '</span>' +
                                (done ? '<button type="button" class="ck-pill is-on" data-act="bank" data-arg="' + u + ':' + t.id + '">Bank it</button>' : '') + '</li>';
                        }).join('') + '</ul>' + (S.comps[u].job.kind !== 'rest' && !onExpedition(S, u) ? '<div class="ck-pills"><button type="button" class="ck-pill" data-act="cjob" data-arg="' + u + ':rest">Rest here</button></div>' : '') + '</section>';
                }).join('') + projects(/^wing_sanctuary/);
        }
        // Great Hall
        return '<section class="ck-card"><h3>🏛️ ' + esc(HALL_RANKS[S.b.hall - 1]) + '</h3><p class="ck-small">Keep rank ' + S.b.hall + ' of 8. Each rank adds 5% to Keep production and opens new projects.</p>' +
            '<p class="ck-small ck-muted">' + esc(S.exp ? 'The Knight is away on ' + expTitle(S.exp) + '.' : S.knight.task.kind === 'idle' ? 'The Knight rests by the hearth.' : 'The Knight is working: ' + taskLabel(S) + '.') + '</p>' +
            '<h4>Hall banners</h4><div class="ck-pills">' + HALL_THEMES.map((t) => { const lock = S.b.hall < t[3]; return '<button type="button" class="ck-pill' + (S.theme === t[0] ? ' is-on' : '') + '" data-act="theme" data-arg="' + t[0] + '"' + (lock ? ' disabled' : '') + ' style="box-shadow:inset 3px 0 ' + t[2] + '">' + esc(t[1]) + (lock ? ' · Hall ' + t[3] : '') + '</button>'; }).join('') + '</div></section>' +
            roomCrafts('great_hall') + projects(/^(hall_|yard|storehouse|wing_war_room)/) + rebirthCard();
    }
    function quarterActions() {
        let h = '<section class="ck-card"><p class="ck-small">' + (arranging ? 'Tap a workshop, then an empty plot to move it. Rotate turns all of its notches; two notches facing each other make a link.' : 'Every workshop produces on its own. Two notches facing each other on neighbouring plots make a link, and linked pairs refine automatically from storage. Upgrade a workshop to open more notches. Tap a workshop to step inside.') + '</p>' +
            '<div class="ck-actions">' + (arranging ? '<button type="button" class="ck-btn is-primary" data-act="rotate"' + (quarterSel >= 0 && S.grid[quarterSel] ? '' : ' disabled') + '>Rotate socket ↻</button><button type="button" class="ck-btn" data-act="arrange">Done</button>'
                : '<button type="button" class="ck-btn" data-act="arrange"' + (S.grid.some(Boolean) ? '' : ' disabled') + '>Arrange</button>') + '</div></section>';
        h += projects(/^ws_\w+_1$/);
        const ls = links(S.grid);
        h += '<section class="ck-card"><h3>🔗 Recipes</h3><ul class="ck-cross">' + Object.keys(RECIPES).map((rid) => {
            const R = RECIPES[rid], on = ls.some((l) => l.recipe === rid), waiting = on && !canRefine(S, rid) && S.refine[rid] >= 1 - 1e-9;
            return '<li class="' + (on ? 'is-on' : '') + '"><b>' + esc(R.name) + '</b> <span class="ck-small">' + esc(WS[R.pair[0]].name + ' + ' + WS[R.pair[1]].name) + ' · ' + fl(S.inv[Object.keys(R.output)[0]]) + ' in store</span><span class="ck-small ck-muted">' +
                esc(Object.keys(R.input).map((k) => R.input[k] + ' ' + RES[k].name).join(' + ') + ' every ' + Math.round(R.mins / refineSpeed(S)) + ' min · ' + (on ? (waiting ? 'waiting for stock above your reserve' : 'running, batch ' + Math.round(Math.min(1, S.refine[rid] || 0) * 100) + '%') : 'not linked')) + '</span></li>';
        }).join('') + '</ul></section>';
        h += '<section class="ck-card"><h3>🛡️ Reserves</h3><p class="ck-small ck-muted">Refining never takes stock below these, so expeditions and construction keep what they need.</p><div class="ck-supplies">' + RESERVABLE.map((k) =>
            '<div class="ck-supply">' + itemIcon(k, 'is-sm') + '<span class="ck-supply-name">' + esc(RES[k].name) + ' <span class="ck-small">(' + fl(S.inv[k]) + ')</span></span><span class="ck-stepper"><button type="button" data-act="reserve" data-arg="' + k + ':-1" aria-label="Lower">−</button><b>' + (S.reserve[k] || 0) + '</b><button type="button" data-act="reserve" data-arg="' + k + ':1" aria-label="Raise">+</button></span></div>').join('') + '</div></section>';
        return h;
    }

    // —— Visitors: conversations, requests and trust ——
    function visitorsSection() {
        const here = visitorsHere(S);
        let h = '';
        if (here.length) {
            h += here.map((c) => {
                const n = S.visitors.npc[c.npcId] || { trust: 0 };
                return '<section class="ck-card dm-visitor"><div class="ck-row"><span class="ck-kicker">' + esc(c.kicker || 'At the gate') + '</span>' + chip(trustStage(n.trust) + ' ' + n.trust + '/' + TRUST_MAX) + '</div><h3>' + esc(c.npcName) + '</h3><p class="ck-small ck-muted">' + esc(c.npcRole || '') + '</p>' +
                    '<p class="dm-prompt">“' + esc(c.prompt) + '”</p><div class="dm-choices">' + (c.choices || []).map((ch) => {
                        const b = voiceBlock(S, c.id, ch.id), cost = choiceCost(ch);
                        return '<button type="button" class="ck-approach" data-act="voice" data-arg="' + esc(c.id) + ':' + esc(ch.id) + '"' + (b ? ' disabled title="' + esc(b) + '"' : '') + '><span class="ck-approach-ico">💬</span><span class="ck-approach-text"><b>' + esc(ch.label) + '</b>' +
                            (Object.keys(cost).length ? '<span class="ck-small">Costs ' + esc(Object.keys(cost).map((k) => cost[k] + ' ' + itemName(k)).join(', ')) + '</span>' : '') + (b ? '<span class="ck-small ck-warn">' + esc(b) + '</span>' : '') + '</span></button>';
                    }).join('') + '</div></section>';
            }).join('');
        } else {
            h += '<section class="ck-card"><h3>🚪 The gate is quiet</h3><p class="ck-small ck-muted">Someone may arrive every two hours, up to three at once. New records and choices open new conversations.</p><p class="ck-small">Next look at the road in ' + eta(S.visitors.nextAt || S.t) + '.</p></section>';
        }
        if (S.requests.length) {
            h += '<div class="ck-section-head"><h3>📦 Requests</h3><span class="ck-count">' + S.requests.length + '/' + MAX_REQUESTS + '</span></div>' + S.requests.map((q) => {
                const b = requestBlock(S, q.id);
                return '<section class="ck-card dm-request"><div class="ck-row">' + itemIcon(q.item) + '<div class="dm-grow"><b>' + esc(q.name) + ' needs ' + q.qty + ' ' + esc(itemName(q.item)) + '</b><span class="ck-small ck-muted">' + esc(q.role) + ' · lapses in ' + fmtDur(q.until - S.t) + '</span></div></div>' +
                    '<p class="ck-small">Reward: 🪙 ' + q.reward.silver + ' · 👑 ' + q.reward.crowns + ' · +1 trust</p><div class="ck-actions"><button type="button" class="ck-btn is-sm' + (b ? '' : ' is-primary') + '" data-act="deliver" data-arg="' + esc(q.id) + '"' + (b ? ' disabled' : '') + '>Deliver</button>' + (b ? '<span class="ck-small ck-muted">' + esc(b) + '</span>' : '') + '</div></section>';
            }).join('');
        }
        const people = Object.keys(S.visitors.npc).filter((id) => S.visitors.npc[id].met);
        if (people.length) {
            h += '<div class="ck-section-head"><h3>🤝 People of the road</h3></div><section class="ck-card"><ul class="ck-members dm-people">' + people.sort((a, b) => S.visitors.npc[b].trust - S.visitors.npc[a].trust).map((id) => {
                const n = S.visitors.npc[id];
                return '<li><span><b>' + esc(n.name) + '</b> <span class="ck-small ck-muted">' + esc(n.role) + '</span>' + barP(n.trust / TRUST_MAX * 100, 'is-thin') + '</span><b>' + esc(trustStage(n.trust)) + (n.keepsake ? ' ★' : '') + '</b></li>';
            }).join('') + '</ul><p class="ck-hint">Trust runs from Distant to Bonded (7). Acquainted visitors bring requests; Trusted ones pay half again; a Bonded visitor leaves a keepsake.</p></section>';
        }
        if (S.voices.log.length) h += '<details class="ck-card ck-more"><summary>Recent conversations</summary><ol class="ck-timeline">' + S.voices.log.slice(0, 8).map((v) => '<li class="is-info"><time>' + esc((v.npc || '').split(' ')[0]) + '</time><span><i>“' + esc(v.said) + '”</i> ' + esc(v.reply) + '</span></li>').join('') + '</ol></details>';
        return h;
    }
    function voiceModal(r) {
        return '<h2 id="ckModalTitle">' + esc(r.npc) + '</h2><p class="dm-prompt">' + esc(r.reply) + '</p>' + (Object.keys(r.gains).length ? '<h3>Received</h3>' + lootRow(r.gains) : '') +
            (Object.keys(r.loss).length ? '<p class="ck-small ck-warn">Lost: ' + esc(Object.keys(r.loss).map((k) => r.loss[k] + ' ' + itemName(k)).join(', ')) + '</p>' : '') +
            '<p class="ck-small">Trust ' + (r.delta > 0 ? '+' + r.delta : r.delta) + ' · ' + esc(r.stage) + ' (' + r.trust + '/' + TRUST_MAX + ') · +2 Silver</p><div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="close-modal">Continue</button></div>';
    }

    // —— The Chronicle: letters, relics and chronicles recovered across the Keep ——
    const LORE_FILTERS = [['all', 'All'], ['LETTER', 'Letters'], ['MEMORABILIA', 'Relics'], ['CHRONICLE', 'Chronicle']];
    function chronicleSection() {
        const f = S.ui.loreFilter || 'all', E = LORE().entries.filter((e) => f === 'all' || e.type === f);
        const open = E.filter((e) => loreOpen(S, e.id)), unread = open.filter((e) => !S.lore[e.id]), read = open.filter((e) => S.lore[e.id]), buried = E.filter((e) => !loreOpen(S, e.id));
        const card = (e, cls) => '<button type="button" class="ck-card dm-lore ' + cls + '" data-act="lore" data-arg="' + esc(e.id) + '"><span class="ck-kicker">' + esc(titleCase(e.type)) + (e.era ? ' · ' + esc(e.era) : '') + '</span><b>' + esc(e.title) + '</b><span class="ck-small ck-muted">' + esc(e.source || '') + '</span>' +
            (cls !== 'is-buried' ? '<span class="ck-small">' + esc(e.summary || '') + '</span>' : '<span class="ck-small ck-muted">' + esc(readLoreBlock(S, e.id) || 'Decipher with ' + DECIPHER_COST + ' Insight.') + '</span>') + '</button>';
        return '<section class="ck-card is-tight"><p class="ck-small">' + LORE().entries.filter((e) => loreOpen(S, e.id)).length + ' of ' + LORE().entries.length + ' records recovered. Records surface as you build, collect and speak with visitors.</p>' +
            '<div class="ck-pills">' + LORE_FILTERS.map((x) => '<button type="button" class="ck-pill' + (f === x[0] ? ' is-on' : '') + '" data-act="lore-filter" data-arg="' + x[0] + '">' + x[1] + '</button>').join('') + '</div></section>' +
            (unread.length ? '<div class="ck-section-head"><h3>✨ Unread</h3></div>' + unread.map((e) => card(e, 'is-new')).join('') : '') +
            (read.length ? '<div class="ck-section-head"><h3>📖 Read</h3></div>' + read.map((e) => card(e, '')).join('') : '') +
            (buried.length ? '<div class="ck-section-head"><h3>🪨 Still buried</h3></div>' + buried.map((e) => card(e, 'is-buried')).join('') : '');
    }
    function loreModal(id) {
        const e = LORE().entries.find((x) => x.id === id);
        if (!e) return '';
        return '<span class="ck-kicker">' + esc(titleCase(e.type)) + (e.perspective ? ' · ' + esc(e.perspective) : '') + '</span><h2 id="ckModalTitle">' + esc(e.title) + '</h2><p class="ck-small ck-muted">' + esc(e.source || '') + (e.era ? ' · ' + esc(e.era) : '') + '</p>' +
            '<div class="dm-lore-body">' + esc(e.body || e.summary || '').replace(/\n/g, '<br>') + '</div><div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="close-modal">Close</button></div>';
    }

    // —— Build, Stores, Log ——
    function buildSection() {
        let h = '<section class="ck-card"><div class="ck-row"><h3>⚒️ Crews</h3>' + chip((S.builds || []).length + '/' + crews(S) + ' busy') + '</div>' +
            ((S.builds || []).length ? S.builds.map((b) => '<div class="ck-row"><b class="ck-small">' + esc(b.name) + '</b>' + eta(b.endAt) + '</div>' + liveBar(b.startAt, b.endAt)).join('') : '<p class="ck-small ck-muted">No construction under way. Crews keep working while the Knight is away.</p>') + '</section>';
        const groups = {};
        projectList(S).filter((p) => p.group !== 'Chronicles wings').forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
        Object.keys(groups).forEach((g) => { h += '<div class="ck-section-head"><h3>' + esc(g) + '</h3></div>' + groups[g].map(projectCard).join(''); });
        h += '<div class="ck-section-head"><h3>🏯 Chronicles wings</h3></div><div class="ck-buildings">' + Object.keys(CH.buildings || {}).map((id) => {
            const B = CH.buildings[id], lvl = S.wings[id] || 0, p = projectList(S).find((x) => x.id === 'wing_' + id + '_' + (lvl + 1));
            const stars = Array.from({ length: 5 }, (_, i) => '<i class="' + (i < lvl ? 'is-on' : '') + '">★</i>').join('');
            const busy = (S.builds || []).find((b) => b.id.indexOf('wing_' + id + '_') === 0);
            return '<section class="ck-building' + (lvl ? '' : ' is-unbuilt') + '"><div class="ck-building-art"><img src="' + esc(namedScene(BUILDING_SCENES[id] || 'earth-shelter')) + '" alt="" loading="lazy" decoding="async"><span class="ck-building-name"><b>' + esc(B.name) + '</b><span class="ck-stars">' + stars + '</span></span></div>' +
                '<div class="ck-building-body"><p class="ck-small ck-muted">' + esc(B.blurb || '') + ' In the ' + esc(WING_HOME[id]) + '.</p>' + (lvl ? '<p class="ck-small is-ready">' + esc(WING_EFFECT[id](lvl)) + '</p>' : '') +
                (busy ? '<p class="ck-small">⚒ Building · ' + eta(busy.endAt) + '</p>' : p ? '<p class="ck-small"><b>Level ' + (lvl + 1) + ':</b> ' + esc(WING_EFFECT[id](lvl + 1)) + '</p>' + costRow(p.cost) + '<div class="ck-actions"><button type="button" class="ck-btn is-sm' + (buildBlock(S, p.id) ? '' : ' is-primary') + '" data-act="build" data-arg="' + p.id + '"' + (buildBlock(S, p.id) ? ' disabled' : '') + '>' + (lvl ? '⬆️ Upgrade' : '🔨 Build') + '</button>' + (buildBlock(S, p.id) ? '<span class="ck-small ck-muted">' + esc(buildBlock(S, p.id)) + '</span>' : '') + '</div>' : '<p class="ck-small is-ready">🏆 Complete.</p>') + '</div></section>';
        }).join('') + '</div>';
        return h;
    }
    function rebirthCard() {
        const r = rebirthReq(S);
        if (!r) return '<section class="ck-card"><h3>🌳 Rebirth</h3><p class="ck-small ck-muted">Covenant Eternal: all ten rebirths done.</p></section>';
        const b = rebirthBlock(S);
        return '<section class="ck-card"><div class="ck-row"><h3>🌳 Rebirth ' + r.n + ': ' + esc(REBIRTH_TITLES[r.n]) + '</h3></div><p class="ck-small ck-muted">Resets the Keep’s buildings and raw stock. The Knight, companions, wings, lore, visitors and crafts carry over. Each rebirth: production +25%, storage +20%, builds 10% faster, costs +15%.</p>' +
            '<div class="ck-chips">' + ['hall:' + r.hall].concat(r.checks).map((c) => { const ok = c.indexOf('hall:') === 0 ? S.b.hall >= r.hall : checkMet(S, c); return chip(c.indexOf('hall:') === 0 ? HALL_RANKS[r.hall - 1] : checkText(c), ok ? 'is-help' : 'is-boss'); }).join('') + '</div>' + costRow(r.cost) +
            '<div class="ck-actions">' + (S.ui.confirmRebirth ? '<button type="button" class="ck-btn is-primary" data-act="rebirth-yes"' + (b ? ' disabled' : '') + '>Rebirth the Keep</button><button type="button" class="ck-btn" data-act="rebirth-no">Not yet</button>' : '<button type="button" class="ck-btn is-sm" data-act="rebirth"' + (b ? ' disabled' : '') + '>Prepare rebirth</button>') + (b ? '<span class="ck-small ck-muted">' + esc(b) + '</span>' : '') + '</div></section>';
    }
    function storesSection() {
        let h = '';
        const ev = (S.events || []).filter((e) => !e.repaired);
        if (ev.length) h += '<section class="ck-card"><h3>🧱 Damage around the Keep</h3>' + ev.map((e) => {
            const b = repairBlock(S, e.id);
            return '<div class="dm-event"><b>' + esc(e.title) + '</b> <span class="ck-small ck-muted">' + esc(e.targetName) + '</span><p class="ck-small">' + esc(e.text) + '</p>' +
                (e.repairEndAt ? liveBar(e.repairEndAt - e.repairMs, e.repairEndAt) + '<span class="ck-small">Repaired in ' + eta(e.repairEndAt) + '</span>' : '<div class="ck-actions"><button type="button" class="ck-btn is-sm is-primary" data-act="repair" data-arg="' + esc(e.id) + '"' + (b ? ' disabled' : '') + '>Repair · ' + e.cost + ' Timber · ' + fmtDur(e.repairMs) + '</button>' + (b ? '<span class="ck-small ck-muted">' + esc(b) + '</span>' : '') + '</div>') + '</div>';
        }).join('') + '<p class="ck-hint">Each repair pays 6 Silver.</p></section>';
        h += '<section class="ck-card"><div class="ck-row"><h3>🧭 Stewardship</h3>' + chip('🪙 ' + fl(S.inv.silver)) + chip('👑 ' + fl(S.inv.crowns)) + '</div><p class="ck-small ck-muted">Walk the Keep once a day for 4 Silver.</p><div class="ck-actions"><button type="button" class="ck-btn is-sm' + (stewardReady(S) ? ' is-primary' : '') + '" data-act="steward"' + (stewardReady(S) ? '' : ' disabled') + '>' + (stewardReady(S) ? 'Walk the Keep' : 'Walked today') + '</button></div></section>';
        if (!(S.b.storehouse >= 1)) return h + '<section class="ck-card"><h3>📦 Storehouse</h3><p class="ck-small ck-muted">Raise the Covenant Storehouse (Build) to open refining, recycling and the Keep market.</p></section>';
        h += '<section class="ck-card"><h3>⚗️ Refine</h3>' + Object.keys(REFINED).map((id) => {
            const r = REFINED[id], b = refineBlock(S, id);
            return '<div class="ck-recipe">' + itemIcon(id, 'is-lg') + '<div class="ck-recipe-main"><div class="ck-row"><b>' + esc(r.name) + '</b><span class="ck-small">' + fl(S.inv[id]) + ' in store</span></div><span class="ck-small ck-muted">' + esc(r.blurb) + '</span>' + costRow(ka(r.inputs)) +
                '<div class="ck-pills"><button type="button" class="ck-pill is-forge" data-act="refine" data-arg="' + id + '"' + (b ? ' disabled title="' + esc(b) + '"' : '') + '>Make</button></div></div></div>';
        }).join('') + '</section>';
        const rf = S.ui.recFrom || 'stone', rt = S.ui.recTo || 'ember';
        h += '<section class="ck-card"><h3>♻️ Recycle</h3><p class="ck-small ck-muted">3 of one raw material for 1 of another, 15 Timber for 1 raw, or salvage half a refined good.</p><h4>Give</h4><div class="ck-pills">' +
            ['timber'].concat(RAW, Object.keys(REFINED).filter((k) => fl(S.inv[k]) > 0)).map((k) => '<button type="button" class="ck-pill' + (rf === k ? ' is-on' : '') + '" data-act="rec-from" data-arg="' + k + '">' + esc(itemName(k)) + ' (' + fl(S.inv[k]) + ')</button>').join('') + '</div>' +
            (REFINED[rf] ? '' : '<h4>Get</h4><div class="ck-pills">' + RAW.filter((k) => k !== rf).map((k) => '<button type="button" class="ck-pill' + (rt === k ? ' is-on' : '') + '" data-act="rec-to" data-arg="' + k + '">' + esc(itemName(k)) + '</button>').join('') + '</div>') +
            '<div class="ck-actions"><button type="button" class="ck-btn is-sm" data-act="recycle"' + (recycleBlock(S, rf, rt) ? ' disabled' : '') + '>' + (REFINED[rf] ? 'Salvage 1 ' + esc(itemName(rf)) : 'Recycle into ' + esc(itemName(rt))) + '</button><span class="ck-small ck-muted">' + esc(recycleBlock(S, rf, rt)) + '</span></div></section>';
        h += '<section class="ck-card"><h3>🛍️ Keep market</h3><p class="ck-small ck-muted">New lots each day, in Silver, plus a rare lot in Crowns. Materials only: gear is always crafted.</p><div class="ck-listings">' + marketOffers(S).map((m) => {
            const b = buyBlock(S, m.id);
            return '<div class="ck-listing">' + itemIcon(m.res, 'is-sm') + '<div><b>' + m.amount + '× ' + esc(itemName(m.res)) + '</b><span class="ck-small ck-muted">' + titleCase(m.rarity) + ' · ' + marketLeft(S, m) + ' left today</span></div><button type="button" class="ck-btn is-sm" data-act="buy" data-arg="' + m.id + '"' + (b ? ' disabled title="' + esc(b) + '"' : '') + '>' + (m.currency === 'crowns' ? '👑' : '🪙') + ' ' + m.price + '</button></div>';
        }).join('') + '</div></section>';
        return h;
    }
    function logSection() {
        let h = '<section class="ck-card"><h3>🔗 Refining totals</h3><div class="ck-chips">' + Object.keys(RECIPES).map((r) => chip(S.made[r] + ' ' + RECIPES[r].name)).join('') + '</div></section>';
        if (S.reports.length) h += '<section class="ck-card"><h3>🗺️ Expedition reports</h3><div class="ck-pills">' + S.reports.map((r) => '<button type="button" class="ck-pill" data-act="report" data-arg="' + esc(r.id) + '">' + esc(reportTitle(r)) + ' · ' + new Date(r.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '</button>').join('') + '</div></section>';
        h += '<section class="ck-card"><h3>📜 Keep log</h3>' + (S.log.length ? '<ol class="ck-timeline">' + S.log.map((l) => '<li class="is-info"><time>' + new Date(l.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</time><span>' + esc(l.text) + '</span></li>').join('') + '</ol>' : '<p class="ck-muted">Nothing has happened yet.</p>') + '</section>';
        return h;
    }
    function objectiveModal() {
        return '<h2 id="ckModalTitle">Objectives</h2>' + OBJECTIVES.map((ch) => '<h3>' + esc(ch.chapter) + '</h3><ol class="ck-ladder">' + ch.steps.map((st) => '<li class="' + (S.obj[st.id] ? 'is-on' : '') + '"><b>' + esc(st.title) + '</b><span>' + esc(st.hint) + '</span></li>').join('') + '</ol>').join('') +
            '<div class="ck-actions"><button type="button" class="ck-btn is-primary" data-act="close-modal">Close</button></div>';
    }
    function menuModal() {
        return '<h2 id="ckModalTitle">Dominion · test mode</h2><p class="ck-small">The Keep and Chronicles as one game. Rules run in this browser' + (ONLINE ? ' and sync to your account when signed in.' : '; this preview saves only here.') + '</p>' +
            '<h3>Test time</h3><div class="ck-pills"><button type="button" class="ck-pill" data-act="pass" data-arg="1">Pass 1 hour</button><button type="button" class="ck-pill" data-act="pass" data-arg="4">Pass 4 hours</button><button type="button" class="ck-pill" data-act="pass" data-arg="12">Pass 12 hours</button></div>' +
            '<h3>Start over</h3><p class="ck-small ck-muted">Erase this save and begin again on bare ground' + (ONLINE && NET.signedIn ? ' (your synced save is replaced too)' : '') + '.</p>' +
            '<div class="ck-actions">' + (confirmReset ? '<button type="button" class="ck-btn is-primary" data-act="reset-yes">Erase and restart</button><button type="button" class="ck-btn" data-act="reset-no">Keep my save</button>' : '<button type="button" class="ck-btn" data-act="reset">Reset Dominion</button>') + '</div>' +
            '<div class="ck-actions"><a class="ck-btn is-glass" href="/home">Back to the hub</a><button type="button" class="ck-btn" data-act="close-modal">Close</button></div>';
    }

    // —— Clock ——
    function step() {
        advance(S, now());
        flushToasts();
        // Never rebuild a screen under someone typing a guild name, invite code or price.
        const a = document.activeElement;
        if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { renderHeader(); updateLive(); return; }
        if (S.rev !== lastRev) { save(); renderAll(); maybeShowReport(); }
        else if (signature() !== lastSig) { renderAll(); }
        else { renderHeader(); updateLive(); }
    }
    function maybeShowReport() {
        if (modal) return;
        const r = S.reports.find((x) => !x.seen);
        if (r) openModal('report', r.id);
    }
    const snapshot = () => Object.assign({}, S.inv);
    function diffGains(before) {
        const g = {};
        Object.keys(RES).forEach((k) => { const d = fl(S.inv[k]) - fl(before[k]); if (d > 0) g[k] = d; });
        return g;
    }
    function passTime(hours) {
        S.offset += hours * HOUR;
        advance(S, now());
        save();
        flushToasts();
        const stored = ['woodlot'].concat(Object.keys(WS)).reduce((a, id) => a + storedCount(S, id), 0);
        toast('Passed ' + hours + ' hour' + (hours > 1 ? 's' : '') + (stored ? ': ' + stored + ' goods waiting to be collected.' : '.'));
        if (modal && modal.kind === 'menu') { modal = null; $('ckModal').hidden = true; }
        renderAll();
        maybeShowReport();
    }

    // —— Actions ——
    function setTab(tab) {
        S.ui.tab = TABS.includes(tab) ? tab : 'base';
        $('ckMain').scrollTop = 0;
        if (S.ui.tab === 'realm' && ONLINE && NET.signedIn && !NET.realmAt) loadRealm();
    }
    function act(name, arg) {
        const s = S;
        switch (name) {
        case 'tab': if (modal) { modal = null; $('ckModal').hidden = true; } setTab(arg); break;
        case 'close-modal': closeModal(); return;
        case 'menu': openModal('menu'); return;
        case 'objective': openModal('objective'); return;
        case 'report': openModal('report', arg); return;
        case 'item': openModal('item', arg); return;
        case 'plan': openModal('plan', arg); return;
        case 'skill':
            if (gatherSkills().concat(craftSkills()).includes(arg)) { s.ui.workSkill = arg; recipePick = ''; setTab('work'); break; }
            openModal('skill', arg); return;
        case 'pass': passTime(Number(arg) || 4); return;
        case 'reset': confirmReset = true; renderModal(); return;
        case 'reset-no': confirmReset = false; renderModal(); return;
        case 'reset-yes': {
            try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
            // Keep the sync ledger: a fresh version 0 would lose the 409 race and re-adopt the old save.
            const keep = { sync: S.sync, applied: S.applied };
            S = defaults(Date.now()); Object.assign(S, keep); S.rev++;
            modal = null; $('ckModal').hidden = true;
            save(); syncNow(true); renderAll(); toast('Dominion reset: bare ground and 30 Timber.');
            return;
        }
        case 'base-sec': s.ui.base = arg; if (s.ui.tab !== 'base') setTab('base'); if (arg !== 'grounds') s.ui.room = s.ui.room; $('ckMain').scrollTop = 0; break;
        case 'room': s.ui.room = arg || ''; s.ui.base = 'grounds'; scrollToRoom = !!arg; if (arg !== 'quarter') { arranging = false; quarterSel = -1; } if (s.ui.tab !== 'base') setTab('base'); $('ckMain').scrollTop = 0; break;
        case 'building': act('room', arg); return;
        case 'collect': { const g = collect(s, arg); if (!g) { toast(arg === 'woodlot' && fl(s.inv.timber) >= timberCap(s) ? 'The timber store is full.' : 'Nothing to collect yet.'); return; } toast('Collected ' + Object.keys(g).map((k) => g[k] + ' ' + itemName(k)).join(', ') + '.'); break; }
        case 'collect-all': { const g = collectAll(s); const keys = Object.keys(g); toast(keys.length ? 'Collected ' + keys.map((k) => g[k] + ' ' + itemName(k)).join(', ') + '.' : 'Nothing to collect yet.'); if (!keys.length) return; break; }
        case 'work-skill': s.ui.workSkill = arg; recipePick = ''; setTab('work'); break;
        case 'work-type': { const list = arg === 'craft' ? craftSkills() : gatherSkills(); s.ui.workSkill = list.includes(activeSkill()) ? activeSkill() : list[0]; recipePick = ''; break; }
        case 'recipe-pick': recipePick = arg; break;
        case 'task': {
            const parts = String(arg).split(':');
            const msg = setTask(s, parts[0], parts[1]);
            if (msg) { toast(msg); return; }
            toast(parts[0] === 'idle' ? 'The Knight rests.' : 'The Knight starts: ' + taskLabel(s) + '.');
            break;
        }
        case 'craft':
            if (!craftOnce(s, arg)) { toast(craftBlock(s, arg) || 'Cannot make that yet.'); return; }
            toast('Made ' + recipeName(CRAFTS[arg]) + '.');
            break;
        case 'equip': { const parts = String(arg).split(':'); const msg = equip(s, parts[0], parts[1]); if (msg) { toast(msg); return; } break; }
        case 'tool': if (knightBusy(s) || fl(s.inv[arg]) < 1) return; s.knight.tool = arg; s.rev++; break;
        case 'comp-toggle': openComp = openComp === arg ? '' : arg; if (s.ui.tab !== 'company') setTab('company'); break;
        case 'feed': { const parts = String(arg).split(':'); const b = feedBlock(s, parts[0], parts[1]); if (b) { toast(b); return; } feed(s, parts[0], parts[1]); toast(C(parts[0]).name + ' enjoyed the ' + RES[parts[1]].name + '.'); break; }
        case 'party': {
            const p = s.prep.party, i = p.indexOf(arg);
            if (s.exp) return;
            if (i >= 0) p.splice(i, 1);
            else if (s.comps[arg] && s.comps[arg].joined) { if (p.length >= partySlots(s)) p.shift(); p.push(arg); }
            s.rev++;
            break;
        }
        case 'prep-toggle': s.ui.prepOpen = !s.ui.prepOpen; return;
        case 'rations': s.prep.useRations = !s.prep.useRations; break;
        case 'rune': s.prep.rune = arg || ''; break;
        case 'potion': {
            const parts = String(arg).split(':');
            s.prep.potions = s.prep.potions || {};
            const total = Object.keys(s.prep.potions).reduce((a, k) => a + (s.prep.potions[k] || 0), 0);
            if (Number(parts[1]) > 0 && total >= supplyCap(s)) { toast('The company can carry ' + supplyCap(s) + ' potions.'); return; }
            s.prep.potions[parts[0]] = Math.max(0, Math.min(fl(s.inv[parts[0]]), (s.prep.potions[parts[0]] || 0) + Number(parts[1])));
            break;
        }
        case 'depart':
            if (DEST[arg]) s.prep.dest = arg;
            if (!depart(s)) { toast(departBlock(s) || 'The company cannot set out yet.'); return; }
            modal = null; $('ckModal').hidden = true;
            toast('The Knight sets out for ' + DEST[s.exp.dest].name + '.');
            setTab('expedition');
            break;
        case 'tame': {
            const parts = String(arg).split(':'), b = tameBlock(s, parts[0], parts[1] || '');
            if (b) { toast(b); return; }
            const res = tame(s, parts[0], parts[1] || '');
            toast(res.won ? 'Tamed! ' + C(res.uid).name + ' joined the Keep.' : 'It slipped away (' + Math.round(res.chance * 100) + '% chance).');
            if (res.won) openComp = res.uid;
            break;
        }
        case 'evolve': if (!evolve(s, arg)) { toast(evolveBlock(s, arg)); return; } break;
        case 'trial': if (!startTrial(s, arg)) { toast(trialBlock(s, arg)); return; } toast('The Bond Trial begins.'); setTab('expedition'); break;
        case 'rename': {
            const c = s.comps[arg], name = window.prompt('A new name for ' + C(arg).name + ':', c.nick || C(arg).species);
            if (name == null) return;
            c.nick = name.trim().slice(0, 18); s.rev++;
            break;
        }
        case 'build': if (!startBuild(s, arg)) { toast(buildBlock(s, arg)); return; } toast('Construction started.'); break;
        case 'repair': if (!startRepair(s, arg)) { toast(repairBlock(s, arg)); return; } break;
        case 'steward': if (!steward(s)) return; toast('+4 Silver from stewardship.'); break;
        case 'refine': if (!refine(s, arg)) { toast(refineBlock(s, arg)); return; } toast('Made ' + itemName(arg) + '.'); break;
        case 'rec-from': s.ui.recFrom = arg; break;
        case 'rec-to': s.ui.recTo = arg; break;
        case 'recycle': if (!recycle(s, s.ui.recFrom || 'stone', s.ui.recTo || 'ember')) { toast(recycleBlock(s, s.ui.recFrom || 'stone', s.ui.recTo || 'ember')); return; } break;
        case 'buy': if (!buy(s, arg)) { toast(buyBlock(s, arg)); return; } break;
        case 'kcraft': if (!keepCraft(s, arg)) { toast(keepCraftBlock(s, arg)); return; } toast('Made ' + KEEP_CRAFTS[arg][0] + '.'); break;
        case 'decor': placeDecoration(s, arg, !s.placed[arg]); break;
        case 'theme': if (HALL_THEMES.some((t) => t[0] === arg && s.b.hall >= t[3])) { s.theme = arg; s.rev++; } break;
        case 'rebirth': s.ui.confirmRebirth = true; break;
        case 'rebirth-no': s.ui.confirmRebirth = false; break;
        case 'rebirth-yes': s.ui.confirmRebirth = false; if (!rebirth(s)) { toast(rebirthBlock(s)); return; } break;
        case 'voice': {
            const parts = String(arg).split(':'), c = visitorsHere(s).find((x) => x.id === parts[0]);
            const b = voiceBlock(s, parts[0], parts[1]);
            if (b) { toast(b); return; }
            const r = chooseVoice(s, parts[0], parts[1]);
            if (r) { latchObjectives(s); save(); renderAll(); openModal('voice', Object.assign({ npc: c.npcName }, r)); }
            return;
        }
        case 'deliver': { const q = deliver(s, arg); if (!q) { toast(requestBlock(s, arg)); return; } toast(q.name + ' thanks you: +' + q.reward.silver + ' Silver, +' + q.reward.crowns + ' Crowns.'); break; }
        case 'bank': { const parts = String(arg).split(':'), t = bankTask(s, parts[0], parts[1]); if (!t) return; toast(C(parts[0]).name + ': “' + t.name + '” banked. +' + t.rapport + ' rapport.'); break; }
        case 'lore-filter': s.ui.loreFilter = arg; break;
        case 'lore':
            if (!s.lore[arg] && !readLore(s, arg)) { toast(readLoreBlock(s, arg)); return; }
            save(); renderAll(); openModal('lore', arg);
            return;
        case 'claim': if (!claimJourney(s, Number(arg))) return; toast('Journey reward claimed.'); break;
        case 'loadout-save': if (!saveLoadout(s, Number(arg))) return; toast('Loadout saved.'); break;
        case 'loadout-apply': if (!applyLoadout(s, Number(arg))) return; toast('Loadout applied.'); break;
        case 'realm-refresh': NET.realmAt = 0; syncNow(true).then(loadRealm); return;
        case 'donate': realmCall('/api/dominion/guild/donate', { itemId: arg, qty: Math.min(10, fl(s.inv[arg])) }); return;
        case 'guild-leave': if (window.confirm('Leave your guild?')) realmCall('/api/dominion/guild/leave', {}); return;
        case 'op-claim': realmCall('/api/dominion/operation/claim', {}); return;
        case 'op-go': if (!startOperation(s, arg)) { toast(operationBlock(s)); return; } toast('The Knight marches to the operation.'); setTab('expedition'); break;
        case 'mk-buy': realmCall('/api/dominion/market/buy', { listingId: arg }); return;
        case 'mk-cancel': realmCall('/api/dominion/market/cancel', { listingId: arg }); return;
        case 'cjob': {
            const parts = String(arg).split(':'), id = parts[0], kind = parts[1], target = parts[2];
            const c = s.comps[id];
            if (!c || !c.joined || onExpedition(s, id)) return;
            if (kind === 'help') {
                const t = target || (c.job.kind === 'help' ? c.job.target : helpTargets().find((x) => !helperOf(s, x)));
                if (!t) { toast(helpTargets().length ? 'Every building already has a helper.' : 'Build the Woodlot or a workshop first.'); return; }
                const other = helperOf(s, t);
                if (other && other !== id) { toast(C(other).name + ' already helps there.'); return; }
                c.job = { kind: 'help', target: t };
            } else {
                const other = kind === 'knight' && joinedIds(s).find((x) => x !== id && s.comps[x].job.kind === 'knight');
                if (other) { toast(C(other).name + ' is already assisting the Knight.'); return; }
                if (kind === 'front' && c.job.kind !== 'front' && defenders(s).length >= frontCap(s)) { toast('Every rampart post is taken (' + frontCap(s) + ').'); return; }
                c.job = { kind: kind };
            }
            s.rev++;
            break;
        }
        case 'arrange': arranging = !arranging; if (!arranging) quarterSel = -1; break;
        case 'plot': plotTap(Number(arg)); break;
        case 'rotate': if (quarterSel >= 0 && s.grid[quarterSel]) { s.grid[quarterSel].rot = (s.grid[quarterSel].rot + 1) % 4; s.rev++; } break;
        case 'reserve': { const parts = String(arg).split(':'); s.reserve[parts[0]] = Math.max(0, Math.min(99, (s.reserve[parts[0]] || 0) + Number(parts[1]))); break; }
        default: return;
        }
        latchObjectives(s);
        save();
        renderAll();
    }
    function plotTap(i) {
        // Outside Arrange a workshop plot is a door into that room.
        if (!arranging) { if (S.grid[i]) { S.ui.room = S.grid[i].id; scrollToRoom = true; } return; }
        if (S.grid[i]) { quarterSel = quarterSel === i ? -1 : i; return; }
        if (quarterSel < 0) return;
        S.grid[i] = S.grid[quarterSel];
        S.grid[quarterSel] = null;
        quarterSel = i;
        S.rev++;
    }

    // —— Boot ——
    function boot() {
        // The interiors' markup lives in a <template> copied from keep.html; index it by room.
        const tpl = $('dmRooms');
        if (tpl) tpl.content.querySelectorAll('.interior-room').forEach((r) => { const m = r.className.match(/room-(\w+)/); if (m) ROOM_HTML[m[1] === 'hall' ? 'great_hall' : m[1]] = r.outerHTML; });
        S = load();
        S.ui.tab = OLD_TAB[S.ui.tab] || (TABS.includes(S.ui.tab) ? S.ui.tab : 'base');
        const before = snapshot(), logLen = S.log.length, gap = now() - S.t;
        advance(S, now());
        if (gap > 2 * MIN) {
            const notes = S.log.slice(0, Math.max(0, S.log.length - logLen)).map((l) => l.text).slice(0, 8);
            S.away = { ms: Math.min(gap, OFFLINE_CAP), gains: diffGains(before), notes: notes };
            FRESH.length = 0;
        }
        save();
        document.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('#ckTabs button[data-tab]');
            if (tabBtn) { act('tab', tabBtn.dataset.tab); return; }
            const el = e.target.closest('[data-act]');
            if (el && !el.disabled) { if (el.tagName === 'SUMMARY') e.preventDefault(); act(el.dataset.act, el.dataset.arg); return; }
            const b = e.target.closest('[data-building]');
            if (b) act('room', b.dataset.building);
        });
        $('ckModal').addEventListener('click', (e) => { if (e.target === $('ckModal')) closeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal) closeModal(); });
        document.addEventListener('submit', (e) => {
            const f = e.target.closest('[data-form]');
            if (!f) return;
            e.preventDefault();
            if (window.dmRealmSubmit) window.dmRealmSubmit(f);
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); syncNow(true); } else step(); });
        window.addEventListener('pagehide', save);
        document.body.dataset.screen = 'main';
        ['ckTabs', 'ckRank', 'ckStatus', 'ckAvatar', 'ckCrowns'].forEach((id) => { $(id).hidden = false; });
        renderAll();
        if (S.away) openModal('away'); else maybeShowReport();
        setInterval(step, 1000);
        setInterval(save, 10000);
        setInterval(() => syncNow(false), 30000);
        bootOnline();
    }

    // Test hook for headless checks; harmless in a test mode.
    window.dominionDebug = {
        state: () => S, advance: (ms) => { S.offset += ms; advance(S, now()); save(); flushToasts(); renderAll(); }, pass: passTime, act: act,
        links: () => links(S.grid), encounter: encounter, save: save, now: now, collectAll: () => { const g = collectAll(S); save(); renderAll(); return g; },
        encounters: (id) => DEST[id].encounters, tame: (id, lure) => { const r = tame(S, id, lure); save(); renderAll(); return r; }, tameBlock: (id, lure) => tameBlock(S, id, lure),
        evolveBlock: (id) => evolveBlock(S, id), buildBlock: (id) => buildBlock(S, id), startBuild: (id) => { const r = startBuild(S, id); save(); renderAll(); return r; },
        timberCap: () => timberCap(S), workshopRates: (id) => workshopRates(S, id), woodlotRate: () => woodlotRate(S), marketOffers: () => marketOffers(S),
        sync: () => syncNow(true), visitors: () => visitorsHere(S), residentTasks: (u) => residentTasks(u),
        voicesReady: () => voicesReady(S), rebirthBlock: () => rebirthBlock(S), rebirth: () => { const r = rebirth(S); save(); renderAll(); return r; }, prodMul: () => prodMul(S)
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
