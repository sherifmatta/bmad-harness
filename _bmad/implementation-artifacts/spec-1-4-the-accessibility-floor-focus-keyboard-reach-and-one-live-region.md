---
title: 'The accessibility floor — focus, keyboard reach, and one live region'
type: 'feature'
created: '2026-09-26'
status: 'done'
baseline_commit: '327652709a348f005574557108bb27588bedb092'
baseline_revision: '327652709a348f005574557108bb27588bedb092'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      A programmatically focused `tabindex="-1"` container matches the global
      `:focus-visible` rule, and this story's own guard bans the usual escape.
    evidence: |-
      EXPERIENCE.md:492-500 requires two programmatic focus targets — the card
      container on expand and the document region on window open — each
      `tabindex="-1"`. In Chromium a `-1` element focused after keyboard
      interaction matches `:focus-visible`, so the global rule in
      `src/renderer/design/focus.css:25` draws a 2px accent ring around a whole
      panel. The standard remedy, `[tabindex="-1"]:focus-visible { outline: none }`,
      is forbidden twice over: by the `outline:none` sweep this story adds and by
      the boundary limiting focus.css to the ring and its stacked modifier.
      Unreachable today — no such surface exists — but Story 1.12 is the first to
      build one and must resolve it, either with a carve-out token or by
      amending the sweep.
    location: >-
      src/renderer/design/focus.css:25
    severity: medium
  - summary: >-
      The announcement queue has no cap, no drop policy and no way to clear it.
    evidence: |-
      `src/renderer/ui/a11y/announcer.ts` queues without bound. Its own header
      cites a card that streams 5,795 deltas; at one message per 2s, a caller
      that announces per event builds a backlog draining for hours and speaking
      facts that stopped being true. There is no `clear()`, so a run ending or a
      window closing cannot flush it. A cap cannot be added unilaterally because
      EXPERIENCE.md:515 states the policy as "queued and read in event order,
      never merged into a count" with no ceiling — capping or dropping is a
      policy decision that document does not make. Unforced today: nothing
      mounts the region. Whoever first feeds it a real stream (Epic 3) needs the
      ruling.
    location: >-
      src/renderer/ui/a11y/announcer.ts
    severity: medium
  - summary: >-
      Nothing in code makes "exactly one polite live region per window" true —
      only a source sweep counts the attribute.
    evidence: |-
      `Announcer` is a bare class with no exported singleton, no React context
      and no provider; `LiveRegion` receives one by prop. The guard in
      `tests/accessibility.test.ts` counts `aria-live` occurrences in `src/`,
      which constrains how many files may declare one, not how many are mounted:
      nothing stops Story 1.9 rendering `<LiveRegion>` twice, or three surfaces
      each constructing their own `Announcer`. The singular-ness NFR22 states is
      a runtime property and this story ships only the primitive. Story 1.9,
      which first mounts it, owns the wiring.
    location: >-
      src/renderer/ui/a11y/live-region.tsx
    severity: medium
  - summary: >-
      `Esc` and the composer's `Enter`/`Shift+Enter` are inside NFR20's closed
      vocabulary but in no shared primitive.
    evidence: |-
      epics.md:194 closes the keyboard vocabulary at arrows, `Enter`/`Space`,
      `Esc` to close the document window, and `Enter`/`Shift+Enter` in the
      composer. `rovingKey` returns `ignore` for `Escape` and has no notion of a
      modifier, so `Shift+Enter` is indistinguishable from `Enter` and would
      activate. The story's own argument is that a shared primitive prevents
      thirteen surfaces each inventing one, and `Esc` is the key most likely to
      be reinvented per surface (the mockup already binds it globally and
      unconditionally at harness-mockup.html:1398). Both belong to the surfaces
      that own them — Story 1.12 for `Esc`, Story 2.3 for the composer — but
      neither was recorded, so nothing would notice the duplication arriving.
    location: >-
      src/renderer/ui/a11y/roving-tabindex.ts
    severity: medium
  - summary: >-
      The stacked focus ring ships its 3px offset without the local stacking
      raise the overlap also needs.
    evidence: |-
      portrait.html:92 pairs the stacked ring with `z-index:5`, because the next
      disc's `margin-right:-5px` and its own `box-shadow:0 0 0 1.5px var(--panel-2)`
      cut-out otherwise clip the ring's right edge. UX-DR10 fixes the product at
      two z-indexes and tests/tokens.test.ts asserts that count exactly, so a
      third is a widening of a stated constraint rather than an implementation
      detail. The raise is a property of the initials token, which Story 1.6
      builds (UX-DR15, FR82). Until then the 3px offset is unverified against a
      real stacked row, because no stacked row exists.
    location: >-
      src/renderer/design/focus.css
    severity: medium
  - summary: >-
      `<LiveRegion>` renders its announcement visibly; nothing hides it from
      sighted users.
    evidence: |-
      The component returns a bare `<div aria-live="polite">`. A polite region
      must stay in the accessibility tree, so the usual treatment is an
      off-screen clip rather than `display:none` — which needs a
      `.visually-hidden` rule, and therefore either a third stylesheet or new
      tokens for the clip values, since focus.css is asserted to carry the focus
      rule and nothing else and NFR23 forbids the literals anywhere but
      tokens.css. Unforced today because nothing mounts it; Story 1.9 is the
      first story that does and so the first that must answer it.
    location: >-
      src/renderer/ui/a11y/live-region.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Nothing in the product is keyboard-operable and nothing is announced. The binding mockup has no focus treatment at all — its only `:focus`-family rule strips the composer's native ring (`harness-mockup.html:261`, `outline:none`) and replaces it with nothing — so every ring, every arrow key and every announcement is net-new. Story 1.3 left a test named `'leaves the focus ring to Story 1.4'` holding the seam open. Each of the thirteen surfaces named by UX-DR23 is built in a later story, and if each invents its own focus style and its own live region, the floor is unretrofittable by the time anyone notices.

