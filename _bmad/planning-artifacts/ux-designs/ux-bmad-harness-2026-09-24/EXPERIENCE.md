---
name: 'bmad-visual-harness'
type: experience-spine
status: final
created: '2026-09-24'
updated: '2026-10-03'
sources:
  - ../../../specs/spec-bmad-visual-harness/SPEC.md
  - ../../../specs/spec-bmad-visual-harness/ui-surfaces.md
  - ../../../specs/spec-bmad-visual-harness/execution-model.md
  - ../../../specs/spec-bmad-visual-harness/bmad-install-contract.md
  - ../../../specs/spec-bmad-visual-harness/scope-tiers.md
  - ../../architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md
  - ../../../brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html
companions:
  - DESIGN.md
---

# BMad Visual Harness — Experience Spine

The product test that outranks every rule in this document: *"if it reads as a chat box with a portrait glued on, it has failed regardless of feature completeness."* Restraint in the shell is not minimalism for its own sake — it is the budget the portraits spend. Nothing in this document may buy shell decoration with that budget.

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
| Dead Air | what the card does through a multi-minute silence |
| Failure, Stopping and Contention | the stop cost, terminal states, and the no-arbitration posture |
| Run Completion When Unattended | the notification contract for the terminal events |
| Party Mode | the room, its v1 cuts, and ownership without an `agentId` |
| Accessibility Floor | reduced motion, keyboard reach, focus, live regions |
| Key Flows | the three narrated sessions every rule above was derived from |

---

## Foundation

Desktop Electron shell. **macOS only in v1** — Windows and Linux are deferred, and the two platform escapes (`open -R`, `open -a`) are macOS calls confined to one module. **One project per window**; multi-project windows are deferred. **Dark only** — the mockup defines one palette, light theme is deferred, and no high-contrast variant exists.

Two top-level views behind a single switch — **1:1 Conversation** and **Party Mode**. A **Help** entry point is reserved in the topbar layout but **does not render in v1**, because the Help *section* behind it is Should-tier and a control that opens nothing is a control that lies; *Accessibility Floor → Keyboard reach* therefore lists the view switch alone. An explicit **end-session** control exists and is the only way to clear a persisted conversation; it is a lifecycle control, not a next-step suggestion (AD-21).

**This document designs for the user who is elsewhere.** The author works both at the window and in another app during a multi-minute run (memlog). The elsewhere case is strictly harder, and **a design that holds for it also holds for the attended case** — so every waiting state is specified for the unattended reading first and the attended reading second.

**Stakes are hobby — the author and no one else.** This sets the accessibility posture (see *Accessibility Floor*): fix the real holes, claim no conformance level.

---

## Information Architecture

| Surface | Reached from | Contains | Notes |
|---|---|---|---|
| Topbar | always present | brand, project path, install chip, branch chip, view switch | `{spacing.topbar}`. The Help entry point is reserved but not rendered in v1 |
| 1:1 Conversation | view switch | chat column + rail | default view |
| Chat column | 1:1 | conversation entries in time order — persona turns, user turns, syslines, document cards; skill button row; composer | thread `{spacing.thread-max}` max-width |
| Rail | 1:1 | split 50/50 — the **Team half** above, the **Outputs half** below | `{spacing.rail}` |
| Persona tiles | rail, Team half | one per installed agent: portrait, name, title, state line; current marked with an accent edge | grouped, see *Interaction Primitives* |
| Rail rows | rail, Outputs half | one row per file under `_bmad/` — path, owner, state, optional run annotation | disk truth only (AD-1) |
| Document card | **inline in the conversation, in time order** | head / body / foot | run-scoped; never a panel |
| Party Mode | view switch | cast, header, transcript, *Room* section | see *Party Mode* below |
| Document window | click a rail row or a card path | read-only preview, reloads on write | separate OS window, outside the shell |
| Preflight | launch failure | named missing prerequisite + remedy | see *State Patterns → Preflight* |

**Nesting and lifetime**

