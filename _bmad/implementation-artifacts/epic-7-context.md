# Epic 7 Context: Work in the conversation, not around it

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the conversation something the user no longer works around. A Board story or epic opens its file; the chat renders the markdown personas write; `/` lists the install's skills; each persona keeps its own live session (a seat) until the user ends it; and a chat can start from a skill with no persona, the skill's name as its speaker. Every person in the product becomes an initials disc and a name, and the illustrated portrait is removed.

## Stories

- Story 7.1: Open a story or an epic from the Board
- Story 7.2: Read the markdown the personas write, in the chat
- Story 7.3: Find a skill by typing `/`
- Story 7.7: Every person is an initials disc, and the portrait is gone (built before 7.4)
- Story 7.4: A seat for each persona that stays until you end it
- Story 7.5: Start a chat from a skill, with no persona
- Story 7.6: Nothing this epic promised not to do

## Requirements & Constraints

- Board drill-in: an epic row or story card opens its markdown file in the existing document window (same title bar and three escapes). A story's file is the one file in `implementation-artifacts/` named `spec-<epic>-<story>-*`; an epic's is `epic-<n>-context.md`. Matching is by number, never by building a path from the sprint key; zero or several matches means no file. Only cards/rows with a file are native buttons (shared focus ring, no icon, count or colour; focus returns on close); others stay plain text. The Board still writes nothing.
- Chat markdown: completed persona and skill turns render through the one existing pipeline (`markdown-it`, HTML disabled, then DOMPurify) at the chat's own type and measure. A streaming turn stays plain text and renders once when complete; an empty render of a non-empty turn falls back to plain text. The user's turn, syslines, decision blocks, run-card prose and step labels stay plain text. Raw HTML, `<style>`, `<script>` and markup images must render nothing.
- `/` as the first composer character opens a list of every installed skill: all, unhidden, unranked, in manifest order, name plus one-line description. Typing narrows by prefix, `Esc` closes, choosing puts `/<name> ` in the composer and sends nothing. `@name` still addresses only a persona. This is the one allowed skill list (the "no skills list" rule is amended narrowly).
- Seats: activating a tile turns to that persona's live session without ending, replacing or re-briefing any other; no cap on live seats. The thread stays the project's one conversation; no `handed to <Name>` line for a tile click or `@name`. A live dot means only "holds context"; after a relaunch no seat has one. Ending a seat closes only that session, removes nothing from the thread, and writes one harness line; `conversation.end` still ends every seat and is the only thing that clears the transcript. The end control is a lifecycle action, never highlighted or badged.
- Skill-first sessions: a first message `/<name>` naming an installed skill starts one; the speaker is the skill's name (mono, slash disc), never a persona. Later plain messages go to the same live session. It sits in the rail with the live dot and per-seat end, survives reload, and after a relaunch lists with its thread and no dot (a message to it starts nothing). Its runs appear in Recent activity only: never a Board column, no story owner, not counted in the Agents panel. Nothing suggests who to talk to next. `/bmad-agent-*` opens that persona's seat, `/bmad-party-mode` opens the room; an unknown name is refused with one harness line.
- Portraits removed: no illustration or identity device anywhere. Persona and user are a neutral initials disc (`initialsOf` the name) plus a name: 26px on tiles, cast cards, Welcome rows, cast chooser, Agents-panel rows, the empty thread intro and seats; 22px in the chat header only; 20px for small references. The Team tile is a 44px row; no persona colour, tint or icon; roster `icon` is still never drawn. Portrait module, params, stylesheet, tokens, pinned tests and matching `DESIGN.md` keys are removed together.
- Negative surface (closing story): no launcher, palette, recommended, ranked or "next" marker, no counts or badges, no live-region announcement from the `/` list, no unsanitised markup, no project writes. Each of those is a test.
- Cross-cutting: one polite live region per window; tokens only (no literal colours or dimensions); reduced motion removes all animation; state is never carried by colour or motion alone; nothing written into the project.

