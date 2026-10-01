---
title: 'One contract across the bridge'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: 'd723679f363b0369f2dc08d231a01d5ca057041e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
  - '{project-root}/fixtures/runs/README.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A projectRoot spelled differently from the CLI's reported path (for example /tmp against /private/tmp) makes lexical containment drop every write.
    evidence: |-
      projectRelative compares with posix.resolve/relative only; correct when the caller passes the CLI's spelling. Settled by Story 2.4 integration, where the session knows both.
    location: >-
      src/main/fold/route-frame.ts
    severity: medium (unverified)
  - summary: >-
      Every in-project Write/Edit becomes doc:prose, source files included.
    evidence: |-
      The event carries path, so the Epic 3 card can filter; which paths count as documents is an Epic 3 decision.
    location: >-
      src/main/fold/route-frame.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 2.2 (`story 2.2`, epics.md "One contract across the bridge", FR101, FR102, NFR5). Epic 2 and 3 build on events out and commands in, but nothing declares them. Two consumers could assume different payload shapes, and nothing folds a raw `stream-json` frame into a domain event, so the routing rules (FR102) exist only as prose.

**Approach:** Declare all fourteen events out and seven commands in once in `src/shared/`, each with an explicit payload type and a stated cardinality, as types only. Add the pure routing fold in `src/main/fold/` that turns raw frames into `persona:said`, `doc:prose` and `run:note` per the four routing rules, tested with synthetic frames.

## Boundaries & Constraints

**Always:**
- The fourteen event names and seven command signatures are exactly those in `epic-2-context.md`; events are `noun:verb-past`, paths in events are project-relative POSIX, times are epoch milliseconds.
- `sessionId` keys session-scoped fields, `runId` run-scoped ones; `agentId` is optional on session-owned payloads (a party session has none).
- `src/shared/` stays types only (plus one literal `CONTRACT_VERSION`): no function, class or enum. Adding a payload field is additive.
- Each event declares its origin as main. Raw-frame vocabulary (`stream_event`, `input_json_delta`, `text_delta`, `parent_tool_use_id`) appears in no file under `src/renderer/` or `src/preload/` or `src/shared/`.
- The fold is pure: no I/O, no clock (time arrives as an injected `now`), no state outside what it is handed and returns. Raw-frame types live in `src/main/fold/`, never in `src/shared/`.
- Pinned dependencies unchanged; none added. Comments explain why and carry no epic or story references.

