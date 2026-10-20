---
title: 'Story 9.2: The output folders nest as a tree'
type: 'feature'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_commit: '198e6194bb15a2354718005013d1f1b080c5bafb'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-9-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Outputs half draws one flat group per directory, so a deep folder is a heading of its own that shows its full path, sits outside its parent, and cannot be folded with it (UX-DR58).

**Approach:** Build a directory tree in the renderer from the rows main already sends, rooted at the snapshot's output folder. Draw one heading per level showing its own name, nest its subdirectories and then its files beneath it, and let a fold hide the whole subtree. The folded set keeps its shape.

## Boundaries & Constraints

**Always:** The root heading is `snapshot.folder` as written (`_bmad/`), at depth 0. Every other heading shows its own name with a trailing slash. Its full project-relative path (`dir`, the same string the folded set holds) is its `title`. Inside a directory, subdirectories come first and then files, each in `byCodeUnit` order. A directory gets a heading only while a row sits beneath it at any depth. Single-child chains are not compacted. Indent is `{spacing.xl}` per level: a heading at depth d is indented d steps, and its files and subdirectory headings d+1 steps. The indent goes on the content (chevron or file icon), so each row's rule and hover ground stay full width. There are no guide lines, connectors or bands. A folded heading renders nothing beneath it, but its branch element stays in the DOM for `aria-controls`. Folds beneath it are kept. A folded heading shows the amber dot and `changing` while any row beneath it at any depth is `changing`. Because a folded subtree is not rendered, only the outermost folded heading ever shows it. Each heading sits in a `role="heading"` wrapper with `aria-level`: the rail head is an `h3`, so the root is level 4 and each level adds one. The list stays one roving tab stop in visual order. `↑`/`↓` move, `Enter`/`Space` toggle, and on an open heading `←` folds and `→` unfolds. `←` on a folded heading or on a row moves focus to its parent heading, and does nothing at the root. Arrow names stay in `a11y/` (`foldKey`). When the focused heading or row leaves the list, focus goes to its nearest surviving ancestor heading, otherwise to the list's tab stop, and is never left on `body`. The folded-set entries, `layout:set-folded`, `foldedOf`/`withFolded` and `LAYOUT_VERSION` are unchanged, and nothing is migrated. Tests that assumed flat groups are amended on purpose, never deleted.

**Never:** Any change to `RailRow`, the rail snapshot, main or the bridge. Collapse all or expand all. A count, badge or run annotation on a heading. Recency, relevance or pinning. A row or file arriving under a folded directory unfolding anything or moving focus or scroll. Anything announced through the live region. A new colour, size or radius, a transition, or a rotation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nesting | rows `_bmad/a.md`, `_bmad/planning-artifacts/epics.md`, `_bmad/planning-artifacts/ux-designs/mockups/x.html` | `_bmad/` › `planning-artifacts/` › `ux-designs/` › `mockups/` › `x.html`; then `epics.md`; then `a.md` | n/a |
| Order | dir with `b/`, `a/`, `z.md`, `c.md` | `a/`, `b/`, `c.md`, `z.md` | n/a |
| No files directly in root | only `_bmad/x/y.md` | `_bmad/` heading, then `x/`, then `y.md` | n/a |
| Parent fold | `_bmad/x/` folded, then `_bmad/` folded and unfolded | `x/` still folded; its open siblings still open | n/a |
| Deep changing | `_bmad/` and `_bmad/x/` folded, `_bmad/x/y/z.md` changing | only `_bmad/` shows `changing` | n/a |
| ← on a row | focus on `epics.md` | focus on the `planning-artifacts/` heading | at the root: nothing |
| Old stored set | `folded: ['_bmad/planning-artifacts/']` | that heading folded, the rest open, no write | unknown entries are ignored |
| Focused row leaves | focus on `x/y.md`, which is removed and `x/` empties | focus on the `_bmad/` heading | no ancestor left: the tab stop |

**Decisions (owner, 2026-10-20):**
- All four of the story's defaults are accepted: no single-child compaction, subdirectories before files, `←` to the parent heading, and a 12px (`{spacing.xl}`) indent.
- Depth reaches CSS as `--tree-depth`, an inline style on each `.outputs-group`, declared once in `tokens.css` as `--tree-depth: 0`. It is a counter, not a colour, size or radius, and it keeps the rules and hover ground full width. One named `style=` exemption, and the tokens digest is re-pinned.
- The full spec is kept, at about 2,300 tokens, because one goal spans the tree, the render, keyboard and focus, and about 12 test files that are amended.

</frozen-after-approval>

## Code Map

