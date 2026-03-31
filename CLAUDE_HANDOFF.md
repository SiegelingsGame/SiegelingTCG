# Sieglings TCG – Claude Handoff

## Project Overview
Sieglings TCG is a tactical card game built with Spring Boot 3.2.5 / Java 21 backend and a vanilla JS frontend deployed via Firebase Hosting + Cloud Run.

## Live URLs
- **Frontend:** https://siegelingstcgtesting.web.app
- **Backend:** https://sieglings-tcg-api-324063847257.us-central1.run.app
- **Health check:** https://siegelingstcgtesting.web.app/api/game/options

## Deployment Targets

### Backend – Cloud Run
- Service: `sieglings-tcg-api`
- Region: `us-central1`
- GCP project: `siegelingstcgtesting`
- Docker build: `Dockerfile` (multi-stage, eclipse-temurin:21)
- Env vars: `env.yaml` (CORS origins)

### Frontend – Firebase Hosting
- Project: `siegelingstcgtesting`
- Public dir: `src/main/resources/static`
- Config: `firebase.json` (rewrites `/api/**` → Cloud Run)
- Deploy copy: `.deploy-hosting/static/` (keep synced with source)

## Key Files

### Backend (Java)
| File | Purpose |
|------|---------|
| `src/main/java/com/sieglings/service/GeneratedCreatureCatalog.java` | 121 creatures, point-budget stat system, placement costs |
| `src/main/java/com/sieglings/service/GeneratedSpellCatalog.java` | Element spells + combo spells, destroy spell energy costs |
| `src/main/java/com/sieglings/service/CardDefinitionService.java` | Central card registry, trainers, traps, preset decks |
| `src/main/java/com/sieglings/service/BattleService.java` | 3-tier battle ability system |
| `src/main/java/com/sieglings/service/EnergyService.java` | Board energy/socket calculation |
| `src/main/java/com/sieglings/service/GameService.java` | Game state, phases, turn flow |
| `src/main/java/com/sieglings/model/SieglingCard.java` | Creature model (health, speed, notches) |
| `src/main/java/com/sieglings/model/SpellCard.java` | Spell model (cost, combo requirements) |
| `src/main/java/com/sieglings/model/TrapCard.java` | Trap model (opponent bucket trigger) |
| `src/main/java/com/sieglings/model/enums/Rarity.java` | COMMON, UNCOMMON, RARE, EPIC, LEGENDARY |
| `src/main/java/com/sieglings/model/enums/Element.java` | 13 elements with hex color codes |

### Frontend
| File | Purpose |
|------|---------|
| `src/main/resources/static/index.html` | Main entry point (welcome, loadout, mulligan, game) |
| `src/main/resources/static/js/game.js` | All game logic, rendering, deck builder, card art |
| `src/main/resources/static/css/style.css` | All styling including mobile breakpoints |
| `src/main/resources/static/js/config.js` | API base URL + Firebase config (same-origin for prod) |

### Config / Deploy
| File | Purpose |
|------|---------|
| `firebase.json` | Firebase Hosting config with Cloud Run rewrite |
| `Dockerfile` | Backend container build |
| `env.yaml` | Cloud Run environment variables |
| `progress.md` | Development log / changelog |

## Important Notes

### Stale files – do NOT edit
- `src/main/resources/static/game.js` (legacy, not the live entrypoint)
- `src/main/resources/static/style.css` (legacy, not the live entrypoint)

The active frontend files are in `js/game.js` and `css/style.css`.

### config.js
- Production: `apiBaseUrl: ''` (same-origin, Firebase rewrites to Cloud Run)
- If a tunnel is active, it may temporarily point to a tunnel URL
- Always restore to `apiBaseUrl: ''` after Cloud Run deploy

### Firebase deploy sync
Keep `.deploy-hosting/static/` synced with `src/main/resources/static/` for Firebase Hosting. Run:
```bash
cp -r src/main/resources/static/* .deploy-hosting/static/
```

### Card art
- Card images go in `src/main/resources/static/images/cards/`
- Filename convention: `{cardId}.png` (lowercase)
- `CARD_ART_BY_KEY` registry in `game.js` with auto-probe fallback
- Example: `Staticap.png` mapped via registry (note capital S)

## Game Systems

### Stat Generation (Point Budget)
- Common=25, Uncommon=30, Rare=40, Epic=45, Legendary=55
- Distributed by class: Assassin, Bruiser, Guardian, Mage, Support
- Health base 10, scaling to ~25 for strongest legendaries
- Evolution stages add +3 budget per stage

### Energy / Placement Costs
- Common/Uncommon creatures: 0 energy
- Rare: 1 energy, Epic: 3 energy, Legendary: 5 energy
- All spells: 0 energy (except destroy spells: minimum 3 energy)
- Destroy traps: minimum 3 opponent bucket threshold

### Battle Abilities (3-tier)
- Option 1: 1 energy, baseDmg-1, single target (light strike)
- Option 2: 2-3 energy, signature move (AOE=2 energy, single=3 energy)
- Option 3: 3-5 energy by rarity, finisher (Rare+ only)

### Elements (13)
FIRE, EARTH, WIND, WATER, ICE, SHADOW, ELECTRIC, METAL, UNDEAD, PSYCHIC, POISON, LIGHT, NEUTRAL

### Rarities (5)
COMMON, UNCOMMON, RARE, EPIC, LEGENDARY

## Build & Deploy Commands

```bash
# Build backend
./mvnw -q -DskipTests package

# Run tests
./mvnw -q test

# Deploy backend to Cloud Run
gcloud run deploy sieglings-tcg-api \
  --source . \
  --region us-central1 \
  --project siegelingstcgtesting \
  --env-vars-file env.yaml

# Deploy frontend to Firebase
firebase deploy --only hosting --project siegelingstcgtesting

# Verify
curl https://siegelingstcgtesting.web.app/api/game/options
```
