# Siegelings Roguelike Adventure Mode — Phase 2: Design Proposal

> Deliverable 3: Adventure Mode design. Built on the discovery findings in `01-discovery-report.md`.
> Goal: a node-based roguelike run mode (Slay the Spire / Chaos Zero Nightmare-inspired) that feels
> **native to Siegelings** — notch-board battles, element identity, SiegeKnights, evolution lines —
> not a card-game skin over someone else's loop.

---

## 1. Fantasy & Framing: "The Siegelands Expedition"

The player is a SiegeKnight leading a warband of Siegelings across a corrupted frontier. Each run is
an *expedition*: march node to node through element-themed biomes, fight siege skirmishes on the
notch board, recruit wild Siegelings, evolve your line, and topple the biome's Siegelord (boss).
The player's 50 HP pool from standard matches becomes the run's persistent resource —
**Siege Integrity** — carried between battles and restored at camps. That single change makes every
existing battle mechanic (bounty damage on Siegeling defeat, direct attacks) meaningful at run scale
without touching combat code.

## 2. Core Gameplay Loop

```
Run Setup                     Node Loop                          Run End
─────────                     ─────────                          ───────
Pick SiegeKnight   ──►  View map, pick reachable node  ──►  Final boss defeated → VICTORY
Pick starter kit   ──►  Resolve node:                        or Siege Integrity = 0 → DEFEAT
Pick difficulty          • Battle / Elite / Boss  → rewards        │
(Optional seed)          • Merchant / Camp / Shrine / Event        ▼
      │                  • Treasure / Recruit / Draft …       Run summary screen
      ▼                        │                              Meta payout: Siegecoins,
Generate seeded map            ▼                              Remnants, unlocks,
(Act 1 of 3)             Update run state (deck, relics,     achievements, leaderboard
                         Integrity, Supplies), persist       (seeded runs)
                               │
                               └── act boss → next biome map (Act 2, 3) ──┘
```

**Run setup choices** (mirrors the existing loadout wizard steps):
1. **SiegeKnight** — from knights the player owns; knight level carries in (existing system).
2. **Starter kit** — a curated ~16-card mono/dual-element starter deck + 1 signature relic. Kits are
   unlockables (first three free). *Not* the player's collection: runs build decks from scratch,
   which keeps Adventure fair for new players and preserves the collection game's identity.
3. **Difficulty tier** (§8) and optional **run seed** (text field; blank = random). Entering a seed
   flags the run "seeded" for the future leaderboard.

## 3. Map Structure

A **layered DAG** per act — the structure visible in the reference screenshots (bottom-left minimap):
columns of nodes advancing left→right with branching/merging edges.

- **Act shape:** 12 layers × 2–4 nodes per layer. Layer 0 = fixed entry, layer 5 = guaranteed
  Rest Camp + Mini-Boss pair (checkpoint spine), layer 11 = single Boss node. Every path reaches
  the boss.
- **Generation algorithm:** seeded "walker" method (proven by Slay the Spire):
  1. From the entry node, trace 5 walkers layer-by-layer choosing same/adjacent column; union of
     edges = playable graph (guarantees connectivity, average branching ≈ 2).
  2. Assign node types per layer from a weighted table, with constraint passes: no Elite before
     layer 3, no two identical special nodes adjacent on a path, ≥1 Merchant and ≥1 Recruit
     reachable from every path, Treasure at layer 8.
  3. Deterministic from `(runSeed, actIndex)` — same seed always yields the same map.
- **Branching logic:** player may move to any node connected by an edge from the current node
  (forward only). Unvisited siblings gray out — committed routes create draft-style decisions.
- **Biome progression:** each act has an element-pair theme drawn from the live element catalog,
  e.g. Act 1 *Cinderfields* (Fire/Earth), Act 2 *Drowned Reach* (Water/Ice), Act 3 *Umbral Spire*
  (Shadow/Psychic). Biome controls encounter element weighting, shrine elements, background art,
  and boss identity. Biome sets are data, so live-ops can rotate them.
- **Difficulty scaling:** encounter budget rises per layer and per act (§8); Elites/Bosses add
  modifiers.
