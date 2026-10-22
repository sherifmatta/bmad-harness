---
title: 'Story 9.3: See what changed across the project, above the outputs'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: '16bbc3d1513a5ce92f28a44e678a4336d5ede739'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-9-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The Changes half's in-app behaviour is verified only through stand-ins, not in the running app.
    evidence: |-
      Tests use a fake runner, a fake file system, fake timers, jsdom and static markup. Not yet seen in `npm run dev` on this repository: the list following an edit within about 2s, no system prompt, the split dragged and kept across a reload, stacking with no split at ≤1000px, and the real Tab order (Changes list, split, change…, Outputs list). Settled by running the spec's Verification manual checks.
    location: >-
      src/renderer/ui/changes/changes.tsx, src/main/changes-bridge.ts, src/renderer/ui/layout/use-rail-split.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The rail shows only the output folder, so what a run changed elsewhere in the project (code, tests, config) is invisible without a terminal (FR142, UX-DR59).

**Approach:** Split the rail in two: a **Changes** half above Outputs, separated by a horizontal splitter whose share is remembered per user. Changes lists git's uncommitted files as Story 9.2's tree, rooted at the project folder's name. Main reads them with one read-only `git status` run by a real git, only while the project window is in front (AD-31). A Changes row opens in the existing document window through AD-13's second admission.

## Boundaries & Constraints

**Always:**
- **Git source (AD-31, binding).**
  - Git is run only by absolute path. Candidates, in this order: `/Library/Developer/CommandLineTools/usr/bin/git`, `/Applications/Xcode.app/Contents/Developer/usr/bin/git`, `/opt/homebrew/bin/git`, `/usr/local/bin/git`, then `<dir>/git` for each absolute dir of `process.env.PATH` (which `inheritLoginPath` sets at startup), skipping relative entries.
  - A candidate is taken only if it is a regular file, its real path is neither `/usr/bin/git` nor `/usr/bin/xcrun`, and its first bytes read as a Mach-O header (thin or universal). The header is read from the file and the candidate is never run to check. If none is taken, the answer is `git not available` and nothing is spawned.
  - The answer is `not a git repository` when `<realpath(root)>/.git` is neither a directory nor a file starting `gitdir: `. Git is not run in that case.
  - The one command: `--no-optional-locks -c core.fsmonitor=false -c core.untrackedCache=false -c status.renames=true status --porcelain=v2 -z --untracked-files=all --ignore-submodules=dirty`. It runs through `runCommand` with a 10s timeout, and its working directory is the project's real path.
  - The command gets an allowlisted environment: `HOME`, `USER`, `LANG`, `LC_*`, `TMPDIR`, and `PATH` with every `/usr/bin` entry removed. Added to that: `GIT_CEILING_DIRECTORIES=<dirname of the real path>`, `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1` and `GIT_TERMINAL_PROMPT=0`. No other variable reaches it.
- **Fold (pure, closed).** Every record maps to one row, and anything else fails the whole read as `unexpected output`; a partial list is never sent.
  - Type `1`: `D` on either side → `deleted`, which wins; else `A` on either side → `added`; else `M` or `T` → `modified`.
  - Type `2`: `R` → `renamed` (with `from`), unless `D` is on either side, which gives `deleted`. `C` → `added`.
  - Type `u` → `conflicted`. `? p` → `untracked`; `? p/` → an untracked directory row (`directory: true`). Lines starting `#` or `!` are ignored.
  - Every path, and every renamed row's `from`, passes the AD-31 path validator. Read failures map to these reasons: a timeout is `too slow`; output over the cap is `too many files`; a non-zero exit is `git exit <code>` (the signal name if there is no code); a spawn error is `git not available`.
