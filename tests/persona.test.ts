import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CURATED_AGENT_IDS, artParamsFor, h32, shade } from '../src/renderer/ui/persona/art-params'
import type { ArtParams } from '../src/renderer/ui/persona/art-params'
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
 * The portrait's contract, asserted by command.
 *
 * What the faces actually draw is `src/renderer/ui/persona/persona.test.tsx`'s
 * — it renders them, which needs `jsx`, which `tsconfig.node.json` does not
 * set. What is here instead is everything that must survive a rewrite of the
 * component: the parameter module, which is pure and DOM-free and so belongs
 * in the node program; the couplings that read DESIGN.md at run time rather
 * than trusting a transcription; and the source-text guards that no rendered
 * string can express.
 */

const ROOT = resolve(import.meta.dirname, '..')
const PERSONA = 'src/renderer/ui/persona/'
const PORTRAIT_TSX = `${PERSONA}portrait.tsx`
const PORTRAIT_CSS = `${PERSONA}portrait.css`
const INITIALS_TSX = `${PERSONA}initials.tsx`
const INITIALS_CSS = `${PERSONA}initials.css`
const ART_PARAMS = `${PERSONA}art-params.ts`
const TOKENS_CSS = 'src/renderer/design/tokens.css'
const DESIGN = join(
  ROOT,
  '_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'
)
const MOCKUP = join(
  ROOT,
  '_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/mockups/portrait.html'
)

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

/** Every file under `src/renderer/ui/persona/`, repository-relative. */
function personaFiles(): string[] {
  const dir = join(ROOT, PERSONA)
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
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

/** A deterministic population of ids nobody curated, for the rate assertions. */
function derivedIds(count: number): string[] {
  return Array.from({ length: count }, (_, at) => `bmad-agent-${at}`)
}

/**
 * The approved generator's own derivation, taken out of `mockups/portrait.html`
 * and run.
 *
 * Every other assertion in this file restates the palettes and the rates the
 * implementation already holds, which checks the build against itself: a wrong
 * transcription copied identically into both would stay green. This is the one
 * that does not — the source of truth is executed, not paraphrased, so the two
 * can only agree by actually agreeing.
 *
 * The slice is `portrait.html:325-343`: the five palettes, `h32`, `pick` and
 * `artParamsFor`, which is a closed region with no reference to anything else
 * in the file.
 */
function mockupDerivation(): (agentId: string) => Record<string, unknown> {
  const html = readFileSync(MOCKUP, 'utf8')
  const from = html.indexOf('const SKINS=')
  const to = html.indexOf('document.getElementById("cmpRows")')

  expect(from, 'portrait.html must declare the palettes').toBeGreaterThan(-1)
  expect(to, 'portrait.html must end its generator before the render calls').toBeGreaterThan(from)

  const source = html.slice(from, to)
  for (const name of ['SKINS', 'HAIRS', 'EYES', 'FITS', 'STYLES', 'FRINGES', 'h32', 'pick']) {
    expect(source, `the slice must carry ${name}`).toContain(name)
  }

  return new Function(`${source}; return artParamsFor`)() as (
    agentId: string
  ) => Record<string, unknown>
}

/** The twelve ids the mockup's own derived grid is drawn for (`portrait.html:373`). */
function mockupDerivedIds(): string[] {
  const declared = readFileSync(MOCKUP, 'utf8').match(/const IDS\s*=\s*\[([^\]]*)\]/)

  expect(declared, 'portrait.html must declare the derived grid’s ids').not.toBeNull()
  return [...declared![1].matchAll(/"([^"]+)"/g)].map(([, agentId]) => agentId)
}

// ---------------------------------------------------------------------------
// FR78 — curated for the five, derived for everyone else.
// ---------------------------------------------------------------------------

