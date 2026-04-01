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
- `evolvesFromId`
- `evolvesFromName`
- `costElement`
- `costAmount`
- `notches`
- `ability`
- `abilities`

If you leave a field out, the generated value stays in place.

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