**Approach:** Ship the shared primitives now, before the surfaces exist, so later stories reference one implementation instead of thirteen. Three artifacts: one global `:focus-visible` rule whose values come from tokens; one pure roving-tabindex reducer; one pure announcement queue plus the single polite live region that drains it. Nothing is mounted on a surface here — this story is the contract the surface stories assert against, and it is enforced the way NFR23 is enforced: by guard tests over the source tree that fail when a component reimplements what is defined once.

## Boundaries & Constraints

**Always:**
- The ring is `outline`, never `box-shadow`. `outline` is drawn outside the box and follows `border-radius` natively in Chromium 152 (Electron 44), which is exactly what "drawn outside the element and inheriting its radius" asks for. Box-shadow rings are already spoken for by two non-focus jobs — the cast card's speaking ring (`harness-mockup.html:292`) and the stacked-disc cut-out (`portrait.html:90`) — so using box-shadow for focus would collide with both.
- Values live in `tokens.css`; the rule lives in `design/focus.css` and reaches every value through `var()`. The NFR23 literal guard already governs every `.css` under `src/renderer/` except `tokens.css`, so a literal focus style in a component is caught as a literal like any other.
- `:focus-visible` only, applied globally, so no surface can forget it and none may restate it.
- Hover and focus stay separate treatments. Hover raises the ground (`panel-2`/`panel-3`) and warms the border; focus draws the ring. They occupy channels that do not overlap and a surface may carry both at once.
- All logic is pure and testable under `environment: 'node'`: no DOM, no timers, no wall clock — time enters as an argument.
- Every new stylesheet and module is imported by `main.tsx`; a contract nothing loads is a contract nothing keeps.

**Never:**
- No jsdom, happy-dom or `@testing-library/*`. NFR11 pins the stack as a set, and the DOM-environment decision is already owned by Story 1.9 (`deferred-work.md`, the `app.tsx` entry). Assert CSS as text, the way `tests/tokens.test.ts` already does.
- No focus fill, no focus shadow, no colour change, no motion on focus. The ring is the whole treatment.
- No `outline: none` / `outline: 0` anywhere. That is the defect the mockup shipped.
- No `aria-live="assertive"` and no `role="alert"`, anywhere in the product.
- No third z-index. UX-DR10 fixes the set at two (40 scrim, 50 window) and `tests/tokens.test.ts:378` asserts it. The stacked-initials ring needs a local stacking raise to clear the next disc; that belongs to the initials token in Story 1.6 and is recorded as deferred, not smuggled in here.
- No `Home`/`End`, no `⌘K`, no shortcut layer. NFR20 closes the keyboard vocabulary at arrows, `Enter`/`Space` and `Esc`.
- No new `@keyframes` and no second `@media` block in `tokens.css` — `tests/tokens.test.ts:440-465` asserts both exactly.
- Do not mount anything on a surface, build a component for a surface, or touch `app.tsx`. The shell is Story 1.9.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Arrow within a vertical list | `ArrowDown`, index 1, count 4, vertical | `{ kind: 'move', index: 2 }` | No error expected |
| Arrow at the end of a list | `ArrowDown`, index 3, count 4, vertical | `{ kind: 'move', index: 3 }` — clamped, never wrapped | No error expected |
| Wrong-axis arrow | `ArrowLeft`, vertical list | `{ kind: 'ignore' }` — the browser keeps the key | No error expected |
| Activation key in scope | `Enter`, `activateOn: ['Enter', ' ']` | `{ kind: 'activate' }` | No error expected |
| Activation key out of scope | `' '` on a rail row, `activateOn: ['Enter']` | `{ kind: 'ignore' }` — rail rows open on `Enter` only (`EXPERIENCE.md:486`) | No error expected |
| Empty list | any key, count 0 | `{ kind: 'ignore' }` | No throw, no negative index |
| Unhandled key | `Tab`, `x` | `{ kind: 'ignore' }` — Tab is the browser's | No error expected |
| First announcement | `announce('run started', 0)` then `take(0)` | `'run started'` — nothing is delayed by the throttle when nothing preceded it | No error expected |
| Second announcement inside the interval | second `announce` at 500, `take(500)` | `null` — queued, not dropped, not merged | No error expected |
| The interval elapses | `take(2000)` after the above | `'the second message'`, in event order | No error expected |
| Two identical messages | `announce('x')` twice | both are taken, in order — never collapsed into a count | No error expected |
| Empty announcement | `announce('', 0)` | ignored; queue length unchanged | No throw; an empty string announces nothing |
| Nothing queued | `take(9999)` on an empty queue | `null` | No error expected |

