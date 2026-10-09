---
name: 'bmad-visual-harness'
type: design-spine
description: 'Dense, hairline-ruled desktop shell in two themes, dark and light, whose entire restraint budget is spent on one thing: illustrated portraits of plausible colleagues.'
status: final
created: '2026-09-24'
updated: '2026-10-09'
sources:
  - ../../../specs/spec-bmad-visual-harness/SPEC.md
  - ../../../specs/spec-bmad-visual-harness/ui-surfaces.md
  - ../../../specs/spec-bmad-visual-harness/execution-model.md
  - ../../../specs/spec-bmad-visual-harness/bmad-install-contract.md
  - ../../../specs/spec-bmad-visual-harness/scope-tiers.md
  - ../../architecture/architecture-bmad-harness-2026-09-23/ARCHITECTURE-SPINE.md
  - ../../../brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html
  - mockups/welcome-screen-chosen.html
  - mockups/light-theme.html
  - mockups/follow-the-thread.html
  - mockups/output-folder.html
  - mockups/rail-resize-collapse.html
companions:
  - EXPERIENCE.md

colors:
  # ── The :root block, verbatim from harness-mockup.html, source order.
  #    2026-10-08: the dark palette is neutral near-black and near-white (no #000, no #fff);
  #    the earlier blue-tinted slate and blue accent are gone. Status hues stay, muted.
  #    AD-14: design/tokens.css opens with this block copied unchanged.
  bg: '#0d0d0e'
  chrome: '#111112'
  panel: '#151516'
  panel-2: '#1a1a1b'
  panel-3: '#202021'
  line: '#29292b'
  line-soft: '#1e1e20'
  text: '#dedee0'
  text-strong: '#f1f1f2'
  dim: '#9b9b9f'
  faint: '#6d6d71'
  accent: '#e3e3e5'
  accent-bg: 'rgba(227,227,229,.12)'
  green: '#7aa387'
  amber: '#b9a367'
  red: '#b88a84'
  # (--mono, --sans and --r live in `typography` and `rounded`; they are part of
  #  the same verbatim :root block and are not restated here.)

  # ── NEW. The token AD-14 names as missing. The mockup writes the accent hex
  #    literally into stateDot("note"); this separates the note state from the accent.
  note: '#8e8e93'

  # ── NEW. The warm friction tone. Currently three literals in the mockup.
  #    Distinct from `red`: red is failure, disagree is friction.
  disagree: '#d0968c'
  disagree-border: 'rgba(184,138,132,.3)'
  disagree-bg: 'rgba(184,138,132,.09)'

  # ── Promoted literals. Each already exists in the mockup as a hardcoded value;
  #    AD-14 calls a literal in a component a defect, so each recurring one gets a name.
  accent-border: '#434343'      # option key, skill-button code chip, run-note `kind:decision` tag
  accent-wash: 'rgba(227,227,229,.045)'   # user-turn background
  accent-edge: 'rgba(227,227,229,.45)'    # user-turn 2px inset rule
  halo-live: 'rgba(122,163,135,.14)'
  halo-work: 'rgba(185,163,103,.13)'
  meta: '#626262'               # 5 uses; the tier below `faint`, timestamps and micro-labels
  ink-doc: '#c2c2c2'            # document-card prose body
  ink-doc-strong: '#eaeaea'     # heading inside document-card prose
  ink-doc-mute: '#767676'       # muted run of document-card prose
  ink-md: '#d4d4d4'             # rendered markdown body in the document window
  code-bg: '#202020'
  code-ink: '#cccccc'
  initials-bg: '#323232'
  initials-line: '#414141'
  initials-ink: '#b2b2b2'
  win-line: '#3a3a3a'
  scrim: 'rgba(8,8,9,.55)'
  legend-badge: '#c9a78a'
  legend-badge-bg: 'rgba(201,167,138,.08)'
  legend-badge-border: 'rgba(201,167,138,.3)'

