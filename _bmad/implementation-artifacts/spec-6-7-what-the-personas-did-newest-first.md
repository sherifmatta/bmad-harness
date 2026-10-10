---
title: 'What the personas did, newest first'
type: 'feature'
created: '2026-10-10'
baseline_revision: '42b51e41daa4976e55811c396273e21cf68e2a25'
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

**Problem:** Someone who stepped away has to open each persona's thread to learn what happened; the Board has no feed of what the personas did.

**Approach:** Add a Recent activity panel below the Agents panel: each persona run gives a start row and, once ended, an end row (`finished`, `stopped` or `failed`), newest first by the event's own time, newest 20, with an absolute `MM-DD HH:MM` time. Rows are text. They are folded in the renderer from the window's run entries, which hold the live runs and the stored ones restored on launch, so no event, channel or projection is added.

## Boundaries & Constraints

**Always:** A run entry with an `agentId` is a persona's run; one without raises no row (a party session is not a persona's run). Start row: at `entry.at`, dim text `started <code>`, dot `work`. End row (status not `running`): at `entry.endedAt`, dim `finished|stopped|failed <code>`, dot `idle` for finished and `error` for stopped and failed. A run entry with no `code` reads the verb alone; a terminal entry with no `endedAt` raises no end row (its time is unknown and none is invented). Persona name is the roster's `AgentView.name` by id, else the `agentId` as written. Order is by event time descending, ties newest-run-first, an end row above its own start row on a tie; the first 20 are drawn and nothing says more exist. Time is one renderer function beside `formatTurnTime`, `MM-DD HH:MM` 24-hour in the machine's zone (`timeZone` an argument for tests), in mono `faint`, right-aligned. Only the start row of a run still `running` pulses; every other dot is drawn still (the `work` dot of an ended run's start row is amber without the pulse). Panel: `panel`, 1px `line`, `card` radius, head `recent activity` on `panel-2` (as `.board-agents`); rows split by `line-soft`; tokens only. A new row is the same render that changed the entries.

**Never:** A count, badge, cost, relative time (`4m ago`), per-row colour of its own, *load more*, filter or search, or a line saying more exist; a *question asked*, approval or split row; a control, handler, tab stop, `tabindex`, `aria-live`, `role` or tooltip on a row; an animation, scroll or focus move on a new row; a new event, channel, bridge method, projection or change to `src/shared/` or `src/main/`; a write to the project; a literal in CSS beyond `animation: none`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| In flight | one `running` run, code `CP`, at T | one row `started CP`, dot `work`, pulsing | N/A |
| Finished | run T1..T2 `finished` | two rows, newest first: `finished CP` (idle dot, T2), `started CP` (work dot, still, T1) | N/A |
| Stopped / failed | status `stopped` / `failed` | end row `stopped CP` / `failed CP`, dot `error` | N/A |
| Relaunch | stored `running` card read back `failed` at `lastAt` | rows as its card: `failed CP` at `lastAt`, same as before | N/A |
| Over 20 | 15 terminal runs (30 rows) | newest 20 rows, nothing more | N/A |
| Party / no agent | run entry with no `agentId` | no row | N/A |
| No code | entry without `code` | `started` / `finished` alone | N/A |
| No endedAt | terminal entry, no `endedAt` | start row only | N/A |
| Unknown persona | `agentId` not in roster | name is the id | N/A |
| No runs | no run entries | panel head over an empty list, no empty-state text | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/format-turn-time.ts` -- model; add `formatEventTime(at, timeZone?)` here (`MM-DD HH:MM`, `''` on a bad instant).
- `src/renderer/ui/board/board-activity.ts` -- NEW pure `activityRowsOf(installed, entries)` → `{ key, name, did, at, state, pulse }[]`, newest 20.
- `src/renderer/ui/board/board-activity-panel.tsx` -- NEW `ActivityPanel({ rows })`: `<section class="board-activity">`, head, `<ul>` of `<li class="board-activity-row">`. Model on `board-agents-panel.tsx`; dot via `StatusDot` (the pulse is the `work` dot's), still variant by class.
- `src/renderer/ui/board/board-view.tsx` -- draw `ActivityPanel` after `AgentsPanel` in the `read` branch; refresh the doc comment (6.7 now built).
- `src/renderer/ui/shell/shell.css` -- after the Agents block: `.board-activity`, `-head`, `-rows`, `-row`, `-who`, `-did`, `-time`, `-still`; tokens only.
- `src/renderer/ui/chat/transcript-entry.ts:68` -- `RunCardEntry` (`at`, `endedAt`, `status`, `code`, `agentId`): read only.
- Tests: `format-turn-time.test.ts` (extend), `board-activity.test.ts` (NEW), `board-activity-panel.dom.test.tsx` (NEW), `board-view.test.tsx`, `src/renderer/ui/app.test.tsx` (a run ending adds the top row), `tests/tokens.test.ts:1571` (add `activity` to the selector regex), `tests/negative-surface.test.ts:679` (classify `.board-activity-head` as a label), `src/renderer/ui/shell/negative-surface.test.tsx`.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md:1150` -- Recent activity: record `dim` text, mono `faint` time, the still `work` dot.

## Tasks & Acceptance

**Execution:**
- `format-turn-time.ts` + test -- `formatEventTime` -- the one place the activity time is written
- `board-activity.ts` + test -- pure row fold per the matrix -- ordering, cap and exclusion rules testable without React
- `board-activity-panel.tsx` + DOM test -- panel and rows; no handler, tabindex, role or aria-live -- not a control
- `board-view.tsx`, `shell.css` -- wire and style -- tokens only
- Tests and `DESIGN.md` per Code Map

**Acceptance Criteria:**
- Given the window's runs, when the Board is read, then each persona run gives a start row and an ended run an end row with its persona's name, `<verb> <code>` and an absolute `MM-DD HH:MM` time, newest first by event time
- Given a run still running, then only its start row pulses; given any ended run, then no row pulses and no row carries a count, badge or colour of its own
- Given a relaunch, then rows built from stored runs are the same rows, a cut-off run reading `failed` at its last-heard time
- Given more than 20 rows, then the newest 20 show and nothing says more exist
- Given a run entry with no persona, then it raises no row
- Given a run ending, then its end row is at the top in the render that changed the entries, with no announcement

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 22, false 2, maybe-false 0
- findings:
  - `[low]` `[reject]` the epic context says 6.7 is built in main and the spec builds it in the renderer (blind) — the spec's Design Notes record the deviation; the context line is amended in this commit
  - `[low]` `[reject]` the regenerated `epic-6-context.md` drops spike results and open items (blind) — true of the recompiled file, so it is reverted to the prior file with one line amended; no recompiled text is committed
  - `[low]` `[reject]` the spec says the time is `faint` and the build is `dim` (blind) — the time is the only carrier of when, as 6.5 and 6.6 ruled; `DESIGN.md` records `dim`; the fix is an edit to this spec
  - `[low]` `[patch]` the sort guard skips every comparator in `board-activity.ts` (blind) — the guard now asserts the comparator starts `(a, b) => b.row.at - a.row.at ||`
  - `[low]` `[reject]` four stylesheet guards strip every `animation: none;` (blind) — `none` is no motion; the motion inventory pins the one selector
  - `[low]` `[reject]` the feed is recomputed on every render over unbounded history, and a formatter is built per row (blind) — cheap folds over a short list; no named harm; 6.6 rejected the same
  - `[low]` `[reject]` a finished run's start row keeps an amber still dot (blind) — the story's AC names the `work` dot for a start and a still dot for any run not in flight
  - `[low]` `[reject]` duplicate keys if a live run and a restored copy are both in `entries` (blind, edge-case) — the window keeps one entry per `runId`; no path to a duplicate was shown
  - `[false]` `[reject]` the relaunch AC is untested through the real restore path (blind) — main's `deadOf` has its own tests in `stored-runs.test.ts`; the renderer fold reads the card it yields, which the test builds
  - `[low]` `[reject]` the time has no year, seconds or `<time>` element (blind) — the story fixes `MM-DD HH:MM`
  - `[low]` `[reject]` the spec pins line numbers and import order is off (blind) — cosmetic
  - `[low]` `[reject]` NaN `at` or `endedAt` sorts inconsistently (edge-case) — times are main's epoch milliseconds; none shown reachable
  - `[low]` `[reject]` `endedAt` earlier than `at` puts an end row under its start (edge-case) — a card's end is never before its start; stored `lastAt` follows it
  - `[low]` `[reject]` an unknown status prints as the verb (edge-case) — `RunStatus` is a closed union
  - `[low]` `[reject]` the whole feed re-renders with the hidden Board (edge-case) — same as the cost finding
  - `[low]` `[reject]` the activity slice in the shell test becomes `slice(-1, …)` without its marker (edge-case) — the panel's own tests assert the marker; same rejected in 6.5 and 6.6
  - `[false]` `[reject]` the diff does not close the story: spec `in-review`, no sprint status change (intent-alignment) — closing is done after this log, as the intent asks
  - `[low]` `[reject]` the tests exercise the renderer and not main (intent-alignment) — the story changes only the renderer; no `src/main/` change
  - `[low]` `[reject]` the guard loosening touches the epic's prohibition tests (intent-alignment) — each is narrowed to one selector or one file; 6.9 audits them
  - `[low]` `[reject]` the context rewrite is unrelated to 6.7 (intent-alignment) — same as the context finding
  - `[low]` `[reject]` the relaunch and 20-row caps are tested on synthetic entries (intent-alignment) — the fold is pure over entries; main's restore is tested apart
  - `[low]` `[reject]` the "party sessions raise no row" rule is tested as a missing `agentId` (intent-alignment) — that is the rule the spec states
  - `[low]` `[reject]` no end-to-end test of the live region staying silent (verification-gap, other) — the panel has no `aria-live`, and the app test asserts none inside the section

## Design Notes

The story's default builds the list in main and carries it on `board:changed`. This spec keeps it in the renderer instead: the window's `conversation.entries` already hold every persona's runs, live and restored (main applies `deadOf` before the transcript loads), so the rows are identical live and after a relaunch with no new contract, tally or projection, as Story 6.6 did for the Agents panel. Story 6.1 found no cap on stored runs, so the fold takes the newest 20 rows from all of them and never assumes a cap. The time uses `formatEventTime`, not `formatTurnTime`, because the feed spans days.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass
- `npm run build` -- expected: clean

## Auto Run Result

Status: done

**Summary.** The Board's Recent activity panel, below the Agents panel, lists what the personas did, newest first, from the window's run entries: each persona run gives a start row and, once ended, a `finished`, `stopped` or `failed` row, with the persona's name, `<verb> <code>` and an absolute `MM-DD HH:MM` time. The newest 20 show and nothing says more exist. Only the start row of a run still running pulses; every other dot is drawn still. Rows are text: no control, count or relative time. A run with no persona raises no row. A relaunch reads the same rows, a cut-off run reading `failed` at its last-heard time.

**Files changed.**
- `src/renderer/ui/chat/format-turn-time.ts` -- `formatEventTime`, the one place the activity time is written.
- `src/renderer/ui/board/board-activity.ts` (new) -- pure `activityRowsOf`.
- `src/renderer/ui/board/board-activity-panel.tsx` (new) -- `ActivityPanel`.
- `src/renderer/ui/board/board-view.tsx`, `src/renderer/ui/shell/shell.css` -- wire and style; tokens only, one `animation: none`.
- Tests: `board-activity.test.ts`, `board-activity-panel.dom.test.tsx` (new), `format-turn-time.test.ts`, `board-view.test.tsx`, `app.test.tsx`, `shell/negative-surface.test.tsx`, `tests/tokens.test.ts`, `tests/negative-surface.test.ts`, `tests/shell-contract.test.ts`, `tests/layout-contract.test.tsx`. The last three guards each allow `animation: none` and nothing else; the sort guard pins the feed's comparator.
- `DESIGN.md` -- the Recent activity row. `epic-6-context.md` -- 6.7's line amended. `sprint-status.yaml` -- 6.7 `done`.

**Deviations from the spec's contract.** The time is `--dim`, not `faint`, because it is the only carrier of when (as 6.5 and 6.6 ruled); `DESIGN.md` records it. The activity time and head needed no `label` classification beyond the head's. The story's default builds the list in main on `board:changed`; this builds it in the renderer (see Design Notes).

**Review.** 24 findings: patches applied 1 (low), deferred 0, rejected 23, each with its reason in the triage log above.

**Follow-up review recommended:** `false` (patched: high 0, medium 0, low 1).

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all clean before the patch; the negative-surface test clean after it.

**Residual risks.** The app was not run in a real window, so the row layout and the still amber dot are checked by contract tests only. The feed's cost grows with stored runs, which have no cap; it takes the newest 20 and never assumes one.
