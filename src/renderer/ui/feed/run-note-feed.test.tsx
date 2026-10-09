import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import uxMemlog from '../../../../_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/.memlog.md?raw'
// The named fixture holds 36 entries; the acceptance criterion asks for a feed
// of forty or more, and this is the only memlog in the repository that has
// them. Rendering it is the difference between the criterion being met and
// being nearly met.
import brainstormMemlog from '../../../../_bmad/brainstorming/brainstorm-bmad-visual-harness-2026-09-22/.memlog.md?raw'
import { RunNoteFeed } from './run-note-feed'
import { parseMemlog } from './memlog'
import type { RunNote } from './memlog'

/**
 * What the feed actually renders, asserted against the markup rather than
 * against the source text that produces it.
 *
 * This is the first `.test.tsx` in the repository, and it is here rather than
 * in `tests/` for a reason that is structural, not stylistic: `tests/` is
 * typechecked by `tsconfig.node.json`, which sets no `jsx`, so a `.tsx` there
 * would be typechecked by nothing and could not be imported by the node
 * program either. Under `src/renderer/` it is collected by the same Vitest
 * glob and typechecked by `tsconfig.web.json`, which does set `jsx`.
 *
 * `renderToStaticMarkup` is not a new dependency and not a DOM: it is the
 * already-pinned `react-dom`'s node entry, it returns a string, and it touches
 * no `document`. Story 1.9 owns the decision about jsdom, and nothing here
 * pre-empts it.
 *
 * The memlog arrives through `?raw` rather than through `node:fs`, because
 * this file is in the web program and `node:fs` has no types there. It is the
 * same file the acceptance criteria name, read at run time either way.
 */

/** One note, with only the fields a given assertion is about spelled out. */
function note(fields: Partial<RunNote> = {}): RunNote {
  return { kind: null, author: null, time: null, reason: '', ...fields }
}

function render(notes: RunNote[]): string {
  return renderToStaticMarkup(<RunNoteFeed notes={notes} />)
}

/**
 * The rows of a rendered feed, each as its own inner markup. A row contains
 * only spans and a `strong`, never a nested `div`, and any `</div>` inside a
 * reason is escaped by React before it gets here — so the close is
 * unambiguous without parsing HTML.
 */
function rows(markup: string): string[] {
  return markup
    .split('<div class="run-note">')
    .slice(1)
    .map((row) => row.slice(0, row.indexOf('</div>')))
}

/** A row's three grid children, in order, as `[class, inner text]` pairs. */
function children(row: string): [string, string][] {
  return [...row.matchAll(/<span class="([^"]*)">([\s\S]*?)<\/span>/g)]
    .filter(([, className]) => className.startsWith('run-note-'))
    .map(([, className, inner]) => [className, inner])
}

const uxNotes = parseMemlog(uxMemlog)
const brainstormNotes = parseMemlog(brainstormMemlog)

/** The writer's own definition of an entry, so counts come off the file. */
function entryCount(text: string): number {
  return text.split('\n').filter((line) => line.startsWith('- ')).length
}

