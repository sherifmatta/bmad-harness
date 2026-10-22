import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangesBody, ChangesReply, ChangesSnapshot } from '../shared/changes'

type Handler = (event: { sender: FakeSender }) => unknown

const handlers = new Map<string, Handler>()

const fromWebContents = vi.fn<(sender: unknown) => unknown>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: (sender: unknown) => fromWebContents(sender) }
}))

import type { ChangesBridgeDeps, FrontListeners } from './changes-bridge'
import { changeRowsOf } from './changes-model'

const { CHANGES_CHANGED_CHANNEL, CHANGES_GET_CHANNEL, registerChangesBridge } = await import('./changes-bridge')

/** Every sender a test made, destroyed after it so no window's remembered rows reach the next test. */
const created: FakeSender[] = []

class FakeSender {
  sent: [string, ChangesSnapshot][] = []
  destroyed = false
  destroyedListeners: (() => void)[] = []
  constructor(readonly id: number) {
    created.push(this)
  }
  send(channel: string, snapshot: ChangesSnapshot) {
    this.sent.push([channel, snapshot])
  }
  isDestroyed() {
    return this.destroyed
  }
  once(_event: 'destroyed', listener: () => void) {
    this.destroyedListeners.push(listener)
  }
  destroy() {
    this.destroyed = true
    this.destroyedListeners.forEach((listener) => listener())
  }
}

const LIST: ChangesBody = {
  kind: 'list',
  rows: [
    { path: 'src/a.ts', state: 'modified' },
    { path: 'gone.ts', state: 'deleted' }
  ]
}

let reads: string[]
let answer: ChangesBody
let fronts: { listeners: FrontListeners; subscribed: boolean }[]
let diagnostics: string[]

function register(extra: Partial<ChangesBridgeDeps> = {}): void {
  handlers.clear()
  registerChangesBridge({
    projectPathFor: (id) => (id < 100 ? `/projects/project-${id}` : undefined),
    read: async (root) => {
      reads.push(root)
      return answer
    },
    subscribeFront: (_sender, listeners) => {
      const entry = { listeners, subscribed: true }
      fronts.push(entry)
      return () => void (entry.subscribed = false)
    },
    timers: { setTimeout: () => 0, clearTimeout: () => {} },
    writeDiagnostic: (line) => diagnostics.push(line),
    ...extra
  })
}

beforeEach(() => {
  reads = []
  answer = LIST
  fronts = []
  diagnostics = []
  fromWebContents.mockReset()
  register()
})

afterEach(() => {
  for (const sender of created.splice(0)) {
    if (!sender.destroyed) {
      sender.destroy()
    }
  }
})

const ask = (sender: FakeSender) => handlers.get(CHANGES_GET_CHANNEL)?.({ sender }) as ChangesReply

