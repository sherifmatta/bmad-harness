---
title: 'Story 8.7: Nothing this epic promised not to do'
type: 'chore'
created: '2026-10-20'
status: 'done'
baseline_revision: 'b3b301a9252ef655f3086148332b55efcf1f0872'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The dead collapsed run line (RunCardLine, isCollapsed, RunCollapse and the collapse prop of Turns) is unreachable since Story 8.4 and still in the code.
    evidence: |-
      Story 8.4 deferred its removal to 8.7; 8.7's boundary is no feature work, and removing it touches about ten test files and source-text pins (run-card-line.dom.test.tsx, run-status.test.ts, epic-3-audit.dom.test.tsx, tests/continuation-replay.test.tsx, tests/negative-surface.test.ts, tests/accessibility.test.ts).
    location: >-
      src/renderer/ui/chat/run-card-line.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epic 8 reversed Epic 7's one-thread rule and added prohibitions (selecting spawns nothing, no greeting unprompted, no thread in two chats, close deletes only its own thread, no unread or suggested persona, no `handed to`), but they are pinned only story by story. Nothing says as a whole that a persona's thread is decided by one predicate, that the contract grew only by the named optional fields, or that a mounted shell of every persona, the room and a skill-first session keeps its threads apart. Four planning documents still read as the epic's plan, not as built.

**Approach:** Close the epic the way Stories 2.13 and 7.6 closed theirs: a mounted audit over the real `App`, a real-session-bridge audit over a fake process, static pins for the contract and the shared predicate, and dated amendment notes on the planning documents. No feature work.

## Boundaries & Constraints

**Always:** A failing assertion is fixed in the product only if it is a prohibition the epic kept; a stale pin is amended with its reason, never loosened. Tests that reach both main's folds and the renderer live in `tests/` (`tests/*.tsx` is linted, not typechecked). Document edits are dated inline notes in the form earlier closers used (`*(Amended 2026-10-20, Story 8.7, built: …)*`, `*Superseded …*`); existing text and numbering stay. Epic 8 is marked done in `sprint-status.yaml` only after the full suite passes.

**Never:** Any change to `src/` behaviour, the contract, channels or `CONTRACT_VERSION`; removing the dead collapsed run line (`RunCardLine`, `isCollapsed`, `RunCollapse`, the `collapse` prop of `Turns`: "no feature work", leave it recorded as still deferred); loosening an earlier epic's audit; a new colour, token, size or component; editing a story spec of 8.1-8.6.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Select every persona | Mounted `world()`: each persona (Sally, with no thread, included) selected by click, Enter, Space | `opened`, `seatStarts`, `sent`, `firsts`, `closed`, `closedAgents` all empty; no record added; no `.status-dot--live` on a tile that was not live | n/a |
| First message | Real bridge, John has no seat, `conversation.send` | User turn recorded before spawn; `/bmad-agent-pm` written once, as first stdin turn, only after the message was sent; message written after the activation turn ends; one persona turn with no word edited | Spawn refusal is one line in John's thread |
| Threads apart | Two personas, the room and a skill-first session with records and run cards; many switches | Every stored record is in exactly one thread by the shared predicate; each drawn thread holds only its own; stored file bytes identical before and after N switches | n/a |
| Close one of three | `closeSession({ agentId })` on a persona with a stored thread and no live session, then on a live one | Its records, runs, bookkeeping, annotations gone, nothing written in place; other personas, room, skill session and their file bytes unchanged; `conversation.end` still clears all | Failed clear changes nothing (already pinned) |
| Nothing suggested | Background chats with a running or finished run | No unread mark, count, badge, preview, recency order or suggested next persona; no `handed to` in any `src/` producer | n/a |

</intent-contract>

## Code Map

