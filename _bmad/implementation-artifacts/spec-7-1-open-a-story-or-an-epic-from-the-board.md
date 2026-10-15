---
title: 'Open a story or an epic from the Board'
type: 'feature'
created: '2026-10-15'
status: 'done'
baseline_revision: 'fe0852395c57648e1b976ef09873680dfa86d9c3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-7-context.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** A Board card or epic row names a story or epic but cannot open the file that holds it; the user hunts for it in the rail.

**Approach:** Main resolves each story's and epic's file from a listing of `implementation-artifacts/` and carries it as optional `file` on `BoardStory` / `BoardEpic`. The renderer makes only a card or row that carries a `file` a native button that passes it to `doc.open` unchanged, and returns focus to it when the document window closes.

## Boundaries & Constraints

**Always:** A story's file is the one file named `spec-<epic>-<story>-*.md` directly in `<folder>implementation-artifacts/`, matched by number (the key's own slug is ignored); zero or several matches = no file. An epic's file is `epic-<n>-context.md` only. Paths are project-relative POSIX (`<folder>implementation-artifacts/<name>`). Resolved in main on each Board read and re-read when the watcher observes any `.md` directly in that directory. `file` is additive (`CONTRACT_VERSION` unchanged). A card/row with a file is `li > button type="button"` (native, in tab order, global focus ring, `cursor: pointer`, no icon, count, hover reveal or colour of its own); one without is exactly today's text. Focus returns to the opener when its document window closes, and the rail does not steal that focus. Tokens only.

**Never:** A path built, joined or guessed in the renderer; a path shown on a card; a file for a column, figure, `others` row or retrospective; an owner, pulse or elapsed on a card; a write into the project; a new channel, command, event or bridge method; a link from the chat to the Board.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Key differs from file | key `5-2-…the-system-s-theme`, listing has `spec-5-2-…-the-systems-theme.md` | story 5.2 carries that path | N/A |
| No file | key `2-14-…`, no `spec-2-14-*` | no `file` | N/A |
| Several files | two `spec-3-1-*.md` | no `file` | N/A |
| Number prefix | `spec-1-10-x.md` only | story 1.1 has none; 1.10 has it | N/A |
| Epic | `epic-6-context.md` listed | epic 6 carries it; `epic-6-retro-*` ignored | N/A |
| Listing fails | readdir throws | every `file` absent, Board unchanged | swallowed, never rejects |
| Gone or outside | path vanished / real path escapes | document window opens `missing` / `refused` as from the rail | Board changes nothing |

</intent-contract>

## Code Map

- `src/shared/board.ts` -- add `file?: string` to `BoardStory` and `BoardEpic`.
- `src/main/fold/sprint-status.ts:94` -- `foldSprintStatus(read, titles)`: add optional third arg `files` (`{ dir, names }`); set `file` on stories (`placed`) and epics.
- `src/main/fold/board-files.ts` (+ test) -- NEW pure `storyFileOf` / `epicFileOf` over a name list.
- `src/main/sources/project/read-sprint-status.ts` -- add `readArtifactNames(projectRoot, folder)`: `readdir`, non-directories, `[]` on any error; read-only.
- `src/main/board-bridge.ts:76,181` -- `load()` lists names beside the two reads (`readNames` dep, injectable); `observeArtifact` also schedules for a `.md` directly under `<folder>implementation-artifacts/`.
- `src/main/projections/board.ts` -- unchanged: JSON key already makes a `file` change a new revision.
- `src/renderer/ui/outputs/use-doc-open.ts` -- `useDocOpen`: record which instance opened each path (module-level map); only the opening instance runs `onClosed` (unknown opener = every instance, as now), so a Board open does not pull focus to a rail row of the same path.
- `src/renderer/ui/board/board-view.tsx` -- hold button refs by path; `useDocOpen(returnFocus)`; draw `li > button.board-card-open` / `.board-epic-open` when `file` is set. `epicRowsOf` (`board-figures.ts`) must carry `file`; `columnsOf` already passes stories through.
- `src/renderer/ui/shell/shell.css:265,368` -- `.board-card-open`, `.board-epic-open` (button reset, fill the li, `cursor: pointer`); the li keeps its padding.
- Tests to narrow/extend: `tests/board-audit.dom.test.tsx` (`no control … tab stop` stays for file-less cases; add a file case), `tests/tokens.test.ts:1580` (allow `cursor: pointer` on the two open rules only), `src/renderer/ui/shell/negative-surface.test.tsx`, `src/main/board-bridge.test.ts`, `src/main/board-audit.test.ts` (write audit over the listing), `sprint-status.test.ts`, `board-view.test.tsx`, `use-doc-open.test.ts`, `tests/contract.test.ts`.
- Docs (amend, dated 2026-10-15, Story 7.1): `ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md` (Board row ~769, ~797; keyboard table ~1144 gains the Board card/row; *Banned here*) and `DESIGN.md` (Story card, Epics rows ~1197-1198; keyboard list ~1028).

## Tasks & Acceptance

**Execution:**
- `src/shared/board.ts`, `fold/board-files.ts`, `fold/sprint-status.ts` -- type, pure resolution, fold -- matches by number
- `read-sprint-status.ts`, `board-bridge.ts` -- list names, pass to fold, re-read on `.md` changes in the directory -- main alone resolves
- `use-doc-open.ts`, `board-view.tsx`, `board-figures.ts`, `shell.css` -- buttons, refs, focus return, styles
- Tests and both UX docs per Code Map, including a test from this repository's real listing that 5.2 resolves, 2.14 does not and 6.8 has no row

