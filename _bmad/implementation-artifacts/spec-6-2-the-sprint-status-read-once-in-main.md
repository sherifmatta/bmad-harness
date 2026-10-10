---
title: 'The sprint status, read once in main'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '449589af5a9a50bebe86e1cdfc952335e453cb6e'
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every Board region (Stories 6.3 to 6.8) needs the project's `sprint-status.yaml`, and nothing parses it: `src/main/fold/artifact-owner.ts` records its format and that no consumer exists.

**Approach:** One pure fold turns the file text into a snapshot, one source reads that file, and one bridge pushes `board:changed` and answers `board.get`, so the Board draws from a single reading. No view in this story.

## Boundaries & Constraints

**Always:** Fold in `src/main/fold/` reads no file, clock or environment. Reader in `src/main/sources/` opens only `sprint-status.yaml`; `epics.md` is read only for titles, by the existing `readText`. The rail watcher stays stat-only. Nothing is written into the project, ever. Both new names are declared once in `src/shared/`, enumerated in `src/shared/channels.ts`, pinned in contract tests; no generic `invoke`. `layering.test.ts` passes. No new dependency (no YAML library).

**Never:** Parse timestamps, `action_items` or any top-level key but `development_status`. Complete a cut-short slug. Consult story front matter. Show or count retrospective keys. Throw on an odd key or status. Add a view, a `ui/` file or any renderer consumer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal file | `epic-1`, `1-1-slug`, `epic-1-retrospective` | epics in file order, stories in file order with key, `N.M`, status, title; retro attached, unshown | N/A |
| Odd key | `foo`, `1-x`, story with no epic row | kept as an unrecognised row | never throws |
| Odd status | `blocked` | carried as written, `known: false` | N/A |
| Title found | `### Story 6.2: The sprint…` in epics.md | heading text, `Story N.M:` stripped | N/A |
| Title missing | no epics.md or no heading | key's slug, hyphens as spaces, uncut and uncompleted; an epic with no heading has `''` | N/A |
| No usable file | absent / unreadable / empty / not a map | `none` with one `code` and `message` | no dialog, no stack |
| File appears or changes | write under the output folder | one `board:changed` per differing snapshot; `board.get` current | N/A |

</frozen-after-approval>

## Code Map

- `src/shared/board.ts` -- NEW. `BoardSnapshot` (`revision` + `kind: 'read' | 'none'`), `BoardReply`.
- `src/shared/events.ts`, `channels.ts` -- add `board:changed` event (17th) and `BOARD_GET_CHANNEL`, `BOARD_CHANGED_CHANNEL` (35th, 36th).
- `src/preload/index.ts`, `harness-api.d.ts` -- `getBoard`, `onBoardChanged` (23rd, 24th), like `getRail`/`onRailChanged`.
- `src/main/fold/epic-titles.ts` -- NEW pure: `## Epic N:` and `### Story N.M:` headings, fenced code skipped, first wins.
- `src/main/fold/sprint-status.ts` -- NEW pure: flat-map line parse of `development_status`, key shape, statuses, titles.
- `src/main/sources/project/read-sprint-status.ts` -- NEW: opens that one file; absent vs unreadable by errno.
- `src/main/projections/board.ts` -- NEW: revision, dedupe by content, baseline first, push after.
- `src/main/board-bridge.ts` -- NEW: per-window service on first ask; re-read on an observation of either path or a folder move, quiet-window coalesced; `observeArtifact` hook.
- `src/main/rail-bridge.ts`, `index.ts` -- unchanged bridge; `index.ts` registers the board bridge and chains its hook onto `observeArtifact`.
- `src/main/sources/project/read-text.ts`, `src/main/rail-bridge.ts` -- reuse, do not change.
- Pinned counts move (commands 8, events 16→17, channels 34→36, methods 22→24): `tests/channels-contract.test.ts`, `tests/negative-surface.test.ts`, `tests/party-contract.test.ts`, `tests/bridge-contract.test.ts` (tie), plus any test `tsc` or the suite names.
- `_bmad/planning-artifacts/epics.md` (FR101, tally row), `ARCHITECTURE-SPINE.md` AD-3 -- amend the tally.
- `fixtures/sprint-status/sprint-status.yaml`, `epics.md` -- committed copies of this repo's own files.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/board.ts`, `events.ts`, `channels.ts`, preload -- declare the contract and bridge methods -- AC bridge
- [x] `src/main/fold/epic-titles.ts` + test -- title map -- AC titles
- [x] `src/main/fold/sprint-status.ts` + test -- the snapshot, per the matrix -- AC fold, statuses, none
- [x] `src/main/sources/project/read-sprint-status.ts` + test -- reader; test asserts bytes and mtime unchanged
- [x] `src/main/projections/board.ts` + test -- revision and push rules
- [x] `src/main/board-bridge.ts` + test, `index.ts` -- service, coalescing, appearance later, window gone
- [x] fixture + `src/main/fold/sprint-status.fixture.test.ts` -- epic and story counts of the committed copy, citing `_bmad/implementation-artifacts/sprint-status.yaml`
- [x] pinned tests and planning docs -- change the numbers, not the intent