describe('the curated five', () => {
  it('is keyed by agent id, and by the ids `_bmad/config.toml` actually installs', () => {
    // By id and never by display name, title or the glyph beside it: a name is
    // a label the roster can change, an id is what the install is.
    expect(CURATED_AGENT_IDS).toEqual([
      'bmad-agent-analyst',
      'bmad-agent-pm',
      'bmad-agent-ux-designer',
      'bmad-agent-architect',
      'bmad-agent-dev'
    ])

    const config = readFileSync(join(ROOT, '_bmad/config.toml'), 'utf8')
    for (const agentId of CURATED_AGENT_IDS) {
      expect(config, agentId).toContain(`[agents.${agentId}]`)
    }
  })

  it.each([
    ['bmad-agent-dev', { style: 'bun', fringe: 'sweep', glasses: 'round', eye: '#5c6b4a' }],
    ['bmad-agent-analyst', { style: 'long', fringe: 'sweep', glasses: 'rect', eye: '#6b4a2f' }],
    ['bmad-agent-pm', { style: 'short', fringe: 'straight', beard: 'full', eye: '#6b7a80' }],
    ['bmad-agent-architect', { style: 'receding', fringe: null, beard: 'close', eye: '#4a3325' }],
    ['bmad-agent-ux-designer', { style: 'curly', fringe: null, earrings: true, eye: '#3d2a1e' }]
  ])('gives %s its curated parameters verbatim', (agentId, expected) => {
    expect(artParamsFor(agentId)).toMatchObject(expected)
  })

  it('gives John the only crown override there is', () => {
    expect(artParamsFor('bmad-agent-pm').crown).toEqual({ cy: 33.5, rx: 18.6, ry: 17.6 })

    for (const agentId of CURATED_AGENT_IDS.filter((id) => id !== 'bmad-agent-pm')) {
      expect(artParamsFor(agentId).crown, agentId).toBeUndefined()
    }
    // And derivation never invents one: the override is a curated decision.
    expect(derivedIds(200).filter((id) => artParamsFor(id).crown !== undefined)).toEqual([])
  })

  it('hands out a copy, so one caller cannot edit every other caller’s face', () => {
    // `crown` is the test, not `hair`. A shallow spread copies the primitives
    // and shares the one nested object, so mutating a primitive passes against
    // exactly the aliasing this is here to catch.
    const mine = artParamsFor('bmad-agent-pm')
    mine.hair = '#000000'
    mine.crown!.cy = 0
    mine.crown!.rx = 0

    expect(artParamsFor('bmad-agent-pm').hair).toBe('#9ba3ab')
    expect(artParamsFor('bmad-agent-pm').crown).toEqual({ cy: 33.5, rx: 18.6, ry: 17.6 })
  })

  it('hands out a roster nobody can reorder', () => {
    expect(Object.isFrozen(CURATED_AGENT_IDS)).toBe(true)
  })
})