- 1:1 and Party are mutually exclusive; one switch, no third view.
- The rail shows **project artifacts only**. Harness bookkeeping — transcripts, logs, window state — lives in `userData` and never appears (AD-1). No affordance may imply the harness authored or can author a file.
- Document cards are **conversation entries**, not a region. A card is born with a skill invocation (`run:started`) and dies with it. A plain chat turn raises no card (AD-11).
- Skill buttons are nested under the active persona and rebuilt whenever the active persona changes.
- Ownership asymmetry: a party session carries no `agentId`. The **room** owns it, so a party summary's rail row shows the room as owner, in a presentation distinct from any persona (AD-19).
- The mockup's legend footer is prototype furniture ("Non-functional design prototype…"). It is not product chrome and does not ship.

**There is no separate skills list, launcher or command palette anywhere in the product** (AD-21). Skills are reachable only as the current persona's buttons. The rejection is argued once, in *Banned everywhere*.

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
| `handed off · John → Amelia · picking up from PRD.md, epics.md` | `conversation and context continue` |
| Lower case, mono, `·` as the separator, no terminal punctuation | Sentence case with full stops in a state string |
| Name the thing and stop | Name the thing and recommend a move |

**Rules**

1. **State, never guidance.** No harness string may suggest, highlight, badge, sort or recommend a next move (AD-21). A *remedy for a missing prerequisite* is not guidance and is required (AD-17); a suggestion about which skill to run next is guidance and is forbidden.
2. **The indicator carries the alert; the conversation carries the meaning.** No error text on a tile. The substance of a failure belongs in the conversation, in the persona's own voice, which AD-18 keeps the session alive to deliver (CAP-12).
3. **Never claim what did not happen.** The handoff sysline, the revision status word and the deleted denominator all exist because an earlier string asserted something the user could catch out.
4. **Mono is the harness's register; sans is the register of things said.** Every harness-authored string — paths, states, metadata, syslines — renders in the mono role tokens (`{typography.label}`, `{typography.meta}`, `{typography.micro}`). **Persona voice renders in the sans role token `{typography.body-ui}`. Document prose renders in the document register, `{typography.doc-prose}`, which is mono.** The split is load-bearing: it is what keeps harness copy from reading as somebody's words, and what keeps the two feeds in one card body distinct. Stated in full in `DESIGN.md` → *Typography → The register split*.
5. **Disagreement must carry evidence — a file, a line count, a percentage, a cost — or it must not ship.** Theatre-grade disagreement is a trust liability a plain prompt box does not carry; fake personhood is the failure mode named in the source. The harness does not author disagreement, so this rule binds the two things **the harness** *does* control: any persona or party configuration shipped with the product, and the chrome around a turn. v1 ships **no** `disagrees` / `evidence` tag, because a tag would let contentless disagreement read as substantive (see *Party Mode*).
6. **Config file paths never appear in copy.** The mockup's rail footer (*"Read from each agent's `customize.toml`…"*) and composer hint (*"skills read from `.claude/skills/…/customize.toml`"*) are factually stale: AD-10 makes `_bmad/config.toml` `[agents.*]` authoritative and AD-8 says config files are never read directly. **The spec wins over the mockup here.** Both strings are cut; nothing replaces them. **[ASSUMPTION]** — no source specifies replacement copy; dropping the provenance sentence is the minimal honest fix.

**The handoff sysline — why the mockup's wording is wrong**

The mockup's sysline reads *"handed off · John → Amelia · conversation and context continue"*. Under **AD-7 that is false**: a handoff **starts a new session**, and continuity is carried by *the project artifacts the previous persona wrote*, not by transplanting context. The corrected line — tabled above — names the real mechanism, the files, instead of a fake one, and it satisfies CAP-8's *"no handoff presents as a restart"* better than the false claim did, because the transcript is continuous and the artifacts are named and on disk. **[ASSUMPTION]** — the sysline names the artifacts the previous persona wrote during this conversation, in write order; no source specifies which files are named.

---

## Component Patterns

