// @vitest-environment jsdom
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import { AgentsPanel } from '../board/board-agents-panel'
import { CastChooser } from '../party/cast-chooser'
import { CastStrip } from '../party/cast-strip'
import { ThreadIntro } from '../shell/thread-intro'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { Team } from '../team/team'
import { Lanes } from '../welcome/lanes'

/**
 * Story 7.7 (FR136, UX-DR55): every person on every surface that draws one is
 * the same neutral initials disc, and nothing else. The Team tile, the party
 * cast card, the Welcome card, the cast chooser, the Agents-panel row and the
 * empty thread's introduction are mounted for real, and what each draws for a
 * person is read for the one class, the one size and no style, persona-specific
 * class, colour, image or `<svg>`.
 */

const CORE: AgentView[] = [
  ['bmad-agent-analyst', 'Mary', 'Business Analyst'],
  ['bmad-agent-pm', 'John', 'Product Manager'],
  ['bmad-agent-ux-designer', 'Sally', 'UX Designer'],
  ['bmad-agent-architect', 'Winston', 'System Architect'],
  ['bmad-agent-dev', 'Amelia', 'Senior Software Engineer']
].map(([id, name, title]) => ({ id, module: 'bmm', name, title, icon: '🎨', description: 'what they do' }))

const LETTERS = ['M', 'J', 'S', 'W', 'A']

let mounted: Mounted | null = null

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

function drawn(element: ReactElement): HTMLElement {
  mounted = mount(element)
  return mounted.container
}

const surfaces: [string, () => ReactElement, number][] = [
  [
    'the Team tile',
    () => createElement(Team, { agents: CORE, menus: {}, states: new Map(), currentId: null, onSelect: () => {} }),
    5
  ],
  ['the cast card', () => createElement(CastStrip, { agents: CORE, cast: CORE.map(({ id }) => id), speaker: CORE[0].id }), 5],
  ['the Welcome card', () => createElement(Lanes), 5],
  ['the cast chooser', () => createElement(CastChooser, { agents: CORE, onOpen: () => {} }), 5],
  [
    'the Agents-panel row',
    () => createElement(AgentsPanel, { rows: CORE.map((agent) => ({ agent, state: 'idle' as const })) }),
    5
  ],
  ['the introduction of an empty thread', () => createElement(ThreadIntro, { agent: CORE[0], items: [] }), 1]
]

describe.each(surfaces)('%s', (_name, element, count) => {
  it('draws each person as one 26px initials disc, letters M J S W A, and no image', () => {
    const container = drawn(element())
    const discs = [...container.querySelectorAll<HTMLElement>('.initials')]

    expect(discs).toHaveLength(count)
    expect(discs.map((disc) => disc.textContent)).toEqual(LETTERS.slice(0, count))
    for (const disc of discs) {
      expect(disc.className).toBe('initials initials--thread')
      expect(disc.getAttribute('aria-hidden')).toBe('true')
      expect(disc.hasAttribute('style')).toBe(false)
      expect(disc.hasAttribute('tabindex')).toBe(false)
      expect(disc.hasAttribute('role')).toBe(false)
      expect(disc.children).toHaveLength(0)
    }
    // Nothing else on the surface is a picture of anyone.
    expect(container.querySelectorAll('svg, img, picture, canvas, [style], [class*="portrait"]')).toHaveLength(0)
  })

  it('never draws the roster’s icon', () => {
    expect(drawn(element()).textContent).not.toContain('🎨')
  })
})

describe('a disc is neutral', () => {
  it('takes no class that names a persona, and no colour of its own', () => {
    const container = drawn(createElement(CastStrip, { agents: CORE, cast: CORE.map(({ id }) => id), speaker: undefined }))

    for (const disc of container.querySelectorAll<HTMLElement>('.initials')) {
      expect([...disc.classList].filter((name) => /bmad|agent|analyst|pm|architect|dev|ux/i.test(name))).toEqual([])
    }
  })
})
