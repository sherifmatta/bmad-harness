import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InstallSnapshot } from '../../../shared/install'
import { Preflight } from './preflight'

const NO_AGENTS =
  'no agents · looked for agents in this project, under --setting-sources project,local · a bmad install scoped to the user rather than the project resolves none there · install bmad into this project, or open one that has it'

const snapshot: InstallSnapshot = {
  revision: 1,
  agents: [],
  menus: {},
  errors: [{ code: 'resolver/timeout', message: 'roster · resolver timed out', detail: 'exceeded 15000ms' }],
  preflight: [
    { code: 'preflight/claude-missing', message: 'claude · not on path · install the claude cli' },
    {
      code: 'preflight/uv-python-old',
      message: 'uv · resolves no python 3.11 or newer · install a 3.11+ toolchain for uv',
      detail: 'python 3.9.6'
    },
    { code: 'preflight/no-agents', message: NO_AGENTS }
  ],
  skills: []
}

const failure = { code: 'install/unexpected', message: 'install · unexpected failure', detail: 'TypeError' }

describe('Preflight', () => {
  it('lists preflight, then errors, then the failure', () => {
    const markup = renderToStaticMarkup(<Preflight snapshot={snapshot} failure={failure} />)
    const at = (text: string): number => markup.indexOf(text)

    expect(at('claude · not on path')).toBeGreaterThan(-1)
    expect(at('claude · not on path')).toBeLessThan(at('uv · resolves no python'))
    expect(at('uv · resolves no python')).toBeLessThan(at('no agents ·'))
    expect(at('no agents ·')).toBeLessThan(at('roster · resolver timed out'))
    expect(at('roster · resolver timed out')).toBeLessThan(at('install · unexpected failure'))
  })

  it('shows the whole no-agents message verbatim, outside any disclosure', () => {
    const markup = renderToStaticMarkup(<Preflight snapshot={snapshot} failure={null} />)
    const outside = markup.replace(/<details[\s\S]*?<\/details>/g, '')

    expect(outside).toContain(NO_AGENTS)
  })

  it('puts detail only inside a disclosure', () => {
    const markup = renderToStaticMarkup(<Preflight snapshot={snapshot} failure={failure} />)
    const outside = markup.replace(/<details[\s\S]*?<\/details>/g, '')

    for (const detail of ['python 3.9.6', 'exceeded 15000ms', 'TypeError']) {
      expect(markup).toContain(detail)
      expect(outside).not.toContain(detail)
    }
  })

  it('draws only the failure when there is no snapshot', () => {
    const markup = renderToStaticMarkup(<Preflight snapshot={null} failure={failure} />)

    expect(markup).toContain('install · unexpected failure')
    expect(markup).not.toContain('preflight')
  })

  it('carries no role, live region, style, button, link or input', () => {
    const markup = renderToStaticMarkup(<Preflight snapshot={snapshot} failure={failure} />)

    // The live-region attribute is spelled in two halves so this file does not
    // itself count as a second live region in the source sweep.
    const live = ['aria', 'live'].join('-')
    for (const forbidden of ['role=', live, 'style=', '<button', '<a ', '<input']) {
      expect(markup, forbidden).not.toContain(forbidden)
    }
  })
})
