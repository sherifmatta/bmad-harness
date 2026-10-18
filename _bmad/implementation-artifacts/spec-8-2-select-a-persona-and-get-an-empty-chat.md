---
title: 'Story 8.2: Select a persona and get an empty chat'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '754767d781bd0b15d18227f14732990c0907c8a2'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Selecting a persona's tile calls `conversation.activate`, which opens a session in main; main spawns the process and writes `/<agentId>` as the first stdin turn, so the persona greets before the user has said anything.

**Approach:** Selecting a tile (click, `Enter`, `Space`) becomes renderer-only: it sets the current persona and turns the chat, and calls nothing in main. A persona with no live session shows the empty chat (thread introduction, skill row drawn disabled, composer); the first message still starts the seat exactly as it does today (Story 8.3 reworks that).

## Boundaries & Constraints

**Always:** Selection sets `currentId` and `chat = 'persona'` and nothing else: no `session.open`, no process, no stdin write, no record, no harness line, no event, no announcement. A live persona's thread and live dot show as now. The tile keeps its state and focus stays on it (NFR21); arrow keys still only move focus. The window still opens on the New session chat with no persona current. The first message path (`send` to `ensureSession(agentId, false)`, queued until `session:awaiting-turn`) is unchanged. `@name` and a first message naming a persona keep their existing open (`conversation.activate` stays for them; Story 8.6). The empty chat's introduction stays harness text with no button, handler or tab stop. `CONTRACT_VERSION`, the 17 events and 8 commands are unchanged.

