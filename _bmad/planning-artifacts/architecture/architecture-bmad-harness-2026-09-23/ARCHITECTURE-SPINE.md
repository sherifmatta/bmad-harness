---
name: 'bmad-visual-harness'
type: architecture-spine
purpose: build-substrate
altitude: feature
paradigm: 'read-only projection — an event-sourced read model with no write side'
scope: 'The BMad Visual Harness desktop application: every surface, process and boundary needed to deliver CAP-1..CAP-12 of SPEC-bmad-visual-harness.'
status: final
created: '2026-09-23'
updated: '2026-10-03'
binds: [CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-8, CAP-9, CAP-10, CAP-11, CAP-12]
sources:
  - ../../../specs/spec-bmad-visual-harness/SPEC.md
  - ../../../specs/spec-bmad-visual-harness/execution-model.md
  - ../../../specs/spec-bmad-visual-harness/bmad-install-contract.md
  - ../../../specs/spec-bmad-visual-harness/ui-surfaces.md
  - ../../../specs/spec-bmad-visual-harness/scope-tiers.md
  - ../../../brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html
companions: []
---

# Architecture Spine — bmad-visual-harness

## Design Paradigm

**Read-only projection: an event-sourced read model with no write side.**

The harness owns no state of its own. It observes three external sources of truth — the
project filesystem, the BMad install, and a persona session's event stream — folds each into a
read model, and renders it. There is no command side: nothing the harness does changes the
project except by handing work to the installed runtime, which writes on its own account.

That single framing carries most of this spine for free. "No write side" is why the rail can
never disagree with disk, why concurrent writers need no arbitration, why a stopped run needs
no rollback, and why harness state can never masquerade as project state.

One product test overrides every architectural virtue here: **if it reads as a chat box with a
portrait glued on, it has failed regardless of feature completeness.** Restraint in the shell
and real faces in it are what buy the perceived intelligence back, which is why AD-14, AD-16
and AD-20 are invariants rather than styling preferences.

Layers, in dependency order — each may depend only on what sits below it:

| Layer | Directory | Owns |
| --- | --- | --- |
| View | `src/renderer/ui/` | React components; renders projections, holds nothing durable |
| Design | `src/renderer/design/` | Tokens; pure portrait functions |
| Bridge | `src/shared/` | Domain event and IPC types only — no behaviour |
| Projections | `src/main/projections/` | Main-held read models: rail, sessions, install, personas |
| Fold | `src/main/fold/` | Pure interpreters — no I/O, no clock, no filesystem |
| Sources | `src/main/sources/` | Adapters: filesystem watcher, persona session, install resolver |

```mermaid
graph TD
  UI["ui/ — React views"] --> BRIDGE["shared/ — event + IPC contract"]
  UI --> DESIGN["design/ — tokens, portraits"]
  PROJ["projections/ — read models"] --> SRC["sources/ — fs, session, install adapters"]
  PROJ --> FOLD["fold/ — pure interpreters"]
  PROJ --> BRIDGE
  SRC --> BRIDGE
  FOLD --> BRIDGE
```

Nothing in `ui/` may reach `sources/`, `fold/` or `projections/`. Nothing in `fold/` may reach
`sources/`. No arrow points upward.

## Invariants & Rules

### AD-1 — The harness writes nothing into the project

- **Binds:** all
- **Prevents:** harness bookkeeping appearing in the outputs rail as if it were a project artifact, and any path where the harness and a run both claim authorship of a file.
- **Rule:** Every byte under the project's `_bmad/` tree got there because the runtime wrote it. Transcripts, session logs, caches and window state live in Electron `userData`, keyed by project path. No harness code path writes inside the project root.

### AD-2 — The two truth channels never merge

- **Binds:** CAP-5, CAP-6, CAP-11, CAP-12
- **Prevents:** the outputs rail asserting a file that never landed, and the live card silently becoming a cache of project state.
- **Rule:** A rail row exists, and claims content, only because the filesystem watcher saw the file. The session stream may *annotate* a row with run-scoped metadata — owning persona, section in flight, stopped — but may never create a row, remove one, or assert what a file contains. A row reaches `saved` because the watcher saw the write land, never because the stream announced it. A rail row carries **two independent fields that are never written by both sources**: a disk-derived `state` (`absent` → `changing` → `saved`), owned solely by the watcher, and an optional run-derived `annotation` (owner, section in flight, `stopped`), owned solely by the stream. There is no precedence question because there is no shared field. In-flight state for a writer the harness is **not** running (an editor, a terminal `claude`) therefore still works: `changing` comes from watcher activity plus a settle debounce, so CAP-6's "by any writer" holds without the stream. The live document card is run-scoped: born with a skill invocation, dies with it.

```mermaid
graph TD
  FS["filesystem watcher on _bmad/"] --> RAILP["rail projection"]
  STREAM["session event stream"] --> CARDP["card projection — run-scoped"]
  STREAM -. "annotate only: owner, section, stopped" .-> RAILP
  RAILP --> RAIL["outputs rail"]
  CARDP --> CARD["live document card"]
```

