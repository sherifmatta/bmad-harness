# Epic 1 Context: Open a BMad project — the room, the files, and the shell

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Point the harness at any BMad-installed project and get a real room: the installed personas with real illustrated faces, the project's own files updating live in the outputs rail, and any document openable full-size in its own read-only window. There is no configuration step, and a missing prerequisite produces a named failure with its remedy instead of an empty room. Nothing runs yet; everything on screen is read from disk, so this epic is a standalone BMad project viewer that needs no session machinery. The two things most likely to kill the product, the reasoning feed and the portraits, are judged before the bottom-up work.

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

- **Zero configuration, not zero prerequisites.** Pointing at a project root is the whole setup. Preflight names the specific failing prerequisite and its remedy: `claude` on PATH and authenticated, `uv` present and resolving Python 3.11+ (two distinct messages each), and at least one resolved agent. The no-agents message says what was looked for, where, why a correct install can still resolve none, and what would change it.
- **Configuration comes only from BMad's own resolvers**, run as subprocesses; config files are never read directly and no TOML layering is done here. Each call is timeout-bounded and schema-validated. Invocation failure, timeout and valid JSON of an unexpected shape share one degrade path: keep the last good result and surface a named error, never a silently empty or stale roster. Config is watched and re-resolved on change, updating roster and menus in one frame with no animation.
- **The harness writes nothing into the project.** Transcripts, logs, caches and window state live in `userData` keyed by project path and never appear in the rail.
- **Two truth channels never merge.** A rail row exists only because the watcher saw the file, and carries a disk-derived state (`not yet written`, `changing`, `saved · <age>`) and a separate optional run-derived annotation. No source writes both; the row reads complete with the annotation empty.
- **Derived, never asked.** Pipeline position comes from artifact presence only; sprint-status contents are not parsed in v1. A row's owner is a session identity shown as its agent, else the artifact class, else nothing, never a guess.
- **Document preview is read-only**, in a separate OS window that reloads from the watcher: full path in the title bar, three ways to close, `Esc` closes, no refresh, edit or save.
- **Portraits are the highest risk** and are proven early in isolation: pure, deterministic, asset-free, curated for the five core personas and hash-derived for the rest, stable across sessions and machines. The target is a company-directory illustrated headshot, judged against the approved reference at all four render sizes plus the derived-agent grid.
- **Accessibility floor:** full keyboard reach with roving tabindex for tile and row lists, one shared `:focus-visible` treatment, exactly one polite live region per window with throttled queued announcements and no `assertive`, every state dot paired with a text state string, no low-contrast tier as the sole carrier of a fact.
- **Negative surface, verified not demoed:** no command palette or launcher by any means, no badges, unread counts, next-step guidance or recommending, no spinner or skeleton (including a sentence doing a spinner's job), no audio, no configuration file path in user-facing copy.

## Technical Decisions

- **Read-only projection, no write side.** Three external sources (project filesystem, BMad install, session event stream) are folded into read models and rendered. Six layers in dependency order (View, Design, Bridge, Projections, Fold, Sources) with a binding source tree; no arrow points upward; fold interpreters are pure with no I/O and no wall clock except an injected value.
- **No starter template.** Hand-roll Electron + React + TypeScript against the exact pinned set, installed as a set; several pins sit deliberately behind latest for peer-range reasons.
- **Security:** context isolation on, node integration off, sandbox on. Every privileged capability crosses one narrow, enumerated preload API with no generic passthrough. Project content is untrusted when rendered: markdown is parsed with HTML disabled and sanitised. Bridge failures are `{ code, message, detail? }` with a stable code; raw stderr and stacks never reach the renderer.
- **Watcher:** must handle atomic temp-file rename (how the memlog writer writes) and coalesce rapid appends landing inside about 400ms, or the run-note feed is silently corrupted.
- **Conventions:** events are `noun:verb-past`; personas keyed by BMad agent id, never name, title or icon; `kebab-case.ts` files with one exported concept per fold module; project-relative POSIX paths in events; epoch milliseconds, with elapsed time derived.
- **Format discipline:** an acceptance criterion that references an external format cites the file it was read from. Formats described from memory were wrong three times in five: the memlog kind vocabulary is open and carries no per-entry timestamp, and the sprint status file is a flat map with a six-value vocabulary.
- **Stop mechanism (settled in Story 1.1):** an in-band `control_request` interrupt on the session's stdin halts one turn and keeps the session; `SIGINT` ends the session and is never the stop mechanism. Epics 2 and 3 consume this. The spike code was discarded, not merged.
- **macOS only in v1**, with every OS-specific call confined to the windows module. One environment: the developer's machine, dev or local unsigned package; no signing, auto-update or network service.

## UX & Interaction Patterns

- **One token file is the visual contract.** A literal colour, dimension, radius or font stack in a component is a defect. Dark only, no scheme branch.
- **Register split:** mono for things written down (paths, state strings, timestamps, codes, chips, harness microcopy); sans for things said (persona voice, names, run notes, rendered markdown).
- **Elevation is tonal**, with no cast shadows or hover-lift and exactly two z-indexes; a surface needing one is a window. Presence and absence use opacity, not removal.
- **Motion is five declarations**, each bound to a real event and all disabled under reduced motion. Anything motion carries must also read with motion off; liveness rides the ticking elapsed counter.
- **Harness microcopy** is lower case, mono, `·`-separated, no terminal punctuation, stating facts not guidance. Empty states state the situation and stop; the Outputs empty state names the watched path and suggests nothing.
- **Responsive:** desktop-first, two breakpoints only, no mobile target.
- **Product test:** if it reads as a chat box with a portrait glued on, it has failed.

## Cross-Story Dependencies

- **1.1 ran first**, ahead of the scaffold, needing only a `claude` subprocess.
- **1.2–1.4 are foundation** (scaffold and layered tree, token file, accessibility floor); no later story renegotiates the stack or introduces a literal value.
- **1.5 and 1.6 are early risk retirement** over inputs that already exist; Epic 3 mounts 1.5's run-note component in the document card body and feeds it live.
- **1.7 (resolved roster) feeds 1.8 (preflight), 1.10 (tiles) and the chat header identity.** 1.9 is the shell container the rail and conversation mount into.
- **1.11 ships the annotation slot present but empty**, tested against a stub source; Epic 3 substitutes the real stream and changes nothing else.
- **1.13 is documentation only**, applying the outstanding spec amendments and format corrections. **1.14 runs last**, reviewing this epic's surfaces against the prohibition set.
