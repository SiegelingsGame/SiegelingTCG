# Agent notes

See `CLAUDE.md` for product overview, file map, conventions, and the standard
build/test/run commands.

## Cursor Cloud specific instructions

### Primary service

- **Spring Boot app** (`sieglings-tcg`): `./mvnw spring-boot:run` serves API +
  static UI at `http://localhost:8080` (override with `PORT`).
- `./run-local.sh` also works but defaults to **port 8081**, not 8080.
- Optional side packages (`functions/`, `mobile/web-app/`, Playwright layout
  guard under `tests/mobile-overlap/`) are not required for core local play.

### Firestore / local credentials

- Full hub/auth/live catalog needs Firestore project `siegelingstcgtesting`,
  database `siegedb`. Card editor health: `GET /api/cards/editor` should report
  `source: FIRESTORE`, `liveEditingEnabled: true`.
- Preferred local override file is gitignored `application-local.properties`
  (see `application-local.properties.example`). Typical contents for this VM:

  ```properties
  app.card-editor.firestore-service-account-path=./siegelingstcgtesting-9bd8de57ff8c.json
  app.seed-demo-user=true
  ```

- The `siegelingstcgtesting-*.json` service-account key is gitignored. If it is
  present in the workspace, point `app.card-editor.firestore-service-account-path`
  at it. Otherwise use `./scripts/firestore-adc-login.sh` (interactive gcloud ADC).
- `app.seed-demo-user=true` creates `demo@local.test` / `demo12345` when missing.

### Non-obvious runtime gotchas

- Solo match actions (`/api/game/draw`, `/place`, `/mulligan`, `/state`, etc.)
  authenticate the in-memory match via the **`X-Solo-Token`** header (value from
  `POST /api/game/new` → `soloToken`). Sending `soloToken` only in the JSON body
  is ignored and returns “No active game”.
- Guest solo play is limited to starter SiegeKnights (Squire Bob / Lady Pyla /
  Ser Airek; `trainerId` values like `pyla`, `squire-bob`, `ser-airek`). Signed-in
  users must own the selected knight or `/api/game/new` rejects the loadout.
- Matches start in **`MULLIGAN`**; resolve with `POST /api/game/mulligan` before
  draw/setup/place.
- Cold `/api/game/options` (and sometimes first `/api/game/new`) can take ~10–30s
  because of Firestore catalog work. The play UI waits up to
  `LOADOUT_ACTION_TIMEOUT_MS` (90s) — do not shrink that timeout.
- The loadout primary button is a **wizard CTA** (`Choose Deck` →
  `Select SiegeKnight` → `To Battle` → `Start Battle`), not always “start”.
  Hand cards in the DOM are `.hand-card` under `#playerHand` / `.hand-cards`.

### Lint / test / run (pointers)

- Standard commands live in `CLAUDE.md` (`./mvnw -q test`,
  `./mvnw spring-boot:run`, `node --check` on static JS).
- As of environment setup, most JUnit tests pass, but a small set of
  `CardDefinitionServiceTest` / `Siege*` failures appear pre-existing against
  the live Firestore-backed catalog — treat them as known unless you are
  changing those areas.
