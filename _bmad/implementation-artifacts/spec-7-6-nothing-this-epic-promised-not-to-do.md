---
title: 'Nothing this epic promised not to do'
type: 'chore'
created: '2026-10-16'
status: 'done'
baseline_revision: 'd9ce99eaad4442f0ba9228f05ab093d9f3834d54'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-7-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      A stale selector, left as found: `.portrait` in `epic-4-audit.dom.test.tsx` no longer matches anything, so its assertions pass trivially.
    evidence: |-
      The portrait was removed by Story 7.7; the 7.7 sweep lives in `tests/initials.test.ts:450`. The spec's Never forbids loosening or editing existing assertions in this story.
    location: >-
      src/renderer/ui/party/epic-4-audit.dom.test.tsx:350
    severity: low
  - summary: >-
      A stale fixture, left as found: the `handed to Ada` sysline text in the chat negative-surface test is a line main no longer writes.
    evidence: |-
      Story 7.4 removed the handoff line; `tests/negative-surface.test.ts:953` pins that main has no producer of it. The regexes that guard handoffs in the same file still hold.
    location: >-
      src/renderer/ui/chat/negative-surface.test.tsx:89
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epic 7 retired four prohibitions on purpose (a card with a file is a control, `/` lists skills, a persona has a seat and a live dot, a chat can have no persona) and kept the rest, but the audits still say what was forbidden before it. Several of the new limits are pinned only per story, by source grep, or not at all (the hostile-markdown fixture through a skill turn, a room's thread against a skill's, a skill run beside a populated Board, the skill-first flag by name and count).

**Approach:** As Epics 1 to 4 and 6 closed, add the audit: mounted-surface tests built from the real folds that say what is now allowed as exactly as they said what was forbidden, the missing main-side and contract pins, and amend `EXPERIENCE.md`, `DESIGN.md` and `epics.md` so they say what was built and what the epic did not build. No feature work: a failing assertion is fixed in the product only if it is a prohibition the epic kept.

## Boundaries & Constraints

