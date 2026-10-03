import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, RunCardSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'

/**
 * Story 3.1's beat, replayed: `fast-path-sonnet` fed through the real session
 * bridge, registry and folds at full rate, with the recorded drafting turn sent
 * as a menu dispatch rather than typed. Time is the recording's own: frames
 * that carry a `timestamp` give it, and every frame between two of them is
 * placed evenly between, so the prose timer coalesces as it would have live.
 *
 * The memlog is the one thing the recording does not hold: it was a file in a
 * scratch project. It is rebuilt here from the `memlog.py` commands the main
 * thread ran through Bash, applied when each command's result came back, and
 * reported to the session side as the rail's watcher would have.
 *
 * Two paces. At full rate every frame arrives at once, as fast as main can take
 * them, so the prose timer never runs and only other events release what is
 * held: the acceptance case. At the recorded pace the timer runs as it would
 * have live, which is what the judgement's timeline is read from.
 *
 * `REPLAY_TIMELINE=1` prints the timeline the judgement records.
 */

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => '/unused' }
}))

const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { CONVERSATION_GET_CHANNEL, MENU_DISPATCH_CHANNEL, SESSION_OPEN_CHANNEL, TURN_SEND_CHANNEL, registerSessionBridge } =
  await import('../src/main/session-bridge')

type Frame = {
  type: string
  timestamp?: string
  parent_tool_use_id?: string | null
  event?: { type?: string; index?: number; content_block?: { type?: string; name?: string; id?: string }; delta?: { type?: string } }
  message?: { content?: unknown }
}
type ToolUse = { type: string; id: string; name: string; input: Record<string, unknown> }

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const meta = JSON.parse(readFileSync(join(RUNS, 'fast-path-sonnet.meta.json'), 'utf8')) as {
  cwd: string
  turns: { afterLine: number; text: string }[]
}
const frames = readFileSync(join(RUNS, 'fast-path-sonnet.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as Frame)

/** Each frame's wall-clock time: its own stamp, or placed evenly between the stamps around it. */
function frameTimes(): number[] {
  const stamped = frames.map((frame) => (frame.timestamp === undefined ? undefined : Date.parse(frame.timestamp)))
  const times: number[] = []
  let before = { at: -1, time: stamped.find((time) => time !== undefined) ?? 0 }
  for (let at = 0; at < frames.length; at += 1) {
    const own = stamped[at]
    if (own !== undefined) {
      before = { at, time: own }
      times.push(own)
      continue
    }
    let next = at + 1
    while (next < frames.length && stamped[next] === undefined) next += 1
    const after = next < frames.length ? { at: next, time: stamped[next] ?? before.time } : before
    const span = after.at - before.at
    times.push(span <= 0 ? before.time : before.time + ((after.time - before.time) * (at - before.at)) / span)
  }
  return times.map((time, at) => (at > 0 ? Math.max(time, 0) : time))
}

/** The main thread's tool calls, by id. */
const mainTools = new Map<string, ToolUse>(
  frames.flatMap((frame) => {
    if (frame.type !== 'assistant' || frame.parent_tool_use_id) return []
    const content = (frame.message?.content ?? []) as ToolUse[]
    return content.filter((block) => block.type === 'tool_use').map((block) => [block.id, block] as [string, ToolUse])
  })
)

/** What one `memlog.py` Bash command did to its file, in the writer's own form. */
function applyMemlog(command: string, files: Map<string, string>): string[] {
  const ws = /WS=(\S+)/.exec(command)?.[1]
  const touched: string[] = []
  for (const line of command.split('\n')) {
    const call = /memlog\.py (init|append) --workspace (\S+)/.exec(line)
    if (call === null) continue
    const workspace = call[2] === '$WS' ? (ws ?? '') : call[2]
    const path = `${workspace}/.memlog.md`
    if (call[1] === 'init') {
      files.set(path, '---\ntopic: replay\n---\n\n')
    } else {
      const type = /--type (\S+)/.exec(line)?.[1]
      const text = /--text "((?:[^"\\]|\\.)*)"/.exec(line)?.[1] ?? ''
      const entry = `- ${type === undefined ? '' : `(${type}) `}${text.replace(/\\"/g, '"').split(/\s+/).join(' ')}`
      files.set(path, `${files.get(path) ?? ''}${entry}\n`)
    }
    touched.push(path)
  }
  return touched
}

type Told = { event: ContractEvent; at: number; frame: number }

type Replay = {
  told: Told[]
  runId: string
  dispatchedAt: number
  /** The card as a window reloading just after the big write committed would be handed it. */
  reloaded: RunCardSnapshot | undefined
  bigWrite: ToolUse
  bigDeltas: number
}

