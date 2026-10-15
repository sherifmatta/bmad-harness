import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The NFR23 guard is imported rather than re-derived, for the reason the
// accessibility suite records: a second copy of those regular expressions is a
// second definition of "literal", and the two would drift.
import {
  componentsUnder,
  guardedStylesheets,
  inlineStyleLiteralsIn,
  literalsIn,
  withoutComments
} from './literal-guard'

/**
 * The initials disc's contract, and the portrait's absence, asserted by command.
 *
 * Every person is an initials disc (Story 7.7, FR136, UX-DR55) and the portrait
 * is gone from the code, the tokens and the contract. What the discs actually
 * draw on each surface is `src/renderer/ui/persona/discs.dom.test.tsx`'s: it
 * mounts them, which needs `jsx`, which `tsconfig.node.json` does not set.
 * What is here is what no rendered string can express: the stylesheet's
 * guards, the couplings that read DESIGN.md at run time, and the source-tree
 * prohibition on any portrait or per-person image.
 */

const ROOT = resolve(import.meta.dirname, '..')
const PERSONA = 'src/renderer/ui/persona/'
const INITIALS_TSX = `${PERSONA}initials.tsx`
const INITIALS_CSS = `${PERSONA}initials.css`
const TOKENS_CSS = 'src/renderer/design/tokens.css'
const DESIGN = join(
  ROOT,
  '_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
)

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

/** Every source file under `src/renderer/ui/persona/`, repository-relative; the tests that sit beside them are not source. */
function personaFiles(): string[] {
  const dir = join(ROOT, PERSONA)
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !/\.test\.tsx?$/.test(entry.name))
    .map((entry) => relative(ROOT, join(dir, entry.name)))
}

/** Every token's declared value, so a declaration can be compared resolved. */
const tokenValues = new Map(
  [...withoutComments(read(TOKENS_CSS)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
    ([, name, value]) => [name, value.trim()]
  )
)

/** A stylesheet declaration with every `var()` replaced by what it resolves to. */
function resolvedValue(declaration: string): string {
  return declaration
    .replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name: string) => tokenValues.get(name) ?? name)
    .replace(/\s+/g, ' ')
    .trim()
}

/** The same value as DESIGN.md states it, with its `{colors.x}` references resolved. */
function contractValue(stated: string): string {
  return stated
    .replace(/\{colors\.([\w-]+)\}/g, (_, name: string) => tokenValues.get(`--${name}`) ?? name)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A nested `components:` sub-map out of DESIGN.md's frontmatter, read at run
 * time.
 *
 * A second reader of the same block exists in `tests/tokens.test.ts`, and it is
 * copied rather than imported for the reason `tests/literal-guard.ts` states in
 * its own header: Vitest re-registers an imported test module's suites in the
 * importing file, so importing it from there would run the whole tokens suite
 * twice and inflate the count. It is eleven lines of frontmatter reading, and
 * both copies fail together if the block moves — which is the property that
 * matters.
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
      value
        .replace(/\s+#(?![0-9a-fA-F]{3,8}\b).*$/, '')
        .trim()
        .replace(/^'(.*)'$/, '$1')
    ])
  )
}

// ---------------------------------------------------------------------------
// The guards no rendered string can express.
// ---------------------------------------------------------------------------

