# Siegeknight Chronicles — playable first version

`/chronicles` is an idle RPG built from the "Siegeknight Chronicles" design concept.
This first version follows that design's own playable-first-version scope:
the five classes, the four Tier I elements as the playable lands, about eight
professions, two dungeons and a handful of bond techniques. It is a separate mode
with its own save. My Keep is untouched, and the Knight tab links to it as the
home base.

## Where things live

| Piece | File |
|---|---|
| Content and balance (professions, unlock web, activities, recipes, items, weapons, techniques, synergies, routes) | `src/main/java/com/sieglings/chronicles/ChroniclesContent.java` |
| Save shape (one JSON doc, epoch-millis times) | `ChroniclesState.java` |
| Firestore store, `playerChronicles/{userId}` (override with `app.user-data.collection-chronicles`) | `ChroniclesStore.java` |
| Guilds and marketplace (`chroniclesGuilds`, `chroniclesMarket`; every write a transaction) | `ChroniclesRealm.java`, `ChroniclesRealmStore.java` |
| Expedition simulator (seeded and deterministic) | `ChroniclesCombat.java` |
| Rules, settle-on-read, snapshot | `ChroniclesService.java` |
| REST API, `/api/chronicles/**` | `ChroniclesController.java` |
| Class and evolution access to the RBX seed table | `src/main/java/com/sieglings/service/CreatureRegistry.java` |
| RBX wild behaviours (`gentle`/`skittish`/…) by Siegeling id | `src/main/resources/chronicles/rbx-behaviors.json` |
| Page | `static/chronicles.html`, `static/js/chronicles.js`, `static/css/chronicles.css` |
| Tests | `src/test/java/com/sieglings/chronicles/` |

## What is canonical (from SiegelingsRBX)

- **Creatures.** Elements, classes, rarities and evolution lines come from `GeneratedCreatureCatalog`, which already mirrors `CreatureData.lua`.
- **The four starters.** Cacty (Earth Bruiser), Pursula (Wind Assassin), Sundile (Fire Guardian) and Fawny (Ice Mage), so each has its own element and class. The classes of Pursula and Fawny come from `ChroniclesContent.CLASS_OVERRIDES`, which applies only in Chronicles. Their evolutions keep their own classes.
- **Base stats.** `RarityStatBudget` × `ClassStatWeights` + `ElementStatBias`.
- **Level caps.** 10 for base forms, 25 for first evolutions, 50 for finals (`GameConfigData.lua`).
- **Synergies.** The two- and three-member tiers and their names (Ember/Inferno, Shield/Bastion, …), with their bonus percentages.
- **Wild behaviours.** 83 of the 130 TCG Siegelings have an RBX behaviour. The rest fall back to a class default.
- **Element chart.** The battle table's own chart (`EffectService.isWeakTo`).

## Systems in this version

- **Siegeknight.** Rank 1–100, fed by a quarter of all knight XP; rank opens destinations. Weapon, armor and relic slots.
- **Work screen.** It is laid out like Melvor: one page per profession. A Gathering/Crafting switch picks the type, a row of profession tabs shows each level, and each page is a grid of task cells. A cell shows its required level and XP. The running task's cell is lit and shows live progress, and a strip at the top shows it on every page, with Rest. On crafting pages, tapping a cell selects it in a detail panel with its inputs and Make/Work idly/Forge buttons. The profession glyphs and hues are presentation only (`SKILL_LOOK` in `chronicles.js`).
- **Professions.** All 21 from the design, each 1–100, in an unlock web:
  - Gathering: Mining; Woodcutting; Foraging; Fishing (Carpentry 3); Excavation (Mining 10).
  - Production: Smelting (Mining 5); Smithing (Smelting 10); Carpentry (Woodcutting 5); Weaving (Foraging 10); Cooking (Fishing 3); Alchemy (Foraging 8); Runecrafting (Elemental Studies 10 + Smelting 5).
  - Siegeling: Taming; Bonding (Taming 3); Husbandry (Bonding 10 + Cooking 5).
  - Expedition: Pathfinding; Survival (Rank 3); Cartography (Pathfinding 5); Command.
  - Knowledge: Elemental Studies (Rank 5); Class Tactics (Command 5).

  A profession practised before its prerequisites moved stays open (Smithing used to follow Mining 5). A locked profession earns no XP and gives no effect.
