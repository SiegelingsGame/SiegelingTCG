# Elemental Status Effects (Affliction Framework)

Negative status badges inflicted by **elemental damage**. Separate from
ability-keyed statuses (`FREEZE`, `SPEED_ZERO`, shields, buffs). Afflictions
ride on damage of a given element.

**Source of truth:** `com.sieglings.model.ElementalAfflictionCatalog`

All non-neutral rows are `battleEnabled = true` and live in standard battle.

**Master switch:** `app.battle.elemental-afflictions-enabled` in
`application.properties` (default `true`). Set to `false` to disable inflict,
Setup ticks, cost taxes, Soak/Rust/Blind/Toxin/Curse, and Chill speed — without
deleting the framework. Runtime reads {@code ElementalAfflictions.isEnabled()}.

---

## Shared inflict rules

1. When a damage effect deals **≥1 HP** (after shield) to a Siegeling, and the
   damage has an element (attacker Siegeling element, else spell
   `requiredElement`), add **1 stack** of that element's affliction (up to cap).
2. Neutral damage never inflicts.
3. Badges live on the target as `afflictions: [{ kind, stacks }]`.

---

## Battle turn loop (where each status fires)

```
DRAW → SETUP → BATTLE → (opponent DRAW → SETUP → BATTLE) → …
```

| Window | When | Statuses that care |
|---|---|---|
| **Inflict** | Any HP damage of that element | All (add stacks) |
| **Owner Setup start** | Afflicted owner finishes Draw → enters Setup | Burn; Ice freeze thaw; (Wither if kept) |
| **Setup actions** | Place / claim / evolve / cast | Curse blocks claim & evolve |
| **Heal attempts** | Any heal targeting the unit | Toxin converts heal → stack removal |
| **Battle queue build** | Battle phase starts / order built | Earth (2 stacks → bottom); Ice slow |
| **Paying for an ability** | Unit tries to use an ability | Shock (spend cap); Wind (lowest-cost +1); Blind (effect values) |
| **On hit taken** | Unit takes attack damage | Soak (+dmg); Rust (only from Metal, then clear) |
| **On reaching stack cap** | Stack count hits threshold mid-inflict | Ice (3 → freeze); Insight (3 → opponent draws & clear) |

---

## Element table (quick reference)

| Element | Affliction | Cap | Battle live |
|---|---|---|---|
| FIRE | Burn | 5 | **yes** |
| ICE | Chill | 3 | **yes** |
| EARTH | Stagger | 2 | **yes** |
| WIND | Disorient | 3 | **yes** |
| WATER | Soak | 5 | **yes** |
| ELECTRIC | Shock | 5 | **yes** |
| METAL | Rust | 3 | **yes** |
| POISON | Toxin | 5 | **yes** |
| SHADOW | Curse | 2 | **yes** |
| PSYCHIC | **Insight** | 3 | **yes** |
| LIGHT | Blind | 3 | **yes** |
| UNDEAD | Wither | 3 | **yes** |
| NEUTRAL | — | — | — |

---

## Per-status battle contracts (step by step)

### FIRE — Burn

**Inflict:** Fire damage that deals HP → +1 Burn (cap 5).

**During Battle / opponent’s turn:** badges sit; no damage yet.

**Owner Setup start:** deal `stacks × 1` flat damage, then **clear all Burn**.

---

### ELECTRIC — Shock

**Inflict:** Electric damage that deals HP → +1 Shock (cap 5).

**What it does:** the shocked Siegeling’s **personal energy budget** for paying
its abilities is reduced by 1 per Shock stack. The owner’s energy pool is
unchanged — only what *this card* may spend.

Example: owner has 8 Earth energy, card has Shock ×1 → that card may only spend
7 total energy on its ability. Shock ×2 → spend cap 6.

**When:** checked when the card tries to pay for an ability (Battle, or any
phase an ability is paid for). Does not drain the pool up-front.

**Clear:** stacks persist until spent down by design TBD / cleanse; not
auto-cleared on use in this revision.

---

### POISON — Toxin

**Inflict:** Poison damage that deals HP → +1 Toxin (cap 5).

**While any Toxin remains:** the Siegeling **cannot gain HP from heals**.

**When a heal would resolve on it:** instead of restoring HP, remove Toxin
stacks equal to the heal amount (1 HP worth of heal → −1 Toxin). Overflow heal
after stacks hit 0 is lost for that application (stacks gone mid-heal → further
heal in the *same* application does not restore HP; the next heal can).

**Once Toxin is 0:** healing works normally again.

---

### WIND — Disorient

**Inflict:** Wind damage that deals HP → +1 Disorient (cap 3).

**What it does:** increases the **energy cost of this Siegeling’s lowest-cost
ability** by 1 per Disorient stack. If several abilities share that lowest cost,
pick the earliest in the card’s ability order (printed / list order).

Example: abilities cost 1, 1, 3; Disorient ×1 → the first cost-1 ability becomes
cost 2; the second cost-1 and the cost-3 are unchanged.

