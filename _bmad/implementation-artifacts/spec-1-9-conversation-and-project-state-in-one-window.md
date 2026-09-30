---
title: 'Conversation and project state in one window'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_commit: '9b4da4669236bfef427b42acedb4d2f88009d49f'
baseline_revision: '9b4da4669236bfef427b42acedb4d2f88009d49f'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      The shell unmounts when the install snapshot goes blocked (for example a config edit leaves the roster empty) and remounts on recovery, resetting the selected view.
    evidence: |-
      `app.tsx` renders `<Shell>` only under `roomState` `open`; `view` lives in `Shell`'s own state, so an open, blocked, open round trip returns to 1:1 Conversation. Nothing stateful lives in the shell yet, so nothing is lost today, but EXPERIENCE.md says re-resolution never touches a live session; once Epic 2 puts sessions in the views, the view state (and the views) must be lifted above the gate or the shell kept mounted while blocked.
    location: >-
      src/renderer/ui/app.tsx, src/renderer/ui/shell/shell.tsx
    severity: low

---

<intent-contract>

## Intent

**Problem:** The window has no shell. When the room opens it is a run of unstyled scaffolding paragraphs (Stories 1.5–1.7), with no topbar, no view switch, no chat column, no rail and no responsive behaviour — nothing to mount the conversation, the tiles or the rail rows into, and no place a user can see the project's state beside the work.

**Approach:** Build the shell furniture the open room lives in: a 42px topbar (brand mark, `│` breadcrumb, project path, install chip, branch chip, a two-button view switch), two views behind that switch (1:1 Conversation: chat column left, 348px rail right split into an empty Team half above and Outputs half below; Party Mode: an empty view), the two responsive breakpoints, and the polite live region mounted once. The existing preview scaffolding keeps mounting, inside the chat column. Every value comes from `tokens.css`.

## Boundaries & Constraints

