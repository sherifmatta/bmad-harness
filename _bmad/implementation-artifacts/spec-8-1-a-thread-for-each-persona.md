---
title: 'Story 8.1: A thread for each persona'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '0a28f0d3404d37f50cc991cefff29245a62427a9'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A notification click or reveal for another persona's run has no target between Story 8.1 and Story 8.4.
    evidence: |-
      Run cards are now drawn only in their own persona's chat (Story 8.1's filter), so the reveal path finds no card in the viewed chat. Story 8.4 turns the view to the owning persona. Not verified in a running app.
    location: >-
      src/renderer/ui/app.tsx
    severity: medium (unverified)
  - summary: >-
      RunCardLine, isCollapsed and RunCollapse are unreachable in persona chats after Story 8.1.
    evidence: |-
      Another persona's run is no longer drawn in the viewed chat, so the collapsed one-line path and its tests have no caller there. Story 8.4 reworks it.
    location: >-
      src/renderer/ui/chat/transcript.tsx
    severity: low
  - summary: >-
      The 'earlier conversation could not be read' notice belongs to no persona and is drawn in no persona's chat.
    evidence: |-
      foldNoticeAtTop writes an untagged sysline; with Story 8.1 only a tagged sysline is in a persona thread, so the notice is stored but not shown in a persona chat.
    location: >-
      src/main/projections/transcript.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The persona chat draws every non-room, non-skill record of every persona, because a user turn or harness line carries no persona id. Opening John shows what Mary said too.

**Approach:** Tag `UserRecord`, `SyslineRecord` and `harness:said` with an optional `agentId` (set by main, copied by the renderer), declare one "is in a persona's thread" predicate in `src/shared/`, and filter the persona chat, the empty-thread test and the send count by it. Tag untagged stored records once on first read.

## Boundaries & Constraints

**Always:** `agentId` is additive and optional: `CONTRACT_VERSION`, `TranscriptFile` version 1, the 17 events and 8 commands are unchanged; one file per project. Main sets the id at record time from the session recorded for; the renderer copies what an event or record carries and never infers it (its own optimistic user entry carries the persona it was sent to). A record is in a persona's thread iff it has an `agentId`, no `room`, no `skillSession`. A persona's run cards are in its thread by `RunCardEntry.agentId`. Layering holds (renderer imports only `src/shared/`). No record is ever dropped by attribution.

**Never:** a per-persona file; any change to the room, a skill-first session, the Board or what a persona says; a cross-persona view or merged timeline; any unread mark, count or badge; spawning, `session.open`, greeting or activation changes (8.2, 8.3); removal or `close session` changes (8.5); `@name` routing (8.6); the `collapse` and notification rework (8.4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two personas with turns | View John, then Mary | Each chat draws only its own persona turns, user turns, harness lines and run cards, in time order; stored transcript unchanged by switching | n/a |
| New records | Main records a user turn, a harness line or `harness:said` for a persona session | Carries that persona's `agentId`; room and skill-session records carry none | n/a |
| Legacy transcript | Untagged user turns and lines beside tagged persona turns | Once, on first read: user turn → persona of the next non-room persona turn after it (else the one before); line → persona of the nearest one before (else after); room and skill-first records untouched; unplaceable stays stored and undrawn; `conversation.end` clears it | No record dropped; `version` stays 1 |
| Bad stored tag | `agentId` on a user or sysline record that is not a string | Record is not one this build wrote and is left out and counted as damage, as a bad `room` flag is | Existing dropped-entries handling |
| Queued message | A message queued for John, Mary viewed | Queue stays John's; never drains into another session; Mary's thread does not draw it | n/a |
| Persona with turns elsewhere | Mary has turns, John none | John's chat reads as empty (thread introduction shows) | n/a |

</intent-contract>

## Code Map

- `src/shared/conversation.ts:46-84` -- `UserRecord`, `SyslineRecord`: add `agentId?`; `PersonaRecord` unchanged. `src/shared/events.ts:91-100` `HarnessSaid`: add `agentId?`.
- `src/shared/thread.ts` (new) -- the one predicate (structural: `{agentId?, room?, skillSession?}`), `threadAgentOf` and `isInPersonaThread`.
- `src/main/fold/transcript.ts` -- `foldUserTurn`, `foldSysline` gain trailing `agentId?`; add pure `foldAttributeLegacy(entries)`; `foldWithoutSkillSession` is the removal template (reused by 8.5, not here).
- `src/main/projections/transcript.ts:73-86, 268-283` -- `recordUserTurn`/`recordSysline` take `agentId`; `create()` applies the attribution after load, before `foldNoticeAtTop`, only when the loaded file does not carry the `attributed` marker (see transcript-file); it does not mark dirty, the next write persists the tags and the marker. A file that is missing, or that cannot be used whole, has nothing to attribute and counts as attributed.
- `src/main/session-voice.ts:50-74` -- `createVoice` line takes `agentId`, records it and emits it on `harness:said`.
- `src/main/session-registry.ts:536-543` -- `say` adds `agentId` only when `kindOf(entry) === 'persona'`.
- `src/main/session-bridge.ts:459-463` -- persona `recordUserTurn` passes `entry.agentId`. Room (455), skill (458) and registry:516 untouched.
- `src/main/sources/persistence/transcript-file.ts:84-107` -- `isRecord` rejects a non-string `agentId` on user and sysline records. `TranscriptFile` gains an additive optional `attributed?: true` (`src/shared/conversation.ts`, `version` stays 1): `loadTranscript` reports whether the file carried it, and every write by this build stores it, `clear()`'s included.
- `src/renderer/ui/chat/transcript-entry.ts`, `conversation-state.ts:185-212, 559-571, 738-769, 861-878` -- `UserEntry`/`SyslineEntry` gain `agentId?`; `sendMessage` tags a persona's entry (not a skill key's); `withHandoff`, `hydrate`, `harness:said` copy it.
- `src/renderer/ui/chat/transcript.tsx:160-170` -- `Turns` is the one filter: new `personaView?: string`; filters entries by the predicate (persona entries by `agent.id`, runs by `agentId` with no `skillSession`) and `inFlight` to that persona.
- `src/renderer/ui/app.tsx:325, 345-347, 429, 516-518` -- pass `personaView`; `threadEmpty` and `sends` are per viewed persona; `pinnedRun` already per persona.
- `tests/epic-7-audit.dom.test.tsx:766-851` -- "one thread" pins replaced (see Design Notes); other tests that assume a shared persona thread are updated to their persona's chat.