### AD-3 — One contract crosses the bridge: events out, commands in

- **Binds:** CAP-2, CAP-4, CAP-5, CAP-6, CAP-9, CAP-11, CAP-12
- **Prevents:** two interpreters disagreeing about the current section; a Claude Code wire-format change rippling into components; and — the sharper risk — two consumers of one event assuming different payload shapes or different cardinality.
- **Rule:** Main folds raw `stream-json` into domain events; the renderer sends commands and never parses a raw frame.
  - **Events out:** `session:opened`, `session:awaiting-turn`, `session:closed`, `persona:said`, `persona:state`, `run:started`, `run:note`, `doc:section-opened`, `doc:prose`, `doc:committed`, `run:finished`, `run:stopped`, `run:failed`, `rail:changed`.
  - **Commands in:** `session.open(agentId)`, `session.close(sessionId)`, `turn.send(sessionId, text)`, `menu.dispatch(sessionId, code)`, `run.stop(runId)`, `doc.open(path)`, `conversation.end(projectId)`.
  - Every event and command is declared once in `src/shared/` with an explicit payload type **and a stated cardinality**. Adding a field is additive; changing or removing one is a version bump on the contract, which is stamped on every persisted log (AD-4). A renderer-only event is a smell.
  - **Menu entries resolve in main, never in the renderer.** The renderer sends a `code`; main resolves it against the currently resolved configuration and decides `skill` versus `prompt`. A renderer holding a resolved skill name goes stale the instant the install is re-resolved (AD-8).
  - **Identity:** `sessionId` is the primary key for everything session-scoped; `runId` for everything run-scoped. `agentId` says which agent a session activated and **may be absent** — a party session is owned by the room. A persona tile aggregates the sessions carrying its `agentId`.
  - **Routing rules**, so the same bytes are never rendered twice or lost: main-thread `text_delta` outside a tool call is `persona:said`; prose inside a document write comes from `input_json_delta` on that call and is `doc:prose`; writes to `.memlog.md` are `run:note` and **never** `doc:prose`, so memlog text can never enter the document buffer or its section parser; anything with `parent_tool_use_id` is subagent activity (AD-6).

### AD-4 — Interpreters are pure folds over a recorded sequence

- **Binds:** CAP-5, CAP-11, CAP-12
- **Prevents:** the highest-churn module in the system being testable only by waiting out a multi-minute skill run.
- **Rule:** Every session writes its raw `stream-json` to a log under `userData`. Every interpreter in `fold/` is a pure function of the event sequence — no I/O, no filesystem, no wall clock except as an injected value. Recorded sessions are committed to `fixtures/runs/` as the replay corpus, covering at minimum: a Fast-path single large write, a Coaching-path batched write, a `SIGINT` mid-write, and a failure inside the reviewer gate. Each log is stamped with the contract version it was produced under (AD-3). The raw log is the **forensic and replay** record only — it is never the authority for what the UI shows on restart; that is the materialised projection (AD-7). Logs are retained per project with a bounded cap and pruned oldest-first.

### AD-5 — A write counts on `tool_result`, never `tool_use` [ADOPTED]

- **Binds:** CAP-5, CAP-6, CAP-12
- **Prevents:** reporting a section as written when the write was announced but never landed — and the inverse error of assuming one confirmation maps to one section.
- **Rule:** The unit of confirmation is the *tool call*, not the section. BMad does not author section by section on disk: a Fast-path run commits a whole document in one `Write` and then lands ~20 revision `Edit`s; a Coaching-path run commits several sections per write. On `tool_result`, every section parsed from that call's accumulated input becomes committed together; on `tool_result` with `is_error: true`, none of them did and that call names what failed to land. `Write` and `Edit` are both stream sources, and their handling differs: a `Write` replaces the document buffer and may open new sections; an `Edit` patches it and is a **revision** — it re-parses sections but never advances the section counter, which matters because 20 of 21 observed writes in a Fast-path run were revision `Edit`s. **Cardinality is fixed: exactly one `doc:committed` per tool call**, carrying that call's id and the list of sections it committed. It is never fanned out per section — a 15-section single write emits one event naming fifteen sections, and the call id is what AD-5's error rule needs to say which call failed. Settled by `execution-model.md`.

### AD-6 — Subagent output is never the persona's voice [ADOPTED]

- **Binds:** CAP-3, CAP-5, CAP-9
- **Prevents:** research and reviewer-gate chatter rendering as the persona speaking, which destroys the specific-colleague illusion CAP-3 exists to create.
- **Rule:** Anything carrying `parent_tool_use_id` belongs to a subagent. Only main-thread `text_delta` may render as a persona turn. Subagent activity renders on the card from `system/task_progress` (description, tokens, `last_tool_name`, duration) **where the runtime emits it** — it is not guaranteed on every run, which is why `.memlog.md` is the card's dependable dead-air feed rather than a fallback. The CLI also gates subagent text behind `--forward-subagent-text`, which this spine does not pass, so AD-6 holds by default as well as by rule. Settled by `execution-model.md`.

