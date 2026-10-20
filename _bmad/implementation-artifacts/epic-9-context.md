# Epic 9 Context: A quieter skill row, a clearer rail

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the chat and the rail quieter and easier to read. The skill row above the composer collapses to one line until the user opens it, and that choice is kept app-wide. The rail's Outputs folders nest as a tree instead of flat groups with long paths. The rail also splits in two, with the project's uncommitted files from git listed above the Outputs list, so the user can see what a run changed outside `_bmad/` without leaving the window or opening a terminal. Story 9.3 is blocked on an architecture decision that does not exist yet: a git status source, how it is kept current, and a wider document-window boundary.

## Stories

- Story 9.1: Open the skill row only when you want it
- Story 9.2: The output folders nest as a tree
- Story 9.3: See what changed across the project, above the outputs

## Requirements & Constraints

**Skill row collapse (9.1)**
- The row is collapsed by default, on empty persona chats too. It is a native toggle button, `▸ <Name> can · <N> skills`, where N counts every menu entry and reads `1 skill` for one. When open it reads `▾ <Name> can` with the skill buttons and `+N more` / `fewer`, as Epic 8 left them. While collapsed, no skill button is drawn and none is a tab stop.
- One app-wide choice, shared by every persona's chat and kept across restarts. The row never opens or closes by itself: a persona switch, a first message, a turn starting or ending, a roster change or an error leaves it as it was. The in-row `+N more` expansion is not kept.
- Toggling writes no transcript entry, sends no command, announces nothing and leaves focus on the toggle. The toggle stays enabled while a turn is in flight; only the skill buttons are disabled. The thread keeps its follow state when the composer's height changes.
- There is no row in the New session chat, the room or a skill-first session, and none for a persona with no menu entries. The `/` list is still how a skill is found by name.

**Tree (9.2)**
- A directory inside another is drawn inside it. Each heading shows its own name with a trailing slash, and its full project-relative path is its `title` and accessible description. A row shows the file's own name.
- Subdirectories come before files, each in code-unit order. There is no single-child compaction, and a directory with nothing under it at any depth has no heading.
- Folding a heading hides its whole subtree and keeps the fold state of the directories inside it. The outermost folded heading over a `changing` file carries the amber dot and the word `changing`. No heading shows a count or a run annotation.
- The stored folded set keeps its shape and meaning, and nothing is migrated. A file arriving under a folded directory unfolds nothing and moves no focus or scroll.

**Changes half (9.3)**
- Lists every file git reports as uncommitted in the project folder: staged or not, plus untracked files git does not ignore. Nothing outside the project folder is read. Staged and unstaged are not told apart, and a submodule is one row.
- States are words: `modified`, `added`, `deleted`, `renamed` (`· from <old name>`), `untracked`, `conflicted`. A row has no owner, no run annotation, no state colour and no letter badge. An uncommitted file under the output folder appears in both halves, and the two are not merged.
- The list is kept current within about two seconds while the window is in front, and re-read when the window comes to the front. Nothing is read while the window is in the background.
- When there is nothing to list, the half shows exactly one line: `no uncommitted changes`, `not a git repository`, `git not available` or `changes not read · <reason>`, with no action offered. A list longer than 500 rows ends with `+<N> more not listed`, which is not a control.
- The harness must never raise the macOS developer-tools prompt, and a test must prove it. Nothing anywhere stages, commits, reverts, stashes, checks out or writes into `.git` or the project, and a negative-surface test pins this. There is no diff view.

**Cross-cutting:** personas keyed by `agentId` (NFR12); keyboard reach, the shared focus ring, and focus never moved or lost (NFR20, NFR21); nothing announced through the live region (NFR22); no new colour, size, radius or token; must not read as a chat box with a portrait glued on (NFR28).

## Technical Decisions

