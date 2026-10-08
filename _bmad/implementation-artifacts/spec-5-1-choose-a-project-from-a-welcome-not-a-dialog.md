---
title: 'Story 5.1: Choose a project from a welcome, not a dialog'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: '681cb0dd3edd14561ba39c43c774d948197eccd1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad/planning-artifacts/epics.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/mockups/welcome-screen-chosen.html'
warnings: [oversized]
deferred:
  - summary: >-
      The `quitting` flag set in the `before-quit` handler has no test of its own.
    evidence: |-
      Only the user-closed-Welcome route is tested; removing `quitting = true` from `before-quit` leaves every test green. Electron normally does not emit `window-all-closed` once `app.quit()` is under way, so this is belt-and-braces.
    location: >-
      src/main/index.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The harness opens a native folder dialog before any window exists; cancelling it quits the app, closing the last project window raises it again, and no project is remembered. The first thing a user meets is an operating-system chooser, not the product.

**Approach:** Replace that path with a Welcome window of its own (own page entry, own preload bundle, no project): one open action and drop target, up to eight recent projects, and the five core personas in four lanes. Built in the story's three seams, in order: A the window, open action, drop and lifecycle; B the recent list; C the team. The authoritative acceptance text is Story 5.1 in `_bmad/planning-artifacts/epics.md` (`### Story 5.1`); the criteria below are its observable form.

## Boundaries & Constraints

**Always:** Decisions confirmed at their defaults: closing the Welcome quits; `⌘O` on the Welcome; recent cap 8; a command-line project is recorded as recent; age wording `now`, `Nm`, `Nh`, `Nd`. The Welcome window is 1080 × 720, `contextIsolation` on, `nodeIntegration` off, `sandbox` on, never navigates (`will-navigate` and window-open denied, so a dropped file cannot replace the page). Preload exposes exactly four named methods (recent list, choose a folder, open a recent row, open dropped files), no generic `invoke`/`send`, each on a channel spelled in `src/shared/channels.ts`. All styling through tokens (no literal colour, dimension, radius, font), at most the existing ≤1000px breakpoint, no `prefers-color-scheme`. Harness strings lower case, mono, `·`-separated, no terminal punctuation; persona descriptions in sans from the DESIGN.md table, verbatim. One polite live region via `a11y/live-region`. Recent file lives under `userData`, holds only `{path, openedAt}`, is written atomically, and nothing is ever written into a project.

