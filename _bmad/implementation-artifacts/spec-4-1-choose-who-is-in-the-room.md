---
title: 'Choose who is in the room'
type: 'feature'
created: '2026-10-06'
baseline_revision: '270dd494cf2e84b742a1cddd487cedf70985a83e'
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

**Problem:** Story 4.1 (epics.md "Choose who is in the room", FR64, FR65). The view switch has a Party Mode button but the party view is an empty hidden `<section>`; nothing opens a `bmad-party-mode` session, a session without an `agentId` has nowhere to live (registry, bridge and renderer state are all keyed by `agentId`), no file can show *the room* as owner, and there is no room sysline.

**Approach:** Fill the party view with a cast chooser (roster, the five core personas ticked) and a thread. Widen `session.open` to take either an agent id or `{ room: AgentId[] }`; main opens an agentless session activated with `/bmad-party-mode`, says one harness sysline naming who is present, and marks files the room writes as owned by the room. The room's own words, cast strip, header and composer are Stories 4.2 to 4.5.

## Boundaries & Constraints

**Always:**
- Command and event counts stay 7 / 15, channels 22, preload methods 17. `session.open`'s argument becomes `AgentId | { room: readonly AgentId[] }` (update `ContractCommands`, the preload `openSession` type and the cardinality text); the reply is unchanged. A string argument behaves exactly as today.
- Room open: each cast id must pass `isAgentId` and exist in the window's roster, the cast must be non-empty and is de-duplicated in order; otherwise `ok:false` `session/invalid-cast`, nothing spawned. Same argv (`SESSION_ARGS`) and spawn path as a persona session; `agentId` absent on the entry, on `session:opened` and on `session:closed`. One room per window: a second room open returns the live room's `sessionId`, spawns nothing and says nothing.
- First stdin turn: `/bmad-party-mode` alone when the cast is exactly the roster's ids (the skill's default room is the installed agents), else `/bmad-party-mode ` followed by `Name (id)` for each cast member joined by `, ` (the skill treats an inline-named cast as the roster; format read from `.claude/skills/bmad-party-mode/SKILL.md` step 4). Never an argv.
- A room has no tile, no status dot and no persona state: the persona-state fold and tiles already ignore an agentless session, keep it so. No handoff text, no menu dispatch (`menu.dispatch` for a room session refuses with `session/not-found`, never throws on a missing `agentId`). `session.close`, end-session and window destroy close it like any session.
- Sysline: when the room is first opened main records and tells one sysline (`harness:said`, same voice path as `createVoice`) reading `room opened by you · present · <Name> · <Name> …` (roster display names, the id when a name is empty), lower case apart from names, `·`-separated, no terminal punctuation. It is flagged `room: true` on the `SyslineRecord` and the `harness:said` payload (optional fields, persisted and round-tripped by the transcript file). The 1:1 thread (`Turns`) never renders a `room` sysline; the party thread renders only them, in the existing `Sysline` component, with no portrait, name or timestamp.
- Rail: a file a room session writes (`fold/written-paths`, the source `foldFrame` already uses) gets a row marker `room: true` (optional, on `RailRow`); the renderer shows the label `the room` in the owner slot instead of any persona name, in a presentation visibly distinct from a persona's (own class and tokens, no portrait). The room marker wins over a class owner derived from the basename; it raises no persona `note`.
- Party view (`renderer/ui/party/`): while no live room, a chooser lists every roster agent as a labelled native checkbox (portrait, name, title), defaulting to the roster agents whose id is in `CURATED_AGENT_IDS` (`ui/persona/art-params.ts`); an *Open the room* button, disabled with none ticked, calls `openSession({room})`. While a room is live the chooser is replaced by the party thread. Both views stay mounted; sessions in the other view keep running; the party view mounts through a new `party` slot on `Shell`, `App` supplies it.
- Renderer state gets a `room` slot (`sessionId` or none): agentless `session:opened` sets it, agentless `session:closed` clears it; agentless `persona:said` stays ignored; the snapshot's `sessions` never includes the room. Tokens only, `:focus-visible` rings, no spinner/skeleton/badge/count/sound/next-step guidance, no literal colours or sizes.

