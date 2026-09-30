import { describe, expect, it } from 'vitest'
import type { DocSnapshot } from '../../shared/document'
import { createDocumentProjection } from './document'

function make(options: { refused?: boolean } = {}) {
  const pushed: DocSnapshot[] = []
  const projection = createDocumentProjection({
    path: '_bmad/prd.md',
    fullPath: '/work/falcon/_bmad/prd.md',
    kind: 'markdown',
    onChange: (snapshot) => pushed.push(snapshot),
    ...options
  })
  return { projection, pushed }
}

const present = (text: string, truncated = false) => ({ state: 'present', text, truncated }) as const

describe('the first result', () => {
  it('is the baseline: answered to the first ask, never pushed', async () => {
    const { projection, pushed } = make()
    let ready = false
    void projection.ready().then(() => (ready = true))
    await Promise.resolve()
    expect(ready).toBe(false)

    projection.apply(present('hello'))
    await projection.ready()

    expect(pushed).toEqual([])
    expect(projection.snapshot()).toEqual({
      revision: 1,
      path: '_bmad/prd.md',
      fullPath: '/work/falcon/_bmad/prd.md',
      kind: 'markdown',
      state: 'present',
      text: 'hello',
      truncated: false
    })
  })

  it('may be missing: an empty baseline in the missing state', async () => {
    const { projection, pushed } = make()

    projection.apply({ state: 'missing' })
    await projection.ready()

    expect(pushed).toEqual([])
    expect(projection.snapshot()).toMatchObject({ revision: 1, state: 'missing', text: '' })
  })
})

describe('what follows', () => {
  it('pushes when the text changes, with the revision one higher each time', () => {
    const { projection, pushed } = make()
    projection.apply(present('one'))

    projection.apply(present('two'))
    projection.apply(present('three'))

    expect(pushed.map((s) => [s.revision, s.text])).toEqual([
      [2, 'two'],
      [3, 'three']
    ])
    expect(projection.snapshot().revision).toBe(3)
  })

  it('pushes nothing for a read that changes nothing: a burst is one push per distinct content', () => {
    const { projection, pushed } = make()
    projection.apply(present('a'))

    for (const text of ['b', 'b', 'b', 'c', 'c']) {
      projection.apply(present(text))
    }

    expect(pushed.map((s) => s.text)).toEqual(['b', 'c'])
  })

  it('pushes a change of truncation alone', () => {
    const { projection, pushed } = make()
    projection.apply(present('a'))

    projection.apply(present('a', true))

    expect(pushed).toHaveLength(1)
    expect(pushed[0].truncated).toBe(true)
  })

  it('keeps the last good text through missing, unreadable and binary', () => {
    const { projection, pushed } = make()
    projection.apply(present('good', true))

    for (const state of ['missing', 'unreadable', 'binary'] as const) {
      projection.apply({ state })
      expect(projection.snapshot()).toMatchObject({ state, text: 'good', truncated: true })
    }
    expect(pushed.map((s) => s.state)).toEqual(['missing', 'unreadable', 'binary'])
  })

  it('returns to present with the new text when the file comes back', () => {
    const { projection, pushed } = make()
    projection.apply(present('before'))
    projection.apply({ state: 'missing' })

    projection.apply(present('after'))

    expect(pushed[pushed.length - 1]).toMatchObject({ state: 'present', text: 'after' })
  })

  it('pushes a return to the same text after a missing, because the state differs', () => {
    const { projection, pushed } = make()
    projection.apply(present('same'))
    projection.apply({ state: 'missing' })
    projection.apply(present('same'))

    expect(pushed.map((s) => s.state)).toEqual(['missing', 'present'])
  })

  it('keeps an empty text before any good read, through a failed one', () => {
    const { projection } = make()
    projection.apply({ state: 'unreadable' })

    expect(projection.snapshot()).toMatchObject({ state: 'unreadable', text: '', truncated: false })
  })

  it('stops pushing once disposed', () => {
    const { projection, pushed } = make()
    projection.apply(present('a'))
    projection.dispose()

    projection.apply(present('b'))

    expect(pushed).toEqual([])
    expect(projection.snapshot().text).toBe('a')
  })
})

describe('a document that turns refused while it is watched', () => {
  it('clears the text, turns the state, bumps the revision and pushes like any change', () => {
    const { projection, pushed } = make()
    projection.apply(present('inside text', true))

    projection.apply({ state: 'refused' })

    expect(pushed).toHaveLength(1)
    expect(pushed[0]).toMatchObject({ revision: 2, state: 'refused', text: '', truncated: false })
    expect(projection.snapshot()).toMatchObject({ state: 'refused', text: '' })
  })

  it('pushes nothing for a second refused read, and reads again if the link is mended', () => {
    const { projection, pushed } = make()
    projection.apply(present('a'))
    projection.apply({ state: 'refused' })
    projection.apply({ state: 'refused' })
    expect(pushed).toHaveLength(1)

    projection.apply(present('back'))
    expect(pushed[1]).toMatchObject({ revision: 3, state: 'present', text: 'back' })
  })

  it('may be refused on the very first read, as the baseline', async () => {
    const { projection, pushed } = make()
    projection.apply({ state: 'refused' })
    await projection.ready()

    expect(pushed).toEqual([])
    expect(projection.snapshot()).toMatchObject({ revision: 1, state: 'refused', text: '' })
  })
})

describe('a refused document', () => {
  it('is a snapshot from the start, in the refused state, with no text', async () => {
    const { projection } = make({ refused: true })
    await projection.ready()

    expect(projection.snapshot()).toMatchObject({ revision: 1, state: 'refused', text: '' })
  })

  it('reads nothing: a result applied to it changes nothing and pushes nothing', () => {
    const { projection, pushed } = make({ refused: true })

    projection.apply(present('from /etc/hosts'))

    expect(pushed).toEqual([])
    expect(projection.snapshot()).toMatchObject({ state: 'refused', text: '' })
  })
})
