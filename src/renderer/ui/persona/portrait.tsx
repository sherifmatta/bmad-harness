import { Fragment } from 'react'
import type { JSX } from 'react'

import './portrait.css'
import { shade } from './art-params'
import type { ArtParams } from './art-params'

/**
 * The portrait — FR73–FR81, UX-DR14, and the highest-risk component in the
 * product.
 *
 * The geometry below is transcribed from the approved generator,
 * `mockups/portrait.html:216-309` (`portraitV2`), coordinate by coordinate and
 * in its draw order. It is not re-derived and must not be "tidied": v1 was
 * rejected for reading as a toy, the single largest cause was a symmetrical
 * face ellipse, and every number here is the correction. Where the mockup and
 * DESIGN.md disagree, DESIGN.md wins (UX-DR14) — the three live disagreements
 * are the reveal's transition, the reveal's shadow and the focus treatment,
 * and all three belong to the initials token next door, not to this file.
 *
 * **Purity is hard** (FR74, DESIGN.md:542). No `id` attribute, no definition
 * block, no colour ramp, no clip path, no paint filter, no mask, and no
 * reference out of the document — none of them, in any spelling. Two
 * portraits in one document must not be able to collide, and the way that is
 * guaranteed is that the collision surface is *absent* rather than unused:
 * every shape is a flat fill or a stroke, and every piece of shading is an
 * overlaid low-opacity shape. `persona.test.tsx` sweeps the rendered markup
 * against an allowlist of elements and attributes, so a future shape cannot
 * introduce one of those without failing.
 *
 * **Pure in the ordinary sense too.** No I/O, no global state, no assets, no
 * wall clock — the same arguments give byte-identical markup on every call,
 * run and machine, which is asserted rather than claimed.
 *
 * **The palette is literal hex on purpose.** `art.skin`, `art.hair` and the
 * fixed tones below are the generator's own data, not design-system values a
 * component is restating; NFR23's guard is scoped to stylesheets and to
 * `style={{ }}` props for exactly this reason. The wrapper's and the face's
 * own CSS — the two things that *are* design-system values — live in
 * `portrait.css` and spend tokens like every other stylesheet.
 */

/**
 * The closed set of render sizes (FR79), as a literal union rather than a
 * number.
 *
 * This is what makes "no code path renders a portrait at 20px" a fact the
 * compiler checks rather than something a test can only sample. The 20px case
 * is the initials token's, because at 20px a face degrades to a colour blob
 * with a hair silhouette and the derivation has no collision check to save it.
 */
export type PortraitSize = 36 | 44

/**
 * The state vocabulary DESIGN.md:589-600 fixes, accepted and then ignored.
 *
 * FR81: one neutral expression at every value — the status dot carries state,
 * the face does not. The parameter is in the signature from the start so that
 * reactive faces, a Should-tier deferral, need no signature change later.
 * Typed as the union rather than as `string` so that "every state value" is an
 * enumerable set a determinism test can exhaust instead of sample.
 */
export type PersonaState = 'idle' | 'work' | 'live' | 'note' | 'error'

/**
 * Who the face belongs to, as its own argument.
 *
 * FR77 fixes `ArtParams` as a closed table with no name and no title in it,
 * and DESIGN.md:540 and EXPERIENCE.md:521 require the `<svg>` to carry
 * `aria-label="{name}, {title}"` at every size. Both hold only if identity
 * arrives separately, so the three named parameters keep their names and
 * positions and this is appended.
 *
 * It is a pair rather than a pre-joined string so that the component owns the
 * join and no caller can produce a label that is only a name — which is
 * exactly how the mockup's own call sites drift, one passing a bare name and
 * the next passing both.
 */
export type PersonaIdentity = { name: string; title: string }

/** The crown when no curated override supplies one (`portrait.html:246`). */
const DEFAULT_CROWN = { cy: 35, rx: 19.2, ry: 19.6 }

/** The seven circles that make a curly crown, and the two that catch light. */
const CURLS = [
  [35.5, 29, 8.4],
  [46, 22.5, 8.8],
  [57, 23.5, 8.4],
  [65, 31.5, 7.8],
  [32.5, 38.5, 7.4],
  [67.5, 40, 7],
  [50, 31, 9.2]
]
const CURL_HIGHLIGHTS = [
  [46, 22.5, 8.8],
  [57, 23.5, 8.4]
]

