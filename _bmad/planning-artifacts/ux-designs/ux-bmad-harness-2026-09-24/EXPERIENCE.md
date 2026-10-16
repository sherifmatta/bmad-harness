---
name: 'bmad-visual-harness'
type: experience-spine
status: final
created: '2026-09-24'
updated: '2026-10-16'
sources:
  - ../../../specs/spec-bmad-visual-harness/SPEC.md
  - ../../../specs/spec-bmad-visual-harness/ui-surfaces.md
  - ../../../specs/spec-bmad-visual-harness/execution-model.md
  - ../../../specs/spec-bmad-visual-harness/bmad-install-contract.md
  - ../../../specs/spec-bmad-visual-harness/scope-tiers.md
  - ../../architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md
  - ../../../brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html
  - mockups/welcome-screen-chosen.html
  - mockups/light-theme.html
  - mockups/follow-the-thread.html
  - mockups/output-folder.html
  - mockups/rail-resize-collapse.html
  - mockups/paperclip-layout-chat.html
  - mockups/paperclip-board.html
  - mockups/chat-thread-reference.png
  - mockups/document-card-dead-air.html
  - mockups/skill-session-entry.html
  - mockups/new-session-landing.html
  - mockups/skill-session-entry-options.html
  - ../../epics.md
companions:
  - DESIGN.md
---

# BMad Visual Harness — Experience Spine

The product test that outranks every rule in this document: *"if it reads as a chat box with decoration glued on, it has failed regardless of feature completeness."* Restraint in the shell is not minimalism for its own sake. Nothing in this document may buy shell decoration, and the restraint is now spent on nothing: the product has no identity device and no replacement for one.

*Amended 2026-10-15 by the user's decision (the Story 7.5 update). The test's first wording named the identity device the product has dropped (the removal note under *Component Patterns*); "decoration" stands in for it **[ASSUMPTION]**, since the user removed the device, asked for nothing in its place, and did not restate the test. Before that, 2026-10-09: the chat thread and its header carry an initials disc for a persona (*Layout, chat and Board → The chat look*); since 2026-10-15 every seat does.* **Mockups illustrate; this spine wins** (stated once here, and it covers the three Story 7.5 mocks: [`mockups/skill-session-entry.html`](mockups/skill-session-entry.html), [`mockups/new-session-landing.html`](mockups/new-session-landing.html) and [`mockups/skill-session-entry-options.html`](mockups/skill-session-entry-options.html), the record of the rejected option A). Three mocks still draw what the chat look replaced (container turns, a tinted user turn): `follow-the-thread.html`, `rail-resize-collapse.html` and `light-a-shell.html`, as does the transcript box of the mock named in the removal note. Their turn rendering is superseded by *Layout, chat and Board → The chat look* in EXPERIENCE.md; the rest of each stands.