### AD-7 — Main owns all durable state; the renderer owns none

- **Binds:** CAP-2, CAP-8
- **Prevents:** a session dying with a window reload, and cross-restart continuity becoming a retrofit after the transcript shape is already set.
- **Rule:** The conversation transcript, session state and install model live in main; the transcript is persisted per project under `userData`, while session state and the install model are not (sessions are not held across restarts, and the install model is re-derived from disk — AD-1, AD-18). The renderer is a pure projection: a reload loses nothing — **including a run in flight**, because the card is a main-held projection like every other and is re-emitted on reconnect, not reconstructed from renderer memory. Within one persona session, context is genuinely continuous (AD-18). **Across** personas it is not: a handoff starts a new session, and continuity is carried by the project artifacts the previous persona wrote, not by transplanting context. CAP-8's "no handoff presents as a restart" holds; its "prior context intact" holds in substance only insofar as BMad's memlog-then-derive puts that context on disk.

### AD-8 — Effective BMad configuration comes only from BMad's own resolvers

- **Binds:** CAP-1, CAP-3, CAP-4, CAP-9
- **Prevents:** showing a user the wrong skill buttons because their `_bmad/custom/` overrides were never applied — the exact rot the spec's read-don't-model constraint exists to stop.
- **Rule:** `customize.toml` is never read directly. Effective configuration is obtained by invoking `_bmad/scripts/resolve_config.py`, `_bmad/scripts/resolve_customization.py` and the party skill's own `scripts/resolve_party.py` — they do **not** all live in one directory — and consuming the merged JSON. The harness implements no TOML layering of its own. Every resolver invocation is bounded by a timeout and has a defined failure path: a failed resolve degrades to the last good result and surfaces a named error, and never silently yields an empty roster. Configuration files are watched and re-resolved on change; **re-resolution updates the roster and the menus and never touches a live session**, so an agent that vanishes from the install keeps its session and its stop control until the user closes it.

### AD-9 — A menu entry carries exactly one of `skill` or `prompt`

- **Binds:** CAP-4
- **Prevents:** silently dead buttons — six of the ten Business Analyst entries are `prompt`-style, so a `skill`-only dispatcher leaves 60% of that menu inert.
- **Rule:** An entry carries `code` (the key), `description` (the button label) and exactly one of `skill` or `prompt`. Both dispatch as a turn into the live persona session (AD-18): `skill` as `/<skill-name>`, `prompt` as its text verbatim. An entry with neither is a discovery error surfaced to the user, never a silent no-op.

### AD-10 — Agents are enumerated from `_bmad/config.toml`

- **Binds:** CAP-1, CAP-3, CAP-10
- **Prevents:** discovering agents by globbing skill directories on a name prefix — a hardcode of BMad's layout, which CAP-1 forbids.
- **Rule:** The `[agents.*]` tables in the resolved config are the authoritative roster and supply `name`, `title`, `icon`, `description`, `module`, `team` — feeding the persona tile, chat header and party cast. Per-agent resolved customization supplies the menu. `identity` and `communication_style` are not harness-injected: the persona session activates the agent's own skill, which loads them itself (AD-18). That is what makes the persona talk like the persona.

### AD-11 — One turn in flight per session; sessions run concurrently

- **Binds:** CAP-4, CAP-5, CAP-11
- **Prevents:** two skill invocations racing inside one session, a card with two streams and no defined behaviour, and a chat turn typed mid-run being mistaken for the run's own completion.
- **Rule:** **Turns within a session are strictly serialised by the harness.** At most one turn — chat or run — is in flight per session; anything the user types during a run queued and sent when that turn completes. A session can also take turns nobody sent (background subagents finishing wake the main thread), so a `result` row ends *a* turn and not necessarily the one the harness sent (`fixtures/runs/README.md`, "A session takes turns nobody sent"). Whether a turn the harness sent is over is decided by the harness's own turn bookkeeping, not by counting `result` rows: the session is free only when a main-thread `result` arrives with the CLI's live background-task set (`system/background_tasks_changed`) empty, a `result` with tasks live leaves it busy, and a main-thread message that starts while it is free is a turn nobody sent and makes it busy again (`src/main/fold/turn-end.ts`). A **run** is a turn dispatched from a menu entry (AD-9), bounded by `run:started` and a terminal run event; a plain chat turn is not a run and raises no card. Skill buttons are disabled whenever any turn is in flight; the composer is not. Different sessions run concurrently. Concurrent personas *can* still collide on one artifact — `bmad-correct-course` touches the PRD, epics, architecture and UX at once, so BMad's artifact ownership is mostly but not wholly disjoint. That collision is not prevented here; it is governed by AD-12, and the rail reports the contention rather than resolving it. Cards are conversation entries in time order: the active persona's card renders full (prose body and the not-yet-written sections by name), a non-active persona's collapses to one live line carrying real state (persona · section · elapsed · stop) and expands on persona switch or click. A collapsed card is never a spinner.

### AD-12 — The harness reports; it never arbitrates

