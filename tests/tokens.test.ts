import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  RULE_KINDS,
  allStylesheets,
  componentsUnder,
  guardedStylesheets,
  inlineStyleLiteralsIn,
  literalsIn,
  allMediaConditions,
  mediaConditionsIn,
  withoutComments
} from './literal-guard'

/**
 * The visual contract, asserted by command rather than by reading.
 *
 * Two things make this suite load-bearing rather than decorative:
 *
 *  1. The verbatim block is compared against `harness-mockup.html` read *at run
 *     time*, never against a copy pasted in here. Edit either file alone and
 *     the suite goes red — which is the whole point of UX-DR1's "copied
 *     verbatim, in source order… not a starting point to be tuned".
 *  2. The NFR23 literal guard is a real checker run over the real tree, and
 *     also over in-memory probes. There is no other stylesheet under
 *     `src/renderer/` yet, so the filesystem sweep is vacuous today; the probes
 *     are what prove the guard is wired before Story 1.9 first needs it.
 */

const ROOT = resolve(import.meta.dirname, '..')
const MOCKUP = join(
  ROOT,
  '_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/harness-mockup.html'
)
const TOKENS = join(ROOT, 'src/renderer/design/tokens.css')
const ENTRY = join(ROOT, 'src/renderer/ui/main.tsx')
const INDEX_HTML = join(ROOT, 'src/renderer/index.html')
const DESIGN = join(
  ROOT,
  '_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
)

const tokensCss = readFileSync(TOKENS, 'utf8')

/** The mockup's `:root` block, located in the mockup itself — never transcribed. */
function verbatimBlock(): string {
  const style = readFileSync(MOCKUP, 'utf8')
  // Exactly one, or the comparison below could silently be against the wrong
  // block: `indexOf` would take an earlier arrival and the real one would drift
  // unwatched.
  const starts = [...style.matchAll(/^ {2}:root\{$/gm)]
  expect(starts, 'harness-mockup.html must hold exactly one `  :root{` block').toHaveLength(1)

  const start = starts[0].index
  const end = style.indexOf('\n  }', start)
  expect(end, 'the mockup `:root` block is unterminated').toBeGreaterThan(start)
  return style.slice(start, end + 4)
}

/**
 * A value out of DESIGN.md's frontmatter, read at run time. The spec makes that
 * frontmatter authoritative for every value below the verbatim block, so the
 * expectations are taken from it rather than transcribed here — the same
 * coupling `verbatimBlock()` gives the block above, extended to the rest.
 */
function designValue(section: string, key: string): string {
  const design = readFileSync(DESIGN, 'utf8')
  const from = design.indexOf(`\n${section}:\n`)
  expect(from, `DESIGN.md has no \`${section}:\` map`).toBeGreaterThan(-1)
  // Frontmatter maps are flat and two-space indented; the next top-level key
  // ends the section.
  const to = design.slice(from + 1).search(/\n[a-z][a-z-]*:/)
  const body = design.slice(from, to === -1 ? undefined : from + 1 + to)

  const found = body.match(new RegExp(`^ {2}${key}:[ \\t]*(.*)$`, 'm'))
  expect(found, `DESIGN.md \`${section}.${key}\` is missing`).not.toBeNull()

  // A trailing comment needs whitespace before its `#`, or every hex value in
  // the map would be read as an empty string followed by a comment.
  return found![1]
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^'(.*)'$/, '$1')
}

/**
 * A nested `components:` sub-map out of DESIGN.md's frontmatter, read at run
 * time like everything else here. `designValue()` above reads the flat,
 * two-space maps; a component block is one level deeper, so its own keys sit at
 * four spaces and the next two-space key ends it.
 */
