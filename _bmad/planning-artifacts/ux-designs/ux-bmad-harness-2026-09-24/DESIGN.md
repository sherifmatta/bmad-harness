---
name: 'bmad-visual-harness'
type: design-spine
description: 'Dark, dense, hairline-ruled desktop shell whose entire restraint budget is spent on one thing: illustrated portraits of plausible colleagues.'
status: final
created: '2026-09-24'
updated: '2026-09-25'
sources:
  - ../../../specs/spec-bmad-visual-harness/SPEC.md
  - ../../../specs/spec-bmad-visual-harness/ui-surfaces.md
  - ../../../specs/spec-bmad-visual-harness/execution-model.md
  - ../../../specs/spec-bmad-visual-harness/bmad-install-contract.md
  - ../../../specs/spec-bmad-visual-harness/scope-tiers.md
  - ../../architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md
  - ../../../brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html
companions:
  - EXPERIENCE.md

colors:
  # ── The :root block, verbatim from harness-mockup.html, source order.
  #    AD-14: design/tokens.css opens with this block copied unchanged.
  bg: '#101317'
  chrome: '#14181d'
  panel: '#171b21'
  panel-2: '#1b2027'
  panel-3: '#20262e'
  line: '#272d36'
  line-soft: '#1f242c'
  text: '#dce2ea'
  text-strong: '#f1f4f8'
  dim: '#96a0ad'
  faint: '#6b7480'
  accent: '#7fa6e8'
  accent-bg: 'rgba(127,166,232,.12)'
  green: '#6aa87f'
  amber: '#c6a350'
  red: '#c47c72'
  # (--mono, --sans and --r live in `typography` and `rounded`; they are part of
  #  the same verbatim :root block and are not restated here.)

  # ── NEW. The token AD-14 names as missing. The mockup writes the accent hex
  #    literally into stateDot("note"); this separates blue-as-state from blue-as-accent.
  note: '#7f9ce8'

  # ── NEW. The warm friction tone. Currently three literals in the mockup.
  #    Distinct from `red`: red is failure, disagree is friction.
  disagree: '#d0968c'
  disagree-border: 'rgba(196,124,114,.3)'
  disagree-bg: 'rgba(196,124,114,.09)'

  # ── Promoted literals. Each already exists in the mockup as a hardcoded value;
  #    AD-14 calls a literal in a component a defect, so each recurring one gets a name.
  accent-border: '#33455f'      # option key, skill-button code chip, run-note `kind:decision` tag
  accent-wash: 'rgba(127,166,232,.045)'   # user-turn background
  accent-edge: 'rgba(127,166,232,.45)'    # user-turn 2px inset rule
  halo-live: 'rgba(106,168,127,.14)'
  halo-work: 'rgba(198,163,80,.13)'
  meta: '#5b636e'               # 5 uses; the tier below `faint`, timestamps and micro-labels
  ink-doc: '#b9c4d1'            # document-card prose body
  ink-doc-strong: '#e4ebf3'     # heading inside document-card prose
  ink-doc-mute: '#6e7783'       # muted run of document-card prose
  ink-md: '#cdd6e0'             # rendered markdown body in the document window
  code-bg: '#1c2128'
  code-ink: '#c3cedd'
  initials-bg: '#2b333d'
  initials-line: '#39424e'
  initials-ink: '#aab4c1'
  win-line: '#333b46'
  scrim: 'rgba(8,10,13,.55)'
  legend-badge: '#c9a78a'
  legend-badge-bg: 'rgba(201,167,138,.08)'
  legend-badge-border: 'rgba(201,167,138,.3)'

typography:
  # Two families only. No webfonts, no icon font, no display face.
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
  sans:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

  # Thirteen sizes. 600 is the only non-default weight in the system.
  badge:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 9px
    letterSpacing: 0.08em
  micro:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 9.5px
    letterSpacing: 0.04em
  meta:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 10px
  label:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 10.5px
    letterSpacing: 0.09em
  ident:
    fontSize: 11px
  body-ui:
    fontFamily: '{typography.sans.fontFamily}'
    fontSize: 11.5px
    lineHeight: '1.55'
  control:
    fontFamily: '{typography.sans.fontFamily}'
    fontSize: 12px
    letterSpacing: 0.01em
  name:
    fontFamily: '{typography.sans.fontFamily}'
    fontSize: 12.5px
    fontWeight: '600'
  base:
    fontFamily: '{typography.sans.fontFamily}'
    fontSize: 13px
    lineHeight: '1.55'
  doc-prose:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 11.5px
    lineHeight: '1.72'
  doc-read:
    fontFamily: '{typography.sans.fontFamily}'
    fontSize: 13.5px
    lineHeight: '1.72'
  head:
    fontFamily: '{typography.sans.fontFamily}'
    fontSize: 14px
    fontWeight: '600'
    letterSpacing: 0.01em
  h2:
    fontFamily: '{typography.sans.fontFamily}'
    fontSize: 14.5px
    fontWeight: '600'
  h1:
    fontFamily: '{typography.sans.fontFamily}'
    fontSize: 20px
    fontWeight: '600'
    letterSpacing: -0.01em

rounded:
  # Values only. Every role is tabled in Shapes.
  hairline: 1px
  micro: 2px
  chip: 3px
  control: 4px
  DEFAULT: 5px      # --r
  card: 6px
  window: 8px
  scrollbar: 10px
  full: '50%'
  pill: 99px

spacing:
  # Gap ladder actually in use. Padding is not on a scale — see Layout & Spacing.
  hair: 1.5px
  xxs: 4px
  xs: 5px
  sm: 6px
  sm-plus: 7px
  md: 8px
  md-plus: 9px
  lg: 10px
  xl: 12px
  xxl: 14px
  # Binding layout constants (AD-14 names these as literals equal in force to the colours).
  rail: 348px
  topbar: 42px
  rail-head: 30px
  legend: 24px
  thread-max: 940px
  party-thread-max: 900px
  chat-sub-max: 72ch
  doc-read-max: 70ch
  win-width: 'min(880px,92vw)'
  win-height: 'min(760px,80vh)'
  win-titlebar: 36px
  win-foot: 28px
  card-body-max: 230px
  composer-min: 20px
  composer-max: 120px
  # 288px is superseded for v1 — see Layout & Spacing.
  party-side: 240px   # DECIDED

