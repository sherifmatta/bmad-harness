---
name: 'bmad-visual-harness'
type: design-spine
description: 'Dense, hairline-ruled desktop shell in two themes, dark and light, that spends its restraint budget on nothing: no portrait, no illustration, no identity device. A person or a skill is an initials disc and a name.'
status: final
created: '2026-09-24'
updated: '2026-10-15'
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
  - mockups/paperclip-layout-chat.html
  - mockups/paperclip-board.html
  - mockups/chat-thread-reference.png
  - mockups/document-card-dead-air.html
  - mockups/portrait.html   # historical: the removed portrait generator (2026-10-15)
  - mockups/welcome-screen.html
  - mockups/light-a-shell.html
  - mockups/light-a-welcome.html
  - mockups/light-b-shell.html
  - mockups/light-b-welcome.html
  - mockups/skill-session-entry.html
  - mockups/new-session-landing.html
  - mockups/skill-session-entry-options.html
  - ../../epics.md
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
  faint: '#8c8c90'
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
  accent-wash: 'rgba(227,227,229,.045)'   # no longer used by a turn (flat rows, 2026-10-09); the code and its pinned test still carry it, so it stays until the story that removes them
  accent-edge: 'rgba(227,227,229,.45)'    # likewise
  halo-live: 'rgba(122,163,135,.14)'
  halo-work: 'rgba(185,163,103,.13)'
  meta: '#868686'               # 5 uses; the tier below `faint`, timestamps and micro-labels
  ink-doc: '#c2c2c2'            # document-card prose body
  ink-doc-strong: '#eaeaea'     # heading inside document-card prose
  ink-doc-mute: '#888888'       # muted run of document-card prose
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

  # ── Dark values of the 26 names that colors-light already carried (review 2026-10-09): each was a
  #    literal inside a component or in prose, which AD-14 calls a defect. Values are design/tokens.css's.
  cast-speaking-border: '#565656'
  cast-speaking-ground: '#212121'
  grad-cast: 'linear-gradient(180deg,#191919,#151515)'
  grad-titlebar: 'linear-gradient(180deg,#292929,#222222)'
  brand-mark-line: '#4e4e4e'
  topbar-sep: '#414141'
  raised: '#2a2a2a'
  scrollbar-thumb: '#313131'
  scrollbar-thumb-hover: '#424242'
  tile-current: '#252525'
  code-tag-bg: '#1f1f1f'
  composer-placeholder: '#868686'
  send-bg: '#393939'
  send-line: '#4b4b4b'
  send-ink: '#dedede'
  send-hover: '#424242'
  win-light: '#414141'
  ghost-border-hover: '#404040'
  skill-button-hover-line: '#515151'
  decision-hover-line: '#465264'
  party-live-ground: '#181d24'
  status-pill-bg: 'rgba(185,163,103,.10)'
  status-pill-line: 'rgba(185,163,103,.25)'
  status-pill-ink: '#d7b96a'
  shadow-window: '0 30px 70px -20px rgba(6,6,7,.85)'
  shadow-speaking: '0 0 0 1px rgba(227,227,229,.22), 0 6px 18px -10px rgba(6,6,7,.8)'

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
  faint: '#5c5c5c'
  accent: '#1b1b1b'
  accent-bg: 'rgba(27,27,27,.12)'
  accent-wash: 'rgba(27,27,27,.045)'
  accent-edge: 'rgba(27,27,27,.45)'
  green: '#4a6a54'
  amber: '#726134'
  red: '#89554e'
  note: '#454545'
  disagree: '#994c3e'
  disagree-border: 'rgba(145,90,83,.3)'
  disagree-bg: 'rgba(145,90,83,.09)'
  accent-border: '#bcbcbc'
  halo-live: 'rgba(78,112,89,.16)'
  halo-work: 'rgba(120,103,55,.16)'
  meta: '#626262'
  ink-doc: '#3d3d3d'
  ink-doc-strong: '#151515'
  ink-doc-mute: '#626262'
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
  composer-placeholder: '#626262'
  send-bg: '#c6c6c6'
  send-line: '#b4b4b4'
  send-ink: '#212121'
  send-hover: '#bdbdbd'
  win-light: '#bebebe'
  ghost-border-hover: '#bfbfbf'
  skill-button-hover-line: '#aeaeae'
  decision-hover-line: '#ababab'
  party-live-ground: '#e1e1e1'
  status-pill-bg: 'rgba(120,103,55,.10)'
  status-pill-line: 'rgba(120,103,55,.25)'
  status-pill-ink: '#6f5f32'
  shadow-window: '0 30px 70px -20px rgba(8,8,8,.35)'
  shadow-speaking: '0 0 0 1px rgba(27,27,27,.22), 0 6px 18px -10px rgba(8,8,8,.18)'

# Opacity — an extension group beside `colors-light`; values are design/tokens.css's.
opacity:
  idle: 0.42      # an idle persona tile, a dimmed cast card
  hover: 0.72
  speaking: 1
  icon: 0.75      # the file icon on a rail row

