import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, ConversationSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import type { AgentView } from '../src/shared/install'
import type { SpawnOutcome, SpawnSessionOptions } from '../src/main/sources/session/session-process'
import { hydrate, initialConversation, roomTurnsOf, speakerOf } from '../src/renderer/ui/chat/conversation-state'
import { roomDestination } from '../src/shared/room-destination'
import { roomSummaryTurn } from '../src/shared/room-summary'

/**
 * Story 4.7: the room is still the room after the window reloads. The real session bridge and registry
 * run over a fake process; what they answer to `conversation:get` is folded into a fresh renderer state
 * by the renderer's own `hydrate`, as a window that reloaded would. Nothing is set by hand: if main drops
 * the room from the snapshot, or the window drops it from the state, these fail.
 */

const handlers = new Map<string, (...args: never[]) => unknown>()
let userData = ''

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: (name: string) => (name === 'userData' ? userData : `/unexpected/${name}`) }
}))

const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { CONVERSATION_GET_CHANNEL, SESSION_OPEN_CHANNEL, TURN_SEND_CHANNEL, registerSessionBridge } = await import('../src/main/session-bridge')

class FakeSender {
  sent: ContractEvent[] = []
  constructor(readonly id: number) {}
  send(_channel: string, event: ContractEvent): void {
    this.sent.push(event)
  }
  isDestroyed(): boolean {
    return false
  }
  once(): void {}
}

type FakeProcess = { options: SpawnSessionOptions; up(): Promise<void>; frame(frame: unknown): void }

const NAMES: Record<string, string> = { 'bmad-agent-analyst': 'Mary', 'bmad-agent-pm': 'John', 'bmad-agent-dev': 'Amelia' }
const CAST = ['bmad-agent-dev', 'bmad-agent-analyst', 'bmad-agent-pm']
const agentOf = (id: string): AgentView => ({ id, module: 'bmm', name: NAMES[id] ?? id, title: '', icon: '', description: '' })

let processes: FakeProcess[]
let clock: number

beforeEach(() => {
  handlers.clear()
  processes = []
  clock = 1_000
  userData = mkdtempSync(join(tmpdir(), 'harness-room-reload-'))
  registerSessionBridge({
    transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
    projectPathFor: () => '/project-1',
    now: () => (clock += 1),
    newSessionId: () => 's1',
    writeDiagnostic: () => {},
    agentName: (_id, agentId) => NAMES[agentId],
    roster: () => Object.entries(NAMES).map(([id, name]) => ({ id, name })),
    spawn: (options) =>
      new Promise<SpawnOutcome>((resolve) => {
        const session = { write: () => Promise.resolve(true), interrupt: () => Promise.resolve(true), kill: () => {} }
        processes.push({
          options,
          up: async () => {
            resolve({ ok: true, session })
            await Promise.resolve()
          },
          frame: (frame) => options.onFrame(frame)
        })
      })
  })
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

const invoke = <T>(channel: string, ...args: unknown[]): T =>
  (handlers.get(channel) as unknown as (event: { sender: FakeSender }, ...rest: unknown[]) => T)({ sender: new FakeSender(1) }, ...args)

async function openRoom(): Promise<{ sessionId: string }> {
  const pending = invoke<Promise<{ ok: true; sessionId: string }>>(SESSION_OPEN_CHANNEL, { room: CAST })
  await processes[0].up()
  return pending
}
const send = (sessionId: string, text: string): Promise<unknown> => invoke(TURN_SEND_CHANNEL, sessionId, text)

const stream = (frames: unknown[]): void => frames.forEach((frame) => processes[0].frame(frame))
const result = { type: 'result', subtype: 'success', is_error: false }
const speech = (text: string): unknown[] => [
  { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'msg_1' } } },
  { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
  { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } },
  { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_stop', index: 0 } }
]

/** A window that reloads: it reads the conversation again and folds it into a state of its own. */
function reloaded(): { snapshot: ConversationSnapshot; state: ReturnType<typeof hydrate>['state'] } {
  const reply = invoke<ConversationReply>(CONVERSATION_GET_CHANNEL)
  if (!reply.ok) throw new Error('no snapshot')
  return { snapshot: reply.snapshot, state: hydrate(initialConversation, reply.snapshot, agentOf).state }
}

describe('a window that reloads with a live room (Story 4.7)', () => {
  it('comes back with the room’s cast, open time, topic, turns and destination, and the room in no persona’s sessions', async () => {
    const { sessionId } = await openRoom()
    stream([result])
    await send(sessionId, '  Should we\n split the epic?  ')
    stream([...speech('🧙 **Mary:** Yes.'), result])

    const { snapshot, state } = reloaded()

    expect(snapshot.sessions).toEqual([])
    expect(state.room).toBe(sessionId)
    expect(state.roomCast).toEqual(CAST)
    expect(state.roomOpenedAt).toBe(snapshot.room?.openedAt)
    expect(state.roomTopic).toBe('Should we')
    expect(roomTurnsOf(state)).toBe(1)
    expect(roomDestination(state.roomOpenedAt, state.roomTopic, '_bmad/')).toMatch(/^_bmad\/party\/\d{4}-\d{2}-\d{2}-should-we\.md$/)
    expect(state.sessions.size).toBe(0)
    expect(state.busy.has(sessionId)).toBe(false)
  })

  it('comes back busy mid-turn, with the speaker lit from the stored entries', async () => {
    const { sessionId } = await openRoom()
    stream([result])
    await send(sessionId, 'topic')
    stream(speech('🧙 **Mary:** Well'))

    const { snapshot, state } = reloaded()

    expect(snapshot.busy).toEqual([sessionId])
    expect(state.busy.has(sessionId)).toBe(true)
    expect(speakerOf(state)).toBe('bmad-agent-analyst')
  })

  it('reads the topic from the first non-blank user message after the open, never from the summary ask', async () => {
    const { sessionId } = await openRoom()
    stream([result])
    await send(sessionId, '   ')
    stream([result])
    await send(sessionId, roomSummaryTurn('_bmad/party/2026-01-01-<topic>.md'))
    stream([result])
    expect(reloaded().state.roomTopic).toBeUndefined()

    await send(sessionId, 'second thoughts')
    stream([result])
    await send(sessionId, 'later words')

    expect(reloaded().state.roomTopic).toBe('second thoughts')
  })

  it('is not a room at all when it is still starting, and the window shows nothing live', async () => {
    const pending = invoke<Promise<unknown>>(SESSION_OPEN_CHANNEL, { room: CAST })

    const { snapshot, state } = reloaded()
    expect('room' in snapshot).toBe(false)
    expect(state).toMatchObject({ room: undefined, roomCast: [], roomOpenedAt: undefined, roomTopic: undefined })

    await processes[0].up()
    await pending
    expect(reloaded().state.room).toBe('s1')
  })

  it('is not a room again after a relaunch, and nothing of it is persisted', async () => {
    const { sessionId } = await openRoom()
    stream([result])
    await send(sessionId, 'topic')
    handlers.clear()
    processes = []
    registerSessionBridge({
      transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
      projectPathFor: () => '/project-1',
      now: () => (clock += 1),
      writeDiagnostic: () => {},
      roster: () => Object.entries(NAMES).map(([id, name]) => ({ id, name }))
    })

    const { snapshot, state } = reloaded()

    expect('room' in snapshot).toBe(false)
    expect(state).toMatchObject({ room: undefined, roomCast: [], roomOpenedAt: undefined, roomTopic: undefined })
  })
})