function componentBlock(name: string): Record<string, string> {
  const design = readFileSync(DESIGN, 'utf8')
  const from = design.indexOf(`\n  ${name}:\n`)
  expect(from, `DESIGN.md has no \`components.${name}:\` block`).toBeGreaterThan(-1)

  const rest = design.slice(from + 1)
  const to = rest.slice(1).search(/\n {0,2}[a-zA-Z][\w-]*:/)
  const body = rest.slice(0, to === -1 ? undefined : to + 1)

  return Object.fromEntries(
    [...body.matchAll(/^ {4}([a-zA-Z][\w-]*):[ \t]*(.*)$/gm)].map(([, key, value]) => [
      key,
      // A trailing comment needs whitespace before its `#` — and that `#` must
      // not be a hex colour, or a value like `#242b34 ground, text-strong`
      // would be truncated to nothing and the next caller would silently
      // compare half a string.
      value
        .replace(/\s+#(?![0-9a-fA-F]{3,8}\b).*$/, '')
        .trim()
        .replace(/^'(.*)'$/, '$1')
    ])
  )
}

/**
 * The first line at which two texts diverge, 1-based, or null when one is a
 * prefix of the other. A bare `startsWith` assertion prints two walls of CSS;
 * this is what lets a failure name the line that moved.
 */
function firstDifferingLine(expected: string, actual: string): number | null {
  const expectedLines = expected.split('\n')
  const actualLines = actual.split('\n')
  for (const [index, line] of expectedLines.entries()) {
    if (actualLines[index] !== line) {
      return index + 1
    }
  }
  return null
}

/**
 * Every custom property declared in a stylesheet, in source order. Names are
 * matched case-sensitively but not case-*restrictively*: a `--Rail` that slipped
 * in must be visible to the assertions below, not invisible to them. A repeated
 * declaration throws rather than collapsing into one entry — two sources of
 * truth inside the one file that exists to be the single source of truth, and
 * every count assertion below would be blind to it.
 */
function customProperties(css: string): Map<string, string> {
  const declared = new Map<string, string>()
  for (const [, name, value] of withoutComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    if (declared.has(name)) {
      throw new Error(`${name} is declared twice`)
    }
    declared.set(name, value.trim())
  }
  return declared
}

const tokens = customProperties(tokensCss)
const namesMatching = (prefix: string) => [...tokens.keys()].filter((name) => name.startsWith(prefix))

describe('the verbatim block', () => {
  it('opens tokens.css at byte 0, byte-identical to the mockup and in source order', () => {
    const block = verbatimBlock()

    expect(block.split('\n')).toHaveLength(20)
    // Named separately from the startsWith below so a drifted file reports the
    // line that moved rather than two walls of CSS.
    expect(firstDifferingLine(block, tokensCss)).toBeNull()
    expect(tokensCss.startsWith(block)).toBe(true)
  })

  it('names the first differing line when a byte is changed, reordered or re-indented', () => {
    const block = verbatimBlock()
    const lines = block.split('\n')

    // Never written to disk: the drift is simulated in memory, the way
    // tests/layering.test.ts probes the layer rule.
    const retuned = lines.with(1, '    --bg:#101318;').join('\n')
    const reindented = lines.with(1, '  --bg:#101317;').join('\n')
    const reordered = lines.with(1, lines[2]).with(2, lines[1]).join('\n')

    expect(firstDifferingLine(block, retuned)).toBe(2)
    expect(firstDifferingLine(block, reindented)).toBe(2)
    expect(firstDifferingLine(block, reordered)).toBe(2)
  })

  it('holds --red, --mono, --sans and --r, and nothing below restates them', () => {
    const block = verbatimBlock()
    const below = tokensCss.slice(block.length)

    for (const name of ['--red', '--mono', '--sans', '--r']) {
      expect(customProperties(block).has(name), `${name} must sit inside the verbatim block`).toBe(
        true
      )
      expect(customProperties(below).has(name), `${name} must not be restated below it`).toBe(false)
    }
  })

  it('is followed by a second :root, so the copy stays byte-comparable', () => {
    const block = verbatimBlock()

    expect(tokensCss.slice(block.length)).toMatch(/:root\s*\{/)
  })
})

describe('the added colours', () => {
  it('declares --note, distinct from --accent', () => {
    expect(tokens.get('--note')).toBe(designValue('colors', 'note'))
    expect(tokens.get('--accent')).toBe(designValue('colors', 'accent'))
    expect(tokens.get('--note')).not.toBe(tokens.get('--accent'))
  })

  it('keeps the disagree trio outside the verbatim block and separate from --red', () => {
    const below = customProperties(tokensCss.slice(verbatimBlock().length))

    expect(below.get('--disagree')).toBe(designValue('colors', 'disagree'))
    expect(below.get('--disagree-border')).toBe(designValue('colors', 'disagree-border'))
    expect(below.get('--disagree-bg')).toBe(designValue('colors', 'disagree-bg'))
    // Red is failure, disagree is friction: neither may be derived from the
    // other by var(), or the two collapse into one idea at the first refactor.
    for (const name of ['--disagree', '--disagree-border', '--disagree-bg']) {
      expect(below.get(name)).not.toContain('var(')
    }
    expect(tokens.get('--red')).not.toContain('var(')
  })

  it('names every promoted literal, at the value DESIGN.md gives it', () => {
    const promoted = [
      '--accent-border',
      '--accent-wash',
      '--accent-edge',
      '--halo-live',
      '--halo-work',
      '--meta',
      '--ink-doc',
      '--ink-doc-strong',
      '--ink-doc-mute',
      '--ink-md',
      '--code-bg',
      '--code-ink',
      '--initials-bg',
      '--initials-line',
      '--initials-ink',
      '--win-line',
      '--scrim',
      '--legend-badge',
      '--legend-badge-bg',
      '--legend-badge-border'
    ]

    expect(promoted).toHaveLength(20)
    expect(promoted.filter((name) => !tokens.has(name))).toEqual([])
    // By value, not only by name: a mistyped hex is exactly the defect this
    // story exists to make impossible, and DESIGN.md is where the value lives.
    expect(
      promoted.filter((name) => tokens.get(name) !== designValue('colors', name.slice(2)))
    ).toEqual([])
  })
})

describe('the type scale', () => {
  it('is thirteen sizes, each at the value its role carries', () => {
    // DESIGN.md's `typography:` map is nested rather than flat, so this is the
    // one family that cannot be derived — an exact name→value map instead of a
    // count, or swapping two sizes would pass.
    expect(
      Object.fromEntries(namesMatching('--fs-').map((name) => [name, tokens.get(name)]))
    ).toEqual({
      '--fs-badge': '9px',
      '--fs-micro': '9.5px',
      '--fs-meta': '10px',
      '--fs-label': '10.5px',
      '--fs-ident': '11px',
      '--fs-body-ui': '11.5px',
      '--fs-control': '12px',
      '--fs-name': '12.5px',
      '--fs-base': '13px',
      '--fs-doc-read': '13.5px',
      '--fs-head': '14px',
      '--fs-h2': '14.5px',
      '--fs-h1': '20px'
    })
  })

  it('carries both platform stacks and no webfont', () => {
    expect(tokens.get('--mono')).toContain('ui-monospace')
    expect(tokens.get('--sans')).toContain('-apple-system')
    expect(tokensCss).not.toMatch(/@import|@font-face|fonts\.googleapis/)
  })

  it('is four line-heights: 1.55 / 1.72 / 1.45 / 0', () => {
    const lineHeights = namesMatching('--lh-').map((name) => tokens.get(name))

    expect(lineHeights).toHaveLength(4)
    expect(lineHeights.sort()).toEqual(['0', '1.45', '1.55', '1.72'])
    // Story 1.5 spells document prose var(--fs-body-ui) with var(--lh-read):
    // one size, two registers separated by line-height alone.
    expect(tokens.get('--fs-body-ui')).toBe('11.5px')
    expect(tokens.get('--lh-read')).toBe('1.72')
  })

  it('is the nine tracking values, each named for what it tracks', () => {
    // `--track-caps` is DESIGN.md's `label` tracking — uppercase rail and
    // section heads. It is deliberately not called `--track-head`, which would
    // pair by name with `--fs-head` (the 14px chat-header name) and silently
    // hand it .09em where .01em is meant.
    expect(
      Object.fromEntries(namesMatching('--track-').map((name) => [name, tokens.get(name)]))
    ).toEqual({
      '--track-caps': '.09em',
      '--track-badge': '.08em',
      '--track-skill-label': '.07em',
      '--track-skill-code': '.05em',
      '--track-micro': '.04em',
      '--track-md-h3': '.03em',
      '--track-brand': '.02em',
      '--track-control': '.01em',
      '--track-h1': '-.01em'
    })
  })

  it('defines 600 and no other weight anywhere in the file', () => {
    expect(namesMatching('--weight-')).toEqual(['--weight-strong'])
    expect(tokens.get('--weight-strong')).toBe('600')
    expect(withoutComments(tokensCss)).not.toMatch(/font-weight\s*:/)

    // Any other 100-step weight sitting in any value would be a second weight
    // in a system whose whole emphasis rule is that there is only one.
    const weightish = withoutComments(tokensCss).match(/(?<![\w.%-])[1-9]00(?![\w.%-])/g) ?? []
    expect([...new Set(weightish)]).toEqual(['600'])
  })
})

describe('the radius family', () => {
  it('is ten values by role, with --r as the DEFAULT and none an alias', () => {
    const radii = ['--r', ...namesMatching('--radius-')]
    const values = radii.map((name) => tokens.get(name))

    expect(radii).toHaveLength(10)
    expect(new Set(values).size).toBe(10)
    // Read out of DESIGN.md's `rounded:` map rather than transcribed, so the
    // ladder is coupled to the source that decides it.
    expect(tokens.get('--r')).toBe(designValue('rounded', 'DEFAULT'))
    for (const role of [
      'hairline',
      'micro',
      'chip',
      'control',
      'card',
      'window',
      'scrollbar',
      'full',
      'pill'
    ]) {
      expect(tokens.get(`--radius-${role}`), `--radius-${role}`).toBe(designValue('rounded', role))
    }
    // An alias would make the ladder shorter than it looks: radius here encodes
    // what kind of object a thing is.
    expect(values.filter((value) => value?.includes('var('))).toEqual([])
  })
})

describe('the layout constants', () => {
  it('is the ten-step spacing ladder DESIGN.md sets', () => {
    const rungs = ['hair', 'xxs', 'xs', 'sm', 'sm-plus', 'md', 'md-plus', 'lg', 'xl', 'xxl']

    expect(namesMatching('--space-')).toHaveLength(10)
    for (const rung of rungs) {
      expect(tokens.get(`--space-${rung}`), `--space-${rung}`).toBe(designValue('spacing', rung))
    }
  })

  it('binds the constants UX-DR7 names, plus the party side panel', () => {
    // `legend: 24px` sits in the same DESIGN.md map and is deliberately absent:
    // UX-DR28 cuts the legend footer from v1, so a constant for its height
    // would size a surface that does not ship. UX-DR7's list is the scope.
    const constants = [
      'rail',
      'topbar',
      'rail-head',
      'thread-max',
      'party-thread-max',
      'chat-sub-max',
      'doc-read-max',
      'win-width',
      'win-height',
      'win-titlebar',
      'win-foot',
      'card-body-max',
      'composer-min',
      'composer-max',
      'party-side'
    ]

    for (const constant of constants) {
      expect(tokens.get(`--${constant}`), `--${constant}`).toBe(
        designValue('spacing', constant)
      )
    }
  })

  it('carries the run note’s column widths and the hairline rule width', () => {
    // Story 1.5. These are component dimensions, which the block comment above
    // them sends to the story that builds the component — and they are here
    // anyway, because NFR23 leaves nowhere else for them: a component
    // stylesheet may not spell `58px`, `--radius-hairline` is a radius rather
    // than a border width, and the spacing ladder has no 1px rung.
    //
    // Read out of DESIGN.md's component block at run time, never transcribed,
    // so a retuned grid reddens this rather than drifting silently — the same
    // coupling the colours and radii above already hold.
    const runNote = componentBlock('run-note')

    for (const key of ['grid', 'rule']) {
      expect(runNote[key], `DESIGN.md components.run-note.${key}`).toBeTypeOf('string')
    }

    const [time, kind, flexible] = runNote['grid'].split(/\s+/)

    // The third column is flexible and so needs no token; asserted rather than
    // assumed, because a grid that gained a fourth fixed column would
    // otherwise leave this test quietly checking the wrong two.
    expect(flexible, 'the third run-note column takes no token').toBe('1fr')
    expect(tokens.get('--run-note-time')).toBe(time)
    expect(tokens.get('--run-note-kind')).toBe(kind)
    expect(tokens.get('--rule-width')).toBe(runNote['rule'].split(/\s+/)[0])
  })

  it('carries the initials disc’s three dimensions', () => {
    // Story 1.6, and here for the reason the run note's are: NFR23 forbids the
    // literal in any stylesheet but this one, and the spacing ladder carries no
    // signed rung — an overlap that pulls the next disc back over the one
    // before it is not a gap and does not belong on a ladder of gaps.
    //
    // Read out of DESIGN.md's component block at run time rather than
    // transcribed. A hand-copied `-5px` is exactly the value that drifts
    // silently: it appears in no other file, so nothing else would notice.
    const initials = componentBlock('initials')

    for (const key of ['size', 'sizeUser', 'stackOverlap', 'fontSize']) {
      expect(initials[key], `DESIGN.md components.initials.${key}`).toBeTypeOf('string')
    }

    expect(tokens.get('--initials-size')).toBe(initials['size'])
    expect(tokens.get('--initials-size-user')).toBe(initials['sizeUser'])
    expect(tokens.get('--initials-overlap')).toBe(initials['stackOverlap'])
    // The glyph size at the small disc needs no token of its own: it is the
    // `micro` rung of a scale whose half-point steps are explicitly real, and
    // it is asserted here so that a retuned block cannot leave the disc
    // spending a rung the contract no longer names. The mockup rounds this to
    // 9px; the spine wins.
    expect(tokens.get('--fs-micro')).toBe(initials['fontSize'])

    // The 32px glyph size is stated only inside that line's `[ASSUMPTION]`
    // comment, which `componentBlock()` strips — so it is read from the raw
    // line instead. Without this the larger disc's rung is transcribed and
    // nothing watches it, which is the half of the coupling that was missing.
    const stated = readFileSync(DESIGN, 'utf8').match(
      /^ {4}fontSize:.*#\s*\[ASSUMPTION\][^\n]*?([\d.]+px) at the 32px user size/m
    )

    expect(stated, 'DESIGN.md must state the 32px glyph size').not.toBeNull()
    expect(tokens.get('--fs-ident')).toBe(stated![1])
  })

  it('does not carry the superseded party-panel width', () => {
    // UX-DR8: the Room-only ruling resized the panel, and the wider literal
    // must not be implemented — not as a token, not as a comment, not anywhere.
    // Scoped to the dimension: a future `#288f4a` or `.288` alpha is not the
    // superseded width and must not redden this test.
    expect(withoutComments(tokensCss)).not.toMatch(/\b288px\b/)
    expect(tokens.get('--party-side')).toBe('240px')
  })

  it('carries no component dimension', () => {
    // Story 1.10 built the status dot and the persona tile, so their prefixes
    // left this list and gained the positive assertions below; the portrait's
    // size stays a render argument and never becomes a token.
    for (const name of ['--portrait']) {
      expect(namesMatching(name)).toEqual([])
    }
  })

  it('carries the status dot and the persona tile, read from DESIGN.md', () => {
    // Story 1.10. Read out of DESIGN.md's component blocks at run time, never
    // transcribed — the same coupling the run note's and the initials disc's
    // dimensions hold, so a retuned tile reddens this rather than drifting.
    const tile = componentBlock('persona-tile')
    const dot = componentBlock('status-dot')

    for (const key of ['height', 'currentBackground', 'currentEdge']) {
      expect(tile[key], `DESIGN.md components.persona-tile.${key}`).toBeTypeOf('string')
    }
    expect(dot['size'], 'DESIGN.md components.status-dot.size').toBeTypeOf('string')

    expect(tokens.get('--tile-height')).toBe(tile['height'])
    expect(tokens.get('--tile-current')).toBe(tile['currentBackground'])
    // `2px {colors.accent}`: the width is the first word, the colour is --accent.
    expect(tokens.get('--tile-edge-width')).toBe(tile['currentEdge'].split(/\s+/)[0])
    expect(tile['currentEdge']).toContain('{colors.accent}')
    expect(tokens.get('--status-dot-size')).toBe(dot['size'])
  })
})

describe('the files in the rail (Story 1.11)', () => {
  // Read out of DESIGN.md and the mockup at run time, never transcribed: a
  // retuned row reddens this rather than drifting.
  it('couples the file icon opacity to DESIGN.md components.rail-row.iconOpacity', () => {
    const row = componentBlock('rail-row')

    expect(row['iconOpacity'], 'DESIGN.md components.rail-row.iconOpacity').toBeTypeOf('string')
    expect(tokens.get('--opacity-mark')).toBe(row['iconOpacity'].replace(/^0(?=\.)/, ''))
  })

  it('takes the row padding and the icon size from the mockup lines it cites', () => {
    const mockup = readFileSync(MOCKUP, 'utf8')

    expect(tokens.get('--rail-row-padding')).toBe('6.5px 11px')
    expect(mockup).toContain('padding:6.5px 11px;cursor:pointer')
    expect(tokens.get('--file-icon-width')).toBe('12px')
    expect(tokens.get('--file-icon-height')).toBe('14px')
    expect(mockup).toContain('<svg width="12" height="14" viewBox="0 0 12 14"')
  })

  it('comments each of the three new tokens with where it came from', () => {
    const block = tokensCss.slice(tokensCss.indexOf('The project\'s files in the rail'))

    expect(block).toContain('.frow')
    expect(block).toContain('fileIcon')
    expect(block).toContain('components.rail-row')
  })
})

describe('the document window (Story 1.12)', () => {
  // Read out of DESIGN.md and the mockup at run time, never transcribed: a
  // retuned window reddens this rather than drifting.
  const mockup = readFileSync(MOCKUP, 'utf8')

  it('couples the lights, the body padding and the card geometry to DESIGN.md components.document-window', () => {
    const window = componentBlock('document-window')

    for (const key of ['lights', 'bodyPadding', 'radius', 'shadow', 'titlebar']) {
      expect(window[key], `DESIGN.md components.document-window.${key}`).toBeTypeOf('string')
    }
    // `10px {rounded.full} #3a424e`: the size is the first word, the colour the last.
    const [size, , colour] = window['lights'].split(/\s+/)
    expect(tokens.get('--win-light-size')).toBe(size)
    expect(tokens.get('--win-light')).toBe(colour)
    expect(tokens.get('--doc-body-padding')).toBe(window['bodyPadding'])
    expect(tokens.get('--shadow-window')).toBe(window['shadow'].replace(/\s*,\s*/g, ','))
    expect(window['titlebar']).toContain(tokens.get('--grad-titlebar'))
  })

  it('takes each promoted literal from the mockup line it cites', () => {
    expect(tokens.get('--win-top')).toBe('8vh')
    expect(mockup).toContain('top:8vh;left:50%')
    expect(tokens.get('--win-lights-gap')).toBe('6px')
    expect(mockup).toContain('.win .lights{display:flex;gap:6px;')
    expect(tokens.get('--win-foot-padding')).toBe('0 11px')
    expect(mockup).toContain('gap:12px;padding:0 11px;')
    expect(tokens.get('--ghost-padding')).toBe('4px 10px')
    expect(mockup).toContain('padding:4px 10px;font-size:11.5px')
    expect(tokens.get('--ghost-border-hover')).toBe('#39414c')
    expect(mockup).toContain('.ghost-btn:hover{color:var(--text-strong);border-color:#39414c}')
    expect(tokens.get('--md-h1-gap')).toBe('22px')
    expect(mockup).toContain('margin-bottom:22px;padding-bottom:14px')
    expect(tokens.get('--md-h2-margin')).toBe('24px 0 7px')
    expect(mockup).toContain('margin:24px 0 7px')
    expect(tokens.get('--md-h3-margin')).toBe('18px 0 5px')
    expect(mockup).toContain('margin:18px 0 5px')
    expect(tokens.get('--md-list-indent')).toBe('19px')
    expect(mockup).toContain('padding-left:19px')
    expect(tokens.get('--md-table-width')).toBe('100%')
    expect(mockup).toContain('border-collapse:collapse;width:100%')
  })

  it('comments the block with the mockup and the component it was read from', () => {
    const block = tokensCss.slice(tokensCss.indexOf('The document window (Story 1.12)'))

    expect(block).toContain('components.document-window')
    expect(block).toContain('.win')
    expect(block).toContain('.ghost-btn')
    expect(block).toContain('.md')
  })
})

describe('elevation and depth', () => {
  it('is exactly two z-indexes: 40 scrim, 50 window', () => {
    const stacking = namesMatching('--z-')

    expect(stacking).toHaveLength(2)
    expect(tokens.get('--z-scrim')).toBe('40')
    expect(tokens.get('--z-window')).toBe('50')
    // No elevation scale, no z1/z2/z3: a surface that needs a third is a window.
    expect(namesMatching('--elevation')).toEqual([])
    expect(withoutComments(tokensCss)).not.toMatch(/--z[123]\s*:/)
  })

  it('is four shadows, for the three jobs shadows are allowed', () => {
    expect(namesMatching('--shadow-')).toEqual([
      '--shadow-halo-live',
      '--shadow-halo-work',
      '--shadow-window',
      '--shadow-speaking'
    ])
  })

  it('expresses presence as opacity, never removal', () => {
    expect(namesMatching('--opacity-').map((name) => tokens.get(name)).sort()).toEqual([
      '.42',
      '.72',
      '.75',
      '1'
    ])
  })

  it('is the mockup’s two gradients and no more', () => {
    expect(namesMatching('--grad-')).toHaveLength(2)
    // Every gradient spelling, not just the two in use: a conic or repeating
    // one would otherwise be a third gradient the count never sees.
    expect(
      withoutComments(tokensCss).match(/(?:repeating-)?(?:linear|radial|conic)-gradient/g) ?? []
    ).toHaveLength(2)

    // Taken from the mockup at run time, like the :root block: these are the
    // only two gradients the product is allowed, so they are copied, not chosen.
    const mockup = readFileSync(MOCKUP, 'utf8')
    for (const name of ['--grad-cast', '--grad-titlebar']) {
      const value = tokens.get(name) ?? ''
      expect(mockup, `${name} must be a gradient the mockup actually draws`).toContain(value)
    }
  })
})

describe('the motion inventory', () => {
  it('is exactly five declarations', () => {
    expect(namesMatching('--motion-')).toEqual([
      '--motion-pulse',
      '--motion-blink',
      '--motion-eq',
      '--motion-reveal',
      '--motion-cast'
    ])
  })

  it('blinks on steps(1) — hard on/off, never a fade', () => {
    expect(tokens.get('--motion-blink')).toContain('steps(1)')
  })

  it('is closed by the three keyframes it names, copied from the mockup', () => {
    const declared = [...withoutComments(tokensCss).matchAll(/@keyframes\s+([a-z-]+)\s*\{.*/g)]
    const names = declared.map(([, name]) => name)

    expect(names).toEqual(['pulse', 'blink', 'eq'])
    // Read from the mockup at run time rather than trusted: a keyframe retuned
    // in either file alone is exactly the drift the verbatim block is guarded
    // against, and it was hand-transcribed until now.
    const mockup = readFileSync(MOCKUP, 'utf8')
    for (const [rule, name] of declared) {
      expect(mockup, `@keyframes ${name} must match the mockup`).toContain(rule.trim())
    }

    // No skeleton, no spinner, at any point in any state.
    expect(withoutComments(tokensCss)).not.toMatch(/spin|skeleton|shimmer/)
  })

  it('turns motion off globally, with no exceptions and no carve-out', () => {
    const media = [...withoutComments(tokensCss).matchAll(/@media\s*\(([^)]*)\)\s*\{([^}]*\})\s*\}/g)]

    expect(media).toHaveLength(1)
    const [, condition, body] = media[0]
    expect(condition.replace(/\s/g, '')).toBe('prefers-reduced-motion:reduce')
    expect(body.trim()).toBe(
      '*,*::before,*::after{animation:none !important;transition:none !important}'
    )
    expect(body).not.toContain(':not(')
  })
})

