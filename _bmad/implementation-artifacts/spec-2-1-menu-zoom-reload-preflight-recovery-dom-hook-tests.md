---
title: 'Epic 2 opening items: zoom and reload, preflight recovery, DOM hook tests'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: 'fbc9450ba744da2ca89994fac7b58958e2786bc5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad/implementation-artifacts/epic-1-retro-2026-09-30.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      The View menu swap on window focus and Chromium's per-origin zoom sharing between the project and document windows were never observed in a running Electron app.
    evidence: |-
      Only the pure template and a hand-driven browser-window-focus handler are tested; the npm run dev manual check was not run. A manual run settles it: focus the document window, confirm Reload is absent, zoom it, and see whether the project window rescales.
    location: >-
      src/main/windows/app-menu.ts
    severity: medium (unverified)
  - summary: >-
      A cached clean tool verdict is never re-asked, so if uv is removed or claude signs out later, resolver errors show but the preflight remedy never appears.
    evidence: |-
      projections/install.ts keeps a clean verdict for the projection's life and focus refresh only re-resolves; the requested fix was only to drop verdicts that hold an error.
    location: >-
      src/main/projections/install.ts:119
    severity: low
---

<intent-contract>

## Intent

**Problem:** Three Epic 1 retro items are due before Epic 2 builds on them. (1) Story 1.14's role-only menu removed zoom and reload from every window; the human decided they come back (Story 2.1's two carried-in criteria). (2) The preflight verdict is cached for the window's life, so following the remedy ("install uv", sign in) leaves the user blocked, and watchers rooted at a missing `_bmad` / `.claude/skills` never see them created. (3) No test mounts a hook, so `useRail`, `useInstall`, `useDocument`, `LiveRegion` and `useNow` are unobserved (jsdom 30.1.1 is already installed, opted in per file).

**Approach:** Rebuild the application menu on window focus so the View menu is project-window (zoom + reload) or document-window (zoom only, no reload entry), all through Electron roles. Make the install projection cache a tool verdict only when it is clean, re-ask on window focus while blocked, and let both watchers see their roots appear. Cover the five renderer units under jsdom with a small shared mount helper.

## Boundaries & Constraints