**Never:**
- No cast strip, header, turn counter, side panel, composer, `@` addressing, summary write, stop/pause control, or rendering of the room's words (`persona:said` of a room stays dropped by the transcript fold) — Stories 4.2 to 4.5. No *Open disagreements* or *Decisions so far* slot. No reading `config.toml` / `customize.toml`, no call to `resolve_party.py` from the harness, no check that the skill is installed.
- No new command, event, channel or preload method; no change to `STOP_ACK_MS`, `STOP_RESULT_MS` or the stop mechanism; the room session gets no run, card or notification.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open default | roster of five, all ticked | spawn, first turn `/bmad-party-mode`, `session:opened` without `agentId`, one room sysline with five names | none |
| Open subset | two ticked | first turn `/bmad-party-mode Mary (bmad-agent-analyst), John (bmad-agent-pm)`, sysline names those two | none |
| Open again | room live | same `sessionId`, no spawn, no second sysline | none |
| Bad cast | `[]`, `['../x']`, unknown id, non-array | `ok:false` `session/invalid-cast` | nothing spawned |
| Spawn fails | `claude` missing | `session/spawn-failed` as for a persona, no sysline | none |
| Room writes a file | chat-turn `Write` under `_bmad/` | row marked `room`, label `the room`, no persona name | none |
| Room closes | process exits / end-session | `session:closed` once, chooser returns, room slot cleared | none |
| Reload | window reloads, room alive | snapshot omits it, chooser shows; re-open returns the live room (no second sysline) | none |

</intent-contract>

## Code Map

- `src/shared/commands.ts:26-31`, `src/shared/conversation.ts` (`SessionOpenReply`, `SyslineRecord`, `HarnessSaid`), `src/shared/events.ts:40`, `src/shared/rail.ts` (`RailRow`), `src/shared/ids.ts` -- contract; `agentId?` is already optional on `session:opened`/`closed`/`persona:said`. Widen `session.open`'s arg; add optional `room` flags.
- `src/main/session-bridge.ts:141-170` (`openSession`, `isAgentId` at `:148`, `byAgent` reuse at `:156`, `handoffFor` at `:163`), `:259` (`dispatchMenu` reads `target.entry.agentId`), `:405` (`getConversation` maps `live` by agentId) -- branch on the argument shape; guard menu dispatch and the snapshot against an agentless entry. `agentNameFor` (`install-model.ts:25`) gives display names; the roster ids come from the same projection.
- `src/main/session-registry.ts` (`Entry.agentId` `:51`, `Service.byAgent`/`written` `:243-244`, `open` `:427`, `discard` `:398`, `finish` `:418`, `startProcess` `:270-304`, `foldFrame` `:234-244`) -- make `agentId` optional on `Entry`, add a `service.room` slot beside `byAgent`; `written` per agent is for handoff only: a room's written paths go to the rail marker instead.
- `src/main/sources/session/session-process.ts` (`activationTurn` `:82`, `isAgentId` `:69`, `SpawnSessionOptions.agentId` `:199`, first write `:352`) -- add the room activation turn builder; keep `activationTurn('bmad-agent-pm') === '/bmad-agent-pm'`.
- `src/main/session-voice.ts` (`createVoice`, `LINES`), `src/main/projections/transcript.ts` (`recordSysline`), `src/main/fold/transcript.ts` -- room sysline producer; the sysline record carries `room`. `src/main/sources/persistence/transcript-file.ts:78-92` `isRecord` must keep the flag.
- `src/main/projections/rail.ts:38-41` (`withOwner`), `fold/artifact-owner.ts`, `fold/written-paths.ts`, `fold/persona-state.ts:147,172-183` -- where the room marker joins a row; persona fold must not read it.
- `src/preload/index.ts:123`, `src/preload/harness-api.d.ts:44` -- `openSession` argument type only.
- `src/renderer/ui/chat/conversation-state.ts` (`foldEvent` `:477-522`, `hydrate` `:446`, `orphansOf` `:396`), `use-conversation.ts` (`openSession` type `:32`), `transcript.tsx` / `transcript-entry.ts` (`Turns`, `SyslineEntry`), `sysline.tsx` -- `room` state slot, `openRoom(cast)`, thread filtering.
- `src/renderer/ui/shell/shell.tsx` (party `<section className="view view-party">` at the `:174-211` region), `view.ts`, `shell.css:194,293`, `design/tokens.css:175-189` -- add the `party` slot; the 240px side panel token stays unused here. `src/renderer/ui/app.tsx` supplies the slot.
- `src/renderer/ui/persona/art-params.ts:201-276` (`CURATED_AGENT_IDS`), the existing portrait component used by tiles -- default ticks and chooser faces.
- `src/renderer/ui/outputs/owner-label.ts`, `outputs.tsx:96,131`, `output-row.tsx` (`output-row-owner`) -- the `the room` label and its class.
- Pins that change deliberately: `shell.test.tsx:174-211,420-443`, `tests/shell-contract.test.ts:172-175,326-339`, `app.test.tsx:295` (buttons stay the same), `tests/bridge-contract.test.ts:487-505`, `session-bridge.test.ts:327-335`, `session-process.test.ts:73-156`, `tests/negative-surface.test.ts` (sysline sweeps `:837-855,1237-1250,1324-1330`; `recordSysline` offenders list; counts stay), `tests/contract.test.ts:83`, `persistence-contract.test.ts:79,230` (agentless `persona:said` still dropped).
- Read-only evidence: `.claude/skills/bmad-party-mode/SKILL.md` (cast override), `_bmad/planning-artifacts/**/EXPERIENCE.md:549` (sysline sample).

