---
title: 'The run list: steps and notes in the card body'
type: 'feature'
created: '2026-10-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md'
baseline_revision: '36f626976c36810fd0652bf7c78570ee20b8b152'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 3.16 put each tool call on the card as `RunCardEntry.steps` and nothing draws them: a quiet run's body is its run notes alone, so a long run reads as a wait (FR124, FR39 amended, UX-DR49).

**Approach:** The card body becomes one run list in fold order, newest last: step rows and run-note rows interleaved by `notesBefore`, above the document prose. A run that writes no document gets the run-list head (`run`, `working`, elapsed, stop) and no foot. Renderer only: no event, field, store or main change. Spec of record: epics.md Story 3.17; `DESIGN.md` → Run step; `EXPERIENCE.md` → The run list.

## Boundaries & Constraints

**Always:**
- The list is the card's existing flow container, above `.run-card-prose`; steps and notes accrued before prose stay above it in the same scroll container. The start row (`run started`) is still the first row and is never a note.
- Order: for each step in `entry.steps` order, emit the notes not yet emitted up to `notesBefore` (clamped to the notes held), then the step; the remaining notes last. Never compare times. A note row is the existing run-note row unchanged (time, kind tag, reason).
- A step row: grid `14px · 1fr · auto`, 9px gap, 3px vertical padding, no rule between step rows, baseline-aligned; mark, label (`mono`, `ident`), elapsed (`mono`, `meta`, tabular figures, right-aligned). Done: `✓` in `green`, label `dim`, elapsed the call's duration as `m:ss` (`0:03`; `h:mm:ss` past an hour) in `faint`. Failed: `✕` in `red`, label `dim`, elapsed the duration. Running: the existing `StatusDot` state `work` (its pulse) as the mark, label `text`, elapsed the text `now` in `dim`. `✓`, `✕` and `now` are text; colour never carries state alone.
- A step still `running` on a card that is not `running` (a card from a file, or a read-back) draws as failed, ending at `endedAt` of the step, else the card's, else its start. Nothing pulses or ticks on a terminal card.
- A card holding no step draws exactly what it draws today; steps and notes together never leave the body empty (the start row stands). No pending, planned or placeholder row, no `n of m`, no "earlier steps" mark past the cap.
- Run-list head: a card that **writes no document** (no subject path, no `entry.plan` entries, no `entry.documents`) draws `run` in the head's path slot (mono, `ident`, `text`) and, while `running`, the status word `working` (existing status style); its elapsed and stop control are unchanged; it draws **no foot**. A card that writes a document keeps today's head and foot exactly. A terminal card with no document keeps today's status string and gains only the `run` label.
- Accessibility: step rows take no tab stop, no tabindex, no role, no `aria-live`; the one live region is unchanged and announces nothing of steps; the pulse is the only motion added (the existing token); no media query is read.
- Every value in new CSS reaches the design system through `var()`; new dimensions are tokens in `src/renderer/design/tokens.css` (precedent: `--run-note-time`) so the Story 1.3 literal guard passes.

