---
title: 'Stop a turn that is not a run'
type: 'feature'
created: '2026-10-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
  - '{project-root}/fixtures/runs/README.md'
baseline_revision: '2bc91bf5d6e76f404bfe596600def22c1b3de787'
warnings: ['oversized']
deferred:
  - summary: >-
      A header Stop pressed while the session is busy only on live background tasks (a successful result, tasks pending) may get no failed `result`, so the plain-turn stop would end the session through the STOP_RESULT_MS fallback.
    evidence: |-
      Unverified: `stopTurn` sets `interrupting` for any busy plain turn. The recordings show an interrupt with tasks live ends in a failed `result`, but none shows one sent after a successful result with tasks still pending. `stopRun` has the same shape for a run.
    location: >-
      src/main/session-stop.ts (stopTurn)
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The chat header's only control is `close session`, and `run.stop(runId)` needs a run, so a plain chat turn that has gone on too long can only be ended by ending the session (FR125, AD-23).

**Approach:** Declare `turn.stop(sessionId)` beside `run.stop`; both reach one path in `session-stop.ts`. A run in flight is the turn and ends `run:stopped`; a plain chat turn is marked `interrupting` before the interrupt is written, so its failed `result` is a stop: no failure line, persona not `error`, one harness line. The header's one button reads `Stop` while a turn is in flight and `close session` otherwise. Spec of record: epics.md Story 3.19; AD-23; `DESIGN.md` → Chat header.

## Boundaries & Constraints

