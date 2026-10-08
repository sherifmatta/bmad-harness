---
title: 'The room ends, it does not pause'
type: 'feature'
created: '2026-10-08'
baseline_revision: '806282cd2a7200cda20adaa184968dfc2733d476'
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

**Problem:** Story 4.5 (epics.md "The room ends, it does not pause", FR72). The room has no way to be stopped: the only controls that end it are the topbar's *End session* (which also clears the whole conversation) and a process that exits. And a room that ends by any route takes its transcript off the screen with it, because the party view draws a thread only while a room is live. The product must offer one honest end for a room, with the transcript left behind.

**Approach:** A `stop room` control in the party header closes the room's own session through the existing `session.close` path (the same one persona sessions use), so the session is released and `session:closed` is the only thing that removes the room. The transcript is untouched, and the party view keeps drawing the room's entries, read-only, above the cast chooser once the room is gone. There is no pause control. *End session* is unchanged and stays the only way to clear the conversation.

## Boundaries & Constraints

**Always:**
- Counts stay: commands 7, events 15, channels 22, preload methods 17. Stop is `bridge.closeSession(room)`; main's `closeSession` handler is the only main change: for a session with no `agentId` it says one harness line in the room's register, `room stopped · session released` (`LINES.roomStopped` in `src/main/session-voice.ts`, lower case, `·`-separated, no terminal punctuation), then closes as it does now. A persona's close says nothing new.
- Hook `Conversation` gains `stopRoom(): Promise<boolean>`, modelled on `close`: clears the failure, true when closed (or already gone: `state.room` is no longer that session), false with no live room or on a refusal shown as the failure line. It never calls `endConversation` and never edits the state itself: `session:closed` clears the room, and `entries` stay.
- `PartyHeader` takes optional `onStop`; with one it draws a native `<button type="button" className="party-stop">stop room</button>` after the write button, without one it draws nothing. No confirmation, tooltip, accent, badge, count, spinner, `aria-live` or `role`. The `.party-write` rule is shared with `.party-stop` (tokens only); the shared `:focus-visible` ring needs no rule.
- `PartyView` takes `onStop`. With no live room and at least one room entry, it draws the room's entries (the same turns, user turns and syslines, in time order, none live) in a thread above the cast chooser in the one column; no header, strip, panel or composer. With no live room and no room entry, it is the chooser alone, as now. When a room goes while focus was inside the view and nowhere else, the thread takes focus (the mirror of the existing open case). Opening a new room later is unchanged, and the earlier room's entries stay above it as today.
- *End session* stays always enabled, in the topbar, and the only control that clears the conversation; stopping clears nothing.

**Never:**
- No pause control, label, state or word in party code (the pin in `tests/party-contract.test.ts` stays). No new command, event, channel, preload method, or main-side state; no change to `end`, the rail, the summary ask, or the Room panel; no disagreement, decision or open-question surface (4.6).
- No harness-authored summary of the room, no persona attribution of the stop line, no live-region announcement of the stop, no next-step guidance after it ("start another room" is not said anywhere).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stop, idle room | room live, turns in the thread | one `session.close(room)`; `session:closed` follows; the thread stays, read-only, above the chooser; the header, strip, panel and composer are gone | none |
| Stop mid-turn | a persona speaking | same close; the speaker's words so far stay in the thread; nothing queued | none |
| Stop, then open | stopped room, chooser used | a new room opens; the earlier entries stay above it; its turn count and topic start fresh | as 4.1 |
| Close refused | `closeSession` rejects, room still live | room stays live, failure line shown, button still there | failure line |
| Already gone | rejects after `session:closed` was folded | treated as stopped, no failure | none |
| No live room | `stopRoom()` with no room | nothing sent, false | none |
| End session | topbar control | clears the room's entries too, as today; chooser alone | as today |
| Process exits on its own | `session:closed` (`process-exited`) | the same stopped view; the existing `session ended · the process exited` line is in the thread | as today |

</intent-contract>

## Code Map

