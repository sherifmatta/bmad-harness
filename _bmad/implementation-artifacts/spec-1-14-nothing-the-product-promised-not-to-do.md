---
title: 'Nothing the product promised not to do'
type: 'chore'
created: '2026-09-30'
status: 'done'
baseline_commit: '878f4ebdf32443a2ee562cca8dfecded06526612'
baseline_revision: '878f4ebdf32443a2ee562cca8dfecded06526612'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 1's prohibitions (no palette or skills list, no badges or next-move steering, no spinner or stand-in sentence, no refresh/edit/save, no audio, no shipped legend footer, reduced motion, text ramp, no config-file copy) cannot be seen by using the product, and an audit found they do not all hold: the thread's `Preview` renders every persona's menu flat (a global skills list) and the UX memlog (which names `customize.toml`); Electron's default application menu gives the document window ⌘R reload and DevTools; the reduced-motion rule skips pseudo-elements; four faint-tier strings are the only visible carrier of a fact.

**Approach:** Fix each violation the audit found, then pin every prohibition with a text-contract suite over `src/` plus a rendered sweep of the assembled `Shell`, so a later story that breaks one fails a test.

## Boundaries & Constraints

**Always:**
- Fixes are the smallest that make the AC true. `Preview` loses the per-persona menu lines and the run-note feed over the memlog (and its `?raw` import); its portrait, derived-grid and initials rows stay. `RunNoteFeed` and `memlog.ts` stay for Epic 3.
- The application menu is one pure template builder in `src/main/windows/` installed once at startup: app (hide, hide others, show all, quit), Edit (copy, select all), Window (minimize, close), plus Toggle Developer Tools only when not packaged. No reload, force reload, save, zoom, find, Help or `accelerator` other than role defaults.
- Reduced motion stays one global block, now `*, *::before, *::after`, with no carve-out.
- Faint-tier text (`--faint`, `--meta`, `--ink-doc-mute`, `--topbar-sep`) is classified in a closed allow-list: `label` (absence costs nothing), `restated` (the same fact is legible at `--dim` or above), `decoration`. Sole carriers of a fact — `.state-line`, `.doc-foot`, `.output-row-owner`, `.run-note-time` — move to `--dim`. Group headings (`.rail-group`) and `.chat-head-sub` are classified `label`: each row carries its own name and the document window's title bar carries the full path.
- Tests follow the repo's conventions: `tests/*.test.ts` read sources as text and import helpers from `tests/literal-guard.ts`; a rendered test is a `src/renderer/ui/**/*.test.tsx` (`renderToStaticMarkup`, no DOM). Pins that now say `PREVIEW_NOTES` or the feed's mount are edited, not deleted.

**Never:**
- No new token, literal colour, dimension or font stack; no change to `DESIGN.md`, `epics.md` or the spec folder. No new user-facing copy that guides, and no path to a configuration file in any copy.
- Do not exempt a surface by weakening an existing sweep; extend sweeps instead. Dynamic project data (a rail row named `config.toml`) is not static copy and is not swept as such.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Assembled shell, all five persona states | `Shell` with `states` covering idle/note/work/live/error | no `<input`, `role=dialog/combobox/search`, `<footer`, badge/unread/quest, count chip beyond the install chip; every state's word is in the markup | test fails naming the string |
| Empty or pending surface | pre-snapshot rail, empty roster, empty rail snapshot | `null`/empty or the one fact sentence; no loading-like copy | test fails naming the file |
| Application menu | packaged vs unpackaged template | no role `reload`/`forceReload`/`zoom*`, no `save` label; devtools only unpackaged | test fails naming the role |
| New faint rule added | a selector using `--faint` not in the allow-list | suite fails until classified | — |

</intent-contract>

## Code Map

