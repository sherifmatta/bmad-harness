# Extraction — UX-binding rules from ARCHITECTURE-SPINE.md, execution-model.md, bmad-install-contract.md

## 0. The product test that outranks everything
> "if it reads as a chat box with a portrait glued on, it has failed regardless of feature completeness."

Mechanism: *"Restraint in the shell and real faces in it are what buy the perceived intelligence back, which is why AD-14, AD-16 and AD-20 are invariants rather than styling preferences."* **Restraint is not minimalism for its own sake — it is the budget the portraits spend.**

There are **21 ADs**. AD-21 is the negative-surface constraint and is arguably the most binding on EXPERIENCE.md.

## 1. ADs with UX consequence

### AD-1 — harness writes nothing into the project
Rail is a view of *project artifacts only*. Harness bookkeeping (transcripts, logs, window state, in `userData`) must never appear in the rail. Forbids any affordance implying the harness authored or can author a file.

### AD-2 — the two truth channels never merge ⭐
Rail row carries **two independent fields, never written by both sources**:
- disk-derived **`state`**: `absent` → `changing` → `saved` — watcher only
- optional run-derived **`annotation`**: owner, section in flight, `stopped` — stream only

**Forces:** render as *two visually distinct registers on one row*. A row can be `changing` with **no annotation at all** (external editor writing) — so the annotation slot must be genuinely optional and the row must read as complete without it.
**Forbids:** a single merged "status"; a row showing `saved` because a run said so.
Card is run-scoped: "born with a skill invocation, dies with it."

### AD-3 — one bridge contract
- **Menu entries resolve in main.** Button label is `description`; the button knows nothing about what it invokes. **No tooltip or preview derived from a resolved skill name** — it would go stale.
- `sessionId` session-scoped, `runId` run-scoped. `agentId` **may be absent** (party = room-owned). "A persona tile aggregates the sessions carrying its `agentId`" — a tile may represent >1 session; party has no tile identity.
- **Routing → three visually distinct destinations, never crossed:** main-thread `text_delta` = persona voice · `input_json_delta` in a doc write = document prose · `.memlog.md` = `run:note`, **never** prose.

### AD-4 — pure folds
"The raw log is the forensic and replay record only — it is never the authority for what the UI shows on restart; that is the materialised projection."

### AD-5 — a write counts on `tool_result`, never `tool_use` ⭐
"The unit of confirmation is the *tool call*, not the section."
- Fast path: whole document in **one `Write`**, then **~20 revision `Edit`s**. Coaching path: several sections per write.
- On `tool_result`: all sections from that call commit **together**. On `is_error: true`: **none did**, and the call names what failed.
- `Write` replaces the buffer and may open sections; `Edit` is a **revision** — "re-parses sections but never advances the section counter." **20 of 21** observed Fast-path writes were revision Edits.
- **Exactly one `doc:committed` per tool call** — "a 15-section single write emits one event naming fifteen sections."

**Forces:** sections commit in **batches**. Fifteen can go in-flight→committed in one instant; that must read as intentional, not as a glitch. Needs a **revision affordance that doesn't look like progress**.
**Forbids:** per-section tick-through animation; a progress bar implying steady incremental advance.

### AD-6 — subagent output is never the persona's voice ⭐
"Only main-thread `text_delta` may render as a persona turn." Subagent activity gets its own register from `system/task_progress`.
**Critical:** task_progress "is not guaranteed on every run, which is why `.memlog.md` is the card's dependable dead-air feed rather than a fallback." → **memlog is a first-class feed, not a degraded state.**

### AD-7 — main owns durable state
"a reload loses nothing — including a run in flight… re-emitted on reconnect." No card visual may depend on having witnessed earlier deltas.
**Cross-persona:** "a handoff starts a new session, and continuity is carried by the project artifacts the previous persona wrote, not by transplanting context." → UX must not promise memory transfer; **the artifacts are the continuity**, raising the rail's narrative importance.