Behavioural only, per the ownership convention. Anatomy and appearance live in `DESIGN.md` → *Components*.

| Component | Behaviour | Disabled / absent when |
|---|---|---|
| View switch | toggles 1:1 ↔ Party. Sessions in the other view keep running. | never |
| Persona tile | click marks current (accent edge), rebuilds the skill row, and expands that persona's card. Aggregates every session carrying its `agentId` — a tile may stand for more than one session. | never; a party session has no tile |
| Portrait | `{components.portrait}`. Deterministic from curated params (the five) or derived from `agentId` (everyone else). **One neutral expression at every state** — the face never reacts; the state dot carries state. `portrait(artParams, size, state)` keeps accepting `state` so reactive faces need no signature change later. | below 32px — see next row |
| Initials token | `{components.initials}` replaces the portrait at 20px (stacked faces, small references). Reveals name and role on **both** hover and keyboard focus. | — |
| Skill button | label is the menu entry's `description`; a code badge carries the `code`. Click dispatches `menu.dispatch(sessionId, code)` — the button knows nothing about what it invokes. **No tooltip or preview derived from a resolved skill name** (AD-3: it would go stale). The user is never shown whether an entry is `skill` or `prompt`, and should not care (AD-9). | disabled whenever **any** turn is in flight in that session. `live` does **not** disable them |
| `+N more` | **expands the button row in place.** The row grows to show the remaining entries. **No transcript entry is created.** | — |
| Composer | never disabled. A message typed during a run is queued and visible — see *State Patterns → Queued composer*. | never |
| Document card | born on `run:started`, dead on the run's terminal event. Full for the active persona's card, collapsed for every other card. Expands on persona switch or click. **A collapsed card is never a spinner; it is the same state, smaller.** | absent for a plain chat turn |
| Stop control | present on **both** the full card head and the collapsed line. Dispatches `run.stop(runId)`. | — |
| Rail row | two independent registers on one line: disk `state` (watcher) and optional run `annotation` (stream). Click opens the document window. | the annotation slot is genuinely optional — a row must read as complete without it |
| Document window | read-only preview, reloads **from the watcher**, not from a renderer-initiated read. Three escapes: *Reveal in Finder*, *Open in editor*, *Close*. `Esc` closes. **No refresh control. No edit affordance. No save.** | — |
| Cast card (party) | presence is expressed by **dimming, never removal**. Every chosen portrait stays permanently visible; the current speaker is lit. | — |
| Decision option | the block a persona raises inside its own turn when it stops to ask. Each option is its own control — click, or `Enter`/`Space` when focused. Activating one **sends that option as the user's turn**, in the user's name, and the run resumes from the persona's reply. **The whole option block is then removed** — it was a question and it has been answered; there is no chosen state, no greyed-out losers and no record of the block beyond the two turns either side of it. The harness never authors the options, never reorders them and never marks one recommended; a stated lean is the persona's own words. | absent unless the persona's turn raises one |
| Sysline | harness-authored transcript entry in mono: session resumed, handoff, room opened. Never attributed to a persona. | — |

### `+N more`, in detail

The mockup prints the full menu into the transcript as a persona turn (*"Full menu for Mary, read from customize.toml"*). **This is rejected.** It is the harness authoring words attributed to a persona, which AD-18 forbids outright. The replacement is in-place expansion: the row grows, the remaining entries appear as ordinary skill buttons, nothing is written to the transcript.

The row must look right at both extremes of the real data: **Sally has 1 entry, Mary has 10** (John 4, Winston 2, Amelia 5). **[ASSUMPTION]** — the control toggles back; expanded, it reads `fewer`. No source specifies a collapse affordance.

### Document window ceiling

Project **content** is untrusted because it is largely model-authored (AD-13). Markdown renders with HTML disabled and is sanitized before insertion: **no raw HTML, no embedded styles, no images by markup.** The preview's entire visual range is sanitized markdown-it output, and it must look *intentional* within that ceiling rather than degraded. The harness previews documents; it never becomes the editor.