- `src/renderer/ui/app.tsx:4,34,215-219,246` -- `Preview`: menu lines (global skills list), `PREVIEW_NOTES` memlog import and `<RunNoteFeed>`; pinned by `tests/outputs-contract.test.ts:224`, `tests/shell-contract.test.ts:260`, `tests/document-window-contract.test.ts:480`.
- `src/main/index.ts` -- startup; no `Menu` anywhere in `src/main`. OS calls belong in `src/main/windows/` (`macos-escapes.ts`, `main-window.ts`, `doc-window.ts`). `src/main/index.test.ts` mocks `electron` with `vi.mock`; add `Menu` there if `index.ts` imports it.
- `src/renderer/design/tokens.css:451-459` -- keyframes and the one reduced-motion block; pinned by `tests/tokens.test.ts:662-671,859`.
- `src/renderer/ui/status/status-dot.css:53`, `doc/doc-window.css:307`, `outputs/outputs.css:96`, `feed/run-note.css:59` -- faint sole carriers; pinned colours at `tests/team-contract.test.ts:177`, doc/outputs contract tests (grep `--faint` in `tests/`).
- `src/renderer/ui/shell/shell.test.tsx:15-37` -- `agent()`/`snapshot()` fixtures, `Shell` props `states`, `rail`; `outputs.test.tsx:34-36` rail helpers; `doc-app.test.tsx` `DocWindowView` (use `kind: 'text'`).
- `tests/literal-guard.ts` -- `withoutComments`, `allStylesheets`, `guardedStylesheets`, `componentsUnder`; `tests/accessibility.test.ts` already bans arrow keys outside `a11y/`, `outline` outside `focus.css`, more than one `aria-live`.
- Mockup legend: `_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html:373-383,732-739` (read-only evidence). The `--legend-badge*` tokens stay (required by `tests/tokens.test.ts:241`).

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/app.tsx` -- drop menu lines, `PREVIEW_NOTES`, `RunNoteFeed`, memlog import and now-unused imports; keep the Preview under `<Shell>` -- removes the global skills list and the config path from the screen
- `tests/outputs-contract.test.ts`, `tests/shell-contract.test.ts`, `tests/document-window-contract.test.ts` -- repoint the three Preview pins (Preview still mounted under the shell; no `PREVIEW_NOTES`, no menu list) -- they pinned what this story removes
- `src/main/windows/app-menu.ts` (+ `.test.ts`) -- pure `buildMenuTemplate({ packaged })` and `installApplicationMenu()`; `src/main/index.ts` and `src/main/index.test.ts` -- install on ready; mock updated -- closes ⌘R reload and keeps copy for the reader
- `src/renderer/design/tokens.css`, `tests/tokens.test.ts` -- reduced-motion selector covers pseudo-elements; pin updated
- `src/renderer/ui/status/status-dot.css`, `doc/doc-window.css`, `outputs/outputs.css`, `feed/run-note.css` and the tests pinning their colour -- sole carriers to `--dim`
- `tests/negative-surface.test.ts` -- text sweeps: (1) no palette/launcher: no key handler outside `team.tsx`/`outputs.tsx`/`a11y/`, no `key === 'k'`, no `input|textarea|select|contentEditable`, role dialog/combobox/search, and in `src/main` no `globalShortcut`, `accelerator` outside `app-menu.ts`, `before-input-event` outside `doc-window.ts`; (2) no `badge|unread|quest` in components, no `.sort(`/`toSorted` over rows or tiles, no `setBadgeCount`/`dock`; (3) no spinner/skeleton/shimmer/`rotate`-keyframe and no loading-like copy (`loading|resolving|scanning|fetching|please wait|…`) across `src/renderer`; (4) doc window: no reload/save/`CommandOrControl+S`/`webContents.reload` in `src/main`, no preload save channel; (5) audio: no `<audio|<video|new Audio|AudioContext|.play(|Notification|beep|speechSynthesis`, no audio file under the repo outside `node_modules`/`out`, no `appendSwitch`; (6) legend: no `<footer`, `.legend` rule or legend copy ("design prototype", "fictional", "are clickable", "esc closes"); (7) motion: every `animation`/`transition` in renderer CSS is under exactly the two known consumers, none on a pseudo-element or with `!important`, no `scroll-behavior`/`requestAnimationFrame`/`.animate(`, one reduced-motion block; (8) the faint allow-list above, failing on any unlisted selector; (9) no `toml|customize|\.claude/skills|config\.` and none of the four cut strings in static renderer copy or bridge envelope literals
- `src/renderer/ui/shell/negative-surface.test.tsx` -- render `Shell` with all five persona states, rail rows and an empty rail: assert the markup holds no input/dialog/footer/badge/count chip, every state word, no loading-like copy, no `.toml` in static copy, and `Preview`-free skills list (no menu code lines)

**Acceptance Criteria:**
- Given the assembled shell, when its markup, sources and main process are swept, then no palette, launcher, global skills list or `⌘K` path exists, including no default application menu entry
- Given any surface in this epic, then no badge, unread count, quest marker, highlight, sort or recommendation appears, and no empty or pending state shows a spinner, skeleton or stand-in sentence
- Given the document window, then no refresh, edit or save exists as a control, a key, or a menu item
- Given the whole product, then no audio source, API, asset or Electron audio flag exists and no legend footer ships
- Given `prefers-reduced-motion: reduce`, then every animation and transition (pseudo-elements included) is off and each fact motion carried has its word in the markup
- Given the text ramp, then every faint-or-lower rule is in the closed allow-list and no sole carrier remains at that tier
- Given the cut strings, then none appears in `src`, and no configuration file path appears in static copy
- Given the repo gates, then `npm run lint`, `npm run typecheck` and `npm test` exit zero

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass
- verdicts: 32 reviewer findings grouped by shared claim into 21 rows — high 0, medium 1, low 20, false 0, maybe-false 0 (Blind Hunter 14, Edge Case Hunter 15, Verification Gap 2, Intent Alignment 1 descriptive)
- findings:
  - `[medium]` `[patch]` Verification Gap: the `packaged` argument and "before the first window" order of `installApplicationMenu` are untested at startup — patched: startup test records call order and asserts `toggleDevTools` for the unpackaged mock; a source pin ties `index.ts` to `installApplicationMenu(app.isPackaged)` ahead of `openProjectWindow()`. Also covers Blind Hunter's over-titled/order-dependent startup test row.
  - `[low]` `[patch]` Edge Case Hunter + Blind Hunter: `KEY_PATTERN` and the ⌘K sweep miss `onKeyDownCapture`, `event.code`, `KeyK`, `key.toLowerCase()` — patched: both regexes widened.
  - `[low]` `[patch]` Edge Case Hunter + Blind Hunter: the `FAINT` regex needs `)` after the token, so a `var(--faint, x)` fallback escapes — patched.
  - `[low]` `[patch]` Edge Case Hunter + Blind Hunter: the motion-consumers test sorts asymmetric matchers by `String()` and its team.css matcher accepts any selector — patched to plain strings with the real selector.
  - `[low]` `[patch]` Edge Case Hunter + Blind Hunter: the cut-string sweep misses curly apostrophes and wrapped lines — patched with quote and whitespace normalisation.
  - `[low]` `[patch]` Blind Hunter: loading and audio sweeps miss `aria-busy`, `progressbar`, `<progress`, `.webm/.mp4/.caf` — patched.
  - `[low]` `[patch]` Blind Hunter: `PERSONA_STATES[index]` silently drops coverage if a state is added — patched with a length assertion.
  - `[low]` `[patch]` Verification Gap + Blind Hunter: `run-note.css` comment is one over-long line — patched, rewrapped.
  - `[low]` `[reject]` Blind Hunter: the fixed `Preview` is never rendered — `Preview` is unexported and `App` cannot render under node; the `\bmenus\b` sweep over every renderer `.tsx` outside `shell.tsx` and `team/` already covers `app.tsx`, and rename or destructure evasions would still need the word `menus`.
  - `[low]` `[reject]` Blind Hunter + Edge Case Hunter: `.rail-group`, `.chat-head-sub` and `.outputs-empty-path` classifications are judgement — recorded with reasons in the allow-list and Design Notes; the heading's directory is also in the document window's title bar, and the description is named by tile and header.
  - `[low]` `[reject]` Blind Hunter + Edge Case Hunter: a menu failure routes to `reportStartupFailure` and exits — a broken application menu is a startup defect the existing path reports loudly; swallowing it would hide it.
  - `[low]` `[reject]` Blind Hunter: the app menu is macOS-shaped and hard-codes its label — the product is macOS only in v1 and OS calls are confined to `windows/`.
  - `[low]` `[reject]` Blind Hunter + Edge Case Hunter: the spec says `installApplicationMenu()` while the code takes `packaged` — a descriptive drift, behaviour is what the spec's Always clause states.
  - `[low]` `[reject]` Blind Hunter: other reload routes (will-navigate, loadURL, drag-drop) and `webPreferences.devTools` — existing `doc-window.test.ts` pins navigation prevention, and with no menu role there is no DevTools accelerator in a packaged build.
  - `[low]` `[reject]` Blind Hunter: sweeps over- and under-reach (`\bNotification\b`, `\bsave\b`, exact sort list) — each is intentionally strict; a legitimate later use fails loudly with the file named, which is the sweep's purpose.
  - `[low]` `[reject]` Edge Case Hunter: `withoutCodeComments` is a hand-rolled scanner, audio walk lacks try/catch, CSS-in-JS motion — all hypothetical; the repo has no inline style (`style={` is banned) and the scanner passes on every source today.
  - `[low]` `[reject]` Edge Case Hunter (claims): key sweep allows whole directories, not two files; `.run-note-time` change is unrendered, `RunNoteFeed` unmounted — the directories hold the pass-through components, and the unmounted feed is recorded as a residual risk.
  - `[low]` `[reject]` Blind Hunter: `>\+?\d+<` and `not.toContain('outputs')` are blunt — they are pins on the empty-chip and null-rail contracts today and fail loudly.
  - `[low]` `[reject]` Blind Hunter: `app.tsx` comment narrates "Story 1.14 removed" and spec metadata (`oversized`, empty logs, sprint status absent) — repo comments name their stories; logs fill in this pass and the sprint status is the finalisation step.
  - `[low]` `[reject]` Blind Hunter: four colours moved off the `--faint` tier without recording the divergence — recorded in Design Notes and the Auto Run Result residual risks; DESIGN.md is frozen by the spec.
  - `[low]` `[reject]` Intent Alignment (descriptive): the intent's second half (sprint update, close, commit) is the finalisation step after review; the diff under review rightly lacks it.

## Design Notes

**Why remove from `Preview` rather than exempt it.** The AC is about "the shell as built": `Preview` is mounted in the shell's thread, so a global skills list there is reachable. Its 1.5–1.7 judgements are made; the portrait rows stay as harmless scaffolding, the menu lines and memlog feed (which print `customize.toml`) go.

**Why a menu at all.** `Menu` is unset, so Electron's default applies (⌘R, DevTools, zoom). The document window's "no refresh" is only true if the menu is ours. Edit's copy/select-all stay because reading is the product.

**Why `--dim` for sole carriers.** The ramp is locked, so the cure is to move the string up a tier, not to add a restatement or a token; `--dim` already exists and carries the topbar path.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: all exit zero
- `grep -rnE 'customize\.toml|PREVIEW_NOTES|uxMemlog' src` -- expected: no user-facing hits
- `git diff --stat` -- expected: `src/`, `tests/`, this spec and the sprint status only

## Auto Run Result

Status: done

**What was implemented.** Epic 1's prohibitions are now verified rather than assumed, and the audit's four real violations are fixed. `Preview` in `app.tsx` no longer lists every persona's menu (a global skills list) or mounts the run-note feed over the UX memlog (which printed `customize.toml`); the portrait, derived-grid and initials rows stay. Electron's default application menu (⌘R reload, zoom, DevTools in every window) is replaced by a role-only menu built in `src/main/windows/app-menu.ts` (app, Edit with copy and select-all, Window; Toggle Developer Tools only when unpackaged) and installed before the first window. The reduced-motion block now reaches pseudo-elements. Four strings that were the only visible carrier of a fact (`.state-line`, `.doc-foot`, `.output-row-owner`, `.run-note-time`) moved from the faint tier to `--dim`. `tests/negative-surface.test.ts` pins every prohibition as a text sweep over `src/` (palette and ⌘K, badges and sorting, spinner and stand-in copy, refresh/edit/save, audio, legend footer, motion inventory, a closed faint-tier allow-list, config paths and the cut strings), and `src/renderer/ui/shell/negative-surface.test.tsx` renders the assembled `Shell` with all five persona states and the document window to check the markup.

**Files changed.**
- `src/renderer/ui/app.tsx` — menu lines, memlog feed and its import removed from `Preview`.
- `src/main/windows/app-menu.ts` (+ test), `src/main/index.ts`, `src/main/index.test.ts`, `src/main/startup.test.ts` — the application menu and its wiring tests.
- `src/renderer/design/tokens.css` — reduced motion covers `::before`/`::after`.
- `src/renderer/ui/status/status-dot.css`, `doc/doc-window.css`, `outputs/outputs.css`, `feed/run-note.css` — sole carriers to `--dim`.
- `tests/negative-surface.test.ts`, `src/renderer/ui/shell/negative-surface.test.tsx` — new sweeps.
- `tests/outputs-contract`, `shell-contract`, `document-window-contract`, `persona`, `run-note-feed`, `team-contract`, `tokens` tests — pins that held what this story removed or changed were repointed, not deleted.
- This spec.

**Review findings.** 32 reviewer findings grouped into 21 rows (high 0, medium 1, low 20). Patched (8 rows: 1 medium, 7 low): the startup wiring of the menu (argument and order), wider key and ⌘K regexes, the faint regex fallback form, the fragile motion-consumer comparison, curly-quote cut strings, `aria-busy`/`progressbar` and extra audio extensions, a persona-state length guard, and a rewrapped comment. Deferred: none. Rejected with reasons (13 rows, all low): see the triage log; the heavier ones are the unrendered `Preview` (covered by the `menus` sweep), the judgement classifications of `.rail-group`, `.chat-head-sub` and `.outputs-empty-path`, and the macOS-only menu shape.

**Follow-up review recommended: false.** No high was patched and only one medium was; it was a test-coverage gap, now closed and re-checked.

**Verification.** `npm run lint`, `npm run typecheck` and `npm test` exit zero (68 files, 1398 tests) after the patches; one earlier full run hit the known intermittent `watch-install` timing test in a file this story did not touch, and the next run was green. Seven of the new text sweeps were shown to fail without the fixes. The spec's grep finds only the non-user-facing `CUSTOMIZE = 'customize.toml'` file-watch constant in `watch-install.ts`.

**Residual risks.** The menu was verified through its template and a mocked startup, not by looking at the running Electron app. DESIGN.md and the mockup place the four moved strings at the faint tier; the locked ramp was resolved in favour of the AC and DESIGN.md is unedited. `RunNoteFeed` and `.run-note-time` are now mounted nowhere until Epic 3, so the `--dim` change there is pinned by source only. Tiles still show per-persona menu codes (AD-3), which the sweeps allow in `shell.tsx` and the team directory only.
