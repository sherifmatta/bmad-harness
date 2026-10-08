---
title: 'What the room is about, on screen'
type: 'feature'
created: '2026-10-08'
baseline_revision: '200db2ed0fd31cf5e59a588db5b556562aa7a053'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 4.3 (epics.md "What the room is about, on screen", FR67, FR69). A live room has a cast strip, a thread and a composer, but nothing says what it is about, who opened it and when, which documents are in reach, where its summary will land, how many are in it, how many turns it has had or how long it has run; there is no header and no side panel.

**Approach:** Add a party header (topic, participant count, turn counter with elapsed time, *Write summary to `_bmad/`*) above the cast strip, and a 240px side panel holding the *Room* section only (topic, opened by, context, writes to), beside the strip/thread/composer column. Every fact is one the renderer already holds or can derive: the room's `session:opened` time, the user's own first message, the rail's rows, the cast, the transcript. No main, contract or bridge change.

## Boundaries & Constraints

**Always:**
- Command and event counts stay 7 / 15, channels 22, preload methods 17; no main-side change, no new name or argument shape. State gains `roomOpenedAt: number | undefined` (epoch ms: the room's `session:opened` `at`; when the open's reply is first, the conversation's `now()`; the first of the two stands) and `roomTopic: string | undefined`; both set only for a live room, cleared by the room's `session:closed` and by `ended()`, exactly where `roomCast` is.
- **Topic** is the user's own first message into the room, verbatim but for shape: first non-blank line, whitespace runs collapsed to one space, trimmed, cut to 80 characters. It is set by `roomSent` when `roomTopic` is `undefined` and never again for that room. Reading selected by `.claude/skills/bmad-party-mode/SKILL.md` ("The opening prompt is a topic to dig into") and by the epic's "all harness-known, requiring no data source that does not exist"; the chooser gains no field. No topic yet reads `no topic yet` in the header and `none yet` in the panel; the harness never invents, completes or summarises one.
- **Destination** is a pure helper in new `src/shared/room-destination.ts` (Story 4.4 reuses it): `roomDestination(openedAt, topic)` = `_bmad/party/<YYYY-MM-DD>-<slug>.md`, date the local calendar day of `openedAt`, slug the topic lower-cased, runs of non `a-z0-9` characters as one `-`, edge hyphens trimmed, cut to 48 characters then edge hyphens trimmed again. An empty slug (no topic, or one with no `a-z0-9`) leaves the literal `<topic>` in its place (`_bmad/party/2026-10-08-<topic>.md`). It is shown from the room's first moment, before any summary exists.
- **Turn counter**: the number of room persona entries with `at >= roomOpenedAt` (`roomTurnsOf(state)`, pure, beside `speakerOf`); a user message is not a turn. **Elapsed**: `formatElapsed(now - roomOpenedAt)` re-read each second by `useNow(1000)` in its own component (the status dot's `COUNTER_TICK_MS`, reused if exported), never announced, in no live region. The two sit in one chip `turn <n> · <elapsed>`.
- **Header** (`renderer/ui/party/party-header.tsx`, drawn only while a room is live, above the cast strip across the full width): the topic (single line, ellipsised), a chip `<n> participants` (`1 participant`; n = `roomCast.length`), the turn chip, and a native `<button>` *Write summary to `_bmad/`* with the shared `:focus-visible` ring. The button's handler is an optional prop `onWriteSummary`, which this story's `App` does not pass: with none the button is `disabled` (Story 4.4 supplies it). No *Pause room*, no disagreement chip, no title.
- **Side panel** (`renderer/ui/party/room-panel.tsx`, an `<aside aria-label="room">` of width `--party-side` (240px), left rule, `--panel` ground): exactly one section, headed `Room`, of four key/value rows on a `--party-side-key` (74px) mono key column: `topic`, `opened` (`HH:MM by you`, `formatTurnTime(openedAt)`), `context`, `writes to` (the destination). `context` lists the project-relative path of every rail row without `room: true`, one per line, in rail order, the section scrolling inside the panel when long; none reads `none`. The panel is a sibling of the strip/thread/composer column, drawn only while a room is live. It reserves no slot, container or heading for any other section.
- **Layout**: `party-view` becomes header, then a row of the existing column (strip, scroll region, composer) and the panel. Thread max stays `--party-thread-max` (900px). At window width <=1180px the panel is hidden outright (the existing `.party-side` rule in `shell.css` is the one breakpoint; class `party-side` is the panel's); no third breakpoint, no `288` anywhere. Needed literals (header and panel paddings, key column width, row gaps) become tokens in `design/tokens.css` and the `tests/tokens.test.ts` list; no literal in a component stylesheet.
- Harness microcopy lower case, mono, `·`-separated, no terminal punctuation, facts not guidance. Persona-supplied and project-supplied strings (topic, paths) render as React text. Tokens only, no spinner, skeleton, badge or count chip semantics, sound, `aria-live` or `role=status`; the one polite region stays the only one; no motion added, reduced motion untouched.

**Never:**
- No summary write, no command or turn for it, no handler for the button (4.4); no stop control or room-end change (4.5); no `@` logic. No *Open disagreements*, *Decisions so far*, `disagrees`/`evidence`/`unresolved` string or any empty state or reserved slot for them. No 288px, no *Pause room*. No harness-authored or summarised words about what the room concluded; the topic is the user's text. No new command, event, channel or preload method; no reading `config.toml`/`customize.toml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Room just opened | `session:opened` at 14:31, cast of 5, no message | header `no topic yet`, `5 participants`, `turn 0 · 0s`; panel topic `none yet`, `opened 14:31 by you`, writes to `_bmad/party/<date>-<topic>.md` | none |
| First message | user sends `  Payouts —\nextend billing-svc?  ` | topic `Payouts —`, header and panel show it; writes to `…-payouts.md`; later messages leave it | none |
| Long first line | 200 characters | topic cut to 80; slug cut to 48, no trailing `-` | none |
| No slug | first message `🎉🎉` | topic `🎉🎉`; destination keeps `<topic>` | none |
| Turns | three room persona entries, two older-room entries | `turn 3` | none |
| Elapsed | room open 65s | `turn 3 · 1m 05s`, ticking each second | none |
| Context | rail rows `_bmad/PRD.md`, a `room: true` row | `_bmad/PRD.md` only; no rows reads `none` | none |
| Room closes | `session:closed` / end-session | header and panel gone; topic, opened-at cleared | none |
| Narrow window | width <=1180px | panel hidden, header stays | none |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/conversation-state.ts:30-60,280-350,560-585` -- `ConversationState`/`initialConversation` (add `roomOpenedAt`, `roomTopic`), `ended`, `roomReady` (gains the open time), `roomSent` (sets the topic), `speakerOf` (beside it: `roomTurnsOf`), `foldEvent` `session:opened` (`event.payload.at`) and `session:closed` (clear).
- `src/renderer/ui/chat/use-conversation.ts:256-285,489-500,568-619` -- `openTheRoom` passes `now()` to `roomReady`; `Conversation` hook result gains `roomOpenedAt`, `roomTopic`, `roomTurns`.
- `src/shared/room-destination.ts` (new, + test) -- pure `roomTopicOf(text)`, `roomSlug`, `roomDestination`; the layering test allows `shared/` imports from the renderer.
- `src/renderer/ui/party/party-view.tsx`, `party-view.css` -- header above, row of column + panel; props gain `topic`, `openedAt`, `turns`, `rows`; reuse `formatTurnTime` (`chat/format-turn-time.ts`), `formatElapsed` (`status/format-elapsed.ts`), `useNow` (`outputs/use-now.ts`, as `status/status-dot.tsx:30` uses it).
- `src/renderer/ui/party/party-header.tsx` + `.css`, `room-panel.tsx` + `.css` (new, + dom tests) -- the header and the Room panel; chip and button styling in the neighbouring tokens (`chat/chat-header.css`, `chat/chat-close` for the ghost button).
- `src/renderer/ui/app.tsx:62-70,267-278` -- supplies `rail?.rows` (from `useRail`), `conversation.roomTopic/roomOpenedAt/roomTurns` to `PartyView`; passes no `onWriteSummary`.
- `src/renderer/ui/shell/shell.css:292-296` -- the existing `.party-side` rule at <=1180px (keep; the panel takes that class); `:194` `.view-party`.
- `src/renderer/design/tokens.css:175-190` -- `--party-thread-max`, `--party-side` (240px) exist; add the key-column, padding and gap tokens beside them; `tests/tokens.test.ts:368-387` list.
- `src/shared/rail.ts` -- `RailRow.path` (project-relative POSIX) and `room?: true`, read-only.
- Pins that change deliberately: `tests/party-contract.test.ts` (party file set; add a tripwire: no party file contains `disagree`, `Decisions so far`, `288`, `Pause`, no `aria-live`/`role` in header or panel, the panel has exactly one heading), `tests/negative-surface.test.ts` (`ConversationState` field list ~`:1327`), `tests/shell-contract.test.ts` (`party-side` mentions), `tests/tokens.test.ts`, `use-conversation.test.ts`, `conversation-state.test.ts`, `party-view.test.tsx`/`.dom.test.tsx`.
- Read-only evidence: `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md:482-500` (240px, 74px key column, <=1180 hides), `EXPERIENCE.md:440-450` (header and Room rows), `_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html:270-274,320-328,573-583,683-689` (header and `.kv` styling, row labels `topic`/`opened`/`context`/`writes to`), `.claude/skills/bmad-party-mode/SKILL.md` (step 6, "How It Runs").

## Tasks & Acceptance

**Execution:**
- `src/shared/room-destination.ts` (+test) -- `roomTopicOf`, `roomSlug`, `roomDestination` -- the destination path and topic shape, one definition for 4.3 and 4.4.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` (+tests) -- `roomOpenedAt`, `roomTopic`, `roomTurnsOf`, clearing on close and end -- the facts the header and panel read.
- `src/renderer/ui/party/party-header.tsx`, `room-panel.tsx`, css, `party-view.tsx`, `party-view.css` (+dom tests) -- header, panel, layout, disabled summary button.
- `src/renderer/ui/app.tsx` -- pass the rail rows and room facts.
- `src/renderer/design/tokens.css`, `tests/tokens.test.ts` -- new layout tokens.
- Pins listed in the Code Map -- updated; counts stay 7/15/22/17; the new tripwire.
- Tests for every matrix row (helper unit tests for slug cut, empty slug, local date; state tests for topic-once, clear on close/end, turn count older rooms excluded; DOM tests for header, panel rows, one heading, hidden at <=1180 via the stylesheet rule).

**Acceptance Criteria:**
- Given a live room, when it is on screen, then the header shows the topic (or `no topic yet`), the participant count, `turn <n> · <elapsed>` and a *Write summary to `_bmad/`* button, with no pause control and no disagreement chip.
- Given a live room, when it is on screen, then a 240px side panel shows the *Room* section only, with topic, `opened HH:MM by you`, the context documents (rail rows without `room`) and the destination `_bmad/party/<date>-<topic-slug>.md` from the room's first moment, and nothing else renders in or reserves room in it.
- Given a room with no topic, when the user sends their first message into it, then it becomes the topic and the destination slug follows it; later messages change neither.
- Given a live room, when the window is at or below 1180px wide, then the panel is hidden outright; the party transcript stays constrained to 900px.
- Given a live room, when it closes or the conversation ends, then the header, panel and their state are gone.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 27 findings (blind 10, edge 13, verification-gap 2 plus 1 other, intent-alignment 1 descriptive) — high 0, medium 1, low 25, false 1, maybe-false 0; rows below group members that share a root
- findings:
  - `[medium]` `patch` the hook's `roomTurns`/`roomOpenedAt`/`roomTopic` and `app.tsx`'s hand-off of them and `rail?.rows` into `PartyView` are asserted by no test, so a live room could read `no topic yet`, `turn 0` or `context none` with everything green (verification-gap) — patched: an `app.test.tsx` case through the real `App`
  - `[low]` `patch` `PartyView`'s forwarding of `rows` and `openedAt` to `RoomPanel` is not pinned (verification-gap) — patched: the existing header-and-panel test gains a non-empty `rows` and the full dated destination
  - `[low]` `reject` the topic ellipsises and, at <=1180px where the panel is hidden, the header is its only place (blind) — a `title` tooltip was tried and removed: the Epic 2 sweep (`tests/negative-surface.test.ts`) bans `title=` anywhere in the renderer; the cut topic is cosmetic
  - `[low]` `reject` turn count and elapsed compare the renderer clock (reply first) with main's `at` (blind, edge x2, verification-gap other) — main and renderer read one machine clock, the reply lands after `session:opened` and before any persona text, so the window in which an entry could predate the stored time holds none; the spec says the first of the two stands
  - `[low]` `reject` `0 participants`, `turn 0` with no elapsed, `by you` with no time, `<date>` when the cast, the open time or the instant is missing (edge x4, blind) — the open's reply always carries the cast and the hook always passes `now()`; none is reachable from the open flow, the guards only keep a bad value from throwing
  - `[low]` `reject` a replaced room without `session:closed` keeps the old topic and time; a room live before the window loaded has none recovered (blind x2) — one room per window (a second open returns the live room), and restoring a live room across reload is the 4.1 residual risk, still Story 4.5's
  - `[low]` `reject` the destination collides for two same-day rooms of one topic, and a non-Latin topic leaves the literal `<topic>` (blind, edge x2) — the contract fixes the name as `<date>-<topic>.md` and `<topic>` for an empty slug; what a write does about collision or an empty slug is Story 4.4's, recorded as a residual risk
  - `[low]` `reject` zero-width characters make an invisible topic; the 80-character cut splits a grapheme cluster; bidi controls are not stripped (blind, edge x3) — rare input, cosmetic harm, and the fix adds a segmenter and character classes
  - `[low]` `reject` a topic set by a message whose send later failed stays the topic (blind, edge) — the failed message's entry also stays in the thread by the 4.2 contract; the topic is that visible text
  - `[low]` `reject` context lists rows still `not-yet-written` or `changing` (edge x2, blind) — the contract says every rail row without `room`; a file in flight is a document in reach a moment later
  - `[low]` `reject` the disabled summary button gives no reason and is a dead control (blind) — the contract disables it until 4.4 gives it a handler; explaining it would be guidance the epic bans
  - `[low]` `reject` `aria-label="room"` lowercase, no cap on the context list, the party sweep's `Pause` match, the `onWriteSummary` pin that 4.4 must change, `COUNTER_TICK_MS` exported from a component file, loose props, `rows ?? []` per render (blind x6) — each is the contract's own wording or a taste, with no harm shown; the 4.4 pin is meant to be edited there
  - `[false]` `reject` intent-alignment: the diff implements the build half of reading A and the commit and close half is not in the diff (descriptive) — "commit and close" is finalisation below: the story is set `done` in the sprint status and committed

## Design Notes

Why the first message is the topic: the harness has no topic field and the epic forbids a data source that does not exist; the party skill treats the opening prompt as the topic and asks for one itself, so the user's own first line is the only topic the harness holds, and it is theirs, not authored. Why the header button is disabled rather than absent: FR67 puts it in the header now and Story 4.4 gives it its handler; absent would make 4.4 reshape the header, a live-looking button that does nothing would lie. Why context is the rail's rows: they are the project documents the harness already watches and the room can read; what the room actually opened is not folded anywhere.

Golden destination: `roomDestination(Date.parse('2026-10-08T14:31:00'), 'Payouts — extend billing-svc, or stand up the ledger now?')` is `_bmad/party/2026-10-08-payouts-extend-billing-svc-or-stand-up-the-ledge.md` (the slug is cut at 48 characters, and a cut that lands on a hyphen drops it).

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Open a room, send a first message: the header and panel read it as the topic, the elapsed time ticks, narrowing the window below 1180px hides the panel. Not verified in an unattended run unless the Electron app is launched.

## Auto Run Result

**Summary:** A live room now has a party header (topic or `no topic yet`, `<n> participants`, `turn <n> · <elapsed>` ticking each second, and a *Write summary to `_bmad/`* button, disabled until Story 4.4 gives it a handler) above the cast strip, and a 240px side panel holding the *Room* section only (topic, `opened HH:MM by you`, context = the rail's rows the room did not write, and `writes to _bmad/party/<date>-<slug>.md` from the room's first moment). The topic is the user's first message into the room; the panel hides at <=1180px by the shell's existing rule. Renderer and `shared/` only: counts stay 7 / 15 / 22 / 17.

**Files changed:**
- `src/shared/room-destination.ts` (+test) -- `roomTopicOf`, `roomSlug`, `roomDestination`, shared with Story 4.4.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` (+tests) -- `roomOpenedAt`, `roomTopic`, `roomTurnsOf`, cleared on close and end.
- `src/renderer/ui/party/party-header.tsx`, `room-panel.tsx`, css (+dom tests), `party-view.tsx`/`.css` -- header, panel, layout; `app.tsx` passes the room facts and `rail?.rows`.
- `src/renderer/design/tokens.css`, `status/status-dot.tsx` (`COUNTER_TICK_MS` exported) -- party header and panel tokens.
- Pins: `tests/party-contract.test.ts` (new tripwire), `negative-surface.test.ts`, `tokens.test.ts`; `app.test.tsx` gains a wiring case.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 4.3 done.

**Review:** 27 findings across four layers. Patches applied: 2 entries (medium x1, low x1): the live wiring from the hook and `app.tsx` into the header and panel was untested; `PartyView`'s forwarding of `rows` and `openedAt` was unpinned. Deferred: 0. Rejected: the rest, each with its reason in the Review Triage Log (a `title` tooltip for the cut topic was tried and removed: the Epic 2 sweep bans `title=` in the renderer).

**Follow-up review recommended:** false -- one medium entry was patched, and the patches were tests only.

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (166 unit files, 3838 tests; 3 watcher files, 55 tests) and `npm run build` exit 0 after the patches.

**Residual risks:** no Electron launch and no real `claude` party run: the ticking elapsed time and the panel hiding below 1180px in a real window are not seen. The topic is the first thing the user types, so a greeting becomes the topic. Two same-day rooms with one topic share a destination, and a topic with no `a-z0-9` leaves the literal `<topic>`; what a write does about either is Story 4.4's. A room live before a reload has no recovered topic or open time (the 4.1 reload risk, Story 4.5). Context lists rows still being written.
