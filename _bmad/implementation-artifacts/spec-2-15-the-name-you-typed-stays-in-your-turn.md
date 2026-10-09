---
title: 'The @name you typed stays in your turn'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '9f274ce5dda526345d598a2ca8d4d61c6eaa6973'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad/implementation-artifacts/spec-chat-look-flat-rows-and-initials.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A handoff typed as `@amelia implement story 5.6` hands off and then sends only `implement story 5.6`, so the user's turn, in the window and in the stored transcript, never holds the `@`. What you typed is not what you see, live or after a reload. `DESIGN.md` also names a `mention` component (deferred, no anatomy defined).

**Approach:** `turn.send` gains an optional third argument, `mention`, the literal `@name` token as typed (AD-25). The persona still receives only `text`. The mention is carried by the window's entry and queue, validated and dropped silently by main, stored on `UserRecord`, and drawn as a non-control chip before the sent text. A handoff with no text after the name sends and shows nothing but the sysline.

## Boundaries & Constraints

**Always:**
- The persona receives only `text`; a test on the bytes written to the session's stdin finds no `@name`. Neither the user's words nor a persona's are parsed or styled: the words still go through the literal `<Words text={text} />` (AD-18, pinned by `tests/negative-surface.test.ts`); the chip is its own element beside it.
- `mention` is optional and additive: `CONTRACT_VERSION` and `TRANSCRIPT_VERSION` stay 1; a transcript file written before the field loads with plain turns.
- Main accepts a mention only if it is `@` followed by one non-whitespace token that equals, case-insensitively, the roster `name` of the persona whose session receives the turn; any other mention is dropped and the turn goes on unchanged, with no refusal. A room (no agent id) never takes one.
- The chip is drawn from stored data only, so a restored turn reads as it did live; a queued handoff keeps its mention in `QueuedMessage` and `UserEntry`, shows the chip while queued and sends it with the turn when the session is free.
- The chip's anatomy is first added to `DESIGN.md` as a named component, replacing the `mention: 'DEFERRED...'` line and the deferred sentence in *Conversation turn*: mono at `{typography.ident}`, `panel-2` ground, 1px `line` border, chip radius, text colour, not a control (no tab stop, no hover, no action). New px or colours live in `tokens.css`/existing tokens (NFR23 literal guard).
- Tests move with the code (the repo rule); extend existing pins, never loosen them.

**Never:** no skill names parsed or chipped (the composer never parses a skill); no change to what a persona receives or says; no project writes; no free display text beside the sent text; no new command, event or channel (the existing `turn:send` channel carries the extra argument); no `TRANSCRIPT_VERSION` or `CONTRACT_VERSION` bump; do not touch menu dispatch, `handoffTarget`'s matching rules, or the room's `sendToRoom`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Handoff with text | composer `@Amelia go`, Amelia resolves, not current | handoff, then `turn.send(session, 'go', '@Amelia')`; turn reads chip `@Amelia` then `go`; persona's stdin holds `go` only | N/A |
| Not a handoff | no match, two matches, current persona, `@` mid-text, `@amelia,` | one `turn.send(session, text)` with no mention; plain turn | N/A |
| Pure handoff | `@amelia` or `@amelia   ` | handoff and sysline `handed to <Name>`; no turn sent or shown | N/A |
| Main drops a bad mention | mention `@bob` to Amelia's session; `@amelia x`; `''`; non-string; room session | turn written and recorded with no mention | no refusal, no error |
| Queued handoff | Amelia's session busy or not up | queued entry shows chip and the queued mark; on drain it is sent with its mention | cancel removes entry and queue item |
| Reload / relaunch | stored record has `mention` | restored turn shows the chip exactly as live | a file with no `mention` loads plain |
| Bad stored field | record with a non-string `mention` | record loads as a plain turn (field ignored) | N/A |

</intent-contract>

## Code Map

