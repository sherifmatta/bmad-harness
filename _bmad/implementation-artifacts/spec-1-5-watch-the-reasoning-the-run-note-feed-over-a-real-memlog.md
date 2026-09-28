---
title: 'Watch the reasoning — the run-note feed over a real memlog'
type: 'feature'
created: '2026-09-27'
status: 'done'
baseline_commit: '5051ae2aefd6b432eb2ccedbab809de295157ab4'
baseline_revision: '5051ae2aefd6b432eb2ccedbab809de295157ab4'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `epics.md:661` states thirteen distinct memlog kinds occur across this
      repository's memlogs. The real number is nineteen, and the enumeration
      omits the second most common kind in the corpus.
    evidence: |-
      Measured across all five `.memlog.md` files (267 entries): decision 92,
      idea 35, event 30, constraint 24, insight 13, capability 12, question 9,
      change 8, assumption 8, version 6, technique 6, outcome 4, note 4, gap 4,
      direction 4, moment 3, callback 3, override 1, dynamic 1 — nineteen kinds.
      Excluding the party-mode memlog it is still fifteen. `epics.md:663`
      enumerates thirteen names and omits `idea` (35 occurrences) and `insight`
      (13). The story's mapping is unaffected because `:664` routes every other
      kind to neutral, so the rule stays total — but the Given is false, and an
      acceptance criterion asserting thirteen would fail against the real files.
      This is a fourth instance of the mis-specified-external-format class that
      Story 1.13 exists to correct; `epics.md` is frozen for build stories, so
      the amendment belongs to that story, not here.
    severity: low
  - summary: >-
      A kind wider than the 74px chip column overflows it, and the vocabulary
      FR41 keeps open is exactly what would produce one.
    evidence: |-
      `src/renderer/ui/feed/run-note.css` fixes the column at
      `var(--run-note-kind)` with `justify-self: start` and no truncation or
      wrapping. The longest kind in the corpus is ten characters
      (`capability`, `constraint`, `assumption`), which fits, so nothing today
      demonstrates it — but FR41's whole promise is that a kind shipped by a
      future BMad release renders. The fix is a design ruling no source makes:
      truncate with an ellipsis, wrap and break baseline alignment, or let the
      column flex. DESIGN.md fixes the grid at `58px 74px 1fr`, so widening it
      is not available either.
    location: >-
      src/renderer/ui/feed/run-note.css:70
    severity: low
  - summary: >-
      A reason carrying an unbreakable long token widens the row instead of
      wrapping, because the reason cell never sets `min-width: 0`.
    evidence: |-
      Grid items default to `min-width: auto`, so the `1fr` track cannot shrink
      below its longest unbreakable token. Real entries reach 1216 characters
      and carry long slugs (`brainstorm-bmad-visual-harness-2026-09-22`,
      mockup filenames). At the preview's full window width nothing overflows,
      so it is unreachable today; it becomes reachable the moment Epic 3 puts
      the feed inside the document card. The fix pairs `minmax(0, 1fr)` with an
      `overflow-wrap` ruling, and which wrapping behaviour a reason takes is a
      design decision that belongs with the card.
    location: >-
      src/renderer/ui/feed/run-note.css:33
    severity: medium
  - summary: >-
      The feed carries no list semantics, so a screen reader reads each row as
      one run-on line beginning with a blank.
    evidence: |-
      Rows are bare `div`/`span` with no list structure and no per-row
      grouping, and every row opens with an empty `run-note-time` span. Story
      1.4 established the accessibility floor, but this story's constraints
      only say what must *not* appear (`aria-live`, arrow keys, `outline`);
      nothing in DESIGN.md, EXPERIENCE.md or epics.md specifies the feed's
      semantics. Static roles are permitted by the sweeps, so `role="list"` /
      `role="listitem"` is available — but choosing it, and deciding whether
      the empty time cell should be hidden from the tree, is a ruling no
      source has made. It belongs with Story 1.9, which first mounts the feed
      on a real surface.
    location: >-
      src/renderer/ui/feed/run-note-feed.tsx:33
    severity: medium
  - summary: >-
      The preview couples the renderer build to a dated planning path, and
      inlines this repository's own planning content into the bundle.
    evidence: |-
      `src/renderer/ui/app.tsx` `?raw`-imports
      `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/.memlog.md`,
      and the same dated slug appears in three files. Moving or renaming that
      artifact breaks `npm run build`, not merely a test. The mount is
      scaffolding the file's own comment assigns to Story 1.9 for removal;
      recorded here because nothing in the verification path would notice if
      it outlived that story.
    location: >-
      src/renderer/ui/app.tsx:4
    severity: low
  - summary: >-
      The 230px card-body scroll behaviour is never exercised, and real reason
      lengths make it the acceptance criterion most likely to fail.
    evidence: |-
      Reason lengths in the named memlog run 26 / median 463 / max 1216
      characters. At the card's eventual reason-column width a median row is
      several lines and the longest row plausibly exceeds the whole 230px body
      on its own. The story's AC says "the card body's *eventual* 230px scroll
      behaviour", and the card is Epic 3's, so the intent defers it — but the
      criterion cannot be judged until something renders the feed inside a
      230px box.
    severity: medium
  - summary: >-
      The emphasis treatment is implemented but never fires over real data, so
      the contrast the story asks a human to judge does not appear.
    evidence: |-
      FR40, UX-DR20 and DESIGN.md:631 require the load-bearing clause at 600 in
      `text` against the reason's `dim`. The mockup's emphasis is hand-authored
      `<b>`. Across 267 real entries there is one `**` marker, and the named
      fixture has none — so in the mounted preview the reason column is
      uniformly `dim` at 400. `emphasisSpans` is correct and covered, but the
      question the story exists to answer — does claim-against-grounds read as
      reasoning? — cannot be asked of the surface as shipped. Settling it needs
      either a writer that marks the clause or a ruling that the emphasis is
      dropped.
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The product's central claim — you watch *why* a run decided things rather than being told afterwards — has never been rendered. Nothing in the repo parses `.memlog.md`, and until the feed is on screen over a real memlog nobody can judge whether the treatment is thrilling or merely a changelog. Epic 1 orders this story early precisely so that judgement lands before thirteen surfaces are built on top of it.

