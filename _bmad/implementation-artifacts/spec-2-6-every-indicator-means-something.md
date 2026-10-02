---
title: 'Every indicator means something'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: '9ae84618e61bc52169d6416c9de3beaef35ed018'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      A persona's own write to a file it owns raises `note` once its turn ends, so the tile reads `file changed` after its own work.
    evidence: |-
      The spec defines `note` as any owned-file change cleared at the next turn start; with no runs in this epic the intended meaning cannot be judged. Decide in Epic 3 whether notes raised while that persona is working are suppressed.
    location: >-
      src/main/fold/persona-state.ts (foldRail)
    severity: low
  - summary: >-
      A session whose process exits mid-turn goes from `work` to `idle` with no `error`.
    evidence: |-
      `session:closed` carries `reason: 'process-exited'` but `error` is defined only as a failed or stopped run, and no run event exists for a chat turn. Needs a decision on whether an abnormal exit is a failed turn (Story 2.11 or Epic 3).
    location: >-
      src/main/fold/persona-state.ts (session:closed)
    severity: low
  - summary: >-
      `run:finished` clears `error` without checking `runId`, so a late finish of an earlier run could erase a newer run's error.
    evidence: |-
      The fold keeps no run identity. No producer of run events exists until Epic 3, which brings concurrent runs.
    location: >-
      src/main/fold/persona-state.ts (run:finished)
    severity: low
  - summary: >-
      No test registers the session and rail bridges against one window to show `note` never replaces `work` on the shared projection.
    evidence: |-
      The holder's identity and each bridge are tested separately, and a source-text test pins that both call `personaProjectionFor`. The cross-bridge case needs a two-bridge fixture.
    location: >-
      src/main/persona-states.test.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 2.6 (epics.md "Every indicator means something", FR103, FR104, UX-DR35, NFR17, NFR18). Every tile and the chat header read `idle` because nothing produces persona state: `Shell` is given no `states`, and `persona:state` is declared in the contract but never emitted.

**Approach:** Main holds a persona-state projection folded from domain events, aggregated per `agentId` across sessions, and emits `persona:state` once per aggregated change. The renderer stores the last state per persona and feeds `Shell.states`. `work` shows an elapsed counter derived from the state's `at`, ticking each second.

## Boundaries & Constraints

**Always:**
- One source each. `work`: any session of the agent has a turn in flight, from `session:opened` (activation), a successful `turn.send` or `run:started` until `session:awaiting-turn` (so quiet subagent phases stay `work`). `error`: the agent's last run ended `run:failed`/`run:stopped`; cleared by `run:finished` or the agent's next turn start. `note`: an owned file (`RailRow.owner.agentId`) changed on disk between rail snapshots; cleared by the agent's next turn start. `live`: a session has an attached long-running process (`attach`/`detach(sessionId)` on the projection; nothing calls them in this epic). `idle`: none of these.
- Precedence `work` > `error` > `note` > `live` > `idle`. A tile is the aggregate of every session with its `agentId`; sessions without `agentId` are ignored.
- The fold is pure: no I/O, the clock injected; `at` is the event's own `at`, else the injected `now`. The first rail snapshot a window sees is a baseline and raises no `note`.
- `skillsDisabled(state)` is true for `work` only, so `live` never disables skill buttons.
- Counter: `StateLine` renders `<word> · <elapsed>` for `work` only, mono, `1s`, `1m 05s`, `1h 02m`; ticking at 1s from a component mounted only while `work`, so no interval runs otherwise. It stays out of aria-labels and the live region. Every dot keeps its word.
- Pulse stays off under reduced motion through the existing global rule; no new token, literal or animation.

**Never:**
- No change to the 14 events, 7 commands or `PersonaStateChanged`'s shape. No persistence or re-emit on reconnect (2.7), stop control (Epic 3), handoff, live-region announcement of state, or error text on a tile.
- Nothing sets a state for display: no renderer flag, timer or default-to-work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Session opens | `session:opened` for agent A | `persona:state` A `work` (activation turn) | none |
| Turn ends | `session:awaiting-turn` | A `idle`, if nothing else holds it | none |
| Two sessions | A has two sessions, one in flight | A `work` until both are free; one event per change, not per session | none |
| Quiet phase | in flight, no frames | stays `work` | none |
| Run fails | `run:failed`, then `session:awaiting-turn` | A `error` after the turn ends; next turn start clears it | none |
| Owned file changes | `rail:changed` shows an owned row changed | owner `note` | unowned rows ignored |
| First snapshot | no previous rail snapshot | baseline, no `note` | none |
| Live process | `attach(sessionId)` while idle | A `live`; skill buttons stay enabled | none |
| Session closes | `session:closed` | its work and live contribution removed; `error`/`note` stay | none |
| No change | event leaves aggregate unchanged | nothing emitted | none |

