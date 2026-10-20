# Epic 9 Context: A quieter skill row, a clearer rail

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the window quieter and the rail more legible, on top of the chat and rail as Epic 8 left them. The skill-button strip above the composer, useful only while learning a persona, collapses to one line by default and the user's open/closed choice is kept app-wide. The Outputs folders nest as a real tree instead of flat groups with long paths. The rail then splits in two, with the project's uncommitted files from git above the Outputs list, so the user can see and open what a run changed outside `_bmad/` without leaving the window or opening a terminal. None of this stages, commits or writes anything.

## Stories

- Story 9.1: Open the skill row only when you want it (done)
- Story 9.2: The output folders nest as a tree
- Story 9.3: See what changed across the project, above the outputs

## Requirements & Constraints

- **Skill row:** collapsed by default, on an empty persona chat too. One app-wide boolean kept across restarts and shared by every persona's chat. Nothing ever opens it by itself: not a persona switch, a message, a turn, a roster change or an error. The in-row `+N more` expansion is not part of the kept choice. The toggle stays enabled while a turn is in flight, writes no transcript entry, announces nothing and never moves focus.
- **Tree (Outputs and Changes):** one heading per directory level showing its own name with a trailing slash, with the full path as its title and accessible description. Subdirectories come before files, each in code-unit order. No single-child compaction, no recency or pinning, no count, no *collapse all*. Folding hides the whole subtree and keeps the inner fold states. A folded heading carries `changing` (Outputs only) when anything beneath it at any depth is changing. The stored folded set keeps its shape and nothing is migrated. A file arriving under a folded directory unfolds nothing.
- **Changes half:** lists every uncommitted file (staged or not, plus non-ignored untracked files) from the project folder only, as a tree rooted at the project folder's name. Each row has exactly one state word: `modified`, `added`, `deleted`, `renamed` (`· from <old>`), `untracked` or `conflicted`. Staged and unstaged are not told apart, and a submodule is one row. The list stays within about 2s of changes while the window is in front and reads nothing in the background. Empty or failure states are exactly one line: `no uncommitted changes`, `not a git repository`, `git not available` or `changes not read · <reason>`. Rows are capped at 500, followed by a plain `+<N> more not listed` line. Changes and Outputs each keep their own folded set per project.
- **Opening a Changes row** uses the existing read-only document window. Markdown renders as before, other text shows as plain mono, and a binary or oversized file shows one `not shown · …` line. A `deleted` row is struck through and opens nothing.
- **Never:** any stage, commit, revert, stash, checkout or write to `.git` or the project; an owner or run annotation on a Changes row; a count or badge for having changes anywhere; the macOS developer-tools install prompt.
- **Keyboard and assistive tech:** each list is one roving tab stop. On a heading, `←`/`→` fold and unfold. `←` on a folded heading or a row moves to the parent heading. Nested headings expose their depth (`aria-level` or equivalent). Nothing in the rail is announced through the live region. Focus is never left on the page when a row or heading goes away; a leaving focused row hands focus to its parent heading or to the half's tab stop.
- **Restraint (product test):** no new colour, size, radius or token. Nothing may read as decoration.

## Technical Decisions

- **Layout persistence:** per-user UI state lives in `<userData>/layout.json`, behind a synchronous `layout:get`. Each write goes through a request channel that main validates, is written atomically, and on failure is reported as a `layout/unwritten` diagnostic while the choice still applies in the window. New fields are additive and optional by name, and `LAYOUT_VERSION` is unchanged. Writing a width or a folded set must preserve the other fields. 9.1 added `skillRowOpen` and `layout:set-skill-row`. 9.3 adds the rail-split share the same way (a missing or out-of-range value reads as 50%).
- **Contract:** no new domain event or command, and `CONTRACT_VERSION` stays at 1 (17 events, 8 commands). New channels go in `src/shared/channels.ts`, each tied to its preload literal. The pinned channel and method counts in the contract tests move by exactly what is added.
- **Tree in the renderer only:** the tree is built from the rows main already sends. There is no change to the rail snapshot or `RailRow`.
- **Git source (AD-31):** one source in `src/main/sources/project/`, one pure fold in `src/main/fold/`, and one projection per project window.
  - **Which git:** only an absolute-path git binary, from fixed candidates followed by the login-path dirs. A candidate is rejected if its real path is `/usr/bin/git` or `/usr/bin/xcrun`, or if it is not Mach-O (checked by reading its header, never by running it). With no candidate left the answer is `git not available` and nothing is spawned.
  - **Not a repository:** this is decided from `<real root>/.git` (a directory or a `gitdir:` file) before git runs. With `.git` present, any non-zero exit is `changes not read · git exit <code>`.
  - **The one command:** `--no-optional-locks -c core.fsmonitor=false -c core.untrackedCache=false -c status.renames=true status --porcelain=v2 -z --untracked-files=all --ignore-submodules=dirty`, run via `runCommand` with a 10s timeout and the real project path as its working directory.
  - **Environment:** built from an allowlist, with `/usr/bin` removed from `PATH`, `GIT_CEILING_DIRECTORIES` set to the parent of the real path, `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1` and `GIT_TERMINAL_PROMPT=0`.
  - **The fold:** it maps every porcelain v2 record into a closed shape, and an unknown record fails the whole read (`unexpected output`). Paths get their own validator: spaces allowed; no `.`/`..`, control, bidi or zero-width characters. A timeout is `too slow` and output past the cap is `too many files`. The snapshot is a union of `reading`, the list and the one-line states.
  - **Scheduling:** `subscribeFront(sender, { onFront, onBack })` reads at once when the window is in front, then about 2s after each answer, with only one read in flight. It stops on blur, and a focused document window counts as background. `changes:get` and `changes:changed` are bridge channels, and `changes:changed` is pushed only when the snapshot differs. Ordering, the tree and the 500 cap are the renderer's job; main sends the full list.
