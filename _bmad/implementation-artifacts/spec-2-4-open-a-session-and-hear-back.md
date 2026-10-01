---
title: 'Open a session and hear back'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: '0f1f1e3a778758206628da23dc7edd0bbf4cceb0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A message sent while a turn is in flight (typically while the activation greeting streams) is refused session/busy, shown as an error, and its user turn stays in the transcript though nothing was delivered.
    evidence: |-
      The renderer registers the session on session:opened while the activation turn is still in flight, so send() transmits at once and main refuses it. Queueing, the dimmed queued marker and resend on session:awaiting-turn are Story 2.5; the I/O matrix row Send busy specifies the refusal.
    location: >-
      src/renderer/ui/chat/use-conversation.ts
    severity: medium
  - summary: >-
      A turn that never ends (hung process, long run) leaves the session session/busy with no stop control.
    evidence: |-
      inFlight clears only on a result frame. The stop control and run.stop belong to Epic 3; a timeout here would be an invented policy.
    location: >-
      src/main/session-bridge.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 2.4 (epics.md "Open a session and hear back", FR20, FR21, FR95, FR96, NFR24). The contract (2.2) and the turn and composer (2.3) exist, but nothing starts a `claude` process, nothing carries `persona:said` across the bridge, and no persona can be talked to.

**Approach:** Add a session source that spawns the long-lived `claude` stream-json process, a main-side session bridge that folds its frames into contract events and pushes them over one IPC channel, three preload methods (open, send, listen), and a renderer conversation that mounts the 2.3 transcript and composer in the shell. Activating a tile opens that persona's session; the persona's reply renders as their own turns.

## Boundaries & Constraints

