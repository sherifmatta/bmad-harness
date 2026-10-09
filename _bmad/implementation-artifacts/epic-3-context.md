# Epic 3 Context: Run a skill — watch it write, stop it, understand however it ends

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the central beat real: press a skill button belonging to the persona you are talking to and watch the document being authored — prose streaming in, the section being written now, the run's own work (tool steps, reasoning notes) through multi-minute silences — never a spinner. Halt the turn at any moment, and make every way a run can end (finished, stopped, failed, session gone, contended, relaunched) legible without reading logs.

## Stories

- Story 3.1: Press a button and watch a document write itself (done)
- Story 3.12: A card follows one document (done)
- Story 3.13: A finished run leaves its persona live (done)
- Story 3.14: The running card stays in view (done)
- Story 3.2: The whole menu, and only ever the menu (done)
- Story 3.3: Progress you can read against a plan (done)
- Story 3.4: The card is never empty (done)
- Story 3.5: The run you are not looking at (done)
- Story 3.6: The rail learns who is writing (done)
- Story 3.7: Stop a run, knowing what it costs (done)
- Story 3.8: Understand a run that ended early (done)
- Story 3.9: Two writers, one file, no arbitration (done)
- Story 3.10: Told once, quietly, when you are elsewhere (done)
- Story 3.11: Nothing this epic promised not to do (done)
- Story 3.15: The work that carries on after a stop has a card (done)
- Story 3.16: Tool steps, from the stream (done)
- Story 3.17: The run list: steps and notes in the card body (done)
- Story 3.18: Name the skill a run invoked (new)
- Story 3.19: Stop a turn that is not a run (new)

## Requirements & Constraints

- Skills are the persona's buttons only: a button sends a `code`, main resolves skill vs prompt. No tooltip, launcher or palette from a resolved skill name. Buttons disable while any turn is in flight; the composer never.
- The card is a view of the running skill, never a claim about disk; one subject document, one buffer per path. No denominator (`writing · §N <Name>`, never `of M`). The body is never empty; no spinner, skeleton, progress bar, shimmer, placeholder or pending row. Subagent output is never the persona's voice.
- **Run steps:** each main-thread tool call of a run is one step labelled by verb plus one allow-listed target (project-relative path, skill name, subagent type, host, program name only; about 48 chars). Raw tool input never reaches the renderer. A step shows only for a call that has happened and never reads running after its run ends; at most 300 kept (oldest finished dropped, silently). Plain chat turns and `.memlog.md` writes raise none.
- **Stopping costs the turn, not the conversation:** one in-band interrupt, never SIGINT; no confirmation or "stopping…" state; unacknowledged interrupt ends the session and says so in the harness's register; the file stays as written. Any turn, chat or run, is stoppable; a run always ends stopped, never failed, whichever control was pressed. A stopped plain chat turn is not an error: no failure line, persona not `error`, its words stay, queued user messages untouched, one harness-register line records it (wording a UX placeholder). The room keeps its own rule (a send interrupts the speaker), no header Stop.
- Terminal states come from the per-turn `result` (`is_error`, `subtype`), never `stop_reason` or exit code. On stop/failure the persona explains in its own voice unless the session ended, then the harness states it and never fakes a persona voice.
- **Skill name:** a recorded fact on a started run only — set by main when the entry resolved to a skill (not a prompt entry; dropped if not a plain bounded name), kept on the card, inherited by a carry-on run. Nothing re-resolves or dispatches by it; handoff syslines stay `handed to <Name>`.
- Contention is reported, never resolved. One silent native notification per terminal event, only when unfocused.
- Performance: coalesce in main, one node per frame; no per-delta state or event (writes reach ~5,800 deltas).
- Accessibility: reduced motion disables all animation (elapsed ticks, caret static); one polite live region, prose and steps never announced; focus never moves on a terminal event; no faint string is a fact's sole carrier.
- **Run list (built, 3.17):** the card body is `RunList` (`ui/chat/run-list.tsx`): start row, then each step in `entry.steps` order preceded by the notes up to its `notesBefore` (clamped), remaining notes last; pure `runListRows`/`writesDocument` in `run-status.ts`. A card with no subject path, plan or document is the list alone: head `run` · `working` · elapsed · stop, no foot. A step still `running` on a card that is not draws `✕` and does not pulse.
- Banned (3.11 audits every card state, steps included, built from recorded events): spinners, denominators, bars, shimmer, typewriter, fading caret, pending steps, revert/undo dialogs, badges, toasts, sound.

