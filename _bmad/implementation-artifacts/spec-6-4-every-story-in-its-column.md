---
title: 'Every story, in its column'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_revision: '91a1c578a7cba74642649e22a67ffc96eefca616'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-6-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Board view has a snapshot (6.2) and a place to draw it (6.3), but a `read` snapshot draws nothing, so the state of the sprint cannot be read at a glance.

**Approach:** Draw the story board region: one column per status, in the file's order of progress, each story a card showing its number and title, from the snapshot the view already receives. No other region, no owner, no figure, no control.

## Boundaries & Constraints

**Always:** Columns are `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`, each headed with the status as the file writes it (markup lowercase, `micro` uppercase `faint` by CSS), no count. A column is a list under its heading and a card a list item. A card is the story's number in mono and its title, nothing else. Cards stay in snapshot order (epics, then stories, as the file has them); no sort. A story whose status is not one of the five goes in one extra column per distinct status, after `done` in order of first appearance, headed as written; there is no such column when none needs it. A story of an epic whose status is `done` draws no card; a story of any other epic draws, a `done` story of an open epic in `done`. A column with no card draws its heading only. The Board scrolls as a whole (`.view-board` already does); no column has its own overflow. A new snapshot replaces the columns in one render: no animation, announcement, focus move or scroll change. Tokens only; no new motion, media query or token unless a dimension has none.

**Never:** A bar, pill, owner line, highlight, recommended marker, count, empty-state text or tooltip. A card that is a control, a tab stop, clickable or `aria-live`. A sort by anything. A card for a `BoardOther` row or a retrospective (neither is a story of an epic; 6.5 owns the retrospective). A write to the project. A change to `src/shared/`, `src/main/` or the bridge.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stories in all five | epics with stories in each status | five columns in order, cards under their status in file order | N/A |
| Status not one of the five | story `optional` or `blocked` | extra column after `done` headed as written; one per distinct status | nothing dropped, nothing thrown |
| Done epic | `epic-1: done`, its stories `done` | no cards for them; epic's stories absent everywhere | N/A |
| Open epic with a done story | `epic-6: in-progress`, `6-1: done` | card in `done` | N/A |
| No stories | `read` with no epics, or only `done` epics | five headings, no card, no text | N/A |
| Status change | next snapshot moves `6.4` to `review` | card in `review` in the same render | no focus or scroll change |
| `none` / rejected / none yet | as in 6.3 | unchanged (`no sprint status` + path; nothing) | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/board/board-view.tsx` -- `read` branch draws the columns (today draws nothing); the `none`/failure branch is untouched. Update the doc comment (regions are 6.5 to 6.7 now).
- `src/renderer/ui/board/board-columns.ts` -- NEW pure `columnsOf(body)` returning `{ status, stories }[]`: five fixed, then extra ones; skips `done` epics. Types from `src/shared/board.ts` (`BoardSnapshot`, `BoardStory`; read-only).
- `src/renderer/ui/shell/shell.css` -- `.board-stories` (row of columns on `--panel`, `--rule-width solid --line`, `--radius-card`, `--line-soft` between), `.board-column`, `.board-column-head`, `.board-cards` (list reset, `--space-sm-plus` gap), `.board-card`, `-number`, `-title`. Beside the `no sprint status` block at ~line 206; `.view-board` already scrolls. No `overflow` on a column.
- `src/renderer/ui/board/board-view.test.tsx` -- the "draws nothing for a snapshot that was read" case changes: a read snapshot now draws the five headings.
- `src/shared/board.ts`, `src/main/fold/sprint-status.ts` -- read-only: `others` holds retrospectives/stories with no epic row and carries no number or title.
- Reference: `src/renderer/ui/party/room-panel.css:19` (uppercase heading idiom), `tests/tokens.test.ts:1467` (`rule()` helper for CSS tests), `src/renderer/ui/app.test.tsx:195` (Board section tests).

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/board/board-columns.ts` -- pure column fold per Always -- one place for the rules, testable without React
- `src/renderer/ui/board/board-columns.test.ts` -- NEW: the I/O matrix rows (order, extra columns incl. two distinct unknowns and none when all known, done-epic skip, open-epic done story, empty, file order within a column, `others` ignored)
- `src/renderer/ui/board/board-view.tsx` -- render `<div class="board-stories">` of `<section class="board-column"><h3 class="board-column-head">status</h3><ul class="board-cards"><li class="board-card"><span number/><span title/></li></ul></section>`; no handler, no tabindex, no aria-live; key cards by story key
- `src/renderer/ui/shell/shell.css` -- styles per Code Map, tokens only, no transition/animation, no per-column overflow
- `src/renderer/ui/board/board-view.test.tsx` -- markup: five headings in order, no count, lowercase text, card shows number then title only, empty column has no `<li>`, no `<button|tabindex|onclick|aria-|<input>`, extra column after `done`, `none` cases unchanged
- `src/renderer/ui/app.test.tsx` -- a pushed snapshot moves a card to its new column; scroll container and focused element unchanged (jsdom)
- `tests/tokens.test.ts` (or the nearest CSS contract test) -- `.board-column*` rules carry no `overflow`, `transition`, `animation` or literal colour/dimension