- **Document boundary (AD-13 amended):** `doc.open` admits a path inside the output folder (as before), or a path that is exactly a non-deleted entry in main's current Changes snapshot and whose real path is also a non-deleted snapshot entry. This is checked on every read. The renderer passes the row's path unchanged.
- **Truth channels (AD-2 amended):** git is a third channel. A Changes row is never merged with, annotated as, or used to create or remove a rail row. A file uncommitted under the output folder appears in both halves.
- **Before building 9.3:** measure how long a status read takes on this repo. If it is over about 500ms, revisit the interval or the timeout. Platform-specific git paths stay in `src/main/sources/project/` beside `readBranch`, whose branch chip remains a `.git/HEAD` read that spawns nothing.
- **Tests:** tests that assumed the old behaviour (an open skill row, flat groups) are changed on purpose, never deleted. Negative-surface tests pin the absence of git write controls and commands.

## UX & Interaction Patterns

- **Skill row toggle:** the existing `<NAME> CAN` label becomes a native button with `aria-expanded`. Closed it reads `▸ <NAME> CAN · <N> skills` (`1 skill`); open it reads `▾ <NAME> CAN`, with the buttons as before. It uses the label's mono uppercase `meta` type, no ground or border, hover to `text`, and the shared focus ring. There is no motion, or at most a short height ease that is skipped under reduced motion. Opening or closing it keeps the thread's follow state. While the row is collapsed, the `/` list is how a skill is found by name.
- **Folder heading:** the indent is `{spacing.xl}` (12px) per level on headings and their rows, with no guide lines, connectors or bands. A long name ends in an ellipsis.
- **Rail split:** Changes sits above Outputs, each with a 30px head (`changes` with nothing on its right) and its own scroll. The splitter sits on the Outputs head's top border and looks like the side splitters, turned on its side. A drag follows the pointer. `↑`/`↓` move it 16px (64px with `Shift`), `Home`/`End` go to the limits, and double-click or `Enter` resets it to 50/50. Each half is at least 120px. It is a `separator` with `aria-orientation="horizontal"` and a percentage value. It is not drawn at ≤1000px, where the halves stack. Tab order: the Changes list, then the split, then the Outputs head, then the Outputs list.
- **Changes row:** file icon at `faint`, name in `text`, and the state word at the right in `meta` mono `dim`. There is no state colour or letter badge. A deleted row is `dim` and struck through, with the description `deleted · nothing to open`. Its accessible name is `<name>, <state>` and its description is the path. Rows arrive and leave in one frame without moving focus or scroll.

## Cross-Story Dependencies

- 9.1 and 9.2 are independent. 9.3 builds on 9.2's tree, reusing it for the Changes half rooted at the project folder.
- 9.3 reuses the layout-file pattern from 9.1, the `PanelSplitter`/`panel-drag` approach for the split, `RailHalf` for the second half, and `runCommand` and `login-path.ts` in main. The leftover `--rail-half-basis: 50%` token is still available.
- Each story leaves dated notes where it amends earlier stories: Stories 8.2, 8.3 and 8.7 for 9.1; Story 5.5 and UX-DR18 for 9.2; AD-13 for 9.3. Each story also checks the amended `EXPERIENCE.md` and `DESIGN.md` sections against what was built.
