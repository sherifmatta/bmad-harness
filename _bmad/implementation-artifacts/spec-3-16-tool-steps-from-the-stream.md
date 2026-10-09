---
title: 'Tool steps, from the stream'
type: 'feature'
created: '2026-10-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md'
baseline_revision: '9682b5c2347435e2140dcb930134359c74c6445b'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A run's card can show only the notes the persona left and the documents it wrote; the real work in between (reads, searches, shell calls, subagent spawns) is invisible, and a step list built without a main-side source would invent steps (AD-20, AD-22). Story 3.17 renders steps; it needs them first, labelled in main, with no raw tool input ever reaching the renderer (FR124, FR101 amended, FR16, NFR5, NFR12).

**Approach:** Main folds every main-thread tool call of a run into a new event `run:step` (`running` once the call's input is whole, then `done` or `failed` on its `tool_result`), with a label derived by one pure module from a closed table. Both run-card folds (main's `fold/run-card.ts`, the renderer's `conversation-state.ts`) hold the steps on the card, in fold order against the notes. No rendering, no new file or store. Spec of record: epics.md Story 3.16 and AD-22.

## Boundaries & Constraints

**Always:**
- `run:step` is a union on `status`: `{ runId, sessionId, callId, status: 'running', label, at }` and `{ runId, sessionId, callId, status: 'done' | 'failed', at }`; cardinality in the type: inside a run, exactly one `running` per main-thread tool call, then exactly one `done` or `failed`. The contract has sixteen events; `CONTRACT_VERSION` and `TRANSCRIPT_VERSION` are unchanged. No channel, command or preload method is added (events travel on `session:event`).
- `running` is raised at the call's `content_block_stop`, not before; `done`/`failed` on its `tool_result` (`failed` = the CLI's own `is_error`); `at` is `ctx.now`, injected; no clock in `fold/`. A `Write`/`Edit` of a document raises its step beside its `doc:prose`/`doc:committed` events under the same `callId`; the step's `failed` and a rejected `doc:committed` both come from the one result.
- No `runId`, no step (plain chat turn). A call whose `file_path` (or `notebook_path`) has basename `.memlog.md` raises none. A frame with a non-null `parent_tool_use_id` never reaches the fold (`readFrame`), so subagent calls and results open and close nothing; the main-thread call that spawns a subagent is one step.
- The label is derived in main by a pure module in `src/main/fold/` from a closed table of tool name to verb plus ONE allow-listed input field (see Design Notes for the table). Control characters are stripped; the label is capped at 48 characters; a path is truncated from the left. While a call's input streams, the fold watches only that one field (the decoder skips the rest) and keeps it in a bounded buffer (1024 characters; past it the target is dropped and the label is the verb alone). A project-relative path via `projectRelative`; outside the project, the basename only.
- A run's end drops the open steps from the route state (extend `withoutPendingWrites`); the card closes any still-`running` step as `failed` with `endedAt` = the terminal event's `at`, with no event of its own (AD-20). A card that has ended takes no more steps.
- `RunCardSnapshot.steps` (and the renderer's `RunCardEntry.steps`): `{ callId, label, status: 'running' | 'done' | 'failed', startedAt, endedAt?, notesBefore }`, where `notesBefore` is the number of notes the card held when the step began. Steps and notes interleave by fold order, never by timestamp. At most 300 steps: past it the oldest finished one is dropped, never a running one. A repeated `running` for a known `callId`, and a `done`/`failed` for an unknown or already-closed call, change nothing.
- The two folds produce equal cards from the same events; fold logic for steps lives once in `src/shared/` and both folds call it.
- Transcript file: a stored card round-trips `steps`; a card with none (a file from before) loads with `steps: []` and counts no dropped record; a malformed `steps` loads as none; a card still `running` when read back (`deadOf`) has its running steps `failed` at its `lastAt`.
- `conversation:get` hands every card with its steps as main holds them; the renderer reconstructs nothing.

**Never:**
- No renderer rendering of steps (Story 3.17), no new file or store, nothing written into the project, no `n of m`, no pending or planned step.
- A `run:step` changes no persona state and no rail annotation. No `run:step` per streamed delta (AD-15): a 5,795-delta write raises one.
- No raw tool input crosses: no command line past the program name, no search query, no URL past its host, no path outside the project but its basename, no secret-looking argument.
- Do not change `doc:*` event shapes, the stop mechanism, `STOP_ACK_MS`, `STOP_RESULT_MS`, or `CONTRACT_VERSION`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| A call in a run | main-thread `tool_use` `Read`, input streams, `content_block_stop`, then its `tool_result` | `run:step` `running` (label `read <rel path>`) at the stop, then `done` at the result | N/A |
| Failed call | the `tool_result` has `is_error: true` | `run:step` `failed` | N/A |
| Document write | `Write`/`Edit` to a project file | a step (same `callId`) plus its `doc:prose`/`doc:committed`; rejected commit and `failed` step from one result | N/A |
| Memlog target | any tool whose `file_path` is `.memlog.md` | no `run:step`; `run:note` unchanged | N/A |
| Plain chat turn | tool calls with no `runId` | no `run:step` | N/A |
| Subagent frames | `parent_tool_use_id` set | no step opened or closed; the spawning `Agent`/`Task` call is one step | N/A |
| Secret and path | `Bash` `curl -H "Authorization: Bearer sk-x" https://h/x`; `Read` `/etc/passwd`; a 300-character command | labels `run curl`, `read passwd`, `run <program>`; no payload holds the secret, the URL, the long command or the absolute path | N/A |
| Streaming input | input JSON split into many fragments, `file_path` after other fields | one `running` at the stop; the label whole | field never arrives: label is the verb alone |
| Call never answered | run ends with a step `running` | card closes it `failed` at the terminal `at`; no event | N/A |
| After the end | `run:step` for an ended run's card | card unchanged | N/A |
| Cap | 301 steps | oldest finished dropped, running kept | N/A |
| Old transcript | stored card with no `steps`; relaunch with a running step | `steps: []`, no dropped count; running steps `failed` at `lastAt` | malformed `steps` loads as none |
| Reload mid-run | window reloads | `conversation:get` carries steps as main holds them | N/A |
| Recordings | each `fixtures/runs/*.jsonl` replayed through the real bridge and registry | `running` count equals main-thread calls not aimed at `.memlog.md` (independent raw-frame count), each paired with one `done`/`failed`; the call in flight at the interrupt in `interrupt-inband-tasks-live-mid-write` ends `failed` on `run:stopped` | N/A |

</intent-contract>

## Code Map

- `src/shared/events.ts` -- add `RunStep` (union on `status`) and `'run:step'` to `ContractEvents`; the header comment says "fifteen events" -> sixteen. Types only.
- `src/shared/conversation.ts` -- `RunCardStep` type; `RunCardSnapshot.steps`. `src/shared/run-steps.ts` (new) -- pure `withStepEvent(steps, notesCount, event)` and `closeSteps(steps, at)` plus the 300 cap, used by both folds (precedent: `src/shared/section-plan.ts`).
- `src/main/fold/frame.ts` -- `readFrame` already drops subagent frames, narrows `block-start` (tool id/name), `json-delta`, `block-stop`, `tool-results` (callId, `failed`). Read-only unless a narrowing gap shows.
- `src/main/fold/step-label.ts` (new, + test) -- the closed table and label derivation; pure; imports `projectRelative`/`MEMLOG` from `route-frame.ts` (or move them if that makes a cycle).
- `src/main/fold/route-frame.ts:395-487` -- `routeFrame`: `block-start` makes `other` for every tool but `Write`/`Edit`; give every main-thread tool block in a run (`ctx.runId` set) a block that decodes only its label field (`feedFields` with one watched field; Write/Edit already decode `file_path` into `pathText`), at `block-stop` raise `running` and record the call as open in `RouteState` (new field); `tool-results` (`commitResults`, `:282`) emits `doc:committed` then the step's `done`/`failed` for each open call; `withoutPendingWrites` (`:145`) also drops open steps. `json-delta` (`:470`) for the new block kind. Update the file's rule comment (five rules; steps).
- `src/main/fold/run-card.ts:27-117` -- `startCard` `steps: []`; `foldRunCard` handles `run:step` and closes running steps on the three terminal events, via `shared/run-steps.ts`.
- `src/main/session-run.ts:130-180` -- `tell` already applies every event to the cards and keeps the card; `deliver`/`coalesce` pass non-prose events through. `endRun` (`:221`) drops route state. No change expected beyond confirming a `run:step` flows.
- `src/main/session-registry.ts:168-260` -- `foldFrame` routes and `deliver`s; the continuation run (`startRun` before `routeFrame`) means its first call's step carries the new run id. Read-only.
- `src/main/fold/stored-runs.ts` -- `deadOf` closes running steps `failed` at `lastAt`. `src/main/sources/persistence/transcript-file.ts:120-136,170-176` -- `isStoredRun` stays as is; `loadTranscript` normalises each loaded card's `steps` (absent or malformed -> `[]`, well-formed steps kept, malformed steps dropped) without touching `dropped`.
- `src/renderer/ui/chat/transcript-entry.ts:68-92` -- `RunCardEntry.steps`; `src/renderer/ui/chat/conversation-state.ts:595-650,907-935` -- `runEntryOf` (copy `card.steps`), `foldRunEntry` (`run:step`, terminal close), the `run:started` birth (`steps: []`), the `withRunEvent` case list gains `'run:step'`. `src/renderer/ui/chat/use-conversation.ts:370` -- read-only (prose/commit routing).
- `src/main/fold/persona-state.ts:290`, `src/main/fold/rail-annotations.ts` -- `default` branches ignore unknown events; confirm and add a test that `run:step` changes neither.
- `tests/run-card-parity.test.ts` -- extend `windowCard`/`mainCard` and `SEQUENCES` (steps interleaved with notes, cap, terminal close, a step for an ended card, the reload-halfway loop). `tests/run-replay.test.ts`, `tests/stop-replay.test.ts`, `tests/continuation-replay.test.tsx` -- replay precedents (`recording()` helpers); new `tests/run-step-replay.test.ts` for the corpus.
- Count assertions to update fifteen -> sixteen events: `tests/contract.test.ts` (`EVENTS` list in declared order: `'run:step'` after `'run:note'`, 'are exactly the sixteen'), `tests/party-contract.test.ts:33`, `tests/negative-surface.test.ts` (`toHaveLength(15)` and the `fifteen` titles/comments, about six places); channels (thirty-three), commands (seven) and methods (twenty-one) stay. Search `fifteen` and `(15)` in `tests/` and `src/**/*.test.*` to find them all.
- Literals building `RunCardSnapshot`/`RunCardEntry` in tests and fixtures need `steps: []` (typecheck finds them). Add a small shared test helper if it saves churn.
- `fixtures/runs/README.md`, `_bmad/implementation-artifacts/{sprint-status.yaml,epic-3-context.md}` -- 3.16 `done`; a line on steps.

## Tasks & Acceptance

**Execution:**
- `src/shared/events.ts`, `src/shared/conversation.ts`, `src/shared/run-steps.ts` -- the event, the card's step type, the shared pure step fold -- the contract and the one fold both sides use
- `src/main/fold/step-label.ts` + `step-label.test.ts` -- table-driven labels, control-character stripping, 48-char cap, left-truncated paths, outside-project basename, `Bash` program only, fetch host only, unlisted tool name alone, bounded-buffer behaviour -- the only thing about a call's input that crosses
- `src/main/fold/route-frame.ts` (+ `route-frame.test.ts`) -- steps for every in-run main-thread call; memlog and no-run suppression; Write/Edit shared `callId`; results close steps; `withoutPendingWrites` drops open ones; one decoded field only -- the stream fold
- `src/main/fold/run-card.ts`, `src/main/fold/stored-runs.ts`, `src/main/sources/persistence/transcript-file.ts` (+ their tests) -- card steps, terminal close, cap, `deadOf`, load normalisation -- main's card and the stored card
- `src/renderer/ui/chat/transcript-entry.ts`, `conversation-state.ts` (+ test) -- the window's fold through the shared helper -- the second fold
- `tests/run-card-parity.test.ts` -- steps added to both folds' comparison, the cap and the terminal close -- the two folds equal
- `tests/run-step-replay.test.ts` -- each `fixtures/runs/*.jsonl` through the real bridge and registry (as `tests/stop-replay.test.ts` and `tests/run-replay.test.ts` do), counting main-thread non-memlog calls from raw frames independently; `interrupt-inband-tasks-live-mid-write` interrupt case; a serialise-every-event leak test for a secret-looking argument, a long command and an absolute path; no step per delta on the 5,795-delta write; persona state and rail annotations unmoved by a `run:step` -- the matrix
- Tests listed under Code Map for the sixteen-event count, and any literal needing `steps` -- fallout of the contract change
- `fixtures/runs/README.md`, `_bmad/implementation-artifacts/{sprint-status.yaml,epic-3-context.md}` -- 3.16 `done`
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given `src/shared/events.ts`, then it declares `run:step` as specified, sixteen events in all, `CONTRACT_VERSION` unchanged and no renderer-only event.
- Given a main-thread tool call inside a run, when its input finishes streaming, then `running` is emitted with its label, and `done`/`failed` on its result, stamped by the injected instant; a plain chat turn or a `.memlog.md`-aimed call emits none; a document write's step shares its `callId` with its `doc:*` events.
- Given frames with a non-null `parent_tool_use_id`, then they open and close no step; the spawning call is one step.
- Given any tool input including a secret-looking argument, a long command line or an absolute path outside the project, then no emitted payload holds more than the label allows.
- Given a run ending with a call that never reported, then its card holds the step `failed` at the terminal `at`, with no event; an ended card takes no more steps; the card holds at most 300 steps.
- Given the card folded in main and in the renderer from the same events, then both cards are equal (`tests/run-card-parity.test.ts`), including after a mid-run reload.
- Given a stored transcript, then steps round-trip, an old file loads with none and counts nothing dropped, `TRANSCRIPT_VERSION` is unchanged, and a run cut off by an app exit reads back with its running steps `failed` at its last event.
- Given the replay corpus, then every recording's `running` steps equal its non-memlog main-thread calls, each closed once; the in-flight call at the interrupt ends `failed` on `run:stopped`.
- Given persona state and the rail's annotations, then a `run:step` changes neither.
- Given the full suite, lint, typecheck and build, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 33 findings — high 0, medium 3, low 26, false 4, maybe-false 0 (4 rows patched, three defects; 29 rejected)
- findings:
  - `[medium]` `[patch]` Blind: a quoted leading `NAME="a b"` assignment leaks a fragment of the secret into the `run` label (`programOf` splits on whitespace) — real, the label is the one thing that crosses (NFR12); patched: a leading assignment whose value opens a quote yields the verb alone, with tests.
  - `[low]` `[reject]` Blind: a memlog-aimed call whose path is over 1024 characters raises a verb-only step — a path that long is not one the CLI writes; the fix adds a branch for nothing met in use.
  - `[low]` `[reject]` Blind: memlog match is case-sensitive on a case-insensitive file system — the CLI spells the path as the skill does, `.memlog.md`; not met in use.
  - `[low]` `[reject]` Blind: a stored ended card carrying a `running` step reads back running — a card is stored with its terminal fold, so only a hand-edited file shows it.
  - `[low]` `[reject]` Blind: loaded steps are not re-sanitised (length, control characters, duplicate ids) — the file is the app's own, in its own data directory, written by the fold that sanitised them.
  - `[low]` `[reject]` Blind: with 300 steps all running the 301st is dropped untested — three hundred calls in flight at once does not happen; the cap rule is as the story states it.
  - `[low]` `[reject]` Blind: README says 3,947 deltas, epic context says ~5,800 — a figure quoted from the planning docs in a derived cache; the test uses the real corpus.
  - `[low]` `[reject]` Blind: the epic-context rewrite dropped requirement text — it is the compiled cache the workflow regenerates when planning docs change, not a source; nothing is lost from the planning docs.
  - `[low]` `[reject]` Blind: contract-count edits are hand-made and one older test title reads "no new … event: seven, sixteen" — cosmetic; the assertions are right.
  - `[low]` `[reject]` Blind: replay tests lean on frame indices and a loose delta bound — they break loudly on a re-recorded fixture and the counts are independent of the code.
  - `[false]` `[reject]` Blind: fields with no label still decode the whole input — the decoder skips unwatched fields without keeping them, so nothing is held.
  - `[low]` `[reject]` Blind: `Skill`/`Agent` targets are not value-checked — they are bounded, control-stripped identifiers the CLI names; a value check is more than a correction.
  - `[low]` `[reject]` Blind: the `route-frame.ts` re-export of `MEMLOG`/`projectRelative` is a leftover — it keeps existing imports unchanged; no harm.
  - `[false]` `[reject]` Blind: no test of persistence cost per step — `recordRun` marks the transcript touched, and the write is debounced (`projections/transcript.ts:190`), so a step costs no write of its own.
  - `[medium]` `[patch]` Verification-gap (other): a long `Bash` command (heredoc, over 1024 characters) labels as `run` with no program — the program is the first word; patched: the program kind keeps the first 1024 characters instead of dropping, with a test. (Same root cause as the Edge row on the buffer.)
  - `[medium]` `[patch]` Edge: same defect (45 of 73 Bash calls in `coaching-path` exceed 1024) — grouped with the row above, patched together.
  - `[low]` `[patch]` Edge: the control-character strip misses bidi overrides and zero-width/format characters — a direct correction; patched: the set is extended, with a test.
  - `[low]` `[reject]` Edge: a `Bash` that runs `memlog.py` or redirects to `.memlog.md` raises a step — the story's rule is about a call whose input file path is the memlog; a shell command is a tool call that happened and shows as `run <program>`.
  - `[low]` `[reject]` Edge: over-long memlog path raises a verb-only step — same as the Blind row.
  - `[low]` `[reject]` Edge: the decoder's key accumulation is unbounded — pre-existing decoder, an enormous key does not occur.
  - `[low]` `[reject]` Edge: 301st step silently dropped when all are running — same as the Blind row.
  - `[low]` `[reject]` Edge: loaded steps not bounded or deduplicated — same as the Blind row.
  - `[low]` `[reject]` Edge: load caps with `slice(-300)` and could drop a running step — a stored card already obeyed the live cap, and a running one is closed by `deadOf`.
  - `[low]` `[reject]` Edge: epic-context deletion — same as the Blind row.
  - `[low]` `[reject]` Edge (claim): `Bash` shows a wrapper (`run cd`) rather than the real program — the story fixes the label at the first program name and nothing after it, so no argument can leak.
  - `[low]` `[reject]` Edge (claim): shell memlog writes raise steps — same as the memlog row above.
  - `[low]` `[reject]` Edge (claim): an events-only consumer sees steps that never close — the story fixes this: the card, not an event, closes them at the terminal event.
  - `[false]` `[reject]` Intent: "close when done" is only in the tracking files and the spec is `in-review` — status and commit are set at finalize, after triage, as this step orders.
  - `[low]` `[reject]` Intent: `epic-3-context.md` is rewritten beyond 3.16 — it is the compiled cache, regenerated because the planning docs changed (the cache was stale).
  - `[low]` `[reject]` Intent: `projectRelative` and `MEMLOG` moved to `project-path.ts` and `commitResults` split — needed to avoid an import cycle, behaviour unchanged.
  - `[low]` `[reject]` Intent: many tests edited only for `steps: []` and counts — the footprint of the required type and the sixteenth event.
  - `[low]` `[reject]` Intent: the corpus has no 5,795-delta write (largest is 3,947) — the quoted figure is a sizing note; the test pins one step for the largest recorded write. The AC's in-flight call in `interrupt-inband-tasks-live-mid-write` has no `content_block_stop` in the real recording, so it raises no step by the story's own rule; the test closes the block by hand to pin the `failed`-on-`run:stopped` close.
  - `[false]` `[reject]` Intent: no commit visible in the diff — committing is this step's finalize.

## Design Notes

- **Decisions confirmed (the story's defaults):** the 300-step cap, `Bash` shows its program name and nothing after it, `running` at the end of the call's input, durations approximate for calls issued together.
- **The table** (placeholder copy: `bmad-ux` owns the words; lower-case verbs, one space, then the target). `Read` -> `read` + `file_path`; `Write` -> `write` + `file_path`; `Edit` and `MultiEdit` -> `edit` + `file_path`; `NotebookEdit` -> `edit` + `notebook_path`; `Bash` -> `run` + the program (first word after any leading `NAME=value` words, its basename, accepted only if it is made of letters, digits, `.`, `_`, `+`, `-`; else the verb alone); `Skill` -> `skill` + `skill`; `Agent` and `Task` -> `agent` + `subagent_type`; `WebFetch` -> `fetch` + the host of `url` (hostname only, no port, user or path; unparsable -> verb alone); `Grep` -> `grep`, `Glob` -> `glob`, `WebSearch` -> `web search` (no target); any other tool -> its own name, control characters stripped, nothing else. A path target is `projectRelative(...)` or the basename when outside the project; if the path's basename is `.memlog.md` there is no step.
- **Label shape.** `${verb} ${target}`, 48 characters at most: a path target is cut from the left with a leading `…` so the whole label fits; any other target is cut from the right with a trailing `…`.
- **Order at a result.** `doc:committed` first, then the step's `done`/`failed`, both from the one `tool_result`.
- **Why `doc:section-opened` is not mentioned in the code:** it is declared and not emitted today; this story does not change that.
- **Where the label comes from for a document write.** `Write`/`Edit` blocks already decode `file_path` into `pathText`; the label is built from it at the block's stop. Other tools get a block that decodes only their one field.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- With a real `claude`, dispatch a skill and see no visible change yet (rendering is Story 3.17); an unattended run cannot check this, so record it as a residual risk.

## Auto Run Result

**Summary.** Main now folds every main-thread tool call of a run into a new `run:step` event (`running` at the call's `content_block_stop`, `done`/`failed` on its `tool_result`), with a label derived by a pure module from a closed table (verb plus one allow-listed field: project-relative path or basename, program name only for `Bash`, host only for a fetch, skill name, subagent type). Calls aimed at `.memlog.md`, plain chat turns and subagent frames raise none. Both run-card folds hold `steps` through one shared helper (300-step cap, `notesBefore` interleave, running steps closed `failed` at the terminal event); the transcript file round-trips them with no version change, and a cut-off run reads back with its running steps `failed`. The contract has sixteen events. Nothing renders steps (Story 3.17).

**Files changed.** `src/shared/{events,conversation,run-steps}.ts`; `src/main/fold/{step-label,project-path,route-frame,run-card,stored-runs}.ts`; `src/main/sources/persistence/transcript-file.ts`; `src/renderer/ui/chat/{transcript-entry,conversation-state}.ts`; tests beside each, plus `tests/{run-step-replay,run-card-parity,contract,party-contract,negative-surface,persistence-contract}.test.ts` and `steps: []` in existing card literals; `fixtures/runs/README.md`; `sprint-status.yaml` and `epic-3-context.md` (3.16 done; the context recompiled because the planning docs had changed).

**Review.** 33 findings: patches applied 4 rows (three defects: a quoted `NAME="…"` assignment leaking a fragment into a `run` label; a long `Bash` command losing its program name past the 1024-character buffer; bidi and zero-width characters not stripped); deferred 0; rejected 29 with reasons in the log. By verdict: high 0, medium 3, low 26, false 4, maybe-false 0.

**Follow-up review recommended: true.** Two medium entries were patched, both in the hand-written `Bash` program tokeniser (`programOf` in `src/main/fold/step-label.ts`), whose other shell quirks (subshells, `env`/`sudo` wrappers, line continuations) were not reviewed. Patched counts: high 0, medium 2, low 1.

**Verification.** `npm run lint` clean; `npm run typecheck` no errors; `npm test` unit 209 files, 5,132 tests passed, watchers 3 files, 64 tests passed; `npm run build` ok. Matrix audit: every I/O row has a test that ran and passed (`step-label.test.ts`, `route-frame.test.ts`, `run-card.test.ts`, `stored-runs.test.ts`, `transcript-file.test.ts`, `conversation-state.test.ts`, `tests/run-card-parity.test.ts`, `tests/run-step-replay.test.ts` over every `fixtures/runs` recording).

**Residual risks.**
- Not seen with a real `claude`; an unattended run cannot make that check, and nothing draws steps until Story 3.17.
- In `interrupt-inband-tasks-live-mid-write` the call in flight at the interrupt is a `Write` with no `content_block_stop`, so by the story's rule it raises no step; the `failed`-on-`run:stopped` close is pinned with the block closed by hand.
- The corpus's largest write is 3,947 deltas, not the 5,795 the sizing note quotes; one step per write is pinned on the real one.
- Labels are placeholder copy (lower-case verb, one space, target); a cut label ends in `…`, which the 3.11 audit and Story 3.17 have to draw or ban.
- A `Bash` label names the first program (`run cd` for `cd x && …`), by the story's rule.