**Always:**
- **Built from the real thing.** Snapshots come from `foldSprintStatus` (with the `files` argument, so some stories and epics have a file and some do not: one spec, none, and two matching), `foldSkills` over a real manifest text (CSV, fully quoted), and real `foldEvent`/`hydrate` state, never hand-built entries where a fold exists. Anything importing `src/main` lives in `tests/` (layer rule; `tests/*.tsx` is linted, not typechecked, as 6.9 recorded).
- **Skill-list ruling.** "A skill list" means the install's manifest skills. The persona menu's code buttons (`chat/skill-row.tsx`, they dispatch a menu code and show no manifest name or description) and the one `Skill Session` button (it lists and launches nothing) are not skill lists; the audit allows exactly those and names them, so a third control of either kind fails.
- **Board.** On one mixed snapshot: a native `button` on exactly the cards and epic rows carrying a path and none elsewhere; on every card and row none of `draggable`, `contenteditable`, `href`, `tabindex` (button excepted: none set), `[class*=icon|count|badge|owner]`, a digit outside its own title/number, or a colour of its own; the old "no control" assertions are kept for rows without a file. Pressing every control (click, Enter, Space) leaves `sprint-status.yaml` byte- and mtime-identical, proven in main by driving the real doc-open path (`registerDocBridge`, or the nearest real seam) next to `registerBoardBridge` in `src/main/board-audit.test.ts` with its `node:fs` write counter.
- **`/` list.** With non-empty `skills`, the mounted App shows no manifest name or description anywhere while the list is closed; the list opens only for `/` as the first character, on the persona composer and the New session chat only (not the room's, not a skill-first session's); it lists every skill in manifest order, with no count, heading, group, rank, recommendation or icon; opening, narrowing, choosing and closing write nothing to the window's one live region.
- **Seats.** In one rail holding several persona seats (live and not), a skill seat (working, live, ended) and a hydrate with no live session: `status-dot--live` only on a live seat and none after the hydrate for a persona; no count or `+N`; no `recommend|next|needs you|badge|unread`; the dot has no animation class but on a working seat; the end control (`close session`, header, persona and skill variants) has no `title`, `aria-*`, `disabled` or highlight and is never in the rail. Ending a persona seat leaves every skill seat's session, thread and records; ending a skill seat leaves every persona seat and the room; in main, `session.close` for each of the three kinds leaves the other two kinds' process, thread and transcript file untouched, and `conversation.end(projectId)` ends all three (persona, room, skill-first) and is the only thing that clears the transcript.
- **Threads.** The shared thread, the room's thread and each skill-first thread draw only their own records, in every direction, including two skill-first sessions against each other; a persona switch (tile or `@name`) adds no record to the shared thread; no skill-first record, sysline or run card carries a persona's initials, name or role, and no persona's run card is attributed to a skill.
- **Markdown.** The hostile fixture used by `render-markdown.dom.test.ts` and `turn-md.dom.test.tsx` goes through a mounted persona turn, a room turn and a skill turn under the real DOMPurify: no `script|style|img|iframe|a|[href]|[src]|[on*]|[style]`, `textContent` keeps the text, a click inside the turn navigates nowhere; exactly one place in `src/renderer` sets inner HTML (`markdown-body.tsx`), the existing source sweep kept and its count asserted as one.
- **Skill-first run.** On a populated Board snapshot: the run is in Recent activity (skill name, bare verb), in no column and on no card, owns no story or file (no owner on the row, no annotation on a document it wrote), and the Agents panel rows and the overview figures are identical with and without it.
- **Contract.** A pin by name and cardinality of the fields this epic added: `BoardStory.file`/`BoardEpic.file` (kept), `InstallSnapshot.skills` (kept), and new: `skillSession` on records, run-card/sysline entries and its place on events; `skill` on session opened/closed events, the session listing and the open reply; `SkillRecord`; `ConversationSnapshot.skillSessions`; the `{ first: string }` target. `CONTRACT_VERSION` 1 and 36/8/17/24 unchanged; `sources/install/skill-manifest.ts` is the only reader of the manifest and sits in `sources/`, `fold/skills.ts` sits in `fold/` and is added to the pure-fold list in `tests/session-contract.test.ts`; `layering.test.ts` passes untouched.
- **Documents.** `EXPERIENCE.md` gains the chat's markdown (it has none today; `DESIGN.md:1050` has it) and one epic-wide statement of what Epic 7 did not build (resume across a relaunch, a cap, a persona inferred from what is typed, the `Sprint board` row, a decision block in a skill session), mirrored in `DESIGN.md`; stale statements are reconciled: `EXPERIENCE.md:173` (one seat per persona), `:39-43` (Stop vs `close session`, `@Name` chip built by 2.15 and 3.19), `:38` against `DESIGN.md` open items 6-7, the `Sprint board` row wording at `:102,103,177,229,730` and `DESIGN.md:382,806` (add the "not built in the code, the button has its own Team-half row" caveat), and `epics.md` UX-DR48's "a card is text, not a control" and "a skill list or `/` command" (a dated amendment note, not a rewrite; existing numbers do not move). `sprint-status.yaml` marks 7.6 `done` and `epic-7-retrospective` is left `optional`.

**Never:** feature work; a change to any surface beyond what a failing prohibition requires; loosening or deleting an existing assertion (a stale selector such as `.portrait` in `epic-4-audit.dom.test.tsx` and the `handed to Ada` fixture are left as found and listed under deferred if untouched); a new channel, command, event, preload method or contract entry; a `CONTRACT_VERSION` change; rewriting `epics.md` beyond dated amendment notes; adding a skill list, launcher, count or badge to make a test pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mixed Board | stories: one file, none, two matches; epics: with/without `epic-<n>-context.md` | buttons on exactly the file-bearing cards and rows; nothing else interactive; `sprint-status.yaml` unchanged after pressing each | a failing prohibition is fixed in the product, never loosened |
| Closed `/` list | App with 3+ skills, composer empty/typed `hello`/`@Mary /x`/` /` | no skill name or description in the DOM; live region empty | N/A |
| Open `/` list | composer `/`, then `/bmad-b`, Esc, choose | all skills in manifest order, then the prefix subset; nothing announced; choosing inserts `/<name> ` and sends nothing | N/A |
| Seat rail | personas live/idle, skill working/live/ended, hydrate with none live | dot rules as above; no count or marker | N/A |
| Three threads | shared, room, two skill sessions | each draws only its own records; a persona switch adds none | N/A |
| Hostile markdown | the 1.12 fixture in persona, room and skill turns | text kept, nothing live or navigable | N/A |
| Skill run beside a Board | populated snapshot plus a skill-first run | a Recent activity row only; columns, cards, Agents rows and figures equal the no-run Board | N/A |
| End and clear | persona + room + skill-first live | `session.close` of one kind touches neither other; `conversation.end` ends all three and clears once | N/A |

</intent-contract>

