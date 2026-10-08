import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunCardSnapshot } from '../shared/conversation'
import type { ContractEvent } from '../shared/events'
import type { ArtifactObservation, RailSnapshot } from '../shared/rail'
import { foldRunCard, startCard } from './fold/run-card'
import type { FolderView, OutputFolderHandle } from './output-folder-model'

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
  folder: string
  awaiting: string | undefined
  /** What the watcher tells when the folder is removed or the awaited one arrives. */
  folderChanged: (() => void) | undefined
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
    watch: ({ projectRoot, folder, awaiting, onFolderChange, onObservation, onError }) => {
      if (watchThrows !== null) {
        throw watchThrows
      }
      let finish: () => void = () => {}
      const ready = new Promise<void>((resolve) => (finish = resolve))
      const watcher: FakeWatcher = {
        root: projectRoot,
        folder,
        awaiting,
        folderChanged: onFolderChange,
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

describe('the output folder (Story 5.4)', () => {
  /** A window's output folder that the test moves by hand. */
  function folderHandle(initial?: FolderView) {
    let view = initial
    const heard = new Set<(view: FolderView) => void>()
    const refreshes: number[] = []
    const handle: OutputFolderHandle = {
      view: () => view,
      refresh: async () => {
        refreshes.push(1)
        view ??= { folder: '_bmad/' }
        return view
      },
      subscribe: (listener) => {
        heard.add(listener)
        return () => void heard.delete(listener)
      },
      hasChoice: () => view?.chosen !== undefined
    }
    return {
      handle,
      refreshes,
      listeners: heard,
      move(next: FolderView) {
        view = next
        for (const listener of [...heard]) listener(next)
      }
    }
  }

  const DOCS = 'docs/out/'
  const inDocs = (name: string): ArtifactObservation => found(`${DOCS}${name}`)

  let folder: ReturnType<typeof folderHandle>

  function registerWith(initial?: FolderView): void {
    folder = folderHandle(initial)
    handlers.clear()
    registerRailBridge({
      projectPathFor: (id) => (id < 100 ? `/project-${id}` : undefined),
      outputFolder: () => folder.handle,
      watch: ({ projectRoot, folder: watched, awaiting, onFolderChange, onObservation, onError }) => {
        let finish: () => void = () => {}
        const ready = new Promise<void>((resolve) => (finish = resolve))
        const watcher: FakeWatcher = {
          root: projectRoot,
          folder: watched,
          awaiting,
          folderChanged: onFolderChange,
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
  }

  async function openAt(initial: FolderView): Promise<FakeSender> {
    registerWith(initial)
    const sender = new FakeSender(1)
    const first = ask(sender)
    watchers[0].finishScan()
    await first
    return sender
  }

  const settle = async (): Promise<void> => void (await vi.advanceTimersByTimeAsync(0))
  /** The window’s folder moves, and what follows it has had its turn. */
  const move = async (next: FolderView): Promise<void> => {
    folder.move(next)
    await settle()
  }

  it('watches the folder the window’s output folder names, and the first snapshot carries it with what is said of it', async () => {
    scanRows = [inDocs('prd.md')]
    registerWith({ folder: DOCS, chosen: DOCS, bmadFolder: '_bmad/', state: 'different' })
    const pending = ask(new FakeSender(1))

    expect(watchers).toHaveLength(1)
    expect(watchers[0]).toMatchObject({ root: '/project-1', folder: DOCS, awaiting: undefined })
    watchers[0].finishScan()
    const reply = (await pending) as { ok: true; snapshot: RailSnapshot }

    expect(reply.snapshot).toMatchObject({
      folder: DOCS,
      chosen: DOCS,
      bmadFolder: '_bmad/',
      state: 'different'
    })
    expect(reply.snapshot.rows.map((row) => row.path)).toEqual(['docs/out/prd.md'])
  })

  it('resolves the folder before it watches, when the window’s has not been resolved yet', async () => {
    registerWith(undefined)
    const pending = ask(new FakeSender(1))

    expect(watchers).toHaveLength(0)
    await settle()
    expect(folder.refreshes).toHaveLength(1)
    expect(watchers).toHaveLength(1)
    expect(watchers[0].folder).toBe('_bmad/')
    watchers[0].finishScan()
    expect(await pending).toMatchObject({ ok: true, snapshot: { folder: '_bmad/' } })
  })

  it('hands the watcher a folder to wait for, and resolves the folder again when the watcher says it changed', async () => {
    await openAt({ folder: '_bmad/', chosen: DOCS, state: 'missing', awaiting: DOCS })

    expect(watchers[0].awaiting).toBe(DOCS)
    watchers[0].folderChanged?.()
    expect(folder.refreshes).toHaveLength(1)
  })

  describe('when it moves', () => {
    it('scans the new folder with a watcher of its own and leaves the old rows until the scan is done', async () => {
      const sender = await openAt({ folder: '_bmad/' })
      watchers[0].emit(found('_bmad/old.md'))
      const pushed = sender.railPushes.length
      scanRows = [inDocs('prd.md')]

      await move({ folder: DOCS, chosen: DOCS })

      expect(watchers).toHaveLength(2)
      expect(watchers[1]).toMatchObject({ folder: DOCS, root: '/project-1' })
      expect(sender.railPushes).toHaveLength(pushed)
      expect(watchers[0].closed).toBe(false)
      const reply = (await ask(sender)) as { ok: true; snapshot: RailSnapshot }
      expect(reply.snapshot.rows.map((row) => row.path)).toEqual(['_bmad/old.md'])
    })

    it('swaps in one push that carries the folder, what is said of it and the new rows, at a later revision', async () => {
      const sender = await openAt({ folder: '_bmad/' })
      const before = ((await ask(sender)) as { snapshot: RailSnapshot }).snapshot.revision
      scanRows = [inDocs('prd.md'), inDocs('epics.md')]

      await move({ folder: DOCS, chosen: DOCS, bmadFolder: '_bmad/', state: 'different' })
      watchers[1].finishScan()
      await settle()

      expect(sender.railPushes).toHaveLength(1)
      expect(sender.railPushes[0]).toMatchObject({ folder: DOCS, chosen: DOCS, bmadFolder: '_bmad/', state: 'different' })
      expect(sender.railPushes[0].rows.map((row) => row.path)).toEqual(['docs/out/epics.md', 'docs/out/prd.md'])
      expect(sender.railPushes[0].revision).toBeGreaterThan(before)
      // Nothing of the old folder is kept for a file the rail no longer watches, and the old watcher is gone.
      expect(watchers[0].closed).toBe(true)
      expect(watchers[1].closed).toBe(false)
      expect(((await ask(sender)) as { snapshot: RailSnapshot }).snapshot).toEqual(sender.railPushes[0])
    })

    it('keeps its revision above the last the window was sent, however far the old folder had gone', async () => {
      const sender = await openAt({ folder: '_bmad/' })
      for (let at = 0; at < 3; at += 1) {
        watchers[0].emit({ type: 'artifact:written', path: `_bmad/f${at}.md`, size: 1, mtimeMs: 1_000_000 + at })
      }
      const last = sender.railPushes.at(-1)?.revision ?? 0
      scanRows = []

      await move({ folder: DOCS, chosen: DOCS })
      watchers[1].finishScan()
      await settle()

      expect(sender.railPushes.at(-1)?.revision).toBeGreaterThan(last)
      expect(sender.railPushes.at(-1)).toMatchObject({ folder: DOCS, rows: [] })
    })

    it('keeps pushing from the new folder’s own watcher, and nothing from the old one', async () => {
      const sender = await openAt({ folder: '_bmad/' })
      scanRows = []
      await move({ folder: DOCS, chosen: DOCS })
      watchers[1].finishScan()
      await settle()
      const pushed = sender.railPushes.length

      watchers[0].emit({ type: 'artifact:written', path: '_bmad/late.md', size: 1, mtimeMs: 1_000_000 })
      expect(sender.railPushes).toHaveLength(pushed)

      watchers[1].emit({ type: 'artifact:written', path: 'docs/out/new.md', size: 1, mtimeMs: 1_000_000 })
      expect(sender.railPushes.at(-1)?.rows.map((row) => row.path)).toEqual(['docs/out/new.md'])
    })

    it('raises no note for the persona who owns the rows it shows now: the baseline moves with it', async () => {
      scanRows = [found('_bmad/planning-artifacts/prd.md')]
      const sender = await openAt({ folder: '_bmad/' })
      scanRows = [inDocs('planning-artifacts/prd.md'), inDocs('epics.md')]

      await move({ folder: DOCS, chosen: DOCS })
      watchers[1].finishScan()
      await settle()

      expect(sender.personaStates).toEqual([])
      // And a change to an owned file of the new folder after it is news, as it was before.
      watchers[1].emit({ type: 'artifact:written', path: 'docs/out/planning-artifacts/prd.md', size: 3, mtimeMs: 1_000_000 })
      expect(sender.personaStates).toHaveLength(1)
    })

    it('keeps what a room wrote as the room’s, and tells every annotation held again, on the new rows', async () => {
      const sender = await openAt({ folder: '_bmad/' })
      railAnnotatorFor(sender).roomWrote(['docs/out/party/talk.md'])
      scanRows = [inDocs('party/talk.md'), inDocs('prd.md')]

      await move({ folder: DOCS, chosen: DOCS })
      watchers[1].finishScan()
      await settle()

      const rows = sender.railPushes[0].rows
      expect(rows.find((row) => row.path === 'docs/out/party/talk.md')).toMatchObject({ room: true })
      expect(rows.find((row) => row.path === 'docs/out/prd.md')?.room).toBeUndefined()
    })

    it('does not touch the sessions: nothing is said to the window but the one rail snapshot', async () => {
      const sender = await openAt({ folder: '_bmad/' })
      const sentBefore = sender.sent.length
      scanRows = []

      await move({ folder: DOCS, chosen: DOCS })
      watchers[1].finishScan()
      await settle()

      expect(sender.sent.slice(sentBefore).map(([channel]) => channel)).toEqual([RAIL_CHANGED_CHANNEL])
    })

    it('drops a scan that a newer move has replaced, and swaps in only the newest', async () => {
      const sender = await openAt({ folder: '_bmad/' })
      scanRows = []

      await move({ folder: DOCS, chosen: DOCS })
      await move({ folder: 'other/', chosen: 'other/' })

      expect(watchers).toHaveLength(3)
      expect(watchers[1].closed).toBe(true)
      watchers[1].finishScan()
      watchers[2].finishScan()
      await settle()

      expect(sender.railPushes).toHaveLength(1)
      expect(sender.railPushes[0].folder).toBe('other/')
      expect(watchers[0].closed).toBe(true)
      expect(watchers[2].closed).toBe(false)
    })

    it('drops a scan when the folder returns to the one watched before it is done, and starts nothing again', async () => {
      const sender = await openAt({ folder: '_bmad/' })

      await move({ folder: DOCS, chosen: DOCS })
      await move({ folder: '_bmad/' })
      watchers[1].finishScan()
      await settle()

      expect(watchers).toHaveLength(2)
      expect(watchers[1].closed).toBe(true)
      expect(watchers[0].closed).toBe(false)
      expect(sender.railPushes.every((snapshot) => snapshot.folder === '_bmad/')).toBe(true)
    })

    it('starts a new scan when only the folder awaited changes, and not when only what is said does', async () => {
      const sender = await openAt({ folder: '_bmad/' })

      await move({ folder: '_bmad/', chosen: 'a/', state: 'missing' })
      expect(watchers).toHaveLength(1)
      expect(sender.railPushes.map((snapshot) => [snapshot.chosen, snapshot.state])).toEqual([['a/', 'missing']])

      await move({ folder: '_bmad/', chosen: 'a/', state: 'missing', awaiting: 'a/' })
      expect(watchers).toHaveLength(2)
      expect(watchers[1].awaiting).toBe('a/')
    })
  })

  describe('what is said of the folder, without a move', () => {
    it('pushes a change of it as one snapshot with the rows as they are', async () => {
      scanRows = [found('_bmad/prd.md')]
      const sender = await openAt({ folder: '_bmad/' })

      await move({ folder: '_bmad/', chosen: '_bmad/', bmadFolder: 'docs/out/', state: 'different' })

      expect(watchers).toHaveLength(1)
      expect(sender.railPushes).toHaveLength(1)
      expect(sender.railPushes[0]).toMatchObject({ state: 'different', bmadFolder: 'docs/out/' })
      expect(sender.railPushes[0].rows.map((row) => row.path)).toEqual(['_bmad/prd.md'])
    })

    it('pushes a refusal, and again for the next, and not for a view that says nothing new', async () => {
      const sender = await openAt({ folder: '_bmad/' })

      await move({ folder: '_bmad/', refusal: { reason: 'inside .git', seq: 1 } })
      await move({ folder: '_bmad/', refusal: { reason: 'inside .git', seq: 1 } })
      await move({ folder: '_bmad/', refusal: { reason: 'inside .git', seq: 2 } })
      await move({ folder: '_bmad/' })

      expect(sender.railPushes.map((snapshot) => snapshot.refusal?.seq)).toEqual([1, 2, undefined])
    })
  })

  it('stops following, and closes every watcher it holds, with the window', async () => {
    const sender = await openAt({ folder: '_bmad/' })
    await move({ folder: DOCS, chosen: DOCS })

    sender.destroy()

    expect(watchers.every((watcher) => watcher.closed)).toBe(true)
    expect(folder.listeners.size).toBe(0)
    watchers[1].finishScan()
    await settle()
    expect(sender.railPushes).toEqual([])
  })

  it('answers rail/unexpected when the folder cannot be resolved, keeps no service, and starts again on the next ask', async () => {
    registerWith(undefined)
    let failing = true
    const refresh = folder.handle.refresh
    folder.handle.refresh = async () => {
      if (failing) throw new RangeError('/secret/path')
      return refresh()
    }
    const sender = new FakeSender(1)

    const reply = await ask(sender)
    expect(reply).toEqual({
      ok: false,
      error: { code: 'rail/unexpected', message: 'rail · unexpected failure', detail: 'RangeError' }
    })
    expect(JSON.stringify(reply)).not.toContain('secret')
    expect(watchers).toEqual([])
    expect(folder.listeners.size).toBe(0)

    failing = false
    const again = ask(sender)
    await settle()
    watchers[0].finishScan()
    expect(await again).toMatchObject({ ok: true, snapshot: { folder: '_bmad/' } })
  })

  it('starts nothing when the window is destroyed while the folder is still being resolved', async () => {
    registerWith(undefined)
    let resolveFolder: (view: FolderView) => void = () => {}
    folder.handle.refresh = () => new Promise<FolderView>((resolve) => void (resolveFolder = resolve))
    const sender = new FakeSender(1)

    const pending = ask(sender)
    sender.destroy()
    resolveFolder({ folder: '_bmad/' })
    await settle()

    expect(watchers).toEqual([])
    expect(await pending).toMatchObject({ ok: false })
    expect(folder.listeners.size).toBe(0)
  })
})