- **Profession effects.**
  - Pathfinding shortens expeditions (up to 30%). Survival cuts hazard damage (up to 60%). Cartography improves finds; at 10 the company never gets lost, and at 25 it finds hidden rooms.
  - Husbandry improves rest between battles and raises the daily treat cap. Bonding levels from bond earned and multiplies it.
  - Elemental Studies boosts all affinity gains, and its idle "study" sessions turn essences into affinity. Class Tactics fills the command gauge faster; at 10 it enables cross-class techniques.
  - Command 3 and 10 open the second and third company slots; Command 30 opens a reserve.
- **New crafts.** Planks and Snare Crates (Carpentry). Linen, rope, the Linen and Ember Robes (Mage boosts) and the doc's Breezewoven Net (Weaving). The Guardian Harness. Runes (Runecrafting): one per expedition, spent on the road, strengthening its element or the whole company. Restoring Ancient Relics from relic shards. Excavation digs fossils, rune stones and relic shards.
- **Elemental affinity.** All 12 elements are tracked with the design's milestone names. It grows from battles fought by Siegelings of that element, from exploring that element's land, from helper work, and from taming. Affinity 10 unlocks that element's Familiarity technique, prepared one at a time and active only when that element is in the company. Some recipes are gated on affinity, e.g. the Embersteel Lance needs Fire 20 plus Guardian Mastery 10.
  - **Attunement (25).** In that element's lands, hazards are halved and finds +25%; taming Siegelings of that element +5%.
  - **Resonance (50).** The element's technique reaches the whole company at 1.5x.
  - **Convergence (75).** The design's six combos (Steam Veil, Thunderglass, Frozen Tempest, Toxic Bloom, Dawnfire, Eclipse Binding) go in a second prepared slot. They need both elements at 75 and both in the company, and each adds a battle mechanic: damage cut, advantage barriers, slow plus Assassin boost, spreading poison, radiant healing, or turn disruption.
  - **Ascendance (100).** A title, plus the element's named signature (Infernal Surge, Absolute Frost, …). It fires once per expedition at the start of the hardest battle: a burst, a sanctuary heal and barrier, or a lost enemy round.
- **Class mastery.** Five paths, each giving a stat bonus to that class. Five cross-class techniques unlock at 20 in both classes when both are fielded.
- **Weapon disciplines.** Six. The knight does not attack: a command gauge fires the weapon's command on a chosen trigger (as soon as ready, ally low, elites, or bosses), and the gauge carries between battles.
- **Individual bonds.** Each tamed Siegeling is its own individual, with a bond from 0 to 100 and milestones (Stranger → Knightbound). Bond 10, 25, 75 and 100 add stats. Bond 50 unlocks a class×element technique named from the element and class, e.g. Cinder Aegis (Fire Guardian) and Rooted Resolve (Earth Bruiser). Treats give bond; favourite foods give double, up to 5 treats a day.
- **Expeditions.** Eleven routes: patrols, hunts, a resource haul, and two dungeons. Cinder Hollow has heat attrition; Old Rootcrypt has a maze and a hidden room unlocked by Foraging. Tactics cover retreat threshold, potion threshold, command trigger and the prepared technique. Each expedition is simulated at launch from a seed, and the server releases timeline entries only as their time passes.
- **The wider world (Phase 4).** 32 routes across the design's four tiers.
  - **Tier II, Outer Frontiers.** Tidewater Coast (Water) and Stormspire Peaks (Electric): patrols, hunts, the Sunken Grotto and Thunderhold dungeons. Each needs Survival 10–22, with tide and storm hazards warded by Water/Ice or Metal/Earth Siegelings and the Tidewarden or Stormward Cloak. Coral Shallows and Stormglass Vein are gathering nodes; the Pearl Staff and Stormglass Hammer are tier-3 gear.
  - **Tier III, Forgotten Regions.** Umbral Caves (Shadow), Mirage Expanse (Psychic), Forge Wastes (Metal) and Ashen Crypts (Undead), each with a hunt and a dungeon. Each has a twist:
    - Ambush: +30% enemy damage in round 1.
    - Mirage: 1 company turn in 7 wasted.
    - Plated Foes: +30% enemy defense.
    - Restless Dead: enemies rise once at 30%.

    Each twist is countered by the right element, or by a Runecrafting relic made from that region's material (Dawn Lantern, Clarity Charm, Alloy Breaker, Grave Ward). Sunspire Sanctum (Light, Radiance) and Blight Marsh (Poison, Blight) are defined but **sealed**: the catalog has no Light or Poison Siegelings yet, and they open on their own once it does (their bosses use `auto`, the strongest of the element).
  - **Tier IV, Legendary Expeditions.** Multi-element trials gated on high affinities, against legendary bosses: Pylord, Thunderlord, Voidmaw, and Aerovane in the hidden Skyreach Ruins (Cartography 50).
  - **Grand Expeditions** (4/6/8h) span every land of a tier. **Hidden routes** (Sunken Mossway at Cartography 10, Skyreach Ruins at 50) appear only once found.
  - Later tiers field stronger wilds (Tier III ×1.7 health and ×2.7 attack, Tier IV ×1.6 and ×2.3), with mixed-element pools. Taming only ever finds base forms; rarer ones appear deeper in.
