---
title: 'The rail learns who is writing'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: '88f3f14d4b173fd7c5ff637e46b10e5358cbd327'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A file a run is writing shows `changing` in the rail and nothing else: no persona, no section. The rail's annotation slot has been built and tested against a stub since Story 1.11, but no stream feeds it, though the run's own events say who is writing and where (FR49–FR51, UX-DR18).

**Approach:** Main folds a run's events into one annotation per file the run holds text of (its persona, and `writing · §N <Name>` or `revising · §N <Name>`, in the card head's own words) and hands each to the rail projection's existing `annotate` seam, again whenever the watcher makes or remakes that row, and drops them when the run ends. Disk state never moves for it. The row's owner slot reads the annotation's owner first.

## Boundaries & Constraints

**Always:**
- Two truth channels, no merge. An annotation is written only through `RailProjection.annotate` (the stream side); a row's `path`, `state`, `savedAt` and class-derived `owner` come only from `observe`, `settle` and the class, as today. No run event creates a row, removes one, or moves one to `saved`. `annotate` of a path with no row changes nothing, so the producer keeps what it wants said and says it again after every watcher observation of that path.
- An annotation exists for a path exactly while a run in flight holds text for it: a streamed `Write`, or an applied `Edit` of one. Its `text` is `writing` before any section is seen, else `writing · §N <Name>`; while an applied `Edit` of that path stands (until the next `Write` piece of it) `revising` / `revising · §N <Name>`. `N` and `Name` are the card head's: the section in flight and its place among those the file's text has shown, numbering stripped, never renumbered, no denominator. They come from one shared function (`sectionProgress`) that the card's prose store and the rail both call, and the head's words from one shared `progressLabel`. `owner` is `{ agentId }` of the run's persona, absent when the run has none. A path the run holds no text of (an `Edit` of a file no `Write` of the run started), a rejected write and `.memlog.md` give no annotation.
- The annotation ends with its run: any terminal event (`run:finished`, `run:stopped`, `run:failed`) drops every annotation of that run and no other run's. The row is then exactly what the watcher says. (`stopped` on the row is Story 3.8's.)
- The section name in an annotation is at most 40 characters (code points): a longer name is its first 39 followed by `…`; the tag also truncates with an ellipsis in CSS (one token for its width), so it never pushes the row's file name out.
- When two runs hold text for one path, the later-started run's annotation shows. Contention, which names both owners, is Story 3.9's.
- The row's owner slot shows the annotation's owner when it has one, else the class-derived `row.owner`, else nothing; an agent the roster lacks shows nothing, never a fallback. Persona states keep reading `row.owner` and the disk signature only, so an annotation never raises or clears `note`.
- Every CSS dimension comes from `src/renderer/design/tokens.css`.