colors-light:
  # ── The light theme (2026-10-09, the dark theme reversed; was palette A "cool paper"). One twin per colour token in
  #    design/tokens.css, keyed by the CSS variable name without `--`. Lands in a third
  #    block, `:root[data-theme="light"]`; the verbatim block and the promoted block above
  #    it are the dark theme and do not change. Surfaces mirror the dark ramp: each rising surface is a step darker than the ground.
  bg: '#f2f2f2'
  chrome: '#eeeeee'
  panel: '#eaeaea'
  panel-2: '#e5e5e5'
  panel-3: '#dfdfdf'
  line: '#d5d5d5'
  line-soft: '#e0e0e0'
  text: '#202020'
  text-strong: '#0e0e0e'
  dim: '#505050'
  faint: '#696969'
  accent: '#1b1b1b'
  accent-bg: 'rgba(27,27,27,.12)'
  green: '#4e7059'
  amber: '#786737'
  red: '#915a53'
  note: '#454545'
  disagree: '#a25042'
  disagree-border: 'rgba(145,90,83,.3)'
  disagree-bg: 'rgba(145,90,83,.09)'
  accent-border: '#bcbcbc'
  accent-wash: 'rgba(27,27,27,.045)'
  accent-edge: 'rgba(27,27,27,.45)'
  halo-live: 'rgba(78,112,89,.16)'
  halo-work: 'rgba(120,103,55,.16)'
  meta: '#858585'
  ink-doc: '#3d3d3d'
  ink-doc-strong: '#151515'
  ink-doc-mute: '#858585'
  ink-md: '#2b2b2b'
  code-bg: '#dfdfdf'
  code-ink: '#333333'
  initials-bg: '#cdcdcd'
  initials-line: '#bebebe'
  initials-ink: '#4d4d4d'
  win-line: '#c5c5c5'
  scrim: 'rgba(8,8,8,.35)'
  legend-badge: '#88603f'
  legend-badge-bg: 'rgba(136,96,63,.08)'
  legend-badge-border: 'rgba(136,96,63,.3)'
  cast-speaking-border: '#a9a9a9'
  cast-speaking-ground: '#dedede'
  grad-cast: 'linear-gradient(180deg,#e6e6e6,#eaeaea)'
  grad-titlebar: 'linear-gradient(180deg,#d6d6d6,#dddddd)'
  brand-mark-line: '#b1b1b1'
  topbar-sep: '#bebebe'
  raised: '#d5d5d5'
  scrollbar-thumb: '#cecece'
  scrollbar-thumb-hover: '#bdbdbd'
  tile-current: '#dadada'
  code-tag-bg: '#dfdfdf'
  composer-focus-line: '#b7b7b7'
  composer-placeholder: '#858585'
  send-bg: '#c6c6c6'
  send-line: '#b4b4b4'
  send-ink: '#212121'
  send-hover: '#bdbdbd'
  win-light: '#bebebe'
  ghost-border-hover: '#bfbfbf'
  skill-button-hover-line: '#aeaeae'
  shadow-window: '0 30px 70px -20px rgba(8,8,8,.35)'
  shadow-speaking: '0 0 0 1px rgba(27,27,27,.22), 0 6px 18px -10px rgba(8,8,8,.18)'

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
  sidebar: 244px              # the Team sidebar's DEFAULT width: resizable, see sidebar-min / sidebar-max
  sidebar-min: 200px
  sidebar-max: 400px
  rail: 300px                 # the Outputs panel's DEFAULT width: resizable, see rail-min / rail-max
  rail-min: 260px
  rail-max: 480px
  chat-min: 420px             # the chat column never narrows below this when either side panel grows
  topbar: 42px
  rail-head: 30px
  legend: 24px
  thread-max: 940px
  party-thread-max: 900px
  chat-sub-max: 72ch
  doc-read-max: 70ch
  # Welcome (2026-10-08). The one surface that carries no simultaneous states, so the one surface with room.
  welcome-col: 560px          # head, open action, recent
  welcome-team-max: 960px     # the four phase lanes
  welcome-window: '1080px × 720px'
  win-width: 'min(880px,92vw)'
  win-height: 'min(760px,80vh)'
  win-titlebar: 36px
  win-foot: 28px
  card-body-max: 230px
  composer-min: 20px
  composer-max: 120px
  # 288px is superseded for v1 — see Layout & Spacing.
  party-side: 240px   # DECIDED, and now the DEFAULT width: resizable, see party-side-min / -max
  party-side-min: 200px
  party-side-max: 400px
  party-main-min: 480px       # the party column never narrows below this when the panel grows

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
    currentBackground: '#252525'
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
    hoverBorder: '#515151'
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
    caret: '{components.document-card.caret}, the same caret, at the tail of the last paragraph while the turn is in flight'
    stateLine: 'the `work` state line ({components.status-dot} work, `working · <elapsed>`) under the words, margin-top {spacing.md}, while the turn is in flight'
    pending: 'a persona turn with no words yet: portrait, head timed from the turn''s start, the caret as the whole body, the state line under it'
    roomPending: 'the room before a speaker is known: the turn container with no portrait, no head and no caret, only the state line'
    max: '{spacing.thread-max}'
  composer:
    background: '{colors.panel}'
    border: '1px solid {colors.line}'
    radius: '{rounded.card}'
    focusBorder: '#484848'
    placeholder: '#636363'
    sendBackground: '#393939'
    sendBorder: '#4b4b4b'
    sendColor: '#dedede'
    sendHover: '#424242'
    min: '{spacing.composer-min}'
    max: '{spacing.composer-max}'
    inner: '{spacing.thread-max}'
  cast-card:
    radius: '{rounded.card}'
    minWidth: 148px
    opacityIdle: '0.42'
    opacityHover: '0.72'
    opacitySpeaking: '1'
    speakingBorder: '#565656'
    speakingBackground: '#212121'
    speakingShadow: '0 0 0 1px rgba(227,227,229,.22), 0 6px 18px -10px rgba(6,6,7,.8)'
    portraitSize: 44px
  welcome:
    window: '{spacing.welcome-window}, opened by main, no project'
    ground: '{colors.bg}'
    topbar: 'brand · `│` · `no project open` in {typography.label} {colors.faint}; no chips, no view switch'
    mark: '30px bordered square, ::after inset 5px, accent at .75 (the topbar mark at the larger size)'
    title: '{typography.h1} text-strong'
    tagline: '{typography.ident} sans, {colors.dim}'
    column: '{spacing.welcome-col}'
    teamMax: '{spacing.welcome-team-max}'
    open-button: 'the composer send button, unchanged: #393939 ground, #4b4b4b border, #dedede text, #424242 hover, {rounded.control}'
    drop-zone: '1px dashed {colors.line}, {colors.panel} ground, {rounded.card}, padding 18px 20px'
    drop-zone-active: 'border {colors.accent-border}, ground {colors.accent-bg}'
    drop-hint: '{typography.meta} mono, {colors.dim}'
    recent-row: 'name {typography.base} sans {colors.accent} · path {typography.ident} mono {colors.dim} · age {typography.meta} mono {colors.faint}, right'
    recent-row-missing: 'name {colors.dim}, not underlined on hover, `folder missing` in {typography.label} mono {colors.dim} where the age was'
    lane-label: '{typography.label} mono uppercase, {colors.faint}, then a 1px {colors.line} rule filling the row, then the lane number in {typography.badge} {colors.meta}'
    lane-columns: '1fr 2fr 1fr 1fr, gap 10px (planning holds two cards)'
    persona-card: '{colors.panel} ground, 1px {colors.line}, {rounded.card}, padding 12px 12px 11px, gap 8px'
    portraitSize: 44px
    opacity: '1 — these are not a room, so nothing is dimmed'
    theme-line: '{typography.meta} mono along the bottom edge, right-aligned: `theme · system · light · dark`; the current word {colors.text-strong}, the others {colors.accent}, hover underlines'
  follow-control:
    label: '`↓ latest` — literal text, no count, no dot, no word that says anything is new'
    type: '{typography.label} mono, {colors.dim}'
    ground: '{colors.panel-2}'
    border: '1px solid {colors.line}'
    radius: '{rounded.control}'
    padding: '3px 11px'
    hover: '{colors.panel-3} ground, {colors.text-strong}'
    position: 'centred on the thread, 12px above the composer, floating over the text it covers'
    motion: 'none — it appears and goes in one frame'
    opacity: '1'
  outputs-head:
    height: '{spacing.rail-head}'
    label: '`outputs` — the head every rail half already has'
    where: '{typography.meta} mono (10.5px), {colors.dim}, right-aligned: the watched folder, project-relative, trailing slash'
    change: '`change…` — {typography.meta} mono, {colors.accent}, no border, underline on hover; sits right of the folder'
    state-line: '{typography.meta} mono, {colors.dim}, on {colors.panel}, padding 5px 11px, a 1px {colors.line-soft} rule below; present only while there is a state to say, one line, never two'
    group-label: 'the first group in the list is the watched folder itself, `{typography.badge}`-tier as every group label'
    colour: 'none — every state is text; no amber, no red, no icon'
  splitter:
    hit: '9px wide, full height of the panel, centred on the panel''s inner border, cursor col-resize'
    line: '1px {colors.line} (the panel border) at rest; {colors.accent-border} 3px on hover; {colors.accent} 3px while dragging or focused'
    focus: 'the 3px accent line plus the shared ring {components.focus.ring}'
    motion: 'none — the panel follows the pointer one frame at a time; no easing, no snap'
    reset: 'double-click, or Enter when focused, returns the panel to its default width'
    keys: 'ArrowLeft grows a panel on the right 16px, ArrowRight shrinks it 16px; the Team sidebar, on the left, is the reverse (ArrowRight grows); Shift 64px; Home min, End max'
    aria: 'role=separator, aria-orientation=vertical, aria-label, aria-valuemin/max/now'
    hidden: 'at ≤1000px (stacked layout) and wherever the panel is hidden (party side ≤1180px)'
  folder-heading:
    type: '{typography.badge}-tier mono 10px, tracking .04em, {colors.dim}; hover {colors.text-strong}'
    chevron: 'one inline stroked path, 9px, 1.4 weight, round caps, currentColor; points right when collapsed, down when open; no rotation transition'
    layout: 'full row button, padding 8px 11px 3px, gap 6px: chevron · folder path (ellipsis) · live state at the right'
    live-state: 'while collapsed and a row under it is `changing`: {colors.amber} dot with the pulse, and the word `changing` in {typography.meta} mono'
    count: 'none — a collapsed folder shows no number of files'
    focus: 'the shared ring, inset (-2px) so it is not clipped by the rail'
  document-window:
    radius: '{rounded.window}'
    background: '{colors.panel}'
    border: '1px solid {colors.win-line}'
    shadow: '0 30px 70px -20px rgba(6,6,7,.85)'
    titlebar: 'linear-gradient(180deg,#292929,#222222), height {spacing.win-titlebar}'
    lights: '10px {rounded.full} #414141'
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
    pressed: '[aria-pressed=true] -> #2a2a2a ground, text-strong, inset 0 -2px 0 accent'
