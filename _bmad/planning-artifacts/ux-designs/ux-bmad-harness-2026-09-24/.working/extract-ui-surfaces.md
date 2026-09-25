# Extraction — ui-surfaces.md + scope-tiers.md

Source files:
- `_bmad/specs/spec-bmad-visual-harness/ui-surfaces.md`
- `_bmad/specs/spec-bmad-visual-harness/scope-tiers.md`

**Authority note:** `harness-mockup.html` is a binding companion — "where this file and the mockup describe the same thing, the mockup is the detail of record." Token contract lives in ARCHITECTURE-SPINE.md.

## 1. Surface inventory

### Shell
- Two top-level views behind a single switch — **1:1 Conversation** and **Party Mode** — plus a Help entry point. One project per window.
- **End-session control:** "the only way to clear a persisted conversation. It is a lifecycle control, not a next-step suggestion."
- Help entry point reserved by the shell; the Help *section* is Should-tier, not Must.

### View A — 1:1 Conversation
| Surface | Position / size | Contains |
|---|---|---|
| Chat column | large left column | conversation entries in time order incl. live document cards; skill buttons; composer |
| Right rail | fixed **348px**, split **50/50** | personas above, outputs below |
| Persona tiles | top half of rail | one per installed agent — portrait, name, title, state line. Current persona marked with an accent edge |
| Outputs rail | bottom half of rail | one row per file under `_bmad/` — path, owner persona, state |
| Skill buttons | inline in conversation, above the composer | labelled `"<Persona> can …"` |
| Composer | below skill buttons | message input |
| Document card | **inside the conversation, not the rail** | Head / Body / Foot |

**Rail row field provenance (verbatim):** "The row's file state comes from the watcher; the owner and section-in-flight are annotations from the run. They are separate fields and no source writes both."

### View B — Party mode
| Surface | Contains |
|---|---|
| Cast | user chooses the room on opening, defaulting to the five core personas. Every chosen portrait stays permanently visible, current speaker lit |
| Header | topic, participant count, turn counter, elapsed time, *Write summary to `_bmad/`* |
| Transcript | portrait + name + role + timestamp per turn |
| Side panel — *Room* | topic, who opened it and when, context documents in scope, destination path `_bmad/party/<date>-<topic>.md` |

### Document window (separate OS window)
- Read-only preview that **reloads on write**.
- Title bar carries the file path and three escapes: *Reveal in Finder*, *Open in editor*, *Close*.
- "The harness previews documents; it never becomes the editor."
- Markdown is model-authored and untrusted: rendered with HTML disabled and sanitized before insertion.

### Portraits (cross-surface)
- Procedural inline SVG, parameterized: skin and shade, hair colour with style (`short`, `long`, `curly`, `bun`, `receding`) and fringe, optional beard, glasses, earrings, shirt and collar colour, background.
- Sizes: **20px** stacked faces, **32px** in turns, larger in tiles and cast.
- No external assets, no licensing dependency.
- Five core personas carry curated params; any other agent derives deterministically from agent id. The `icon` field is never rendered as a portrait.

### Visual language (as stated here)
"Dark surface (`#101317` ground, panels stepping up to `#20262e`), hairline borders, a single blue accent (`#7fa6e8`) with green/amber/red reserved for state. Monospace for file paths and metadata, system sans for prose. Restraint is deliberate: it is what offsets the portraits against the childish risk."

## 2. Information architecture
- 1:1 and Party are mutually exclusive, one switch.
- One project per window.
- Right rail nests persona tiles (top 50%) + outputs rail (bottom 50%); both simultaneously visible with chat.
- Document cards are conversation entries in time order — they interleave with chat turns, no dedicated region.
- Card lifetime nested under a run: "born with a skill invocation and dead with it. A plain chat turn raises no card."
- Skill buttons nested under active persona; rebuilt whenever the active persona changes.
- Document window is a separate OS window, outside the shell.
- Ownership asymmetry: "A party session carries no single agent — the room owns it, which is why a party summary's rail row shows the room rather than a persona as owner."

