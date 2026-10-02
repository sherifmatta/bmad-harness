---
title: 'Nothing this epic promised not to do'
type: 'chore'
created: '2026-10-02'
status: 'done'
baseline_revision: '6b8b3827737d37d16172740c62b4df1faeb1e7d8'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-2-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 2's prohibitions (UX-DR38, Epic 2 surfaces) cannot be seen by using the product: no skill parsing or completion in the composer, no skill-derived chrome on a turn, no refusal-with-handoff, no spinner or stand-in sentence while a session opens, no sound or Dock badge, and a decision block with no recommended style, default, sort order or residue. An audit of the code found all six hold today, but only some are pinned: Story 1.14's sweeps cover the badge, sound and loading words broadly, and Stories 2.9-2.11 pin their own components. Nothing pins the epic's conversational surface as a whole, and the rendered negative test never mounts a composer, a turn or a decision block.

**Approach:** Verify rather than build. Extend the Story 1.14 text-contract suite with an Epic 2 section, and add a rendered test of the assembled chat column (composer, turns, queued message, sysline, decision block, orphan header). Change a source file only if a new sweep finds a real violation.

## Boundaries & Constraints

**Always:**
- Tests follow the repo's conventions: `tests/negative-surface.test.ts` reads sources as text with comments blanked and names the offending file; a rendered test is a `src/**/*.test.tsx` using `renderToStaticMarkup`. Extend the existing helpers (`sources`, `offenders`, `code`); do not fork them.
- A sweep that fails is answered by fixing the surface, never by loosening the pattern or exempting a file.
- The `working` state (pulsing dot, word, ticking counter) and the `queued · sends when <Persona> finishes` mark are Epic 1 and Story 2.5 vocabulary, true statements about a persona turn or the user's own message. They are not stand-ins for a spinner; pin them as the only status copy, so a third cannot slip in.
- `@<name>` matches `AgentView.name` only; leading `/` is not parsed by the harness and the session bridge writes the user's text verbatim (record this, do not change it).

**Never:**
- No change to behaviour, copy, tokens or contract (`src/shared/`, preload), no new event, command or bridge method, no edit to `DESIGN.md`, `EXPERIENCE.md`, `epics.md` or the spec folder.
- Do not weaken or delete an existing pin; widen it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Composer with `@` | `@WS`, `@bmad-agent-pm`, `@<skill code or description>`, `@unknown`, `@<current persona>` | `handoffTarget` returns null; sent as typed with no refusal or hint | test fails naming the input |
| Session opening | first message typed with no live session | transcript holds the user's turn and its queued mark only; no status role, `aria-busy`, progress element or stand-in sentence | test fails naming the string |
| Chat column | full column with a persona turn, queued user turn, sysline, decision, orphan header, composer | no `title=`, `data-*`, `aria-describedby`, tooltip, loading-like or recommendation copy, one live region at most (none here) | test fails naming the string |
| Decision options out of order or with a lean in the persona's words | options C, A, B, one reading "(I lean here)" | rendered in the persona's order, all buttons identical bar key and text; answering removes the block and echoes the option only inside the user's turn | test fails naming the difference |

</intent-contract>

## Code Map

