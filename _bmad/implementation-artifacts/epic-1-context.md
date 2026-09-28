# Epic 1 Context: Open a BMad project — the room, the files, and the shell

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Point the harness at any BMad-installed project and get a real room: the installed personas with real illustrated faces, the project's own files updating live in the outputs rail, and any document openable full-size in its own read-only window — with no configuration step, and a named prerequisite failure with its remedy instead of an empty room. Nothing runs yet; everything on screen is read from disk, which makes this epic a standalone BMad project viewer needing no session machinery. Stories are ordered so the two things most likely to kill the product — the reasoning feed and the portraits — are judged before the bottom-up work begins.

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

- **Zero configuration, not zero prerequisites.** Pointing at a project root is the entire setup — no wizard, no onboarding, no "where are you in the process?" question. Preflight names the specific failing prerequisite and its remedy: `claude` on PATH *and* authenticated, `uv` present *and* resolving Python 3.11+ (two distinct messages each), and the project resolving at least one agent. The "no agents" message must say what was looked for, where, why a correctly installed BMad can still resolve none there, and what would change it — never "no agents found".
- **Configuration comes only from BMad's own resolvers**, invoked as subprocesses. Config files are never read directly and the harness does no TOML layering of its own. Each invocation is timeout-bounded and schema-validated; three failure classes share one degrade path — invocation failure, timeout, and *valid JSON in an unexpected shape*. Degrade to last good and surface a named error; never a silently empty or stale roster. Config is watched and re-resolved on change, updating roster and menus in one frame with no arrival/removal animation.
- **The harness writes nothing into the project.** Every byte under `_bmad/` got there because the runtime wrote it. Transcripts, logs, caches and window state live in `userData` keyed by project path, and never appear in the rail.
- **Two truth channels never merge.** A rail row exists only because the watcher saw the file. It carries two independent fields that no source writes both of: a disk-derived state (`not yet written` → `changing` → `saved · <age>`) owned by the watcher, and an optional run-derived annotation owned by the stream. No merged status field; the row must read as complete with the annotation empty.
- **Derived, never asked.** Pipeline position comes from artifact presence under `_bmad/`; v1 reads presence only and does not parse sprint-status contents, since nothing consumes a parsed position yet. A row's owner is a session identity shown as its agent where it has one, else the artifact class, else nothing — never a guess.
- **Document preview is read-only**, in a separate OS window reloading from the watcher rather than a renderer read: full path in the title bar, three escapes, `Esc` closes, and no refresh control, edit affordance or save.
- **Portraits carry the project's highest risk** (reading as childish) and are proven early in isolation: pure, deterministic, asset-free, curated for the five core personas and hash-derived for everyone else, stable across sessions and machines. Target a company-directory illustrated headshot — a plausible colleague, not pixel art, not a sprite, not a cartoon. The acceptance test is falsifiable: match the approved reference, reviewed at all four render sizes plus the derived-agent grid.
- **Accessibility floor** (no WCAG target claimed, but binding): full keyboard reach with roving tabindex for tile and row lists, one shared `:focus-visible` treatment, exactly one polite live region per window with throttled queued announcements and no `assertive` anywhere, every state dot paired with a text state string, and no low-contrast tier as the sole carrier of a fact.
- **The negative surface is verified, not demoed:** no command palette or launcher reachable by any means, no badges, unread counts, next-step guidance or recommending, no spinner or skeleton anywhere (including a sentence doing a spinner's job), no audio, and no configuration file path in user-facing copy.

## Technical Decisions

- **Read-only projection with no write side.** The harness owns no state; it observes three external sources of truth (project filesystem, BMad install, session event stream), folds each into a read model, and renders it.
- **Six layers in dependency order** — View, Design, Bridge, Projections, Fold, Sources — with a prescribed, binding source tree. Nothing in the UI layer may reach sources, fold or projections; nothing in fold may reach sources; no arrow points upward. Fold interpreters are pure functions of an event sequence, with no I/O and no wall clock except as an injected value.
- **No starter template exists.** Hand-roll the Electron + React + TypeScript scaffold against the exact pinned dependency set, installed **as a set** — several pins sit deliberately behind latest for peer-range reasons, so bumping one in isolation breaks the set.
- **Security posture:** context isolation on, node integration off, sandbox on. Every privileged capability crosses one narrow, explicitly enumerated preload API — no generic channel passthrough. Renderer and document windows have no edge to the filesystem, the CLI or the install. Project *code* is trusted; project *content* is untrusted the moment it renders, so markdown is parsed with HTML disabled and sanitized before insertion. Failures crossing the bridge are `{ code, message, detail? }` with a stable code; raw stderr and stack traces never reach the renderer.
- **The watcher has two non-obvious configuration requirements** that silently corrupt the run-note feed if missed: atomic temp-file rename handling (how the memlog writer writes) and coalescing tolerance (rapid appends land inside ~400ms and must not arrive one event per entry).
- **Conventions:** domain events named `noun:verb-past`; personas keyed by BMad agent id, never by display name/title/icon; `kebab-case.ts` filenames, one exported concept per fold module; project-relative POSIX paths in events, absolute paths only inside sources and windows; epoch milliseconds in events, elapsed time derived rather than carried per tick.
- **Format discipline is a standing rule.** Three of five external formats here were specified wrongly from memory and caught only by opening the file, so any acceptance criterion referencing an external format cites the file it was read from. Notably: the memlog kind vocabulary is **open, not closed** and carries **no per-entry timestamp**; the sprint status file is a flat map with a six-value vocabulary, not the three-way reading described upstream.
- **macOS only in v1**, every OS-specific call confined to the windows module so a later port is additive. One environment — the developer's own machine, from dev or a local unsigned package; no signing, notarization, auto-update or network service of the harness's own.

## UX & Interaction Patterns

- **One token file is the visual contract:** the mockup's root block verbatim in source order, extended with the named additions and every recurring literal promoted to a token. A literal colour, dimension, radius or font stack in a component is a **defect**, not a style preference. Dark only — no light palette, no scheme branch, no high-contrast variant.
- **The register split is load-bearing mechanism:** mono for things written down (paths, state strings, metadata, timestamps, codes, chips, harness microcopy); sans for things said (persona voice, names, titles, run notes, rendered markdown).
- **Elevation is tonal, not cast** — the surface ramp *is* the elevation system. No elevation scale, no hover-lift. Exactly two z-indexes; a surface needing one is a window and is built as one. Presence and absence use opacity, never removal.
- **Motion is five declarations**, each bound to a real event, all disabled globally under reduced motion with no carve-out. Every fact carried by motion must also be legible with motion off — liveness rides the elapsed counter, which is changing data and keeps ticking.
- **Harness microcopy** is lower case, mono, `·`-separated, no terminal punctuation, stating facts not guidance (`saved · 3d`, `not yet written`). Empty states state the situation and stop — the Outputs empty state names the watched path and must not suggest a next step, name a skill or point at a persona.
- **Components built here:** portrait, initials token, status dot, persona tile, rail row, run note, skill button, shell furniture, sysline, document window. The rail stays monochrome and dense; the portrait is the only per-persona colour in the product.
- **Responsive:** desktop-first, two breakpoints only — the party side panel hides at the wider one, the shell unlocks scroll and stacks to a column at the narrower one. No mobile target, no third breakpoint.
- **The product test outranks feature completeness:** if it reads as a chat box with a portrait glued on, it has failed.

## Cross-Story Dependencies

- **1.1 (the SIGINT spike) runs first, ahead of the scaffold** — it needs only a `claude` subprocess. Its outcome decides whether a later requirement (the persona explaining a stopped run in its own voice) is valid at all, and which copy the stop control ships. Epics 2 and 3 consume the answer; the spike code is discarded, not merged.
- **1.2–1.4 are foundation for everything after:** scaffold and layered source tree, then the token file, then the accessibility floor. No later story should renegotiate the stack or introduce a literal value.
- **1.5 and 1.6 are deliberately early risk-retirement**, rendering over inputs that already exist, so neither needs a session. Epic 3 mounts 1.5's run-note component in the document card body and feeds it live rather than re-specifying it.
- **1.7 (resolved roster) feeds 1.8 (preflight), 1.10 (tiles) and the chat header's persona identity.** 1.9 (shell layout) is the container the rail and conversation stories mount into.
- **1.11 (rail) ships the annotation slot present but empty**, tested against a stub annotation source; Epic 3 substitutes the real session stream and changes nothing else. This is what keeps the epic standalone.
- **1.13 is documentation with no code blocker** — it applies the outstanding spec amendments and corrects the mis-specified external formats, so the next planning pass does not read a superseded contract.
- **1.14 runs last**, reviewing this epic's own surfaces against the prohibition set, since prohibitions cannot be demoed.
