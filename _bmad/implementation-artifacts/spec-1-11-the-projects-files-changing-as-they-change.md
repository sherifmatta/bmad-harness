---
title: "The project's files, changing as they change"
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_commit: '0ef42006d80e7c86381f1e48f832a32c8e57a2cc'
baseline_revision: '0ef42006d80e7c86381f1e48f832a32c8e57a2cc'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `rail:get` could wait forever if the artifact watcher's `ready` never fires after an error before the initial scan.
    evidence: |-
      `src/main/rail-bridge.ts` awaits `watcher.ready.then(() => projection.ready())` and `watchArtifacts`' `ready` resolves only on chokidar's own `ready` event, with no timeout or rejection path. A real chokidar run with an unreadable subdirectory emitted `error EACCES` and then `ready`, so the ordinary error path does not hang; unverified is whether `ready` still fires after an `EMFILE` or `ENOSPC` watcher error. What would settle it: force such an error before `ready` and observe the event. If it does not fire, the Outputs half stays blank with neither rows nor an `ErrorLine`.
    location: >-
      src/main/rail-bridge.ts
    severity: medium (unverified)
  - summary: >-
      `useRail`'s composition and the `App` to `Shell` wiring are pinned only by source-text regexes, because the suite has no DOM environment.
    evidence: |-
      `src/renderer/ui/outputs/rail-state.test.ts` tests `acceptRail` and `connectRail` in isolation and `tests/outputs-contract.test.ts` matches `useRail()` and the `<Shell ... rail={rail} ...>` JSX as text. Replacing `acceptRail` with a plain `setSnapshot(incoming)`, dropping `setFailure(null)`, or dropping the `bridgeAvailable` guard keeps every test green. The window could show regressed rows or a stale error. Closing it needs a DOM or hook-render harness, the Story 1.2/1.9 deferral carried forward.
    location: >-
      src/renderer/ui/outputs/use-rail.ts:22
    severity: medium
  - summary: >-
      `useNow`'s interval and its cleanup have no test.
    evidence: |-
      Every `Outputs` and `OutputRow` test injects a fixed `now`; the shell tests render `ConnectedOutputs` once through `renderToStaticMarkup`, where effects never run. Removing the `setInterval`, freezing `Date.now()` or dropping `clearInterval` leaves the suite green, and the ages would stick at `saved · just now` or a timer would leak. The spec lists the 30 s tick under manual checks.
    location: >-
      src/renderer/ui/outputs/use-now.ts:15
    severity: low
---

<intent-contract>

## Intent

**Problem:** The Outputs half of the rail is an empty body. A file a persona, an editor or a terminal `claude` writes under `_bmad/` is invisible in the window, so the user cannot see what the work produced without leaving it or trusting the harness's memory.

**Approach:** Watch `<project>/_bmad/` in main (atomic-rename aware, coalescing-tolerant), fold what the watcher sees into a read model of rows, push it over two new bridge methods, and draw one row per file in the Outputs half, grouped by directory. Each row carries a watcher-owned disk `state` and, separately, a stream-owned optional `annotation` fed only through a stubbed seam. Owner is derived from the artifact class or not shown. Pipeline position is never asked, stored or parsed.

## Boundaries & Constraints

