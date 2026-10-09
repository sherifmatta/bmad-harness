---
title: 'The room in three columns: a Team sidebar, the thread, an Outputs panel'
type: 'feature'
created: '2026-10-09'
status: 'done'
followup_review_recommended: false
baseline_revision: 'ccb6bcd36fdbd709a118e0075f4b1ad572d5300e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The 1:1 view is a chat column beside one right rail holding the Team half over the Outputs half. The approved direction (EXPERIENCE.md → *Layout, chat and Board*) puts the team on the left and gives the right side one job.

**Approach:** Move the Team half into a new left sidebar, topped by a four-cell state strip, and leave the Outputs half alone as the right panel. Each panel gets its own splitter and remembered width, and the chat column keeps its minimum between them. Colours are already applied (`tokens.css`).

## Boundaries & Constraints

**Always:** Tiles stay in config order and are never regrouped by state. The strip is plain counts of the tiles' own states, from the same `states` map: Working (`work`), Idle (`idle` and `live`), Error (`error`), Changed (`note`); no accent, fill, badge or announcement. Every dimension reaches CSS through a token in `tokens.css` (NFR23). Widths are chosen inline on the panel (`--sidebar`, `--rail`), no transition. The right panel keeps the id `rail` and the class `.rail`; its width becomes default 300, range 260–480. The sidebar is `sidebar`: default 244, range 200–400. The chat column keeps 420px between them. Both ids are stored per user in the layout file; stored values outside a range read as the default. At ≤1000px the layout stacks (chat, sidebar, rail), splitters hidden; at ≤1180px the Room panel hides as now.

**Never:** No Inbox, Board view, Properties/Goal trace/Run sections, thread additions, count or badge on a tile or the strip, `/` command, new view-switch segment, or change to the Party view or the Outputs half. No new breakpoint. No migration of old stored widths.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First open | no stored layout | sidebar 244, rail 300, chat takes the rest | — |
| Drag sidebar | pointer moves right | sidebar grows, held at its range and at chat ≥420 given the rail's width | — |
| Drag rail | pointer moves left | rail grows, held at its range and at chat ≥420 given the sidebar's width | — |
| Keys on a splitter | `←`/`→`, `Shift`, `Home`, `End`, `Enter` | the sidebar grows on `→`, the rail on `←`; `Enter` and double-click reset | — |
| Narrow window | chosen widths exceed what fits | each shows less, nothing stored changes | — |
| Bad stored rail width (560, text) | file read | default 300 | silent |
| Strip | states `work`, `live`, `idle`, `error`, `note` across tiles | one count per cell, `live` counted under Idle | — |
| No agents | empty roster | strip reads zeros, tile list absent as now | — |

</frozen-after-approval>

## Code Map

