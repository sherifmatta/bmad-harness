# UI surfaces

Load-bearing surface decisions. The reference implementation is
`../../brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html`,
adopted as a binding companion: where this file and the mockup describe the same thing,
the mockup is the detail of record. The token contract that makes those values binding — the
palette, the layout constants, the radius family and the type scale — lives in
`../../planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md`,
except where this file records a supersession below (the party side panel width, the portrait
legibility floor).

## Shell

Two top-level views behind a single switch — **1:1 Conversation** and **Party Mode** — plus a
Help entry point. One project per window.

An explicit **end-session** control exists and is the only way to clear a persisted conversation.
It is a lifecycle control, not a next-step suggestion.

## 1:1 Conversation

- Chat occupies the large left column. Right rail is fixed at **348px**, split **50/50**:
  personas above, outputs below.
- **Persona tiles** (top half): one per installed agent — portrait, name, title, and a state
  line. Current persona is marked with an accent edge.
- **Outputs rail** (bottom half): one row per file under `_bmad/`, showing path, owner persona,
  and state — `saved · <age>`, `writing · §N`, `appending · live`, `stopped · §N`, with no
  denominator (`../../planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md`,
  *Progress, batch commit and revision*: "the rail annotation loses its denominator too").
  The row's file state comes from the watcher; the owner and section-in-flight are annotations
  from the run. They are separate fields and no source writes both.
- **Skill buttons** sit inline in the conversation above the composer, labelled
  "<Persona> can …", rebuilt whenever the active persona changes. They are disabled while any
  turn is in flight in that session; the composer is not — a message typed during a run is
  queued and sent when the run completes.

## Persona state vocabulary

| State | Indicator | Means |
|---|---|---|
| `idle` | grey dot | no session, or nothing running |
| `work` | amber dot, pulsing | a turn is in flight — chat or skill run |
| `live` | green dot | a long-running attached process (e.g. a test watcher) |
| `note` | blue dot | a document this persona owns changed on disk |
| `error` | red dot | this persona's last run failed or was stopped |

Every indicator is driven by real system state; no state exists for decoration, and
`prefers-reduced-motion` disables all animation globally. The `error` state is an alert only —
the substance of a failure belongs in the conversation, in the persona's own voice (CAP-12).
`work` persists across a run's quiet subagent phases: the work is still running, so the dot
still pulses. `live` is distinct from a skill run and does **not** disable the skill buttons.

## Live authoring

A document card renders inside the conversation, not the rail. It is **run-scoped**: born with a
skill invocation and dead with it. A plain chat turn raises no card.

Cards are conversation entries in time order. The **active** persona's card renders full:

- **Head:** state dot · file path · current section (`writing · §4 Functional Requirements`) · elapsed run time · **stop**
- **Body:** the prose streaming in as it is written
- **Foot:** the sections not yet written, listed by name

A card belonging to a persona the user is **not** currently looking at collapses to a single
line carrying real state — persona · section · elapsed · stop — and expands on persona switch or
click (`ARCHITECTURE-SPINE.md` AD-11). A collapsed card is never a spinner; it is the same state,
smaller, and it does not carry the prose body or the not-yet-written list.

Progress is legible against a known plan rather than an opaque percentage, and elapsed time
makes a stall visible without anyone having to guess at a spinner.

The body streams from the run's event stream, not from re-reading the file — the prose appears
while the write is still in flight. Where the section name, the section number and the
not-yet-written list come from is specified in `execution-model.md`. During a run's
subagent phases (research, reviewer gate) the document stream goes quiet; the card is fed by the
run's `.memlog.md` entries so the beat never becomes a spinner.

**On stop or failure:** the card switches to the `error` state and names the section reached. The
file is left byte-for-byte as written — never reverted, never patched — and the persona picks it
up in conversation: what got done, what broke, an offer to resume.

## Document window

Separate OS window, **read-only preview that reloads on write**. Title bar carries the file
path and three escapes: *Reveal in Finder*, *Open in editor*, *Close*. The harness previews
documents; it never becomes the editor. Markdown from project files is model-authored and
therefore untrusted: it is rendered with HTML disabled and sanitized before insertion.

## Party mode

- **Cast:** the user chooses who is in the room when opening it, defaulting to the five core
  personas. Every chosen portrait stays permanently visible, current speaker lit.
- **Header:** topic, participant count, turn counter and elapsed time,
  *Write summary to `_bmad/`*.
- **Transcript:** portrait + name + role + timestamp per turn.
- **Side panel — *Room*:** topic, who opened it and when, context documents in scope, destination
  path (`_bmad/party/<date>-<topic>.md`). All of it is harness-known. The panel is **240px**, in
  place of the 288px that `ARCHITECTURE-SPINE.md` AD-14 binds, because v1 ships the Room section
  only (`../../planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md` *The party side
  panel — 288px is superseded*; `../../planning-artifacts/epics.md` UX-DR8). 288px must not be
  implemented, although the spine's token contract, which lists it as a literal, still states it.
- No turn-taking gate: the user types at any point.
- A party session carries no single agent — the room owns it, which is why a party summary's rail
  row shows the room rather than a persona as owner.

The room is meant to stage productive conflict rather than a chorus of agreement — bounded by the
substantive-disagreement constraint in SPEC.md. The mockup's *Open disagreements* and *Decisions
so far* panels, the transcript's `disagrees` / `evidence` tags and quoted-turn references, and
*Pause room* are **deferred**, not dropped: `bmad-party-mode` emits prose and is instructed never
to produce summaries or takeaways, so none of them has a data source today. See `scope-tiers.md`.

## Visual language

Dark surface (`#101317` ground, panels stepping up to `#20262e`), hairline borders, a single
blue accent (`#7fa6e8`) with green/amber/red reserved for state. Monospace for file paths and
metadata, system sans for prose. Restraint is deliberate: it is what offsets the portraits
against the childish risk.

## Portraits

Procedural inline SVG, parameterized per persona — skin and shade, hair colour with a style
(`short`, `long`, `curly`, `bun`, `receding`) and fringe, optional beard, glasses, earrings,
shirt and collar colour, background. Rendered at the closed size set 32 (transcript), 36 (persona
tile), 38 (chat header) and 44 (cast card). The legibility floor is **32px**, in place of the
"legible from 20px" that `ARCHITECTURE-SPINE.md` AD-16 states: at 20px a portrait degrades to a
colour blob, so the 20px case — stacked faces, the handoff chip — is served by the initials token
instead (`../../planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md`, the
"Legibility — relaxed from 20px to 32px" paragraph under *Portrait*;
`../../planning-artifacts/epics.md` FR79, FR82). No external image assets and no licensing
dependency.

The five core personas carry curated parameters. Any other installed agent derives its
parameters deterministically from its agent id, so the same agent always wears the same face
across sessions and machines. The `icon` field is never rendered as a portrait.
