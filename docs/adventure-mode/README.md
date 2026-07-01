# Adventure Mode — Discovery & Design Package

Discovery-first deliverables for the single-player Roguelike Adventure Mode
(Slay the Spire / Chaos Zero Nightmare-inspired). **No implementation code is included** — per the
task brief, implementation starts only after this package is reviewed and approved.

| Document | Contents |
|---|---|
| [`01-discovery-report.md`](01-discovery-report.md) | Full architecture discovery: project structure, state/scene/save/battle/card/deck/ability/currency/reward systems, existing battle flow end-to-end, save-data audit, UI screen inventory, asset audit, reuse map |
| [`02-design-proposal.md`](02-design-proposal.md) | Adventure Mode design: gameplay loop, node-map structure & generation, node catalog, run economy, Siegeling/team progression, relic ("Sigil") system, 32 event concepts, difficulty tiers/ascension, replayability systems |
| [`03-technical-plan.md`](03-technical-plan.md) | Architecture proposal, new vs. reused systems, folder/file organization, data-model & class diagrams (Mermaid), complete run flowchart, determinism/seeding strategy, 4-phase milestone plan with complexity/risk, risks & refactoring recommendations, architecture improvement opportunities |

## Headline findings

- The existing battle engine can power adventure encounters **unchanged**; the only core-code seam
  needed is one additive `GameService.newAdventureGame(...)` entry point (explicit enemy loadout,
  HP overrides, seeded RNG).
- Persistence, rewards, catalogs, and UI ceremonies (loadout wizard, pack reveal, game-over screen)
  all have the right shape to be reused; Adventure adds new Firestore collections and one new
  frontend page rather than reshaping anything.
- The four genuine gaps — seeded deterministic RNG, a durable run-state layer, map generation/UI,
  and tiered AI/encounters — are exactly what the Phase 1–3 milestones build, in that order.
- Adventure Mode ships as an isolated `com.sieglings.adventure` module behind an
  `app.adventure.enabled` flag, so it can be disabled without touching standard gameplay.
