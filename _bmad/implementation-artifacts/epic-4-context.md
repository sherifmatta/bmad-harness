# Epic 4 Context: Convene the room — party mode

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let the user convene a room of chosen personas in one conversation they take part in: every face permanently visible, the current speaker lit, no turn-taking gate, and the room's summary written into `_bmad/`. The orchestration already ships and works (`bmad-party-mode` handles group conversation, user participation and joint decisions), so this epic is only the surface over it. Two of the mockup's side-panel sections and the transcript's disagreement tags have no data source and must not be built, not even as empty states.

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

- Party Mode is the second top-level view behind the single switch with 1:1 Conversation; sessions in the other view keep running. No third view.
- A cast chooser opens the room, defaulting to the five core personas. The room is a session of the same kind as a persona session, opened with `/bmad-party-mode`; it has a `sessionId` and no `agentId`, gets no persona tile, and a sysline in the harness's own register names who opened it and who is present.
- Every chosen portrait stays visible for the room's whole life. Presence is dimming, never removal; the current speaker is lit; the equaliser animates only for the actual speaker.
- A party turn is portrait, name, role, timestamp and the persona's words and nothing else: no `disagrees`, `evidence` or `unresolved` tag, no quoted-turn reference, no quote-back chrome.
- No turn gate: the user types at any point and the message interrupts the current speaker. `@<name>` directs a question at a persona; it does not gate or reorder speakers.
- The header carries topic, participant count, turn counter, elapsed time and *Write summary to `_bmad/`*. The side panel renders the Room section only: topic, who opened it and when, context documents in scope, and the destination `_bmad/party/<date>-<topic>.md`, all harness-known. *Open disagreements* and *Decisions so far* never render in any form and no slots are reserved for them.
- The summary file is written by the runtime, never by the harness. It appears in the rail as a new row owned by the room, distinct from any persona, openable like any artifact. Its destination is visible in the Room section before it is written.
- The room has stop, not pause; no *Pause room* control. Stopped: transcript stays, session released. End-session stays the only way to clear a persisted conversation.
- The harness never authors, summarises, classifies or attributes words to a persona, and never stages, ranks or amplifies disagreement. Harness microcopy is lower case, mono, `·`-separated, no terminal punctuation, facts not guidance.
- Banned here: spinner or skeleton, badge or unread count, sound, next-step guidance.
- Layout: side panel 240px (the 288px literal is superseded and must not appear), hidden at window width <=1180px; party transcript max 900px; at <=1000px the shell unlocks scroll and cast cards wrap. Only two breakpoints.

## Technical Decisions

- `sessionId` is the primary key for everything session-scoped; `agentId` may be absent. A rail row's owner is a `sessionId` shown as its `agentId` where one exists; a party summary row shows the room. Party turn attribution uses `agentId` internally; display name, title and icon are presentation only.
- Every persona utterance is main-thread `text_delta` from the session; the harness authors none. Party v1 data comes only from what the harness already knows (topic, opener, context docs, destination path).
- The cast comes from the resolved `[agents.*]` roster (name, title, icon, module, team). Config comes only through BMad's resolvers, including the party skill's own `scripts/resolve_party.py` (a different directory from the others), each with a timeout and a degrade path. `config.toml` and `customize.toml` are never read directly.
- Layering flows downward only (`renderer/ui` → `renderer/design` → `shared` → `main/projections` → `main/fold` → `main/sources`); party UI lives in `renderer/ui/party`, session handling in `sources/session`. Events are `noun:verb-past`, declared once in `shared/`. Main owns durable state; the renderer sends commands and never parses raw frames.
- The harness writes nothing into the project; macOS-specific calls stay in `src/main/windows/`. Tokens only: a literal colour, dimension, radius or font in a component is a defect. The persona's untrusted markdown content is rendered as untrusted.
- A format that an AC references must cite the file it was read from (standing story-creation rule).

## UX & Interaction Patterns

- Cast strip: horizontally scrolling, cards `flex:1 1 0` at min-width 148px, 44px portrait, name, title, micro status. Opacity .42 idle, .72 hover, 1 speaking. A speaking card gets the border, ground, restrained glow, a 2px accent ring on the portrait, and the accent equaliser. Transcript portraits are 32px. The live party turn carries an accent inset edge.
- `disagree` is friction, `red` is failure; never conflated, and neither is used for party tags in v1.
- Focus: one ring treatment, `:focus-visible` only, covering the cast chooser and the party header controls. One polite live region per window, never assertive.
- Reduced motion disables all animation including the equaliser, with no carve-out.
- Product test outranks all of the above: if it reads as a chat box with a portrait glued on, it has failed.

## Cross-Story Dependencies

- Builds on Epics 1 and 2 (shell and view switch, roster, rail, document window, session and turn model, orphan and relaunch behaviour); independent of Epic 3's card, though the room runs sessions through the same turn-end fold and test files, so Epic 3's open retro items on stop semantics, accessibility and test debt touch it.
- 4.1 creates the room session and the sysline that 4.2 to 4.5 build on. 4.2 and 4.3 share the header and transcript. 4.4 needs 4.3's destination path and 4.1's room ownership. 4.5 relies on the session model's stop semantics from Epic 1.
- 4.6 is the closing negative-surface audit of 4.1 to 4.5.
- 4.7 and 4.8 were added after the Epic 4 retrospective (findings F1 and F2). 4.7 changes the conversation snapshot and the renderer's room hydration; 4.8 changes the room send path in `use-conversation.ts` and `session-bridge.ts`. Build 4.7 first. Both extend the 4.6 audit.