---

## Interaction Primitives

| Primitive | Where | Dispatches |
|---|---|---|
| View switch | topbar | 1:1 ↔ Party |
| Persona tile | rail | marks current · rebuilds the skill row · expands that persona's card |
| Skill button | above the composer | `menu.dispatch(sessionId, code)` → births a card |
| `+N more` | skill row | expands the row in place |
| Composer | chat column | `turn.send` — queued if a turn is in flight |
| `@<name>` in the composer | chat column, 1:1 | **hands off to that persona.** The product's only text-driven navigation, and the sole keyboard-fast path to a handoff. It addresses a **persona** and never names a skill (*Banned everywhere*) |
| `@<name>` in the composer | chat column, party | **directs the question at that persona.** Addressing only — it does not gate the room or reorder speakers |
| Decision option | thread, inside a persona turn | sends the chosen option as the user's turn, then removes the block |
| Card click | thread | expands a collapsed card |
| Stop | card head **and** collapsed line | `run.stop(runId)` |
| Rail row click | rail | `doc.open(path)` → separate OS window |
| *Reveal in Finder* / *Open in editor* / *Close* / `Esc` | document window | macOS escapes; `Esc` closes |
| Cast chooser | party, on opening | chooses the room; defaults to the five core personas |
| *Write summary to `_bmad/`* | party header | writes `_bmad/party/<date>-<topic>.md` |
| End session | shell | `conversation.end(projectId)` — **project-scoped**, the only way to clear a persisted conversation |

**Chat turns and skill invocations are both turns into the same session.** There is no second run kind, and the composer and the skill row must not read as two modes (AD-18).

### Persona tile order

Grouped by the agent's **`module`**, and by **`team`** where present — AD-10 names both as grouping fields. Within each group, the order the agents appear in the resolved `_bmad/config.toml`.

**No relevance sort, no recency sort, no pinning, no highlighting** (AD-21). Config order is the one ordering the user actually controls. Roughly six tiles fit the Team half before it scrolls, so the grouping becomes load-bearing the moment an install exceeds the five core agents. **[ASSUMPTION]** — group headings reuse the existing file-group treatment from the Outputs half; no source specifies a persona group heading.

---

## Banned everywhere

- **Command palette / `⌘K`, any launcher, any global skills list.** AD-21 rejects all three outright — rejections, not deferrals, with no v2 hook. Skills are reachable only as the current persona's buttons; a composer that parsed skill names, or a shortcut vocabulary that enumerated skills, would be the same launcher under another name.
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
| `note` | `{colors.note}` dot | the watcher saw a change to a file this persona owns | uses the dedicated note-blue token, not `{colors.accent}` — blue-as-state and blue-as-accent must be distinguishable (AD-14) |
| `error` | `{colors.red}` dot | this persona's last run failed **or** was stopped | the tile conflates the two on purpose. **Alert only — no error text on the tile** (AD-20) |

Every indicator is driven by real system state; no state exists for decoration. Five states, **four colours** — `idle` is the absence of one (`DESIGN.md` → *Colors*). **Every dot is paired with a text state string in the same row** — this is the colour-blindness mitigation and the reduced-motion mitigation at once, and it is cheap enough to be non-negotiable.

### Rail row (Outputs half) — two registers, never merged

| Register | Source | Values |
|---|---|---|
| disk `state` | watcher only | `not yet written` (absent) · `changing` · `saved · <age>` |
| run `annotation` | stream only, **optional** | owner (a persona / the room / none) · section in flight · `stopped` · contention |

A row can be `changing` with **no annotation at all** — an external editor writing the file. A row never shows `saved` because a run said so. There is no single merged "status" field (AD-2).

**Owner display:** the owner is a `sessionId`. It renders as that session's `agentId` where the session has one; failing that, as the owner derived from the artifact's class; failing that, **it does not render at all — the harness never guesses an owner**. The owner slot must look correct when empty (AD-19).

### Document card