- **Binds:** CAP-6, CAP-7, CAP-12
- **Prevents:** a locking, merging or conflict-resolution scheme being invented for writes the harness does not make.
- **Rule:** When an external writer changes a file, the filesystem arbitrates and last writer wins. The harness reflects the new state and, where a run was writing that file, reports the contention. It never locks, reverts, patches or restores. A stopped or failed run's partial file is already byte-for-byte the last successful write, so there is nothing to revert.

### AD-13 — The renderer is unprivileged, and project content is untrusted

- **Binds:** CAP-2, CAP-7
- **Prevents:** a document window rendering markdown from a project file straight into the DOM, and a renderer that can reach the filesystem or spawn a process directly.
- **Rule:** The trust boundary is explicit and asymmetric: the project's **code** — its skills, its `_bmad/scripts/` resolvers, the runtime it configures — is trusted, because the user already executes exactly that code every time they run BMad in this project, and the harness runs it with no more privilege than they do. The project's **content** — the markdown of a PRD, an architecture doc, a party summary — is untrusted the moment it is rendered, because it is largely model-authored. `contextIsolation` on, `nodeIntegration` off, `sandbox` on. Every privileged capability crosses one narrow, explicitly enumerated preload API — no generic `invoke(channel, …)` passthrough. Markdown from project files is rendered through `markdown-it` with HTML disabled and sanitized with DOMPurify before insertion. Document windows reload from the watcher, not from a renderer-initiated read.

### AD-14 — One token file is the visual contract; nothing hardcodes a value

- **Binds:** CAP-2, CAP-3, CAP-9, CAP-10
- **Prevents:** independently built surfaces — persona tiles, party cast, document card, rail — converging on "roughly the same dark grey", which is how a deliberately restrained UI stops reading as deliberate.
- **Rule:** `design/tokens.css` opens with the mockup's `:root` block copied unchanged: the four-step surface ramp `--bg:#101317` → `--chrome:#14181d` → `--panel:#171b21` → `--panel-2:#1b2027` → `--panel-3:#20262e`, the hairlines `--line`/`--line-soft`, the text ramp `--text`/`--text-strong`/`--dim`/`--faint`, the single accent `--accent:#7fa6e8` with `--accent-bg`, the state triple `--green:#6aa87f`/`--amber:#c6a350`/`--red:#c47c72`, and `--mono`/`--sans`. The mockup expresses several load-bearing values as literals rather than variables; those are **named in the same file** and are equally binding: the layout constants (rail `348px`, party side panel `288px`, topbar `42px`, rail head `30px`, legend `24px`, thread max-width `940px`), the radius family (`3px` chips and tags, `4px` skill buttons, `5px` base `--r`, `6px` cards, `8px` document window — one radius is *not* the rule), the type scale (base `13px`/`1.55`, `--mono` for file paths and metadata, `--sans` for prose), and a `note`-state blue, which the mockup inlines as the accent hex and which needs its own token so blue-as-accent and blue-as-state are distinguishable. A literal colour, dimension, radius or font stack in a component is a defect.

### AD-15 — Stream deltas never pass through component state one at a time

- **Binds:** CAP-5
- **Prevents:** the app janking during the single moment the whole product is judged — a document writing itself in front of the user.
- **Rule:** Main coalesces deltas before emitting. The card commits accumulated text to one node on an animation frame. No React state update is driven by an individual `input_json_delta`. Sizing that makes this non-negotiable: one observed document write decomposed into 5,795 deltas carrying 69,031 characters.

### AD-16 — Portraits are pure, deterministic, asset-free, and illustrated colleagues

- **Binds:** CAP-3, CAP-10
- **Prevents:** the same agent wearing different faces across sessions or machines; any licensing or asset-pipeline dependency; and — the project's single highest risk — an art direction that reads as childish and takes the perceived intelligence down with it.
- **Rule:** The art-direction target is a **company-directory illustrated headshot: a plausible colleague. Not pixel art, not a JRPG sprite, not a cartoon.** Procedural inline SVG, parameterized per persona (skin and shade, hair colour with style and fringe, optional beard, glasses, earrings, shirt and collar, background), legible from 20px to tile size. `portrait(artParams, size, state) -> SVG string` and `artParamsFor(agentId) -> artParams` are pure functions with no I/O and no external assets; `state` is accepted from the start so the deferred reactive-face tier item needs no signature change. The five core personas carry curated params; every other installed agent derives params from its agent id. Determinism is asserted in tests. The `icon` field is never rendered as a portrait.

### AD-17 — Launch preflight names what is missing

- **Binds:** CAP-1
- **Prevents:** the harness opening to an empty room with no personas and no explanation, which reads as broken rather than as unconfigured.
- **Rule:** At launch the harness verifies `claude` is on `PATH` and authenticated, that `uv` with Python 3.11+ is available, **and that the target project actually resolves at least one agent** — a user-scoped rather than project-scoped BMad install resolves none under AD-18's `--setting-sources project,local`, which is exactly the empty room this AD exists to prevent. Any failure is reported naming the specific missing prerequisite and its remedy. CAP-1 promises zero *configuration*, not zero *prerequisites*.

