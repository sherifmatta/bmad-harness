---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad/specs/spec-bmad-visual-harness/SPEC.md
  - _bmad/specs/spec-bmad-visual-harness/ui-surfaces.md
  - _bmad/specs/spec-bmad-visual-harness/bmad-install-contract.md
  - _bmad/specs/spec-bmad-visual-harness/execution-model.md
  - _bmad/specs/spec-bmad-visual-harness/scope-tiers.md
  - _bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html
  - _bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md
  - _bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md
  - _bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md
  - _bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/mockups/portrait.html
  - _bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/mockups/document-card-dead-air.html
---

# bmad-harness - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the **BMad Visual Harness**, decomposing the requirements from the SPEC (which stands in for a PRD on this project — it is the declared canonical, preservation-validated contract), the UX design contract (DESIGN.md + EXPERIENCE.md), and the Architecture Spine into implementable stories.

**Requirements source note.** This project ran brief -> spec -> architecture -> UX rather than brief -> PRD. `SPEC.md` and its four companions are the requirements source; FRs below are derived from capabilities CAP-1..CAP-12 and the companions' load-bearing detail, and NFRs from the SPEC's Constraints and Assumptions plus the Architecture Spine's cross-cutting rules.

## Requirements Inventory

### Functional Requirements

#### CAP-1 — Zero-configuration install discovery

- **FR1:** Pointing the harness at a project root is the entire setup — personas, their menus, and the project's pipeline position are all discovered from what is on disk, with no configuration step and no harness-side registry.
- **FR2:** The agent roster is enumerated from the `[agents.*]` tables in the resolved `_bmad/config.toml`, supplying `name`, `title`, `icon`, `description`, `module` and `team`. Agents are never discovered by globbing skill directories on a name prefix.
- **FR3:** Effective BMad configuration is obtained only by invoking BMad's own resolvers — `_bmad/scripts/resolve_config.py`, `_bmad/scripts/resolve_customization.py`, and the party skill's own `scripts/resolve_party.py` (they do not share a directory) — and consuming the merged JSON. `config.toml` and `customize.toml` are never read directly, and the harness implements no TOML layering of its own.
- **FR4:** Every resolver invocation is bounded by a timeout and its output is schema-validated before use. Three failure classes share one defined path — invocation failure, timeout, and **output that succeeds but does not match the expected shape** — each degrading to the last good result and surfacing a named error. A resolver that returns valid JSON in an unexpected shape must never be allowed to yield a garbage roster silently. It never silently yields an empty roster and never renders a silently stale one.
- **FR5:** Configuration files are watched and re-resolved on change. Re-resolution updates the roster and the menus in one frame (no arrival or removal animation) and **never touches a live session**.
- **FR6:** An orphaned live session — one whose agent vanished from the install — keeps its transcript, its document card, and working stop and close controls until the user closes it. No tile exists for it and nothing is silently closed.
- **FR7:** Launch preflight verifies three prerequisites and, on failure, names the specific one and its remedy rather than opening an empty room: (a) `claude` on `PATH` **and** authenticated — two distinct messages; (b) `uv` present **and** resolving Python 3.11+ — two distinct messages; (c) the target project resolves at least one agent.
- **FR8:** The "no agents resolve" preflight message must state four things: what was looked for (agents), where (this project, under `--setting-sources project,local`), why a correctly installed BMad can still resolve none there (a user-scoped rather than project-scoped install), and what would change it. It must not read as "no agents found".
- **FR9:** Launch presents no setup step, no onboarding wizard, and no "where are you in the process?" question.
- **FR10:** Pipeline position is derived from the artifacts present under `_bmad/` and from the sprint status file. The harness never asks and never stores its own answer — **and the negative is the substance of this requirement**, because no surface in v1 consumes a parsed pipeline position and the product forbids every affordance that would. v1 therefore reads artifact *presence* and treats the sprint status file as one more artifact without parsing its contents; the parsing is deferred until a consumer exists. **The file was nonetheless verified during planning so a future consumer need not re-research it**: it sits at `_bmad/implementation-artifacts/sprint-status.yaml` (so the rail already watches it); `development_status` is a **flat map** whose keys carry the structure (`epic-1`, `1-1-<slug>`, `epic-1-retrospective` share one namespace), so position comes from parsing key shape, not from walking nesting; the status vocabulary is **six values** — `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`, plus `optional` for retrospectives — not the three (`planned`/`started`/`unstarted`) the install contract describes; and timestamps are `MM-DD-YYYY HH:MM`, not ISO. An unrecognised status must degrade rather than break the derivation.

#### CAP-2 — Conversation and project state in one window

- **FR11:** The shell presents two mutually exclusive top-level views behind a single switch — **1:1 Conversation** and **Party Mode**. There is no third view. A **Help** entry point is reserved in the topbar layout but does not render in v1.
- **FR12:** The 1:1 view is a chat column on the left and a fixed-width right rail split 50/50: the **Team half** (persona tiles) above, the **Outputs half** (file rows) below. Chat and rail are simultaneously visible for the full length of a session running from PRD through build.
- **FR13:** The topbar carries brand, project path, install chip, branch chip, and the view switch.
- **FR14:** The chat column holds conversation entries in time order — persona turns, user turns, syslines, and document cards — plus the skill button row and the composer.
- **FR15:** An explicit end-session control dispatches `conversation.end(projectId)` and is the only way to clear a persisted conversation. It is a lifecycle control, never presented as a next-step suggestion.
- **FR16:** The conversation transcript, session state and install model live in Electron main. The transcript is persisted per project under `userData`; session state and the install model are not — sessions are not held across restarts (FR100) and the install model is re-derived from disk on each launch (NFR2). The renderer is a pure projection: a window reload loses nothing, **including a run in flight**, because the card is a main-held projection re-emitted on reconnect rather than reconstructed from renderer memory. (`ARCHITECTURE-SPINE.md` AD-7.)
- **FR17:** One project per window.

#### CAP-3 — Personas have faces and identities

- **FR18:** A persona tile renders portrait, name, title and a state line. The current persona is marked `aria-current="true"` with an accent left edge.
- **FR19:** The chat header renders the current persona's portrait, name, title and state.
- **FR20:** `identity` and `communication_style` are never harness-injected. The persona session activates the agent's own skill, which loads them itself.
- **FR21:** The harness never authors words attributed to a persona. Only main-thread `text_delta` may render as a persona turn; the UI never styles, frames, prefixes, summarises or classifies a persona's words.
- **FR22:** Persona tiles are grouped by the agent's `module` and by `team` where present; within each group, the order is the order agents appear in the resolved config. There is no relevance sort, recency sort, pinning or highlighting.

#### CAP-4 — Skills invoked in-conversation, scoped to the persona

- **FR23:** A skill button row sits inline in the conversation above the composer, labelled "<Persona> can …", showing exactly the current persona's resolved menu entries and rebuilt whenever the active persona changes.
- **FR24:** A menu entry carries `code` (the key), `description` (the button label) and **exactly one of `skill` or `prompt`**. The button shows `description` with a leading code chip carrying `code`, and dispatches `menu.dispatch(sessionId, code)` — it knows nothing about what it invokes.
- **FR25:** Menu entries resolve in main, never in the renderer. Main resolves the `code` against the currently resolved configuration and decides `skill` versus `prompt`: `skill` is sent as `/<skill-name>`, `prompt` is sent as its text verbatim. Both dispatch as a turn into the live persona session.
- **FR26:** A menu entry carrying neither `skill` nor `prompt` is surfaced to the user as a discovery error naming the entry `code` and what is missing, in the harness's own register. It is never a silent no-op and never spoken by a persona.
- **FR27:** No tooltip or preview derived from a resolved skill name is shown anywhere — it would go stale the instant the install is re-resolved. The user is never shown whether an entry is `skill` or `prompt`.
- **FR28:** Skill buttons are disabled whenever **any** turn is in flight in that session. The `live` persona state does **not** disable them. The composer is never disabled.
- **FR29:** `+N more` expands the button row in place; the remaining entries appear as ordinary skill buttons and **no transcript entry is created**. The control toggles back reading `fewer`. The row must look correct at 1 through 10 entries.
- **FR30:** There is no separate skills list, launcher or command palette anywhere in the product. Skills are reachable only as the current persona's buttons.

#### CAP-5 — Documents write visibly and live

- **FR31:** `run:started` births a run-scoped document card inline in the conversation, in time order. **While its run is in flight and its persona is the one being viewed, the card is pinned at the top of the chat column; when the run's terminal event arrives it returns to its place in the thread, in one frame.** The card dies with the run's terminal event. A plain chat turn raises no card.
- **FR32:** The active persona's card renders full — **head:** state dot, the subject document's file path, current section, elapsed run time, stop control; **body:** the subject document's prose streaming in; **foot:** the subject's not-yet-written sections listed by name, plus counts, **and the other files this run has written, named and never shown in the body**. The **subject** is the file with the most characters written by a `Write` in the run so far; ties go to the earlier file; it changes only when another file's `Write` passes it.
- **FR33:** A card belonging to a non-active persona collapses to a single line carrying four fields: persona, **the last run note's reason**, elapsed, and a working stop control. It expands on persona switch or click. A collapsed card is never a spinner.
- **FR34:** There is **no denominator anywhere** — the head reads `writing · §N <Name>`, never `§N of M`, and the rail annotation loses its denominator for the same reason. The plan is the foot's named list of not-yet-written sections.
- **FR35:** The card body streams from the run's event stream — `input_json_delta` on the `Write`/`Edit` tool call, decoded as it arrives — never from re-reading the file.
- **FR36:** Section names and the predicted plan come from the skill's own template under its `assets/` directory, then from the run's `.memlog.md` concern-scan entry. Observed headings win and the plan grows; a section the user has already seen is never renumbered. **The template is not a flat list of sections and a naive heading parse is wrong**: `bmad-prd/assets/prd-template.md` carries 14 h1/h2 headings of which three are scaffolding (`# PRD Template`, `## Essential Spine`, `## Adapt-In Menu`) rather than document sections; the real spine is the ten numbered `## 0.`–`## 9.` headings, and the Adapt-In clusters that expand a run to 15 sections are not counted in it at all. Heading text also carries markdown emphasis (`*(almost always present)*`) that must be stripped, or the card head renders it verbatim.
- **FR37:** A revision `Edit` of the subject sets the head to `revising · §N <Name>`, **patches that document's buffer (its `old_string` replaced by its `new_string`)**, re-parses sections and never advances the section counter. A `Write` replaces **that path's** buffer and may open new sections. **Each path has its own buffer; an `Edit` or `Write` of another path never changes the subject's body.** An `Edit` whose `old_string` is not in the buffer leaves the buffer as it was.
- **FR38:** Deltas are coalesced in main before emission; the card commits accumulated text to one node per animation frame. No render is driven by an individual `input_json_delta`.
- **FR39:** The card body has two modes and **is never empty**: *prose mode* while document prose streams, and *run-note mode* — the `.memlog.md` run-note feed — when it does not. A placeholder sentence is a spinner wearing a sentence and is forbidden.
- **FR40:** A run note renders three slots: time (tabular figures), a kind tag, and the reason — the decision and the reason it was made, with the load-bearing clause emphasised. Entries stack in time order, newest last. **The `.memlog.md` format carries no per-entry timestamp**, so the time slot is derived from when the harness observed the append; a note with no observed time (a dead card after a restart) renders without one, and the row must stay legible with the time column empty. The entry parser also tolerates the `(kind by author)` form the writer emits when authorship is recorded.
- **FR41:** **The memlog kind vocabulary is open, not closed** — `_bmad/scripts/memlog.py` states that the host skill supplies the vocabulary and the writer enforces none. The feed therefore renders **every** entry whatever its kind, under four named treatments: `decision` takes the accent treatment; `assumption` takes the neutral treatment; `question` and `gap` take the warm friction treatment (replacing the `open` tag named in the UX contract, which does not occur in the real format); and **any unrecognised kind falls back to neutral**. The fallback must cover the common observed kinds `event`, `constraint`, `capability`, `change`, `version`, `technique`, `note`, `override` and `direction`. A new kind appearing in a future BMad release must never break the feed.
- **FR42:** During dead air the head keeps path, elapsed and a working stop control; a phase word (`researching`, `reviewing`) renders **only when a feed actually states it**. The foot reads `0 words on disk · <phase> · autosave on` plus the named next sections.
- **FR43:** When prose resumes, the run notes accrued during the quiet window remain above it in the same scroll container, in time order; the typeface register keeps them distinct.
- **FR44:** `doc:committed` removes every section it names from the foot list **in one frame** — no stagger, no sequential reveal, no per-section tick-through. A 15-section commit is one event moving fifteen names at once.
- **FR45:** Subagent activity (anything carrying `parent_tool_use_id`) is never rendered as the persona's voice. `system/task_progress` may render subagent activity on the card where the runtime emits it; nothing may depend on it.
- **FR46:** No spinner, skeleton, progress bar or staggered reveal appears at any point, in any state.
- **FR47:** `run:finished` sets the head to `saved · just now · N sections`, **where N is the number of sections of the subject document**, moves the dot `work` -> `live`, and removes the caret.

#### CAP-6 — Outputs rail is a live view of the filesystem

- **FR48:** One rail row exists per file under `_bmad/`. A file created by **any** writer — the harness, an editor, a terminal `claude` — appears without user action, indicates while being written, and settles to saved.
- **FR49:** A rail row carries **two independent fields that no source writes both of**: a disk-derived `state` (`not yet written` -> `changing` -> `saved · <age>`), owned solely by the watcher, and an optional run-derived `annotation` (owner, section in flight, `stopped`, contention), owned solely by the stream. There is no merged status field.
- **FR50:** The stream may annotate a row but may never create one, remove one, or assert what a file contains. A row reaches `saved` because the watcher saw the write land, never because the stream announced it. A row must read as complete with the annotation slot empty.
- **FR51:** A row's owner is a `sessionId`, displayed as that session's `agentId` where it has one, otherwise derived from the artifact class, otherwise **not rendered at all** — the harness never guesses an owner. A party summary row shows the room.
- **FR52:** The filesystem watcher is configured for atomic temp-file rename (how `memlog.py` writes) and for coalescing — rapid appends land inside ~400ms and do not arrive one event per entry. Document commits are whole-file writes, so all incremental diffing comes from the stream.
- **FR53:** The Outputs half's empty state reads `no files under _bmad/ yet` with the watched path beneath it. It states the situation and stops — it must not suggest a next step, name a skill, or point at a persona.
- **FR54:** The rail shows project artifacts only. Harness bookkeeping — transcripts, logs, caches, window state — lives in `userData` and never appears. No affordance may imply the harness authored or can author a file.

#### CAP-7 — Documents open in their own window

- **FR55:** Clicking a rail row or a card path dispatches `doc.open(path)` and opens a separate OS window rendering that file read-only.
- **FR56:** The document window reloads **from the watcher** when the file changes on disk, not from a renderer-initiated read.
- **FR57:** The title bar carries the **full path** (not the basename) and three escapes: *Reveal in Finder*, *Open in editor*, *Close*. `Esc` closes.
- **FR58:** Markdown from project files is rendered through `markdown-it` with HTML disabled and sanitized with DOMPurify before insertion — no raw HTML, no embedded styles, no images by markup. The preview must look intentional within that ceiling rather than degraded.
- **FR59:** There is no refresh control, no edit affordance and no save. The harness previews documents; it never becomes an editor.

#### CAP-8 — Persona handoff mid-session

- **FR60:** Clicking another persona's tile opens that persona's session, rebuilds the skill row, and expands that persona's card — within one unbroken conversation. No handoff presents as a restart, a new thread or a cleared history.
- **FR61:** `@<name>` in the composer hands off to that persona in the 1:1 view, and directs the question at that persona in party mode. It addresses a **persona** and never names a skill; it is the product's only text-driven navigation.
- **FR62:** A handoff writes a sysline naming the artifacts that carry the continuity — `handed off · John -> Amelia · picking up from PRD.md, epics.md` — and never claims that context continues, which under the session model would be false.
- **FR63:** A sysline is a harness-authored transcript entry in the harness's own register. It is never styled as, or attributed to, a persona. Syslines carry session-resumed, handoff and room-opened notices.

#### CAP-9 — Party mode

- **FR64:** Party mode is a session of the same kind as a persona session, opened with `/bmad-party-mode`. It carries a `sessionId` and **no `agentId`**, gets no persona tile, and its rail rows show the room as owner.
- **FR65:** On opening the room, a cast chooser lets the user choose who is in it, defaulting to the five core personas.
- **FR66:** Every chosen portrait stays permanently visible for the life of the room. Presence and inattention are expressed by dimming, **never by removal**; the current speaker is lit.
- **FR67:** The party header carries topic, participant count, turn counter, elapsed time, and *Write summary to `_bmad/`*.
- **FR68:** A v1 party transcript turn is portrait + name + role + timestamp + the persona's words, and nothing else. No `disagrees` / `evidence` tags, no quoted-turn references, no quote-back chrome.
- **FR69:** The party side panel renders the ***Room*** section only: topic, who opened it and when, the context documents in scope, and the destination path `_bmad/party/<date>-<topic>.md`. *Open disagreements* and *Decisions so far* are **not rendered at all**, not even as empty states, and the panel must not be built with slots reserved for them.
- **FR70:** There is no turn-taking gate — the user types at any point and the message interrupts the current speaker.
- **FR71:** *Write summary to `_bmad/`* writes `_bmad/party/<date>-<topic>.md`, which appears in the rail as a new row owned by the room.
- **FR72:** Party mode has **stop**, not pause. *Pause room* is not implemented.

#### CAP-10 — Every persona has a real portrait

- **FR73:** `portrait(artParams, size, state)` and `artParamsFor(agentId)` are pure functions producing inline SVG with no I/O, no global state and no external assets. Determinism is asserted in tests.
- **FR74:** The portrait SVG contains no `id` attributes, no `<defs>`, no gradients, no clip paths, no filters, no masks and no external references, so two portraits in one document cannot collide. Every shape is a flat fill or a stroke; shading is overlaid low-opacity shapes.
- **FR75:** The art-direction target is a **company-directory illustrated headshot — a plausible colleague. Not pixel art, not a JRPG sprite, not a cartoon.**
- **FR76:** The approved v2 geometry is implemented as specified: tapered-jaw face path at a 0.76 width/height ratio; one upper-left light source carried by four shapes (right-contour shadow, cheek highlight, jaw shadow on the neck, inner-ear shadows); almond eyes with socket shadow, iris, pupil, catchlight and weighted upper lid; filled tapered brows; three-part nose; resting mouth with lower-lip highlight; hair mass with a highlight arc (omitted for `receding`), with back mass for `long`/`bun` and seven circles for `curly`. Draw order is fixed.
- **FR77:** The parameter set is: paired `skin`+`shade` (8 pairs), `eye` (8 values), `hair` (8 colours), `style` (`short · long · curly · bun · receding`), `fringe` (`straight · sweep · null`, forced `null` for `receding`), optional `crown` override, `beard` (`full · close · null`), `glasses` (`rect · round · null`), `earrings` (boolean), and paired `shirt`+`collar`+`bg` (8 triples). `hairDark`, `hairLite`, `lite` and `dark` are derived at render, never passed. The palette is muted and desaturated throughout.
- **FR78:** The five core personas carry curated parameters. Every other installed agent derives deterministically from its `agentId` via a 32-bit FNV-1a hash salted per field, indexed modulo a constrained palette, with `style` drawn from the weighted six-entry list `short · short · long · curly · bun · receding`, `beard` firing at 32%, `glasses` at 34% and `earrings` at 28%. The same agent wears the same face across sessions and machines.
- **FR79:** Portraits render at the closed set of sizes **32** (transcript), **36** (persona tile), **38** (chat header) and **44** (cast card). The legibility floor is 32px; the 20px case is served by the initials token instead.
- **FR80:** The `icon` field is never rendered as a portrait, at any size, as a fallback or otherwise.
- **FR81:** v1 renders a **single neutral expression for every face** at every state. The state dot carries state; the face does not. `state` is nonetheless accepted by the signature from the start.
- **FR82:** The initials token replaces the portrait at 20px (stacked faces, handoff chip) and renders at 32px as the user's own avatar. It reveals name and role identically on `:hover` and `:focus-visible`, carries `tabindex="0"`, `role="img"` and `aria-label="{name}, {title}"`, and stacks with a negative overlap and a ring cutting each disc out of the one behind it.

#### CAP-11 — A running skill can be stopped

