# Epic 6 Context: The room as a Board

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Add a third shell view, the Board: a read-only picture of where the work stands, read from the project's own `sprint-status.yaml`. It shows every story in a column by BMad status, each epic as `n of m stories done`, who is working and on what, and what personas did recently. The Board never steers (no recommended story, no unread counts, no money) and writes nothing.

## Stories

- Story 6.1: What a run knows about its story (spike)
- Story 6.2: The sprint status, read once in main
- Story 6.3: The Board, a third view
- Story 6.4: Every story, in its column
- Story 6.5: How far each epic is, in words
- Story 6.6: Who is on what
- Story 6.7: What the personas did, newest first
- Story 6.8: The persona on a story (cut 2026-10-10)
- Story 6.9: Nothing this epic promised not to do

## Requirements & Constraints

- The Board is disk truth: it reads `sprint-status.yaml` plus sessions and writes nothing. No drag, status control, *New story*, approval or retry.
- Statuses: `backlog`, `ready-for-dev`, `in-progress`, `review`, `done` (plus `optional`). Columns use the file's words, in that order, no counts, no empty-state text. An unrecognised status degrades to one extra column after `done`; nothing is dropped and nothing throws. A missing or unreadable file reads `no sprint status` with the watched path (no error dialog); the file appearing later fills the Board without restart.
- Overview is two figures only (agents running = personas in `work`; stories in progress). Epic rows are text, `n of m stories done`, with no bar, meter, percentage or colour. Retrospective keys count in neither. A `done` epic's stories draw no cards; its row remains.
- Negative surface: no money, spend, token or tool-call figures; no relative times (`4m ago`); no count/badge/dot on the view switch; no recommended or "needs you" marker; no Inbox or "decisions open" figure, and no reserved slot for them (deferred). Times are absolute and read the same live and after a relaunch.
- No story owner: Story 6.8 was cut 2026-10-10 because no run-to-story rule could be shown never to mislead (a wrong owner is worse than none), and FR123 was amended in `epics.md`. The cut form is the Agents panel (6.6). A card is its number and title and is not a control.
- Layout: at ≤1000px the Board scrolls as a column; no per-column scroll; no breakpoint added. State changes appear in the same frame, with no animation, no announcement, and no focus or scroll shift. A launch always opens on 1:1; the current view is not persisted.
- Cards and agent rows are not controls. Shared focus ring on `:focus-visible` only.
- Elapsed times tick at least once a second. Styles use tokens only (no literal colours or dimensions) and add no new motion declarations.

## Technical Decisions

