---
title: 'A seat for each persona that stays until you end it'
type: 'feature'
created: '2026-10-15'
status: 'done'
baseline_revision: '09e7d0723b1e758c89f0eceadce38fd796ace59e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-7-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      Remove the dead handoff path: `SessionOpenReply.handoff?`, `OpenedSession.handoff`, the renderer's `withHandoff` fold, `onHandoff` and `announceHandoff`.
    evidence: |-
      Main no longer sets `handoff` (the composer is deleted), so the renderer path is unreachable from main; it is kept as tolerance for an optional field and is pinned by `tests/bridge-contract.test.ts` and `use-conversation.test.ts`. Removing it changes the preload API shape and several pinned tests.
    location: >-
      src/shared/conversation.ts:67
    severity: low
---

<intent-contract>

## Intent

**Problem:** Turning to another persona is written as a handoff (`handed to <Name>`) though main already keeps one live session per persona and never ends or re-briefs a seat by switching, and ending a seat says nothing in the thread, so the persona looks as if it still remembers the turns above (FR132, FR133).

**Approach:** Retire the handoff line and its `lastOpened` memory in main; make the header's `close session` write one harness line for a persona's seat; keep the tile's existing `live` state dot as the seat's mark; pin with tests that a switch touches no seat or record and that several seats live and end independently.

## Boundaries & Constraints

