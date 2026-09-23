---
id: SPEC-bmad-visual-harness
companions:
  - ui-surfaces.md
  - bmad-install-contract.md
  - execution-model.md
  - scope-tiers.md
  - ../../brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html
  - ../../planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md
sources:
  - ../../brainstorming/brainstorm-bmad-visual-harness-2026-09-22/brainstorm-intent.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# BMad Visual Harness

## Why

A vision to realize. The BMad method works — a fixed pipeline of product brief → PRD → epics
and stories → build → review → launch, with specialist personas you consult along the way. Its
surface does not: 29 skills as a flat alphabetical list, five party-mode speakers collapsing
into one undifferentiated wall of text, and outputs you only see by leaving the tool. Engineers
on the team bounce off it. The harness replaces that surface with a room where the BMad team
visibly works — faces, live authoring, and the project's own files updating as the work
happens. The thesis is **presence, not autonomy**: the job is not to make the agents do more,
it is to make them visible. The proof is one moment — watching the PRD write itself, John
pushing back on you, and a face attached to him.

## Capabilities

- **CAP-1** — zero-configuration install discovery
  - **intent:** A user points the harness at any BMad-installed project and the personas, their skills, and the project's pipeline position are all discovered from what is on disk.
  - **success:** A project the harness has never seen opens with correct personas, correct per-persona skill buttons, and correct pipeline state, with no configuration step and no harness-side registry. Adding an agent to the install surfaces it without a harness change. Where a prerequisite is missing instead, launch names which one and its remedy rather than opening an empty room. See `bmad-install-contract.md`.

- **CAP-2** — conversation and project state in one window
  - **intent:** The user holds a conversation and watches the project's artifacts accumulate at the same time, spanning planning and build without switching surfaces.
  - **success:** Chat and the live outputs rail are simultaneously visible for the full length of a session that runs from PRD through to build. Layout per `ui-surfaces.md`.

- **CAP-3** — personas have faces and identities
  - **intent:** Each persona is present as a specific colleague rather than a label, wherever they speak or wait.
  - **success:** Portrait, name, title and current state render in the chat header, the persona tiles and the party cast. The persona talks like the persona because its own agent skill is what is running — identity and communication style are never assembled by the harness.

- **CAP-4** — skills invoked in-conversation, scoped to the persona
  - **intent:** The user runs a skill by pressing a button belonging to whoever they are talking to, without leaving the conversation.
  - **success:** The button row shows exactly the current persona's resolved menu entries and rebuilds on persona change. Every entry dispatches — those that name a skill and those that carry a prompt alike — and an entry that can dispatch neither is surfaced as an error, never a dead button. There is no separate skills list, launcher or command palette anywhere in the product.

- **CAP-5** — documents write visibly and live
  - **intent:** The user watches a document being authored as it happens, rather than waiting on a progress indicator.
  - **success:** A running skill renders a document card in the conversation showing the file path, the section being written now, the prose streaming in, and the sections not yet written. A card belonging to a persona the user is not currently looking at collapses to one line carrying real state — persona, section, elapsed, stop — and expands on switch or click. No spinner substitutes for either form at any point in a run. The card is fed by the run's event stream, not by watching the file — see `execution-model.md`.

- **CAP-6** — outputs rail is a live view of the filesystem
  - **intent:** The user sees the project's real files change as the work happens.
  - **success:** A file created under `_bmad/` by any writer — the harness or anything else — appears in the rail without user action, indicates while being written, and settles to saved. The harness holds no state that could disagree with disk.

- **CAP-7** — documents open in their own window
  - **intent:** The user reviews a finished document at full size without losing the conversation.
  - **success:** Clicking a rail entry opens a separate window rendering that file read-only, reloading when the file changes on disk, with routes out to Finder and the user's editor.

- **CAP-8** — persona handoff mid-session
  - **intent:** One conversation moves across personas as the work moves through the pipeline.
  - **success:** A single unbroken conversation runs John for PRD, epics and sprint planning, then hands to Amelia to build. No handoff presents as a restart, a new thread or a cleared history. Continuity across a handoff is carried by the artifacts the previous persona wrote, not by transplanting context — the receiving persona can pick up the work from what is on disk.

- **CAP-9** — party mode
  - **intent:** The user convenes a room of personas in one conversation they participate in, before the pipeline starts.
  - **success:** The user chooses the cast, defaulting to the five core personas. Every face in the room stays visible with the current speaker lit; the user can type at any moment with no turn-taking gate; the room panel names the topic, who opened it, the context documents in scope and the destination path; and the room writes its summary to `_bmad/`. Tracking disagreements and decisions as visible structure is deferred for want of a data source — see `scope-tiers.md`. Detail in `ui-surfaces.md`.

- **CAP-10** — every persona has a real portrait
  - **intent:** Each persona is represented by an illustrated headshot of a plausible colleague, including agents installed after v1.
  - **success:** The five core personas render from curated art parameters; any other installed agent renders from parameters derived deterministically from its agent id, so it is stable across sessions. Portraits render at every size the UI uses. The `icon` field is never used as a portrait.

- **CAP-11** — a running skill can be stopped
  - **intent:** The user halts a run in progress rather than waiting it out.
  - **success:** A stop control sits on the live document card beside elapsed run time. Stopping leaves the file byte-for-byte as written, and the rail reports where it stopped. Whatever the stop costs beyond the run itself is stated to the user, never hidden. Stop mechanics in `execution-model.md`.