**Open items** (after the 2026-10-09 chat-look update, reconciled 2026-10-16 by the Story 7.6 audit. The 2026-10-15 Story 7.5 update added **no** item here, its three questions having been settled the same day; it did add two visual ones, which live in `DESIGN.md`'s open items 6 and 7 (the `Skill Session` button's radius and an `ended` seat's opacity) and are not repeated here. Each open one is also tagged `[OPEN]` where it appears; the rest of `review-rubric.md` is in `validation-report.md`):
1. `[SETTLED]` **Stop vs `close session`.** *Settled 2026-10-16; built by Story 3.19 (`turn.stop`, the contract's eighth command).* The header's one control is the same element in both and takes the `Stop` slot only while a turn is in flight, reading `close session` otherwise. A plain chat turn is stopped by `turn.stop(sessionId)`; `run.stop(runId)` and `session.close` are as they were. Nothing is open.
2. `[OPEN]` **The room's live turn.** It keeps its accent edge and `party-live-ground` by assumption, the one turn row with either.
3. `[OPEN]` **The skill-name source.** `handed to <persona> · <skill>` and the run card head show a name the renderer's events do not carry.
4. `[OPEN]` **Register split under steps.** Steps and prose are both mono; structure, not typeface, tells them apart.
5. `[SETTLED]` **The `@Name` chip.** *Built by Story 2.15 (AD-25), and kept by Story 3.19's header.* `turn.send` carries an optional `mention`, the literal token as typed, beside the text; it is stored with the record and drawn as the chip (`{components.mention}`) before the sent text, and the persona receives the text alone. Nothing is open.

Behaviour half of a two-document contract. **The ownership convention, stated once and used throughout: anatomy and appearance live in `DESIGN.md`; triggers, transitions, data sources and keyboard behaviour live here.** `DESIGN.md` is the sole home of colour, dimension, radius and type; tokens are referenced here as `{group.name}` and resolve there. This document never states a literal colour, size or font — per AD-14, a literal in a component is a defect.

Every rule below traces to a memlog decision, an architecture decision (AD-n), a capability (CAP-n) or a named source. Genuine gaps are marked **[ASSUMPTION]** inline. Where the binding sources disagree, the winner and the reason are stated at the point of conflict.

**Section map.** The order is not alphabetical and not obvious; jump by this.

| Section | What it settles |
|---|---|
| Foundation | platform, scope, posture, and who the product is designed for |
| Information Architecture | every surface — where it is reached from, what it holds, what it may never imply |
| Voice and Tone | harness-authored microcopy, and the handoff sysline ruling |
| Component Patterns | per-component behaviour, and when each component is absent |
| Interaction Primitives | every action, where it lives, what it dispatches, and tile order |
| Banned everywhere | product-wide prohibitions |
| State Patterns | tile, rail row, card, queued composer, roster, preflight, empty states |
| Welcome | the window before a project: when it opens, the one action, recent projects, the five core personas |
| Theme | light and dark, the System default, where the choice lives, and what changing it touches |
| Following the thread | what a thread does as it grows: follow, pause, and the way back |
| Output folder | which folder the rail watches, how it is derived and chosen, and what follows it |
| Resizing and folding | the two side panels' width, the Outputs folders' collapse, and what each remembers |
| Layout, chat and Board | the three-column room, the thread as one conversation, and the Board view; what is adopted and what is not |
| Dead Air | what the card does through a multi-minute silence |
| Failure, Stopping and Contention | the stop cost, terminal states, and the no-arbitration posture |
| Run Completion When Unattended | the notification contract for the terminal events |
| Party Mode | the room, its v1 cuts, and ownership without an `agentId` |
| Sessions without a persona | the Skill Session button, the New session chat (the entry and the landing), the first message, the skill-first session and its seat, ending, Recent activity |
| Accessibility Floor | reduced motion, keyboard reach, focus, live regions |
| Key Flows | the three narrated sessions the first rules came from; later sections (Welcome, Theme, Output folder, Resizing, the Board, the chat look) carry their own behaviour without a flow |

---

## Foundation

Desktop Electron shell. **macOS only in v1** — Windows and Linux are deferred, and the two platform escapes (`open -R`, `open -a`) are macOS calls confined to one module. **One project per window**; multi-project windows are deferred. **Two themes, dark and light** (2026-10-08), chosen by the user as *System* (the default), *Light* or *Dark* — see *Theme*. No high-contrast variant exists.

**The harness opens to a Welcome window, not to a native dialog.** It is where a project is chosen (*Welcome*, below). A project passed on the command line skips it for the first window.

Three top-level views behind a single switch — **1:1 Conversation**, **Party Mode** and **Board** (2026-10-09; *Layout, chat and Board*). A **Help** entry point is reserved in the topbar layout but **does not render in v1**, because the Help *section* behind it is Should-tier and a control that opens nothing is a control that lies; *Accessibility Floor → Keyboard reach* therefore lists the view switch alone. An explicit **end-session** control exists and is the only way to clear a persisted conversation; it is a lifecycle control, not a next-step suggestion (AD-21).

*Amended 2026-10-15 (Story 7.5).* **The shell no longer always has a current persona.** A window opens on the New session chat, a chat with nobody in it, and no tile is current until the user turns to one; the same chat is where the window lands after the user ends the skill session they are viewing. Every rule below that says "the current persona" holds whenever one is current and is silent otherwise. *Sessions without a persona* settles the surface.

**This document designs for the user who is elsewhere.** The author works both at the window and in another app during a multi-minute run (memlog). The elsewhere case is strictly harder, and **a design that holds for it also holds for the attended case** — so every waiting state is specified for the unattended reading first and the attended reading second.

**Stakes are hobby — the author and no one else.** This sets the accessibility posture (see *Accessibility Floor*): fix the real holes, claim no conformance level.

---

## Information Architecture

| Surface | Reached from | Contains | Notes |
|---|---|---|---|
| Welcome | launch with no project path · closing the last project window · macOS reactivation with no window | brand, `no project open`, the one open action and drop zone, recent projects, the five core personas by phase | its own window, no project; see *Welcome*. Not a view of the shell and not a step |
| Topbar | always present | brand, project path, install chip, branch chip, view switch | `{spacing.topbar}`. The Help entry point is reserved but not rendered in v1 |
| 1:1 Conversation | view switch | Team sidebar + chat column + rail | default view; three columns, see *Layout, chat and Board* |
| Chat column | 1:1 | conversation entries in time order — persona turns, user turns, syslines, document cards; skill button row (a persona's chat only); composer | thread `{spacing.thread-max}` max-width |
| New session chat | window open · the Skill Session button · ending the skill session in view | a header reading `New session`, an empty thread, an empty focused composer | *Added 2026-10-15.* The empty chat and the landing are one surface; no persona, no session, nothing recorded. See *Sessions without a persona* |
| Skill-first session | a first message `/<name>` in the New session chat · a skill seat | the skill's name as speaker, its run card, its own thread, the composer | *Added 2026-10-15.* Its own kind of chat, never a persona's and never the room. See *Sessions without a persona* |
| Team sidebar | 1:1, left | the **Team half**: a state strip, the Skill Session button in a row of its own (*built 2026-10-16: the `Sprint board` row is not built in the code, so the button has its own Team-half row*), the persona tiles, then the Skill sessions group while one exists | `{spacing.sidebar}` by default; resizable (*Resizing and folding*) |
| Skill Session button | Team sidebar, in a Team-half row of its own, right-aligned (the *Sprint board* row it was drawn at the end of is not built in the code) | the label `Skill Session` and nothing else | *Added 2026-10-15.* An entry to a chat, not a launcher: it lists no skill |
| Rail | 1:1, right | the **Outputs half** alone | `{spacing.rail}` by default; resizable (*Resizing and folding*) |
| Persona tiles | Team sidebar | one per installed agent: initials disc, name, title, state line; current marked with an accent edge | grouped, see *Interaction Primitives*. Amended 2026-10-15: no illustrated avatar on any tile; no tile is current while the New session chat or a skill session is in view |
| Skill seats | Team sidebar, in a **Skill sessions** group below the personas | one per skill-first session: a `/` disc, the skill's name in mono, a state line | *Added 2026-10-15.* Shown only while one exists. See *Sessions without a persona* |
| Rail rows | rail, Outputs half | one row per file under `_bmad/` — path, owner, state, optional run annotation — under a heading per directory that can be folded | disk truth only (AD-1) |
| Document card | **inline in the conversation, in time order** | head / body / foot | run-scoped; never a panel |
| Party Mode | view switch | cast, header, transcript, *Room* section | see *Party Mode* below |
| Board | view switch | overview, the story board by status, the epics, the agents, recent activity | read-only; see *Layout, chat and Board* |
| Document window | click a rail row or a card path | read-only preview, reloads on write | separate OS window, outside the shell |
| Preflight | launch failure, after a project is chosen | named missing prerequisite + remedy | see *State Patterns → Preflight* |

**Nesting and lifetime**

- 1:1, Party and Board are mutually exclusive; one switch. *(2026-10-09: Board is the third view, which lifts the earlier "no third view".)*
- The rail shows **project artifacts only**. Harness bookkeeping — transcripts, logs, window state — lives in `userData` and never appears (AD-1). No affordance may imply the harness authored or can author a file.
- Document cards are **conversation entries**, not a region. A card is born with a skill invocation (`run:started`) and dies with it. A plain chat turn raises no card (AD-11).
- Skill buttons are nested under the active persona and rebuilt whenever the active persona changes. *(2026-10-15: the New session chat and a skill-first session have no active persona and no skill buttons **[ASSUMPTION]** — a skill row is built from a persona's menu and these have none.)*
- Ownership asymmetry: a party session carries no `agentId`. The **room** owns it, so a party summary's rail row shows the room as owner, in a presentation distinct from any persona (AD-19).
- The mockup's legend footer is prototype furniture ("Non-functional design prototype…"). It is not product chrome and does not ship.

**There is no command palette and no launcher anywhere in the product** (AD-21). The rejection is argued once, in *Banned everywhere*. *Amended 2026-10-15 (Epic 7, FR30 as amended; Story 7.5): the earlier rule said skills were reachable only as the current persona's buttons and that no skills list existed. Two things now exist. A skill is also reachable by typing `/<name>` as the first words of the New session chat (*Sessions without a persona*), and Story 7.3 adds the one place skills are listed, the `/` list above a persona's composer (*Component Patterns → `/` list, in detail*). The Skill Session button is **an entry to a chat, not a launcher**: it lists no skill and starts none.*

---

## Voice and Tone

**The personas' voices are not the harness's to write.** AD-18 and AD-10: `identity` and `communication_style` are never harness-injected, and that is precisely what makes a persona talk like the persona. The UI never styles, frames, prefixes, summarises or classifies a persona's words. Only main-thread `text_delta` may render as a persona turn (AD-6); subagent output never may.

This section therefore governs **harness-authored microcopy only**: rail states, empty states, preflight errors, notifications and syslines.

| Do | Don't |
|---|---|
| `writing · §4 Functional Requirements` | `Writing section 4 of 9…` |
| `saved · 3d` | `Last saved 3 days ago ✓` |
| `not yet written` | `Waiting for content…` |
| `no files under _bmad/ yet` | `Get started by running a skill` |
| `stop` | a modal asking `Are you sure?` |
| `queued · sends when John finishes` | `Message will be delivered shortly` |
| `session closed · Amelia starts fresh on the next message` *(Story 7.4; `handed to Amelia · bmad-build` is superseded, a switch writes nothing)* | `conversation and context continue` |
| `no skill named hello` | a line that suggests what to type instead (rule 1) |
| `session ended` | an apology, or an offer to start another (rule 1) |
| Lower case, mono, `·` as the separator, no terminal punctuation | Sentence case with full stops in a state string |
| Name the thing and stop | Name the thing and recommend a move |

**Rules**

1. **State, never guidance.** No harness string may suggest, highlight, badge, sort or recommend a next move (AD-21). A *remedy for a missing prerequisite* is not guidance and is required (AD-17); a suggestion about which skill to run next is guidance and is forbidden.
2. **The indicator carries the alert; the conversation carries the meaning.** No error text on a tile. The substance of a failure belongs in the conversation, in the persona's own voice, which AD-18 keeps the session alive to deliver (CAP-12).
3. **Never claim what did not happen.** The handoff sysline, the revision status word and the deleted denominator all exist because an earlier string asserted something the user could catch out.
4. **Mono is the harness's register; sans is the register of things said.** Every harness-authored string — paths, states, metadata, syslines — renders in the mono role tokens (`{typography.label}`, `{typography.meta}`, `{typography.micro}`). **Persona voice renders in the sans role token `{typography.body-ui}`. Document prose renders in the document register, `{typography.doc-prose}`, which is mono.** The split is load-bearing: it is what keeps harness copy from reading as somebody's words, and what keeps the two feeds in one card body distinct. Stated in full in `DESIGN.md` → *Typography → The register split*.
5. **Disagreement must carry evidence — a file, a line count, a percentage, a cost — or it must not ship.** Theatre-grade disagreement is a trust liability a plain prompt box does not carry; fake personhood is the failure mode named in the source. The harness does not author disagreement, so this rule binds the two things **the harness** *does* control: any persona or party configuration shipped with the product, and the chrome around a turn. v1 ships **no** `disagrees` / `evidence` tag, because a tag would let contentless disagreement read as substantive (see *Party Mode*).
6. **Config file paths never appear in copy.** The mockup's rail footer (*"Read from each agent's `customize.toml`…"*) and composer hint (*"skills read from `.claude/skills/…/customize.toml`"*) are factually stale: AD-10 makes `_bmad/config.toml` `[agents.*]` authoritative and AD-8 says config files are never read directly. **The spec wins over the mockup here.** Both strings are cut; nothing replaces them. **[ASSUMPTION]** — no source specifies replacement copy; dropping the provenance sentence is the minimal honest fix.

*Added 2026-10-15 (Story 7.5).* Two harness lines join the syslines, `no skill named <word>` and `session ended`, both in the existing sysline style and never attributed to a persona or a skill (*Sessions without a persona*). Rules 1 to 6 hold for both. They state a fact and stop (rules 1 and 3: the first says what was not found, the second says what has ended, and neither says what to do next). They are the harness speaking in its own register and put no words in a persona's mouth (rule 2 and AD-18). Both render in mono (rule 4) and carry no path (rule 6). The lower-case rule is for state strings and syslines; the control labels `Skill Session` and `Skill sessions` (the group heading) are the user's own wording and follow the capitalised controls already here (`Stop`, `Sprint board`).

**The handoff sysline — why the mockup's wording is wrong, and where it stands**

*Superseded 2026-10-15 (Story 7.4, FR133).* Turning to a persona, by tile or `@name`, now writes **no line at all**: each persona keeps its own live session, so a switch ends, replaces and re-briefs nothing, and there is nothing to announce. The `handed to <persona>` line, and the ruling below, stand only as history; older transcripts that hold one still show it as sysline text. What the thread says instead is when a seat **ends**: when the user ends one persona's session with the header's `close session`, one harness line, **`session closed · <Name> starts fresh on the next message`**, joins the thread. It states a fact and stops (rules 1 and 3), is lower case and plain in mono, never attributed to a persona, and claims no continuity; every turn stays above it, since the thread is the project's one conversation. `End conversation` writes no such line (it clears the thread).

The mockup's sysline read *"handed off · John → Amelia · conversation and context continue"*. Under **AD-7 that is false**: a handoff **starts a new session**, and continuity is carried by *the project artifacts the previous persona wrote*, not by transplanting context. It was first corrected to name those files (*picking up from PRD.md, epics.md*). **On 2026-10-09 the user chose the screenshot's wording instead: `handed to <persona> · <skill>`.** It claims nothing that did not happen, so AD-7 holds, but it no longer names the files that CAP-8's *"no handoff presents as a restart"* leaned on; the transcript is still continuous and the files are still in the rail beside it. **[ASSUMPTION — OPEN]** — the skill is named only when main knows one for the handoff (one that came with a skill invocation); with none the line is `handed to <persona>`. AD-3 keeps resolved skill names out of the renderer, and a menu entry may be a prompt with no skill behind it (AD-9); the renderer's `run:started` carries only the menu `code`. The name has a source or it is omitted. **The `· <skill>` half is dormant in v1:** a handoff from a tile click or `@name` names no skill (Flow 3), so today the line reads `handed to <persona>`.

---

## Component Patterns

Behavioural only, per the ownership convention. Anatomy and appearance live in `DESIGN.md` → *Components*.

| Component | Behaviour | Disabled / absent when |
|---|---|---|
| View switch | toggles 1:1 ↔ Party; a third segment, Board, is proposed (*Layout, chat and Board*). Sessions in the other view keep running. | never |
| Persona tile | click marks current (accent edge), rebuilds the skill row, and expands that persona's card. A tile is its persona's one seat (Story 7.4): main keeps one live session per persona and answers a second open with the same one, so a tile stands for exactly one session, and there is no cap on how many tiles are live. Anatomy (amended 2026-10-15): `{components.persona-tile}`, one row of `{components.persona-tile.height}` with an initials disc of `{components.persona-tile.discSize}`, the same anatomy as a skill seat. A click leaves the New session chat as it is, kept in the background (*Sessions without a persona*) | never; a party session has no tile |
| Portrait | **Removed 2026-10-15** (the user's decision, Story 7.5 update; it extends the 2026-10-09 override that took the faces out of the chat). The illustrated portrait, its generator and every size and rule for it are gone from the product; **nothing replaces it, and the product has no identity device**. Every seat is an initials disc (`{components.initials}`): the Team tiles, the cast cards and the Welcome team at `{components.initials.sizeThread}`, the chat header at `{components.initials.sizeHeader}`, small references at 20px. Upstream, `SPEC.md` CAP-3 and CAP-10 and `AD-16` no longer hold, nor does `ui-surfaces.md`'s portrait section; `AD-16` needs an amendment from `bmad-architecture`, and the code, its tests and the prompts folder need a story. Mocks drawn before this date that show a face (`portrait.html` and the welcome, light-theme and shell mocks among them) are superseded on that point. Tokens the code still carries are marked in `DESIGN.md` until that story | — |
| Initials token | `{components.initials}` is **the avatar everywhere a persona or you is drawn** (amended 2026-10-15: it is no longer only the chat's): beside every turn (`{components.initials.sizeThread}`), on a Team tile, a cast card and a Welcome card (the same size), in the chat header (`{components.initials.sizeHeader}`), and at 20px for small references. A persona's disc is its letters by the `initialsOf` rule (one letter for a one-word name). Its **skill variant** is a neutral disc holding `{components.initials.skillGlyph}` in mono in `{colors.initials-ink}`, for a skill-first session's turn, header and seat. **Where it stands alone, it reveals name and role on both hover and keyboard focus; beside a name (the thread, the header, a tile, a card, a seat) it is decorative: no tab stop, no reveal** (*Accessibility Floor → The initials token*). | — |
| Skill button | label is the menu entry's `description`; a code badge carries the `code`. Click dispatches `menu.dispatch(sessionId, code)` — the button knows nothing about what it invokes. **No tooltip or preview derived from a resolved skill name** (AD-3: it would go stale). The user is never shown whether an entry is `skill` or `prompt`, and should not care (AD-9). | disabled whenever **any** turn is in flight in that session. `live` does **not** disable them |
| Skill Session button | *Added 2026-10-15.* A native button in a Team-half row of its own, right-aligned (the *Sprint board* row it was drawn in is not built in the code); `{components.skill-session-button}`; pressed means the empty chat is open. Unrelated to the skill buttons above, which are a persona's menu entries. Behaviour: *Sessions without a persona → The Skill Session button* | the Team sidebar is not on screen (Party, Board) |
| Skill seat | *Added 2026-10-15.* One skill-first session in the Skill sessions group; `{components.skill-seat}`, the persona tile's anatomy. Behaviour: *Sessions without a persona → The skill seat* | absent until a skill-first session exists |
| `+N more` | **expands the button row in place.** The row grows to show the remaining entries. **No transcript entry is created.** | — |
| Composer | never disabled. A message typed during a run is queued and visible — see *State Patterns → Queued composer*. A persona's composer also opens the `/` list when its first character is `/` (*`/` list, in detail*). | never |
| `/` list | *Added 2026-10-15 (Story 7.3).* A `listbox` above a persona's composer holding every skill the install declares, in the manifest's order, narrowed by the start of the name. Keys and rules: *`/` list, in detail*. `{components.skill-list}` | absent unless the text's first character is `/` and a name matches; absent in the room's composer |
| Document card | born on `run:started`, dead on the run's terminal event. Full for the active persona's card, collapsed for every other card. Expands on persona switch or click. **A collapsed card is never a spinner; it is the same state, smaller.** | absent for a plain chat turn |
| Stop control | present on **both** the full card head and the collapsed line. Dispatches `run.stop(runId)`. The chat header's `Stop` is the same stop for the turn in flight (*Layout, chat and Board → The chat look*). | — |
| Rail row | two independent registers on one line: disk `state` (watcher) and optional run `annotation` (stream). Click opens the document window. | the annotation slot is genuinely optional — a row must read as complete without it |
| Document window | read-only preview, reloads **from the watcher**, not from a renderer-initiated read. Three escapes: *Reveal in Finder*, *Open in editor*, *Close*. `Esc` closes. **No refresh control. No edit affordance. No save.** | — |
| Cast card (party) | presence is expressed by **dimming, never removal**. Every chosen persona's card stays permanently visible, its initials disc included; the current speaker's card is lit (`{colors.cast-speaking-border}`). | — |
| Decision option | the block a persona raises inside its own turn when it stops to ask. Each option is its own control — click, or `Enter`/`Space` when focused. Activating one **sends that option as the user's turn**, in the user's name, and the run resumes from the persona's reply. **The whole option block is then removed** — it was a question and it has been answered; there is no chosen state, no greyed-out losers and no record of the block beyond the two turns either side of it. The harness never authors the options, never reorders them and never marks one recommended; a stated lean is the persona's own words. | absent unless the persona's turn raises one |
| Sysline | harness-authored transcript entry in mono: session resumed, room opened; and, from 2026-10-15, `no skill named <word>`, `session ended` and (Story 7.4) `session closed · <Name> starts fresh on the next message`. The handoff line is superseded: a switch writes nothing. Never attributed to a persona. | — |
| Conversation turn | a flat row: initials disc, head (name, title, clock time), words. Behaviour: *Layout, chat and Board → The chat thread*, *State Patterns → A turn in flight*, *Queued composer* | — |
| Chat header | one line: disc, name, `title · story <id>`, the state pill, the stop slot. Behaviour: *Layout, chat and Board → The chat look*. Skill variant (2026-10-15): a `/` disc, the skill's name in mono, the pill, the stop slot, with no title and no story reference; the New session chat's header is the disc and `New session` alone (*Sessions without a persona*) | the story reference is absent when it has no source |
| Run step | one row of the run list, in the document card's body: *State Patterns → The run list* | absent until the main-side step event exists |
| Run note | one row of the run list, from `.memlog.md`: *Dead Air → Run-note anatomy* | — |
| Status dot | five states, one source each: *State Patterns → Persona tile* | — |
| Tags | neutral and disagree chips; v1 ships none of the party tags: *Party Mode* | — |
| Follow control | *Following the thread* | — |
| Splitter, Folder heading, Outputs head | *Resizing and folding*, *Output folder* | — |
| Welcome | *Welcome* | — |

### `+N more`, in detail

The mockup prints the full menu into the transcript as a persona turn (*"Full menu for Mary, read from customize.toml"*). **This is rejected.** It is the harness authoring words attributed to a persona, which AD-18 forbids outright. The replacement is in-place expansion: the row grows, the remaining entries appear as ordinary skill buttons, nothing is written to the transcript.

The row must look right at both extremes of the real data: **Sally has 1 entry, Mary has 10** (John 4, Winston 2, Amelia 5). **[ASSUMPTION]** — the control toggles back; expanded, it reads `fewer`. No source specifies a collapse affordance.

### `/` list, in detail

*Added 2026-10-15 (Story 7.3; FR131, UX-DR52).* A person who knows a skill exists but not its name has nowhere else in the conversation to find it. The list is the one place the product lists skills, and it is read from the install's own manifest in main; the renderer only narrows the rows it was given.

- **Opens** only when the composer's **first character is `/`**. A `/` later in the text, or after an `@name`, opens nothing, so it cannot interfere with the handoff. Shows **every** skill the install declares, in the manifest's order, none hidden, none ranked, none recommended. A manifest that is absent or unreadable gives no list and no error line: the composer works as it did.
- **Narrows** by **case-insensitive prefix of the name** against what follows the `/`. No fuzzy match, no match on the description, no recents or favourites, no argument hints. It **closes** when nothing matches and when a space follows the name, so the text after a chosen name is the message.
- **Keys**, with focus staying in the textarea: `↑`/`↓` move the one current row, one at a time, **clamped** at both ends (the shared roving code); `Enter` or `Tab` put `/<name> ` (the name and one space) in the field, **caret after it, nothing sent**; `Esc` closes the list and leaves the text, and it stays closed until the text changes again. Any other key is the field's. With the list closed `Enter` sends as it always did. A key that commits an input-method composition, and a chord with `Shift`, `Ctrl`, `⌘` or `Alt`, are not the list's.
- **Sends nothing and starts nothing.** A chosen `/<name>` is only text. Sent from a persona's composer it goes as typed, unchanged: no session starts, no run card is born, and `@name` still addresses only a persona. What a typed `/<name>` means in the New session chat is *Sessions without a persona → The first message*, built by Story 7.5: the New session chat's composer is given this list (it is the chat whose only job is typing a skill), and a skill-first session's composer and the room's are not; a persona's composer still sends `/<name>` as typed.
- **Where.** A persona's composer and, *settled 2026-10-16 (Story 7.5)*, the New session chat's. The room's composer is **not given the list**: the room is a cast. A skill-first session's composer is not given it either, so nothing inside a session suggests starting another.
- **Silent.** The list adds nothing to the live region (*Accessibility Floor → Live-region policy*): opening, narrowing, moving and choosing are not announced. It shows no count, no heading, no icon and no tooltip. It is a `listbox` of `option` rows; the textarea carries `aria-controls`, `aria-expanded` and `aria-activedescendant` (the current row) **only while the list is open**, and none while it is closed. The composer's hint line is unchanged.
- **Never.** A button, menu, shortcut, panel or tile anywhere else that lists or launches a skill, and a skill name or description on a skill button (*Banned everywhere*).

### Document window ceiling

Project **content** is untrusted because it is largely model-authored (AD-13). Markdown renders with HTML disabled and is sanitized before insertion: **no raw HTML, no embedded styles, no images by markup.** The preview's entire visual range is sanitized markdown-it output, and it must look *intentional* within that ceiling rather than degraded. The harness previews documents; it never becomes the editor. The chat draws a persona's or a skill's completed turn through the same pipeline and the same single inner-HTML path (*Layout, chat and Board → The chat's markdown*).

---

## Interaction Primitives

| Primitive | Where | Dispatches |
|---|---|---|
| View switch | topbar | 1:1 ↔ Party ↔ Board |
| Persona tile | Team sidebar | marks current · rebuilds the skill row · expands that persona's card · opens a session when none is live, or turns to the one that is, and writes nothing (Story 7.4); a live persona's tile carries the `live` dot and word |
| Skill Session button | Team sidebar, in its own Team-half row (the `Sprint board` row is not built in the code) | opens the empty chat, or returns to the one already kept, with its half-typed text. **An entry to a chat, not a launcher:** it lists and starts no skill (*Sessions without a persona*) |
| Skill seat | Team sidebar, Skill sessions group | turns the chat to that skill-first session. It has no end control; the header's `close session` is the only end (Story 7.4) |
| Skill button | above the composer | `menu.dispatch(sessionId, code)` → births a card |
| `+N more` | skill row | expands the row in place |
| Composer | chat column | `turn.send` — queued if a turn is in flight |
| `/<name> …` as a first message | chat column, New session chat only | **starts a skill-first session** when `<name>` is an installed skill (a persona's skill turns to that persona's seat, the room's to the room). Any other first word starts nothing and says `no skill named <word>`. Typed in a persona's composer, `/<name>` is sent as it was before (Story 7.3) |
| `@<name>` in the composer | chat column, 1:1 | **turns to that persona**: opens or resumes its seat and writes no line (Story 7.4; no ending of any other seat). The sole keyboard-fast path to a switch. It addresses a **persona** and never names a skill (*Banned everywhere*). *Amended 2026-10-15 (Story 7.5): it is no longer the product's only text-driven navigation, since a `/<name>` first message in the New session chat also starts or turns to a chat; `@<name>` still addresses only a persona, and `/<name>` is the one way a skill is named in text* |
| `@<name>` in the composer | chat column, party | **directs the question at that persona.** Addressing only — it does not gate the room or reorder speakers |
| Decision option | thread, inside a persona turn | sends the chosen option as the user's turn, then removes the block |
| Card click | thread | expands a collapsed card |
| Stop | card head **and** collapsed line | `run.stop(runId)` |
| Rail row click | rail | `doc.open(path)` → separate OS window |
| *Reveal in Finder* / *Open in editor* / *Close* / `Esc` | document window | macOS escapes; `Esc` closes |
| Cast chooser | party, on opening | chooses the room; defaults to the five core personas |
| *Write summary to `_bmad/`* | party header | writes `_bmad/party/<date>-<topic>.md` |
| End session | shell | `conversation.end(projectId)` — **project-scoped**, the only way to clear a persisted conversation |
| Splitter | the inner edge of the Team sidebar, the rail and the Room panel | drags that panel's width; double-click or `Enter` resets it |
| Folder heading | rail, Outputs half | folds or unfolds that directory's rows |
| *Open project folder…* · `⌘O` | welcome | the native folder chooser; a choice opens that project's window |
| Drop a folder | welcome | opens that project's window |
| *View ▸ Theme ▸ System · Light · Dark* | application menu, every window | sets the theme for every window at once |
| `↓ latest` | thread, only while it is not following | scrolls to the newest line and resumes following |
| `change…` · *File ▸ Output Folder…* | Outputs head · project window menu | the native folder chooser for this project's output folder |
| *File ▸ Use BMad's Output Folder* | project window menu | forgets this project's choice |
| `theme · system · light · dark` | welcome, bottom edge | the same choice, from the one window with no project |
| Recent row | welcome | opens that project's window |
| Inbox row | Team sidebar | **Deferred, not built:** no row and no reserved slot. Would list the open decisions across personas and open the one chosen in its persona's thread |
| Message actions | on hover or focus of a turn | *Copy*, *Quote* (into the composer), *Open document* (when the turn names one) |
| `?` · `g b` · `g i` · `g c` · `j`/`k` | anywhere outside the composer | cheatsheet · Board · Inbox · composer · next and previous turn. **Built: `g b` alone** (ignored while a field has focus, and the only chord); `g i` waits on the deferred Inbox |

**Chat turns and skill invocations are both turns into the same session.** There is no second run kind, and the composer and the skill row must not read as two modes (AD-18).

### Persona tile order

Grouped by the agent's **`module`**, and by **`team`** where present — AD-10 names both as grouping fields. Within each group, the order the agents appear in the resolved `_bmad/config.toml`.

**No relevance sort, no recency sort, no pinning, no highlighting** (AD-21). Config order is the one ordering the user actually controls. Roughly six tiles fit the Team half before it scrolls, so the grouping becomes load-bearing the moment an install exceeds the five core agents. **[ASSUMPTION]** — group headings reuse the existing file-group treatment from the Outputs half; no source specifies a persona group heading.

---

## Banned everywhere

- **Command palette / `⌘K`, any launcher, any global skills list.** AD-21 rejected all three outright, with no v2 hook. *Amended 2026-10-15 (Epic 7, FR30 as amended; Story 7.5), and only for the two things Epic 7 adds:* a `/<name>` first message in the New session chat starts a session, and Story 7.3's `/` list in a persona's composer is the one place skills are listed (*Component Patterns → `/` list, in detail*). **Still banned:** a command palette and `⌘K`; any list of skills anywhere else; any button, menu, tile, row or shortcut that lists, names or starts a given skill. The Skill Session button is an entry to a chat, not a launcher, and carries no skill. A shortcut vocabulary that enumerated skills would still be a launcher under another name.
- **Badges of any kind**, unread counts, quest markers, relevance sorting, next-step highlighting, recommended actions.
- **Spinners, anywhere, at any point** — including a sentence doing a spinner's job.
- **Per-section tick-through**, progress bars implying steady incremental advance, staggered reveals of an atomic commit, per-character typewriter effects.
- **Any dialog that resolves, merges, reverts, locks, patches or restores.** No "keep mine / keep theirs". **No undo** (AD-12).
- **Any editing affordance in a document window**; no refresh control.
- **Tooltips or previews derived from a resolved skill name** (AD-3 — they go stale).
- **Sound.** No source in the project mentions audio anywhere. Given the gamification aversion, silence is intentional; any sound is a new decision, not an inherited one.
- **Refusal-with-handoff** ("that's Mary's — want me to loop her in?" with an `@Mary` chip) — Could-tier, not v1. The `@` *address* syntax ships; the persona **volunteering** a handoff does not.

---

## State Patterns

### Persona tile — exactly five dot states, one source each

| State | Indicator | Driven by | Notes |
|---|---|---|---|
| `idle` | `{colors.faint}` dot | no session, or nothing running | |
| `work` | `{colors.amber}` dot, pulsing | any turn in flight — chat or skill run | **persists through quiet subagent phases.** The work is still running, so the signal still holds |
| `live` | `{colors.green}` dot | a long-running attached process (e.g. a test watcher) | looks like activity but must **not** disable skill buttons |
| `note` | `{colors.note}` dot | the watcher saw a change to a file this persona owns | uses the dedicated `{colors.note}` token, not `{colors.accent}` — the two must stay distinguishable (AD-14) |
| `error` | `{colors.red}` dot | this persona's last run failed **or** was stopped | the tile conflates the two on purpose. **Alert only — no error text on the tile** (AD-20) |

Every indicator is driven by real system state; no state exists for decoration. Five states, **four colours** — `idle` is the absence of one (`DESIGN.md` → *Colors*). **Every dot is paired with a text state string in the same row** — this is the colour-blindness mitigation and the reduced-motion mitigation at once, and it is cheap enough to be non-negotiable.

*Added 2026-10-15 (Story 7.5).* **The five tile states stay as they are.** A persona's tile did not gain or lose a state from the removal of its illustrated avatar or from the skill seat. The skill seat (*Sessions without a persona → The skill seat*) uses the same dot vocabulary and adds no sixth tile state:

| Skill seat | Indicator | Text | Driven by |
|---|---|---|---|
| working | `{colors.amber}` dot, pulsing | `working · <elapsed>` | a turn in flight in that skill-first session, as main reports it |
| live | `{colors.green}` dot | `live` | the session is open, idle and holds its context. The same fact Story 7.4 gives a persona seat's live dot: it means only that the seat holds context |
| ended | no dot | `ended` | the app was relaunched: the thread was kept and the process went with it |

Same rules as the tile: every dot is paired with its text, nothing pulses for being `live`, no count, no new colour. A skill seat has no `note` or `error` dot **[ASSUMPTION]**: the memlog names three states and no more, so a failed or stopped run reads in its thread and in Recent activity, and an idle seat that holds context reads `live`.

### Rail row (Outputs half) — two registers, never merged

| Register | Source | Values |
|---|---|---|
| disk `state` | watcher only | `not yet written` (absent) · `changing` · `saved · <age>` |
| run `annotation` | stream only, **optional** | owner (a persona / the room / none) · section in flight · `stopped` · contention |

A row can be `changing` with **no annotation at all** — an external editor writing the file. A row never shows `saved` because a run said so. There is no single merged "status" field (AD-2).

**Owner display:** the owner is a `sessionId`. It renders as that session's `agentId` where the session has one; failing that, as the owner derived from the artifact's class; failing that, **it does not render at all — the harness never guesses an owner**. The owner slot must look correct when empty (AD-19).

### Document card

The body has **two visual modes** — *prose mode* and *run-list mode* (`DESIGN.md` → *Components → Document card*). The six behavioural states below each resolve to one of them; the card is never in neither.

| State | Head | Body | Body mode | Foot |
|---|---|---|---|---|
| streaming prose | `writing · §N <Name>` | document prose in `{typography.doc-prose}` | prose | word count · section count · not-yet-written sections by name |
| revising | `revising · §N <Name>` | prose, updated in place | prose | unchanged — a revision advances nothing |
| quiet (dead air), or a run that writes no document | phase word if a feed states one, else path (or skill name) + elapsed only | **the run list** — steps and run notes in time order; see *The run list* and *Dead Air* | run-list | `0 words on disk · <phase> · autosave on` + named next sections for a run that writes a document; **none** for one that writes none |
| stopped / failed | `stopped` + the section reached | whatever was streamed, left as-is | whichever mode it was in when it stopped | unchanged |
| finished | `saved · just now · N sections`; dot `work` → `live`; caret removed | final prose | prose | — |
| dead (post-restart) | terminal state, **no elapsed ticking, no stop control** | as left | as left | as left |

A run in flight survives a **window reload** — main owns durable state and re-emits on reconnect (AD-7), so no card visual may depend on having witnessed earlier deltas. It does **not** survive an **app restart**: after a restart the transcript is present and the sessions are gone (AD-18). Every persona reads `idle`; every card renders dead; nothing is offered to resume.

### The run list

*Added 2026-10-09, from the screenshot (`mockups/chat-thread-reference.png`). Appearance: `DESIGN.md` → Components → Run step.*

In run-list mode the card's body is one list in time order, newest last, of two kinds of row.

| Row | Is | Source |
|---|---|---|
| **Step** | one tool call the persona made: a mark, what it did in a few words (`read story 5.6`, `write theme-audit.test`, `edit design/tokens.css`) and how long it took | **a new main-side event; none exists yet** (below) |
| **Run note** | a `.memlog.md` entry: time, kind tag, reason, unchanged (*Dead Air*) | `run:note` |

- **Marks.** A finished step is `✓`. The step in flight is the amber `work` dot with its pulse, and its elapsed reads `now`. A finished step's elapsed is the call's own duration (`0:03`). **No pending step is drawn:** no plan of the steps to come exists, and a list of invented future steps is a progress bar by another name. **[ASSUMPTION]** — a step whose `tool_result` is `is_error` takes `✕` in `red`, as a failed or stopped run does; no source says.
- **Interleaved.** A run note arrives between the steps it fell among, with its tag. This is the approved Dead Air feed with steps added, not a second feed.
- **No shimmer, no bar, no `n of m`.** The running step's pulse is the only motion. Under reduced motion it stops like every pulse, and `now` carries the liveness (*Accessibility Floor*).
- **Prose mode stays.** While document prose streams, the body is the prose. The steps and notes accrued before it stay above it in the same scroll container (*Dead Air → Mode transition*).
- **The register split holds, on a narrower footing. [ASSUMPTION — OPEN]** Steps are the harness's facts about tool calls and render in mono; notes render in sans; prose renders in mono. In prose mode a step row and a line of prose are both mono, so they are told apart by structure: a step is one short row with a mark and an elapsed column, prose is unbroken pre-wrapped lines. Do not give a step a sentence's length (*Typography → The register split*).
- **The source gap.** `src/shared/events.ts` has no event for a general tool step. The fold sees each call's id and name and each result's failure and emits nothing, and a step's label needs the call's target from its input. AD-20 forbids a step with no source. **This needs a new main-side event, handed to `bmad-architecture`; the list is not buildable until it exists, and until then the card keeps the run-note feed alone.**
- **Collapsed.** A finished run collapses to its one line, and the collapsed card's field set is unchanged (*Dead Air → The elsewhere case*).


### Progress, batch commit and revision

**The denominator is deleted.** The head reads `writing · §4 Functional Requirements` — no `of M`, anywhere. The plan is the foot's named list of not-yet-written sections. This departs from `ui-surfaces.md`, which documents `writing · §N of M` and `stopped · §N of M` on the rail row; **the memlog decision wins**, and the rail annotation loses its denominator too, for the same reason: a template's 0–9 spine expanded to **15** sections in one observed run, and a counter going 9 → 15 reads as a defect where a list gaining names reads as a list. Observed headings win, and a section the user has already seen is **never renumbered**.

| Event | What moves | Motion |
|---|---|---|
| `doc:section-opened` | head status becomes `writing · §N <Name>` | none |
| `doc:prose` | body grows in frame-sized bursts | growth only. Main coalesces deltas and commits accumulated text to one node per animation frame (AD-15), so **a per-character typewriter effect is not available** and must not be faked |
| `doc:committed` (1…15 sections) | every named section leaves the foot list | **none. No stagger, no sequential reveal.** The tool call is atomic and emits exactly one event; a staggered reveal would depict a sequence that never occurred, which AD-20 forbids. Fifteen names move in one frame |
| `tool_result` with `is_error: true` | **nothing** leaves the foot; the call that was rejected is named | none |
| revision `Edit` | head reads `revising · §N <Name>` | none. A revision re-parses sections but **never advances the counter**. 20 of 21 observed Fast-path writes were revision edits; labelling them `writing` is a claim the user can see is false |
| `run:finished` | head → `saved · just now · N sections`, dot `work` → `live`, caret removed | permitted — the state change is real |


### A turn in flight, in the thread

*Added 2026-10-08. Appearance: `DESIGN.md` → Components → Conversation turn.*

A persona can load, think and call tools for several seconds before its first word, and fall silent mid-turn while a tool runs. The thread says a turn is in flight for the whole of it, from the moment the turn begins until it ends, in a 1:1 and in the room. It says so with the parts the thread already has and with nothing that stands in for a word.

| Moment | 1:1 thread | Party thread |
|---|---|---|
| the turn begins | a **pending turn** at the foot: the persona's initials disc and head, the caret as the body, `working · 0s` under it | a **pending row** at the foot: the state line alone, counting from the user's send |
| the first words land | the words replace the lone caret; the caret moves to their tail and the state line stays under them | the speaker's live turn takes the caret and the state line; the cast card lights as it always has |
| a silence mid-turn (a tool call) | the caret stays at the tail of the last words, the state line under them, the counter ticking | the same, on the speaker's turn |
| the turn ends, fails or is stopped | the caret and the line go; the words are exactly what was said. A failure keeps its existing sysline | the same |
| the session opens (the greeting) | the pending turn until the greeting lands | the pending row, counted from the room's open |
| the window reloads mid-turn | drawn again from the hydrated state; no delta needs to have been witnessed | the same |

- **What drives it.** In a 1:1, the persona's **state as main reports it** (`persona:state` is `work`), and nothing the window decides for itself; the counter is from when main says the state began. In the room, the room's session being **busy**; the counter is from the user's last message into this room, else the room's open. The words of the turn are the persona's latest entry when it is no older than the turn.
- **Where it sits.** At the thread's foot, **above** any message of the user's still queued, which stays below it unchanged. With words, the caret and the line are on the entry those words are in.
- **The greeting is not paced.** A persona's opening greeting arrives from the CLI as one burst, and is drawn whole when it lands; the pending turn covers the wait before it. No burst is ever paced out.
- **Never a gate.** The composer stays enabled throughout, in both threads; a message typed meanwhile is queued as it always was (1:1) or sent with no gate (the room).
- **Never a stand-in.** No spinner, skeleton, typewriter or placeholder word (`thinking`, `typing`, `…`); the one word is `working`, the state's own, beside its counter. Under reduced motion the pulse stops, the caret stays on, and the counter carries liveness.

### Queued composer

A message typed during a run lands in the transcript **immediately**, in the user-turn treatment, dimmed, marked `queued · sends when John finishes`. It is **cancellable** — it is the user's own unsent message, not arbitration of anything on disk, so AD-12's no-arbitration rule does not apply.

It sends on `session:awaiting-turn`. On send the dim lifts and the marker is removed **in place**: the entry does not move, re-render or reappear lower in the thread. **[ASSUMPTION]** — in-place promotion is not specified; it follows directly from "appears immediately", since an entry that jumps would reproduce exactly the broken reading the treatment exists to prevent.

This answers the source's open question — *"does a queued composer read as honest, or as broken?"* — with the rule it implies: **a send must produce a visible transcript entry in the same frame.** An entry that appears immediately and is marked `queued` is honest; an entry that appears only once the run ends is not.

### Roster and install states

| State | Treatment |
|---|---|
| resolved | tiles render from `_bmad/config.toml` `[agents.*]` |
| resolver failure | **last good roster stays**, plus a named error. Never an empty roster, never silently stale. **[ASSUMPTION]** — the error line sits at the rail head of the Team half; no source places it |
| roster changed mid-use | tiles and skill buttons may change under the user. Re-resolution never touches a live session. The change lands in one frame; no arrival or removal animation |
| malformed menu entry (neither `skill` nor `prompt`) | a discovery error **surfaced to the user, never a silent no-op** (AD-9). Named in the harness register, identifying the entry `code` and what is missing. Never spoken by a persona. **[ASSUMPTION]** — placement in the skill row is unspecified |
| orphaned live session | the agent vanished from the install; the session keeps its transcript, its card and its **working stop and close controls** until the user closes it. No tile exists for it. **[ASSUMPTION]** — the close control sits in that session's chat header; no source places it |
| post-restart | transcript present, sessions gone |

### Preflight — launch

CAP-1 promises zero *configuration*, not zero *prerequisites*. Any failure is reported **naming the specific missing prerequisite and its remedy**, so the harness never opens to *"an empty room"* with no personas and no explanation, which reads as broken rather than as unconfigured (AD-17).

| # | Check | Failure names | Remedy named |
|---|---|---|---|
| 1 | `claude` on `PATH` and authenticated | `claude` is not on `PATH`, **or** it is present but not authenticated — two distinct messages | install the CLI · or run `claude` once to sign in |
| 2 | `uv` present, resolving Python 3.11+ | `uv` is missing, **or** `uv` resolves a Python below 3.11 — two distinct messages | install `uv` · or install a 3.11+ toolchain for it |
| 3 | the target project resolves at least one agent | needs its own explanation, below | install BMad **into this project**, or open a project that has it |

**Check 3 is the subtle one and must not read as "no agents found".** BMad *is* installed, `claude` works, and the room is still empty. The cause is scope: agents resolve under `--setting-sources project,local`, so a **user-scoped** BMad install — one living in the home directory rather than in this project — resolves nothing here. The message must say all four things: **what** the harness looked for (agents), **where** it looked (this project, under `--setting-sources project,local`), **why** a correctly installed BMad can still resolve no agents there, and **what would change that**. Anything shorter leaves the user staring at a correct install and a blank rail.

**Forbidden at launch:** any setup step, onboarding wizard, or "where are you in the process?" question. Pointing at a project root is the whole setup, and position and ownership are derived, never asked (AD-19). **The Welcome window is not one of these**: it asks one thing, which folder, it has no sequence and no second screen, it records no answer about the project, and what it says about the five personas is the same whichever project is chosen.

### Empty states

| Surface | Copy | Rule |
|---|---|---|
| Outputs half, fresh project | `no files under <folder> yet` with the watched path beneath it (`_bmad/` unless the output folder is another) | **states the situation and stops.** It reads as watching, not as broken. It must **not** suggest a next step, name a skill, or point at a persona (AD-21) |
| New session chat | an empty thread; a header reading `New session`; an empty composer with focus | *Added 2026-10-15.* **It states nothing: no line, hint, placeholder, greeting or suggestion** (AD-21). It is the one empty state that is a whole chat, and it is also where a window opens (*Sessions without a persona*) |
| Skill sessions group | — | *Added 2026-10-15.* **No empty state:** with no skill-first session the group and its heading are not rendered, as the recent list and the deferred party sections are not |
| Document card | — | **there is no empty card body.** See *Dead Air* |
| Subagent region (`system/task_progress`) | — | optional, not primary. It may be permanently empty on a given run; nothing may depend on it |
| Party side panel | — | the two deferred sections are **not rendered at all**, not even as empty states |

---

## Welcome

*Added 2026-10-08 from the welcome-screen mockups (`mockups/welcome-screen.html`, the options round, and `mockups/welcome-screen-chosen.html`, the one taken). Anatomy and tokens: `DESIGN.md` → Components → Welcome.*

Before this, the harness opened a native folder dialog the moment it started, and quit if the dialog was cancelled. The user met the product as an operating-system dialog and could not see what they were opening. The Welcome is the first thing the harness shows, and what it is for is one choice: **which project**.

### When it opens, and when it does not

| Moment | Behaviour |
|---|---|
| launch, no project path on the command line | the Welcome opens; no dialog opens |
| launch with a project path | **no Welcome** for the first window; the project opens as it does today. A path that is not a folder fails as it does today: a line on stderr and exit 1, no window and no dialog |
| the last project window closes | the Welcome opens (the old behaviour re-opened the dialog) |
| reactivated from the Dock with no window | the Welcome opens |
| a project window is open and another project is wanted | the Welcome is not reachable from a project window in v1: one project per window, and no project switcher. **[ASSUMPTION]** — it is reached by closing the window, as today |
| the Welcome window is closed | the app quits. **[ASSUMPTION]** — the old chooser quit on cancel; closing the Welcome is the same decision, now made by the window and not by a dialog |
| *Open project folder…* is cancelled in the native dialog | the user is back at the Welcome, unchanged. **Cancel no longer quits** |
| a project is chosen | its window opens and the Welcome closes in the same moment. The Welcome never stays open behind a project |

### The one action

**Open project folder…** opens the native macOS folder chooser (as today: *open a bmad project*, folders only, *create folder* allowed, so a new project folder is made there and not here). `⌘O` reaches the same action while the Welcome has focus. **[ASSUMPTION]** — no source names a shortcut; it is the macOS convention and it belongs to the Welcome's menu only, so no project window's menu changes.

A **dropped folder** opens as a chosen one does. Anything else dropped — a file, several items, a non-folder — opens nothing and says one line in the harness register, in the same place as the drop hint: `not a folder · <name>`. It is a fact, with no remedy attached, and it clears when the next thing is dropped or the next choice is made.

The Welcome opens with focus on the *Open project folder…* button.

### Recent

A list of the projects opened before, newest first, **at most eight**. **[ASSUMPTION]** — the number is not specified; eight fits the column without scrolling the lanes out of the window.

| Rule | Behaviour |
|---|---|
| what is recorded | a project's folder path and when its window opened, **by any route**, including a command-line path. Nothing else: no install state, no agent count, no branch |
| where | in harness bookkeeping under `userData`, never in a project (AD-1, NFR3). Only the path and the time |
| order | most recently opened first; a project opened again moves to the top and is not listed twice |
| a row opens | that project's window, exactly as a chosen folder does |
| folder gone | the row stays, shows `folder missing` where its age was, is announced as unavailable and does nothing when activated. It leaves the list only by being pushed off the end. **[ASSUMPTION]** — there is no *remove* or *clear recent* control in v1: it would be a settings surface for a list that ages out on its own |
| none yet | the **recent section is not rendered**: no label, no empty line. Same rule as the deferred party sections: an absent thing is not shown as an empty one |

**A row never says what is installed in the project.** To know, the harness would run a resolver for every row on every launch, and a count shown from an earlier launch could be false. What a project lacks is said once, by *Preflight*, after it is chosen.

### The team

Five cards under four lanes, in the order of the method: **analysis** (Mary), **planning** (John, Sally), **solutioning** (Winston), **implementation** (Amelia). Each shows the persona's initials disc (`{components.initials.sizeThread}`; amended 2026-10-15), name, title and one description (`DESIGN.md` has the table).

- **They are the five core personas** (FR78). They are read from no project, so the Welcome says nothing about what any project has installed — its meta line says only that *a project's own install can add more*.
- **The lanes say where a persona works in the method, not where the project is.** Nothing here reads the project's artifacts, marks a lane current, or orders by relevance. Pipeline position is derived, never asked and never shown (AD-19, FR10).
- **No lane, card or persona is highlighted, preselected or recommended** (AD-21). The order is the method's, and every card is the same.
- **The descriptions are the harness's words about a role**, in the harness's register, not persona speech (FR21): no first person, no quotation, no invitation. They describe; they never suggest a persona to start with.
- Cards are content. They are not controls, take no focus and open nothing. Choosing a persona happens in a project, in the rail.

### Copy

| Place | String |
|---|---|
| topbar | `no project open` |
| tagline | `a visual harness for bmad projects` |
| action | `open project folder…` · chord `⌘O` |
| drop zone | `drop a project folder here` |
| rejected drop | `not a folder · <name>` |
| missing recent | `folder missing` |
| theme line | `theme · system · light · dark` |
| team meta | `the five core personas, by phase of the method · a project's own install can add more` |

Lower case, mono for harness strings, `·` as the separator, no terminal punctuation — and the personas' descriptions are the one place in sans, because they are said, not stated (*Voice and Tone*, rule 4). Nothing on the Welcome tells the user what to do next: no *get started*, no *welcome back*, no *try opening…*.

### Accessibility

- **Keyboard:** the Welcome's tab stops are the *Open project folder…* button, the recent list and the theme line (three buttons, one tab stop, arrows between them, `Enter` or `Space` chooses). The recent list is one tab stop; arrows move between its rows, `Enter` opens. A missing row is skipped by `Enter`, not by the arrows, so the user can read why. The drop zone has no tab stop of its own because the button beside it is its keyboard equivalent.
- **The theme line:** the three words are buttons in one group; the current one carries `aria-pressed="true"` and is not a link. Choosing one changes the theme at once (*Theme*) and leaves focus where it is.
- **Live region:** the Welcome has its own one polite region (*Accessibility Floor → 4*). It announces `not a folder · <name>` once.
- **Focus:** on open, the button. After a cancelled dialog, the button again. Nothing moves focus when a recent row's folder turns out to be missing.
- **Motion:** none, so there is nothing for `prefers-reduced-motion` to disable.
- **The initials discs** stand beside each persona's name and title, so they are decorative: `aria-hidden`, no tab stop, no reveal (§5). *Amended 2026-10-15 **[ASSUMPTION]**: the cards are content and take no focus, so there is nothing for a disc to reveal on.*

### Banned on the Welcome

No tour, wizard, checklist, progress, *getting started* or *what's new*; no version number; no link out; no "start with…" or any recommended persona; no badge or count on a recent row; no *clear recent*; no sound; no animation. (The Welcome has a theme line and nothing else of settings: no preferences, no other option.)

---

## Theme

*Added 2026-10-08 from the light-theme mockups (`mockups/light-theme.html`, palette A; the palette was replaced on 2026-10-09 by the dark theme reversed, behaviour unchanged). Appearance and tokens: `DESIGN.md` → Colors → The light theme.*

The product was designed in dark. It now has a light twin, and the user chooses which.

### The choice

| Value | Meaning |
|---|---|
| **System** *(default)* | follows the macOS appearance, and **changes while the app is running** when the OS does (schedule, or the user switching it) |
| **Light** | light, whatever the OS says |
| **Dark** | dark, whatever the OS says |

One value, stored as one of `system`, `light`, `dark` in harness bookkeeping under `userData` (AD-1): never in a project, never beside a conversation. A missing, unreadable or unrecognised value is read as `system` and is not surfaced as an error. There is no per-project and no per-window theme.

### Where it lives

| Surface | Behaviour |
|---|---|
| **View ▸ Theme** | a submenu of three radio items — `System`, `Light`, `Dark` — with a check on the current one. In the application menu of **every** kind of window (project, document, Welcome). **No accelerator**: nothing in the product has a theme shortcut and none is added. **[ASSUMPTION]** — no source specifies one |
| **The Welcome's theme line** | `theme · system · light · dark` at the bottom edge, the same choice. It exists **only on the Welcome**: a project window has no theme control in its topbar, rail or composer (the topbar stays as it is) |

The topbar carries no theme control: it is the densest strip in the product, it already holds one switch and one control there is a rule worth keeping (a third, Board segment is proposed in the same switch: *Layout, chat and Board*).

### What changing it does

- **Applies at once, to every open window.** The shell, the document window and the Welcome all follow, in the same moment. A change never reloads a window and **never touches a session, a run, a transcript, a card, the rail or the scroll position**: it is a repaint.
- **No transition.** The colours change in one frame. No fade, no cross-dissolve, no animation of any kind (*Motion*, `DESIGN.md`).
- **No first-paint flash.** A window opens in the theme in force and is never painted in the other first. Windows are created hidden and shown when ready, so the theme is set before the first frame.
- **Native chrome agrees.** Menus, the folder chooser, scrollbars and form controls follow the same value, so no light dialog opens over a dark window.
- **The initials discs follow the theme.** Their ground, line and ink each have a dark and a light value (`{colors.initials-bg}`, `{colors.initials-line}`, `{colors.initials-ink}`); no image is drawn in either theme. *Amended 2026-10-15.*
- **Nothing is said.** No toast, no sysline, no announcement: the change is the whole feedback, and it is visible. The one live region stays for the things it already carries.
- **Not a next step.** No place says *try light mode* or marks a theme as recommended (AD-21).

### Boundaries

No per-persona, per-project or per-window theme; no schedule of the product's own (System is the schedule); no high-contrast variant; no third palette; no theme shortcut; no accent-colour choice; no `prefers-color-scheme` read anywhere in a stylesheet or component — the resolved theme comes from main.

---

## Following the thread

*Added 2026-10-08. Appearance: `DESIGN.md` → Components → Follow control. Mockup: `mockups/follow-the-thread.html`.*

Before this, a thread never moved by itself. A persona's text, a user turn, a document card or a room speaker's words grew the thread downward and the newest line fell out of view; the one scroll call the renderer had was the reveal of a run's card. The thread now follows what is being said, in a persona's conversation and in the party room alike, **without ever taking the page from a user who is reading**.

### Two states

| State | Meaning | How it is entered |
|---|---|---|
| **following** | the newest line is kept in view | the thread is at its bottom, which is within **one line (24px)** of it |
| **paused** | the thread keeps the user's place | the user scrolled up, by wheel, trackpad, keys or scrollbar, to farther than that |

*Following* is the resting state. There is no setting, no toggle and no remembered preference: the state is a fact about where the thread is scrolled.

### What follows

While following, anything that makes the thread longer keeps its bottom edge in view, **in the same frame as the growth and instantly**: a burst of a persona's prose, a user's turn, a sysline, a document card or its line, a decision block, a card returning from the pinned place to its time-ordered one, a room speaker's words. **No smooth scroll, no easing, no animation** (*Motion*, `DESIGN.md`: motion is information or it does not exist). A resize of the window keeps a following thread at its bottom.

### What pauses it

A user scroll that leaves the bottom, or a reveal: **a notification that scrolls to a run's card (FR94) pauses the thread**, because the user was taken somewhere that is not the bottom.

While paused, **nothing moves the thread**: not new text, not a new turn, not a card arriving or leaving, not the persona finishing. The lines the user is reading stay where they are. The thread keeps growing out of view below them.

### The way back

| The user | The thread |
|---|---|
| scrolls back to within a line of the bottom | resumes following; the control goes |
| presses `↓ latest` | scrolls to the bottom, resumes following, the control goes in the same frame; **focus moves to the composer** — the control is gone, and the composer is where the user continues. **[ASSUMPTION]** — no source places focus here |
| sends a message, in a persona's thread or in the room | scrolls to the bottom and resumes following. A send is always an intent to be at the end |

`↓ latest` is the one control. It is drawn only while the thread is paused and is one literal string, **with no count of what is below**. A count, a dot, *new*, *N unread* or any other measure of what was missed is an unread marker, which the product bans (*Banned everywhere*). It is also not the *jump to card* control Story 3.14 rules out: that was about moving to a document card, and this moves to the end of the thread.

### Where it lands

A thread **opens at its bottom and following**: when the window opens, on reload, when the user selects a persona, when the user switches between 1:1 and Party, and when the room opens. Nothing remembers a paused position across a switch. **[ASSUMPTION]** — no source asks for per-thread positions, and the user who left a persona mid-reread has left it.

### Other surfaces

- **The pinned card** (Story 3.14) is outside the thread's scroller and is untouched. When it returns to its place in the thread: a following thread keeps its bottom in view; a paused thread does not move (3.14's *the thread does not jump*).
- **The document card's own body** already follows the tail of its prose and is a separate scroller: it is unchanged.
- **At ≤1000px** the page, not the thread, scrolls (`DESIGN.md` → Responsive). The harness does not scroll the page for the user: following applies where the thread has a scroller of its own. **[ASSUMPTION]**
- **An unattended window** follows as well. A user who comes back to a run that finished meanwhile finds the bottom, not where they last looked.

### Accessibility

Following is not announced and is not a live region (the policy in *Accessibility Floor → 4* is unchanged; no role that implies a live region is added to the thread). The scroller uses the browser's own keyboard scrolling. `↓ latest` is a button with the visible text as its name.

### Banned here

No count, badge, dot, toast, sound, pulse or shadow on the control; no animated scroll; no preference to turn following off; no per-thread remembered position; no *new messages* line, divider or marker in the thread.

---

## Output folder

*Added 2026-10-08. Appearance: `DESIGN.md` → Components → Outputs head. Mockup: `mockups/output-folder.html`.*

**Two folders were one.** The code treated `_bmad/` as both the BMad **install** (`config.toml`, the resolver scripts) and the place BMad's **output** lands. They are different things: BMad's installer fixes the first, and its own configuration chooses the second (`output_folder`, and the `planning_artifacts` and `implementation_artifacts` that sit under it by default). This section is about the second. **Wherever this document says `_bmad/` of the rail, the document window, the empty state or the party summary, it means *the output folder*, which is `_bmad/` unless this section says otherwise.** The install, preflight and the resolvers stay at `_bmad/`.

### Which folder is watched

In order, the first that is usable:

| # | Source | Usable when |
|---|---|---|
| 1 | **the user's choice for this project**, stored by the harness | it is a folder inside the project, not the project folder itself, and it exists |
| 2 | **BMad's own `output_folder`**, from its resolved configuration (FR3: through its resolver, never by reading its files) | it names a folder inside the project that exists, not the project folder itself |
| 3 | `_bmad/` | always |

That is what keeps *pointing at a project is the whole setup* (FR1) true: **the folder is derived and never asked.** A project BMad installed with another output folder shows its files with no choice made. The choice is an **override**, offered and never prompted: no first-launch question, no banner suggesting a change (AD-19, FR9).

A resolver that fails or answers in the wrong shape leaves rule 2 unusable, and the rail uses `_bmad/`; the failure is already named by the install's own error (FR4), and this adds none.

### The head says it

The Outputs head shows the folder being watched and `change…` (`DESIGN.md`). One state line may sit beneath it, always a fact:

| State | Line | Rail |
|---|---|---|
| derived, or chosen and the same as BMad's | none | the folder |
| chosen, and different from BMad's | `bmad writes to · <BMad's folder>` | the chosen folder |
| a chosen folder that is gone | `<chosen> · folder missing` | BMad's folder (rule 2 or 3) |
| a choice just refused | `not changed · <reason>` | unchanged |

- **The difference is stated, not judged.** New work lands where BMad's configuration sends it, and the rail looks where the user pointed it. The line names the two places and stops: no *warning*, no colour, no *you should…* (AD-21).
- **A missing choice is remembered, not applied**, and not cleared. If the folder returns, the rail returns to it.
- **Refusals**, each said once, announced politely, cleared by the next choice: `not changed · outside this project`, `not changed · the project folder itself`, `not changed · inside .git`, `not changed · inside node_modules`.

### Choosing it

`change…` in the head and *File ▸ Output Folder…* open the same native folder chooser: title `choose the bmad output folder`, button `choose`, folders only, *create folder* allowed, **opening in the folder now watched**. *File ▸ Use BMad's Output Folder* forgets the project's choice and is dimmed while there is none. **A File menu is new in a project window**; it carries those two items and the OS's own *Close Window*, and neither has an accelerator.

The chooser may be pointed anywhere, so the **choice is checked before it is kept**: its real path must be inside the project's real path, so a symlink out of the project is refused as *outside this project*. A choice of the project folder, `.git` or `node_modules` (or anything inside them) is refused for the reasons above. A refused choice changes nothing.

### What happens when it changes

- **At once, in one frame.** The rail re-points: rows of the old folder leave and rows of the new one arrive, as when a roster changes mid-use (no arrival or removal animation). It is disk truth (AD-1); no row is kept for a file the rail no longer watches.
- **Nothing live is touched.** No session, run, transcript, card, scroll position or persona changes. A run in flight keeps its card whatever its file's folder.
- **Document windows already open keep their file** and keep reloading it. The boundary of what may be opened, the rule that every read stays inside the real path of the watched tree, moves to the new folder for everything opened afterwards.
- **The empty state** names the folder (`no files under <folder> yet`) and the full path beneath it.
- **A room's summary** is the one write the harness names: the ask, the destination in the room panel and the header button all follow the folder (`<folder>/party/<date>-<slug>.md`, *Write summary to <folder>*). The runtime still does the writing.
- **A persona's skill** writes where BMad's configuration says. The harness neither moves nor redirects it, and says nothing about it beyond the head's state line.

### Remembered for the project

One folder per project, stored by the harness under `userData` beside its other bookkeeping and keyed by the project's path (AD-1). **Never in the project**: not in `_bmad/custom/config.toml`, not in `config.user.toml`, not in a dotfile. The harness writes nothing into the project to remember anything. A stored value that is missing, unreadable or not a usable folder reads as *no choice* and is not surfaced as an error, except for the one that names a folder now gone (above). The project's recent entry and the output folder are separate records.

### Banned here

No prompt at open or at first run; no suggestion that the user should choose or change; no colour, icon or *warning* on the state line; no second watched folder; no folder outside the project; no folder per persona or per document type; no redirection of any skill's writes; no write into the project to record the choice.

---

## Resizing and folding

*Added 2026-10-08. Appearance: `DESIGN.md` → Components → Splitter, Folder heading. Prototype: `mockups/rail-resize-collapse.html`, which works: drag the edge, use the keys, fold a folder.*

### Three side panels, each its own width

The **Team sidebar** and the **rail** (1:1) and the **Room panel** (Party Mode) each have a splitter on their inner edge. *(Updated 2026-10-09: the 1:1 view's one rail became a sidebar on the left and the rail on the right; a stored rail width is read against the new range: inside 260–480px it is kept as stored, outside it reads as the default; nothing is migrated.)*

| | Default | Range | Keeps its neighbour at |
|---|---|---|---|
| Team sidebar | 244px | 200–400px | the chat column, 420px, given the rail's width |
| Rail (Outputs) | 300px | 260–480px | the chat column, 420px, given the sidebar's width |
| Room panel | 240px | 200–400px | the party column, 480px |

The two panels in the 1:1 view share one row with the chat column, so each one's maximum leaves the chat column its 420px given what the other takes: the sidebar leaves room for the rail's chosen width (or its default), the rail for the sidebar's width as shown. Dragging either to its maximum never leaves the chat column narrower than 420px.

- **A drag follows the pointer** a frame at a time: no easing, no snapping to presets, no inertia. Outside the range it holds at the limit. Releasing keeps the width.
- **Double-click, or `Enter` on the focused splitter, returns the panel to its default.** `←` grows a panel on the right (the rail, the Room panel) and `→` shrinks it, by 16px, or 64px with `Shift`; the Team sidebar, on the left, is the other way round, `→` grows it and `←` shrinks it; `Home` and `End` go to the minimum and the maximum.
- **The window shrinking** below what a width allows pulls the panel in to the maximum that now fits; it never overlaps its neighbour. The width the user chose is kept and returns when the window does.
- **At ≤1000px**, where the layout stacks (chat, sidebar, rail), there are no splitters and each panel takes the width of the column. **At ≤1180px** the Room panel is hidden and so is its splitter, as now (NFR27: no breakpoint is added).
- **Remembered per user**, not per project: up to three values, one for each panel, under `userData`. A value missing, unreadable or outside the range reads as the default, silently.
- **Resizing touches nothing live.** It is a layout change: no session, run, transcript, card, scroll position or follow state (*Following the thread*) is affected, apart from the line wrapping the new width gives.

### Folding the Outputs folders

Each directory heading in the Outputs half is a button that folds that directory's rows away.

- **Click, or `Enter`/`Space`, toggles it.** On a heading `←` folds and `→` unfolds. Focus stays on the heading, which is part of the list's one roving tab stop with the rows that are showing.
- **Folding is of that directory only.** The groups are flat, one per directory: folding `_bmad/` does not fold `_bmad/ux/`.
- **A live state is never folded out of sight.** While a directory is folded and a row under it is `changing` (the disk register, AD-2), its heading carries the amber dot with the pulse and the word `changing`, so a file being written is never hidden by a fold (AD-20: every indicator is driven by real state). When the file settles, the heading shows only its name. A run's *annotation* (owner, section) is not shown on a heading: it is a second register and is not merged (AD-2).
- **No count.** A folded folder shows no number of files, saved or unread.
- **Folded is not hidden from the system.** A file arriving in a folded folder does not unfold it, and does not move the user's focus or scroll; if it is changing, the heading says so. A folder emptied of files loses its heading as it does today.
- **Remembered per project.** The set of folded directories is stored under `userData`, keyed by the project's path, as project-relative directory paths. It follows the directory, not the output folder: choosing another output folder (*Output folder*) leaves the entries in place for paths that still exist, and an entry for a directory that is gone is ignored. Unreadable or unknown entries read as unfolded, silently.
- **No *collapse all* or *expand all*** in v1. **[ASSUMPTION]** — the prototype shows per-folder folding is enough for a rail with a handful of directories; add the pair if it stops being.

### Accessibility

A splitter is a `separator` that exposes its minimum, maximum and current value; a heading is a button with `aria-expanded` and `aria-controls`, so a fold is announced by the control itself and **neither is announced through the live region**. Both take the shared focus ring. Nothing here moves with motion, so there is nothing for `prefers-reduced-motion` to disable.

### Banned here

No animation of a width or a fold; no snap points or presets; no per-persona, per-project or per-window panel width; no count or badge on a folded folder; no unfold when something arrives; no *collapse all* in v1; no way to hide the rail or the Room panel altogether.

---

## Layout, chat and Board

*Added 2026-10-09. Appearance: `DESIGN.md` → *Proposed: layout, thread and Board anatomy*, and Components → Conversation turn, Initials, Chat header, Run step. Prototypes: `mockups/paperclip-layout-chat.html` and `mockups/paperclip-board.html`.*

**Where it comes from.** The direction is taken from the public description of Paperclip, an open-source orchestrator for teams of agents: its three-column board, its issue thread that renders runs and questions inline as one conversation, and its dashboard. Only public pages were read (the v2026.416.0 changelog, the docs home, the dashboard guide, the product pages); no screenshots, so no pixel was copied and nothing here depends on how Paperclip looks. The prototypes show more than is adopted below: **where a prototype and this section differ, this section wins.**

### The room: three columns

*Built 2026-10-09: the Team sidebar (with its state strip), the chat column and the rail holding the Outputs half. Built 2026-10-10: the Board view (see *The Board view*). The Inbox (deferred) and Sprint board rows and the Properties, Goal trace and Run sections are still proposed.*

| Column | Holds | Replaces |
|---|---|---|
| **Team sidebar**, left | a state strip, a row of its own carrying the Skill Session button, right-aligned (the *Sprint board* row it was drawn at the end of is not built in the code, and neither is the deferred *Inbox* row, which has no reserved slot), the persona tiles, and, only while one exists, the Skill sessions group (*Sessions without a persona*) | the Team half of the rail |
| **Chat column**, centre | the thread and the composer, as now | nothing |
| **Context panel**, right | *Properties*, *Goal trace*, *Outputs*, *Run* for the open conversation | the Outputs half of the rail |

- **Persona order is unchanged.** Tiles stay grouped by `module` and `team` and in config order (*Persona tile order*). They are **not** regrouped by state, and nothing is sorted by who needs attention: AD-21's no relevance sort and no highlighting hold. State is the dot each tile already has; an idle persona dims (`{opacity.idle}`), as it does now.
- **The state strip** is four plain counts of the tiles' own dot states, read from the same `states` map as the dots (AD-20), is never a badge and never counts anything unread. *Settled; amended 2026-10-15: **it counts personas only**, so it equals the head's `5 agents` and a skill seat is in no cell, as the Board's Agents panel counts personas only (a working skill session shows in its own row).* The cells are **working** (`work`), **idle** (`idle` and `live`, a persona with a session open and no turn in flight being idle), **error** (`error`) and **changed** (`note`, a file changed on disk). It takes no accent, fill or badge and is not announced; a persona the map holds nothing for counts as idle, and an empty roster reads four zeros.
- **The Inbox (deferred, not built; no row, no figure, no slot)** lists the open decision blocks across personas, newest first, so a question from one persona is not lost while the user talks to another. It shows **no count** on its row. A row opens that persona's thread at the decision. It lists nothing the harness invented: an empty list says `nothing open`. **[ASSUMPTION]** — needs a read across sessions' unanswered decision blocks; check the session model has one before building.
- **The context panel** shows facts about the open story and run, and nothing prescriptive. *Properties*: status, owner persona, current skill, branch. *Goal trace*: product, epic, story, read from `sprint-status.yaml`. *Outputs*: exactly the Outputs half as it is (*Output folder*, *Resizing and folding*), moved. *Run*: duration, tool calls, model. A field with no source is omitted, never shown empty.
- **Widths.** *Settled:* each side panel has its own splitter and range (*Resizing and folding*). Defaults: Team sidebar 244px (range 200–400px), right panel 300px (260–480px), the chat column kept at 420px between them; a stored rail width is read against the new range (kept inside 260–480px, the default outside it) and nothing is migrated. At ≤1000px the layout stacks, chat then sidebar then right panel, with no splitter; no breakpoint is added.

### The chat look, from the screenshot

*Added 2026-10-09 by the user's decision, from [`mockups/chat-thread-reference.png`](mockups/chat-thread-reference.png), Screen A of `mockups/paperclip-layout-chat.html`. Appearance: `DESIGN.md` → Components → Conversation turn, Initials, Chat header, Run step. It overrides the rulings named in the right-hand column, in the 1:1 thread and the party thread alike; **where the screenshot says nothing, the earlier ruling stands.***

| Decision | Replaces |
|---|---|
| **Initials in the chat.** A persona and you are each a round initials disc beside every turn and in the header. *(Widened 2026-10-15: the Team tiles, the cast cards and the Welcome are initials discs too.)* | the illustrated avatars of the chat, at their two retired sizes |
| **Flat rows.** A turn has no container, radius or padding box, and yours has no tinted ground or left rule. You and a persona are told apart by name and by a disc tinted for you alone | the turn container; `accent-wash` and `accent-edge` on a user turn |
| **Clock time on every turn**, after the role. Relative times stay rejected | the right-aligned time |
| **A list of steps in the run card**, with the run notes in the same list; prose mode stays for a run that writes a document | the run-note feed as the whole body |
| **No shimmer.** The running step carries the existing amber pulse | nothing: it confirms *Not adopted* |
| **`handed to <persona> · <skill>`** *(superseded 2026-10-15, Story 7.4: a switch writes nothing)* | `handed off · John → Amelia · picking up from PRD.md, epics.md` |
| **Header: disc, name, `title · story <id>`, the state pill, `Stop`** | an illustrated avatar and a second line of description |

- **The story reference** shows only when a story source exists (*The room: three columns*: `sprint-status.yaml` and the run). With none the header reads the title alone: a field with no source is omitted, never empty.
- **`Stop`** stops the turn in flight and the session stays (*Failure, Stopping and Contention → Stopping costs the turn, not the conversation*). It is plain: no cost on the control, no confirmation. **[ASSUMPTION — OPEN]** — the header's one control today is `close session`, which a turn that never ends needs. Taken here: while a turn is in flight the slot reads `Stop`, and otherwise `close session`, as built. The screenshot draws only the running state and does not settle it. The full card head keeps its own stop control (CAP-11, `run.stop`); both dispatch the same stop. **Also open:** a plain chat turn has no `runId`, and the contract has only `run.stop(runId)` and `session.close`, so a header `Stop` outside a run needs a new command or a narrower rule (handed to `bmad-architecture`). *Settled 2026-10-16: built by Story 3.19 (`turn.stop`); the header's one control reads `Stop` while a turn is in flight and `close session` otherwise, as taken here (Open item 1).*
- **A mention.** Built by Story 2.15 (AD-25). A handoff's typed `@name` is kept as `mention` on `turn.send` and on the stored record, and drawn as a chip (`{components.mention}`) before the sent text in your turn. The persona still receives only the text, and a handoff with no text after the name shows no turn, only the sysline. The chip is not a control.
- **The room's live turn.** **[ASSUMPTION — OPEN]** — the screenshot has no party thread, so the speaker's live turn keeps its accent edge and its live ground (`{colors.party-live-ground}`): the only turn row with either.
- **Still not adopted**, though the same prototype draws them: `4m ago`, the shimmer, and on Screen B the review gate, the follow-ups card and the per-message *Retry* (*Not adopted*). *(Amended 2026-10-15: the `/` skill list was struck from this line; Epic 7 reverses that refusal, and the list is Story 7.3's.)*
- **Supersedes, upstream (2026-10-09, widened 2026-10-15).** The `SPEC.md` capabilities and `ui-surfaces.md` lines about avatars in the chat no longer hold in the thread and header (2026-10-09), and no longer hold anywhere since 2026-10-15; the removal note under *Component Patterns* lists them. `SPEC.md`'s dark-theme-only assumption and `scope-tiers.md`'s deferred light theme were superseded earlier by *Theme*.


### The chat thread

The thread is one continuous conversation: the user's turns, the persona's words, its run, its questions, in time order, with no tab or panel between them. Most of this already exists (persona turns, syslines, run cards, decision blocks); what is new is below.

| Element | Behaviour |
|---|---|
| Turn head | initials disc, name, title, then the **clock time** (`HH:MM`), on one baseline. Relative times ("4m ago") are **not** adopted: a transcript restored on another day must read as it did live (`formatTurnTime`) |
| Activity line | the handoff sysline, reworded: `handed to <persona> · <skill>` (*Voice and Tone → The handoff sysline*; superseded by Story 7.4, which writes no line for a switch) |
| Run card | the existing card, inline in the thread. **Run-list mode** shows the run's steps and run notes in one time-ordered list; **prose mode** is unchanged for a run that writes a document (*State Patterns → The run list*, *Dead Air*). A finished run collapses to its one line, as it does when it is elsewhere |
| Thinking row | where the stream carries thinking text, **one collapsed row** above the persona's words that expands to it. It is the thinking the stream gave, never a placeholder: it does not appear for a turn with none, and it carries no word of its own before the turn ends (*A turn in flight*: no stand-in `thinking`) |
| Decision block | the existing block, restyled as a card: options with a key each (`1`–`9`), *Confirm*. It still sends the chosen option as the user's turn and then removes itself |
| Message actions | on hover **and on focus** of a turn: *Copy*, *Quote*, *Open document*. They are real buttons in the turn's tab order; hover alone reveals nothing a keyboard cannot reach |
| Composer | unchanged: `@<name>` hands off, `Enter` sends, `Shift+Enter` breaks the line |
| Keyboard hints | one quiet row under the composer: `?` opens the shortcut cheatsheet (a window, not a palette); `g` then `b` / `i` / `c` go to the Board / Inbox (deferred) / composer; `j` and `k` move between turns. **[ASSUMPTION]** — the chords are this document's proposal; none is binding until *Keyboard reach* lists it |

### The chat's markdown

*Added 2026-10-16 by the Story 7.6 record, for what Story 7.2 built (FR130; appearance: `DESIGN.md` → Components → Conversation turn → *Markdown in a persona's turn*).* A persona writes markdown, and the chat reads it so, through the one pipeline the document window uses and no other.

| | Rule |
|---|---|
| What is rendered | a **completed** turn of a persona, in the thread and in the room alike, and of a skill in a skill-first session: headings, emphasis, lists, quotes, code and code blocks, tables, and a requirement id as the document window shows it |
| What stays plain text | **your own turn**, a turn **in flight** (its words and the caret, until it ends), a sysline, a decision block's words, a run card's prose and a step label. Where the pipeline gives nothing back for words that are not blank, the turn is plain text and never an empty row |
| When | **streaming, then once.** The pipeline is not run for a turn in flight; when it ends the words are replaced by the markdown in the same row, in one render, with no animation, and the caret and state line go. A turn read back from a stored transcript is rendered |
| Inert | links, images and raw HTML are shown as the text they were. No `<a>`, `<img>`, `<script>`, `<style>`, frame, `href`, `src`, event handler or `style` attribute reaches the page, and a click inside a turn goes nowhere |
| One path | markdown-it with HTML off, then the allow-listed DOMPurify pass, and the one place in the renderer that sets inner HTML. There is no second pipeline and nothing else sets it |
| Not a document | the turn keeps the chat's own type and measure and is never the document window's page: no heading is larger than the words, and a table scrolls inside the turn |
| Audited | Story 7.6 runs the Story 1.12 hostile fixture through a persona's turn, the room's and a skill's under the real sanitiser, and counts the places that set inner HTML at one |

### The Board view

A read-only view of where the work stands, reached from the view switch or `g b`. It is **disk truth** (AD-1): it reads `sprint-status.yaml` and the sessions and writes nothing, so it offers no drag, no status control and no *New story* button. A status changes when a skill changes it.

| Region | Shows |
|---|---|
| Overview | **two** plain figures, built so: **agents running** (of the roster) and **stories in progress**. There is no third: **decisions open** belongs to the deferred Inbox and has neither a cell nor a reserved slot |
| Board | one column per BMad status in the file's own words: `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`. An empty column says `no stories`. A card is the story id and its title and nothing else: the owner and the run's elapsed on a card were Story 6.8, **cut 2026-10-10** (no run-to-story rule exists), so no card carries an owner; a persona's run is on its Agents row. *Amended 2026-10-15 (Story 7.1):* a card whose story has a file is a native button that opens that file in the document window; a card with none is exactly the text above, with no handler or tab stop (*A card or row that opens its file*) |
| Epics | one row per epic: its title and `n of m stories done` in words, with one thin decorative track (`aria-hidden`, a filled span over an empty one) beside them; an epic with no stories says `no stories` and draws no track. *Amended 2026-10-15 (Story 7.1):* a row whose epic has a context file is a native button that opens it; a row with none is text |
| Agents | one row per persona: its state, what it is on and the run's elapsed time; an idle persona dims |
| Recent activity | what the personas did (run started, finished, stopped or failed), newest first, with each event's absolute time; built from the window's run entries. A question asked is not an event here. *Amended 2026-10-15:* a skill-first run is a row too, with the skill's name in the persona's place (*Sessions without a persona → Recent activity*) |

- **A story's owner (cut 2026-10-10 with Story 6.8; FR123 amended).** It is the persona of the run that is or was last on it; a story with no run has none and shows none. **[ASSUMPTION]** — `sprint-status.yaml` carries no owner, so this is derived from run history and must be confirmed against what the session store keeps.
- **A card or row that opens its file (Story 7.1, amended 2026-10-15).** Main finds each file from a listing of `implementation-artifacts/` and the renderer only passes it on. A story's file is the **one** `spec-<epic>-<story>-*.md` there, matched by number and never by building a name from the sprint key; none, or several, is no file. An epic's file is `epic-<n>-context.md` and nothing else (a retrospective is never an epic's). Activating a card or row opens the file in the document window, with its title bar and three escapes unchanged, and when the window closes focus returns to the card or row that opened it (the Outputs rail does not take it). **Only a card or row with a file is a control.** It is a native `<button>`: in the tab order, the shared focus ring, a pointer, `Enter`/`Space` activate it, and it carries **no icon, count, path, hover reveal or colour of its own**. A card or row with no file, an `others` row, a column, a figure and a retrospective stay plain text, and **nothing says why** a card is not openable. The Board still writes nothing.
- **No money.** A *spend* card, per-persona cost and a budget are **not adopted**: nothing in the harness's data source carries cost, and a figure with no source is the one thing AD-20 forbids. Revisit if the runs begin to report it.
- **No bar that carries the figure.** No story card, and no epic row, draws a progress bar, meter or percentage: bars imply steady incremental advance (*Banned everywhere*). *Settled 2026-10-10, by a design audit that reversed the first ruling:* an epic row may carry one decorative track, hidden from readers, which only repeats the words; the words are the one place the figure is stated, and no `<progress>`, `<meter>`, `role="progressbar"` or `%` is ever drawn.
- **Reading, not steering.** The Board never recommends a next story, highlights the one to do, or orders by priority. Within a column the order is the file's.

### Not adopted

Each is something Paperclip does or the prototypes drew that this product refuses; the reason is the rule it would break.

| Not adopted | Because |
|---|---|
| `/` in the composer listing skills | AD-21: no launcher under another name; skills are the current persona's buttons only. **Reversed 2026-10-15 by Epic 7 (FR30 as amended):** the list is Story 7.3's and is built (*Component Patterns → `/` list, in detail*), and a `/<name>` first message in the New session chat starts a session (*Sessions without a persona*). The reason above stands for everything else: no other `/` surface, no button, menu, tile or shortcut that lists or starts a skill |
| *Review gate* card with *Approve* / *Request changes*, and a *Suggested follow-ups* card | the harness has no approval state, and both are recommended next actions (*Banned everywhere*) |
| A count on the Inbox row, a *needs you* group of tiles, a *Needs you* figure | badges, unread counts and relevance sorting are banned |
| A shimmer on the running step | the motion inventory is closed at five declarations (UX-DR12); the running step carries the existing amber pulse dot |
| A step bar on a run card, a bar on a story, a meter or a percentage anywhere | no progress bars implying steady advance. The epic row's one decorative, `aria-hidden` track is the single built exception (*The Board view*) |
| Relative timestamps | a restored transcript must read the same as it did live |
| *Retry* in the message actions | a retry is a new turn the user sends; the harness has no retry semantic |
| Dropping a file onto the composer | no attachment path exists in the session |
| Drag to move a story, *New story* | the Board is read-only (AD-1) |

### Accessibility

The view switch gains a third segment and stays one control in the roving order. Each side panel's splitter and the Inbox rows follow *Resizing and folding* and *Keyboard reach*: real buttons, the shared focus ring, no announcement of a drag. The Inbox is a list; the Board's columns are lists under their status headings, and a card is text unless its story has a file: then it is one native button, and so is an epic row with a context file (Story 7.1, amended 2026-10-15; *A card or row that opens its file*). A card or row with no file has no button, handler or tab stop (a card opening its owner's thread was Story 6.8, cut). The state strip and the Board's figures are text and are not announced through the live region (*Live-region policy* is unchanged).

### Banned here

No count, badge or highlight on the Inbox, a tile or a Board figure; no regrouping of tiles by state; no progress bar; no spend or budget until a source exists; no editing affordance on the Board and no control on a card *except, amended 2026-10-15 (Story 7.1), the one native button on a card or epic row that has a file, which opens that file and does nothing else: no icon, count, path, hover reveal or colour of its own, and no control at all on a card or row with none*; no Inbox figure or slot; no recommended next story; no skill list in the composer and no `/` command *beyond Story 7.3's list and the first-message rule of the New session chat (amended 2026-10-15)*.

---

## Dead Air

[`mockups/document-card-dead-air.html`](mockups/document-card-dead-air.html) — the three treatments compared, the approved Option A among them, plus the same run seen from the collapsed card and the rail. Where it and this spine disagree, **this spine wins**.


### Option A — the run-note feed becomes the card body (approved)

**The card never has an empty body. It has two modes, and both are content.** When document prose is not streaming, the body renders the **run-note feed**. That is the ruling; the evidence for it follows.

**Amended 2026-10-09.** The body's second mode now carries the persona's tool steps as well as the notes, in one list: *State Patterns → The run list*. Everything below about the notes, the register split and the collapsed card holds; the prose mode is unchanged.

### The evidence

**The hardest problem in the product.** In a Fast-path `bmad-prd` run the whole document lands as a **single 68,394-byte write roughly 8.5 minutes in**. For those eight and a half minutes *nothing is on disk*: the rail row is genuinely `not yet written`, and the card is the only evidence of life. The main thread is also silent through the parallel-subagent windows — Discovery research and the Finalize reviewer gate — where it emits only `system/task_progress`, **which is not guaranteed on any given run**.

`.memlog.md` is therefore **the dependable feed, not a fallback** (AD-6). It appends entry by entry with each decision *and its reason*. The persona stays `work` throughout, because the work is genuinely still running.

**No spinner is permitted at any point** — CAP-5. This includes a placeholder sentence: an empty body reading *"nothing written yet — §2 opens when research returns"* is a spinner wearing a sentence, which is the exact failure the constraint exists to prevent.

### B and C, rejected

Option B (a separate reasoning band with an empty prose body) was rejected for the placeholder-sentence reason above. Option C (foot-anchored reasons) was rejected because the foot is the quietest tier in the product and putting the run's most interesting content there inverts the hierarchy.

### The register split is the mechanism

`doc:prose` and `run:note` are routed to separate destinations on purpose (AD-3) and must never be confused. Once they share one box, the **only** thing keeping them distinct is the typeface register split: **document prose in `{typography.doc-prose}` (mono), run notes in `{typography.body-ui}` (sans)**. It is stated in full, with its reasoning, in `DESIGN.md` → *Typography → The register split*; it is load-bearing for AD-3's routing guarantee and must not be weakened by any later change that brings the two registers closer together.

### Run-note anatomy — the semantics

A run note carries three slots: the entry's **time**, its **kind**, and the **reason** — the decision *and the reason it was made*, with the load-bearing clause carrying the emphasis. Entries stack in time order, newest last. The anatomy itself — grid, registers, tabular figures, tag colours — is `DESIGN.md` → *Components → Run note*.

This is where *"you watch the why instead of being told it"* is actually delivered, and it is what makes the driest box in any ADR the most interesting thing on screen.

### The four kind tags

Written `kind:…` throughout, because `note` also names a colour token and a status-dot state. Meaning only; the tag treatments are `DESIGN.md`'s.

| Tag | What it means |
|---|---|
| `kind:decision` | something was settled. The product's positive event, and the only kind that carries the accent |
| `kind:assumption` | something was taken as true without confirmation |
| `kind:note` | neutral — anything that is neither of the above. **`kind:note` is the neutral tag and must not use `{colors.note}`**, which belongs to the status dot |
| `kind:open` | an unresolved question. **Friction, not failure** — never `{colors.red}`, which is reserved for a failed or stopped run |

### Head and foot during dead air

The head keeps the file path, the elapsed time and a working stop control. The phase word (`researching`) is shown **only when a feed actually states it**; `system/task_progress` is not guaranteed, and AD-20 forbids an indicator that is not driven by real state. **[ASSUMPTION]** — when no phase feed exists the head degrades to path + elapsed + stop, and the body's run-note feed is the entire report; no source specifies the degraded head. **[ASSUMPTION]** — `reviewing` is proposed as the Finalize reviewer gate's phase word, by symmetry with the approved `researching`.

The foot reads the truth: `0 words on disk · <phase> · autosave on`, plus the named next sections. **`0 words on disk` is the honest form** and must not be softened.

### Mode transition

**[ASSUMPTION]** — when prose resumes, the body renders prose and the run notes and steps accrued during the quiet window remain above it in the same scroll container, in time order. The register split keeps them distinct. No source specifies what happens to the accrued entries; discarding them would throw away the run's only record of its own reasoning.

### The elsewhere case — the collapsed card

Option A only pays out if you are looking at the card. The collapsed form is what reaches a user in another window, and it carries a **changed field set**:

| | Field |
|---|---|
| 1 | persona |
| 2 | **the last run note's reason** |
| 3 | elapsed |
| 4 | stop |

**This is a deliberate departure from `ui-surfaces.md`,** which documents `persona · section · elapsed · stop`. The last reason **replaces** the section name; it does not sit beside it. Two justifications: the section is already carried by the rail row, so repeating it spends the line on a duplicate; and a one-line card cannot hold five fields without becoming a paragraph. It follows directly from the Option A decision — if the run-note feed is the point, the collapsed form should carry it.

The four collapsed-card fields (`ui-surfaces.md`, with CAP-5) are preserved, **including a working stop control** (CAP-11).

**[ASSUMPTION]** — the reason truncates to one line with the full entry available in the expanded card; no source specifies truncation. **[ASSUMPTION]** — before the first `run:note` arrives, field 2 falls back to the section name.

---

## Failure, Stopping and Contention

### Stopping costs the turn, not the conversation

Settled by Story 1.1 (`_bmad/spikes/spike-stop-semantics.md`; `execution-model.md` *Stop and failure*): an in-band interrupt written to the session's stdin halts the turn and keeps the session, while `SIGINT` ends it and is reserved for ending a session. The binding stance holds regardless: **if stopping ever costs more than the turn, the trade is stated to the user, never hidden.**

| | Stop (interrupt acknowledged) | Interrupt not acknowledged |
|---|---|---|
| condition | the run ends, the persona stays to explain | the harness falls back to ending the session |
| full card head | a plain control reading `stop`. **No confirmation.** | the same `stop`; the outcome is stated after the fact in the harness's own register |
| collapsed line | `stop` | `stop` |
| after pressing | run terminates; the persona delivers what got done and what broke | the session ends; the transcript remains; no persona voice |

**In neither case is the cost in a modal.** A modal is the harness arbitrating, which AD-12 forbids as a posture, and it hides the cost until the user has already committed to looking. A cost, where one exists, sits **on the control, before it is pressed** — the only placement where it can change the decision.

The turn's `result` row arrives within milliseconds of the interrupt (3-6ms measured, n=4), so there is no "stopping…" transitional state; the card reaches its terminal state directly on that row. A transitional state at that duration would be a spinner with a 6ms life.

### On stop or failure

- The card switches to the `error` state and **names the section reached**.
- **The file is left byte-for-byte as written — never reverted, never patched, never restored.** A stopped or failed run's partial file already *is* the last successful write, so there is nothing to revert and nothing is offered.
- The in-flight `tool_result` returns `is_error: true` naming the call that was rejected — this is how the rail knows which section did **not** land. Since sections only leave the foot on `doc:committed`, **a rejected 15-section batch never appeared as committed**; nothing un-renders.
- The rail row annotation becomes `stopped`. The disk `state` is unchanged — the watcher never lies about what is on disk.
- The persona tile goes `error`. **No error text on the tile.**
- **The persona picks it up in the conversation, in its own voice**: what got done, what broke, and an offer to resume. AD-18 keeps the session alive precisely so the harness never has to speak in a persona's name — the fake personhood the spec names as a trust liability.

### Error envelope

Errors arrive as `{ code, message, detail? }` with a stable `code`. **Raw stderr never reaches the renderer.** `message` is what is shown; `detail` sits behind a disclosure control. No stack traces, ever — the envelope's shape is a progressive-disclosure shape and should be used as one.

### Contention

Contention is **reported, never prevented and never resolved** (AD-12). The trigger is real: `bmad-correct-course` touches the PRD, epics, architecture and UX documents at once while another persona is running.

- The rail row annotation names the contention and both owners.
- **The filesystem arbitrates and last writer wins.** The harness never locks, reverts, patches or restores.
- There is **no dialog** offering to resolve, merge, choose or undo. There is no command in the bridge for editing, reverting, resolving contention or navigating a pipeline. **The absence is the design.**

---

## Run Completion When Unattended

**This section is new. No source specifies it.** Nothing in `SPEC.md`, `ui-surfaces.md`, `scope-tiers.md` or `ARCHITECTURE-SPINE.md` says what happens when a run finishes while the app is unfocused — and with ~12-minute runs and a user who is deliberately elsewhere, there is otherwise **no mechanism that reports completion at all**.

The memlog resolves the class of the answer: **a completion signal is STATE, which AD-20 permits, not GUIDANCE, which AD-21 forbids.** Everything below is built on that distinction and marked accordingly.

| Trigger | Condition | Treatment |
|---|---|---|
| `run:finished` | the window is **unfocused** at the moment of the event | one native macOS notification: the persona's name, the outcome, the file and the section count |
| `run:stopped` | window unfocused | same shape, outcome `stopped`, naming the section reached |
| `run:failed` | window unfocused | same shape, outcome `failed`. **The notification is the alert; the explanation stays in the conversation** in the persona's own voice (CAP-12, AD-20) |
| any terminal event | window **focused** | **nothing.** The card and the rail already report it; a notification would be a second source of truth |
| everything else | always | **nothing.** No notification for section commits, run notes, rail changes, party turns, queued sends, or roster changes |

**Rules**

1. **No Dock badge, ever.** AD-21 forbids badging, and the brainstorm explicitly killed unread badges and the RPG quest marker — the clearest gamification aversion in the whole record.
2. **Silent.** No audio anywhere in the product, and this is the one place a sound would be tempting.
3. **State, never guidance.** `John · PRD.md · finished · 15 sections` — not "Ready for your review", not "Next: create epics".
4. Activating a notification raises the window and scrolls the thread to that run's card. **It does not switch persona, open a document window, or start anything.** **[ASSUMPTION]**
5. One notification per terminal event. Concurrent sessions each produce their own; there is no digest and no coalescing. **[ASSUMPTION]**
6. If macOS notification permission is refused or ungranted, nothing is shown and nothing is asked a second time. Completion is still reported by the surfaces that always report it. **[ASSUMPTION]**
7. Nothing survives quitting the app — sessions are not held across restarts (AD-18), so there is no queued or deferred notification.

---

## Party Mode

**v1 ships the Room panel only.**

The mockup designs three side-panel sections; `scope-tiers.md` defers **two** of them — *Open disagreements* and *Decisions so far* — for want of a data source. **`scope-tiers.md` wins.** Neither is **rendered — not even as an empty state.** `bmad-party-mode` emits prose and is explicitly instructed never to produce summaries or takeaways, so nothing in those sections can be populated today. **Nothing renders that cannot be populated.** (*Pause room* is a separate cut, and a lifecycle one rather than a data one — see the *Lifecycle* row below.)

The same ruling cuts the transcript's `disagrees` / `evidence` tags and quoted-turn references, which are deferred from CAP-9 for the same missing source. A v1 party turn is **initials disc + name + role + clock time + the persona's words**, and nothing else. This is the honest form and it is also the safer one: a tag would let a contentless disagreement read as substantive, which is exactly the trust liability *Voice and Tone* rule 5 exists to prevent. The disagreement's evidence has to be in the persona's own text or it is not there at all.

AD-14 binds a `288px` party side panel as a literal. **That constant is superseded for v1** by the Room-only decision; `DESIGN.md` states the new width explicitly (`{spacing.party-side}`), because the old value is an architecture invariant and cannot be silently narrowed.

| Element | Behaviour |
|---|---|
| Cast chooser | on opening, the user chooses the room; defaults to the five core personas |
| Cast | every chosen persona's card, with its initials disc (`{components.initials.sizeThread}`; amended 2026-10-15), stays **permanently visible**. Presence is expressed by **dimming, never removal**. The current speaker's card is lit with `{colors.cast-speaking-border}` |
| Header | topic · participant count · turn counter · elapsed · *Write summary to `_bmad/`* |
| Transcript | initials disc + name + role + clock time per turn. No tags, no quote-back chrome |
| *Room* section | topic, who opened it and when, context documents in scope, destination `_bmad/party/<date>-<topic>.md` |
| Turn gate | **none.** The user types at any point; a message interrupts the current speaker |
| Session identity | a party session has a `sessionId` and **no `agentId`**. It gets no persona tile, and its rail row shows **the room** as owner |
| Lifecycle | party has **stop**, not pause. *Pause room* is a lifecycle state neither CAP-11 nor the session model models |

---

## Sessions without a persona

*Added 2026-10-15, from the Story 7.5 update (memlog: "UPDATE 2026-10-15 for Story 7.5"; epic: Story 7.5, with Stories 7.3 and 7.4 as dependencies and UX-DR53). Appearance: `DESIGN.md` → Components → `{components.skill-session-button}`, `{components.skill-seat}`, `{components.persona-tile}`, `{components.initials}` (the skill variant) and `{components.chat-header}` (the skill variant). Mocks: [`mockups/skill-session-entry.html`](mockups/skill-session-entry.html) (the button, the seats, the pressed state), [`mockups/new-session-landing.html`](mockups/new-session-landing.html) (the New session chat, at the two moments it appears) and [`mockups/skill-session-entry-options.html`](mockups/skill-session-entry-options.html) (the record of the comparison; option A, the entry as a row among the tiles, was rejected).*

Until now every chat had a persona in it, and the shell always had one current. Epic 7 adds a chat with **nobody** in it, in which a skill that is not a persona can be run by name, and which the shell now rests on whenever no persona is current. Three pieces carry it: a button that opens that chat, the chat itself, and the seat a session started from it takes in the Team sidebar.

**What this section does not design.** Story 7.4's live dot and `close session` end, which is referenced where it meets this section and nowhere specified here. Story 7.3's `/` list, which this section once left open, is designed under *Component Patterns → `/` list, in detail*; it is given to a persona's composer, and *settled 2026-10-16 (Story 7.5)* to this chat's composer as well, since typing a skill is this chat's one job; the room's and a skill-first session's composers have none.

### The Skill Session button

| | Rule |
|---|---|
| Where | at the right end of the same row as *Sprint board* in the Team sidebar. It is in the Team sidebar only, so it is not on screen in Party or the Board. *Built 2026-10-16 (Story 7.5): the `Sprint board` row is not built in the code (the Board is a topbar view), so the button has a row of its own in the Team half, between the strip and the tiles, right-aligned, and the row carries the button alone. The `Sprint board` label and its `g b` hint stay unbuilt; building that row is separate work, and the button moves into it when it is.* |
| Label | `Skill Session`. No icon, no count, no accent fill, no tooltip |
| Control | a native `<button>` with `aria-pressed`; the same ghost control as the header's `Stop`. Appearance and the pressed look: `{components.skill-session-button}` |
| Not pressed | the empty chat is not the chat in view: a persona's thread, a skill session, or any state before the first opening |
| **Pressed** | **the empty chat is open.** Nothing else presses it: a skill session in view leaves it unpressed, and it does not light for a working skill session |
| Click, not pressed | brings the chat in view: **the kept empty chat, with whatever text was half-typed in it, when there is one**; a fresh empty chat when there is none (it was sent, or the window has just opened). Presses the button and puts focus in the composer. No persona tile is current while it is open |
| Click, pressed | **reuses** the open empty chat. Nothing new opens; focus goes to the composer **[ASSUMPTION]** |
| Never | disabled, badged or counted. There is no cap on skill sessions, so there is no state in which it could not open a chat |

**It is an entry to a chat, not a launcher.** It lists no skill, names no skill and starts none; what is typed in the chat it opens decides what happens, and Story 7.3's list is the one place skills are listed (*Banned everywhere*, amended).

### The New session chat

One surface, which is both the **empty chat** (what the button opens) and the **landing** (what the window rests on when no persona is current). There is no separate empty design and no state line.

| Part | Rule |
|---|---|
| Header | `New session`, with a slash disc at `{components.initials.sizeHeader}` (`{components.chat-header}`, skill variant). **No status pill, no `Stop`, no `close session`, no close control of any kind**, no title, no story reference |
| Thread | **shows nothing.** No line, greeting, hint, example or empty-state copy |
| Composer | empty, with focus, **no placeholder**, and a hidden accessible name `message`. Enter, Shift+Enter and queueing behave as everywhere. No skill row is built **[ASSUMPTION]**: a skill row comes from a persona's menu and this chat has none. *Settled 2026-10-16 (Story 7.5): its composer is given Story 7.3's `/` list.* |
| The sidebar | no tile is current and none carries `aria-current`; the pressed button and the header are the only marks of where you are. Idle tiles still dim |
| What it holds | nothing is recorded or stored for it: it exists in the open window only, and its half-typed text goes with it. It is **not** a session and has no process; it is not listed in the sidebar, and is reached by the button alone |

**When it appears**

| Moment | Behaviour |
|---|---|
| A window opens | the window rests on this chat, **in place of the earlier fallback to the first persona** (the order of the resolved roster no longer picks a tile). The button is pressed. The Skill sessions group is there only for skill sessions kept from an earlier launch, which read `ended` (below); with none, there is no group (`new-session-landing.html`, first frame) |
| After the user ends the skill session they are viewing | the window lands here, not on a persona's thread. The other seats and every other skill session are untouched. Focus goes to the composer. Where the window lands after a *persona's* seat is ended is Story 7.4's |
| The Skill Session button is pressed | the chat comes into view: the kept one, or a fresh one when none is kept (above) |

**Leaving it, and keeping it (decided 2026-10-15).** Nothing distracts the chat. Clicking a persona tile or a skill seat, or switching to Party or the Board, **leaves it as it is**: it is kept in the background with any half-typed text, the button un-presses while another chat is in view, and pressing the button returns to the same chat. There is **one** kept empty chat per window. It ends when its text is sent (a valid first message makes it a skill session, or turns the window to a persona's seat or the room, and the next press opens a fresh one) or when the window closes; there is **no close control on it**. It is never ended by the harness for being left alone, and a reload of the window opens a fresh one like any other launch.

A reload of the window opens it afresh like any other launch.

### The first message

The first message is read in main against the install's list (Story 7.3); the renderer sends the text and nothing else, and decides nothing about what a name means.

| The user sends | What happens |
|---|---|
| `/<name> …` where `<name>` is an installed skill, and not a persona's or the room's | **a skill-first session starts.** The message is drawn as the user's turn, as typed; the header changes from `New session` to the skill's name; the slash disc stays; the seat appears in the Skill sessions group; the button un-presses, because the chat in view is now that session and the next press opens a fresh empty chat |
| `/bmad-agent-*` | the window **turns to that persona's seat** (Story 7.4: a live seat resumes, one not live opens on first use) and no skill-first session starts. The text after the name, if any, is sent as the turn in that seat. The empty chat is spent: no seat, no line, no header of its own |
| `/bmad-party-mode` | the window turns to **the room**, as the room opens today, and no skill-first session starts. The text after the name, if any, is sent as the turn in the room. The empty chat is spent |
| anything else, including text with no `/`, and `@<name>` as a first word (nothing is handed off from here) | **nothing starts.** One harness line in the thread, `no skill named <word>`, in one frame; no persona answers; **no user turn is drawn**; the unsent text **stays in the composer** |

- **The words.** `<word>` is the first word as typed, up to the first space, **without a leading slash and in the case typed**; a skill matches only when the name is exact: `hello there` gives `no skill named hello`. Lower case, mono, no full stop, in the existing sysline style (`{components.sysline}`), never attributed to a persona or a skill. **No suggestion follows it**: it does not list skills, name one, or say what to type (*Voice and Tone*, rule 1). It is announced once, politely (*Accessibility*).
- **What stays.** The chat is still the New session chat after a refusal: the button stays pressed, the header still reads `New session`, focus stays in the composer. A second refusal adds a second line, in order, as syslines do **[ASSUMPTION]**.
- **`/` as the first character** of a persona's composer opens Story 7.3's list above it (*Component Patterns → `/` list, in detail*). *Settled 2026-10-16 (Story 7.5): this chat's own composer is given that list, as the chat whose only job is typing a skill; the list stays the only place skills are listed, and no skill row is built.*
- **Typed in a persona's composer**, a `/<name>` is sent as it was before: it starts no session and draws no run card (Story 7.3). Only this chat starts a session from a name.
- **`@<name>`.** As a first word, or anywhere in a skill-first session's composer, it is not read as an address here: nothing is handed off from this chat, and no persona is inferred from what is typed. As a first word it reads as any other word that names no skill, `no skill named @<name>`. *(Decided 2026-10-15; the epic's boundary stands.)*

### A skill-first session

The skill's own kind of chat. It is never a persona's and never the room, and the thread never presents it as either.

| Part | Rule |
|---|---|
| Header | a slash disc at `{components.initials.sizeHeader}`, the **skill's name in `name` mono**, the status pill, then **`Stop` while a turn is in flight and `close session` otherwise** (Open item 1 holds here as everywhere; the end is Story 7.4's). **No title and no story reference**: the skill has no role and no story source |
| Speaker | the skill's name in `name` mono, on every line the session produces. **Never a persona's initials, name or colour** |
| Disc | the neutral skill variant of `{components.initials}`: a disc holding `{components.initials.skillGlyph}` in mono in `{colors.initials-ink}`, at `{components.initials.sizeThread}` beside a turn and `{components.initials.sizeHeader}` in the header. The skill's first letter is **not** used (every `bmad-*` skill would read `B`). No new colour |
| Turn head | the disc, the skill's name, then the clock time (`HH:MM`); there is no title slot. Your turns are as in any chat. The skill's words render as any turn's words do, in `{typography.body-ui}` **[ASSUMPTION]** |
| Run card | the first message starts a run and draws a run card in this session's thread, its head reading **`<skill> run`**. Everything in *State Patterns → Document card*, *The run list* and *Dead Air* holds, and the collapsed card's first field is the skill's name in the persona's place. Unlike the persona case (Open item 3), the name has a source here: main resolved it against Story 7.3's list when the session started |
| A turn in flight | the pending turn, caret and state line of *State Patterns → A turn in flight*, with the skill's disc and name in the persona's place |
| Later messages | a plain message goes to the **same session, which stays live**, and its replies keep the skill's name as speaker. A plain turn raises no card (AD-11). A message typed while a turn is in flight is queued as ever, marked `queued · sends when <skill> finishes` **[ASSUMPTION]** |
| Its own thread | its lines are drawn **only in this session's thread**, by the room's precedent: no persona's thread and not the project's shared one draws them (FR135) |
| Skill row | none **[ASSUMPTION]** (above) |

**When the run ends the thread offers nothing about who to talk to next.** No suggestion, no persona named, no handoff line, no button, and no sysline of any kind at the foot (AD-21). The session simply waits for the next message. The next step stays the user's: type in the session, or turn to any persona's seat by its tile (Story 7.4).

### The skill seat and the Skill sessions group

A persona tile and a skill seat are **one anatomy**: a row of `{components.persona-tile.height}`, an initials disc at `{components.persona-tile.discSize}` and no illustrated avatar. The seat's own spec is `{components.skill-seat}`.

| Part | Rule |
|---|---|
| Line one | the skill's name in `name` mono, where a persona has name and title. A name wider than the row is cut at its edge, and the header carries it whole **[ASSUMPTION]** |
| Line two | one of three, with the dots of *State Patterns*: `working · <elapsed>` (amber, pulsing), `live` (green dot: idle and holding context), or, after a relaunch, `ended` (no dot) |
| Disc | the slash disc (*A skill-first session*), decorative: the name is beside it |
| Group | a group headed **`Skill sessions`**, below every persona group, in the existing group-heading treatment (the one the persona groups and the Outputs directories use: no new token). **Rendered only while at least one seat exists; no empty state** |
| Order | **start order.** No recency sort, no sort by state, no pinning (AD-21); a seat does not move when it works or finishes |
| Duplicates | the same skill may be started twice, with **no cap**. Only while two seats carry the same name does each show its start time, `HH:MM`, in `{colors.dim}` after the name (decided 2026-10-15: `dim`, because `faint` may not be the only carrier of a fact, *Accessibility Floor*) |
| Click | turns the chat to that session and marks the seat current as a tile is (accent edge, `aria-current`) **[ASSUMPTION]**. A seat that is current un-presses the button |
| The row has no control | **no close, no menu, no hover action.** The only end control is the header's `close session` (Story 7.4), so a session out of view is ended by turning to it first |
| The state strip | **counts personas only**, equal to the head's `5 agents`, as the Board's Agents panel does. A working skill session shows in its own row and is in no cell |
| Appearing | a new seat arrives in one frame, with no animation, and is **not announced** (*Roster and install states*: no arrival or removal animation) |

### Ending, and a message to an ended session

**Ending** is the header's `close session` while the skill session is in view, which is Story 7.4's control and keeps its rules. What the user sees: the session's process is killed, **its own records are removed** (they belong to no other thread), its seat leaves the group (and the `Skill sessions` heading goes with the last one), and the window **lands on the New session chat**, with focus in the composer. No persona's seat and not the shared thread is touched. Nothing is written in any thread: the session's thread goes with it.

**After a relaunch** a skill session's process went with the app (FR100). Its seat is listed, with its thread as it was and `ended` in place of a dot. Its header has no `Stop`, but keeps `close session` so the row can go **[ASSUMPTION]**: nothing else removes a listed row.

**A message to an ended session** says one harness line, `session ended`, in the thread, in the sysline style. **Nothing starts**; the text **stays in the composer**; no user turn is drawn. It says nothing about what to do next. It is announced once, politely. A new session begins only when the user opens a fresh New session chat and sends a first message.

*A persona's seat after a relaunch* (its next message opens a session with no earlier context) is Story 7.4's and is not restated here.

### Recent activity

*Amended 2026-10-15; the Board's Recent activity (Story 6.7) is otherwise as built.* A skill-first run is a row. **The skill's name takes the persona's place**, and the word after it is `started`, `finished`, `stopped` or `failed` **with no code**, because a code would repeat the name. The dot rules and the absolute `MM-DD HH:MM` are Story 6.7's. The row is raised from the run card's `skill`.

It is **never a Board column or card**, it derives **no story owner** (FR123 stands), and the Agents panel and the Overview's **agents running** count no persona for it.

### Copy

| Place | String |
|---|---|
| the button | `Skill Session` |
| the empty chat's header | `New session` |
| the group heading | `Skill sessions` |
| a first word that is not an installed skill | `no skill named <word>` |
| a message to an ended session | `session ended` |
| a seat's second line | `working · <elapsed>` · `live` · `ended` |
| a skill's run card head | `<skill> run` |
| Recent activity | `<skill>` then `started` · `finished` · `stopped` · `failed` |

### Accessibility

- **The button** is a native `<button>` with `aria-pressed`, in the tab order after the state strip and before the persona list (the `Sprint board` row is not built in the code), with the shared focus treatment `{components.focus}`; `Enter` and `Space` press it. **No new chord**: there is no shortcut for it and none is added.
- **Focus** goes to the composer when the landing opens (a window opens, the button is pressed, a skill session is ended). The composer's accessible name is `message`, hidden. The thread is empty, so there is nothing to read first.
- **Announcements.** `no skill named <word>` and `session ended` are announced **once, politely, through the existing live region**: one line, no new region, the 2-second throttle unchanged. A new seat's row is not announced, and neither is its dot (*Accessibility Floor → 4*).
- **Seats** are in the sidebar's roving list (*Accessibility Floor → 2*); the disc is decorative, so a seat's name is its text, and its state is a text string beside its dot, which stops pulsing under reduced motion as every pulse does. `ended` has no dot and is text alone.

### Boundaries

No skill picker beyond Story 7.3's list; no inference of a persona from what is typed; no suggestion of a persona to talk to next, in any line, button or handoff; no attribution of a skill's work to a persona, in a name, a disc, a colour or a Board row; no Board column, card or owner for a skill-first run; no resume of a skill session across a relaunch; no cap on how many may be live; no change to a persona's seat or to the room by this section (a persona's skill and the room's turn to their own seat and room as before).

### Banned here

No icon, count, badge, tooltip or accent fill on the button; no recommended or highlighted skill anywhere in it, no list in it; no placeholder, hint, greeting, example or suggestion in the New session chat; no close control, pill or `Stop` on it; no control on a seat row; no recency, state or pinned order for seats; no count of skill sessions beyond the rows themselves; no skill's first letter as its disc; no persona's initials or colour on a skill's line; no sound; no animation of a seat arriving or leaving.

---

## What Epic 7 did not build

*Added 2026-10-16 by the Story 7.6 record. One statement for the whole epic: the per-story boundaries (*Sessions without a persona → Boundaries*, *A card or row that opens its file*, *`/` list, in detail*) stand beside it, and `DESIGN.md` mirrors it.*

Epic 7 retired four prohibitions on purpose and kept the rest. **Retired:** a card or epic row with a file is a control; `/` lists the install's skills, in the one `/` list and nowhere else; a persona's live dot is on a seat that holds context, and a persona has a seat of its own; and a chat may have no persona, as the New session chat or as a skill-first session spoken in the skill's name. Every other prohibition of Epics 1 to 6 still holds, and each epic's own audit holds it.

It did **not** build:

- **Resume across a relaunch.** A relaunch ends every process. A persona's seat shows no live dot after it and its next message opens a session with no earlier context; a skill-first session is listed with its thread and `ended`, takes no message and starts nothing. There is no resume flag and no way to bring either back.
- **A cap.** There is no limit on live persona seats or on skill-first sessions, and no state in which the `Skill Session` button could not open a chat.
- **A persona inferred from what is typed.** `@<name>` in a persona's composer turns to the persona it names, as it always did; in the New session chat it is read as any other word. A first message names a skill by `/<name>` and nothing else; text with neither starts nothing and says `no skill named <word>`. The harness never guesses a persona, a skill or a next step from words.
- **The `Sprint board` row.** The Board is a topbar view. The nav row the early mocks draw, with its `g b` hint, is not built in the code; the `Skill Session` button has a Team-half row of its own and moves into the nav row only if that row is built, as separate work.
- **A decision block in a skill session.** A skill's turn is words, drawn as markdown, and raises no options, choices or buttons; a decision block belongs to a persona's thread alone.

Nor did it add a skill picker or launcher, a list of skills anywhere but the `/` list, a count, badge or recommendation on a seat, a card, a row or the list, an owner on a Board card, or an end control anywhere but the header's `close session`. Story 7.6's audit (`tests/epic-7-audit.dom.test.tsx`, `src/main/board-audit.test.ts`, `src/main/session-bridge.test.ts` and the contract pins in `tests/contract.test.ts`) holds each of these.

---

## Accessibility Floor

**Stakes are hobby — the author and no one else.** There is **no WCAG conformance target** in v1 and none is claimed. What follows is the set of holes that are real, cheap to close, and expensive to retrofit. The visual contrast ceiling is fixed by `DESIGN.md`'s four-step surface and text ramps.

### 1. The `prefers-reduced-motion` hole — the one real defect

`@media (prefers-reduced-motion: reduce)` **sets `animation: none` and `transition: none` on every element, with no exceptions and no "essential motion" carve-out** (`DESIGN.md` → *Components → Motion*). The `work` state is a **pulsing** amber dot, and nothing in `DESIGN.md` replaces the pulse. The mitigations are this document's: Combined with AD-20 ("no element animates unless the thing it depicts is actually happening"), every piece of information carried by motion must also be legible with motion off. The fix:

| Signal | With motion | With motion disabled |
|---|---|---|
| `work` (a turn is in flight) | pulsing `{colors.amber}` dot | the dot keeps its **amber fill — unique to `work` among the five dot states** — and its halo, which is not unique, since `live` carries one too; **liveness is carried by the elapsed counter**, which is changing *data*, not an animation, and must keep ticking (≥1s) on the card head and the collapsed line |
| a rail row being written (`changing`) | the row's dot, pulsing | the textual state string `changing`, which is always present and never motion-dependent |
| streaming prose, or a persona's words in a turn in flight | caret blink + body growth | body growth. **[ASSUMPTION]** — the caret renders static-**on**, never static-off; a frozen invisible caret reads as a hung cursor. In the thread the state line's counter under the turn keeps ticking (≥1s) and carries liveness, as on the card head |
| batch commit | already motionless by decision | unchanged |

**No state anywhere is carried by motion alone, and no state is carried by colour alone** — every dot is paired with a text string in the same row. That pairing is the reduced-motion fix and the colour-blindness mitigation simultaneously, which is why it is stated as a hard rule rather than a guideline.

**No `{colors.faint}` string may be the only carrier of a fact.** Every one must restate something also legible at `{colors.dim}` or above, or be a label whose absence costs nothing. `{colors.faint}` against `{colors.bg}` is a contrast risk the token contract locks in (`DESIGN.md` → *Colors*).

### 2. Keyboard reach

With no command palette (*Banned everywhere*) there is no `⌘K` escape hatch, so keyboard access is designed into the direct surfaces instead. **Every action in the *Interaction Primitives* table must be reachable and operable from the keyboard**, and every surface below takes the one shared focus treatment, `{components.focus}` (`DESIGN.md` → *Components → Focus*).

| Surface | Keyboard behaviour |
|---|---|
| Topbar | tab-reachable: the view switch, three native buttons (`1:1 Conversation`, `Party Mode`, `Board`). Help is reserved and does not render in v1, so it is not a tab stop |
| Team sidebar | one tab stop for the list; **arrow keys move between tiles** (roving tabindex); `Enter`/`Space` activates. *Amended 2026-10-15:* the skill seats join the same list, after the last persona **[ASSUMPTION]**: they are the same anatomy and no source gives them a second stop |
| Skill Session button | *Added 2026-10-15.* a native `<button>` with `aria-pressed`, in the tab order **after the state strip** (the `Sprint board` row is not built in the code) and before the persona list; `Enter`/`Space` presses it. It takes the shared focus treatment and has no chord (*Sessions without a persona → Accessibility*) |
| Skill row | one tab stop; arrows move between buttons; `Enter`/`Space` dispatches. `+N more` is a button, not a hover affordance |
| Composer | tab-reachable and **never disabled**. **[ASSUMPTION]** — `Enter` sends, `Shift+Enter` inserts a newline; no source specifies send keys. `⌘↵` does **not** send, and `DESIGN.md` drops it from the glyph inventory accordingly. *Added 2026-10-15 (Story 7.3):* while a persona's `/` list is open, `↑`/`↓` move its current row, `Enter` or `Tab` put `/<name> ` in the field and send nothing, and `Esc` closes the list; the list is not a tab stop and focus never leaves the field |
| Decision option | each option is its own tab stop; `Enter`/`Space` chooses it, which sends the turn and removes the block |
| Document card | the card is focusable; `Enter`/`Space` expands a collapsed card; the stop control is its own tab stop |
| Rail — Outputs half | one tab stop for the list; arrows move between **folder headings and the rows that are showing**; `Enter` opens the document window on a row, and `Enter`/`Space` folds or unfolds on a heading; on a heading `←` folds and `→` unfolds |
| Splitter (Team sidebar, rail, Room panel) | one tab stop each, between the panel's neighbour and the panel; `←` grows and `→` shrinks a panel on the right, the sidebar the other way round (16px, 64 with `Shift`), `Home`/`End` go to min and max, `Enter` resets |
| Document window | `Esc` closes. The three escapes are tab-reachable |
| Party | cast chooser, header controls and composer all tab-reachable; no turn gate means no focus trap |
| Welcome | *Open project folder…*, the recent list and the three theme words are the tab stops; arrows move between recent rows, `Enter` opens, `⌘O` opens the chooser. Persona cards are content and are not tab stops. See *Welcome → Accessibility* |
| Outputs head | `change…` is one tab stop, before the list's. *File ▸ Output Folder…* is a native menu item, no accelerator |
| Thread | the scroller is scrolled by the browser's own keys (`PageUp`, `PageDown`, `End`); `↓ latest` is one tab stop between the thread and the composer, present only while the thread is not following. No new tab stop otherwise |
| Theme | *View ▸ Theme* is a native menu, reachable as every menu is; the radio items carry the current choice. No accelerator |
| Board card or epic row with a file | *Added 2026-10-15 (Story 7.1).* one tab stop each, in document order, a native `<button>`: `Enter`/`Space` open the file in the document window; `Esc` in that window closes it and focus returns to the card or row. A card or row with no file is not focusable |
| Board chord | `g` then `b` within one second, with no modifier held and focus not in a field (input, textarea, select, contenteditable), shows the Board. Any other key between, a gap over a second, a modifier or a field target does nothing. Added 2026-10-10 by Story 6.3 |

No shortcut layer beyond this and the one chord above.

### 3. Focus management

| After | Focus goes to | Why |
|---|---|---|
| persona switch | **stays on the activated tile** (now `aria-current`) | the skill row is *rebuilt* on every persona change; moving focus into a row that is about to be replaced loses it. The rebuilt row must not steal focus |
| card expand | the card container (`tabindex="-1"`) | **never the stop control.** Focus must not land on a control that interrupts a running turn |
| document window open | the window's document region (`tabindex="-1"`) | not *Close*. On `Esc`, focus returns to the rail row that opened it, or, *amended 2026-10-15 (Story 7.1)*, to the Board card or epic row that opened it; only the surface that opened the document takes the focus back |
| a row of the `/` list is chosen, or `Esc` closes the list | unchanged — the composer keeps focus, caret after the placed `/<name> ` | *Added 2026-10-15 (Story 7.3).* the list is read from the field; the current row is named by `aria-activedescendant` and drawn with the ring, and focus never moves into it |
| queued message send | unchanged — the composer keeps focus | the composer is never disabled; focus loss would read as the send failing |
| run terminal event | unchanged | a completion must never move the user's focus out from under them |
| the New session chat opens: a window opens on it, the Skill Session button opens it (or is pressed again), or the skill session in view is ended | **the composer** | *Added 2026-10-15.* the chat has nothing else to read or act on; there is no thread, control or header button to land on. The composer's hidden accessible name is `message` |
| a first message starts a session, or turns to a persona's seat or the room | unchanged — the composer keeps focus **[ASSUMPTION]** | the user was typing, and moving focus would read as the send failing |

### 4. Live-region policy

A single card streams **69,031 characters across 5,795 deltas** in one write. Neither announcing that stream nor announcing nothing is acceptable, so the policy is stated per content class: what is announced, what is not, and at what urgency.

| Content | Policy |
|---|---|
| document prose | **never announced.** Not a live region. The card carries `aria-busy="true"` while its run is in flight and `false` at the terminal event |
| a turn in flight in the thread (the caret, the state line under it, the pending turn, the room's pending row) | **never announced.** Not a live region, no `aria-busy` of its own: the indicator is `aria-hidden`, since the persona's tile (and, in the room, the cast) carries the same state. A persona's words, once they land, are ordinary thread text |
| run notes | **announced politely.** Their cadence is minutes apart, not milliseconds, and during dead air they are the only evidence of life — this is the screen-reader equivalent of watching the feed. **[ASSUMPTION]** — no source specifies this; it follows from the run-note feed being the dependable dead-air feed |
| run lifecycle — started, `doc:committed`, finished, stopped, failed | **announced politely**, one announcement per event. A 15-section commit is **one** event and gets **one** announcement naming the count |
| rail changes (`rail:changed`) | **not announced.** Filesystem churn is asynchronous and constant; the rail is a status region read on demand |
| preflight failures, resolver errors, malformed entries | **announced politely**, once |
| an output-folder choice refused (`not changed · …`) | **announced politely**, once |
| `no skill named <word>`, and `session ended` (*Sessions without a persona*) | **announced politely, once each**, through this same region: one line, no new region. *Added 2026-10-15.* A new skill seat's row appearing, and a seat's dot or state line changing, are **not announced** |
| the `/` list opening, narrowing, moving or being chosen from | **not announced.** *Added 2026-10-15 (Story 7.3).* The list is silent: no live-region text, no count. The field names the current row through `aria-activedescendant` only while the list is open |
| anything | **`aria-live="assertive"` is used nowhere in the product.** Nothing here is urgent enough to interrupt what the user is reading |

Exactly one polite live region per window. Announcements are throttled to **at most one every 2 s** — **[ASSUMPTION]**, no source specifies an interval; 2 s is longer than a screen reader takes to finish any string announced here and far shorter than the run-note feed's minutes-apart cadence, so nothing in the policy above is actually delayed by it. Announcements that arrive inside one interval are queued and read in event order, never merged into a count.

### 5. The initials token — focus parity

*Amended 2026-10-15: the focus parity below now covers initials discs only; there is no other avatar in the product.*

At 20px the initials token stands for a small reference (a stack, a story card), and its hover reveal of name and role gets **focus parity**: `tabindex="0"`, `role="img"`, `aria-label="{name}, {title}"`, and the reveal fires on **both** `:hover` and `:focus-visible`. It takes the shared focus treatment `{components.focus}` at its stacked offset, which is what clears the negative-margin overlap of a stacked row.

This is deliberate rather than incidental: **a hover-only tooltip is the one affordance that fails completely without a mouse**, and it is cheap to avoid even at hobby stakes. Wherever a disc stands alone it carries `role="img"` and the same `aria-label`.

**Beside a name** (the chat thread, the chat header, a Team tile, a cast card, a Welcome card, a skill seat) the disc, at `sizeThread` or `sizeHeader`, is decorative: `aria-hidden`, no tab stop, no reveal. **[ASSUMPTION]** — the focus parity above applies wherever a disc stands alone, as in a stack or on a story card. A skill's `/` disc is decorative for the same reason, since the skill's name is beside it.

---

## Key Flows

The protagonists are the narrated sessions in the sources. Names, quotes and figures are theirs.

### Flow 1 — Session B, the mockup's scripted session: the FR-7 pushback

**You** (initials `SM`, role `sherif`), `~/work/falcon`, branch `feat/payouts-prd`. Subject: merchant payouts, EU only for v1.

1. The window opens on the 1:1 view, on the New session chat (*Sessions without a persona*; *amended 2026-10-15: it used to open on a persona's thread, and no tile is current now*). You click John's tile. His thread opens with a sysline: `session resumed · 3 earlier turns hidden · context: product-brief.md, research/market-2026-09-14.md`. His tile is current; his state line reads `idle`.
2. **14:02** You type: *"Same scope we agreed Tuesday… Start the PRD off the brief, don't re-interview me."*
3. **14:02** John replies — *"Two silences already… Writing now — I'll flag the second one when I get to it."* — and dispatches. `run:started`. A document card is born inline in the thread. John's dot goes `work`. The `PRD.md` rail row reads `not yet written`, because it is.
4. **Dead air.** For minutes the main thread is quiet. The card body is **not** empty and **not** a spinner: it is the run-note feed, sans against the head's mono, timestamps in tabular figures (once the step event exists, the persona's tool steps join the same list: *State Patterns → The run list*). `kind:decision` — scope fixed to EU-only for v1. `kind:assumption` — payout failure handling is in scope; 61% of last quarter's 214 tickets are "where is my money". `kind:open` (warm, not red) — manual payout trigger unresolved; the brief and the tickets cannot both be true in v1. The foot reads `0 words on disk · researching · autosave on`.
5. Prose starts. The head reads `writing · §4 Functional Requirements` — **no `of 9`**. The foot names what is still to come: `§5 Non-functional  §6 Constraints  §7 Open questions`. FR-1 through FR-6 arrive in frame-sized bursts.
6. **The card halts mid-line at FR-7.**
7. **Climax.** John, in the conversation, in his own voice: **"Stopping at FR-7, because I don't want to write your decision for you."** Those two can't both be true in v1, and the difference is about a week of Amelia's time. Three options: **A** scheduled only · **B** manual trigger, rate-limited — *"John leans here"*, and only B carries the lean · **C** *"Neither — my reasoning is different."* And: **"I lean B, but I'd rather be wrong out loud than have you discover FR-7 in a review three weeks from now. Which is it?"**
8. You choose **B**. The option block is removed; it was a question and it has been answered.
9. **The payoff beat.** *"Then it's a requirement with teeth, not a button… Saved."* The caret stops. The card head flips **`writing` → `saved · just now · 9 sections`**. John's dot moves `work` → `live`. The rail row drops its annotation and reads `saved · just now`. This transition — writing to saved, on disk, in the rail, in one moment — is the literal payoff of the beat, and no part of it is animated beyond the state change that actually occurred.

*If you were in another window:* the collapsed card carried `John · <last reason> · 4m 12s · stop` the whole time, and on completion one silent macOS notification named John, `PRD.md`, `finished`.

*Failure:* had you pressed **stop** at step 5, the card would name the section reached, the file would stay byte-for-byte as last written, John's tile would go `error` with no error text on it, and John would say in conversation what got done, what broke, and offer to resume.

### Flow 2 — Session C, party mode: evidence-bearing disagreement

Topic: *"payouts — extend billing-svc, or stand up the ledger now?"* Sysline: **`room opened by you · all five agents present · no turn order enforced`**.

1. You open Party Mode and choose the room; it defaults to the five. Five cast cards, each with its initials disc, all permanently visible, dimmed except the speaker.
2. **John frames and time-boxes himself:** *"Ten minutes on this, then it goes into the PRD's constraints section as written and I stop reopening it."*
3. **Winston:** *"I'll say the unpopular thing first… Boring technology buys us the ability to be wrong cheaply."* And: *"That's a trade-off, not a verdict."*
4. **Amelia disagrees — and the disagreement is evidence:** *"Disagree. `billing-svc/src/ledger/reconcile.ts` is 1,412 lines, no idempotency key, and the retry path is a `setTimeout`."* **No `disagrees · Winston` tag is rendered in v1** — there is no data source for one, and the substance is in her words, where it belongs. The harness classifies nothing.
5. **Mary, with the number that reframes it:** *"Both of you are arguing cost. Nobody has said what changes for the merchant… of 214 payout tickets last quarter, 61% are 'where is my money' — and John, this is aimed at you."*
6. **Sally rejects the question rather than the answer:** *"I want to push on the framing itself. You've all called this an internal decision. It isn't."* / *"The architecture picks how many honest states I'm able to draw."*
7. **You jump in mid-room** — no turn gate, your message interrupts the current speaker: *"Hold on — Mary, if 61% is 'where is my money', is the event log enough on its own…?"*
8. **Climax.** Mary answers live — *"Not on its own."* — and then turns to another persona in front of you: *"Winston, does your Postgres-first version still give me a date I can stand behind…?"* **Winston concedes partly**: *"The idempotency point lands… Middle path… nobody operates Kafka for one producer."* Five people who disagree with evidence, reaching a middle path in a room you are standing in. The *Room* panel has held topic, opener, documents in scope and the destination path the whole time. *Open disagreements* and *Decisions so far* are not on screen at all, because nothing could have populated them.
9. You press *Write summary to `_bmad/`*. A new rail row appears at `_bmad/party/<date>-<topic>.md`, **owned by the room**, not by any persona.

### Flow 3 — Session A, "Demo Tape", beat 5: planning to build

1. The PRD is saved. You call epic creation, then sprint planning, from John's skill buttons — moving through skills without leaving the conversation. Each births its own card; each dies with its run.
2. You click **Amelia's** tile. Her session opens — **a new process**. The skill row is rebuilt to her five entries. Focus stays on the tile you activated.
3. *Superseded 2026-10-15 (Story 7.4):* no line lands in the transcript. You chose her from the tile, so nothing is announced; John's session is not ended and stays live, and his tile keeps its `live` dot beside hers.
4. Her seat is hers: it holds only what she was told, and the files that carry the work forward are in the rail beside it. When you end a seat with `close session`, one line, `session closed · Amelia starts fresh on the next message`, says so. (The history of the old `handed to` wording is *Voice and Tone → The handoff sysline*.)
5. **Climax.** Amelia picks up in her own register — file paths and AC IDs — reading from `PRD.md` and `epics.md`, which are visible in the rail two feet from her words. The span from planning to build happened in one window, in one continuous transcript, with no restart and no re-briefing. *A terminal genuinely cannot do this; that span is the differentiator.*

*Failure:* if Amelia vanishes from the install mid-session, her session stays alive with its transcript, its card and a working stop and close, and no tile. Nothing is silently closed.