**Acceptance Criteria:**
- Given a read snapshot with stories, when the Board is shown, then there is one column per status in the order above, headed as the file writes it with no count, each a list of cards, each card its mono number and title only
- Given a status outside the five, when drawn, then its card sits in an extra column after `done` headed as written, and no column is added when none is needed
- Given a `done` epic, when drawn, then its stories draw no cards; given any other epic, all its stories draw
- Given a column with no cards, when drawn, then only its heading shows
- Given the next snapshot changes a status, when it arrives, then the card is in its new column in the same render, with no focus, scroll or announcement change
- Given a card, when inspected, then it is not a control, has no tab stop, and carries no bar, pill, owner line or highlight

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 22, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` `columnsOf` doc comment says nothing is dropped, but done-epic stories and `others` are — comment reworded to say they are left out by design (blind)
  - `[false]` `[reject]` faint column heading may fail contrast (blind) — `faint` micro uppercase is the spec's own heading style (DESIGN.md Board anatomy); the cards below are at `text`
  - `[low]` `[reject]` no minimum column width, narrow windows squeeze columns (blind) — the AC forbids per-column scroll and a new breakpoint; no named harm at 5 to 6 columns
  - `[low]` `[reject]` the CSS contract test is hand-parsed, bans `cursor` and scans all of `shell.css` for literals (blind) — stricter than the spec, not wrong; a literal anywhere in the file is a defect already
  - `[low]` `[patch]` the status-change test's scroll and focus asserts cannot fail in jsdom (blind, edge-case, verification-gap) — added same-node assertions for `.board-stories` and a column heading, so a remount fails the test
  - `[low]` `[reject]` the five statuses are listed in four places (blind) — shared types are frozen by the spec; the tests restate the spec's list on purpose
  - `[low]` `[reject]` empty, mixed-case or variant statuses make odd extra columns (blind) — the AC says a status as written gets its own column; nothing is dropped
  - `[low]` `[reject]` `h3` skips heading levels and empty `ul`s read as lists (blind) — the AC calls for a list under its heading; the shell has no `h1`/`h2` and the rail already uses `h3`
  - `[low]` `[reject]` `--rail-group-padding` borrowed for the Board margin (blind) — same token 6.3's empty state uses; no spacing token fits better
  - `[low]` `[reject]` slice by `>review<`/`>done<` in a test is fragile (blind) — both markers are asserted present by the headings test in the same file
  - `[low]` `[reject]` narrow columns shrink toward zero width (edge-case) — as above
  - `[low]` `[reject]` duplicate story keys give duplicate React keys (edge-case, verification-gap) — a duplicated YAML key is an invalid file; React only warns
  - `[low]` `[reject]` empty or blank status makes a column with an empty heading (edge-case) — shown as written; the fold never yields an empty status for a story from a normal file
  - `[false]` `[reject]` an empty title makes a blank card (edge-case) — the fold falls back to the key's slug, which the key pattern requires to be non-empty
  - `[low]` `[reject]` `Done` in another case is not treated as done (edge-case) — status words are compared as written, as the AC says
  - `[low]` `[reject]` an empty `<ul>` is exposed to assistive tech (edge-case) — the AC makes a column a list under its heading
  - `[low]` `[patch]` the app test's scroll and focus asserts are vacuous (edge-case) — covered by the same-node patch above
  - `[low]` `[reject]` the `indexOf` slice could pass on a bad index (edge-case) — as above
  - `[false]` `[reject]` a read snapshot beats a failure, so columns draw over `no sprint status` (edge-case) — the hook clears a failure when a snapshot arrives and the order is unchanged from 6.3
  - `[low]` `[reject]` the empty `<ul>` contradicts "heading only" (edge-case) — an empty list draws nothing; the same finding as the empty-`ul` row
  - `[low]` `[patch]` no test can see a click handler on a card (verification-gap) — a DOM test now reads each card element's React props for any `on*` handler, and checks that a click and a key change nothing
  - `[low]` `[reject]` the `scrollTop` assertion is vacuous (verification-gap) — covered by the same-node patch
  - `[low]` `[reject]` duplicate keys (verification-gap) — as above
  - `[low]` `[reject]` intent audit: no commit and no closing edit visible in the diff, spec `in-review` (intent-alignment) — descriptive; the closing (sprint status `done`, commit) is done after this log, as "commit and close" asks

## Design Notes

Two readings the AC leaves open, settled so the code has no choice to make: (1) "one more column after `done`" cannot carry two different headings, so there is one extra column per distinct unrecognised status, in order of first appearance; (2) `BoardOther` rows (a retrospective or story with no epic row) carry no number or title, so they draw no card; this closes the open item from the 6.2 review. Unknown means "not one of the five", so a story marked `optional` (known to the fold, not a story status) gets its own column. Cards read in snapshot order, which is epics then stories; a file that interleaves two epics' stories is grouped by epic.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass
- `npm run build` -- expected: clean

## Auto Run Result

Status: done

**Summary.** The Board's `read` snapshot now draws the story board: one column per status (`backlog`, `ready-for-dev`, `in-progress`, `review`, `done`) headed as the file writes it, each a list of cards showing the story's number and title. A status outside the five gets one extra column after `done`, per distinct status. Stories of a `done` epic draw no card; `others` rows draw none. Cards are plain list items: no handler, tab stop, owner line or highlight. The Board scrolls as a whole.

**Files changed.**
- `src/renderer/ui/board/board-columns.ts` (new) -- the pure column fold.
- `src/renderer/ui/board/board-view.tsx` -- the `read` branch draws the columns; `none` and failure unchanged.
- `src/renderer/ui/shell/shell.css` -- `.board-stories`, `.board-column`, `.board-column-head`, `.board-cards`, `.board-card`; tokens only.
- Tests: `board-columns.test.ts` (new), `board-view.test.tsx`, `app.test.tsx`, `shell-board.dom.test.tsx`, `tests/tokens.test.ts`, `tests/negative-surface.test.ts` (classifies `.board-column-head` as a label).
- `_bmad/implementation-artifacts/epic-6-context.md` -- recompiled (stale against `epics.md`); `sprint-status.yaml` -- 6.4 `done`.

**Review.** 25 findings: patches applied 4 (all low; three distinct fixes), deferred 0, rejected 21, each with its reason in the triage log above.

**Follow-up review recommended:** `false` (patched: high 0, medium 0, low 4).

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` (227 unit files, 5429 tests; 3 watcher files, 64 tests) and `npm run build` all clean after the patches.

**Residual risks.** The app was not run in a real window: column widths (`flex: 1 1 0`, no minimum) and the stacked number-over-title card are checked by contract tests only, so many extra columns at a narrow width are unobserved. A story with a duplicated key in the file would give a React key warning. Orphan stories (`others`) appear nowhere on the Board by design.
