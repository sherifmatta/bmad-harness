# BMad Visual Harness — Intent

> **Not the contract.** The machine contract is `../../specs/spec-bmad-visual-harness/SPEC.md`
> and its companions; this file is the brainstorm's own record, kept for narrative rationale.
> Where the two differ, the spec wins. Lines amended after the spec and architecture runs are
> marked *(amended)*.
>
> `harness-mockup.html`, the sibling of this file, was adopted as a **binding** design companion:
> its layout constants, state vocabulary and party-view panels are contract, not sketch.

## What we're building

A desktop harness that you point at any BMad-installed project and it becomes a room where the BMad team visibly works. Two columns: a conversation on the left where you talk to one agent persona at a time (with a real face on them), and a right rail split 50/50 — persona tiles on top, a live view of the project's `_bmad/` outputs below. Skills are invoked as buttons inside the conversation, scoped to whoever you're talking to. Documents write themselves on screen, visibly, while you watch; clicking a finished document opens it in its own window. A dedicated party-mode view puts a chosen cast of personas on screen at once for the group conversation you have *before* the pipeline starts. It does not redesign the BMad method — it replaces the terminal surface.

## Who it's for and why

Engineers on the team who bounce off BMad's prompt-only surface. The method works; the surface doesn't. Goal: make the method feel interactive and present — like having a whole company at your fingertips — instead of a flat list of terminal prompts.

## Thesis

**Presence, not autonomy.** Everything cut was autonomy (async work, agents picking up stories unprompted, channels, long-term memory). Everything kept was presence (faces, live writing, party view, visible outputs). The harness's job is not to make the agents *do* more — it is to make them *visible*.

The money moment that proves it: watching the PRD write itself, John pushing back on you, and a face attached to him. The combination is what makes it feel like part of a real organization.

## v1 scope (Must)

- **Read any BMad install with zero configuration** *(amended)*. Personas, skills and pipeline state are all discovered from the install on disk. Zero configuration is not zero *prerequisites*: a launch preflight checks that `claude` is authenticated, that `uv` with Python 3.11+ is present, and that the target project actually resolves an agent — and names whichever is missing rather than opening to an empty room.
- **Two-column layout** — chat occupies the large left area; right column is a single rail split 50/50, personas above, outputs below.
- **Persona face in the chat + persona tiles** *(amended)*, populated from the resolved agent roster — the `[agents.*]` tables in `_bmad/config.toml`, not `customize.toml`. A persona's `identity` and `communication_style` are not injected by the harness at all: the session activates that agent's own skill, which loads them itself. That is what makes the persona talk like the persona.
- **Skill buttons inside the conversation** *(amended)*, tied to the persona you're talking to, sourced from that agent's resolved menu. No separate skills list or launcher. Correction from the architecture pass: a menu entry carries exactly one of `skill` **or** `prompt`, and both dispatch as a turn — six of Mary's ten entries are prompt-style, so a skill-only dispatcher would leave 60% of that menu inert.
- **Documents write VISIBLY and live** *(amended)* — the authoring is the UI, not a spinner. This is the core demo beat. Confirmed feasible by the execution-model spike, with one correction: the prose streams from the running skill's event stream, not from watching the file. A card belonging to a persona you are not currently looking at collapses to one line carrying real state — persona, section, elapsed, stop — and expands on switch or click; a collapsed card is still not a spinner. See `../../specs/spec-bmad-visual-harness/execution-model.md`.
- **Live outputs rail via `fs.watch` on `_bmad/`** *(amended)* — files appear on create and settle to saved. The filesystem is the only source of truth for the rail; no second model of project state. Correction from the spike: a document lands as a single whole-file write, so there is no on-disk “being written” window for the watcher to pulse against — the writing state comes from the run.
- **Clicking an output opens it in a separate window** for review, not inline in the rail.
- **Persona handoff mid-session** *(amended)* — one continuous conversation that moves across personas (e.g. John for PRD → epics → sprint planning, then Amelia to build). Handoff is a first-class interaction, never a restart. Correction from the architecture pass: the conversation is continuous in the transcript and in the artifacts, but **not in process** — each persona runs its own session, and continuity across a handoff is carried by what the previous persona wrote to disk rather than by transplanting context. Whether that satisfies the money moment is an open question below.
- **Party mode view** *(amended)* — the user picks the cast when opening the room, defaulting to the five core personas; every face in the room stays permanently visible, current speaker highlighted, user can jump in at any time with no turn-taking gate. Promoted to Must deliberately: it is the pre-pipeline ritual the team already performs, and it is the BMad feature most crippled by the terminal (five speakers collapsing into one undifferentiated wall of text). The face solves real legibility here, not just charm. *(amended)* Scope correction from the architecture pass: v1 ships the **room** — cast, permanently visible faces, lit speaker, no turn-taking gate, a *Room* panel and the summary written to `_bmad/`. The mockup's *Open disagreements* and *Decisions so far* panels, the transcript's `disagrees`/`evidence` tags and *Pause room* are deferred, because `bmad-party-mode` emits prose and is instructed never to produce summaries or takeaways — there is no data source to populate them.
- **Real portrait art for every persona** *(amended)*. The `icon` field in `customize.toml` is not sufficient — v1 requires actual illustrated portraits. Resolved: procedural inline SVG, curated parameters for the five core personas and parameters derived deterministically from the agent id for any other installed agent.

