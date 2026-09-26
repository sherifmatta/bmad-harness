---
title: 'The visual contract in one file'
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
baseline_commit: 'edfe91c6476262c649c9b1919029560e6477234d'
baseline_revision: 'edfe91c6476262c649c9b1919029560e6477234d'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Nothing declares `color-scheme: dark`, so a dark-only product renders light
      form controls, scrollbars and text selection until a shell stylesheet exists.
    evidence: |-
      `grep -rn 'color-scheme' src/ _bmad/planning-artifacts` finds nothing. NFR15
      forbids a theme *branch*, not this declaration, and `:root { color-scheme: dark }`
      would pass this story's "no component styling" boundary — but the gap predates
      this change and the story's acceptance criteria are a closed list that does not
      reach it. It belongs with the first `body` rule.
    location: >-
      src/renderer/design/tokens.css
    severity: medium
  - summary: >-
      The NFR23 literal guard governs `.css` files only, so its coverage depends on
      Story 1.9 choosing plain stylesheets over CSS-in-JS or inline styles.
    evidence: |-
      `literalsIn()` is run over `stylesheetsUnder('src/renderer')`; the sweep is
      vacuous today (tokens.css is the only stylesheet) and the probes are what prove
      the matcher works. `.tsx` is excluded deliberately — Story 1.6's portrait
      palettes are literal hex in source by design — but if the shell carries style in
      `style={{}}` props or a CSS-in-JS runtime instead, the story's "a literal in a
      component becomes a detectable defect" is unenforced with the suite still green.
      Story 1.9 should either write plain `.css` or extend the guard to whatever it
      chooses.
    location: >-
      tests/tokens.test.ts
    severity: medium
  - summary: >-
      Hairline border widths and the three inset-rule shadows have no token, so the
      first component stylesheet meets a guard failure with nothing to reach for.
    evidence: |-
      DESIGN.md's elevation section names three inset rules (`inset 0 -2px 0 accent`,
      `inset 2px 0 0 accent-edge`, `inset 2px 0 0 accent`) and the mockup's hairlines
      are all `1px solid var(--line)`. The promoted-literal list this story closes
      names neither, and the guard now catches negative and positive dimensions alike,
      so `border: 1px solid var(--line)` and any inset rule will be reported as NFR23
      defects. That is the guard working as designed — the resolution is for the story
      that first needs the value to add the token to tokens.css — but it is friction
      nobody has met yet and it should not be discovered mid-implementation.
    location: >-
      src/renderer/design/tokens.css
    severity: low
---

<intent-contract>

## Intent

**Problem:** `src/renderer/` holds no stylesheet, so every visual story after this one (1.5, 1.6, 1.9–1.12) would pick its own dark grey, its own radius and its own font stack, and the five-step surface ramp would silently become "roughly the same dark grey" across independently built surfaces. NFR23 declares a literal colour, dimension, radius or font stack in a component a **defect** — but nothing in the repository can currently detect one.

**Approach:** Create `src/renderer/design/tokens.css` as the single visual contract: the mockup's `:root` block copied byte-for-byte at the top of the file, the added and promoted tokens after it, the type scale, the radius family, the spacing ladder and binding layout constants, the elevation and opacity tokens, the five-declaration motion inventory, and the global reduced-motion rule. Load it from the renderer entry so the contract ships rather than merely existing, and back it with a test suite that reads the file and fails on drift from the mockup.

## Boundaries & Constraints

