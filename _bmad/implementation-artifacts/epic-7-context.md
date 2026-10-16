# Epic 7 Context: Work in the conversation, not around it

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stop making the user work around the conversation. A Board story or epic opens its file; the chat renders the markdown personas write; `/` lists the install's skills; each persona keeps its own live session (a seat) until the user ends it; and a chat can start from a skill with no persona, the skill's name as speaker, kept in the rail until ended. Every person in the product is a neutral initials disc and a name, and the illustrated portrait is gone with nothing replacing it.

## Stories

- Story 7.1: Open a story or an epic from the Board
- Story 7.2: Read the markdown the personas write, in the chat
- Story 7.3: Find a skill by typing `/`
- Story 7.7: Every person is an initials disc, and the portrait is gone
- Story 7.4: A seat for each persona that stays until you end it
- Story 7.5: Start a chat from a skill, with no persona
- Story 7.6: Nothing this epic promised not to do

## Requirements & Constraints

- A Board card or epic row opens its markdown file in the existing document window (same title bar, Reveal in Finder / Open in editor / Close). Only a row with a file is a control; one without stays plain text and says nothing about why. The Board still writes nothing and derives no owner.
- Persona and skill output renders as markdown through the one existing sanitized pipeline (HTML disabled, then DOMPurify) at the chat's own type and measure. A streaming turn is plain text and rendered once on completion; the user's turn stays plain text. Raw HTML, style, script and image-by-markup must render nothing.
- `/` as the first character of the composer lists every installed skill with its one-line description, in the install's order, none hidden, ranked or recommended. Typing narrows by prefix, Esc closes, choosing inserts `/<name> ` and sends nothing. This is the only place skills are listed; it is not a launcher.
- Every persona has its own live seat. Switching never ends, replaces or re-briefs another; no cap on live seats; the thread stays the project's one conversation; no `handed to <Name>` line for a tile click or `@name`. A live dot means only "holds context"; after a relaunch no seat shows one.
- Ending one seat is a deliberate lifecycle action (never suggested, highlighted or badged): it clears that seat's context, removes nothing from the thread, and writes one harness line. `conversation.end` still ends every seat and is still the only thing that clears the transcript.
- A message starting `/<name>` naming an installed skill starts a skill-first session; the skill's name is the speaker of every line, plain follow-ups go to the same session, and the thread suggests no next persona. A `bmad-agent-*` name turns to that persona's seat; `bmad-party-mode` opens the room. An unknown name is refused with one harness line, no user turn, text left in the composer.
- A skill-first seat sits in the rail with the live dot and per-seat end, survives a reload as live, and after a relaunch is listed with its thread and no dot (no resume flag; a message to it starts nothing). Its runs appear in Recent activity only, never in a Board column, with no story owner.
- No portrait, illustration or identity device anywhere. Disc sizes: 26px (tile, cast card, Welcome row, cast chooser, Agents-panel row, empty-thread intro, chat turn, skill seat), 22px (chat header only), 20px (small references). The disc is neutral (never a persona colour), the roster `icon` is never drawn, and the Team tile is a 44px row. Portrait module, params, stylesheet, tokens and pinned tests are removed together with the design keys they read.
- Baseline constraints still apply: accessibility floor, single live region, and the product test that it must not read as a chat box with decoration glued on.

## Technical Decisions

- A session has a kind: persona, room or skill-first. Absent `agentId` no longer means the room; code that assumed so must read the kind. Skill-first records carry a session flag and are drawn only in that session's own thread, never the shared thread or the room's.
- The skill list comes from the install's skill manifest (`_bmad/_config/skill-manifest.csv`: `canonicalId,name,description,module,path`, fully quoted RFC 4180, so parse, never split on commas), read once in main by an install-source reader plus a pure fold, and carried as an additive `skills` field of the install snapshot. Missing or unreadable gives an empty list with no error. Roster still comes only from `[agents.*]`.
- The Board's file for a story or epic is resolved in main, never built in the renderer: a story's file is the single entry in `implementation-artifacts/` whose name starts `spec-<epic>-<story>-` (zero or several matches means none); an epic's is `epic-<n>-context.md`. `BoardStory`/`BoardEpic` gain an optional project-relative `file`, recomputed on Board read and watcher change; the renderer passes it unchanged to `doc.open`, which still path-checks inside the output folder.
- Contract changes are additive only; `CONTRACT_VERSION` unchanged (`skill` beside `agentId` on session opened/closed events, session listing, session flag on records). The starting command for a skill-first session carries the whole first message; the renderer sends only typed text and main reads the first word and resolves the skill. Its reply is one of: session opened, a seat or room to turn to, or refused with the word (a reply, not an event).
- Main already keeps one live session per persona and answers a second open with the same one; seats build on that. `session.close` kills the process and writes one harness line; a skill-first close also removes that session's records. CLI is spawned without resume flags.
- Run `skill` is a recorded fact set by main (including for a skill-first first turn), never an input to dispatch.
- The window opens on a New session chat that is a renderer-only surface, not a session: no process, registry entry, transcript, or persistence; one kept per window; the current persona is optional state and no longer falls back to the first tile.
- Markdown trust boundary is unchanged: the chat reuses the one `MarkdownBody` inner-HTML path; nothing else sets inner HTML.

## UX & Interaction Patterns

- `/` list: anchored above the composer on the panel surface with a hairline border; name in mono, description dim; one focused row with the shared focus ring (no accent fill); up/down move, Enter or Tab choose; no count, icon, group heading or recommendation; silent to the live region; opens only on a leading `/`, so `@name` is unaffected.
- A Board card with a file is a native button in the tab order with the shared focus ring and pointer cursor, no icon, count, hover reveal or colour; focus returns to it on close.
- A seat is the persona's existing tile plus the tile's own live dot and word (no new colour, no count, pulses only while working). A skill seat shows a `/` disc and the skill's name in mono, in a Skill sessions group that exists only while one does. A `Skill Session` button, right-aligned in the Sprint board row, opens the empty chat; it lists no skill.
- New harness lines in the existing sysline style: `no skill named <word>`, a session-ended line (`session closed · <Name> starts fresh on the next message` for a seat). They state a fact and stop, and are never attributed to a persona or skill.
- Persona-seat end control lives in the chat header as `close session`.

## Cross-Story Dependencies

- 7.1 and 7.2 are independent and ship alone with no session-behaviour change; do them in either order, then 7.3.
- 7.7 changes no session behaviour but must land before 7.4: the seat and the skill seat are drawn on its 44px initials-disc row.
- 7.5 depends on 7.4 (one bet); 7.3's `/` list and skill resolution feed 7.5.
- 7.6 is the closing audit, last.
- Amends earlier decisions, stated where they stood: no skills list (FR30), composer never invoking a skill (Story 2.9, FR27, FR126), end-session as the only clear (Story 2.8), and a Board card is not a control (Stories 6.8/6.9).