## Tasks & Acceptance

**Execution:**
- `src/shared/conversation.ts`, `src/shared/events.ts`, `src/shared/thread.ts` -- types and predicate -- contract surface, one definition
- `src/main/fold/transcript.ts` + `.test.ts` -- fold params and `foldAttributeLegacy` with unit tests for the I/O matrix (order, fallback, room/skill untouched, idempotent, nothing dropped)
- `src/main/projections/transcript.ts`, `session-voice.ts`, `session-registry.ts`, `session-bridge.ts`, `transcript-file.ts` -- thread tags at record time, attribution on load once (the `attributed` marker), loader check; extend their tests (a file with the marker is never attributed again, so a record left unplaced stays undrawn after a persona later speaks and the set-aside notice is not tagged on relaunch; record carries id, room and skill carry none, `harness:said` carries it, reload keeps tags, bad tag dropped, `conversation.get` returns `agentId`)
- `src/renderer/ui/chat/*` and `app.tsx` -- copy tags, filter in `Turns`, per-persona empty test and send count; unit and DOM tests: two personas each see only their own, switching changes no stored record and lands at the bottom, queue per persona
- `tests/epic-7-audit.dom.test.tsx` -- replace the one-thread pin with one finding a persona's thread holding only its own records; adjust `@name` pin only as far as the thread split forces (routing change is 8.6)

**Acceptance Criteria:**
- Given main records a persona session's user turn or harness line, then the record and the live `harness:said` carry that persona's `agentId`, and a room's or skill session's carry none.
- Given two personas with turns, when the user views one, then the thread draws only that persona's records and run cards, and switching adds, moves or removes no stored record.
- Given a transcript stored before this story, when main first reads it, then untagged records are attributed once by the pure fold, the tags and the `attributed` marker are written by the next write, `version` stays 1, and none is dropped.
- Given a transcript already marked `attributed`, when it is read again after a persona has since spoken, then no record is attributed: one that was unplaced stays in no thread, and the set-aside notice stays in none.
- Given the renderer, then the queue, send count and empty-thread test are per persona.
- Given `conversation.get`, then entries carry `agentId`, `CONTRACT_VERSION` and the pinned event and command counts are unchanged.

## Spec Change Log

