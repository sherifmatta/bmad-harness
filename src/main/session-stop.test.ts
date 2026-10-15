import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, ConversationSnapshot } from '../shared/conversation'
import type { ContractEvent, EventName, EventPayload } from '../shared/events'
import { createTranscriptRegistry } from './projections/transcript'
import type { TranscriptRegistry } from './projections/transcript'
import { STOP_ACK_MS, STOP_RESULT_MS } from './session-stop'
import { LINES } from './session-voice'
import type { TemplatePlan } from '../shared/section-plan'
import type { ResolvedMenuEntry } from './sources/install/schema'
import type { SessionProcess, SpawnOutcome, SpawnSessionOptions } from './sources/session/session-process'

/**
 * Story 3.7's stop, through the real session bridge and registry: `run.stop`
 * finds the run's session by its id, marks the run stopping and asks the
 * session to interrupt; the turn's own `result` ends it as `run:stopped`; an
 * interrupt nobody answers ends the session and says so. The process is a fake
 * whose interrupt is held until the test answers it; time is hand-cranked.
 */

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => '/unused' }
}))

const {
  CONVERSATION_END_CHANNEL,
  CONVERSATION_GET_CHANNEL,
  MENU_DISPATCH_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_CLOSE_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL,
  TURN_STOP_CHANNEL,
  registerSessionBridge
} = await import('./session-bridge')

const ROOT = '/work/project'
const A = 'bmad-agent-pm'
const B = 'bmad-agent-analyst'

class FakeSender {
  sent: ContractEvent[] = []
  constructor(readonly id = 1) {}
  send(_channel: string, event: ContractEvent): void {
    this.sent.push(event)
  }
  isDestroyed(): boolean {
    return false
  }
  once(): void {}
  /** The events by name, apart from the persona's state, which these tests do not read in order. */
  get names(): string[] {
    return this.sent.map((event) => event.name).filter((name) => name !== 'persona:state')
  }
  of<N extends EventName>(name: N): EventPayload<N>[] {
    return this.sent.flatMap((event) => (event.name === name ? [event.payload as EventPayload<N>] : []))
  }
}

/** What a spawned session looks like from outside: its frames in, and what main asked of it. */
type FakeSession = {
  feed: (frame: unknown) => void
  exit: () => void
  /** Each interrupt asked for, held until answered. */
  interrupts: ((acknowledged: boolean) => void)[]
  writes: string[]
  kills: number
  /** Called inside `interrupt()`, before it returns: the CLI answering at once. */
  duringInterrupt: (() => void) | undefined
  interruptThrows: boolean
  /** While set, a write is not answered until it settles: the turn is busy and its run has not begun. */
  writeGate: Promise<boolean> | undefined
}

const MENU: Record<string, ResolvedMenuEntry> = {
  CP: { code: 'CP', description: 'Create the PRD', action: { kind: 'skill', skill: 'bmad-prd' } },
  VP: { code: 'VP', description: 'Validate it', action: { kind: 'prompt', prompt: 'Validate the PRD, please.' } }
}

let userData: string
let clock: number
let runs: number
let sessions: number
let timers: { at: number; run: () => void; cancelled: boolean }[]
let fakes: Map<string, FakeSession>
let transcripts: TranscriptRegistry
/** Whether the install still lists the agents: left false, every session's persona is an orphan. */
let roster: boolean
/** The project this window holds: `ROOT`, or the one a recording was made in. */
let projectRoot: string
/** The plan the skill's template gives at dispatch, and the memlog the watcher's read finds. */
let templatePlan: TemplatePlan | undefined
let memlogText: string | undefined
let observe: (sender: FakeSender, observation: { type: 'artifact:found' | 'artifact:written'; path: string }) => Promise<void>

beforeEach(() => {
  handlers.clear()
  userData = mkdtempSync(join(tmpdir(), 'harness-session-stop-'))
  clock = 1_000
  runs = 0
  sessions = 0
  timers = []
  fakes = new Map()
  roster = true
  projectRoot = ROOT
  templatePlan = undefined
  memlogText = undefined
  transcripts = createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} })
  const bridge = registerSessionBridge({
    transcripts,
    projectPathFor: () => projectRoot,
    now: () => clock,
    newSessionId: () => `s${(sessions += 1)}`,
    newRunId: () => `r${(runs += 1)}`,
    agentName: () => (roster ? 'John' : undefined),
    writeDiagnostic: () => {},
    menuEntryFor: (_window, _agentId, code) => (roster ? MENU[code] : undefined),
    roster: () => [{ id: A, name: 'John' }, { id: B, name: 'Mary' }],
    readPlan: () => Promise.resolve(templatePlan),
    readText: () => Promise.resolve(memlogText),
    schedule: (run, ms) => {
      const timer = { at: clock + ms, run, cancelled: false }
      timers.push(timer)
      return () => void (timer.cancelled = true)
    },
    spawn: (options: SpawnSessionOptions) => {
      const fake: FakeSession = {
        feed: options.onFrame,
        exit: options.onExit,
        interrupts: [],
        writes: [],
        kills: 0,
        duringInterrupt: undefined,
        interruptThrows: false,
        writeGate: undefined
      }
      fakes.set(options.agentId as string, fake)
      const session: SessionProcess = {
        write: (text) => {
          fake.writes.push(text)
          return fake.writeGate ?? Promise.resolve(true)
        },
        interrupt: () => {
          if (fake.interruptThrows) throw new Error('the pipe is gone')
          const asked = new Promise<boolean>((resolve) => fake.interrupts.push(resolve))
          fake.duringInterrupt?.()
          return asked
        },
        kill: () => void (fake.kills += 1)
      }
      return Promise.resolve<SpawnOutcome>({ ok: true, session })
    }
  })
  observe = (sender, observation) => bridge.observeArtifact(sender, projectRoot, { ...observation, size: 0, mtimeMs: 0 })
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

/** Let time pass: run every timer due by then, in order. */
function advance(ms: number): void {
  clock += ms
  for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
    if (!timer.cancelled && timer.at <= clock) {
      timer.cancelled = true
      timer.run()
    }
  }
}

const call = <T>(channel: string, sender: FakeSender, ...args: unknown[]): T =>
  (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

const snapshot = (sender: FakeSender): ConversationSnapshot => {
  const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL, sender)
  if (!reply.ok) throw new Error('no snapshot')
  return reply.snapshot
}

const result = (isError = false, subtype = isError ? 'error_during_execution' : 'success') => ({ type: 'result', subtype, is_error: isError })
const stopRun = (sender: FakeSender, runId: unknown) => call<Promise<unknown>>(RUN_STOP_CHANNEL, sender, runId)
const NOT_FOUND = { ok: false, error: { code: 'run/not-found', message: 'run · no such run is in flight' } }

/** One window, one persona's session open and its activation over, and a run dispatched into it. */
async function running(agent = A, sender = new FakeSender(1), code = 'CP') {
  await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, agent)
  const fake = fakes.get(agent)!
  fake.feed(result())
  const sessionId = `s${sessions}`
  const reply = (await call<Promise<{ ok: true; runId: string }>>(MENU_DISPATCH_CHANNEL, sender, sessionId, code)) as { ok: true; runId: string }
  expect(reply.ok).toBe(true)
  sender.sent = []
  return { sender, fake, sessionId, runId: reply.runId }
}

/** Let the continuation of an awaited stop run. */
const flush = async (): Promise<void> => {
  for (let at = 0; at < 5; at += 1) await Promise.resolve()
}