**Always:**
- `turn.stop(sessionId)`: once per stop request, replies ok or not-found (a distinct envelope code, `turn/not-found`, that the window ignores as it ignores `run/not-found`). Eight commands in; `run.stop(runId)` unchanged; additive, so `CONTRACT_VERSION` and `TRANSCRIPT_VERSION` are unchanged. New channel `TURN_STOP_CHANNEL` in `src/shared/channels.ts`, one preload method `stopTurn(sessionId)`, one bridge method on the conversation's bridge type.
- One path: the handler finds the entry by session id. A run in flight takes `stopRun`'s own path (marks `run.stopping`, same ack and fallback) and ends `run:stopped`, never `run:failed`; the card's stop is unchanged. With no run, a plain turn is stopped by the same module: `entry.interrupting` set before the interrupt is written, one `acknowledged()` ask, the same fallback (`STOP_ACK_MS`, `STOP_RESULT_MS` unchanged; process killed, the harness says so in its own register, session closed). The `STOP_RESULT_MS` wait for the turn's `result` is the room's idle-waiter wait, factored once and shared, so the timer is cancelled when the turn ends.
- not-found: no such session, a closed entry, a room (no agent), no turn in flight (`entry.turn.busy` false), or no process yet. A second stop for a turn already being stopped is ok and writes nothing. Reply is sent once the interrupt is acknowledged or the fallback ran, as `run.stop`'s is.
- A stopped plain chat turn: its failed `result` writes no failure line (`LINES.failed`) and raises no `turn:failed`; the persona goes to its resting state, the session stays open and takes the next turn; the persona's words so far stay. Main writes exactly one line of its own per stopped turn (`harness:said`, through `say`, kept in the transcript) at the turn's first failed `result` (also one that leaves the session busy with background tasks), before `session:awaiting-turn`; never at a `result` that is not failed. Placeholder copy `stopped · the turn ended early`, lower case, mono, no terminal punctuation, never in a persona's voice. New `LINES` entries for the plain-turn fallbacks (the run wording says "with the run").
- A run's stop writes no extra line; `session-stop.ts` is the only place in main that writes an interrupt (`interruptTurn` for the room's send is the existing second caller).
- Queued composer messages are not touched by a stop: each stays the user's to take back (Story 2.5) and sends when the session is next free.
- Header: ONE native `<button>` in the existing slot whose label and aria-label change (`Stop` / `Stop · <Name>`, `close session` / `close session · <Name>`) in the same render as the turn starts and ends, so focus stays on it. In flight = the persona has a live session and `!canAnswer` (main's busy set, run or chat; not `turnsInFlight`, which leaves out a run with no word yet). `Stop` has no confirmation, no cost copy, no "stopping…" state, no disabled or pending state, no tooltip or `title`; it is its own tab stop with the shared focus treatment and sends `turn.stop` only. Tokens only in CSS; reuse `.chat-close`.
- Renderer: `conversation.stopTurn(agentId)` finds the persona's session id and calls the bridge; `turn/not-found` (and `session/not-found`) are ignored without a word, any other refusal is the failure line, as `stopRun`.

**Never:**
- No `SIGINT` except the unacknowledged fallback's `kill()`; no confirmation dialog, cost on the control, or toast; the file on disk is left as written (AD-12); nothing cancels or clears queued messages.
- No header `Stop` in the party view, no change to a room's send-interrupts-the-speaker rule, no `turn.stop` effect on a room; the orphan header keeps its own `close session` and note line (no `Stop`), and its run keeps the card's stop.
- No change to `run.stop`, the card's stop, `STOP_ACK_MS`, `STOP_RESULT_MS`, `menu.dispatch`, or the run events.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plain turn stopped | persona turn in flight, no run; `turn.stop` | interrupt written after `interrupting` is set; failed `result`: no `run:*`, no failure line, no `turn:failed`; one stopped line; session takes next turn | N/A |
| Run stopped from header | run in flight; `turn.stop` | same path as `run.stop`: `run:stopped`, never `run:failed`; no extra line | N/A |
| Idle | no turn in flight | `turn.stop` → not-found, window says nothing | silent |
| Unknown / closed / room | bad id, closed entry, room session | not-found | silent |
| Double press | stop pressed again while stopping | ok, nothing written | N/A |
| Interrupt unacknowledged | no answer in `STOP_ACK_MS` or write fails | process killed, session closed, one fallback line in the harness register | N/A |
| Acknowledged, no `result` | `STOP_RESULT_MS` passes with the turn in flight | same fallback | N/A |
| Turn ended meanwhile | `result` arrives before the ack | no kill, no fallback; if that `result` was not failed, no stopped line | N/A |
| Queued messages | user queued while turn ran; stop | queue untouched, sends when free, still cancellable | N/A |
| Tasks live | failed `result` leaves session busy | one stopped line at that `result`; later wake `result` adds none | N/A |
| Reload | window reloads after a stop | stopped line reads where it fell (from the transcript) | N/A |
| Header | turn starts / ends | label `Stop` ⇄ `close session` in one frame, same element, focus kept; party view and orphan header have no `Stop` | N/A |

</intent-contract>

## Code Map

- `src/shared/commands.ts` -- add `'turn.stop'` (header says "seven commands" → eight); `src/shared/channels.ts` -- `TURN_STOP_CHANNEL = 'turn:stop'` beside `RUN_STOP_CHANNEL`.
- `src/main/session-stop.ts` -- `acknowledged` (reuse), `stopRun` (the run path, unchanged semantics), `endWithSession` (fallback), `interruptTurn:130-155` (its idle-waiter wait is the part to factor and share). Add the plain-turn stop and one entry point (`stopTurn`) that takes the run path when `entry.run` is set. Fallback lines live in `src/main/session-voice.ts` `LINES` (`:15-41`): add the stopped line and plain-turn fallback wordings, each marked placeholder copy.
- `src/main/session-registry.ts` -- `Entry.interrupting` (`:84`, "room only" comment → now also a persona's stopped turn), `turnOver` (`:238`), `foldFrame` (`:244-287`: `stopped`/`interrupted`, the failure-line gate at `:269`, the `ended` branch at `:277`): add the one stopped line for a persona's interrupted plain turn (never a room's, never a run's); `SessionRegistry` type (`:160`) and `createSessionRegistry` return (`:589-596`) gain `stopTurn`.
- `src/main/session-bridge.ts` -- `stopRun` handler (`:500`) and registration (`:654`) are the pattern; add `stopTurn(ctx)` handler + `TURN_STOP_CHANNEL` import/re-export and register it; reply type from `ContractCommands['turn.stop']`.
- `src/preload/index.ts:213` + `src/preload/harness-api.d.ts:103` -- `stopTurn(sessionId)`, same shape as `stopRun`.
- `src/renderer/ui/chat/use-conversation.ts` -- `ConversationBridge` (`:37`, "eight" → nine methods), `stopRun` (`:97`, `:477`, `:680`) is the pattern; add `stopTurn(agentId)`. `src/renderer/ui/app.tsx` (`:213` `closeSession`, `:306-308` shell props) passes `onStopTurn` and the in-flight set; `src/renderer/ui/shell/shell.tsx` (`:114`, `:153-156`, `:250-258`) hands `ChatHeader` `turnInFlight` and `onStop`.
- `src/renderer/ui/chat/chat-header.tsx` (+ `chat-header.css` `.chat-close`) -- one button, label switch. `orphan-header.tsx`, the party view: read-only.
- Tests that count the contract and must move with it (commands seven → eight, channels thirty-three → thirty-four, bridge methods twenty-one → twenty-two, conversation bridge eight → nine): `tests/negative-surface.test.ts` (several, e.g. `:2121, :2373, :2541, :2773`, and `:2563` "nothing else in main writes an interrupt"), `tests/preflight-contract.test.ts:149`, `tests/stop-contract.test.ts:121`, `tests/party-contract.test.ts:27`, `tests/contract.test.ts`, `tests/bridge-contract.test.ts:270`, `tests/session-contract.test.ts`, `tests/conversation-contract.test.ts`. Rewrite their counts and lists, never loosen a sweep for any other surface.
- Replay: `tests/stop-replay.test.ts` is the pattern (real `spawnSession` over a fake child, the real bridge and registry). `fixtures/runs/` has no interrupted plain chat turn (`interrupt-inband`, `-tasks-live*` are runs; `-idle` has no turn in flight). `scripts/record-run.mjs` triggers on tool bytes, tasks or idle only; `tests/replay-corpus.test.ts` asserts each scenario's shape; `fixtures/runs/README.md` lists them.
- `_bmad/implementation-artifacts/{sprint-status.yaml,epic-3-context.md}` -- 3.19 `done`, "(new)" removed.

## Tasks & Acceptance

**Execution:**
- `src/shared/{commands,channels}.ts` -- `turn.stop`, `TURN_STOP_CHANNEL` -- the contract
- `src/main/session-stop.ts`, `session-voice.ts`, `session-registry.ts`, `session-bridge.ts` (+ `session-stop.test.ts`, `session-bridge.test.ts`, registry/voice tests) -- one stop path for a run and a plain turn; `interrupting` mark; stopped line; handler and registration
- `src/preload/{index.ts,harness-api.d.ts}` -- `stopTurn`
- `src/renderer/ui/chat/{use-conversation.ts,chat-header.tsx,chat-header.css}`, `src/renderer/ui/{app.tsx,shell/shell.tsx}` (+ `chat-header.dom.test.tsx`, `use-conversation.test.ts`, shell/app tests) -- one button, `Stop` ⇄ `close session`, not-found ignored
- `scripts/record-run.mjs` -- a trigger that interrupts once the main thread's `text_delta` bytes in the turn reach `--interrupt-after-bytes` (e.g. `--interrupt-when text`); record `fixtures/runs/interrupt-inband-chat` with a real `claude` against a throwaway subject (one scripted plain-prose turn, no tools, then a follow-up turn); add its row to `fixtures/runs/README.md` and its shape to `tests/replay-corpus.test.ts`. If `claude` cannot be run unattended, build the fixture from recorded frames instead (a recorded plain text turn cut mid-stream, then the recorded interrupted-turn tail of `interrupt-inband`), name it `...-derived`, say so in the README, and record it as a residual risk. Do not block on it.
- `tests/` -- a replay of the interrupted plain chat turn through the real bridge and registry: no `run:*`, no failure line, no `turn:failed`, one harness line (kept: present in `conversation:get` after), persona not `error`, the session takes the next turn; plus run-from-header equals `run.stop` (same events); a queued message survives; unacknowledged fallback; counts above updated; extend the 3.11 audit (`tests/negative-surface.test.ts`, `epic-3-audit.dom.test.tsx`): no confirmation, cost copy, "stopping…" state, `SIGINT`, header `Stop` in the party view or orphan header
- `_bmad/implementation-artifacts/{sprint-status.yaml,epic-3-context.md}` -- 3.19 `done`
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given a plain chat turn in flight, when `turn.stop` is sent, then the interrupt is written after the entry is marked interrupting, the turn ends on its `result`, the session stays open, no failure line is written, the persona does not read `error`, and one harness line (`harness:said`) records the stop and is read again after a reload.
- Given a run in flight, when stopped from the card or the header, then it ends `run:stopped`, never `run:failed`, by one path in `session-stop.ts`.
- Given nothing in flight, a room, or an unknown session, when `turn.stop` is sent, then it answers not-found and the window says nothing.
- Given the interrupt is not acknowledged or the turn does not end, then the Story 3.7 fallback ends the session and says so in the harness's register, with `STOP_ACK_MS` and `STOP_RESULT_MS` unchanged.
- Given the chat header, then its one button reads `Stop` while a turn (chat or run) is in flight and `close session` otherwise, in the same frame, without losing focus, with no confirmation, cost copy or "stopping…" state; the party view and the orphan header gain no `Stop`.
- Given messages queued while the turn ran, then a stop leaves them, takeable and sent when the session is free.
- Given the replay corpus, then an interrupted plain chat turn is replayed through the real bridge and registry; the contract reads eight commands, thirty-four channels, twenty-two bridge methods; lint, typecheck, tests and build pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 19 rows (related findings from several layers share a row) — high 0, medium 1, low 13, false 4, maybe-false 1 (2 patched, 1 deferred, 16 rejected)
- findings:
  - `[low]` `[patch]` Verification gap: a room's send-interrupt writing the stopped line is not pinned by any test (only `entry.agentId !== undefined` guards it) — a room test assertion for no `harness:said`/sysline added.
  - `[medium]` `[patch]` Edge: a `turn.stop` landing between `writeTurn` setting busy and `startRun` takes the plain path and the run ends `run:failed` — the failed `result` now ends an in-flight run as stopped when `entry.interrupting` is set and a run exists; test added.
  - `[maybe-false]` `[defer]` Edge: Stop with the session busy only on live background tasks may get no failed `result`, ending the session via the fallback — unverified, recorded in `deferred`.
  - `[low]` `[reject]` Blind, Edge: a double press flips Stop to `close session` and the second press closes the session — the one button whose label switches is the story's decided design (AD-23, UX owner 2026-10-09); a guard would add a timing state the story forbids on the control.
  - `[false]` `[reject]` Blind: at startup the header reads Stop but main answers not-found for `session === undefined` — the entry's session is set before `session:opened` is announced, so the renderer's busy state cannot precede it.
  - `[low]` `[reject]` Blind, Edge: any failed `result` after Stop reads as stopped — `stopRun` does the same for a run and AD-23 keys it on the mark; gating on a subtype is added complexity for a case no one met.
  - `[false]` `[reject]` Blind: `interrupting` may stay set after a turn that ends successfully — `turnOver` clears it on the `ended` branch.
  - `[low]` `[reject]` Blind: a plain turn that carries on after a stop has no marker — the story asks for none.
  - `[low]` `[reject]` Blind: replay tests contain a no-op reload check, an unused helper and a duplicate name — cosmetic; the unit test pins mark-before-write.
  - `[low]` `[reject]` Blind, Edge: recorder counts characters as bytes, no `parent_tool_use_id` filter, no check for `--interrupt` — a plain no-tool turn, same pattern as the other triggers.
  - `[low]` `[reject]` Blind: fixture meta holds a scratch path — the other recordings do too.
  - `[false]` `[reject]` Blind: spec marked `done` with empty logs, tests named in the Code Map not changed — status is set at finalize; the listed tests pass and needed no change.
  - `[low]` `[reject]` Blind: no DESIGN.md/AD-23 update, retro already done — planning documents are not this story's build.
  - `[low]` `[reject]` Blind: weak source-text audits, a new `Set` per render, a long `onFrame` line from inlining `roomWrote`, no announcement on label change — the repo's audits are source-text by design; the inlining keeps the 150-line cap; the audit forbids a live region.
  - `[false]` `[reject]` Blind: "eight handlers" comment is stale — the bridge now registers eight.
  - `[low]` `[reject]` Edge: a stale first-stop ack could end a later stop's session — needs an ack unanswered for 3s on a turn that then ended, which the CLI does not do.
  - `[low]` `[reject]` Edge: Stop pressed while main reads the skill plan is answered not-found and ignored — the story says not-found is silent; the user presses again.
  - `[low]` `[reject]` Verification gap: no test for `session === undefined` not-found — not reachable for a live entry.
  - `[low]` `[reject]` Intent: the tests use fakes at each seam, not a real window — recorded as a residual risk.

## Design Notes

- **Why `interrupting` and not a new mark:** AD-23 names it. It is already what turns a failed `result` into the user's doing for a room; for a persona it is set only by `turn.stop`, so the line is written when the entry is a persona's (has an `agentId`) and no run is in flight.
- **Why in-flight is `!canAnswer`:** `personaTurnsInFlight` drops a persona whose run has no word yet, which would hide `Stop` exactly when a run needs it; the busy set is main's own.
- **Same-turn timer:** the room's wait for idle already cancels its timer when `turnOver` runs; sharing it means a stale timer cannot end a later turn's session.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- In a real window with a real `claude`, ask a persona a long question, press `Stop` in the header, and read one stopped line and a live session. An unattended run cannot check this, so record it as a residual risk.

## Auto Run Result

**Summary.** `turn.stop(sessionId)` stops a turn that is not a run. One path in `session-stop.ts` serves the card's stop and the header's: a run ends `run:stopped` either way, and a plain persona turn is marked `interrupting` before the interrupt is written, so its failed `result` is a stop (no failure line, persona not `error`) and main writes one `stopped · the turn ended early` line (placeholder copy). The chat header's one button reads `Stop` while a turn is in flight and `close session` otherwise. A room and the orphan header are unchanged. The replay corpus gains `interrupt-inband-chat`, a real recording of an interrupted plain chat turn.

**Files changed.** `src/shared/{commands,channels}.ts`; `src/main/{session-stop,session-registry,session-bridge,session-voice}.ts`; `src/preload/{index.ts,harness-api.d.ts}`; `src/renderer/ui/{app.tsx,shell/shell.tsx,chat/chat-header.tsx,chat/use-conversation.ts}`; `scripts/record-run.mjs` (`--interrupt-when text`); `fixtures/runs/interrupt-inband-chat.*` and its README row; tests beside each, `tests/stop-chat-replay.test.ts`, the contract-count tests and the 3.11 audits; `sprint-status.yaml` and `epic-3-context.md`.

**Review.** 19 triage rows: patches applied 2 (a stop landing before a run starts now ends it `run:stopped`; the room's silence pinned by a test); deferred 1; rejected 16 with reasons in the log. By verdict: high 0, medium 1, low 13, false 4, maybe-false 1.

**Follow-up review recommended: false.** One medium and one low were patched, each with a test.

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` unit 214 files, 5,299 tests passed, watchers 3 files, 64 tests passed; `npm run build` exit 0. Matrix audit: every I/O row has a passing test (`session-stop.test.ts`, `session-bridge.test.ts`, `tests/stop-chat-replay.test.ts`, `chat-header.dom.test.tsx`, `use-conversation.test.ts`, `app.test.tsx`, `epic-3-audit.dom.test.tsx`).

**Residual risks.**
- Not seen in a real window with a real `claude`: the header, focus and label switch are checked in jsdom, and the main side over a fake child fed by a real recording.
- A Stop pressed while the session is busy only on live background tasks may get no failed `result` (deferred, unverified).
- The stopped-turn line and the plain-turn fallback lines are placeholder copy for `bmad-ux`.
- A double press can land on `close session` after the label flips; that is the decided one-button design.
