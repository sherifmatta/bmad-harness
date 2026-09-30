/**
 * The portrait's parameters — FR77, FR78, UX-DR14.
 *
 * One entry point, `artParamsFor(agentId)`, so that FR78's rule — *the five
 * core personas carry curated parameters, every other installed agent derives*
 * — is a single testable fact rather than a convention every call site has to
 * remember. A caller that reached for the curated table directly would be a
 * caller that could forget to.
 *
 * Every value below is transcribed from the approved generator,
 * `_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/mockups/portrait.html:311-343`,
 * and not re-derived. The palettes are constrained precisely so that the
 * derived population holds together as one company (DESIGN.md:575): same muted
 * range, same lighting, same construction. Widening one of them is a visual
 * decision, not a data change.
 *
 * The hex literals are deliberate and are not an NFR23 defect. These are the
 * generator's own data — eight skins, eight hairs, eight eyes, eight fits —
 * which exist nowhere in `design/tokens.css` and must not, because the
 * portrait is the only per-persona colour in the product (DESIGN.md:391) and
 * the ramp it sits inside is a different thing from the faces it holds. The
 * NFR23 guard is scoped to stylesheets and to `style={{ }}` props for exactly
 * this reason, and `tests/tokens.test.ts` pins that scope open by name.
 *
 * Pure and DOM-free by construction: no I/O, no global state, no assets, no
 * wall clock. `tests/` imports this into the node program, which has no DOM
 * lib — the same constraint `feed/memlog.ts` states.
 */

/** The five hair-and-silhouette constructions of DESIGN.md's parameter table. */
export type PortraitStyle = 'short' | 'long' | 'curly' | 'bun' | 'receding'

/** The forehead treatment. `receding` forces the absent case. */
export type PortraitFringe = 'straight' | 'sweep'

/** Beard density. `close` renders the same shape at a much lower opacity. */
export type PortraitBeard = 'full' | 'close'

/** Frame shape. Both are drawn, never tinted — lenses are near-transparent. */
export type PortraitGlasses = 'rect' | 'round'

/** The optional crown override. Curated personas only; derivation never sets it. */
export type PortraitCrown = { cy: number; rx: number; ry: number }

/**
 * The closed parameter domain (FR77). There is no name here and no title —
 * identity is the component's fourth argument, because FR77 fixes this table
 * and DESIGN.md:540 still requires the `<svg>` to be labelled. There is also
 * no field carrying the emoji glyph `_bmad/config.toml` gives each agent:
 * FR80 says that glyph is never rendered as a portrait, at any size, as a
 * fallback or otherwise, and the cheapest way to keep that promise is for the
 * value to have nowhere to sit.
 *
 * `hairDark`, `hairLite`, `lite` and `dark` are absent on purpose too: they
 * are derived at render from `hair` and `skin` and are never passed, so a
 * caller cannot desynchronise a face from its own light source.
 */
export type ArtParams = {
  /** Base skin tone. Paired with `shade` — the two are never chosen apart. */
  skin: string
  /** The skin's shadow partner: neck, collar notch, contour, nose, sockets. */
  shade: string
  /** Hair mass colour. `hairDark` and `hairLite` are derived from it. */
  hair: string
  /** Iris colour. New in v2 — five identical dark browns read as clones. */
  eye: string
  style: PortraitStyle
  /** `null` is a real value, and is forced for `receding`. */
  fringe: PortraitFringe | null
  /** Absent for everyone but John, whose crown is lower and smaller. */
  crown?: PortraitCrown
  beard: PortraitBeard | null
  glasses: PortraitGlasses | null
  earrings: boolean
  /** Shirt, collar and backdrop are one triple and are never mixed across fits. */
  shirt: string
  collar: string
  bg: string
}

/**
 * A channel-clamped lighten/darken, `portrait.html:186-190` verbatim.
 *
 * Exported because the four derived tones are the component's business, not
 * this module's: `portrait.tsx` computes them at render so that FR77's "never
 * passed" is structural. Clamping is per channel rather than on the result, so
 * a tone that saturates in one channel keeps its hue in the other two instead
 * of sliding toward grey.
 */