describe('the initials stylesheet', () => {
  const sheets = [INITIALS_CSS]
  const initialsBlock = componentBlock('initials')

  it('is swept by the NFR23 guard', () => {
    for (const sheet of sheets) {
      expect(guardedStylesheets(), sheet).toContain(sheet)
    }
  })

  it('reports no literal under the imported guard', () => {
    for (const sheet of sheets) {
      expect(
        literalsIn(sheet, read(sheet)).map(({ line, kind, text }) => `${line} ${kind} ${text}`),
        sheet
      ).toEqual([])
    }
  })

  it('spend a var() for every value that carries a design decision', () => {
    // Stronger than the guard, which only rejects the literals it knows how to
    // spell. What is left once the references are removed must come from a
    // closed list of things that carry no design decision at all.
    const carriesNothing = new Set([
      '0',
      '1',
      'absolute',
      'auto',
      'block',
      'border-box',
      'center',
      'flex',
      'flex-end',
      'hidden',
      'inline-block',
      'inline-flex',
      'left',
      'middle',
      'nowrap',
      'relative',
      'solid',
      'visible'
    ])

    for (const sheet of sheets) {
      const leftovers = [...withoutComments(read(sheet)).matchAll(/\{([^{}]*)\}/g)]
        .flatMap(([, block]) => [...block.matchAll(/[a-z-]+\s*:\s*([^;]+);/g)])
        .flatMap(([, value]) =>
          value
            .replace(/var\(\s*--[\w-]+\s*\)/g, ' ')
            .split(/\s+/)
            .filter((token) => token !== '')
        )
        .filter((token) => !carriesNothing.has(token))

      expect(leftovers, sheet).toEqual([])
    }
  })

  it('spend tokens that actually exist', () => {
    // The leftover check above strips `var(--anything)` name-agnostically, so
    // a typo like `var(--panel-two)` passes it while the declaration is simply
    // invalid in the browser and the surface ships unstyled.
    const declared = new Set(
      [...withoutComments(read(TOKENS_CSS)).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name)
    )

    for (const sheet of sheets) {
      for (const [, name] of withoutComments(read(sheet)).matchAll(/var\(\s*(--[\w-]+)/g)) {
        expect(declared.has(name), `${sheet} references ${name}`).toBe(true)
      }
    }
  })

  it('rounds the disc with the radius DESIGN.md gives it', () => {
    // `{rounded.full}` resolves to `--radius-full`: the perfect circle the
    // system reserves for things standing for a person or a light.
    expect(initialsBlock['radius']).toBe('{rounded.full}')
    expect(read(INITIALS_CSS)).toContain('border-radius: var(--radius-full)')
  })

  it('carries no media query: NFR27 allows no third breakpoint', () => {
    for (const sheet of sheets) {
      expect(read(sheet), sheet).not.toContain('@media')
    }
  })

  it('add no third z-index, no motion and no decorative shadow', () => {
    // UX-DR10 fixes the product at two z-indexes; the motion inventory is
    // closed at five declarations bound to real events, and a tooltip fading
    // in is in neither list. The mockup reaches for all three and the spine
    // wins.
    for (const sheet of sheets) {
      const structural = withoutComments(read(sheet))

      expect(structural, sheet).not.toMatch(/z-index/)
      expect(structural, sheet).not.toMatch(/transition/)
      expect(structural, sheet).not.toMatch(/animation/)
      expect(structural, sheet).not.toMatch(/transform/)
    }
  })

  it('draws exactly one shadow, and it is the cut-out ring DESIGN.md states', () => {
    // One of the three jobs a shadow is allowed: an edge drawn with a shadow.
    // The mockup's drop shadow under the reveal is not one of them.
    //
    // Compared with `components.initials.stackRing` resolved at run time
    // rather than with the declaration spelled out here: a transcription can
    // only be checked against the thing it was transcribed from, and a
    // retuned ring would otherwise leave the code green and wrong.
    const shadows = [...withoutComments(read(INITIALS_CSS)).matchAll(/box-shadow:\s*([^;]+);/g)]

    expect(shadows).toHaveLength(1)
    expect(resolvedValue(shadows[0][1])).toBe(contractValue(initialsBlock['stackRing']))
  })

  it('draws the disc’s edge at the width and colour DESIGN.md states', () => {
    // Scoped to the disc's own rule: the reveal's card carries a hairline too,
    // and comparing the wrong one would pass for the wrong reason.
    const disc = withoutComments(read(INITIALS_CSS)).match(/\.initials \{([^}]*)\}/)
    expect(disc, 'initials.css must carry a `.initials` rule').not.toBeNull()

    const border = disc![1].match(/border:\s*([^;]+);/)
    expect(border, 'the disc must draw a border').not.toBeNull()
    expect(resolvedValue(border![1])).toBe(contractValue(initialsBlock['border']))
  })

  it('spends each promoted token in the property it was promoted for', () => {
    // The values are coupled to DESIGN.md in tests/tokens.test.ts. What that
    // cannot see is whether these files spend them *here* — swapping
    // `margin-right: var(--initials-overlap)` for `var(--space-xs)` inverts
    // the stacked overlap with every other check still green.
    const initials = withoutComments(read(INITIALS_CSS))

    expect(initials).toContain('width: var(--initials-size)')
    expect(initials).toContain('height: var(--initials-size)')
    expect(initials).toContain('width: var(--initials-size-thread)')
    expect(initials).toContain('height: var(--initials-size-thread)')
    expect(initials).toContain('width: var(--initials-size-header)')
    expect(initials).toContain('height: var(--initials-size-header)')
    expect(initials).toContain('font-size: var(--fs-micro)')
    expect(initials).toContain('font-size: var(--fs-label)')
    expect(initials).toContain('margin-right: var(--initials-overlap)')
  })

  it('draws the disc at the size the contract fixes, border included', () => {
    // `design/page.css` sets `box-sizing: border-box` on everything, but the
    // disc states it for itself so it does not depend on a page's reset: the
    // default adds the border to the size, which would paint a disc wider than
    // `components.initials.size` and leave the overlap short of the disc
    // behind it.
    expect(withoutComments(read(INITIALS_CSS))).toMatch(
      /\.initials \{[^}]*box-sizing:\s*border-box/
    )
  })

  it('states no focus treatment of its own, and opts into the shared one', () => {
    // The ring is `design/focus.css`'s, once, for every primitive. The stacked
    // case differs only by its offset, which that file already ships.
    for (const sheet of sheets) {
      expect(withoutComments(read(sheet)).match(/:focus(?!-visible)/g), sheet).toBeNull()
    }
    expect(read(INITIALS_TSX)).toContain('focus-stacked')
    expect(read('src/renderer/design/focus.css')).toContain('.focus-stacked')
  })
})