**Always:** No record is added to, moved in or removed from the thread by a switch. `session.open` for a live persona returns the live session and spawns nothing (unchanged). `closeSession` in `src/main/session-bridge.ts` for a persona (`entry.agentId !== undefined`) says one line via `ctx.registry.say` before it kills that seat's process, as the room's does, and touches no other seat, session or record. The line is `LINES.seatEnded(name)` = `` `session closed · ${name} starts fresh on the next message` `` in `src/main/session-voice.ts`, lower case and plain, the name from `ctx.nameOf(sender.id, agentId)` (the roster's display name; the id when the roster has none, as `roomOpened` does for an empty name, so an orphan reads by its id). It is a `SyslineRecord`: no persona's face, initials or authorship, no `room` flag, never attributed; it claims no continuity. `conversation.end` is unchanged: it clears the transcript first, ends every seat and writes no seat line (`closeSessions` is not `closeSession`). The seat's mark is the tile's existing `PersonaState` dot and word (`live`, from `process:attached`, `src/main/fold/persona-state.ts`): no new element, colour, count or pulse (it pulses only for `work`); precedence (`work`, `error`, `note`, `live`, `idle`) stays as built. After a relaunch no seat is live (the fold starts empty), so no dot. The header's `close session` and the orphan header's keep their words, place, focus rules and the shared focus treatment (Story 2.8). `CONTRACT_VERSION` stays `1`; no channel, command or event is added or changed.

**Never:** A cap or an automatic ending of any seat; resume across a relaunch (`SESSION_ARGS` untouched); a per-seat thread; a change to `UserRecord`, `SyslineRecord`, the stored transcript or `conversation.end`; a change to the room; a second end control; a handoff line for a tile click or `@name`; a count of live seats, an idle notice or a cost; any new colour or token. `SessionOpenReply.handoff?` and the renderer's fold of one stay declared as an optional field a reply may carry (older stored `handed to` lines still render as sysline text); main simply never sets it, recorded as deferred cleanup.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Turn to a live seat | Mary and John live, transcript has turns; open John | same John session, no process spawned, no sysline, reply has no `handoff`, Mary's session untouched, transcript identical | N/A |
| Turn to a seat not live | transcript has turns; open Amelia | new session for Amelia only, no sysline | N/A |
| `@name` | `@John hi` from Mary's composer | John opened (or resumed); no `handed to` line; the `@John` chip on the user turn as before | N/A |
| End one of two seats | Mary and John live; `session.close(Mary)` | Mary killed and closed, `session:closed` for Mary only, one sysline `session closed · Mary starts fresh on the next message`, John live, transcript keeps every turn | unknown/closed session → `session/not-found`, no line |
| Next message after ending | send to Mary | new session, no earlier context; Mary's dot back to `live` once attached | N/A |
| Orphan seat | persona gone from roster, live | ended by the same call; line names its id | N/A |
| `conversation.end` | two live seats | transcript cleared, every seat closed, no `session closed` line | clear failure → nothing else happens |
| Reload | two live seats | `conversation.get` lists both with their sessions; both dots drawn as before | N/A |
| Relaunch | none live | no dot on any tile | N/A |

</intent-contract>

## Code Map

- `src/main/session-handoff.ts` -- the only producer of `handed to <Name>` (`createHandoffComposer`, `service.lastOpened`); delete the file.
- `src/main/session-bridge.ts:37,148,232-267,477-492,545-593,665-669` -- drop the import, `Context.handoffFor`, the `handoffFor` call in `openSession` (return `reply` as is), the `createHandoffComposer` wiring, and `service.lastOpened = undefined` in `endConversation` (569) and `getConversation` (591-593 and its comment); `closeSession` gains `else`-side: for `entry.agentId !== undefined` say `LINES.seatEnded(ctx.nameOf(sender.id, entry.agentId) || entry.agentId)` before `kill()`; refresh the comment above it. `ctx.nameOf` already exists (line ~667); `nameOf` returns `string | undefined`.
- `src/main/session-registry.ts:113,430` -- remove `lastOpened` from `Service` and `newService`. `byAgent` (103, 254) is the one-live-seat-per-persona evidence; do not change it.
- `src/main/session-voice.ts:21-` -- add `LINES.seatEnded`, placeholder-copy comment in the style of its neighbours.
- `src/main/fold/persona-state.ts:76-87,261-270`, `src/main/session-run.ts:259` -- `live` is raised by `personas.attach` when a session's process is ready and lowered by `detach` (session-run 211, session-registry 306, session-bridge 381). Read-only evidence for the dot; no change.
- `src/renderer/ui/team/persona-tile.tsx`, `src/renderer/ui/status/status-dot.tsx` -- the tile already draws `StateLine` for `live`; no change.
- `src/renderer/ui/app.tsx:76-81,200-211,369-385`, `src/renderer/ui/chat/use-conversation.ts:275-283` -- `activate` and the `@name` path open the seat; the `onHandoff` announce and `withHandoff` fold become unreachable and stay (optional-field tolerance). Add no code here; update comments that say a handoff sysline lands.
- `src/shared/conversation.ts:67-74,84` -- `handoff?` stays; reword the doc comment to say main no longer sets it.
- Pins and tests to amend narrowly, reading each first: `tests/negative-surface.test.ts` ~743, 914-960, 1164, 1476-1513 (handoff composer, `handoffFor` defined once/called once, `session-handoff.ts` file) -- turn into "no producer of `handed to` exists; `lastOpened` is gone; `recordSysline` is called only by the voice and the transcript path as before"; `tests/session-contract.test.ts:151`, `tests/channels-contract.test.ts:104` (file lists naming `session-handoff`), `tests/persistence-contract.test.ts:188,277-279,410` (`bridge.match(/lastOpened/g)` > 0 must become none), `tests/bridge-contract.test.ts:791` (the bridge still resolves an optional `handoff`; keep), `src/main/session-bridge.test.ts:1685-2000` (the `handoff` describe: rewrite to "no handoff line" cases and add the seat cases below), `src/renderer/ui/app.test.tsx:630-801` (tile/`@name` handoff cases: the mock main no longer sends one; assert no `.sysline` appears and focus rules as before), `src/renderer/ui/chat/use-conversation.test.ts:252-285` (keep: the renderer tolerates a reply that carries one).
- New tests: `src/main/session-bridge.test.ts` -- two live seats and a switch (same session, no spawn, transcript entries deep-equal before and after, no `handoff` key), ending one seat (one sysline with the exact words, other seat live and unclosed, transcript keeps turns, `session:closed` once for it), next message after end opens a new session, orphan end names the id, `conversation.end` writes no seat line, Story 2.11's install-change cases with two live seats (reuse its helpers; no live seat touched, orphan keeps its end control), `conversation.get` lists both seats. `src/main/fold/persona-state.test.ts` -- two agents live independently, one detached leaves the other `live`. `src/renderer/ui/app.test.tsx` -- two live tiles both show the `live` dot and word; closing one via the header leaves the other's; no `aria-live` or count added.
- Docs: `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md` (~141, 158-160 voice ruling, 186 sysline row, 226 Persona tile row, 749/767 activity-line wording, 1255-1256 journey) and `DESIGN.md` (*Team tile* state dot, header, *Sysline* ~1149): the tile click opens or resumes a seat and writes nothing; the `session closed` line; the live dot; flag `handed to` as superseded where it stood. `epics.md` already carries the Story 2.8/2.9/FR62/FR133 notes (verified); flip UX-DR53's "amended by Story 7.4" to say it is built.

## Tasks & Acceptance

**Execution:**
- `src/main/session-handoff.ts`, `src/main/session-bridge.ts`, `src/main/session-registry.ts` -- retire the handoff composer and `lastOpened` -- a switch turns to a seat and writes nothing
- `src/main/session-voice.ts`, `src/main/session-bridge.ts` -- `LINES.seatEnded`, said by `closeSession` for a persona -- the thread tells that the persona starts fresh
- `src/shared/conversation.ts` and the comments in `src/renderer/ui/app.tsx`, `src/renderer/ui/chat/use-conversation.ts` -- say what is true now
- Tests as listed in the Code Map: amend the handoff pins, add the seat cases, the fold case and the two-dot app case
- `EXPERIENCE.md`, `DESIGN.md`, `epics.md` (UX-DR53) -- the documents say what was built

**Acceptance Criteria:**
- Given two live seats and a transcript with turns, when a tile is activated or `@<name>` resolves, then the target's existing session answers (or one is opened if not live), no other seat is ended, replaced or re-briefed, the transcript is unchanged, and no `handed to` line is written or announced
- Given a live seat, then its tile shows the existing `live` dot and word with no count and no pulse; after a relaunch no tile does
- Given the user ends one seat with `close session`, then that seat alone is killed and closed, one sysline `session closed · <Name> starts fresh on the next message` joins the thread, every turn stays, and the next message to that persona starts a session with no earlier context
- Given `conversation.end`, then every seat ends, the transcript clears and no seat line is written
- Given an orphaned seat or an install change with several live seats, then no live seat is touched and the orphan's session ends by the same control
- Given a window reload, then `conversation.get` lists every live seat and every dot is drawn as before
- Given the contract, then `CONTRACT_VERSION` is `1` and the channel, command and event counts are unchanged

## Spec Change Log

## Review Triage Log

### 2026-10-15 — Review pass
- verdicts: 36 findings — high 0, medium 1, low 34, false 1, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind, edge) a seat line is written over an empty thread and replaces the intro — the epic's acceptance criterion says the harness writes one line when a seat ends, with no condition, and the room's stop line is unconditional too; a guard needs a transcript read and rewrites eleven tests for a cosmetic case
  - `[low]` `[reject]` (blind) only the user's `close session` tells the thread a persona starts fresh — a process exit already says `session ended · the process exited`; a window going or a relaunch leaves no live thread to mislead, and resume is not built
  - `[medium]` `[patch]` (blind, verification-gap) the install-change test cannot fail, it only edits a local name map — retitled to what it checks (orphan and renamed seat stay live, orphan ends by the same control) and the install side is pinned by a new source test in `tests/session-contract.test.ts` that nothing reading the install reaches the registry or ends a session
  - `[low]` `[reject]` (blind) failed-open coverage was dropped — the only producer a failed open could have suppressed is deleted; `openSession` returns the reply as is
  - `[low]` `[reject]` (blind, verification-gap) several tests cannot fail (`announced()` empty, the relaunch fold test, hand-built renderer events) — main-side tests and the negative-surface pin are the real guards; the renderer cases only show drawing
  - `[low]` `[reject]` (blind) the renderer's handling of the persona `harness:said` line and its announcement are untested — those lines (`quiet`, `exited`) are an existing path, unchanged here
  - `[low]` `[reject]` (blind) the seat line can precede a run's failure line — the room's stop does the same; the order is the registry's own
  - `[low]` `[defer]` (blind, edge) dead handoff path stays while the spec calls it deferred cleanup — added to the `deferred` list
  - `[low]` `[reject]` (blind) the line's copy is a placeholder yet written into the docs — every neighbouring line in `session-voice.ts` is the same kind of placeholder, and the docs say what was built
  - `[low]` `[reject]` (blind) the `else` branch would read a skill-first session as a persona's — skill-first sessions do not exist yet; Story 7.5 reads the session kind everywhere
  - `[low]` `[reject]` (blind) the `registry.say(` count and the `handed to` ban in comments are brittle pins — they say what is true now; Story 7.5 amends them where it adds lines
  - `[low]` `[reject]` (blind) `epic-7-context.md` is rewritten — it is regenerated by the compile step and not hand edited
  - `[low]` `[reject]` (blind) a background seat can only be ended after turning to it — the epic's decision is that the header's `close session` is the end with no second control
  - `[low]` `[reject]` (blind) stale wording in docs and comments — the superseded notes stand where the old text did; the remaining sentences are marked history
  - `[low]` `[reject]` (blind) over-long comments and ghost-feature wording in the preload docs — style only
  - `[low]` `[reject]` (edge) closing a seat still starting writes a line — same as the room's stop; the entry is held and closed through `finish`
  - `[low]` `[reject]` (edge) two windows on one project share a thread, so the line is told to both — the thread is the project's by decision and a window holds its own seat
  - `[low]` `[reject]` (verification-gap) no test shows main emitting `persona:state` live per seat through the bridge — the fold test and the existing attach wiring cover it, and the dot is unchanged code
  - `[low]` `[reject]` (intent) the spec narrows the epic's story to main work and tests — descriptive; the live dot was already built and the renderer's work is tests and wording
  - `[low]` `[reject]` (intent) renderer exercised only against a mocked main, and the epic-7 context file carries unrelated edits — descriptive; the context is regenerated