- **Freshness.** Main reads at once when the project window is in front, or when it comes to the front, then again 2s after each answer. Only one read is ever in flight. On blur, a read in flight finishes and nothing more is scheduled. `changes:changed` is pushed only when the folded snapshot differs from the one held. The snapshot is `reading` until the first answer, and `reading` draws no line at all.
- **Contract.** `CONTRACT_VERSION` stays 1, with 8 commands and 17 events. Exactly three channels are added, for 40 in all: `changes:get`, `changes:changed` and `layout:set-rail-split`. Exactly three harness methods are added, for 28: `getChanges`, `onChangesChanged` and `setRailSplit`. The Changes folded set goes through the existing `layout:set-folded`, called with a second argument `'changes'`. Each channel is tied to its preload literal.
- **Layout.** `layout.json` gains `railSplit` (user-wide, a number with 0 < x < 1, the share of the rail's height that Changes takes) and `changesFolded` (`{<projectKey>: string[]}`). Both are additive and optional, and `LAYOUT_VERSION` is unchanged. A value that is missing, unreadable or out of range reads silently as 0.5. Every `with*` writer, and `writeLayoutFile`, keeps both fields.
- **Rail split.** The DOM order inside `.rail` is: the Changes half, the split, then the Outputs half. The split is a `separator` with `aria-orientation="horizontal"`; its `aria-valuemin`, `aria-valuemax` and `aria-valuenow` are whole percentages, and it takes the shared focus ring.
  - Keys: `↑`/`↓` move it 16px, or 64px with `Shift`. `Home`/`End` go to the limits. `Enter` or a double-click resets it to 0.5 (stored as `null`). A drag follows the pointer and `Escape` cancels it.
  - Each half is at least 120px. The share is clamped to the live rail height when drawn, without writing. It is not drawn at ≤1000px, where the halves stack as they do today.
  - It has no motion and no snap, and the arrow names live in `src/shared/layout.ts`.
- **Changes half.**
  - Head: `RailHalf label="Changes"` with nothing on its right.
  - Tree: Story 9.2's `buildTree`, rooted at `''` and headed `<basename(project)>/`, with `FolderHeading`, roving keys, `←` to the parent, focus hand-off on removal, and its own folded set. A folded heading never shows `changing`.
  - Cap: the first 500 rows of the full tree in preorder, then `+<N> more not listed` as a plain `<p>`.
  - A row is the file icon at `faint`, the file's name in `text`, and the state word at the right in `meta` mono `dim`. A renamed row reads `renamed · from <old name>`. Its accessible name is `<name>, <state>` and its `title` (the description) is the path.
  - A `deleted` row is `dim`, struck through and never underlined; its `title` is `deleted · nothing to open`, and activating it does nothing. A directory row also does nothing when activated. Every other row calls `doc.open(row.path)`, passing the path unchanged.
  - Lines: `no uncommitted changes`, `not a git repository`, `git not available`, `changes not read · <reason>`.
- **Document window (AD-13 amended).**
  - Admission 1 is unchanged: a path inside the output folder.
  - Admission 2: the path is exactly a non-deleted, non-directory row `path` in the Changes snapshot held for that project window, **and** `relative(realpath(root), realpath(file))` is itself such a row.
  - A window admitted by admission 2 keeps that boundary. Its folder is `<basename(project)>/`, and every read requires the file's real path to equal the one admitted, else `refused`. It stays open if the path later leaves the list.
  - In every window, a NUL byte or invalid UTF-8 within the bounded read is `binary`. An incomplete sequence cut off at `DOC_MAX_BYTES` is not invalid. The binary foot line reads `not shown · binary`.
- **No live region.** Nothing in the rail is announced.
- **Tests.** Tests that assumed the old behaviour are amended on purpose, never deleted.

**Never:** Any git command other than the one, any spawn of `/usr/bin/git`, `/usr/bin/xcrun`, bare `git`, or a script candidate. Any stage, unstage, commit, discard, revert, stash or checkout control or call, a diff view, a write into `.git` or the project. A count, badge or state colour, a suggestion to commit, an owner or run annotation on a Changes row. Merging a Changes row with a rail row. A working-tree watcher for Changes, or any read while the window is in the background. A new domain event or command. A new colour, size or radius token. A transition or snap. Changing the Outputs half's behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mixed records | `1 .M …a.ts`, `1 AD …b.ts`, `1 .A …c.ts`, `2 R. … R100 new.md\0old.md`, `u UU … x.ts`, `? d/e.txt`, `? sub/` | modified, deleted, added, renamed (from `old.md`), conflicted, untracked, untracked directory row | n/a |
| Bad record | `3 …` or a path with `..` or U+FFFD | `changes not read · unexpected output` | whole read fails |
| Clean repo | empty stdout | `no uncommitted changes` | n/a |
| Nested project | no `.git` at the real root | `not a git repository`, runner never called | n/a |
| Only the stub | every candidate missing, `/usr/bin/git` on PATH | `git not available`, runner never called | n/a |
| Script candidate | `/opt/homebrew/bin/git` starts `#!` | skipped | next candidate |
| Exit 128 | `.git` present, git fails | `changes not read · git exit 128` | n/a |
| Background | window blurred mid-read | the read finishes, its answer is pushed if it differs, no next read | n/a |
| Symlink row | untracked `link.env → .env` (ignored) | `doc.open('link.env')` refused | `doc · not a document under <folder>` |
| Swapped later | admitted `a.ts` replaced by a link | the window reads `refused` | n/a |
| 501+ rows | 620 rows | 500 rows drawn, then `+120 more not listed` | n/a |
| Stored split | `railSplit: 7` or missing | drawn at 50% | silent |
| Focused row leaves | focus on `src/a.ts`, committed | focus on the `src/` heading, else the root heading or the list's tab stop | never on `body` |

</intent-contract>

## Code Map

Main:
- `src/main/sources/project/branch.ts:85` -- `readBranch` reads `.git` (directory, or a `gitdir:` file, one hop) without spawning. Reuse its approach, or export a small `hasGitMarker(realRoot)` from a new file. `branch.test.ts:11-21` shows the scripted `ReadFile` fake.
- `src/main/sources/install/run-command.ts:26-59` -- `CommandRunner(command, args, {timeoutMs, cwd, env})`. The output cap is 4 MiB. stderr is ignored. It returns `{ok:false, kind:'timeout'|'output-too-large'|'exit'|'spawn', code?, signal?}`. Fake it with `vi.fn<CommandRunner>`.
- NEW `src/main/sources/project/git-locator.ts` (+test) -- `locateGit(deps {realpath, readHead, isFile, path})` returns an absolute path or `null`. Accept Mach-O magics `feedface`/`feedfacf` (either byte order) and `cafebabe`/`cafebabf` big-endian with an arch count of 1–30, which rejects a Java class file.
- NEW `src/main/sources/project/git-status.ts` (+test) -- `readGitStatus(root, deps)` returns `{kind:'not-repo'}|{kind:'no-git'}|{kind:'output', stdout}|{kind:'failed', reason}`. It builds the env and args. Sources may not import fold (`tests/layering.test.ts:84-115`).
- NEW `src/main/fold/git-status.ts` (+test) -- `foldPorcelainV2(stdout)` returns `{ok:true, rows}|{ok:false}`. Split on `\0` and parse fields by fixed count: 8 for `1`, 9 for `2` (the old path is the next NUL field), 10 for `u`; the path is the rest. No `child_process` (`tests/session-contract.test.ts:147-155`) and no `.sort(`.
- NEW `src/main/projections/changes.ts` (+test) -- holds `{revision, root, body}`, combining source and fold. `front()`/`back()`/`dispose()` run single-flight reads, with a 2s re-read after each answer while in front. Inject the timers. Dedupe by a JSON key, after the `projections/board.ts` model, but push the first answer, since it replaces `reading`.
- NEW `src/main/changes-model.ts` -- `Map<webContentsId, ChangeRow[] | null>` with `remember`/`forget`/`changeRowsOf`, after `output-folder-model.ts`, so doc-bridge reads it with no deps.
- NEW `src/main/changes-bridge.ts` (+test) -- after `install-bridge.ts:65-135`. It builds a service lazily on the first `changes:get`. Default `subscribeFront` uses `BrowserWindow.fromWebContents` with `focus` → onFront and `blur` → onBack, and calls onFront at once if `isFocused()`. On `destroyed` it unsubscribes, disposes and forgets. It imports `./bridge-kit`. Its test copies `install-bridge.test.ts:7-115,342-400`.
- `src/main/index.ts:112-146` -- add `registerChangesBridge()` before the literal `registerDocBridge()`, which stays as is (`tests/document-window-contract.test.ts:463-471`). Add a mock in `index.test.ts` if needed.
- `src/main/sources/project/resolve-document.ts:31-97` -- add `resolveChange(root, path, rows)` returning `{ok, fullPath, realPath, refused}` for admission 2. Keep `isInside`.
- `src/main/sources/project/watch-document.ts:57-124` -- `readDocument` takes a boundary of either "inside a directory" (as now) or "exactly this real path" (admission 2). It decodes with `fatal: true` after trimming an incomplete tail on a truncated read, and invalid UTF-8 → `binary`.
- `src/main/doc-bridge.ts:138-221` -- try admission 1, then admission 2 via `changeRowsOf(sender.id)` and `deps.resolveChange`. The folder is `${basename(projectRoot)}/` for admission 2. Keep 5 `ipcMain.handle(`, no `node:fs` and no `readFile` here (`tests/document-window-contract.test.ts:404-461`). The refusal message is unchanged.
- `src/main/fold/layout.ts:62-95`, `src/main/sources/persistence/layout-file.ts:62-94`, `src/main/layout-bridge.ts:91-134` -- add `railSplitOf`/`withRailSplit` and `changesFoldedOf`/`withChangesFolded`, carried by every `with*`. `layout:set-rail-split` takes a number in (0,1) or `null`; anything else is ignored with a `layout/ignored · rail-split · <type>` diagnostic. `layout:set-folded`'s second argument `'changes'` routes to `changesFolded`, any other non-undefined value is ignored, and `layout:get` returns both.

Shared and preload:
- NEW `src/shared/changes.ts` -- `ChangeState`, `ChangeRow {path, state, from?, directory?}`, `ChangesBody`, `ChangesSnapshot = ChangesBody & {revision, root}`, `ChangesReply`.
- `src/shared/channels.ts` -- `CHANGES_GET_CHANNEL`, `CHANGES_CHANGED_CHANNEL`, `LAYOUT_SET_RAIL_SPLIT_CHANNEL`. No literal may contain the word `skill` (`tests/negative-surface.test.ts:1482-1486`).
- `src/shared/layout.ts` -- `Layout` gains `railSplit: number|null` and `changesFolded: string[]`, and `NO_LAYOUT` is updated. Add `RAIL_HALF_MIN = 120`, `splitLimits(height)` (falling back to 0.5 when the rail is too short) and `keyedShare(share, key, shift, height)` for `ArrowUp`/`ArrowDown`/`Home`/`End`/`Enter`. This is the only non-a11y home for arrow names (`tests/accessibility.test.ts:141-149`).
- `src/preload/index.ts:83-179`, `src/preload/harness-api.d.ts` -- `getChanges`, `onChangesChanged` (after the install pair at `:83-101`), `setRailSplit`, and `setFolded(folded, half?: 'changes')`. Only pass the second argument when it is given, so the existing invoke pins hold.

Renderer:
- `src/renderer/ui/outputs/row-groups.ts:10-74`:
  - Make `TreeNode<R extends {path:string}>` and `buildTree(rows, root, name = root)` generic. A path ending in `/` is a leaf row of its parent, and `baseName('a/sub/')` is `sub/`.
  - Move `showing`/`hasRows` here from `outputs.tsx:21-51` and export them.
  - Add `firstRows(tree, limit)`, a preorder walk over the files.
  - The sort count stays pinned (`tests/negative-surface.test.ts:316-345`).
- `src/renderer/ui/outputs/output-row.tsx` -- export `FileIcon`. It stays the one Outputs row component.
- NEW `src/renderer/ui/changes/`:
  - `changes-state.ts` and `use-changes.ts` copy `outputs/rail-state.ts` and `use-rail.ts`, guarded by `typeof window.harness?.getChanges === 'function'`.
  - `change-row.tsx` is the row.
  - `changes.tsx` holds `Changes` and `ConnectedChanges`. It mirrors the `Outputs` roving, fold and focus logic from `outputs.tsx:91-335` with its own state, uses `useLayoutContext().changesFolded`/`saveChangesFolded`, and imports `FolderHeading`, `row-nav`, `useDocOpen` and `foldKey`.
  - `changes.css` uses classes containing neither `outputs` nor `output` (`shell/negative-surface.test.tsx:299-303`). Its indent is `--tree-depth`, as in `outputs.css:159`.
- `src/renderer/ui/layout/layout-context.ts:11-40`, `use-layout.ts:54` -- add `railSplit`, `saveRailSplit`, `changesFolded`, `saveChangesFolded`, and update `INERT_LAYOUT`.
- NEW `src/renderer/ui/layout/rail-split.tsx`, `use-rail-split.ts` and `rail-split.css` -- the horizontal splitter. Copy the drag lifecycle from `panel-drag.ts` (Escape and blur cancel, `body.is-resizing`), using `clientY` and a `ResizeObserver` on `.rail`. Use `cursor: row-resize`, the `--splitter-hit`/`--splitter-pull` tokens, and a `::before` line as in `panel-splitter.css`. No timers in `ui/layout` (`tests/layout-contract.test.tsx:243-246`).
- `src/renderer/ui/shell/shell.tsx:44-65,394-408`, `shell.css:676-805`:
  - Inside `.rail`, render a Changes `RailHalf` with `ConnectedChanges`, then `RailSplit`, then the Outputs half.
  - The halves' basis comes from the share through an inline `--rail-half-basis` per half.
  - The Outputs `.rail-head` gets a 1px `--line` top border.
  - Add `.rail-split{display:none}` as its own rule in the ≤1000px block, leaving the pinned selector at `tests/shell-contract.test.ts:185-213` alone.
- `src/renderer/ui/doc/foot-text.ts` -- the binary line becomes `not shown · binary`.

Tests to amend on purpose:
- Counts:
  - `tests/channels-contract.test.ts:34-37` (40).
  - `tests/contract.test.ts:157-163,225-231,298-306`.
  - `tests/party-contract.test.ts:39-44`.
  - `tests/bridge-contract.test.ts:103-168,263-300,340,572-601`: the ordered methods list, the layout channels, and ties for the 3 new channels.
  - `tests/preflight-contract.test.ts:149`.
  - `tests/negative-surface.test.ts:978-986,2287-2308,2545-2564,2714,2950`.
- Surfaces in `tests/negative-surface.test.ts`:
  - `:143-171` adds `changes/` to `KEY_SURFACES`.
  - `:695-829` names the faint spenders.
  - `:1443-1455` adds `title=` exemptions by exact text for `change-row.tsx`.
- Layout:
  - `tests/layout-contract.test.tsx:38-52,130`.
  - `use-layout.dom.test.tsx:23-31,155-166`.
  - `panel-splitter.dom.test.tsx:42,111-114`: 3 separators, and the rail splitter's sibling.
  - `outputs-fold.dom.test.tsx` `LayoutContextValue` literals.
- Shell and app:
  - `tests/shell-contract.test.ts:150-213`.
  - `shell.test.tsx:200-504`: the `rail-body` count, `teamOf`, and button and tab-stop counts.
  - `app.test.tsx:168,3347,3389,3518-3531`: the fake bridge, `.rail-head` index 2, and scoping folder queries to Outputs.
- `tests/tokens.test.ts:913` only if `tokens.css` changes.
- Doc window:
  - `foot-text.test.ts:20-30`, `doc-app.test.tsx:120-122`, `document-state.test.ts:117`.
  - `doc-bridge.test.ts`, `watch-document` tests.
  - `tests/document-window-contract.test.ts:42-50` adds no new DOC_MAIN file importing `electron`.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/changes.ts`, `src/shared/channels.ts`, `src/shared/layout.ts` -- types, the 3 channels, and the split helpers with their unit tests -- every other layer depends on them
- [x] `src/main/fold/git-status.ts` + test -- red tests for every matrix record row, the path validator and the bad records, then the fold
- [x] `src/main/sources/project/git-locator.ts`, `git-status.ts` + tests -- a fake fs and runner prove the stub, bare `git` and a script are never run, and pin the exact argv, env and cwd, `not-repo` without a spawn, and the reason mapping
- [x] `src/main/projections/changes.ts`, `changes-model.ts`, `changes-bridge.ts` + tests, and `src/main/index.ts` -- single-flight front/back scheduling with fake timers, onFront at once when focused, and dedupe
- [x] `src/main/fold/layout.ts`, `layout-file.ts`, `layout-bridge.ts` + tests -- `railSplit` and `changesFolded`, kept by every writer
- [x] `resolve-document.ts`, `watch-document.ts`, `doc-bridge.ts`, `foot-text.ts` + tests -- admission 2, the symlink refusal, the per-read exact real path, and invalid UTF-8 as binary
- [x] `src/preload/index.ts`, `harness-api.d.ts` -- 3 methods and the `setFolded` half argument
- [x] `row-groups.ts` + test -- the generic tree, directory leaf rows, `showing`/`firstRows`
- [x] `src/renderer/ui/changes/*` + tests -- states, rows, cap, folding with its own set, keys, focus hand-off, open/no-op, accessible name and description
- [x] `layout-context.ts`, `use-layout.ts`, `rail-split.tsx`, `use-rail-split.ts`, `rail-split.css` + dom tests -- keys, clamp, reset, aria, drag and Escape
- [x] `shell.tsx`, `shell.css` -- the two halves and the split in DOM order
- [x] the pinned tests listed in the Code Map -- amend counts and pins on purpose, and add a negative-surface test that the only git argv in `src/main` is AD-31's, and that no file under `ui/changes/` names stage, commit, revert, discard, stash, checkout or diff
- [x] `_bmad/planning-artifacts/epics.md` (Story 9.3) -- a dated build note citing AD-13's amendment; check `EXPERIENCE.md` *Changes* and `DESIGN.md` *Rail split* and *Changes row* against the build; record the Xcode-licence open item in `deferred-work.md`

**Acceptance Criteria:**
- Given the full suite, when run, then every test passes, and the only assertions removed are ones replaced by their Story 9.3 equivalents.
- Given the running app on this repository with an uncommitted edit, when the window is in front, then the Changes half lists the file as `modified` under `bmad-harness/` within about two seconds. Committing in a terminal empties it to `no uncommitted changes`.
- Given the running app, when the rail split is dragged and the window reloaded, then the share is kept, and `Enter` on the split restores half and half.
- Given a Changes row for a non-markdown text file, when activated, then the document window shows it as plain mono text with the folder line `bmad-harness/`.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass

Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V), intent-alignment (I). The diff was staged in the git-ignored `.omc/review/` so every layer could read it.

- verdicts: 33 findings — high 0, medium 7, low 21, false 4, maybe-false 1
- findings:
  - `[low]` `[patch]` B1: a refused Changes open is silent, and the `use-doc-open.ts` comment says every row is under the output folder — refusal of a listed link is the intent ("opens nothing"); the stale comment is corrected and the `openers` entry is dropped on refusal.
  - `[low]` `[reject]` B2: a Changes-admitted window whose file is swapped for a link inside the project reads `outside <project>/ · not opened` — this is real but needs a swap after open, and the fix needs a new `DocSnapshot` field for the admission kind; not a direct correction.
  - `[low]` `[patch]` B3: `FORBIDDEN` misses U+061C and U+2028/2029, and is written with literal invisible characters — rewritten with `\u` escapes and the three added, with tests.
  - `[low]` `[reject]` B4: git is located again on every 2s read — a few stats each time, measured negligible beside a 45ms status; locating each time also picks up a git installed meanwhile.
  - `[low]` `[reject]` B5: a non-executable Mach-O candidate shadows later ones — this needs a git binary without its execute bit, which is unlikely; the fix adds an `X_OK` branch.
  - `[low]` `[reject]` B6: unexpected read failures leave no diagnostic — this is real for debugging, but it needs plumbing `writeDiagnostic` into the projection (a new parameter); the user-facing line is still correct.
  - `[low]` `[reject]` B7: a renamed row across directories reads `from <same name>` — this matches the intent's and DESIGN's `<old name>` wording exactly; changing it is a design decision for the owner (see Auto Run Result).
  - `[low]` `[reject]` B8: directory and deleted rows keep the hover ground or a pointer — DESIGN says "Hover and focus are the Rail row's" and asks only for no underline on deleted rows; untracked directory rows (nested repositories) are rare.
  - `[medium]` `[patch]` B9: focus falls to `body` when the list becomes a one-line state, not only when everything is committed — the half's line is focusable (`tabIndex=-1`) and takes focus held by the list; tests added for both cases.
  - `[false]` `[reject]` B10: every document window treats NUL or invalid UTF-8 as binary — AD-13 (amended) says "both admissions" and the intent says "in every window"; the Never list's "Outputs half" is the rail half, not the document window.
  - `[low]` `[patch]` B11: the `deferred-work.md` entry proposes the rail split as a focus target, which is hidden at ≤1000px — the Changes part of the entry is removed now that B9 is fixed.
  - `[low]` `[patch]` B12: the changes-model map leaks between bridge tests; the failure branch and `useChanges` are untested — the model is cleared between tests; covered with V4.
  - `[low]` `[patch]` E1: a submodule's ordinary record folds as a file row and opens a directory as "could not be read" — rows whose `sub` field starts with `S` are now `directory: true`, with a fold test.
  - `[low]` `[reject]` E2: an NFD-named file or case mismatch could make `realpath` disagree with git's listed path — this needs a file created with a decomposed name; the fix adds normalisation branches.
  - `[low]` `[patch]` E3: a file shrinking between `stat` and `read` can end mid-sequence and flash `binary` — the tail is trimmed whenever the read is cut short, with tests.
  - `[low]` `[reject]` E4: spawn failures other than a missing binary read `git not available` — a transient EMFILE or EAGAIN is unlikely, and the next read 2s later recovers.
  - `[low]` `[reject]` E5: `subscribeFront` throwing would leak a service — `BrowserWindow.fromWebContents` and `on` do not throw for a live sender; this guards an undemonstrated state.
  - `[low]` `[reject]` E6: a refocus during an in-flight read waits one interval — the in-flight read answers within milliseconds and the next follows 2s later, so this is well inside "about two seconds".
  - `[low]` `[reject]` E7: `onChange` throwing would stop polling — `sendTo` already skips a destroyed sender; this guards an undemonstrated race.
  - `[low]` `[patch]` E8: a refused open leaves its `openers` entry (same root as B1) — the entry is dropped on refusal.
  - `[medium]` `[patch]` E9: one failed read drops focus to `body` (same root as B9) — fixed with B9.
  - `[low]` `[patch]` E10: U+061C and U+2028/2029 pass the validator (same as B3) — fixed with B3.
  - `[medium]` `[patch]` V1: nothing verifies that blur stops reads at the bridge — a real-window test drives focus then blur with manual timers.
  - `[medium]` `[patch]` V2: the rail split's blur cancel and its unmount clean-up are untested — both cases were added, after the side splitter's tests.
  - `[low]` `[patch]` V3: `trimIncompleteTail` is tested only for 2-byte characters — 3- and 4-byte cuts were added.
  - `[medium]` `[patch]` V4: `useChanges` has no hook test (the stale reply race, failure, and clearing it) — `use-changes.test.ts` added, plus a dom case for the failure branch.
  - `[medium]` `[patch]` V5: `locateGit`'s real file-system helpers never run — they are exported and tested on a temp directory.
  - `[low]` `[reject]` V-other: the admission-2 refused foot wording (same as B2) — rejected with B2.
  - `[false]` `[reject]` I-A: oversize truncation, the closed failure reasons and `not shown · binary` depart from EXPERIENCE — these are AD-31 and AD-13 (amended), decided after the UX text and recorded in the build note.
  - `[false]` `[reject]` I-B: binary across all windows (same as B10).
  - `[medium]` `[patch]` I-C: the focus hand-off left partly deferred (same root as B9) — fixed with B9.
  - `[maybe-false]` `[defer]` I-D: the in-app behaviour (the ~2s refresh, no system prompt, drag and reload, ≤1000px stacking, real Tab order) is exercised only through stand-ins — if true, medium (unverified); settled by running the Verification manual checks in `npm run dev` on this repository.
  - `[false]` `[reject]` I-E: no test opens a non-markdown file through a Changes row — `doc-bridge.test.ts` opens `src/a.ts` through admission 2 and asserts `kind: 'text'` and the folder `bmad-harness/`-style project name.

## Design Notes

- **Measured before build (AD-31 open item).** On this repository (about 1,030 tracked files, git 2.50 from CommandLineTools) the exact command took 43–47ms over five runs, so the 2s interval and 10s timeout stand. This machine has no Xcode, so the licence-dialog question stays open: keep the Xcode candidate as AD-31 lists it, and record the item in `deferred-work.md`.
- **Interpretations of the closed fold.** `1 .A` (intent-to-add) maps to `added`, because AD-31 requires every record to map and failing on a common `git add -N` would blank the list. `2 RD` maps to `deleted`, because the new path is gone, so it opens nothing.
- **One folded channel.** AD-3 allows exactly the channels this story adds and names three. The Changes folded set therefore rides `layout:set-folded` with a half argument instead of a fourth channel.
- **Duplicated component glue, shared pure parts.** Outputs' tests pin `FolderHeading` to `outputs.tsx` and pin `output-row.tsx` as the only row component, so `Changes` repeats the roving and focus glue (about 120 lines). The tree, ordering, `showing`, `row-nav`, `foldKey`, `FolderHeading` and `useDocOpen` are shared.
- **Precedence over EXPERIENCE.** Where AD-31 and AD-13 (decided after the UX text) differ, they win: the failure reasons are a closed set, not git's first stderr line; oversized text keeps `DOC_MAX_BYTES` truncation instead of a `larger than` line; and binary reads `not shown · binary`. The renamed text uses DESIGN's `<old name>`, which is `baseName(from)`.

## Verification

**Commands:**
- `npx vitest run --project unit src/main src/renderer/ui/changes src/renderer/ui/outputs src/renderer/ui/layout tests/` while iterating, then `npm test` -- expected: all green
- `npm run typecheck` and `npm run lint` -- expected: no errors, no warnings

**Manual checks:**
- `npm run dev` on this repo: the Changes half lists `_bmad/implementation-artifacts/…` edits, a deleted row is struck through and opens nothing, the split drags and remembers, ≤1000px stacks with no split, and no system prompt appears.

## Auto Run Result

Status: done

**Summary.** The rail splits in two. A **Changes** half (git's uncommitted files, drawn as Story 9.2's tree rooted at `<project>/`) sits above **Outputs**, with a horizontal rail split between them whose share is remembered per user. Main reads one AD-31 `git status`, run only by a real git (Mach-O check, never the `/usr/bin` stubs), and only while the project window is in front. The document window gains AD-13's second admission (a listed path whose real path is also listed), with an exact-real-path boundary per read. Invalid UTF-8 now counts as binary (`not shown · binary`) in every window.

**Files changed:**
- **Shared:**
  - `src/shared/changes.ts` (new): the Changes types.
  - `src/shared/channels.ts`: adds `changes:get`, `changes:changed` and `layout:set-rail-split` (40 channels).
  - `src/shared/layout.ts`: `railSplit`, `changesFolded`, and the split helpers (`keyedShare` holds the arrow names).
  - `src/shared/document.ts`: `DOC_SNIFF_BYTES` removed.
- **Main, git source:**
  - `src/main/fold/git-status.ts` (new): the closed porcelain-v2 fold and the path validator.
  - `src/main/sources/project/git-locator.ts` (new): the Mach-O-only git locator.
  - `src/main/sources/project/git-status.ts` (new): the one command, the env allowlist and the `.git` marker.
  - `src/main/projections/changes.ts` (new): front/back single-flight reads every 2s, pushing only on a difference.
  - `src/main/changes-model.ts` (new): the rows held per window, for doc-bridge.
  - `src/main/changes-bridge.ts` (new): `changes:get`/`changes:changed` and `subscribeFront`.
  - `src/main/index.ts`: registers the bridge before `registerDocBridge()`.
- **Main, layout:** `src/main/fold/layout.ts`, `src/main/sources/persistence/layout-file.ts` and `src/main/layout-bridge.ts` handle `railSplit` and `changesFolded`. `layout:set-folded` takes a `'changes'` half, and `layout:set-rail-split` is new.
- **Main, document window:**
  - `src/main/sources/project/resolve-document.ts`: `resolveChange` (admission 2).
  - `src/main/sources/project/watch-document.ts`: the exact-real-path boundary; NUL or invalid UTF-8 is binary, and an incomplete tail on a cut-short read is trimmed.
  - `src/main/doc-bridge.ts`: admission 1, then admission 2, with the project name as the folder.
- **Preload:** `src/preload/index.ts` and `harness-api.d.ts` add `getChanges`, `onChangesChanged` and `setRailSplit` (28 methods), plus the `setFolded` half argument.
- **Renderer, Changes half:**
  - `src/renderer/ui/changes/*` (new): `Changes`/`ConnectedChanges`, `ChangeRow`, the state and hook, and CSS.
  - The one-line state takes focus when the list goes away.
- **Renderer, layout:**
  - `src/renderer/ui/layout/rail-split.tsx`, `use-rail-split.ts` and `rail-split.css` (new): the horizontal splitter.
  - `layout-context.ts` and `use-layout.ts`: the new fields.
- **Renderer, shared outputs code:**
  - `src/renderer/ui/outputs/row-groups.ts`: a generic tree, directory leaf rows, and `showing`/`firstRows`.
  - `output-row.tsx`: `FileIcon` exported.
  - `outputs.tsx`: uses the shared `showing`.
  - `use-doc-open.ts`: a refusal drops the opener.
- **Renderer, shell and doc:**
  - `src/renderer/ui/shell/shell.tsx` and `shell.css`: Changes, then the split, then Outputs; the Outputs head's top border; the split hidden at ≤1000px.
  - `src/renderer/ui/doc/foot-text.ts`: `not shown · binary`.
- **Tests:** new tests sit beside each new module. Pinned counts and surfaces were amended on purpose: channels, contract, party, bridge and preflight contracts, negative-surface, layout and shell contracts, the document window, `app.test.tsx` and `shell.test.tsx`. `tests/negative-surface.test.ts` gains a Story 9.3 block: AD-31's argv is the only git argv, and no stage, commit or similar word appears under `ui/changes/`.
- **Records:**
  - `_bmad/planning-artifacts/epics.md`: a dated Story 9.3 build note citing AD-13's amendment.
  - `_bmad/implementation-artifacts/deferred-work.md`: the Xcode-licence open item.
  - `epic-9-context.md`: regenerated, because it was stale against `epics.md`.

**Review findings breakdown.** One pass, four layers, 33 findings: high 0, medium 7, low 21, false 4, maybe-false 1.
- **Patched entries:**
  - **Medium (5):**
    - Focus falls to `body` when the list goes away (B9, E9, I-C).
    - A bridge test proving blur stops reads (V1).
    - Rail-split blur and unmount tests (V2).
    - `useChanges` race and failure tests, plus the bridge-model leak (V4, B12).
    - Real file-system tests for the locator's helpers (V5).
  - **Low:**
    - `FORBIDDEN` uses `\u` escapes and now refuses U+061C, U+2028 and U+2029 (B3, E10).
    - Submodule rows are `directory: true` (E1).
    - A cut-short read trims an incomplete tail (E3), and 3- and 4-byte cut tests were added (V3).
    - The stale `use-doc-open` comment was corrected, and a refusal drops its opener (B1, E8).
    - The Changes part of the `deferred-work` focus entry was removed (B11).
- **Deferred:** I-D, the in-app behaviour verified only through stand-ins: medium (unverified), recorded in frontmatter `deferred`.
- **Rejected:**
  - **Admission-2 refused wording** (B2, V-other): it needs a new snapshot field, and the case is rare.
  - **Re-locating git on every read** (B4): the cost is negligible, and it picks up a newly installed git.
  - **A non-executable Mach-O** (B5): unlikely, and the fix adds a branch.
  - **No diagnostic for unexpected failures** (B6): the fix needs a new parameter.
  - **The renamed row shows `<old name>`** (B7): the intent's and DESIGN's wording.
  - **Hover and cursor on rows that open nothing** (B8): DESIGN gives them the Rail row's hover, and directory rows are rare.
  - **Binary in every window** (B10, I-B): false; the amended AD-13 and the intent say so.
  - **NFD names or case** (E2): rare, and the fix adds normalisation branches.
  - **Other spawn errors** (E4): transient, and the next read recovers.
  - **`subscribeFront` throwing** (E5) and **`onChange` throwing** (E7): neither state was demonstrated.
  - **Refocus during an in-flight read** (E6): still within about two seconds.
  - **EXPERIENCE departures** (I-A): false; AD-31 and AD-13 decided them.
  - **No non-markdown open test** (I-E): false; `doc-bridge.test.ts` covers it.

**Follow-up review: recommended (`true`).** Five medium entries were patched (0 high, 5 medium, plus the lows above). The named unverified risk is the focus hand-off to the one-line state in a real Chromium window. It is tested only in jsdom, where removal fires no blur; the Outputs equivalent carries the same manual check. The rail split's real layout is also untested: net-zero height, the clamp at short rails, and the stacked layout at ≤1000px.

**Verification performed:**
- `npm run typecheck`: clean. `npm run lint` (eslint, max warnings 0, plus check-pins): clean.
- `npm test`: unit 260 files and 6,323 tests passed; watchers 3 files and 77 tests passed.
- The AD-31 command was measured before the build at 43–47ms on this repository. The implementation agent's bundled run of the real source against this repo took 24ms and listed the uncommitted files.
- The matrix audit covered all 13 rows with passing tests.
- `npm run dev` was not run (unattended), so the manual checks are the deferred item above.

**Residual risks:**
- **Xcode licence:** whether Xcode's git with an unaccepted licence raises a dialog is unconfirmed; this machine has no Xcode. It is recorded in `deferred-work.md`.
- **Renamed rows:** a rename across directories with the same name reads `renamed · from <same name>`. That is DESIGN's wording; the owner may prefer the old path.
- **Outputs documents:** a document opened from Outputs with invalid UTF-8 now shows `not shown · binary` instead of text with `�`, as AD-13 (amended) decides for every window.
