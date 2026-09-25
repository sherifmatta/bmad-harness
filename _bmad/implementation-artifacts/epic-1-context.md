# Epic 1 Context: Open a BMad project — the room, the files, and the shell

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Point the harness at any BMad-installed project and get a real room: the installed personas with real illustrated faces, the project's own files updating live in the outputs rail, and any document openable full-size in its own window — with no configuration step, and a named prerequisite failure with its remedy instead of an empty room. Nothing runs yet; everything on screen is read from disk. The epic is deliberately standalone: it delivers a working BMad project viewer that requires no session machinery, and the two things most likely to kill the product — the run-note reasoning feed and the portraits — are built and judged before the bottom-up scaffolding work is leaned on.

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

**Zero configuration.** Pointing at a project root is the entire setup. No wizard, no onboarding, no "where are you in the process?" question, no harness-side registry. One project per window.

**Config comes only from BMad's own resolvers.** The agent roster is enumerated from the `[agents.*]` tables of the resolved config (supplying `name`, `title`, `icon`, `description`, `module`, `team`) — never by globbing skill directories. Three resolver scripts are invoked as subprocesses and they do not share a directory: `_bmad/scripts/resolve_config.py`, `_bmad/scripts/resolve_customization.py`, and the party skill's own `scripts/resolve_party.py`. TOML files are never read directly and the harness implements no layering of its own. Every invocation is timeout-bounded and schema-validated; three failure classes share one degrade path — invocation failure, timeout, and *valid JSON in the wrong shape* — each falling back to the last good result with a named error. Never a silently empty roster, never a silently stale one. Config files are watched and re-resolved; re-resolution updates roster and menus in a single frame with no arrival/removal animation.

**Preflight names what is missing.** Three checks, each failing with its own specific message and remedy: `claude` on PATH *and* authenticated (two distinct messages); `uv` present *and* resolving Python 3.11+ (two distinct messages); the project resolves at least one agent. The last must state four things — what was looked for, where, why a correct install can still resolve none there (user-scoped rather than project-scoped), and what would change it. It must not read as "no agents found".

**The rail is a view of the filesystem, not of the harness.** One row per file under `_bmad/`, appearing regardless of who wrote it (harness, editor, terminal `claude`). Project artifacts only — transcripts, logs, caches and window state live in `userData` and never appear. No harness code path writes inside the project root.

**Document preview, never editor.** Documents open in a separate OS window, read-only, reloaded from the watcher rather than a renderer-initiated read. No refresh control, no edit affordance, no save.

**Failures crossing the bridge** are `{ code, message, detail? }` with a stable code; `message` is shown, `detail` sits behind a disclosure. Raw subprocess stderr and stack traces never reach the renderer.

**Product test, outranking everything:** if it reads as a chat box with a portrait glued on, it has failed regardless of feature completeness.

## Technical Decisions

**Paradigm.** Read-only projection: an event-sourced read model with no write side. Three external sources of truth (project filesystem, BMad install, session stream) are folded and rendered. The harness maintains no model of project state of its own.

**Layering, six layers in dependency order, and the source tree is binding, not a suggestion:** View (`src/renderer/ui/`), Design (`src/renderer/design/`), Bridge (`src/shared/`), Projections (`src/main/projections/`), Fold (`src/main/fold/`), Sources (`src/main/sources/`), plus `src/preload/`, `src/main/windows/` and `fixtures/runs/`. Nothing in `ui/` reaches `sources/`, `fold/` or `projections/`; nothing in `fold/` reaches `sources/`; no arrow points upward. Interpreters in `fold/` are pure functions of an event sequence — no I/O, no filesystem, no wall clock except as an injected value.

