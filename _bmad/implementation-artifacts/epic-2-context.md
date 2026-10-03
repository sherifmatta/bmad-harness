# Epic 2 Context: Talk to a persona — a conversation that holds

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Hold a real conversation with any installed persona in their own voice, hand off to another persona mid-conversation without a restart, type during a long turn without being blocked, and find the transcript intact after closing and reopening the app. This is the conversational half of the product and is usable on its own. It also declares the full events-out/commands-in contract and records the replay corpus Epic 3 builds against.

## Stories

- Story 2.1: A recorded corpus to build against
- Story 2.2: One contract across the bridge
- Story 2.3: The turn and the composer
- Story 2.4: Open a session and hear back
- Story 2.5: Type while they work
- Story 2.6: Every indicator means something
- Story 2.7: The conversation is still there tomorrow
- Story 2.8: End a conversation deliberately
- Story 2.9: Hand the work to the next persona
- Story 2.10: When a persona stops to ask
- Story 2.11: A session outlives the install changing under it
- Story 2.12: Confirm continuity actually holds
- Story 2.13: Nothing this epic promised not to do

## Requirements & Constraints

- **The harness never authors persona words.** Only main-thread `text_delta` renders as a persona turn, and the UI never styles, frames, prefixes, summarises or classifies it. `identity` and `communication_style` are never injected; the session activates the agent's own skill, which loads them.
- **One session per active persona, not per run.** The harness serialises the turns it sends: one chat or run turn in flight per session, different sessions concurrent. A session also takes turns nobody sent (background subagents finishing wake the main thread), so a `result` row ends *a* turn, not necessarily the one sent. Such a row must neither end the sent turn, nor free the session for a queued message, nor set the persona idle while the sent turn is still in flight.
- **The composer is never disabled.** A message typed mid-turn appears in the transcript in the same frame, dimmed and marked `queued · sends when <Persona> finishes`. It is cancellable, sends on `session:awaiting-turn`, and un-dims in place without moving. Focus stays in the composer. `Enter` sends, `Shift+Enter` is a newline, `⌘↵` appears nowhere.
- **Persona state is a projection with one source each:** `idle`, `work` (any turn in flight, through quiet subagent phases), `live` (long-running attached process; does not disable skill buttons), `note` (watcher saw a change to a file the persona owns), `error` (last run failed or was stopped). A tile aggregates every session carrying its `agentId`. Every dot has a text state string; under reduced motion liveness rides the amber `work` fill and an elapsed counter ticking at 1s or better.
- **Persistence and restart:** only the transcript is persisted, per project under `userData` keyed by project path, and nothing is written inside the project root. Session state and the install model live in main and are not persisted; the install model is re-derived from disk on launch. A window reload loses nothing because main re-emits its projection on reconnect (who owns the queue is an open ruling). After relaunch the transcript is present, every persona is `idle`, cards are dead (no ticking, no stop control), and nothing offers to resume. Sessions are reclaimed only on persona close or session end, never silently.
- **`conversation.end(projectId)` is the only way to clear a transcript.** It is project-scoped and a lifecycle control, never a next-step suggestion, with no highlighting or badging.
- **Handoff:** activating another tile opens that persona's session, rebuilds the skill row, and continues the same transcript; focus stays on the activated tile (`aria-current`). `@<name>` in the 1:1 composer hands off, addressing a persona only and never a skill. The sysline reads `handed off · <from> → <to> · picking up from <files>`, with `<from>` and `<to>` fixed in the order of the user's actions. It is written only when the transcript has turns, the target differs from the current persona, the open succeeded, and `<from>` has replied since it was last opened; the first switch after a reload or relaunch writes none. Files are project-relative paths from successful `Write` or `Edit` calls only, in write order, each once. Shell-written files are not named, and that limit is stated. The sysline never claims context continues.
- **Orphaned sessions:** if an agent vanishes from the install mid-session, re-resolution updates roster and menus but never touches the live session. It keeps its transcript and a working, keyboard-reachable `close session` control until the user closes it; no tile exists for it. Its document card and stop control cannot exist until runs do, so those clauses are carried to Epic 3, as is the dead-card-after-relaunch clause. The close control is reachable only while the shell is mounted, i.e. while at least one agent still resolves; that limit is accepted and recorded.
- **Decision-option block:** appears inside the persona's own turn only when the persona raised one. Each option is its own tab stop; activating one sends it as the user's turn and removes the whole block. No chosen state, disabled state, recommended styling, default selection or sort order.
- **Negative surface (verified in the final story):** composer parses no skill names; no tooltip or chrome derived from a skill name; no refusal-with-handoff (the `@` syntax ships, the persona volunteering a handoff does not); no spinner, skeleton or sentence doing their job, including while a session opens; no sound and no Dock badge.
- **Harness microcopy** is lower case, mono, `·`-separated, no terminal punctuation, stating facts.
- **Corpus:** `fixtures/runs/` holds the Fast-path single large write (revision edits afterwards, plus a quiet parallel-subagent window), a Coaching-path batched write, an interrupt mid-write recorded as two files (in-band, where the session survives, and `SIGINT`, where it ends), and a reviewer-gate failure. A natural gate failure was not obtained: the recorded one is induced by a budget cap, and the gap is stated. Epic 3 treats a missing corpus as a blocker.

