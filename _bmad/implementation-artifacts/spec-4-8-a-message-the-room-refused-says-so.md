---
title: 'A message the room refused says so'
type: 'bugfix'
created: '2026-10-08'
baseline_revision: '9293023eb639aeaf4efc535444ed5bf6814dfd7b'
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

**Problem:** A send into a busy room that main refuses (`session/busy`: the interrupt was not acknowledged, or the turn did not end in time) is swallowed by the renderer. The user's entry stays on screen as sent, the topic and summary destination were set before delivery, and a refused *Write summary* looks asked. A send waiting when *stop room* is pressed shows a failure line for a refusal the stop caused and leaves a never-received entry in the stopped transcript (Epic 4 retrospective F2).

**Approach:** The renderer treats a busy refusal as "not sent": it removes the entry, derives the topic again from the entries still on screen, says one harness line, and (decision default) returns the user's own text to an empty composer. A refusal that arrives for a room the user stopped removes the entry and says nothing. Main already records a turn only after a write and is not changed.

## Boundaries & Constraints

**Always:** The room stays busy after a busy refusal (the turn goes on). The line is a renderer-only harness line in the room's thread, lower case, mono, `·`-separated, no terminal punctuation, placeholder copy `not sent · the room is still speaking` until `bmad-ux` writes it. Any other refusal (`session/write-failed`, not-found with the room live) keeps today's failure line and entry; a persona's busy path (`dispatchRefusedBusy`) is unchanged. Text is returned to the composer only for what the user typed, never for the summary ask, and only when the composer is empty; nothing is ever re-sent.

**Never:** No new command, event, channel or preload method (counts stay 7, 15, 22, 17). No change to `STOP_ACK_MS`, `STOP_RESULT_MS`, the room's no-gate rule or main's transcript recording. No spinner, badge, sound, retry control, queue, *try again* word or next-step guidance. No change to *Write summary*'s missing busy guard or stop-as-kill (retro F4, F8).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Busy refusal, later message | room live, speaker mid-turn, user sends `x`, main answers `session/busy` | entry gone; one room sysline `not sent · the room is still speaking`; room busy; `x` back in an empty composer; no failure line | No error expected |
| Busy refusal, first message | first send sets topic, main refuses | header `no topic yet`, destination `<topic>`; topic is that of the first message actually delivered | No error expected |
| Busy refusal, summary ask | *Write summary* refused | ask entry gone, line said, destination and topic as before, composer untouched | No error expected |
| Stop while send waits | send in flight, `stopRoom()` called, send answers busy or not-found | entry gone, no line, no failure; only the stop line of Story 4.5 | No error expected |
| Other refusal | `session/write-failed`, or not-found with room live and not stopped | busy cleared, entry kept, failure line as today | `onFailure` |
| Reload after refusal | refused send, window reloads | thread and record agree: neither holds the refused entry or line | No error expected |
| Composer not empty | refusal while user is typing | draft untouched, nothing returned | No error expected |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/use-conversation.ts:187-197,436-455` -- `transmitToRoom` (the swallow), `sendToRoom`/`writeSummary`, `stopRoom`; add `stopped` set of room session ids, route refusals, announce the line through `onHandoff`.
- `src/renderer/ui/chat/conversation-state.ts:261-300,331-380,650-670` -- `roomSent`/`roomSummaryAsked` (return the entry id), new `roomRefused`/`roomUnsent`, `roomReturned` field (initial, `ended`, `session:closed`), `storedTopicOf` reused to re-derive the topic.
- `src/renderer/ui/chat/composer.tsx` -- optional `returned: { key, text }` prop; applied once per new key, only when the field is empty, ignored on mount.
- `src/renderer/ui/party/party-view.tsx:48-160`, `src/renderer/ui/app.tsx:265-285` -- pass `roomReturned` through to the room's composer.
- `src/main/session-bridge.ts:317-340,372-398` (`interruptedRoom`, `sendNow`) -- read-only evidence: busy refusal records nothing; no change.
- Tests to replace: `use-conversation.test.ts:1604` and `:1716` ("keeps the entry and the busy mark ... says nothing"); add stop-during-send beside `stopRoom (Story 4.5)`. Add to `session-bridge.test.ts` near `:2530` (transcript untouched on a refused send), `conversation-state.test.ts`, `composer.dom.test.tsx`, `party-view.dom.test.tsx`, `epic-4-audit.dom.test.tsx` (refused-send state built by `foldEvent`/`roomRefused` from recorded events), `tests/negative-surface.test.ts`.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/chat/conversation-state.ts` -- `roomSent`/`roomSummaryAsked` return `entryId`; add `roomRefused` (remove entry, topic from remaining entries, line, `roomReturned` for typed text), `roomUnsent` (remove entry only), `ROOM_REFUSED_LINE`; clear `roomReturned` on close/end -- one pure place for the outcome
- `src/renderer/ui/chat/use-conversation.ts` -- `transmitToRoom` takes entry id and whether the text is the user's; stop-flagged sessions -> `roomUnsent`; busy -> `roomRefused` + announce; others as today; expose `roomReturned` -- renderer owns on-screen truth
- `src/renderer/ui/chat/composer.tsx`, `party-view.tsx`, `app.tsx` -- carry the returned text to the room's composer -- the default of the open decision
- tests listed in the Code Map -- pin the outcome, replace the two silent pins, add the bridge-level and stop-during-send cases, audit mount, negative surface
- `sprint-status.yaml`, `epic-4-context.md` -- 4.8 done at the end