## Should

- Help section explaining BMad to newcomers (the original ask; survives as Should, not Must).
- Persona face reacts to state: neutral idle, thinking while a skill runs, done/changed when a doc it owns changes on disk.

## Could

- Hover a persona tile to preview its skill buttons.
- "Second opinion" on any document in the rail: pick two personas, they argue for three bounded turns, then stop.
- Refusal-with-handoff: an off-speciality question gets "that's Mary's — want me to loop her in?" with an `@Mary` chip, teaching the org chart without a help page.
- Idle barks that surface rejected alternatives ("I still think we should've gone event-driven, but the client wanted REST") — the ADR's options-not-chosen section spoken aloud.

## Explicitly out of scope (Won't this time)

- **Chat-app information architecture** — channels, multiple simultaneous threads, group workspaces. Cut as overbuild; this is not a chat app rebuild.
- **Async / overnight autonomous work** and **agents picking up unstarted work unprompted.** Cut as autonomy.
- **Opinionated next-step guidance** — no highlighting, badging or recommending "the right next move." Explicitly rejected: seeing the skill buttons and the output list is enough, the user decides.
- **Long-term memory across weeks** (personas recalling a warning from two weeks ago).
- **Unread badges / RPG quest markers.**

## Hard constraints and anti-goals

- **Do not redesign the BMad method.** *(amended)* The waterfall pipeline (product brief → PRD → epics+stories → build → review → launch) is good and stays. Only the surface is being replaced. What does **not** stay is the serialism of the *interaction*: personas may run concurrently, a deliberate decision taken in the architecture pass. The waterfall of the method is unchanged; "talk to one agent, get a result, move to the next" was a description of the terminal, not a requirement.
- **Must not feel like just another chat box for prompting an AI.** If it reads as a prompt window with a portrait glued on, it has failed.
- **Top risk: it feels childish, too game-like, and loses the perceived intelligence** — the engineer uses it twice and goes back to the terminal.
- **Art direction is the childish-risk decision; there is no neutral option.** Target is a company-directory portrait — an illustrated headshot of a plausible colleague. Not pixel art, not JRPG sprites, not cartoon. Real faces plus a restrained UI is what buys the intelligence back.
- **RPG feel is relocated, not literal.** It means putting a face on the agent for personality — a small picture, more than an icon — and it belongs on the party-mode screen, not the 1-on-1.
- **No second source of truth** *(amended)*. The rail reflects the filesystem live; the harness never maintains its own model of project state. The live document card is the single exception, and not a real one: it renders a write still in flight, which is a view of the running skill rather than a claim about what the project contains.
- **Animation must carry information**, never decoration: a thinking face because a skill is actually running, a pulse because a file is actually being written.

## Key feasibility findings