describe('the theme decision', () => {
  it('declares the dark colour scheme, so the UA paints its own chrome dark', () => {
    // NFR15 is dark only, and a dark palette alone does not reach form
    // controls, scrollbars, caret or text selection — the user agent paints
    // those, and without this declaration it paints them light on top of a
    // #101317 ground. Distinct from a theme *branch*, which line 496 forbids.
    expect(withoutComments(tokensCss)).toMatch(/\bcolor-scheme\s*:\s*dark\b/)
  })

  it('branches on no theme media query at all', () => {
    for (const branch of ['prefers-color-scheme', 'prefers-contrast', 'forced-colors']) {
      expect(tokensCss, `${branch} must not appear: NFR15 is dark only`).not.toContain(branch)
    }
  })

  it('styles no component: the only rules are :root, the keyframes and the media block', () => {
    const structural = withoutComments(tokensCss)
      .replace(/@keyframes[\s\S]*?\}\s*\}/g, '')
      .replace(/@media[\s\S]*?\}\s*\}/g, '')

    const selectors = [...structural.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(([, , selector]) =>
      selector.trim()
    )

    expect(selectors).toEqual([':root', ':root'])
  })

  it('declares the focus ring\u2019s values and still styles nothing with them', () => {
    // Story 1.3 left this seam open by asserting the file mentioned neither
    // `focus` nor `outline`. Story 1.4 closes it by inverting the same
    // assertion rather than deleting it: the values arrive, the rule does not.
    const focus = componentBlock('focus')

    // Every key by name before anything is read off it. Without this a renamed
    // key leaves `focus.offset` undefined, `tokens.get(…)` undefined too, and
    // `toBe` passes with neither existing — and a missing `ring` throws a raw
    // TypeError out of `.match` instead of naming what went missing.
    for (const key of ['ring', 'offset', 'offsetStacked', 'radius']) {
      expect(focus[key], `DESIGN.md components.focus.${key}`).toBeTypeOf('string')
    }

    // The ring is written as box-shadow geometry — `0 0 0 2px {colors.accent}`
    // — and its spread *is* the ring's width. Read out of DESIGN.md at run
    // time so a retuned ring reddens this file rather than drifting quietly.
    const LENGTH = /^\d+(?:\.\d+)?px$/
    const width = focus.ring.match(/(\S+)\s+\{colors\.accent\}$/)?.[1]

    expect(width, 'the ring geometry must end in a spread and {colors.accent}').toMatch(LENGTH)
    expect(width).toBe('2px')
    expect(focus.offset).toMatch(LENGTH)
    expect(focus.offsetStacked).toMatch(LENGTH)
    expect(focus.radius).toContain('inherits')

    // Each token present and shaped like a length, then equal to its source: a
    // token deleted from tokens.css must fail here rather than pass by being
    // as absent as the value it is compared against.
    for (const [name, expected] of [
      ['--focus-ring-width', width],
      ['--focus-ring-offset', focus.offset],
      ['--focus-ring-offset-stacked', focus.offsetStacked]
    ] as const) {
      expect(tokens.get(name), name).toMatch(LENGTH)
      expect(tokens.get(name), name).toBe(expected)
    }

    // The inset offset is derived, not read: minus the ring's own width, so the
    // ring is drawn just inside a clipped row's edge with its width unchanged.
    expect(tokens.get('--focus-ring-offset-inset')).toBe(`-${width}`)

    // Values only. A rule here would break the `[':root', ':root']` assertion
    // above, and — worse — would sit in the one file the NFR23 literal guard
    // exempts, where the ring could be written in literals. It lives in
    // design/focus.css instead, and tests/accessibility.test.ts guards it.
    const structural = withoutComments(tokensCss)
    expect(structural).not.toMatch(/outline/)
    expect(structural).not.toMatch(/:focus/)
  })
})

