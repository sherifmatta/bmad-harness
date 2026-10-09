import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { artParamsFor } from './art-params'
import type { ArtParams } from './art-params'
import { portrait } from './portrait'
import type { PersonaState, PortraitSize } from './portrait'
import { Initials, initialsOf } from './initials'

/**
 * What the faces actually render, asserted against the markup rather than
 * against the source text that produces it.
 *
 * It lives here rather than in `tests/` for the structural reason the run-note
 * suite records: `tests/` is typechecked by `tsconfig.node.json`, which sets no
 * `jsx`, so a `.tsx` there would be typechecked by nothing. Under
 * `src/renderer/` it is collected by the same Vitest glob and typechecked by
 * `tsconfig.web.json`, which does set `jsx`.
 *
 * `renderToStaticMarkup` is the already-pinned `react-dom`'s node entry, not a
 * new dependency and not a DOM: it returns a string and touches no `document`.
 *
 * The invariants that must survive a rewrite — the derivation rates, the
 * run-time couplings to DESIGN.md and the stylesheet sweeps — are
 * `tests/persona.test.ts`'s. This file is only about what comes out.
 */

const IDENTITY = { name: 'Mary', title: 'Business Analyst' }
const SIZES: PortraitSize[] = [36, 44]
const STATES: PersonaState[] = ['idle', 'work', 'live', 'note', 'error']

const MARY = artParamsFor('bmad-agent-analyst')
const WINSTON = artParamsFor('bmad-agent-architect')
const SALLY = artParamsFor('bmad-agent-ux-designer')
const AMELIA = artParamsFor('bmad-agent-dev')

/**
 * One face with every optional feature switched on at once, so the draw-order
 * assertion below can be a single ordinal sequence over all twenty-one shapes
 * rather than a different sequence per parameter combination.
 */
const EVERYTHING: ArtParams = { ...MARY, beard: 'full', earrings: true }

function render(
  art: ArtParams,
  size: PortraitSize = 44,
  state: PersonaState = 'idle'
): string {
  return renderToStaticMarkup(portrait(art, size, state, IDENTITY))
}

/** Every opening tag, closing tags excluded — the unit both sweeps work over. */
function tagsIn(markup: string): string[] {
  return [...markup.matchAll(/<[a-zA-Z][^>]*>/g)].map((match) => match[0])
}

function elementOf(tag: string): string {
  return tag.slice(1).split(/[\s/>]/)[0]
}

function attributesOf(tag: string): { name: string; value: string }[] {
  return [...tag.matchAll(/([a-zA-Z][\w:-]*)="([^"]*)"/g)].map(([, name, value]) => ({
    name,
    value
  }))
}

// ---------------------------------------------------------------------------
// FR74 — the collision surface is absent, not merely unused.
// ---------------------------------------------------------------------------

/**
 * The sweep is an allowlist rather than a list of things to look for.
 *
 * A denylist can only reject what it has been told about, and the requirement
 * is the other way round: nothing that could tie one portrait to another may
 * exist at all. Everything that carries a document-wide reference — a
 * fragment-referencing attribute, a reusable definition block, a paint server,
 * a clip, a filter, a mask, a namespaced link — is outside both lists below
 * and so fails by construction, including the ones nobody thought of.
 */
const ALLOWED_ELEMENTS = ['span', 'svg', 'circle', 'ellipse', 'path', 'rect', 'g']

const ALLOWED_ATTRIBUTES = [
  'class',
  'width',
  'height',
  'viewBox',
  'role',
  'aria-label',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'd',
  'fill',
  'opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin'
]

