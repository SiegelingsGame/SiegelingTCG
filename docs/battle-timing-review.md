# Battle Table — game state / presentation timing review

Scope: the ordering relationship between server state application, the
`action-queue.js` playback timeline, and the UI that `game.js` `render()`
paints. Written from the reported symptom: *"ability options appear before the
Battle Phase banner pops up, so the banner is DOA."*

## 1. How the two timelines actually work

There are two independent clocks driving the battle screen.

**Clock A — state application (synchronous).** `api()` in `game.js`
(`static/js/game.js:9464-9503`) does, in order:

1. `gameState = data` — the new server snapshot becomes truth immediately.
2. `maybeNotifyTurnChange(prevState, data)` — fires the turn toast.
3. `window.SieglingsActionQueue.enqueueFromStateDiff(prevState, data, ctx)` —
   **only enqueues**; it does not await anything.
4. `render()` — repaints the entire screen from the *new* state.

So by the time step 4 returns, the board, the hand, the battle dock, the
"ACTING NOW" header, the ability buttons and the PASS/next-actor footer all
already reflect the post-transition BATTLE state.

**Clock B — playback (asynchronous).** `enqueueFromStateDiff` pushes actions
onto a queue that `_kick()` drains on a microtask
(`static/js/action-queue.js:3335-3341`). Each action awaits real time. The
phase banner is one of those actions:

```
enqueuePhaseTransitionAction()   // action-queue.js:2567
  → kind: 'PHASE', holdMs = 1100 (fast) / 2000 (normal), gapAfterMs 200/420
  → played at action-queue.js:3419-3441, which awaits
    window.showPhaseTransitionBanner(...)  (game.js:4806)
```

`showPhaseTransitionBanner` holds for `max(1200, durationMs)` then fades over
360ms. In the `setupToBattle` path the PHASE action is queued *after* every
placement action for both sides (`action-queue.js:2582-2589`), and each
placement carries its own `minActionMs`/`gapAfterMs` (up to 1000ms per enemy
placement).

**The defect is structural, not a tuning problem.** Clock A has no dependency
on Clock B. The banner is guaranteed to arrive *after* the UI it is supposed
to introduce — typically 1–4 seconds after, depending on how many placements
precede it. The screenshot is exactly this: BATTLE dock, ability list and
"ACTING NOW" fully painted, banner arriving on top of them as decoration.

The one code path that gets the ordering right is the fallback for when the
queue is absent (`game.js:12079-12082`, `if (phaseChanged &&
!window.SieglingsActionQueue)`) — i.e. the correct behaviour only exists on
the path nobody runs.

## 2. Confirmed ordering defects

### D1 — Battle dock paints before the phase banner (primary, the reported bug)
`render()` (Clock A) unconditionally rebuilds `renderBattlePanel()`
(`game.js:15501`) from `gameState`. That function reads only `gameState`
(`pendingBattle`, `battleWaitingOn`, `currentPhase`) and has zero awareness of
whether playback is mid-flight. Result: the ability list for the first acting
Siegling is on screen and interactive before the phase is announced.

### D2 — The banner is non-blocking, so it is not just late, it is inert
`.phase-transition-banner` is `pointer-events: none` at `z-index: 860`
(`css/style.css:1099-1113`). Nothing masks the board or the dock while it is
up. The player can tap an ability, tap PASS, or drag a card *through* the
banner while it is displayed. Combined with D1 this is why it reads as "DOA" —
it is a decorative overlay on an already-live screen, not a beat in the
sequence.

### D3 — Battle auto-advance is the only thing that respects playback
`shouldAutoAdvanceBattle()` (`game.js:9307-9318`) is the single consumer of
`SieglingsActionQueue.isProcessing()`. Auto-advance correctly waits for the
queue; every other interaction (ability taps, PASS, knight active, card
placement) does not. So the game holds its *own* turn-taking for the animation
but lets the player act into it — an inconsistency that also makes input
during playback race the queue's pending-state bookkeeping
(`syncPendingPlacements` / `syncPendingHealth` and friends,
`action-queue.js:3206-3212`), which is re-applied on every action precisely
because `render()` keeps stomping it.

