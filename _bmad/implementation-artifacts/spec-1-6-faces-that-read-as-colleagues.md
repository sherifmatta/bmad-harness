---
title: 'Faces that read as colleagues'
type: 'feature'
created: '2026-09-28'
status: 'done'
baseline_commit: '47a9642a4c77827f1a4678d0848477c2b78b03ba'
baseline_revision: '47a9642a4c77827f1a4678d0848477c2b78b03ba'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The portraits carry the product's entire premise — a room where a team visibly works — and they are its highest named risk: if they read as childish they take the perceived intelligence of the whole product with them. Nothing in the repo draws a face. Epic 1 orders this story early, beside the run-note feed, so that judgement lands before thirteen surfaces are built on top of it.

**Approach:** One pure DOM-free module for the parameters (curated five by agent id, everyone else derived from a salted FNV-1a hash), one component that draws the approved v2 geometry as JSX, the initials token that serves every reference below the 32px legibility floor, two component stylesheets spending only tokens, and a preview mount in `app.tsx` putting all four render sizes, a twelve-agent derived grid and a stacked initials row on screen — because this story's actual acceptance is a human looking at them.

## Boundaries & Constraints

**Always:**
- **Purity is hard and is the whole reason for the constraint** (FR74, `DESIGN.md:542`): no `id`, no `<defs>`, no gradient, no clip path, no filter, no mask, no `url(`, no external reference. Every shape is a flat fill or a stroke; shading is overlaid low-opacity shapes. Two portraits in one document must not be able to collide.
- `portrait` and `artParamsFor` are **pure** — no I/O, no global state, no assets, no wall clock. Same input, same output, asserted byte-identically.
- **The geometry is `portrait.html:216-309` (`portraitV2`), transcribed, not re-derived.** Every coordinate, opacity, stroke width and draw-order position is read off that function. Where it and `DESIGN.md` disagree, **`DESIGN.md` wins** (UX-DR14, `DESIGN.md:529`) — the three known disagreements are enumerated under *Design Notes*.
- **Sizes are a closed set — 32, 36, 38, 44** (FR79). Typed as a literal union so no code path can pass 20. The 20px case is the initials token's.
- Every `<svg>` carries `role="img"` and `aria-label="{name}, {title}"` at **every** size (FR73, EXPERIENCE.md:521). The join happens inside the component, so a caller cannot produce a label that is only a name.
- Curated art is keyed by **BMad agent id**, never by display name, title or icon: `bmad-agent-analyst` Mary, `bmad-agent-pm` John, `bmad-agent-ux-designer` Sally, `bmad-agent-architect` Winston, `bmad-agent-dev` Amelia (verified against `_bmad/config.toml:23-63`).
- Every value in both new stylesheets is reached through `var()`; they are swept by `guardedStylesheets()` the moment they exist (`tests/literal-guard.ts:166`), and every `var()` name must resolve against `tokens.css` (`tests/run-note-feed.test.ts:508`).
- Literal hex palettes and SVG geometry **in `.tsx` module scope and SVG attributes are legal and deliberate** — `tests/tokens.test.ts:739-797` pins that exemption open by name for this story. A literal inside a `style={{ }}` prop is not.

**Never:**
- Never render `icon` as a portrait, at any size, as a fallback or otherwise (FR80). No `icon` field exists on any type this story adds.
- Never render a face that reacts: one neutral expression at every `state` value (FR81). `state` is accepted by the signature and ignored by the drawing.
- Never add a `--portrait*`, `--tile*` or `--status-dot*` token — `tests/tokens.test.ts:431-435` asserts those name sets are empty.
- Never write the CSS property `outline` — the word itself, in any spelling or casing — anywhere under `src/`, **including inside a comment**. `tests/accessibility.test.ts:304` sweeps every file under `src/` whole and pins that word to `design/focus.css` alone, so a doc comment that merely mentions it fails the suite. (This spec lives under `_bmad/` and is not swept; source files are.) Opt into focus with `className="focus-stacked"`; add no `:focus` selector to a component stylesheet and no third rule to `focus.css`.
- Never add a third z-index. UX-DR10 fixes the product at two (`--z-scrim`, `--z-window`) and `tests/tokens.test.ts:438` asserts the count; the local stacking raise this story owns is solved without one (see *Design Notes*).
- Never add a motion declaration or a shadow. Motion is five declarations bound to real events (`DESIGN.md:694-704`) and shadows have exactly three jobs (UX-DR10); the mockup's tooltip transition and drop shadow are in neither inventory.
- No `dangerouslySetInnerHTML`, no markdown, no sanitizer, no new dependency, no jsdom.
- Do not build the persona tile, the status dot, the cast card or the chat header — they are Stories 1.9/1.10. This story mounts a preview, not a surface.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Curated agent | `artParamsFor('bmad-agent-dev')` | Amelia's curated params verbatim — `style:'bun'`, `fringe:'sweep'`, `glasses:'round'`, `eye:'#5c6b4a'` | No error expected |
| Derived agent | `artParamsFor('bmad-agent-qa')` | Params drawn from the constrained palettes by salted hash; identical on every call, run and machine | No error expected |
| Receding forces no fringe | derived id whose `style` is `receding` | `fringe === null`, and no hair-highlight arc is drawn | No error expected |
| State is ignored | same art and size, `state` cycled through all five values | Byte-identical markup for every value | No error expected |
| Every size | one art, sizes 32/36/38/44 | Same shape markup; only `width`/`height` differ; `viewBox` always `0 0 100 100` | No error expected |
| Two portraits, one document | two different agents rendered into one string | No `id`, `<defs>`, gradient, clip, filter, mask or `url(` in either — nothing that could collide | No error expected |
| Initials, two words | `name = 'Mary Jones'` | `MJ` | No error expected |
| Initials, one word | `name = 'Winston'` | `W` | No error expected |
| Initials, three words | `name = 'Ana Maria Ruiz'` | `AM` — first two only | No error expected |
| Initials, stacked | `stacked` set | Negative overlap, `panel-2` cut-out ring, `focus-stacked` class for the 3px offset | No error expected |
| Reveal parity | hover, and keyboard focus | The same name-and-role reveal fires on both, with no motion | No error expected |

