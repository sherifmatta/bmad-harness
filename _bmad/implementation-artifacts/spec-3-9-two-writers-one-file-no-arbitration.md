---
title: 'Two writers, one file, no arbitration'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_revision: 'f6eed25f779f4755fbdae363afdc51405bb35b48'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      A change to a held path made by a writer outside the harness (an editor, a terminal `claude`) is not reported as contention, though AD-12 says an external writer's collision with a running persona is reported.
    evidence: |-
      The watcher observation carries only path, size and mtime, never a writer, and Story 3.13's own-run suppression already treats a change to a path a run holds as the run's own, so the harness cannot tell an editor's save from the run's write. A second owner could not be named without guessing one, which FR51 forbids, and `epic-3-context.md` states that an externally edited file shows `changing` with no annotation. A reliable rule would need a way to attribute a watcher change to a writer (for example matching each run write to the observation it causes); that is a design decision for the epic's owner, not a patch.
    location: >-
      src/main/fold/rail-annotations.ts annotationsOf
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Two personas can run at once and write the same file (`bmad-correct-course` touches the PRD, epics, architecture and UX while another persona is running). Today `annotationsOf` keeps only the later-started run's annotation for a path, so the rail row says one persona is writing and the other writer is silently dropped. FR92 asks the row to name the contention and both owners, and the harness to do nothing else about it.