The body has **two visual modes** — *prose mode* and *run-note mode* (`DESIGN.md` → *Components → Document card*). The six behavioural states below each resolve to one of them; the card is never in neither.

| State | Head | Body | Body mode | Foot |
|---|---|---|---|---|
| streaming prose | `writing · §N <Name>` | document prose in `{typography.doc-prose}` | prose | word count · section count · not-yet-written sections by name |
| revising | `revising · §N <Name>` | prose, updated in place | prose | unchanged — a revision advances nothing |
| quiet (dead air) | phase word if a feed states one, else path + elapsed only | **the run-note feed** — see *Dead Air* | run-note | `0 words on disk · <phase> · autosave on` + named next sections |
| stopped / failed | `stopped` + the section reached | whatever was streamed, left as-is | whichever mode it was in when it stopped | unchanged |
| finished | `saved · just now · N sections`; dot `work` → `live`; caret removed | final prose | prose | — |
| dead (post-restart) | terminal state, **no elapsed ticking, no stop control** | as left | as left | as left |

A run in flight survives a **window reload** — main owns durable state and re-emits on reconnect (AD-7), so no card visual may depend on having witnessed earlier deltas. It does **not** survive an **app restart**: after a restart the transcript is present and the sessions are gone (AD-18). Every persona reads `idle`; every card renders dead; nothing is offered to resume.

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

**Forbidden at launch:** any setup step, onboarding wizard, or "where are you in the process?" question. Pointing at a project root is the whole setup, and position and ownership are derived, never asked (AD-19).

### Empty states

| Surface | Copy | Rule |
|---|---|---|
| Outputs half, fresh project | `no files under _bmad/ yet` with the watched path beneath it | **states the situation and stops.** It reads as watching, not as broken. It must **not** suggest a next step, name a skill, or point at a persona (AD-21) |
| Document card | — | **there is no empty card body.** See *Dead Air* |
| Subagent region (`system/task_progress`) | — | optional, not primary. It may be permanently empty on a given run; nothing may depend on it |
| Party side panel | — | the two deferred sections are **not rendered at all**, not even as empty states |

---

## Dead Air

[`mockups/document-card-dead-air.html`](mockups/document-card-dead-air.html) — the three treatments compared, the approved Option A among them, plus the same run seen from the collapsed card and the rail. Where it and this spine disagree, **this spine wins**.


### Option A — the run-note feed becomes the card body (approved)

**The card never has an empty body. It has two modes, and both are content.** When document prose is not streaming, the body renders the **run-note feed**. That is the ruling; the evidence for it follows.

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

**[ASSUMPTION]** — when prose resumes, the body renders prose and the run notes accrued during the quiet window remain above it in the same scroll container, in time order. The register split keeps them distinct. No source specifies what happens to the accrued entries; discarding them would throw away the run's only record of its own reasoning.

### The elsewhere case — the collapsed card

Option A only pays out if you are looking at the card. The collapsed form is what reaches a user in another window, and it carries a **changed field set**:

| | Field |
|---|---|
| 1 | persona |
| 2 | **the last run note's reason** |
| 3 | elapsed |
| 4 | stop |

**This is a deliberate departure from `ui-surfaces.md`,** which documents `persona · section · elapsed · stop`. The last reason **replaces** the section name; it does not sit beside it. Two justifications: the section is already carried by the rail row, so repeating it spends the line on a duplicate; and a one-line card cannot hold five fields without becoming a paragraph. It follows directly from the Option A decision — if the run-note feed is the point, the collapsed form should carry it.

AD-11's four mandated fields are preserved, **including a working stop control**.

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

The same ruling cuts the transcript's `disagrees` / `evidence` tags and quoted-turn references, which are deferred from CAP-9 for the same missing source. A v1 party turn is **portrait + name + role + timestamp + the persona's words**, and nothing else. This is the honest form and it is also the safer one: a tag would let a contentless disagreement read as substantive, which is exactly the trust liability *Voice and Tone* rule 5 exists to prevent. The disagreement's evidence has to be in the persona's own text or it is not there at all.