**Always:**
- `tokens.css` **begins at byte 0** with lines 8–27 of `harness-mockup.html` (`:root{` … `}`) copied unchanged, including their original two-space indentation and the two-declarations-on-one-line `--accent`/`--accent-bg` row. No comment, no `@charset`, nothing precedes it. Everything added sits in a **second** `:root` block below it, so the verbatim block stays byte-comparable forever.
- `--red`, `--mono`, `--sans` and `--r` are inside the verbatim block and are never restated below it.
- `--note: #7f9ce8` is added, not copied, and is visibly distinct from `--accent: #7fa6e8`.
- The `disagree` trio is separate from `--red`: red is failure, disagree is friction. Never conflated, never derived from each other by `var()`.
- Naming convention: colours keep bare names as the acceptance criteria spell them (`--accent-border`, `--scrim`, `--legend-badge-bg`); every other family is role-prefixed — `--fs-*`, `--lh-*`, `--track-*`, `--weight-strong`, `--radius-*`, `--space-*`, `--z-*`, `--shadow-*`, `--opacity-*`, `--motion-*`, `--grad-*`. Layout constants keep the surface's own name (`--rail`, `--topbar`, `--card-body-max`).
- `--r` **is** the radius family's DEFAULT (5px). The nine other radii are `--radius-*`; ten values total, none normalised away.
- Dark only. One palette, one `prefers-color-scheme`-free file.
- Values are authoritative from `DESIGN.md`'s frontmatter, which is itself derived from the mockup. Where DESIGN.md and the mockup disagree, DESIGN.md wins — except inside the verbatim block, where the mockup is the source by definition.

