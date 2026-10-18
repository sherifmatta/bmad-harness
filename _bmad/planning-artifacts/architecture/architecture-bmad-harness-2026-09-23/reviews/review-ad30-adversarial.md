# Adversarial review: AD-30 and the 2026-10-17 amendments

Reviewed: ARCHITECTURE-SPINE.md (AD-30; Amended notes in AD-3, AD-7, AD-18, AD-25, AD-26, AD-29; Open Items), Epic 8 (Stories 8.1 to 8.7), and the code at HEAD. Read-only. Real transcripts read from `~/Library/Application Support/bmad-harness/conversations/` (4 files) for structure only.

Verdict: AD-30 is directionally sound but not yet tight enough to keep Stories 8.1 to 8.7 compatible. Two claims it makes are false against the code and the types, three mechanisms it names do not exist for a thread with no live session, and two older ADs still contradict it.

## Findings (ranked)

### 1. "A record carries at most one of the three" is false: room persona records carry `agentId` AND `room`
`PersonaRecord` has `agentId` and an optional `room` (src/shared/conversation.ts:16-27; foldPersonaSaid keeps both). So "viewed persona's `agentId`" as the filter, the "empty-thread test", "a persona with a stored thread offers close", the removal fold and the legacy "next persona turn" rule each have two buildable readings: with or without excluding `room`. Story 8.1 (filter) and Story 8.5 (removal by `agentId`) can each pass review and disagree: a persona who only spoke in the room has a "thread", and close could delete room records.
Tightening: state that thread membership is `agentId` present AND `room` absent AND `skillSession` absent, and that every thread filter, emptiness test, removal fold and attribution neighbour search uses that one predicate, exported once from `src/shared/`.

### 2. A stored thread with no live session has no removal path; `session.close` takes a `sessionId`
`closeSession` (session-bridge.ts) finds the entry by `sessionId`; a closed or relaunched entry falls to `removeListedSkillSession`, which returns NOT_FOUND unless the transcript lists the id. Skill sessions have a list (`skillSessions`) and a `sessionId`; a persona's thread has neither (a persona can have had several sessions in one thread). So `removeSkillSession` is not a template for the key (it removes by `sessionId` and adds the run ids to `ended`), and Story 8.5's "after a relaunch `close session` still deletes the thread" and "persona whose process exited on its own, thread intact" have no stated command shape. Two stories can invent two paths (a new command, or a sessionId recovered from stored run cards).
Tightening: say how a close names a persona thread with no session (for example `session.close` accepts an `agentId` form, additive, as `session.open` did) and that closing one that has no live session is the same fold.

### 3. Removal of "queued messages" and drafts is assigned to main; both live in renderer memory
`state.queue` is renderer state, dropped only on a `session:closed` event with reason `closed` (conversation-state.ts:848-855); a stored-only thread emits no such event. A composer draft is the Open Item. AD-30 says main removes the queued messages, which main cannot do, and AD-7's carve-out covers only the empty chat. Pair: a main-side story removes records and emits nothing; a renderer story waits for `session:closed`; the dimmed queued message survives a close. Also `conversation.end` must clear drafts.
Tightening: name which removals are main's (records, runs, bookkeeping) and which the renderer performs on an event main sends for a no-session close, and say whether close clears the draft.

### 4. The "activation join" contradicts stored order and has no discriminator
Stored order today is greeting, then the user turn (written when sent, after the activation turn ends), then the answer; real file 461f...: `P P U P U P P`. "Joined with no user or harness record between, drawing the user's first message before them" reorders time, which Story 8.1 and 8.3 both forbid ("in time order", "never reordered"). The adjacency rule is also unsafe: real file 37bb... holds 39 consecutive `P:pm` records with distinct `messageId`s, which adjacency would fuse into one turn; a skill button as the first action writes no user record, so the greeting would merge with the run's prose; AD-11 turns "nobody sent" merge likewise. The Open Item already half-sees this.
Tightening: either main writes the user's first message record before the activation reply (stored order is then the draw order), or main marks the activation reply (a stored field) and only that record is joined; forbid adjacency as the rule.

### 5. "First message shown as sent" plus "`session.open` writes /agent then the message" is not how the code works
`session.open` takes no message (SessionOpenReply, `openSeat(agentId)`); the message travels by `turn.send` after `session:awaiting-turn`, and main answers `session/busy` meanwhile. The message is held in renderer memory (use-conversation.ts `send`/`ensureSession`). Story 8.3 wants it drawn as sent, not queued: a reload during activation then loses a message the user was shown as sent (AD-7, AD-25 "cannot show anything not sent"). Also Story 8.2's "skill button as first action, no greeting waited on" contradicts AD-11 serialisation: `runSkill` returns early without a session and `menu.dispatch` is refused while the greeting turn runs.
Tightening: state who holds the first message between open and the end of the activation turn, and that the greeting is a turn the first action waits for.

