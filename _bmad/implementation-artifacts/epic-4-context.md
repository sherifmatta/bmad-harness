# Epic 4 Context: Convene the room — party mode

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let the user convene a room of chosen personas in one conversation they take part in: every face permanently visible, the current speaker lit, no turn-taking gate, and the room's summary written into `_bmad/`. The orchestration already ships (`bmad-party-mode` handles group conversation, user participation and joint decisions), so this epic is only the surface over it, kept honest across window reloads and refused sends. Side-panel sections and transcript tags with no data source must not be built, not even as empty states.

## Stories

- Story 4.1: Choose who is in the room
- Story 4.2: Everyone stays in the room
- Story 4.3: What the room is about, on screen
- Story 4.4: Take the room away with you
- Story 4.5: The room ends, it does not pause
- Story 4.6: Nothing this epic promised not to do
- Story 4.7: The room is still the room after the window reloads
- Story 4.8: A message the room refused says so

## Requirements & Constraints

- Party Mode is the second top-level view behind the single switch with 1:1 Conversation; sessions in the other view keep running.
- A cast chooser opens the room, defaulting to the five core personas. The room is a session of the same kind as a persona session, opened with `/bmad-party-mode`: it has a `sessionId`, no `agentId`, no persona tile, and a harness-register sysline names who opened it and who is present.
- Every chosen portrait stays visible for the room's life. Presence is dimming, never removal; the equaliser animates only for the actual speaker.
- A party turn is portrait, name, role, timestamp and the persona's words, nothing else: no `disagrees`, `evidence` or `unresolved` tag, no quoted-turn reference or quote-back chrome.
- No turn gate: the user types at any point and the message interrupts the current speaker.
- Header: topic, participant count, turn counter, elapsed time, *Write summary to `_bmad/`*. Side panel: the Room section only (topic, opener and time, context documents in scope, destination `_bmad/party/<date>-<topic>.md`), all harness-known. *Open disagreements* and *Decisions so far* never render in any form and no slots are reserved for them.
- The summary is written by the runtime, never by the harness; it appears in the rail as a new row owned by the room, openable like any artifact, with its destination visible beforehand.
- The room has stop, not pause. Stopped: transcript stays, session released. End-session remains the only way to clear a persisted conversation.
- A live room survives a window reload intact (cast and order, topic, real open time, busy state, destination). A room that is not live (stopped, exited, app relaunched) is never restored or invented, and is never persisted across launches.
- A message the room did not receive must not stay on screen as sent; a refused first message or summary ask sets no topic and implies no file. Refusal is stated once, as a fact, in the harness's register. Stop pressed during a waiting send is not a failure. The harness never re-sends, queues or retries.
- The harness never authors, summarises, classifies or attributes persona words, and never stages, ranks or amplifies disagreement. Microcopy is lower case, mono, `·`-separated, no terminal punctuation, facts not guidance.
- Banned: spinner or skeleton, badge or unread count, sound, next-step guidance, any word or control speaking of a reload (*restored*, *reconnected*, *welcome back*), and a 288px panel.
- Layout: panel 240px, hidden at <=1180px; party transcript max 900px; <=1000px unlocks scroll. Only two breakpoints.

## Technical Decisions

- `sessionId` is the key for session-scoped data; `agentId` may be absent. Party turn attribution uses `agentId` internally; name, title and icon are presentation only.
- Every persona utterance is main-thread `text_delta` from the session. Party v1 data is only what the harness already knows.
- The cast comes from the resolved `[agents.*]` roster. Config comes only through BMad's resolvers (including the party skill's own `scripts/resolve_party.py`), each with a timeout and degrade path; `config.toml` and `customize.toml` are never read directly.
- Main owns durable state; the renderer sends commands and never parses raw frames. Stop is an in-band interrupt and the process stays alive. The conversation snapshot is built from main's live memory; 4.7 adds the live room as a new field on the existing `conversation:get` reply.
- 4.7 and 4.8 add no command, event, channel or preload method, and leave `STOP_ACK_MS`, `STOP_RESULT_MS` and the no-gate rule unchanged.
- Layering flows downward only (`renderer/ui` → `renderer/design` → `shared` → `main/projections` → `main/fold` → `main/sources`); party UI in `renderer/ui/party`, session handling in `sources/session`. Events are `noun:verb-past`, declared once in `shared/`.
- The harness writes nothing into the project. Tokens only: no literal colour, dimension, radius or font in a component. Persona markdown is rendered as untrusted.
- Any AC referencing an external format must cite the file it was read from.
- The Story 4.6 audit (`epic-4-audit.dom.test.tsx`) is the epic's negative-surface check; reloaded-room and refused-send states in it must be built by the fold from recorded events, not by hand.

## UX & Interaction Patterns

- Cast strip: horizontally scrolling, cards `flex:1 1 0` at min-width 148px, 44px portrait; opacity .42 idle, .72 hover, 1 speaking. Speaking card gets border, ground, restrained glow, 2px accent ring on the portrait, accent equaliser. Transcript portraits 32px; the live party turn has an accent inset edge.
- `disagree` is friction and `red` is failure; neither is used for party tags in v1.
- One focus-ring treatment, `:focus-visible` only, covering the chooser and header controls. One polite live region per window. Reduced motion disables all animation including the equaliser.
- Product test: if it reads as a chat box with a portrait glued on, it has failed.

## Cross-Story Dependencies

- Builds on Epics 1 and 2 (shell, view switch, roster, rail, document window, session and turn model); independent of Epic 3's card.
- 4.1 creates the room session and sysline that 4.2 to 4.5 build on; 4.2 and 4.3 share header and transcript; 4.4 needs 4.3's destination and 4.1's room ownership; 4.5 relies on Epic 1's stop semantics.
- 4.6 audits 4.1 to 4.5; 4.7 and 4.8 (from the Epic 4 retrospective) extend it. Both change the room paths of `use-conversation.ts`: build 4.7 first, then 4.8. 4.8 leaves *Write summary*'s missing busy guard and stop-as-kill-versus-interrupt to other retro items.
