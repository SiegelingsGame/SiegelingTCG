---
name: card-tuning
description: How Siegelings TCG card data flows and how to add or rebalance cards, abilities, spells, traps, and premade decks — generated catalogs, siegling-overrides.json, the Firestore-backed live dashboard, and effect keys. Use for card stat changes, new cards, deck list edits, or dashboard/editor work.
---

# Card data and tuning workflow

## Data precedence (highest wins)

1. **Firestore live overrides** — doc `appConfig/cardOverrides` (project
   `siegelingstcgtesting`, database `siegedb`), edited through the live
   dashboard at `/card-dashboard.html` and round-tripped by
   `CardOverrideEditorService` / `CardOverrideStorageService`. Holds SIEGLING,
   SPELL, and TRAP cards **and** premade decks (`PresetDeckCatalogService`) and
   trainers (`TrainerCatalogService`).
2. **`src/main/resources/cards/siegling-overrides.json`** — hand-authored
   repo overrides, merged by `ManualSieglingCatalog`. Shape documented in
   `CARD_TUNING.md`. Ordered by element, evolution lines grouped.
3. **Generated baselines** — `GeneratedCreatureCatalog`, `GeneratedSpellCatalog`
   in Java.

Also: `resources/cards/moves-pool.json` (shared move/ability pool via
`MovesPoolService`), `live-elements.json` (`LiveElementCatalogService`).

When a card behaves unexpectedly, check layers top-down — a Firestore row may
be shadowing your JSON edit. Locally without Firestore creds the app falls back
to classpath JSON; **on prod**, `GET /api/cards/editor` must report
`source: FIRESTORE` (anything else = broken deploy).

## Editing cards

- **Rebalance an existing card** (HP, speed, notches, cost, rarity, evolution,
  abilities): edit its entry in `siegling-overrides.json`. A card may carry an
  explicit `abilities` array where each ability has its own `requiredElement` /
  `requiredEnergy` — that array is the card's full battle loadout and per-ability
  costs are preserved.
- **Effects** must use registered effect keys (`ABILITY_EFFECT_KEYS.md`,
  `model/AbilityEffectKeys.java`): `damage`, `player_damage`, `heal`, `freeze`,
  `speed_zero`, `damage_boost`, `health_boost`, `speed_boost`,
  `connected_allies_{damage,health,speed}_boost`, `connected_allies_heal`
  (SELF-target; heal restores current HP without raising max Health),
  `destroy`, `move_link`. A new mechanic needs a new key implemented in
  `EffectService` first (see `game-rules` skill).
- **New card**: add the full definition to `siegling-overrides.json` (or via
  dashboard for live). Evolution lines must be complete — deck construction
  requires whole lines (`CardDefinitionServiceTest` enforces).
- **Premade decks**: 40 cards, exactly 20 Sieglings / 10 spells / 10 traps,
  ≤3 copies. Managed in the dashboard's Premade Decks page; only `active`
  decks appear in `/api/game/options`.
- **Legacy gotcha**: old Firestore rows can omit `type`;
  `ManualSieglingCatalog.definitionType(...)` infers SPELL/TRAP from id
  prefixes (`spell_`, `trap_`). Keep new ids prefix-consistent.

## Card rendering

Card faces are drawn client-side (`game.js` + `card-binder-visual.js`) using
element-specific painted frame templates with a binary-search text-fit pass so
descriptions stay inside the painted panel. Compact ability summaries render
icon rows. Art comes from an explicit card-art registry in `game.js` (no
auto-probing — unmapped art 404s were removed deliberately). New art assets go
under `static/images/cards/` or `static/assets/cards/` and must be registered.

## Verification

```bash
./mvnw -q -Dtest=ManualSieglingCatalogTest test     # override merging
./mvnw -q -Dtest=CardDefinitionServiceTest test     # deck invariants
./mvnw -q test
```

For dashboard changes also `node --check js/card-dashboard.js`, bump
`?v=` pins in `card-dashboard.html`, and drive the page headless (see
`ui-change` skill). Confirm `/api/game/options` still returns 200 with the
expected deck count — a malformed card definition can 500 the whole loadout
endpoint. Log the change in `progress.md`.