describe('the rendered feed', () => {
  it('renders the real memlog as one row per entry, in file order', () => {
    // The first acceptance criterion, end to end: the file the story names,
    // parsed and rendered, with nothing constructed in between.
    const rendered = rows(render(uxNotes))

    // Counted off the file rather than transcribed: these memlogs are live
    // artifacts a later BMad run appends to, and a hard 36 would redden on the
    // next append rather than on a defect.
    expect(uxNotes).toHaveLength(entryCount(uxMemlog))
    expect(rendered).toHaveLength(uxNotes.length)
    expect(children(rendered[0])[2][1]).toContain('Sources bound:')
    // Not the last row: a later update to the spines appends after the finalization event.
    expect(rendered.map((row) => children(row)[2][1])).toContain('spines finalized')
  })

  it('renders a feed of forty or more entries, one row each', () => {
    const rendered = rows(render(brainstormNotes))

    expect(brainstormNotes.length).toBeGreaterThanOrEqual(40)
    expect(rendered).toHaveLength(brainstormNotes.length)
    for (const row of rendered) {
      expect(children(row)).toHaveLength(3)
    }
    // This is also the only file carrying `(kind by author)`, so it is the one
    // that proves an authored entry renders its kind and not its attribution.
    const authored = brainstormNotes.filter((note) => note.author !== null)
    expect(authored.length).toBeGreaterThan(0)
    for (const row of rows(render(authored))) {
      // The chip carries the kind alone. A reason may legitimately say "by
      // user" in its own prose, so the claim is about this cell, not the row.
      expect(children(row)[1][1]).not.toContain(' by ')
    }
  })

  it('emits three grid children in every row, whatever the note carries', () => {
    for (const row of rows(render(uxNotes))) {
      const cells = children(row)

      expect(cells).toHaveLength(3)
      expect(cells[0][0]).toBe('run-note-time')
      expect(cells[1][0]).toMatch(/^run-note-kind /)
      expect(cells[2][0]).toBe('run-note-reason')
    }
  })

  it('leaves the time cell present and empty rather than absent', () => {
    // The case no mockup has drawn: every mockup row carries a timestamp, and
    // every note read from a file carries none. Without the empty cell the
    // grid loses a column and the kind tag slides left.
    for (const row of rows(render(uxNotes))) {
      expect(children(row)[0]).toEqual(['run-note-time', ''])
    }
  })

  it('carries the treatment each kind maps to, fallback included', () => {
    const treatments = [
      ['decision', 'accent'],
      ['assumption', 'neutral'],
      ['question', 'friction'],
      ['gap', 'friction'],
      // Real kinds outside the four named ones, and the untagged entry.
      ['moment', 'neutral'],
      ['idea', 'neutral'],
      ['insight', 'neutral'],
      [null, 'neutral']
    ] as const

    for (const [kind, treatment] of treatments) {
      const [row] = rows(render([note({ kind })]))

      expect(children(row)[1][0], String(kind)).toBe(
        `run-note-kind run-note-kind--${treatment}`
      )
    }
  })

  it('prints the kind as written, with no prefix and no uppercasing', () => {
    // `kind:decision` is DESIGN.md's notation, not the tag's text — `note`
    // also names a colour token, which is why the prose spells them that way.
    // And uppercase is confined to five surfaces, none of them this tag.
    const [row] = rows(render([note({ kind: 'decision' })]))

    expect(children(row)[1][1]).toBe('decision')
  })

  it('emphasises exactly the marked span, and nothing around it', () => {
    const [row] = rows(render([note({ reason: 'a **b** c' })]))

    expect(children(row)[2][1]).toBe('a <strong>b</strong> c')
  })

  it('leaves an unmatched marker as literal text', () => {
    const [row] = rows(render([note({ reason: 'a ** b' })]))

    expect(children(row)[2][1]).toBe('a ** b')
  })

  it('escapes project content rather than interpreting it', () => {
    // A memlog is project content, and project content is untrusted the moment
    // it is rendered. The spans are React children, so this is escaping by
    // construction rather than by a sanitizer that can be bypassed.
    const [row] = rows(render([note({ reason: '<script>alert(1)</script> & "quoted"' })]))

    expect(children(row)[2][1]).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;'
    )
  })

  it('renders an empty reason as an empty cell rather than dropping the row', () => {
    // `memlog.py` permits `--text ""`, so this is a writable entry.
    const rendered = rows(render([note({ kind: 'decision' }), note({ kind: 'event' })]))

    expect(rendered).toHaveLength(2)
    for (const row of rendered) {
      expect(children(row)).toHaveLength(3)
      expect(children(row)[2][1]).toBe('')
    }
  })

  it('renders an empty feed as nothing at all, without failing', () => {
    expect(rows(render([]))).toEqual([])
    expect(render([])).toBe('<div class="run-note-feed"></div>')
  })
})