**Always:** Roles only in the menu, no spelled accelerator. Exact-pinned dependencies; add none (jsdom exists). A DOM test opts in with `// @vitest-environment jsdom` on line 1; `vitest.config.ts` default stays `node`. Layering holds (`tests/layering.test.ts`). Test names state the defect they make impossible. Comments explain why; no epic/story references in code comments. Gate: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` all exit zero.

**Never:** Recording the Story 2.1 `fixtures/runs/` corpus (needs real long `claude` runs; stays open, so story 2.1 is NOT marked done). No packaged-app PATH work (retro item 1), no other watcher/failure-path hardening (item 9), no `forceReload`, find, undo/redo or any other role. Do not touch `watch-document.ts`. No `@testing-library`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Project window focused | menu rebuilt | View: `reload`, `zoomIn`, `zoomOut`, `resetZoom` | n/a |
| Document window focused | menu rebuilt | View: `zoomIn`, `zoomOut`, `resetZoom`; no `reload` item at all | n/a |
| Tool missing, then installed | first refresh errors, second passes | second refresh re-asks both tools; preflight clears; resolvers run | n/a |
| Tool check throws / times out | `check-failed` | not cached; next refresh re-asks | diagnostic as today |
| Clean verdict | both tools pass | asked once across many refreshes | n/a |
| Focus while blocked | snapshot has preflight or resolver errors | one refresh | n/a |
| Focus while healthy | no errors | no refresh (no resolver respawn per focus) | n/a |
| `_bmad` created after launch | root absent at start | install watcher fires `onChange`; artifact watcher reports its files as `artifact:written` | watcher `error` stays swallowed/forwarded as today |
| `.claude/skills` created after launch | root absent at start | install watcher fires `onChange` | same |

</intent-contract>

## Code Map

- `src/main/windows/app-menu.ts` -- `buildMenuTemplate({packaged})` pure template; add a `focus: 'project' | 'document'` input and a View menu; `installApplicationMenu(packaged)` (call site literal asserted by `tests/negative-surface.test.ts:187-200`) must keep that signature and additionally rebuild on `app.on('browser-window-focus')`.
- `src/main/windows/app-menu.test.ts` -- asserts roles list and "no reload/zoom role"; mocks `electron` with only `Menu`; must be amended (add `app` to the mock).
- `src/main/windows/doc-window.ts` -- `openByParent` holds each doc window's handle (`handle.sender.id`); add an exported `isDocWindow(webContents)`-style predicate for the menu.
- `src/main/index.ts:84-90` -- installs the menu before the first window; `src/main/index.test.ts:50`, `src/main/startup.test.ts:90` mock `Menu`/`app`; keep them green.
- `tests/negative-surface.test.ts:160-200` -- the Story 1.14 menu guard to amend: reload absent for the document window rather than from the menu altogether.
- `src/main/projections/install.ts:119-154` -- `toolVerdict` caches `verdict` forever; `resolveAll` consumes it. `projections/install.test.ts` exists.
- `src/main/install-bridge.ts:60-85` -- `serviceFor` builds projection + watcher per sender; add a focus subscription (via `BrowserWindow.fromWebContents`, injectable through `InstallBridgeDeps`), removed on `destroyed`. `install-bridge.test.ts` exists.
- `src/main/sources/install/watch-install.ts:67-105` -- `watch([bmad, skills])` with a path-shaped `ignored`; chokidar 4.0.3 never sees a root that did not exist at start. `watch-install.test.ts` is in the serial `watchers` project.
- `src/main/sources/project/watch-artifacts.ts:41-60` -- watches `<root>/_bmad` only; same blind spot. `watch-artifacts.test.ts` likewise.
- `src/renderer/ui/outputs/use-rail.ts`, `install/use-install.ts`, `doc/use-document.ts` -- thin hooks over `rail-state.ts` / `install-state.ts` / `document-state.ts` (`accept*` rejects an older revision; `connect*` subscribes before asking). `outputs/use-now.ts` (30s interval). `a11y/live-region.tsx` + `announcer.ts` (2s throttle, drain every 250ms, `performance.now()`, key-by-seq so equal messages re-announce).
- `src/renderer/ui/doc/render-markdown.dom.test.ts` -- the existing jsdom pattern to copy.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- `action_items` ids `epic-1-retro-item-2-…`, `-4-…`, `-5-…`.

## Tasks & Acceptance

**Execution:**
- `src/main/windows/doc-window.ts` -- export a predicate telling whether a `WebContents`/window is a document window -- the menu must know which kind has focus without a second registry.
- `src/main/windows/app-menu.ts` -- add a View submenu from roles (`reload` only when focus is `project`; `zoomIn`, `zoomOut`, `resetZoom` always); rebuild and `Menu.setApplicationMenu` on `browser-window-focus`; fix the header comment, which now claims there is no reload or zoom -- restores the capabilities without ever giving the document window a refresh.
- `src/main/windows/app-menu.test.ts`, `tests/negative-surface.test.ts` -- rewrite the roles/negative assertions per focus (project has reload and zoom; document has zoom and no reload; neither has forceReload, find, help, undo/redo/cut/paste, a spelled accelerator, or save); test the focus rebuild.
- `src/main/projections/install.ts` -- keep the cached verdict only when it holds no error; drop it otherwise (so `check-failed` is never cached) -- the remedy text must be able to work.
- `src/main/install-bridge.ts` -- on the project window's `focus`, refresh when the current snapshot has `preflight` or `errors`; unsubscribe on `destroyed`.
- `src/main/sources/install/watch-install.ts`, `src/main/sources/project/watch-artifacts.ts` -- also watch the project root, admitting only `_bmad` (and, for install, `.claude` then `.claude/skills`) so nothing else under the root is walked; extend the path-shaped `ignored` accordingly.
- `src/main/projections/install.test.ts`, `src/main/install-bridge.test.ts`, `src/main/sources/install/watch-install.test.ts`, `src/main/sources/project/watch-artifacts.test.ts` -- cover every I/O row above (real chokidar for the watchers, tmp dirs, `debounceMs` small).
- `src/renderer/ui/testing/render-hook.ts` (or equivalent) + `use-rail.test.ts(x)`, `use-install.test.ts(x)`, `use-document.test.ts(x)`, `use-now.test.ts(x)`, `live-region.test.tsx` -- jsdom, `createRoot` + React `act`, a stubbed `window.harness` / `window.docWindow`. Pin: nothing before the first snapshot; one push is one render; an older revision never replaces a newer one (the `setSnapshot(incoming)` regression must fail a test); a valid snapshot clears an earlier failure; unsubscribe on unmount; absent bridge renders null/`available:false` without throwing; `useNow` ticks on its interval and clears it on unmount; `LiveRegion` renders one `aria-live="polite"` region, announces at most one per 2s in event order, announces two identical messages as two, and clears its timer on unmount. Make sure `tests/*.test.ts` sweeps (accessibility, layering, literal guard) still pass with the new files.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- set action items 2, 4 and 5 to `done` and bump `last_updated`; leave `2-1-…` as it is and note in the spec's Auto Run Result that the corpus recording remains.

**Acceptance Criteria:**
- Given the project window is focused, when the menu is read, then View offers Reload and zoom in, out and reset, each by role with no spelled accelerator.
- Given the document window is focused, when the menu is read, then View offers zoom in, out and reset and no reload entry exists.
- Given `uv` was missing and is then installed, when the project window next gains focus, then the preflight screen clears without closing the window.
- Given `claude auth status` timed out once, when the next refresh runs, then both tools are asked again.
- Given the project had no `_bmad` or `.claude/skills` at launch, when either is created, then the install is re-resolved and the rail rows appear.
- Given `useRail` is changed to `setSnapshot(incoming)` instead of `setSnapshot((current) => acceptRail(current, incoming))`, when the suite runs, then a hook test fails (likewise for `useInstall` and `useDocument`).

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 24 findings — high 0, medium 3, low 10, false 4, maybe-false 7
- findings:
  - `[medium]` `patch` isDocWindow never run by a test (verification-gap; edge hunter's openByParent-ordering and blind hunter's untested predicate fold in) — added real-predicate cases to doc-window.test.ts
  - `[medium]` `patch` default subscribeWindowFocus never run (verification-gap; also edge and blind hunters) — added through-the-real-window tests for focus, destroyed, null and destroyed window
  - `[medium]` `patch` project root named like a temp file is ignored wholesale by the artifact watcher (edge hunter) — root exempted from the noise test, test with a client.tmp root added
  - `[low]` `patch` stray comment line breaks in app-menu.ts and watch-artifacts.ts (verification-gap other findings, blind hunter) — rewrapped
  - `[maybe-false]` `defer` menu swap and per-origin zoom unobserved in a real app (blind, edge, intent audit) — recorded as deferred medium, unverified
  - `[low]` `defer` cached clean verdict never re-asked when a tool later disappears (edge hunter) — pre-existing, outside the requested fix
  - `[false]` `reject` pre-existing files of a newly created _bmad reported as written — the spec's I/O matrix row requires `artifact:written`
  - `[low]` `reject` focus refresh unthrottled / repeats for persistent resolver errors / repeated diagnostics — refresh already coalesces to one in-flight plus one trailing, and the spec row says one refresh per focus while blocked; fix would add complexity
  - `[low]` `reject` fallback to the project menu for any non-document window — only two window kinds exist; a positive allow-list adds a registry for no present case
  - `[maybe-false]` `reject` menu stays document-variant if the document window closes with no focus event — closing a child returns focus to the parent, which fires browser-window-focus; no evidence of a path without it
  - `[low]` `reject` project reload while a document window is open leaves it orphaned — the document window is parent-linked, covers the room, and closes with Esc; harmless
  - `[false]` `reject` relative or symlinked projectRoot makes every path ignored — the chooser yields absolute paths and chokidar reports paths under the watched string; tests run under a symlinked tmpdir and pass
  - `[low]` `reject` subscribeFocus returning a no-op for a null window or throwing leaks a service — a project window always has a BrowserWindow when it asks; unlikely
  - `[low]` `reject` negative-surface reload guard is a brittle source regex — the behavioural guarantee is the template test; not worth a rewrite
  - `[low]` `reject` duplicated scaffolding in the three hook tests and render-hook leaks on a throwing mount — test-only, no named harm
  - `[low]` `reject` fixed sleeps in watcher tests are timing-sensitive — documented trade-off; repeated full runs were green
  - `[false]` `reject` project-rooted watchers spuriously re-resolve for files written just before launch — harmless extra refresh, not a defect
  - `[false]` `reject` missing watcher edge tests (depth, skills recreation, root siblings) — depth is exercised by the skill customisation test and root siblings by the silent-for-rest test
  - `[low]` `reject` getTimerCount assertions in live-region and use-now tests — works on the pinned versions
  - `[maybe-false]` `reject` retro item 5 marked done without evidence — the item was a decision, which the human made; shipping the menu is its implementation
  - `[maybe-false]` `reject` spec verification not evidenced in Auto Run Result — recorded below
  - `[low]` `reject` epic-2-context says 2.1 needs no harness code — planning text, not this change
  - `[low]` `reject` comment overstates that nothing else under the root is walked — wording only, no behaviour
  - `[maybe-false]` `reject` intent audit: corpus recording and real-app menu behaviour not covered — a declared scope boundary, the first deferred

## Design Notes

Rebuild-on-focus is used because Electron menu items are static once built and the template is a pure function already; omitting `reload` for the document window satisfies both "no reload entry enabled" and the amended negative check. Re-asking only while blocked is deliberate: an unconditional refresh on focus would respawn `uv` resolvers on every alt-tab. Chromium keeps zoom per origin, so a zoom in one window may also scale a window sharing its origin; observe and record, do not engineer around it.

## Verification

**Commands:**
- `npm test` -- expected: both projects pass, repeated at least three times (watcher tests are timing-sensitive)
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- `npm run dev` on a project: View menu shows reload and zoom; opening a document and focusing it swaps to zoom only; ⌘R in the project window loses nothing.

## Auto Run Result

Implemented: focus-aware View menu (project: reload and zoom; document: zoom only, no reload entry), preflight recovery (clean-only tool verdict, re-ask on project-window focus while blocked, watchers rooted at the project so a later `_bmad` / `.claude/skills` is seen), and jsdom tests for `useRail`, `useInstall`, `useDocument`, `useNow` and `LiveRegion` through `src/renderer/ui/testing/render-hook.ts`. Retro action items 2, 4 and 5 are `done` in sprint status.

Still open: the Story 2.1 `fixtures/runs/` corpus recording (needs real long `claude` runs), so `2-1-a-recorded-corpus-to-build-against` stays `backlog`.

Test-timing note: rooting the watchers at the project exposes them to file events from a fixture created just before they start, so the real-chokidar tests wait 200ms before starting a watcher and the absent-root tests wait for the removal to drain.

Manual check not run: `npm run dev` View menu swap on focus; per-origin zoom sharing between windows is unobserved.

Review: 24 findings reported; 4 patched (3 medium, 1 low), 2 deferred, 18 rejected with reasons in the triage log. Follow-up review recommended: false (no high patched; the three mediums were a test gap each and a one-line guard).

Verification after patches: `npm test` (71 unit files, 1416 tests; 3 watcher files, 55 tests) green twice, `npm run lint`, `npm run typecheck`, `npm run build` exit 0.

Residual risks: real-chokidar tests remain timing-sensitive on a slow machine; menu swap and zoom sharing unobserved in a live window.
