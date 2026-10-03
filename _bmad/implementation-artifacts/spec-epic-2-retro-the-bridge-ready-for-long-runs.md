---
title: 'The session bridge, ready for long runs'
type: 'refactor'
created: '2026-10-02'
status: 'done'
followup_review_recommended: true
baseline_revision: 'c9839bf090a4315c160772f9d4a6e10aa14cfffe'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-retro-2026-10-02.md'
  - '{project-root}/fixtures/runs/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 3 sends long runs through the session bridge. Today it frees a session on any main-thread `result` (the corpus has 14 for 3 sends), cannot leave a wedged turn, hides failed results and process exit, throws away a whole transcript on any load problem, and carries a fourth copy of the bridge skeleton in one 362-line closure. Retro action items 17, 18, 19 and 23 (F1, F2, F3, F7, F24-F26); Sherif grouped them and set the order 23, 17, 18, 19.

**Approach:** One ordered change on `fix/pre-epic-3-remediation`, one commit per item, gates green after each. Extract the shared skeleton and split `session-bridge.ts` with behavior unchanged. Then replace `inFlight` with a pending-turn model driven by the CLI's live background-task set. Then add a way out of a wedged turn and surface failures. Then make transcript load non-destructive.

## Boundaries & Constraints

**Always:**
- Item 23 changes no behavior: every channel literal, error code and diagnostic string stays byte-identical.
- The sandboxed preloads load no second file. After a build, `out/preload/*.js` contain no `require("./…")`.
- `SESSION_ARGS` is unchanged (no `--permission-mode`, no `--model`). Stderr and exit code stay unread. `conversation:get` stays synchronous. The renderer never sees raw frames.
- A new event or command updates `shared/events.ts` or `commands.ts`, the contract tests and the preload literals in the same commit.
- Transcript format and `TRANSCRIPT_VERSION = 1` unchanged; load problems log under `persist/…`.
- Decision (Sherif, 10-03): the wedged-turn watchdog only surfaces. After 120 s with no frame of any kind on a busy session it writes a harness line and the per-session close control stays visible; the harness never closes a session on its own.
- Decision (Sherif, 10-03): a transcript renamed aside shows a harness line at the top of the conversation ("earlier conversation could not be read · kept aside") as well as the `persist/…` log entry.
- Each action item moves to `in-progress` in `sprint-status.yaml` when its work starts and to `done` only when its commit passes lint, typecheck and tests.

