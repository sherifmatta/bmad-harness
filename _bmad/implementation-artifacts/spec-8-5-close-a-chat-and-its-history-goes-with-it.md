---
title: 'Story 8.5: Close a chat and its history goes with it'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: '19cb9b5cbdbe70f47d40bb9655a1bc722a461c71'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A persona's `close session` only kills its process and writes `session closed · <Name> starts fresh on the next message` into a thread that stays; it is offered only while a session is live, so a persona whose session ended with a relaunch keeps a stored thread nobody can remove short of ending the whole conversation.

**Approach:** `session.close` gains an additive `{ agentId }` target beside `sessionId`; both forms run one removal in main that ends the persona's session (if any) and deletes that persona's thread and everything main holds keyed to it, writing nothing in its place. The renderer drops that persona's records, queue and draft on the command's reply and offers the control when a session is live or a stored thread exists. The next message starts the seat as in Story 8.3.

## Boundaries & Constraints

**Always:** The removal is exactly the persona's thread by the shared predicate (`threadAgentOf` in `src/shared/thread.ts`: an `agentId`, no `room`, no `skillSession`): its transcript records, its stored runs (and ids marked ended so a late `recordRun` cannot revive one), its run-projection cards, `service.written[agentId]`, its rail annotation holds (runs of that persona), and its derived persona state flags (`error`, `note`, `runEndedAt`) so no `error`/`note` dot outlives the thread. Order in main: kill and `finish(..., 'closed')` the live session first (its run ends and is recorded), then remove the thread, then forget the persona's flags. No line is written (no `LINES.seatEnded` for a persona; the room's `roomStopped` line is unchanged). No other persona, the room, a skill-first session, or any file in the project is touched; a persona off the roster keeps its stored thread undrawn unless closed by agent id. A persona with neither a live session nor a thread replies `session/not-found` (an unlisted id as today). `conversation.end` is unchanged: still the only whole clear, still clears the file first and fails atomically. The close control keeps its words, place and rules (never suggested, highlighted or badged; keyboard reach, shared focus treatment). `close session` deletes at once, with no confirmation. The renderer drops the persona's queue, draft and records on the close command's reply, not on `session:closed`. A persona's chat after close is the derived empty chat of Story 8.2 and the tile reads as no session. Personas keyed by `agentId`, never display name.

**Never:** Any change to `CONTRACT_VERSION`, the eight commands, seventeen events, thirty-six channels, the twenty-four bridge methods, `SESSION_ARGS`, or `TranscriptFile` version 1; a new bridge method or channel; an undo, archive, export, confirmation, cap or automatic close; a listing of orphaned (off-roster, no live session) threads with their own control (owner's to choose); changing the close of the room or a skill-first session; a new colour, token, size or component; a write into the project's files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Close a live persona | Mary live with thread, `close session` | Process killed; Mary's records, stored runs, written files, annotations, flags gone; no line written; chat shows the empty chat; no control; John's thread and session untouched | n/a |
| Close with stored thread only | Mary's session ended with a relaunch; thread stored | Control offered; reply ok; thread deleted; empty chat | n/a |
| Neither live nor thread | Mary never started, empty chat | No control offered; command by `{ agentId }` replies `session/not-found` | Renderer treats a not-found reply for an agent close as already gone |
| Queued message and draft | Mary busy with queued messages and a typed draft | Dropped on the reply; none sent to a later session; composer empty | n/a |
| Run in flight | Mary mid-run when closed | Run ends with the session, then card, stored run and dot state vanish; late `recordRun` ignored | n/a |
| Orphan live session | Persona off the roster, live | Existing orphan control closes it the same way; its thread goes too | n/a |
| Persona with `error`/`note` flags | Mary read `error` | After close her tile reads no session (idle); a relaunch does not bring the dot back | n/a |
| Whole end | Topbar End session | Every thread deleted as today; fails with nothing changed when the clear fails | `conversation/end-failed` as today |
| Close refused | Bridge rejects while the session is still held | Nothing dropped; failure reported as today | existing `fail()` |

</intent-contract>

## Code Map

- `src/shared/commands.ts:42-46` -- `'session.close'` args become `[target: SessionId | { agentId: AgentId }]`; update the cardinality text and the `SessionTarget` doc nearby if it mentions close.
- `src/preload/harness-api.d.ts:87`, `src/preload/index.ts:210-218` -- `closeSession(target: SessionId | { agentId: AgentId })`; the preload passes the argument through unchanged (a string stays a string, so `invoke(SESSION_CLOSE_CHANNEL, 's1')` is as pinned). Fix the doc comment (it reports `session:closed`; the agent form may emit none).
- `src/main/session-bridge.ts:670-725` -- `closeSession(ctx)`: accept a string or a `{ agentId }` object (anything else `NOT_FOUND`). Resolve a held persona entry by `service.byAgent` for the object form, or by `bySession` for the string form. For a persona (entry.agentId defined, kind `persona`): no `LINES.seatEnded`; kill, `finish`, then `removePersonaThread` below, forget flags, reply ok when a session was live or anything was removed, else `NOT_FOUND`. Room and skill paths unchanged, `removeListedSkillSession` stays the fallback for an unheld string id. Rewrite the header comment (lines 670-679) to say a persona's close deletes its thread. `endConversation` (774-808) unchanged except it already clears everything.
- `src/main/session-voice.ts:47` -- `LINES.seatEnded` no longer called for a persona close; remove it if nothing else uses it, and update the source pin at `tests/negative-surface.test.ts:2887-2896`.
- `src/main/fold/transcript.ts:127` -- add `foldWithoutPersonaThread(state, agentId)` beside `foldWithoutSkillSession`, filtering records where `threadAgentOf(record) === agentId`; same state back when nothing matched; `nextId` kept.
- `src/main/projections/transcript.ts:121,329-343` -- add `removePersonaThread(agentId): boolean` modelled on `removeSkillSession`: filter `runs` by `threadAgentOf(card)`, add their run ids to `ended`, fold the records out, `touched()`; true when any record or stored run went. Declare it in `ProjectTranscript` with its doc comment.
- `src/main/projections/runs.ts:19-47` -- add `removeAgent(agentId)` dropping cards with `threadAgentOf(card) === agentId`; `removeSession` kept for skills.
- `src/main/fold/rail-annotations.ts:84,217` + `src/main/projections/rail-annotator.ts:36-48` -- add a pure `foldWithoutAgent(table, agentId)` dropping every `RunHeld` whose `agentId` matches, and `RailAnnotator.forgetAgent(agentId)` applying it then `tell()` (the target is told `null` for released paths).
- `src/main/fold/persona-state.ts:39-46,201+` + `src/main/projections/personas.ts:23-60` -- add internal event `agent:forgotten` (`{ agentId, at? }`) deleting the agent's `AgentFlags` and any sessions of it, settled so the aggregate recomputes; `PersonaProjection.forget(agentId)` applies it and, so the renderer clears a non-idle dot, still emits the resulting `persona:state` (`idle`) through the existing `flush`. The snapshot after forget lists nothing for that persona.
- `src/main/session-registry.ts:407-420,530,610-640` -- read only; `service.written`, `service.runs`, `service.annotations`, `service.personas` are the holders to clear from the bridge (`service.written.delete(agentId)`).
- `src/renderer/ui/chat/use-conversation.ts:~55,~755-775` -- `ConversationBridge.closeSession` takes the union; `close(agentId)`: call `bridge.closeSession(sessionId ?? { agentId })` (same one call site, so the `bridge.closeSession(` count of 3 holds); stop returning false early when no session is live but the persona has thread records; abandon an in-flight open (`opening.delete(agentId)`); on the reply `commit(personaRemoved(state, agentId))`; a rejection with `session/not-found` for the agent form is treated as already gone; any other rejection keeps today's already-gone check and `fail()`.
- `src/renderer/ui/chat/conversation-state.ts` or `skill-session-state.ts:82-90` -- add pure `personaRemoved(state, agentId)` next to `skillRemoved`: `dropQueued`, delete `sessions[agentId]` and its session id from `busy`, delete `personas[agentId]`, filter `entries` by `isEntryInPersonaThread` (queued entries and harness lines included). Same state back when there is nothing to drop. Use `dropQueued` from `conversation-core.ts:51-61`.
- `src/renderer/ui/shell/shell.tsx:355-367` -- `onClose` offered when `liveSessions.has(persona.id)` or the viewed persona's thread is not empty (`threadEmpty`, `shell.tsx:144`, computed at `app.tsx:483-487`); orphans stay `orphansOf` (`conversation-state.ts:742-766`, live only).
- `src/renderer/ui/app.tsx:294-304,520-529` -- `closeSession` keeps its exact shape (pinned by `tests/negative-surface.test.ts:1138-1140`); to drop the draft on the reply, bump a per-persona epoch (state in app.tsx) used in the persona composer's key (`composer-${agent.id}`) when the close resolves true; focus return to the composer as today.
- `src/renderer/ui/testing/fake-bridge.ts:115`, `src/renderer/ui/chat/use-conversation.test.ts:115`, `src/renderer/ui/app.test.tsx:130,1222,3587`, `src/renderer/ui/chat/dead-card.dom.test.tsx:55` -- fake bridges take the union (record the target; the agent form may emit nothing).
- Pins to amend (not weaken beyond the story): `tests/contract.test.ts:254` (`args('session.close')` now `target`; counts 8/17/36/24 stay), `tests/bridge-contract.test.ts:712-722` (string form unchanged; add the agent form), `tests/negative-surface.test.ts:2887-2896` (`seatEnded` removed), `tests/session-contract.test.ts:230-275`, `tests/preflight-contract.test.ts:149-157` (24 methods, unchanged).
- Tests asserting the old `starts fresh` line or a persona close writing a line: `src/main/session-bridge.test.ts:572,776,897,1072,1733,3486` and the seat helpers around 1860-2020, `src/main/session-stop.test.ts:1237`, `tests/epic-7-audit.dom.test.tsx:698` (a pushed line; keep only if it is a plain `harness:said`) -- amend to the new behaviour. Renderer close tests to amend or extend: `app.test.tsx:1099-1400`, `use-conversation.test.ts:783-822,972-1030,1278-1295`, `conversation-state.test.ts` (near `dropQueued`), `chat-header.dom.test.tsx`, `shell.test.tsx:642-680`.
- `_bmad/planning-artifacts/epics.md` and `EXPERIENCE.md`/`DESIGN.md` notes on Stories 2.8 and 7.4 -- Story 8.7's; do not edit.

## Tasks & Acceptance

**Execution:**
- `src/shared/commands.ts`, `src/preload/harness-api.d.ts`, `src/preload/index.ts` -- the `{ agentId }` target on `session.close` and the bridge method, nothing else on the contract -- AD-3, AD-30
- `src/main/fold/transcript.ts`, `src/main/projections/transcript.ts`, `src/main/projections/runs.ts`, `src/main/fold/rail-annotations.ts`, `src/main/projections/rail-annotator.ts`, `src/main/fold/persona-state.ts`, `src/main/projections/personas.ts` -- the per-persona removal folds and projection methods -- FR140
- `src/main/session-bridge.ts`, `src/main/session-voice.ts` -- one removal for both forms; no line written for a persona; `NOT_FOUND` when neither live nor stored -- FR140
- `src/renderer/ui/chat/use-conversation.ts`, `conversation-state.ts` (or `skill-session-state.ts`), `shell.tsx`, `app.tsx` -- `personaRemoved`, `close(agentId)` for a stored thread, the control's condition, the draft epoch -- FR140, UX-DR56
- Fake bridges and the pins listed in the Code Map -- amend to the new shape
- Tests: main (both forms; thread, stored runs, run cards, written, annotations, flags gone; run in flight; no line; other persona, room and skill session untouched; not-found; persisted file lacks the thread after a flush; a late `recordRun` not revived; `conversation.end` unchanged), fold/projection unit tests for each new function, `personaRemoved`, and renderer tests for each matrix row (control offered for a stored thread, absent for an empty chat, orphan close, queue and draft dropped on the reply with no `session:closed` event, empty chat afterward, rejection leaves everything, keyboard reach)

**Acceptance Criteria:**
- Given the header's `close session` on a persona's chat, then main kills that persona's process if any and deletes its records, stored runs and what main holds keyed to it, the renderer drops its queue and draft on the command's reply, and no `session closed` line is written.
- Given the chat after close, then it is the empty chat of Story 8.2, the tile reads as a persona with no session with no `error` or `note` dot, and the next message starts the seat as in Story 8.3.
- Given a persona with a stored thread and no live session, then `close session` is offered and deletes the thread; a persona with neither offers none.
- Given the control, then it keeps its words, place and rules, and an orphaned live persona is closed by the same removal.
- Given the topbar's End session, then it ends every session and deletes every thread as before and still fails atomically.
- Given the contract, then `session.close` has the additive `{ agentId }` target, `conversation.end` is as declared, `conversation.get` no longer lists the deleted thread, and `CONTRACT_VERSION`, the eight commands, seventeen events and thirty-six channels are unchanged.
- Given any other persona, the room or a skill-first session, then none of its session, thread or files is touched.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 24 findings — high 0, medium 2, low 17, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind/Edge: a late open reply re-adds a dead session after close (`opening.delete` only removes the map entry; the open's `.then` still commits `sessionReady`) — reachable because the control is offered as soon as the first message is recorded; fix: per-agent close counter checked by the persona open paths; test added.
  - `[low]` `[reject]` Blind 1 / Edge claim: `foldWithoutAgent` / `removeAgent` may clear a skill-first session's run attributed to a persona — skill-first sessions and the room have no `agentId` (`openSkill`/`openRoom` build entries without one), so their run cards and annotation holds carry none; only a hand-built test card does.
  - `[low]` `[patch]` Blind 2 / Gap: the skill-first "records and cards alone" test asserts only `entries()` — assertion on `storedRuns()` and a later `recordRun` added.
  - `[low]` `[reject]` Blind 3 / Edge 2: string-form close rejecting `session/not-found` after the session ended lets the renderer drop a thread main kept — needs the session to end between click and reply, and a reload then shows the thread again; a retry branch is more than a direct correction.
  - `[medium]` `[patch]` Blind 4 / Gap 2: closing during an in-flight open (same root cause as the first row; `opening.delete` untested) — test added for the pending open then a fresh seat.
  - `[low]` `[patch]` Blind 5: keyboard reach of the stored-thread control is named in the spec and untested — test added.
  - `[low]` `[reject]` Blind 6: `ctx.nameOf` may be dead plumbing after `seatEnded` — it is still used by the mention check in send; the rewritten test only drops the name assertion.
  - `[low]` `[reject]` Blind 7: no announcement that a thread was deleted — the spec's boundaries write nothing in its place and add no live-region line; the empty chat is the outcome.
  - `[low]` `[reject]` Blind 8: prose store, expanded-run sets and decisions not cleared — held keyed by run id, drawn from entries; with the entries gone nothing draws them.
  - `[false]` `[reject]` Blind 9: a persona entry with no `agentId` loses its session and answers not-found — persona entries are created with an agent id (`open`, `openSeatWith`); the branch is unreachable.
  - `[low]` `[reject]` Blind 10: first-file-in-directory assertion in a main test — the test creates its own temp user-data dir with one transcript file.
  - `[low]` `[reject]` Blind 11: pre-Story-8.1 `session closed` lines and unplaced legacy records — lines tagged by 8.1's attribution go with the thread; unplaced ones are stored and cleared by `conversation.end` as the epic context says.
  - `[low]` `[reject]` Blind 12: `ended` set grows for the window's life — the same design `removeSkillSession` uses; run ids are few.
  - `[low]` `[reject]` Edge 1 (contract test normalisation brittle / hides widening) — the pin is amended to the declared shape; older string callers are pinned by the bridge-contract test.
  - `[low]` `[reject]` Edge 3: `removePersona` replies not-found while it wipes flags for a persona with no thread and no session — the control is not offered in that state and the wipe is harmless.
  - `[low]` `[reject]` Edge 4: close before the first snapshot hydrates returns false — the control is drawn from hydrated entries; unreachable before hydration.
  - `[low]` `[reject]` Edge 5: `personaRemoved` may delete a newer seat opened between request and reply — a send in the window of one synchronous IPC reply is not reachable.
  - `[low]` `[reject]` Edge 6: partial removal when service or project path is undefined — both are set whenever a window has a conversation; not reachable.
  - `[false]` `[reject]` Edge claim: skill-session run cards deleted if they carry an agentId — as the first row; they carry none.
  - `[low]` `[patch]` Gap 1: `annotations.forgetAgent` unproven at the bridge — test added.
  - `[low]` `[reject]` Gap other 1: late open reply could re-add the session — same root cause as the first row, patched there.
  - `[false]` `[reject]` Gap other 2: `service.written.delete` is dead state — it is the holder the spec lists and the accumulate step in the registry reads and writes it; a cheap one-line removal, not a defect.
  - `[false]` `[reject]` Intent audit: manual Electron check not run — stated honestly in the result; no finding.
  - `[false]` `[reject]` Intent audit: chat-header/dead-card dom tests listed in the Code Map were not edited — they needed no change.

## Auto Run Result

Status: done

**Summary.** Closing a persona's chat now ends its session (if any) and deletes its thread: `session.close` takes a session id or an additive `{ agentId }`, and both forms run one removal in main (records, stored runs, run cards, written-file bookkeeping, rail annotation holds, and the `error`/`note`/run flags), writing no `session closed` line. The renderer drops the persona's entries, queue, session and state on the command's reply and remounts its composer to drop the draft; the header offers `close session` when a session is live or a stored thread exists. `conversation.end` and the room and skill-session closes are unchanged; the contract counts and `CONTRACT_VERSION` are unchanged.

**Files changed.**
- `src/shared/commands.ts`, `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- the `{ agentId }` target on `session.close` and the bridge's `closeSession`.
- `src/main/session-bridge.ts`, `src/main/session-voice.ts` -- one persona removal for both forms; `LINES.seatEnded` removed.
- `src/main/fold/transcript.ts`, `src/main/projections/transcript.ts`, `src/main/projections/runs.ts`, `src/main/fold/rail-annotations.ts`, `src/main/projections/rail-annotator.ts`, `src/main/fold/persona-state.ts`, `src/main/projections/personas.ts` -- the per-persona removal folds and projection methods (`agent:forgotten` internal input).
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts`, `shell/shell.tsx`, `app.tsx` -- `personaRemoved`, `close(agentId)` for a stored thread, a per-agent close counter that drops a stale open's reply, the control's condition, the draft epoch.
- Fake bridge and tests across main, renderer and `tests/` (contract, bridge-contract, negative-surface, epic-7-audit) amended and extended.

**Review.** One pass, four layers: 24 findings (medium 2, low 17, false 5). Patched: the late-open-reply race (one root cause, two rows, medium) and four test gaps (bridge-level annotation release, skill-first cards untouched, keyboard reach of the control, in-flight open). Deferred: none. Rejected: 13 low and 5 false, each with its reason in the triage log.

**Follow-up review recommended:** false. One medium entry patched (below the two-entry threshold); no high.

**Verification.** `npm run typecheck` clean; `npm run lint` zero warnings and pins check; `npm test` 6035 unit and 65 watcher tests pass. Not run against a real `claude` or in the Electron app.

**Residual risks.** The manual Electron check in Verification is not run. A string-form close that is refused as not-found after the session ended between click and reply makes the window drop a thread main still holds (rejected as unlikely; a reload would show it again). Orphaned threads with no live session stay undrawn, as the epic's default says.

## Design Notes

Why an `agent:forgotten` input rather than reusing `session:closed`: a user close adds no flags, but flags set earlier (`turn:failed`, `run:failed|stopped`, a `rail:changed` note) outlive any session by design and are cleared only by the next turn; the thread's deletion must clear them too, and an agent-form close with no session produces no `session:closed` at all. The `persona:state` event goes through the existing change-only `flush`, so the renderer's held state is corrected by an event, and `personaRemoved` deleting `personas[agentId]` is the same fact applied locally on the reply.

Why one removal run after `finish`: `finish` ends an in-flight run, which records the card and emits events; removing the thread first would let that record resurrect it. The `ended` set (as `removeSkillSession` uses) keeps any later `recordRun` out.

```
close(target):
  entry = held persona session for target (string -> bySession, {agentId} -> byAgent)
  if entry: kill; finish('closed')                      // no seatEnded line
  agentId = entry?.agentId ?? target.agentId
  removed = transcript.removePersonaThread(agentId)
  service.runs.removeAgent(agentId); written.delete(agentId)
  annotations.forgetAgent(agentId); personas.forget(agentId)
  entry || removed ? ok : NOT_FOUND
```

A string id of a room or skill session keeps its existing path untouched.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: exit 0, zero warnings, pins check passes
- `npm test` -- expected: all suites pass

**Manual checks (if no CLI):**
- In the Electron app with a real `claude`: talk to Mary, press `close session`, confirm the chat is empty with no line, her tile has no dot, and a message starts her seat fresh; relaunch with a stored thread, confirm `close session` is offered and empties it; confirm John's thread is intact. Not exercised by the unit tests.