### 6. Who sets the key: AD-30 says "in the bridge"; three writers exist and one event lacks the field
User turns are recorded in session-bridge.ts, syslines in `session-registry.ts` `say` via `createVoice`, persona speech in `session-run.ts` `recordSaid`. Live syslines reach the renderer as `harness:said`, whose payload has `sessionId` but no `agentId` (events.ts:91), and live user entries are made by the renderer. AD-3 lists only `UserRecord` and `SyslineRecord`, so a live line is tagged by the renderer mapping `sessionId` to `agentId` (the renderer attributing; also wrong for a line said as the session closes) or the event gains a field AD-3 does not list. The drawn thread would disagree with a reloaded one.
Tightening: list `HarnessSaid.agentId` as an additive field in AD-3, say renderer-made user entries are tagged by the renderer from the session it sent to and reconciled on hydrate, and move "set in the bridge" to "set where main records".

### 7. Legacy attribution: recompute-on-read versus delete-by-tag, and the neighbour rule
If untagged records are attributed only when read, removal by tag leaves them behind, and after John's tagged records are deleted his untagged lines become adjacent to Mary's turns and re-attribute to her. A trailing unanswered legacy user turn is pulled into whichever persona speaks next. Legacy `handed to <Name>` and `session closed · <Name>` lines (Epic 7 allowed several live seats) sit next to another persona's turn and are wrongly attributed. "Persona turn" must exclude `room` ones (finding 1).
Tightening: attribute once at load and persist the tags, or run attribution inside the removal; attribute a line only when both neighbours agree, otherwise leave it undrawn.

### 8. Orphaned persona: unreachable thread
`orphans` in conversation-state.ts:689 is derived from live `sessions` only, and AD-29's `currentAgent` returns nobody for an id not in the roster. A persona removed from the roster with a stored thread and no session cannot be viewed or closed (Story 8.5's orphan clause assumes a live one); only `conversation.end` clears it.
Tightening: say whether a stored thread for a persona not in the roster is drawn (as an orphan row, derived from entries) or accepted as unreachable until `conversation.end`.

## Statements in the spine that still contradict AD-30
- AD-21 (spine line 217): "ending one seat (`session.close`) clears no transcript". Contradicts AD-18 and AD-30.
- AD-11 (line 153): "the active persona's card renders full, a non-active persona's collapses to one live line ... expands on persona switch". Story 8.4 and AD-30 remove the collapse; AD-11 is not amended.
- AD-26 (line 249 and the New session list): "a typed `bmad-agent-*` skill opens that persona's seat". `openFirst` calls `openSeat`, which spawns even for a bare `/bmad-agent-pm`, a start with no message, against AD-30 "a session exists only after the first message". Only the draw clause of AD-26 was amended.
- AD-20: `error` and `note` persona states have no statement on close. The persona projection is not in the removal list, so a tile can keep an `error` whose explanation was deleted.
- AD-19 owner (a sessionId): after close, rows owned by the deleted session show none; not wrong, but unmentioned.

## AD-30 claims about code that the code does not support
- "the key is set in the bridge (the composition root)": only user turns are (finding 6).
- "`removeSkillSession` is the pattern": it removes by `sessionId` from a listed set and adds run ids to `ended` so late `recordRun` calls do not resurrect cards; a persona version needs an agent-keyed analogue and the same late-write guard (the `unlisted()` guard has no persona equivalent, so a late `quiet` line or run record after close recreates a stray thread).
- "its rail annotations ... removed": `RailAnnotator` folds in-flight run events by path; it has no per-persona removal API, and ending the run already releases them. "Written-file bookkeeping" (`service.written`) is written in session-registry.ts:356 and has no reader found.
- "`Turns` ... the one filter" is true, but `Turns` also needs the `room` guard (finding 1), and the sibling `threadEmpty` in app.tsx:429 counts room entries as content.
- "The sent-message record" per persona: no such structure was found in the renderer; the queue is already keyed by `agentId`.
- "`session.open` ... writes `/bmad-agent-<x>` ... and then the message": session.open writes only the activation (session-process.ts:383).

## Smaller pairs worth a line in the spine
- Process exited on its own, thread intact: renderer keeps the queued message "for the next session" (conversation-state.ts:854), but nothing opens one until the user sends; the message sits dimmed with no session and the thread offers close. Also the thread then spans two processes with no shared context and no seam marker.
- Bare `@John` and the notification activation both route through `onActivate`/`ensureSession(always)` today; 8.2 removes it for tiles, 8.6's evidence keeps it for `@name`. State the closed set of events that may spawn: first message, first skill button, `@name` with text, `/bmad-agent-x` with text.
- Run cards with no `agentId` that are not skill-first (legacy) are drawn in no thread.
