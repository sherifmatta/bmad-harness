# Epic 6 Context: The room as a Board

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Add a third shell view, the Board: a read-only picture of where the work stands, read from the project's own `sprint-status.yaml`. It shows every story in a column by BMad status, each epic as `n of m stories done`, who is working and on what, and what personas did recently. A story card can show the persona that last worked on it and open that persona's thread. The Board never steers (no recommended story, no unread counts, no money) and writes nothing.

## Stories

- Story 6.1: What a run knows about its story (spike)
- Story 6.2: The sprint status, read once in main
- Story 6.3: The Board, a third view
- Story 6.4: Every story, in its column
- Story 6.5: How far each epic is, in words
- Story 6.6: Who is on what
- Story 6.7: What the personas did, newest first
- Story 6.8: The persona on a story
- Story 6.9: Nothing this epic promised not to do

## Requirements & Constraints

- The Board is disk truth: it reads `sprint-status.yaml` plus sessions and writes nothing. No drag, status control, *New story*, approval or retry.
- Statuses: `backlog`, `ready-for-dev`, `in-progress`, `review`, `done` (plus `optional`). Columns use the file's words, in the file's order, no counts. An unrecognised status degrades to one extra column after `done`; nothing is dropped and nothing throws. A missing or unreadable file reads `no sprint status` (no error dialog); the file appearing later fills the Board without restart.
- Overview is two figures only (agents running = personas in `work`; stories in progress). Epic rows are text, `n of m stories done`, with no bar, meter, percentage or colour. Retrospective keys count in neither.
- Negative surface: no money, spend, token or tool-call figures; no relative times (`4m ago`); no count/badge/dot on the view switch; no recommended or "needs you" marker; no Inbox or "decisions open" figure, and no reserved slot for them (deferred). Times are absolute and read the same live and after a relaunch.
- Owner of a story is derived on every snapshot and stored nowhere. A wrong owner is worse than none; if the spike finds no reliable rule, 6.8 is cut to a persona-row pulse and elapsed time and FR123 is amended.
- Layout: at ≤1000px the Board scrolls as a column; no per-column scroll; no breakpoint added. State changes appear in the same frame, with no animation, no announcement, and no focus or scroll shift. A launch always opens on 1:1; the current view is not persisted.
- Cards and agent rows are not controls, except a card with an owner (6.8), which acts as that persona's tile. Shared focus ring on `:focus-visible` only.
- Elapsed times tick at least once a second. Styles use tokens only (no literal colours or dimensions) and add no new motion declarations.

## Technical Decisions

- AD-1: nothing is written into the project; persistence lives under Electron `userData`. A test must show `sprint-status.yaml` is byte-identical after the Board's life.
- The file has never been parsed before (`src/main/fold/artifact-owner.ts` documents its format). Every story that parses it cites the file it read; tests use a committed fixture copy, not the live file.
- Pure fold in `src/main/fold/` (no file, clock or environment) turns the file text into one snapshot: epics, then stories, in file order. Keys are `epic-N`, `N-M-<slug>`, `epic-N-retrospective`; others are kept as unrecognised rows. Other top-level keys, `action_items` and timestamps are ignored.
- Titles come from `epics.md` headings (`## Epic N:`, `### Story N.M:`); otherwise the key's slug with hyphens as spaces, never completed (slugs can be cut short). Story front matter is not consulted.
- A new reader in `src/main/sources/` opens only that one file. The rail watcher (`watch-artifacts.ts`) stays stat-only and never opens a file.
- One new event `board:changed` (snapshot, coalesced once per revision) and one new read `board.get`, declared once in `src/shared/`, enumerated in `src/shared/channels.ts`, pinned in contract tests; no generic `invoke(channel, …)`. The FR101 tally is amended in 6.2. `layering.test.ts` must pass: fold in `fold/`, reader in `sources/`, nothing in `ui/` reaching either.
- Agents panel reads `persona:state` and the elapsed projection (AD-20: indicators come from real state only), the stored runs and the roster order; no new event or projection. One row per persona, aggregating its sessions as the tile does.
- Recent activity is built in main from stored runs (`StoredRun { card, lastAt }` under `userData`) and carried by `board:changed`. Each run gives a start row and, when ended, a finished/stopped/failed row; newest 20; a run cut off by relaunch reads as failed at the time last heard of; party sessions raise no row. Time formatting is one renderer function (`MM-DD HH:MM`, machine zone). Run cards now carry `steps` (≤300) and `skill`; they change no row and are not owner evidence unless 6.1 adopts one.
- Run-to-story rule is the 6.1 spike's output (`_bmad/spikes/spike-run-to-story.md`): candidate rules are the last written document's path naming a story key, a `sprint-status.yaml` write changing one story, or the story named in the starting user turn. Default: last document naming a story wins. It states a pinnable sentence and whether a field must be added to the stored run. No `src/` changes in the spike.
- Owner precedence (6.8): a run in flight wins, otherwise the run that started last. Activating an owned card does what activating that persona's tile does (view becomes 1:1, session opened or reused, focus lands on the tile).
- 6.3 amends pinned tests that said two views / no shortcut layer: `VIEWS` comment in `view.ts`, FR11, NFR20, `negative-surface.test.tsx`, `shell.test.tsx`, `tests/shell-contract.test.ts`. Change the number pinned, not the intent. The one chord is `g` then `b` within one second, ignored while a field has focus.

## UX & Interaction Patterns

- View switch: three native buttons (`1:1 Conversation`, `Party Mode`, `Board`), one pressed. The Board fills the body in one frame; switching views leaves sessions, runs, scroll and follow state untouched.
- Regions: overview (two cells), story board by status, epics, agents, recent activity. Column headings are `micro` uppercase `faint`; story card shows number in mono plus title; epic row shows `Epic N`, title, and `n of m stories done` at right in mono.
- Agents row: portrait, name and title, state dot and word as the tile; a persona on a run shows run `code`, document path and elapsed in mono; a persona in a non-run turn says `in a turn`; idle dims (`--opacity-idle`).
- Owned card foot: initials disc plus `working · <elapsed>`, amber pulse dot and 1px `accent-border` while a run is on it; ended run shows disc and name only, no time or pulse. An unowned card shows no owner and no placeholder.
- Activity row dot: `work` for a start (the only pulsing one, while in flight), `error` for stopped/failed, idle for finished.
- Mockup `paperclip-board.html` illustrates only; its bars, spend card, gate pill, *needs you* and *next* lines, relative times, Inbox count and *New story* are not adopted.

## Cross-Story Dependencies

- 6.1 is first (no code). 6.2 then 6.3; 6.4, 6.5, 6.6, 6.7 then follow in any order, all needing 6.2 and 6.3. 6.8 needs 6.1 and 6.4, and is the only story depending on 6.1's answer. 6.7 may need a field added to the stored run if 6.1 finds `StoredRun` too thin (added in 6.1's follow-up, not 6.7). 6.9 is last and audits every region.
- Depends on earlier epics: persona state and tiles (Epics 1 and 2), run cards, steps and stored runs (Epic 3), and the rail's artifact watcher (Epic 5).
- Outside this epic: the Team sidebar's *Sprint board* row belongs to the three-column layout work; the Inbox is deferred.