## Code Map

- `tests/board-audit.dom.test.tsx` -- Story 6.9/7.1 mounted audit: `CASES` (:131-141), `FULL_TEXT` (:61), `foldSprintStatus` helper (:79), 7.1 block (:462-575, `plain` loop :512-517); its CASES fold without the `files` argument, so they pass for no-file snapshots only. Model for the new mounted file; `handlersOf()` and `classWords()` are reused, not copied if exported.
- `tests/negative-surface.test.ts` -- static source sweeps: `/` list only skill list (:3083-3152), listbox in one file (:192), `handed to` has no producer (:953), `registry.say(` count 3, seat end line (:2879). Read, do not duplicate.
- `src/renderer/ui/testing/audit-patterns.ts` -- `LIVE_REGIONS`, `STAND_IN`, `withoutSplitters()`; literals `aria-live` and key names are spelled apart in tests (`tests/accessibility.test.ts:~396`).
- `src/renderer/ui/app.test.tsx` -- fake-bridge App mounts: `/` list (:2828-2865, :2955, :3191), seats and skill seats (:1141, :3094, :3266, :3335), threads (:685-733, :3127, :3222), skill run on the Board (:3159, :3209). The mount helpers are the way to a whole-App audit; if not exported, move only the helper into `src/renderer/ui/testing/`.
- `src/renderer/ui/chat/turn-md.dom.test.tsx:108-131` and `doc/render-markdown.dom.test.ts:44-60` -- the hostile fixture inline in both (no shared export): hoist one copy to `src/renderer/ui/testing/` and import it in both without changing their assertions, then reuse it.
- `src/renderer/ui/chat/turn.tsx:70-113` (`PersonaWords`, `SkillTurn`), `party/party-turn.tsx`, `party/party-view.tsx:24`, `chat/transcript.tsx:160-168` -- the three thread filters and three turn kinds.
- `src/renderer/ui/board/board-view.tsx`, `board-activity.ts`, `board-agents.ts`, `board-figures.ts` -- Board derivations (renderer-side) to run with a skill-first run entry; `src/renderer/ui/skills/skill-list.tsx`, `use-slash-list.ts`, `slash-query.ts`; `team/skill-seats.dom.test.tsx`, `team/team.tsx`, `chat/chat-header.tsx`, `chat/skill-row.tsx` (the allowed menu buttons).
- `src/main/board-audit.test.ts` (214 lines) -- write audit: `registerBoardBridge` over a real temp project, wrapped `node:fs`, tree/sha/mtime equality; never calls `doc.open` today. `src/main/doc-bridge.ts`/`doc-bridge.test.ts:205+` -- `doc:open` path-check, one window, one watcher, no writes.
- `src/main/session-bridge.test.ts:3011` ('keeps the three apart'), `:1831` (end one of two seats), `:1899` (conversation.end), `:3250` -- the isolation cases that exist; the combined persona + room + skill-first construct for close-of-each and `conversation.end` is the gap. `tests/persistence-contract.test.ts:446` (skill end removes its own records, no clear).
- `src/main/fold/artifact-owner.ts` (owner by path class), `fold/rail-annotations.ts` (no `agentId`, no owner) -- run a skill-first run that writes a document through the real fold and assert no owner or annotation.
- `tests/contract.test.ts:130-164` (7.1 and 7.3 pins, `CONTRACT_VERSION` :141/:158, 36/8/17/24), `tests/party-contract.test.ts:49` (`{ first }`), `tests/persistence-contract.test.ts:263-269` (`skillSessions`) -- add the missing `skillSession`/`skill`/`SkillRecord`/`skillSessions` pin beside them over `src/shared/conversation.ts` (`SkillRecord` :35, `skillSession` :43/60/81, `skill?` :101/115/199, `skillSessions` :142/244) and `src/shared/events.ts` (:45/57/82/99/119).
- `src/main/sources/install/skill-manifest.ts`, `src/main/fold/skills.ts`, `tests/session-contract.test.ts` ('run folds' purity list), `tests/layering.test.ts` -- layer pins.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md` (:38-43, :102-103, :173, :177, :207-213, :219, :229, :730, :784-790, :983-1126, :1118-1120) and `DESIGN.md` (:382, :652-657, :806, :958, :1050, :1211-1212) -- lines named by the investigation; re-read each before editing. `_bmad/planning-artifacts/epics.md:341` (UX-DR48), Story 7.6 at :3967. `_bmad/implementation-artifacts/sprint-status.yaml:134`.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/testing/` -- hoist the shared hostile-markdown fixture; import it from `render-markdown.dom.test.ts`, `turn-md.dom.test.tsx` and the new audit, assertions unchanged -- one fixture for the epic
- `tests/epic-7-audit.dom.test.tsx` (NEW) -- mount the real `BoardView`, `Shell` and `App` from real folds: mixed-file Board, `/` list closed and open, seat rail, three threads, hostile markdown in persona/room/skill turns, skill run beside a populated Board; read each prohibition in the matrix off the DOM and the live region -- the mounted half of the epic's audit
- `src/main/board-audit.test.ts` -- add the press-every-control step through the real doc-open path; `sprint-status.yaml` and the tree identical, every write under `userData` -- the AD-1 proof for the drill-in
- `src/main/session-bridge.test.ts` (or `src/main/epic-7-audit.test.ts` NEW) -- one construct-all-three test: close each kind in turn leaves the other two (process, thread, file); `conversation.end` ends all three and clears once; a skill-first run writing a document gets no owner or annotation -- the main half of the isolation audit
- `tests/contract.test.ts` -- pin the session flag (`skillSession`, `skill`, `SkillRecord`, `skillSessions`) by name and cardinality; `tests/session-contract.test.ts` -- `fold/skills.ts` in the pure-fold list, the manifest reader the only reader and in `sources/` -- the missing contract and layer pins
- `EXPERIENCE.md`, `DESIGN.md`, `epics.md`, `sprint-status.yaml` -- the amendments and reconciliations in Boundaries; 7.6 `done` -- the documents say what was built and what was not