**Two truth channels never merge (the epic's central invariant).** A rail row carries two independent fields that no single source writes both of: a disk-derived `state` (`not yet written` → `changing` → `saved · <age>`) owned solely by the watcher, and an optional run-derived `annotation` owned solely by the stream. There is no merged status field. The stream may annotate a row but never create one, remove one, or assert what a file contains. A row must read as complete with the annotation slot empty. **The rail projection accepts an annotation input from day one and is tested against a stub annotation source** — Epic 3 swaps the real stream in and changes nothing else. A row's owner is a `sessionId` shown as its `agentId`, else derived from artifact class, else not rendered at all; the harness never guesses an owner.

**Watcher configuration has two non-obvious requirements** that silently corrupt the run-note feed if missed: atomic temp-file rename handling (how `memlog.py` writes) and coalescing tolerance (rapid appends landing inside ~400ms must not arrive one event per entry).

**Security posture.** `contextIsolation` on, `nodeIntegration` off, `sandbox` on. Every privileged capability crosses one narrow, explicitly enumerated preload API — no generic `invoke(channel, …)` passthrough. Renderer and document windows have no edge to the filesystem, the CLI or the install. Project *code* (skills, resolvers, runtime) is trusted; project *content* (markdown) is untrusted the moment it is rendered — hence `markdown-it` with HTML disabled plus DOMPurify sanitization, and the preview must look intentional within that ceiling.

**Pinned stack, installed as a set, not bumped individually:** Electron 44.4.5, React 19.3.0, TypeScript 6.0.3 (not 7.x — typescript-eslint peers `<6.1.0`), Vite 7.3.6 (not 8.x — electron-vite@5 peers `^5||^6||^7`), electron-vite 5.0.0, `@vitejs/plugin-react-swc` 4.3.3 (not `@vitejs/plugin-react`), electron-builder 26.15.3, Vitest 5.0.1, typescript-eslint 8.70.1, chokidar 4.0.3 (not 5.x — ESM-only, breaks CJS main), markdown-it 15.0.2, DOMPurify 3.4.16. No starter template exists; the scaffold is hand-rolled. `claude` and `uv`/Python 3.11+ are the user's own installs.

**Portraits** are pure, deterministic, asset-free functions with no I/O and no global state, producing inline SVG with no ids, defs, gradients, clip paths, filters, masks or external references — so two portraits in one document cannot collide. Five core personas carry curated parameters; every other agent derives from its `agentId` via a salted 32-bit FNV-1a hash, so the same agent wears the same face across sessions and machines. Sizes are a closed set: 32/36/38/44, with a 32px legibility floor; the 20px case uses the initials token. The `icon` field is never rendered as a portrait. One neutral expression at every state — the state dot carries state, the face does not.

**Conventions.** Domain events named `noun:verb-past`; personas keyed by BMad `agentId` everywhere internally (display `name`/`title`/`icon` are never keys); `kebab-case.ts` filenames with one exported concept per `fold/` module; project-relative POSIX paths in domain events, absolute paths only inside `sources/` and `windows/`; epoch milliseconds in events, elapsed time derived from the start event rather than a per-tick field. macOS only; every macOS-specific call (`open -R`, `open -a`) confined to `src/main/windows/`.

**Pipeline position is derived, never asked or stored** — and the negative is the substance. No v1 surface consumes a parsed pipeline position, so v1 reads artifact *presence* only and treats the sprint status file as one more watched artifact without parsing its contents.

**Format discipline (a standing constraint).** Any acceptance criterion referencing an external format cites the file it was read from. Three of five formats in this plan were specified wrongly from memory and caught only by opening the file; the two that were correct were the two someone had actually executed. Read the file before writing a parser against it.

## UX & Interaction Patterns

**Tokens are the visual contract.** `design/tokens.css` opens with the mockup's `:root` block copied verbatim in source order; a literal colour, dimension, radius or font stack in a component is a **defect**, not a style preference. Additions on top: the `note` token used by exactly one thing (the persona-tile note dot, which may not use `accent`), and the `disagree` trio plus `--red`; `red` is failure and `disagree` is friction, never conflated. Every recurring mockup literal is promoted to a named token. The type scale is thirteen named sizes with 600 as the only non-default weight; the radius family is ten tokens by role and must not be normalised to one radius. Binding layout constants: rail 348px, topbar 42px, rail head 30px, thread max 940px, chat sub max 72ch, document window `min(880px,92vw) × min(760px,80vh)` with a 36px titlebar and 28px foot, rendered-markdown measure 70ch, card body max-height 230px. Padding is deliberately off-scale and must not be regularised. Dark theme only.

**Register split, load-bearing.** `mono` is the register of things written down (paths, state strings, metadata, timestamps, codes, chips, harness microcopy, document prose); `sans` is the register of things said (persona voice, names, titles, labels, run notes, rendered markdown). In the card body the two feeds share one box and the typeface register is the *only* thing distinguishing them — no container, rule, label or background may be added to help.

**Elevation is tonal, not cast.** The surface ramp *is* the elevation system. No z-scale, no hover-lift. Shadows serve exactly three jobs (state halos, inset rules, the document window). Exactly two z-indexes exist — 40 scrim, 50 window; a surface needing a z-index is a window and is built as one. Presence and absence are expressed with opacity, never removal. The rail stays monochrome and dense — the portrait is the only per-persona colour in the product.

**Motion is five declarations, each bound to a real event** — `pulse`, `blink` at `steps(1)` (hard on/off, never a fade), `eq`, `reveal`, `cast`. No easing library, no spring, no entrance animation, no skeleton, no spinner at any point in any state. With `prefers-reduced-motion`, animation and transition are globally disabled with no carve-out, so every fact carried by motion must also be legible without it.

**Accessibility floor.** One focus treatment everywhere — a `0 0 0 2px accent` ring at 2px offset (3px for stacked initials), `:focus-visible` only, no fill, no colour change, no motion. Every action is keyboard-reachable with roving tabindex for tile and row lists, Enter/Space activation, Enter to send with Shift+Enter for newline, Esc to close the document window. No shortcut layer beyond this. Exactly one polite live region per window, announcements throttled to one per 2s, queued in event order, never merged into a count; `aria-live="assertive"` is used nowhere. Every dot is paired with a text state string in the same row. No `faint`-tier string may be the only carrier of a fact.

**Run-note feed** renders three slots on a `58px · 74px · 1fr` grid: time (mono, tabular figures), kind tag, and the reason with the load-bearing clause emphasised. The memlog carries **no per-entry timestamp**, so time is derived from when the append was observed and the 58px column must render correctly empty. The kind vocabulary is **open, not closed** — render every entry whatever its kind, under four named treatments (`decision` accent, `assumption` neutral, `question`/`gap` warm friction) with **any unrecognised kind falling back to neutral**, covering observed kinds like `event`, `constraint`, `capability`, `change`, `version`, `technique`, `note`, `override`, `direction`. The parser also tolerates the `(kind by author)` form.

**Microcopy is lower case, mono, `·`-separated, with no terminal punctuation**, stating facts rather than guidance: `saved · 3d`, `not yet written`, `no files under _bmad/ yet` (with the watched path beneath, stating the situation and stopping — never suggesting a next step, naming a skill or pointing at a persona). Two mockup strings about `customize.toml` are factually wrong under the resolver contract and are **cut with nothing replacing them**; no config file path appears in copy anywhere. The mockup's legend footer is prototype furniture and does not ship.

**Responsive:** desktop-first, `body{overflow:hidden}` at full size, two breakpoints only — `≤1180px` hides the party side panel, `≤1000px` unlocks scroll and stacks to a column. No third breakpoint, no mobile target.

**The banned list is a testable prohibition set** this epic's final story verifies on its own surfaces: no command palette / `⌘K` / launcher / global skills list; no badges, unread counts, relevance sorting, next-step highlighting or recommended actions; no spinner anywhere, including a sentence doing a spinner's job; no editing affordance or refresh control in a document window; no tooltips or previews derived from a resolved skill name; no sound.

## Cross-Story Dependencies

- **Story 1.1 (SIGINT spike) runs first, ahead of the scaffold.** It needs only a `claude` subprocess and nothing the harness builds. Its outcome decides whether FR90 is a valid requirement at all and which copy the stop control ships (Branch A: plain `stop`; Branch B: `stop · ends this conversation`, and the harness — not a persona — reports a stop). Epics 2 and 3 consume the answer.
- **Story 1.2 (scaffold + source tree) gates every subsequent story** — later stories start from a working, correctly layered project rather than renegotiating the stack.
- **Story 1.3 (tokens) gates every visual story** (1.5, 1.6, 1.9–1.12); Story 1.4 (focus/keyboard/live region) is the shared treatment those same surfaces apply.
- **Story 1.5's run-note feed is built here but mounted live in Epic 3.** It is a render over file content, so it needs a `.memlog.md` (eleven real ones exist in this repo), not a session. Epic 3 mounts the same component in the document card body and feeds it from `run:note` — it does not re-specify the note.
- **Story 1.6 (portraits) is proven early and in isolation**, before anything depends on how they look; Story 1.10 consumes it for persona tiles and the chat header. The acceptance test is falsifiable: match the approved `mockups/portrait.html` reference, reviewed at all four render sizes plus the derived-agent grid.
- **Story 1.7 (install resolution) feeds Story 1.8 (preflight) and Story 1.10 (tiles).** The live-session clause of the config-rewatch requirement is verified in Epic 2, not here.
- **Story 1.11 ships the rail with the annotation slot present but empty**, tested against a stub annotation source. Epic 3 substitutes the real session stream and changes nothing else.
- **Story 1.13 applies eight spec amendments the architecture requires** (runtime unit, menu entry shape, authoritative roster, resolver-only config, prerequisites, party v1 scope, concurrency, collapsed-card form). These are already-true decisions, so nothing blocks them — but left unowned, the planning contract diverges permanently from what is built.
- **Story 1.14 is the epic's negative-surface review.** Prohibitions cannot be demoed, so each epic owns a review of its own rather than three epics sharing one nobody runs.
- **Deferred to later epics, not to be built here:** session machinery and the conversation transcript (Epic 2), skill buttons, the document card and run lifecycle (Epic 3), party mode (Epic 4).
