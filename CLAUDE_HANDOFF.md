# Sieglings TCG Handoff

This file is the shared handoff for assistant-driven work on this project.
It is written so Claude, Codex, or another coding assistant can make updates
without having to rediscover the deployment and architecture setup.

## Project Identity

- Project name: `Sieglings TCG`
- Repo root: `A:\New folder\OneDrive\Desktop\Sieglings\sieglings-tcg`
- Stack:
  - Backend: Spring Boot
  - Frontend: static HTML/CSS/JS served by Spring Boot and Firebase Hosting
  - Persistence: file-backed H2 + JPA
  - Live backend: Cloud Run
  - Live frontend: Firebase Hosting

## Live Environments

- Live frontend: [https://siegelingstcgtesting.web.app](https://siegelingstcgtesting.web.app)
- Firebase app domain: [https://siegelingstcgtesting.firebaseapp.com](https://siegelingstcgtesting.firebaseapp.com)
- Live backend canonical URL: [https://sieglings-tcg-api-324063847257.us-central1.run.app](https://sieglings-tcg-api-324063847257.us-central1.run.app)
- Cloud Run routed URL in Firebase Hosting rewrites currently resolves to:
  - service: `sieglings-tcg-api`
  - region: `us-central1`
  - GCP project: `siegelingstcgtesting`

## Important Deployment Facts

- Firebase Hosting is configured in [firebase.json](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/firebase.json).
- Hosting serves `src/main/resources/static`.
- Hosting rewrites `/api/**` to the Cloud Run service `sieglings-tcg-api` in `us-central1`.
- The frontend should stay on same-origin API calls.
- That is controlled in [src/main/resources/static/js/config.js](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/js/config.js) with:
  - `apiBaseUrl: ''`

## Primary Files To Edit

These are the real live frontend entrypoints:

- [src/main/resources/static/js/game.js](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/js/game.js)
- [src/main/resources/static/css/style.css](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/css/style.css)
- [src/main/resources/static/index.html](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/index.html)
- [src/main/resources/static/js/config.js](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/js/config.js)

Important backend files often touched:

- [src/main/java/com/sieglings/controller/GameController.java](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/java/com/sieglings/controller/GameController.java)
- [src/main/java/com/sieglings/service/GameService.java](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/java/com/sieglings/service/GameService.java)
- [src/main/java/com/sieglings/service/EnergyService.java](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/java/com/sieglings/service/EnergyService.java)
- [src/main/java/com/sieglings/service/BattleService.java](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/java/com/sieglings/service/BattleService.java)
- [src/main/java/com/sieglings/service/CardDefinitionService.java](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/java/com/sieglings/service/CardDefinitionService.java)
- [src/main/java/com/sieglings/service/GeneratedCreatureCatalog.java](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/java/com/sieglings/service/GeneratedCreatureCatalog.java)
- [src/main/java/com/sieglings/service/GeneratedSpellCatalog.java](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/java/com/sieglings/service/GeneratedSpellCatalog.java)

## Files That Exist But Are Stale

These old files still exist but are not the active frontend entrypoints:

- [src/main/resources/static/game.js](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/game.js)
- [src/main/resources/static/style.css](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/style.css)

Do not mistake those for the current app unless intentionally cleaning up legacy files.

## Build and Local Run

From repo root:

```powershell
.\mvnw.cmd -q -DskipTests compile
.\mvnw.cmd -q test
.\mvnw.cmd -q -DskipTests package
```

Run locally:

```powershell
java -jar target\sieglings-tcg-0.1.0-SNAPSHOT.jar
```

Local app URL:

- [http://127.0.0.1:8080](http://127.0.0.1:8080)

Useful local verification:

- [http://127.0.0.1:8080/api/game/options](http://127.0.0.1:8080/api/game/options)

## Backend Deploy Workflow

Backend deploys to Cloud Run using the repo [Dockerfile](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/Dockerfile).

Environment variables come from:

- [env.yaml](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/env.yaml)

Typical backend deploy flow:

```powershell
gcloud builds submit . --tag us-central1-docker.pkg.dev/siegelingstcgtesting/cloud-run-source-deploy/sieglings-tcg-api:deploy-<timestamp>
gcloud run deploy sieglings-tcg-api `
  --image us-central1-docker.pkg.dev/siegelingstcgtesting/cloud-run-source-deploy/sieglings-tcg-api:deploy-<timestamp> `
  --region us-central1 `
  --project siegelingstcgtesting `
  --allow-unauthenticated `
  --env-vars-file env.yaml
```

Notes:

- The Dockerfile already normalizes `mvnw` line endings for Linux builds.
- If local package fails because the jar is locked, stop any running local `java -jar` process first.

## Frontend Deploy Workflow

Firebase Hosting serves directly from:

- [src/main/resources/static](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static)

When frontend files change:

1. Update cache-bust versions in [index.html](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/index.html)
2. Deploy Hosting
3. Verify hosted HTML is serving the new versions

If Firebase CLI is available:

```powershell
firebase deploy --only hosting
```

If Firebase CLI is not available, Hosting can still be deployed through the Firebase Hosting REST API by:

1. Creating a site version
2. Populating files from `src/main/resources/static`
3. Finalizing the version
4. Creating a release

## Public Verification Checklist

After deploy, check:

- [https://siegelingstcgtesting.web.app/api/game/options](https://siegelingstcgtesting.web.app/api/game/options)
- [https://siegelingstcgtesting.web.app/js/config.js](https://siegelingstcgtesting.web.app/js/config.js)
- [https://siegelingstcgtesting.web.app](https://siegelingstcgtesting.web.app)

What to confirm:

- `/api/game/options` returns `200`
- `config.js` still uses `apiBaseUrl: ''`
- hosted HTML references the expected cache-busted CSS/JS versions

## Database and Persistence Notes

- The app uses file-backed H2.
- Local database path is under:
  - [data](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/data)
- This stores account data, saved decks, and match history for local runtime.

## Current Gameplay/Data Model Notes

- Siegling printed stats are now:
  - `Health`
  - `Speed`
  - abilities
- Printed `Attack` and `Defense` were removed from the main card model and frontend display.
- Damage now comes from abilities and battle logic, not a permanent printed attack stat.

## Current Frontend Art Notes

- `Sundile` art is mapped in:
  - [src/main/resources/static/assets/cards/sundile.svg](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/assets/cards/sundile.svg)
- `Staticap` art is mapped in:
  - [src/main/resources/static/images/cards/Staticap.png](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/images/cards/Staticap.png)

Important note about `Staticap`:

- `Staticap.png` is a full-card scan, not a clean illustration crop.
- The renderer in [src/main/resources/static/js/game.js](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/js/game.js) now treats it as a cropped illustration source.
- The crop/focus styling lives in [src/main/resources/static/css/style.css](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/css/style.css).

## Known Assistant Workflow Tips

- Always inspect [progress.md](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/progress.md) before doing substantial work.
- Keep new notes appended there after meaningful changes.
- Be careful not to confuse stale legacy frontend files with live entrypoints.
- When changing frontend assets or JS/CSS behavior, bump the version query strings in [index.html](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/index.html).
- Re-verify same-origin API behavior after deploys.

## Recommended Quick Start For Another Assistant

1. Read [progress.md](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/progress.md)
2. Open:
   - [src/main/resources/static/js/game.js](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/js/game.js)
   - [src/main/resources/static/css/style.css](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/resources/static/css/style.css)
   - [src/main/java/com/sieglings/controller/GameController.java](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/java/com/sieglings/controller/GameController.java)
   - [src/main/java/com/sieglings/service/GameService.java](A:/New%20folder/OneDrive/Desktop/Sieglings/sieglings-tcg/src/main/java/com/sieglings/service/GameService.java)
3. Confirm local build:
   - `.\mvnw.cmd -q -DskipTests compile`
4. If gameplay/UI work is needed, run locally on `127.0.0.1:8080`
5. If deploying, use Cloud Run + Firebase Hosting with the config above

## Last Verified Live State

At the time this handoff was written:

- Hosting URL: [https://siegelingstcgtesting.web.app](https://siegelingstcgtesting.web.app)
- Backend URL: [https://sieglings-tcg-api-324063847257.us-central1.run.app](https://sieglings-tcg-api-324063847257.us-central1.run.app)
- Firebase Hosting uses same-origin `/api` rewrites
- Cloud Run service name: `sieglings-tcg-api`