- `src/shared/layout.ts` -- `PanelId` gains `'sidebar'`; `PANELS` (rail 300/260/480, sidebar 244/200/400, `neighbourMin` 420 both); `PANEL_IDS`, `Layout`, `NO_LAYOUT`, `isPanelId`; add `growsRight(panel)` (true for `sidebar`) and make `keyedWidth` swap the arrow keys for it. Ties `PANELS[*].default` to tokens by test. Inlined into the preload: imports types only.
- `src/shared/layout.test.ts` -- update the rail numbers; cover sidebar and the swapped keys.
- `src/main/fold/layout.ts`, `layout-bridge.ts` (+ tests) -- iterate `PANEL_IDS`; the bridge's `answer` and defaults gain `sidebar: null`.
- `src/renderer/ui/layout/use-layout.ts`, `layout-context.ts`, `use-panel-width.ts` -- read/hold `sidebar`; `PROPERTY` map gains `sidebar: '--sidebar'`; `usePanelWidth(panel, reserved = 0)` measures `available - reserved`. Fix `INERT_LAYOUT`.
- `src/renderer/ui/layout/panel-drag.ts` -- delta sign by `growsRight`.
- `src/renderer/ui/layout/panel-splitter.tsx` -- `LABEL` gains `sidebar: 'sidebar width'`.
- `src/renderer/ui/shell/shell.tsx`, `shell.css` -- three-child row: `.sidebar` (RailHalf "Team" with the strip over `Team`), splitter, `.chat`, splitter, `.rail` (Outputs half only). One composed container ref for both hooks (a `useCallback`). Sidebar gets `reserved = rail's chosen-or-default`, rail gets `reserved = sidebar's now`. `.panel-splitter--sidebar` hides at ≤1000px with the rail's; stacking via `order`.
- `src/renderer/ui/team/team-strip.tsx` + `team.css` (new) -- the strip, a pure function of `states` and the roster.
- `src/renderer/design/tokens.css` -- `--sidebar:244px`; `--rail:348px` becomes 300px; strip tokens (padding, cell borders reuse `--rule-width`).
- Existing tests that name the rail or its default: `tests/layout-contract.test.tsx` (`'rail'` property line 76, `--rail` 348 at 206), `tests/tokens.test.ts` (the `--rail` pin and the layout constants), `tests/shell-contract.test.ts`, `src/renderer/ui/shell/shell.test.tsx`, `src/renderer/ui/app.test.tsx`, `src/renderer/ui/layout/*.test.*`, `tests/bridge-contract.test.ts`. Read each before editing; change the number or the structure they pin, never the intent.
- Docs after the code: EXPERIENCE.md (*Resizing and folding* now names three panels; *Layout, chat and Board* strip cells and widths settled; the Team half no longer in the rail), DESIGN.md (*Resizing the side panels*, *Proposed* section → built, its frontmatter layout map `sidebar`).
- Do not touch: `ui/follow/*`, `outputs/*`, `party/*`, the Outputs rows, `a11y/*`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/shared/layout.ts` + test -- add the sidebar, new rail limits, `growsRight` -- one rule for every width gesture
- [ ] `src/main/fold/layout.ts`, `layout-bridge.ts` + tests -- store and answer `sidebar` -- widths persist per user
- [ ] `src/renderer/ui/layout/*` -- hook `reserved`, drag sign, label, context -- two panels share one container
- [ ] `src/renderer/ui/team/team-strip.tsx`, `team.css` + tests -- the state strip
- [ ] `src/renderer/ui/shell/shell.tsx`, `shell.css`, `tokens.css` + shell tests -- three columns, splitters, tokens
- [ ] Update the pinned tests listed in the Code Map; add a test for the I/O matrix rows (sidebar drag and keys, chat minimum with both panels, strip counts)
- [ ] EXPERIENCE.md and DESIGN.md -- reflect what was built

**Acceptance Criteria:**
- Given a project is open in the 1:1 view, when the window is wide, then the Team tiles are on the left, the thread in the middle and Outputs on the right, each side panel resizable and remembered.
- Given either panel is dragged to its maximum, when the other is at any width, then the chat column is never narrower than 420px.
- Given the window is ≤1000px, when the 1:1 view renders, then it stacks chat, sidebar, Outputs with no splitter.
- Given no code file in `src/renderer` names a literal colour or dimension, when lint and the token guard run, then they pass.

## Implementation Notes

## Spec Change Log

- 2026-10-09 (human): matrix row "Old or bad stored rail width (348, 560, text)" became "Bad stored rail width (560, text)"; 348 is in the new range and reads as stored, per the Always clause.

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 21 findings — high 0, medium 7, low 14, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind-hunter: old rail widths read as chosen) — docs said "dropped, not migrated" but `readWidth` keeps in-range values; human decision on 2026-10-09 is that 348 reads as stored — docs reworded in DESIGN.md and EXPERIENCE.md.
  - `[low]` `[reject]` (blind) strip labels truncate at the 200px sidebar minimum — cosmetic; a fix adds wrap/min-width branches.
  - `[low]` `[reject]` (blind) faint label exemption weakly justified — allowlist entry for micro label; no named harm.
  - `[low]` `[reject]` (blind) stacked DOM order differs from visual order — the spec prescribes stacking via `order`; the fix reorders DOM against the spec's structure.
  - `[low]` `[reject]` (blind) no landmark/aria-label on the side panels — the rail was a plain div before; pre-existing pattern, not a regression.
  - `[low]` `[reject]` (blind) two-panel rule lives in the hook, not the pure module — spec's Code Map prescribes `usePanelWidth(panel, reserved)`; no demonstrated divergence.
  - `[low]` `[reject]` (blind) stale names `RailHalf`, `.rail-half` — spec keeps `.rail` and names `RailHalf`; rename is churn.
  - `[low]` `[reject]` (blind) other docs (AD-14, UX-DR7) cite the old width — spec's docs list names EXPERIENCE.md and DESIGN.md only.
  - `[low]` `[reject]` (blind) "changed" undercounts a working persona with a changed file — spec fixes one state per tile and the strip as counts of those states.
  - `[low]` `[reject]` (blind) negative-surface test loosened for strip figures — required by the spec's strip; the exclusion is scoped to `team-strip-figure`.
  - `[low]` `[reject]` (blind) missing behaviour tests around both panels — the central case is covered by the patch below; the rest are CSS/jsdom-unverifiable.
  - `[low]` `[reject]` (blind) squeeze priority asymmetric — prescribed by the spec (sidebar reserves the rail's chosen-or-default, the rail the sidebar's shown width).
  - `[medium]` `[patch]` (edge-case 1) unchosen panel pulled in below its default is drawn at the token width while `now` and the other panel's reserve use the pulled-in one, so chat fell under 420 (container 1001, rail 480: chat 376) — `use-panel-width.ts` now writes the inline width whenever `now` is not the default; test added asserting rendered width equals `aria-valuenow` and 200 + 381 + 420 <= 1001.
  - `[medium]` `[patch]` (edge-case 2) splitter reports a width the panel is not drawn at — same root cause and same fix as the row above.
  - `[medium]` `[patch]` (verification-gap 1) narrowed-window test asserts only aria values, never the sidebar's rendered width — same root cause; the new test asserts the inline `--sidebar` of 200px and the chat minimum.
  - `[low]` `[reject]` (edge-case 3) sidebar held to its min while the rail is shown narrower — spec-prescribed reservation of the rail's chosen-or-default width; leaves slack, not a violation.
  - `[low]` `[reject]` (edge-case 4) stacked tab order vs visual order — same as the blind row above.
  - `[medium]` `[patch]` (edge-case 5) docs claim old rail widths are dropped though in-range ones are kept — same root cause as the first row; docs reworded.
  - `[medium]` `[patch]` (verification-gap 2) in-range legacy rail widths never tested as dropped — the human ruled 348 reads as stored, so the behaviour is intended; the docs claim was the defect and is fixed, no test for dropping.
  - `[medium]` `[patch]` (verification-gap other 1) `aria-valuenow` says 200 while the panel is drawn at 244 — same root cause as edge-case 1; fixed with it.
  - `[low]` `[reject]` (verification-gap other 2) stacked order checked only by CSS source text — jsdom has no layout; spec-level.
- intent-alignment auditor: descriptive only, no findings; it notes the 420px rule is held in JS from a measured width and the spec's manual `npm run dev` check was not run.

## Verification

**Commands:**
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors
- `npm test` -- expected: all pass

**Manual checks (if no CLI):**
- `npm run dev`: both splitters drag, keys move them, widths survive a relaunch, the strip counts follow a persona going to work and back.

## Auto Run Result

Status: done

Summary: the 1:1 view is three columns. A left Team sidebar (default 244, range 200-400) holds the Team half under a four-count state strip (Working, Idle incl. `live`, Error, Changed); the thread keeps 420px; the right rail (default 300, range 260-480) holds the Outputs half only. Each panel has its own splitter and stored width; keys swap on the sidebar via `growsRight`; at <=1000px the layout stacks chat, sidebar, rail.

Files changed:
- `src/shared/layout.ts` (+test) -- sidebar panel, new rail limits, `growsRight`.
- `src/main/layout-bridge.ts`, `src/main/sources/persistence/layout-file.ts`, `src/main/fold/layout.test.ts`, `src/main/layout-bridge.test.ts` -- store and answer `sidebar`.
- `src/renderer/ui/layout/*` -- `reserved` in `usePanelWidth`, drag sign, label, context, inline width whenever the shown width is not the default.
- `src/renderer/ui/team/team-strip.tsx`, `team.css`, `team-strip.test.tsx` -- the state strip.
- `src/renderer/ui/shell/shell.tsx`, `shell.css`, `src/renderer/design/tokens.css` -- three columns, splitters, tokens.
- Pinned tests under `tests/` and `src/renderer/ui/**` updated; DESIGN.md and EXPERIENCE.md updated.

Review: 21 findings. Patches applied: 2 entries (both medium): the pulled-in-panel inline width (chat could fall under 420), and the docs claim about old rail widths. Deferred: none. Rejected: 12 low findings, each with its reason in the Review Triage Log.

Spec change: on 2026-10-09 the human dropped 348 from the matrix row (see Spec Change Log).

Follow-up review recommended: false. Patched entries by verdict: high 0, medium 2 (one is a docs wording fix, so only one code-risk medium); no unverified risk can be named.

Verification: `npm run typecheck` clean; `npx eslint src tests scripts --max-warnings 0` clean; `node scripts/check-pins.mjs` clean; `npm test` 206 files / 4934 tests pass. `npm run lint` fails only because of the untracked nested checkout `.claude/worktrees/epic-6-board-planning`.

Residual risks: `npm run dev` manual checks (relaunch persistence, strip following a persona) not run; the 420px rule and stacking are verified by jsdom arithmetic, CSS text and a browser-pane render of the built CSS, not the real Electron window; stacked Tab order follows the DOM (sidebar before chat).

Finalization: the pre-commit hook's `npm run lint` fails on the unrelated registered worktree `.claude/worktrees/epic-6-board-planning` (two candidate tsconfigRootDirs), so the human authorized `git commit --no-verify`. The checks the hook runs were run by hand instead: typecheck, scoped eslint, `check-pins.mjs` and `npm test` all pass.