**Never:** Any skill-button behaviour on an empty chat (the button is drawn disabled and starts nothing; what it does is Story 8.3's open decision). Changing the first message's queued marker, the greeting or the activation join (8.3). Main-side changes of any kind. Any change to what a tile shows, says or orders, or to the live dot's meaning. `close session`, `@name` routing or run-card changes (8.4-8.6). New state, colour, token, size or component. Moving focus into the composer on selection.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Select, no session | Click, `Enter` or `Space` on a persona's tile, persona not live | Header shows that persona's disc, name, title; thread empty but for the introduction; skill row drawn, buttons disabled; composer takes typing; tile `aria-current`, no live dot, same state | n/a |
| Select every persona in turn | Each tile selected once | Zero `openSession`, `sendTurn`, `dispatchMenu` calls; no entry added to the conversation; no sysline | n/a |
| Select, live session | Persona with a session | Their existing thread and dot show; no second open; skill row enabled when no turn is in flight | n/a |
| Select, stored thread, no session | After a reload, a persona with records | Thread drawn, no introduction, no live dot, no process; skill row not drawn (no session, thread not empty) | n/a |
| Press a disabled skill button | Empty chat | Nothing happens (`disabled`) | n/a |
| First message | Type and send on an empty chat | As before this story: session opens, message queued then delivered | Open failure as before |
| Arrow keys | Arrow on the tile list | Focus moves only; nothing selected | n/a |

</intent-contract>

## Code Map

- `src/renderer/ui/app.tsx:391-395` -- `onActivate` handler calls `conversation.activate(agentId)`: drop that call, keep `setComposerFocus(null)`. `app.tsx:386-390` `onCurrentChange` already sets the persona and `chat='persona'`. `app.tsx:470-486` composer `head`: draw `SkillRow` when the persona has a session or `threadEmpty` is true (viewed persona has no thread record), `disabled={conversation.sessionOf(agent.id) === undefined || !conversation.canAnswer(agent.id)}`. Header comment (lines 58-64) says selecting opens a session: update. `app.tsx:501` (`@name` handoff `activate`) is NOT touched.
- `src/renderer/ui/shell/shell.tsx:288-297, 186-188` -- `select` calls `onCurrentChange` then `onActivate`; keep the prop and its call (App now uses it only to clear pending composer focus); fix its doc comment.
- `src/renderer/ui/shell/thread-intro.tsx` -- hint line `send <Name> a message to open a session, then run a skill from the row above the composer` stays true (a message opens the session; the row is disabled until then); only the doc comment's "it needs a session; ... how a session starts" is brought in line.
- `src/renderer/ui/chat/skill-row.tsx` -- unchanged; its `disabled` prop already carries the rule. Update the comment ("disabled while a turn is in flight") to include "no session yet".
- `src/renderer/ui/chat/use-conversation.ts:567-570` -- `activate` stays (its remaining callers are `@name` and Story 8.6's); update its doc if it names tile selection.
- `src/renderer/ui/chat/chat-header.tsx` -- no change expected (close control is drawn only with `onClose`, and `liveSessions.has`).
- Tests that rely on a tile click opening the seat: `src/renderer/ui/app.test.tsx` (`mountOn` at 216, the "opens the selected persona's session" test at 454-486, `expect(opened)` lines 456-496, 623, 836, 875-924, 2741, 2946), `tests/epic-7-audit.dom.test.tsx`, `src/renderer/ui/chat/dead-card.dom.test.tsx`, `src/renderer/ui/team/team.test.tsx`, `src/renderer/ui/shell/thread-intro.test.tsx`. Update each to the new rule: a seat now exists after a first send (or a pushed `session:opened`), not after a click.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/app.tsx` -- selection no longer calls `conversation.activate`; skill row drawn for an empty chat, disabled without a session; comments updated -- FR138
- `src/renderer/ui/shell/shell.tsx`, `thread-intro.tsx`, `skill-row.tsx`, `use-conversation.ts` -- doc comments only
- `src/renderer/ui/app.test.tsx` -- new `Story 8.2` block: every persona selected by click, `Enter` and `Space` gives zero `openSession`/`sendTurn`/`dispatchMenu`, no entry, no sysline, no live dot, header and intro as specified, skill row disabled and pressing it does nothing, composer takes typing and focus stays on the tile, arrow keys only move focus, a live persona's thread shows with no second open, a first message still opens and delivers, window still opens on New session; rework the tests listed in the Code Map to the new rule
- `tests/epic-7-audit.dom.test.tsx`, `dead-card.dom.test.tsx`, `team.test.tsx`, `thread-intro.test.tsx` -- adjust only where they assumed a click opens a seat

**Acceptance Criteria:**
- Given a persona with no live session, when the user selects their tile by click, `Enter` or `Space`, then the chat opens with their name, initials disc and title in the header and an empty thread, the composer takes typing, and no process is spawned, `session.open` is not called, nothing is written to any stdin, no record or line is added to any thread, and the tile shows no live dot and keeps its state.
- Given a persona with a live session, when the user selects their tile, then their existing thread and live dot show and no session is opened.
- Given the arrow keys on the tile list, then they only move focus, and focus stays on an activated tile.
- Given an empty persona chat, then it shows the thread introduction (no button, handler or tab stop), the persona's skill row with its buttons disabled, and no greeting.
- Given the window opens or the project reloads, then it opens on the New session chat with no persona current, and each persona's thread is restored with no persona shown live unless its session is.
- Given every persona selected in turn, then a test finds zero `session.open` calls and zero processes, and the harness writes no line.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 21 findings — high 0, medium 1, low 13, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: held-button test never asserts focus after typing — added `expect(document.activeElement)` is the tile after `type(...)`.
  - `[low]` `[reject]` Blind: epic-7 audit's Sally case fakes the seat with pushed events — the audit's subject is the end control, and a click no longer opens a seat; a real first send there adds machinery without testing more of it.
  - `[false]` `[reject]` Blind: seat-order and `s-mary` to `s-john` test edits unexplained — they follow from a click no longer opening Mary's seat; John is the first persona whose seat is opened by a send.
  - `[low]` `[reject]` Blind: coverage narrower than "every persona", Space synthesised as a click — the fixture roster is Mary and John, and a native button fires its click for Space, which jsdom does not do itself.
  - `[low]` `[reject]` Blind (and Edge 1): the skill row and introduction vanish after a first send until `session:opened` — the thread then holds a record and the row's rule is "session or empty thread", as specified; Story 8.3 reworks the first-message path.
  - `[low]` `[reject]` Blind: empty-thread rule duplicated inline beside `threadEmpty` — both use the one predicate; drift is not shown, and the fix is a refactor.
  - `[low]` `[reject]` Blind: disabled skill buttons carry no reason text — held buttons already read this way during a turn; the introduction's hint says why.
  - `[low]` `[reject]` Blind: `onActivate` is vestigial — it still clears a pending composer focus request, which the new test now pins; removing the prop is a structural change for a later story.
  - `[false]` `[reject]` Blind: docs and guards partly updated — the `activate` doc describes the `@name` path it still serves, and the result file named in the spec is committed.
  - `[low]` `[patch]` Blind: new comments on single over-long lines — re-wrapped in `skill-row.tsx`, `shell.tsx` and `thread-intro.tsx`.
  - `[low]` `[reject]` Edge 2 and 8: tile selection no longer clears a held failure line — selecting does nothing else by spec; the line clears at the next send, and clearing it needs a new public method on `Conversation`.
  - `[false]` `[reject]` Edge 3: a dead session is not re-opened by selecting its tile — that is the point of the story; a first message is the one restart.
  - `[low]` `[reject]` Edge 4: `disabled` repeats what `canAnswer` returns without a session — harmless and explicit, no behaviour differs.
  - `[false]` `[reject]` Edge 5: seat-order assertions depend on fake open order — same as Blind 3.
  - `[low]` `[reject]` Edge 6: no assertion that the row is disabled before `session:opened` in the reworked test — the Story 8.2 block asserts it.
  - `[false]` `[reject]` Edge 7 (claim): spec lists three test files that need no change — they needed none; the spec's list is a read-only map.
  - `[false]` `[reject]` Edge 9 (claim): main sees only `@name` switches — Story 7.4 has main write no line for a switch and nothing else reads it; the epic requires selection to call nothing in main.
  - `[medium]` `[patch]` Verification gap: deleting `setComposerFocus(null)` from `onActivate` left every test green, so a focus steal on tile selection would ship unseen — added a test with an `@John` handoff leaving a focus request pending, then tile clicks, asserting focus stays on the tile; it fails with the line removed.
  - `[false]` `[reject]` Intent audit (four readings, no defect claimed): the diff implements Story 8.2 as amended on 2026-10-18; main is untouched by the story's own boundary.

## Design Notes

The skill-button start on an empty chat was moved to Story 8.3 on 2026-10-18 (owner decision; see `bmad-build-auto-result-8-2-select-a-persona-and-get-an-empty-chat.md`): it contradicts AD-30's activation turn and AD-11's serialisation. 8.2 therefore draws the row disabled rather than enabled-and-inert; 8.3 enables it.

Skill row rule: drawn when the persona has a session, or the viewed thread holds none of its records (`threadEmpty`, per persona since Story 8.1). A persona with a stored thread and no session has no row, as before. The thread introduction's hint is kept: it was true before (a message opens a session) and stays true.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: exit 0, zero warnings
- `npm test` -- expected: all suites pass

## Auto Run Result

Status: done

**Summary.** Selecting a persona's tile (click, `Enter`, `Space`) now only sets the current persona and turns the chat, and calls nothing in main: no `session.open`, no process, no stdin write, no record or line. An empty persona chat shows the thread introduction, the persona's skill row drawn disabled, and the composer. A persona with a live session shows its thread as before. The first message still opens the seat as it did (Story 8.3 reworks that). The skill-button start on an empty chat was moved to Story 8.3 on 2026-10-18 by the owner.

**Files changed.**
- `src/renderer/ui/app.tsx` -- `onActivate` no longer calls `conversation.activate`; skill row drawn when the persona has a session or no thread records, disabled without a session.
- `src/renderer/ui/shell/shell.tsx`, `thread-intro.tsx`, `chat/skill-row.tsx`, `chat/use-conversation.ts` -- doc comments only.
- `src/renderer/ui/app.test.tsx` -- a Story 8.2 block of 10 tests; earlier tests reworked to "a seat exists after a first send or a pushed `session:opened`, not after a click".
- `tests/epic-7-audit.dom.test.tsx`, `tests/negative-surface.test.ts` -- the end-control case opens Sally's seat by events; the `conversation.activate(` count in `App` is 1.
- `_bmad/planning-artifacts/epics.md`, `epic-8-context.md` (earlier commits) -- skill-button criterion moved to Story 8.3.

**Review.** One pass: 21 findings. Patched: one medium (the pending composer-focus guard had no test; added, and it fails when the line is removed), two low (a focus assertion after typing, comment wrapping). Nothing deferred. Rejected: 13 low and 7 false, each with its reason in the triage log.

**Follow-up review recommended:** false (one medium patched, no high).

**Verification.** `npm run typecheck` clean; `npm run lint` zero warnings; `npm test` 5938 unit and 65 watcher tests pass. Not run in the Electron app.

**Residual risks.** After a first message is sent the skill row disappears until the session attaches (the thread has a record and no session yet); a failure line is not cleared by selecting a tile; the real app was not exercised, so "no process spawns" is shown through the bridge fake, not the process. The skill-button first action on an empty chat is Story 8.3's open decision (three readings in `epics.md`).