</intent-contract>

## Code Map

Greenfield except for three edits — `tokens.css`, `main.tsx` and one test in `tests/tokens.test.ts`. Nothing else under `src/` is modified.

- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md:318-322` -- **the authoritative focus token block**: `ring: '0 0 0 2px {colors.accent}'`, `offset: '2px'`, `offsetStacked: '3px'  # clears the -5px initials overlap`, `radius: 'inherits the focused element'`. Read-only. `:654-658` is the prose rule, including `:658` "hover is `panel-2`, focus is the accent ring, and a surface may carry both at once". Copy values from here, not from memory.
- `.../EXPERIENCE.md:478-488` -- **the authoritative keyboard table**, which is a different shape from DESIGN's flat list: three surfaces are *one tab stop for a list* with arrows inside (Team half, skill row, Outputs half). `:486` is the asymmetry that matters — the rail row activates on `Enter` **only**, where tiles and skill buttons take `Enter`/`Space`. `:480` — Help is reserved and is explicitly **not** a tab stop.
- `.../EXPERIENCE.md:504-515` -- **the live-region policy**: the per-content-class table, "exactly one polite live region per window", the 2s throttle, queued in event order, never merged into a count. `:515` marks the 2s interval `[ASSUMPTION]`. Note the one nuance the epic's phrasing loses: a batch commit is one event and its single announcement *names* the count (`:509`) — that is not the same rule as "never merged into a count" (`:515`).
- `.../EXPERIENCE.md:492-500` -- the **focus-management** table (persona switch, card expand, window open/`Esc`, queued send, run terminal event). Every row belongs to a later story's surface; none is implemented here. Read-only, and the reason the reducer returns an intent rather than moving focus itself.
- `_bmad/planning-artifacts/epics.md:255` (UX-DR23), `:190` (NFR16), `:194` (NFR20), `:195` (NFR21), `:196` (NFR22), `:599-645` (the story). Read-only. NFR20 binds keyboard reach to "the Interaction Primitives table", which exists in `EXPERIENCE.md:153-171`, not in `epics.md`.
- `_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html:261` -- **the defect to not copy**: `outline:none` on the composer textarea, replaced by nothing. `:258` is the separate, legitimate `:focus-within` border tint. The file contains no other focus treatment and no `tabindex` at all.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/mockups/portrait.html:92` -- **the only focus precedent in the repo**: `.ini:focus-visible{outline:2px solid var(--accent); outline-offset:2px; z-index:5}`. The idiom to follow is `outline`, not box-shadow. Two departures: DESIGN.md supersedes its `2px` offset with `3px` for the stacked case, and its `z-index:5` is out of scope here (see Design Notes). `:90` — `margin-right:-5px` with `box-shadow:0 0 0 1.5px var(--panel-2)`, the cut-out ring a focus ring must not replace.
- `src/renderer/design/tokens.css:44-221` -- the second `:root`, where the focus tokens are appended. `:41-42` carries the comment "No focus ring here either: Story 1.4 owns that", which this story updates. The file is the **only** one exempt from the literal guard.
- `tests/tokens.test.ts:487-489` -- **the test to replace**: `it('leaves the focus ring to Story 1.4', …)` asserting `not.toMatch(/focus|outline/)`. Adding `--focus-*` tokens breaks it by design; it is rewritten to assert tokens.css *declares* the focus values and still *styles* nothing.
- `tests/tokens.test.ts:511-537` -- `LITERAL_RULES`. The `dimension` rule flags any bare `px|ch|rem|em|pt|vh|vw|vmin|vmax|%`, negatives included, and the `var()` exemption applies **only** to the `font stack` and `radius` kinds. So `outline: 2px solid var(--accent)` in `focus.css` is a violation and `outline: var(--focus-ring-width) solid var(--accent)` is not. Unitless values are not flagged.
- `tests/tokens.test.ts:546,587` -- `literalsIn()` and `guardedStylesheets()` are **exported**; the new test file imports them rather than re-deriving the guard.
- `tests/tokens.test.ts:468-490` -- `describe('the theme decision')`. Its `'styles no component'` test asserts the selector list is exactly `[':root', ':root']`, which is why the focus **rule** goes in `focus.css` and not in `tokens.css`. `:457-465` asserts exactly one `@media` block with an exact body — do not add a second.
- `eslint.config.mjs:86-152` -- `LAYER_GRAPH`. `View.forbidden = [MAIN, PRELOAD]`, so `renderer/ui/ → renderer/design/` is a legal edge (already used by `main.tsx:1`); `Design.forbidden` includes `VIEW`, so the arrow never points back. A new directory under `src/renderer/ui/` inherits the View rules and adds no graph entry — `tests/layering.test.ts:69-112` asserts the graph verbatim and must not change.
- `vitest.config.ts` -- `environment: 'node'`, include `src/**/*.test.{ts,tsx}` and `tests/**/*.test.{ts,tsx}`. No jsdom, no `globals`.
- `tsconfig.node.json:24-31` / `tsconfig.web.json:21` -- **the placement constraint**. `tests/**/*.ts` is in the node program (`types: ["node"]`, no DOM lib); `src/renderer/**/*.{ts,tsx}` is in the web program (`types: ["vite/client"]`, DOM lib, no node types). A `.tsx` file under `tests/` is typechecked by neither. Hence: pure `.ts` modules that a `tests/*.test.ts` imports must reference no DOM types, and the `.tsx` live region is never imported from `tests/`.
- `src/main/fold/elapsed.ts` -- the house style for a pure module: one exported concept, `kebab-case.ts`, no I/O, time as an argument.
- `tests/bridge-contract.test.ts:1-12` -- the pattern for a test that lives in `tests/` because it ties independently-declared halves together, with a header comment saying which defect it makes impossible.
- `src/renderer/ui/main.tsx:1` -- **modified**: a second stylesheet import alongside `tokens.css`. `tests/tokens.test.ts:498-503` pins the tokens import as a whole line (`/^import '\.\.\/design\/tokens\.css'$/m`), which a second import line does not disturb.

## Tasks & Acceptance

**Execution:**
- [x] `src/renderer/design/tokens.css` -- append `--focus-ring-width:2px`, `--focus-ring-offset:2px`, `--focus-ring-offset-stacked:3px` to the second `:root`, with a comment citing `DESIGN.md:318-322` and stating why the stacked offset is 3px (it clears the `-5px` overlap of the disc behind); update the `:41-42` comment that currently defers the ring to this story -- the values are literals and this is the one file entitled to them; no rule goes here, so the `'styles no component'` assertion stays green
- [x] `src/renderer/design/focus.css` -- create it: one global `:focus-visible` rule setting `outline: var(--focus-ring-width) solid var(--accent)` and `outline-offset: var(--focus-ring-offset)`, plus one stacked modifier overriding only `outline-offset` to `var(--focus-ring-offset-stacked)`. Nothing else -- no background, colour, box-shadow, transition or animation, and no bare `:focus` selector -- because the ring is the whole treatment and `:focus-visible` is what keeps a mouse press from drawing it
- [x] `src/renderer/ui/main.tsx` -- add `import '../design/focus.css'` immediately after the tokens import -- the ring must ship, not merely exist, and tokens must load first so the `var()`s resolve
- [x] `src/renderer/ui/a11y/roving-tabindex.ts` -- a pure `rovingKey(key, { index, count, orientation, activateOn })` returning `{kind:'move',index}` / `{kind:'activate'}` / `{kind:'ignore'}`, clamping at both ends, ignoring off-axis arrows and every unlisted key -- returning an *intent* rather than moving focus is what keeps it DOM-free and lets each surface own its own focus-management rule from `EXPERIENCE.md:492-500`
- [x] `src/renderer/ui/a11y/announcer.ts` -- a pure announcement queue: `announce(message, at)` enqueues (ignoring the empty string), `take(at)` returns the next message once `ANNOUNCE_INTERVAL_MS` (2000) has elapsed since the last one and `null` otherwise, FIFO, never merging -- time is an argument so the 2s throttle is testable without a clock or a fake timer
- [x] `src/renderer/ui/a11y/live-region.tsx` -- the single `<LiveRegion>`: one `aria-live="polite"` `aria-atomic="false"` node rendering the currently-spoken message, driven by the announcer. Keep it thin; it is the only place in the product entitled to an `aria-live` attribute
- [x] `tests/accessibility.test.ts` -- cover every I/O-matrix row for both pure modules, then the guard tests that make the contract enforceable as the product grows: `outline` appears in no governed stylesheet but `design/focus.css`; no `outline:none`/`outline:0` anywhere under `src/`; `focus.css` carries no `:focus` selector that is not `:focus-visible`, and no fill, colour, shadow, transition or animation declaration; `focus.css` is clean under the imported `literalsIn()`; `aria-live="assertive"` and `role="alert"` appear nowhere under `src/`; exactly one `aria-live` attribute exists in the tree and its value is `polite` -- a floor nobody can enforce is a floor the first surface story quietly drops
- [x] `tests/tokens.test.ts` -- replace `it('leaves the focus ring to Story 1.4')` with a test asserting tokens.css declares the three `--focus-ring-*` tokens at the values read live from `DESIGN.md`'s `focus:` block and still contains no `outline` property and no focus selector -- the seam the previous story left open is closed by inverting the same assertion, not by deleting it

**Acceptance Criteria:**
- Given `focus.css`, when it is read, then it contains exactly one `outline` declaration reached entirely through `var()`, and `npm test`'s literal sweep over `guardedStylesheets()` reports no offence for it.
- Given the values, when `tokens.css` and `DESIGN.md:318-322` are compared, then `--focus-ring-width`, `--focus-ring-offset` and `--focus-ring-offset-stacked` are `2px`, `2px` and `3px`, and the test reads those expectations out of `DESIGN.md` at run time rather than transcribing them.
- Given the whole source tree, when it is swept, then `outline` appears only in `design/focus.css`, `outline:none` appears nowhere, and no component can reimplement the ring without failing a test.
- Given the live-region policy, when the tree is swept, then exactly one `aria-live` attribute exists, its value is `polite`, and neither `aria-live="assertive"` nor `role="alert"` appears anywhere.
- Given the renderer build, when `npm run build` completes, then the emitted renderer CSS contains both `--focus-ring-offset:2px` and an `outline` declaration, proving the floor ships rather than merely existing.
- Given `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, when each runs on a clean checkout, then all four exit zero, `tests/layering.test.ts` is untouched and green, and the suite is larger than the 240 tests Story 1.3 left behind.

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 39 findings — high 0, medium 21, low 12, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` verification-gap: the base `:focus-visible` block's `outline-offset` is asserted nowhere — reviewer demonstrated deletion leaving 266/266 green; fixed by pinning the base block's declaration list exactly, as the stacked block already was. Re-probed red.
  - `[medium]` `[patch]` verification-gap: nothing asserts the focus selector is global — reviewer demonstrated `button:focus-visible` passing every check; fixed by pinning focus.css's selector list to `[':focus-visible', '.focus-stacked:focus-visible']`. Re-probed red.
  - `[medium]` `[patch]` verification-gap (other): `setSpoken(next)` collapses two consecutive identical announcements because React bails on equal state, undoing the queue's never-merged guarantee at its only consumer — fixed with a `{message, seq}` state rendered under a `key`, so a repeat is a real DOM mutation.
  - `[medium]` `[patch]` verification-gap (other): the aria-live sweeps match only quoted values, so `aria-live={x}` escapes both the "assertive nowhere" and "exactly one" checks — fixed by counting bare `aria-live` occurrences first and reporting an unreadable value as the expression itself. Re-probed red.
  - `[medium]` `[patch]` blind: the "never collapsed" guarantee dies at the DOM boundary — same root cause as the verification-gap finding above; same fix.
  - `[medium]` `[patch]` blind: polling at exactly the throttle interval makes "the first announcement is immediate" false and pushes worst-case latency to ~4s — fixed by draining at `ANNOUNCE_INTERVAL_MS / 8`, bounding it at 2.25s.
  - `[low]` `[reject]` blind: `announce()`'s `at` parameter is dead (stored, never read). Accurate, but the signature is fixed by the I/O matrix inside `<intent-contract>`, which is read-only; removing the parameter would contradict the captured intent.
  - `[medium]` `[defer]` blind: the queue has no cap, no drop policy and no `clear()`. Real, but EXPERIENCE.md:515 states the policy as "queued… never merged" with no ceiling, so capping is a ruling that document has not made. Unforced today — nothing mounts the region. Deferred with evidence.
  - `[low]` `[patch]` blind: `Date.now()` in the drain undoes the module's "time is an argument, never a clock" discipline and stalls on a backward clock step — fixed with `performance.now()`.
  - `[medium]` `[defer]` blind: no singleton, context or provider, so "exactly one polite live region per window" is unexpressible in code and the sweep only counts declaring files. Real; the wiring belongs to Story 1.9, which first mounts it. Deferred with evidence.
  - `[low]` `[patch]` blind: the `aria-atomic` comment explained it as controlling accumulation rather than what is read — comment corrected. The `role="status"` half rejected: adding a role is an addition, not a correction, and `aria-live="polite"` is sufficient.
  - `[medium]` `[patch]` blind: the `outline:none` kill-switch missed `outline: 0px`, `outline-style`, `outline-width` and the JSX spellings, so the guard and the spec's own documented grep disagreed — pattern broadened and asserted against nine spellings it must catch and two it must not. Re-probed red.
  - `[medium]` `[defer]` blind: the `outline:none` ban forecloses `[tabindex="-1"]:focus-visible { outline: none }`, which EXPERIENCE.md:492-500's programmatic focus targets will need. Real forward collision, unreachable today; Story 1.12 is the first to build such a surface. Deferred with evidence.
  - `[medium]` `[defer]` blind: `Esc` and the composer's `Enter`/`Shift+Enter` are inside NFR20's closed vocabulary but in no shared primitive and were not recorded. Real; they belong to Stories 1.12 and 2.3, but the omission was unrecorded. Deferred with evidence.
  - `[medium]` `[defer]` blind: the reducer cannot see modifiers, so `Shift+Enter` is indistinguishable from `Enter`. Real; the fix adds a parameter the intent's matrix does not define, so it is not a patch. Deferred with the `Esc` entry.
  - `[medium]` `[patch]` blind: the enforcement thesis covered `outline` and `aria-live` but not the reducer — a surface could write its own arrow handler with the suite green. Sweep added restricting arrow-key literals to `src/renderer/ui/a11y/`. Re-probed red.
  - `[low]` `[patch]` blind: the double `clamp` is redundant and untested — inner call dropped. The `NaN` half rejected: no caller can reach it, and guarding integrality adds a branch for undemonstrated state.
  - `[low]` `[patch]` blind: `tests/accessibility.test.ts` defined a second `withoutComments` while its own header argued against duplicated definitions — now imports the shared one and layers `//` stripping on top.
  - `[low]` `[reject]` blind: spec paperwork mismatches (Code Map names `tests/tokens.test.ts` as the guard's home, no Tasks line for `tests/literal-guard.ts`, the "240 tests" acceptance clause). Accurate, but every fix edits this build's spec, which triage rejects. The double-blank-lines half was patched; the `deferred: []` half is resolved by this pass's defer entries.
  - `[false]` `[reject]` edge-case: focus.css loaded without tokens.css yields an invalid `outline` and no ring. `src/renderer/index.html` has one entry, `main.tsx`, and a test pins tokens.css importing before focus.css; the proposed `var(--x, 2px)` fallbacks are literals the NFR23 guard forbids in this file, so the fix is unavailable by construction.
  - `[medium]` `[defer]` edge-case: `tabindex="-1"` programmatic focus draws a full-panel ring — same root cause as the blind finding above; same deferral.
  - `[false]` `[reject]` edge-case: `ARROWS[orientation]` throws for an out-of-union orientation. `Orientation` is a two-value union and every call site is typechecked under `strict`; no caller deserialises one. Loud failure on an unreachable state is correct behaviour, not a defect.
  - `[low]` `[reject]` edge-case: a `NaN` or fractional index passes through `clamp`. Same claim as the blind finding; the reachable half (the redundant clamp) was patched, the `NaN` half rejected for the same reason.
  - `[low]` `[reject]` edge-case: an `activateOn` containing an arrow key silently disables travel on that axis. True of the code, but it describes a caller misconfiguration no surface has made; the fix reorders branches or validates input, both of which add complexity for undemonstrated state.
  - `[medium]` `[defer]` edge-case: `Escape` produces no intent — same root cause as the blind `Esc` finding; same deferral.
  - `[false]` `[reject]` edge-case: a message whose event instant is in the future relative to `at` is emitted early. `take()` never compares `next.at` to anything, and no caller announces with a future instant; the scenario was not shown reachable.
  - `[low]` `[patch]` edge-case: non-monotonic time blocks every announcement until the wall clock catches up — same root cause as the blind `Date.now()` finding; fixed by `performance.now()`.
  - `[medium]` `[defer]` edge-case: unbounded queue with no cap — same root cause as the blind queue finding; same deferral.
  - `[medium]` `[patch]` edge-case: `setSpoken` with an equal string is a no-op — same root cause as the verification-gap finding; same fix.
  - `[medium]` `[patch]` edge-case: announcement latency up to ~2x the interval — same root cause as the blind polling finding; same fix.
  - `[false]` `[reject]` edge-case: supplying a different `Announcer` leaves the previous message in the tree. The component takes one announcer per window and nothing swaps it; the scenario was not shown reachable.
  - `[medium]` `[patch]` edge-case: a non-literal `aria-live` or `role` passes the sweep — same root cause as the verification-gap finding; same fix. Re-probed red.
  - `[medium]` `[patch]` edge-case: the focus-token test passes vacuously when a DESIGN.md key is renamed, because `undefined === undefined` — fixed by asserting each key is a string and each value is a px length before comparing. Re-probed red.
  - `[low]` `[patch]` edge-case: a missing `ring` key throws a raw TypeError instead of failing by name — fixed by the same shape assertions.
  - `[low]` `[patch]` edge-case: `componentBlock`'s trailing-comment strip truncates any value containing a space-prefixed hex, e.g. `view-switch.pressed` — regex narrowed to ignore a `#` that begins a hex colour; verified against both that value and the `offsetStacked` comment.
  - `[medium]` `[patch]` edge-case: the "outline only in focus.css" sweep ran over stylesheets only, so an inline `style={{ outline }}` in a `.tsx` or an outline in `index.html` escaped — sweep extended to every file under `src/`. Re-probed red twice.
  - `[false]` `[reject]` edge-case: `expect(width).toBe('2px')` transcribes a literal the AC says to read at run time. The value *is* read from DESIGN.md and then cross-checked against the geometry the AC itself states; retuning the ring reddening the test is the tripwire working, not drifting.
  - `[low]` `[patch]` edge-case: the replacement test no longer prevents a composite `--focus-ring: 0 0 0 2px #7fa6e8` token entering the guard-exempt file — closed by asserting every focus token's value is a px length.
  - `[false]` `[reject]` intent-alignment: the auditor filed no defects. Its finding — that the ACs are written at the rendered-runtime surface while every artifact and test sits at the source-text and pure-function surfaces — is the story's own design, stated in `epics.md:627` ("this story provides the single implementation that each of their own stories asserts against"). No surface exists to assert against at this commit; three ACs are forward-dated by construction and recorded as such.


## Design Notes

**Why `outline` and not the box-shadow the token spells.** `DESIGN.md:319` writes the ring as `0 0 0 2px {colors.accent}` — box-shadow syntax — but the two properties it also demands, a 2px *offset* and *inheriting the element's radius*, are exactly what box-shadow cannot do cleanly. A box-shadow offset needs a second ring in the ground colour underneath, which is the "focus fill" the same paragraph forbids. `outline` + `outline-offset` does both natively and follows `border-radius` in Chromium 152. It is also the repo's only existing precedent (`portrait.html:92`, `document-card-dead-air.html:78`), and it keeps focus off the one property already carrying two non-focus jobs:

```css
/* already taken, and neither is focus */
.castcard.speaking .pf{box-shadow:0 0 0 2px var(--accent)}   /* who is speaking */
.ini{box-shadow:0 0 0 1.5px var(--panel-2)}                  /* the stack cut-out */
```

So `0 0 0 2px accent` is read as the ring's *geometry* — 2px of accent, 2px outside the edge — not as a literal property value.

**Why the values are tokens and the rule is a second stylesheet.** `tests/tokens.test.ts:475` asserts tokens.css's selector list is exactly `[':root', ':root']`; putting a rule there would break the file's own "styles no component" contract. Splitting them buys the enforcement for free: because `focus.css` is governed by the literal guard, the ring can only be written through `var()`, and the added guard that `outline` appears in no other governed stylesheet turns "defined once, no component reimplements it" from prose into a failing test.

**The stacked ring needs a stacking raise, and it is not this story's.** `portrait.html:92` pairs its stacked ring with `z-index:5`, because the next disc's `-5px` margin and its own panel-coloured cut-out ring would otherwise clip the ring's right edge. UX-DR10 fixes the product at two z-indexes and `tests/tokens.test.ts:378` asserts it, so this story ships the 3px offset and stops there. The raise is a property of the initials token, which Story 1.6 builds (UX-DR15, FR82), so it is named here and left to that story rather than resolved by widening a stated constraint.

**Clamping, not wrapping, and no `Home`/`End`.** Neither is specified anywhere. NFR20 closes the vocabulary — "no shortcut layer beyond this" — and the enumerated keys are arrows, `Enter`/`Space` and `Esc`, so `Home`/`End` are left out. Arrow travel clamps at both ends: a list that wraps moves focus to the far end of a rail the user cannot see, and nothing in the intent asks for it. Both are stated here because both are choices, and a later story that wants wrapping should amend this rather than diverge from it.

**`take(at)` rather than a timer.** The throttle is the only part of the policy with a clock in it, and a timer would make it untestable under `environment: 'node'` without a fake-timer setup the suite does not have. Passing time in keeps the queue a pure function of its inputs, so the 2s boundary, the FIFO order and the never-merged rule are all ordinary assertions:

```ts
const a = new Announcer()
a.announce('run started', 0)
a.announce('run finished', 500)
expect(a.take(0)).toBe('run started')
expect(a.take(500)).toBeNull()      // queued, not dropped
expect(a.take(2000)).toBe('run finished')
```

## Verification

**Commands:**
- `npm test` -- expected: all green, more than 240 tests across more than 9 files; `tests/accessibility.test.ts` covers every I/O-matrix row plus the guards
- `npm run lint && npm run typecheck && npm run build` -- expected: all four exit zero. `typecheck:web` is the one that proves the `.tsx` live region and the CSS import resolve; `typecheck:node` proves the pure modules carry no DOM types
- `grep -rn 'outline' src/ --include=*.css` -- expected: matches only in `src/renderer/design/focus.css`
- `grep -rn 'outline:\s*\(none\|0\)\|aria-live="assertive"\|role="alert"' src/` -- expected: no output
- `grep -rc 'aria-live' src/renderer/ui/a11y/live-region.tsx` -- expected: exactly one, and its value is `polite`
- `npm run build && grep -o 'outline' out/renderer/assets/*.css` -- expected: at least one match; the floor reaches the bundle
- `grep -n 'focus\|outline' src/renderer/design/tokens.css` -- expected: the three `--focus-ring-*` declarations and their comment only — no `outline` property, no selector

**Manual checks (what no test covers):**
- Open `tokens.css` and `DESIGN.md:318-322` side by side: the three values are `2px`/`2px`/`3px` and none was tuned on the way across.
- Reason once about the ring against the radius ladder the surfaces will bring (0 for tiles and rail rows, 4 for skill buttons, 5 for decision options, 6 for cards and the composer, 8 for the window, 50% for the initials token): `outline` inherits each without a per-surface override, which is the claim that makes one rule sufficient for thirteen surfaces.

## Auto Run Result

Status: done

**What was implemented.** The accessibility floor ships as three shared primitives and the sweeps that keep them shared. `src/renderer/design/tokens.css` gains `--focus-ring-width`, `--focus-ring-offset` and `--focus-ring-offset-stacked` (2px / 2px / 3px, read off `DESIGN.md:318-322`) and still styles nothing, so its `[':root', ':root']` contract holds. `src/renderer/design/focus.css` is the one rule that spends them: a global `:focus-visible` drawing `outline: var(--focus-ring-width) solid var(--accent)` at `var(--focus-ring-offset)`, plus a `.focus-stacked` modifier that overrides the offset and nothing else. `outline` rather than `box-shadow` — it sits outside the box and inherits `border-radius` natively in Chromium 152, which is what lets one rule serve a radius ladder from 0 to 50%, and it keeps focus off the property already carrying the speaking ring and the stacked cut-out. `src/renderer/ui/a11y/roving-tabindex.ts` decides arrow travel and activation as an intent (`move` / `activate` / `ignore`), clamping rather than wrapping and letting each surface keep its own focus-management rule; `announcer.ts` is the 2s polite queue with time as an argument, FIFO and never merged; `live-region.tsx` is the single `aria-live="polite"` node that drains it. Nothing is mounted on a surface — the thirteen surfaces UX-DR23 names are each a later story, and this is the implementation they assert against.

**Files changed.**
- `src/renderer/design/focus.css` — new; the focus ring, defined once.
- `src/renderer/design/tokens.css` — the three focus tokens; the Story 1.4 deferral comment updated.
- `src/renderer/ui/a11y/roving-tabindex.ts` — new; the pure arrow/activation reducer.
- `src/renderer/ui/a11y/announcer.ts` — new; the pure throttled announcement queue.
- `src/renderer/ui/a11y/live-region.tsx` — new; the single polite live region.
- `src/renderer/ui/main.tsx` — imports `focus.css` after `tokens.css`.
- `tests/accessibility.test.ts` — new; every I/O-matrix row plus the source-tree guards.
- `tests/literal-guard.ts` — new; the NFR23 guard extracted from `tokens.test.ts` so two suites share one definition of "literal" without Vitest re-registering a test module's suites.
- `tests/tokens.test.ts` — the `'leaves the focus ring to Story 1.4'` seam inverted; `componentBlock()` added to read DESIGN.md's nested `focus:` block at run time; guard helpers moved out.
- `_bmad/implementation-artifacts/deferred-work.md` — two cross-story entries.

**Review findings.** 39 findings across four layers — 0 high, 21 medium, 12 low, 6 false. Eleven entries patched (8 medium, 3 low), six deferred, and the rest rejected.

Patched: the base focus block's `outline-offset` and its global selector, both of which a reviewer demonstrated could be deleted or narrowed with all 266 tests green; the `outline` sweep extended from stylesheets to every file under `src/`, so an inline `style={{ outline }}` in a component can no longer reimplement the ring; the `outline:none` kill-switch broadened to `0px`, `outline-style`, `outline-width` and the JSX spellings, reconciling the guard with the spec's own grep; the `aria-live` sweep taught to report a non-literal value rather than skip it; a new sweep restricting arrow-key literals to `src/renderer/ui/a11y/`, closing the one leg of the enforcement thesis that had none; the focus-token test made non-vacuous, since a renamed DESIGN.md key previously compared `undefined` to `undefined` and passed; `componentBlock`'s comment strip narrowed so it stops truncating values that contain a hex colour; and four defects at the live-region seam — identical consecutive announcements collapsing because React bails on equal state, `Date.now()` stalling on a backward clock step, a drain period equal to the throttle pushing worst-case latency to ~4s, and an `aria-atomic` comment that described the wrong mechanism.

Deferred, with evidence in frontmatter: the stacked ring's stacking raise (UX-DR10 fixes the product at two z-indexes, so it belongs to Story 1.6 with the disc geometry); `<LiveRegion>` not being visually hidden (Story 1.9 mounts it first); the `tabindex="-1"` programmatic-focus collision with the `outline:none` ban (Story 1.12); the queue's absent cap and `clear()` (EXPERIENCE.md states no ceiling, so it needs a ruling); the missing singleton wiring that would make "one per window" a runtime fact rather than a source count (Story 1.9); and `Esc` plus the composer's modifier keys, which are in NFR20's vocabulary but in no shared primitive.

Rejected, with reasons: `announce()`'s dead `at` parameter (accurate, but the signature is fixed by the read-only I/O matrix); a `NaN` index and an out-of-union `orientation` (both unreachable under `strict` with the only call sites typechecked — loud failure on an unshown state is correct); an `activateOn` containing an arrow key (a caller misconfiguration nobody has made, and the fix adds validation for undemonstrated state); `focus.css` loading without `tokens.css` (one entry point, import order is tested, and the proposed `var()` fallbacks are literals NFR23 forbids in that file); a future-dated `at` and a swapped `Announcer` instance (neither shown reachable); the ring width being cross-checked against the AC's own geometry (the tripwire working, not drift); and the spec paperwork mismatches (every fix edits this build's spec, which triage rejects).

**Follow-up review recommended: true.** Eight medium entries were patched on a first pass. The specific unverified risk: every guard this story adds is forward-dated — the sweeps run over a tree holding one placeholder component and two stylesheets, so their behaviour against real surfaces is argued rather than observed — and the four live-region fixes (the keyed node, the 250ms drain, the monotonic clock) have no executing test, because the suite has no DOM environment and adding one is Story 1.9's decision under NFR11. Patched counts by verdict: high 0, medium 8, low 3.

**Verification.** `npm test` 268 passed across 10 files; `npm run lint`, `npm run typecheck` and `npm run build` each exit zero. `tests/layering.test.ts` untouched and green. The bundle carries `--focus-ring-offset:2px`, `--focus-ring-offset-stacked:3px` and the `outline` declaration. `outline` appears only in `focus.css`; no `outline:none` in any spelling under `src/`; exactly one `aria-live`, and it is `polite`. All thirteen I/O-matrix rows have a named test that ran and passed. Seven mutation probes run against the patched tree — deleting the offset, narrowing the selector, an inline `outline` in a `.tsx`, `outlineWidth: 0`, an arrow-key literal outside the a11y module — each turned the suite red and was reverted; the tree is byte-identical afterwards.

**Residual risks.** The three ACs that are runtime claims — one tab stop per list, one polite live region per window, the stacked ring clearing the `-5px` overlap — cannot be true of the product at this commit, because no surface, no mount point and no stacked row exists; they are carried by the primitives and the guards until the surface stories arrive. The reducer supplies arrow travel and activation but not the `tabindex` rotation itself, which each list owns. `outline` inheriting `border-radius` is a Chromium 152 behaviour asserted by choosing `outline` over `box-shadow`, not by a rendered test.
