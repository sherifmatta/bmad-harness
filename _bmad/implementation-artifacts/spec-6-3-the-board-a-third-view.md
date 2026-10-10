---
title: 'The Board, a third view'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_revision: '93d80510041e6eaba0aedea517b53c8e879bda94'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-6-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The shell has two views and no way to look at where the work stands. Story 6.2 built the Board's snapshot (`getBoard`, `onBoardChanged`), but no view consumes it, and FR11 and NFR20 still say there is no third view and no shortcut layer.

**Approach:** Add `Board` as the third segment of the view switch and a third section that fills the body, fed by one renderer hook over the existing bridge methods. It draws only `no sprint status` and the watched path when the snapshot says `none`; regions are Stories 6.4 to 6.7. Add the one chord, `g` then `b`.

## Boundaries & Constraints

**Always:** `VIEWS` stays the one place that names views. Native buttons, shared focus ring, no new tab-stop kind. The Board section stays mounted and `hidden` when not current, like the other two. Nothing is announced (no `aria-live`, no `Announcer` call). Tokens only, no motion, no new media query. A launch opens on 1:1 and the current view is stored nowhere. A thread that was paused stays paused where it was left when its view is shown again; one that was following goes to its bottom.

**Never:** Any Board region, card, figure or count. A badge, count or dot on any segment. A second chord or any other shortcut. A persisted view. A change to Party Mode or to 1:1 beyond the scroll rule above. A write to the project. A spinner or skeleton before the first snapshot.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Switch | press `Board` | Board shown in one frame, others `hidden`, nothing else changes | N/A |
| Snapshot `none` | `{kind:'none'}` | `no sprint status`, the watched path beneath, no region | no dialog, no stack |
| Snapshot `read` | `{kind:'read'}` | empty body (regions are 6.4+) | N/A |
| No snapshot yet | before first `getBoard` | empty body | N/A |
| `getBoard` rejects | `HarnessError` | `no sprint status` as for `none` | no dialog |
| Chord | `g` then `b` within 1000 ms, no modifier, focus not in a field | Board shown | N/A |
| Chord cancelled | `g`, other key; or `g`, then over 1000 ms; or a modifier held | nothing | N/A |
| In a field | `g` `b` in textarea, input, select or contenteditable | nothing outside the field | N/A |
| Return | back to 1:1 or Party | each as left; a paused thread at its offset, a following one at bottom | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/shell/view.ts` -- `VIEWS` gains `{ id: 'board', label: 'Board' }`; rewrite the comment (a third view is now a listed one; Help is still not).
- `src/renderer/ui/shell/view-switch.tsx`, `topbar.tsx`, `shell.css` -- comments say two; no code change in the switch.
- `src/renderer/ui/shell/shell.tsx` -- third `<section className="view view-board" hidden={view !== 'board'}>`; props `board`, `boardFailure`; installs the chord.
- `src/renderer/ui/shell/shell.css` -- `.view-board` as a column that scrolls (`overflow-y: auto`), after `.view-party`; the 1000px block already makes `.view` a column.
- `src/renderer/ui/shell/board-chord.ts` -- NEW pure state machine `nextChord(state, key, at)` and `isFieldTarget(el)`; `use-board-chord.ts` NEW: one `keydown` listener on `document`.
- `src/renderer/ui/board/board-state.ts`, `use-board.ts` -- NEW, copies of `outputs/rail-state.ts` and `use-rail.ts` over `getBoard`/`onBoardChanged` (`acceptBoard` by `revision`).
- `src/renderer/ui/board/board-view.tsx` -- NEW: `no sprint status` + path; `boardPaths(folder).sprintStatus` is main-only, so build `${rail.folder}implementation-artifacts/sprint-status.yaml` from the rail's folder, and draw no path line while there is no rail snapshot.
- `src/renderer/ui/app.tsx` -- `useBoard()` beside `useRail()`; pass to `Shell`.
- `src/renderer/ui/follow/use-follow.ts` -- remember the last visible `scrollTop`; on shown, following goes to bottom, paused restores it and stays paused. Test: `follow-scroller.dom.test.tsx:208`.
- Pinned two-view tests: `src/renderer/ui/shell/shell.test.tsx:174,185,430`, `src/renderer/ui/app.test.tsx:332`, `tests/shell-contract.test.ts:293,306,353`. Change the number, not the intent.
- Docs: `_bmad/planning-artifacts/epics.md` FR11 and NFR20 (amend, dated 2026-10-10 by Story 6.3); `ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md` Keyboard reach (topbar row, the chord, "No shortcut layer" line); `src/renderer/ui/a11y/roving-tabindex.ts:20` comment.
- Read-only: `src/shared/board.ts`, `src/preload/*` (bridge exists from 6.2).

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/shell/board-chord.ts` + test -- chord rules per the matrix -- AC chord
- `src/renderer/ui/board/board-state.ts`, `use-board.ts` + tests -- connect, stale push loses, failure -- AC reload
- `src/renderer/ui/board/board-view.tsx` + test -- the `none` and failure text and path -- AC none
- `src/renderer/ui/shell/view.ts`, `shell.tsx`, `shell.css`, `use-board-chord.ts`, `app.tsx` + tests -- third view -- AC switch, one frame
- `src/renderer/ui/follow/use-follow.ts` + test -- paused offset survives a hide -- AC return
- pinned tests and planning docs -- three views, one chord; `DEFAULT_VIEW` still `conversation` -- AC negative surface

**Acceptance Criteria:**
- Given a project window, then the switch has `1:1 Conversation`, `Party Mode`, `Board` as native buttons with one `aria-pressed`, and no count, badge or dot.
- Given `Board` is pressed, then the other two sections are `hidden` and still mounted, and no `aria-live` or announcement is produced.
- Given a snapshot `none`, then the Board reads `no sprint status` with the watched path beneath and draws no region.
- Given `g` then `b` outside a field, then the Board shows; given any other key between, a gap over a second, a modifier, or a field target, then nothing happens.
- Given a window reload on the Board, then it re-reads `getBoard` and opens on 1:1.
- Given the 1:1 thread paused at an offset, when the user goes to the Board and back, then it is at that offset and still paused.

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 19 findings — high 0, medium 1, low 15, false 3, maybe-false 0. Findings raised by more than one layer share a row and name each layer; every claim any layer reported has a row.
- findings:
  - `[medium]` `[patch]` App's hand-off of `useBoard()` to `Shell` (`app.tsx` `board`/`boardFailure`) is tested nowhere, so dropping it stays green (verification-gap) — an `app.test.tsx` test over the fake bridge: `none` and a rejected `getBoard` both read `no sprint status` once the Board is pressed
  - `[low]` `[patch]` Chord ignores Caps Lock (`G`/`B` with shiftKey false) (blind, edge) — `nextChord` compares on `key.toLowerCase()`, tested
  - `[low]` `[patch]` `onScroll` reads a hidden scroller (`clientHeight` 0) as at-bottom, so a scroll event while hidden would resume following a paused thread (edge) — early return on `clientHeight === 0`, tested
  - `[low]` `[patch]` `board-chord.ts` header says the state is "the instant … or `null`" but the type is `{ armedAt }` (blind) — comment reworded
  - `[low]` `[reject]` Watched path is rebuilt in the renderer from `rail.folder` and could drift from main's (blind, edge: after `change…`) — main's board bridge and the rail share one output folder and both re-push on a move; carrying the path in `none` adds a field to the contract for a drift that needs two re-pushes to disagree
  - `[low]` `[reject]` No path line while there is no rail snapshot (blind) — the rail's first snapshot lands in the same tick as the Board's; the spec says draw no path line then
  - `[low]` `[reject]` Non-Latin layouts do not match `g`/`b` (blind, edge) — the fix is `event.code`, which the negative-surface key sweep bans on purpose
  - `[low]` `[reject]` IME composition, auto-repeat, `defaultPrevented`, mid-splitter-drag (blind, edge) — an IME key reads `Process` and arms nothing; a held `g` only re-arms; a drag does not reach `keydown` of `g`/`b` in a way that matters; each guard adds a branch for a case nobody meets
  - `[false]` `[reject]` Chord fires behind the document window or a modal (blind) — the document window is a separate window with no `Shell`, and the preflight surface renders no `Shell`
  - `[low]` `[reject]` Focus drops to `body` when the chord hides the section that held it (blind, edge x2, claim) — the same as pressing `Party Mode` today; the epic says a view change shifts no focus, so moving it would add a shift; `Tab` then starts at the topbar's switch
  - `[low]` `[reject]` A paused thread's saved offset is past the new maximum if its content shrank while hidden (edge) — the browser clamps it, the thread stays paused and `↓ latest` shows; rare and harmless
  - `[low]` `[reject]` Scroll rule is tested with a fake scroller only, no real layout (blind, intent) — the fake is the file's own pattern; the real-Chromium reset is covered by keeping the offset in a ref, not reading it back
  - `[low]` `[reject]` The scroll-rule reversal is recorded only in this spec (blind) — `EXPERIENCE.md` states no "shown means bottom" rule; the Design Notes here are the record
  - `[low]` `[reject]` "Return to Party as left" and the chord's field and modifier cases through `Shell` have no test (blind, verification-gap) — Party is mounted and hidden and untouched; the hook tests hold the chord rules
  - `[low]` `[reject]` Whole-file key-sweep exemption for `use-board-chord.ts` lets a second shortcut in (blind, verification-gap) — the composer's exemption is the same shape; the hook tests pin `g` then `b`
  - `[low]` `[reject]` `pause`'s `left` write is redundant with `onScroll`'s (verification-gap) — harmless, and `pause` sets `placed` so the scroll event may not reach `onScroll`
  - `[false]` `[reject]` `acceptBoard` drops snapshots after a revision reset (blind) — the counter is per window service and a reload reconnects with a fresh state, as the rail's
  - `[false]` `[reject]` `epic-6-context.md` carries unrelated edits, a wrong file extension, a rewritten FR11 date, and the spec has empty logs (blind) — the context is the workflow's own recompile; FR11's note was written ahead of the story and now carries the day it landed; the logs are this entry
  - `[low]` `[reject]` Intent audit: the diff stops at the empty state and shows no `sprint-status.yaml` change or commit (intent-alignment) — descriptive; the regions are 6.4 to 6.7 by the story's own boundary, and closing is done after this log

## Design Notes

Story 5.3 chose "a shown view is at its bottom" for every thread; this story's AC ("each as it was left, scrolled where it was") is later and explicit, so a paused thread now keeps its place. A following thread is unchanged. A browser may reset `scrollTop` on `display: none`, so the offset is kept in a ref, not read back from the element.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass
- `npm run build` -- expected: clean

## Auto Run Result

Status: done

**Summary.** The shell has a third view, `Board`, behind the existing switch. It is mounted and `hidden` like the others, fed by `useBoard()` over the 6.2 bridge methods, and draws `no sprint status` with the watched path when the snapshot is `none` or `getBoard` rejected; a read snapshot and the time before the first draw nothing (regions are 6.4 to 6.7). `g` then `b` within a second, outside a field and with no modifier, shows it. A paused thread now keeps its offset across a hidden view, which reverses Story 5.3's "a shown view is at its bottom" for paused threads only.

**Files changed.**
- `src/renderer/ui/shell/view.ts`, `view-switch.tsx`, `topbar.tsx`, `shell.css` -- third `VIEWS` entry, comments, `.view-board` and the empty-state styles.
- `src/renderer/ui/shell/shell.tsx`, `src/renderer/ui/app.tsx` -- the Board section, its props, the chord, `useBoard()` wiring.
- `src/renderer/ui/shell/board-chord.ts`, `use-board-chord.ts` -- the chord's pure rules and its one `keydown` listener.
- `src/renderer/ui/board/board-state.ts`, `use-board.ts`, `board-view.tsx` -- the hook and the empty state.
- `src/renderer/ui/follow/use-follow.ts` -- last visible offset kept in a ref; a paused thread returns to it; a hidden scroller ignores scroll events.
- Tests: six new files and changes to `shell.test.tsx`, `app.test.tsx`, `follow-scroller.dom.test.tsx`, `tests/shell-contract.test.ts`, `tests/negative-surface.test.ts` (the chord file is exempt from the key sweep, as the composer is).
- `_bmad/planning-artifacts/epics.md` (FR11, NFR20), `EXPERIENCE.md` (Keyboard reach), `roving-tabindex.ts` comment.
- `_bmad/implementation-artifacts/epic-6-context.md` -- recompiled at the start of this run (stale against `epics.md`); `sprint-status.yaml` -- 6.3 `done`.

**Review.** 19 findings: patches applied 4 (1 medium, 3 low), deferred 0, rejected 15, each with its reason in the triage log above.

**Follow-up review recommended:** `false` (patched: medium 1, low 3; no high, fewer than two mediums).

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` (226 unit files, 5412 tests; 3 watcher files, 64 tests) and `npm run build` all clean after the patches. Dropping `board`/`boardFailure` from `App`'s `Shell` call makes both new `app.test.tsx` tests fail; it was restored.

**Residual risks.** The app was not run in a real window: the ≤1000px column and the paused-offset restore are tested with the fake scroller and the existing `.view` rule only. A real Chromium that resets `scrollTop` on `display: none` is covered by the ref, not observed. Shift counts as a modifier for the chord; Caps Lock does not. Non-Latin layouts do not match `g`/`b`.