export function shade(hex: string, amount: number): string {
  const packed = parseInt(hex.slice(1), 16)
  const channels = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255].map((value) =>
    Math.max(0, Math.min(255, value + amount))
  )
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/**
 * 32-bit FNV-1a over `salt + ':' + id`, `portrait.html:331` verbatim.
 *
 * The salt is what makes eleven independent draws out of one identifier: an
 * unsalted hash indexed modulo five palettes correlates them, and a population
 * in which dark hair always arrives with dark eyes reads as five variations of
 * one person rather than as a company.
 *
 * `Math.imul` is not an optimisation. The FNV prime multiplication overflows
 * 53-bit floats immediately, so a plain `*` loses the low bits that carry the
 * avalanche; `Math.imul` is the only way to get the 32-bit wraparound the
 * algorithm is defined over, and `>>> 0` keeps the accumulator unsigned after
 * the XOR has made it negative.
 */
export function h32(text: string, salt: string): number {
  let hash = 2166136261 >>> 0
  const source = `${salt}:${text}`
  for (let at = 0; at < source.length; at += 1) {
    hash ^= source.charCodeAt(at)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash
}

/** Eight skin tones, each paired with its own shadow. `portrait.html:325`. */
const SKINS = [
  ['#f2d2b3', '#dbb593'],
  ['#efc6a1', '#d9a87f'],
  ['#ebc09c', '#d3a47e'],
  ['#e7b68d', '#cf9a72'],
  ['#d9a074', '#bf8759'],
  ['#bd7c4e', '#a06539'],
  ['#9c6138', '#7d4c2a'],
  ['#7d4f30', '#653d24']
] as const

/** Eight hair colours, black through the grey that reads as silver. `:326`. */
const HAIRS = [
  '#1e1a17',
  '#241f1d',
  '#2c2521',
  '#3d2b1f',
  '#5a3a22',
  '#7d4a2b',
  '#8a6a45',
  '#9ba3ab'
] as const

/** Eight iris colours. `:327`. */
const EYES = [
  '#4a3325',
  '#5a4332',
  '#6b4a2f',
  '#3d2a1e',
  '#5c6b4a',
  '#4f6068',
  '#6b7a80',
  '#54453a'
] as const

/** Eight shirt / collar / backdrop triples. `:328`. */
const FITS = [
  ['#465260', '#39434f', '#2a3340'],
  ['#3c4756', '#313b48', '#2f3742'],
  ['#3c4a4b', '#313d3e', '#2f3a3c'],
  ['#4b4053', '#3d3445', '#383345'],
  ['#3f4b45', '#343f3a', '#333c3a'],
  ['#4a4a56', '#3d3d47', '#353542'],
  ['#52464a', '#443a3d', '#3a3236'],
  ['#414f5a', '#36414a', '#313b43']
] as const

/**
 * The weighted style list — **six entries for five styles** (`:329`).
 *
 * `short` appears twice on purpose, which is the entire weighting mechanism:
 * indexing modulo six lands `short` at twice the rate of each of the other
 * four, exactly as DESIGN.md:575 specifies. Deduplicating this list would look
 * like tidying and would flatten the distribution.
 */
const STYLES = ['short', 'short', 'long', 'curly', 'bun', 'receding'] as const

/** The forehead treatments, the absent case included as a real draw. `:330`. */
const FRINGES = ['straight', 'sweep', null] as const

/** One draw from a palette: the salted hash, indexed modulo its length. */
function pick<T>(palette: readonly T[], agentId: string, salt: string): T {
  return palette[h32(agentId, salt) % palette.length]
}

/**
 * The five curated faces, keyed by **BMad agent id** (`_bmad/config.toml:23-63`).
 *
 * Keyed by id and never by display name, title or emoji: the name is a label
 * the roster can change, the id is what the install actually is. The mockup
 * keys these by first name because it has no roster to read; that is the one
 * place its data shape is not transcribed.
 *
 * Each object is `portrait.html:311-321` verbatim, with `earrings` stated
 * rather than left absent so the field is total, and John's `crown` override
 * the only one present — every other face takes the default `{cy:35, rx:19.2,
 * ry:19.6}` the component applies.
 */
const CURATED: Readonly<Record<string, ArtParams>> = {
  'bmad-agent-analyst': {
    skin: '#e7b68d',
    shade: '#cf9a72',
    hair: '#7d4a2b',
    eye: '#6b4a2f',
    style: 'long',
    fringe: 'sweep',
    beard: null,
    glasses: 'rect',
    earrings: false,
    shirt: '#3c4756',
    collar: '#313b48',
    bg: '#2f3742'
  },
  'bmad-agent-pm': {
    skin: '#efc6a1',
    shade: '#d9a87f',
    hair: '#9ba3ab',
    eye: '#6b7a80',
    style: 'short',
    fringe: 'straight',
    crown: { cy: 33.5, rx: 18.6, ry: 17.6 },
    beard: 'full',
    glasses: null,
    earrings: false,
    shirt: '#465260',
    collar: '#39434f',
    bg: '#2a3340'
  },
  'bmad-agent-ux-designer': {
    skin: '#bd7c4e',
    shade: '#a06539',
    hair: '#241f1d',
    eye: '#3d2a1e',
    style: 'curly',
    fringe: null,
    beard: null,
    glasses: null,
    earrings: true,
    shirt: '#4b4053',
    collar: '#3d3445',
    bg: '#383345'
  },
  'bmad-agent-architect': {
    skin: '#7d4f30',
    shade: '#653d24',
    hair: '#1e1a17',
    eye: '#4a3325',
    style: 'receding',
    fringe: null,
    beard: 'close',
    glasses: null,
    earrings: false,
    shirt: '#3c4a4b',
    collar: '#313d3e',
    bg: '#2f3a3c'
  },
  'bmad-agent-dev': {
    skin: '#ebc09c',
    shade: '#d3a47e',
    hair: '#2c2521',
    eye: '#5c6b4a',
    style: 'bun',
    fringe: 'sweep',
    beard: null,
    glasses: 'round',
    earrings: false,
    shirt: '#3f4b45',
    collar: '#343f3a',
    bg: '#333c3a'
  }
}

/** The five ids that carry curated art, in `_bmad/config.toml` order. */
export const CURATED_AGENT_IDS: readonly string[] = Object.freeze(Object.keys(CURATED))

/**
 * The parameters an agent wears — curated for the five, derived for everyone
 * else (FR78).
 *
 * Deterministic in the strong sense the requirement asks for: the same id
 * yields the same face across calls, runs, sessions and machines, because the
 * only input is the id and the only mechanism is arithmetic. Nothing here
 * reads a clock, a random source, a file or a previous result.
 *
 * There is no collision check, by decision (DESIGN.md:575). Two agents can in
 * principle derive to similar faces; that is accepted at 32px and above, and
 * is part of why the 20px case was reassigned to the initials token.
 *
 * The curated object is copied on the way out so that one caller cannot edit
 * the face every other caller sees.
 */
export function artParamsFor(agentId: string): ArtParams {
  // Own keys only: an id is project text, and `constructor` or `toString` would
  // otherwise find an inherited function here and be treated as curated art.
  const curated = Object.hasOwn(CURATED, agentId) ? CURATED[agentId] : undefined
  if (curated !== undefined) {
    const copy = { ...curated }
    // `crown` is the one nested value here, and a spread copies the reference
    // to it rather than the object. Without this line every caller holds the
    // same crown, and one of them editing it retunes John's head for the rest
    // of the process — which is exactly what the promise above rules out.
    if (copy.crown !== undefined) {
      copy.crown = { ...copy.crown }
    }
    return copy
  }

  const [skin, skinShade] = pick(SKINS, agentId, 'skin')
  const [shirt, collar, bg] = pick(FITS, agentId, 'fit')
  const style = pick(STYLES, agentId, 'style')

  return {
    skin,
    shade: skinShade,
    hair: pick(HAIRS, agentId, 'hair'),
    eye: pick(EYES, agentId, 'eye'),
    style,
    // The forcing is here rather than in the component, so that no rendered
    // face can disagree with the parameters it was drawn from: a receding
    // hairline with a fringe over it is the one combination the geometry
    // cannot resolve.
    fringe: style === 'receding' ? null : pick(FRINGES, agentId, 'fringe'),
    // The rates DESIGN.md:575 fixes — 32 / 34 / 28 per cent — as a modulo of
    // one salted draw, with a second salt choosing between the two shapes so
    // that wearing glasses and wearing round glasses are independent facts.
    beard: h32(agentId, 'beard') % 100 < 32 ? (h32(agentId, 'beardk') % 2 === 1 ? 'full' : 'close') : null,
    glasses:
      h32(agentId, 'glass') % 100 < 34 ? (h32(agentId, 'glassk') % 2 === 1 ? 'rect' : 'round') : null,
    earrings: h32(agentId, 'ear') % 100 < 28,
    shirt,
    collar,
    bg
  }
}