- **FR83:** A stop control is present on **both** the full card head (beside elapsed run time) and the collapsed line, and dispatches `run.stop(runId)`, which writes one in-band interrupt request to the run's session on stdin — `{"type":"control_request","request_id":"<id>","request":{"subtype":"interrupt"}}` — and so ends the turn, not the session. `SIGINT` ends a session and is never the stop mechanism. (`ARCHITECTURE-SPINE.md` AD-18, *Stop (settled, Story 1.1)*; `execution-model.md` *Stop and failure*; `_bmad/spikes/spike-stop-semantics.md`.)
- **FR84:** Stopping costs the turn, not the conversation, so the control reads a plain `stop` on the full card head and on the collapsed line, with no confirmation. If stopping ever costs more than the turn, that cost is stated **on the control, before it is pressed**, never in a modal and never hidden. If the interrupt is not acknowledged — no `control_response`, or one whose `subtype` is not `success` — the harness falls back to ending the session and states that in its own register. (`ARCHITECTURE-SPINE.md` AD-18.)
- **FR85:** There is no confirmation dialog and no "stopping…" transitional state; the card reaches its terminal state directly.
- **FR86:** Stopping leaves the file **byte-for-byte as written** — never reverted, never patched, never restored — and nothing is offered to restore it.

#### CAP-12 — Failed and stopped runs are legible

- **FR87:** A `result` row arrives **per turn**, not once per process, and ends *a* turn — not necessarily the one the harness sent, because a session also takes turns nobody sent (AD-11). `is_error: true` marks a turn stopped or failed and `subtype` says which kind (`error_during_execution` for an interrupt or a mid-turn failure, `error_max_budget_usd` for an exhausted budget, and any other error subtype the CLI emits); `is_error` absent or false marks it finished. Those two fields are the whole discriminator: `stop_reason` is never tested, because it is not stable across them (`null` on the spike's interrupted turns, `tool_use` in the corpus's interrupt recordings, absent on a budget failure). Process exit code is not the signal. (`ARCHITECTURE-SPINE.md` AD-18.)
- **FR88:** A write counts on `tool_result`, never on `tool_use`. The unit of confirmation is the **tool call**: on `tool_result`, every section parsed from that call's accumulated input becomes committed together; on `tool_result` with `is_error: true`, none did, and that call names what failed to land. Exactly one `doc:committed` is emitted per tool call, carrying that call's id and the list of sections it committed — never fanned out per section.
- **FR89:** On stop or failure the card switches to the `error` state and names the section reached, taken from the last confirmed write; the rail row annotation becomes `stopped` while its disk state is unchanged; the persona tile goes `error` with **no error text on the tile**.
- **FR90:** The persona picks up a stopped or failed run in the conversation, in its own voice: what got done, what broke, and an offer to resume. The harness never speaks in a persona's name. A stop leaves the session alive, so this holds for stops as well as failures. **Where the session itself has ended with the run** (the process exited, or the interrupt fell back to ending the session) there is no persona left to deliver it, and the harness states the outcome in its own register and does not fabricate a persona voice.
- **FR91:** Every failure crossing the bridge is `{ code, message, detail? }` with a stable `code`. `message` is what is shown; `detail` sits behind a disclosure control. Raw subprocess stderr never reaches the renderer and no stack trace is ever shown.
- **FR92:** Contention is reported, never prevented and never resolved: the rail row annotation names the contention and both owners, the filesystem arbitrates and last writer wins, and there is no dialog and no bridge command to resolve, merge, revert, lock, restore or undo.
- **FR93:** When the window is unfocused, each terminal event (`run:finished`, `run:stopped`, `run:failed`) produces exactly one silent native macOS notification naming the persona, the outcome, the file and the section count. Nothing is notified when the window is focused, and nothing else in the product notifies at all. No Dock badge, ever.
- **FR94:** Activating a notification raises the window and scrolls the thread to that run's card. It does not switch persona, open a document window, or start anything. If notification permission is refused or ungranted, nothing is shown and nothing is asked again.

#### Runtime, session and bridge