### D4 — Turn-change toast jumps the queue
`maybeNotifyTurnChange(prevState, data)` (`game.js:9476`) fires synchronously
on Clock A, gated only by `playbackContext.soloAiEndTurn`. In multiplayer and
in any non-solo-end-turn transition, "Your turn" appears before the previous
turn's damage, destruction and phase animations have played.

### D5 — Two competing suppression mechanisms for the same banner
`hidePhaseTransitionBanner()` is called from `beginSoloAiEndTurn`
(`action-queue.js:3229-3232`) and from `action-queue.js:1607`, and
`showPhaseTransitionBanner` also force-resolves a pending banner promise when
superseded (`game.js:4784-4791, 4818-4820`). `beginSoloAiEndTurn` additionally
spin-waits up to 15s for the queue to idle (`action-queue.js:3224-3228`).
These are three separate patches for the same root cause — the absence of a
single "presentation is busy" gate — and they interact: a fast player ending
setup can cancel a banner that had only just become visible.

### D6 — Phase banner ordering differs by path
- `setupToBattle`: placements → PHASE → damage. Banner mid-sequence.
- `soloAiEndFlow`: placements → damage → THINK → CHAT → `enqueuePhaseTransitionAction(true)`
  (`action-queue.js:3206-3217`). Banner *last*, after the round's combat has
  already been shown.

Whichever fires first wins because of the `phaseTransitionQueued` latch
(`action-queue.js:2567`), so the announced phase is path-dependent rather than
deterministic.

## 3. Root cause, stated once

`render()` is a single monolithic function that paints *everything* from the
authoritative state, and it is called the instant that state arrives. The
animation queue was layered on afterwards and can only ever *react* to a
screen that has already updated. Every symptom above follows from that one
fact. Any fix that only re-times the banner (shorter placement gaps, earlier
enqueue, longer hold) treats the symptom.

## 4. Update plan

Ordered so each step is independently shippable and verifiable. Steps 1–3 fix
the reported bug; 4–6 remove the accumulated workarounds.

### Step 1 — Introduce a presentation gate (`presentationBusy`)
Add to `action-queue.js` a single authoritative flag plus subscription:

- `queue.isProcessing()` already exists; expose `queue.onIdle(cb)` and a
  `document.body.classList.toggle('sgl-playback-active', processing)` toggle
  driven from `_kick()`/`_drain()`'s `finally`
  (`action-queue.js:3336-3357`).
- Expose `queue.isPhaseBannerActive()` backed by the existing
  `phaseTransitionResolve` handle in `game.js`.

No behaviour change yet; this is the seam everything else keys off.

### Step 2 — Gate the battle dock on playback, not on state alone
In `renderBattlePanel()` (`game.js:15501`), when `currentPhase === 'BATTLE'`
and playback is active, render the standby shell (the same
`buildQueueShell(...)` path already used for `battleWaitingOn === 'ENEMY'`,
`game.js:15543-15546`) instead of the acting-card ability list. Then call
`renderBattlePanel()` once more from the queue's idle handler so the ability
list appears exactly when the banner has cleared.

This is deliberately scoped to the battle dock — the board, HP bars and hand
should keep updating live, since the queue's pending-state layer
(`syncPendingPlacements` etc.) is built around `render()` continuing to run.

### Step 3 — Make the banner a real beat
- Give `.phase-transition-banner.visible` `pointer-events: auto` and add a
  full-screen scrim behind it (new `.phase-transition-scrim`, `z-index: 859`),
  so the announcement genuinely gates input for its hold.
