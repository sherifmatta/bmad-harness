---
title: 'Press a button and watch a document write itself'
type: 'feature'
created: '2026-10-03'
status: 'done'
baseline_revision: 'fd139d02365e8b97d9bf8c425e38fefe7a69061b'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A revision `Edit` replaces the card's visible document text, so a saved card shows the last edit's fragment.
    evidence: |-
      In fast-path-sonnet 32 of 33 document writes are Edits; each new callId restarts the prose buffer (`fold/run-card.ts`, `prose-store.ts`). Story 3.3 owns patching the buffer (`revising`).
    location: >-
      src/main/fold/run-card.ts:doc:prose
    severity: medium
  - summary: >-
      The card body is empty until the first memlog note, which is 704 s into the recorded run.
    evidence: |-
      Story 3.1's AC says never an empty body; the feed is mounted with no rows. Whether this fails the AC is what the recorded beat judgement and story 3.4 settle.
    location: >-
      src/renderer/ui/chat/run-card.tsx
    severity: high (unverified)
  - summary: >-
      A projectRoot spelled unlike the CLI's path drops every write silently, and every in-project Write or Edit becomes document prose.
    evidence: |-
      Already recorded in deferred-work.md lines 43 and 47 as Epic 3 decisions; not settled by this story.
    location: >-
      src/main/fold/route-frame.ts:projectRelative
    severity: medium
  - summary: >-
      The beat judgement, the real-skill run and the persona's relay of an out-of-project write denial are pending.
    evidence: |-
      Needs a human running the app against a real claude; recorded as pending in judgement-3-1-the-beat.md. The epic gates 3.2 onward on it.
    location: >-
      _bmad/implementation-artifacts/judgement-3-1-the-beat.md
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Eight of the fourteen contract events are declared and never emitted, `menu.dispatch` has no handler, no skill button exists, and a persona's run produces no card, so the product's central claim (watch a document being authored, never a spinner) cannot yet be judged (FR23, FR24, FR25, FR31, FR35, FR38, FR47, UX-DR24, NFR9, NFR10).

**Approach:** One thin vertical slice. A skill row above the composer sends only `menu.dispatch(sessionId, code)`; main resolves the code, writes the turn, raises `run:started`, routes `Write`/`Edit` deltas to coalesced `doc:prose`, tails the run's `.memlog.md` into `run:note`, commits on `tool_result`, and ends the run on the turn's `result`. The renderer shows one run-scoped card per run: head, the Epic 1 note feed, then prose appended to one DOM node per animation frame. Depth (section plan, dead-air foot, collapsed card, stop, failure reading, contention, notifications) stays in 3.2 onward.

## Boundaries & Constraints

**Always:** The button knows nothing about what it invokes and calls nothing but `dispatchMenu`; main alone decides skill vs prompt (`/<skill>` or the prompt verbatim). Prose comes from `input_json_delta`, never from re-reading the file. Notes come from the memlog file, never from document prose; memlog text never enters the prose buffer. Terminal state is read from the turn's `result` row through `fold/turn-end` (`is_error` selects failed; `stop_reason` is never tested). One `doc:committed` per document tool call, raised on its `tool_result`. A card is a main-held projection re-emitted on `conversation:get`; no card visual may depend on having seen earlier deltas. Elapsed derives from `run:started.at`. Time is injected; `fold/` has no I/O or clock. All styling from `design/tokens.css` (append tokens, never edit the verbatim `:root` block). Persona dot `work` to `live` comes from main: attach the session on `run:finished`, detach when the next turn or run starts.