**When:** cost is raised when presenting / paying that ability in Battle.

---

### SHADOW — Curse

**Inflict:** Shadow damage that deals HP → +1 Curse (cap 2).

**While any Curse badge remains:**

- Cannot **claim** this Siegeling for temporary energy in Setup.
- Cannot **evolve** onto / with this Siegeling.

**Clear:** design TBD (persist until cleansed, or −1 at end of Setup); blocking
applies whenever stacks > 0.

---

### WATER — Soak

**Inflict:** Water damage that deals HP → +1 Soak (cap 5).

**On hit taken:** any **attack** that deals damage to this Siegeling deals
**+1 damage per Soak stack**. Soak ×2 → that attack deals +2.

Applies to Siegling ability damage and other attack-shaped hits; not to Burn
Setup ticks unless those are later classified as attacks.

**Clear:** persists while stacks remain (no auto-clear on hit).

---

### EARTH — Stagger

**Inflict:** Earth damage that deals HP → +1 Stagger (cap 2).

| Stacks | Effect |
|---|---|
| 1 | **Nothing** (badge only) |
| 2 | This Siegeling is moved to the **bottom of the battle queue** |

**When:** when the 2nd stack is applied, and/or when Battle order is built while
at 2 stacks — unit acts after everyone else that round.

---

### ICE — Chill

**Inflict:** Ice damage that deals HP → +1 Chill (cap 3).

| Stacks | Effect |
|---|---|
| 1–2 | **Slow:** −1 effective Speed per stack (affects Battle order) |
| 3 | **Freeze:** unit cannot act; stays frozen until its **owner’s next Setup**, then Freeze/Chill clears |

At 3 stacks the unit is frozen for the rest of the current Battle (skips its
action) and through the opponent’s turn if needed, thawing when the owner
enters Setup.

---

### PSYCHIC — Insight *(renamed from Daze)*

**Inflict:** Psychic damage that deals HP → +1 Insight (cap 3).

**At 3 stacks:** the **player who inflicted the stacks** (Psychic attacker’s
side) **draws 1 card**, then **all Insight stacks on that target are consumed**.

Stacks 1–2 have no other combat penalty — Insight is a payoff threshold for
landing Psychic hits.

---

### LIGHT — Blind

**Inflict:** Light damage that deals HP → +1 Blind (cap 3).

**While Blinded:** this Siegeling’s ability **effect values** (damage, heal,
shield amounts, etc. — the “AP” / power numbers on its abilities) are reduced
by **1 per Blind stack** (floor at 0, or min 1 for damaging abilities when
implemented).

**When:** applied when the ability’s value is calculated in Battle.

---

### METAL — Rust

**Inflict:** Metal damage that deals HP → +1 Rust (cap 3).

**Vulnerability:** the next **Metal (Rust-element) attack** against this
Siegeling deals bonus damage (**+1 per Rust stack**), then **clears all Rust**
on that target.

Other elements’ attacks do **not** consume or benefit from Rust.

---

### UNDEAD — Wither

**Inflict:** Undead damage → +1 Wither (cap 3).

**Owner Setup:** clamp current HP as if max were −1 per stack (overflow lost),
then clear Wither.

---

## Siege mapping

Siege uses `StatusKind` with its own timing (chance on damage cards, round
durations). `statusFor(Element)` reads this catalog. **All rows below are wired
in `SiegeCombatEngine`.**

| Element | Siege `StatusKind` | Siege contract |
|---|---|---|
| FIRE | `BURN` | End-of-round 1 dmg while active |
| ICE | `SLOW` | −2 Speed for 2 rounds; **reapply while Slow → also Stun** (freeze) |
| EARTH | `STUN` | Skip next action |
| WIND | `DISORIENT` | Owner's cards cost +1 AP while active |
| ELECTRIC | `SHOCK` | Player: −1 party AP then clear; Enemy: next hit −2 dmg then clear |
| WATER | `SOAK` | Incoming attacks deal +1 while soaked |
| METAL | `RUST` | Next **Metal** hit +1, then clear Rust |
| POISON | `POISON` | End-of-round 1 DoT; heals / max-HP surges clear Poison instead of restoring HP |
| SHADOW | `CURSE` | Cannot evolve while Cursed |
| PSYCHIC | `INSIGHT` | First hit marks; second hit → inflicter draws 1 (player) or heals 2 (enemy), then clear |
| LIGHT | `BLIND` | Outgoing ability values −1 while blinded |
| UNDEAD | `WITHER` | On owner's turn open: −1 current HP (min 1 left), then clear |

Battle badge stacks and Siege round durations stay different cadences of the
same fantasy.

---

## Enabling a new status

1. Add/adjust catalog row + battle hooks in `ElementalAfflictionService` as needed.
2. Badge art/label in `game.js` if missing.
3. Siege: wire apply/tick in `SiegeCombatEngine` for that `StatusKind` + hand preview in `SiegeService`.
4. Focused JUnit + `progress.md`.