### 2026-10-18 — review pass 1 (bad_spec)
- Trigger: `foldAttributeLegacy` ran on every load with no record of having run. A record left unplaced at first read (no persona turn on either side), and the set-aside notice written after attribution, would be tagged to whichever persona next spoke on a later launch, breaking "once", "unplaced stays undrawn" and the notice's "no persona" state.
- Amended: Code Map (projection, transcript-file), Tasks and ACs gain an additive `attributed?: true` file marker that gates the fold.
- Known-bad state avoided: attribution re-running on every read and inventing thread membership for records written later or never placed.
- KEEP: the shared predicate (`src/shared/thread.ts`), `foldAttributeLegacy` itself and its symmetric fallbacks, `threadTagOf` in the registry, `isEntryInPersonaThread`, `Turns` `personaView` with the in-flight filter, per-persona `threadEmpty` and `sends`, and the rewritten tests (Epic 7 audit pins, app.test 8.1 block, the 3.5 run-card tests inverted to "drawn nowhere in another chat"). Re-derive only the marker plumbing and its tests.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 23 findings — high 0, medium 9, low 6, false 8, maybe-false 0 (rows group findings that share a cause; one more row, the set-aside notice, is the build's own note)
- findings:
  - `[medium]` `[bad_spec]` Attribution re-runs on every load: an unplaced record, the set-aside notice and any untagged record are tagged to a later persona (Blind 2, Edge 1-3, 9-10) — verified at `projections/transcript.ts` (fold applied unconditionally in `create()`); amendment: `attributed` file marker gating the fold.
  - `[false]` `[reject]` `personaView` undefined shows every thread (Blind 1) — `Turns` is rendered in persona mode only, where `viewed` is `current`, non-null.
  - `[low]` `[reject]` Predicate not used by `foldAttributeLegacy` (Blind 3) — the fold must read untagged records, which the predicate returns undefined for; main's removal that shares it is Story 8.5.
  - `[low]` `[reject]` Orphan's and agent-less run drawn in no chat, no stop (Blind 4, Edge 12) — an orphan's `close session` ends its session and run; orphans are rare and the fix adds a view.
  - `[medium]` `[defer]` A notification click or reveal for another persona's run has no target between 8.1 and 8.4 (Blind 5, Edge 5, 11) — Story 8.4 is the one that turns the view; unverified in a running app.
  - `[low]` `[defer]` `RunCardLine`/`isCollapsed`/`RunCollapse` and ~10 line tests now unreachable in persona chats (Blind 6) — 8.4 reworks the collapse; deleting it here would pre-empt it.
  - `[false]` `[reject]` Renderer infers a tag in `sendMessage` (Blind 7, Edge 7) — it is the key the user sent to; the room has its own send path (`roomSent`).
  - `[low]` `[reject]` Malformed `agentId` drops the record (Blind 8) — same rule as a malformed `room` flag, and the I/O matrix row says so.
  - `[low]` `[reject]` `personaView` and `skillView` both passable (Blind 9) — no caller does.
  - `[false]` `[reject]` `threadTagOf` changed a condition (Blind 10) — `kindOf` returns `skill` exactly when `entry.skill` is set.
  - `[false]` `[reject]` Other producers of untagged lines (Blind 11) — `recordSysline` has one caller, `createVoice`, fed by `say`.
  - `[false]` `[reject]` Legacy stored run cards lack `agentId` (Edge 4) — `session-run.ts` sets `agentId` from the session on every run; no stored run in any local transcript lacks one.
  - `[false]` `[reject]` `threadEmpty` true outside persona chats (Edge 6) — `Shell` draws the introduction only when a persona is current.
  - `[false]` `[reject]` Persona anchor ignores `skillSession` (Edge 8) — `PersonaRecord` has no such field.
  - `[low]` `[reject]` Other persona's question not visible in the viewed chat (Edge 13) — follows from FR137; tile state is the signal.
  - `[low]` `[defer]` The set-aside notice is drawn in no persona thread (own finding, in Design Notes) — a notice for a damaged file needs a home that is no persona's.
  - `[false]` `[reject]` Intent audit divergences (R1-R5 notes) — descriptive; no defect claimed.

### 2026-10-18 — Review pass (after loopback 1)
- verdicts: 28 findings — high 0, medium 0, low 10, false 12, maybe-false 0 (+6 carried: reveal/notification gap, dead `RunCardLine` code, orphan run unreachable, unplaced-record attribution by position, positional params, viewed-null fallback; rows share their pass-1 verdicts)
- findings:
  - `[low]` `[patch]` `threadTagOf` and its doc inserted between `keepSkillStart` and its doc comment (Blind, Edge, Verification) — comment moved back above `keepSkillStart`.
  - `[low]` `[patch]` `recordUserTurn` doc omits `agentId` — one line added.
  - `[low]` `[patch]` Test `recordUserTurn('skill', 3, ...)` is a plain turn, not a skill one; two loader test titles still say "the file it always was" — renamed `'plain'` and "without the field".
  - `[low]` `[reject]` Empty-string `agentId` accepted (Blind, Edge) — ids come from main; no path writes one.
  - `[low]` `[reject]` Older build drops the marker and a later read re-attributes (Blind, Edge) — downgrade is not a supported path; the marker doc says what it is.
  - `[low]` `[reject]` Marker not written until the next write (Blind, Edge) — the spec states it; a re-read before any write attributes identically.
  - `[low]` `[reject]` Persona branch of `sendTurn` has no `else` for an undefined `agentId` (Edge) — `kindOf` returns `persona` only with an `agentId`.
  - `[low]` `[reject]` `threadTagOf` default branch tags by `agentId`, not an explicit persona case (Edge) — equivalent while `EntryKind` has three members.
  - `[low]` `[reject]` Removed persona's late `harness:said` is held but drawn nowhere (Edge) — same as the orphan row.
  - `[low]` `[reject]` Epic 7 audit rewritten around per-persona threads (Blind) — Story 8.1 retires that pin on purpose.
  - `[false]` `[reject]` FR112 scroll on persona switch has no test (Intent) — `resetKey` is the persona id (`shell.tsx:382`) and the existing Story 5.3 test covers "a persona selected".
  - `[false]` `[reject]` Positional attribution can tag an unanswered turn to the wrong persona (Blind, Edge x3) — the rule is the epic's default, measured on a real transcript; unplaced records are now never re-attributed.
  - `[false]` `[reject]` Damaged-file notice re-attributed on relaunch, unplaced records tagged later (Edge) — fixed by the `attributed` marker; tests assert both.
  - `[false]` `[reject]` Intent audit and verification-gap notes with no defect claimed.

## Design Notes

Attribution rule, measured on the stored transcript of this project (a `session closed · John` line follows John's turn, so "nearest before" is right for lines). The epic says user turn → next persona turn after it; "on neither side" is read symmetrically, so a user turn with none after falls back to the nearest before, and a line with none before to the next after. A trailing unanswered user turn is thus kept in a thread rather than lost.

The set-aside notice (`foldNoticeAtTop`) has no persona and is added after attribution, so it is stored and drawn in no persona thread. Left as is; surface it as deferred work.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: exit 0, zero warnings
- `npm test` -- expected: all suites pass

## Auto Run Result

Status: done

**Summary.** Each persona's chat now draws only its own thread. User turns, harness lines and `harness:said` carry an optional `agentId` set by main; one shared predicate (`src/shared/thread.ts`) says a record is in a persona's thread; `Turns` filters by it; the empty-thread test and the send count are per persona. A stored transcript is attributed once on first read, gated by an additive `TranscriptFile.attributed?: true` marker that every write stores, so unplaced records and the set-aside notice are never tagged later. `CONTRACT_VERSION`, `TranscriptFile` version 1 and the 17 events and 8 commands are unchanged.

**Files changed.**
- `src/shared/conversation.ts`, `events.ts`, `thread.ts` (+ test) -- types, the marker, the predicate.
- `src/main/fold/transcript.ts` -- `agentId` on `foldUserTurn` and `foldSysline`; pure `foldAttributeLegacy`.
- `src/main/projections/transcript.ts`, `sources/persistence/transcript-file.ts` -- tags at record time; attribution on first read behind the marker; bad `agentId` counted as damage; every write stores the marker.
- `src/main/session-voice.ts`, `session-registry.ts`, `session-bridge.ts` -- `agentId` on persona lines and user turns, and on `harness:said`.
- `src/renderer/ui/chat/conversation-state.ts`, `transcript-entry.ts` (+ test), `transcript.tsx`, `src/renderer/ui/app.tsx` -- copy tags, `personaView` filter, per-persona `threadEmpty` and `sends`.
- Tests: new and updated unit, bridge, DOM and contract tests; the Epic 7 audit's one-thread pins replaced by per-persona ones.

**Review.** Pass 1: one bad_spec (attribution re-ran on every load); spec amended, code re-derived. Pass 2: three trivial patches (misplaced doc comment, a doc line, test names), the rest rejected with reasons in the triage log. Deferred: reveal and notification for another persona's run until 8.4; `RunCardLine` unreachable in persona chats until 8.4; the set-aside notice drawn in no persona chat.

**Follow-up review recommended:** false (no high or medium entry was patched on the final pass).

**Verification.** `npm run typecheck` clean; `npm run lint` zero warnings and pins pass; `npm test` 5928 unit and 65 watcher tests pass. Not run in the Electron app.

**Residual risks.** Collapsed run lines and the orphan's run card are drawn in no chat until Stories 8.4 and 8.5; a notification for a background persona's run has no target until 8.4; the real app was not exercised.
