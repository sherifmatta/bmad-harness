# Epic 9 Context: A quieter skill row, a clearer rail

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the window quieter and the rail more legible, built on the chat and rail as Epic 8 left them. The skill-button strip above the composer collapses to one line by default, and the user's choice is kept app-wide (done). The Outputs folders nest as a real tree instead of flat groups with long paths (done). The rail then splits in two, with the project's uncommitted files from git above the Outputs list. That way the user can see and open what a run changed outside `_bmad/` without leaving the window or opening a terminal, and the harness never stages, commits or writes anything.

## Stories

- Story 9.1: Open the skill row only when you want it (done)
- Story 9.2: The output folders nest as a tree (done)
- Story 9.3: See what changed across the project, above the outputs

## Requirements & Constraints

- **Skill row (built):** collapsed by default and never opened by itself. One app-wide boolean (`skillRowOpen` in `layout.json`) is shared by every persona's chat. The in-row `+N more` expansion is not kept. The toggle works while a turn is in flight.
- **Tree (built, reused by Changes):** there is one heading per directory level showing its own name and a trailing slash, with the full path as its title and description. Subdirectories come before files, in code-unit order. There is no single-child compaction, no count and no *collapse all*. Folding hides the whole subtree and keeps the inner folds. `←` on a folded heading or on a row moves to the parent heading. Nested headings expose their depth. Only Outputs shows `changing` on a folded heading. Changes headings show no dot, because a git state is settled.
- **Changes half lists** every uncommitted file (staged or not, plus non-ignored untracked files) for the project folder only. It is drawn as the 9.2 tree, rooted at `<project-folder-name>/`. Each row has exactly one state word: `modified`, `added`, `deleted`, `renamed` (`· from <old>`), `untracked` or `conflicted`. Staged and unstaged are not told apart, and a submodule is one row. Rows have no owner, run annotation, state colour or letter badge.
- **Freshness:** the list updates within about 2s while the window is in front, and again whenever the window comes back to the front. Nothing is read in the background. Rows arrive and leave in one frame. Nothing unfolds, and focus and scroll stay put. A focused row that leaves hands focus to its parent heading, or to the half's tab stop.
- **Empty or failure states** are exactly one line with no action: `no uncommitted changes`, `not a git repository`, `git not available` or `changes not read · <reason>`. The cap is 500 rows in tree order, followed by a plain `+<N> more not listed` line that is not a control.
- **Folded sets:** Changes keeps its own folded set per project, separate from the Outputs one.
- **Opening a row:** a row opens in the existing read-only document window with its three escapes. Markdown renders as before. Other text shows as plain mono with no highlighting. A binary file shows one `not shown · …` line. A `deleted` row is `dim` and struck through, opens nothing, has the description `deleted · nothing to open` and announces nothing.
- **Never:** a stage, unstage, commit, revert, stash or checkout, or any write to `.git` or the project; a count or badge for having changes anywhere; a suggestion to commit; a diff view; a read outside the project folder; the macOS developer-tools install prompt. A test must prove the git source is never asked in a way that could raise that prompt.
- **Restraint:** no new colour, size, radius or token. Nothing in the rail is announced through the live region.

## Technical Decisions

- **Git source (AD-31):** one source in `src/main/sources/project/` (beside `readBranch`), one pure fold in `src/main/fold/`, and one snapshot projection per project window.
  - **Which git:** git runs only by absolute path. The fixed candidates are tried first (CommandLineTools, Xcode, `/opt/homebrew/bin`, `/usr/local/bin`), then the absolute dirs of the login path. A candidate is rejected if its real path is `/usr/bin/git` or `/usr/bin/xcrun`, or if its first bytes are not a Mach-O header (thin or universal). That header is read from the file and the candidate is never run to check. If no candidate is left, the answer is `git not available` and nothing is spawned. A unit test with a fake runner and a fake file system proves that the stub, bare `git` and a script are never run.
  - **Not a repository:** this is decided from `<real root>/.git` (a directory or a `gitdir:` file) before git runs. With `.git` present, any non-zero exit is `changes not read · git exit <code>`.
  - **The one command:** `--no-optional-locks -c core.fsmonitor=false -c core.untrackedCache=false -c status.renames=true status --porcelain=v2 -z --untracked-files=all --ignore-submodules=dirty`. It runs via `runCommand` with a 10s timeout, and the real project path is its working directory.
  - **Environment:** an allowlist of `HOME`, `USER`, `LANG`, `LC_*`, `TMPDIR`, plus `PATH` as the login path with `/usr/bin` removed. Also set: `GIT_CEILING_DIRECTORIES` (the parent of the real path), `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1` and `GIT_TERMINAL_PROMPT=0`. No other `GIT_*` variable is passed.
  - **The fold** maps every v2 record into a closed shape.
    - `M`/`T` → `modified`; `A` in X → `added`; `D` on either side → `deleted`, which wins.
    - `2 … R` → `renamed` with the old path; `C` → `added`.
    - `u` → `conflicted`; `?` → `untracked`. `? path/` is an untracked directory, drawn as a row that opens nothing.
    - `#` and `!` lines are ignored. Any other record fails the whole read as `unexpected output`.
    - Paths have their own validator. Spaces and printable characters are allowed. Empty, `.` and `..` segments are rejected, as are control, bidi, zero-width and U+FFFD characters.
    - A timeout is `too slow`, and output past the cap is `too many files`.
  - **The snapshot** is one of: `reading` (drawn as no line), the list, or one of the one-line states. Main sends the full list, and the renderer does the ordering, the tree and the 500 cap.
  - **Scheduling:** a new `subscribeFront(sender, { onFront, onBack })`, built on window focus and blur, calls `onFront` at once if the window already has focus. While the window is in front, main reads, then reads again about 2s after each answer, with only one read in flight. `onBack` lets a read in flight finish and schedules nothing more. A focused document window counts as background. No working-tree watcher is used for this.