describe('the stacking raise, obtained without a third z-index', () => {
  const structural = withoutComments(read(INITIALS_CSS))

  it('positions the disc only while it is hovered or focused', () => {
    // `position: relative` with no offsets moves nothing, but it promotes the
    // element into the painting step that runs after every non-positioned
    // inline sibling — so a disc positioned only while hovered or focused
    // paints above its neighbours on both sides, regardless of source order,
    // and takes its reveal with it. Positioning every disc would hand the
    // paint order back to source order and the last disc would win.
    expect(structural.match(/position:\s*relative/g)).toHaveLength(1)
    expect(structural).toMatch(
      /\.initials:hover,\s*\n\s*\.initials:focus-visible\s*\{\s*\n\s*position:\s*relative;?\s*\n\s*\}/
    )
  })

  it('never writes :hover and :focus-visible apart, so the reveal has parity', () => {
    // A hover-only tooltip is the one affordance that fails completely without
    // a mouse. Counting them makes the parity mechanical: the moment one
    // selector gains a rule the other has not, these two numbers differ.
    const hover = structural.match(/:hover/g) ?? []
    const focus = structural.match(/:focus-visible/g) ?? []

    expect(hover).toHaveLength(2)
    expect(focus.length).toBe(hover.length)
  })

  it('hides the reveal with visibility as well as opacity', () => {
    // Opacity alone leaves the reveal in the accessibility tree and in the tab
    // order — present, readable by a screen reader, and invisible.
    expect(structural).toMatch(/visibility:\s*hidden/)
    expect(structural).toMatch(/opacity:\s*0/)
    expect(structural).toMatch(/visibility:\s*visible/)
  })
})