**Approach:** Three pure, DOM-free modules (parse a memlog into notes, map a kind to one of three treatments, split a reason into emphasis spans), one thin `.tsx` that renders them on the `58px · 74px · 1fr` grid, one component stylesheet spending only tokens, and a temporary preview mount in `app.tsx` so `npm run dev` shows the feed over this repo's own UX memlog. The parser is unit-tested against the real file by path, which is also how the acceptance criteria cite the format rather than restating it.

## Boundaries & Constraints

**Always:**
- The kind vocabulary is **open**. `decision` → accent, `assumption` → neutral, `question`/`gap` → warm friction, **every other kind, including an absent one, → neutral**. A kind nobody has seen yet must render, not throw (FR41, `epics.md:83`).
- Every row emits **three grid children in every case**, so an absent time leaves column one empty rather than shifting the kind into it (FR40 `epics.md:82`, UX-DR20 `epics.md:252`).
- The register split is the *only* separator between the two feeds: time and kind in `mono`, reason in `sans`. No container, rule, label or background may be added to help (UX-DR9 `epics.md:238`, `DESIGN.md:406`, `:719`).
- Every value in the new stylesheet is reached through `var()`. The file is swept automatically by `guardedStylesheets()` (`tests/literal-guard.ts:166-170`); `tokens.css` is the one file entitled to literals (`tokens.css:36-38`).
- The three new tokens take their values from `DESIGN.md`'s `components.run-note` block **read at run time**, not transcribed — the same coupling `tests/tokens.test.ts` already holds for colours and radii.
- Reason text is rendered as React children only. Never `dangerouslySetInnerHTML`: project content is untrusted the moment it is rendered.
- The parser carries **no DOM types**. `tests/*.test.ts` imports it into the node program, which has no DOM lib (`tsconfig.node.json:5`) — the same constraint `roving-tabindex.ts:9-13` states.

**Never:**
- No `outline` anywhere in any new file, including comments — `tests/accessibility.test.ts:304-310` pins the word to `focus.css` alone.
- No `aria-live` attribute; announcing is `Announcer` + the existing `LiveRegion`, and NFR22 is not in this story's **Implements** line (`epics.md:653`).
- No `ArrowUp/Down/Left/Right` literal — banned outside `src/renderer/ui/a11y/` (`tests/accessibility.test.ts:138-147`). This story adds no keyboard navigation; the feed is not a tab-stop list in any source.
- Do **not** port the mockup's `@media (max-width:640px)` collapse (`document-card-dead-air.html:168-171`) — NFR27 fixes the product at two breakpoints, 1180px and 1000px (`epics.md:201`).
- No markdown engine, no `markdown-it`, no `dompurify`. The only inline marker the format carries is `**…**`; a splitter returning React spans is both smaller and strictly safer than an HTML pipeline.
- No jsdom, no testing-library, no new dependency. Story 1.9 owns that decision (`deferred-work.md`, the `app.tsx`/jsdom item). `renderToStaticMarkup` is not an exception to this: it is the already-pinned `react-dom`'s node entry, returns a string, and touches no `document`.
- Do not build the document card, its 230px scroll, or its `11px 13px` padding. The card body is Epic 3; this story ships the rows it will contain.
- Do not derive the emphasised clause heuristically. No source defines "the substantive phrase"; inventing a rule would be fantasy. Emphasis is rendered where the text marks it and nowhere else.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tagged entry | `- (decision) Scope fixed to EU-only` | `{kind:'decision', author:null, time:null, reason:'Scope fixed to EU-only'}` | No error expected |
| Authored entry | `- (idea by user) FACT: the stall is …` | `kind:'idea'`, `author:'user'`, author absent from `reason` | No error expected |
| Kindless author | `- (by coach) …` | `kind:null`, `author:'coach'`, neutral treatment | No error expected |
| Untagged entry | `- spines finalized` | `kind:null`, `author:null`, full line as reason | No error expected |
| `)` inside reason | `- (event) Create from brainstorm (its memlog); slug inherited` | Tag ends at the **first** `)`; reason keeps both parens | No error expected |
| Author containing ` by ` | `- (idea by van by der) x` | Split on the **last** ` by `; author `van by der` | No error expected |
| Empty reason | `- (kind) ` (writer permits via `--text ""`) | `reason:''`, row still renders three children | No error expected |
| Frontmatter | Leading `---` … `---` block | Skipped entirely; fences are never entries | No error expected |
| Body non-entry line | A line not starting with `- ` | Ignored, not rendered | No error expected |
| Kind casing | `- (Decision)` / `- ( decision )` | Lower-cased and trimmed before treatment lookup | No error expected |
| Unknown kind | `- (moment) …` | Renders; treatment `neutral` | No error expected |
| Emphasis present | `Scope fixed to **EU-only for v1** — …` | Three spans; middle one emphasised | No error expected |
| Unmatched marker | `a ** b` | One unemphasised span; markers left as literal text | No error expected |
| Empty file / no entries | frontmatter only | `[]`; the feed renders nothing and does not throw | No error expected |

</intent-contract>

## Code Map

Greenfield except two edits — `tokens.css` (three tokens appended) and `app.tsx` (the preview mount). Nothing else under `src/` changes.