### AD-18 — The persona session is the unit of interaction

- **Binds:** CAP-2, CAP-3, CAP-4, CAP-5, CAP-8, CAP-11, CAP-12
- **Prevents:** a product where you cannot simply talk to a persona; a persona whose voice is assembled by the harness rather than lived by the agent; and a failed run with no one left to explain it, which would force the harness to speak in a persona's name — the fake personhood the spec names as a trust liability.
- **Rule:** Talking to a persona opens a long-lived session: `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`, with `/bmad-agent-<x>` sent as the **first turn on stdin** — not as a positional prompt, since `--input-format` is only valid alongside `--print` and the prompt then arrives on the stream. Party mode is a session of the same kind, opened with `/bmad-party-mode`; it carries a `sessionId` but no `agentId`, which is what AD-19 means by a room-owned identity. **Chat turns and skill invocations are both turns into a session** — there is no second run kind. Three flags are load-bearing and may not be dropped: `--include-partial-messages` is what makes `input_json_delta` exist at all (without it CAP-5 has no prose to stream), `--setting-sources project,local` restricts resolution to the project and local sources and so **excludes the `user` source** — the subprocess sees the target project's `.claude/skills/` and none of whoever-is-running-the-harness's user-level Claude configuration, which is CAP-1's mechanism for a session that depends only on what is in the project, and `--input-format stream-json` is what keeps the session alive. Sessions are reclaimed when the persona is closed or the session ended (AD-21); they are not held across app restarts. A `result` row arrives **per turn**, not once per process, and ends *a* turn — not necessarily the one the harness sent, since a session also takes turns nobody sent (AD-11): `is_error: true` marks stopped or failed (`subtype` says which kind: `error_during_execution`, `error_max_budget_usd`, any other error subtype), its absence marks finished; do not test `stop_reason`, which is not stable across them (`null` on the spike's interrupted turns, `tool_use` in the corpus recordings, absent on a budget failure). Process exit code is **not** the signal — a session outlives every turn in it. **Stop (settled, Story 1.1):** `run.stop` writes one in-band `control_request` with `subtype: "interrupt"` to the session's stdin; the CLI answers `control_response` `success` and ends the turn with a `result` row within milliseconds (3-6ms, n=4), the process stays alive and the next turn is accepted. `SIGINT` exits the subprocess `rc=0` in under 400ms (217-390ms, n=4) and ends the session, so it is reserved for ending a session and never used to stop a run. If the interrupt is not acknowledged, falling back to `SIGINT` costs the session, and that cost is surfaced to the user, never hidden. The control protocol is not documented in `claude --help`; a future CLI release could change it (`_bmad/spikes/spike-stop-semantics.md`, caveat 2).

### AD-19 — Pipeline position and file ownership are derived, never asked

- **Binds:** CAP-1, CAP-6, CAP-9
- **Prevents:** a setup step asking the user what stage they are at — the precise thing CAP-1's zero-configuration promise rules out — and a rail that cannot name an owner for a file it did not watch being written.
- **Rule:** Pipeline position is read from the artifacts present under `_bmad/` and from the sprint status file; the harness never asks and never stores its own answer. A rail row's owner is a **`sessionId`**, resolved for display to that session's `agentId` where it has one. It comes from the session that wrote the file when the harness observed that write, and otherwise from the artifact class, since BMad personas own *mostly* disjoint artifacts. A party transcript row is owned by the room — a session with no `agentId` — which is why owner is a session identity and not an agent (AD-3). A row whose owner cannot be derived shows none rather than guessing.

### AD-20 — Every indicator is driven by real system state

- **Binds:** CAP-3, CAP-5, CAP-6, CAP-12
- **Prevents:** decorative motion and states that look alive without being alive — the failure the spec rules out with "animation must carry information, never decoration."
- **Rule:** Persona state is a projection, not a UI flag, with exactly one source each: `idle` = no session or nothing running; `work` = any turn is in flight, chat or run, and it persists through quiet subagent phases because the work is still running; `live` = a long-running attached process the session started (a test watcher) — **distinct from a skill invocation, and it does not disable the persona's skill buttons**; `note` = the watcher saw a change to a file this persona owns per AD-19; `error` = this persona's last run failed or was stopped. No state exists for decoration, no element animates unless the thing it depicts is actually happening, and `@media (prefers-reduced-motion: reduce)` disables all animation and transition globally. The `error` indicator is an alert only — the substance of a failure belongs in the conversation in the persona's own voice, which AD-18 keeps alive to deliver.

### AD-21 — The negative surface: no guidance, no launcher, no editor