### AD-8 — config only from BMad's resolvers
- Resolver failure: "degrades to the last good result and surfaces a named error, and never silently yields an empty roster." → a state that is **stale-but-valid roster + named error**.
- "re-resolution updates the roster and the menus and never touches a live session" → **tiles and skill buttons can change under the user mid-use.**
- "an agent that vanishes from the install keeps its session and its stop control until the user closes it" → **orphaned live session** state: live session, no roster entry, still stoppable/closable.

### AD-9 — a menu entry carries exactly one of `skill` or `prompt` ⭐
Entry = `code` + `description` (the label) + exactly one of `skill`/`prompt`. **Both dispatch identically — the user cannot be shown which is which and shouldn't care.** An entry with neither is "a discovery error surfaced to the user, never a silent no-op" → needs a visible error treatment.
Why: "six of the ten Business Analyst entries are `prompt`-style, so a `skill`-only dispatcher leaves 60% of that menu inert."

### AD-10 — agents from `_bmad/config.toml` `[agents.*]`
| Field | Feeds |
|---|---|
| `name` | tile, chat header, party cast |
| `title` | tile subtitle, party turn header |
| `icon` | **chrome only — never a portrait** |
| `description` | persona detail |
| `module`, `team` | grouping |

Real data of unknown length. `description` implies some persona-detail surface exists. "`identity` and `communication_style` are not harness-injected" → **the UI never styles or frames the voice.**

### AD-11 — one turn in flight per session; sessions concurrent ⭐
- "anything the user types during a run is queued and sent when that turn completes" → **visible queued-message state in the composer**
- "Skill buttons are disabled whenever any turn is in flight; the composer is not."
- "A **run** is a turn dispatched from a menu entry… a plain chat turn is not a run and raises no card."
- "Different sessions run concurrently" → shell must show simultaneous activity.
- **Cards are conversation entries in time order** — inline in the thread, not a panel.
- Two forms: active persona's card **full** (prose body + not-yet-written sections by name); non-active **collapses to one live line: persona · section · elapsed · stop** — four mandated fields **including a working stop control** — "expands on persona switch or click. A collapsed card is never a spinner."
- Contention reported, not prevented (`bmad-correct-course` touches PRD, epics, architecture, UX at once).

### AD-12 — reports, never arbitrates
"the filesystem arbitrates and last writer wins… It never locks, reverts, patches or restores."
**Forbids:** any dialog offering to resolve/merge/revert/choose. No "keep mine / keep theirs". **No undo.**
"A stopped or failed run's partial file is already byte-for-byte the last successful write, so there is nothing to revert." → say what's on disk is intact; don't offer recovery.

### AD-13 — renderer unprivileged; project content untrusted ⭐
Project **code** trusted; project **content** untrusted "because it is largely model-authored."
→ markdown-it with **HTML disabled** + DOMPurify. **No raw HTML, no embedded styles, no images-by-markup from project documents.** The preview's visual range is exactly sanitized markdown-it output, and **must look intentional within that ceiling.**
Doc windows "reload from the watcher, not from a renderer-initiated read" → **no refresh control, no edit affordance.**

### AD-14 — one token file is the visual contract ⭐⭐
`design/tokens.css` opens with the mockup's `:root` **copied unchanged**.
- **Surface ramp:** `--bg:#101317` → `--chrome:#14181d` → `--panel:#171b21` → `--panel-2:#1b2027` → `--panel-3:#20262e`
- **Hairlines:** `--line` / `--line-soft`
- **Text ramp:** `--text` / `--text-strong` / `--dim` / `--faint`
- **Single accent:** `--accent:#7fa6e8` + `--accent-bg`
- **State triple:** `--green:#6aa87f` / `--amber:#c6a350` / `--red:#c47c72`
- **Fonts:** `--mono` / `--sans`

