import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import { CastStrip } from './cast-strip'

const mary: AgentView = { id: 'bmad-agent-analyst', module: 'bmm', name: 'Mary', title: 'Analyst', icon: 'i', description: 'd' }
const john: AgentView = { id: 'bmad-agent-pm', module: 'bmm', name: 'John', title: 'Product Manager', icon: 'p', description: 'd' }

const render = (cast: readonly string[], speaker: string | undefined): string =>
  renderToStaticMarkup(<CastStrip agents={[mary, john]} cast={cast} speaker={speaker} />)

describe('CastStrip', () => {
  it('has one card per cast id, in cast order, each with a name, title and status', () => {
    const markup = render([john.id, mary.id], undefined)

    expect(markup.match(/class="cast-card/g)).toHaveLength(2)
    expect(markup.indexOf('John')).toBeLessThan(markup.indexOf('Mary'))
    expect(markup).toContain('Analyst')
    expect(markup).toContain('Product Manager')
    expect(markup.match(/in the room/g)).toHaveLength(2)
  })

  it('lights the speaker alone, with the equaliser as three aria-hidden bars', () => {
    const markup = render([mary.id, john.id], john.id)

    expect(markup.match(/cast-card--speaking/g)).toHaveLength(1)
    expect(markup.match(/speaking</g)).toHaveLength(1)
    expect(markup.match(/class="cast-eq-bar"/g)).toHaveLength(3)
    expect(markup).toContain('class="cast-eq" aria-hidden="true"')
    expect(markup.match(/in the room/g)).toHaveLength(1)
  })

  it('lights no card and draws no equaliser when no one is speaking, and every card stays', () => {
    const markup = render([mary.id, john.id], undefined)

    expect(markup).not.toContain('cast-card--speaking')
    expect(markup).not.toContain('cast-eq')
    expect(markup.match(/class="cast-card"/g)).toHaveLength(2)
  })

  it('does not announce: no live region, no role', () => {
    const markup = render([mary.id], mary.id)

    expect(markup).not.toMatch(/aria-l[i]ve|role=/)
  })

  it('keeps a persona the roster no longer names, under its id', () => {
    expect(render(['gone-agent'], undefined)).toContain('gone-agent')
  })
})
