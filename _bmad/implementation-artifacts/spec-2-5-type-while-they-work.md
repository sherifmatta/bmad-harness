---
title: 'Type while they work'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: 'c9b1f328f8e31fdb15b7ba762c914b6d398b97af'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: []
deferred:
  - summary: >-
      A turn that never ends (hung process, error without a result row) leaves the session busy, so every later send queues and is never sent; the only recovery is cancelling each message.
    evidence: |-
      busy clears only on session:awaiting-turn. The stop control belongs to Epic 3; a timeout here would be an invented policy. Carried over from the Story 2.4 deferral.
    location: >-
      src/renderer/ui/chat/conversation-state.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 2.5 (epics.md "Type while they work", FR97-FR99, UX-DR30). A message sent while a turn is in flight is transmitted at once, refused `session/busy` by main, shown as an error, and its user turn stays in the transcript though nothing was delivered (the deferred item from 2.4).

**Approach:** The renderer conversation tracks which sessions have a turn in flight. A send while one is in flight appears at once as a dimmed user turn marked `queued · sends when <Persona> finishes`, with a cancel control; on `session:awaiting-turn` the first queued message for that persona is sent and its entry is un-dimmed in place. This replaces 2.4's single "pending until first session" text with the same queue.

## Boundaries & Constraints

**Always:**
- The composer and its send are never disabled; focus is never moved by a send or by a queued message sending.
- A send always adds its transcript entry in the same state commit as the send; the entry is created queued when the session is busy, absent, or still opening, and plain otherwise.
- A session is busy from `session:opened` (the activation turn) or a successful dispatch until its `session:awaiting-turn`. Queued messages for one persona send FIFO, one per `session:awaiting-turn`.
- Promotion keeps the entry's id, position and `at`: only the queued marker and dim are removed.
- Cancel removes the queued entry and its queue item; nothing is written to main. The marker text is lower case, mono, `·`-separated, no terminal punctuation.
- Dim uses `--opacity-hover` on the avatar and words; no new token, literal or animation.
- Main is unchanged: it already serialises one turn per session and sessions are independent.

**Never:**
- No stop control, persistence, handoff, `@`, status dots, live-region announcement of queued sends, or change to the 14 events / 7 commands.
- A queued message is never sent to a session other than the one open for its persona when it was dispatched; queued messages for a session that closes or fails to open are dropped with their entries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Idle send | session live, not busy, no queue | plain user turn, dispatched, session busy | dispatch failure clears busy and shows the error |
| Busy send | session busy | same-commit queued user turn (dimmed, marker, cancel), nothing dispatched | none |
| No session | no session for persona | queued user turn, session opened; sent when its activation turn ends | open failure drops queued entries, shows error |
| Turn ends | `session:awaiting-turn`, queue non-empty | first item dispatched, its entry un-dimmed in place, session busy again; others stay queued | dispatch failure clears busy, shows error |
| Turn ends, empty queue | `session:awaiting-turn` | session not busy | none |
| Cancel | cancel on a queued entry | entry and queue item removed; later sends unaffected | none |
| Close | `session:closed` | session, busy flag, queued entries for it removed | none |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/conversation-state.ts` -- pure state; replace `pending` with `busy` + per-agent `queue`, add queue helpers, change `session:opened`/`closed`/`awaiting-turn` folds.
- `src/renderer/ui/chat/use-conversation.ts` -- `createConversation` sequence: `send`, `cancel`, open/dispatch handling; hook exposes `cancel`.
- `src/renderer/ui/chat/transcript.tsx` -- `UserEntry.queuedFor?`; `Turns` takes `onCancel`.
- `src/renderer/ui/chat/turn.tsx`, `turn.css` -- `UserTurn` queued modifier, marker and cancel button.
- `src/renderer/ui/app.tsx` -- pass `onCancel`.
- `src/main/session-bridge.ts:252` -- busy refusal; read-only evidence that main enforces serialisation.
- Existing tests: `conversation-state.test.ts`, `use-conversation.test.ts`, `turn.test.tsx`, `app.test.tsx` (the `session/waiting` expectations change).

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/chat/conversation-state.ts` -- queue/busy state and folds -- the queue lives with the transcript so entry and queue change in one commit.
- `src/renderer/ui/chat/use-conversation.ts` -- send/cancel/dispatch -- queue instead of transmit-and-be-refused.
- `src/renderer/ui/chat/transcript.tsx`, `turn.tsx`, `turn.css`, `app.tsx` -- render the queued treatment and cancel.
- Tests for every matrix row, plus a `Turns`/`UserTurn` queued test and an in-place promotion test (same DOM node).

