---
title: 'Start a chat from a skill, with no persona'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_revision: 'a5a68fed0cf7091de2abcaa28a4a57c26c147adf'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-7-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      Build the `Sprint board` nav row (label and `g b` hint) the UX documents place the `Skill Session` button in; the code has the Board only as a topbar view, so the button has a Team-half row of its own.
    evidence: |-
      `grep -rn "Sprint board" src` finds nothing; EXPERIENCE.md says the row is still proposed. The button's row was added by this story and the row's label and chord were left unbuilt, as the spec's Boundaries state.
    location: >-
      src/renderer/ui/shell/shell.tsx
    severity: low
  - summary: >-
      `observeMemlog` attributes a memlog line to a run only when exactly one entry is running, so a skill-first run beside a persona's run drops the persona run's notes.
    evidence: |-
      src/main/session-run.ts:298 filters every running entry in `service.bySession` and takes the entry only when there is one. It was already true for two personas running at once; a skill-first run adds another way to reach it. Attribution by memlog path would settle it.
    location: >-
      src/main/session-run.ts:298
    severity: low
---

<intent-contract>

## Intent

**Problem:** Every chat has a persona in it and the window always has one current, so a skill that is not a persona (`bmad-build`, `bmad-build-auto`) has no place in the conversation, and nothing in main can hold a session that is not a persona's or the room's (an entry with no `agentId` means the room in six places).

**Approach:** Add a third kind of session, a skill-first session, read through one `kindOf(entry)` in main. The window rests on a renderer-only New session chat opened by a `Skill Session` button; its first message is sent as a third form of `session.open`, resolved in main against the install's skill list. A skill-first session has its own thread, seat, header, disc and run card, is ended by `close session` (which removes its records), and offers nothing about who to talk to next (FR134, FR135, FR126 amended, UX-DR53).

## Boundaries & Constraints