**The format, read from the files — not from any planning document.**
- `_bmad/scripts/memlog.py:164-177` — `cmd_append`, the whole writer. `:167` collapses whitespace (`" ".join(args.text.split())`), so **a multi-line entry is structurally impossible**. `:170` is the attribution: `label = f"{label} by {args.by}".strip()` — the `.strip()` is why the kindless `(by author)` form exists. `:171` emits the tag only `if label`, so `- ()` is unreachable. `:173` always appends at the end: file order **is** time order, newest last.
- `_bmad/scripts/memlog.py:209-210` — `--type` and `--by` are free strings with no `choices=`. This is the executable proof behind FR41's "open, not closed"; `:11-12` and `:59` state it in prose.
- `_bmad/scripts/memlog.py:110-113` (`render`) and `:90-107` (`split`) — frontmatter is `---`, `key: value` lines, `---`, one blank line, then the body. Only `updated` is guaranteed present. **The fences match `^-` but not `^- `**, which is why the parser keys on dash-space, as the writer's own `entry_count` does at `:132-133`.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/.memlog.md` — **the fixture the first AC names** (`epics.md:657`). 41 lines: 4 frontmatter, 1 blank, **36 entries** on lines 6-41. Entry length spans 26 → 1216 characters. It carries **zero** `by`-author entries and **zero** `**` markers, so it exercises neither attribution nor emphasis — both need constructed input.
- **Kind counts, measured across all five memlogs (267 entries):** `decision` 92, `idea` 35, `event` 30, `constraint` 24, `insight` 13, `capability` 12, `question` 9, `change` 8, `assumption` 8, `version` 6, `technique` 6, `outcome` 4, `note` 4, `gap` 4, `direction` 4, `moment` 3, `callback` 3, `override` 1, `dynamic` 1 — **19 distinct kinds, not the thirteen `epics.md:661` claims**. The enumeration at `:663` omits `idea` (the second most common kind in the repo) and `insight`. The AC's rule is still total because `:664` routes *every other kind* to neutral, so the mapping is unaffected — but **no test may assert the number thirteen**. Recorded as a format correction for Story 1.13 under `deferred`.
- `_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/.memlog.md` — the only file with `(kind by author)`: 59 of its 68 entries. Authors observed are exactly `user` and `coach`. Use it as the attribution fixture.

**The visual contract, read from DESIGN.md.**
- `DESIGN.md:242-252` — the `components.run-note` frontmatter block: `grid: '58px 74px 1fr'`, `gap: '{spacing.lg}'`, `rule: '1px solid {colors.line-soft}'`, `time`, `kindFont`, `kindRadius`, and the three kind treatments. **This is the block the new tokens are read from at run time.**
- `DESIGN.md:620-624` — the prose spec, and the **only** source for the `5px` vertical row padding; UX-DR20 omits it.
- `DESIGN.md:626` — time is `mono` at `{typography.meta}` **in `faint`**, `tabular-nums` required. Note the trap: `epics.md:675` says "in mono at `meta`", which is the 10px typography *role*, not the `--meta` colour token. The colour is `--faint`; `DESIGN.md:246` and the mockup at `document-card-dead-air.html:106` both agree.
- `DESIGN.md:627-630` — the kind tag: micro mono, `.04em`, chip radius, `0 5px`, `justify-self:start`, and the three treatments. `:629` — **`kind:note` must not use `{colors.note}`**, which belongs to the status dot. The `kind:` prefix is notation; the tag renders `decision`, not `kind:decision`.
- `DESIGN.md:631` — the reason: sans `body-ui` in `dim`, emphasis in `text` at 600.
- `DESIGN.md:439` — uppercase is confined to five surfaces, none of them the kind tag. The mockup confirms by contrast: `.band .bl` carries `text-transform:uppercase` at `document-card-dead-air.html:124` and `.mrow .k` deliberately does not.
- `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/mockups/document-card-dead-air.html:103-119` — **the only run-note markup precedent in the repo.** `:105` is the grid, `:119` is `.mrow + .mrow{border-top:…}` — adjacent-sibling, so no leading or trailing rule on the feed. `:115` is `.mrow .x b{color:var(--text); font-weight:600}`, the emphasis. `:232-238` is the markup; every row there carries a timestamp, so **the empty-time case is drawn nowhere**. `:168-171` is the 640px collapse that must not be ported.
- `epics.md:82` (FR40), `:83` (FR41), `:238` (UX-DR9), `:252` (UX-DR20), `:201` (NFR27), `:647-684` (the story). Read-only.