- **Encounter weighting (baseline per layer, tunable JSON):** Battle 45%, Event/Mystery 22%,
  Elite 10% (post-layer-3), Merchant 8%, Rest 8%, Recruit 4%, Treasure/Shrine 3%.

### Node type catalog

| Node | Effect |
|---|---|
| **Battle** | Standard fight vs. a curated encounter deck; rewards: Supplies + card draft |
| **Elite Battle** | Encounter with a modifier (§8); rewards: relic + bigger draft |
| **Mini-Boss** | Mid-act named fight; guaranteed rare card + Supplies |
| **Boss** | Act Siegelord with unique deck + 2 modifiers; act-clear reward: relic choice ×3, full Integrity restore |
| **Merchant** | Spend Supplies: cards, relics, card removal, potions/consumables, knight XP scroll |
| **Rest Camp** | Choose one: restore 30% Integrity, **Train** (upgrade a card, §6), or **Commune** (level a shrine blessing). Matches the campfire reference screenshot (free Rest + paid Training interactions) |
| **Treasure** | Free relic or large Supplies cache (small ambush chance on higher difficulties) |
| **Recruit Siegeling** | Add a wild Siegeling line (base + its evolution cards) to the deck — choose 1 of 3, element-weighted by biome |
| **Card Reward / Draft Event** | Pick 1 of 3 (draft: pick 3 of rotating packs of 3) |
| **Ability Shrine** | Attach a permanent move-pool upgrade to one Siegeling card for the run |
| **Evolution Shrine** | Immediately "pre-evolve": the chosen Siegeling's evolution card starts in your opening hand each battle, or gains skipped-stage evolution for the run |
| **Element Shrine** | Biome-element blessing (run-wide passive, e.g. +1 starting energy of that element) |
| **Random Event / Mystery** | Narrative choice node (§7); Mystery = unknown icon that resolves to event/battle/treasure |
| **Checkpoint** | Auto-save marker + free minor heal (layer-5 spine) |
| **Remove Card / Duplicate Card / Upgrade Card** | Deck-sculpting utility nodes (also purchasable at Merchant) |
| **Curse / Blessing Event** | High-stakes events that add a Curse card (dead draw with a payoff to remove) or a run blessing |

## 4. Battles Inside a Run

Unchanged rules, three adventure inputs:

1. **Enemy loadout is scripted, not random** — each encounter definition names a deck (preset-deck
   catalog or literal card list), a trainer, an AI tier, and modifiers.
2. **Siege Integrity in/out** — the player side starts the `GameState` at current run Integrity
   (capped 50); remaining HP writes back after victory. Defeat = run over (with a "Retreat" option
   pre-battle costing Supplies + Integrity on non-boss nodes).
3. **Relic/blessing hooks** — applied at game start (extra opening draw, starting shields, energy
   adjustments) or via the existing recompute-passives pattern during play (§6).

Enemy side always starts at a scripted HP (bosses higher), so fights end by the existing win check.

## 5. Run Economy & Team Progression

- **Supplies** (run-scoped currency, dies with the run): from battles, treasures, events; spent at
  Merchants/Training. Keeps run economy fully separated from Siegecoins/Remnants.
- **During-run rewards:** new cards (drafts, recruits, merchants), card upgrades, relics,
  consumables (single-battle items: heal Integrity, first-battle shield, temporary damage boost),
  elemental blessings, evolution unlocks, temporary buffs from events.
- **Meta payout at run end** (win or lose, scaled by progress + difficulty): Siegecoins, Remnants,
  starter-kit/relic/knight unlock progress, achievements, mission counters. Uses the existing
  idempotent grant path so Adventure feeds — never bypasses — the collection game.

### Siegeling progression during a run

- **Recruiting:** Recruit nodes/merchants add a Siegeling *line* (base + evolutions) so evolution
  placement stays playable. Deck size soft-capped (~30) — at cap, recruiting requires replacing a
  line (**Replacing teammates**).
- **Temporary evolutions:** Evolution Shrine grants "battle-start evolved" for N battles.
- **Permanent (run) evolutions:** Rest-camp Training or shrine choice permanently upgrades a card
  copy (stat bumps or move swap from `moves-pool.json` — the data already exists).
