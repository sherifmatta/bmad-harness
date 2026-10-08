---
title: 'Take the room away with you'
type: 'feature'
created: '2026-10-08'
baseline_revision: '2852dcefa599ce1d00ead197006c8a32e9109fdd'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 4.4 (epics.md "Take the room away with you", FR71). The party header carries *Write summary to `_bmad/`* but it is disabled: pressing it does nothing, so what the room concluded dies with the room.

**Approach:** Give the button a handler that asks the room's own session, as one turn, to write its summary to the destination the header and panel already show (`roomDestination`, Story 4.3). The runtime writes the file; the harness writes nothing. The rail's existing machinery (watcher over `_bmad/`, `roomWrote` annotation, `the room` owner label, document window) supplies the new row. Renderer and `shared/` only: no main, contract, bridge or preload change.

## Boundaries & Constraints

**Always:**
- Counts stay: commands 7, events 15, channels 22, preload methods 17. The ask is an ordinary `turn.send` into the room's `sessionId`, through the same path as `sendToRoom` (no gate: a speaker in flight is interrupted by main).
- The turn text is `roomSummaryTurn(destination)`, a pure helper in new `src/shared/room-summary.ts`, with `destination = roomDestination(roomOpenedAt, roomTopic)` read at the press, so it is the very string the panel's `writes to` row showed before. Exact text, one paragraph: `Write a summary of this conversation to <destination>. Cover what was discussed, what was decided and what is still open. If the file name has <topic> in it, put a short name for the topic there; if the file already exists, add -2 to the name rather than overwrite it.` The runtime picks the name when the slug was empty and avoids a collision; the harness decides neither and never names, summarises or classifies what the room said.
- The ask is one room user entry in the thread (what was sent is shown, as `sendToRoom` shows a message; main records the same text as the user's turn), the room busy from now. It is **not** the topic: pressing before any first message leaves `roomTopic` `undefined`, and the later first message still becomes it. Pure state function `roomSummaryAsked(state, at)` beside `roomSent` returns `{ state, sessionId, text }`; with no live room, nothing is sent. Both functions share the entry-and-busy composition.
- Hook `Conversation` gains `writeSummary()` (uses `now()`, `bridge.sendTurn`, the same busy/failed handling as `sendToRoom`); the hook result gains `writeSummary`. `app.tsx` passes it as `onWriteSummary`, so the button is enabled while a room is live; `PartyHeader` keeps `disabled` when no handler is passed.
- Harness microcopy rules unchanged: no new visible string besides the button's existing label; no sound, spinner, badge, count, `aria-live` or `role=status`; nothing added to the Room panel (still exactly one heading, no section for the summary).

**Never:**
- The harness never writes, creates, edits or reads the summary file or `_bmad/party/` (no `fs` in renderer or main for it), never reads `config.toml`/`customize.toml`, and adds no command, event, channel, preload method, or main-side write path.
- No stop, end or pause change (4.5); no disagreement, decision or open-question surface, tag or empty state (4.6); no `288`. No confirmation dialog, toast, or "saved" announcement; the rail row appearing is the whole notice. No harness-authored summary text, and no use of the ask as the room's topic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Press, topic set | room live, topic `Payouts`, opened 2026-10-08 | one room user entry and one `turn.send` with the text naming `_bmad/party/2026-10-08-payouts.md`; room busy | none |
| Press, no topic yet | no first message | text names `_bmad/party/2026-10-08-<topic>.md`; `roomTopic` stays `undefined`; the next first message becomes the topic | none |
| Press mid-turn | a persona speaking | same send; main interrupts the speaker; no queue | busy refusal: entry stays, room stays busy (as `sendToRoom`) |
| Send fails | `turn.send` rejects | room not left busy, failure surfaced | `dispatchFailed` + `onFailure`, as `sendToRoom` |
| No live room | state `room` undefined | nothing sent, no entry | none |
| File lands | runtime writes the destination | a rail row, owned by `the room`, openable in a document window | existing machinery |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/conversation-state.ts:320-360` -- `roomReady`, `roomSent` (sets the topic); add `roomSummaryAsked` beside it, factor the shared entry/busy step.
- `src/renderer/ui/chat/use-conversation.ts:371-390,490-510,575-630` -- `sendToRoom` (the model for `writeSummary`), `Conversation` type, hook callbacks and result.
- `src/renderer/ui/app.tsx:265-280` -- `PartyView` props: add `onWriteSummary={conversation.writeSummary}`.
- `src/renderer/ui/party/party-header.tsx`, `party-view.tsx` -- already take `onWriteSummary` (optional, disabled without); only comments change.
- `src/shared/room-destination.ts` -- `roomDestination`, reused as is; new sibling `src/shared/room-summary.ts` (+test) for `roomSummaryTurn`.
- `src/main/projections/rail-annotator.ts`, `src/main/session-registry.ts:290-300`, `src/main/sources/project/watch-artifacts.ts`, `src/renderer/ui/outputs/owner-label.ts` -- read-only: a file a room session wrote becomes a `room: true` rail row (`the room`) through the watcher over `_bmad/**`; nothing to change.
- Pins that change deliberately: `tests/party-contract.test.ts:147-151` (the "wires no handler" case becomes: `app.tsx` passes `onWriteSummary`, `disabled={onWriteSummary === undefined}` stays; add: no renderer/main source writes `_bmad/party`), `tests/negative-surface.test.ts` (`Conversation` method list if pinned), `use-conversation.test.ts`, `conversation-state.test.ts`, `app.test.tsx`, `party-header.dom.test.tsx`.
- Read-only evidence: `_bmad/planning-artifacts/epics.md` Story 4.4 (`### Story 4.4`), `.claude/skills/bmad-party-mode/SKILL.md` ("they're there if the user asks"), `src/main/session-bridge.ts:340-360` (a `turn.send` into a room is recorded as the user's turn and interrupts a busy speaker).

## Tasks & Acceptance

**Execution:**
- `src/shared/room-summary.ts` (+test) -- `roomSummaryTurn(destination)` returning the exact text above -- one definition of what the runtime is asked.
- `src/renderer/ui/chat/conversation-state.ts` (+test) -- `roomSummaryAsked(state, at)`: entry, busy, topic untouched, no room means no send -- the state half of the press.
- `src/renderer/ui/chat/use-conversation.ts` (+test) -- `writeSummary` on `Conversation` and in the hook result; send, busy refusal and failure handled like `sendToRoom` -- the command half.
- `src/renderer/ui/app.tsx`, `party-header.tsx`, `party-view.tsx` (+tests) -- pass the handler; button enabled in a live room; comments updated.
- Pins in the Code Map -- updated; counts stay 7/15/22/17.
- Tests for every matrix row: helper text and destination (golden, with and without topic); state (topic untouched, entry shape, no room); hook (one `sendTurn` with the text, busy, failure, one entry); DOM (pressing the header button sends it); an `app.test.tsx` case through the real `App`; the destination in the sent text equals the panel's `writes to`.

**Acceptance Criteria:**
- Given a live room, when *Write summary to `_bmad/`* is pressed, then the room's session is asked to write its summary to `_bmad/party/<date>-<topic>.md` (the destination the Room section already showed), and the harness writes no file.
- Given the room has no topic yet, when the button is pressed, then the ask carries `<topic>` for the runtime to fill, and the user's later first message is still the topic.
- Given the runtime writes the file, when it lands under `_bmad/`, then a rail row appears without user action, owned by `the room`, openable in a document window like any artifact.
- Given a speaker is mid-turn, when the button is pressed, then it is sent with no gate, as any message into the room is.
- Given the full suite, lint, typecheck and build, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 19 findings (blind 9, edge 9 plus 2 claim checks, verification-gap 0, intent-alignment 1 descriptive) — high 0, medium 0, low 17, false 2, maybe-false 0; no patches
- findings:
  - `[low]` `reject` the ask does not tell the runtime to create `_bmad/party/` or check write permission (blind) — the runtime's `Write` creates parent directories and the session policy allows writes inside the project; only the manual check with a real `claude` can show more, recorded as a residual risk
  - `[low]` `reject` a repeated press, or a press while the ask is in flight, sends a second ask that interrupts the first; a third has no `-3` rule (blind, edge) — the room has no gate by contract (4.2) and the user's second press is their own; a guard adds state the epic does not ask for
  - `[low]` `reject` the ask is a long paragraph posted as the user's turn, and its `<topic>` clause is dead text when a topic exists (blind) — the entry showing exactly what was sent is the design (Design Notes); a conditional text adds branches for no harm
  - `[low]` `reject` no test pins the turn counter, speaker or header topic across a press (blind) — a user entry is no turn and `speakerOf` reads persona entries only; the topic is covered at state, hook and app level
  - `[low]` `reject` the `fs`/`_bmad/party` tripwire is a source-text regex that misses `fs/promises`, double quotes, concatenation, `shared/` and main (blind, edge x3) — it is a tripwire over the way the repo writes imports, and the real boundary is that no command or write path exists
  - `[low]` `reject` the spec lists `party-header.dom.test.tsx` and `negative-surface.test.ts` as pins to update and the diff touches neither; the "destination equals panel" task is asserted for the no-topic form only in the app test (blind, edge claims) — both pins stayed green unchanged, the topic form of the destination is one helper shared by panel and ask, and a fix would edit this spec
  - `[low]` `reject` a failed or absent write has no feedback and the button stays live (blind) — the epic makes the rail row the whole notice; recorded as a residual risk
  - `[low]` `reject` `onFailure(null)` runs before the no-room return, so a press without a room clears a failure line (blind, edge) — the button exists only in a live room, and `sendToRoom` behaves the same
  - `[low]` `reject` `<date>` stays in the ask when the open time is missing (edge) — the hook always passes `now()` to the room's open, so it is not reachable
  - `[low]` `reject` a press before the room's session is ready, or a send rejected after the room closed, leaves the entry and a failure line (edge x2) — identical to `sendToRoom` since 4.2, and the shared `transmitToRoom` keeps one behavior
  - `[low]` `reject` a shallow busy-room state test, `Held` cast in the hook test, an over-long comment in `party-header.tsx` (blind x3) — taste, no harm shown
  - `[false]` `reject` no `.test`-less party-view comment update (edge claim) — `party-view.tsx` already describes the button as disabled without a handler, which is still true
  - `[false]` `reject` intent-alignment: the commit and close half is not in the diff (descriptive) — it is finalisation below: the story is set `done`, marked done in the sprint status and committed

## Design Notes

Why a `turn.send` and not a new command: the epic makes the runtime the writer and forbids harness writes; the room already takes any user turn, and the rail, owner label and document window already handle a room-written file, so a dedicated command would add contract surface with no behavior. The cost is that the ask is recorded as the user's turn, which is honest: the entry shows exactly what was sent, in the user's name, on a button they pressed. Why the text names the destination and leaves `<topic>`/collision to the runtime: the harness may not invent a topic, and what a write does about a collision or an empty slug was left to this story by 4.3's review.

Golden: `roomSummaryTurn(roomDestination(Date.parse('2026-10-08T14:31:00'), 'Payouts'))` begins `Write a summary of this conversation to _bmad/party/2026-10-08-payouts.md. Cover`.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Open a room, press the button: the thread shows the ask, a persona writes the file, a `the room` row appears in the rail and opens in a document window. Not verified in an unattended run unless the Electron app is launched against a real `claude`.

## Auto Run Result

**Summary:** *Write summary to `_bmad/`* is enabled in a live room. Pressing it sends one turn into the room's own session asking it to write its summary to the destination the header and the Room panel already show (`_bmad/party/<date>-<slug>.md`, `<topic>` left for the runtime to fill when there is no topic yet, `-2` rather than overwrite). The runtime writes the file; the harness writes nothing. The ask is one room user entry in the thread (what was sent), the room is busy, and the ask is never the topic. The rail row, `the room` owner and document window come from the existing machinery. Renderer and `shared/` only: counts stay 7 / 15 / 22 / 17.

**Files changed:**
- `src/shared/room-summary.ts` (+test) -- `roomSummaryTurn(destination)`, the text of the ask.
- `src/renderer/ui/chat/conversation-state.ts` (+test) -- `roomSummaryAsked`; `withRoomEntry` shared with `roomSent`.
- `src/renderer/ui/chat/use-conversation.ts` (+test) -- `writeSummary`; `transmitToRoom` shared with `sendToRoom`.
- `src/renderer/ui/app.tsx`, `party/party-header.tsx` (comment), `party-view.dom.test.tsx`, `app.test.tsx` -- the handler wired and covered through the real `App`.
- `tests/party-contract.test.ts` -- wiring pin; no source names `_bmad/party` and the renderer imports no `fs`.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 4.4 done.

**Review:** 19 findings across four layers. Patches applied: 0. Deferred: 0. Rejected: all, each with its reason in the Review Triage Log. (One misplaced doc comment found in my own read of the diff was fixed before review.)

**Follow-up review recommended:** false -- nothing was patched.

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (167 unit files, 3856 tests; 3 watcher files, 55 tests) and `npm run build` exit 0. One run of the watcher project failed one test once and passed on rerun.

**Residual risks:** no Electron launch and no real `claude` party run: that the runtime follows the ask, creates `_bmad/party/`, and that the room-owned row then appears and opens is not seen. A double press sends two asks, the second interrupting the first. A runtime that writes elsewhere or declines leaves the user with no signal but the missing row. The ask is recorded as the user's turn.
