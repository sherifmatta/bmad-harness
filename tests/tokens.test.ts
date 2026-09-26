import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
const RENDERER = join(ROOT, 'src/renderer')
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

/** CSS comments blanked out, line structure preserved, so line numbers survive. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
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

  it('does not carry the superseded party-panel width', () => {
    // UX-DR8: the Room-only ruling resized the panel, and the wider literal
    // must not be implemented — not as a token, not as a comment, not anywhere.
    // Scoped to the dimension: a future `#288f4a` or `.288` alpha is not the
    // superseded width and must not redden this test.
    expect(withoutComments(tokensCss)).not.toMatch(/\b288px\b/)
    expect(tokens.get('--party-side')).toBe('240px')
  })

  it('carries no component dimension', () => {
    for (const name of ['--status-dot', '--tile', '--portrait']) {
      expect(namesMatching(name)).toEqual([])
    }
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
    expect(body.trim()).toBe('*{animation:none !important;transition:none !important}')
    expect(body).not.toContain(':not(')
  })
})

describe('the theme decision', () => {
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

  it('leaves the focus ring to Story 1.4', () => {
    expect(withoutComments(tokensCss)).not.toMatch(/focus|outline/)
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

/**
 * NFR23's enforcement arm. Scoped to stylesheets on purpose: scanning `.tsx`
 * would fire on Story 1.6's portrait palettes, which are literal hex in source
 * by design. Every `.css` under `src/renderer/` except `design/tokens.css` —
 * the one file entitled to literals — must reach its values through `var()`.
 */
const LITERAL_RULES = [
  { kind: 'hex colour', pattern: /#[0-9a-fA-F]{3,8}\b/g },
  // Eleven of tokens.css's own colours are written as rgba(), so this is the
  // spelling a component is most likely to paste — the guard missed it entirely
  // while claiming to detect literal colour.
  {
    kind: 'colour function',
    pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?![^)]*var\()[^)]*\)/g
  },
  // Every unit the design system could be restated in, and negatives: the
  // inset rules DESIGN.md names are written `inset 0 -2px 0 …`, so a lookbehind
  // that excluded a leading `-` excluded exactly the values most at risk.
  {
    kind: 'dimension',
    pattern: /(?<![\w.#])-?\d*\.?\d+(?:px|ch|rem|em|pt|vh|vw|vmin|vmax|%)(?![\w-])/g
  },
  {
    kind: 'font stack',
    pattern: /font(?:-family)?\s*:\s*[^;}]*[a-zA-Z][^;}]*/g
  },
  // Longhand corners match neither the shorthand rule nor the dimension rule
  // when the value is a percentage of a keyword.
  {
    kind: 'radius',
    pattern: /border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*[^;}]+/g
  }
]

/** A declaration's literal half, with every `var(…)` reference removed. */
function withoutReferences(value: string): string {
  return value.replace(/var\(\s*--[\w-]+\s*(?:,[^()]*(?:\([^()]*\))?)?\)/g, ' ')
}

type Literal = { file: string; line: number; kind: string; text: string }

export function literalsIn(file: string, css: string): Literal[] {
  const source = withoutComments(css)
  const found: Literal[] = []

  for (const { kind, pattern } of LITERAL_RULES) {
    for (const match of source.matchAll(pattern)) {
      // The exemption is per value, not per declaration: `font-family:
      // var(--mono), Menlo` and `border-radius: 4px var(--r)` each carry a
      // literal that a whole-declaration lookahead waved through.
      const remainder = withoutReferences(match[0])
      const carriesLiteral =
        kind === 'font stack' || kind === 'radius'
          ? /[a-zA-Z0-9#]/.test(remainder.replace(/^[^:]*:/, ''))
          : true
      if (!carriesLiteral) {
        continue
      }

      found.push({
        file,
        line: source.slice(0, match.index).split('\n').length,
        kind,
        text: match[0].trim()
      })
    }
  }

  return found.sort((a, b) => a.line - b.line)
}

function stylesheetsUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return stylesheetsUnder(path)
    }
    return entry.name.endsWith('.css') ? [path] : []
  })
}

/** Every stylesheet the guard governs — tokens.css is the one exemption. */
export function guardedStylesheets(): string[] {
  return stylesheetsUnder(RENDERER)
    .filter((path) => path !== TOKENS)
    .map((path) => relative(ROOT, path))
}

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

  it('exempts tokens.css and nothing else', () => {
    // The exemption itself, not the emptiness of the tree: Story 1.9's first
    // compliant stylesheet must not redden this test, or the repair someone
    // reaches for is to edit the guard's own wiring check.
    const sheets = stylesheetsUnder(RENDERER).map((path) => relative(ROOT, path))

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