describe('a stop the CLI acknowledged', () => {
  it('asks the run’s session for one interrupt, writes nothing as a turn, and tells the window nothing yet', async () => {
    const { sender, fake, runId } = await running()
    const written = fake.writes.length

    const reply = stopRun(sender, runId)
    await flush()

    expect(fake.interrupts).toHaveLength(1)
    expect(fake.writes).toHaveLength(written)
    expect(sender.sent).toEqual([])
    expect(fake.kills).toBe(0)
    fake.interrupts[0](true)
    await expect(reply).resolves.toEqual({ ok: true })
    // Still nothing: the card ends on the turn's `result` row and on nothing else.
    expect(sender.sent).toEqual([])
    expect(snapshot(sender).runs[0].status).toBe('running')
  })

  it('ends the card as run:stopped on the turn’s own failed result, with no run:failed, no failed line and the session open', async () => {
    const { sender, fake, runId, sessionId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply

    fake.feed(result(true))

    expect(sender.names).toEqual(['run:stopped', 'session:awaiting-turn'])
    expect(sender.of('run:stopped')).toEqual([{ runId, sessionId, at: clock }])
    expect(sender.of('harness:said')).toEqual([])
    expect(fake.kills).toBe(0)
    expect(snapshot(sender)).toMatchObject({ sessions: [{ agentId: A, sessionId }], busy: [], runs: [{ runId, status: 'stopped', endedAt: clock }] })
    expect(snapshot(sender).entries).toEqual([])
  })

  it('leaves a persona that reads `error` as for any stopped run, from the stop and not from a failed turn', async () => {
    const { sender, fake, runId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))

    expect(sender.of('persona:state').map((event) => event.state)).toEqual(['error'])
  })

  it('accepts a next turn into the same process after the stop', async () => {
    const { sender, fake, runId, sessionId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))
    const written = fake.writes.length

    await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, sessionId, 'pick that back up')).resolves.toEqual({ ok: true })

    expect(fake.writes).toHaveLength(written + 1)
    expect(fake.writes.at(-1)).toBe('pick that back up')
    expect(fakes.size).toBe(1)
  })

  it('accepts the next run too: a stopped run frees the session for a menu entry', async () => {
    const { sender, fake, runId, sessionId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))

    await expect(call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, sender, sessionId, 'CP')).resolves.toEqual({ ok: true, runId: 'r2' })
  })

  it('is stopped even when the acknowledgement and the result arrive in the one chunk: the mark is set before the interrupt is asked', async () => {
    const { sender, fake, runId } = await running()
    // The CLI answers before `interrupt()` has returned, and its result follows in the same tick.
    fake.duringInterrupt = () => fake.feed(result(true))

    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply

    expect(sender.names).toEqual(['run:stopped', 'session:awaiting-turn'])
    expect(sender.of('run:failed')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])
  })

  it('takes the turn’s end for what it was when the turn ended first: a result that is no error is run:finished', async () => {
    const { sender, fake, runId } = await running()
    const reply = stopRun(sender, runId)
    await flush()

    fake.feed(result(false))
    fake.interrupts[0](true)
    await reply

    expect(sender.names).toEqual(['run:finished', 'session:awaiting-turn'])
    expect(sender.of('run:stopped')).toEqual([])
    expect(fake.kills).toBe(0)
  })

  it('does not end the run at the acknowledgement alone: the ack timer is cancelled and the card is as it was', async () => {
    const { sender, fake, runId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    const pending = timers.filter((timer) => !timer.cancelled && timer.at === clock + STOP_ACK_MS)
    expect(pending).toHaveLength(1)

    fake.interrupts[0](true)
    await reply

    expect(pending[0].cancelled).toBe(true)
    advance(STOP_RESULT_MS - 1)
    expect(sender.sent.filter((event) => event.name !== 'harness:said')).toEqual([])
    expect(snapshot(sender).runs[0].status).toBe('running')
  })

  it('ends the session with the run when an acknowledged interrupt is never followed by a result, STOP_RESULT_MS later', async () => {
    const { sender, fake, runId, sessionId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply

    advance(STOP_RESULT_MS)

    expect(fake.kills).toBe(1)
    expect(sender.names).toEqual(['run:stopped', 'harness:said', 'session:closed'])
    expect(sender.of('run:stopped')).toEqual([{ runId, sessionId, at: clock }])
    expect(sender.of('harness:said')).toEqual([{ sessionId, id: expect.any(String), text: LINES.stopUnfinished, at: clock }])
    expect(sender.of('run:failed')).toEqual([])
    expect(snapshot(sender).runs[0].status).toBe('stopped')
  })

  it('says in lower case, mono-register and without terminal punctuation that the stop was sent and the turn did not end', () => {
    expect(LINES.stopUnfinished).toBe('stop sent · the turn did not end · the session ended with the run')
    expect(LINES.stopUnfinished).toBe(LINES.stopUnfinished.toLowerCase())
    expect(LINES.stopUnfinished).not.toMatch(/[.!?]$/)
  })

  it('leaves the deadline alone when the result comes in time: the run ends once, the session stays open, and the late timer does nothing', async () => {
    const { sender, fake, runId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    advance(STOP_RESULT_MS - 1)
    fake.feed(result(true))
    const told = sender.sent.length

    advance(60_000)

    expect(sender.sent).toHaveLength(told)
    expect(sender.of('run:stopped')).toHaveLength(1)
    expect(fake.kills).toBe(0)
  })

  it('does not close a session whose next run began before the deadline: the timer is for the run that was stopped', async () => {
    const { sender, fake, runId, sessionId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))
    await call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, sender, sessionId, 'CP')

    advance(STOP_RESULT_MS)

    expect(fake.kills).toBe(0)
    expect(snapshot(sender).runs.at(-1)).toMatchObject({ status: 'running' })
  })
})

/** The CLI's list of what is still running behind the main thread. */
const tasks = (...ids: string[]) => ({ type: 'system', subtype: 'background_tasks_changed', tasks: ids.map((task_id) => ({ task_id })) })

describe('a stop while background subagents are live', () => {
  /** A run, a subagent running behind it, and a stop the CLI acknowledged. */
  async function stoppedWithTasks() {
    const scene = await running()
    scene.fake.feed(tasks('sub-1'))
    const reply = stopRun(scene.sender, scene.runId)
    await flush()
    scene.fake.interrupts[0](true)
    await reply
    return scene
  }

  it('ends the card as run:stopped on the interrupted turn’s failed result, which the live task has left the session busy after', async () => {
    const { sender, fake, runId, sessionId } = await stoppedWithTasks()

    fake.feed(result(true))

    expect(sender.of('run:stopped')).toEqual([{ runId, sessionId, at: clock }])
    expect(sender.of('run:failed')).toEqual([])
    expect(sender.of('run:finished')).toEqual([])
    expect(snapshot(sender).runs[0]).toMatchObject({ runId, status: 'stopped' })
  })

  it('says no failure for a stop the user asked for, and the persona reads `error` from the stop once the tasks have drained and it is no longer working', async () => {
    const { sender, fake } = await stoppedWithTasks()

    fake.feed(result(true))

    expect(sender.of('harness:said')).toEqual([])
    expect(snapshot(sender).entries).toEqual([])
    // Still working: the session is busy behind the run, and the persona reads what the session does.
    expect(sender.of('persona:state')).toEqual([])
    fake.feed(tasks())
    fake.feed(result(false))
    expect(sender.of('persona:state').map((event) => event.state)).toEqual(['error'])
  })

  it('keeps the session busy until its tasks drain, then frees it on the wake’s result without ending the run again', async () => {
    const { sender, fake, sessionId } = await stoppedWithTasks()
    fake.feed(result(true))
    expect(sender.of('session:awaiting-turn')).toEqual([])
    expect(snapshot(sender).busy).toEqual([sessionId])

    fake.feed(tasks())
    fake.feed(result(false))

    expect(sender.of('session:awaiting-turn')).toHaveLength(1)
    expect(sender.of('run:stopped')).toHaveLength(1)
    expect(sender.of('run:finished')).toEqual([])
    expect(snapshot(sender).busy).toEqual([])
    expect(snapshot(sender).runs[0].status).toBe('stopped')
  })

  it('ends the stopped run once, with no timer left to close the session, when the result comes before the deadline', async () => {
    const { sender, fake } = await stoppedWithTasks()
    fake.feed(result(true))
    const told = sender.sent.length

    advance(STOP_RESULT_MS * 2)

    expect(sender.sent).toHaveLength(told)
    expect(fake.kills).toBe(0)
  })

  it('still reports a failure the user did not ask for: a failed result with tasks live and no stop says it and ends nothing', async () => {
    const scene = await running()
    scene.fake.feed(tasks('sub-1'))

    scene.fake.feed(result(true))

    expect(scene.sender.of('harness:said').map((said) => said.text)).toEqual([LINES.failed('error_during_execution')])
    expect(scene.sender.of('run:stopped')).toEqual([])
    expect(snapshot(scene.sender).runs[0].status).toBe('running')
  })
})

/** A recording from the corpus: its frames, parsed, in order, counted from 0 (`meta.interruptedAtLine` is how many frames came before the interrupt). */
const recording = (scenario: string): unknown[] =>
  readFileSync(resolve(import.meta.dirname, '..', '..', 'fixtures', 'runs', `${scenario}.jsonl`), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown)

