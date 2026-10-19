---
title: 'Story 8.4: A run in a chat you are not looking at stays in its own chat'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: '3f36038682e09df74c65e675c5ff0f5ecc183216'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A skill-first session's run revealed while its seat is not the viewed chat leaves the request held in `revealRunId`, so the card scrolls when the seat is next opened, not on a banner click.
    evidence: |-
      The handler's `owner === undefined` branch calls `setRevealRunId(runId)` whatever is viewed; nothing spends it until that seat's card mounts. The path is the Story 3.10 behaviour kept as the spec says; a notification for a skill-run does not turn to its seat. Settle by deciding whether a skill-run banner should turn to its seat as a persona's run does.
    location: >-
      src/renderer/ui/app.tsx (the connectRunRevealed handler)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 8.1's thread filter already keeps another persona's run card out of the viewed persona's chat, but Story 3.10's notification still "switches no persona": activating one for John's run while Mary is viewed scrolls nothing, because John's card is in a chat that is not drawn. The one-line card of Story 3.5 has no caller left in a persona's chat and the code still says it waits for this story.

**Approach:** Pin what 8.1 already does (a background run draws nothing in the viewed chat, a stop control only in its own chat, the card live and in place on return) and change the one thing that is wrong: a `run:revealed` for a persona's run turns the window to that persona's 1:1 chat, then scrolls that card into view once. No new contract surface: `run:revealed` still carries the run id alone, and the window finds the owner from its own card.

## Boundaries & Constraints

**Always:** The reveal handler reads the card it holds for the run id (as now, an unknown id is dropped and nothing is held for later). A persona's run (`threadAgentOf(card)` defined) whose persona is on the roster sets that persona as current, the chat column to `persona`, the view to the 1:1 conversation (a window on Party Mode or the Board is brought back to it), and requests the reveal only once the view shows that persona, so the thread's reset to its bottom (`useFollow` `resetKey`) lands first and the card's scroll, which pauses following, is last. Already viewing that persona, it is today's reveal. A persona off the roster has no chat to turn to: drop the request. A skill-first session's run keeps today's path (no turn, scrolls only if its seat is the one viewed) and the room is untouched. The reveal moves no focus, opens nothing, starts no session, sends no command, writes nothing into any thread, and the composer's draft and focus are as they were. Main is unchanged apart from the notifier's doc comment: unfocused-window-only, one silent line, the run id to that window alone.

**Never:** A pointer, mark, badge, count or line about a running persona inside the viewed chat; any new colour, token, component or tile-dot state; a change to how a run is dispatched, stopped or recorded; a change to the `run:revealed` channel's payload, the contract, `CONTRACT_VERSION` or the eight commands and seventeen events; removing `RunCardLine`, `isCollapsed` or the `collapse` prop of `Turns` (many source-text pins read them; their removal is the closing audit's, Story 8.7). Turning to a skill seat on a skill-run notification.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| John runs while Mary is viewed | John's `run:started`, Mary current | Mary's thread: no card, no line, no stop; John's tile `work`, rail, Agents panel and Recent activity report it as now | n/a |
| Back to John | Tile click | His pinned card, full and live, in place; its stop is there | n/a |
| John's run ends, Mary viewed | `run:finished`, window unfocused | Nothing written into Mary's thread; main posts the one banner as now | n/a |
| Banner activated, other persona | `run:revealed` for John's ended card, Mary viewed | View turns to John's chat, that card scrolled to its start once, following paused; no focus move, nothing sent or opened | n/a |
| Banner activated, same persona | Card is in the viewed chat | Today's reveal, no turn | n/a |
| Banner activated from Party Mode or the Board | Window on another view | Conversation view shown, then as above | n/a |
| Banner activated, persona off the roster or run not held | Orphan's card, or unknown id | Dropped; nothing held for later | n/a |
| Banner activated, skill-first session's run | Card with `skillSession` | Today's path, no persona turned to | n/a |

</intent-contract>

## Code Map

