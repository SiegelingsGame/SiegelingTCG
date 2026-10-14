/* Siegelings: Dominion — idle prototype joining the Keep and Chronicles.
   Everything runs client-side against one localStorage save so it can never touch live
   accounts. One resolver (advance) moves every activity forward; the "+4h" control and
   offline catch-up both call it, so demo time and real time follow identical rules. */
(function () {
    'use strict';

    const SAVE_KEY = 'siegelingsDominionPrototype';
    const SCHEMA = 2;
    const MIN = 60000;
    const HOUR = 60 * MIN;
    // Five-minute slices keep refining batches (30-60 min) accurate without a heavy loop.
    const STEP = 5 * MIN;
    const OFFLINE_CAP = 7 * 24 * HOUR;

    // —— Art (existing project assets; crops aim at the subject) ——
    const ART = {
        knight: { src: '/img/knights/ser-airek-full-card.webp', pos: '50% 0%', origin: '46% 34%', zoom: 1.8 },
        cacty: { src: '/img/art/loading/cacty-landscape.webp', pos: '16% 50%', origin: '50% 58%', zoom: 1.7 },
        sundile: { src: '/img/art/loading/sundile-landscape.webp', pos: '7% 50%', origin: '50% 36%', zoom: 1.8 },
        fawny: { src: '/img/art/loading/fawny-landscape.webp', pos: '50% 50%', origin: '30% 40%', zoom: 2.3 },
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
        // Practice weapons from the Great Hall rack, so every approach is open on day one.
        practice_spear: { name: 'Practice Spear', kind: 'WEAPON', weaponType: 'spear', tier: 0, blurb: 'A blunted drill spear from the Hall rack.' },
        practice_bow: { name: 'Practice Bow', kind: 'WEAPON', weaponType: 'bow', tier: 0, blurb: 'A light hunting bow from the Hall rack.' },
        practice_staff: { name: 'Practice Staff', kind: 'WEAPON', weaponType: 'staff', tier: 0, blurb: 'An ash staff for channelling drills.' },
        practice_hammer: { name: 'Practice Hammer', kind: 'WEAPON', weaponType: 'hammer', tier: 0, blurb: 'A mason’s hammer from the Hall rack.' },
        practice_daggers: { name: 'Practice Daggers', kind: 'WEAPON', weaponType: 'daggers', tier: 0, blurb: 'Paired training knives.' }
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
        rations: { name: 'Hearth Rations', pair: ['garden', 'kitchen'], input: { produce: 2, provisions: 1 }, output: { rations: 1 }, mins: 30 }
    };
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
        forge_fittings: { id: 'forge_fittings', skillId: 'smithing', output: 'fittings', outputQty: 2, level: 1, extraReqs: [], inputs: { copper_bar: 1 }, actionSeconds: 12, xp: 12, repeatable: true, helperElements: ['FIRE', 'METAL'], studyElement: null, dominion: true }
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
    function compArt(uid, alt) {
        const sp = speciesOf(uid);
        if (ART[sp.id]) return artImg(sp.id, alt);
        const thumb = catalogArt(sp.id, 240);
        if (thumb) return '<img src="' + esc(thumb) + '" data-raw="' + esc(ART_URLS[sp.id]) + '" alt="' + esc(alt || '') + '" loading="lazy" onerror="dmArtFallback(this)">';
        return '<svg viewBox="0 0 24 24" style="width:100%;height:100%;background:#23343f">' + SHAPE.orb(EL_HEX[sp.element] || '#ccc') + '</svg>';
    }
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
        Object.assign(inv, { timber: 80, stone: 20, ore: 6, ember: 2, frost: 1, fiber: 4, produce: 2, provisions: 4, sunleaf: 4,
            squires_sword: 1, travelers_coat: 1, woodaxe: 1, pickaxe: 1,
            practice_spear: 1, practice_bow: 1, practice_staff: 1, practice_hammer: 1, practice_daggers: 1 });
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
            b: { hall: 1, woodlot: 1, archive: 0, storehouse: 0, yard: 0, front: 0 },
            wsl: { forge: 1, fridge: 1, generator: 1, garden: 1, kitchen: 1, quarry: 1 }, annex: {},
            wings: { sanctuary: 0, forge: 0, garden: 0, war_room: 0, stable: 0, library: 0 },
            builds: [], rebirths: 0, events: [], nextEventAt: t + 12 * HOUR, market: null, crafted: {}, theme: 'covenant',
            sync: { version: 0 }, applied: [], opReports: [],
            lore: {}, voices: { done: {}, flags: {}, rapport: {}, nextAt: 0, log: [] }, claims: {}, steward: '', loadouts: [],
            // 3x3 Quarter: index = row*3+col; rot 0=N 1=E 2=S 3=W. Starts unconnected on purpose.
            grid: [null, null, { id: 'generator', rot: 2 },
                { id: 'forge', rot: 1 }, null, { id: 'quarry', rot: 3 },
                { id: 'garden', rot: 0 }, { id: 'kitchen', rot: 0 }, { id: 'fridge', rot: 0 }],
            refine: { glass: 0, alloy: 0, rations: 0 },
            made: { glass: 0, alloy: 0, rations: 0 },
            knight: {
                name: 'Ser Airek', task: { kind: 'gather', id: 'chop_pine' }, prog: 0, stall: '', counts: {},
                equip: { weapon: 'squires_sword', armor: 'travelers_coat', helmet: null, boots: null, accessory: null, relic: null }, tool: 'woodaxe',
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
    // Schema 1 had three hand-made professions and free weapon choice.
    function migrate(saved) {
        if ((saved.schema || 1) >= 2) return saved;
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
        return saved;
    }
    // Repairs anything an older or hand-edited save could break: grids missing a
    // workshop, negative stock, parties naming companions who never joined.
    function sanitize(s) {
        Object.keys(s.inv).forEach((k) => { s.inv[k] = Math.max(0, Number(s.inv[k]) || 0); });
        if (!Array.isArray(s.grid) || s.grid.length !== 9) s.grid = defaults(s.t).grid;
        const seen = {};
        s.grid = s.grid.map((c) => (c && WS[c.id] && !seen[c.id] && (seen[c.id] = true)) ? { id: c.id, rot: ((c.rot | 0) % 4 + 4) % 4 } : null);
        Object.keys(WS).forEach((id) => {
            if (!seen[id]) { const free = s.grid.indexOf(null); if (free >= 0) s.grid[free] = { id: id, rot: 0 }; }
        });
        Object.keys(s.comps).forEach((id) => {
            const c = s.comps[id];
            if (!c.job || !['help', 'explore', 'rest', 'knight', 'front'].includes(c.job.kind)) c.job = { kind: 'rest' };
            if (c.job.kind === 'help' && !HELP_TARGETS.includes(c.job.target)) c.job = { kind: 'rest' };
        });
        const k = s.knight, t = k.task || {};
        if (!(t.kind === 'idle' || (t.kind === 'gather' && ACTIVITIES[t.id]) || (t.kind === 'craft' && CRAFTS[t.id] && CRAFTS[t.id].repeatable))) k.task = { kind: 'idle' };
        SLOTS.forEach((sl) => { const id = k.equip[sl[0]]; if (id && (!RES[id] || RES[id].kind !== sl[1] || fl(s.inv[id]) < 1)) k.equip[sl[0]] = null; });
        if (!k.equip.weapon) k.equip.weapon = fl(s.inv.squires_sword) ? 'squires_sword' : null;
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
        return Object.keys(S.comps).find((id) => {
            const c = s.comps[id];
            return c.joined && c.job.kind === 'help' && c.job.target === target;
        }) || null;
    }
    function knightHelper(s) {
        return Object.keys(S.comps).find((id) => s.comps[id].joined && s.comps[id].job.kind === 'knight' && !onExpedition(s, id)) || null;
    }
    function helperMul(s, target) {
        const id = helperOf(s, target);
        if (!id || onExpedition(s, id)) return 1;
        const c = s.comps[id];
        return 1 + 0.3 + Math.min(0.5, bondLvl(c) * 0.02) + (C(id).likes.includes(target) ? 0.3 : 0);
    }
    function woodlotRate(s) {
        if (damaged(s, 'woodlot')) return 0;
        const base = (s.b.woodlot >= 2 ? 120 : 60) + (skillLvl(s, 'woodcutting') >= 20 ? 20 : 0);
        return base * helperMul(s, 'woodlot') * prodMul(s) * toolMul(s, 'woodlot');
    }
    function workshopRates(s, id) {
        const mul = damaged(s, id) ? 0 : helperMul(s, id) * prodMul(s) * toolMul(s, id) * ((s.wsl[id] || 1) >= 2 ? 2 : 1) * (s.annex[id] ? 1.25 : 1), out = {};
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
            const r = Math.floor(i / 3), col = i % 3, d = DIRS[c.rot];
            const nr = r + d[0], nc = col + d[1];
            if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
            const j = nr * 3 + nc, o = grid[j];
            if (!o || (o.rot + 2) % 4 !== c.rot || j < i) return;
            const recipe = Object.keys(RECIPES).find((rid) => {
                const p = RECIPES[rid].pair;
                return (p[0] === c.id && p[1] === o.id) || (p[1] === c.id && p[0] === o.id);
            }) || null;
            out.push({ a: i, b: j, dir: c.rot, recipe: recipe });
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
        add(s, { timber: woodlotRate(s) * h });
        Object.keys(WS).forEach((id) => add(s, workshopRates(s, id), h));
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
    const FRONT_PROJECTS = { 1: ['Raise Akhar’s Front', 360, { stone: 20 }, 14400], 2: ['Reinforce the Rampart', 320, { stone: 24 }, 21600],
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
    const KEY_OF = (id) => id.indexOf('hall_') === 0 ? 'hall' : id === 'woodlot_2' ? 'woodlot' : id === 'archive' ? 'archive' : id.indexOf('front_') === 0 ? 'front' : '';
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
        if (s.b.woodlot < 2) push('woodlot_2', 'Woodlot', 'Cultivate the Woodlot', 140, { stone: 20 }, 2 * 3600, 'Woodlot produces 120 Timber/h instead of 60.');
        if ((s.b.storehouse || 0) < 1) push('storehouse_1', 'Storehouse', 'Raise the Covenant Storehouse', 180, {}, 1800, 'Timber store +300; opens Keep refining, recycling and the market.', s.b.woodlot < 2 ? 'Cultivate the Woodlot first.' : '');
        else if (s.b.storehouse < 2) push('storehouse_2', 'Storehouse', 'Vault the Storehouse', 320, { verdant_fiber: 18, ember_ingot: 12, frost_crystal: 12, storm_cell: 8 }, 28800, 'Timber store +300 more; opens tier 2 refining.', !s.b.yard ? 'Raise the Builder’s Yard first.' : '');
        if (!s.b.yard) push('yard', 'Builder’s Yard', 'Raise the Builder’s Yard', 260, { stone: 18 }, 10800, 'A second construction crew, workshop expansions and annexes.', s.b.hall < 2 ? 'Raise the Timber Outpost first.' : '');
        if ((s.b.front || 0) < 4) {
            const n = (s.b.front || 0) + 1, fp = FRONT_PROJECTS[n];
            push('front_' + n, 'Akhar’s Front', fp[0], fp[1], fp[2], fp[3], n + ' defender post' + (n > 1 ? 's' : '') + ' on the rampart, ' + 2 * n + ' Crowns/h each.', s.b.hall < 3 ? 'Needs the Settled Courtyard (Hall 3).' : '');
        }
        Object.keys(WS).forEach((w) => {
            if ((s.wsl[w] || 1) < 2) push('ws_' + w + '_2', 'Workshops', 'Expand the ' + WS[w].name, 260, WS_LEVEL2[w], 21600, WS[w].name + ' produces twice as much.', !s.b.yard ? 'Raise the Builder’s Yard first.' : '');
            else if (!s.annex[w]) push('annex_' + w, 'Workshops', WS[w].name + ' storage annex', 220, { stone: 10 }, 14400, WS[w].name + ' output +25%.');
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
        else if (id === 'woodlot_2') s.b.woodlot = 2;
        else if ((m = id.match(/^storehouse_(\d)$/))) s.b.storehouse = Math.max(s.b.storehouse || 0, +m[1]);
        else if (id === 'yard') s.b.yard = 1;
        else if ((m = id.match(/^front_(\d)$/))) s.b.front = Math.max(s.b.front || 0, +m[1]);
        else if ((m = id.match(/^ws_(\w+)_2$/))) s.wsl[m[1]] = 2;
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
        logEvent(s, bd.name + ' is complete.');
        FRESH.push(bd.name + ' is complete.');
        grantRank(s, Math.round((bd.endAt - bd.startAt) / HOUR * 30));
        s.rev++;
    }

    // —— Keep events (keep-events.json): damage suspends a building until repaired ——
    const EVENT_EVERY = 12 * HOUR;
    function rollEvent(s) {
        const list = ((window.DOMINION_KEEP && window.DOMINION_KEEP.events) || []).filter((e) => (e.minHallLevel || 1) <= s.b.hall && !(s.events || []).some((x) => x.id === e.id && !x.repaired)
            && (e.targetType === 'DECORATION' ? s.crafted[e.targetId] : ['great_hall', 'woodlot', 'archive', 'enclave'].includes(e.targetId) || WS[e.targetId] || (e.targetId === 'storehouse' && s.b.storehouse) || (e.targetId === 'builders_yard' && s.b.yard)));
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
    function refine(s, id) { if (refineBlock(s, id)) return false; spend(s, ka(REFINED[id].inputs)); add(s, { [id]: 1 }); s.rev++; return true; }
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
    function keepCraft(s, id) { if (keepCraftBlock(s, id)) return false; spend(s, ka(KEEP_CRAFTS[id][3])); s.crafted[id] = true; s.rev++; return true; }
    const toolMul = (s, room) => Object.keys(KEEP_CRAFTS).some((k) => KEEP_CRAFTS[k][1] === 'TOOL' && KEEP_CRAFTS[k][2] === room && s.crafted[k]) ? 1.2 : 1;

    // —— Voices: the Keep's conversations, and Archive lore read with Insight ——
    const LORE = () => (window.DOMINION_KEEP && window.DOMINION_KEEP.lore) || { entries: [], conversations: [] };
    const loreCost = (i) => (i === 0 ? 0 : 5);
    function readLoreBlock(s, id) {
        const i = LORE().entries.findIndex((e) => e.id === id);
        if (i < 0) return 'Unknown record.';
        if (s.lore[id]) return '';
        if (i > 0 && s.b.archive < 1) return 'Restore the Archive to read further records.';
        if (fl(s.inv.insight) < loreCost(i)) return 'Needs ' + loreCost(i) + ' Insight (read the Covenant Records at the Archive).';
        return '';
    }
    function readLore(s, id) {
        if (s.lore[id]) return true;
        if (readLoreBlock(s, id)) return false;
        const i = LORE().entries.findIndex((e) => e.id === id);
        s.inv.insight -= loreCost(i);
        s.lore[id] = true;
        grantRank(s, 25);
        s.rev++;
        return true;
    }
    function voicesReady(s) {
        if (s.voices.nextAt && s.t < s.voices.nextAt) return [];
        return LORE().conversations.filter((c) => {
            if (c.oneTime !== false && s.voices.done[c.id]) return false;
            if ((c.requiresLoreIds || []).some((id) => !s.lore[id])) return false;
            if ((c.requiresFlags || []).some((f) => !s.voices.flags[f])) return false;
            if (c.minStorehouseLevel && (s.b.storehouse || 0) < c.minStorehouseLevel) return false;
            return true;
        }).slice(0, 3);
    }
    function chooseVoice(s, convId, choiceId) {
        const c = voicesReady(s).find((x) => x.id === convId);
        if (!c) return null;
        const ch = (c.choices || []).find((x) => x.id === choiceId) || (c.choices || [])[0];
        if (!ch) return null;
        s.voices.done[c.id] = true;
        if (ch.flag) s.voices.flags[ch.flag] = true;
        s.voices.rapport[c.npcId] = (s.voices.rapport[c.npcId] || 0) + (ch.relationshipDelta || 0);
        s.voices.nextAt = s.t + 4 * HOUR;
        s.voices.log.unshift({ npc: c.npcName, prompt: c.prompt, said: ch.label, reply: ch.response || (ch.outcomes && ch.outcomes[0] && ch.outcomes[0].response) || '' });
        if (s.voices.log.length > 20) s.voices.log.length = 20;
        add(s, { silver: 2 });
        grantRank(s, 25);
        s.rev++;
        return ch;
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
        if (k === 'enclave' || k === 'workshops_built') return true;
        if (k === 'builders_yard') return !!s.b.yard;
        if (k === 'storehouse') return (s.b.storehouse || 0) >= n;
        if (k === 'workshops_l2') return Object.keys(WS).filter((w) => (s.wsl[w] || 1) >= 2).length >= n;
        if (k === 'akhars_front') return (s.b.front || 0) >= n;
        if (k === 'annexes') return Object.keys(s.annex).filter((w) => s.annex[w]).length >= n;
        if (k === 'keeper_level') return rankLvl(s) >= n;
        return false;
    }
    const checkText = (chk) => { const [k, v] = chk.split(':'); return ({ enclave: 'Enclave', builders_yard: 'Builder’s Yard', storehouse: 'Storehouse ' + v, workshops_built: 'All six workshops', workshops_l2: v + ' expanded workshops', akhars_front: 'Akhar’s Front ' + v, annexes: v + ' storage annexes', keeper_level: 'Knight Rank ' + v })[k] || chk; };
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
        Object.keys(WS).forEach((w) => { s.wsl[w] = 1; s.annex[w] = false; });
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
        if (j.kind === 'front') return 'Defending Akhar’s Front';
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
    const tradeable = (k) => DOMINION_GOODS.includes(k) || (!!CH.items[k] && !ALIAS[k] && (CH.tradeable || []).includes(CH.items[k].kind));
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

    function realmHtml() {
        if (!ONLINE) return '<div class="dm-card is-quiet"><h3>The realm</h3><p class="dm-muted">Guilds, the weekly Siege Operation and the Crowns market are shared between players, so they run on the live server at /dominion. This preview is offline.</p></div>';
        if (!NET.checked) return '<div class="dm-card"><p class="dm-muted">Checking your account…</p></div>';
        if (!NET.signedIn) return '<div class="dm-card"><h3>Sign in to join the realm</h3><p class="dm-muted">Dominion is playing on this device only. Sign in at the hub to sync your progress across devices and to use guilds, operations and the market.</p><a class="dm-btn" href="/home">Sign in at the hub</a></div>';
        if (!NET.realmAt && !NET.loading) setTimeout(loadRealm, 0);
        const sync = '<div class="dm-row"><small class="dm-muted dm-grow">' + (NET.error ? esc(NET.error) : 'Synced ' + (NET.lastSync ? new Date(NET.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—') + ' · save v' + (S.sync.version || 0)) + '</small><button class="dm-btn small secondary" type="button" data-act="realm-refresh">Refresh</button></div>';
        let h = '<div class="dm-card">' + sync + '</div>';
        const G = NET.guild;
        if (!G) return h + '<div class="dm-card"><p class="dm-muted">' + (NET.loading ? 'Loading the realm…' : 'The realm could not be loaded. Try Refresh.') + '</p></div>';
        if (!G.guild) {
            h += '<div class="dm-card"><h3>Guilds</h3><p class="dm-muted">Found or join a guild to fight its weekly Siege Operation and build its defenses. Needs Knight Rank ' + G.guildRank + ' (you are ' + G.rank + ').</p>' +
                '<form class="dm-row" data-form="guild-create"><input class="dm-input dm-grow" name="name" id="dmGuildName" maxlength="24" placeholder="Guild name" aria-label="Guild name"><button class="dm-btn small" type="submit">Found</button></form>' +
                '<form class="dm-row" data-form="guild-join"><input class="dm-input dm-grow" name="code" id="dmGuildCode" maxlength="8" placeholder="Invite code" aria-label="Invite code" style="text-transform:uppercase"><button class="dm-btn small secondary" type="submit">Join</button></form></div>';
        } else {
            const g = G.guild, op = g.operation, nextT = (g.defenseThresholds || []).find((t) => t > g.defensePoints);
            h += '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">' + esc(g.name) + '</h3><span class="dm-chip">Code ' + esc(g.code) + '</span></div>' +
                '<p class="dm-muted">Defense level ' + g.defenseLevel + ' (' + g.defensePoints + (nextT ? ' / ' + nextT : '') + ' points): operation damage +' + 10 * g.defenseLevel + '%.</p>' +
                '<div class="dm-chips">' + g.members.map((m) => '<span class="dm-chip ' + (m.you ? 'good' : '') + '">' + esc(m.name) + ' · ' + m.contribution + '</span>').join('') + '</div>' +
                '<div class="dm-label">Donate to the defenses</div><div class="dm-chips">' + Object.keys(CH.donationPoints || {}).filter((k) => fl(S.inv[k]) > 0).map((k) =>
                    '<button class="dm-btn small secondary" type="button" data-act="donate" data-arg="' + k + '">' + icon(k) + esc(itemName(k)) + ' ×' + Math.min(10, fl(S.inv[k])) + ' (+' + CH.donationPoints[k] * Math.min(10, fl(S.inv[k])) + ')</button>').join('') +
                (Object.keys(CH.donationPoints || {}).some((k) => fl(S.inv[k]) > 0) ? '' : '<span class="dm-muted">Planks, bars, rope, linen, rune stones, tonics and relics count.</span>') + '</div>' +
                '<button class="dm-btn small secondary" type="button" data-act="guild-leave">Leave guild</button></div>';
            const pct = Math.min(100, Math.round(op.damage / Math.max(1, op.maxHp) * 100));
            h += '<div class="dm-card"><span class="dm-eyebrow">Siege Operation · ' + esc(op.week) + '</span><div class="dm-row"><h3 class="dm-grow">' + esc(op.threat) + '</h3><span class="dm-chip el" style="--el:' + EL_HEX[op.element] + '">' + titleCase(op.element) + '</span></div>' +
                '<p class="dm-muted">' + esc(op.blurb) + '</p><div class="dm-bar"><b style="width:' + pct + '%"></b></div><small class="dm-muted">' + op.damage + ' / ' + op.maxHp + (op.won ? ' · defeated' : '') + ' · your share ' + op.yours + '</small>' +
                ((S.opReports || []).length ? '<small class="dm-muted">' + S.opReports.length + ' report waiting to send.</small>' : '');
            if (op.won) h += '<button class="dm-btn" type="button" data-act="op-claim"' + (op.claimed || !op.yours ? ' disabled' : '') + '>' + (op.claimed ? 'Spoils claimed' : op.yours ? 'Claim the spoils' : 'Fight next week to share spoils') + '</button>';
            else {
                const ob = operationBlock(S);
                h += '<div class="dm-list">' + Object.keys(CH.fronts || {}).map((fid) => { const f = CH.fronts[fid]; return '<div class="dm-enc"><span class="dm-mark">⚔</span><span><strong>' + esc(f.name) + '</strong><small>' + esc(f.text) + '</small></span><button class="dm-btn small" type="button" data-act="op-go" data-arg="' + fid + '"' + (ob ? ' disabled title="' + esc(ob) + '"' : '') + '>Send · 8h</button></div>'; }).join('') + '</div>' +
                    '<small class="dm-muted">Uses your Travel party and gear. Damage comes from party power and companions suited to the front.' + (ob ? ' ' + esc(ob) : '') + '</small>';
            }
            h += '</div>';
        }
        const M = NET.market;
        if (M) {
            const owned = Object.keys(S.inv).filter((k) => tradeable(k) && fl(S.inv[k]) > 0).sort();
            h += '<div class="dm-card"><h3>Crowns market</h3><p class="dm-muted">Trade with other players. Listed goods leave your storage until sold or cancelled; sellers pay a ' + Math.round(M.fee * 100) + '% fee. You hold ' + fl(S.inv.crowns) + ' Crowns.</p><div class="dm-list">' +
                (M.open.filter((l) => !l.mine).map((l) => '<div class="dm-enc"><span class="dm-mark">' + icon(l.itemId) + '</span><span><strong>' + l.qty + ' ' + esc(itemName(l.itemId)) + '</strong><small>from ' + esc(l.seller) + '</small></span><button class="dm-btn small" type="button" data-act="mk-buy" data-arg="' + esc(l.id) + '"' + (fl(S.inv.crowns) < l.price ? ' disabled' : '') + '>' + icon('crowns') + l.price + '</button></div>').join('') || '<p class="dm-muted">No listings from other players yet.</p>') + '</div>' +
                (M.mine.length ? '<div class="dm-label">Your listings</div><div class="dm-list">' + M.mine.map((l) => '<div class="dm-enc ' + (l.status === 'sold' ? 'ok' : '') + '"><span class="dm-mark">' + icon(l.itemId) + '</span><span><strong>' + l.qty + ' ' + esc(itemName(l.itemId)) + '</strong><small>' + l.price + ' Crowns · ' + l.status + '</small></span>' + (l.status === 'open' ? '<button class="dm-btn small secondary" type="button" data-act="mk-cancel" data-arg="' + esc(l.id) + '">Cancel</button>' : '<span></span>') + '</div>').join('') + '</div>' : '') +
                (owned.length ? '<form class="dm-market-form" data-form="market-list"><select class="dm-input" name="item" id="dmListItem" aria-label="Item to sell">' + owned.map((k) => '<option value="' + k + '">' + esc(itemName(k)) + ' (' + fl(S.inv[k]) + ')</option>').join('') + '</select>' +
                    '<input class="dm-input" name="qty" id="dmListQty" type="number" min="1" max="999" value="1" aria-label="Quantity"><input class="dm-input" name="price" id="dmListPrice" type="number" min="1" value="10" aria-label="Price in Crowns"><button class="dm-btn small" type="submit">List</button></form>' : '') + '</div>';
        }
        return h;
    }

    // —— UI state ——
    let S = null;
    let quarterSel = -1;
    let arranging = false;
    let sheet = null; // { kind, arg }
    let confirmReset = false;
    let lastSig = '';
    let lastRev = -1;

    function setTab(tab) {
        S.ui.tab = tab;
        document.querySelectorAll('.dm-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
        ['keep', 'knight', 'activities', 'companions'].forEach((t) => $('view-' + t).classList.toggle('hidden', t !== tab));
        renderView();
    }

    function renderStrip() {
        $('dmResStrip').innerHTML = STRIP.map((k) => '<div class="dm-res' + (k === 'timber' && S.inv.timber >= timberCap(S) - 1e-6 ? ' is-full' : '') + '" title="' + esc(RES[k].name) + (k === 'timber' ? ' (store holds ' + timberCap(S) + ')' : '') + '">' + icon(k) + '<span data-res="' + k + '">' + fl(S.inv[k]) + '</span></div>').join('') +
            '<button class="dm-res is-bag" type="button" data-act="bag" aria-label="Open storage">All ›</button>';
    }
    function renderClock() {
        const d = new Date(now());
        const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        const off = Math.round(S.offset / HOUR);
        $('dmClock').innerHTML = '<b>' + t + '</b>' + (off ? '+' + off + 'h demo' : 'local save');
    }

    // —— Keep scene ——
    function renderScene() {
        const sc = $('dmScene');
        sc.dataset.hall = String(S.b.hall);
        sc.dataset.woodlot = String(S.b.woodlot);
        sc.dataset.archive = S.b.archive >= 1 ? '1' : '0';
        sc.dataset.heal = String(Math.min(2, (S.b.archive >= 1 ? 1 : 0) + (S.b.woodlot >= 2 ? 1 : 0) + (S.b.hall >= 2 ? 1 : 0)));
        sc.querySelectorAll('.building-hotspot').forEach((b) => {
            b.classList.toggle('is-building', !!buildFor(S, b.dataset.building));
            b.classList.toggle('is-damaged', damaged(S, b.dataset.building === 'hall' ? 'great_hall' : b.dataset.building));
        });
        for (let n = 2; n <= 8; n++) sc.classList.toggle('hall-l' + n, S.b.hall >= n);
        sc.dataset.theme = S.theme || 'covenant';
        const th = HALL_THEMES.find((t) => t[0] === S.theme);
        sc.style.setProperty('--hall-accent', th ? th[2] : '#f4cc62');
        const lbl = (k, v) => { const e = sc.querySelector('[data-label="' + k + '"]'); if (e) e.textContent = v; };
        lbl('hall', HALL_RANKS[S.b.hall - 1] + (rebirths(S) ? ' \u00b7 ' + REBIRTH_TITLES[rebirths(S)] : ''));
        lbl('woodlot', 'Lv ' + S.b.woodlot + ' · ' + fmtRate(woodlotRate(S)) + ' Timber/h');
        lbl('archiveName', S.b.archive >= 1 ? 'Archive' : 'Ruined Archive');
        lbl('archive', S.b.archive >= 1 ? 'Studies \u00b7 Runecrafting' : '60 Timber + 3 Glass');
        const act = activeRecipes(S);
        lbl('quarter', act.length ? act.length + ' recipe' + (act.length > 1 ? 's' : '') + ' running' : 'No links yet');
        const resting = Object.keys(S.comps).filter((id) => S.comps[id].joined && S.comps[id].job.kind === 'rest' && !onExpedition(S, id));
        lbl('enclave', resting.length ? resting.map((id) => C(id).name).join(', ') + ' resting' : 'Residents rest here');

        // Mini Quarter mirrors the real grid, so rearranging is visible from the Keep.
        $('dmQuarterMini').innerHTML = S.grid.map((c, i) => c ? '<i class="quarter-building quarter-' + c.id + '" style="left:' + (4 + (i % 3) * 33) + '%;bottom:' + (6 + (2 - Math.floor(i / 3)) * 31) + '%"><b></b></i>' : '').join('') +
            links(S.grid).filter((l) => l.recipe).map((l) => {
                const ra = Math.floor(l.a / 3), ca = l.a % 3, rb = Math.floor(l.b / 3), cb = l.b % 3;
                if (ra === rb) return '<i class="quarter-link" style="left:' + (24 + Math.min(ca, cb) * 33) + '%;bottom:' + (18 + (2 - ra) * 31) + '%;width:16%"></i>';
                return '<i class="quarter-link" style="left:' + (15 + ca * 33) + '%;bottom:' + (6 + (2 - Math.max(ra, rb)) * 31 + 22) + '%;width:4px;height:12%"></i>';
            }).join('');

        const ov = [];
        const obj = currentObjective(S);
        if (obj) {
            ov.push('<button class="dm-objective" type="button" data-act="objective"><span class="dm-eyebrow">' + esc(obj.ch.chapter) + ' · ' + (obj.i + 1) + '/' + obj.ch.steps.length + '</span><strong>' + esc(obj.step.title) + '</strong>' +
                '<span class="dm-steps">' + obj.ch.steps.map((st, i) => '<i class="' + (S.obj[st.id] ? 'done' : i === obj.i ? 'now' : '') + '"></i>').join('') + '</span></button>');
        }
        // Knight at the Hall door, or a signpost on the road while away.
        if (S.exp) {
            const d = DEST[S.exp.dest];
            ov.push('<button class="dm-knight" type="button" data-act="tab" data-arg="activities" style="top:auto;bottom:31%" aria-label="Knight on expedition">' +
                '<span class="dm-art" style="opacity:.55">' + artImg('knight', '') + '</span><span class="dm-pip">' + esc(d.name) + ' · <span data-live="eta" data-end="' + S.exp.endAt + '"></span></span></button>');
        } else {
            const td = taskDef(S.knight.task);
            const job = !td ? 'Idle at the Hall' : taskLabel(S) + ' · ' + SKILLS[td.skillId].name + ' ' + skillLvl(S, td.skillId);
            ov.push('<button class="dm-knight" type="button" data-act="tab" data-arg="knight" aria-label="Open the Knight: ' + esc(job) + '">' +
                '<span class="dm-art">' + artImg('knight', '') + '</span><span class="dm-pip green">' + esc(job) + '</span></button>');
        }
        // Residents appear where they work.
        const spot = { woodlot: 'left:30%;bottom:22%', forge: 'left:6%;top:41%', fridge: 'left:30%;top:52%', generator: 'left:30%;top:39%', garden: 'left:6%;top:52%', kitchen: 'left:18%;top:52%', quarry: 'left:18%;top:41%' };
        let restSlot = 0, exploreSlot = 0;
        Object.keys(S.comps).slice(0, 12).forEach((id) => {
            const c = S.comps[id];
            if (!c.joined || onExpedition(S, id) || c.job.kind === 'front' || c.job.kind === 'knight') return;
            if (c.job.kind === 'rest' && restSlot >= 4) return;
            let pos;
            if (c.job.kind === 'help') pos = spot[c.job.target];
            else if (c.job.kind === 'rest') pos = 'right:' + (8 + restSlot++ * 12) + '%;top:44%';
            else pos = 'left:' + (44 + exploreSlot++ * 9) + '%;bottom:2%;opacity:.7';
            ov.push('<span class="dm-resident" style="' + pos + ';--el:var(--' + C(id).el + ')" title="' + esc(C(id).name) + '">' + compArt(id, C(id).name) + '</span>');
        });
        const pipPos = { hall: 'left:50%;top:12%;transform:translateX(-50%)', woodlot: 'left:8%;bottom:30%', archive: 'right:8%;bottom:31%' };
        (S.builds || []).forEach((b, i) => {
            const pos = pipPos[KEY_OF(b.id)] || ('left:50%;bottom:' + (14 + i * 6) + '%;transform:translateX(-50%)');
            ov.push('<span class="dm-pip" style="' + pos + '">' + esc(KEY_OF(b.id) ? 'Building' : b.name) + ' \u00b7 <span data-live="eta" data-end="' + b.endAt + '"></span></span>');
        });
        const dmg = (S.events || []).filter((e) => !e.repaired);
        if (dmg.length) ov.push('<button class="dm-pip" type="button" data-act="goto-keep" style="right:4%;top:31%;pointer-events:auto;border-color:rgba(255,138,115,.7);color:#ffb3a3">' + dmg.length + ' to repair</button>');
        if (S.b.front >= 1) ov.push('<span class="dm-pip" style="left:50%;top:27%;transform:translateX(-50%)">Akhar\u2019s Front \u00b7 ' + Math.min(defenders(S).length, frontCap(S)) + '/' + frontCap(S) + ' posted</span>');
        if (act.length) ov.push('<span class="dm-pip green" style="left:4%;top:37.5%">' + act.map((r) => esc(RECIPES[r].name)).join(' + ') + '</span>');
        $('dmSceneOverlay').innerHTML = ov.join('');
    }

    // —— Knight view ——
    function renderKnight() {
        const k = S.knight, busy = knightBusy(S);
        const sec = S.ui.knight;
        const w = weaponItem(S);
        let h = '<div class="dm-pad">';
        h += '<div class="dm-card"><div class="dm-hero"><span class="dm-art">' + artImg('knight', k.name) + '</span><div class="dm-grow" style="display:grid;gap:4px;min-width:0">' +
            '<span class="dm-eyebrow">SiegeKnight · Rank ' + rankLvl(S) + '</span><h2>' + esc(k.name) + '</h2>' +
            '<div class="dm-chips"><span class="dm-chip">' + glyph((WEAPONS[w.weaponType] || WEAPONS.sword).glyph) + esc(w.name) + '</span>' + (k.tool ? '<span class="dm-chip">' + icon(k.tool) + esc(itemName(k.tool)) + '</span>' : '') + '</div></div></div>';
        h += currentTaskHtml();
        h += '</div>';
        h += '<div class="dm-seg" role="group" aria-label="Knight sections">' + [['work', 'Work'], ['gear', 'Gear'], ['skills', 'Skills']].map((x) =>
            '<button type="button" data-act="knight-sec" data-arg="' + x[0] + '" aria-pressed="' + (sec === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
        if (sec === 'gear') h += gearHtml();
        else if (sec === 'skills') h += skillsHtml();
        else h += workHtml();
        h += '</div>';
        $('view-knight').innerHTML = h;
    }
    function currentTaskHtml() {
        const k = S.knight;
        if (knightBusy(S)) {
            return '<div class="dm-bar"><b data-live="bar" data-start="' + S.exp.startAt + '" data-end="' + S.exp.endAt + '"></b></div><p class="dm-muted">On expedition to ' + esc(DEST[S.exp.dest].name) + ', back in <span data-live="eta" data-end="' + S.exp.endAt + '"></span>. ' +
                esc(taskLabel(S)) + ' is paused and resumes on return. Gear is locked for the journey.</p><button class="dm-btn secondary" type="button" data-act="tab" data-arg="activities">View expedition</button>';
        }
        if (k.task.kind === 'idle') return '<p class="dm-muted">Idle at the Hall. Pick work below, or plan an expedition.</p><button class="dm-btn secondary" type="button" data-act="tab" data-arg="activities">Plan an expedition</button>';
        const def = taskDef(k.task), r = knightRates(S), pr = xpProgress(k.skills[def.skillId]);
        const help = knightHelper(S);
        return '<div class="dm-row"><span class="dm-grow"><span class="dm-eyebrow">Working · ' + esc(SKILLS[def.skillId].name) + ' Lv ' + pr.l + '</span><br><strong style="font:700 15px/1.3 var(--display);color:#fff1b7">' + esc(taskLabel(S)) + '</strong> <small class="dm-muted">' + esc(def.place || SKILL_PLACE[def.skillId] || '') + '</small></span>' +
            '<button class="dm-btn small secondary" type="button" data-act="task" data-arg="idle:">Stop</button></div>' +
            '<div class="dm-bar green"><b data-live="action" style="width:' + Math.round(Math.min(1, k.prog) * 100) + '%"></b></div>' +
            (k.stall ? '<p class="dm-muted" style="color:var(--gold)">' + esc(k.stall) + '</p>' : '<p class="dm-muted">' + esc(rateLine(r)) + (help ? ' · ' + esc(C(help).name) + ' assisting' : '') + '</p>');
    }
    function rateLine(r) {
        const g = Object.keys(r.gain).map((x) => '+' + fmtRate(r.gain[x]) + ' ' + itemName(x));
        const u = Object.keys(r.use).map((x) => '−' + fmtRate(r.use[x]) + ' ' + itemName(x));
        return (g.concat(u).join(', ') || 'Nothing') + ' per hour · ' + Math.round(r.xp) + ' XP/h';
    }
    function rateText(r) {
        const keys = Object.keys(r).filter((k) => r[k] > 0);
        return keys.length ? keys.map((k) => fmtRate(r[k]) + ' ' + itemName(k) + '/h').join(', ') : 'nothing';
    }

    function workHtml() {
        const grp = S.ui.group || 'Gathering';
        let h = '<div class="dm-seg" role="group" aria-label="Profession groups">' + SKILL_GROUPS.map((g) =>
            '<button type="button" data-act="group" data-arg="' + g[0] + '" aria-pressed="' + (grp === g[0]) + '">' + g[1] + '</button>').join('') + '</div>';
        Object.keys(SKILLS).filter((id) => SKILLS[id].group === grp).forEach((id) => { h += professionCard(id); });
        return h;
    }
    function professionCard(id) {
        const sk = SKILLS[id], open = S.ui.prof === id, unlocked = skillUnlocked(S, id), pr = xpProgress(S.knight.skills[id]);
        let h = '<div class="dm-card' + (unlocked ? '' : ' is-quiet') + '"><button class="dm-row" type="button" data-act="prof" data-arg="' + id + '" aria-expanded="' + open + '" style="text-align:left;width:100%">' +
            '<span class="dm-grow"><strong style="font:700 14px/1.2 var(--display);color:#fff1b7">' + esc(sk.name) + '</strong><br><small class="dm-muted">' + esc(unlocked ? sk.blurb : lockText(S, id)) + '</small></span>' +
            '<span class="dm-chip ' + (unlocked ? '' : 'warn') + '">' + (unlocked ? 'Lv ' + pr.l : 'Locked') + '</span><span aria-hidden="true" style="color:var(--faint)">' + (open ? '▾' : '▸') + '</span></button>' +
            (unlocked ? '<div class="dm-bar green"><b style="width:' + pr.pct + '%"></b></div>' : '');
        if (open) h += professionBody(id, unlocked);
        return h + '</div>';
    }
    function professionBody(id, unlocked) {
        let h = '';
        if (TRAINED_BY[id]) h += '<p class="dm-muted"><b>Trained by:</b> ' + esc(TRAINED_BY[id]) + '</p>';
        const acts = Object.keys(ACTIVITIES).map((a) => ACTIVITIES[a]).filter((a) => a.skillId === id).sort((a, b) => a.level - b.level);
        const crafts = Object.keys(CRAFTS).map((r) => CRAFTS[r]).filter((r) => r.skillId === id).sort((a, b) => a.level - b.level);
        if (acts.length || crafts.length) h += '<div class="dm-list">' + acts.map(activityRow).join('') + crafts.map(craftRow).join('') + '</div>';
        const ms = (MILESTONES[id] || []);
        if (ms.length) h += '<ul class="dm-milestones">' + ms.map((m) => '<li class="' + (skillLvl(S, id) >= m[0] ? 'done' : '') + '"><b>Lv ' + m[0] + '</b><span>' + esc(m[1]) + '</span></li>').join('') + '</ul>';
        const opens = Object.keys(SKILLS).filter((o) => SKILLS[o].unlock.some((r) => r.kind === 'SKILL' && r.key === id));
        if (opens.length) h += '<p class="dm-muted">Opens: ' + opens.map((o) => esc(SKILLS[o].name + ' at ' + SKILLS[o].unlock.find((r) => r.key === id).level)).join(', ') + '.</p>';
        if (SKILL_PLACE[id]) h += '<p class="dm-muted">Practised at the ' + esc(SKILL_PLACE[id]) + (unlocked ? '' : '') + '.</p>';
        return h;
    }
    function activityRow(a) {
        const cur = S.knight.task.kind === 'gather' && S.knight.task.id === a.id;
        const block = taskBlock(S, a);
        const per = fmtDur(actionMs(S, a));
        return '<div class="dm-enc ' + (block ? 'miss' : cur ? 'ok' : '') + '"><span class="dm-mark">' + icon(al(a.output)) + '</span><span><strong>' + esc(a.name) + (a.dominion ? ' <span class="dm-planned">Keep</span>' : '') + '</strong><small>' +
            esc(a.place + ' · 1 ' + itemName(al(a.output)) + ' every ' + per + (a.bonusOutput ? ' (+' + itemName(al(a.bonusOutput)) + ' every ' + a.bonusEvery + ')' : '') + ' · ' + a.xp + ' XP') + (block ? '<br>' + esc(block) : '') + '</small></span>' +
            '<button class="dm-btn small ' + (cur ? '' : 'secondary') + '" type="button" data-act="task" data-arg="gather:' + a.id + '"' + (block || knightBusy(S) ? ' disabled' : '') + ' aria-pressed="' + cur + '">' + (cur ? 'Working' : 'Work') + '</button></div>';
    }
    function craftRow(r) {
        const out = r.studyElement ? null : al(r.output);
        const name = r.studyElement ? titleCase(r.studyElement) + ' studies' : itemName(out);
        const inp = alMap(r.inputs);
        const inText = Object.keys(inp).map((x) => inp[x] + ' ' + itemName(x)).join(' + ');
        const block = r.repeatable ? taskBlock(S, r) : craftBlock(S, r.id);
        const lockOnly = taskBlock(S, r);
        const cur = S.knight.task.kind === 'craft' && S.knight.task.id === r.id;
        const owned = out && RES[out] && ['WEAPON', 'ARMOR', 'HELMET', 'BOOTS', 'ACCESSORY', 'RELIC'].includes(RES[out].kind) ? fl(S.inv[out]) : 0;
        const detail = r.repeatable
            ? inText + ' → ' + (r.studyElement ? STUDY_AFFINITY_XP + ' ' + titleCase(r.studyElement) + ' Affinity' : (r.outputQty || 1) + ' ' + name) + ' every ' + fmtDur(actionMs(S, r)) + ' · ' + r.xp + ' XP'
            : inText + ' · made at once · ' + r.xp + ' XP' + (owned ? ' · owned ' + owned : '');
        const btn = r.repeatable
            ? '<button class="dm-btn small ' + (cur ? '' : 'secondary') + '" type="button" data-act="task" data-arg="craft:' + r.id + '"' + (lockOnly || knightBusy(S) ? ' disabled' : '') + ' aria-pressed="' + cur + '">' + (cur ? 'Working' : 'Work') + '</button>'
            : '<button class="dm-btn small" type="button" data-act="craft" data-arg="' + r.id + '"' + (block ? ' disabled' : '') + '>Make</button>';
        return '<div class="dm-enc ' + (lockOnly ? 'miss' : cur ? 'ok' : '') + '"><span class="dm-mark">' + (out ? icon(out) : '<svg viewBox="0 0 24 24">' + SHAPE.orb(EL_HEX[r.studyElement] || '#ccc') + '</svg>') + '</span><span><strong>' + esc(name) + (r.dominion ? ' <span class="dm-planned">Keep</span>' : '') + '</strong><small>' +
            esc(detail) + (lockOnly ? '<br>' + esc(lockOnly) : (!r.repeatable && block ? '<br>' + esc(block) : '')) + '</small></span>' + btn + '</div>';
    }

    function gearHtml() {
        const busy = knightBusy(S), g = gearStats(S);
        let h = '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">Equipment</h3><span class="dm-chip">Armor ' + g.armor + '</span></div>' +
            '<p class="dm-muted">Smithing, Weaving, Carpentry and Runecrafting make better gear. Weapon tier adds 20% to that weapon’s encounter rewards; armor trims expedition losses; boots shorten journeys.' + (busy ? ' Locked until the Knight returns.' : '') + '</p><div class="dm-list">';
        SLOTS.forEach((sl) => {
            const id = S.knight.equip[sl[0]], it = RES[id];
            const open = S.ui.slot === sl[0];
            h += '<button class="dm-enc" type="button" data-act="slot" data-arg="' + sl[0] + '" aria-expanded="' + open + '" style="text-align:left;width:100%"' + (busy ? ' disabled' : '') + '><span class="dm-mark">' + (id ? icon(id) : '–') + '</span><span><strong>' + sl[2] + '</strong><small>' + esc(it ? it.name + gearNote(id) : 'Empty') + '</small></span><span class="dm-chip">' + (open ? 'Close' : 'Change') + '</span></button>';
            if (open) {
                const owned = Object.keys(RES).filter((x) => RES[x].kind === sl[1] && fl(S.inv[x]) > 0);
                h += '<div class="dm-chips" style="padding:0 0 6px 34px">' + (owned.length ? owned.map((x) => '<button class="dm-btn small ' + (x === id ? '' : 'secondary') + '" type="button" data-act="equip" data-arg="' + sl[0] + ':' + x + '" aria-pressed="' + (x === id) + '">' + esc(RES[x].name) + '</button>').join('') : '<span class="dm-muted">Nothing owned for this slot yet.</span>') +
                    (id && sl[0] !== 'weapon' ? '<button class="dm-btn small secondary" type="button" data-act="equip" data-arg="' + sl[0] + ':">Remove</button>' : '') + '</div>';
            }
        });
        h += '</div></div><div class="dm-card"><h3>Gathering tool</h3><div class="dm-options">';
        ['woodaxe', 'pickaxe'].filter((t) => fl(S.inv[t]) > 0).forEach((t) => {
            h += '<button class="dm-option" type="button" data-act="tool" data-arg="' + t + '" aria-pressed="' + (S.knight.tool === t) + '"' + (busy ? ' disabled' : '') + '>' + glyph(TOOL_GLYPH[t]) + '<strong>' + esc(RES[t].name) + '</strong><small>' + esc(RES[t].blurb) + '</small></button>';
        });
        h += '</div></div>';
        const slots = loadoutSlots(S);
        h += '<div class="dm-card' + (slots ? '' : ' is-quiet') + '"><h3>War Room loadouts</h3>' + (slots ? '<p class="dm-muted">Save gear, tool, party and rune together, and switch in one tap.</p><div class="dm-list">' + Array.from({ length: slots }, (_, i) => {
            const l = S.loadouts[i];
            return '<div class="dm-enc"><span class="dm-mark">' + (i + 1) + '</span><span><strong>' + (l ? esc(itemName(l.equip.weapon)) + (l.party.length ? ' \u00b7 ' + l.party.map((p) => S.comps[p] ? C(p).name : p).join(', ') : '') : 'Empty') + '</strong></span><span class="dm-chips"><button class="dm-btn small secondary" type="button" data-act="loadout-save" data-arg="' + i + '">Save</button>' +
                (l ? '<button class="dm-btn small" type="button" data-act="loadout-apply" data-arg="' + i + '"' + (busy ? ' disabled' : '') + '>Use</button>' : '') + '</span></div>';
        }).join('') + '</div>' : '<p class="dm-muted">Build the War Room (Chronicles wing in the Great Hall) to save loadouts.</p>') + '</div>';
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
    function skillsHtml() {
        let h = '';
        SKILL_GROUPS.forEach((g) => {
            const ids = Object.keys(SKILLS).filter((id) => SKILLS[id].group === g[0]);
            h += '<div class="dm-card"><h3>' + esc(g[0]) + '</h3><div class="dm-list">' + ids.map((id) => {
                const pr = xpProgress(S.knight.skills[id]), un = skillUnlocked(S, id);
                return '<div class="dm-skill"><div class="dm-skill-head"><strong>' + esc(SKILLS[id].name) + '</strong><span>' + (un ? 'Lv ' + pr.l : 'Locked') + '</span></div>' + (un ? '<div class="dm-bar green"><b style="width:' + pr.pct + '%"></b></div>' : '<small class="dm-muted">' + esc(lockText(S, id)) + '</small>') + '</div>';
            }).join('') + '</div></div>';
        });
        h += '<div class="dm-card"><h3>Weapon proficiency</h3><p class="dm-muted">Grows with every expedition. Each level adds 15% to that weapon’s encounter rewards.</p>' + Object.keys(WEAPONS).map((w) => {
            const pr = xpProgress(S.knight.prof[w]);
            return '<div class="dm-skill"><div class="dm-skill-head"><strong>' + WEAPONS[w].name + '</strong><span>Lv ' + pr.l + '</span></div><div class="dm-bar"><b style="width:' + pr.pct + '%"></b></div></div>';
        }).join('') + '</div>';
        h += '<div class="dm-card"><h3>Elemental affinity</h3><p class="dm-muted">From studies and from expeditions with Siegelings of that element. Some recipes need it.</p><div class="dm-chips">' + ELEMENTS.map((e) =>
            '<span class="dm-chip el" style="--el:' + EL_HEX[e] + '">' + titleCase(e) + ' ' + affLvl(S, e) + '</span>').join('') + '</div></div>';
        h += '<div class="dm-card"><h3>Class mastery</h3><p class="dm-muted">Grows when companions of a class succeed on the road.</p><div class="dm-chips">' + CLASSES.map((c) => '<span class="dm-chip">' + c + ' ' + masteryLvl(S, c) + '</span>').join('') + '</div></div>';
        return h;
    }

    // —— Activities view ——
    function renderActivities() {
        const sec = S.ui.act;
        const voices = voicesReady(S).length;
        let h = '<div class="dm-pad">';
        h += '<div class="dm-seg dm-seg-5" role="group" aria-label="Activity sections">' + [['expedition', 'Travel'], ['build', 'Build'], ['keep', 'Keep'], ['voices', 'Voices' + (voices ? ' •' : '')], ['realm', 'Realm'], ['log', 'Log']].map((x) =>
            '<button type="button" data-act="act-sec" data-arg="' + x[0] + '" aria-pressed="' + (sec === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
        if (sec === 'expedition') h += expeditionHtml();
        else if (sec === 'build') h += buildListHtml();
        else if (sec === 'keep') h += keepHtml();
        else if (sec === 'voices') h += voicesHtml();
        else if (sec === 'realm') h += realmHtml();
        else h += logHtml();
        h += '</div>';
        $('view-activities').innerHTML = h;
    }
    function buildRow(p) {
        const block = buildBlock(S, p.id);
        return '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">' + esc(p.name) + '</h3><span class="dm-chip">' + fmtDur(p.ms) + '</span></div><p class="dm-muted">' + esc(p.effect) + '</p>' +
            '<div class="dm-cost">' + costChips(p.cost, S) + '</div><button class="dm-btn" type="button" data-act="build" data-arg="' + p.id + '"' + (block ? ' disabled' : '') + '>Start construction</button>' + (block ? '<small class="dm-muted">' + esc(block) + '</small>' : '') + '</div>';
    }
    function buildListHtml() {
        let h = '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">Crews</h3><span class="dm-chip">' + S.builds.length + '/' + crews(S) + ' busy</span></div>' +
            (S.builds.length ? S.builds.map((b) => '<div class="dm-skill"><div class="dm-skill-head"><strong>' + esc(b.name) + '</strong><span><span data-live="eta" data-end="' + b.endAt + '"></span></span></div><div class="dm-bar"><b data-live="bar" data-start="' + b.startAt + '" data-end="' + b.endAt + '"></b></div></div>').join('') : '<p class="dm-muted">No construction under way. Building continues while the Knight is away.</p>') +
            '<p class="dm-muted">Keep rank: ' + esc(HALL_RANKS[S.b.hall - 1]) + (rebirths(S) ? ' · ' + esc(REBIRTH_TITLES[rebirths(S)]) : '') + ' · Timber store ' + timberCap(S) + '</p></div>';
        const groups = {};
        projectList(S).forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
        const open = S.ui.bgroup || 'Great Hall';
        Object.keys(groups).forEach((g) => {
            const ps = groups[g], ready = ps.filter((p) => !buildBlock(S, p.id)).length;
            h += '<button class="dm-route" type="button" data-act="bgroup" data-arg="' + esc(g) + '" aria-expanded="' + (open === g) + '" style="grid-template-columns:minmax(0,1fr) auto"><span><strong>' + esc(g) + '</strong><small>' + ps.length + ' project' + (ps.length > 1 ? 's' : '') + (ready ? ' · ' + ready + ' ready to start' : '') + '</small></span><span class="dm-chip">' + (open === g ? '▾' : '▸') + '</span></button>';
            if (open === g) h += ps.map(buildRow).join('');
        });
        return h;
    }
    function keepHtml() {
        let h = '';
        const ev = (S.events || []).filter((e) => !e.repaired);
        if (ev.length) {
            h += '<div class="dm-card" style="border-color:rgba(255,138,115,.5)"><h3>Damage around the Keep</h3>' + ev.map((e) => {
                const b = repairBlock(S, e.id);
                return '<div class="dm-skill"><div class="dm-skill-head"><strong>' + esc(e.title) + '</strong><span>' + esc(e.targetName) + '</span></div><small class="dm-muted">' + esc(e.text) + '</small>' +
                    (e.repairEndAt ? '<div class="dm-bar"><b data-live="bar" data-start="' + (e.repairEndAt - e.repairMs) + '" data-end="' + e.repairEndAt + '"></b></div><small class="dm-muted">Repaired in <span data-live="eta" data-end="' + e.repairEndAt + '"></span></small>'
                        : '<button class="dm-btn small" type="button" data-act="repair" data-arg="' + esc(e.id) + '"' + (b ? ' disabled' : '') + '>Repair · ' + e.cost + ' Timber · ' + fmtDur(e.repairMs) + '</button>' + (b ? '<small class="dm-muted">' + esc(b) + '</small>' : '')) + '</div>';
            }).join('') + '<p class="dm-muted">Each repair pays 6 Silver.</p></div>';
        }
        h += '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">Stewardship</h3><span class="dm-chip">' + icon('silver') + fl(S.inv.silver) + '</span><span class="dm-chip">' + icon('crowns') + fl(S.inv.crowns) + '</span></div><p class="dm-muted">Walk the Keep once a day: +4 Silver.</p>' +
            '<button class="dm-btn small" type="button" data-act="steward"' + (stewardReady(S) ? '' : ' disabled') + '>' + (stewardReady(S) ? 'Walk the Keep' : 'Walked today') + '</button></div>';
        if (!(S.b.storehouse >= 1)) return h + '<div class="dm-card is-quiet"><h3>Storehouse</h3><p class="dm-muted">Raise the Covenant Storehouse (Build › Storehouse) to open refining, recycling and the market.</p></div>' + keepCraftsHtml() + themesHtml() + rebirthHtml();
        h += '<div class="dm-card"><h3>Refine</h3><div class="dm-list">' + Object.keys(REFINED).map((id) => {
            const r = REFINED[id], b = refineBlock(S, id), inp = ka(r.inputs);
            return '<div class="dm-enc ' + (b && b !== 'Missing materials.' ? 'miss' : '') + '"><span class="dm-mark">' + icon(id) + '</span><span><strong>' + esc(r.name) + ' <small class="dm-muted">(' + fl(S.inv[id]) + ')</small></strong><small>' + esc(Object.keys(inp).map((k) => inp[k] + ' ' + itemName(k)).join(' + ')) + (b ? '<br>' + esc(b) : '') + '</small></span><button class="dm-btn small" type="button" data-act="refine" data-arg="' + id + '"' + (b ? ' disabled' : '') + '>Make</button></div>';
        }).join('') + '</div></div>';
        const rf = S.ui.recFrom || 'stone', rt = S.ui.recTo || 'ember';
        h += '<div class="dm-card"><h3>Recycle</h3><p class="dm-muted">3 of one raw material for 1 of another, 15 Timber for 1 raw, or salvage half of a refined good.</p><div class="dm-label">Give</div><div class="dm-chips">' +
            ['timber'].concat(RAW, Object.keys(REFINED).filter((k) => fl(S.inv[k]) > 0)).map((k) => '<button class="dm-btn small ' + (rf === k ? '' : 'secondary') + '" type="button" data-act="rec-from" data-arg="' + k + '">' + esc(itemName(k)) + ' (' + fl(S.inv[k]) + ')</button>').join('') + '</div>' +
            (REFINED[rf] ? '' : '<div class="dm-label">Get</div><div class="dm-chips">' + RAW.filter((k) => k !== rf).map((k) => '<button class="dm-btn small ' + (rt === k ? '' : 'secondary') + '" type="button" data-act="rec-to" data-arg="' + k + '">' + esc(itemName(k)) + '</button>').join('') + '</div>') +
            '<button class="dm-btn small" type="button" data-act="recycle"' + (recycleBlock(S, rf, rt) ? ' disabled' : '') + '>' + (REFINED[rf] ? 'Salvage 1 ' + esc(itemName(rf)) : 'Recycle into ' + esc(itemName(rt))) + '</button><small class="dm-muted">' + esc(recycleBlock(S, rf, rt)) + '</small></div>';
        h += '<div class="dm-card"><h3>Keep market</h3><p class="dm-muted">New offers each day. Silver lots, plus one rare lot in Crowns (Dominion never charges real Siegecoins).</p><div class="dm-list">' + marketOffers(S).map((m) => {
            const b = buyBlock(S, m.id);
            return '<div class="dm-enc"><span class="dm-mark">' + icon(m.res) + '</span><span><strong>' + m.amount + ' ' + esc(itemName(m.res)) + '</strong><small>' + titleCase(m.rarity) + ' · ' + marketLeft(S, m) + ' left today</small></span><button class="dm-btn small" type="button" data-act="buy" data-arg="' + m.id + '"' + (b ? ' disabled title="' + esc(b) + '"' : '') + '>' + icon(m.currency) + m.price + '</button></div>';
        }).join('') + '</div></div>';
        return h + keepCraftsHtml() + themesHtml() + rebirthHtml();
    }
    function keepCraftsHtml() {
        return '<div class="dm-card"><h3>Keep crafts</h3><p class="dm-muted">Tools lift a room’s output 20%. Crates add timber storage; channels lift every workshop 10%. Decorations are for the look of the Keep.</p><div class="dm-list">' + Object.keys(KEEP_CRAFTS).map((id) => {
            const k = KEEP_CRAFTS[id], b = keepCraftBlock(S, id), inp = ka(k[3]);
            return '<div class="dm-enc ' + (S.crafted[id] ? 'ok' : '') + '"><span class="dm-mark">' + (S.crafted[id] ? '✓' : '•') + '</span><span><strong>' + esc(k[0]) + '</strong><small>' + titleCase(k[1]) + ' · ' + esc(titleCase(k[2])) + ' · ' + esc(Object.keys(inp).map((x) => inp[x] + ' ' + itemName(x)).join(' + ')) + '</small></span>' +
                (S.crafted[id] ? '<span></span>' : '<button class="dm-btn small" type="button" data-act="kcraft" data-arg="' + id + '"' + (b ? ' disabled' : '') + '>Make</button>') + '</div>';
        }).join('') + '</div></div>';
    }
    function themesHtml() {
        return '<div class="dm-card"><h3>Hall banners</h3><div class="dm-chips">' + HALL_THEMES.map((t) => {
            const lock = S.b.hall < t[3];
            return '<button class="dm-btn small ' + (S.theme === t[0] ? '' : 'secondary') + '" type="button" data-act="theme" data-arg="' + t[0] + '"' + (lock ? ' disabled title="Hall ' + t[3] + '"' : '') + ' style="box-shadow:inset 3px 0 ' + t[2] + '">' + esc(t[1]) + (lock ? ' · Hall ' + t[3] : '') + '</button>';
        }).join('') + '</div></div>';
    }
    function rebirthHtml() {
        const r = rebirthReq(S);
        if (!r) return '<div class="dm-card is-quiet"><h3>Rebirth</h3><p class="dm-muted">Covenant Eternal: all ten rebirths done.</p></div>';
        const b = rebirthBlock(S);
        return '<div class="dm-card is-quiet"><div class="dm-row"><h3 class="dm-grow">Rebirth ' + r.n + ': ' + esc(REBIRTH_TITLES[r.n]) + '</h3>' + (rebirths(S) ? '<span class="dm-chip warn">' + esc(REBIRTH_TITLES[rebirths(S)]) + '</span>' : '') + '</div>' +
            '<p class="dm-muted">Resets the Keep’s buildings and raw stock. The Knight, companions, Chronicles wings, lore, voices and crafts carry over. Each rebirth: Keep production +25%, storage +20%, builds 10% faster, costs +15%.</p>' +
            '<div class="dm-chips">' + ['hall:' + r.hall].concat(r.checks).map((c) => { const ok = c.indexOf('hall:') === 0 ? S.b.hall >= r.hall : checkMet(S, c); return '<span class="dm-chip ' + (ok ? 'good' : 'bad') + '">' + esc(c.indexOf('hall:') === 0 ? HALL_RANKS[r.hall - 1] : checkText(c)) + '</span>'; }).join('') + '</div>' +
            '<div class="dm-cost">' + costChips(r.cost, S) + '</div>' + (S.ui.confirmRebirth ? '<div class="dm-chips"><button class="dm-btn small" type="button" data-act="rebirth-yes"' + (b ? ' disabled' : '') + '>Rebirth the Keep</button><button class="dm-btn small secondary" type="button" data-act="rebirth-no">Not yet</button></div>' :
            '<button class="dm-btn small secondary" type="button" data-act="rebirth"' + (b ? ' disabled' : '') + '>Prepare rebirth</button>') + (b ? '<small class="dm-muted">' + esc(b) + '</small>' : '') + '</div>';
    }
    function voicesHtml() {
        const L = LORE(), ready = voicesReady(S);
        let h = '';
        if (ready.length) {
            ready.slice(0, 1).forEach((c) => {
                h += '<div class="dm-card"><span class="dm-eyebrow">' + esc(c.npcRole || '') + (c.kicker ? ' · ' + esc(c.kicker) : '') + '</span><h3>' + esc(c.npcName) + '</h3><p class="dm-muted" style="color:var(--cream);font-size:13px">' + esc(c.prompt) + '</p><div class="dm-list">' +
                    (c.choices || []).map((ch) => '<button class="dm-option" type="button" data-act="voice" data-arg="' + esc(c.id) + ':' + esc(ch.id) + '"><strong>' + esc(ch.label) + '</strong></button>').join('') + '</div><small class="dm-muted">Each conversation pays 2 Silver and rank XP. Another voice arrives every 4 hours.</small></div>';
            });
        } else {
            h += '<div class="dm-card is-quiet"><h3>Voices</h3><p class="dm-muted">' + (S.voices.nextAt > S.t ? 'The next visitor arrives in <span data-live="eta" data-end="' + S.voices.nextAt + '"></span>.' : 'Read more records in the Archive to open new conversations.') + '</p></div>';
        }
        if (S.voices.log.length) h += '<div class="dm-card"><h3>Recent conversations</h3><div class="dm-list">' + S.voices.log.slice(0, 4).map((v) => '<div><small class="dm-muted">' + esc(v.npc) + '</small><p class="dm-muted" style="margin:2px 0;color:var(--cream)">“' + esc(v.said) + '”</p><p class="dm-muted">' + esc(v.reply) + '</p></div>').join('') + '</div></div>';
        h += '<div class="dm-card"><h3>Archive records</h3><p class="dm-muted">The first is free; the rest cost 5 Insight each, earned by reading the Covenant Records.</p><div class="dm-list">' + L.entries.map((e, i) => {
            const read = !!S.lore[e.id], b = readLoreBlock(S, e.id), open = S.ui.lore === e.id;
            return '<div class="dm-enc ' + (read ? 'ok' : '') + '"><span class="dm-mark">' + (read ? '✓' : '•') + '</span><span><strong>' + esc(e.title) + '</strong><small>' + esc(titleCase(e.type) + ' · ' + (e.source || '')) + (read && open ? '</small><p class="dm-muted" style="white-space:pre-line;color:var(--cream)">' + esc(e.body || e.summary || '') + '</p><small>' : '') + (!read && b ? '<br>' + esc(b) : '') + '</small></span>' +
                '<button class="dm-btn small ' + (read ? 'secondary' : '') + '" type="button" data-act="lore" data-arg="' + esc(e.id) + '"' + (!read && b ? ' disabled' : '') + '>' + (read ? (open ? 'Close' : 'Open') : 'Read' + (loreCost(i) ? ' · ' + loreCost(i) : '')) + '</button></div>';
        }).join('') + '</div></div>';
        const rap = Object.keys(S.voices.rapport);
        if (rap.length) h += '<div class="dm-card is-quiet"><h3>Rapport</h3><div class="dm-chips">' + rap.map((n) => '<span class="dm-chip">' + esc(titleCase(n.replace(/_/g, ' '))) + ' ' + S.voices.rapport[n] + '</span>').join('') + '</div></div>';
        return h;
    }
    function destName(id) { return DEST[id] ? DEST[id].name : titleCase(id); }
    function reportTitle(r) { return r.trial ? 'Bond Trial with ' + C(r.trial).name : r.operation ? 'Siege Operation' : destName(r.dest); }
    const TIER_TABS = [[0, 'Keep roads'], [1, 'Tier 1'], [2, 'Tier 2'], [3, 'Tier 3'], [4, 'Tier 4']];
    function expeditionHtml() {
        let h = '';
        S.reports.filter((r) => !r.seen).forEach((r) => {
            h += '<button class="dm-card" type="button" data-act="report" data-arg="' + esc(r.id) + '" style="text-align:left;border-color:rgba(111,207,139,.5)"><span class="dm-eyebrow" style="color:var(--green)">New report</span><h3>' + esc(reportTitle(r)) + '</h3><p class="dm-muted">' + esc(r.summary) + '</p><span class="dm-chips">' + gainChips(r.total) + '</span></button>';
        });
        if (S.exp) {
            const x = S.exp;
            const title = x.trial ? 'Bond Trial with ' + C(x.trial).name : x.operation ? 'Siege Operation · ' + titleCase(x.front || '') : destName(x.dest);
            const pct = Math.min(100, (S.t - x.startAt) / (x.endAt - x.startAt) * 100);
            h += '<div class="dm-travel"><img src="' + esc(x.trial || x.operation ? (ART.ruins.src) : sceneUrl(x.dest)) + '" alt=""><span class="dm-eyebrow">On expedition</span><h2 style="margin:0;font:700 20px/1.2 var(--display);color:#fff1b7">' + esc(title) + '</h2>' +
                '<p class="dm-muted">Returns in <b data-live="eta" data-end="' + x.endAt + '"></b> · ' + esc(RES[x.weaponId] ? RES[x.weaponId].name : WEAPONS[x.weapon].name) + (x.tool ? ' and ' + esc(itemName(x.tool)) : '') + ' · ' + fmtDur(x.endAt - x.startAt) + ' trip</p>' +
                '<div class="dm-trail"><span class="dm-walker" data-live="walker" data-start="' + x.startAt + '" data-end="' + x.endAt + '" style="left:' + pct + '%">' + artImg('knight', '') + '</span></div></div>';
            h += '<div class="dm-card"><h3>While the Knight travels</h3><ul class="dm-list">' +
                '<li class="dm-status paused">Paused: Knight’s ' + esc(S.knight.task.kind === 'idle' ? 'idle time' : taskLabel(S)) + '</li>' +
                x.party.map((id) => S.comps[id] ? '<li class="dm-status paused">Paused: ' + esc(C(id).name) + ' (' + esc(jobLabel(S, id)) + ') travels with the Knight</li>' : '').join('') +
                '<li class="dm-status">Still running: the Woodlot, all six workshops, refining, construction, and residents who stayed home.</li></ul></div>';
            return h;
        }
        const prep = S.prep, d = DEST[prep.dest] || DEST.rootwild;
        const tier = S.ui.tier == null ? (d.tier || 0) : S.ui.tier;
        h += '<div class="dm-card"><h3>Destination</h3><div class="dm-seg" role="group" aria-label="Road tiers">' + TIER_TABS.map((t) =>
            '<button type="button" data-act="tier" data-arg="' + t[0] + '" aria-pressed="' + (tier === t[0]) + '">' + t[1] + '</button>').join('') + '</div><div class="dm-list">';
        Object.keys(DEST).filter((id) => !DEST[id].special && (DEST[id].tier || 0) === tier && destVisible(S, id)).forEach((id) => {
            const dd = DEST[id], b = dd.planned ? dd.blurb : destBlock(S, id);
            h += '<button class="dm-route" type="button" data-act="dest" data-arg="' + id + '" aria-pressed="' + (prep.dest === id) + '"' + (dd.planned ? ' disabled' : '') + '>' +
                '<img src="' + esc(sceneUrl(id)) + '" alt="" loading="lazy"><span><strong>' + esc(dd.name) + (dd.planned ? ' <span class="dm-planned">Planned</span>' : '') + '</strong><small>' +
                esc((dd.region ? dd.region + ' · ' : '') + (dd.type ? titleCase(dd.type) + ' · ' : '') + dd.hours + 'h · ' + needProvisions(S, id) + ' provisions' + (dd.levelMin ? ' · level ' + dd.levelMin + '–' + dd.levelMax : '')) + '</small>' +
                (b && !dd.planned ? '<small class="dm-lock">' + esc(b) + '</small>' : '') + '</span>' + (dd.element ? '<span class="dm-chip el" style="--el:' + EL_HEX[dd.element] + '">' + titleCase(dd.element) + '</span>' : '<span></span>') + '</button>';
        });
        h += '</div><p class="dm-muted">' + esc(d.blurb || '') + (d.hidden ? ' Hidden road, found by your maps.' : '') + '</p></div>';

        const x = previewContext(S);
        const enc = d.encounters.map((id) => encounter(id, x, S)).filter((r) => r.status !== 'skip');
        const okN = enc.filter((r) => r.status === 'ok').length;
        h += '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">Expected encounters</h3><span class="dm-chip">Power ' + partyPower(S, x) + '</span><span class="dm-chip ' + (okN === enc.length ? 'good' : 'warn') + '">' + okN + '/' + enc.length + '</span></div>' +
            '<p class="dm-muted">Fully automatic. Weapon, tool, gear, runes and party decide each one.' + (d.sighting ? ' Wild Siegeling sighting chance about ' + Math.round(d.sighting * (x.weapon === 'bow' ? 150 : 100)) + '%.' : '') + '</p><div class="dm-list">' +
            enc.map((r) => '<div class="dm-enc ' + (r.status === 'ok' ? 'ok' : r.status === 'part' ? 'part' : 'miss') + '"><span class="dm-mark">' + (r.status === 'ok' ? '✓' : r.status === 'part' ? '~' : '✕') + '</span><span><strong>' + esc(r.title) + '</strong><small>' +
                esc(r.status === 'ok' ? 'Handled by ' + r.by : r.status === 'part' ? (r.by ? r.by + ' helps a little. ' : '') + 'Best answer: ' + r.need : 'Answer: ' + r.need) + '</small></span>' +
                (Object.keys(r.gain).length && r.status === 'ok' ? '<span class="dm-chips">' + Object.keys(r.gain).slice(0, 2).map((k) => '<span class="dm-chip">' + icon(k) + '+' + r.gain[k] + '</span>').join('') + '</span>' : r.loss ? '<span class="dm-chip bad">−' + Math.round(r.loss * 100) + '%</span>' : r.bondMul < 1 ? '<span class="dm-chip bad">Bond</span>' : '<span></span>') + '</div>').join('') + '</div></div>';

        const weaponsOwned = Object.keys(RES).filter((w) => RES[w].kind === 'WEAPON' && fl(S.inv[w]) > 0);
        const wi = weaponItem(S);
        h += '<div class="dm-card"><h3>Loadout</h3><div class="dm-label">Weapon</div><div class="dm-chips">' + weaponsOwned.map((w) =>
            '<button class="dm-btn small ' + (S.knight.equip.weapon === w ? '' : 'secondary') + '" type="button" data-act="equip" data-arg="weapon:' + w + '" aria-pressed="' + (S.knight.equip.weapon === w) + '">' + esc(RES[w].name) + '</button>').join('') + '</div>' +
            '<div class="dm-label">Tool</div><div class="dm-chips">' + ['woodaxe', 'pickaxe'].filter((t) => fl(S.inv[t]) > 0).map((t) =>
            '<button class="dm-btn small ' + (S.knight.tool === t ? '' : 'secondary') + '" type="button" data-act="tool" data-arg="' + t + '" aria-pressed="' + (S.knight.tool === t) + '">' + esc(RES[t].name) + '</button>').join('') + '</div>' +
            '<p class="dm-muted">' + esc(WEAPONS[wi.weaponType || 'sword'].detail) + ' Tier ' + (wi.tier || 0) + '. ' + (S.knight.tool ? 'Trains ' + esc(SKILLS[RES[S.knight.tool].tool].name) + '. ' : '') + 'Trip time ' + fmtDur(tripMs(S, prep.dest)) + '.</p></div>';

        const party = prepParty(S);
        h += '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">Party</h3><span class="dm-chip">' + party.length + '/' + partySlots(S) + '</span></div><div class="dm-party">' + joinedIds(S).map((id) => {
            const cc = C(id), on = party.includes(id), away = S.comps[id].job.kind === 'front';
            return '<button class="dm-party-slot" type="button" data-act="party" data-arg="' + id + '" aria-pressed="' + on + '" style="--el:var(--' + cc.el + ')"><span class="dm-art">' + compArt(id, '') + '</span><strong>' + esc(cc.name) + '</strong><small>Lv ' + compLevel(S.comps[id]) + ' · ' + esc(on ? cc.trait : away ? 'On the rampart' : cc.cls) + '</small></button>';
        }).join('') + '</div><p class="dm-muted">Command ' + skillLvl(S, 'command') + ' fields ' + partySlots(S) + ' Siegeling' + (partySlots(S) > 1 ? 's' : '') + ' (2 at Command 3, 3 at Command 10). Their Keep jobs pause and resume on return.</p></div>';

        const p = packPlan(S), runes = Object.keys(RES).filter((k) => RES[k].kind === 'RUNE' && fl(S.inv[k]) > 0), pots = POTIONS().filter((k) => fl(S.inv[k]) > 0);
        h += '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">Supplies</h3><span class="dm-chip ' + (fl(S.inv.provisions) >= p.provisions ? 'good' : 'bad') + '">' + icon('provisions') + p.provisions + '/' + fl(S.inv.provisions) + '</span></div>' +
            '<p class="dm-muted">Packs ' + p.provisions + ' Provisions' + (p.rations ? ' and ' + p.rations + ' Hearth Rations' : '') + '. The Stable carries up to ' + supplyCap(S) + ' potions.</p>' +
            '<button class="dm-option" type="button" data-act="rations" aria-pressed="' + !!S.prep.useRations + '"' + (fl(S.inv.rations) < 1 ? ' disabled' : '') + '><strong>Pack Hearth Rations first (' + fl(S.inv.rations) + ')</strong><small>Each replaces a provision, adds 5% to the haul and 2 bond per companion.</small></button>' +
            '<div class="dm-label">Rune (one, used up)</div><div class="dm-chips">' + (runes.length ? runes.map((k) => '<button class="dm-btn small ' + (S.prep.rune === k ? '' : 'secondary') + '" type="button" data-act="rune" data-arg="' + k + '" aria-pressed="' + (S.prep.rune === k) + '">' + icon(k) + esc(RES[k].name) + ' (' + fl(S.inv[k]) + ')</button>').join('') : '<span class="dm-muted">Inscribe runes at the Archive (Runecrafting).</span>') + '</div>' +
            '<div class="dm-label">Potions (trim losses after bad encounters)</div>' + (pots.length ? pots.map((k) => '<div class="dm-row"><span class="dm-grow" style="display:flex;gap:6px;align-items:center">' + icon(k) + esc(RES[k].name) + ' <small class="dm-muted">(' + fl(S.inv[k]) + ')</small></span><span class="dm-stepper"><button type="button" data-act="potion" data-arg="' + k + ':-1" aria-label="Fewer ' + esc(RES[k].name) + '">−</button><b>' + ((S.prep.potions || {})[k] || 0) + '</b><button type="button" data-act="potion" data-arg="' + k + ':1" aria-label="More ' + esc(RES[k].name) + '">+</button></span></div>').join('') : '<span class="dm-muted">Brew Herb Tonic (Alchemy) to carry potions.</span>') + '</div>';

        const block = departBlock(S);
        h += '<div class="dm-sticky-cta"><button class="dm-btn block" type="button" data-act="depart"' + (block ? ' disabled' : '') + '>Depart for ' + esc(d.name) + ' · ' + fmtDur(tripMs(S, prep.dest)) + '</button>' + (block ? '<p class="dm-muted" style="text-align:center">' + esc(block) + '</p>' : '') + '</div>';
        return h;
    }
    function logHtml() {
        let h = '<div class="dm-card"><h3>Refining totals</h3><div class="dm-chips">' + Object.keys(RECIPES).map((r) => '<span class="dm-chip">' + icon(RECIPES[r].output && Object.keys(RECIPES[r].output)[0]) + S.made[r] + ' ' + esc(RECIPES[r].name) + '</span>').join('') + '</div></div>';
        if (S.reports.length) {
            h += '<div class="dm-card"><h3>Expedition reports</h3><div class="dm-list">' + S.reports.map((r) =>
                '<button class="dm-btn secondary" type="button" data-act="report" data-arg="' + esc(r.id) + '" style="justify-content:space-between">' + esc(DEST[r.dest].name) + '<span class="dm-muted">' + new Date(r.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '</span></button>').join('') + '</div></div>';
        }
        h += '<div class="dm-card"><h3>Keep log</h3>' + (S.log.length ? '<ul class="dm-log">' + S.log.map((l) => '<li><time>' + new Date(l.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</time><span>' + esc(l.text) + '</span></li>').join('') + '</ul>' : '<p class="dm-muted">Nothing has happened yet.</p>') + '</div>';
        return h;
    }

    // —— Companions view ——
    function renderCompanions() {
        const ids = joinedIds(S);
        let h = '<div class="dm-pad"><div class="dm-row"><p class="dm-muted dm-grow">Each Siegeling holds one job at a time. Bond is never lost when you move them.</p><span class="dm-chip">' + ids.length + '/' + rosterCap(S) + '</span></div>';
        const sightings = (S.sightings || []).filter((v) => v.expiresAt > S.t);
        if (sightings.length) {
            h += '<div class="dm-card"><h3>Wild Siegelings spotted</h3><p class="dm-muted">Seen on your expeditions. Each can be tried once before its trail goes cold. Lures of the right element help.</p>';
            sightings.forEach((sg) => {
                const sp = SPECIES[sg.species] || { name: sg.species, element: 'EARTH', rarity: 'COMMON' };
                const lures = Object.keys(RES).filter((k) => RES[k].kind === 'LURE' && fl(S.inv[k]) > 0 && (!RES[k].lureElement || RES[k].lureElement === sp.element));
                const block = tameBlock(S, sg.id, '');
                h += '<div class="dm-comp" style="--el:' + EL_HEX[sp.element] + '"><span class="dm-art"><img src="' + esc(catalogArt(sg.species, 240) || '') + '" data-raw="' + esc(ART_URLS[sg.species] || '') + '" alt="" onerror="dmArtFallback(this)"></span><div style="display:grid;gap:5px;min-width:0">' +
                    '<div class="dm-row"><h3 class="dm-grow">' + esc(sp.name) + '</h3><span class="dm-chip el" style="--el:' + EL_HEX[sp.element] + '">' + titleCase(sp.rarity) + ' ' + titleCase(sp.element) + '</span></div>' +
                    '<small class="dm-muted">Near ' + esc(destName(sg.route)) + ' · trail fades in <span data-live="eta" data-end="' + sg.expiresAt + '"></span></small>' +
                    '<div class="dm-chips"><button class="dm-btn small" type="button" data-act="tame" data-arg="' + esc(sg.id) + ':"' + (block ? ' disabled' : '') + '>Approach (' + Math.round(tameChance(S, sg, '') * 100) + '%)</button>' +
                    lures.map((k) => '<button class="dm-btn small secondary" type="button" data-act="tame" data-arg="' + esc(sg.id) + ':' + k + '"' + (block ? ' disabled' : '') + '>' + esc(RES[k].name) + ' (' + Math.round(tameChance(S, sg, k) * 100) + '%)</button>').join('') + '</div>' +
                    (block ? '<small class="dm-muted">' + esc(block) + '</small>' : '') + '</div></div>';
            });
            h += '</div>';
        }
        ids.forEach((id) => { h += companionCard(id); });
        if (S.comps.fawny && !S.comps.fawny.joined) {
            h += '<div class="dm-card"><div class="dm-comp is-locked" style="--el:var(--line)"><span class="dm-art">' + artImg('fawny', '') + '</span><div style="display:grid;gap:4px;min-width:0"><span class="dm-eyebrow">Undiscovered</span><h3>A Siegeling in the frost</h3><p class="dm-muted">' + esc(STARTER_TRAITS.fawny.findText) + '</p></div></div></div>';
        }
        h += '</div>';
        $('view-companions').innerHTML = h;
    }
    function companionCard(id) {
        const cc = C(id), c = S.comps[id];
        const bp = bondProgress(c.bond), away = onExpedition(S, id);
        const lvl = compLevel(c), lo = companionXpFor(lvl), hi = companionXpFor(Math.min(cc.cap, lvl + 1));
        let status = jobLabel(S, id);
        if (c.job.kind === 'help') status += ' (+' + Math.round((helperMul(S, c.job.target) - 1) * 100) + '% output)';
        if (c.job.kind === 'knight') { const td = taskDef(S.knight.task); status += td ? ' (+' + Math.round(helperBonus(S, td) * 100) + '% speed on ' + taskLabel(S) + ')' : ' (the Knight is idle)'; }
        let h = '<div class="dm-card"><div class="dm-comp" style="--el:var(--' + cc.el + ')"><span class="dm-art">' + compArt(id, cc.name) + '</span><div style="display:grid;gap:5px;min-width:0">' +
            '<div class="dm-row"><h3 class="dm-grow">' + esc(cc.name) + (c.legend ? ' <span class="dm-chip warn">Legendary</span>' : '') + '</h3><span class="dm-chip el" style="--el:var(--' + cc.el + ')">' + esc(cc.role) + '</span></div>' +
            (c.nick ? '<small class="dm-muted">' + esc(cc.species) + '</small>' : '') +
            '<div class="dm-skill-head"><small class="dm-muted" style="flex:1">Level ' + lvl + '/' + cc.cap + '</small><small class="dm-muted">' + (lvl >= cc.cap ? 'Max' : fl(c.xp - lo) + ' / ' + (hi - lo)) + '</small></div><div class="dm-bar blue"><b style="width:' + (lvl >= cc.cap ? 100 : Math.round((c.xp - lo) / Math.max(1, hi - lo) * 100)) + '%"></b></div>' +
            '<div class="dm-skill-head"><small class="dm-muted" style="flex:1">Bond ' + bp.l + ' · ' + esc(bondName(c)) + '</small><small class="dm-muted">' + bp.label + '</small></div><div class="dm-bar"><b style="width:' + bp.pct + '%"></b></div>' +
            '<p class="dm-muted"><b>' + esc(cc.trait) + ':</b> ' + esc(cc.traitText) + '</p></div></div>' +
            '<p class="dm-status ' + (away ? 'paused' : '') + '">' + (away ? 'Travelling with the Knight. ' + esc(status) + ' resumes on return.' : esc(status)) + '</p>';
        if (c.job.kind === 'explore' && !away) h += '<div class="dm-bar blue"><b style="width:' + Math.round(c.explore / EXPLORE_HOURS * 100) + '%"></b></div><small class="dm-muted">Next cache in ' + fmtDur((EXPLORE_HOURS - c.explore) * HOUR) + ' (progress is kept if you reassign)</small>';
        const jobs = [['help', 'Building'], ['knight', 'Knight'], ['explore', 'Explore'], ['rest', 'Rest']];
        if (S.b.front >= 1) jobs.push(['front', 'Rampart']);
        h += '<div class="dm-seg" role="group" aria-label="' + esc(cc.name) + ' assignment">' + jobs.map((j) =>
            '<button type="button" data-act="cjob" data-arg="' + id + ':' + j[0] + '" aria-pressed="' + (c.job.kind === j[0]) + '"' + (away ? ' disabled' : '') + '>' + j[1] + '</button>').join('') + '</div>';
        if (c.job.kind === 'help') {
            h += '<div class="dm-chips">' + HELP_TARGETS.map((t) => {
                const other = helperOf(S, t);
                const taken = other && other !== id;
                const like = cc.likes.includes(t);
                return '<button class="dm-btn small ' + (c.job.target === t ? '' : 'secondary') + '" type="button" data-act="cjob" data-arg="' + id + ':help:' + t + '"' + (taken || away ? ' disabled' : '') + ' aria-pressed="' + (c.job.target === t) + '">' + (t === 'woodlot' ? 'Woodlot' : WS[t].name) + (like ? ' ★' : '') + (taken ? ' · ' + esc(C(other).name) : '') + '</button>';
            }).join('') + '</div><small class="dm-muted">★ favourite spot: +30% more.</small>';
        }
        if (c.job.kind === 'knight') h += '<small class="dm-muted">Assisting speeds the Knight’s work, most when ' + esc(cc.name) + '’s element suits it (as in Chronicles).</small>';
        if (c.job.kind === 'front') h += '<small class="dm-muted">Defenders earn ' + frontRatePer(S) + ' Crowns an hour each and grow bond.</small>';
        const foods = Object.keys(RES).filter((x) => RES[x].kind === 'FOOD' && RES[x].bondXp && fl(S.inv[x]) > 0);
        const day = new Date(S.t).toDateString(), used = c.treats.day === day ? c.treats.n : 0;
        h += '<small class="dm-muted">Treats today ' + used + '/' + DAILY_TREATS + (foods.length ? '' : ' · Cook Grilled Minnow, salads or stews to feed') + '</small>';
        if (foods.length) h += '<div class="dm-chips">' + foods.map((f) => { const b = feedBlock(S, id, f); return '<button class="dm-btn small secondary" type="button" data-act="feed" data-arg="' + id + ':' + f + '"' + (b ? ' disabled title="' + esc(b) + '"' : '') + '>' + icon(f) + ' ' + esc(RES[f].name) + ' (' + fl(S.inv[f]) + ')</button>'; }).join('') + '</div>';
        const ev = evolveBlock(S, id), tr = trialBlock(S, id);
        h += '<div class="dm-chips">' +
            (cc.to && SPECIES[cc.to] ? '<button class="dm-btn small' + (ev ? ' secondary' : '') + '" type="button" data-act="evolve" data-arg="' + id + '"' + (ev ? ' disabled' : '') + ' title="' + esc(ev) + '">Evolve into ' + esc(SPECIES[cc.to].name) + '</button>' : '') +
            (!c.legend ? '<button class="dm-btn small' + (tr ? ' secondary' : '') + '" type="button" data-act="trial" data-arg="' + id + '"' + (tr ? ' disabled' : '') + ' title="' + esc(tr) + '">Bond Trial' + (tr ? ' · ' + esc(tr.replace(/\.$/, '')) : '') + '</button>' : '') +
            '<button class="dm-btn small secondary" type="button" data-act="rename-open" data-arg="' + id + '">Rename</button></div>';
        if (S.ui.rename === id) {
            h += '<form class="dm-row" data-form="rename" data-arg="' + id + '"><input class="dm-input dm-grow" id="dmRename-' + esc(id) + '" maxlength="18" value="' + esc(c.nick || '') + '" placeholder="' + esc(cc.species) + '" aria-label="Nickname"><button class="dm-btn small" type="submit">Save</button></form>';
        }
        return h + '</div>';
    }

    // —— Sheets ——
    function openSheet(kind, arg) {
        sheet = { kind: kind, arg: arg };
        if (kind !== 'quarter') { arranging = false; }
        renderSheet(true);
    }
    function closeSheet() {
        if (sheet && sheet.kind === 'report') markSeen(sheet.arg);
        if (sheet && sheet.kind === 'away') S.away = null;
        sheet = null; arranging = false; quarterSel = -1; confirmReset = false;
        const el = document.querySelector('.dm-sheet'), sc = document.querySelector('.dm-scrim');
        if (el) el.remove();
        if (sc) sc.remove();
        save();
        renderAll();
    }
    function markSeen(id) {
        const r = S.reports.find((x) => x.id === id);
        if (r && !r.seen) { r.seen = true; S.rev++; }
    }
    function renderSheet(first) {
        if (!sheet) return;
        let title = '', body = '';
        if (sheet.kind === 'building') ({ title, body } = buildingSheet(sheet.arg));
        else if (sheet.kind === 'quarter') ({ title, body } = quarterSheet());
        else if (sheet.kind === 'bag') ({ title, body } = bagSheet());
        else if (sheet.kind === 'report') ({ title, body } = reportSheet(sheet.arg));
        else if (sheet.kind === 'menu') ({ title, body } = menuSheet());
        else if (sheet.kind === 'objective') ({ title, body } = objectiveSheet());
        else if (sheet.kind === 'away') ({ title, body } = awaySheet());
        let el = document.querySelector('.dm-sheet');
        if (!el) {
            const sc = document.createElement('div');
            sc.className = 'dm-scrim'; sc.dataset.act = 'close';
            document.body.appendChild(sc);
            el = document.createElement('section');
            el.className = 'dm-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
            document.body.appendChild(el);
        }
        const bodyEl = el.querySelector('.dm-sheet-body');
        const scroll = bodyEl ? bodyEl.scrollTop : 0;
        el.setAttribute('aria-label', title);
        el.innerHTML = '<div class="dm-sheet-head"><h2>' + esc(title) + '</h2><button class="dm-icon-btn" type="button" data-act="close" aria-label="Close">×</button></div><div class="dm-sheet-body">' + body + '</div>';
        el.querySelector('.dm-sheet-body').scrollTop = scroll;
        if (first) { const b = el.querySelector('[data-act="close"]'); if (b) b.focus({ preventScroll: true }); }
    }

    function buildingSheet(id) {
        if (id === 'enclave') {
            const here = Object.keys(S.comps).filter((c) => S.comps[c].joined);
            const sanct = S.wings.sanctuary || 0;
            let body = '<p class="dm-muted">Home of the Keep\u2019s Siegelings. Resting here grows bond fastest (' + (8 + 6 * sanct) + ' per hour). Roster ' + here.length + '/' + rosterCap(S) + '.</p><div class="dm-card"><h3>Residents</h3><div class="dm-list">' +
                here.map((c) => '<div class="dm-row"><span class="dm-art round" style="width:40px;height:40px;border:2px solid var(--' + C(c).el + ')">' + compArt(c, '') + '</span><span class="dm-grow"><strong>' + esc(C(c).name) + '</strong><br><small class="dm-muted">' + (onExpedition(S, c) ? 'Away with the Knight' : esc(jobLabel(S, c))) + '</small></span>' +
                    (S.comps[c].job.kind !== 'rest' && !onExpedition(S, c) ? '<button class="dm-btn small secondary" type="button" data-act="cjob" data-arg="' + c + ':rest">Rest here</button>' : '') + '</div>').join('') + '</div></div>';
            body += projectCards((p) => p.id.indexOf('wing_sanctuary') === 0);
            body += '<button class="dm-btn secondary" type="button" data-act="tab" data-arg="companions">Manage companions</button>';
            return { title: 'Siegeling Enclave', body: body };
        }
        const B = BUILDINGS[id];
        let body = '<p class="dm-muted">' + esc(B.blurb) + '</p>';
        if (damaged(S, id === 'hall' ? 'great_hall' : id)) body += '<div class="dm-card" style="border-color:rgba(255,138,115,.5)"><h3>Damaged</h3><p class="dm-muted">Its output is suspended until repaired.</p><button class="dm-btn small" type="button" data-act="goto-keep">Repair in Activities \u203a Keep</button></div>';
        if (id === 'woodlot') {
            const helper = helperOf(S, 'woodlot');
            body += '<div class="dm-card"><h3>Produces</h3><dl class="dm-kv"><dt>Woodlot</dt><dd>' + fmtRate(woodlotRate(S)) + ' Timber/h</dd>' +
                '<dt>Knight</dt><dd>' + (S.exp ? 'Away' : knightRates(S).gain.timber ? fmtRate(knightRates(S).gain.timber) + ' Timber/h (' + taskLabel(S) + ')' : 'Not cutting pine') + '</dd>' +
                '<dt>Helper</dt><dd>' + (helper ? C(helper).name + (onExpedition(S, helper) ? ' (away, paused)' : ' +' + Math.round((helperMul(S, 'woodlot') - 1) * 100) + '%') : 'None') + '</dd></dl>' +
                '<div class="dm-chips">' + (!(S.knight.task.kind === 'gather' && S.knight.task.id === 'chop_pine') && !S.exp ? '<button class="dm-btn small secondary" type="button" data-act="task" data-arg="gather:chop_pine">Knight: cut pine here</button>' : '') +
                '<button class="dm-btn small secondary" type="button" data-act="tab" data-arg="companions">Assign a helper</button></div></div>';
        } else if (id === 'archive') {
            if (S.b.archive >= 1) {
                body += '<div class="dm-card"><h3>Elemental Studies</h3><p class="dm-muted">The Knight studies the Covenant’s records here, earning Insight and unlocking refining and expedition bonuses.</p>' +
                    '<dl class="dm-kv"><dt>Elemental Studies</dt><dd>Lv ' + skillLvl(S, 'elemental_studies') + '</dd><dt>Runecrafting</dt><dd>' + (skillUnlocked(S, 'runecrafting') ? 'Lv ' + skillLvl(S, 'runecrafting') : esc(lockText(S, 'runecrafting'))) + '</dd><dt>Insight</dt><dd>' + fl(S.inv.insight) + '</dd></dl>' +
                    '<div class="dm-chips">' + (!(S.knight.task.kind === 'gather' && S.knight.task.id === 'read_records') && !S.exp ? '<button class="dm-btn small" type="button" data-act="task" data-arg="gather:read_records">Knight: read the records</button>' : '') +
                    '<button class="dm-btn small secondary" type="button" data-act="open-prof" data-arg="elemental_studies">Essence studies</button></div></div>';
                if (S.disc.vaultMap) body += '<div class="dm-card is-quiet"><div class="dm-row"><h3 class="dm-grow">Sealed Vault Map</h3><span class="dm-planned">Planned</span></div><p class="dm-muted">' + (skillLvl(S, 'elemental_studies') >= 10 ? 'Vault Cipher reads the map: it points to the Sunken Vault. That destination is not built in this slice.' : 'The map’s script needs Elemental Studies 10 to read.') + '</p></div>';
            }
        } else if (id === 'hall') {
            body += '<div class="dm-card"><h3>The Knight</h3><p class="dm-muted">' + esc(S.exp ? 'Away on ' + DEST[S.exp.dest].name + '.' : S.knight.task.kind === 'idle' ? 'Waiting at the Hall.' : 'Working: ' + taskLabel(S) + '.') + ' The weapon rack holds practice weapons for every approach.' + '</p>' +
                '<div class="dm-chips"><button class="dm-btn small secondary" type="button" data-act="tab" data-arg="knight">Equipment and skills</button><button class="dm-btn small secondary" type="button" data-act="tab" data-arg="activities">Expeditions</button></div></div>';
        }
        const keyFilter = { hall: (p) => /^(hall_|wing_war_room|yard|front_|storehouse)/.test(p.id), woodlot: (p) => /^(woodlot_2|wing_stable)/.test(p.id), archive: (p) => /^(archive|wing_library)/.test(p.id) }[id];
        const cur = (S.builds || []).filter((b) => keyFilter && keyFilter({ id: b.id }));
        if (cur.length) body += cur.map((b) => '<div class="dm-card"><h3>' + esc(b.name) + '</h3><p class="dm-muted">Under construction, done in <b data-live="eta" data-end="' + b.endAt + '"></b>.</p><div class="dm-bar"><b data-live="bar" data-start="' + b.startAt + '" data-end="' + b.endAt + '"></b></div></div>').join('');
        if (keyFilter) body += projectCards(keyFilter);
        return { title: id === 'archive' && S.b.archive < 1 ? 'Ruined Archive' : id === 'hall' ? HALL_RANKS[S.b.hall - 1] : B.name, body: body };
    }
    function projectCards(filter) {
        const ps = projectList(S).filter(filter);
        return ps.length ? ps.map(buildRow).join('') : '';
    }

    function plotHtml(i) {
        const c = S.grid[i];
        const sel = i === quarterSel;
        const r = Math.floor(i / 3), col = i % 3;
        const lab = 'Plot ' + (r + 1) + '-' + (col + 1);
        if (!c) return '<button class="dm-plot is-empty' + (sel ? ' is-selected' : '') + '" type="button" data-act="plot" data-arg="' + i + '" aria-label="' + lab + ', empty"></button>';
        const W = WS[c.id];
        let extra = '';
        links(S.grid).forEach((l) => {
            if (l.a !== i) return;
            const waiting = l.recipe && !canRefine(S, l.recipe) && S.refine[l.recipe] >= 1 - 1e-9;
            const cls = l.recipe ? (waiting ? 'wait' : '') : 'dead';
            const name = l.recipe ? RECIPES[l.recipe].name + (waiting ? ' (waiting)' : '') : 'No recipe';
            if (l.dir === 1) extra += '<i class="dm-link ' + cls + '" style="right:-12px;top:calc(50% - 3px);width:14px;height:6px"></i><span class="dm-link-label" style="left:100%;top:50%">' + esc(name) + '</span>';
            else extra += '<i class="dm-link ' + cls + '" style="bottom:-12px;left:calc(50% - 3px);height:14px;width:6px"></i><span class="dm-link-label" style="left:50%;top:100%">' + esc(name) + '</span>';
        });
        return '<button class="dm-plot' + (sel ? ' is-selected' : '') + '" type="button" data-act="plot" data-arg="' + i + '" style="--el:var(--' + W.el + ')" aria-label="' + esc(W.name) + ', ' + lab + ', socket faces ' + ['north', 'east', 'south', 'west'][c.rot] + '" aria-pressed="' + sel + '">' +
            '<span class="dm-ws-art">' + (WORKSHOP_ART[c.id] || '') + '</span><span class="dm-ws-name">' + esc(W.name) + '</span><i class="dm-socket" data-dir="' + c.rot + '"></i>' + extra + '</button>';
    }
    function quarterSheet() {
        const ls = links(S.grid);
        let body = '<p class="dm-muted">' + (arranging ? 'Tap a workshop, then tap an empty plot to move it. Rotate turns its socket. Two sockets facing each other make a link.' :
            'Every workshop produces on its own. Linked pairs also refine automatically, using real stock from storage.') + '</p>';
        body += '<div class="dm-quarter' + (arranging ? ' is-arranging' : '') + (quarterSel >= 0 && arranging ? ' has-selection' : '') + '" id="dmQuarterGrid" role="grid" aria-label="Elemental Quarter plots">' + S.grid.map((c, i) => plotHtml(i)).join('') + '</div>';
        body += '<div class="dm-arrange-bar">' + (arranging ?
            '<button class="dm-btn" type="button" data-act="rotate"' + (quarterSel >= 0 && S.grid[quarterSel] ? '' : ' disabled') + '>Rotate socket ↻</button><button class="dm-btn secondary" type="button" data-act="arrange">Done</button><small class="dm-muted">Keys: arrows move, Enter picks, R rotates</small>' :
            '<button class="dm-btn" type="button" data-act="arrange">Arrange</button>') + '</div>';
        const sel = quarterSel >= 0 ? S.grid[quarterSel] : null;
        if (sel) {
            const W = WS[sel.id], rates = workshopRates(S, sel.id), helper = helperOf(S, sel.id);
            body += '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">' + esc(W.name) + '</h3><span class="dm-chip el" style="--el:var(--' + W.el + ')">' + W.el + ' socket</span></div><p class="dm-muted">' + esc(W.blurb) + '</p>' +
                '<dl class="dm-kv"><dt>Produces</dt><dd>' + rateText(rates) + '</dd><dt>Helper</dt><dd>' + (helper ? C(helper).name + (onExpedition(S, helper) ? ' (away)' : '') : 'None') + '</dd><dt>Next level</dt><dd><span class="dm-planned">Planned</span></dd></dl></div>';
        }
        body += '<div class="dm-card"><h3>Recipes</h3><div class="dm-list">' + Object.keys(RECIPES).map((rid) => {
            const R = RECIPES[rid], on = ls.some((l) => l.recipe === rid);
            const waiting = on && !canRefine(S, rid) && S.refine[rid] >= 1 - 1e-9;
            const pct = Math.round(Math.min(1, S.refine[rid] || 0) * 100);
            return '<div class="dm-enc ' + (on ? (waiting ? 'part' : 'ok') : 'miss') + '"><span class="dm-mark">' + (on ? (waiting ? '…' : '✓') : '✕') + '</span><span><strong>' + WS[R.pair[0]].name + ' + ' + WS[R.pair[1]].name + ' → ' + esc(R.name) + '</strong><small>' +
                Object.keys(R.input).map((k) => R.input[k] + ' ' + RES[k].name).join(' + ') + ' every ' + Math.round(R.mins / refineSpeed(S)) + ' min · ' + (on ? (waiting ? 'Waiting: not enough stock above your reserve' : 'Running, batch ' + pct + '%') : 'Not connected') + '</small></span><span class="dm-chip">' + icon(Object.keys(R.output)[0]) + fl(S.inv[Object.keys(R.output)[0]]) + '</span></div>';
        }).join('') + '</div></div>';
        body += '<div class="dm-card"><h3>Reserves</h3><p class="dm-muted">Refining never takes stock below these amounts, so expeditions and construction keep what they need.</p><div class="dm-list">' + RESERVABLE.map((k) =>
            '<div class="dm-row"><span class="dm-grow" style="display:flex;align-items:center;gap:6px">' + icon(k) + esc(RES[k].name) + ' <small class="dm-muted">(' + fl(S.inv[k]) + ' in store)</small></span><span class="dm-stepper"><button type="button" data-act="reserve" data-arg="' + k + ':-1" aria-label="Lower ' + esc(RES[k].name) + ' reserve">−</button><b>' + (S.reserve[k] || 0) + '</b><button type="button" data-act="reserve" data-arg="' + k + ':1" aria-label="Raise ' + esc(RES[k].name) + ' reserve">+</button></span></div>').join('') + '</div></div>';
        return { title: 'Elemental Quarter', body: body };
    }
    function bagSheet() {
        let body = '<p class="dm-muted">One storage for the Keep, the Quarter and the Knight.</p>';
        KIND_ORDER.forEach((kind) => {
            const ids = Object.keys(RES).filter((k) => RES[k].kind === kind && (fl(S.inv[k]) > 0 || STRIP.includes(k)));
            if (!ids.length) return;
            body += '<div class="dm-label">' + KIND_LABEL[kind] + '</div><div class="dm-inv">' + ids.map((k) => '<div title="' + esc(RES[k].blurb || '') + '">' + icon(k) + '<span>' + esc(RES[k].name) + '</span><b data-res="' + k + '">' + fl(S.inv[k]) + '</b></div>').join('') + '</div>';
        });
        body += '<div class="dm-card is-quiet"><h3>Net hourly flow right now</h3><p class="dm-muted">' + esc(incomeText()) + '</p></div>';
        return { title: 'Shared storage', body: body };
    }
    function incomeText() {
        const r = { timber: woodlotRate(S) };
        Object.keys(WS).forEach((id) => { const w = workshopRates(S, id); Object.keys(w).forEach((k) => { r[k] = (r[k] || 0) + w[k]; }); });
        if (!S.exp) { const k = knightRates(S); Object.keys(k.gain).forEach((x) => { r[x] = (r[x] || 0) + k.gain[x]; }); Object.keys(k.use).forEach((x) => { r[x] = (r[x] || 0) - k.use[x]; }); }
        const keys = Object.keys(r).filter((k) => Math.abs(r[k]) > 0.05);
        return (keys.map((k) => (r[k] > 0 ? '+' : '') + fmtRate(r[k]) + ' ' + itemName(k) + '/h').join(', ') || 'Nothing') + '. Quarter refining consumes ingredients on top of this.';
    }
    function reportSheet(id) {
        const r = S.reports.find((x) => x.id === id);
        if (!r) return { title: 'Report', body: '<p class="dm-muted">This report is no longer stored.</p>' };
        const hero = r.trial || r.operation ? ART.ruins.src : sceneUrl(r.dest);
        let body = '<div class="dm-travel" style="min-height:120px"><img src="' + esc(hero) + '" alt=""><span class="dm-eyebrow">' + esc(RES[r.weaponId] ? RES[r.weaponId].name : WEAPONS[r.weapon].name) + (r.tool ? ' · ' + esc(itemName(r.tool)) : '') + ' · ' + (r.party.length ? r.party.map((p) => S.comps[p] ? C(p).name : p).join(', ') : 'no companions') + (r.rune ? ' \u00b7 ' + esc(itemName(r.rune)) : '') + '</span><p style="margin:4px 0 0;font:700 15px/1.35 var(--display);color:#fff1b7">' + esc(r.summary) + '</p></div>';
        body += '<div class="dm-card"><h3>How preparation shaped the journey</h3><div class="dm-list">' + r.lines.map((l) =>
            '<div class="dm-report-line ' + (l.status === 'ok' ? 'ok' : l.status === 'miss' ? 'miss' : '') + '"><span class="dm-mark">' + (l.status === 'ok' ? '✓' : l.status === 'part' ? '~' : '✕') + '</span><span><b>' + esc(l.title) + '.</b> ' + esc(l.text) + (l.status !== 'ok' && l.need ? '<em>Best answer next time: ' + esc(l.need) + '</em>' : '') + '</span></div>').join('') +
            r.discs.map((d) => '<div class="dm-report-line disc"><span class="dm-mark">✦</span><span><b>Discovery: ' + (d === 'fawny' ? 'Fawny joined the Keep' : 'the Sealed Vault Map') + '.</b><em>' + (d === 'fawny' ? 'Assign Fawny from Companions. Fawny favours the Fridge.' : 'Elemental Studies 10 will read it.') + '</em></span></div>').join('') +
            (r.sighting ? '<div class="dm-report-line disc"><span class="dm-mark">\u2726</span><span><b>Sighting: a wild ' + esc((SPECIES[r.sighting.species] || {}).name || r.sighting.species) + '.</b><em>Try to tame it from Companions within 48 hours.</em></span></div>' : '') + '</div></div>';
        body += '<div class="dm-card"><h3>Rewards (applied once, on return)</h3><div class="dm-chips">' + gainChips(r.total) + '</div><p class="dm-muted">Haul kept: ' + r.lootPct + '% of the base find' + (r.rations ? ', including ' + r.rations + ' Hearth Rations bonus' : '') + '.</p><div class="dm-chips">' +
            Object.keys(r.xp).map((k) => '<span class="dm-chip good">+' + r.xp[k] + ' ' + esc(SKILLS[k].name) + ' XP</span>').join('') + (r.prof ? '<span class="dm-chip good">+' + r.prof + ' ' + esc(WEAPONS[r.weapon].name) + ' proficiency</span>' : '') +
            Object.keys(r.bonds).map((k) => '<span class="dm-chip good">+' + r.bonds[k] + ' bond with ' + esc(S.comps[k] ? C(k).name : k) + '</span>').join('') +
            Object.keys(r.levels || {}).map((k) => '<span class="dm-chip good">' + esc(S.comps[k] ? C(k).name : k) + ' reached level ' + r.levels[k] + '</span>').join('') + '</div></div>';
        body += '<div class="dm-card is-quiet"><h3>Assignments resumed</h3><p class="dm-muted">' + esc(r.resumed.join(' · ') || 'Nothing to resume.') + '</p></div>';
        body += '<button class="dm-btn block" type="button" data-act="close">Done</button>';
        return { title: r.trial ? 'Bond Trial' : r.operation ? 'Siege Operation report' : 'Back from ' + destName(r.dest), body: body };
    }
    function objectiveSheet() {
        let body = '';
        OBJECTIVES.forEach((ch) => {
            body += '<div class="dm-card"><h3>' + esc(ch.chapter) + '</h3><div class="dm-list">' + ch.steps.map((st) => {
                const done = !!S.obj[st.id];
                return '<div class="dm-enc ' + (done ? 'ok' : st.planned ? 'miss' : 'part') + '"><span class="dm-mark">' + (done ? '✓' : st.planned ? '…' : '•') + '</span><span><strong>' + esc(st.title) + '</strong><small>' + esc(st.hint) + '</small></span><span></span></div>';
            }).join('') + '</div></div>';
        });
        const top = Math.max(10, rankLvl(S) + 2);
        body += '<div class="dm-card"><h3>The Keeper\u2019s Journey</h3><p class="dm-muted">Knight Rank ' + rankLvl(S) + '. Every rank pays once: Silver and Crowns.</p><div class="dm-list">';
        for (let l = 2; l <= top; l++) {
            const rw = journeyReward(l), got = !!S.claims['rank_' + l], ready = rankLvl(S) >= l;
            body += '<div class="dm-enc ' + (got ? 'ok' : ready ? 'part' : '') + '"><span class="dm-mark">' + (got ? '\u2713' : l) + '</span><span><strong>Rank ' + l + '</strong><small>' + rw.silver + ' Silver \u00b7 ' + rw.crowns + ' Crowns</small></span>' +
                (got ? '<span></span>' : '<button class="dm-btn small" type="button" data-act="claim" data-arg="' + l + '"' + (ready ? '' : ' disabled') + '>Claim</button>') + '</div>';
        }
        body += '</div></div>';
        return { title: 'Objectives and journey', body: body };
    }
    function awaySheet() {
        const a = S.away || { ms: 0, gains: {}, notes: [] };
        return { title: 'While you were away', body: '<p class="dm-muted">' + fmtDur(a.ms) + ' passed. Everything was resolved with the same clock the +4h control uses.</p><div class="dm-card"><h3>Storage gained</h3><div class="dm-chips">' + gainChips(a.gains) + '</div></div>' +
            (a.notes.length ? '<div class="dm-card"><h3>Events</h3><ul class="dm-log">' + a.notes.map((n) => '<li><time>•</time><span>' + esc(n) + '</span></li>').join('') + '</ul></div>' : '') +
            '<button class="dm-btn block" type="button" data-act="close">Continue</button>' };
    }
    function menuSheet() {
        return { title: 'About this prototype', body:
            '<div class="dm-card"><h3>Demo time</h3><p class="dm-muted">Both buttons use the same resolver as real elapsed time. Progress saves in this browser only and never touches a Siegelings account.</p><div class="dm-chips"><button class="dm-btn small secondary" type="button" data-act="pass" data-arg="1">Pass 1 hour</button><button class="dm-btn small" type="button" data-act="pass" data-arg="4">Pass 4 hours</button></div></div>' +
            '<div class="dm-card"><h3>From Chronicles</h3><p class="dm-muted">All 21 professions with their real gathering spots, 80 recipes and 105 items (exported from ChroniclesContent), level and bond curves, gear slots and bonuses, weapon proficiency, elemental affinity and class mastery, essences and studies, feeding treats, and Command party slots. Ser Airek, Cacty, Sundile and Fawny, and the region scene art.</p></div>' +
            '<div class="dm-card"><h3>From the Keep</h3><p class="dm-muted">The illustrated Great Hall, Woodlot, Archive (ruined and restored), Enclave and the six Quarter workshops with their art; Keep production and cost scale (Woodlot 1 Timber per minute, Archive 60 Timber); one construction crew.</p></div>' +
            '<div class="dm-card"><h3>New in Dominion</h3><p class="dm-muted">One shared clock, storage and roster. Quarter sockets, links, refining and reserves. Knight work versus expeditions. Preparation-driven encounters. Companion jobs. Practice weapons and Copper Fittings. The objective chapters.</p></div>' +
            '<div class="dm-card is-quiet"><div class="dm-row"><h3 class="dm-grow">Still to merge</h3><span class="dm-planned">Next stages</span></div><p class="dm-muted">Chronicles: taming and lures, evolving, all 35 routes, runes and potions on the road, Bond Trials, guilds and the market. Keep: Hall ranks, Storehouse and Builder\u2019s Yard, building levels, Akhar\u2019s Front, Voices, Keep events, refined goods and recycling, the Silver market, the Keeper\u2019s Journey, decorations and rebirth.</p></div>' +
            '<div class="dm-card is-quiet"><h3>Start over</h3><p class="dm-muted">Erase this prototype save.</p>' + (confirmReset ?
                '<div class="dm-chips"><button class="dm-btn small" type="button" data-act="reset-yes">Erase and restart</button><button class="dm-btn small secondary" type="button" data-act="reset-no">Keep my save</button></div>' :
                '<button class="dm-btn small secondary" type="button" data-act="reset">Reset prototype</button>') + '</div>' };
    }

    // —— Render orchestration ——
    function renderView() {
        const t = S.ui.tab;
        if (t === 'keep') renderScene();
        else if (t === 'knight') renderKnight();
        else if (t === 'activities') renderActivities();
        else renderCompanions();
        $('dmActDot').classList.toggle('hidden', !(S.reports.some((r) => !r.seen)));
        updateLive();
    }
    // Re-rendering restores focus by data-act/arg so keyboard users keep their place.
    function renderAll() {
        const a = document.activeElement;
        const key = a && a.dataset && a.dataset.act ? [a.dataset.act, a.dataset.arg] : null;
        renderStrip();
        renderClock();
        renderView();
        if (sheet) renderSheet(false);
        if (key) {
            const sel = '[data-act="' + key[0] + '"]' + (key[1] != null ? '[data-arg="' + CSS.escape(key[1]) + '"]' : '');
            const el = document.querySelector('.dm-sheet ' + sel) || document.querySelector(sel);
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
        document.querySelectorAll('[data-live="walker"]').forEach((e) => {
            const a = Number(e.dataset.start), b = Number(e.dataset.end);
            e.style.left = Math.max(0, Math.min(100, (t - a) / (b - a) * 100)) + '%';
        });
    }
    function flushToasts() {
        FRESH.splice(0).forEach(toast);
    }
    function toast(msg) {
        const el = document.createElement('div');
        el.className = 'dm-toast'; el.textContent = msg;
        const wrap = $('dmToasts');
        wrap.appendChild(el);
        // Two at most: a +4h jump can raise several at once and they must not bury the screen.
        while (wrap.children.length > 2) wrap.firstChild.remove();
        setTimeout(() => el.remove(), 2800);
    }

    function step() {
        advance(S, now());
        flushToasts();
        // Never rebuild a screen under someone typing a guild name, invite code or price.
        const a = document.activeElement;
        if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { renderStrip(); renderClock(); updateLive(); return; }
        if (S.rev !== lastRev) { save(); renderAll(); maybeShowReport(); }
        else if (signature() !== lastSig) {
            // Stock ticks over often; avoid rebuilding a sheet the player is mid-way through.
            renderStrip(); renderClock();
            if (S.ui.tab !== 'keep' || !sheet) renderView();
            if (sheet && sheet.kind !== 'quarter') renderSheet(false);
            lastSig = signature();
        } else { renderClock(); updateLive(); }
    }
    function maybeShowReport() {
        if (sheet) return;
        const r = S.reports.find((x) => !x.seen);
        if (r) openSheet('report', r.id);
    }
    function passTime(hours) {
        const before = snapshot();
        S.offset += hours * HOUR;
        advance(S, now());
        save();
        flushToasts();
        toast('Passed ' + hours + ' hour' + (hours > 1 ? 's' : '') + ': ' + diffText(before));
        renderAll();
        if (!sheet || sheet.kind === 'menu') { if (sheet) closeSheet(); maybeShowReport(); }
    }
    const snapshot = () => Object.assign({}, S.inv);
    function diffGains(before) {
        const g = {};
        Object.keys(RES).forEach((k) => { const d = fl(S.inv[k]) - fl(before[k]); if (d > 0) g[k] = d; });
        return g;
    }
    function diffText(before) {
        const g = diffGains(before);
        const keys = Object.keys(g).sort((a, b) => g[b] - g[a]).slice(0, 4);
        return keys.length ? keys.map((k) => '+' + g[k] + ' ' + RES[k].name).join(', ') : 'nothing new in storage';
    }

    // —— Actions ——
    function act(name, arg) {
        const s = S;
        switch (name) {
        case 'tab': if (sheet) closeSheet(); setTab(arg); return;
        case 'close': closeSheet(); return;
        case 'bag': openSheet('bag'); return;
        case 'menu': openSheet('menu'); return;
        case 'objective': openSheet('objective'); return;
        case 'report': openSheet('report', arg); return;
        case 'pass': passTime(Number(arg) || 4); return;
        case 'reset': confirmReset = true; break;
        case 'reset-no': confirmReset = false; break;
        case 'reset-yes':
            try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
            S = defaults(Date.now()); sheet = null;
            document.querySelectorAll('.dm-sheet,.dm-scrim').forEach((e) => e.remove());
            save(); setTab('keep'); renderAll(); toast('Prototype reset.'); return;
        case 'building': if (arg === 'quarter') openSheet('quarter'); else openSheet('building', arg); return;
        case 'knight-sec': s.ui.knight = arg; break;
        case 'act-sec': s.ui.act = arg; break;
        case 'task': {
            const parts = String(arg).split(':');
            const msg = setTask(s, parts[0], parts[1]);
            if (msg) { toast(msg); return; }
            toast(parts[0] === 'idle' ? 'The Knight stops working.' : 'The Knight starts: ' + taskLabel(s) + '.');
            break;
        }
        case 'craft':
            if (!craftOnce(s, arg)) { toast(craftBlock(s, arg) || 'Cannot make that yet.'); return; }
            toast('Made ' + itemName(al(CRAFTS[arg].output)) + '.');
            break;
        case 'group': s.ui.group = arg; break;
        case 'prof': s.ui.prof = s.ui.prof === arg ? '' : arg; break;
        case 'open-prof': if (sheet) closeSheet(); s.ui.knight = 'work'; s.ui.group = SKILLS[arg].group; s.ui.prof = arg; setTab('knight'); return;
        case 'slot': s.ui.slot = s.ui.slot === arg ? '' : arg; break;
        case 'equip': {
            const parts = String(arg).split(':');
            const msg = equip(s, parts[0], parts[1]);
            if (msg) { toast(msg); return; }
            break;
        }
        case 'tool': if (knightBusy(s) || fl(s.inv[arg]) < 1) return; s.knight.tool = arg; s.rev++; break;
        case 'feed': {
            const parts = String(arg).split(':');
            const b = feedBlock(s, parts[0], parts[1]);
            if (b) { toast(b); return; }
            feed(s, parts[0], parts[1]);
            toast(C(parts[0]).name + ' enjoyed the ' + RES[parts[1]].name + '.');
            break;
        }
        case 'dest': if (DEST[arg] && !DEST[arg].planned) s.prep.dest = arg; break;
        case 'party': {
            const p = s.prep.party, i = p.indexOf(arg);
            if (i >= 0) p.splice(i, 1);
            else if (s.comps[arg] && s.comps[arg].joined) { if (p.length >= partySlots(s)) p.shift(); p.push(arg); }
            break;
        }
        case 'rations': s.prep.useRations = !s.prep.useRations; break;
        case 'tier': s.ui.tier = Number(arg); break;
        case 'rune': s.prep.rune = s.prep.rune === arg ? '' : arg; break;
        case 'potion': {
            const parts = String(arg).split(':');
            s.prep.potions = s.prep.potions || {};
            const total = Object.keys(s.prep.potions).reduce((a, k) => a + (s.prep.potions[k] || 0), 0);
            const v = Math.max(0, Math.min(fl(s.inv[parts[0]]), (s.prep.potions[parts[0]] || 0) + Number(parts[1])));
            if (Number(parts[1]) > 0 && total >= supplyCap(s)) { toast('The Stable carries ' + supplyCap(s) + ' potions.'); return; }
            s.prep.potions[parts[0]] = v;
            break;
        }
        case 'tame': {
            const parts = String(arg).split(':');
            const b = tameBlock(s, parts[0], parts[1] || '');
            if (b) { toast(b); return; }
            const res = tame(s, parts[0], parts[1] || '');
            toast(res.won ? 'Tamed! ' + C(res.uid).name + ' joined the Keep.' : 'It slipped away (' + Math.round(res.chance * 100) + '% chance).');
            break;
        }
        case 'evolve': if (!evolve(s, arg)) { toast(evolveBlock(s, arg)); return; } break;
        case 'trial': if (!startTrial(s, arg)) { toast(trialBlock(s, arg)); return; } toast('The Bond Trial begins.'); break;
        case 'rename-open': s.ui.rename = s.ui.rename === arg ? '' : arg; break;
        case 'bgroup': s.ui.bgroup = s.ui.bgroup === arg ? '' : arg; break;
        case 'repair': if (!startRepair(s, arg)) { toast(repairBlock(s, arg)); return; } break;
        case 'goto-keep': if (sheet) closeSheet(); s.ui.act = 'keep'; setTab('activities'); return;
        case 'steward': if (!steward(s)) return; toast('+4 Silver from stewardship.'); break;
        case 'refine': if (!refine(s, arg)) { toast(refineBlock(s, arg)); return; } toast('Made ' + itemName(arg) + '.'); break;
        case 'rec-from': s.ui.recFrom = arg; break;
        case 'rec-to': s.ui.recTo = arg; break;
        case 'recycle': if (!recycle(s, s.ui.recFrom || 'stone', s.ui.recTo || 'ember')) { toast(recycleBlock(s, s.ui.recFrom || 'stone', s.ui.recTo || 'ember')); return; } break;
        case 'buy': if (!buy(s, arg)) { toast(buyBlock(s, arg)); return; } break;
        case 'kcraft': if (!keepCraft(s, arg)) { toast(keepCraftBlock(s, arg)); return; } toast('Made ' + KEEP_CRAFTS[arg][0] + '.'); break;
        case 'theme': if (HALL_THEMES.some((t) => t[0] === arg && s.b.hall >= t[3])) { s.theme = arg; s.rev++; } break;
        case 'rebirth': s.ui.confirmRebirth = true; break;
        case 'rebirth-no': s.ui.confirmRebirth = false; break;
        case 'rebirth-yes': s.ui.confirmRebirth = false; if (!rebirth(s)) { toast(rebirthBlock(s)); return; } break;
        case 'voice': { const parts = String(arg).split(':'); const ch = chooseVoice(s, parts[0], parts[1]); if (ch) toast('+2 Silver. ' + (ch.response || '').slice(0, 80)); break; }
        case 'lore': if (s.lore[arg]) { s.ui.lore = s.ui.lore === arg ? '' : arg; break; } if (!readLore(s, arg)) { toast(readLoreBlock(s, arg)); return; } s.ui.lore = arg; break;
        case 'claim': if (!claimJourney(s, Number(arg))) return; toast('Journey reward claimed.'); break;
        case 'realm-refresh': NET.realmAt = 0; syncNow(true).then(loadRealm); return;
        case 'donate': realmCall('/api/dominion/guild/donate', { itemId: arg, qty: Math.min(10, fl(s.inv[arg])) }); return;
        case 'guild-leave': realmCall('/api/dominion/guild/leave', {}); return;
        case 'op-claim': realmCall('/api/dominion/operation/claim', {}); return;
        case 'op-go': if (!startOperation(s, arg)) { toast(operationBlock(s)); return; } toast('The Knight marches to the operation.'); break;
        case 'mk-buy': realmCall('/api/dominion/market/buy', { listingId: arg }); return;
        case 'mk-cancel': realmCall('/api/dominion/market/cancel', { listingId: arg }); return;
        case 'loadout-save': if (!saveLoadout(s, Number(arg))) return; toast('Loadout saved.'); break;
        case 'loadout-apply': if (!applyLoadout(s, Number(arg))) return; toast('Loadout applied.'); break;
        case 'depart':
            if (depart(s)) { toast('The Knight departs for ' + DEST[s.exp.dest].name + '.'); }
            break;
        case 'build':
            if (startBuild(s, arg)) toast('Construction started.');
            break;
        case 'cjob': {
            const parts = String(arg).split(':'), id = parts[0], kind = parts[1], target = parts[2];
            const c = s.comps[id];
            if (!c || !c.joined || onExpedition(s, id)) return;
            if (kind === 'help') {
                const t = target || (c.job.kind === 'help' ? c.job.target : HELP_TARGETS.find((x) => !helperOf(s, x)));
                if (!t) { toast('Every building already has a helper.'); return; }
                const other = helperOf(s, t);
                if (other && other !== id) { toast(C(other).name + ' already helps there.'); return; }
                c.job = { kind: 'help', target: t };
            } else {
                const other = kind === 'knight' && Object.keys(S.comps).find((x) => x !== id && s.comps[x].joined && s.comps[x].job.kind === 'knight');
                if (other) { toast(C(other).name + ' is already assisting the Knight.'); return; }
                if (kind === 'front' && c.job.kind !== 'front' && defenders(s).length >= frontCap(s)) { toast('Every rampart post is taken (' + frontCap(s) + ').'); return; }
                c.job = { kind: kind };
            }
            s.rev++;
            break;
        }
        case 'arrange': arranging = !arranging; if (!arranging) quarterSel = -1; break;
        case 'plot': plotTap(Number(arg)); break;
        case 'rotate':
            if (quarterSel >= 0 && s.grid[quarterSel]) { s.grid[quarterSel].rot = (s.grid[quarterSel].rot + 1) % 4; s.rev++; }
            break;
        case 'reserve': {
            const parts = String(arg).split(':');
            s.reserve[parts[0]] = Math.max(0, Math.min(99, (s.reserve[parts[0]] || 0) + Number(parts[1])));
            break;
        }
        default: return;
        }
        latchObjectives(s);
        save();
        renderAll();
    }
    function plotTap(i) {
        if (!arranging) { quarterSel = S.grid[i] ? (quarterSel === i ? -1 : i) : -1; return; }
        // Tapping a workshop always selects it; only an empty plot receives a move.
        if (S.grid[i]) { quarterSel = quarterSel === i ? -1 : i; return; }
        if (quarterSel < 0) return;
        S.grid[i] = S.grid[quarterSel];
        S.grid[quarterSel] = null;
        quarterSel = i;
        S.rev++;
    }

    function onKey(e) {
        if (e.key === 'Escape' && sheet) { e.preventDefault(); closeSheet(); return; }
        if (!sheet || sheet.kind !== 'quarter') return;
        const a = document.activeElement;
        if (!a || a.dataset.act !== 'plot') return;
        const i = Number(a.dataset.arg);
        let j = -1;
        if (e.key === 'ArrowRight' && i % 3 < 2) j = i + 1;
        else if (e.key === 'ArrowLeft' && i % 3 > 0) j = i - 1;
        else if (e.key === 'ArrowDown' && i < 6) j = i + 3;
        else if (e.key === 'ArrowUp' && i > 2) j = i - 3;
        else if ((e.key === 'r' || e.key === 'R') && arranging) { e.preventDefault(); act('rotate'); return; }
        if (j >= 0) { e.preventDefault(); const t = document.querySelector('[data-act="plot"][data-arg="' + j + '"]'); if (t) t.focus(); }
    }

    // —— Boot ——
    function boot() {
        S = load();
        const before = snapshot(), logLen = S.log.length;
        const gap = now() - S.t;
        advance(S, now());
        if (gap > 2 * MIN) {
            const notes = S.log.slice(0, Math.max(0, S.log.length - logLen)).map((l) => l.text).slice(0, 8);
            S.away = { ms: Math.min(gap, OFFLINE_CAP), gains: diffGains(before), notes: notes };
            FRESH.length = 0;
        }
        save();
        document.addEventListener('click', (e) => {
            const el = e.target.closest('[data-act]');
            if (!el || el.disabled) return;
            const b = el.closest('[data-building]');
            if (el.dataset.act) act(el.dataset.act, el.dataset.arg);
            else if (b) act('building', b.dataset.building);
        });
        document.querySelectorAll('[data-building]').forEach((b) => b.addEventListener('click', () => act('building', b.dataset.building)));
        document.querySelectorAll('.dm-tab').forEach((b) => b.addEventListener('click', () => act('tab', b.dataset.tab)));
        $('dmPass').addEventListener('click', () => passTime(4));
        $('dmMenu').addEventListener('click', () => act('menu'));
        document.addEventListener('keydown', onKey);
        document.addEventListener('submit', (e) => {
            const f = e.target.closest('[data-form]');
            if (!f) return;
            e.preventDefault();
            if (f.dataset.form === 'rename') {
                const c = S.comps[f.dataset.arg], inp = f.querySelector('input');
                if (c && inp) { c.nick = inp.value.trim().slice(0, 18); S.ui.rename = ''; S.rev++; save(); renderAll(); }
            }
            if (f.dataset.form && window.dmRealmSubmit) window.dmRealmSubmit(f);
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); syncNow(true); } else step(); });
        window.addEventListener('pagehide', save);
        setTab(S.ui.tab || 'keep');
        renderAll();
        if (S.away) openSheet('away'); else maybeShowReport();
        setInterval(step, 1000);
        setInterval(save, 10000);
        setInterval(() => syncNow(false), 30000);
        bootOnline();
    }

    // Test hook for headless checks; harmless in the prototype.
    window.dominionDebug = {
        state: () => S, advance: (ms) => { S.offset += ms; advance(S, now()); save(); flushToasts(); renderAll(); maybeShowReport(); }, pass: passTime,
        links: () => links(S.grid), encounter: encounter, save: save, now: now,
        encounters: (id) => DEST[id].encounters, tame: (id, lure) => { const r = tame(S, id, lure); save(); renderAll(); return r; }, tameBlock: (id, lure) => tameBlock(S, id, lure),
        evolveBlock: (id) => evolveBlock(S, id), buildBlock: (id) => buildBlock(S, id), startBuild: (id) => { const r = startBuild(S, id); save(); renderAll(); return r; },
        timberCap: () => timberCap(S), workshopRates: (id) => workshopRates(S, id), woodlotRate: () => woodlotRate(S), marketOffers: () => marketOffers(S),
        voicesReady: () => voicesReady(S), rebirthBlock: () => rebirthBlock(S), rebirth: () => { const r = rebirth(S); save(); renderAll(); return r; }, prodMul: () => prodMul(S)
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