describe('a stop replayed from the live recordings of 10-06-2026 (claude 2.1.285)', () => {
  it('interrupt-inband-tasks-live: the CLI stops the tasks before it ends the turn, so the interrupted result finds none live and the run ends stopped', async () => {
    const frames = recording('interrupt-inband-tasks-live')
    const { sender, fake, runId, sessionId } = await running()
    // Frames 0 to 48, before the interrupt: two background subagents launched, both live.
    for (const frame of frames.slice(0, 49)) fake.feed(frame)
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    expect(snapshot(sender).runs[0].status).toBe('running')

    // Frames 49 to 59: the tasks `stopped` and the task list emptied (frame 52), the `control_response`, the interrupted user frame, the failed `result` (frame 59).
    for (const frame of frames.slice(49, 60)) fake.feed(frame)

    expect(sender.of('run:stopped')).toEqual([{ runId, sessionId, at: clock }])
    expect(sender.of('run:failed')).toEqual([])
    expect(sender.of('run:finished')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])
    expect(fake.kills).toBe(0)
    expect(sender.of('session:awaiting-turn')).toHaveLength(1)
    expect(snapshot(sender)).toMatchObject({ busy: [], runs: [{ runId, status: 'stopped' }] })

    // Frames 60 to 71 are the follow-up turn the recorder sent (`PONG`): here the user sends it, which spends what the stop held, so it is no second run.
    await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, sessionId, 'Reply with exactly the word PONG and nothing else.')).resolves.toEqual({ ok: true })
    for (const frame of frames.slice(60)) fake.feed(frame)
    expect(sender.of('run:started')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])
    expect(snapshot(sender)).toMatchObject({ busy: [], runs: [{ runId, status: 'stopped' }] })
  })

  it('interrupt-inband-tasks-live-mid-write: the run ends stopped, the empty turn starts nothing, and the turn the CLI then runs on its own is a second run, one line and a new run id after it', async () => {
    const frames = recording('interrupt-inband-tasks-live-mid-write')
    // The recording's `Write` names a file under the project it was made in, so the window holds that project.
    projectRoot = (JSON.parse(readFileSync(resolve(import.meta.dirname, '..', '..', 'fixtures', 'runs', 'interrupt-inband-tasks-live-mid-write.meta.json'), 'utf8')) as { cwd: string }).cwd
    templatePlan = { spine: ['Vision', 'Scope'], menu: [] }
    const { sender, fake, runId, sessionId } = await running()
    for (const frame of frames.slice(0, 325)) fake.feed(frame)
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply

    // Frames 325 to 335: tasks stopped, the list emptied (frame 330), the `control_response`, the failed `result` (frame 335).
    for (const frame of frames.slice(325, 336)) fake.feed(frame)
    expect(sender.of('run:stopped')).toEqual([{ runId, sessionId, at: clock }])
    expect(sender.of('session:awaiting-turn')).toHaveLength(1)

    // Frames 336 and 337: an empty turn nobody sent (`init`, then a `result` with `num_turns: 0`). It starts nothing and says nothing.
    for (const frame of frames.slice(336, 338)) fake.feed(frame)
    expect(sender.of('run:started')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])

    // Frame 338 on: the turn in which the persona carries on and `Write`s `notes.md`, ended by the `result` at 1432.
    for (const frame of frames.slice(338)) fake.feed(frame)

    expect(sender.names.filter((name) => name !== 'doc:prose' && name !== 'run:step').slice(0, 4)).toEqual(['run:stopped', 'session:awaiting-turn', 'harness:said', 'run:started'])
    expect(sender.of('run:started')).toEqual([
      { runId: 'r2', sessionId, agentId: A, code: 'CP', skill: 'bmad-prd', plan: ['Vision', 'Scope'], at: clock }
    ])
    expect(sender.of('harness:said').map((said) => said.text)).toEqual([LINES.carriedOn])
    expect(sender.of('run:stopped')).toHaveLength(1)
    expect(sender.of('run:failed')).toEqual([])
    expect(sender.of('run:finished')).toEqual([{ runId: 'r2', sessionId, at: clock }])
    expect(sender.names.at(-2)).toBe('run:finished')
    expect(sender.names.at(-1)).toBe('session:awaiting-turn')
    // The write is the second card's: every document event after the line carries the new run id and names `notes.md`.
    // (The first run's own `Write` of `notes.md` was interrupted mid-stream, and is its card's.)
    const started = sender.sent.findIndex((event) => event.name === 'run:started')
    const documents = sender.sent.filter((event, at) => at > started && (event.name === 'doc:prose' || event.name === 'doc:committed'))
    expect(documents.length).toBeGreaterThan(0)
    expect(documents.map((event) => [(event.payload as { runId: string }).runId, (event.payload as { path: string }).path])).toEqual(
      documents.map(() => ['r2', 'notes.md'])
    )
    expect(sender.of('doc:committed').map((committed) => [committed.runId, committed.path, committed.ok])).toEqual([['r2', 'notes.md', true]])
    expect(snapshot(sender).runs.map((run) => [run.runId, run.status, run.agentId])).toEqual([
      [runId, 'stopped', A],
      ['r2', 'finished', A]
    ])
    expect(snapshot(sender).runs[1]).toMatchObject({ code: 'CP', plan: ['Vision', 'Scope'], documents: [expect.objectContaining({ path: 'notes.md' })] })
    // The first run's steps are its two Agent spawns, both answered: its interrupted `Write` was never whole, so is none. The second run's is the `Write` of `notes.md`, under the new run id.
    const stepsOf = (id: string) => sender.of('run:step').filter((step) => step.runId === id)
    expect(stepsOf(runId).map((step) => step.status)).toEqual(['running', 'done', 'running', 'done'])
    expect(stepsOf('r2').map((step) => [step.status, 'label' in step ? step.label : undefined])).toEqual([['running', 'write notes.md'], ['done', undefined]])
    expect(snapshot(sender).runs.map((run) => run.steps.map((step) => step.status))).toEqual([['done', 'done'], ['done']])
    expect(sender.of('run:failed')).toEqual([])
    expect(fake.kills).toBe(0)
    expect(fake.interrupts).toHaveLength(1)
    expect(snapshot(sender).busy).toEqual([])
  })

  it('interrupt-inband-idle: an interrupt on a session with nothing in flight is answered by a `control_response` and no `result`, and the run it would have stopped is not found', async () => {
    const frames = recording('interrupt-inband-idle') as { type: string; response?: { subtype: string } }[]
    const answered = frames.findIndex((frame) => frame.type === 'control_response')
    const results = frames.flatMap((frame, at) => (frame.type === 'result' ? [at] : []))

    // The first `result` ends the only turn; the answer follows it; the next frames are the next turn's.
    expect(results[0]).toBeLessThan(answered)
    expect(frames.slice(results[0] + 1, answered + 1).some((frame) => frame.type === 'result')).toBe(false)
    expect(results[1]).toBeGreaterThan(answered)

    const { sender, fake, runId } = await running()
    // The registry sees the run over (the persona's turn ended), so a stop for it finds nothing to stop.
    fake.feed(result())
    sender.sent = []
    await expect(stopRun(sender, runId)).resolves.toEqual(NOT_FOUND)
    expect(fake.interrupts).toHaveLength(0)
    expect(sender.sent).toEqual([])
  })

  it('interrupt-inband-idle, in full: nothing was stopped, so nothing is held, and the next turn the recorder sent is no second run', async () => {
    const frames = recording('interrupt-inband-idle')
    const { sender, fake, sessionId } = await running()
    // Frames 0 to 14: the run's turn, ended by its `result`. Frame 15 is the answer to an interrupt nobody had anything to stop.
    for (const frame of frames.slice(0, 16)) fake.feed(frame)
    expect(sender.of('run:finished')).toHaveLength(1)
    await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, sessionId, 'the recorder’s next turn')).resolves.toEqual({ ok: true })
    for (const frame of frames.slice(16)) fake.feed(frame)

    expect(sender.of('run:started')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])
    expect(sender.of('run:stopped')).toEqual([])
    expect(snapshot(sender).runs).toHaveLength(1)
  })
})

