---
title: 'The conversation is still there tomorrow'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: 'a2fdf8defef068bb8518c68096111bda8bcc9662'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      A message typed mid-turn keeps its typed time in the live window but takes the time main wrote it after a reload, so it can move below a persona message that began after it was typed.
    evidence: |-
      `turn.send` carries no timestamp and main stamps `at` when it writes the turn. The live window orders by the typed time. A turn of several messages shows the user's message between them live and after them following a reload. Settling it needs either a typed-time argument on `turn.send` (a contract change) or a decision that send time is the record.
    location: >-
      src/main/session-bridge.ts (turn.send handler)
    severity: low
  - summary: >-
      Nothing launches real Electron, so a window reload, a relaunch against the real `userData` and the ordering of a `conversation:get` reply against pushed events are proven only through fakes.
    evidence: |-
      The reload guarantee depends on the `conversation:get` handler staying synchronous and on Electron delivering a `send` made after the handler returned behind its reply. The first is asserted by the handler's shape, the second is an IPC property no test here observes.
    location: >-
      src/main/session-bridge.ts (conversation:get)
    severity: low (unverified)
---

<intent-contract>

## Intent

**Problem:** Story 2.7 (epics.md "The conversation is still there tomorrow", FR16, FR100, NFR2, NFR3). The transcript, which sessions are live and which are busy exist only in the renderer's memory, so a window reload or a relaunch empties the conversation, and a turn in flight at reload is orphaned.

**Approach:** Main holds the transcript per project (persona turns folded from `persona:said`, user turns recorded when `turn.send` writes), writes it under `userData` keyed by project path, and answers a new read, `getConversation()`, with the transcript, live sessions, busy sessions and non-idle persona states. The renderer hydrates from that read on connect instead of reconstructing. Nothing else is persisted.

## Boundaries & Constraints

**Always:**
- Persisted: the transcript only, as `{version, projectPath, entries}` JSON at `<userData>/conversations/<sha256(projectPath) hex>.json`. Writes are synchronous, atomic (temp file then rename), debounced by an injected scheduler and flushed on window destroy and `app` `before-quit`. A failed write is stderr-logged as `persist/write-failed · <errno>`, never thrown, and retried on the next change.
- Session state is main-held and never written (FR100); persona states are never written, so after a relaunch every persona is `idle`. The install model stays main-held, re-derived from disk each launch, and is not written (NFR2: no second source of truth).
- Entries: `{kind:'persona', id, at, agentId, messageId, text}` and `{kind:'user', id, at, text}`; ids are main-assigned `m-<n>`, continuing past the loaded file's highest. A persona record joins a following `persona:said` of the same `agentId` and `messageId`, text appended unedited. Events without `agentId` are not recorded.
- Hydration: the renderer subscribes first, drops events until the snapshot reply arrives (main applied everything sent before it), then folds the rest. Entries become one transcript; sessions and busy come from the snapshot, so `persona:said` after a reload joins the in-flight message and a send into a busy session queues. Persona entries resolve their `AgentView` from the current roster at render, falling back to the id as name.
- A message typed before the snapshot arrives stays queued and is sent after it, in order.
- A session is reclaimed only through `session:closed` (process exit or window destroyed); no timer or eviction exists.
- The store refuses a file path inside the project root and a file whose `projectPath` differs; an absent, corrupt, wrong-version or foreign file loads as an empty transcript and is left alone until the next write.

**Never:**
- No change to the 14 events, 7 commands or any payload; `getConversation` is a read beside `getRail`, with its own channel and the preload method count updated in the tests that pin it. No `conversation.end`, handoff, sysline, card or resume offer. No write inside the project root, no renderer storage, no persisted queue, session, persona state or install model.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reload mid-turn | session busy, partial text recorded | snapshot holds the partial message, the busy session id and `work` with its `at`; later deltas join it; `session:awaiting-turn` clears busy | none |
| Reload idle | idle session, finished turns | transcript, live session, no busy, no non-idle state | none |
| Relaunch | file written, new process | transcript present; no sessions, busy or persona states; every persona `idle`, no counter | none |
| No usable file | absent, corrupt, wrong version, other project | empty transcript | no throw, file untouched |
| Write fails | `EACCES`/`ENOSPC` | conversation continues | stderr log, next change retries |
| Path in project root | store dir resolves under project | nothing written | stderr log |
| Typed pre-snapshot | `send` before the read resolves | stays queued, sent after hydration | none |
| Reclaim | process exits or window destroyed | `session:closed` emitted, transcript kept | none |
| Two projects | two project paths | two files, no mixing | none |