**Always:**
- **Exactly two top-level views, one switch, no third** (FR11). The switch is a `role="group"` of exactly two native `<button>`s — `1:1 Conversation`, `Party Mode` — each carrying `aria-pressed`; exactly one is `"true"`. `1:1 Conversation` is pressed on open. The view not pressed is kept mounted and `hidden`, never removed. **No Help control renders** — no element, no placeholder, no hidden tab stop; the topbar's only tab stops are the two switch buttons (`EXPERIENCE.md:480`).
- **Topbar** (FR13, UX-DR28): a `<header>` `var(--topbar)` tall on `--chrome`, a `--rule-width` `--line` bottom border, `--space-xxl` gap; left to right — brand (a pure-CSS mark: a bordered square with an `::after` accent square inset, at `--opacity-mark`, plus the words `BMad Harness` in `--fs-name` weight `--weight-strong` `--text-strong`; **no version string**, nothing supplies one), the literal `│` separator, the project path (mono, `--fs-body-ui`, `--dim`, single line, ellipsis on overflow), the install chip, the branch chip, a spacer, the view switch. Mono for path and chips, sans for brand and switch labels (the register split).
- **Install chip** reads `bmad · <n> agent(s)` from `snapshot.agents.length` (`1 agent`, `5 agents`), lower case, mono, no dot, no terminal punctuation. Nothing else is claimed about the install: no version, no skill count, no liveness.
- **Branch chip** reads the checked-out branch (`main`) or, detached, `detached · <first 7 hex>`, and **renders nothing at all** when there is no answer (not a repository, unreadable, unrecognised). It is a fact about the window's project, read by main: a fourth bridge method `getBranch(): Promise<string | null>` on channel `project:branch`, answered from a new read-only source `src/main/sources/project/branch.ts` that reads `<project>/.git/HEAD` — following one `gitdir: <path>` hop when `.git` is a file (a worktree) — and spawns nothing. Accepted only when the file is exactly `ref: refs/heads/<name>` with `<name>` matching `^[^\s\x00-\x1f]{1,200}$`, or a bare 40-hex object id; anything else (including a `gitdir:` that points nowhere, a second hop, an oversized or non-UTF-8 file) is `null`. The name is project *content*: rendered as React text, never as markup, never a path. The renderer asks on mount and again on every window `focus`, so the chip does not go stale across a checkout in another terminal.
- **1:1 layout** (FR12): the view is a row. Chat column `flex: 1 1 auto; min-width: 0` on `--bg`; rail `flex: 0 0 var(--rail)` on `--panel`, `--rule-width` `--line` `border-left`, a column of two halves each `flex: 1 1` half-basis (a named token), the second with a `--line` top border. Each half has a head `var(--rail-head)` tall on `--panel-2` with a `--line-soft` bottom rule and a label in `--fs-label` uppercase `--track-caps` `--weight-strong` `--dim` — `Team` and `Outputs` — over an empty scrolling body. **Empty means empty**: no empty-state sentence, no count, no skeleton, no spinner, no `5 agents · install` meta — those are Stories 1.10 and 1.11's. The chat column holds a scrolling thread constrained to `--thread-max`; the existing preview scaffolding (`PREVIEW_*`, `RunNoteFeed`, portraits, initials) moves *into that thread* unchanged in content.
- **Party Mode view** is an empty region in this story: it renders no content, no sentence and no side panel element (UX-DR8: no slots reserved for deferred sections). The `≤1180px` rule that hides `.party-side` is written now against the class Epic 4 will mount.
- **Responsive, two breakpoints only** (NFR27, UX-DR37): full size — `body { overflow: hidden }`, `.app` is one viewport tall, one project per window. `max-width: 1180px` — `.party-side { display: none }`. `max-width: 1000px` — `body` overflow auto, `.app` `height: auto` with a viewport-tall minimum, both views stack to a column, the chat column `min-height` is a `62vh` token, the rail is `flex: 0 0 auto; width: auto`, its `border-left` becomes a `border-top`, each half `min-height` a `230px` token, and the topbar wraps (`flex-wrap: wrap; height: auto`) with the breadcrumb row on its own full-width line (`order` after the switch, `width: 100%`). No third `@media` width condition exists anywhere under `src/renderer/`, and no mobile rule.
- **View switch treatment** (UX-DR28): `--fs-control`, `--track-control`, the base radius `--r`, a `--rule-width` `--line` border on `--panel-2`, `overflow: hidden`, buttons transparent with `--dim` text and a `--line-soft` divider; `[aria-pressed="true"]` → a raised-ground token (`#242b34`, promoted), `--text-strong`, `box-shadow: inset 0 -2px 0 var(--accent)`; hover raises text to `--text`. Operable from the keyboard as native buttons, and it draws the shared focus ring on `:focus-visible` only — the stylesheet adds no focus rule and never the word `outline`.
- **Scrollbars** (UX-DR28): custom 10px, thumb `background-clip: content-box` behind a 3px transparent border, radius `--radius-scrollbar`, transparent track, a lighter thumb on hover — global in `design/page.css`.
- **Literals are promoted, never restated.** Every dimension, colour, radius and font stack this story needs that is not already a token (the brand mark's border and side, the chip height, the separator colour, the raised ground, the scrollbar thumb colours and inset, the half-basis, the stacked `62vh` and `230px`, the visually-hidden 1px pair, the switch and chip paddings, the viewport-tall value) becomes a role-named token in `tokens.css`'s second `:root`, with a comment naming the mockup line it was read from (`harness-mockup.html`, the `.topbar`…`.rail-head` and `@media` blocks). The verbatim first block and the `[':root', ':root']` shape of `tokens.css` are untouched. **Breakpoints are the one exception**: `@media` conditions cannot read `var()`, so `tests/literal-guard.ts` blanks the *condition* of an `@media` rule — and only that — before scanning, and a new test pins that exactly two width conditions, `max-width: 1180px` and `max-width: 1000px`, exist under `src/renderer/` and nowhere else.
- **One live region, mounted** (NFR22, resolving Story 1.4's deferral): `App` builds one `Announcer` and mounts `<LiveRegion>` once, in every state that renders anything (blocked and open), inside a `.visually-hidden` wrapper defined in `src/renderer/ui/a11y/live-region.css` — absolutely positioned, `1px` square, `-1px` margin, `overflow: hidden`, `clip: rect(0 0 0 0)`, `white-space: nowrap`, all through tokens — so the region stays in the accessibility tree and off the page. Polite announcements, once each (`EXPERIENCE.md:512`): every `preflight` line's `message`, every `errors` line's `message`, and the install failure's `message`. Never `detail`. A pure function `newAnnouncements(previous, lines)` returns the messages whose `code|message|detail` key was not in `previous` plus the next key set (so a line that clears and returns announces again); the effect that feeds `announcer.announce(message, performance.now())` is thin.
- **Layering holds**: the branch source is `src/main/sources/project/`; the handler lives in a new `src/main/project-bridge.ts` (injectable `readBranch`, `projectPathFor`), registered from `src/main/index.ts`; `src/shared/` gains types only if any are needed; nothing under `src/renderer/` reaches main; the preload adds exactly one method and one channel literal, held equal to main's by `tests/bridge-contract.test.ts`.

**Never:**
- Never a third view, a Help control, a command palette, a launcher, a legend footer (prototype furniture; does not ship), a version string, a tooltip that is the only carrier of a fact, or any next-step / recommending copy.
- Never a persona tile, portrait-bearing tile, rail row, chat header, composer, skill button, document card or sysline — Stories 1.10, 1.11 and Epics 2–3. The rail halves are heads over empty bodies.
- Never a spinner, skeleton, entrance animation or new `@keyframes`; never a `z-index` (`--z-` still names exactly two tokens); never `aria-live` outside `live-region.tsx`; never `Arrow*` outside `a11y/`; never `style={{ }}`; never the focus-stroke word in `shell.css`.
- Never a new dependency: no `jsdom`/`happy-dom`. Component behaviour is asserted through `renderToStaticMarkup`, pure functions and stylesheet/source text, as Stories 1.5–1.8 did; adding a DOM environment is a change to the NFR11 pinned set and is not made here (recorded in Design Notes).
- Never a `git` subprocess, never reading anything under `.git/` except `HEAD` (and the one `gitdir:` target's `HEAD`), never writing.
- Never rendering the shell for a blocked room: Story 1.8's blocked screen (path + named lines) is unchanged, apart from mounting the live region.
- Never a watcher for the branch; re-asking on window `focus` is the whole freshness mechanism.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | `roomState` `open` | `<header>` topbar + 1:1 view visible; `1:1 Conversation` `aria-pressed="true"`, `Party Mode` `"false"`; party view `hidden`; two rail halves `Team`, `Outputs`, both bodies empty; preview scaffolding inside the chat thread | — |
| Switch to Party | press `Party Mode` (click, `Enter` or `Space`) | `Party Mode` pressed, `1:1 Conversation` not; 1:1 view `hidden` and still mounted; party view visible and empty | — |
| Switch back | press `1:1 Conversation` | prior state restored; nothing lost | — |
| Blocked / pending | `roomState` `blocked` / `pending` | no topbar, no views; `blocked` shows path + named lines; live region present in `blocked`, nothing rendered in `pending` | — |
| Install chip | 5 agents / 1 agent | `bmad · 5 agents` / `bmad · 1 agent` | — |
| Branch on a ref | `.git/HEAD` = `ref: refs/heads/feat/payouts-prd` | chip `feat/payouts-prd` | — |
| Branch detached | `.git/HEAD` = 40 hex | chip `detached · <first 7>` | — |
| Branch in a worktree | `.git` is a file `gitdir: /x/.git/worktrees/w`, that `HEAD` = `ref: refs/heads/w` | chip `w` | — |
| Branch absent | no `.git`, unreadable, empty, oversized, `ref: refs/tags/x`, name with a space/newline/control byte, `gitdir:` pointing at a file with no `HEAD` | `getBranch()` → `null`; no chip element | Never throws to the renderer; no path in any reply |
| Branch after checkout | user checks out another branch elsewhere, focuses the window | chip re-reads and updates | — |
| Width 1180 → 1000 | window ≤1180 | `.party-side` `display: none` | — |
| Width ≤1000 | window ≤1000 | body scrolls; views a column; chat `min-height` 62vh; rail below, top border, halves min 230px; topbar wraps, crumbs on their own row | — |
| Announce | blocked with two preflight lines | each `message` announced once, in order, polite, throttled by `Announcer`; `detail` never spoken | A repeated snapshot with the same lines announces nothing |

</intent-contract>

## Code Map

New `src/renderer/ui/shell/` (`shell.tsx`, `topbar.tsx`, `view-switch.tsx`, `view.ts`, `shell.css`, `use-branch.ts`), `src/renderer/ui/a11y/live-region.css`, `src/main/sources/project/branch.ts`, `src/main/project-bridge.ts`. Edits: `tokens.css`, `page.css`, `app.tsx`, `install-state.ts`, `live-region.tsx` (wrapper only), `preload/{index.ts,harness-api.d.ts}`, `main/index.ts`, `tests/literal-guard.ts`, and the suites named below. No new dependency.

**Contract read from where it was verified.** `epics.md:798-829` (the story), FR11–FR14, FR17 `:44-50`, UX-DR28 `:260`, UX-DR37 `:272`, NFR27 `:201`. `EXPERIENCE.md:51` (two views, Help reserved-not-rendered), `:63` (topbar contents), `:126`/`:157` (switch), `:480` (only the switch is a topbar tab stop), `:512` (preflight/resolver errors announced politely, once), `:531` (branch `feat/payouts-prd` shown as a fact about the project). `DESIGN.md:452` (topbar 42px `chrome`, 1px `line`, 14px gap), `:484` (≤1000 behaviour), `:495` (inset rule under the pressed button), `:500` (brand mark at `.75`), `:686` (shell furniture). **Mockup** (`_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html`): `.app` `:42`, `.topbar` `:45-49`, `.brand`/`.mark` `:50-54`, `.crumbs` `:55-57`, `.chip` `:58-63`, `.segmented` `:64-71`, `.view` `:83-84`, `#view-solo`/`.col-chat`/`.rail`/`.rail-half`/`.rail-head` `:86-101`, scrollbars `:37-40`, `@media` `:388-402`, topbar markup `:412-430`. The mockup's chip text `BMad v6 · 29 skills · 5 agents` and `0.4.0-dev` are prototype figures with no source in the harness; this story ships only `bmad · <n> agents` and omits the version.

**The code this lands in.**
- `src/renderer/ui/app.tsx:87-193` — `App`. `open` becomes `<Shell …>` around the existing preview JSX (lift that JSX into a local `Preview` component in the same file so `tests/persona.test.ts:793-829`'s source assertions on `PREVIEW_*`, `<Initials`, `<ErrorLine`, `portrait(` and the `roomState(`/`<Preflight` gate stay true). `blocked` and `open` mount the live region; `pending`/no-bridge stay `null`/the bridge line. The Story 1.8 gate comment is updated, not deleted.
- `src/renderer/ui/install/install-state.ts:88-101` — `roomState`; add `newAnnouncements` beside it (pure, no DOM).
- `src/renderer/ui/a11y/live-region.tsx:17-63` + `announcer.ts:1-80` — `LiveRegion({ announcer })` and `Announcer.announce(message, at)`; reuse as is. The component's own doc comment says "Nothing mounts it yet — the shell is Story 1.9"; update that sentence.
- `src/renderer/design/page.css:15-20` — body ground only (header comment says the shell is Story 1.9's); gains `overflow: hidden`, box-sizing/reset the shell needs, and the scrollbar rules; keep the file free of component selectors.
- `src/renderer/design/tokens.css:167-189` — layout constants (`--rail`, `--topbar`, `--rail-head`, `--thread-max`, `--party-side` already exist); new role tokens go in the second `:root`, after them.
- `src/preload/index.ts:1-40`, `harness-api.d.ts` — add `PROJECT_BRANCH_CHANNEL = 'project:branch'` and `getBranch: () => ipcRenderer.invoke(PROJECT_BRANCH_CHANNEL) as Promise<string | null>`.
- `src/main/index.ts:1-60` — `PROJECT_PATH_CHANNEL` handler is the pattern; call `registerProjectBridge()` beside `registerInstallBridge()`. The three startup suites mock `electron`; a lazy handler spawns and reads nothing at startup.
- `src/main/windows/main-window.ts` — `projectPathForWebContents(id)`; the project root for the handler.
- Guards that must stay green: `tests/tokens.test.ts` (verbatim block, `[':root', ':root']`, exactly one `@media` in `tokens.css`, `--z-` count, literal guard over every non-token stylesheet, no inline style), `tests/accessibility.test.ts` (`aria-live` once, no `Arrow*` outside `a11y/`, the focus word only in `focus.css`, roles not `alert`), `tests/layering.test.ts`, `tests/install-contract.test.ts`, `tests/bridge-contract.test.ts:82-90` and `tests/preflight-contract.test.ts` (both pin **three** bridge methods — updated to four, with the added one named).

## Tasks & Acceptance

**Execution:**
- `src/renderer/design/tokens.css` -- add the role tokens the shell needs to the second `:root` (brand mark side and border colour, separator colour, chip height and paddings, switch paddings, the raised pressed ground, scrollbar size/inset/thumb colours, rail half basis, `62vh` and `230px` stacked minimums, viewport-tall `.app` value, visually-hidden pair), each with a comment naming its mockup line -- NFR23: no literal outside this file
- `tests/literal-guard.ts`, `tests/tokens.test.ts` -- the guard blanks an `@media` rule's condition (only) before scanning; add probes proving a dimension in a *declaration inside* a media block is still caught, and a test that exactly the two `max-width` conditions exist under `src/renderer/` -- breakpoints cannot read `var()`
- `src/renderer/design/page.css` -- `body { overflow: hidden; margin: 0 }` ground kept, plus the global scrollbar rules and whatever reset the shell needs, all via `var()`; update the header comment -- the page ground is shared by every surface
- `src/renderer/ui/shell/view.ts` -- `VIEWS` (`conversation` / `party`, with their labels) and `type ViewId`; nothing else -- one place names the two views and their count
- `src/renderer/ui/shell/view-switch.tsx` -- `<ViewSwitch view onChange />`: `role="group"` with an `aria-label`, two `<button type="button">`s from `VIEWS`, `aria-pressed` from `view`; no roving tabindex, no arrow handling -- native buttons; the simplest thing that is keyboard-operable
- `src/renderer/ui/shell/topbar.tsx` -- `<Topbar projectPath agentCount branch view onView />`: brand, `│`, path, install chip, branch chip (only when `branch !== null`), spacer, `<ViewSwitch>`; no Help; no focusable element other than the switch's buttons
- `src/renderer/ui/shell/use-branch.ts` -- `useBranch()`: asks `window.harness.getBranch()` on mount and on `window` `focus`, drops answers after unmount, and treats a missing method or a rejection as `null`; pure helper for the "latest answer wins" ordering if one is needed, tested without a DOM
- `src/renderer/ui/shell/shell.tsx` + `shell.css` -- `<Shell projectPath snapshot>{children}</Shell>`: `.app` column → `<Topbar>` → two view sections (`hidden` on the inactive one); 1:1 = chat column (`.thread` at `--thread-max`, `children` inside) + rail (`Team`, `Outputs` halves, empty bodies); party = empty; owns `view` state, default `conversation`; every rule from *Boundaries*, including `.party-side` at ≤1180 and the ≤1000 restack; no focus rule, no `z-index`, no `@keyframes`, no `outline`
- `src/renderer/ui/a11y/live-region.css`, `live-region.tsx` -- the `.visually-hidden` wrapper rule, applied by the component (not by its callers, so no surface can mount the region visibly); the region element and its attributes are otherwise untouched -- resolves the Story 1.4 deferral
- `src/renderer/ui/install/install-state.ts` -- `newAnnouncements(previous: ReadonlySet<string>, lines: HarnessError[]): { messages: string[]; keys: Set<string> }` -- pure; testable under `environment: 'node'`
- `src/renderer/ui/app.tsx` -- own one `Announcer` (`useState(() => new Announcer())`), feed it in an effect keyed on `snapshot`/`installFailure`, mount `<LiveRegion>` in `blocked` and `open`; `open` renders `<Shell projectPath snapshot>` around the lifted `Preview`; `blocked` unchanged otherwise; update the gate comment
- `src/main/sources/project/branch.ts` -- `readBranch(projectRoot, { read? })`: the HEAD parse and the single `gitdir:` hop exactly as in *Boundaries*; a size cap (read at most 4 KiB); returns `string | null`, never rejects, never includes a path; `read` injectable so tests need no filesystem
- `src/main/project-bridge.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- `PROJECT_BRANCH_CHANNEL`, `registerProjectBridge({ readBranch?, projectPathFor? })` answering `null` for an unknown window; preload `getBranch`; `HarnessApi.getBranch(): Promise<string | null>`
- `src/main/sources/project/branch.test.ts` -- every branch row of the matrix over a scripted `read` and over a real temp directory (a plain repo layout, a worktree layout, no `.git`), plus the closed-shape checks: `ref: refs/heads/` with a space/newline/control byte, a 201-char name, a 5 KiB file, CRLF endings tolerated, a trailing newline tolerated
- `src/main/project-bridge.test.ts`, `tests/bridge-contract.test.ts`, `tests/preflight-contract.test.ts` -- the handler answers its own window and `null` for an unknown one; preload and main hold the same channel literal; the bridge exposes exactly `['getProjectPath', 'getInstall', 'onInstallChanged', 'getBranch']` and still no `invoke` passthrough; the source-text guard "HarnessApi still has three methods" becomes four
- `src/renderer/ui/shell/shell.test.tsx` -- `renderToStaticMarkup`: `<Topbar>` has the `<header>`, brand words, `│`, the path, `bmad · 5 agents` / `bmad · 1 agent`, a branch chip only when given one, exactly two `<button`, exactly one `aria-pressed="true"` (each `view`), no `Help`, no `<a `, no `tabindex`, no `style=`, no `role` other than `group`; `<Shell>` contains both view sections with the inactive one `hidden`, the `Team` and `Outputs` heads, the empty rail bodies (no `<button`, no text besides the two labels), the `children` inside the thread, and no `aria-live`
- `tests/shell-contract.test.ts` -- reads `shell.css`, `page.css`, `live-region.css`, `tokens.css` as text: the `[aria-pressed="true"]` rule names `--text-strong` and the `inset` accent rule; the `@media` blocks hold exactly the two conditions and the listed declarations; `body` has `overflow: hidden` at full size; `.party-side` is hidden at 1180; no `z-index`, `outline`, `@keyframes`, `animation`, `transition` in `shell.css`; every token `shell.css` names exists in `tokens.css`; `app.tsx` mounts `<Shell`, `<LiveRegion` and calls `roomState(`, and the preview rows sit only under `open`
- `src/renderer/ui/install/install-state.test.ts` -- `newAnnouncements`: first call announces all in order; identical second call announces none; a line that clears then returns announces again; `detail` never appears; empty input; duplicates within one call announce once
- `src/renderer/ui/shell/use-branch.test.ts` (only if a pure helper exists) -- ordering and the missing-method fallback
- `tests/persona.test.ts`, `tests/accessibility.test.ts`, `tests/tokens.test.ts` -- keep every existing assertion true; extend the accessibility sweep so `live-region.css` and `shell.css` are covered by the existing whole-tree focus-word and literal sweeps (they are, by construction — assert it rather than assume)

**Acceptance Criteria:**
- Given the open room, when the shell renders, then exactly two top-level views exist behind one switch of exactly two buttons, no third view and no Help element exists anywhere, and the topbar's only tab stops are those two buttons
- Given the 1:1 view, when it renders, then the chat column is left and the rail is `var(--rail)` wide on the right, split into a Team half above and an Outputs half below, each `flex: 1 1` the half-basis token and each with a `var(--rail-head)` head labelled `Team` / `Outputs` over an empty body
- Given the topbar, when it renders, then it is `var(--topbar)` tall on `--chrome` with a `--line` bottom rule and carries, in order, the brand mark, `│`, the project path, the install chip, the branch chip (when there is a branch) and the view switch
- Given the chat column, when it renders, then its thread is constrained to `var(--thread-max)` and holds the existing preview scaffolding unchanged in content
- Given the view switch, when a button is pressed, then only that button carries `[aria-pressed="true"]`, its rule spends the raised ground, `--text-strong` and `inset 0 -2px 0 var(--accent)`, it is operable by `Enter`/`Space`, and it draws the shared focus ring on `:focus-visible` with no focus rule in `shell.css`
- Given a window at or below 1180px, then `.party-side` is `display: none`; and given a window at or below 1000px, then the body scrolls, the views stack to a column, the chat column has the `62vh` token as `min-height`, the rail sits below with `border-top` replacing `border-left` and each half at the `230px` token as `min-height`, and the topbar wraps with the breadcrumb row on its own line
- Given full size, then `body` has `overflow: hidden`, and one project is open per window
- Given a project whose `.git/HEAD` names a branch, a detached commit, a worktree, or nothing readable, when the window opens or regains focus, then `getBranch()` answers the branch, `detached · <7 hex>`, the worktree's branch, or `null`, the chip renders only for a non-null answer, no reply contains a path, and no subprocess is spawned
- Given any preflight line, resolver error or install failure, when it first appears, then its `message` (never its `detail`) is queued once on the single polite live region, which is visually hidden yet present in the tree; given the source tree, then `aria-live` appears only in `live-region.tsx` and is `polite`
- Given the source tree, when swept, then no `.css` under `src/renderer/` other than `tokens.css` holds a colour, dimension, radius or font-stack literal (media conditions excepted and pinned to the two breakpoints), `--z-` names exactly two tokens, `outline` appears only in `design/focus.css`, `Arrow*` only under `a11y/`, and `package.json` gains no dependency
- Given the three startup suites, when `npm test` runs, then none reads `.git/HEAD`, spawns a process or watches a file, and they pass unchanged
- Given `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, when each runs on a clean checkout, then all four exit zero and the suite is larger than the 665 tests Story 1.8 left behind

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass
- verdicts: 38 findings — high 0, medium 5, low 33, false 0, maybe-false 0 (several rows below group findings that share a root cause)
- findings:
  - `[medium]` `[patch]` Blind Hunter + implementer report: `.view-switch` `overflow: hidden` clips the shared focus ring on the switch buttons — the AC requires the ring to draw; fixed by dropping the clip and giving the end buttons the group's outer radii (contract test added). The literal `overflow: hidden` in the contract's switch treatment is superseded by the focus-ring acceptance criterion.
  - `[low]` `[patch]` Blind Hunter + Edge Case Hunter: a 200-char branch in a nowrap non-shrinking chip pushes the view switch off-screen — `--chip-max` token, max-width and ellipsis added.
  - `[low]` `[patch]` Blind Hunter + Edge Case Hunter: branch validation lets DEL, C1, zero-width and bidi characters through — regex extended, a test row per class.
  - `[medium]` `[patch]` Verification Gap + Blind Hunter: view-switch click wiring and Shell switching never exercised — handler test added and `Shell` takes an optional `initialView` so the party state renders in node.
  - `[medium]` `[patch]` Verification Gap: `.view[hidden]` rule untested — assertion added.
  - `[medium]` `[patch]` Verification Gap: `announceable` composition untested — moved beside `newAnnouncements`, exported, tested.
  - `[medium]` `[patch]` Verification Gap: default `project:branch` wiring checked only for an unknown window — known-window case over a real temp `.git/HEAD` added.
  - `[low]` `[patch]` Edge Case Hunter + Blind Hunter: the "exactly two breakpoints" pin counts only width conditions — every `@media` is now counted, with height/orientation probes.
  - `[medium]` `[patch]` Orchestrator: Electron's default 800x600 window is below the 1000px breakpoint, so the window would always open stacked — 1280x800 constants added to `createProjectWindow`, test pinned.
  - `[low]` `[defer]` Edge Case Hunter (twice): the shell unmounts on an open, blocked, open round trip and the view resets — recorded in `deferred`; matters once Epic 2 has sessions.
  - `[low]` `[reject]` Blind Hunter: the blocked screen cannot scroll under `body { overflow: hidden }` — a handful of short lines cannot exceed a 1280x800 window, and below 1000px the body scrolls again.
  - `[low]` `[reject]` Blind Hunter: chips lack accessible names — `bmad · 5 agents` names itself, and a label on a generic span is ignored by readers; the fix needs a role or hidden text, more than a direct correction.
  - `[low]` `[reject]` Blind Hunter: a long path is cut at the end — the contract specifies an ellipsis; the full text stays in the DOM.
  - `[low]` `[reject]` Blind Hunter + Edge Case Hunter: `readHead` on a FIFO, an unbounded `gitdir:` target, trailing spaces after `gitdir:` — the project is the user's own, git writes none of these, and only a `ref:`/hex shape can ever leave.
  - `[low]` `[reject]` Blind Hunter + Edge Case Hunter: no parent walk for subdirectory projects, SHA-256 heads — a missing chip is a missing fact, never a wrong one (Design Notes).
  - `[low]` `[reject]` Blind Hunter: branch freshness only on window focus — the contract makes focus the whole mechanism.
  - `[low]` `[reject]` Blind Hunter + Edge Case Hunter: announcement key includes `detail`, so a changed detail repeats the same sentence — the contract defines the key that way; a changed detail is a changed line.
  - `[low]` `[reject]` Blind Hunter + Edge Case Hunter (claim): the live region is missing on the no-bridge and path-failure screens — the contract says blocked and open; policy covers preflight, resolver and install failures.
  - `[low]` `[reject]` Edge Case Hunter: the region mounts in the same commit that enqueues — the region's first drain runs before the parent's enqueue and the message is spoken on the next tick, so it is created first.
  - `[low]` `[reject]` Blind Hunter: the "no path in any reply" test is vacuous — the reply is `null`, which is the whole claim.
  - `[low]` `[reject]` Blind Hunter: shell-contract test brittleness, new tokens named for values, thin landmarks and heading levels, orphaned `│` when the crumbs row wraps, dead `snapshot === null` branch — style or mockup-faithful choices with no user-visible harm.
  - `[low]` `[reject]` Edge Case Hunter: synchronous `getBranch` throw, 4 KiB wording — not reachable through `ipcRenderer.invoke`; behaviour is correct.
  - `[low]` `[reject]` Verification Gap: the 4096 vs 4097 byte boundary is not observed — behaviour is correct.
  - `[low]` `[reject]` Intent Alignment (descriptive): R1/R2 read as real conversation entries and rail content; the diff implements R3, furniture with empty slots. Those belong to Stories 1.10, 1.11 and Epics 2–3; visual behaviour is left to the manual checks, since no DOM environment exists.

## Design Notes

**Why the branch is read from `HEAD`, not from `git`.** A `git` subprocess on a Mac without the developer tools opens the operating system's install prompt from the `/usr/bin/git` shim — a modal the harness would cause by drawing a chip. Reading one small file in the project, which the harness already has a right to see, answers the same question with no process, no `PATH` dependence and no prompt. The price is that packed refs, reftable repositories or a future HEAD format read as `null` and the chip simply does not appear — a missing fact, never a wrong one. The value is project content and is validated to a closed shape before it leaves main, so no path or markup rides the reply.

**Why a fourth bridge method rather than a field on the install snapshot.** The snapshot is a function of BMad's install; a branch changes on a different clock (a checkout) and is not install state. A second method keeps the two clocks apart and the install projection's `revision` honest. Re-asking on window `focus` is the freshness rule: the moment a user could see a stale chip is the moment they return to the window, and that is the moment it is re-read. No watcher, because a watcher on `.git/` is a new source of churn for a chip.

**Why the preview scaffolding moves into the thread instead of being deleted.** Its `PREVIEW_*` text, `<Initials`, `portrait(` calls and `RunNoteFeed` mount are pinned by existing tests as the only place those components are on screen. The tiles (Story 1.10) and the document card (Epic 3) replace them where they belong; until then the thread is the neutral place they can be judged, and moving rather than restructuring them keeps that judgement's inputs identical.

**Why breakpoints are literal, and only they.** `@media` conditions cannot read custom properties, so a token cannot carry `1180px` or `1000px`. The literal guard therefore skips the condition of a media rule and nothing inside it, and a test pins the population at two, so "two breakpoints only" (NFR27) is enforced as a count and not merely trusted.

**Why the live region is mounted here and hidden by a wrapper.** Stories 1.4 and 1.8 both handed this story the decision. The region must stay in the accessibility tree, so `display: none` is wrong; the standard off-screen clip needs `1px`/`-1px`, which are tokens. The wrapper is applied by `LiveRegion` itself so a later caller cannot mount it visibly. Announcing on blocked *and* open screens is what makes "preflight failures announced politely, once" true on the screen where they matter most.

**Left for later, not forgotten.** A DOM test environment (the Story 1.2 deferral) is still not added: it means a new dependency beside a pinned set installed as a set, and every 1.9 behaviour that matters — the pressed state, the two breakpoints, the empty halves, the chip rules — is asserted through markup, pure functions and stylesheet text. The first story whose behaviour cannot be reached that way (the roving tile list, Story 1.10) should make that call with a concrete need in hand. Live tile/rail content, the party side panel element, a Help surface, and the persona chat header are later stories'.

## Verification

**Commands:**
- `npm test` -- expected: all green, more than 665 tests; the shell, branch, bridge and announcement suites are included
- `npm run lint && npm run typecheck && npm run build` -- expected: all exit zero; `typecheck:web` proves the shell resolves against `src/shared/install.ts` and the four-method `HarnessApi`
- `grep -rnE 'outline|z-index|@keyframes|animation|transition' src/renderer/ui/shell/shell.css src/renderer/ui/a11y/live-region.css` -- expected: no output outside comments
- `grep -rnE "child_process|spawn|execFile|runCommand" src/main/sources/project src/main/project-bridge.ts` -- expected: no output
- `grep -rnE '<button|<input|role=|aria-live|style=' src/renderer/ui/shell` -- expected: only the view switch's two buttons and its one `role="group"`
- `git status --short` after `npm run dev -- .` has opened -- expected: unchanged

**Manual checks (what no test covers):**
- `npm run dev -- .` on this project: the topbar reads `BMad Harness │ <path> [bmad · 5 agents] [main]` with the switch at the right; the rail is two empty halves headed `Team` and `Outputs`; nothing reads as a persona tile; pressing `Party Mode` swaps to an empty view and `1:1 Conversation` restores it, by mouse and by `Tab` then `Enter`/`Space`, with the accent focus ring visible on keyboard focus only.
- Drag the window narrower: at 1000px it stacks (chat above, rail below, topbar wrapping with the path on its own row) and scrolls; at full size it does not scroll.
- `git checkout -b x` in a terminal, then click back into the window: the chip reads `x`.
- `npm run dev -- <a directory with no _bmad/>`: unchanged from Story 1.8 — path and the four-part line, no topbar.

## Auto Run Result

Status: done

**What was implemented.** The window now has a shell. The open room shows a 42px topbar (brand mark, `│`, project path, `bmad · N agents` chip, branch chip, a two-button view switch), the 1:1 view (chat column with the existing preview scaffolding in a 940px thread, a 348px rail of empty Team and Outputs halves) and an empty Party view. Both breakpoints are in, the global scrollbars are in, and the polite live region is mounted once behind a visually-hidden wrapper, announcing preflight, resolver and install-failure messages once each. The branch comes from a new read-only `getBranch()` bridge method that parses `.git/HEAD` (with one worktree hop) and spawns nothing; the renderer re-asks on window focus. The window opens at 1280x800 so the desktop layout is what appears.

**Files changed.**
- `src/renderer/ui/shell/*` (new) — `Shell`, `Topbar`, `ViewSwitch`, `view.ts`, `use-branch.ts`, `shell.css`.
- `src/renderer/ui/app.tsx`, `install/install-state.ts` — shell mount, live region, `newAnnouncements`, `announceable`.
- `src/renderer/ui/a11y/live-region.{tsx,css}` — self-applied `.visually-hidden` wrapper.
- `src/renderer/design/{tokens,page}.css` — role tokens, body overflow, scrollbars.
- `src/main/sources/project/branch.ts`, `src/main/project-bridge.ts`, `src/main/index.ts`, `src/preload/*` — the `project:branch` channel and `getBranch`.
- `src/main/windows/main-window.ts` — 1280x800 window.
- `tests/literal-guard.ts` and the token, accessibility, bridge, preflight and new shell-contract suites, plus new tests beside each new module.

**Review findings.** 38 findings across four layers — 0 high, 5 medium, 33 low. Patched (9 entries): focus ring clipped by the switch's `overflow: hidden`, unbounded branch chip, looser-than-claimed branch characters, click wiring and Shell switching untested, `.view[hidden]` untested, `announceable` untested, default `project:branch` wiring untested, media-query pin counting only width, and the 800x600 default window (found by the orchestrator). Deferred: the shell unmounting across an open, blocked, open round trip (view resets; matters once Epic 2 has sessions). Rejected with reasons: see the triage log.

**Follow-up review recommended: true.** Five medium entries were patched on a first pass. The unverified risk: nothing has run the real Electron window — the focus ring after the clip fix, the stacked layout at ≤1000px, the topbar wrap and the `focus` re-read of the branch were seen only in a browser pane with a stubbed bridge and by CSS-text assertions. Patched counts by verdict: high 0, medium 5, low 4.

**Verification.** `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` exit zero; **780 tests across 32 files** (665 before this story). The spec's greps are clean (no `outline`/`z-index`/`@keyframes`/motion in the new stylesheets, no subprocess in the branch source or bridge). The I/O matrix audit found every row covered by a passing test; the resize, focus-ring and checkout-refresh checks are manual.

**Residual risks.** The manual checks in Verification were not run against a live `npm run dev`. The contract's `overflow: hidden` on the switch was superseded by the focus-ring criterion. No DOM test environment exists, so switch behaviour is asserted through element trees and static markup. The Story 1.2 DOM-environment deferral is carried forward, not closed.
