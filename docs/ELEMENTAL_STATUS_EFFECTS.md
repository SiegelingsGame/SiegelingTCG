# Elemental Status Effects (Affliction Framework)

Negative status badges inflicted by **elemental damage**. This is separate from
ability-keyed statuses (`FREEZE`, `SPEED_ZERO`, shields, buffs) which are
applied by specific effect keys. Afflictions ride on damage of a given element.

**Source of truth:** `com.sieglings.model.ElementalAfflictionCatalog`

## Core rules (battle table)

1. When a damage effect deals **at least 1 HP** (after shield) to a Siegeling, and
   the damage has an element (attacker Siegeling element, else spell
   `requiredElement`), try to inflict that element's affliction.
2. Afflictions are **badge stacks** on the target (`afflictions` on the board
   cell). Each successful inflict adds stacks (default 1), up to a per-status cap.
3. Stacks resolve on the tick phase written in the table. Burn is the prototype:
   at the start of the **afflicted owner's Setup phase**, deal
   `stacks × damagePerStack` flat damage, then clear Burn.
4. Neutral damage never inflicts an affliction.
5. Only statuses with `battleEnabled = true` in the catalog actually inflict /
   tick in battle. The rest are designed here so designers can turn them on
   without inventing new identity.

## Core rules (Siege)

Siege already rolls elemental statuses on damage cards (`statusFor` + chance by
AP cost). That mapping now reads from the same catalog. Siege keeps its own
`StatusKind` runtime and timing (e.g. Burn ticks end-of-round for 1 while the
status lasts) — battle badge stacks and Siege round durations are intentionally
different cadences of the same fantasy.

## Element table

| Element | Affliction | Label | Battle tick | Battle effect (design) | Cap | Clears on tick | Battle live | Siege `StatusKind` | Siege effect (today / planned) |
|---|---|---|---|---|---|---|---|---|---|
| FIRE | `BURN` | Burn | Owner Setup start | Flat **1 damage per stack**, then clear | 5 | yes | **yes** | `BURN` | 1 damage end of each round while active |
| ICE | `CHILL` | Chill | Persistent / Battle | **−1 Speed per stack** (min 0). At cap, also skip next action (freeze-class) | 3 | no (decays 1/round optional) | no | `SLOW` | −2 Speed for 2 rounds |
| EARTH | `STAGGER` | Stagger | Before act | First stack: act last. Cap: skip next action | 2 | consumed on skip | no | `STUN` | Skip next action |
| WIND | `DISORIENT` | Disorient | Owner Setup | Next ability costs **+1 energy** (any element) per stack, then clear 1 | 3 | partial | no | `SHOCK` | Party −1 AP / next hit weakened |
| WATER | `SOAK` | Soak | Persistent | Take **+1** from Electric and Ice per stack; Fire Burn damage on you −1 (min 1) | 3 | no | no | `SOAK` *(planned)* | Extra damage from shock/ice hits |
| ELECTRIC | `SHOCK` | Shock | Owner Setup | Drain **1** of the owner's most-held energy (or act last if none), clear 1 stack | 3 | partial | no | `SHOCK` | Same as Wind mapping today |
| METAL | `RUST` | Rust | On hit taken | Take **+1 damage per stack** from the next damaging hit, then clear 1 | 3 | partial | no | `RUST` *(planned)* | Next hit deals +1 |
| POISON | `TOXIN` | Toxin | Owner Setup | Flat **1 damage per stack**, **keep stacks** (decay 1 if you healed this turn — TBD) | 5 | no | no | `POISON` | 1 damage end of round (siege live with Burn-like tick) |
| SHADOW | `CURSE` | Curse | Owner Setup | Cannot **claim** this Siegeling for temp energy this turn; clear 1 stack | 2 | partial | no | `CURSE` *(planned)* | Reduced healing received |
| PSYCHIC | `DAZE` | Daze | Battle act | Ability energy cost **+1**; at cap, random legal target | 2 | consumed on act | no | `DAZE` *(planned)* | Next card costs +1 AP |
| LIGHT | `BLIND` | Blind | Battle act | Deal **−1 damage per stack** (min 1) on your next damaging ability, then clear | 3 | yes after swing | no | `BLIND` *(planned)* | Next hit weakened |
| UNDEAD | `WITHER` | Wither | Owner Setup | Temporary **−1 max HP per stack** (HP clamped), clear at end of your Setup | 3 | yes | no | `WITHER` *(planned)* | −max HP for the battle |
| NEUTRAL | — | — | — | None | — | — | — | — | — |

## Stack / badge UX

- Board cells expose `afflictions: [{ kind, stacks }]` alongside legacy `statuses`.
- Badges reuse the existing status-badge strip; stack count renders as a number
  (not a `+N` buff).
- Log lines for the Burn prototype:
  - inflict: `"X is burned (Burn xN)."`
  - tick: `"X takes N burn damage (HP: …)."`

## Enabling the next status

1. Set `battleEnabled = true` on the catalog row (and fill tick handler in
   `ElementalAfflictionService`).
2. Add badge palette / SVG / label in `game.js`.
3. If Siege should gain a new `StatusKind`, add the enum value, wire apply/tick
   in `SiegeCombatEngine`, and point `siegeStatusKind` on the catalog row.
4. Add a focused JUnit test; append `progress.md`.

## Non-goals (this framework revision)

- Replacing ability `FREEZE` / `SPEED_ZERO` — those stay effect-key driven.
- Full mechanical implementation of every row — only **Burn** is live in battle;
  Siege keeps its four live statuses and adds **Poison** as the first catalog-driven extension.