**Acceptance Criteria:**
- Given the Board mounted from a snapshot with file-bearing and file-less stories and epics, then a native button is on exactly the rows with a path, none has `draggable`, `contenteditable`, `href`, icon, count, badge or colour of its own, and `sprint-status.yaml` is byte- and mtime-identical after every interaction
- Given the whole App with skills installed, then a skill list exists only as the `/` list opened by a leading `/`, with no other button, menu entry, shortcut, tile or panel listing or launching a manifest skill (the menu code buttons and `Skill Session` named and allowed), no count, group, recommendation or ranking, and nothing announced
- Given every kind of seat, then the live dot is only on a live seat, with no count, no pulse for being live, no new colour and no recommended, next or needs-you marker; ending a seat touches no other seat and `conversation.end` still ends every seat
- Given the shared, room and skill-first threads, then none holds a record of another, a persona switch adds none, no skill-first line carries a persona's initials, name or role, and no persona's work is attributed to a skill
- Given the shared hostile-markdown fixture through a persona, a room and a skill turn under the real DOMPurify, then no forbidden element, attribute or navigation appears and exactly one place in `src/renderer` sets inner HTML
- Given a skill-first run beside a populated Board, then it is in Recent activity only, in no column, with no owner, and the Agents rows and overview figures are unchanged
- Given the contract, then the epic's additive fields are pinned by name and cardinality, `CONTRACT_VERSION` is 1, counts are 36/8/17/24 and `layering.test.ts` passes
- Given the planning documents, then they describe the drill-in, the chat's markdown, the `/` list, the seat and its dot, the empty chat and the skill-first turn as built, and say what the epic did not build

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 30 findings — high 0, medium 6, low 19, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) the "click, Enter and Space" tests dispatch fake key events that jsdom turns into no click, so only click is proven — the fake key dispatches were removed and titles and comments now say each press is one `doc.open`, with keyboard activation the native button's, backed by the `button` tag and `handlersOf == ['onClick']`
  - `[medium]` `[patch]` (blind) the skill-first "no owner, no annotation" claim disagrees with the main test (it asserts `writing`) and has no positive control — grouped with the verification-gap and edge rows below; fixed by one test through the real rail projection and a mounted test driven by that real row, the claim pinned as owner-less `writing` plus the path's class owner only
  - `[false]` `[reject]` (blind) `epic-7-context.md` is rewritten and drops requirements — it was regenerated by this run's step-01 compile before any implementation (the tree was dirty with it at the start); it is the compile step's output and is not hand edited
  - `[false]` `[reject]` (blind) `sprint-status.yaml` says `done` while the spec says `in-review` — the spec is set to `done` at finalisation of this same pass; they agree when the run ends
  - `[low]` `[reject]` (blind) `handlersOf` is re-declared and `fake-bridge.ts` duplicates `app.test.tsx`'s bridge — a renderer-side helper cannot import from `tests/`, and switching `app.test.tsx` over would edit 3000 lines of existing assertions the spec forbids touching
  - `[low]` `[reject]` (blind) the hostile fixture lacks iframe, `data:`, entity and `svg` vectors and the two older tests now take the superset — the fixture is Story 1.12's own set, merged and not widened; the superset only adds cases to a pipeline that draws all of it as words
  - `[low]` `[reject]` (blind) the "navigates nowhere" check is near vacuous in jsdom — the sanitiser removes every anchor and `href`, which the test asserts; a click handler is the only other route and `handlersOf` finds none
  - `[low]` `[reject]` (blind) the inner-HTML sweep skips `/testing/` and `*.test.*` — those directories hold test doubles only and the product's own sweep in `document-window-contract.test.ts` scans every non-test source
  - `[low]` `[patch]` (blind) the contract pins count strings and the `skillSession` test is titled against a count that includes `SkillRecord` — the title and comment were corrected; the count style stays, as every other pin in `contract.test.ts`
  - `[medium]` `[patch]` (blind) the isolation test never checks what the closed kind keeps and skips the room — grouped with the edge row below; fixed by comparing the file's `skillSessions` and `runs` and the registry's listing, asserting the room is intact and takes a further send
  - `[low]` `[reject]` (blind) the audit file is not typechecked — as the 6.9 audit, recorded by the spec; a layer rule keeps a file that imports main's fold out of both `tsconfig`s
  - `[low]` `[reject]` (blind) the fake bridge's unsubscribers do nothing — a stand-in for the preload; the product's cleanup is covered by its own hook tests, and unmounting the App ends every listener the audit reads
  - `[low]` `[reject]` (blind) `plain()` and a shadowed `root` read badly — naming, no wrong output
  - `[low]` `[reject]` (blind) "no colour of its own" is untested on the Board — jsdom loads no stylesheet; the style rule for `.board-card-open` is pinned in `tests/tokens.test.ts`
  - `[low]` `[reject]` (blind) open-items text and the line-1009 cell are stale — checked: the cell carries the built-note in the same row and the open items touched are marked; the rest is History kept on purpose
  - `[medium]` `[patch]` (verification-gap) the mounted rail row is hand-fed and the main test never runs `projections/rail.ts` — same group as the second row; fixed with the real projection
  - `[low]` `[patch]` (verification-gap) Enter and Space are claimed and not run — same root as the first row
  - `[low]` `[reject]` (verification-gap) the `skill` fields are pinned only by count — the field-list pins of `SessionOpened` and `SessionClosed` and the named slices pin where the field sits
  - `[false]` `[reject]` (verification-gap) the spec and sprint status disagree — see the fourth row
  - `[medium]` `[patch]` (edge) the persona-seat-end test asserts the ended seat still reads `live` — it pushed `session:closed` but not the `persona:state` main raises; the event is now taken from the real projection and the dot asserted gone
  - `[low]` `[patch]` (edge) Enter and Space never pressed — same root as the first row
  - `[low]` `[patch]` (edge) the `DOC_GET` read can precede the async watch stand-in — wrapped in `vi.waitFor`
  - `[medium]` `[patch]` (edge) the "no annotation on a document a skill wrote" assertion cannot fail on a hand-built row — same group as the second row
  - `[low]` `[patch]` (edge) `live()` returns `''` when the region is absent, so "writes nothing" can pass vacuously — it now throws when absent and the region count is asserted
  - `[medium]` `[patch]` (edge) closing a kind compares entries only, not the file's `skillSessions` and `runs`, and never sends to the room — same group as the tenth row
  - `[low]` `[reject]` (edge, claim) the spec says the end control has no `aria-*` and the test asserts `aria-label` — `tests/accessibility.test.ts:556` requires `aria-label="close session · <name>"`; the audit asserts the exact attribute set (`type`, `class`, `aria-label`), and the spec's wording is recorded as a divergence
  - `[low]` `[reject]` (edge, claim) the audit hand-builds some entries and snapshots where a fold exists — events are folded by the real `foldEvent`/`hydrate` and the Board, skills and rail by their real folds; a hand-built `ConversationSnapshot` is the shape `conversation.get` returns
  - `[false]` `[reject]` (edge, claim) the `epics.md` amendment cites UX-DR53 for the first-message rule — `epics.md:3919` lists UX-DR53 under Story 7.5 (the skill-first seat and session); the citation matches
  - `[false]` `[reject]` (edge, deletion) `epic-7-context.md` was rewritten beyond the spec — see the third row
  - `[low]` `[reject]` (intent-alignment, descriptive) the diff implements the story as the closing audit, with the mounted half over a fake bridge and the real seams in main — as the spec's own Boundaries (a layer rule puts the audit in `tests/`, `negative-surface.test.tsx` is left as found)