**Never:** No spinner, skeleton, progress bar, denominator, typewriter or stand-in sentence in the card. No React state update per delta. No user turn recorded in the transcript for a dispatch. No skill name or skill/prompt split reaches the renderer; no tooltip. No `run.stop`, stop control, collapsed card, `§N` section plan, `doc:section-opened`, dead-air foot, `+N more`, notification, rail annotation or contention work (3.2 to 3.10). No change to `fixtures/runs/**`, `_bmad/planning-artifacts/**`, or the permission policy. Do not handle Bash-heredoc document writes (opus): such a run shows notes only; recorded as a known limit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dispatch a skill | session idle, code resolves to `skill: bmad-prd` | writes `/bmad-prd` as the turn, emits `run:started`, replies `{ok:true, runId}`; no user turn recorded | N/A |
| Dispatch a prompt | code resolves to `prompt: "..."` | writes the prompt verbatim; same events | N/A |
| Unknown code | code absent, or entry dropped at discovery | no turn written | `{ok:false, error:{code:'menu/unknown-entry'}}` |
| Busy / closed / bad args | `entry.turn.busy`, closed or unknown session, non-string args | no turn written | `session/busy`, `session/not-found`, `session/invalid-turn` as `sendTurn` |
| Plain chat turn | `turn.send` | no `run:*`, `doc:*`, card | N/A |
| Write streams | `Write` to `prd.md` in a run, many deltas | `doc:prose` events coalesced (each carries the concatenation of consecutive deltas of one call), order and bytes preserved | N/A |
| Write commits | `tool_result` for that call, no error | exactly one `doc:committed {ok:true, sections}`, sections = level-2 headings of the written content, emphasis stripped | N/A |
| Write rejected | `tool_result` with `is_error:true` | one `doc:committed {ok:false}`, no sections | error is `{code:'doc/write-rejected', message}` |
| Write never closes | turn ends mid-write | no `doc:committed`; pending write dropped at run end | N/A |
| Write outside project / subagent write | path outside root; frame with `parent_tool_use_id` | no `doc:prose`, no commit | N/A |
| Memlog note | `memlog.py append` (Bash, atomic rename) adds a line | one `run:note` per new `- ` line after the run's baseline, in file order | unreadable file: no note, no throw |
| Memlog existed before run | file had K entries at `run:started` | only entries after K are notes | N/A |
| Two runs active | note arrives with two active runs in the window | attributed to neither (never guessed) | N/A |
| Run ends ok | `result` without `is_error`, no live background task | `run:finished`, attach session, then `session:awaiting-turn` | N/A |
| Run ends `is_error` | `result` with `is_error:true` | `run:failed {code:'run/failed', detail: subtype}`; card head reads `failed`, persona `error` | N/A |
| Session ends mid-run | process exit / close | `run:failed {code:'run/session-ended'}` before `session:closed` | N/A |
| Window reload mid-run | `conversation:get` | snapshot carries `runs[]` with notes, prose, sections, status; card resumes | N/A |
| Zero notes yet | card just born | feed mounted with no rows, no text | known limit, see Design Notes |

</intent-contract>

## Code Map

