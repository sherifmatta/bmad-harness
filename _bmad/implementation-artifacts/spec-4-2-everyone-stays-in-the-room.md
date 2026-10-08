---
title: 'Everyone stays in the room'
type: 'feature'
created: '2026-10-07'
baseline_revision: '58a00e6d9b22dddb2efc3f03677b5e14ddd38561'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 4.2 (epics.md "Everyone stays in the room", FR66, FR68, FR70, UX-DR26). Story 4.1 opens a room but the party view shows only its sysline: the chosen cast is not kept or drawn, the room's words are dropped by both transcript folds (`persona:said` without an `agentId`), nothing says who is speaking, and the room has no composer, so the user cannot take part, let alone interrupt.

**Approach:** Keep the cast and draw it as a strip of always-present cast cards (dimmed, the speaker lit with the equaliser). Main attributes the room's streamed text to a persona by parsing the party skill's documented turn marker `{icon} **{name}:**` (`.claude/skills/bmad-party-mode/SKILL.md`, "One exchange, woven"), emitting the existing `persona:said` with the resolved `agentId` and `room: true`; the party thread renders those as party turns (portrait, name, role, time, words). A party composer sends with no gate: `turn.send` into a busy room interrupts the speaker, then writes.

## Boundaries & Constraints

**Always:**
- Command and event counts stay 7 / 15, channels 22, preload methods 17; no new name or argument shape. Additive optional `room?: true` on `PersonaSaid`, `PersonaRecord`, `UserRecord`, `PersonaEntry`, `UserEntry`; `TranscriptRecord` kinds stay `persona | user | sysline`, entry kinds `persona | user | sysline | run`.
- Attribution is main's, in `fold/route-frame.ts` only (the one emitter of `persona:said`), for an entry with no `agentId` (a room). `RouteContext` gains `roster?: readonly { id: string; name: string }[]` (from `rosterFor`, the window's resolved roster); `RouteState` gains the parser's memory (carry text, speaker, turn ordinal). A marker is, at the start of a line, an optional icon (up to 8 non-space chars and a space), then `**Name:**` or `**Name**:`, trailing blanks consumed. Name matches a roster `name` case-insensitively after trim, else the speaker is unknown. The marker characters are not emitted: a party turn is the persona's words only. A marker may split across deltas (hold at most one line, at most 80 chars, only while the held text can still become a marker; flush as speech at a block stop or a message start). A line start is the start of a text block or after `\n`.
- Each marker starts a new turn: emitted `messageId` is `<cli message id>#<n>` (n = the marker count in this session's route state), so two turns never join, even by the same persona. Each turn's `at` is that of the delta that carried its marker. Text before the first marker of a message, or after an unknown name, has no persona and is **dropped** (as an agentless delta is today); the harness attributes nothing it cannot read from a marker and authors no word. A persona session's `route-frame` behaviour is byte-for-byte unchanged.
- Transcript (main `fold/transcript.ts`): a `persona:said` with `agentId` and `room: true` is recorded like any other (same join rule), with `room: true` on the record. A `persona:said` with no `agentId` is still dropped. The room's user turns are recorded with `room: true` (`recordUserTurn(text, at, room?)`); the transcript file validator keeps both flags (round trip). The 1:1 `Turns` never draws an entry with `room`; the party thread draws only `room` persona entries, `room` user entries and `room` syslines, in `at` order.
- Renderer state: `ConversationState` gains `roomCast: readonly string[]` (agent ids in roster order), set by `openRoom(cast)` when the reply is ok and cleared on the room's `session:closed` and by `ended()`. The room session id joins `busy`: set on the room's `session:opened` (the activation turn), on a room send, and on a room `persona:said` (a turn nobody sent); cleared by `session:awaiting-turn` and `session:closed` (existing paths). The renderer folds `persona:said` with `room` into `PersonaEntry` with `room`, join rule unchanged; one without `agentId` and without `room` stays ignored.
- The current speaker is a pure function of state: the `agent.id` of the last room persona entry while the room session is in `busy`, else none. Nothing else lights a card or runs the equaliser.
- Cast strip (`renderer/ui/party/cast-strip.tsx`): one card per cast id, in cast order, for the whole life of the room, on a horizontally scrolling strip (`--grad-cast`), cards `flex:1 1 0`, min-width 148px, 44px portrait (`portrait(..., 44, ...)`), name, title, one micro status line (`speaking` or `in the room`, lower case, mono). Opacity `--opacity-idle` / hover `--opacity-hover` / speaking `--opacity-speaking`. Speaking card: border, ground, `--shadow-speaking`, a 2px accent ring on the portrait, status in accent, and the equaliser (three real `<span>` bars, `aria-hidden`, rendered only on the speaking card, animated by `--motion-eq` with `.15s/.3s/.45s` delays); `.25s ease` transition on `opacity`, `border-color`, `background` (`--motion-cast`). Needed literals (148px, 44px, `#41597e`, `#1b222c`, ring width, equaliser bar sizes and delays) become tokens in `design/tokens.css` (and the `tests/tokens.test.ts` list); no literal in a component stylesheet. The strip does not announce: no live region, no `role`.
- Party turn (`renderer/ui/party/party-turn.tsx`, reusing `PersonaTurn`'s head and words where it fits): portrait 32px, name, title (role), `formatTurnTime(at)`, the words; nothing else: no tag, no quote or reference chrome, no decision block, no skill row. The latest turn of a speaking persona carries `--inset-turn-user`-style accent inset edge (new token `--inset-turn-party-live` = `inset 2px 0 0 var(--accent)`), only while that persona is the current speaker. The user's room message renders with the existing user turn component, never queued, never labelled `queuedFor`.
- Party composer: the existing `Composer` in the party view (`agentName="the room"`), always enabled, no gate. The renderer's room send path (`sendToRoom(text)` in `use-conversation.ts` and a pure `roomSent` in `conversation-state.ts`) adds one `room` `UserEntry` (not queued) and marks the room busy, then calls `sendTurn(roomSessionId, text)`; a refusal other than busy clears the room's busy mark; a refusal as `session/busy` leaves it busy and keeps the entry. `@<name>` has no special handling: the text is sent verbatim.
- Interrupt (main `session-bridge.ts` `sendTurn`, `session-registry.ts`, `session-stop.ts` constants): for a **room** entry whose turn is in flight and whose process is up, `turn.send` does not refuse as busy. It marks `entry.interrupting`, asks `entry.session.interrupt()` with `STOP_ACK_MS`, and when acknowledged waits (at most `STOP_RESULT_MS`) for the turn to end (`entry.idleWaiters`, released by the registry on `ended`, `finish` and close), then writes the turn exactly as an idle send does. Not acknowledged, or not idle in time: clear `interrupting`, return the `session/busy` refusal, kill nothing, say nothing. The failed `result` of an interrupt the user asked for is not a failure: `foldFrame` says no `turn failed` line and applies no `turn:failed` while `entry.interrupting`; `interrupting` clears on `ended`. A persona session's busy refusal is unchanged. Constants and the stop mechanism are untouched.
- Tokens only, `:focus-visible` rings, reduced motion by the existing single global block (no carve-out, no second block), no spinner, skeleton, badge, count, sound or next-step guidance. Words render as untrusted text exactly as `PersonaTurn` does. Harness microcopy lower case, mono, `·`-separated, no terminal punctuation.

**Never:**
- No header, turn counter, elapsed time, side panel, Room section, summary write, stop or pause control, `@` addressing logic (4.3 to 4.5). No `disagrees`, `evidence`, `unresolved` or quote chrome, no classification of a persona's words, no harness-written word attributed to any persona, no ranking or staging of who speaks. No new command, event, channel or preload method; no reading `config.toml`/`customize.toml`; no call to `resolve_party.py`; no change to the stop mechanism, `STOP_ACK_MS` or `STOP_RESULT_MS`.
- No auto-scroll (`scrollTo`/`scrollTop`/`scrollIntoView` stay confined as today) and no `aria-live` on the thread or strip; the one polite region stays the only one.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two speakers in one message | deltas `🧙 **Mary:** Hi.\n📋 **John:** No.` | two `persona:said` streams, `agentId` Mary then John, `room`, ids `<m>#1`, `<m>#2`, no marker text | none |
| Marker split | `…**Ma` then `ry:** hello` | one turn, Mary, text `hello` | none |
| Same persona twice | Mary, John, Mary | three turns, three records | none |
| Unknown name | `🎭 **Zed:** hi` | nothing emitted for Zed's text; speaker stays unknown until a known marker | dropped, no event |
| Text before a marker | `Welcome!\n🧙 **Mary:** hi` | `Welcome!` dropped; Mary's turn emitted | dropped |
| Plain prose, no marker | any delta not at a possible marker | emitted unheld once it cannot be a marker | none |
| Speaker lit | room busy, last room entry Mary | Mary's card speaking + equaliser, others idle | none |
| Room idle | `session:awaiting-turn` | no card lit, no equaliser; every card still present | none |
| Persona leaves the talking | Mary speaks, John next | Mary's card dims, John's lights; none removed | none |
| User types mid-speech | room busy, send | interrupt, ack, turn ends, user turn written; no `turn failed` line | not ack / not idle: `session/busy`, entry kept |
| Reload | window reloads | chooser shows (4.1 behaviour), persisted room turns not drawn | none |
| 1:1 thread | room turns exist | `Turns` shows none of them | none |

</intent-contract>

## Code Map

- `src/main/fold/route-frame.ts:40-130,294-360` -- `RouteContext`, `RouteState`/`initialRouteState`, `personaSaid`, the `text-delta` case (only emitter of `persona:said`); add the party parser here, with `message-start`/`block-stop` flushing. New pure helper module `src/main/fold/party-speech.ts` (+ test) holds the marker scan so `route-frame` stays readable.
- `src/main/session-registry.ts:191-280` (`foldFrame`, `routeFrame` call, `FrameSinks`), `:51` (`Entry`), `:418-427` (`finish`) -- supply `roster` for an agentless entry, `interrupting`, `idleWaiters`, release on `ended`/`finish`.
- `src/main/session-bridge.ts:257-325` (`writableSession`, `writeTurn`, `sendTurn`), `:297` -- room-busy interrupt branch; `recordUserTurn(text, at, true)` for a room entry. `src/main/install-model.ts:25-45` (`rosterFor`) -- the roster source.
- `src/main/session-stop.ts` -- `STOP_ACK_MS`, `STOP_RESULT_MS`, the `acknowledged` pattern (not exported; mirror it or export the helper unchanged in behaviour).
- `src/main/fold/transcript.ts`, `src/main/projections/transcript.ts:66,245`, `src/main/sources/persistence/transcript-file.ts:79` -- room flag on persona and user records, validator keeps it.
- `src/shared/events.ts:58` (`PersonaSaid`), `src/shared/conversation.ts` (`PersonaRecord`, `UserRecord`), `src/renderer/ui/chat/transcript-entry.ts` -- optional `room?: true`.
- `src/renderer/ui/chat/conversation-state.ts:30-60,330-345,500-560` (`ConversationState`, `ended`, `roomReady`, `foldEvent`, `hydrate`), `use-conversation.ts:256` (`openRoom`) -- `roomCast`, room busy, room persona/user entries, `roomSent`, `sendToRoom`, `speakerOf(state)`.
- `src/renderer/ui/chat/transcript.tsx:124` (`Turns`, `orderEntries` `:32`), `turn.tsx` (`PersonaTurn`, user turn), `format-turn-time.ts`, `sysline.tsx`, `composer.tsx` -- filter `room` out of 1:1; reuse for party.
- `src/renderer/ui/party/party-view.tsx`, `cast-chooser.tsx`, `party-view.css` -- strip, party thread, composer; `src/renderer/ui/app.tsx:82,269,317` supplies roster, cast, room, entries, `onSend`.
- `src/renderer/ui/persona/portrait.tsx:113` (`portrait`, sizes 32/36/38/44), `art-params.ts`.
- `src/renderer/design/tokens.css:175-270,409-414,564-569` -- `--opacity-*`, `--shadow-speaking`, `--grad-cast`, `--motion-eq`, `--motion-cast`, `@keyframes eq` (defined, unused), reduced-motion block.
- Pins that change deliberately: `tests/party-contract.test.ts` (`:60` file set, `:89` motion ban gets a scoped allowance for `var(--motion-eq)`/`var(--motion-cast)`), `tests/negative-surface.test.ts` (motion consumers list ~`:548-577`, ConversationState field list ~`:1327`, no pseudo-element motion ~`:580`), `tests/persistence-contract.test.ts:60-125` (agentless room `said` case: still dropped when it has no `agentId`; add the `room` case), `src/main/fold/transcript.test.ts:47`, `use-conversation.test.ts:1501`, `tests/tokens.test.ts:368-387`, `tests/accessibility.test.ts` (no new `aria-live`), `tests/shell-contract.test.ts:326-332` (no `cast-strip` string in `shell.tsx`), `src/main/session-bridge.test.ts` (room section), `route-frame.test.ts`.
- Read-only evidence: `.claude/skills/bmad-party-mode/SKILL.md` (turn format), `_bmad/planning-artifacts/architecture/**/.memlog.md:36` (speaker attribution is a parse of `text_delta`), `_bmad/planning-artifacts/ux-designs/**/DESIGN.md` (cast card `:697-699`, motion `:326-329`, `:729`).

## Tasks & Acceptance

**Execution:**
- `src/shared/events.ts`, `conversation.ts`, `src/renderer/ui/chat/transcript-entry.ts` -- add optional `room?: true` -- contract.
- `src/main/fold/party-speech.ts` (+test), `src/main/fold/route-frame.ts` (+test) -- marker scan, speaker/turn state, split emitter, flush at block stop and message start -- attribution in main.
- `src/main/fold/transcript.ts`, `projections/transcript.ts`, `sources/persistence/transcript-file.ts` (+tests) -- room flag on persona and user records, kept through the file.
- `src/main/session-registry.ts`, `session-bridge.ts` (+tests) -- roster to the fold for a room, room interrupt-then-write, no `turn failed` on a requested interrupt, release of waiters, room user turn flagged.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` (+tests) -- `roomCast`, room busy, room entries, `sendToRoom`, `speakerOf`.
- `src/renderer/ui/chat/transcript.tsx` (+test) -- 1:1 hides `room` entries.
- `src/renderer/ui/party/cast-strip.tsx`, `party-turn.tsx`, `party-view.tsx`, css, `design/tokens.css` (+dom/unit tests) -- strip, turn, thread, composer.
- `src/renderer/ui/app.tsx` -- pass cast, send handler.
- Existing pins listed in the Code Map updated to the new shapes; counts stay 7/15/22/17; a tripwire in `tests/party-contract.test.ts` that no party file renders a `disagrees`/`evidence`/`unresolved` string and that `cast-strip` has no `aria-live`/`role`.
- Tests for every matrix row.

**Acceptance Criteria:**
- Given a room opened with a cast, when it is live, then a strip shows every chosen persona's card for the room's whole life, none removed when someone else speaks, at idle 0.42 and hover 0.72 and speaking 1.
- Given the room's text carries `{icon} **{name}:**` markers, when it streams, then each marker's persona has a party turn of portrait, name, role, time and their words only, and no marker, tag, quote chrome or harness-authored word appears.
- Given a persona is speaking (room busy, last turn theirs), then their card alone is lit (border, ground, glow, 2px portrait ring, accent status) with the equaliser running; when the turn ends no card is lit and no equaliser runs; with reduced motion nothing animates.
- Given the room is mid-turn, when the user sends, then the speaker is interrupted and the message is written, with no queue, no gate and no `turn failed` line.
- Given room turns exist, then the 1:1 thread shows none of them and the party thread shows only the room's.

## Spec Change Log

## Review Triage Log

### 2026-10-07 — Review pass
- verdicts: 36 findings (blind 12, edge 14, verification-gap 2 plus 2 other, intent-alignment 1 descriptive plus 5 gap notes folded below) — high 0, medium 3, low 14, false 1, maybe-false 0
- findings:
  - `[medium]` `patch` a persona's own bold label at a line start (`**Pros:**`, `- **Risk:**`) was read as a marker with an unknown name and dropped the rest of the turn (blind, edge) — patched: an unknown name is a marker only with a non-ASCII icon in its prefix (`accepts` rule in `party-speech.ts`, passed by `route-frame`); `🎭 **Zed:**` still dropped as the matrix says; tests added
  - `[medium]` `patch` two overlapping room sends: the second was refused as busy and never delivered while the thread showed it (blind, edge, verification-gap other) — patched: room sends run through a per-entry promise chain (`Entry.roomSends`), each interrupt-then-write after the previous; overlapping-send test added
  - `[medium]` `patch` after a send, or in a new room, the previous speaker's card lit while the room was busy (edge) — patched: `speakerOf` stops at the last room user or sysline entry; tests added
  - `[medium]` `patch` held trailing short line and a marker opening a later block untested through `routeFrame` (verification-gap x2) — patched: three route-frame tests added
  - `[low]` `patch` timers matched on literals `3000`/`10_000` in the bridge test (blind, verification-gap other) — patched: `STOP_ACK_MS`/`STOP_RESULT_MS` imported
  - `[low]` `reject` a refused-as-busy room send keeps its entry though nothing was written (blind, verification-gap other, edge) — the contract says keep; reachable only when the CLI ignores an interrupt for `STOP_ACK_MS` or does not end the turn in `STOP_RESULT_MS`; recorded as a residual risk
  - `[low]` `reject` old rooms' persisted turns and syslines reappear under a new room's strip (blind, edge x2) — same ruling as 4.1: the transcript is flat and a room's end and what stays is Story 4.5; the stale-speaker lighting it caused is patched above
  - `[low]` `reject` markers resolve against the whole roster, not the cast; duplicate names take the first (blind, edge) — the room may conjure any roster persona; a turn without a card is honest, no card lights
  - `[low]` `reject` roster resolved on every frame (blind, edge) — a map over a small in-memory list; no demonstrated cost
  - `[low]` `reject` `interrupting` clobbered by concurrent interrupts, and not cleared on a failed-while-pending result (blind, edge x2) — concurrency removed by the patch above; the background-task case needs subagent party mode, and the next `ended` clears the flag
  - `[low]` `reject` `interruptTurn` busy-vs-not-found on a closed session, comparison against the `BUSY` constant (blind, edge) — a session that closed mid-await is answered busy, no wrong state follows
  - `[low]` `reject` held line of an interrupted block emitted at the next message start (edge) — it is the interrupted speaker's own text, emitted under the old speaker
  - `[low]` `reject` speaker reset at message start drops words after a tool call that carry no marker (edge) — the matrix row says text before a marker is dropped; the harness attributes nothing it cannot read
  - `[low]` `reject` `sendToRoom` clears busy on a non-busy refusal; late rejection after end (edge x2) — rare, no demonstrated defect
  - `[low]` `reject` renderer busy cleared by the interrupted turn's `awaiting-turn` (blind) — no speaker lights either way until a persona speaks
  - `[low]` `reject` cast strip not keyboard-focusable, idle contrast (blind) — Chromium makes a scroller focusable; the .42 opacity is the design's
  - `[low]` `reject` turn time is the completing delta when a marker splits (edge) — milliseconds
  - `[low]` `reject` literal portrait sizes, small code smells, `HOLD_MAX` units, hard-coded regexes in cast-strip tests (blind) — the portrait takes a closed size set; no divergence shown
  - `[low]` `reject` residual risk not recorded in the spec (blind) — recorded below in this run's result
  - `[false]` `reject` intent-alignment: the diff implements reading R1/R4, not the tracker (descriptive) — "close" is finalisation below: the story is set `done` in the sprint status and committed

## Design Notes

Why parse in main: persistence is main's, and the renderer never parses raw frames; the parse keeps `persona:said` as the one carrier and the marker is the skill's documented contract (architecture memlog). Why `#n` on the message id rather than a new field: the join rule already splits on `messageId`, so no schema or event change. Why unattributed text is dropped: attributing it would be the harness authoring a persona's voice; the cost is that the skill's unmarked welcome shows nothing until a persona speaks, recorded as a residual risk. Why the interrupt waits for idle: the CLI ends an interrupted turn with a failed `result` within milliseconds (`spike-stop-semantics.md`), and writing before it would leave the turn state counting a result that is not the new turn's.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Launch with a real project, open the room, and watch the strip light the speaker as turns stream; interrupt mid-turn by sending. Not verified in an unattended run unless the Electron app is launched.

## Auto Run Result

**Summary:** Party Mode now keeps the chosen cast on a strip of always-present cast cards (dimmed idle .42, hover .72, speaking 1, the speaker lit with border, ground, glow, a 2px portrait ring and the equaliser). Main attributes the room's streamed text to a persona from the party skill's `{icon} **{name}:**` marker, emitting the existing `persona:said` with the resolved `agentId` and `room: true`, so the party thread shows portrait, name, role, time and the words only. A party composer has no gate: `turn.send` into a busy room interrupts the speaker, waits for the turn to end, then writes.

**Files changed:**
- `src/shared/*`, `renderer/ui/chat/transcript-entry.ts` -- optional `room` flags on persona and user records and entries.
- `src/main/fold/party-speech.ts`, `route-frame.ts` -- marker scan and speaker/turn state; `fold/transcript.ts`, `projections/transcript.ts`, `sources/persistence/transcript-file.ts` -- room flag kept through the transcript file.
- `src/main/session-registry.ts`, `session-bridge.ts`, `session-stop.ts` -- roster to the fold, interrupt-then-write, serialised room sends, no `turn failed` line on a requested interrupt.
- `src/renderer/ui/chat/*` -- `roomCast`, room busy, `sendToRoom`, `speakerOf`, 1:1 thread hides room entries; `renderer/ui/party/*` -- `cast-strip`, `party-turn`, thread and composer; `design/tokens.css` -- cast and equaliser tokens.
- Tests: per module, plus pins updated in `tests/party-contract.test.ts`, `negative-surface.test.ts`, `persistence-contract.test.ts`, `tokens.test.ts`.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 4.2 done.

**Review:** 36 findings across four layers. Patches applied: 5 entries (medium x4, low x1): bold-label truncation, overlapping room sends, stale speaker, untested flush paths, timer literals. Deferred: 0. Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** true -- four medium entries were patched. The unverified risk is the patched paths themselves: the serialised room sends (a second send interrupts the first send's own fresh turn) and the `accepts` rule that separates a bold label from a marker, neither run against a real `claude` party session.

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (163 unit files, 3792 tests; 3 watcher files, 55 tests) and `npm run build` exit 0 after the patches.

**Residual risks:** no Electron launch and no real `claude` party run: attribution rests on the skill's documented `{icon} **{name}:**` format, and the interrupt on the CLI's in-band interrupt answering within `STOP_ACK_MS`. The skill's unmarked welcome and any text before a marker show nothing. A refused-as-busy room send keeps its entry though nothing was written. Earlier rooms' persisted turns can show under a later room (Story 4.5). A persona named outside the cast speaks without a card.
