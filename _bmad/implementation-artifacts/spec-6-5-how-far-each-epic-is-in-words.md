---
title: 'How far each epic is, in words'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_revision: '02a1ca834b5e4fad3a6a5a26d72cae2c5c07136f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-6-context.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Board draws every story in its column but cannot say how big the sprint is or how far each epic has got without counting cards by eye.

**Approach:** Add two regions above and below the story columns, from data already in the window: an overview of two plain figures (*agents running*, *stories in progress*) and an Epics panel with one text row per epic reading `n of m stories done`. No bar, percentage, colour, click or new event.

## Boundaries & Constraints

**Always:** Overview is two equal cells above the story columns. Cell 1: label `agents running`, figure = roster personas whose state (`stateOf`, the tiles' source) is `work`, line `of <n> installed` (n = roster size, `snapshot.agents.length`). Cell 2: label `stories in progress`, figure = stories whose status is `in-progress`, line `of <m> stories`; both over the stories the columns draw (those of epics not `done`). Epics panel sits below the story columns: a head `epics`, then one row per epic in the file's order: `Epic <number>` in mono, the title, and at the right `n of m stories done` in mono; `n` = the epic's stories whose status is `done`, `m` = all its stories (a `done` epic keeps its row and counts over all its stories); the retrospective counts in neither. No stories reads `no stories`; an empty title reads the id alone. Figures and rows draw only for a `read` snapshot; `none` and failure are unchanged. A new snapshot or persona state replaces the text in the same render: no animation, announcement, focus or scroll change. Regions are panels on tokens only (`panel`, 1px `line`, `card` radius; head on `panel-2`); figures `h1` 600 tabular `text-strong`; rows separated by 1px `line-soft`.

**Never:** A bar, meter, percentage, tick, pill, badge, accent, fill or border on a figure or row; any colour difference for a finished epic; a third cell or reserved slot for *decisions open*; a spend, budget, cost, token or tool-call figure; a click, tab stop, `aria-live` or tooltip on a figure or row; a sort; a new event, channel, bridge method or change to `src/shared/`, `src/main/`; a write to the project.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mixed progress | epic 6, 9 stories, 4 `done` | row `Epic 6`, title, `4 of 9 stories done` | N/A |
| Done epic | `epic-1: done`, 14 `done` stories | row kept, `14 of 14 stories done`, its stories excluded from cell 2's `of <m>` | N/A |
| No stories | epic with no story keys | `no stories` at the right | N/A |
| No title | `title: ''` | `Epic 7` alone | N/A |
| Retrospective | `optional`/`done` retro key | counts in neither n nor m | N/A |
| Persona working | 2 of 5 roster personas in `work`; `live` or `note` or an id outside the roster | `2` `of 5 installed`; others never counted | N/A |
| State change | persona goes `idle` → `work` | cell 1 figure updates in that render | no announcement |
| Unknown story status | story `blocked` | counts in `of <m>`, not in progress | nothing thrown |
| `none` / failure / none yet | as in 6.3 | unchanged | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/board/board-view.tsx` -- `read` branch returns overview, story columns, epics; takes new props `states: ReadonlyMap<string, PersonaState>` and `installed: readonly AgentView[]`; refresh doc comment (6.6 and 6.7 are what remain).
- `src/renderer/ui/board/board-figures.ts` -- NEW pure `overviewOf(snapshot, installed, states)` → `{ running, installedCount, inProgress, shown }` and `epicRowsOf(snapshot)` → `{ key, id, title, done, total }[]`. Uses `stateOf` from `src/renderer/ui/status/persona-state.ts`, `BoardSnapshot` from `src/shared/board.ts` (read-only), and the shown-story rule `columnsOf` already encodes (non-`done` epics' stories); share it, don't restate it.
- `src/renderer/ui/shell/shell.tsx:316` -- passes `states={states}` and `installed={snapshot.agents}` to `BoardView`.
- `src/renderer/ui/shell/shell.css` -- beside the 6.4 block (~line 228): `.board-overview`, `.board-figure`, `-label`, `-value`, `-line`; `.board-epics`, `-head`, `.board-epic`, `-id`, `-title`, `-progress`. `.view-board` gains `gap: var(--space-md)`. Tokens in `src/renderer/design/tokens.css` (`--fs-h1`, `--weight-strong`, `--panel-2`, `--line-soft`, `--text-strong`); tabular via `font-variant-numeric` as `run-card.css:82`.
- Tests: `board-figures.test.ts` (NEW), `board-view.test.tsx` (new props; markup), `src/renderer/ui/app.test.tsx` (persona state change moves cell 1, same nodes), `tests/tokens.test.ts:1555` (extend the `.board-*` rule selector to the new classes: no overflow/transition/animation/literal), `tests/negative-surface.test.ts:675` (classify any new `--faint` rule, e.g. `.board-epics-head`, as a label; the figures, labels and `n of m` text sit at `--dim` or above), `src/renderer/ui/shell/negative-surface.test.tsx` (Board markup has no bar/meter/percent/cost words).
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md:1145` -- "three equal cells" → "two"; "All three are alike" → "Both are alike".
- Read-only: `src/renderer/ui/board/board-columns.ts` (the shown-story rule), `src/renderer/ui/team/tile-groups.ts` (roster grouping; not used for counts).

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/board/board-figures.ts` -- pure folds per Always -- one place for the counting rules, testable without React
- `src/renderer/ui/board/board-figures.test.ts` -- NEW: every I/O row (work only, orphan and non-roster ids ignored, retro ignored, done epic kept in rows and out of cell 2, no stories, empty title, unknown status, file order)
- `src/renderer/ui/board/board-view.tsx` -- render `<div class="board-overview">` (two `.board-figure`), the existing `.board-stories`, `<section class="board-epics">` with `<h3>` and `<ul>` of `<li class="board-epic">`; no handler, tabindex, `aria-live`, bar, meter
- `src/renderer/ui/shell/shell.tsx` -- pass `states` and `snapshot.agents` through
- `src/renderer/ui/shell/shell.css` -- styles per Code Map, tokens only, no motion, no per-region overflow
- `src/renderer/ui/board/board-view.test.tsx`, `src/renderer/ui/app.test.tsx`, `tests/tokens.test.ts`, `tests/negative-surface.test.ts` -- per Code Map
- `DESIGN.md` -- the two amendments above

**Acceptance Criteria:**
- Given a read snapshot, when the Board is shown, then the overview is two equal cells and carries `agents running` / `of <n> installed` and `stories in progress` / `of <m> stories`, with no third cell
- Given a persona's state changes, when the window renders, then the first figure is that count of `work` personas in the same render, with no announcement
- Given the epics, when drawn, then each has one row in file order reading `Epic N`, title and `n of m stories done` (or `no stories`; id alone with no title); retrospectives count in neither
- Given any figure or row, when inspected, then it is not a control, has no bar, meter, percentage, tick, colour, accent, border or badge, and a finished epic differs from an unfinished one only in its numbers
- Given the Board, when searched, then no spend, budget, cost, token or tool-call figure and no *decisions open* cell appears
- Given `none`, a failure, or no snapshot, when drawn, then nothing changes from 6.3

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 23 findings — high 0, medium 0, low 21, false 2, maybe-false 0
- findings:
  - `[low]` `[patch]` a figure takes a border: `.board-figure + .board-figure` draws a `line-soft` divider, against "no accent, border, fill or badge" (blind, edge-case) — rule removed; the cells are told apart by padding, and DESIGN.md's Overview row says so
  - `[low]` `[patch]` DESIGN.md still says labels and the Epics row's id and count are `faint` while the code uses `--dim` (blind, edge-case) — the Overview and Epics rows now say `dim`, with the reason
  - `[low]` `[patch]` panel margins and the new `.view-board` `gap` both apply, so the space between regions is uneven (blind, edge-case) — the `gap` is removed; margins alone give a consistent 11px
  - `[low]` `[reject]` the 10px gap of DESIGN.md's Overview is dropped (blind, edge-case) — same fix as the divider row: DESIGN.md now says one panel, no divider
  - `[low]` `[reject]` `of 1 stories` and `0 of 1 stories done` are ungrammatical (blind, edge-case) — the AC fixes the wording `n of m stories done`; no plural rule is asked for
  - `[low]` `[reject]` cell 2's denominator differs from a done epic's row, with no on-screen explanation (blind) — both are what the AC states, and the Design Notes record why
  - `[low]` `[reject]` `indexOf` slices in tests pass vacuously if a marker is missing (blind) — the first test in each block asserts the markers are present
  - `[low]` `[reject]` the `BOARD` allowlist entry is brittle (blind) — the mandated label contains the banned phrase, and the entry is pinned by an exact assertion
  - `[false]` `[reject]` the overview and epics panels can shrink in the flex column (blind) — flex items with visible overflow do not shrink below their content, and the Board scrolls as a whole
  - `[low]` `[reject]` a whitespace-only title draws an empty span (blind, edge-case) — titles come from trimmed `epics.md` headings or the key's slug; the AC says an empty title
  - `[low]` `[reject]` label, value and line are three `<p>`s with no association (blind) — the AC forbids `aria-`/`role` additions and the order reads correctly
  - `[low]` `[reject]` `columnsOf` runs twice per render (blind) — trivial cost, no named harm
  - `[low]` `[reject]` the spec's line numbers go stale and `oversized` is unexplained (blind) — descriptive; the spec is not edited by review
  - `[low]` `[reject]` persona-state coverage is thin (blind) — `work` and back is the AC; the unit tests cover every state's exclusion
  - `[low]` `[reject]` `of 0 stories` and an empty `epics` panel on an empty file (edge-case) — the AC names no empty-state text and forbids one
  - `[low]` `[reject]` duplicate roster ids count a persona twice (edge-case) — the install model keys agents by id
  - `[false]` `[reject]` the epics head's `faint` hides a fact (edge-case, verification-gap) — classified a label; each row names its epic and count at `--dim`
  - `[low]` `[reject]` the Epics row in DESIGN.md contradicts the shipped CSS (edge-case) — the same finding as the DESIGN.md row above
  - `[low]` `[reject]` the figures panel is one panel with cells, not separate panels with a gap (edge-case) — same finding as the divider row
  - `[low]` `[reject]` the tests check the spec's reading and not the story's text (intent-alignment) — descriptive; the spec's AC restate the story's
  - `[low]` `[reject]` no commit, `sprint-status.yaml` still `backlog` and spec `in-review` in the diff (intent-alignment) — the closing is done after this log, as "commit and close" asks
  - `[low]` `[reject]` the diff edits DESIGN.md and loosens two shared test guards (intent-alignment) — both are in the spec's Code Map and the story's Boundaries
  - `[low]` `[reject]` real reader, main process and live window are not exercised (intent-alignment) — the story changes only the renderer; no change to `src/main/`

## Design Notes

Two readings the AC leaves open, settled so the code has no choice: (1) both figures in cell 2 count over the stories the columns draw (non-`done` epics), so *n* never exceeds *m* and the cell agrees with the columns beneath; an epic's own row counts over all its stories, as the AC states; (2) *installed* is the roster the tiles list, so a persona outside it (an orphan session) is never counted as running. Labels and the `n of m` text sit at `--dim`, not `--faint` as the prototype draws them: they are the only carrier of the fact, which the text-ramp rule forbids in the faint tier.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass
- `npm run build` -- expected: clean

## Auto Run Result

Status: done

**Summary.** A read Board now draws two plain figures above the story columns (*agents running* `of <n> installed`, *stories in progress* `of <m> stories`) and an Epics panel below them with one text row per epic: `Epic N`, its title and `n of m stories done` (or `no stories`). Figures and rows are text only: no bar, percentage, colour, click or new event. `DESIGN.md`'s Overview is amended from three cells to two.

**Files changed.**
- `src/renderer/ui/board/board-figures.ts` (new) -- pure `overviewOf` and `epicRowsOf`.
- `src/renderer/ui/board/board-view.tsx` -- the `read` branch draws overview, columns and epics; new props `states` and `installed`.
- `src/renderer/ui/shell/shell.tsx` -- passes `states` and `snapshot.agents` to the Board.
- `src/renderer/ui/shell/shell.css` -- `.board-overview`, `.board-figure*`, `.board-epics*`, `.board-epic*`; tokens only.
- Tests: `board-figures.test.ts` (new), `board-view.test.tsx`, `app.test.tsx`, `shell-board.dom.test.tsx`, `shell/negative-surface.test.tsx`, `tests/tokens.test.ts`, `tests/negative-surface.test.ts` (classifies `.board-epics-head` as a label; lets the mandated label `stories in progress` past the spinner stand-in sweep).
- `_bmad/planning-artifacts/ux-designs/.../DESIGN.md` -- Overview two cells in one panel, labels and Epics text at `dim`.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 6.5 `done`.

**Review.** 23 findings: patches applied 3 (all low), deferred 0, rejected 20, each with its reason in the triage log above.

**Follow-up review recommended:** `false` (patched: high 0, medium 0, low 3).

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` (228 unit files, 5452 tests; 3 watcher files, 64 tests) and `npm run build` all clean after the patches.

**Residual risks.** The app was not run in a real window, so the spacing between the three regions and the overview's look at a narrow width are checked by contract tests only. `DESIGN.md` is a planning file, so `epic-6-context.md` is now older than it and the next story's run will recompile it.