describe('a stop the CLI did not acknowledge', () => {
  /** The whole fallback, as the window hears it, for a stop that ends the way `refuse` makes it end. */
  async function unanswered(refuse: (fake: FakeSession) => void | Promise<void>) {
    const scene = await running()
    const reply = stopRun(scene.sender, scene.runId)
    await flush()
    await refuse(scene.fake)
    return { ...scene, reply }
  }

  const FALLBACKS: [string, (fake: FakeSession) => void | Promise<void>][] = [
    ['a refusal (another subtype)', (fake) => fake.interrupts[0](false)],
    ['silence for STOP_ACK_MS', () => advance(STOP_ACK_MS)]
  ]

  it.each(FALLBACKS)('on %s: kills the process group, ends the card once as run:stopped, says so in the harness’s voice and closes the session', async (_name, refuse) => {
    const { sender, fake, runId, sessionId, reply } = await unanswered(refuse)

    await expect(reply).resolves.toEqual({ ok: true })

    expect(fake.kills).toBe(1)
    expect(sender.names).toEqual(['run:stopped', 'harness:said', 'session:closed'])
    expect(sender.of('run:stopped')).toEqual([{ runId, sessionId, at: clock }])
    expect(sender.of('harness:said')).toEqual([{ sessionId, id: expect.any(String), text: LINES.stopEnded, at: clock }])
    expect(sender.of('session:closed')).toEqual([{ sessionId, agentId: A, reason: 'closed', at: clock }])
    expect(sender.of('run:failed')).toEqual([])
    expect(snapshot(sender)).toMatchObject({ sessions: [], busy: [], runs: [{ runId, status: 'stopped' }] })
  })

  it('says it in lower case, mono-register, `·`-separated and without terminal punctuation, as a line of the harness’s own', async () => {
    const { sender } = await unanswered((fake) => fake.interrupts[0](false))

    expect(LINES.stopEnded).toBe('stop not acknowledged · the session ended with the run')
    expect(LINES.stopEnded).toBe(LINES.stopEnded.toLowerCase())
    expect(LINES.stopEnded).not.toMatch(/[.!?]$/)
    expect(snapshot(sender).entries).toEqual([expect.objectContaining({ kind: 'sysline', text: LINES.stopEnded })])
  })

  it('does not wait for STOP_ACK_MS before it has passed: a stop still unanswered a moment short of it ends nothing', async () => {
    const { sender, fake } = await unanswered(() => advance(STOP_ACK_MS - 1))

    expect(sender.sent).toEqual([])
    expect(fake.kills).toBe(0)
  })

  it('falls back when the interrupt cannot be asked: a throw is a stop that was not acknowledged', async () => {
    const scene = await running()
    scene.fake.interruptThrows = true

    await expect(stopRun(scene.sender, scene.runId)).resolves.toEqual({ ok: true })

    expect(scene.sender.names).toEqual(['run:stopped', 'harness:said', 'session:closed'])
    expect(scene.fake.kills).toBe(1)
  })

  it('ends the run exactly once, and ignores an acknowledgement that comes late', async () => {
    const { sender, fake, reply } = await unanswered(() => advance(STOP_ACK_MS))
    await reply
    const told = sender.sent.length

    fake.interrupts[0](true)
    await flush()
    fake.feed(result(true))
    advance(60_000)

    expect(sender.sent).toHaveLength(told)
    expect(fake.kills).toBe(1)
    expect(sender.of('run:stopped')).toHaveLength(1)
  })

  it('leaves the session closed: a send to it is refused as no such session, and the card and transcript stay', async () => {
    const { sender, sessionId, reply } = await unanswered((fake) => fake.interrupts[0](false))
    await reply

    await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, sessionId, 'hello')).resolves.toMatchObject({ ok: false, error: { code: 'session/not-found' } })
    expect(snapshot(sender).runs).toHaveLength(1)
    expect(snapshot(sender).entries).toHaveLength(1)
  })

  it('does not end the run twice when the process then exits on its own: the exit finds the session closed', async () => {
    const { sender, fake, reply } = await unanswered((answering) => answering.interrupts[0](false))
    await reply
    const told = sender.sent.length

    fake.exit()

    expect(sender.sent).toHaveLength(told)
  })

  it('ends as the stop it was, once, when the process exits before the answer: the exit says its own line and the group is not killed again', async () => {
    const scene = await running()
    const reply = stopRun(scene.sender, scene.runId)
    await flush()

    scene.fake.exit()
    scene.fake.interrupts[0](false)
    await reply

    expect(scene.sender.names).toEqual(['harness:said', 'run:stopped', 'session:closed'])
    expect(scene.sender.of('harness:said')[0].text).toBe(LINES.exited)
    expect(scene.sender.of('run:failed')).toEqual([])
    expect(scene.fake.kills).toBe(0)
  })

  it('ends as the stop it was when the session is closed while its stop is waiting', async () => {
    const { sender, fake, runId, sessionId } = await running()
    const reply = stopRun(sender, runId)
    await flush()

    expect(call(SESSION_CLOSE_CHANNEL, sender, sessionId)).toEqual({ ok: true })
    fake.interrupts[0](false)
    await reply

    // The seat's own line is said first (Story 7.4), then the run ends, then the session closes.
    expect(sender.names).toEqual(['harness:said', 'run:stopped', 'session:closed'])
  })

  it('still ends as failed when the session is closed under a run nobody asked to stop', async () => {
    const { sender, sessionId } = await running()

    expect(call(SESSION_CLOSE_CHANNEL, sender, sessionId)).toEqual({ ok: true })

    expect(sender.names).toEqual(['harness:said', 'run:failed', 'session:closed'])
  })

  it('leaves a session whose turn ended first alone: no kill, no line, the session open, and only the run’s own end told', async () => {
    const { sender, fake, sessionId, runId } = await running()
    const reply = stopRun(sender, runId)
    await flush()

    fake.feed(result(false))
    fake.interrupts[0](false)
    await expect(reply).resolves.toEqual({ ok: true })

    expect(fake.kills).toBe(0)
    expect(sender.of('harness:said')).toEqual([])
    expect(sender.names).toEqual(['run:finished', 'session:awaiting-turn'])
    expect(snapshot(sender).sessions).toEqual([{ agentId: A, sessionId }])
    expect(snapshot(sender).entries).toEqual([])
  })

  it('leaves the next run alone when the silence runs out after another run began in the session: it is still running', async () => {
    const { sender, fake, sessionId, runId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    fake.feed(result(false))
    await expect(call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, sender, sessionId, 'CP')).resolves.toEqual({ ok: true, runId: 'r2' })

    advance(STOP_ACK_MS)
    await expect(reply).resolves.toEqual({ ok: true })

    expect(fake.kills).toBe(0)
    expect(sender.of('harness:said')).toEqual([])
    expect(sender.names).toEqual(['run:finished', 'session:awaiting-turn', 'run:started'])
    expect(sender.of('run:stopped')).toEqual([])
    expect(snapshot(sender).sessions).toEqual([{ agentId: A, sessionId }])
    expect(snapshot(sender).runs.map((run) => [run.runId, run.status])).toEqual([
      [runId, 'finished'],
      ['r2', 'running']
    ])
  })
})

/** A message begins on the main thread: a turn nobody sent, when the session is free. */
const unsent = (id = 'm-unsent') => ({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id } } })
/** The empty turn the CLI runs first after a stop: an `init` and a `result` with no message of its own. */
const emptyTurn = () => [{ type: 'system', subtype: 'init' }, { ...result(false), num_turns: 0 }]
const memlog = (...entries: string[]) => `---\nkind: memlog\n---\n${entries.map((entry) => `- ${entry}`).join('\n')}\n`

