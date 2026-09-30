import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArtifactObservation, RailSnapshot } from '../shared/rail'

type Handler = (event: { sender: FakeSender }) => Promise<unknown>

const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))

const { RAIL_CHANGED_CHANNEL, RAIL_GET_CHANNEL, registerRailBridge } = await import('./rail-bridge')

class FakeSender {
  sent: [string, RailSnapshot][] = []
  destroyed = false
  destroyedListeners: (() => void)[] = []
  constructor(readonly id: number) {}
  send(channel: string, snapshot: RailSnapshot) {
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

type FakeWatcher = {
  root: string
  emit: (observation: ArtifactObservation) => void
  fail: (error: unknown) => void
  finishScan: () => void
  closed: boolean
}

let watchers: FakeWatcher[]
let watchThrows: Error | null
let diagnostics: string[]
let scanRows: ArtifactObservation[]

const found = (path: string): ArtifactObservation => ({
  type: 'artifact:found',
  path,
  size: 5,
  mtimeMs: 100
})

beforeEach(() => {
  handlers.clear()
  watchers = []
  watchThrows = null
  diagnostics = []
  scanRows = []
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  registerRailBridge({
    projectPathFor: (id) => (id < 100 ? `/project-${id}` : undefined),
    watch: ({ projectRoot, onObservation, onError }) => {
      if (watchThrows !== null) {
        throw watchThrows
      }
      let finish: () => void = () => {}
      const ready = new Promise<void>((resolve) => (finish = resolve))
      const watcher: FakeWatcher = {
        root: projectRoot,
        emit: onObservation,
        fail: onError,
        finishScan: () => {
          scanRows.forEach(onObservation)
          finish()
        },
        closed: false
      }
      watchers.push(watcher)
      return { ready, close: async () => void (watcher.closed = true) }
    },
    writeDiagnostic: (line) => diagnostics.push(line)
  })
})

const ask = (sender: FakeSender) => handlers.get(RAIL_GET_CHANNEL)?.({ sender })

describe('rail:get', () => {
  it('answers an unknown window with the no-project envelope and builds nothing', async () => {
    const reply = await ask(new FakeSender(500))

    expect(reply).toEqual({
      ok: false,
      error: { code: 'rail/no-project', message: 'rail · no project is open for this window' }
    })
    expect(watchers).toEqual([])
  })

  it('waits for the initial scan, then answers with the rows it found', async () => {
    scanRows = [found('_bmad/planning-artifacts/prd.md'), found('_bmad/epics.md')]
    const pending = ask(new FakeSender(1))
    let settled = false
    void pending?.then(() => (settled = true))

    await vi.advanceTimersByTimeAsync(10)
    expect(settled).toBe(false)

    watchers[0].finishScan()
    const reply = (await pending) as { ok: true; snapshot: RailSnapshot }

    expect(reply.ok).toBe(true)
    expect(reply.snapshot.rows.map((row) => row.path)).toEqual([
      '_bmad/epics.md',
      '_bmad/planning-artifacts/prd.md'
    ])
    expect(reply.snapshot.rows[1].owner).toEqual({ agentId: 'bmad-agent-pm' })
    expect(watchers[0].root).toBe('/project-1')
  })

  it('builds one service per window and reuses it on a second ask', async () => {
    const sender = new FakeSender(1)
    const first = ask(sender)
    watchers[0].finishScan()
    await first
    await ask(sender)

    expect(watchers).toHaveLength(1)
  })

  it('keeps each window’s service apart', async () => {
    const one = ask(new FakeSender(1))
    const two = ask(new FakeSender(2))
    watchers.forEach((watcher) => watcher.finishScan())
    await Promise.all([one, two])

    expect(watchers.map((watcher) => watcher.root)).toEqual(['/project-1', '/project-2'])
  })

  it('answers rail/unexpected with the class name only when the watcher cannot be built', async () => {
    watchThrows = new RangeError('/secret/path exploded')

    const reply = await ask(new FakeSender(1))

    expect(reply).toEqual({
      ok: false,
      error: { code: 'rail/unexpected', message: 'rail · unexpected failure', detail: 'RangeError' }
    })
    expect(JSON.stringify(reply)).not.toContain('secret')
    expect(diagnostics).toEqual(['rail/unexpected · /secret/path exploded'])
  })
})

describe('rail:changed', () => {
  async function open(): Promise<FakeSender> {
    const sender = new FakeSender(1)
    const first = ask(sender)
    watchers[0].finishScan()
    await first
    return sender
  }

  it('pushes the rows to the window as they change: changing, then saved', async () => {
    const sender = await open()

    watchers[0].emit({ type: 'artifact:written', path: '_bmad/x.md', size: 3, mtimeMs: 1_000_000 })
    expect(sender.sent.map(([channel, snapshot]) => [channel, snapshot.rows[0].state])).toEqual([
      [RAIL_CHANGED_CHANNEL, 'changing']
    ])

    await vi.advanceTimersByTimeAsync(400)

    expect(sender.sent.map(([, snapshot]) => snapshot.rows[0].state)).toEqual(['changing', 'saved'])
    expect(sender.sent[1][1].revision).toBeGreaterThan(sender.sent[0][1].revision)
  })

  it('writes a watcher error to the diagnostic line and throws nothing', async () => {
    const sender = await open()

    expect(() => watchers[0].fail(new Error('EMFILE: too many open files'))).not.toThrow()

    expect(diagnostics).toEqual(['rail/watch · EMFILE: too many open files'])
    expect(sender.sent).toEqual([])
  })

  it('stops the projection and closes the watcher when the window is destroyed', async () => {
    const sender = await open()

    sender.destroy()
    expect(watchers[0].closed).toBe(true)
    watchers[0].emit({ type: 'artifact:written', path: '_bmad/x.md', size: 3, mtimeMs: 1 })
    await vi.advanceTimersByTimeAsync(1000)

    expect(sender.sent).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('builds a fresh service for a window id that comes back after destruction', async () => {
    const sender = await open()
    sender.destroy()

    const again = ask(new FakeSender(1))
    watchers[1].finishScan()
    await again

    expect(watchers).toHaveLength(2)
  })
})
