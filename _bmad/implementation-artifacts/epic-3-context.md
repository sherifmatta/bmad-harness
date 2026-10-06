# Epic 3 Context: Run a skill — watch it write, stop it, understand however it ends

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the product's central beat real: press a skill button belonging to the persona you are talking to and watch the document being authored — prose streaming in, the section being written now, the sections still to come, and the run's own reasoning through multi-minute silences — never a spinner. Halt the run at any moment with any cost stated on the control before it is pressed, and make every way a run can end (finished, stopped, failed, session gone, contended, relaunched) legible without reading logs. A thin vertical slice landed first because this is the first point in the build where the thesis is testable; depth followed once a live run proved the beat.

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

## Requirements & Constraints

- **Skills are the persona's buttons and nothing else.** A button dispatches only a `code`; main resolves `skill` vs `prompt` and sends either as an ordinary turn. No tooltip or preview from a resolved skill name. Buttons disable while any turn is in flight; `live` does not disable them; the composer is never disabled. No launcher, palette or skills list anywhere.
- **The card is a view of the running skill, never a claim about disk.** Born on run start, dies on the terminal event, pinned atop the chat column while in flight for the viewed persona, collapsed to persona · last run-note reason · elapsed · stop for any other. It follows one subject document (most characters written by `Write`), one buffer per path. Expanding a card focuses the container, never the stop.
- **No denominator anywhere** — `writing · §N <Name>`, never `of M`; the plan is the foot's named list, observed headings win, a seen section is never renumbered. A commit removes every named section in one frame; a revision never advances the counter.
- **The body is never empty** — prose mode or run-note mode; no spinner, skeleton, progress bar or placeholder sentence in any state. A phase word renders only when a feed states it. Subagent output is never the persona's voice.
- **Finishing** reads `saved · just now · N sections`, dot `work`→`live`, caret removed not faded. A persona's own writes during a run or its settle window never raise `note`.
- **Rail annotation** (owner, section, `stopped`, contention) never creates or removes a row or asserts disk state; a row with no annotation reads complete.
- **Stopping costs the turn, not the conversation.** One in-band interrupt on the session's stdin — never SIGINT, which ends a session. Plain `stop` on head and collapsed line, no confirmation, no modal, no "stopping…" state. Unacknowledged interrupt → end the session and say so in the harness's register. The file stays byte-for-byte; nothing offers to restore. Orphaned runs keep card and working stop; roster changes never touch a live run; after relaunch every card is dead with no ticking and no stop.
- **Terminal states** come from the per-turn `result` row — `is_error` and `subtype` only, never `stop_reason` or exit code. A write counts on `tool_result`, one commit event per tool call; an errored result commits nothing. On stop/failure the card names the section reached from the last confirmed write, the tile goes `error` with no text, and the persona explains in its own voice unless the session ended with the run, in which case the harness states the outcome itself and never fabricates a persona voice.
- **Contention is reported, never resolved** — last writer wins; no lock, revert, patch, restore, undo, dialog or bridge command for any of these.
- **Completion when elsewhere (3.10):** exactly one silent native macOS notification per terminal event (finished / stopped / failed), only when the window is unfocused; nothing when focused; nothing for any other event. Copy states, never guides — `John · PRD.md · finished · 15 sections`. Activation raises the window and scrolls to that run's card; it never switches persona, opens a document window or starts anything. No digest across sessions; permission refused or ungranted → show nothing, never ask again. No Dock badge, no sound. Nothing is queued across a quit.
- **Performance:** one observed write was 5,795 deltas / 69,031 chars — coalesce in main, one node per frame, no per-delta component state. Runs are multi-minute; design for the unattended reading first.
- **Accessibility floor:** reduced motion disables all animation globally with no carve-out — elapsed keeps ticking, the caret renders static-on, every dot pairs with a text string. One polite live region per window; prose is never announced (`aria-busy` while in flight), lifecycle events and run notes announce once each, ≤1 per 2s, never assertive. Focus never moves on a terminal event. No `faint`-tier string is a fact's sole carrier.
- **Banned on these surfaces (3.11 audits every card state):** spinners and spinner-sentences, denominators, progress bars, staggered or per-section reveals, per-character typewriter, fading caret, resolve/merge/revert/undo dialogs, "jump to card" controls, badges, toasts, Dock badge, sound.