/**
 * A contract nothing loads is a contract nothing keeps. Without this, deleting
 * the import from the renderer entry leaves lint, typecheck, build and every
 * other test in this file green while the window ships with no tokens defined
 * at all — and the first sign would be a human opening the app.
 */
describe('the contract in force', () => {
  it('is loaded by the renderer entry, which the page actually runs', () => {
    expect(readFileSync(INDEX_HTML, 'utf8')).toContain('./ui/main.tsx')
    expect(readFileSync(ENTRY, 'utf8')).toMatch(/^import '\.\.\/design\/tokens\.css'$/m)
  })
})

const CLEAN_PROBE = `
.rail {
  flex: 0 0 var(--rail);
  border-left-style: solid;
  border-left-color: var(--line);
  background: var(--panel);
  border-radius: var(--radius-card);
  font: var(--fs-label) / var(--lh-base) var(--mono);
  color: var(--dim);
  padding: 0;
}
`

describe('the NFR23 literal guard', () => {
  it('passes a stylesheet that reaches every value through var()', () => {
    expect(literalsIn('probe.css', CLEAN_PROBE)).toEqual([])
  })

  it.each([
    { kind: 'hex colour', css: '.rail { background: #171b21 }', text: '#171b21' },
    {
      kind: 'colour function',
      css: '.turn { background: rgba(127,166,232,.12) }',
      text: 'rgba(127,166,232,.12)'
    },
    { kind: 'colour function', css: '.turn { color: hsl(210 50% 60%) }', text: 'hsl(210 50% 60%)' },
    { kind: 'dimension', css: '.rail { flex: 0 0 348px }', text: '348px' },
    { kind: 'dimension', css: '.sub { max-width: 72ch }', text: '72ch' },
    { kind: 'dimension', css: '.win { height: 80vh }', text: '80vh' },
    { kind: 'dimension', css: '.tile { padding: 1.5rem }', text: '1.5rem' },
    { kind: 'dimension', css: '.tile { width: 50% }', text: '50%' },
    { kind: 'dimension', css: '.turn { margin-left: -4px }', text: '-4px' },
    { kind: 'radius', css: '.dot { border-radius: 50% }', text: 'border-radius: 50%' },
    {
      kind: 'radius',
      css: '.card { border-top-left-radius: 6px }',
      text: 'border-top-left-radius: 6px'
    },
    {
      kind: 'radius',
      css: '.card { border-radius: 4px var(--r) }',
      text: 'border-radius: 4px var(--r)'
    },
    {
      kind: 'font stack',
      css: '.path { font-family: ui-monospace, Menlo, monospace }',
      text: 'font-family: ui-monospace, Menlo, monospace'
    },
    {
      kind: 'font stack',
      css: '.path { font-family: var(--mono), Menlo }',
      text: 'font-family: var(--mono), Menlo'
    }
  ])('fails a $kind and names the file and the literal', ({ kind, css, text }) => {
    const found = literalsIn('src/renderer/ui/shell.css', css)

    // Asserted before anything is read off it: a rule that has stopped matching
    // its own probe must name the dead rule, not throw on an undefined element.
    expect(found.length, `no literal found for ${kind}`).toBeGreaterThan(0)

    // A dimension inside a radius declaration is legitimately both, so the
    // expected finding is asserted by presence rather than by position — which
    // rule fires first is an ordering detail, not the contract.
    expect(found).toContainEqual({
      file: 'src/renderer/ui/shell.css',
      line: 1,
      kind,
      text
    })
  })

  it('ignores literals that sit in a comment', () => {
    expect(literalsIn('probe.css', '/* was #171b21 at 348px */\n.rail { color: var(--dim) }')).toEqual(
      []
    )
  })

  it('lets an @media condition spell its breakpoint, and only the condition', () => {
    expect(
      literalsIn('probe.css', '@media (max-width: 1000px) { .rail { width: var(--rail) } }')
    ).toEqual([])
    expect(
      literalsIn('probe.css', '@media (max-width: 1000px) { .rail { width: 348px } }').map(
        ({ kind, text }) => `${kind} ${text}`
      )
    ).toEqual(['dimension 348px'])
    expect(
      literalsIn('probe.css', '@media (max-width: 1000px) {\n.rail { color: #171b21 }\n}')
    ).toEqual([{ file: 'probe.css', line: 2, kind: 'hex colour', text: '#171b21' }])
  })

  it('pins the breakpoints: every @media under src/renderer/ is 1180, 1000, or the reduced-motion block', () => {
    expect(allMediaConditions()).toEqual(
      [
        'src/renderer/design/tokens.css: (prefers-reduced-motion:reduce)',
        'src/renderer/ui/shell/shell.css: (max-width:1000px)',
        'src/renderer/ui/shell/shell.css: (max-width:1180px)'
      ].sort()
    )
    expect(tokensCss).not.toMatch(/@media[^{]*width/)
  })

  it('sees a third media condition of any kind, so the pin above cannot be dodged', () => {
    expect(mediaConditionsIn('@media (max-height: 600px) { .a { color: var(--dim) } }')).toEqual([
      '(max-height:600px)'
    ])
    expect(mediaConditionsIn('@media (orientation: portrait) { .a { color: var(--dim) } }')).toEqual([
      '(orientation:portrait)'
    ])
    expect(mediaConditionsIn('/* @media (max-width: 1px) */ .a { color: var(--dim) }')).toEqual([])
  })

  it('exempts tokens.css and nothing else', () => {
    // The exemption itself, not the emptiness of the tree: Story 1.9's first
    // compliant stylesheet must not redden this test, or the repair someone
    // reaches for is to edit the guard's own wiring check.
    const sheets = allStylesheets()

    expect(sheets).toContain('src/renderer/design/tokens.css')
    expect(guardedStylesheets()).not.toContain('src/renderer/design/tokens.css')
    expect(guardedStylesheets()).toEqual(
      sheets.filter((path) => path !== 'src/renderer/design/tokens.css')
    )
    // And it is exempt for a reason: tokens.css is full of the literals every
    // other stylesheet is forbidden.
    expect(literalsIn('src/renderer/design/tokens.css', tokensCss).length).toBeGreaterThan(0)
  })

  it('finds no literal in any stylesheet it governs', () => {
    const offences = guardedStylesheets().flatMap((path) =>
      literalsIn(path, readFileSync(join(ROOT, path), 'utf8'))
    )

    expect(
      offences.map(({ file, line, kind, text }) => `${file}:${line} ${kind} ${text}`)
    ).toEqual([])
  })
})

/**
 * NFR23's other half. The guard above governs `.css`, which is only the whole
 * story while every surface is written as a stylesheet — and Story 1.3 recorded
 * that as an open dependency on however Story 1.9 chooses to carry style. A
 * component that writes `style={{ color: '#7fa6e8' }}` restates the contract
 * just as surely as a stylesheet would, and nothing saw it.
 *
 * Scoped to the inside of `style` props on purpose: a blanket scan of `.tsx`
 * would fire on Story 1.6's portrait palettes, which are literal hex in source
 * by design. Vacuous against the tree today — no component carries an inline
 * style — so the probes are what prove it is wired.
 */
const CLEAN_COMPONENT = `
export function Rail(): JSX.Element {
  return <div style={{ flexBasis: 'var(--rail)', background: 'var(--panel)' }} />
}
`

const PORTRAIT_COMPONENT = `
// Curated palettes are literal hex in source by design — see Story 1.6.
const SKIN = '#c98d6b'
const SIZES = [32, 36, 38, 44]
export function Portrait(): JSX.Element {
  return <svg viewBox="0 0 100 100"><circle fill={SKIN} r="40" /></svg>
}
`

describe('the NFR23 literal guard, inside a component', () => {
  it('passes a style prop that reaches every value through var()', () => {
    expect(inlineStyleLiteralsIn('probe.tsx', CLEAN_COMPONENT)).toEqual([])
  })

  it.each([
    ['hex colour', `<div style={{ color: '#7fa6e8' }} />`],
    ['colour function', `<div style={{ background: 'rgba(127,166,232,.12)' }} />`],
    ['dimension', `<div style={{ flexBasis: '348px' }} />`],
    ['dimension', `<div style={{ outline: '2px solid red' }} />`],
    ['dimension', `<div style={{ marginRight: '-5px' }} />`],
    // The JSX spellings. `font-family:` and `border-radius:` are the forms a
    // stylesheet uses; a style prop can only ever say `fontFamily` and
    // `borderRadius`, so the hyphenated rules alone left the component side
    // of NFR23 undetectable.
    ['font stack', `<div style={{ fontFamily: 'Menlo, monospace' }} />`],
    ['font stack', `<div style={{ fontFamily: "SF Mono" }} />`],
    ['font stack', `<div style={{ font: 'var(--mono)', fontFamily: 'Menlo' }} />`],
    // Per value, not per declaration: one reference does not excuse the
    // literal sitting next to it.
    ['font stack', `<div style={{ fontFamily: 'var(--mono), Menlo' }} />`],
    ['radius', `<div style={{ borderRadius: '10px' }} />`],
    ['radius', `<div style={{ borderRadius: 4 }} />`],
    ['radius', `<div style={{ borderTopLeftRadius: '50%' }} />`],
    ['radius', `<div style={{ borderBottomRightRadius: 'var(--r) 3px' }} />`]
  ])('catches a literal %s restated in a style prop', (kind, probe) => {
    const found = inlineStyleLiteralsIn('probe.tsx', probe)

    expect(found.length, probe).toBeGreaterThan(0)
    expect(found.map((literal) => literal.kind)).toContain(kind)
  })

  it.each([
    [`<div style={{ fontFamily: 'var(--mono)' }} />`],
    [`<div style={{ borderRadius: 'var(--r-card)' }} />`],
    [`<div style={{ borderTopLeftRadius: 'var(--r)' }} />`],
    // The neighbouring reference must not be dragged into the font stack's
    // value and read back as a literal: a greedy match to the end of the
    // block would report this compliant prop.
    [`<div style={{ fontFamily: 'var(--mono)', borderRadius: 'var(--r)' }} />`],
    [`<div style={{ font: 'var(--mono)', color: 'var(--ink)' }} />`]
  ])('stays silent for %s, which reaches every value through var()', (probe) => {
    expect(inlineStyleLiteralsIn('probe.tsx', probe)).toEqual([])
  })

  it('leaves literals outside a style prop alone, which the portraits need', () => {
    // A blanket .tsx scan would make Story 1.6 unbuildable. This must stay
    // empty for as long as that remains true.
    expect(inlineStyleLiteralsIn('portrait.tsx', PORTRAIT_COMPONENT)).toEqual([])
  })

  it('reports the line the style prop sits on, not the line of its block', () => {
    const found = inlineStyleLiteralsIn('probe.tsx', `\n\n\n<div style={{ width: '10px' }} />`)

    expect(found[0]?.line).toBe(4)
  })

  it('counts the lines a // comment sits on, so an offence is not reported early', () => {
    // `^\s*//` consumes the newline that ends the *previous* line, so every
    // offence below a comment that follows a blank line was reported one line
    // too high — and a guard that names the wrong line sends the reader to
    // innocent code.
    const probe = ['const a = 1', '', '// why this is here', `<div style={{ width: '10px' }} />`].join(
      '\n'
    )

    expect(inlineStyleLiteralsIn('probe.tsx', probe)[0]?.line).toBe(4)
  })

  it('finds no inline-style literal in any component today', () => {
    const offences = componentsUnder().flatMap((path) =>
      inlineStyleLiteralsIn(path, readFileSync(join(ROOT, path), 'utf8'))
    )

    expect(offences.map((literal) => `${literal.file}:${literal.line} ${literal.text}`)).toEqual([])
  })

  it('governs the components that exist, so the sweep is not looking at nothing', () => {
    expect(componentsUnder()).toContain('src/renderer/ui/app.tsx')
  })
})

/**
 * The two sweeps share one list of rules and disagree about it by design: the
 * stylesheet sweep runs all of `LITERAL_RULES`, the inline sweep swaps the two
 * declaration-shaped rules for their camelCase dialect. `DECLARATION_KINDS` is
 * what performs that swap, and it does so by matching `kind` strings — in two
 * places, once to select the value rules and once to decide which rules get the
 * per-value `var()` exemption.
 *
 * So renaming a `kind` is not cosmetic. A renamed declaration rule falls into
 * the value set, where it is applied to inline blocks it was never written for
 * *and* loses its exemption, so `border-radius: var(--r)` starts reporting as a
 * literal. Nothing about that is visible at the call site, and both sweeps stay
 * green on the tree as it is today.
 */
describe('the guard rule sets', () => {
  it('names only kinds that exist, so a rename cannot leave the set pointing at nothing', () => {
    for (const kind of RULE_KINDS.declaration) {
      expect(RULE_KINDS.literal, `DECLARATION_KINDS names "${kind}"`).toContain(kind)
    }
  })

  it('partitions the rules: every rule is a value rule or a declaration rule, never both', () => {
    expect([...RULE_KINDS.value, ...RULE_KINDS.declaration].sort()).toEqual(
      [...RULE_KINDS.literal].sort()
    )
    expect(RULE_KINDS.value.filter((kind) => RULE_KINDS.declaration.includes(kind))).toEqual([])
  })

  it('gives every declaration-shaped rule a camelCase counterpart, and no others', () => {
    // A declaration rule with no JSX dialect leaves that spelling unguarded
    // inside a style prop; a JSX rule whose kind is not declaration-shaped
    // loses the var() exemption and reports compliant values as literals.
    expect([...RULE_KINDS.jsx].sort()).toEqual([...RULE_KINDS.declaration].sort())
  })

  it('is not vacuous: both sets carry rules', () => {
    expect(RULE_KINDS.value.length).toBeGreaterThan(0)
    expect(RULE_KINDS.declaration.length).toBeGreaterThan(0)
  })
})

describe('the sysline (Story 2.9)', () => {
  const sysline = componentBlock('sysline')
  const css = withoutComments(readFileSync(join(ROOT, 'src/renderer/ui/chat/sysline.css'), 'utf8'))

  it('takes its margin from DESIGN.md components.sysline.margin, as one token of its own', () => {
    expect(sysline['margin'], 'DESIGN.md components.sysline.margin').toBe('14px 2px 10px')
    expect(tokens.get('--sysline-margin')).toBe(sysline['margin'])
    // The ladder keeps its ten rungs: the 2px inset is on none of them.
    expect(namesMatching('--space-')).toHaveLength(10)
  })

  it('is mono at the label size, centred with a rule either side, in the faint ink and its own margin', () => {
    expect(sysline['type']).toContain('label')
    expect(css).toMatch(/\.sysline\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/)
    expect(css).toMatch(/\.sysline\s*\{[^}]*font-family:\s*var\(--mono\)/)
    expect(css).toMatch(/\.sysline\s*\{[^}]*font-size:\s*var\(--fs-label\)/)
    expect(css).toMatch(/\.sysline\s*\{[^}]*color:\s*var\(--faint\)/)
    expect(css).toMatch(/\.sysline\s*\{[^}]*margin:\s*var\(--sysline-margin\)/)
    expect(css).toMatch(
      /\.sysline::before,\s*\.sysline::after\s*\{[^}]*height:\s*var\(--rule-width\)[^}]*background:\s*var\(--line\)/
    )
  })

  it('has no ground, border, shadow, radius, animation or transition, and is not a .turn', () => {
    expect(css).not.toMatch(/\bbackground(?:-color)?:\s*var\(--(?!line\b)/)
    expect(css).not.toMatch(/box-shadow|border|radius|animation|transition|opacity|\.turn\b/)
  })
})

describe('the decision block (Story 2.10)', () => {
  const css = withoutComments(
    readFileSync(join(ROOT, 'src/renderer/ui/chat/decision-block.css'), 'utf8')
  )
  const design = readFileSync(DESIGN, 'utf8')
  const section = design.slice(
    design.indexOf('### Decision option'),
    design.indexOf('### Focus')
  )

  it('takes its padding from DESIGN.md’s Decision option, as one token of its own', () => {
    expect(section, 'DESIGN.md ### Decision option').toContain('`9px 11px`')
    expect(tokens.get('--decision-padding')).toBe('9px 11px')
    expect(css).toMatch(/\.decision\s*\{[^}]*padding:\s*var\(--decision-padding\)/)
    // The ladder keeps its ten rungs.
    expect(namesMatching('--space-')).toHaveLength(10)
  })

  it('is a panel-2 block in the base radius with a 1px line, its options stacked at the sm rung', () => {
    expect(section).toContain('`panel-2` ground, 1px `line`')
    expect(css).toMatch(/\.decision\s*\{[^}]*background:\s*var\(--panel-2\)/)
    expect(css).toMatch(/\.decision\s*\{[^}]*border:\s*var\(--rule-width\) solid var\(--line\)/)
    expect(css).toMatch(/\.decision\s*\{[^}]*border-radius:\s*var\(--r\)/)
    expect(css).toMatch(/\.decision\s*\{[^}]*flex-direction:\s*column[^}]*gap:\s*var\(--space-sm\)/)
    expect(tokens.get('--space-sm')).toBe(designValue('spacing', 'sm'))
  })

  it('sets the title at the name size, strong, in text-strong, and the options at body-ui over the tight line-height', () => {
    expect(css).toMatch(
      /\.decision-title\s*\{[^}]*font-size:\s*var\(--fs-name\)[^}]*font-weight:\s*var\(--weight-strong\)[^}]*color:\s*var\(--text-strong\)/
    )
    expect(css).toMatch(
      /\.decision-option\s*\{[^}]*font-size:\s*var\(--fs-body-ui\)[^}]*line-height:\s*var\(--lh-tight\)/
    )
    expect(tokens.get('--lh-tight')).toBe('1.45')
  })

  it('draws the key as label mono in accent on accent-bg, 1px accent-border, chip radius: the only accent use', () => {
    expect(css).toMatch(
      /\.decision-key\s*\{[^}]*border:\s*var\(--rule-width\) solid var\(--accent-border\)[^}]*border-radius:\s*var\(--radius-chip\)[^}]*background:\s*var\(--accent-bg\)[^}]*color:\s*var\(--accent\)[^}]*font-family:\s*var\(--mono\)[^}]*font-size:\s*var\(--fs-label\)/
    )
    expect([...css.matchAll(/var\(--accent(?:-bg|-border)?\)/g)]).toHaveLength(3)
    expect(css.match(/--accent\b(?!-)/g)).toHaveLength(1)
  })

  it('is governed by the literal guard and has no ring, hover, motion or literal of its own', () => {
    const path = 'src/renderer/ui/chat/decision-block.css'
    expect(guardedStylesheets()).toContain(path)
    expect(literalsIn(path, readFileSync(join(ROOT, path), 'utf8'))).toEqual([])
    expect(css).not.toMatch(/outline|:focus|:hover|animation|transition|box-shadow|opacity/)
  })
})