## Design Notes

The thread stays the project's one conversation (decided 2026-10-13), so ending a seat cannot remove that persona's records: a user turn carries no persona, and stripping would tear holes in a shared thread. The line is the truthful substitute, said in the harness's register, so the thread does not read as if the persona still remembers it. The name sits in the line's words, not in any speaker slot: a sysline has none. The existing `live` state already is the seat's dot (UX-DR53 says "the tile's own dot vocabulary"), so the story adds no renderer component; its renderer work is tests and wording. Resume across a relaunch is not built (`SESSION_ARGS` is pinned as load-bearing and wants its own spike).

```ts
// closeSession, persona branch
if (entry.agentId !== undefined) {
  ctx.registry.say(sender, entry, LINES.seatEnded(ctx.nameOf(sender.id, entry.agentId) || entry.agentId))
}
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm test` -- expected: all pass; also `npx vitest run --project watchers`

**Manual checks (if no CLI):**
- Run the app: open Mary, then John, then Mary again: no `handed to` line, both tiles `live`; `close session` on John writes one line and leaves Mary `live`; `End conversation` clears the thread and writes no seat line.

## Auto Run Result

Status: done

**Summary.** Turning to a persona, by tile or `@name`, now writes nothing: main's handoff composer and `lastOpened` are gone, so a live seat answers as it is and one not live opens, with no other seat or record touched. The header's `close session` for a persona now says one harness line, `session closed · <Name> starts fresh on the next message` (the id for an orphan), before it kills that seat alone; `conversation.end` is unchanged and writes none. The tile's existing `live` state dot is the seat's mark; no new element. `CONTRACT_VERSION` is still 1.