describe('changes:get', () => {
  it('speaks the two channels the preload names', () => {
    expect(CHANGES_GET_CHANNEL).toBe('changes:get')
    expect(CHANGES_CHANGED_CHANNEL).toBe('changes:changed')
  })

  it('answers a window with no project with the no-project envelope, and builds nothing', () => {
    const reply = ask(new FakeSender(500))
    expect(reply).toEqual({
      ok: false,
      error: { code: 'changes/no-project', message: 'changes · no project is open for this window' }
    })
    expect(fronts).toEqual([])
  })

  it('answers reading at first, rooted at the project folder’s name, and reads nothing while in the background', () => {
    const reply = ask(new FakeSender(1))
    expect(reply).toEqual({ ok: true, snapshot: { kind: 'reading', revision: 1, root: 'project-1' } })
    expect(reads).toEqual([])
  })

  it('reads when the window comes to the front and pushes the answer on changes:changed', async () => {
    const sender = new FakeSender(1)
    ask(sender)
    fronts[0]!.listeners.onFront()
    await vi.waitFor(() => expect(sender.sent).toHaveLength(1))
    expect(reads).toEqual(['/projects/project-1'])
    expect(sender.sent[0]).toEqual([CHANGES_CHANGED_CHANNEL, { ...LIST, revision: 2, root: 'project-1' }])
    expect(ask(sender)).toEqual({ ok: true, snapshot: { ...LIST, revision: 2, root: 'project-1' } })
  })

  it('builds one service per window, however often it asks', () => {
    const sender = new FakeSender(1)
    ask(sender)
    ask(sender)
    expect(fronts).toHaveLength(1)
  })

  it('remembers the rows for the document bridge, and forgets them, unsubscribing, when the window goes', async () => {
    const sender = new FakeSender(3)
    ask(sender)
    expect(changeRowsOf(3)).toBeNull()
    fronts[0]!.listeners.onFront()
    await vi.waitFor(() => expect(changeRowsOf(3)).toEqual(LIST.kind === 'list' ? LIST.rows : null))
    sender.destroy()
    expect(changeRowsOf(3)).toBeNull()
    expect(fronts[0]!.subscribed).toBe(false)
  })

  it('holds no rows for a window whose snapshot is not a list', async () => {
    answer = { kind: 'not-repo' }
    const sender = new FakeSender(4)
    ask(sender)
    fronts[0]!.listeners.onFront()
    await vi.waitFor(() => expect(sender.sent).toHaveLength(1))
    expect(changeRowsOf(4)).toBeNull()
  })
})

describe('front and back, through the real window', () => {
  class FakeWindow extends EventEmitter {
    destroyed = false
    focused = false
    isDestroyed() {
      return this.destroyed
    }
    isFocused() {
      return this.focused
    }
  }

  beforeEach(() => register({ subscribeFront: undefined }))

  it('reads at once when the window is already focused', async () => {
    const window = new FakeWindow()
    window.focused = true
    fromWebContents.mockReturnValue(window)
    ask(new FakeSender(1))
    await vi.waitFor(() => expect(reads).toHaveLength(1))
  })

  it('reads nothing for a window in the background until it gains focus, and unsubscribes when the sender goes', async () => {
    const window = new FakeWindow()
    fromWebContents.mockReturnValue(window)
    const sender = new FakeSender(1)
    ask(sender)
    expect(reads).toEqual([])
    expect(window.listenerCount('focus')).toBe(1)
    expect(window.listenerCount('blur')).toBe(1)

    window.emit('focus')
    await vi.waitFor(() => expect(reads).toHaveLength(1))

    sender.destroy()
    expect(window.listenerCount('focus')).toBe(0)
    expect(window.listenerCount('blur')).toBe(0)
  })

  it('stops reading on blur: the next read is cancelled and none follows until the window is in front again', async () => {
    const pending = new Map<number, () => void>()
    let next = 1
    register({
      subscribeFront: undefined,
      timers: {
        setTimeout: (callback) => {
          const handle = next++
          pending.set(handle, callback)
          return handle
        },
        clearTimeout: (handle) => void pending.delete(handle as number)
      }
    })
    const window = new FakeWindow()
    fromWebContents.mockReturnValue(window)
    const sender = new FakeSender(1)
    ask(sender)

    window.emit('focus')
    await vi.waitFor(() => expect(sender.sent).toHaveLength(1))
    expect(reads).toHaveLength(1)
    expect(pending.size).toBe(1)

    window.emit('blur')
    expect(pending.size).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toHaveLength(1)

    window.emit('focus')
    await vi.waitFor(() => expect(reads).toHaveLength(2))
  })

  it('gives a sender with no window a subscription that does nothing', () => {
    fromWebContents.mockReturnValue(null)
    const sender = new FakeSender(1)
    expect(ask(sender).ok).toBe(true)
    expect(() => sender.destroy()).not.toThrow()
  })

  it('does not touch a window that is already destroyed when the sender goes', () => {
    const window = new FakeWindow()
    fromWebContents.mockReturnValue(window)
    const removeListener = vi.spyOn(window, 'removeListener')
    const sender = new FakeSender(1)
    ask(sender)
    window.destroyed = true
    sender.destroy()
    expect(removeListener).not.toHaveBeenCalled()
  })
})
