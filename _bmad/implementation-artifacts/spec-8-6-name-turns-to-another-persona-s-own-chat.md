---
title: 'Story 8.6: `@name` turns to another persona''s own chat'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: 'a2a60604498411a16c284c85d898e8a08f16aefd'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@John hi` typed in Mary's composer first opens John's seat (`conversation.activate`, a Story 7.4 leftover), then sends the text. That spawns a process on a bare turn to John, which Story 8.2 forbids for selection, and it leaves the first message's start to a separate open instead of Story 8.3's first-message path. A persona's half-typed text is also lost when the view turns away, so "a draft stays in its chat" is not true.

**Approach:** The handoff is a turn of the view to the named persona plus, when text follows the name, one ordinary `conversation.send` to that persona with the typed `@name` chip (Story 8.3's first message if John has no seat, a turn to his live one otherwise). Nothing is called in main for a bare `@name`, nothing is written in the chat typed in, and each persona's composer draft is held by the window and handed back when the view returns to it.

## Boundaries & Constraints

**Always:** `handoffTarget` is unchanged (names of other personas only, a unique case-insensitive match, `@` at the very start; anything else is a plain message in the chat it was typed in). On a resolved handoff, in this order: clear the originating persona's held draft (the whole text was sent or consumed), turn the view to the target (`setCurrentId`, chat `'persona'`), request focus for the target's composer, then, only if text follows the name, `conversation.send(target.id, text, mention)`. A bare `@name` is a turn and nothing else: no `session.open`, no process, no record, no line, no live dot. The message is a user turn in the target's thread (main sets `agentId` from the session it is recorded for; the optimistic turn carries `agentId` of the target) with its `@name` chip; nothing is added to the originating thread, its queue or its sent state, which stay as they were. A persona's composer draft is held per `agentId` in the app (a ref, not a render dependency), seeds that persona's composer when it mounts, and is dropped on that persona's close reply (Story 8.5) together with the epoch remount. The room's composer and `@name` in the room are unchanged; the skill-first sessions' and the New session chat's composers have no handoff, as today. The persona never receives the token (AD-25); `@` addresses a persona and never a skill (FR61). Personas keyed by `agentId`, never display name.

**Never:** Any change to the contract, bridge methods, channels, `CONTRACT_VERSION` or main; a `handed to` line (Story 7.4 stands) or announcement of a switch; a copy of the message into the originating chat; carrying the typed text to another chat; changing `handoffTarget` resolution; a new colour, token, size or component; removing `activate` from the conversation hook (other code and tests use it).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Handoff with text, John has no seat | `@John hi` in Mary's composer | View turns to John, focus in his composer; `session.open { seat: John, message: 'hi', mention: '@John' }` once; John's thread shows the turn with its chip; Mary's thread, queue and composer unchanged and empty | Refusal is Story 8.3's single line in John's thread |
| Handoff with text, John live | same, John idle or busy | One `sendTurn(John's session, 'hi', '@John')` (queued if busy); nothing opened | as any send |
| Bare `@John` | `@John` | View turns to John, focus in his composer; nothing called in main, nothing written, no live dot | n/a |
| Not a persona | `@zed hi`, `@mary hi` in Mary's chat, `hi @john`, `@bmad-agent-pm` | Plain message in the chat it was typed in, as today | n/a |
| Drafts | Draft typed in John's chat, then `@John` from Mary or a tile switch | John's composer shows his draft when the view returns; Mary's composer is empty after her send; neither draft appears in the other chat | n/a |
| Close | A persona's chat is closed | Its held draft goes with it (Story 8.5) | n/a |
| Room | `@John q` in the room's composer | Unchanged | n/a |

</intent-contract>

## Code Map

- `src/renderer/ui/app.tsx:543-565` -- the persona `composer` render prop: `onSend` handoff branch. Today `setCurrentId`, `setComposerFocus`, `conversation.activate(...).then(send)`. Replace with: clear the originator's held draft, `setCurrentId`, `setChat('persona')`, `setComposerFocus({ id: target.agent.id, n: 0 })`, then `conversation.send(target.agent.id, target.text, target.mention)` when `target.text !== ''`. No `activate`. The non-handoff branch (`conversation.send(agent.id, text)`) stays.
- `src/renderer/ui/app.tsx:109-118,294-304,527-535` -- add `const drafts = useRef(new Map<string, string>())` beside `newDraft`/`composerEpoch`; pass `initialText={drafts.current.get(agent.id) ?? ''}` and `onTextChange` writing the ref (delete the key on `''`) to the persona composer (`composer-${agent.id}-${epoch}` key stays); in `closeSession`, `drafts.current.delete(agentId)` before bumping the epoch when `closed`. `setChat` is already used by `onCurrentChange` and `sendFirst` (`app.tsx:323-336`), the same way.
- `src/renderer/ui/chat/composer.tsx:58-80,125-165` -- read only: `initialText` seeds `useState`, `onTextChange` is told every change by an effect, and a send with no returned promise clears the text (so a draft in a composer that unmounts in the same render as the send must be cleared by the caller, as `sendFirst` does with `setNewDraft('')`).
- `src/renderer/ui/chat/handoff-target.ts` -- read only; unchanged.
- `src/renderer/ui/chat/use-conversation.ts:699-712,484-510` -- read only: `send` is already Story 8.3's first-message path (`startSeatWithMessage` when no seat and nothing opening, `sendMessage` otherwise); `sendFirst`/`sendMessage` already tag the optimistic user turn with the target's `agentId` and carry the mention (`conversation-state.ts:186-236`). `activate` stays in the hook (no longer called by `app.tsx`).
- `src/main/session-bridge.ts:309-330,537-595` -- read only: main records the user's turn with the persona's `agentId`, and the mention only if it names that persona (`validMention`); no change.
- `src/renderer/ui/app.test.tsx:891-931,3220-3246,3915-3935` -- the `@name` tests: the "turns to the persona: the seat opens" test (bare `@john`) now expects `opened` and `seatStarts` empty and focus still in John's composer; the with-text test expects `seatStarts` of `{ seat: john.id, message: 'write the brief', mention: '@John' }`, `sent` empty, John's thread holding the one turn with its chip and Mary's thread empty (and, with Mary having a live seat, the thread unchanged); the Story 7.3 slash test (`opened` `[john.id]` at ~3246) now expects `seatStarts` of John's first message; the pending-focus test is unaffected. Add: a draft in John's chat survives a turn away and back; Mary's composer is empty after the handoff; a draft in Mary is not carried; close drops the held draft; `@john` in the room's composer unchanged (already pinned elsewhere, keep).
- `tests/negative-surface.test.ts:1526` -- pins `conversation.activate(` count in `app.tsx` at 1; it is now 0 -- amend to 0 (the handoff opens nothing). Grep the other `tests/*` and `src/**/*.test.tsx` for `@`-handoff expectations that an open follows (`epic-7-audit.dom.test.tsx`, `negative-surface.test.tsx`) and amend only those.
- `_bmad/planning-artifacts/epics.md`, `EXPERIENCE.md`, `DESIGN.md` -- Story 8.7's amendments; do not edit.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/app.tsx` -- the handoff branch calls no `activate`, clears the originator's draft, turns the view and focus, then sends once; per-persona draft ref seeding and reporting for the persona composer; drop the held draft on close -- FR141, UX-DR56
- `src/renderer/ui/app.test.tsx` and the pin in `tests/negative-surface.test.ts` (plus any other test that expected an open after a handoff) -- amend to the new behaviour; add the I/O matrix cases (no seat, live seat, bare name, drafts, close, plain `@` messages unchanged) -- NFR20-22

**Acceptance Criteria:**
- Given `@John hi` in Mary's composer, then the view turns to John's chat, `hi` is a user turn in John's thread with its `@John` chip, nothing is written in Mary's thread, and if John has no live session it is his first message (Story 8.3) and if he has one it is a turn to it.
- Given `@` and a name that is no persona, or the current persona, or an `@` mid-text, then it is a plain message in the chat it was typed in, as today.
- Given the room's composer, then `@name` is unchanged.
- Given Mary's composer after the turn, then the text she was typing is not carried to John's chat beyond the message sent, and a draft left in either chat is found there when the view returns to it.
- Given a bare `@John`, then the view turns to John and nothing is opened, written or announced.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 11, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind 1: a plain send's draft clearing is untested — test added (sent text does not come back as a draft after a turn away and back).
  - `[low]` `[patch]` Blind 2: John's draft untouched when `@John hi` is sent from Mary — test added.
  - `[low]` `[reject]` Blind 3: no refused-open or in-flight coverage for the handoff's first message — the first-message start, its busy requeue and its refusal line are Story 8.3's and tested in `use-conversation.test.ts`; the handoff now calls the same `send`.
  - `[low]` `[reject]` Blind 4: fake bridge repeats the open-target union and couples `seatStarts` with `opened` — the same shape `app.test.tsx` already hand-writes; a drift fails typecheck at the preload type.
  - `[low]` `[reject]` Blind 5: the `activate` pin matches literal call text only, and the hook's `activate` is unused by views — the spec keeps `activate` in the hook on purpose (its own tests); an alias in `app.tsx` is not a reachable regression.
  - `[low]` `[reject]` Blind 6: drafts of departed personas are never pruned — the New session chat's draft behaves the same and a ref entry is a few bytes; a returning agent id finding its own draft is the intended behaviour.
  - `[false]` `[reject]` Edge 1: text typed while a close is in flight is deleted on the reply — Story 8.5's rule is that the draft goes with the close on its reply, and the remount empties the field either way.
  - `[false]` `[reject]` Edge 2: a pending passive effect could re-store the old draft after the close delete — the delete and the epoch bump are one batched update, the removed composer's effects do not run after it unmounts, and the new composer seeds from the empty entry (the close test fails if the delete is removed).
  - `[low]` `[reject]` Edge 3 / Edge 6: the originator's draft is deleted although the first message may be refused — a plain send behaves the same (the composer clears at once); a refused first message leaves the turn drawn with Story 8.3's failure line, nothing retried.
  - `[low]` `[reject]` Edge 4: orphan draft entries after a roster change — as Blind 6.
  - `[low]` `[reject]` Edge 5: the fake's `openSession({seat})` never refuses and emits no `session:opened` — the refusal paths are 8.3's own tests; the app tests need only the request and the reply.
  - `[low]` `[reject]` Gap other: `conversation.activate` is unused by the views — kept by the spec (Never list), covered by `use-conversation.test.ts`.
  - `[false]` `[reject]` Intent audit: behaviour in main and the stored thread is not in the diff — main already records the turn with the persona's `agentId` and the mention (`session-bridge.ts:309-330,537-595`, tested at `session-bridge.test.ts:2664+`); the epic's "no persona id" evidence predates Story 8.1.
  - `[false]` `[reject]` Intent audit: a non-persona `@name` and the room's `@name` are not exercised — the unchanged `it.each` of unresolved name, current persona, mid-text `@` and agent id still runs and passes (`app.test.tsx`, "sends %s to the current persona unchanged"); the room's composer was not touched.
  - `[false]` `[reject]` Intent audit: no stored-record assertion for "nothing in Mary's thread" — the optimistic turn is tagged with the target's `agentId` in `sendMessage`/`sendFirst`, and the test turns back to Mary and finds her chat empty.
  - `[false]` `[reject]` Intent audit: "close story" is not in the diff — it is the finalization step (sprint status `8-6` to `done`, committed with this change).
  - `[low]` `[reject]` Intent audit: earlier pins were rewritten — they are the behaviour this story replaces on purpose (a bare `@name` opened a seat; `@name text` opened then sent).

## Auto Run Result

Status: done

**Summary.** `@name` in a persona's composer now turns the view to that persona and nothing else: no seat is opened (a bare `@John` is only a selection), and text after the name goes to John through the ordinary `send` as his first message (Story 8.3) or a turn to his live seat, with its `@John` chip, while Mary's thread, queue and composer are untouched. Each persona's half-typed text is now held per `agentId` and found again when the view returns; the handoff clears the originator's draft, and a persona's close (Story 8.5) drops its draft with it. No change to main, the contract or any channel.

**Files changed.**
- `src/renderer/ui/app.tsx` -- handoff branch without `activate`; per-persona `drafts` ref seeding and reporting the persona composer; draft dropped on a successful close.
- `src/renderer/ui/testing/fake-bridge.ts` -- `openSession({ seat })` recorded as `seatStarts` and `opened`.
- `src/renderer/ui/app.test.tsx`, `tests/epic-7-audit.dom.test.tsx`, `tests/negative-surface.test.ts` -- amended to the new behaviour (bare `@name` opens nothing; `@name text` is a first message or a live turn; `activate` count in `app.tsx` is zero) and extended with live, busy, draft and close cases.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- story 8.6 `done`.

**Review.** One pass, four layers: 17 findings (low 11, false 6). Patched: two test gaps (a plain send leaves no draft behind; John's draft survives a handoff to him). Deferred: none. Rejected: 9 low and 6 false with their reasons in the triage log.

**Follow-up review recommended:** false. Two low entries patched; no high, no medium.

**Verification.** `npm run typecheck` clean; `npm run lint` zero warnings and pins check; `npm test` 249 files / 6040 tests and the watcher project (3 files / 65 tests) pass. Matrix rows are covered by `app.test.tsx` (no seat, live, busy, bare name, not-a-persona `it.each`, drafts, close) and `epic-7-audit.dom.test.tsx`; the room row is untouched code. Not run against a real `claude` or in the Electron app.

**Residual risks.** The manual Electron check is not run. A persona's draft is read only when its composer mounts, so a refused first message after a handoff leaves the typed text as a turn with the failure line, not as a draft to retry (as a plain send does).

## Design Notes

The draft is a ref, not state: it is read only when a composer mounts, so keeping it costs no render. The handoff clears the originator's entry itself because Mary's composer unmounts in the same render as her send, and the composer's own clear-and-report effect would not run for it.

A bare `@name` stops opening the seat deliberately: selecting a persona spawns nothing (Story 8.2) and the first message starts the seat (Story 8.3), so naming a persona without a message is a selection.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: exit 0, zero warnings, pins check passes
- `npm test` -- expected: all suites pass

**Manual checks (if no CLI):**
- In the Electron app with a real `claude`: type `@John hi` in Mary's chat, confirm John's chat shows the turn with its chip and Mary's thread is unchanged; type `@John` alone and confirm no dot and no process; leave half a message in John's chat, turn away and back, and find it.