- Bump `?v=` on `style.css` and `game.js` / `action-queue.js` in **both**
  `play.html` and `home.html` (convention #1 in `CLAUDE.md`).

### Step 4 — WITHDRAWN: phase-banner ordering is already correct
**This step was based on a misreading of D6 and was not implemented.** On a
closer read of `action-queue.js:2302-2311`, the per-path ordering is deliberate
and temporally right, not arbitrary:

- `setupToBattle` enqueues `placements → PHASE → damage`. Those placements are
  the ones made *during the SETUP phase that just ended*, so showing them
  before the BATTLE announcement is the correct chronology. Enqueuing PHASE
  first — what this step originally proposed — would announce BATTLE and only
  then replay the previous phase's placements, which is worse.
- `soloAiEndFlow` enqueues the banner after the AI's placements, damage and
  THINK/CHAT beats, which likewise matches the order those things happened in.

The `phaseTransitionQueued` latch is load-bearing rather than a smell: three
call sites can reach `enqueuePhaseTransitionAction` for one batch, and the
latch is what keeps a single banner per diff. D6 stands only as an
observation that the two paths differ, not as a defect to fix.

### Step 5 — Route the turn toast through the queue
Change `maybeNotifyTurnChange` (`game.js:9476`) to enqueue a `TURN` action
rather than showing a toast inline, removing the `soloAiEndTurn` special case.
`showTurnChangeToast` already prefers `SieglingsActionQueue.showToast`
(`game.js:4869`); the change is about *when*, not *how*.

### Step 6 — Retire the workarounds
With 1–5 in place, remove:
- the 15s spin-wait in `beginSoloAiEndTurn` (`action-queue.js:3224-3228`) →
  replace with `await queue.onIdle()`;
- the ad-hoc `hidePhaseTransitionBanner()` calls at `action-queue.js:1607` and
  `:3230`;
- the dead non-queue fallback at `game.js:12079-12082`, or keep it and make it
  the shared path used by Step 4.

### Backend note
No server change is required. Phase transitions are already reported
correctly in the `GameState` snapshot (`currentPhase` / `activeSide`); this is
entirely a client presentation-ordering defect. Rule-parity item #7 in
`CLAUDE.md` does not apply.

## 5. Verification plan

Per the standard bar in `CLAUDE.md`:

- `node --check src/main/resources/static/js/game.js` and `action-queue.js`.
- `./mvnw -q test` — expected untouched, but run because `game.js` behaviour is
  asserted indirectly by nothing server-side; this is a regression guard only.
- Headless Chromium at **390x844** and **1920x1080**, driving the page's own
  `api()` + `render()` with a **real server-captured BATTLE state** (one
  carrying `pendingBattle`, i.e. an acting Siegeling) and the **real**
  `ActionQueue`. The probe lands that state three times: with the queue idle,
  with a real `PHASE` action mid-flight, and after playback drains.
  **Assertion: zero `.battle-ability-btn` in the DOM while the queue is busy or
  the banner is up, and the dock back to `Acting Now` afterwards.**

  A first attempt at a naive "play a real match and time the events" harness
  was discarded: on the round-1 `SETUP -> BATTLE` transition the endturn
  response carries **no** `pendingBattle` (the dock has nothing to paint until
  auto-advance fires `/battle`, which is already gated on `isProcessing()`), so
  that path passes even on the broken build. The defect needs a state that
  carries the phase flip *and* the next acting Siegeling together — which is
  what the probe above lands directly.
- Re-run `tests/mobile-overlap/` if the scrim or dock CSS shifts tile geometry.
- Append a dated `progress.md` entry with the timeline evidence.

## 6. Risk

- Step 2 changes what the player sees during playback; if the idle re-render
  is missed the dock could stay in standby. Mitigate by re-rendering from
  `_drain()`'s existing `finally` block, which already runs unconditionally
  and already calls `window.scheduleBattleAutoAdvance()`.
- Step 3's input gate lengthens the perceived turn by the banner hold
  (1.1s fast / 2.0s normal). If that tests as too slow, reduce `PHASE_BANNER_MS`
  (`action-queue.js:2508`) rather than reverting the gate.
