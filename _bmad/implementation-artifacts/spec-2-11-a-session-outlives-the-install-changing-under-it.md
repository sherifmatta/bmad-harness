---
title: 'A session outlives the install changing under it'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_revision: 'f9914eb5264dabc19fc219637e99329e5d7174ee'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: []
deferred:
  - summary: >-
      An orphan has no document card or stop control to keep: both belong to Epic 3 (run:started, run.stop), so the FR6 clauses naming them are unverifiable until then.
    evidence: |-
      No run, card or run.stop handler exists in src/; epics.md FR31 and FR83 place them in Epic 3.
    location: >-
      src/renderer/ui/chat/orphan-header.tsx
    severity: medium
  - summary: >-
      If the last agent vanishes the room blocks on the no-agents preflight and the shell, with the orphan's close control, unmounts; the session stays live in main.
    evidence: |-
      app.tsx gates on roomState before mounting Shell (Story 1.8).
    location: >-
      src/renderer/ui/app.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 2.11 (epics.md "A session outlives the install changing under it", FR5 live-session clause, FR6). When re-resolution drops an agent from the roster while its session runs, nothing yet shows that session or lets the user end it: it has no tile, and `session.close` is declared in the contract but has no bridge, no preload method and no control. The user could neither see the orphan nor close it.

**Approach:** Re-resolution stays as it is — it only ever replaces the install snapshot and never reaches a session. The renderer derives an orphan as a live session whose agent id the roster no longer has. Each orphan gets a header of its own in the chat column (the EXPERIENCE.md assumption: "the close control sits in that session's chat header") carrying a native `close` button, and `session.close` gets its bridge so the button works. Its transcript turns are untouched.

## Boundaries & Constraints

**Always:**
- Roster and menus change by replacing the snapshot only. No code on the install path (`install-bridge`, `projections/install`, `install-model`, the watcher) imports, calls or signals a session; a session ends only by `session.close`, `conversation.end`, process exit or window destruction.
- An orphan is derived at render, never stored: `state.sessions` has an agent id that `agents` lacks. It has no tile and is not in `displayOrder`; the current persona is still derived from the roster alone.
- The orphan header sits above the current persona's header, one per orphan in session order, in `.chat-head` form: 38px portrait via the same `portrait()` call, name and title as React text (last known `AgentView` from that persona's transcript turns, else the id as name), a faint mono line `no longer in the install · session still open`, and one `<button type="button">` reading `close session`, accessible name `close session · <name>`, taking the shared `:focus-visible` ring with no rule of its own. `Enter`/`Space` come from the native button; no key-event code.
- Activating it calls the new `closeSession(sessionId)`: preload `session:close` → main finds the entry in this window's service, kills its process and closes it through the existing `finish(..., 'closed')`, so `session:closed` is emitted and the orphan's header goes with it. Unknown or already closed → `session/not-found`. The transcript and all its turns stay; only the session ends. Focus then moves to the current persona's composer (the same `composerFocus` path a decision answer uses).
- Harness microcopy: lower case, mono, `·`-separated, no terminal punctuation. Tokens only.

**Never:**
- No tile, tooltip, badge, sound, animation, confirm dialog or new live region for an orphan; no auto-close, no reopen, no resume, nothing persisted about it, no new event, command or contract change (`session.close` is already declared; the preload gains a fourteenth method).
- No stop control and no document card here: both are Epic 3's (a card is born by `run:started`, a stop is `run.stop(runId)`); no run exists in this epic. Nothing built here may hide or drop either; recorded in `deferred`.
- The persona's words, the transcript, the sessions of other personas and the roster are never edited by closing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Config changes | new install snapshot adds/removes agents, a live session exists | roster and tiles update in one render; every session, busy flag and transcript entry unchanged | none |
| Agent vanishes | session live for `x`, snapshot without `x` | no tile for `x`; its turns still show under its name; an orphan header with `close session` appears | none |
| Agent returns | snapshot has `x` again | tile back; orphan header gone; the same session | none |
| Close orphan | click or `Enter`/`Space` on `close session` | `closeSession(sessionId)` sent; on `session:closed` header gone; transcript intact; focus in current composer | refusal → failure line; header stays |
| Two orphans | two vanished agents | two headers, session order, each closes only its own | none |
| Mid-turn orphan | orphan with a turn in flight | header shown; its replies still join the transcript | none |
| Rostered persona | session for an agent in the roster | no orphan header | none |
| Close unknown | `session:close` with an unknown or closed id | `session/not-found` | reply envelope |
| After relaunch | no sessions | no orphan header | none |