</intent-contract>

## Code Map

- `src/main/session-bridge.ts:95-295` -- `announce`/`onFrame` already see every `persona:said`; `turn.send` success (`personas.apply turn:started`) is where a user turn is recorded; `Service.bySession` holds `inFlight`; `destroyed` handler flushes. Add `CONVERSATION_GET_CHANNEL = 'conversation:get'`.
- `src/main/persona-states.ts`, `src/main/projections/personas.ts` -- add `snapshot()` returning `shown` entries that are not `idle`.
- `src/main/fold/transcript.ts` (new, pure) -- the join and id rule; modelled on `fold/turn-end.ts`.
- `src/main/sources/persistence/transcript-file.ts` (new) -- path, guard, validate, load, atomic write; `src/main/projections/transcript.ts` (new) -- per-project registry with debounce and flush; `app.getPath('userData')` injected, lazily read.
- `src/main/index.ts:62-70` -- flush on `before-quit`; check `src/main/index.test.ts` mocks.
- `src/shared/conversation.ts` (new, types only), `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- `getConversation()` rejecting with the envelope; update `tests/bridge-contract.test.ts:137`, `tests/preflight-contract.test.ts:149` counts and channel ties.
- `src/renderer/ui/chat/conversation-state.ts:182-346`, `use-conversation.ts:60-203` -- `hydrate`, the pre-snapshot gate, roster resolution; `PersonaEntry` in `transcript.tsx`.
- Tests to extend: `session-bridge.test.ts`, `personas.test.ts`, `conversation-state.test.ts`, `use-conversation.test.ts`, `tests/layering.test.ts`, `tests/session-contract.test.ts`, `tests/outputs-contract.test.ts:143`.

## Tasks & Acceptance

**Execution:**
- `src/shared/conversation.ts`, `src/main/fold/transcript.ts`, `src/main/sources/persistence/transcript-file.ts`, `src/main/projections/transcript.ts` -- types, fold, file I/O and registry, each matrix row tested with a temp `userData` and an injected scheduler.
- `src/main/session-bridge.ts`, `src/main/projections/personas.ts`, `src/main/persona-states.ts`, `src/main/index.ts` -- record turns, answer `conversation:get`, flush on destroy and quit; bridge tests for reload mid-turn, reload idle, relaunch (second registry and bridge over the same directory) and reclaim.
- `src/preload/*`, `src/renderer/ui/chat/*` -- the read, hydration and roster resolution, with a fake-bridge test for in-flight reload, the pre-snapshot send and a queue-then-awaiting-turn after hydrate; a test feeding one event sequence to the main fold and the renderer fold with equal text and messageIds.

**Acceptance Criteria:**
- Given a project with turns, when the window reloads, then every turn is shown again and no session is reopened.
- Given a turn in flight at reload, then its partial text is shown, further words join it, the persona reads `working`, and the turn ends as normal.
- Given the app is quit and relaunched on the project, then the transcript is present, every persona reads `idle` with no elapsed counter, no session is live, and nothing offers to resume.
- Given any run, then the only file written lies under `userData` and none lies under the project root.
- Given a session is reclaimed, then `session:closed` was emitted for it.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 24 findings reported (blind 14, edge 7, verification-gap 1, intent-alignment 2 descriptive), logged as 21 rows where layers repeated a defect — high 0, medium 0, low 17, false 2, notes 2
- findings:
  - `[low]` `reject` concurrent personas split a message across records (blind) — the live window's fold joins only the last entry too, so the stored transcript matches what was shown; changing both is a separate decision
  - `[false]` `reject` several windows on one project disagree (blind) — `createProjectWindow` holds one window per project path, so there is no second window to disagree
  - `[low]` `patch` the connect `.catch` ran `begin()` after a disconnect and so opened sessions on a dead conversation (blind) — guarded with `live`; a test drops the window before a refused read and asserts nothing is opened
  - `[low]` `reject` the catch also covers throws from `hydrate`/`commit`/`transmit`, and events dropped before a failed read are lost (blind) — `begin()` is idempotent, and no throw is shown reachable; the failure line is shown on a failed read
  - `[low]` `defer` a reload can reorder a message typed mid-turn (blind) — see frontmatter
  - `[low]` `reject` every delta copies the entries and each flush rewrites the whole file (blind, edge) — hobby-scale transcripts; the write is throttled to 500ms; an append-only format is a redesign
  - `[low]` `reject` a persistent write failure logs once per interval (blind, edge) — a stderr line per half second only while words stream; a rate limit is more machinery than the failure warrants
  - `[low]` `reject` a corrupt, foreign or wrong-version file is replaced by the first write with no backup (blind) — the spec states this, and the cases are a hand-edited file or a downgrade
  - `[low]` `reject` files are default-permission, without `fsync`, orphan `.tmp` files and no clear-history path (blind, edge) — `userData` is private to the user; clearing is Story 2.8; a stale temp file is overwritten by the next write from the same pid
  - `[low]` `reject` the file key hashes the raw project path (blind, edge) — the same raw-path key as the window index, already in `deferred-work.md`
  - `[low]` `patch` `isInsideProject` treated an in-project directory named `..x` as outside (blind, edge) — now tests for `..` alone or `..` and a separator; a test pins `..cache`
  - `[low]` `reject` persona entries are re-created per render and resolved in two places (blind) — turn components are not memoised, so no work is wasted; the second resolution is what lets a late roster name them
  - `[false]` `reject` the Code Map lists files the diff does not touch, and the payload of `turn:started` gained `at` (blind) — the first is a spec edit; `turn:started` is an internal event whose `at?` already existed, not one of the 14
  - `[low]` `patch` the quit flush is verified only by a handler that exists and does not throw, and nothing shows the bridge and quit share one registry (blind, verification-gap) — `index.test.ts` now captures the bridge's deps and asserts they carry the registry that `before-quit` flushes
  - `[low]` `reject` brittle source-text tests, and `before-quit` not firing on SIGTERM (blind) — the same style as the repo's other contract tests; Electron fires `before-quit` on a normal quit, which is the case in scope
  - `[low]` `reject` run failures and notes are missing after a reload (blind) — no run events exist before Epic 3 and the transcript is persona and user turns by the spec
  - `[low]` `reject` window-destroy `session:closed` reaches nobody, and the test uses a fake that runs listeners before marking the sender destroyed (edge) — no renderer is left to hear it and the projection still hears it; recorded as a residual risk
  - `[low]` `reject` `kill()` throwing in the destroy handler would skip the flush (edge) — no throw is shown reachable
  - `[low]` `reject` two app processes sharing `userData` overwrite each other (edge) — the app is not single-instance by design and no second instance is shown
  - `[note]` `reject` the commit and the closing are not in the diff (intent-alignment) — done at finalisation
  - `[note]` `reject` no real Electron launch (intent-alignment) — recorded in `deferred`


## Design Notes

FR16 lists transcript, session state and install model as "persisted"; this spec persists the transcript only. FR100 forbids carrying session state across a restart, and NFR2 forbids a second model of project state, which a stored install model would be. Both stay main-held. The dead-card criterion holds vacuously: no card exists before Epic 3, and the table that would feed one starts empty each launch. A queued, unsent message is held by the window like composer text and is lost on reload; it has no main-side home until a queue command exists.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary:** Main now holds each project's transcript and writes it under `userData`, keyed by project path. A new read, `getConversation()`, gives a reloaded window the transcript, live sessions, busy sessions and non-idle persona states, so a turn in flight at reload continues in place. After a relaunch the transcript is back and every persona is `idle` with no session. Only the transcript is written; session state and the install model are main-held and not persisted (FR100, NFR2).

**Files changed:**
- `src/shared/conversation.ts` -- types for stored records, the file and the snapshot.
- `src/main/fold/transcript.ts`, `src/main/sources/persistence/transcript-file.ts`, `src/main/projections/transcript.ts` -- the pure fold, the guarded atomic file store and the per-project registry with throttled writes and flush.
- `src/main/session-bridge.ts`, `src/main/projections/personas.ts`, `src/main/index.ts` -- record persona and user turns, answer `conversation:get`, `snapshot()` of persona states, flush on window destroy and quit.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- `getConversation()`.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts`, `transcript-entry.ts`, `transcript.tsx`, `turn.tsx` -- hydration, the pre-snapshot gate, roster resolution, entry types split out.
- Tests: fold, file store, registry, bridge, personas, conversation state and hook, index, and `tests/` contracts (bridge, preflight, layering, negative-surface, session, new persistence contract).
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2-7 marked done.

**Review:** 24 findings. Patches applied: 3 (all low). Deferred: 2 (see frontmatter). Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high, no medium patched).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` exit 0 after the patches.

**Residual risks:** No real Electron launch; reload, relaunch and the reply-before-events ordering are covered through fakes. A queued, unsent message is lost on reload. A user turn is stamped with the time main wrote it. Window-destroy `session:closed` has no listener left to hear it.