**Approach:** Report only. `annotationsOf` (the stream's channel) reads a path held live by two or more runs that have not ended as one annotation, the word `contention` and the owners it knows, carried on a new optional `owners` field of `RailAnnotation`. The row's owner slot names all of them. Nothing is prevented, resolved or undone, and no command, event, channel or bridge method is added: the absence is pinned by guards.

## Boundaries & Constraints

**Always:** The stream is the only source of the annotation and the watcher the only source of the row's disk state; contention touches neither disk field. A path is contended only while two or more runs that have not ended hold it live (a rejected `Write` is not holding). Owners are agent ids in run start order, deduplicated, and only those a run carries: an absent id is never guessed, and the class owner never stands in for a contended row's owners. The word is spelled once, `CONTENTION` in `src/shared/section-progress.ts` beside `STOPPED`. The annotation's text carries no section, count or denominator. A run that ended early lets go of a path another run is still writing, as it already does for a path a later run takes (`withPath`), so a dead run's word never resurfaces beside a live writer's.

**Never:** No lock, revert, patch, restore, merge, choice or undo, and no dialog or control for any of them. No new command, event, channel or preload method (the counts stay 7, 15, 21 and 16). No write-capable filesystem call added anywhere in `src/main`. No claim about who wrote last: the harness does not know, and says only who is writing. No clock or timer in the fold. No detection of an outside writer (an editor, a terminal `claude`): the watcher says a path changed, never who changed it, so a second owner could not be named and a change to a held path during a run is already treated as the run's own (Story 3.13). Not a notification (3.10).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two personas, one path | r1 (John) and r2 (Mary) both streaming `prd.md` | `prd.md` row annotation `{ text: 'contention', owners: [John, Mary] }` in start order, no `owner`; the row's disk state is untouched | No error expected |
| Different paths | r1 writes `prd.md`, r2 writes `brief.md` | each row keeps its own `writing · §N <Name>` and single `owner` | No error expected |
| A third run joins | r3 also writes `prd.md` | `owners` lists all three | No error expected |
| One holder ends | contended path, r2 finishes | `prd.md` reads r1's `writing · §N` / `revising · §N` again; once r1 finishes the annotation is gone | No error expected |
| One holder stopped or failed | contended path, r2 stopped | r2 lets the path go (a live run holds it); r1's annotation alone; after r1 finishes the row reads clean, not `stopped` | No error expected |
| Rejected write | r2's only `Write` of the path is rejected | r2 is not holding the path: no contention | Rejected call is named as today |
| Run with no persona | one holder has no `agentId` | contention still reported; `owners` lists the ids that exist, possibly none | A row with no resolvable owner draws no owner slot |
| Several artifacts at once | r1 writes addendum, pre-review and PRD; r2 writes the addendum only | only the addendum is contended; the other two keep r1's `writing` | No error expected |
| Roster lacks an owner | an `owners` id is not in the install | the other names are drawn; a missing one is not replaced | Nothing is drawn for an id the roster lacks |

</intent-contract>

## Code Map

- `src/main/fold/rail-annotations.ts:56-72,85-105,161-175,184-204` -- `HeldPath`/`RunHeld`/`withPath`. `annotationsOf` (`:189`) builds one annotation per path, stopped runs first then live ones, so the later-started live run overwrites; the `:184-187` comment says "naming both is contention's, not this fold's" and is the placeholder to replace. After the existing loop, find paths with two or more non-stopped runs holding them live and overwrite each with `{ text: CONTENTION, owners }`. The `run:stopped`/`run:failed` case (`:161-175`) keeps each live path of the run: drop a path another non-stopped run still holds live, so the run is left holding fewer paths (deleted when none). Update the header comment (`:12-42`) and the `annotationsOf` doc.
- `src/shared/section-progress.ts:82-85` -- `STOPPED`, `TerminalWord`. Add `export const CONTENTION = 'contention'` beside them with the doc comment that it is the rail's one word for two writers.
- `src/shared/rail.ts:32` -- `RailAnnotation = { text; owner? }`. Add `owners?: readonly RailOwner[]`: present only on a contention annotation, which then has no `owner`. Wire type only; `owner` is the single-run field.
- `src/main/fold/rail-rows.ts:42-44` -- `carried({ text, owner })` copies only those two fields and is used by `annotate` (`:113`) and `toRows` (`:145`); `owners` would be dropped here, so copy it (a fresh array of fresh objects).
- `src/main/projections/rail-annotator.ts:39-41` -- `same(a, b)` compares `text` and `owner?.agentId` only; add `owners`, or a change from `[John, Mary]` to `[John, Mary, Sally]` is never pushed. `tell()`/`observed()` need no change.
- `src/renderer/ui/outputs/outputs.tsx:93,124-130` -- `ownerId = row.annotation?.owner?.agentId ?? row.owner?.agentId` and `ownerName={nameOf.get(ownerId)}`. Move the choice into a new pure `src/renderer/ui/outputs/owner-label.ts` (`ownerLabel(row, nameOf)`): a row whose annotation has `owners` names those through the roster (skip ids the roster lacks, join `A and B` / `A, B and C`, `undefined` when none) and never falls back to the class owner; any other row is the existing rule. `output-row.tsx:85-88` already draws `annotation.text` and one owner string; no change there.
- Already satisfied, to be pinned rather than built: `src/shared/commands.ts:26-51` (seven commands), `src/shared/events.ts:186-210` (fifteen), `src/shared/channels.ts` (twenty-one), `src/preload/index.ts` (sixteen methods), the harness's only filesystem writes (`src/main/sources/persistence/transcript-file.ts:225,230`, its own transcript, never the project) and its only dialog (`src/main/windows/choose-project.ts:74`, choosing a folder).
- Tests to amend with the fold: `src/main/fold/rail-annotations.test.ts:320-336` (`of a later run never masks an earlier one still writing the same path`: both runs write the path, so it is now contended until r2 ends) and `:365-376` (`two runs holding text for one path`: the later-started rule is now contention), `src/main/projections/rail-annotator.test.ts:114` (same comment, same assertion), `tests/negative-surface.test.ts:1731-1745` (the guard that bans `contention`, `contend` and `both owners` in the fold, annotator, holder and `section-progress.ts`; relax it for the one word, as 3.8 did for `stopped`, and keep `Notification`, `conflict` and the rest banned).
- Replay harnesses to copy: `tests/rail-annotation-replay.test.ts:30-215` (`replay()`: real `registerSessionBridge` and `registerRailBridge` with a fake `spawn` capturing `onFrame` and a fake `watch` capturing `onObservation`, fake timers, the window's own prose store) for one session; this story needs two sessions in one window, so the new test builds the same harness with a `feeds[]` of per-session children. Fixture: `fixtures/runs/multi-file-sonnet.jsonl` (three `Write`s, the PRD last, then `Edit`s) and its `.meta.json` (`cwd`, `turns[0].text`).
- Read-only evidence: `_bmad/planning-artifacts/epics.md:1865-1887` (Story 3.9, FR92), `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md:216,396-402`, `_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md:150-154` (AD-12), `_bmad/implementation-artifacts/epic-3-context.md`, `src/main/fold/persona-state.ts:130-137` (`ownRunAt`: why an outside writer is not told apart), `tests/negative-surface.test.ts:20-130,373-385,1759-1762` (sweep helpers and the no-new-command idiom), `tests/contract.test.ts:117`, `tests/channels-contract.test.ts:34`.

## Tasks & Acceptance

**Execution:**
- `src/shared/section-progress.ts` -- add `CONTENTION` beside `STOPPED` -- one spelling of the word
- `src/shared/rail.ts` -- add `owners?` to `RailAnnotation` with its doc -- the wire shape for two or more owners
- `src/main/fold/rail-annotations.ts` -- contention in `annotationsOf`; stop-time release of a path a live run still holds; comments -- the stream's report
- `src/main/fold/rail-rows.ts`, `src/main/projections/rail-annotator.ts` -- `carried` copies `owners`; `same` compares them -- so the report reaches the row and a change in it is pushed
- `src/renderer/ui/outputs/owner-label.ts`, `outputs.tsx` -- name every owner of a contended row from the roster -- the rail names both owners
- `src/main/fold/rail-annotations.test.ts`, `rail-annotator.test.ts`, `rail-rows.test.ts`, `src/renderer/ui/outputs/outputs.test.tsx`, `owner-label.test.ts` -- unit tests for every row of the I/O matrix, and amend the two later-started-run tests
- `tests/contention-replay.test.ts` -- two personas' sessions in one window replaying `multi-file-sonnet` offset by a file, through the real session and rail bridges -- contention appears only on the paths both hold, nothing is prevented, and the disk state is still the watcher's
- `tests/negative-surface.test.ts` -- relax the 3.8 guard for the one word; add a Story 3.9 block: no resolve, merge, revert, lock, restore, undo, patch, edit or pipeline name in the contract files, the preload or any `ipcMain.handle` channel; no dialog, confirm or alert in the renderer and no Electron dialog in `src/main` outside `windows/choose-project.ts`; no write-capable filesystem call in `src/main` outside `transcript-file.ts` -- the absence is the design
- `_bmad/implementation-artifacts/sprint-status.yaml`, `epic-3-context.md` -- mark 3.9 done at the end

**Acceptance Criteria:**
- Given two personas' runs that have not ended both streaming the same file, when the rail reads that row, then its annotation is `contention` and its owner slot names both personas, while its disk state is whatever the watcher last said.
- Given contention on a path, when one of the runs ends or stops, then the path reads the remaining run's `writing` or `revising` annotation, and when that run finishes the row carries no annotation.
- Given a skill that writes several files while another persona writes one of them, when both run, then only the shared file reads `contention` and the others keep the single run's annotation.
- Given contention, when the runs continue, then every write of both runs is committed as it is today, neither session receives anything from the harness it did not send (no interrupt, no kill, no refusal to dispatch), and the harness writes nothing to the project.
- Given the product's surface and bridge, when swept, then no dialog, control or name for resolving, merging, choosing, undoing, reverting, locking, restoring, patching, editing or navigating a pipeline exists, and the command, event, channel and bridge-method counts are unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-05 — Review pass
- verdicts: 23 findings — high 0, medium 2, low 17, false 4, maybe-false 0
- findings:
  - `[low]` `[reject]` Spec status `in-review` contradicts the `done` marks and nothing records the verification — `false` in substance: `in-review` is this step's own state, the commands are run and recorded under Auto Run Result, and Finalize writes `done`; the sprint-status and epic-context ticks are the story's close and are reverted if review blocks.
  - `[medium]` `[defer]` The outside-writer case (an editor, a terminal `claude`) has no tracked follow-up and stays silent — real, but not caused by this story (no contention report existed before) and excluded by the intent as it stands: the watcher carries no writer, FR51 forbids guessing an owner so "both owners" could not be named, and `epic-3-context.md` says an externally edited file shows `changing` with no annotation. Recorded in `deferred` with what would settle it.
  - `[low]` `[patch]` "Contention" reads as if both runs were writing now, but the fold reports it while two runs that have not ended both hold the path, however long ago one last wrote it — confirmed; this is the same holding rule the single-run `writing` annotation already follows, so the behaviour stays and the comments now say it (`rail-annotations.ts`, `rail.ts`, `section-progress.ts`), and a new fold test pins that holding does not age.
  - `[low]` `[reject]` Contention can name one person or nobody (the same persona twice, a run with no persona, an owner the roster lacks) — two runs of one persona cannot overlap (one session per persona, one turn at a time), persona-less runs come with party mode (Epic 4), and a vanished agent is the orphan case; the spec's matrix states each result and the harness never guesses an owner, so the fix (new copy such as "and another") adds a branch and vocabulary the epic does not ask for.
  - `[low]` `[reject]` A stopped run releases a path another live run holds, so its `stopped` word is lost if that run's write is later rejected or when both stop — the same rule as 3.8's eviction applied once more, pinned by the stop-time tests; the loss needs a rejected write after a stop on one shared file, and a masked-hold fix adds a third state to the table.
  - `[low]` `[reject]` `RailAnnotation` allows `owner` and `owners` together, and the fields are copied by hand in `carried`, `same` and `ownerLabel` — the fold never makes both, `outputs-contract.test.ts` pins the type verbatim, and the same hand-copying already served `text` and `owner`; a union and a shared helper are refactors no caller needs yet.
  - `[low]` `[reject]` The owner slot has no width cap and `contention` has no explanation — the rail is 348px, a pair of long persona names fits and only the longest pair or a three-way collision squeezes the name to its floor or clips the tag; a cap needs a new token and a choice of which element yields, which is the design system's, and a tooltip is banned by the 3.6 guard. Recorded as a residual risk.
  - `[low]` `[patch]` The replay's assertions pass too easily (`continue` over an existing unannotated row, `?? { agentId: ANALYST }`) — confirmed; fixed: a row that exists with no annotation must have no holders by the told events, the "Mary alone" loop reads the owner only where the annotation exists and requires at least one annotated step. The oracle ignoring rejected writes is harmless here: every write in the recording is accepted.
  - `[low]` `[reject]` The replay is rebuilt in each `it` and tied to the fixture's length — eight replays run in well under a second together with the rest of the file, and the fixture's length is the recording's own.
  - `[low]` `[reject]` The new guards are brittle, and the 7/15/21/16 counts repeat `contract.test.ts` and `channels-contract.test.ts` — the spec asks for the counts by name, each guard fails by naming the file it found, and the sweeps match this repo's established guard style.
  - `[low]` `[reject]` The permanent spec carries line numbers the diff makes stale, and `epic-3-context.md` is only ticked — the fix is to edit this build's spec, and ticking the story is what 3.8 did.
  - `[low]` `[reject]` `joined()` is a hand-rolled English list and two roster entries with one display name would read "John and John" — roster names are the install's persona names, one each; `Intl.ListFormat` would change the strings the tests pin.
  - `[low]` `[reject]` Edge hunter, stop-time release is irreversible and order-dependent — same ground as the fifth row.
  - `[low]` `[patch]` Edge hunter, the row reads `contention` naming a persona that is not writing now — same ground and same fix as the third row.
  - `[low]` `[reject]` Edge hunter, the owner string has no width cap — same ground as the seventh row.
  - `[low]` `[reject]` Edge hunter, one name or none beside `contention` — same ground as the fourth row.
  - `[low]` `[patch]` The annotator's push check never sees a reorder of the owners list (a length-only `sameOwners` passes every test) — confirmed by mutation; fixed: a test with r1 (pm), r2 (analyst), r3 (pm) ends r1 and expects the annotator to tell `[analyst, pm]`, and it fails against a length-only `sameOwners`.
  - `[low]` `[patch]` The test titled "tells a path again when only its owner moves" no longer asserts that — confirmed; renamed to what it asserts (contention begins and ends). The `owner` clause of `same` is unreachable through the fold, so no further test was added.
  - `[medium]` `[defer]` Intent audit: the outside-writer reading of AD-12 is excluded by design — same ground, same deferred entry as the second row.
  - `[false]` `[reject]` Intent audit: "last writer wins" is never asserted as a product statement — the criterion's behaviour is that the harness arbitrates nothing, pinned by the replay (every write of both runs committed, no session sent anything it did not send, the project untouched) and the guards; the harness cannot know who wrote last and says nothing of it.
  - `[false]` `[reject]` Intent audit: "commit and close" shows only partly in the diff — the commit and the spec's `done` are Finalize's, run after this triage.
  - `[low]` `[reject]` Intent audit: the user-visible surface is approximated by a fake-driven bridge replay and a string-rendered tree — true and unavoidable unattended; the spec's manual check names it, and it is recorded as a residual risk.
  - `[false]` `[reject]` Intent audit: the absence criterion is pinned by source-shape guards, not behaviour — an absence has no behaviour to observe; the guards pin the surface and the replay pins that the harness acted on nothing.

## Design Notes

- **Contention means two runs, because two is what can be named.** The watcher carries a path, a size and an mtime, never a writer, and Story 3.13 already treats a change to a held path during a run as the run's own. So the harness cannot tell an editor's save from the run's own write, and an unnamed second writer could not satisfy "names both owners" without guessing an owner, which FR51 forbids. EXPERIENCE names the trigger as another persona running. The outside-writer reading of AD-12 is left out, on purpose, and recorded as a residual.
- **The report lasts as long as both are writing.** Nothing in the epic gives it a lifetime, and a fold with no clock cannot age it out. It follows the runs: when either ends, the path is the survivor's again. The filesystem has decided the file by then, and the row's disk state, the watcher's alone, says so.
- **`owners` beside `owner`, not instead of it.** `owner` stays the single-run field every other annotation uses; a contention annotation has `owners` and no `owner`, so a reader that only knows `owner` shows no owner for it rather than a wrong one, and the renderer never lets the class owner stand in.
- **Release at stop is the 3.8 rule applied once more.** A run that ends early while another still writes the path would otherwise keep a dead `stopped` hold beneath the live one and resurface when the live run finished.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Run two personas' skills at once on the same file: the rail row reads `contention` with both names, the file on disk is whichever wrote last, and nothing offers to resolve it. An unattended run cannot do this; record it as a residual risk.

## Auto Run Result

**Summary.** When two personas' runs that have not ended both hold one file, the rail row now reads `contention` and its owner slot names both personas, instead of silently showing only the later-started run. The stream's annotation channel carries it: `annotationsOf` overwrites any path two or more runs that have not ended hold live with `{ text: 'contention', owners }` (owners are agent ids in run start order, once each, only those a run carries), the wire type gains an optional `owners` beside `owner`, `carried` copies it and the annotator's `same` compares it so a change in it is pushed, and a new pure `ownerLabel` names every owner from the roster (`A and B`, `A, B and C`), skipping one the roster lacks and never letting the class owner stand in. A run that stops or fails lets go of a path another live run still holds, so its `stopped` word never resurfaces after the live run finishes. Nothing is prevented or resolved and nothing new crosses the bridge: guards pin the counts (7 commands, 15 events, 21 channels, 16 preload methods), the absence of any resolve, merge, revert, lock, restore, undo, patch, edit or pipeline name, of any dialog outside the folder chooser, and of any write-capable filesystem call in `src/main` outside the harness's own transcript. A replay of `multi-file-sonnet` by two personas' sessions through the real session and rail bridges shows contention on exactly the paths both hold, every write committed, no session sent anything it did not send, the project untouched, and every row's disk state equal to a rail that heard only the watcher.

**Files changed.** New: `src/renderer/ui/outputs/owner-label.ts` and `.test.ts`, `tests/contention-replay.test.ts`. Edited: `src/shared/section-progress.ts` (`CONTENTION`), `src/shared/rail.ts` (`owners?`), `src/main/fold/rail-annotations.ts` (contention, stop-time release, comments), `src/main/fold/rail-rows.ts` (`carried`), `src/main/projections/rail-annotator.ts` (`same`), `src/renderer/ui/outputs/outputs.tsx` (the owner slot through `ownerLabel`), and the tests those touch: `rail-annotations.test.ts`, `rail-rows.test.ts`, `rail-annotator.test.ts`, `outputs.test.tsx`, `tests/negative-surface.test.ts` (the 3.8 guard now bans `contend` and the word is pinned to one spelling; a Story 3.9 block), `tests/outputs-contract.test.ts`; plus `sprint-status.yaml` (3.9 `done`) and `epic-3-context.md` (3.9 marked done).

**Review.** 23 findings from four layers: high 0, medium 2, low 17, false 4. Patched (5 rows, all low, in four fixes): the comments now say the report lasts while two runs that have not ended both hold the path, with no recency test, and a fold test pins that holding does not age; the replay's two weak assertions are tightened; a test pins that the annotator tells a reorder of the owners; a stale test title is renamed. Deferred (2 rows, one entry in `deferred`): an outside writer's collision with a run is not reported. Rejected with recorded reasons: one-or-no-name labels, the stop-time release losing a `stopped` word in two rare orders, the type and copy-by-hand structure, the owner slot's width, the replay's cost, the guards' brittleness, the spec's line numbers, `joined()`, and the four intent-audit observations (status mid-flight, "last writer wins" as a statement, real-window evidence, source-shape guards).

**Follow-up review recommended:** false. One first pass; patched entries by verdict: high 0, medium 0, low 5.

**Verification performed.** After the patches: `npm run lint` exit 0 with no warnings; `npm run typecheck` exit 0; `npm test` exit 0 (unit 152 files, 3423 tests; watchers 3 files, 55 tests); `npm run build` exit 0. Every row of the I/O matrix is covered by a test that ran in that run: two personas on one path, different paths, a third run, one holder ending, one stopped or failed, a rejected write, a run with no persona, several artifacts at once (fold tests and the replay), and a roster that lacks an owner (`owner-label.test.ts`, `outputs.test.tsx`). Mutation checks by the implementer and by the verification-gap reviewer: the contention threshold, the stop-time release and a length-only `sameOwners` each fail a test.

**Residual risks.**
- Two real personas running at once in a live window, with the real CLI and watcher, was not observed; everything above is a replay of recorded frames and rendered markup. Run it once by hand.
- An outside writer's collision with a running persona is not reported (deferred, with the reasoning).
- A contended row names more text than a single-run row: at the 348px rail the longest pair of persona names, or three personas, can squeeze the file name to its floor or clip the `contention` tag. Check in a live window; a width cap is a design-system decision.
- A run holds a path from its first piece of it until its run ends, so `contention` can name a persona whose last write to the file was long ago but whose run is still in flight, exactly as the single-run `writing` annotation already would.
- The report lasts only while both runs hold the path: when either ends, the row reads the survivor's annotation and then nothing, and a path two stopped runs shared keeps one `stopped` word for the later one.
- A contended row shows fewer names than writers when an owner is missing from the roster, the same persona runs twice, or a run has no persona; it never guesses one.