</intent-contract>

## Code Map

- `src/main/session-bridge.ts:184-226` -- `closeSessions`/`finish` already kill and emit `session:closed`; add an `ipcMain.handle(SESSION_CLOSE_CHANNEL, …)` beside `TURN_SEND_CHANNEL` (:49) that closes one entry of the sender's service, replying `CommandReply` per `commands.ts:31`. Export `SESSION_CLOSE_CHANNEL = 'session:close'`.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- add the literal and `closeSession(sessionId): Promise<void>` (unwrap the reply, throw the envelope like `sendTurn`); update the "thirteen named methods" comment. `tests/bridge-contract.test.ts` ties the literals and counts.
- `src/main/install-bridge.ts`, `src/main/projections/install.ts`, `src/main/install-model.ts` -- read-only evidence: re-resolution here never reaches a session; the one link is `agentNameFor` (session reads install, never the reverse).
- `src/renderer/ui/chat/use-conversation.ts:36-70,197-353` -- `ConversationBridge` gains `closeSession`; `Conversation.close(agentId)` looks up `sessionOf`, calls it, and on rejection shows the failure; the hook exposes `orphans: readonly AgentView[]` (sessions whose agent is not in `agents`, last known `AgentView` from `state.entries`, else the `unknownAgent` shape from `conversation-state.ts`) and `close`.
- `src/renderer/ui/chat/conversation-state.ts` -- add pure `orphansOf(state, agents)` returning agent ids/views; `foldEvent` `session:closed` (:365) already removes the session.
- `src/renderer/ui/chat/orphan-header.tsx` + `orphan-header.css` (new) -- the header; reuse `chat-header.css` classes and `portrait`/`artParamsFor` (`chat-header.tsx`), no new tokens unless unavoidable.
- `src/renderer/ui/shell/shell.tsx:128-135` -- new optional `orphans` and `onCloseOrphan` props; render the orphan headers above `ChatHeader` in `.chat`.
- `src/renderer/ui/app.tsx:110-190` -- pass `conversation.orphans`; `onCloseOrphan` calls `conversation.close`, then on success `setComposerFocus` for `currentAgent(displayOrder(groupAgents(snapshot.agents)), currentId)` (helpers in `src/renderer/ui/team/tile-groups.ts`).
- Tests to add or extend: `session-bridge.test.ts` (close one session; unknown id; transcript kept; other sessions unaffected), `use-conversation.test.ts` and `conversation-state.test.ts` (orphans derive; return of the agent), `orphan-header` DOM test, `shell.test.tsx`, `app.test.tsx` (install push drops an agent mid-session: session, busy and turns unchanged; header appears; close; focus), `tests/bridge-contract.test.ts`, `tests/layering.test.ts` or `tests/session-contract.test.ts` (install-path modules never import session modules), `tests/negative-surface.test.ts` (no tile, tooltip, `title`, confirm for an orphan), `tests/accessibility.test.ts` (button is a tab stop; still one live region).

## Tasks & Acceptance

**Execution:**
- `src/main/session-bridge.ts`, `src/preload/{index.ts,harness-api.d.ts}` (+ tests, `tests/bridge-contract.test.ts`) -- `session.close` end to end -- the declared command had no path.
- `src/renderer/ui/chat/{conversation-state,use-conversation}.ts` (+ tests) -- orphan derivation and `close` -- a pure function of sessions and roster.
- `src/renderer/ui/chat/orphan-header.{tsx,css}`, `src/renderer/ui/shell/shell.tsx`, `src/renderer/ui/app.tsx` (+ tests) -- the header, its close control, focus after close -- the only surface an orphan has.
- `tests/session-contract.test.ts` or `tests/layering.test.ts`, `tests/negative-surface.test.ts`, `tests/accessibility.test.ts` -- install path never touches sessions; Never list holds on the orphan surface.

