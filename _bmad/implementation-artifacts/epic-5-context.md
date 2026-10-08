# Epic 5 Context: Arrive and settle in

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The harness stops opening to a native folder dialog and opens to a Welcome: one action (open a project folder, or drop one), the projects opened before, and the five core personas by phase of the method. The product can be seen in light or dark (System by default). A conversation, in a persona's thread or the party room, follows what is being said and holds still when the user scrolls up. The folder the rail watches for a project's output defaults to BMad's own and is the user's to override. The two side panels are the user's to size and the Outputs folders to fold. The epic changes how a project is chosen, how the product is painted, how a thread scrolls and how panels are laid out; it changes nothing about what a project window or thread contains.

## Stories

- Story 5.1: Choose a project from a welcome, not a dialog
- Story 5.2: Choose light, dark or the system's theme
- Story 5.3: The thread follows what is being said
- Story 5.4: Choose the folder that holds the output
- Story 5.5: Size the side panels, fold the output folders

## Requirements & Constraints

- Welcome opens when no project path is on the command line; no native dialog at launch. A CLI path still opens its project directly; a non-folder CLI path still fails on stderr, exit 1. Closing the last project window or reactivating with none shows the Welcome; closing the Welcome quits; cancelling the native chooser returns to it. Opening a project closes the Welcome in the same moment.
- One action, *Open project folder…* (`⌘O`), plus one drop target; a non-folder drop opens nothing and says `not a folder · <name>`.
- Recent projects: max eight, newest first, path and time only, recorded for every open route including CLI. A vanished folder keeps its row, shows `folder missing`, does not open. No install state, count or version; no resolver runs. None recorded means no section.
- Five core personas (curated portraits, 44px, full opacity) in four lanes (analysis, planning, solutioning, implementation) with one harness-written sentence per role. Reads no project, marks no lane current, recommends nothing.
- Theme is one stored value (`system` | `light` | `dark`, default `system`, following macOS live). Chosen from *View ▸ Theme* (radio items, every window) and the Welcome's `theme · system · light · dark` line. Applies to all windows at once as a pure repaint: no transition, toast or announcement; touches no session, run, transcript, card, rail row or scroll position. Never paint a window in the other theme first. Missing/unreadable/unknown stored value reads as `system` silently. Portraits identical in both themes.
- Thread following: within one line of the bottom, anything that lengthens the thread keeps the newest line in view in the same frame, instantly. A user scroll up pauses it and nothing moves the thread while paused. Returning to bottom, `↓ latest`, or sending resumes. A thread opened, reloaded or switched lands at the bottom, following. No count or sign of what is below.
- Output folder, first usable of: user's per-project stored choice (existing folder inside the project, not the project root); BMad's resolved `output_folder` (usable folder inside the project); `_bmad/`. Derived, never asked. Chosen via `change…` in the Outputs head or *File ▸ Output Folder…* (chooser opens at the watched folder). Refuse and change nothing for a real path outside the project, the project folder, or `.git`/`node_modules` or inside them. *File ▸ Use BMad's Output Folder* forgets the choice. Stored per project, remembered while the folder is missing.
- The output folder drives rail rows/groups, the document window's boundary for new opens, the Outputs empty state and the party summary destination. Install, preflight and resolvers stay at `_bmad/`; no skill's writes are redirected. Head states: `bmad writes to · <folder>`, `<chosen> · folder missing` (rail falls back to BMad's), `not changed · <reason>` (once). A change repaints the rail in one frame and touches no session, run, transcript or open document window.
- Resizing: rail (1:1) and Room panel (Party Mode) each have a splitter on the inner edge. Rail default 348px, range 280–560, chat column stays >=420px; Room panel default 240px, range 200–400, party column stays >=480px. Drag follows the pointer with no easing or snapping; double-click or `Enter` resets; arrows move 16px (64 with `Shift`); `Home`/`End` go to limits. Widths stored per user; missing/unreadable/out-of-range reads as default. A window narrowed below a stored width pulls the panel in without losing the stored value. No splitter at <=1000px or where the panel is hidden; no new breakpoint.
- Folding: each Outputs directory heading folds its own rows (click, `Enter`/`Space`, `←`/`→`); folding is flat, one directory at a time. A folded directory with a `changing` row shows the amber dot and `changing` on its heading. No count, no unfold on arrival, no collapse-all. Stored per project as project-relative directory paths; entries for vanished directories ignored.
- Cross-cutting NFRs: `contextIsolation` on, `nodeIntegration` off, `sandbox` on, narrow enumerated preload API with no generic invoke passthrough; macOS-specific calls only in `src/main/windows/`; no `prefers-color-scheme` branch in any stylesheet or component, no high-contrast variant, no third palette; no literal colour/dimension/radius/font in components; `faint`-tier text never the sole carrier of a fact; every action keyboard-reachable; exactly one polite live region per window; harness copy lower case, mono, `·`-separated, no terminal punctuation, facts not guidance; no audio; only the existing breakpoints (<=1180px, <=1000px).
- Prohibitions, verified in each story's final criteria: Welcome has no badge/count, recommended persona, spinner/animation, tour/wizard, sound, *clear recent*, or *get started*/*welcome back*/*try* copy. Follow control has no count, dot, *new*, pulse, shadow or sound, and no animated scroll anywhere. Output folder has no prompt, recommendation or second folder. Panels/folds have no animation, snap points, presets, way to hide a panel, or live-region announcement.

## Technical Decisions

- The harness writes nothing into the project. All new durable state (recent list, theme value, per-project output-folder choice, per-project folded directories, two panel widths) lives under Electron `userData`, holding only paths, times, numbers and one word. Prefer one shared `userData` store module across stories.
- The Welcome follows the document window's precedent: its own window, page entry and preload bundle, sharing no runtime module with the shell, with no edge to the install, CLI or a project's files. Startup change is in `src/main/index.ts` (replacing the old native-dialog-then-quit path). Layer rules hold; fold interpreters stay pure.
- Light theme: one twin per colour token in `design/tokens.css`, as a third block `:root[data-theme="light"]` with `color-scheme: light` after the two dark blocks, which stay byte-identical so earlier token tests keep passing. Components name no theme. `prefers-color-scheme` is read only in main; native chrome follows. Light text pairs clear 4.5:1 except `meta`; the four state-colour meanings stay, halos stronger. This amends the former dark-only rule.
- The five role descriptions are a static table written from each agent's `role`, not read from a project and not attributed to a persona.
- Follow state is a fact about scroller position: nothing persisted, no setting. The existing scroll call is the run-card reveal (`use-reveal.ts`); thread following is added beside it, and the reveal also pauses following. It touches the thread scroller in both the shell and the party view.
- Output folder and install are two folders: the install stays `_bmad/`; BMad's own resolved config chooses the output, and the user's choice is only an override.
- `--rail` (348px) and `--party-side` (240px) tokens keep their values and become defaults; no existing test's expectation changes. Panel clamp is a pure function of stored width, range and neighbour minimum. Width and fold values cross to main through enumerated named methods in `src/shared/channels.ts`, pinned in contract tests; no new command, event or generic channel.

## UX & Interaction Patterns

- Welcome: 1080x720 window; topbar shows only the brand and `no project open`; a 560px column (head, open action, recent rows); a 960px band of four lanes (`1fr 2fr 1fr 1fr`) stacking to one column at <=1000px. Open action reuses the composer's send-button style; the drop zone is the product's one dashed border. Role text in sans, no first person, no suggestion of where to start.
- Welcome reach: tab stops are the open button and the recent list (one stop, arrows between rows, `Enter` opens); persona cards take no focus; one polite live region announces a rejected drop once; focus lands on the open button on open and after a cancelled dialog; no motion.
- Splitter: 9px hit area on the panel's inner border; 1px `line` at rest, 3px `accent-border` on hover, 3px `accent` on drag and focus with the shared ring; `separator` role exposing value, min and max. Folder heading: a button with stroked chevron, `badge`-tier mono at `dim`, `aria-expanded` and `aria-controls`, roving tab stop with the rows.
- Follow control: literal `↓ latest` in `label` mono at `dim` on `panel-2`, centred above the composer, one tab stop between thread and composer, in and out in one frame.
- Outputs head: folder in `meta` mono at `dim`, `change…` in `accent`, one plain state line beneath only while a state exists; the File menu (project windows only) has no accelerators; refusals announced politely once. The Welcome's theme line is the only on-window theme control.
- Mockups live under the UX design folder's `mockups/`.

## Cross-Story Dependencies

- Story 5.2's Welcome theme line (seam C) needs Story 5.1's Welcome; build 5.2's tokens and stored choice/menu first.
- Story 5.1 is large with three seams (window/open/drop/lifecycle, recent list, the team); 5.2 and 5.4 are three-seam; 5.5 has two (splitters, then folds).
- Story 5.3 is independent of the rest. Stories 5.4 and 5.5 are independent of 5.1 to 5.3 and of each other, except that folded directories are keyed by project-relative path so they survive a change of output folder if 5.4 has landed.
- Builds on earlier surfaces without changing their contents: rail and watcher (Epic 1), document window (Story 1.12), run-card reveal (Story 3.10), party room and summary destination (Epic 4).
