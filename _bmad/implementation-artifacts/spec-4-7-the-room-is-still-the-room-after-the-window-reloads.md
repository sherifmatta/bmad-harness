---
title: 'The room is still the room after the window reloads'
type: 'bugfix'
created: '2026-10-08'
baseline_revision: '25791337a6a1acdf86ac43520014973c7a9e61a3'
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

**Problem:** Reloading the window with a live room returns the party view to the chooser over a read-only thread: `conversation:get` lists persona sessions only, so the room's process keeps running unseen. Opening again attaches to the live room but the window keeps the chooser's ticks as the cast, so the header reads the wrong count, elapsed time restarts, the topic is gone and the destination falls back to `<topic>` (Epic 4 retrospective F1).

**Approach:** Main's snapshot names the live room (session, cast in open order, open time) and counts it in `busy`; an open against a live room answers with that same room's cast and open time. The window takes both from main, and derives the topic from the stored entries by the rule that set it live.

## Boundaries & Constraints

**Always:** The snapshot is built from main's live memory, nothing persisted. A room still starting, stopped, exited or from before a relaunch is not in the snapshot and nothing is invented. The room is never in the snapshot's persona `sessions` and gets no tile. The reloaded room draws nothing of its own about the reload. The fields gained are optional on the existing reply and snapshot types.

**Never:** No new command, event, channel or preload method (counts stay 7, 15, 22, 17). No change to stop or to what *End session* clears. No change to earlier rooms' lines in the thread (retro F5). No restored/reconnected word, control, banner, toast or transcript line.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reload, live idle room | room opened with cast `[c, a, b]` at T, topic typed, turns held | snapshot `room` = session, cast `[c,a,b]`, `openedAt` T; window: header, strip, composer, stop; count, topic, turns, opened, destination as before; elapsed from T | No error expected |
| Reload mid-turn | room turn in flight | session in snapshot `busy`; window busy; speaker lit by `speakerOf` from stored entries | No error expected |
| Second open against live room | chooser ticks differ from the room's cast | reply carries the live room's session, cast and `openedAt`; window keeps those, not the ticks | No error expected |
| No live room | never opened, stopped, process exited, or app relaunched | no `room` in snapshot; stopped transcript above the chooser, nothing live | No error expected |
| Room still starting | snapshot read before `session:opened` | not in snapshot; the later `session:opened` makes it live as today | No error expected |
| Topic | first non-blank, non-summary-ask user room entry at or after `openedAt` | that entry's `roomTopicOf` shape; none when there is none | No error expected |

</intent-contract>

## Code Map