## Tasks & Acceptance

**Execution:**
- `src/shared/*` -- widen `session.open`, add `room?: true` to `SyslineRecord`, `HarnessSaid` payload and `RailRow` -- contract.
- `src/main/sources/session/session-process.ts` (+test) -- room activation turn builder, `ROOM_SKILL` constant -- first-turn text.
- `src/main/session-registry.ts`, `src/main/session-bridge.ts`, `src/main/session-voice.ts` (+tests) -- agentless entry, one room per window, cast validation, sysline once on first open, room-written paths marked, menu/snapshot guards.
- `src/main/projections/rail.ts`, `src/main/sources/persistence/transcript-file.ts`, `src/main/fold/transcript.ts` (+tests) -- room row marker and persisted `room` flag.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- argument type.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts`, `transcript.tsx` (+tests) -- `room` slot, `openRoom`, 1:1 thread hides room syslines.
- `src/renderer/ui/party/cast-chooser.tsx`, `party-view.tsx`, css (+tests), `shell.tsx`, `app.tsx` -- chooser, party thread, slot.
- `src/renderer/ui/outputs/*` (+tests) -- `the room` owner label and class.
- Existing contract and sweep tests listed in the Code Map -- updated to the new shapes; one new contract test that counts stay 7/15/22/17 and that renderer party files import only `shared/`.
- Tests for every matrix row; unit tests for the cast text builder.

**Acceptance Criteria:**
- Given the view switch, when Party Mode is selected, then a chooser lists the roster with the five core personas ticked by default and a persona session in the 1:1 view keeps running.
- Given the chooser, when *Open the room* is pressed, then `session.open({room})` spawns one `claude` process whose first stdin turn is `/bmad-party-mode` (plus the named cast when it is a subset) and `session:opened` carries a `sessionId` and no `agentId`.
- Given a room session, then it has no tile, status dot or persona state, and a file it writes shows `the room` as owner in a presentation distinct from a persona's.
- Given the room opens, then one sysline `room opened by you · present · …` appears in the party thread, in the harness's register, never attributed to a persona, and never in the 1:1 thread.

## Spec Change Log

## Review Triage Log

### 2026-10-06 — Review pass
- verdicts: 33 findings (blind 12, edge 16, verification-gap 1 plus 3 other, intent-alignment 1 descriptive) — high 0, medium 4, low 28, false 1, maybe-false 0
- findings:
  - `[low]` `reject` old rooms' sysline lines reappear in a later room's thread (blind, edge) — the transcript is flat and the flag carries no session; scoping adds a persisted field, and in 4.1 a room ends only by process exit or end-session (which clears the transcript); the room's lifecycle and thread are 4.2 and 4.5
  - `[low]` `reject` a late open reply can set `room` to a session whose `session:closed` came first (blind, edge x2) — needs the process to exit between spawn and the reply; the fix adds a branch for a race not shown to be reachable
  - `[low]` `patch` the `room` flag is documented as the opening line only, but every harness line of an agentless session is flagged (blind) — comments reworded (patched)
  - `[low]` `reject` reload hides a live room and a reopen with a different cast is silently ignored (blind, edge x3) — the matrix documents it; restoring a live room across reload needs a snapshot field and belongs with 4.2's thread, which is the first place the room has anything to restore
  - `[medium]` `patch` the room mark on a rail row never expires: a persona that later writes the file still reads `the room`, and end-conversation keeps the marks (blind, edge x2, verification-gap other) — patched: persona writes unmark (`personaWrote`), end-conversation clears (`roomCleared`), tests added
  - `[low]` `reject` the central claim (inline-named cast, bare skill for the full roster) is unverified against the real skill (blind) — no live run possible in this unattended build; recorded as a residual risk
  - `[low]` `reject` `Name (id)` built from unsanitised names (blind, edge) — the turn is one JSON-encoded stdin line so a newline cannot split it; names come from the user's own roster
  - `[low]` `reject` `spawnSession` can write a bare `/` when given neither `agentId` nor `firstTurn` (blind, edge, verification-gap other) — the only caller always gives one
  - `[low]` `reject` guard branches and `turn.send`/`session.close` against a room untested (blind, edge) — no demonstrated defect; `turn.send` into a room is the generic path 4.2 uses
  - `[low]` `patch` focus is lost when the chooser unmounts (blind) — patched: the party thread takes focus when the room opens; the other points (disabled-state explanation, live-region announcement, in-flight feedback) rejected: nothing to announce yet, spinners are banned
  - `[low]` `patch` dead `''` branch in `PartyView` (blind) — patched: type-guard filter
  - `[low]` `reject` party contract test looser than the spec's "import only shared/" and a tripwire on file list (blind) — the fix is to edit this build's spec; the layering test governs
  - `[low]` `reject` `ctx.registry.say` throwing after the room is live (edge) — it writes a transcript line and cannot realistically throw
  - `[low]` `patch` `snapshot.busy` includes the room (edge x2) — patched: filtered to persona sessions, test added
  - `[low]` `reject` empty roster reports `invalid-cast` (edge) — the renderer only sends ids from the roster it holds
  - `[low]` `reject` queued `openRoom` promises hang when `ended()` runs before the snapshot (edge) — same pattern as persona opens, not caused here
  - `[low]` `reject` `writableSession` does not refuse agentless entries (edge) — see turn.send above
  - `[medium]` `patch` `rosterFor` never executed by a test (verification-gap) — patched: test added in `install-model.test.ts`
  - `[low]` `reject` persona-state test passes without a fold change and does not exercise a lost class owner (verification-gap other) — the fold ignores rows without an owner, and `rail.test.ts` covers the owner removal
  - `[false]` `reject` intent-alignment: the diff implements reading B, nothing closes the story (descriptive) — no bad outcome; story close is finalisation below

## Design Notes

Why the argument widens rather than a new command: the contract pins seven commands and the room is "a session of the same kind as a persona session"; only its identity (no `agentId`) and activation text differ. Why `/bmad-party-mode` bare for the full roster: the skill's own default room is the installed agents, so passing a cast would only restate it.

Why the room sysline is flagged: the transcript is one flat per-project list; without the flag the room's sysline would sit in the 1:1 thread. Room speech is dropped by the transcript fold today and stays so until 4.2.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- With a real project, Party Mode shows the chooser; opening the room starts the party skill's greeting (its words render in Story 4.2); not verified in this run unless the Electron app is launched.

## Auto Run Result

**Summary:** Party Mode now has a cast chooser (the five core personas ticked) and opens a room: `session.open({ room })` starts an agentless `claude` session activated with `/bmad-party-mode` (the named cast after it when it is a subset), says one `room opened by you · present · …` sysline in the party thread, and marks files the room writes in the rail as owned by `the room`. The room's words, cast strip, header and composer are Stories 4.2 to 4.5.

**Files changed:**
- `src/shared/commands.ts`, `conversation.ts`, `events.ts`, `rail.ts` -- `SessionTarget`, optional `room` flags.
- `src/main/sources/session/session-process.ts` -- `ROOM_SKILL`, `roomActivationTurn`, `firstTurn`.
- `src/main/session-registry.ts`, `session-bridge.ts`, `session-voice.ts`, `install-model.ts` -- agentless entry, one room per window, cast validation, sysline, menu/snapshot guards, room-written paths.
- `src/main/projections/rail.ts`, `rail-annotator.ts`, `transcript.ts`, `fold/transcript.ts` -- room row marker (set, unset on a persona write, cleared on end) and the flagged sysline.
- `src/preload/*` -- argument type.
- `src/renderer/ui/chat/*`, `party/*`, `outputs/*`, `shell/shell.tsx`, `app.tsx` -- room state, `openRoom`, chooser, party thread, `the room` label, `party` slot.
- Tests: per module, plus `tests/party-contract.test.ts`; existing pins updated (`session.open` argument, the chooser as the one renderer `<input>`, `ConversationState.room`, annotator seam, the party view slot).
- `_bmad/implementation-artifacts/epic-4-context.md` -- compiled; `sprint-status.yaml` -- 4.1 done, epic 4 in progress.

**Review:** 33 findings across four layers. Patches applied: 6 (entries: room-mark expiry medium, `rosterFor` test medium, flag comments low, busy snapshot low, focus low, dead branch low). Deferred: 0. Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** true -- two medium entries were patched, and the unverified risk is the new room-mark expiry path (a persona write unmarking a room row, and `roomCleared` on end) plus the inline-cast turn against the real party skill.

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (161 unit files, 3705 tests; 3 watcher files, 55 tests) and `npm run build` exit 0 after the patches.

**Residual risks:** no Electron launch and no real `claude` run: the `Name (id)` inline cast and the bare `/bmad-party-mode` for the full roster rest on `.claude/skills/bmad-party-mode/SKILL.md`. A reload shows the chooser over a live room, and opening again with a different cast returns the live room unchanged (the room is not in the snapshot; 4.2 restores it with its thread). Room lines of an earlier room stay in the persisted transcript and show in a later room's thread. A room that overwrites a class-owned file drops the row's owner, which raises one `note` on that persona. Nothing checks the party skill is installed.
