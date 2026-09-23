---
type: rubric-review
target: ../ARCHITECTURE-SPINE.md
spec: ../../../../specs/spec-bmad-visual-harness/SPEC.md
reviewer: rubric
date: '2026-09-23'
---

# Rubric review — ARCHITECTURE-SPINE.md (bmad-visual-harness)

Judged against the fixed checklist. Only failures and weaknesses are reported; anything not
listed passed. The spine is strong overall — the paradigm framing is real load-bearing work,
AD-2/AD-5/AD-6/AD-13/AD-16 are exemplary invariants, and the Spec Amendments table is the kind
of thing most spines omit. The findings below are what would let epics diverge anyway.

---

## 1. Real divergence points — fixed? any missed?

### F1 — CRITICAL. The run boundary is undefined under the new session model.

This is the central unrepaired seam from the late revision.

AD-18 states: *"Chat turns and skill invocations are both turns into that session — there is no
second run kind."* Three other ADs then key their entire behaviour off distinguishing exactly
those two things:

- **AD-11**: *"A persona session may have at most one skill invocation in flight; that persona's
  skill buttons are disabled while it does, though the user may still type to them."*
- **AD-2**: *"The live document card is run-scoped: born with a skill invocation, dies with it."*
- **AD-20**: *"`work` = a skill invocation is in flight"*.

Nothing in the spine says **how main decides a run started or ended** inside a session where both
kinds of turn look the same on the wire. AD-3's vocabulary contains both `session:*` and `run:*`
events, which implies a run is a sub-span of a session, but the boundary rule is never fixed.
Candidate rules a builder could plausibly pick, all incompatible:

- a run is any turn whose text begins `/` (harness-side bookkeeping at dispatch time);
- a run is any turn that produces a `Write`/`Edit` tool call;
- a run is any turn that emits a `SkillUse`/skill-activation frame;
- a run is any turn at all (making AD-20's `work` fire on plain chat).

The session epic, the card epic, the rail epic and the persona-tile epic all need the same
answer. This is exactly the divergence a spine exists to close, and it is open.

**Corollary gap in AD-20.** AD-20 claims *"exactly one source each"* for five states. Under
AD-18 there is now a sixth situation with no state at all: **the persona is answering a plain
chat turn.** It is not `idle` (something is running), not `work` (no skill invocation), not
`live` (no attached process). The persona tile has no defined appearance for the single most
common interaction in the product. Either `work` covers chat turns — which then contradicts
AD-11's button-disable rule, which must *not* fire on chat — or a state is missing.

**Corollary gap in AD-11.** *"the user may still type to them"* while a skill turn is in flight:
with one stdin-driven session and one turn in flight, a typed turn is either queued by the
harness, queued by the CLI, or injected mid-turn. Three different behaviours, three different UX
outcomes, not chosen.

### F2 — HIGH. Party mode has no runtime model.

AD-18 defines exactly one session invocation: `claude -p "/bmad-agent-<x>" …`. Party mode is
CAP-9, it binds to no AD that defines its process, and:

- AD-19 asserts *"A party transcript row is owned by **the room**, not a persona — owner is a
  session identity, not necessarily an agent"* — introducing a non-persona session identity that
  no AD ever creates.
- AD-11's concurrency rule speaks only of personas. Whether a party room may run while 1:1
  persona sessions are live, and what the cast tiles show while it does (`work`? `idle`?), is
  unfixed.
- The capability map sends CAP-9 to `sources/session`, so the same adapter serves both, but the
  adapter's contract covers only the persona form.

The party epic and the session epic must agree on process identity, lifecycle, concurrency and
state projection, and the spine gives them nothing to agree on. Add an AD (or extend AD-18) that
names the room session — its invocation, whether it is one session or N, and how AD-11 and AD-20
apply to it.

### F3 — HIGH. Persistence authority and versioning are undecided.

AD-4 requires every session's raw `stream-json` to be logged to `userData`. AD-7 requires the
transcript, session state and install model to be *persisted* to `userData`. Nothing says which
is authoritative on relaunch: does the harness **re-fold the raw log** (the pure-fold story of
AD-4 makes this attractive) or **load a materialised projection** (the plain reading of AD-7)?
The fold epic and the persistence epic can each build a coherent system on opposite answers, and
they will not compose.

Two dimensions ride on that and are also silent:

- **Schema / vocabulary versioning.** AD-3 fixes a domain event vocabulary that *will* change.
  Nothing says persisted state carries a version, or what happens to a stored transcript written
  by an older vocabulary. AD-7 promises cross-restart continuity; nothing defends it against the
  first vocabulary change.
- **Retention.** AD-15 sizes one write at 5,795 deltas / 69,031 characters, and SPEC assumes
  multi-minute runs. Raw stream logs under `userData` grow without bound and no AD or convention
  names rotation, pruning or a cap. Whoever builds `sources/session` and whoever builds
  persistence will each assume the other does it.

### F4 — MEDIUM. Process lifecycle on crash/quit is unowned.

AD-18 says sessions *"are not held across app restarts"*. Nothing says who reaps them. If the
harness is force-quit or crashes with N long-lived `claude` children attached, the spine has no
rule for orphan detection or cleanup at next launch, and AD-17's preflight does not look for
them. One epic will assume Electron's `before-quit`; another will assume detached children die
with the parent (on macOS they do not).

### F5 — MEDIUM. Read roots are incompletely named, and one resolver is misplaced.

The spine's source-of-truth story names *"the project filesystem, the BMad install"* and, in
practice, only `_bmad/`. But every `[[agent.menu]]` actually lives in
`.claude/skills/bmad-agent-<x>/customize.toml`, which the spine never names as a read root.
AD-8's *"These files are watched and re-resolved on change"* therefore points at an unnamed
tree, while AD-2's watcher is explicitly scoped to `_bmad/`. Two watchers on two roots with two
different purposes, one of them unnamed — the install epic and the rail epic will not agree on
what "the watcher" means.

Verified against this repo:

- `_bmad/scripts/resolve_config.py` — exists.
- `_bmad/scripts/resolve_customization.py` — exists.
- `_bmad/scripts/resolve_party.py` — **does not exist.** It lives at
  `.claude/skills/bmad-party-mode/scripts/resolve_party.py`.

AD-8 lists all three as if peers, so a builder will look for `resolve_party.py` where it is not.
Fix the rule to name each resolver's actual location, or state the resolution strategy rather
than the paths.

### F6 — MEDIUM. AD-3's vocabulary covers only the stream; the rail's events are unenumerated.

AD-3 enumerates eleven domain events, all session/run/doc. The rail is fed by the filesystem
channel (AD-2) and also crosses the bridge, and the naming convention insists events are
*"declared once in `src/shared/`"* — but no `file:*` / rail events are named anywhere. The rail
epic invents its own. Given AD-2 makes the two channels the system's single most important
boundary, both sides of it should be enumerated.

### F7 — MEDIUM. `live` state has no source.

AD-20 claims *"exactly one source each"* and defines `live` as *"a long-running attached process
the session started (a test watcher)"*. No event in AD-3's vocabulary reports that, and no source
adapter is assigned it in the capability map. CAP-2 explicitly spans *"planning and build"*, so
this is not a corner case. Either give `live` a source event or defer the state.

### F8 — LOW/MEDIUM. Testing is decided for one layer only.

AD-4 is an excellent testing invariant for `fold/`. Nothing else is decided: the Stack table
names no test runner, and `fixtures/runs/` has no fixture format, no naming rule and — more
importantly — **no redaction rule**. Recorded `stream-json` of real runs contains full project
document content and absolute paths, and the spine commits that corpus into the repo. That sits
awkwardly beside the logging convention's *"never to the project"* instinct. At minimum: fix the
fixture file format and state that recordings are captured against throwaway subjects only.

---

## 2. Enforceability, and Prevents vs. Rule

Most rules are genuinely citable. Exceptions:

### F9 — MEDIUM. AD-17's Rule does not prevent what its Prevents claims.

**Prevents:** *"the harness opening to an empty room with no personas and no explanation."*
**Rule:** checks `claude` on `PATH` + authenticated, and `uv` with Python 3.11+.

The most likely cause of an empty room is not a missing binary — it is being pointed at a
directory with no `_bmad/`, no `config.toml`, or an empty `[agents.*]` roster, or a resolver
that exits non-zero. None of those is in the preflight. Extend the Rule to cover install
presence and a non-empty roster, plus the resolver's failure contract (AD-8 mandates running
three subprocesses and never says what happens when one fails or hangs — no timeout, no
fallback, no surfaced error shape beyond the generic `{code, message, detail?}`).