- `src/shared/events.ts` -- `RunNote` loses `callId` (note comes from a file, not a call); other run/doc payloads unchanged. `tests/contract.test.ts` pins fields.
- `src/shared/channels.ts` -- add `MENU_DISPATCH_CHANNEL` (spelled once here; `tests/channels-contract.test.ts` count 19 to 20).
- `src/shared/conversation.ts` -- add `RunCardSnapshot` and `ConversationSnapshot.runs`; add `MenuDispatchReply`.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- `dispatchMenu(sessionId, code)`; method count in the doc comment and `tests/preload-bundle.test.ts`, `tests/bridge-contract.test.ts` follow.
- `src/main/fold/frame.ts` -- add `tool-results` input from main-thread `user` frames (`message.content[]` of `{type:'tool_result', tool_use_id, is_error}`); `parent_tool_use_id` still drops subagents.
- `src/main/fold/route-frame.ts` -- `ToolBlock` keeps its tool name; RouteState gains `writes` (pending, by callId: path, kind, text); `.memlog.md` destination becomes `none` (no prose, no note); `tool-results` raises `doc:committed`. `WRITE_FIELDS`, `projectRelative`, `feedFields` reused unchanged.
- `src/main/fold/section-headings.ts` (new) -- pure `sectionHeadings(text)`: ATX level-2 headings outside code fences, `*`/`_`/backtick emphasis stripped.
- `src/main/fold/coalesce.ts` (new) -- pure prose buffer: merge consecutive `doc:prose` with the same `callId`/`path`; any other event flushes it first so order holds.
- `src/main/fold/memlog-tail.ts` (new) -- pure `tailMemlog(emitted, text)` returning new `- ` entry lines beyond `emitted` and the new count; a shorter file yields nothing.
- `src/main/fold/run-card.ts` (new) -- pure card fold over `run:started`, `run:note`, `doc:prose`, `doc:committed`, terminal events; shape is `RunCardSnapshot`.
- `src/main/projections/runs.ts` (new) -- `createRunProjection()` holding cards by runId: `apply(event)`, `snapshot()`.
- `src/main/session-run.ts` (new) -- run lifecycle for the registry: `startRun`, routed-event handling (coalesce flush through an injected `schedule`, project to cards and personas, emit), `endRun` on `ended`/close, memlog baseline and tail. Keeps `session-registry.ts` functions under the 150-line cap.
- `src/main/session-registry.ts` -- `Entry.run`, `Service.runs` and per-service memlog counts; `foldFrame` passes `runId` into `routeFrame` and delegates to `session-run`; `finish` ends an active run; `ended` raises the terminal event before `session:awaiting-turn`. `fold/turn-end.ts` untouched.
- `src/main/session-bridge.ts` -- `dispatchMenu` handler sharing a `writeTurn` helper with `sendTurn`; `getConversation` adds `runs`; deps gain `menuEntryFor`, `newRunId`.
- `src/main/install-model.ts` -- add `menuEntryFor(webContentsId, agentId, code)` over `InstallProjection.menuEntry` (`projections/install.ts:36`, `ResolvedMenuEntry` in `sources/install/schema.ts:14`). The session bridge asks the install model, never the reverse (`tests/session-contract.test.ts`).
- `src/main/rail-bridge.ts`, `src/main/index.ts` -- report `.memlog.md` `artifact:found`/`artifact:written` observations to the session side (optional dep); `sources/project/watch-artifacts.ts` already admits and coalesces them.
- `src/main/sources/project/read-text.ts` (new) -- `readText(absPath)` resolving `undefined` on any error.
- `src/renderer/ui/chat/transcript-entry.ts`, `conversation-state.ts`, `use-conversation.ts` -- `RunCardEntry`; fold `run:*`, `doc:committed`, hydrate `runs`; `doc:prose` bypasses `foldEvent` into a prose store; `dispatchMenu` on `ConversationBridge`; expose `sessionOf` and `runSkill`. `tests/session-contract.test.ts` allows `window.harness.*` calls only in `use-conversation.ts`.
- `src/renderer/ui/chat/prose-store.ts` (new) -- per-run `{path, text}`; `append`, `subscribe`, frame-throttled via an injected `raf`.
- `src/renderer/ui/chat/skill-row.tsx` + `.css` (new), `run-card.tsx` + `.css` (new), `transcript.tsx` (a `run` branch in `Turns`), `shell/shell.tsx` / `app.tsx` (row above composer, prop named `items`, never `menus`).
- `src/renderer/ui/feed/run-note-feed.tsx`, `memlog.ts` (`parseMemlog`, `RunNote`), `chat/format-turn-time.ts`, `outputs/format-age.ts`, `outputs/use-now.ts`, `a11y/announcer.ts` -- reused as is.
- `src/renderer/design/tokens.css` -- append card/skill-row tokens only.
- `tests/negative-surface.test.ts`, `src/renderer/ui/chat/negative-surface.test.tsx`, `shell/negative-surface.test.tsx` -- the skill row now deliberately shows codes and descriptions in the chat column; update those expectations narrowly. `tests/channels-contract.test.ts`, `tests/contract.test.ts`, `tests/replay-corpus.test.ts` (stub `spawn` unchanged) updated for the new counts and field.
- `fixtures/runs/fast-path-sonnet.jsonl` -- main Write at jsonl line 2123: 3,947 deltas, 55,053 chars (the 5,795/69,031 figure is an earlier measurement not in the corpus); then 32 Edits. Memlog entries arrive through Bash `memlog.py append`. `fast-path-opus`/`coaching-path` write documents via Bash heredocs (out of scope).

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/{events,channels,conversation}.ts`, preload, contract/channels/bridge tests -- `run:note` without `callId`, `menu:dispatch`, `runs` snapshot, `dispatchMenu`
- [x] `src/main/fold/{section-headings,coalesce,memlog-tail,run-card}.ts` (+ tests first) -- the pure folds, from the matrix -- everything else composes them
- [x] `src/main/fold/frame.ts`, `route-frame.ts` (+ tests; extend `route-frame.test.ts` corpus replay) -- `tool-results`, pending writes, `doc:committed`, memlog routed to none -- AD-5 on `tool_result`
- [x] `src/main/projections/runs.ts`, `session-run.ts`, `session-registry.ts`, `session-bridge.ts`, `install-model.ts`, `rail-bridge.ts`, `index.ts`, `sources/project/read-text.ts` (+ tests; replay-corpus through the bridge with a fake `schedule`) -- dispatch, run lifecycle, coalescing, memlog tail, attach/detach, reload snapshot
- [x] Parity test `tests/run-card-parity.test.ts` -- the same event sequence through `fold/run-card.ts` and the renderer's fold yields equal card state -- two folds, one truth
- [x] `src/renderer/ui/chat/{prose-store,skill-row,run-card}.*`, `transcript-entry.ts`, `conversation-state.ts`, `use-conversation.ts`, `transcript.tsx`, `shell.tsx`, `app.tsx`, `tokens.css` (+ tests: SSR for markup, `.dom.test.tsx` for rAF/DOM behaviour) -- the UI, tokens only
- [x] Negative-surface, accessibility and literal-guard tests -- narrow updates; `aria-busy` on the card during the run; lifecycle announced once through the single live region, prose never announced
- [x] `_bmad/implementation-artifacts/judgement-3-1-the-beat.md` -- replay `fast-path-sonnet` through the real main pipeline and record the timeline (time to first note, first prose, commit, finished; events per stage); record the real-skill run and the verdict as pending for Sherif -- the AC's judgement cannot be made by the builder
- [x] `sprint-status.yaml` is the build skill's to sync; do not edit it here (the finalize step syncs it, per the invocation's `close`)

**Acceptance Criteria:**
- Given the current persona has a resolved menu and a live session, when the conversation renders, then a row labelled "<Persona> can …" shows each entry's description with a leading code chip above the composer, buttons disabled while that session's turn is in flight, and activating one calls `dispatchMenu(sessionId, code)` only.
- Given a dispatch, when main handles it, then `/<skill>` or the prompt is written as the turn, `run:started` is the run's first event, a run-scoped card appears in time order, and a plain chat turn raises none.
- Given the card exists before any prose, when notes arrive from the memlog, then they render in the mounted feed as they arrive, and the card never shows a spinner, skeleton or stand-in sentence.
- Given `fast-path-sonnet` replayed at full rate, when its 3,947-delta Write streams, then main emits far fewer `doc:prose` events than deltas with the exact text preserved, and the card applies prose with one DOM write per animation frame and no React render per delta.
- Given `run:finished`, then the head reads `saved · <age> · N sections` (N = distinct committed headings), the persona dot moves `work` to `live`, and the caret is removed.
- Given a window reload mid-run, when the snapshot is read, then the card returns with its notes, prose, sections and status.
- Given the full suite, lint, typecheck and build, then all pass, `fold/` stays pure, and no new `@keyframes` beyond `blink`, `eq`, `pulse`.

## Spec Change Log

## Review Triage Log

### 2026-10-03 — Review pass
- verdicts: 42 findings — high 0, medium 6, low 28, false 6, maybe-false 2
- findings:
  - `[medium]` `[defer]` Blind: revision `Edit` text replaces the visible document, so the saved card's body is the last edit's fragment (judgement known limit 6) — real, but story 3.1's own AC names the `Write` call only; revision patching is 3.3 (`revising · §N`, patch the buffer). Deferred with severity medium.
  - `[low]` `[reject]` Blind: run starts after the turn is written, not before — the write's continuation and `startRun` run in the same microtask chain, before any stdout event can be handled; the CLI needs a network round trip before its first frame. Fix (start before write, roll back on failure) adds a rollback path for a window that is not reachable in practice.
  - `[false]` `[reject]` Blind: reloaded cards are not in time order (`hydrate` puts cards after stored entries) — `Turns` runs every entry through `orderEntries`, a stable sort by `at`, so render order is by time whatever the array order (`src/renderer/ui/chat/transcript.tsx:30,63`).
  - `[low]` `[reject]` Blind: notes landing just before the run's end are lost; a batch shares one `at` — a memlog append has to beat the turn's `result` by under the watcher's ~400 ms window; the entry stays on disk and the card is already terminal. One timestamp per observed batch is the designed meaning of `RunNote.time`. A grace window is a design change.
  - `[low]` `[patch]` Blind: `sectionHeadings` mangles intraword underscores (`## Non_Goals` becomes `NonGoals`) and ignores setext/indented code — underscore case patched in `section-headings.ts` (strip `_` only at word boundaries) with a test; setext, indented code and HTML comments are unsupported and left (rare in these documents; rejected as low).
  - `[low]` `[reject]` Blind: `tailMemlog` fragile (unterminated frontmatter, multi-line entries, equal-count rewrite) — `memlog.py` collapses every entry to one line and replaces the file atomically; an unterminated frontmatter fence is not something it writes. Count-based tailing assumes append-only, which the writer guarantees.
  - `[false]` `[reject]` Blind: `memlog-tail.test.ts` reads a live working file — reading the repository's own memlogs as a corpus is the established convention (`tests/run-note-feed.test.ts` does the same); the test asserts a non-empty corpus.
  - `[low]` `[reject]` Blind: skill button reads `CPCreate…`; pressing disables it and drops focus; row can wrap unbounded — the chip and label are separate flex items; disabled-while-busy, wrapping and `+N more` are 3.2's by the epic; the focus drop follows the specified disabled behaviour. Fix (aria-disabled, focus management) is more than a correction.
  - `[medium]` `[defer]` Blind: silent write loss when the project root is spelled unlike the CLI's path, and any in-project `Write`/`Edit` becomes document prose — pre-existing, already recorded in `deferred-work.md` (lines 43 and 47, an Epic 3 decision); this story neither introduced nor was asked to settle it.
  - `[maybe-false]` `[reject]` Blind: Epic 2's silence clock may fire `LINES.quiet` during the empty-body window — the clock restarts on every frame, subagent frames included, and the corpus stream is not silent in the quiet windows; if it did fire it is a transcript line, low.
  - `[maybe-false]` `[defer]` Blind: the empty-body AC is met only by omission (empty until the first note, 704 s in the recording) — the story's AC says the card never renders an empty body; with an empty feed it is empty until the first memlog note. Whether that fails the AC, and what honest content could fill it, is what the story's final AC (recorded beat judgement, pending) and 3.4 settle. If true, high (unverified).
  - `[low]` `[patch]` Blind: spec task checkboxes all unticked — ticked in the spec.
  - `[false]` `[reject]` Blind: Review Triage Log, Spec Change Log and `deferred` are empty — they are filled by this step, in this pass.
  - `[low]` `[reject]` Blind: `epic-3-context.md` repeats the stale 5,795-delta and 8.5-minute figures — they come from `epics.md`; planning artifacts are not edited by a build, and the spec's Code Map already states the corpus figures.
  - `[false]` `[reject]` Blind: `oversized` warning with ~65 files and no split considered — the template says cohesive cross-layer stories stay in one file; the warning is the sanctioned signal.
  - `[low]` `[reject]` Blind: brittle tests (a clock-sensitive `0s` assertion, `rerender` remounts, source-text pins, loosened prohibitions) — developer-only and unlikely to bite; the source-text pins follow this repo's existing contract-test style and the exemptions are named per file; fixes are rewrites, not corrections.
  - `[low]` `[reject]` Blind: unbounded retention of cards and prose, cards vanish on relaunch — bounded by the conversation (about 55 KB per document call, cleared by `conversation.end`); the dead card after relaunch is carried to 3.7 by the epic.
  - `[low]` `[reject]` Edge: memlog count is committed before the run check, so entries with no target are dropped for good — same cause as the near-end note loss above; with no run there is no card to show them on, and with two runs the spec says attribute to neither.
  - `[false]` `[reject]` Edge: a partial last line during an append is shown and never re-emitted — `memlog.py` writes `<name>.tmp` then `os.replace`s it (rail watcher comment), so a reader sees the old or the new file, never a partial line.
  - `[low]` `[reject]` Edge: a memlog rewritten to an equal or greater entry count is read as an append — the writer only appends; same reasoning as the fragility row.
  - `[low]` `[reject]` Edge: run starts after the awaited write (frames in the gap carry no runId, `run:started` not first) — same cause and same refutation as the Blind row on this.
  - `[low]` `[patch]` Edge: a fence line with an info string closes an open fence early — patched in `section-headings.ts` (a closing fence is fence characters then whitespace only), with a test.
  - `[low]` `[patch]` Edge: intraword underscores and asterisks mangled in section names — grouped with the Blind row; one patch.
  - `[low]` `[reject]` Edge: 4-space code, setext headings and HTML comments not tracked — unsupported shapes, rare in BMad documents; fix adds state to the scanner.
  - `[low]` `[reject]` Edge: a memlog observation after its window is gone creates a service for it — the rail watcher is closed with its window, so a late observation is not reachable in practice.
  - `[false]` `[reject]` Edge: duplicate lifecycle announcements — main raises exactly one `run:started` and one terminal event per run, and `foldRunEntry` ignores events for a terminal card; the announce path runs once per event.
  - `[low]` `[reject]` Edge: prose store keeps text for runs with no card and never evicts — a prose event only follows `run:started` from the same stream; memory is bounded by the conversation.
  - `[low]` `[reject]` Edge: a write by a resumed turn after `run:finished` streams nothing and commits nothing — `foldTurn` ends the run only when no background task is live, so the run covers them; an unsent later turn has no card by design (3.5).
  - `[low]` `[reject]` Edge: memlogs outside `_bmad/` are no longer notes (the stream route was removed) — the install, skills and every observed memlog live under `_bmad/`, which the rail watcher walks.
  - `[low]` `[reject]` Edge: any `.memlog.md` change becomes a note of the one running session — with exactly one run in flight attribution is by elimination, as the spec states; a second writer touching another memlog during a run is unlikely and the entry is still a real note of the project.
  - `[low]` `[reject]` Edge: `run:started` is not guaranteed first when frames arrive early — duplicate of the awaited-write rows above.
  - `[medium]` `[patch]` Gap: the `index.ts` wiring from the rail watcher to `sessions.observeArtifact` is verified by no test — test added in `src/main/index.test.ts`.
  - `[low]` `[patch]` Gap: `tests/document-window-contract.test.ts` ordering assertion passes vacuously after `registerRailBridge({` — literal updated.
  - `[medium]` `[patch]` Gap: preload `dispatchMenu` has no behaviour test — three cases added to `tests/bridge-contract.test.ts`.
  - `[low]` `[patch]` Gap: `runSkill`'s `session/busy` branch untested — test added in `use-conversation.test.ts`.
  - `[medium]` `[patch]` Gap: a dispatch whose turn write fails is unverified — test added: `session/write-failed`, no card, not busy.
  - `[low]` `[patch]` Gap: the `resumed` detach is unverified (filed disposition was defer) — a test is a small direct correction, so it was patched rather than deferred.
  - `[low]` `[patch]` Gap: the session-ended test exercises process exit only — close-channel case added.
  - `[low]` `[patch]` Gap: no commit-sections assertion when content deltas precede `file_path` — test added in `route-frame.test.ts`.
  - `[medium]` `[defer]` Intent: the beat's verdict, the real-skill run and the persona's relay of an out-of-project denial are pending — only a human with a real `claude` can judge the beat; recorded in `judgement-3-1-the-beat.md` as pending for Sherif. The epic gates 3.2 onward on it.
  - `[low]` `[patch]` Intent: `close` means the story and sprint status are closed, not left `in-review`/`backlog` — the finalize step sets the spec to `done` and syncs `sprint-status.yaml` (3.1 `done`, epic-3 `in-progress`) in the commit.
  - `[low]` `[reject]` Intent: the diff is a working-tree change with no commit — the finalize step commits it.