**Never:**
- No new event, field, command, store, file or main-side change; no change to the prose mode, the collapsed `RunCardLine` or its field set, or the foot of a document run; steps never in sans, never persona words, never in `.run-card-prose`.
- No spinner, skeleton, shimmer, bar, denominator, pending step, toast, badge or sound; no per-step elapsed ticking (the running elapsed is the text `now`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Interleave | notes `[n0,n1]`, steps `[s0{nb:0}, s1{nb:1}, s2{nb:2}]` | start, s0, n0, s1, n1, s2 | N/A |
| Notes only / none | no steps / no notes and no steps | today's body: notes only / the start row | N/A |
| Done step | `startedAt` 0, `endedAt` 3000 | `✓`, label `dim`, `0:03` | N/A |
| Running step | card `running`, step `running` | work dot, label `text`, `now` | N/A |
| Failed step | step `failed` | `✕`, `red` | N/A |
| Dead card | card `failed`/`stopped`/`finished`, step `running` | `✕`, no pulse, no `now` | treated as failed |
| `notesBefore` past notes held | `nb` 9, 2 notes | all notes before the step | clamped |
| Prose starts | text held, steps and notes present | rows above the prose, one scroll container | N/A |
| No-document run | no path, plan, documents; running | head `run` · `working` · elapsed · stop; no foot | N/A |
| Document run in dead air | plan present, no text | head and foot as today (`0 words on disk · autosave on`, plan) | N/A |
| Reload / relaunch | card from main's snapshot, or stored and dead | same list from the card | N/A |
| Cap | 300 steps, earliest dropped by the fold | list shows what the card holds; nothing says more existed | N/A |
| Built by folds | steps from a real recording through the folds | no spinner, denominator, bar, shimmer, pending step or placeholder in any state | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/run-card.tsx:125-142` -- the card; `<RunNoteFeed notes={bodyNotes(entry)} />` becomes the run list; head path slot / `working` status / foot gate (`deadAir`, `pending`, `others`) get the no-document form. `RunStatus` (`:180`) returns null for empty words in flight.
- `src/renderer/ui/chat/run-status.ts:173` -- `startNote`, `bodyNotes`; add pure `runListRows(entry)` (interleave, clamp) and `writesDocument(entry, path)`; testable in node beside `run-status.test.ts`.
- `src/renderer/ui/feed/run-note-feed.tsx` -- Epic 1's feed; extract its row as an exported `RunNoteRow` and keep `RunNoteFeed` rendering through it, so its tests and import stay valid. `.run-note + .run-note` rule (`run-note.css`) already works across a wrapper; the list container keeps the `run-note-feed` class (existing tests query it).
- `src/renderer/ui/chat/run-list.tsx` (new, + `.css`, + dom test) -- `RunList` renders rows; `RunStepRow`. Reuse `StatusDot` (`src/renderer/ui/status/status-dot.tsx`); `useNow` not needed.
- `src/renderer/ui/chat/format-step-elapsed.ts` (new, + test) -- `m:ss` from ms, floored, negative/non-finite -> `0:00`; `formatElapsed` (`status/format-elapsed.ts`) is the head's `5s` form and stays.
- `src/renderer/design/tokens.css` (`--run-note-time` at `:216`, `--space-md-plus` 9px, `--space-xs` 5px) -- add step-grid tokens (mark column 14px, vertical padding 3px), commented as the run-note ones are. Check which test sweeps tokens (`guardedStylesheets()`) and keep it green.
- `src/shared/conversation.ts:117` `RunCardStep`, `src/renderer/ui/chat/transcript-entry.ts` `RunCardEntry.steps` -- read-only inputs from Story 3.16; do not change.
- `src/renderer/ui/chat/run-card.dom.test.tsx`, `run-card.test.tsx`, `negative-surface.test.tsx`, `epic-3-audit.dom.test.tsx` (`CASES`, `card()`), `tests/negative-surface.test.ts` -- existing card tests; a card built with no plan, no path and no documents now draws no foot: update such assertions only where the story changes them, never loosen an audit.
- `tests/run-step-replay.test.ts` -- precedent for replaying `fixtures/runs/*.jsonl` through the real bridge/registry; `src/main/fold/{frame,route-frame,run-card}.ts` and `conversation-state.ts` `foldEvent` (`:817`) are the folds the audit's cards come from. Read-only.
- `_bmad/implementation-artifacts/{sprint-status.yaml,epic-3-context.md}` -- 3.17 `done`, a line on the run list.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/chat/format-step-elapsed.ts` (+ test) -- `m:ss` duration -- the step's elapsed
- `src/renderer/ui/chat/run-status.ts` (+ `run-status.test.ts`) -- `runListRows`, `writesDocument` -- ordering and the no-document test, as pure functions
- `src/renderer/ui/feed/run-note-feed.tsx` -- export `RunNoteRow`, keep `RunNoteFeed` -- one note row, two users
- `src/renderer/ui/chat/run-list.tsx`, `run-list.css`, `src/renderer/design/tokens.css` (+ `run-list.dom.test.tsx`) -- the list and the step row, every state in the matrix -- the surface
- `src/renderer/ui/chat/run-card.tsx` (+ `run-card.dom.test.tsx`, `run-card.test.tsx`) -- the list in the body, the run-list head, no foot for a no-document run, prose-mode order -- the card
- `src/renderer/ui/chat/epic-3-audit.dom.test.tsx`, `negative-surface.test.tsx`, `tests/negative-surface.test.ts` -- a card with steps in every state in `CASES` (running, quiet, streaming, revising, stopped, failed, finished, dead), built by the folds from a recorded run (`fixtures/runs`), asserting no spinner, denominator, bar, shimmer, pending step or placeholder; CSS adds only the one existing pulse
- Reload and relaunch: a test that a card folded from main's snapshot, and a stored dead one, draws the same list; no row of a dead card pulses
- `_bmad/implementation-artifacts/{sprint-status.yaml,epic-3-context.md}` -- 3.17 `done`
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given a card with steps and notes, when it draws, then one list in fold order shows both kinds of row, a note between the steps it fell among by `notesBefore`, notes unchanged.
- Given a step row, then its grid, marks, colours, label register and elapsed are as the Always block says, for done, failed and running.
- Given a card past 300 steps or with none, then the list shows what the card holds and no sentence says otherwise.
- Given prose streaming, then the rows stay above it in one scroll container, a step in mono as a short row with a mark and an elapsed.
- Given a run with no document, then the head reads `run`, `working`, elapsed, stop, and the card has no foot; a document run's head and foot are unchanged.
- Given a finished run or a card with no step, then the collapsed line and the empty-steps card draw as before.
- Given keyboard and assistive technology, then a step row has no tab stop and is not announced.
- Given a reload mid-run or a relaunch, then the same list renders from the card, a cut-off step as `✕`, nothing pulsing or ticking.
- Given the audit built from recorded runs, then no state shows a spinner, denominator, bar, shimmer, pending step or placeholder; lint, typecheck, tests and build pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 16, false 3, maybe-false 0 (0 patched, 0 deferred, 19 rejected)
- findings:
  - `[false]` `[reject]` Blind: spec status `in-review` while tracking files say `done` — status and commit are set at finalize, after triage, as this step orders.
  - `[low]` `[reject]` Blind: a step still `running` on a finished or stopped card draws `✕` — Story 3.16's fold closes such steps `failed` at the terminal event and the story says a cut-off step reads `✕`; this is only the defensive mirror.
  - `[low]` `[reject]` Blind: a `done` step with no `endedAt` reads `0:00` — the fold always stamps `endedAt` on done/failed; only a hand-edited file shows it.
  - `[low]` `[reject]` Blind: whole-second durations mostly read `0:00` and sit in `faint` — the story fixes `0:03` form and `faint`; the state is carried by `✓`/`✕`/`now`, not by the figure.
  - `[low]` `[reject]` Blind: the `working` word guard widened to `run-card.tsx` — a story-mandated word added to the allowlist, nothing removed; importing a constant is more than a direct correction.
  - `[low]` `[reject]` Blind: `RunList` not memoised — the card re-renders on store changes, not per delta (AD-15 holds); the feed it replaces re-rendered the same way.
  - `[low]` `[reject]` Blind: step keys by `callId`, note keys by row index — the fold ignores a repeated `callId`; a remount of a note row after a cap drop is harmless.
  - `[low]` `[reject]` Blind: head and foot change when a no-plan run starts writing a document — it is what the spec's "writes no document" rule derives; no source calls for a stable head.
  - `[low]` `[reject]` Blind: no rule between a step and a note — DESIGN.md gives the two kinds their own grids and "no rule between rows" for steps; the note rule is adjacent-note only.
  - `[low]` `[reject]` Blind: nothing verified in a real window or with a real `claude` — an unattended run cannot; recorded as a residual risk.
  - `[low]` `[reject]` Blind: step label has no length limit, glyphs have no accessible name, Code Map names an untouched file — labels are capped at 48 by Story 3.16, steps are not announced by design, and the Code Map is a map.
  - `[false]` `[reject]` Edge: a no-document card can still draw a foot through `others` — `others` comes from the prose store's paths, and any held path makes the subject path non-empty, so `writes` is true.
  - `[low]` `[reject]` Edge: run list not memoised — same as the Blind row.
  - `[low]` `[reject]` Edge: `done` step with no `endedAt` reads `0:00` — same as the Blind row.
  - `[low]` `[reject]` Edge: several `run` cards share a stop's accessible name — the stop already had no label on a path-less card before this story, and `run` would not tell them apart either.
  - `[low]` `[reject]` Edge (claim): running mark centred while done rows sit on the baseline — a dot has no baseline; centring it is the intended look.
  - `[false]` `[reject]` Edge (claim): "no foot" is only tested for the born case — the foot's gate runs on `deadAir`, `pending` and `others`, all empty for a card with no plan, path or documents; the matrix row is tested.
  - `[low]` `[reject]` Intent: the mid-run flip from no-document to document head is not tested as one card — both ends are tested and the flip is the derivation recomputed on each render.
  - `[false]` `[reject]` Intent: no commit appears in the diff — committing is this step's finalize.

## Design Notes

- **Writes no document** is derived from what the card already holds, with no new field: `entry.plan` is the skill template's section spine (empty for a skill without one), so no plan, no subject path and no confirmed documents means the card is not a document run. A document run in dead air keeps today's foot, whose `0 words on disk` is the honest form (Story 3.4).
- **Notes by fold order:** `notesBefore` counts `entry.notes` only; the start row is prepended outside the interleave. With dropped early steps, the notes before the first held step come first.
- **Step marks.** `✓`/`✕` are text glyphs in the first grid column; the running mark is `StatusDot` (`aria-hidden`), so `now` is the text that carries liveness under reduced motion.
- **Defaults confirmed from the story:** `✕` in `red`; no foot on a no-document run; no mark for dropped steps; steps not announced.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- With a real `claude`, dispatch a skill and watch steps appear among notes; an unattended run cannot check this, so record it as a residual risk.

## Auto Run Result

**Summary.** The run card's body is now one run list: step rows (mark, mono label, `m:ss` duration or `now`) and run-note rows interleaved by `notesBefore`, above the document prose. A card that writes no document (no subject path, plan or confirmed document) draws head `run` · `working` · elapsed · stop and no foot; a document run's head and foot are unchanged. A step still running on a card that is not draws `✕`; nothing pulses or ticks on a terminal card. Renderer only: no event, field or main change.

**Files changed.** `src/renderer/ui/chat/{run-list.tsx,run-list.css,format-step-elapsed.ts,run-status.ts,run-card.tsx}` (list, step row, duration, `runListRows` and `writesDocument`, the card's head and foot); `src/renderer/ui/feed/run-note-feed.tsx` (`RunNoteRow` exported); `src/renderer/design/tokens.css` (`--run-step-mark`, `--run-step-pad-y`); tests beside each, `tests/run-list-replay.test.tsx` (recorded run through the real bridge and folds), `tests/{negative-surface,tokens,run-replay}.test.ts*`, `src/renderer/ui/app.test.tsx`, and the audit's `CASES`; `sprint-status.yaml` and `epic-3-context.md` (3.17 done).

**Review.** 19 findings: patches applied 0; deferred 0; rejected 19 with reasons in the log. By verdict: high 0, medium 0, low 16, false 3, maybe-false 0.

**Follow-up review recommended: false.** No finding was patched.

**Verification.** `npm run lint` clean; `npm run typecheck` no errors; `npm test` unit 212 files, 5,192 tests passed, watchers 3 files, 64 tests passed; `npm run build` ok. Matrix audit: every I/O row has a test that ran and passed (`run-status.test.ts`, `run-list.dom.test.tsx`, `run-card.dom.test.tsx`, `run-card.test.tsx`, `epic-3-audit.dom.test.tsx`, `tests/run-list-replay.test.tsx`).

**Residual risks.**
- Not seen in a real window or with a real `claude`; the grid, baseline alignment and pulse are checked as structure in jsdom only.
- A no-plan skill that starts writing a document changes its head and gains a foot mid-run, by the derivation of "writes no document".
- Existing tests were updated where a card with no plan, path or documents now has head `run` and no foot; the `working` word guard allows `run-card.tsx`, and `tests/tokens.test.ts` re-pins its token digest for the two new tokens.
