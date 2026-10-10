import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BoardSnapshot } from '../../../shared/board'
import { BoardView } from './board-view'

const none: BoardSnapshot = { revision: 1, kind: 'none', code: 'board/absent', message: 'board · no sprint status' }
const read: BoardSnapshot = { revision: 2, kind: 'read', epics: [], others: [] }
const failure = { code: 'board/unexpected', message: 'board · unexpected failure' }

const markup = (
  snapshot: BoardSnapshot | null,
  error: typeof failure | null = null,
  ...folder: [string | undefined] | []
): string =>
  renderToStaticMarkup(<BoardView snapshot={snapshot} failure={error} folder={folder.length === 0 ? '_bmad/' : folder[0]} />)

describe('BoardView', () => {
  it('reads `no sprint status` with the watched path beneath, for a snapshot that says none', () => {
    const html = markup(none)

    expect(html).toContain('>no sprint status<')
    expect(html).toContain('>_bmad/implementation-artifacts/sprint-status.yaml<')
    expect(html.indexOf('no sprint status')).toBeLessThan(html.indexOf('sprint-status.yaml'))
  })

  it('names the path under the folder the rail holds', () => {
    expect(markup(none, null, 'docs/out/')).toContain('>docs/out/implementation-artifacts/sprint-status.yaml<')
  })

  it('says the same for a rejected ask, and shows neither the code nor the message', () => {
    const html = markup(null, failure)

    expect(html).toContain('>no sprint status<')
    expect(html).not.toContain('unexpected')
    expect(html).not.toContain('board/')
    expect(markup(none)).not.toContain('absent')
  })

  it('draws no path line while there is no rail snapshot', () => {
    const html = markup(none, null, undefined)

    expect(html).toContain('>no sprint status<')
    expect(html).not.toContain('sprint-status.yaml')
  })

  it('draws nothing before the first snapshot, and nothing for a snapshot that was read', () => {
    expect(markup(null)).toBe('')
    expect(markup(read)).toBe('')
  })

  it('draws no region, control, spinner or live region', () => {
    const html = markup(none)

    expect(html).not.toMatch(/<button|<input|<a |role=|aria-|<h\d|<ul|<table|loading|spinner|skeleton/i)
  })
})