- `src/main/session-bridge.ts:445-460` -- `closeSession` handler: add the room's line before `registry.finish`; `src/main/session-voice.ts:18-36` -- `LINES`: add `roomStopped`.
- `src/renderer/ui/chat/use-conversation.ts:473-495,520-540,600-670` -- `close` (model for `stopRoom`), the `Conversation` type, hook callbacks and result.
- `src/renderer/ui/chat/conversation-state.ts:639-656` -- `session:closed` already clears `room`, `roomCast`, `roomOpenedAt`, `roomTopic` and keeps `entries`; read-only, nothing to change.
- `src/renderer/ui/party/party-header.tsx`, `party-header.css` -- the `stop room` button and its shared rule.
- `src/renderer/ui/party/party-view.tsx`, `party-view.css` -- the stopped layout and the thread render shared by both layouts; the focus effect.
- `src/renderer/ui/app.tsx:265-280` -- `PartyView` props: add `onStop`.
- `src/renderer/ui/shell/end-session.tsx`, `topbar.tsx` -- read-only: *End session* stays as pinned by `tests/negative-surface.test.ts:429`.
- Tests to extend: `src/main/session-bridge.test.ts:2201` (the room close case now says one more line; the transcript still holds the room's entries), `use-conversation.test.ts`, `party-header.dom.test.tsx`, `party-view.dom.test.tsx`, `app.test.tsx`, `tests/party-contract.test.ts` (header wiring, no pause word in code, no `endConversation` in `stopRoom`).
- Read-only evidence: `epics.md` Story 4.5 and FR72/FR84, `EXPERIENCE.md` Party Mode lifecycle row, `src/renderer/ui/chat/chat-header.tsx` (`close session`, the precedent), `src/main/session-registry.ts:343-348` (the process-exit line).

## Tasks & Acceptance

**Execution:**
- `src/main/session-voice.ts`, `src/main/session-bridge.ts` (+ `session-bridge.test.ts`) -- `LINES.roomStopped` said once for a room close; persona close unchanged; the stored transcript keeps the room's entries -- the stopped room says so in its own register.
- `src/renderer/ui/chat/use-conversation.ts` (+test) -- `stopRoom` on `Conversation` and in the hook result -- the command half.
- `src/renderer/ui/party/party-header.tsx`, `party-header.css` (+dom test) -- `onStop` and the `stop room` button -- the one way to end a room.
- `src/renderer/ui/party/party-view.tsx`, `party-view.css` (+dom test) -- stopped layout (thread above chooser), focus after a stop, `onStop` passed to the header -- the transcript remains.
- `src/renderer/ui/app.tsx` (+`app.test.tsx`) -- `onStop={() => void conversation.stopRoom()}`; one case through the real `App`: press stop, the thread stays with the stop line, *End session* then clears it.
- `tests/party-contract.test.ts` -- pins above; counts stay 7/15/22/17.
- Tests for every matrix row.

**Acceptance Criteria:**
- Given a live room, then the header offers `stop room` and nothing named or acting as pause exists anywhere in party code.
- Given `stop room` is pressed, then the room's session is closed (released), the harness says `room stopped · session released` in the room's thread, and the room's transcript stays on screen, read-only, above the cast chooser.
- Given a stopped room, then nothing in the conversation was cleared: only *End session* clears it, and it is still always enabled in the topbar with no new emphasis.
- Given the process exits on its own, then the same stopped view shows.
- Given the full suite, lint, typecheck and build, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 20 findings (blind 9 and edge 7 merged into the rows below, verification-gap 2 plus 2 other, intent-alignment 1 descriptive) — high 0, medium 0, low 17, false 2, maybe-false 0; no bad_spec, no intent_gap; 5 patched (all tests and comments), the rest rejected
- findings:
  - `[low]` `patch` no main test closes a room mid-turn (blind, edge claim, verification-gap) — added a Story 4.5 case in `session-bridge.test.ts`: partial words kept, one stop line before one `session:closed`, nothing after
  - `[low]` `patch` the stopped thread's `live &&` guard is unpinned (verification-gap) — added a `PartyView` case with no room, a persona entry and a matching `speaker`: no live turn
  - `[low]` `patch` stop-then-open does not assert a fresh topic and turn count (edge claim) — added to `party-view.dom.test.tsx`
  - `[low]` `patch` the contract test's `slice(indexOf…)` can pass vacuously (blind) — asserts both markers found and the slice non-empty
  - `[low]` `patch` the `party-header.tsx` doc comment says "no other way to end it here" and the `closeSession` comment is one over-long line (blind, verification-gap other, intent-alignment) — both reworded
  - `[low]` `reject` stopping while a summary write is in flight can leave a partial or missing file with no line saying so (blind, edge) — stop ends the room's turn by design (the epic's stop, no confirmation, no new state); the rail row is the only notice 4.4 gave; recorded as a residual risk
  - `[low]` `reject` a double press sends two closes and the second may show a failure (blind, edge) — `session:closed` is emitted before the invoke's reply on the same channel and `stopRoom` treats "already gone" as success, as `close` does for personas; a guard adds state
  - `[low]` `reject` the stopped thread remounts and may start at the top of a long transcript (blind, edge) — the live thread has no scroll-to-end either; adding one is new behavior for both layouts
  - `[low]` `reject` the stopped thread has no accessible name or announcement (blind) — the same script-only focus target as the open case; the epic allows one polite live region and the stop line is in the thread
  - `[low]` `reject` `stop room` has no confirmation and sits beside the summary button (blind) — the stop design rules out confirmation (FR85); both are plain buttons and the cost is the room, which the user can reopen
  - `[low]` `reject` the stopped view does not say which room it was, and two stopped rooms run together (blind) — the stop line and the opened sysline delimit them; earlier rooms staying in the thread was already so since 4.2
  - `[low]` `reject` focus move is skipped when no thread renders (edge) — a room always has its `room opened` sysline, so a thread exists whenever a room did; an end-of-conversation clears focus's home too
  - `[low]` `reject` `registry.say` throwing before `kill` would leave the room running (edge) — `say` persists through the same voice every close path uses; no throwing case was shown
  - `[low]` `reject` `onFailure(null)` runs before the no-room return (blind, edge) — identical to `close` and `sendToRoom`
  - `[low]` `reject` `negative-surface.test.ts` loosens the run-card stop pin by whitelisting a line (blind) — the new line is the room's, named exactly, and the count of `closeSession(` call sites is pinned at 2
  - `[false]` `reject` the new CSS depends on an unchecked `--space-xxl` token (blind) — `party-header.css` already uses `var(--space-xxl)`, and the repo's pin script checks tokens in lint
  - `[false]` `reject` narrow widths may overflow two non-shrinking buttons (blind) — the header's topic is the shrinking item and the shell hides the panel at ≤1180px; no overflow shown
  - `[descriptive]` `reject` intent-alignment: the commit and sprint-status half is not in the diff, the end-to-end chain is joined by fixtures, and the manual Electron check is unrun — finalisation below handles the commit and sprint status; the manual check is a recorded residual risk