- `src/shared/commands.ts:43` -- `'turn.send'` spec `[sessionId, text]`; add `mention?: string`. `src/shared/conversation.ts:32` `UserRecord` gains optional `mention?: string`.
- `src/preload/index.ts:187`, `src/preload/harness-api.d.ts:85` -- `sendTurn(sessionId, text)` becomes `(sessionId, text, mention?)`; pass it on only when defined.
- `src/main/session-bridge.ts:338-375` -- `sendTurn`/`sendNow` take `(event, sessionId, text, mention?)`; `writableSession` stays; after `writeTurn` succeeds call `transcript.recordUserTurn(text, at, room?, mention?)` with the validated mention. Roster name: `ctx.nameOf(sender.id, entry.agentId)` (`agentNameFor`, `src/main/install-model.ts:25`). Room entries have `entry.agentId === undefined`: never a mention. Pure validator belongs beside the bridge or in a small main module with a unit test.
- `src/main/projections/transcript.ts:68,247`, `src/main/fold/transcript.ts:67` -- `recordUserTurn`/`foldUserTurn` gain `mention`; the record carries it only when set.
- `src/main/sources/persistence/transcript-file.ts:73-93` -- `isRecord`: a `mention` that is present must be a string, else the field is dropped (record still loads); `TRANSCRIPT_VERSION` stays 1 (`:37`).
- `src/renderer/ui/chat/transcript-entry.ts:25` `UserEntry.mention?`; `conversation-state.ts:10` `QueuedMessage`, `:82` `Delivery` (add `mention?`), `:153-175` `drain`/`withoutQueued` (keep mention on the entry), `:190-210` `sendMessage(state, agentId, at, text, personaName, mention?)`, `:278-295` `dispatchRefusedBusy` re-queues with mention, `:735-750` snapshot-to-entries mapping carries `mention`.
- `src/renderer/ui/chat/use-conversation.ts:44,84,204,230,444,669` -- `sendTurn` bridge type, `send(agentId, text, mention?)`, both transmit paths pass `delivery.mention`. Room path (`transmitToRoom`, `sendToRoom`) unchanged.
- `src/renderer/ui/app.tsx:354-368` -- composer `onSend`: after `activate`, send `conversation.send(id, target.text, '@' + token)` where the token is the literal typed token (`handoffTarget` should also return it, e.g. `mention`, without changing its matching).  `src/renderer/ui/chat/handoff-target.ts` -- add `mention` to `HandoffTarget` (the `@token` exactly as typed).
- `src/renderer/ui/chat/turn.tsx:140-175` `UserTurn` (+ `turn.css`), `transcript.tsx:210-225` (pass `mention`), `party/party-view.tsx:129` (rooms: none). Chip is a `<span className="turn-mention">` before `<Words>`; no tabindex, no handler.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md:430,988` -- `mention` component anatomy (and `src/renderer/design/tokens.css` if a token is needed; `tests/tokens.test.ts` pins literals).
- Tests to extend: `src/main/session-bridge.test.ts` (stdin bytes, drop rules, room), `tests/session-contract.test.ts`/`tests/contract.test.ts`/`tests/bridge-contract.test.ts` (declared shape), `tests/persistence-contract.test.ts` and transcript-file tests (old file, round trip, bad field), `src/renderer/ui/chat/conversation-state` + `use-conversation.test.ts` (queue carries mention), `turn.test.tsx`/`turn.dom.test.tsx` (chip, not focusable), `src/renderer/ui/app.test.tsx` (handoff sends mention + text; pins that stripped text is what is sent), `tests/negative-surface.test.ts` (the `@` parse still in `handoff-target.ts` only; `turn.tsx` may name `mention` but parses nothing), `chat/negative-surface.test.tsx`.

## Tasks & Acceptance

**Execution:**
- `src/shared/commands.ts`, `src/shared/conversation.ts`, `src/preload/*` -- declare optional `mention` on `turn.send` and `UserRecord`, pass it through preload -- the contract
- `src/main/session-bridge.ts`, `src/main/fold/transcript.ts`, `src/main/projections/transcript.ts`, `src/main/sources/persistence/transcript-file.ts` -- validate, drop silently, record, persist and load additively -- main owns the record
- `src/renderer/ui/chat/handoff-target.ts`, `app.tsx`, `conversation-state.ts`, `use-conversation.ts`, `transcript-entry.ts`, `transcript.tsx` -- carry the typed token through send, queue, delivery and restored entries -- shown as typed
- `src/renderer/ui/chat/turn.tsx`, `turn.css`, `DESIGN.md` (and tokens if needed) -- the chip and its named anatomy -- the visible half
- tests listed in the Code Map -- cover every matrix row, including the stdin bytes with no `@name` -- the audit

**Acceptance Criteria:**
- Given the composer resolves `@<name>` to another persona and text follows, when sent, then it hands off and sends `turn.send(sessionId, text, mention)` with `mention` the literal typed token; a non-handoff sends no `mention`.
- Given main receives a mention that is not `@` plus one token naming the receiving persona (case-insensitive, roster `name`), or a room send, then it drops it silently and the turn goes on unchanged.
- Given the user's turn, then it shows the chip then the sent text, nothing else, via `<Words text={text} />` unparsed; the chip is not focusable and has no action.
- Given a queued handoff, then the chip shows while queued and the mention is sent with the turn.
- Given a window reload or relaunch, then the restored turn reads as it did live, and an old transcript file loads plain with `TRANSCRIPT_VERSION` unchanged.
- Given a handoff with no text after the name, then no turn is sent or shown.
- Given the repo gates, then `npm run lint`, `npm run typecheck` and `npm test` exit zero.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 21 reviewer findings (blind 12, edge-case 7, verification-gap 1 other, intent-alignment 1 descriptive report) grouped by shared claim into 14 rows — high 0, medium 1, low 8, false 3, maybe-false 0, notes 2 (the two are descriptive)
- findings:
  - `[medium]` `patch` chip and words are separate elements with no whitespace, so the turn's text reads `@Ameliago` to copy, selection and screen readers (blind) — a real space node between them and a combined-text test
  - `[low]` `patch` a stored mention is only type-checked: `''`, a non-`@` string or one on a room record loads and draws an empty or odd chip (blind x3, edge x2, verification-gap note on a mislabelled test) — on load keep it only on a non-room user record matching `^@\S+$`; tests for each case, and the mislabelled hydrate test now feeds a non-string
  - `[low]` `patch` a queued handoff dims the words but not the chip (edge) — `.turn-mention` joins the `.turn--queued` dim selector
  - `[low]` `patch` `EXPERIENCE.md` "A mention" still says `[OPEN]`, not built, your turn renders plain (blind, edge) — rewritten as built by Story 2.15
  - `[low]` `reject` no overflow or wrap rule on the chip (blind) — a roster name is one token and the chip shape is now checked on load; a wrap rule is added complexity for no reachable case
  - `[false]` `reject` AD-25 is cited but not recorded (blind) — `ARCHITECTURE-SPINE.md` line 97 and the architecture memlog record AD-25
  - `[false]` `reject` spec status `in-review` disagrees with sprint status `in-progress`, and no gate evidence (blind, edge) — the tracker moves at finalization, and the gate commands ran green (lint, both typechecks, 5010 unit and 64 watcher tests)
  - `[low]` `reject` the epic-2 context rewrite drops open rulings and handoff conditions (blind, edge) — it is the regenerated cache of the compile step, required to carry the 2026-10-09 amendments, and is not a spec of behaviour
  - `[low]` `reject` source-grep pins in `negative-surface.test.ts` are brittle, stdin test could assert the exact lines (blind) — the grep style is the repo's own and the stdin test already finds no `@name`
  - `[false]` `reject` main checks the mention's shape, not that the turn was a handoff (blind) — that is AD-25's rule: a mention naming the receiving persona is honest whatever the route
  - `[low]` `reject` fake bridge's rest-parameter typing hides arity (blind) — test double only; the real signature is typed
  - `[low]` `reject` a roster rename between typing and a queued send drops the chip (edge) — a rare race, and dropping silently is what the spec says; keeping it would show a name main did not check
  - `[note]` `reject` the manual check in the running app is not evidenced; the diff does not show the commit or `done` (intent-alignment) — finalization does both; the manual check is recorded as a residual risk
  - `[note]` `reject` the `epic-2-context.md` change is documentation beyond the story (intent-alignment) — the workflow's context step requires it to be current


## Design Notes

The mention is a structured field, not a display string, so the words shown are always the typed token plus the sent text and cannot diverge from what the persona received (AD-18, AD-25). The renderer builds the token as `'@' + the token the user typed`, case kept; main re-checks it against its own roster, so a forged or stale value cannot put a name the session is not talking to into the record.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: all exit zero
- `git diff --stat` -- expected: `src/` (shared, preload, main, renderer), `tests/`, `DESIGN.md`, this spec, the sprint status

**Manual checks (if no CLI):**
- In the running app, type `@<name> some words` from another persona's thread: the new persona's turn reads the chip then the words; reload and relaunch show the same.

## Auto Run Result

**Summary:** A handoff typed as `@amelia go` now keeps its `@amelia` in your turn. `turn.send` takes an optional `mention` (the typed token, `@` included, case kept); the persona still receives only `go`. Main keeps a mention only if it names the persona that received the turn (case-insensitive, against the roster) and drops any other silently, and never takes one for a room. The mention is stored on the user's record, carried through the queue, and drawn as a non-control chip before the sent text, so a reload or relaunch reads as it did live. Old transcripts load plain and neither `CONTRACT_VERSION` nor `TRANSCRIPT_VERSION` changed.

**Files changed:**
- `src/shared/commands.ts`, `conversation.ts`, `stored-mention.ts` -- `mention` on `turn.send` and `UserRecord`; one shared rule for a stored mention.
- `src/preload/index.ts`, `harness-api.d.ts` -- the extra argument, sent only when present.
- `src/main/mention.ts`, `session-bridge.ts`, `fold/transcript.ts`, `projections/transcript.ts`, `sources/persistence/transcript-file.ts` -- validate and drop silently, record, load additively.
- `src/renderer/ui/chat/handoff-target.ts`, `app.tsx`, `conversation-state.ts`, `use-conversation.ts`, `transcript-entry.ts`, `transcript.tsx`, `turn.tsx`, `turn.css` -- the typed token through send, queue, delivery and restore, and the chip.
- `DESIGN.md` (the `mention` component), `EXPERIENCE.md` (the mention bullet now built), `epic-2-context.md` (recompiled), sprint status, this spec.
- Tests beside each of the above, and `tests/` contract and negative-surface pins.

**Review:** 21 findings from four layers, grouped into 14 rows. Patched 4 (1 medium, 3 low): a real space between chip and words, load-side validation of a stored mention (empty, no `@`, room record), the queued chip dimmed with its words, and `EXPERIENCE.md` brought in line. Deferred: none. Rejected: the other 10, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false. One medium was patched; two or more are required on a first pass.

**Verification:** `npm run lint`, both typechecks and `npm test` exit zero after the patches (207 files, 5025 tests, plus 64 in the watchers project). Every matrix row has a test that ran: the handoff with text, a non-handoff, the pure handoff, main dropping a bad, room or unnamed mention, the queued handoff, reload, and a bad stored field. The test on the persona's stdin finds no `@name`.

**Residual risks:** nobody has looked at the chip in the running app (alignment of the chip with the words, and a typed handoff surviving a reload and relaunch); the spec's manual check is still to do. Main checks that a mention names the receiving persona, not that the turn was a handoff, which is AD-25's rule. A roster rename between typing and a queued send drops the chip.