## Design Notes

The prohibitions that moved, stated once so the audit can say them exactly: a card or epic row is a control **iff** it has a `file`; `/` lists skills **only** as the leading-`/` list and **never** elsewhere; a persona's live dot means "holds context" and exists **only** on a live seat; a chat may have no persona **only** as the renderer-only New session chat or as a skill-first session spoken in the skill's name. Every other Epic 1 to 6 prohibition is unchanged and still audited by its own epic's file; this audit does not repeat them.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean (includes `check-pins`)
- `npm test` -- expected: all pass (unit and watchers)

**Manual checks (if no CLI):**
- Break the product on purpose and see the audit fail, then revert: a `tabindex` on a file-less card; a count in the `/` list; a skill name in the shell; `status-dot--live` on an idle seat; a `room:true` record in a skill thread; an `<img>` surviving in a skill turn; a skill run in a Board column; a second `skills:` field on `InstallSnapshot`.

## Auto Run Result

Status: done

**Summary.** Epic 7's prohibitions, the kept ones and the four it retired, are now tests that say what is allowed as exactly as they said what was forbidden. A mounted audit builds the Board, skills and rail from the real folds and drives the real `App` over a fake bridge: buttons on exactly the Board rows with a file, the `/` list as the only skill list and silent to the live region, the live dot only on a live seat, the shared, room and skill-first threads apart, the hostile-markdown fixture through a persona, a room and a skill turn, and a skill-first run beside a populated Board. In main, the real doc-open path is pressed from every control with the project tree and `sprint-status.yaml` unchanged, closing each kind of seat leaves the others, `conversation.end` ends all three, and a skill-first write is owner-less. The contract pins the epic's fields by name and count; `EXPERIENCE.md`, `DESIGN.md` and `epics.md` say what was built and what was not. No product code changed.

