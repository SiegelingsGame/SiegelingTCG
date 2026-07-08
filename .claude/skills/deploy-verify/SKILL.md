---
name: deploy-verify
description: How Siegelings TCG ships to production and how to verify a live deploy — GitHub Actions pipeline, Firebase Hosting + Cloud Run split, routing via firebase.json, and the post-deploy health checklist. Use when deploying, adding routes/pages, or diagnosing "works locally, broken live".
---

# Deploy and live verification

## Topology

- **Frontend**: Firebase Hosting serves `src/main/resources/static/` at
  `https://siegelingstcgtesting.web.app`.
- **Backend**: Cloud Run service `sieglings-tcg-api` (us-central1, project
  `siegelingstcgtesting`); Hosting rewrites `/api/**` to it, so the frontend
  keeps same-origin calls (`js/config.js` must keep `apiBaseUrl: ''`).
- **Pipeline**: push to `main` runs `.github/workflows/deploy.yml` — Cloud Run
  deploy first, then Firebase Hosting + Functions. Feature branches deploy
  nothing; merging the PR is the release.
- Firestore (`siegedb`, doc `appConfig/cardOverrides`) backs the live card
  dashboard; H2 file DB backs accounts (per-instance on Cloud Run).

## Routing: adding a page

Pretty URLs are `firebase.json` rewrites (`/play` → `/play.html`, `/siege` →
`/adventure.html`, `/home|/cards|/decks|/profile|/shop|/social|/achievements|
/deck-builder` → `/home.html`, catch-all → `/index.html`). A new page needs its
rewrite added there. Cache headers in `firebase.json` treat `**/*.html` and
`/js/config.js` specially — check them if a page seems stubbornly cached.

## What breaks "live but not locally"

1. **Stale `?v=` pins** — the asset changed but its `?v=N` wasn't bumped in
   every including HTML page; browsers keep the cached bundle.
2. **Half deploy** — backend behavior changed but only Hosting shipped (or
   vice versa). If `/api/cards/editor` behavior or any controller changed,
   both must go out; the Action does both on merge, manual deploys often don't.
3. **Firestore fallback** — live editor API returning `source:
   CLASSPATH_RESOURCE` means the backend can't reach Firestore or an old build
   is live. Treat as broken; redeploy backend.
4. **Cold-start latency** — `/api/game/new` can take 10–30s cold; don't
   mistake it for an outage or shrink client timeouts.

## Post-deploy checklist (from CLAUDE_HANDOFF.md, still authoritative)

```
1. https://siegelingstcgtesting.web.app/play        → HTML serves the NEW ?v= pins
2. https://siegelingstcgtesting.web.app/api/cards/editor
     → source=FIRESTORE, liveEditingEnabled=true, firestoreAvailable=true
3. https://sieglings-tcg-api-324063847257.us-central1.run.app/api/cards/editor
     → same Firestore values (Cloud Run direct)
4. https://siegelingstcgtesting.web.app/js/config.js → apiBaseUrl: ''
5. https://siegelingstcgtesting.web.app/api/game/options → 200, expected deck count
```

"Deploy succeeded" is not done — a successful deploy can still publish an old
build. Verify the live HTML/API before reporting success, and record the
verification in `progress.md`.

## Manual deploys (rarely needed from CI-less environments)

```bash
firebase deploy --only hosting --project siegelingstcgtesting   # frontend
gcloud run deploy sieglings-tcg-api --source . --region us-central1 \
  --project siegelingstcgtesting --quiet                        # backend
```

Both require credentials that remote agent environments usually lack — prefer
merging to `main` and letting the Action deploy. `CLAUDE_HANDOFF.md` documents
the owner's local Windows tooling paths.