## Design Notes

- **Why memlog tailing, not the stream.** The corpus shows notes written by `memlog.py append` through Bash, never `Write`; the architecture already configures the watcher for that script's atomic rename. The stream route in `route-frame.ts` therefore could never produce a note, so the file is the one source and the stream route is switched off (a Write to `.memlog.md` is seen once, by the watcher). Notes get `at` from observation, as `RunNote.time` was designed to.
- **Baseline.** Main keeps every known memlog's entry count current from rail observations; a run records those counts at `run:started` and emits only later entries. With two runs active a note is attributed to neither: a wrong card is worse than a missing note.
- **N sections.** The spec left it open. N is the number of distinct level-2 headings across the run's `ok` commits, so a revision `Edit` adds none that the `Write` already named. Section plan, `§N`, scaffolding exclusion and single-frame removal are 3.3.
- **`live`.** The fold defines it as an attached long-running process, yet the beat needs `work` to `live` at `run:finished`. Decision: attach the session at finish, detach at the next turn or run start. Chat-only personas are unchanged.
- **Failure is thin here.** Any `is_error` result is `run:failed` with the subtype as detail; stopped-versus-failed, the named section reached and the rail reading are 3.7/3.8.
- **Known limits, to carry forward not hide.** (1) The empty-body AC is met only once the first note lands; until then the feed has no rows, and 3.4 owns the dead-air content. The judgement records how long that window was. (2) Opus runs write through Bash and show notes only. (3) Any in-project `Write`/`Edit` becomes prose, source files included. (4) A `projectRoot` spelled unlike the CLI's path (`/tmp` versus `/private/tmp`) drops writes. (5) Notes cannot be attributed under concurrent runs.
- The permission-policy deferral asks 3.1 to show that a write outside the project is denied and relayed by the persona: covered in main by the "outside project" row (no card prose, no commit); the persona's relay is the CLI's own behaviour and is checked in the real run of the judgement.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Launch the app on a project with the BMad install, press a skill button: a card appears, notes stream into it, prose follows, the head ends `saved · just now · N sections`, and the persona dot reads `live`.

