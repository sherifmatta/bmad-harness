# Epic 2 Context: Talk to a persona — a conversation that holds

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Hold a real conversation with any installed persona in their own voice, hand off to another persona mid-conversation without a restart, type during a long turn without being blocked, and find the transcript intact after closing and reopening the app. This is the conversational half of the product and stands alone. It also declares the full events-out/commands-in contract and records the replay corpus that Epic 3 builds against. Amended 2026-10-09: the chat reads as colleagues talking (flat rows, initials discs), and a handoff's typed `@name` stays in the user's turn.

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
- Story 2.14: The chat look: flat rows, initials discs, one-line header (added 2026-10-09; built, this story is its acceptance)
- Story 2.15: The @name you typed stays in your turn (added 2026-10-09)

## Requirements & Constraints

- **The harness never authors persona words.** Only main-thread `text_delta` renders as a persona turn, and neither a persona's words nor the user's are ever parsed, framed, prefixed or styled. Persona `identity` and `communication_style` are never injected; the session activates the agent's own skill.
- **One turn in flight per session, sessions concurrent.** A session also takes turns nobody sent (background subagents waking the main thread), so a `result` row ends *a* turn, not necessarily the sent one; it must not free the session for a queued message or set the persona idle while the sent turn is in flight.
- **The composer is never disabled.** A message typed mid-turn appears at once, dimmed, marked `queued · sends when <Persona> finishes`, cancellable, sent on `session:awaiting-turn`, un-dimmed in place. Focus stays in the composer. `Enter` sends, `Shift+Enter` newlines.
- **Persona state** is a projection: `idle`, `work`, `live`, `note`, `error`; a tile aggregates every session with its `agentId`. Every dot has a text state string; reduced motion needs a ticking elapsed counter.
- **Persistence:** only the transcript persists, per project under `userData`, never inside the project root. After relaunch the transcript is present, every persona is `idle`, cards are dead, nothing offers to resume. A window reload loses nothing (main re-emits its projection). `conversation.end(projectId)` is the only way to clear a transcript, a plain lifecycle control, never a suggestion.
- **Handoff** (tile click or `@<name>` in the 1:1 composer, which addresses personas only, never skills): opens that persona's session and continues the same transcript; focus stays on the tile. The sysline reads `handed to <Name>` and nothing more (no files, arrow or skill), in the harness register. It never claims context continues.
- **Orphaned sessions:** if an agent vanishes from the install mid-session, the live session is untouched and keeps a keyboard-reachable `close session`. Card and relaunch clauses are carried to Epic 3.
- **Decision-option block** appears only when the persona raised one; each option is a tab stop; activating sends it as the user's turn and removes the block; no chosen, default, recommended or sorted state.
- **Negative surface** (verified in 2.13): composer parses no skill names; no tooltip derived from a skill name; no refusal-with-handoff; no spinner or skeleton doing a sentence's job; no sound, no Dock badge. Harness microcopy is lower case, mono, `·`-separated, no terminal punctuation.
- **Corpus:** `fixtures/runs/` holds raw CLI frames for a fast-path single write, a coaching-path batched write, an interrupt (in-band and `SIGINT`) and a budget-induced gate failure (a natural one was not obtained; the gap is stated). Epic 3 treats a missing corpus as a blocker.
- **Chat look (2.14):** no portrait in the chat thread or header, in the 1:1 or party view; portraits only on Team tiles, cast cards, cast chooser and Welcome (36 or 44px). Persona turn is a flat row (26px neutral initials disc, name, role, `HH:MM` mono time on one baseline, words below, no box, 16px between turns, no relative time); the user's disc is tinted and otherwise the same row; the chat header is one 46px line (22px disc, name, `title · story <id>` with the story omitted until a source exists, status pill, `close session`). No `Stop` here (3.19), no run list (3.17).
- **Typed mention (2.15):** a handoff typed with text after `@name` sends `turn.send(sessionId, text, mention?)`; `mention` is the literal token (case kept) and is optional and additive; the persona receives only `text` (a test on stdin bytes asserts no `@name`). Main silently drops a mention that is not `@` plus one token naming the receiving persona (case-insensitive against roster `name`); a room never takes one. `UserRecord`, `QueuedMessage` and `UserEntry` carry it, so queued, reloaded and restored turns show the chip as live; old transcripts load plain and `TRANSCRIPT_VERSION` is unchanged. No text after the name means no turn, only the sysline. The chip is its own element, not a control, and its anatomy is added to `DESIGN.md` first.

## Technical Decisions