typography:
  # Two families only. No webfonts, no icon font, no display face.
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
  sans:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

  # Thirteen sizes. 600 is the only non-default weight in the system.
  badge:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 10px
    letterSpacing: 0.08em
  micro:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 10.5px
    letterSpacing: 0.04em
  meta:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 11px
  label:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 11px
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
  chat-head: 46px            # the chat header's height; one line since 2026-10-09
  chat-sub-max: 72ch         # no longer used (the second line is gone); stays until the story that removes it from the code and its pinned test
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
  # ── portrait: REMOVED 2026-10-15, kept until the portrait-removal story. No portrait is drawn anywhere in the product
  #    (Team tiles, cast cards, Welcome and the thread are all initials discs). The tokens stay because the code and its pinned
  #    tests (portrait.test, tokens.test) still carry them; no prose specifies them any more.
  portrait:
    viewBox: '0 0 100 100'
    radius: '{rounded.full}'
    sizes: '36 persona tile · 44 cast card · none in the chat thread or its header (initials, 26 and 22)'   # removed 2026-10-15
    minLegibleSize: 32px
    faceRatio: '0.76'
    speakingRing: '0 0 0 2px {colors.accent}'
  initials:
    size: 20px           # small references: stacked faces, handoff chip
    sizeThread: 26px     # a persona's and your avatar in a chat turn, 1:1 and party
    sizeHeader: 22px     # the chat header
    threadFont: '{typography.label} size in sans at 600 in {colors.text-strong}; {typography.micro} size at 22px; the 20px disc stays mono'
    userBackground: '{colors.accent-bg}'
    userBorder: '1px solid {colors.accent-border}'
    userColor: '{colors.accent}'
    background: '{colors.initials-bg}'
    border: '1px solid {colors.initials-line}'
    color: '{colors.initials-ink}'
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: 10.5px     # [ASSUMPTION] at 20px
    radius: '{rounded.full}'
    stackOverlap: -5px
    stackRing: '0 0 0 1.5px {colors.panel-2}'
    # The skill variant (Story 7.5, 2026-10-15): the same neutral disc, holding a slash in mono. No new colour.
    skillGlyph: '/'      # mono, in {colors.initials-ink}; the disc of a skill-first session, in a turn (26px), the header (22px) and a skill seat (26px)
    skillBackground: '{colors.initials-bg}'
    skillBorder: '1px solid {colors.initials-line}'
    skillColor: '{colors.initials-ink}'
    skillFontFamily: '{typography.mono.fontFamily}'
    skillFontSize: '{typography.label} size at 26px, {typography.micro} size at 22px'   # [ASSUMPTION] the mock draws 12px at 26px; no 12px mono role exists
  persona-tile:
    background: 'transparent'
    hoverBackground: '{colors.panel-2}'
    currentBackground: '{colors.tile-current}'
    currentEdge: '2px {colors.accent}'
    discSize: '{components.initials.sizeThread}'   # 26px initials disc; replaces portraitSize (36px, removed 2026-10-15)
    height: 44px                                   # was 56px
  skill-seat:
    # One anatomy with persona-tile (Story 7.5): a 44px row, a 26px initials disc, no portrait. The disc is the skill variant of {components.initials}.
    height: '{components.persona-tile.height}'
    background: '{components.persona-tile.background}'
    hoverBackground: '{components.persona-tile.hoverBackground}'
    currentBackground: '{components.persona-tile.currentBackground}'
    currentEdge: '{components.persona-tile.currentEdge}'
    discSize: '{components.persona-tile.discSize}'
    disc: '{components.initials} skill variant (`/`)'
    name: '{typography.name} size and weight in the mono family, {colors.text-strong}; ellipsis, never wrap'
    startTime: '{typography.meta} mono, {colors.faint}, after the name; drawn only when two seats share a name'
    stateLine: '{typography.label} mono: `working · <elapsed>` with {components.status-dot} work, or `live` with {components.status-dot} live, or `ended` with no dot'
    group: 'the heading `Skill sessions` (the existing group-heading treatment), below the last persona tile; drawn only while a seat exists'
  skill-session-button:
    # The entry to the empty chat, right-aligned in the Sprint board row. The same control as the chat header's Stop.
    background: '{colors.panel-2}'
    border: '1px solid {colors.line}'
    radius: '{rounded.DEFAULT}'     # as chat-header.stop: a ghost button is DEFAULT in Shapes; see Open items 6
    padding: '3px 10px'
    type: '{typography.body-ui} in {colors.dim}'
    label: 'Skill Session'
    hoverColor: '{colors.text-strong}'
    hoverBorder: '{colors.ghost-border-hover}'
    pressedBackground: '{colors.panel-3}'
    pressedColor: '{colors.text-strong}'
    pressedBorder: '1px solid {colors.accent-border}'
    focus: '{components.focus.ring}'
  rail-row:
    stateColor: '{colors.dim}'
    writingName: '{colors.text-strong}'
    writingMeta: '{colors.amber}'
    iconStroke: '{colors.amber}'
    iconStrokeIdle: '{colors.faint}'
    iconOpacity: '{opacity.icon}'
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
    hoverBorder: '{colors.skill-button-hover-line}'
    codeChip: '{typography.micro} {colors.accent}, border {colors.accent-border}, radius {rounded.micro}'
    moreVariant: '{colors.faint}'
  conversation-turn:
    form: 'a flat row: no container, radius, ground or border, for a persona and for you'
    gap: '11px between the disc and the words'
    stackGap: '16px between turns'
    avatar: '{components.initials} at {components.initials.sizeThread}, the same for a persona and for you'
    name: '{typography.name} sans, text-strong'
    role: '{typography.ident} sans, faint'
    time: '{typography.meta} mono, {colors.meta}, inline after the role, 8px apart on one baseline (not right-aligned)'
    words: '{typography.base} sans, text, pre-wrap, paragraphs split on blank lines only: your turn, a turn in flight and a turn the sanitiser could not draw'
    markdown: 'a persona completed turn, `.turn-md`: {typography.base} sans, headings at {typography.base} strong, code mono on {colors.panel-2}, a table or code block that scrolls inside the turn; plain while in flight, rendered once when it ends'
    mention: '{components.mention}'
    caret: '{components.document-card.caret}, the same caret, at the tail of the last paragraph while the turn is in flight'
    stateLine: 'the `work` state line ({components.status-dot} work, `working · <elapsed>`) under the words, margin-top {spacing.md}, while the turn is in flight'
    pending: 'a persona turn with no words yet: initials disc, head timed from the turn''s start, the caret as the whole body, the state line under it'
    roomPending: 'the room before a speaker is known: the turn row with no disc, no head and no caret, only the state line'
    max: '{spacing.thread-max}'
    skillFirst: 'the same row with the skill variant of {components.initials} (26px) and, in the head, the skill name in {typography.name} size and weight in the mono family, {colors.text-strong}; no role; the time as for a persona'
  chat-header:
    height: '{spacing.chat-head}'
    background: '{colors.chrome}'
    rule: '1px solid {colors.line}'
    padding: '0 16px'
    gap: '10px'
    avatar: '{components.initials} at {components.initials.sizeHeader}'
    name: '{typography.name} sans, text-strong'
    line: '{typography.body-ui} sans, dim: `title · story <id>`; the story reference omitted when it has no source'
    pill: 'the status pill: {colors.status-pill-ink} on {colors.status-pill-bg}, border {colors.status-pill-line}, {typography.ident} mono'
    stop: '{colors.panel-2} ground, 1px {colors.line}, {rounded.DEFAULT}, padding 3px 10px, {typography.body-ui} {colors.dim}; hover {colors.text-strong}, border {colors.ghost-border-hover}'
    # The skill variant (Story 7.5, 2026-10-15): a skill-first session, and the empty `New session` chat.
    skill:
      avatar: '{components.initials} skill variant at {components.initials.sizeHeader}'
      name: 'the skill name in {typography.name} size and weight, mono family, {colors.text-strong}; no title, no story reference'
      right: 'the status pill, then `Stop` while a turn is in flight and `close session` otherwise'
    landing:
      avatar: '{components.initials} skill variant at {components.initials.sizeHeader}'
      name: '`New session` in {typography.name} sans, {colors.text-strong}'
      right: 'nothing: no pill, no Stop, no close'
  run-step:
    grid: '14px 1fr auto'
    gap: '9px'
    padding: '3px 0'
    markDone: '{colors.green}'
    markFailed: '{colors.red}'
    markRunning: '{components.status-dot} work, with its pulse'
    label: '{typography.ident} mono; {colors.dim} once done, {colors.text} while running'
    elapsed: '{typography.meta} mono, tabular figures; {colors.faint} once done, {colors.dim} for `now` while the step runs'

  composer:
    background: '{colors.panel}'
    border: '1px solid {colors.line}'
    radius: '{rounded.card}'
    placeholder: '{colors.composer-placeholder}'
    sendBackground: '{colors.send-bg}'
    sendBorder: '{colors.send-line}'
    sendColor: '{colors.send-ink}'
    sendHover: '{colors.send-hover}'
    min: '{spacing.composer-min}'
    max: '{spacing.composer-max}'
    inner: '{spacing.thread-max}'
  mention:
    form: 'the `@name` the user typed to hand off, in your turn, before the words it came with (AD-25); a chip, not a control: no tab stop, no hover, no action'
    type: '{typography.ident} mono'
    ground: '{colors.panel-2}'
    border: '1px {colors.line}'
    radius: '{rounded.chip}'
    color: '{colors.text}'
    padding: '0 {spacing.xxs}'
    gap: '{spacing.md} between the chip and the words'
  cast-card:
    radius: '{rounded.card}'
    minWidth: 148px
    opacityIdle: '{opacity.idle}'
    opacityHover: '{opacity.hover}'
    opacitySpeaking: '{opacity.speaking}'
    speakingBorder: '{colors.cast-speaking-border}'
    speakingBackground: '{colors.cast-speaking-ground}'
    speakingShadow: '{colors.shadow-speaking}'
    discSize: '{components.initials.sizeThread}'   # 26px initials disc (2026-10-15)
    portraitSize: 44px                             # removed 2026-10-15, kept until the portrait-removal story
  welcome:
    window: '{spacing.welcome-window}, opened by main, no project'
    ground: '{colors.bg}'
    topbar: 'brand · `│` · `no project open` in {typography.label} {colors.faint}; no chips, no view switch'
    mark: '30px bordered square, ::after inset 5px, accent at .75 (the topbar mark at the larger size)'
    title: '{typography.h1} text-strong'
    tagline: '{typography.ident} sans, {colors.dim}'
    column: '{spacing.welcome-col}'
    teamMax: '{spacing.welcome-team-max}'
    open-button: 'the composer send button, unchanged: {colors.send-bg} ground, {colors.send-line} border, {colors.send-ink} text, {colors.send-hover} hover, {rounded.control}'
    drop-zone: '1px dashed {colors.line}, {colors.panel} ground, {rounded.card}, padding 18px 20px'
    drop-zone-active: 'border {colors.accent-border}, ground {colors.accent-bg}'
    drop-hint: '{typography.meta} mono, {colors.dim}'
    recent-row: 'name {typography.base} sans {colors.accent} · path {typography.ident} mono {colors.dim} · age {typography.meta} mono {colors.faint}, right'
    recent-row-missing: 'name {colors.dim}, not underlined on hover, `folder missing` in {typography.label} mono {colors.dim} where the age was'
    lane-label: '{typography.label} mono uppercase, {colors.faint}, then a 1px {colors.line} rule filling the row, then the lane number in {typography.badge} {colors.meta}'
    lane-columns: '1fr 2fr 1fr 1fr, gap 10px (planning holds two cards)'
    persona-card: '{colors.panel} ground, 1px {colors.line}, {rounded.card}, padding 12px 12px 11px, gap 8px'
    discSize: '{components.initials.sizeThread}'   # 26px initials disc (2026-10-15)
    portraitSize: 44px                             # removed 2026-10-15, kept until the portrait-removal story
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
    where: '{typography.meta} mono (11px), {colors.dim}, right-aligned: the watched folder, project-relative, trailing slash'
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
    shadow: '{colors.shadow-window}'
    titlebar: '{colors.grad-titlebar}, height {spacing.win-titlebar}'
    lights: '10px {rounded.full} {colors.win-light}'
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
    type: 'label (11px) mono, faint, centred'
    rule: '1px line, drawn as ::before/::after flex fills either side of the text'
    margin: '14px 2px 10px'
    note: 'Harness-authored transcript entry. Never attributed to a persona.'
    lines: 'Story 7.5 adds two, in this style and no other: `no skill named <word>` and `session ended`; lower-case, no full stop'
  focus:
    ring: '0 0 0 2px {colors.accent}'
    offset: '2px'
    offsetStacked: '3px'   # clears the -5px initials overlap
    radius: 'inherits the focused element'
  view-switch:
    type: 'control (12px) sans, dim'
    shape: 'DEFAULT radius (5px) container, 1px line, panel-2 ground, overflow hidden'
    divider: '1px line-soft between buttons, none on :last-child'
    pressed: '[aria-pressed=true] -> {colors.raised} ground, text-strong, inset 0 -2px 0 accent'
---

## Brand & Style

The harness is a dark, dense, hairline-ruled desktop shell that reads as an instrument, not an app. Every visual decision in it is downstream of one rule: nothing on screen is there to be looked at for its own sake; everything on screen is a fact the user is reading.

**The product spends its restraint budget on nothing.** *(Rewritten 2026-10-15.)* The earlier premise was that illustrated portraits of plausible colleagues were the one thing in the product allowed warmth, and that every other surface was pulled back so they could carry it. The portraits are gone from the product completely, and nothing replaces them: there is no identity device, no illustration, no image, no colour per persona and no second ornament to take the budget over. A persona is a **26px initials disc and a name**; a skill session is the same disc holding a `/`. The restraint that remains is not a budget spent on something. It is the absence of anything that is not state, text or a hairline. Surfaces step up in five near-identical greys. Borders are hairlines. There is one accent. There is no icon font, no emoji, no image file, no gradient outside two chrome fills, and exactly one non-default font weight in the whole system. Glyphs in copy are literal Unicode (`→ ↔ · § ≈ —`); **`⌘↵` is not in the inventory**, because the composer sends on `Enter` (EXPERIENCE.md → *Accessibility Floor → Keyboard reach*).

*Amended 2026-10-15.* On 2026-10-09 the chat thread alone dropped its portraits (flat rows, initials discs); on 2026-10-15 the Team tiles, the cast cards and the Welcome did too, so the thread, the tile, the card and the Welcome row draw a person the same way. What the earlier sentences said about a thread held "as plain as the screenshot draws it" while the faces carried the warmth elsewhere no longer applies: the whole product is as plain as the thread. The removal is recorded where the portrait component stood (*Components → Removed 2026-10-15*).

Information density is high and deliberate: the densest type tier was 10.5px in the mockup and is 11px since the 2026-10-10 legibility pass; it is still the most-used size in the product. This is a tool for an engineer reading state, not a consumer surface. Nothing is padded to feel generous.

**Two themes, one design.** Dark is the theme the product was designed in; light (2026-10-08; repainted 2026-10-09 as the dark theme reversed) is its twin and is chosen, not inferred: *System* (the default, following the OS), *Light* or *Dark* (EXPERIENCE.md → *Theme*). No stylesheet and no component reads `prefers-color-scheme`, and there is no high-contrast variant. Every rule in this document holds in both themes, and the restraint most of all: nothing carries warmth in either one but the friction tone, which is why the light palette is neutral grey.

Two tonal rules govern everything below. **One accent, one friction colour.** The accent, a soft off-white, is the system's voice; the warm tone belongs to disagreement and to nothing else — friction is the one thing given its own colour, because friction is the feature most likely to be sanded off in implementation. **State is never decoration.** Four state colours exist and every one of them is driven by a real system fact.