**The code this lands in.**
- `src/renderer/design/tokens.css:143` `--radius-hairline:1px` is a **radius**, not a border width, and `:156-165`'s spacing ladder has no `1px` rung — so `border-top: 1px solid var(--line-soft)` has no token to spend today and the literal guard's `dimension` rule (`tests/literal-guard.ts:43-46`) flags bare `px` with a `var()` exemption that covers only `font stack` and `radius`. A width token is required, not optional.
- `src/renderer/design/tokens.css` — `--fs-meta:10px` `:97`, `--fs-micro:9.5px` `:96`, `--fs-body-ui:11.5px` `:100`, `--lh-base:1.55` `:112`, `--track-micro:.04em` `:126`, `--weight-strong:600` `:135`, `--radius-chip:3px` `:145`, `--space-xs:5px` `:158`, `--space-lg:10px` `:163`, `--faint` `:12`, `--dim` `:11`, `--text` `:9`, `--line` `:7`, `--line-soft` `:8`, `--panel-2` `:5`, `--accent`/`--accent-bg` `:13`, `--accent-border` `:69`, `--disagree` `:63`, `--disagree-border` `:64`, `--disagree-bg` `:65`, `--mono` `:17`, `--sans` `:18`. **Every colour, size and radius this story needs already exists.** Only the two column widths and the rule width do not.
- `tests/tokens.test.ts:517-527` asserts tokens.css's selector list is exactly `[':root', ':root']` — appending tokens keeps that green; adding a *rule* would not. `:683-691` sweeps every guarded stylesheet; `:790-796` sweeps inline `style={{}}` in every `.tsx`; `:798-800` asserts `componentsUnder()` still contains `app.tsx`, so it must not be deleted.
- `tests/literal-guard.ts:161-170` — `allStylesheets()` / `guardedStylesheets()` recurse `src/renderer/` and exempt only `tokens.css`. **A new `.css` is swept with no registration.** `fr` is not in the `dimension` rule's unit list, so `1fr` is legal; unitless `0` is legal.
- `tests/accessibility.test.ts:42-47` `filesUnder(SRC)` walks **every file under `src/`, every extension, comments included** — the source of the `outline` and arrow-key bans.
- `src/renderer/ui/a11y/roving-tabindex.ts:9-13` — the stated reason a renderer module stays DOM-free, and the precedent for `tests/*.test.ts` importing one (`tests/accessibility.test.ts` imports it directly, but reads `live-region.tsx` only as text via `readFileSync`). **No test in `tests/` may import a `.tsx`** — that pulls it into the node program, which has no `jsx` setting. A `src/renderer/**/*.test.tsx` is the other half of the rule: collected by the vitest glob and typechecked by `tsconfig.web.json`, which does set `jsx: "react-jsx"` (`:8`). That is where this story's render assertions live, and it is the first `.test.tsx` in the repo.
- `src/renderer/ui/app.tsx:1-51` — the placeholder, and the house style: named `export function`, explicit return type, `import type { JSX } from 'react'`, a leading block comment stating the decision and why, no default export, no semicolons, single quotes, `·` as the separator in user-facing strings.
- `src/main/fold/elapsed.ts` — the house style for a pure module: one exported concept, a doc comment naming the promise and every edge case with its reason, no defensive branch beyond the stated promise.
- `eslint.config.mjs:102-107` — View forbids `src/main` and `src/preload` and nothing else, so `src/renderer/ui/feed/` inherits the rule and **`tests/layering.test.ts` needs no change** (its assertions key on `LAYER_GRAPH`, not the filesystem). The parser therefore lives under `src/renderer/ui/`, not `src/main/fold/`: View may not import Fold, and the eventual move across the bridge is Epic 3's when the stream feeds the same component.
- `electron.vite.config.ts:23-31` — renderer `root` is `src/renderer`, so the `?raw` fixture import crosses out of the Vite root. Vite's default `server.fs.allow` is the workspace root found by walking up to the lockfile, which is the repo root, so this is expected to work unmodified; if dev or build rejects it, widen `server.fs.allow` to `resolve(__dirname)` in the renderer block and nothing else.
- `vitest.config.ts:7-8` — `environment: 'node'`, include `src/**/*.test.{ts,tsx}` and `tests/**/*.test.{ts,tsx}`. No DOM at runtime, and `tests/**/*.tsx` is in neither TS program, so a `.tsx` test would be typechecked by nothing.

## Tasks & Acceptance

**Execution:**
- `src/renderer/design/tokens.css` -- append `--run-note-time:58px`, `--run-note-kind:74px` and `--rule-width:1px` to the layout constants in the second `:root`, each with a comment citing `DESIGN.md:243` and `:245` -- the two column widths and the rule width are the only values this story needs that no token carries, and this is the one file entitled to a literal; no rule is added, so the `[':root', ':root']` assertion stays green
- `src/renderer/ui/feed/memlog.ts` -- a pure `parseMemlog(text): RunNote[]` with `RunNote = { kind: string | null; author: string | null; time: string | null; reason: string }`: skip the frontmatter block, take only body lines starting with `- `, match the tag non-greedily as `^- \(([^)]*)\)\s?(.*)$` so the **first** `)` closes it, split the label on the **last** ` by `, lower-case and trim the kind, and leave `time` null because the format carries none -- non-greedy is not a style choice: 139 of 267 real entries contain a `)` in the reason, so a greedy match corrupts the majority of the corpus
- `src/renderer/ui/feed/kind-treatment.ts` -- a pure `kindTreatment(kind: string | null): 'accent' | 'neutral' | 'friction'` -- `decision` accent, `question`/`gap` friction, everything else including `null` neutral. Written as a total function over an open vocabulary rather than a lookup with a throw, because FR41's promise is that a kind shipped by a future BMad release renders rather than breaking the feed
- `src/renderer/ui/feed/emphasis.ts` -- a pure `emphasisSpans(reason: string): { text: string; emphasised: boolean }[]` splitting on paired `**`, leaving an unmatched marker as literal text -- returning spans rather than markup is what lets the component render them as React children, so project content can never become HTML
- `src/renderer/ui/feed/run-note.css` -- the component stylesheet: the row grid `var(--run-note-time) var(--run-note-kind) 1fr` at `var(--space-lg)`, `align-items:baseline`, `var(--space-xs) 0` padding; the adjacent-sibling rule `border-top: var(--rule-width) solid var(--line-soft)`; the time cell mono/`--fs-meta`/`--faint`/`tabular-nums`; the kind chip mono/`--fs-micro`/`--track-micro`/`--radius-chip`/`0 var(--space-xs)`/`justify-self:start` with the three treatments; the reason sans/`--fs-body-ui`/`--lh-base`/`--dim` and its emphasis at `--text`/`--weight-strong`. Every value through `var()`, no media query -- the file is swept by `guardedStylesheets()` the moment it exists, and NFR27 allows no third breakpoint
- `src/renderer/ui/feed/run-note-feed.tsx` -- `<RunNoteFeed notes={…}/>` rendering one row per note with **three children always**, the time child empty when `time` is null, the kind chip carrying its treatment class and the literal lower-case kind string, and the reason built from `emphasisSpans`. Side-effect-import `./run-note.css`. Take `notes` as a prop rather than a path -- Epic 3 mounts this same component against a live stream, and a component that reads files could not be reused there
- `src/renderer/ui/app.tsx` -- mount the preview: `?raw`-import the UX memlog, `parseMemlog` it, render `<RunNoteFeed/>` beneath the project path, behind a comment naming this as Story 1.5 scaffolding that Story 1.9 replaces with the real shell -- the story's whole purpose is a judgement, and an unmounted component cannot be judged
- `src/renderer/ui/feed/run-note-feed.test.tsx` -- the surface assertions, via `renderToStaticMarkup(<RunNoteFeed notes={…}/>)` from `react-dom/server`: a row emits three grid children in file order; a null `time` leaves the first child present and empty rather than absent; the kind chip carries the treatment for each of the four named kinds and neutral for `moment`, `idea` and a kind with no name; the chip's text is the literal lower-case kind with no `kind:` prefix and no uppercasing; a `**…**` reason emits `<strong>` around exactly the marked span; and a reason containing `<script>` appears escaped in the output. Render the real 36-entry memlog through the parser into the component and assert 36 rows. -- these are the story's actual claims, and a source-text grep can only approximate them. **If `react-dom/server` cannot be imported under `environment: 'node'`, fall back to the source-text guards in the next task and record the loss** -- do not add jsdom to rescue it
- `tests/run-note-feed.test.ts` -- cover every I/O-matrix row against the three pure modules; then the real-corpus assertions read from disk at run time: all 36 entries of the named UX memlog parse with a non-empty reason and no leading `(`; every entry across all five memlogs parses; the distinct kinds found are counted and asserted to exceed the four named treatments so the fallback is exercised by real data rather than by a fixture; the brainstorming memlog's 59 authored entries resolve an author that never appears in the reason. Then the source-text guards: `run-note.css` is clean under the imported `literalsIn()`, carries no `@media`, and every one of its values is a `var()`; `run-note-feed.tsx` contains no `dangerouslySetInnerHTML` -- the render assertions above cover behaviour, and these cover the invariants that must survive a rewrite of it
- `tests/tokens.test.ts` -- assert `--run-note-time`, `--run-note-kind` and `--rule-width` exist and equal the values read out of `DESIGN.md`'s `components.run-note` `grid:` and `rule:` entries at run time -- the format-citation rule applies to the visual contract too, and a transcribed 58 would drift silently

