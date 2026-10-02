---
title: 'When a persona stops to ask'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_revision: 'a9024ea3f3c95e6af8d9d3759888098f4bd643fd'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: []
deferred:
  - summary: >-
      Nothing launches real Electron with the real claude CLI, so the parser is proven only on hand-written persona text and the block only through a mocked bridge.
    evidence: |-
      decision.test.ts feeds strings the matrix names; app.test.tsx mounts App against a fake bridge with pushed events. No recorded persona turn in fixtures/runs ends in a lettered or numbered list, so how real BMad personas format a question is unobserved.
    location: >-
      src/renderer/ui/chat/decision.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Story 2.10 (epics.md "When a persona stops to ask", FR105, UX-DR22). A persona that stops to ask a lettered or numbered question leaves the user to retype an answer. Headless `claude -p` has no structured ask frame (probed on 2.1.274: no `AskUserQuestion` tool, `permission_denials: []`), so the question is only ever the persona's prose.

**Approach:** The human decided the harness reads the options out of that prose. A pure renderer function finds a trailing lettered or numbered option list in a persona turn's own text; the transcript draws a decision block inside that turn, and activating an option sends its text as the user's turn. The block is derived, not stored: it exists only while that turn is the last entry and its persona can take a turn, so the user's turn removes it, leaving no residue. The persona's own words stay exactly as written.

## Boundaries & Constraints

**Always:**
- Decision of record: the persona's text is parsed (no marker, no injection, no tool). Options are lines of the text that start with `A.`, `A)`, `(A)` or `1.`, `1)`, `(1)`; a continuation line is one indented under an option. A run is two or more consecutive options in order from `A` (or `1`), at the end of the turn (only blank lines after it). The title is the last non-blank line above the run and must not itself be an option; no title, no block. A turn with more than one run uses the last. Option text is what follows the marker, trimmed, continuation lines joined by one space; the key badge letter is the option's position (`A`, `B`, `C`…), not the persona's marker. Options keep the persona's order.
- The block renders inside that `PersonaTurn`'s body after its words, only for the transcript's last entry when it is a persona turn whose persona has a live session with no turn in flight. After relaunch, mid-turn, or once any later entry exists (a user turn, queued or sent, or a sysline) it is absent.
- Each option is a native `<button type="button">`, its own tab stop, taking the shared `:focus-visible` ring, and activated by click or `Enter`/`Space` with no key-event code. Activating one calls the conversation's `send(agentId, optionText)`, exactly as a composer message to that persona; the user turn it appends removes the block in the same render. Focus then moves to that persona's composer, since the activated button is gone.
- The block is a `role="group"` named by its title. Title is React text in 12.5px/600 `text-strong`; options at 11.5px, line-height `--lh-tight`; `--panel-2` ground, `--r` radius, 1px `--line`, padding `9px 11px` as a token, options stacked at `--space-sm`; the key badge is the block's single accent use (`label` mono, `--accent` on `--accent-bg`, 1px `--accent-border`, `--radius-chip`). Tokens only.

