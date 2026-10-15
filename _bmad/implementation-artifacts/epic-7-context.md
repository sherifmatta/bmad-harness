# Epic 7 Context: Work in the conversation, not around it

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stop making the user work around the conversation. A Board story or epic opens its file; the chat renders the markdown personas write; `/` lists the install's skills; each persona keeps its own live session (a seat) until the user ends it; and a chat can start from a skill with no persona, the skill's name as its speaker. Every person in the product becomes a neutral initials disc plus a name, and the illustrated portrait is gone.

## Stories

- Story 7.1: Open a story or an epic from the Board
- Story 7.2: Read the markdown the personas write, in the chat
- Story 7.3: Find a skill by typing `/`
- Story 7.7: Every person is an initials disc, and the portrait is gone
- Story 7.4: A seat for each persona that stays until you end it
- Story 7.5: Start a chat from a skill, with no persona
- Story 7.6: Nothing this epic promised not to do

## Requirements & Constraints

- Board drill-in: a story's file is the one `spec-<epic>-<story>-*.md` in `implementation-artifacts/`; an epic's is `epic-<n>-context.md` (never a retrospective). Match by number, never by building a name from the sprint key; zero or several matches means no file. Only a card or row with a file is a native button (shared focus ring; no icon, count, path or colour; focus returns on close); the rest stay plain text with nothing saying why. It opens in the existing document window; the Board writes nothing.
- Chat markdown: a completed persona or skill turn renders through the one existing pipeline (`markdown-it` with HTML off, then DOMPurify) at the chat's own type and measure, never the document window's class. A streaming turn stays plain text and renders once at its end; an empty render of a non-empty turn falls back to plain text. The user's turn, syslines, decision blocks, run-card prose and step labels stay plain. Raw HTML, `<style>`, `<script>`, images and `javascript:` links render nothing; links are inert text.
- `/` as the first composer character opens a list of every installed skill: all, unhidden, unranked, manifest order, name (mono) plus description (`dim`). Typing narrows by case-insensitive prefix; `↑`/`↓` move, `Enter`/`Tab` put `/<name> ` in the composer and send nothing, `Esc` closes. No count, icon, group, accent fill or live-region announcement. `@name` still addresses only a persona. This is the only skill list in the product; a persona's composer sends `/<name>` as typed and starts nothing.
- Seats: turning to a persona (tile or `@name`) never ends, replaces or re-briefs another seat; no cap; the thread stays the project's one conversation and no `handed to <Name>` line is written for a tile click or `@name`. A live dot means only "holds context" (no count, no pulse for being live); after a relaunch no seat has one and the next message starts with no context. The header's `close session` ends one seat, keeps every record, writes one harness line, and is never highlighted or badged. `conversation.end` still ends every seat and is the only thing that clears the transcript.
- Skill-first sessions: a first message `/<name>` naming an installed skill (exact, case-sensitive) starts one. Speaker is the skill's name in mono, never a persona. Later plain messages go to the same live session. Its lines appear only in its own thread, not the shared thread or the room's. Ending it kills the process, removes its own records, writes no line, and lands the window on the New session chat. After a relaunch it is listed as `ended` with its thread; a message to it gets one line `session ended`, starts nothing and stays in the composer. Runs appear in Recent activity as the skill's name plus `started`/`finished`/`stopped`/`failed` (no code), never in a Board column, no story owner, not counted in the Agents panel or state strip. Nothing suggests who to talk to next.
- First-message routing in the New session chat: `/bmad-agent-*` turns to that persona's seat, `/bmad-party-mode` to the room (text after the name is sent there, and the empty chat is spent); anything else, `@name` included, is refused with one line `no skill named <word>`: no user turn, no persona answers, text stays in the composer.
- Portraits removed: no illustration or per-persona identity device. Persona and user get an initials disc (`initialsOf`) plus a name: 26px on tiles, cast cards, Welcome rows, cast chooser, Agents-panel rows, thread intro and seats; 22px in the chat header only; 20px for small references. Team tile is a 44px row, measured in the running app. Persona discs are neutral (only the user's is tinted); roster `icon` is never drawn. Portrait module, tokens, stylesheet, pinned tests and matching `DESIGN.md` keys are removed in one change.
- Negative surface (closing story, each a test): no launcher, palette, recommended, ranked or "next" marker; no counts or badges; no unsanitised markup; one place sets inner HTML; no project writes.
- Cross-cutting: tokens only (no literal colours or dimensions); one polite live region per window; reduced motion removes animation; state never by colour or motion alone.

## Technical Decisions

- A session has a kind: persona (`agentId`), room (a cast) or skill-first (a `skill`). An absent `agentId` no longer means the room; every place that read it so (send, close, menu dispatch, `conversation.get`, busy-send, harness-line flagging) reads the kind. Main already keeps one live session per persona (`byAgent`) and answers a second open with the same one. Skill-first records carry a session flag; the process is spawned on the typed message as first turn.
- Skill list: read once in main from `_bmad/_config/skill-manifest.csv` (`canonicalId,name,description,module,path`, RFC 4180 quoted, so parse rather than split on commas), by a reader in `sources/install/` and a pure fold in `fold/`; carried as an additive `skills` field of the install snapshot and re-read with it. A row with no `name` is skipped; missing or unreadable gives an empty list and no error. The roster still comes only from `[agents.*]`.
- Board files are resolved in main and carried as additive `BoardStory.file` / `BoardEpic.file`; the renderer only passes the path to `doc.open`.
- Contract changes are additive only and `CONTRACT_VERSION` is unchanged: optional `skill` beside `agentId` on `session:opened`/`session:closed`, its listing in `conversation.get`, a session flag on records. No generic `invoke`; the renderer sends only typed text and main resolves the skill. `run:started`'s `skill` is a record, never an input. The command that starts a skill-first session (third form of `session.open` or a new command) is decided in 7.5: it carries the whole first message, main reads the first word, and the reply is opened (`sessionId`), a seat or room to turn to, or refused with the word. A refusal is a reply, not an event.
- The New session chat is a renderer surface, not a session: no `sessionId`, process, registry entry, transcript or `userData`. A window opens on it; one kept empty chat per window, in memory only, with no close control. `currentAgent` returns nobody, not the first tile, when none is chosen.
- Open for 7.5: a `bmad-agent-*` row with no `[agents.*]` table (refuse or start skill-first); refusal wording when the manifest is missing or a slash is omitted.
- Trust boundary: the chat reuses the document window's `renderMarkdown` and its single `MarkdownBody` `innerHTML`; no second pipeline or allow-list. Story 1.12's fixture is reused.
- Relaunch ends all processes; the CLI is started with no resume flag; resuming a seat is not built.

## UX & Interaction Patterns

- `/` list: above the composer on `panel-2`, 1px `line` border, one focused row with the shared focus ring.
- `Skill Session` button: native `<button aria-pressed>`, right-aligned in the Team sidebar's Sprint board row, ghost style like `Stop`, no icon, count or accent. Pressed means the empty chat is open. It lists no skill and is an entry to a chat, not a launcher.
- New session chat: header `New session` with a slash disc, no status pill, `Stop` or close; empty thread, no placeholder; becomes the skill's name once a session starts.
- Skill disc: neutral disc holding `/` in mono (not initials, since every `bmad-*` would read `B`). Skill seat: same 44px row as a persona tile, name in mono, line two `working · <elapsed>`, `live`, or `ended`; no control on the row. Seats sit under a `Skill sessions` heading below the personas, in start order, shown only while one exists; start time shows only when two seats share a name.
- Persona seat: the existing tile plus the live dot in its own dot vocabulary.

## Cross-Story Dependencies

- Sequence: 7.1 and 7.2 in either order, then 7.3, then 7.7 (before 7.4, since seats are drawn on its 44px initials row), then 7.4, then 7.5, then 7.6 last. 7.1, 7.2, 7.3 and 7.7 ship alone and change no session behaviour; 7.4 and 7.5 are one bet and 7.5 depends on 7.4.
- 7.6 closes the epic and amends earlier negative-surface audits on purpose: a file card is a control, `/` lists skills, personas have live dots, a chat can have no persona.
- Builds on the document window and sanitisation (Epic 1), session registry, `@name` chip and handoff (Epic 2), and the Board with Recent activity and Agents panel (Epic 6).
- Amends in place: Story 2.9 (composer never names a skill; handoff line), Story 2.8 (ending), FR27, FR30, FR126; Welcome, Agents panel and Team lose portraits via 7.7.
