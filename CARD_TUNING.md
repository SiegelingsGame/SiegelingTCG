# Card Tuning

Manual Siegling edits now live in:

- `src/main/resources/cards/siegling-overrides.json`

The generator still creates the default roster, and this file overrides only the cards you list. That means you can tune one card at a time without rewriting the whole catalog.

## What You Can Override

Each entry can replace any of these fields:

- `name`
- `element`
- `rarity`
- `health`
- `speed`
- `preferredRow`
- `size`
- `evolvesFromId`
- `evolvesFromName`
- `costElement`
- `costAmount`
- `notches`
- `ability`
- `abilities`

If you leave a field out, the generated value stays in place.

## Siegling Size

`size` is `SMALL`, `MEDIUM`, `LARGE`, or `GIGANTIC`. It drives how tall a Siegling stands
where it is drawn at world scale instead of on a card — today the paper cutouts in the Keep
enclave, where a gigantic resident towers over a small one.

Leave it out and the card takes the band its rarity implies:

| Rarity | Default size |
|---|---|
| Common, Uncommon | Small |
| Rare | Medium |
| Epic | Large |
| Legendary | Gigantic |

(Rarity already tracks how far along an evolution line a card sits, so the band follows an
evolution: a base form is small and its final stage grows with the rarity it earns. Evolution
depth only decides cards that carry no rarity at all.)

Set `size` explicitly only for one-off exceptions — the card dashboard's **Size** field on the
Siegeling page writes exactly this key, and its `Auto (…)` option means "leave it out and follow
rarity".

## Example

```json
{
  "cards": [
    {
      "id": "staticap",
      "health": 14,
      "speed": 5,
      "preferredRow": "FRONT",
      "costElement": "ELECTRIC",
      "costAmount": 1,
      "notches": [
        { "direction": "LEFT", "element": "ELECTRIC" },
        { "direction": "RIGHT", "element": "ELECTRIC" },
        { "direction": "TOP", "element": "ELECTRIC" }
      ],
      "ability": {
        "name": "Capacitor Bash",
        "description": "Deal 3 damage to 1 enemy",
        "targetType": "SINGLE_ENEMY",
        "targetCount": 1,
        "effectType": "damage",
        "effectValue": 3,
        "passive": false,
        "requiredElement": "ELECTRIC",
        "requiredEnergy": 1
      }
    }
  ]
}
```

## Multiple Abilities

Use `abilities` when you want a Siegling to have a full custom battle loadout with multiple attacks or support moves.

```json
{
  "id": "staticap",
  "abilities": [
    {
      "name": "Arc Nip",
      "description": "Deal 2 damage to 1 enemy",
      "targetType": "SINGLE_ENEMY",
      "targetCount": 1,
      "effectType": "damage",
      "effectValue": 2,
      "passive": false,
      "requiredEnergy": 0
    },
    {
      "name": "Volt Crash",
      "description": "Deal 5 damage to 1 enemy",
      "targetType": "SINGLE_ENEMY",
      "targetCount": 1,
      "effectType": "damage",
      "effectValue": 5,
      "passive": false,
      "requiredElement": "ELECTRIC",
      "requiredEnergy": 2
    }
  ]
}
```

## Energy-Generating Passives

`energy_boost` makes energy without a notch link or a socket. `targetElement` picks the energy
type; drop it and the card generates its own element.

```json
{
  "id": "staticap",
  "abilities": [
    {
      "name": "Energy Boost",
      "description": "Passively generates 2 Electric energy each turn",
      "targetType": "PASSIVE",
      "targetElement": "ELECTRIC",
      "effectType": "energy_boost",
      "effectValue": 2,
      "passive": true
    }
  ]
}
```

The pool carries the energy for as long as the Siegling is alive on the board. Written with
`"passive": false` (and a `SELF` target) the same key becomes a one-shot action that banks the
energy until that side's next draw.

## Notes

- Use the existing card `id` to override a current Siegling.
- Set `"notches": []` if you want a card to have no notches.
- Set `"costAmount": 0` to clear a play cost.
- `requiredElement` and `requiredEnergy` live on each ability, so different attacks on the same card can have different costs.
- If you use `abilities`, that list becomes the Siegling's explicit battle ability loadout.
- `ability.effectType` values should match the supported engine keys in `ABILITY_EFFECT_KEYS.md`.
- `targetType` values come from `TargetType.java`, and notch directions come from `NotchDirection.java`.

## Where The Base Cards Still Come From

The default roster is still seeded in:

- `src/main/java/com/sieglings/service/GeneratedCreatureCatalog.java`

Preset decks and trainer cards still live in:

- `src/main/java/com/sieglings/service/CardDefinitionService.java`
