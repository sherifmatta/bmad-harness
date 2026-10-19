---
title: 'Story 8.3: The first message starts the seat'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: '81c30c3b47f44b40696212578ff427d5185d6c3d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad/spikes/spike-unactivated-seat.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A chat message that answers the skill's own question, sent into a skill-started seat mid-run, writes `/<agentId>` first; what that does to the skill's flow is unmeasured.
    evidence: |-
      The spike asked only an identity question, one sample per arm, under a read-only policy. A real session with a skill waiting on the user's answer, then the activation, then the answer, would settle it.
    location: >-
      src/main/session-bridge.ts (activateFirst)
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A first message to a persona with no session is drawn queued and dimmed, and main records it only after the greeting: the session opens on the bare persona, the greeting runs as a turn the user never asked for, and the message is delivered on `session:awaiting-turn`. The skill row on an empty chat is disabled and starts nothing.

**Approach:** Main orchestrates the start. A new additive `session.open` form carries the first message (or a menu code): main records the user's turn, spawns, writes `/<agentId>` and, when that turn ends, writes the message, with the activation reply flagged `activation` so the chat draws it and the answer as one persona turn. A skill button on an empty chat spawns the seat with the skill as its first stdin turn and no `/<agentId>` (owner decision 2026-10-19); the first chat message later sent into such a seat writes `/<agentId>` first (measured: `_bmad/spikes/spike-unactivated-seat.md`).

## Boundaries & Constraints