- `src/shared/conversation.ts` -- `ConversationSnapshot` gains optional `room: { sessionId, cast, openedAt }`; `SessionOpenReply` and `OpenedSession` gain optional `room: { cast, openedAt }`.
- `src/main/session-registry.ts:51-89,368,398-417,548` -- `Entry` gains `roomCast` (set at `openRoom`, so a snapshot never sees a live room without it) and `openedAt` (set where `session:opened` is announced, same value as its `at`); `openRoom` takes the cast ids.
- `src/main/session-bridge.ts:184-213,527-564` -- `openRoom` answers with the room's own cast and time on both paths (first open and live room); `getConversation` adds `room` and counts the room in `busy` (the `agentId !== undefined` filter goes).
- `src/preload/index.ts:123-132` -- copy `room` from the reply into the opened session.
- `src/shared/room-summary.ts` -- `isRoomSummaryTurn(text)`: the summary ask is never the topic, so topic derivation must recognise it.
- `src/renderer/ui/chat/conversation-state.ts:322-333,561-615` -- `roomReady` takes the room's own cast and time; `hydrate` sets `room`, `roomCast`, `roomOpenedAt` and `roomTopic` from `snapshot.room` and the entries.
- `src/renderer/ui/chat/use-conversation.ts:305-313` -- `openTheRoom` folds the reply's `room`, not the chooser's ticks.
- Tests to replace: `src/main/session-bridge.test.ts:2181` ("is not in the conversation snapshot"). Fixtures: `use-conversation.test.ts` `FakeBridge.openSession` (echoes the cast as the reply's `room`), `conversation-state.test.ts`, `tests/party-contract.test.ts:51`.
- `src/renderer/ui/party/epic-4-audit.dom.test.tsx` -- add a reloaded live room built by `hydrate` from a snapshot; `tests/negative-surface.test.ts` -- no word of a reload in party and conversation sources.

## Tasks & Acceptance

**Execution:**
- `src/shared/conversation.ts`, `src/shared/room-summary.ts` -- add the optional fields and `isRoomSummaryTurn` -- the one contract both sides read
- `src/main/session-registry.ts`, `src/main/session-bridge.ts`, `src/preload/index.ts` -- hold cast and open time on the room's entry; snapshot and open reply carry them; room counted in `busy` -- main is the one source
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` -- `hydrate` restores the room; `roomReady` takes main's cast and time -- the window never invents a cast
- `src/main/session-bridge.test.ts`, `conversation-state.test.ts`, `use-conversation.test.ts`, `party-view.dom.test.tsx`, `epic-4-audit.dom.test.tsx`, `tests/negative-surface.test.ts` -- the evidence test through the real bridge and registry into a fresh renderer state (fails if the room is dropped from the snapshot); matrix rows; audit mount; replace the two absence pins
- `sprint-status.yaml`, `epic-4-context.md` -- 4.7 done at the end

**Acceptance Criteria:**
- Given a live room and a reload, when the window reads the conversation again, then it comes back live with its original cast, open time, topic, turn count and destination, the room in no persona's `sessions`.
- Given a live room, when an open is made, then the window's cast and open time are the room's own.
- Given no live room, a room still starting, or a relaunch, then the party view is the Story 4.5 stopped view and nothing is persisted.
- Given the full suite, lint, typecheck and build, then all pass and the four counts stay 7, 15, 22, 17.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 15 rows grouping the layers' raw findings — high 0, medium 0, low 8 (3 patched, 5 rejected), false 7, maybe-false 0; no bad_spec, no intent_gap
- findings:
  - `[low]` `patch` the live-room path of `openRoom` reads `service.room` after the await, so a room stopped meanwhile can leave it undefined (blind, edge) — captured `live` before the await; test where the room is stopped while a second open waits (both opens answer `session/not-found`)
  - `[low]` `patch` nothing pins the preload copying `reply.room` into the opened session (verification-gap, blind, intent-alignment) — `tests/bridge-contract.test.ts` case where the reply carries `room` and the result must carry it
  - `[low]` `patch` the `indexOf` slices in the 4.7 negative-surface test pass vacuously if a marker moves (blind) — markers asserted present and ordered, slices non-empty
  - `[false]` `reject` `hydrate` overwrites the room fields and could wipe a room whose `session:opened` landed during hydrate (blind, edge, verification-gap other) — `hydrate` already replaces `sessions` and `busy` the same way; events before `hydrated` are dropped by design and main's snapshot is synchronous, so an event sent after it arrives after the reply; a room still starting is the spec's own row
  - `[false]` `reject` topic read from stored entries only, ignoring `state.entries` (edge) — a window with no room holds no room entries before hydrate, so there is nothing local to read
  - `[false]` `reject` a stale `roomOpenedAt` wins in `roomReady` (edge) — it is cleared on `session:closed` and on end, so a new room starts with none
  - `[false]` `reject` the topic is lost if the transcript is capped or trimmed (blind) — the transcript registry has no cap or rotation of entries
  - `[false]` `reject` counting the room in `busy` breaks consumers that assume persona ids (blind) — the renderer's `busy` already holds the room's id from `session:opened`; `hydrate` now matches what the events built
  - `[false]` `reject` interrupt-pending busy lights a speaker that is ending (edge) — the speaker rule is `speakerOf` from the stored entries, the same before and after a reload; no new state
  - `[false]` `reject` the reply with no `room` leaves an empty cast and no clock (blind, edge) — main always sets `roomCast` at open and `openedAt` before `ready` resolves, so an ok reply always carries `room`; falling back to the chooser's ticks is what the story removes
  - `[low]` `reject` two windows on one project could mix rooms through `storedTopicOf` and `roomTurnsOf` (blind, edge) — the transcript is the project's and `roomTurns` already behaves so; one window per project is the product's model; fixing it needs a session id on stored entries, a larger change than a direct correction
  - `[low]` `reject` a user message equal in shape to the summary ask is never the topic (edge) — recorded in Design Notes; live and reloaded agree
  - `[low]` `reject` `ASK_HEAD`/`ASK_TAIL` split on a sentinel, and a reworded ask orphans old asks (blind) — `room-summary.test.ts` pins the recognition; the ask is a fixed string
  - `[low]` `reject` `epic-4-context.md` trims unrelated lines, spec status and sprint status differ, no Electron check (blind, intent-alignment) — the context file is regenerated per the build's own rule; status is set at finalization; the manual check is in the spec as not run unattended
  - `[low]` `reject` audit mounts use a hand-built snapshot, a 'reload' test mounts props, `getConversation` repeats a condition, a clock step back before `openedAt` (blind, edge) — the audit goes through `hydrate` as the AC asks; the rest are cosmetic or need a new rule
  - `[low]` `reject` the view returns to 1:1 after a reload (intent-alignment) — the story's ACs speak of the party view; the shell's default view is not this story's

## Design Notes

The topic is the only thing the snapshot cannot carry as main's own state without a new store, so it is re-derived by the rule `roomSent` used: the first user entry of this room (flagged `room`, at or after `openedAt`) whose shape is not empty and which is not the summary ask. A user who types the summary ask's exact wording as their first message gets no topic from it after a reload and before; both sides agree, which is the point.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Reload the window in the Electron app with a live room against a real `claude`. Not verified in an unattended run.

## Auto Run Result

**Summary:** A live room now survives a window reload. Main's conversation snapshot names it (session, cast in open order, open time) and counts it in `busy`; an open against a live room answers with that room's own cast and time; the window takes both from main and re-derives the topic from the stored entries. Nothing is persisted and a room that is starting, stopped, exited or from before a relaunch is not in the snapshot.

**Files changed:**
- `src/shared/conversation.ts`, `src/shared/room-summary.ts` -- optional `room` on the snapshot and the open reply; `isRoomSummaryTurn`.
- `src/main/session-registry.ts`, `src/main/session-bridge.ts`, `src/preload/index.ts` -- the room's entry holds cast and open time; snapshot and open reply carry them; room in `busy`.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` -- `hydrate` restores the room and its topic; the open reply's cast and time are used, not the chooser's ticks; the summary ask is never a topic.
- Tests: new `tests/room-reload.test.ts` (real bridge and registry into a fresh `hydrate`; fails if the room is dropped from the snapshot), plus `session-bridge`, `conversation-state`, `use-conversation`, `party-view.dom`, `epic-4-audit.dom`, `app`, `room-summary`, `bridge-contract`, `party-contract`, `negative-surface`.
- `_bmad/implementation-artifacts/sprint-status.yaml`, `epic-4-context.md` -- 4.7 done; context regenerated.

**Review:** four layers. Patches applied: 3 (all low: capture of the live room before the await, preload copy pinned, non-vacuous slices). Deferred: 0. Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false -- only low findings were patched.

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (169 unit files, 4039 tests; 3 watcher files, 55 tests) and `npm run build` exit 0 after the patches. The four counts stay 7, 15, 22, 17. The evidence test fails when the room is dropped from the snapshot.

**Residual risks:** no Electron launch and no real `claude`. The view after a reload is still 1:1 until the user switches to Party Mode, where the room is live. Two windows on one project share the transcript, so a second window's room could read the first's topic and turn count (as turn counting already did).