## Technical Decisions

- A session has a kind: persona (`agentId`), room (a cast) or skill-first (a `skill`); an absent `agentId` no longer means the room. Main already keeps one live session per persona (`byAgent` in `src/main/session-registry.ts`) and answers a second open with the same session. Skill-first records carry a session flag and are drawn only in that session's own thread; the shared thread and the room's draw none. `session.close` kills the process and removes that session's own records.
- The skill list is read once in main from `_bmad/_config/skill-manifest.csv` (columns `canonicalId,name,description,module,path`; RFC 4180 quoted, so parse, never split on commas), via a reader in `sources/install/` and a pure fold in `fold/`. It is carried as an additive `skills` field on the install snapshot and re-read with the install. Missing or unreadable gives an empty list and no error. Matching a typed name is exact, case-sensitive, against `name`. The roster still comes only from `[agents.*]`.
- The Board's file is resolved in main and carried as additive `BoardStory.file` / `BoardEpic.file`; the renderer only passes it to `doc.open`.
- Contract changes are additive only; `CONTRACT_VERSION` unchanged: optional `skill` beside `agentId` on `session:opened`/`session:closed`, its listing in `conversation.get`, a session flag on records. No generic `invoke`. The renderer sends only the text typed; main resolves the skill. `run:started`'s `skill` is a record, never an input to dispatch.
- Skill-first start command (form open: a third argument form of `session.open`, or a new command; decide in 7.5): it carries the whole first message, main reads the first word, and its reply is one of opened (with `sessionId`), a seat/room to turn to, or refused with the word. A refusal is a reply, not an event.
- A window opens on the New session chat: not a session (no `sessionId`, process, registry entry, transcript or `userData`), reached by a `Skill Session` button right-aligned in the Sprint board row of the Team sidebar. One kept empty chat per window, in renderer memory only. The current persona becomes optional state: `currentAgent` returns nobody, not the first tile, when none is chosen.
- Open items to settle in 7.5: a `bmad-agent-*` row with no `[agents.*]` table; the refusal wording when the manifest is missing or a name lacks its slash. A relaunch ends all processes; the CLI is started with no resume flag.
- Trust boundary: the chat reuses the document window's `renderMarkdown` and its single `MarkdownBody` `innerHTML`; nothing else sets inner HTML. Story 1.12's fixture is reused.

## UX & Interaction Patterns

- `/` list: anchored above the composer on `panel-2`, 1px `line` border, `control` radius; one row per skill with name in mono and description in `dim`; one row focused with the shared focus ring (no accent fill); `↑`/`↓` move, `Enter` or `Tab` choose, `Esc` closes. No count, icon, group heading or recommendation; opens only when `/` is the first character.
- Seat: the persona's existing tile plus the live dot in the tile's own dot vocabulary; no count, nothing pulses for being live (only for working). A skill seat shows the skill's name in mono and a slash-in-mono disc (not initials, which would read `B` for every `bmad-*`).
- The New session header reads `New session` and becomes the skill's name once a skill session starts; it carries no persona, status pill or stop.

## Cross-Story Dependencies

- 7.1, 7.2 and 7.3 ship alone and change no session behaviour. 7.4 and 7.5 are one bet and 7.5 depends on 7.4. 7.7 changes no session behaviour but is built before 7.4, because the seat and skill seat are drawn on the 44px initials-disc row it makes. 7.6 closes the epic and amends earlier negative-surface assertions on purpose (a file card is a control, `/` lists skills, personas have seats and live dots).
- Depends on earlier work: the document window and sanitization pipeline (Epic 1), session registry, `@name` chip and handoff (Epic 2), the Board and its Recent activity and Agents panel (Epic 6).
- Amends earlier decisions in place: Story 2.9 (the composer never names a skill; the handoff line), Story 2.8 (ending), FR27, FR30, FR126 and FR123's wording; the Agents panel and Welcome lose portraits via 7.7.