- **Passive abilities / synergies:** element-count thresholds (e.g. 8+ Fire cards in deck = Kindled:
  +1 damage on Fire moves) surfaced as "Warband Synergies" on the run screen; computed from deck
  composition, no combat changes needed beyond a passive hook.
- **Formation bonuses:** reuse the existing notch/connection identity — e.g. blessing "connected
  allies gain +1 HP" is literally the existing `CONNECTED_ALLIES_HEALTH_BOOST` trainer passive
  repackaged as a relic.

## 6. Relic System ("Sigils")

Run-persistent passives displayed in a tray on map + battle HUD. Data-driven
(`resources/adventure/relics.json`): id, name, icon, rarity, trigger, effect key + params.
Two mechanical families keep implementation cheap:

- **Battle-start effects** (applied when the adventure battle's `GameState` is created): extra
  draw, starting temporary energy, starting shields, opening-hand guarantees, enemy handicaps.
- **Recomputed passives** (same pattern as trainer passives): stat boosts filtered by element/row/
  connectivity.

Example pool (each pushes a different playstyle):

| Sigil | Effect | Playstyle |
|---|---|---|
| Emberbrand | Fire cards cost 1 less energy | Fire aggro |
| Glacial Core | FREEZE lasts a second battle phase | Ice control |
| Bulwark Idol | Earth Siegelings gain +2 shield at battle start | Earth wall |
| Galeplume | Wind Siegelings +1 speed (act earlier in queue) | Wind tempo |
| Venom Locket | Poison effects don't expire at battle end | Poison attrition |
| Scout's Horn | Draw 1 extra card in each opening hand | Consistency |
| Field Rations | Restore 3 Integrity after each Elite | Elite hunting |
| Siegewall Banner | All allies +1 shield at battle start | Defensive |
| Lodestone Notch | First placement each battle may ignore adjacency | Placement freedom |
| Duelist's Mark | Your first attacker each battle deals +2 | Alpha strike |
| Reliquary Coin | +25% Supplies from battles | Economy |
| Evolver's Sigil | Evolutions cost no setup action | Evolution rush |
| Trap-smith Kit | Traps trigger one bucket earlier | Trap decks |
| Knight's Oath | SiegeKnight active usable twice per round | Knight-centric |

Rarity tiers (Common/Rare/Boss/Event-only) gate power; pools are seeded-shuffled per run so relic
offerings are reproducible.

## 7. Random Events (30+ concepts)

Data-driven (`resources/adventure/events.json`): narrative text, 2–3 choices, weighted outcomes,
requirements (element in deck, Supplies ≥ X, relic owned), consequences (Integrity/Supplies/cards/
relics/curses). Seeded outcome rolls. Concepts:

1. **Mysterious Merchant** — discounted relic of unknown identity vs. pay to reveal first vs. walk away.
2. **Ancient Shrine** — sacrifice 5 Integrity for a blessing, or defile it for Supplies (chance of curse).
3. **Sleeping Dragon** — sneak past (safe), steal treasure (relic, 50% brutal battle), or wake it (elite fight, guaranteed rare).
4. **Broken Siege Machine** — spend Supplies to repair (permanent +1 first-battle shield) or scrap for parts.
5. **Lost Siegeling** — adopt it (random recruit, may be off-element) or guide it home (Integrity heal).
6. **Traveling Prophet** — learn the next 3 unknown nodes on your path, or a random blessing, for a price.
7. **Corrupted Forest** — walk through (draw a Curse card) or around (lose 8 Integrity).
8. **Haunted Battlefield** — loot (Supplies + chance of Undead ambush) or honor the dead (Undead cards cost −1 this run).
9. **Volcano Forge** — reforge a card (upgrade) at the cost of burns (−6 Integrity), or temper a relic.
10. **Ancient Library** — duplicate any card in your deck, or remove one, or read forbidden text (random ability shrine effect + curse risk).
11. **Elemental Trial** — pass a deck check (≥N cards of biome element) for a big blessing; fail = minor curse.
12. **Wandering Trainer** — pay Supplies for SiegeKnight XP (feeds the existing knight-level system).
13. **Notch Anomaly** — next battle, perimeter sockets grant double energy for both sides — accept or seal it.
14. **Molting Grounds** — one Siegeling line evolves permanently, but a random other card is removed.
15. **Card Sharks** — gamble Supplies double-or-nothing on a coin flip (seeded!), up to 3 rounds.
16. **The Collector** — sells a card *from your own defeated enemies this run* (encounter-history flavor).
17. **Poisoned Well** — drink (heal 15, 30% poison curse) or purify (spend Supplies, small blessing).
18. **Rift in the Map** — skip ahead one layer, landing on a random node.
19. **Siegeling Nursery** — recruit a random *basic* Siegeling of choice element; it hatches (evolves) 2 battles later.
20. **Toll Bridge** — pay Supplies, fight the toll-keeper, or detour (lose Integrity).
21. **Echo of a Past Run** — meet "your previous run's warband" (from saved run summary); win a friendly duel for their signature relic.
22. **Starving Village** — donate Supplies for a blessing + achievement progress, or ignore.
23. **Cursed Reliquary** — take a powerful relic that also adds 2 Curse cards.
24. **Elementalist's Wager** — name an element; if next battle's enemy leads with it, big reward.
25. **Frozen Cache** — Ice-deck check to open safely, else chip it open (−Integrity).
26. **Grave of the Siegelord** — preview the act boss's deck list, or loot the grave (relic + elite ambush chance).
27. **Twin Shrines** — choose Fortune (Supplies) or Fury (damage blessing); the unchosen shrine curses lightly.
28. **Deserter Knight** — recruit a second SiegeKnight passive for 2 battles (temporary dual-knight buff).
29. **Storm Front** — next 2 battles both sides' speed order is reversed — brave it (reward) or wait it out (lose a turn/Integrity tick).
30. **The Curator** — trade any relic for a random rarer relic.
31. **Feast of Embers** — full Integrity restore now, −10 max Integrity this act.
32. **Mirror Pool** — duplicate your rarest card, 25% chance it's a "reflected" cursed copy.

## 8. Difficulty Design

- **Tiers:** *Story* (enemy decks lean basic, AI baseline, +Integrity restores), *Standard*,
  *Veteran* (elites +1 modifier, curated decks, smarter AI targeting), *Nightmare* (boss +2
  modifiers, encounter budget +25%, merchants pricier).
- **Scaling enemy decks:** encounter budget = f(act, layer, tier) buys the encounter's deck from
  rarity/evolution-depth tables; deeper acts field evolved lines and Legendary anchors.
- **Scaling AI:** tiered `AiProfile` (aggression, target-priority quality, spell timing, trap
  usage) wrapped around the existing `AIService` heuristics.
- **Elite modifiers:** *Entrenched* (allies start with 2 shield), *Swift* (+1 speed all),
  *Venomous* (attacks apply poison), *Warded* (first spell each round is nullified), *Bountiful*
  (extra reward).
- **Boss modifiers:** unique scripted decks + auras (e.g. Cinder Lord: all Fire enemies +1 damage;
  Drowned Queen: your back row starts frozen turn 1).
- **Curse mechanics:** Curse cards = dead spells that clog draws; removal via camps/events; some
  relics reward holding curses.
- **Ascension ladder:** post-win difficulty +1..+10 per starter kit (stacking handicaps: less
  starting Integrity, pricier merchants, stronger elites) — cheap replayability, pure data.
- **Endless mode (post-MVP):** after Act 3, loop biomes with rising budget until defeat; leaderboard
  = deepest layer.
- **Challenge runs / weekly mutators (post-MVP):** fixed seed + forced kit + rule mutators
  ("all recruits are random", "no rest camps", "double elites").
- **Daily seed:** seed = date hash, one attempt per user per day, shared leaderboard — the seeded
  determinism requirement (technical plan §3) is designed for exactly this.

## 9. Replayability Systems

Random seeded maps · rotating biome sets · seeded relic pools/events · unlockable starter kits
(element-pair identities) · unlockable Siegelings appearing in adventure pools · unlockable relics ·
adventure achievements/titles (existing achievement/title system) · ascension levels · daily seed
runs + leaderboards · weekly mutators · run-history archive (reuses match-history pattern) feeding
the "Echo of a Past Run" event.