---

## Brand & Style

The harness is a dark, dense, hairline-ruled desktop shell that reads as an instrument, not an app. Every visual decision in it is downstream of one sentence from the architecture: *"if it reads as a chat box with a portrait glued on, it has failed regardless of feature completeness."*

The restraint is not minimalism as taste. It is a budget. Real illustrated faces carry the entire premise — presence, a room where a team visibly works — and the named top risk is that those faces read as childish and take the perceived intelligence down with them. Every other surface is therefore pulled back to the point of being nearly invisible so the portraits are the only thing in the product with warmth in it. Surfaces step up in five near-identical greys. Borders are hairlines. There is one accent. There is no icon font, no emoji, no image file, no gradient outside two chrome fills, and exactly one non-default font weight in the whole system. Glyphs in copy are literal Unicode (`→ ↔ · § ≈ —`); **`⌘↵` is not in the inventory**, because the composer sends on `Enter` (EXPERIENCE.md → *Accessibility Floor → Keyboard reach*).

Information density is high and deliberate: the densest type tier is 10.5px and it is the most-used size in the product. This is a tool for an engineer reading state, not a consumer surface. Nothing is padded to feel generous.

**Two themes, one design.** Dark is the theme the product was designed in; light (2026-10-08; repainted 2026-10-09 as the dark theme reversed) is its twin and is chosen, not inferred: *System* (the default, following the OS), *Light* or *Dark* (EXPERIENCE.md → *Theme*). No stylesheet and no component reads `prefers-color-scheme`, and there is no high-contrast variant. Every rule in this document holds in both themes, and the restraint budget most of all: the portraits are the only thing with warmth in either one, which is why the light palette is neutral grey.

Two tonal rules govern everything below. **One accent, one friction colour.** The accent, a soft off-white, is the system's voice; the warm tone belongs to disagreement and to nothing else — friction is the one thing given its own colour, because friction is the feature most likely to be sanded off in implementation. **State is never decoration.** Four state colours exist and every one of them is driven by a real system fact.

**The ownership convention, stated once and used throughout.** Anatomy and appearance are specified here, in DESIGN.md. Triggers, transitions, data sources and keyboard behaviour are specified in EXPERIENCE.md. Where a state is named here, what drives it and when it changes live there; where a component is named there, what it looks like lives here.

## Colors

### The locked ramp

The `:root` block above is copied from `harness-mockup.html` unchanged, in source order, per AD-14. `design/tokens.css` opens with it. It is not a starting point to be tuned.

**Surfaces** step `bg → chrome → panel → panel-2 → panel-3`, each roughly four points of lightness above the last. `bg` is the application ground. `chrome` is the topbar and the legend footer — furniture, one step darker than a panel so it recedes below the content it frames. `panel` is a card or window body. `panel-2` is a card head or foot, a raised row, a tag ground. `panel-3` is the top of the ramp and is used **exactly once** in the mockup, on `.skillbtn:hover`; it is the hover ceiling, not a general surface.