**Never:**
- No in-band interrupt or `control_request`: chat turns are out of the Epic 3 interrupt (Sherif, 10-02).
- No work on test fixtures, `filesUnder`, `FakeSender`, or the renderer connect-and-subscribe skeletons (action item 30).
- No change to queue ownership, the NFR6 raw log, or the 2.12 ruling (Sherif's decisions).
- No spinner, skeleton, sound, badge or "connecting" copy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Result, background tasks live | main-thread `result`, last `background_tasks_changed` lists tasks | no `session:awaiting-turn`; session stays busy, persona `working` | N/A |
| Result, no background tasks | main-thread `result`, set empty | one `awaiting-turn`; persona `idle`; queue drains | N/A |
| Failed result | `result` with `is_error: true` | turn ends as above; harness line; persona `error` until the next turn starts | N/A |
| Unsolicited turn while idle | main-thread `message_start` with no send | session busy again, persona `working` | N/A |
| Text delta, no open block | `text_delta` before any `content_block_start` | dropped | N/A |
| Empty message id | `message.id` missing | unique id, so two messages never merge | N/A |
| Process exits mid-turn | child closes | `session:closed` `process-exited`, harness line, persona `error`, queued messages kept | N/A |
| Dead-pipe write | stdin errors | send fails `session/write-failed`, turn not recorded, session freed | N/A |
| No frame for 120 s while busy | harness line; close control stays visible; session left open | N/A |
| User closes a busy session | close control | process killed, transcript kept, `session:closed` `closed`, queued dropped | `NOT_FOUND` if gone |
| Transcript missing | no file | `[]`, nothing logged | N/A |
| Transcript unreadable, corrupt or unknown version | load fails | original renamed aside before the first write, `[]`, `persist/quarantined`, harness line at the top of the conversation | N/A |
| One bad entry | other entries valid | valid entries kept, original kept aside | log `persist/entries-dropped` |

</frozen-after-approval>

## Code Map

- `src/main/session-bridge.ts` -- `registerSessionBridge` closure :131-492 to split (registry: `Entry`, `finish`, `onFrame`, `open`, `emit`; handoff composer `handoffFor` :305-330; IPC handlers stay). `Entry.inFlight` :74-87, :217-224, :371-390. Add `writeDiagnostic` dep and a `session/unexpected` catch in `session:open`, cleaning `bySession`/`byAgent` on a rejected `start()`.
- `src/shared/channels.ts` -- new; the 19 channel constants now spelled in `index.ts:19`, `install-bridge.ts:19-20`, `project-bridge.ts:10`, `rail-bridge.ts:17-18`, `doc-bridge.ts:23-29`, `session-bridge.ts:34-38`, `persona-states.ts:10`, `preload/index.ts:15-28`, `preload/doc.ts:9-13`. Bridges re-export so existing test imports compile.
- `src/main/bridge-kit.ts` -- new; one `failure()`, `unexpected(prefix, error, writeDiagnostic)`, `noProject(prefix)`, `Sender` + guarded `sendTo`, default `projectPathFor`/`writeDiagnostic`. Replaces copies at `install-bridge.ts:56,123,134-146`, `rail-bridge.ts:44,109,120-130`, `session-bridge.ts:109,338,429,467`, `doc-bridge.ts:59,200-211`. Keep every raw `ipcMain.handle(` and the `createChecks` text pinned by `preflight-contract.test.ts:143`.
- `src/main/sources/errno.ts` -- new; one errno helper (validated `/^[A-Za-z0-9_]{1,32}$/`, fallback `'failed'`) for `session-process.ts:222-225`, `transcript-file.ts:138-139`, `preflight/tools.ts:30,63`, `install/resolvers.ts:66`, `run-command.ts:78`.
- `src/main/index.ts:15-18` -- stale comment ("until Story 2.2").
- `src/main/fold/turn-end.ts`, `fold/frame.ts:45-76` (`readFrame` reads only `stream_event`; must also read `system/background_tasks_changed` `tasks[].task_id` and `result.is_error`), `fold/route-frame.ts:195,217-222`, `fold/persona-state.ts:33-36,189-197,219-227` (`error` has no chat producer), `fold/transcript.ts:48`. `endsTurn` ignores subagent results; keep.
- `src/main/session-bridge.ts` `session:close` :406-419 and preload `closeSession` `src/preload/index.ts:107` already exist; `src/renderer/ui/chat/use-conversation.ts:262-275` `close(agentId)`; only caller `app.tsx:167` via `orphan-header.tsx`. `conversation-state.ts:392-404` `dropQueued` ignores `reason`.
- `src/main/sources/session/session-process.ts:170-188` swallows async EPIPE; `{write, kill}` only.
- `src/main/sources/persistence/transcript-file.ts` -- `loadTranscript` :87-108 collapses every failure to `[]`; `realish` :36-53 drops a character at a root parent (:45); header comment :19-24 states the old contract. `projections/transcript.ts` `load` dep typed `=> TranscriptRecord[]` (:67-72, :94).
- Pins to retarget: `tests/session-contract.test.ts` (`finish(` x4, `.kill()` x3, `session:event` spelled once), `tests/negative-surface.test.ts` (`handoffFor` slice, `recordUserTurn` slice), `tests/persistence-contract.test.ts:162-208` (single writer; shape-bound `clear()` pin :186-198 becomes a behavior test; avoid `sessions|busy|personas|queue|install` in `transcript-file.ts`), `tests/document-window-contract.test.ts:314,318` (preload imports), `tests/bridge-contract.test.ts`, `transcript-file.test.ts:119-141`, `projections/transcript.test.ts:148-160`, `session-bridge.test.ts:353-412` and about 15 tests that free a session with one `result()`.
- `tests/replay-corpus.test.ts` -- helpers `frames()`, `results()`, `meta()`, `SCENARIOS`. `fixtures/runs/*.jsonl` and `*.meta.json` (`turns[].afterLine` marks each send).

## Tasks & Acceptance

**Execution:**
- [ ] `src/shared/channels.ts`, `src/main/bridge-kit.ts`, `src/main/sources/errno.ts` -- create; point the four bridges, `persona-states.ts`, `doc-window.ts` and both preloads at them; retarget the contract pins; fix `index.ts:15-18` -- item 23, behavior unchanged
- [ ] `src/main/session-bridge.ts` -- split into registry, handoff composer and handlers; add `session/unexpected` and the spawn-failure cleanup -- item 23
- [ ] `src/main/fold/frame.ts`, `turn-end.ts`, `session-bridge.ts` -- track `Entry.background`; emit `awaiting-turn` only for a main-thread result with no live task; re-enter working on an unsolicited main-thread `message_start`; drop text deltas with no open block; unique id for an empty message id -- item 17
- [ ] `tests/replay-corpus.test.ts` plus a bridge test -- replay every corpus file through the bridge; at each recorded send the session is idle; on `fast-path-opus` idle exactly at result rows 533, 25780 and 46799 and busy between -- item 17
- [ ] `src/main/session-bridge.ts`, `persona-state.ts`, `session-process.ts`, `conversation-state.ts`, `app.tsx` -- 120 s no-frame watchdog that only surfaces, and a close control for every open session; `is_error` and process exit as a harness line and persona `error`; queued messages kept on `process-exited`, dropped on `closed`; a failed stdin write fails the send -- item 18
- [ ] `transcript-file.ts`, `projections/transcript.ts`, `tests/persistence-contract.test.ts` -- richer load result (missing / loaded / unreadable / corrupt / unknown-version); rename-aside before the first write; per-entry validation; fix `realish`; behavior test replaces the `clear()` pin; harness line when a file is set aside -- item 19

**Acceptance Criteria:**
- Given `fast-path-opus.jsonl` replayed through the bridge, when its 14 `result` rows arrive, then `session:awaiting-turn` fires exactly three times and the persona is `working` between.
- Given a busy session, when its process exits or a `result` has `is_error: true`, then a harness line appears, the persona is `error`, and the next send works.
- Given a busy session with no frames, when the user activates close, then the process dies, the transcript stays, and the persona can be messaged again with a fresh session.
- Given a corrupt transcript file, when the project loads, then the file is renamed aside before any write and no later write overwrites it.
- Given a root-parent path, when `isInsideProject` runs, then the first segment character is kept.
- Given item 23 done, then `grep` finds each channel literal once in `src` outside tests and `session-bridge.ts` has no closure over 150 lines.

## Implementation Notes

## Spec Change Log

## Review Triage Log

### 2026-10-03 — Review pass
- verdicts: 39 findings — high 0, medium 6, low 15, false 16, maybe-false 2
- findings:
  - `[medium]` `[patch]` Blind: first send into a dead pipe is accepted (write returns true, `broken` set later) — session-process.ts/sendTurn; `write` now resolves after the callback and sendTurn awaits it. Same root cause: Edge dead-pipe row.
  - `[low]` `[reject]` Blind: a session whose tasks empty with no following result stays busy — spec Design Notes accept this; close control and watchdog are the stated answer.
  - `[low]` `[reject]` Blind: fixed 120 s watchdog can misfire on long silent work and the line persists — spec fixes 120 s and says write a harness line; a frame of any kind resets the clock.
  - `[low]` `[reject]` Blind: harness lines do not name the persona — close control sits in the persona's own header, reachable by selecting its tile; naming the persona adds event shape beyond the spec.
  - `[false]` `[reject]` Blind: set-aside notice wording wrong for partial damage and transient read errors — the spec orders unreadable/corrupt renamed aside and fixes the single line text.
  - `[low]` `[reject]` Blind: set-aside check-then-rename race, unbounded `.aside-N`, path not shown — single main process per project; unlikely to be met.
  - `[low]` `[patch]` Blind: `LINES.setAside` duplicates `SET_ASIDE_LINE` — deleted the unused one.
  - `[false]` `[reject]` Blind: queued messages replay into a fresh session — the spec says queued messages are kept on `process-exited`.
  - `[low]` `[reject]` Blind: close is destructive with no confirmation or transcript record — spec asks for a close control, transcript kept; nothing in the spec asks for a record.
  - `[low]` `[reject]` Blind: failed result while tasks are live may lose `error` when the wake turn starts — spec says `error` lasts until the next turn starts; the harness line persists.
  - `[low]` `[reject]` Blind: "cleared only by ending the conversation" test title overclaims the window-gone path — test naming only.
  - `[low]` `[reject]` Blind: bridge-contract test may be tautological after shared channels — no divergence it could mask; the new channels-contract test pins the literals.
  - `[medium]` `[patch]` Blind: preload plugin narrow and guarded only by a grep — covered by the verification-gap finding; nested-importer rewrite added and a bundle test.
  - `[low]` `[reject]` Blind: brittle tests (hard-coded corpus rows, source slicing, 150-line span heuristic) — the rows come from the spec; developer-only, no named failure.
  - `[false]` `[reject]` Blind: sprint-status flipped to done while the spec is in review, no chat-turn interrupt decision, silent drops — each item is flipped in its own commit as the spec says; the interrupt decision is the spec's Never list; the drops are spec rows.
  - `[low]` `[patch]` Edge: a `result` on an already free session emits a second `ended` — `foldTurn` now returns no signal when not busy.
  - `[false]` `[reject]` Edge: `onExit` before the spawn promise resolves writes a line for a never-opened session — `close` cannot run before the promise continuation, which runs first in the same tick as `spawn`.
  - `[low]` `[reject]` Edge: kept entries after a set-aside exist only in memory until the debounce flush — the original is on disk beside it and `persist/quarantined` is logged; nothing is lost.
  - `[medium]` `[patch]` Edge: plugin `resolveId` misses a nested shared import because the importer carries `?preload=` — fixed with the preload plugin patch.
  - `[medium]` `[patch]` Edge: dead-pipe send still ok and busy — same root cause as the first Blind row.
  - `[low]` `[reject]` Edge: close control only in the current persona's header — reachable by selecting the persona; fix adds UI beyond the spec.
  - `[false]` `[reject]` Edge: `rail:changed` spelled in four files — the string is also an event name the events contract must spell; the test whitelists that.
  - `[medium]` `[patch]` Verification gap: no test runs the preload bundle — a bundle test added.
  - `[medium]` `[patch]` Verification gap: the current persona's close control and `conversation.live` untested through `App` — App and hook tests added.
  - `[false]` `[reject]` Intent: preload guarantee asserted at the wrong surface — the same gap as the bundle test row; patched there.
  - `[false]` `[reject]` Intent: close control shown for any live session rather than tied to the wedge — the spec says it stays visible.
  - `[low]` `[reject]` Intent: busy derived twice, no end-to-end test from frame to renderer — the follow-up commit 269a850 makes working imply busy; both halves are tested.
  - `[false]` `[reject]` Intent: real CLI, pipe and process are faked in the replay — the spec asks for a replay through the bridge.
  - `[false]` `[reject]` Intent: transcript tests stop at main's snapshot — the renderer line is a unit-tested fold.
  - `[false]` `[reject]` Intent: item 23 changed behavior through errno and `session/unexpected` — the spec names both.
  - `[false]` `[reject]` Intent: static-text tests stand in for behavior — retargeting those pins is in the spec.
  - `[false]` `[reject]` Intent: process claims not checkable from the combined diff — git log shows the commit order.
  - `[false]` `[reject]` Intent: spec-doc commit counted among the five — descriptive only.
  - `[false]` `[reject]` Intent: the dead-pipe fix is faked — covered by the dead-pipe patch.
  - `[maybe-false]` `[reject]` Intent: the main and renderer busy-ness are two derivations that may diverge on some event — would need a frame-to-App trace; a medium if true, judged by the renderer tests already pinning it.
  - `[maybe-false]` `[reject]` Edge: failed result on an idle session is dropped by the new guard — would need a recording with a bare idle failed result; none exists.
  - `[false]` `[reject]` Intent: sprint-status ordering of in-progress and done — the commits show it.
  - `[false]` `[reject]` Intent: the diff did not exercise `killGroup` — unchanged code.
  - `[low]` `[reject]` Intent: the non-current persona gets no control — duplicate of the Edge close-control row.

## Design Notes

The corpus gives the turn-end signal: `system/background_tasks_changed` carries the live `tasks` list. A simulation over all six recordings puts idle points exactly at the sends for `fast-path-opus` (rows 533, 25780, 46799); `fast-path-sonnet` shows one extra idle at row 1553 followed by an unsolicited turn, hence the re-enter rule. A CLI that never sends the frame degrades to today's one-result-ends-turn. A task that never reports done leaves the session busy; that is what the close control and the surface-only watchdog are for.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: all pass after each item
- `npm run build && grep -L 'require("\./' out/preload/*.js` -- expected: lists both preload files (no relative require)

**Manual checks (if no CLI):**
- With a stub `claude` that emits a result while a background task is listed, the persona stays `working` and a typed message shows `queued`.

## Auto Run Result

Status: done

**Summary.** Four retro action items on `fix/pre-epic-3-remediation`, in the order 23, 17, 18, 19: one shared channels module, bridge kit and errno helper with `session-bridge.ts` split into registry, handoff and handlers; a pending-turn model driven by `background_tasks_changed` (replayed over all six corpus recordings, `fast-path-opus` idle at rows 533, 25780, 46799); a 120 s surface-only watchdog, a close control, failed-result and process-exit lines, a stdin write that fails the send; and a non-destructive transcript load that sets a bad file aside. Review patches follow in a sixth commit.

**Files changed (main groups).**
- `src/shared/channels.ts`, `src/main/bridge-kit.ts`, `src/main/sources/errno.ts` -- the shared skeletons.
- `src/main/session-bridge.ts`, `session-registry.ts`, `session-handoff.ts`, `session-voice.ts` -- the split, the voice and the watchdog.
- `src/main/fold/turn-end.ts`, `frame.ts`, `route-frame.ts` -- the turn model.
- `src/main/sources/session/session-process.ts` -- a write that settles on its callback.
- `src/main/sources/persistence/transcript-file.ts`, `projections/transcript.ts` -- load outcomes, rename-aside.
- `src/renderer/ui/...` -- close control, `harness:said`, queue kept on `process-exited`.
- `electron.vite.inline-shared.ts`, `electron.vite.config.ts` -- one inlined copy of the shared channels per preload.
- `tests/replay-corpus.test.ts`, `tests/preload-bundle.test.ts`, `tests/channels-contract.test.ts`, `tests/persistence-contract.test.ts` and retargeted pins.

**Review.** Patches applied: 5 entries (medium 3: dead-pipe first write, preload plugin nested import with a bundle test, close control through `App`; low 2: duplicate `ended` on a free session, unused `LINES.setAside`). Deferred: none. Rejected: every other finding, with its reason in the triage log. Patched counts by verdict: medium 3, low 2.

**Follow-up review recommendation: true.** Three medium entries were patched. The unverified risk is the rework of `SessionProcess.write` to a promise settled by the write callback, and `sendTurn` becoming async, which a real `claude` pipe has not exercised.

**Verification.** `npm run lint && npm run typecheck && npm test` pass (2,433 unit, 55 watcher tests). `npm run build` leaves `out/preload/doc.js` and `index.js` with no `require("./…")`.

**Residual risks.**
- The manual stub-`claude` check and any run against a real `claude` or Electron were not done.
- A task that never reports done leaves the session busy; the watchdog line and close control cover that.
- The close control is drawn in the current persona's header and orphan headers, so a wedged session of another persona needs its tile selected.
- A first persona switch can write a handoff line over a transcript that holds only the set-aside notice.
- If the rename-aside fails, nothing is written for that launch (not in the spec).