### F10 — LOW. Unenforceable clauses.

- AD-11 *"A collapsed card is never a spinner"* — an aesthetic assertion; a reviewer cannot point
  at code. The enforceable half ("the collapsed line carries persona · section · elapsed · stop")
  is already stated; drop the other half or make it a token/component rule.
- AD-16 *"reads as childish"* — same. The concrete half (procedural SVG, pure, deterministic, no
  assets, parameter list, `state` in the signature) is fully enforceable and carries the weight.

---

## 3. Deferrals that leave an open divergence

### F11 — MEDIUM. "Party mode's *Pause room*" defers a control that `ui-surfaces.md` places in the
header, without saying what v1 does with it. Remove, disable, or hide? The party epic will
choose; a second surface built later will choose differently. Say "the control does not ship".

### F12 — LOW. "Multi-project windows and cross-project state — *nothing here depends on it
staying true*" is not accurate. AD-1 keys `userData` by project path, AD-7 persists per project,
and the deployment section states "One project per window". Several things depend on it; they
are just cheap to change. Reword rather than claim independence.

### F13 — LOW. "Light theme" deferral sits under AD-14, which hardcodes a dark ramp into the
spine (see F17). If the theme is ever revisited, AD-14 must be rewritten rather than
re-tokenised — a deferral that mortgages an AD.

Other deferrals (Agent SDK, party disagreement tracking, signing, Windows/Linux, virtualization,
scope-tier Should/Could) are clean: each has a revisit trigger and none leaves two units free to
choose incompatibly.

---

## 4. Named technology — verified

Checked live against the npm registry on 2026-09-23. **All current, no findings:**

| Name | Spine | Registry |
| --- | --- | --- |
| electron | 44.4.5 | 44.4.5 |
| react | 19.3.0 | 19.3.0 |
| typescript | 7.0.2 | 7.0.2 |
| vite | 8.3.0 | 8.3.0 |
| electron-vite | 5.0.0 | 5.0.0 |
| electron-builder | 26.15.3 | 26.15.3 |
| chokidar | 5.0.0 | 5.0.0 |
| markdown-it | 15.0.2 | 15.0.2 |
| dompurify | 3.4.16 | 3.4.16 |

Node 24 / Chromium 152 for Electron 44 are consistent with the Electron release cadence. The
un-bundled dependencies (`claude`, `uv` + Python 3.11+) are correctly marked as the user's own
and are covered by AD-17.

Minor: the Stack table names no test runner, no linter and no package manager, while naming the
build chain in full — see F8.

---

## 5. Spec capability coverage

All twelve CAPs are mapped and each has at least two governing ADs. Gaps:

### F14 — MEDIUM. A real spec amendment is missing from the amendments table.

AD-10 states *"`identity` and `communication_style` are not harness-injected."* That overrides
**two** source statements not listed in the table:

- `bmad-install-contract.md` maps `identity` and `communication_style` to *"conversation system
  context"* — i.e. harness-injected.
- **CAP-3's success clause**: *"identity and communication style are **read from the install**
  and shape how that persona talks."*

The table lists the menu and roster amendments to `bmad-install-contract.md` but not this one,
and lists no CAP-3 amendment at all. Since the table is the mechanism that keeps upstream and
spine from diverging, an omission here is a live divergence.

### F15 — LOW. CAP-7's escapes (*Reveal in Finder*, *Open in editor*) are covered only by the
platform convention. That is probably the right altitude, but the capability map governs CAP-7
with AD-12/13/21, none of which mentions them — so a reader tracing CAP-7 finds no owner.

