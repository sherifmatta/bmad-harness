---
title: 'Nothing this epic promised not to do'
type: 'chore'
created: '2026-10-10'
baseline_revision: '7276ffd9fe8136d38d36e47a6ac6a9584325b1c5'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-6-context.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 6's prohibitions (no number on a column, no meter, no `ago`, no control, no write, no accent on a figure, no fourth view) are guarded only piecemeal, per region, so the first dashboard-shaped feature could slip a badge past all of them.

**Approach:** As Epics 1 to 4 closed, add the audit: one mounted-surface test over the real `BoardView`/`Shell` in every state a Board can be in, built from the real folds and not by hand; a write audit over the Board's life; the missing style, view-switch and contract pins; and amend `EXPERIENCE.md` and `DESIGN.md` so they say what was built. Story 6.8 is blocked (no run-to-story rule), so no card carries an owner and no card is a control.

## Boundaries & Constraints

**Always:** The audit's snapshot comes from `foldSprintStatus` (`src/main/fold/sprint-status.ts`) over text holding every status (`backlog`, `ready-for-dev`, `in-progress`, `review`, `done`, `optional`), one unrecognised status, an epic with no stories, a retrospective key, and a `done` epic. Persona states come from the real persona-state vocabulary (one persona per state) and a run in flight from a real `RunCardEntry`. A failing assertion is fixed in the product only if it is a prohibition the epic made; none is loosened. Two rulings stand because a design audit (2026-10-10, commit `2a328cd`) reversed the epic's first ones: an empty column says `no stories`, and an epic row may carry one decorative track (`.board-epic-track`, `aria-hidden`, spans only). The audit asserts exactly that and nothing wider: no `<progress>`, `<meter>`, `role="progressbar"`, `%` in any text, and the track is the only bar. The write audit reuses `registerBoardBridge` over a real temp project and counts every write made while a file changes and a run ends. Existing guards are inventoried first; a gap is filled, an existing guard is not duplicated.

