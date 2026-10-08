import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { ContractEvent } from '../src/shared/events'
import type { AgentView } from '../src/shared/install'
import { foldEvent, hydrate, initialConversation, withHandoff } from '../src/renderer/ui/chat/conversation-state'
import { EMPTY_TRANSCRIPT, foldPersonaSaid, foldSysline, foldUserTurn } from '../src/main/fold/transcript'
import type { ConversationReply } from '../src/shared/conversation'
import type { SpawnOutcome, SpawnSessionOptions } from '../src/main/sources/session/session-process'

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null }
}))

const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { transcriptFilePath, writeTranscript } = await import('../src/main/sources/persistence/transcript-file')
const {
  CONVERSATION_END_CHANNEL,
  CONVERSATION_GET_CHANNEL,
  SESSION_CLOSE_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL,
  registerSessionBridge
} = await import('../src/main/session-bridge')

/**
 * Story 2.7's persistence, asserted from the two folds and the sources. The
 * behaviour is held by the unit tests beside each module; what only a contract
 * test can show is that main's transcript and the window's agree on what was
 * said, and that nothing is written, or stored, anywhere it should not be.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '')

const shipping = filesUnder(SRC).filter(
  (path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts')
)
const rel = (path: string): string => relative(ROOT, path)

const mary: AgentView = {
  id: 'bmad-agent-analyst',
  module: 'bmm',
  name: 'Mary',
  title: 'Analyst',
  icon: 'i',
  description: 'd'
}
const agentOf = (id: string): AgentView | undefined => (id === mary.id ? mary : undefined)

const said = (agentId: string | undefined, messageId: string, text: string, at: number): ContractEvent => ({
  name: 'persona:said',
  payload: { sessionId: 's1', ...(agentId === undefined ? {} : { agentId }), messageId, text, at }
})

describe('the transcript main keeps and the one the window folds', () => {
  const sequence: ContractEvent[] = [
    said(mary.id, 'msg_1', ' Hel', 10),
    said(mary.id, 'msg_1', 'lo, ', 11),
    said(undefined, 'room', 'not a persona’s own', 12),
    said(mary.id, 'msg_1', 'there\n\n', 13),
    said(mary.id, 'msg_2', 'A second message', 14),
    said('bmad-agent-pm', 'msg_3', 'Another persona', 15),
    said(mary.id, 'msg_2', ' continued?', 16)
  ]

  it('hold the same messages, with the same ids from the model, the same text and the same times', () => {
    let main = EMPTY_TRANSCRIPT
    let window = initialConversation
    for (const event of sequence) {
      if (event.name === 'persona:said') main = foldPersonaSaid(main, event.payload)
      window = foldEvent(window, event, agentOf).state
    }

    const fromMain = main.entries.map((entry) =>
      entry.kind === 'persona' ? [entry.agentId, entry.messageId, entry.text, entry.at] : []
    )
    const fromWindow = window.entries.map((entry) =>
      entry.kind === 'persona' ? [entry.agent.id, entry.messageId, entry.text, entry.at] : []
    )

    expect(fromMain).toEqual(fromWindow)
    expect(fromMain).toEqual([
      [mary.id, 'msg_1', ' Hello, there\n\n', 10],
      [mary.id, 'msg_2', 'A second message', 14],
      ['bmad-agent-pm', 'msg_3', 'Another persona', 15],
      [mary.id, 'msg_2', ' continued?', 16]
    ])
  })

  it('lets a window that hydrated from main carry on exactly as one that never reloaded', () => {
    const before = sequence.slice(0, 2)
    const after = sequence.slice(2)

    let main = EMPTY_TRANSCRIPT
    for (const event of before) {
      if (event.name === 'persona:said') main = foldPersonaSaid(main, event.payload)
    }
    let reloaded = hydrate(
      initialConversation,
      { entries: [...main.entries], sessions: [], busy: [], personas: [], runs: [] },
      agentOf
    ).state
    let steady = initialConversation
    for (const event of before) steady = foldEvent(steady, event, agentOf).state
    for (const event of after) {
      reloaded = foldEvent(reloaded, event, agentOf).state
      steady = foldEvent(steady, event, agentOf).state
    }

    const shown = (entries: typeof steady.entries) =>
      entries.map((entry) => (entry.kind === 'persona' ? [entry.messageId, entry.text] : []))
    expect(shown(reloaded.entries)).toEqual(shown(steady.entries))
  })
})

describe('a room’s words in main’s transcript and in the window’s (Story 4.2)', () => {
  const room = (agentId: string | undefined, messageId: string, text: string, at: number): ContractEvent => ({
    name: 'persona:said',
    payload: { sessionId: 'r1', ...(agentId === undefined ? {} : { agentId }), messageId, text, at, room: true }
  })
  const sequence: ContractEvent[] = [
    room(mary.id, 'm#1', 'Hi', 10),
    room(mary.id, 'm#1', '.', 11),
    room(undefined, 'm#1', 'no persona', 12),
    room('bmad-agent-pm', 'm#2', 'No.', 13),
    room(mary.id, 'm#3', 'Again', 14)
  ]

  it('hold the same turns with the same flag, an agentless piece dropped by both', () => {
    let main = EMPTY_TRANSCRIPT
    let window = initialConversation
    for (const event of sequence) {
      if (event.name === 'persona:said') main = foldPersonaSaid(main, event.payload)
      window = foldEvent(window, event, agentOf).state
    }
    const fromMain = main.entries.map((entry) => (entry.kind === 'persona' ? [entry.agentId, entry.messageId, entry.text, entry.room] : []))
    const fromWindow = window.entries.map((entry) => (entry.kind === 'persona' ? [entry.agent.id, entry.messageId, entry.text, entry.room] : []))

    expect(fromMain).toEqual(fromWindow)
    expect(fromMain).toEqual([
      [mary.id, 'm#1', 'Hi.', true],
      ['bmad-agent-pm', 'm#2', 'No.', true],
      [mary.id, 'm#3', 'Again', true]
    ])
  })

  it('hydrates into the same room entries, user turns included', () => {
    let main = foldUserTurn(EMPTY_TRANSCRIPT, 'what now', 9, true)
    for (const event of sequence) {
      if (event.name === 'persona:said') main = foldPersonaSaid(main, event.payload)
    }
    const { state } = hydrate(
      initialConversation,
      { entries: [...main.entries], sessions: [], busy: [], personas: [], runs: [] },
      agentOf
    )

    expect(state.entries.map((entry) => [entry.kind, 'room' in entry ? entry.room : undefined])).toEqual([
      ['user', true],
      ['persona', true],
      ['persona', true],
      ['persona', true]
    ])
  })
})

describe('a sysline in main’s transcript and in the window’s', () => {
  const line = 'handed off · Mary → John · picking up from a.md'

  it('is the same record in both, and hydrating it gives the line the window had before it reloaded', () => {
    let main = foldPersonaSaid(EMPTY_TRANSCRIPT, {
      sessionId: 's1',
      agentId: mary.id,
      messageId: 'msg_1',
      text: 'Hello',
      at: 10
    })
    main = foldSysline(main, line, 20)
    const record = main.entries[1]
    if (record.kind !== 'sysline') throw new Error('expected a sysline')

    let steady = foldEvent(initialConversation, said(mary.id, 'msg_1', 'Hello', 10), agentOf).state
    steady = withHandoff(steady, record)
    const reloaded = hydrate(
      initialConversation,
      { entries: [...main.entries], sessions: [], busy: [], personas: [], runs: [] },
      agentOf
    ).state

    const shown = (entries: typeof steady.entries) => entries.map((entry) => [entry.kind, entry.at, 'text' in entry ? entry.text : undefined])
    expect(shown(reloaded.entries)).toEqual(shown(steady.entries))
    expect(shown(reloaded.entries)[1]).toEqual(['sysline', 20, line])
  })

  it('ends the persona message before it in both, so what she says after is a message of its own', () => {
    let main = foldPersonaSaid(EMPTY_TRANSCRIPT, { sessionId: 's', agentId: mary.id, messageId: 'm', text: 'a', at: 1 })
    main = foldSysline(main, line, 2)
    main = foldPersonaSaid(main, { sessionId: 's', agentId: mary.id, messageId: 'm', text: 'b', at: 3 })
    main = foldUserTurn(main, 'user', 4)

    let window = foldEvent(initialConversation, said(mary.id, 'm', 'a', 1), agentOf).state
    window = withHandoff(window, { kind: 'sysline', id: 'm-1', at: 2, text: line })
    window = foldEvent(window, said(mary.id, 'm', 'b', 3), agentOf).state

    expect(main.entries.slice(0, 3).map((entry) => [entry.kind, entry.text])).toEqual(
      window.entries.map((entry) => [entry.kind, 'text' in entry ? entry.text : undefined])
    )
    expect(main.entries.map((entry) => entry.kind)).toEqual(['persona', 'sysline', 'persona', 'user'])
  })
})

describe('what is stored, and where', () => {
  it('is written by the one persistence source and nowhere else', () => {
    const writers = shipping.filter((path) =>
      /\b(?:writeFileSync|writeFile|appendFile|appendFileSync|renameSync|createWriteStream)\b/.test(code(path))
    )

    expect(writers.map(rel)).toEqual(['src/main/sources/persistence/transcript-file.ts'])
  })

  it('is read from userData only by the composition root and the bridge’s default', () => {
    const askers = shipping.filter((path) => /getPath\(\s*['"]userData['"]/.test(code(path)))

    expect(askers.map(rel).sort()).toEqual(['src/main/index.ts', 'src/main/session-bridge.ts'])
  })

  it('leaves the renderer with no storage of its own', () => {
    for (const path of shipping.filter((p) => p.startsWith(join(SRC, 'renderer')))) {
      expect(code(path), rel(path)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
    }
  })

  it('stores no session, persona state, queue or install model: the file holds the transcript and its run cards', () => {
    const file = code(join(SRC, 'main/sources/persistence/transcript-file.ts'))
    const runs = code(join(SRC, 'main/fold/stored-runs.ts'))

    expect(file).not.toMatch(/sessions|busy|personas|queue|install/i)
    expect(runs).not.toMatch(/sessions|busy|personas|queue|install/i)
    expect(code(join(SRC, 'shared/conversation.ts'))).toMatch(/version: 1/)
    // The cards ride beside the entries, additively: the file is still version 1 and `runs` is optional.
    expect(code(join(SRC, 'shared/conversation.ts'))).toMatch(/runs\?: StoredRun\[\]/)
    expect(file).toMatch(/TRANSCRIPT_VERSION = 1/)
  })

  it('stores the sysline and nothing of what made it: not the last persona, the written files or a name', () => {
    const projection = code(join(SRC, 'main/projections/transcript.ts'))
    const file = code(join(SRC, 'main/sources/persistence/transcript-file.ts'))
    const bridge = code(join(SRC, 'main/session-bridge.ts'))

    expect(file).toMatch(/TRANSCRIPT_VERSION = 1/)
    expect(file + projection).not.toMatch(/lastOpened|written|agentName|handoff/i)
    // The two memories of the handoff live on the window's service and are never handed to a writer.
    expect(bridge.match(/lastOpened/g)?.length).toBeGreaterThan(0)
    expect(bridge).not.toMatch(/writeTranscript|writeFileSync/)
  })

  it('names no command or event the contract did not already have', () => {
    const events = code(join(SRC, 'shared/events.ts'))
    const commands = code(join(SRC, 'shared/commands.ts'))

    expect([...events.matchAll(/^\s{2}'([a-z-]+:[a-z-]+)': EventSpec/gm)]).toHaveLength(15)
    expect([...commands.matchAll(/^\s{2}'([a-z]+\.[a-z]+)': CommandSpec/gm)]).toHaveLength(7)
    expect(events + commands).not.toMatch(/conversation:get|getConversation/)
  })
})

/**
 * A transcript is cleared by ending the conversation, and by nothing else. This
 * is held by behaviour, not by where a call is spelled: every way a transcript
 * could be emptied that the app has is driven here against the real files, and
 * only `conversation.end` may leave one with fewer records than it had.
 */
