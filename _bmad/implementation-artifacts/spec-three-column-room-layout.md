---
title: 'The room in three columns: a Team sidebar, the thread, an Outputs panel'
type: 'feature'
created: '2026-10-09'
status: 'ready-for-dev'
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
| Old or bad stored rail width (348, 560, text) | file read | default 300 | silent |
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

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors
- `npm test` -- expected: all pass

**Manual checks (if no CLI):**
- `npm run dev`: both splitters drag, keys move them, widths survive a relaunch, the strip counts follow a persona going to work and back.
