# Update brief: Story 7.5 and the removal of portraits (2026-10-15)

Both spines (`DESIGN.md`, `EXPERIENCE.md`, in the parent folder) are `status: final` and are being UPDATED in place. This brief is shared by the agent editing DESIGN.md and the agent editing EXPERIENCE.md. Each agent edits ONLY its own file. The decisions are in `../.memlog.md`: read every entry from the one beginning "UPDATE 2026-10-15 for Story 7.5" to the end. They are the user's words and win over everything below if they differ. The story itself is `../../../epics.md` → Story 7.5 (also read Stories 7.3 and 7.4 for what they own, and UX-DR52 to UX-DR54). Mocks to link, all in `../mockups/`: `skill-session-entry.html`, `new-session-landing.html`, `skill-session-entry-options.html` (record of the rejected option A).

## What changed, in one place

1. **A "Skill Session" button** sits right-aligned in the same row as *Sprint board* in the Team sidebar (ghost button, same control as the header's Stop: `panel-2`, 1px `line`, `control` radius, `3px 10px`; pressed = `panel-3`, `text-strong`, `accent-border`; native `<button aria-pressed>`; no accent fill, icon or count). Pressed means the empty chat is open.
2. **The "New session" chat** is the empty chat AND the landing: header reads `New session` (22px slash disc, no pill, no Stop, no close), thread shows nothing, composer empty with focus and a hidden `aria-label` of `message`. It is what a window opens on (replacing today's fallback to the first persona; the shell no longer always has a current persona), what the window lands on after the user ends the skill session they are viewing, and what the button opens. Clicking the pressed button reuses it. Leaving it (clicking a tile) discards it and any half-typed text.
3. **The first message.** A message beginning `/<name>` with `<name>` an installed skill starts a skill-first session (header becomes the skill name; seat appears; button un-presses). `bmad-agent-*` turns to that persona's seat, `bmad-party-mode` to the room; the empty chat leaves nothing behind. Any other first word: one harness line in the thread, lower-case mono, no full stop, `no skill named <word>` (`<word>` = first word as typed), no persona answers, the unsent text stays in the composer, no user turn is drawn.
4. **A skill-first session.** Speaker is the skill name in `name` mono, never a persona's initials or colour. Disc: neutral initials disc holding `/` in mono in `initials-ink` (26px in a turn, 22px in the header). Header: slash disc, skill name in mono, status pill, then `Stop` while a turn is in flight and `close session` otherwise; no title, no story reference. Its run card head reads `<skill> run`. When the run ends the thread offers nothing about who to talk to next.
5. **Seats.** Persona tiles and skill seats are ONE anatomy: 44px row (tile was 56px), 26px initials disc, no portrait. Skill seat: line one the skill name in mono; line two `working · <elapsed>` (amber pulse) or `live` (green dot) when idle and holding context; after a relaunch `ended` with no dot. They sit in a group headed `Skill sessions` below the personas (shown only while at least one exists; no empty state; heading uses the existing group-heading treatment). Same skill twice is allowed (no cap): start order, no recency sort; only when two seats share a name, each shows its start time `HH:MM` in `faint` after the name. The state strip counts personas only (equals `5 agents`). The only end control is the header's `close session` (Story 7.4); no control on the row.
6. **Ended session after a relaunch.** A message to it: one harness line `session ended`, nothing starts, the text stays in the composer.
7. **Recent activity** gains a row for a skill-first run: the skill name takes the persona's place; words `started`, `finished`, `stopped`, `failed` with NO code; same dot rules and `MM-DD HH:MM` as Story 6.7. Never a Board column; no story owner; the Agents panel counts no persona for it.
8. **PORTRAITS ARE REMOVED FROM THE PRODUCT COMPLETELY.** Team tiles, party cast cards and the Welcome team are all initials discs at 26px (22px in the chat header only; 20px small references stay). Persona discs are letters, `initialsOf` rule (one letter for a one-word name) as already built. The speaking cast card keeps its lit border (`cast-speaking-border`). **The product now spends its restraint budget on nothing: no replacement identity device.** Brand and Style must be rewritten to say so (the old premise, illustrated portraits as the one spend, is gone). Delete the portrait generator and every portrait spec, size and rule from the prose; leave one short dated "Removed 2026-10-15" note where the portrait component stood so a reader can find why.
9. **Accessibility.** Button is a native button with `aria-pressed`, in the tab order after Sprint board; focus goes to the composer when the landing opens and after ending a session; `no skill named <word>` and `session ended` are announced once, politely, through the existing live region (one line, no new region); a new seat row is not announced; no new chord.

## Cross-spine contract: names both files must use

DESIGN.md defines; EXPERIENCE.md references with `{path.to.token}`.
- `{components.skill-session-button}` (new)
- `{components.skill-seat}` (new; height `{components.persona-tile.height}`)
- `{components.persona-tile}` (KEEP the name; change `height` to 44px, replace `portraitSize` with `discSize: '{components.initials.sizeThread}'`)
- `{components.initials}` gains `skillGlyph: '/'` (mono, `initials-ink`) as the skill variant
- `{components.chat-header}` gains a skill variant (no title, no story)
- Group heading for `Skill sessions`: reuse the existing persona/file group heading, name it in prose, add no token.
- Sysline lines `no skill named <word>` and `session ended` are harness syslines in the existing sysline style.
- Landing/empty chat = `New session`; the button's label = `Skill Session`.

## Rules for both agents

- **Match the surrounding document**: its voice, density, British spelling where used, table-heavy style, `[ASSUMPTION]` / `[OPEN]` tags, dated "Added/Amended 2026-10-15" italic notes as the file already does. No new header levels where an existing section can carry it.
- **Precedent for what the code still carries**: when a token or rule is retired but code and pinned tests still carry it, keep it and mark it "removed 2026-10-15, kept until the portrait-removal story" (as `accent-wash` is marked). So portrait tokens stay in the DESIGN.md frontmatter, marked, but no prose specifies a portrait any more.
- **Do not decide anything not in the memlog.** If a spec point is missing, tag `[ASSUMPTION]` or `[OPEN]` and list it in your report. Do not invent colours, sizes, shortcuts or copy.
- **Launcher bans**: the spines say there is no launcher, no `/`, no skills list (EXPERIENCE: Information Architecture, Banned everywhere, Not adopted, Banned here, Interaction Primitives `@name` row). Epic 7 reverses this. For Story 7.5, amend those lines narrowly and say why with a dated note: a `/<name>` first message in the empty chat starts a session; the button is an entry to a chat, not a launcher; it lists no skill (the `/` list is Story 7.3's and its component is NOT designed here: reference it as Story 7.3's). `@<name>` still addresses only a persona. Do not design Story 7.3's list or Story 7.4's live dot; reference them. Do not touch what 7.1 to 7.4 own beyond pointers.
- **No mock of your own.** Link the mocks above inline where relevant, and state once that the spines win on conflict with a mock (the files already say this; keep one statement).
- **Keep the front matter valid**: bump `updated` to `'2026-10-15'`, add the three new mocks to `sources:`. Leave `status: final`.
- **Do not edit** `.memlog.md`, epics, the architecture spine, code, or the other spine.

## Report back (compact)

1. The sections you changed or added, with line ranges.
2. Every `[ASSUMPTION]` / `[OPEN]` you added.
3. Anything in your file that you found contradicting the decisions and could not resolve.
4. Every place in your file that still mentions a portrait (there should be only the dated removal note and marked unused tokens).
