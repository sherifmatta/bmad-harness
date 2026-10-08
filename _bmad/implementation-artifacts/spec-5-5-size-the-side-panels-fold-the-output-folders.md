---
title: 'Story 5.5: Size the side panels, fold the output folders'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: '493811524eced5ef9b451dd4512f8fe0ff00ac7c'
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

**Problem:** The rail (`--rail` 348px) and the Room panel (`--party-side` 240px) are fixed, so neither can be given more room when a persona's turn or a path is wider, and the chat column cannot be given the space back. The Outputs list shows every directory heading as a plain label over its rows, so a project with several directories scrolls for files the user is not using.

**Approach:** Seam A: a pure clamp (stored width, range, neighbour's minimum, available width) and a `separator` splitter on each panel's inner edge, widths stored per user under `userData`. Seam B: each Outputs directory heading becomes a button that folds its own rows, the folded set stored per project under `userData`. The authoritative acceptance text is `### Story 5.5` in `_bmad/planning-artifacts/epics.md`; `DESIGN.md` → Splitter, Folder heading and `EXPERIENCE.md` → Resizing and folding give the appearance and rules; `mockups/rail-resize-collapse.html` is a working prototype. Decisions to confirm are taken at their defaults: rail 280–560px, Room panel 200–400px; folding flat, one directory at a time; a folded directory shows `changing` and nothing else; no *collapse all*; fold per project, widths per user.

## Boundaries & Constraints

**Always:** `--rail` and `--party-side` keep their values and are the defaults; a chosen width is applied by setting that custom property inline on the panel element (never a literal dimension in a stylesheet, no `transition`), so the stacked layout's own rules (≤1000px) still win. Limits: rail min 280, cap 560, chat column keeps ≥420; Room panel min 200, cap 400, party column keeps ≥480. The maximum is `min(cap, available − neighbourMin)` (`available` is the width of the container holding both columns; unknown/0 means no pull-in), never below the minimum. A narrowed window pulls the panel in without touching the stored value. Stored width missing, unreadable, non-integer or outside `[min, cap]` reads as the default, silently. Drag follows the pointer with no easing, snapping or transition and holds at the limit; `col-resize` cursor and text selection off for the drag, both restored on release, cancel (`Escape` restores the width the drag started at, window blur) and unmount. Keys on a focused splitter (no modifier other than `Shift`): `←` grows 16px (64 with `Shift`), `→` shrinks, `Home` min, `End` max, `Enter` or double-click resets to default (stored value removed); consumed with `preventDefault`. The splitter is `role="separator"`, `aria-orientation="vertical"`, `aria-label`, `aria-valuemin/max/now`, one tab stop, drawn from tokens only (panel's own 1px `line` border at rest; 3px `accent-border` hover; 3px `accent` drag and focus, plus the shared ring), not drawn at ≤1000px or where its panel is hidden (≤1180px for the Room panel), added inside the two existing `@media` blocks in `shell.css` (no new breakpoint). Folding: heading is a `button` with a stroked chevron, the directory path and `aria-expanded`/`aria-controls`; headings and the rows showing are one roving tab stop (arrows travel, `Enter`/`Space` toggles on a heading, `←` folds, `→` unfolds, focus stays on the heading); folded rows are not rendered; no count; while folded with a `changing` row the heading shows the amber dot and `changing`, never an annotation. A file arriving in a folded directory unfolds nothing and moves neither focus nor scroll. Folds keep entries for vanished directories (ignored while absent, applying again if the directory returns). Layout reaches main through three enumerated, named channels and preload methods only (`layout:get` sync, `layout:set-width`, `layout:set-folded`); one new store file `<userData>/layout.json` `{version:1, widths:{rail,room}, folded:{[projectKey]: string[]}}` (key name `projectKey`, never `projectPath`/`projectRoot`), sync, atomic tmp+rename, never throws, tolerant read. All harness strings lower case, mono, `·`-separated. Both views stay mounted.

