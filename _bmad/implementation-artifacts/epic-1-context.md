# Epic 1 Context: Open a BMad project — the room, the files, and the shell

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Point the harness at any BMad-installed project and get a real room: the installed personas with real illustrated faces, the project's own files updating live in the outputs rail, and any document openable full-size in its own read-only window — with no configuration step, and a named prerequisite failure with its remedy instead of an empty room. Nothing runs yet; everything on screen is read from disk, which makes this epic a standalone BMad project viewer requiring no session machinery. Stories are ordered so the two things most likely to kill the product — the reasoning feed and the portraits — are judged before the bottom-up work begins.

## Stories

- Story 1.1: Settle what stopping a run actually costs
- Story 1.2: A running application on the pinned stack
- Story 1.3: The visual contract in one file
- Story 1.4: The accessibility floor — focus, keyboard reach, and one live region
- Story 1.5: Watch the reasoning — the run-note feed over a real memlog
- Story 1.6: Faces that read as colleagues
- Story 1.7: The team, read from the project's own install
- Story 1.8: Launch tells you what is missing
- Story 1.9: Conversation and project state in one window
- Story 1.10: The team, with faces, in the rail
- Story 1.11: The project's files, changing as they change
- Story 1.12: Read a document at full size without losing the room
- Story 1.13: The planning contract says what actually governs the build
- Story 1.14: Nothing the product promised not to do

## Requirements & Constraints

- **Zero configuration, not zero prerequisites.** Pointing at a project root is the entire setup — no wizard, no onboarding, no "where are you in the process?" question. Launch preflight instead checks three prerequisites and names the specific failure and its remedy: `claude` on PATH *and* authenticated (two distinct messages), `uv` present *and* resolving Python 3.11+ (two distinct messages), and the project resolving at least one agent. The "no agents" message must state what was looked for, where, why a correctly installed BMad can still resolve none there, and what would change it — never "no agents found".
- **Configuration comes only from BMad's own resolvers**, invoked as subprocesses; `config.toml` and `customize.toml` are never read directly and the harness implements no TOML layering. Every invocation is bounded by a timeout and schema-validated. Three failure classes share one degrade path — invocation failure, timeout, and *valid JSON in an unexpected shape*. Degrade to last good, surface a named error; never a silently empty or silently stale roster. Config files are watched and re-resolved on change, updating roster and menus in one frame with no arrival/removal animation.
- **The harness writes nothing into the project.** Every byte under `_bmad/` got there because the runtime wrote it. Transcripts, logs, caches and window state live in Electron `userData`, keyed by project path. Harness bookkeeping never appears in the rail.
- **Two truth channels never merge.** A rail row exists only because the watcher saw the file. A row carries two independent fields no source writes both of: a disk-derived state (`not yet written` → `changing` → `saved · <age>`) owned solely by the watcher, and an optional run-derived annotation owned solely by the stream. No merged status field. The row must read as complete with the annotation slot empty — and in this epic it always is, exercised against a stub annotation source so the invariant is testable before any session stream exists.
- **Derived, never asked.** Pipeline position comes from artifact presence under `_bmad/`; the harness never asks and never stores its own answer. v1 reads presence only and does not parse sprint-status contents — no surface consumes a parsed position yet. A rail row's owner is a session identity displayed as its agent where it has one, otherwise the artifact class, otherwise nothing rendered — never a guess.
- **Read-only document preview.** Opening a file opens a separate OS window rendering it read-only; it reloads from the watcher, not from a renderer read. Full path in the title bar, three escapes (reveal in Finder, open in editor, close), `Esc` closes. No refresh control, no edit affordance, no save.
- **Portraits are the project's highest-risk surface** and are proven early, in isolation, before anything depends on how they look. Pure, deterministic, asset-free functions; curated parameters for the five core personas and a deterministic hash-derived face for everyone else, stable across sessions and machines. The art-direction target is a company-directory illustrated headshot — a plausible colleague, not pixel art, not a sprite, not a cartoon. The acceptance test is falsifiable: match the approved reference and review at all four render sizes plus the derived-agent grid.
- **Failures crossing the bridge** are `{ code, message, detail? }` with a stable code; raw stderr and stack traces never reach the renderer.
- **Accessibility floor** (no WCAG target claimed, but binding): full keyboard reach with roving tabindex for tile and row lists, one shared `:focus-visible` treatment, exactly one polite live region per window with throttled queued announcements, no `assertive` anywhere, every state dot paired with a text state string, and no low-contrast tier as the sole carrier of a fact.
- **The negative surface is verified, not demoed.** The epic's final story checks its own prohibitions: no command palette or launcher reachable by any means, no badges or unread counts, no next-step guidance or recommending, no spinner or skeleton anywhere including a sentence doing a spinner's job, no audio, no config file path in any user-facing copy.

## Technical Decisions