components:
  status-dot:
    size: 6px
    radius: '{rounded.full}'
    idle: '{colors.faint}'
    work: '{colors.amber}'
    work-halo: '0 0 0 3px {colors.halo-work}'
    live: '{colors.green}'
    live-halo: '0 0 0 3px {colors.halo-live}'
    note: '{colors.note}'
    error: '{colors.red}'
  portrait:
    viewBox: '0 0 100 100'
    radius: '{rounded.full}'
    sizes: '32 transcript · 36 persona tile · 38 chat header · 44 cast card'
    minLegibleSize: 32px
    faceRatio: '0.76'
    speakingRing: '0 0 0 2px {colors.accent}'
  initials:
    size: 20px
    sizeUser: 32px
    background: '{colors.initials-bg}'
    border: '1px solid {colors.initials-line}'
    color: '{colors.initials-ink}'
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 9.5px      # [ASSUMPTION] at 20px; 11px at the 32px user size
    radius: '{rounded.full}'
    stackOverlap: -5px
    stackRing: '0 0 0 1.5px {colors.panel-2}'
  persona-tile:
    background: 'transparent'
    hoverBackground: '{colors.panel-2}'
    currentBackground: '#1f262f'
    currentEdge: '2px {colors.accent}'
    portraitSize: 36px
    height: 56px
  rail-row:
    stateColor: '{colors.dim}'
    writingName: '{colors.text-strong}'
    writingMeta: '{colors.amber}'
    iconStroke: '{colors.amber}'
    iconStrokeIdle: '{colors.faint}'
    iconOpacity: '0.75'
  document-card:
    radius: '{rounded.card}'
    background: '{colors.panel}'
    border: '1px solid {colors.line}'
    headBackground: '{colors.panel-2}'
    headRule: '1px solid {colors.line-soft}'
    headPath: '{typography.ident.fontSize} mono {colors.text}'
    headStatus: '{colors.amber}'
    headStatusSaved: '{colors.green}'
    bodyFont: '{typography.doc-prose}'
    bodyColor: '{colors.ink-doc}'
    bodyMaxHeight: '{spacing.card-body-max}'
    bodyPadding: '11px 13px'    # [ASSUMPTION]
    footBackground: '{colors.panel-2}'
    footFont: '{typography.label}'
    footColor: '{colors.faint}'
    caret: '6.5px × 13px {colors.accent}'
  run-note:
    grid: '58px 74px 1fr'
    gap: '{spacing.lg}'
    rule: '1px solid {colors.line-soft}'
    time: '{typography.meta} {colors.faint} font-variant-numeric:tabular-nums'
    kindFont: '{typography.micro}'
    kindRadius: '{rounded.chip}'
    kindDefault: '{colors.dim} on {colors.panel-2}, border {colors.line}'
    kindDecision: '{colors.accent} on {colors.accent-bg}, border {colors.accent-border}'
    kindOpen: '{colors.disagree} on {colors.disagree-bg}, border {colors.disagree-border}'
    reason: '{typography.body-ui} {colors.dim}; emphasis in {colors.text} at 600'
  tag-neutral:
    fontFamily: '{typography.micro.fontFamily}'
    fontSize: '{typography.micro.fontSize}'
    color: '{colors.dim}'
    background: '{colors.panel-2}'
    border: '1px solid {colors.line}'
    radius: '{rounded.chip}'
  tag-disagree:
    fontFamily: '{typography.micro.fontFamily}'
    fontSize: '{typography.micro.fontSize}'
    color: '{colors.disagree}'
    background: '{colors.disagree-bg}'
    border: '1px solid {colors.disagree-border}'
    radius: '{rounded.chip}'
  skill-button:
    background: '{colors.panel-2}'
    border: '1px solid {colors.line}'
    radius: '{rounded.control}'
    fontSize: '{typography.body-ui.fontSize}'
    hoverBackground: '{colors.panel-3}'
    hoverBorder: '#475364'
    codeChip: '{typography.micro} {colors.accent}, border {colors.accent-border}, radius {rounded.micro}'
    moreVariant: '{colors.faint}'
  conversation-turn:
    radius: '{rounded.card}'
    padding: '12px 10px'
    gap: '12px'
    stackGap: '2px between turns'
    portraitSize: 32px
    name: '{typography.name} sans, text-strong'
    role: '{typography.ident} sans, faint'
    time: '{typography.meta} mono, {colors.meta}, right-aligned'
    words: '{typography.body-ui} sans, text, pre-wrap, paragraphs split on blank lines only'
    userBackground: '{colors.accent-wash}'
    userRule: 'inset 2px 0 0 {colors.accent-edge}'
    userAvatar: 'initials at 32px'
    max: '{spacing.thread-max}'
  composer:
    background: '{colors.panel}'
    border: '1px solid {colors.line}'
    radius: '{rounded.card}'
    focusBorder: '#3c4a60'
    placeholder: '#5c646f'
    sendBackground: '#2c3a52'
    sendBorder: '#3b4d6b'
    sendColor: '#cfe0f8'
    sendHover: '#334463'
    min: '{spacing.composer-min}'
    max: '{spacing.composer-max}'
    inner: '{spacing.thread-max}'
  cast-card:
    radius: '{rounded.card}'
    minWidth: 148px
    opacityIdle: '0.42'
    opacityHover: '0.72'
    opacitySpeaking: '1'
    speakingBorder: '#41597e'
    speakingBackground: '#1b222c'
    speakingShadow: '0 0 0 1px rgba(127,166,232,.22), 0 6px 18px -10px rgba(0,0,0,.8)'
    portraitSize: 44px
  document-window:
    radius: '{rounded.window}'
    background: '{colors.panel}'
    border: '1px solid {colors.win-line}'
    shadow: '0 30px 70px -20px rgba(0,0,0,.85)'
    titlebar: 'linear-gradient(180deg,#232a33,#1d232b), height {spacing.win-titlebar}'
    lights: '10px {rounded.full} #3a424e'
    bodyPadding: '26px 34px 40px'
    readWidth: '{spacing.doc-read-max}'
    scrim: '{colors.scrim}'
  motion:
    pulse: '1.5s ease-in-out infinite; 0%,100% opacity 1 · 50% opacity .35'
    blink: '1.05s steps(1) infinite; 50% opacity 0 — hard on/off, never a fade'
    equaliser: '.9s ease-in-out infinite; height 3px→8px; delays .15s / .3s / .45s'
    reveal: '.16s ease (max-height + opacity)'
    cast: '.25s ease (opacity, border-color, background)'
    reducedMotion: '* { animation: none !important; transition: none !important }'
  sysline:
    type: 'label (10.5px) mono, faint, centred'
    rule: '1px line, drawn as ::before/::after flex fills either side of the text'
    margin: '14px 2px 10px'
    note: 'Harness-authored transcript entry. Never attributed to a persona.'
  focus:
    ring: '0 0 0 2px {colors.accent}'
    offset: '2px'
    offsetStacked: '3px'   # clears the -5px initials overlap
    radius: 'inherits the focused element'
  view-switch:
    type: 'control (12px) sans, dim'
    shape: 'DEFAULT radius (5px) container, 1px line, panel-2 ground, overflow hidden'
    divider: '1px line-soft between buttons, none on :last-child'
    pressed: '[aria-pressed=true] -> #242b34 ground, text-strong, inset 0 -2px 0 accent'
---

## Brand & Style

The harness is a dark, dense, hairline-ruled desktop shell that reads as an instrument, not an app. Every visual decision in it is downstream of one sentence from the architecture: *"if it reads as a chat box with a portrait glued on, it has failed regardless of feature completeness."*

The restraint is not minimalism as taste. It is a budget. Real illustrated faces carry the entire premise — presence, a room where a team visibly works — and the named top risk is that those faces read as childish and take the perceived intelligence down with them. Every other surface is therefore pulled back to the point of being nearly invisible so the portraits are the only thing in the product with warmth in it. Surfaces step up in five near-identical greys. Borders are hairlines. There is one accent. There is no icon font, no emoji, no image file, no gradient outside two chrome fills, and exactly one non-default font weight in the whole system. Glyphs in copy are literal Unicode (`→ ↔ · § ≈ —`); **`⌘↵` is not in the inventory**, because the composer sends on `Enter` (EXPERIENCE.md → *Accessibility Floor → Keyboard reach*).