## Technical Decisions

- Layering flows downward only: `renderer/ui` → `renderer/design` → `shared` → `main/projections` → `main/fold` → `main/sources`. Main folds `stream-json`; the renderer never parses a frame. Events and commands are declared once in `shared/`.
- Routing: main-thread `text_delta` outside a tool call is persona speech; `input_json_delta` on `Write`/`Edit` is document prose; memlog appends are run notes; `parent_tool_use_id` frames are subagent activity, dropped before the fold (the spawning main-thread call is one step).
- `run:step` is a union on `status`: `running` with label (at `content_block_stop`), then exactly one `done`/`failed` (`is_error`) on `tool_result`; a call with no result is closed `failed` on the card at the run's terminal `at`. A document write shares its `callId` with its `doc:*` events. Label derivation is a pure `fold/` module over a closed table, buffering only the one decoded field. Time is injected.
- `RunCardSnapshot` gains `steps` (`callId, label, status, startedAt, endedAt?, notesBefore`) and `skill`, both additive: `CONTRACT_VERSION` and `TRANSCRIPT_VERSION` unchanged, old files load without them, a run cut off by exit reads back with running steps `failed`. Steps and notes interleave by fold order (`notesBefore`), never timestamp. Main and renderer fold the same card; `tests/run-card-parity.test.ts` keeps them equal. `run:step` changes neither persona state nor rail annotations.
- `turn.stop(sessionId)` sits beside `run.stop(runId)` (`ok`/`not-found`, not-found silent). Both reach one path in `session-stop.ts`; for a plain turn main sets the entry's `interrupting` mark before writing the interrupt, so the failed `result` reads as a stop. Ack windows unchanged.
- The replay corpus in `fixtures/runs/` is critical path: running-step count must equal main-thread non-memlog tool calls counted independently from raw frames, and an interrupted plain chat turn must be replayed (record one if absent).
- Main owns durable state; cards are main-held projections re-emitted on reconnect. One turn per session, sessions concurrent; a session also takes turns nobody sent. Events `noun:verb-past`; project-relative paths, epoch ms. macOS calls live only in `src/main/windows/`. The harness never writes into the project. Tokens only.

## UX & Interaction Patterns

- Card states: streaming, revising, quiet, stopped/failed, finished, dead. Body is prose or the run list: one time-ordered list, newest last, of step rows and run notes; when prose starts, earlier rows stay above it in the same scroll container.
- Step row: grid `14px · 1fr · auto`, 9px gap, 3px vertical padding, no rules. Mark `✓` green done, amber `work` dot with the existing pulse while running, `✕` red failed; mono label (`dim` done, `text` running); tabular-mono elapsed (`faint` done, `now` in `dim` while running so liveness survives reduced motion). The pulse is the only motion added. No tab stop on rows.
- A run writing no document: head reads `run`, `working`, elapsed, stop, with no foot. Head reads `<skill> run` (name in `ident`, weight 600; `run` in `dim`), or `run` alone.
- Prose mono, run notes sans; caret `steps(1)`, never a fade; harness microcopy lower case, mono, `·`-separated, no terminal punctuation.
- Chat header: one ghost button whose label switches between `Stop` (any turn in flight, same frame) and `close session`, so focus stays on it; no confirmation, cost copy or "stopping…" state. An orphaned session keeps `close session` and its note line; its run keeps the card's stop.
- Keyboard: skill row one tab stop with arrows; card focusable; stop its own tab stop; pinned card first in the chat column's order.

## Cross-Story Dependencies

- 3.12 → 3.13/3.14 → 3.2; 3.12's per-path buffers underpin 3.3/3.4. Head, dot, caret and foot read one projection across 3.1, 3.3–3.5, 3.7, 3.8.
- 3.15 follows 3.7/3.8 (carry-on run takes the stopped run's `code`, plan and, via 3.18, `skill`).
- 3.16 follows 3.15 and precedes 3.17 (renders its steps in the 3.4 body and Story 1.5's note feed). 3.18 depends on 3.1, 3.15, 3.17 (head form); Story 6.1's evidence is re-read against the new `run:started`. 3.19 depends on 3.7 and Story 2.14 (chat header).
- 3.10 consumes 3.7/3.8 terminal events; 3.11's audit covers every surface 3.1–3.19 built.
- Inherited: run-note feed (Epic 1), stop semantics (1.1), replay corpus (Epic 2), orphan session (2.11), queued-message take-back (2.5). Epic 4 is independent.