**Acceptance Criteria:**
- Given `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/.memlog.md` read from disk, when it is parsed, then exactly 36 notes come back in file order, the first is `kind:'decision'` with a reason beginning `Sources bound:`, and the last is `kind:'event'` with reason `spines finalized`.
- Given the whole five-file memlog corpus, when every entry is parsed, then no entry yields an empty reason, no reason begins with `(`, and no `kind` contains a space — the three ways a tag regex is known to fail.
- Given the parsed corpus, when kinds are counted, then more than four distinct kinds appear and every kind outside `decision`/`assumption`/`question`/`gap` maps to `neutral`, proving the fallback against real data rather than a fixture.
- Given the 36 notes parsed from the named memlog, when `<RunNoteFeed/>` is rendered to static markup, then the output carries 36 rows, each with three grid children, each first child empty, and the chips carrying the treatment their kind maps to.
- Given a note whose reason is `a **b** c`, when the feed is rendered, then the markup contains `<strong>` wrapping exactly `b`; and given a reason containing `<script>`, then that text appears escaped and no `dangerouslySetInnerHTML` exists in the component.
- Given `npm test`, when the literal sweep runs, then `src/renderer/ui/feed/run-note.css` appears in `guardedStylesheets()` and reports no offence — the first component stylesheet to exercise the Story 1.3 guard against a real file.
- Given the whole source tree, when it is swept, then `outline` still appears only in `design/focus.css`, no `aria-live` attribute exists outside `a11y/live-region.tsx`, and no arrow-key literal exists outside `a11y/`.
- Given `npm run dev`, when the window opens on this repo, then the feed renders the UX memlog's 36 rows with the time column empty, the kind chips in their treatments, and the rows separated by a hairline — the state the human review judges.
- Given `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`, when each runs on a clean checkout, then all four exit zero, `tests/layering.test.ts` is untouched and green, and the suite is larger than the 312 tests Story 1.4 left behind.

## Spec Change Log

## Review Triage Log