**Hairlines** are two: `line` for a visible separation between two things, `line-soft` for a rule inside one thing (a card's head from its body). The distinction is load-bearing at this contrast — using `line` internally makes a card read as three stacked cards.

**Text** steps `text-strong → text → dim → faint`, with a fifth informal tier `{colors.meta}` (`#626262`) below `faint` used for timestamps and micro-labels. The ramp is fixed and **a component may not adjust it**. **Within the text ramp, hierarchy comes from which tier you pick, not from opacity** — this is a rule about text only. Opacity carries *presence* elsewhere in the product, deliberately and by its own rule (see *Elevation & Depth*).

> **Contrast risk, accepted.** `faint` (`#6d6d71`) on `bg` (`#0d0d0e`) is a low-contrast pairing that the locked ramp bakes in, and `{colors.meta}` is lower still. Stakes here are hobby and no WCAG conformance target is set, but the risk is real and named: do not put anything at `faint` or below that is the *only* carrier of a fact. Every `faint` string in the product must be a restatement of something also legible at `dim` or above, or a label whose absence costs nothing.

### Accent

`accent` (`#e3e3e5`) is the single chromatic voice: the current-persona edge on a tile, the pressed underline on the segmented control, the caret at the tail of words being written (a document card's prose, a persona's turn in flight), the skill-button code chip, the decision-option key, the requirement ids in rendered markdown (`.fr`), and the speaking ring on a cast portrait. `accent-bg` is its 12% fill and is the only accent *fill* in the product — accent is a line, an edge, a chip border, almost never a surface.

Accent is not a state. That distinction is the reason for the next token.

### `note` — the token AD-14 says is missing

The mockup writes `background:#e3e3e5` literally inside `stateDot("note")`, reusing the accent hex as the note-dot state. AD-14 names this as the one token that must be *added* rather than copied, so the accent and the note state are distinguishable (AD-14 wrote "blue-as-accent and blue-as-state"; the dark accent is no longer blue, the need is the same).

**`note: #8e8e93`.** Dimmer than `accent` and a step above `dim`, distinguishable side by side, not distinguishable as an error. It is used by exactly one thing: the persona-tile dot meaning *a document this persona owns changed on disk*. Nothing else may use it, and the `note` dot may not use `accent`.

State **colours** in the product are therefore **four and only four**: `green` live, `amber` work, `red` error, `note` (a mid grey). Every indicator anywhere resolves to one of those or to `faint` idle — so with idle counted there are **five dot states in all**, carried by four colours (EXPERIENCE.md → *State Patterns*).

### `red` vs `disagree` — two warm tones, two different meanings

`--red: #b88a84` is in the verbatim `:root` block and must be shipped there. **It is never referenced by `var()` anywhere in the mockup.** That is worth stating rather than quietly fixing: the mockup's only warm-toned element is the disagreement tag, which is written as three literals — `#d0968c` text, `rgba(184,138,132,.3)` border, `rgba(184,138,132,.09)` background — and `--red` sat unused because the two are not the same colour and never were.

They are now two tokens with two jobs and they must not be conflated:

- **`red` (`#b88a84`) is failure.** The persona-tile `error` dot; a run that failed or was stopped. It is an alert and carries no substance — the substance of a failure belongs in the conversation in the persona's own voice (AD-20, CAP-12). No error text is ever tinted red.
- **`disagree` (`#d0968c` / `.3` border / `.09` fill) is friction.** The party transcript's `disagrees · <name>` and `disagrees · framing` tags, and the `kind:open` tag in the run-note feed. An unresolved question is friction, not failure. This is **the only warm-toned chip on screen; friction is the one thing given its own colour.**

The tell is: red says *something broke*, disagree says *someone is pushing back*. A product whose premise is that team disagreement is a thrill cannot render disagreement in its error colour.

`disagree` is derived from the same base as `red` (`rgba(184,138,132,…)` is `#b88a84` with alpha) but resolves lighter and warmer on `panel`. Keep both.

### Promoted literals

The remaining tokens in the block above are not new colours. Each is a value already hardcoded in the mockup that a component would otherwise have to restate — `accent-border` (`#434343`, shared by the option key, the skill-button code chip and the run note's `kind:decision` tag), the two dot halos, the document-card and markdown ink tiers, the initials trio, the window border and scrim, the legend badge. AD-14: *"A literal colour, dimension, radius or font stack in a component is a defect."* Naming them is how that rule is satisfied, not a palette expansion.

### The light theme

*The dark theme reversed (2026-10-09).* It replaces palette A, "cool paper", the blue-tinted slate-and-white theme that shipped first; the idea behind the dark theme's neutral move now carries over: no tint, a neutral accent, muted status hues. The mockups are `mockups/light-a-shell.html` and `light-a-welcome.html`, repainted to this palette; `light-theme.html` and the `light-b-*` pair are kept as the record of the two palettes first compared. The twins are the `colors-light` map in the frontmatter, one for every colour token in `design/tokens.css`.

**How it is built.** The verbatim `:root` block and the promoted block that follows it stay as they are: they are the dark theme. The light values arrive as a **third block, `:root[data-theme="light"]`**, overriding colour tokens only, with `color-scheme: light` stated to the user agent in the same block (so form controls, scrollbars and the caret agree). No dimension, radius, type size or motion changes with theme, and **no component names a theme**: a component that takes every colour from a token is correct in both. The attribute is set by main before a window is first shown, from the stored choice and the OS appearance; the page never asks the browser which scheme is preferred.

**How it is derived.**
- **Every grey is the dark grey mirrored.** Each dark neutral becomes its complement about the middle (`255 − x` per channel, then pure grey), so there is no blue in the ramp and no pure white or black anywhere: `bg #f2f2f2`, `chrome #eeeeee`, `panel #eaeaea`, `panel-2 #e5e5e5`, `panel-3 #dfdfdf`, hairlines `line #d5d5d5` and `line-soft #e0e0e0`. The ramp is reversed with the theme, so a surface that rises is **a step darker** than the ground, exactly as a dark surface is a step lighter: a card reads as set into the page, not lifted off it. Same five greys, same two hairlines, no new surface tier.
- **The accent is a near-black.** `accent #1b1b1b` is the dark accent's `#e3e3e5` reversed. It is still a line, an edge, a chip border, almost never a surface, and `accent-bg` is its 12% wash. The send button stays quiet: `send-bg #c6c6c6` with `send-ink #212121`, no blue and no filled accent button.
- **Text tiers are the dark ones reversed, then corrected where the mirror would fail.** `text #202020` and `text-strong #0e0e0e` are the plain mirrors. The mirrored `dim` and `faint` would be too light on a darker panel, so `dim` is `#505050` and `faint` is `#696969`, the lightest grey that still clears 4.5:1 on `panel`. `meta #858585` is the one tier left below 4.5, as in dark. `note` is `#454545`: a step darker than `dim`, distinct from the idle dot.
- **The four state colours keep their meaning and stay muted.** Green `#4e7059`, amber `#786737` and red `#915a53` keep each dark hue and saturation and are darkened until each clears 4.5:1 on `panel`. The halos around the live and work dots are strengthened to `.16`, because a glow reads weaker on a light ground. `disagree #a25042` stays a distinct warm tone and is not `red`.
- **Document ink reverses with the page.** `ink-doc #3d3d3d`, `ink-doc-strong #151515`, `ink-md #2b2b2b`; the document card's mono body and the markdown window read as dark-on-grey.
- **Shadows and the scrim are neutral and low.** The window shadow is `0 30px 70px -20px rgba(8,8,8,.35)`, the speaking cast card's shadow likewise, the scrim `rgba(8,8,8,.35)`. A dark theme's alpha would read as dirt on a light ground.
- **Portraits are identical in both themes.** Backdrops stay the dark tones in the parameter table, so on a light page the faces read as dark discs and remain the strongest thing on screen. `ArtParams` gains no theme field and a portrait's markup does not vary with theme.

**Measured contrast** (WCAG ratio of the foreground against the surface it sits on, from the twins above; dark is the shipped theme):

| Pair | Dark | Light |
|---|---|---|
| `text` on `bg` | 14.5 | 14.6 |
| `text-strong` on `panel` | 16.2 | 16.0 |
| `dim` on `panel` | 6.6 | 6.7 |
| `faint` on `panel` | 3.5 | 4.6 |
| `meta` on `bg` | 3.2 | 3.3 |
| `accent` on `panel` | 14.2 | 14.3 |
| `green` on `panel` | 6.4 | 4.6 |
| `amber` on `panel` | 7.4 | 4.6 |
| `red` on `panel` | 6.1 | 4.6 |
| `note` on `panel` | 5.6 | 8.0 |
| `ink-doc` on `panel` | 10.2 | 9.0 |
| `disagree` on `panel` | 7.3 | 4.6 |

Every light pair that carries text clears 4.5 except `meta` (3.3), which holds only timestamps and micro-labels and, as in dark, never an actionable fact. The "no actionable fact at `faint` or `meta`" rule is unchanged and is *easier* to keep in light, where `faint` reaches 4.6. The three status hues sit exactly at the floor because they are muted on purpose: darkening them further would make them heavier than the dark theme's quiet marks.

### What has no colour

No gradients except the two chrome fills (cast strip, window titlebar). No shadows carrying hue. No semantic colour on text below `dim` other than the four states. No colour-coding by persona, module, file type or recency — the portrait is the only per-persona colour in the product, and the rail is deliberately monochrome so it reads as a filesystem rather than a dashboard. (The proposed Board, below, is the one surface allowed to read as a dashboard, and it is monochrome too.)

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
| Rail | **348px** by default, **resizable 280–560px**, `flex:0 0`; the chat column keeps **420px** at least | 1:1 view, right side, split into two `flex:1 1 50%` halves — the **Team half** above, the **Outputs half** below |
| Room panel | **240px** by default, **resizable 200–400px**; the party column keeps **480px** at least | Party view, right side; hidden at ≤1180px |
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

| Welcome window | **1080 × 720** | Separate window, no project. Its column is **560px**, its lanes **960px** max |

Portrait render sizes are a closed set: **32** transcript, **36** persona tile, **38** chat header, **44** cast card. Persona tiles are 56px tall, so roughly six fit the Team half before it scrolls. **Tiles are grouped by the agent's `module` and `team` fields** (AD-10; the grouping rule is EXPERIENCE.md → *Interaction Primitives → Persona tile order*). The six-tile scroll limit is not the reason for the grouping — it is what makes the grouping load-bearing.

### Resizing the side panels

The side panels, the Team sidebar and the rail in 1:1 and the Room panel in Party Mode, each have a **splitter** on their inner edge (Components → Splitter). The widths above are **defaults**. *Updated 2026-10-09:* the 1:1 view's single 348px rail became a 244px sidebar and a 300px rail, so the rule *348px is binding* (AD-14) no longer holds for it and a stored rail width is read against the new range (inside 260–480px it is kept as stored, outside it reads as the default; nothing is migrated); *288px must not be implemented* still stands for the party panel's default. The ranges are fixed constants and the panels never overlap the column they border: the maximum is the smaller of the cap and what leaves the neighbouring column its minimum, where in 1:1 the sidebar and the rail each leave the chat column its 420px given the other's width. The three widths are independent, and each is remembered per user.

### The party side panel — 288px is superseded

AD-14 binds **288px** as a literal for the party side panel. **That literal does not ship in v1.**

The mockup designs three sections into that panel — *Room*, *Open disagreements*, *Decisions so far*. `scope-tiers.md` defers the latter two, so **v1 ships the Room section only**. What renders and what does not, and why, is EXPERIENCE.md's ruling (→ *Party Mode*); what follows here is the width that ruling leaves behind.

Consequently the panel is resized to its remaining content: four key/value rows on a 74px key column at `label`/`body-ui`. **v1 width: 240px — decided.** No source specifies a replacement value; 240px is sized to the Room panel's own content, a 74px key column plus its values. The alternative considered and rejected was dropping the panel entirely and moving Room into the party header; narrowing wins because it leaves the deferred *Open disagreements* and *Decisions so far* sections somewhere to land later without a relayout. **288px must not be implemented**, and the panel must not be built with slots reserved for the deferred sections.

### The welcome is the one surface that breathes

Everything else in the product is dense on purpose: *whitespace here costs visible state* (below). The welcome carries no state — nothing is running, nothing is being written, nothing can change while it is open except the user's choice — so there is nothing for whitespace to cost, and it takes the VS Code start page's rhythm instead: a 560px centred column, 18–22px between blocks, a hairline `line` rule before the team. This is a scoped exception and not a loosening. **No other surface may borrow it**, and the welcome does not borrow the rail's density in return.

### Spacing is a ladder, not a scale

Gaps in use are `1.5 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 12 · 14`, with 8, 6 and 10 doing most of the work. Padding is genuinely not on a scale — the mockup uses 34 distinct padding combinations, tuned per component to a dense optical rhythm rather than derived from a step. Do not regularise them. The named paddings that matter are specified per component below; elsewhere, match the neighbouring component rather than reaching for a step.

Vertical rhythm is tight everywhere. Rows are 5–7px of vertical padding, chips are 0–1px. The product is meant to be read at a glance across many simultaneous states, and whitespace here costs visible state.

### Responsive

Desktop-first, one project per window, `body{overflow:hidden}` at full size. Two breakpoints only:

- **≤1180px** — the party side panel is hidden outright.
- **≤1000px** — the shell unlocks scroll (`body{overflow:auto}`, `.app{height:auto}`), both views stack to a column, the chat column takes `min-height:62vh`, the rail moves below the chat and switches its `border-left` to a `border-top` with each half at `min-height:230px`, cast cards wrap at `flex:1 1 44%`, and the topbar wraps to `height:auto` with the breadcrumbs pushed to their own full-width row.

- The **welcome** takes the second breakpoint only: at **≤1000px** its window scrolls (`overflow:auto`) and the four lanes stack to one column of cards. It adds no breakpoint of its own.

There is no mobile target and no third breakpoint.

## Elevation & Depth

Depth is tonal, not cast. The five-step surface ramp *is* the elevation system: a thing is "above" because it is one step lighter and has a hairline around it, not because it has a shadow. There is no elevation scale, no `z1/z2/z3`, and no hover-lift anywhere.

Shadows exist for exactly three jobs, and only three:

1. **State halos** — a 3px spread ring at very low alpha around a live (`halo-live`) or work (`halo-work`) status dot. This is the dot reading as lit, not as raised.
2. **Inset rules** — `inset 0 -2px 0 accent` under the pressed segmented button; `inset 2px 0 0 accent-edge` on a user turn; `inset 2px 0 0 accent` on the live party turn. These are edges drawn with a shadow, not depth.
3. **True separation** — the document window, which is a separate OS window over a scrim and is the only element in the product entitled to a real shadow: `0 30px 70px -20px rgba(6,6,7,.85)` over a `scrim` fill. The speaking cast card gets a restrained version — `0 0 0 1px rgba(227,227,229,.22), 0 6px 18px -10px rgba(6,6,7,.8)` — because it must read as lifted out of a row of dimmed peers, and the 2px accent ring on its portrait belongs to the same gesture.

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
- `initials-bg` (`#323232`) fill, 1px `initials-line` (`#414141`) border, `mono` in `initials-ink` (`#b2b2b2`), centred.
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

56px row: 36px portrait, name at `name` (12.5px/600) with the title beside it at `ident` in `dim`, and a state line below at `label` with its dot. Default ground is transparent; hover is `panel-2` and reveals the menu hint; **current** is `[aria-current="true"]` → `#252525` ground with a 2px `accent` left bar via `::before`. The menu hint expands `max-height: 0 → 60px` over `.16s`.

### Rail row (Outputs half)

Two visually distinct registers on one line, because AD-2 forbids merging them. The **disk state** (from the watcher) is the row's own typography — file name at `{typography.body-ui}`, directory line at `{typography.meta}`, state string at `{typography.label}`. The **run annotation** (owner, section in flight, `stopped`) is optional and must be able to be absent without the row looking broken. When a file is being written: name goes `text-strong`, meta goes `amber`, the icon stroke goes `amber`, and the dot pulses. Otherwise the icon stroke is `faint`. The file icon is a 12×14 inline SVG of two paths (page plus folded corner) at `stroke-width:1`, rendered at `.75` opacity. The rail is otherwise entirely monochrome.

### Document card

`{rounded.card}` radius, `panel` body, 1px `line` border, three parts.

- **Head** — `panel-2` ground, `1px line-soft` bottom rule, `7px 11px`. Status dot · file path in `mono` `{typography.ident}` at `text` · status string in `mono` `{typography.meta}` right-aligned in `amber` while writing and `green` when saved · elapsed in `mono` `{typography.meta}` at `faint` · the stop control.
- **Body** — `max-height: 230px`, scrolling, padding `11px 13px` `[ASSUMPTION]` (the one value no source states; matched to the side-section padding). **Two modes, both content, per the approved dead-air treatment.** In prose mode: `doc-prose` (mono 11.5/1.72) in `ink-doc`, `white-space: pre-wrap`, headings in `ink-doc-strong` at 600, muted runs in `ink-doc-mute`, with the streaming caret at the tail. In run-note mode: the run-note feed (below). The card never has an empty body. Which mode is showing, and when it switches, is EXPERIENCE.md's (→ *State Patterns → Document card*).
- **Foot** — `panel-2`, `1px line-soft` top rule, `6px 11px`, `{typography.label}` at `faint`, 14px gaps, wrapping. Carries the counts and the **named list of not-yet-written sections** in `mono`. There is no denominator and no progress bar anywhere in the card.
- **Caret** — 6.5 × 13px `accent` block, `blink 1.05s steps(1)`. Removed, not faded, when writing stops. It is one caret, shared with the conversation turn in flight (below): the same class, size, colour and blink wherever words are being written.

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

`panel-2` ground, 1px `line`, `{rounded.control}` (4px) radius, `{typography.body-ui}`. Carries a leading code chip in `{typography.micro}` mono, `accent` on transparent with an `accent-border` border at `{rounded.micro}` (2px) radius — one step tighter than its parent. Hover: border `#515151`, ground `panel-3`. The `+N more` variant renders in `faint`.

The row must look right at **1 to 10 entries**. Its overflow behaviour — in-place expansion, and what must never happen instead — is EXPERIENCE.md's (→ *Component Patterns → `+N more`, in detail*).

### Conversation turn

The conversation's most-repeated element, and the one the radius table names only in passing. A `{rounded.card}` (6px) container padded `12px 10px` with a 12px gap, successive turns 2px apart: a 32px portrait on the left, and on the right a header line over the words.

The header is the name at `{typography.name}` (12.5px/600, `text-strong`), the role at `{typography.ident}` (11px, sans, `faint`) and the timestamp in mono at `{typography.meta}` (10px, `meta`), pushed to the right edge. The words follow at `{typography.body-ui}` in sans, `white-space: pre-wrap`, with paragraphs split on blank lines and nothing else: no prefix, frame, label, summary or classification of what a persona said. Everything a project or a persona supplies is rendered as text.

**The user's turn** is the same container on the `accent-wash` ground with an `inset 2px 0 0 accent-edge` rule down its left edge, and the 32px initials token where the portrait would be — the user has no generated face. The wash and the rule are the only difference; the user's turn is not a different component.

No hover lift, no entrance animation, no typewriter reveal. The thread caps at `{spacing.thread-max}`.

**A turn in flight** is drawn in the thread with these same parts and nothing new. While a persona's turn is in flight, the **caret** (the document card's: 6.5 × 13px `accent`, `blink`) sits at the tail of the last paragraph of its words, inside the paragraph and after the last character, and the persona's **`work` state line** sits under the words: the amber dot with its halo and pulse, and `working · <elapsed>` in `{typography.label}` mono at `dim`, `{spacing.md}` below the words. Both are removed, not faded, when the turn ends; the words are then exactly as they were said.

- **The pending turn.** Before a persona's first word, the thread's foot carries a persona turn with no words: the same container, the 32px portrait and the head (name, role, the time the turn began), the caret as the **whole body**, and the state line under it. It is drawn from the same parts as a turn with words, and is replaced by the persona's turn when the first word lands, with the caret then at the tail of those words. It sits above any queued message of the user's, which keeps its own treatment.
- **The room's pending row.** In the party thread, before anyone is known to be speaking, the foot carries a row in the turn container with **no portrait, no head and no caret**: only the state line, counted from the user's send. Once a speaker's words land, their live turn (accent edge, as before) takes the caret and the state line, and the cast card lights as it always has.
- **Nothing else.** No skeleton of a turn, no placeholder word (`thinking`, `typing`, `…`), no spinner, no new animation: the pulse and the blink are the two the motion table already lists. Words arrive as main delivers them; a burst (an opening greeting comes from the CLI whole) lands whole and is never paced out.

### Composer

`panel` ground, 1px `line`, `{rounded.card}` (6px) radius. Focus-within moves the border to `#484848`. Placeholder `#636363`. Textarea autogrows 20px→120px, clamped in CSS and sized from its content. It is never disabled and takes the shared focus ring itself; the field's border shift is a second cue, not a replacement. `Enter` sends, `Shift+Enter` is a newline, and no other chord sends. Send button: `#393939` ground, `#4b4b4b` border, `#dedede` glyph, `{rounded.control}` radius, `#424242` on hover. Hint lines below at `{typography.label}` in `{colors.meta}`.

### Cast card

`{rounded.card}` radius, `flex:1 1 0` at `min-width:148px`, on a `linear-gradient(180deg,#191919,#151515)` strip that scrolls horizontally. 44px portrait, name at `{typography.name}`, title at `{typography.ident}`, status at `{typography.micro}`. **Default `opacity:.42`**, hover `.72`, speaking `1` with border `#565656`, ground `#212121`, the accent glow, a `0 0 0 2px accent` ring on the portrait, and status in `accent` with the equaliser. Presence is expressed by dimming, never by removal — every chosen portrait stays visible for the life of the room.

### Welcome

A window of its own, opened by main when the harness starts without a project and each time the last project window closes. It has the topbar (brand mark, `│`, `no project open`) and nothing else in it that is shell: no chips, no view switch, no rail, no composer.

**Head.** A 30px brand mark beside the title (`h1`, 20px/600, `text-strong`) and a one-line tagline (`ident`, sans, `dim`): `a visual harness for bmad projects`, which is the package description, said once.

**The open action** is one button and one drop zone, side by side in the same 1px dashed `line` box. The button is the composer's send button with a folder glyph drawn the way the rail row's file icon is: one inline stroked path, 15px, `1.4` weight, round caps, in `accent`, with no font and no file and the chord `⌘O` in `meta` mono beside the label. The label is `open project folder…`. The drop zone's own text, `drop a project folder here`, is mono at `dim`: it is an instruction a user acts on, so it does not sit at `faint`. While a folder is dragged over the window the box takes `accent-border` and an `accent-bg` ground; that is the whole feedback, with no animation.

**Recent** is a section label (`recent`, mono, `faint`) over rows. A row is the project's folder name in `accent`, the folder's parent path in mono at `dim` with the home directory written `~`, and its age at the right in `meta` mono (`2h`, `3d`). Hover underlines the name, as every link in the product does. A project whose folder is gone keeps its row, with the name at `dim`, no underline and the text `folder missing` in the age's place. **There is no install chip, count or version on a row**: the harness stats a folder here and runs no resolver for a row it has not opened.

**The team** sits under a full-width `line` rule: the label `the team` and one meta line (`the five core personas, by phase of the method · a project's own install can add more`). Four **lanes**, in the order of the method — `analysis`, `planning`, `solutioning`, `implementation` — each headed by its label, a rule and its number. A **persona card** is a 44px portrait, the name at `name` and the title at `ident`, with a two-to-three-line description in `body-ui` at `dim`. Two cards share `planning`, so that lane is twice the width. Cards are content, not controls: they take no focus, have no hover state and open nothing. **Portraits are at full opacity** (the dimming of a cast card means *not speaking*, and nobody is in a room here) and are the same `artParamsFor` faces as everywhere, at the same 44.

**The five descriptions are the harness's words about a role, not a persona's words.** They carry no first person, no quotation, and no instruction. They are written from each agent's `role`, shortened, and held as one table in the renderer (the welcome is the one place a roster is shown before any install has been read).

| Persona | Lane | Description |
|---|---|---|
| Mary · Business Analyst | analysis | Market and competitive research and requirements — the thinking done before a project is committed to. |
| John · Product Manager | planning | Turns the product vision into a validated PRD, then epics and stories development can execute. |
| Sally · UX Designer | planning | Turns user needs and the PRD into design and experience specifications that inform the architecture. |
| Winston · System Architect | solutioning | Converts the PRD and UX into the technical decisions that keep implementation on track. |
| Amelia · Senior Software Engineer | implementation | Implements approved stories test-first and ships code that has been run and verified. |

**The theme line** sits on the bottom edge of the window, right-aligned, in `meta` mono: `theme · system · light · dark`. The current choice is `text-strong` and is not a link; the other two are `accent` and underline on hover, as every link does. It exists only on the Welcome, where no state competes with it; once a project is open, the theme is reached from *View ▸ Theme* alone.

There is **no motion** on this window: no entrance, no hover transition on a card, no animated drop feedback. The page is at rest.

### Outputs head

The head the Outputs half already has (30px, `chrome`, `label` mono): `outputs` on the left, and on the right **the folder the rail is watching** in `meta` mono at `dim`, project-relative with a trailing slash (`_bmad/`, `docs/bmad/`), then `change…` in `accent`, an unbordered mono link that underlines on hover and takes the shared focus ring. Both are text the user reads or acts on, so neither sits at `faint`.

Below the head, **a state line appears only while there is a state to say** and is one line: `meta` mono at `dim` on `panel` with a 1px `line-soft` rule under it, padding `5px 11px`. It carries `bmad writes to · <folder>`, `<chosen> · folder missing` or `not changed · <reason>` (EXPERIENCE.md → *Output folder*) and nothing else. **It has no colour**: not amber, not red, no icon, no dot. A difference between two folders is a fact, and the product's four state colours are reserved for things happening.

The first group label in the list is the watched folder itself, so a file directly under it is headed by the same path the head shows; paths in every row stay project-relative.

### Follow control

`↓ latest`, in `label` mono at `dim` on `panel-2`, a 1px `line` border and `{rounded.control}` radius, centred along the bottom edge of the thread and 12px above the composer. It floats over the lines it covers, so its ground is opaque. It appears only while the thread is not following, and goes in the same frame as the thread returns to the bottom. **It has no count, no dot, no *new*, and no state of its own**: one literal string, always. Hover raises the ground to `panel-3` and the text to `text-strong`; focus takes the shared ring. The text is an action a user takes, so it sits at `dim` and not at `faint`. It is the same control, drawn the same way, in a persona's thread and in the party room, and in both themes through tokens alone.

The scrollbar, the shadow and the elevation ladder are not touched: this control casts no shadow, because the product reserves a shadow for the document window and the speaking cast card.

### Splitter

The edge of a side panel, drawn as the panel's own 1px `line` border with a 9px hit area centred on it. Hover widens the line to 3px in `accent-border`; dragging and keyboard focus make it 3px `accent`, and focus adds the shared ring. **It has no motion**: the panel follows the pointer one frame at a time, with no easing and no snapping to a width. Double-click, or `Enter` while it has focus, returns the panel to its default width. It is a `separator` with its value, minimum and maximum exposed, and it is not drawn at ≤1000px (the stacked layout) or wherever its panel is hidden.

### Folder heading

In the Outputs half, a directory group's heading is a button: a chevron, the directory path in `badge`-tier mono at `dim` (`text-strong` on hover), and, only while it is collapsed and a file under it is changing, the amber dot with the word `changing` at the right. The chevron is one inline stroked path like the file icon, and it changes direction without a transition. **There is no count of files.** The heading's whole row is the target and takes the shared ring, inset so the rail does not clip it. Collapsing hides the rows of that directory only; the headings of other directories are untouched.

### Document window

A separate OS window over a `scrim` fill at z-40, window at z-50, top `8vh`, `min(880px,92vw) × min(760px,80vh)`. `panel` ground, 1px `win-line` (`#3a3a3a`), `{rounded.window}` (8px) radius, `0 30px 70px -20px rgba(6,6,7,.85)`.

Title bar 36px on `linear-gradient(180deg,#292929,#222222)`: three 10px `#414141` circles, the **full path** in `mono` `{typography.ident}` (not the basename), then ghost buttons. Body `26px 34px 40px`. Foot 28px at `{typography.meta}`.

**Rendered markdown** is constrained to `70ch` at `doc-read` (sans 13.5/1.72) in `ink-md`. h1 20px/600 at `-.01em` with a mono `ident` sub-line in `faint` over a bottom rule; h2 14.5px/600; h3 12.5px/600 uppercase `.03em` in `dim`; tables collapsed at 12.5px with `panel-2` headers in uppercase `ident` at `.04em`; requirement ids `.fr` in `mono body-ui` `accent`, nowrap.

The renderer's visual range is **exactly what sanitized markdown-it output can be** — HTML disabled, DOMPurify applied, no raw HTML, no embedded styles, no images-by-markup from project documents. It must look intentional within that ceiling rather than like a document that failed to load. There is no refresh control and no editing affordance, because there is no edit path.

### Shell furniture

**Topbar** 42px `chrome`, 1px `line` bottom, 14px gaps. The brand mark is pure CSS — a 16px bordered square with an `::after` accent square inset 3px, at `.75` opacity. Breadcrumb separator is the literal `│`. **Segmented control** at `{typography.control}` (12px) size, `{rounded.DEFAULT}` radius; pressed is `[aria-pressed="true"]` → `#2a2a2a` ground, `text-strong`, `inset 0 -2px 0 accent`. **Legend footer** 24px `chrome` with the badge in `legend-badge` on `legend-badge-bg`, uppercase `{typography.badge}` at `.08em`.

**Sysline** is the harness's own voice in the transcript: centred `{typography.label}` (10.5px) mono in `faint`, with a 1px `line` rule filling the space either side via `::before` / `::after`, margin `14px 2px 10px`. It carries session-resumed, handoff and room-opened notices. It is never styled as, or attributed to, a persona — see `EXPERIENCE.md` → *Voice and Tone*.

**Scrollbars** are custom: 10px wide, `#313131` thumb (`#424242` on hover), `{rounded.scrollbar}` (10px) radius, with a 3px transparent inset border and `background-clip: content-box` so the thumb reads as narrower than its track.

### Motion

Motion is **information or it does not exist**. AD-20: no element animates unless the thing it depicts is actually happening. Five declarations, all of them bound to a real event:

| Name | Declaration | Depicts |
|---|---|---|
| `pulse` | `1.5s ease-in-out infinite`; opacity `1 → .35 → 1` | A turn is in flight. Slow and shallow — nothing strobes |
| `blink` | `1.05s steps(1) infinite`; `50% { opacity: 0 }` | A caret at the tail of words being written: a document card's prose, or a persona's words in a conversation turn in flight. **`steps(1)` is mandatory — a hard on/off, never a fade.** A fading caret reads as a decorative glow |
| `eq` | `.9s ease-in-out infinite`, height `3px → 8px`, delays `.15s / .3s / .45s` | Who is speaking right now. The only ambient-looking motion in the product, and it is bound to a single fact |
| reveal | `.16s ease` on `max-height` and `opacity` | A persona tile's menu hint opening. A reveal, not a slide |
| cast | `.25s ease` on `opacity`, `border-color`, `background` | The speaker changing |

There is no transition on colour elsewhere, no easing curve library, no spring, no entrance animation, no skeleton, no spinner — at any point, in any state.

Streaming prose arrives in frame-sized bursts, with the caret at the tail; a persona's words in a turn arrive as main delivers them, with the same caret at their tail. **A per-character typewriter is not available and must not be simulated**, and a burst that arrives whole is drawn whole — the mechanism and the argument are EXPERIENCE.md's (→ *State Patterns → Progress, batch commit and revision*).

**`@media (prefers-reduced-motion: reduce)` sets `* { animation: none !important; transition: none !important }` — globally, with no exceptions.** Not reduced: disabled. Every fact carried by motion must therefore also be legible with motion off, and nothing specified here may depend on movement to be understood. The per-signal mitigations — including what replaces the pulse as a liveness signal — are EXPERIENCE.md's (→ *Accessibility Floor → The `prefers-reduced-motion` hole*).

### Proposed: layout, thread and Board anatomy

*Added 2026-10-09. **Partly built:** the Team sidebar with its state strip, and the right panel holding the Outputs half alone (the three-column room), are in `design/tokens.css` (`--sidebar`, `--rail`, `--team-strip-padding`) and the frontmatter above (`spacing.sidebar`, `sidebar-min`, `sidebar-max`, the new `rail` values). The Nav rows, the Properties, Run and Goal trace sections and the rest are **proposed, not built**. The behaviour, the data sources and the list of what is not adopted are in `EXPERIENCE.md` → *Layout, chat and Board*. Which of the rest become stories is not yet chosen. Prototypes: `mockups/paperclip-layout-chat.html` and `mockups/paperclip-board.html`; they draw items the spec does not adopt, and **this section follows the spec.** Every value below is an existing token; a dimension marked *new* becomes a token when a story builds it (NFR23).*

**Team sidebar.** *Built.* `panel` ground, a 1px `line` on its right edge, default width 244px (`{spacing.sidebar}`, 200–400px), its own splitter (*Splitter*). Head: the rail head (`{spacing.rail-head}`, `panel-2`, `line-soft` below, the label at `{typography.label}` uppercase `dim`). Below it:

| Part | Anatomy |
|---|---|
| State strip | *Built.* a four-cell grid (working, idle, error, changed), 1px `line-soft` between cells and below. Each cell, centred: the figure at `{typography.head}`, weight 600, tabular, `text-strong`; the label at `{typography.micro}` uppercase `faint`, tracked `.04em`, the state's own word in lower case in the markup. Cell padding `--team-strip-padding` (8px 4px), so the longest label fits at the default width. No cell takes colour, a fill or the accent: it is a count, not an alert |
| Nav row (*Inbox*, *Sprint board*) | padding `6px 11px`, `{typography.control}` in `dim`, a 1px `line-soft` below, `panel-2` on hover; the current row takes `panel-2` and `text-strong`. A trailing key hint is a chip: `{typography.label}` in `faint`, 1px `line`, `{rounded.chip}`. **No count** on either row |
| Persona tile | the existing tile, unchanged, in config order. Idle tiles dim at `{opacity.idle}`. No group heading by state |

**Context panel.** `panel` ground, a 1px `line` on its left edge, default width 300px (`{spacing.rail}`, 260–480px, *built*, as the class `.rail` holding the Outputs half only), scrolling inside, its own splitter. Head as the sidebar's. Sections are separated by `line-soft` with padding `9px 12px`; a section label is `{typography.micro}` uppercase `faint`, its right-hand note `{typography.meta}` in `faint`.

| Section | Anatomy |
|---|---|
| Properties, Run | key and value rows at `{typography.control}`: the key `faint` in a *new* 78px column, the value `text`, mono for ids, branches and the model. Status is the existing status dot and its word, never a filled pill |
| Goal trace | three rows, product then epic then story: the label in mono `text`, its note right-aligned in `faint` |
| Outputs | the existing Outputs half (*Rail row*, *Outputs head*, *Folder heading*), unchanged |

A field with no source is not drawn.

**Thread additions.**

| Element | Anatomy |
|---|---|
| Message actions | a toolbar on the turn's top-right edge: `panel-2`, 1px `line`, `{rounded.control}`, padding `2px`. Buttons at `{typography.control}` in `faint`, `text-strong` on hover and focus, a `panel-3` ground on hover. Shown on hover and on `:focus-within` of the turn; no animation |
| Thinking row | one line at `{typography.ident}` mono in `faint`: a `▸` (`▾` open), then the persona's own thinking summary. Opened, the text reads in `{typography.doc-prose}` at `ink-doc-mute`, indented to the words, in the turn's measure |
| Decision card | the existing decision block as a card: 1px `line`, `{rounded.card}`, `panel` ground; head `panel-2` with the persona and the position (`1 of 2`); options as rows at `{rounded.card}`, 1px `line-soft` on `bg`, the chosen one on `accent-bg` with a 1px `accent-border` and a 12px circle in `accent`, filled when chosen. Foot `panel-2`: *Confirm* is the one control that takes `accent-border` and `accent-bg`; *Skip* is a ghost button. The key hint sits right at `{typography.meta}` in `faint` |
| Keyboard hints | one centred row under the composer: key chips as above, `faint`, `{typography.label}`. The same row in every state |

**Board.** One scrolling column on `bg`, padding `16px 18px 20px`. Every region is a panel: `panel` ground, 1px `line`, `{rounded.card}`, head `panel-2`.

| Region | Anatomy |
|---|---|
| Overview | three equal cells, gap `10px`. Label `{typography.micro}` uppercase `faint`; figure `{typography.h1}` weight 600, tabular, `text-strong`; a line under it at `{typography.body-ui}` `dim`. All three are alike: none takes the accent or a border |
| Board | five columns in one panel, 1px `line-soft` between them, each padded `8px`. Column head: the status as the file writes it, `{typography.micro}` uppercase `faint`, **no count**. Cards stack with a `7px` gap |
| Story card | `bg` ground, 1px `line`, `{rounded.control}`, padding `7px 8px`. Id in mono `{typography.label}` `faint`; the title at `{typography.control}` `text`; a foot at `{typography.ident}` `faint` with the owner's initials disc (*Initials*) and the run's `working · <elapsed>`. A card with a run on it takes the amber pulse dot and a 1px `accent-border`. **No progress bar** |
| Epics | rows at `{typography.control}`: id in mono `faint`, title `text`, `n of m stories done` in mono `faint` on the right; 1px `line-soft` between rows. Text only |
| Agents | the persona tile's anatomy in a panel: portrait or initials, name and title, the state line, the run's elapsed in mono `faint`. Idle rows dim at `{opacity.idle}` |
| Recent activity | rows at `{typography.control}`: the status dot, the persona's name in `text`, what it did in `dim`, the time right-aligned in mono `faint`; 1px `line-soft` between rows |

**Motion.** Nothing here adds to the closed motion inventory (*Motion*): no shimmer, no fade for the actions toolbar, no transition on a splitter.


## Do's and Don'ts

| Do | Don't |
|---|---|
| Reference a token for every colour, dimension, radius and font stack | Write a literal colour, dimension, radius or font stack in a component — AD-14 calls this a **defect**, not a style preference |
| Ship `--red` in the verbatim `:root` block even though nothing referenced it in the mockup | Use `red` for disagreement, or `disagree` for failure — they are two tones with two meanings |
| Use `note` (`#8e8e93`) for the *state* dot | Reuse the `accent` hex as a state, which is the exact defect AD-14 names |
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
| Draw a turn in flight with the parts the thread has: the caret, the `work` state line, the portrait and head | Draw a skeleton turn, a placeholder word, a spinner, or pace a burst out character by character |
| Disable **all** animation and transition globally under `prefers-reduced-motion: reduce` | Keep "essential" animation running, or leave a fact legible only while something moves |
| Restate any `faint`-tier fact at `dim` or above | Put a fact only a user can act on at `faint` or `{colors.meta}` on `bg` — the locked ramp makes that a real contrast risk |
| Express absence and inattention with opacity | Remove a chosen persona's face from the room |
| Build the party side panel with the *Room* section only, at its new width | Implement AD-14's 288px, or reserve slots for the deferred disagreement and decision sections |
| Let the rail stay monochrome and dense | Turn the rail into a dashboard with colour-coded rows or badges |
| Give the welcome its own breathing room, once, because it holds no state | Carry the welcome's spacing into the shell, or the shell's density into the welcome |
| Draw the open button's folder glyph inline as one stroked path, as the rail row's file icon is | Add an icon font, an icon set, an emoji or an image file for it |
| Show a drop target with a 1px dashed `line` border | Use a dashed border for anything but the welcome's drop zone |
| Keep the five welcome portraits at 44px and full opacity | Render a larger "hero" face, or dim a face that is not in a room |
| State a missing recent folder as `folder missing` | Show an install chip, agent count or version on a recent row, or run a resolver to fill one |
| Take every colour from a token, so both themes resolve through the same component | Name a theme in a component, or write a literal that is right in one theme only |
| Set the theme from the stored choice and the OS appearance in main, before a window is first shown | Read `prefers-color-scheme` in a stylesheet or a component, or paint a window in one theme and then switch it |
| Keep the portraits identical in both themes, on their dark backdrops | Give a portrait a theme-dependent backdrop, or a theme field in `ArtParams` |
| Strengthen the state-dot halos in light (`.16`) | Reuse the dark alpha, which fades on white |
| Let a collapsed folder keep showing a file that is changing, with its amber dot and `changing` | Hide a live state because its row is folded away, or replace it with a count |
| Resize a panel with no easing and no snap, and return it to its default on double-click | Animate the panel's width, or snap it to preset widths |
| Say a folder disagreement as one mono line, in `dim`, with both folders named | Colour it, add an icon or a warning treatment, or recommend which folder is right |
| Show `↓ latest` as one literal string over a thread that is not following | Add a count, a dot, a *new* label, a pulse, or a shadow to it |
| Ship the two themes and nothing else | Add a high-contrast variant, or a third palette |