- AD-1: nothing is written into the project; persistence lives under Electron `userData`. A test must show `sprint-status.yaml` is byte-identical after the Board's life.
- Built (6.2): pure fold in `src/main/fold/` (`sprint-status.ts`, `epic-titles.ts`) turns the file text into one snapshot (epics, then stories, in file order; keys `epic-N`, `N-M-<slug>`, `epic-N-retrospective`; other keys kept as unrecognised rows; other top-level keys, `action_items` and timestamps ignored). Titles come from `epics.md` headings, else the key's slug with hyphens as spaces, never completed. Reader is `src/main/sources/project/read-sprint-status.ts`, opening only that file; the rail watcher stays stat-only. Tests use the committed copy in `fixtures/sprint-status/`, not the live file.
- Contract (6.2): event `board:changed` (snapshot, coalesced once per revision) and read `board.get`, declared in `src/shared/`, enumerated in `src/shared/channels.ts`, pinned in contract tests; no generic `invoke(channel, …)`. `layering.test.ts` must keep passing: fold in `fold/`, reader in `sources/`, nothing in `ui/` reaching either.
- Built (6.3): `VIEWS` in `view.ts` lists three views; the Board section stays mounted and `hidden` when not current, fed by `useBoard` (renderer, `src/renderer/ui/board/`) over the existing bridge. The chord is `g` then `b` within one second, ignored while a field has focus, and is the only chord. Pinned tests were amended to the new count, not their intent.
- Built (6.4, 6.5): renderer-only, no change to `src/shared/` or main. `board-columns.ts` and `board-figures.ts` in `src/renderer/ui/board/` derive columns, overview figures and epic rows from the snapshot; `BoardOther` rows and retrospective keys draw no card (so the 6.2 stray-retrospective case is hidden, not shown). Board styles live in `shell.css` (`.board-*`); `tests/tokens.test.ts` and `tests/negative-surface.test.ts` already guard them (no literal values, no transition/animation, `--faint` only on labels, figures at `--dim` or above), so extend those rule selectors for any new `.board-*` class.
- Agents panel (6.6) reads `persona:state` and the elapsed projection (AD-20: indicators come from real state only), the stored runs and the roster order; no new event or projection. One row per persona, aggregating its sessions as the tile does.
- Recent activity (6.7) is folded in the renderer from the window's run entries, which hold the live runs and the stored ones restored on launch (main applies `deadOf` first), so no event, channel or projection is added (as 6.6). Stored runs are `StoredRun { card, lastAt }` under `userData`. Each run gives a start row and, when ended, a finished/stopped/failed row; newest 20; a run cut off by relaunch reads as failed at the time last heard of; party sessions raise no row. `StoredRun` is enough (the spike confirms). No cap on stored runs exists and the file grows with every run, so read newest-first and show a fixed window. Time formatting is one renderer function (`MM-DD HH:MM`, machine zone). Run `steps` (≤300) and `skill` change no row and are not owner evidence.
- Run-to-story spike (`_bmad/spikes/spike-run-to-story.md`) is only partly answered: all three candidate rules assigned 0 of 11 recorded runs, and the real run history under `userData` was not read, so accuracy is unmeasured. Candidate sentence: a run's story is the story key in the file name of the last document on its card whose path is `spec-<epic>-<n>-<slug>.md`; otherwise none. It is computable from the stored card with no new field, but blind to documents written through Bash. The sprint-status-write rule needs a new stored field; the user-turn rule is not on the card. Open: score the rule against real history, and decide whether the heredoc-aware document interpreter should come first.
- Open from 6.2 review: a retrospective key whose epic has no row (e.g. `epic-9-retrospective` without `epic-9`) lands among the unrecognised rows, and 6.4 must hide it or accept it. A file written without pause is not re-read until writes stop; titles come only from `planning-artifacts/epics.md` (a sharded epics folder gives slug titles).

## UX & Interaction Patterns

- View switch: three native buttons (`1:1 Conversation`, `Party Mode`, `Board`), one pressed. The Board fills the body in one frame; switching views leaves sessions, runs, scroll and follow state untouched.
- Regions: overview (two cells), story board by status, epics, agents, recent activity. Column headings are `micro` uppercase `faint`; story card shows number in mono plus title; epic row shows `Epic N`, title, and `n of m stories done` at right in mono.
- Agents row: portrait, name and title, state dot and word as the tile; a persona on a run shows run `code`, document path and elapsed in mono; a persona in a non-run turn says `in a turn`; idle dims (`--opacity-idle`).
- Activity row dot: `work` for a start (the only pulsing one, while in flight), `error` for stopped/failed, idle for finished.
- Mockup `paperclip-board.html` illustrates only; its bars, spend card, gate pill, *needs you* and *next* lines, relative times, Inbox count and *New story* are not adopted.

## Cross-Story Dependencies

- 6.1 to 6.7 are done and 6.8 is cut. 6.9 is done: it audited every region (including the planning docs naming the Inbox as deferred and the overview as two cells).
- Depends on earlier epics: persona state and tiles (Epics 1 and 2), run cards, steps and stored runs (Epic 3), and the rail's artifact watcher (Epic 5).
- Outside this epic: the Team sidebar's *Sprint board* row belongs to the three-column layout work; the Inbox is deferred.