- `src/renderer/ui/outputs/row-groups.ts` -- replace `groupRows`/`RowGroup` with `TreeNode = { dir, name, depth, dirs: TreeNode[], rows: RailRow[] }`, `buildTree(rows, root): TreeNode`, and `hasChanging(node)`. Keep `baseName` and `byCodeUnit`. Each comparator stays `byCodeUnit`, and the number of `.sort(` calls is pinned in `tests/negative-surface.test.ts:316-345`. By contract (Story 5.4) every row is under `root`; a row that is not under it is placed directly under the root.
- `src/renderer/ui/outputs/outputs.tsx` -- render the tree recursively. Each `.outputs-group` holds a heading and then `<div className="outputs-branch" id hidden={folded}>`, which holds the child groups and then `ul.outputs-list` of files (only when there are files). `order` is a preorder walk that skips folded subtrees. Keep a parent map from key to parent heading key. In `headingKeys`, `foldKey === 'fold'` on a folded heading moves to the parent. Row `onKey` checks `foldKey(event.key) === 'fold'` before `travel`. Track the focused key with `onFocus` and move focus on removal in a `useLayoutEffect`. `FolderHeading` must appear only once in the source (`tests/layout-contract.test.tsx:100`).
- `src/renderer/ui/outputs/folder-heading.tsx` -- props `name`, `dir`, `level`. `<div role="heading" aria-level={level} className="folder-heading-row">` wraps the single `<button>`, which gets `title={dir}`. The span shows `name`. The doc comment is rewritten for the tree.
- `src/renderer/ui/outputs/outputs.css` -- `.outputs-branch[hidden]` replaces `.outputs-list[hidden]`, and the two indent rules use `calc(var(--space-xl) * …)` on `.folder-chevron` and the row's `.file-icon`. Add no `:hover` rule (the count of 3 is pinned) and no transition or transform.
- `src/renderer/ui/a11y/fold-key.ts` -- reused as is. `ArrowLeft` cannot appear outside `a11y/` (`tests/accessibility.test.ts:146,509`). `rowMove` is unchanged (`row-nav.test.ts:23-27`).
- `src/renderer/ui/layout/*`, `src/main/fold/layout.ts` -- unchanged: the folded set is still `Set<dir>`.
- Tests to amend on purpose:
  - `row-groups.test.ts`: rewrite for `buildTree`.
  - `outputs.test.tsx:66-82,175-182,202-216`: names, order, and the `role=`/`title=`/`style=` absence, which now allows the heading wrapper, the title and the depth style.
  - `outputs-fold.dom.test.tsx:86-316`: heading text is now the name, `aria-controls` points to the branch, and the "is flat" test is inverted into "a parent fold hides the subtree and keeps the child folds". Plus the visual order and the deep `changing` case.
  - `outputs-focus.test.tsx:132-337`: order and keys.
  - `tests/layout-contract.test.tsx:158-197`: the heading markup regexes.
  - `src/renderer/ui/shell/negative-surface.test.tsx:97`.
  - `app.test.tsx:3388,3480-3527`: under a tree, folding `_bmad/` hides `ux/`.
  - `tests/outputs-contract.test.ts:136-164`: exempt `role="heading"`, `title={dir}` and the depth `style` by exact text. `:64-69` and `tests/run-note-feed.test.ts:513-530` need the declared token.
  - `tests/negative-surface.test.ts:1442-1451`: a named `title=` exemption for `folder-heading.tsx`. `:316-345`: the sort count.
  - `tests/tokens.test.ts:~909`: re-pin the digest for `--tree-depth`.
- `_bmad/planning-artifacts/epics.md` (Story 5.5, UX-DR18) -- add dated notes that the groups now nest. `EXPERIENCE.md` *The tree* and `DESIGN.md` *Folder heading* are only checked against what is built.

## Tasks & Acceptance

**Execution:**
- [x] `row-groups.ts` and its test -- red tests for nesting, order, the no-files root, no compaction, and `hasChanging` at depth, then `buildTree` -- matrix rows Nesting, Order, No files
- [x] `folder-heading.tsx` -- name, title, and the heading wrapper with its level
- [x] `outputs.tsx`, `outputs.css` -- recursive render, branch fold, indent, `←` to the parent, and focus on removal -- matrix rows Parent fold to Focused row leaves
- [x] `outputs-fold.dom.test.tsx`, `outputs-focus.test.tsx`, `outputs.test.tsx` -- amended and new cases: parent fold keeps child folds, deep `changing`, `←` to the parent, old stored set, arrival under a fold, focus on removal
- [x] `app.test.tsx`, `tests/layout-contract.test.tsx`, `tests/outputs-contract.test.ts`, `tests/negative-surface.test.ts`, `src/renderer/ui/shell/negative-surface.test.tsx`, `tests/tokens.test.ts`, `tests/run-note-feed.test.ts` -- amend the pins
- [x] `epics.md` -- dated notes on Story 5.5 and UX-DR18

