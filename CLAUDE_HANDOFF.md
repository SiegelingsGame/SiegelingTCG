# Sieglings TCG Handoff

This is the authoritative handoff for assistant-driven work on this repo.
If Claude, Codex, or another assistant is making changes, use this file as
the deployment and verification source of truth.

## Project Identity

- Project name: `Sieglings TCG`
- Repo root: `A:\New folder\OneDrive\Desktop\Sieglings\sieglings-tcg`
- Stack:
  - Backend: Spring Boot
  - Frontend: static HTML/CSS/JS served by Spring Boot and Firebase Hosting
  - Live card editor persistence: Firestore
  - Other app persistence: file-backed H2 + JPA
  - Live backend: Cloud Run
  - Live frontend: Firebase Hosting

## Live Environments

- Live frontend: `https://siegelingstcgtesting.web.app`
- Firebase app domain: `https://siegelingstcgtesting.firebaseapp.com`
- Live backend canonical URL: `https://sieglings-tcg-api-324063847257.us-central1.run.app`
- Cloud Run service:
  - service: `sieglings-tcg-api`
  - region: `us-central1`
  - project: `siegelingstcgtesting`

## Live Card Dashboard

- Public dashboard URL:
  - `https://siegelingstcgtesting.web.app/card-dashboard.html`
- Cloud Run-served dashboard URL:
  - `https://sieglings-tcg-api-324063847257.us-central1.run.app/card-dashboard.html`
- Live editor API:
  - `https://siegelingstcgtesting.web.app/api/cards/editor`

Expected live API shape:

- `source = FIRESTORE`
- `liveEditingEnabled = true`
- `firestoreAvailable = true`
- `filePath = appConfig/cardOverrides`

If the live API ever returns `CLASSPATH_RESOURCE` or the dashboard HTML shows
old assets such as `card-dashboard.css?v=1`, the live deployment has been
overwritten by an older build and must be redeployed.

## Current Source Of Truth Files

Main active frontend files:

- `src/main/resources/static/index.html`
- `src/main/resources/static/js/game.js`
- `src/main/resources/static/css/style.css`
- `src/main/resources/static/js/config.js`

Card dashboard files:

- `src/main/resources/static/card-dashboard.html`
- `src/main/resources/static/js/card-dashboard.js`
- `src/main/resources/static/css/card-dashboard.css`

Card editor backend files:

- `src/main/java/com/sieglings/controller/CardEditorController.java`
- `src/main/java/com/sieglings/service/CardOverrideEditorService.java`
- `src/main/java/com/sieglings/service/CardOverrideStorageService.java`
- `src/main/java/com/sieglings/service/CardEditorAuthService.java`
- `src/main/java/com/sieglings/service/ManualSieglingCatalog.java`
- `src/main/resources/application.properties`

## Legacy Files That Are Still Present

These exist but are not the current frontend entrypoints:

- `src/main/resources/static/game.js`
- `src/main/resources/static/style.css`

Do not make dashboard or game UI changes there unless intentionally cleaning up
legacy files.

## Hosting And API Wiring

- Firebase Hosting config is in `firebase.json`
- Hosting serves `src/main/resources/static`
- Hosting rewrites `/api/**` to Cloud Run service `sieglings-tcg-api`
- Frontend should keep same-origin API calls
- `src/main/resources/static/js/config.js` should keep:

```js
window.SIEGLINGS_CONFIG = {
    apiBaseUrl: ''
};
```

## Firestore Configuration

The live card dashboard is backed by Firestore, not by the bundled JSON file.

Configured values:

- Firestore project id: `siegelingstcgtesting`
- Firestore database id: `siegedb`
- Collection: `appConfig`
- Document: `cardOverrides`

These are wired in `src/main/resources/application.properties`.

Important:

- The dashboard can fall back locally to project/classpath JSON if Firestore is
  unavailable.
- The live deployment should not be treated as healthy unless the editor API
  returns `source = FIRESTORE`.

## Portable Tooling Installed On This Machine

These tools are already installed and can be used directly:

- Portable Node:
  - `C:\Users\AlexTillman\AppData\Local\CodexTools\node-v24.14.1-win-x64`
- Portable Firebase CLI:
  - `C:\Users\AlexTillman\AppData\Local\CodexTools\firebase-global\firebase.cmd`
- Firebase service account key:
  - `A:\New folder\OneDrive\Desktop\Sieglings\sieglings-tcg\siegelingstcgtesting-9bd8de57ff8c.json`

Recommended environment setup before Firebase Hosting deploy:

```powershell
$toolsRoot = Join-Path $env:LOCALAPPDATA 'CodexTools'
$nodeDir = Join-Path $toolsRoot 'node-v24.14.1-win-x64'
$globalPrefix = Join-Path $toolsRoot 'firebase-global'
$env:PATH = "$nodeDir;$globalPrefix;$env:PATH"
$env:GOOGLE_APPLICATION_CREDENTIALS = 'A:\New folder\OneDrive\Desktop\Sieglings\sieglings-tcg\siegelingstcgtesting-9bd8de57ff8c.json'
```

