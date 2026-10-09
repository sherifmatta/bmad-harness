---
title: 'A turn in flight shows in the thread, from send to the last word'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '1cbeacbe73f696fe2051e0337013305260b5ce6f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
  - '{project-root}/_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After a send, in a 1:1 and in the party room, the thread shows nothing until the first word lands. Persona skills load, think and call tools for 3–9 s first (measured), and in the room nothing anywhere says a turn is in flight. Replies then read as "dumped". Measured on 2026-10-08: ordinary replies already stream to the screen delta by delta (1:1 in the live app, room by replaying a capture through `routeFrame`). A persona's opening greeting arrives from the CLI as one burst (all 82 `text_delta`s in the same instant), so no rendering change can stream it.

**Approach:** Draw the turn in flight in the thread itself, from the moment the turn begins until it ends, using only parts the design already has. It covers the silence before the first word and the silences mid-turn (tool calls), in both 1:1 and the room. Streaming itself is left as it is.

**Decisions (2026-10-08):**
- **Look (1:1): pending turn plus caret.** Before the first word: a pending persona turn at the thread foot with portrait and head. Its body is the accent caret alone, with the `work` state line (`working · 8s`) under it. Once words arrive, the caret sits at the tail of the last paragraph and the state line stays under the words. Both remain until the turn ends.
- **Room, no speaker yet:** a pending row with no portrait and no caret, only the state line, counting from the send. Once a speaker is known, their live turn gets the tail caret and the state line under it, and the cast card lights as today.
- **Opening greeting:** kept whole, as the CLI gives it. The pending turn covers the wait, and nothing paces it out.
- **Caret in chat:** DESIGN.md is amended so the `blink` caret marks chat words being written, as well as document prose.

## Boundaries & Constraints

**Always:** Build from existing visuals only: `StateLine` (amber `work` dot, pulse token, `working · Ns` counter), portrait, turn head, and the caret built from the existing `--caret-*` and `--motion-blink` tokens (hard on/off, and static-on under reduced motion). The indicator exists only while a turn is genuinely in flight: in 1:1 the persona's main-sourced `persona:state` is `work`; in the room, the room session is in `busy`. It is removed when the turn ends, fails or is stopped. Reduced motion: the global rule stops the pulse, and the counter carries liveness. The indicator is `aria-hidden` or `aria-busy` only, and nothing is announced. Queued user messages stay below it, unchanged.

**Never:** No spinner, skeleton, typewriter, simulated pacing of a burst, or stand-in word (the `STAND_IN` sweep: "thinking", "typing", "waiting", "…" and so on; `working` comes only from `STATE_TEXT`). No live region in the thread. No new animation or keyframes. Do not change the main-side fold, `persona:said` delivery, `doc:prose` coalescing, `SESSION_ARGS`, or the rule that persona state is set only in main. Never disable the composer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 1:1 send, before first word | user turn sent; `persona:state` = work | pending turn at the thread foot: portrait, head, caret as the body, `StateLine` work with counter under it | N/A |
| 1:1 words arrive | `persona:said` for the turn | words replace the lone caret, the caret moves to their tail, and the state line stays under them until the turn ends | N/A |
| 1:1 mid-turn tool call | text written, then silence, still work | caret at the tail of the last words, state line under them | N/A |
| 1:1 turn ends | `persona:state` idle/live/error | caret and state line gone, words untouched | turn failure keeps its existing sysline |
| Room send | room in `busy`, no speaker yet | pending row at the room thread's foot, state line with counter since the send | N/A |
| Room speaker known | first attributed `persona:said` | cast card lit as today; state line under the live turn until the turn ends | N/A |
| Session opening (greeting) | `session:opened` → work | same pending turn until the greeting burst lands | N/A |
| Reload mid-turn | snapshot hydrates a working persona or busy room | indicator drawn from hydrated state, no witnessed deltas needed | N/A |

</frozen-after-approval>

## Code Map