- **Taming.** Hunts spot wild Siegelings, and each trail lasts 48h. There are three approaches: patient (uses Taming skill), lure (crafted, element-matched lures work best), and partner (a same-element Siegeling at Bond 10+). Odds shift by the RBX behaviour.
- **Evolution.** Requires the level cap plus essences, and an Ancient Relic for final forms. It keeps the individual's id, bond and history, and the class can change.
- **Idle.** One knight activity (gathering or repeatable crafting) runs alongside one company expedition. Offline accrual is capped at 12h, and a helper Siegeling speeds a matching activity and earns bond. A "While you were away" report opens only after a real absence (5+ minutes).
- **The realm (multiplayer).**
  - **Crowns.** Chronicles' own coin, deliberately separate from Siegecoins, earned at 2 per enemy level in won battles.
  - **Guilds.** Rank 10 to found, joined by a 6-character code, up to 20 knights. Members donate bars, planks, rope, tonics, rune stones and relics to raise siege defenses (5 levels, +10% to every sortie each).
  - **Siege Operations.** A new threat each ISO week, rotating through six. Its health scales with members (at least three) × 150 × average rank, so about a sortie a day per knight breaks it at any stage. Members send their company on one of three fronts: Assault (Bruisers and Mages), Supply Line (Guardians and Supports) or Scouting (Assassins and Wind), at its own size and level. Favoured Siegelings add +25% each, up to +75%. When the threat breaks, every contributor claims 500 crowns, 2 Ancient Relics and 10 of its essence, once.
  - **Marketplace.** List tradeable items (never Siegelings; worn gear keeps one), held in escrow. Buyers pay crowns; sellers collect the price less 5% on their next visit. Up to 10 open listings each, and cancelling returns the goods.
- **Full equipment.** The design's six slots: weapon, armor, relic, helmet, boots and accessory.
  - Helmets add hazard armor (the Stormglass Visor also wards storms).
  - Boots shorten the road (Galeweave Boots also quicken the company; Tidewalker Boots ward tides).
  - Accessories give a company edge: the Mending Amulet (rest), Hunter's Ring (crit) and Prism Pendant (command gauge).
- **Endgame.**
  - **Grandmaster** (any profession at 100): a title, its own actions 20% faster, and four masterwork recipes (Siegeforged Blade, Heartwood Grandbow, Grandmaster's Mantle, Runeheart).
  - Class mastery at 100 grants "Master of the … Path".
  - **Legendary Bond Trials.** At Bond 100 a Siegeling faces a solo trial: two fights against its own echo (which only attacks), then the strongest of its element, scaled to the hero's own rarity. No potions are allowed; retries are free. Passing makes it a **Legend**: a golden aura, +5% to every stat, and one more use of its bond technique per battle. Seeded probes give every tested hero a 33–100% chance.
- **Home base.** Six buildings from the design, each with five levels. Every level needs Siegeknight rank (2/6/12/20/30) and materials from several professions.
  - Sanctuary: +3 roster space per level, and resting Siegelings gain bond hourly.
  - Knight's Forge: Smelting, Smithing and Carpentry 6% faster per level.
  - Alchemy Garden: grows sunleaf, flax, frostbloom and galeberry offline; Alchemy and Cooking faster.
  - War Room: a saved-loadout slot per level, and the command gauge starts 10% charged per level.
  - Expedition Stable: +4 potion capacity and +2% rest per level.
  - Research Library: +2.4h offline cap per level (24h at 5), faster studies, +2% affinity.

  Base income settles from timestamps under the same offline cap. A loadout restores the party, reserve, gear and tactics, skipping anything no longer owned.

## Deferred (designed, not built yet)


Balance numbers are first-pass. `ChroniclesBalanceTest` pins the curve:
- every starter usually clears the first patrol;
- an under-levelled company can't clear Cinder Hollow;
- an evolved, appropriately levelled company can.
