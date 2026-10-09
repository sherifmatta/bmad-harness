// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { inAct, renderHook } from '../testing/render-hook'
import { INERT_LAYOUT } from './layout-context'
import { useLayout } from './use-layout'

/**
 * The window's layout as `App` provides it (Story 5.5): asked once from the bridge and read as
 * tolerantly as main reads it, kept through the two named methods, and inert where the bridge has
 * no such method.
 */

type Harness = Record<string, unknown>
const setHarness = (harness: Harness | undefined): void => {
  ;(window as unknown as { harness?: Harness }).harness = harness
}

beforeEach(() => setHarness(undefined))
afterEach(() => setHarness(undefined))

describe('useLayout', () => {
  it('is the defaults, nothing folded, with no bridge or none of its methods', () => {
    const hook = renderHook(useLayout)

    expect(hook.current.widths).toEqual({ sidebar: null, rail: null, room: null })
    expect([...hook.current.folded]).toEqual([])
    expect(() => hook.current.saveWidth('rail', 400)).not.toThrow()
    hook.unmount()

    setHarness({ getLayout: 'nope' })
    expect(renderHook(useLayout).current.widths).toEqual({ sidebar: null, rail: null, room: null })
  })

  it('asks the bridge once and offers what it was given', () => {
    const getLayout = vi.fn(() => ({ sidebar: 220, rail: 400, room: 300, folded: ['_bmad/', '_bmad/ux/'] }))
    setHarness({ getLayout })

    const hook = renderHook(useLayout)
    inAct(() => hook.current.saveFolded(new Set(['_bmad/'])))

    expect(hook.current.widths).toEqual({ sidebar: 220, rail: 400, room: 300 })
    expect(getLayout).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a width out of range', { sidebar: 12, rail: 12, room: 9999, folded: [] }],
    ['a width that is not an integer', { sidebar: 244.5, rail: 300.5, room: '250', folded: [] }],
    ['the old rail’s widths, now outside the rail’s range, and a sidebar width beyond its own', { sidebar: 560, rail: 560, room: null, folded: [] }],
    ['not an object', 'garbage'],
    ['null', null]
  ])('reads %s as the default, silently', (_name, answer) => {
    setHarness({ getLayout: () => answer })

    expect(renderHook(useLayout).current.widths).toEqual({ sidebar: null, rail: null, room: null })
  })

  it('reads a folded set of the wrong shape as nothing folded, and drops what is not a string', () => {
    setHarness({ getLayout: () => ({ sidebar: null, rail: null, room: null, folded: 'x' }) })
    expect([...renderHook(useLayout).current.folded]).toEqual([])

    setHarness({ getLayout: () => ({ sidebar: null, rail: null, room: null, folded: ['a/', 3, null, 'b/'] }) })
    expect([...renderHook(useLayout).current.folded]).toEqual(['a/', 'b/'])
  })

  it('survives a bridge that throws, as the defaults', () => {
    setHarness({
      getLayout: () => {
        throw new Error('no')
      }
    })

    expect(renderHook(useLayout).current.widths).toEqual({ sidebar: null, rail: null, room: null })
  })

  it('keeps a width through setPanelWidth, with the panel and the width and nothing else', () => {
    const setPanelWidth = vi.fn()
    setHarness({ setPanelWidth })
    const hook = renderHook(useLayout)

    hook.current.saveWidth('room', 280)
    hook.current.saveWidth('rail', null)
    hook.current.saveWidth('sidebar', 260)

    expect(setPanelWidth.mock.calls).toEqual([['room', 280], ['rail', null], ['sidebar', 260]])
  })

  it('keeps the folded set through setFolded, and shows it at once', () => {
    const setFolded = vi.fn()
    setHarness({ getLayout: () => ({ sidebar: null, rail: null, room: null, folded: ['a/'] }), setFolded })
    const hook = renderHook(useLayout)

    inAct(() => hook.current.saveFolded(new Set(['a/', 'b/'])))

    expect(setFolded.mock.calls).toEqual([[['a/', 'b/']]])
    expect([...hook.current.folded]).toEqual(['a/', 'b/'])

    inAct(() => hook.current.saveFolded(new Set()))
    expect(setFolded).toHaveBeenLastCalledWith([])
    expect(hook.current.folded.size).toBe(0)
  })

  it('still shows a fold where the bridge cannot keep it', () => {
    setHarness({})
    const hook = renderHook(useLayout)

    inAct(() => hook.current.saveFolded(new Set(['a/'])))

    expect([...hook.current.folded]).toEqual(['a/'])
  })
})

describe('the inert layout', () => {
  it('is the defaults and keeps nothing, so a shell with no provider still works', () => {
    expect(INERT_LAYOUT.widths).toEqual({ sidebar: null, rail: null, room: null })
    expect(INERT_LAYOUT.folded.size).toBe(0)
    expect(() => {
      INERT_LAYOUT.saveWidth('rail', 400)
      INERT_LAYOUT.saveFolded(new Set(['x/']))
    }).not.toThrow()
  })
})
