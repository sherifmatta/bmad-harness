---
title: 'The whole menu, and only ever the menu'
type: 'feature'
created: '2026-10-03'
status: 'done'
baseline_revision: '25237640ee54b37f09ed031311fe51ba43b19396'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad/implementation-artifacts/epic-3-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 3.1 mounted the skill row with every entry always visible. A persona with ten entries (Business Analyst) floods the composer, there is no `+N more` / `fewer`, and the epic's remaining menu rules (a malformed entry surfaced as a discovery error, `live` never disabling buttons, no second place to find a skill) are asserted by no test at the surface the user sees (FR26, FR27, FR28, FR29, FR30).

**Approach:** Make `SkillRow` own one piece of local state: the first five entries show, and a `+N more` button expands the row in place to the rest, then reads `fewer`. Everything else in the story (malformed-entry error line, held-while-a-turn-is-in-flight, no tooltip, no skill/prompt split, no skills list elsewhere) already holds in code; pin it with tests at the rendered surface and change nothing that already works.

## Boundaries & Constraints

**Always:** A button's only action stays `onRun(item.code)` and `SkillRow` still imports no bridge. Expansion is local to the row: no transcript entry, no `dispatchMenu`, no bridge call, no live-region announcement. Entries 1 to 5 render exactly as today; the `+N more` button appears only when the menu has more than five, `N` = entries not shown, and expanded it reads `fewer` and shows every entry as an ordinary `skill-button`. The toggle is a real `<button type="button">` carrying `aria-expanded`, in the row's flow after the entry buttons (so expanding never moves keyboard focus), takes the shared `:focus-visible` ring with no new rule, and renders in `faint` per DESIGN.md. The toggle is not a skill button and is never disabled by a turn in flight; skill buttons stay disabled whenever `canAnswer` is false (any turn in flight in that session) and never because the persona dot is `live`; the composer is never disabled. All styling from `design/tokens.css` via `var()`; no literal colour, dimension, radius or font stack. Only the existing `blink`, `eq`, `pulse` keyframes; no animation on expansion (the change lands in one frame).

