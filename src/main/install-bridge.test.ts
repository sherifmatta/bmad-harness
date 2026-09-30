import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstallSnapshot } from '../shared/install'
import type { InstallSource } from './sources/install/resolvers'
import type { PrerequisiteChecks } from './sources/preflight/tools'

type Handler = (event: { sender: FakeSender }) => Promise<unknown>

const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))

const { INSTALL_CHANGED_CHANNEL, INSTALL_GET_CHANNEL, registerInstallBridge } = await import(
  './install-bridge'
)

class FakeSender {
  sent: [string, InstallSnapshot][] = []
  destroyed = false
  destroyedListeners: (() => void)[] = []
  constructor(readonly id: number) {}
  send(channel: string, snapshot: InstallSnapshot) {
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

const mary = {
  id: 'bmad-agent-analyst',
  module: 'bmm',
  name: 'Mary',
  title: 'Analyst',
  icon: 'i',
  description: 'd'
}

let rosterCalls: number
let roster: () => Promise<Awaited<ReturnType<InstallSource['resolveRoster']>>>
let sourcesCreated: string[]
let watchers: { onChange: () => void; closed: boolean }[]
let watchThrows: Error | null
let diagnostics: string[]
let checksCreated: number
let uvCheck: Awaited<ReturnType<PrerequisiteChecks['checkUv']>>

beforeEach(() => {
  handlers.clear()
  rosterCalls = 0
  sourcesCreated = []
  watchers = []
  watchThrows = null
  diagnostics = []
  checksCreated = 0
  uvCheck = { ok: true }
  roster = async () => ({ ok: true, agents: [mary] })
  registerInstallBridge({
    projectPathFor: (id) => (id < 100 ? `/project-${id}` : undefined),
    createSource: (projectRoot) => {
      sourcesCreated.push(projectRoot)
      return {
        resolveRoster: () => {
          rosterCalls += 1
          return roster()
        },
        resolveMenu: async () => ({ ok: true, entries: [], problems: [] })
      }
    },
    createChecks: () => {
      checksCreated += 1
      return { checkClaude: async () => ({ ok: true }), checkUv: async () => uvCheck }
    },
    watch: ({ onChange }) => {
      if (watchThrows !== null) {
        throw watchThrows
      }
      const watcher = { onChange, closed: false }
      watchers.push(watcher)
      return { ready: Promise.resolve(), close: async () => void (watcher.closed = true) }
    },
    writeDiagnostic: (line) => diagnostics.push(line)
  })
})

const ask = (sender: FakeSender) => handlers.get(INSTALL_GET_CHANNEL)?.({ sender })

describe('install:get', () => {
  it('answers an unknown window with the no-project envelope and builds nothing', async () => {
    const reply = await ask(new FakeSender(500))

    expect(reply).toEqual({
      ok: false,
      error: { code: 'install/no-project', message: 'install · no project is open for this window' }
    })
    expect(sourcesCreated).toEqual([])
    expect(watchers).toEqual([])
  })

  it('resolves the first snapshot for the sender’s own project', async () => {
    const reply = (await ask(new FakeSender(1))) as { ok: true; snapshot: InstallSnapshot }

    expect(reply.ok).toBe(true)
    expect(reply.snapshot.agents).toEqual([mary])
    expect(sourcesCreated).toEqual(['/project-1'])
  })

  it('does not build the checks until the first install:get, then builds them once per sender', async () => {
    expect(checksCreated).toBe(0)
    const sender = new FakeSender(1)

    await ask(sender)
    await ask(sender)

    expect(checksCreated).toBe(1)
  })

  it('carries a failing tool in the reply’s preflight, and runs no roster resolver', async () => {
    uvCheck = { ok: false, kind: 'uv-missing', diagnostic: 'uv python find · spawn ENOENT' }

    const reply = (await ask(new FakeSender(1))) as { ok: true; snapshot: InstallSnapshot }

    expect(reply.snapshot.preflight).toEqual([
      { code: 'preflight/uv-missing', message: 'uv · not found · install uv' }
    ])
    expect(rosterCalls).toBe(0)
    expect(diagnostics).toEqual(['preflight/uv-missing · uv python find · spawn ENOENT'])
    expect(JSON.stringify(reply)).not.toContain('ENOENT')
  })

  it('builds one projection and one watcher per sender across repeated asks', async () => {
    const sender = new FakeSender(1)

    await ask(sender)
    await ask(sender)
    await ask(sender)

    expect(sourcesCreated).toHaveLength(1)
    expect(watchers).toHaveLength(1)
    expect(rosterCalls).toBe(1)
  })

  it('keeps senders apart', async () => {
    await ask(new FakeSender(1))
    await ask(new FakeSender(2))

    expect(sourcesCreated).toEqual(['/project-1', '/project-2'])
  })

  it('pushes a snapshot on install:changed when the watcher fires and the view changed', async () => {
    const sender = new FakeSender(1)
    await ask(sender)
    sender.sent.length = 0

    roster = async () => ({ ok: true, agents: [mary, { ...mary, id: 'bmad-agent-pm', name: 'John' }] })
    watchers[0].onChange()
    await vi.waitFor(() => expect(sender.sent).toHaveLength(1))

    expect(sender.sent[0][0]).toBe(INSTALL_CHANGED_CHANNEL)
    expect(sender.sent[0][1].agents.map((a) => a.name)).toEqual(['Mary', 'John'])
  })

  it('does not send to a destroyed sender', async () => {
    const sender = new FakeSender(1)
    await ask(sender)
    sender.sent.length = 0

    sender.destroyed = true
    roster = async () => ({ ok: true, agents: [] })
    watchers[0].onChange()
    await vi.waitFor(() => expect(rosterCalls).toBe(2))
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(sender.sent).toEqual([])
  })

  it('disposes the projection and closes the watcher when the sender is destroyed', async () => {
    const sender = new FakeSender(1)
    await ask(sender)

    sender.destroy()

    expect(watchers[0].closed).toBe(true)
    watchers[0].onChange()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(rosterCalls).toBe(1)
  })

  it('writes a developer line for a failure and never puts it in the reply', async () => {
    roster = async () => ({
      ok: false,
      failure: { kind: 'invocation-failed', detail: 'exit 1', diagnostic: 'resolve_config.py · exit 1' }
    })

    const reply = (await ask(new FakeSender(1))) as { ok: true; snapshot: InstallSnapshot }

    expect(diagnostics).toEqual(['resolver/invocation-failed · resolve_config.py · exit 1'])
    expect(JSON.stringify(reply)).not.toContain('resolve_config')
  })

  it('writes the cause of an unexpected failure to the developer line, and only the class name to the reply', async () => {
    watchThrows = new TypeError('/private/place exploded')

    const reply = await ask(new FakeSender(1))

    expect(reply).toEqual({
      ok: false,
      error: {
        code: 'install/unexpected',
        message: 'install · unexpected failure',
        detail: 'TypeError'
      }
    })
    expect(diagnostics).toEqual(['install/unexpected · /private/place exploded'])
    expect(JSON.stringify(reply)).not.toContain('private')
  })
})
