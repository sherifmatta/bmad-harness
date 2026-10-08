// @vitest-environment jsdom
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import type { DocSnapshot } from '../../shared/document'
import type { InstallSnapshot } from '../../shared/install'
import { RunCard } from './chat/run-card'
import { createProseStore } from './chat/prose-store'
import type { RunCardEntry, TranscriptEntry } from './chat/transcript-entry'
import { DocWindowView } from './doc/doc-app'
import { PartyView } from './party/party-view'
import { artParamsFor } from './persona/art-params'
import { portrait } from './persona/portrait'
import type { PortraitSize } from './persona/portrait'
import { Shell } from './shell/shell'
import { mount } from './testing/render-hook'
import type { Mounted } from './testing/render-hook'

/**
 * Story 5.2, the audit of what a theme touches: nothing. The shell, a document
 * card, the party view and the document window are mounted under each value of
 * `data-theme` (the one main's state puts on `<html>`), and what they draw is
 * read for a colour spelled in a style of its own. A component that takes every
 * colour from a token is correct in both themes and names neither, so the markup
 * it draws is the same bytes in the dark and the light: the theme is a repaint of
 * what is already there, and never a different page. The tokens themselves are
 * `tests/tokens.test.ts`'s.
 *
 * A failing assertion here is fixed in the product. None may be loosened.
 */

const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

/** A colour as a style would spell it: a hex, or a colour function with no `var()` in it. */
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?![^)]*var\()[^)]*\)/

const NOW = 1_700_000_000_000

/** What one mount under one theme gave: its markup, and every style it carries of its own. */
type Drawn = { markup: string; styles: string[] }

let mounted: Mounted | null = null

afterEach(() => {
  mounted?.unmount()
  mounted = null
  document.documentElement.removeAttribute('data-theme')
})

/** Mount `element` with `<html>` carrying the theme, as the preload leaves a window. */
function under(theme: Theme, element: ReactElement): Drawn {
  document.documentElement.setAttribute('data-theme', theme)
  mounted = mount(element)
  const { container } = mounted
  const styles = [...container.querySelectorAll('[style]')].map((node) => node.getAttribute('style') ?? '')
  const markup = container.innerHTML
  mounted.unmount()
  mounted = null
  document.documentElement.removeAttribute('data-theme')
  return { markup, styles }
}

/** The audit, for one thing drawn: no colour literal in a style of its own, and the same page in both themes. */
function audit(draw: () => ReactElement): void {
  const [dark, light] = THEMES.map((theme) => under(theme, draw()))

  for (const [theme, drawn] of [['dark', dark], ['light', light]] as const) {
    expect(drawn.markup.length, theme).toBeGreaterThan(200)
    expect(drawn.styles.filter((style) => COLOUR_LITERAL.test(style)), `${theme}: a colour literal in a style`).toEqual([])
  }
  // The theme is a repaint: the same markup, byte for byte, in either.
  expect(light.markup).toBe(dark.markup)
  expect(light.styles).toEqual(dark.styles)
}

const agent = (id: string, name: string) => ({ id, module: 'bmm', name, title: 'Role', icon: 'i', description: 'd' })
const MARY = agent('bmad-agent-analyst', 'Mary')
const JOHN = agent('bmad-agent-pm', 'John')
const SNAPSHOT: InstallSnapshot = { revision: 1, agents: [MARY, JOHN], menus: {}, errors: [], preflight: [] }

const RUN: RunCardEntry = {
  kind: 'run',
  id: 'r1',
  at: NOW,
  runId: 'r1',
  sessionId: 's1',
  agentId: MARY.id,
  status: 'running',
  notes: [],
  documents: [{ path: '_bmad/planning-artifacts/prd.md', sections: ['Goals', 'Scope'] }]
}

const DOCUMENT: DocSnapshot = {
  revision: 1,
  path: '_bmad/planning-artifacts/prd.md',
  fullPath: '/work/falcon/_bmad/planning-artifacts/prd.md',
  kind: 'markdown',
  state: 'present',
  text: '# Title\n\nA paragraph with `code`.\n\n## Section\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
  truncated: false
}