Information density is high and deliberate: the densest type tier is 10.5px and it is the most-used size in the product. This is a tool for an engineer reading state, not a consumer surface. Nothing is padded to feel generous.

Dark only. A light theme is a documented deferral, not an omission — do not build a light palette or write `prefers-color-scheme` branches.

Two tonal rules govern everything below. **One accent, one friction colour.** Blue is the system's voice; the warm tone belongs to disagreement and to nothing else — friction is the one thing given its own colour, because friction is the feature most likely to be sanded off in implementation. **State is never decoration.** Four state colours exist and every one of them is driven by a real system fact.

**The ownership convention, stated once and used throughout.** Anatomy and appearance are specified here, in DESIGN.md. Triggers, transitions, data sources and keyboard behaviour are specified in EXPERIENCE.md. Where a state is named here, what drives it and when it changes live there; where a component is named there, what it looks like lives here.

## Colors

### The locked ramp

The `:root` block above is copied from `harness-mockup.html` unchanged, in source order, per AD-14. `design/tokens.css` opens with it. It is not a starting point to be tuned.

**Surfaces** step `bg → chrome → panel → panel-2 → panel-3`, each roughly four points of lightness above the last. `bg` is the application ground. `chrome` is the topbar and the legend footer — furniture, one step darker than a panel so it recedes below the content it frames. `panel` is a card or window body. `panel-2` is a card head or foot, a raised row, a tag ground. `panel-3` is the top of the ramp and is used **exactly once** in the mockup, on `.skillbtn:hover`; it is the hover ceiling, not a general surface.