describe('the work that carries on after a stop', () => {
  /** A run the user stopped, its failed `result` in, and the session free. */
  async function stopped() {
    const scene = await running()
    const reply = stopRun(scene.sender, scene.runId)
    await flush()
    scene.fake.interrupts[0](true)
    await reply
    scene.fake.feed(result(true))
    scene.sender.sent = []
    return scene
  }
  /** Stop the run in flight, whatever it is, and end its turn on the failed `result`. */
  async function stopAgain(scene: { sender: FakeSender; fake: FakeSession }, runId: string) {
    const reply = stopRun(scene.sender, runId)
    await flush()
    scene.fake.interrupts.at(-1)!(true)
    await reply
    scene.fake.feed(result(true))
  }

  it('starts a run for a turn nobody sent: one harness line, then run:started for the same session, code and plan, under a new run id', async () => {
    templatePlan = { spine: ['Vision', 'Scope'], menu: ['Risks'] }
    const { sender, fake, sessionId, runId } = await stopped()
    expect(runId).toBe('r1')

    fake.feed(unsent())

    expect(sender.names).toEqual(['harness:said', 'run:started'])
    expect(sender.of('harness:said')).toEqual([{ sessionId, id: expect.any(String), text: LINES.carriedOn, at: clock }])
    expect(sender.of('run:started')).toEqual([{ runId: 'r2', sessionId, agentId: A, code: 'CP', skill: 'bmad-prd', plan: ['Vision', 'Scope'], at: clock }])
    expect(snapshot(sender).runs.map((run) => [run.runId, run.status])).toEqual([
      ['r1', 'stopped'],
      ['r2', 'running']
    ])
    expect(snapshot(sender).entries).toEqual([expect.objectContaining({ kind: 'sysline', text: LINES.carriedOn })])
    expect(snapshot(sender).busy).toEqual([sessionId])
  })

  it('says nothing and starts nothing for the empty turn the CLI runs first, and starts the run when the turn that follows it begins', async () => {
    const { sender, fake } = await stopped()

    for (const frame of emptyTurn()) fake.feed(frame)
    expect(sender.sent.filter((event) => event.name !== 'persona:state')).toEqual([])

    fake.feed(unsent())
    expect(sender.names).toEqual(['harness:said', 'run:started'])
  })

  it('gives the turn’s writes to the new card: the document events carry the new run id, from the first prose', async () => {
    const { sender, fake } = await stopped()
    const write = (partial: string) => ({
      type: 'stream_event',
      parent_tool_use_id: null,
      event: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: partial } }
    })
    fake.feed(unsent())
    fake.feed({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'Write', input: {} } } })
    fake.feed(write(`{"file_path":"${ROOT}/notes.md","content":"# Notes\\nwords`))
    advance(1_000)

    expect(sender.of('doc:prose').map((prose) => [prose.runId, prose.path])).toEqual([['r2', 'notes.md']])
    expect(snapshot(sender).runs[1].documents).toEqual([expect.objectContaining({ path: 'notes.md' })])
    expect(snapshot(sender).runs[0].documents).toEqual([])
  })

  it('ends the continuation on its own result: run:finished on its id for a success, with the one line and the hold gone', async () => {
    const { sender, fake, sessionId } = await stopped()
    fake.feed(unsent())

    fake.feed(result(false))

    expect(sender.names).toEqual(['harness:said', 'run:started', 'run:finished', 'session:awaiting-turn'])
    expect(sender.of('run:finished')).toEqual([{ runId: 'r2', sessionId, at: clock }])
    // Held no longer: the next turn nobody sends is none of the run's.
    fake.feed(unsent('m2'))
    fake.feed(result(false))
    expect(sender.of('run:started')).toHaveLength(1)
    expect(sender.of('harness:said')).toHaveLength(1)
  })

  it('ends the continuation as run:failed for an is_error result, says the failure, and holds nothing', async () => {
    const { sender, fake, sessionId } = await stopped()
    fake.feed(unsent())

    fake.feed(result(true, 'error_max_turns'))

    expect(sender.of('run:failed')).toEqual([{ runId: 'r2', sessionId, error: { code: 'run/failed', message: 'run · the run failed', detail: 'error_max_turns' }, at: clock }])
    expect(sender.of('harness:said').map((said) => said.text)).toEqual([LINES.carriedOn, LINES.failed('error_max_turns')])
    fake.feed(unsent('m2'))
    expect(sender.of('run:started')).toHaveLength(1)
  })

  it('is stopped as any run is: one interrupt on the continuation, run:stopped on the interrupted result, the session open, and the hold set again so a further resume starts a further run', async () => {
    const scene = await stopped()
    const { sender, fake, sessionId } = scene
    fake.feed(unsent())
    const written = fake.writes.length

    await stopAgain(scene, 'r2')

    expect(fake.interrupts).toHaveLength(2)
    expect(fake.writes).toHaveLength(written)
    expect(sender.of('run:stopped')).toEqual([{ runId: 'r2', sessionId, at: clock }])
    expect(sender.of('run:failed')).toEqual([])
    expect(fake.kills).toBe(0)

    fake.feed(unsent('m3'))

    expect(sender.of('run:started').map((started) => [started.runId, started.code])).toEqual([['r2', 'CP'], ['r3', 'CP']])
    expect(sender.of('harness:said').map((said) => said.text)).toEqual([LINES.carriedOn, LINES.carriedOn])
    expect(fake.interrupts).toHaveLength(2)
  })

  it('gives the continuation the stopped run’s skill with its code and plan, and again after a second stop (Story 3.18)', async () => {
    templatePlan = { spine: ['Vision', 'Scope'], menu: [] }
    const scene = await stopped()
    const { sender, fake } = scene
    fake.feed(unsent())

    expect(sender.of('run:started').map((started) => [started.runId, started.code, started.skill, started.plan])).toEqual([
      ['r2', 'CP', 'bmad-prd', ['Vision', 'Scope']]
    ])
    expect(snapshot(sender).runs[1].skill).toBe('bmad-prd')

    await stopAgain(scene, 'r2')
    fake.feed(unsent('m3'))
    expect(sender.of('run:started').map((started) => [started.runId, started.skill])).toEqual([['r2', 'bmad-prd'], ['r3', 'bmad-prd']])
  })

  it('carries on a stopped prompt run with no skill, and no key', async () => {
    const scene = await running(A, new FakeSender(1), 'VP')
    const reply = stopRun(scene.sender, scene.runId)
    await flush()
    scene.fake.interrupts[0](true)
    await reply
    scene.fake.feed(result(true))
    scene.sender.sent = []

    scene.fake.feed(unsent())

    expect(scene.sender.of('run:started')).toHaveLength(1)
    expect(scene.sender.of('run:started')[0]).not.toHaveProperty('skill')
    expect(snapshot(scene.sender).runs[1]).not.toHaveProperty('skill')
  })

  it('lets the skill go with the hold: a send, a dispatch or any other ending leaves a later turn nobody sent with no run to carry it', async () => {
    const sent = await stopped()
    await call<Promise<unknown>>(TURN_SEND_CHANNEL, sent.sender, sent.sessionId, 'something else')
    sent.fake.feed(result(false))
    sent.sender.sent = []
    sent.fake.feed(unsent())
    expect(sent.sender.of('run:started')).toEqual([])

    const finished = await running(B, new FakeSender(2))
    finished.fake.feed(result(false))
    finished.sender.sent = []
    finished.fake.feed(unsent())
    expect(finished.sender.of('run:started')).toEqual([])
  })

  it('writes no interrupt and no turn of its own, and offers nothing: the line is the only thing the harness adds', async () => {
    const { sender, fake } = await stopped()
    const written = fake.writes.length

    fake.feed(unsent())
    fake.feed(result(false))

    expect(fake.writes).toHaveLength(written)
    expect(fake.interrupts).toHaveLength(1)
    expect(fake.kills).toBe(0)
    expect(sender.names.filter((name) => name !== 'persona:state')).toEqual(['harness:said', 'run:started', 'run:finished', 'session:awaiting-turn'])
  })

  it('starts nothing for an unsent turn after a run that finished, and nothing after one that failed', async () => {
    const finished = await running()
    finished.fake.feed(result(false))
    finished.sender.sent = []
    finished.fake.feed(unsent())
    expect(finished.sender.of('run:started')).toEqual([])
    expect(finished.sender.of('harness:said')).toEqual([])

    const failed = await running(B, new FakeSender(2))
    failed.fake.feed(result(true))
    failed.sender.sent = []
    failed.fake.feed(unsent())
    expect(failed.sender.of('run:started')).toEqual([])
    expect(failed.sender.of('harness:said')).toEqual([])
  })

  it('starts nothing once the user has sent a turn since the stop: the hold is gone', async () => {
    const { sender, fake, sessionId } = await stopped()
    await call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, sessionId, 'something else')
    fake.feed(result(false))

    fake.feed(unsent())

    expect(sender.of('run:started')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])
  })

  it('starts nothing once the user has dispatched an entry since the stop, and holds what that run carries instead', async () => {
    const { sender, fake, sessionId } = await stopped()
    await call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, sender, sessionId, 'CP')
    fake.feed(result(false))
    sender.sent = []

    fake.feed(unsent())

    expect(sender.of('run:started')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])
  })

  it('starts nothing for a session that never ran: a fresh session’s unsent turn is no run', async () => {
    const sender = new FakeSender(1)
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, A)
    const fake = fakes.get(A)!
    fake.feed(result())

    fake.feed(unsent())

    expect(sender.of('run:started')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])
  })

  it('makes a background subagent finishing during a run part of that run: no second run starts', async () => {
    const { sender, fake, runId } = await running()
    fake.feed(tasks('sub-1'))
    fake.feed(result(false))
    fake.feed(tasks())
    fake.feed(unsent())
    fake.feed(result(false))

    expect(sender.of('run:started')).toEqual([])
    expect(sender.of('run:finished')).toEqual([expect.objectContaining({ runId })])
  })

  it('starts the run after a stop that left background tasks live, once they drain and the session is free', async () => {
    const scene = await running()
    scene.fake.feed(tasks('sub-1'))
    const reply = stopRun(scene.sender, scene.runId)
    await flush()
    scene.fake.interrupts[0](true)
    await reply
    scene.fake.feed(result(true))
    scene.fake.feed(tasks())
    scene.fake.feed(result(false))
    scene.sender.sent = []

    scene.fake.feed(unsent())

    expect(scene.sender.names).toEqual(['harness:said', 'run:started'])
  })

  it('carries the plan as it then stood, the sections a concern scan pulled included', async () => {
    templatePlan = { spine: ['Vision'], menu: ['Risks', 'Users'] }
    const scene = await running()
    memlogText = memlog('(event) opened')
    await observe(scene.sender, { type: 'artifact:found', path: '_bmad/work/.memlog.md' })
    memlogText = memlog('(event) opened', '(event) concern scan surfaced: Risks')
    await observe(scene.sender, { type: 'artifact:written', path: '_bmad/work/.memlog.md' })
    expect(scene.sender.of('run:note')[0].pulled).toEqual(['Risks'])
    const reply = stopRun(scene.sender, scene.runId)
    await flush()
    scene.fake.interrupts[0](true)
    await reply
    scene.fake.feed(result(true))
    scene.sender.sent = []

    scene.fake.feed(unsent())

    expect(scene.sender.of('run:started')[0].plan).toEqual(['Vision', 'Risks'])
    // And the menu goes with it: a note of the continuation can pull what the first did not.
    memlogText = memlog('(event) opened', '(event) concern scan surfaced: Risks', '(event) concern scan surfaced: Users')
    await observe(scene.sender, { type: 'artifact:written', path: '_bmad/work/.memlog.md' })
    expect(scene.sender.of('run:note').at(-1)).toMatchObject({ runId: 'r2', pulled: ['Users'] })
  })

  it('starts a run with no plan for a stopped run that had none: `run:started` carries no plan', async () => {
    const { sender, fake } = await stopped()

    fake.feed(unsent())

    expect(sender.of('run:started')[0]).not.toHaveProperty('plan')
  })

  it('starts nothing after the fallback: the session was ended with the run, and a frame to a closed entry is dropped', async () => {
    const scene = await running()
    const reply = stopRun(scene.sender, scene.runId)
    await flush()
    scene.fake.interrupts[0](false)
    await reply
    scene.sender.sent = []

    scene.fake.feed(unsent())

    expect(scene.sender.sent).toEqual([])
    expect(snapshot(scene.sender).sessions).toEqual([])
  })

  it('starts nothing for a turn that has not happened: a window that reloads reads the cards as they are, and a stop alone is no turn', async () => {
    const { sender } = await stopped()

    snapshot(sender)
    advance(60_000)

    expect(sender.of('run:started')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])
    expect(snapshot(sender).runs.map((run) => run.status)).toEqual(['stopped'])
  })

  it('says it in lower case, mono-register, `·`-separated and without terminal punctuation', () => {
    expect(LINES.carriedOn).toBe('carried on after the stop · a new run follows it')
    expect(LINES.carriedOn).toBe(LINES.carriedOn.toLowerCase())
    expect(LINES.carriedOn).not.toMatch(/[.!?:;,]$/)
    expect(LINES.carriedOn.split(' · ')).toHaveLength(2)
    expect(LINES.carriedOn).not.toMatch(/resum|continu|retry|try again|please|should|you/i)
  })
})