## Design Notes

Why close and not a new command: the epic asks for stop, which the session model already has as `session.close`: it kills the process, emits `session:closed` and leaves the transcript alone. A new command would add contract surface with no behavior. The only gap was visible: the party view drew its thread only while a room was live, so every end, including a crashed process, took the transcript off the screen. Why one main line: a close the user asked for left no mark in the thread, while a process exit left one; the stop line is the harness's own fact in the room's register, never a persona's voice.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Open a room, send a message, press `stop room`: the thread stays with the stop line above the chooser, the header and strip are gone, *End session* clears it. Not verified in an unattended run unless the Electron app is launched against a real `claude`.

## Auto Run Result

**Summary:** A room now has one honest end. A `stop room` button in the party header closes the room's own session through the existing `session.close` path (kill the process, `session:closed`, transcript untouched). Main says one line in the room's register, `room stopped · session released`. The party view keeps drawing the room's entries, read-only, above the cast chooser once the room is gone (stop, a crashed process, or a restart), and nothing pause-like exists. *End session* is unchanged and remains the only control that clears the conversation. Counts stay 7 / 15 / 22 / 17.

**Files changed:**
- `src/main/session-voice.ts`, `src/main/session-bridge.ts` (+test) -- `LINES.roomStopped`, said for a room close only.
- `src/renderer/ui/chat/use-conversation.ts` (+test) -- `stopRoom()`.
- `src/renderer/ui/party/party-header.tsx`, `.css` (+dom test) -- the `stop room` button.
- `src/renderer/ui/party/party-view.tsx`, `.css` (+dom and ssr tests) -- stopped layout and focus after a stop.
- `src/renderer/ui/app.tsx`, `app.test.tsx` -- wiring and two real-`App` cases (stop; process exit).
- `tests/party-contract.test.ts`, `tests/negative-surface.test.ts` -- pins (the `closeSession(` call-site count is now 2; `stopRoom` never ends the conversation).
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 4.5 done.

**Review:** 20 findings across four layers. Patches applied: 5 (all low: a mid-turn room close test, a stopped-thread guard test, a stop-then-open freshness assertion, a non-vacuous contract slice, two comments). Deferred: 0. Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false -- only tests and comments were patched.

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (167 unit files, 3876 tests; 3 watcher files, 55 tests) and `npm run build` exit 0.

**Residual risks:** no Electron launch and no real `claude`: the stopped view, the focus move and the stop line are seen only in jsdom and fake-bridge tests. Stopping while a summary write is in flight can leave a partial or missing file with no signal but the rail. A long stopped transcript may start scrolled to the top after the remount. Two stopped rooms in one window run together in one thread, as earlier rooms already did.