**Always:**
- **Kind.** `kindOf(entry)` is `'skill'` (entry has `skill`), `'room'` (no `agentId`, no `skill`) or `'persona'`. The six sites that read no-agent as the room (`sendTurn` and its `roomSends` wrapper, `closeSession`, `dispatchMenu`, `getConversation`, `interruptedRoom`, `say`) and the sites found beside them (`session-registry.ts` 273, 320, 326-328; `fold/route-frame.ts` flushParty, message-start, block-start, text-delta; `session-stop.ts` `stopTurn`; `run-notification.ts`) switch on the kind. A skill entry is held in `bySession` and in a new `service.skills` map; never in `byAgent` or `room`. No cap.
- **Start.** `session.open` takes a third target form `{ first: string }` (the text as typed; `SessionTarget` and its pinned text in `tests/party-contract.test.ts` are amended). Main reads the first word, up to the first whitespace: it must begin `/`; the name is the rest, matched exactly and case-sensitively against the window's install `skills` (a new `skillsFor(webContentsId)` in `install-model.ts`, free of the word *session*). Outcomes: (a) a name that is a roster persona id → reply `{sessionId, seat: <agentId>, rest}` after opening or finding that seat (Story 7.4); (b) `bmad-party-mode` and a non-empty roster → the room opened with the whole roster as its cast, in roster order, by the existing `openRoom`, reply as a room open plus `rest`; (c) any other installed name (a `bmad-agent-*` with no roster entry included; an empty roster included for the party skill) → a skill-first session: `registry.openSkill` spawns on `firstTurn` = the text as typed, records the user turn flagged, calls `startRun` with `code` = `skill` = the name and no plan, reply `{sessionId, skill}`; (d) anything else, no `/`, `@name`, empty, or a missing/empty skill list → failure `{code:'session/no-skill', message:'no skill named <word>'}` (`<word>` = first word as typed, leading `/` removed, case kept), starting nothing and recording nothing. `rest` is the text after the name, trimmed, present only when non-empty; the renderer sends it with its existing send. `CONTRACT_VERSION` stays 1; no channel, command, event or preload method is added (counts stay 36 / 8 / 17 / 24); the additions are optional fields only.
- **Records.** Every record, event and harness line a skill-first session produces carries `skillSession: <sessionId>` (optional, beside `room?`) and belongs only to that session's thread; the shared thread, every persona's view and the room's party thread draw none. What it says is a new record `{kind:'skill', id, at, messageId, text, skillSession}` made from `persona:said` with no `agentId` and `skillSession` set; the speaker is the skill's name. The transcript file gains an optional top-level `skillSessions: {sessionId, skill, at}[]` (version stays 1; an older file loads as having none). `conversation.get` gains optional `skillSessions: {sessionId, skill, live}[]` in start order (`live` true only for an entry held this launch); a skill session is never listed in `sessions` or `room`.
- **Speaker and mark.** Speaker is the skill name in the `name` mono style, never a persona's initials, face, colour or role. The disc is the neutral skill variant holding `/` in mono (`{components.initials}` skill variant; DESIGN.md/EXPERIENCE.md settle it over the epic's "first letter", so `epics.md` Story 7.5 is amended to match). Turn head: disc, skill name, `HH:MM`, no role slot.
- **Later turns and queue.** A plain message goes to the same live session (`turn.send`), replies keep the skill's name, a message typed in flight queues as `queued · sends when <skill> finishes`, a plain turn raises no card. `Stop` stops a skill-first turn (`stopTurn` accepts the kind).
- **Seat and header.** Seats are a `Skill sessions` group of the persona tile's own 44px anatomy below every persona group, drawn only while one exists, start order, no control on the row, `HH:MM` after the name only while two seats share a name; line two `working · <elapsed>` (amber, pulsing), `live` (green) or `ended` (no dot); a click turns the chat and is current (`aria-current`). The header is the skill variant: `/` disc at 22px, skill name in mono, status pill, `Stop` while a turn is in flight, else `close session`; no title or story reference. The state strip, the Agents panel and the Overview count personas only.
- **Ending.** `close session` for a skill session kills its process, writes no line, removes its records, its stored run cards, its run-projection cards and its `skillSessions` item, and the window lands on the New session chat with focus in the composer. No persona seat, the room or the shared thread is touched. After a relaunch a listed session has no entry: its header keeps `close session` (removes the same things); a `turn.send` to it answers failure `{code:'session/ended', message:'session ended'}`, starts nothing and records nothing; the renderer draws that text as a local sysline in that session's thread (announced once, politely), draws no user turn and leaves the text in the composer. `no skill named <word>` is drawn the same way in the New session chat. Neither is written by main as a record.
- **New session chat.** A renderer surface, not a session: header `New session` with the `/` disc at 22px, no pill, `Stop` or close; an empty thread (only local refusal lines); the composer empty and focused, no placeholder, accessible name `message`, given Story 7.3's `/` list (this story's decision: it is the chat whose only job is typing a skill; the list stays the only place skills are listed) and no skill row. One kept per window, in memory with its half-typed text and refusal lines; a window opens on it (`currentAgent` no longer falls back to the first tile and returns nobody when none is chosen); a tile, seat, Party or the Board leaves it kept; it ends when a valid first message is sent or the window closes; a reload opens a fresh one. The composer keeps the text when a send is refused.
- **Skill Session button.** A native `<button aria-pressed>`, label `Skill Session`, drawn as the header's `Stop`, right-aligned in a Team-half row between the strip and the tiles; pressed only while the New session chat is in view; no icon, count, accent fill, tooltip or chord; never disabled; in tab order before the persona tiles. The `Sprint board` row of the UX docs is not built in the code (the Board is a topbar view), so this row carries the button alone and the `Sprint board` label with its `g b` hint stays unbuilt (recorded as deferred).
- **Run and activity.** The first message's run card is in the session's thread with head `<skill> run` (it stays visible, never collapsed to a persona-less line), and Recent activity raises a row from the card's `skill`: the skill name where a persona's goes and the bare verb `started`/`finished`/`stopped`/`failed` with no code, Story 6.7's dot rules and time. Never a Board column or card, no story owner, no persona counted, Story 6.9's audit unchanged (FR123).
- **After a run ends** the thread adds nothing about who to talk to next: no suggestion, persona, handoff line, button or sysline; a test fails on any.

