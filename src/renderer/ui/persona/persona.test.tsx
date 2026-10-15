import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Initials, initialsOf } from './initials'

/**
 * What the initials disc actually renders, asserted against the markup rather
 * than against the source text that produces it.
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
 * The stylesheet sweeps and the run-time couplings to DESIGN.md are
 * `tests/initials.test.ts`'s. The discs on the surfaces that draw one are
 * `discs.dom.test.tsx`'s. This file is only about what one disc emits.
 */

describe('the class names the stylesheets hang on', () => {
  // Nothing else pins these. Renaming one is a one-character edit that leaves
  // the suite, lint and typecheck green while the reveal ships unstyled.
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