**Acceptance Criteria:**
- Given a live session and an install change that adds, removes or edits agents, then the roster and menus update and no session, busy flag, queue or transcript entry changes.
- Given an agent vanishes while its session runs, then its transcript stays, no tile exists for it, and a header with a working `close session` control is shown until the user closes it; nothing closes silently.
- Given an orphan header, then its close control is a native button reachable by Tab, activated by `Enter`/`Space`, with the shared focus treatment.
- Given the user closes an orphan, then only that session ends, its turns stay, and focus lands in the current persona's composer.

## Spec Change Log

## Review Triage Log

### 2026-10-02 — Review pass
- verdicts: 32 findings — high 0, medium 0, low 19, false 9, maybe-false 0, notes 4 (descriptive intent-alignment report)
- findings:
  - `[false]` `reject` orphan portrait is hard-coded `idle` so a working orphan looks idle (blind) — `portrait()` reads `state` nowhere (`void state`, FR81: one neutral face), so the argument changes nothing
  - `[low]` `patch` double activation of `close session` shows a spurious `no such session is open` after the first close succeeded (blind, edge, verification-gap) — `close` now returns true when the session is already gone from state; test added
  - `[false]` `reject` a transient empty roster turns every session into an orphan (blind, edge) — an empty roster blocks the room (preflight `no-agents`) so the shell, and with it the headers, is not mounted; the install snapshot is replaced whole, last-good on failure
  - `[low]` `reject` focus after close goes to the composer, not the next orphan; empty roster drops focus; stale closure in `.then`; failure path untested (blind, edge x3) — the composer is the specified landing, an empty roster has no shell, and the closure reads values that cannot change meaningfully within one IPC round trip
  - `[false]` `reject` `session.close` while the open is pending leaks the process or `kill()` throws (blind, edge x3) — the renderer only learns a session id after `session:opened`, and the spawn branch kills a process that arrives for a closed entry; `killGroup` swallows errors
  - `[low]` `reject` close mid-turn leaves queued messages and untested projection cleanup (blind) — `session:closed` already drops the persona's queue (`foldEvent`) and the persona states hear it through `announce`; both are covered by existing tests
  - `[false]` `reject` the composer and orphan key prefixes rest on a false premise (blind, edge) — the composer and `ChatHeader` are siblings in one children list with the same key, which is what left a stale header once an orphan list joined them; the shell comment overstated why and is reworded (patch below)
  - `[low]` `patch` the shell comment above the orphan key claims the current persona can be an orphan (blind, edge) — reworded; no code change
  - `[low]` `reject` `Shell` shows a dead button when `onCloseOrphan` is omitted (blind) — `App` always passes it; the default exists for shell-only tests
  - `[low]` `reject` no announcement when a persona becomes an orphan; the note does not say what closing does; same-name orphans share an aria-label (blind) — one live region is the contract and a roster change is not announced; ids differ and are in the header
  - `[low]` `reject` weak or brittle tests: wrapper selector, source-grep bans, hand-edited counts, `--switch-padding` borrowed (blind) — consistent with the repo's existing contract tests; the borrowed token is the end-session control's own
  - `[low]` `reject` `close` has no in-flight guard (edge, verification-gap) — covered by the patch above
  - `[low]` `reject` process exit between click and handling leaves a stale failure line (edge) — covered by the same patch
  - `[low]` `reject` `.then` reads click-time `snapshot`/`currentId` (edge) — a roster change inside one IPC round trip at worst lands focus on the topmost persona
  - `[low]` `reject` null current persona after close drops focus (edge) — no shell without a roster
  - `[low]` `reject` a decision option in an orphan's last turn sends into the orphan session and loses focus (edge) — the block shows only for a live idle session; sending is the session working; losing focus on a button that vanishes is the case the specified landing exists for, and an orphan has no composer to land in
  - `[false]` `reject` `bridgeAvailable` lacks `closeSession` (edge) — preload and renderer ship together
  - `[low]` `reject` transient partial roster shows false orphans (edge) — duplicate of the empty-roster row
  - `[false]` `reject` close while `entry.session` is undefined emits `session:closed` for a session never opened (edge) — unreachable, the renderer holds no id for it
  - `[false]` `reject` `kill()` throws and `finish` never runs (edge) — `killGroup` try/catches
  - `[low]` `reject` `lastOpened` still names the closed persona so the next open writes a handoff (edge) — `nameOf` has no name for a vanished agent, so no sysline is written; for a rostered persona a handoff from it is true
  - `[low]` `reject` focus moves before `session:closed` removes the header (edge) — events precede the reply on the same channel
  - `[false]` `reject` the "four causes" claim is proved only by a call-site count (edge) — a structural guard by design; the runtime tests prove each cause
  - `[false]` `reject` the composer key claim is a no-op (edge) — see the key row above
  - `[low]` `reject` focus claim holds only on the success path (edge) — the failure path keeps focus on the button, which is correct
  - `[low]` `reject` re-keying the composer loses a draft on upgrade (edge) — the code is not hot-swapped into a running window
  - `[low]` `reject` `close` has no guard against a second call while pending (verification-gap other) — covered by the patch
  - `[low]` `reject` the `finish(`/`.kill()` count test is source text (verification-gap other) — a structural guard, with runtime tests beside it
  - `[note]` `reject` install-change non-interference is checked by source text and a mocked bridge, not a real watcher plus a real session (intent-alignment) — the install path shares no state with sessions; the structural test pins that and the App test pins the renderer half
  - `[note]` `reject` one control stands for close and stop, and no card (intent-alignment) — recorded in `deferred`
  - `[note]` `reject` no test of a mid-turn orphan's replies (intent-alignment) — `persona:said` for a persona the roster lacks is the existing fold
  - `[note]` `reject` keyboard reach is source-checked plus jsdom click (intent-alignment) — same as every control in the repo; no real-Electron run, recorded below