**Never:**
- No change to `observe`, `settle`, `nextSettleAt`, the rail's push rule, `src/main/fold/persona-state.ts`, `OutputRow`, `src/preload/**`, the bridge channels or `src/shared/events.ts`; no new bridge command or event; no change to `RunCardSnapshot` or `conversation:get`; the prose store and `progressWords` change only to call the shared functions, with every existing test unchanged.
- No annotation computed in the renderer, none for a file nobody in the harness is writing (an editor, a terminal `claude`), and no row made for a path the stream names before the watcher has seen it.
- No `stopped`, contention text, notification or stop control (3.7–3.10); no denominator, bar, spinner, tooltip, badge or motion anywhere in the annotation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New file, row not yet made | John's run streams `## 1. Vision`, `## 2. Goals` of `prd.md`; no observation yet | no row, nothing drawn; main holds `writing · §2 Goals` | `annotate` no-op |
| The watcher makes the row | `artifact:written` for `prd.md` | the row is `changing` (watcher) and carries `writing · §2 Goals`, owner John | N/A |
| Existing file rewritten | row `saved · 2d` exists; run streams `## Context` | the row reads `saved` (watcher) and `writing · §1 Context`, both registers | N/A |
| A section opens | `## Scope\n` streams after Goals | text becomes `writing · §3 Scope`; a half-streamed `## Sc` is not yet a section | N/A |
| No heading yet | text with no `##` | `writing`, owner, no section | N/A |
| Revision | an applied `Edit` whose first changed character is in Goals | `revising · §2 Goals`; the file's next `Write` piece returns it to `writing` | N/A |
| Several files | addendum, pre-review copy and PRD written by one run | each row has its own section, the same owner | N/A |
| Edit without text | `Edit` of a file no `Write` of the run started; a rejected write | no annotation | N/A |
| Stream cannot say saved | `doc:committed` and `run:finished` arrive while the row is `changing` | the row stays `changing` and reaches `saved` only when the settle timer fires | N/A |
| Foreign writer | an editor or a terminal `claude` writes a file; or a run elsewhere writes another | that row is `changing` with no `annotation` key, `saved` after the settle, and reads complete | N/A |
| Run ends | terminal event | that run's annotations are gone from the next push; disk fields and rows byte-identical; another run's stay | N/A |
| Row removed, then back | file deleted mid-run, then written again | no row, no annotation; when the watcher makes it again the annotation returns | N/A |
| Long heading | a 200-character section name | the name is its first 39 characters and `…`; the tag ellipsizes in CSS | N/A |
| Persona off the roster | annotation owner not in the roster | the tag draws; the owner slot is empty | N/A |
| Window reload | reload mid-run | `rail:get` hands back the rows with their annotations | N/A |

</intent-contract>

## Code Map