**Acceptance Criteria:**
- Given a room send main refuses as busy, then the entry is not on screen, one harness line says so, the room stays busy, main records nothing, and no failure line shows.
- Given the refused send was the first message or the summary ask, then no topic is set by it and the destination is unchanged.
- Given *stop room* pressed while a send waits, then no failure line and no entry for it in the stopped transcript.
- Given any other refusal or a persona's busy session, then behavior is as before.
- Given a reload after a refusal, then neither the entry nor the line is in the thread; the audit mounts the refused state built by the fold.
- Given lint, typecheck, full tests and build, then all pass and the four counts stay 7, 15, 22, 17.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 32 findings (blind 10, edge-case 12, verification-gap 1, intent-alignment 9 observations triaged as 9 rows) — high 0, medium 0, low 11 (1 patched, 10 rejected), false 9, maybe-false 0; no bad_spec, no intent_gap
- findings:
  - `[low]` `patch` the wiring `useConversation` -> `app.tsx` -> `PartyView` -> `Composer` for the returned words is untested at the window (verification-gap; blind) — new `app.test.tsx` case mounting `App` with a live room whose `sendTurn` rejects `session/busy`: the field holds the typed text again, no `.turn--user`, the line is in `.party-thread`; the test fails when `returned={conversation.roomReturned}` is removed
  - `[low]` `reject` two refused sends return only the first one's words, and a draft typed meanwhile is never overwritten (blind, edge) — the spec's stated default is "returns when the composer is empty"; appending would touch a draft; the words stay in the user's thread memory and the line says what happened; a queue is a larger change than a direct correction
  - `[low]` `reject` a send refused while a stop is in flight, and the stop is then refused, loses the message with no line (blind, edge x2, claim) — needs both a busy/not-found for a send and a refused stop of the same room; a refused stop is itself a failure line the user sees; fixing needs deferring the decision until the stop settles
  - `[low]` `reject` `stopped` is never emptied on success (blind, edge) — session ids are unique per room and the set lives with one window's conversation; no reuse
  - `[low]` `reject` the line can be untrue if the turn ended before the refusal was applied (blind) — the refusal is main's answer to the send; a turn ending in that gap is a race of a few milliseconds and the room's busy mark is left as main's events set it
  - `[low]` `reject` entry id and composer key predicted from `nextId` (blind) — both are produced inside the same module and covered by `conversation-state.test.ts`; the key only needs to differ per refusal
  - `[low]` `reject` returned words are lost when the room's composer is unmounted at the time (edge) — a view switch inside the interrupt allowance; the composer ignores a key held at mount by design so a stale one never refills it
  - `[low]` `reject` a typed message refused after the room exited on its own is removed with no words returned and no line (edge) — the spec's own Design Note; `session:closed` already says what happened and the failure of a gone room is not "still speaking"
  - `[low]` `reject` returned words arrive in an unfocused field without caret handling (blind) — the user's focus is not taken by the harness; nothing in the spec asks for it
  - `[low]` `reject` the new negative-surface test slices source text and counts call sites (blind) — it follows the existing style of that file; a re-ordering fails loudly rather than passing
  - `[low]` `reject` refusal when the entry is gone after a `hydrate` while the send was in flight (edge) — `hydrate` runs once before any send is possible; the snapshot is taken before the composer is usable
  - `[false]` `reject` a refused first message re-derives its topic by `at >= openedAt`, so clock skew drops a delivered topic (edge) — both clocks are `Date.now()` on the same host (`use-conversation.ts:638`); a send is always after the open
  - `[false]` `reject` `session/write-failed` after a stop shows a failure line and keeps the entry (edge, claim) — `closeSession` kills and `finish`es in one tick, so a write begun before it answers `not-found` (closed is checked before `written`); the case cannot be reached
  - `[false]` `reject` `epic-4-context.md` is rewritten and drops `@<name>`, "no third view", reclaimed sessions and others (blind, edge x2) — the file is the compile-epic-context output, regenerated because the planning docs changed (`step-01`); it is not a hand edit and not part of the story's behaviour
  - `[false]` `reject` the `5-4-...` line in `sprint-status.yaml` and the `epics.md` rename are unrelated changes (blind, intent-alignment) — correct, and not this run's: they were made by the user in another session during the run and are committed separately
  - `[false]` `reject` sprint status says done while the spec says in-review (blind, intent-alignment) — the spec's status is set at finalization, after this pass
  - `[false]` `reject` the audit regex and the "still" exemption weaken the negative surface (blind) — the ban is on time-passing words in the room's own surfaces; the one line the spec names contains one and is the only exemption, stripped by its exact text
  - `[false]` `reject` the audit builds the refused state by hand (blind, verification-gap, intent-alignment) — no event represents a refusal and none may be added; the audit folds the recorded events and applies `roomSent` and `roomRefused`, the state functions the hook itself calls
  - `[false]` `reject` the unrun manual check against a real `claude` (intent-alignment) — recorded in the spec as not verifiable unattended
  - `[false]` `reject` the open decision about returning the text was not asked (intent-alignment) — the story states a default to take when unanswered; recorded in Boundaries
  - `[false]` `reject` a not-found for a closed room is silent rather than a failure line (intent-alignment) — the spec's Design Note; stop and exit are the cause and the room's own sysline says so
  - `[false]` `reject` the line is also announced through `onHandoff` (intent-alignment) — one polite live region per window; the announcement is the line itself, once

