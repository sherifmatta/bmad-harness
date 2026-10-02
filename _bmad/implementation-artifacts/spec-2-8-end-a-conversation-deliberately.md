---
title: 'End a conversation deliberately'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: 'c84afe3d32c45b47e7f3ea573dda3a4cbc708805'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      Nothing launches real Electron, so the topbar click, the `conversation:end` round trip and a relaunch after an end are proven only through fakes.
    evidence: |-
      The reply-after-events ordering the window relies on is an Electron IPC property no test observes, as in 2.7.
    location: >-
      src/main/session-bridge.ts (conversation:end)
    severity: low (unverified)
---

<intent-contract>

## Intent

**Problem:** Story 2.8 (epics.md "End a conversation deliberately", FR15). Since 2.7 a transcript survives reload and relaunch, so nothing can clear it: someone starting fresh on a project has no way to, and `conversation.end(projectId)` is declared in the contract (`src/shared/commands.ts`) but nothing sends or answers it.

**Approach:** One topbar control, the only one in the product that removes a transcript. Activating it sends `conversation.end(projectId)` with the window's project path; main checks the id is this window's project, clears that project's stored transcript, and ends the project's live sessions (each emits `session:closed`). The window then drops its transcript, queue and sessions and starts empty.

## Boundaries & Constraints

**Always:**
- Project-scoped: main refuses an id other than the window's own project path (`conversation/wrong-project`) and acts on no other project's transcript or sessions.
- Order in main: clear the stored transcript first. If the write fails, nothing else happens, the in-memory transcript is untouched, and the reply is the failure envelope (`conversation/end-failed`, `detail` the errno). Only after it succeeds are the window's sessions killed and closed through the existing `finish(..., 'closed')`, so none is reclaimed silently (2.7).
- After a successful end, a `persona:said` or exit from a killed process records nothing and emits nothing (the entry is closed). The cleared file is `{version, projectPath, entries: []}` under `userData`, written atomically by the existing store; nothing is written inside the project root.
- The window clears its entries, queue, live sessions and busy set on the success reply and keeps `personas` as main reported them (the `session:closed` events, folded before the reply, have already settled them). A session open still in flight when it ends is not shown as a failure.
- The control is a native `<button type="button">` reading `End session`, in the topbar after the view switch, always enabled, with the shared focus ring, neutral styling from existing tokens (no accent, badge, count, tooltip, `title`, confirm step or highlight), and rendered only when the shell is given an end handler. Activating it dispatches directly. A success is announced once through the window's one announcer as `conversation · ended` (harness microcopy); no new live region.
- Nothing else removes a transcript: no timer, eviction, persona close, project switch or session end clears one.

**Never:**
- No change to the 14 events or 7 commands or any payload; `conversation.end` is already declared and keeps its declaration. No new event, and no handoff, sysline, card, resume offer, undo, export or confirmation dialog.
- No next-step framing: no recommendation of when to end, no highlighting, badging or placement among the persona or skill controls.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| End with history | transcript, idle live session | file holds `entries: []`; `session:closed` emitted; window empty; reply ok | none |
| End mid-turn | session busy, words streaming | process killed, `session:closed`, later frames ignored, nothing re-recorded | none |
| Next message after | end, then user types to a persona | opens a fresh session; the transcript begins again | none |
| Relaunch after end | file cleared, new process | transcript empty, every persona `idle` | none |
| Wrong project | `projectId` differs from the window's | nothing cleared or closed | `conversation/wrong-project` |
| Non-string id | `undefined`, number | nothing cleared or closed | `conversation/wrong-project` |
| No project | window with no project | nothing | `conversation/no-project` |
| Write fails | `EACCES`/`ENOSPC` or path in project | transcript and sessions untouched | `conversation/end-failed`, window shows the line |
| Open in flight | `session.open` pending at end | spawned process killed, no error shown | none |
| Two projects | two project paths | only the window's own file is cleared | none |

</intent-contract>

## Code Map