describe('portraits in one document', () => {
  // Several agents in one string — which is the state FR74 is actually about
  // — and between them every branch of the geometry. Winston and Sally alone
  // left the sweeps below vacuous over exactly the markup that needs them:
  // the glasses branch is the only one that emits a `g` and the only one
  // whose paint is not a hex, and neither of those two wears any.
  const both =
    render(WINSTON) +
    render(SALLY) +
    render(EVERYTHING) +
    render({ ...EVERYTHING, glasses: 'round', style: 'short', fringe: 'straight' })

  it('draws nothing outside the allowed element set', () => {
    const unexpected = [...new Set(tagsIn(both).map(elementOf))].filter(
      (element) => !ALLOWED_ELEMENTS.includes(element)
    )

    expect(unexpected).toEqual([])
  })

  it('carries nothing outside the allowed attribute set', () => {
    const unexpected = [
      ...new Set(tagsIn(both).flatMap((tag) => attributesOf(tag).map(({ name }) => name)))
    ].filter((name) => !ALLOWED_ATTRIBUTES.includes(name))

    expect(unexpected).toEqual([])
  })

  it('paints every shape with a flat colour and never with a reference', () => {
    // The other half of the same requirement: an allowed attribute can still
    // carry a reference in its *value*. Every paint is a hex, a translucent
    // flat colour, or the keyword for no paint at all.
    const paints = tagsIn(both)
      .flatMap(attributesOf)
      .filter(({ name }) => name === 'fill' || name === 'stroke')
      .map(({ value }) => value)

    expect(paints.length).toBeGreaterThan(40)
    expect(paints.filter((value) => !/^(?:#[0-9a-f]{6}|rgba\([\d.,]+\)|none)$/.test(value))).toEqual(
      []
    )
  })

  it('is four complete faces, not one', () => {
    expect(tagsIn(both).filter((tag) => elementOf(tag) === 'svg')).toHaveLength(4)
    // The branches the sweeps above would otherwise never see.
    expect(both).toContain('<g ')
    expect(both).toContain('rgba(')
  })
})

describe('the class names the stylesheets hang on', () => {
  // Nothing else pins these. Renaming `portrait-face` is a one-character edit
  // that leaves the suite, lint and typecheck green while every face loses its
  // circular clip and its `display:block` — the two declarations DESIGN.md:540
  // puts on the svg — and the reveal ships unstyled for the same reason.
  it('names the portrait wrapper and the face', () => {
    const markup = render(MARY)

    expect(markup).toContain('class="portrait"')
    expect(markup).toContain('class="portrait-face"')
  })

  it('names the three parts of the reveal', () => {
    const markup = renderToStaticMarkup(
      <Initials name="Mary Jones" title="Business Analyst" size={20} stacked />
    )

    expect(markup).toContain('class="initials-reveal"')
    expect(markup).toContain('class="initials-reveal-card"')
    expect(markup).toContain('class="initials-reveal-name"')
    expect(markup).toContain('class="initials-reveal-role"')
  })
})

// ---------------------------------------------------------------------------
// FR73 — purity, in the ordinary sense.
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('gives byte-identical markup for identical arguments', () => {
    expect(render(EVERYTHING)).toBe(render(EVERYTHING))
  })

  it('gives byte-identical markup at every state value', () => {
    // FR81: the status dot carries state, the face does not. Exhausted rather
    // than sampled, which is what the closed union is for.
    const drawn = new Set(STATES.map((state) => render(MARY, 36, state)))

    expect(drawn.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// FR79, FR73 — the closed size set, and the label at every one of them.
// ---------------------------------------------------------------------------

describe('the two render sizes', () => {
  it('changes only width and height', () => {
    const shapes = SIZES.map((size) =>
      render(EVERYTHING, size).replace(/ width="\d+" height="\d+"/, '')
    )

    expect(new Set(shapes).size).toBe(1)
  })

  it('carries the size on the svg and keeps the coordinate space fixed', () => {
    for (const size of SIZES) {
      const markup = render(MARY, size)

      expect(markup).toContain(`width="${size}" height="${size}"`)
      expect(markup).toContain('viewBox="0 0 100 100"')
    }
  })

  it('is labelled as one image of a named person at every size', () => {
    // The join happens inside the component, so a caller cannot produce a
    // label that is only a name — which is how the mockup's own call sites
    // drift, one passing a bare name and the next passing both.
    for (const size of SIZES) {
      const markup = render(MARY, size)

      expect(markup).toContain('role="img"')
      expect(markup).toContain('aria-label="Mary, Business Analyst"')
      expect(markup.match(/aria-label=/g)).toHaveLength(1)
    }
  })
})

// ---------------------------------------------------------------------------
// FR76 — the approved v2 geometry.
// ---------------------------------------------------------------------------

/** The first path whose data begins with `start`, as its `d` value. */
function pathData(markup: string, start: string): string {
  const found = tagsIn(markup)
    .flatMap(attributesOf)
    .find(({ name, value }) => name === 'd' && value.startsWith(start))

  expect(found, `no path beginning ${start}`).toBeDefined()
  return found!.value
}

describe('the v2 geometry', () => {
  const markup = render(EVERYTHING)

  it('draws the face in the fixed order, from the backdrop to the earrings', () => {
    // SVG paints in document order, so this is not a description of the order
    // — it is the order, and moving one shape moves what is in front of what.
    const order = [
      ['backdrop', '<circle cx="50" cy="50" r="50"'],
      ['back hair mass', 'd="M27,48'],
      ['neck', 'd="M42.6,56 h14.8'],
      ['jaw shadow', 'cy="70.5"'],
      ['shoulders', 'd="M6,100'],
      ['collar notch', 'd="M42.6,75.4 C44.6'],
      ['stroked V', 'd="M42.6,75.4 L50,84'],
      ['crown', '<ellipse cx="50" cy="35"'],
      ['ears', 'cx="32.2" cy="48.5"'],
      ['face', 'd="M32.5,43.5'],
      ['contour shadow', 'd="M50,24 C60.5,24'],
      ['cheek highlight', 'cx="41.5" cy="53"'],
      ['beard', 'd="M33,45 C33,60'],
      ['fringe', 'd="M32.6,42.5'],
      ['hair highlight', 'd="M36,32'],
      ['brows', 'd="M37.4,42.8'],
      ['eyes', 'cy="46.6"'],
      ['nose', 'd="M50.2,45'],
      ['mouth', 'd="M45.3,61.4'],
      ['glasses', 'x="35.6" y="41.6"'],
      ['earrings', 'cy="53.6"']
    ]

    const positions = order.map(([name, fragment]) => {
      const at = markup.indexOf(fragment)
      expect(at, `${name} is not drawn at all`).toBeGreaterThan(-1)
      return { name, at }
    })

    expect(positions.map(({ name }) => name)).toEqual(
      [...positions].sort((a, b) => a.at - b.at).map(({ name }) => name)
    )
  })

  it('tapers the jaw at the ratio that replaced v1’s symmetrical ellipse', () => {
    // The single biggest cause of v1's toy read was a face at a width/height
    // ratio of .89. The extremes are read off the path rather than restated:
    // a path edited to a wider jaw would otherwise pass a substring check.
    const face = pathData(markup, 'M32.5,43.5')
    const points = [...face.matchAll(/(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g)].map(([, x, y]) => ({
      x: Number(x),
      y: Number(y)
    }))

    const xs = points.map(({ x }) => x)
    const ys = points.map(({ y }) => y)

    expect([Math.min(...xs), Math.max(...xs)]).toEqual([32.5, 67.5])
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([24, 70])
    expect(((Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))).toFixed(2))
      .toBe('0.76')
  })

  it('carries all four shapes of the single upper-left light', () => {
    // All four, because the light reads as a light only when the shadow, the
    // highlight, the cast shadow and the ear shadows agree about where it is.
    expect(markup).toContain('d="M50,24 C60.5,24') // right-contour shadow
    expect(markup).toContain('<ellipse cx="41.5" cy="53"') // cheek highlight
    expect(markup).toContain('<ellipse cx="50" cy="70.5"') // jaw shadow on the neck
    expect(markup).toContain('<ellipse cx="32.4" cy="48.5"') // inner-ear shadows
    expect(markup).toContain('<ellipse cx="67.6" cy="48.5"')
  })

  it('builds each eye out of its six shapes', () => {
    for (const x of [42, 58]) {
      expect(markup, 'socket shadow').toContain(`<ellipse cx="${x}" cy="46.6" rx="4.4" ry="3.2"`)
      expect(markup, 'almond white').toMatch(new RegExp(`Q${x},43\\.5 [\\d.]+,47 Q${x},49\\.9`))
      expect(markup, 'iris').toContain(`<circle cx="${x}" cy="46.9" r="1.95"`)
      expect(markup, 'pupil').toContain(`<circle cx="${x}" cy="46.9" r=".92" fill="#17120f"`)
      expect(markup, 'catchlight').toContain(`cy="46.15" r=".5" fill="#ffffff" opacity=".75"`)
      expect(markup, 'weighted upper lid').toMatch(new RegExp(`Q${x},43\\.1 [\\d.]+,46\\.9`))
    }
    // The catchlight is the one specular white in the face, and the pupil the
    // one near-black: there is no pure white or pure black anywhere else.
    expect(markup.match(/#ffffff/g)).toHaveLength(2)
  })

  it('fills the brows rather than stroking them', () => {
    // Strokes read as pencil lines and were half of v1's cartoon tell.
    for (const brow of ['M37.4,42.8', 'M62.6,42.8']) {
      const tag = tagsIn(markup).find((candidate) => candidate.includes(`d="${brow}`))

      expect(tag, brow).toBeDefined()
      expect(attributesOf(tag!).map(({ name }) => name)).toEqual(['d', 'fill'])
    }
  })

  it('builds the nose out of a bridge shadow, a tip and two nostrils', () => {
    expect(markup).toContain('d="M50.2,45 C50.8,50 51.8,53.8 52.8,55.8" fill="none"')
    expect(markup).toContain('<ellipse cx="50" cy="56.2" rx="3.4" ry="1.7"')
    expect(markup).toContain('<ellipse cx="47.4" cy="56.4"')
    expect(markup).toContain('<ellipse cx="52.6" cy="56.4"')
  })

  it('rests the mouth and lights the lower lip', () => {
    // A resting curve, not a smile arc — the other half of v1's cartoon tell.
    expect(markup).toContain('d="M45.3,61.4 Q50,63.2 54.7,61.4" fill="none"')
    expect(markup).toContain('<ellipse cx="50" cy="64" rx="4.2" ry="1.7"')
  })

  it('shades every overlay with opacity rather than with a second colour', () => {
    const shading = tagsIn(markup)
      .flatMap(attributesOf)
      .filter(({ name }) => name === 'opacity')

    expect(shading.length).toBeGreaterThan(8)
    expect(shading.filter(({ value }) => Number(value) <= 0 || Number(value) >= 1)).toEqual([])
  })
})

describe('the hair', () => {
  it('carries the highlight arc that stops it reading as a helmet', () => {
    for (const art of [MARY, SALLY, AMELIA]) {
      expect(render(art), art.style).toContain('d="M36,32')
    }
  })

  it('omits the arc for a receding hairline, which has no crown to catch it', () => {
    expect(WINSTON.style).toBe('receding')
    expect(render(WINSTON)).not.toContain('d="M36,32')
  })

  it('draws a back mass behind the head for long hair and for a bun', () => {
    expect(render(MARY)).toContain('d="M27,48')
    expect(render(AMELIA)).toContain('d="M31,50 C31,28.5')
    // And nothing behind the head for the styles that have none.
    expect(render(WINSTON)).not.toContain('d="M27,48')
  })

  it('builds a curly crown from seven circles, two of them highlighted', () => {
    const crown = tagsIn(render(SALLY)).filter(
      (tag) => elementOf(tag) === 'circle' && tag.includes(`fill="${SALLY.hair}"`)
    )
    const highlights = tagsIn(render(SALLY)).filter(
      (tag) => elementOf(tag) === 'circle' && tag.includes('opacity=".2"')
    )

    expect(crown).toHaveLength(7)
    expect(highlights).toHaveLength(2)
  })
})

describe('the optional features', () => {
  it('draws one beard shape at two opacities rather than two shapes', () => {
    const full = render({ ...MARY, beard: 'full' })
    const close = render({ ...MARY, beard: 'close' })

    expect(full).toContain('d="M33,45 C33,60')
    expect(close).toContain('d="M33,45 C33,60')
    expect(full).toContain('opacity="0.88"')
    expect(close).toContain('opacity="0.4"')
    expect(render({ ...MARY, beard: null })).not.toContain('d="M33,45 C33,60')
  })

  it('draws both frame shapes, and neither when there are no glasses', () => {
    expect(render({ ...MARY, glasses: 'rect' })).toContain('<rect x="35.6" y="41.6"')
    expect(render({ ...MARY, glasses: 'round' })).toContain('<circle cx="42" cy="46.4" r="6.8"')
    expect(render({ ...MARY, glasses: null })).not.toContain('#cdd4dc')
  })

  it('draws a pair of earrings or none', () => {
    expect(render({ ...MARY, earrings: true })).toContain('<circle cx="32.2" cy="53.6" r="1.7"')
    expect(render({ ...MARY, earrings: true })).toContain('<circle cx="67.8" cy="53.6" r="1.7"')
    expect(render({ ...MARY, earrings: false })).not.toContain('cy="53.6"')
  })

  it('takes a curated crown override where one exists, and the default elsewhere', () => {
    expect(render(artParamsFor('bmad-agent-pm'))).toContain('<ellipse cx="50" cy="33.5"')
    expect(render(MARY)).toContain('<ellipse cx="50" cy="35" rx="19.2" ry="19.6"')
  })
})

// ---------------------------------------------------------------------------
// FR82 — the initials token.
// ---------------------------------------------------------------------------

describe('the initials glyphs', () => {
  it.each([
    ['Mary Jones', 'MJ'],
    ['Winston', 'W'],
    ['Ana Maria Ruiz', 'AM'],
    ['  Alpha   Beta  ', 'AB'],
    ['mary jones', 'MJ']
  ])('reads %s as %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })
})

describe('one initials disc', () => {
  const markup = renderToStaticMarkup(
    <Initials name="Mary Jones" title="Business Analyst" size={20} stacked />
  )

  it('is focusable, labelled, and an image of a person', () => {
    // A hover-only tooltip is the one affordance that fails completely without
    // a mouse, and the whole content of a stacked row is behind this reveal.
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('role="img"')
    expect(markup).toContain('aria-label="Mary Jones, Business Analyst"')
  })

  it('carries the name and the role in the reveal, not only in the label', () => {
    expect(markup).toContain('>Mary Jones<')
    expect(markup).toContain('>Business Analyst<')
    expect(markup).toContain('MJ')
  })

  it('opts into the shared focus treatment instead of restating one', () => {
    expect(markup).toContain('class="initials initials--stacked focus-stacked"')
  })

  it('renders the same reveal whether it will be reached by mouse or by key', () => {
    // Parity is structural: there is one reveal in the markup and one selector
    // list in the stylesheet that shows it. Nothing here can be true of hover
    // and false of focus, because nothing here knows which one happened.
    expect(markup.match(/initials-reveal"/g)).toHaveLength(1)
  })

  it('is decorative at the chat sizes: aria-hidden, no tab stop, no label and no reveal', () => {
    for (const [size, name] of [
      [26, 'thread'],
      [22, 'header']
    ] as const) {
      const disc = renderToStaticMarkup(<Initials name="Preview User" title="you" size={size} />)

      expect(disc).toBe(`<span class="initials initials--${name}" aria-hidden="true">PU</span>`)
      expect(disc).not.toMatch(/tabindex|role=|aria-label|initials-reveal|focus-stacked/)
    }
  })

  it('tints your own disc and no persona’s', () => {
    const yours = renderToStaticMarkup(<Initials name="You" title="you" size={26} you />)
    const theirs = renderToStaticMarkup(<Initials name="Mary" title="Analyst" size={26} />)

    expect(yours).toContain('initials--you')
    expect(theirs).not.toContain('initials--you')
  })

  it('is a stack of discs that each carry their own label', () => {
    const row = renderToStaticMarkup(
      <>
        <Initials name="Mary Jones" title="Business Analyst" size={20} stacked />
        <Initials name="Winston" title="System Architect" size={20} stacked />
      </>
    )

    expect(row.match(/aria-label=/g)).toHaveLength(2)
    expect(row).toContain('aria-label="Winston, System Architect"')
    expect(row).toContain('>W<')
  })
})