- `src/renderer/ui/chat/conversation-state.ts` -- `ConversationState` (`personas` map of `{state, at}` from main, `busy` set, `room`, `entries`), `speakerOf` (:451). Add a pure selector for "turn in flight, since when" per persona and for the room (room since = the room's last user entry `at`, else session open). Do not add state the renderer sets on its own.
- `src/renderer/ui/chat/transcript.tsx` -- `Turns` (:97) draws the 1:1 thread (room entries filtered out). It receives the in-flight info and draws the pending turn or the trailing state line.
- `src/renderer/ui/chat/turn.tsx` -- `PersonaTurn`, `Head`, `Words`. Add the pending variant (no `<button>`; the negative-surface test counts them).
- `src/renderer/ui/status/status-dot.tsx` -- `StateLine({state, since})`. Reuse as is.
- `src/renderer/ui/chat/run-card.css` (:98 `.run-card-caret`) -- the document caret. Lift it into one shared caret class that both the run card and the turn use (and update `dead-card`/`epic-3-audit` selectors if renamed); add no new keyframes.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md` (:516, :876, :959, :966) and `EXPERIENCE.md` (:771) -- caret text is document-only today. Amend for chat.
- `src/renderer/ui/party/party-view.tsx`, `party/party-turn.tsx`, `party/cast-strip.tsx` -- the room thread and cast. Mirror the 1:1 behaviour.
- `src/renderer/ui/app.tsx` (:299 `PartyView`, :361 `Turns`) -- wire the selector output in.
- Tests to extend: `chat/conversation-state.test.ts`, `chat/transcript.test.tsx`, `chat/turn.dom.test.tsx`, `party/party-view*.test.tsx`, `party/epic-4-audit.dom.test.tsx`. Guards that must stay green: `tests/negative-surface.test.ts` (STAND_IN :1346), `chat/negative-surface.test.tsx`, `app.test.tsx` (one live region), `tests/indicator-contract.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/renderer/ui/chat/conversation-state.ts` -- add the in-flight selector, with unit tests over the I/O matrix rows -- one pure source for both views
- [x] `src/renderer/ui/chat/run-card.css` -> shared caret class -- one caret, two users
- [x] `src/renderer/ui/chat/turn.tsx` + `turn.css` -- pending persona turn (caret body), tail caret in the last paragraph, trailing state line -- existing parts only; words still rendered exactly as given
- [x] `src/renderer/ui/chat/transcript.tsx` -- draw it at the 1:1 thread foot, above queued messages -- 1:1 coverage
- [x] `src/renderer/ui/party/party-view.tsx` (+ `party-turn.tsx`) -- the room's pending row and trailing state line -- room coverage
- [x] `src/renderer/ui/app.tsx` -- pass the selector results -- wiring
- [x] DOM tests for both views, plus audits (no stand-in words, no spinner markup, no live region in the thread) -- keep the product's promises
- [x] `DESIGN.md` + `EXPERIENCE.md` -- the caret marks chat words being written as well as document prose. Add the pending turn and the room's pending row to the conversation-turn section -- docs match the product

**Acceptance Criteria:**
- Given a 1:1 with Mary idle, when the user sends, then within one frame the thread foot shows Mary's portrait and `working · 0s`, and the counter ticks each second until her words replace it.
- Given reduced motion, when a turn is in flight, then the dot is static amber, the caret is static-on, and the counter still ticks.
- Given Mary's turn ends, then the caret and the state line are both gone, and her words are byte-identical to what she said.
- Given a room turn in flight, when the window reloads, then the pending row is drawn again from the hydrated state.

## Implementation Notes

- State: pure selectors `personaTurnsInFlight` and `roomTurnInFlight` in `conversation-state.ts`, exposed by `use-conversation.ts` as `turnsInFlight` and `roomInFlight`. No new renderer-set state.
- One shared caret: `chat/caret.tsx` + `caret.css` (`.caret`) replace `.run-card-caret`. Run-card and audit selectors updated.
- 1:1: `PendingTurn`, `PersonaTurn writing`, `TurnState` (`chat/turn-state.tsx`), and `Turns inFlight`, with the pending turn above queued messages. Room: `PartyPending`, `PartyTurn writing`, `PartyView inFlight`.
- Accessibility: indicator parts are `aria-hidden`, never `aria-busy`, because existing guards forbid `aria-busy` outside the run card.
- Known: during a document run, the persona is `work`, so its pending turn can show alongside the run card. Words that land after a queued message sit below it, as they did before.
- Verified: typecheck, lint, `npm test` (unit 4901 / watchers 64) green.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | verification-gap | No test pins the rule that a room sysline ends an earlier speaker in `roomTurnInFlight` | medium | Pre-verified: no test has an earlier room's persona entry behind a new room's open | patch (with 3) |
| 2 | edge-case | Pending turn shown beside the run card during a document run | medium | `run:started` sets persona `work` (fold/persona-state.ts), so `personaTurnsInFlight` includes it and the foot gets a second caret and counter | patch (with 11) |
| 3 | edge-case | Room persona entry not age-checked against `roomOpenedAt` | low | Prevented today only by the room-open sysline between rooms. EXPERIENCE.md states the age check for both views, so the code and the doc disagree | patch (with 1, 8) |
| 4 | edge-case | `roomOpenedAt` undefined lets the counter start from an earlier room's send | low | Needs `roomReady` without `at`, which main supplies on open. Rare, and the fix adds a guard | rejected |
| 5 | edge-case | `since` undefined draws no counter | low | Same rare precondition as 4 | rejected |
| 6 | edge-case | Two sessions of one agent share the aggregate `at` | low | Unverified multi-session path, low impact | rejected |
| 7 | edge-case | `live` vs `writing` disagree when room entries are out of `at` order | low | Room entries arrive in time order. Fix adds a branch | rejected |
| 8 | edge-case | Claim: EXPERIENCE says the room age-checks words; code does not | low | True. Fixed by the same guard as 3 | patch (with 3) |
| 9 | edge-case | Claim: "within one frame" of send | low | The indicator follows main's `turn:started` over IPC (milliseconds), not the click itself | rejected |
| 10 | blind | Refusal sysline mid-turn drops the caret from the speaker | low | The next delta opens a new entry below the sysline (foldEvent's `last` is the sysline), so the gap lasts one delta. The fix adds a branch | rejected |
| 11 | blind | Duplicate indicator during a run | medium | Same as 2 | patch (with 2) |
| 12 | blind | Caret drops to a blank line after a trailing `\n` | low | Cosmetic. It sits where the next character goes, like a text cursor | rejected |
| 13 | blind | Pending turn sits above queued messages, but the words land below them (jump) | medium | `orderEntries` sorts by `at`. A queued message's `at` precedes the first word, so the reply is drawn below it. The frozen intent keeps queued messages below | patch |
| 14 | blind | DESIGN.md says the pending turn "is the same component" | low | `PendingTurn` is a separate keyed node, swapped for `PersonaTurn`. Direct doc correction | patch |
| 15 | blind | Room liveness reads renderer `busy` | false | The frozen Boundaries choose the room's `busy` deliberately | rejected |
| 16 | blind | `inFlight` rebuilt each render | low | `Turns` re-renders per delta anyway. The fix adds memo plumbing | rejected |
| 17 | blind | `speakerOf` and `roomTurnInFlight` duplicate the scan | low | Drift risk only, no named breakage | rejected |
| 18 | blind | Code Map named test files that weren't touched | false | Coverage lives in turn.dom, epic-4-audit and conversation-state tests, which all ran green | rejected |
| 19 | blind | `since` undefined, so no counter under reduced motion | low | Same as 5 | rejected |
| 20 | blind | Spec contradicts itself on aria-hidden vs aria-busy | false | Frozen text allows "aria-hidden or aria-busy", and the code uses aria-hidden | rejected |
| 21 | blind | Long inline FLYING audit case, index reuse | low | Cosmetic test readability | rejected |

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: zero warnings
- `npm test` -- expected: all green, including negative-surface and indicator-contract

**Manual checks (if no CLI):**
- `npm run dev`, open a project, send in 1:1 and in a room: the indicator shows from the send, the words stream under it, and it clears at the turn's end.