## 3. Behavioural rules
- End-session is the only way to clear a persisted conversation.
- Skill buttons "disabled while any turn is in flight in that session; the composer is not — a message typed during a run is queued and sent when the run completes."
- `live` state is distinct from a skill run and does **not** disable skill buttons.
- Skill buttons rebuilt on persona change. Collapsed card "expands on persona switch or click."
- Card born with skill invocation, dead with it. Plain chat turn raises no card.
- Collapsed card carries **persona · section · elapsed · stop**. "A collapsed card is never a spinner; it is the same state, smaller."
- Body "streams from the run's event stream, not from re-reading the file — the prose appears while the write is still in flight."
- During subagent phases (research, reviewer gate) "the document stream goes quiet; the card is fed by the run's `.memlog.md` entries so the beat never becomes a spinner."
- **On stop or failure:** "the card switches to the `error` state and names the section reached. The file is left byte-for-byte as written — never reverted, never patched — and the persona picks it up in conversation: what got done, what broke, an offer to resume."
- Document window reloads on write.
- Party: "No turn-taking gate: the user types at any point." Current speaker lit; all chosen portraits permanently visible.
- **`prefers-reduced-motion` disables all animation globally.**

## 4. State patterns

### Persona state vocabulary (verbatim)
| State | Indicator | Means |
|---|---|---|
| `idle` | grey dot | no session, or nothing running |
| `work` | amber dot, pulsing | a turn is in flight — chat or skill run |
| `live` | green dot | a long-running attached process (e.g. a test watcher) |
| `note` | blue dot | a document this persona owns changed on disk |
| `error` | red dot | this persona's last run failed or was stopped |

- "Every indicator is driven by real system state; no state exists for decoration."
- "The `error` state is an alert only — the substance of a failure belongs in the conversation, in the persona's own voice (CAP-12)."
- "`work` persists across a run's quiet subagent phases: the work is still running, so the dot still pulses."

### Outputs rail row states (verbatim)
`saved · <age>` / `writing · §N of M` / `appending · live` / `stopped · §N of M`

### Document card states
- **Full** (active persona) — Head/Body/Foot.
- **Collapsed** (non-active persona) — persona · section · elapsed · stop.
- **Quiet / subagent phase** — fed from `.memlog.md`; "never becomes a spinner".
- **Error** — names the section reached.
- **Dead** — ends with the run.

### NOT specified in these files
No `empty`, no distinct pre-content `loading`, no `saving`, no `disabled` beyond skill buttons. Progress is explicitly not a percentage: "Progress is legible against a known plan rather than an opaque percentage, and elapsed time makes a stall visible without anyone having to guess at a spinner."

## 5. Interaction primitives
| Primitive | Where | Dispatches | Disabled when |
|---|---|---|---|
| View switch (1:1 ↔ Party) | shell | switches top-level view | not stated |
| Help entry point | shell | opens Help | section is Should-tier; entry point reserved |
| End-session | shell | only way to clear a persisted conversation | not stated |
| Skill buttons | above composer | invoke a run for the active persona → births a card | any turn in flight; `live` does **not** disable |
| Composer | conversation | sends a message; queued during a run | never disabled during a run |
| Stop | card head + collapsed card line | stops run → card `error`, names section, file left as written | not stated |
| Persona tile | persona rail | marks current (accent edge); rebuilds skill buttons; expands that persona's card | not stated |
| Card click | conversation | expands a collapsed card | not stated |
| *Reveal in Finder* / *Open in editor* / *Close* | document window title bar | escapes | not stated |
| *Write summary to `_bmad/`* | party header | writes to `_bmad/party/<date>-<topic>.md` | not stated |
| Cast chooser | on opening party | user chooses the room, default five core personas | not stated |

**Card anatomy (verbatim):**
- **Head:** state dot · file path · current section (`writing · §4 Functional Requirements`) · elapsed run time · **stop**
- **Body:** the prose streaming in as it is written
- **Foot:** the sections not yet written, listed by name

## 6. Microcopy (verbatim)
- Views: "1:1 Conversation", "Party Mode"
- Skill buttons: `"<Persona> can …"`
- Rail states: `saved · <age>`, `writing · §N of M`, `appending · live`, `stopped · §N of M`
- Card head example: `writing · §4 Functional Requirements`
- Document window: *Reveal in Finder*, *Open in editor*, *Close*
- Party: *Write summary to `_bmad/`*, *Room*, `_bmad/party/<date>-<topic>.md`
- State tokens: `idle`, `work`, `live`, `note`, `error`
- Hair styles: `short`, `long`, `curly`, `bun`, `receding`

