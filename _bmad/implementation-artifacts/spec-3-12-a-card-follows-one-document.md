---
title: 'A card follows one document'
type: 'feature'
created: '2026-10-03'
status: 'done'
baseline_revision: 'b84be91f9c8989d6aed4d5ebb33060e44106dfa5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/sprint-change-proposal-2026-10-03-beat-judgement.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A real run writes several files (addendum, pre-review copy, PRD) and revises by `Edit`. The card has one buffer: its head path and body follow whichever file was touched last, an `Edit` replaces the visible text with its fragment, and `N sections` is the union of headings across every file. The live judgement saw the PRD on the card for under 8 of 57 minutes and `25 sections` for a 19-section PRD (FR32, FR35, FR37, FR47).

**Approach:** The card keeps one document buffer per path and shows exactly one, its subject: the path with the largest single `Write` so far, ties to the earlier, changing only when another path's `Write` passes it. A `Write` replaces its path's buffer, an `Edit` patches it (`old_string` replaced by `new_string`) on a confirmed result, other written files are named in a foot, and `N sections` counts the subject's sections only. Main folds the buffers into the card it hands a reloading window, and the window folds the same events into the same card.

## Boundaries & Constraints

**Always:**
- Prose stays decoded from the stream, never read from disk; the window still commits text once per animation frame and no React state changes per piece. Only `Write` streams as `doc:prose` now. An `Edit` streams nothing: its `old_string` and `new_string` are held until its `tool_result`, so the body never shows an edit fragment.
- Weight of a path = the longest text of any one `Write` to it so far (monotone, counted as the text streams). Subject = the path with the greatest weight above zero; a path replaces it only by being strictly greater. A later shorter `Write` to the subject replaces its buffer and keeps its weight.
- `Edit` of a path with a buffer, on an `ok` result whose `old_string` is in that buffer: the buffer becomes the buffer with every occurrence replaced (an Edit that succeeded had one occurrence or `replace_all`). Main's route fold computes it and sends the patched whole text as an optional `text` on `doc:committed` (`ok: true`); the `sections` of a `doc:committed` are those of the document at `path` after the call (a `Write`'s text, an `Edit`'s patched buffer). `old_string` absent, empty, a path with no buffer, or a rejected result: the buffer is unchanged and no `text` is sent. An `Edit` of a non-subject path patches that path's buffer only.
- Buffers are per run. The route fold's `Write` buffers reset when the run ends; a chat turn (no run) raises and keeps nothing.
- A path is named in the foot (`also written`, paths in mono, `label` size, `faint`, wrapping, on `panel-2` with the `line-soft` top rule) when the card holds it and it is not the subject. The foot is absent when there is none. It is not a live region and never part of the body or the head path.
- `saved · just now · N sections` and `<Name> · saved · N sections` use the subject's sections (0 when none). `documents` replaces `sections` and `prose` in `RunCardSnapshot`. The two folds (`src/main/fold/run-card.ts`; `conversation-state.ts` plus `prose-store.ts`) hold the same card, field for field, in `tests/run-card-parity.test.ts`.
- All values via `var()` from `design/tokens.css` (new foot tokens go there); no literal colour, dimension, radius or font stack; no new `@keyframes`.

**Never:**
- No change to `_bmad/planning-artifacts/**` (EXPERIENCE.md, DESIGN.md and AD-5 amendments belong to `bmad-ux` and `bmad-architecture`), `fixtures/runs/*` that already exist, or the memlog/note path.
- No pinned card (3.14), no `note` rule or `fold/persona-state.ts` change (3.13), no section plan, not-yet-written list, `revising · §N` head wording or counters (3.3), no stop, rail annotation or empty-body work.
- No document buffer built from Bash heredocs or Python patches: a run writing that way has no `Write`, so no subject, and the body stays the run-note feed as today. No second place to read a document, no spinner, skeleton, progress bar, denominator or typewriter.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One document | one `Write` of `prd.md`, then commit | head path `prd.md`, body its text, no foot | N/A |
| Subject switch | `addendum.md` (3 KB) written; `prd.md` `Write` streams past 3 KB | until it passes: addendum shown; once strictly greater: PRD in head and body, addendum named in the foot | N/A |
| Tie | two `Write`s of equal length | the earlier path stays the subject | N/A |
| Smaller rewrite | later shorter `Write` to the subject | its buffer is the new text; weight, so subject, unchanged | N/A |
| Edit of subject | `ok`, `old_string` in buffer | body is the whole patched document; `doc:committed.text` set; sections recomputed | N/A |
| Edit, old string absent | `ok`, absent from buffer | buffer, body and sections unchanged, no `text` | N/A |
| Edit of another buffered path | `ok` | that buffer patched; body and head path untouched | N/A |
| Edit of an unbuffered path | no `Write` of it this run | path named in the foot; body untouched; no subject from it | N/A |
| Rejected `Write` or `Edit` | `is_error` result | `doc:committed` `ok:false`; no `text`, no section change; streamed `Write` text stays as streamed | N/A |
| Finish | `run:finished` | `saved · just now · N sections`, N = subject's | N/A |
| Reload mid-run | snapshot with several buffers | window seeded with every buffer; same subject and head | N/A |
| Multi-file recording replayed | addendum, pre-review copy, PRD, `Edit`s | subject is the PRD, final body equals the PRD built by applying the recorded calls, N equals its section count | N/A |