---

## 6. Dimensions left silent

| Dimension | Status |
| --- | --- |
| Deployment / environments / infra | **Covered.** The "Deployment and environments" section is explicit and correctly scoped (one env, macOS, unsigned local build, no server, no network service). |
| Operations | **Weak.** No log retention/rotation (F3), no crash/orphan handling (F4), no resolver timeout/failure contract (F9). |
| Security | **Partial — and internally contradictory.** See F16. |
| Testing | **Partial.** One layer only; no runner, no fixture contract, no redaction (F8). |
| Data | **Partial.** Event and path shapes are fixed; persistence authority, versioning and migration are not (F3). |
| Observability | **Thin but adequate for altitude.** Structured logging to `userData` plus the raw stream log as forensic record. No decision on surfacing errors to the user beyond AD-20's `error` alert and the `{code, message, detail?}` envelope, which is acceptable here. |
| Performance | **Covered** by AD-15 with real sizing. |
| Accessibility | **Silent** beyond `prefers-reduced-motion` in AD-20. Probably correct at this altitude for a personal tool; noting it as a conscious omission. |

### F16 — HIGH. The security dimension contradicts itself.

AD-13's title declares *"project content is untrusted"*, and its Rule defends the renderer
accordingly (sandbox, no generic IPC passthrough, sanitized markdown). But two other ADs execute
project-supplied code with full user privilege:

- **AD-8** mandates invoking `resolve_config.py`, `resolve_customization.py` and
  `resolve_party.py` — arbitrary Python from the pointed-at project, run under `uv`.
- **AD-18** spawns `claude … --setting-sources project,local`, which by design loads the target
  project's skills and settings.

Both are correct decisions — the product cannot work otherwise. The defect is that the spine
never states the trust boundary it is actually adopting: *"pointing the harness at a project is
equivalent to running its code; the sandbox protects the renderer from project **content**, not
the machine from project **code**."* Without that stated, AD-13's untrusted-content premise and
AD-8's execute-project-code mandate read as contradictory, and an epic will eventually try to
"fix" one of them. Add the boundary statement, and bound the resolver subprocess (cwd, argv,
timeout, non-zero-exit behaviour).

---

## 7. Present but doesn't belong

### F17 — MEDIUM. AD-14 is mostly seed.

The invariant is one sentence: *"`design/tokens.css` is copied unchanged from the mockup's
`:root` and is the sole source of every colour, dimension, radius and font stack; a literal in a
component is a defect."* That is enforceable and closes the divergence.

What follows — the full five-step hex ramp, every hairline and text-ramp name, the layout
constants, the radius family, the type scale — is the *contents of a file that will exist*.
It is true at cold start and owned by `tokens.css` the moment it exists, which is the definition
of seed. It also duplicates values that already exist verbatim in the binding mockup, creating a
second place to update. I verified the values do match the mockup today; that is precisely the
problem, because nothing keeps them matching tomorrow.

Keep in the AD: the copy-unchanged rule, the no-literals rule, the observation that the mockup
expresses some load-bearing values as literals so those must be *named as tokens* in the same
file, and the one genuinely new decision — the separate `note`-state blue. Move the enumeration
to the seed section or delete it in favour of the mockup reference.

### F18 — LOW. Narrative in the Design Paradigm.