**The ownership convention, stated once and used throughout.** Anatomy and appearance are specified here, in DESIGN.md. Triggers, transitions, data sources and keyboard behaviour are specified in EXPERIENCE.md. Where a state is named here, what drives it and when it changes live there; where a component is named there, what it looks like lives here. **Mockups illustrate; this spine wins** (stated once here). Four still draw what the chat look replaced (container turns, a tinted user turn, portraits in the thread): `follow-the-thread.html`, `rail-resize-collapse.html`, `light-a-shell.html` and the transcript box of `portrait.html`. Their turn rendering is superseded by *Layout, chat and Board → The chat look* in EXPERIENCE.md; the rest of each stands, **except every portrait they draw (Team tiles, cast cards, the Welcome team), removed 2026-10-15**; `portrait.html` is kept as history only. The Story 7.5 mocks, [`skill-session-entry.html`](mockups/skill-session-entry.html) (the button, the 44px seats, the Skill sessions group), [`new-session-landing.html`](mockups/new-session-landing.html) (the landing, two moments) and [`skill-session-entry-options.html`](mockups/skill-session-entry-options.html) (the record of the rejected placement A), illustrate the entry and its seats; where one draws a value this spine does not name, the spine's token wins.

**Open items** (after the 2026-10-09 chat-look update; each is also tagged `[OPEN]` where it appears; the rest of `review-rubric.md` is in `validation-report.md`):
1. `[OPEN]` **Stop vs `close session`.** Does the header's `Stop` replace `close session`, or take its slot only while a turn is in flight? The contract has `run.stop(runId)` and `session.close` only, so a plain chat turn has nothing to stop with.
2. `[OPEN]` **The room's live turn.** It keeps its accent edge and `party-live-ground` by assumption, the one turn row with either.
3. `[OPEN]` **The skill-name source.** `handed to <persona> · <skill>` and the run card head show a name the renderer's events do not carry.
4. `[OPEN]` **Register split under steps.** Steps and prose are both mono; structure, not typeface, tells them apart.
5. `[OPEN]` **The `@Name` chip.** A handoff strips the `@name` from the turn, so the chip the screenshot draws needs a display text recorded beside the sent text in `turn.send`: a contract change, handed to `bmad-architecture`. Not built.
6. `[OPEN]` **Radius of the `Skill Session` button.** It is drawn as the header's `Stop` (a ghost button, `{rounded.DEFAULT}`, 5px, as the mock draws it). The Story 7.5 brief says `control` (4px); the two cannot both hold, and the spine follows the Stop and the mock.
7. `[OPEN]` **An `ended` skill seat's presence.** Persona tiles dim at `{opacity.idle}` when idle; the mock draws skill seats at full opacity and says nothing of an ended one. Drawn undimmed until decided (*Components → Skill seat*).

## Colors

### The locked ramp

The `:root` block above is copied from `harness-mockup.html` unchanged, in source order, per AD-14. `design/tokens.css` opens with it. It is not a starting point to be tuned.

**Surfaces** step `bg → chrome → panel → panel-2 → panel-3`, each roughly four points of lightness above the last. `bg` is the application ground. `chrome` is the topbar and the legend footer — furniture, one step darker than a panel so it recedes below the content it frames. `panel` is a card or window body. `panel-2` is a card head or foot, a raised row, a tag ground. `panel-3` is the top of the ramp and is used **exactly once** in the mockup, on `.skillbtn:hover`; it is the hover ceiling, not a general surface.