async function replay(pace: 'full-rate' | 'recorded'): Promise<Replay> {
  handlers.clear()
  const userData = mkdtempSync(join(tmpdir(), 'harness-run-replay-'))
  try {
    const times = frameTimes()
    let clock = times[0]
    let current = -1
    const timers: { due: number; run: () => void; cancelled: boolean }[] = []
    const files = new Map<string, string>()
    let feed: (frame: unknown) => void = () => {}
    const told: Told[] = []
    const sender = {
      id: 1,
      send: (_channel: string, event: ContractEvent) => void told.push({ event, at: clock, frame: current }),
      isDestroyed: () => false,
      once: () => {}
    }
    const drafting = meta.turns.find((turn) => turn.afterLine === 1639)?.text ?? ''
    const bridge = registerSessionBridge({
      transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
      projectPathFor: () => meta.cwd,
      now: () => clock,
      newSessionId: () => 's1',
      newRunId: () => 'run-1',
      agentName: () => 'John',
      writeDiagnostic: () => {},
      menuEntryFor: (_window, _agent, code) =>
        code === 'DP' ? { code: 'DP', description: 'Draft the PRD', action: { kind: 'prompt', prompt: drafting } } : undefined,
      readText: (absolute) => Promise.resolve(files.get(absolute.slice(meta.cwd.length + 1))),
      schedule: (run, ms) => {
        const timer = { due: clock + ms, run, cancelled: false }
        timers.push(timer)
        return () => void (timer.cancelled = true)
      },
      spawn: (options) => {
        feed = options.onFrame
        return Promise.resolve({ ok: true, session: { write: () => Promise.resolve(true), kill: () => {} } })
      }
    })
    const call = <T>(channel: string, ...args: unknown[]): T =>
      (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, 'bmad-agent-pm')

    const pendingMemlog = new Map<string, string>()
    const big = [...mainTools.values()].find(
      (tool) => tool.name === 'Write' && String(tool.input.content ?? '').length > 40_000
    ) as ToolUse
    let bigDeltas = 0
    let bigIndex: number | undefined
    let reloaded: RunCardSnapshot | undefined
    let dispatchedAt = 0
    let runId = ''

    for (let at = 0; at < frames.length; at += 1) {
      current = at
      clock = Math.max(clock, times[at])
      // At full rate no time passes between frames, so no timer is ever due.
      for (const timer of timers.filter((each) => pace === 'recorded' && !each.cancelled && each.due <= clock)) {
        timer.cancelled = true
        timer.run()
      }
      for (const turn of meta.turns.filter((each) => each.afterLine === at && at > 0)) {
        if (at === 1639) {
          const reply = await call<Promise<{ ok: boolean; runId: string }>>(MENU_DISPATCH_CHANNEL, 's1', 'DP')
          expect(reply.ok).toBe(true)
          runId = reply.runId
          dispatchedAt = clock
        } else {
          await call<Promise<unknown>>(TURN_SEND_CHANNEL, 's1', turn.text)
        }
      }
      const frame = frames[at]
      const block = frame.event?.content_block
      if (frame.event?.type === 'content_block_start' && block?.id === big.id) bigIndex = frame.event.index
      if (!frame.parent_tool_use_id && frame.event?.delta?.type === 'input_json_delta' && frame.event.index === bigIndex) {
        bigDeltas += 1
      }
      if (frame.event?.type === 'content_block_stop' && frame.event.index === bigIndex) bigIndex = undefined
      feed(frame)
      // A memlog command's result: the file is as the writer left it, and the watcher sees it.
      if (frame.type === 'assistant' && !frame.parent_tool_use_id) {
        for (const block of (frame.message?.content ?? []) as ToolUse[]) {
          if (block.type === 'tool_use' && block.name === 'Bash' && String(block.input.command).includes('memlog.py')) {
            pendingMemlog.set(block.id, String(block.input.command))
          }
        }
      }
      if (frame.type === 'user' && !frame.parent_tool_use_id && Array.isArray(frame.message?.content)) {
        for (const result of frame.message.content as { type?: string; tool_use_id?: string }[]) {
          const command = result.type === 'tool_result' ? pendingMemlog.get(result.tool_use_id ?? '') : undefined
          if (command === undefined) continue
          for (const path of applyMemlog(command, files)) {
            await bridge.observeArtifact(sender, meta.cwd, { type: 'artifact:written', path, size: 1, mtimeMs: clock })
          }
        }
        if (reloaded === undefined && told.some(({ event }) => event.name === 'doc:committed' && event.payload.callId === big.id)) {
          const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL)
          reloaded = reply.ok ? reply.snapshot.runs[0] : undefined
        }
      }
    }
    return { told, runId, dispatchedAt, reloaded, bigWrite: big, bigDeltas }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

describe('fast-path-sonnet, replayed through main as a dispatched run', () => {
  let result: Replay
  let recorded: Replay
  beforeAll(async () => {
    result = await replay('full-rate')
    recorded = await replay('recorded')
  }, 120_000)

  afterAll(() => {
    if (process.env.REPLAY_TIMELINE !== '1') return
    for (const [pace, each] of [['full rate', result], ['recorded pace', recorded]] as const) {
      console.log(`— ${pace}\n${timeline(each)}`)
    }
  })

  function timeline(replayed: Replay): string {
    const { told, dispatchedAt, bigWrite } = replayed
    const since = (at: number | undefined): string => (at === undefined ? '—' : `${((at - dispatchedAt) / 1000).toFixed(1)}s`)
    const first = (test: (event: ContractEvent) => boolean): Told | undefined => told.find(({ event }) => test(event))
    const counts = new Map<string, number>()
    for (const { event } of told.filter(({ at }) => at >= dispatchedAt)) counts.set(event.name, (counts.get(event.name) ?? 0) + 1)
    const lines = [
      `dispatch → run:started: ${since(first((event) => event.name === 'run:started')?.at)}`,
      `first run:note: ${since(first((event) => event.name === 'run:note')?.at)} (frame ${first((event) => event.name === 'run:note')?.frame})`,
      `first doc:prose: ${since(first((event) => event.name === 'doc:prose')?.at)} (frame ${first((event) => event.name === 'doc:prose')?.frame})`,
      `big write first prose: ${since(first((event) => event.name === 'doc:prose' && event.payload.callId === bigWrite.id)?.at)}`,
      `big write committed: ${since(first((event) => event.name === 'doc:committed' && event.payload.callId === bigWrite.id)?.at)}`,
      `run:finished: ${since(first((event) => event.name === 'run:finished')?.at)} (frame ${first((event) => event.name === 'run:finished')?.frame})`,
      `events after dispatch: ${JSON.stringify(Object.fromEntries(counts))}`,
      `big write: ${replayed.bigDeltas} deltas → ${told.filter(({ event }) => event.name === 'doc:prose' && event.payload.callId === bigWrite.id).length} doc:prose`
    ]
    return lines.join('\n')
  }

  const events = (name: ContractEvent['name']): ContractEvent[] =>
    result.told.map(({ event }) => event).filter((event) => event.name === name)

  it('starts the run on the dispatch, as its first event', () => {
    const runEvents = result.told.filter(({ event }) => 'runId' in event.payload && event.payload.runId === result.runId)
    expect(runEvents[0].event.name).toBe('run:started')
  })

  it('tells the window the 3,947-delta write in far fewer pieces, with its exact text', () => {
    const pieces = events('doc:prose').flatMap((event) =>
      event.name === 'doc:prose' && event.payload.callId === result.bigWrite.id ? [event.payload.text] : []
    )
    expect(result.bigDeltas).toBe(3947)
    expect(pieces.length).toBeGreaterThan(0)
    expect(pieces.length).toBeLessThan(result.bigDeltas / 10)
    expect(pieces.join('')).toBe(String(result.bigWrite.input.content))
  })

  it('at the recorded pace, still joins several deltas into each piece and loses no byte', () => {
    const pieces = recorded.told.flatMap(({ event }) =>
      event.name === 'doc:prose' && event.payload.callId === recorded.bigWrite.id ? [event.payload.text] : []
    )
    expect(pieces.length).toBeLessThan(recorded.bigDeltas / 3)
    expect(pieces.join('')).toBe(String(recorded.bigWrite.input.content))
    expect(recorded.told.filter(({ event }) => event.name === 'run:finished')).toHaveLength(1)
  })

  it('commits every write and edit of the run exactly once, ok, and names the document’s sections', () => {
    const commits = events('doc:committed').flatMap((event) => (event.name === 'doc:committed' ? [event.payload] : []))
    const ids = commits.map((commit) => commit.callId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(commits.every((commit) => commit.ok)).toBe(true)
    const big = commits.find((commit) => commit.callId === result.bigWrite.id)
    expect(big?.ok === true && big.sections.length).toBeGreaterThan(5)
  })

  it('notes each memlog entry appended during the run, and none from before it', () => {
    const notes = events('run:note').flatMap((event) => (event.name === 'run:note' ? [event.payload.text] : []))
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.every((text) => text.startsWith('- ('))).toBe(true)
    // The entries the first turn appended (frame 636) are before the run, and are no note.
    expect(notes.some((text) => text.includes('Intent: Create.'))).toBe(false)
  })

  it('ends on run:finished, and a window reloading after the write commits is handed the card whole', () => {
    expect(events('run:finished')).toHaveLength(1)
    expect(events('run:failed')).toHaveLength(0)
    expect(result.reloaded).toMatchObject({ status: 'running' })
    expect(result.reloaded?.prose?.text).toBe(String(result.bigWrite.input.content))
    expect(result.reloaded?.sections.length).toBeGreaterThan(5)
    expect(result.reloaded?.notes.length).toBeGreaterThan(0)
  })
})