- **Contract:** Epic 9 adds no domain event or command. `CONTRACT_VERSION` stays 1, with 8 commands and 17 events. `changes:get` and `changes:changed` are bridge channels in `src/shared/channels.ts` (the `install:get`/`install:changed` pattern). `changes:changed` is pushed only when the snapshot differs. The split share adds one validated layout request channel. Each channel is tied to its preload literal, and the pinned channel count in `tests/contract.test.ts` moves by exactly what 9.3 adds.
- **Layout persistence:** the split share is stored per user in `layout.json` beside the widths. The field is additive and optional by name, and `LAYOUT_VERSION` is unchanged. A missing or out-of-range value reads silently as 50%. Width, folded and skill-row writes preserve it. A failed write is a `layout/unwritten` diagnostic.
- **Document boundary (AD-13 amended):** `doc.open` has exactly two admissions. The first is a path inside the output folder, as before. The second is a path that is exactly a non-deleted entry in main's current Changes snapshot and whose real path, made project-relative, is also a non-deleted entry. That second check stops an untracked symlink to `.env`.
  - Each window keeps the boundary it was admitted by, fixed at open. The watcher, the `refused` state, the folder line and the refusal message read that boundary, not the output folder.
  - For a window admitted through Changes, the real-path check reruns on every read: a path swapped for a link reads `refused`. The path leaving the list later does not close the window.
  - Text keeps the `DOC_MAX_BYTES` truncation. Only a NUL byte or invalid UTF-8 gives `not shown · binary`. Directory rows and a renamed row's old path open nothing.
  - The renderer passes the row's path unchanged and never builds one.
- **Truth channels (AD-2 amended):** git is a third channel. A Changes row is never merged with a rail row, never annotated by the stream, and never creates or removes one. A file uncommitted under the output folder appears in both halves.
- **AD-1 amended:** the harness writes nothing into `.git`. The one accepted residue is a clean or process filter the repository configures, which may still run.
- **Before building 9.3 (open items):** measure how long a status read takes on this repo, and revisit the interval or timeout if it is over about 500ms. Whether Xcode's git with an unaccepted licence raises a dialog is unconfirmed. If it does, drop the Xcode candidate.
- **Tests:** tests that assumed the old behaviour are changed on purpose, never deleted. Negative-surface tests pin the absence of any git write control or command.

## UX & Interaction Patterns

- **Rail split:** Changes sits above Outputs, each with a 30px head and its own scroll. The Changes head reads `changes` with nothing on its right.
  - The splitter is the side splitter turned on its side, on the Outputs head's top border. It has no motion and no snap.
  - `↑`/`↓` move it 16px (64px with `Shift`), `Home`/`End` go to the limits, and double-click or `Enter` resets it to 50/50.
  - Each half is at least 120px, and a window resize keeps the share.
  - It is a `separator` with `aria-orientation="horizontal"` and a percentage value. It is not drawn at ≤1000px, where the halves stack at content height.
  - Moving the split touches nothing live.
- **Tab order:** the Changes list (one roving tab stop), then the split, then the Outputs head's `change…`, then the Outputs list.
- **Changes row:** a Rail row at rest: the file icon at `faint`, the name in `text`, and the state word at the right in `meta` mono `dim`. The accessible name is `<name>, <state>` and the description is the path. A deleted row has no hover underline. The empty line and the `+N more` line use the Outputs empty line's type and ink.
- **Tree indent:** `{spacing.xl}` (12px) per level, with no guides, connectors or bands. A long name ends in an ellipsis.

## Cross-Story Dependencies

- 9.1 and 9.2 are done. 9.3 builds on 9.2's tree, reusing it for the Changes half rooted at the project folder.
- 9.3 reuses: the layout-file pattern (as 9.1 extended it); `PanelSplitter`, `panel-drag.ts` and `use-panel-width.ts` for the split; `RailHalf` for the second half and the leftover `--rail-half-basis: 50%` token; and `runCommand` and `login-path.ts` in main. The branch chip stays a `.git/HEAD` read that spawns nothing.
- 9.3 closes by checking `EXPERIENCE.md` *Changes* and `DESIGN.md` *Rail split* and *Changes row* against what was built, and by citing AD-13's amendment.
