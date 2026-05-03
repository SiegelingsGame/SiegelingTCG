# Firebase Functions Migration

This repo now contains the first live migration slice toward a Firebase-managed backend deploy.

## Live now

- `firebase.json` declares `functions/` as the Firebase Functions source
- Hosting rewrites for:
  - `/api/cards/editor`
  - `/api/cards/editor/**`
  now point to the Firebase function `api`
- `functions/index.js` serves the dashboard/editor API routes:
  - `GET /api/cards/editor`
  - `POST /api/cards/editor`
  - `POST /api/cards/editor/auth/bootstrap`
  - `POST /api/cards/editor/auth/login`
  - `POST /api/cards/editor/auth/logout`
- The deployed function reads and writes the same Firestore database and document layout as the previous Java backend:
  - database id: `siegedb`
  - `appConfig/cardOverrides`
  - `appConfig/presetDecks`
  - `appConfig/trainerCards`
  - `appConfig/liveElements`
  - `cardEditorAdmins`
  - `cardEditorSessions`

## Deployment path

- GitHub Actions now prepares `functions/`, validates the source, generates a manifest, and deploys:
  - `functions:api`
  - `hosting`
- `functions/scripts/generate-manifest.js` generates `functions/functions.yaml` in a cross-platform way so Firebase deploys work reliably from Windows and CI

## Verified

- Local function load passed
- Local Firestore-backed smoke test returned `source: FIRESTORE`
- Firebase Function `api` deployed successfully in `us-central1`
- Firebase Hosting deploy completed successfully after the rewrite cutover
- Direct function read of `/api/cards/editor` returns live Firestore editor data

## Current architecture

- Dashboard editor publish/read path is now Firebase-managed
- The remaining generic rewrite still sends other `/api/**` routes to the existing Cloud Run backend

## Remaining work for full Cloud Run removal

The editor/config APIs were the easiest slice to migrate because they already persist cleanly in Firestore.

The remaining gameplay/backend routes still need a larger redesign because the current Java service keeps match state in memory:

- `GameService` keeps `currentGame` in-process
- `MultiplayerService` keeps rooms in a `ConcurrentHashMap`

That means the remaining `/api/game/**`, `/api/match/**`, `/api/auth/**`, and `/api/leaderboards` routes still need a Firebase-native persistence/session plan before Cloud Run can be removed completely.