**Hairlines** are two: `line` for a visible separation between two things, `line-soft` for a rule inside one thing (a card's head from its body). The distinction is load-bearing at this contrast — using `line` internally makes a card read as three stacked cards.

**Text** steps `text-strong → text → dim → faint`, with a fifth informal tier `{colors.meta}` (`#5b636e`) below `faint` used for timestamps and micro-labels. The ramp is fixed and **a component may not adjust it**. **Within the text ramp, hierarchy comes from which tier you pick, not from opacity** — this is a rule about text only. Opacity carries *presence* elsewhere in the product, deliberately and by its own rule (see *Elevation & Depth*).

> **Contrast risk, accepted.** `faint` (`#6b7480`) on `bg` (`#101317`) is a low-contrast pairing that the locked ramp bakes in, and `{colors.meta}` is lower still. Stakes here are hobby and no WCAG conformance target is set, but the risk is real and named: do not put anything at `faint` or below that is the *only* carrier of a fact. Every `faint` string in the product must be a restatement of something also legible at `dim` or above, or a label whose absence costs nothing.

### Accent

`accent` (`#7fa6e8`) is the single chromatic voice: the current-persona edge on a tile, the pressed underline on the segmented control, the streaming caret, the skill-button code chip, the decision-option key, the requirement ids in rendered markdown (`.fr`), and the speaking ring on a cast portrait. `accent-bg` is its 12% fill and is the only accent *fill* in the product — accent is a line, an edge, a chip border, almost never a surface.

Accent is not a state. That distinction is the reason for the next token.

### `note` — the token AD-14 says is missing

The mockup writes `background:#7fa6e8` literally inside `stateDot("note")`, reusing the accent hex as the blue-dot state. AD-14 names this as the one token that must be *added* rather than copied, "so blue-as-accent and blue-as-state are distinguishable."

**`note: #7f9ce8`.** Slightly cooler and less luminous than `accent`, distinguishable side by side, not distinguishable as an error. It is used by exactly one thing: the persona-tile dot meaning *a document this persona owns changed on disk*. Nothing else may use it, and the `note` dot may not use `accent`.

State **colours** in the product are therefore **four and only four**: `green` live, `amber` work, `red` error, `note` blue. Every indicator anywhere resolves to one of those or to `faint` idle — so with idle counted there are **five dot states in all**, carried by four colours (EXPERIENCE.md → *State Patterns*).

### `red` vs `disagree` — two warm tones, two different meanings

`--red: #c47c72` is in the verbatim `:root` block and must be shipped there. **It is never referenced by `var()` anywhere in the mockup.** That is worth stating rather than quietly fixing: the mockup's only warm-toned element is the disagreement tag, which is written as three literals — `#d0968c` text, `rgba(196,124,114,.3)` border, `rgba(196,124,114,.09)` background — and `--red` sat unused because the two are not the same colour and never were.

They are now two tokens with two jobs and they must not be conflated:

- **`red` (`#c47c72`) is failure.** The persona-tile `error` dot; a run that failed or was stopped. It is an alert and carries no substance — the substance of a failure belongs in the conversation in the persona's own voice (AD-20, CAP-12). No error text is ever tinted red.
- **`disagree` (`#d0968c` / `.3` border / `.09` fill) is friction.** The party transcript's `disagrees · <name>` and `disagrees · framing` tags, and the `kind:open` tag in the run-note feed. An unresolved question is friction, not failure. This is **the only warm-toned chip on screen; friction is the one thing given its own colour.**

The tell is: red says *something broke*, disagree says *someone is pushing back*. A product whose premise is that team disagreement is a thrill cannot render disagreement in its error colour.

`disagree` is derived from the same base as `red` (`rgba(196,124,114,…)` is `#c47c72` with alpha) but resolves lighter and warmer on `panel`. Keep both.

### Promoted literals

The remaining tokens in the block above are not new colours. Each is a value already hardcoded in the mockup that a component would otherwise have to restate — `accent-border` (`#33455f`, shared by the option key, the skill-button code chip and the run note's `kind:decision` tag), the two dot halos, the document-card and markdown ink tiers, the initials trio, the window border and scrim, the legend badge. AD-14: *"A literal colour, dimension, radius or font stack in a component is a defect."* Naming them is how that rule is satisfied, not a palette expansion.

### What has no colour

No gradients except the two chrome fills (cast strip, window titlebar). No shadows carrying hue. No semantic colour on text below `dim` other than the four states. No colour-coding by persona, module, file type or recency — the portrait is the only per-persona colour in the product, and the rail is deliberately monochrome so it reads as a filesystem rather than a dashboard.

## Typography

Two families. `mono` and `sans`, both platform stacks, no webfont, no network dependency, no licensing.

### The register split (a rule, not an implementation note)

**`mono` is the register of things written down. `sans` is the register of things said.**

This is load-bearing and must be implemented as stated. The document card under the approved dead-air treatment carries two feeds in one box: streaming document prose (`doc:prose`, from `input_json_delta`) and run notes (`run:note`, from `.memlog.md`). AD-3 routes these to separate destinations on purpose and says they must never cross. Putting them in one body asks the typeface register alone to keep them distinct — so it does:

- **Document prose renders in `mono`** at `doc-prose` (11.5px / 1.72, `ink-doc`). Prose is typeset as a document.
- **Run notes render in `sans`** at `body-ui` (11.5px / 1.55, `dim`), with the timestamp in `mono` at `{typography.meta}` and `font-variant-numeric: tabular-nums`. A run note is typeset as speech.

Same box, same size, two registers, and the register is the only thing distinguishing them. Do not add a container, a label, a rule or a background to "help" — the split is the mechanism, and a second mechanism on top of it dilutes the first.

The same rule generalises across the product. `mono` carries **file paths, state strings, metadata, timestamps, codes, chips, tags and run status**. `sans` carries **prose, persona voice, names, titles, labels and rendered markdown**. A file path in sans is wrong; a persona's sentence in mono is wrong.

### The scale

AD-14 states the type scale as "base 13px/1.55". That is the body rule, not the scale. The mockup carries **thirteen distinct sizes**, and the densest tier — 10.5px — is the single most-used size in the product with 16 declarations. (The extraction's "sixteen distinct sizes" is that use-count; the mockup's distinct-value count is thirteen, and the thirteen are what is formalised here.) The scale is dense by design and half-point steps are real: 11px and 11.5px are different roles, not rounding noise.

| Role | Size | Family | Job |
|---|---|---|---|
| `badge` | 9px | mono, uppercase, .08em | The legend footer badge. One use. |
| `micro` | 9.5px | mono, .04em | Code tags, skill-button code chip, cast status, party tags, run-note kind tags |
| `meta` | 10px | mono | Timestamps, rail meta, the rail row's directory line (`dirline`), file group, card section, window foot |
| `label` | 10.5px | mono | **Densest tier.** Chips, rail head/foot, tile state, sysline, run chip, card foot, option key, hint line, cast info, key/value key (`kv`). Uppercase at .09em for rail heads and side-section heads; sentence case elsewhere |
| `ident` | 11px | mixed | Identifiers. Mono for file paths, window path, initials, handoff chip; sans for tile name span, turn role, status pill, and the rendered-markdown sub-line and table header (`md sub`, `md th`) |
| `body-ui` | 11.5px | sans | The working text size — breadcrumbs (`crumbs`), buttons, key/value rows (`kv`), option text, run notes. Mono variant at the same size for inline code and document-card prose |
| `control` | 12px | sans, .01em | Segmented control. One use |
| `name` | 12.5px | sans 600 | Names and titles — brand, tile, turn, option, cast. md h3 at this size uppercase .03em in `dim` |
| `base` | 13px / 1.55 | sans | `body{}` and party primary turn text. AD-14's stated base |
| `doc-prose` | 11.5px / 1.72 | mono | Streaming document prose in a card |
| `doc-read` | 13.5px / 1.72 | sans | Rendered markdown in the document window |
| `head` | 14px | sans 600, .01em | Chat-header persona name. The largest type in the shell |
| `h2` | 14.5px | sans 600 | Markdown h2, document window only |
| `h1` | 20px | sans 600, -.01em | Markdown h1, document window only. Never appears in the shell |

Line-heights are four: `1.55` everywhere by default, `1.72` for both reading measures (card prose and rendered markdown), `1.45` for the open-question block and the decision option, and `0` on the portrait wrapper to kill inline descender space.

### Weight and tracking

**600 is the only non-default weight in the system.** There is no 500, no 700, no light. Emphasis is one step of weight or one step up the text ramp, never both and never a colour.

Tracking is used to make small type readable and to mark a label as a label, never for style: `.09em` on uppercase rail and section heads, `.08em` on the legend badge, `.07em` skill-row label, `.05em` skill-button code, `.04em` on micro tags and table heads, `.03em` md h3, `.02em` brand, `.01em` segmented and chat-head name, `-.01em` on md h1 only.

Uppercase appears only on: rail heads, side-section heads, the legend badge, markdown h3, and table headers. Nowhere else — an all-caps button or label anywhere else is wrong.

The 13px base and every constant below are fixed px. No source specifies a text-scaling or zoom rule and **v1 does not respond to one** — a decision, not an omission.

## Layout & Spacing

### Binding constants

AD-14 names layout literals as equal in force to the colours. These are the contract:

| Constant | Value | Surface |
|---|---|---|
| Rail | **348px**, `flex:0 0` | 1:1 view, right side, split into two `flex:1 1 50%` halves — the **Team half** above, the **Outputs half** below |
| Topbar | **42px** | `chrome`, 1px `line` bottom rule, 14px gap |
| Rail head | **30px** | Head of each rail half |
| Legend footer | **24px** | `chrome` |
| Thread max-width | **940px** | 1:1 transcript and composer inner |
| Party thread max-width | **900px** | Party transcript |
| Chat sub-line max | **72ch** | Chat-header second line |
| Document window | **min(880px, 92vw) × min(760px, 80vh)**, top 8vh | Separate OS window |
| Rendered markdown measure | **70ch** | Inside the document window body (`26px 34px 40px`) |
| Card body max-height | **230px** | Document-card body before it scrolls |
| Composer field | **20px min, 120px max** | Autogrows between |

Portrait render sizes are a closed set: **32** transcript, **36** persona tile, **38** chat header, **44** cast card. Persona tiles are 56px tall, so roughly six fit the Team half before it scrolls. **Tiles are grouped by the agent's `module` and `team` fields** (AD-10; the grouping rule is EXPERIENCE.md → *Interaction Primitives → Persona tile order*). The six-tile scroll limit is not the reason for the grouping — it is what makes the grouping load-bearing.

### The party side panel — 288px is superseded

AD-14 binds **288px** as a literal for the party side panel. **That literal does not ship in v1.**

The mockup designs three sections into that panel — *Room*, *Open disagreements*, *Decisions so far*. `scope-tiers.md` defers the latter two, so **v1 ships the Room section only**. What renders and what does not, and why, is EXPERIENCE.md's ruling (→ *Party Mode*); what follows here is the width that ruling leaves behind.

Consequently the panel is resized to its remaining content: four key/value rows on a 74px key column at `label`/`body-ui`. **v1 width: 240px — decided.** No source specifies a replacement value; 240px is sized to the Room panel's own content, a 74px key column plus its values. The alternative considered and rejected was dropping the panel entirely and moving Room into the party header; narrowing wins because it leaves the deferred *Open disagreements* and *Decisions so far* sections somewhere to land later without a relayout. **288px must not be implemented**, and the panel must not be built with slots reserved for the deferred sections.

### Spacing is a ladder, not a scale

Gaps in use are `1.5 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 12 · 14`, with 8, 6 and 10 doing most of the work. Padding is genuinely not on a scale — the mockup uses 34 distinct padding combinations, tuned per component to a dense optical rhythm rather than derived from a step. Do not regularise them. The named paddings that matter are specified per component below; elsewhere, match the neighbouring component rather than reaching for a step.

Vertical rhythm is tight everywhere. Rows are 5–7px of vertical padding, chips are 0–1px. The product is meant to be read at a glance across many simultaneous states, and whitespace here costs visible state.

### Responsive

Desktop-first, one project per window, `body{overflow:hidden}` at full size. Two breakpoints only:

- **≤1180px** — the party side panel is hidden outright.
- **≤1000px** — the shell unlocks scroll (`body{overflow:auto}`, `.app{height:auto}`), both views stack to a column, the chat column takes `min-height:62vh`, the rail moves below the chat and switches its `border-left` to a `border-top` with each half at `min-height:230px`, cast cards wrap at `flex:1 1 44%`, and the topbar wraps to `height:auto` with the breadcrumbs pushed to their own full-width row.

There is no mobile target and no third breakpoint.

## Elevation & Depth

Depth is tonal, not cast. The five-step surface ramp *is* the elevation system: a thing is "above" because it is one step lighter and has a hairline around it, not because it has a shadow. There is no elevation scale, no `z1/z2/z3`, and no hover-lift anywhere.

Shadows exist for exactly three jobs, and only three:

1. **State halos** — a 3px spread ring at very low alpha around a live (`halo-live`) or work (`halo-work`) status dot. This is the dot reading as lit, not as raised.
2. **Inset rules** — `inset 0 -2px 0 accent` under the pressed segmented button; `inset 2px 0 0 accent-edge` on a user turn; `inset 2px 0 0 accent` on the live party turn. These are edges drawn with a shadow, not depth.
3. **True separation** — the document window, which is a separate OS window over a scrim and is the only element in the product entitled to a real shadow: `0 30px 70px -20px rgba(0,0,0,.85)` over a `scrim` fill. The speaking cast card gets a restrained version — `0 0 0 1px rgba(127,166,232,.22), 0 6px 18px -10px rgba(0,0,0,.8)` — because it must read as lifted out of a row of dimmed peers, and the 2px accent ring on its portrait belongs to the same gesture.

Two z-indexes exist: **40** for the scrim, **50** for the window. Nothing else stacks, and nothing else may: **a surface that needs a z-index is a window**, and is built as one.

Presence and absence are expressed by **opacity, never by removal**: cast cards sit at `.42` idle, `.72` hover, `1` speaking; the file icon renders at `.75`; the brand mark at `.75`. A persona who is not speaking is still in the room.

## Shapes

**One radius is not the rule, and that is deliberate.** AD-14 names five values; the mockup uses **eleven distinct radius declarations resolving to ten distinct values**. The variation is not drift — radius here encodes *what kind of object this is*, on a ladder from "a piece of text with a box around it" to "a window". A single radius across all of them would flatten that distinction and make the surface read as one undifferentiated card stack.

| Token | Value | Role |
|---|---|---|
| `hairline` | 1px | The 8px accent square inside the brand mark. Barely-softened geometry |
| `micro` | 2px | A chip *inside* a control — the skill button's code badge, the legend badge. Always one step tighter than its parent |
| `chip` | 3px | **The tag radius** and the most-used value (8 uses): chips, neutral and disagree tags, inline code, code tags, the status pill, the option key, the stop control. Anything that is text-with-a-ground |
| `control` | 4px | A pressable thing that is not a surface: run chip, skill button, send button |
| `DEFAULT` (`--r`) | 5px | The base radius. Segmented control, ghost button, decision option, open-question block. "Soft, not rounded" |
| `card` | 6px | A container holding content: conversation turn, document card, composer, cast card, party turn |
| `window` | 8px | The document window. The only 8px in the product |
| `scrollbar` | 10px | Scrollbar thumb, with a 3px transparent inset border and `background-clip: content-box` |
| `full` | 50% | Status dots, portraits, initials, traffic lights, the speaking portrait ring |
| `pill` | 99px | The handoff chip, and only the handoff chip |

The pill is a single deliberate exception: the handoff chip is the one element that proposes crossing a boundary between personas, and its shape says so. Nothing else is a pill — no pill buttons, no pill badges, no pill status.

Perfect circles are reserved for **things that stand for a person or a light**: portraits, initials, status dots, traffic lights. A circle anywhere else will be misread.

## Components

Anatomy and appearance only, per the ownership convention. Triggers, transitions, data sources, timing of state changes, focus order and keyboard behaviour live in EXPERIENCE.md.

### Portrait

[`mockups/portrait.html`](mockups/portrait.html) — the approved generator rendered at every size the product uses, in context on tiles, turns and cast cards, with the derived-agent grid and the initials token. Where it and this spine disagree, **this spine wins**.


The highest-risk component in the product and the reason the rest of the shell is as quiet as it is.

**Art direction (binding, AD-16).** A *company-directory illustrated headshot: a plausible colleague.* **Not pixel art, not a JRPG sprite, not a cartoon.** The measure is whether the face could sit in a staff directory without comment. The named failure mode is "childish and game-like", which takes the perceived intelligence of the whole product with it.

**Legibility — relaxed from 20px to 32px.** AD-16 as written requires "legible from 20px to tile size". That **no longer holds as written**: it becomes **legible from 32px**. At 20px the portrait degrades to a colour blob with a hair silhouette, and with no collision check in the derivation two agents can become visually indistinguishable there. The 20px case — stacked faces and the handoff chip — is served by the initials token instead. This relaxation is what paid for v2's extra facial detail, and it is stated explicitly here because AD-16 is an architecture invariant.

`icon` from `_bmad/config.toml` is **never rendered as a portrait**, at any size, as a fallback or otherwise.

**Construction.** Procedural inline SVG, `viewBox="0 0 100 100"`, `role="img"`, `aria-label="{name}, {title}"`, `border-radius:50%`, `display:block`. The wrapper is `display:inline-block; line-height:0; vertical-align:middle`. No external assets and no licensing dependency, ever.

**Purity requirements — hard.** No `id` attributes, no `<defs>`, no gradients, no clip paths, no filters, no masks, no external references. Two portraits in the same document must not be able to collide, which is the whole reason for the constraint: every shape is a flat fill or a stroke, and shading is achieved with overlaid low-opacity shapes rather than a gradient. The function is pure — same input, same output, no global state — and determinism is asserted in tests.

**Geometry (v2 — the approved generator).** The single biggest cause of the rejected v1's toy read was a perfectly symmetrical face ellipse at a width/height ratio of .89. v2 replaces it:

- **Face** — a tapered-jaw path spanning x 32.5→67.5 and y 24→70, a **width/height ratio of .76**. Wide at the temples, narrowing through the cheek, closing to a rounded chin. This is the load-bearing change.
- **One light source, upper-left.** Four shapes carry it and they must all be present: a right-contour shadow (`shade` at .26 opacity following the face's right edge), a cheek highlight (`lite` at .24, left cheek), a jaw shadow cast on the neck (an ellipse in `dark` at .5 above the collar), and an inner-ear shadow on each ear (`dark` at .45).
- **Eyes — almond, not round.** Per eye: a soft socket shadow (`shade` at .2), an almond white (`#f0ebe3`, a quadratic upper lid over a shallower lower curve), an **iris** (r 1.95 in the eye colour), a smaller **pupil** (r .92, `#17120f`), a **catchlight** (r .5, white at .75, offset up and left toward the light), and a **weighted upper lid** stroked in `#3a2f29` at 1.3. The catchlight is the one specular white in the face; there is no pure white or pure black anywhere else in it.
- **Brows** — filled tapered wedges in `hairDark`, heavier at the inner end. Not strokes.
- **Nose** — three parts: a bridge shadow stroked in `shade` at .6 opacity, a tip ellipse (`shade` at .36), and two nostril ellipses (`dark` at .55).
- **Mouth** — a flat resting curve stroked in `#8d5a4d` at 1.35, plus a lower-lip highlight (`lite` at .22). A resting mouth, not a smile arc.
- **Hair** — a mass plus a **highlight arc** (`hairLite` at .3) across the upper-left of the crown. The highlight is what stops the hair reading as a helmet; it is omitted only for `receding`. `long` and `bun` additionally draw a back mass in `hairDark` behind the head; `curly` is seven circles with two highlighted.

Draw order is fixed: backdrop → back hair mass → neck → jaw shadow → shoulders → collar notch and stroked V → crown → ears → face → contour shadow → cheek highlight → beard → fringe → hair highlight → brows → eyes → nose → mouth → glasses → earrings.

**Parameters.**

| Parameter | Domain |
|---|---|
| `skin` + `shade` | Paired. 8 pairs, `#f2d2b3`→`#7d4f30`; five visibly distinct tones among the curated five |
| `eye` | **NEW in v2.** 8 values (`#4a3325 #5a4332 #6b4a2f #3d2a1e #5c6b4a #4f6068 #6b7a80 #54453a`). Added because five identical dark-brown eyes read as clones |
| `hair` | 8 colours, `#1e1a17`→`#9ba3ab` |
| `style` | `short · long · curly · bun · receding` — five values. Derived agents draw from a **weighted six-entry list**; see *Derivation* below |
| `fringe` | `straight · sweep · null`. `receding` forces `null` |
| `crown` | Optional `{cy, rx, ry}` override; default `{cy:35, rx:19.2, ry:19.6}`. Curated personas only |
| `beard` | `full · close · null` |
| `glasses` | `rect · round · null` |
| `earrings` | boolean |
| `shirt` + `collar` + `bg` | Paired as 8 triples |

Derived at render, never passed: `hairDark = shade(hair, −20)`, `hairLite = shade(hair, +26)`, `lite = shade(skin, +20)`, `dark = shade(skin, −38)`.

The palette is **muted and desaturated throughout** — backgrounds are dark slate-to-plum (`#2a3340`, `#2f3742`, `#2f3a3c`, `#383345`, `#333c3a`), shirts are their lighter partners. Nothing saturated, nothing primary. The portrait must sit *inside* the surface ramp, not on top of it.

**Derivation for non-curated agents.** The five core personas carry curated parameters. Every other installed agent derives deterministically from its `agentId`: a 32-bit FNV-1a hash **salted per field** (`skin`, `fit`, `style`, `hair`, `eye`, `fringe`, `beard`, `beardk`, `glass`, `glassk`, `ear`), indexed modulo a constrained palette. The palettes are constrained precisely so the derived population **holds together as one company** — same muted range, same lighting, same construction. `style` is drawn from a weighted six-entry list — **`short · short · long · curly · bun · receding`** — so `short` lands at twice the rate of each of the other four; `beard` fires at 32%, `glasses` at 34%, `earrings` at 28%. There is no collision check, and two agents can in principle derive to similar faces; that is accepted at these sizes and is part of why the 20px case was reassigned.

**Signature.** `portrait(artParams, size, state)`. `state` is accepted from the start even though v1 renders a **single neutral expression for every face** — same faint resting mouth, same level brows. The state dot carries state; the face does not. Reactive faces are a Should-tier deferral that needs no signature change.

### Initials

The small-reference token, and the thing that made the 32px portrait floor affordable.

- **20px** circle for small agent references (stacked faces, handoff chip). **32px** for the user's own avatar in the transcript, which is where the mockup's `.initials` originates.
- `initials-bg` (`#2b333d`) fill, 1px `initials-line` (`#39424e`) border, `mono` in `initials-ink` (`#aab4c1`), centred.
- Glyph size **11px at 32px**; **9.5px at 20px** `[ASSUMPTION]` — the mockup only specifies the 32px form.
- Stacked: `margin-right: -5px` overlap with a `0 0 0 1.5px panel-2` ring cutting each disc out of the one behind it.
- The name-and-role reveal renders **identically on `:hover` and on `:focus-visible`**; the focus treatment is *Focus*, below. Why that parity is mandatory, and the ARIA that carries it, are EXPERIENCE.md's (→ *Accessibility Floor → The initials token — focus parity*).

### Status dot

6px circle, the entire state vocabulary of the product in one component.

| State | Fill | Halo | Motion |
|---|---|---|---|
| `idle` | `faint` | — | none |
| `work` | `amber` | `0 0 0 3px halo-work` | `pulse` |
| `live` | `green` | `0 0 0 3px halo-live` | none |
| `note` | `note` | — | none |
| `error` | `red` | — | none |

**Five dot states carried by four colours** — `idle` is the absence of one. The halo is only on the two "something is happening" states; `note` and `error` are facts, not activity, and do not glow. The **amber fill is unique to `work`**; the halo is *not*, since `live` carries one too. Every dot is accompanied by a textual state string — the dot is never the sole carrier.

### Persona tile

56px row: 36px portrait, name at `name` (12.5px/600) with the title beside it at `ident` in `dim`, and a state line below at `label` with its dot. Default ground is transparent; hover is `panel-2` and reveals the menu hint; **current** is `[aria-current="true"]` → `#1f262f` ground with a 2px `accent` left bar via `::before`. The menu hint expands `max-height: 0 → 60px` over `.16s`.

### Rail row (Outputs half)

Two visually distinct registers on one line, because AD-2 forbids merging them. The **disk state** (from the watcher) is the row's own typography — file name at `{typography.body-ui}`, directory line at `{typography.meta}`, state string at `{typography.label}`. The **run annotation** (owner, section in flight, `stopped`) is optional and must be able to be absent without the row looking broken. When a file is being written: name goes `text-strong`, meta goes `amber`, the icon stroke goes `amber`, and the dot pulses. Otherwise the icon stroke is `faint`. The file icon is a 12×14 inline SVG of two paths (page plus folded corner) at `stroke-width:1`, rendered at `.75` opacity. The rail is otherwise entirely monochrome.

### Document card

`{rounded.card}` radius, `panel` body, 1px `line` border, three parts.

- **Head** — `panel-2` ground, `1px line-soft` bottom rule, `7px 11px`. Status dot · file path in `mono` `{typography.ident}` at `text` · status string in `mono` `{typography.meta}` right-aligned in `amber` while writing and `green` when saved · elapsed in `mono` `{typography.meta}` at `faint` · the stop control.
- **Body** — `max-height: 230px`, scrolling, padding `11px 13px` `[ASSUMPTION]` (the one value no source states; matched to the side-section padding). **Two modes, both content, per the approved dead-air treatment.** In prose mode: `doc-prose` (mono 11.5/1.72) in `ink-doc`, `white-space: pre-wrap`, headings in `ink-doc-strong` at 600, muted runs in `ink-doc-mute`, with the streaming caret at the tail. In run-note mode: the run-note feed (below). The card never has an empty body. Which mode is showing, and when it switches, is EXPERIENCE.md's (→ *State Patterns → Document card*).
- **Foot** — `panel-2`, `1px line-soft` top rule, `6px 11px`, `{typography.label}` at `faint`, 14px gaps, wrapping. Carries the counts and the **named list of not-yet-written sections** in `mono`. There is no denominator and no progress bar anywhere in the card.
- **Caret** — 6.5 × 13px `accent` block, `blink 1.05s steps(1)`. Removed, not faded, when writing stops.

### Run note (the run-note feed)

The anatomy of one run note, wherever it appears. What each kind *means* is EXPERIENCE.md's (→ *Dead Air → The four kind tags*).

Three-column grid `58px · 74px · 1fr` at 10px gap, baseline-aligned, 5px vertical padding, consecutive rows separated by `1px line-soft`.

1. **Time** — `mono` `{typography.meta}` in `faint` with `font-variant-numeric: tabular-nums`. Tabular is required; a ragged time column destroys the feed's scannability.
2. **Kind tag** — `{typography.micro}` (mono 9.5px, .04em), `{rounded.chip}` radius, `0 5px`, left-justified in its column. Four kinds, written `kind:…` throughout because `note` also names a colour token and a status-dot state:
   - `kind:decision` — `accent` on `accent-bg`, border `accent-border`. The accent treatment, because a decision is the product's whole point.
   - `kind:assumption` and `kind:note` — the neutral tag: `dim` on `panel-2`, border `line`. **`kind:note` is the neutral tag and must not use `{colors.note}`**, which belongs to the status dot and to nothing else.
   - `kind:open` — the **`disagree`** treatment: `disagree` on `disagree-bg`, border `disagree-border`. An unresolved question is friction, not failure; it must not use `red`.
3. **Reason** — `sans` `{typography.body-ui}` in `dim`, with the substantive phrase emphasised in `text` at 600. One step of weight and one step of ramp, never a colour.

### Tags — neutral and disagree

Identical geometry, two tones. `{typography.micro}` type, `{rounded.chip}` radius, `0 5px` padding.

- **Neutral** — `dim` on `panel-2`, border `line`. Labels: `evidence`, `concedes · partly`, `speaking`, `proposed`, `answers`, `builds on`, `decides`, `present · listening`.
- **Disagree** — `disagree` on `disagree-bg`, border `disagree-border`. Labels: `disagrees · <name>`, `disagrees · framing`, `unresolved`. **The only warm-toned chip on screen.**

### Decision option

The block a persona raises inside its own turn when it stops to ask (Flow 1's FR-7 beat). Appearance only; when it appears, what activating it does, and what becomes of it afterwards are EXPERIENCE.md's (→ *Component Patterns*).

- **Block** — `{rounded.DEFAULT}` (5px), `panel-2` ground, 1px `line`, `9px 11px`. One block per question, holding the title and the options; options stack at `{spacing.sm}`.
- **Title** — `{typography.name}` (12.5px/600) in `text-strong`.
- **Option key** — the leading badge (`A` · `B` · `C`): `{typography.label}` mono in `{colors.accent}` on `{colors.accent-bg}`, 1px `{colors.accent-border}`, `{rounded.chip}`. This is the block's single accent use.
- **Option text** — `{typography.body-ui}` in `text` at **line-height 1.45**, the tighter of the two reading measures: an option is read as a choice, not as prose.
- **Lean** — where one option carries the persona's stated lean, the lean is part of that option's own words. No badge, no highlight, no sort order, no default selection, no recommended styling of any kind.

The block has **no chosen state and no disabled state**, because it does not survive being answered: the whole block is removed once the question is answered.

### Focus

One treatment, everywhere: `{components.focus}` — a `0 0 0 2px {colors.accent}` ring at **2px** offset, drawn outside the element and inheriting its radius. Stacked initials take a **3px** offset so the ring clears the `-5px` overlap of the disc behind. There is no focus fill, no focus shadow, no colour change and no motion; the ring is the whole treatment and it is identical on every primitive.

It is specified for **every surface EXPERIENCE.md requires to be keyboard-operable**: the view switch and each of its buttons, the persona tile, the skill button and `+N more`, the composer field and the send button, the decision option, the document card and its stop control, the rail row, the document window's three escapes, the cast chooser, the party header controls, and the initials token.

`:focus-visible` only — a mouse press never draws the ring. Hover and focus are separate treatments and must not be collapsed into one: hover is `panel-2`, focus is the accent ring, and a surface may carry both at once.

### Skill button

`panel-2` ground, 1px `line`, `{rounded.control}` (4px) radius, `{typography.body-ui}`. Carries a leading code chip in `{typography.micro}` mono, `accent` on transparent with an `accent-border` border at `{rounded.micro}` (2px) radius — one step tighter than its parent. Hover: border `#475364`, ground `panel-3`. The `+N more` variant renders in `faint`.

The row must look right at **1 to 10 entries**. Its overflow behaviour — in-place expansion, and what must never happen instead — is EXPERIENCE.md's (→ *Component Patterns → `+N more`, in detail*).

### Conversation turn

The conversation's most-repeated element, and the one the radius table names only in passing. A `{rounded.card}` (6px) container padded `12px 10px` with a 12px gap, successive turns 2px apart: a 32px portrait on the left, and on the right a header line over the words.

The header is the name at `{typography.name}` (12.5px/600, `text-strong`), the role at `{typography.ident}` (11px, sans, `faint`) and the timestamp in mono at `{typography.meta}` (10px, `meta`), pushed to the right edge. The words follow at `{typography.body-ui}` in sans, `white-space: pre-wrap`, with paragraphs split on blank lines and nothing else: no prefix, frame, label, summary or classification of what a persona said. Everything a project or a persona supplies is rendered as text.

**The user's turn** is the same container on the `accent-wash` ground with an `inset 2px 0 0 accent-edge` rule down its left edge, and the 32px initials token where the portrait would be — the user has no generated face. The wash and the rule are the only difference; the user's turn is not a different component.

No hover lift, no entrance animation, no typewriter reveal. The thread caps at `{spacing.thread-max}`.

### Composer

`panel` ground, 1px `line`, `{rounded.card}` (6px) radius. Focus-within moves the border to `#3c4a60`. Placeholder `#5c646f`. Textarea autogrows 20px→120px, clamped in CSS and sized from its content. It is never disabled and takes the shared focus ring itself; the field's border shift is a second cue, not a replacement. `Enter` sends, `Shift+Enter` is a newline, and no other chord sends. Send button: `#2c3a52` ground, `#3b4d6b` border, `#cfe0f8` glyph, `{rounded.control}` radius, `#334463` on hover. Hint lines below at `{typography.label}` in `{colors.meta}`.

### Cast card

`{rounded.card}` radius, `flex:1 1 0` at `min-width:148px`, on a `linear-gradient(180deg,#151920,#12161b)` strip that scrolls horizontally. 44px portrait, name at `{typography.name}`, title at `{typography.ident}`, status at `{typography.micro}`. **Default `opacity:.42`**, hover `.72`, speaking `1` with border `#41597e`, ground `#1b222c`, the accent glow, a `0 0 0 2px accent` ring on the portrait, and status in `accent` with the equaliser. Presence is expressed by dimming, never by removal — every chosen portrait stays visible for the life of the room.

### Document window

A separate OS window over a `scrim` fill at z-40, window at z-50, top `8vh`, `min(880px,92vw) × min(760px,80vh)`. `panel` ground, 1px `win-line` (`#333b46`), `{rounded.window}` (8px) radius, `0 30px 70px -20px rgba(0,0,0,.85)`.

Title bar 36px on `linear-gradient(180deg,#232a33,#1d232b)`: three 10px `#3a424e` circles, the **full path** in `mono` `{typography.ident}` (not the basename), then ghost buttons. Body `26px 34px 40px`. Foot 28px at `{typography.meta}`.

**Rendered markdown** is constrained to `70ch` at `doc-read` (sans 13.5/1.72) in `ink-md`. h1 20px/600 at `-.01em` with a mono `ident` sub-line in `faint` over a bottom rule; h2 14.5px/600; h3 12.5px/600 uppercase `.03em` in `dim`; tables collapsed at 12.5px with `panel-2` headers in uppercase `ident` at `.04em`; requirement ids `.fr` in `mono body-ui` `accent`, nowrap.

The renderer's visual range is **exactly what sanitized markdown-it output can be** — HTML disabled, DOMPurify applied, no raw HTML, no embedded styles, no images-by-markup from project documents. It must look intentional within that ceiling rather than like a document that failed to load. There is no refresh control and no editing affordance, because there is no edit path.

### Shell furniture

**Topbar** 42px `chrome`, 1px `line` bottom, 14px gaps. The brand mark is pure CSS — a 16px bordered square with an `::after` accent square inset 3px, at `.75` opacity. Breadcrumb separator is the literal `│`. **Segmented control** at `{typography.control}` (12px) size, `{rounded.DEFAULT}` radius; pressed is `[aria-pressed="true"]` → `#242b34` ground, `text-strong`, `inset 0 -2px 0 accent`. **Legend footer** 24px `chrome` with the badge in `legend-badge` on `legend-badge-bg`, uppercase `{typography.badge}` at `.08em`.

**Sysline** is the harness's own voice in the transcript: centred `{typography.label}` (10.5px) mono in `faint`, with a 1px `line` rule filling the space either side via `::before` / `::after`, margin `14px 2px 10px`. It carries session-resumed, handoff and room-opened notices. It is never styled as, or attributed to, a persona — see `EXPERIENCE.md` → *Voice and Tone*.

**Scrollbars** are custom: 10px wide, `#2b323b` thumb (`#3a434e` on hover), `{rounded.scrollbar}` (10px) radius, with a 3px transparent inset border and `background-clip: content-box` so the thumb reads as narrower than its track.

### Motion

Motion is **information or it does not exist**. AD-20: no element animates unless the thing it depicts is actually happening. Five declarations, all of them bound to a real event:

| Name | Declaration | Depicts |
|---|---|---|
| `pulse` | `1.5s ease-in-out infinite`; opacity `1 → .35 → 1` | A turn is in flight. Slow and shallow — nothing strobes |
| `blink` | `1.05s steps(1) infinite`; `50% { opacity: 0 }` | A caret at the tail of prose being written. **`steps(1)` is mandatory — a hard on/off, never a fade.** A fading caret reads as a decorative glow |
| `eq` | `.9s ease-in-out infinite`, height `3px → 8px`, delays `.15s / .3s / .45s` | Who is speaking right now. The only ambient-looking motion in the product, and it is bound to a single fact |
| reveal | `.16s ease` on `max-height` and `opacity` | A persona tile's menu hint opening. A reveal, not a slide |
| cast | `.25s ease` on `opacity`, `border-color`, `background` | The speaker changing |

There is no transition on colour elsewhere, no easing curve library, no spring, no entrance animation, no skeleton, no spinner — at any point, in any state.

Streaming prose arrives in frame-sized bursts, with the caret at the tail. **A per-character typewriter is not available and must not be simulated** — the mechanism and the argument are EXPERIENCE.md's (→ *State Patterns → Progress, batch commit and revision*).

**`@media (prefers-reduced-motion: reduce)` sets `* { animation: none !important; transition: none !important }` — globally, with no exceptions.** Not reduced: disabled. Every fact carried by motion must therefore also be legible with motion off, and nothing specified here may depend on movement to be understood. The per-signal mitigations — including what replaces the pulse as a liveness signal — are EXPERIENCE.md's (→ *Accessibility Floor → The `prefers-reduced-motion` hole*).

## Do's and Don'ts

| Do | Don't |
|---|---|
| Reference a token for every colour, dimension, radius and font stack | Write a literal colour, dimension, radius or font stack in a component — AD-14 calls this a **defect**, not a style preference |
| Ship `--red` in the verbatim `:root` block even though nothing referenced it in the mockup | Use `red` for disagreement, or `disagree` for failure — they are two tones with two meanings |
| Use `note` (`#7f9ce8`) for the blue *state* dot | Reuse the `accent` hex as a state, which is the exact defect AD-14 names |
| Keep four state **colours** — green, amber, red, note — and five dot states counting `faint` idle | Invent a fifth state colour, or colour-code by persona, module, file type or recency |
| Pick the right radius for the kind of object — eleven declarations, ten values, by role | Normalise everything to one radius "for consistency" — the variation is the encoding |
| Set document prose in `mono` and run notes in `sans` in the same card body | Separate the two feeds with a container, rule or label — the typeface register **is** the mechanism |
| Use `mono` for paths, state, metadata, timestamps and codes | Set a file path in sans, or a persona's sentence in mono |
| Use 600 for emphasis, or one step up the text ramp | Use both at once, add a third weight, or emphasise with colour |
| Render portraits at 32 / 36 / 38 / 44 only, and use initials below that | Render a portrait at 20px — AD-16's "legible from 20px" is explicitly relaxed to 32px |
| Keep the portrait generator pure: no ids, no gradients, no clip paths, no defs, no external assets | Introduce anything that can collide between two portraits in one document |
| Keep every face on the single neutral expression in v1 | Let the face carry state — the state dot carries state |
| Render `icon` from config as plain text in the harness's own register | Render `icon` as a portrait, ever, including as a fallback |
| Animate only what is actually happening | Animate a transition, a reveal, an entrance, or anything decorative; substitute a spinner or skeleton at any point |
| Use `steps(1)` for the caret | Fade the caret — a fading caret is decoration |
| Disable **all** animation and transition globally under `prefers-reduced-motion: reduce` | Keep "essential" animation running, or leave a fact legible only while something moves |
| Restate any `faint`-tier fact at `dim` or above | Put a fact only a user can act on at `faint` or `{colors.meta}` on `bg` — the locked ramp makes that a real contrast risk |
| Express absence and inattention with opacity | Remove a chosen persona's face from the room |
| Build the party side panel with the *Room* section only, at its new width | Implement AD-14's 288px, or reserve slots for the deferred disagreement and decision sections |
| Let the rail stay monochrome and dense | Turn the rail into a dashboard with colour-coded rows or badges |
| Ship dark only | Add a light palette, a `prefers-color-scheme` branch, or a high-contrast variant |