- **Session command:** `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`, with `/bmad-agent-<x>` as the first stdin turn. Those flags are load-bearing and each asserted by a test; `--forward-subagent-text` is not passed.
- **Turn completion:** a `result` row arrives per turn, not per process. `is_error: true` marks stopped or failed (`subtype` says which); its absence marks finished. `stop_reason` is never tested; exit code is not the signal.
- **Contract is declared once in `src/shared/`, types only,** each event and command with an explicit payload type and cardinality; no renderer-only events; the renderer never parses a raw frame. Events out: `session:opened`, `session:awaiting-turn`, `session:closed`, `persona:said`, `persona:state`, the `run:*` and `doc:*` set that Epic 3 consumes (`run:step` was added later), and `rail:changed`. Commands in: `session.open(agentId)`, `session.close(sessionId)`, `turn.send(sessionId, text, mention?)` (AD-25), `menu.dispatch(sessionId, code)`, `run.stop(runId)`, `turn.stop(sessionId)` (Epic 3), `doc.open(path)`, `conversation.end(projectId)`.
- **Routing in main:** main-thread `text_delta` outside a tool call is `persona:said`; a document write's `input_json_delta` is `doc:prose`; `.memlog.md` writes are `run:note`; anything with `parent_tool_use_id` is subagent activity.
- **Identity:** `sessionId` keys session things, `runId` run things; `agentId` may be absent for party sessions; personas are keyed by `agentId`, never display name. Initials come from the roster `name` via the pure `initialsOf`, and are presentation, never a key.
- **Purity and layering:** `fold/` interpreters are pure, with no I/O and no wall clock except injected; projections change only by applying a domain event; no layer arrow points upward.
- **Stop semantics (settled):** an in-band interrupt ends the turn and keeps the session; `SIGINT` ends the session and is not the stop mechanism. A session ends only through `session.close`, `conversation.end` or process exit.
- **Continuity model:** a handoff starts a new session; continuity is carried by artifacts on disk and a shared transcript, not process. Story 2.12 decides whether that satisfies the "no handoff reads as a restart" claim and records a gap with a remedy if not.
- **Logs and fixtures:** raw `stream-json` per session under `userData`, stamped with the contract version, bounded and pruned oldest-first; fixtures keep raw frames so a contract bump never invalidates the corpus.
- **Menu work (2.1):** the app menu regains zoom and a project-window reload via Electron roles; the document window gets zoom only.
- **Standing rule:** an acceptance criterion that references an external format cites the file it was read from.

## UX & Interaction Patterns

- Thread and composer inner are capped at 940px. Everything a project or persona supplies renders as text; no hover lift, entrance animation or typewriter reveal; all animation off under reduced motion.
- **Composer:** `panel` ground, 1px `line`, `card` radius; textarea grows 20 to 120px; field and send button are each tab stops.
- **Sysline:** centred mono in `faint` with a rule either side, never attributed to a persona.
- **Status dot:** five states, four colours; halo only on `work` and `live`; amber fill unique to `work`.
- **Decision block:** `panel-2`, 5px radius, options stacked, a leading A/B/C key badge as its single accent use.
- **Focus and live region:** one `:focus-visible` treatment; persona activation and queued sends never move focus; exactly one polite live region, throttled to one announcement per 2s.
- **Product test:** if the chat reads as a chat box with a portrait glued on, it has failed. The reference is `mockups/chat-thread-reference.png`; four older mockups still show the superseded turn look, and the spec wins over them.

## Cross-Story Dependencies

- 2.1 starts first and runs alongside 2.2 to 2.4; it is critical path for Epic 3 (its menu criteria are the one place it needs harness code).
- 2.2 (contract) underpins everything; 2.4 emits it, 2.5 and 2.6 project from it, Epic 3 consumes `doc:*` and `run:*`.
- 2.5 builds on the 2.3 composer and `session:awaiting-turn`. 2.7 (persistence) underlies 2.8 and 2.9. 2.9 depends on 2.4 and the Epic 1 roster and tiles; 2.12 validates 2.9's model. 2.11 depends on Epic 1's re-resolve-on-change and 2.4's sessions.
- 2.14 is built; 2.15 depends on 2.5, 2.9 and 2.14 (the row look and the `handed to <Name>` sysline) and touches `turn.send` (AD-25), `UserRecord` and the queue types.
- 2.13 runs last. Whether a queued message reads as honest during a long run is answered only in Epic 3.
- Epic 1 provides roster, tiles, shell, tokens, accessibility floor, rail and document window. Epic 3 later adds the Stop in the chat header (3.19), the run list (3.17) and the card behaviour carried from 2.7 and 2.11.