- **Binds:** CAP-4, CAP-7, all
- **Prevents:** the three things a builder will reasonably want to add and which the spec explicitly rejected rather than deferred.
- **Rule:** No highlighting, badging, sorting or recommending of a next move anywhere — the skill buttons plus the output list are enough and the user decides. No separate skills list, launcher or command palette exists anywhere in the product; skills are reachable only as the current persona's buttons. Document windows are read-only previews; the harness never becomes an editor. An explicit end-session control exists and is the only way to clear a persisted conversation — it is not a next-step suggestion.

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Naming — domain events | `noun:verb-past` (`run:started`, `doc:committed`). Declared once in `src/shared/`; a renderer-only event is a smell. |
| Naming — personas | Addressed by BMad `agentId` (`bmad-agent-pm`) everywhere internally, including party turn attribution. Display `name`/`title`/`icon` are presentation only and never used as keys. |
| Naming — files | `kebab-case.ts`; one exported concept per module in `fold/` so it can be replayed in isolation. |
| Data — paths | Project-relative POSIX paths in all domain events; absolute paths exist only inside `sources/` and `windows/`. |
| Data — time | Epoch milliseconds in events; formatting is the renderer's business. Elapsed run time derives from `run:started`, never from a per-tick field. |
| Data — errors | Every failure crossing the bridge is `{ code, message, detail? }` with a stable `code`. Raw subprocess stderr never reaches the renderer. |
| State — mutation | Projections are updated only by applying a domain event. No projection is mutated from a UI action; a UI action sends a command to main, which acts and emits. |
| State — watcher | Configured for atomic temp-file rename (how `memlog.py` writes) and for coalescing — rapid appends land inside ~400ms and do not arrive one event per entry. Misconfigure it and appends are missed or double-counted. Document commits are whole-file writes, so an on-disk delta is a full replacement and all incremental diffing must come from the stream. |
| State — progress | Section names and the predicted denominator come from the skill's own template under its `assets/` directory, then from the run's `.memlog.md` concern-scan entry, which lands early enough to be usable. Observed headings win and the denominator grows; a section the user has already seen is never renumbered. The card's foot lists not-yet-written sections **by name**, from that same source. |
| State — dead air | The risk window is the parallel-subagent phases (discovery research, the reviewer gate), not the document render. There the card's secondary feed is `.memlog.md`, appended entry by entry with each decision and its reason, and the persona state stays `work`. |
| Cross-cutting — logging | Structured lines to `userData`, never to the project. A session's raw stream log is the forensic record (AD-4). |
| Cross-cutting — platform | Every macOS-specific call (`open -R`, `open -a`) is confined to `src/main/windows/`; no OS branch elsewhere. |
| Cross-cutting — persona voice | The harness never authors words attributed to a persona. Every persona utterance is main-thread `text_delta` from that persona's session. Disagreement in party mode is the skill's to generate and is grounded in project artifacts; the harness never stages, ranks or amplifies it. |

## Stack

Verified against the npm registry on 2026-09-23, **as a set that installs together** — three rows are deliberately not the newest published version, and each carries the reason. Do not bump these individually.

| Name | Version | Why this pin |
| --- | --- | --- |
| Electron | 44.4.5 | current stable |
| Node.js (bundled by Electron 44) | 24.18.1 | — |
| Chromium (bundled by Electron 44) | 152 | — |
| React | 19.3.0 | current stable |
| TypeScript | 6.0.3 | **not 7.0.2.** `typescript-eslint` peers `typescript <6.1.0`, so TS 7 has no linter at all, and TS 7 ships no public programmatic compiler API before 7.1. Revisit when both land. |
| Vite | 7.3.6 | **not 8.3.0.** `electron-vite@5` peers `vite ^5 \|\| ^6 \|\| ^7`; Vite 8 is supported only by `electron-vite@6.0.0-beta`. |
| electron-vite | 5.0.0 | current stable |
| @vitejs/plugin-react-swc | 4.3.3 | **not `@vitejs/plugin-react`**, whose 6.x peers `vite ^8.0.0` only — no Vite version satisfies both it and electron-vite 5. |
| electron-builder | 26.15.3 | current stable |
| Vitest | 5.0.1 | peers Vite ^7; transpile-only, so unaffected by the TS pin |
| typescript-eslint | 8.70.1 | the constraint behind the TypeScript pin |
| chokidar | 4.0.3 | **not 5.0.0**, which is ESM-only; electron-vite's default CJS main output with externalised deps would emit `require('chokidar')` and hit `ERR_REQUIRE_ESM`. Revisit only alongside an ESM main build. |
| markdown-it | 15.0.2 | current stable |
| DOMPurify | 3.4.16 | current stable |
| Claude Code CLI (`claude`) | the user's own install, not bundled | — |
| uv + Python (BMad resolvers) | 3.11+, the user's own install | — |

## Structural Seed

### Processes and external truth

```mermaid
graph LR
  subgraph HARNESS["Harness"]
    MAIN["Electron main — privileged"]
    REND["Renderer — conversation, rail, party"]
    DOC["Document windows — read-only preview"]
  end
  CLI["persona session — claude, one per active persona"]
  FS["project _bmad/ tree"]
  INST["BMad install — config.toml, resolvers"]
  UD["userData — transcripts, session logs"]

  MAIN -->|spawn, chat and skill turns, stop interrupt on stdin| CLI
  CLI -->|stream-json on stdout| MAIN
  CLI -->|writes| FS
  FS -->|watch| MAIN
  INST -->|resolver subprocess| MAIN
  MAIN -->|domain events over preload IPC| REND
  MAIN -->|file content on watcher change| DOC
  MAIN --> UD
```