AD-14 binds a `288px` party side panel as a literal. **That constant is superseded for v1** by the Room-only decision; `DESIGN.md` states the new width explicitly (`{spacing.party-side}`), because the old value is an architecture invariant and cannot be silently narrowed.

| Element | Behaviour |
|---|---|
| Cast chooser | on opening, the user chooses the room; defaults to the five core personas |
| Cast | every chosen portrait stays **permanently visible**. Presence is expressed by **dimming, never removal**. The current speaker is lit |
| Header | topic · participant count · turn counter · elapsed · *Write summary to `_bmad/`* |
| Transcript | portrait + name + role + timestamp per turn. No tags, no quote-back chrome |
| *Room* section | topic, who opened it and when, context documents in scope, destination `_bmad/party/<date>-<topic>.md` |
| Turn gate | **none.** The user types at any point; a message interrupts the current speaker |
| Session identity | a party session has a `sessionId` and **no `agentId`**. It gets no persona tile, and its rail row shows **the room** as owner |
| Lifecycle | party has **stop**, not pause. *Pause room* is a lifecycle state neither CAP-11 nor the session model models |

---

## Accessibility Floor

**Stakes are hobby — the author and no one else.** There is **no WCAG conformance target** in v1 and none is claimed. What follows is the set of holes that are real, cheap to close, and expensive to retrofit. The visual contrast ceiling is fixed by `DESIGN.md`'s four-step surface and text ramps.

### 1. The `prefers-reduced-motion` hole — the one real defect

`@media (prefers-reduced-motion: reduce)` **sets `animation: none` and `transition: none` on every element, with no exceptions and no "essential motion" carve-out** (`DESIGN.md` → *Components → Motion*). The `work` state is a **pulsing** amber dot, and nothing in `DESIGN.md` replaces the pulse. The mitigations are this document's: Combined with AD-20 ("no element animates unless the thing it depicts is actually happening"), every piece of information carried by motion must also be legible with motion off. The fix:

| Signal | With motion | With motion disabled |
|---|---|---|
| `work` (a turn is in flight) | pulsing `{colors.amber}` dot | the dot keeps its **amber fill — unique to `work` among the five dot states** — and its halo, which is not unique, since `live` carries one too; **liveness is carried by the elapsed counter**, which is changing *data*, not an animation, and must keep ticking (≥1s) on the card head and the collapsed line |
| a rail row being written (`changing`) | the row's dot, pulsing | the textual state string `changing`, which is always present and never motion-dependent |
| streaming prose | caret blink + body growth | body growth. **[ASSUMPTION]** — the caret renders static-**on**, never static-off; a frozen invisible caret reads as a hung cursor |
| batch commit | already motionless by decision | unchanged |

**No state anywhere is carried by motion alone, and no state is carried by colour alone** — every dot is paired with a text string in the same row. That pairing is the reduced-motion fix and the colour-blindness mitigation simultaneously, which is why it is stated as a hard rule rather than a guideline.

**No `{colors.faint}` string may be the only carrier of a fact.** Every one must restate something also legible at `{colors.dim}` or above, or be a label whose absence costs nothing. `{colors.faint}` against `{colors.bg}` is a contrast risk the token contract locks in (`DESIGN.md` → *Colors*).

### 2. Keyboard reach

With no command palette (*Banned everywhere*) there is no `⌘K` escape hatch, so keyboard access is designed into the direct surfaces instead. **Every action in the *Interaction Primitives* table must be reachable and operable from the keyboard**, and every surface below takes the one shared focus treatment, `{components.focus}` (`DESIGN.md` → *Components → Focus*).