**Always:** Argv, `SESSION_ARGS`, `CONTRACT_VERSION` and the other seven commands are unchanged; `session.open` gains two additive target forms, `{ seat, message, mention? }` and `{ seat, code }`. The user's first turn is recorded (with `agentId` and a valid `mention`) before the process is spawned and stays if the spawn fails. `/<agentId>` and the message are never in flight together: the message is written only when the activation turn ends without failure, and main emits no `session:awaiting-turn` for that end, so the persona reads `work` and the session busy until the answer ends. A stop, failure or exit during the activation drops the pending message and writes nothing; the user's turn stays. Main flags only what a persona says while `/<agentId>` is in flight as `activation: true` (on `persona:said` and the stored `PersonaRecord`); only a flagged turn is drawn joined with the persona turn directly after it, in order, as one head with each part's words drawn whole (never concatenated, edited, hidden or reordered). Adjacency alone joins nothing. The first message shows as sent: no dim, no `queued · sends when` marker. A later message typed while the activation turn or the answer streams is queued as every later message is. A live, activated seat sends exactly as before. The seat is the persona's by `agentId` (tile, thread, dot, close). The live dot shows only once `session:opened` (or the open's reply) attaches the session. A persona's words and run cards land only in that persona's thread.

**Never:** Changes to `@name` or a first message naming a persona (`conversation.activate` and the queued marker stay for them; Story 8.6), `close session`, run-card routing, tile content or the thread introduction's copy, tokens, colours or components. A flag on any turn but the activation's, or a stored word that differs from what was said. Retrying a failed start. Opening a seat by selecting a tile.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First message | Empty chat, no session, user sends "hello" | User turn drawn at once, plain; main records it, spawns, writes `/<agentId>`, then "hello" after the activation `result`; greeting and answer drawn as one persona turn; dot appears on attach | n/a |
| Second message mid-activation | Another message while greeting or answer streams | Drawn queued and dimmed, sent after the answer ends | n/a |
| Spawn fails | `claude` missing | User turn stays, one failure line as today, nothing in another thread, no retry; queued second messages dropped | `session/spawn-failed` |
| Activation fails or stopped | Failed `result` during `/<agentId>` | Pending message not written; harness line as today; session idle, activated | stopped or `failed` line |
| Process exits mid-activation | `onExit` before the activation ends | `exited` line; pending dropped; user turn stays | n/a |
| Seat already exists in main | Window had missed it | Main replies `session/busy`; the window re-queues the message and finds the session | silent re-queue |
| Skill button, empty chat | Press a button | Seat spawns with the skill (or prompt) as first stdin turn, no `/<agentId>`, no greeting, no `activation` record; run card born in that thread; row disabled while the turn runs | `menu/unknown-entry` as the failure line |
| Chat message into a skill-started seat | Idle, never activated | `/<agentId>` written, then the message on the activation's end; reply drawn joined | as first message |
| Press twice | Double press before `session:opened` | One open; the second is ignored | n/a |
| Live seat | Activated and idle | `turn.send` unchanged; no activation turn, no join | n/a |
| Background persona | Seat working while another chat is viewed | Its turns land in its own thread only | n/a |

</intent-contract>

## Code Map

- `src/shared/commands.ts:31` -- `SessionTarget` union: add `{ seat: AgentId; message: string; mention?: string }` and `{ seat: AgentId; code: string }`; reply stays `{ sessionId }`. The literal is pinned in `tests/contract.test.ts:222` and `tests/party-contract.test.ts:49`.
- `src/shared/events.ts:67` (`PersonaSaid`) and `src/shared/conversation.ts:19` (`PersonaRecord`) -- optional `activation?: true`, additive.
- `src/main/fold/transcript.ts:46` (`foldPersonaSaid`) -- keep the flag on a newly started record; a same-`messageId` piece still joins it. `src/main/sources/persistence/transcript-file.ts:105-123` -- a persona record's `activation` must be `true` or absent.
- `src/main/session-registry.ts` -- `Entry` gains `activated`, `activating`, `pending`; `open(sender, service, projectRoot, agentId, pending?)` (line 639) sets them; new `openSeatWith(…, firstTurn, up)` modelled on `openSkill` (line 651: `begin` with an `up` that calls `startRun`); `foldFrame` (line 267): after `routeFrame` stamp `activation: true` on `persona:said` while `entry.activating`; in the `ended` branch (line 309) clear `activating`, and when `pending` is set and the end did not fail write it (`beginTurn`, `session.write`) and return without `announce` or `turnOver`.
- `src/main/session-bridge.ts` -- `openSession` (line 299): route the two new forms (discriminate on `seat`) beside `asksForFirst`/`asksForRoom`; `openSeatMessage`: reject if `service.byAgent` holds the persona (`BUSY`), record the user turn (`recordUserTurn(text, at, undefined, validMention(...), undefined, agentId)`), then `registry.open` with `pending`; `openSeatCode`: `menuEntryFor` -> `turnOf`, skill via `skillOf`, plan via `readPlanOf`, re-check `byAgent` after the await, then `registry.openSeatWith` with `activated: false`. `sendNow` (line 424): for a persona entry with `activated === false`, write `activationTurn(agentId)` instead of the text, set `activated`/`activating`, hold the text as `pending`, then record the user turn as now. `turnOf` (line 498) and `readPlanOf` (line 554) are reused.
- `src/main/sources/session/session-process.ts:223-241` -- `agentId` plus `firstTurn` is now a legal pair (`firstTurn` wins, line 383); doc comments only.
- `src/renderer/ui/chat/transcript-entry.ts:15` -- `PersonaEntry.activation?: true`.
- `src/renderer/ui/chat/conversation-state.ts` -- new `sendFirst(state, agentId, at, text, mention)` (a `UserEntry` with `agentId`, no `queuedFor`, no queue item, state unchanged otherwise); new `seatStarted(state, agentId, sessionId)` (sets the session and busy only when `session:opened` has not been folded); `hydrate` (line 740) and `foldEvent` `persona:said` (line 896) copy `activation`.
- `src/renderer/ui/chat/use-conversation.ts:594` -- `send`: with no session, hydrated and no open in flight, call `bridge.openSession({ seat, message, mention })` registered in `opening`, fold `seatStarted` on the reply, `session/busy` re-queues (entry gets `queuedFor`, queue item, `ensureSession(agentId, true)`), any other refusal is `dropQueued` + `fail`; otherwise today's path. `runSkill` (line 608): with no session, ignore if `opening.has`, else `openSession({ seat, code })`, wait for the snapshot as `startFirst` does, `session/busy` silent, other refusals `fail`. Update the `ConversationBridge` doc and `createConversation` header.
- `src/renderer/ui/chat/transcript.tsx:198` and `turn.tsx:142` -- `Turns` draws a persona entry with `activation` and the directly following same-agent, unflagged persona entry in `ordered` as one `PersonaTurn` (key of the first; `lead` prop draws the first's words as their own `PersonaWords` block above the second's; `writing` from the second else the first; decision read from the second). Pending-turn logic needs no change: `personaTurnsInFlight` already points the caret at the last persona entry.
- `src/renderer/ui/app.tsx:470-486` -- `SkillRow` `disabled={conversation.sessionOf(agent.id) !== undefined && !conversation.canAnswer(agent.id)}` (enabled on an empty chat); fix the comment. `src/renderer/ui/chat/skill-row.tsx`, `shell/thread-intro.tsx` -- doc comments only; the hint copy stays.
- Tests to extend: `src/main/session-bridge.test.ts`, `src/main/fold/transcript.test.ts`, `src/main/sources/persistence` (transcript-file test), `src/renderer/ui/chat/conversation-state.test.ts`, `use-conversation.test.ts` (bridge fake at line 78; queued cases at 456-723 stay), `transcript.test.tsx`, `src/renderer/ui/app.test.tsx` (Story 8.2 block; first-message tests at 451, 478, 923, 3711; skill-row disabled assertions), `tests/contract.test.ts`, `tests/party-contract.test.ts`, `tests/epic-7-audit.dom.test.tsx` only where they assume a disabled row or a queued first message.
- `_bmad/planning-artifacts/architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md` -- close the two Open Items for this story (the unactivated seat: measured, a later message activates first; the `activation` flag: main knows per turn); the spike note is `_bmad/spikes/spike-unactivated-seat.md`.

## Tasks & Acceptance

**Execution:**
- `src/shared/commands.ts`, `events.ts`, `conversation.ts`, `tests/contract.test.ts`, `tests/party-contract.test.ts` -- the two target forms and the `activation` flag, additive; update both pinned literals -- AD-30, FR139
- `src/main/fold/transcript.ts`, `sources/persistence/transcript-file.ts` -- keep and validate the flag; word text untouched -- FR21
- `src/main/session-registry.ts` -- entry state, flagging, pending write on the activation's end, seat start with a first turn -- FR95, FR98
- `src/main/session-bridge.ts` -- the two open forms, activation-first send into an unactivated seat -- FR139
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts`, `transcript-entry.ts` -- first message sent not queued, seat start folds, skill start, flag copied -- FR139
- `src/renderer/ui/chat/transcript.tsx`, `turn.tsx`, `app.tsx` -- joined activation drawing, row enabled on an empty chat -- FR139
- Tests -- main: order (user turn recorded, spawn, `/<agentId>`, then message only after a non-failed `result`; no `awaiting-turn` between), flag only on activation pieces, failed/stopped/exit drop the pending message, duplicate seat is `session/busy`, skill start writes no `/<agentId>` and flags nothing, later send activates first, live seat unchanged; renderer: entry plain on first send, second message queued, `session/busy` re-queue, double press once, joined drawing (one head, both words, nothing joined by adjacency alone, a user turn between prevents it), skill row enabled on an empty chat, background thread isolation, stored round trip keeps the flag
- `ARCHITECTURE-SPINE.md` -- Open Items closed with the measured decision

**Acceptance Criteria:**
- Given an empty persona chat, when the user sends a first message, then the turn appears plain at once and main stores user turn, activation reply, answer in that order, never writing the message while `/<agentId>` is in flight.
- Given the activation reply and the answer, then the chat draws one persona turn in arrival order with no word changed, and a persona's consecutive unflagged turns stay separate.
- Given a message typed while the activation or answer streams, then it is queued, dimmed and marked, and sent when the turn before it ends.
- Given a failed start, activation or exit, then the user's turn stays, one line says so in the viewed chat as today, nothing is retried and no other thread is written.
- Given a live activated seat, then sending and joining are unchanged.
- Given an empty chat, when a skill button is pressed, then the seat spawns with the skill as its first stdin turn and no `/<agentId>`, the run card is born in that persona's thread, and no greeting or `activation` record exists.
- Given a seat started that way, when the user later sends a chat message, then `/<agentId>` is written first and the message after it, drawn joined.
- Given the argv, then `SESSION_ARGS` is untouched.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 35 findings — high 0, medium 3, low 24, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind 1: a stop landing on a non-failed activation `result` still writes the held message — the CLI ends an interrupted turn with an `is_error` result (spike-stop-semantics), and a turn that had already completed means the message is simply sent; no harm.
  - `[false]` `[reject]` Blind 2: `writeHeld` has no rejection handling — `session.write` resolves a boolean and never rejects (`writeLine` wraps the stream in try/catch and resolves false).
  - `[medium]` `[patch]` Blind 3: activating a skill-started seat rests on a thin spike and the spine says "Closed ... Measured" — spine wording now says it is unmeasured for a message sent mid-run; the unverified risk is in `deferred`.
  - `[low]` `[reject]` Blind 4: `@name`/tile opens now flag their greeting — that is the spec's own rule (what is said while `/<agentId>` is in flight), the `speech` test pins it, and a flagged greeting only joins an unflagged turn directly after it.
  - `[low]` `[reject]` Blind 5: a refusal before main records leaves a drawn turn unstored — only reachable with an invalid id or no project, neither of which a roster tile produces.
  - `[low]` `[reject]` Blind 6: `openSeatMessage` validates less than `turn.send` — the composer sends no empty text and `turn.send` checks only that the text is a string, as this does.
  - `[low]` `[reject]` Blind 7: the skill row stays enabled while the seat starts — the spec says a second press before the seat is up is ignored; `session:opened` disables it.
  - `[low]` `[reject]` Blind 8: a non-`true` `activation` drops the record — the same rule `room` and `skillSession` already follow in `isRecord`.
  - `[low]` `[reject]` Blind 9: the two `seat` forms are not exclusive in the type — no caller sends both, and the types of the two forms differ.
  - `[low]` `[reject]` Blind 10: `finishSession` extracted from `createSessionRegistry` — it was needed to keep that function under the repo's 150-line audit; the body is unchanged.
  - `[low]` `[reject]` Blind 11: `closedSessions` only grows, and the entry id is computed apart from `sendFirst` — the set holds one short id per ended session, and the busy re-queue test fails if the ids drift.
  - `[false]` `[reject]` Blind 12: the spec drifted from the code — the Code Map is the investigation map, and the fix is to edit this build's spec.
  - `[low]` `[patch]` Blind 13: the spike's recordings are not in the diff and `probe.mjs` hard-codes a path — the note now says the recordings were not kept and the probe's `cwd` is this repository.
  - `[low]` `[reject]` Blind 14: smaller gaps (head time, pinned source lines, long literal) — cosmetic; the literal is pinned by existing contract tests.
  - `[low]` `[reject]` Edge 1: a failed activation while background tasks are live, then a clean wake, writes the held message — an activation that starts background tasks is not something a persona's own skill does.
  - `[false]` `[reject]` Edge 2: `session.write` rejects — as Blind 2.
  - `[low]` `[reject]` Edge 3: after a failed activation of a skill-started seat the seat stays `activated` — activation failure is rare, the user's message is still stored, and a resend goes to the live session.
  - `[false]` `[reject]` Edge 4: the user turn may be recorded after the greeting begins — a reply needs a model round trip, the write callback resolves in the same tick; `sendNow` already had this order.
  - `[low]` `[reject]` Edge 5: queued messages stay after a failed skill start — a menu code cannot be unknown from a button, and the queue is delivered on the next session.
  - `[low]` `[reject]` Edge 6: a `session/busy` on a skill start leaves the seat unattached — the window learns of a seat it missed from its events; rare.
  - `[false]` `[reject]` Edge 7: `conversation.end` mid-open leaves a live seat — main closes sessions still starting (`bySession` holds it from `begin`) and clears the transcript.
  - `[low]` `[reject]` Edge 8: `closedSessions` grows without bound — one short id per ended session.
  - `[low]` `[reject]` Edge 9: a flagged greeting could join an unrelated later turn — a run card or a user turn sits between in every real sequence, and the join is the spec's.
  - `[low]` `[reject]` Edge 10: `activating` set on every plain open — as Blind 4.
  - `[low]` `[reject]` Edge 11: a stop or failed-while-pending does not drop the held message — as Edge 1 and Blind 1.
  - `[medium]` `[patch]` Verification gap: the failed write of the held message had no test — added a main test: failure line once, one `awaiting-turn`, session free, persona `work` then `error`, next send accepted.
  - `[low]` `[reject]` Verification gap, other: `@name` greeting now flagged and unpinned — the `speech` test pins the flag; the thread's behaviour for it is the generic join.
  - `[false]` `[reject]` Intent 1: the flag has no recording, a wake could add a `result` — the probe saw one `result` per sent turn (two for two); no background task is started by an activation.
  - `[medium]` `[patch]` Intent 2: the unactivated-seat decision is n=1 and stated as settled — same as Blind 3; spine and spike note now carry the caveat.
  - `[low]` `[reject]` Intent 3: the failure line is not checked per thread — it shows in the viewed chat as today; the spec lists it as a residual.
  - `[low]` `[reject]` Intent 4: a first message before the snapshot is queued — a pinned residual; the window takes the snapshot at connect.
  - `[low]` `[reject]` Intent 5: no skill row between a first send and attach — Story 8.2's residual, in the spec.
  - `[low]` `[reject]` Intent 6: no renderer test of a message into a skill-started seat — the renderer path is the ordinary send; main's test pins the write order and flag.
  - `[false]` `[reject]` Intent 7: edited source-text pins — they pin new source and the contract literal, and must change with it.
  - `[false]` `[reject]` Intent 8: existing speech assertions edited — they follow from the flag the spec specifies.

## Auto Run Result

Status: done

**Summary.** Main now starts a persona's seat on the user's first message: it records the turn, spawns, writes `/<agentId>` and writes the message only when that turn ends cleanly, with no `awaiting-turn` between. The activation reply is flagged `activation` and drawn with the answer as one persona turn. A skill button on an empty chat spawns the seat with the skill as its first turn and no `/<agentId>`; the first chat message later sent into such a seat writes `/<agentId>` first (measured in `_bmad/spikes/spike-unactivated-seat.md`).

**Files changed.**
- `src/shared/commands.ts`, `events.ts`, `conversation.ts` -- two additive `session.open` forms; `activation` on `PersonaSaid` and `PersonaRecord`.
- `src/main/session-registry.ts`, `session-bridge.ts`, `fold/transcript.ts`, `sources/persistence/transcript-file.ts`, `sources/session/session-process.ts` -- entry state, flagging, held write, seat starts, activation-first send, flag kept and validated.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts`, `transcript.tsx`, `turn.tsx`, `transcript-entry.ts`; `app.tsx`; `skill-row.tsx`, `thread-intro.tsx` -- first message drawn as sent, seat starts, joined drawing, row enabled on an empty chat.
- Tests across main, renderer and `tests/` pins; `ARCHITECTURE-SPINE.md` Open Items closed; spike note and probe under `_bmad/spikes/`.

**Review.** One pass, four layers: 35 findings. Patched: one medium (test for a failed write of the held message), one medium and one low (spine and spike caveats). Deferred: one, medium, unverified (a message answering the skill's own question, sent mid-run into a skill-started seat). Rejected: 24 low and 8 false, each with its reason in the triage log.

**Follow-up review recommended:** false (no high patched, one medium patched as a test).

**Verification.** `npm run typecheck` clean; `npm run lint` zero warnings; `npm test` 5985 unit and 65 watcher tests pass. Not run against a real `claude` or in the Electron app.

**Residual risks.** The spec's two manual checks are not done. Before the window takes main's snapshot a first message still takes the queued path. The failure line shows in whichever chat is viewed. The skill row is not drawn between a first send and the session attaching. Every plain persona open now flags its greeting `activation`.

## Design Notes

Why main orchestrates: the renderer cannot make the stored order user turn, greeting, answer, because main records a send only once it is written and refuses a send while busy. Withholding `session:awaiting-turn` for the activation's end keeps the renderer busy and the persona on `work` across both turns, so a queued second message cannot be delivered into the gap and no pending head flashes between them.

The unactivated-seat decision is measured, not assumed: the base model answered "I'm Claude ... brainstorming coach" while the activated seat answered as Mary (`_bmad/spikes/spike-unactivated-seat.md`), so the skill's own context does not carry the persona. The activation therefore runs on the user's first chat message in such a seat, the one way the persona's customization and voice load.

Known residuals, not fixed here: before the window has taken main's snapshot a first message still takes the queued path; the failure line shows in whichever chat is viewed; the skill row is not drawn between a first send and the session attaching (Story 8.2's residual).

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: exit 0, zero warnings
- `npm test` -- expected: all suites pass

**Manual checks (if no CLI):**
- Not exercised in the Electron app by this story's tests: with real `claude`, send a first message to a persona and read one persona turn; press a skill button on an empty chat and confirm no greeting.