- **Read-only projection with no write side.** The harness owns no state; it observes three external sources of truth (project filesystem, BMad install, session event stream), folds each into a read model, and renders it.
- **Six layers in dependency order** — View, Design, Bridge, Projections, Fold, Sources — with a prescribed and binding source tree. Nothing in the UI layer may reach sources, fold or projections; nothing in fold may reach sources; no arrow points upward. Fold interpreters are pure functions of an event sequence with no I/O and no wall clock except as an injected value.
- **No starter template exists.** This epic hand-rolls the Electron + React + TypeScript scaffold against the exact pinned dependency set, installed **as a set** rather than individually — several pins are deliberately behind latest because of peer-range constraints, and bumping one in isolation breaks the set.
- **Security posture:** context isolation on, node integration off, sandbox on. Every privileged capability crosses one narrow, explicitly enumerated preload API — no generic channel passthrough. Renderer and document windows have no edge to the filesystem, the CLI or the install. Project *code* is trusted (the user already runs it); project *content* is untrusted the moment it is rendered, so markdown is parsed with HTML disabled and sanitized before insertion.
- **Watcher configuration has two non-obvious requirements** that silently corrupt the run-note feed if missed: atomic temp-file rename handling (how the memlog writer writes) and coalescing tolerance (rapid appends land inside ~400ms and must not arrive one event per entry).
- **Conventions:** domain events named `noun:verb-past`; personas keyed by BMad agent id internally with display name/title/icon never used as keys; `kebab-case.ts` filenames, one exported concept per fold module; project-relative POSIX paths in domain events, absolute paths only inside sources and windows; epoch milliseconds in events, elapsed time derived rather than per-tick.
- **Format discipline is a standing rule, not advice.** Three of five external formats in this plan were specified wrongly from memory and caught only by opening the file; the two that were correct were the two someone had actually executed. Any acceptance criterion referencing an external format cites the file it was read from. Notably: the memlog kind vocabulary is **open, not closed** and carries **no per-entry timestamp**; the sprint status file is a flat map with a six-value vocabulary, not the three-way reading described upstream.
- **macOS only in v1.** Every OS-specific call is confined to the windows module; no OS branch exists elsewhere, so a later port is additive. One environment — the developer's own machine, run from dev or as a local unsigned package. No signing, notarization, auto-update or network service of the harness's own.

## UX & Interaction Patterns

- **One token file is the visual contract.** The token file opens with the mockup's root block copied verbatim in source order, extended with the named additions and every recurring literal promoted to a named token — the full type scale, the ten-token radius family by role, the spacing ladder, and the binding layout constants. A literal colour, dimension, radius or font stack in a component is a **defect**, not a style preference. Dark theme only; no light palette, no scheme branch, no high-contrast variant.
- **The register split is load-bearing mechanism, not decoration:** mono is the register of things written down (paths, state strings, metadata, timestamps, codes, chips, harness microcopy); sans is the register of things said (persona voice, prose, names, titles, run notes, rendered markdown).
- **Elevation is tonal, not cast** — the surface ramp *is* the elevation system. No elevation scale, no hover-lift. Exactly two z-indexes exist; a surface needing one is a window and is built as one. Presence and absence are expressed with opacity, never removal.
- **Motion is an inventory of five declarations**, each bound to a real event, and reduced-motion disables all of them globally with no carve-out. Every fact carried by motion must therefore also be legible with motion off — liveness during a run is carried by the elapsed counter, which is changing data and keeps ticking.
- **Harness microcopy** is lower case, mono, `·`-separated, with no terminal punctuation, and states facts rather than guidance: `saved · 3d`, `not yet written`, `no files under _bmad/ yet`. Empty states state the situation and stop — the Outputs empty state names the watched path and must not suggest a next step, name a skill or point at a persona.
- **Components built here:** portrait, initials token, status dot, persona tile, rail row, run note, skill button, shell furniture, sysline, document window. The rail stays monochrome and dense — the portrait is the only per-persona colour in the product.
- **Responsive:** desktop-first with two breakpoints only — the party side panel hides at the wider one, and the shell unlocks scroll and stacks to a column at the narrower one. No mobile target, no third breakpoint.
- **The product test outranks feature completeness:** if it reads as a chat box with a portrait glued on, it has failed. Restraint in the shell is the budget the portraits spend.

## Cross-Story Dependencies

- **Story 1.1 (the SIGINT spike) runs first, ahead of the scaffold.** It needs only a `claude` subprocess and depends on nothing the harness builds. Its outcome decides whether a later requirement — the persona explaining a stopped run in its own voice — is valid at all, and which copy the stop control ships. Epics 2 and 3 consume its answer; discard the spike code rather than merging it.
- **Stories 1.2–1.4 are foundation for everything after:** the scaffold and layered source tree, then the token file, then the accessibility floor. No component story should renegotiate the stack or introduce a literal value.
- **Story 1.5 (run-note feed) and Story 1.6 (portraits) are deliberately early** — both are risk-retirement, judged before bottom-up work begins. Both are renders over inputs that already exist on disk (real memlog files in this repo; pure functions with no I/O), so neither needs a session.
- **Story 1.7 (resolved roster) feeds Story 1.8 (preflight), Story 1.10 (tiles) and the persona identity in the chat header.** Story 1.9 (shell layout) is the container the rail and conversation stories mount into.
- **Story 1.11 (rail) ships the annotation slot present but empty**, tested against a stub annotation source. Epic 3 substitutes the real session stream and changes nothing else.
- **Story 1.5's run-note component is reused, not re-specified:** Epic 3 mounts the same component in the document card body and feeds it live.
- **Story 1.13 is documentation work with no code blocker** — it applies the architecture's outstanding spec amendments and the corrections to the three mis-specified external formats, so the next planning pass does not read a superseded contract.
- **Story 1.14 runs last** and reviews the epic's own surfaces against the prohibition set; prohibitions cannot be demoed, so each epic owns its own check rather than sharing one nobody runs.