**Never:** No tooltip, `title`, preview, or anything derived from a resolved skill name; no word `skill`/`prompt` or `action` shown for an entry. No second place to find a skill: no list, launcher, palette or menu-printing transcript turn. No change to `src/main/**`, `src/shared/**`, `fixtures/runs/**`, `_bmad/planning-artifacts/**`, the discovery messages or `menu/entry-malformed` copy. No roving-tabindex or arrow-key work (not in this story's acceptance criteria; each button stays its own tab stop). No card, run, section-plan, stop or rail work (3.3 onward; 3.12 to 3.14 are independent of this story).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One entry (UX Designer) | `items.length === 1` | one button, no toggle | N/A |
| Five entries (Developer) | `items.length === 5` | all five, no toggle | N/A |
| Six entries | `items.length === 6` | first five, then `+1 more` | N/A |
| Ten entries (Business Analyst) | `items.length === 10` | first five, then `+5 more` | N/A |
| Expand | activate `+5 more` | all ten buttons in order, toggle reads `fewer`, `aria-expanded="true"`; no event leaves the row; transcript unchanged | N/A |
| Collapse | activate `fewer` | back to five and `+5 more`, `aria-expanded="false"` | N/A |
| Turn in flight | `disabled` true | every skill button disabled; the toggle still works | N/A |
| Persona is `live`, no turn in flight | `canAnswer` true | skill buttons enabled | N/A |
| Menu shrinks while expanded | install refresh leaves 5 or fewer | toggle gone, all shown, nothing stale | N/A |
| Malformed entry (neither `skill` nor `prompt`) | install snapshot error `menu/entry-malformed`, message names the `code` and `has neither skill nor prompt` | one harness-register error line above the thread; no button for that entry; no persona turn | N/A |
| Persona switch | current persona changes | the row is rebuilt collapsed for the new persona; focus stays on the tile | N/A |

</intent-contract>

## Code Map

- `src/renderer/ui/chat/skill-row.tsx` -- the only behavioural change: `useState` for `expanded`, a `VISIBLE = 5` constant (the mockup's `harness-mockup.html:1115-1117` shows five and `+${len-5} more`), toggle button after the entries. `onClick={() => onRun(item.code)}` and `{item.code}` / `{item.description}` literals are pinned by `tests/negative-surface.test.ts:1344-1389`; keep them, and keep `window.harness`, `dispatchMenu`, `action`, `prompt`, `kind` out of the file.
- `src/renderer/ui/chat/skill-row.css` -- add `.skill-more` (faint ground-less variant of `.skill-button`, `color: var(--faint)`); reuse existing tokens only. Faint-token spenders are an allow-list: `tests/negative-surface.test.ts:~636-650` (`"ui/chat/skill-row.css: .skill-row-label"` is the precedent) needs a justified `ui/chat/skill-row.css: .skill-more` entry.
- `src/renderer/ui/chat/skill-row.test.tsx` -- SSR markup tests; the "disabled says nothing else" test counts `disabled=""` on two entries (no toggle, unaffected). Extend for six and ten entries.
- `src/renderer/ui/chat/skill-row.dom.test.tsx` (new) -- DOM behaviour for expand, collapse, held-while-busy toggle, focus not moving. Pattern: `run-card.dom.test.tsx:129-135` mounts `SkillRow` with a `mount` helper and `onRun` spy.
- `src/renderer/ui/app.tsx:199-205` -- mounts `SkillRow` inside `<Composer key={composer-${agent.id}}>`, so a persona switch remounts it collapsed; `disabled={!conversation.canAnswer(agent.id)}`; malformed-entry errors render via `snapshot.errors.map(ErrorLine)` at `app.tsx:~234`. No edit expected.
- `src/renderer/ui/app.test.tsx:~860-900` -- the existing skill-row test (`buttons()`, `tile()`, `field()`, `push()`, `settle()`) to extend: a ten-entry persona, a snapshot error `menu/entry-malformed`, a `live` persona whose buttons stay enabled.
- `src/renderer/ui/chat/conversation-state.ts:62` -- `canAnswer(state, agentId)` is `session exists && !busy`; persona `live` state is not an input. Confirm with a test in `conversation-state.test.ts` if none covers it.
- `src/renderer/ui/install/error-line.tsx` -- renders `message` and `detail` behind a native disclosure; inert. `src/main/sources/install/schema.ts:175` and `src/main/projections/install.ts` produce `menu/entry-malformed` with message `menu · <Name> · entry <code> has neither skill nor prompt` (already tested in main). Read-only here.
- `tests/negative-surface.test.ts:132-235, 1033-1070, 1344-1389` -- no palette, no launcher, no global skills list, skill row ignorant of what it runs. Extend narrowly: the toggle copy `+N more` / `fewer` is exempt wording; add an assertion that the renderer has no second surface naming `fewer`/`+N more` and none of the row's words appear in a transcript entry.
- `src/renderer/design/tokens.css` -- `--faint`, `--skill-button-padding`, `--radius-control`, `--rule-width` exist; add a token only if a value has no home.

## Tasks & Acceptance

**Execution:**
- `src/renderer/ui/chat/skill-row.tsx`, `skill-row.css` (+ tests first: `skill-row.test.tsx`, new `skill-row.dom.test.tsx`) -- first five entries, `+N more` / `fewer` toggle with `aria-expanded`, in-place and local, never disabled, faint -- the matrix rows one to ten entries, expand, collapse, held-while-busy, shrink-while-expanded
- `src/renderer/ui/app.test.tsx` -- extend: ten-entry persona shows five and `+5 more`; expanding adds no `.turn` or transcript entry and calls neither `dispatchMenu` nor `send`; a `live` persona's buttons enabled while a busy session's are disabled and the composer field never is; a `menu/entry-malformed` snapshot error draws one error line naming the code and the missing skill-or-prompt with no button for it and no persona turn -- the surface-level ACs
- `src/renderer/ui/chat/conversation-state.test.ts` -- a persona session with no turn in flight is answerable regardless of dot state; busy is not -- only if absent
- `tests/negative-surface.test.ts` -- faint allow-list entry for `.skill-more` with its reason; the toggle is the only new interactive element in the row and adds no tooltip/title; no skills list, launcher or palette anywhere (existing guards still pass untouched) -- the negative surface
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**Acceptance Criteria:**
- Given a persona with ten entries, when the row renders, then five skill buttons and a `+5 more` button show; when `+5 more` is activated, then the row shows all ten ordinary skill buttons and the toggle reads `fewer`, no transcript entry is created and no bridge call is made; when `fewer` is activated, then it collapses back.
- Given one entry or five entries, when the row renders, then no toggle shows and every entry is a skill button; the row renders correctly at one and at ten.
- Given any turn in flight in the session, when the row renders, then every skill button is disabled while the toggle and composer are not; given a `live` persona with no turn in flight, then the skill buttons are enabled.
- Given a menu entry with neither `skill` nor `prompt`, when the install snapshot carries its `menu/entry-malformed` error, then one harness-register line names the entry's `code` and what is missing, no button exists for it, and no persona turn mentions it.
- Given any menu entry, when the row renders, then it has no `title`, tooltip or preview, and shows nothing that says whether it is a skill or a prompt.
- Given the whole product, then skills are reachable only as the current persona's buttons: no skills list, launcher or command palette exists, and the existing negative-surface guards still pass.
- Given the full suite, lint, typecheck and build, then all pass and no new `@keyframes` exists.

## Spec Change Log

## Review Triage Log

### 2026-10-03 — Review pass
- verdicts: 18 findings — high 0, medium 0, low 11, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: the collapse on persona switch is enforced nowhere in the diff — `app.tsx` keys the composer by agent id (`composer-${agent.id}`), and the new App test expands Mary, switches to John and back and asserts `aria-expanded="false"`; it fails if the key is removed.
  - `[low]` `[reject]` Blind: `expanded` stays true if a menu goes 10 to 5 to 10 while the row stays mounted — needs two install refreshes that change a menu's length with the row open; the fix is an effect or render-time guard, more than a direct correction. Noted as a residual risk.
  - `[low]` `[patch]` Blind: `VISIBLE` and its comment sit between the `SkillRow` doc block and the function, orphaning the doc — `VISIBLE` moved above the doc block in `skill-row.tsx`.
  - `[low]` `[reject]` Blind: toggle accessibility is thin (no `aria-controls`, no count announced, no keyboard test) — a native button with `aria-expanded` and visible text is operable by `Enter`/`Space` by default, and the spec forbids a live-region announcement for expansion; the additions are new surface.
  - `[low]` `[reject]` Blind: `.skill-more` has no contrast, hover or focus rule and is classed `restated` — DESIGN.md prescribes `faint` for this variant and the shared `:focus-visible` ring applies to every button; reclassifying the allow-list wording is cosmetic.
  - `[low]` `[reject]` Blind: the new negative-surface tests are brittle source-text checks — the same style as the neighbouring Story 3.1 tests in the file, developer-only, and fixes are rewrites; each behaviour is also covered by DOM tests.
  - `[low]` `[reject]` Blind: assertions are repeated across three test files and hard-code `5` — duplication across SSR, DOM and App layers is deliberate; changing `VISIBLE` failing several tests is the intended pin.
  - `[low]` `[reject]` Blind: hidden-entry cases untested (malformed in `+N` count, all malformed, focus after collapse, duplicate codes, persona switch mid-turn) — malformed and duplicate entries are dropped in main before the row sees them (`parseMenu`), an empty menu renders no row (tested), and the collapse control keeps focus (tested); the rest are unlikely.
  - `[low]` `[carried]` `[reject]` Edge: stale `expanded` on regrow — same cause and verdict as the second Blind row.
  - `[low]` `[reject]` Edge: focus drops to body when the focused entry beyond the fifth unmounts on a menu shrink — needs a refresh that removes entries while a keyboard user rests on one of them; the fix is a ref and focus management, more than a correction.
  - `[false]` `[reject]` Edge: duplicate codes give duplicate React keys — `parseMenu` drops a later entry with a duplicate code (`has a duplicate code`, `schema.ts:~140`), so the row never receives two.
  - `[false]` `[reject]` Edge: a hidden entry is easy to miss behind a faint toggle — the epic and EXPERIENCE.md prescribe in-place `+N more`, and DESIGN.md prescribes `faint`; this is the specified design.
  - `[low]` `[reject]` Edge: the App wording test matches `skill|prompt|action` against entry descriptions — the fixture descriptions are `Entry N`; a future fixture would fail loudly, not silently.
  - `[false]` `[reject]` Edge: `canAnswer` is indirectly fed by the `work` dot — true, and the spec says only that `live` is not an input; `work` means a turn in flight, which is the rule, and the new test pins `live` enabled and `work` held.
  - `[false]` `[reject]` Intent: ordering ambiguity (the epic lists 3.12 to 3.14 before 3.2) — the request names 3.2; the story touches only the skill row, none of what 3.12 to 3.14 change, and the Design Notes record the sequencing.
  - `[low]` `[reject]` Intent: nothing exercises the real Electron app, CSS layout or the faint toggle's look — the manual check needs a launched app on a BMad install, which an unattended run cannot do; recorded as a residual risk.
  - `[false]` `[reject]` Intent: many new App tests pin behaviour that already held — the spec says so on purpose; tests without code changes are the story's remainder, not a defect.
  - `[false]` `[reject]` Intent: no commit, sprint-status change or spec status change in the diff — those are this step's finalize, outside a `src`/`tests` diff.

## Design Notes

- **Five is the mockup's number, not a measured one.** `harness-mockup.html:1115-1117` shows `p.menu.slice(0,5)` with `+${p.menu.length-5} more` when more than five; EXPERIENCE.md pins the extremes only (UX Designer one entry, Business Analyst ten, John four, Winston two, Amelia five), so five means only the Business Analyst ever shows the toggle today. If the row's width makes five too many, the constant is the single place to change.
- **Most of this story is already true.** The malformed-entry error line, the held-while-busy rule, the absence of tooltips and of any skill/prompt split, and the no-second-surface guards landed in 3.1 and earlier. The risk in this story is breaking one while adding the toggle, so tests at the rendered surface come first.
- **Sequencing.** The epic lists 3.12 to 3.14 ahead of 3.2. This story touches only the skill row and its tests, nothing in the card projection (3.12), `fold/persona-state.ts` (3.13) or the pinned card (3.14), so it was built when asked, on the beat judgement already recorded. If any of those stories later move `app.tsx` or the composer, rebase is mechanical.
- **Expansion state is not persisted.** The composer is keyed by agent id, so switching persona and back returns the row collapsed ("rebuilt on every persona change", EXPERIENCE.md). The toggle's placement after the entries keeps the focused element stable across a toggle.
- **Open EXPERIENCE.md assumption kept.** The collapse affordance `fewer` is marked `[ASSUMPTION]` there; this story builds it as the epic specifies.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, no warnings
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all unit and watcher projects pass
- `npm run build` -- expected: exit 0

**Manual checks (if no CLI):**
- Launch the app on a project with the BMad install, open Mary (ten entries): five buttons and `+5 more`; click it, five more appear in the same row and it reads `fewer`; the transcript gains nothing. Open Sally (one entry): one button and no toggle.

## Auto Run Result

**Summary.** `SkillRow` shows the first five menu entries and, for a longer menu, a `+N more` button that expands the row in place to every entry and then reads `fewer` (`aria-expanded`, after the entries so focus stays put, `faint`, never disabled by a turn in flight). Expansion is the row's own state: no transcript entry, no bridge call, no announcement; a persona switch rebuilds it collapsed. Surface-level tests now pin the rest of the story, which already held: a malformed entry draws one harness-register error line naming its code and what is missing, skill buttons are held for any turn in flight and not for `live`, the composer is never disabled, no tooltip or skill/prompt wording, no second place to find a skill.

**Files changed.** `src/renderer/ui/chat/skill-row.tsx` and `.css` (toggle); tests: `skill-row.test.tsx`, new `skill-row.dom.test.tsx`, `src/renderer/ui/app.test.tsx` (Story 3.2 block), `conversation-state.test.ts` (`canAnswer`), `tests/negative-surface.test.ts` (faint allow-list entry and toggle guards); `epic-3-context.md` regenerated (it was stale against `epics.md`); `sprint-status.yaml` synced (3.2 `done`).

**Review.** 18 findings: patches applied 1 (low: `VISIBLE` moved above the `SkillRow` doc block); deferred 0; rejected 17 with reasons in the log (false 7, low 10). Patched by verdict: high 0, medium 0, low 1.

**Follow-up review recommended: false.**

**Verification.** `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` unit 2,756 and watchers 55 all passed; `npm run build` exit 0 (re-run after the patch). Matrix audit: every I/O row has a passing covering test (six entries by SSR; the others by DOM or App tests).

**Residual risks.**
- The manual check (launch the app, open Mary and Sally) was not done; how the faint `+N more` looks and whether five entries suit the row width are unverified in a real window. `VISIBLE` is the one constant to change.
- `expanded` is not reset if a menu goes 10 to 5 to 10 while the row stays mounted, so it would reopen expanded; needs two install refreshes that change a menu's length.
- Built ahead of 3.12 to 3.14, which the epic lists first; none touches the skill row.