</intent-contract>

## Code Map

- `src/main/fold/route-frame.ts` -- `WRITE_FIELDS` (`Write: content`, `Edit: new_string`) keeps naming the text field (`written-paths.ts` shares it). Add `old_string` capture for `Edit`, route `Edit` with no `doc:prose` (`textEvent`), keep a `docs: Record<path, string>` of this run's `Write` buffers in `RouteState` (updated as a `Write` streams, in `withWritten`), and compute the commit in `commitResults`: `sectionHeadings` of the document after the call plus `text` for an applied `Edit`. `projectRelative`, `MEMLOG` and the pending-destination logic stay. `withoutPendingWrites` has one caller, `endRun` at `src/main/session-run.ts:~167`, which must also drop `docs`.
- `src/main/fold/route-frame.test.ts`, `src/main/session-run.test.ts` -- Edit emits no prose; commit carries document sections and `text`; buffers reset at run end.
- `src/shared/events.ts` -- `DocCommitted` ok variant gains `text?: string` and its `sections` doc comment changes; `DocProse` doc says `Write` only. Additive: `CONTRACT_VERSION` stays; `tests/contract.test.ts` and `tests/conversation-contract.test.ts` read these files.
- `src/shared/conversation.ts` -- `RunCardSnapshot`: drop `sections` and `prose`, add `documents: RunCardDocument[]` (`{ path, callId, text, written, sections }`, first-seen order: first piece or first `ok` commit). Keep `RunCardProse` as the subject view `{ callId, path, text }`.
- `src/main/fold/run-card.ts`, `run-card.test.ts` -- fold `doc:prose` (per path: same `callId` appends, else the new `Write` replaces; `written = max(written, text.length)`) and `doc:committed` `ok` (set the path's `sections`; `text` replaces its buffer and `callId`; an unseen path creates an empty document); export a `subjectOf(documents)` the tests can use.
- `src/renderer/ui/chat/prose-store.ts`, `prose-store.test.ts` -- per-run map of path to `{ callId, text, written }` in first-seen order: `append` (as above), new `commit(runId, path, callId, text?)`, `seed(runId, documents)`, `get(runId)` returns the subject view, new `paths(runId)` (stable array identity until the set changes). Same once-per-frame notification.
- `src/renderer/ui/chat/transcript-entry.ts`, `conversation-state.ts`, `conversation-state.test.ts` -- `RunCardEntry.sections` becomes `documents: { path, sections }[]`; `foldRunEntry` sets a committed path's sections; `runEntryOf` reads `card.documents`. Still no `doc:prose` in state.
- `src/renderer/ui/chat/use-conversation.ts:~241,~267` -- route an `ok` `doc:committed` to `prose.commit(...)` as well as `foldEvent`; seed from `run.documents`; the lifecycle line takes the subject's sections (`prose.get(runId)?.path`).
- `src/renderer/ui/chat/run-status.ts`, `run-card.tsx`, `run-card.css` -- `runStatusText` and `runLifecycleLine` take the subject's section count; `RunCard` reads path from the subject (already `useSyncExternalStore`), renders the foot from `prose.paths`; `ProseText`'s append-or-replace paint rule by `callId` already fits (a patch and a switch carry a new `callId`). `src/renderer/design/tokens.css` -- foot padding and gap tokens.
- `tests/run-card-parity.test.ts` (extend `SEQUENCES`: two paths, a switch, an Edit with `text`, a rejection, an unseen-path commit; the `fold` helper calls `store.commit` on `ok` commits), `tests/run-replay.test.ts` (the 32 `Edit`s no longer stream prose: update its counts and add: final body is the PRD, N is the PRD's count), `tests/replay-corpus.test.ts` (shape of the new scenario), `tests/negative-surface.test.ts` (foot is `faint`: allow-list entry; no spinner/denominator guard unchanged), `src/renderer/ui/chat/run-card*.test.tsx`, `src/renderer/ui/app.test.tsx`, `tests/accessibility.test.ts`.
- `fixtures/runs/fast-path-sonnet.jsonl` -- read-only evidence: one 54 KB `Write` of `prd.md`, then 32 `Edit`s. `scripts/record-run.mjs` and `fixtures/runs/README.md` -- record a real multi-file scenario (`multi-file-sonnet`): a short scratch-project session that writes an addendum, a pre-review copy and a larger `prd.md`, then revises `prd.md` by `Edit`. If recording is impossible, hand-build raw `stream-json` frames in the same shape and say so in the README row; never claim a hand-built fixture is a recording.

## Tasks & Acceptance

**Execution:**
- `src/shared/events.ts`, `src/shared/conversation.ts` -- add `DocCommitted.text` and `RunCardDocument`, replace the card's `sections`/`prose` -- the contract the folds share
- `src/main/fold/route-frame.ts`, `src/main/session-run.ts` (+ tests) -- Edit streams nothing, buffers per path, commit carries sections and patched `text`, reset at run end -- main's half of the patch rule
- `src/main/fold/run-card.ts` (+ test) -- documents, weights, subject -- main's card
- `src/renderer/ui/chat/prose-store.ts`, `conversation-state.ts`, `transcript-entry.ts`, `use-conversation.ts`, `run-status.ts`, `run-card.tsx`, `run-card.css`, `tokens.css` (+ tests) -- the window's matching fold, subject head and body, foot, subject-section status -- the surface
- `fixtures/runs/multi-file-sonnet.*`, `fixtures/runs/README.md`, `tests/replay-corpus.test.ts`, `tests/run-replay.test.ts` or a sibling replay test -- the multi-file replay: subject, final body, N, no frame dropped at full rate -- the recorded-run AC
- `tests/run-card-parity.test.ts`, `tests/negative-surface.test.ts`, other affected tests -- parity over the new sequences, the foot's token and wording guards -- both folds equal
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given a run whose `Write`s to more than one path stream, when it runs, then the card shows exactly one path in head and body: the path with the largest single `Write` so far (ties to the earlier), changing only when another path's `Write` strictly passes it.
- Given other files the run writes, then they are named in the foot as `also written` and never take the body or head path.
- Given an `Edit` of the subject, then its buffer is patched by replacing `old_string` with `new_string` on the confirmed result and the body ends the run as the whole document; an absent `old_string` changes nothing; an `Edit` of another path does not touch the body.
- Given `run:finished`, then the head reads `saved · just now · N sections` with N the subject document's sections, and the live region says the same count.
- Given the multi-file recording replayed through the real folds, then the subject is the PRD, the final body is the PRD's text, and N equals its section count; replayed at full rate the window still commits once per frame.
- Given the full suite, lint, typecheck and build, then all pass and no new `@keyframes` exists.

## Spec Change Log

## Review Triage Log

### 2026-10-03 — Review pass
- verdicts: 27 findings — high 0, medium 0, low 21, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: a rejected `Write` that streamed past the others becomes the subject and is named in the foot — the matrix row says a rejected write keeps what it streamed ("body left as-is"); needs a rejected `Write` of a large file, and the fix (restore the prior buffer, a confirmed-versus-streamed split) is more than a direct correction.
  - `[low]` `[reject]` Blind: the design note's "next Edit repairs it" is wrong after a rejected `Write` — true of the sentence, a spec-text matter; only a later `Write` repairs it, and a finding whose fix edits this spec is rejected.
  - `[low]` `[reject]` Blind: an `ok` `Edit` whose `old_string` is not in the buffer (quote or whitespace normalisation) leaves a stale body — the specified "absent changes nothing" row; the card is stale until the next `Write`; a degradation path is new surface.
  - `[low]` `[reject]` Blind: `sections` of an `Edit` commit changed meaning with `CONTRACT_VERSION` still 1 — the field's type is unchanged, the version is forensic only and never refuses anything, and the only readers are the two card folds, both updated.
  - `[low]` `[reject]` Blind: an `Edit` of a non-subject path sends and holds text that is never shown — real but about 1.7 MB of IPC across the recorded 32 `Edit`s, which is not felt; sending it only for the subject adds a branch to a path the parity test pins.
  - `[false]` `[reject]` Blind: the window store takes events after the card is terminal — main sends no `doc:*` event after `endRun` (`entry.run` is cleared, so the route context has no `runId`), so no late commit exists to take.
  - `[low]` `[reject]` Blind: the foot gives assistive tech nothing and the DOM test asserts the run-together `also writtenprd.md` — that is `textContent` of two spans; the spec says the foot is not a live region, and the lifecycle line already announces the run.
  - `[false]` `[reject]` Blind: the foot's faint allow-list reason is wrong — the other written files are under `_bmad/` and are rail rows under their own names, which is what the reason says; the card still follows one document.
  - `[low]` `[reject]` Blind: with no subject the foot reads `also written` beside an empty head path — the spec's matrix row ("Edit of an unbuffered path: named in the foot, no subject from it"); needs an `Edit`-only run.
  - `[low]` `[reject]` Blind: some test titles overclaim and `recordedPrd()` applies every `Edit` without checking its result — the three recorded `Edit`s all succeeded and the sibling replay checks it for the large fixture; wording only.
  - `[low]` `[reject]` Blind: spec metadata stale or inconsistent (README under a `Never`, unlisted store helpers, UTC versus local dates, `record-run.mjs` unchanged) — every fix edits this spec or a recorded timestamp.
  - `[low]` `[reject]` Edge: the subject is re-derived from first-seen order, so a tie can flip it — only when a path first seen by an `Edit` commit later ties exactly; contrived, and the fix keeps an incumbent in both folds.
  - `[low]` `[reject]` Edge: `split`/`join` replaces every occurrence though `replace_all` was false — an `Edit` that succeeded had one occurrence, so the result is the same; they differ only when the buffer already differs from disk.
  - `[low]` `[reject]` Edge: a `Write` of empty content leaves the old buffer — needs an empty rewrite of a held file; fix is a guard in two folds.
  - `[low]` `[reject]` Edge: a rejected or interrupted `Write` leaves a partial buffer that later `Edit`s patch — same cause as the first Blind row; an interrupt ends the run and drops the buffers.
  - `[false]` `[reject]` Edge: `prose.commit` runs for a run whose card is terminal or absent — main raises no `doc:*` event after the run ends, and `commit` with no entry only touches the store's own per-run map.
  - `[low]` `[reject]` Edge: the foot lists paths whose `Write` was rejected, or an `Edit`-only path — same causes as the first and ninth Blind rows.
  - `[false]` `[reject]` Edge: an `Edit` naming another spelling of the path finds no buffer — both calls go through `projectRelative`, which resolves and normalises the path.
  - `[low]` `[reject]` Edge: `text` has no size cap — one document, at most the 1 MiB the window reads; same cause as the fifth Blind row.
  - `[low]` `[reject]` Edge (claim): the spec forbids touching `fixtures/runs/*` yet edits its README — the `Never` means the recorded files; fix edits the spec.
  - `[low]` `[carried]` `[reject]` Edge (claim): "strictly greater" is not kept on a tie when first-seen order differs — same cause and verdict as the tie row above.
  - `[false]` `[reject]` Edge (deletion): another consumer of `Edit` prose or cumulative sections loses data — a search of `src` found no other reader of `doc:prose` or of a card's `sections` than the two folds and their tests.
  - `[low]` `[reject]` Intent: nothing renders a card from the recording and the manual live check is not done — the spec records the manual check as a residual risk; the DOM and replay tests exercise the pieces.
  - `[low]` `[reject]` Intent: the fixture is a scripted three-file turn, not `/bmad-prd`, and opus's Bash writes have no subject — the spec allows the short recording and names the Bash fallback as open.
  - `[low]` `[reject]` Intent: the subject rule reads "longest single `Write`" where the epic could be read as a cumulative total — the spec's design note chooses the monotone reading; a total would let a rewritten small file overtake.
  - `[false]` `[reject]` Intent: no sprint-status flip, context refresh or commit in the diff — those are this step's finalize.

## Design Notes

- **Weight is the longest single `Write`, not a running sum.** "Most characters written by a `Write`" read as a total would let a repeatedly rewritten small file overtake a document; a maximum is monotone, so the subject changes only when a path is strictly passed, exactly the stated rule, and ties stay with the earlier path.
- **The patch is main's, the card's text is both folds'.** An `Edit` is applied where the call is whole (the route fold, on `tool_result`) and sent as the finished text, so the window never parses a frame or repeats the patch; both card folds only replace a buffer. A rejected `Write` keeps the text it streamed ("body left as-is", as before); the next successful `Edit` or `Write` repairs it.
- **Fallback for Bash-written documents.** A run that writes through Bash (opus heredocs, Python patches) has no `Write`, so no buffer, no subject and no patch: the body is the run-note feed as today. Naming a heredoc-aware interpreter is a later decision; `fixtures/runs/README.md` records that it is open.
- **Foot is minimal on purpose.** 3.3 owns the not-yet-written list and counts; this story adds only the line that names other written files. `also written` is working copy pending `bmad-ux`.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Run a skill that writes an addendum and a PRD on a BMad project: the head follows the PRD once it is the largest write, the foot names the addendum, and the saved card shows the PRD's section count. An unattended run cannot do this; record it as a residual risk.

## Auto Run Result

**Summary.** A run's card keeps one document buffer per path and shows exactly one: the path with the largest single `Write` so far (ties to the earlier, changing only when another path strictly passes it). A `Write` replaces its path's buffer; an `Edit` streams nothing and, on a confirmed result, main patches the buffer (`old_string` replaced by `new_string`) and sends the whole patched document as `doc:committed.text`, so the body ends the run as the document and not the last edit. Other written files are named in an `also written` foot. `saved · just now · N sections` and the live-region line count the subject's sections only. Main's card (`documents`) and the window's prose store and entry hold the same card, held equal by the parity test, so a reload mid-run seeds every buffer.

**Files changed.** Contract: `src/shared/events.ts`, `src/shared/conversation.ts`. Main: `src/main/fold/route-frame.ts` (Edit held whole, per-run `Write` buffers, patch and sections on commit), `src/main/fold/run-card.ts` (documents, `subjectOf`). Window: `prose-store.ts`, `conversation-state.ts`, `transcript-entry.ts`, `use-conversation.ts`, `run-status.ts`, `run-card.tsx`, `run-card.css`, `design/tokens.css` (foot tokens). Fixture: `fixtures/runs/multi-file-sonnet.*` (a real sonnet recording: three `Write`s and three `Edit`s) and its README row. Tests across the touched folds and components, `tests/run-card-parity.test.ts`, `tests/run-replay.test.ts`, new `tests/run-replay-multi-file.test.ts`, `tests/replay-corpus.test.ts`, `tests/negative-surface.test.ts`; `sprint-status.yaml` (3.12 `done`) and `epic-3-context.md` (3.12 marked done).

**Review.** 27 findings: patches applied 0; deferred 0; rejected 27 with reasons in the log (false 6, low 21). Patched by verdict: high 0, medium 0, low 0.

**Follow-up review recommended: false.**

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` all unit and watcher projects passed; `npm run build` exit 0 (run by the build step after implementation, no code changed since). Matrix audit: every I/O row has a covering test that ran (route, card fold, parity, store, DOM and the two replays).

**Residual risks.**
- Not seen in the real app: no live `bmad-prd` run was made. The fixture is a short scripted three-file session, not a skill run; a repeat live run is still the success check for the beat.
- A run that writes through Bash heredocs or Python patches (opus) has no `Write`, so no buffer or subject; its body stays the run-note feed. Still open (README).
- A rejected `Write` keeps the text it streamed and can become the subject; a later `Edit` then patches that buffer. A tie can flip the subject only if a path first seen through an `Edit` later ties exactly.
- `also written` is working copy pending `bmad-ux`; the AD-5 per-path wording and EXPERIENCE.md/DESIGN.md amendments are still to be made by `bmad-architecture` and `bmad-ux`.