- `src/main/projections/rail.ts:28-36,116-122` -- `RailProjection.annotate(path, annotation | null)` is the seam and stays as it is; it decorates an existing row only and the projection pushes only when the rows' JSON differs, so re-handing an unchanged annotation pushes nothing. `src/main/fold/rail-rows.ts:90-110,133-142` -- `annotate` and `toRows` copy `{ text }` explicitly: both now carry `owner`; `tests/outputs-contract.test.ts:207-216` slices `annotate`/`settle` and forbids disk-field words in `annotate`'s body: keep it clean.
- `src/shared/rail.ts:22-23` -- `RailAnnotation = { text }` ("Epic 3 extends it additively"): add `owner?: RailOwner`. `RailRow.owner` stays class-derived.
- `src/renderer/ui/chat/prose-store.ts:118-165` -- `settle` computes `seen` and the section from the subject's text (unterminated last-line heading is not yet seen; `seen` only appended; revision = the section holding the first changed character, via `commonPrefix`). Move that computation to `src/shared/section-progress.ts` (new) as `sectionProgress(text, held, revisionOffset?) => { seen, section? }` (returns `held` itself when nothing is added) and `progressLabel(revising, section?)`; `settle` keeps its own identity-preserving `progress` object. `src/renderer/ui/chat/run-status.ts:46` `progressWords` calls `progressLabel`. Helpers: `src/shared/section-headings.ts` (`scanHeadings`), `src/shared/section-plan.ts` (`sectionName`, `nameKey`). `prose-store.test.ts:108-250` and `run-status.test.ts` must pass unchanged.
- `src/main/fold/rail-annotations.ts` (new, pure, no clock) -- `foldAnnotations(table, event, card)` and `annotationsOf(table): Map<path, RailAnnotation>`. State: per run `{ agentId?, paths: Map<path, { text, seen, revising, section? }> }` in start order. `run:started` adds the run; `doc:prose` reads that path's text from `card.documents` (`src/shared/conversation.ts:87-120`), runs `sectionProgress`, `revising: false`; `doc:committed` `ok` with `text` (an applied `Edit`) takes `sectionProgress(text, held.seen, commonPrefix(held.text ?? '', text))`, `revising: true`; a rejected commit of the call that set a path's text (a `Write`) keeps the held entry but stops showing it (`live: false`), a rejected `Edit`, any other commit, `run:note` and the rest change nothing; a terminal event deletes the run. A path whose text is empty has no entry. Reuse the offset rule of `prose-store.ts:111-116`.
- `src/main/projections/rail-annotator.ts` (new) -- `createRailAnnotator()`: `apply(event, card)` folds, then tells the bound target the difference from what it last told (`annotate(path, annotation)`, `annotate(path, null)` for a path no longer annotated); `bind(target: { annotate })` tells everything held; `observed(path)` tells that path's held annotation again. Tell nothing while unbound. `src/main/rail-annotations.ts` (new) -- `railAnnotatorFor(sender)`: one per window, a `WeakMap` keyed by the sender object, the pattern of `src/main/persona-states.ts:15-43`.
- `src/main/projections/runs.ts:10-38` -- `RunProjection` gains `card(runId)`; `src/main/session-run.ts:99-110` `tell` applies each non-`persona:said` event to `service.runs`, then to `service.annotations.apply(event, card)` (the event's `runId`'s card), before it is emitted. `src/main/session-registry.ts:69-91,317-326` -- `Service` gains `annotations: RailAnnotator` = `railAnnotatorFor(sender)`.
- `src/main/rail-bridge.ts:62-104` -- after `createRailProjection`, `railAnnotatorFor(sender).bind(projection)`; in `onObservation`, after `projection.observe(observation)`, `railAnnotatorFor(sender).observed(observation.path)`. `registerRailBridge`'s deps, `src/main/index.ts` and `index.test.ts` do not change. The persona fold (`src/main/fold/persona-state.ts:139-151,163-186`) reads `row.owner` and the disk signature only: left alone.
- `src/renderer/ui/outputs/outputs.tsx:127` -- the owner name resolves from `row.annotation?.owner ?? row.owner`; `output-row.tsx` is untouched. `outputs.css:83-91` `.output-row-annotation` gains `max-width: var(--rail-annotation-max)`, `overflow: hidden`, `text-overflow: ellipsis`; `src/renderer/design/tokens.css` near `--rail-row-padding` (:454) gains `--rail-annotation-max:170px` (a width that fits the 348px rail beside the file name and the state). `tests/literal-guard.ts` bans literals elsewhere.
- Patterns for tests: `src/main/projections/rail.test.ts` (fake timers, `obs(...)`), `src/main/rail-bridge.test.ts:80-140`, `src/main/session-run.test.ts`, and `tests/persona-live-after-run.test.ts` (real session bridge and real rail bridge sharing one sender, a fake watcher, `fixtures/runs/*.jsonl`) with `tests/run-replay-multi-file.test.ts` (the `multi-file-sonnet` recording: addendum, pre-review copy, PRD, then `Edit`s of the PRD). `src/renderer/ui/outputs/output-row.test.tsx`, `outputs.test.tsx`. Guards: `tests/negative-surface.test.ts` (sweep style, comments stripped), `tests/outputs-contract.test.ts`, `tests/layering.test.ts` (fold may not import projections or sources).
- Read-only evidence: EXPERIENCE.md *Rail row (Outputs half)* (:208-218) and *Progress, batch commit and revision* (:237-241); ARCHITECTURE-SPINE.md :79; epics.md Story 3.6 (:1731) and FR49–FR51.

## Tasks & Acceptance