**Never:** a skill picker beyond Story 7.3's list; inferring a persona from what is typed; a suggestion of who to talk to next; attributing a skill's work to a persona; a Board column or card for a skill run; resume across a relaunch (`SESSION_ARGS` untouched); a change to the room's or a persona seat's behaviour; a cap; a new channel, command, event or preload method; a close control on a seat row or on the New session chat; any new colour or token; a `registry.say(` for `no skill named` or `session ended`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start a skill | New session chat, `/bmad-build make a thing`, `bmad-build` installed | skill-first session spawns on that exact text; user turn and a `bmad-build run` card in its own thread; header becomes `bmad-build`; seat appears; button un-presses; reply `{sessionId, skill}` | spawn failure → the existing `session/spawn-failed` style failure, nothing kept |
| Not a skill | `hello there` / `@Mary hi` / `/nope` / `/` | nothing starts, nothing recorded; local line `no skill named hello` / `no skill named @Mary` / `no skill named nope` / `no skill named ` | empty or whitespace text is not sent |
| Persona skill | `/bmad-agent-pm draft it` | turns to PM's seat (opens or finds it), no skill-first session, `rest` `draft it` sent as the turn; the empty chat is spent | invalid roster → seat open failure as today |
| Room skill | `/bmad-party-mode` | the room opens with the whole roster as cast (or the live room is found); `rest` sent as a room turn | empty roster → starts a skill-first session instead |
| Plain follow-up | in a live skill-first session | same session, replies spoken as the skill, own thread only | busy → queued as in any chat |
| End | `close session` in view | process killed, records/cards/list item removed, no line, window on New session chat, focus in composer | unknown session → `session/not-found` |
| After a relaunch | stored `skillSessions` | seat listed `ended`, thread as it was, header `close session` only; a send answers `session ended`, text stays in the composer | N/A |
| Two of one skill | two `bmad-build` sessions | two seats, each shows its `HH:MM` | N/A |
| Reload | live skill sessions | `conversation.get` lists them `live` with their records; no extra dot or count | N/A |
| Persona and room untouched | skill session beside a seat and a room | each handled as itself in all six sites; shared, party and persona views draw no skill record | N/A |

</intent-contract>

## Code Map

Main and contract (anchors from the investigation; re-read each before editing):
- `src/main/session-registry.ts:51-97,99-119,417-457,574-591,522-566,480,273,320,326-328` -- `Entry` gains `skill?`; `service.skills`; `newEntry`; add `openSkill` beside `open`/`openRoom` (`begin` with `firstTurn`); `discard`/`finish`/`closeSessions` must cover it; `say` flags `skillSession` for a skill entry, not `room`; the persona stopped line, roster routing and file-annotation branches read the kind; export `kindOf`.
- `src/main/session-bridge.ts:155-262,329,368-399,412-456,473-490,578-616,657` -- `asksForRoom` neighbour `asksForFirst`; `openSession` resolves `{first}` (reuse `castOf`, `openRoom`, seat open); `sendTurn` records the user turn flagged and skips `roomSends` for a skill; `interruptedRoom`, `dispatchMenu` (refuse), `closeSession` (skill branch: kill, `finish`, remove, no line; stored-only session removes the same), `getConversation` lists `skillSessions`; `turn.send` to a stored-only skill session answers `session/ended`.
- `src/main/session-run.ts:~218-232`, `src/main/session-stop.ts:134`, `src/main/run-notification.ts:118`, `src/main/fold/route-frame.ts:483-575` (+ `RouteContext` gains `skillSession`) -- a skill entry's text-delta is `personaSaid` with `skillSession` and no `agentId`; flushParty/party scan skip it; `stopTurn` accepts it; notification names the skill.
- `src/main/fold/transcript.ts:41-90`, `src/main/projections/transcript.ts`, `src/main/projections/runs.ts`, `src/main/sources/persistence/transcript-file.ts:35-120` -- fold `persona:said` with `skillSession` into the `skill` record; `recordUserTurn`/`recordSysline` take the flag; `ProjectTranscript` gains `openSkillSession`, `removeSkillSession(id)` (entries, stored runs, list item; writes), `skillSessions()`; `isRecord` accepts `kind:'skill'` and a `skillSession` string flag; `RunProjection` removes one session's cards. `src/main/persona-states.ts`/`fold/persona-state.ts` already ignore an agentless `session:opened`: keep, test.
- `src/main/install-model.ts` -- `skillsFor(webContentsId)` from `projections/install.ts:119` (`snapshot().skills`).
- `src/shared/conversation.ts:17-70,150-165`, `src/shared/events.ts:40-100`, `src/shared/commands.ts:~29`, `src/preload/index.ts:~184-196`, `src/preload/harness-api.d.ts:~71` -- optional `skillSession`/`skill`/`seat`/`rest` fields, `SkillRecord`, `SessionTarget` third form, `OpenedSession`, `ConversationSnapshot.skillSessions`; preload copies fields by hand.
- Read-only evidence: `src/main/sources/session/session-process.ts:395` (`firstTurn` wins over `activationTurn`), `src/shared/run-skill.ts` (`skillOf` gate), `src/main/fold/rail-annotations.ts` (no `agentId` makes no owner).