- `tests/negative-surface.test.ts` -- Story 1.14 + 2.9-2.11 sweeps; helpers `sources`, `offenders`, `code`, `RENDERER_CODE`, `MAIN_CODE`, `ALL_CODE`; add a `describe` for Story 2.13 at the end. Existing coverage to widen, not repeat: loading words (`:293`), silent (`:426`), badge/dock (`:248`), decision block (`:794`), composer/parser (`:728`).
- `src/renderer/ui/shell/negative-surface.test.tsx` -- rendered Shell sweep; `Shell` renders no composer, turns or orphans here. Pattern to copy (`shell()`, `LOADING`, `count`).
- `src/renderer/ui/chat/composer.tsx` (never disabled, Enter/Shift+Enter only, hint of two keys), `handoff-target.ts` (the one `@` parser, reads `.name`), `turn.tsx` (`PersonaTurn`, `UserTurn` with queued mark and cancel), `transcript.tsx` (`Turns`: decision only on the last persona entry when `canAnswer`), `decision.ts`, `decision-block.tsx`, `sysline.tsx`, `orphan-header.tsx`, `conversation-state.ts` (`canAnswer`, `orphansOf`, `sendMessage` queued) -- read-only evidence; the surfaces under test.
- `src/renderer/ui/shell/shell.tsx:77-159` -- `Shell` props `composer`, `orphans`, `onCloseOrphan`, `children`; mount the chat column through these.
- `src/renderer/ui/status/persona-state.ts` -- `STATE_TEXT`; the only home of the word `working`.
- `src/main/session-bridge.ts` (`handoffFor`, `turn.send` written verbatim) -- handoff is user-initiated only; read-only.
- Audit findings carried in: no `title=`/`data-*`/`aria-describedby` in renderer code; no opening/pending state in `ConversationState`; sweep gaps are the silent regex (`flashFrame`, `requestUserAttention`, `setProgressBar`, `setOverlayIcon`, `badgeCount`), the decision regex (`autoFocus`, `defaultChecked`, `:first-child`), the loading word list (no `opening|starting|thinking|typing|waiting`), and no sweep for tooltips in `chat/`.

## Tasks & Acceptance

**Execution:**
- `tests/negative-surface.test.ts` -- add `describe("Epic 2's conversational surface asserts the rest of its prohibitions (Story 2.13)")` with sweeps: (1) the `@` parse in exactly one file (`handoff-target.ts`) and nothing under `chat/` reads menus, skills, codes or descriptions, no leading-`/` parse, no listbox/datalist/`aria-autocomplete`/`aria-activedescendant`/`aria-haspopup` in the renderer; (2) no `title=`, `data-*`, `aria-describedby`, tooltip, popover or CSS `attr(` anywhere in renderer code, and `turn.tsx`/`transcript.tsx`/`sysline.tsx`/`decision-block.tsx` import and name no menu entry; (3) no refusal or handoff-offer copy in any source, `handoffTarget` called from `app.tsx` only, and the only `<button` in `turn.tsx`/`transcript.tsx`/`sysline.tsx` is the cancel; (4) no stand-in status copy: a wider word list over string and JSX-text copy, with `working` found only in `persona-state.ts` and `queued ·` only in `turn.tsx`, and no `opening`/`pending` field in `conversation-state.ts`'s `ConversationState`; (5) the silent and badge patterns widened over `src/` including preload and shared; (6) the decision block's regexes widened with `autoFocus`, `defaultChecked`, `.focus(`, `:first-child`, `:nth-`, `:last-child`, `order:`, `-reverse` -- the audit's gaps
- `src/renderer/ui/chat/negative-surface.test.tsx` -- new; render `Shell` with composer, orphan, and `Turns` (persona turn ending in a decision, queued user turn, sysline) and assert the I/O matrix rows: no input but the one textarea, no tooltip/`data-`/loading/recommendation, the opening state as above, decision order and identical option markup, no residue after the user's turn exists, and the `@` inputs through `handoffTarget` including a roster whose menus carry the same words
- any source file under `src/` -- fix only a violation a new sweep finds, with the smallest change that makes it true

**Acceptance Criteria:**
- Given the composer, then it parses no skill names, offers no completion, and `@<name>` resolves only a roster name other than the current persona
- Given a persona turn, then no tooltip, preview, tag or chrome derived from a skill name renders anywhere in the chat column
- Given a persona asked something outside their speciality, then nothing in the harness offers a handoff; the handoff is user-initiated by tile or `@name` only
- Given any Epic 2 state, including a session that is opening, then no spinner, skeleton, progress element or stand-in sentence renders beyond the existing `working` state and queued mark
- Given the whole epic, then no sound, Dock badge, bounce, progress or attention API exists in any source
- Given the decision block, then no option has a recommended style, default selection, focus or sort order, and the block leaves no residue once answered
- Given the repo gates, then `npm run lint`, `npm run typecheck` and `npm test` exit zero

## Spec Change Log

