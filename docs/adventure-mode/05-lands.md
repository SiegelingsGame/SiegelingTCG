# Siege Lands

Each expedition segment now takes place in a server-selected Land. The first Land is elemental. Defeating a boss rolls a different Land for the next eight-row segment; later segments can roll a Rare Land or the Badlands. The chosen Land and its history are checkpointed, so refreshing or resuming cannot reroll it.

## Elemental Lands

The twelve elemental Lands cover every active non-neutral element. Matching Siegelings receive a terrain bonus at battle start and have four times the normal selection weight in recruits, broker stock, card prizes, and enemy palettes. Other elements remain eligible.

| Land | Element | Terrain | Featured map content |
| --- | --- | --- | --- |
| Emberfall | Fire | +1 Attack | Ember Forge |
| Frostveil | Ice | +5 Shield | Frost Shelter |
| Zephyr Reach | Wind | +2 Speed | Sky Caravan |
| Rootwild | Earth | Restore 4 HP | Root Refuge |
| Tideglass | Water | Restore 4 HP | Tide Traders |
| Stormspire | Electric | +2 Speed | Storm Beacon |
| Ironhold | Metal | +5 Shield | Iron Foundry |
| Gloamwood | Shadow | +1 Attack | Veil Broker |
| Hollow March | Undead | +5 Shield | Grave Lantern |
| Dreamfold | Psychic | +2 Speed | Dream Oracle |
| Venomfen | Poison | +1 Attack | Fen Broker |
| Dawnhaven | Light | Restore 4 HP | Dawn Sanctuary |

Each Land also supplies a named event with choices tailored to its terrain. Land features replace some ordinary battle nodes while preserving the route, rest row, and boss row.

## Rare Lands

- Obsidian Grove favors Fire and Earth, grants +1 Attack, and features the Rootfire Forge.
- Aurora Expanse favors Ice and Wind, grants +2 Speed, and features the Aurora Shrine.
- Gilded Hollow is drop-focused: it grants 50% more earned gold and adds an item option to every battle reward.

After the first boss, Rare Land chance starts at 18% and rises by four percentage points per boss, capped at 30%. Only Lands supported by the live element catalog can roll.

## The Badlands

Badlands enemies have 25% more HP and deal 15% more damage. The zone pays 25% more gold, features extra Elite encounters, and grants one persistent boon on entry:

- Ashen Resolve restores HP and grants Shield to allies below half health at turn start. It is stronger while in the Badlands.
- Riskrunner grants opening AP when enemies act first. It grants an additional AP while in the Badlands.
- Defiant Spoils improves Elite and boss gold. In the Badlands, those victories also grant an item.

Badlands chance starts at 7% after the first boss, rises by two percentage points per boss, and caps at 12%. Travel is paused until the boon is selected, including after restoring a saved run.

## Presentation

The map shows only the active Land's eight-row chapter. Its banner opens a keyboard-accessible rules panel, and the scroll area uses the matching generated background. All sixteen production WebP backgrounds live in `src/main/resources/static/img/lands/`; their built-in ImageGen prompts are recorded in `lands-imagegen-prompts.json`.