describe('stopping twice', () => {
  it('resolves ok for a run already stopping and writes no second interrupt', async () => {
    const { sender, fake, runId } = await running()
    const first = stopRun(sender, runId)
    await flush()

    await expect(stopRun(sender, runId)).resolves.toEqual({ ok: true })
    await expect(stopRun(sender, runId)).resolves.toEqual({ ok: true })

    expect(fake.interrupts).toHaveLength(1)
    fake.interrupts[0](true)
    await first
    expect(fake.interrupts).toHaveLength(1)
  })
})

describe('a stop with nothing to stop', () => {
  it('is run/not-found for a run that already ended, however it ended', async () => {
    const { sender, fake, runId } = await running()
    fake.feed(result(false))
    await expect(stopRun(sender, runId)).resolves.toEqual(NOT_FOUND)
    expect(fake.interrupts).toHaveLength(0)
  })

  it('is run/not-found for a run that was stopped and has since ended', async () => {
    const { sender, fake, runId } = await running()
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))

    await expect(stopRun(sender, runId)).resolves.toEqual(NOT_FOUND)
  })

  it.each([['an id nobody has', 'r-unknown'], ['no id', undefined], ['null', null], ['a number', 1], ['an object', { runId: 'r1' }], ['a session id', 's1']])(
    'is run/not-found for %s, and writes nothing',
    async (_name, id) => {
      const { sender, fake } = await running()
      const written = fake.writes.length

      await expect(stopRun(sender, id)).resolves.toEqual(NOT_FOUND)

      expect(fake.interrupts).toHaveLength(0)
      expect(fake.writes).toHaveLength(written)
    }
  )

  it('is run/not-found for a window with no sessions at all', async () => {
    await expect(stopRun(new FakeSender(9), 'r1')).resolves.toEqual(NOT_FOUND)
  })

  it('is run/not-found for another window’s run, and stops nothing of that window’s', async () => {
    const mine = await running()
    const stranger = new FakeSender(2)
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, stranger, B)
    fakes.get(B)!.feed(result())

    await expect(stopRun(stranger, mine.runId)).resolves.toEqual(NOT_FOUND)

    expect(mine.fake.interrupts).toHaveLength(0)
    expect(mine.fake.kills).toBe(0)
  })

  it('is run/not-found once the session was closed under the run', async () => {
    const { sender, runId, sessionId } = await running()
    call(SESSION_CLOSE_CHANNEL, sender, sessionId)

    await expect(stopRun(sender, runId)).resolves.toEqual(NOT_FOUND)
  })

  it('is run/not-found for a run that was started in this window and ended by `conversation.end`', async () => {
    const { sender, runId } = await running()
    call(CONVERSATION_END_CHANNEL, sender, ROOT)

    await expect(stopRun(sender, runId)).resolves.toEqual(NOT_FOUND)
  })
})