## Review Triage Log

### 2026-10-02 — Review pass
- verdicts: 28 reviewer findings grouped by shared claim into 24 rows — high 0, medium 1, low 17, false 2, maybe-false 0, notes 4 (the four are descriptive or about the tracker)
- findings:
  - `[medium]` `patch` the JSX extractor in `copyOf` skips text beside an `{expression}`, so `<p>Opening {name}</p>` escapes every copy sweep (verification-gap, edge) — extractor blanks `{...}` groups first; a probe-file self-check asserts `Opening` and `loading` are found; widened sweep still passes on the real tree
  - `[low]` `patch` the source `STAND_IN` has the ellipsis inside `\b(?:...)` and no trailing boundary (blind, edge, verification-gap) — ellipsis moved outside the group, trailing `\b` added
  - `[low]` `patch` the "queued" state ran with `canAnswer` false, so "a later entry removes the block" could not fail (blind, verification-gap) — the queued column is now answerable, so only the later entry keeps the block away
  - `[low]` `patch` the button inventory ignored a classless `<button>` and a `role="button"` (edge) — classless buttons now read as `(no class)` and fail the whitelist; `role="button"` banned
  - `[low]` `patch` `BETWEEN` silently dropped `session-process.ts` if moved (edge) — asserted present before use
  - `[low]` `patch` comments over the handoff-copy regex and the `@` table overstated what they pin (blind, verification-gap) — reworded to say the rows are null because no persona bears the name, and the name-collision test is the one that proves menus are not read
  - `[low]` `reject` C, A, B options "rendered in the persona's order" in the spec matrix versus no block rendering (blind, edge, verification-gap, titles) — `decisionOf` requires a run starting at A, so out-of-order markers are not a decision; the test asserts exactly that, and order is proved with A, B, C-keyed unsorted text; the matrix is the read-only intent contract
  - `[low]` `reject` multi-line template literals and a JSX apostrophe escape `copyOf`'s literal matcher (edge) — no such copy exists in the tree; the fix adds a template scanner for a hypothetical
  - `[low]` `reject` a second `@` parser written as a regex literal is not matched (edge) — the `.name` pin in the parser and the single-caller pin also fail for any other parser that resolves a persona
  - `[low]` `reject` no render with a working persona in the column (edge) — Story 1.14's rendered test mounts all five states; here `working` is pinned by source to `persona-state.ts`
  - `[low]` `reject` extra sound routes (asset files, `\u0007`, `<embed>`, `vibrate`) (edge) — audio files and `speechSynthesis` are already swept by Story 1.14; the others are not APIs this stack reaches
  - `[low]` `reject` the preload and shared word ban is blunt (verification-gap other, blind) — intentional: those files declare a contract and a new word fails loudly with the file named
  - `[low]` `reject` pattern-level negative lookaheads contradict "no exemptions" (blind) — each is an exact-set pin (keyframe names, three known identifiers), the stricter form; the hard-coded `.description` list is likewise exact
  - `[low]` `reject` markup slicing on literal tags and a loose allow-list in the opening test (blind, edge) — a changed tag fails the assertion that the slice is found; the allow-list is the thread's complete text and a stray label is exactly what it would flag, apart from short capitals
  - `[low]` `reject` count pins (`className=` 5, `index` 3, `.name` once) are implementation detail (intent-alignment, blind) — deliberate: they fail when a variant of the block appears
  - `[low]` `reject` `@ws` case-insensitivity is an unspecified requirement (verification-gap) — Story 2.9's parser pins already state it
  - `[low]` `reject` Code Map line numbers go stale (blind) — a dated pointer in a spec, not a contract
  - `[low]` `reject` no behavioural test drives `onSend` with `@unknown` (blind, edge, verification-gap) — `app.test.tsx` already does (lines 474-477), and the unit test covers the parser
  - `[false]` `reject` sprint status absent from the diff while the spec says in-review (blind, edge, intent-alignment) — finalization updates the tracker after review, as in Stories 1.14 and 2.12
  - `[false]` `reject` no gate result recorded, `oversized` accepted without a note (blind) — the gate results are in `## Auto Run Result`; the warning is added by rule
  - `[note]` `reject` reading C: the expectations live at the running app and the diff tests sources and static markup (intent-alignment) — the story is a verification of a negative surface that Story 1.14 pinned the same way; running the app is a manual step recorded as a residual risk
  - `[note]` `reject` reading A/D: the close half (sprint status, spec done, commit) is not in the diff (intent-alignment) — done at finalization
  - `[note]` `reject` the spec narrows "verified absent" to "pinned" (intent-alignment) — the audit of the code found all six absent; the pins keep them so, which is the prior epic's reading of the same story
  - `[note]` `reject` the older loading sweep lacks the new words (verification-gap) — the new sweep covers the wider list; the older is left as it was