</intent-contract>

## Code Map

- `src/shared/events.ts:51,63` -- `PersonaState`, `PersonaStateChanged` (`at` = when the state began); read-only.
- `src/main/fold/persona-state.ts` (new) -- pure fold: input `ContractEvent` plus internal `turn:started`/`process:attached`/`process:detached`; aggregate by agent; `skillsDisabled`. Modelled on `fold/turn-end.ts`, `fold/elapsed.ts`.
- `src/main/projections/personas.ts` (new) -- wraps the fold, diffs the aggregate, calls `onChange(event)`; `apply`, `seedRail`, `attach`, `detach`. Modelled on `projections/rail.ts`.
- `src/main/session-bridge.ts:95-250` -- feed `session:*` and runs; `turn.send` success is `turn:started`; emit `persona:state` through `emit`. Owns `SESSION_EVENT_CHANNEL`.
- `src/main/rail-bridge.ts:90-130` -- first `rail:get` reply seeds the baseline, later pushes `apply` `rail:changed`.
- One per-window shared holder (new, in `src/main`) so both bridges feed the same projection; the channel constant moves with it and `session-bridge` re-exports it, since `tests/bridge-contract.test.ts:387` reads it there.
- `src/renderer/ui/chat/conversation-state.ts:182-320`, `use-conversation.ts` -- fold `persona:state` into a per-agent `{state, at}` map and expose it.
- `src/renderer/ui/app.tsx:105`, `shell/shell.tsx` (`states`, new `since`), `team/team.tsx`, `team/persona-tile.tsx`, `chat/chat-header.tsx` -- pass state and `at` down.
- `src/renderer/ui/status/status-dot.tsx` (`StateLine`), `persona-state.ts` (`STATE_TEXT` unchanged), `outputs/use-now.ts` (`useNow(1000)`), new `format-elapsed.ts`.
- Tests to extend: `session-bridge.test.ts` (event-name expectations), `rail-bridge.test.ts`, `conversation-state.test.ts`, `use-conversation.test.ts`, `status-dot.test.tsx`, `persona-tile.test.tsx`, `app.test.tsx`, `tests/session-contract.test.ts:122-130`, `tests/layering.test.ts`.

## Tasks & Acceptance