## Design Notes

The topic after a refusal is re-derived from the entries still on screen (`storedTopicOf`, the rule `hydrate` already uses), so a later message in flight or delivered becomes the topic and a refused one never is; with the open time unknown the topic is left as it was. A refusal for a closed room that the user did not stop (process exit) also removes the entry without the line, since "the room is still speaking" would be false. The stop is known by a flag set in `stopRoom` before main is asked and cleared if main refuses the stop.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Send into a busy room against a real `claude` whose interrupt is not acknowledged. Not verifiable in an unattended run.

## Auto Run Result

**Summary:** A message the room refused as busy no longer stays on screen as sent. The renderer removes the entry, re-derives the topic from the entries still on screen (so a refused first message sets none and the destination keeps `<topic>`), says one room line `not sent · the room is still speaking` (placeholder copy for `bmad-ux`), leaves the room busy, and returns the user's own typed words to an empty room composer. A refusal for a room the user stopped, or one already gone, removes the entry and says nothing. Main is unchanged.

**Files changed:**
- `src/renderer/ui/chat/conversation-state.ts` -- `roomSent`/`roomSummaryAsked` return `entryId`; `roomRefused`, `roomUnsent`, `ROOM_REFUSED_LINE`, `roomReturned`.
- `src/renderer/ui/chat/use-conversation.ts` -- `transmitToRoom` routes the refusals; `stopped` set filled by `stopRoom`; `roomReturned` exposed.
- `src/renderer/ui/chat/composer.tsx`, `src/renderer/ui/party/party-view.tsx`, `src/renderer/ui/app.tsx` -- `returned` words reach the room's composer.
- Tests: the two silent pins replaced in `use-conversation.test.ts`; new cases in `conversation-state`, `composer.dom`, `party-view.dom`, `epic-4-audit.dom`, `app`, `session-bridge` (a busy-refused send records nothing) and `tests/negative-surface.test.ts`.
- `_bmad/implementation-artifacts/sprint-status.yaml`, `epic-4-context.md` -- 4.8 done; context regenerated.

**Review:** four layers. Patches applied: 1 (low: the window-level wiring test). Deferred: 0. Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false -- only a low finding was patched.

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (169 unit files, 4099 tests; 3 watcher files, 55 tests) and `npm run build` exit 0 after the patch. The four counts stay 7, 15, 22, 17. The new `app.test.tsx` case fails when the `returned` wiring is removed.

**Residual risks:** no Electron launch and no real `claude` with an unacknowledged interrupt. Returned words are dropped if the composer is not empty (or not mounted) when the refusal arrives, and a second refusal in a row returns only the first message's words. A send refused while a stop is in flight and the stop then refused loses the message without a line.