describe('the persona directory', () => {
  it('never names the config glyph, so it can never be drawn as a face', () => {
    // FR80: it is never rendered as a portrait, at any size, as a fallback or
    // otherwise. Swept whole-file rather than over identifiers, because a
    // comment proposing it as a fallback is how the next story would start.
    const named = personaFiles().filter((path) => /icon/i.test(read(path)))

    expect(named).toEqual([])
  })

  it('does not carry the collision surface in its source either', () => {
    // The portrait's retirement left no drawn markup in this directory, and
    // this keeps it so: nothing that could collide between two discs in one
    // document is declared here. A command in a document is run by nothing, so it is run here,
    // over every file in the directory, comments included.
    const collidable = [
      ['a definition block', /<defs/i],
      ['a paint server', /gradient/i],
      ['a clip', /clip-?path/i],
      ['a paint filter', /\bfilter\s*[:=]/i],
      ['a mask', /\bmask\s*[:=]/i],
      ['a reference out of the document', /url\(/i],
      ['a namespaced link', /xlink/i],
      ['an id attribute', /\bid\s*=/i]
    ] as const

    for (const [what, pattern] of collidable) {
      expect(personaFiles().filter((path) => pattern.test(read(path))), what).toEqual([])
    }
    // And the patterns are checked against what they claim to catch, so a rule
    // that has stopped matching cannot pass by matching nothing.
    const probes = [
      '<defs>',
      'linearGradient',
      'clip-path: circle()',
      'filter: blur(1px)',
      'mask="m"',
      'fill="url(#g)"',
      'xlink:href',
      'id="face"'
    ]
    for (const [at, probe] of probes.entries()) {
      expect(collidable[at][1].test(probe), probe).toBe(true)
    }
  })

  it('renders project text as React children and nothing else', () => {
    // A name and a title come from a project's own install and are untrusted
    // the moment they are rendered.
    for (const path of personaFiles()) {
      expect(read(path), path).not.toContain('dangerouslySetInnerHTML')
    }
  })

  it('is governed by the inline-style half of the NFR23 guard', () => {
    // A `style={{ }}` prop is swept like any other: the disc takes every colour
    // from the initials tokens and states none of its own.
    for (const path of [INITIALS_TSX]) {
      expect(componentsUnder(), path).toContain(path)
      expect(inlineStyleLiteralsIn(path, read(path)), path).toEqual([])
    }
  })

  it('imports its stylesheet from the component that needs it, and only there', () => {
    expect(read(INITIALS_TSX)).toMatch(/^import '\.\/initials\.css'$/m)
  })
})

// ---------------------------------------------------------------------------
// The mount the story's acceptance depends on.
// ---------------------------------------------------------------------------

describe('the discs in the running app', () => {
  // The discs are judged where they live, on the tiles and on every persona
  // turn in the thread.
  const app = read('src/renderer/ui/app.tsx')

  it('no longer mounts the preview scaffolding or spells a roster of its own', () => {
    expect(app).not.toContain('PREVIEW_')
    expect(app).not.toContain('function Preview(')
    expect(app).not.toMatch(/portrait\(|<Initials/)
    for (const agentId of [
      'bmad-agent-analyst',
      'bmad-agent-pm',
      'bmad-agent-ux-designer',
      'bmad-agent-architect',
      'bmad-agent-dev'
    ]) {
      // Quoted, because one curated id is a prefix of a derived one.
      expect(app, agentId).not.toContain(`'${agentId}'`)
    }
  })

  it('draws a persona’s initials disc on each of their turns, from the roster’s own agent, and no portrait', () => {
    const turn = read('src/renderer/ui/chat/turn.tsx')

    expect(turn).not.toMatch(/portrait\(|artParamsFor/)
    expect(turn.match(/<Initials \{\.\.\.agent\} size=\{26\} \/>/g)).toHaveLength(2)
    expect(turn).toMatch(/<Initials \{\.\.\.user\} size=\{26\} you \/>/)
    expect(read('src/renderer/ui/party/party-turn.tsx')).toContain('<Initials {...agent} size={26} />')
  })

  it('renders the install errors and the install failure, and no persona menu', () => {
    // Deleting either leaves every other test green, and the running app is
    // where a human confirms the team on screen is this project's. Story 1.14
    // removed the per-persona menu lines: rendered flat, they were a global
    // skills list.
    expect(app).toMatch(/snapshot\.errors\.map\([\s\S]*?<ErrorLine/)
    expect(app).toMatch(/installFailure !== null && <ErrorLine error=\{installFailure\}/)
    expect(app).not.toMatch(/snapshot\.menus/)
  })

  it('gates the room on roomState, showing Preflight when blocked', () => {
    // Story 1.8: an empty room reads as broken, not unconfigured. The shell and
    // the conversation may sit only under the `open` branch, so a project that
    // cannot open shows the named lines and nothing else.
    expect(app).toContain('roomState(')
    expect(app).toContain('<Preflight')
    expect(app).toContain("room === 'pending'")
    expect(app).toContain("room === 'blocked'")

    const gate = app.indexOf("if (room === 'blocked')")
    const open = app.indexOf('<Shell')
    const blockedBranch = app.slice(gate, app.indexOf('\n  }\n', gate))
    expect(gate).toBeGreaterThan(-1)
    expect(open).toBeGreaterThan(gate)
    expect(blockedBranch).toContain('<Preflight')
    for (const row of ['portrait(', '<Initials', '<Turns', '<Composer', 'snapshot?.agents']) {
      expect(blockedBranch, row).not.toContain(row)
    }
    expect(app).toContain('Story 1.8 gate: the room opens only when preflight passes')
  })
})

// ---------------------------------------------------------------------------
// Story 7.7: the portrait is gone, and nothing replaces it.
// ---------------------------------------------------------------------------

describe('the source tree under src/renderer draws no portrait and no image of a person', () => {
  // The prohibition is spelled with its own strings so the file that forbids a
  // thing is the one place the thing's name appears.
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        walk(path)
      } else if (/\.(ts|tsx|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        files.push(path)
      }
    }
  }
  walk('src/renderer')

  /** Source with block comments and whole-line comments removed, as the contract tests read it. */
  const code = (path: string): string => withoutComments(read(path)).replace(/^\s*\/\/.*$/gm, '')

  it('reads the whole renderer, so an empty list cannot pass', () => {
    expect(files).toContain('src/renderer/ui/persona/initials.tsx')
    expect(files.length).toBeGreaterThan(50)
  })

  it('holds no module named for a portrait or for the art parameters', () => {
    expect(files.filter((path) => /portrait|art-params/i.test(path))).toEqual([])
  })

  it('calls no portrait function, derives no art, and imports neither', () => {
    const offenders = files.filter((path) =>
      /portrait\(|artParamsFor|persona\/portrait|\.\/portrait['"]|art-params/.test(code(path))
    )
    expect(offenders).toEqual([])
  })

  it('names no portrait class in any stylesheet or element', () => {
    const offenders = files.filter((path) =>
      /(^|[^\w-])portrait(-face)?(?![\w-])|cast-portrait/.test(code(path))
    )
    expect(offenders).toEqual([])
  })

  it('draws no <svg> for a person: the only three are an open arrow, a file mark and a chevron', () => {
    const drawn = files.flatMap((path) =>
      [...code(path).matchAll(/<svg\b[^>]*className="([^"]+)"/g)].map(([, name]) => name)
    )
    const bare = files.filter((path) => /<svg\b(?![^>]*className=)/.test(code(path)))

    expect(bare).toEqual([])
    expect(drawn.sort()).toEqual(['file-icon', 'folder-chevron', 'welcome-open-icon'])
  })

  it('catches what it claims to catch', () => {
    const probes: [RegExp, string][] = [
      [/portrait\(|artParamsFor/, 'portrait(artParamsFor(id), 36)'],
      [/(^|[^\w-])portrait(-face)?(?![\w-])|cast-portrait/, '.cast-portrait { }'],
      [/(^|[^\w-])portrait(-face)?(?![\w-])|cast-portrait/, 'className="portrait"'],
      [/(^|[^\w-])portrait(-face)?(?![\w-])|cast-portrait/, '.portrait-face {'],
      [/<svg\b(?![^>]*className=)/, '<svg viewBox="0 0 100 100">']
    ]
    for (const [pattern, probe] of probes) {
      expect(pattern.test(probe), probe).toBe(true)
    }
  })
})
