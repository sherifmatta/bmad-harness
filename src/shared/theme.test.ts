import { describe, expect, it, vi } from 'vitest'

import { THEME_CHANGED_CHANNEL, THEME_STATE_CHANNEL } from './channels'
import { THEME_CHOICES, followTheme, isThemeChoice, readThemeState } from './theme'
import type { ObserveDocument, ThemeDocument, ThemeIpc } from './theme'

type Listener = (event: unknown, state: unknown) => void

/** A fake `ipcRenderer`: answers the state request and keeps what listens for the push. */
function fakeIpc(reply: unknown) {
  const listeners = new Map<string, Listener>()
  const asked: string[] = []
  const ipc: ThemeIpc = {
    sendSync: (channel) => {
      asked.push(channel)
      if (reply instanceof Error) {
        throw reply
      }
      return reply
    },
    on: (channel, listener) => {
      listeners.set(channel, listener)
    }
  }
  return { ipc, asked, push: (state: unknown) => listeners.get(THEME_CHANGED_CHANNEL)?.({}, state), listeners }
}

/** A document with a root, or without one until `attach` is called. */
function fakeDocument(withRoot: boolean) {
  const written: [string, string][] = []
  const root = { setAttribute: (name: string, value: string) => written.push([name, value]) }
  const document: { documentElement: typeof root | null } = { documentElement: withRoot ? root : null }
  return {
    document: document as ThemeDocument,
    written,
    attach: () => {
      document.documentElement = root
    }
  }
}

describe('the three words', () => {
  it('are system, light and dark, in that order', () => {
    expect([...THEME_CHOICES]).toEqual(['system', 'light', 'dark'])
  })

  it('are all a choice is, whoever it came from', () => {
    for (const word of THEME_CHOICES) {
      expect(isThemeChoice(word)).toBe(true)
    }
    for (const other of ['', 'Light', 'sepia', 'high-contrast', 1, null, undefined, {}, ['light']]) {
      expect(isThemeChoice(other)).toBe(false)
    }
  })

  it('make a state with what they resolve to, and nothing else is one', () => {
    expect(readThemeState({ choice: 'system', applied: 'dark' })).toEqual({ choice: 'system', applied: 'dark' })
    expect(readThemeState({ choice: 'light', applied: 'light', extra: 1 })).toEqual({ choice: 'light', applied: 'light' })
    for (const other of [null, undefined, 'dark', {}, { choice: 'system' }, { choice: 'system', applied: 'system' }, { choice: 'sepia', applied: 'dark' }]) {
      expect(readThemeState(other)).toBeNull()
    }
  })
})

describe('following the theme', () => {
  it('asks main for the state once, synchronously, on the one state channel, and writes data-theme at once when there is a root', () => {
    const { ipc, asked } = fakeIpc({ choice: 'system', applied: 'light' })
    const { document, written } = fakeDocument(true)

    followTheme(ipc, document)

    expect(asked).toEqual([THEME_STATE_CHANNEL])
    expect(written).toEqual([['data-theme', 'light']])
  })

  it('repaints on every push and nothing else, and ignores anything that is not a state', () => {
    const { ipc, push } = fakeIpc({ choice: 'system', applied: 'dark' })
    const { document, written } = fakeDocument(true)
    followTheme(ipc, document)
    written.length = 0

    push({ choice: 'light', applied: 'light' })
    push({ choice: 'system', applied: 'dark' })
    push({ choice: 'sepia', applied: 'sepia' })
    push(undefined)

    expect(written).toEqual([['data-theme', 'light'], ['data-theme', 'dark']])
  })

  it('waits for the root when the document has none, and writes it the moment it appears, before any frame', () => {
    const { ipc } = fakeIpc({ choice: 'light', applied: 'light' })
    const fake = fakeDocument(false)
    let ready: (() => boolean) | null = null
    const observe: ObserveDocument = (_document, callback) => {
      ready = callback
    }

    followTheme(ipc, fake.document, observe)
    expect(fake.written).toEqual([])
    expect(ready).not.toBeNull()

    // A mutation with still no root: not done.
    expect(ready!()).toBe(false)
    fake.attach()
    expect(ready!()).toBe(true)
    expect(fake.written).toEqual([['data-theme', 'light']])
  })

  it('paints a push that arrives before the root, once the root is there', () => {
    const { ipc, push } = fakeIpc({ choice: 'system', applied: 'dark' })
    const fake = fakeDocument(false)
    let ready: (() => boolean) | null = null
    followTheme(ipc, fake.document, (_document, callback) => {
      ready = callback
    })

    push({ choice: 'light', applied: 'light' })
    fake.attach()
    ready!()

    expect(fake.written).toEqual([['data-theme', 'light']])
  })

  it('does not observe when the root is already there', () => {
    const { ipc } = fakeIpc({ choice: 'system', applied: 'dark' })
    const observe = vi.fn()

    followTheme(ipc, fakeDocument(true).document, observe)

    expect(observe).not.toHaveBeenCalled()
  })

  it('leaves the window as its stylesheet has it, dark, when main cannot answer, and still follows pushes', () => {
    for (const reply of [new Error('no handler'), undefined, 'not a state']) {
      const { ipc, push } = fakeIpc(reply)
      const { document, written } = fakeDocument(true)

      expect(() => followTheme(ipc, document)).not.toThrow()
      expect(written).toEqual([])

      push({ choice: 'light', applied: 'light' })
      expect(written).toEqual([['data-theme', 'light']])
    }
  })

  it('writes the attribute the light block is keyed on and no other', () => {
    const { ipc, push } = fakeIpc({ choice: 'dark', applied: 'dark' })
    const { document, written } = fakeDocument(true)
    followTheme(ipc, document)
    push({ choice: 'light', applied: 'light' })

    expect(new Set(written.map(([name]) => name))).toEqual(new Set(['data-theme']))
  })
})