- `src/shared/thread.ts` -- the one predicate (`threadAgentOf`, `isInPersonaThread`, `ThreadTagged`); read only. Users: `transcript-entry.ts:146`, `transcript.tsx:176`, `app.tsx:188,410,496,539`, `use-conversation.ts:768`, `conversation-state.ts:384`, `src/main/fold/transcript.ts:138`, `src/main/projections/transcript.ts:353,357`, `projections/runs.ts:55`. Allowed near-duplicate: `src/main/fold/rail-annotations.ts:210` (`foldWithoutAgent` filters held runs by `agentId`, no room/skill field).
- `tests/contract.test.ts:166-250` -- the Story 7.5 describe is the pattern (`fieldsOf`, `withoutComments`, `read`). Declarations to pin: `agentId?` on `UserRecord` (`src/shared/conversation.ts:68`), `SyslineRecord` (:94) and `HarnessSaid` (`src/shared/events.ts:106`), `PersonaRecord.agentId` stays required (:24); `activation?` on `PersonaRecord` (:30) and `PersonaSaid` (events.ts:87); `TranscriptFile` already lists `attributed?` (:219 area); `session.close` args already `target|{agentId}` (:255); `SessionTarget` literal (:222-231); `CONTRACT_VERSION = 1`, 8 commands, 17 events, 36 channels, 24 preload methods.
- `tests/negative-surface.test.ts` -- static half: `code` Map of non-test `src/` files without comments, `sources(prefix)`, `offenders(paths, regex)`, `MAIN_CODE`, `RENDERER_CODE`. `handed to` is swept only over `MAIN_CODE` (~:953); `conversation.activate(` count 0 (:1526); `seatEnded` absent (~:2897).
- `tests/epic-7-audit.dom.test.tsx` -- the mounted pattern: `start(snapshot)` (:406), `world()` (:350, Mary live, John working, room, three skill sessions, marker words), `plain()`, helpers `tile`, `chooseTile`, `thread`, `header`, `live`, `type`, `key`; Epic 8 amendments already in it at ~:693, :781-870. Read only: add a new file instead.
- `src/renderer/ui/testing/fake-bridge.ts` -- records `calls`, `opened`, `seatStarts`, `sent`, `closed`, `closedAgents`, `stopped`, `firsts`, `ended`; `push(event)`, `conversation()`. Also `fake-scroll.ts`, `render-hook.ts`, `audit-patterns.ts` (`LIVE_REGIONS`, `spoken`).
- `tests/room-reload.test.ts:1-60` and `src/main/session-bridge.test.ts:3097-3234,3539-3816` -- the real-bridge harness (mocked electron `ipcMain`, `createTranscriptRegistry`, `registerSessionBridge`, fake process, `transcriptFilePath`) and the first-message and three-kinds cases to model on; the local `threadOf` at :3103 re-implements membership inline, replace it with `threadAgentOf` if touched.
- Existing coverage not to repeat: AC1 `app.test.tsx:3929-4115`; AC2 `session-bridge.test.ts:3564-3714`, `transcript.test.tsx:396-480`; AC4 `session-stop.test.ts:1600-1790`; AC5 `epic-7-audit` ~:643, :856, `negative-surface.test.ts:282`.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md` -- Epic 8 amendments exist (:38-45 open items, :144, :163-167, :761, :774-786, :1160-1300); items 6-7 `[OPEN]` (:44-45), `[OPEN]`/`[ASSUMPTION]` for orphaned listing, confirmation, draft stays (:1192), stored-thread first message (:1226), bare `@name` (:1065) and "to be re-read" skill row (:1203) need marking as built or still open.
- `.../DESIGN.md` -- amended at :652, :935, :983, :1057, :1071-1086, :1277-1295; stale at :1076 ("belongs to Story 8.2": the hint stays true per spec 8.2).
- `_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md` -- AD-7 (:125-129) has the first-message rule without a dated marker (AD-18, AD-29 carry one); :104 says `session.open` keeps its declaration, but 8.3 added `{ seat, message, mention? }` and `{ seat, code }`, and `TranscriptFile.attributed?` is unmentioned; open items "composer draft per persona" (~:440), "orphaned thread" (~:442), "legacy harness line" (~:445) are built or measured.
- `_bmad/planning-artifacts/epics.md` -- notes already on Stories 2.4 (:1455), 2.8 (:1584), 2.9 (:1650), 3.5 (:2119), 3.10 (:2318), 7.4 (:3962); Story 8.7 at :4289.
- `_bmad/implementation-artifacts/sprint-status.yaml:137,145` -- `epic-8: backlog`, `8-7-…: backlog`; `last_updated` at :32.

## Tasks & Acceptance

**Execution:**
- `tests/contract.test.ts` -- add a describe "a chat per persona's fields (Epic 8, audited by Story 8.7)": `agentId?` on exactly `UserRecord`, `SyslineRecord`, `HarnessSaid` (by `fieldsOf`, plus the total `agentId` declaration count per file), `activation?` on `PersonaRecord` and `PersonaSaid`, `TranscriptFile` fields, `session.close` second target `{ agentId }` once in `commands.ts`, `SessionTarget` literal, `CONTRACT_VERSION = 1`, 8 commands, 17 events -- additive and optional by name and cardinality
- `tests/negative-surface.test.ts` -- add (a) a sweep that `handed to` and `handoffFor` appear in no `src/` file outside comments, across main, renderer and shared (renderer's `withHandoff`/`onHandoff` names stay legal); (b) the one-predicate pin: `src/shared/thread.ts` is the only file that combines `agentId` with `room` and `skillSession` to decide membership (whitelist `rail-annotations.ts`), and the renderer filter (`transcript-entry.ts`), main's removal (`fold/transcript.ts`, `projections/transcript.ts`) and the `threadEmpty`/send-count sites each reach `threadAgentOf` or `isInPersonaThread` -- FR141, UX-DR56
- `tests/epic-8-audit.dom.test.tsx` -- new mounted audit over the real `App`, reusing the Epic 7 audit's helper shape: select every persona by click, Enter and Space with nothing opened, written, recorded or live-dotted; the three kinds of thread plus a second persona apart after many switches, no record text in two drawn threads, `bridge.calls` only reads; a persona closed by `{ agentId }` from the stored-thread state (offered, `closedAgents`), neighbours untouched; background chats with run cards carry no unread mark, count, badge, preview, recency order, suggested persona or `handed to`; one polite live region -- NFR12, NFR17, NFR18, NFR22, NFR28
- `tests/epic-8-audit.test.ts` -- new real-bridge audit over a fake process (`room-reload.test.ts` style): first message ordering and the one `/<agentId>`, joined persona turn with no edited word via the renderer's `hydrate`; the stored file's bytes identical before and after N conversation reads and switches; every stored record in exactly one thread by `threadAgentOf`; closing one persona's thread (stored, then live) leaves the other persona, room and skill session bytes unchanged and writes nothing in place; `conversation.end` still clears everything
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md`, `DESIGN.md` -- dated Story 8.7 notes: the persona chat, empty chat, first message and close described as built; `handed to`, the shared thread and the seat-ended line flagged superseded where they stood; resolve the `[OPEN]`/`[ASSUMPTION]` items 8.5/8.6 built (mark built, or still open for the owner); add "what Epic 8 did not build" (merged timeline, unread marks, undo of a close, a cap); fix the stale `DESIGN.md:1076` note
- `_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md` -- AD-7 dated "Amended 2026-10-20, Story 8.7" marker; correct the contract bullet (:104) for the two `session.open` targets and `attributed?`; mark the three open items settled
- `_bmad/planning-artifacts/epics.md` -- one dated note at Story 8.7 listing what was verified, and a "built" check that Stories 2.4, 2.8, 2.9, 3.5, 3.10 and 7.4 carry their notes (add one only where absent)
- `_bmad/implementation-artifacts/sprint-status.yaml` -- `8-7-…` to `done`, `epic-8` to `done`, `epic-8-retrospective` left `optional`, `last_updated` bumped