**Files changed.**
- `tests/epic-7-audit.dom.test.tsx` (new), `src/renderer/ui/testing/fake-bridge.ts` (new), `src/renderer/ui/testing/hostile-markdown.ts` (new) -- the mounted audit, a configurable fake bridge for whole-App mounts, and the one shared hostile fixture
- `src/renderer/ui/chat/turn-md.dom.test.tsx`, `src/renderer/ui/doc/render-markdown.dom.test.ts` -- import the shared fixture; assertions unchanged
- `src/main/board-audit.test.ts`, `src/main/session-bridge.test.ts` -- the doc-open write audit; close-each-kind, `conversation.end` and the skill-first rail row through the real projection
- `tests/contract.test.ts`, `tests/session-contract.test.ts` -- the session-flag pins; the skills fold and reader layer pins
- `EXPERIENCE.md`, `DESIGN.md`, `epics.md`, `sprint-status.yaml`, `epic-7-context.md` (recompiled) -- the documents say what was built; 7.6 `done`

**Review.** 30 findings: patches applied 7 entries (medium 3: the stale `live` dot after a seat ends, the skill-first rail row, the isolation test's coverage; low 4: Enter and Space claims, the live-region control, the `DOC_GET` race, a contract title). Deferred: 2 stale items left as found. Rejected: every other finding, with reasons in the triage log (5 false, 19 low).

**Follow-up review recommended:** true. Three medium entries were patched, all in tests; what is unverified is that the patched assertions can fail against a real regression: the implementer mutation-tested the first version (10 breaks) and the patches were not mutation-tested again.

**Verification.** `npm run typecheck`, `npm run lint` (with `check-pins`), `npm test` unit (247 files, 5886 tests) clean after the patches; the watchers project passed 65 of 65 on two reruns after one failure of `watch-install.test.ts` ("fires when _bmad is created after launch") on the first run, a chokidar timing case in files this story does not touch.

**Residual risks.** The spec says a skill-first write gets "no annotation"; the product gives the row the stream's owner-less `writing` (as the room does), which the audit pins; suppressing it would be a product change. The end control carries its required `aria-label`, so "no `aria-*`" in the spec is read as no other attribute. Keyboard activation of a Board button is proven by the native tag and its sole `onClick`, not by a key event (jsdom cannot). The mounted audit runs over a fake bridge, not a real main process. The watcher test above is flaky.
