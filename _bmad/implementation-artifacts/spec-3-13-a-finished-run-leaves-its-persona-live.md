---
title: 'A finished run leaves its persona live'
type: 'feature'
created: '2026-10-03'
status: 'done'
baseline_revision: 'e052514be9072f9f25d74c1986aec2e9f5b47f6e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/sprint-change-proposal-2026-10-03-beat-judgement.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A plain chat turn's own write to a file its persona owns still raises `note` once the turn ends.
    evidence: |-
      The own-run gate keys on `run:started` (`running`) and the run's end, not on `working`, so a chat turn that edits an owned file reads `note` after it. Unchanged by this story, whose intent is a persona's run. Gating on `working` in `ownRunAt` (`src/main/fold/persona-state.ts`) would cover it; a decision on whether a chat turn's own edit is "news" is open.
    location: >-
      src/main/fold/persona-state.ts (`ownRunAt`)
    severity: low
---

<intent-contract>

## Intent

**Problem:** A persona's own run writes the files it owns, and the watcher's `saved` flip lands up to 400 ms after the run's terminal event. `foldRail` raises `note` on every owned-row change with no notion of a run, so the dot reads `work`, then `note` (`file changed`), then never `live`: finishing reads as something being changed behind the user's back (FR47, FR103; closes the Epic 2 deferral in `deferred-work.md`).

**Approach:** The persona-state fold knows, per agent, whether a run is in flight and when the last one ended. A change to a file that persona owns, seen in flight or within the settle window (`SETTLE_MS`, 400 ms) after the run's terminal event, is the run's own and raises no `note`. Any other change still does.

## Boundaries & Constraints

**Always:**
- The gate lives in `foldRail` and is keyed by the row's owner (`row.owner.agentId`, already on the snapshot) against the agent whose run it is. A run is in flight from `run:started` until its `run:finished`, `run:failed` or `run:stopped` (or its session closing); the window then runs for `SETTLE_MS` from that event's `at`, compared with the injected `now` (inclusive). `SETTLE_MS` is imported from `src/main/fold/rail-rows.ts`, never restated.
- A suppressed change still updates the fold's rail baseline (`table.rail`), so the same row is not "new" at the next snapshot.
- The settle flip of a row (`changing` to `saved:<mtime>`) is a signature change and is gated like any other; the baseline carries it so nothing re-raises after the window.
- `note` clears at the agent's next turn or run start, and `live` clears on the next run (`detach` at `startRun`) as today. Nothing else about `work`, `error`, `live` or their precedence changes.
- Pure fold, no I/O, no wall clock but the injected `now`. Only main's persona fold changes: the renderer holds no persona logic and stores `persona:state` as main said it.