**Deferred party microcopy (NOT v1):** *Open disagreements*, *Decisions so far*, *Pause room*, tags `disagrees`/`evidence`, statuses `unresolved`/`proposed`, age format `since turn 3 · 2 exchanges`

**Could-tier microcopy (NOT v1):** refusal-with-handoff "that's Mary's — want me to loop her in?" with an `@Mary` chip; idle bark "I still think we should've gone event-driven, but the client wanted REST"

## 7. Keyboard, focus, accessibility — THIN
Everything stated:
- "`prefers-reduced-motion` disables all animation globally." (Note: this makes the `work` pulsing amber dot non-animated; **the file does not say what replaces the pulse**.)
- Colour-only state risk implicitly mitigated — tiles carry a state line, rail rows carry textual state strings, card head carries a textual section string. No explicit a11y rationale given.
- Input modality: mouse/click only named; typing named for the composer.
- **No keyboard shortcuts, no focus order, no ARIA, no screen-reader, no contrast statements in either file.**

## 8-9. Tier structure and items

Framing: "SPEC.md capabilities are the **Must** set. This file holds what was deliberately deferred but not rejected."

### IN SCOPE v1 (Must)
Shell switch + Help entry point + end-session + one project per window; 1:1 chat column, 348px rail at 50/50, persona tiles, outputs rail, skill buttons, composer + queueing; all five persona states; live cards (run-scoped, full/collapsed, head/body/foot, streaming, memlog fallback, stop/failure); document window (read-only, reload-on-write, three escapes, sanitized); Party v1 — "the room itself: chosen cast, permanently visible faces, lit speaker, no turn-taking gate, the *Room* panel, and the summary written to `_bmad/`" + header + transcript; dark-only; procedural SVG portraits; `prefers-reduced-motion` global disable.

### DEFERRED — party structured tracking (cut from CAP-9)
Reason for the whole group: "Cut from CAP-9 for want of a data source, not for want of value. `bmad-party-mode` emits prose and is explicitly instructed never to produce summaries or takeaways, so nothing here can be populated today."
- *Open disagreements* panel — parties (stacked faces), status, substance, age
- *Decisions so far* panel — same missing source
- Transcript `disagrees`/`evidence` tags and quoted-turn references — same missing source
- *Pause room* — "A lifecycle state distinct from stop, which neither CAP-11 nor the session model models."

**Revisit when** a structured source exists — most plausibly a `_bmad/custom/` override making the party skill emit machine-readable markers.

### SHOULD — "wanted in v1 if it fits, cut before any Must"
- Help section explaining BMad to newcomers — "The original ask for the whole product. Survived convergence as Should, not Must."
- **Persona face reacts to state** — "Neutral idle, thinking while a skill runs, changed when a doc it owns changes on disk. Partly realised by the state vocabulary; the *facial* reaction is the deferred part. The portrait function already accepts `state`, so this needs no signature change."

### COULD — "worth building, no v1 commitment"
- Hover a persona tile to preview its skill buttons — "Content is already free from the resolved menu."
- "Second opinion" on any rail document — "Pick two personas, they argue for three bounded turns, then stop."
- Refusal-with-handoff — "Teaches the org chart without a help page."
- Idle barks surfacing rejected alternatives — "the ADR's options-not-chosen section spoken aloud."

### PLATFORM/PACKAGING — deferred, each with a revisit trigger
Signing/notarization/auto-update (when someone other than the author installs it) · Windows and Linux (when a non-macOS user appears; platform calls confined to one module) · **Light theme** (mockup defines one dark palette) · Multi-project windows · Long scrollback virtualization · Agent SDK as runtime (rejected on authentication, not ergonomics).

### CUT
Neither file enumerates one. "The Won't list in SPEC.md Non-goals was cut on a principle: it was all **autonomy**." Nothing in scope-tiers.md is cut — every item is tiered.