## Auto Run Result

**Summary.** A skill row above the composer sends only `menu.dispatch(sessionId, code)`. Main resolves the code, writes `/<skill>` or the prompt verbatim, raises `run:started`, routes `Write`/`Edit` deltas into coalesced `doc:prose`, tails `.memlog.md` into `run:note`, commits once per document call on its `tool_result`, and ends the run on the turn's `result` (`run:finished` / `run:failed`). A run card sits in time order with the Epic 1 note feed above prose that is written to one DOM text node per animation frame. Main holds each card and returns it on `conversation:get`. The persona attaches on `run:finished`, so the dot reads `live`.

**Files changed.** Main: new `fold/{coalesce,memlog-tail,run-card,section-headings}.ts`, `projections/runs.ts`, `session-run.ts`, `sources/project/read-text.ts`; changed `fold/frame.ts`, `fold/route-frame.ts`, `fold/written-paths.ts`, `session-registry.ts`, `session-bridge.ts`, `install-model.ts`, `rail-bridge.ts`, `index.ts`. Shared and preload: `events.ts` (`RunNote` loses `callId`), `channels.ts`, `conversation.ts`, preload `index.ts` and `harness-api.d.ts`. Renderer: new `chat/{prose-store,run-status,run-card,skill-row}`; changed `transcript-entry`, `conversation-state`, `use-conversation`, `transcript`, `composer`, `shell`, `app`, `tokens.css` (appended). Tests beside each module plus `tests/run-card-parity.test.ts` and `tests/run-replay.test.ts`; `_bmad/implementation-artifacts/judgement-3-1-the-beat.md`; `epic-3-context.md`; `sprint-status.yaml` synced (3.1 `done`, epic-3 `in-progress`).