**Acceptance Criteria:**
- Given a Board built from this repo's real `sprint-status.yaml` and listing, then each story matching exactly one `spec-<epic>-<story>-*.md` carries its path, others none, and 5.2 resolves, 2.14 does not
- Given an epic with `epic-<n>-context.md`, then its row carries it, else none
- Given a card or row with a path, when activated by pointer, `Enter` or `Space`, then `doc.open` is called with that exact path and, when the window closes, focus returns to it
- Given a card or row with no path or an `others` row, then it is plain text: no handler, tab stop or cursor, and nothing says why; a test fails if one has any
- Given any interaction, then `sprint-status.yaml` is byte-identical and nothing is written into the project

## Spec Change Log

## Review Triage Log

### 2026-10-15 — Review pass
- verdicts: 13 rows (findings grouped by claim) — high 0, medium 1, low 8, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` button does not fill the card/row, so padding is a dead zone and the focus ring hugs the text (blind, edge-case, verification-gap; one root cause) — card/row padding moved inside the button via `:has(> …-open)` rules; button radius set; tokens test updated
  - `[low]` `[patch]` every `.md` written in `implementation-artifacts/` re-reads the Board — bridge now matches only `spec-<n>-<n>-*.md` and `epic-<n>-context.md`
  - `[low]` `[reject]` Enter/Space test presses no key — native button; jsdom does not synthesise key-to-click; no behaviour to guard
  - `[low]` `[reject]` tautological `li` tabIndex test — the sweep of handlers and `tabindex` attributes beside it already holds the claim
  - `[false]` `[reject]` accessible name run together (`Epic 21 of 7…`) — spans are flex items, blockified, so name computation separates them; the text was plain before
  - `[false]` `[reject]` stale opener ownership if an open fails — a close event only arrives for a window that opened; the next open overwrites the entry
  - `[low]` `[reject]` no focus fallback when the opener is gone or the Board is hidden — opener is on the visible Board when the window opens; a vanished card needs its file to vanish mid-window; not worth a branch
  - `[low]` `[reject]` ref callback recreated per render — detach then attach in one commit; correct
  - `[low]` `[reject]` listing and titles read sequentially — negligible latency, no harm named
  - `[false]` `[reject]` listing failure silent / symlink counted as a file — spec says swallowed; a symlink out of the folder opens the window `refused` via `resolveDocument`
  - `[low]` `[reject]` import order, duplicate import, regex-fragile contract test, test title wording — hygiene without a named harm
  - `[low]` `[reject]` two cards sharing one path, `readNames` throwing synchronously, several matching specs silent — duplicate numbers or an injected dep throwing are not reachable in the product; several-match is the specified rule
  - `[false]` `[reject]` intent-alignment divergences (no real-window test of `refused`/`missing`, key press, ring) — `doc-bridge` and `resolveDocument` are unchanged and covered by their own tests; the report is descriptive and found no divergent reading

## Design Notes

The Outputs rail also subscribes to `onDocClosed` and focuses a row with the same path; Board-opened specs sit under `implementation-artifacts/` so the rail may show them. Ownership by opener (not by path) keeps each surface's focus its own.

## Verification

**Commands:**
- `npm test` -- expected: all pass
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean

**Manual checks (if no CLI):**
- Board: a card with a spec focuses by `Tab`, opens the document window, and focus returns to it on close; a backlog story with no file is not focusable.

## Auto Run Result

Status: done
Commit note: the pre-commit hook (`npm test`) rejected a normal commit on `tests/tokens.test.ts > carries the status dot and the persona tile` (`--tile-height` 56px vs DESIGN.md 44px, a Story 7.7 change already in HEAD's DESIGN.md; it fails identically without this change). The owner chose to commit with `--no-verify`.

**Summary.** A Board story card or epic row whose markdown file exists is now a native button that opens it in the document window; every other card or row stays plain text. Main resolves each file by number from a listing of `implementation-artifacts/` and carries it as optional `file` on `BoardStory` / `BoardEpic`; the renderer passes it unchanged to `doc.open` and returns focus to the opener on close, with the rail no longer taking that focus.

**Files changed.**
- `src/shared/board.ts` -- optional `file` on story and epic
- `src/main/fold/board-files.ts`, `fold/sprint-status.ts` -- resolve by number; set `file`
- `src/main/sources/project/read-sprint-status.ts`, `board-bridge.ts` -- read-only directory listing; re-read on a spec or epic-context file arriving or going
- `src/renderer/ui/outputs/use-doc-open.ts` -- opener-owned close handling
- `src/renderer/ui/board/board-view.tsx`, `board-figures.ts`, `shell/shell.css` -- buttons, refs, styles
- Tests (new and narrowed from Story 6.9's) and `EXPERIENCE.md` / `DESIGN.md` amended 2026-10-15

**Review.** Patches applied: 2 (1 medium, 1 low). Deferred: 0. Rejected: all other findings, with reasons in the triage log.

**Follow-up review recommended:** false (no high patched, fewer than two mediums).

**Verification.** `npm run typecheck` and `npm run lint` clean. `npm test`: 5622 passed, 1 failed (`tests/tokens.test.ts > carries the status dot and the persona tile` expects `--tile-height` 44px, the stylesheet has 56px; DESIGN.md was already set to 44px by the Story 7.7 planning commit and the CSS follows with Story 7.7, so it fails identically without this change). `vitest --project watchers`: 64 passed (the `npm test` chain stops before it when the unit project fails, so it was run directly).

**Residual risks.** The app was not run: Tab, open and focus return in the real window are untested outside jsdom. The pre-existing 7.7 token test failure remains until that story lands.
