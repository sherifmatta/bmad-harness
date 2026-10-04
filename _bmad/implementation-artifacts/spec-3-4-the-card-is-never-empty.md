---
title: 'The card is never empty'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: 'b73dc122bfa3baec932c17508ee2e1813533dca9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The dead-air head carries no stop control, although this story's head AC lists it.
    evidence: |-
      `run.stop`, the in-band interrupt, its fallback and the control itself are Story 3.7, whose ACs already name the card head and the collapsed line; a control rendered here would do nothing, and no `run.stop` handler exists in main. The same deferral as Story 3.3's.
    location: >-
      src/renderer/ui/chat/run-card.tsx (head)
    severity: low
---

<intent-contract>

## Intent

**Problem:** A run that has gone quiet shows a card with an empty body, a head that says `writing` when nothing is being written, and a foot of names only: a long silence reads as a hang (FR39, FR42, FR43, UX-DR33). The recorded runs were silent for 1 min 40 s (live) to 11 min 45 s (replay) before the first memlog note.

**Approach:** The body always opens with the run's own start record, in the harness's register, then the run notes, with prose below them once it streams. In dead air (running, no document text yet) the head drops the status string and the foot reads `0 words on disk · autosave on`, then the named sections. A phase word is never invented: no feed in this stream states one.

## Boundaries & Constraints

**Always:**
- Body rows are the start row, then each `run:note` in order. The start row is made from the card's `at` (time from `formatTurnTime`, no kind, reason `run started`) and is never stored in `notes`, so 3.5's fallback ("no note has arrived") stays true. It shows in every status, including a hydrated card.
- Dead air is: `status` is `running` and the prose store holds no text for the card. The head then renders the dot, the path (empty until a `Write` streams), and the elapsed time, right-aligned, and no status string. Once text exists the head reads as 3.3 left it. Terminal heads are unchanged.
- Foot in dead air, in order: `0 words on disk`, `autosave on`, then 3.3's `N to write` and its names, then `also written`. Not softened. With text held, or a terminal status, the foot is 3.3's and has neither phrase. A phase segment sits between the two phrases only when a feed states one; none does, so none renders and no field carries one.
- Notes stay above the prose in one scroll container, in time order; the only thing telling a note from prose is the typeface (notes sans, prose mono): no wrapper, label, rule or ground is added.
- Subagent frames (`parent_tool_use_id`) and `system/task_*` frames never become a persona line or a note. Every dimension in CSS comes from `src/renderer/design/tokens.css`.