## Design Notes

Two judgement calls, both resolved toward the shipped vocabulary. The `working` state (dot pulse, word, ticking counter, Epic 1 UX-DR17) is the closest thing to a thinking indicator; it states a fact about a persona and is the product's one liveness signal, so the prohibition does not reach it. The queued mark is the only on-screen sign that a first message waits for a session that is not up yet; it is the user's own message labelled truthfully (Story 2.5), not a sentence standing in for a spinner. Both are pinned as the only status copy rather than exempted by pattern.

Agent ids appear as a display name only for a persona the roster does not name (`unknownAgent`); that is a roster fallback, not a resolved skill name, and is left alone.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: all exit zero
- `git diff --stat` -- expected: `tests/`, `src/renderer/ui/chat/negative-surface.test.tsx`, this spec and the sprint status; `src/` only if a sweep found a violation

## Auto Run Result

**Summary:** Story 2.13 verifies Epic 2's six prohibitions. An audit of the code found all six already hold, so no behaviour changed: the story adds sweeps and a rendered test that fail if one is broken. `tests/negative-surface.test.ts` gains a Story 2.13 section (the `@` parse in one file reading display names only, no leading-`/` parse, no completion surface; no `title=`, `data-*`, tooltip or `attr(` and no menu entry in a turn; no refusal or handoff-offer copy and one handoff caller; no stand-in word in any string or JSX text, with `working` and `queued ·` each found in one file; no opening or pending state; silent and badge patterns widened over preload and shared; decision-block focus, default and order patterns widened). `src/renderer/ui/chat/negative-surface.test.tsx` renders the whole chat column (composer, orphan header, persona and user turns, sysline, decision block) and asserts the I/O matrix.

**Files changed:**
- `tests/negative-surface.test.ts` -- the Story 2.13 section.
- `src/renderer/ui/chat/negative-surface.test.tsx` -- new rendered test of the chat column.
- `_bmad/implementation-artifacts/sprint-status.yaml` -- 2-13 marked done.
- This spec.

**Review:** 28 findings (blind, edge-case, verification-gap, intent-alignment). Patched 6 (1 medium, 5 low): JSX copy beside an expression, ellipsis in the stand-in regex, a queued-state check that could not fail, classless buttons, a silently dropped file, and two misleading comments. Deferred: none. Rejected: the other 22, each with its reason in the Review Triage Log.

**Follow-up review recommended:** false. One medium was patched; two or more are required on a first pass.

**Verification:** `npm run lint`, `npm run typecheck` and `npm test` exit zero after the patches (106 files, 2238 tests, plus 55 in the watchers project). Before the patches, a temporary violation in each of `title=` in `turn.tsx`, `autoFocus` in the decision block, a "starting session" sentence in `sysline.tsx` and `app.dock.bounce()` in main made the matching sweep fail, and each was restored. The matrix rows are covered by tests that ran: `@` inputs, the opening state, the chat column and the decision block.

**Residual risks:** the pins are source text and static markup; nobody has watched the running app for a sound, a badge or a spinner, and a persona's own words about its speciality are not exercised (only that the harness adds none). Out-of-order options (C, A, B) render no decision block, which is the shipped parser's rule, not this story's. The `working` state and the queued mark are treated as the shipped vocabulary rather than stand-ins, and are pinned as the only status copy.