## Build And Test Workflow

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

Useful local URLs:

- `http://127.0.0.1:8080`
- `http://127.0.0.1:8080/card-dashboard.html`
- `http://127.0.0.1:8080/api/cards/editor`

## Required Deploy Workflow

### If static dashboard or frontend files changed

Deploy Firebase Hosting:

```powershell
$toolsRoot = Join-Path $env:LOCALAPPDATA 'CodexTools'
$nodeDir = Join-Path $toolsRoot 'node-v24.14.1-win-x64'
$globalPrefix = Join-Path $toolsRoot 'firebase-global'
$firebaseCmd = Join-Path $globalPrefix 'firebase.cmd'
$env:PATH = "$nodeDir;$globalPrefix;$env:PATH"
$env:GOOGLE_APPLICATION_CREDENTIALS = 'A:\New folder\OneDrive\Desktop\Sieglings\sieglings-tcg\siegelingstcgtesting-9bd8de57ff8c.json'
& $firebaseCmd deploy --only hosting --project siegelingstcgtesting --non-interactive
```

### If Java backend files changed

Deploy Cloud Run from source:

```powershell
gcloud run deploy sieglings-tcg-api --project=siegelingstcgtesting --region=us-central1 --source . --allow-unauthenticated --quiet
```

### If card editor or dashboard behavior changed

Deploy both Hosting and Cloud Run.

Do not assume a frontend-only deploy is enough if `/api/cards/editor` behavior
changed.

## Required Post-Deploy Verification

After any live deploy touching the dashboard/editor path, verify all of these:

### 1. Hosted dashboard HTML is current

Check:

- `https://siegelingstcgtesting.web.app/card-dashboard.html`

Confirm it contains the expected current asset versions, for example:

- `card-dashboard.css?v=3`
- `card-dashboard.js?v=3`

### 2. Hosted editor API is Firestore-backed

Check:

- `https://siegelingstcgtesting.web.app/api/cards/editor`

Confirm:

- `source = FIRESTORE`
- `liveEditingEnabled = true`
- `firestoreAvailable = true`

### 3. Cloud Run editor API is Firestore-backed

Check:

- `https://sieglings-tcg-api-324063847257.us-central1.run.app/api/cards/editor`

Confirm the same Firestore values.

### 4. Same-origin API wiring still works

Check:

- `https://siegelingstcgtesting.web.app/js/config.js`

Confirm `apiBaseUrl` is still empty string.

## Deploy Safety Rules

These are important. Follow them every time.

1. Never deploy from a stale workspace.
   - Confirm local source files are the intended current versions before deploy.

2. Never stop at “deploy succeeded.”
   - A successful deploy can still publish an old build.
   - Always verify the live HTML and the live API response after deploy.

3. If live `/api/cards/editor` returns `CLASSPATH_RESOURCE`, treat that as a broken live deployment.
   - Redeploy the current backend.

4. If hosted `card-dashboard.html` shows `v=1` assets or lacks the “Live Publishing” section, treat that as a stale Hosting deploy.
   - Redeploy Hosting from current source.

5. For card dashboard work, do not claim success unless both the public dashboard page and the live API are verified.

## Dashboard UX Notes

- The dashboard includes login/bootstrap flows for the live Firestore editor.
- The first admin bootstrap flow only appears if no editor admin exists.
- If an admin already exists, users must log in before the publish button is enabled.
- The dashboard browser cards and editor panel use element-based theming from the
  same palette as the main game.

## Element Palette Source

Use the existing game palette from `src/main/resources/static/css/style.css`.
Do not invent a second competing element palette if updating dashboard visuals.

Known element variables:

- `--fire`
- `--earth`
- `--wind`
- `--water`
- `--ice`
- `--shadow`
- `--electric`
- `--metal`
- `--undead`
- `--psychic`
- `--neutral`

Dashboard-specific additions currently also include:

- `--poison`
- `--light`

## Quick Recovery Procedure

If the dashboard “stops working” after another assistant deploy:

1. Run `.\mvnw.cmd -q test`
2. Deploy Hosting from current source
3. Deploy Cloud Run from current source
4. Verify:
   - `https://siegelingstcgtesting.web.app/card-dashboard.html`
   - `https://siegelingstcgtesting.web.app/api/cards/editor`
   - `https://sieglings-tcg-api-324063847257.us-central1.run.app/api/cards/editor`
5. Do not stop until the live API reports `source = FIRESTORE`

## Recommended Prompt For Another Assistant

Use this repo:

- `A:\New folder\OneDrive\Desktop\Sieglings\sieglings-tcg`

When making changes:

1. Edit the real live source files, not stale legacy files.
2. Run `.\mvnw.cmd -q test`
3. If frontend/dashboard files changed, deploy Firebase Hosting.
4. If Java/backend files changed, deploy Cloud Run.
5. If card editor behavior changed, deploy both.
6. Verify the live public dashboard HTML version and verify the live `/api/cards/editor`
   response is Firestore-backed.

Your task is not complete unless the live site is verified after deploy.
