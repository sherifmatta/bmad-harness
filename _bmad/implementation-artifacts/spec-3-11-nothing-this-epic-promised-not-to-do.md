---
title: 'Nothing this epic promised not to do'
type: 'chore'
created: '2026-10-06'
status: 'done'
baseline_revision: 'e96b96b616fc2cc38f8e6587771bbf8bd41a8514'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 3 built the surface where a builder is most tempted to add reassurance (spinner, `of M`, tick-through, fading caret, undo). Each story pinned its own bans by static sweep, but no test mounts the card in every state and reads what it actually draws, and nothing pins that the caret stays drawn when reduced motion turns its animation off. Story 3.11 (UX-DR35, UX-DR38) is the audit.

**Approach:** Add one rendered audit that mounts the real card, its collapsed line, the dead card and the rail row in every state and asserts each of the seven prohibitions on what they draw, and one static block in `tests/negative-surface.test.ts` for what a mount cannot see (the caret's and reduced-motion CSS, spoken words across the card, rail and live region, the contract counts). Product code changes only if an assertion finds a real defect; a failing assertion is fixed in the product, never loosened.

## Boundaries & Constraints

**Always:** States audited: streaming, revising, quiet (running, notes only), born, stopped, failed, finished, dead (a terminal card with no stop, as hydrated after relaunch), the collapsed line, and rail rows annotated `writing · §N <Name>`, `stopped` and `contention`. Mount through the real `createProseStore`, `RunCard`, `RunCardLine` and `OutputRow`; the clock and frames are held by the test. Reduced motion is `matchMedia` stubbed to match `prefers-reduced-motion`, plus the CSS read as text (jsdom applies no media query).

**Never:** No loosened or deleted existing guard. No new command, event, channel or bridge method (still seven, fifteen, twenty-two, seventeen). No product behaviour added to satisfy a test beyond the minimal fix of a real defect. No `matchMedia` read in `run-card.tsx`, `run-card-line.tsx`, `use-now.ts` or `status-dot.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Any state, spinner | each state above | no `<progress`, `<meter`, `progressbar`, spinner/skeleton/shimmer markup, no stand-in word | No error expected |
| Any state, denominator | head, foot, collapsed line, rail annotation | no `of N`, `/ N`, `total`, `%` in text | No error expected |
| Batch commit | 15 names in the foot, one commit | one render, the foot leaves as one removal, no timer pending | No error expected |
| Streaming | a 500-char delta in one frame | one text-node write, never one per character; caret `steps(1)` | No error expected |
| Stopped, failed, finished, dead | terminal card | no caret, no dialog, no button but none (card) | No error expected |
| Rail `stopped` / `contention` | annotated row | one button (open), no resolve/merge/revert/lock/restore/undo word | No error expected |
| Reduced motion | matchMedia reduce, running card | elapsed ticks, caret element present, status string present; CSS: reduced block disables `animation`, caret has no `opacity`, `visibility` or `display` rule so it renders on | No error expected |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/run-card.tsx` -- card: caret drawn only `running && hasText`; elapsed `useNow(1000)`; no state prop (status + prose store + plan); foot `0 words on disk · autosave on` is a specified fact
- `src/renderer/ui/chat/run-card-line.tsx` -- collapsed line; `src/renderer/ui/chat/run-status.ts` -- every state word
- `src/renderer/ui/chat/run-card.css:98-105` -- `.run-card-caret` `animation: var(--motion-blink)`; `src/renderer/design/tokens.css:266,560-570` -- `blink` is `steps(1)`, `@keyframes blink{50%{opacity:0}}`, one global reduced-motion block
- `src/renderer/ui/outputs/output-row.tsx:85` -- annotation slot; `src/shared/section-progress.ts` -- `writing`, `stopped`, `contention` words
- `src/renderer/ui/chat/negative-surface.test.tsx:378-422` -- existing static six-state table (no revising, quiet, dead, line); `run-card.dom.test.tsx` (`drawLive`, `crank`, `card`), `run-card-line.dom.test.tsx:196` (reduced-motion elapsed), `dead-card.dom.test.tsx` -- mount patterns to copy
- `tests/negative-surface.test.ts:1510-1600,1715,1800,1970` -- Story 3.x blocks and helpers (`code`, `offenders`, `sources`); counts regexes at the 3.10 block

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/chat/epic-3-audit.dom.test.tsx` -- mount every state; assert AC1, AC2, AC3, AC4, AC5 and the rendered half of AC7 -- the audit reads what is drawn
- `tests/negative-surface.test.ts` -- add a Story 3.11 block: caret CSS static-on, one global reduced-motion rule, no matchMedia in card code, spoken-word sweep (`undo|revert|restore|merge|lock|resolve`, denominators) over card, rail and live-region words, no badge/sound, the four counts -- the static half
- `_bmad/implementation-artifacts/sprint-status.yaml`, `epic-3-context.md` -- mark 3.11 done at the end

**Acceptance Criteria:**
- Given the card in each of its states, when mounted, then none draws a spinner, skeleton, bar or stand-in sentence, and none shows a denominator.
- Given a batch commit and a streamed delta, when rendered, then the foot leaves in one removal and the text is written once per frame, with no timer or delay.
- Given a stopped, failed, finished or dead card, or a `stopped`/`contention` row, when mounted, then no dialog, no resolve/merge/revert/lock/restore/undo word and no control beyond the specified ones.
- Given reduced motion, then the elapsed counter ticks, the caret is present and renders on, every state string is present, and no animation survives in the CSS.

## Spec Change Log

## Review Triage Log

### 2026-10-06 — Review pass
- verdicts: 31 findings — high 0, medium 1, low 17, false 3, maybe-false 0 (the verification-gap layer reported none; the blind hunter 12, the edge-case hunter 13, the intent auditor 6 readings and divergences)
- findings:
  - `[low]` `[reject]` Blind hunter: spec status `in-review` contradicts the done markers — false, in the sense that `in-review` is this step's own state and Finalize writes `done`; no defect.
  - `[low]` `[patch]` Blind hunter: the `dead` case is detected by a display-name prefix — a `handedNoStop` field now says it.
  - `[medium]` `[patch]` Blind hunter, intent auditor: no state is watched over time, so a late spinner or a still-working sentence would pass — a test now advances ten minutes on every in-flight state and re-reads each prohibition.
  - `[low]` `[patch]` Blind hunter, intent auditor, edge-case hunter: the reduced-motion half of the matrix mounts the same thing as the normal half — each run now asserts the card never asked `matchMedia`, and the titles say what is pinned; the real guarantee stays the CSS read.
  - `[low]` `[patch]` Blind hunter: titles claim more than they assert — retitled.
  - `[low]` `[reject]` Blind hunter: the static bans cover all of the renderer, so a later epic's theme feature would fail an Epic 3 audit — intended: the story says no undo exists anywhere, and an Epic 4 need edits the guard with its reason.
  - `[low]` `[reject]` Blind hunter: the announcement slice depends on indentation — the sweep also asserts the function was found, and the same conventions run in four existing blocks.
  - `[low]` `[patch]` Blind hunter: `ruleBody` can match a descendant selector — anchored on a rule boundary.
  - `[low]` `[reject]` Blind hunter, edge-case hunter: the count regexes depend on formatting and on `CommandSpec` or `EventSpec` — the same regexes the 3.9 and 3.10 blocks use; a format change fails their counts too, and a shared helper is a restructure for no defect.
  - `[low]` `[patch]` Blind hunter, edge-case hunter: the rail rows are hand-built and the contention row names one owner — it now takes `ownerLabel` over two owners; building rows through the real annotator is `tests/contention-replay.test.ts`'s.
  - `[low]` `[reject]` Blind hunter: `spoken()` reads text, `aria-label` and `title` only — the card draws no other attribute that carries words; a wider helper adds complexity for no reachable defect.
  - `[low]` `[patch]` Blind hunter, edge-case hunter: the batch test leaks a root if an assertion fails — wrapped in `try`/`finally`.
  - `[low]` `[reject]` Blind hunter: spec typos and stale line anchors — a finding whose fix edits this build's spec.
  - `[low]` `[patch]` Edge-case hunter: JSX text beside a `{expression}` (`{n} of {m}`) passes the word sweep — the pattern now takes text after `}` and before `{`.
  - `[low]` `[patch]` Edge-case hunter: `undo` and `badge` in camelCase names slip a word-boundary regex — now `[Bb]adge`, `[Ss]nackbar`, `undo` not after a letter, and `Undo`.
  - `[low]` `[patch]` Edge-case hunter: an ancestor rule, or a zero-size or transparent caret, would hide it while the guard stays green — the caret's background, width and height are pinned and no ancestor rule may set `opacity`, `visibility`, `clip` or `transform`.
  - `[low]` `[reject]` Edge-case hunter: contract-count regexes miss camelCase or digit names — same as the count row above.
  - `[low]` `[reject]` Edge-case hunter: a reduced-motion rule in an inline HTML style is not seen — the renderer's only `.html` carries no style, and the existing motion block sweeps it.
  - `[low]` `[patch]` Edge-case hunter: the delta and rail tests run on real timers — the delta test now holds the clock; the rail rows mount nothing that ticks.
  - `[low]` `[reject]` Edge-case hunter: the collapsed line's dot and stop label are not asserted — `run-card-line.dom.test.tsx` pins both.
  - `[false]` `[reject]` Edge-case hunter: terminal-card loop unmounts twice — `Mounted.unmount` is idempotent and nothing throws.
  - `[low]` `[reject]` Edge-case hunter: the spec says "no `display` rule" and the caret has `inline-block` — the deviation is recorded in Residual risks; amending the spec is out of this build.
  - `[low]` `[reject]` Edge-case hunter: the spec says the clock is held in every test — fixed for the delta test; the remainder is a spec wording.
  - `[low]` `[reject]` Intent auditor: nothing runs the real app, so the card's CSS under the real media query is inferred — no Electron harness exists in the repo and an unattended run cannot open one; recorded as a residual risk.
  - `[low]` `[reject]` Intent auditor: states are independent snapshots, not one run driven through its sequence — the replay corpus tests (`terminal-replay`, `completion-replay`) drive whole runs, and the audit reads each state's markup.
  - `[low]` `[reject]` Intent auditor: the foot's "N to write" could be read as a denominator — it is the remaining count 3.3 specified, the head never carries one, and the story forbids `of M`.
  - `[false]` `[reject]` Intent auditor: "commit" sits outside the diff — Finalize's step, run after this triage.
  - `[low]` `[reject]` Intent auditor: the stand-in sentence ban is a word list — the same list the four earlier blocks use; an open vocabulary cannot be enumerated.
  - `[low]` `[reject]` Intent auditor: the dead card is not run through the relaunch hydration — `dead-card.dom.test.tsx` and `tests/relaunch-dead-card.test.ts` do.
  - `[low]` `[reject]` Intent auditor: rows are built from constants, so the test proves constants render — the producers are pinned by the 3.6 and 3.9 blocks.
  - `[low]` `[reject]` Intent auditor: "dead" is a terminal card without `onStop` — the spec's own definition.

## Design Notes

- **Audit, not feature.** The prior stories met their own bans; what was missing was one place that reads what is *drawn* in every state. Findings change the product; the tests are never relaxed.
- **Static-on by construction.** The caret is visible at rest and `blink` only dips to `opacity:0` at 50%; removing the animation leaves it on. The guard pins that no rule can make it off at rest.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

## Auto Run Result

**Summary.** Story 3.11 is an audit and found nothing to fix: no product code changed. A rendered audit now mounts the real card in every state it can draw, its collapsed line, the dead card and the rail's annotated rows, and reads off each prohibition from what they draw. A static block pins what a mount cannot see: the caret is on at rest and `blink` is `steps(1)`, one global reduced-motion rule, no media query read in script, no denominator, spinner or arbitration word in any spoken string, no audio, Dock call, toast or badge, and the contract still at seven commands, fifteen events, twenty-two channels and seventeen bridge methods.

**Files changed.** New: `src/renderer/ui/chat/epic-3-audit.dom.test.tsx` (the rendered half), this spec. Edited: `tests/negative-surface.test.ts` (a Story 3.11 block), `sprint-status.yaml` (3.11 done), `epic-3-context.md` (3.11 done).

**Review.** 31 findings from four layers: high 0, medium 1, low 17 (patched 10, rejected 17 across rows), false 3. Patched in ten entries: time passing on in-flight states (medium), and nine low (the dead case's flag, the reduced-motion doubling's assertion and titles, `ruleBody` anchoring, the contention row's owner label, the batch test's cleanup, JSX text beside an expression in the word sweep, camelCase `undo` and `badge`, the caret's size, ground and ancestors, the delta test's clock). No entry deferred. Rejected with recorded reasons: the repo-wide scope of the bans, count-regex formatting, spec edits, the foot's remaining count, the absence of a real-app check, and the intent auditor's surface observations.

**Follow-up review recommended:** false. One medium patched, no high; the work is tests only.

**Verification performed.** After the patches: `npm run lint` exit 0 with no warnings; `npm run typecheck` exit 0; `npm test` exit 0 (unit 156 files, 3,565 tests; watchers 3 files, 55 tests); `npm run build` exit 0. Mutation checks by the implementer: adding `opacity: 1` to the caret rule, and drawing the caret on terminal cards, each failed the audit and were reverted.

**Residual risks.**
- Nothing was observed in the running app. jsdom applies no CSS, so the caret staying on and the animations stopping under `prefers-reduced-motion` are shown by reading the CSS, not by computed style. Open the app once with the setting on.
- The caret rule carries `display: inline-block` (an empty inline span ignores width and height without it), so the spec's "no `display` rule" is read as "never `none`".
- The stand-in ban is a word list, as in the four earlier blocks.