- **FR95:** A persona session is a long-lived subprocess: `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`, with `/bmad-agent-<x>` sent as the **first turn on stdin**, not as a positional prompt. One session per active persona, not one per run.
- **FR96:** Three flags are load-bearing and may not be dropped: `--include-partial-messages` (without it there is no `input_json_delta` to stream), `--setting-sources project,local` (excludes the `user` source, so the subprocess sees only the target project's configuration), and `--input-format stream-json` (keeps the session alive across turns). `--forward-subagent-text` is not passed.
- **FR97:** Chat turns and skill invocations are both turns into the same session; there is no second run kind. A **run** is a turn dispatched from a menu entry, bounded by `run:started` and a terminal run event.
- **FR98:** Turns the harness sends are strictly serialised — at most one in flight, chat or run — so a queued message is sent only after the turn before it is over. A session can also take turns nobody sent (a background subagent finishing wakes the main thread and produces its own `result` row), so a `result` row ends *a* turn and not necessarily the one the harness sent. Different sessions run concurrently. (`ARCHITECTURE-SPINE.md` AD-11; `fixtures/runs/README.md`, "A session takes turns nobody sent".)
- **FR99:** A message typed during a run lands in the transcript **immediately**, in the user-turn treatment, dimmed and marked `queued · sends when <Persona> finishes`. It is cancellable. It sends on `session:awaiting-turn`, and the dim and marker are removed **in place** — the entry never moves, re-renders or reappears lower in the thread.
- **FR100:** Sessions are reclaimed when the persona is closed or the session ended, and are **not** held across app restarts. After a restart the transcript is present, every persona reads `idle`, every card renders dead with no elapsed ticking and no stop control, and nothing is offered to resume.
- **FR101:** One contract crosses the bridge — events out, commands in — declared once in `src/shared/` with an explicit payload type and a stated cardinality. Events: `session:opened`, `session:awaiting-turn`, `session:closed`, `persona:said`, `persona:state`, `run:started`, `run:note`, `doc:section-opened`, `doc:prose`, `doc:committed`, `run:finished`, `run:stopped`, `run:failed`, `rail:changed`. Commands: `session.open(agentId)`, `session.close(sessionId)`, `turn.send(sessionId, text)`, `menu.dispatch(sessionId, code)`, `run.stop(runId)`, `doc.open(path)`, `conversation.end(projectId)`. Main folds raw `stream-json` into domain events; the renderer never parses a raw frame.
- **FR102:** Stream routing is fixed so the same bytes are never rendered twice or lost: main-thread `text_delta` outside a tool call is `persona:said`; prose inside a document write comes from `input_json_delta` on that call and is `doc:prose`; writes to `.memlog.md` are `run:note` and **never** `doc:prose`, so memlog text can never enter the document buffer or its section parser; anything with `parent_tool_use_id` is subagent activity.
- **FR103:** Persona state is a projection with exactly one source each: `idle` (no session, or nothing running), `work` (any turn in flight, persisting through quiet subagent phases), `live` (a long-running attached process the session started), `note` (the watcher saw a change to a file this persona owns **that its own run did not make: a change observed while one of its runs is in flight, or within the watcher's settle window after that run's terminal event, is the run's own and raises no `note`**), `error` (this persona's last run failed or was stopped). Five states, four colours.
- **FR104:** A persona tile aggregates every session carrying its `agentId` — a tile may stand for more than one session.
- **FR105:** The decision-option block is rendered inside a persona turn when the persona stops to ask. Each option is its own control; activating one sends that option as the user's turn, in the user's name, and the whole block is then removed. There is no chosen state, no disabled state and no record of the block. The harness never authors the options, never reorders them and never marks one recommended; a stated lean is the persona's own words.

### NonFunctional Requirements

- **NFR1 (Architecture paradigm):** Read-only projection — an event-sourced read model with **no write side**. The harness owns no state of its own; it observes three external sources of truth (the project filesystem, the BMad install, a session's event stream), folds each into a read model, and renders it.
- **NFR2 (No second source of truth):** The harness never maintains its own model of project state. The live document card is the single thing rendering ahead of disk, because it shows a write still in flight — it is a view of the running skill, never a claim about what the project contains.
- **NFR3 (No writes into the project):** Every byte under the project's `_bmad/` tree got there because the runtime wrote it. Transcripts, session logs, caches and window state live in Electron `userData`, keyed by project path. No harness code path writes inside the project root.
- **NFR4 (Layering):** Six layers in dependency order — View (`src/renderer/ui/`), Design (`src/renderer/design/`), Bridge (`src/shared/`), Projections (`src/main/projections/`), Fold (`src/main/fold/`), Sources (`src/main/sources/`). Nothing in `ui/` may reach `sources/`, `fold/` or `projections/`; nothing in `fold/` may reach `sources/`; no arrow points upward.
- **NFR5 (Purity and testability):** Every interpreter in `fold/` is a pure function of the event sequence — no I/O, no filesystem, no wall clock except as an injected value. Projections are updated only by applying a domain event; no projection is mutated from a UI action.
- **NFR6 (Replay corpus):** Every session writes its raw `stream-json` to a log under `userData`, stamped with the contract version it was produced under. Recorded sessions are committed to `fixtures/runs/` as the replay corpus, covering at minimum a Fast-path single large write, a Coaching-path batched write, a `SIGINT` mid-write, and a failure inside the reviewer gate. Logs are retained per project with a bounded cap, pruned oldest-first. The raw log is a forensic and replay record only, never the authority for what the UI shows on restart.
- **NFR7 (Security posture):** `contextIsolation` on, `nodeIntegration` off, `sandbox` on. Every privileged capability crosses one narrow, explicitly enumerated preload API — no generic `invoke(channel, …)` passthrough. The renderer and document windows have no edge to the filesystem, the CLI or the install.
- **NFR8 (Trust boundary):** The project's **code** (skills, `_bmad/scripts/` resolvers, the runtime it configures) is trusted, because the user already executes exactly that code when they run BMad. The project's **content** (the markdown of a PRD, an architecture doc, a party summary) is untrusted the moment it is rendered, because it is largely model-authored.
- **NFR9 (Streaming performance):** One observed document write decomposed into **5,795 `input_json_delta` events carrying 69,031 characters**. Deltas must be coalesced in main before reaching any component, and the app must not jank during a document write — the single moment the whole product is judged.
- **NFR10 (Run duration):** The UI is designed around a multi-minute commitment — one observed `bmad-prd` run reached a complete PRD in ~12 minutes with first document content ~4 minutes in, and in a Fast-path run the whole document landed as one 68,394-byte write ~8.5 minutes in. Every waiting state is designed for the **unattended** reading first and the attended reading second.
- **NFR11 (Pinned stack, as a set):** Electron 44.4.5 (Node 24.18.1, Chromium 152), React 19.3.0, TypeScript **6.0.3** (not 7.x — `typescript-eslint` peers `<6.1.0`), Vite **7.3.6** (not 8.x — `electron-vite@5` peers `^5||^6||^7`), electron-vite 5.0.0, `@vitejs/plugin-react-swc` 4.3.3 (not `@vitejs/plugin-react`), electron-builder 26.15.3, Vitest 5.0.1, typescript-eslint 8.70.1, chokidar **4.0.3** (not 5.x — ESM-only), markdown-it 15.0.2, DOMPurify 3.4.16. `claude` and `uv`/Python 3.11+ are the user's own installs, not bundled. **Do not bump these individually.**
- **NFR12 (Naming and data conventions):** Domain events named `noun:verb-past`; personas addressed by BMad `agentId` everywhere internally, with display `name`/`title`/`icon` never used as keys; `kebab-case.ts` filenames with one exported concept per `fold/` module; project-relative POSIX paths in all domain events, absolute paths only inside `sources/` and `windows/`; epoch milliseconds in events, with elapsed run time derived from `run:started` rather than a per-tick field.
- **NFR13 (Platform):** macOS only in v1. Every macOS-specific call (`open -R`, `open -a`) is confined to `src/main/windows/`; no OS branch exists elsewhere, so a later port is additive.
- **NFR14 (Deployment):** One environment — a developer's own macOS machine. The harness runs from source (`electron-vite` dev) or as a local unsigned `electron-builder` package. No code signing, no notarization, no auto-update channel, no installer matrix, no server-side component and no network service of the harness's own; its only outbound work is the persona session, authenticating on the user's existing Claude Code login.
- **NFR15 (Theme):** Dark only. No light palette, no `prefers-color-scheme` branch, no high-contrast variant.
- **NFR16 (Accessibility posture):** Stakes are hobby — no WCAG conformance target is set and none is claimed. The named floor below is nonetheless binding.
- **NFR17 (Reduced motion):** `@media (prefers-reduced-motion: reduce)` sets `animation: none !important; transition: none !important` globally, with no exceptions and no "essential motion" carve-out. Every fact carried by motion must therefore also be legible with motion off — liveness during a run is carried by the elapsed counter, which is changing data and must keep ticking at >=1s.
- **NFR18 (No state by motion or colour alone):** Every dot is paired with a text state string in the same row — the reduced-motion fix and the colour-blindness mitigation simultaneously.
- **NFR19 (Contrast):** The locked token ramp bakes in a low-contrast `faint` tier. No `faint`-tier or lower string may be the only carrier of a fact; each must restate something also legible one step up, or be a label whose absence costs nothing.
- **NFR20 (Keyboard reach):** Every action in the Interaction Primitives table is reachable and operable from the keyboard, with roving tabindex for the tile and row lists, `Enter`/`Space` activation, `Enter` to send and `Shift+Enter` for a newline in the composer, and `Esc` to close the document window. There is no shortcut layer beyond this and no command-palette escape hatch.
- **NFR21 (Focus management):** One shared focus treatment on `:focus-visible` only, applied to every keyboard-operable surface. Focus stays on an activated persona tile (the skill row is rebuilt and must not steal focus); card expand focuses the card container, never the stop control; opening a document window focuses its document region, and `Esc` returns focus to the rail row that opened it; a queued send and a run terminal event never move focus.
- **NFR22 (Live regions):** Exactly one polite live region per window. Document prose is never announced (the card carries `aria-busy` while its run is in flight); run notes and run lifecycle events are announced politely, one announcement per event; rail changes are not announced; preflight failures, resolver errors and malformed entries are announced politely once. `aria-live="assertive"` is used nowhere. Announcements are throttled to at most one every 2s, queued in event order and never merged into a count.
- **NFR23 (Token discipline):** `design/tokens.css` opens with the mockup's `:root` block copied unchanged. A literal colour, dimension, radius or font stack in a component is a **defect**, not a style preference.
- **NFR24 (Voice discipline):** The harness never authors, stages, ranks or amplifies persona words or disagreement. Harness-authored microcopy is lower case, mono, `·`-separated, with no terminal punctuation, and states facts rather than guidance.
- **NFR25 (No guidance surface):** No highlighting, badging, sorting, recommending or next-step suggestion anywhere; no unread counts or quest markers.
- **NFR26 (Silence):** No audio anywhere in the product.
- **NFR27 (Responsive):** Desktop-first, `body{overflow:hidden}` at full size, two breakpoints only — `<=1180px` hides the party side panel, `<=1000px` unlocks scroll and stacks both views to a column. No mobile target, no third breakpoint. Type is fixed px; v1 does not respond to a text-scaling or zoom rule.
- **NFR28 (Product test, outranking all of the above):** *If it reads as a chat box with a portrait glued on, it has failed regardless of feature completeness.* Restraint in the shell is the budget the portraits spend; nothing may buy shell decoration with it.

### Additional Requirements

*(Technical requirements from the Architecture Spine that shape epic and story sequencing.)*

- **No starter template is specified.** The Architecture Spine pins a stack but names no greenfield starter. Epic 1 Story 1 is therefore a hand-rolled `electron-vite` + React + TypeScript scaffold against the exact pinned set in NFR11, installed as a set rather than individually.
- **The source tree is prescribed and binding**, not a suggestion: `src/main/{sources,fold,projections,windows}`, `src/preload/`, `src/shared/`, `src/renderer/{ui,design}`, `fixtures/runs/`.
- **The replay corpus is a build dependency, not a test nicety.** `fold/` interpreters are pure functions over recorded event sequences, and the corpus must cover four named scenarios. Recording real `stream-json` from live `bmad-prd` runs must be sequenced *before* the interpreters can be meaningfully tested, or the highest-churn module in the system is testable only by waiting out a multi-minute run.
- **Three open items require spikes before the work that depends on them commits:**
  1. **Stop semantics** — *settled in Epic 1, Story 1.1.* `SIGINT` ends the persona session; an in-band interrupt written to the session's stdin halts one turn and keeps the session, so FR90 stands for stops (`ARCHITECTURE-SPINE.md` AD-18; `_bmad/spikes/spike-stop-semantics.md`).
  2. **Cross-persona continuity** — whether a conversation continuous in transcript and artifacts, but not in process, satisfies CAP-8 and the success signal's demonstrable form.
  3. **Turn queueing** — whether a composer that queues a message typed during a twelve-minute run reads as honest or as broken.
- **Three resolver scripts must be invoked, and they do not share a directory**: `_bmad/scripts/resolve_config.py`, `_bmad/scripts/resolve_customization.py`, and the party skill's own `scripts/resolve_party.py`. Each invocation needs a timeout and a defined degrade path.
- **The filesystem watcher has two non-obvious configuration requirements** that will silently corrupt the run-note feed if missed: atomic temp-file rename handling (how `memlog.py` writes) and coalescing tolerance (three appends landed inside 400ms in one observed run).
- **`bmad-party-mode` already ships and works.** CAP-9 is a surfacing problem, not orchestration to build — group conversation, user participation and joint decisions all function today.
- **Spec amendments are outstanding.** The Architecture Spine lists eight decisions that override the source contract (runtime unit, menu entry shape, authoritative roster, resolver-only config, prerequisites, CAP-9 v1 scope, concurrency, collapsed-card form). `SPEC.md` and its companions should be updated so upstream and the spine do not diverge.
- **Deferred, and explicitly not to be built in v1:** party mode's *Open disagreements* / *Decisions so far* / tags / *Pause room*; the Help section (Should-tier, entry point reserved only); reactive persona faces; tile hover previews; second opinion; refusal-with-handoff; idle barks; signing/notarization/auto-update/distribution; Windows and Linux; light theme; multi-project windows; long scrollback virtualization; the Agent SDK as runtime.

### UX Design Requirements

*(From the DESIGN.md + EXPERIENCE.md contract. Each is scoped to be implementable and testable.)*

#### Design tokens

- **UX-DR1:** `design/tokens.css` opens with the `harness-mockup.html` `:root` block copied **verbatim, in source order** — the four-step surface ramp, the two hairlines, the four-tier text ramp, the accent and its 12% fill, the state triple, and the `--mono`/`--sans`/`--r` values. It is not a starting point to be tuned.
- **UX-DR2:** Add the `note` token (`#7f9ce8`) — the one token the architecture names as *missing* rather than copied. It is used by exactly one thing (the persona-tile note dot), nothing else may use it, and the note dot may not use `accent`.
- **UX-DR3:** Add the `disagree` trio (`disagree`, `disagree-border`, `disagree-bg`) and ship `--red` in the verbatim block even though nothing referenced it in the mockup. `red` is failure (error dot only, never tinting error text); `disagree` is friction (the party tags and `kind:open`). They must never be conflated.
- **UX-DR4:** Promote every recurring mockup literal to a named token: `accent-border`, `accent-wash`, `accent-edge`, `halo-live`, `halo-work`, `meta`, `ink-doc`, `ink-doc-strong`, `ink-doc-mute`, `ink-md`, `code-bg`, `code-ink`, the initials trio, `win-line`, `scrim`, and the legend-badge trio.
- **UX-DR5:** Encode the full type scale as tokens — two platform font stacks (no webfont, no icon font, no network dependency), **thirteen** named sizes (`badge` 9 through `h1` 20), four line-heights (1.55 / 1.72 / 1.45 / 0), the tracking table, and **600 as the only non-default weight in the system**.
- **UX-DR6:** Encode the radius family as ten tokens by role (`hairline` 1 / `micro` 2 / `chip` 3 / `control` 4 / `DEFAULT` 5 / `card` 6 / `window` 8 / `scrollbar` 10 / `full` 50% / `pill` 99px). Do not normalise to one radius — the variation encodes what kind of object a thing is. `pill` is the handoff chip and nothing else; perfect circles are reserved for things standing for a person or a light.
- **UX-DR7:** Encode the spacing ladder (`1.5 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 12 · 14`) and the binding layout constants: rail **348px**, topbar **42px**, rail head **30px**, thread max **940px**, party thread max **900px**, chat sub max **72ch**, document window `min(880px,92vw) × min(760px,80vh)` with a 36px titlebar and 28px foot, rendered-markdown measure **70ch**, card body max-height **230px**, composer 20px→120px. Padding is deliberately not on a scale and must not be regularised.
- **UX-DR8:** The party side panel ships at **240px**. The architecture's 288px literal is superseded by the Room-only decision and **must not be implemented**, and the panel must not reserve slots for the deferred sections.

#### Visual system rules

- **UX-DR9:** Implement the **register split** as the load-bearing mechanism it is: `mono` is the register of things written down (file paths, state strings, metadata, timestamps, codes, chips, tags, run status, harness microcopy, document prose); `sans` is the register of things said (persona voice, prose, names, titles, labels, run notes, rendered markdown). In the document card body the two feeds share one box and the typeface register is the **only** thing distinguishing them — no container, rule, label or background may be added to help.
- **UX-DR10:** Implement elevation as tonal, not cast: the five-step surface ramp *is* the elevation system. No elevation scale, no `z1/z2/z3`, no hover-lift. Shadows exist for exactly three jobs (state halos, inset rules, the document window's true separation). Exactly two z-indexes exist — 40 scrim, 50 window — and a surface that needs a z-index is a window and is built as one.
- **UX-DR11:** Express presence and absence with **opacity, never removal** (cast cards .42 / .72 / 1; file icon .75; brand mark .75). Within the text ramp, hierarchy comes from which tier is picked, never from opacity.
- **UX-DR12:** Implement the motion inventory as exactly five declarations, each bound to a real event: `pulse` (a turn in flight), `blink` at **`steps(1)`** — mandatory hard on/off, never a fade — (a caret at the tail of prose being written), `eq` (who is speaking now), `reveal` (a tile's menu hint opening), and `cast` (the speaker changing). No transition on colour elsewhere, no easing library, no spring, no entrance animation, no skeleton, no spinner — at any point, in any state. Streaming prose arrives in frame-sized bursts and a per-character typewriter must not be simulated.
- **UX-DR13:** Keep the rail monochrome and dense. No colour-coding by persona, module, file type or recency; the portrait is the only per-persona colour in the product. No gradients except the two chrome fills; no shadows carrying hue.

#### Components to build

- **UX-DR14 — Portrait:** per FR73–FR81; reference implementation `mockups/portrait.html`, with DESIGN.md winning on any disagreement. `viewBox="0 0 100 100"`, `role="img"`, `aria-label="{name}, {title}"`, `border-radius:50%`, wrapper at `line-height:0`.
- **UX-DR15 — Initials token:** 20px small-reference / 32px user avatar, `initials-bg` fill with a 1px `initials-line` border, mono in `initials-ink`, 11px glyph at 32px and 9.5px at 20px, `-5px` stacked overlap with a `0 0 0 1.5px panel-2` ring, hover/focus parity on the name-and-role reveal.
- **UX-DR16 — Status dot:** 6px circle carrying the entire state vocabulary. Five states, four colours; the halo appears only on the two "something is happening" states (`work`, `live`); the amber fill is unique to `work`. Every dot is accompanied by a text state string.
- **UX-DR17 — Persona tile:** 56px row, 36px portrait, name at 12.5px/600 with the title beside it in `dim`, state line below with its dot. Transparent default, `panel-2` hover revealing the menu hint (`max-height 0 → 60px` over .16s), `aria-current` current state with a 2px accent left bar.
- **UX-DR18 — Rail row:** two visually distinct registers on one line because the architecture forbids merging them — the disk state in the row's own typography, the run annotation optional and able to be absent without the row looking broken. While a file is being written: name to `text-strong`, meta to `amber`, icon stroke to `amber`, dot pulsing. 12×14 two-path inline SVG file icon at .75 opacity.
- **UX-DR19 — Document card:** head / body / foot per FR32, with the head's status string amber while writing and green when saved, the body scrolling at 230px max-height in its two modes, the foot carrying counts and the named not-yet-written sections, and a 6.5×13px accent caret at the tail. **No denominator and no progress bar anywhere in the card.**
- **UX-DR20 — Run note:** three-column grid `58px · 74px · 1fr` at 10px gap, baseline-aligned, `1px line-soft` between rows. Time in mono with `font-variant-numeric: tabular-nums` (required — a ragged time column destroys scannability), **and the 58px column must render correctly empty**, since the memlog carries no per-entry timestamp and a dead card's notes have none. Kind tag in micro mono at chip radius with the four named treatments **plus a neutral fallback for any unrecognised kind** (FR41). Reason in sans `dim` with the substantive phrase emphasised at 600.
- **UX-DR21 — Tags (neutral and disagree):** identical geometry, two tones. Neutral carries `evidence`, `concedes · partly`, `speaking`, `proposed`, `answers`, `builds on`, `decides`, `present · listening`. Disagree is the **only warm-toned chip on screen**.
- **UX-DR22 — Decision option block:** 5px radius `panel-2` block with a 12.5px/600 title, options stacking at 6px, a leading A/B/C key badge as the block's single accent use, and option text at line-height **1.45** (the tighter reading measure). No badge, highlight, sort order, default selection or recommended styling on any option; no chosen state and no disabled state, because the block does not survive being answered.
- **UX-DR23 — Focus:** one treatment everywhere — a `0 0 0 2px accent` ring at 2px offset (3px for stacked initials), drawn outside the element and inheriting its radius. No focus fill, no focus shadow, no colour change, no motion. `:focus-visible` only; hover and focus are separate treatments a surface may carry at once. It is specified for the enumerated list of keyboard-operable surfaces: view switch and each of its buttons, persona tile, skill button and `+N more`, composer field and send button, decision option, document card and its stop control, rail row, the document window's three escapes, cast chooser, party header controls, and the initials token.
- **UX-DR24 — Skill button:** `panel-2` ground, 1px `line`, 4px radius, body-ui type, with a leading code chip in micro mono at 2px radius — one step tighter than its parent. `panel-3` hover ground is the ramp's ceiling and the only use of that step. `+N more` renders in `faint`.
- **UX-DR25 — Composer:** `panel` ground, 6px radius, focus-within border shift, autogrowing textarea 20px→120px, send button in its own blue, hint lines below at `label` in `meta`.
- **UX-DR26 — Cast card:** 6px radius at `flex:1 1 0` with a 148px min-width on a horizontally scrolling gradient strip; 44px portrait; default opacity .42, hover .72, speaking 1 with a border, ground, restrained glow, a 2px accent portrait ring and the equaliser in `accent`.
- **UX-DR27 — Document window:** separate OS window over a `scrim` at z-40, window at z-50, top 8vh, `panel` ground with a 1px `win-line`, 8px radius (the only 8px in the product) and the one true shadow in the product. 36px gradient titlebar with three 10px lights, the full path in mono, and ghost buttons. Rendered markdown constrained to 70ch at 13.5/1.72, with the specified h1/h2/h3, table and `.fr` requirement-id treatments. The renderer's visual range is exactly what sanitized `markdown-it` output can be, and it must look intentional within that ceiling.
- **UX-DR28 — Shell furniture:** 42px `chrome` topbar with a pure-CSS brand mark and a `│` breadcrumb separator; segmented view switch at 12px/5px radius with `[aria-pressed="true"]` → raised ground, `text-strong`, `inset 0 -2px 0 accent`; custom 10px scrollbars with a 3px transparent inset border and `background-clip: content-box`. **The mockup's legend footer is prototype furniture and does not ship.**
- **UX-DR29 — Sysline:** centred 10.5px mono in `faint` with a 1px rule filling the space either side via `::before`/`::after`. Never styled as, or attributed to, a persona.

#### Behaviour, copy and accessibility

- **UX-DR30 — Microcopy:** implement the harness-voice string table — `writing · §4 Functional Requirements` not "Writing section 4 of 9…"; `saved · 3d` not "Last saved 3 days ago ✓"; `not yet written` not "Waiting for content…"; `no files under _bmad/ yet` not "Get started by running a skill"; `stop` not a confirm modal; `queued · sends when John finishes` not "Message will be delivered shortly". Lower case, mono, `·` separator, no terminal punctuation.
- **UX-DR31 — Stale copy cut:** the mockup's rail footer ("Read from each agent's `customize.toml`…") and composer hint ("skills read from `.claude/skills/…/customize.toml`") are factually wrong under the resolver contract. **Both strings are cut and nothing replaces them.** No config file path appears in copy anywhere.
- **UX-DR32 — Handoff sysline correction:** the mockup's "conversation and context continue" is false under the session model. The shipped line names the real mechanism — the artifacts — in write order: `handed off · John -> Amelia · picking up from PRD.md, epics.md`.
- **UX-DR33 — Dead-air treatment (Option A):** the run-note feed **becomes the card body** when prose is not streaming. Reference implementation `mockups/document-card-dead-air.html`, with EXPERIENCE.md winning on any disagreement. Options B (a separate reasoning band with an empty prose body) and C (foot-anchored reasons) are rejected and must not be built.
- **UX-DR34 — Collapsed card field set:** persona · **last run note's reason** · elapsed · stop. The last reason **replaces** the section name rather than sitting beside it — the section is already carried by the rail row, and a one-line card cannot hold five fields without becoming a paragraph. Before the first run note arrives, field 2 falls back to the section name; the reason truncates to one line with the full entry in the expanded card.
- **UX-DR35 — Reduced-motion mitigations:** with animation globally disabled, `work` is carried by the amber fill (unique among the five states) plus the **elapsed counter**, which is changing data and must keep ticking; a `changing` rail row is carried by its always-present text state string; streaming prose is carried by body growth with the caret rendering static-**on**, never static-off.
- **UX-DR36 — Empty states:** the Outputs half reads `no files under _bmad/ yet` with the watched path beneath; the document card has **no empty body**; the subagent region may be permanently empty on a given run and nothing may depend on it; the two deferred party sections are not rendered at all.
- **UX-DR37 — Responsive behaviour:** at `<=1180px` the party side panel is hidden outright; at `<=1000px` the shell unlocks scroll, both views stack to a column with the chat column at `min-height:62vh`, the rail moves below the chat and swaps `border-left` for `border-top` with each half at `min-height:230px`, cast cards wrap at `flex:1 1 44%`, and the topbar wraps with breadcrumbs on their own full-width row.
- **UX-DR38 — The banned list, as a testable prohibition set:** no command palette / `⌘K` / launcher / global skills list; no badges, unread counts, quest markers, relevance sorting, next-step highlighting or recommended actions; no spinners anywhere, including a sentence doing a spinner's job; no per-section tick-through, progress bars, staggered reveals of an atomic commit, or per-character typewriter effects; no dialog that resolves, merges, reverts, locks, patches or restores, and no undo; no editing affordance or refresh control in a document window; no tooltips or previews derived from a resolved skill name; no sound; no refusal-with-handoff.

### FR Coverage Map

Every one of the 105 FRs maps to exactly one epic.

| FR | Epic | Covers |
|---|---|---|
| FR1 | Epic 1 | Pointing at a project root is the entire setup |
| FR2 | Epic 1 | Roster enumerated from resolved `[agents.*]` |
| FR3 | Epic 1 | Config only via BMad's three resolvers |
| FR4 | Epic 1 | Resolver timeout, degrade to last good, named error |
| FR5 | Epic 1 | Config watched and re-resolved (the live-session clause is verified in Epic 2) |
| FR6 | Epic 2 | Orphaned live session keeps transcript and working close (the card and stop clauses are verified in Epic 3, Story 3.7) |
| FR7 | Epic 1 | Three-check launch preflight with remedies |
| FR8 | Epic 1 | The four-part "no agents resolve" message |
| FR9 | Epic 1 | No setup step, wizard or "where are you?" question |
| FR10 | Epic 1 | Pipeline position derived, never asked or stored (sprint-status parsing deferred — no v1 consumer) |
| FR11 | Epic 1 | Two views behind one switch; Help reserved, not rendered |
| FR12 | Epic 1 | Chat column + 348px rail split 50/50 |
| FR13 | Epic 1 | Topbar: brand, path, install chip, branch chip, switch |
| FR14 | Epic 1 | Chat column holds entries in time order |
| FR15 | Epic 2 | End-session control, the only way to clear a conversation |
| FR16 | Epic 2 | Durable state in main; reload loses nothing, run included |
| FR17 | Epic 1 | One project per window |
| FR18 | Epic 1 | Persona tile anatomy and `aria-current` |
| FR19 | Epic 1 | Chat header persona identity |
| FR20 | Epic 2 | `identity`/`communication_style` never harness-injected |
| FR21 | Epic 2 | Harness never authors words attributed to a persona |
| FR22 | Epic 1 | Tiles grouped by `module`/`team`, config order within |
| FR23 | Epic 3 | Skill button row inline above the composer |
| FR24 | Epic 3 | Menu entry: `code` + `description` + exactly one of skill/prompt |
| FR25 | Epic 3 | Entries resolve in main; skill vs prompt dispatch |
| FR26 | Epic 3 | Malformed entry surfaced as a named discovery error |
| FR27 | Epic 3 | No tooltip or preview from a resolved skill name |
| FR28 | Epic 3 | Buttons disabled on any turn in flight; `live` does not |
| FR29 | Epic 3 | `+N more` expands in place, writes no transcript entry |
| FR30 | Epic 3 | No skills list, launcher or command palette anywhere |
| FR31 | Epic 3 | `run:started` births a run-scoped inline card |
| FR32 | Epic 3 | Full card: head / body / foot |
| FR33 | Epic 3 | Collapsed card: persona, last reason, elapsed, stop |
| FR34 | Epic 3 | No denominator anywhere; the foot's named list is the plan |
| FR35 | Epic 3 | Body streams from `input_json_delta`, never from disk |
| FR36 | Epic 3 | Section plan from template then `.memlog.md`; headings win |
| FR37 | Epic 3 | Revision `Edit` reads `revising`, never advances the counter |
| FR38 | Epic 3 | Deltas coalesced in main; one node per animation frame |
| FR39 | Epic 3 | Two body modes; the card is never empty |
| FR40 | Epic 1 | Run note: time, kind, reason (built as a render over a real `.memlog.md`; Epic 3 mounts it live) |
| FR41 | Epic 1 | Open kind vocabulary with four named treatments and a neutral fallback |
| FR42 | Epic 3 | Dead-air head and foot; phase word only when fed |
| FR43 | Epic 3 | Accrued run notes persist above resumed prose |
| FR44 | Epic 3 | `doc:committed` empties the foot in one frame, no stagger |
| FR45 | Epic 3 | Subagent output never renders as persona voice |
| FR46 | Epic 3 | No spinner, skeleton, progress bar or staggered reveal |
| FR47 | Epic 3 | `run:finished` head, dot and caret transition |
| FR48 | Epic 1 | One rail row per file under `_bmad/`, any writer |
| FR49 | Epic 1 | Two independent fields; no merged status (annotation slot built empty-capable, populated in Epic 3) |
| FR50 | Epic 1 | Stream may annotate but never create, remove or assert |
| FR51 | Epic 1 | Owner is a `sessionId`, else artifact class, else nothing |
| FR52 | Epic 1 | Watcher configured for atomic rename and coalescing |
| FR53 | Epic 1 | Outputs empty state states the situation and stops |
| FR54 | Epic 1 | Rail shows project artifacts only |
| FR55 | Epic 1 | `doc.open(path)` opens a separate read-only OS window |
| FR56 | Epic 1 | Window reloads from the watcher |
| FR57 | Epic 1 | Full path in the title bar; three escapes; `Esc` closes |
| FR58 | Epic 1 | markdown-it with HTML disabled, DOMPurify sanitized |
| FR59 | Epic 1 | No refresh control, no edit affordance, no save |
| FR60 | Epic 2 | Tile click opens that persona's session in one conversation |
| FR61 | Epic 2 | `@<name>` handoff / addressing |
| FR62 | Epic 2 | Handoff sysline names the artifacts, not a continuation |
| FR63 | Epic 2 | Syslines are harness-authored, never attributed |
| FR64 | Epic 4 | Party session: `sessionId`, no `agentId`, no tile |
| FR65 | Epic 4 | Cast chooser, defaulting to the five core personas |
| FR66 | Epic 4 | Every chosen portrait permanently visible; dim, never remove |
| FR67 | Epic 4 | Party header: topic, count, turns, elapsed, write summary |
| FR68 | Epic 4 | v1 turn is portrait + name + role + timestamp + words |
| FR69 | Epic 4 | Room section only; the other two not rendered at all |
| FR70 | Epic 4 | No turn gate; the user interrupts the current speaker |
| FR71 | Epic 4 | Summary written to `_bmad/party/`, rail row owned by the room |
| FR72 | Epic 4 | Party has stop, not pause |
| FR73 | Epic 1 | `portrait()` / `artParamsFor()` pure and deterministic |
| FR74 | Epic 1 | SVG purity: no ids, defs, gradients, clips, filters, masks |
| FR75 | Epic 1 | Art direction: a plausible colleague, not a cartoon |
| FR76 | Epic 1 | The approved v2 geometry, in fixed draw order |
| FR77 | Epic 1 | The parameter set and derived shades |
| FR78 | Epic 1 | Curated five; everyone else derived from `agentId` |
| FR79 | Epic 1 | Render sizes 32/36/38/44; 32px legibility floor |
| FR80 | Epic 1 | `icon` never rendered as a portrait |
| FR81 | Epic 1 | One neutral expression; the dot carries state |
| FR82 | Epic 1 | Initials token with hover/focus parity |
| FR83 | Epic 3 | Stop control on full head and collapsed line |
| FR84 | Epic 3 | The cost stated on the control, never in a modal |
| FR85 | Epic 3 | No confirmation dialog, no "stopping…" state |
| FR86 | Epic 3 | File left byte-for-byte as written |
| FR87 | Epic 3 | Terminal event detection per turn, not per process |
| FR88 | Epic 3 | Commit on `tool_result`; one `doc:committed` per tool call |
| FR89 | Epic 3 | Stop/fail: card, rail annotation, tile error, no error text |
| FR90 | Epic 3 | The persona explains it in conversation and offers to resume |
| FR91 | Epic 1 | `{ code, message, detail? }` envelope; no stderr, no stack traces |
| FR92 | Epic 3 | Contention reported, never resolved; no undo |
| FR93 | Epic 3 | One silent macOS notification per terminal event when unfocused |
| FR94 | Epic 3 | Notification raises and scrolls; starts nothing |
| FR95 | Epic 2 | Long-lived persona session; `/bmad-agent-<x>` first on stdin |
| FR96 | Epic 2 | The three load-bearing flags |
| FR97 | Epic 2 | Chat turns and skill invocations are both turns |
| FR98 | Epic 2 | One turn in flight per session; sessions run concurrently |
| FR99 | Epic 2 | Queued composer, visible immediately, promoted in place |
| FR100 | Epic 2 | Sessions not held across restarts; dead cards after |
| FR101 | Epic 2 | The bridge contract: 14 events out, 7 commands in |
| FR102 | Epic 2 | Stream routing rules; memlog never enters the doc buffer |
| FR103 | Epic 2 | Persona state projection: five states, one source each |
| FR104 | Epic 2 | A tile aggregates every session carrying its `agentId` |
| FR105 | Epic 2 | The decision-option block and its removal on answer |

**Coverage by epic:** Epic 1 — 42 FRs · Epic 2 — 20 FRs · Epic 3 — 34 FRs · Epic 4 — 9 FRs · **Total 105.**

## Standing Constraint on Story Creation

**Any story whose acceptance criteria reference an external format cites the file it was read from.**

This exists because three of five external formats in this plan were specified wrongly from memory and caught only by opening the file: the `.memlog.md` kind vocabulary (FR41), the sprint status file (FR10), and the PRD template's section structure (FR36). The two that were correct — the `[agents.*]` roster fields (FR2) and the menu entry shape (FR24) — are the two somebody had actually executed. The pattern is not bad luck; it is a process defect that will recur the moment an AC is written against a format someone has pictured rather than opened. A cited path is the cheapest thing that would have caught all three.

Applies to every epic below, without exception.

**And a second check, for the same reason.** Coverage was verified against the FR list and the UX-DR list, both of which have checkers — and both came back complete while three components had no home story at all. An FR list states what the product *does*; it never states what it is *made of*, so every component the requirements merely assume falls through an FR-first decomposition silently. **Final validation therefore verifies the component inventory as well: each of DESIGN.md's sixteen named components, plus the conversation turn, must name the story that builds it.**

## Epic List

### Epic 1: Open a BMad project — the room, the files, and the shell

Point the harness at any BMad-installed project and get a real room: the installed personas with real illustrated faces, the project's own files updating live in the outputs rail, and any document openable full-size in its own window — with no configuration step, and a named prerequisite failure with its remedy instead of an empty room. Nothing runs yet; everything on screen is read from disk.

**Standalone:** a working BMad project viewer, requiring no session machinery.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR17, FR18, FR19, FR22, FR40, FR41, FR48, FR49, FR50, FR51, FR52, FR53, FR54, FR55, FR56, FR57, FR58, FR59, FR73, FR74, FR75, FR76, FR77, FR78, FR79, FR80, FR81, FR82, FR91

**NFRs addressed:** NFR1, NFR3, NFR4, NFR7, NFR8, NFR11, NFR12, NFR13, NFR14, NFR15, NFR16, NFR19, NFR23, NFR27, NFR28

**UX-DRs addressed:** UX-DR1–UX-DR21, UX-DR23, UX-DR24, UX-DR26–UX-DR29, UX-DR31, UX-DR36, UX-DR37, UX-DR38

**Implementation notes:**
- No starter template exists — this epic hand-rolls the `electron-vite` + React + TypeScript scaffold against the pinned set in NFR11, installed **as a set**, and lays down the prescribed six-layer source tree.
- Portraits carry the project's single highest risk (art direction reading as childish). They are pure, asset-free functions in their own module, so they are proven early and in isolation here, before anything depends on how they look.
- The rail ships with the annotation slot present but empty — FR50 requires a row to read as complete without it, which is exactly what makes this epic standalone. Epic 3 populates it.
- **The rail projection accepts an annotation input from day one and is tested against a stub annotation source.** FR49–FR51 are AD-2, the architecture's central rule, and without this the epic that *owns* the invariant could not exercise it — there is no session stream until Epic 3. Epic 3 substitutes the real stream for the stub and changes nothing else.
- The document window is a separate OS window and shares no files with the shell.
- **The portrait acceptance test is named and falsifiable**, despite the criterion sounding subjective: the generator matches the approved `mockups/portrait.html` reference and is reviewed at all four render sizes (32/36/38/44) plus the derived-agent grid. "Reads as a plausible colleague" has a concrete reference and a named judge.
- **The eight spec amendments the architecture requires are applied in this epic** as documentation work. They are already-true decisions, so nothing blocks them — but owned by no epic they leave `SPEC.md` diverging permanently from what gets built, and the next planning pass reads the wrong contract.
- **The run-note feed is built here, not in Epic 3.** It is a render over file content — time, kind, reason — so it needs a `.memlog.md`, not a session; eleven real ones exist in this repo to point it at. Building it in Epic 1 is the earliest point at which "you watch the why instead of being told it" can be judged thrilling rather than a changelog, and it means the next format surprise lands with nothing built on top of it. Epic 3 mounts the same component in the card body and feeds it live.
- **The stop-semantics spike ran at the front of this epic, ahead of the scaffold.** It was one subprocess, one turn and a stop attempted two ways, and it decided whether FR90 is a valid requirement at all. *Settled (Story 1.1):* `SIGINT` ends the session; an in-band interrupt on the session's stdin halts the turn and keeps it, so FR90 stands for stops (`ARCHITECTURE-SPINE.md` AD-18). It had no dependency on anything the harness builds, so nothing was gained by holding it until Epic 2.
- **Format sweep result — three of five external formats were wrong on paper.** Verified clean: the `[agents.*]` roster fields (FR2) and the menu entry shape (FR24), both exactly as specified. Verified wrong: the memlog vocabulary (FR41), the sprint status file (FR10), and the PRD template's section structure (FR36). The pattern is worth carrying into the build — **every format that had been executed was correct; every format described from memory was wrong.** Read the file before writing a parser against it.
- **Negative-surface check:** this epic's final story verifies the UX-DR38 prohibitions that apply to its own surfaces — no launcher or command palette, no badges, no next-step guidance, no editing affordance or refresh control in the document window, no spinner in any empty or loading state. Prohibitions cannot be demoed, so each epic owns a review of its own rather than three epics sharing one nobody runs.

### Epic 2: Talk to a persona — a conversation that holds

Hold a real conversation with any installed persona in their own voice, hand off to another persona mid-conversation without a restart, type during a long turn without being blocked, and find the transcript intact after closing and reopening the app.

**Standalone:** the conversational half of the product, usable on its own.

**FRs covered:** FR6, FR15, FR16, FR20, FR21, FR60, FR61, FR62, FR63, FR95, FR96, FR97, FR98, FR99, FR100, FR101, FR102, FR103, FR104, FR105

**NFRs addressed:** NFR2, NFR5, NFR6, NFR10, NFR17, NFR18, NFR20, NFR21, NFR22, NFR24, NFR26

**UX-DRs addressed:** UX-DR9, UX-DR16, UX-DR22, UX-DR25, UX-DR29, UX-DR30, UX-DR32, UX-DR35

**Implementation notes:**
- The full events-out/commands-in contract is declared **once** here, including the `doc:*` events Epic 3 consumes — a renderer-only event is a smell, and the contract version stamps every persisted log from this point on.
- **The stop-semantics spike moved to the front of Epic 1 and is settled.** This epic consumes its answer: a stop (the in-band interrupt) ends the turn and leaves the session, so the session lifecycle here has no stop-ends-the-session case. A session ends only through `session.close`, `conversation.end` or process exit (`ARCHITECTURE-SPINE.md` AD-18, AD-21).
- **One of the three open items resolves here** — whether a conversation continuous in transcript and artifacts, but not in process, satisfies CAP-8. Stop semantics resolve earlier, in Epic 1. The third, whether a queued message reads as honest, **cannot resolve here**: it asks about a message typed during a twelve-minute run, and this epic has no runs. It resolves in Epic 3.
- Recording the `fixtures/runs/` replay corpus starts here — `fold/` interpreters are pure functions over recorded sequences, so the corpus is a build dependency for Epic 3, not a test nicety. **Fixtures store raw CLI `stream-json` frames, not domain events.** The version stamp is metadata for forensics, not a validity constraint — storing domain events would mean any later contract bump invalidated the corpus, and re-recording a scenario like a failure inside the reviewer gate is not cheap.
- **Negative-surface check:** this epic's final story verifies the UX-DR38 prohibitions on its own surfaces — no refusal-with-handoff, no sound, no tooltip derived from a resolved skill name, no composer that parses skill names, and a decision-option block with no recommended styling, no default selection and no surviving chosen state.

### Epic 3: Run a skill — watch it write, stop it, understand however it ends

Press a button belonging to whoever you are talking to and watch the document being authored: prose streaming in, the section being written now, the sections still to come, and the run's own reasoning through the multi-minute silences — never a spinner. Halt it at any moment with the cost stated on the control before it is pressed. Every way a run can end is legible without reading logs.

**Standalone:** the product's core and the success signal's demonstrable form.

**FRs covered:** FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR42, FR43, FR44, FR45, FR46, FR47, FR83, FR84, FR85, FR86, FR87, FR88, FR89, FR90, FR92, FR93, FR94

**NFRs addressed:** NFR2, NFR9, NFR10, NFR17, NFR18, NFR25

**UX-DRs addressed:** UX-DR19, UX-DR20, UX-DR24, UX-DR33, UX-DR34, UX-DR38

**Implementation notes:**
- This deliberately merges live authoring with stop and failure legibility. They share `fold/`, the document card head, and the rail annotation, and EXPERIENCE.md pre-designs all six card states — so there is no feedback loop between them, and splitting would build the card head across three separate epics.
- The dead-air treatment (the run-note feed becoming the card body) is the hardest problem in the product: in a Fast-path run nothing is on disk for ~8.5 minutes and the card is the only evidence of life. Options B and C are rejected and must not be built.
- Streaming performance is load-bearing here, not a polish pass: one observed write was 5,795 deltas carrying 69,031 characters.
- **Epic 2's replay corpus is critical path for this epic, not a test convenience.** It is what lets the card and the `fold/` interpreters be built and exercised against recorded runs instead of waiting out live multi-minute ones. Treat a missing or unusable corpus as a blocker here, not as missing coverage.
- **The stop spike's outcome reaches further than the control's copy.** Settled in Epic 1: a stop keeps the session, so FR90's "the persona explains it in conversation" holds for stops as well as failures, and FR89's deliberate conflation of `stopped` and `failed` on the tile covers two outcomes with the same recoverability whenever the session survives. The failure stories must still resolve the case where the session ends with the run (process exit, or the interrupt's `SIGINT` fallback), where no persona remains (`ARCHITECTURE-SPINE.md` AD-18).
- The turn-queueing open item inherited from Epic 2 resolves here, against a real run.
- **The merge is load-bearing for 31 of the 34 FRs, and the other three are the epic's cut line.** The card's six states are one state machine, not six features — its head status, dot, caret and foot all read one projection, so building half the transitions means redesigning rather than extending. The stop control is a field in the head's layout and one of exactly four in the collapsed line, so removing it designs a different component rather than the same one minus a button. And FR88's commit-on-`tool_result` is a single function whose happy and failure paths are the same branch — split across two epics it gets fixed in opposite directions by two owners. **What is *not* coupled: FR92 (contention, a rail annotation) and FR93–FR94 (a macOS notification in `main/windows/`).** Those three share no file, projection or token with the card and sit here by association. If this epic runs long they are the only FRs that can be dropped without breaking a state machine or splitting a function — which makes them the descope boundary, not a recommendation to drop them.
- **The run-note feed component arrives from Epic 1 already built and already judged.** This epic mounts it in the card body and feeds it live from `run:note`; it does not re-specify the note. The `.memlog.md` format is a verified constraint, not an assumption — open kind vocabulary (13 kinds observed, `event`/`constraint`/`capability` ranking 2nd/3rd/4th) and **no per-entry timestamp**.
- **Sequencing directive: a thin vertical slice of Flow 1 lands first in this epic, not last** — dispatch a menu entry, birth a card, stream prose, reach `saved`. This is the first point in the whole build at which the product's thesis is testable, and the structure is already three epics deep before it arrives. Depth (dead air, revisions, stop costs, failure states) comes after the slice proves the beat.
- **Follow-ups from the Story 3.1 live judgement land before 3.2:** Stories 3.12 (one document per card), 3.13 (`live` after a run) and 3.14 (pinned card), from `sprint-change-proposal-2026-10-03-beat-judgement.md`. Story 3.4 stands as planned: the live run's dead air was 1 min 40 s to the first note, with a 20-minute middle in which the body must not freeze on a stale buffer, which 3.12 prevents.
- **Negative-surface check:** this epic's final story verifies the UX-DR38 prohibitions most at risk here — no spinner at any point including a sentence doing a spinner's job, no progress bar or denominator, no per-section tick-through or staggered reveal of an atomic commit, no per-character typewriter, no undo or resolve/merge dialog, no Dock badge.

### Epic 4: Convene the room — party mode

Convene a room of chosen personas in one conversation you participate in, with every face permanently visible, the current speaker lit, no turn-taking gate, and the room's summary written to `_bmad/`.

**Standalone:** the second top-level view. Builds on Epics 1–2 and is independent of Epic 3.

**FRs covered:** FR64, FR65, FR66, FR67, FR68, FR69, FR70, FR71, FR72

**NFRs addressed:** NFR24, NFR25, NFR27

**UX-DRs addressed:** UX-DR21, UX-DR26, UX-DR36, UX-DR38

**Implementation notes:**
- `bmad-party-mode` already ships and works — group conversation, user participation and joint decisions all function today. CAP-9 is a **surfacing** problem, not orchestration to build, which is why this epic is small.
- Two of the three side-panel sections and the transcript's disagreement tags are deferred for want of a data source, and must not be rendered even as empty states, nor have slots reserved for them. The panel ships at 240px, superseding the architecture's 288px literal.
- **Negative-surface check:** this epic's final story verifies the UX-DR38 prohibitions on its own surfaces — no deferred section rendered as an empty state, no reserved slots, no `disagrees`/`evidence` tag, no quote-back chrome, no turn gate, no pause control, and no 288px panel.

---

## Epic 1: Open a BMad project — the room, the files, and the shell

Point the harness at any BMad-installed project and get a real room: the installed personas with real illustrated faces, the project's own files updating live in the outputs rail, and any document openable full-size in its own window — with no configuration step, and a named prerequisite failure with its remedy instead of an empty room. Nothing runs yet; everything on screen is read from disk.

Stories are ordered so the two things most likely to kill the product — the reasoning feed and the portraits — are looked at before the bottom-up work begins.

### Story 1.1: Settle what stopping a run actually costs

As a developer on the harness,
I want to know whether `SIGINT` can halt one turn of a long-lived `claude` session without ending the session,
So that CAP-11's shape and FR90's validity are settled before any code depends on either.

**Implements:** *(no FRs — this spike settles whether FR90 is a valid requirement and which branch FR84 ships)*

**Acceptance Criteria:**

**Given** a `claude` subprocess spawned with the FR95 invocation (`-p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`) and `/bmad-agent-pm` sent as the first turn on stdin
**When** a skill turn is dispatched and `SIGINT` is sent while a tool call is in flight
**Then** it is recorded whether the process survives, whether a `result` row arrives terminating that turn, and whether a subsequent turn can be sent on the same session.

**Given** the observed outcome is Branch A (the turn halts, the session survives)
**Then** FR84 ships a plain `stop` control with no confirmation
**And** FR90 stands as written — the persona remains to explain what got done and what broke.

**Given** the observed outcome is Branch B (stopping also ends the session)
**Then** FR84 ships `stop · ends this conversation` on the full card head and carries the cost in the collapsed line's accessible name
**And** FR90 is amended for stops: no persona remains to deliver the explanation, so the harness reports the outcome in its own register and never fabricates a persona voice.

**Given** `SIGINT` is sent
**When** the process exits
**Then** the exit latency is measured and recorded, confirming or refuting the ~250ms figure that FR85's no-transitional-state rule depends on.

**Given** the spike concludes
**Then** the finding is appended to the project memlog, `execution-model.md`'s stated open risk is closed, and the spike code is discarded rather than merged.

### Story 1.2: A running application on the pinned stack

As a developer on the harness,
I want an Electron application that builds, runs, tests and packages on the exact pinned dependency set inside the prescribed source tree,
So that every later story starts from a working, correctly-layered project instead of renegotiating the stack.

**Implements:** NFR1, NFR4, NFR7, NFR11, NFR12, NFR13, NFR14

**Acceptance Criteria:**

**Given** the pinned set in NFR11
**When** dependencies are installed
**Then** the resolved tree matches those exact versions — Electron 44.4.5, React 19.3.0, TypeScript 6.0.3, Vite 7.3.6, electron-vite 5.0.0, `@vitejs/plugin-react-swc` 4.3.3, electron-builder 26.15.3, Vitest 5.0.1, typescript-eslint 8.70.1, chokidar 4.0.3, markdown-it 15.0.2, DOMPurify 3.4.16 — and installs with no unmet peer ranges.

**Given** three rows are deliberately held below their newest published version
**Then** a note in the repository records why each is held (typescript-eslint peers `<6.1.0`; `electron-vite@5` peers Vite `^5||^6||^7`; chokidar 5 is ESM-only against a CJS main build)
**And** the note states that the set is bumped together or not at all.

**Given** the prescribed source tree
**Then** `src/main/{sources,fold,projections,windows}`, `src/preload/`, `src/shared/`, `src/renderer/{ui,design}` and `fixtures/runs/` all exist.

**Given** the layering rule
**When** lint runs
**Then** an import from `ui/` into `sources/`, `fold/` or `projections/`, or from `fold/` into `sources/`, fails the build rather than warning.

**Given** the security posture
**When** a window is created
**Then** `contextIsolation` is on, `nodeIntegration` off and `sandbox` on
**And** the preload exposes an explicitly enumerated API with no generic `invoke(channel, …)` passthrough.

**Given** the dev command
**When** the app launches against a project path
**Then** exactly one window opens for that one project and closes cleanly.

**Given** electron-builder
**When** a package is produced
**Then** it is an unsigned local macOS build with no notarization, no auto-update channel and no installer matrix.

### Story 1.3: The visual contract in one file

As a developer on the harness,
I want every colour, dimension, radius and font stack available as a named token,
So that independently built surfaces cannot drift into "roughly the same dark grey", and a literal in a component becomes a detectable defect.

**Implements:** UX-DR1–UX-DR8, UX-DR10–UX-DR13 · NFR15, NFR23

**Acceptance Criteria:**

**Given** `_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html`
**When** `src/renderer/design/tokens.css` is created
**Then** that file's `:root` block opens it, copied unchanged and in source order.

**Given** the architecture names exactly one token as missing rather than copied
**Then** `--note: #7f9ce8` exists and is visibly distinct from `--accent: #7fa6e8`
**And** nothing but the persona-tile note state may reference it.

**Given** red is failure and disagree is friction
**Then** `--red` ships inside the verbatim block even though the mockup never referenced it
**And** the `disagree` / `disagree-border` / `disagree-bg` trio exists separately.

**Given** the promoted-literal list
**Then** `accent-border`, `accent-wash`, `accent-edge`, `halo-live`, `halo-work`, `meta`, `ink-doc`, `ink-doc-strong`, `ink-doc-mute`, `ink-md`, `code-bg`, `code-ink`, the initials trio, `win-line`, `scrim` and the legend-badge trio are all named tokens.

**Given** the type scale
**Then** thirteen named sizes exist across two platform font stacks with four line-heights
**And** 600 is the only non-default weight defined anywhere.

**Given** the radius family
**Then** ten values exist by role, `pill` is reachable only by the handoff chip, and the party side panel constant is **240px** — the superseded 288px does not appear.

**Given** `prefers-reduced-motion: reduce`
**Then** a global rule sets `animation: none !important; transition: none !important` with no exceptions and no essential-motion carve-out.

**Given** the theme decision
**Then** no light palette, no `prefers-color-scheme` branch and no high-contrast variant exists in the file.

### Story 1.4: The accessibility floor — focus, keyboard reach, and one live region

As someone who works from the keyboard,
I want one focus treatment applied identically to every operable surface and one honest live region,
So that keyboard use is never a second-class path, and a screen reader is neither drowned by a stream nor told nothing at all.

**Implements:** UX-DR23 · NFR16, NFR20, NFR21, NFR22

**Acceptance Criteria:**

**Given** the focus treatment
**Then** it is a `0 0 0 2px accent` ring at 2px offset, drawn outside the element and inheriting that element's radius
**And** stacked initials take a 3px offset so the ring clears the `-5px` overlap of the disc behind.

**Given** the treatment
**Then** there is no focus fill, no focus shadow, no colour change and no motion — the ring is the whole treatment, identical on every primitive.

**Given** `:focus-visible`
**Then** a mouse press never draws the ring.

**Given** hover and focus
**Then** they are separate treatments — hover raises the ground, focus draws the ring — and a surface may carry both at once
**And** they are never collapsed into one.

**Given** the treatment is defined once
**Then** every surface references it and no component reimplements it, so a literal focus style in a component is a defect like any other literal.

**Given** the surfaces the experience contract requires to be keyboard-operable
**Then** this story provides the single implementation that each of their own stories asserts against: the view switch and each of its buttons, the persona tile, the skill button and `+N more`, the composer field and the send button, the decision option, the document card and its stop control, the rail row, the document window's three escapes, the cast chooser, the party header controls, and the initials token.

**Given** a list surface — the persona tiles, the rail rows, the skill row
**Then** a roving tabindex gives the list one tab stop, arrow keys move within it, and `Enter`/`Space` activates.

**Given** the product has no command palette and therefore no `⌘K` escape hatch
**Then** keyboard access is designed into the direct surfaces instead, with no shortcut layer beyond the one specified.

**Given** the live-region policy
**Then** **exactly one polite live region exists per window**, and `aria-live="assertive"` is used nowhere in the product — nothing here is urgent enough to interrupt what the user is reading.

**Given** announcements
**Then** they are throttled to at most one every two seconds, with those arriving inside an interval queued and read in event order, never merged into a count.

**Given** the content classes this region will carry once later epics feed it
**Then** the policy is established here and asserted by those epics: document prose is **never** announced and its card carries `aria-busy` while its run is in flight; run notes and run lifecycle events are announced politely, one announcement per event; filesystem churn on the rail is **not** announced; and preflight failures, resolver errors and malformed menu entries are announced politely, once.

**Given** stakes are hobby
**Then** no WCAG conformance level is claimed — this floor is the set of holes that are real, cheap to close and expensive to retrofit, and nothing more is asserted.

### Story 1.5: Watch the reasoning — the run-note feed over a real memlog

As someone who will watch a persona work for twelve minutes,
I want to read the run's own decisions and the reasons behind them as a scannable feed,
So that it can be judged now — before anything is built on top of it — whether "you watch the why instead of being told it" is thrilling or merely a changelog.

**Implements:** FR40, FR41 · UX-DR9, UX-DR20

**Acceptance Criteria:**

**Given** `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/.memlog.md`
**When** the feed component is pointed at that path
**Then** every entry renders as one row of time, kind tag and reason, stacked in file order, newest last.

**Given** `_bmad/scripts/memlog.py` states that the host skill supplies the vocabulary and the writer enforces none, and thirteen distinct kinds occur across this repository's memlogs
**When** an entry's kind is read
**Then** `decision` renders in the accent treatment, `assumption` in the neutral treatment, `question` and `gap` in the warm friction treatment
**And** every other kind — including `event`, `constraint`, `capability`, `change`, `version`, `technique`, `note`, `override` and `direction` — renders in the neutral treatment without error.

**Given** the file format is `- (kind) text` and carries no per-entry timestamp
**When** a note is rendered from a file rather than observed live
**Then** the 58px time column renders empty and the row remains legible and correctly aligned.

**Given** the writer emits `(kind by author)` when authorship is recorded
**When** such an entry is parsed
**Then** the kind resolves correctly and the author does not leak into the reason text.

**Given** the register split
**Then** the reason renders in sans at `body-ui` in `dim` with its load-bearing clause at 600 in `text`, and the time renders in mono at `meta` with `font-variant-numeric: tabular-nums`
**And** no container, rule, label or background is added to separate the two registers.

**Given** a memlog of forty or more entries
**When** the feed renders
**Then** rows sit on a `58px · 74px · 1fr` grid at 10px gap, baseline-aligned, separated by `1px line-soft`, with no row exceeding the card body's eventual 230px scroll behaviour.

**Given** the feed rendered against a real run's memlog
**When** the user reviews it
**Then** a decision is recorded on whether the treatment holds, before any dependent work begins.

### Story 1.6: Faces that read as colleagues

As someone who will look at these faces every working day,
I want each persona rendered as an illustrated colleague rather than a label,
So that the product's central claim — a room where a team visibly works — survives its first impression.

**Implements:** FR73, FR74, FR75, FR76, FR77, FR78, FR79, FR80, FR81, FR82 · UX-DR14, UX-DR15 · NFR28

**Acceptance Criteria:**

**Given** the portrait module
**Then** `portrait(artParams, size, state)` and `artParamsFor(agentId)` are pure functions with no I/O, no global state and no external assets
**And** determinism is asserted in tests: the same input yields byte-identical output.

**Given** two portraits rendered in one document
**Then** neither SVG contains an `id`, `<defs>`, gradient, clip path, filter, mask or external reference, so they cannot collide
**And** all shading is achieved with overlaid low-opacity shapes.

**Given** the approved v2 geometry
**Then** the face is a tapered-jaw path at a 0.76 width/height ratio; one upper-left light source is carried by all four shapes (right-contour shadow, cheek highlight, jaw shadow on the neck, inner-ear shadows); eyes are almond with socket shadow, iris, smaller pupil, catchlight and weighted upper lid; brows are filled tapered wedges; the nose has bridge shadow, tip and nostrils; the mouth is a resting curve with a lower-lip highlight; hair carries a highlight arc omitted only for `receding`
**And** the draw order is exactly as specified.

**Given** an agent that is not one of the five curated personas
**When** its parameters are derived
**Then** they come from a 32-bit FNV-1a hash salted per field, with `style` drawn from the weighted six-entry list and `beard` at 32%, `glasses` at 34%, `earrings` at 28%
**And** the same `agentId` yields the same face across runs and machines.

**Given** the closed set of render sizes
**Then** portraits render at 32, 36, 38 and 44 only, with no code path rendering one at 20px
**And** the `icon` field from config is never rendered as a portrait at any size, including as a fallback.

**Given** `state` is accepted by the signature
**Then** every face renders the same single neutral expression at every state value.

**Given** accessibility
**Then** every portrait `<svg>` carries `role="img"` and `aria-label="{name}, {title}"` at every size.

**Given** the initials token
**Then** it renders at 20px for small references and 32px for the user's avatar, stacks with `-5px` overlap and a `panel-2` ring, and reveals name and role identically on `:hover` and `:focus-visible` with `tabindex="0"` and `role="img"`.

**Given** the art direction is the project's highest named risk
**When** the generator is reviewed against `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/mockups/portrait.html` at all four render sizes plus a derived grid of at least twelve agents
**Then** the user confirms the faces read as plausible colleagues rather than as a cartoon, and that confirmation is the story's acceptance.

### Story 1.7: The team, read from the project's own install

As someone opening a project the harness has never seen,
I want the team and their menus read from that project's BMad install,
So that everything is correct with no configuration from me, and stays correct when BMad changes underneath.

**Implements:** FR1, FR2, FR3, FR4, FR5, FR91

**Acceptance Criteria:**

**Given** `_bmad/scripts/resolve_config.py`, `_bmad/scripts/resolve_customization.py` and the party skill's own `scripts/resolve_party.py`
**When** configuration is needed
**Then** it is obtained by invoking those resolvers and consuming their merged JSON
**And** no code path reads `config.toml` or `customize.toml` directly, and the harness implements no TOML layering of its own.

**Given** `resolve_config.py --key agents` returns per-agent `module`, `team`, `name`, `title`, `icon` and `description` (verified against this project's own output)
**When** the roster is built
**Then** those six fields populate it
**And** agents are never discovered by globbing skill directories on a name prefix.

**Given** `resolve_customization.py` returns menu entries carrying `code`, `description` and exactly one of `skill` or `prompt` (verified against `bmad-agent-analyst`, whose entries include `BP` → `skill` and `MR`, `DR`, `TR` → `prompt`)
**When** a menu is resolved
**Then** each entry is stored keyed by its `code`, with the `skill`-versus-`prompt` decision held in main and never sent to the renderer.

**Given** any resolver invocation
**Then** it is bounded by a timeout and its output is schema-validated before use.

**Given** a resolver that fails, times out, **or returns valid JSON in an unexpected shape**
**When** the result is consumed
**Then** the last good result is retained and a named error surfaces
**And** the roster is never silently empty and never silently stale.

**Given** a configuration file changes on disk
**When** re-resolution runs
**Then** the roster and the menus update in a single frame with no arrival or removal animation.

**Given** any failure crossing the bridge
**Then** it takes the form `{ code, message, detail? }` with a stable `code`, `message` is what renders, `detail` sits behind a disclosure control, raw subprocess stderr never reaches the renderer and no stack trace is ever shown.

### Story 1.8: Launch tells you what is missing

As someone launching the harness against a project for the first time,
I want to be told exactly which prerequisite is absent and how to resolve it,
So that a project that cannot open explains itself instead of presenting an empty room.

**Implements:** FR7, FR8, FR9

**Acceptance Criteria:**

**Given** the `claude` check
**When** the binary is absent from `PATH`, Then one message names that and its remedy
**And when** the binary is present but unauthenticated, Then a second, distinct message names that and its remedy.

**Given** the `uv` check
**When** `uv` is absent, Then one message names that and its remedy
**And when** `uv` resolves a Python below 3.11, Then a second, distinct message names that and its remedy.

**Given** the agent-resolution check
**When** the target project resolves no agents
**Then** the message states all four things: what was looked for (agents), where it looked (this project, under `--setting-sources project,local`), why a correctly installed BMad can still resolve none there (a user-scoped rather than project-scoped install), and what would change it
**And** it must not read as "no agents found".

**Given** any preflight failure
**Then** the harness does not open to a room with no personas and no explanation.

**Given** all three checks pass
**Then** the 1:1 view opens directly, with no setup step, no onboarding wizard and no question about where the user is in the process.

### Story 1.9: Conversation and project state in one window

As someone who will work in this window for hours at a time,
I want the conversation surface and the project's state visible at once,
So that I never leave the product to see what the work produced.

**Implements:** FR11, FR12, FR13, FR14, FR17 · UX-DR28, UX-DR37 · NFR27

**Acceptance Criteria:**

**Given** the shell
**Then** exactly two top-level views exist behind a single switch — 1:1 Conversation and Party Mode — with no third view anywhere
**And** the Help entry point is reserved in the topbar layout but does not render in v1, so it is not a tab stop.

**Given** the 1:1 view
**Then** the chat column sits left and the rail is fixed at 348px on the right, split into two halves at `flex: 1 1 50%` — Team above, Outputs below.

**Given** the topbar
**Then** it is 42px on `chrome` with a 1px `line` bottom rule, carrying brand mark, project path, install chip, branch chip and the segmented view switch, with `│` as the breadcrumb separator.

**Given** the chat column
**Then** its thread is constrained to 940px and it holds conversation entries in time order.

**Given** the view switch
**Then** the pressed button carries `[aria-pressed="true"]` with the raised ground, `text-strong` and `inset 0 -2px 0 accent` treatment
**And** it is reachable and operable from the keyboard with the shared focus ring on `:focus-visible` only.

**Given** window width at or below 1180px, Then the party side panel is hidden outright.
**Given** window width at or below 1000px, Then the shell unlocks scroll, both views stack to a column with the chat column at `min-height: 62vh`, the rail moves below with its `border-left` becoming a `border-top` and each half at `min-height: 230px`, and the topbar wraps with breadcrumbs on their own row.

**Given** full size
**Then** `body` has `overflow: hidden` and one project is open per window.

### Story 1.10: The team, with faces, in the rail

As someone deciding who to talk to,
I want every installed persona present as a specific colleague with a visible state,
So that the room reads as people rather than as a list of capabilities.

**Implements:** FR18, FR19, FR22 · UX-DR16, UX-DR17

**Acceptance Criteria:**

**Given** the Team half
**Then** one 56px tile renders per installed agent, carrying a 36px portrait, the name at `name`, the title beside it at `ident` in `dim`, and a state line below at `label` with its status dot.

**Given** a tile is current
**Then** it carries `aria-current="true"`, a `#1f262f` ground and a 2px `accent` left bar
**And** hover raises the ground to `panel-2` and reveals the menu hint by expanding `max-height` from 0 to 60px over .16s.

**Given** tile ordering
**Then** tiles are grouped by the agent's `module` and by `team` where present, and within each group appear in the order the resolved config lists them
**And** no relevance sort, recency sort, pinning, badging or highlighting exists.

**Given** roughly six tiles fit the Team half before it scrolls
**Then** the grouping remains legible when an install exceeds the five core agents.

**Given** the status dot
**Then** five states resolve to four colours — `idle` `faint`, `work` amber with halo, `live` green with halo, `note` the dedicated note-blue, `error` red — with the halo present only on `work` and `live`
**And** every dot is paired with a text state string in the same row, so no state is carried by colour or motion alone.

**Given** no sessions exist in this epic
**Then** every tile renders `idle` from real state rather than from a placeholder.

**Given** the chat header
**Then** it renders the current persona's portrait at 38px, their name at `head` — the largest type in the shell — their title, and their current state
**And** its second line is constrained to 72ch.

**Given** the active persona changes
**When** a different tile is marked current
**Then** the chat header rebuilds to that persona in the same frame
**And** the name and title come from the resolved roster, never from a harness-side table.

### Story 1.11: The project's files, changing as they change

As someone whose work produces files,
I want the project's own artifacts to appear and update in the rail as they are written,
So that I see what the work produced without leaving the window or trusting the harness's memory.

**Implements:** FR10, FR48, FR49, FR50, FR51, FR52, FR53, FR54 · UX-DR18, UX-DR30 · NFR3

**Acceptance Criteria:**

**Given** the Outputs half watches the project's `_bmad/` tree
**When** a file is created or modified by **any** writer — an external editor, a terminal `claude`, anything
**Then** a row appears without user action, indicates while the file is being written, and settles to `saved · <age>`.

**Given** a rail row
**Then** it carries two independent fields written by different sources: a disk `state` (`not yet written` → `changing` → `saved · <age>`) owned solely by the watcher, and an optional run `annotation` owned solely by the stream
**And** there is no merged status field anywhere in the row.

**Given** the annotation source is stubbed in this story
**When** a row renders with no annotation at all
**Then** the row reads as complete and correctly laid out
**And** feeding a stub annotation verifies that it may decorate a row but can never create one, remove one, or change what the row says the file contains.

**Given** a row's owner
**Then** it resolves from the writing session where observed, otherwise from the artifact class, otherwise **does not render at all** — the harness never guesses an owner.

**Given** `_bmad/scripts/memlog.py` writes by atomic temp-file rename with an fsync before the rename
**Then** the watcher is configured for atomic writes, or appends are missed or double-counted.

**Given** rapid appends coalesce — three landed inside 400ms in one observed run
**Then** nothing downstream assumes one filesystem event per entry.

**Given** a fresh project with nothing under `_bmad/`
**Then** the Outputs half reads `no files under _bmad/ yet` with the watched path beneath it, and suggests no next step, names no skill and points at no persona.

**Given** the harness's own transcripts, logs, caches and window state live in Electron `userData`
**Then** none of them ever appears in the rail, and no affordance implies the harness authored or can author a file.

**Given** pipeline position
**Then** the harness **never asks the user where they are and never stores its own answer** — this negative is the substance of the requirement.

**Given** what the product actually surfaces in v1
**Then** position is read from **which artifacts are present** under `_bmad/`, which the rail already observes
**And** `_bmad/implementation-artifacts/sprint-status.yaml` is treated as one more artifact — it gets a row and an owner derived from its class, and **its contents are not parsed**, because no surface in v1 consumes a parsed pipeline position and the product forbids every affordance that would.

**Given** the file's format was verified during planning and should not need re-researching if a consumer appears
**Then** the finding is recorded rather than implemented: `development_status` is a **flat map** whose keys carry the structure (`epic-1`, `1-1-<slug>` and `epic-1-retrospective` share one namespace), the status vocabulary is **six values** (`backlog`, `ready-for-dev`, `in-progress`, `review`, `done`, `optional`) rather than the three the install contract describes, and timestamps are `MM-DD-YYYY HH:MM` rather than ISO — verified against `.claude/skills/bmad-sprint-planning/sprint-status-template.yaml`.

### Story 1.12: Read a document at full size without losing the room

As someone reviewing what a persona wrote,
I want any artifact to open full-size in its own window that stays current,
So that I can read it properly without leaving the conversation or trusting a stale copy.

**Implements:** FR55, FR56, FR57, FR58, FR59 · UX-DR27 · NFR8

**Acceptance Criteria:**

**Given** a rail row
**When** it is clicked, or focused and activated with `Enter`
**Then** `doc.open(path)` opens a separate OS window rendering that file read-only.

**Given** the file changes on disk
**When** the watcher observes the write
**Then** the window reloads from the watcher, never from a renderer-initiated read.

**Given** the window chrome
**Then** the title bar is 36px carrying the **full path** in mono — not the basename — and three escapes: *Reveal in Finder*, *Open in editor*, *Close*
**And** `Esc` closes the window.

**Given** project markdown is model-authored and therefore untrusted
**When** it is rendered
**Then** it passes through `markdown-it` with HTML disabled and is sanitized with DOMPurify before insertion
**And** a fixture containing raw HTML, an embedded `<style>`, a `<script>` and an image-by-markup renders none of them.

**Given** the window
**Then** it carries no refresh control, no edit affordance and no save.

**Given** the reading surface
**Then** rendered markdown is constrained to 70ch at 13.5/1.72 in `ink-md`, inside a `min(880px,92vw) × min(760px,80vh)` window at 8px radius over a `scrim` at z-40 with the window at z-50.

**Given** focus management
**When** the window opens, Then focus lands on its document region rather than on *Close*
**And when** `Esc` closes it, Then focus returns to the rail row that opened it.

### Story 1.13: The planning contract says what actually governs the build

As the next person to read these planning artifacts,
I want SPEC.md and its companions to state the decisions that really govern the build,
So that nobody implements a rule that has already been superseded.

**Implements:** *(documentation — reconciles the planning contract with the decisions that govern the build)*

**Acceptance Criteria:**

**Given** the Architecture Spine's *Spec Amendments Required* table
**When** the amendments are applied
**Then** all eight are reflected in `SPEC.md` and its companions: the runtime unit is a persona session rather than a subprocess per skill; a menu entry carries exactly one of `skill` or `prompt`; the authoritative roster is `_bmad/config.toml` `[agents.*]`; effective configuration comes from BMad's resolvers rather than raw `customize.toml`; zero configuration is not zero prerequisites; CAP-9's disagreement structure is not met in v1; personas may run concurrently; and a non-active persona's card collapses to a live one-line state.

**Given** three external formats were specified from memory and found wrong
**When** the companions are corrected
**Then** `execution-model.md` states the memlog's open kind vocabulary and its lack of per-entry timestamps; `bmad-install-contract.md` states the sprint status file's six-value vocabulary and flat-map shape in place of its three-way reading; and `ui-surfaces.md` drops the `§N of M` denominator from its rail-row states.

**Given** the two UX supersessions of architecture invariants
**Then** the party side panel is recorded as 240px in place of AD-14's 288px, and the portrait legibility floor as 32px in place of AD-16's 20px, each naming the decision that overrode it.

**Given** every amendment
**Then** each edit cites the source that overrides it
**And** no amendment changes any capability's intent.

### Story 1.14: Nothing the product promised not to do

As someone who chose this product for its restraint,
I want the things it deliberately refuses to do verified absent,
So that the negative surface holds, since nothing about it can be demonstrated by using the product.

**Implements:** UX-DR31, UX-DR38 (Epic 1 surfaces) · NFR19, NFR25, NFR26

**Acceptance Criteria:**

**Given** the shell as built in this epic
**Then** no command palette, launcher, global skills list or `⌘K` surface is reachable by any means, including from the keyboard.

**Given** any surface in this epic
**Then** no badge, unread count or quest marker renders anywhere
**And** no highlighting, sorting, badging or recommending of a next move appears on a tile, a rail row or the topbar.

**Given** any empty or pending state
**Then** no spinner or skeleton renders, and no sentence stands in for one.

**Given** the document window
**Then** it carries no refresh control, no edit affordance and no save.

**Given** the whole product
**Then** it is silent — no audio is played at any point.

**Given** the mockup's legend footer is prototype furniture
**Then** it does not ship.

**Given** `prefers-reduced-motion: reduce`
**Then** every animation and transition is disabled globally
**And** every fact previously carried by motion remains legible — verified surface by surface across this epic.

**Given** the locked text ramp
**Then** no `faint`-tier or lower string is the sole carrier of a fact; each restates something legible at `dim` or above, or is a label whose absence costs nothing.

**Given** the two copy strings cut as factually stale
**Then** neither the rail footer's `customize.toml` provenance sentence nor the composer hint's `.claude/skills/…/customize.toml` line appears anywhere, and no configuration file path appears in any user-facing copy.

---

## Epic 2: Talk to a persona — a conversation that holds

Hold a real conversation with any installed persona in their own voice, hand off to another persona mid-conversation without a restart, type during a long turn without being blocked, and find the transcript intact after closing and reopening the app.

Story 2.1 is started first and runs alongside stories 2.2 through 2.4: it costs elapsed time rather than development time, and its completion is critical path for Epic 3.

### Story 2.1: A recorded corpus to build against

As a developer on the harness,
I want real `stream-json` from real runs captured as fixtures,
So that the interpreters can be built and exercised in seconds instead of by waiting out a twelve-minute run each time.

**Implements:** NFR6

**Acceptance Criteria:**

**Given** this story needs no harness code — only `claude` with the load-bearing flags and its stdout captured
**When** Epic 2 begins
**Then** recording starts immediately and proceeds alongside stories 2.2 through 2.4, so its elapsed time overlaps development rather than following it.

*Amended after close (Story 1.1 outcome, `_bmad/spikes/spike-stop-semantics.md`, 2026-09-25; recorded by the pre-Epic 3 reconciliation, `ARCHITECTURE-SPINE.md` AD-18).* The branches above were framed as a property of `SIGINT`. Measured: `SIGINT` is Branch B (4 of 4: a `result` row about 16ms after the signal, then exit `rc=0` at 217-390ms, no next turn possible). An in-band `control_request` with `subtype: "interrupt"` on the session's stdin is Branch A (4 of 4: `result` in 3-6ms, process alive, next turn answered in persona). So `run.stop` uses the in-band interrupt, FR84 ships a plain `stop`, and FR90 stands as written for stops. `SIGINT` is reserved for ending a session. The ~250ms figure is corrected to under 400ms and no longer bears on stop. The criteria above are left as written; this note records which one fired.

**Given** the four scenarios the architecture names as the minimum corpus
**Then** `fixtures/runs/` contains a Fast-path single large write, a Coaching-path batched write, a `SIGINT` sent mid-write, and a failure inside the reviewer gate.

**Given** a recorded session
**Then** the fixture stores **raw CLI `stream-json` frames**, not domain events
**And** the contract version is recorded as metadata for forensics, never as a validity constraint — so a later change to the domain contract does not invalidate the corpus.

**Given** the Fast-path recording
**Then** it exhibits the shape the design depends on: a single large `Write` landing minutes in, followed by revision `Edit` calls
**And** the recording is long enough to contain at least one parallel-subagent quiet window where the main thread emits nothing but `system/task_progress`.

**Given** the reviewer-gate failure is the hardest scenario to induce
**When** it cannot be produced from a natural run within a reasonable number of attempts
**Then** that is recorded as a known corpus gap with the interpreter behaviour it leaves untested, rather than substituted with a hand-written fixture presented as a recording.

**Given** the corpus
**Then** Epic 3 treats a missing or unusable corpus as a blocker rather than as missing test coverage.

*Amended after close (Story 1.1 outcome; `fixtures/runs/README.md`).* The "`SIGINT` sent mid-write" scenario is recorded as two files: `interrupt-sigint` (the session ends) and `interrupt-inband` (the session survives). The in-band recording is the corpus for the stop mechanism FR83 now names; the `SIGINT` one is the session-ending path.

**Carried in from the Epic 1 retrospective** (`_bmad/implementation-artifacts/epic-1-retro-2026-09-30.md`, action item 6). Story 1.14 replaced Electron's default application menu with a role-only one (`src/main/windows/app-menu.ts`) to guarantee the document window has no refresh. That removed zoom and reload from every window, which no requirement asked for. These two criteria are the exception to this story's "needs no harness code" premise; they restore the two capabilities.

**Given** the application menu built in `src/main/windows/app-menu.ts`
**When** the project window is focused
**Then** the menu offers zoom in, zoom out and reset zoom, and a reload of the project window, each through an Electron role so it carries its own platform label and key
**And** reloading the project window loses nothing, because main re-emits its projection on reconnect (the reload criterion in Story 2.7 is exercised through this route, not through DevTools).

**Given** the document window carries no refresh control (UX-DR38, Story 1.14)
**When** the document window is focused
**Then** the menu offers zoom in, zoom out and reset zoom, so a document can be read larger
**And** no reload entry is enabled for it, so the document window still cannot be refreshed by hand — it reloads only from the watcher
**And** the negative-surface check in Story 1.14 is amended to assert reload is absent for the document window rather than absent from the menu altogether.

### Story 2.2: One contract across the bridge

As a developer on the harness,
I want every event and command declared once with an explicit payload type and a stated cardinality,
So that two consumers can never assume different shapes, and a change in the CLI's wire format cannot ripple into components.

**Implements:** FR101, FR102 · NFR5

**Acceptance Criteria:**

**Given** `src/shared/`
**Then** it declares all fourteen events out — `session:opened`, `session:awaiting-turn`, `session:closed`, `persona:said`, `persona:state`, `run:started`, `run:note`, `doc:section-opened`, `doc:prose`, `doc:committed`, `run:finished`, `run:stopped`, `run:failed`, `rail:changed` — and all seven commands in: `session.open(agentId)`, `session.close(sessionId)`, `turn.send(sessionId, text)`, `menu.dispatch(sessionId, code)`, `run.stop(runId)`, `doc.open(path)`, `conversation.end(projectId)`.

**Given** each declaration
**Then** it carries an explicit payload type **and a stated cardinality**
**And** `src/shared/` contains types only, with no behaviour.

**Given** the renderer
**Then** it sends commands and never parses a raw `stream-json` frame; main folds raw frames into domain events
**And** no event exists that only the renderer emits.

**Given** the routing rules
**When** frames are folded
**Then** main-thread `text_delta` outside a tool call becomes `persona:said`; `input_json_delta` on a document write becomes `doc:prose`; writes to `.memlog.md` become `run:note` and **never** `doc:prose`, so memlog text cannot enter the document buffer or its section parser; and anything carrying `parent_tool_use_id` is treated as subagent activity.

**Given** identity
**Then** `sessionId` keys everything session-scoped and `runId` everything run-scoped
**And** `agentId` says which agent a session activated and **may be absent**, because a party session is owned by the room.

**Given** conventions
**Then** events are named `noun:verb-past`, paths in every event are project-relative POSIX, and times are epoch milliseconds with formatting left to the renderer.

**Given** synthetic frames covering each routing rule
**When** the fold is tested
**Then** every rule is verified without requiring a live session or a recorded run.

### Story 2.3: The turn and the composer

As someone reading and writing in this window all day,
I want the conversation's two most-repeated elements built once and built properly,
So that the surface I look at more than any other is not the one nobody specified.

**Implements:** UX-DR25 · NFR20

**Acceptance Criteria:**

**Given** a persona turn
**Then** it renders in a `card`-radius container carrying a 32px portrait, the name at `name`, the role and a timestamp, with the persona's words in the sans register at `body-ui`
**And** entries appear in the thread in time order.

**Given** a user turn
**Then** it renders in the same container with the `accent-wash` ground and an `inset 2px 0 0 accent-edge` left rule, carrying the user's 32px initials avatar.

**Given** either turn
**Then** the harness never styles, frames, prefixes, summarises or classifies its content
**And** only main-thread `text_delta` may render as a persona turn.

**Given** the composer
**Then** it renders on a `panel` ground with a 1px `line` border at `card` radius, its border shifting on focus-within, with the specified placeholder colour, a textarea autogrowing between 20px and 120px, a send button carrying its own ground, border, glyph and hover state, and hint lines below at `label` in `meta`.

**Given** the composer
**Then** it is **never** disabled, in any state, for any reason.

**Given** the composer has focus
**When** `Enter` is pressed, Then the message sends
**And when** `Shift+Enter` is pressed, Then a newline is inserted
**And** `⌘↵` does not send and appears in no glyph inventory anywhere in the product.

**Given** keyboard reach
**Then** the composer field and the send button are each tab stops taking the shared focus treatment.

**Given** layout
**Then** the thread and the composer inner are constrained to 940px, and the chat header's second line to 72ch.

**Given** the conversation turn is named nowhere in the UX contract's component list — it appears once in DESIGN.md, as an entry in the radius table
**Then** this story's specification is its contract
**And** DESIGN.md is updated to carry the conversation turn as a named component, alongside the spec amendments applied in Epic 1.

### Story 2.4: Open a session and hear back

As someone who wants to work with a persona rather than a prompt box,
I want to open a conversation with any installed agent and have them answer in their own voice,
So that the room contains people rather than a chat surface with portraits attached.

**Implements:** FR20, FR21, FR95, FR96 · NFR24

**Acceptance Criteria:**

**Given** a persona tile is activated
**When** `session.open(agentId)` runs
**Then** a long-lived subprocess is spawned as `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`
**And** `/bmad-agent-<x>` is sent as the **first turn on stdin**, not as a positional prompt.

**Given** the three load-bearing flags
**Then** `--include-partial-messages`, `--setting-sources project,local` and `--input-format stream-json` are all present
**And** a test asserts each is passed, since dropping any one silently removes a capability rather than failing loudly.

**Given** `--setting-sources project,local` excludes the `user` source
**When** a session resolves skills
**Then** it sees the target project's `.claude/skills/` and none of the harness operator's user-level configuration.

**Given** `--forward-subagent-text` is deliberately not passed
**Then** subagent text never reaches the stream in the first place, and the routing rule holds by default as well as by rule.

**Given** a chat turn is sent
**When** the persona replies
**Then** only main-thread `text_delta` renders as a persona turn, in the sans register, with portrait, name and title

**And** the harness never authors, prefixes, frames, summarises or classifies any part of it.

**Given** `identity` and `communication_style`
**Then** neither is injected by the harness — the session activates the agent's own skill, which loads them itself
**And** this is verified by confirming the persona's voice differs between two agents given identical prompts.

**Given** one session per active persona
**Then** a session is not opened per run, and the same session serves every subsequent turn.

### Story 2.5: Type while they work

As someone who thinks of something mid-turn,
I want to type it immediately and see it land,
So that a long turn never makes the composer feel broken.

**Implements:** FR97, FR98, FR99 · UX-DR30

**Acceptance Criteria:**

**Given** turns within a session are strictly serialised
**Then** at most one turn — chat or run — is in flight at a time, so a `result` row always belongs to the turn the harness is waiting on
**And** different sessions run concurrently without interfering.

**Given** a turn is in flight
**Then** the composer is **never** disabled.

**Given** a message is typed while a turn is in flight
**When** the user sends it
**Then** it appears in the transcript **in the same frame**, in the user-turn treatment, dimmed and marked `queued · sends when <Persona> finishes`.

**Given** a queued message
**Then** it is cancellable, because it is the user's own unsent message rather than arbitration of anything on disk.

**Given** `session:awaiting-turn` arrives
**When** the queued message sends
**Then** the dim lifts and the marker is removed **in place** — the entry does not move, re-render, or reappear lower in the thread
**And** focus stays in the composer throughout.

**Given** the honesty test this treatment exists to satisfy
**Then** a send always produces a visible transcript entry in the same frame; an entry that appears only once the turn ends is a defect.

*Amended after close (Epic 2 retrospective F1; `fixtures/runs/README.md`, "A session takes turns nobody sent"; `ARCHITECTURE-SPINE.md` AD-11 as corrected).* The first criterion's clause "so a `result` row always belongs to the turn the harness is waiting on" is superseded. The harness serialises the turns it sends, but a session also takes turns nobody sent, so a main-thread `result` row ends *a* turn and not necessarily the one the harness sent (`fast-path-opus.jsonl` holds 14 main-thread `result` rows against 3 sends). The criterion now reads:

**Given** turns within a session are strictly serialised by the harness
**Then** at most one turn the harness sent — chat or run — is in flight at a time, and the next is sent only when that turn is over
**And** a `result` row for a turn nobody sent neither ends the turn the harness sent, nor frees the session for a queued message, nor sets the persona idle while the sent turn is still in flight
**And** different sessions run concurrently without interfering.

The same premise is removed from FR98, AD-11, AD-18 and FR87.

### Story 2.6: Every indicator means something

As someone reading the room at a glance,
I want each persona's state to reflect what is actually happening,
So that nothing on screen looks alive without being alive.

**Implements:** FR103, FR104 · UX-DR35 · NFR17, NFR18

**Acceptance Criteria:**

**Given** persona state is a projection rather than a UI flag
**Then** each of the five states has exactly one source: `idle` — no session or nothing running; `work` — any turn in flight, chat or run; `live` — a long-running attached process the session started; `note` — the watcher saw a change to a file this persona owns; `error` — this persona's last run failed or was stopped.

**Given** a run enters a quiet subagent phase
**Then** `work` persists throughout, because the work is genuinely still running.

**Given** the `live` state
**Then** it does **not** disable the persona's skill buttons, unlike a turn in flight.

**Given** a persona tile
**Then** it aggregates every session carrying its `agentId`, so one tile may stand for more than one session.

**Given** any indicator
**Then** it is driven by real system state, no state exists for decoration, and every dot is paired with a text state string in the same row.

**Given** `prefers-reduced-motion: reduce`
**Then** the `work` pulse is disabled and liveness is carried instead by the amber fill — unique to `work` among the five states — and by an elapsed counter that keeps ticking at one second or better, which is changing data rather than animation.

### Story 2.7: The conversation is still there tomorrow

As someone who closes their laptop mid-thought,
I want the conversation to survive a window reload and an application restart,
So that the transcript is a record rather than a session artifact.

**Implements:** FR16, FR100 · NFR2, NFR3

**Acceptance Criteria:**

**Given** durable state
**Then** the conversation transcript, session state and install model live in Electron main and are persisted per project under `userData`, keyed by project path
**And** no harness byte is ever written inside the project root.

**Given** the renderer is a pure projection
**When** the window reloads
**Then** nothing is lost — **including a turn in flight**, because main re-emits its projection on reconnect rather than the renderer reconstructing it from memory.

**Given** sessions are not held across application restarts
**When** the app is quit and relaunched
**Then** the transcript is present, every persona reads `idle`, every card renders in its dead terminal state with **no elapsed time ticking and no stop control**, and nothing is offered to resume.

**Given** a session is reclaimed
**Then** it happens when the persona is closed or the session ended, and never silently.

*Amended after close (Epic 2 retrospective F18; `spec-2-7` Design Notes, FR100, NFR2; `ARCHITECTURE-SPINE.md` AD-7 as corrected).* The first criterion is superseded. Only the transcript is persisted; session state and the install model live in main and are not written. The criterion now reads:

**Given** durable state
**Then** the conversation transcript lives in Electron main and is persisted per project under `userData`, keyed by project path
**And** session state and the install model live in main but are not persisted — sessions are not held across restarts (FR100) and the install model is re-derived from disk on each launch (NFR2)
**And** no harness byte is ever written inside the project root.

The relaunch criterion's "dead terminal state ... no stop control" clause held vacuously, since no card exists before Epic 3. It is carried to Story 3.7, where it can fail. The reload criterion's "nothing is lost" is not amended here; it awaits the ruling on who owns the queue (F5).

### Story 2.8: End a conversation deliberately

As someone starting fresh on a project,
I want one explicit control that clears a persisted conversation,
So that ending a conversation is something I choose rather than something that happens to me.

**Implements:** FR15

**Acceptance Criteria:**

**Given** the end-session control
**When** it is activated
**Then** it dispatches `conversation.end(projectId)` and is **project-scoped**.

**Given** a persisted conversation
**Then** this control is the **only** way to clear it — nothing else in the product removes a transcript.

**Given** the product's negative surface
**Then** the control is presented as a lifecycle action and never as a suggestion about what to do next, and it carries no highlighting, badging or recommendation.

### Story 2.9: Hand the work to the next persona

As someone moving through the pipeline,
I want one conversation to carry across personas as the work moves,
So that planning and building happen in one window without a restart or a re-briefing.

**Implements:** FR60, FR61, FR62, FR63 · UX-DR29, UX-DR32

**Acceptance Criteria:**

**Given** a conversation with one persona
**When** another persona's tile is activated
**Then** that persona's session opens, the skill row rebuilds, and the conversation continues in the same unbroken transcript
**And** no part of the handoff presents as a restart, a new thread, or a cleared history.

**Given** focus management
**When** a persona is switched
**Then** focus **stays on the activated tile**, now carrying `aria-current`, because the skill row is rebuilt and must not steal focus.

**Given** `@<name>` typed in the composer in the 1:1 view
**Then** it hands off to that persona — the product's only text-driven navigation and its sole keyboard-fast path to a handoff
**And** it addresses a **persona** and never names or invokes a skill, since a composer that parsed skill names would be the launcher the product rejects.

**Given** a handoff occurs
**Then** a sysline lands in the transcript reading `handed off · <from> → <to> · picking up from <files>`, naming the artifacts the previous persona wrote during this conversation, in write order
**And** it never claims that context continues, which would be false — a handoff starts a new session and continuity is carried by the artifacts on disk.

**Given** any sysline
**Then** it renders in the harness's own mono register, centred with a rule filling the space either side
**And** it is never styled as, or attributed to, a persona.

*Amended after close (Epic 2 retrospective F6; `spec-2-9` Intent Contract).* The fourth criterion ("Given a handoff occurs / Then a sysline lands ...") says when a sysline lands without saying when it does not, who is "from", or what "the artifacts the previous persona wrote" can truthfully mean. It is superseded by:

**Given** the user moves from one persona to another in a conversation that already has turns
**When** the tile is activated, or `@<name>` resolves to a persona other than the current one
**Then** one sysline lands reading `handed off · <from> → <to> · picking up from <files>`
**And** `<from>` and `<to>` are fixed by the order of the user's actions, so two quick activations are recorded in click order whichever session finishes opening first.

**Given** the sysline's file list
**Then** it names the project-relative paths the previous persona wrote during this conversation, in write order, each once, and names a path only after the write succeeded
**And** it names only writes the harness can see as a `Write` or `Edit` call, so files written through a shell command (a heredoc, `memlog.py`) are not named, and that limit is stated rather than hidden
**And** with no visible writes it reads `handed off · <from> → <to>` with no file clause.

**Given** the transcript is empty, or the current tile is re-activated, or the open fails, or `<from>` has not replied since it was last opened
**Then** no sysline is written, because nothing was handed off (browsing A to B to A writes one sysline at most, and none when B said nothing).

**Given** the window has reloaded or the app has relaunched
**Then** the first switch writes no sysline, because main does not hold who was last opened across either.

**And** every sysline never claims that context continues, which would be false — a handoff starts a new session and continuity is carried by the artifacts on disk.

### Story 2.10: When a persona stops to ask

As someone whose decision a persona is waiting on,
I want the question presented as choices I can act on without leaving the conversation,
So that a genuine fork in the work reads as a decision rather than as an interruption.

**Implements:** FR105 · UX-DR22

**Acceptance Criteria:**

**Given** a persona's turn raises a decision
**Then** the block renders **inside that persona's own turn**, holding a title and its options
**And** it is absent entirely unless the persona raised one.

**Given** an option
**Then** it is its own control and its own tab stop, activated by click or by `Enter`/`Space` when focused.

**Given** an option is activated
**When** the choice is made
**Then** that option is sent as the **user's** turn, in the user's name, and the run resumes from the persona's reply
**And** the whole block is then removed — there is no chosen state, no greyed-out losers and no record of the block beyond the two turns either side of it.

**Given** the harness authors nothing here
**Then** it never writes the options, never reorders them, and never marks one recommended
**And** where an option carries the persona's stated lean, that lean is part of that option's own words with no badge, highlight, sort order or default selection.

### Story 2.11: A session outlives the install changing under it

As someone mid-conversation when the project's BMad install changes,
I want my running session to keep working,
So that editing the install never silently kills work in progress.

**Implements:** FR6

**Acceptance Criteria:**

**Given** configuration files change on disk
**When** re-resolution runs
**Then** it updates the roster and the menus and **never touches a live session**.

**Given** an agent vanishes from the install while its session is running
**Then** that session keeps its transcript, its document card, and **working stop and close controls** until the user closes it
**And** no tile exists for it, and nothing is silently closed.

**Given** an orphaned session
**Then** its close control is reachable from the keyboard and carries the shared focus treatment.

*Amended after close (Epic 2 retrospective F20; `spec-2-11` deferral).* The second criterion's "document card" and "working stop ... controls" could not be built or verified in this epic, because a card is born by `run:started` and a stop is `run.stop(runId)`, both Epic 3. What this story delivers and verifies is the transcript, the absence of a tile, and the working `close session` control. The card and stop clauses, and the live-run half of "never touches a live session", are carried to Story 3.7 and FR6's coverage row says so. The criteria above are left as written.

### Story 2.12: Confirm continuity actually holds

As someone betting the product's differentiator on one continuous session,
I want to know whether a conversation continuous in transcript and artifacts — but not in process — satisfies the claim,
So that the build commits to it knowingly rather than discovering the gap late.

**Implements:** *(validation — confirms whether CAP-8's continuity holds in substance)*

**Acceptance Criteria:**

**Given** a conversation that runs one persona through a planning artifact and then hands to another
**When** the receiving persona is asked to pick up the work
**Then** it is observed whether it can do so from the artifacts on disk alone, with no context transplanted.

**Given** the observation
**Then** the finding is recorded against the capability's "no handoff presents as a restart" claim, stating plainly whether continuity holds in substance or only in appearance.

**Given** continuity is found not to hold in substance
**Then** the gap is recorded with what would close it, rather than the claim being quietly weakened.

### Story 2.13: Nothing this epic promised not to do

As someone who chose this product for its restraint,
I want the conversational surface's prohibitions verified absent,
So that the negative surface holds where it is easiest to erode.

**Implements:** UX-DR38 (Epic 2 surfaces)

**Acceptance Criteria:**

**Given** the composer
**Then** it parses no skill names and offers no completion over them, and `@<name>` addresses personas only.

**Given** a persona turn
**Then** no tooltip, preview, tag or chrome derived from a resolved skill name renders anywhere.

**Given** a persona who is asked something outside their speciality
**Then** no refusal-with-handoff is offered — the `@` address syntax ships, the persona volunteering a handoff does not.

**Given** any state in this epic
**Then** no spinner or skeleton renders, and no sentence stands in for one — including while a session is opening.

**Given** the whole epic
**Then** no sound is played and no Dock badge is set at any point.

**Given** the decision-option block
**Then** no option carries a recommended style, a default selection or a sort order, and the block leaves no residue once answered.

---

## Epic 3: Run a skill — watch it write, stop it, understand however it ends

Press a button belonging to whoever you are talking to and watch the document being authored: prose streaming in, the section being written now, the sections still to come, and the run's own reasoning through the multi-minute silences — never a spinner. Halt it at any moment with the cost stated on the control before it is pressed. Every way a run can end is legible without reading logs.

Story 3.1 is a deliberately thin vertical slice of the product's central beat. It lands first because this is the first point in the entire build at which the thesis is testable; depth follows once the beat is proven.

### Story 3.1: Press a button and watch a document write itself

As someone who has only ever watched a progress indicator,
I want to press a skill button and see the document being authored as it happens,
So that the product's central claim can be judged end to end before anything else is built on it.

**Implements:** FR23, FR24, FR25, FR31, FR35, FR38, FR47 · UX-DR24 · NFR9, NFR10

**Acceptance Criteria:**

**Given** the current persona's resolved menu
**Then** a skill button row renders inline in the conversation above the composer, labelled "<Persona> can …", showing that persona's entries with the `description` as label and a leading chip carrying the `code`.

**Given** a skill button is activated
**When** it dispatches
**Then** it sends `menu.dispatch(sessionId, code)` and nothing else — the button knows nothing about what it invokes
**And** main resolves the `code` against the currently resolved configuration and decides `skill` versus `prompt`, sending `/<skill-name>` or the prompt text verbatim as a turn.

**Given** `run:started`
**Then** a run-scoped document card is born inline in the conversation in time order, and dies with the run's terminal event
**And** a plain chat turn raises no card.

**Given** the card is born before any prose exists — in a Fast-path run the first write lands roughly eight and a half minutes in
**Then** the card body mounts the run-note feed built in Epic 1 from the moment the card appears, fed live from `run:note`
**And** at no point in this slice does the card render an empty body, a spinner, or a sentence standing in for one — the rule the slice exists to prove is not suspended while the slice is thin.

**Given** the run writes a document
**When** `input_json_delta` arrives on the `Write` tool call
**Then** the prose renders in the card body as it arrives, decoded from the stream — **never** by re-reading the file from disk.

**Given** one observed write decomposed into 5,795 deltas carrying 69,031 characters
**Then** main coalesces deltas before emitting and the card commits accumulated text to one node per animation frame
**And** no React state update is driven by an individual delta, verified by replaying a corpus fixture at full rate without dropping frames.

**Given** `run:finished`
**Then** the card head reads `saved · just now · N sections`, the persona's dot moves `work` → `live`, and the caret is removed rather than faded.

**Given** the slice is complete
**When** the user runs it against a real skill end to end
**Then** a judgement is recorded on whether the beat lands, before stories 3.2 onward proceed.

### Story 3.12: A card follows one document

*Sequencing: lands before Story 3.2 (added 2026-10-03, `sprint-change-proposal-2026-10-03-beat-judgement.md`).*

As someone watching a run that writes several files,
I want the card to follow one document from first word to saved,
So that what I am watching is the document and not whichever file was touched last.

**Implements:** FR32, FR35, FR37, FR47 · UX-DR19

**Acceptance Criteria:**

**Given** a run in which `Write` calls to more than one path stream
**Then** the card holds a document buffer per path and shows exactly one of them, its subject, in the head path and the body
**And** the subject is the file with the most characters written by a `Write` in this run so far (ties to the earlier), changing only when another file's `Write` passes it.

**Given** other files the run writes
**Then** they are named in the foot as written files and never take over the body or the head path.

**Given** a revision `Edit` of the subject
**Then** its buffer is patched by replacing `old_string` with `new_string`, and the body ends the run as the whole document, not as the last edit
**And** an `Edit` whose `old_string` is absent leaves the buffer unchanged, and an `Edit` of another path does not touch the body.

**Given** `run:finished`
**Then** the head reads `saved · just now · N sections` with N the sections of the subject document.

**Given** a multi-file run recorded with `scripts/record-run.mjs` (a `bmad-prd` run that writes an addendum, a pre-review copy and the PRD, and revises by `Edit`)
**When** it is replayed through the card
**Then** the subject is the PRD, the final body is the PRD's text, and N equals the PRD's section count.

### Story 3.13: A finished run leaves its persona live

*Sequencing: lands before Story 3.2 (added 2026-10-03).*

As someone whose persona has just finished a run,
I want its dot to read `live`,
So that finishing reads as finishing and not as something being changed behind my back.

**Implements:** FR47, FR103

**Acceptance Criteria:**

**Given** a persona's run in flight, or within the watcher's settle window after its terminal event
**When** the rail sees a change to a file that persona owns
**Then** no `note` is raised
**And** a change outside that window, or to a file the persona does not own, still raises one.

**Given** a run that writes files through `Write`, `Edit` and Bash
**Then** the persona's dot reads `work` to `live` after the run in each case, never `note`, verified against a live run as well as the corpus.

**Given** the next turn or run
**Then** `live` clears as it does today.

### Story 3.14: The running card stays in view

*Sequencing: lands before Story 3.2 (added 2026-10-03).*

As someone watching a run while the persona talks,
I want the running card to stay where I can see it,
So that the document being written is not scrolled away by the conversation about it.

**Implements:** FR31 · UX-DR19

**Acceptance Criteria:**

**Given** the viewed persona has a run in flight
**Then** its card is pinned at the top of the chat column, head and body, with the persona's turns scrolling beneath it
**And** the body keeps its existing height cap.

**Given** the run's terminal event
**Then** the card returns to its time-ordered place in the thread in a single frame, with no animation, and the thread does not jump.

**Given** a card of a persona that is not the one viewed
**Then** it is not pinned (it is the collapsed line of Story 3.5).

**Given** keyboard and assistive-technology use
**Then** the pinned card is first in the chat column's tab order, takes no focus when it pins or unpins, is not a live region, and under reduced motion changes nothing visible but position.

**Given** the negative surface
**Then** no "jump to card" control, badge or toast exists.

### Story 3.2: The whole menu, and only ever the menu

As someone working with a persona,
I want every one of their skills reachable as a button belonging to them,
So that I never leave the conversation to find a capability, and never meet a button that does nothing.

**Implements:** FR26, FR27, FR28, FR29, FR30

**Acceptance Criteria:**

**Given** a menu entry carrying neither `skill` nor `prompt`
**Then** it surfaces as a discovery error in the harness's own register, naming the entry's `code` and what is missing
**And** it is never a silent no-op and never spoken by a persona.

**Given** any menu entry
**Then** no tooltip or preview derived from a resolved skill name renders, because it would go stale the instant the install is re-resolved
**And** the user is never shown whether an entry is `skill` or `prompt`.

**Given** any turn in flight in a session
**Then** that session's skill buttons are disabled
**And** the `live` state does not disable them, and the composer is never disabled.

**Given** a persona with more entries than the row displays
**When** `+N more` is activated
**Then** the row **expands in place** to show the remaining entries as ordinary skill buttons, and **no transcript entry is created**
**And** the control toggles back reading `fewer`.

**Given** the observed extremes of real menus — one entry for the UX Designer, ten for the Business Analyst
**Then** the row renders correctly at both.

**Given** the whole product
**Then** no separate skills list, launcher or command palette exists anywhere, and skills are reachable only as the current persona's buttons.

### Story 3.3: Progress you can read against a plan

As someone watching a long run,
I want to see which section is being written and which are still to come,
So that progress is legible against a known plan rather than an opaque percentage.

**Implements:** FR32, FR34, FR36, FR37, FR44 · UX-DR19

**Acceptance Criteria:**

**Given** the card's head
**Then** it carries the state dot, the file path in mono, the current section, the elapsed run time and the stop control.

**Given** the card's foot
**Then** it lists the not-yet-written sections **by name**, with counts
**And** there is no denominator and no progress bar anywhere in the card — the head reads `writing · §N <Name>`, never `§N of M`.

**Given** the section plan is predicted
**When** it is read from the skill's own template under its `assets/` directory
**Then** the parser takes only document sections and not template scaffolding — verified against `.claude/skills/bmad-prd/assets/prd-template.md`, where three of the fourteen h1/h2 headings (`# PRD Template`, `## Essential Spine`, `## Adapt-In Menu`) are scaffolding and the real spine is the ten numbered `## 0.`–`## 9.` headings
**And** markdown emphasis is stripped from heading text, so the head never renders `writing · §Essential Spine *(almost always present)*`.

**Given** the run's `.memlog.md` concern-scan entry names which Adapt-In sections were pulled
**Then** it refines the plan, landing early enough to be usable before prose begins.

**Given** observed headings disagree with the predicted plan
**Then** the observed headings win and the plan grows
**And** a section the user has already seen is never renumbered.

**Given** a revision `Edit` rather than a `Write`
**Then** the head reads `revising · §N <Name>` and the section counter does not advance
**And** the buffer patch itself is Story 3.12's, verified there (amended 2026-10-03 by `sprint-change-proposal-2026-10-03-beat-judgement.md`).

**Given** `doc:committed` naming one or more sections
**Then** every section it names leaves the foot list **in a single frame** — no stagger, no sequential reveal, no per-section tick-through
**And** a fifteen-section commit moves fifteen names at once, because the tool call was atomic.

### Story 3.4: The card is never empty

As someone watching a run that has gone quiet for eight minutes,
I want to see what the run is actually deciding,
So that a long silence reads as work rather than as a hang.

**Implements:** FR39, FR42, FR43, FR45, FR46 · UX-DR33

**Acceptance Criteria:**

**Given** the card body has two modes
**When** document prose is not streaming
**Then** the body renders the run-note feed built in story 1.5, fed live from `run:note`
**And** the card never has an empty body in any state.

**Given** no spinner is permitted at any point
**Then** no placeholder sentence stands in for one either — a body reading "nothing written yet, §2 opens when research returns" is a spinner wearing a sentence and fails this story.

**Given** the head during dead air
**Then** it keeps the file path, the elapsed time and a working stop control
**And** a phase word such as `researching` renders **only when a feed actually states it**, because `system/task_progress` is not emitted on every run.

**Given** the foot during dead air
**Then** it reads `0 words on disk · <phase> · autosave on` plus the named next sections, and the `0 words on disk` form is not softened.

**Given** prose resumes after a quiet window
**Then** the run notes accrued during that window remain above it in the same scroll container, in time order
**And** the typeface register — document prose in mono, run notes in sans — is the only thing distinguishing them, with no container, rule, label or background added.

**Given** subagent activity carrying `parent_tool_use_id`
**Then** it never renders as the persona's own voice
**And** where `system/task_progress` is emitted it may render on the card, but nothing depends on it, since it may be permanently absent on a given run.

**Given** the Fast-path corpus fixture, in which a whole document lands as one write roughly eight and a half minutes in
**When** it is replayed
**Then** the card shows content for the entire quiet window and at no point renders a spinner, a skeleton or an empty body.

### Story 3.5: The run you are not looking at

As someone who has switched to another persona or another application,
I want a run I am not watching to stay legible in one line,
So that stepping away never costs me the state of the work.

**Implements:** FR33 · UX-DR34

**Acceptance Criteria:**

**Given** a card belonging to a persona the user is not currently viewing
**Then** it collapses to a single line carrying exactly four fields: the persona, **the last run note's reason**, the elapsed time, and a working stop control.

**Given** the collapsed form
**Then** the last reason **replaces** the section name rather than sitting beside it, because the section is already carried by the rail row
**And** the line is never a spinner — it is the same state, smaller.

**Given** no run note has yet arrived
**Then** the reason field falls back to the section name.

**Given** a reason longer than the line
**Then** it truncates to one line, with the full entry available in the expanded card.

**Given** a collapsed card
**When** the persona is switched to it, or the card is clicked, or it is focused and activated with `Enter`/`Space`
**Then** it expands to the full form
**And** focus lands on the card container, **never** on the stop control, which interrupts a running turn when activated.

### Story 3.6: The rail learns who is writing

As someone watching files change,
I want the rail to say which persona is writing and which section is in flight,
So that a changing file has an author without the rail ever claiming something disk does not say.

**Implements:** *(populates the run-derived annotation half of FR49–FR51, built empty-capable in story 1.11)*

**Acceptance Criteria:**

**Given** the stub annotation source built in story 1.11
**When** the real stream replaces it
**Then** no other part of the rail changes, because the row was built to accept an annotation from the start.

**Given** a run in flight
**Then** the stream annotates that file's row with the owning persona and the section in flight
**And** it may never create a row, remove one, or assert what the file contains.

**Given** a row's disk state
**Then** it continues to come from the watcher alone, and a row reaches `saved` only because the watcher saw the write land — never because the stream announced it.

**Given** a file being written by something the harness is not running — an editor, a terminal `claude`
**Then** the row still shows `changing` from watcher activity and a settle debounce, with no annotation at all
**And** the row reads as complete.

**Given** the annotation
**Then** it carries no denominator, matching the card head.

### Story 3.7: Stop a run, knowing what it costs

As someone who has seen enough,
I want to halt a run in progress and know the cost before I commit to it,
So that stopping is a decision rather than a gamble.

**Implements:** FR83, FR84, FR85, FR86 · FR6 (card and stop clauses, carried from Story 2.11) · FR100 (dead-card clause, carried from Story 2.7)

**Acceptance Criteria:**

**Given** a run in flight
**Then** a stop control is present on **both** the full card head, beside the elapsed time, and the collapsed line
**And** activating it dispatches `run.stop(runId)`, which writes one in-band interrupt request (`{"type":"control_request","request_id":"<id>","request":{"subtype":"interrupt"}}`) to that session's stdin — never `SIGINT`, which ends the session (`ARCHITECTURE-SPINE.md` AD-18, *Stop (settled, Story 1.1)*; `execution-model.md` *Stop and failure*; `_bmad/spikes/spike-stop-semantics.md`).

**Given** the branch settled by story 1.1 — the in-band interrupt halts the turn and keeps the session
**Then** the control reads `stop` with no confirmation and no cost copy, on the full card head and on the collapsed line alike, because stopping costs the turn and not the conversation
**And** the session stays open, the next turn is accepted, and the persona answers it in its own voice.

**Given** the interrupt is not acknowledged — no `control_response`, or one whose `subtype` is not `success`
**Then** the harness falls back to ending the session, and states that in the transcript in its own register, never in a persona's name
**And** that cost is surfaced to the user rather than hidden; the on-screen line is copy for `bmad-ux`.

**Given** stopping costs only the turn
**Then** no confirmation dialog is shown and no cost is printed on the control
**And** if a later change makes a stop cost more than the turn, the cost sits **on the control, before it is pressed** — never in a modal, which would be the harness arbitrating and would hide the cost until the user had already committed to looking.

**Given** the interrupt is acknowledged
**Then** the turn's `result` row arrives within milliseconds (3-6ms measured, n=4) and the card reaches its terminal state on that row, not on the `control_response`
**And** there is no "stopping…" transitional state.

**Given** a stopped run
**Then** the file on disk is left **byte-for-byte as written** — never reverted, never patched, never restored
**And** nothing is offered to restore it, because the partial file already is the last successful write.

**Given** the stop control
**Then** it is its own tab stop and carries the shared focus treatment.

**Given** a run is in flight in a session whose agent then vanishes from the install (Story 2.11's orphan)
**When** re-resolution runs
**Then** the run is untouched: it keeps streaming, its card stays in the conversation in time order, and no tile is created or restored for it
**And** the card renders in the collapsed one-line form, because an orphan can never be the current persona (the current persona is derived from the roster alone), and it expands on click like any collapsed card.

**Given** an orphaned session's card
**Then** its stop control is present, is its own tab stop, and carries the shared focus treatment
**And** activating it dispatches `run.stop(runId)` to that run's own session, found by the run and session ids and never through the roster, so a stop works for a persona the install no longer lists.

**Given** the stop is activated on an orphaned run
**Then** the turn halts exactly as it does for a rostered persona (in-band interrupt, `result` within milliseconds, no "stopping…" state), the file is left byte-for-byte as written, and the session stays open
**And** while the shell is mounted, the orphan's header and its `close session` control from Story 2.11 remain until the user closes the session — a stop never closes an orphan, and no session is closed silently.

**Given** an orphan with a run in flight
**When** the user activates `close session`
**Then** the session ends, the card reaches a terminal state directly rather than continuing to read as live, and the file is left as written
**And** the transcript, including the card, stays.

**Given** an agent returns to the install while its orphaned run is in flight
**Then** its tile returns, the same session and the same card carry on, and the card follows the ordinary full-or-collapsed rule again.

**Given** the roster changes while any run is in flight — an agent added, removed or edited
**Then** no run, card or stop control changes except through the orphan rules above
**And** this is the live-run half of FR5's "never touches a live session", which Epic 2 could verify only against chat turns.

**Given** the application is quit and relaunched while the transcript holds a run's card
**Then** the card renders in its dead terminal state with no elapsed time ticking and no stop control, every persona reads `idle`, and nothing is offered to resume
**And** this is the relaunch clause of Story 2.7, which could not fail while no card existed.

*Accepted limit (Sherif, 2026-10-03, sprint change proposal decision 6):* the "remain until the user closes the session" clause holds only while the shell is mounted, i.e. while at least one agent still resolves. When the last agent vanishes the shell unmounts and `close session` is unreachable.

### Story 3.8: Understand a run that ended early

As someone who came back to a run that failed,
I want to know how far it got and what broke without reading logs,
So that a failure is something I can act on rather than something I have to investigate.

**Implements:** FR87, FR88, FR89, FR90

**Acceptance Criteria:**

**Given** a turn ends
**Then** its terminal state is read from the `result` row that arrives **per turn**, not once per process, and a `result` row ends *a* turn, not necessarily the one the harness sent (`ARCHITECTURE-SPINE.md` AD-11, AD-18)
**And** `is_error: true` marks it stopped or failed with the `subtype` saying which kind (`error_during_execution`, `error_max_budget_usd`, any other error subtype), its absence marks it finished, and `stop_reason` is never tested because it is not stable across them
**And** the process exit code is never used as the signal, because a session outlives every turn in it.

**Given** a write
**Then** it counts on `tool_result`, never on `tool_use`
**And** the unit of confirmation is the **tool call**: exactly one `doc:committed` is emitted per tool call, carrying that call's id and the list of sections it committed, never fanned out per section.

**Given** a `tool_result` with `is_error: true`
**Then** none of that call's sections are committed, and the call that was rejected is named
**And** because sections only leave the foot on `doc:committed`, a rejected fifteen-section batch never appeared as committed and nothing un-renders.

**Given** a stopped or failed run
**Then** the card switches to the error state and names the section reached, taken from the last confirmed write and never from an announced one
**And** the rail row's annotation becomes `stopped` while its disk state is unchanged
**And** the persona tile goes `error` with **no error text on the tile**.

**Given** the session survives the stop or the failure
**Then** the persona picks it up in the conversation, in its own voice: what got done, what broke, and an offer to resume.

**Given** the session ended with the run — the process exited, or the stop fell back to ending the session
**Then** no persona remains to deliver that explanation, so the harness states the outcome in its own register and never fabricates a persona voice.

**Given** the corpus fixtures `interrupt-inband.jsonl` (the stop path; the session survives), `interrupt-sigint.jsonl` (the session-ending path) and a reviewer-gate failure
**When** they are replayed
**Then** each terminal path renders correctly without a live run.

### Story 3.9: Two writers, one file, no arbitration

As someone running two personas at once,
I want a collision reported rather than resolved,
So that the harness never decides something about my files that I did not ask it to.

**Implements:** FR92

**Acceptance Criteria:**

**Given** one persona is writing a file while another writer changes it
**Then** the rail row's annotation names the contention and both owners.

**Given** contention
**Then** the filesystem arbitrates and last writer wins
**And** the harness never locks, reverts, patches or restores.

**Given** the product's surface
**Then** no dialog offers to resolve, merge, choose or undo
**And** no command exists in the bridge for editing, reverting, resolving contention or navigating a pipeline — the absence is the design.

**Given** a skill that touches several artifacts at once
**Then** a collision with a concurrently running persona is reported rather than prevented.

### Story 3.10: Told once, quietly, when you are elsewhere

As someone who deliberately works in another window during a twelve-minute run,
I want to be told once when it ends,
So that completion reaches me without the product ever nagging.

**Implements:** FR93, FR94

**Acceptance Criteria:**

**Given** a terminal event — `run:finished`, `run:stopped` or `run:failed`
**When** the window is **unfocused** at that moment
**Then** exactly one native macOS notification is posted, naming the persona, the outcome, the file and the section count.

**Given** a terminal event
**When** the window is **focused**
**Then** nothing is posted, because the card and the rail already report it and a notification would be a second source of truth.

**Given** anything that is not a terminal event — a section commit, a run note, a rail change, a party turn, a queued send, a roster change
**Then** nothing is ever posted.

**Given** notification copy
**Then** it states rather than guides: `John · PRD.md · finished · 15 sections`, never "Ready for your review" and never "Next: create epics".

**Given** a notification is activated
**Then** it raises the window and scrolls the thread to that run's card
**And** it does not switch persona, open a document window, or start anything.

**Given** concurrent sessions
**Then** each terminal event produces its own notification, with no digest and no coalescing.

**Given** macOS notification permission is refused or ungranted
**Then** nothing is shown and nothing is asked a second time, and completion is still reported by the surfaces that always report it.

**Given** the whole product
**Then** no Dock badge is ever set and no sound is ever played.

### Story 3.11: Nothing this epic promised not to do

As someone who chose this product for its restraint,
I want the prohibitions most at risk in this epic verified absent,
So that the surface where a builder is most tempted to add reassurance stays honest.

**Implements:** UX-DR35, UX-DR38 (Epic 3 surfaces)

**Acceptance Criteria:**

**Given** every state of the document card across a full run — streaming, revising, quiet, stopped, finished, dead
**Then** no spinner, skeleton or progress bar renders in any of them, and no sentence stands in for one.

**Given** progress
**Then** no denominator appears on the card head, the card foot, the collapsed line or the rail annotation.

**Given** a batch commit
**Then** no stagger, sequential reveal or per-section tick-through depicts a sequence that did not occur.

**Given** streaming prose
**Then** no per-character typewriter effect is simulated, and the caret uses `steps(1)` rather than a fade.

**Given** a stopped, failed or contended run
**Then** no dialog offers to resolve, merge, revert, lock, restore or undo, and no undo exists anywhere.

**Given** a terminal event
**Then** no Dock badge is set and no sound is played.

**Given** `prefers-reduced-motion: reduce`
**Then** every animation in this epic is disabled and every fact they carried remains legible — the elapsed counter keeps ticking, the caret renders static-on rather than static-off, and every state string remains present.

### Story 3.15: The work that carries on after a stop has a card

*Sequencing: lands after Story 3.8 and before Story 3.11's audit is re-run, and before Epic 4 (added 2026-10-06 from the Epic 3 retrospective, action item 1; decision by Sherif 2026-10-06: make the resumed turn visible and controllable, no automatic second interrupt).*

As someone who pressed stop on a run,
I want any work the persona goes on to do after it to be on a card I can see and stop,
So that I never believe a run has halted while the persona is still writing.

**Implements:** FR83, FR84 · FR31 · FR35

**Evidence:** on a real `claude` 2.1.285, an in-band interrupt sent while background subagents were live stopped them, ended the turn with a failed `result`, and then the CLI ran two turns nobody sent: an empty one (`num_turns: 0`) and one in which the persona resumed the original instruction and `Write`s the document. The recorder sent nothing but the interrupt. Three of three trials interrupted after the main thread had launched its subagents resumed; one interrupted before it had did not. In the harness today the run ends `stopped`, no run starts for the resumed turn, and the write has no card, no stop control and no completion notification (`fixtures/runs/interrupt-inband-tasks-live-mid-write.jsonl` frames 336 to 1432, `README.md` row; `_bmad/implementation-artifacts/deferred-work.md`, *After a stop, the CLI can resume on its own*).

**Acceptance Criteria:**

**Given** a run that ended `stopped` because the user pressed stop, and no turn sent by the user since
**When** a main-thread message begins that nobody sent (the `resumed` signal of the turn fold)
**Then** a run starts for it: `run:started` for the same session, carrying the stopped run's `code` and the same section plan, with its own run id, so that a card is born in time order with the persona's turn in flight
**And** the empty turn the CLI runs first (`num_turns: 0`, no message of its own) starts no run.

**Given** the continuation run
**Then** it is an ordinary run in every respect of Epics 3.1 to 3.10: pinned atop the chat column while its persona is viewed, the collapsed line otherwise, one subject document, run notes, the stop control on the head and on the collapsed line, the rail annotation, no `note` raised by the persona's own writes, and exactly one silent notification when it ends and the window is unfocused
**And** it ends on the per-turn `result` row like any run: `run:finished` on success, `run:failed` on `is_error`, `run:stopped` when the user stops it.

**Given** the harness starts a run for work the user did not ask for
**Then** it says so once in its own register, in the transcript, never in a persona's voice, as a fact and not as guidance (copy for `bmad-ux`; placeholder `carried on after the stop · a new run follows it`)
**And** the persona's own turns are unchanged.

**Given** the user stops the continuation run
**Then** `run.stop` interrupts it exactly as Story 3.7 specifies, the card reaches `stopped` on the interrupted `result`, and the session stays open
**And** if the CLI then resumes again, the same rule applies once more and a further card is born; the harness never writes an interrupt the user did not ask for, and never offers, suggests or performs a resume.

**Given** a turn nobody sent in any other circumstance
**Then** no run starts for it: not on a session whose last run `finished` or `failed`, not after the user has sent a turn or dispatched a menu entry since the stop, not on a session that has never run, and not while a run is in flight (a background subagent finishing during a run is part of that run)
**And** the stopped run's `code` and plan are held only until one of those things happens, and are not persisted.

**Given** the application is quit and relaunched, or the window reloaded
**Then** a continuation card behaves as any card: re-emitted from main on reload, dead with no ticking and no stop after a relaunch, and nothing is started for a turn that has not happened.

**Given** the negative surface and the audit
**Then** the continuation card adds no control, dialog, badge, toast, sound, denominator, spinner or "resume" word, and the Story 3.11 audit (`epic-3-audit.dom.test.tsx`, `tests/negative-surface.test.ts`) covers a continuation card in each of its states, built by the folds from the recorded events and not by hand.

**Given** the evidence above
**Then** the three recordings are replayed through the real bridge and registry: `interrupt-inband-tasks-live-mid-write` yields `run:started`, `run:stopped`, `run:started` (same session and code, new run id), the document events for `notes.md` on the second run's card, and `run:finished`; `interrupt-inband-tasks-live` and `interrupt-inband-idle` yield no second run
**And** the replay in `src/main/session-stop.test.ts` that pins the resumed turns as "no run" is replaced by it.

**Boundaries:** no new event name or command; no change to the stop mechanism, `STOP_ACK_MS` or `STOP_RESULT_MS`; the harness prevents nothing and interrupts nothing on its own.

---

## Epic 4: Convene the room — party mode

Convene a room of chosen personas in one conversation you participate in, with every face permanently visible, the current speaker lit, no turn-taking gate, and the room's summary written to `_bmad/`.

This epic is small because the orchestration already exists: `bmad-party-mode` ships and works today — group conversation, user participation and joint decisions all function. What is missing is the surface. Two of the mockup's three side-panel sections are deferred for want of a data source and must not be built even as empty states.

### Story 4.1: Choose who is in the room

As someone with a question that needs more than one perspective,
I want to convene a room and decide who is in it,
So that the conversation starts with the people the question actually needs.

**Implements:** FR64, FR65

**Acceptance Criteria:**

**Given** the view switch
**When** Party Mode is selected
**Then** a cast chooser lets the user choose who is in the room, defaulting to the five core personas
**And** sessions running in the other view keep running.

**Given** the room opens
**Then** a session of the same kind as a persona session is opened with `/bmad-party-mode`
**And** it carries a `sessionId` and **no `agentId`**.

**Given** a party session has no `agentId`
**Then** it gets no persona tile
**And** any file it writes shows **the room** as owner in the rail, in a presentation distinct from any persona.

**Given** the room opens
**Then** a sysline lands in the transcript naming who opened it and who is present
**And** it renders in the harness's own register, never attributed to a persona.

### Story 4.2: Everyone stays in the room

As someone standing in a conversation between several people,
I want every face present for the whole conversation,
So that the room reads as a room rather than as a speaker queue.

**Implements:** FR66, FR68, FR70 · UX-DR26

**Acceptance Criteria:**

**Given** the chosen cast
**Then** every chosen portrait stays **permanently visible** for the life of the room, on a horizontally scrolling strip of cast cards.

**Given** presence
**Then** it is expressed by **dimming, never removal** — cast cards sit at 0.42 idle, 0.72 on hover, and 1 when speaking
**And** a persona who is not speaking is still in the room.

**Given** the current speaker
**Then** their card is lit with its border, ground, restrained glow and a 2px accent ring on the portrait, with the equaliser running in accent
**And** the equaliser is bound to who is actually speaking, animating for no other reason.

**Given** a party transcript turn
**Then** it renders portrait, name, role, timestamp and the persona's words, **and nothing else**
**And** no `disagrees` or `evidence` tag renders, and no quoted-turn reference or quote-back chrome exists — the disagreement's evidence is in the persona's own text or it is not there at all.

**Given** the room
**Then** there is **no turn-taking gate** — the user types at any point and the message interrupts the current speaker.

**Given** the harness
**Then** it never stages, ranks, classifies or amplifies disagreement, and never authors words attributed to any persona in the room.

### Story 4.3: What the room is about, on screen

As someone who joined a conversation already in progress,
I want the room's subject, origin and destination visible without scrolling,
So that the context of the conversation is never something I have to remember.

**Implements:** FR67, FR69

**Acceptance Criteria:**

**Given** the party header
**Then** it carries the topic, the participant count, a turn counter, elapsed time and *Write summary to `_bmad/`*.

**Given** the side panel
**Then** it renders the ***Room*** section **only**: the topic, who opened it and when, the context documents in scope, and the destination path `_bmad/party/<date>-<topic>.md`
**And** all four are harness-known, requiring no data source that does not exist.

**Given** *Open disagreements* and *Decisions so far*
**Then** neither renders at all — **not even as an empty state**
**And** the panel is not built with slots reserved for them.

**Given** the panel's width
**Then** it is 240px, sized to the Room section's own content
**And** the superseded 288px is not implemented.

**Given** window width at or below 1180px
**Then** the panel is hidden outright.

**Given** the party transcript
**Then** it is constrained to 900px.

### Story 4.4: Take the room away with you

As someone who has just watched five people work something out,
I want the conversation written into the project,
So that what the room concluded outlives the room.

**Implements:** FR71

**Acceptance Criteria:**

**Given** *Write summary to `_bmad/`* is activated
**Then** the summary is written to `_bmad/party/<date>-<topic>.md`.

**Given** the harness writes nothing into the project
**Then** the file reaches disk because the runtime wrote it, not because the harness did.

**Given** the file lands
**Then** a new rail row appears without user action, **owned by the room** rather than by any persona
**And** it is openable in a document window like any other artifact.

**Given** the destination path
**Then** it was already visible in the Room section before the summary was written.

### Story 4.5: The room ends, it does not pause

As someone finished with a conversation,
I want a single honest way to end it,
So that the product does not offer a state it cannot actually model.

**Implements:** FR72

**Acceptance Criteria:**

**Given** the room's lifecycle
**Then** it has **stop**, not pause
**And** no *Pause room* control exists, because pause is a lifecycle state neither the stop design nor the session model represents.

**Given** the room is stopped
**Then** the transcript remains and the session is released.

**Given** the end-session control
**Then** it remains the only way to clear a persisted conversation, and is presented as a lifecycle action rather than a suggestion.

### Story 4.6: Nothing this epic promised not to do

As someone who chose this product for its restraint,
I want party mode's deferrals verified absent rather than half-built,
So that nothing renders that could not be populated.

**Implements:** UX-DR21, UX-DR36, UX-DR38 (Epic 4 surfaces)

**Acceptance Criteria:**

**Given** the side panel
**Then** neither *Open disagreements* nor *Decisions so far* renders in any form, including as an empty state or a reserved slot.

**Given** the transcript
**Then** no `disagrees` tag, `evidence` tag, `unresolved` tag or quoted-turn reference renders.

**Given** the room
**Then** no turn gate, no speaker queue, no *Pause room* and no 288px panel exists.

**Given** any persona in the room
**Then** no words are authored, summarised, classified or attributed by the harness, and no disagreement is staged, ranked or amplified.

**Given** any state in this epic
**Then** no spinner or skeleton renders, no badge or unread count appears, no sound is played, and no next-step guidance is offered.

**Given** a persona who is not currently speaking
**Then** their face is dimmed and never removed.

### Story 4.7: The room is still the room after the window reloads

*Sequencing: added 2026-10-08 from the Epic 4 retrospective, finding F1, action item `epic-4-retro-item-49`. Lands before the room is used on real work. Independent of Story 4.8, but both change the room paths of `use-conversation.ts`: build this one first.*

As someone who reloaded the window while a room was running,
I want the room to be exactly what it was when I come back,
So that I never read a live conversation as a stopped one, or lose the means to take part in it or end it.

**Implements:** FR66, FR67, FR70, FR72 · FR69

**Evidence:** in the built app, against a stub `claude`, reloading the window with a live three-person room returned the view to 1:1. The party view then showed the earlier transcript above the chooser, with no header, cast strip, composer or *stop room*; the room's process stayed alive and kept streaming into that read-only thread. *Open the room* attached to the live session without spawning, but the renderer took the cast from the chooser's ticks: a room of three read "5 participants", elapsed time restarted from the press, the topic was gone and the destination fell back to `<topic>` (Epic 4 retrospective F1, behavior check 15). Cause: the conversation snapshot lists persona sessions only (`src/main/session-bridge.ts:540-546`), main answers a second open with the live room (`:196-197`), and `roomReady` stores the cast the window sent (`src/renderer/ui/chat/conversation-state.ts`). The gap was deferred from Story 4.1 to 4.2, from 4.3 to 4.5, and 4.5's spec has no row for it (`spec-4-1-choose-who-is-in-the-room.md`, Residual risks).

**Acceptance Criteria:**

**Given** a live room and a window reload
**When** the window reads the conversation again
**Then** the snapshot names the room: its session, its cast in the order the room was opened with, and when it opened
**And** the window comes back with the room live: header, cast strip, composer and *stop room* present, the transcript above them, as before the reload
**And** the room is still no persona's session: it has no tile and is not among the snapshot's persona `sessions`.

**Given** the reloaded room
**Then** the participant count, turn counter, elapsed time and topic in the header, and the topic, opened and writes-to rows of the Room panel, read what they read before the reload
**And** the summary destination is the same path
**And** elapsed time runs from the room's real opening, not from the reload.

**Given** a room with a turn in flight at the reload
**Then** it comes back busy, and the speaker is lit by the same rule as before the reload, from the stored entries and what main sends next.

**Given** a room that is live
**When** an open is made against it
**Then** it answers with the live room's own session and cast, and the window takes the cast from that answer, never from the chooser's ticks.

**Given** a reload with no live room — never opened, stopped by the user, or its process exited while the window was away
**Then** the party view is exactly what Story 4.5 specifies: the stopped transcript above the chooser, no header, strip, composer or stop, and no room invented
**And** a room still starting at the moment the conversation is read is not live in the snapshot; its `session:opened` event, arriving after, makes it live as it does today.

**Given** the application is quit and relaunched
**Then** no room is live after it (its process ended with the application), the transcript is above the chooser, and nothing is restored as live
**And** the room is not persisted: the snapshot is built from main's live memory, and no field, file or setting records a room across launches.

**Given** the negative surface and the audit
**Then** the reloaded room adds no control, banner, toast, sound, spinner, badge or word that speaks of the reload (no *restored*, *reconnected*, *welcome back*), and says nothing in the transcript about it
**And** the Story 4.6 audit (`epic-4-audit.dom.test.tsx`) mounts a reloaded live room, built by the fold from a snapshot and not by hand.

**Given** the evidence above
**Then** a test opens a room through the real bridge and registry, reads the conversation again into a fresh renderer state, and asserts the room live with its original cast and open time, the persona `sessions` unchanged, and the destination unchanged; dropping the room from the snapshot makes it fail
**And** the tests that pin the room's absence from the snapshot (`src/main/session-bridge.test.ts` "is not in the conversation snapshot", the `use-conversation` test that forgets the room) are replaced by it.

**Boundaries:** no new command, event, channel or preload method (the counts stay 7, 15, 22 and 17: the snapshot is the reply to the existing `conversation:get`, and it gains a field); no change to the stop mechanism or to what *End session* clears; earlier rooms' lines in the thread are Epic 4 retrospective F5 and are not changed here.

### Story 4.8: A message the room refused says so

*Sequencing: added 2026-10-08 from the Epic 4 retrospective, finding F2, action item `epic-4-retro-item-50`. Lands before the room is used on real work. Build after Story 4.7.*

As someone who typed into the room,
I want to know when the room did not take my message,
So that what is on screen as sent is what the room received.

**Implements:** FR70, FR71 · FR67

**Evidence:** a send into a room whose speaker is mid-turn is written once main has interrupted the turn; main refuses with `session/busy` when the interrupt is not acknowledged within `STOP_ACK_MS` or the turn does not end within `STOP_RESULT_MS` (`src/main/session-bridge.ts`, `interruptedRoom`). The renderer swallows that refusal (`src/renderer/ui/chat/use-conversation.ts:192-196`, `transmitToRoom`), and main records the user's turn only after a write, so the thread shows a line the room never saw, with no failure line, and it is gone after a reload. The same path carries *Write summary*, so a refused summary ask looks asked. `roomSent` also sets the topic, and so the summary filename, before delivery. Separately, *stop room* pressed while a send waits makes the send answer not-found, and the renderer shows a failure line for a refusal the stop caused, leaving the entry in the stopped transcript as if delivered (`src/main/session-bridge.ts:451-459`; Epic 4 retrospective F2, diff review findings 2 and 5). Two `use-conversation` tests pin "keeps the entry … and says nothing", so the tests agree with the defect.

**Acceptance Criteria:**

**Given** a send into the room that main refuses as busy
**Then** the user's entry does not stay on screen as if sent
**And** the thread says what happened, once, in the harness's own register and not a persona's, as a fact and not as guidance (copy for `bmad-ux`; placeholder `not sent · the room is still speaking`)
**And** the room stays busy as main's state says, because the turn goes on, and main adds nothing to the transcript record.

**Given** the refused send was *Write summary to `_bmad/`*
**Then** the same: the ask is not shown as asked, nothing implies a file is coming, and the Room panel's destination stays as it was.

**Given** the first message of a room is refused
**Then** it sets no topic: the header still reads *no topic yet* and the destination keeps `<topic>`
**And** the topic is set by the first message main delivered, never by one it refused.

**Given** a send waiting for the speaker's turn to end when *stop room* is pressed
**Then** the renderer treats it as ended by the stop and not as a failure: no failure line, and no user entry in the stopped transcript for a message the room never received
**And** the only line the stop adds is the one Story 4.5 specifies.

**Given** a send that is delivered, after an interrupt or not
**Then** nothing changes from Stories 4.2 and 4.4: the entry shows at once, the speaker is interrupted, main records the turn once written.

**Given** any other refusal of a room send (no such session, a failed write)
**Then** the failure line is as it is today
**And** a persona's busy session is unchanged (`dispatchRefusedBusy`).

**Given** a reload after a refused send
**Then** the thread and the record agree before and after: the refused line is in neither.

**Given** the negative surface and the audit
**Then** the refusal adds no spinner, badge, sound, retry control, queue, *try again* word or other next-step guidance, and the line is lower case, mono, `·`-separated, with no terminal punctuation
**And** the Story 4.6 audit mounts the refused-send state, built by the fold from the recorded events and not by hand.

**Given** the evidence above
**Then** the two `use-conversation` tests that pin the silent behavior are replaced by tests that pin the outcome above, and a bridge-level test sends through a fake process whose interrupt is never acknowledged and asserts: no transcript record, a refusal at the renderer, no entry left on screen
**And** the stop-during-send case is pinned at the renderer (no failure line after the room's `session:closed`), so the "any other refusal shows the failure" test no longer locks in a failure line for a refusal the stop caused.

**Decision to confirm before build:** whether the refused message's text returns to the composer for the user to send again (nothing is ever re-sent on their behalf), or only the line is shown. Default if unanswered: the text returns to the composer when the composer is empty.

**Boundaries:** no new command, event, channel or preload method; no change to `STOP_ACK_MS`, `STOP_RESULT_MS` or to the room's no-gate rule (a send into a busy room still interrupts first); the harness never re-sends, queues or retries a message the user did not ask to send again; *Write summary*'s missing busy guard, the summary ask's wording and *stop room* meaning kill-versus-interrupt are Epic 4 retrospective F4 and F8 (action item 7) and are not changed here.
