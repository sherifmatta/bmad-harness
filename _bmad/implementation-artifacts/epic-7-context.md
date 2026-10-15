# Epic 7 Context: Work in the conversation, not around it

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stop making the user work around the conversation. A Board story or epic opens its file; the chat renders the markdown personas write; `/` lists the install's skills; each persona keeps its own live session (a seat) until the user ends it; and a chat can start from a skill with no persona, the skill's name as its speaker. Every person in the product is a neutral initials disc plus a name; the illustrated portrait is gone and nothing replaces it.

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
- Chat markdown: a completed persona turn renders through the one existing pipeline (`markdown-it`, HTML off, then DOMPurify) at the chat's own type and measure, not the document window's class. Streaming turns stay plain text and render once at the end; an empty render of a non-empty turn falls back to plain text. User turns, syslines, decision blocks, run-card prose and step labels stay plain. Raw HTML, `<style>`, `<script>`, images and `javascript:` links render nothing; links are inert text.
- `/` as the composer's first character opens a list of every installed skill: all, unhidden, unranked, manifest order, name (mono) plus description (`dim`). Typing narrows by case-insensitive prefix; arrows move, `Enter`/`Tab` put `/<name> ` in the composer and send nothing, `Esc` closes. No count, icon, group, accent fill or live-region announcement. `@name` still addresses only a persona. This is the only skill list in the product.
- Identity: persona and user are an initials disc (`initialsOf`; one letter for a one-word name) plus a name, 26px on tiles, cast cards, Welcome rows, cast chooser, Agents-panel rows, thread intro, chat turns and seats; 22px in the chat header only; 20px for small references. The disc is `aria-hidden`, no tab stop, neutral for personas (only the user's is tinted), and never takes a persona colour, tint, icon, emoji or image; roster `icon` is never drawn. The Team tile is a 44px row. The speaking cast card keeps its lit border and equaliser, no ring. No portrait module, class or per-person `<svg>` may exist in the renderer.
- Seats: turning to a persona (tile or `@name`) never ends, replaces or re-briefs another seat; no cap; no `handed to <Name>` line for a tile click or `@name`. A live dot means only "holds context" (no count, no pulse); after relaunch no seat is live and the next message starts with no context. The header's `close session` ends one seat, keeps its records, writes one harness line, never highlighted or badged. `conversation.end` still ends every seat and is the only thing that clears the transcript.
- Skill-first sessions: a first message `/<name>` naming an installed skill (exact, case-sensitive) starts one; speaker is the skill name in mono, never a persona; later plain messages go to the same live session; its lines appear only in its own thread. Ending it kills the process, removes its own records, writes no line, and lands on the New session chat. After relaunch it is listed as ended; a message to it yields one line `session ended`, starts nothing, stays in the composer. Its runs show in Recent activity as the skill name plus `started`/`finished`/`stopped`/`failed`, never in a Board column, no story owner, not counted in the Agents panel or state strip. Nothing suggests who to talk to next.
- First-message routing in the New session chat: `/bmad-agent-*` turns to that persona's seat; `/bmad-party-mode` goes to the room (text after the name is sent; the empty chat is spent); anything else, `@name` included, is refused with one line `no skill named <word>`: no user turn, no persona answers, text stays in the composer.
- Negative surface (closing story, each a test): no launcher, palette, recommended, ranked or "next" marker; no counts or badges; no unsanitised markup; one place sets inner HTML; no project writes; no replacement identity device.
- Cross-cutting: tokens only (no literal colours or dimensions); one polite live region per window; reduced motion removes animation; state never by colour or motion alone.

## Technical Decisions

- A session has a kind: persona (`agentId`), room (a cast) or skill-first (a `skill`). An absent `agentId` no longer means the room; send, close, menu dispatch, `conversation.get`, busy-send and harness-line flagging all read the kind. Main keeps one live session per persona. Skill-first records carry a session flag; the process spawns on the typed message as first turn.
- Skill list: read once in main from `_bmad/_config/skill-manifest.csv` (`canonicalId,name,description,module,path`, RFC 4180 quoted, so parse, not split), by a reader in `sources/install/` plus a pure fold in `fold/`; carried as an additive `skills` field of the install snapshot. Rows with no `name` skipped; missing or unreadable gives an empty list, no error. The roster still comes only from `[agents.*]`.
- Board files are resolved in main and carried as additive optional `BoardStory.file` / `BoardEpic.file`; the renderer only passes the path to `doc.open`.
- Contract changes are additive; `CONTRACT_VERSION` unchanged: optional `skill` beside `agentId` on `session:opened`/`session:closed`, its listing in `conversation.get`, a session flag on records. No generic `invoke`; the renderer sends only typed text and main resolves the skill. The start command carries the whole first message; its reply is opened (`sessionId`), a seat or room to turn to, or refused with the word (a reply, not an event). Exact form is Story 7.5's spec. Open for 7.5: a `bmad-agent-*` row with no `[agents.*]` table; wording when the manifest is missing.
- The New session chat is a renderer surface, not a session: no `sessionId`, process, registry entry, transcript or `userData`; one kept empty chat per window, in memory, no close control. `currentAgent` returns nobody, not the first tile, when none is chosen.
- Trust boundary: chat reuses the document window's `renderMarkdown` and its single `MarkdownBody` `innerHTML`; no second pipeline or allow-list.
- Relaunch ends all processes; the CLI starts with no resume flag; resuming a seat is not built.
- Portrait removal (decided 2026-10-15, now reflected in DESIGN.md and AD-16): a removal, not a feature; `Initials` keeps its signature and sizes; no roster, snapshot or contract change. Portrait module, parameter module, stylesheet, tokens and pinned tests go in one change with the matching DESIGN.md keys; the persona-state type moves to the status module. The `portraits/` prompts folder and `mockups/portrait.html` stay as history.

## UX & Interaction Patterns

- `/` list: above the composer on `panel-2`, 1px `line` border, one focused row with the shared focus ring.
- Team tile and seat: 44px row, 26px disc, name and title beside it, state line with dot below.
- `Skill Session` button: native `<button aria-pressed>`, right-aligned in the Team sidebar's Sprint board row, ghost style like `Stop`, no icon, count or accent; pressed means the empty chat is open. It lists no skill; it is an entry to a chat, not a launcher.
- New session chat: header `New session` with a slash disc, no status pill, `Stop` or close; empty thread, no placeholder; becomes the skill's name once a session starts.
- Skill disc: the same neutral disc holding `/` in mono (not initials, since every `bmad-*` would read `B`), 26px in a turn and seat, 22px in the header. Skill seat: name in mono, no control on the row, under a `Skill sessions` heading below the personas, in start order, shown only while one exists; start time shows only when two seats share a name.
- Persona seat: the existing tile plus the live dot in its own dot vocabulary.
- Mockups illustrate, the spine wins: `skill-session-entry.html`, `new-session-landing.html`; any portrait they draw is superseded.

## Cross-Story Dependencies

- Order: 7.1 and 7.2 in either order, then 7.3, then 7.7 (before 7.4, since seats are drawn on its 44px initials row), then 7.4, 7.5, and 7.6 last. 7.1, 7.2, 7.3 and 7.7 change no session behaviour; 7.4 and 7.5 are one bet, 7.5 depending on 7.4.
- 7.7 touches many surfaces (Team, cast strip, Welcome, cast chooser, Agents panel, thread intro) and many files import the persona-state type it moves; it adds no skill seat, live dot, `Skill Session` button or `/` disc (7.4 and 7.5 own those).
- 7.6 amends earlier negative-surface audits on purpose: a file card is a control, `/` lists skills, personas have live dots, a chat can have no persona, and no portrait or identity device exists.
- Builds on the document window and sanitisation (Epic 1), session registry, `@name` chip and handoff (Epic 2), the party cast (Epic 4), and the Board with Recent activity and Agents panel (Epic 6). Amends Story 2.9 (composer never names a skill; handoff line), Story 2.8 (ending), and the earlier portrait requirements.