describe('a stop is found by run id, never through the roster', () => {
  it('stops the run of the one session whose run it is, and leaves another session’s run in flight', async () => {
    const sender = new FakeSender(1)
    const john = await running(A, sender)
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, B)
    const mary = fakes.get(B)!
    mary.feed(result())
    const second = (await call<Promise<{ ok: true; runId: string }>>(MENU_DISPATCH_CHANNEL, sender, 's2', 'CP')) as { ok: true; runId: string }
    expect(second.runId).not.toBe(john.runId)

    const reply = stopRun(sender, second.runId)
    await flush()

    expect(mary.interrupts).toHaveLength(1)
    expect(john.fake.interrupts).toHaveLength(0)
    mary.interrupts[0](true)
    await reply
    mary.feed(result(true))
    expect(snapshot(sender).runs.map((run) => [run.runId, run.status])).toEqual([
      [john.runId, 'running'],
      [second.runId, 'stopped']
    ])
  })

  it('halts an orphan’s run exactly as it halts a rostered persona’s, and never closes the session, whatever the install says now', async () => {
    const { sender, fake, runId, sessionId } = await running()
    roster = false

    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))

    expect(sender.names).toEqual(['run:stopped', 'session:awaiting-turn'])
    expect(sender.of('session:closed')).toEqual([])
    expect(fake.kills).toBe(0)
    expect(snapshot(sender).sessions).toEqual([{ agentId: A, sessionId }])
    // The session is still the persona’s, and takes a turn once the agent returns.
    roster = true
    await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, sessionId, 'welcome back')).resolves.toEqual({ ok: true })
  })

  it('changes no run, card or stop when the roster changes mid-run: the same run, card and stop afterwards', async () => {
    const { sender, fake, runId } = await running()
    const before = snapshot(sender).runs

    roster = false
    expect(snapshot(sender).runs).toEqual(before)
    roster = true
    expect(snapshot(sender).runs).toEqual(before)

    const reply = stopRun(sender, runId)
    await flush()
    expect(fake.interrupts).toHaveLength(1)
    fake.interrupts[0](true)
    await reply
  })

  it('ends an orphan’s run through the existing path when its session is closed: failed, before the session closes, card and transcript kept', async () => {
    const { sender, fake, runId, sessionId } = await running()
    roster = false
    const entries = snapshot(sender).entries.length

    expect(call(SESSION_CLOSE_CHANNEL, sender, sessionId)).toEqual({ ok: true })

    expect(sender.names).toEqual(['harness:said', 'run:failed', 'session:closed'])
    expect(sender.of('run:failed')[0]).toMatchObject({ runId, error: { code: 'run/session-ended', message: 'run · the session ended' } })
    expect(fake.kills).toBe(1)
    expect(snapshot(sender).runs).toMatchObject([{ runId, status: 'failed', error: { code: 'run/session-ended' } }])
    // Nothing is removed: the one new record is the seat's own ending line (Story 7.4).
    expect(snapshot(sender).entries).toHaveLength(entries + 1)
    expect(snapshot(sender).entries.at(-1)).toMatchObject({ kind: 'sysline', text: expect.stringMatching(/^session closed · .+ starts fresh on the next message$/) })
  })
})

describe('what a stop never does', () => {
  it('asks the process nothing but the interrupt: no turn is written, no second line, and the kill is the fallback’s alone', async () => {
    const { sender, fake, runId } = await running()
    const written = fake.writes.length
    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))

    expect(fake.writes).toHaveLength(written)
    expect(fake.interrupts).toHaveLength(1)
    expect(fake.kills).toBe(0)
  })

  it('keeps a document the run was writing as it was streamed: the stop commits nothing and discards nothing', async () => {
    const { sender, fake, runId } = await running()
    const delta = (partial: string) => ({
      type: 'stream_event',
      parent_tool_use_id: null,
      event: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: partial } }
    })
    fake.feed({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'm1' } } })
    fake.feed({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'Write', input: {} } } })
    fake.feed(delta(`{"file_path":"${ROOT}/prd.md","content":"# Vision\\nWor`))
    advance(1_000)
    const held = snapshot(sender).runs[0].documents

    const reply = stopRun(sender, runId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))

    expect(sender.of('doc:committed')).toEqual([])
    expect(snapshot(sender).runs[0].documents).toEqual(held)
    expect(snapshot(sender).runs[0].documents[0]).toMatchObject({ path: 'prd.md', text: '# Vision\nWor' })
  })
})

const stopTurn = (sender: FakeSender, sessionId: unknown) => call<Promise<unknown>>(TURN_STOP_CHANNEL, sender, sessionId)
const TURN_NOT_FOUND = { ok: false, error: { code: 'turn/not-found', message: 'turn · no turn is in flight' } }

/** One window, one persona's session open and its activation over, and a plain chat turn sent into it. */
async function chatting(agent = A, sender = new FakeSender(1)) {
  await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, agent)
  const fake = fakes.get(agent)!
  fake.feed(result())
  const sessionId = `s${sessions}`
  await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, sessionId, 'tell me about tides')).resolves.toEqual({ ok: true })
  sender.sent = []
  return { sender, fake, sessionId }
}

