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
    const KIND_ORDER = ['MATERIAL', 'ESSENCE', 'FOOD', 'POTION', 'LURE', 'RUNE', 'WEAPON', 'ARMOR', 'HELMET', 'BOOTS', 'ACCESSORY', 'RELIC', 'TOOL'];
    const KIND_LABEL = { MATERIAL: 'Materials', ESSENCE: 'Essences', FOOD: 'Food', POTION: 'Potions', LURE: 'Lures', RUNE: 'Runes', WEAPON: 'Weapons', ARMOR: 'Armor', HELMET: 'Helmets', BOOTS: 'Boots', ACCESSORY: 'Accessories', RELIC: 'Relics', TOOL: 'Tools' };
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
    const COMPANIONS = {
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

    const DEST = {
        rootwild: { name: 'Rootwild Trail', hours: 4, provisions: 2, element: 'EARTH', blurb: 'The old forest road west of the Keep. Gathering and exploration.',
            loot: { timber: 40, fiber: 10, produce: 4, sunleaf: 6 }, xp: 120, prof: 40, bond: 30,
            encounters: ['pack', 'trail', 'ironwood', 'ambush', 'grove'] },
        ruins: { name: 'Covenant Ruins', hours: 8, provisions: 4, element: 'METAL', blurb: 'Collapsed halls of the first Covenant. Ruins and materials.',
            loot: { stone: 30, ore: 20, timber: 20, relic: 1, fossil: 3, rune_stone: 1 }, xp: 240, prof: 80, bond: 40,
            encounters: ['rubble', 'hazard', 'seam', 'pack', 'sealed', 'ambush'] },
        vault: { name: 'Sunken Vault', planned: true, blurb: 'Needs the Sealed Vault Map and Elemental Studies 10.' }
    };

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
    const TIMBER_CAP = 300;
    function add(s, gains, mul) {
        Object.keys(gains || {}).forEach((k) => {
            const v = Math.max(0, (s.inv[k] || 0) + gains[k] * (mul == null ? 1 : mul));
            s.inv[k] = k === 'timber' ? Math.min(Math.max(TIMBER_CAP, s.inv[k] || 0), v) : v;
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
            b: { hall: 1, woodlot: 1, archive: 0 },
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
                cacty: { joined: true, bond: 30, job: { kind: 'help', target: 'woodlot' }, explore: 0, treats: { day: '', n: 0 } },
                sundile: { joined: true, bond: 20, job: { kind: 'rest' }, explore: 0, treats: { day: '', n: 0 } },
                fawny: { joined: false, bond: 0, job: { kind: 'rest' }, explore: 0, treats: { day: '', n: 0 } }
            },
            build: null,
            exp: null,
            done: {},
            reports: [],
            disc: { fawny: false, vaultMap: false },
            obj: {},
            prep: { dest: 'rootwild', party: ['cacty'], useRations: false },
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
        Object.keys(COMPANIONS).forEach((id) => {
            const c = s.comps[id];
            if (!c.job || !['help', 'explore', 'rest', 'knight'].includes(c.job.kind)) c.job = { kind: 'rest' };
            if (c.job.kind === 'help' && !HELP_TARGETS.includes(c.job.target)) c.job = { kind: 'rest' };
        });
        const k = s.knight, t = k.task || {};
        if (!(t.kind === 'idle' || (t.kind === 'gather' && ACTIVITIES[t.id]) || (t.kind === 'craft' && CRAFTS[t.id] && CRAFTS[t.id].repeatable))) k.task = { kind: 'idle' };
        SLOTS.forEach((sl) => { const id = k.equip[sl[0]]; if (id && (!RES[id] || RES[id].kind !== sl[1] || fl(s.inv[id]) < 1)) k.equip[sl[0]] = null; });
        if (!k.equip.weapon) k.equip.weapon = fl(s.inv.squires_sword) ? 'squires_sword' : null;
        if (!RES[k.tool] || fl(s.inv[k.tool]) < 1) k.tool = fl(s.inv.woodaxe) ? 'woodaxe' : fl(s.inv.pickaxe) ? 'pickaxe' : '';
        s.prep.party = (s.prep.party || []).filter((id) => s.comps[id] && s.comps[id].joined);
        if (s.exp && (!DEST[s.exp.dest] || !(s.exp.endAt > 0))) s.exp = null;
        if (s.build && !BUILDINGS[s.build.id]) s.build = null;
        return s;
    }
    function load() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { saved = null; }
        if (!saved || typeof saved.t !== 'number' || (saved.schema || 0) > SCHEMA) return defaults(Date.now());
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
        return Object.keys(COMPANIONS).find((id) => {
            const c = s.comps[id];
            return c.joined && c.job.kind === 'help' && c.job.target === target;
        }) || null;
    }
    function knightHelper(s) {
        return Object.keys(COMPANIONS).find((id) => s.comps[id].joined && s.comps[id].job.kind === 'knight' && !onExpedition(s, id)) || null;
    }
    function helperMul(s, target) {
        const id = helperOf(s, target);
        if (!id || onExpedition(s, id)) return 1;
        const c = s.comps[id];
        return 1 + 0.3 + Math.min(0.5, bondLvl(c) * 0.02) + (COMPANIONS[id].likes.includes(target) ? 0.3 : 0);
    }
    function woodlotRate(s) {
        const base = BUILDINGS.woodlot.levels[s.b.woodlot].rate + (skillLvl(s, 'woodcutting') >= 20 ? 20 : 0);
        return base * helperMul(s, 'woodlot');
    }
    function workshopRates(s, id) {
        const mul = helperMul(s, id), out = {};
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
        if (after > before && [10, 25, 50, 75, 100].some((m) => before < m && after >= m)) FRESH.push(COMPANIONS[id].name + ' is now ' + bondName(c) + '.');
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
        const match = (def.helperElements || []).includes(COMPANIONS[id].el.toUpperCase());
        return match ? 0.25 + Math.min(0.25, bondLvl(s.comps[id]) * 0.01) : 0.1;
    }
    function knightSpeed(s, def) {
        return 1 + toolBonus(s, def) + helperBonus(s, def) + (skillLvl(s, def.skillId) >= 100 ? 0.2 : 0);
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
        Object.keys(COMPANIONS).forEach((id) => {
            const c = s.comps[id];
            if (!c.joined || onExpedition(s, id)) return;
            if (c.job.kind === 'help' || c.job.kind === 'knight') grantBond(s, id, 4 * h);
            else if (c.job.kind === 'rest') grantBond(s, id, 8 * h * restBoost);
            else if (c.job.kind === 'explore') {
                grantBond(s, id, 3 * h);
                c.explore += h;
                while (c.explore >= EXPLORE_HOURS) {
                    c.explore -= EXPLORE_HOURS;
                    const cache = EXPLORE_CACHE[COMPANIONS[id].el];
                    add(s, cache);
                    logEvent(s, COMPANIONS[id].name + ' came back from exploring with ' + Object.keys(cache).map((k) => cache[k] + ' ' + itemName(k)).join(' and ') + '.');
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
            if (s.build) next = Math.min(next, s.build.endAt);
            const step = Math.min(Math.max(0, next - s.t), STEP);
            if (step > 0) { tick(s, step); s.t += step; }
            // Completions fire at their exact timestamp, so time after a return is spent on resumed jobs.
            if (s.exp && s.t >= s.exp.endAt) finishExpedition(s);
            if (s.build && s.t >= s.build.endAt) finishBuild(s);
            if (step === 0 && !(s.exp && s.t >= s.exp.endAt) && !(s.build && s.t >= s.build.endAt)) break;
        }
        latchObjectives(s);
    }

    // —— Construction ——
    function nextLevel(s, id) {
        const lv = BUILDINGS[id].levels[s.b[id] + 1];
        return lv && lv.cost ? lv : null;
    }
    function buildBlock(s, id) {
        const lv = nextLevel(s, id);
        if (!lv) return 'Fully built in this prototype.';
        if (s.build) return BUILDINGS[s.build.id].name + ' is already under construction (one crew).';
        if (!canAfford(s, lv.cost)) return 'Not enough materials yet.';
        return '';
    }
    function startBuild(s, id) {
        if (buildBlock(s, id)) return false;
        const lv = nextLevel(s, id);
        if (!spend(s, lv.cost)) return false;
        s.build = { id: id, to: s.b[id] + 1, startAt: s.t, endAt: s.t + lv.hours * HOUR };
        logEvent(s, 'Construction started: ' + BUILDINGS[id].name + ' → ' + lv.label + '.');
        s.rev++;
        return true;
    }
    function finishBuild(s) {
        const bd = s.build;
        s.build = null;
        if (s.b[bd.id] >= bd.to) return;
        s.b[bd.id] = bd.to;
        const lv = BUILDINGS[bd.id].levels[bd.to];
        logEvent(s, BUILDINGS[bd.id].name + ' completed: ' + lv.label + '. ' + (lv.unlock || ''));
        FRESH.push(BUILDINGS[bd.id].name + ' is now ' + lv.label + '.');
        grantRank(s, Math.round((bd.endAt - bd.startAt) / HOUR * 30));
        s.rev++;
    }

    // —— Expeditions ——
    function needProvisions(s, dest) { return Math.max(0, DEST[dest].provisions - (s.b.hall >= 2 ? 1 : 0)); }
    function tripMs(s, dest) {
        const cut = Math.min(0.3, bonusLvl(s, 'pathfinding') * 0.004) + gearStats(s).roadCut;
        return Math.round(DEST[dest].hours * HOUR * Math.max(0.5, 1 - cut));
    }
    function packPlan(s) {
        const need = needProvisions(s, s.prep.dest);
        const rations = s.prep.useRations ? Math.min(fl(s.inv.rations), need) : 0;
        return { need: need, rations: rations, provisions: need - rations };
    }
    const prepParty = (s) => s.prep.party.filter((id) => s.comps[id] && s.comps[id].joined).slice(0, partySlots(s));
    function departBlock(s) {
        const d = DEST[s.prep.dest];
        if (s.exp) return 'The Knight is already on an expedition.';
        if (!d || d.planned) return 'This destination is planned content.';
        const p = packPlan(s);
        if (fl(s.inv.provisions) < p.provisions) return 'Pack ' + p.provisions + ' Provisions to depart (you have ' + fl(s.inv.provisions) + ').';
        return '';
    }
    function context(s, party) {
        const w = weaponItem(s), g = gearStats(s);
        return {
            weapon: w.weaponType || 'sword', weaponId: s.knight.equip.weapon, tier: w.tier || 0, tool: RES[s.knight.tool] ? s.knight.tool : '',
            party: party, hazard: s.runs % 2 ? 'frost' : 'ember', armor: g.armor, crit: g.crit, rest: g.rest, heat: g.heat, wards: g.wards,
            skills: { woodcutting: skillLvl(s, 'woodcutting'), mining: skillLvl(s, 'mining'), studies: skillLvl(s, 'elemental_studies'),
                survival: bonusLvl(s, 'survival'), cartography: bonusLvl(s, 'cartography') },
            profLvl: profLvl(s, w.weaponType || 'sword')
        };
    }
    function depart(s) {
        if (departBlock(s)) return false;
        const d = DEST[s.prep.dest], p = packPlan(s);
        s.inv.provisions = Math.max(0, s.inv.provisions - p.provisions);
        s.inv.rations = Math.max(0, s.inv.rations - p.rations);
        s.seq++;
        const ms = tripMs(s, s.prep.dest);
        s.exp = Object.assign(context(s, prepParty(s)), { id: 'x' + s.seq + '-' + s.t, dest: s.prep.dest, startAt: s.t, endAt: s.t + ms, rations: p.rations });
        logEvent(s, 'The Knight left for ' + d.name + ' with ' + (s.exp.party.length ? s.exp.party.map((id) => COMPANIONS[id].name).join(', ') : 'no companions') + '.');
        s.rev++;
        return true;
    }

    // One function both previews encounters on the prep screen and resolves them on
    // return, so what the player is shown is exactly what will happen.
    function encounter(id, x, s) {
        const has = (c) => x.party.includes(c);
        const pm = 1 + 0.15 * (x.profLvl - 1) + 0.2 * x.tier;
        const r = { id: id, status: 'ok', by: '', title: '', text: '', need: '', gain: {}, loss: 0, bondMul: 1, xp: {}, disc: null, hazard: false };
        switch (id) {
        case 'pack':
            r.title = 'Raiders at the pack'; r.need = 'Sword';
            if (x.weapon === 'sword') { r.by = 'Sword'; r.text = 'Your sword held the raiders away from the pack. Nothing was lost.'; }
            else if (has('sundile')) { r.status = 'part'; r.by = 'Sundile'; r.loss = 0.1; r.text = 'Sundile flared and scattered them, but a few bundles were torn open.'; }
            else if (x.weapon === 'daggers') { r.status = 'part'; r.by = 'Daggers'; r.loss = 0.1; r.text = 'Your daggers struck first and the raiders fled with only a little.'; }
            else { r.status = 'miss'; r.loss = 0.25; r.text = 'Raiders tore into the pack. A quarter of the haul was lost.'; }
            break;
        case 'ambush':
            r.title = 'Ambush on the companions'; r.need = 'Spear';
            if (!x.party.length) { r.status = 'skip'; r.text = 'No companions travelled, so there was no one to ambush.'; }
            else if (x.weapon === 'spear') { r.by = 'Spear'; r.text = 'Your spear kept the pack at bay and the party together.'; }
            else if (x.wards.ambush) { r.status = 'part'; r.by = 'Dawn Lantern'; r.bondMul = 0.85; r.text = 'The Dawn Lantern showed the ambush early. The party scattered only briefly.'; }
            else if (x.weapon === 'daggers') { r.status = 'part'; r.by = 'Daggers'; r.bondMul = 0.85; r.text = 'Your daggers broke the ambush, but the party was shaken.'; }
            else { r.status = 'miss'; r.bondMul = 0.6; r.text = 'The companions were scattered and spent the night regrouping. Bonds grew less.'; }
            break;
        case 'trail':
            r.title = 'Game trail'; r.need = 'Bow';
            if (x.weapon === 'bow') {
                r.by = 'Bow'; r.gain = { produce: Math.round(4 * pm), fiber: Math.round(3 * pm), minnow: 2 };
                r.text = 'Your bow brought down game along the trail.';
                if (!s.disc.fawny && !s.comps.fawny.joined) { r.disc = 'fawny'; r.text += ' Scouting ahead, you found small hoofprints in the frost. Fawny followed you home.'; }
            } else { r.status = 'miss'; r.text = 'The game slipped away before anyone got close.'; }
            break;
        case 'ironwood':
            r.title = 'Fallen ironwood'; r.need = 'Woodaxe';
            if (x.tool === 'woodaxe') {
                r.by = 'Woodaxe'; r.gain = { timber: 20 * (x.skills.woodcutting >= 10 ? 2 : 1), oak_log: 2 }; r.xp = { woodcutting: 40 };
                r.text = 'Your woodaxe split a fallen ironwood into Timber' + (x.skills.woodcutting >= 10 ? ' (Ironwood Eye doubled it).' : '.');
            } else { r.status = 'part'; r.gain = { timber: 4 }; r.text = 'Without a woodaxe only loose branches came home.'; }
            break;
        case 'grove':
            r.title = 'Hidden grove'; r.need = 'Cacty';
            if (has('cacty')) {
                r.by = 'Cacty'; r.gain = { timber: 15, fiber: 6, sunleaf: 4 };
                if (bondLvl(s.comps.cacty) >= 5) r.gain.produce = 3;
                r.text = 'Cacty found a hidden grove.';
            } else { r.status = 'miss'; r.text = 'A grove went unnoticed. An earth Siegeling might have sensed it.'; }
            break;
        case 'rubble':
            r.title = 'Collapsed gallery'; r.need = 'Hammer';
            if (x.weapon === 'hammer') { r.by = 'Hammer'; r.gain = { stone: Math.round(15 * pm), relic: 1, fossil: 2 }; r.text = 'Your hammer broke through the collapsed gallery.'; }
            else { r.status = 'miss'; r.loss = 0.1; r.text = 'The party took the long way round and dropped some of the haul.'; }
            break;
        case 'hazard': {
            const ember = x.hazard === 'ember';
            r.title = ember ? 'Ember vents' : 'Frost mist'; r.need = 'Staff'; r.hazard = true;
            if (x.weapon === 'staff') {
                r.by = 'Staff'; r.gain = ember ? { ember: Math.round(2 * pm), ember_shard: 1, essence_fire: 1 } : { frost: Math.round(2 * pm), essence_ice: 1 };
                r.text = 'Your staff calmed the ' + (ember ? 'vents and drew Ember Ingots' : 'mist and drew Frost Crystals') + ' from them.';
            } else if ((ember && (has('sundile') || x.heat)) || (!ember && has('fawny'))) {
                r.status = 'part'; r.by = ember ? (has('sundile') ? 'Sundile' : 'heat ward') : 'Fawny'; r.text = 'The ' + r.by + ' led the party safely through, but nothing was harvested.';
            } else if (x.skills.studies >= 8) {
                r.status = 'part'; r.by = 'Ward Script'; r.text = 'Ward Script carried the party through the hazard.';
            } else { r.status = 'miss'; r.loss = 0.2; r.text = 'The party detoured around the ' + (ember ? 'vents' : 'mist') + ' and lost supplies.'; }
            break;
        }
        case 'seam':
            r.title = 'Copper seam'; r.need = 'Pickaxe';
            if (x.tool === 'pickaxe') {
                r.by = 'Pickaxe'; r.gain = { ore: 15 * (x.skills.mining >= 10 ? 2 : 1), iron_ore: 2 }; r.xp = { mining: 40 };
                r.text = 'Your pickaxe opened a copper seam' + (x.skills.mining >= 10 ? ' (Seam Reader doubled it).' : '.');
            } else { r.status = 'part'; r.gain = { ore: 3 }; r.text = 'Without a pickaxe only a few loose nuggets came home.'; }
            break;
        case 'sealed':
            r.title = 'Sealed door'; r.need = 'Hammer';
            if (x.weapon === 'hammer') {
                r.by = 'Hammer'; r.gain = { relic: 2, rune_stone: 2 }; r.text = 'Your hammer broke the seal.';
                if (!s.disc.vaultMap) { r.disc = 'vaultMap'; r.text += ' Behind the door lay the Sealed Vault Map.'; }
            } else if (has('fawny')) { r.status = 'part'; r.by = 'Fawny'; r.text = 'Fawny noticed a draft under a sealed door. A hammer could open it.'; }
            else { r.status = 'miss'; r.text = 'A sealed door blocked a side hall. A hammer could open it.'; }
            break;
        }
        return r;
    }
    const previewContext = (s) => context(s, prepParty(s));

    function finishExpedition(s) {
        const x = s.exp;
        s.exp = null;
        // The id ledger is the duplicate-reward guard: a resolved journey can never pay twice.
        if (s.done[x.id]) return;
        s.done[x.id] = true;
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
        const okN = lines.filter((r) => r.status === 'ok').length;
        const lootMul = Math.max(0.4, 1 - loss) + 0.05 * x.rations + x.skills.cartography * 0.003 + x.crit;
        const total = {};
        Object.keys(d.loot).forEach((k) => { total[k] = Math.round(d.loot[k] * lootMul); });
        Object.keys(gains).forEach((k) => { total[k] = (total[k] || 0) + gains[k]; });
        // Essences: the road's element, plus one for each companion's element.
        const ess = 'essence_' + d.element.toLowerCase();
        total[ess] = (total[ess] || 0) + 2;
        x.party.forEach((id) => { const e = 'essence_' + COMPANIONS[id].el; total[e] = (total[e] || 0) + 1; });
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
        const bonds = {};
        x.party.forEach((id) => {
            const raw = (d.bond + 10 * okN) * bondMul * (x.weapon === 'spear' ? 1.5 : 1) * (1 + x.rest) + 2 * x.rations;
            bonds[id] = Math.round(grantBond(s, id, raw));
            grantAffinity(s, COMPANIONS[id].el.toUpperCase(), okN * 12);
            grantMastery(s, COMPANIONS[id].cls, okN * 12);
        });
        discs.forEach((k) => {
            s.disc[k] = true;
            if (k === 'fawny') { s.comps.fawny.joined = true; s.comps.fawny.job = { kind: 'rest' }; s.comps.fawny.bond = Math.max(s.comps.fawny.bond, 20); }
        });
        const ok = lines.filter((r) => r.status === 'ok').map((r) => r.text.split('. ')[0].replace(/\.$/, '') + '.');
        const gotWhat = Object.keys(total).filter((k) => total[k] > 0).slice(0, 4).map(itemName);
        const summary = ok.slice(0, 2).join(' ') + ' You returned with ' + gotWhat.join(', ') + ', ' + WEAPONS[x.weapon].name.toLowerCase() + ' proficiency' + (x.party.length ? ', and stronger bonds.' : '.');
        const resumed = [];
        if (s.knight.task.kind !== 'idle') resumed.push('Knight: ' + taskLabel(s));
        x.party.forEach((id) => resumed.push(COMPANIONS[id].name + ': ' + jobLabel(s, id)));
        s.reports.unshift({
            id: x.id, dest: x.dest, at: x.endAt, seen: false, weapon: x.weapon, weaponId: x.weaponId, tool: x.tool, party: x.party, rations: x.rations,
            lines: lines.filter((r) => r.status !== 'skip').map((r) => ({ status: r.status, title: r.title, by: r.by, text: r.text, need: r.need })),
            total: total, xp: gained, prof: prof, bonds: bonds, discs: discs, summary: summary, resumed: resumed, lootPct: Math.round(lootMul * 100), minutes: minutes
        });
        if (s.reports.length > 12) s.reports.length = 12;
        logEvent(s, 'Returned from ' + d.name + '.');
        FRESH.push('The Knight returned from ' + d.name + '. Report ready.');
        s.rev++;
    }

    function jobLabel(s, id) {
        const j = s.comps[id].job;
        if (j.kind === 'help') return 'Helping the ' + (WS[j.target] ? WS[j.target].name : 'Woodlot');
        if (j.kind === 'explore') return 'Exploring the wilds';
        if (j.kind === 'knight') return 'Assisting the Knight';
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
        const liked = (it.prefers || []).includes(COMPANIONS[id].el.toUpperCase());
        grantBond(s, id, it.bondXp * (liked ? 1.5 : 1));
        grantSkill(s, 'husbandry', Math.max(1, Math.floor(it.bondXp / 4)));
        s.rev++;
        return true;
    }

    // —— Objectives ——
    const OBJECTIVES = [
        { chapter: 'Restoration: the Archive', steps: [
            { id: 'link', title: 'Connect the Forge and Fridge', hint: 'Open the Elemental Quarter, tap Arrange, then turn both sockets to face each other.', done: (s) => activeRecipes(s).includes('glass') },
            { id: 'glass', title: 'Refine 3 Tempered Glass', hint: 'The link turns Ember Ingots and Frost Crystals into glass. A companion at the Fridge speeds it up.', done: (s) => fl(s.inv.glass) >= 3 },
            { id: 'timber', title: 'Stock 60 Timber', hint: 'The Woodlot, the Knight’s woodcutting and the Rootwild Trail all bring Timber.', done: (s) => fl(s.inv.timber) >= 60 },
            { id: 'restore', title: 'Restore the Archive', hint: 'Tap the ruined Archive and start construction.', done: (s) => s.b.archive >= 1 || (s.build && s.build.id === 'archive') },
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
        $('dmResStrip').innerHTML = STRIP.map((k) => '<div class="dm-res' + (k === 'timber' && S.inv.timber >= TIMBER_CAP - 1e-6 ? ' is-full' : '') + '" title="' + esc(RES[k].name) + (k === 'timber' ? ' (store holds ' + TIMBER_CAP + ')' : '') + '">' + icon(k) + '<span data-res="' + k + '">' + fl(S.inv[k]) + '</span></div>').join('') +
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
        sc.querySelectorAll('.building-hotspot').forEach((b) => b.classList.toggle('is-building', !!(S.build && S.build.id === b.dataset.building)));
        const lbl = (k, v) => { const e = sc.querySelector('[data-label="' + k + '"]'); if (e) e.textContent = v; };
        lbl('hall', BUILDINGS.hall.levels[S.b.hall].label);
        lbl('woodlot', 'Lv ' + S.b.woodlot + ' · ' + fmtRate(woodlotRate(S)) + ' Timber/h');
        lbl('archiveName', S.b.archive >= 1 ? 'Archive' : 'Ruined Archive');
        lbl('archive', S.b.archive >= 1 ? 'Studies \u00b7 Runecrafting' : '60 Timber + 3 Glass');
        const act = activeRecipes(S);
        lbl('quarter', act.length ? act.length + ' recipe' + (act.length > 1 ? 's' : '') + ' running' : 'No links yet');
        const resting = Object.keys(COMPANIONS).filter((id) => S.comps[id].joined && S.comps[id].job.kind === 'rest' && !onExpedition(S, id));
        lbl('enclave', resting.length ? resting.map((id) => COMPANIONS[id].name).join(', ') + ' resting' : 'Residents rest here');

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
        Object.keys(COMPANIONS).forEach((id) => {
            const c = S.comps[id];
            if (!c.joined || onExpedition(S, id)) return;
            let pos;
            if (c.job.kind === 'help') pos = spot[c.job.target];
            else if (c.job.kind === 'rest') pos = 'right:' + (8 + restSlot++ * 12) + '%;top:44%';
            else pos = 'left:' + (44 + exploreSlot++ * 9) + '%;bottom:2%;opacity:.7';
            ov.push('<span class="dm-resident" style="' + pos + ';--el:var(--' + COMPANIONS[id].el + ')" title="' + esc(COMPANIONS[id].name) + '">' + artImg(id, COMPANIONS[id].name) + '</span>');
        });
        if (S.build) {
            const pos = { hall: 'left:50%;top:12%;transform:translateX(-50%)', woodlot: 'left:8%;bottom:30%', archive: 'right:8%;bottom:31%' }[S.build.id];
            ov.push('<span class="dm-pip" style="' + pos + '">Building · <span data-live="eta" data-end="' + S.build.endAt + '"></span></span>');
        }
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
            (k.stall ? '<p class="dm-muted" style="color:var(--gold)">' + esc(k.stall) + '</p>' : '<p class="dm-muted">' + esc(rateLine(r)) + (help ? ' · ' + esc(COMPANIONS[help].name) + ' assisting' : '') + '</p>');
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
        let h = '<div class="dm-pad">';
        h += '<div class="dm-seg" role="group" aria-label="Activity sections">' + [['expedition', 'Expedition'], ['build', 'Construction'], ['log', 'Log']].map((x) =>
            '<button type="button" data-act="act-sec" data-arg="' + x[0] + '" aria-pressed="' + (sec === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
        if (sec === 'expedition') h += expeditionHtml();
        else if (sec === 'build') h += buildListHtml();
        else h += logHtml();
        h += '</div>';
        $('view-activities').innerHTML = h;
    }
    function expeditionHtml() {
        let h = '';
        const unread = S.reports.filter((r) => !r.seen);
        unread.forEach((r) => {
            h += '<button class="dm-card" type="button" data-act="report" data-arg="' + esc(r.id) + '" style="text-align:left;border-color:rgba(111,207,139,.5)"><span class="dm-eyebrow" style="color:var(--green)">New report</span><h3>Back from ' + esc(DEST[r.dest].name) + '</h3><p class="dm-muted">' + esc(r.summary) + '</p><span class="dm-chips">' + gainChips(r.total) + '</span></button>';
        });
        if (S.exp) {
            const x = S.exp, d = DEST[x.dest];
            const pct = Math.min(100, (S.t - x.startAt) / (x.endAt - x.startAt) * 100);
            h += '<div class="dm-travel">' + artImg(x.dest === 'ruins' ? 'ruins' : 'rootwild', '') + '<span class="dm-eyebrow">On expedition</span><h2 style="margin:0;font:700 20px/1.2 var(--display);color:#fff1b7">' + esc(d.name) + '</h2>' +
                '<p class="dm-muted">Returns in <b data-live="eta" data-end="' + x.endAt + '"></b> · ' + esc(RES[x.weaponId] ? RES[x.weaponId].name : WEAPONS[x.weapon].name) + (x.tool ? ' and ' + esc(itemName(x.tool)) : '') + ' · ' + fmtDur(x.endAt - x.startAt) + ' trip</p>' +
                '<div class="dm-trail"><span class="dm-walker" data-live="walker" data-start="' + x.startAt + '" data-end="' + x.endAt + '" style="left:' + pct + '%">' + artImg('knight', '') + '</span></div></div>';
            h += '<div class="dm-card"><h3>While the Knight travels</h3><ul class="dm-list">' +
                '<li class="dm-status paused">Paused: Knight’s ' + esc(S.knight.task.kind === 'idle' ? 'idle time' : taskLabel(S)) + '</li>' +
                x.party.map((id) => '<li class="dm-status paused">Paused: ' + esc(COMPANIONS[id].name) + ' (' + esc(jobLabel(S, id)) + ') travels with the Knight</li>').join('') +
                '<li class="dm-status">Still running: the Woodlot, all six workshops, refining' + (S.build ? ', construction of the ' + esc(BUILDINGS[S.build.id].name) : '') + ', and residents who stayed home.</li></ul></div>';
            return h;
        }
        const prep = S.prep, d = DEST[prep.dest];
        h += '<div class="dm-card"><h3>Destination</h3><div class="dm-dests">' + Object.keys(DEST).map((id) => {
            const dd = DEST[id];
            return '<button class="dm-dest" type="button" data-act="dest" data-arg="' + id + '" aria-pressed="' + (prep.dest === id) + '"' + (dd.planned ? ' disabled' : '') + '>' + artImg(id, '') +
                (dd.planned ? '<span class="dm-planned">Planned</span>' : '') + '<strong>' + esc(dd.name) + '</strong><small>' + (dd.planned ? esc(dd.blurb) : dd.hours + ' hours · ' + needProvisions(S, id) + ' provisions') + '</small></button>';
        }).join('') + '</div><p class="dm-muted">' + esc(d.blurb) + '</p></div>';

        const x = previewContext(S);
        const enc = d.encounters.map((id) => encounter(id, x, S)).filter((r) => r.status !== 'skip');
        const okN = enc.filter((r) => r.status === 'ok').length;
        h += '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">Expected encounters</h3><span class="dm-chip ' + (okN === enc.length ? 'good' : 'warn') + '">' + okN + '/' + enc.length + ' prepared</span></div>' +
            '<p class="dm-muted">Fully automatic. Your weapon, tool and party decide each one.</p><div class="dm-list">' +
            enc.map((r) => '<div class="dm-enc ' + (r.status === 'ok' ? 'ok' : r.status === 'part' ? 'part' : 'miss') + '"><span class="dm-mark">' + (r.status === 'ok' ? '✓' : r.status === 'part' ? '~' : '✕') + '</span><span><strong>' + esc(r.title) + '</strong><small>' +
                esc(r.status === 'ok' ? 'Handled by ' + r.by : r.status === 'part' ? (r.by ? r.by + ' helps a little. ' : '') + 'Best answer: ' + r.need : 'Answer: ' + r.need) + '</small></span>' +
                (Object.keys(r.gain).length && r.status === 'ok' ? '<span class="dm-chips">' + Object.keys(r.gain).map((k) => '<span class="dm-chip">' + icon(k) + '+' + r.gain[k] + '</span>').join('') + '</span>' : r.loss ? '<span class="dm-chip bad">−' + Math.round(r.loss * 100) + '% haul</span>' : r.bondMul < 1 ? '<span class="dm-chip bad">Less bond</span>' : '<span></span>') + '</div>').join('') + '</div></div>';

        const weaponsOwned = Object.keys(RES).filter((x) => RES[x].kind === 'WEAPON' && fl(S.inv[x]) > 0);
        const wi = weaponItem(S);
        h += '<div class="dm-card"><h3>Loadout</h3><div class="dm-label">Weapon</div><div class="dm-chips">' + weaponsOwned.map((w) =>
            '<button class="dm-btn small ' + (S.knight.equip.weapon === w ? '' : 'secondary') + '" type="button" data-act="equip" data-arg="weapon:' + w + '" aria-pressed="' + (S.knight.equip.weapon === w) + '">' + esc(RES[w].name) + '</button>').join('') + '</div>' +
            '<div class="dm-label">Tool</div><div class="dm-chips">' + ['woodaxe', 'pickaxe'].filter((t) => fl(S.inv[t]) > 0).map((t) =>
            '<button class="dm-btn small ' + (S.knight.tool === t ? '' : 'secondary') + '" type="button" data-act="tool" data-arg="' + t + '" aria-pressed="' + (S.knight.tool === t) + '">' + esc(RES[t].name) + '</button>').join('') + '</div>' +
            '<p class="dm-muted">' + esc(WEAPONS[wi.weaponType || 'sword'].detail) + ' Tier ' + (wi.tier || 0) + '. ' + (S.knight.tool ? 'Trains ' + esc(SKILLS[RES[S.knight.tool].tool].name) + '. ' : '') + 'Trip time ' + fmtDur(tripMs(S, prep.dest)) + ' with Pathfinding and boots.</p></div>';

        h += '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">Party</h3><span class="dm-chip">' + prepParty(S).length + '/' + partySlots(S) + '</span></div><div class="dm-party">' + Object.keys(COMPANIONS).map((id) => {
            const c = S.comps[id], C = COMPANIONS[id], on = prepParty(S).includes(id);
            if (!c.joined) return '<div class="dm-party-slot" style="opacity:.55"><span class="dm-art" style="--el:var(--line);filter:grayscale(1) brightness(.4)">' + artImg(id, '') + '</span><strong>???</strong><small>Not found yet</small></div>';
            return '<button class="dm-party-slot" type="button" data-act="party" data-arg="' + id + '" aria-pressed="' + on + '" style="--el:var(--' + C.el + ')"><span class="dm-art">' + artImg(id, '') + '</span><strong>' + C.name + '</strong><small>' + (on ? 'Travelling · ' + C.trait : esc(jobLabel(S, id))) + '</small></button>';
        }).join('') + '</div><p class="dm-muted">Command ' + skillLvl(S, 'command') + ' fields ' + partySlots(S) + ' Siegeling' + (partySlots(S) > 1 ? 's' : '') + ' (2 at Command 3, 3 at Command 10). Selected companions pause their Keep job and resume it on return.</p></div>';

        const p = packPlan(S);
        h += '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">Provisions</h3><span class="dm-chip ' + (fl(S.inv.provisions) >= p.provisions ? 'good' : 'bad') + '">' + icon('provisions') + 'Need ' + p.need + '</span></div>' +
            '<p class="dm-muted">Packs ' + p.provisions + ' Provisions' + (p.rations ? ' and ' + p.rations + ' Hearth Rations' : '') + '. You have ' + fl(S.inv.provisions) + ' Provisions and ' + fl(S.inv.rations) + ' Hearth Rations.</p>' +
            '<button class="dm-option" type="button" data-act="rations" aria-pressed="' + !!S.prep.useRations + '"' + (fl(S.inv.rations) < 1 ? ' disabled' : '') + '><strong>Pack Hearth Rations first</strong><small>Each ration replaces a provision, adds 5% to the haul and 2 bond per companion. Made by linking the Garden and Kitchen.</small></button></div>';

        const block = departBlock(S);
        h += '<div class="dm-sticky-cta"><button class="dm-btn block" type="button" data-act="depart"' + (block ? ' disabled' : '') + '>Depart for ' + esc(d.name) + ' · ' + d.hours + 'h</button>' + (block ? '<p class="dm-muted" style="text-align:center">' + esc(block) + '</p>' : '') + '</div>';
        return h;
    }
    function buildCard(id) {
        const B = BUILDINGS[id], cur = B.levels[S.b[id]], lv = nextLevel(S, id);
        let h = '<div class="dm-card"><div class="dm-row"><h3 class="dm-grow">' + esc(B.name) + '</h3><span class="dm-chip">' + esc(cur.label) + '</span></div>';
        if (S.build && S.build.id === id) {
            h += '<p class="dm-muted">Under construction → ' + esc(B.levels[S.build.to].label) + '. Done in <b data-live="eta" data-end="' + S.build.endAt + '"></b>.</p><div class="dm-bar"><b data-live="bar" data-start="' + S.build.startAt + '" data-end="' + S.build.endAt + '"></b></div>';
        } else if (lv) {
            const block = buildBlock(S, id);
            h += '<p class="dm-muted"><b>Next: ' + esc(lv.label) + '.</b> ' + esc(lv.unlock) + '</p><div class="dm-cost">' + costChips(lv.cost, S) + '<span class="dm-chip">' + lv.hours + 'h build</span></div>' +
                '<button class="dm-btn" type="button" data-act="build" data-arg="' + id + '"' + (block ? ' disabled' : '') + '>Start construction</button>' + (block ? '<small class="dm-muted">' + esc(block) + '</small>' : '');
        } else {
            h += '<p class="dm-muted">No further upgrades in this prototype. <span class="dm-planned">Later ranks planned</span></p>';
        }
        return h + '</div>';
    }
    function buildListHtml() {
        let h = '<p class="dm-muted">One construction crew. Building continues while the Knight is away.</p>';
        h += ['archive', 'woodlot', 'hall'].map(buildCard).join('');
        h += '<div class="dm-card is-quiet"><div class="dm-row"><h3 class="dm-grow">Enclave lodges, workshop levels</h3><span class="dm-planned">Planned</span></div><p class="dm-muted">More resident space and second workshop sockets would come next. Not playable in this slice.</p></div>';
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
        let h = '<div class="dm-pad"><p class="dm-muted">Each Siegeling holds one job at a time. Bond is never lost when you move them.</p>';
        Object.keys(COMPANIONS).forEach((id) => {
            const C = COMPANIONS[id], c = S.comps[id];
            if (!c.joined) {
                h += '<div class="dm-card"><div class="dm-comp is-locked" style="--el:var(--line)"><span class="dm-art">' + artImg(id, '') + '</span><div style="display:grid;gap:4px;min-width:0"><span class="dm-eyebrow">Undiscovered</span><h3>A Siegeling in the frost</h3><p class="dm-muted">' + esc(C.findText) + '</p></div></div></div>';
                return;
            }
            const bp = bondProgress(c.bond), away = onExpedition(S, id);
            let status = jobLabel(S, id);
            if (c.job.kind === 'help') status += ' (+' + Math.round((helperMul(S, c.job.target) - 1) * 100) + '% output)';
            if (c.job.kind === 'knight') { const td = taskDef(S.knight.task); status += td ? ' (+' + Math.round(helperBonus(S, td) * 100) + '% speed on ' + taskLabel(S) + ')' : ' (the Knight is idle)'; }
            h += '<div class="dm-card"><div class="dm-comp" style="--el:var(--' + C.el + ')"><span class="dm-art">' + artImg(id, C.name) + '</span><div style="display:grid;gap:5px;min-width:0">' +
                '<div class="dm-row"><h3 class="dm-grow">' + C.name + '</h3><span class="dm-chip el" style="--el:var(--' + C.el + ')">' + C.role + '</span></div>' +
                '<div class="dm-skill-head"><small class="dm-muted" style="flex:1">Bond ' + bp.l + ' \u00b7 ' + esc(bondName(c)) + ' \u00b7 ' + C.cls + '</small><small class="dm-muted">' + bp.label + '</small></div><div class="dm-bar"><b style="width:' + bp.pct + '%"></b></div>' +
                '<p class="dm-muted"><b>' + C.trait + ':</b> ' + esc(C.traitText) + '</p></div></div>' +
                '<p class="dm-status ' + (away ? 'paused' : '') + '">' + (away ? 'Travelling with the Knight. ' + esc(status) + ' resumes on return.' : esc(status)) + '</p>';
            if (c.job.kind === 'explore' && !away) h += '<div class="dm-bar blue"><b style="width:' + Math.round(c.explore / EXPLORE_HOURS * 100) + '%"></b></div><small class="dm-muted">Next cache in ' + fmtDur((EXPLORE_HOURS - c.explore) * HOUR) + ' (progress is kept if you reassign)</small>';
            h += '<div class="dm-seg" role="group" aria-label="' + C.name + ' assignment">' + [['help', 'Building'], ['knight', 'Knight'], ['explore', 'Explore'], ['rest', 'Rest']].map((j) =>
                '<button type="button" data-act="cjob" data-arg="' + id + ':' + j[0] + '" aria-pressed="' + (c.job.kind === j[0]) + '"' + (away ? ' disabled' : '') + '>' + j[1] + '</button>').join('') + '</div>';
            if (c.job.kind === 'help') {
                h += '<div class="dm-chips">' + HELP_TARGETS.map((t) => {
                    const other = helperOf(S, t);
                    const taken = other && other !== id;
                    const like = C.likes.includes(t);
                    return '<button class="dm-btn small ' + (c.job.target === t ? '' : 'secondary') + '" type="button" data-act="cjob" data-arg="' + id + ':help:' + t + '"' + (taken || away ? ' disabled' : '') + ' aria-pressed="' + (c.job.target === t) + '">' + (t === 'woodlot' ? 'Woodlot' : WS[t].name) + (like ? ' ★' : '') + (taken ? ' · ' + COMPANIONS[other].name : '') + '</button>';
                }).join('') + '</div><small class="dm-muted">★ favourite spot: +30% more. Explore brings a cache every ' + EXPLORE_HOURS + 'h. Rest grows bond fastest.</small>';
            }
            if (c.job.kind === 'knight') h += '<small class="dm-muted">Assisting speeds the Knight\u2019s work, most when ' + C.name + '\u2019s element suits it (as in Chronicles).</small>';
            const foods = Object.keys(RES).filter((x) => RES[x].kind === 'FOOD' && RES[x].bondXp && fl(S.inv[x]) > 0);
            const day = new Date(S.t).toDateString(), used = c.treats.day === day ? c.treats.n : 0;
            h += '<div class="dm-row"><small class="dm-muted dm-grow">Treats today ' + used + '/' + DAILY_TREATS + (foods.length ? '' : ' \u00b7 Cook Grilled Minnow, salads or stews to feed') + '</small></div>';
            if (foods.length) h += '<div class="dm-chips">' + foods.map((f) => { const b = feedBlock(S, id, f); return '<button class="dm-btn small secondary" type="button" data-act="feed" data-arg="' + id + ':' + f + '"' + (b ? ' disabled title="' + esc(b) + '"' : '') + '>' + icon(f) + ' Feed ' + esc(RES[f].name) + ' (' + fl(S.inv[f]) + ')</button>'; }).join('') + '</div>';
            h += '</div>';
        });
        h += '</div>';
        $('view-companions').innerHTML = h;
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
            const here = Object.keys(COMPANIONS).filter((c) => S.comps[c].joined);
            let body = '<p class="dm-muted">Home of the Keep’s Siegelings. Residents resting here gain bond fastest (3 per hour).</p><div class="dm-card"><h3>Residents</h3><div class="dm-list">' +
                here.map((c) => '<div class="dm-row"><span class="dm-art round" style="width:40px;height:40px;border:2px solid var(--' + COMPANIONS[c].el + ')">' + artImg(c, '') + '</span><span class="dm-grow"><strong>' + COMPANIONS[c].name + '</strong><br><small class="dm-muted">' + (onExpedition(S, c) ? 'Away with the Knight' : esc(jobLabel(S, c))) + '</small></span>' +
                    (S.comps[c].job.kind !== 'rest' && !onExpedition(S, c) ? '<button class="dm-btn small secondary" type="button" data-act="cjob" data-arg="' + c + ':rest">Rest here</button>' : '') + '</div>').join('') + '</div></div>';
            body += '<div class="dm-card is-quiet"><div class="dm-row"><h3 class="dm-grow">Next: Enclave Lodges</h3><span class="dm-planned">Planned</span></div><p class="dm-muted">Room for more residents and rest bonuses for the road. Beyond this slice.</p></div>';
            body += '<button class="dm-btn secondary" type="button" data-act="tab" data-arg="companions">Manage companions</button>';
            return { title: 'Siegeling Enclave', body: body };
        }
        const B = BUILDINGS[id];
        let body = '<p class="dm-muted">' + esc(B.blurb) + '</p>';
        if (id === 'woodlot') {
            const helper = helperOf(S, 'woodlot');
            body += '<div class="dm-card"><h3>Produces</h3><dl class="dm-kv"><dt>Woodlot</dt><dd>' + fmtRate(woodlotRate(S)) + ' Timber/h</dd>' +
                '<dt>Knight</dt><dd>' + (S.exp ? 'Away' : knightRates(S).gain.timber ? fmtRate(knightRates(S).gain.timber) + ' Timber/h (' + taskLabel(S) + ')' : 'Not cutting pine') + '</dd>' +
                '<dt>Helper</dt><dd>' + (helper ? COMPANIONS[helper].name + (onExpedition(S, helper) ? ' (away, paused)' : ' +' + Math.round((helperMul(S, 'woodlot') - 1) * 100) + '%') : 'None') + '</dd></dl>' +
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
        body += buildCard(id);
        return { title: id === 'archive' && S.b.archive < 1 ? 'Ruined Archive' : B.name, body: body };
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
                '<dl class="dm-kv"><dt>Produces</dt><dd>' + rateText(rates) + '</dd><dt>Helper</dt><dd>' + (helper ? COMPANIONS[helper].name + (onExpedition(S, helper) ? ' (away)' : '') : 'None') + '</dd><dt>Next level</dt><dd><span class="dm-planned">Planned</span></dd></dl></div>';
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
        let body = '<div class="dm-travel" style="min-height:120px">' + artImg(r.dest === 'ruins' ? 'ruins' : 'rootwild', '') + '<span class="dm-eyebrow">' + esc(RES[r.weaponId] ? RES[r.weaponId].name : WEAPONS[r.weapon].name) + (r.tool ? ' · ' + esc(itemName(r.tool)) : '') + ' · ' + (r.party.length ? r.party.map((p) => COMPANIONS[p].name).join(', ') : 'no companions') + '</span><p style="margin:4px 0 0;font:700 15px/1.35 var(--display);color:#fff1b7">' + esc(r.summary) + '</p></div>';
        body += '<div class="dm-card"><h3>How preparation shaped the journey</h3><div class="dm-list">' + r.lines.map((l) =>
            '<div class="dm-report-line ' + (l.status === 'ok' ? 'ok' : l.status === 'miss' ? 'miss' : '') + '"><span class="dm-mark">' + (l.status === 'ok' ? '✓' : l.status === 'part' ? '~' : '✕') + '</span><span><b>' + esc(l.title) + '.</b> ' + esc(l.text) + (l.status !== 'ok' && l.need ? '<em>Best answer next time: ' + esc(l.need) + '</em>' : '') + '</span></div>').join('') +
            r.discs.map((d) => '<div class="dm-report-line disc"><span class="dm-mark">✦</span><span><b>Discovery: ' + (d === 'fawny' ? 'Fawny joined the Keep' : 'the Sealed Vault Map') + '.</b><em>' + (d === 'fawny' ? 'Assign Fawny from Companions. Fawny favours the Fridge.' : 'Elemental Studies 4 will read it.') + '</em></span></div>').join('') + '</div></div>';
        body += '<div class="dm-card"><h3>Rewards (applied once, on return)</h3><div class="dm-chips">' + gainChips(r.total) + '</div><p class="dm-muted">Haul kept: ' + r.lootPct + '% of the base find' + (r.rations ? ', including ' + r.rations + ' Hearth Rations bonus' : '') + '.</p><div class="dm-chips">' +
            Object.keys(r.xp).map((k) => '<span class="dm-chip good">+' + r.xp[k] + ' ' + esc(SKILLS[k].name) + ' XP</span>').join('') + '<span class="dm-chip good">+' + r.prof + ' ' + esc(WEAPONS[r.weapon].name) + ' proficiency</span>' +
            Object.keys(r.bonds).map((k) => '<span class="dm-chip good">+' + r.bonds[k] + ' bond with ' + esc(COMPANIONS[k].name) + '</span>').join('') + '</div></div>';
        body += '<div class="dm-card is-quiet"><h3>Assignments resumed</h3><p class="dm-muted">' + esc(r.resumed.join(' · ') || 'Nothing to resume.') + '</p></div>';
        body += '<button class="dm-btn block" type="button" data-act="close">Done</button>';
        return { title: 'Back from ' + DEST[r.dest].name, body: body };
    }
    function objectiveSheet() {
        let body = '';
        OBJECTIVES.forEach((ch) => {
            body += '<div class="dm-card"><h3>' + esc(ch.chapter) + '</h3><div class="dm-list">' + ch.steps.map((st) => {
                const done = !!S.obj[st.id];
                return '<div class="dm-enc ' + (done ? 'ok' : st.planned ? 'miss' : 'part') + '"><span class="dm-mark">' + (done ? '✓' : st.planned ? '…' : '•') + '</span><span><strong>' + esc(st.title) + '</strong><small>' + esc(st.hint) + '</small></span><span></span></div>';
            }).join('') + '</div></div>';
        });
        return { title: 'Objectives', body: body };
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
            toast(COMPANIONS[parts[0]].name + ' enjoyed the ' + RES[parts[1]].name + '.');
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
                if (other && other !== id) { toast(COMPANIONS[other].name + ' already helps there.'); return; }
                c.job = { kind: 'help', target: t };
            } else {
                const other = kind === 'knight' && Object.keys(COMPANIONS).find((x) => x !== id && s.comps[x].joined && s.comps[x].job.kind === 'knight');
                if (other) { toast(COMPANIONS[other].name + ' is already assisting the Knight.'); return; }
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
        document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else step(); });
        window.addEventListener('pagehide', save);
        setTab(S.ui.tab || 'keep');
        renderAll();
        if (S.away) openSheet('away'); else maybeShowReport();
        setInterval(step, 1000);
        setInterval(save, 10000);
    }

    // Test hook for headless checks; harmless in the prototype.
    window.dominionDebug = {
        state: () => S, advance: (ms) => { S.offset += ms; advance(S, now()); save(); flushToasts(); renderAll(); maybeShowReport(); }, pass: passTime,
        links: () => links(S.grid), encounter: encounter, save: save, now: now
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
