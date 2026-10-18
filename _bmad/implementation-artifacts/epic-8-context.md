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

- The chat shows only the viewed persona's thread: its turns, the user's turns to it, harness lines about that session, and its run cards. Switching adds, moves or removes nothing. The party room's and skill-first sessions' threads stay their own.
- Selecting a persona (click, Enter, Space) opens its chat and does nothing else: no process, no `/<agentId>` write, no greeting, no record, no live dot. The first message, or a skill button pressed in that chat, starts the session.
- On first message: record the user's turn, spawn, write `/<agentId>` as the first stdin turn, then the message, never in flight together. The user turn shows as sent, not queued. Activation reply and answer draw as one persona turn, in arrival order, no word edited, hidden or reordered.
- `close session` ends the persona's session and deletes its thread (records, stored runs, written-file bookkeeping, rail annotations, queued messages), writes nothing in its place, and touches no other persona, the room or a skill session. It is drawn only on a chat with a live session or a stored thread. `conversation.end` remains the only whole clear.
- `@name` in a persona's composer writes the message, with its chip, as a user turn in the named persona's thread, turns the view there, and writes nothing in the originating chat and no `handed to` line. It never names a skill.
- No unread mark, count, badge, preview or recency ordering on background personas; the tile keeps only its own dot and word. A lifecycle control is never a suggestion, highlighted or badged.
- Another persona's running card is not drawn in the viewed chat; its stop is reached by turning to that persona. A notification click turns the view to the owning persona's chat.
- Cross-cutting: personas keyed by `agentId` never by display name (NFR12); reduced motion and no state by motion or colour alone (NFR17, NFR18); keyboard reach, focus stays on the activated tile, one polite live region (NFR20-22); the product must not read as a chat box with a portrait glued on (NFR28).

## Technical Decisions

- Membership predicate: a record is in a persona's thread when it has an `agentId` and neither a `room` flag nor a `skillSession`. Declare it once in `src/shared/` and use it for the renderer filter, main's removal and the empty-thread test.
- `UserRecord`, `SyslineRecord` and the `harness:said` event gain an optional `agentId`; `PersonaRecord` gains an optional `activation` flag. All additive: `CONTRACT_VERSION` and `TranscriptFile` version 1 are unchanged, one transcript file per project, no per-persona file.
- Main always sets the `agentId`, at record time, from the session being recorded for. The renderer copies what live events carry and never infers.
- Thread drawing is one filter (`Turns` in the chat transcript). Queued messages, composer draft, sent-message record and the empty-thread test are per persona. The activation turn joins only the persona turn that follows it; adjacency alone never joins turns.
- Selecting a persona is renderer-only (sets the current persona, calls nothing in main). An empty persona chat is derived, not stored, and is distinct from the window's one kept New session chat.
- `session.close` gains an additive `{ agentId }` target beside `sessionId`, so a thread with no live session can be closed. Removal is one fold in `fold/` plus one projection method, modelled on `removeSkillSession`; it kills any process, removes the thread, runs and keyed bookkeeping, writes no line. The renderer drops that persona's queue and draft on the command's reply, not on a `session:closed` event.
- Legacy records with no `agentId` are attributed once by main on first read and persisted with the next write: a user turn to the next persona turn's persona, a harness line to the nearest preceding one (or following, if none). Unattributable records stay stored, drawn nowhere, cleared by `conversation.end`. The renderer never attributes.
- A persona removed from the roster keeps its stored thread, undrawn.
- Layering holds: the renderer imports only `src/shared/`; the key is set in the bridge and its writers; the store is a source.

## UX & Interaction Patterns

- Chat header: the viewed persona's 22px initials disc, name and title, with the header's existing state and `close session`, in every state of that chat.
- An empty persona chat is the existing thread introduction (harness text, no button, handler or tab stop), the persona's skill row, and the composer. No greeting, no live dot, no process behind it.
- The live dot appears only when the first message's session is attached.
- No new colour, token, size or component.
- Open items, default behaviour stands until the owner decides: `close session` deletes at once with no confirmation; an orphaned thread is not listed.

## Cross-Story Dependencies

- 8.1 is first and ships alone; 8.2 needs 8.1 (an "empty" chat exists only once other personas' turns stop showing); 8.3 follows 8.2.
- 8.4, 8.5 and 8.6 each follow 8.1 and are independent of each other; 8.7, the closing audit, is last.
- Amends Epic 7's Story 7.4 seat behaviour and the one-thread test in the Epic 7 audit; builds on live background seats (FR132) and the existing `close session`.
- The `@name` default (Story 8.6) is a decision to confirm with the owner.