**Review.** 42 triage rows: patches applied 12 (heading fence closing and intraword underscores in `section-headings.ts`; ten test gaps: index wiring, vacuous ordering assertion, preload `dispatchMenu`, `runSkill` busy branch, write-failed dispatch, resumed detach, close-channel run end, held-content commit, spec task ticks, closing the story); deferred 4 (revision `Edit` replaces the visible text, empty body until the first note, project-root spelling and any-write-is-prose, the pending beat judgement); rejected the rest with reasons in the log (false 6, maybe-false 2, low 28 across patched and rejected). Patched by verdict: high 0, medium 3, low 9.

**Follow-up review recommended: true.** Three medium patches landed, and the one path every real note depends on (rail watcher to `observeArtifact` to `run:note`) is verified only with mocks, never in a launched app.

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` unit 2,738 and watchers 55 all passed; `npm run build` exit 0. Matrix audit: every I/O row has a passing covering test (the two-runs row was added in this run).

**Residual risks.**
- The real-skill run, the beat verdict and the persona's relay of an out-of-project write denial have not been done; the beat verdict gates 3.2 onward (`judgement-3-1-the-beat.md`, status pending, judge Sherif).
- In the recorded `fast-path-sonnet` run the card body was empty for 11 min 45 s before the first note; after the run a saved card shows the last `Edit`'s fragment, not the document (both deferred above).
- Opus runs write through Bash heredocs and show notes only. Notes are attributed to neither card while two runs are active.