**Never:**
- No spinner, skeleton, bar, denominator or sentence that says what has not happened or what is awaited ("nothing written yet", "§2 opens when research returns").
- No stop control, collapsed line or `run.stop` (3.7, 3.5); no change to the contract, main, the memlog handling, the watcher, the rail, persona state, the pinned slot, or the live-region lifecycle line.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Born | `run:started`, no note, no text | body: the start row only; head: path, elapsed, no status; foot: `0 words on disk`, `autosave on`, `N to write` and names | N/A |
| Notes in dead air | three notes, no text | body: start row, then three notes in order; foot as above | N/A |
| Prose begins | first `doc:prose` | head `writing`, notes and start row stay above the prose; foot loses the two phrases | N/A |
| Quiet after prose | text held, no piece for minutes | body keeps start row, notes and prose; head keeps its last words; foot is 3.3's | N/A |
| Terminal card | finished, failed, stopped, or hydrated dead | start row and notes still show; no dead-air foot | N/A |
| Subagent frames | `parent_tool_use_id` frames and `task_*` in the stream | no persona line, no note, no row | Ignored |
| Fast-path replay | `fast-path-sonnet` through the real pipeline | from `run:started` on, every state has at least one body row; no spinner or skeleton node | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/run-status.ts` -- `progressWords`, `runStatusText`: add the dead-air rule (no status when the card holds no text); add `startNote(entry)` and `bodyNotes(entry)`. `noteOf` and `formatTurnTime` are the row's reuse points.
- `src/renderer/ui/chat/run-card.tsx:49-111` -- head status, `RunNoteFeed` input, foot; `hasText` is already a store read here. `RunStatus` takes it.
- `src/renderer/ui/chat/run-card.css:42-50` -- `.run-card-status` carries `margin-left: auto`; with it absent the elapsed must take the right edge. New foot phrase spans use `--card-foot-gap` and `--dim`/`--faint`.
- `src/renderer/ui/feed/run-note-feed.tsx` -- renders `RunNote[]` with an empty kind cell for `null`; unchanged. `kind-treatment.ts` is neutral for `null`.
- `src/main/fold/frame.ts:64-71`, `route-frame.ts:26` -- subagent frames are already dropped; the corpus test pins it. `fixtures/runs/fast-path-sonnet.jsonl` has 8 `task_started`, 60 `task_progress` frames and notes only from frame 2112.
- Tests to update, which assert `writing` at birth: `run-card.test.tsx:50`, `run-status.test.ts:20`, `app.test.tsx:889`, `run-card.dom.test.tsx:219-221`, `tests/run-replay-multi-file.test.ts:266`. `tests/run-replay.test.ts` is the pipeline harness; `tests/negative-surface.test.ts` and `src/renderer/ui/chat/negative-surface.test.tsx` are the guards.
- Read-only evidence: EXPERIENCE.md *Document card* table and *Dead Air → Head and foot during dead air*; epics.md Story 3.4.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/chat/run-status.ts` -- add `startNote`, `bodyNotes`; `runStatusText`/`progressWords` return no words when a running card holds no text -- the body and head rules
- `src/renderer/ui/chat/run-card.tsx`, `run-card.css` -- feed gets `bodyNotes`; head omits the status in dead air and keeps elapsed right-aligned; foot leads with `0 words on disk` and `autosave on` in dead air -- what the person sees
- `src/renderer/ui/chat/run-status.test.ts`, `run-card.test.tsx`, `run-card.dom.test.tsx`, `app.test.tsx`, `tests/run-replay-multi-file.test.ts` -- update the birth-state assertions; add one test per matrix row (dom: born, notes in dead air, prose begins, quiet after prose, terminal, DOM order and no wrapper between notes and prose)
- `tests/run-replay.test.ts` or a new `tests/run-dead-air.test.ts` -- replay `fast-path-sonnet` through the real pipeline and the window fold; assert at every event after `run:started` that the body has a row, and that no `persona:said` or `run:note` came from a subagent frame
- `tests/negative-surface.test.ts`, `src/renderer/ui/chat/negative-surface.test.tsx` -- no waiting sentence, spinner, skeleton or bar in any card state; no label or container between notes and prose
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given a card with no note and no text, then its body shows the start row and is never empty in any status, and no placeholder sentence appears.
- Given dead air, then the head shows path, a ticking elapsed time and no status, and a phase word appears only when a feed states one, which none does here.
- Given dead air, then the foot reads `0 words on disk` and `autosave on` before the named next sections.
- Given prose resumes after a quiet window, then the notes accrued stay above it in the same scroll container in time order, told apart by typeface alone.
- Given subagent frames, then none renders as a persona line or a note.
- Given the Fast-path fixture replayed, then every state from `run:started` on has body content and no spinner, skeleton or empty body.
- Given the full suite, lint, typecheck and build, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass
- verdicts: 29 findings — high 0, medium 0, low 24, false 5, maybe-false 0 (three patch groups, all `low`; one `low` deferred; the rest rejected, five of them false)
- findings:
  - `[false]` `[reject]` Blind: dead air plus `also written` makes the foot say `0 words on disk` beside files written — `others` is every store path except the subject, and a path enters the store only through a `Write` piece, which also gives the subject text, so `others` is empty whenever `hasText` is false; a reload seeds the store from the snapshot's text.
  - `[low]` `[reject]` Blind: `autosave on` is a static claim — the AC fixes the foot's words (`0 words on disk · <phase> · autosave on`), and the product autosaves by writing as it goes.
  - `[low]` `[patch]` Blind: the two phrases are separate spans with no `·`, so the foot does not read as the AC's string — patched: one span reads `0 words on disk · autosave on`, and the tests follow.
  - `[low]` `[patch]` Blind: `progressWords` defaults `hasText` to true and `runStatusText` to false, so a caller that omits it silently gets no status — patched: both default to true, and only a caller passing `false` gets dead air.
  - `[low]` `[patch]` Blind: the replay test's row-count assertions are true by construction, and nothing renders the card from the replay — patched with the Edge and Intent rows below (head checked after each `doc:prose`, tautologies dropped, three rendered checkpoints).
  - `[low]` `[reject]` Blind: the subagent test re-asserts what main already drops — real, and the drop is pinned by `frame.test.ts`, `route-frame.test.ts` and `session-bridge.test.ts` (a mutation removing it fails ten tests there); this test adds a corpus-level check at no cost.
  - `[low]` `[reject]` Blind: source-sweep tests slice markup by a fixed string and ban substrings — they fail loudly on a markup change rather than pass, and the repo's other negative-surface sweeps work the same way.
  - `[low]` `[reject]` Blind: gaps for a hydrated card, a ticking elapsed, dead air with an empty plan and `at` of 0 — a hydrated dead card is a terminal status (tested), the ticking elapsed is 3.1's and unchanged, and the others are not reachable states.
  - `[low]` `[reject]` Blind: the head's only state word is gone in dead air and the foot is out of the live region — the dot, `aria-busy` and the lifecycle announcement carry the state, and nothing here was ever announced from the foot.
  - `[low]` `[patch]` Blind: housekeeping — a missing blank line in `run-replay.test.ts` patched; the empty logs and `oversized` are this run's own steps, the `HH:MM` time (no date) is `formatTurnTime`'s existing convention, and the manual check is a residual risk below.
  - `[false]` `[reject]` Edge: `deadAir` should also require no documents — a card's documents with no store text arise only from a commit with no prior piece, which no `Write` produces.
  - `[low]` `[carried]` `[patch]` Edge: `runStatusText` defaults `hasText` to false — same cause and fix as the second Blind patch.
  - `[low]` `[reject]` Edge: the lifecycle line says `writing` at run start while the head says nothing — the spec leaves the announcement alone; it says what the run is doing, the head what has been observed.
  - `[false]` `[carried]` `[reject]` Edge: `0 words on disk` ahead of `also written` — same as the first row.
  - `[false]` `[reject]` Edge: an empty path span adds a gap so elapsed sits off the right edge — `margin-left: auto` on the elapsed pushes it to the right whatever sits to its left.
  - `[low]` `[carried]` `[reject]` Edge: the `.tsx` test slices markup by a fixed string — same as the source-sweep row.
  - `[low]` `[carried]` `[patch]` Edge: the dead-air to writing transition is not checked at the `doc:prose` event — same cause and fix as the replay patch.
  - `[low]` `[carried]` `[patch]` Gap: the replay's row count cannot fail and the DOM tests are the real guard — same as the replay patch, which adds rendered checkpoints.
  - `[low]` `[reject]` Gap: the right-aligned elapsed in dead air has no automated check — jsdom has no layout, so none can be written; recorded as a residual risk.
  - `[low]` `[defer]` Intent: the dead-air head has no working stop control — `run.stop` and the control are Story 3.7's, whose ACs name the card head; the same deferral as 3.3, recorded.
  - `[low]` `[reject]` Intent: the foot omits the phase segment — the AC's `<phase>` renders only when a feed states one, and none does; the spec and Design Notes say so.
  - `[low]` `[reject]` Intent: the body's first row is not a `run:note` — a choice made in the spec so the body is never empty before the first note; recorded in Design Notes.
  - `[low]` `[reject]` Intent: dead air is inferred from the renderer's buffer, so `0 words on disk` can be false for a Bash-heredoc run — recorded in Design Notes and the residual risks.
  - `[low]` `[reject]` Intent: `sprint-status.yaml` is unchanged and the spec reads `in-review` — finalize steps of this run, done after triage.
  - `[low]` `[carried]` `[patch]` Intent: the replay never mounts the card — same as the replay patch.
  - `[low]` `[carried]` `[reject]` Intent: the negative-surface tests read source text — same as the source-sweep row.
  - `[low]` `[carried]` `[reject]` Intent: the subagent test checks main's existing filtering — same as the subagent row.
  - `[low]` `[reject]` Intent: existing birth-state tests were rewritten (`writing` to no status, one note to two) — the spec lists them as the tests to update, since the behaviour they asserted is what this story changes.
  - `[false]` `[reject]` Intent: the card does not show content for the entire quiet window — the start row is in the body from `run:started` on, so no window of the replay has an empty body (rendered checkpoints added).