**Always:**
- **Two fields, two owners, no merge** (FR49, AD-2). A `RailRow` (`src/shared/rail.ts`) is `{ path, owner?, annotation? } & DiskField`, where `DiskField` is `{ state: 'not-yet-written' | 'changing' } | { state: 'saved', savedAt: number }`. `state`/`savedAt` are written only by the fold's `observe`/`settle` (watcher side); `annotation` only by its `annotate` (stream side). No field, type or function merges them, and no `status` field exists. `RailAnnotation` is `{ text: string }` — the minimum the stub needs; Epic 3 extends it additively.
- **A row exists because the watcher saw the file** (FR48, FR50, AD-2). `annotate(path, …)` on a path with no row is a no-op returning the same table; `annotate(path, null)` clears the annotation and leaves the row; neither `annotate` nor any annotation value can change `path`, `state`, `savedAt` or `owner`, create a row, or remove one. A row reaches `saved` only through `settle` after watcher silence, never because an annotation arrived. The row reads as complete with no annotation (the slot renders nothing, not an empty box).
- **Disk state** (FR48/49). Observations are `artifact:found` (initial scan, before the watcher's `ready`), `artifact:written` (an `add` or `change` after `ready`) and `artifact:removed`, each `{ type, path, size, mtimeMs }` with `path` project-relative POSIX (`src/shared/rail.ts`, `noun:verb-past`). `found`: `size > 0` → `saved` with `savedAt = mtimeMs`, `size 0` → `not-yet-written`. `written`: `size 0` → `not-yet-written` (drops any `savedAt`); `size > 0` → `changing`, remembering the observation time and `mtimeMs`. `removed` deletes the row and its annotation. `settle(table, now, quietMs = SETTLE_MS)` turns every `changing` row whose last observation is `≥ quietMs` old into `saved` with `savedAt` = its last `mtimeMs`. `SETTLE_MS = 400` (the observed coalescing window, FR52). Fold functions are pure: no I/O, `now` injected.
- **No assumption of one event per entry** (FR52). Any number of `written` events on one path inside the quiet window is one `changing` period and one `saved`. The projection pushes only when the rows it would send differ from the last it sent, so a burst of three is at most two pushes (`changing`, then `saved`).
- **Watcher** (`src/main/sources/project/watch-artifacts.ts`, chokidar 4.0.3, the pinned dependency): watches `<root>/_bmad` only, `atomic: true`, `alwaysStat: true`, `ignoreInitial: false`, no `awaitWriteFinish` (it would delay the `changing` indication), unlimited depth. `ignored` is path-shaped: a basename `.DS_Store` or ending `.tmp` is never a row — `memlog.py` writes `<name>.tmp`, then `os.replace`s it over the target (`_bmad/scripts/memlog.py:122-129`), and without this the temp file would flash as a row. It stats through chokidar and **never opens a file**: no `node:fs` import, no content read. `ready` resolves when the initial scan is done; an `error` is passed to an `onError` callback (the bridge writes it to stderr), never thrown. A missing `_bmad/` at start is not an error: no rows, and rows appear if it is created later.
- **Owner** (FR51, AD-19). `ownerAgentIdFor(path)` in `src/main/fold/artifact-owner.ts` maps a case-insensitive **basename**, in any directory, from the install contract's observed classes (`_bmad/specs/spec-bmad-visual-harness/bmad-install-contract.md:81-83`) and observed menus (`:66-72`): `product-brief.md` → `bmad-agent-analyst`, `prd.md` → `bmad-agent-pm`, `architecture.md` → `bmad-agent-architect`, `design.md` and `experience.md` → `bmad-agent-ux-designer`, `sprint-status.yaml` → `bmad-agent-pm` (John's `IR` menu entry runs `bmad-sprint-planning`). Anything else → no owner. No writing session exists in this epic, so the session branch of FR51 is absent, not stubbed. The row carries `owner: { agentId }`; the renderer resolves the display name from `snapshot.agents` and renders **nothing** if that id is not in the roster. Never a guess, never a default.
- **Pipeline position is neither asked, stored nor parsed** (FR10). Position is "which artifacts are present", which the rail already is. `sprint-status.yaml` is one more row with a class-derived owner and its contents are never read: no YAML dependency, no `readFile`, and no rail module stores a position, stage or answer anywhere (no `localStorage`, `userData`, or file).
- **Bridge** (AD-3, AD-13): `rail:get` and `rail:changed` on the install bridge's pattern — `registerRailBridge(deps)` in `src/main/rail-bridge.ts`, a per-window service built on the first ask, reply envelope `{ ok: true, snapshot } | { ok: false, error: HarnessError }` (`rail/no-project`, `rail/unexpected`), `revision` increasing, dispose on the window's `destroyed`. Preload adds exactly `getRail(): Promise<RailSnapshot>` (rejects with the envelope) and `onRailChanged(listener): () => void` (listener gets the snapshot, never the event): six named methods, no passthrough. Channel literals are exported from both sides and tied by `tests/bridge-contract.test.ts`.
- **Rows render** (UX-DR18, DESIGN.md:607-609 and `components.rail-row` :218-224, mockup `.frow` :133-147, `renderFiles`/`fileIcon` :1089-1103): grouped by directory — heading is the project-relative directory with a trailing `/` (`_bmad/`, `_bmad/planning-artifacts/`) in `.rail-group` (the shell's existing rule), groups in code-unit path order, rows in code-unit name order within a group. **No recency, relevance, pin, badge, count or highlight.** A row is one line: the 12×14 two-path file icon (`aria-hidden`, `--opacity-mark`, stroke `--faint`, `--amber` while changing), the file name (mono `--fs-body-ui` `--text`, ellipsis), then a meta cluster right-aligned: the annotation if present (neutral tag treatment — mono `--fs-meta`, `--dim`, `--rule-width` `--line` border, `--radius-chip`, ground `--code-tag-bg`), the owner's name if resolved (mono `--fs-meta` `--faint`), then the state string (mono `--fs-label`): `not yet written`, `changing`, `saved · <age>`. `changing`: name → `--text-strong`, state text and icon stroke → `--amber`, and a `StatusDot state="work"` (the existing pulse and halo) before the text; the other two states have no dot and use `--dim`. Every dot has its text beside it. Row padding `--rail-row-padding`, gap `--space-md-plus` between icon, name and meta, `--rule-width` `--line-soft` bottom border.
- **Age** (`saved · 3d`, UX-DR30): `formatAge(savedAt, now)` → `just now` under 60 s, then `Nm` under 60 min, `Nh` under 24 h, else `Nd`; a `savedAt` ahead of `now` clamps to `just now`. `now` is a hook (`useNow`, one `setInterval` of 30 s, cleared on unmount) and is data: re-rendering a row's text is not announced and not animated.
- **Empty and pending.** No snapshot yet → the Outputs body is empty: no spinner, no sentence. A snapshot with no rows → exactly two lines: `no files under _bmad/ yet` and beneath it the watched path `<projectPath>/_bmad` (composed from the `projectPath` prop; wraps rather than truncates). No next step, no skill name, no persona, no button. A rail failure renders the envelope through the existing `ErrorLine`.
- **Rows are static in this story.** No `button`, `input`, `role`, `tabindex`, click handler, `cursor: pointer` or hover ground: click-to-open and the arrow/`Enter` keyboard reach are Story 1.12's (`epics.md:929-931`), and a focusable row with nothing to do is a dead control. The list is plain `ul`/`li` markup a screen reader reads in browse mode.
- **The harness's own files never appear and nothing implies authorship** (FR54, NFR3): the watcher's root is `_bmad/` only, transcripts/logs/caches/window state live in `userData` outside it; no rail module imports `node:fs`/`node:fs/promises` or names a write API; no control, label or copy in the Outputs surface says create, new, edit, save, written by, or generated.
- **Tokens, promoted** into `tokens.css`'s second `:root`, each commented with its mockup line or DESIGN.md key: `--rail-row-padding` (`6.5px 11px`, `.frow` :134), `--file-icon-width` (`12px`) and `--file-icon-height` (`14px`) (`fileIcon` :1102; `components.rail-row`). No literal colour, dimension, radius or font stack in any new stylesheet; no shorthand `font:`; the verbatim first block untouched; the motion inventory stays five; exactly two z-indexes.
- **Layering** (`eslint.config.mjs` LAYER_GRAPH, which must stay unchanged): watcher in `sources/`, pure fold in `fold/`, read model in `projections/`, composition in `src/main/`, contract in `src/shared/`, UI in `src/renderer/ui/`. The renderer imports only `shared` types. No new dependency.

**Never:**
- Never a session, transcript, document card, document window, `doc.open`, run-note wiring, composer, party row, sysline — Stories 1.12+ and Epics 2–4. No real annotation producer: `annotate` has no caller outside tests in this story, which is what "stubbed" means and what keeps the epic standalone.
- Never a room owner or a party summary class (FR51's last sentence rides Epic 4), and never an owner for an unrecognised file.
- Never parse `sprint-status.yaml`, never infer or display a pipeline stage, next step or progress from the set of rows, never ask the user where they are.
- Never a debounce inside the watcher, `awaitWriteFinish`, polling, or a second watcher on `.claude/skills` or the config files (the install watcher owns those).
- Never `aria-live` (rail changes are not announced — `EXPERIENCE.md:502-512`), `style={{ }}`, `z-index`, a new `@keyframes`, the word `outline` outside `focus.css`, or a `title=` that is the only carrier of a fact.
- Never remove or edit the `Preview` scaffolding in `src/renderer/ui/app.tsx`: `tests/persona.test.ts` pins it and it is still the only home of the 32/44px portrait sizes and the run-note preview.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Existing files at open | `_bmad/` holds `prd.md` (mtime 3 days ago), `epics.md` | rows `saved · 3d` (owner John on `prd.md`, none on `epics.md`), no `changing` flash, grouped under `_bmad/…/` headings | — |
| New file by any writer | an external process creates and writes `x.md` | row appears with no user action, `changing` with the pulsing dot, then `saved · just now` after ~400 ms of quiet | — |
| Atomic rename | `memlog.py`-style: write `.memlog.md.tmp`, rename over `.memlog.md` | one row for `.memlog.md`, none for the `.tmp`, the path present in every snapshot once seen (no remove/add flicker) | — |
| Rapid appends | three writes inside 400 ms | one `changing` period, one `saved`; ≤ 2 pushes | — |
| Empty file | created with 0 bytes | `not yet written`, no dot; content arrives → `changing` → `saved` | — |
| Truncate | a `saved` file rewritten to 0 bytes | `not yet written`, `savedAt` gone | — |
| Delete | file or its directory removed | row disappears (annotation with it); an empty group heading never renders | — |
| Annotation, row exists | stub `annotate('…/prd.md', { text })` | the row gains the tag; `state`, `savedAt`, `path`, `owner` byte-identical | — |
| Annotation, no row | stub `annotate('…/ghost.md', …)` | no row, no revision bump, nothing rendered | silently ignored |
| Annotation cleared | `annotate(path, null)` | tag gone, row unchanged and still complete | — |
| Fresh project | `_bmad/` exists and is empty, or is absent | `no files under _bmad/ yet` and `<projectPath>/_bmad` beneath; nothing else | — |
| Owner not in roster | `prd.md` present, roster lacks `bmad-agent-pm` | row renders with no owner slot | never a fallback name |
| Hostile names | file name or annotation containing markup | rendered as text | — |
| Noise files | `.DS_Store`, `x.tmp` | never a row | — |
| Watcher error | chokidar `error` event | one diagnostic line to stderr; rows unchanged | never thrown |
| No project for window | `rail:get` from an unknown window | `{ ok: false, error: { code: 'rail/no-project', … } }` | `ErrorLine` in the renderer |

</intent-contract>

## Code Map

New: `src/shared/rail.ts`; `src/main/sources/project/watch-artifacts.ts`; `src/main/fold/{rail-rows.ts,artifact-owner.ts}`; `src/main/projections/rail.ts`; `src/main/rail-bridge.ts`; `src/renderer/ui/outputs/{outputs.tsx,outputs.css,output-row.tsx,row-groups.ts,format-age.ts,rail-state.ts,use-rail.ts,use-now.ts}` and tests beside each. Edits: `src/main/index.ts`, `src/preload/{index.ts,harness-api.d.ts}`, `src/renderer/ui/{app.tsx,shell/shell.tsx}`, `src/renderer/design/tokens.css`, and the tests named below. No change to `eslint.config.mjs`, `package.json`, `main-window.ts`, or the Team half.

**Contract read from where it was verified.** `epics.md:871-917` (the story); FR10 `:40`, FR48–FR54 `:93-99`, NFR3 `:177`, UX-DR18 `:250`, UX-DR30 `:265`. `ARCHITECTURE-SPINE.md`: AD-1/AD-2 (`:69-88`), AD-19 (`:192-196`), the state-watcher convention (`:221`), layers (`:42-65`). `DESIGN.md:218-224` (`rail-row`), `:607-609` (anatomy), `:449-463` (binding constants). `EXPERIENCE.md:211-220` (two registers, owner display), `:284-289` (empty state), `:486` (Outputs keyboard — deferred to 1.12), `:502-512` (rail changes not announced), `:466` (`changing` has its text string). Mockup `_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html`: `.frow*`/`.fgroup` `:133-147`, `FILES` `:924-938`, `renderFiles`/`fileIcon` `:1089-1103`. `memlog.py` writes temp then `os.replace` (`_bmad/scripts/memlog.py:122-129`); the suffix is `.tmp`.

**The code this lands in.**
- `src/main/sources/install/watch-install.ts:99-113` — the chokidar call to mirror (`atomic: true`, `ignored` path-shaped, `watcher.on('error', () => {})`, `ready` promise, `close`). Its header says the rest of `_bmad/` is "the artifacts the rail watches": this story is that watcher. Leave it untouched.
- `src/main/install-bridge.ts:14-116` — the bridge to copy: exported channel constants, the `Sender` shape, per-`sender.id` service map, `projectPathFor` and watcher deps, `destroyed` cleanup, `HarnessError` replies. `src/main/index.ts:66-67` registers it; add `registerRailBridge()` beside it.
- `src/preload/index.ts:10-39` and `harness-api.d.ts:8-19` — constants, `getInstall` (throws the envelope), `onInstallChanged` (hands the snapshot, not the event). `tests/bridge-contract.test.ts:92-103` pins the method list; `:80-90` ties channel literals.
- `src/shared/install.ts:16-54` — `AgentView`, `HarnessError`, `InstallReply`: the shapes `rail.ts` parallels. `src/renderer/ui/install/install-state.ts:10-78` and `use-install.ts` — `acceptSnapshot` (revision wins), `asHarnessError`, `connectInstall` (subscribe before ask); copy the pattern into `rail-state.ts`/`use-rail.ts` rather than generalising.
- `src/renderer/ui/shell/shell.tsx:97-108` — `RailHalf` already takes `children`; Outputs is `<RailHalf label="Outputs" />`. Add optional `rail?: RailSnapshot | null` and `railFailure?: HarnessError | null` props (default `null`), so every existing shell test still renders an empty Outputs body. `src/renderer/ui/app.tsx:96,169-175` — call `useRail()` beside `useInstall()` and pass both to `Shell`.
- `src/renderer/ui/status/status-dot.tsx` — `StatusDot state="work"`; do not use `StateLine` (its words are persona states). `src/renderer/ui/shell/shell.css:242-256` — `.rail-body` (scrolls) and `.rail-group` (reuse as is). `src/renderer/ui/team/team.css` — the `--code-tag-bg`/`--code-tag-padding` tag treatment to reuse for the annotation.
- Tokens already present and to be spent, not re-added: `--opacity-mark`, `--space-md-plus`, `--space-sm`, `--rule-width`, `--line`, `--line-soft`, `--fs-body-ui`, `--fs-label`, `--fs-meta`, `--radius-chip`, `--code-tag-bg`, `--code-tag-padding`, `--rail-group-padding`, `--amber`, `--text`, `--text-strong`, `--dim`, `--faint`, `--mono`.
- Guards that must stay green or be *deliberately* updated: `tests/shell-contract.test.ts:289-296` (controls only in `view-switch.tsx`; it scans `ui/shell` alone, so `shell.tsx` must gain no `<button|<input|role=` and the Outputs sources are held to the same rule by `tests/outputs-contract.test.ts`) and `:308-312` (the `<RailHalf label="Outputs" />` regex — the Outputs half now takes children), `src/renderer/ui/shell/shell.test.tsx:136-161` (Outputs empty with no `rail` prop — unchanged), `tests/accessibility.test.ts` (one `aria-live`, arrows only under `a11y/`, `outline` only in `focus.css`), `tests/tokens.test.ts` (literal guard over every stylesheet; two z-indexes; motion inventory five), `tests/layering.test.ts`, `tests/persona.test.ts` (`Preview` pinned), `tests/team-contract.test.ts`.

## Tasks & Acceptance

**Execution:**
- `src/shared/rail.ts` -- `DiskState`, `DiskField`, `RailOwner`, `RailAnnotation`, `RailRow`, `RailSnapshot { revision, rows }`, `RailReply`, `ArtifactObservation` -- the contract, types only
- `src/main/fold/rail-rows.ts` -- `SETTLE_MS`, `observe`, `settle`, `annotate`, `nextSettleAt`, `toRows` (sorted by path, annotation carried; owner is attached by the projection, not the fold's table) over an immutable table -- the two-owner model, pure, `now` injected
- `src/main/fold/artifact-owner.ts` -- `ownerAgentIdFor(path)`, with a header recording the sprint-status finding -- class-derived owner or nothing
- `src/main/sources/project/watch-artifacts.ts` -- `watchArtifacts({ projectRoot, onObservation, onError })` → `{ ready, close }` per the Watcher bullet; exports its `ignored` predicate for testing -- FR48, FR52, FR54
- `src/main/projections/rail.ts` -- `createRailProjection({ onChange, now?, quietMs? })`: `observe(obs)`, `annotate(path, a|null)`, `ready()`, `snapshot()`, `dispose()`; one `setTimeout` to the next settle, structural diff before any push, no push before `ready()`, owner attached from `ownerAgentIdFor` -- the read model
- `src/main/rail-bridge.ts`, `src/main/index.ts` -- `RAIL_GET_CHANNEL = 'rail:get'`, `RAIL_CHANGED_CHANNEL = 'rail:changed'`, `registerRailBridge(deps)` as specified; `index.ts` registers it -- the bridge
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- the two methods and two channel constants -- six-method surface
- `src/renderer/design/tokens.css` -- the three tokens, each commented -- NFR23
- `src/renderer/ui/outputs/format-age.ts`, `row-groups.ts`, `rail-state.ts`, `use-now.ts`, `use-rail.ts` -- pure `formatAge`, `groupRows(rows)` → `{ dir, rows }[]` (dir `_bmad/` for root files), `acceptRail`/`connectRail`, the 30 s clock hook, the subscription hook
- `src/renderer/ui/outputs/output-row.tsx`, `outputs.tsx`, `outputs.css` -- `OutputRow`, `Outputs({ snapshot, failure, agents, projectPath, now })` (empty state, groups, rows, `ErrorLine`) and a thin connected wrapper using `useNow`; the file icon inline, sized by tokens
- `src/renderer/ui/shell/shell.tsx`, `src/renderer/ui/app.tsx` -- mount Outputs in the Outputs half with the new optional props; `App` feeds `useRail()` -- wiring
- `src/main/fold/rail-rows.test.ts`, `artifact-owner.test.ts` -- every I/O row that is fold logic, plus: `observe`/`settle` never read or write `annotation`; `annotate` never touches anything else; identical results for one event and for fifty inside the window
- `src/main/projections/rail.test.ts` -- fake timers: push counts for a burst, settle by timer, no pre-`ready` push, annotation stub (decorate, no row, clear, no change of disk fields), owner attach, dispose clears the timer
- `src/main/sources/project/watch-artifacts.test.ts` -- real temp directory and real chokidar (the `watch-install.test.ts` pattern): found vs written, atomic rename with no `.tmp` row and no remove/add flicker, three writes in 400 ms, noise files, delete, `_bmad/` created late, only `_bmad/` watched (a sibling directory standing for `userData` is silent), `close` stops delivery
- `src/main/rail-bridge.test.ts`, `tests/bridge-contract.test.ts` -- handlers, per-window service, `no-project`, push, dispose; literals tied; exactly six methods, no passthrough
- `src/renderer/ui/outputs/*.test.ts(x)` -- `formatAge` boundaries and clamp; `groupRows` order and root dir; `acceptRail`/`connectRail`; `renderToStaticMarkup` rows per state (classes, dot only while changing, text strings, icon stroke class), owner resolved / unknown / absent, annotation present / absent with identical row layout, empty state exactly two lines and nothing else, pending draws nothing, hostile text escaped, no controls
- `src/renderer/ui/shell/shell.test.tsx`, `tests/shell-contract.test.ts` -- existing Outputs-empty assertions hold with no `rail` prop; add: with a snapshot the rows and groups sit in the Outputs half and never the Team half, no extra button, the Outputs half holds no `tabindex`; update the `<RailHalf label="Outputs" />` regex to the new mount
- `tests/outputs-contract.test.ts`, `tests/tokens.test.ts` -- sources and styles read as text: tokens named exist; no `z-index`/`outline`/`@keyframes`/`font:`/`transition`/`animation`/`cursor`/`:hover` in `outputs.css`; no `<button|<input|role=|tabindex|onClick` or `aria-live` in `ui/outputs`; no announcer import; rail modules import no `node:fs*`, name no write API, read no content (`readFile`, `createReadStream`), use no storage; `sprint-status` is named only in `artifact-owner.ts`; `atomic: true` and `alwaysStat: true` are in `watch-artifacts.ts` and `awaitWriteFinish`/`usePolling` are not; `package.json` dependencies unchanged; `tokens.test.ts` couples `--opacity-mark` to DESIGN.md `components.rail-row.iconOpacity` and the three new tokens to their cited literals

**Acceptance Criteria:**
- Given a project whose `_bmad/` holds files, when the room opens, then the Outputs half shows one row per file grouped under directory headings, each `saved · <age>` from the file's mtime, with no `changing` flash and no user action
- Given any writer creates or modifies a file under `_bmad/`, when the watcher sees it, then a row appears or updates without user action, shows `changing` with the pulsing dot and its text while writes keep arriving, and settles to `saved · just now` after about 400 ms of quiet
- Given a row, when it renders or serialises, then it has a watcher-owned `state` and a separate optional `annotation`, no merged status field exists anywhere, and with the annotation absent the row is complete and identically laid out
- Given the annotation source is stubbed, when an annotation is fed for an existing row, then it decorates that row only; when fed for a path with no row it creates nothing; and no annotation value changes `path`, `state`, `savedAt` or `owner` or removes a row
- Given a row, when its owner is resolved, then it comes only from the artifact class and renders the roster's name for that agent, and a file of an unrecognised class, or a class whose agent the roster lacks, renders no owner at all
- Given `memlog.py` writes by temp file, fsync and atomic rename, when it writes, then the watcher is configured for atomic writes (`atomic: true`), no `.tmp` row ever shows, the target's row never disappears and reappears, and three writes inside 400 ms are one `changing` and one `saved`
- Given a fresh project, when `_bmad/` holds nothing, then the Outputs half reads `no files under _bmad/ yet` with the watched path beneath it and nothing else — no next step, skill name, persona or control
- Given the harness's own transcripts, logs, caches and window state in `userData`, when the rail renders, then none appears, no rail code imports `node:fs*` or names a write API, and no text or control implies the harness authored or can author a file
- Given pipeline position, when the rail runs, then nothing asks the user where they are, nothing stores an answer, `sprint-status.yaml` is one more row whose contents are never read, and the format finding below is recorded in this spec and in `artifact-owner.ts`
- Given the source tree, when swept, then the new stylesheet holds no colour, dimension, radius or font-stack literal, `--z-` still names exactly two tokens, the motion inventory is still five, `outline` is only in `focus.css`, the layer graph is unchanged, and `package.json` gains no dependency
- Given `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, when each runs, then all four exit zero and the suite is larger than the 895 tests Story 1.10 left behind

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass
- verdicts: 26 findings — high 0, medium 1, low 21, false 1, maybe-false 3 (Blind Hunter 13, Edge Case Hunter 7, Verification Gap 5, Intent Alignment 1 descriptive; three rows share one root cause, the `ready` hang)
- findings:
  - `[maybe-false]` `[defer]` Blind Hunter: `rail:get` can hang forever if the watcher's `ready` never fires (an error or stall before the initial scan), leaving the Outputs half blank with no `ErrorLine` — a real chokidar run with an unreadable subdirectory emitted `error EACCES` and then `ready`, so the common error path does not hang; what would settle the exotic ones is forcing an `EMFILE`/`ENOSPC` watcher error before `ready` and observing whether `ready` still fires. Deferred, medium if true (unverified).
  - `[low]` `[reject]` Blind Hunter: `sender.send` is guarded only by `isDestroyed()` and a throw would escape a timer or chokidar callback — the same guard `src/main/install-bridge.ts:70-74` has shipped with since Story 1.7, and nothing shows `send` throwing on a live, undestroyed `webContents`; the fix adds a guard for state that was not demonstrated.
  - `[low]` `[reject]` Blind Hunter: every observation commits by `JSON.stringify` over all rows and pushes the whole table — n is a few hundred at most (112 files in this repository's `_bmad/`), and batching across paths would add machinery the spec does not ask for.
  - `[low]` `[reject]` Blind Hunter: the whole `_bmad/` tree is unfiltered, so install files are noise rows and `deferred` stays empty — FR48 and the story's first acceptance criterion say one row per file under `_bmad/`; the filter is a product decision recorded in Design Notes and flagged in the result, and the only fix is to edit the spec.
  - `[low]` `[reject]` Blind Hunter: a `written` event with unchanged size and mtime flashes `changing` — chokidar emits `change` on an mtime change (or `atime <= mtime`), so a chmod or read-only touch does not reach `observe`, and skipping equal stats would mean keeping `mtimeMs` on saved rows.
  - `[low]` `[reject]` Blind Hunter: truncate-then-write moves a long-saved file through `not yet written` — the spec's own `Truncate` row mandates it; the fix is to edit the spec.
  - `[low]` `[reject]` Blind Hunter: dropped or throttled watcher events are never reconciled and `settle` does not re-stat — the only remedy is polling or a second stat, which the spec forbids (`usePolling`, no `awaitWriteFinish`), and the watcher suite's own comments state the limit.
  - `[low]` `[reject]` Blind Hunter: only `.tmp` and `.DS_Store` are ignored, so editor scratch files flash and `notes.tmp` is hidden — the spec lists editor temp names under "Left for later" and `.tmp` is `memlog.py`'s own temp suffix.
  - `[low]` `[reject]` Blind Hunter: `followSymlinks` is left on — a symlink under `_bmad/` is still a path under `_bmad/` (the row path is the link's), and whether a user's symlinked output directory should show is undecided, not wrong.
  - `[low]` `[reject]` Blind Hunter: owner by basename in any directory is a guess — the spec defines the class by basename and the map is documented; the fix is to edit the spec.
  - `[low]` `[reject]` Blind Hunter: an unbounded annotation squeezes the name, and a truncated name has no `title` — no annotation producer exists until Epic 3, which bounds its own text, and the full path is Story 1.12's window title.
  - `[low]` `[reject]` Blind Hunter: group headings are unlabelled `div`s and the empty-state path double-slashes on a trailing slash — Story 1.10's triage rejected the same visual-only heading claim for the Team half, and `resolveProjectPath` returns `path.resolve(...)`, which has no trailing slash (only `/` itself).
  - `[low]` `[reject]` Blind Hunter: the watcher tests are timing-based with loosened size assertions, dead `now`/`quietMs` deps on the bridge, and overbroad guard regexes — coalescing is asserted deterministically in the fold and projection suites with an injected clock, the loosened watcher assertions fail spuriously rather than pass wrongly, and the deps are the injectable seams every bridge here carries.
  - `[maybe-false]` `[defer]` Edge Case Hunter: `ready` can fail to arrive on an error before the initial scan — same root cause as the first row; carried into the same deferred entry.
  - `[low]` `[reject]` Edge Case Hunter (claim): `ignored` also runs on directory paths, so a directory named `x.tmp` prunes its subtree and the unit test's `a.tmp/prd.md` case misleads — true, but a directory named `*.tmp` under `_bmad/` is not something a user meets, and the fix needs stat-aware filtering.
  - `[low]` `[reject]` Edge Case Hunter: a throwing `onChange` skips `arm()` so `changing` rows never settle — same unshown `send` throw as the second row.
  - `[low]` `[reject]` Edge Case Hunter: a backwards clock step makes the settle timer very long — the fix needs a decision on what a negative elapsed means, and a wall-clock step of that size is not an everyday event.
  - `[low]` `[reject]` Edge Case Hunter: each initial-scan observation copies the whole `Map`, O(n²) — 112 files here, and the copy is the price of the immutable fold the spec asks for.
  - `[false]` `[reject]` Edge Case Hunter: `projectPath` with a trailing slash double-slashes the empty-state path — `resolveProjectPath` (`src/main/windows/choose-project.ts:58`) resolves the path with `resolve()`, which never leaves one except for `/`.
  - `[low]` `[reject]` Edge Case Hunter: a single rejected `getRail` is a permanent `ErrorLine` with no retry — `useInstall` behaves the same, the window's project is registered before the renderer loads so `rail/no-project` is not a startup race, and a retry policy is not asked for.
  - `[medium]` `[defer]` Verification Gap: `useRail`'s composition (`acceptRail`, `setFailure(null)`, the bridge guard) and the `App`→`Shell` wiring are pinned only by source-text regexes — no DOM environment exists; the Story 1.2/1.9 deferral, carried forward.
  - `[low]` `[defer]` Verification Gap: `useNow`'s interval and its cleanup have no test — the same missing harness; the spec lists the age tick as a manual check.
  - `[maybe-false]` `[defer]` Verification Gap (other findings): `rail:get` never replies if `ready` never fires — same root cause as the first row; carried into the same deferred entry.
  - `[low]` `[reject]` Verification Gap (other findings): the "stops delivering after close" test would pass without `watcher.close()` — a weak test, not a behavioural defect, and the `closed` flag is itself the contract.
  - `[low]` `[reject]` Verification Gap (other findings): the real-chokidar tests depend on macOS event timing — already stabilised by a drain and polling; a failure is spurious, never a false pass.
  - `[low]` `[reject]` Intent Alignment (descriptive): the intent's surface is the running window while the tests reach fold, projection, bridge and static markup, and no install-file or end-to-end check exists — the spec lists the real-window checks under manual checks, no DOM environment exists, and the install-file reading is the recorded Design Note.

## Design Notes

**Why `not yet written` means "zero bytes on disk".** The state vocabulary is fixed (`not yet written` → `changing` → `saved`), and a row may exist only because the watcher saw a file, so a file that has never been a row cannot be "not yet written". The one disk fact that honestly earns the words is a file that exists with no content (`touch`, a writer's `open(…, 'w')` before its first write). It keeps the state producible from disk alone, and leaves the "announced but not on disk" reading — which would need the stream to create a row — to Epic 3, where AD-2 already forbids it.

**Why `changing` is watcher activity plus a quiet window.** AD-2 says in-flight state for a writer the harness is not running (an editor, a terminal `claude`) must work without the stream, so `changing` is nothing but "an observation arrived less than `SETTLE_MS` ago". `savedAt` is the last observed `mtimeMs`, so the age is a fact about the file, not about when the harness noticed. A file seen in the initial scan is `saved` straight away; a live write racing the scan may be labelled `found`, which costs it one `changing` flash and nothing else.

**Why the whole `_bmad/` tree, install files included.** FR48 and CAP-6 say "one row per file under `_bmad/`" with no carve-out, the install watcher's own header calls everything else under `_bmad/` "the artifacts the rail watches", and the empty-state AC is written against the same tree. Filtering to a hand-picked set of output directories would be a hardcode of BMad's layout (the thing AD-10 forbids for agents) and a harness-side opinion about what counts as an output. The visible consequence on a real install is rows for the install's own files (config, scripts, rendered skills) with no owner, and an empty state reachable only when `_bmad/` holds nothing. If that reads badly in use, the filter is a one-function change in the watcher's `ignored` and a product decision, not a rework; it is flagged in the result, not pre-empted here.

**Why the rows are static and headings always show.** Story 1.12 gives a row its only action (open) and with it the roving list, arrows and `Enter` (`EXPERIENCE.md:486`); shipping a tab stop that does nothing now would be a dead control. Headings are the mockup's (`_bmad/`, `_bmad/ux/` …) and render whenever a group exists, unlike the Team half, because here the directory is the path's only other carrier. The row's `dirline` (DESIGN.md `meta` tier) is not drawn: the heading already states the directory, and the mockup draws none.

**Recorded, not implemented (FR10).** Verified against `.claude/skills/bmad-sprint-planning/sprint-status-template.yaml` during planning: `development_status` is a **flat map** whose keys carry the structure (`epic-1`, `1-1-<slug>` and `epic-1-retrospective` share one namespace, so position comes from parsing key shape, not nesting); the status vocabulary is **six values** — `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`, `optional` — not the three (`planned`/`started`/`unstarted`) the install contract describes; timestamps are `MM-DD-YYYY HH:MM`, not ISO; an unrecognised status must degrade, not break. The live `_bmad/implementation-artifacts/sprint-status.yaml` agrees. No consumer exists in v1, so nothing reads it.

**Left for later, not forgotten.** Row activation, roving and `Enter` (1.12). The session branch of owner resolution and the room owner (Epics 2–4). A real annotation producer (Epic 3 calls `annotate`). Editor temp-file names other than `.tmp` and `.DS_Store` (swap files, `4913`) can flash as rows; the atomic option covers the target, not every editor's scratch file. No DOM environment exists; the 30 s age tick and the pulse are manual checks. `currentId`-style state does not apply here: the rail holds nothing the renderer must persist.

## Verification

**Commands:**
- `npm test` -- expected: all green, more than 895 tests; the fold, projection, watcher, bridge and outputs suites included
- `npm run lint && npm run typecheck && npm run build` -- expected: all exit zero
- `grep -rnE 'outline|z-index|@keyframes|font:|transition|animation|cursor' src/renderer/ui/outputs --include=*.css` -- expected: no output outside comments
- `grep -rnE '<button|<input|role=|tabindex|aria-live|style=|title=|node:fs' src/renderer/ui/outputs src/main/fold src/main/projections/rail.ts src/main/sources/project/watch-artifacts.ts src/main/rail-bridge.ts` -- expected: no output
- `git status --short` after `npm run dev -- .` has opened and run for a minute -- expected: unchanged (the harness writes nothing into the project)

**Manual checks (what no test covers):**
- `npm run dev -- .` on this project: the Outputs half lists the `_bmad/` files under directory headings, `saved · <age>`, with owners on files whose class has one and none elsewhere; nothing is clickable.
- In a terminal, `printf x >> _bmad/planning-artifacts/scratch.md` then leave it: a row appears `changing` with the pulsing amber dot and amber text, and settles to `saved · just now` within about half a second; run `uv run _bmad/scripts/memlog.py` appends (or an equivalent temp-and-rename) and confirm no `.tmp` row and no flicker; delete the file and the row goes.
- `npm run dev -- <a project with an empty _bmad/>`: the two-line empty state with the full path beneath it, and nothing suggesting what to do.
- Leave the window open for two minutes: ages advance (`just now` → `1m`) without any announcement or motion.

## Auto Run Result

Status: done

**What was implemented.** The Outputs half of the rail now lists every file under `<project>/_bmad/` as it changes. A chokidar watcher (atomic-rename aware, `alwaysStat`, no debounce of its own) reports what it sees; a pure fold turns that into rows with a watcher-owned disk `state` (`not yet written`, `changing`, `saved · <age>`) and, separately, an optional stream-owned `annotation` that a stub seam can decorate but never create, remove or alter. Coalescing is a 400 ms quiet window, so any number of events on one path is one `changing` period and one `saved`. Owner comes from the artifact class (six observed basenames) or is not shown. The rows cross the bridge on two new channels (`rail:get`, `rail:changed`) and six preload methods in all, and render grouped by directory with the file icon, a pulsing dot while `changing`, the owner's name when the roster has that agent, and the annotation tag when there is one. A fresh project reads `no files under _bmad/ yet` with the watched path beneath it. Pipeline position is neither asked, stored nor parsed, and the `sprint-status.yaml` finding is recorded in `artifact-owner.ts` and in Design Notes.

**Files changed.**
- `src/shared/rail.ts` (new) — the row, snapshot, reply and observation types.
- `src/main/sources/project/watch-artifacts.ts` (new) — the `_bmad/` watcher and its `ignored` predicate.
- `src/main/fold/{rail-rows.ts,artifact-owner.ts}` (new) — the two-owner row model and the class-derived owner.
- `src/main/projections/rail.ts`, `src/main/rail-bridge.ts` (new), `src/main/index.ts` — the read model, the bridge and its registration.
- `src/preload/{index.ts,harness-api.d.ts}` — `getRail` and `onRailChanged`.
- `src/renderer/ui/outputs/*` (new) — `Outputs`, `OutputRow`, `groupRows`, `formatAge`, `rail-state`, `useRail`, `useNow`, `outputs.css`.
- `src/renderer/ui/{app.tsx,shell/shell.tsx}` — `useRail()` and the Outputs mount, with optional `rail` and `railFailure` props on `Shell`.
- `src/renderer/design/tokens.css` — `--rail-row-padding`, `--file-icon-width`, `--file-icon-height`.
- Tests: suites beside each new module, `tests/outputs-contract.test.ts`, and updates to the bridge, preflight, shell, team and tokens suites (the four-method pins became six; the Outputs mount regex changed).

**Review findings.** 26 findings across four layers (Blind Hunter 13, Edge Case Hunter 7, Verification Gap 5, Intent Alignment 1) — 0 high, 1 medium, 21 low, 1 false, 3 maybe-false. Patches applied: none. Deferred (3 entries, in frontmatter): the `rail:get` wait on a watcher `ready` that might not fire (unverified), `useRail`'s composition pinned only by regex, and `useNow`'s interval untested. Rejected with reasons: see the triage log — the heavier ones are the unfiltered install files (the intent says one row per file under `_bmad/`), truncate showing `not yet written` (the spec's own row), and owner by basename (the spec's own class rule).

**Follow-up review recommended: false.** No finding was patched, so no patched entry can carry an unverified fix risk.

**Verification.** `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` exit zero; **1022 tests across 50 files** (895 before this story). The spec's two grep sweeps are clean, `package.json` and `eslint.config.mjs` are unchanged, and the implementer's `npm run dev -- .` for about 25 seconds logged no errors and left `git status` unchanged. The I/O matrix audit found every row covered by a passing test (fold, projection, real-chokidar watcher, bridge and static-markup suites); all 105 tests in those suites ran and passed. A separate probe confirmed that chokidar emits `ready` after an `EACCES` on a subdirectory.

**Residual risks.** None of the manual checks was run in a real window: the pulsing dot and amber state, the 30 s age tick, late creation of `_bmad/`, a `memlog.py` append, and the empty-state look. On a real install the Outputs half will list the install's own files (config, scripts, rendered skills) as ownerless rows — the literal FR48 reading, flagged in Design Notes; filtering is a one-function change in the watcher's `ignored` and a product decision. chokidar re-reads a directory at most about once a second, so a file created just after a scan of its directory can appear up to a second late, and macOS can drop an event outright; the watcher tests were stabilised with a drain and polling and assert less than they could for that reason. Editor scratch files other than `.tmp` and `.DS_Store` can flash as rows. The bridge starts its watcher on the first `useRail()` ask, which is before preflight has cleared the room.