</intent-contract>

## Code Map

Greenfield under one new directory, plus three edits — `tokens.css` (three tokens appended), `app.tsx` (the preview mount) and `tests/tokens.test.ts` (the new tokens coupled to DESIGN.md). Nothing else under `src/` changes.

**The geometry, read from the approved generator.**
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/mockups/portrait.html:216-309` — **`portraitV2`, the single source for every coordinate.** `:186-190` is `shade(hex, amt)`, clamped per channel. Transcribe; do not re-derive. `:193-214` is `portraitV1` — **superseded, do not read it for values**; it is in the file only for the side-by-side comparison the mockup draws.
- Draw order, fixed (`DESIGN.md:571`, and the order the function emits): backdrop → back hair mass → neck → jaw shadow → shoulders → collar notch → stroked V → crown → ears → face → contour shadow → cheek highlight → beard → fringe → hair highlight → brows → eyes → nose → mouth → glasses → earrings.
- `portrait.html:311-321` — the five curated `art` objects. Map to agent ids by the name+title pairs, which match `_bmad/config.toml:23-63` exactly. Only John carries a `crown` override (`{cy:33.5,rx:18.6,ry:17.6}`); the default is `{cy:35,rx:19.2,ry:19.6}`.
- `portrait.html:325-330` — `SKINS` (8 pairs), `HAIRS` (8), `EYES` (8), `FITS` (8 triples), `STYLES` (**six entries, `short` twice**), `FRINGES` (3, one of them `null`).
- `portrait.html:331-343` — `h32` (32-bit FNV-1a, offset `2166136261`, prime `16777619`, `Math.imul`, salted as `salt+":"+id`), `pick`, and `artParamsFor`. Salts: `skin fit style hair eye fringe beard beardk glass glassk ear`. Rates: beard `<32`, glasses `<34`, earrings `<28`, each modulo 100; the `k` salts choose `full`/`close` and `rect`/`round`.
- `portrait.html:373` — the twelve `bmad-agent-*` ids the derived grid uses, and `:374` the name derivation for their labels.
- `portrait.html:85-92` — the `.ini` disc: 20px, `--radius-full`, `initials-bg` on a 1px `initials-line` border, mono in `initials-ink`, `margin-right:-5px`, `box-shadow:0 0 0 1.5px var(--panel-2)`. `:93-99` is the reveal. `:105` is the 32px variant.

**The visual contract, read from DESIGN.md.**
- `DESIGN.md:193-199` (`components.portrait`) and `:200-209` (`components.initials`) — **the blocks the new tokens and assertions are read from at run time** via `componentBlock()` (`tests/tokens.test.ts:92-113`). `initials` carries `size`, `sizeUser`, `stackOverlap`, `stackRing`, `fontSize`; `portrait` carries `viewBox`, `radius`, `sizes`, `minLegibleSize`, `faceRatio`.
- `DESIGN.md:527-590` — the prose: art direction (`:535`), the 32px floor (`:536`), `icon` never a portrait (`:538`), construction and wrapper (`:540`), the hard purity list (`:542`), the v2 geometry shape by shape (`:546-569`), the parameter table (`:573`), derivation (`:575`), the signature (`:577`), and the initials token (`:581-587`).
- `DESIGN.md:420` — `ident` (11px) is the role that names **initials**; `:417` `micro` is 9.5px. `:431` — `--lh-none` exists **for the portrait wrapper**. `:654` — the focus ring and the 3px stacked offset. `:694-704` — the five motion declarations. `:714-725` — the Do/Don't rows for tokens, sizes and `icon`.
- `epics.md:130-139` (FR73–FR82), `:246` (UX-DR14), `:247` (UX-DR15), `:239` (UX-DR10), `:202` (NFR28), `:686-728` (the story). Read-only.

**The code this lands in.**
- `src/renderer/design/tokens.css` — `--initials-bg` `:81`, `--initials-line` `:82`, `--initials-ink` `:83`, `--panel-2` `:5`, `--radius-full` `:150` (`50%`), `--lh-none` `:115` (`0`), `--space-hair` `:156` (`1.5px`, the stack ring), `--rule-width` `:209` (`1px`, named for the job and meant to be reused), `--space-xs` `:158` (`5px`), `--space-sm-plus` (`7px`), `--space-md-plus` (`9px`), `--radius-control` `:146` (`4px`), `--fs-micro` `:96` (`9.5px`), `--fs-ident` `:99` (`11px`), `--fs-body-ui` `:100`, `--fs-label` `:98`, `--weight-strong` `:135`, `--mono` `:17`, `--sans` `:18`, `--text-strong` `:10`, `--dim` `:11`, `--panel-3` `:6`, `--line` `:7`. **Everything the two stylesheets need already exists except the three disc dimensions.** `:191-209` is the Story 1.5 precedent for admitting a component dimension, and the reasoning to follow.
- `src/renderer/design/focus.css:36-38` — `.focus-stacked:focus-visible` already ships the 3px offset; `tokens.css:260-265` states in prose that **the local stacking raise is this story's half**. The file is pinned at exactly two rules (`tests/accessibility.test.ts:248`) — add none.
- `tests/tokens.test.ts:431-435` forbids `--portrait*`/`--tile*`/`--status-dot*`; `:438` asserts exactly two z-indexes; `:234-236` already couples the initials colour trio to DESIGN.md; `:395-421` is the run-note precedent for coupling a new token to `componentBlock()` at run time, `toBeTypeOf('string')` guard first. `:517-527` asserts the selector list is exactly `[':root', ':root']` — append tokens, add no rule.
- `tests/tokens.test.ts:739-797` — `PORTRAIT_COMPONENT`, the probe that **holds the `.tsx` literal exemption open for this story**, with the comment "A blanket .tsx scan would make Story 1.6 unbuildable." Leave it untouched and green.
- `tests/literal-guard.ts:150-170` — `stylesheetsUnder()` recurses `src/renderer/`; a new `.css` is swept with no registration. `:209-226` scans only `style={{ }}` props in `.tsx`.
- `tests/accessibility.test.ts:42-47` `filesUnder(SRC)` walks every file under `src/`, comments included. `:304` pins the focus-stroke word. `:365-371` pins `aria-live`. `:383-393` is the only `role` rule: it fails a computed `role={…}` and anything matching `/^alert/i`, so a literal `role="img"` passes. **No rule touches `aria-label`, SVG, or `<title>`.**
- `src/renderer/ui/feed/run-note-feed.tsx` — the component house style: CSS side-effect import first in the local group, props typed inline in the signature, `: JSX.Element` return, kebab `block-element` classes and `block-element--modifier` built by template literal. `src/renderer/ui/feed/run-note.css` — the stylesheet house style: a file header naming the FR/UX-DR it serves, a comment per rule, and **no dimension named in any comment** so the file reads clean under a units grep.
- `src/renderer/ui/feed/memlog.ts` — the pure-module house style: named `export function`, `export type` aliases (never `interface`), annotated returns on private helpers too, justificatory doc comments citing the source of truth, British spelling, no semicolons, single quotes.
- `src/renderer/ui/app.tsx:8-21` — the preview-mount pattern: a module-scope constant, and a block comment opening `Story 1.5 scaffolding, replaced by the real shell in Story 1.9.` `:69-74` is the fragment it renders into. `tests/run-note-feed.test.ts:424` (`describe('the preview in force')`) is the precedent that keeps a preview from being deleted with the suite green.
- `src/renderer/ui/feed/run-note-feed.test.tsx:1-24` — the repo's only `.test.tsx`, and the comment explaining **why a `.tsx` test must live under `src/renderer/`**: `tsconfig.node.json` sets no `jsx`, so a `tests/**/*.tsx` would be typechecked by nothing. Rendering goes through `renderToStaticMarkup` from `react-dom/server`; `vitest.config.ts:7` is `environment: 'node'` and there is no DOM.
- `eslint.config.mjs:102-107` — View forbids only `src/main` and `src/preload`, and `files: src/renderer/ui/**` globs subdirectories, so a new `ui/persona/` directory needs no `LAYER_GRAPH` entry (`feed/` is the precedent).

## Tasks & Acceptance

**Execution:**
- `src/renderer/design/tokens.css` -- append `--initials-size:20px`, `--initials-size-user:32px` and `--initials-overlap:-5px` after the Story 1.5 block, with a comment citing `DESIGN.md:201-202` and `:208` and stating why they are here rather than in the component (same reason as the run note: NFR23 forbids the literal in any other stylesheet, and the spacing ladder carries no signed rung) -- the three disc dimensions are the only values this story needs that no token carries; no rule is added, so the `[':root', ':root']` assertion stays green
- `src/renderer/ui/persona/art-params.ts` -- the pure parameter module: `ArtParams` type, the five constrained palettes and the six-entry weighted `STYLES` list transcribed from `portrait.html:325-330`, `shade(hex, amt)`, `h32(str, salt)`, the `CURATED` map **keyed by agent id**, and `artParamsFor(agentId): ArtParams` returning curated params for the five and deriving for everyone else -- one entry point is what makes FR78's "the five carry curated parameters, every other agent derives" a single testable rule rather than a convention the caller has to remember
- `src/renderer/ui/persona/portrait.tsx` -- `portrait(art, size, state, identity): JSX.Element` returning the wrapper span and the `<svg viewBox="0 0 100 100" role="img" aria-label={`${identity.name}, ${identity.title}`}>` with the v2 geometry as JSX in the fixed draw order, `width`/`height` from `size`; `PortraitSize = 32 | 36 | 38 | 44`; `PersonaState` as the five-value union; `hairDark`/`hairLite`/`lite`/`dark` derived at render and never passed. Side-effect-import `./portrait.css` -- the literal union is what makes "no code path renders one at 20px" a compile-time fact rather than a test that can only sample
- `src/renderer/ui/persona/portrait.css` -- `.portrait` wrapper (`display:inline-block`, `line-height:var(--lh-none)`, `vertical-align:middle`) and `.portrait-face` on the svg (`border-radius:var(--radius-full)`, `display:block`). Nothing else -- the face's own colour is per-persona and belongs in the `.tsx` under the sanctioned exemption; the stylesheet carries only what DESIGN.md:540 puts on the wrapper and the svg
- `src/renderer/ui/persona/initials.tsx` -- `initialsOf(name)` (first letter of each of the first two whitespace-separated words, upper-cased) and `<Initials name title size stacked/>` rendering a `<span tabindex="0" role="img" aria-label="{name}, {title}">` carrying the glyphs and a reveal child with the name and role, with `focus-stacked` in the class list when stacked. Side-effect-import `./initials.css` -- `tabindex` and the reveal are FR82's whole point: a hover-only tooltip is the one affordance that fails completely without a mouse
- `src/renderer/ui/persona/initials.css` -- the disc at `--initials-size` / `--initials-size-user`, `--initials-bg` on `var(--rule-width) solid var(--initials-line)`, mono `--fs-micro` at 20px and `--fs-ident` at 32px in `--initials-ink`, `--radius-full`; stacked adds `margin-right:var(--initials-overlap)` and `box-shadow:0 0 0 var(--space-hair) var(--panel-2)`; the reveal is hidden by `visibility`+`opacity` and shown under **one selector list covering `:hover` and `:focus-visible` together**, with `position:relative` applied in that same rule and nowhere else. No transition, no shadow, no `z-index`, no `:focus` selector -- promoting the disc to a positioned element only while it is revealed is what lifts it and its reveal above every non-positioned sibling in paint order, which is the stacking raise `tokens.css:260-265` assigns to this story, obtained without the third z-index UX-DR10 forbids
- `src/renderer/ui/app.tsx` -- mount the preview behind a comment opening `Story 1.6 scaffolding, replaced by the real shell in Story 1.9.`: the five curated personas at all four sizes, a derived grid of the twelve ids at `portrait.html:373`, and a stacked initials row -- the story's acceptance is a human judgement against the mockup, and an unmounted generator cannot be judged
- `src/renderer/ui/persona/persona.test.tsx` -- the surface assertions via `renderToStaticMarkup`: purity across two portraits in one string; `role="img"` and the joined `aria-label` at all four sizes; `viewBox` constant while `width`/`height` track `size`; byte-identical markup across all five `state` values; the draw order asserted as an ordinal sequence over the shapes named in the Code Map; the four light-source shapes, the six per-eye shapes, the filled brows, the three-part nose, the lower-lip highlight and the highlight arc all present, and the arc **absent** for `receding`; `long`/`bun` drawing a back mass and `curly` drawing seven circles with two highlighted; and the initials matrix rows end to end including reveal parity -- these are the story's actual claims, and a source-text grep can only approximate them
- `tests/persona.test.ts` -- the pure-module and contract assertions: `artParamsFor` returns each of the five curated sets by agent id and derives for a sixth; determinism over repeated calls and a large id sample; `receding` forcing `fringe:null`; `STYLES` having six entries with `short` twice; the beard/glasses/earrings rates landing near 32/34/28% over a few thousand ids; `shade` clamping at both ends; `h32` matching FNV-1a on a known vector. Then the run-time couplings and source-text guards: `viewBox`, `faceRatio` and the size set read out of `componentBlock('portrait')` and compared with the code; no `icon` identifier anywhere under `src/renderer/ui/persona/`; both new stylesheets clean under the imported `literalsIn()`, free of `@media`, `:focus`, `z-index` and `transition`, with every `var()` resolving; and the component files free of `dangerouslySetInnerHTML` -- the render assertions cover behaviour, these cover the invariants that must survive a rewrite
- `tests/tokens.test.ts` -- assert `--initials-size`, `--initials-size-user` and `--initials-overlap` exist and equal `componentBlock('initials')`'s `size`, `sizeUser` and `stackOverlap` read at run time, and that the 20px glyph size equals its `fontSize` -- a transcribed `-5px` would drift silently, and the format-citation rule applies to the visual contract too

**Acceptance Criteria:**
- Given two different agents rendered into one document, when the markup is swept, then it contains no `id=`, `<defs`, `Gradient`, `clipPath`, `filter`, `mask`, `url(` or `xlink` — the collision surface is absent, not merely unused.
- Given any art and size, when `portrait` is called twice with identical arguments, then the two markup strings are byte-identical; and when `artParamsFor` is called twice with the same `agentId`, then the two results are deeply equal.
- Given the five curated agent ids from `_bmad/config.toml`, when their parameters are resolved, then each returns its curated set; and given any other id, when its parameters are resolved, then they are drawn from the constrained palettes by salted FNV-1a hash with `style` from the six-entry weighted list, `receding` forcing `fringe:null`.
- Given one art at 32, 36, 38 and 44, when each is rendered, then the shape markup is identical and only `width` and `height` differ, `viewBox` equals `componentBlock('portrait').viewBox` at run time, and no exported type admits the value 20.
- Given the same art and size with `state` cycled through all five values, when each is rendered, then every result is byte-identical — the dot carries state, the face does not.
- Given any portrait, when it is rendered at any size in the closed set, then its `<svg>` carries `role="img"` and an `aria-label` of exactly `{name}, {title}`, and no type this story adds carries an `icon` field.
- Given the approved geometry, when a rendered face is inspected, then the face path spans x 32.5→67.5 and y 24→70 — a ratio equal to `componentBlock('portrait').faceRatio` — all four light-source shapes are present, each eye carries its six shapes, the brows are filled paths rather than strokes, and the hair highlight arc is present for every style except `receding`, where it is absent.
- Given a stacked initials row, when a disc is hovered and when it is reached by keyboard, then the same name-and-role reveal appears in both cases, the disc carries `tabindex="0"`, `role="img"` and the `focus-stacked` class, and neither stylesheet contains a `z-index`, a `transition`, a shadow beyond the cut-out ring, or an `outline` declaration.
- Given `npm test`, when the literal sweep runs, then `portrait.css` and `initials.css` both appear in `guardedStylesheets()` and report no offence, every `var()` they spend resolves against `tokens.css`, and `tests/tokens.test.ts`'s `PORTRAIT_COMPONENT` probe is still empty and untouched.
- Given the whole source tree, when it is swept, then `outline` still appears only in `design/focus.css`, no `aria-live` exists outside `a11y/live-region.tsx`, no arrow-key literal exists outside `a11y/`, and `--z-` still names exactly two tokens.
- Given `npm run dev`, when the window opens, then the five curated faces render at 32/36/38/44, a twelve-agent derived grid renders beside them, and a stacked initials row renders below — the state the human review judges against `mockups/portrait.html`.
- Given `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, when each runs on a clean checkout, then all four exit zero, `tests/layering.test.ts` is untouched and green, and the suite is larger than the 368 tests Story 1.5 left behind.

## Spec Change Log

## Review Triage Log

### 2026-09-28 — Review pass
- verdicts: 42 findings — high 0, medium 11, low 31, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `artParamsFor` hands out a shallow copy, so the nested `crown` escapes by reference and `CURATED_AGENT_IDS` is a live mutable array — confirmed by execution: `artParamsFor('bmad-agent-pm').crown.cy = 999` corrupts the curated table for every later caller, under a doc comment promising the opposite. `crown` is now deep-copied and the id list frozen.
  - `[medium]` `[patch]` The FR74 purity sweep renders only Winston and Sally, who between them draw no glasses — the one branch emitting `<g>` and the only non-hex paint — leaving the element/attribute/paint allowlists vacuous over exactly the markup needing their `g` and `rgba` entries. Sweep now runs over `EVERYTHING` plus a round-glasses variant.
  - `[medium]` `[patch]` Purity was guarded only over rendered markup; the spec's source-level grep is a manual command CI never runs. A source-text collision sweep of the persona directory was added beside the existing `icon` sweep.
  - `[low]` `[reject]` `.initials` spends `--fs-micro` but drops `--track-micro`. DESIGN.md's `components.initials` block enumerates the disc's properties and letter-spacing is not among them; the mockup's `.02em` matches no token, so adding `.04em` would invent a value no source states.
  - `[low]` `[reject]` `.initials-reveal-role` puts the mono `label` rung on the sans stack. Real register friction, but the spine defines no sans 10.5px rung, so the fix needs a DESIGN.md amendment rather than a code correction.
  - `[low]` `[patch]` Only the 20px glyph size was coupled to DESIGN.md; the 32px one lives inside the `[ASSUMPTION]` comment `componentBlock()` strips. `tests/tokens.test.ts` now asserts `--fs-ident` against that comment text.
  - `[low]` `[patch]` `stackRing` and `border` from `components.initials` were asserted as literal strings rather than read at run time. Both now resolve through `componentBlock('initials')`.
  - `[medium]` `[patch]` Nothing pinned the portrait's class names: renaming `portrait-face` left the suite, lint and typecheck green while every face lost its circular clip and `display:block`. Now asserted in the rendered markup.
  - `[low]` `[reject]` `initialsOf('')` returns an empty disc and `word.slice(0,1)` splits an astral first character. No caller reaches either state — names come from the roster — and each fix adds a fallback branch.
  - `[low]` `[patch]` Every stacked disc kept its trailing `margin-right`, pulling whatever follows a row 5px over the final disc. The overlap is now scoped `:not(:last-child)` and split from the cut-out ring, which every disc still needs. The companion claim that `size={32} stacked` is type-legal was rejected: no caller does it and the guard would add a branch.
  - `[low]` `[reject]` `.initials-reveal` is absolutely positioned against a containing block that exists only on hover/focus. True, and harmless while `visibility: hidden` also applies; the fix restructures the rule for a state nothing reaches.
  - `[low]` `[patch]` The derivation rate assertions used `toBeCloseTo(x, 2)` (±.005), tighter than the ~.0067 sampling deviation, passing only because the id set is fixed. Widened to a three-sigma band with the reason stated.
  - `[low]` `[patch]` The salt separation test listed 9 of 11 salts, omitting `beardk`/`glassk` — the pair whose independence the module claims. All eleven now asserted. The stacked-row preview test asserted `size={32}`, the non-stacked disc; corrected. The stale `DESIGN.md:208` citation in this spec was rejected as a finding whose fix edits this build's spec.
  - `[medium]` `[patch]` Nested `crown` shared by reference — same defect as the first row, filed independently by a second layer; fixed by the same change.
  - `[low]` `[patch]` `CURATED_AGENT_IDS` exported mutable — same root cause; frozen.
  - `[low]` `[reject]` `shade()` on a shorthand, 8-digit or keyword colour yields a wrong tone. Every palette entry in the module is a `#rrggbb` literal and no caller supplies anything else; the guard adds a branch for an unreachable input.
  - `[low]` `[reject]` Empty or whitespace-only `name` gives a blank disc. Same unreachable state as above.
  - `[low]` `[reject]` An astral first character emits a lone surrogate. Same; no roster in this epic supplies one.
  - `[low]` `[reject]` Empty `identity` renders `aria-label=", "`. Identity comes from the resolved roster; no call site passes empty strings.
  - `[low]` `[reject]` A `crown` override is ignored for `curly` and `receding`. Faithful to the approved generator, and no curated persona pairs a crown with either style.
  - `[low]` `[reject]` `{ style: 'receding', fringe: 'sweep' }` passed straight to `portrait()` draws a fringe over a receding hairline. `artParamsFor` forces the null and is the only producer; the guard duplicates a rule that already holds at its source.
  - `[low]` `[reject]` A long name in the reveal card overflows under `white-space: nowrap`. The mockup carries the same nowrap, and a max-width plus ellipsis invents a dimension no source states.
  - `[low]` `[patch]` Trailing overlap on the last stacked disc — same defect as the row above; fixed by the same change.
  - `[low]` `[reject]` A disc keyboard-focused while the pointer hovers a later sibling leaves both positioned, so source order occludes the focus ring. Real but unusual, and the fix restructures the selectors or reaches for the third z-index UX-DR10 forbids.
  - `[low]` `[reject]` The cut-out ring is `panel-2` while the preview ground is `--bg`, so it reads as a halo there. The ring is faithful to `components.initials.stackRing`; the preview's ground is Story 1.9's, and giving the row one would add the layout this story's preview deliberately has none of.
  - `[low]` `[reject]` The persona-directory sweeps use a non-recursive `readdirSync`. No subdirectory exists; recursion guards a state nothing reaches.
  - `[low]` `[reject]` The stylesheet uses two rules where this spec's prose says "that same rule". Behaviour is equivalent — no single CSS rule can set a property on an element and on its descendant — and the fix would edit this build's spec.
  - `[medium]` `[patch]` Pre-verified gap: the portrait wrapper and face class names are pinned by nothing; renaming one shipped a square portrait with the whole suite green. Demonstrated by mutation, re-demonstrated after the fix.
  - `[medium]` `[patch]` Pre-verified gap: the reveal's card, name and role classes are pinned by nothing; renaming `initials-reveal-card` shipped an unstyled reveal green. Now asserted.
  - `[medium]` `[patch]` Pre-verified gap: the three new tokens were coupled to DESIGN.md's values but never asserted in the declarations they were promoted for — swapping `--initials-overlap` for `--space-xs` inverted the stacked row with the suite green. Each token is now asserted in its property, `--lh-none` included.
  - `[medium]` `[patch]` The discs painted 2px over contract at both sizes: `width`/`height` plus a 1px border under the default `content-box`, because the mockup's `*{box-sizing:border-box}` was never transcribed with the `.ini` rule. `box-sizing: border-box` added to `.initials`; confirmed no `box-sizing` existed anywhere in `src/`.
  - `[low]` `[reject]` `flex: 0 0 auto` on `.initials` is inert until Story 1.9 puts a flex row around it. Harmless and correct in advance; deleting it would have to be undone.
  - `[medium]` `[patch]` The derivation tests restate the same palettes the implementation holds, so they pin against regression but not against a shared transcription error. Closed by the mockup cross-check below.
  - `[medium]` `[patch]` No assertion read `mockups/portrait.html`: the geometry and derivation tests hardcoded what the implementation hardcodes, so the suite would stay green against a wrong transcription. A test now extracts the mockup's own generator at run time and compares parameters over its twelve ids and a 600-id population covering every palette entry. Verified by mutation: mistyping one palette hex now reddens three tests.
  - `[low]` `[reject]` Every CSS claim is asserted as source text rather than behaviour. True and unavoidable: the suite is `environment: 'node'` and this spec forbids adding jsdom; Story 1.9 owns that decision.
  - `[low]` `[patch]` The preview's twelve derived ids were checked only for count and disjointness, not against the mockup's own list. Now read from `portrait.html` at run time.
  - `[low]` `[reject]` FR80 is guarded by a word sweep rather than a rendering check. Structural by design — the field has nowhere to sit, which is the cheaper and stronger guarantee.
  - `[low]` `[reject]` The story's stated acceptance — a human confirming the faces read as colleagues — is not discharged by the diff. Correct, and named as such in this spec's manual checks; it cannot be discharged by an unattended run.
  - `[low]` `[reject]` The preview is layout-free while the reference mockup presents cards and a labelled grid, so the population judgement is made against a different presentation. Deliberate: the preview carries no layout so none of it is mistaken for Story 1.9's shell.
  - `[low]` `[reject]` Determinism "across sessions and machines" is asserted within one process. Sound by construction — `charCodeAt` and `Math.imul` are machine-independent — and no cross-machine harness exists to assert it in.
  - `[low]` `[reject]` The FRs name call sites (transcript, tile, chat header, cast card) that have no instance in this diff. Epic sequencing: those surfaces are Stories 1.9 and 1.10, and this story's boundaries exclude them.
  - `[low]` `[patch]` Not from a review layer — found while reading the diff: the preview's user avatar and one test fixture used a real person's name, invented from session context rather than supplied by any planning document. Both replaced with a neutral placeholder.

## Design Notes

**Where the mockup and DESIGN.md disagree, and what ships.** UX-DR14 and `DESIGN.md:529` both say the spine wins. Three disagreements are live:
1. `portrait.html:92` draws focus with a 2px-offset stroke and `z-index:5`. `DESIGN.md:654` fixes one focus treatment for every primitive, `design/focus.css` already owns it, and `tests/accessibility.test.ts:304` makes any local restatement a test failure. **Ships:** `className="focus-stacked"` and nothing else.
2. `portrait.html:98` transitions the reveal over `.12s` and `:99` gives it a drop shadow. Motion is five declarations bound to real events (`DESIGN.md:694-704`) and shadows have three jobs (UX-DR10); a tooltip is in neither list. **Ships:** an instant reveal on `panel-3` with a `line` border, no transition, no shadow.
3. `portrait.html:88` sets the 20px glyph at `9px`; `DESIGN.md:207` says `9.5px`, which is the `micro` rung of a scale whose half-points are explicitly real (`:412`). **Ships:** `--fs-micro`.

**The stacking raise, without a third z-index.** `tokens.css:260-265` hands this story a real problem: the next disc's `-5px` overlap and `panel-2` cut-out ring paint over the focused disc's ring, and UX-DR10 forbids the `z-index:5` the mockup reaches for. The answer is that it never needed a z-index. A `position:relative` with no offsets moves nothing, but it promotes the element into the painting step that runs *after* every non-positioned inline sibling — so a disc that is positioned only while hovered or focused paints above its neighbours on both sides regardless of source order, and takes its reveal with it. Applying `position` in the same rule that shows the reveal is therefore not a convenience: it is the mechanism, and it is why that rule must be the only place either appears.

**The fourth argument, and why the stated signature is not being widened for convenience.** `DESIGN.md:577` and FR73 name `portrait(artParams, size, state)`, and that paragraph's whole subject is `state` — it exists to promise that reactive faces need no signature change later. Meanwhile `DESIGN.md:540` and EXPERIENCE.md:521 require the `<svg>` to carry `aria-label="{name}, {title}"`, and FR77 fixes the `ArtParams` domain as a closed table with no name and no title in it. All three hold only if identity arrives as its own argument — which is what the approved generator already does (`portraitV2(a, size, label)`). The three named parameters keep their names and positions and identity is appended; it is taken as `{name, title}` rather than a pre-joined string so the component owns the join and the AC's format cannot be violated by a caller, which is exactly how the mockup's own call sites drift (`:346` passes a bare name, `:347` passes both).

**Why `state` is the five-value union.** The face ignores it either way, so nothing observable turns on the choice; the union is taken because `DESIGN.md:589-600` already fixes those five as the state vocabulary, and a union makes "every state value" an enumerable set the determinism test can exhaust rather than sample.

**Why the palettes are literal hex in a `.tsx` and this is not an NFR23 defect.** `tests/tokens.test.ts:739-797` anticipated this story by name and pinned the exemption open with a probe. The reasoning holds: these are not design-system values a component is restating — they are the generator's own data, eight skins and eight hairs that exist nowhere in the token file and must not, because the portrait is the only per-persona colour in the product (`DESIGN.md:391`) and the ramp it sits inside is a different thing from the faces it holds.

## Verification

**Commands:**
- `npm test` -- expected: all green, more than 368 tests; `src/renderer/ui/persona/persona.test.tsx` asserts the rendered faces and `tests/persona.test.ts` covers the matrix, the derivation rates and the source-text guards
- `npm run lint && npm run typecheck && npm run build` -- expected: all four exit zero. `typecheck:web` proves the `.tsx`, the CSS imports and the size union resolve; `typecheck:node` proves nothing under `persona/` pulled in a DOM type
- `npm run dev` -- expected: five curated faces at 32/36/38/44, a twelve-agent derived grid, and a stacked initials row on the dark ground
- `grep -rni outline src/ | grep -v 'design/focus.css'` -- expected: no output
- `grep -rnE '<defs|Gradient|clipPath|filter=|mask=|url\(|xlink| id=' src/renderer/ui/persona/` -- expected: no output
- `grep -rnE '[0-9]+(px|rem|em|%)' src/renderer/ui/persona/*.css` -- expected: no output
- `grep -rnE 'z-index|transition|:focus|box-shadow' src/renderer/ui/persona/initials.css` -- expected: only the single `box-shadow` cut-out ring line
- `node -e "…"` comparing this build's `artParamsFor` against `portrait.html:331-343` run verbatim over the twelve derived ids -- expected: identical parameter objects, which is the only check that proves the transcription rather than re-asserting it

**Manual checks (what no test covers):**
- **The judgement itself, and the story's actual acceptance.** Open `npm run dev` beside `mockups/portrait.html` in a browser and compare at all four sizes plus the derived grid: does each face read as a plausible colleague who could sit in a staff directory without comment, or as a cartoon? **This cannot be discharged by an unattended run** — it needs a human at the window, and FR75 is the one requirement in this epic that no assertion can stand in for. The decision is recorded in the walkthrough, not here.
- The derived grid as a population: do twelve strangers read as one company — same muted range, same lighting, same construction — or as twelve unrelated illustrations?
- The stacked initials row under keyboard focus: tab through it and confirm the ring is whole on every disc, including the ones with a neighbour on each side.

## Auto Run Result

Status: done

**What was implemented.** The portrait generator and the initials token ship as one pure parameter module, two components, two component stylesheets, and a preview that puts every render size, a twelve-agent derived grid and a stacked initials row on screen. `art-params.ts` transcribes the approved generator's five constrained palettes, its salted FNV-1a hash and its curated five — rekeyed from the mockup's first names to BMad agent ids, verified against `_bmad/config.toml`, because a name is a label the roster can change and an id is what the install is. `artParamsFor` is the single entry point, so FR78's rule that the five carry curated art and everyone else derives is one testable fact rather than a convention each call site has to remember. `portrait.tsx` draws the v2 geometry as JSX in the fixed draw order, deriving `hairDark`/`hairLite`/`lite`/`dark` at render so a face cannot be handed a light source that disagrees with its own skin; its size union makes "no code path renders at 20px" a fact the compiler checks. `initials.tsx` carries `tabindex`, `role="img"` and the joined label, with the reveal firing through one selector list so hover-and-focus parity is structural rather than two rules that have to agree.

**Files changed.**
- `src/renderer/ui/persona/art-params.ts` — new; the parameter domain, the palettes, the hash, the curated five.
- `src/renderer/ui/persona/portrait.tsx` — new; the v2 geometry, in its fixed draw order.
- `src/renderer/ui/persona/portrait.css` — new; the wrapper and the face, two rules.
- `src/renderer/ui/persona/initials.tsx` — new; the disc, its label and its reveal.
- `src/renderer/ui/persona/initials.css` — new; the disc at both sizes, the stack, the reveal.
- `src/renderer/ui/persona/persona.test.tsx` — new; the rendered-markup assertions.
- `tests/persona.test.ts` — new; the pure modules, the mockup cross-check, the stylesheet and source guards.
- `src/renderer/design/tokens.css` — `--initials-size`, `--initials-size-user`, `--initials-overlap`.
- `src/renderer/ui/app.tsx` — the preview mount, marked as Story 1.9's to remove.
- `tests/tokens.test.ts` — the three tokens coupled to DESIGN.md at run time.

**Review findings.** 42 findings across four layers — 0 high, 11 medium, 31 low, 0 false. Twenty rows patched in thirteen grouped entries; twenty-two rejected.

The six that mattered: the discs painted 2px over contract at both sizes, because the mockup's `*{box-sizing:border-box}` was never transcribed with the `.ini` rule and no DOM-less test can see a box model; `crown` escaped `artParamsFor` by reference under a doc comment promising it could not, with a test that mutated the one field that does not escape; the class names connecting both components to their stylesheets were pinned by nothing, so renaming `portrait-face` shipped a square portrait with shoulders painting into the corners; the three new tokens were coupled to DESIGN.md's values but never asserted in the declarations they were promoted for, so swapping `--initials-overlap` for `--space-xs` inverted the stacked row; the FR74 purity sweep rendered two faces that skip the glasses branch — the only one emitting `<g>` and the only non-hex paint — leaving its allowlists vacuous over exactly the markup they exist for; and no assertion anywhere read `mockups/portrait.html`, so the geometry and derivation tests restated the implementation instead of checking it.

Rejected, with reasons: the guards against states nothing reaches — `shade` on a malformed hex, an empty or emoji-leading name, an empty identity, a fringe passed directly with a receding hairline, a crown override on a curly style, a non-recursive directory sweep — each of which adds a branch for an input no producer emits; the reveal card's `nowrap` overflow and the missing `--track-micro`, both of which would invent a dimension no source states; `--fs-label` on the sans stack, which needs a DESIGN.md amendment rather than a code change; the focused-disc-plus-hovered-sibling occlusion, whose fix restructures the selectors or reaches for the third z-index UX-DR10 forbids; the cut-out ring reading as a halo on the preview's `--bg` ground, since the ring is faithful to the spine and the ground is Story 1.9's; `flex: 0 0 auto` being inert until a flex row exists around it; two findings whose fix edits this build's spec; and six descriptive observations from the intent-alignment layer that name the epic's own sequencing or the DOM-less suite this spec forbids replacing.

**Follow-up review recommended: true.** Six `medium` entries were patched on a first pass. The specific unverified risk is the disc geometry: `box-sizing` and the split of the cut-out ring from the overlap both changed how a stacked row lays out, both were introduced during triage rather than during planning, and the suite runs in `environment: 'node'` where no assertion can observe a box model. Nothing outside a source-text check has exercised the row's actual appearance at 20px with its ring and its focus ring together — which is also the one case `tokens.css:260-265` handed this story and called unverified. Patched counts by verdict: high 0, medium 11, low 9.

**Verification.** `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` all exit zero; the suite is **462 tests across 15 files** (368 across 13 before this story). Every spec sweep is clean: `outline` appears only in `design/focus.css`, the collision surface appears nowhere under `persona/`, no unit literal appears in either new stylesheet, and `icon` is named nowhere in the directory.

The transcription was proved rather than asserted, twice and independently of the implementation's own report. All twenty SVG path `d` strings were compared against `portraitV2` and match exactly; the only fixed-hex difference is the mockup's `a.eye || '#5a4332'` fallback, unreachable here because `eye` is required. The mockup's own `artParamsFor` was extracted and run beside this build's over the twelve derived ids — identical — and over 20,000 synthetic ids the rates land at beard 32.2%, glasses 33.8% and earrings 27.9% against the specified 32/34/28, with `short` at 33.2% confirming the six-entry weighting and no `receding`-with-fringe leak.

Five mutations were watched failing and reverted, each of which had previously left the suite green: renaming `portrait-face`, swapping the overlap token, mistyping one palette hex (three failures), deleting `box-sizing`, and undoing the `crown` deep copy. Two tests added during triage were themselves faulty and were corrected before they could pass vacuously — a population-coverage assertion guessing a tuple count that the derivation does not produce, replaced by the per-palette coverage the test's own comment claims; and a source-level purity sweep that matched the word "gradient" in `portrait.tsx`'s own explanatory comments, the same trap the `outline` rule sets, resolved by rewording the comments rather than weakening the sweep.

**Residual risks.** FR75 is undischarged and cannot be discharged here: whether these faces read as plausible colleagues or as a cartoon is the story's stated acceptance and needs a person at `npm run dev` beside `mockups/portrait.html`, at all four sizes plus the derived grid. Nothing in this run is evidence about that question. Beyond it, every CSS claim in the suite is asserted as source text rather than as behaviour, because the suite has no DOM and this spec forbids adding one — so the hover-and-focus parity, the stacking raise and the cut-out ring are proved by selectors appearing in the file, not by a rendered row. Story 1.9 owns the decision that would change this.
