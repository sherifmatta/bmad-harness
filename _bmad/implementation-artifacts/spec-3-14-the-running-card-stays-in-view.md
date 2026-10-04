---
title: 'The running card stays in view'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: '582c472fa9f2ba7d56a5ad58f1d52182947f946e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad/planning-artifacts/sprint-change-proposal-2026-10-03-beat-judgement.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The run card sits in time order in the thread, so while the persona talks about the document the card scrolls out of sight above the new turns; the person watching the run cannot watch the document (FR31, UX-DR19; found in the Story 3.1 live judgement).

**Approach:** While the viewed persona has a run in flight, its card is drawn in a slot at the top of the chat column, above the thread's scroll region, and not in the thread. On the run's terminal event the same React commit removes the slot and draws the card at its time-ordered place, so it is one frame with no animation. Renderer only.

## Boundaries & Constraints

**Always:**
- Pinned means: the viewed persona (the shell's resolved current persona) has an entry with `kind: 'run'`, `status: 'running'` and `agentId` equal to it. Only one card is pinned: if several sessions of that persona have a run in flight, the one with the greatest `at` (ties: the later in the entries array); the others stay in place.
- The pinned slot is the first child of `.chat` (before the orphan headers and the persona header), so the card is first in the chat column's DOM and tab order. The card is the existing `RunCard`, head and body, unchanged, with its `--card-body-max` cap; the slot adds width alignment to `--thread-max` and nothing else.
- Un-pinning is a render, not a scroll: no `scrollTop`, `scrollTo`, `scrollBy`, `scrollIntoView`, `.animate(`, `scroll-behavior`, `transition`, `animation` or `z-index` is added. The thread's own native scroll anchoring is what keeps it from jumping.
- Pin and unpin take no focus (no `.focus(`, `autoFocus`, `tabIndex`), the slot is not a live region (no `aria-live`, `role="status|alert|log"`), and the slot is no `position` or motion rule, so reduced motion changes nothing but position.
- A card of another persona, an orphan's, one without an `agentId`, and every terminal card is drawn in the thread in time order, as today.
- Every dimension in CSS comes from a token in `src/renderer/design/tokens.css`.

**Never:**
- No "jump to card" control, badge, toast or label, and no stop control (3.5/3.7), collapsed line (3.5), section foot (3.3) or any change to what a card shows.
- No change to `src/main/**`, `src/shared/**`, `src/preload/**`, the card projection, the prose store, or any planning artifact. The thread stays unfiltered by persona (not this story's).
- No change to `RunCard`'s own markup, status words or `aria-busy` rule.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Viewed run in flight | current = pm; pm card `running` | one `.run-card` in the pinned slot, none in the thread; slot is `.chat`'s first child | N/A |
| Terminal event | that card becomes `finished`, `stopped` or `failed` | slot gone and card in the thread at its `at` position in the same commit | N/A |
| Other persona viewed | pm run in flight, current = architect | no slot; pm's card in the thread | N/A |
| Persona switch | current moves pm to architect (or back) during pm's run | slot disappears (appears) with the switch; the card is drawn once either way | N/A |
| Two runs of one persona | two running cards for the viewed agent | newest by `at` pinned, the other in the thread | N/A |
| No agent id | running card with no `agentId` | never pinned | N/A |
| Reload mid-run | card hydrated `running` for the viewed persona | pinned, as above | N/A |
| Plain chat turn | no run entry | no slot | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/shell/shell.tsx:162-183` -- `.chat` holds orphan headers, `ChatHeader`, `.scroll > .thread`, then `composer`; `current` is resolved at render (:133-135). Add a `pinned?: (agent: AgentView) => ReactNode` render prop, called with `current` and rendered in `<div className="pinned">` as `.chat`'s first child when it returns non-null. `src/renderer/ui/shell/shell.css:200-218` -- `.chat`, `.scroll`, `.thread`: add `.pinned`.
- `src/renderer/ui/chat/transcript.tsx:46-106` -- `Turns` draws each `run` entry as `RunCard`; add optional `pinnedRunId` so that entry returns null. Add and export `pinnedRun(entries, agentId): RunCardEntry | null` here or in `chat/run-status.ts` (the rule above).
- `src/renderer/ui/app.tsx:45,135,232` -- `currentId` state; `closeSession` already re-derives the viewed agent with `currentAgent(displayOrder(groupAgents(...)), currentId)` (`team/tile-groups.ts`). Derive `viewed` the same way, compute `pinnedRun(conversation.entries, viewed?.id)`, pass `pinned` to `Shell` and `pinnedRunId` to `Turns`; `conversation.prose` feeds the card.
- `src/renderer/ui/chat/run-card.tsx` -- `RunCard`, read-only: no tab stop, no focus, `aria-busy` while running. `ProseText` repaints from the prose store in a layout effect, so the remount across slots keeps the text; the body's `column-reverse` keeps it at the newest text.
- `src/renderer/design/tokens.css:174-182,335,499-516` -- `--thread-max`, `--thread-padding:16px 16px 26px`, `--card-body-max`, `--card-margin`; add `--pinned-padding` beside them with a comment. `tests/literal-guard.ts` bans literals in any other stylesheet; `tests/negative-surface.test.ts:500-575` bans scroll APIs, extra animation selectors, and z-index outside `tokens.css`/`doc-window.css`; `tests/accessibility.test.ts:546-590` bans `announce`, `aria-live`, `.focus(`, `tabIndex` in `run-card.tsx`.
- Test patterns: `src/renderer/ui/app.test.tsx:~887-957` mounts `App` against a fake `window.harness` and pushes `run:started`, `doc:prose`, `run:finished`; `chat/transcript.test.tsx`, `shell/shell.test.tsx` (static markup); `chat/run-card.dom.test.tsx` (jsdom, `mount`/`act` from `ui/testing/render-hook.ts`).

## Tasks & Acceptance

**Execution:**
- `src/renderer/design/tokens.css` -- add `--pinned-padding` (top and sides of the pinned slot, no bottom: the card's own margin is the gap) -- the slot's only dimension
- `src/renderer/ui/chat/transcript.tsx` -- `pinnedRun` selector; `Turns` takes `pinnedRunId` and skips that entry -- the rule and the thread side
- `src/renderer/ui/shell/shell.tsx`, `shell.css` -- `pinned` render prop and the `.pinned` slot (first child of `.chat`, `flex: 0 0 auto`, `max-width: var(--thread-max)`, centred, `--pinned-padding`) -- the slot
- `src/renderer/ui/app.tsx` -- derive the viewed persona, the pinned entry, wire both props -- the wiring
- `src/renderer/ui/chat/transcript.test.tsx`, `shell/shell.test.tsx`, `app.test.tsx`, `tests/accessibility.test.ts`, `tests/negative-surface.test.ts` -- one test per matrix row (App-level: pin on `run:started`, unpin on `run:finished` with the card in the thread at its time position and exactly one `.run-card` at each step, persona switch, other persona, two runs); the slot is `.chat`'s first child and holds no `tabindex`, `aria-live` or role status; the pinned slot's text and `aria-busy` match the in-thread card's; no `jump`/`badge`/`toast` words or controls near the slot, and no new `z-index`, scroll API or animation -- the matrix and the negative surface
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given the viewed persona has a run in flight, then its card (head and body, body capped as before) is at the top of the chat column, outside the scrolling thread, and the thread's turns scroll beneath it.
- Given the run's terminal event, then the card is in the thread in time order from the same render, no animation, and no scroll code runs.
- Given a card of a persona that is not viewed, then it is not pinned.
- Given keyboard and assistive-technology use, then the pinned card precedes every other control in the chat column, takes no focus when it pins or unpins, is not a live region, and nothing but position changes under reduced motion.
- Given the negative surface, then no jump-to-card control, badge or toast exists.
- Given the full suite, lint, typecheck and build, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass
- verdicts: 26 findings — high 0, medium 0, low 20, false 6, maybe-false 0 (six `low` patched, all test gaps; fourteen `low` rejected; six `false` rejected)
- findings:
  - `[low]` `[reject]` Blind: the spec and the diff disagree on the slot's dimensions (`--pinned-width: 100%` is not in the spec) — a centred flex item with auto margins shrinks to its content, and the literal guard bans a bare `100%` in `shell.css`, so the token is needed; the fix is to edit this build's spec.
  - `[low]` `[reject]` Blind: `--pinned-padding` copies `--thread-padding`'s numbers rather than deriving them — every card token is a literal in `tokens.css`; a derived padding is new structure for a drift not shown.
  - `[low]` `[reject]` Blind: the slot's height is unbounded in a short window — the body keeps its `--card-body-max` cap, so head plus body is bounded; only a foot with many files grows, and a cap adds guards the intent does not give. Residual risk recorded.
  - `[low]` `[reject]` Blind: remounting the card drops state local to `RunCard` — it holds none (path, text and notes come from the prose store and the entry, and the `column-reverse` body keeps the newest text); 3.5 owns any state it adds.
  - `[false]` `[reject]` Blind: `pinned` ignores its `agent` argument, so two derivations of the viewed persona exist — both read the same `snapshot.agents` and `currentId` through the same `currentAgent(displayOrder(groupAgents(...)))`, so they cannot differ; the persona-switch test covers both moving together.
  - `[low]` `[patch]` Blind: the "same words and busy state" test compares the slot card with itself — rewritten to push prose and a note, view John so Mary's running card is in the thread, and compare path, text, `aria-busy` and note count, then switch back.
  - `[low]` `[reject]` Blind: the shell test "is outside the scrolling thread" is trivially true with no children — the App test already asserts the card is outside `.thread`; the shell test's job is slot order.
  - `[low]` `[reject]` Blind: the source-text guards are brittle (fixed offsets, whole-file bans in `shell.tsx`) — they follow the repo's own pattern for these contracts; a later control that needs a role or focus in the shell should fail them and be argued.
  - `[low]` `[patch]` Blind: the "reload mid-run" row and the held text across the remount are untested — added an App test with a `running` run hydrated from `getConversation`, and `doc:prose` plus path and text assertions on the moved card.
  - `[low]` `[reject]` Blind: the render guard lets `false`, `''` or `0` through — the only caller returns an element or `null`; a narrower type adds surface for a case not shown.
  - `[false]` `[reject]` Blind: the spec is left `in-progress` with an empty triage log and no verification record — finalize steps of this run, done after triage.
  - `[false]` `[reject]` Edge: a session closing mid-run leaves a `running` card pinned forever — main's `endRun` runs when the session ends and raises the terminal event (see the 3.13 triage on the same point), so the card reaches a terminal state and unpins.
  - `[low]` `[carried]` `[reject]` Edge: the slot is unbounded with a long foot — same as the third row.
  - `[low]` `[reject]` Edge: with a classic scrollbar the thread is narrower than the slot — macOS overlay scrollbars take no gutter in this Electron app; the fix is new layout for a platform not targeted.
  - `[low]` `[carried]` `[reject]` Edge: the card body's scroll position and local state reset on remount — same as the fourth row.
  - `[low]` `[carried]` `[patch]` Edge: no test hydrates a running card — same cause and fix as the ninth row.
  - `[low]` `[carried]` `[patch]` Edge: the words test compares the slot with itself — same as the sixth row.
  - `[false]` `[carried]` `[reject]` Edge: the shell's `current` and App's `viewed` could differ and draw the card nowhere — same refutation as the fifth row.
  - `[low]` `[patch]` Gap: nothing asserts the held text and path of the card after the slot-to-thread move — the 3.14 terminal-event test and the edited 3.1 test now assert both.
  - `[low]` `[carried]` `[patch]` Gap: the "reload mid-run" row has no test — same as the ninth row.
  - `[low]` `[reject]` Gap (other): the new accessibility and negative-surface tests are source-text assertions, and the CSS layout has no automated check — acknowledged in the spec; jsdom tests cover first-child, no tabindex and focus kept; layout needs a real window (residual risk).
  - `[false]` `[carried]` `[reject]` Gap (other): two independent derivations of the viewed persona — same as the fifth row.
  - `[false]` `[reject]` Intent: the diff holds no commit and no close — those are this step's finalize, done after review.
  - `[low]` `[reject]` Intent: the intent's expectations (stays in view, one-frame move, no jump) live in a running window and the tests exercise DOM and source text — the spec records the live check as a residual risk; scroll anchoring and paint cannot be asserted in jsdom.
  - `[low]` `[reject]` Intent: the spec narrows "pinned" with its own readings (newest run by `at`, slot above the persona header, thread unfiltered) — each is the spec's single stated reading of an ambiguity in the story (several runs of one persona, "first in tab order", "persona's turns"); none contradicts an AC.
  - `[low]` `[reject]` Intent: an earlier story's assertion in `app.test.tsx` was edited — the card now moves from the slot to the thread on `run:finished`, so the element changes by design; the assertions on status, caret and `aria-busy` are kept and path and text are added.

## Design Notes

- **A slot, not `position: sticky`.** A sticky card would keep its time-ordered place and pin only once scrolled past, so a person reading earlier turns would not see it, and the card is not "at the top of the chat column". The slot outside `.scroll` is always at the top; there is no z-index, no scroll code, and the guards that forbid them stay as they are.
- **One commit moves the card.** The same `RunCard` is drawn in the slot while `running` and in the thread after; React remounts it, and `ProseText` repaints the held text in a layout effect before paint, so the swap is one frame. The viewport grows by the slot's height as the card moves into the thread; the thread relies on the browser's scroll anchoring and a person at the tail stays at the tail.
- **Above the persona header.** "First in the chat column's tab order" is read literally: the slot precedes the orphan headers and the persona header, so the first Tab stop in the column is in the card (it has none today, so the header's close control remains the first stop until 3.5 and 3.7 add the stop control). A reordering by CSS `order` would split visual and tab order, so none is used.
- **Thread unfiltered.** The thread shows every persona's turns, as today; "the persona's turns scrolling beneath" holds for the viewed persona's turns and is not a filter.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Run a PRD skill from John in the real app while the persona talks: the card stays at the top, and at the end moves into the thread without a jump. An unattended run cannot do this; record it as a residual risk.

## Auto Run Result

**Summary.** While the viewed persona has a run in flight, its card is drawn in a `.pinned` slot that is the first child of the chat column, above the scrolling thread, and is skipped in the thread. `pinnedRun(entries, agentId)` picks the card: the viewed persona's `running` entry with the greatest `at` (ties to the later entry), never one without an `agentId`. On the terminal event one React commit removes the slot and draws the card at its time-ordered place; no scroll API, animation, z-index, focus move or live region is added, and no jump, badge or toast exists. Another persona's card, an orphan's and every terminal card stay in the thread as before.

**Files changed.** `src/renderer/ui/chat/transcript.tsx` (`pinnedRun`, `pinnedRunId` on `Turns`); `src/renderer/ui/shell/shell.tsx` and `shell.css` (`pinned` render prop, `.pinned` slot); `src/renderer/ui/app.tsx` (viewed persona, pinned entry, wiring); `src/renderer/design/tokens.css` (`--pinned-padding`, `--pinned-width`); tests in `src/renderer/ui/chat/transcript.test.tsx` (new), `shell/shell.test.tsx`, `app.test.tsx`, `tests/accessibility.test.ts`, `tests/negative-surface.test.ts`, `tests/conversation-contract.test.ts` (one regex for the changed props); `sprint-status.yaml` (3.14 `done`) and `epic-3-context.md` (3.14 marked done).

**Review.** 26 findings: patches applied 6 (all low, all test gaps: slot-versus-thread comparison, held text and path after the move, reload mid-run); deferred 0; rejected 20 with reasons in the log (false 6, low 14). Patched by verdict: high 0, medium 0, low 6.

**Follow-up review recommended: false.**

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` unit 132 files, 2848 tests passed, watchers 3 files, 55 tests passed; `npm run build` exit 0. Run before review and again after the patches. Matrix audit: every I/O row has a covering test that ran (`app.test.tsx` Story 3.14 block, `transcript.test.tsx`, `shell.test.tsx`), including the hydrated-run row added in review.

**Residual risks.**
- Not seen in a real window: that the thread does not jump when the card moves, scroll anchoring, the slot's width against the thread, and reduced motion are asserted only by absence of code, since jsdom has no layout. An unattended run cannot make the live check.
- The slot is as tall as the card: head, body (capped) and any "also written" foot, so a run that wrote many files in a very short window squeezes the thread.
- With a classic scrollbar the thread would be narrower than the slot; macOS overlay scrollbars hide it.
- The pinned card has no tab stop yet (the stop control is 3.3/3.5/3.7's), so the first tab stop in the column remains the header's close control until then.
- The thread is not filtered by persona, as before.