`REND` and `DOC` have no edge to `FS`, `CLI` or `INST`. That absence is AD-13.

### Source tree

```text
bmad-harness/
  src/
    main/
      sources/       # fs watcher · persona session · install resolver
      fold/          # pure interpreters — no I/O, no clock
      projections/   # rail · sessions · personas · install read models
      windows/       # app window, document windows, macOS shell escapes
    preload/         # the one narrow bridge surface
    shared/          # domain event + IPC types only
    renderer/
      ui/            # shell (1:1 / party switch, help) · conversation · rail · party · doc window
      design/        # tokens.css · portrait functions
  fixtures/runs/     # recorded stream-json — the replay corpus
```

### Deployment and environments

One environment: a developer's own macOS machine. The harness runs from source
(`electron-vite` dev) or as a local unsigned `electron-builder` package. No code signing, no
notarization, no auto-update channel, no installer matrix, no server-side component and no
network service of the harness's own — its only outbound work is the persona session, which
authenticates on the user's existing Claude Code login. One project per window.

## Capability → Architecture Map

| Capability | Lives in | Governed by |
| --- | --- | --- |
| CAP-1 zero-config discovery | `sources/install`, preflight | AD-8, AD-10, AD-17, AD-18, AD-19 |
| CAP-2 conversation + state in one window | `sources/session`, `projections/sessions`, `renderer/ui` | AD-7, AD-13, AD-14, AD-18 |
| CAP-3 personas have faces and identities | `sources/session`, `renderer/design`, `projections/personas` | AD-6, AD-10, AD-14, AD-16, AD-18, AD-20 |
| CAP-4 persona-scoped skill buttons | `projections/install`, `sources/session` | AD-8, AD-9, AD-11, AD-18, AD-21 |
| CAP-5 documents write visibly | `fold/document`, `renderer/ui/card` | AD-2, AD-3, AD-4, AD-5, AD-6, AD-15 |
| CAP-6 rail is a live view of disk | `sources/fs`, `projections/rail` | AD-1, AD-2, AD-5, AD-12, AD-19 |
| CAP-7 documents open in own window | `main/windows`, `renderer/ui/doc` | AD-12, AD-13, AD-21 |
| CAP-8 persona handoff mid-session | `projections/sessions` | AD-7, AD-11, AD-18 |
| CAP-9 party mode | `sources/session`, `renderer/ui/party` | AD-3, AD-6, AD-8, AD-14, AD-16, AD-19 |
| CAP-10 real portraits for every agent | `renderer/design` | AD-10, AD-16 |
| CAP-11 a run can be stopped | `sources/session`, `fold/run` | AD-2, AD-4, AD-5, AD-11, AD-18 |
| CAP-12 failed and stopped runs are legible | `fold/run`, `projections/rail`, `sources/session` | AD-2, AD-4, AD-5, AD-12, AD-18, AD-20 |

## Deferred

- **The Agent SDK as the runtime.** Rejected on authentication, not ergonomics: Anthropic's terms require third-party products built on the Agent SDK to use API-key auth rather than the user's claude.ai login, and spawning the `claude` binary the user already authenticated does not. **Revisit only if** the harness ever ships carrying its own key — at which point `interrupt()`, `canUseTool` and typed hooks replace the hand-written control messages, signals and flags.
- **Party mode's disagreement and decision tracking.** `bmad-party-mode` emits prose and is explicitly instructed never to produce summaries or takeaways, so the *Open disagreements* and *Decisions so far* panels — and the transcript's `disagrees` / `evidence` tags and quoted-turn references — have no data source. The *Room* panel is **not** deferred: topic, who opened it, context documents in scope and the destination path are all harness-known. Note that `bmad-party-mode` **already ships and works** — group conversation, user participation and joint decisions function today, so CAP-9 is a surfacing problem, not orchestration to build. Party v1 ships the room: chosen cast, permanently visible faces, lit speaker, no turn-taking gate, the *Room* panel, and the summary written to `_bmad/`. **Revisit when** a structured source exists, most plausibly a `_bmad/custom/` override making the skill emit machine-readable markers.
- **Party mode's *Pause room*.** Pause is a lifecycle state distinct from stop, and neither CAP-11 nor AD-18 models it. **Revisit with** the disagreement panel, since both wait on party mode's second pass.
- **Signing, notarization, auto-update and distribution.** Not needed for a personal macOS build. **Revisit when** someone other than the author is meant to install it.
- **Windows and Linux support.** **Revisit if** a non-macOS user appears; AD-20's platform convention keeps the port additive rather than structural.
- **Light theme.** The mockup defines one dark palette; the spec assumes dark only.
- **Multi-project windows and cross-project state.** One project per window is a spec assumption; nothing here depends on it staying true.
- **Long scrollback virtualization.** **Revisit when** a persisted transcript is long enough to measure; AD-7 keeps it a renderer-local change.
- **Scope-tier Should/Could items** (`scope-tiers.md`): help section, reactive persona faces, tile hover previews, second opinion, refusal-with-handoff, idle barks. None changes a boundary decided here — AD-16 already accepts `state` so the reactive face needs no signature change, and the shell reserves a help entry point.