- **CAP-12** — failed and stopped runs are legible
  - **intent:** The user learns that a run ended early, how far it got, and what to do next, without reading logs.
  - **success:** An error state renders on the persona tile and the document card; the persona states in conversation which section it reached and what failed, and offers to resume; the partial file remains on disk and the rail row reports the section reached. The section reached is taken from the last confirmed write, never from an announced one — see `execution-model.md`.

## Constraints

- Do not redesign the BMad method. The waterfall pipeline is good and stays — brief → PRD → epics and stories → build → review → launch. Only the surface is replaced. The serialism of the *method* is binding; the serialism of the *interaction* is not, and personas may run concurrently.
- It must not read as a chat box with a portrait glued on. If it does, it has failed regardless of feature completeness.
- No second source of truth. The rail reflects the filesystem; the harness never maintains its own model of project state. The live document card is the one thing that renders ahead of disk, because it shows a write still in flight — it is a view of the running skill, never a claim about what the project contains.
- The harness writes nothing into the project. Every byte under `_bmad/` got there because the runtime wrote it; the harness's own transcripts, logs, caches and window state live outside the project root, persisted per project. This is what makes the previous constraint structural rather than a matter of discipline. A conversation survives a restart; the running sessions behind it do not, and an explicit end-session control is the only thing that clears one.
- Effective BMad configuration comes only from BMad's own resolvers, never from reading its config files directly — raw files omit the project's overrides. The harness implements no configuration layering of its own. This is what stops it rotting when BMad updates.
- The harness reads the BMad install; it never grows its own model of how BMad runs. A skill is executed by handing it to the installed runtime, not by reimplementing its steps.
- Zero configuration is not zero prerequisites. Launch verifies its prerequisites and reports the specific one that is missing with its remedy; it never opens to an empty room with no explanation.
- Animation must carry information, never decoration: a thinking face only because a skill is actually running, a pulse only because a file is actually being written.
- No opinionated next-step guidance — no highlighting, badging or recommending the right next move. The skill buttons plus the output list are enough; the user decides.
- Document windows are read-only previews. The harness is not an editor.
- The harness reports; it never arbitrates. It never reverts, locks, patches or restores a document. A stopped or failed run leaves the file exactly as written; where an external writer changes a file a run was writing, the harness reports the contention and the filesystem decides. Recovery is the user's call, informed by what the rail and the persona report.
- Art direction targets a company-directory illustrated headshot — not pixel art, not JRPG sprites, not cartoon. This is the single decision that carries the project's top risk, and there is no neutral option: restrained UI around real faces is what buys the perceived intelligence back.
- Disagreement between personas must be substantive and grounded in the project's own artifacts, never staged for effect. Friction is the point — the team digging for the better idea is a thrill, not stress — but theatre-grade disagreement reads as condescending and turns fake personhood into a trust liability a plain prompt never carries.
- The harness never authors words attributed to a persona. Every persona utterance comes from that persona's own running session.
- RPG feel is relocated, not literal. It means a face for personality, and it belongs on the party screen rather than the 1-on-1.

## Non-goals

- Chat-app information architecture — channels, multiple simultaneous threads, group workspaces. Cut as overbuild; this is not a chat app rebuild.
- Async or overnight autonomous work.
- Agents picking up unstarted work unprompted.
- Opinionated next-step guidance. Explicitly rejected by the user, not merely deferred.
- Long-term memory across weeks — a persona recalling a warning from a fortnight ago.
- Unread badges and RPG quest markers.

Everything on this list was cut for the same reason: it was autonomy. Deferred-but-wanted items are in `scope-tiers.md`.

## Success signal

An engineer who had gone back to the terminal runs a session in the harness — presses
*Create PRD*, watches John write it section by section, argues with him about a requirement,
sees the file settle in the rail, then hands off to Amelia to build — and keeps using the
harness for the next project instead of returning to the terminal. The demonstrable form is
that continuous cross-persona session; the failing form is the engineer who tries it twice and
goes back.

## Assumptions

- A desktop application with direct filesystem access to the project. The source specifies a desktop harness, filesystem watching and separate OS windows.
- The runtime and the architecture are both settled — `execution-model.md` for what runs a skill, `ARCHITECTURE-SPINE.md` for boundaries, layering and the pinned stack.
- One project per window.
- Dark theme only. The binding mockup defines a single dark palette and no light variant.
- A run is a multi-minute commitment. One observed `bmad-prd` run reached a complete PRD in about twelve minutes, with the first document content landing four minutes in. The UI is designed around that duration rather than around a fast round-trip.
- CAP-8's continuity holds in substance only insofar as BMad's memlog-then-derive pattern puts a persona's context on disk. Where it does not, a handoff loses it.

## Open Questions

- Can a run be stopped without also ending the persona's session? If it cannot, CAP-11's stop costs the session, and the constraint is that the trade is stated to the user rather than hidden. This is the cheapest thing to verify and the one CAP-11's shape depends on.
- Does a conversation that is continuous in transcript and artifacts, but not in process, satisfy the demonstrable form of the success signal and CAP-8? Needs confirming before the build commits.
- Does a composer that queues a message typed during a twelve-minute run read as honest, or as broken? Queued-and-visible is the intent; only real use decides.