describe('stopping a plain chat turn (Story 3.19)', () => {
  it('asks the session for one interrupt, writes nothing as a turn and tells the window nothing until the result', async () => {
    const { sender, fake, sessionId } = await chatting()
    const written = fake.writes.length

    const reply = stopTurn(sender, sessionId)
    await flush()

    expect(fake.interrupts).toHaveLength(1)
    expect(fake.writes).toHaveLength(written)
    expect(sender.sent).toEqual([])
    expect(fake.kills).toBe(0)
    fake.interrupts[0](true)
    await expect(reply).resolves.toEqual({ ok: true })
    expect(sender.sent).toEqual([])
    expect(snapshot(sender).busy).toEqual([sessionId])
  })

  it('reads the failed result as the stop: one harness line before the session is free, no failure line, no run event, the session open', async () => {
    const { sender, fake, sessionId } = await chatting()
    const reply = stopTurn(sender, sessionId)
    await flush()
    fake.interrupts[0](true)
    await reply

    fake.feed(result(true))

    expect(sender.names).toEqual(['harness:said', 'session:awaiting-turn'])
    expect(sender.of('harness:said')).toEqual([{ sessionId, id: expect.any(String), text: LINES.stopped, at: clock }])
    expect(fake.kills).toBe(0)
    expect(snapshot(sender)).toMatchObject({ sessions: [{ agentId: A, sessionId }], busy: [], runs: [] })
    expect(snapshot(sender).entries.filter((entry) => entry.kind === 'sysline')).toEqual([expect.objectContaining({ text: LINES.stopped })])
  })

  it('leaves the persona at rest and never `error`: no turn failed', async () => {
    const { sender, fake, sessionId } = await chatting()
    const reply = stopTurn(sender, sessionId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))

    const states = sender.of('persona:state').map((event) => event.state)
    expect(states).not.toContain('error')
    expect(states.at(-1)).toBe('idle')
  })

  it('marks the turn before the interrupt is written: an answer and a failed result in the same tick are still the stop', async () => {
    const { sender, fake, sessionId } = await chatting()
    fake.duringInterrupt = () => fake.feed(result(true))

    const reply = stopTurn(sender, sessionId)
    await flush()
    fake.interrupts[0](true)
    await reply

    expect(sender.names).toEqual(['harness:said', 'session:awaiting-turn'])
    expect(sender.of('harness:said').map((line) => line.text)).toEqual([LINES.stopped])
  })

  it('accepts the next turn into the same process, and a later failed turn is a failure again', async () => {
    const { sender, fake, sessionId } = await chatting()
    const reply = stopTurn(sender, sessionId)
    await flush()
    fake.interrupts[0](true)
    await reply
    fake.feed(result(true))
    const written = fake.writes.length

    await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, sessionId, 'pick that back up')).resolves.toEqual({ ok: true })
    expect(fake.writes).toHaveLength(written + 1)
    fake.feed(result(true))

    expect(sender.of('harness:said').map((line) => line.text)).toEqual([LINES.stopped, LINES.failed('error_during_execution')])
    expect(fakes.size).toBe(1)
  })

  it('writes no line for a turn that ended on its own before the stop was acknowledged, and kills nothing', async () => {
    const { sender, fake, sessionId } = await chatting()
    const reply = stopTurn(sender, sessionId)
    await flush()

    fake.feed(result(false))
    fake.interrupts[0](true)
    await reply
    advance(STOP_RESULT_MS + STOP_ACK_MS)

    expect(sender.names).toEqual(['session:awaiting-turn'])
    expect(fake.kills).toBe(0)
  })

  it('writes the stopped line for a result that leaves the session busy with background tasks, once: the wake adds none and no fallback follows', async () => {
    const { sender, fake, sessionId } = await chatting()
    fake.feed(tasks('sub-1'))
    const reply = stopTurn(sender, sessionId)
    await flush()
    fake.interrupts[0](true)
    await reply

    fake.feed(result(true))
    expect(sender.of('harness:said').map((line) => line.text)).toEqual([LINES.stopped])
    expect(snapshot(sender).busy).toEqual([sessionId])
    advance(STOP_RESULT_MS)
    await flush()
    expect(fake.kills).toBe(0)

    fake.feed(tasks())
    fake.feed(result(false))
    expect(sender.of('harness:said').map((line) => line.text)).toEqual([LINES.stopped])
    expect(sender.names.at(-1)).toBe('session:awaiting-turn')
    expect(snapshot(sender).busy).toEqual([])
  })

  it('stops a turn once: a second press while stopping writes nothing and is ok', async () => {
    const { sender, fake, sessionId } = await chatting()
    const first = stopTurn(sender, sessionId)
    await flush()

    await expect(stopTurn(sender, sessionId)).resolves.toEqual({ ok: true })
    expect(fake.interrupts).toHaveLength(1)

    fake.interrupts[0](true)
    await first
    fake.feed(result(true))
    expect(sender.of('harness:said')).toHaveLength(1)
  })

  it('cancels the wait for the result when the turn ends, so a stale timer cannot end a later turn’s session', async () => {
    const { sender, fake, sessionId } = await chatting()
    const reply = stopTurn(sender, sessionId)
    await flush()
    fake.interrupts[0](true)
    await reply
    const pending = timers.filter((timer) => !timer.cancelled && timer.at === clock + STOP_RESULT_MS)
    expect(pending).toHaveLength(1)

    fake.feed(result(true))
    expect(pending[0].cancelled).toBe(true)
    await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, sessionId, 'again')).resolves.toEqual({ ok: true })
    advance(STOP_RESULT_MS * 2)
    await flush()

    expect(fake.kills).toBe(0)
    expect(sender.of('session:closed')).toEqual([])
  })

  it.each([
    ['a refusal', (fake: FakeSession) => fake.interrupts[0](false)],
    ['silence for STOP_ACK_MS', () => advance(STOP_ACK_MS)]
  ] as const)('on %s: kills the process, says so in the harness’s voice, closes the session and ends no run', async (_name, refuse) => {
    const { sender, fake, sessionId } = await chatting()
    const reply = stopTurn(sender, sessionId)
    await flush()
    refuse(fake)

    await expect(reply).resolves.toEqual({ ok: true })
    expect(fake.kills).toBe(1)
    expect(sender.names).toEqual(['harness:said', 'session:closed'])
    expect(sender.of('harness:said')).toEqual([{ sessionId, id: expect.any(String), text: LINES.stopTurnEnded, at: clock }])
    expect(sender.of('session:closed')).toEqual([{ sessionId, agentId: A, reason: 'closed', at: clock }])
  })

  it('falls back when the interrupt cannot be asked: a throw is a stop that was not acknowledged', async () => {
    const { sender, fake, sessionId } = await chatting()
    fake.interruptThrows = true

    await expect(stopTurn(sender, sessionId)).resolves.toEqual({ ok: true })

    expect(sender.names).toEqual(['harness:said', 'session:closed'])
    expect(fake.kills).toBe(1)
  })

  it('ends the session with the turn when the interrupt was acknowledged and the result never comes, STOP_RESULT_MS later', async () => {
    const { sender, fake, sessionId } = await chatting()
    const reply = stopTurn(sender, sessionId)
    await flush()
    fake.interrupts[0](true)
    await reply

    advance(STOP_RESULT_MS)
    await flush()

    expect(fake.kills).toBe(1)
    expect(sender.names).toEqual(['harness:said', 'session:closed'])
    expect(sender.of('harness:said')).toEqual([{ sessionId, id: expect.any(String), text: LINES.stopTurnUnfinished, at: clock }])
  })

  it('does not close the session a moment short of the deadlines', async () => {
    const { sender, fake, sessionId } = await chatting()
    const reply = stopTurn(sender, sessionId)
    await flush()
    advance(STOP_ACK_MS - 1)
    fake.interrupts[0](true)
    await reply
    advance(STOP_RESULT_MS - 1)
    await flush()

    expect(sender.sent).toEqual([])
    expect(fake.kills).toBe(0)
  })

  it('is not-found, writing nothing, for a session with no turn in flight, an unknown id, a closed session and a non-string id', async () => {
    const { sender, fake, sessionId } = await chatting()
    fake.feed(result())
    sender.sent = []
    const written = fake.writes.length

    await expect(stopTurn(sender, sessionId)).resolves.toEqual(TURN_NOT_FOUND)
    await expect(stopTurn(sender, 'nobody')).resolves.toEqual(TURN_NOT_FOUND)
    await expect(stopTurn(sender, undefined)).resolves.toEqual(TURN_NOT_FOUND)
    await expect(stopTurn(new FakeSender(2), sessionId)).resolves.toEqual(TURN_NOT_FOUND)
    call(SESSION_CLOSE_CHANNEL, sender, sessionId)
    await expect(stopTurn(sender, sessionId)).resolves.toEqual(TURN_NOT_FOUND)

    expect(fake.interrupts).toHaveLength(0)
    expect(fake.writes).toHaveLength(written)
  })

  it('has no effect on a room: not-found, and the room’s own rules stand', async () => {
    const sender = new FakeSender(1)
    const opened = await call<Promise<{ ok: boolean; sessionId?: string }>>(SESSION_OPEN_CHANNEL, sender, { room: [A, B] })
    expect(opened.ok).toBe(true)
    const room = fakes.get(undefined as unknown as string)!
    room.feed(result())
    sender.sent = []

    await expect(stopTurn(sender, opened.sessionId)).resolves.toEqual(TURN_NOT_FOUND)
    // Even with a speaker mid-turn: there is no header Stop for a room and the command is not for it.
    await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, opened.sessionId, 'one thing')).resolves.toEqual({ ok: true })
    await expect(stopTurn(sender, opened.sessionId)).resolves.toEqual(TURN_NOT_FOUND)
    expect(room.interrupts).toHaveLength(0)
  })

  it('stops a run in flight by the card’s own path: run:stopped on the failed result, never run:failed, no extra line, the same events as run.stop', async () => {
    const viaHeader = await running()
    const reply = stopTurn(viaHeader.sender, viaHeader.sessionId)
    await flush()
    expect(viaHeader.fake.interrupts).toHaveLength(1)
    viaHeader.fake.interrupts[0](true)
    await expect(reply).resolves.toEqual({ ok: true })
    viaHeader.fake.feed(result(true))

    const viaCard = await running(B, new FakeSender(2))
    const cardReply = stopRun(viaCard.sender, viaCard.runId)
    await flush()
    viaCard.fake.interrupts[0](true)
    await cardReply
    viaCard.fake.feed(result(true))

    const shape = (sender: FakeSender) => sender.sent.map((event) => event.name)
    expect(shape(viaHeader.sender)).toEqual(shape(viaCard.sender))
    expect(shape(viaHeader.sender)).toContain('run:stopped')
    expect(shape(viaHeader.sender)).not.toContain('run:failed')
    expect(shape(viaHeader.sender)).not.toContain('harness:said')
    expect(snapshot(viaHeader.sender).runs[0].status).toBe('stopped')
  })

  it('ends a run as run:stopped, never run:failed, when the stop landed after the turn was written and before the run began', async () => {
    const sender = new FakeSender(1)
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, A)
    const fake = fakes.get(A)!
    fake.feed(result())
    const sessionId = `s${sessions}`
    let release: (written: boolean) => void = () => {}
    fake.writeGate = new Promise<boolean>((resolve) => (release = resolve))
    const dispatched = call<Promise<{ ok: true; runId: string }>>(MENU_DISPATCH_CHANNEL, sender, sessionId, 'CP')
    await flush()
    // The turn is busy and has no run yet: the header's stop is the plain turn's.
    const reply = stopTurn(sender, sessionId)
    await flush()
    expect(fake.interrupts).toHaveLength(1)
    release(true)
    const { runId } = await dispatched
    fake.interrupts[0](true)
    await reply
    sender.sent = []

    fake.feed(result(true))

    expect(sender.names).toEqual(['run:stopped', 'session:awaiting-turn'])
    expect(sender.of('run:stopped')).toEqual([{ runId, sessionId, at: clock }])
    expect(sender.of('run:failed')).toEqual([])
    expect(sender.of('harness:said')).toEqual([])
    expect(snapshot(sender).runs[0].status).toBe('stopped')
  })

  it('takes a second header press for a run already stopping as ok, and a header stop on an unacknowledged run falls back as the card’s does', async () => {
    const stopping = await running()
    const first = stopTurn(stopping.sender, stopping.sessionId)
    await flush()
    await expect(stopTurn(stopping.sender, stopping.sessionId)).resolves.toEqual({ ok: true })
    expect(stopping.fake.interrupts).toHaveLength(1)
    stopping.fake.interrupts[0](true)
    await first

    const refused = await running(B, new FakeSender(2))
    const reply = stopTurn(refused.sender, refused.sessionId)
    await flush()
    refused.fake.interrupts[0](false)
    await reply

    expect(refused.sender.names).toEqual(['run:stopped', 'harness:said', 'session:closed'])
    expect(refused.sender.of('harness:said')[0].text).toBe(LINES.stopEnded)
  })
})