describe('a transcript is cleared only by ending the conversation', () => {
  const PROJECT = '/project-1'

  class Sender {
    constructor(readonly id = 1) {}
    send(): void {}
    isDestroyed(): boolean {
      return false
    }
    once(): void {}
  }

  type Scene = {
    userData: string
    /** Every write the registry made: its size, and whether `clear()` made it. */
    writes: { size: number; clearing: boolean }[]
    clears: number
    call: <T>(channel: string, ...args: unknown[]) => T
    frame: (frame: unknown) => void
    exit: () => void
    fileEntries: () => number | undefined
    flush: () => void
    done: () => void
  }

  async function scene(plant?: string): Promise<Scene> {
    handlers.clear()
    const userData = mkdtempSync(join(tmpdir(), 'harness-persist-'))
    if (plant !== undefined) {
      mkdirSync(join(userData, 'conversations'), { recursive: true })
      writeFileSync(transcriptFilePath(userData, PROJECT), plant)
    }
    const writes: Scene['writes'] = []
    const state = { clears: 0, clearing: false }
    const inner = createTranscriptRegistry({
      userDataPath: () => userData,
      schedule: () => () => {},
      log: () => {},
      write: (file, path, entries) => {
        writes.push({ size: entries.length, clearing: state.clearing })
        return writeTranscript(file, path, entries)
      }
    })
    const transcripts = {
      ...inner,
      forProject: (path: string) => {
        const transcript = inner.forProject(path)
        return {
          ...transcript,
          clear: () => {
            state.clears += 1
            state.clearing = true
            try {
              return transcript.clear()
            } finally {
              state.clearing = false
            }
          }
        }
      }
    }
    let feed: (frame: unknown) => void = () => {}
    let exit: () => void = () => {}
    let clock = 0
    registerSessionBridge({
      transcripts,
      projectPathFor: () => PROJECT,
      now: () => (clock += 1),
      newSessionId: (() => {
        let n = 0
        return () => `s${(n += 1)}`
      })(),
      agentName: (_id: number, agentId: string) => agentId,
      writeDiagnostic: () => {},
      spawn: (options: SpawnSessionOptions): Promise<SpawnOutcome> => {
        feed = options.onFrame
        exit = options.onExit
        return Promise.resolve({ ok: true, session: { write: () => Promise.resolve(true), interrupt: () => Promise.resolve(true), kill: () => {} } })
      }
    })
    const sender = new Sender()
    return {
      userData,
      writes,
      get clears() {
        return state.clears
      },
      call: <T>(channel: string, ...args: unknown[]): T =>
        (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args),
      frame: (frame) => feed(frame),
      exit: () => exit(),
      fileEntries: () => {
        try {
          return (JSON.parse(readFileSync(transcriptFilePath(userData, PROJECT), 'utf8')) as { entries: unknown[] })
            .entries.length
        } catch {
          return undefined
        }
      },
      flush: () => inner.flushAll(),
      done: () => rmSync(userData, { recursive: true, force: true })
    }
  }

  const streamEvent = (event: unknown) => ({ type: 'stream_event', parent_tool_use_id: null, event })
  const speak = (text: string): unknown[] => [
    streamEvent({ type: 'message_start', message: { id: `m-${text}` } }),
    streamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
    streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
  ]

  it('is emptied by nothing the session does: speech, results, failures, an exit, a close, a reload, a handoff or a window going', async () => {
    const world = await scene()
    try {
      await world.call<Promise<unknown>>(SESSION_OPEN_CHANNEL, 'bmad-agent-analyst')
      for (const frame of speak('hello')) world.frame(frame)
      world.frame({ type: 'result', subtype: 'success', is_error: false })
      expect(await world.call(TURN_SEND_CHANNEL, 's1', 'hi')).toEqual({ ok: true })
      world.flush()
      world.frame({ type: 'result', subtype: 'error_during_execution', is_error: true })
      world.call(CONVERSATION_GET_CHANNEL)
      await world.call<Promise<unknown>>(SESSION_OPEN_CHANNEL, 'bmad-agent-pm')
      world.flush()
      expect(world.fileEntries()).toBeGreaterThan(2)
      const before = world.fileEntries() ?? 0

      world.exit()
      world.call(SESSION_CLOSE_CHANNEL, 's2')
      world.call(CONVERSATION_GET_CHANNEL)
      world.flush()

      expect(world.clears).toBe(0)
      expect(world.writes.length).toBeGreaterThan(0)
      expect(world.fileEntries()).toBeGreaterThanOrEqual(before)
      // Every write after the first holds at least as much as the one before it.
      world.writes.reduce((previous, write) => {
        expect(write.size).toBeGreaterThanOrEqual(previous)
        return write.size
      }, 0)
    } finally {
      world.done()
    }
  })

  it('is emptied by conversation.end, once, with the file written empty first', async () => {
    const world = await scene()
    try {
      await world.call<Promise<unknown>>(SESSION_OPEN_CHANNEL, 'bmad-agent-analyst')
      for (const frame of speak('hello')) world.frame(frame)
      world.flush()
      expect(world.fileEntries()).toBe(1)

      expect(world.call(CONVERSATION_END_CHANNEL, PROJECT)).toEqual({ ok: true })

      expect(world.clears).toBe(1)
      expect(world.fileEntries()).toBe(0)
      expect(world.writes.filter((write) => write.size === 0)).toEqual([{ size: 0, clearing: true }])
      const reply = world.call<ConversationReply>(CONVERSATION_GET_CHANNEL)
      expect(reply.ok && reply.snapshot.entries).toEqual([])
    } finally {
      world.done()
    }
  })

  it.each([
    ['not JSON', '{not json'],
    ['of another version', JSON.stringify({ version: 2, projectPath: PROJECT, entries: [] })],
    ['with a record that is not one', JSON.stringify({ version: 1, projectPath: PROJECT, entries: [{ kind: 'user', id: 'm-0', at: 1, text: 'ok' }, 5] })]
  ])('is not emptied by a file that is %s: it is set aside whole, and no write replaces it', async (_name, original) => {
    const world = await scene(original)
    try {
      await world.call<Promise<unknown>>(SESSION_OPEN_CHANNEL, 'bmad-agent-analyst')
      for (const frame of speak('hello')) world.frame(frame)
      world.frame({ type: 'result', subtype: 'success', is_error: false })
      await world.call(TURN_SEND_CHANNEL, 's1', 'more')
      world.flush()

      const aside = readFileSync(`${transcriptFilePath(world.userData, PROJECT)}.aside`, 'utf8')
      expect(aside).toBe(original)
      expect(world.clears).toBe(0)
      expect(world.writes.every((write) => write.size > 0)).toBe(true)
      expect(world.fileEntries()).toBeGreaterThanOrEqual(3)
    } finally {
      world.done()
    }
  })
})
