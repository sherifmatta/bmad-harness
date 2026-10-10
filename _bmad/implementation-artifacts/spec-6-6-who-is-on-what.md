---
title: 'Who is on what'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_revision: '2a328cd589644c25d09204d6cc84928e982fbabd'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-6-context.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Board says how many personas are working but not which, or on what; the user must open each thread to find out.

**Approach:** Add an Agents panel below the Epics panel: one row per installed persona, in roster order, with the tile's portrait, name, title, dot and word. A persona on a run also reads the run's menu `code`, the path of the document its card shows, and the run's elapsed; one in a turn that is not a run reads `in a turn`. Rows are text, not controls; no new event or projection.

## Boundaries & Constraints

**Always:** Rows are the roster in `snapshot.agents` order (never sorted or grouped). State is `stateOf(id, states)`, drawn with `StatusDot` and `STATE_TEXT` as the tile does (one row per persona; main's `states` already aggregates sessions). `state === 'work'` with a run in flight (`pinnedRun(entries, id)`: the latest `running` run entry of that persona) adds a mono line: run `code`, subject path (`prose.get(runId)?.path`, omitted while empty), and elapsed from the run's `at`, ticking every second (`useNow(COUNTER_TICK_MS)`, `formatElapsed`). `work` with no run in flight adds only `in a turn`. Any other state adds nothing beyond its word. An idle row dims at `--opacity-idle`. The elapsed is never drawn unless state is `work`. A state change or run start/end replaces the row's text in the same render. Panel: `panel`, 1px `line`, `card` radius, head `agents` on `panel-2` (as `.board-epics`); rows split by `line-soft`; tokens only. The run's `code` is carried on the window's run entry (`RunCardEntry.code`, optional) from `run:started.code` and from a stored card's `code`.

**Never:** A count, cost, token, tool-call count, last-run age or any number beyond the elapsed; a control, handler, tab stop, `tabindex`, `aria-live`, `role` or tooltip on a row; a sort or regroup; a bar or meter; a new event, channel, bridge method, projection or change to `src/shared/` or `src/main/`; a write to the project; a new motion, overflow, transition or literal in CSS.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Roster order | 3 personas, any states | 3 rows in `snapshot.agents` order | N/A |
| Run in flight | `work`, running run, code `CP`, path `a/b.md` | dot, `working`, then `CP a/b.md 0:07` ticking | no path yet: `CP 0:07` |
| Turn, no run | `work`, no running run | `working`, `in a turn`; no code, path or time | N/A |
| Other states | `live`, `note`, `error`, `idle` | dot and word only; `idle` row dimmed | N/A |
| Stale run | state `idle`, entry still `running` | no run line, no elapsed | N/A |
| Two runs | one persona, two `running` entries | the later by `at` | N/A |
| Back from work | `work` → `idle` | run line gone in the same render | N/A |
| `none`/failure/null | as in 6.3 | no panel | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/transcript-entry.ts:68` -- `RunCardEntry`: add optional `code?: string`.
- `src/renderer/ui/chat/conversation-state.ts:596,920` -- `runEntryOf` and the `run:started` case: carry `code` (stored cards and live events). Check `conversation-state.test.ts`, `use-conversation.test.ts` for exact-shape `toEqual` on run entries.
- `src/renderer/ui/chat/transcript.tsx:53` -- `pinnedRun(entries, agentId)`: reuse for the persona's run in flight; read-only.
- `src/renderer/ui/board/board-agents.ts` -- NEW pure `agentRowsOf(installed, states, entries)` → `{ agent, state, run?: { runId, code, startedAt } }[]`; run only when state is `work`.
- `src/renderer/ui/board/board-agents.tsx` -- NEW `AgentsPanel({ rows, prose })`: `<section class="board-agents">`, `<h3 class="board-agents-head">agents</h3>`, `<ul>` of `<li class="board-agent board-agent--<state>">`. Model on `persona-tile.tsx` (`portrait(artParamsFor(agent.id), 28, state, agent)`, `StatusDot`, `STATE_TEXT`) and `run-card.tsx:104-110` (`useSyncExternalStore` on `prose.subscribe/get`); ticking elapsed per `status-dot.tsx` `ElapsedCounter`. Do not render `StateLine` with `since` (the run's elapsed replaces it).
- `src/renderer/ui/board/board-view.tsx` -- new props `entries: readonly TranscriptEntry[]`, `prose?: ProseStore`; draw `AgentsPanel` after the Epics panel in the `read` branch; refresh the doc comment (6.7 remains).
- `src/renderer/ui/shell/shell.tsx:321` -- new optional props `runs` (default empty) and `prose`, passed to `BoardView`; `src/renderer/ui/app.tsx:287` passes `conversation.entries` and `conversation.prose`.
- `src/renderer/ui/shell/shell.css` -- after the 6.5 block: `.board-agents`, `-head`, `.board-agent-rows`, `.board-agent`, `.board-agent--idle`, `-who`, `-name`, `-title`, `-run`; tokens only.
- Tests: `board-agents.test.ts` (NEW), `board-view.test.tsx`, `src/renderer/ui/app.test.tsx` (state change moves the row; run line while `work`), `tests/tokens.test.ts:1555` (add `agents|agent` to the selector regex), `tests/negative-surface.test.ts:675` (classify `.board-agents-head` as a label; run/state text at `--dim`+), `src/renderer/ui/shell/negative-surface.test.tsx`, conversation-state tests for `code`.
- `DESIGN.md:1149` -- Agents row: the run line (code, path, elapsed) at `dim`, not `faint`.

## Tasks & Acceptance

**Execution:**
- `transcript-entry.ts`, `conversation-state.ts` -- carry `run:started.code` / stored `code` on `RunCardEntry` -- the row cannot name the run without it
- `board-agents.ts` + test -- pure row fold per I/O matrix -- counting and choosing rules testable without React
- `board-agents.tsx` -- panel and rows as above; no handler, tabindex, aria-live -- not a control
- `board-view.tsx`, `shell.tsx`, `app.tsx` -- wire `entries` and `prose` through -- same data the tiles and cards read
- `shell.css` -- panel and row styles -- tokens only
- Tests and `DESIGN.md` per Code Map

**Acceptance Criteria:**
- Given a read Board, then the Agents panel has one row per installed persona in roster order, each with portrait, name, title, and the tile's dot and word
- Given a persona with a run in flight, then its row also shows the run's `code`, its subject path and an elapsed that ticks each second
- Given a persona in a turn that is not a run, then its row says `in a turn` and nothing of what
- Given any other state, then its row shows the word only, and an idle row dims at `--opacity-idle`; no row shows a count, cost, tool-call figure or last-run age
- Given a persona goes to work and back, then the row follows in the same render and elapsed shows only for `work`
- Given a row, then it is not a control, takes no tab stop and is not announced

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 22, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` the component is `board-agents-panel.tsx`, not the Code Map's `board-agents.tsx` (blind) — `./board-agents` resolves to the `.ts` first; the fix is an edit to this spec
  - `[low]` `[reject]` portrait is 36 not 28, elapsed reads `7s` not `0:07`, a class is unlisted (blind) — `PortraitSize` allows 36 or 44 and the tile uses 36; the Always clause names `formatElapsed`, which writes `7s`; the matrix's `0:07` is a slip in an example; the fix is an edit to this spec
  - `[low]` `[reject]` the portrait svg keeps its `role="img"` and label, so rows are not wholly silent (blind) — the AC's "announced" is the live region, which the row has none of; the portrait is the tile's own
  - `[low]` `[reject]` an idle row's dimmed `--dim` text is not contrast-checked (blind) — the story mandates `--opacity-idle` on an idle row, as the cast card does
  - `[low]` `[reject]` the whole Board re-renders on each transcript change (blind) — cheap folds over a short roster; no named harm
  - `[false]` `[reject]` a persona's run in another thread is missed, so it reads `in a turn` (blind) — `conversation.entries` holds every persona's runs: `pinnedRun` and the thread's run lines of unviewed personas read it
  - `[low]` `[reject]` the subject path may be absolute and wraps mid-word, and `code` is cryptic (blind) — it is the path the run card's head shows; the story asks for `code` and path
  - `[low]` `[reject]` `board-agents.ts` imports `pinnedRun` from a `.tsx` module (blind) — `layering.test.ts` passes; no divergence named
  - `[false]` `[reject]` a `startedAt` in the future or a clock skew shows a negative elapsed (blind) — `formatElapsed` reads a negative span as `0s`; a tie takes the later in file order, as the tile's pinned card does
  - `[low]` `[reject]` the slice tests pass vacuously if the marker is missing (blind) — the panel's own tests assert the marker; same finding rejected in 6.5
  - `[low]` `[reject]` `epic-6-context.md` and `DESIGN.md` do not record 6.6's `in a turn`, 36px portrait or run's `at` (blind) — the context is regenerated on the next run; `DESIGN.md`'s Agents row is amended for the colour
  - `[low]` `[reject]` the row says `in a turn` for the instant between `run:finished` and `persona:state` leaving `work` (edge-case) — the persona is still `work`; the next event replaces it in a frame
  - `[low]` `[reject]` the row attributes a run to a `work` state that may belong to the room (edge-case) — the tile aggregates a persona's sessions into one state (FR104) and the row follows it, as the story says
  - `[low]` `[reject]` an empty roster draws `agents` over an empty list (edge-case) — the AC names no empty-state text and forbids one, as in 6.5
  - `[low]` `[reject]` the hidden Board's per-second timer runs for a working persona (edge-case) — one timer per working persona, as the tile's counter; no named harm
  - `[low]` `[patch]` `RunLine` is not remounted when a persona's run changes with state staying `work`, so `useNow` holds a stale `now` for up to a second (edge-case) — keyed by `run.runId`
  - `[false]` `[reject]` clock skew between main's `at` and the renderer's `Date.now` (edge-case) — `formatElapsed` clamps at `0s`; the run card reads the same clocks
  - `[low]` `[reject]` an `indexOf` slice becomes `slice(…, -1)` without the marker (edge-case, two sites) — same as the blind finding
  - `[low]` `[reject]` the portrait svg is announced per row (edge-case) — same as the blind finding
  - `[low]` `[reject]` portrait size 36 against the Code Map's 28 (edge-case) — same as the blind finding
  - `[low]` `[reject]` `formatElapsed` against the matrix's `0:07` (edge-case) — same as the blind finding
  - `[low]` `[reject]` the matrix's `0:07` and the file and size names disagree with the code (verification-gap, other) — same as the blind findings
  - `[low]` `[reject]` the Code Map's file and portrait size names differ from the code (verification-gap, other) — same as the blind findings
  - `[low]` `[reject]` the diff does not close the story: spec `in-review`, no sprint status change, no commit (intent-alignment) — the closing is done after this log, as "commit and close" asks
  - `[low]` `[reject]` the tests exercise the renderer and not the lifecycle surface (intent-alignment) — the story changes only the renderer and `RunCardEntry`; no change to `src/main/`

## Design Notes

Elapsed counts from the run's `at`, not from the persona's `since`, because the story names "the run's elapsed time"; a turn without a run shows no time. `code` is optional on `RunCardEntry` so existing fixtures stay valid; a run entry without one draws the path and elapsed alone. The row's text sits at `--dim`, not the design's `faint`, for the reason 6.5 recorded: it is the only carrier of the fact.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass
- `npm run build` -- expected: clean

## Auto Run Result

Status: done

**Summary.** The Board's Agents panel, below the Epics panel, has one row per installed persona in roster order: portrait, name, title, and the tile's dot and word. A persona in `work` on a run also reads the run's menu `code`, the path of the document its card shows and the run's elapsed, ticking each second; one in a turn that is not a run reads `in a turn`; an idle row dims at `--opacity-idle`. Rows are text: no control, count or cost. `RunCardEntry` now carries the run's `code`.

**Files changed.**
- `src/renderer/ui/chat/transcript-entry.ts`, `src/renderer/ui/chat/conversation-state.ts` -- optional `code` on the run entry, from `run:started` and from a stored card.
- `src/renderer/ui/board/board-agents.ts` (new) -- pure `agentRowsOf`.
- `src/renderer/ui/board/board-agents-panel.tsx` (new) -- `AgentsPanel` and the ticking `RunLine`, keyed by run.
- `src/renderer/ui/board/board-view.tsx`, `src/renderer/ui/shell/shell.tsx`, `src/renderer/ui/app.tsx` -- carry `entries` and `prose` to the panel.
- `src/renderer/ui/shell/shell.css` -- `.board-agents*`, `.board-agent*`; tokens only.
- Tests: `board-agents.test.ts`, `board-agents-panel.dom.test.tsx` (new), `board-view.test.tsx`, `app.test.tsx`, `conversation-state.test.ts`, `shell/negative-surface.test.tsx`, `tests/tokens.test.ts`, `tests/negative-surface.test.ts`.
- `DESIGN.md` -- the Agents row's run line at `dim`. `epic-6-context.md` regenerated. `sprint-status.yaml` -- 6.6 `done`.

**Deviations from the spec's Code Map and matrix.** The component file is `board-agents-panel.tsx` (the `.ts` fold takes `./board-agents`); the portrait is 36 (`PortraitSize` allows 36 or 44) as the tile's; the elapsed reads `7s` / `1m 05s` (`formatElapsed`, which the Always clause names), not the matrix's `0:07`.

**Review.** 25 findings: patches applied 1 (low), deferred 0, rejected 24, each with its reason in the triage log above.

**Follow-up review recommended:** `false` (patched: high 0, medium 0, low 1).

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` (231 unit files, 5479 tests; 3 watcher files, 64 tests) and `npm run build` all clean before the patch; typecheck, lint and the Board and App tests clean after it.

**Residual risks.** The app was not run in a real window, so the row's spacing and the idle dimming's legibility are checked by contract tests only. The idle row's whole text is dimmed to `--opacity-idle` as the story asks.
