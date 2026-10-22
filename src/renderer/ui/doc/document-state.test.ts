import { describe, expect, it, vi } from 'vitest'
import type { DocSnapshot } from '../../../shared/document'
import {
  acceptDocument,
  announcementFor,
  connectDocument,
  failureMessage
} from './document-state'
import type { DocumentBridge } from './document-state'

const snapshot = (revision: number, text = ''): DocSnapshot => ({
  revision,
  path: '_bmad/a.md',
  fullPath: '/p/_bmad/a.md',
  kind: 'markdown',
  folder: '_bmad/',
  state: 'present',
  text,
  truncated: false
})

describe('acceptDocument', () => {
  it('takes the first snapshot, and any with a higher revision', () => {
    expect(acceptDocument(null, snapshot(1))).toEqual(snapshot(1))
    expect(acceptDocument(snapshot(1), snapshot(2)).revision).toBe(2)
  })

  it('refuses a late push: an equal or lower revision loses', () => {
    const held = snapshot(3, 'held')

    expect(acceptDocument(held, snapshot(2, 'late'))).toBe(held)
    expect(acceptDocument(held, snapshot(3, 'same'))).toBe(held)
  })
})

describe('failureMessage', () => {
  it('reads the message of the envelope', () => {
    expect(
      failureMessage({ code: 'doc/no-document', message: 'doc · no document is open for this window' })
    ).toBe('doc · no document is open for this window')
  })

  it('names anything else as a bridge fault, and never stringifies it', () => {
    for (const reason of [new Error('secret stack'), 'text', null, undefined, { message: 'no code' }]) {
      expect(failureMessage(reason)).toBe('bridge · unexpected failure')
    }
  })
})

describe('connectDocument', () => {
  function bridge(get: () => Promise<DocSnapshot>) {
    let push: (snapshot: DocSnapshot) => void = () => {}
    const unsubscribe = vi.fn()
    const events: string[] = []
    const fake: DocumentBridge = {
      getDocument: () => {
        events.push('get')
        return get()
      },
      onDocumentChanged: (listener) => {
        events.push('subscribe')
        push = listener
        return unsubscribe
      }
    }
    return { fake, push: (s: DocSnapshot) => push(s), unsubscribe, events }
  }

  it('subscribes before it asks, so a push between the two is not lost', () => {
    const { fake, events } = bridge(() => new Promise(() => {}))
    connectDocument(fake, { onSnapshot: () => {}, onFailure: () => {} })

    expect(events).toEqual(['subscribe', 'get'])
  })

  it('hands on the snapshot it was asked for and every one pushed', async () => {
    const { fake, push } = bridge(() => Promise.resolve(snapshot(1)))
    const seen: number[] = []
    connectDocument(fake, { onSnapshot: (s) => seen.push(s.revision), onFailure: () => {} })

    push(snapshot(2))
    await Promise.resolve()
    await Promise.resolve()

    expect(seen).toEqual([2, 1])
  })

  it('routes a rejection to onFailure as a message', async () => {
    const { fake } = bridge(() => Promise.reject({ code: 'doc/no-document', message: 'doc · none' }))
    const failures: string[] = []
    connectDocument(fake, { onSnapshot: () => {}, onFailure: (m) => failures.push(m) })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(failures).toEqual(['doc · none'])
  })

  it('unsubscribes on disconnect and drops what is still in flight', async () => {
    let resolve: (s: DocSnapshot) => void = () => {}
    const { fake, push, unsubscribe } = bridge(() => new Promise((r) => (resolve = r)))
    const seen: number[] = []
    const disconnect = connectDocument(fake, { onSnapshot: (s) => seen.push(s.revision), onFailure: () => {} })

    disconnect()
    resolve(snapshot(1))
    push(snapshot(2))
    await Promise.resolve()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([])
  })
})

describe('announcementFor', () => {
  it.each([
    ['missing', 'no longer on disk'],
    ['unreadable', 'could not be read'],
    ['binary', 'not shown · binary']
  ] as const)('speaks the transition into %s, with the state line', (state, line) => {
    expect(announcementFor('present', state)).toBe(line)
    expect(announcementFor(null, state)).toBe(line)
  })

  it('says nothing for staying in a state, for leaving one, or for present and refused', () => {
    expect(announcementFor('missing', 'missing')).toBeNull()
    expect(announcementFor('missing', 'present')).toBeNull()
    expect(announcementFor(null, 'present')).toBeNull()
    expect(announcementFor('present', 'refused')).toBeNull()
    expect(announcementFor(null, 'refused')).toBeNull()
  })

  it('speaks again after a return and a second removal', () => {
    expect(announcementFor('present', 'missing')).not.toBeNull()
    expect(announcementFor('missing', 'unreadable')).toBe('could not be read')
  })
})