### 2026-09-28 — Review pass
- verdicts: 37 findings — high 1, medium 19, low 17, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind: both test files transcribe live counts (36, 59, index 35) while the file's own header claims counts are derived — an append to either memlog reddens four assertions with no defect. Counts now come off the file via `entryLines`/`entryCount`, with 36 and 59 kept as floors.
  - `[low]` `[patch]` blind: `open` lost its DESIGN.md friction treatment to FR41's substitution with only a code comment recording it. Pinned as a test asserting `kindTreatment('open') === 'neutral'` and that no memlog emits it, so the substitution is on record.
  - `[medium]` `[patch]` blind: FR41 enumerates nine kinds the fallback must cover and six were reached only incidentally by the corpus sweep. Added an explicit loop over FR41's list by name.
  - `[low]` `[reject]` blind: the spec's task line and matrix cell say "split on the **last** ` by `" while the code splits on the first. Accurate, and the code is right — the matrix's own expected output (`author: 'van by der'`) is what the first-split produces, so the cell contradicts itself and the behaviour column governs. Rejected because the fix edits this build's spec; recorded under Auto Run Result instead.
  - `[medium]` `[patch]` blind: a reason opening with a parenthesised phrase is read as a tag. **Confirmed by probe** — `- (see note A) real text here` parsed as `kind: 'see note a'` and the words vanished from the reason. Fixed: a kind is one word, so a whitespace-bearing label is not a tag and the entry keeps its text. Re-probed red.
  - `[low]` `[defer]` blind: a kind wider than the 74px track overflows the chip. Real, but no kind in the corpus exceeds ten characters and the fix (truncate vs wrap) is a design ruling no source makes. Deferred with evidence.
  - `[medium]` `[defer]` blind: `.run-note-reason` sets no `min-width: 0`, so an unbreakable token widens the `1fr` track instead of wrapping. Real, and it bites when Epic 3 puts the feed in the 230px card; not reachable at the preview's full window width. Deferred with evidence.
  - `[medium]` `[patch]` blind: `tokens.test.ts` couples only `grid` and the rule's width to DESIGN.md; `gap` and the rule's colour were transcribed. Added an assertion that the stylesheet spends the named tokens in the named properties.
  - `[medium]` `[patch]` blind: nothing ties the treatment class strings to the stylesheet's selectors. Same root cause as the verification-gap finding below; same fix.
  - `[low]` `[patch]` blind: `author` is parsed and tested, then dropped by the component with no comment saying why. Comment added naming FR40's three slots as the reason.
  - `[medium]` `[defer]` blind: the feed has no list semantics — bare `div`/`span`, so a screen reader reads each row as a run-on line with a leading blank. Real; no source specifies the feed's semantics and adding roles is a design ruling. Deferred with evidence.
  - `[low]` `[defer]` blind: the preview couples the renderer build to a dated planning path and nothing records the coupling. Deferred with evidence.
  - `[low]` `[defer]` edge-case: a long or spaced kind overflows the chip — same root cause as the blind chip finding; same deferral.
  - `[medium]` `[defer]` edge-case: an unbreakable long token grows the row past its container — same root cause as the blind `min-width` finding; same deferral.
  - `[low]` `[patch]` edge-case: an untagged entry draws an empty bordered chip. Reachable — the writer emits `- text` whenever neither `--type` nor `--by` is given. Fixed with a `:empty` rule that removes the border, ground and padding.
  - `[low]` `[reject]` edge-case: a note with no time, no kind and an empty reason collapses to a bare hairline. Reachable, but a thin row for an empty entry is arguably correct, and `min-height` on a text row invents a dimension no source states.
  - `[low]` `[reject]` edge-case: CRLF or a BOM defeats the frontmatter skip. **Probed:** the claim is true of the code, but `memlog.py` writes `\n` and UTF-8 without a BOM, and v1 is macOS-only — the input was not shown reachable.
  - `[low]` `[reject]` edge-case: a newline inside `--type`/`--by` drops continuation lines. True of the code; the proposed fix (append orphan lines to the previous reason) contradicts the writer's own "one line is one note", which its whitespace collapse guarantees.
  - `[low]` `[reject]` edge-case: `kindTreatment` mis-handles an untrimmed kind from a non-parser source. No such source exists; the module documents normalising once, in the parser, and a second normalisation would be a second rule about casing in a second place.
  - `[medium]` `[patch]` edge-case: `memlogsUnder` discovers any future memlog, so unrelated run content could redden the suite — same root cause as the transcribed-counts finding; same fix.
  - `[low]` `[reject]` edge-case: the spec/code ` by ` contradiction — same as the blind finding; rejected for the same reason.
  - `[low]` `[patch]` edge-case: the component's comment claims an empty cell "establishes a baseline from its inherited font"; an empty grid item generates no line box and its baseline is synthesised. The rendering is unaffected, the prose was wrong — comment corrected.
  - `[medium]` `[patch]` verification-gap: nothing asserts the component imports its own stylesheet — reviewer demonstrated deleting one line leaving 357/357 green with the entire visual contract gone. Assertion added. Re-probed red.
  - `[medium]` `[patch]` verification-gap: nothing checks that `var(--…)` names resolve — reviewer demonstrated `var(--panel-two)` passing every guard. Every guarded stylesheet's references are now checked against tokens.css's declarations. Re-probed red.
  - `[medium]` `[patch]` verification-gap: nothing ties the emitted treatment classes to the stylesheet's selectors — reviewer demonstrated renaming `.run-note-kind--accent` leaving the suite green. The modifier set is now pinned to exactly `{accent, friction}`, with `neutral` asserted as the deliberate base. Re-probed red.
  - `[medium]` `[patch]` verification-gap: the preview mount is unverified — dropping `<RunNoteFeed/>` left everything green. `app.tsx`'s mount is now pinned by source text. Re-probed red.
  - `[medium]` `[patch]` verification-gap (other): live-artifact counts — same root cause as the blind finding; same fix.
  - `[low]` `[defer]` verification-gap (other): the renderer bundle now carries this repository's UX planning artifact — same root cause as the blind preview-coupling finding; same deferral.
  - `[medium]` `[defer]` intent-alignment: the 230px scroll behaviour is never exercised, and real reason lengths (median 463, max 1216 characters) make it the AC most likely to fail. The intent itself defers the card ("the card body's *eventual* 230px"), so this is recorded rather than built.
  - `[medium]` `[patch]` intent-alignment: "forty or more entries" was never rendered — both test files used the 36-entry fixture. The 68-entry brainstorming memlog is now rendered and asserted row-for-row.
  - `[medium]` `[defer]` intent-alignment: the emphasis treatment never fires over real data — zero `**` markers in the named fixture, one across 267 corpus entries — so the mockup's claim-at-600 against dimmed grounds does not appear in the surface the human judges. Real and material to the judgement; not fixable from the format. Deferred with evidence.
  - `[medium]` `[patch]` intent-alignment: treatments asserted as strings, and `.run-note-kind--neutral` matched by no rule — same root cause as the verification-gap class/selector finding; same fix.
  - `[medium]` `[patch]` intent-alignment: grid, gap and rule proved at two surfaces that never meet — same root cause as the blind DESIGN.md-coupling finding; same fix.
  - `[high]` `[patch]` intent-alignment: nothing sets a page background, so the preview renders `--dim`/`--faint` text on Electron's white default and the surface this story exists to have judged is not fairly lookable. **Confirmed:** no `body`/`html` rule anywhere under `src/`, and `main-window.ts` sets no `backgroundColor`. Fixed with `design/page.css` — the smallest page ground that makes a rendered surface judgeable. Re-probed red.
  - `[low]` `[reject]` intent-alignment: the "thirteen distinct kinds" premise is corrected silently. Accurate, and already recorded in this spec's `deferred` list as a Story 1.13 format correction before implementation began.
  - `[low]` `[reject]` intent-alignment: "pointed at that path" is inverted, and a test forbids the AC's literal wording. The AC's observable outcome — that file's entries rendered in order — is asserted end to end; `notes` as a prop is what lets Epic 3 mount the same component on a live stream, which the epic requires.
  - `[low]` `[reject]` intent-alignment: component dimensions placed in the global token file. Acknowledged in the diff and refuted as unavoidable: NFR23 forbids the literal in any other stylesheet, `--radius-hairline` is a radius, and the spacing ladder has no 1px rung.