- `src/renderer/ui/app.tsx:146-174` -- `expandedRuns`, `focusRunId`, `revealRunId` state and the `connectRunRevealed` subscription (its `entriesRef` holds the entries). Add a pending reveal `{ runId, agentId }` state, a roster ref beside `entriesRef`, and a passive effect on `[pending, chat, currentId]` that, once `chat === 'persona'` and `currentId === pending.agentId`, calls `setRevealRunId(pending.runId)` and clears the pending. The handler uses `threadAgentOf(card)` from `src/shared/thread.ts`; for a persona run it calls `setCurrentId`, `setChat('persona')`, `setShowView((held) => ({ view: 'conversation', n: (held?.n ?? 0) + 1 }))` and sets the pending; otherwise today's `setRevealRunId`. Fix the header comment (lines 67-83) that says a one-line form "stays declared until Story 8.4" and that the reveal touches no current persona.
- `src/renderer/ui/shell/shell.tsx:273-283` -- `showView` already turns the top-level view once per `n`; `FollowScroller resetKey` (line 383) goes to the bottom on a persona change, which is why the reveal waits one commit. Read only.
- `src/renderer/ui/chat/use-reveal.ts` -- doc comment only: the hook still switches nothing; the window turns the chat before it asks for the scroll. `src/renderer/ui/chat/run-card.tsx:15` mounts it. Read only.
- `src/main/windows/run-notification.ts:34-37` -- doc comment `Activation.`: drop "no persona switch"; the window turns to the run's persona; logic untouched. `tests/completion-replay.test.ts`, `src/main/windows/run-notification` tests stay as they are.
- `src/renderer/ui/chat/transcript.tsx:54,73-95,198-249` -- `pinnedRun`, `RunCollapse`, `Turns`: the persona view filters by `isEntryInPersonaThread`, so another persona's card is never drawn there (collapsed or full). Doc comments only (the `RunCollapse` comment: no caller in a persona's chat; its removal is Story 8.7's).
- `src/renderer/ui/chat/run-status.ts:159` -- `isCollapsed` stays; nothing in a persona's thread reaches it for another persona.
- `tests/negative-surface.test.ts:2498-2512` -- pins the revealing slice of `app.tsx` against `setCurrentId`; amend (Story 3.10 amended): the slice may name `setCurrentId`, `setChat` and `setShowView`, and still must not name `setComposerFocus|openDoc|activate(|send(|runSkill|stopRun|close(`. The `use-reveal.ts` pin (no `setCurrentId`, no `focus(`) stays unchanged. Its title ("switches no persona") is edited to match.
- `src/renderer/ui/app.test.tsx:2192-2291` -- Story 3.10 block (`afterRun`, `reveal`, `scrolled`, `mountOnMary`, `tile`): amend `scrolls nothing for a run of another persona` (line 2267) and add the cases below. Lines 2031, 2134, 2181 and 3244 already assert no `.run-card-line` in a persona chat; extend there for the no-card case rather than duplicating.
- `_bmad/planning-artifacts/epics.md:2318` -- 3.10 amendment already recorded; nothing to edit. Notes on Stories 3.5 and 3.10 in `EXPERIENCE.md`/`DESIGN.md` are Story 8.7's.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/app.tsx` -- turn to the persona on a reveal for a persona's run, with the pending-reveal effect and the roster guard; fix the comment -- FR137, FR94 as amended
- `src/renderer/ui/chat/use-reveal.ts`, `transcript.tsx`, `src/main/windows/run-notification.ts` -- doc comments only, no logic -- Story 8.4 amends 3.5, 3.10
- `tests/negative-surface.test.ts` -- amend the revealing-slice pin and its title as above
- `src/renderer/ui/app.test.tsx` -- tests for each matrix row: (a) John running while Mary viewed: no `.run-card`, no `.run-card-line`, no stop in `.thread`, John's tile `work`, `.chat > .pinned` null; (b) turning to John: pinned card full with its stop, tile `aria-current`; back to Mary: nothing of it, then John again: same card, not remounted from stored state (its notes intact); (c) reveal for John's ended card with Mary viewed: `aria-current` on John, field `Message John`, the card in `.thread` scrolled once with `{ block: 'start' }`, following paused (the `↓ latest` control drawn), `document.activeElement` not moved to the field, and `opened`, `sent`, `docsOpened`, `dispatchedMenus`, `closedSessions`, `stopped`, `ended` all unchanged; (d) reveal from the Board view shows the conversation view; (e) a card of a persona off the roster and an unknown id: nothing scrolled, no turn, nothing held; (f) a skill-first session's run: no persona turned to; (g) the viewed chat gets no new record or `.sysline` when John's run finishes
- Existing Story 3.10 tests that stay as they are (same-persona reveal, spent request, drop unknown, named card only, nothing sent) must pass unchanged