**Literals named as equally binding:**
- Layout: rail `348px`, party side panel `288px`, topbar `42px`, rail head `30px`, legend `24px`, thread max-width `940px`
- **Radius family — "one radius is *not* the rule":** `3px` chips/tags, `4px` skill buttons, `5px` base `--r`, `6px` cards, `8px` document window
- Type scale: base `13px`/`1.55`; `--mono` for file paths and metadata, `--sans` for prose
- **A missing token to add:** a **`note`-state blue**, which the mockup inlines as the accent hex — needs its own token "so blue-as-accent and blue-as-state are distinguishable"

"A literal colour, dimension, radius or font stack in a component is a defect."
**Implication:** green/amber/red + note-blue = **four state signals total** for every indicator in the product.

### AD-15 — deltas never pass through component state one at a time
"Main coalesces deltas… The card commits accumulated text to one node on an animation frame."
→ streaming prose arrives in **frame-sized bursts**; **no typewriter-per-character effect is available.** Design must specify what that growth looks like.
Sizing: **5,795 deltas / 69,031 characters** in one observed write.

### AD-16 — portraits: pure, deterministic, asset-free, illustrated colleagues ⭐⭐
**Binding art direction:** "a **company-directory illustrated headshot: a plausible colleague. Not pixel art, not a JRPG sprite, not a cartoon.**"
**Named the project's single highest risk:** "an art direction that reads as childish and takes the perceived intelligence down with it."
- Params: skin + shade, hair colour with style + fringe, optional beard, glasses, earrings, shirt + collar, background
- Procedural inline SVG, no assets, no licensing
- **Legible from 20px to tile size**
- `portrait(artParams, size, state)` — **`state` accepted from the start**; reactive faces are deferred but need no signature change
- Five core curated; **every other installed agent derived from agent id** → must hold up for arbitrary unknown agents
- Determinism asserted in tests. `icon` is never a portrait.

### AD-17 — launch preflight names what is missing ⭐
"Any failure is reported naming the specific missing prerequisite and its remedy." Prevents "opening to an empty room with no personas and no explanation, which reads as broken rather than as unconfigured."
"CAP-1 promises zero *configuration*, not zero *prerequisites*."

### AD-18 — the persona session is the unit of interaction
- Opening a persona **spawns a process** — a real open/closed distinction per persona.
- "Chat turns and skill invocations are both turns into a session — there is no second run kind." → composer and skill buttons feed the same channel; **must not read as two modes.**
- Party is a session of the same kind: `sessionId`, no `agentId`.
- "Sessions… are not held across app restarts" but the transcript is → **on restart: history present, sessions gone.** Needs a defined presentation.
- A failed run leaves the session alive so **the persona itself delivers the failure** — otherwise "the harness would speak in a persona's name — the fake personhood the spec names as a trust liability."
- **Open risk:** "if it proves impossible, CAP-11's stop costs the session and that trade must be surfaced to the user, never hidden."

### AD-19 — pipeline position and ownership derived, never asked ⭐
**Forbids** any setup step, onboarding wizard, or "where are you in the process?" question. Pointing at a project root is the whole setup.
Owner is a **`sessionId`**, displayed as its `agentId` where it has one; else derived from artifact class; else **none — never guessed** → the owner slot **must look correct when empty**.
Party rows are **owned by the room** → the rail needs a **room-owner presentation distinct from any persona**.

### AD-20 — every indicator driven by real system state ⭐⭐
"No state exists for decoration, no element animates unless the thing it depicts is actually happening, and `@media (prefers-reduced-motion: reduce)` disables all animation and transition globally."
"The `error` indicator is an alert only — the substance of a failure belongs in the conversation in the persona's own voice." → **no error text on the tile.**

### AD-21 — the negative surface: no guidance, no launcher, no editor ⭐⭐
> "No highlighting, badging, sorting or recommending of a next move anywhere — the skill buttons plus the output list are enough and the user decides. No separate skills list, launcher or command palette exists anywhere in the product; skills are reachable only as the current persona's buttons. Document windows are read-only previews; the harness never becomes an editor. An explicit end-session control exists and is the only way to clear a persisted conversation — it is not a next-step suggestion."

