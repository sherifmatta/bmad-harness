---
title: 'The work that carries on after a stop has a card'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_revision: '353feead212ed2d139896087d6ae1b392e3f8bbc'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A stop acknowledged with background tasks still live leaves the session busy, so work the persona then does inside that same busy turn raises no `resumed` signal and starts no run.
    evidence: |-
      `foldTurn` signals `resumed` only on a `message-start` while the session is free; after a failed `result` with tasks live the session stays busy (`failed-while-pending`) until a main-thread `result` frees it. None of the recordings reaches this state (the CLI stops the tasks before the interrupted `result`), so it is unverified that it occurs; a live recording of a stop whose interrupted `result` still has tasks live would settle it.
    location: >-
      src/main/session-registry.ts:222
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** On a real `claude` 2.1.285 an in-band interrupt sent while background subagents were live ended the turn with a failed `result` and the CLI then ran a turn nobody sent, in which the persona resumed the original instruction and `Write`s the document. The harness shows the run `stopped`, starts no run for the resumed turn, and the write has no card, no stop control and no completion notification, so the user believes the persona has halted while it is still writing (FR83, FR84, FR31, FR35; Epic 3 retro action item 1).

**Approach:** Main holds the stopped run's `code` and plan on the session until something clears them. When a main-thread message begins that nobody sent (the `resumed` signal of the turn fold) while they are held, main says once, in the harness's own voice, that it carried on, and starts an ordinary run for the turn with the same code and plan and a new run id. Nothing is interrupted, offered or resumed by the harness. Main only.

## Boundaries & Constraints