**Files changed.**
- `src/main/session-handoff.ts` (deleted), `src/main/session-bridge.ts`, `src/main/session-registry.ts`, `src/main/session-voice.ts` -- the composer and `lastOpened` retired, `LINES.seatEnded`, said by `closeSession`
- `src/shared/conversation.ts`, `src/preload/*`, `src/main/install-model.ts`, `src/renderer/ui/app.tsx`, `src/renderer/ui/chat/use-conversation.ts` -- comments say what is true now
- tests: `src/main/session-bridge.test.ts`, `src/main/session-stop.test.ts`, `src/main/fold/persona-state.test.ts`, `src/renderer/ui/app.test.tsx`, `tests/negative-surface.test.ts`, `tests/persistence-contract.test.ts`, `tests/session-contract.test.ts`, `tests/channels-contract.test.ts` -- handoff pins turned into "no handoff", the seat cases, two live seats
- `EXPERIENCE.md`, `DESIGN.md`, `epics.md` (UX-DR53), `epic-7-context.md` (recompiled) -- the documents say what was built

**Review.** Patches applied: 1 (medium: the install-change test could not fail; retitled and a source pin added). Deferred: 1 (the dead `handoff?` path). Rejected: every other finding, with reasons in the triage log.

**Follow-up review recommended:** false (one medium patched, no high).

**Verification.** `npm run typecheck`, `npm run lint` (with `check-pins`), `npm test` (244 files, 5670 tests) and `npx vitest run --project watchers` (65) pass; the new source pin and the bridge tests pass after the patch.

**Residual risks.** The Electron app was not run, so the manual check (open Mary then John then Mary: no line, two `live` tiles; `close session` on John writes one line) is covered by tests only. Closing a seat before anything is said writes the line over an empty thread and replaces the introduction (the epic's criterion is unconditional). Only `close session` tells the thread a persona starts fresh; a window going or a relaunch writes nothing. A background seat is ended by turning to it first (no second control, by decision).