**Never:** No change to Preflight, the project window, or any conversation, session, rail or document channel; no project switcher; no resolver, `claude` or `uv` run for the Welcome or a recent row; no *clear*/*remove* recent; no spinner, animation, badge, count, version, tour, wizard, link out, sound, recommended or highlighted persona; no theme line (Story 5.2); no portrait above 44px; descriptions are not read from any project or attributed to a persona; the Welcome's page and preload import nothing from the shell (`app`, `shell`, `outputs`, `install`, `team`, `chat`, `feed`) — it reuses only `design/*`, `a11y/*` and `persona/*`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Launch, no path | no positional argv | Welcome opens, focus on the open button, no dialog | — |
| Launch, folder path | valid dir argv | project opens, no Welcome; applies to the first window only | non-dir → `startup/project-path-not-a-directory · <path>` on stderr, exit 1, no window |
| Choose, cancel | chooser cancelled | Welcome stays, app does not quit, focus on button | — |
| Choose / drop folder / recent row | a folder, already open | that window raised, no second, Welcome closes | — |
| Drop a file or several items | not exactly one folder | nothing opens; `not a folder · <name>` in the drop-hint place, announced once; cleared by next drop or choice | main re-checks the path is a directory |
| Recent, folder gone | recorded path missing | row stays, `folder missing` in place of age, announced unavailable, activation does nothing | no remove control |
| Recent absent/unreadable | no file, bad JSON | section not rendered (no label), no error surfaced | next open writes the file afresh |
| Window closes | Welcome closed by the user / last project closed / activate with no window | app quits / Welcome opens / Welcome opens; never a second Welcome | quitting flag stops `window-all-closed` reopening it |

</intent-contract>

## Code Map

- `src/main/index.ts` -- startup (`openProjectWindow`, `window-all-closed`, `activate`): becomes `openProject(path)` (create or raise the project window, record recent, close Welcome as `chosen`) plus `openWelcome()`; add a `quitting` flag set on `before-quit` and on a user-closed Welcome.
- `src/main/windows/choose-project.ts` -- keep `projectPathArgument`, `directoryFromArgument`, `ProjectPathError`, `chooseProjectDirectory` (same dialog options); `resolveProjectPath` loses its chooser fallback (command line only, `null` = none).
- `src/main/windows/main-window.ts` -- `createProjectWindow` already returns the existing window per project; the caller raises it (`show`/`focus`).
- `src/main/windows/doc-window.ts` -- the precedent to mirror: own page (`DOC_PAGE`, dev-server URL vs `loadFile`), own preload path, `did-fail-load`, nav denial, `isDocWindow`.
- `src/main/windows/app-menu.ts` -- `MenuFocus` gains `'welcome'` (File ▸ Open Project Folder… `⌘O`, Edit, View zoom only, Window); project and document templates unchanged; `browser-window-focus` picks the kind.
- `src/main/doc-bridge.ts`, `src/main/bridge-kit.ts` -- the bridge pattern (`senderOf`, envelope, `ipcMain.handle`); the new `welcome-bridge.ts` follows it and refuses any sender that is not the Welcome window.
- `src/main/sources/persistence/transcript-file.ts` -- the atomic temp-file-then-rename write and the never-throwing read to copy for `recent-file.ts`.
- `src/shared/channels.ts` -- four new channels (`welcome:recent`, `welcome:choose`, `welcome:open-recent`, `welcome:open-dropped`); `tests/channels-contract.test.ts` count 22 → 26.
- `src/preload/doc.ts`, `doc-api.d.ts` -- template for `welcome.ts` / `welcome-api.d.ts` (`window.welcome`); `webUtils.getPathForFile` lives only in this preload.
- `electron.vite.config.ts` -- add `welcome` to the preload and renderer inputs; `tests/preload-bundle.test.ts` -- build all three preloads, each with no relative require.
- `src/renderer/doc.html`, `ui/doc/main.tsx` -- template for `welcome.html`, `ui/welcome/main.tsx`; `design/tokens.css` -- add `--welcome-col` (560px), `--welcome-team-max` (960px) and any lane/card tokens; `design/page.css` sets `body{overflow:hidden}`, so the Welcome scrolls inside its own root at ≤1000px.
- `src/renderer/ui/persona/portrait.tsx` (`portrait(art, 44, 'idle', {name,title})`), `art-params.ts` (`artParamsFor('bmad-agent-analyst'|'-pm'|'-ux-designer'|'-architect'|'-dev')`) -- the faces; `a11y/live-region.tsx` + `announcer.ts`; `a11y/roving-tabindex.ts` (`rovingKey`, vertical list, `activateOn: ['Enter']`) for the recent list.
- Tests that move: `src/main/index.test.ts` (dialog-reopen/quit tests replaced), `src/main/startup.test.ts` (chooser expectations → Welcome), `src/main/windows/choose-project.test.ts` ("no path opens the chooser" removed), `tests/bridge-contract.test.ts` (add `welcome` exposure, shell 17 and doc 5 unchanged), `tests/accessibility.test.ts` (`<LiveRegion` list adds the Welcome), `tests/tokens.test.ts` (breakpoint list adds the Welcome's ≤1000px), `src/main/windows/app-menu.test.ts`.

## Tasks & Acceptance

**Execution:**
- `src/shared/channels.ts`, `src/shared/welcome.ts` -- add the four channels and the reply types (recent rows `{path, name, parent, openedAt, exists}`, open ack `{ok:true}|{ok:false, name?}`) -- one spelling per channel, Bridge-layer types only.
- `src/main/fold/recent-projects.ts` (+test) -- pure: parse tolerant of any bad input, record (move to top, dedupe, cap 8), display parent with `~` -- keeps the list rule testable without I/O.
- `src/main/sources/persistence/recent-file.ts` (+test) -- read never throws (missing/corrupt = empty), atomic write to `<userData>/recent-projects.json`, never inside a project.
- `src/main/windows/welcome-window.ts` (+test) -- singleton 1080×720 window, `isWelcomeWindow`, `closeWelcome('chosen')`, `onClosed('user'|'chosen')`, navigation denied, load failure destroys it.
- `src/main/welcome-bridge.ts` (+test) -- four handlers; recent rows stat each folder (no resolver); choose = single-flight `chooseProjectDirectory`; open-recent only for a path in the recorded list; open-dropped requires exactly one path that is a directory; opening goes through the injected `openProject`.
- `src/main/index.ts`, `windows/choose-project.ts`, `windows/app-menu.ts` -- startup, lifecycle and the Welcome menu per the Code Map; replace the pinned "closing raises the dialog" and "cancel quits" tests with the Welcome ones.
- `src/preload/welcome.ts`, `welcome-api.d.ts`, `electron.vite.config.ts` -- the four-method bridge and the third preload/page entries.
- `src/renderer/welcome.html`, `src/renderer/ui/welcome/*` (+tests) -- `main.tsx`, `welcome-app.tsx` (topbar, head, open button, drop zone, recent list, team), `welcome.css`, `personas.ts` (the five-row table: id, name, title, lane, description), `recent-age.ts`, `drop.ts`; drop handlers `preventDefault` on `dragover`/`drop`.
- `tests/welcome-contract.test.ts` and `src/renderer/ui/welcome/welcome-audit.dom.test.tsx` -- static contract (isolation, imports, tokens, negative surface, copy register) and the audit mounting recent rows present, absent, one missing, and a rejected drop; update the contract tests named in the Code Map.

**Acceptance Criteria:**
- Given no project path on the command line, when the app starts, then a Welcome window is made, no dialog is opened (a dialog stub fails the test if called) and the open button holds focus.
- Given a chosen, dropped or recent folder, when it opens, then its project window opens (or the existing one is raised), the Welcome closes in the same step, and the folder is first in a recent file of at most eight unique entries.
- Given the chooser is cancelled, then the Welcome stays and the app does not quit; given the Welcome is closed by the user, then the app quits and no second Welcome opens.
- Given the last project window closes or the app is activated with no window, then exactly one Welcome opens.
- Given recent rows, then each shows folder name, `~`-parent and `now`/`Nm`/`Nh`/`Nd`; a missing folder shows `folder missing`, does nothing on activation and has no remove control; with none recorded no recent label renders.
- Given a non-folder or multi-item drop, then nothing opens and `not a folder · <name>` shows once and is announced once.
- Given the Welcome, then Mary, John, Sally, Winston and Amelia show at 44px, full opacity, under `analysis`, `planning`, `solutioning`, `implementation` with the table's descriptions, none focusable, highlighted or recommended; the meta line reads `the five core personas, by phase of the method · a project's own install can add more`.
- Given the contract tests, then the shell's 17 and the document window's 5 methods are unchanged, the Welcome's 4 are pinned beside them, and typecheck, lint, tests and `npm run build` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 28 findings — high 0, medium 1, low 15, false 12, maybe-false 0
- findings:
  - `[medium]` `patch` ⌘O menu callback routes a chooser rejection to `reportStartupFailure` (app.exit(1)) — fix: catch writes a stderr diagnostic and the app keeps running (edge-case, blind).
  - `[low]` `patch` ⌘O route not tested through the composition root — test added in `src/main/startup.test.ts` (verification-gap).
  - `[low]` `patch` restore branch of `raiseProjectWindow` never run by a test — test added (verification-gap).
  - `[low]` `patch` default sender check never exercised with a non-Welcome sender — test added (verification-gap).
  - `[low]` `defer` `quitting` set in `before-quit` is unpinned — Electron does not normally emit `window-all-closed` once `app.quit()` is under way; belt-and-braces (verification-gap).
  - `[low]` `reject` Welcome `did-fail-load` quits the app as a user close, only a `console.error` — same ordinary-exit outcome the project window had; fix would add a new close reason (blind, edge).
  - `[low]` `reject` `window-all-closed`/`activate` lost `.catch(reportStartupFailure)` — a throw from `BrowserWindow` construction is unreachable in practice and the fix adds guards (blind).
  - `[low]` `reject` project identity is the raw path string (symlink, trailing slash) — chooser and drop return canonical paths; not demonstrated (blind).
  - `[low]` `reject` `parseRecent` ignores `version` — only matters on a downgrade across builds that do not exist (blind, edge).
  - `[low]` `reject` synchronous `statSync` on up to eight rows / a drop array — local folders; unbounded array needs a compromised renderer (blind, edge).
  - `[low]` `reject` `raiseProjectWindow` on a still-loading window shows it early — a brief blank window, cosmetic (edge).
  - `[low]` `reject` `webUtils.getPathForFile` could throw in the preload — Electron's documented call does not throw for a `File` (edge).
  - `[low]` `reject` `closeWelcome('chosen')` racing a user close — the user close already quit; no reachable harm (edge).
  - `[false]` `reject` a drop or recent-row open while the chooser awaits opens a second project — a parentless macOS open dialog is application-modal, so no input reaches the Welcome (edge).
  - `[false]` `reject` quitting while the dialog is up — same modal; the window cannot be closed (edge).
  - `[false]` `reject` recording a recent can throw before `closeWelcome` — `record` catches write failures and reports them; the `userData` lookup does not throw after ready (edge).
  - `[false]` `reject` a project window that fails to load now reopens the Welcome silently — it reopened the chooser before; behaviour unchanged (edge).
  - `[false]` `reject` the Welcome menu needs a focus event — the Welcome is shown focused and the first `browser-window-focus` installs it (edge).
  - `[false]` `reject` missing recent row is not announced — the row is `aria-disabled` with visible `folder missing` text, which is the announcement the criteria ask for (edge).
  - `[false]` `reject` a drop is accepted anywhere in the window rather than one target — the criterion is "drops a folder on the Welcome" (blind).
  - `[false]` `reject` `open-dropped` trusts any directory — any folder is a valid project by design; recent rows are the list-checked route (blind).
  - `[false]` `reject` recent age at `faint` — DESIGN.md sets the age in `meta` at `faint` and the criteria name only the drop hint and the path as acted-on facts (blind).
  - `[false]` `reject` duplicated portrait `aria-label`, `<h1>` plus brand, heading structure — the same pattern as every portrait and the topbar in the product (blind).
  - `[false]` `reject` a repeated refused drop is not re-announced — the announcer's sequence key re-announces identical messages (blind).
  - `[false]` `reject` drag-and-drop only tested through mocks, manual check unrecorded — the implementer ran the real app and dropped a file and a folder; not a defect in the diff (blind).
  - `[low]` `reject` `dragleave` highlight flicker, `relatedTarget` null — cosmetic and unproven (blind).
  - `[low]` `reject` tests coupled to source formatting, allowlist duplicated in three contract tests, hard-coded copy exemptions — developer-only, matches the existing contract-test style (blind).
  - `[low]` `reject` Welcome age and missing-state not refreshed while open — a Welcome stays open for seconds; not in the criteria (blind).
  - Intent-alignment audit (descriptive): reads the intent as the whole story plus tracking closure; `sprint-status.yaml` is the surface still to update at finalize — handled below, not a defect in the diff.

## Design Notes

Seam order is A, B, C within one change; each seam leaves the suite green. The Welcome shares the persona art and live region with the shell (renderer modules the epic says the Welcome draws), but the page entry and the preload bundle share no runtime module with the shell's. `⌘O` is the menu accelerator; the menu click runs the same single-flight chooser as the button. After a cancelled chooser the button route restores button focus explicitly; the menu route leaves focus where the sheet found it.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no warnings
- `npm test` -- expected: all pass
- `npm run build` -- expected: three preload bundles and the `welcome.html` entry emitted

**Manual checks (if no CLI):**
- `npm run dev` with no path: the Welcome opens, `⌘O` and drop both open a project and close the Welcome.

## Auto Run Result

Status: done

**Summary.** The harness opens to a Welcome window instead of a native folder dialog (seams A, B and C of Story 5.1 in one change). One open action and drop target, up to eight recent projects, and the five core personas in four lanes. Cancelling the chooser no longer quits; closing the Welcome quits; the last project window closing or a reactivation opens one Welcome.

**Files changed.**
- `src/main/index.ts`, `windows/choose-project.ts`, `windows/main-window.ts`, `windows/app-menu.ts` -- startup, lifecycle, `quitting` flag, raise-or-open, Welcome menu with `⌘O`.
- `src/main/windows/welcome-window.ts`, `welcome-bridge.ts`, `fold/recent-projects.ts`, `sources/persistence/recent-file.ts` -- the window, the four handlers, the recent list and its atomic file.
- `src/shared/channels.ts`, `src/shared/welcome.ts`, `src/preload/welcome.ts`, `welcome-api.d.ts`, `electron.vite.config.ts` -- four channels, reply types, third preload and page entry.
- `src/renderer/welcome.html`, `src/renderer/ui/welcome/*`, `design/tokens.css` -- the page, recent list, lanes, personas table, styles and tokens.
- Tests: new unit, DOM audit and `tests/welcome-contract.test.ts`; the dialog-reopen and cancel-quits tests replaced; contract tests updated (channels 22 → 26, third bridge exposure, breakpoint and live-region lists).

**Review.** 28 findings: medium 1, low 15, false 12. Patches applied: 4 (the ⌘O chooser failure no longer exits the app; tests added for the ⌘O route through the composition root, the minimized-window restore, and a non-Welcome sender). Deferred: 1 (`before-quit` flag unpinned, low). Rejected: 23, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high patched; one medium patched).

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` (180 files, 4303 tests, plus 55 watcher tests) and `npm run build` all pass after the patches. The implementer also drove the built app in real Electron over CDP: launch with no path shows the Welcome with focus on the open button; a real file drop shows `not a folder · <name>`; a real folder drop opens the project and closes the Welcome; closing the project returns the Welcome with the recent row; closing the Welcome quits.

**Residual risks.** The native chooser and `⌘O` were not exercised live (covered by unit tests only). A drop passes `File[]` through `contextBridge` to the preload, which is Electron's documented `webUtils` pattern and worked in the real-app check.