Renderer (the explorers found no `Sprint board` row in code and no persona-less path):
- `src/renderer/ui/team/tile-groups.ts:61-63` (`currentAgent`: drop `?? order[0]`), `src/renderer/ui/app.tsx:75,218,250,303-307,366-384` (window state: viewing the New session chat / a persona / a skill session; first-message send and `rest`; `handoffTarget` is not used from the empty chat), `src/renderer/ui/shell/shell.tsx:204-310` (header/composer branches for no persona and for a skill session; `Skill Session` row; `resetKey`), `src/renderer/ui/team/team.tsx`, `team/persona-tile.tsx` (seat reuses the anatomy; add the `Skill sessions` group beside `groupAgents`), `status/persona-state.ts` + `status/status-dot.tsx` (seat `ended` has no dot).
- `src/renderer/ui/chat/conversation-state.ts:28-67,751-953` and `use-conversation.ts:41-51,322,498` -- `skillSessions` map, `SkillEntry`, `skillSession` on user/sysline/run entries, `session:opened/closed` read `skill` first (`:830` assumes room), `persona:said` without agent but with `skillSession` (`:882`), `hydrate` copies the flag, queue keyed per skill session, local lines for `no skill named`/`session ended` made like `roomRefused` (`:437`) with a window id, announced through the existing announcer path.
- `src/renderer/ui/chat/transcript.tsx:145,194`, `party/party-view.tsx:24`, `app.tsx:269` -- the shared view and the room exclude `skillSession`; a skill view draws only its own; `sends` counts per scope.
- `chat/chat-header.tsx:26-70` (skill and New session variants), `chat/turn.tsx:80-196` (skill head, no role), `persona/initials.tsx:70` + `initials.css` (`/` glyph variant), `chat/composer.tsx:38-162` (no placeholder, accessible name `message`, keep-text on refusal, `slashEntries` on the New session chat), `chat/run-card.tsx:129-186`, `chat/run-status.ts:160` (`isCollapsed` with an agentless card), `chat/transcript.tsx:53` (`pinnedRun`), `board/board-activity.ts:30-58` (row from `skill`), `board/board-agents.ts` and `board-view.tsx` (persona-only, read-only evidence).
- Pins and tests to amend narrowly (read each first): `tests/party-contract.test.ts:47-60`, `tests/negative-surface.test.ts` (registry.say count ~2830-2841 stays 3; ~1497; ~2913; ~3006), `tests/persistence-contract.test.ts:299+` (transcript cleared only by `conversation.end`: exception for a skill session's own records), `tests/session-contract.test.ts:263-279` (6 `finish(`, 4 `.kill()` stay), `src/main/session-bridge.test.ts:1246`, `team/tile-groups.test.ts:95-117`, `team/team.test.tsx:350,391`, `shell/shell.test.tsx:267-273,318,657`, `app.test.tsx:419,752,890,2136` (many assume Mary current at open: click the tile first or open on the chat), `tests/team-contract.test.ts:327`, `chat/negative-surface.test.tsx:184-209` (allowed buttons gain the header close), `shell/negative-surface.test.tsx:135-145` (still lists no skill), `board/board-activity.test.ts:45`.
- Docs: `epics.md` Story 7.5 (disc is `/`; the open entry question is settled; Story 2.9 FR126 Story 6.8 notes), `EXPERIENCE.md`/`DESIGN.md` (note the `Sprint board` row is still unbuilt and the New session chat's `/` list is given; the rest is already specified), `sprint-status.yaml` (7-5 done, drop the blocked note).

## Tasks & Acceptance

**Execution:**
- `src/shared/*`, `src/preload/*` -- additive optional fields and the `{first}` target form; `SkillRecord` -- the contract carries the kind with counts unchanged
- `src/main/session-registry.ts`, `session-bridge.ts`, `session-stop.ts`, `session-run.ts`, `run-notification.ts`, `fold/route-frame.ts` -- `kindOf`, `openSkill`, routing, close and send per kind -- no site reads no-agent as the room
- `src/main/fold/transcript.ts`, `projections/transcript.ts`, `projections/runs.ts`, `sources/persistence/transcript-file.ts`, `install-model.ts` -- skill records, `skillSessions`, removal, `skillsFor` -- a skill session persists, lists after a relaunch, and goes with its own records only
- `src/renderer/ui/**` (files above) -- New session chat, `Skill Session` button row, skill seats and group, header/turn/disc variants, threads scoped by `skillSession`, local refusal lines, activity row, run card visibility -- the experience of Story 7.5
- Tests -- one construct-all-three test in `src/main/session-bridge.test.ts` (skill, room, persona each handled as itself in the six sites), first-message resolution (every I/O row), routing and records, removal and relaunch, `session ended`, renderer folds, threads, seats, header, disc, button, composer, activity row, strip/Agents panel counts, no offer after a run, plus amended pins listed above
- `epics.md`, `EXPERIENCE.md`, `DESIGN.md`, `sprint-status.yaml` -- documents say what was built

**Acceptance Criteria:**
- Given the New session chat and a first message `/<name>` naming an installed non-persona, non-room skill, then main starts a skill-first session on the text as typed with `skill` = `<name>` as the run's skill, and the renderer sent only the text; any other first word starts nothing and draws `no skill named <word>` with no user turn and the text kept
- Given a skill-first session beside a room and a persona's seat, then each of the six sites handles each as itself (tested)
- Given its lines, then the speaker is the skill name in mono beside the `/` disc, only its own thread draws them, and a plain message goes to the same live session
- Given the seat, then it sits in `Skill sessions` with `working`/`live`/`ended`, the strip and Agents panel count no persona for it, and ending removes its records and cards, writes no line, touches nothing else and lands on the New session chat
- Given a relaunch, then the session is listed `ended` with its thread and a message answers `session ended`, starts nothing, draws no user turn
- Given `/bmad-agent-*` (in the roster) or `/bmad-party-mode`, then the seat or room opens with nothing else changed and no skill-first session
- Given a skill-first run, then its card head reads `<skill> run`, Recent activity raises a row naming the skill with no code, there is no Board column or card and no story owner
- Given the run ends, then the thread offers nothing about who to talk to next
- Given the contract, then `CONTRACT_VERSION` is 1 and channel, command, event and preload-method counts are unchanged

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 29 findings — high 0, medium 4, low 24, false 0, maybe-false 1
- findings:
  - `[low]` `[patch]` (blind, edge) the composer's `sending` flag is cleared only in `.then`, so a rejecting or never-settling handler locks every later send — verified at `composer.tsx` send; cleared in a `finally` and the rejection read as "not taken", with a test
  - `[low]` `[patch]` (blind) keyboard focus drops after a first message starts a skill session — verified: the seat branch sets composer focus and the skill branch does not; the skill composer is focused on that turn, with a test
  - `[low]` `[reject]` (blind) typing in the New session chat re-renders App through the lifted draft — a render cost with no wrong output; the fix restructures how the kept text is held
  - `[low]` `[reject]` (blind) `StoredSkillSession.at` is not sent in the snapshot, so a seat's start time is derived from its first record — the first record is written at the same instant as the list item, so the derived time is the start time; the fix adds a contract field
  - `[low]` `[patch]` (blind, edge) records whose `skillSession` is not listed can never be removed, from a late frame of a killed process or a damaged file or list — verified: `onFrame` has no closed guard and `removeSkillSession` needs a listed id; `record*` ignore an unlisted session, loading drops such records and a duplicated list item
  - `[low]` `[reject]` (blind) the negative-surface sweeps were loosened — each exemption names the skill-first modules that must now say `skill`; narrower pins would need a module split this story does not own
  - `[low]` `[patch]` (blind) stale planning text — the EXPERIENCE.md `/` list bullet still left the New session chat's list to Story 7.5; updated. `epic-7-context.md` is regenerated by the compile step and is not hand edited, so that part is rejected
  - `[low]` `[reject]` (blind) the spec's bookkeeping (empty deferred, logs, `oversized`) — the logs and deferred list are filled by this pass; the rest is a fix to the spec's own text
  - `[low]` `[reject]` (blind) the refusal echoes an unbounded first word and a bare `/` reads `no skill named ` — the spec's matrix states both; a cap adds a rule the intent did not ask for
  - `[low]` `[reject]` (blind) queued messages are dropped when a skill session closes — a persona's `session:closed` drops its queue the same way; one rule for every seat
  - `[low]` `[reject]` (blind) an ok open with no discriminator reads as a refusal — main always sets one of `skill`, `seat` or `room`; the other branch is the conversation having ended, whose end closes the session
  - `[low]` `[reject]` (blind) a skill session has no decision-block path — a question in a skill's words is plain text the user answers by typing; Story 2.10's block is a persona turn's, and the spec names no block for a skill. Recorded as a residual risk
  - `[low]` `[reject]` (blind) small smells (`agentId ?? ''`, `live` without the `session` check, `skill ?? ''`, a stale comment) — the `live` list is built after the process is up (`keepSkillStart` runs in `up()`), `skill` is always set on a skill entry, and the rest are unreachable or cosmetic
  - `[low]` `[defer]` (edge) `observeMemlog` drops notes when two runs are in flight — pre-existing for two personas; added to `deferred`
  - `[medium]` `[patch]` (edge) a message typed during a skill's reply moves `since` forward, so the caret is lost, a pending turn appears and the timer resets — verified: `skillSeatsOf` takes the latest user entry's `at`, queued ones included; queued entries are ignored for `since`, with a test
  - `[low]` `[patch]` (edge) the composer lock — same root as the first row
  - `[low]` `[reject]` (edge) `closeSkill` shows a failure when main says not-found for a seat the window still holds — needs another window to have removed it; the user can end it again after a reload
  - `[low]` `[reject]` (edge) a skill session held by another window of the same project reads `ended` and its records can be removed — two windows share a thread by decision and a window holds its own seats; the fix needs a cross-window check
  - `[maybe-false]` `[reject]` (edge) removal could target another project if `projectPathFor` changed after the session opened — settled only by showing a window's project path changes mid-life, which nothing in main does; would be low
  - `[low]` `[patch]` (edge) orphan records on load — same root as the unlisted-record row
  - `[low]` `[reject]` (edge) a send to a held live session refused `session/ended` before its close event arrives leaves the message drawn — a race of one event
  - `[low]` `[reject]` (edge) a seat outcome naming an agent not in the snapshot — main resolves the name against the same install's roster
  - `[low]` `[reject]` (edge, claim) `live` is per window, so another window's running session reads ended — as the spec says (`live` true only for an entry held this launch)
  - `[low]` `[reject]` (edge, claim) run events carry no `skillSession`, only records and harness lines do — as built; the renderer links run cards by `sessionId`
  - `[medium]` `[patch]` (verification-gap) a skill-first session writing a file is not tested: nothing shows the rail and the `@name` handoff stay untouched — test added
  - `[medium]` `[patch]` (verification-gap) the `<skill> run` head for a run that wrote a document is not executed by any test — test added with a document on a skill-first card
  - `[medium]` `[patch]` (verification-gap) a skill's Stop is asserted only by its reply, not by the stopped line, the card or the thread flag — cases added
  - `[low]` `[patch]` (verification-gap) the snapshot's `busy` for a skill session mid-turn is not asserted — assertion added
  - `[low]` `[reject]` (intent-alignment, descriptive) the diff implements the main-process, renderer and docs readings with the boundary between them stubbed on each side, and no real `claude` process was run — the roster-only persona rule, the whole-roster room cast, the bare-verb row and the button's own row are this spec's recorded decisions; the live-process check stays a residual risk

## Design Notes

Decisions this spec makes where the planning left them open (all reversible; none changes a documented boundary):
- The start command is a third form of `session.open` (`{first}`), so the pinned counts hold; a refusal and an ended session are failure replies drawn locally, not records (the pinned `registry.say(` count and the rule that `getConversation` says nothing stay true).
- `/bmad-party-mode` opens the room with every installed persona as its cast, because a typed command cannot choose one and the cast chooser would drop the text after the name; a user who wants another cast uses Party as before.
- A `bmad-agent-*` skill with no roster entry starts a skill-first session (the roster decides what a persona is; hide nothing). A missing or empty manifest makes every first message `no skill named <word>`.
- The `/` list is given to the New session chat's composer only; a skill-first session's composer has none, so nothing inside a session suggests starting another skill.
- The `Sprint board` row is not built in the code, so the button gets a Team-half row of its own; building the row is separate work.

```ts
// first-message resolution in main
const word = text.trimStart().split(/\s+/, 1)[0] ?? ''
const name = word.startsWith('/') ? word.slice(1) : undefined
const skill = name === undefined ? undefined : skills.find((held) => held.name === name)
// roster persona -> seat; 'bmad-party-mode' with a roster -> room; skill -> openSkill; else no-skill(word without '/')
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean (includes `check-pins`)
- `npm test` -- expected: all pass; also `npx vitest run --project watchers`

**Manual checks (if no CLI):**
- Run the app: a window opens on the New session chat with `Skill Session` pressed; send `hello` (refusal line, text kept), then `/bmad-build hi` (header `bmad-build`, seat appears, run card `bmad-build run`); press the button for a fresh chat; `close session` lands back on it with the seat gone and no line.

## Auto Run Result

Status: done

**Summary.** A window now opens on a New session chat with nobody in it, reached again by a `Skill Session` button. Its first message is read in main (a third form of `session.open`, `{first}`): a roster persona's skill turns to that seat, `bmad-party-mode` opens the room with the whole roster as cast, any other installed skill starts a skill-first session, and anything else is refused with `no skill named <word>` as a reply, not a record. A skill-first session is its own kind (`kindOf`), spoken in the skill's name beside a `/` disc, held in its own thread, listed as a seat in a `Skill sessions` group, ended by `close session` (which removes its records) and listed `ended` after a relaunch, where a message to it is answered `session ended`. `CONTRACT_VERSION` is 1 and the channel, command, event and preload-method counts are unchanged.

**Files changed.**
- `src/main/session-kind.ts` (new), `session-registry.ts`, `session-bridge.ts`, `session-stop.ts`, `session-voice.ts`, `fold/route-frame.ts`, `windows/run-notification.ts` -- the kind, `openSkill`, first-message resolution, routing, close and send per kind
- `src/main/fold/transcript.ts`, `projections/transcript.ts`, `projections/runs.ts`, `sources/persistence/transcript-file.ts`, `install-model.ts` -- skill records, the stored `skillSessions` list, removal, `skillsFor`
- `src/shared/*`, `src/preload/*` -- additive optional fields, `SkillRecord`, the `{first}` target
- `src/renderer/ui/**` (`app.tsx`, `shell/`, `team/`, `chat/`, `persona/initials`, `status/`, `board/board-activity.ts`) -- New session chat, button row, seats, headers, turns and disc variants, scoped threads, local refusal lines, activity row, run-card head
- tests across `src/main`, `src/renderer/ui` and `tests/` -- new cases for every matrix row, plus pins amended narrowly
- `epics.md`, `EXPERIENCE.md`, `DESIGN.md`, `sprint-status.yaml`, `epic-7-context.md` (recompiled) -- the documents say what was built

**Review.** Patches applied: 8 entries (medium 4: queued message moving a seat's `since`, and three verification gaps for a skill's file writes, its `<skill> run` head and its Stop; low 4: composer lock, focus after a first message, unlisted skill records, a stale EXPERIENCE bullet, and the snapshot's `busy`). Deferred: 2 (the unbuilt `Sprint board` row, memlog attribution with two runs). Rejected: every other finding, with reasons in the triage log.

**Follow-up review recommended:** true. Four medium entries were patched, and what remains unverified is the live path: no real `claude` process was run for a skill's first turn, so `firstTurn` winning over the activation turn, and a real manifest's skill names reaching `openFirst`, rest on the pre-existing `session-process` behaviour and fakes.

**Verification.** `npm run typecheck`, `npm run lint` (with `check-pins`), `npm test` (246 files, 5839 tests) and the watchers project (65) pass after the patches. The built renderer was driven by the implementer against a stub bridge in the browser pane.

**Residual risks.** A skill that asks a multiple-choice question gets plain text, not Story 2.10's decision block. A skill run that writes no document shows the existing `saved · … 0 sections` head. Two windows on one project share a transcript, so one reads the other's running skill session as `ended`. The first message's user turn is timestamped in the renderer and its run card in main.