**Never:**
- No chosen, selected, disabled, hover-lift, default, recommended or sorted state; no `aria-disabled`, `aria-pressed`, `aria-selected`; no sorting or reordering; no mark on an option for a lean (a lean is the persona's own words inside that option's text).
- The persona's text is never edited, hidden, trimmed of its list or split: `Words` renders it unchanged. No new event, command, bridge method, persisted field, transcript record kind or contract change; nothing persisted about the block.
- No skill-name parsing, no sound, no entrance animation, no new live region, no key handler.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lettered | last turn ends `Which one?\n\nA. Postgres\nB. SQLite`, session idle | block titled `Which one?` with A `Postgres`, B `SQLite` inside the turn | none |
| Numbered | `1) x` / `2) y` | same, keys A, B | none |
| Answer | click or Enter/Space on B | user turn `SQLite` sent as typed; block gone; focus in composer | none |
| Wrapped | `A. long\n   more text` | option text `long more text` | none |
| Lean | `A. Postgres (I would pick this)` | text kept whole, no extra styling | none |
| Single option | one `A.` line | no block | none |
| Not at the end | list, then a closing paragraph | no block | none |
| Out of order | `B.`/`C.` or `2.`/`3.` | no block | none |
| No title | text starts with the list | no block | none |
| Mid-turn | persona's turn still in flight | no block | none |
| Later entry | user turn, queued message or sysline after it | no block | none |
| After relaunch | no live session | no block | none |
| Free-text reply | user types instead | block gone through the same rule | none |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/decision.ts` (new) -- pure `decisionOf(text): Decision | null`, `Decision = {title, options: string[]}`; no I/O, imports nothing.
- `src/renderer/ui/chat/decision-block.tsx` + `decision-block.css` (new) -- the block; options are `<button>`s; styled by tokens (see `sysline.css`, `composer.css` for the style of token use and comments).
- `src/renderer/ui/chat/turn.tsx:55-72` -- `PersonaTurn` gains optional `decision` and `onChoose`, rendering the block after `<Words>` in `.turn-body`.
- `src/renderer/ui/chat/transcript.tsx:44-78` -- `Turns` gets `canAnswer?(agentId)` and `onChoose?(agentId, text)`; computes the decision only for the last ordered entry.
- `src/renderer/ui/chat/conversation-state.ts` -- add pure `canAnswer(state, agentId)`: a session is live and not in `state.busy`.
- `src/renderer/ui/chat/use-conversation.ts:197-353` -- expose `canAnswer` from state.
- `src/renderer/ui/app.tsx:110-160` -- pass `canAnswer`/`onChoose` to `Turns`; `onChoose` calls `conversation.send` and `setComposerFocusId` so the composer takes focus. `composer.tsx:52-73` focuses on `focusOnMount` only: add a focus-request path that also works while mounted (a counter prop), no key code.
- `src/renderer/design/tokens.css:409-421` -- add `--decision-padding: 9px 11px` with a source comment; `tests/tokens.test.ts:1056` shows how a component's token is tied to DESIGN.md.
- Tests to add or extend: `decision.test.ts` (matrix), `decision-block` and `turn` tests (`turn.test.tsx`, `turn.dom.test.tsx` style), `transcript` last-entry rule, `conversation-state.test.ts`, `use-conversation.test.ts`, `app` test for answer-and-focus, `tests/negative-surface.test.ts` (:147 key handlers unchanged, no recommended/disabled/chosen markup, no `aria-pressed`), `tests/tokens.test.ts`, `tests/accessibility.test.ts` (one live region, buttons are tab stops).

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/chat/decision.ts` (+ test) -- the parser over every matrix row -- one reading of the human's decision, kept pure.
- `src/renderer/ui/chat/decision-block.{tsx,css}`, `turn.tsx`, `transcript.tsx`, `src/renderer/design/tokens.css` (+ tests) -- the block inside the turn, token-only styling, last-entry rule.
- `src/renderer/ui/chat/{conversation-state,use-conversation,composer}.ts(x)`, `src/renderer/ui/app.tsx` (+ tests) -- `canAnswer`, send on activation, focus to composer.
- `tests/negative-surface.test.ts`, `tests/tokens.test.ts`, `tests/accessibility.test.ts` -- assert the Never list on the block's own surface.

