# Epic 2 Context: Talk to a persona — a conversation that holds

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Hold a real conversation with any installed persona in their own voice, hand off to another persona mid-conversation without a restart, type during a long turn without being blocked, and find the transcript intact after closing and reopening the app. This is the conversational half of the product and is usable on its own. It also declares the full events-out/commands-in contract and starts the recorded replay corpus that Epic 3 depends on.

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

- **The harness never authors persona words.** Only main-thread `text_delta` renders as a persona turn; the UI never styles, frames, prefixes, summarises or classifies it. `identity` and `communication_style` are never injected; the session activates the agent's own skill, which loads them.
- **One session per active persona, not per run.** Turns within a session are strictly serialised (one chat or run turn in flight); different sessions run concurrently. Chat turns and skill invocations are both turns into the same session.
- **The composer is never disabled.** A message typed mid-turn appears in the transcript in the same frame, dimmed and marked `queued · sends when <Persona> finishes`. It is cancellable, sends on `session:awaiting-turn`, and un-dims in place without moving. Focus stays in the composer. `Enter` sends, `Shift+Enter` is a newline, and `⌘↵` appears nowhere.
- **Persona state is a projection with one source each:** `idle`, `work` (any turn in flight, persisting through quiet subagent phases), `live` (long-running attached process; does not disable skill buttons), `note` (watcher saw a change to a file the persona owns), `error` (last run failed or was stopped). A tile aggregates every session carrying its `agentId`. Every dot is paired with a text state string; under reduced motion, liveness rides the amber `work` fill and an elapsed counter ticking at 1s or better.
- **Persistence and restart:** transcript, session state and install model live in main, persisted per project under `userData` keyed by project path, with nothing written inside the project root. A window reload loses nothing, including a turn in flight, because main re-emits its projection on reconnect. Sessions are not held across app restarts: after relaunch the transcript is present, every persona is `idle`, cards are dead (no ticking, no stop control), and nothing offers to resume. Sessions are reclaimed only on persona close or session end, never silently.
- **`conversation.end(projectId)` is the only way to clear a transcript.** It is project-scoped and a lifecycle control, never a next-step suggestion, with no highlighting or badging.
- **Handoff:** activating another tile opens that persona's session, rebuilds the skill row, and continues the same unbroken transcript. Focus stays on the activated tile (`aria-current`). `@<name>` in the 1:1 composer hands off; it addresses a persona only and never a skill. The sysline reads `handed off · <from> → <to> · picking up from <files>`, naming artifacts in write order, and never claims context continues.
- **Orphaned sessions:** if an agent vanishes from the install mid-session, re-resolution updates roster and menus but never touches the live session. It keeps transcript, card, and working stop and close controls (keyboard-reachable, shared focus treatment) until the user closes it. No tile exists for it.
- **Decision-option block:** appears inside the persona's own turn only when the persona raised one. Each option is its own tab stop (click or `Enter`/`Space`). Activating one sends it as the user's turn and removes the whole block. There is no chosen state, disabled state, recommended styling, default selection or sort order, and a stated lean is the persona's own words.
- **Negative surface (verified in the final story):** composer parses no skill names; no tooltip or chrome derived from a skill name; no refusal-with-handoff (the `@` syntax ships, the persona volunteering a handoff does not); no spinner or skeleton or sentence doing its job, including while a session opens; no sound and no Dock badge.
- **Harness microcopy** is lower case, mono, `·`-separated, no terminal punctuation, stating facts.
- **Corpus:** `fixtures/runs/` must hold four scenarios: Fast-path single large write (with revision `Edit`s and a quiet parallel-subagent window), Coaching-path batched write, an interrupt mid-write, and a reviewer-gate failure. If the failure cannot be induced naturally, record it as a known gap rather than hand-writing a fixture. Epic 3 treats a missing corpus as a blocker.

## Technical Decisions