**Acceptance Criteria:**
- Given every persona selected in turn on a mounted shell, then a test finds no `session.open`, process, stdin write or added record, and a live dot on no tile that was not live.
- Given the first message to a persona, then a test finds `/<agentId>` written once, first, and only after that message was sent, and the pieces joined into one turn without an edited word.
- Given two or three personas with turns, the room and a skill-first session, then each thread holds only its own records and run cards, no record is in two threads, and the stored transcript is byte-identical after any number of switches.
- Given a persona's chat closed, then its records, runs, bookkeeping and annotations are gone, nothing is written in their place, every other thread and session is untouched, and `conversation.end` still clears everything.
- Given the shell, then a test finds no unread mark, count, badge or recommendation, no `handed to` from any producer, and no persona suggested as next.
- Given the contract, then a test pins the additive optional fields, the `{ agentId }` close target, version 1, 17 events and 8 commands, and finds the one shared predicate behind the renderer filter, main's removal and the empty-thread test.
- Given the epic's record, then `EXPERIENCE.md`, `DESIGN.md`, the Architecture Spine and `epics.md` carry the dated Story 8.7 amendments above and `sprint-status.yaml` shows 8.7 and epic 8 done.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 31 findings — high 0, medium 0, low 22, false 9, maybe-false 0
- findings:
  - `[low]` `[patch]` Verification gap: the "never suggested" audit scanned the rail and class names but not the header or thread text — added a text scan of the header and the thread in view for `recommend|next|suggest|talk to`; the test passes.
  - `[low]` `[patch]` Blind 12 / Edge 1 / Edge 3: the byte-identity test and its header claim "reads and turns" but only read and switch; a title that promises scroll landing but checks the live region only — retitled both to what they check (reads and switches; the one polite live region silent through every switch).
  - `[false]` `[reject]` Blind 1: status contradiction between the spec and sprint-status — the three commands ran green before the flip (typecheck clean, lint zero warnings, 251 unit files and 6071 tests); the spec is `done` at finalization; `last_updated` is a bookkeeping stamp.
  - `[false]` `[reject]` Blind 2: the matrix row says refusal is one line in John's thread but built is the chat's `error-line` — the matrix cites Story 8.3's refusal, the built wording is recorded as an amendment in `EXPERIENCE.md`, and a finding whose fix is to edit this spec is rejected.
  - `[low]` `[reject]` Blind 3: a typed bare `/bmad-agent-<x>` opening a seat is documented and not pinned — Epic 8's context allows a typed `/bmad-agent-*` to start a seat, the owner has not decided otherwise, and a pin would freeze an open decision.
  - `[low]` `[reject]` Blind 4 / Edge 8 (one predicate): the test whitelists `foldAttributeLegacy`, which joins `room` and `skillSession` — it attributes untagged legacy records, not membership; the notes say "one definition" of membership, which holds.
  - `[low]` `[reject]` Blind 5 / Verification 2 / Edge 7: source-text pins break on a reflow and hard-code counts — the project's negative-surface and contract tests are source-text pins throughout, and the behavioural tests beside them run.
  - `[low]` `[reject]` Blind 6: close bookkeeping and rail annotations, per-persona draft and queue, and a close during an in-flight spawn not covered by the new audit — each is covered where its story built it (`session-stop.test.ts:1738,1749`, `fold/rail-annotations.test.ts`, `app.test.tsx` draft cases) and the spec's Code Map says not to repeat them.
  - `[low]` `[reject]` Blind 7 / Edge 2: the fake process's `up()` writes `/<agentId>` itself — the process-layer write is pinned by `tests/session-contract.test.ts:92`; this audit pins main's ordering, the held message and the single activation.
  - `[low]` `[reject]` Blind 8 / Edge 4: relaunch is a process exit and no legacy file is loaded — the one-time attribution and `attributed` are Story 8.1's own tests; the audit's claim is bytes after reads and switches.
  - `[low]` `[reject]` Blind 9: `ownerOf` and `threadsOf` re-implement membership in the tests — an independent oracle by design; the DOM audit also imports `threadAgentOf` for the predicate itself.
  - `[false]` `[reject]` Blind 10a: `throw { code, message }` in a linted test file — `npm run lint` and a targeted eslint run report zero warnings.
  - `[low]` `[reject]` Blind 10b / Edge 6: `bridge.push(... as never)` for `run:finished`, a refusal test that overrides `openSession`, SVG `className` and Space modelled as keydown then click — test-fixture details with no named harm; the assertions on the rendered DOM still run.
  - `[low]` `[reject]` Blind 11: AC5 is checked statically only for `handed to`, with the rest on a scripted DOM — the mounted scenario covers a running and a finished background run, the existing Epic 2 and 7 static sweeps stand, and the extra `handed` sweep is a stricter literal.
  - `[low]` `[reject]` Blind 12b: the epics note says stories were checked without a list — the note says none needed adding and they were read against the built behaviour.
  - `[low]` `[reject]` Edge 5: `attributed` written by every write not pinned beyond the type — `session-bridge.test.ts` of Story 8.1 reads it; a dropped write would re-run a pure fold with the same result.
  - `[low]` `[reject]` Edge 9: a seat held and idle with a seat-and-message open returns `session/busy` — the `send` path of a held seat is `session-bridge.test.ts` and `use-conversation.test.ts`.
  - `[low]` `[reject]` Edge 10: whether a background run's end is announced by the one live region is unpinned in the audit — the prohibition is that a switch announces nothing, which the audit asserts.
  - `[false]` `[reject]` Intent audit 1-5 (readings R2-R5): the diff implements R1; sprint-status flip is the story's own task, epic-8 retrospective stays `optional` as in 6.9 and 7.6, and nothing is claimed beyond what ran.
  - `[false]` `[reject]` Intent audit: the tests run against a fake bridge and fake process, not the Electron app — said in the spec's Design Notes and the audits' headers; the manual Electron check is listed as not run.
  - `[false]` `[reject]` Intent audit: documents amended while `src/` is untouched where built behaviour differs from the plan — the spec's Never list forbids a `src/` change and both deviations are recorded for the owner.
  - `[low]` `[defer]` Intent audit: the dead collapsed run line remains in `src/` — pre-existing from 8.4, deferred in this spec's frontmatter.
  - `[low]` `[reject]` Intent audit: orphaned-thread listing and close confirmation stay `[OPEN]` — owner decisions, not this story's.
  - `[low]` `[reject]` Verification: second test (lines ~976-1008) scans for `handed to|hand-off` only — it is the `handed to` test; suggestion wording is the first test's.
  - `[low]` `[reject]` Verification: source-text pins are belt-and-braces over the mounted and real-bridge tests that run and assert behaviour — as above.