/** The two eye centres. Everything else in an eye is offset from one of these. */
const EYE_CENTRES = [42, 58]

/**
 * One face.
 *
 * The draw order below is fixed (DESIGN.md:571) and is the order the elements
 * appear in: backdrop → back hair mass → neck → jaw shadow → shoulders →
 * collar notch → stroked V → crown → ears → face → contour shadow → cheek
 * highlight → beard → fringe → hair highlight → brows → eyes → nose → mouth →
 * glasses → earrings. SVG paints in document order, so this list is not
 * documentation of the order — it *is* the order, and moving one line moves
 * what is in front of what.
 */
export function portrait(
  art: ArtParams,
  size: PortraitSize,
  state: PersonaState,
  identity: PersonaIdentity
): JSX.Element {
  // FR81, stated to the compiler. `state` is read nowhere below because the
  // face is one neutral expression at every value; `void` is what says that
  // deliberately, since `noUnusedParameters` would otherwise report it and the
  // only alternatives are renaming the parameter — breaking the signature FR73
  // fixes — or switching the check off.
  void state

  // Derived at render and never passed (FR77), so a face cannot be handed a
  // light source that disagrees with its own skin and hair.
  const hairDark = shade(art.hair, -20)
  const hairLite = shade(art.hair, 26)
  const lite = shade(art.skin, 20)
  const dark = shade(art.skin, -38)
  const crown = art.crown ?? DEFAULT_CROWN

  return (
    <span className="portrait">
      <svg
        className="portrait-face"
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${identity.name}, ${identity.title}`}
      >
        {/* Backdrop — the fit's third colour, so the face sits inside the
            surface ramp rather than on top of it. */}
        <circle cx="50" cy="50" r="50" fill={art.bg} />

        {/* The hair mass behind the head. Only `long` and `bun` have one. */}
        {art.style === 'long' && (
          <path
            d="M27,48 C27,25 36,16 50,16 C64,16 73,25 73,48 L73,78 C73,80.5 70,80.5 69,78 C66.5,70 65.5,60 65.5,52 L34.5,52 C34.5,60 33.5,70 31,78 C30,80.5 27,80.5 27,78 Z"
            fill={hairDark}
          />
        )}
        {art.style === 'bun' && (
          <>
            <circle cx="70.5" cy="30" r="8.4" fill={hairDark} />
            <circle cx="70.5" cy="30" r="8.4" fill={hairLite} opacity=".16" />
            <path
              d="M31,50 C31,28.5 39,19 50,19 C61,19 69,28.5 69,50 L69,61 C69,63 66.5,63 65.8,61 C65,57.5 65,54 65,52 L35,52 C35,54 35,57.5 34.2,61 C33.5,63 31,63 31,61 Z"
              fill={hairDark}
            />
          </>
        )}

        {/* Neck, then the shadow the jaw casts on it — one of the four shapes
            carrying the single upper-left light — then the shoulders. */}
        <path d="M42.6,56 h14.8 v21 h-14.8 z" fill={art.shade} />
        <ellipse cx="50" cy="70.5" rx="10.6" ry="4.4" fill={dark} opacity=".5" />
        <path d="M6,100 C8,83.5 25,75 50,75 C75,75 92,83.5 94,100 Z" fill={art.shirt} />

        {/* The collar: a filled notch, then the stroked V over it. */}
        <path d="M42.6,75.4 C44.6,82.6 55.4,82.6 57.4,75.4 Z" fill={art.shade} />
        <path
          d="M42.6,75.4 L50,84 L57.4,75.4"
          fill="none"
          stroke={art.collar}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* The crown, behind the face. Three constructions, one per branch. */}
        {art.style === 'curly' ? (
          <>
            {CURLS.map(([x, y, r]) => (
              <circle key={`${x},${y}`} cx={x} cy={y} r={r} fill={art.hair} />
            ))}
            {CURL_HIGHLIGHTS.map(([x, y, r]) => (
              <circle
                key={`${x},${y}`}
                cx={x - 1.6}
                cy={y - 1.6}
                r={r * 0.62}
                fill={hairLite}
                opacity=".2"
              />
            ))}
          </>
        ) : art.style === 'receding' ? (
          <ellipse cx="50" cy="37.5" rx="17.8" ry="16.6" fill={art.hair} />
        ) : (
          <ellipse cx="50" cy={crown.cy} rx={crown.rx} ry={crown.ry} fill={art.hair} />
        )}

        {/* Ears, each with its inner shadow — light shapes two and three. */}
        <ellipse cx="32.2" cy="48.5" rx="2.9" ry="4.5" fill={art.skin} />
        <ellipse cx="32.4" cy="48.5" rx="1.4" ry="2.5" fill={dark} opacity=".45" />
        <ellipse cx="67.8" cy="48.5" rx="2.9" ry="4.5" fill={art.skin} />
        <ellipse cx="67.6" cy="48.5" rx="1.4" ry="2.5" fill={dark} opacity=".45" />

        {/* The face. A tapered-jaw path spanning x 32.5→67.5 and y 24→70 — a
            width/height ratio of .76, and the load-bearing change from v1's
            symmetrical .89 ellipse. Wide at the temples, narrowing through the
            cheek, closing to a rounded chin. */}
        <path
          d="M32.5,43.5 C32.5,31 39.5,24 50,24 C60.5,24 67.5,31 67.5,43.5 C67.5,52.5 65.8,58.6 62,63.2 C58.4,67.6 54.4,70 50,70 C45.6,70 41.6,67.6 38,63.2 C34.2,58.6 32.5,52.5 32.5,43.5 Z"
          fill={art.skin}
        />
        {/* Shadow down the right contour — light shape one. */}
        <path
          d="M50,24 C60.5,24 67.5,31 67.5,43.5 C67.5,52.5 65.8,58.6 62,63.2 C58.4,67.6 54.4,70 50,70 C53.6,66 56,59.5 56.8,51.5 C57.8,41 55,30.5 50,24 Z"
          fill={art.shade}
          opacity=".26"
        />
        {/* Cheek highlight on the lit side — light shape four. */}
        <ellipse cx="41.5" cy="53" rx="5.2" ry="6.5" fill={lite} opacity=".24" />

        {/* Beard. One shape at two opacities: `close` is stubble, `full` is a
            beard, and the geometry does not change between them. */}
        {art.beard !== null && (
          <path
            d="M33,45 C33,60 40.5,70 50,70 C59.5,70 67,60 67,45 C67,55.5 61,60.5 50,60.5 C39,60.5 33,55.5 33,45 Z"
            fill={art.hair}
            opacity={art.beard === 'close' ? 0.4 : 0.88}
          />
        )}

        {/* Fringe, over the forehead and over the face. */}
        {art.fringe === 'sweep' && (
          <path
            d="M32.6,42.5 C32.6,28.5 39.8,22.5 50,22.5 C58.4,22.5 64,25.2 66.8,31 C60.2,27.2 48.2,28.8 41.4,35.2 C37.6,38.6 34.4,43.4 33.4,46.4 C32.8,45.4 32.6,44 32.6,42.5 Z"
            fill={art.hair}
          />
        )}
        {art.fringe === 'straight' && (
          <path
            d="M32.6,41 C32.6,28.5 39.6,22.5 50,22.5 C60.4,22.5 67.4,28.5 67.4,41 C67.4,34.5 60.5,31.2 50,31.2 C39.5,31.2 32.6,34.5 32.6,41 Z"
            fill={art.hair}
          />
        )}

        {/* The hair highlight arc, which is what stops the hair reading as a
            helmet. Omitted only for `receding`, which has no crown to catch
            the light. */}
        {art.style !== 'receding' && (
          <path
            d="M36,32 C39,26.4 44.4,23.6 50,23.6 C55,23.6 59.2,25.2 61.8,28.2 C57.4,26.4 52.2,26.6 47.6,28.4 C42.8,30.3 38.6,31.4 36,32 Z"
            fill={hairLite}
            opacity=".3"
          />
        )}

        {/* Brows — filled tapered wedges, heavier at the inner end. Strokes
            read as pencil lines and were half of v1's cartoon tell. */}
        <path d="M37.4,42.8 Q42.4,39.6 47.6,41.9 Q42.6,41.4 38.1,44 Z" fill={hairDark} />
        <path d="M62.6,42.8 Q57.6,39.6 52.4,41.9 Q57.4,41.4 61.9,44 Z" fill={hairDark} />

        {/* Eyes — almond, not round. Six shapes each: socket shadow, almond
            white, iris, pupil, catchlight offset up and left toward the light,
            and a weighted upper lid. The catchlight is the one specular white
            in the face; there is no pure white or pure black anywhere else. */}
        {EYE_CENTRES.map((x) => (
          <Fragment key={x}>
            <ellipse cx={x} cy="46.6" rx="4.4" ry="3.2" fill={art.shade} opacity=".2" />
            <path
              d={`M${x - 3.5},47 Q${x},43.5 ${x + 3.5},47 Q${x},49.9 ${x - 3.5},47 Z`}
              fill="#f0ebe3"
            />
            <circle cx={x} cy="46.9" r="1.95" fill={art.eye} />
            <circle cx={x} cy="46.9" r=".92" fill="#17120f" />
            <circle cx={x - 0.75} cy="46.15" r=".5" fill="#ffffff" opacity=".75" />
            <path
              d={`M${x - 3.7},46.9 Q${x},43.1 ${x + 3.7},46.9`}
              fill="none"
              stroke="#3a2f29"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </Fragment>
        ))}

        {/* Nose — three parts: bridge shadow, tip, nostrils. */}
        <path
          d="M50.2,45 C50.8,50 51.8,53.8 52.8,55.8"
          fill="none"
          stroke={art.shade}
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity=".6"
        />
        <ellipse cx="50" cy="56.2" rx="3.4" ry="1.7" fill={art.shade} opacity=".36" />
        <ellipse cx="47.4" cy="56.4" rx=".85" ry=".6" fill={dark} opacity=".55" />
        <ellipse cx="52.6" cy="56.4" rx=".85" ry=".6" fill={dark} opacity=".55" />

        {/* Mouth — resting, not smiling, plus a lower-lip highlight. A smile
            arc is the other half of the cartoon read v1 was rejected for. */}
        <path
          d="M45.3,61.4 Q50,63.2 54.7,61.4"
          fill="none"
          stroke="#8d5a4d"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <ellipse cx="50" cy="64" rx="4.2" ry="1.7" fill={lite} opacity=".22" />

        {/* Glasses. The lens fill is a near-transparent white so the face
            behind it reads through — it is one flat colour, not a ramp. */}
        {art.glasses === 'rect' && (
          <>
            <g
              fill="rgba(240,246,255,.06)"
              stroke="#cdd4dc"
              strokeWidth="1.3"
              strokeLinejoin="round"
            >
              <rect x="35.6" y="41.6" width="12.8" height="9.6" rx="3" />
              <rect x="51.6" y="41.6" width="12.8" height="9.6" rx="3" />
            </g>
            <path
              d="M48.4,45.4 H51.6 M35.6,44.8 L31,43.8 M64.4,44.8 L69,43.8"
              fill="none"
              stroke="#cdd4dc"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </>
        )}
        {art.glasses === 'round' && (
          <>
            <g fill="rgba(240,246,255,.06)" stroke="#cdd4dc" strokeWidth="1.3">
              <circle cx="42" cy="46.4" r="6.8" />
              <circle cx="58" cy="46.4" r="6.8" />
            </g>
            <path
              d="M48.8,45.6 H51.2 M35.2,45 L31,43.8 M64.8,45 L69,43.8"
              fill="none"
              stroke="#cdd4dc"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Earrings, last, in front of the ears. */}
        {art.earrings && (
          <>
            <circle cx="32.2" cy="53.6" r="1.7" fill="#c9b07c" />
            <circle cx="67.8" cy="53.6" r="1.7" fill="#c9b07c" />
          </>
        )}
      </svg>
    </span>
  )
}