**Always:**
- Argv is exactly `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local`, exported as one constant, cwd the project root. `--forward-subagent-text` and any identity or style injection (`--append-system-prompt`, `--system-prompt`) are never passed.
- `/<agentId>` is written as the first stdin user turn, as a JSON line `{type:'user',message:{role:'user',content:[{type:'text',text}]}}`; it is never a positional argument. The agent id must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`, else `session.open` replies `ok:false` and nothing is spawned.
- One session per (window, agentId): a second `session.open` for a live agent returns the existing `sessionId` and spawns nothing. Every later turn goes to that process.
- Turns are serialised: `turn.send` while a turn is in flight replies `ok:false` `session/busy`. A turn is in flight from the activation write or a send until a stdout `result` frame (any `subtype`, `is_error` or not), which emits `session:awaiting-turn`. The process exit code is never the signal.
- Frames fold through `routeFrame` with `runId` omitted (a chat turn), `projectRoot` the window's project, `now` from an injected clock. Only `persona:said` reaches the renderer from it; the renderer never sees a frame. Events travel as `{name, payload}` on the one channel `session:event`.
- `session:opened` is emitted when the process spawns; `session:closed` (`process-exited`, or `closed`) once, last, when it exits or the window is destroyed. Stdout is split on `\n`, a partial line is held until its newline, a non-JSON line is dropped. Stderr is ignored; no stderr text or path crosses the bridge.
- Renderer: persona turns carry the persona's `AgentView` (portrait, name, title); pieces of one `messageId` join one turn in order; the words are never edited. The composer is mounted in `.chat` under `.scroll`, keyed by agent id, and is never disabled. The user's text appears as a user turn on send.
- Checklist for the layer rule: Sources do not import Fold; the bridge (composition root) may import both; renderer imports only `src/shared/`.

**Never:**
- No queued messages, `session:awaiting-turn`-driven resend, status dots driven by sessions, persistence, restart handling, handoff, `@`, menu dispatch, `run.*`, `doc.*`, `conversation.end`, session close control, or party session (Stories 2.5 to 2.13). No spinner, skeleton or "thinking" sentence while a session opens. No new dependency; no change to the 14 events or 7 commands in `src/shared/`.
- No `--permission-mode` flag, no model flag, no env mutation beyond inheriting `process.env`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | `session.open('bmad-agent-analyst')`, none live | spawn with the argv, write `/bmad-agent-analyst` turn, reply `{ok:true,sessionId}`, push `session:opened` | none |
| Open again | agent already live | same `sessionId`, no spawn | none |
| Unsafe id | `../x`, `a b`, `''` | `ok:false` `session/invalid-agent`, no spawn | no process |
| Spawn fails | `claude` missing (ENOENT) | `ok:false` `session/spawn-failed` (code only in `detail`), no session kept | no stderr text |
| Speech | main-thread `text_delta` frames | `persona:said` per delta, same `messageId`, order kept | none |
| Subagent text | frame with `parent_tool_use_id` | no event | none |
| Turn end | stdout `result` row, success or `error_during_execution` | `session:awaiting-turn` once | none |
| Send idle | `turn.send(id, 'hi')` | one stdin user line, reply `ok:true`, turn in flight | none |
| Send busy | send while in flight | `ok:false` `session/busy`, nothing written | none |
| Send unknown | unknown or closed `sessionId` | `ok:false` `session/not-found` | none |
| Split chunks | a JSON line split across two stdout chunks, two lines in one chunk, a junk line | each whole line parsed once; junk dropped | never throws |
| Exit | process exits, or window destroyed | `session:closed` once, last; process killed on destroy | none |

</intent-contract>

## Code Map

- `src/main/fold/route-frame.ts` -- `routeFrame(state, frame, ctx)` already yields `persona:said`; `initialRouteState`. Reuse; do not change.
- `src/main/fold/frame.ts` -- frame narrowing; add nothing here. A new `src/main/fold/turn-end.ts` (`endsTurn(frame)`: top-level `type === 'result'`, no `parent_tool_use_id`) keeps the wire word `result` in Fold.
- `src/main/sources/install/run-command.ts` -- precedent: spawn in a process group, `windowsHide`, kill the group. The session source copies that (`detached: true`, `process.kill(-pid)`), with stdin and stdout piped, stderr ignored.
- `src/main/rail-bridge.ts`, `src/main/install-bridge.ts` -- bridge pattern to copy: per-`sender.id` service map, injected deps, `sender.once('destroyed')`, `projectPathForWebContents`, `failure()` envelopes.
- `src/main/index.ts:69-72` -- register the new bridge beside the others; its channel constants are exported for `tests/bridge-contract.test.ts`.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- add `openSession(agentId)`, `sendTurn(sessionId, text)`, `onSessionEvent(listener)`; the first two reject with the `HarnessError` on `ok:false`, the listener gets the `ContractEvent` and never the IPC event. `tests/preflight-contract.test.ts:149` asserts the exact method list and must be updated.
- `src/shared/commands.ts` -- `ContractCommands['session.open'|'turn.send']['reply']` are the reply types; `src/shared/events.ts` `ContractEvent` is what is pushed. Read-only.
- `scripts/record-run.mjs:100` -- the stdin user-line shape and the in-band flags, read-only evidence.
- `src/renderer/ui/shell/shell.tsx` -- add optional props `onActivate(agentId)` (called with the id on every tile selection) and `composer(agent)` (rendered in `.chat` after `.scroll`). Existing callers and tests unchanged.
- `src/renderer/ui/chat/transcript.tsx` -- export a `Turns` fragment so the thread the shell already provides is not wrapped in a second `.thread`; `Transcript` keeps its markup.
- `src/renderer/ui/app.tsx` -- mount `useConversation`, pass `onActivate`, `composer`, and the `Turns` as the shell's children in place of `Preview` (the 1.7 scaffolding is removed from the thread; its function was to hold the face judgement and the roster errors, which stay as `ErrorLine`s above the turns).
- `tests/negative-surface.test.ts`, `src/renderer/ui/shell/negative-surface.test.tsx` -- the sweeps still apply: no loading-like word, no `child_process` outside Sources, no sort, no key handling outside the composer. The shell negative test renders `Shell` without a composer, so it stays true.

## Tasks & Acceptance

**Execution:**
- `src/main/fold/turn-end.ts`, `turn-end.test.ts` -- `endsTurn` -- the one place the result row is recognised.
- `src/main/sources/session/session-process.ts`, `session-process.test.ts` -- `SESSION_ARGS`, `createLineSplitter`, `spawnSession` (spawn injectable) -- argv, first-turn framing, line splitting, kill group.
- `src/main/session-bridge.ts`, `session-bridge.test.ts` -- `registerSessionBridge(deps)`, channels `session:open`, `turn:send`, `session:event`, the service per window -- sessions, serialisation, folding, close.
- `src/main/index.ts` -- register the bridge.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts`, `tests/bridge-contract.test.ts`, `tests/preflight-contract.test.ts` -- three methods and channel ties.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` (+ tests) -- fold events into entries, hold sessions and the pending first message, call the bridge.
- `src/renderer/ui/shell/shell.tsx`, `src/renderer/ui/chat/transcript.tsx`, `src/renderer/ui/app.tsx` -- mount.
- `tests/session-contract.test.ts` -- argv has the three load-bearing flags and not `--forward-subagent-text`, no identity injection flag, and `/` + agent id is the first written line; renderer files contain no `result`/frame vocabulary.
- Tests for every matrix row.

**Acceptance Criteria:**
- Given a persona tile is activated, when `session.open(agentId)` runs, then one process is spawned with the exact argv and `/<agentId>` is the first line written to its stdin.
- Given the argv, when a test reads it, then `--include-partial-messages`, `--setting-sources project,local` and `--input-format stream-json` are each present, and `--forward-subagent-text` is absent.
- Given a persona replies, when main-thread `text_delta` arrives, then the renderer shows persona turns with portrait, name and title and the words unchanged; subagent text never renders.
- Given no identity or style flag is passed, when the session opens, then the only thing the harness sends is the agent's skill invocation.
- Given a second activation of the same persona, when `session.open` runs, then no process is spawned and the same session serves the next turn.
- Given a turn in flight, when a send arrives, then it is refused with `session/busy` and nothing is written; after the `result` row it is accepted.
- Given a message typed for a persona with no session, when sent, then the session is opened and the text is written after the activation turn ends.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 33 findings (blind 13, edge 16, verification-gap 1 plus 2 other, intent-alignment 1 descriptive) — high 0, medium 1, low 8, false 1, maybe-false 0; the rest rejected as low or not-real
- findings:
  - `[low]` `patch` pending text never cleared on a rejected open or on session:closed, so later sends are refused session/waiting (verification-gap other, blind, edge) — cleared in both places, tests added
  - `[low]` `patch` App glue (onActivate, onSend agent id, Composer key) untested (verification-gap) — jsdom App test added; fails when each is removed or mis-wired
  - `[medium]` `defer` message typed during the activation greeting is refused busy and its user turn stays (blind, edge, verification-gap other) — Story 2.5 queues; see frontmatter
  - `[low]` `defer` no recovery for a turn that never ends (blind) — Epic 3 stop control; see frontmatter
  - `[low]` `reject` activation write result ignored (edge) — a failed write means the process is gone and its close emits session:closed
  - `[low]` `reject` final stdout line without a newline is dropped (blind, edge) — the CLI newline-terminates every frame; only a crash loses one
  - `[low]` `reject` non-object JSON frame, routeFrame or sender.send throwing (edge) — routeFrame and endsTurn narrow from unknown and never throw; send is guarded by isDestroyed
  - `[low]` `reject` empty or oversized turn text and agent id not checked against the roster (blind, edge) — the only caller is the composer, which refuses blank text; the roster is the user's own project
  - `[low]` `reject` Windows kill and orphaned process group on normal exit (blind, edge) — Windows is a deferred item of the architecture; run-command uses the same kill
  - `[low]` `reject` no live-region announcement, no scroll to newest, error line easy to miss (blind) — one polite region is Story 2.6's and a scroll script is forbidden by the motion sweep
  - `[low]` `reject` pending text sent after unmount, no bridge makes send a no-op (edge) — unreachable: a missing preload stops the app before the shell
  - `[low]` `reject` awaiting-turn delivery refused busy is not re-held (edge) — busy cannot occur there: pending exists only for a persona with no session
  - `[low]` `reject` per-delta array copy and full re-render (blind) — no demonstrated cost at chat rates
  - `[low]` `reject` Preview scaffolding and its guards removed (blind, intent) — the spec's Code Map authorises it and Story 1.6's judgement is closed
  - `[low]` `reject` spec omits implemented error codes, `renderer.length > 40` guard, oversized warning (blind) — fix would edit this build's spec; the guard is a sweep sanity check
  - `[false]` `reject` session:closed is not delivered on window destroy (edge claim) — nobody is there to hear it; entries are closed and the process killed
  - `[note]` `reject` intent-alignment reports reading A (live Electron conversation) against B (acceptance criteria met by fakes) — descriptive; the corpus already shows `/bmad-prd` as the first stdin turn on the same framing, and no real-CLI run was made here

## Design Notes

Why a lazy open on send: the default current persona has never been "activated", yet the composer is never disabled; opening on the first send keeps that true without spawning anything at window load (an activation turn costs model tokens). The pending text is delivered on the first `session:awaiting-turn`.

`persona:said` pieces carry `messageId`; the reducer appends to the last persona entry when the id matches, else starts a new entry. Entry `at` is the first piece's time.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- With a real project, activating a tile starts the persona's greeting in the thread; not verified in this run unless the Electron app is launched.

## Auto Run Result

**Summary:** Opening a persona's tile now starts one long-lived `claude` stream-json session for it; the persona's main-thread words arrive as `persona:said`, render as their own turns, and the composer sends further turns into the same session. A message typed for a persona with no session opens it and is sent when the activation turn ends.

**Files changed:**
- `src/main/sources/session/session-process.ts` -- argv constant, first-turn framing, line splitter, spawn and kill group.
- `src/main/fold/turn-end.ts` -- recognises the `result` row that ends a turn.
- `src/main/session-bridge.ts`, `src/main/index.ts` -- per-window sessions, serialised turns, folding, `session:event` push.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- `openSession`, `sendTurn`, `onSessionEvent`.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts`, `transcript.tsx`; `shell/shell.tsx`; `app.tsx` -- conversation state, hook, `Turns`, shell slots, mounting (the 1.7 preview scaffolding is retired).
- Tests: per-module unit tests, `src/renderer/ui/app.test.tsx`, `tests/session-contract.test.ts`, and updated bridge, preflight, shell, outputs, document-window, persona and conversation contract tests.
- `_bmad/implementation-artifacts/epic-2-context.md` -- recompiled after DESIGN.md changed.

**Review:** 33 findings across four layers. Patches applied: 2 (both low). Deferred: 2 (see frontmatter). Rejected: 12 groups, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high, no medium patched).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (1704 unit, 55 watcher) and `npm run build` exit 0 after the patches.

**Residual risks:** no real `claude` run and no Electron launch: spawn and framing are tested against fakes and a throwaway fake `claude`, and the first-turn framing is evidenced only by the recorded corpus; a message typed during the greeting is refused (Story 2.5); the lexical path-containment deferral from 2.2 is still open for real sessions.