## Design Notes

- **Why the start row is not a note.** It is a record of something that happened (the run began, at a time), not a statement about waiting, so it is content and not a spinner in a sentence. Keeping it out of `notes` leaves main's card, the parity test and 3.5's "last note's reason, else the section name" untouched; the renderer keeps no menu code by design, so the row says only `run started`.
- **Why the head drops `writing`.** EXPERIENCE.md's quiet-state head is "phase word if a feed states one, else path + elapsed only"; `writing` before any text is a state no feed drives (AD-20). It returns with the first prose piece.
- **`0 words on disk` is about the card's subject.** A run that writes through Bash heredocs (opus) has no subject, so its card reads `0 words on disk` while files exist. The rail is the disk's truth; this is a recorded residual risk, not softened here.
- **No phase source.** `system/task_progress` and `task_started` carry subagent descriptions, not a phase word, and mapping them to `researching` would be a guess. The rule is built as an absence; a source is a later decision.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Press a long skill in the real app and read the first 100 seconds: a start row, no status, a foot of `0 words on disk · autosave on` and the planned names. An unattended run cannot do this; record it as a residual risk.

## Auto Run Result

**Summary.** The run card's body is never empty. It opens with the run's own start record (`run started`, with the time, no kind; made from the card's `at` and never stored in `notes`), then the run notes in order, with prose below them once it streams. In dead air (a running card holding no document text) the head drops its status string, keeping the dot, the path and the elapsed time right-aligned, and the foot reads `0 words on disk · autosave on` before the named next sections and any `also written` files. No phase word is rendered, because no feed in this stream states one. Terminal cards, and cards holding text, are as 3.3 left them. Subagent and `system/task_*` frames still never become a persona line or a note, now also pinned by a corpus test.

**Files changed.** `src/renderer/ui/chat/run-status.ts` (`startNote`, `bodyNotes`, dead-air rule in `progressWords`/`runStatusText`); `src/renderer/ui/chat/run-card.tsx` and `run-card.css` (body rows, head, foot, right-aligned elapsed); tests in `run-status.test.ts`, `run-card.test.tsx`, `run-card.dom.test.tsx`, `app.test.tsx`, `negative-surface.test.tsx`, `tests/negative-surface.test.ts`, `tests/run-replay.test.ts` (the `fast-path-sonnet` replay with rendered checkpoints and the subagent check) and `tests/run-replay-multi-file.test.ts`; `sprint-status.yaml` (3.4 `done`) and `epic-3-context.md` (3.4 marked done).

**Review.** 29 findings: patches applied 3 groups, all low (the foot phrase is one span with its `·`; `runStatusText` defaults `hasText` like `progressWords`; the replay test checks the head after each `doc:prose`, drops tautologies and renders the card at three checkpoints); deferred 1 (the stop control, Story 3.7's); the rest rejected with reasons in the log (false 5, low 24 in all). Patched by verdict: high 0, medium 0, low 3.

**Follow-up review recommended: false.**

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` unit 135 files, 2965 tests passed, watchers 3 files, 55 tests passed; `npm run build` exit 0. Run before review and again after the patches. Matrix audit: every I/O row has a covering test that ran (`run-status.test.ts`, `run-card.test.tsx`, `run-card.dom.test.tsx`, `tests/run-replay.test.ts`, `src/renderer/ui/chat/negative-surface.test.tsx`).

**Residual risks.**
- Not seen in a real window: no live run was made, so how the first 100 seconds read to a person watching is untested.
- `0 words on disk` is about the card's subject: a run that writes through Bash heredocs (opus) has no subject, so its card reads `0 words on disk` while files exist.
- No feed states a phase word, so none is ever shown; a source (for instance from `system/task_started` descriptions) is a later decision.
- The lifecycle announcement still says `<name> · writing` at run start while the head has no status in dead air.
- The right-aligned elapsed time in dead air rests on CSS alone; jsdom cannot check layout.
- The replay test loads `run-card.tsx` by a path the node typechecker does not follow, a loosely typed cast, because the node program has no DOM lib.