**Never:**
- No component styling of any kind. No `body{}`, no `*{box-sizing}`, no scrollbar rule, no class selector, no element selector. The only non-`:root` rules in the file are the three `@keyframes` and the reduced-motion `@media` block.
- No focus-ring token — Story 1.4 owns the focus treatment and adds it there.
- No component dimensions (status-dot 6px, tile 56px, portrait sizes, card paddings). This file carries only the binding layout constants UX-DR7 names, plus `--party-side`.
- No `288px` anywhere; no light palette, `prefers-color-scheme`, `prefers-contrast` or `forced-colors` branch; no elevation scale, no `z1/z2/z3`, no third z-index; no weight other than 600; no easing library, no sixth motion declaration, no spinner or skeleton keyframe.
- No `prefers-reduced-motion` carve-out — the rule has no exceptions and no `:not()`.
- Do not add a DOM test environment or any dependency outside the NFR11 pinned set. This story adds no React component, so the deferred `app.tsx`/jsdom item stays deferred (see Design Notes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Verbatim block intact | `tokens.css` opens with the mockup's `:root` block | the token test passes | any byte changed, reordered or re-indented fails the test naming the first differing line |
| Mockup edited | `harness-mockup.html`'s `:root` changes | the token test fails | the test reads the mockup at run time, so the contract cannot silently diverge from its source |
| Literal in a stylesheet | any `.css` under `src/renderer/` other than `design/tokens.css` containing a hex colour, a `px`/`ch`/`vh`/`vw` dimension, a radius or a font stack | `npm test` exits non-zero, naming the file and the literal | reported as a defect per NFR23; values must be `var(--…)` |
| Literal in tokens.css itself | `tokens.css` declaring literals | passes — this is the one file entitled to them | N/A |
| Superseded constant | `288px` appears in `tokens.css` | test fails | UX-DR8: the party side panel is 240px and 288px must not be implemented |
| Theme branch | `prefers-color-scheme`, `prefers-contrast` or `forced-colors` in `tokens.css` | test fails | NFR15: dark only |
| Reduced motion carve-out | the `prefers-reduced-motion` block containing any selector but `*`, or any declaration without `!important` | test fails | UX-DR12 requires a global rule with no exceptions |

</intent-contract>

## Code Map

Greenfield except for two small edits — `src/renderer/ui/main.tsx` and `tsconfig.web.json`. Nothing else under `src/` is modified.

- `_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html:8-27` -- **the verbatim `:root` block.** 20 lines, `:root{` through `}`, two-space indented, `--accent` and `--accent-bg` sharing line 20. Read-only, and read at test run time — never transcribed into the test as a literal.
- `.../harness-mockup.html:148-149,220-221,299-301` -- `pulse`, `blink` (`steps(1)`) and `eq` keyframes, verbatim source. `:124` and `:284` carry the `reveal` (.16s) and `cast` (.25s) transitions. `:403-405` is the reduced-motion block to copy.
- `.../harness-mockup.html:279,349` -- the only two gradients in the product: cast strip `linear-gradient(180deg,#151920,#12161b)`, window titlebar `linear-gradient(180deg,#232a33,#1d232b)`.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md:19-195` -- **the authoritative value table.** `colors:` (`:22-72`, every added and promoted token with its hex), `typography:` (`:74-135`, the 13 sizes and 2 stacks), `rounded:` (`:137-147`, the 10 radii), `spacing:` (`:149-177`, the gap ladder and every binding layout constant including `party-side: 240px`). Read-only. Copy values from here, not from memory.
- `DESIGN.md:393-441` (Typography prose) -- the four line-heights (1.55 / 1.72 / 1.45 / 0) and the nine tracking values, which the frontmatter states only partially. `:488-521` -- elevation (two z-indexes, the three shadow jobs) and the radius role table.
- `_bmad/planning-artifacts/epics.md:227-242` -- UX-DR1–UX-DR8 and UX-DR10–UX-DR13 verbatim; `:189,197` -- NFR15, NFR23; `:561-598` -- the seven acceptance criteria this story answers. Read-only.
- `src/renderer/ui/main.tsx` -- **modified**: add `import '../design/tokens.css'` as the first import. `renderer/ui/ → renderer/design/` is a legal layer edge (`eslint.config.mjs` LAYER_GRAPH: Design forbids View, not the reverse).
- `tsconfig.web.json:12` -- **modified**: `"types": []` → `"types": ["vite/client"]`, which supplies the `*.css` module declaration. `vite` is already a pinned devDependency, so this adds no package.
- `tests/layering.test.ts:1-40` -- the pattern to follow: run the real rule over in-memory probes, assert on the result, never write a violating file to disk. The literal-guard test reuses this shape.
- `tests/bridge-contract.test.ts`, `vitest.config.ts` -- `tests/**/*.test.ts` is already in the suite and in `tsconfig.node.json`'s program, so a filesystem-reading test belongs in `tests/`, not under `src/renderer/` (whose program has no node types).
- `src/renderer/ui/app.tsx:4-8` -- the comment saying the visual contract is Story 1.3. The component stays unstyled; this story does not touch it.

## Tasks & Acceptance

**Execution:**
- [x] `src/renderer/design/tokens.css` -- create it, starting at byte 0 with `harness-mockup.html:8-27` copied unchanged; then a provenance comment, then a second `:root` holding: `--note`; the `disagree` trio; the twenty promoted literals (`accent-border`, `accent-wash`, `accent-edge`, `halo-live`, `halo-work`, `meta`, `ink-doc`, `ink-doc-strong`, `ink-doc-mute`, `ink-md`, `code-bg`, `code-ink`, `initials-bg`, `initials-line`, `initials-ink`, `win-line`, `scrim`, `legend-badge`, `legend-badge-bg`, `legend-badge-border`); thirteen `--fs-*`, four `--lh-*`, nine `--track-*`, `--weight-strong: 600`; nine `--radius-*` (`--r` is the tenth, already above); ten `--space-*`; the fifteen layout constants incl. `--party-side: 240px`; `--z-scrim: 40`, `--z-window: 50`; four `--shadow-*`; four `--opacity-*`; two `--grad-*`; five `--motion-*` -- one file is the whole visual contract, so a literal anywhere else becomes detectable
- [x] `src/renderer/design/tokens.css` -- below the tokens, the three `@keyframes` (`pulse`, `blink` at `steps(1)`, `eq`) copied from the mockup, then `@media (prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important}}` -- the motion inventory is closed in the same file that defines it, and `blink` must be hard on/off
- [x] `src/renderer/ui/main.tsx` -- add `import '../design/tokens.css'` as the first import -- a contract nothing loads is a contract nothing keeps; this is also the first proof the renderer build emits CSS
- [x] `tsconfig.web.json` -- set `"types": ["vite/client"]` -- the CSS import needs a module declaration and Vite ships its own; hand-rolling a `*.css` shim would duplicate it
- [x] `tests/tokens.test.ts` -- cover every matrix row: byte-compare the file's opening against the `:root` block extracted from `harness-mockup.html` at run time; assert `--note`'s value and its distinctness from `--accent`; assert `--red` sits inside the verbatim block and the disagree trio outside it; assert all twenty promoted names are declared; count exactly thirteen `--fs-*` and four `--lh-*`; assert 600 is the only weight value in the file; assert ten radius values with `--radius-pill: 99px`; assert `240px` present and `288` absent; assert the reduced-motion block's exact shape; assert no theme branch; assert exactly two z-index values -- the contract is verifiable by command, not by reading
- [x] `tests/tokens.test.ts` -- the NFR23 literal guard: a checker over every `.css` under `src/renderer/` except `design/tokens.css`, failing on hex colours, bare dimensions and font stacks; run it over in-memory probes (one clean, one with a literal of each class) so the guard is proven wired while no other stylesheet yet exists -- a guard nobody has watched fail is a guard nobody knows is wired up

**Acceptance Criteria:**
- Given `tokens.css` and `harness-mockup.html`, when the first 20 lines of the stylesheet are compared to the mockup's `:root` block, then they are byte-identical and in source order.
- Given the added tokens, when the file is read, then `--note: #7f9ce8` and `--accent: #7fa6e8` are both declared and differ, and no `var(--note)` reference exists anywhere in `src/`.
- Given the type scale, when the file is read, then thirteen `--fs-*` tokens span 9px to 20px over the two platform stacks, four `--lh-*` tokens carry 1.55 / 1.72 / 1.45 / 0, and `600` is the only font-weight value present.
- Given the radius family, when the file is read, then ten radius values exist by role — `--r` at 5px plus nine `--radius-*` — and none is an alias of another.
- Given the renderer build, when `npm run build` completes, then the emitted renderer CSS contains `--bg:#101317` and `--party-side:240px`, proving the contract ships rather than merely existing.
- Given `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, when each runs on a clean checkout, then all four exit zero and the suite is larger than the 17 tests Story 1.2 left behind.

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 50 findings — high 0, medium 19, low 28, false 3, maybe-false 0
- findings:
  - `[false]` `[reject]` blind-hunter: `--legend: 24px` missing from the layout constants — UX-DR28 cuts the legend footer from v1, so a constant sizing a surface that does not ship would be the defect; UX-DR7's list, which omits it, is the story's stated scope. The test now says so at the assertion.
  - `[low]` `[defer]` blind-hunter: no token for the second shadow job (inset rules) — real forward friction, but the promoted-literal list the AC closes does not name them and each inset rule is component-specific; recorded as deferred with the hairline case.
  - `[medium]` `[patch]` blind-hunter: `--track-head` pairs by name with `--fs-head` but carries the `label` role's .09em — renamed to `--track-caps`, with the reason stated at the declaration and an exact name→value map in the test.
  - `[medium]` `[patch]` blind-hunter: literal guard misses colour functions, named colours, rem/em/%/pt, negatives and longhand radii — rules broadened; one probe row added per newly covered class.
  - `[medium]` `[patch]` blind-hunter: a declaration mixing a literal with a `var()` is fully exempted — the exemption is now per value (`withoutReferences`), and `font-family: var(--mono), Menlo` and `border-radius: 4px var(--r)` are probe-covered.
  - `[low]` `[patch]` blind-hunter: `guardedStylesheets()).toEqual([])` asserts emptiness inside a test named for the exemption — now asserts the exemption itself, so Story 1.9's first stylesheet cannot redden the guard's wiring check.
  - `[low]` `[patch]` blind-hunter: `not.toContain('288')` is a substring ban that a future hex or alpha would trip — scoped to `/\b288px\b/` over the comment-stripped file, plus an assertion that `--party-side` is 240px.
  - `[medium]` `[patch]` blind-hunter: run-time coupling covers only the `:root` block; keyframes, gradients and every value below it were hand-transcribed — keyframes and gradients are now read from the mockup, colours/radii/spacing/layout from DESIGN.md's frontmatter, at run time.
  - `[low]` `[reject]` blind-hunter: `head -c 9` in the spec's Verification block is off by one (`  :root{` is 8 bytes; confirmed with `od`) — accurate, but the fix edits this build's spec, which triage rejects. The command still passes.
  - `[low]` `[reject]` blind-hunter: the suite-size acceptance criterion cites 17 tests when the real pre-change baseline was 193 — accurate, and the fix edits this build's spec.
  - `[medium]` `[patch]` blind-hunter: type scale and tracking verified by count and range only — both families now assert an exact name→value map; swapping two sizes fails.
  - `[medium]` `[defer]` blind-hunter: nothing declares `color-scheme: dark`, so form controls and scrollbars render light in a dark-only product — not caused by this change (the gap predates it) and it is a declaration, not a token; deferred to the story that writes the shell's `body` rule.
  - `[low]` `[patch]` blind-hunter: `src/renderer/design/.gitkeep` left behind now that the directory holds a real file — deleted.
  - `[low]` `[patch]` blind-hunter: the re-targeted deferred-work entry names "Story 1.9 or 1.10", so neither owns it — now names Story 1.9 alone, with the dependency decision attached.
  - `[low]` `[reject]` blind-hunter: spec frontmatter (`deferred: []`, `context: []`, empty logs) contradicts the body — the fix edits this build's spec; the `deferred` list is populated by this pass in any case.
  - `[false]` `[reject]` blind-hunter: Code Map keyframe line refs wrong — `:148-149` spans the `.pulse` rule and its `@keyframes`, which is what the citation describes; and the fix would edit this build's spec.
  - `[low]` `[patch]` edge-case: `verbatimBlock()` does not guard `indexOf('\n  }')` returning -1 — an unterminated block now fails naming the cause, not the length.
  - `[low]` `[patch]` edge-case: `verbatimBlock()` takes the first `  :root{` without asserting uniqueness — now asserts exactly one match, so the comparison cannot silently target the wrong block.
  - `[low]` `[reject]` edge-case: an unbalanced `/*` would make `withoutComments` report literals inside a comment — an unterminated comment breaks the stylesheet and the build long before the guard sees it; the fix adds counting machinery for a case nothing can reach in everyday use.
  - `[low]` `[patch]` edge-case: a duplicated custom property collapses into one Map entry, blinding every count — `customProperties` now throws on a repeat.
  - `[low]` `[patch]` edge-case: `[a-z0-9-]+` cannot see `--Rail:400px` — widened to `[\w-]+`.
  - `[medium]` `[patch]` edge-case: the dimension lookbehind excludes every negative literal — negatives are now matched and probe-covered (`margin-left: -4px`).
  - `[medium]` `[patch]` edge-case: dimensions covered only `px|ch|vh|vw` — `rem`, `em`, `pt`, `%`, `vmin`, `vmax` added, three of them probe-covered.
  - `[medium]` `[patch]` edge-case: `rgba()/hsl()/named` colours never flagged although eleven of tokens.css's own values are `rgba()` — a `colour function` rule was added with two probes.
  - `[low]` `[patch]` edge-case: longhand corner radii escape both rules — the radius pattern now covers `border-(top|bottom)-(left|right)-radius`, probe-covered.
  - `[medium]` `[patch]` edge-case: a font declaration mixing `var()` with literal families reports nothing — covered by the per-value exemption above, probe-covered.
  - `[low]` `[patch]` edge-case: `const [first, ...rest]` throws a TypeError when a rule stops matching its own probe — the result is asserted non-empty first, and the expectation is now by presence rather than position.
  - `[low]` `[patch]` edge-case: `toEqual([])` on the guarded list (duplicate of the blind-hunter row above) — same fix.
  - `[low]` `[reject]` edge-case: `src/renderer` missing or symlinked would throw ENOENT or hide stylesheets — the directory is part of the binding source tree and its absence would fail far louder tests first; the fix adds guards for a state never demonstrated.
  - `[low]` `[patch]` edge-case: the two-gradient count matches only `linear|radial`, so a `conic-gradient` would escape — every gradient spelling is now counted.
  - `[low]` `[patch]` edge-case: `288` respelled (e.g. `18rem`) slips through and `#288f3a` false-fails — addressed with the scoping above; the respelling case is covered by the `--party-side` value assertion.
  - `[false]` `[reject]` edge-case: no test asserts state stays legible with motion off — tokens.css carries no state; the global rule is exactly what the acceptance criterion mandates, and the obligation lands on the stories that render state.
  - `[low]` `[reject]` edge-case: `"types": ["vite/client"]` widens the renderer program beyond a `*.css` shim — true, but no harm is named beyond surface area, nothing in the renderer touches `import.meta.env`, and the fix adds a hand-maintained declaration file duplicating what the pinned tool already ships.
  - `[low]` `[patch]` edge-case: the deferral names no single owner (duplicate of the blind-hunter row) — same fix.
  - `[medium]` `[patch]` edge-case: claim that the guard detects literal colour is overstated (duplicate) — same fix.
  - `[medium]` `[patch]` edge-case: claim that the guard detects bare dimensions and font stacks is overstated (duplicate) — same fix.
  - `[low]` `[patch]` edge-case: claim that the guard covers "every .css except tokens.css" is contradicted by the emptiness assertion (duplicate) — same fix.
  - `[medium]` `[patch]` verification-gap: nothing asserts the renderer entry loads the stylesheet — deleting the import left lint, typecheck, build and all 231 tests green with zero tokens in the window; a test now pins the entry chain, and the mutation was watched failing.
  - `[medium]` `[patch]` verification-gap: guard recognises only hex among colour spellings (duplicate) — same fix.
  - `[medium]` `[patch]` verification-gap: dimension rule covers only four units (duplicate) — same fix.
  - `[medium]` `[patch]` verification-gap: font-stack rule disabled by any `var()` in the declaration (duplicate) — same fix.
  - `[low]` `[patch]` verification-gap: `guardedStylesheets()).toEqual([])` (duplicate) — same fix.
  - `[low]` `[reject]` verification-gap: the deferral re-targets but does not close the `app.tsx` coverage gap — correct and intended; the gap is already recorded in `deferred-work.md`, and this pass only sharpened its owner.
  - `[low]` `[reject]` intent-alignment: "visibly distinct" is tested as string inequality, not perceptually — unavoidable without a colour-distance implementation; both hexes are now read from DESIGN.md, and the perceptual check is listed as a manual one.
  - `[low]` `[reject]` intent-alignment: nothing asserts that only the persona tile references `--note`, or only the handoff chip `--radius-pill` — no consumer exists yet, so the fix would guard state never demonstrated with a proxy rule that cannot know which component is the persona tile; the restriction is documented at the declaration and enforceable at Story 1.10.
  - `[low]` `[reject]` intent-alignment: the reduced-motion assertion covers this file's text, not the running app's cascade — the acceptance criterion is written about the file; app-wide enforcement needs surfaces that do not exist yet.
  - `[medium]` `[defer]` intent-alignment: the guard is `.css`-only, so its coverage is contingent on Story 1.9 choosing plain stylesheets over CSS-in-JS or inline styles — recorded as deferred for that story to settle.
  - `[medium]` `[patch]` intent-alignment: DESIGN.md is declared authoritative but only the mockup is read at run time, so promoted tokens are asserted by name and never by value (duplicate of the coupling row) — same fix; a mutated `--ink-doc` was watched failing.
  - `[low]` `[reject]` intent-alignment: the register split (role→family binding) is not tokenised — UX-DR9 is deliberately outside this story's `Implements` list; Story 1.5 owns it.
  - `[medium]` `[patch]` intent-alignment: "the contract ships" is covered by manual commands only (duplicate of the entry-chain row) — same fix.

## Design Notes

**Why two `:root` blocks rather than one.** UX-DR1 says the block is "copied verbatim, in source order… not a starting point to be tuned", and AD-14/NFR23 call a changed literal a defect. A single merged `:root` makes "unchanged" a judgement call; two blocks make it a byte comparison the test performs against the mockup itself:

```ts
const style = readFileSync(MOCKUP, 'utf8')
const block = style.slice(style.indexOf('  :root{'), style.indexOf('\n  }', style.indexOf('  :root{')) + 4)
expect(readFileSync(TOKENS, 'utf8').startsWith(block)).toBe(true)
```

Reading the mockup at run time rather than pasting its text into the test is what makes the coupling real: edit either file alone and the suite goes red.

**Thirteen sizes, fourteen roles.** DESIGN.md's table names fourteen roles but states thirteen *distinct* sizes — `doc-prose` and `body-ui` are both 11.5px and are separated by line-height (1.72 vs 1.55), not size. So thirteen `--fs-*` tokens ship and `doc-prose` is spelled `var(--fs-body-ui)` with `var(--lh-read)` at its use site in Story 1.5. The AC counts sizes, so thirteen is the number the test asserts.

**The literal guard is scoped to stylesheets, deliberately.** Scanning `.tsx` for hex would fire on Story 1.6's portraits, whose curated palettes are literal hex in source *by design* (pure deterministic functions in `renderer/design/`). Scoping the guard to "every `.css` under `src/renderer/` except `tokens.css`" keeps it true forever and makes it load-bearing the moment Story 1.9 writes the shell's stylesheet. It is vacuous against the filesystem today, which is why it is also run over in-memory probes.

**The deferred `app.tsx`/jsdom item is not closed here, and the recommendation moves.** `deferred-work.md` nominated this story on the grounds that it "brings the first real renderer surface". It does not: it brings a stylesheet, and every one of its acceptance criteria is a fact about file contents that `environment: 'node'` can assert. Closing that item still needs a DOM environment, which is a dependency outside the NFR11 set that neither this story's criteria nor its boundaries authorise. It should move to the first story that actually mounts a component — Story 1.9 (conversation and project state in one window) or 1.10 — which will need the environment for its own tests anyway.

## Verification

**Commands:**
- `npm test` -- expected: all green, more than 17 tests across more than 5 files; `tests/tokens.test.ts` covers all seven matrix rows
- `npm run lint && npm run typecheck && npm run build` -- expected: all exit zero. `typecheck:web` is the one that proves `vite/client` resolved the CSS import
- `grep -rn 'var(--note)' src/` -- expected: no output; `--note` is declared here and referenced by nothing until the persona tile exists (Story 1.10)
- `grep -n '288\|prefers-color-scheme\|prefers-contrast\|forced-colors' src/renderer/design/tokens.css` -- expected: no output
- `head -c 9 src/renderer/design/tokens.css` -- expected: `  :root{` — the file opens with the verbatim block at byte 0, nothing before it
- `npm run build && grep -o 'party-side:240px' out/renderer/assets/*.css` -- expected: one match; the tokens reach the bundle

**Manual checks (what no test covers):**
- Open `harness-mockup.html` and `tokens.css` side by side: the added `:root` introduces no colour that is not in DESIGN.md's `colors:` map, and no value was "tuned" on the way across.
- `--note` (`#7f9ce8`) and `--accent` (`#7fa6e8`) rendered as two adjacent swatches read as distinguishable but not as an error.

## Auto Run Result

Status: done

**What was implemented.** `src/renderer/design/tokens.css` is the whole visual contract in one file. It opens at byte 0 with `harness-mockup.html:8-27` copied byte-for-byte — indentation and the shared `--accent`/`--accent-bg` line included — followed by a second `:root` carrying `--note`, the `disagree` trio, the twenty promoted literals, thirteen `--fs-*`, four `--lh-*`, nine `--track-*`, `--weight-strong`, nine `--radius-*` (with `--r` as the tenth), ten `--space-*`, fifteen binding layout constants including `--party-side: 240px`, two z-indexes, four shadows, four opacities, two gradients and five `--motion-*`. Below the tokens sit the three `@keyframes` and the global reduced-motion rule, and nothing else — no component styling, no focus ring, no theme branch. The renderer entry imports it, so the contract ships rather than merely existing.

**Files changed.**
- `src/renderer/design/tokens.css` — new; the visual contract.
- `tests/tokens.test.ts` — new; 47 tests covering all seven I/O-matrix rows plus the NFR23 literal guard.
- `src/renderer/ui/main.tsx` — imports the stylesheet as its first import.
- `tsconfig.web.json` — `"types": []` → `["vite/client"]` for the CSS module declaration.
- `src/renderer/design/.gitkeep` — deleted; the directory holds a real file now.
- `_bmad/implementation-artifacts/deferred-work.md` — the `app.tsx`/jsdom item no longer nominates this story; it names Story 1.9.

**Review findings.** 50 findings across four layers — 0 high, 19 medium, 28 low, 3 false. Nine entries patched (4 medium, 5 low), 3 deferred, and the rest rejected. Patches: the missing entry-chain test; the literal guard broadened to colour functions, six more units, negatives, longhand radii and per-value `var()` exemption; run-time coupling extended from the `:root` block to DESIGN.md's colours/radii/spacing and the mockup's keyframes and gradients; `--track-head` renamed `--track-caps`; the guard's exemption check rewritten to assert exemption rather than emptiness; the `288` ban scoped to `288px`; five helper failure modes guarded; `.gitkeep` removed; the deferral given one owner.

Rejected, with reasons: `--legend: 24px` missing (**false** — UX-DR28 cuts the legend footer, so the constant would size a surface that does not ship); Code Map keyframe line refs (**false** — the citation spans the rule and its keyframes); no test that state stays legible without motion (**false** — tokens.css carries no state); `head -c 9` off by one, the stale 17-test floor, and the frontmatter/body mismatch (all accurate but their fix edits this build's spec, which triage rejects); unbalanced-comment and missing-directory guards (unreachable in everyday use, and the fixes add machinery); `vite/client` widening the type surface (no harm named, and the fix hand-maintains what the pinned tool ships); perceptual distinctness of `--note` (needs a colour-distance implementation; kept as a manual check); reference restrictions on `--note` and `--radius-pill` (no consumer exists, so the fix would guard undemonstrated state); reduced motion across the app's cascade and the register split (surfaces and stories that do not exist yet); the `app.tsx` coverage gap (already recorded in `deferred-work.md`).

**Follow-up review recommended: true.** Four medium entries were patched on a first pass. The specific unverified risk is the broadened literal guard: `withoutReferences()` and the per-value exemption are new logic proven only against in-memory probes, and the sweep over the real tree is still vacuous because tokens.css is the only stylesheet. A false positive there would reject Story 1.9's first legitimate stylesheet; a false negative would let the literal class it was broadened for through. Patched counts by verdict: medium 4, low 5.

**Verification.** `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` all exit zero; the suite is 240 tests across 9 files (193 before this story). The verbatim block was confirmed byte-identical with `diff` against the mockup independently of the test that asserts it. `out/renderer/assets/*.css` contains both `--bg:#101317` and `party-side:240px`. `grep -rn 'var(--note)' src/` is empty; `288`, `prefers-color-scheme`, `prefers-contrast` and `forced-colors` appear nowhere in tokens.css; `head -c 8` is `  :root{`.

Three mutations were watched failing and reverted, the tree confirmed byte-identical after each: deleting the stylesheet import from `main.tsx` (fails the entry-chain test), retuning `--ink-doc` to `#b9c4d0` (fails the DESIGN.md value coupling), and retuning `@keyframes eq` (fails the mockup coupling).

**Residual risks.** The guard's real-tree sweep stays vacuous until the first component stylesheet, so its coverage is proven by probes rather than by use. `designValue()` is a hand-rolled reader over DESIGN.md's frontmatter: it fails loudly on a missing key, but a change to that file's formatting would break the coupling rather than silently weaken it. `--note`'s perceptual distinctness from `--accent` is a manual check that was not performed in this run.