**Forbids outright:** next-step suggestion, recommended-action highlighting, badges, relevance sorting, a global skills list, a launcher, **a command palette (⌘K)**, any editing affordance in a document window.
**Requires:** an explicit end-session control that must not read as "do this next."
These are **rejections, not deferrals — do not design a v2 hook for them.**

### Conventions with UX force
- **Time:** epoch ms in events; **formatting is the renderer's business**. Elapsed derives from `run:started`, never a per-tick field.
- **Errors:** `{ code, message, detail? }` with a stable `code`. **Raw stderr never reaches the renderer.** → natural progressive-disclosure shape, no stack traces.
- **Progress (binding for the card foot):** names and denominator from the skill's template, then the run's `.memlog.md` concern-scan. "Observed headings win and the denominator grows; a section the user has already seen is never renumbered." Foot lists not-yet-written sections **by name**.
  → **`§4 of 9` can become `§4 of 15`.** A growing denominator must look correct, not like a bug. **Renumbering an already-seen section is forbidden.**
- **Dead air:** card's secondary feed is `.memlog.md`, "appended entry by entry with each decision and its reason", persona stays `work`.
- **Platform:** macOS-only shell escapes (`open -R`, `open -a`) → Reveal in Finder / Open in editor.

## 2. Named UI states

**Rail row disk `state` (watcher only):** `absent` (not on disk) · `changing` (watcher activity **plus a settle debounce** — works for *any* writer, no stream needed) · `saved` (watcher saw it land, never because the stream announced it)

**Rail row `annotation` (stream only, optional):** owner · section in flight · `stopped` · contention. Owner display variants: **a persona / the room / none.**

**Persona tile — exactly five, one source each:** `idle` · `work` (any turn in flight, **persists through quiet subagent phases**) · `live` (long-running attached process — **looks like activity but must NOT disable skill buttons**) · `note` (watcher saw a change to a file this persona owns) · `error` (last run failed **or** was stopped — the tile conflates the two; the distinction lives in the conversation and on the card)

**Document card:** absent (no run; a chat turn raises none) · born (`run:started`) · full · collapsed · expanded · dead.
Feeds within a full card: document prose (`input_json_delta`) · persona voice (`text_delta`) · subagent activity (`system/task_progress`, **not guaranteed**) · run notes (`.memlog.md`, **dependable**)

**Run terminal:** finished (`result` without `error_during_execution`) · stopped · failed (both: `error_during_execution` + `is_error: true` + `stop_reason`). Both also produce "a `tool_result` with `is_error: true`, naming the call that was rejected" — how the rail knows which section did **not** land. Both leave a partial file byte-for-byte the last successful write.

**Turn/composer:** turn in flight (skill buttons disabled, composer enabled) · queued.

**Install/roster:** resolved · **stale roster + named error** · roster changed mid-use · **orphaned live session** · preflight failure.

**Post-restart:** transcript present, **sessions gone**. A run in flight survives a *window reload* but not an *app restart*.

## 3. Bridge contract — user-facing meaning

**Events out:** `session:opened` (tile leaves idle) · `session:awaiting-turn` (ready; queued message can go) · `session:closed` · `persona:said` (**the only thing that may render as a persona turn**) · `persona:state` · `run:started` (**card born; elapsed derives from this timestamp**) · `run:note` (memlog; dependable dead-air feed; never prose) · `doc:section-opened` · `doc:prose` (coalesced per frame) · `doc:committed` (**exactly one per tool call, possibly 15 sections at once**) · `run:finished` · `run:stopped` · `run:failed` · `rail:changed`

**Commands in:** `session.open(agentId)` · `session.close(sessionId)` · `turn.send` (queued if in flight) · `menu.dispatch(sessionId, code)` (**sends only the code**) · `run.stop(runId)` (**on both full and collapsed card**) · `doc.open(path)` · `conversation.end(projectId)` (**project-scoped, not session-scoped**)

**There is no command for editing, reverting, resolving contention, or navigating a pipeline. The absence is the design.**

## 4. Timing and volume

- **5,795 deltas / 69,031 characters** in one observed write. Replay at 10%/50%/75% → valid growing document at §2.3 / §4.5 / §7.
- **Fast path:** `prd.md` as a single **68,394-byte** write **~8.5 minutes in**, then ~20 revision edits of 150–2,200 B.
- **Coaching path:** 219-byte frontmatter stub, then §0–§2.3 in one 7,798-byte write; `addendum.md` in one 10,506-byte write.
- Runs of **~12 minutes** expected.
- **⚠️ For the first ~8.5 minutes of a Fast-path run, nothing lands on disk at all.** The card is the only evidence of life; the rail row stays `absent`. **This is the dead-air problem at its sharpest.**
- Template's 0–9 spine expanded to **15** sections in one observed run → denominator grows ~50%.
- Watcher: rapid appends **coalesce** — three landed inside **400ms**. Sub-second polling does not give one event per entry.
- **`SIGINT` exits a subprocess `rc=0` within ~250ms.**
- **Menu sizes: Mary 10 (6 prompt-style, 60%) · John 4 · Sally 1 · Winston 2 · Amelia 5** → **the button area must look right from 1 to 10 entries.**
- Layout: rail 348 · party panel 288 · topbar 42 · rail head 30 · legend 24 · thread max-width 940 · portrait legible from 20px

## 5. Errors and edge cases the user must be shown

**Preflight — three checks, each with a named failure + remedy:**
1. `claude` on `PATH` and authenticated
2. `uv` with Python 3.11+
3. **the target project resolves at least one agent** — "A user-scoped rather than project-scoped BMad install resolves none under `--setting-sources project,local`"
Check 3 is subtle: BMad *is* installed, `claude` works, room still empty → the message must explain **project-scoped vs user-scoped install**, not just "no agents found."

**Resolver failure:** keep the last good roster **and** show a named error. Never empty, never silently stale.
**Malformed menu entry:** "a discovery error surfaced to the user, never a silent no-op."
**Contention:** reported on the rail, never resolved. Trigger: `bmad-correct-course` touching four artifacts while another persona runs.
**Stopped mid-write:** partial file byte-for-byte the last *successful* write; the in-flight call returns `is_error: true` naming the rejected call — "how the rail knows which section did *not* land." A 15-section batch can vanish from committed in one event. Rail gains `stopped`; tile goes `error`.
**Run failure:** "the substance of a failure belongs in the conversation in the persona's own voice, which AD-18 keeps alive to deliver."
**Stop costing the session (unresolved):** if so, **the stop control needs a warning treatment** — stopping ends the conversation with this persona. **EXPERIENCE.md should carry both branches.**
**Agent removed mid-use:** live session, no roster entry, still stoppable and closable.
**Error envelope:** `{ code, message, detail? }`, stable `code`, no raw stderr.

**Dead air (the hardest EXPERIENCE problem):**
> "The risk to 'no spinner substitutes for this at any point' is **not** the document render — that streams for minutes. It is the parallel-subagent windows: Discovery research and the Finalize reviewer gate, where the main thread emits nothing but `system/task_progress` while subagents work — and that is not guaranteed on every run."

During these: `.memlog.md` is the feed, entry by entry **with the decision and its reason**; persona stays `work`. **Minutes of no prose, no spinner permitted, and the only reliable signal is a log file appending reasons.**

## 6. Accessibility — what's stated, and the gaps

**Stated (very little):**
1. **Motion:** "`prefers-reduced-motion: reduce` disables all animation and transition globally." Not *reduces* — **disables, all, globally.** Combined with "no element animates unless the thing it depicts is actually happening" → **every piece of information currently carried by motion must also be legible with motion off.** Hard requirement for the streaming card, the `changing` rail state, and the `work` persona state.
2. **Portraits legible from 20px.**
3. **Contrast only indirectly:** four-step surface ramp + four-step text ramp are fixed and unadjustable by a component. **`--faint` against `--bg:#101317` is a contrast risk the tokens lock in.** No ratio, WCAG level or target stated anywhere.
4. **Dark only.** Light theme deferred. No high-contrast variant mentioned.

**NOT stated anywhere — genuine gaps for EXPERIENCE.md:**
- **No keyboard navigation of any kind.** No shortcuts, tab order, or arrow-key rail navigation. **AD-21 forbids a command palette, which removes the usual keyboard escape hatch** — keyboard access must be designed into the direct surfaces.
- **No focus management** — after persona switch, card expand, document window open, or queued message send.
- **No screen-reader guidance at all.** No live-region policy — conspicuous given a card streaming 69,031 characters and a rail changing asynchronously. **An unconsidered `aria-live` here would be catastrophic; so would its absence.**
- **No text-scaling or zoom behaviour.** 13px base and fixed px constants (348/288/940) stated as literals with no scaling rule.
- **No colour-blindness consideration** for green/amber/red — the product's entire state vocabulary.

## 7. Open questions that fork the UX

1. **Stop semantics (the big one).** "whether `SIGINT` can halt a skill turn without ending the session. Unverified; the cheapest spike in the plan and worth running first."
   **Fork:** stop is either lightweight (run ends, persona stays to explain) or **destructive** (stopping ends the conversation → needs confirmation and warning). The collapsed line mandates a stop control in four fields of space; its weight depends entirely on this. **Design both branches.**
2. **Turn queueing vs responsiveness.** "Confirm in use that queued-and-visible reads as honest rather than as the composer being broken." **The queued-message presentation is explicitly on trial.**
3. **CAP-2 continuous cross-persona session vs AD-18 per-persona sessions.** "A session spans personas in the transcript and in the artifacts, but not in process." **Fork:** present the handoff as continuous, or make the seam honest and visible.

**Unverified/conditional:**
4. `system/task_progress` **not guaranteed** → the subagent region may be permanently empty on some runs. **Design it as optional, not primary.**
5. **Settle debounce duration unspecified** (only the observed ~400ms coalescing window) → how long a row sits in `changing` is undetermined; directly affects whether `changing` reads as live or stuck.
6. **Denominator growth is unbounded.** Template 9 → run 15.

**Deferred seams (know them, don't design them):** party disagreement/decision tracking (no data source) · *Pause room* (a lifecycle state neither CAP-11 nor AD-18 models — **party has stop, not pause**) · light theme · long scrollback virtualization · Should/Could items (help section, reactive faces, tile hover previews, second opinion, refusal-with-handoff, idle barks). **Two hooks reserved: AD-16 already accepts `state`; the shell reserves a help entry point.**

**Spec amendments that change the promised experience:**
- CAP-5 "no spinner at any point" → "A non-active persona's card collapses to a live one-line state rather than showing prose and the not-yet-written list."
- "talk to one agent, get a result, move to the next" → "Personas may run concurrently, a deliberate user decision. The waterfall of the *method* is unchanged; the serialism of the *interaction* is not."
- "zero configuration" → "Zero configuration, but not zero prerequisites."

## Sharpest constraints per spine
**DESIGN.md is largely pre-decided** by AD-14 and AD-16 — palette, surface ramp, layout constants, radius family, type scale and mono/sans split are **copied, not chosen**. The two genuine design acts left: **(a) the `note`-blue token AD-14 says is missing**, and **(b) the portrait art direction** — the project's single highest risk, with an exact brief and an exact parameter list.

**EXPERIENCE.md's hardest problems, in order:** the dead-air window · the batch commit (15 sections at once, growing denominator, revisions that don't advance the counter) · the collapsed card's four mandated fields including a working stop · the stop-cost fork · **the accessibility layer, which the architecture almost entirely does not address beyond the global reduced-motion kill switch.**