## Technical Decisions

- Layering flows downward only: `renderer/ui` → `renderer/design` → `shared` → `main/projections` → `main/fold` → `main/sources`. Main folds `stream-json` into domain events; the renderer sends commands and never parses a raw frame. Every event and command is declared once in `shared/` with payload type and cardinality.
- Routing: main-thread `text_delta` outside a tool call is persona speech; `input_json_delta` on `Write`/`Edit` is document prose; memlog appends are run notes and never enter the document buffer; `parent_tool_use_id` marks a subagent.
- `fold/` interpreters are pure over the event sequence (clock injected). The replay corpus in `fixtures/runs/` is critical path; a missing or unusable fixture is a blocker, not missing coverage.
- Main owns all durable state; the card is a main-held projection re-emitted on reconnect — survives a window reload, not an app restart. Projections change only by applying domain events.
- One turn in flight per session, sessions concurrent; a session also takes turns nobody sent, so a `result` row ends *a* turn and the harness's own bookkeeping decides when a session is free.
- Rail rows carry two independent fields no source writes both of: disk `state` (watcher) and `annotation` (stream). Owner is a `sessionId` shown as its `agentId`, never guessed.
- Watcher must handle atomic temp-file renames and coalesce appends inside ~400ms; incremental diffs come only from the stream. Memlog kinds are an open vocabulary with no per-entry timestamp.
- Conventions: events `noun:verb-past`; personas keyed by `agentId`; project-relative POSIX paths and epoch ms in events, elapsed derived from `run:started`; errors `{ code, message, detail? }`, raw stderr never reaches the renderer.
- Every macOS-specific call, including notifications, lives in `src/main/windows/`; no OS branch elsewhere. The harness never writes into the project. Tokens only — a literal colour, dimension or font in a component is a defect.
- Descope boundary: contention and notifications share no file, projection or token with the card; everything else is one state machine.

## UX & Interaction Patterns

- Six card states, two body modes: streaming, revising, quiet (run-note feed as body), stopped/failed (`error`, body left as-is), finished, dead (post-restart).
- Prose in mono, run notes in sans — this register split is the only thing keeping the two apart and must not be weakened. Head status amber while writing, green when saved; body capped at 230px; caret on `steps(1)`, a hard on/off, never a fade.
- Run note: time in tabular mono (column must render correctly empty), kind tag `decision` accent / neutral default / `question`,`gap` warm friction never red, reason with the load-bearing clause emphasised by weight.
- Motion is information or does not exist: `pulse` for a turn in flight, `blink` for the caret, nothing else here. Harness microcopy is lower case, mono, `·`-separated, no terminal punctuation, facts not guidance.
- Keyboard: skill row is one tab stop with arrows; the card is focusable; stop is its own tab stop; the pinned card is first in the chat column's tab order and takes no focus when it pins or unpins.

## Cross-Story Dependencies

- 3.12 → 3.13/3.14 → 3.2 was enforced after the 3.1 live judgement; 3.12's per-path buffers underpin 3.3 and 3.4.
- Head, dot, caret and foot read one projection across 3.1, 3.3, 3.4, 3.5, 3.7, 3.8; 3.5's collapsed form serves 3.7's orphans and 3.14; 3.6's annotation slot is filled by 3.8 and 3.9; 3.8's commit-on-`tool_result` is the same function that drives 3.3's foot.
- 3.10 consumes the terminal events of 3.7/3.8 and the card scroll target of 3.1/3.14, touching nothing in the card. 3.11 audits every surface built by 3.1–3.10.
- Inherited: run-note feed and stub annotation (Epic 1), stop semantics (1.1), replay corpus and turn-queueing item (Epic 2), orphan session (2.11), relaunch dead-card clause (2.7). Epic 4 is independent.