## Technical Decisions

- **Session command:** `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`, with `/bmad-agent-<x>` as the first stdin turn, not a positional prompt. `--include-partial-messages`, `--setting-sources project,local` and `--input-format stream-json` are load-bearing and each is asserted by a test. `--forward-subagent-text` is deliberately not passed. `project,local` excludes the user source, so sessions see only the target project's skills.
- **Turn completion:** a `result` row arrives per turn, not per process. `is_error: true` marks stopped or failed and `subtype` says which kind (`error_during_execution`, `error_max_budget_usd`, others); its absence marks finished. `stop_reason` is never tested, since it is not stable across outcomes. Process exit code is not the signal.
- **Contract declared once in `src/shared/`, types only.** Fourteen events out: `session:opened`, `session:awaiting-turn`, `session:closed`, `persona:said`, `persona:state`, `run:started`, `run:note`, `doc:section-opened`, `doc:prose`, `doc:committed`, `run:finished`, `run:stopped`, `run:failed`, `rail:changed`. Seven commands in: `session.open(agentId)`, `session.close(sessionId)`, `turn.send(sessionId, text)`, `menu.dispatch(sessionId, code)`, `run.stop(runId)`, `doc.open(path)`, `conversation.end(projectId)`. Each carries an explicit payload type and cardinality. No renderer-only events; the renderer sends commands and never parses a raw frame.
- **Routing rules (fold in main):** main-thread `text_delta` outside a tool call is `persona:said`; `input_json_delta` on a document write is `doc:prose`; writes to `.memlog.md` are `run:note` and never `doc:prose`; anything with `parent_tool_use_id` is subagent activity. Which tool carries a document write depends on the model (Write/Edit versus Bash heredocs), which Epic 3's interpreter must handle.
- **Identity:** `sessionId` keys session-scoped things, `runId` run-scoped things. `agentId` may be absent for party sessions. Personas are keyed by `agentId`, never display name.
- **Purity and layering:** `fold/` interpreters are pure with no I/O and no wall clock except injected; projections change only by applying a domain event; no layer arrow points upward.
- **Logs and fixtures:** each session writes raw `stream-json` under `userData`, stamped with the contract version, bounded per project and pruned oldest-first. Fixtures store raw CLI frames, so the version is forensic metadata and never a validity constraint. The raw log is never the authority for what the UI shows on restart. Whether to build this log in Epic 3 or amend the requirement is an open ruling.
- **Stop semantics (settled in Epic 1):** an in-band interrupt on stdin ends the turn and keeps the session; `SIGINT` ends the session and is not the stop mechanism. Any earlier text saying otherwise is stale. A session ends only through `session.close`, `conversation.end` or process exit.
- **Continuity model:** a handoff starts a new session; continuity is carried by artifacts on disk and a shared transcript, not by process. Story 2.12 validates whether that satisfies the claim that no handoff presents as a restart, and records a gap with a remedy if not. The ruling is still open.
- **Menu work carried from the Epic 1 retro (Story 2.1):** the role-only application menu in `src/main/windows/app-menu.ts` regains zoom in/out/reset and a project-window reload, each via an Electron role. The document window gets zoom only, with no reload. The Epic 1 negative-surface check asserts reload is absent for the document window rather than from the menu altogether.
- **Standing rule:** an acceptance criterion referencing an external format cites the file it was read from.