## Auto Run Result

Status: done

**Summary.** Epic 8 is closed as Stories 2.13 and 7.6 closed theirs, with no change to `src/`: a mounted audit over the real `App`, a real-session-bridge audit over a fake process, contract and one-predicate pins, and dated amendment notes on the planning documents. Story 8.7 and epic 8 are `done` in sprint status.

**Files changed.**
- `tests/epic-8-audit.dom.test.tsx` -- new: every persona selected by click, Enter and Space opens, writes, records and lights nothing; each of 18 stored records drawn in exactly one of 6 threads; close by `{ agentId }` takes one thread; no unread, count, badge, preview, recency order, suggestion or `handed to`; one polite live region.
- `tests/epic-8-audit.test.ts` -- new: the real bridge, registry and store over a fake process: first message ordering and one `/<agentId>`, joined turn, file bytes identical after reads and switches, partition by the one predicate, close stored then live, `conversation.end` still the whole clear.
- `tests/contract.test.ts`, `tests/negative-surface.test.ts` -- new describes: the additive optional fields, the `{ agentId }` close target, version 1, 8 commands, 17 events, 36 channels; no `handed to` anywhere in `src/`; one membership predicate behind the renderer filter, main's removal and the empty-thread test.
- `EXPERIENCE.md`, `DESIGN.md`, `ARCHITECTURE-SPINE.md`, `epics.md` -- dated Story 8.7 notes, a "What Epic 8 did not build" section, AD-7 and contract-bullet amendments, open items marked.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 8-7 and epic-8 `done`.

