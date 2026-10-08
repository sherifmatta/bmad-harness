---
title: 'Story 5.2: Choose light, dark or the system''s theme'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: '7ca81275256c017468c84b0b75bc4c0c36947721'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad/planning-artifacts/epics.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The product is dark only: `tokens.css` states `color-scheme: dark`, there is no stored preference, no theme menu and no way to ask a window for another look. A user in a bright room, or one whose Mac is set to light, cannot have the harness agree with their desktop.

**Approach:** Add the light twin as a third token block, `:root[data-theme="light"]`; let main own the one value (`system` | `light` | `dark`, default `system` following macOS live), store it under `userData`, resolve it, and tell every window what to paint; expose it in *View ▸ Theme* and on the Welcome's `theme · system · light · dark` line. Built in seam order: A the light tokens, B the stored choice, System and the menu, C the Welcome's line. The authoritative acceptance text is Story 5.2 in `_bmad/planning-artifacts/epics.md` (`### Story 5.2`); the criteria below are its observable form.

## Boundaries & Constraints

**Always:** The first two `:root` blocks of `design/tokens.css` stay byte-identical; the third block overrides colour tokens only (one twin per colour token in the dark blocks, values from DESIGN.md's `colors-light` map; the four colour tokens that map omits take the values of `mockups/light-a-shell.html`: `--ghost-border-hover:#b5bdc8`, `--skill-button-hover-line:#a8b2c0`, `--shadow-window:0 30px 70px -20px rgba(20,30,50,.35)`, `--shadow-speaking:0 0 0 1px rgba(47,98,192,.22), 0 6px 18px -10px rgba(20,30,50,.18)`) and states `color-scheme: light`. Main is the only source of truth: it stores the choice in `<userData>/theme.json` (written atomically, never into a project), maps it onto Electron's `nativeTheme.themeSource` so native chrome follows, and tells each window the applied theme. A window's preload sets `data-theme` on `<html>` as soon as the document has a root element (from a synchronous state request), and again on each `theme:changed` push, so no frame is painted in the other theme and a change is a pure repaint with no reload. The three new channels are spelled once in `src/shared/channels.ts`; the shell's 17 and the document window's 5 exposed methods do not change; the Welcome gains exactly three (`getTheme`, `chooseTheme`, `onThemeChanged`). Harness strings lower case, mono, `·`-separated, no terminal punctuation; the menu labels `System`, `Light`, `Dark` are the OS's register. No `prefers-color-scheme` anywhere under `src/renderer/` or in any stylesheet.

**Never:** No change to the dark values, any portrait, `ArtParams` or the portrait component's signature; no per-window, per-project or per-persona theme; no theme control in a project window; no transition, toast, sysline or live-region announcement on change; no accelerator, schedule, recommendation (*try light mode*), high-contrast variant, third palette or accent choice; no component or stylesheet other than `tokens.css` names a theme or writes a colour literal; the renderer holds no theme source of truth and reads no media query for it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First run | no `theme.json` | choice `system`; windows painted in the macOS appearance in force | — |
| Stored value | `{"theme":"light"}` etc. | that choice is read and applied before the first window | — |
| Bad stored value | missing file, bad JSON, unknown word | reads as `system`, silently; the next choice rewrites the file | write failure → one stderr diagnostic, choice still applies this session |
| OS appearance changes | choice `system`, OS flips | every open window repaints, no reload | — |
| Choose from menu or Welcome line | `light` while OS is dark | every window repaints at once; menu check and Welcome line follow; stored | a non-choice value or non-Welcome sender on the choose channel is ignored |
| Window created after a change | any kind of window | opens in the theme in force, never the other first | — |

</intent-contract>

## Code Map

- `src/renderer/design/tokens.css` -- 62 colour tokens across the verbatim and promoted dark blocks; add the third `:root[data-theme="light"]` block after the promoted block (before the keyframes), update the stale "Dark only" header comment outside the blocks. `design/page.css` -- header comment records the palette as dark by decision; bring it in line.
- `tests/tokens.test.ts` -- "the theme decision" (lines ~709-740) pins dark-only and `selectors` equals `[':root', ':root']`; replace those assertions per the epic, add the twin-coverage, no-dimension-in-light and WCAG tests (`designValue('colors-light', key)` reads the twins at run time; `tests/literal-guard.ts` has `withoutComments`).
- `src/shared/channels.ts` -- add `THEME_STATE_CHANNEL`, `THEME_CHANGED_CHANNEL`, `THEME_CHOOSE_CHANNEL`; `tests/channels-contract.test.ts` count 26 → 29.
- `src/shared/theme.ts` (new) -- `ThemeChoice`, `ThemeApplied`, `ThemeState`, `THEME_CHOICES`, `followTheme(ipc, document)` used by all three preloads (the inline-shared plugin gives each its own copy).
- `src/preload/index.ts`, `doc.ts`, `welcome.ts`, `welcome-api.d.ts` -- call `followTheme`; Welcome adds the three methods. `tests/bridge-contract.test.ts`, `tests/preload-bundle.test.ts` -- fake `ipcRenderer` gains `sendSync`, stub `document`; Welcome pin 4 → 7, shell 17 and doc 5 unchanged, bundles contain the theme channels.
- `src/main/fold/theme-choice.ts` (new, pure) -- tolerant read of a stored value; `src/main/sources/persistence/theme-file.ts` (new) -- mirrors `recent-file.ts` (`readRecentFile`/`writeRecentFile`: never-throwing read, temp-file-then-rename write).
- `src/main/windows/native-theme.ts` (new) -- the only module touching Electron's `nativeTheme` (`themeSource`, `shouldUseDarkColors`, `updated`).
- `src/main/theme-bridge.ts` (new) -- follows `welcome-bridge.ts`/`bridge-kit.ts`: `ipcMain.on` for the sync state, `ipcMain.handle` for choose (Welcome sender only, via `isWelcomeWindow`), broadcast to `BrowserWindow.getAllWindows()` on every choice and every native `updated`.
- `src/main/windows/app-menu.ts` (+test) -- `buildMenuTemplate` gains `theme` and a `View ▸ Theme` submenu of three radio items in every `MenuFocus`; `installApplicationMenu` rebuilds the installed menu on a theme change; `src/main/index.ts` wires store, controller and menu (read stored value and apply before `openFirstWindow`).
- `src/renderer/ui/welcome/welcome-app.tsx`, `welcome.css`, new `theme-line.tsx` -- the bottom-edge line; `a11y/roving-tabindex.ts` `rovingKey` (horizontal) gives the arrows; `welcome-app.test.tsx`, `welcome-audit.dom.test.tsx`, `tests/welcome-contract.test.ts` -- fake bridge gains the three methods, four→seven pin, negative surface.
- `tests/negative-surface.test.ts` -- pins `app-menu.ts`'s contents and which main files may touch which Electron APIs; expect to extend for `nativeTheme` and the Theme submenu.
- Read-only evidence: `src/renderer/ui/testing/render-hook.ts` (`mount`), `ui/persona/portrait.tsx` (unchanged), `src/main/windows/{main-window,doc-window,welcome-window}.ts` (windows are created hidden; no change needed because the preload paints).

## Tasks & Acceptance

**Execution:**
- `src/renderer/design/tokens.css`, `design/page.css` -- add the light block; fix the comments -- seam A
- `tests/tokens.test.ts` -- replace the dark-only assertions; add twin-for-every-colour-token, light-block-has-no-dimension, light-block `color-scheme: light`, dark blocks unchanged, no theme media query anywhere, and the WCAG pairs (every listed pair at or above 4.5 on `panel`, `text` on `bg`, and `meta` the only pair allowed below) -- seam A
- `src/shared/channels.ts`, `src/shared/theme.ts` (+test), the three preloads, `welcome-api.d.ts` -- channels, types, `followTheme`, Welcome methods -- seam B
- `src/main/fold/theme-choice.ts`, `sources/persistence/theme-file.ts`, `windows/native-theme.ts`, `theme-bridge.ts` (+tests each) -- store, resolve, broadcast; choose refuses non-Welcome senders and non-choices -- seam B
- `src/main/windows/app-menu.ts`, `src/main/index.ts` (+tests) -- *View ▸ Theme* radio submenu in all three kinds; rebuild on change; startup order -- seam B
- `src/renderer/ui/welcome/theme-line.tsx`, `welcome-app.tsx`, `welcome.css` (+tests) -- the line: label, three buttons in one group, one tab stop, arrows, `aria-pressed`, current word `text-strong` not a link, focus untouched by a choice -- seam C
- `src/renderer/ui/theme-audit.dom.test.tsx`, existing contract and audit tests -- audit the shell, a document card, the party view and the document window under both `data-theme` values for literal colours in inline styles; a search of `src/renderer/` for `prefers-color-scheme`; portrait markup byte-identical under both; update every pin the Code Map names -- all seams

**Acceptance Criteria:**
- Given `design/tokens.css`, then its first two blocks are byte-identical to before, a third `:root[data-theme="light"]` block holds a twin for each of the 62 dark colour tokens and nothing else, declares `color-scheme: light`, and the dark theme still declares `color-scheme: dark`; no other stylesheet or component names a theme or a colour literal.
- Given the light twins, then every pair named in the epic clears 4.5 and only `meta` is allowed below.
- Given no stored choice, then the choice is `system`, a window is painted in the macOS appearance in force, and a change of the OS appearance repaints every open window with no reload; given a stored `light`, `dark` or `system`, then it is applied before the first window; given a missing, unreadable or unknown stored value, then it reads as `system` silently and the next choice rewrites it.
- Given *View ▸ Theme*, then it is a submenu of three radio items (`System`, `Light`, `Dark`) with no accelerator and a check on the current one, in the menu of the project, document and Welcome windows, and choosing one stores it, repaints every window at once and touches no session, run, transcript, card, rail row or scroll position.
- Given a window is created, then its `data-theme` is set before its first paint from main's state, and a window opened after a change opens in the new theme; given a change, then nothing is announced, toasted or animated.
- Given the Welcome, then its bottom edge carries `theme · system · light · dark`, right-aligned, the current word `text-strong` with `aria-pressed="true"`, the others `accent`; the three are buttons in one group and one tab stop, arrows move between them, `Enter` or `Space` chooses and focus stays where it is, and choosing is exactly the menu's choice; a project window has no theme control.
- Given the contract tests, then the shell's 17 and the document window's 5 methods are unchanged, the Welcome's are 7, the channels are 29, the portrait markup is identical in both themes, and typecheck, lint, tests and `npm run build` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 19 findings (similar claims from several layers share one row) — high 0, medium 1, low 11, false 7, maybe-false 0
- findings:
  - `[medium]` `patch` the real `observeDocument` MutationObserver path (the usual production path for first-paint theming) has no executing test — added `src/shared/theme.dom.test.ts` (verification-gap, edge).
  - `[low]` `patch` Welcome `getTheme()` unguarded in the `useState` initializer, and a push between that read and the subscription is lost — try/catch fallback to `system`, re-read after subscribing; two tests added (edge, blind).
  - `[low]` `patch` the theme line's roving tab stop stays on a non-current word after the choice changes elsewhere — stop resets when the choice changes; test added (edge, blind).
  - `[low]` `patch` `start()` not idempotent, second call doubles the `nativeTheme` listener; store docblock inaccurate — guard and comment fixed, test added (edge, blind).
  - `[low]` `reject` double `theme:changed` push per choice (explicit broadcast plus `nativeTheme 'updated'`) — the repaint is idempotent and one frame; deduplicating adds state for no visible change (blind).
  - `[low]` `reject` WCAG test measures `panel` pairs only — the epic's criterion names exactly those pairs; the wider surface matrix is not in the story (blind).
  - `[low]` `reject` default `theme` argument yields a dead Theme submenu when omitted — production always passes the controller; only tests omit it (blind).
  - `[low]` `reject` hard-coded promoted-block hash, token counts and `LIGHT_BLOCK` regex are brittle — developer-only pins; a failure names its cause (blind).
  - `[low]` `reject` `choose()`/store failure paths (`userDataPath` throwing, `applyNative` throwing) — unreachable after app ready; `writeThemeFile` already reports without throwing (edge).
  - `[low]` `reject` `chooseTheme` rejection swallowed and a refused choice indistinguishable — the line follows the pushed state, and only the Welcome can call it with one of three words (blind).
  - `[low]` `reject` fallbacks when `sendSync` fails leave the window dark with no diagnostic — a main that cannot answer is a broken app the user sees at once; matches the spec's stated fallback (blind, edge).
  - `[low]` `reject` audit tests partly tautological (equal markup under both themes) and `tokens.css` exempted whole from the `data-*` sweep — the inline-literal sweep is the protecting part; narrowing the exemption is cosmetic (blind, verification-gap).
  - `[false]` `reject` window `backgroundColor` / title bar not themed — windows are created hidden and shown on `ready-to-show`, after the preload has painted; the document window is transparent (blind).
  - `[false]` `reject` `aria-pressed` toggle buttons should be radios — the epic and EXPERIENCE.md specify exactly `aria-pressed` (blind).
  - `[false]` `reject` planning docs not updated for the NFR15 reversal — the epics already carry the amendment ("Amended 2026-10-08 by Story 5.2") and DESIGN.md/EXPERIENCE.md describe both themes (blind).
  - `[false]` `reject` `MutationObserver` missing leaves `data-theme` unwritten — every Chromium renderer has it (edge).
  - `[false]` `reject` Welcome `getTheme` unguarded `sendSync` contradicts the spec's fallback claim — the fallback applies to a malformed reply; a throwing `sendSync` is the same broken-main case rejected above (edge).
  - `[false]` `reject` log/spec fields (`deferred: []`, empty change log) — nothing deferred, no loopback occurred (blind).
  - `[false]` `reject` `rail-resize-collapse.html` is in the change set — not part of this change: the file appeared in the working tree from another session while this run was going; it was excluded from the reviewed diff and from the commit (blind, intent-alignment).
  - Intent-alignment audit (descriptive): reads the intent as the whole story plus commit and tracking closure; `sprint-status.yaml` and the commit are the surfaces still to do at finalize, handled below. It notes the acceptance behaviour is exercised against fakes and the manual `npm run dev` check was not run by the reviewers; the implementer's real-Electron CDP check is recorded under Auto Run Result.

## Design Notes

The preload, not a renderer module, writes `data-theme`: it runs before the page's scripts and shares the DOM, so no frame is painted wrong and the renderer holds no theme state. When `<html>` does not yet exist at preload time a `MutationObserver` on `document` applies the attribute the moment it appears. Main sets `nativeTheme.themeSource` to the choice, so `shouldUseDarkColors` is the one resolution of *System* and native menus, choosers and scrollbars agree; `prefers-color-scheme` is therefore read nowhere in this codebase. A choice is broadcast even when the resolved theme did not change, because the menu's check and the Welcome's line follow the choice, not the resolution.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no warnings
- `npm test` -- expected: all pass
- `npm run build` -- expected: three preload bundles and three page entries emitted

**Manual checks (if no CLI):**
- `npm run dev`: *View ▸ Theme ▸ Light* repaints the Welcome and any open window at once; the Welcome's line does the same and the menu's check follows; relaunch keeps the choice.

## Auto Run Result

Status: done

**Summary.** The harness has a light theme and a stored choice. `design/tokens.css` gains a third block, `:root[data-theme="light"]`, with one twin for each of the 62 dark colour tokens and `color-scheme: light`; the dark blocks are byte-identical. Main owns the choice (`system` default, `light`, `dark`) in `<userData>/theme.json`, maps it onto `nativeTheme.themeSource` so native chrome follows, and pushes the applied theme to every window; each window's preload writes `data-theme` on `<html>` before the first frame and again on every change. *View ▸ Theme* (three radio items, no accelerator) is in every window kind's menu, and the Welcome's bottom edge carries `theme · system · light · dark`.

**Files changed.**
- `src/renderer/design/tokens.css`, `design/page.css` -- the light block; comments brought in line.
- `src/shared/channels.ts`, `src/shared/theme.ts`, `src/preload/{index,doc,welcome}.ts`, `welcome-api.d.ts` -- three channels (26 → 29), types, `followTheme`, the Welcome's three methods (4 → 7); shell 17 and document window 5 unchanged.
- `src/main/theme-bridge.ts`, `fold/theme-choice.ts`, `sources/persistence/theme-file.ts`, `windows/native-theme.ts`, `windows/app-menu.ts`, `index.ts` -- store, resolve, broadcast, menu, startup.
- `src/renderer/ui/welcome/theme-line.tsx`, `welcome-app.tsx`, `welcome.css` -- the Welcome's line.
- Tests: new unit, jsdom and audit tests (including `theme-audit.dom.test.tsx` and `src/shared/theme.dom.test.ts`); `tokens.test.ts` dark-only assertions replaced with the true ones plus twin coverage and WCAG pairs; contract tests updated for the new counts and the one sanctioned `ipcMain.on`.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- story 5.2 marked done.

**Review.** 19 findings: medium 1, low 11, false 7. Patches applied: 4 (the observer path test, the Welcome line's initial read and resync, the tab stop reset, the `start()` guard). Deferred: 0. Rejected: 15, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high patched; one medium patched).

**Verification.** `npm run typecheck`, `npm run lint`, `npm test` (187 files, 4430 tests, plus 55 watcher tests) and `npm run build` pass after the patches. The implementer also drove the built app in real Electron over CDP: a stored `light` painted on first frame, `chooseTheme('dark')` repainted and wrote `theme.json`, clicking the `light` word flipped it back, and an invalid word was ignored.

**Residual risks.** A live macOS appearance flip and the menu with a real mouse were not exercised (covered by unit tests of the `nativeTheme.updated` path and of the menu template). `rail-resize-collapse.html`, a mockup from another session, is in the working tree and deliberately not in this commit.