**Acceptance Criteria:**
- Given the full suite, when run, then every test passes and the only removed assertions are flat-group assertions replaced by their tree equivalents.
- Given the running app on this repo, when the rail is read, then `_bmad/` › `planning-artifacts/` › `ux-designs/` › … nest by indent, and folding `planning-artifacts/` hides everything under it.

## Implementation Notes

- `src/renderer/ui/shell/shell.test.tsx` also assumed flat groups and was amended. `tests/run-note-feed.test.ts` and `shell/negative-surface.test.tsx` pass unchanged.
- `EXPERIENCE.md` *The tree* and `DESIGN.md` *Folder heading* were checked against the build and match; neither was edited.
- After review, the list forgets its focused entry on blur only when focus moved elsewhere in this window, so a background removal still hands focus on.

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter, edge-case-hunter, verification-gap). The first launch of edge-case and verification-gap could not read a diff in the system temp dir (sandbox), so it was re-run on an in-project copy under `.omc/review/`. The blind hunter read the working-tree diff.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | blind, edge | A window blur (`relatedTarget` null, target connected) clears `focusedKey`, so a focused row removed in the background leaves focus on `body` | medium | `outputs.tsx` onBlur clears on `to === null`, and Chromium fires element blur on window deactivation | patch |
| 2 | verification | The removal hand-off is tested only in jsdom, which fires no blur on removal | maybe-false (medium) | settle by hand in the running app: focus a row, delete its file, focus lands on the parent heading | defer |
| 3 | edge | The last row leaving draws the empty state and focus falls to `body` | low | there is no list left to hold focus; it was so before this story too (no removal hand-off existed) | defer |
| 4 | blind | `hasChanging` walks every subtree on every render | low | only read while folded; the fix is a direct correction | patch |
| 5 | blind | Stale `outputs.css` heading comment; the `epics.md` note says `aria-level` "is its depth"; a doubled blank line | low | the comment still names the path; the level is 4 + depth | patch |
| 6 | blind | `aria-level` past 6 | false | ARIA allows any positive integer on `role="heading"`; level 4 + depth is the owner-approved decision | reject |
| 7 | blind | A stored root fold now hides the whole tree | false | the frozen intent: entries are "honoured as they are" and a fold hides everything beneath it | reject |
| 8 | blind | Branch ids renumber when a fold changes | low | `aria-controls` and `id` change in the same commit, so they never disagree; paths may hold spaces, which rule them out as ids | reject |
| 9 | blind | `remember(key)` makes a new ref callback each render | false | the same per-render ref pattern as before this story; the map is consistent after each commit | reject |
| 10 | blind, edge | The indent is unbounded at depth | low | DESIGN accepts an ellipsis; the deepest folder here is 7 levels; a cap adds a new size | reject |
| 11 | blind, edge | `buildTree` doesn't check the root's trailing `/` or empty segments | false | `output-folder.ts`: a folder is "spelled with a trailing `/`"; row paths are the watcher's normalised POSIX paths | reject |
| 12 | blind | `hasRows` and `tree === null` repeat the empty check; `showing` belongs in `row-groups.ts` | low | redundant but harmless; no named harm | reject |
| 13 | edge | `useMemo` on `snapshot` identity saves nothing | low | a new snapshot is a new revision; the cost is a few hundred rows | reject |
| 14 | blind | Unrelated `epic-9-context.md` and `sprint-status.yaml` changes bundled in | false | the context was regenerated by this workflow (stale); the sprint comment was folded in at the user's request | reject |
| 15 | blind, verification | Task list names `tests/run-note-feed.test.ts` and `shell/negative-surface.test.tsx`, which were not changed; `shell.test.tsx` was | false | both pass unchanged (the declared token satisfies one; `title` follows `aria-controls` for the other); the fix would edit the spec | reject |
| 16 | blind | Test gaps: `→` on a folded nested heading, the computed indent | low | `→` is the unchanged `setFolded` path, tested at the root; jsdom computes no layout | reject |

## Verification

**Commands:**
- `npx vitest run --project unit src/renderer/ui/outputs tests/` while iterating, then `npm test` -- expected: all green
- `npm run typecheck` and `npm run lint` -- expected: no errors, no warnings