**Hairlines** are two: `line` for a visible separation between two things, `line-soft` for a rule inside one thing (a card's head from its body). The distinction is load-bearing at this contrast — using `line` internally makes a card read as three stacked cards.

**Text** steps `text-strong → text → dim → faint`, with a fifth informal tier `{colors.meta}` (`#868686`) below `faint` used for timestamps and micro-labels. The ramp is fixed and **a component may not adjust it**. **Within the text ramp, hierarchy comes from which tier you pick, not from opacity** — this is a rule about text only. Opacity carries *presence* elsewhere in the product, deliberately and by its own rule (see *Elevation & Depth*).

> **Contrast, corrected 2026-10-10.** The first ramp put `faint` (`#6d6d71`) at 3.8:1 on `bg` and `{colors.meta}` (`#626262`) at 3.2:1, below the WCAG 1.4.3 floor for the 10–11px text they carry. A design audit measured them and both tiers now clear 4.5:1 on every dark surface (`faint` `#8c8c90`, `meta` `#868686`), at the cost of a narrower step between `dim`, `faint` and `meta`. The tiers still order the text; the older rule still stands as a habit — nothing load-bearing should live only at `faint` or `meta` — but it is no longer what keeps the text legible.

### Accent

`accent` (`#e3e3e5`) is the single chromatic voice: the current-persona edge on a tile, the pressed underline on the segmented control, the caret at the tail of words being written (a document card's prose, a persona's turn in flight), the skill-button code chip, the decision-option key, the requirement ids in rendered markdown (`.fr`), and the lit border of the speaking cast card (`cast-speaking-border`). `accent-bg` is its 12% fill and is the only accent *fill* in the product — accent is a line, an edge, a chip border, almost never a surface.

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

*The dark theme reversed (2026-10-09).* It replaces palette A, "cool paper", the blue-tinted slate-and-white theme that shipped first; the idea behind the dark theme's neutral move now carries over: no tint, a neutral accent, muted status hues. The mockups are `mockups/light-a-shell.html` and `light-a-welcome.html`, repainted to this palette; `light-theme.html` and the `light-b-shell.html` and `light-b-welcome.html` pair are kept as the record of the two palettes first compared. The twins are the `colors-light` map in the frontmatter, one for every colour token in `design/tokens.css`.

**How it is built.** The verbatim `:root` block and the promoted block that follows it stay as they are: they are the dark theme. The light values arrive as a **third block, `:root[data-theme="light"]`**, overriding colour tokens only, with `color-scheme: light` stated to the user agent in the same block (so form controls, scrollbars and the caret agree). No dimension, radius, type size or motion changes with theme, and **no component names a theme**: a component that takes every colour from a token is correct in both. The attribute is set by main before a window is first shown, from the stored choice and the OS appearance; the page never asks the browser which scheme is preferred.

**How it is derived.**
- **Every grey is the dark grey mirrored.** Each dark neutral becomes its complement about the middle (`255 − x` per channel, then pure grey), so there is no blue in the ramp and no pure white or black anywhere: `bg #f2f2f2`, `chrome #eeeeee`, `panel #eaeaea`, `panel-2 #e5e5e5`, `panel-3 #dfdfdf`, hairlines `line #d5d5d5` and `line-soft #e0e0e0`. The ramp is reversed with the theme, so a surface that rises is **a step darker** than the ground, exactly as a dark surface is a step lighter: a card reads as set into the page, not lifted off it. Same five greys, same two hairlines, no new surface tier.
- **The accent is a near-black.** `accent #1b1b1b` is the dark accent's `#e3e3e5` reversed. It is still a line, an edge, a chip border, almost never a surface, and `accent-bg` is its 12% wash. The send button stays quiet: `send-bg #c6c6c6` with `send-ink #212121`, no blue and no filled accent button.
- **Text tiers are the dark ones reversed, then corrected where the mirror would fail.** `text #202020` and `text-strong #0e0e0e` are the plain mirrors. The mirrored `dim` and `faint` would be too light on a darker panel, so `dim` is `#505050` and `faint` is `#5c5c5c` and `meta` `#626262`, the lightest greys that still clear 4.5:1 on `panel-3`, the darkest surface they sit on. `note` is `#454545`: a step darker than `dim`, distinct from the idle dot.
- **The four state colours keep their meaning and stay muted.** Green `#4a6a54`, amber `#726134` and red `#89554e` keep each dark hue and saturation and are darkened until each clears 4.5:1 on every surface text sits on, `panel-3` included. The halos around the live and work dots are strengthened to `.16`, because a glow reads weaker on a light ground. `disagree #994c3e` stays a distinct warm tone and is not `red`.
- **Document ink reverses with the page.** `ink-doc #3d3d3d`, `ink-doc-strong #151515`, `ink-md #2b2b2b`; the document card's mono body and the markdown window read as dark-on-grey.
- **Shadows and the scrim are neutral and low.** The window shadow is `0 30px 70px -20px rgba(8,8,8,.35)`, the speaking cast card's shadow likewise, the scrim `rgba(8,8,8,.35)`. A dark theme's alpha would read as dirt on a light ground.
- **The initials disc is the one avatar in both themes.** *(Replaces the portraits-are-identical bullet, 2026-10-15.)* `initials-bg`, `initials-line` and `initials-ink` have light twins above; the skill variant (the `/`) uses the same three tokens and so resolves in both themes with no new colour.

**Measured contrast** (WCAG ratio of the foreground against the surface it sits on, from the twins above; dark is the shipped theme):

| Pair | Dark | Light |
|---|---|---|
| `text` on `bg` | 14.5 | 14.6 |
| `text-strong` on `panel` | 16.2 | 16.0 |
| `dim` on `panel` | 6.6 | 6.7 |
| `faint` on `panel` | 5.4 | 5.6 |
| `meta` on `bg` | 5.3 | 5.4 |
| `accent` on `panel` | 14.2 | 14.3 |
| `green` on `panel` | 6.4 | 5.0 |
| `amber` on `panel` | 7.4 | 5.0 |
| `red` on `panel` | 6.1 | 5.0 |
| `note` on `panel` | 5.6 | 8.0 |
| `ink-doc` on `panel` | 10.2 | 9.0 |
| `disagree` on `panel` | 7.3 | 5.0 |
| `text-strong` on `initials-bg` (a persona's disc) | 11.4 | 12.1 |
| `accent` on `accent-bg` over `bg` (your disc) | 11.6 | 12.1 |
| `initials-ink` on `initials-bg` (a skill's `/` disc, 2026-10-15) | 6.0 | 5.3 |

The clock time in a turn head sits at `meta` and restates nothing load-bearing: a turn's order is its place in the thread.

Every pair that carries text clears 4.5 in both themes, `meta` included. The three status hues sit a little above the floor because they are muted on purpose: darkening them further would make them heavier than the dark theme's quiet marks.

### What has no colour

No gradients except the two chrome fills (cast strip, window titlebar). No shadows carrying hue. No semantic colour on text below `dim` other than the four states. No colour-coding by persona, skill, module, file type or recency — there is no per-persona colour in the product, and the rail is deliberately monochrome so it reads as a filesystem rather than a dashboard. (The proposed Board, below, is the one surface allowed to read as a dashboard, and it is monochrome too.)

## Typography

Two families. `mono` and `sans`, both platform stacks, no webfont, no network dependency, no licensing.

### The register split (a rule, not an implementation note)

**`mono` is the register of things written down. `sans` is the register of things said.**

This is load-bearing and must be implemented as stated. The document card under the approved dead-air treatment carries two feeds in one box: streaming document prose (`doc:prose`, from `input_json_delta`) and run notes (`run:note`, from `.memlog.md`). AD-3 routes these to separate destinations on purpose and says they must never cross. Putting them in one body asks the typeface register alone to keep them distinct — so it does:

- **Document prose renders in `mono`** at `doc-prose` (11.5px / 1.72, `ink-doc`). Prose is typeset as a document.
- **Run notes render in `sans`** at `body-ui` (11.5px / 1.55, `dim`), with the timestamp in `mono` at `{typography.meta}` and `font-variant-numeric: tabular-nums`. A run note is typeset as speech.

Same box, same size, two registers, and the register is the only thing distinguishing them. Do not add a container, a label, a rule or a background to "help" — the split is the mechanism, and a second mechanism on top of it dilutes the first. Run steps are not an addition of that kind: they are a third row type with their own grid (*Components → Run step*).

The same rule generalises across the product. `mono` carries **file paths, state strings, metadata, timestamps, codes, chips, tags and run status**. `sans` carries **prose, persona voice, names, titles, labels and rendered markdown**. A file path in sans is wrong; a persona's sentence in mono is wrong.

**Amended 2026-10-09 — a run step is mono too.** The run list (*Components → Run step*) adds a third row to the card body: the persona's tool steps, in `mono`, because they are the harness's facts about calls. In prose mode a step row and a line of prose are then both mono, and the register alone no longer separates them. What does is structure: a step is one short row with a mark and a right-aligned elapsed, prose is unbroken pre-wrapped lines. Keep step labels to a few words; a step the length of a sentence would read as prose and break the split.

### The scale

AD-14 states the type scale as "base 13px/1.55". That is the body rule, not the scale. The mockup carries **thirteen distinct sizes**, and the densest tier — 10.5px — is the single most-used size in the product with 16 declarations. (The extraction's "sixteen distinct sizes" is that use-count; the mockup's distinct-value count is thirteen, and the thirteen are what is formalised here.) The scale is dense by design and half-point steps are real: 11px and 11.5px are different roles, not rounding noise.

| Role | Size | Family | Job |
|---|---|---|---|
| `badge` | 10px | mono, uppercase, .08em | The legend footer badge. One use. |
| `micro` | 10.5px | mono, .04em | Code tags, skill-button code chip, cast status, party tags, run-note kind tags |
| `meta` | 11px | mono | Timestamps, rail meta, the rail row's directory line (`dirline`), file group, card section, window foot |
| `label` | 11px | mono | **Densest tier.** Chips, rail head/foot, tile state, sysline, run chip, card foot, option key, hint line, cast info, key/value key (`kv`). Uppercase at .09em for rail heads and side-section heads, and at .07em for the skill-row label; sentence case elsewhere |
| `ident` | 11px | mixed | Identifiers. Mono for file paths, window path, initials, handoff chip, status pill; sans for tile name span, turn role, and the rendered-markdown sub-line and table header (`md sub`, `md th`) |
| `body-ui` | 11.5px | sans | The working text size — breadcrumbs (`crumbs`), buttons, key/value rows (`kv`), option text, run notes. Mono variant at the same size for inline code and document-card prose |
| `control` | 12px | sans, .01em | Segmented control. One use |
| `name` | 12.5px | sans 600 | Names and titles — brand, tile, turn, option, cast. md h3 at this size uppercase .03em in `dim` |
| `base` | 13px / 1.55 | sans | `body{}` and party primary turn text. AD-14's stated base |
| `doc-prose` | 11.5px / 1.72 | mono | Streaming document prose in a card |
| `doc-read` | 13.5px / 1.72 | sans | Rendered markdown in the document window |
| `head` | 14px | sans 600, .01em | The Team sidebar's state-strip figure and the largest type in the shell. It was the chat-header name before 2026-10-09; the header now uses `name` |
| `h2` | 14.5px | sans 600 | Markdown h2, document window only |
| `h1` | 20px | sans 600, -.01em | Markdown h1, document window only. Never appears in the shell |

Line-heights are three: `1.55` everywhere by default, `1.72` for both reading measures (card prose and rendered markdown), and `1.45` for the open-question block.

### Weight and tracking

**600 is the only non-default weight in the system.** There is no 500, no 700, no light. Emphasis is one step of weight or one step up the text ramp, never both and never a colour.

Tracking is used to make small type readable and to mark a label as a label, never for style: `.09em` on uppercase rail and section heads, `.08em` on the legend badge, `.07em` skill-row label, `.05em` skill-button code, `.04em` on micro tags and table heads, `.03em` md h3 and the sysline, `.02em` brand, `.01em` segmented and chat-head name, `-.01em` on md h1 only.

Uppercase appears only on: rail heads, side-section heads, the legend badge, markdown h3, and table headers. Nowhere else — an all-caps button or label anywhere else is wrong.

The 13px base and every constant below are fixed px. No source specifies a text-scaling or zoom rule and **v1 does not respond to one** — a decision, not an omission.

## Layout & Spacing

### Binding constants

AD-14 names layout literals as equal in force to the colours. These are the contract:

| Constant | Value | Surface |
|---|---|---|
| Team sidebar | **244px** by default, **resizable 200–400px**, `flex:0 0` | 1:1 view, left side: the state strip, the nav rows (the Sprint board row carries the `Skill Session` button at its right), the persona tiles, then the Skill sessions group |
| Rail | **300px** by default, **resizable 260–480px**, `flex:0 0`; the chat column keeps **420px** at least | 1:1 view, right side: the Outputs half (the context panel's other sections are proposed) |
| Room panel | **240px** by default, **resizable 200–400px**; the party column keeps **480px** at least | Party view, right side; hidden at ≤1180px |
| Topbar | **42px** | `chrome`, 1px `line` bottom rule, 14px gap |
| Panel head | **30px** | Head of the Team sidebar and of the rail |
| Legend footer | **24px** | `chrome` |
| Thread max-width | **940px** | 1:1 transcript and composer inner |
| Party thread max-width | **900px** | Party transcript |
| Chat header | **46px** | `{spacing.chat-head}`: one line, no second line |
| Document window | **min(880px, 92vw) × min(760px, 80vh)**, top 8vh | Separate OS window |
| Rendered markdown measure | **70ch** | Inside the document window body (`26px 34px 40px`) |
| Card body max-height | **230px** | Document-card body before it scrolls |
| Composer field | **20px min, 120px max** | Autogrows between |

| Welcome window | **1080 × 720** | Separate window, no project. Its column is **560px**, its lanes **960px** max |

Every seat is a **44px row** (`{components.persona-tile.height}`) with a **26px initials disc** (*Components → Persona tile*, *Skill seat*); the closed set of image sizes is gone (*Components → Portrait (removed)*). The disc is 26px in a thread turn, a seat, a cast card and a Welcome row, 22px in the chat header only, and 20px for small references. More rows fit the Team sidebar before it scrolls than the six 56px tiles did. **Tiles are grouped by the agent's `module` and `team` fields** (AD-10; the grouping rule is EXPERIENCE.md → *Interaction Primitives → Persona tile order*). The scroll limit is not the reason for the grouping — it is what makes the grouping load-bearing. The skill seats sit below the personas, under their own heading (*Components → Skill seat*), and are not grouped by `module`.

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
- **≤1000px** — the shell unlocks scroll (`body{overflow:auto}`, `.app{height:auto}`), both views stack to a column, the chat column takes `min-height:62vh`, the layout stacks chat, then the Team sidebar, then the rail, each switching its side rule to a top rule, with no splitter, cast cards wrap at `flex:1 1 44%`, and the topbar wraps to `height:auto` with the breadcrumbs pushed to their own full-width row.

- The **welcome** takes the second breakpoint only: at **≤1000px** its window scrolls (`overflow:auto`) and the four lanes stack to one column of cards. It adds no breakpoint of its own.

There is no mobile target and no third breakpoint.

## Elevation & Depth

Depth is tonal, not cast. The five-step surface ramp *is* the elevation system: a thing is "above" because it is one step lighter and has a hairline around it, not because it has a shadow. There is no elevation scale, no `z1/z2/z3`, and no hover-lift anywhere.

Shadows exist for exactly three jobs, and only three:

1. **State halos** — a 3px spread ring at very low alpha around a live (`halo-live`) or work (`halo-work`) status dot. This is the dot reading as lit, not as raised.
2. **Inset rules** — `inset 0 -2px 0 accent` under the pressed segmented button; `inset 2px 0 0 accent` on the live party turn `[ASSUMPTION — OPEN]`, kept with its `party-live-ground` as the only turn row with either (*Conversation turn*). These are edges drawn with a shadow, not depth.
3. **True separation** — the document window, which is a separate OS window over a scrim and is the only element in the product entitled to a real shadow: `shadow-window` over a `scrim` fill. The speaking cast card gets a restrained version, `shadow-speaking`, because it must read as lifted out of a row of dimmed peers; its lit border (`cast-speaking-border`) belongs to the same gesture.

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
| `card` | 6px | A container holding content: document card, composer, cast card; the room's live turn if its ground and edge are kept `[OPEN]`. A conversation turn is a flat row and takes no radius |
| `window` | 8px | The document window. The only 8px in the product |
| `scrollbar` | 10px | Scrollbar thumb, with a 3px transparent inset border and `background-clip: content-box` |
| `full` | 50% | Status dots, initials discs, traffic lights |
| `pill` | 99px | The handoff chip, and only the handoff chip |

The pill is a single deliberate exception: the handoff chip is the one element that proposes crossing a boundary between personas, and its shape says so. Nothing else is a pill — no pill buttons, no pill badges, no pill status.

Perfect circles are reserved for **things that stand for a person, a skill or a light**: initials discs, status dots, traffic lights. A circle anywhere else will be misread.

## Components

Anatomy and appearance only, per the ownership convention. Triggers, transitions, data sources, timing of state changes, focus order and keyboard behaviour live in EXPERIENCE.md.

**As built, not respecified here:** the install chip, the branch chip, the run chip, the status pill (its colours are the `status-pill-*` tokens) and the end-session control (`close session`) ship as built in `src/renderer/ui/`. They are named so a reader knows they exist; a change to one is an Update.

### Portrait (removed)

*Removed 2026-10-15.* The illustrated portrait, its procedural generator, its sizes (36 on a tile, 44 on a cast card and a Welcome row), its 32px legibility floor and its art direction are removed from the product completely, by the user's decision. A person is an initials disc and a name on every surface (*Initials*), and a skill session is the same disc holding a `/`. Nothing replaces the portrait as an identity device (*Brand & Style*). This supersedes SPEC CAP-3 and CAP-10 and AD-16 in whole; the architecture amendment of AD-16, and the code and tests that still carry the portrait (`portrait.test`, `tokens.test`, the `portrait` and `portraitSize` tokens in the frontmatter, marked there), wait for the portrait-removal story. [`mockups/portrait.html`](mockups/portrait.html) is kept as history only.

### Initials

The avatar of the chat, and the small-reference token.

- **26px** circle beside a chat turn, on a Team tile and skill seat, on a cast card and on a Welcome row, and **22px** in the chat header only — a persona's and yours alike (2026-10-09: the chat carries no portraits, *Conversation turn*; 2026-10-15: no surface does). **20px** for small agent references elsewhere (stacked faces, handoff chip).
- Persona disc: `initials-bg` fill, 1px `initials-line` border, centred. At 26px and 22px the glyphs are **sans 600** (11px, 10.5px) in `text-strong`, as the prototype's `.av` draws them. At 20px they stay `mono` in `initials-ink` at 10.5px `[ASSUMPTION]`.
- **Skill variant** *(Story 7.5, 2026-10-15).* The same circle on `initials-bg`, 1px `initials-line`, holding **`/`** in `mono` in `initials-ink`, at 26px (a turn, a seat) and 22px (the header). It is neutral on purpose: it never takes a persona's letters or tint, so a skill-first session cannot be mistaken for a persona. Sizes are the persona disc's (`{typography.label}` at 26px, `{typography.micro}` at 22px) `[ASSUMPTION]`: the mock draws 12px at 26px, and no 12px mono role exists. No new colour: the three tokens have light twins, so the variant resolves in both themes.
- Your disc: the same circle on `accent-bg`, 1px `accent-border`, glyphs in `accent` — the prototype's `.av.u`, the one tint that tells you from a persona at a glance.
- Stacked: `margin-right: -5px` overlap with a `0 0 0 1.5px panel-2` ring cutting each disc out of the one behind it.
- Where a disc stands alone, the name-and-role reveal renders **identically on `:hover` and on `:focus-visible`**; the focus treatment is *Focus*, below. In the thread and header the name is beside the disc, which is decorative there. Why the parity is mandatory, and the ARIA that carries it, are EXPERIENCE.md's (→ *Accessibility Floor → The initials token — focus parity*).

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

44px row (it was 56px until 2026-10-15): a **26px initials disc** (`{components.persona-tile.discSize}`; the persona's letters by the `initialsOf` rule, one letter for a one-word name, as in the thread), then name at `name` (12.5px/600) with the title beside it at `ident` in `dim`, and a state line below at `label` with its dot. Default ground is transparent; hover is `panel-2` and reveals the menu hint; **current** is `[aria-current="true"]` → `tile-current` ground with a 2px `accent` left bar via `::before`. The menu hint expands `max-height: 0 → 60px` over `.16s`. An idle tile dims at `{opacity.idle}`. Nothing on a tile is drawn but the disc, the two lines and the dot.

### Skill seat

*Added 2026-10-15 (Story 7.5).* A persona tile's anatomy for a skill-first session: **one anatomy, not a second component** — the same 44px row (`{components.skill-seat.height}` is `{components.persona-tile.height}`), the same 26px disc slot, the same ground, hover, current edge and ring. Behaviour (when a seat appears, what a click does, the order, the end of a session) is EXPERIENCE.md's.

- **Disc** — the skill variant of *Initials*: a `/` in mono in `initials-ink` on `initials-bg`.
- **Line one** — the skill name at `{typography.name}` size and weight in the **mono** family, `text-strong`; it truncates with an ellipsis and never wraps (a name like `bmad-create-epics-and-stories` is long). There is no title beside it. Only when two seats share a name, each shows its start time `HH:MM` after the name, in `{typography.meta}` mono at `dim` (decided 2026-10-15; `faint` may not be the only carrier of a fact).
- **Line two** — `{typography.label}` mono with its dot: `working · <elapsed>` with the `work` dot (amber, halo, `pulse`) while a turn is in flight; `live` with the `live` dot (green, halo) when idle and holding context; `ended` with **no dot** after a relaunch (Story 7.4's live dot is its own; this only draws what it hands over). Elapsed formats are those of the persona tile's `working · <elapsed>`.
- **No control on the row.** No close, no menu hint, no count: the one end control is the chat header's `close session` (Story 7.4).
- **Group.** Seats sit under a heading, `Skill sessions`, below the last persona tile. It uses the existing group-heading treatment (the persona and file group labels: uppercase, tracked, `faint`, `{typography.badge}` tier) `[ASSUMPTION]` for the exact tier, since the mock draws 9.5px sans, `.09em`; no token is added. It is drawn **only while at least one seat exists**; there is no empty state and no placeholder row. Seats keep start order, no recency sort.

| State | Dark | Light | Source |
|---|---|---|---|
| Rest | ground transparent; name `text-strong` `#f1f1f2`; line two `faint` `#8c8c90` | transparent; `#0e0e0e`; `#5c5c5c` | `text-strong`, `faint` |
| Hover | ground `panel-2` `#1a1a1b` | `#e5e5e5` | `components.skill-seat.hoverBackground` |
| Pressed (mouse down) | no separate treatment, as a persona tile `[ASSUMPTION]` | same | — |
| Current (the session being viewed, `aria-current`) | ground `tile-current` `#252525`, 2px `accent` `#e3e3e5` left bar | `#dadada`, `#1b1b1b` | `tile-current`, `accent` |
| Focus | the shared ring, `0 0 0 2px accent` at 2px offset | same, `#1b1b1b` | `{components.focus}` |
| Working dot | `amber` `#b9a367`, halo `halo-work`, `pulse` | `#726134` | `status-dot` work |
| Live dot | `green` `#7aa387`, halo `halo-live` | `#4a6a54` | `status-dot` live |
| Ended | text only, no dot; drawn at full opacity, not at `{opacity.idle}` `[OPEN]` (Open items 7) | same | — |

### Skill Session button

*Added 2026-10-15 (Story 7.5).* The entry to the empty chat: a ghost button at the **right of the Sprint board row**, in the same row as the nav label and its key hint (`g b`), `margin-left: auto`. It is the same control as the chat header's `Stop`, drawn the same way, with the label **`Skill Session`**. It is an entry to a chat, not a launcher: it lists no skill and carries no accent fill, icon or count. A native `<button aria-pressed>`; pressed means the empty chat is open (EXPERIENCE.md → *Skill sessions*).

`panel-2` ground, 1px `line`, `{rounded.DEFAULT}`, padding `3px 10px`, `{typography.body-ui}` in `dim` (`{components.skill-session-button}`).

| State | Dark | Light | Source |
|---|---|---|---|
| Rest | `panel-2` `#1a1a1b` ground, `line` `#29292b` border, `dim` `#9b9b9f` text | `#e5e5e5`, `#d5d5d5`, `#505050` | `panel-2`, `line`, `dim` |
| Hover | text `text-strong` `#f1f1f2`, border `ghost-border-hover` `#404040` | `#0e0e0e`, `#bfbfbf` | `text-strong`, `ghost-border-hover` |
| Pressed (`aria-pressed="true"`) | `panel-3` `#202021` ground, `text-strong` text, `accent-border` `#434343` border | `#dfdfdf`, `#0e0e0e`, `#bcbcbc` | `panel-3`, `text-strong`, `accent-border` |
| Focus | the shared ring, `0 0 0 2px accent` at 2px offset | `#1b1b1b` | `{components.focus}` |

A pressed button that is also hovered keeps the pressed look (the mock's rule order). Nothing animates: the change is one frame.

### Rail row (Outputs half)

Two visually distinct registers on one line, because AD-2 forbids merging them. The **disk state** (from the watcher) is the row's own typography — file name at `{typography.body-ui}`, directory line at `{typography.meta}`, state string at `{typography.label}`. The **run annotation** (owner, section in flight, `stopped`) is optional and must be able to be absent without the row looking broken. When a file is being written: name goes `text-strong`, meta goes `amber`, the icon stroke goes `amber`, and the dot pulses. Otherwise the icon stroke is `faint`. The file icon is a 12×14 inline SVG of two paths (page plus folded corner) at `stroke-width:1`, rendered at `.75` opacity. The rail is otherwise entirely monochrome.

### Document card

`{rounded.card}` radius, `panel` body, 1px `line` border, three parts.

- **Head** — `panel-2` ground, `1px line-soft` bottom rule, `7px 11px`. Status dot · file path in `mono` `{typography.ident}` at `text` · status string in `mono` `{typography.meta}` right-aligned in `amber` while writing and `green` when saved · elapsed in `mono` `{typography.meta}` at `faint` · the stop control. **Run-list head** (a run that writes no document, 2026-10-09, from the screenshot): the skill's name in `{typography.ident}` `text-strong` at 600, then `run` in `dim`; at the right `working` and the elapsed in `mono` `{typography.meta}`; the stop control stays. With no known skill name the head reads `run` alone `[ASSUMPTION — OPEN]`. *Added 2026-10-15 (Story 7.5):* in a skill-first session the name is the session's own, so the head reads `<skill> run`, the skill in the same `text-strong` 600.
- **Body** — `max-height: 230px`, scrolling, padding `11px 13px` `[ASSUMPTION]` (the one value no source states; matched to the side-section padding). **Two modes, both content, per the approved dead-air treatment.** In prose mode: `doc-prose` (mono 11.5/1.72) in `ink-doc`, `white-space: pre-wrap`, headings in `ink-doc-strong` at 600, muted runs in `ink-doc-mute`, with the streaming caret at the tail. In run-list mode: the steps and the run notes in one list (*Run step* and *Run note*, below). The card never has an empty body. Which mode is showing, and when it switches, is EXPERIENCE.md's (→ *State Patterns → Document card*).
- **Foot** — `panel-2`, `1px line-soft` top rule, `6px 11px`, `{typography.label}` sans at `faint`, 8px gaps (the mockup's `.df`), wrapping. Carries the counts and the **named list of not-yet-written sections**. There is no denominator and no progress bar anywhere in the card. A run that writes **no document** has no foot `[ASSUMPTION]`: the screenshot draws none.
- **Caret** — 6.5 × 13px `accent` block, `blink 1.05s steps(1)`. Removed, not faded, when writing stops. It is one caret, shared with the conversation turn in flight (below): the same class, size, colour and blink wherever words are being written.

### Run note (the run-note feed)

The anatomy of one run note, wherever it appears. What each kind *means* is EXPERIENCE.md's (→ *Dead Air → The four kind tags*).

Three-column grid `58px · 74px · 1fr` at 10px gap, baseline-aligned, 5px vertical padding, consecutive rows separated by `1px line-soft`.

1. **Time** — `mono` `{typography.meta}` in `faint` with `font-variant-numeric: tabular-nums`. Tabular is required; a ragged time column destroys the feed's scannability.
2. **Kind tag** — `{typography.micro}` (mono 10.5px, .04em), `{rounded.chip}` radius, `0 5px`, left-justified in its column. Four kinds, written `kind:…` throughout because `note` also names a colour token and a status-dot state:
   - `kind:decision` — `accent` on `accent-bg`, border `accent-border`. The accent treatment, because a decision is the product's whole point.
   - `kind:assumption` and `kind:note` — the neutral tag: `dim` on `panel-2`, border `line`. **`kind:note` is the neutral tag and must not use `{colors.note}`**, which belongs to the status dot and to nothing else.
   - `kind:open` — the **`disagree`** treatment: `disagree` on `disagree-bg`, border `disagree-border`. An unresolved question is friction, not failure; it must not use `red`.
3. **Reason** — `sans` `{typography.body-ui}` in `dim`, with the substantive phrase emphasised in `text` at 600. One step of weight and one step of ramp, never a colour.

### Run step

*Added 2026-10-09, from [`mockups/chat-thread-reference.png`](mockups/chat-thread-reference.png).* One row of the run list (EXPERIENCE.md → *State Patterns → The run list*), in the card body beside the run notes. The two kinds of row keep their own grids; there is no shared column.

Grid `14px · 1fr · auto` at 9px gap, baseline-aligned, 3px vertical padding, no rule between rows.

1. **Mark** — `mono`. `✓` in `green` when the call is done; the amber `work` status dot with its pulse while it runs; `✕` in `red` when it failed `[ASSUMPTION]`.
2. **Label** — `mono` `{typography.ident}`: `dim` once done, `text` while running. A few words: the verb and its target.
3. **Elapsed** — right-aligned, `mono` `{typography.meta}`, tabular figures: the call's duration (`0:03`) in `faint` once done, and `now` for the step in flight in `dim` — under reduced motion `now` carries the liveness, so it may not sit at `faint`.

No shimmer, no bar, no pending row. The pulse on the running step's dot is the existing `pulse`, so the motion inventory stays at five.


### Tags — neutral and disagree

Identical geometry, two tones. `{typography.micro}` type, `{rounded.chip}` radius, `0 5px` padding.

- **Neutral** — `dim` on `panel-2`, border `line`. Labels: `evidence`, `concedes · partly`, `speaking`, `proposed`, `answers`, `builds on`, `decides`, `present · listening`.
- **Disagree** — `disagree` on `disagree-bg`, border `disagree-border`. Labels: `disagrees · <name>`, `disagrees · framing`, `unresolved`. **The only warm-toned chip on screen.** The transcript's `evidence`, `disagrees · …` and `unresolved` tags are **deferred from v1** (EXPERIENCE.md → *Party Mode*): the anatomy is kept so they can land without a respec.

### Decision option

The block a persona raises inside its own turn when it stops to ask (Flow 1's FR-7 beat). Appearance only; when it appears, what activating it does, and what becomes of it afterwards are EXPERIENCE.md's (→ *Component Patterns*).

- **Block** — a bare column, `8px` above and `4px` below, with no ground, border or padding of its own. One block per question, holding the title and the options; the options stack at `{spacing.sm}`.
- **Option** — a card, as the mockup draws it: a `panel` ground, 1px `line`, `{rounded.DEFAULT}` (5px), `9px 11px`, the key and the text `{spacing.lg}` apart. Under the pointer the border goes to `decision-hover-line` and the ground to `panel-2`.
- **Title** — `{typography.name}` (12.5px/600) in `text-strong`, above the cards.
- **Option key** — the leading badge (`A` · `B` · `C`): `{typography.label}` mono in `{colors.accent}` on `{colors.accent-bg}`, 1px `{colors.accent-border}`, `{rounded.chip}`. This is the block's single accent use.
- **Option text** — the mockup's option title: `{typography.name}` (12.5px/600) in `text-strong`, at the default line-height. The persona's option is one string where the mockup splits a title from a line of detail, so the whole string takes the title's treatment.
- **Lean** — where one option carries the persona's stated lean, the lean is part of that option's own words. No badge, no highlight, no sort order, no default selection, no recommended styling of any kind.

The block has **no chosen state and no disabled state**, because it does not survive being answered: the whole block is removed once the question is answered.

### Focus

One treatment, everywhere: `{components.focus}` — a `0 0 0 2px {colors.accent}` ring at **2px** offset, drawn outside the element and inheriting its radius. Stacked initials take a **3px** offset so the ring clears the `-5px` overlap of the disc behind. There is no focus fill, no focus shadow, no colour change and no motion; the ring is the whole treatment and it is identical on every primitive.

It is specified for **every surface EXPERIENCE.md requires to be keyboard-operable**: the view switch and each of its buttons, the persona tile, the skill seat, the `Skill Session` button, the skill button and `+N more`, the composer's send button, the decision option, the document card and its stop control, the rail row, a Board card or epic row that has a file (Story 7.1, 2026-10-15), the document window's three escapes, the cast chooser, the party header controls, and the initials token.

`:focus-visible` only — a mouse press never draws the ring. Hover and focus are separate treatments and must not be collapsed into one: hover is `panel-2`, focus is the accent ring, and a surface may carry both at once.

### Skill button

`panel-2` ground, 1px `line`, `{rounded.control}` (4px) radius, `{typography.body-ui}`. Carries a leading code chip in `{typography.micro}` mono, `accent` on transparent with an `accent-border` border at `{rounded.micro}` (2px) radius — one step tighter than its parent. Hover: border `skill-button-hover-line`, ground `panel-3`. The `+N more` variant renders in `faint`.

The row must look right at **1 to 10 entries**. Its overflow behaviour — in-place expansion, and what must never happen instead — is EXPERIENCE.md's (→ *Component Patterns → `+N more`, in detail*).

### Conversation turn

The conversation's most-repeated element, and the one the radius table names only in passing. **A flat row** (2026-10-09, from [`mockups/chat-thread-reference.png`](mockups/chat-thread-reference.png)): no container, no radius, no ground, no border. An initials disc (`{components.initials}`, 26px) on the left and, on the right, a header line over the words, 11px apart; successive turns 16px apart. The disc is the same for a persona and for you, with your tint (*Initials*). In a skill-first session it is the skill variant (the `/` disc). The thread, in the 1:1 or in the room, draws no image of a person.

The header is, on one baseline and 8px apart, the name at `{typography.name}` (12.5px/600, `text-strong`), the role at `{typography.ident}` (11px, sans, `faint`) and the clock time in mono at `{typography.meta}` (10px, `meta`), **inline after the role, not pushed to the right edge**. The words follow at `{typography.base}` (13px) in sans, `white-space: pre-wrap`, with paragraphs split on blank lines and nothing else, for your turn, for a turn still in flight and for a turn the sanitiser could not draw: no prefix, frame, label, summary or classification of what a persona said. A persona's *completed* turn is read as markdown instead (*Markdown in a persona's turn*, below). Your name, a persona's name and role, and your own words are rendered as text. The `@name` a handoff was typed with is drawn in your turn as the `mention` chip (frontmatter) before the words: mono at `{typography.ident}`, `panel-2` ground, 1px `line` border, chip radius, `text` colour, not a control. It comes from the stored `mention` field beside the text (AD-25), never from parsing the words, so a restored turn reads as it did live; the persona received only the text.

**Markdown in a persona's turn** *(Story 7.2, FR130, 2026-10-15).* A persona's completed turn, in the thread and in the room alike, is drawn through the document window's one pipeline (`markdown-it` with HTML off, then the allow-listed DOMPurify pass) and its one `innerHTML`, under the chat's own class `.turn-md`, never the document window's `.doc-md`. It keeps the chat's type and measure: sans at `{typography.base}` / `{typography.base}` line height, `text`, wrapping anywhere. **No heading is larger than the words**: `h1` to `h6` are all `{typography.base}` at the strong weight, in `text-strong`, set apart by weight and a gap alone. Paragraphs are 8px apart, as in plain words, and a single line break inside a paragraph is kept; a list indents by the document list indent; a quote keeps a 1px `line` rule on its left in `dim`. **Code** is mono at `{typography.body-ui}` on `panel-2` with the chip radius; a **code block** is the same on `panel-2` with the control radius, `overflow: auto`, so a long line scrolls inside the turn. A **table** is `display: block` and scrolls sideways inside the turn (1px `line` cell borders, a `panel-2` header row in the strong weight): it never widens the column. A requirement id is the accent mono `.fr` span of the document window, with no link; links, images and raw HTML are inert text, as there. **Streaming, then once**: while a turn is in flight its words stay plain text with the caret, and the pipeline is not run for it; when the turn ends the words are replaced, in one render and with no animation, by the markdown, in the same turn row, and the caret and state line go. A turn read back from a stored transcript is rendered. Where the pipeline gives nothing for words that are not blank, the turn is plain text and never an empty row. Your turn, a sysline, a decision block, a run card's prose and a step label stay plain text.

**A skill-first turn** *(Story 7.5, 2026-10-15).* The same row, with the skill variant of the disc (26px) and a head of the **skill name in `{typography.name}` size and weight in the mono family, `text-strong`**, then the time as for a persona. **No role**: a skill has none, so nothing sits where the role does, and the time follows the name 8px on. It never takes a persona's letters or tint. Its run card head reads `<skill> run` (*Document card*). When the run ends the thread adds nothing about who to talk to next: no prompt, chip or suggestion.

**Your turn** is the same row as a persona's. It has no ground and no rule: the one difference is your disc's tint and your name. It is not a different component.

No hover lift, no entrance animation, no typewriter reveal. The thread caps at `{spacing.thread-max}`.

**A turn in flight** is drawn in the thread with these same parts and nothing new. While a persona's turn is in flight, the **caret** (the document card's: 6.5 × 13px `accent`, `blink`) sits at the tail of the last paragraph of its words, inside the paragraph and after the last character, and the persona's **`work` state line** sits under the words: the amber dot with its halo and pulse, and `working · <elapsed>` in `{typography.label}` mono at `dim`, `{spacing.md}` below the words. Both are removed, not faded, when the turn ends; the words are then exactly as they were said.

- **The pending turn.** Before a persona's first word, the thread's foot carries a persona turn with no words: the same row, the initials disc and the head (name, role, the time the turn began), the caret as the **whole body**, and the state line under it. It is drawn from the same parts as a turn with words, and is replaced by the persona's turn when the first word lands, with the caret then at the tail of those words. It sits above any queued message of the user's, which keeps its own treatment.
- **The room's pending row.** In the party thread, before anyone is known to be speaking, the foot carries a row in the turn row's place with **no disc, no head and no caret**: only the state line, counted from the user's send. Once a speaker's words land, their live turn (the accent edge and `party-live-ground` are kept: the only turn row with either, `[ASSUMPTION — OPEN]`) takes the caret and the state line, and the cast card lights as it always has.
- **Nothing else.** No skeleton of a turn, no placeholder word (`thinking`, `typing`, `…`), no spinner, no new animation: the pulse and the blink are the two the motion table already lists. Words arrive as main delivers them; a burst (an opening greeting comes from the CLI whole) lands whole and is never paced out.

### Chat header

*Added 2026-10-09, from [`mockups/chat-thread-reference.png`](mockups/chat-thread-reference.png); the built header's second description line is replaced by the one-line form.* 46px, `chrome` ground, 1px `line` below, `0 16px`, 10px gaps, one line.

- **Left** — the persona's initials disc at 22px, the name at `{typography.name}` in `text-strong`, then `title · story <id>` in `{typography.body-ui}` `dim`. The story reference is omitted when there is no source; it is never drawn empty.
- **Right** — the existing status pill (the state's dot and word), then **`Stop`**: a ghost button, `panel-2` ground, 1px `line`, `{rounded.DEFAULT}`, `3px 10px`, `{typography.body-ui}` in `dim`, `text-strong` and a stronger border on hover. While no turn is in flight the slot is `close session`, as built `[ASSUMPTION — OPEN]`.
- **Ellipsis, not wrap**, as built: the name and the line truncate.
- **Skill variant** *(Story 7.5, 2026-10-15)* — a skill-first session: the skill variant of the disc at 22px, the **skill name** in `{typography.name}` size and weight in the mono family, `text-strong`; **no title and no story reference** (nothing is drawn after the name). Right: the status pill, then `Stop` while a turn is in flight and `close session` otherwise (Story 7.4's end), both as above.
- **The empty `New session` chat** — the same 46px header with the 22px skill-variant disc and **`New session`** in `{typography.name}` sans, `text-strong`. **No pill, no Stop, no close**: the right side is empty. It is the chat a window opens on, where the window lands after the user ends the skill session being viewed, and what the `Skill Session` button opens; the thread shows nothing, the composer is empty with focus and carries a hidden `aria-label` of `message`. The button is pressed while it is open. [`mockups/new-session-landing.html`](mockups/new-session-landing.html) draws it in both moments.


### Composer

`panel` ground, 1px `line`, `{rounded.card}` (6px) radius. Focus changes nothing about the field: no border shift and no ring on the textarea (a decision; the mockup's `#484848` focus-within border is not carried, and the field is the one exemption from the shared ring). Placeholder `composer-placeholder`. Textarea autogrows 20px→120px, clamped in CSS and sized from its content. It is never disabled; the send button keeps the shared focus ring. `Enter` sends, `Shift+Enter` is a newline, and no other chord sends. Send button: `send-bg` ground, `send-line` border, `send-ink` glyph, `{rounded.control}` radius, `send-hover` on hover. Hint lines below at `{typography.label}` in `{colors.meta}`.

### Cast card

`{rounded.card}` radius, `flex:1 1 0` at `min-width:148px`, on a `grad-cast` strip that scrolls horizontally. A **26px initials disc** (2026-10-15), name at `{typography.name}`, title at `{typography.ident}`, status at `{typography.micro}`. **Default `{opacity.idle}`** (.42), hover `{opacity.hover}` (.72), speaking `{opacity.speaking}` with border `cast-speaking-border`, ground `cast-speaking-ground`, the accent glow, and status in `accent` with the equaliser. The speaking card keeps its lit border; the ring that sat on the portrait goes with it. Presence is expressed by dimming, never by removal — every chosen persona's card stays visible for the life of the room.

### Welcome

A window of its own, opened by main when the harness starts without a project and each time the last project window closes. It has the topbar (brand mark, `│`, `no project open`) and nothing else in it that is shell: no chips, no view switch, no rail, no composer.

**Head.** A 30px brand mark beside the title (`h1`, 20px/600, `text-strong`) and a one-line tagline (`ident`, sans, `dim`): `a visual harness for bmad projects`, which is the package description, said once.

**The open action** is one button and one drop zone, side by side in the same 1px dashed `line` box. The button is the composer's send button with a folder glyph drawn the way the rail row's file icon is: one inline stroked path, 15px, `1.4` weight, round caps, in `accent`, with no font and no file and the chord `⌘O` in `meta` mono beside the label. The label is `open project folder…`. The drop zone's own text, `drop a project folder here`, is mono at `dim`: it is an instruction a user acts on, so it does not sit at `faint`. While a folder is dragged over the window the box takes `accent-border` and an `accent-bg` ground; that is the whole feedback, with no animation.

**Recent** is a section label (`recent`, mono, `faint`) over rows. A row is the project's folder name in `accent`, the folder's parent path in mono at `dim` with the home directory written `~`, and its age at the right in `meta` mono (`2h`, `3d`). Hover underlines the name, as every link in the product does. A project whose folder is gone keeps its row, with the name at `dim`, no underline and the text `folder missing` in the age's place. **There is no install chip, count or version on a row**: the harness stats a folder here and runs no resolver for a row it has not opened.

**The team** sits under a full-width `line` rule: the label `the team` and one meta line (`the five core personas, by phase of the method · a project's own install can add more`). Four **lanes**, in the order of the method — `analysis`, `planning`, `solutioning`, `implementation` — each headed by its label, a rule and its number. A **persona card** is a 26px initials disc (2026-10-15), the name at `name` and the title at `ident`, with a two-to-three-line description in `body-ui` at `dim`. Two cards share `planning`, so that lane is twice the width. Cards are content, not controls: they take no focus, have no hover state and open nothing. **Discs are at full opacity** (the dimming of a cast card means *not speaking*, and nobody is in a room here) and are the same initials discs as everywhere, at the same 26px.

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

A separate OS window over a `scrim` fill at z-40, window at z-50, top `8vh`, `min(880px,92vw) × min(760px,80vh)`. `panel` ground, 1px `win-line` (`#3a3a3a`), `{rounded.window}` (8px) radius, `shadow-window`.

Title bar 36px on `grad-titlebar`: three 10px `win-light` circles, the **full path** in `mono` `{typography.ident}` (not the basename), then ghost buttons. Body `26px 34px 40px`. Foot 28px at `{typography.meta}`.

**Rendered markdown** is constrained to `70ch` at `doc-read` (sans 13.5/1.72) in `ink-md`. h1 20px/600 at `-.01em` with a mono `ident` sub-line in `faint` over a bottom rule; h2 14.5px/600; h3 12.5px/600 uppercase `.03em` in `dim`; tables collapsed at 12.5px with `panel-2` headers in uppercase `ident` at `.04em`; requirement ids `.fr` in `mono body-ui` `accent`, nowrap.

The renderer's visual range is **exactly what sanitized markdown-it output can be** — HTML disabled, DOMPurify applied, no raw HTML, no embedded styles, no images-by-markup from project documents. It must look intentional within that ceiling rather than like a document that failed to load. There is no refresh control and no editing affordance, because there is no edit path.

### Shell furniture

**Topbar** 42px `chrome`, 1px `line` bottom, 14px gaps. The brand mark is pure CSS — a 16px bordered square with an `::after` accent square inset 3px, at `.75` opacity. Breadcrumb separator is the literal `│`. **Segmented control** at `{typography.control}` (12px) size, `{rounded.DEFAULT}` radius; pressed is `[aria-pressed="true"]` → `raised` ground, `text-strong`, `inset 0 -2px 0 accent`. **Legend footer** 24px `chrome` with the badge in `legend-badge` on `legend-badge-bg`, uppercase `{typography.badge}` at `.08em`.

**Sysline** is the harness's own voice in the transcript: centred `{typography.label}` (11px) mono in `faint`, with a 1px `line` rule filling the space either side via `::before` / `::after`, margin `14px 2px 10px`. It carries session-resumed, handoff and room-opened notices, and, from Story 7.5, two lines about a skill session: **`no skill named <word>`** (`<word>` the first word as typed; shown in the empty chat when a first message does not begin `/<name>` with an installed skill: no persona answers, no user turn is drawn, the unsent text stays in the composer) and **`session ended`** (a message to a skill session that ended with a relaunch: nothing starts, the text stays in the composer). Both are lower-case, with no full stop, in this style and no other, one line each. It is never styled as, or attributed to, a persona — see `EXPERIENCE.md` → *Voice and Tone*.

**Scrollbars** are custom: 10px wide, `scrollbar-thumb` (`scrollbar-thumb-hover` on hover), `{rounded.scrollbar}` (10px) radius, with a 3px transparent inset border and `background-clip: content-box` so the thumb reads as narrower than its track.

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
| State strip | *Built.* **counts personas only** (2026-10-15): a skill session adds to no cell, and the head's `5 agents` figure equals the personas. A four-cell grid (working, idle, error, changed), 1px `line-soft` between cells and below. Each cell, centred: the figure at `{typography.head}`, weight 600, tabular, `text-strong`; the label at `{typography.micro}` uppercase `faint`, tracked `.04em`, the state's own word in lower case in the markup. Cell padding `--team-strip-padding` (8px 4px), so the longest label fits at the default width. No cell takes colour, a fill or the accent: it is a count, not an alert |
| Nav row (*Sprint board*; the *Inbox* row is deferred, not built, and holds no slot) | padding `6px 11px`, `{typography.control}` in `dim`, a 1px `line-soft` below, `panel-2` on hover; the current row takes `panel-2` and `text-strong`. A trailing key hint is a chip: `{typography.label}` in `faint`, 1px `line`, `{rounded.chip}`. **No count** on any row. *Added 2026-10-15:* the **`Skill Session` button** (*Components → Skill Session button*) sits at the row's right edge, after the key hint; it is not a second row |
| Persona tile | the tile (*Persona tile*: 44px, a 26px initials disc, since 2026-10-15), in config order. Idle tiles dim at `{opacity.idle}`. No group heading by state |
| Skill sessions group | *Added 2026-10-15.* The heading `Skill sessions` (the existing group-heading treatment) and the skill seats (*Skill seat*), below the last persona tile, in start order. Drawn only while a seat exists, with no empty state |

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
| Message actions | a toolbar on the turn row's top-right edge: `panel-2`, 1px `line`, `{rounded.control}`, padding `2px`. Buttons at `{typography.control}` in `faint`, `text-strong` on hover and focus, a `panel-3` ground on hover. Shown on hover and on `:focus-within` of the turn; no animation |
| Thinking row | one line at `{typography.ident}` mono in `faint`: a `▸` (`▾` open), then the persona's own thinking summary. Opened, the text reads in `{typography.doc-prose}` at `ink-doc-mute`, indented to the words, in the turn's measure |
| Decision card | the existing decision block as a card: 1px `line`, `{rounded.card}`, `panel` ground; head `panel-2` with the persona and the position (`1 of 2`); options as rows at `{rounded.card}`, 1px `line-soft` on `bg`, the chosen one on `accent-bg` with a 1px `accent-border` and a 12px circle in `accent`, filled when chosen. Foot `panel-2`: *Confirm* is the one control that takes `accent-border` and `accent-bg`; *Skip* is a ghost button. The key hint sits right at `{typography.meta}` in `faint` |
| Keyboard hints | one centred row under the composer: key chips as above, `faint`, `{typography.label}`. The same row in every state |

**Board.** One scrolling column on `bg`, padding `16px 18px 20px`. Every region is a panel: `panel` ground, 1px `line`, `{rounded.card}`, head `panel-2`.

| Region | Anatomy |
|---|---|
| Overview | *Built.* two cells, and no third (the Inbox's `decisions open` is deferred and holds no slot), in one panel with a 1px `line-soft` between them, each as wide as its figure needs (`--board-figure-min`). Label `{typography.micro}` uppercase `dim` (it is the only carrier of what the figure counts); figure `{typography.h1}` weight 600, tabular, `text-strong`; a line under it at `{typography.body-ui}` `dim`. Both are alike: none takes the accent or a border |
| Board | *Built.* five columns (and one more for each status the file holds beyond them) in one panel, 1px `line-soft` between them, each padded `8px`. Column head: the status as the file writes it, `{typography.micro}` uppercase `faint`, **no count**. A column with no card says `no stories` in mono `dim`. Cards stack with a `7px` gap |
| Story card | *Built as the id and the title only.* `bg` ground, 1px `line`, `{rounded.control}`, padding `7px 8px`. Id in mono `{typography.label}` `faint`; the title at `{typography.control}` `text`; a foot at `{typography.ident}` `faint` with the owner's initials disc (*Initials*) and the run's `working · <elapsed>`. A card with a run on it takes the amber pulse dot and a 1px `accent-border`. **The foot, the disc and the run treatment are cut:** they were Story 6.8, cut 2026-10-10 for want of a run-to-story rule, so a card carries no owner. The disc and `working · <elapsed>` are drawn on the Agents row only. **No progress bar.** *Amended 2026-10-15 (Story 7.1):* a card whose story has a file is a native button that fills the card (the card's padding and ground are unchanged): reset to the card's own words, a pointer, the shared focus ring, and **no icon, count, hover reveal, colour or path of its own**; a card with no file is exactly the card above and is not a control |
| Epics | *Built.* rows at `{typography.control}`: id in mono `dim`, title `text`, then one decorative track (`--board-bar-width` by `--board-bar-height`, `line` ground, a `dim` fill, pill radius, `aria-hidden`; drawn only for an epic with stories) and `n of m stories done` in mono `dim` on the right; an epic with no stories says `no stories`; 1px `line-soft` between rows. The words are the one place the figure is stated: no `<progress>`, `<meter>`, percentage or accent. *Amended 2026-10-15 (Story 7.1):* a row whose epic has a context file is the same row inside a native button, with the same treatment as the story card; a row with none is text |
| Agents | the persona tile's anatomy in a panel: the 26px initials disc (2026-10-15), name and title, the state line, the run line (code, subject path, elapsed) in mono `dim`, not `faint`: it is the only carrier of the fact. Idle rows dim at `{opacity.idle}` |
| Recent activity | rows at `{typography.control}`: the status dot, the persona's name in `text`, what it did (`started CP`, `finished CP`, `stopped CP`, `failed CP`) in `dim`, the absolute `MM-DD HH:MM` time right-aligned in mono `dim`, not `faint`: it is the only carrier of when; 1px `line-soft` between rows. Only the start row of a run still running pulses; every other dot, the `work` dot of an ended run's start row included, is drawn still (amber, no pulse). ***A skill-first run*** *(Story 7.5, 2026-10-15)*: the row is the same, with **the skill name in the persona's place** (mono, `text` `[ASSUMPTION]`: the skill-name register everywhere else) and the words `started`, `finished`, `stopped` or `failed` in `dim` **with no code** (it would repeat the name); the same dot rules and the same `MM-DD HH:MM`. It is never a Board column, has no story owner, and the Agents panel counts no persona for it |

**Motion.** Nothing here adds to the closed motion inventory (*Motion*): no shimmer, no fade for the actions toolbar, no transition on a splitter.


## Do's and Don'ts

| Do | Don't |
|---|---|
| Reference a token for every colour, dimension, radius and font stack | Write a literal colour, dimension, radius or font stack in a component — AD-14 calls this a **defect**, not a style preference |
| Ship `--red` in the verbatim `:root` block even though nothing referenced it in the mockup | Use `red` for disagreement, or `disagree` for failure — they are two tones with two meanings |
| Use `note` (`#8e8e93`) for the *state* dot | Reuse the `accent` hex as a state, which is the exact defect AD-14 names |
| Keep four state **colours** — green, amber, red, note — and five dot states counting `faint` idle | Invent a fifth state colour, or colour-code by persona, module, file type or recency |
| Pick the right radius for the kind of object — eleven declarations, ten values, by role | Normalise everything to one radius "for consistency" — the variation is the encoding |
| Set document prose in `mono` and run notes in `sans` in the same card body, and keep run-step labels to a few words (steps are mono too) | Separate the two feeds with a container, rule or label — the typeface register **is** the mechanism |
| Use `mono` for paths, state, metadata, timestamps and codes | Set a file path in sans, or a persona's sentence in mono |
| Use 600 for emphasis, or one step up the text ramp | Use both at once, add a third weight, or emphasise with colour |
| Draw every person, persona or you, as an initials disc and a name: 26px in a turn, a seat, a cast card and a Welcome row, 22px in the chat header only, 20px for small references | Draw a portrait, an illustration or any other identity device, or give a persona a colour of its own. The product spends its restraint budget on nothing, and nothing replaces what it once spent on |
| Render `icon` from config as plain text in the harness's own register | Render `icon` as an image or an avatar, ever, including as a fallback |
| Animate only what is actually happening | Animate a transition, a reveal, an entrance, or anything decorative; substitute a spinner or skeleton at any point |
| Use `steps(1)` for the caret | Fade the caret — a fading caret is decoration |
| Draw a turn in flight with the parts the thread has: the caret, the `work` state line, the initials disc and head | Draw a skeleton turn, a placeholder word, a spinner, or pace a burst out character by character |
| Draw a turn as a flat row: disc, head, words | Give a turn a container, ground, left rule or radius |
| Disable **all** animation and transition globally under `prefers-reduced-motion: reduce` | Keep "essential" animation running, or leave a fact legible only while something moves |
| Restate any `faint`-tier fact at `dim` or above | Put a fact only a user can act on at `faint` or `{colors.meta}` on `bg` — the locked ramp makes that a real contrast risk |
| Express absence and inattention with opacity | Remove a chosen persona's card from the room |
| Build the party side panel with the *Room* section only, at its new width | Implement AD-14's 288px, or reserve slots for the deferred disagreement and decision sections |
| Let the rail stay monochrome and dense | Turn the rail into a dashboard with colour-coded rows or badges |
| Give the welcome its own breathing room, once, because it holds no state | Carry the welcome's spacing into the shell, or the shell's density into the welcome |
| Draw the open button's folder glyph inline as one stroked path, as the rail row's file icon is | Add an icon font, an icon set, an emoji or an image file for it |
| Show a drop target with a 1px dashed `line` border | Use a dashed border for anything but the welcome's drop zone |
| Keep the five Welcome personas as 26px discs at full opacity | Render a larger "hero" mark, or dim a disc that is not in a room |
| State a missing recent folder as `folder missing` | Show an install chip, agent count or version on a recent row, or run a resolver to fill one |
| Take every colour from a token, so both themes resolve through the same component | Name a theme in a component, or write a literal that is right in one theme only |
| Set the theme from the stored choice and the OS appearance in main, before a window is first shown | Read `prefers-color-scheme` in a stylesheet or a component, or paint a window in one theme and then switch it |
| Let the skill disc's `/` take its colours from `initials-bg`, `initials-line` and `initials-ink` only, so it resolves in both themes | Give a skill a colour or a letter of its own, or name a theme in the disc |
| Strengthen the state-dot halos in light (`.16`) | Reuse the dark alpha, which fades on white |
| Let a collapsed folder keep showing a file that is changing, with its amber dot and `changing` | Hide a live state because its row is folded away, or replace it with a count |
| Resize a panel with no easing and no snap, and return it to its default on double-click | Animate the panel's width, or snap it to preset widths |
| Say a folder disagreement as one mono line, in `dim`, with both folders named | Colour it, add an icon or a warning treatment, or recommend which folder is right |
| Show `↓ latest` as one literal string over a thread that is not following | Add a count, a dot, a *new* label, a pulse, or a shadow to it |
| Ship the two themes and nothing else | Add a high-contrast variant, or a third palette |
| Draw a skill seat as a persona tile's anatomy: 44px, the 26px `/` disc, the skill name in mono, `working · <elapsed>`, `live` or `ended` | Add a second row component, a control, a count or a menu hint to a seat, or sort seats by recency |
| Show `Skill sessions` only while a seat exists, in the existing group-heading treatment | Draw an empty group, a placeholder row or a new heading style |
| Draw the `Skill Session` button as the header's `Stop`: `panel-2`, 1px `line`, pressed on `panel-3` with `accent-border` | Give it an accent fill, an icon, a count, or a list of skills: it is an entry to a chat, not a launcher |
| Name a skill-first turn by the skill, in mono, with no role | Give it a persona's letters, tint or role, or suggest who to talk to next when its run ends |
| Say `no skill named <word>` and `session ended` as syslines: lower-case, mono, no full stop | Attribute them to a persona, add a suggestion, or colour them |
| Count personas only in the state strip and the head | Add a skill session to a state count, the Agents panel or a Board column |