**Acceptance Criteria:**
- Given a turn is in flight, when the user sends, then a dimmed user turn marked `queued · sends when <Persona> finishes` is in the transcript in the same commit and nothing is sent to main.
- Given a queued message, when the user cancels it, then it is removed and never sent.
- Given `session:awaiting-turn`, when a queued message sends, then its entry keeps its id and place, the marker and dim are gone, and focus is untouched.
- Given the composer in any state, then it carries no disabled/readOnly/aria-disabled.
- Given two sessions, when one is busy, then the other accepts a send immediately.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 29 findings — high 0, medium 1, low 10, false 1, maybe-false 0 (blind 11, edge 11, verification-gap 0 plus 3 other, intent-alignment 1 descriptive; the verification-gap "other" findings repeat blind/edge ones)
- findings:
  - `[medium]` `patch` session first met via the open reply (window reload mid-turn) is taken as idle, the send is refused busy, and the entry stays a plain sent turn (blind, edge, verification-gap other) — a `session/busy` refusal now keeps the session busy and puts the message back at the head of the queue, queued again in place, with no error; test rewritten
  - `[low]` `patch` empty roster name makes the marker read `sends when  finishes` (edge) — `||` fallback to the agent id
  - `[low]` `reject` dispatch failure leaves later queued items undrained and the refused turn as a sent-looking entry (blind, edge, verification-gap other) — a refused write means the process is gone and session:closed drops the queue; the sent-looking entry on that path is the 2.4 behaviour
  - `[low]` `reject` open reply after session:closed re-registers a dead session, closed before mapped (edge) — main emits session:opened before the reply and closes only on exit, so the order cannot invert
  - `[low]` `reject` queued text vanishes on drop with no notice (blind) — the spec says dropped with their entries; an open failure shows its error
  - `[low]` `defer` busy has no way out if awaiting-turn never arrives (blind) — see frontmatter
  - `[low]` `reject` cancel button focus lost on unmount, identical aria-label, no focus rule, contrast (blind, edge) — cancel is the user's own click and the shared focus ring applies to every button
  - `[low]` `reject` promoted message sorts above the reply to the earlier turn (blind, edge) — stated in Design Notes; entries are never moved after they are shown
  - `[low]` `reject` stale persona name in the marker, replaced busy flag on a second session:opened, cancel racing promotion (blind, edge) — no demonstrated path: the roster is the user's own and main opens one session per agent
  - `[low]` `reject` readability nits, `at` rebinding, comment rewrap (blind) — cosmetic
  - `[low]` `reject` live-region announcement of queued sends (blind) — excluded by the spec's Never; Story 2.6
  - `[false]` `reject` main untouched so serialisation is unexercised (intent-alignment) — descriptive: the first AC already holds in main (Story 2.4, session/busy) and is covered by its tests
  - `[note]` `reject` sprint-status.yaml and commit not in the diff (intent-alignment) — done at finalisation

## Design Notes

A persona's reply to the in-flight turn can start after the queued entry was typed, so it sorts below it; each entry keeps its time and none moves after it is shown.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary:** A message sent while a persona's turn is in flight, or before their session is up, now appears in the transcript in the same commit as a dimmed user turn marked `queued · sends when <Persona> finishes`, with a cancel control. It is sent on `session:awaiting-turn`, first in first, one per turn, and un-dims in place (same entry, same DOM node). The composer is never disabled and focus is untouched.

**Files changed:**
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` -- `busy` and per-persona `queue` replace the single pending text; send, cancel, drain, busy-refusal requeue.
- `src/renderer/ui/chat/transcript.tsx`, `turn.tsx`, `turn.css`; `src/renderer/ui/app.tsx` -- queued treatment, marker, cancel, wiring.
- Tests: state, hook, turn, a new `turn.dom.test.tsx`, `app.test.tsx`, `tests/conversation-contract.test.ts`.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2-5 marked done.

**Review:** 29 findings. Patches applied: 2 (1 medium, 1 low). Deferred: 1 (see frontmatter). Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (one medium patched, no high).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` (1729 unit, 55 watcher) and `npm run build` exit 0 after the patches.

**Residual risks:** no Electron launch or real `claude` run; behaviour is covered by jsdom tests against fakes. A persona's reply that starts after a message was queued sorts below it. Queued messages are dropped with their entries if their session closes.
