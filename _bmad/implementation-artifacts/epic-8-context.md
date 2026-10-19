# Epic 8 Context: A chat per persona

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make switching personas feel like switching between colleagues in a chat app. Each persona gets its own chat and thread; selecting one opens an empty chat that says nothing and spawns nothing until the user writes; the first message starts the seat and the greeting and answer read as one reply; background chats stay live; closing a chat ends the session and deletes that conversation; and `@name` turns to that persona's own chat. This deliberately reverses Epic 7's rule that the thread is the project's one conversation.

## Stories

- Story 8.1: A thread for each persona
- Story 8.2: Select a persona and get an empty chat
- Story 8.3: The first message starts the seat
- Story 8.4: A run in a chat you are not looking at stays in its own chat
- Story 8.5: Close a chat and its history goes with it
- Story 8.6: `@name` turns to another persona's own chat
- Story 8.7: Nothing this epic promised not to do

## Requirements & Constraints

- A persona's chat shows only that persona's thread: its turns, the user's turns to it, harness lines about its session, and its run cards. Switching adds, moves or removes nothing and lands at the thread's bottom. The room's and skill-first sessions' threads stay their own.
- Selecting a persona (click, Enter, Space) opens its chat and does nothing else: no process, no `/<agentId>` write, no greeting, no record, no live dot. Arrow keys still only move focus, which stays on the activated tile.
- First message to a persona with no live session: record the user's turn first (shown as sent, not queued), spawn, write `/<agentId>` as the first stdin turn, then the message, never both in flight. Activation reply and answer draw as one persona turn, in arrival order, no word edited, hidden or reordered. A live seat is unchanged. Spawn failure is one line in that persona's thread, no retry.
- A skill button pressed on an empty persona chat starts the seat with the skill as the session's first stdin turn and no `/<agentId>` (owner decision 2026-10-19): no activation turn, greeting or `activation`-flagged record; the run card is born in that persona's thread. How the persona treats a later message in a never-activated seat is an open item to measure, not assume.
- `close session` ends the persona's session and deletes its thread (records, stored runs, written-file bookkeeping, rail annotations, queued messages and draft), writes nothing in its place, and touches no other persona, the room or a skill session. Offered only when the persona has a live session or a stored thread; works for orphaned personas. `conversation.end` stays the only whole clear and still fails atomically.
- `@name` in a persona's composer sends the message, with its chip, as a user turn in the named persona's thread, turns the view there, and writes nothing in the originating chat and no `handed to` line. It never names a skill; in the room it is unchanged.
- Another persona's running card is not drawn in the viewed chat (not even collapsed); the tile's `work` dot, rail and Agents panel still report it, and its stop is reached by turning to that persona. A notification click turns the view to the owning persona's chat and starts nothing.
- No unread mark, count, badge, preview, recency ordering or suggested next persona; no new colour, token, size or component. A lifecycle control is never a suggestion, highlighted or badged.
- Cross-cutting: personas keyed by `agentId`, never display name (NFR12); reduced motion, no state by motion or colour alone (NFR17, NFR18); keyboard reach, shared focus treatment, one polite live region (NFR20-22); must not read as a chat box with a portrait glued on (NFR28).

## Technical Decisions

- Membership predicate: a record is in a persona's thread when it has an `agentId` and neither a `room` flag nor a `skillSession`. Declare it once in `src/shared/`; the renderer filter, main's removal and the empty-thread test all use it.
- Additive optional fields only: `agentId` on `UserRecord`, `SyslineRecord` and the `harness:said` event; `activation` on `PersonaRecord`; `{ agentId }` as a second target of `session.close`. `CONTRACT_VERSION`, the pinned 17 events and 8 commands, `SESSION_ARGS` and `TranscriptFile` version 1 are unchanged; still one transcript file per project.
- Main sets `agentId` at record time from the session being recorded for; the renderer copies what events carry and never infers or attributes.
- Legacy records are attributed once by main on first read, by one pure fold, persisted with the next write: a user turn to the next persona turn's persona, a harness line to the nearest preceding one (or following if none). Unplaceable records stay stored, drawn nowhere, cleared by `conversation.end`. No record is dropped. Measure on a real stored transcript before pinning, since lines like `failed` may sit beside the wrong persona's turn.
- The `activation` flag joins a flagged reply only with the persona turn that follows it; adjacency alone joins nothing (a background subagent waking the main thread stays a separate turn).
- Selecting a persona is renderer-only (sets current persona, calls nothing in main). An empty persona chat is derived (persona current, no records, no live session), one per persona, distinct from the window's one kept New session chat. Queue, composer draft, sent-message record and the empty-thread test are per persona.
- Removal is one fold in `fold/` plus one projection method modelled on `removeSkillSession`; both `session.close` forms run it. The renderer drops that persona's queue and draft on the command's reply, not on `session:closed`.
- A persona removed from the roster keeps its stored thread, undrawn.
- Turns in a session are strictly serialised (AD-11). Layering holds: renderer imports only `src/shared/`; the store is a source.
- A typed `/bmad-agent-*` is a first message to that persona and may start its seat; selecting a tile may not.

## UX & Interaction Patterns

- Chat header: the persona's 22px initials disc, name and title, with the header's existing state and `close session`, in every state.
- Empty persona chat: the existing harness-text thread introduction (no button, handler or tab stop), that persona's skill row, and the composer; no greeting from the persona. The live dot appears only when the first message's session is attached.
- Defaults standing until the owner decides: `close session` deletes at once with no confirmation; orphaned threads are not listed.

## Cross-Story Dependencies

- 8.1 first and ships alone; 8.2 needs 8.1; 8.3 follows 8.2 and owns the first message and the skill-button start.
- 8.4, 8.5 and 8.6 each follow 8.1 and are independent of each other; 8.7, the closing audit, is last and also amends EXPERIENCE.md, DESIGN.md and the notes on Stories 2.4, 2.8, 2.9, 3.5, 3.10 and 7.4.
- Replaces Epic 7's one-thread audit pin and Story 7.4's seat behaviour; builds on live background seats (FR132) and the existing `close session`.
- The `@name` landing and turn-to behaviour (Story 8.6) is a default the owner has not confirmed.