**Always:**
- A run starts for a turn nobody sent only when the session's last run ended `stopped` because the user pressed stop, no turn has been sent and no menu entry dispatched since, and no run is in flight. The empty turn the CLI runs first (`num_turns: 0`, no `message_start`) is no `resumed` signal and starts nothing.
- The held `code`, menu and plan (the stopped run's plan as it then stood, pulled sections included) live only on the session's entry in memory; never persisted. They are cleared when a run starts (user's or the continuation), when a run ends any way other than stopped, and when the user sends a turn or dispatches an entry.
- The continuation is an ordinary run through `startRun`/`endRun`: its own run id from the bridge's id source, `run:started` carrying the same `agentId` (the session's), `code` and `plan`, notes, documents, rail annotation, the stop control, one notification, and the terminal event from the per-turn `result`. A second stop interrupts it as Story 3.7 specifies; if the CLI resumes again, the same rule starts a further run.
- The harness line is said before `run:started`, through the existing `say` (a `harness:said` and a transcript sysline), placeholder copy `carried on after the stop · a new run follows it`: lower case, `·`-separated, no terminal punctuation, a fact. The persona's own turns are unchanged.
- Every other unsent turn starts no run: a session whose last run finished or failed, one the user has sent a turn or dispatch to since the stop, one that never ran, one with a run in flight.

**Never:**
- No new event name, command, channel or payload field; no change to `STOP_ACK_MS`, `STOP_RESULT_MS`, the interrupt, or what `stopRun` writes. The harness never writes an interrupt the user did not ask for, and never offers, suggests or performs a resume.
- No change to `src/renderer/**`, `src/shared/**` or `src/preload/**` other than the shared test helper in `src/renderer/ui/testing/`; the card adds no control, dialog, badge, toast, sound, denominator, spinner or the word "resume".

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Resumed after a user stop | run ended `stopped` by the user; then `message_start` on the main thread with the session free | `harness:said` carried-on line, then `run:started` (same session, `code`, `plan`; new run id); its writes are the new card's documents | N/A |
| Empty turn first | after the stop, a `result` with no message of its own | no run, no line | N/A |
| Continuation ends | the turn's `result` succeeds / `is_error` | `run:finished` / `run:failed` on the continuation's id; hold stays cleared | N/A |
| Continuation stopped | user presses stop on it | `run:stopped` on the interrupted `result`; hold set again, so a further resume starts a further run | N/A |
| Unsent turn after finish or failure | last run `finished` or `failed`, then `message_start` | no run, no line (as today) | N/A |
| User acted since the stop | `turn.send` or `menu.dispatch` after the stop, then an unsent turn | no run; the hold is gone | N/A |
| Never ran | fresh session, a turn nobody sent | no run | N/A |
| Run in flight | a background subagent finishes during a run | part of that run; no second run | N/A |
| Stop interrupted before subagents | `interrupt-inband-tasks-live`, `interrupt-inband-idle` | no second run | N/A |
| Fallback stop | stop unacknowledged: session killed and closed | entry closed; nothing starts | N/A |
| Reload / relaunch | window reloaded or app relaunched | card re-emitted from main like any card, dead and no stop after a relaunch; nothing started for a turn that has not happened | N/A |

</intent-contract>

## Code Map

- `src/main/session-registry.ts:49-70,168-232,411-435` -- `Entry` (add `afterStop`), `foldFrame` (the `resumed` branch at :208 is where the line and the run start, before `routeFrame` so the new run id tags the turn's events; `FrameSinks` needs the run-id source), `open` (initial `afterStop: undefined`), `createSessionRegistry` deps (add `newRunId`), `onFrame` sinks.
- `src/main/session-run.ts:60-78,184-238` -- `ActiveRun` has `code`, `menu`, `plan`; `startRun` (clear `afterStop`, takes a `TemplatePlan` `{spine, menu}`), `endRun` (set `afterStop` on `'stopped'`, clear on every other ending). Add `StoppedRun` type.
- `src/main/session-bridge.ts:141-170,197-212,428-460` -- `writeTurn` (a user turn written: clear `entry.afterStop`; both `sendTurn` and `dispatchMenu` go through it), registry construction (pass `newRunId` already on `ctx`; hoist it above the registry).
- `src/main/session-voice.ts:17-28` -- `LINES`; add `carriedOn` with a placeholder-copy comment beside `stopEnded`.
- `src/main/fold/turn-end.ts:74-77` -- the `resumed` signal: `message-start` while free. Read-only; the empty turn is a `result` while free and signals nothing.
- `src/main/session-stop.ts` -- read-only; the stop mechanism is unchanged.
- `src/main/session-stop.test.ts:454-525` -- the three-recording replay; the mid-write test at :478 pins "no run" and is replaced by the continuation (`recording()` helper, `running()`, `flush`, `advance`, `snapshot`). Add unit rows for each matrix scenario here.
- `fixtures/runs/interrupt-inband-tasks-live-mid-write.jsonl` -- frames 336 (init), 337 (empty `result`, `num_turns: 0`), 340 (`message_start`, the resumed turn), `Write` of `notes.md`, 1432 (`result` success). `interrupt-inband-tasks-live` and `interrupt-inband-idle` yield no second run. `fixtures/runs/README.md` -- the row for the mid-write recording says "no run"; update.
- `src/renderer/ui/chat/epic-3-audit.dom.test.tsx` -- `STAND_IN`, `SPINNER_MARKUP`, `DENOMINATOR`, `ARBITRATION`, `spoken` (move to a shared `src/renderer/ui/testing/audit-patterns.ts`). `tests/run-card-parity.test.ts` -- precedent for a test in `tests/` that imports main and the renderer's `foldEvent` and prose store. `tests/negative-surface.test.ts` -- static guards on spoken words and the contract's counts; add the new line.
- `src/renderer/ui/chat/conversation-state.ts:554-590` -- `run:started` already births a second card for the same session and marks it busy; no renderer change.
- `_bmad/implementation-artifacts/sprint-status.yaml`, `epic-3-context.md`, `deferred-work.md` -- 3.15 `done`, item 48 closed, the deferral marked done.

## Tasks & Acceptance

**Execution:**
- `src/main/session-run.ts` -- `StoppedRun` type; `endRun` sets `entry.afterStop` from the run on `'stopped'` and clears it otherwise; `startRun` clears it -- the hold and when it goes
- `src/main/session-registry.ts` -- `Entry.afterStop`; `newRunId` dep; in `foldFrame`'s `resumed` branch, when `afterStop` is held and no run is in flight, `say` the line then `startRun` with the held code and `{spine: plan, menu}` -- the rule
- `src/main/session-bridge.ts` -- clear `afterStop` in `writeTurn` after a successful write; pass `newRunId` to the registry -- user action clears the hold
- `src/main/session-voice.ts` -- `LINES.carriedOn` -- the harness's one line
- `src/main/session-stop.test.ts` -- replace the mid-write "no run" replay by the continuation (`run:started`, `run:stopped`, `run:started` same session and code and plan and a new id, the `notes.md` events on the second card, `run:finished`, exactly one `harness:said`, the empty turn starting nothing); `tasks-live` and `idle` yield no second run; one test per remaining matrix row; the second stop on the continuation; the line's shape -- the matrix
- `src/renderer/ui/testing/audit-patterns.ts`, `epic-3-audit.dom.test.tsx` -- move the shared patterns -- reuse
- `tests/continuation-replay.test.tsx` (jsdom) -- replay `interrupt-inband-tasks-live-mid-write` through the real bridge and registry, fold the events with the renderer's `foldEvent` and prose store, mount `RunCard` and `RunCardLine` for the continuation card as born, streaming, finished and (second stop) stopped, and apply the audit's checks (no spinner, denominator, dialog, arbitration word, "resume", only its own controls, caret and `aria-busy` as the state is) -- the audit extended, cards built by the folds
- `tests/negative-surface.test.ts` -- the carried-on line is lower case, `·`-separated, unpunctuated, and carries no "resume", "continue", "retry" or guidance word; `src/main` writes no interrupt but `stopRun`'s -- the negative surface
- `fixtures/runs/README.md`, `_bmad/implementation-artifacts/{sprint-status.yaml,epic-3-context.md,deferred-work.md}` -- 3.15 `done`, item 48 closed
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given a run the user stopped and no turn or dispatch since, when a main-thread message begins that nobody sent, then `run:started` follows for the same session carrying the stopped run's `code` and plan, with its own run id, after one harness line, and the empty turn before it starts no run.
- Given the continuation, then every Epic 3.1 to 3.10 behaviour applies to it, it ends on its own `result`, and a stop on it ends it `stopped` with the session open; a further resume starts a further run and the harness interrupts nothing itself.
- Given a turn nobody sent in any other circumstance, then no run starts; the held code and plan are not persisted and a reload or relaunch starts nothing.
- Given the three recordings through the real bridge and registry, then `interrupt-inband-tasks-live-mid-write` yields `run:started`, `run:stopped`, `run:started`, the `notes.md` events on the second run, `run:finished`; the other two yield no second run.
- Given the audit, then a continuation card in each state, built from the recorded events by the folds, draws nothing Epic 3 promised not to.
- Given the full suite, lint, typecheck and build, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-06 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 15, false 5, maybe-false 2 (none patched; one deferred; twenty-one rejected)
- findings:
  - `[false]` `[reject]` Blind: the spec's `status` contradicts the tracking files marked done — the status is set at finalize, after triage, as the workflow orders.
  - `[low]` `[reject]` Blind: the real-`claude` check is not done or recorded, and the retro file is not updated — it is recorded as a residual risk under Auto Run Result; the retro is a finished document whose action item lives in sprint-status.
  - `[false]` `[reject]` Blind: no test that a subagent message cannot start a run — `readFrame` drops every frame with a non-null `parent_tool_use_id` (`fold/frame.ts:71`), so a subagent `message_start` never reaches the turn fold.
  - `[low]` `[reject]` Blind: the hold has no expiry — the story states it is held until a user turn, a dispatch, a run start or a non-stopped ending, and not persisted; a time bound is not asked for.
  - `[false]` `[reject]` Blind: the hold is set on any `stopped` ending, not only the user's — `endRun(…,'stopped')` is reached only from the fold when `stopping` is set, from `stopRun`'s fallback and from `finish` with `stopping`, all of which are the user's stop.
  - `[low]` `[reject]` Blind: tests filter `persona:state` — the persona fold's handling of `run:started` is the ordinary one and covered by its own tests; a flicker is not shown.
  - `[low]` `[reject]` Blind: no test that the continuation raises a rail annotation or a notification — both hang on the same `tell` path as every run's events; a duplicate harness for them is more than the gap is worth.
  - `[low]` `[reject]` Blind: the held menu may be spent — `pulledSections` already skips names the plan holds, so a duplicate is not produced.
  - `[low]` `[reject]` Blind: replay helpers use positional logic and a threshold (`index > 1`, `sentences.length > 20`, the recorder's cwd) — they follow the existing replay tests' own pattern and break loudly, not silently.
  - `[low]` `[reject]` Blind: the line's copy is ambiguous — it is the story's own placeholder for `bmad-ux`, which owns the words.
  - `[low]` `[reject]` Blind: the README row is long and repeats the deferred-work note — it states what the recording now yields; a shorter row buys nothing.
  - `[maybe-false]` `[defer]` Edge: a stop acknowledged with tasks live leaves the session busy, so the persona's work in that busy turn has no `resumed` signal and no card — the corpus does not reach this state; a recording of it would settle it. Deferred, medium unverified.
  - `[low]` `[reject]` Edge: after a `failed-while-pending` stop the hold is neither used nor cleared by the later `ended` — the story holds it until a user act, which is this behaviour; no expiry is specified.
  - `[low]` `[reject]` Edge: any failed `result` while `stopping` is true counts as the stop and so arms the hold — the stop semantics are Story 3.7's, unchanged here; a real failure coinciding with the press is rare.
  - `[low]` `[reject]` Edge: a failed write after a stop keeps the hold and no test pins it — keeping it is right (no user turn went in), and the matrix does not list it.
  - `[low]` `[reject]` Edge: pulled sections arrive as plain spine on the continuation's `run:started` — `run:started` has no `pulled` field and the story says "the same section plan"; no new payload field is allowed.
  - `[maybe-false]` `[reject]` Edge (claim): the Design Note says the next unsent turn after a tasks-live stop is still `resumed` — it is so only once a `result` has freed the session, which the covering test feeds; the same state as the deferred item and the fix would edit this build's spec.
  - `[low]` `[reject]` Edge (claim): "ended because the user pressed stop" is any failed result with `stopping` set — same as the failed-result row above.
  - `[false]` `[reject]` Intent: the diff holds no commit and the spec is `in-review` — both are done at finalize, after triage.
  - `[low]` `[reject]` Intent: the continuation's notification is not asserted — same as the notification row above.
  - `[low]` `[reject]` Intent: the audit mounts the stop button with a no-op handler and pins placeholder copy — the stop path is exercised at main level and a pinned string is how every harness line is guarded.
  - `[false]` `[reject]` Intent: the readings diverge on "close" — the spec, sprint status, epic context and deferred-work entry are all marked, and the commit is this step's.

## Design Notes

- **A hold on the entry, not on the run.** The stopped run is gone by the time the CLI resumes, so what it carried (`code`, menu, plan) is parked on the session's entry and consumed by the next run start. Nothing about it is persisted, matching the card's own "survives a reload, not a restart".
- **The `resumed` signal is the whole trigger.** `foldTurn` already says a main-thread `message_start` on a free session is a turn nobody sent; the empty turn has none, so it never trips it. A stop that ended on a failed `result` with background tasks live leaves the session busy until the wake frees it; the next unsent turn after that is still a `resumed` signal, so it needs no special case.
- **Start before routing.** The run is started before `routeFrame` folds the frame that began the turn, so the turn's document events carry the new run id and none is lost.
- **Clear on any user act.** `writeTurn` is the one place a user turn reaches the process, so clearing there covers a send and a dispatch alike (a dispatch's `startRun` clears it again).

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- With a real `claude`, run a skill that launches background subagents and writes a document, press stop after the subagents start, and see a second card appear with the carried-on line, a stop control on it and a notification when it ends. An unattended run cannot do this; record it as a residual risk.

## Auto Run Result

**Summary.** When a main-thread message begins that nobody sent on a session whose last run the user stopped, main says `carried on after the stop · a new run follows it` in the harness's voice and starts an ordinary run for it: the stopped run's `code` and plan, a new run id, started before the frame is routed so the turn's document events land on the new card. The stopped run's `code`, menu and plan are held in memory on the session's entry (`afterStop`), cleared by any user send or dispatch, any run start, or a run ending another way. The empty turn the CLI runs first, an unsent turn after a finished or failed run, on a session that never ran, or during a run, starts nothing. A second stop on the continuation works as in 3.7; the harness interrupts and offers nothing itself.

**Files changed.** `src/main/session-run.ts` (`StoppedRun`, hold set and cleared in `endRun`/`startRun`); `src/main/session-registry.ts` (`Entry.afterStop`, `newRunId` dep, the `resumed` branch); `src/main/session-bridge.ts` (`writeTurn` clears the hold, `newRunId` hoisted); `src/main/session-voice.ts` (`LINES.carriedOn`); `src/renderer/ui/testing/audit-patterns.ts` (the audit's patterns, shared); tests `src/main/session-stop.test.ts` (the mid-write replay now yields the continuation; the matrix), `tests/continuation-replay.test.tsx` (new: the recording folded by the renderer and the card mounted and audited), `src/renderer/ui/chat/epic-3-audit.dom.test.tsx`, `tests/negative-surface.test.ts`, `tests/stop-contract.test.ts`, `tests/terminal-replay.test.ts`, `tests/completion-replay.test.ts` (the recorder's follow-up turns are sent as the user's); `fixtures/runs/README.md`, `sprint-status.yaml` (3.15 and retro item 48 `done`), `epic-3-context.md`, `deferred-work.md` (resolution).

**Review.** 22 findings: patches applied 0; deferred 1 (a stop with tasks live leaving the session busy, unverified medium); rejected 21 with reasons in the log (false 5, low 15, maybe-false 1). By verdict: high 0, medium 0, low 15, false 5, maybe-false 2.

**Follow-up review recommended: false.**

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` unit 157 files, 3617 tests passed, watchers 3 files, 55 tests passed; `npm run build` exit 0. Matrix audit: every I/O row has a test in `session-stop.test.ts` (and the recording rows in `tests/continuation-replay.test.tsx`) that ran and passed.

**Residual risks.**
- Not seen with a real `claude`: that the second card appears with the line, its stop control and its notification, in a real window. An unattended run cannot make the live check.
- A stop acknowledged while tasks are still live (the interrupted `result` arriving with tasks live) is not covered: no recording reaches it (deferred).
- The line's copy is placeholder pending `bmad-ux`.
- The mid-write recording's first run had already begun a `Write` before the stop, so its card holds about 2.6 KB of prose and the continuation's card the full rewrite; the README's wording that the main thread "had not reached" the write is not quite what the frames show.