**Never:**
- No session spawning, IPC wiring, preload API, persistence, coalescing of deltas, or renderer change (2.3 to 2.7 own those). Existing channels `rail:changed`, `doc:*`, `install:*` are not renamed or rewired.
- No fold of `result` into `session:awaiting-turn` or `run:finished/stopped/failed`, no `doc:section-opened`/`doc:committed` parsing, no recognition of a document written through `Bash` (Epic 3 decisions, see `fixtures/runs/README.md`).
- No edit to `fixtures/runs/` or the `contractVersion: null` in its meta files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Persona speech | main-thread `text_delta` in a `text` block | `persona:said` with the delta text, `sessionId`, `agentId?`, API message id | none |
| Complete message echo | main-thread `assistant` frame after its deltas | no event (the bytes already rendered) | none |
| Document write | `Write`/`Edit` tool_use in a run; `file_path` under the project, not memlog | `doc:prose` per decoded increment of `content` / `new_string`, path project-relative POSIX | none |
| Memlog write | same, `file_path` basename `.memlog.md` | `run:note` per increment; never any `doc:prose` | none |
| Path arrives late or after content | `content` precedes `file_path`, or an escape/unicode pair splits across deltas | nothing lost or duplicated: increments held until the path is known, escapes decoded whole | no event if the block closes without a `file_path` |
| Subagent frame | any frame with non-null `parent_tool_use_id` | no `persona:said`/`doc:prose`/`run:note`; fold state untouched (its block indexes collide with the main thread's) | none |
| Chat turn write | tool write with no `runId` in context | no doc or note event (a chat turn raises no card) | none |
| Outside the project | `file_path` not under `projectRoot` | no event | none |
| Other tools, thinking, malformed | `Bash`, `Read`, `thinking_delta`, non-object frame, unknown type | no event; state keeps working | never throws |

</intent-contract>

## Code Map

- `src/shared/install.ts` -- `HarnessError {code,message,detail?}` is the failure envelope to reuse; the `Reply` union pattern (`{ok:true,…}|{ok:false,error}`) and the `revision`-only-increases convention to copy.
- `src/shared/rail.ts` -- `RailSnapshot` is the payload of `rail:changed`; reuse it, do not redefine.
- `src/shared/document.ts` -- precedent: runtime `export const` already lives in `shared/`, but only literals.
- `src/main/rail-bridge.ts:15-16`, `src/main/doc-bridge.ts:23-29`, `src/preload/index.ts:12-13` -- existing IPC channel strings (`rail:changed`, `doc:open`, …); read-only here.
- `src/main/fold/elapsed.ts` -- the fold style to match: pure, injected `now`, one concept per module, kebab-case.
- `fixtures/runs/fast-path-sonnet.jsonl` -- real frame shapes: `stream_event` carries `event.type` of `message_start`, `content_block_start` (`content_block.type` `text`/`tool_use` with `id`,`name`, `input:{}`), `content_block_delta` (`text_delta.text`, `input_json_delta.partial_json`), `content_block_stop`; every frame has `parent_tool_use_id`; `file_path` is only known after deltas arrive. Read-only; the tests build synthetic frames and may spot-check against this file.
- `tests/layering.test.ts`, `eslint.config.mjs:67` -- Fold may import Bridge, never Sources/Projections/Windows/Renderer; must stay green.
- `tests/replay-corpus.test.ts`, `tests/negative-surface.test.ts:334,616` -- sweeps over `src/shared/`; new files must pass them.

## Tasks & Acceptance

**Execution:**
- `src/shared/events.ts`, `src/shared/commands.ts` (+ shared id types, e.g. `src/shared/ids.ts`) -- declare the 14 events and 7 commands: payload type, stated cardinality (e.g. once per session, many per turn, exactly one per tool call, exactly one terminal run event per run), origin, and for commands the reply envelope; add `CONTRACT_VERSION` -- one place both sides import.
- `src/main/fold/frame.ts` -- minimal raw-frame shapes the fold narrows from `unknown` -- keeps CLI wire format out of `shared/`.
- `src/main/fold/route-frame.ts` -- `routeFrame(state, frame, ctx) -> { state, events }` implementing the matrix, with `ctx = { sessionId, agentId?, runId?, projectRoot, now }` and a state that tracks the current main-thread message id and per-block-index kind, tool name, call id, buffered input and decode position.
- `src/main/fold/json-string-fields.ts` (or similar) -- incremental decoder of named string fields from accumulated `partial_json` (escapes, `\uXXXX`, surrogate pairs split across chunks).
- `src/main/fold/route-frame.test.ts` -- one test per matrix row using synthetic frames, plus: reassembling emitted `doc:prose` text equals the tool's final `content` for a multi-chunk write; a corpus spot-check that no `parent_tool_use_id` frame yields an event; feeding the same frames twice from fresh state is identical.
- `tests/contract.test.ts` -- asserts exactly the 14 event names and 7 command names, each with a payload and cardinality statement, each event origin main, no function/class/enum in `src/shared/` contract files, no raw-frame vocabulary in `src/renderer/`, `src/preload/`, `src/shared/`.

**Acceptance Criteria:**
- Given `src/shared/`, when the contract files are read, then all fourteen events and seven commands are declared, each with a payload type and a stated cardinality, and nothing in them is behaviour.
- Given the renderer and preload sources, when swept, then none names a raw frame field, and no declared event has a renderer origin.
- Given a synthetic `Write` to `_bmad/x/prd.md` in a run, when its frames are folded, then `doc:prose` increments reassemble to the written content and no `persona:said` or `run:note` appears.
- Given a synthetic write to `.memlog.md`, when folded, then only `run:note` appears.
- Given the same bytes arrive as stream deltas and then as the complete `assistant` frame, when folded, then they are emitted once.
- Given a subagent `text_delta` and a main-thread `text_delta` with colliding block indexes, when interleaved, then only the main-thread text is `persona:said` and its text is uncorrupted.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 21 rows covering 35 reported findings (blind 14, edge 15, verification-gap 2 plus 1 other, intent 2; a row merges the same claim from several layers) — high 0, medium 1, low 16, false 4, maybe-false 0
- findings:
  - `[low]` `patch` RAW wire-format sweep misses `content_block_*`, `message_start`, `partial_json`, `tool_use` (blind, edge) — extended the regex
  - `[low]` `patch` withoutComments doc comment claims strings are respected (blind) — comment corrected
  - `[low]` `patch` run:finished/stopped/failed cardinality says "at most one" where the contract is exactly one terminal event (edge) — strings corrected
  - `[low]` `patch` persona:state cardinality typo (blind) — corrected
  - `[low]` `patch` lone high surrogate before a non-low char or the closing quote untested; removing either flush passed 111/111 (verification-gap) — cases added against JSON.parse
  - `[low]` `patch` frame with no `parent_tool_use_id` key untested; flipping the guard passed (verification-gap) — test added
  - `[medium]` `defer` projectRoot spelled differently from the CLI's reported path (symlink `/tmp` vs `/private/tmp`) drops every write (blind, edge) — unverified: lexical containment is correct for a caller that passes the CLI's spelling; settled by Story 2.4 integration
  - `[low]` `defer` every in-project Write/Edit becomes `doc:prose`, source files included (blind, edge) — the event carries `path`, so the Epic 3 card can filter; which paths are documents is an Epic 3 decision
  - `[low]` `reject` memlog basename compared case-sensitively (edge) — a lowercased compare would conflate distinct files on case-sensitive volumes; the skills write the exact name
  - `[false]` `reject` Windows paths mis-resolved by posix (blind, edge) — Windows is a stated Deferred item of the architecture
  - `[low]` `reject` text_delta for an unknown block index is spoken (edge, blind) — deliberate: dropping it would lose the persona's words after a missed block start; real streams always open a block first
  - `[low]` `reject` empty messageId when `message_start` is missing (edge, blind) — fallback instead of dropping speech; unreachable from the real CLI
  - `[low]` `reject` held text dropped when a block closes without `file_path`, hold buffer uncapped, per-delta state copy (edge, blind) — the matrix row requires dropping; buffer is bounded by the document itself
  - `[low]` `reject` decoder accepts invalid escapes, escaped keys, duplicate keys, stray commas, `broken` mode has no end signal (edge, blind) — model JSON from the CLI is valid; the final `tool_result` is the commit signal, not the decoder
  - `[low]` `reject` "no behaviour" and RAW checks are regex over source text; `=>` ban; unexported behaviour passes (edge, blind, gap-other) — the type system already enforces payload shapes; a rewrite for no named harm
  - `[low]` `reject` ids are plain aliases, commands lack Args/Result helper types, cardinality is free text, CONTRACT_VERSION unused (blind) — added public surface for no demonstrated defect; stamping is Story 2.4
  - `[low]` `reject` MultiEdit/NotebookEdit unhandled (blind) — Write/Edit are the recorded document tools; Epic 3 decides the rest
  - `[low]` `reject` readFrame has no direct test, corpus tests could pass vacuously, constant `now` (blind) — exercised through routeFrame; the corpus contains Writes
  - `[false]` `reject` no fallback if the complete assistant frame is the only copy (blind) — `--include-partial-messages` is load-bearing and asserted elsewhere
  - `[false]` `reject` the diff wires no IPC, so "across the bridge" is declared only (intent audit) — the epic context assigns emission to Story 2.4; no AC of 2.2 asks for wiring
  - `[false]` `reject` corpus replay tests go beyond the synthetic-frame AC (intent audit) — the synthetic tests cover every rule alone; the replay is extra evidence

## Design Notes

Payload shapes are starting points, additive later. Suggested: `persona:said {sessionId, agentId?, messageId, text, at}`; `doc:prose {runId, sessionId, callId, path, text, at}`; `run:note {runId, sessionId, callId, text, at}`; `doc:committed` is exactly one per tool call, carrying the call id and the section list, with an error variant when the call failed. `rail:changed` reuses `RailSnapshot`. The fold holds incomplete JSON escapes until the next chunk, so decoded text is whole-character at every emission.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass, including `src/main/fold/route-frame.test.ts` and `tests/contract.test.ts`
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary:** Declared the fourteen events out and seven commands in once in `src/shared/` (types only, plus `CONTRACT_VERSION`), each with a payload type and a stated cardinality, and added the pure routing fold in `src/main/fold/` that turns raw `stream-json` frames into `persona:said`, `doc:prose` and `run:note` per the four routing rules.

**Files changed:**
- `src/shared/ids.ts`, `events.ts`, `commands.ts` -- id types, the 14 events (`EventSpec<'main', cardinality, payload>`), the 7 commands with reply envelopes.
- `src/main/fold/frame.ts` -- narrows an unknown frame; drops subagent frames before state is touched.
- `src/main/fold/json-string-fields.ts` -- incremental decoder of named string fields from partial JSON.
- `src/main/fold/route-frame.ts` -- `routeFrame(state, frame, ctx)`.
- `src/main/fold/route-frame.test.ts`, `json-string-fields.test.ts`, `tests/contract.test.ts` -- matrix rows, corpus replay, contract shape and wire-format sweep.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- epic-2 in-progress, 2.2 done.

**Review:** 21 triage rows over 35 findings. Patches applied: 6 (all low). Deferred: 2 (see frontmatter). Rejected: 13, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high, fewer than two medium patched).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (unit and watchers) and `npm run build` exit 0; the pre-commit hook reruns lint, typecheck and tests.

**Residual risks:** lexical path containment (deferred); payload shapes beyond the epic's names are starting points; nothing yet emits or consumes the contract over IPC (Stories 2.3 to 2.5).