describe('derivation', () => {
  it('draws every field from the constrained palettes', () => {
    const skins = ['#f2d2b3', '#efc6a1', '#ebc09c', '#e7b68d', '#d9a074', '#bd7c4e', '#9c6138', '#7d4f30']
    const hairs = ['#1e1a17', '#241f1d', '#2c2521', '#3d2b1f', '#5a3a22', '#7d4a2b', '#8a6a45', '#9ba3ab']
    const eyes = ['#4a3325', '#5a4332', '#6b4a2f', '#3d2a1e', '#5c6b4a', '#4f6068', '#6b7a80', '#54453a']

    for (const agentId of derivedIds(400)) {
      const art = artParamsFor(agentId)

      expect(skins, agentId).toContain(art.skin)
      expect(hairs, agentId).toContain(art.hair)
      expect(eyes, agentId).toContain(art.eye)
      expect(['short', 'long', 'curly', 'bun', 'receding'], agentId).toContain(art.style)
      expect([null, 'straight', 'sweep'], agentId).toContain(art.fringe)
      expect([null, 'full', 'close'], agentId).toContain(art.beard)
      expect([null, 'rect', 'round'], agentId).toContain(art.glasses)
      expect(typeof art.earrings, agentId).toBe('boolean')
    }
  })

  it('is the same face for the same id, on every call', () => {
    // The requirement is across sessions and machines; what a test can reach
    // is that nothing but the id is an input, which is what repeated calls
    // over a large sample show.
    for (const agentId of derivedIds(500)) {
      expect(artParamsFor(agentId), agentId).toEqual(artParamsFor(agentId))
    }
  })

  it('is a different face for a different id', () => {
    // Not a collision check — there is none, by decision — but the derivation
    // would be useless if a salt collapsed the population onto one face.
    const faces = new Set(derivedIds(500).map((id) => JSON.stringify(artParamsFor(id))))

    expect(faces.size).toBeGreaterThan(400)
  })

  it('forces a receding hairline to have no fringe over it', () => {
    const receding = derivedIds(600).filter((id) => artParamsFor(id).style === 'receding')

    expect(receding.length).toBeGreaterThan(50)
    expect(receding.filter((id) => artParamsFor(id).fringe !== null)).toEqual([])
  })

  it('weights `short` at twice the rate of each other style', () => {
    // The mechanism is a six-entry list holding five styles, `short` twice.
    // Asserted through the distribution rather than by reading the list, so
    // that deduplicating the list — which looks like tidying — fails here.
    const ids = derivedIds(5000)
    const counted = new Map<string, number>()
    for (const agentId of ids) {
      const style = artParamsFor(agentId).style
      counted.set(style, (counted.get(style) ?? 0) + 1)
    }

    expect([...counted.keys()].sort()).toEqual(['bun', 'curly', 'long', 'receding', 'short'])
    // Three sampling standard deviations. Over 5000 draws the sd of a 1-in-6
    // rate is about .0053, so a band of .02 is wide enough that the assertion
    // is about the weighting rather than about this particular id set, and
    // narrow enough that a deduplicated list — which would halve `short` and
    // lift the other four to .2 — cannot fit inside it.
    expect(counted.get('short')! / ids.length).toBeGreaterThan(2 / 6 - 0.02)
    expect(counted.get('short')! / ids.length).toBeLessThan(2 / 6 + 0.02)
    for (const style of ['long', 'curly', 'bun', 'receding']) {
      expect(counted.get(style)! / ids.length, style).toBeGreaterThan(1 / 6 - 0.02)
      expect(counted.get(style)! / ids.length, style).toBeLessThan(1 / 6 + 0.02)
    }
  })

  it.each([
    ['beard', 0.32, (art: ArtParams) => art.beard !== null],
    ['glasses', 0.34, (art: ArtParams) => art.glasses !== null],
    ['earrings', 0.28, (art: ArtParams) => art.earrings]
  ])('fires %s at about its stated rate', (_name, rate, holds) => {
    const ids = derivedIds(5000)
    const fired = ids.filter((agentId) => holds(artParamsFor(agentId))).length

    // The band is three sampling standard deviations (about .0067 here), not
    // `toBeCloseTo(x, 2)`, whose ±.005 is *tighter* than the sampling noise:
    // that assertion held only because the id set is fixed, and changing its
    // size or its pattern would have reddened it for no behavioural reason.
    expect(Math.abs(fired / ids.length - rate)).toBeLessThan(0.02)
  })

  it('chooses between the two shapes of a feature independently of having it', () => {
    // The `k` salts. Without them, everyone with a beard would have the same
    // beard — the feature and its shape would be one draw.
    const ids = derivedIds(2000)
    const bearded = ids.map((id) => artParamsFor(id).beard).filter((beard) => beard !== null)
    const bespectacled = ids.map((id) => artParamsFor(id).glasses).filter((it) => it !== null)

    expect(new Set(bearded)).toEqual(new Set(['full', 'close']))
    expect(new Set(bespectacled)).toEqual(new Set(['rect', 'round']))
  })
})

