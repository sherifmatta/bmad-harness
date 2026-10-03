import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractEvent } from '../shared/events'
import type { ArtifactObservation, RailSnapshot } from '../shared/rail'

type Handler = (event: { sender: FakeSender }) => Promise<unknown>

const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))

const { RAIL_CHANGED_CHANNEL, RAIL_GET_CHANNEL, registerRailBridge } = await import('./rail-bridge')
const { SESSION_EVENT_CHANNEL } = await import('./persona-states')

class FakeSender {
  sent: [string, RailSnapshot | ContractEvent][] = []
  destroyed = false
  destroyedListeners: (() => void)[] = []
  constructor(readonly id: number) {}
  send(channel: string, payload: RailSnapshot | ContractEvent) {
    this.sent.push([channel, payload])
  }
  /** The rail pushes only: `persona:state` travels on the session channel and is read apart. */
  get railPushes(): RailSnapshot[] {
    return this.sent.flatMap(([channel, payload]) =>
      channel === RAIL_CHANGED_CHANNEL ? [payload as RailSnapshot] : []
    )
  }
  get personaStates(): ContractEvent[] {
    return this.sent.flatMap(([channel, payload]) =>
      channel === SESSION_EVENT_CHANNEL ? [payload as ContractEvent] : []
    )
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
/** What the session side was told, as `[window id, project root, observation]`. */
let observed: [number, string, ArtifactObservation][]

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
  observed = []
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
    writeDiagnostic: (line) => diagnostics.push(line),
    observeArtifact: (sender, projectRoot, observation) => void observed.push([sender.id, projectRoot, observation])
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
    expect(sender.railPushes.map((snapshot) => snapshot.rows[0].state)).toEqual(['changing'])

    await vi.advanceTimersByTimeAsync(400)

    expect(sender.railPushes.map((snapshot) => snapshot.rows[0].state)).toEqual(['changing', 'saved'])
    expect(sender.railPushes[1].revision).toBeGreaterThan(sender.railPushes[0].revision)
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

describe('persona:state from the rail', () => {
  const PRD = '_bmad/planning-artifacts/prd.md'
  const stateEvents = (sender: FakeSender) =>
    sender.personaStates.map((event) => (event.name === 'persona:state' ? event.payload : event))

  async function openWith(rows: string[]): Promise<FakeSender> {
    scanRows = rows.map(found)
    const sender = new FakeSender(1)
    const first = ask(sender)
    watchers[0].finishScan()
    await first
    return sender
  }

  it('takes the first snapshot as the baseline: files already there raise no note', async () => {
    const sender = await openWith([PRD])

    expect(sender.personaStates).toEqual([])
  })

  it('raises note for the owner when an owned file is written after the baseline', async () => {
    const sender = await openWith([PRD])

    watchers[0].emit({ type: 'artifact:written', path: PRD, size: 9, mtimeMs: 1_000_000 })

    expect(stateEvents(sender)).toEqual([{ agentId: 'bmad-agent-pm', state: 'note', at: 1_000_000 }])
    expect(sender.sent.at(-1)?.[0]).toBe(SESSION_EVENT_CHANNEL)

    await vi.advanceTimersByTimeAsync(400)

    expect(stateEvents(sender)).toHaveLength(1)
  })

  it('raises nothing for a file nobody owns', async () => {
    const sender = await openWith([PRD])

    watchers[0].emit({ type: 'artifact:written', path: '_bmad/x.md', size: 9, mtimeMs: 1_000_000 })

    expect(sender.railPushes).toHaveLength(1)
    expect(sender.personaStates).toEqual([])
  })

  it('raises nothing once the window is destroyed', async () => {
    const sender = await openWith([PRD])
    sender.destroy()

    watchers[0].emit({ type: 'artifact:written', path: PRD, size: 9, mtimeMs: 1 })

    expect(sender.personaStates).toEqual([])
  })
})

describe('the session side’s view of the watcher (Story 3.1)', () => {
  it('is told every observation the rail is, with the window and its project, scan included', async () => {
    const sender = new FakeSender(3)
    scanRows = [found('_bmad/prds/x/.memlog.md')]
    const pending = ask(sender)
    watchers[0].finishScan()
    await pending
    const written: ArtifactObservation = { type: 'artifact:written', path: '_bmad/prds/x/.memlog.md', size: 9, mtimeMs: 200 }
    watchers[0].emit(written)

    expect(observed).toEqual([
      [3, '/project-3', found('_bmad/prds/x/.memlog.md')],
      [3, '/project-3', written]
    ])
  })
})