const PARTY_ENTRIES: TranscriptEntry[] = [
  { kind: 'sysline', id: 'm-0', at: NOW, text: 'room opened by you · present · Mary · John', room: true },
  { kind: 'user', id: 'u1', at: NOW + 1, text: 'Should the payouts ship first', room: true },
  { kind: 'persona', id: 'p1', at: NOW + 2, agent: MARY, text: 'The data we hold says yes.', room: true },
  { kind: 'persona', id: 'p2', at: NOW + 3, agent: JOHN, text: 'I would hold it back a sprint.', room: true }
]

describe('what the theme changes in what is drawn', () => {
  it('the shell: the same markup under either, and no colour literal in a style of its own', () => {
    audit(() => createElement(Shell, { projectPath: '/work/falcon', snapshot: SNAPSHOT }))
  })

  it('a document card: the same markup under either, and no colour literal in a style of its own', () => {
    audit(() =>
      createElement(RunCard, {
        entry: RUN,
        prose: createProseStore({ raf: () => {} })
      })
    )
  })

  it('the party view: the same markup under either, and no colour literal in a style of its own', () => {
    audit(() =>
      createElement(PartyView, {
        agents: [MARY, JOHN],
        room: 's1',
        roomCast: [MARY.id, JOHN.id],
        speaker: JOHN.id,
        entries: PARTY_ENTRIES,
        topic: 'Should the payouts ship first',
        openedAt: NOW,
        turns: 2,
        rows: [],
        onOpen: () => {},
        onSend: () => {},
        onWriteSummary: () => {},
        onStop: () => {}
      })
    )
  })

  it('the document window: the same markup under either, and no colour literal in a style of its own', () => {
    audit(() =>
      createElement(DocWindowView, {
        snapshot: DOCUMENT,
        failure: null,
        onReveal: () => {},
        onOpenInEditor: () => {},
        onClose: () => {}
      })
    )
  })

  it('a thing drawn with a colour literal in a style is seen: the audit can fail', () => {
    const drawn = under('light', createElement('div', { style: { color: '#10151b' } }, 'x'))

    expect(drawn.styles.filter((style) => COLOUR_LITERAL.test(style))).toHaveLength(1)
    const functional = under('dark', createElement('div', { style: { background: 'rgba(1, 2, 3, .5)' } }, 'x'))
    expect(functional.styles.filter((style) => COLOUR_LITERAL.test(style))).toHaveLength(1)
    const tokened = under('dark', createElement('div', { style: { background: 'var(--panel)' } }, 'x'))
    expect(tokened.styles.filter((style) => COLOUR_LITERAL.test(style))).toEqual([])
  })
})

describe('the portraits', () => {
  const SIZES: PortraitSize[] = [32, 36, 38, 44]
  const IDS = ['bmad-agent-analyst', 'bmad-agent-pm', 'bmad-agent-ux-designer', 'bmad-agent-architect', 'bmad-agent-dev']

  it('are byte-identical under both themes at each of their four sizes: the face is on its own dark backdrop in either', () => {
    for (const id of IDS) {
      for (const size of SIZES) {
        const markupUnder = (theme: Theme): string => {
          document.documentElement.setAttribute('data-theme', theme)
          return renderToStaticMarkup(portrait(artParamsFor(id), size, 'idle', { name: 'Mary', title: 'Analyst' }))
        }

        const dark = markupUnder('dark')
        const light = markupUnder('light')

        expect(light, `${id} at ${size}`).toBe(dark)
        expect(dark).toContain(`width="${size}"`)
      }
    }
  })

  it('take no theme: the parameters hold no theme field and the component reads no document', () => {
    const params = artParamsFor('bmad-agent-analyst')

    expect(Object.keys(params).filter((key) => /theme|scheme|dark|light/i.test(key))).toEqual([])
    expect(portrait.length).toBe(4)
  })
})