describe('the transcription, checked against the generator it came from', () => {
  const fromMockup = mockupDerivation()

  it('matches the approved generator over the twelve ids of its own grid', () => {
    const ids = mockupDerivedIds()

    expect(ids).toHaveLength(12)
    for (const agentId of ids) {
      expect(artParamsFor(agentId), agentId).toEqual(fromMockup(agentId))
    }
  })

  it('matches it over a population wide enough to reach every palette entry', () => {
    // Twelve ids cannot touch all eight entries of five palettes. This is what
    // makes a single mistyped hex, or a palette in the wrong order, fail: a
    // transcription error in an entry no id reaches is an error no comparison
    // can see, so the coverage is asserted rather than assumed.
    const drawn = { skin: new Set(), hair: new Set(), eye: new Set(), shirt: new Set(), style: new Set() }

    for (const agentId of derivedIds(600)) {
      const ours = artParamsFor(agentId)

      expect(ours, agentId).toEqual(fromMockup(agentId))
      for (const field of Object.keys(drawn) as (keyof typeof drawn)[]) {
        drawn[field].add(ours[field])
      }
    }

    // Every entry of every palette, and every style the weighted list can
    // draw — `receding` is five of six because the sixth entry is `short`
    // repeated, which is the weighting itself.
    expect(drawn.skin.size, 'skins').toBe(8)
    expect(drawn.hair.size, 'hairs').toBe(8)
    expect(drawn.eye.size, 'eyes').toBe(8)
    expect(drawn.shirt.size, 'fits').toBe(8)
    expect(drawn.style.size, 'styles').toBe(5)
  })
})

// ---------------------------------------------------------------------------
// The two pure helpers the whole derivation rests on.
// ---------------------------------------------------------------------------