| Surface | Keyboard behaviour |
|---|---|
| Topbar | tab-reachable: the view switch. Help is reserved and does not render in v1, so it is not a tab stop |
| Rail — Team half | one tab stop for the list; **arrow keys move between tiles** (roving tabindex); `Enter`/`Space` activates |
| Skill row | one tab stop; arrows move between buttons; `Enter`/`Space` dispatches. `+N more` is a button, not a hover affordance |
| Composer | tab-reachable and **never disabled**. **[ASSUMPTION]** — `Enter` sends, `Shift+Enter` inserts a newline; no source specifies send keys. `⌘↵` does **not** send, and `DESIGN.md` drops it from the glyph inventory accordingly |
| Decision option | each option is its own tab stop; `Enter`/`Space` chooses it, which sends the turn and removes the block |
| Document card | the card is focusable; `Enter`/`Space` expands a collapsed card; the stop control is its own tab stop |
| Rail — Outputs half | one tab stop for the list; arrows move between rows; `Enter` opens the document window |
| Document window | `Esc` closes. The three escapes are tab-reachable |
| Party | cast chooser, header controls and composer all tab-reachable; no turn gate means no focus trap |

No shortcut layer beyond this.

### 3. Focus management

| After | Focus goes to | Why |
|---|---|---|
| persona switch | **stays on the activated tile** (now `aria-current`) | the skill row is *rebuilt* on every persona change; moving focus into a row that is about to be replaced loses it. The rebuilt row must not steal focus |
| card expand | the card container (`tabindex="-1"`) | **never the stop control.** Focus must not land on a control that interrupts a running turn |
| document window open | the window's document region (`tabindex="-1"`) | not *Close*. On `Esc`, focus returns to the rail row that opened it |
| queued message send | unchanged — the composer keeps focus | the composer is never disabled; focus loss would read as the send failing |
| run terminal event | unchanged | a completion must never move the user's focus out from under them |

### 4. Live-region policy

A single card streams **69,031 characters across 5,795 deltas** in one write. Neither announcing that stream nor announcing nothing is acceptable, so the policy is stated per content class: what is announced, what is not, and at what urgency.

| Content | Policy |
|---|---|
| document prose | **never announced.** Not a live region. The card carries `aria-busy="true"` while its run is in flight and `false` at the terminal event |
| run notes | **announced politely.** Their cadence is minutes apart, not milliseconds, and during dead air they are the only evidence of life — this is the screen-reader equivalent of watching the feed. **[ASSUMPTION]** — no source specifies this; it follows from the run-note feed being the dependable dead-air feed |
| run lifecycle — started, `doc:committed`, finished, stopped, failed | **announced politely**, one announcement per event. A 15-section commit is **one** event and gets **one** announcement naming the count |
| rail changes (`rail:changed`) | **not announced.** Filesystem churn is asynchronous and constant; the rail is a status region read on demand |
| preflight failures, resolver errors, malformed entries | **announced politely**, once |
| anything | **`aria-live="assertive"` is used nowhere in the product.** Nothing here is urgent enough to interrupt what the user is reading |

Exactly one polite live region per window. Announcements are throttled to **at most one every 2 s** — **[ASSUMPTION]**, no source specifies an interval; 2 s is longer than a screen reader takes to finish any string announced here and far shorter than the run-note feed's minutes-apart cadence, so nothing in the policy above is actually delayed by it. Announcements that arrive inside one interval are queued and read in event order, never merged into a count.

### 5. The initials token — focus parity

At 20px the portrait is dropped for the initials token, and its hover reveal of name and role gets **focus parity**: `tabindex="0"`, `role="img"`, `aria-label="{name}, {title}"`, and the reveal fires on **both** `:hover` and `:focus-visible`. It takes the shared focus treatment `{components.focus}` at its stacked offset, which is what clears the negative-margin overlap of a stacked row.

This is deliberate rather than incidental: **a hover-only tooltip is the one affordance that fails completely without a mouse**, and it is cheap to avoid even at hobby stakes. Every portrait `<svg>` carries `role="img"` and the same `aria-label`, at every size.

---

## Key Flows

The protagonists are the narrated sessions in the sources. Names, quotes and figures are theirs.

### Flow 1 — Session B, the mockup's scripted session: the FR-7 pushback