- `src/shared/commands.ts:48` -- `conversation.end` already declared, `[projectId: ProjectId]`, ids are the project path (`ids.ts`). No edit.
- `src/main/projections/transcript.ts:28-134` -- `ProjectTranscript`/`TranscriptRegistry`; add `clear(): WriteOutcome` (write `[]` first, then reset state to `EMPTY_TRANSCRIPT`, cancel the pending timer, clear `dirty`; on failure log `persist/write-failed · <errno>` and change nothing).
- `src/main/fold/transcript.ts:18` -- `EMPTY_TRANSCRIPT`, reused by `clear`.
- `src/main/sources/persistence/transcript-file.ts:113` -- `writeTranscript` (refuses a path in the project root, returns the errno). Reused, unchanged.
- `src/main/session-bridge.ts:155-173,252-343` -- `finish`, the `destroyed` handler's kill-then-finish loop (factor out the sessions-close step and share it) and the three handlers; add `CONVERSATION_END_CHANNEL = 'conversation:end'` and its handler beside `conversation:get`. An `Entry` with no `session` yet is closed too: `open()` already kills a process that starts after `entry.closed`.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- add `endConversation(projectId: string): Promise<void>` rejecting with the envelope; the bridge is thirteen methods. Update `tests/bridge-contract.test.ts:137` (and its channel tie), `tests/preflight-contract.test.ts:149`.
- `src/renderer/ui/chat/conversation-state.ts` -- add pure `ended(state)`; `use-conversation.ts` -- `ConversationBridge.endConversation`, `Conversation.end(projectId): Promise<boolean>`, an end counter so a pending open's rejection after an end is ignored, `end` returned from the hook and the `bridgeAvailable` check.
- `src/renderer/ui/shell/topbar.tsx`, `shell.tsx`, new `end-session.tsx`, `shell.css` -- the control and its rule (copy `.view-switch button` tokens; no literal colour, size or font stack). `src/renderer/ui/app.tsx` -- pass `onEndSession`, announce on success.
- Tests to extend: `session-bridge.test.ts`, `transcript` registry test, `conversation-state.test.ts`, `use-conversation.test.ts`, `shell.test.tsx:99` (tab stops) and `negative-surface.test.tsx`, `tests/shell-contract.test.ts:290` (controls list), `tests/negative-surface.test.ts`, `tests/accessibility.test.ts`, `tests/persistence-contract.test.ts`, `tests/layering.test.ts`, `tests/contract.test.ts:126`.

## Tasks & Acceptance

**Execution:**
- `src/main/projections/transcript.ts` (+ test) -- `clear()` per the matrix rows: success, write failure leaves state, pending timer cancelled, a later record starts at `m-0`.
- `src/main/session-bridge.ts` (+ test) -- `conversation:end` handler and shared close step; tests for end with history, mid-turn, wrong project, non-string, no project, write failure, relaunch over the same directory, two projects, and `session:closed` emitted per session.
- `src/preload/*`, `tests/` bridge and preflight contracts -- the thirteenth method and its channel tie.
- `src/renderer/ui/chat/*` (+ tests) -- `ended`, `Conversation.end`, pending-open case, failure line on refusal.
- `src/renderer/ui/shell/*`, `src/renderer/ui/app.tsx` (+ tests) -- the control, its absence without a handler, its place after the switch, the announcement.
- Negative-surface and accessibility tests -- amend the topbar's tab-stop and controls pins to the two view buttons plus this one, and assert no accent, badge, `title`, tooltip or confirm on it.