## Design Notes

The epic asks for "its document card, and working stop and close controls". Cards are run-scoped (FR31) and stop is `run.stop(runId)` (FR83); neither exists before Epic 3, so there is nothing to keep or hide. Orphan detection is by roster membership, so a returning agent simply makes the orphan a rostered persona again with the same session.

An empty roster blocks the room (Story 1.8's preflight `no-agents`), which unmounts the shell and with it the orphan header; the session lives on in main untouched. Left as is and recorded in `deferred`.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary:** An agent that vanishes from the install while its session runs now leaves a header in the chat column, with its name, a quiet `no longer in the install · session still open` line and a `close session` button. Re-resolution was already isolated from sessions; this story pins that with tests and adds the missing `session.close` path so the button works. The transcript is untouched by closing.

**Files changed:**
- `src/main/session-bridge.ts` -- `session:close` handler, killing one session and emitting `session:closed`.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- `closeSession`, the fourteenth method.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` -- `orphansOf`, `orphans` and `close`.
- `src/renderer/ui/chat/orphan-header.{tsx,css}` -- the header and its control.
- `src/renderer/ui/shell/shell.tsx`, `src/renderer/ui/app.tsx` -- headers above the current persona's; focus to the composer after close; the composer re-keyed apart from the chat header.
- Tests: bridge, state, hook, header, shell and App suites, plus the bridge, session, negative-surface, accessibility and preflight contracts.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2-11 marked done.

**Review:** 32 findings. Patches applied: 2 (both low). Deferred: 2 (set at planning, see frontmatter). Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high, no medium patched).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (105 files, 2173 tests, plus 55 in the watchers project) and `npm run build` exit 0 on the patched tree. Every matrix row has a passing test.

**Residual risks:** No real Electron run: the header's look, Tab order and ring are checked in jsdom only. No stop control or document card exists for an orphan (Epic 3). An empty roster unmounts the shell and with it the control.