## Design Notes

**The emphasis is real but nearly unexercised, and that is a finding, not a bug.** FR40, UX-DR20 and `DESIGN.md:631` all require "the load-bearing clause" at 600 in `text`, and **nothing anywhere defines how that clause is identified** — not DESIGN.md, not EXPERIENCE.md, not `epics.md`, not `memlog.py`. The mockup's emphasis is hand-authored `<b>` tags (`document-card-dead-air.html:233-237`). In the real corpus there are **two `**` markers across 267 entries, and zero in the fixture this story is pointed at**. So the component supports emphasis where the text marks it and nowhere else. Deriving a "substantive phrase" would mean inventing a rule no source states; rendering nothing would drop a stated requirement. Supporting the one marker the format can carry keeps the requirement satisfiable and honest about how rarely it fires — and it is the slot Epic 3's live writer fills if it ever starts marking them.

**Why `**` spans and not `markdown-it`.** Both are pinned and unused, and reaching for them here would mean an HTML pipeline, a sanitizer, and `dangerouslySetInnerHTML` over project content — for a single inline marker. `emphasisSpans` returns data; the component renders `<strong>` as a React child, which escapes by construction. The attack surface is not reduced, it is absent.

**Why the tag regex is non-greedy, stated as the defect it prevents.** 52% of real entries contain a `)` in the reason:

```
- (event) Create from brainstorm-bmad-visual-harness-2026-09-22 (brainstorm-intent.md + its memlog + harness-mockup.html); slug inherited from source folder
```

`\((.*)\)` swallows to the last paren and yields a kind of `event) Create from … harness-mockup.html`. `\(([^)]*)\)` stops at the first. Likewise the label splits on the **last** ` by `, not the first, because `--by` is an unvalidated free string (`memlog.py:210`) and an author containing ` by ` is emitted verbatim.

**The two-step emphasis is an intentional exception, not a contradiction.** `DESIGN.md:721` forbids using weight and ramp together, while `:631` specifies exactly that for the reason — `dim` → `text` **and** 400 → 600. `:252` and `epics.md:675` both confirm the two-step form for this component specifically, so the run note is the carve-out. Named here so a reviewer reads it as a decision rather than a slip.

**The empty time cell is the case no source has drawn.** `align-items:baseline` on a row whose first cell is empty is undrawn in every mockup, because every mockup row has a timestamp. The rule this story adopts: the component always emits three children, so the grid keeps its columns and the kind never slides left. An empty `<span>` still establishes a baseline from its inherited font, so the other two cells align to each other as before. This is why "emits three children per row" is an assertion and not an implementation detail.

## Verification

**Commands:**
- `npm test` -- expected: all green, more than 312 tests; `src/renderer/ui/feed/run-note-feed.test.tsx` asserts the rendered markup and `tests/run-note-feed.test.ts` covers every I/O-matrix row plus the real-corpus and source-text guards
- `npm run lint && npm run typecheck && npm run build` -- expected: all four exit zero. `typecheck:web` proves the `.tsx`, the `?raw` import and the CSS import resolve; `typecheck:node` proves the three pure modules carry no DOM types
- `npm run dev` -- expected: the window shows 36 rows over this repo's UX memlog, time column empty, chips in three treatments, hairline separators. **If the `?raw` import is rejected for leaving the Vite root, widen `server.fs.allow` to the repo root in the renderer block of `electron.vite.config.ts` and nothing else.**
- `grep -rn 'outline' src/ | grep -v 'design/focus.css'` -- expected: no output
- `grep -rn 'dangerouslySetInnerHTML\|markdown-it\|dompurify' src/` -- expected: no output
- `grep -rnE '[0-9]+(px|rem|em|%)' src/renderer/ui/feed/run-note.css` -- expected: no output
- `node -e "…"` over the five memlogs -- expected: the parser's entry count per file matches `grep -c '^- '`: 68, 11, 53, 36, 99

**Manual checks (what no test covers):**
- The judgement itself. Open `npm run dev` and read the feed as a reader, not a developer: does the register split alone keep reasoning distinct from prose, or does it read as a changelog? **This is the story's actual acceptance and it cannot be discharged by an unattended run** — it needs a human at the window, and the decision is recorded in the walkthrough rather than here.
- Compare the rendered row against `document-card-dead-air.html:232-238` opened in a browser side by side: same column rhythm, same chip weight, same hairline.

## Auto Run Result

Status: done