- **Skill row choice storage:** one boolean, `skillRowOpen`, in `layout.json` beside the widths. `layout:get` returns it with the rest. A missing field or an unreadable file means collapsed. `LAYOUT_VERSION` is unchanged.
- **Skill row channel:** one new request channel, `layout:set-skill-row`. It ignores anything that is not a boolean and writes atomically. A failed write is reported as a `layout/unwritten` diagnostic, and the choice still applies in the window. Width and folded writes keep the field. No event is pushed: another window reads the choice the next time it asks.
- **Tree:** built in the renderer from the rows main already sends. There is no change to the rail snapshot, `RailRow`, a row's two registers (AD-2), or the shape of `layout:set-folded`.
- **Rail split:** the share is stored per user in `layout.json` as an additive, optional field, through one new validated channel. A missing or out-of-range value means half and half.
- **Changes folding:** the Changes half keeps its own folded set per project, separate from the Outputs half's.
- **Git source (pending architecture):** a main-side git status source. It is read-only, scoped to the project folder, validated to a closed shape the way `readBranch` validates the branch, and never able to spawn the `/usr/bin/git` shim that raises the install prompt. When git cannot be asked safely, the answer is `git not available`.
- **Document window (pending architecture):** must be allowed to open any file under the project's real path (AD-13). Non-markdown text is shown as plain mono with no highlighting. A binary or oversized file shows one `not shown · …` line. A path resolving outside the project opens nothing.
- **Contract:** the conversation contract is untouched (`CONTRACT_VERSION`, the 17 events and 8 commands). Each new channel is tied to the literal in the preload that speaks it. No new conversation event.

## UX & Interaction Patterns

- **Skill row toggle:** the label's own mono, uppercase type in `meta`, with no ground and no border. Hover lifts it to `text`. It takes the shared focus ring and has no motion, or a short height ease that is not played under reduced motion. Its accessible name is `<Name> can, <N> skills`, and the chevron is `aria-hidden`. While collapsed it is the only tab stop in the row.
- **Tree:** `{spacing.xl}` (12px) of indent per level, with no guide lines, connectors or bands. Nested headings expose their depth (`aria-level` or an equivalent). The list is one roving tab stop in visual order. `←` folds and `→` unfolds; `←` on a folded heading or on a row moves to the parent heading and does nothing at the root.
- **Rail split:** the side splitters' look, turned horizontal, on the Outputs head's top border. Keys: `↑`/`↓` move 16px (64px with `Shift`), `Home`/`End` go to the limits, and `Enter` or double-click resets. Each half is at least 120px. It is a `separator` with `aria-orientation="horizontal"` and a percentage value, and it is not drawn at ≤1000px.
- **Changes half:** the head reads `changes` with nothing on its right. The tree is rooted at the project folder's name. A row is the file icon at `faint`, the name in `text`, and the state in `meta` mono `dim`. A deleted row is struck through and opens nothing, and its description is `deleted · nothing to open`. A row's accessible name is `<name>, <state>`. Tab order: the Changes list, then the split, then the Outputs `change…`, then the Outputs list.
- **Updates:** rows arrive and leave in one frame. If a focused row leaves, focus goes to its parent heading, or to the half's tab stop if the heading has gone too.

## Cross-Story Dependencies

- 9.1 and 9.2 depend on nothing and can be built in either order. 9.3 builds on 9.2's tree and cannot start until `bmad-architecture` records the git source decision and widens the document-window boundary under AD-13.
- All three build on the chat and rail as Epic 8 left them. Some existing tests assume the old behaviour: skill-row, app, epic-7 audit and negative-surface tests assume an open row, and the outputs and layout-contract tests assume flat groups. Each must be changed on purpose, not deleted.
- Record amendments to make: Stories 8.2, 8.3 and 8.7 (row drawn collapsed); Story 5.5 and UX-DR18 (groups now nest); a citation of AD-13's amendment (9.3). Check `EXPERIENCE.md` and `DESIGN.md` against what was built.