Paragraphs 2 and 3 (*"That single framing carries most of this spine for free…"*, *"One product
test overrides every architectural virtue here…"*) are rationale and restated spec constraint.
The framing sentence and the layer table are the spine; the rest is essay. AD-14/16/20 already
carry the product test as rules.

### F19 — LOW. AD-18's Rule contains an "Open risk" paragraph that is also Open Item 2. An AD's
Rule should be the decision; the unknown belongs in Open Items only. Same for AD-15's *"5,795
deltas / 69,031 characters"* and AD-9's *"60% of that menu inert"* — both are evidence, correctly
placed in Prevents/sizing, but AD-15's belongs in Prevents rather than trailing the Rule.

---

## 8. ADs that are conventions, conventions that should be ADs

### F20 — MEDIUM. Two conventions are ADs in disguise.

- **"State — watcher."** The spine itself says *"Misconfigure it and appends are missed or
  double-counted."* That is a correctness invariant binding CAP-6 and CAP-5, derived from
  measured behaviour (atomic temp-file rename, ~400ms coalescing, whole-file document commits).
  A reviewer needs to be able to say "that violates AD-n", and today cannot.
- **"State — progress."** Where the section list and the denominator come from, headings winning,
  the denominator growing, never renumbering a seen section, and the foot listing names — this is
  a contract *between* the fold epic and the card epic, and it shapes the payload of
  `doc:section-opened`. It is an AD.

### F21 — LOW. AD-21 bundles four rules, one of which is positive.

*"No guidance / no launcher / no editor"* are one coherent negative-surface decision. The fourth
sentence — *"An explicit end-session control exists and is the only way to clear a persisted
conversation"* — is a positive lifecycle decision that AD-18 cross-references as
*"session ended (AD-21)"*, i.e. the session-lifecycle rule is hiding inside the negative-surface
AD. Move it to AD-18 or AD-7 where lifecycle lives.

Conversely, the conventions that *are* correctly conventions (naming, path form, time form, error
envelope, mutation discipline, logging, platform confinement, persona voice) are well chosen.
The "Cross-cutting — persona voice" convention is arguably strong enough to be an AD given it
enforces the spec's central trust constraint, but AD-6 and AD-18 already cover the mechanism.

---

## Internal consistency

### F22 — MEDIUM. The layer table contradicts its own prose and diagram.

The table is introduced as *"Layers, in dependency order — each may depend only on what sits
below it"* and orders them View → Design → Bridge → Projections → Fold → Sources. By that rule:

- **View sits above Projections**, so `ui/` may depend on `projections/`. Two lines later:
  *"Nothing in `ui/` may reach `sources/`, `fold/` or `projections/`."*
- **Fold sits above Sources**, so `fold/` may depend on `sources/`. Same sentence forbids it.

The mermaid diagram agrees with the prose (no `UI --> PROJ`, no `FOLD --> SRC`) and therefore
also contradicts the table. The table is not a dependency order at all — it is two independent
stacks (a renderer stack and a main stack) joined only at `shared/`. Either relabel it, or state
the allowed edges explicitly.

### F23 — MEDIUM. `preload/` and `windows/` exist in the source tree but not in the layer model.

Both are real and privileged: AD-13 makes `preload/` *the* security boundary, and the data
convention grants `windows/` the right to hold absolute paths. Neither appears in the layer table
or either diagram, so neither has a stated dependency rule. Given AD-13's weight, `preload/`
being absent from the layer contract is a notable hole.

### F24 — MEDIUM. Stale cross-reference: "AD-20's platform convention".

Deferred › *Windows and Linux support*: *"AD-20's platform convention keeps the port additive
rather than structural."* AD-20 is "Every indicator is driven by real system state". The platform
rule is a **convention** ("Cross-cutting — platform"), not an AD. Wrong pointer.

### F25 — HIGH. Stale run-model mechanics inside AD-18.

Two leftovers of one-subprocess-per-skill survive inside the AD that replaced it:

1. *"Terminal run states come from **the final `result` row**… its absence marks finished.
   **Exit code is not the signal.**"* Both sentences describe a process that terminates when the
   run does. In a `--input-format stream-json` session the CLI emits a `result` row **per turn**
   and keeps running; there is no "final" one until the session closes, and "exit code" is not a
   per-run signal that anyone would reach for any more. Restate as: each turn terminates with a
   `result` row, and *that turn's* row carries the run outcome. Note this also interacts with F1:
   the per-turn `result` row is probably the cleanest run-boundary signal available, and saying
   so would close both findings at once.

2. The invocation string: `claude -p "/bmad-agent-<x>" --output-format stream-json
   --input-format stream-json …`. The `-p "<prompt>"` positional is the one-shot form copied from
   `execution-model.md`; with `--input-format stream-json` the turns arrive on stdin. Passing both
   is at best redundant and at worst starts a one-shot run. The AD calls out three flags as
   load-bearing and correctly explains each — it should also say how the *first* turn (agent
   activation) is delivered, stdin or argv.

Also worth a pass: `fixtures/runs/` and the `run:*` prefix are fine under the new model (a run is
a sub-span), but only once F1 defines the span.

### F26 — LOW. Mermaid.

Both diagrams parse and both agree with their immediate prose. The layer diagram disagrees with
the layer *table* (F22). The process diagram's claim *"`REND` and `DOC` have no edge to `FS`,
`CLI` or `INST`. That absence is AD-13"* is accurate and is a good use of a diagram as an
assertion.

### F27 — LOW. AD-2 vs `execution-model.md` on `saved`.

AD-2: a row reaches `saved` *"because the watcher saw the write land, never because the stream
announced it."* `execution-model.md`: *"Rail — a row settles to `saved` | the stream, confirmed by
disk | `tool_result` for that call."* The spine's version is the better one and clearly
deliberate, but this is an override of a companion contract and is **not** in the Spec Amendments
table alongside the other `execution-model.md` entries. Add it, or the companion will keep
teaching the older rule.

---

## Summary of findings

| ID | Severity | Finding |
| --- | --- | --- |
| F1 | critical | Run boundary undefined under the session model; AD-11/AD-2/AD-20 all depend on it; AD-20 has no state for a chat turn in flight |
| F2 | high | Party mode has no runtime/session model; AD-19 invents a non-persona session identity nothing creates |
| F3 | high | Persistence authority (raw-log replay vs materialised projection), schema versioning and log retention undecided |
| F16 | high | AD-13's "project content is untrusted" vs AD-8/AD-18 executing project code; trust boundary never stated |
| F25 | high | Stale one-subprocess-per-skill mechanics in AD-18: "final `result` row" / "exit code", and `-p` positional vs stdin turns |
| F5 | medium | `.claude/skills/` unnamed as a read root; `resolve_party.py` is not where AD-8 implies |
| F6 | medium | AD-3 vocabulary omits filesystem/rail events though the rail crosses the same bridge |
| F7 | medium | AD-20's `live` state has no source event |
| F9 | medium | AD-17 doesn't prevent what it claims (no install/roster check, no resolver failure contract) |
| F11 | medium | *Pause room* deferral doesn't say what v1 does with the control |
| F14 | medium | Missing amendment: AD-10 overrides CAP-3 and the install contract on `identity`/`communication_style` |
| F17 | medium | AD-14 carries seed (the whole token enumeration), duplicating the binding mockup |
| F20 | medium | Watcher config and progress-denominator conventions are really ADs |
| F22 | medium | Layer table contradicts its own prose and diagram |
| F23 | medium | `preload/` and `windows/` absent from the layer model despite AD-13's weight |
| F24 | medium | Stale reference: "AD-20's platform convention" (it is a convention, not AD-20) |
| F4 | low/med | No orphan-process / crash-cleanup rule |
| F8 | low/med | Testing decided for `fold/` only; no runner, no fixture format, no redaction rule |
| F10 | low | Unenforceable clauses in AD-11 and AD-16 |
| F12 | low | Multi-project deferral wrongly claims nothing depends on one-project-per-window |
| F13 | low | Light-theme deferral mortgages AD-14 |
| F15 | low | CAP-7's Finder/editor escapes governed by no listed AD |
| F18 | low | Narrative/rationale in Design Paradigm |
| F19 | low | AD-18's Open risk duplicated in Open Items; AD-15 evidence trailing the Rule |
| F21 | low | AD-21 bundles a positive lifecycle decision into the negative-surface AD |
| F26 | low | Layer diagram disagrees with layer table |
| F27 | low | AD-2's `saved` rule overrides `execution-model.md` but isn't in the amendments table |

**Passed clean:** stack currency (all nine packages verified against the registry today),
capability coverage, the deployment/environment envelope, performance sizing, the two-channel
invariant (AD-2), write confirmation (AD-5), subagent voice (AD-6), renderer privilege (AD-13),
portrait purity (AD-16), derivation over configuration (AD-19), and the negative surface (AD-21,
modulo F21).