- **Newer BMad releases than 6.12.0.** The harness is built and verified against the installed BMad 6.12.0 and stays on it. The published docs (docs.bmad-method.org, read 2026-10-01 through a summarising fetch, so second-hand) describe a later layout; none of it overturns an AD, but four assumptions in this spine are coupled to 6.12.0 and should be checked on a real newer install before the harness is pointed at one. **Revisit when** the pinned BMad version is bumped or a user's project is on a newer one — start with a spike that installs the latest into a scratch project and runs the preflight and resolvers against it.
  - **Artifact layout (AD-1, AD-2, AD-19, CAP-6).** The watch root is `_bmad/`. The newer default output root is `_bmad-output/`, in `<type>-<slug>/` folders inside initiative folders, with files named `prd-<slug>.md`, `spec-<slug>.md`, `architecture-<slug>.md` (this project has `SPEC.md` and `ARCHITECTURE-SPINE.md`). `sprint-status.yaml` is replaced by `tickets.toml`, epic envelopes, story files and `plan-<slug>.md`; `src/main/fold/artifact-owner.ts` maps `sprint-status.yaml` to `bmad-agent-pm`. The watch root should come from the resolved `output_folder`, and artifact classification should tolerate both naming schemes. Unchecked: whether `src/main/sources/project/` already derives the root or hardcodes it.
  - **Pipeline position (CAP-1, AD-19).** The docs describe a loop (Clarify, Plan, Build and verify, Learn) with right-sizing, not a waterfall; PRD and architecture are optional and a small change skips both. Position is derived from artifacts, so the mechanism holds, but "correct pipeline state" needs a definition for a project that legitimately has no PRD. The SPEC wording "brief → PRD → epics and stories → build → review → launch" and CAP-8's "epics and sprint planning" describe 6.12.0 and drift on upgrade.
  - **Resolver paths and install (AD-8, AD-17).** AD-8 names `_bmad/scripts/resolve_config.py` and `resolve_customization.py`. The docs say `bmad setup` installs the "shared runtime and module scripts" but not that those filenames survive. The install route is now `npx skills add` or a plugin marketplace; a marketplace install is probably user-scoped and so resolves no agents under `--setting-sources project,local` — the empty room AD-17 already checks for. Its remedy text should point at the project-scoped install.
  - **Menus (AD-9, AD-10).** Menu codes change (Winston `CA, TK`, `IR` gone; John `PRD, CC, TK`). Resolved menus absorb this with no harness change; `bmad-ticket` replaces epics-and-stories and sprint planning as the planning skill.
  - **Unattended runs.** `bmad-build-auto` and its loop orchestrator are the autonomy this product cut as a non-goal, so they stay out. If that is ever revisited, the plan file's `status` and `blocked_reason` fields are the machine-readable source CAP-12 lacks today.

## Open Items

- **CAP-2's continuous cross-persona session vs. AD-18's per-persona sessions.** A session spans personas in the transcript and in the artifacts, but not in process. Confirm this satisfies the demonstrable form of the success signal before the build commits.
- **Turn queueing versus responsiveness.** AD-11 serialises turns, so a message typed during a twelve-minute run waits for it. Confirm in use that queued-and-visible reads as honest rather than as the composer being broken.

## Spec Amendments Required

Decisions here that override the source contract. `SPEC.md` and its companions should be updated so upstream and this spine do not diverge.

| Source | What changed |
| --- | --- |
| `execution-model.md` | The runtime unit is a persona session, not one subprocess per skill (AD-18). The invocation and stop mechanics change with it. |
| `bmad-install-contract.md` | A menu entry carries exactly one of `skill` or `prompt`, not always `skill` (AD-9). The authoritative agent roster is `_bmad/config.toml` `[agents.*]`, not `customize.toml` (AD-10). |
| `SPEC.md` constraint "persona→skill mapping is read from each agent's `customize.toml`" | Now read from BMad's resolved configuration, because raw `customize.toml` omits `_bmad/custom/` overrides (AD-8). The constraint's intent is preserved; its letter is not. |
| `SPEC.md` assumption "zero configuration" | Zero configuration, but not zero prerequisites: `claude` authenticated, plus `uv` and Python 3.11+ (AD-17). |
| `SPEC.md` CAP-9 success | Not met as written in v1 — the disagreement and decision structure is deferred for want of a data source. |
| `SPEC.md` constraint "talk to one agent, get a result, move to the next" | Personas may run concurrently (AD-11), a deliberate user decision. The waterfall of the *method* is unchanged; the serialism of the *interaction* is not. |
| `SPEC.md` CAP-5 success "no spinner at any point" | A non-active persona's card collapses to a live one-line state (AD-11) rather than showing prose and the not-yet-written list. |
| `SPEC.md` open questions 1 and 2 | Both closed here: session history persists per project under `userData` (AD-7); concurrent writers need no arbitration (AD-12). |