**What was implemented.** The run-note feed ships as three pure, DOM-free modules, one thin component, the repository's first component stylesheet, and a preview that puts it on screen over this project's own UX memlog. `memlog.ts` reads the `.memlog.md` entry format back off `_bmad/scripts/memlog.py` rather than off any planning document: the tag closes at the first `)` because 139 of 267 real entries carry one in the reason, the label splits at ` by ` with the author keeping any extra because `--by` is the free-text half, a kind is one word so a parenthesised phrase stays in the reason, and `time` is always null because the format has no per-entry timestamp. `kind-treatment.ts` is a total function over an open vocabulary — `decision` accent, `question`/`gap` friction, everything else including an absent kind neutral — because FR41's promise is that a kind from a future BMad release renders rather than breaks the feed. `emphasis.ts` splits on paired `**` and returns data, so the component renders `<strong>` as a React child and project content can never become HTML. `run-note-feed.tsx` emits three grid children in every row, which is what keeps the kind from sliding left when the time is absent — the case no mockup has drawn, because every mockup row has a timestamp. `run-note.css` spends only `var()`, and `design/page.css` gives the window the dark ground the whole palette was chosen against.

**Files changed.**
- `src/renderer/ui/feed/memlog.ts` — new; the entry format, parsed.
- `src/renderer/ui/feed/kind-treatment.ts` — new; kind to one of three treatments, total.
- `src/renderer/ui/feed/emphasis.ts` — new; a reason split into emphasis spans.
- `src/renderer/ui/feed/run-note-feed.tsx` — new; the feed, three children per row.
- `src/renderer/ui/feed/run-note.css` — new; the first component stylesheet under the NFR23 guard.
- `src/renderer/ui/feed/run-note-feed.test.tsx` — new; the repository's first `.test.tsx`, asserting rendered markup via `renderToStaticMarkup`.
- `src/renderer/design/page.css` — new; the page ground, so a rendered surface is judgeable.
- `src/renderer/design/tokens.css` — `--run-note-time`, `--run-note-kind`, `--rule-width`.
- `src/renderer/ui/main.tsx` — loads the page ground after the tokens.
- `src/renderer/ui/app.tsx` — mounts the preview over the real memlog.
- `tests/run-note-feed.test.ts` — new; I/O matrix, the real corpus, and the contracts that must survive a rewrite.
- `tests/tokens.test.ts` — the three new tokens, coupled to DESIGN.md at run time.

**Review findings.** 37 findings across four layers — 1 high, 19 medium, 17 low, 0 false. Sixteen rows patched, six entries deferred, the rest rejected.

Patches: the page ground (the high — nothing set a background, so the preview drew `--dim` and `--faint` text on Electron's white default and the surface this story exists to have judged was not fairly lookable); the parser's paren-phrase rule (`- (see note A) real text` had been parsing as a kind and deleting the words); four verification gaps each demonstrated by deleting a feature with the suite green — the stylesheet import, unresolvable `var()` names, the treatment-class-to-selector contract, and the preview mount; live counts derived from the files instead of transcribed; FR41's nine named kinds exercised by name; `open` pinned as deliberately neutral; the DESIGN.md coupling extended to the gap and the rule colour; a forty-plus-entry feed rendered; the empty chip on an untagged entry; the author's absence explained; and a comment corrected about how an empty grid cell takes its baseline.

Rejected, with reasons: the spec/code ` by ` contradiction (accurate — and the code is right, since the matrix's own expected output is what the first-split produces; rejected because the fix edits this build's spec); CRLF and BOM handling (true of the code, but `memlog.py` writes `\n` and UTF-8 without a BOM and v1 is macOS-only, so the input was not shown reachable); a newline inside `--type`/`--by` (the proposed fix contradicts the writer's own one-line-one-note guarantee); `kindTreatment` on an untrimmed kind (no such caller exists; normalising twice would be a second casing rule in a second place); an all-empty row collapsing to a hairline (a thin row for an empty entry is arguably correct, and `min-height` invents a dimension no source states); the silent "thirteen kinds" correction (already recorded in `deferred` before implementation began); "pointed at that path" being inverted (the AC's observable outcome is asserted end to end, and `notes` as a prop is what lets Epic 3 mount this component on a live stream); and component dimensions in the global token file (unavoidable — NFR23 forbids the literal in any other stylesheet, `--radius-hairline` is a radius, and the spacing ladder has no 1px rung).

**Follow-up review recommended: true.** A `high` was patched on a first pass. The specific unverified risk is `src/renderer/design/page.css`: it is a new global rule introduced during triage rather than during planning, it is the first thing in the product to style `body`, and Story 1.9 owns the shell it anticipates. Its `margin: 0` and font-family now apply to every surface built after it, and nothing outside this story's own assertion has exercised that. Patched counts by verdict: high 1, medium 9, low 6.

**Verification.** `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` all exit zero; the suite is **368 tests across 13 files** (312 across 11 before this story). `outline` still appears only in `design/focus.css`; no `aria-live` outside `a11y/live-region.tsx`; no arrow-key literal outside `a11y/`; no unit literal in either new stylesheet. The `?raw` import resolves out of the Vite root with no config change, so the contingency the spec named was not needed.

Eight mutations were watched failing and reverted, the tree confirmed clean after each: a greedy tag regex (5 failures), omitting the empty time cell (9), an unknown kind falling back to accent (4), and — re-run after the patches, each of which had previously left the suite green — deleting the stylesheet import, mistyping a token name, renaming the accent selector, dropping the preview mount, and dropping the page ground (1 each).

**Residual risks.** The judgement this story exists for has not been made: that needs a human at `npm run dev`, and it is the one acceptance criterion an unattended run cannot discharge. Two things will shape that judgement and are recorded as deferrals rather than fixed — the emphasis treatment never fires over real data (one `**` marker in 267 entries, none in the named fixture), so the claim-against-grounds contrast the mockup sells is absent from the preview; and the 230px card body does not exist yet, so the criterion most likely to fail against real reason lengths (median 463, max 1216 characters) is untested. `page.css` is provisional and belongs to Story 1.9. The feed has no list semantics, and no source specifies any.