**You** (initials `SM`, role `sherif`), `~/work/falcon`, branch `feat/payouts-prd`. Subject: merchant payouts, EU only for v1.

1. The window opens on the 1:1 view. A sysline: `session resumed · 3 earlier turns hidden · context: product-brief.md, research/market-2026-09-14.md`. John's tile is current; his state line reads `idle`.
2. **14:02** You type: *"Same scope we agreed Tuesday… Start the PRD off the brief, don't re-interview me."*
3. **14:02** John replies — *"Two silences already… Writing now — I'll flag the second one when I get to it."* — and dispatches. `run:started`. A document card is born inline in the thread. John's dot goes `work`. The `PRD.md` rail row reads `not yet written`, because it is.
4. **Dead air.** For minutes the main thread is quiet. The card body is **not** empty and **not** a spinner: it is the run-note feed, sans against the head's mono, timestamps in tabular figures. `kind:decision` — scope fixed to EU-only for v1. `kind:assumption` — payout failure handling is in scope; 61% of last quarter's 214 tickets are "where is my money". `kind:open` (warm, not red) — manual payout trigger unresolved; the brief and the tickets cannot both be true in v1. The foot reads `0 words on disk · researching · autosave on`.
5. Prose starts. The head reads `writing · §4 Functional Requirements` — **no `of 9`**. The foot names what is still to come: `§5 Non-functional  §6 Constraints  §7 Open questions`. FR-1 through FR-6 arrive in frame-sized bursts.
6. **The card halts mid-line at FR-7.**
7. **Climax.** John, in the conversation, in his own voice: **"Stopping at FR-7, because I don't want to write your decision for you."** Those two can't both be true in v1, and the difference is about a week of Amelia's time. Three options: **A** scheduled only · **B** manual trigger, rate-limited — *"John leans here"*, and only B carries the lean · **C** *"Neither — my reasoning is different."* And: **"I lean B, but I'd rather be wrong out loud than have you discover FR-7 in a review three weeks from now. Which is it?"**
8. You choose **B**. The option block is removed; it was a question and it has been answered.
9. **The payoff beat.** *"Then it's a requirement with teeth, not a button… Saved."* The caret stops. The card head flips **`writing` → `saved · just now · 9 sections`**. John's dot moves `work` → `live`. The rail row drops its annotation and reads `saved · just now`. This transition — writing to saved, on disk, in the rail, in one moment — is the literal payoff of the beat, and no part of it is animated beyond the state change that actually occurred.

*If you were in another window:* the collapsed card carried `John · <last reason> · 4m 12s · stop` the whole time, and on completion one silent macOS notification named John, `PRD.md`, `finished`.

*Failure:* had you pressed **stop** at step 5, the card would name the section reached, the file would stay byte-for-byte as last written, John's tile would go `error` with no error text on it, and John would say in conversation what got done, what broke, and offer to resume.

### Flow 2 — Session C, party mode: evidence-bearing disagreement

Topic: *"payouts — extend billing-svc, or stand up the ledger now?"* Sysline: **`room opened by you · all five agents present · no turn order enforced`**.

1. You open Party Mode and choose the room; it defaults to the five. Five cast cards, all portraits permanently visible, dimmed except the speaker.
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
3. A sysline lands in the transcript: **`handed off · John → Amelia · picking up from PRD.md, epics.md`**.
4. The line names **the files**, not a continuation — because the files are what actually carry the continuity across a new session. (Why the mockup's wording is wrong, and what AD-7 and CAP-8 have to do with it, is *Voice and Tone → The handoff sysline*.)
5. **Climax.** Amelia picks up in her own register — file paths and AC IDs — reading from `PRD.md` and `epics.md`, which are visible in the rail two feet from her words. The span from planning to build happened in one window, in one continuous transcript, with no restart and no re-briefing. *A terminal genuinely cannot do this; that span is the differentiator.*

*Failure:* if Amelia vanishes from the install mid-session, her session stays alive with its transcript, its card and a working stop and close, and no tile. Nothing is silently closed.