- **The persona→skill mapping already exists on disk and must be read, not hardcoded.** Each agent's menu supplies `code`, `description` and a dispatch target — e.g. for John: PRD → `bmad-prd`, CE → `bmad-create-epics-and-stories`, IR → `bmad-sprint-planning`, CC → `bmad-correct-course`. Reading the install rather than modelling it is what keeps the harness from rotting when BMad updates, and it gives each persona tile its face, name, title and button list for free. *(amended)* Two corrections from the architecture pass. The configuration files are **never read directly** — raw `customize.toml` skips the `_bmad/custom/` override layer, so effective configuration comes only from invoking BMad's own resolvers (`resolve_config.py`, `resolve_customization.py` and the party skill's own `resolve_party.py`, which do not all live in one directory) and consuming the merged JSON. And the roster is not in `customize.toml` at all: `_bmad/config.toml` `[agents.*]` is authoritative for `name`, `title`, `icon`, `description`, `module` and `team`, with per-agent customization supplying only the menu.
- **Pipeline position is physically observable.** Every stage writes artifacts under `_bmad/`, including a sprint status file, so the harness can know where the project stands without asking the user.
- **The group-conversation fantasy is already shipped**: `bmad-party-mode` is installed. Group conversation, user participation and joint decisions all work today; the only unbuildable part of the fantasy was "they keep talking without me," which is cut anyway as autonomy.
- **BMad already documents its own outputs.** Surfacing those existing on-disk documents in a sidebar is sufficient — no new document model is needed.
- **The harness spans planning and build in one window**, watching artifacts accumulate across the chain. A terminal genuinely cannot do this; that span is the differentiator.

## Decided after the brainstorm

Added to the Must set during the spec run — gaps, not deferrals. Nothing here could be done in
the product as the brainstorm left it.

- **A running skill can be stopped.** Stop control on the live document card beside elapsed run
  time. The file is left byte-for-byte as written; the harness never reverts or patches it.
- **Failed and stopped runs are legible.** An `error` state (red) on the persona tile and the
  document card; the persona says in conversation which section it reached, what broke, and
  offers to resume. Indicator carries the alert, conversation carries the meaning.
- **Every installed agent gets a tile and a 1:1**, not just the core five — otherwise
  "read any BMad install with zero configuration" is not true.
- **A skill is executed by the Claude Code CLI** *(amended)*. The Agent SDK runs the same binary
  and emits the same events, but its terms require third-party products to carry their own API
  key; spawning the binary the user has already installed and authenticated does not. Settled by
  spike; evidence in `../../spikes/spike-skill-execution-model.md`, contract in
  `../../specs/spec-bmad-visual-harness/execution-model.md`. **Corrected in the architecture
  pass:** the runtime unit is a long-lived **persona session** — one subprocess per active
  persona, kept alive across turns — not one subprocess per run. Chat turns and skill
  invocations are both just turns into that session, so there is no second kind of run. A
  `result` row therefore arrives per *turn*, not once per process, and the process exit code
  stops being the signal for anything.

- **The harness writes nothing into the project.** Every byte under `_bmad/` got there because
  the runtime wrote it; the harness's own transcripts, logs and window state live outside the
  project root, persisted per project. This is what turns "no second source of truth" from a
  discipline into a structural guarantee — and it is how a conversation survives a restart even
  though the sessions behind it do not.

- **Personas may run concurrently**, and turns inside one session are strictly serialised. A
  message typed during a twelve-minute run is queued and sent when that run completes, which is
  what makes a result unambiguously belong to the turn the harness is waiting on.

## Open questions

### Resolved

- ~~How persona portraits get produced and licensed, and whether new personas fall back to the
  `customize.toml` icon.~~ → Procedural inline SVG; curated parameters for the five core,
  derived from the agent id for anyone else. No external assets, no licensing dependency, and
  the icon is never rendered as a portrait.
- ~~How "visible live writing" is rendered for a large document — streaming the full text, or a
  diff/section view.~~ → A section-scoped card: path and current section in the head, prose
  streaming in the body, sections-not-yet-written in the foot. *(amended)* The caveat that stood
  here — that this assumed BMad skills author progressively — is now resolved; see the entry below.
- ~~What happens to persona-state reactions if a skill runs long or fails.~~ → Long runs show
  elapsed time and a stop control; failures get the `error` state plus a persona explanation.
- ~~Whether the harness covers only the five core personas or every installed BMad agent.~~ →
  Every installed agent in tiles and 1:1; party mode takes a chosen cast defaulting to the five.
- ~~What executes a BMad skill when a button is pressed — Claude Code subprocess, API call,
  embedded agent?~~ → The Claude Code CLI, spawned as a long-lived persona session
  *(amended: the spec run said one subprocess per skill run; the architecture pass made it one
  per active persona)*. The spike also overturned this
  question's own early signal: BMad *does* render the document in one burst on disk — a single
  68KB write in the observed run — but that write arrives over the wire as ~5,800 incremental
  events, so section-by-section prose is real and the money moment stands unchanged.
  `.memlog.md` is therefore not the primary progress stream after all; it is the card's
  secondary feed, covering the quiet windows while research and reviewer subagents run.
- ~~How a session's conversation history is stored between launches.~~ *(amended)* → The
  transcript, session state and install model are held by the privileged side and persisted per
  project **outside** the project root. A window reload loses nothing, including a run in
  flight. The sessions themselves are not held across app restarts; the conversation is, and an
  explicit end-session control is the only thing that clears one.
- ~~Who wins when the harness and another tool write to `_bmad/` concurrently.~~ *(amended)* →
  Nobody arbitrates, because the harness makes no writes to arbitrate. The filesystem decides
  and last writer wins; the harness reflects the new state and *reports* the contention where a
  run was writing that file. It never locks, reverts, patches or restores. A stopped or failed
  run's partial file is already byte-for-byte the last successful write, so there is nothing to
  revert.

### Still open

Raised by the architecture pass; each needs an answer before the build commits.

- **Can a run be stopped without also ending the persona's session?** `SIGINT` is known to exit
  a subprocess cleanly in ~250ms, but interrupting one turn while keeping the session alive is
  unverified. If it proves impossible, stopping a run costs the session — and the binding
  decision is that the trade is stated to the user, never hidden. Cheapest thing to verify, and
  the shape of the stop control depends on the answer.
- **Does a conversation that is continuous in transcript and artifacts, but not in process,
  satisfy the money moment?** The handoff correction above is the reason this is open.
- **Does a queued composer read as honest, or as broken?** Queued-and-visible is the intent;
  only real use decides.