**Acceptance Criteria:**
- Given a persona's last turn ends in a titled lettered or numbered list and its session is idle, then a block holding the title and each option renders inside that turn; given any other turn, it is absent.
- Given an option, then it is its own button and tab stop, activated by click or `Enter`/`Space`.
- Given an option is activated, then its text is sent as the user's turn and the whole block is gone, with no chosen state and no residue beyond the two turns.
- Given the block, then no option is reordered, marked recommended, selected, disabled or sorted, and the persona's own text is unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-01 — Review pass
- verdicts: 31 findings — high 0, medium 1, low 20, false 3, maybe-false 0, notes 7 (descriptive intent-alignment report)
- findings:
  - `[low]` `reject` bold, bulleted or lowercase markers (`**A.**`, `- A.`, `a)`) give no block (blind, edge) — the human approved exactly the `A.`/`A)`/`(A)`/`1.`/`1)`/`(1)` shapes; widening them is unrequested and recorded under residual risks and `deferred`
  - `[low]` `reject` a title carrying `**` or a trailing colon renders raw (blind, edge) — the persona's turn above renders the same line as plain text too, since nothing in the product renders markdown in a turn
  - `[low]` `patch` the "line above the run is an option" assertion passes on `null?.title` (blind, verification-gap) — now `toBeNull()`
  - `[low]` `reject` option buttons are about 16px tall (blind) — DESIGN.md fixes the block padding and stack gap and no target size; a denser block is the design
  - `[low]` `reject` the A/B badge disagrees with the persona's own `1.`/`2.` (blind) — the spec fixes the badge as the option's position
  - `[low]` `reject` only the option text is sent, not its label (blind) — FR105 says the option is sent as the user's turn
  - `[low]` `reject` another entry removes a still-waiting persona's options for good (blind) — the matrix's "Later entry" row settles it, and the user can type the answer
  - `[low]` `reject` `answer` moves current and focus though the send may be refused or queued (blind, edge) — the block shows only for an idle live session and `send` queues or retries the open as for any message
  - `[false]` `reject` a reload with a live idle session shows the block again (blind) — intended: the session is live and the question is still the last turn; only a relaunch, which has no session, hides it
  - `[low]` `reject` housekeeping: a long comment, a stray blank line, `created` date (blind, verification-gap, intent-alignment) — wrapped, removed and corrected in the patch
  - `[low]` `reject` empty logs while `in-review` (blind) — filled by this entry
  - `[low]` `reject` stale options reappear after a persona's session is re-opened with the old question still last (edge, blind) — a session closes only on persona close or conversation end; the end clears the transcript, and no persona-close control exists yet
  - `[low]` `reject` an indented closing note after the last option is merged into that option (edge) — indistinguishable from a wrapped option line, and the matrix's "closing paragraph" row is a column-0 paragraph
  - `[low]` `reject` a `---` or code fence as the title (edge) — contrived; the title is the persona's own line
  - `[low]` `reject` an option beginning `@Name` sends plain text, where the composer would hand off (edge) — contrived, and an option is the persona's own words to that persona
  - `[low]` `reject` `refocus` stays positive and a remount pulls focus into the composer (edge) — the `@` handoff already works the same way and a tile activation clears it
  - `[low]` `reject` the claim "no block after relaunch" is only the no-session case (edge) — same as the reload row; a live session is the gate
  - `[medium]` `patch` the second answer to the same persona is not verified to return focus to the composer (verification-gap) — added an `App` test that answers twice and asserts focus after the second click
  - `[low]` `reject` `keyOf` for the 27th option is untested (verification-gap) — a 27-option question is not a case anyone meets, and the code is one line
  - `[false]` `reject` the other-findings weak assertion duplicates the patched one — same row as above
  - `[note]` `reject` the spec is `in-review`, no sprint-status entry, no commit (intent-alignment) — done at finalisation
  - `[note]` `reject` no run of the real app or CLI (intent-alignment) — recorded in `deferred`
  - `[note]` `reject` readings R1–R4 of the intent (intent-alignment) — R1 and R2 are implemented; R3 is the `deferred` item
  - `[false]` `reject` the persona-supplied option text is HTML-unsafe — rendered as React text

## Design Notes

A false positive on a trailing numbered list that is not a question is accepted by the human; the block's gate (idle live session, last entry) limits it to the moment a reply is possible. Because the block is a function of the transcript and the session, "removal" needs no state and survives reload with nothing persisted.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all pass
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary:** A persona turn that ends in a titled run of lettered or numbered options now shows a decision block inside that turn. The options come from the persona's own prose, as the human decided, because headless `claude -p` has no structured ask frame. Each option is a button; activating one sends its text as the user's turn, the block goes in the same render, and focus lands in the persona's composer. The block is derived from the transcript and the session, so it needs no state, persists nothing and leaves no residue; the persona's words are untouched.

**Files changed:**
- `src/renderer/ui/chat/decision.ts` -- pure `decisionOf(text)`, the parser.
- `src/renderer/ui/chat/decision-block.tsx`, `decision-block.css` -- the block, tokens only.
- `src/renderer/ui/chat/turn.tsx`, `transcript.tsx` -- the block inside the last persona turn.
- `src/renderer/ui/chat/conversation-state.ts`, `use-conversation.ts` -- `canAnswer`: a live session with no turn in flight.
- `src/renderer/ui/chat/composer.tsx`, `src/renderer/ui/app.tsx` -- `refocus`, and the answer handler.
- `src/renderer/design/tokens.css` -- `--decision-padding`.
- Tests: parser, block, turn, state, hook, composer, App, and the negative-surface, tokens, accessibility and conversation contracts.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2-10 marked done.

**Review:** 31 findings. Patches applied: 2 (1 medium, 1 low). Deferred: 1 (see frontmatter). Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false (one medium patched, no high).

**Verification:** `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` exit 0 on the reviewed tree; rerun after the patch (see the commit). The matrix has a test for every row.

**Residual risks:** The parser accepts only bare `A.`/`A)`/`(A)`/`1.`/`1)`/`(1)` markers, so a persona that writes `**A.**` or bullets gets no block, and a trailing numbered list that is not a question gets one. No real Electron or CLI run. Option buttons are about 16px tall.