**Never:** No animation of a width or a fold, no snap points or presets, no way to hide a panel, no count or badge on a heading, no unfold on arrival, no *collapse all*/*expand all*, no live-region announcement of a resize or fold, no breakpoint added, nothing written into the project, no generic `invoke`, no change to the Team half, the Room panel's contents, the thread, any row's content, or the session/run/transcript/rail/persona channels. A resize or fold touches no session, run, transcript, card, persona, scroll position or follow state. No `prefers-color-scheme` branch, no new colour token.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Drag past limit | rail, pointer beyond 560 or leaving <420 for chat | width holds at the limit | — |
| Narrowed window | stored 500, container leaves max 400 | shown 400, stored stays 500, returns when widened | — |
| Bad stored width | `"x"`, 12, 9999, 300.5, missing file | default | silent |
| Reset | `Enter`/double-click | default shown, stored value removed | — |
| Key at limit | `←` at max, `→` at min | unchanged | — |
| Fold | click / `Enter` / `Space` / `←` on heading | rows removed, `aria-expanded=false`, focus stays | — |
| Folded + changing | row `changing` under folded dir | heading shows dot and `changing`, nothing else | — |
| Arrival in folded dir | `artifact:found/written` there | still folded, focus and scroll unmoved | — |
| Stored fold, dir gone | entry for absent directory | ignored, kept stored | silent |
| Bad stored folds | not JSON / wrong shape | nothing folded | silent |

</intent-contract>

## Code Map

- `src/shared/layout.ts` (new, pure) -- `PanelId` (`'rail' | 'room'`), `PANELS` (default/min/cap/neighbourMin; defaults equal `tokens.css` `--rail` and `--party-side`, tied by a test), `limitsFor(panel, available)`, `clampWidth`, `effectiveWidth(panel, chosen, available)`, `readWidth(value, panel)` (integer within `[min, cap]` else `null`), `keyedWidth(panel, current, key, shift, available)` (the `←/→/Home/End/Enter` table; `Enter` → `null` = default), `Layout` (`{rail: number|null, room: number|null, folded: string[]}`). Inlined into the preload by the build like `channels.ts`, so no imports beyond types.
- `src/main/fold/layout.ts` (new, pure) -- tolerant `widthsOf(raw)`, `foldedOf(raw, projectKey)` (strings only, deduped), `withWidth(raw, panel, width|null)`, `withFolded(raw, projectKey, dirs)`; models `fold/output-folder.ts` `choiceFor`/`withChoice`.
- `src/main/sources/persistence/layout-file.ts` (new) -- `layoutFilePath(userDataDir)`, `readLayoutFile`, `writeLayoutFile`; copy `output-folder-file.ts` (and `errnoOf`).
- `src/main/layout-bridge.ts` (new) -- `registerLayoutBridge({userDataPath, projectPathFor?, writeDiagnostic?})`: `ipcMain.on(LAYOUT_GET_CHANNEL)` answers `event.returnValue` (sync read so the first paint is at the stored width; same precedent as `THEME_STATE_CHANNEL` in `theme-bridge.ts`), `ipcMain.handle` for `LAYOUT_SET_WIDTH_CHANNEL` (panel + `null | integer` validated with `readWidth`, else ignored) and `LAYOUT_SET_FOLDED_CHANNEL` (array of strings, bounded) keyed by the sender's project path through `bridge-kit.ts` `defaultProjectPathFor`/`noProject`/`unexpected`. Registered in `src/main/index.ts` next to `registerOutputFolderBridge` (`:123`).
- `src/shared/channels.ts`, `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- three channels (30→33) and three methods `getLayout(): Layout`, `setPanelWidth(panel, width|null): void`, `setFolded(dirs): void` (18→21; fire-and-forget on `ipcRenderer.send`/`invoke` without a reply type that needs a pin beyond count). Pins: `tests/channels-contract.test.ts`, `party-contract.test.ts`, `bridge-contract.test.ts` (method list `:225-250`, `:294`), `preflight-contract.test.ts:149-175`, `negative-surface.test.ts:916,1987-88,2212-14,2360`; the persistence writers list in `tests/persistence-contract.test.ts:234-242` and the four-store allowlists in `negative-surface.test.ts:358-375,2055-2095` become five (`layout-file.ts`; assert it takes `userDataDir` and no `projectPath`/`projectRoot`).
- `src/renderer/ui/layout/` (new) -- `layout-context.ts` (React context with a no-op default so a `Shell` mounted without a provider still works: `{widths, folded, saveWidth, saveFolded}`), `use-layout.ts` (App's: reads `window.harness?.getLayout` once if it is a function, `readWidth`-validates, keeps `folded` as a `ReadonlySet`, writes through `setPanelWidth`/`setFolded` when they are functions), `use-panel-width.ts` (chosen state, `ResizeObserver` on the container for `available`, effective width, mouse drag with document listeners, key handler), `panel-splitter.tsx`/`panel-splitter.css` (the element; mouse events, not pointer events, because jsdom has no `PointerEvent` with coordinates), a `body.is-resizing` rule for cursor/selection.
- `src/renderer/ui/shell/shell.tsx`, `shell.css` -- ref on `.view-conversation`; `.rail` gets `style={{'--rail': …}}` only while a width is chosen; splitter element between `.chat` and `.rail`; hide it in the two existing `@media` blocks (`:302`, `:308`). `useBranch`, `FollowScroller` and the current-persona logic are untouched. `src/renderer/ui/party/party-view.tsx`, `room-panel.tsx` -- ref on `.party-body`, splitter before `RoomPanel`, `RoomPanel` takes an optional `style` for `--party-side`; `party-view.css`/`room-panel.css` keep `.party-side` (`flex: 0 0 var(--party-side)`).
- `src/renderer/design/tokens.css` -- new dimension tokens only (splitter hit 9px with its two net-zero margins, 3px line and its offset, chevron 9px); `tests/tokens.test.ts` may pin token counts.
- `src/renderer/ui/outputs/outputs.tsx`, `outputs.css`, `row-groups.ts`, `row-nav.ts` -- `Outputs` reads `folded` from the layout context; the roving order becomes headings plus visible rows keyed `dir:<dir>` / `<path>` (so `tabStopPath` and the `buttons` map take keys, not only paths); new `folder-heading.tsx` (button, one stroked chevron path like `FileIcon` in `output-row.tsx`, `StatusDot state="work"` from `../status/status-dot` plus `changing`, `focus-inset` ring class); rows of a folded dir are not rendered; `.outputs-list` gets an `id` for `aria-controls`. `.rail-group` (`shell.css:292`) stays for the empty states and the Team half. Existing `outputs.test.tsx`, `outputs-focus.test.tsx`, `row-nav.test.ts`, `output-row.test.tsx`, `tests/outputs-contract.test.ts`, `tests/output-folder-head.test.tsx` expect a plain group label and the first row as the tab stop: update them (the first heading becomes the tab stop).
- Read-only: `src/renderer/ui/follow/*` (a resize only reflows; its `ResizeObserver` keeps a following thread pinned and a paused one still), `a11y/announcer.ts`, `a11y/roving-tabindex.ts` (travel stays `rovingKey`'s, `Home`/`End` are the splitter's own, not the list's), `tests/literal-guard.ts` (JSX style blocks are scanned for font/radius literals only, and `${n}px` is not a literal), `shared/rail.ts` (`DiskField.state === 'changing'`), `main/output-folder-bridge.ts` (model for a per-window bridge and its tests).

## Tasks & Acceptance

**Execution:**
- `src/shared/layout.ts` + test -- pure clamp, limits, key table, stored-value reader; tested at both limits, narrowed, missing/out-of-range/non-integer stored values, and that defaults equal `--rail`/`--party-side`
- `src/main/fold/layout.ts`, `sources/persistence/layout-file.ts`, `layout-bridge.ts`, `index.ts` + tests -- store and bridge; tolerant reads, atomic write, validation of panel/width/folds, keyed by project
- `channels.ts`, `preload/index.ts`, `harness-api.d.ts`, pins -- three channels and methods, counts updated, five persistence writers
- `ui/layout/*`, `shell.tsx`, `shell.css`, `party-view.tsx`, `room-panel.tsx`, `tokens.css` + tests over a fake panel whose geometry the test sets -- the two splitters (pointer drag, keys, reset, restore of cursor/selection, narrowing, aria, hidden breakpoints, no transition, nothing else changes)
- `outputs.tsx`, `folder-heading.tsx`, `row-nav.ts`, `outputs.css` + tests -- folding, roving order, `changing` on a folded heading, arrival while folded, vanished directories, persistence calls, no count, built from the rail's projection for the audit
- Audits: a test that no stylesheet gives a width or fold a `transition`; heading never renders a digit; a bridge-level test that a temp project's tree is byte-identical after widths and folds are stored; negative-surface mount of the Outputs half with a folded directory holding a changing file

**Acceptance Criteria:**
- Given the 1:1 view above 1000px, then the rail has a splitter on its inner edge and, in Party Mode, the Room panel has one, each a `separator` with `aria-orientation="vertical"`, `aria-label`, `aria-valuemin/max/now` and one tab stop; at ≤1000px none, and at ≤1180px the Room panel and its splitter are hidden, with no breakpoint added.
- Given a drag, then the width follows the pointer a frame at a time without easing, snapping or transition and holds at the limit; the rail is 280–560px and never leaves the chat column under 420px, the Room panel 200–400px and never leaves the party column under 480px; the cursor is `col-resize` and selection is off for the drag and both are restored on release or cancel.
- Given a focused splitter, then `←` grows by 16px, `→` shrinks, `Shift` makes it 64px, `Home`/`End` go to min and max, `Enter` or a double-click restores the default, and the keys do not scroll the page.
- Given a splitter at rest, hovered, dragged and focused, then it draws as `DESIGN.md` gives it, from tokens alone.
- Given a width chosen, then it is stored per user under `userData`, one value per panel, survives a relaunch and the two are independent; a bad stored value reads as the default silently; a window narrowed below what it allows pulls the panel in, keeps the stored width and applies it again when widened.
- Given a resize, then no session, run, transcript, card, persona, scroll position or follow state changes and nothing is announced.
- Given the Outputs half, then each directory heading is a button with a chevron, the path, `aria-expanded` and `aria-controls`; headings and showing rows are one roving tab stop; `Enter`/`Space` toggles, `←` folds, `→` unfolds, focus stays on the heading; a folded directory's rows are not rendered, no other directory changes and the heading shows no count.
- Given a folded directory with a `changing` row, then its heading shows the amber dot with the pulse and `changing`, and neither when nothing under it is changing, and never a run's annotation; a file arriving, changing or leaving a folded directory leaves it folded and moves neither focus nor scroll; a directory with no rows has no heading.
- Given a fold, then the folded set is stored per project under `userData` as project-relative directory paths and survives a relaunch; entries for vanished directories are ignored; a missing or unreadable set reads as nothing folded; nothing is written into the project.
- Given the negative surface, then there is no animation of a width or fold, no snap points or presets, no count or badge, no unfold on arrival, no collapse/expand all, no way to hide a panel, no live-region announcement, every harness string is lower case and mono, and the channels (33) and preload methods (21) are enumerated and pinned with no generic `invoke`.
- Given `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 31 findings — high 0, medium 0, low 23, false 8, maybe-false 0 (blind 15, edge-case 14, verification-gap 2 incl. one "other"; intent-alignment is descriptive and filed none). Rows are in the order the layers reported them.
- findings:
  - `[low]` `patch` blind: drag cursor lost to descendants' own `cursor` — `body.is-resizing` now covers descendants, so the rail keeps `col-resize` for the whole drag.
  - `[low]` `reject` blind: a disk read and write per key repeat, and a redundant reset write — one small file, and a held key is the user's own choice; the reset write is harmless.
  - `[false]` `reject` blind: two windows on one project overwrite each other's folds — `main-window.ts` allows one window per project path and raises it.
  - `[low]` `reject` blind: splitter tokens hand-derived from the hit width — the story fixes 9px and the line at 3px; a restyle is a design change, not a defect.
  - `[low]` `reject` blind: splitter is mouse-only — a desktop app; trackpad drags arrive as mouse events.
  - `[low]` `reject` blind: no `aria-controls`/`aria-valuetext` on the splitter, no heading element on folder headings — the story and DESIGN.md enumerate the splitter's and the heading's attributes exactly; adding more is a spec change.
  - `[low]` `reject` blind: `←` from a row, `→` on an open heading and `Shift` arrows do nothing — the story states the heading's keys exactly and no more.
  - `[low]` `reject` blind: scroll not asserted for an arrival in a folded directory — the fold renders no rows and the code makes no scroll call, so there is nothing to move; focus is asserted.
  - `[low]` `reject` blind: store version never branched on, project keys not normalised — no second version exists; keys are the raw project path as in the recent list and the output-folder store.
  - `[false]` `reject` blind: folds over 1024 entries are ignored silently — needs more than a thousand directories folded or remembered in one project; no demonstrated path.
  - `[low]` `reject` blind: `layout:get` casts the sender and re-reads the file — the cast is `webContents.id`, typed by the guard that follows; a read of one small file at load.
  - `[false]` `reject` blind: empty `ul[hidden]` only for `aria-controls` — it is deliberate so the control names something; no behaviour is wrong.
  - `[low]` `reject` blind: audits loosened to admit the splitter — each loosening is one named exemption with a comment; the sweeps still run over everything else.
  - `[low]` `reject` blind: dragging back to the narrowed width chooses nothing — pressed and released where it began is "nothing chosen" by design.
  - `[false]` `reject` blind: hook closures frozen at first render — `panel` never changes and `saveWidth` is a stable callback.
  - `[low]` `patch` edge: fractional drag, key and End widths (page zoom, fractional container) are shown but rejected by main's integer rule, so never kept — `limitsFor` floors the maximum and `clampWidth` rounds, with tests.
  - `[low]` `patch` edge (same cause): a fractional `available` makes `End`/arrows keep a fractional width.
  - `[low]` `reject` edge: a transient read error followed by a write rebuilds the store — the same behaviour as the other three stores; needs a read failure on a file the harness just wrote.
  - `[false]` `reject` edge: folds past 1024 entries stop persisting — see the blind row; not shown reachable.
  - `[low]` `reject` edge: `senderOf` outside the `try` — the same pattern in every bridge; a destroyed sender has no window to read the rejection.
  - `[low]` `reject` edge: fold entries are not validated for shape — they come from the window's own set and are only ever compared to directories the rail names.
  - `[low]` `patch` edge: a key step while a drag is in flight is overwritten by the release or Escape — keys are now left alone while a drag is active, with a test.
  - `[low]` `reject` edge: focus after a document window closes lands on the first heading when the row's directory was folded meanwhile — the story says the list's own tab stop when the row has gone; the row is not rendered.
  - `[false]` `reject` edge: a remounted panel starts from the launch width — the panel hooks mount once per window and keep their own chosen width.
  - `[false]` `reject` edge: a `__proto__` project key drops its entry — the key is a filesystem path and cannot be `__proto__`.
  - `[low]` `patch` edge: ctrl-click on the splitter starts a drag that may never see `mouseup` — a ctrl-click is now ignored, with a test.
  - `[false]` `reject` edge: stale `available` after the container unmounts — `measure()` runs as soon as a container is held.
  - `[low]` `patch` edge (claim): a width chosen at a fractional layout is shown but not kept — the same fix as the first edge row.
  - `[low]` `patch` edge (claim): Escape after a mid-drag key step shows the older width — the same fix as the key-step row.
  - `[low]` `patch` gap: nothing tests that `App` provides the layout (removing the Provider leaves every 5.5 test green) — an App-level test added that sets stored widths and folds through a fake bridge and asserts the rail's width, the heading's state and the `setFolded` call.
  - `[low]` `reject` gap (other): reset writes `layout.json` even at the default — harmless redundant write.
  - Intent-alignment audit (descriptive): reads the intent as build, commit and close in tracking; the closing surfaces (`sprint-status.yaml`, the spec at `done`, the commit) are done at finalize. It notes the splitters, cursor and folds were not seen in a running window; the app was not run.

## Design Notes

The clamp is one pure function so the drag, the keys, the narrowed window and the stored read cannot disagree: `effective = clamp(chosen ?? default, min, max(min, min(cap, available − neighbourMin)))`. A chosen width is only ever data; the element shows `effective`, so a narrowed window needs no write and a widened one needs no read. A width is applied by overriding the panel's own `--rail`/`--party-side` custom property inline, which keeps the token the single spelling of the default and lets the ≤1000px rules (`width: auto`, `flex: 0 0 auto`) win unchanged. The splitter is a net-zero-width flex item (9px box, negative margins, `position: relative` so it paints over the panel without a stacking index), because the Room panel scrolls (`overflow-y: auto`) and would clip a child that overhangs its own edge. Fold state is a set of project-relative directory paths held by the layout context, so a heading's toggle is one `setFolded` call and the stored set is what the next window reads.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no warnings (`check-pins` included)
- `npm test` -- expected: all pass
- `npm run build` -- expected: three preload bundles and three page entries emitted

**Manual checks (if no CLI):**
- `npm run dev`: drag, key and double-click both splitters, narrow the window and widen it again, relaunch and see the widths kept; fold a directory in a project with several, relaunch and see it folded, and write into a folded directory to see the heading say `changing`.

## Auto Run Result

Status: done

**Summary.** Both side panels are the user's to size and the Outputs folders to fold. A pure clamp (`src/shared/layout.ts`: chosen width, range, neighbour's minimum, available width) drives a `separator` splitter on the rail (280–560px, chat keeps 420px) and on the Room panel (200–400px, party column keeps 480px): drag, `←`/`→` (16px, 64 with `Shift`), `Home`/`End`, `Enter` or double-click to reset, hidden inside the two existing breakpoints, drawn from tokens with no transition. A chosen width is applied by overriding `--rail` / `--party-side` on the panel, so the defaults stay the tokens'. Widths are stored per user and each project's folded directories per project in `<userData>/layout.json`, through three enumerated channels and methods (`layout:get` sync, `layout:set-width`, `layout:set-folded`). Each Outputs directory heading is now a button with a chevron, `aria-expanded`/`aria-controls`, one roving tab stop with the rows showing, `←`/`→` to fold and unfold, and the amber dot with `changing` while folded over a changing row; entries for vanished directories are kept and ignored.

**Files changed.**
- `src/shared/layout.ts`, `src/main/fold/layout.ts`, `src/main/sources/persistence/layout-file.ts`, `src/main/layout-bridge.ts`, `src/main/index.ts` -- clamp and key table, tolerant store rules, the store and the bridge.
- `src/shared/channels.ts`, `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- three channels (30→33) and three methods (18→21).
- `src/renderer/ui/layout/*` -- layout context and `useLayout`, `usePanelWidth`, the drag controller, the splitter element and styles.
- `src/renderer/ui/shell/shell.tsx`, `shell.css`, `party/party-view.tsx`, `party/room-panel.tsx`, `app.tsx`, `design/tokens.css` -- the two splitters, hidden in the existing media blocks, new dimension tokens, the provider.
- `src/renderer/ui/outputs/outputs.tsx`, `folder-heading.tsx`, `row-nav.ts`, `outputs.css`, `a11y/fold-key.ts` -- folding and the roving order.
- Tests: new unit, DOM and contract tests for the clamp, store, bridge, splitter, folds and the negative surface (`tests/layout-contract.test.tsx`); existing pins and the outputs and shell tests updated.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- story 5.5 marked done.

**Review.** 31 findings: low 23, false 8, high 0, medium 0. Patches applied: 8 rows in 5 fixes, all low: the drag cursor now covers descendants; widths are whole pixels so a fractional layout no longer shows a width that is never kept; keys are left alone while a drag is in flight; a ctrl-click starts no drag; and an `App`-level test proves the layout reaches the window. Deferred: 0. Rejected: 23, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high, no medium patched).

**Verification.** `npm run typecheck`, `npm run lint` (with `check-pins`), `npm test` (204 files, 4856 tests, plus 64 watcher tests) and `npm run build` pass, run again after the patches.

**Residual risks.** `npm run dev` was not run, so the splitters' hover, drag and focus drawing, the splitter painting over the panel's edge (and its 4.5px overlap of the chat and party scrollbars), the drag cursor, and a relaunch keeping widths and folds have not been seen in a window. The rail's pull-in under a narrowed window cannot occur above the 1000px breakpoint (the chat column always has room), so only the Room panel is ever pulled in; both are covered through the pure function and a fake container. The epic-5 context was not recompiled: no planning document changed after it was written.