**Never:**
- No change to `ownerAgentIdFor`, the rail projection, the watcher, the contract (`src/shared/**`), or any planning artifact. No new event, field on the wire, token, or `@keyframes`.
- A run by persona A never suppresses a `note` for a file persona B owns (the file's owner is not the running persona).
- No distinction by tool: Write, Edit and Bash all reach the rail only as disk observations, and the gate must not read the stream.
- Not 3.3's section work, 3.14's pinned card, or the `run:finished`-without-`runId` deferral.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own write in flight | run in flight for pm; owned `prd.md` row changes | no `note`; dot stays `work` | N/A |
| Settle flip after the end | run ended at T; `saved` flip observed at T+400 | no `note`; dot `live` once awaiting-turn and attach have landed | N/A |
| Change after the window | same, observed at T+401 | `note` raised | N/A |
| Other persona's file | pm's run in flight; `architecture.md` (architect-owned) changes | architect reads `note` | N/A |
| Outside any run | no run; owned file changes | `note` as today | N/A |
| Next turn | `note` raised outside a run, then the agent's turn starts | `note` cleared as today | N/A |
| Failed or stopped run | run ends `failed`/`stopped`; owned flip within 400 ms | no `note`; dot reads `error` | N/A |
| Session closed mid-run | session closes while its run is in flight; flip within 400 ms | no `note` | N/A |
| Two sessions of one agent | one run in flight, one idle; owned row changes | no `note` (the agent has a run in flight) | N/A |
| New run starts | a prior run's window open | a fresh in-flight run; its changes suppressed | N/A |
| Baseline | first snapshot | none raised (unchanged) | N/A |

</intent-contract>

## Code Map

- `src/main/fold/persona-state.ts` -- `foldRail` (~l.148) calls `raise` for every owned-row signature change or removal; add the own-run gate there. `SessionFlags` (~l.44) gains `running: boolean` (set in the `run:started` branch after `startTurn`; created `false` at `session:opened`); `AgentFlags` (~l.47) gains `runEndedAt?: EpochMs`. The terminal case (`run:failed|stopped|finished`, ~l.240) clears `running` and stamps `runEndedAt = input.payload.at` before its existing `error` logic, which currently early-returns when `error` is unchanged: restructure so the stamp always lands. `session:closed` (~l.214) stamps `runEndedAt = input.payload.at` when the closed session was `running`. The header comment's `note` bullet changes to say what a run's own writes do. `aggregate`, `startTurn`, `settled`, `seedRail` unchanged.
- `src/main/fold/rail-rows.ts:20` -- `SETTLE_MS = 400`, read-only; import it. `src/main/projections/rail.ts` arms the settle timer from it, so the flip lands at most one window after the last observation.
- `src/main/fold/persona-state.test.ts` -- `describe('note')` (~l.237) and the `runStarted`, `runEnd`, `row`, `rail`, `fold`, `stateOf` helpers; add the matrix rows. Existing `note` tests (no run) must stay green unchanged.
- `src/main/session-run.ts:143-185` -- `startRun`/`endRun`: `run:*` carry `runId`, `sessionId`, `at: kit.now()`; `attach` follows `run:finished`. Read-only evidence; the persona fold maps `sessionId` to `agentId` through its own table.
- `src/main/persona-states.ts`, `src/main/projections/personas.ts` -- one projection per window, shared by the session and rail bridges; `now` is its clock. Read-only.
- `src/main/rail-bridge.ts` (`serviceFor`) -- applies `rail:changed` to the shared projection; `src/main/rail-bridge.test.ts:239` -- the `note` test with `quietMs` and `now` injectable. `src/main/projections/personas.test.ts:129` -- seed then `note`. Add the cross-bridge case here or in `src/main/persona-states.test.ts`: session bridge and rail bridge on one sender, an owned write during a run and a flip inside the window, states `work` then `live`, never `note` (closes the third Epic 2 deferral).
- `tests/run-replay-multi-file.test.ts` -- pattern for dispatching a recording as a run through the real session bridge (`menuEntryFor`, `spawn`, `feed`). `fixtures/runs/` -- `multi-file-sonnet` (Write and Edit), `fast-path-sonnet` (Bash, Edit, Write) and `fast-path-opus` (mostly Bash), all read-only.
- `_bmad/implementation-artifacts/deferred-work.md:58-66` -- the Epic 2 deferral on own-write `note` and the one on the two-bridge fixture; mark them resolved by this story, nothing else in that file.

## Tasks & Acceptance

**Execution:**
- `src/main/fold/persona-state.ts` -- per-session `running`, per-agent `runEndedAt`; gate `raise` in `foldRail` on the row owner's run in flight or `now - runEndedAt <= SETTLE_MS`; update the header comment -- the rule
- `src/main/fold/persona-state.test.ts` -- one test per matrix row, with the clock injected, including the 400 and 401 ms edges and that a suppressed change is baseline (no re-raise on the next unchanged snapshot) -- the matrix
- `src/main/projections/personas.test.ts` or `src/main/persona-states.test.ts` -- session and rail bridges registered against one window: run, owned write, flip inside the window, states `work` then `live`, no `note` at any step; the same flip outside the window raises one -- the cross-bridge case
- `tests/persona-live-after-run.test.ts` (new) -- replay `multi-file-sonnet`, `fast-path-sonnet` and `fast-path-opus` as dispatched runs through the real session bridge sharing a window with the rail bridge; a fake watcher observes the owned `prd.md` at each recorded Write, Edit or Bash tool call made before the run's terminal event and flips it inside the window after; assert every `persona:state` for the agent is `work`, `live` or `idle` (never `note`) and the last is `live` -- the corpus half of the AC
- `_bmad/implementation-artifacts/deferred-work.md` -- annotate the two resolved entries as resolved by this story -- bookkeeping
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given a persona's run in flight, or within `SETTLE_MS` after its terminal event, when the rail sees a change to a file that persona owns, then no `note` is raised, and a change outside that window or to a file the persona does not own still raises one.
- Given runs that write through `Write`, `Edit` and Bash, replayed from the corpus, then the persona's dot reads `work` then `live` and never `note`.
- Given the next turn or run, then `live` and `note` clear exactly as before.
- Given the full suite, lint, typecheck and build, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-03 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 19, false 4, maybe-false 0 (one `low` patched, one `low` deferred, the rest rejected; one finding is a finalize step, `false`)
- findings:
  - `[low]` `[reject]` Blind: a late terminal event of an earlier run ends a newer run's suppression (no `runId` match) — one turn is in flight per session and `endRun` runs synchronously at the turn's end, so no earlier run's terminal event can arrive after a newer `run:started`; the `error` form of this is already in `deferred-work.md`; the fix adds a `runId` to session flags.
  - `[low]` `[reject]` Blind: a run with no terminal event suppresses `note` forever — `endRun` runs on the turn's `result` and on the session ending, and `entry.run` would stay stuck too, which the card already depends on; not shown reachable.
  - `[false]` `[reject]` Blind: `run:started` re-spreads stale flags over what `startTurn` wrote — `startTurn` changes only `working: true`, which the spread sets again; `live` and `agentId` are the same in both.
  - `[low]` `[reject]` Blind: suppression is per agent, so a user's external edit to another owned file mid-run is absorbed — the matrix row "two sessions of one agent" and the intent say so; an external edit inside the run is indistinguishable from the run's own at the watcher.
  - `[low]` `[reject]` Blind: a run's write to another persona's file still raises that persona's `note` — stated in the intent's `Never` and Design Notes (the file's owner is not the running persona); tested.
  - `[low]` `[reject]` Blind: the window has no margin for watcher lag — the window is the settle window the story names; the final write precedes the persona's closing reply by seconds; a margin is a new constant the intent does not give. Residual risk recorded.
  - `[low]` `[reject]` Blind: the "returns the same table" test was moved to an unknown session and the early return is gone — the terminal event now stamps `runEndedAt`, so the table legitimately changes; the unknown-session no-op is still asserted.
  - `[low]` `[patch]` Blind: the replay test claims `work` then `live` but asserts only that each appears — added an order assertion (first `work` before last `live`) to `tests/persona-live-after-run.test.ts`; the arbitrary tool-call spacing and timeout are not defects.
  - `[low]` `[patch]` Blind: `deferred-work.md` marks two entries resolved, one with "one window" for a test with fakes — reworded to say the watcher and Electron are fakes; see also the chat-turn row below.
  - `[low]` `[carried]` `[reject]` Edge: late terminal event of an earlier run, no `runId` — same cause and verdict as the first row.
  - `[low]` `[reject]` Edge: a write observed after the terminal event settles past the window and raises `note` — needs the watcher to lag past the persona's closing reply; the fix (extend the window from the last suppressed observation) is new state the intent does not give.
  - `[low]` `[defer]` Edge: a plain chat turn's own write to an owned file still raises `note` once the turn ends — pre-existing, unchanged by this story (the intent is "a persona's run"); recorded in `deferred`, and `deferred-work.md`'s annotation now says it is resolved for runs only.
  - `[low]` `[carried]` `[reject]` Edge: a run that ends its turn without a terminal event suppresses forever — same as the second row.
  - `[low]` `[reject]` Edge: clock skew (`runEndedAt` later than `now`) keeps the window open — both stamps read `Date.now` in main; a skew guard is new surface for a case not shown.
  - `[low]` `[carried]` `[reject]` Edge: an external edit during a run is absorbed into the baseline — same as the fourth row.
  - `[false]` `[carried]` `[reject]` Edge: `run:started` re-applies stale flags — same refutation as the third row.
  - `[low]` `[reject]` Edge (deletion): repeated terminal events now restamp `runEndedAt` — the run emits one terminal event; `settled` raises nothing when the state is unchanged.
  - `[low]` `[carried]` `[reject]` Edge (deletion): a test was edited to an unknown session — same as the seventh row.
  - `[low]` `[carried]` `[reject]` Edge (claim): the window claim assumes the last observation precedes the terminal event — same as the eleventh row.
  - `[low]` `[carried]` `[defer]` Edge (claim): the deferred entry reads resolved while a chat turn's write still raises `note` — same as the twelfth row; annotation corrected.
  - `[low]` `[carried]` `[reject]` Gap (other): no `runId` check on a stale terminal event — same as the first row.
  - `[low]` `[reject]` Gap (other): the suppression window and the projection's clock could diverge — both default to `Date.now` in main; the tests share one clock.
  - `[false]` `[reject]` Intent: the diff has no commit and no sprint-status close — those are this step's finalize, done after review.
  - `[low]` `[reject]` Intent: nothing was checked on a live run, and the settle timing is asserted against a test-chosen delay — the spec records the live check as a residual risk; the watcher's settle is its own tested constant.

## Design Notes

- **Why in the fold, not the rail.** The rail's two truth channels stay unmerged (AD-2): the rail still shows `changing` then `saved` for the persona's own write, as it should. Only the persona dot's rule for `note` changes, and that lives in `fold/persona-state.ts`, where run identity already resolves to an agent.
- **Window from the terminal event, measured on the injected clock.** The `saved` flip arrives up to `SETTLE_MS` after the last observation, which is at or just before `run:finished`, so a window from the terminal event's `at` covers it. The fold uses `SETTLE_MS` and not the rail's injected `quietMs`; a test that shrinks `quietMs` still sits inside the window.
- **Keyed by the file's owner.** "A file that persona owns" is the row's owner. An analyst run that writes `prd.md` is not the analyst's own file, so pm still reads `note`: contention and cross-persona writes are 3.6 and 3.9's, not hidden here.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Run a PRD skill from John on a BMad project in the real app: the dot reads `work` for the run and `live` after it, never `file changed`, with the rail showing `changing` then `saved` for the PRD. An unattended run cannot do this; record it as a residual risk.

## Auto Run Result

**Summary.** A persona's own run no longer raises `note`. The persona-state fold tracks, per session, whether a run is in flight (`run:started` until its terminal event or the session closing) and, per agent, when its last run ended. `foldRail` takes every owned-row change into its baseline but raises no `note` for a row whose owner has a run in flight or ended no more than `SETTLE_MS` before the injected `now`. A change outside that window, to another persona's file, or outside any run still raises one, and `note` and `live` clear at the next turn or run as before. So the dot reads `work`, then `live`, after a run that writes through `Write`, `Edit` or Bash.

**Files changed.** `src/main/fold/persona-state.ts` (`running`, `runEndedAt`, `ownRunAt`, the gate in `foldRail`, header comment); `src/main/fold/persona-state.test.ts` (15 tests, one per matrix row plus edges; one existing no-op assertion moved to an unknown session); `src/main/projections/personas.test.ts` (two tests, inside and outside the window); `tests/persona-live-after-run.test.ts` (new: `multi-file-sonnet`, `fast-path-sonnet` and `fast-path-opus` replayed as dispatched runs through the real session and rail bridges on one window, with a fake watcher and a late-write control); `deferred-work.md` (two Epic 2 deferrals annotated resolved, the own-write one for runs only); `sprint-status.yaml` (3.13 `done`) and `epic-3-context.md` (3.13 marked done).

**Review.** 24 findings: patches applied 2 (both low); deferred 1; rejected 21 with reasons in the log (false 4 counting the carried rows, low the rest). Patched by verdict: high 0, medium 0, low 2.

**Follow-up review recommended: false.**

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` unit 131 files, 2817 tests passed, watchers 3 files, 55 tests passed; `npm run build` exit 0. Run before review and again after the patches. Matrix audit: every I/O row has a covering test that ran (fold, projection, bridge replay); the baseline row is the unchanged existing test. The implementer also disabled the gate and saw 13 of the new tests fail.

**Residual risks.**
- Not seen in the real app: no live run was made, so the "live run" half of the acceptance criterion is open. The corpus replay uses a fake watcher and a hand-placed clock; the real watcher's observation lag against the terminal event is unmeasured, and a lag past the persona's closing reply would let a late `saved` flip raise one `note`.
- A chat turn's own write to an owned file still raises `note` (deferred).
- Suppression is per agent: while any session of the owner has a run in flight, a user's external edit to one of its files is absorbed into the baseline and raises nothing.
- The corpus replays stop at the run's terminal event (later frames are turns nobody dispatched), and the fast-path recordings end their first turn early, so Write and Edit coverage comes from `multi-file-sonnet` and Bash from the other two.
