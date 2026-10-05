import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunCardSnapshot } from '../shared/conversation'
import type { ContractEvent } from '../shared/events'
import type { ArtifactObservation, RailSnapshot } from '../shared/rail'
import { foldRunCard, startCard } from './fold/run-card'

type Handler = (event: { sender: FakeSender }) => Promise<unknown>

const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))

const { RAIL_CHANGED_CHANNEL, RAIL_GET_CHANNEL, registerRailBridge } = await import('./rail-bridge')
const { SESSION_EVENT_CHANNEL } = await import('./persona-states')
const { railAnnotatorFor } = await import('./rail-annotations')

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

describe('the stream’s annotations in the rows (Story 3.6)', () => {
  const PRD = '_bmad/planning-artifacts/prd.md'
  const JOHN = 'bmad-agent-pm'

  /** A run's events, handed to the window's annotator as the session side hands them: with the run's card. */
  function stream(sender: FakeSender): { say: (event: ContractEvent) => void } {
    let card: RunCardSnapshot | undefined
    return {
      say(event) {
        if (event.name === 'run:started') card = startCard(event.payload)
        else if (card !== undefined && 'runId' in event.payload) card = foldRunCard(card, event)
        railAnnotatorFor(sender).apply(event, card)
      }
    }
  }
  const started: ContractEvent = { name: 'run:started', payload: { runId: 'r1', sessionId: 's1', agentId: JOHN, code: 'CP', at: 1 } }
  const piece = (text: string, path = PRD): ContractEvent => ({
    name: 'doc:prose',
    payload: { runId: 'r1', sessionId: 's1', callId: 'c1', path, text, at: 2 }
  })
  const finished: ContractEvent = { name: 'run:finished', payload: { runId: 'r1', sessionId: 's1', at: 9 } }

  async function open(rows: string[] = []): Promise<FakeSender> {
    scanRows = rows.map(found)
    const sender = new FakeSender(1)
    const first = ask(sender)
    watchers[0].finishScan()
    await first
    return sender
  }
  const lastRow = (sender: FakeSender) => sender.railPushes.at(-1)?.rows[0]

  it('makes no row for a path the stream names first, and the row the watcher then makes carries the annotation', async () => {
    const sender = await open()
    const { say } = stream(sender)
    say(started)
    say(piece('## 1. Vision\nA.\n## 2. Goals\nB.\n'))

    expect(sender.railPushes).toEqual([])

    watchers[0].emit({ type: 'artifact:written', path: PRD, size: 9, mtimeMs: 1_000_000 })

    expect(lastRow(sender)).toEqual({
      path: PRD,
      owner: { agentId: JOHN },
      state: 'changing',
      annotation: { text: 'writing · §2 Goals', owner: { agentId: JOHN } }
    })
  })

  it('decorates an existing saved row as the stream speaks, leaving the watcher’s state and age alone', async () => {
    const sender = await open([PRD])
    const { say } = stream(sender)
    say(started)
    say(piece('## Context\nA.\n'))

    expect(sender.railPushes).toHaveLength(1)
    expect(lastRow(sender)).toEqual({
      path: PRD,
      owner: { agentId: JOHN },
      state: 'saved',
      savedAt: 100,
      annotation: { text: 'writing · §1 Context', owner: { agentId: JOHN } }
    })
  })

  it('drops the annotation when the run ends, leaving the row exactly what the watcher says', async () => {
    const sender = await open()
    watchers[0].emit({ type: 'artifact:written', path: PRD, size: 9, mtimeMs: 1_000_000 })
    const { say } = stream(sender)
    say(started)
    say(piece('## Vision\nA.\n'))
    expect(lastRow(sender)?.annotation?.text).toBe('writing · §1 Vision')

    say(finished)

    expect(lastRow(sender)).toEqual({ path: PRD, owner: { agentId: JOHN }, state: 'changing' })
    expect(Object.keys(lastRow(sender) ?? {})).not.toContain('annotation')
    // The stream could not say saved: only the settle timer does.
    await vi.advanceTimersByTimeAsync(400)
    expect(lastRow(sender)).toEqual({ path: PRD, owner: { agentId: JOHN }, state: 'saved', savedAt: 1_000_000 })
  })

  it('gives a reloaded window the rows with their annotations, the stream having spoken since', async () => {
    const sender = await open([PRD])
    const { say } = stream(sender)
    say(started)
    say(piece('## Vision\nA.\n## Goals\nB.\n'))

    const reply = (await ask(sender)) as { ok: true; snapshot: RailSnapshot }

    expect(reply.snapshot.rows[0].annotation).toEqual({ text: 'writing · §2 Goals', owner: { agentId: JOHN } })
    expect(reply.snapshot).toEqual(sender.railPushes.at(-1))
  })

  it('tells what the session side held before the rail was asked for, once the rail is', async () => {
    const sender = new FakeSender(1)
    const { say } = stream(sender)
    say(started)
    say(piece('## Vision\nA.\n'))
    scanRows = [found(PRD)]
    const first = ask(sender)
    watchers[0].finishScan()
    const reply = (await first) as { ok: true; snapshot: RailSnapshot }

    expect(reply.snapshot.rows[0].annotation?.text).toBe('writing · §1 Vision')
  })

  it('says a path again after the watcher removes it and makes it again', async () => {
    const sender = await open([PRD])
    const { say } = stream(sender)
    say(started)
    say(piece('## Vision\nA.\n'))

    watchers[0].emit({ type: 'artifact:removed', path: PRD, size: 0, mtimeMs: 1_000_000 })
    expect(sender.railPushes.at(-1)?.rows).toEqual([])
    say(piece('## Goals\nB.\n'))
    expect(sender.railPushes.at(-1)?.rows).toEqual([])

    watchers[0].emit({ type: 'artifact:written', path: PRD, size: 9, mtimeMs: 1_000_000 })
    expect(lastRow(sender)?.annotation?.text).toBe('writing · §2 Goals')
  })

  it('gives a file nobody in the harness is writing no annotation, and reads it as saved after the settle', async () => {
    const sender = await open()
    const { say } = stream(sender)
    say(started)
    say(piece('## Vision\nA.\n'))

    watchers[0].emit({ type: 'artifact:written', path: '_bmad/planning-artifacts/architecture.md', size: 9, mtimeMs: 1_000_000 })
    expect(lastRow(sender)).toMatchObject({ state: 'changing' })
    expect(Object.keys(lastRow(sender) ?? {})).not.toContain('annotation')

    await vi.advanceTimersByTimeAsync(400)
    expect(lastRow(sender)).toMatchObject({ state: 'saved' })
    expect(Object.keys(lastRow(sender) ?? {})).not.toContain('annotation')
  })

  it('raises no note for the persona whose own run is annotating: an annotation is no change to the file', async () => {
    const sender = await open([PRD])
    const { say } = stream(sender)
    say(started)
    say(piece('## Vision\nA.\n'))
    say(finished)

    expect(sender.personaStates).toEqual([])
  })

  it('keeps each window’s annotations apart', async () => {
    const one = await open([PRD])
    const two = new FakeSender(2)
    const second = ask(two)
    watchers[1].finishScan()
    await second
    const { say } = stream(one)
    say(started)
    say(piece('## Vision\nA.\n'))

    expect(one.railPushes).toHaveLength(1)
    expect(two.railPushes).toEqual([])
  })
})