- **Session command:** `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`, with `/bmad-agent-<x>` sent as the first stdin turn, not as a positional prompt. Three flags are load-bearing: `--include-partial-messages`, `--setting-sources project,local` and `--input-format stream-json`; each must be asserted by a test. `--forward-subagent-text` is deliberately not passed. `project,local` excludes the user source, so sessions see only the target project's skills.
- **Contract declared once in `src/shared/`, types only, no behaviour.** Fourteen events out: `session:opened`, `session:awaiting-turn`, `session:closed`, `persona:said`, `persona:state`, `run:started`, `run:note`, `doc:section-opened`, `doc:prose`, `doc:committed`, `run:finished`, `run:stopped`, `run:failed`, `rail:changed`. Seven commands in: `session.open(agentId)`, `session.close(sessionId)`, `turn.send(sessionId, text)`, `menu.dispatch(sessionId, code)`, `run.stop(runId)`, `doc.open(path)`, `conversation.end(projectId)`. Each carries an explicit payload type and stated cardinality. No renderer-only events; the renderer sends commands and never parses a raw frame.
- **Routing rules (fold in main):** main-thread `text_delta` outside a tool call is `persona:said`; `input_json_delta` on a document write is `doc:prose`; writes to `.memlog.md` are `run:note` and never `doc:prose`; anything with `parent_tool_use_id` is subagent activity. Verify with synthetic frames.
- **Identity:** `sessionId` keys session-scoped things, `runId` run-scoped things. `agentId` may be absent (party sessions belong to the room). Personas are always keyed by `agentId`, never display name.
- **Purity:** `fold/` interpreters are pure functions of the event sequence, with no I/O and no wall clock except injected. Projections change only by applying a domain event. Layer arrows never point upward (View, Design, Bridge, Projections, Fold, Sources).
- **Logs and fixtures:** each session writes raw `stream-json` to a log under `userData` stamped with the contract version. Fixtures store raw CLI frames, not domain events, so the version is forensic metadata and never a validity constraint.
- **Stop semantics (resolved in Epic 1):** an in-band interrupt keeps the session; `SIGINT` ends it. Earlier planning text asserting `SIGINT` as the stop mechanism is stale. The session lifecycle must account for the stop path not leaving a persona to explain itself.
- **Continuity model:** a handoff starts a new session; continuity is carried by artifacts on disk and a shared transcript, not by process. Story 2.12 validates whether this satisfies the "no handoff presents as a restart" claim, and records a gap with a remedy if it does not.
- **Menu work carried in from the Epic 1 retro (Story 2.1):** the role-only application menu in `src/main/windows/app-menu.ts` must regain zoom in/out/reset and a project-window reload, each via an Electron role. The document window gets zoom only, with no reload entry enabled. The Story 1.14 negative-surface check is amended to assert reload is absent for the document window rather than from the menu altogether.
- **Standing rule:** any acceptance criterion referencing an external format cites the file it was read from, because formats described from memory have repeatedly been wrong.

## UX & Interaction Patterns

- **Persona turn:** `card`-radius container with a 32px portrait, name, role and timestamp; words in the sans register at body-ui size. **User turn:** same container, `accent-wash` ground with an `inset 2px 0 0 accent-edge` left rule and the 32px initials avatar. Thread and composer inner are capped at 940px; the chat header's second line at 72ch. The conversation turn is not a named component in DESIGN.md today, so Story 2.3 adds it there.
- **Composer:** `panel` ground, 1px `line`, `card` radius, border shift on focus-within, textarea auto-growing 20px to 120px, send button with its own ground, border, glyph and hover, and hint lines at `label` in `meta`. Composer field and send button are each tab stops with the shared focus treatment.
- **Sysline:** centred 10.5px mono in `faint` with a rule on either side; never styled as or attributed to a persona. It carries session-resumed, handoff and room-opened notices.
- **Status dot:** 6px, five states in four colours; halo only on `work` and `live`; amber fill unique to `work`. Under reduced motion `work` is carried by the fill plus the ticking counter.
- **Decision block:** `panel-2` block, 5px radius, 12.5px/600 title, options stacked at 6px, a leading A/B/C key badge as the block's single accent use, option text at line-height 1.45.
- **Focus:** one `:focus-visible` treatment everywhere; a persona activation keeps focus on the tile; a queued send never moves focus.
- **Live region:** exactly one polite live region per window; announcements are throttled and queued, never merged into counts, and never assertive.
- **Motion:** only the five declared animations, all off under reduced motion. No typewriter simulation of streaming prose, no spinner, no entrance animation.
- **Product test:** if it reads as a chat box with a portrait glued on, it has failed.

## Cross-Story Dependencies

- **2.1 starts first and runs alongside 2.2 to 2.4.** It costs elapsed time rather than dev time, and its completion is critical path for Epic 3. Its menu-restoration criteria are the one exception to its "needs no harness code" premise. The reload criterion is exercised again in 2.7.
- **2.2 (contract) underpins everything else.** 2.4 (session) emits it, 2.5 and 2.6 project from it, and Epic 3 consumes the `doc:*` and `run:*` events declared here.
- **2.3 (turn and composer) and 2.4 (session)** together make a first hearable conversation. 2.5 builds on the composer and on `session:awaiting-turn`.
- **2.7 (persistence)** underlies 2.8, which clears what 2.7 persists, and 2.9, whose handoff transcript must survive reload and restart.
- **2.9 (handoff) depends on 2.4**, on the Epic 1 roster and tiles, and on the artifacts the rail has already observed. 2.12 validates the model 2.9 implements.
- **2.11 depends on Epic 1's re-resolve-on-change** and on 2.4's live sessions.
- **2.13 runs last** and reviews this epic's own surfaces. The queued-message honesty question is only answered in Epic 3, since this epic has no long runs.
- **Epic 1 provides** the roster, tiles, shell, tokens, accessibility floor, portraits, rail and the document window that this epic mounts into. Epic 3 later feeds the same sessions with menu runs, streamed documents and the stop control.