**Acceptance Criteria:**
- Given the end-session control, when it is activated, then `conversation.end(projectId)` is sent with this window's project and the window's transcript is empty.
- Given a persisted conversation, then ending it is the only way it is cleared: no other source file calls `clear()` or writes an empty transcript.
- Given a conversation ended and the app relaunched, then the transcript is empty and every persona reads `idle`.
- Given the control, then it carries no highlight, badge, count, tooltip or recommendation and is not placed with or worded as a next step.
- Given sessions were live when it ended, then `session:closed` was emitted for each.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 26 findings reported (blind 13, edge 10, verification-gap 2, intent-alignment 1 descriptive report) — high 0, medium 0, low 19, false 4, maybe-false 0, notes 3
- findings:
  - `[note]` `reject` the spec's "Tests to extend" names `tests/layering.test.ts`, `tests/contract.test.ts` and others the diff does not touch (blind) — that list is a spec edit; those suites still pass and needed no change
  - `[false]` `reject` ending in one window leaves another window on the same project showing the old thread, and the spec says "the project's sessions" (blind, edge) — `createProjectWindow` holds one window per project path, so no second window exists
  - `[low]` `reject` `kill()` or `finish()` throwing after the clear leaves a partly closed window (blind, edge) — no throw is shown reachable; 2.7 rejected the same claim for the destroy handler
  - `[low]` `reject` no confirm step, so a misclick or double click ends twice and announces twice (blind, edge) — the criterion says activation dispatches; a confirm step is recorded in Design Notes as a later decision; the announcer throttles to one per 2s
  - `[low]` `reject` a message typed between the click and the reply is wiped by `ended` (blind, edge) — main replies synchronously, so the window is a few milliseconds of IPC
  - `[false]` `reject` the `.then` branch of `ensureSession` has no generation check, so a late open reply re-registers an old session (blind) — an open that finished in main before the end replies before the end's reply, and one that finishes after it finds its entry closed and answers `not-found`, which the `.catch` check drops
  - `[low]` `reject` an open begun between main handling the end and the window folding its reply has a genuine spawn failure swallowed (edge) — the same few-millisecond window; `session:opened` for any session that does start still folds in
  - `[low]` `reject` `end` resolves false with no line when `endConversation` is missing, and true after a disconnect (blind, edge) — a missing method means no conversation method works at all (`bridgeAvailable`), and an announcement after disconnect reaches an unmounted window
  - `[low]` `reject` persona `error` or `note` flags can outlive an end (edge) — those states come from runs and files, which a transcript does not own; no run events exist before Epic 3
  - `[low]` `reject` the "only clear()" pin is a regex that `const t = forProject(p); t.clear()` would evade, and the empty-write check is shape-bound (blind, edge) — the same style as the repo's other contract tests, as 2.7 recorded
  - `[low]` `reject` the vocabulary mixes "End session", "conversation · ended" and persona sessions (blind) — "End session" is the name the UX and architecture documents give the control
  - `[low]` `reject` the identical announcement may be skipped when repeated (blind) — one string per successful end; repetition is the announcer's throttle, not this story's
  - `[false]` `reject` the control lacks the view switch's pressed state (blind) — that state belongs to a toggle's `aria-pressed`; a plain button has none
  - `[low]` `reject` ending with no file writes an empty file, Party Mode is unspecified, the code map's line numbers will rot, tests wait 300ms of real time and `mockClear` leaves an implementation behind (blind) — an empty file is harmless, the control is global by design, line anchors are navigation aids, the live-region drain is real time in the repo's other App tests, and the next bridge test sets its own resolved value
  - `[low]` `patch` no test overlaps a stale open's `finally` with a newer open (verification-gap) — a test holds the first open, ends, sends, rejects the first, sends again and asserts two opens; it fails with the guard reverted
  - `[low]` `patch` no test pins `awaitingSnapshot` being cleared by an end before the snapshot (verification-gap) — a test activates before the snapshot, ends, resolves it and asserts no open; it fails with the reset removed
  - `[note]` `reject` the commit and the sprint status are not in the diff (intent-alignment) — done at finalisation
  - `[note]` `reject` ending also closes the sessions where the story text says only that it clears (intent-alignment) — stated in Design Notes with the epic-context sentence it rests on
  - `[note]` `reject` no real Electron launch (intent-alignment) — recorded in `deferred`


## Design Notes

The story says the control "clears a persisted conversation"; the epic context says sessions are reclaimed "only on persona close or session end". A kept session would still remember what the cleared transcript no longer shows, which defeats starting fresh, so ending the conversation ends its sessions. The end is irreversible and activates directly, as the acceptance criterion words it; a confirm step is a later decision, not drift.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary:** A topbar `End session` control sends `conversation.end(projectId)` with the window's project path. Main refuses any other id, clears that project's stored transcript first, and only if that write succeeds ends the window's live sessions, so `session:closed` is emitted for each. The window then starts empty, announces `conversation · ended` once, and a message typed afterwards opens a fresh session. A relaunch finds an empty transcript and every persona `idle`.

**Files changed:**
- `src/main/projections/transcript.ts` -- `clear()`: file first, in-memory reset only on success.
- `src/main/session-bridge.ts` -- `conversation:end` handler and a shared `closeSessions`, also used when the window is destroyed.
- `src/preload/index.ts`, `src/preload/harness-api.d.ts` -- `endConversation`, the thirteenth bridge method.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` -- `ended`, `Conversation.end`, and an open begun before an end is not shown as a failure.
- `src/renderer/ui/shell/end-session.tsx`, `topbar.tsx`, `shell.tsx`, `shell.css`, `src/renderer/ui/app.tsx` -- the control, its neutral style and the announcement.
- Tests: transcript registry, bridge, conversation state and hook, shell, app, and the bridge, preflight, shell, negative-surface, accessibility, persistence and session contracts.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2-8 marked done.

**Review:** 26 findings. Patches applied: 2 (both low, tests only). Deferred: 1 (see frontmatter). Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (no high, no medium patched).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (1957 tests in 98 files, plus 55 in 3) and `npm run build` exit 0 after the patches.

**Residual risks:** No real Electron launch. The end is irreversible and activates on one click. A message typed in the few milliseconds between the click and the reply is lost with the rest.