describe('the salted hash', () => {
  /** FNV-1a 32, written out here so `h32` is compared with the algorithm. */
  function fnv1a(text: string): number {
    let hash = 2166136261 >>> 0
    for (let at = 0; at < text.length; at += 1) {
      hash ^= text.charCodeAt(at)
      hash = Math.imul(hash, 16777619) >>> 0
    }
    return hash
  }

  it('is FNV-1a, checked against the published vectors', () => {
    // The reference is itself pinned, so a reference that has drifted cannot
    // wave `h32` through by agreeing with it.
    expect(fnv1a('')).toBe(2166136261)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
  })

  it('hashes the salt, a colon and the id, in that order', () => {
    for (const salt of ['skin', 'fit', 'style', 'hair', 'eye', 'fringe', 'ear']) {
      expect(h32('bmad-agent-qa', salt), salt).toBe(fnv1a(`${salt}:bmad-agent-qa`))
    }
  })

  it('stays an unsigned 32-bit value however long the id is', () => {
    for (const agentId of ['', 'a', 'bmad-agent-qa', 'x'.repeat(4096), '·— ✓']) {
      const hashed = h32(agentId, 'skin')

      expect(Number.isInteger(hashed)).toBe(true)
      expect(hashed).toBeGreaterThanOrEqual(0)
      expect(hashed).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('separates all eleven salts, so one id does not give eleven correlated draws', () => {
    // `beardk` and `glassk` are in the list because they are the whole reason
    // the shape of a feature is independent of having it: leaving them out
    // left the two salts the module claims to separate unchecked.
    const salts = [
      'skin',
      'fit',
      'style',
      'hair',
      'eye',
      'fringe',
      'beard',
      'beardk',
      'glass',
      'glassk',
      'ear'
    ]
    const drawn = new Set(salts.map((salt) => h32('bmad-agent-qa', salt)))

    expect(salts).toHaveLength(11)
    expect(drawn.size).toBe(11)
  })
})

describe('the tone shift', () => {
  it('lightens and darkens each channel by the amount given', () => {
    expect(shade('#102030', 16)).toBe('#203040')
    expect(shade('#102030', -16)).toBe('#001020')
  })

  it('clamps at both ends, per channel rather than on the result', () => {
    // Per channel is the point: a tone that saturates in one channel keeps its
    // hue in the other two instead of sliding toward grey.
    expect(shade('#ffffff', 40)).toBe('#ffffff')
    expect(shade('#000000', -40)).toBe('#000000')
    expect(shade('#ff0000', 40)).toBe('#ff2828')
    expect(shade('#00ff00', -300)).toBe('#000000')
  })

  it('always returns six hex digits, so a shifted tone is still a colour', () => {
    for (const agentId of derivedIds(200)) {
      const art = artParamsFor(agentId)

      for (const derived of [shade(art.hair, -20), shade(art.hair, 26), shade(art.skin, 20), shade(art.skin, -38)]) {
        expect(derived, agentId).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The couplings: DESIGN.md read at run time, never transcribed.
// ---------------------------------------------------------------------------

describe('the visual contract, read at run time', () => {
  const portraitBlock = componentBlock('portrait')
  const portraitSource = read(PORTRAIT_TSX)

  it('draws in the coordinate space DESIGN.md fixes', () => {
    expect(portraitBlock['viewBox'], 'DESIGN.md components.portrait.viewBox').toBeTypeOf('string')
    expect(portraitSource).toContain(`viewBox="${portraitBlock['viewBox']}"`)
  })

  it('renders at exactly the sizes DESIGN.md names, and at no other', () => {
    expect(portraitBlock['sizes'], 'DESIGN.md components.portrait.sizes').toBeTypeOf('string')
    const named = [...portraitBlock['sizes'].matchAll(/\b(\d+)\b/g)].map(([, size]) => Number(size))

    const union = portraitSource.match(/export type PortraitSize = ([^\n]+)/)
    expect(union, 'portrait.tsx must export the size union').not.toBeNull()
    const declared = [...union![1].matchAll(/\d+/g)].map(([size]) => Number(size))

    expect(declared).toEqual(named)
    // A literal union is what makes "no code path renders one at 20px" a
    // compile-time fact rather than a test that can only sample.
    expect(declared).not.toContain(20)
  })

  it('keeps every size at or above the legibility floor', () => {
    expect(portraitBlock['minLegibleSize'], 'components.portrait.minLegibleSize').toBeTypeOf(
      'string'
    )
    const floor = Number(portraitBlock['minLegibleSize'].replace('px', ''))
    const declared = [
      ...portraitSource.match(/export type PortraitSize = ([^\n]+)/)![1].matchAll(/\d+/g)
    ].map(([size]) => Number(size))

    expect(declared.filter((size) => size < floor)).toEqual([])
  })

  it('tapers the jaw to the ratio DESIGN.md states', () => {
    expect(portraitBlock['faceRatio'], 'DESIGN.md components.portrait.faceRatio').toBeTypeOf(
      'string'
    )

    // Read off the path in the source, so a retuned face reddens this rather
    // than drifting away from the number the spine fixes.
    const face = portraitSource.match(/d="(M32\.5,43\.5[^"]*)"/)
    expect(face, 'portrait.tsx must draw the tapered-jaw face path').not.toBeNull()

    const points = [...face![1].matchAll(/(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g)]
    const xs = points.map(([, x]) => Number(x))
    const ys = points.map(([, , y]) => Number(y))
    const ratio = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))

    expect(ratio.toFixed(2)).toBe(Number(portraitBlock['faceRatio']).toFixed(2))
  })

  it('rounds the face and the disc with the radius DESIGN.md gives them', () => {
    // Both blocks say `{rounded.full}`, and `--radius-full` is the token that
    // name resolves to — the perfect circle the system reserves for things
    // standing for a person or a light.
    expect(portraitBlock['radius']).toBe('{rounded.full}')
    expect(componentBlock('initials')['radius']).toBe('{rounded.full}')
    expect(read(PORTRAIT_CSS)).toContain('border-radius: var(--radius-full)')
    expect(read(INITIALS_CSS)).toContain('border-radius: var(--radius-full)')
  })
})

// ---------------------------------------------------------------------------
// The guards no rendered string can express.
// ---------------------------------------------------------------------------

describe('the two new stylesheets', () => {
  const sheets = [PORTRAIT_CSS, INITIALS_CSS]
  const initialsBlock = componentBlock('initials')

  it('are swept by the NFR23 guard the moment they exist', () => {
    for (const sheet of sheets) {
      expect(guardedStylesheets(), sheet).toContain(sheet)
    }
  })

  it('report no literal under the imported guard', () => {
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

  it('carry no media query: NFR27 allows no third breakpoint', () => {
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
    expect(withoutComments(read(PORTRAIT_CSS))).not.toMatch(/box-shadow/)
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
    const portraitCss = withoutComments(read(PORTRAIT_CSS))

    expect(initials).toContain('width: var(--initials-size)')
    expect(initials).toContain('height: var(--initials-size)')
    expect(initials).toContain('width: var(--initials-size-user)')
    expect(initials).toContain('height: var(--initials-size-user)')
    expect(initials).toContain('font-size: var(--fs-micro)')
    expect(initials).toContain('font-size: var(--fs-ident)')
    expect(initials).toContain('margin-right: var(--initials-overlap)')
    // The one thing `--lh-none` exists for, and nothing else referenced it.
    expect(portraitCss).toContain('line-height: var(--lh-none)')
  })

  it('draws the disc at the size the contract fixes, border included', () => {
    // Nothing under `src/` sets `box-sizing`, so the default adds the border
    // to the size rather than drawing it inside — which paints a disc wider
    // than `components.initials.size` and leaves the overlap short of the
    // face behind it. The mockup gets this from a global reset; this file
    // states it for itself rather than introducing one.
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
    // FR74 is otherwise guarded only over rendered markup, and a branch no
    // test renders draws nothing to sweep. The spec's own grep covers this,
    // but a command in a document is not run by anything — so it is run here,
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
    // The palettes are literal hex in source by design and stay outside the
    // guard's scope; a `style={{ }}` prop is not, and is swept like any other.
    for (const path of [PORTRAIT_TSX, INITIALS_TSX]) {
      expect(componentsUnder(), path).toContain(path)
      expect(inlineStyleLiteralsIn(path, read(path)), path).toEqual([])
    }
  })

  it('keeps the parameter module free of the DOM, so the node program can hold it', () => {
    const source = read(ART_PARAMS)

    expect(source).not.toMatch(/\bdocument\b|\bwindow\b|\bnavigator\b/)
    expect(source).not.toMatch(/^import /m)
  })

  it('imports its stylesheet from the component that needs it, and only there', () => {
    expect(read(PORTRAIT_TSX)).toMatch(/^import '\.\/portrait\.css'$/m)
    expect(read(INITIALS_TSX)).toMatch(/^import '\.\/initials\.css'$/m)
  })
})

// ---------------------------------------------------------------------------
// The mount the story's acceptance depends on.
// ---------------------------------------------------------------------------

describe('the preview in force', () => {
  const app = read('src/renderer/ui/app.tsx')

  it('mounts the five curated faces at all four sizes', () => {
    // FR75 is the one requirement in this epic no assertion can stand in for,
    // and a generator that is never mounted cannot be judged. Nothing else
    // asserts this: no other test imports `app.tsx`, and dropping the mount
    // leaves the whole suite green.
    expect(app).toContain('const PREVIEW_SIZES: PortraitSize[] = [32, 36, 38, 44]')
    for (const agentId of CURATED_AGENT_IDS) {
      expect(app, agentId).toContain(`'${agentId}'`)
    }
    expect(app).toContain('portrait(artParamsFor(persona.id), size, ')
  })

  it('mounts a derived grid of the twelve ids the mockup draws', () => {
    const grid = app.match(/const PREVIEW_DERIVED = \[([^\]]*)\]/)

    expect(grid, 'app.tsx must mount the derived grid').not.toBeNull()
    const ids = [...grid![1].matchAll(/'([^']+)'/g)].map(([, id]) => id)

    // The same twelve, in the same order, read out of the mockup — so the
    // population the human judgement compares is the population the mockup
    // draws, and not merely twelve ids of the right shape.
    expect(ids).toEqual(mockupDerivedIds())
    expect(ids).toHaveLength(12)
    expect(ids.filter((id) => CURATED_AGENT_IDS.includes(id))).toEqual([])
    expect(app).toContain('portrait(artParamsFor(agentId), 44, ')
  })

  it('mounts a stacked initials row below them', () => {
    const stacked = app.match(/<Initials[\s\S]*?stacked\s*\/>/)

    expect(stacked, 'app.tsx must mount a stacked row').not.toBeNull()
    // Its own size, not the user disc's: the stacked row is the small
    // reference case, which is the case the 32px portrait floor handed over.
    expect(stacked![0]).toContain('size={20}')
    // And the user's own avatar, which is the other half of UX-DR15.
    expect(app).toMatch(/<Initials[^/]*size=\{32\}[^/]*\/>/)
  })
})