**Review.** One pass, four layers: 31 findings (low 22, false 9). Patched: a text scan of the header and thread for suggestion wording, and two titles that promised more than they checked. Deferred: the dead collapsed run line (frontmatter). Rejected: with reasons in the triage log.

**Follow-up review recommended:** false. Two low patches; no high, no medium.

**Verification.** `npm run typecheck` clean; `npm run lint` zero warnings and pins check; `npm test` unit project 251 files / 6071 tests pass; the watchers project (3 files / 65 tests) failed one timing test on the first full run under machine load and passes when run alone. The patched audit files re-ran green (23 tests) and lint clean. Matrix rows are covered by the two audit files. Not run: the manual Electron check, a real `claude`.

**Residual risks.** A bare typed `/bmad-agent-<x>` in the New session chat spawns the seat (recorded as measured in `EXPERIENCE.md`, owner's call); the orphaned-thread listing and a close confirmation stay open for the owner; `ARCHITECTURE-SPINE.md`, `EXPERIENCE.md` and `epics.md` notes say "verified" for behaviour only exercised against fakes.

## Design Notes

Most of the epic's prohibitions are already pinned by the stories that built them (see the Code Map's "not to repeat"); this story adds the whole-shell and whole-store views those pins cannot give (every persona at once, byte-identical store, partition by the one predicate) and the contract and predicate pins that were never written. The `src/` tree is not expected to change: a failing new test means a real prohibition broke, or the test is wrong, and a stale old pin is amended with its reason in the same commit. The dead collapsed run line stays deferred because removing it touches about ten test files and is feature-adjacent cleanup, not an audit.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: exit 0, zero warnings, pins check passes
- `npm test` -- expected: all suites pass, including the two new audit files and the new contract and negative-surface describes

**Manual checks (if no CLI):**
- Read the amended passages in `EXPERIENCE.md`, `DESIGN.md`, the Architecture Spine and `epics.md`: each says what was built, keeps the superseded text visible and dated, and invents no behaviour.