**Execution:**
- `src/shared/rail.ts` -- `RailAnnotation.owner?` -- the owner the stream names, additively
- `src/shared/section-progress.ts` (+ test) -- `sectionProgress`, `progressLabel` -- one definition of the section in flight and its words
- `src/renderer/ui/chat/prose-store.ts`, `run-status.ts` -- call the shared functions; behaviour and tests unchanged -- card head and rail cannot disagree
- `src/main/fold/rail-rows.ts` -- `annotate` and `toRows` carry `owner` -- the annotation's whole value crosses
- `src/main/fold/rail-annotations.ts` (+ test) -- the run-to-annotation fold -- what the stream says, as pure data
- `src/main/projections/runs.ts` -- `card(runId)` -- the fold's input
- `src/main/projections/rail-annotator.ts`, `src/main/rail-annotations.ts` (+ tests) -- the told-difference and the per-window holder -- the producer that replaces the stub
- `src/main/session-registry.ts`, `session-run.ts`, `rail-bridge.ts` -- `Service.annotations`, `tell`, `bind`, `observed` -- the wiring
- `src/renderer/ui/outputs/outputs.tsx`, `outputs.css`, `src/renderer/design/tokens.css` -- owner from the annotation first; the tag's width -- what the person sees
- `src/main/projections/rail.test.ts`, `src/main/rail-bridge.test.ts`, `src/main/session-run.test.ts`, `src/renderer/ui/outputs/*.test.tsx`, `tests/rail-annotation-replay.test.ts` (new: `multi-file-sonnet` through the real session and rail bridges), `tests/outputs-contract.test.ts`, `tests/negative-surface.test.ts` -- one test per matrix row, the two-channel guards (annotation never creates, removes or settles a row; `annotate` and `settle` stay separate), no denominator in any annotation text, the replay's subject-file section equals the card head's -- the matrix and the negative surface
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given a run in flight that has streamed text for a file whose row the watcher has made, then the rail row, as pushed and as drawn, carries the run's persona and `writing · §N <Name>` (or `revising · §N <Name>`), with the row's `state`, `savedAt` and `path` exactly what the watcher alone gave it.
- Given any run event (a commit, a terminal event, a note) and no watcher observation, then no row is made, removed or moved to `saved`; given the run ends, then its annotations are gone and the rows are otherwise unchanged.
- Given a file written by something the harness is not running, then its row is `changing` with no annotation and `saved` after the settle, and reads as complete.
- Given the real stream replacing the stub, then `OutputRow`, the rail projection's push rule, the persona fold, the preload and every bridge channel are unchanged.
- Given any annotation, then it names no total and no `of`, and a persona's own run still raises no `note`.
- Given the full suite, lint, typecheck and build, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass
- verdicts: 30 findings — high 0, medium 2, low 25, false 3, maybe-false 0 (four patch groups: the rail row's CSS, `medium`; the rejected write, the comments and the tests, all `low`; the rest rejected, three of them false)
- findings:
  - `[medium]` `[patch]` Blind: the tag is capped at 170px but the meta does not shrink and the name has `min-width: 0`, so beside an owner and a state the file name shrinks first and can collapse to an ellipsis, the opposite of what the CSS comment says — patched: `.output-row-name` has a floor (`--rail-name-min:56px`), `.output-row-meta` shrinks (`flex: 0 1 auto; min-width: 0`), so the tag, which already ellipsizes, gives way; the outputs contract test pins both tokens and both rules.
  - `[low]` `[patch]` Blind: the 40-code-point cap and the 170px CSS cap contradict each other, and the cap's comment says it fits the rail — patched: `NAME_MAX`'s comment now says the cap only bounds what crosses the bridge and the stylesheet fits the tag; the cut by grapheme rather than code point is rejected: the spec says code points, and a split emoji before an ellipsis is cosmetic.
  - `[low]` `[reject]` Blind: head and rail state can diverge after a mid-run reload (the store's `seed` rebuilds `seen` from the text and drops its revision; the rail keeps its first-seen order and `revising`) — a pre-existing property of the head, reached only by a reordering edit across a reload; the fix would have the rail forget what it saw. Recorded as a residual risk.
  - `[low]` `[reject]` Blind: a new row is pushed twice, first without the tag — `observe` flushes before `observed` re-tells; the two pushes are one tick apart, the rows end right, and holding the push would add a batching API to the projection, whose push rule the spec says stays. Recorded as a residual risk.
  - `[low]` `[reject]` Blind: the streaming guard (a last-line heading with no newline is not yet seen) is applied to a committed `Edit`'s complete text — the head applies the same guard to the same text after a commit, and the rail is meant to say what the head says; a document ending on a bare heading with no newline is rare.
  - `[low]` `[reject]` Blind: a finished `Write` keeps reading `writing` until the run ends, beside `saved` — the Always rule is "exactly while a run in flight holds text for it", the card head keeps `writing` the same way until a terminal event, and the two registers are the intent.
  - `[low]` `[reject]` Blind: the annotator is not isolated from the run's event path (a throw in the rail push would drop the event) — `personas.apply` sits on the same synchronous chain with no guard, `sendTo` is guarded for a destroyed window, and no throwing path was shown.
  - `[low]` `[reject]` Blind: avoidable work on hot paths (`observed` builds the whole map, `tell` recomputes labels, the fold rescans a document per piece) — main coalesces prose to at most ten pieces a second per run and a run holds a handful of paths; no cost shown to matter.
  - `[low]` `[patch]` Blind: doc comments contradict the code (the fold's header says the text is read from the card and never kept apart from it, `RailOwner` says "by its class") — patched: the fold's header now says the table keeps a copy of each path's text only to find where an `Edit` changed it, and `RailOwner`'s comment covers the annotation's owner too; that `HeldPath.text` duplicates the card's memory is false, it is the card's own string.
  - `[low]` `[reject]` Blind: duplicated, source-grep guard tests, sensitive to formatting — the repo's own pattern for its negative surface (Stories 1.14, 3.3, 3.5), and each guard names the file that fails.
  - `[low]` `[reject]` Blind: gaps in the annotator and holder tests (re-bind leaves the first target told, no unbind, a duplicate `run:started`, an `Edit` of an unheld path) — none is reachable (`bind` is called once per window, a duplicate start cannot come from `startRun`, the `Edit` case is the session-run test's); the owner-change gap is the Gap layer's row and is patched there.
  - `[low]` `[reject]` Blind: the replay covers one fixture and a finished run only — the spec names `multi-file-sonnet`; a rejected `Write`, a terminal path and two runs are covered by the fold, annotator and session-run tests.
  - `[low]` `[reject]` Blind: `outputs.test.tsx` asserts on incidental strings (`changing`, `status-dot`) — they are the row's own vocabulary and class, as the existing `output-row.test.tsx` asserts them.
  - `[low]` `[patch]` Edge: a rejected `Write` drops the path's whole held entry, including its `seen` names, which the head's `seenByPath` keeps, so a retry with other headings is numbered differently from the head — patched: a rejected `Write` marks the path's held entry `live: false`; its text and `seen` stay and `annotationsOf` skips it, and the path's next `doc:prose` piece or an applied `Edit` makes it live again (fold tests: a retry with other headings says `writing · §3 Risks`; an `Edit` after the rejection takes its offset from the held text).
  - `[low]` `[carried]` `[patch]` Edge: an applied `Edit` after a rejected `Write` starts from `seen []` and offset 0 — same root cause as the row above.
  - `[low]` `[reject]` Edge: a run ending with several annotated paths tells the rail once per path, so N pushes — same cause as the new-row push above; a projection batching API is beyond a direct correction.
  - `[low]` `[carried]` `[reject]` Edge: `observed` is pushed after the observation's own push — same as the new-row push above.
  - `[low]` `[reject]` Edge: the section name is cut by code point, splitting a ZWJ sequence — same as the grapheme half of the second Blind row.
  - `[low]` `[carried]` `[reject]` Edge: no try/catch around `service.annotations.apply` — same as the isolation row above.
  - `[low]` `[carried]` `[patch]` Edge (claim): the head and the rail cannot disagree, but a rejected `Write` deletes the names the head keeps — same root cause as the rejected-write row.
  - `[low]` `[carried]` `[reject]` Edge (claim): the first push after a run's end still carries other paths' tags — same as the N-pushes row.
  - `[medium]` `[carried]` `[patch]` Edge (claim): the 170px tag beside the owner and state leaves the name almost no width — same as the first Blind row.
  - `[low]` `[carried]` `[reject]` Edge (claim): after a reload a rewritten file's `§N` can differ between the head and the rail — same as the reload row above.
  - `[low]` `[patch]` Gap: the annotator re-tells a path only when its text moves, and `same()`'s owner comparison is pinned by no test (a mutation to compare text alone passes the suite) — patched: an annotator test drives two runs of different personas on one path under one label and expects the owner John, then the analyst, then John again once the later run ends (it fails when `same()` ignores the owner).
  - `[low]` `[patch]` Gap: numbering across a second `Write` of one path (`§3 Risks` after Vision, Goals, then Goals, Risks) is pinned by no test (resetting `seen` to `[]` passes) — patched: the fold test pins `writing · §3 Risks` after the second `Write`, and a replay-suite test (the layer rule keeps the prose store out of `src/main`) compares the fold's words with the prose store's `progressWords` for the same texts, with the first `Write` confirmed and rejected.
  - `[low]` `[carried]` `[patch]` Gap (other): a rejected `Write` drops the path's `seen` — same root cause as the rejected-write row.
  - `[false]` `[reject]` Intent: the commit and the closing bookkeeping (sprint status, epic context, the spec's status) are not in the diff — they are this run's finalize steps ("commit and close when done"), done after triage; the spec is excluded from the reviewed diff by design.
  - `[low]` `[reject]` Intent: the expectation lives at the live drawn row and the tests sit on main-side folds, a fake-watcher replay and static markup, with no run through a real window — the spec records the manual check as a residual risk, and an unattended run cannot make it.
  - `[false]` `[reject]` Intent: the watcher's path form and the route fold's `projectRelative` are never exercised against each other — both give project-relative POSIX paths (`watch-artifacts.ts:59`, `route-frame.ts:128-136`), the form `src/shared/rail.ts` names for a row's `path`.
  - `[false]` `[reject]` Intent: "no other part of the rail changes" against a diff that touches the shared type, the rail fold and the head's code — the intent is that the seam, the push rule, `OutputRow`, the persona fold, the preload and the channels stay as they are, and they do; `RailAnnotation` was left to be extended additively (Story 1.11), and the head's code only calls through, its tests unchanged.

## Design Notes

- **The owner lives in the annotation, not on the row.** `row.owner` is the class's and stays what persona states read; the session's owner is the stream's, so it rides in `annotation.owner` and the owner slot prefers it (FR51: session, else class, else nothing). Merging it into `row.owner` would make the stream write a watcher-side field and move `note`'s inputs.
- **Annotate-then-remake.** The text of a `Write` streams before the file exists, so the row is made after the first prose. The producer therefore holds what it would say and re-tells it on each observation of the path, rather than the projection holding annotations for rows it has not got: the projection stays as 1.11 built it.
- **One section in flight.** `sectionProgress` is the prose store's `settle` lifted into `shared/` so the head and the rail share it. Unlike the head, which revises only its subject, the rail revises per file: an applied `Edit` of any file the run holds text of reads `revising` for that file.
- **A rejected `Write` stops being said, not forgotten.** The matrix says a rejected write gives no annotation, and the Code Map first read "no news". Resolved to the matrix: a rejected commit of the call that set a path's text stops the path being annotated, but its held text and `seen` names stay, as the card head's do, so a retry is numbered as the head numbers it. A rejected `Edit` changes nothing.
- **Held for later stories:** `stopped` on the row and failure legibility (3.8), contention (3.9), notifications (3.10), the stop control (3.7).

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Start a run for John in a project, open the rail: while he revises a file its row shows `revising · §N <Name>` beside his name and `changing`, and on his run's end the tag goes and the row reads `saved`. An unattended run cannot do this; record it as a residual risk.

## Auto Run Result

**Summary.** A run in flight now annotates the rail rows of the files it holds text for. Main folds the run's `doc:prose` and applied-`Edit` commits into one annotation per file: the run's persona (`owner`) and `writing · §N <Name>`, or `revising · §N <Name>` while an applied `Edit` stands, in the card head's own words and numbering (one shared `sectionProgress` and `progressLabel`, which the prose store and the head now call). A per-window annotator hands each to the rail projection's existing `annotate` seam, tells it again after every watcher observation of the path (the row of a new file is made after its text streams), and drops a run's annotations on its terminal event. Disk `state`, `savedAt`, `path` and the class's `owner` still come from the watcher alone: no run event creates, removes or settles a row, a file written by an editor or a terminal `claude` shows `changing` with no annotation, and a persona's own run still raises no `note`. The row's owner slot prefers the annotation's owner, then the class's, then nothing. The section name is bounded to 40 code points, and the tag ellipsizes in CSS while the file name keeps a floor.

**Files changed.** New: `src/shared/section-progress.ts` (`sectionProgress`, `progressLabel`, `commonPrefix`), `src/main/fold/rail-annotations.ts` (the pure fold), `src/main/projections/rail-annotator.ts` (the producer), `src/main/rail-annotations.ts` (the per-window holder), their tests, and `tests/rail-annotation-replay.test.ts` (`multi-file-sonnet` through the real session and rail bridges). Edited: `src/shared/rail.ts` (`RailAnnotation.owner?`), `src/main/fold/rail-rows.ts` (`annotate` and `toRows` carry the owner), `src/main/projections/runs.ts` (`card(runId)`), `src/main/session-registry.ts`, `session-run.ts`, `rail-bridge.ts` (the wiring), `src/renderer/ui/chat/prose-store.ts` and `run-status.ts` (call the shared functions, tests unchanged), `src/renderer/ui/outputs/outputs.tsx`, `outputs.css` and `src/renderer/design/tokens.css` (owner from the annotation first; the tag's cap and the name's floor), tests in `rail-rows`, `rail`, `runs`, `rail-bridge`, `session-run`, `outputs`, `tests/layering`, `tests/negative-surface` and `tests/outputs-contract`; `sprint-status.yaml` (3.6 `done`) and `epic-3-context.md` (3.6 marked done).

**Review.** 30 findings: patches applied 4 groups (the rail row's name floor and shrinking meta, `medium`; a rejected `Write` keeps its held names but is not shown, the comments, and two missing tests, `low`); deferred 0; the rest rejected with reasons in the log (false 3, low 25 in all, medium 2). Patched by verdict: high 0, medium 1, low 3. The matrix audit also moved one thing before review: the matrix says a rejected write gives no annotation, which the first implementation did not do for a rejected `Write` whose text had streamed; the code was fixed to the matrix (Design Notes).

**Follow-up review recommended: false.**

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` unit 141 files, 3130 tests passed, watchers 3 files, 55 tests passed; `npm run build` exit 0. Run before review and again after the patches. Matrix audit: every I/O row has a covering test that ran (`rail-annotations.test.ts`, `rail-annotator.test.ts`, `rail-bridge.test.ts`, `session-run.test.ts`, `outputs.test.tsx`, `tests/rail-annotation-replay.test.ts`).

**Residual risks.**
- Not seen in a real window: no live run was made. How the tag, the owner and the state share a 348px row, and the tag's ellipsis against the name's floor, rest on CSS and static-markup tests, which cannot check layout.
- A new row is pushed twice in one tick, first without the tag and then with it, and a run ending with several annotated files tells the rail once per file, because the projection flushes on each `annotate`; batching would change the projection's push rule.
- After a window reload mid-run the head rebuilds its `seen` from the text and drops its revision, while main keeps first-seen order and `revising`, so in a reordering edit across a reload the head's `§N` or verb can differ from the rail's.
- A finished `Write` keeps its `writing` tag beside `saved` until the run ends, as the head keeps `writing`; an `Edit` of a file no `Write` of the run started has no annotation, the stream holding no text of it.
- Where two runs hold one path the later-started run's annotation shows; contention (both owners) is Story 3.9's, and `stopped` on the row is Story 3.8's.