**Acceptance Criteria:**
- Given the committed fixture, when folded, then its epic and story counts are asserted and the cited live path is named in the test.
- Given a write to the file, then one `board:changed` carries the new snapshot, and `board.get` after a reload answers the same revision.
- Given the file absent at first and written later, then the snapshot fills with no restart.
- Given the reader's whole life, then the file's bytes and mtime are unchanged.

## Implementation Notes

- Built directly from the spec, test first per file; no subagent for the build.
- `SprintStatusRead` lives in `src/shared/board.ts` because `sources/` may not import `fold/`.
- An epic with no heading in `epics.md` has title `''`: its key has no slug, and none is invented.
- Unreadable and absent are told apart by errno (`ENOENT`, `ENOTDIR` are absent). A reading that throws, which the real reader never does, answers `board/unreadable`, not `board/no-project`.
- The Board learns of a write through the rail bridge's existing `observeArtifact` hook, chained in `index.ts`; the rail watcher is unchanged and still stats only.
- `fixtures/sprint-status/` holds a copy of this repository's `sprint-status.yaml` as of the Epic 6 start and the heading lines of `epics.md` (76 lines, not the 3600-line file).
- Pinned counts moved to eight commands, seventeen events, thirty-six channels, twenty-four methods in seven test files. FR101 and AD-3 amended. The `epics.md` edit makes `epic-6-context.md` stale; it is recompiled at the next story's start.
- Verified: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all clean.

## Spec Change Log

## Review Triage Log

- medium, fixed: a start that failed (`handle.refresh()` rejecting) stayed cached, so every later `board.get` failed. The service is now dropped as the rail's is.
- medium, fixed: a reading that threw left no snapshot, and `board.get` answered `board/no-project`. It now answers `none`, `board/unreadable`.
- medium, fixed: `index.ts` forwarding and its `outputFolder` argument had no test. Added to `src/main/index.test.ts`.
- medium, fixed: the real-project test's diagnostics assertion could not fail, and it never proved an observation causes a re-read. Rewritten around a push.
- low, fixed: BOM made a valid file `not-a-map`; a deeper-indented line became a bogus sibling key; a duplicate epic number, key or retrospective was silently dropped. All three covered by tests.
- low, fixed: `artifact-owner.ts` still said nothing reads the file.
- low, deferred: orphan retrospective surfaces in `others`; no max-wait on the quiet window; sharded `epics.md`.
- false: fixtures missing from the diff (excluded from the staged diff on purpose); window project path changing under one id (one project per window, FR17); folder without trailing slash (the resolver always ends it with `/`); no watcher-to-bridge test (the rail already lists files at any depth under the folder).
- rejected low: nested-fence tracking and an empty first heading (rare, fix adds branches); stat-before-read cap and FIFO (the project's own file); a throw in the forwarding hook (nothing in it throws); `code` as a literal union (cosmetic).

## Design Notes

Paths are relative to the window's output folder `F`: `F`+`implementation-artifacts/sprint-status.yaml` and `F`+`planning-artifacts/epics.md`. The observation hook already carries project-relative POSIX paths, so the bridge compares strings and opens nothing the rail knew of.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass
