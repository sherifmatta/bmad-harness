---
review: adversarial
target: ../ARCHITECTURE-SPINE.md
method: 'compliant-but-incompatible pairs — two units one level down that each obey every AD to the letter and still cannot be integrated'
date: '2026-09-23'
---

# Adversarial review — ARCHITECTURE-SPINE.md (bmad-visual-harness)

## Method and standard of proof

For each finding I name two units one level down (two epics, or two developers each holding one
module in the source tree), show the choice each makes, show that **both choices satisfy every
AD as written**, and show the concrete way the two builds fail to compose. Anything that is
merely thin, unjustified or stylistic is excluded. Eighteen holes are reported, ordered by
severity.

The spine's dominant failure mode is consistent: **AD-3 fixes an event *vocabulary* and the
spine then treats that as if it had fixed a *contract*.** A vocabulary without payload shapes,
without emission cardinality, without ordering guarantees and without a matching command
vocabulary is exactly the artefact two teams can both honour and still fail to integrate. Most
of what follows is a consequence of that one gap.

---

## CRITICAL

### H-1 — A chat turn typed during a run terminates the run

**Units.** *Dev A: `renderer/ui/conversation` + the composer.* *Dev B: `main/fold/run`.*

**Dev A's choice.** AD-11 states outright: a persona's skill buttons are disabled while a skill
is in flight, "**though the user may still type to them**". AD-18 states: "**Chat turns and skill
invocations are both turns into that session** — there is no second run kind." So Dev A wires
the composer to send a free-text turn straight into the live session at any time, including mid-
run. This is not an interpretation; it is the only reading of those two sentences together.

**Dev B's choice.** AD-18 states: "Terminal run states come from the final `result` row:
`subtype: "error_during_execution"` with `is_error: true` and a `stop_reason` marks stopped or
failed, its absence marks finished." So `fold/run` closes the in-flight run when it sees a
`result` row without an error subtype. Also the only reading available.

**The incompatibility.** The user presses *Create PRD*, then four minutes in types "make §3
shorter". Under `--input-format stream-json` that user turn produces its own assistant response
and its own `result` row. Dev B's fold sees a clean `result` and emits `run:finished`. Consequence
chain, all of it wrong and all of it AD-compliant:

- AD-20 flips John from `work` to `idle` while the PRD is still being written.
- AD-11 re-enables the skill buttons — the user can now start a second `bmad-prd` in a session
  that already has one in flight, which is the exact thing AD-11 exists to prevent.
- AD-2's live document card "dies with the skill invocation" — the card vanishes mid-write.
- AD-5's accumulated tool-call input buffer is discarded; the remaining ~5,000 `input_json_delta`
  events arrive with no run to attach to.

`result` is a **turn** terminator, not a **run** terminator, and AD-18 conflates them.

**Tightening.** A new AD, or a rewrite of AD-18's terminal-state clause:

> A *run* is a correlation scope opened by the turn that carried the skill invocation and closed
> only by (a) a `result` row on the turn that opened it, (b) `run:stopped`, or (c) session death.
> Every domain event carries the `runId` it belongs to, or `null` for session-scoped events. A
> user turn submitted while a run is in flight is **queued in main** and dispatched on that run's
> close; the composer renders it as pending. Main, not the renderer, owns the queue.

If queueing is rejected in favour of live interjection, the spine must instead state that a
run's terminal `result` is identified by correlation with the initiating turn's id, and that
intervening `result` rows are turn-level and must not close the run — plus how AD-11's
one-skill-in-flight invariant is enforced against a session whose turn ordering the harness no
longer controls.

---

### H-2 — `doc:committed` cardinality: one event per section, or one per tool call

**Units.** *Epic "live document card" (`fold/document`, `ui/card`).* *Epic "outputs rail"
(`projections/rail`).*

**Card epic's choice.** AD-5: "On `tool_result`, **every section** parsed from that call's
accumulated input **becomes committed together**." AD-3 lists `doc:committed` in the vocabulary.
Sections are the card's unit (the foot lists not-yet-written sections by name, the head shows
`§N of M`), so the card epic fans out one `doc:committed` per section, payload
`{ path, sectionTitle, index }`.

**Rail epic's choice.** The same sentence reads as one commit event per confirmed tool call, so
the rail epic emits one `doc:committed` per `tool_result`, payload
`{ path, sections: string[], toolUseId, ok: boolean }`.

**The incompatibility.** Both are in `src/shared/` under one name, so only one survives — and the
consumer built against the other is silently wrong rather than broken. With the fan-out shape,
the rail's `writing · §N of M` counts events and is correct. With the per-call shape, the card's
progress counter increments once for a Fast-path run that commits **15 sections in one 68KB
Write** — the measured case in `execution-model.md`. The observable defect is the product's
single judged moment: the card sits at `§1 of 9` for eight and a half minutes and then jumps to
done. Conversely, under the fan-out shape the rail cannot implement AD-5's error rule
("on `tool_result` with `is_error: true`, none of them did and **that call** names what failed to
land") because the call identity was destroyed in the fan-out.

This is the general case: **AD-3's vocabulary has eleven event names and zero payload shapes.**
`doc:section-opened`, `doc:prose`, `run:failed` and `session:awaiting-turn` are all equally
undefined. `doc:prose` alone has a second divergence: `input_json_delta` carries *partial JSON of
the tool input*, so one builder emits coalesced raw JSON fragments (leaving the renderer to
accumulate and unescape, which AD-15 arguably forbids) and the other emits decoded markdown text.

**Tightening.** Promote AD-3 from a vocabulary to a contract: a typed payload for every one of
the eleven events declared in `src/shared/`, each with its cardinality stated. Specifically:
`doc:committed` fires **once per `tool_result`** and carries `{ runId, toolUseId, path,
sections: SectionRef[], ok }`; `doc:prose` carries **decoded document text**, never wire
fragments. Add the rule "a new domain event is not in the vocabulary until its payload type and
its emission cardinality are declared alongside it."

---

### H-3 — Session identity: keyed by `agentId` or by `sessionId`

**Units.** *Dev A: `projections/sessions`.* *Dev B: `projections/personas` + `ui/party`.*

**Dev A's choice.** Consistency Conventions, *Naming — personas*: "Addressed by BMad `agentId`
(`bmad-agent-pm`) **everywhere internally**, including party turn attribution. Display
`name`/`title`/`icon` are presentation only and **never used as keys**." So Dev A keys the
session map by `agentId`: `Map<AgentId, Session>`.

**Dev B's choice.** AD-19: "A party transcript row is owned by **the room**, not a persona —
**owner is a session identity, not necessarily an agent**." That sentence only makes sense if a
session has an identity independent of any agent. So Dev B keys by `sessionId` and treats
`agentId` as an attribute of a session (null for a room).

**The incompatibility.** The shell has a 1:1 view and a Party view behind one switch (ui-surfaces),
AD-11 permits concurrency, and the party cast defaults to the five core personas. So John can
plausibly have a live 1:1 session *and* be in a live room. Under Dev A's key the room cannot be
stored at all (it has no `agentId`), or the room displaces John's 1:1 session and AD-7's "a
reload loses nothing" becomes "switching views loses your PRD conversation". Under Dev B's key
there are two live sessions for John, and AD-20's persona state has **two sources for one tile**
with no precedence rule: the 1:1 is `work` (a skill in flight) while the room is idle, or vice
versa. AD-11's "one skill in flight per persona" is also unenforceable — it is stated per
*persona* but can only be checked per *session*.

**Tightening.** A new AD on session identity:

> A session is identified by an opaque `sessionId`. `agentId` is a nullable attribute of a
> session, null for a party room. The sessions projection is keyed by `sessionId`. AD-11's
> one-skill-in-flight invariant is scoped to the session, not the persona. A persona's tile state
> (AD-20) is a defined reduction over **all** sessions that persona participates in, with a
> stated precedence — `error` > `work` > `live` > `note` > `idle`. Whether one agent may hold a
> 1:1 session and a room seat simultaneously is decided here, not discovered at integration.

The conventions line "addressed by `agentId` everywhere internally" must be narrowed to
*attribution and display lookup*, not *keying*, or it directly contradicts AD-19.

---

## HIGH

### H-4 — Two writers into one rail-row state field

**Units.** *Dev A: `sources/fs` + `projections/rail` (disk truth).* *Dev B: `fold/run` (run
annotation).*

**The choices.** AD-2 gives the watcher exclusive right to create rows, remove rows and assert
content, and reserves for the stream a right to "*annotate* a row with run-scoped metadata —
owning persona, section in flight, **stopped**". ui-surfaces enumerates the row states as a single
mutually exclusive set: `saved · <age>`, `writing · §N of M`, `appending · live`,
`stopped · §N of M`. Both developers therefore model **one** `state` field on the row — Dev A
writes `writing`/`saved` into it from the watcher; Dev B writes `stopped` into it from the
stream. Each is doing exactly what its AD authorises.

**The incompatibility.** The measured stop case: the last successful `Write` lands, the watcher
settles the row to `saved · 2s`, then `SIGINT` produces `run:stopped`. Dev B overwrites `saved`
with `stopped · §7 of 15`. Now the rail — the thing AD-2 exists to keep honest — is asserting a
run outcome in the slot reserved for a disk fact, and "the rail can never disagree with disk" is
false in the one scenario CAP-12 is about. Run the same case with the writes ordered the other way
(stop arrives, then a late watcher `change` from the settled temp-rename) and Dev A overwrites
`stopped` back to `saved`, losing the stop entirely. Last-writer-wins on a shared field, in an
architecture whose whole premise is that there is no write side.

**Tightening.** Split the field and name the render function:

> A rail row carries two disjoint, single-owner fields: `disk: { state: 'writing' | 'saved',
> lastSeenAt }`, written **only** by the watcher, and `run: { runId, owner, sectionInFlight,
> outcome: 'running' | 'stopped' | 'failed' } | null`, written **only** by `fold/run` and cleared
> when the run closes. The displayed row label is a pure function of the pair, defined once, with
> a stated precedence. No code path writes both fields.

### H-5 — Two personas writing one artifact falls through both AD-11 and AD-12

**Units.** *Epic "concurrent personas" (AD-11).* *Epic "contention reporting" (AD-12).*

**The choices.** AD-11 permits concurrency and justifies it with a factual claim: "Different
personas run concurrently — **BMad's own disjoint artifact ownership carries that**." AD-12 scopes
contention handling precisely: "When an **external** writer changes a file, the filesystem
arbitrates and last writer wins."

**The incompatibility.** The disjointness claim is false for BMad as installed. `bmad-correct-
course` is described by its own skill contract as assessing impact "**across the PRD, epics,
architecture, and UX documents**" and producing a change proposal; `bmad-retrospective` reads and
annotates epic and sprint artifacts; every skill in a shared planning directory appends to the
same `.memlog.md`. So John running `bmad-correct-course` and Winston running `bmad-architecture`
concurrently is a supported user action that writes one file from two runs.

That collision is **not external** — both writers are harness-launched — so AD-12's rule does not
apply by its own terms, and AD-11 assumes it cannot happen. Two builders now diverge with nothing
to appeal to: the concurrency epic allows both runs and reports nothing (AD-12 says external
only); the contention epic treats any second writer as contention and flags it (AD-12's *spirit*).
Worse, AD-19's owner derivation ("the session that wrote it when the harness observed that write")
has two answers for the same path and no tiebreak, so the rail row's owner flickers between John
and Winston on every `tool_result` — and AD-20's `note` state, which keys off AD-19 ownership,
flickers with it.

**Tightening.** Either bound the concurrency or extend the contention rule. Preferred:

> AD-12's contention reporting applies to **any** second writer to a path a run is writing,
> harness-launched or not. AD-11's justification is replaced: concurrency is permitted and
> **unarbitrated**, and overlapping writes are *reported* on the rail row naming both runs.
> AD-19 is given a tiebreak: the owner of record for a path is the run that most recently produced
> a confirmed `tool_result` for it, and a path with two live claimant runs shows both.

Delete the "BMad's own disjoint artifact ownership carries that" sentence — a builder will rely
on it.

### H-6 — There is no command vocabulary, so dispatch resolution has two owners

**Units.** *Dev A: `renderer/ui` skill-button row.* *Dev B: `main/sources/session` dispatcher.*

**The choices.** AD-3 fixes the event vocabulary main→renderer. The conventions mandate the
reverse direction — "a UI action sends a command to main, which acts and emits" — and then name
**no commands at all**. AD-9 says an entry carries `code`, `description` and exactly one of
`skill` or `prompt`, and that "`skill` [dispatches] as `/<skill-name>`, `prompt` as its text
verbatim."

Dev A already holds the resolved menu (it renders `description` on the buttons), so it implements
`bridge.sendTurn(sessionId, text)` and does the `skill`/`prompt` → turn-text conversion in the
renderer. Fully AD-9 compliant. Dev B implements `bridge.invokeMenuEntry(sessionId, code)` and
resolves against the install projection in main. Also fully AD-9 compliant.

**The incompatibility.** Beyond the two preload surfaces being mutually unimplementable, Dev A's
version is *incorrect under AD-8*. AD-8 re-resolves configuration on file change. The renderer's
menu copy is therefore a stale snapshot; a re-resolution that changes a `prompt`'s text between
render and click dispatches the old text verbatim into the session — and the harness has no way
to know. It also means renderer-supplied arbitrary text reaches the subprocess, which sits
uncomfortably against AD-13's threat model (the renderer is unprivileged and project content is
untrusted, yet the renderer composes what the privileged subprocess executes).

A second instance of the same gap: AD-9 says an entry with neither `skill` nor `prompt` "is a
discovery error **surfaced to the user**, never a silent no-op" — but with no command contract and
no named surface, one builder renders a disabled button with a tooltip and the other raises a
preflight-style banner, and the *code* that must be stable per the error convention is never
assigned.

**Tightening.** Add the missing half of AD-3:

> The command vocabulary is declared in `src/shared/` alongside the event vocabulary, with typed
> payloads: `session:open`, `session:end`, `turn:send`, `menu:invoke(sessionId, entryCode)`,
> `run:stop`, `doc:open-window`, `party:open`. **Resolution of a menu entry to turn text happens
> in main, against the current resolved install.** The renderer sends `code`, never text derived
> from configuration. Every command returns `{ ok } | { code, message, detail? }` per the error
> convention, and discovery-error codes are enumerated.

### H-7 — A window reload mid-run loses the card, and AD-7 promises it cannot

**Units.** *Dev A: `main/projections/sessions` + the delta coalescer (AD-15).* *Dev B:
`renderer/ui/card`.*

**The choices.** AD-15 requires main to coalesce deltas and the card to "commit accumulated text
to one node on an animation frame", with "no React state update driven by an individual
`input_json_delta`". Dev B therefore appends into a DOM text node held outside React — which is
also what AD-7 asks for, since "the renderer is a pure projection" and holds nothing durable.
Dev A coalesces and emits, retaining nothing beyond the coalescing window: AD-7 says main owns
*durable* state, and an in-flight write is by AD-2's own words explicitly *not* project state.

**The incompatibility.** The user reloads the window (or the renderer crashes) six minutes into a
twelve-minute run. The card's DOM node is gone. Main kept no accumulated buffer. The file is not
on disk yet — AD-2 is emphatic that the card renders ahead of disk. So the card remounts empty
and stays empty until the next `tool_result`, and AD-7's "**a reload loses nothing**" is false in
the single scenario where it most matters. The spine states the guarantee and provides no
mechanism for it, and nothing in the IPC contract distinguishes "subscribe to deltas" from
"give me the current state".

This generalises: **the spine never says whether the bridge is snapshot-plus-deltas or
deltas-only.** Dev A builds `rail:snapshot` on subscribe; Dev B builds a deltas-only session
channel. On mount the renderer gets a populated rail and an empty conversation.

**Tightening.**

> Main's sessions projection retains, per in-flight tool call, the full accumulated decoded input
> buffer and the parsed section list, for the life of the run. Every renderer-facing projection
> exposes a **snapshot-on-subscribe** followed by deltas; the snapshot type and the delta type are
> declared together in `src/shared/`. AD-7's "a reload loses nothing" is a test, replayed from
> `fixtures/runs/` with a simulated remount at 50% of deltas.

### H-8 — Main-thread `text_delta` has two legitimate homes

**Units.** *Dev A: `fold/conversation` → `persona:said`.* *Dev B: `fold/document` → card body.*

**The choices.** AD-6: "Only main-thread `text_delta` may render as a persona turn." Dev A routes
every main-thread `text_delta` to `persona:said` and renders it as a chat turn. `execution-model.md`,
adopted as a source, assigns to the live card: "Live card — persona's own voice, pushback (CAP-5)
— same stream — `text_delta`", and ui-surfaces repeats it. Dev B therefore routes main-thread
`text_delta` **during an in-flight run** into the card.

**The incompatibility.** Both builders are following the documents they were handed, and the
spine never adjudicates. If both ship, John's mid-run pushback — the product's headline moment,
named in the success signal as "arguing with him about a requirement" — renders **twice**, once
in the card body and once as a chat bubble. If the routing is made exclusive by whoever integrates
last, the loser's surface goes silent: either the card has no voice during a run, or the
conversation has a twelve-minute hole in its transcript, which then also corrupts what AD-7
persists as the durable transcript.

**Tightening.**

> `persona:said` carries **all** main-thread `text_delta`, run or no run, and is the only source of
> the persisted transcript. `doc:prose` carries **only** decoded `input_json_delta` from the
> in-flight `Write`/`Edit` input. The card body renders `doc:prose` alone. Persona voice during a
> run appears in the conversation, adjacent to the card, never inside it. `execution-model.md` and
> `ui-surfaces.md` are amended accordingly and the amendment is listed in *Spec Amendments Required*.

### H-9 — The `.memlog.md` secondary feed has no event, no channel and no isolation

**Units.** *Dev A: `sources/fs` + card secondary feed (dead-air convention).* *Dev B:
`fold/document` section parser (AD-5 + progress convention).*

**The choices.** The *State — dead air* convention makes `.memlog.md` "the card's secondary feed,
appended entry by entry". The *State — progress* convention makes the same file the source of the
predicted section denominator. AD-3's vocabulary is a closed list of eleven names, none of which
is about memlog, and the conventions warn that "a renderer-only event is a smell" — so Dev A, not
wanting to invent a twelfth name, routes memlog lines onto the card through `doc:prose`, the
existing event whose semantics ("prose on the card") match.

Dev B implements AD-5's section parser as "markdown headings parsed out of the accumulating
buffer" — per `execution-model.md`, the same buffer that feeds the card body.

**The incompatibility.** `.memlog.md` entries are markdown with headings. Routed through
`doc:prose` they enter the buffer Dev B parses, and phantom sections appear in the document's
section list — which then, per the progress convention, **grows the denominator** ("observed
headings win and the denominator grows") and **can never be corrected**, because "a section the
user has already seen is never renumbered". The card's foot lists memlog concern-scan headings as
"not yet written" sections of the PRD. One wrong route, permanently baked into the progress model.

Two smaller divergences ride along:
- **Rail-row filtering is unspecified.** AD-2 says a rail row exists because the watcher saw the
  file under `_bmad/`, full stop. Dev A's watcher therefore surfaces `.memlog.md` as a rail row
  with no derivable owner; Dev B filters dotfiles at the rail projection — and thereby starves the
  card's secondary feed if the feed shares the watcher. No rule says which files are rail-eligible.
- **Which layer parses memlog.** `fold/` may not do I/O (AD-4), so it must be `sources/`; but then
  the parsed shape crosses the bridge and needs a payload type nobody owns.

**Tightening.**

> Add `run:note-appended { runId, path, entry: { at, text } }` to the vocabulary — it is a domain
> event, not a renderer-only one. The card body has two **disjoint** channels: document prose
> (`doc:prose`) and run notes (`run:note-appended`); they are never merged, and the AD-5 section
> parser reads **only** the accumulated tool-call input buffer, never anything watcher-sourced.
> Add a rail-eligibility rule to AD-2 naming which paths under `_bmad/` produce rows (and where
> `.memlog.md` goes), since "everything the watcher sees" and "the project's artifacts" are not the
> same set.

### H-10 — AD-5 gives no parse rule for `Edit`, and `Edit` is 20 of the 21 observed writes

**Units.** *Dev A: `fold/document` section parser.* *Dev B: `projections/rail` progress label.*

**The choices.** AD-5: "`Write` and `Edit` are both stream sources" and "every section parsed from
that call's accumulated input becomes committed together". Dev A applies that uniformly: parse
headings from each call's accumulated input, whatever the tool. Dev B reads the same AD alongside
the measured behaviour — a Fast path is "a single 68,394-byte write ~8.5 minutes in, **then ~20
revision edits of 150–2,200 B each**" — and concludes that only `Write` carries document structure,
treating `Edit` as a revision touch that confirms nothing new.

**The incompatibility.** An `Edit` call's input is `{ file_path, old_string, new_string }` — a diff
fragment, not a document. Dev A's uniform parse produces: zero sections for the 18 edits that touch
prose mid-section (so those commits report nothing), and a **duplicate** section commit for the two
edits whose `new_string` happens to begin with a heading. Under the progress convention that
duplicate grows the denominator and cannot be undone. The card ends a successful run reporting
`§17 of 17` where the rail reports `§15 of 15`, from the same stream, because the two folds
disagree about what an `Edit` means. If both surfaces are fed by one fold the disagreement is
invisible until a user compares them — which is the rail and the card side by side, permanently.

Related and unhandled: AD-5 enumerates `Write` and `Edit` only. `memlog.py` writes via a Python
script invoked through `Bash`, and any BMad skill that writes through a script produces a file
with **no** `Write`/`Edit` `tool_result` at all. The watcher sees it (AD-2 is satisfied), but the
card's commit never fires, so an in-flight card can hang on its last section until the run's
`result` row.

**Tightening.**

> AD-5 states a per-tool parse rule: sections are parsed from a `Write`'s accumulated `content`
> only. An `Edit`'s `tool_result` confirms a **revision** to an already-committed path and emits
> `doc:revised { runId, toolUseId, path }`; it never adds, removes or renumbers a section. Writes
> that reach disk through any other tool are watcher-only facts with no card commit, and the card's
> behaviour in that case is stated.

### H-11 — Re-resolving the install while a session is live orphans the persona

**Units.** *Dev A: `projections/install` + `sources/install` (AD-8, AD-10).* *Dev B:
`projections/sessions` (AD-18).*

**The choices.** AD-8: config files "are watched and **re-resolved on change**". AD-10: the
`[agents.*]` tables "are the authoritative roster". Dev A therefore replaces the roster atomically
on every resolver completion — that is what "authoritative" means. AD-18: "Sessions are reclaimed
when the persona is closed or the session ended (AD-21)." Stop is neither, and re-resolution is
neither, so Dev B keeps every live session running across a roster change.

**The incompatibility.** The user edits `_bmad/custom/` (or a BMad update lands, or `uv` hiccups
and the resolver returns an error) while John is eight minutes into a PRD. Dev A's roster no longer
contains `bmad-agent-pm`, or contains it with a different menu. Results:

- The persona tile disappears while the session keeps writing to the project. The **stop control
  lives on the card, and the card is scoped to a persona that no longer exists in the roster** —
  CAP-11's stop becomes unreachable for a live run. AD-21 provides the end-session control as "the
  only way to clear a persisted conversation", and it too hangs off a tile that is gone.
- Or the menu changes mid-run, so AD-11's "that persona's skill buttons are disabled while it does"
  is applied to a *different* button set than the one the run was launched from.
- On resolver failure the two developers also diverge on fallback: Dev A can return last-good
  (rail and menus keep working, AD-8's "effective configuration" is now stale and the user is not
  told) or an empty roster plus an error (AD-17's "names what is missing", but every tile vanishes).
  Both are AD-compliant and they are opposite behaviours.

**Tightening.**

> Resolution produces an immutable, versioned install model. A session pins the install version it
> was opened with; menu and identity changes apply to a persona only when it has no run in flight.
> An agent removed from the roster while it holds a live session is marked `orphaned` — tile,
> stop control and end-session control remain reachable — and is dropped only when its session
> ends. Resolver failure retains the last-good model and surfaces `{ code: 'install/resolve-failed',
> … }`; it never empties the roster.

---

## MEDIUM

### H-12 — One 400 ms number, two different timers

**Units.** *Dev A: `sources/fs` watcher configuration.* *Dev B: `projections/rail` settle logic.*

AD-2 derives in-flight state for non-harness writers "from watcher activity plus a **settle
debounce**". The *State — watcher* convention says the watcher is configured "for coalescing —
rapid appends land inside **~400ms** and do not arrive one event per entry". Dev A sets chokidar's
coalescing/`awaitWriteFinish` window to 400 ms. Dev B, reading the same sentence as the settle
figure, sets the rail's settle debounce to 400 ms.

If Dev A's coalescer emits at burst *start*, Dev B's settle fires at T+400 while the write is
still in progress and the row flips `saved` → `writing` → `saved` repeatedly. If it emits at burst
*end*, effective settle is 800 ms and CAP-6's "indicates while being written, and settles to saved"
lags visibly. The spine supplies one number for two timers that must be distinct and ordered.

Second, related: chokidar's **initial scan** emits `add` for every existing file. Dev A leaves
`ignoreInitial` false (AD-2's letter: a row exists because the watcher saw the file). Dev B's
settle logic makes every one of those rows `writing` for 400 ms — so the entire rail pulses at
launch, violating AD-20's "no element animates unless the thing it depicts is actually happening".

**Tightening.** Name two separate constants with a stated ordering invariant
(`settleDebounce > coalesceWindow`), state where the coalescer emits, and state that initial-scan
events are distinguishable from live events and enter the rail directly as `saved`.

### H-13 — Path identity: rename and delete semantics are undefined

**Units.** *Dev A: `projections/rail`.* *Dev B: `main/windows` document window.*

Rows are keyed by "project-relative POSIX path" (conventions). A watcher sees a rename as
`unlink` + `add`. AD-2 permits only the watcher to remove a row, so Dev A removes the old row and
creates a new one — which discards the run annotation and the AD-19 observed-write ownership, so a
file renamed mid-pipeline loses its owner and reverts to artifact-class derivation or to none.
Dev B's document window "reload[s] from the watcher, not from a renderer-initiated read"
(AD-13) — and on `unlink` there is nothing to reload. Close the window? Show empty? Keep the last
content and say nothing? Three defensible choices, no rule, and one of them silently shows a stale
document as if it were current, which is the class of error AD-2 exists to prevent.

**Tightening.** State row identity and lifecycle: whether rows are tombstoned or removed, whether
rename is detected, whether run annotations survive a path change, and the document window's
required behaviour on `unlink` (name it: the window enters a `removed` state, keeps the last
rendered content, and labels it as no longer on disk).

### H-14 — Replay is not deterministic because timestamp provenance is unspecified

**Units.** *Dev A: `fold/*` author writing replay tests against `fixtures/runs/`.* *Dev B:
`sources/session` stream adapter.*

AD-4 requires every interpreter to be "a pure function of the event sequence — no I/O, no
filesystem, **no wall clock except as an injected value**". The conventions require "epoch
milliseconds in events". Dev B stamps `at` in the source adapter as frames arrive — correct for
live operation, and it keeps `fold/` clock-free. But the recorded `stream-json` log's format is
never specified, so it plausibly records only the raw frames. Replay then re-stamps at replay wall
time, and Dev A's equality assertions over emitted events are non-deterministic — so Dev A either
strips timestamps before comparison (silently removing time from the test corpus that AD-4 exists
to provide, including elapsed-time and settle behaviour) or the corpus is unusable for the four
mandated scenarios.

**Tightening.** Specify the session log format: one JSON line per frame carrying `{ receivedAt,
frame }`. Replay injects `receivedAt` as the clock. The four mandated fixtures assert full event
equality including timestamps.

### H-15 — Stop has two possible event orderings and both must be handled

**Units.** *Dev A: `ui/card` stop control and the CAP-12 recovery flow.* *Dev B:
`sources/session` stop implementation.*

AD-18 records the open risk honestly — `SIGINT` may end the session rather than the turn — and says
the trade "must be surfaced to the user, never hidden". That is a "never" with no mechanism and no
owner. Dev A builds the CAP-12 experience on AD-18's premise that a session survives to explain the
failure "in the persona's own voice"; Dev B implements stop as `SIGINT`, which on the measured
evidence exits the subprocess `rc=0`. If the risk materialises, Dev A's entire recovery surface
sits on a session that no longer exists, and AD-7's persisted transcript ends mid-write with no
closing turn.

The integration-level divergence is the **event sequence**: `run:stopped` then `session:closed`,
versus `session:closed` alone with no `run:stopped`. Two consumers will handle one ordering each.

**Tightening.** Regardless of how the spike resolves, state now: stop emits `run:stopped` before
any `session:closed`, both orderings are handled by the sessions projection, and when the session
does die the harness renders a **harness-authored** system notice (explicitly not persona voice,
per the persona-voice convention) naming the section reached and offering to reopen the persona.
Name that notice as the surfacing mechanism AD-18 currently only promises.

### H-16 — Two windows on one project, and the `userData` key is not canonicalized

**Units.** *Dev A: `main/windows` (window lifecycle).* *Dev B: `projections/sessions` +
persistence (AD-1, AD-7).*

AD-1 puts transcripts in `userData` "keyed by project path"; the deployment section says "One
project per window" — which constrains windows, not projects, and nothing forbids two windows on
the same project. Main is a single process, so Dev B naturally makes the sessions projection
global and keyed by project: the second window shares John's live session and its transcript. Dev A
naturally scopes sessions to a window: two independent Johns, two watchers on one tree, two
concurrent appends to the same `userData` transcript file. Both readings are available and they
produce opposite products.

Separately, "keyed by project path" is not canonicalized: `/Users/x/proj` opened once directly and
once through a symlink yields two transcripts for one project, and AD-7's cross-restart continuity
silently fails.

**Tightening.** State the cardinality (a project has at most one live session set; opening a second
window on the same project focuses the existing one, or shares main's projections read-only) and
state that the `userData` key is the `realpath`-resolved, case-normalized absolute project path.

---

## LOW

### H-17 — `artParams` shape: hex literals or token names

**Units.** *Dev A: `design/portrait.ts` (AD-16).* *Dev B: `design/tokens.css` owner (AD-14).*

AD-14 says "a literal colour, dimension, radius or font stack in a component is a defect" and makes
`tokens.css` the single visual contract. AD-16 requires `portrait(artParams, size, state)` to be
pure and asset-free, with curated params for the five core personas — and the mockup authored those
params as hexes. Dev A keeps skin/hair/shirt hexes inside the portrait module (art parameters are
data, not design tokens; a pure function cannot read CSS custom properties). Dev B moves them into
`tokens.css` to satisfy AD-14, making `artParamsFor(agentId)` return token names.

The two `artParams` shapes are not interchangeable: a curated param file written as hexes will not
load into a token-name renderer, and the derived-from-`agentId` path (which must hash into a colour
space) cannot produce token names at all without a fixed enumerated palette. AD-16's `state`
parameter compounds it — a state-tinted portrait genuinely does need AD-20's `--green`/`--amber`/
`--red`, so the answer is not simply "portraits are exempt".

**Tightening.** State that `artParams` is a value type of literal colours owned by `design/portrait`
and explicitly exempt from AD-14, while any **state** affordance on a portrait resolves through the
AD-20 state tokens. One sentence in AD-16 closes it.

### H-18 — "No generic `invoke` passthrough" does not exclude one generic event channel

**Units.** *Dev A: `preload/` author.* *Dev B: reviewer enforcing AD-13.*

AD-13 forbids "a generic `invoke(channel, …)` passthrough" and requires "one narrow, explicitly
enumerated preload API". Dev A exposes `onDomainEvent(cb: (e: DomainEvent) => void)` — one
enumerated method, but a union payload covering all eleven event types, so every future main-side
event reaches the renderer without the preload surface changing. That is enumeration in letter and
a passthrough in effect, and it makes the bridge unauditable by inspection, which is the property
AD-13 was buying. Dev B enumerates per-projection subscriptions.

This is a real fork (the two preload files are mutually incompatible) but low severity: both are
secure, and the cost is auditability rather than correctness.

**Tightening.** State whether the event channel is per-projection or single-union, and — if
single-union — that the union type is exhaustively declared in `src/shared/` and reviewed as the
bridge surface.

---

## Boundaries stated as "never" with no detection mechanism

Listed for completeness; each is a real enforcement gap but only the first two produced a
two-builder divergence above.

| AD | The "never" | Detection today |
| --- | --- | --- |
| AD-7 | "a reload loses nothing" | none — see H-7 |
| AD-18 | the stop/session trade "must be surfaced to the user, never hidden" | none — see H-15 |
| AD-1 | "No harness code path writes inside the project root" | none. A single `fs.writeFile` under the project root in `windows/` or `sources/` violates the spine's founding premise with no test and no lint rule. A repository-level guard (lint on absolute-write call sites in `main/`, plus a test that runs a fixture session with the project root mounted read-only) is cheap and proportionate to how load-bearing AD-1 is. |
| AD-4 | "no I/O, no clock" in `fold/` | none. An import-boundary lint (`fold/` may not import `node:fs`, `node:child_process`, or call `Date.now`) is the standard mechanism and is absent. |
| Layer table | "No arrow points upward" | none. Same remedy: an import-boundary rule per layer, enforced in CI. |
| AD-14 | "A literal colour, dimension, radius or font stack in a component is a defect" | none. Stylelint/ESLint rules exist for exactly this; without one, AD-14 is aspirational and H-17 has no arbiter. |
| AD-16 | portraits are "pure, deterministic" | partly covered — "Determinism is asserted in tests" — but purity (no I/O) is not, and the art-direction target is by nature unenforceable, which the spine should acknowledge by naming a human sign-off gate rather than implying a test. |

## Ambiguities resolved differently depending on reading order

| Question | Reading AD-x first | Reading AD-y first |
| --- | --- | --- |
| When does a run end? | AD-11 (user may type mid-run) → runs are correlation-scoped | AD-18 (`result` row is terminal) → the next `result` ends it — **H-1** |
| Is a persona keyed by agent or session? | Conventions (`agentId` everywhere) | AD-19 (owner is a session identity) — **H-3** |
| Where does main-thread `text_delta` render? | AD-6 (persona turn) | execution-model / ui-surfaces (card body) — **H-8** |
| Does an `Edit` commit sections? | AD-5 ("`Write` and `Edit` are both stream sources") | measured behaviour (20 edits are revisions) — **H-10** |
| Who resolves a menu entry to turn text? | AD-9 (renderer has the menu) | AD-8 (only main holds effective config) — **H-6** |
| Does the roster or the session win on re-resolution? | AD-10 (roster is authoritative) | AD-18 (sessions end only on close) — **H-11** |
| Does a rail row show `saved` or `stopped`? | AD-2 (watcher owns disk truth) | AD-2's own annotate clause (stream may say stopped) — **H-4** |

## Summary of tightenings, as work

| # | Tightening | Form |
| --- | --- | --- |
| H-1 | Run as a correlation scope; `runId` on every event; main-owned turn queue | new AD |
| H-2 | Typed payload + cardinality for all eleven events | rewrite AD-3 |
| H-3 | `sessionId` is the key; `agentId` nullable; persona state is a reduction with precedence | new AD |
| H-4 | Split rail row into watcher-owned `disk` and stream-owned `run`; one render function | amend AD-2 |
| H-5 | Contention applies to harness-launched writers too; AD-19 tiebreak; delete the disjointness claim | amend AD-11, AD-12, AD-19 |
| H-6 | Declare the command vocabulary; main resolves menu entries | new AD |
| H-7 | Main retains in-flight buffers; snapshot-on-subscribe for every projection | amend AD-7, AD-15 |
| H-8 | `persona:said` = all main-thread text; `doc:prose` = tool-input only | amend AD-3, AD-6 |
| H-9 | `run:note-appended`; two disjoint card channels; rail-eligibility rule | amend AD-2, AD-3 |
| H-10 | Per-tool parse rule; `doc:revised` for edits; non-tool writes defined | amend AD-5 |
| H-11 | Versioned immutable install model; sessions pin a version; `orphaned` personas; last-good on failure | amend AD-8, AD-10 |
| H-12 | Two named timers with an ordering invariant; initial scan distinguished | amend watcher convention |
| H-13 | Row identity, rename/delete lifecycle, document-window `unlink` behaviour | amend AD-2, AD-13 |
| H-14 | Session log format with `receivedAt`; replay injects it | amend AD-4 |
| H-15 | `run:stopped` before `session:closed`; harness-authored system notice | amend AD-18 |
| H-16 | Project/window/session cardinality; canonicalized `userData` key | amend AD-1, AD-7 |
| H-17 | `artParams` exempt from AD-14; state affordance uses state tokens | amend AD-16 |
| H-18 | Per-projection vs single-union event channel, stated | amend AD-13 |
| — | Import-boundary and write-boundary lint/CI rules for AD-1, AD-4, AD-14 and the layer table | new section |