**Acceptance Criteria:**
- Given John running a skill while the user views Mary, then Mary's thread shows nothing of it (no card, no collapsed line, no stop) and John's tile, the rail, the Agents panel and Recent activity report it as before.
- Given the user turns back to John, then his thread shows the card full, live and in place, because the card is fed by the run's events.
- Given a run that finishes, fails or is stopped while another persona's chat is open, then main's one notification is unchanged (unfocused window only) and nothing is written into the viewed thread.
- Given that notification is activated, then the window shows the named persona's chat with that run's card scrolled into view once, and starts nothing, opens no document and moves no focus.
- Given a skill-first session's run or the room, then neither changes.
- Given the contract, then `run:revealed` carries the run id alone and the eight commands, seventeen events, thirty-six channels and `CONTRACT_VERSION` are unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 23 findings — high 0, medium 5, low 15, false 3, maybe-false 0 (the five mediums are two entries by root cause: the New/seat-chat reveal and the Board same-persona reveal, both test gaps)
- findings:
  - `[low]` `[reject]` Blind 1: a stale `pendingReveal` fires on a later visit — the pending, `setCurrentId` and `setChat` are set in one batch, so the effect runs on the very next commit with matching state; it can only linger if the user navigates inside one microtask.
  - `[low]` `[reject]` Blind 2: `viewRef` lags two back-to-back reveals — each reveal is a separate banner click by the user; two inside one render is not reachable.
  - `[low]` `[defer]` Blind 3: a skill-first reveal for a seat not viewed stays held in `revealRunId` and scrolls when the seat is opened — the path is today's (spec: skill session unchanged), not caused by this change; recorded as deferred.
  - `[false]` `[reject]` Blind 4: reveal ordering rests on untested timing — the new main test (John's chat drawn for the first time) fails if the request is made in the commit that turns the view, as the implementer checked.
  - `[low]` `[reject]` Blind 5: composer drafts across the turn are untested — the composer is keyed by persona and the path never touches it; a draft is held by its own composer, as for any tile click.
  - `[medium]` `[patch]` Blind 6: view coverage gaps (same-persona reveal on the Board, New chat showing) — tests added for same-persona on the Board and for the New chat / skill seat showing.
  - `[low]` `[patch]` Blind 7: the negative-surface pin passes if any one setter appears — split into three assertions.
  - `[low]` `[reject]` Blind 8: an off-roster reveal is dropped silently — the spec says to drop it: its card is in no chat, and main's banner logic stays unchanged.
  - `[low]` `[defer]` Edge 1: skill-first reveal for a seat not viewed leaves no card to spend the request — as Blind 3.
  - `[low]` `[reject]` Edge 2: `pendingReveal` never cleared when the user turns elsewhere first — as Blind 1.
  - `[low]` `[reject]` Edge 3: the run card could leave `entries` before the microtask — entries leave only on `conversation.end`, which also drops the run; unreachable in a microtask.
  - `[low]` `[reject]` Edge 4: stale `viewRef` between two reveals — as Blind 2.
  - `[medium]` `[patch]` Edge 5: same-persona reveal from the Board or Party untested — as Blind 6, the Board test is added.
  - `[low]` `[patch]` Edge 6: the skill-first test never asserts a scroll outcome — extended: nothing scrolls while another chat is viewed, one scroll with the seat viewed.
  - `[low]` `[reject]` Edge 7: the off-roster test does not assert view and label unchanged — it asserts `aria-current`, scroll and every host list; the handler returns before `setShowView`.
  - `[medium]` `[patch]` Edge 8: persona current while the chat is New or a skill seat is unexercised — test added (same as the verification gap below).
  - `[false]` `[reject]` Edge 9 (claim): the doc comment says the window always turns — it says a skill-first run turns to none, which is what the code does.
  - `[false]` `[reject]` Edge 10 (claim): "nothing held for later" is untrue for skill-first and pending — the clause is about an unknown run id and an off-roster persona, which it holds true for; the skill-first hold is Blind 3's deferral.
  - `[medium]` `[patch]` Gap 1: no test reveals a persona's run while `currentId` equals it but the chat column is New or a skill seat — the test is added.
  - `[low]` `[patch]` Gap 2: the skill-first reveal is verified only as "nothing happens" — extended as Edge 6.
  - `[medium]` `[patch]` Gap 3: same-persona reveal on the Board or Party is unverified — the Board test is added.
  - `[low]` `[defer]` Gap other 1: a skill-first reveal for an unviewed seat holds the request — as Blind 3.
  - `[low]` `[reject]` Gap other 2: `pendingReveal` has no expiry — as Blind 1.
  - Intent alignment: descriptive audit, no findings; it read the diff as Story 8.4's one behaviour change plus pins on Story 8.1's thread filter, and notes the main-process path and real layout are not exercised by the unit tests (the spec's manual check says so).

## Auto Run Result

Status: done

**Summary.** Activating a run's notification now turns the window to the run's persona when the run is a persona's: current persona, chat column and the 1:1 view, then the card scrolls into view once, after the thread's reset to its bottom. Story 8.1's filter already kept another persona's run out of the viewed chat, so that, the stop control's place and the card live on return are now pinned by tests. No contract, main logic or tile-dot change.

**Files changed.**
- `src/renderer/ui/app.tsx` -- reveal handler turns to the owner persona, pending-reveal effect, roster guard; header comment.
- `src/renderer/ui/chat/use-reveal.ts`, `transcript.tsx`, `src/main/windows/run-notification.ts` -- doc comments only.
- `src/renderer/ui/app.test.tsx` -- tests for each matrix row, plus the New/seat-chat and same-persona-on-Board reveals and the skill-first reveal.
- `tests/negative-surface.test.ts` -- reveal-slice pin amended (Story 3.10 amended) and split per setter.

**Review.** One pass, four layers: 23 findings (medium 5, low 15, false 3). Patched: the two test-gap entries (five medium rows), plus two low (skill-first assertions, split pin). Deferred: one, low (a skill-first run revealed while its seat is not viewed stays held until the seat is opened). Rejected: 10 low and 3 false, each with its reason in the triage log.

**Follow-up review recommended:** true. Two medium entries were patched; both are test-only, but the one unverified risk is the one-microtask ordering of the reveal against the thread's reset, checked in jsdom only, never in the Electron app.

**Verification.** `npm run typecheck` clean; `npm run lint` zero warnings and pins check; `npm test` 5993 unit and 65 watcher tests pass. Not run against a real `claude` or in the Electron app.

**Residual risks.** The reveal waits one microtask on the turn path. A skill-first run's banner does not turn to its seat (deferred). The collapsed one-line card stays declared and unreachable in a persona chat; its removal is left to Story 8.7.

## Design Notes

Why the reveal waits one commit: `useFollow` puts a thread at its bottom, following, whenever its `resetKey` changes, in the scroller's layout effect, which runs after its child card's. A card that asks to be revealed in the same commit as the turn scrolls into view and pauses, and then loses to the reset. Setting current persona and chat first and requesting the reveal from a passive effect once `chat`/`currentId` show the persona means the card scrolls last.

```
reveal(runId):
  card = entries.find(run, runId)            // none -> drop
  owner = threadAgentOf(card)
  owner === undefined -> setRevealRunId(runId)       // skill session: today
  owner not on roster -> drop
  else setCurrentId(owner); setChat('persona'); showView('conversation'); pending = { runId, owner }
effect: chat === 'persona' && currentId === pending.owner -> setRevealRunId(pending.runId); pending = none
```

As built, the effect that makes the request schedules it in a `queueMicrotask` (with a cancel guard), because the repo's `react-hooks/set-state-in-effect` rule rejects a direct set there; a reveal for the persona already viewed is requested at once, as before. The turn path is therefore asynchronous by one microtask.

The collapsed one-line form is left in place, unreachable for another persona in a persona chat. Removing it touches about ten test files and several source-text pins in `tests/negative-surface.test.ts` and `tests/accessibility.test.ts`, so it is left for Story 8.7's audit.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: exit 0, zero warnings
- `npm test` -- expected: all suites pass

**Manual checks (if no CLI):**
- In the Electron app with a real `claude`: start a skill in John's chat, turn to Mary and confirm her chat shows nothing of the run; blur the window, let the run end, click the banner and confirm the window shows John's chat with the card in view and nothing started. Not exercised by the unit tests.
