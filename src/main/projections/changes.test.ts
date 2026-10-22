import { describe, expect, it, vi } from 'vitest'

import type { ChangesBody, ChangesSnapshot } from '../../shared/changes'
import { bodyOf, createChangesProjection } from './changes'
import type { ChangesTimers } from './changes'

/** Timers held by hand: `fire()` runs what is due, in order. */
function manualTimers() {
  const due: { callback: () => void; ms: number; handle: number }[] = []
  let next = 1
  const timers: ChangesTimers = {
    setTimeout: (callback, ms) => {
      const handle = next++
      due.push({ callback, ms, handle })
      return handle
    },
    clearTimeout: (handle) => {
      const at = due.findIndex((entry) => entry.handle === handle)
      if (at !== -1) {
        due.splice(at, 1)
      }
    }
  }
  return {
    timers,
    due,
    fire() {
      const entry = due.shift()
      entry?.callback()
    }
  }
}

/** Reads answered by hand: each call waits until `answer(body)`. */
function manualReads() {
  const waiting: ((body: ChangesBody) => void)[] = []
  const read = vi.fn(
    () =>
      new Promise<ChangesBody>((resolve) => {
        waiting.push(resolve)
      })
  )
  return {
    read,
    async answer(body: ChangesBody) {
      const resolve = waiting.shift()
      if (resolve === undefined) {
        throw new Error('no read in flight')
      }
      resolve(body)
      await Promise.resolve()
      await Promise.resolve()
    }
  }
}

const LIST: ChangesBody = { kind: 'list', rows: [{ path: 'src/a.ts', state: 'modified' }] }

function setup() {
  const clock = manualTimers()
  const reads = manualReads()
  const pushed: ChangesSnapshot[] = []
  const projection = createChangesProjection({
    projectRoot: '/Users/me/bmad-harness',
    read: reads.read,
    timers: clock.timers,
    onChange: (snapshot) => pushed.push(snapshot)
  })
  return { clock, reads, pushed, projection }
}

describe('the Changes projection', () => {
  it('is reading, rooted at the project folder’s name, until the first answer, and reads nothing until in front', () => {
    const { projection, reads } = setup()
    expect(projection.snapshot()).toEqual({ kind: 'reading', revision: 1, root: 'bmad-harness' })
    expect(reads.read).not.toHaveBeenCalled()
  })

  it('reads at once in front, pushes the first answer, and reads again 2s after each answer', async () => {
    const { projection, reads, pushed, clock } = setup()
    projection.front()
    expect(reads.read).toHaveBeenCalledTimes(1)
    await reads.answer({ kind: 'list', rows: [] })
    expect(pushed).toEqual([{ kind: 'list', rows: [], revision: 2, root: 'bmad-harness' }])
    expect(clock.due.map((entry) => entry.ms)).toEqual([2000])

    clock.fire()
    expect(reads.read).toHaveBeenCalledTimes(2)
    await reads.answer(LIST)
    expect(pushed.at(-1)).toEqual({ ...LIST, revision: 3, root: 'bmad-harness' })
    expect(clock.due).toHaveLength(1)
  })

  it('pushes only when the folded snapshot differs', async () => {
    const { projection, reads, pushed, clock } = setup()
    projection.front()
    await reads.answer(LIST)
    clock.fire()
    await reads.answer({ kind: 'list', rows: [{ path: 'src/a.ts', state: 'modified' }] })
    clock.fire()
    await reads.answer(LIST)
    expect(pushed).toHaveLength(1)
    expect(projection.snapshot().revision).toBe(2)
  })

  it('keeps one read in flight: a second front during a read starts none', async () => {
    const { projection, reads, clock } = setup()
    projection.front()
    projection.front()
    projection.back()
    projection.front()
    expect(reads.read).toHaveBeenCalledTimes(1)
    await reads.answer(LIST)
    expect(clock.due).toHaveLength(1)
  })

  it('lets a read in flight finish on blur, pushes its answer if it differs, and schedules nothing more', async () => {
    const { projection, reads, pushed, clock } = setup()
    projection.front()
    projection.back()
    await reads.answer(LIST)
    expect(pushed).toHaveLength(1)
    expect(clock.due).toEqual([])
    expect(reads.read).toHaveBeenCalledTimes(1)
  })

  it('cancels the next read on blur, and reads at once when the window comes back', async () => {
    const { projection, reads, clock } = setup()
    projection.front()
    await reads.answer(LIST)
    expect(clock.due).toHaveLength(1)
    projection.back()
    expect(clock.due).toEqual([])
    projection.front()
    expect(reads.read).toHaveBeenCalledTimes(2)
  })

  it('pushes nothing and reads nothing more once disposed', async () => {
    const { projection, reads, pushed, clock } = setup()
    projection.front()
    projection.dispose()
    await reads.answer(LIST)
    expect(pushed).toEqual([])
    expect(clock.due).toEqual([])
    projection.front()
    expect(reads.read).toHaveBeenCalledTimes(1)
  })

  it('reads a rejected read as a failed one', async () => {
    const clock = manualTimers()
    const pushed: ChangesSnapshot[] = []
    const projection = createChangesProjection({
      projectRoot: '/p',
      read: () => Promise.reject(new Error('boom')),
      timers: clock.timers,
      onChange: (snapshot) => pushed.push(snapshot)
    })
    projection.front()
    await vi.waitFor(() => expect(pushed).toHaveLength(1))
    expect(pushed[0]).toMatchObject({ kind: 'failed', reason: 'unexpected output' })
  })
})

describe('bodyOf', () => {
  it('folds the source’s answer into the snapshot’s body', () => {
    expect(bodyOf({ kind: 'not-repo' })).toEqual({ kind: 'not-repo' })
    expect(bodyOf({ kind: 'no-git' })).toEqual({ kind: 'no-git' })
    expect(bodyOf({ kind: 'failed', reason: 'git exit 128' })).toEqual({ kind: 'failed', reason: 'git exit 128' })
    expect(bodyOf({ kind: 'output', stdout: '' })).toEqual({ kind: 'list', rows: [] })
    expect(bodyOf({ kind: 'output', stdout: '? a\0' })).toEqual({
      kind: 'list',
      rows: [{ path: 'a', state: 'untracked' }]
    })
    expect(bodyOf({ kind: 'output', stdout: '3 nonsense\0' })).toEqual({ kind: 'failed', reason: 'unexpected output' })
  })
})