**Execution:**
- `src/main/fold/persona-state.ts` and `src/main/projections/personas.ts` -- the fold and projection, with tests for every matrix row (fold sequences with synthetic events, injected clock).
- `src/main/session-bridge.ts`, `src/main/rail-bridge.ts`, shared holder -- feed the projection and emit `persona:state`; adjust existing bridge tests.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts`, `app.tsx`, `shell.tsx`, `team.tsx`, `persona-tile.tsx`, `chat-header.tsx` -- carry state and `at` to the dots.
- `src/renderer/ui/status/status-dot.tsx`, `format-elapsed.ts` -- counter on `work`; DOM test that an interval exists only while `work` and that it advances at 1s under fake timers, plus a reduced-motion stylesheet assertion.

**Acceptance Criteria:**
- Given a session opens, when its turn is in flight, then the tile and chat header read `working` with a ticking elapsed counter, and `idle` once `session:awaiting-turn` arrives.
- Given `live`, when the persona has no turn in flight, then `skillsDisabled` is false; when a turn is in flight it is true.
- Given two sessions of one agent, then there is one tile and one aggregated state.
- Given no persona is working, then no 1s interval is running.
- Given `prefers-reduced-motion: reduce`, then the `work` dot still has the amber fill and the counter still advances.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 22, false 2, maybe-false 1 (blind 13, edge 7, verification-gap 1 plus 2 other that repeat blind/edge ones, intent-alignment 2 descriptive)
- findings:
  - `[low]` `patch` `skillsDisabled` has no consumer, and lives in main's fold where the renderer cannot import it (blind, edge, verification-gap other) — moved with its test to `src/renderer/ui/status/persona-state.ts`, where the Epic 3 skill buttons will be
  - `[low]` `defer` a crashed persona process reads `idle` with no `error` (blind) — see frontmatter
  - `[low]` `patch` a deleted owned file raises no `note` (blind, edge) — `foldRail` now raises `note` for the owner of a row that disappears; three fold tests added
  - `[low]` `defer` `note` cannot tell a persona's own writes from outside changes (blind) — see frontmatter
  - `[low]` `reject` queued message sending shows an `idle` flicker and restarts the counter (blind) — both are true: the turn did end and a new one began; the gap is one IPC round trip
  - `[low]` `reject` tile and header counters tick out of phase by up to a second (blind) — cosmetic; a shared clock adds machinery for no user harm
  - `[low]` `reject` `personaProjectionFor` ignores `now` after the first call (blind, edge) — both bridges pass the real clock in production; only a test could differ
  - `[low]` `defer` `run:finished` clears `error` without a `runId` check (blind) — see frontmatter
  - `[low]` `reject` rail bridge `Sender.send` typed loosely (blind) — developer-only typing nit
  - `[low]` `reject` renderer holds two parallel maps, state and since (blind) — both are derived from one map in one memo, so they cannot drift; merging touches five files
  - `[low]` `reject` reduced-motion and `.state =` source-text tests are brittle (blind) — the same style as the repo's other contract tests
  - `[false]` `reject` first rail baseline is protected only by a comment and a write could slip in before the seed (blind) — `projection.ready()` commits without pushing and `seedRail` runs in the same synchronous callback, so no watcher event can interleave
  - `[low]` `reject` spec and diff disagree on a test file name, a long line, empty logs (blind) — the fix would be to edit the spec; lint passes
  - `[low]` `reject` `session:awaiting-turn` could precede `session:opened` (edge) — spawn resolves on the `spawn` event and a result takes seconds; no demonstrated path
  - `[low]` `reject` `run:started` mid-turn clears an earlier `note`/`error` (edge, verification-gap other) — `run:started` is a turn start per the spec and has no producer until Epic 3
  - `[low]` `reject` a `changing` to `saved` push after a turn start re-raises `note` (edge) — the file did change; `note` is correct
  - `[false]` `reject` a repeated `session:opened` overwrites `live` (edge) — main emits it once per session
  - `[low]` `reject` deleted owned row (edge) — same root cause as the deletion patch above
  - `[low]` `reject` `personaProjectionFor` clock (edge) — same as the clock finding above
  - `[low]` `reject` `skillsDisabled` claim has no consumer (edge) — same root cause as the `skillsDisabled` patch above
  - `[maybe-false]` `defer` no test runs both bridges against one window (verification-gap) — see frontmatter; the production wiring is the same WebContents object and a source test pins both callers
  - `[low]` `reject` run:started clearing (verification-gap other) — same as the `run:started` row above
  - `[low]` `reject` `skillsDisabled` no consumer (verification-gap other) — same as the patch above
  - `[note]` `reject` commit and close are not in the diff (intent-alignment) — done at finalisation
  - `[note]` `reject` no real Electron launch; the main-to-renderer hop is tested only through fakes (intent-alignment) — recorded as a residual risk

## Design Notes

`note` and `error` clearing is not stated in the planning documents, which define only their sources. This spec clears them at the persona's next turn start (and `error` also on `run:finished`) so they remain facts until the persona acts again. `live` has no producer until Epic 3 attaches a process, and `error` has no producer until Epic 3 emits run events; both are covered by fold tests with synthetic input, never hand-written fixtures. A session that exits mid-turn raises no `error`, because no run event says so.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary:** Each persona's state is now a projection held in main. It is folded from session, run and rail events, aggregated per `agentId`, and emitted as `persona:state` once per change. The tile and the chat header show it. A persona at work shows `working · 1m 05s`, ticking each second from a counter that exists only while someone works. Precedence is `work` > `error` > `note` > `live` > `idle`.

**Files changed:**
- `src/main/fold/persona-state.ts`, `src/main/projections/personas.ts`, `src/main/persona-states.ts` -- the pure fold, the projection, and the per-window holder that owns `SESSION_EVENT_CHANNEL`.
- `src/main/session-bridge.ts`, `src/main/rail-bridge.ts` -- feed the shared projection; `turn.send` success is a turn start; the first rail snapshot is the baseline.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts`, `app.tsx`, `shell/shell.tsx`, `team/team.tsx`, `team/persona-tile.tsx`, `chat/chat-header.tsx` -- store and carry state and its start time.
- `src/renderer/ui/status/status-dot.tsx`, `status-dot.css`, `format-elapsed.ts`, `persona-state.ts` -- the elapsed counter and `skillsDisabled`.
- Tests: fold, projection, holder, both bridges, conversation state and hook, tile, shell, app, counter DOM test, `tests/indicator-contract.test.ts`, `tests/layering.test.ts`, `tests/session-contract.test.ts`.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2-6 marked done.

**Review:** 25 findings. Patches applied: 2 (both low). Deferred: 4 (see frontmatter). Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high, no medium patched).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (1827 unit, 55 watcher) and `npm run build` exit 0 after the patches.

**Residual risks:** No Electron launch or real `claude` run; the main-to-renderer hop is covered through fakes. `live` and `error` have no producer until Epic 3. `note` and `error` clearing at the next turn start is this spec's own rule, as the planning documents state only their sources. State is not re-emitted after a window reload (Story 2.7).