## UX & Interaction Patterns

- **Conversation turn:** `card`-radius container, `12px 10px` padding, 12px gap, turns 2px apart. A 32px portrait on the left; a header of name (12.5px/600), role (faint, sans) and a right-aligned mono timestamp; then words in the sans register at body-ui size, `pre-wrap`, paragraphs split on blank lines only. Everything a project or persona supplies renders as text. **User turn:** the same component, with an `accent-wash` ground, `inset 2px 0 0 accent-edge` left rule and a 32px initials token. No hover lift, entrance animation or typewriter reveal. Thread and composer inner are capped at 940px, the chat header's second line at 72ch.
- **Composer:** `panel` ground, 1px `line`, `card` radius, border shift on focus-within; textarea auto-grows 20px to 120px, sized from content; send button with its own ground, border, glyph and hover; hint lines at `label` in `meta`. Field and send button are each tab stops with the shared focus treatment.
- **Sysline:** centred mono in `faint` with a rule either side, never styled as or attributed to a persona. It carries handoff and other harness notices.
- **Status dot:** five states in four colours; halo only on `work` and `live`; amber fill unique to `work`.
- **Decision block:** `panel-2` block, 5px radius, 12.5px/600 title, options stacked at 6px, a leading A/B/C key badge as the block's single accent use, option text at line-height 1.45.
- **Focus and live region:** one `:focus-visible` treatment; persona activation keeps focus on the tile; a queued send never moves focus. Exactly one polite live region per window, throttled to one announcement per 2s, queued, never merged into counts, never assertive.
- **Motion:** no typewriter streaming, spinner or entrance animation; all animation off under reduced motion.
- **Product test:** if it reads as a chat box with a portrait glued on, it has failed.

## Cross-Story Dependencies

- **2.1 starts first and runs alongside 2.2 to 2.4.** It costs elapsed time rather than dev time and is critical path for Epic 3. Its menu-restoration criteria are the exception to its "needs no harness code" premise; the reload criterion is exercised again in 2.7.
- **2.2 (contract) underpins everything.** 2.4 emits it, 2.5 and 2.6 project from it, and Epic 3 consumes the `doc:*` and `run:*` events declared here.
- **2.3 and 2.4 together make a first hearable conversation;** 2.5 builds on the composer and on `session:awaiting-turn`.
- **2.7 (persistence)** underlies 2.8, which clears what 2.7 persists, and 2.9, whose handoff transcript must survive reload and restart.
- **2.9 depends on 2.4**, on the Epic 1 roster and tiles, and on artifacts the rail has already observed. 2.12 validates the model 2.9 implements.
- **2.11 depends on Epic 1's re-resolve-on-change** and on 2.4's live sessions. Its card and stop clauses are carried to Epic 3.
- **2.13 runs last** and reviews this epic's surfaces. Whether a queued message reads as honest during a long run is answered only in Epic 3, since this epic has no long runs.
- **Epic 1 provides** the roster, tiles, shell, tokens, accessibility floor, portraits, rail and document window. Epic 3 later feeds the same sessions with menu runs, streamed documents, the stop control, and the orphan and relaunch card behaviour carried from 2.7 and 2.11.