**Never:** Feature work; a change to any Board region beyond what a failing prohibition requires; any owner, assignment or card control (6.8); a new event, channel or contract entry; loosening an existing test; amending `epics.md` or the spec's other planning documents; an accent on a figure or a column.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full snapshot | all statuses, an unrecognised one, a story-less epic, personas in each state, a run in flight | no digit in any column heading; no `progress`/`meter`/`progressbar`, no `%`, no currency sign, no `ago` in text; no `draggable`, `contenteditable`, `input`, `select`, `textarea`; none of `New story`, `Approve`, `Retry`, `Inbox`, `next`, `recommended`, `needs you` | N/A |
| Live region | the same Board, then a state change | no `aria-live`, `role=status/alert/log` inside the Board; the app's live region receives nothing from it | N/A |
| Board's life | file changes and a run ends | no write inside the project; `sprint-status.yaml` bytes and mtime unchanged | N/A |
| Styles | every `.board-*` rule | no literal colour or dimension; no `transition`/`animation`/`@keyframes` but the one `animation: none`; no `--accent` on a figure or a column | N/A |
| View switch | three views | no count, badge or dot; exactly three; the chord does nothing while a field has focus | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/party/epic-4-audit.dom.test.tsx` -- the model: a `CASES` list mounted for real, each prohibition read off the DOM, `LIVE`/`ANNOUNCING` selectors, `classWords()`.
- `src/renderer/ui/testing/audit-patterns.ts` -- shared `LIVE_REGIONS`, `SPINNER_MARKUP`, `STAND_IN`, `DENOMINATOR`, `withoutSplitters`; reuse, extend only if needed.
- `src/renderer/ui/board/board-view.tsx` -- the Board under audit (overview, columns, epics with the decorative track, Agents, Recent activity); `board-columns.ts`, `board-figures.ts`, `board-agents.ts`, `board-activity.ts` beside it.
- `src/renderer/ui/shell/negative-surface.test.tsx:157` -- the existing static-markup Board checks (kept); `shell-board.dom.test.tsx` -- view switch, card not a control, chord in the shell; `use-board-chord.dom.test.tsx` -- field-focus cases exist (confirm, do not duplicate).
- `src/main/fold/sprint-status.ts`, `fixtures/sprint-status/` -- the real fold and the committed fixture; the audit builds its text on them.
- `src/main/board-bridge.test.ts:330` -- the real-project case (file bytes and mtime); the write audit extends this pattern to count writes across a file change and a run ending (stored runs write under `userData`, never the project).
- `tests/tokens.test.ts:1567` -- the Board's style rules; add the accent guard (`--accent` absent from `.board-figure*`, `.board-column*`).
- `tests/channels-contract.test.ts`, `tests/contract.test.ts`, `tests/bridge-contract.test.ts`, `tests/layering.test.ts` -- `board:changed` and `board.get` are pinned in places; confirm name, cardinality and payload are pinned and add only what is missing; `layering.test.ts` must pass untouched.
- `src/renderer/ui/shell/view.ts`, `tests/shell-contract.test.ts:355` -- three views pinned.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md:737,756,766,770` -- overview reads three figures incl. `decisions open`, the Inbox is described as built-in-waiting, cards are described as buttons that open a thread, `no progress bar`; `:221,223,684-690` the Inbox rows and `g i`. `DESIGN.md:1119,1145` -- overview already two cells; nav-row text names the Inbox.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/board/board-audit.dom.test.tsx` (NEW) -- mount the real `BoardView` (and the `Shell` for the live region and view switch) in each case; read every prohibition in the matrix off the DOM -- the mounted half of the epic's audit
- `src/main/board-audit.test.ts` (NEW) -- run `registerBoardBridge` over a real temp project through a file change and a run ending; assert no write inside the project and `sprint-status.yaml` byte- and mtime-identical, with the temp project's whole file tree unchanged except for the one file the test itself rewrites -- the AD-1 proof
- `tests/tokens.test.ts` -- add: no `--accent` in `.board-figure*` or `.board-column*` rules -- the one missing style prohibition
- `tests/*.test.ts`, `src/renderer/ui/shell/*.test.*` -- only where the inventory finds a prohibition unpinned (a fourth view, the chord with a field focused in the shell, `board:changed` payload shape)
- `EXPERIENCE.md`, `DESIGN.md` -- the overview is two figures; the Inbox and `decisions open` are named as deferred wherever described (rows, `g i`, overview, boundaries); a card is not a control and has no owner (Story 6.8 not built); the epic row's decorative track and `no stories` as built -- the documents say what was built

**Acceptance Criteria:**
- Given the Board mounted with the full snapshot, then no column heading holds a digit, no `progress`/`meter`/`progressbar`/`%`/currency/`ago` is in the markup text, nothing is `draggable`/`contenteditable`/`input`/`select`/`textarea`, none of the banned words appears, and no Board element is a live region or an announcement
- Given the Board's life (a file changes, a run ends), then the harness writes nothing inside the project and `sprint-status.yaml` is byte-identical at the end
- Given the Board's styles, then no literal colour or dimension, no motion beyond `animation: none`, and no accent on a figure or a column
- Given the view switch, then exactly three views, no count, badge or dot, and the chord ignores a focused field
- Given the contract, then `board:changed` and `board.get` are pinned by name, cardinality and payload, and `layering.test.ts` passes
- Given the planning documents, then they name the Inbox and `decisions open` as deferred, the overview as two cells, and the cards as not controls

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 31 findings — high 0, medium 0, low 30, false 1, maybe-false 0
- findings:
  - `[low]` `[patch]` the write audit wraps only top-level `fs` functions, missing `fs.promises.*` and the second path of `rename`/`copyFile`/`cp` (blind; edge-case) — `counted()` now wraps `promises` and logs both paths, normalising URL/Buffer and skipping fd arguments
  - `[low]` `[reject]` the "run ends" half only exercises the transcript store, not the Board (blind) — the Board bridge has no run concept; a run ending reaches it as an artifact observation, which the test makes; the stored-run write under `userData` is the one write a run ends with
  - `[low]` `[reject]` the `setTimeout(30)` and an already-true `waitFor` weaken the run-ends step (blind; edge-case) — the tree and hash comparison is independent of the wait and a late write would still change it
  - `[low]` `[patch]` the second write-audit case depends on the first creating `project/src` (blind; edge-case) — it now creates the directory itself
  - `[low]` `[reject]` the bridge is never disposed (blind; edge-case) — a temp project removed in `afterAll`; no stray write was shown
  - `[low]` `[reject]` no case for an absent or unreadable file in the write audit (blind) — the mounted audit draws those states; the write audit's claim is for a live file
  - `[low]` `[patch]` the "announces nothing" assertion uses an Announcer the Board is not wired to (blind; verification-gap) — removed from the audit; `app.test.tsx` now pushes a Board revision and a persona-state change into the real `App` and asserts its one live region stays empty
  - `[low]` `[patch]` the accent guard and the motion test match a selector only from its start (blind; edge-case; verification-gap) — a `boardRulesAnywhere` helper matches the part anywhere in a selector
  - `[low]` `[reject]` the new motion test partly duplicates an existing guard and reads only `shell.css` (blind) — it adds `transform`, `will-change`, `@keyframes` and the empty-state rules the old test missed; the Board's styles live in `shell.css`
  - `[low]` `[reject]` the contract pins are regexes and do not assert `board.get`'s name (blind) — names and cardinality of both are pinned in `channels-contract`, `bridge-contract` and `contract`; the regex is the type's own text, as the other pins in that file
  - `[low]` `[reject]` the spec names `src/renderer/ui/board/board-audit.dom.test.tsx` and the file is in `tests/` (blind; edge-case; verification-gap; intent-alignment) — a renderer file may not import main's fold (layering); the deviation is recorded under Auto Run Result, and the fix would edit this build's spec
  - `[low]` `[reject]` the spec says "As Epics 1 to 4 closed" and has empty logs at review (blind) — wording; the logs fill at this pass
  - `[low]` `[reject]` the DOM audit's expectations tie to roster and vocabulary order and `next`/`token` words (blind) — fixed inputs the test builds; a failure there would be a real prohibition
  - `[low]` `[reject]` the chord test lacks `contenteditable` and leaves chord state armed (blind) — `use-board-chord.dom.test.tsx` covers contenteditable and resets state
  - `[low]` `[reject]` `EXPERIENCE.md` still lists `g i`/`g c`/`?`/`j k` (blind) — those rows are proposals marked as such; the Inbox chord is marked deferred
  - `[low]` `[reject]` story references in `DESIGN.md` go stale (blind) — they record why a part is not built and 6.8 amends them if built
  - `[low]` `[reject]` the Code Map lists doc lines that were not all amended (blind) — those lines were checked and the Inbox rows the audit names were amended
  - `[low]` `[reject]` `fd` writes are classed outside `userData` (edge-case) — numeric fds are skipped after the patch
  - `[low]` `[reject]` any unrelated in-process write makes the audit require `userData` (edge-case) — the assertion fails only on a write inside the project or outside `userData`; none other occurs in the window
  - `[low]` `[reject]` the empty-state and bar checks read leaf text and listed words only (edge-case) — they pin the two rulings and the epic's named words; a new empty-state wording would be a new design decision
  - `[low]` `[patch]` `handlersOf` has no positive control (verification-gap, other) — the case now expects at least one `__reactProps$` key in the mounted Board
  - `[low]` `[reject]` component props, not the app, are mounted (intent-alignment) — the snapshot is the real fold and states are the real vocabulary; `app.test.tsx` covers the wiring
  - `[low]` `[reject]` the live region is checked with a parallel Announcer (intent-alignment) — fixed above by the `App` case
  - `[low]` `[reject]` the write audit isolates the bridge with a fake `ipcMain` (intent-alignment) — the Board's only writer candidate is the bridge; the wrap is process-wide for `node:fs`
  - `[low]` `[reject]` the style guards read source text, not computed style (intent-alignment) — the cascade is the stylesheet and jsdom draws none
  - `[low]` `[reject]` the contract is pinned by regex over source text (intent-alignment) — as the other pins in `contract.test.ts`
  - `[low]` `[reject]` the full snapshot has no story with an owner (intent-alignment) — Story 6.8 is blocked; the audit asserts no owner, handler or tab stop and says so
  - `[low]` `[reject]` the fixture is an inline literal (intent-alignment) — the text is folded by the real `foldSprintStatus`; the committed fixture lacks an unrecognised status and a story-less epic
  - `[low]` `[reject]` the documents are amended beyond the three named items (intent-alignment) — the story's own aim is that they say what was built
  - `[low]` `[reject]` the tests exercise the renderer and main's tests but not the running app (intent-alignment) — the story names the mounted-surface pattern of 1.14 to 4.6, which is jsdom
  - `[false]` `[reject]` the diff changes no product code, so a prohibition could be left failing (intent-alignment) — every mounted and static check passes against the product as it is, and mutation runs by the implementer failed each

## Design Notes

The mounted audit must not weaken for the two reversals: it asserts the track is the one bar, `aria-hidden`, and that `no stories` is the only empty-column words. Anything else bar-shaped or empty-state-shaped fails. Story 6.8's owner-on-card is not built (`bmad-build-auto-result-6-8-the-persona-on-a-story.md`), so the audit also asserts no card has a handler, tab stop or owner disc; 6.8, if later built, amends that one assertion with the story.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass
- `npm run build` -- expected: clean

## Auto Run Result

Status: done

**Summary.** Epic 6's prohibitions are now tests. A mounted audit builds the Board from the real `foldSprintStatus` (every status, an unrecognised one, a story-less epic, a retrospective key, a done epic) with one persona per real state and runs of each status, and reads every prohibition off the DOM: no digit in a column heading, no meter, progress, `%`, currency or `ago`, no control, drag, editable or field, none of the banned words, no live region, and the one decorative epic track and `no stories` as the only bar and empty words (the two rulings of the 2026-10-10 design audit). A write audit runs the real board bridge over a real temp project with `node:fs` wrapped: no write inside the project and `sprint-status.yaml` byte- and mtime-identical. The Board's styles gain an accent guard and a motion guard; `board:changed` and `BoardSnapshot`/`BoardReply` are pinned; `EXPERIENCE.md` and `DESIGN.md` now say the overview is two figures, the Inbox and `decisions open` are deferred, and a card is not a control. No product code changed.

**Files changed.**
- `tests/board-audit.dom.test.tsx` (new) -- the mounted audit, the view switch and the chord with a field focused.
- `src/main/board-audit.test.ts` (new) -- the write audit.
- `tests/tokens.test.ts`, `tests/contract.test.ts`, `src/renderer/ui/app.test.tsx` -- style and contract pins; the real `App`'s live region stays empty on a Board revision and a persona-state change.
- `EXPERIENCE.md`, `DESIGN.md` -- amended to what was built.
- `sprint-status.yaml` -- 6.9 `done`.

**Deviations from the spec.** The mounted audit is `tests/board-audit.dom.test.tsx`, not under `src/renderer/ui/board/`: a renderer file cannot import main's fold (layer rule), and the audit needs it. It is linted but outside both `tsconfig`s, so `typecheck` does not cover it. Story 6.8 is blocked, so the full snapshot has no story with an owner; the audit asserts none carries an owner, handler or tab stop.

**Review.** 31 findings: patches applied 5 (all low), deferred 0, rejected 26, each with its reason in the triage log above.

**Follow-up review recommended:** `false` (patched: high 0, medium 0, low 5).

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` (5587 unit, 64 watcher) and `npm run build` all clean after the patches. The implementer broke the product on purpose in eight ways (a count on a heading, a tab stop on a card, an `aria-live`, other empty-state words, a `<progress>`, no field check in the chord, an in-project write, an accent on a figure) and each failed the audit before it was reverted.

**Residual risks.** The `app.test.tsx` live-region case waits 2.5 s of real time. The write audit's wrapper lists write-style `fs` function names, so a new write function would need adding. The patched widened style guards were not mutation-tested.
