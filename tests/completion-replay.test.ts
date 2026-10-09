import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ConversationReply, RunCardSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import { RUN_REVEALED_CHANNEL } from '../src/shared/channels'
import { sectionCount } from '../src/shared/section-progress'
import { subjectOf } from '../src/main/fold/run-card'

/**
 * Story 3.10's beat, replayed: a run that ends while the window is elsewhere is
 * told once, outside the window. Three recordings, each fed through the real
 * session bridge, registry and folds with the completion notifier hung on the
 * registry's one seam, over a fake project window and a fake banner:
 * `fast-path-sonnet` to its `run:finished`, `interrupt-inband` to the stop
 * pressed mid-Write, `reviewer-gate-failure-induced` to the budget cap. Then
 * two personas' sessions in one window, both stopped, each told on its own.
 *
 * Nothing live and no network: the recordings are the evidence. Each line is
 * pinned as the literal it reads, and read back against the card main holds,
 * so the words and the count are the card's and not this file's.
 */

type Handler = (...args: never[]) => unknown
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => '/unused' }
}))

const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { CONVERSATION_GET_CHANNEL, MENU_DISPATCH_CHANNEL, RUN_STOP_CHANNEL, SESSION_EVENT_CHANNEL, SESSION_OPEN_CHANNEL, TURN_SEND_CHANNEL, registerSessionBridge } =
  await import('../src/main/session-bridge')
const { createRunNotifier } = await import('../src/main/windows/run-notification')

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const PM = 'bmad-agent-pm'
const ANALYST = 'bmad-agent-analyst'
const NAMES: Record<string, string> = { [PM]: 'John', [ANALYST]: 'Mary' }

type Frame = { type: string; subtype?: string; is_error?: boolean }
type Meta = { cwd: string; turns: { afterLine: number; text?: string }[] }

const cache = new Map<string, { frames: Frame[]; meta: Meta }>()
function recording(scenario: string): { frames: Frame[]; meta: Meta } {
  let held = cache.get(scenario)
  if (held === undefined) {
    held = {
      frames: readFileSync(join(RUNS, `${scenario}.jsonl`), 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Frame),
      meta: JSON.parse(readFileSync(join(RUNS, `${scenario}.meta.json`), 'utf8')) as Meta
    }
    cache.set(scenario, held)
  }
  return held
}

/** The project window as the notifier reads and raises it. */
type FakeWindow = {
  focused: boolean
  minimized: boolean
  destroyed: boolean
  calls: string[]
  isDestroyed(): boolean
  isFocused(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

/** The banner as the notifier posts it: its options, how often it was shown, and its click handler. */
type FakePosted = { options: unknown; shown: number; click: (() => void) | undefined; show(): void; on(event: 'click', listener: () => void): unknown }

type Session = {
  agent: string
  scenario: string
  /** Which of the recording's turns is dispatched as the run; the text turns before it are sent as turns. */
  runTurn: number
  /** Feed the recording up to this line, then press stop, then feed the rest. */
  stopAt?: number
}

type Scene = {
  told: ContractEvent[]
  /** Every event the notifier was handed, by name. */
  heard: string[]
  posted: FakePosted[]
  window: FakeWindow
  /** What the window was sent outside the session events. */
  pushed: [string, unknown][]
  cards: RunCardSnapshot[]
  runIds: string[]
}

/**
 * One window, one or more sessions. Each session is opened and fed through
 * its activation turn, its earlier text turns are sent, and its run turn is
 * dispatched; then every session's remaining frames are fed one each in turn,
 * so two runs end in one window as they would live.
 */
async function replay(
  sessions: Session[],
  options: { focused?: boolean; minimized?: boolean; destroyAt?: number } = {}
): Promise<Scene> {
  handlers.clear()
  const userData = mkdtempSync(join(tmpdir(), 'harness-completion-replay-'))
  try {
    const told: ContractEvent[] = []
    const pushed: [string, unknown][] = []
    const heard: string[] = []
    // The window's `destroyed`: the registry registers one listener, and a test may fire it.
    let gone = false
    let onDestroyed: (() => void) | undefined
    const sender = {
      id: 1,
      send: (channel: string, payload: unknown) => {
        if (channel === SESSION_EVENT_CHANNEL) told.push(payload as ContractEvent)
        else pushed.push([channel, payload])
      },
      isDestroyed: () => gone,
      once: (_event: string, listener: () => void) => {
        onDestroyed = listener
      }
    }
    const window: FakeWindow = {
      focused: options.focused ?? false,
      minimized: options.minimized ?? false,
      destroyed: false,
      calls: [],
      isDestroyed: () => window.destroyed,
      isFocused: () => window.focused,
      isMinimized: () => window.minimized,
      restore: () => void window.calls.push('restore'),
      show: () => void window.calls.push('show'),
      focus: () => void window.calls.push('focus')
    }
    const posted: FakePosted[] = []
    const notifier = createRunNotifier({
      agentName: (_window, agentId) => NAMES[agentId],
      writeDiagnostic: () => {},
      windowOf: () => window,
      isSupported: () => true,
      post: (options) => {
        const line: FakePosted = {
          options,
          shown: 0,
          click: undefined,
          show() {
            line.shown += 1
          },
          on(_event, listener) {
            line.click = listener
            return line
          }
        }
        posted.push(line)
        return line
      }
    })
    const feeds: ((frame: unknown) => void)[] = []
    let opened = 0
    let runs = 0

    registerSessionBridge({
      transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
      projectPathFor: () => recording(sessions[0].scenario).meta.cwd,
      now: () => 1_000,
      newSessionId: () => `s${(opened += 1)}`,
      newRunId: () => `run-${(runs += 1)}`,
      agentName: (_window, agentId) => NAMES[agentId],
      writeDiagnostic: () => {},
      menuEntryFor: (_window, _agent, code) =>
        code === 'DP' ? { code: 'DP', description: 'Draft the PRD', action: { kind: 'skill', skill: 'bmad-prd' } } : undefined,
      readPlan: () => Promise.resolve(undefined),
      readText: () => Promise.resolve(undefined),
      schedule: () => () => {},
      told: (sender, event, card) => {
        heard.push(event.name)
        notifier.told(sender, event, card)
      },
      spawn: (spawnOptions) => {
        feeds.push(spawnOptions.onFrame)
        return Promise.resolve({
          ok: true,
          session: { write: () => Promise.resolve(true), interrupt: () => Promise.resolve(true), kill: () => {} }
        })
      }
    })
    const call = <T>(channel: string, ...args: unknown[]): T =>
      (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

    // Each session through its activation and its earlier turns, then its dispatch.
    const runIds: string[] = []
    const next: number[] = []
    for (const [at, session] of sessions.entries()) {
      const { frames, meta } = recording(session.scenario)
      const sessionId = `s${at + 1}`
      await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, session.agent)
      const feed = feeds[at]
      const dispatchAfter = meta.turns[session.runTurn].afterLine
      for (let line = 1; line <= dispatchAfter; line += 1) {
        feed(frames[line - 1])
        const turn = meta.turns.find((each, index) => index > 0 && index < session.runTurn && each.afterLine === line)
        if (turn?.text !== undefined) await call<Promise<unknown>>(TURN_SEND_CHANNEL, sessionId, turn.text)
      }
      const dispatched = await call<Promise<{ ok: boolean; runId: string }>>(MENU_DISPATCH_CHANNEL, sessionId, 'DP')
      expect(dispatched.ok).toBe(true)
      runIds.push(dispatched.runId)
      next.push(dispatchAfter + 1)
    }
    // Then the rest of every recording, one frame of each in turn.
    let remaining = true
    while (remaining) {
      remaining = false
      for (const [at, session] of sessions.entries()) {
        const { frames } = recording(session.scenario)
        const line = next[at]
        if (line > frames.length) continue
        remaining = true
        feeds[at](frames[line - 1])
        next[at] = line + 1
        if (line === session.stopAt) await call<Promise<unknown>>(RUN_STOP_CHANNEL, runIds[at])
        // The recorder's turns after the run were sent by the recorder, as the user's: here the user sends them.
        const sent = recording(session.scenario).meta.turns.find((each, index) => index > session.runTurn && each.afterLine === line)
        if (sent?.text !== undefined && sent.text !== '') await call<Promise<unknown>>(TURN_SEND_CHANNEL, `s${at + 1}`, sent.text)
        if (at === 0 && line === options.destroyAt) {
          gone = true
          onDestroyed?.()
        }
      }
    }

    const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL)
    if (!reply.ok) throw new Error('no snapshot')
    return { told, heard, posted, window, pushed, cards: reply.snapshot.runs, runIds }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

const TERMINAL = new Set(['run:finished', 'run:stopped', 'run:failed'])
const terminalEvents = (scene: Scene): string[] => scene.told.map((event) => event.name).filter((name) => TERMINAL.has(name))

/** The line the card main holds would read: the persona, the subject's file, the status and the subject's count. */
function lineOf(card: RunCardSnapshot, name: string): string {
  const subject = subjectOf(card.documents)
  return [name, ...(subject === undefined ? [] : [subject.path.split('/').at(-1)]), card.status, ...(subject === undefined ? [] : [sectionCount(subject.sections.length)])].join(' · ')
}

const FAST = { agent: PM, scenario: 'fast-path-sonnet', runTurn: 2 }
const INBAND = { agent: PM, scenario: 'interrupt-inband', runTurn: 1, stopAt: 2154 }
const GATE = { agent: PM, scenario: 'reviewer-gate-failure-induced', runTurn: 1 }

describe('fast-path-sonnet, finished while the window was elsewhere', () => {
  it('is the recording it is named for: the activation result at 278, the brain dump sent after 279, the drafting turn dispatched after 1639', () => {
    const { frames, meta } = recording(FAST.scenario)
    expect(meta.turns.map((turn) => turn.afterLine)).toEqual([0, 279, 1639])
    expect(frames[277]).toMatchObject({ type: 'result', is_error: false })
    expect(frames.length).toBe(13047)
  })

  it('posts one silent line, the persona, the file, finished and the subject’s count, read from the fixture and from the card', async () => {
    const scene = await replay([FAST])

    expect(terminalEvents(scene)).toEqual(['run:finished'])
    expect(scene.posted).toHaveLength(1)
    expect(scene.posted[0].shown).toBe(1)
    const card = scene.cards[0]
    expect(card).toMatchObject({ runId: 'run-1', status: 'finished' })
    const subject = subjectOf(card.documents)
    expect(subject?.path.endsWith('/prd.md')).toBe(true)
    expect(subject?.sections.length).toBeGreaterThan(5)
    // The literal, once, and the same words read back from the card main holds.
    expect(scene.posted[0].options).toEqual({ body: 'John · prd.md · finished · 17 sections', silent: true })
    expect(scene.posted[0].options).toEqual({ body: lineOf(card, 'John'), silent: true })
  }, 120_000)

  it('posts nothing for any other event of the run, though the notifier heard every one', async () => {
    const scene = await replay([FAST])

    // Every event of the run path the window was told, in order, reached the notifier: the start, the
    // notes, every piece of prose, every commit and what the persona said. Only the end was posted.
    const RUN_PATH = new Set(['persona:said', 'run:started', 'run:note', 'run:step', 'doc:section-opened', 'doc:prose', 'doc:committed', 'run:finished', 'run:stopped', 'run:failed'])
    expect(scene.heard).toEqual(scene.told.map((event) => event.name).filter((name) => RUN_PATH.has(name)))
    expect(scene.heard.length).toBeGreaterThan(100)
    expect(new Set(scene.heard).size).toBeGreaterThan(4)
    expect(scene.heard.filter((name) => TERMINAL.has(name))).toEqual(['run:finished'])
    expect(scene.posted).toHaveLength(1)
  }, 120_000)
})

describe('interrupt-inband, stopped mid-Write while the window was elsewhere', () => {
  it('posts one line reading stopped with zero sections: the Write streamed and nothing was confirmed', async () => {
    const scene = await replay([INBAND])

    expect(terminalEvents(scene)).toEqual(['run:stopped'])
    const card = scene.cards[0]
    expect(card.status).toBe('stopped')
    expect(card.documents[0].sections).toEqual([])
    expect(card.documents[0].text.length).toBeGreaterThan(1_000)
    expect(scene.posted.map((line) => line.options)).toEqual([{ body: 'John · prd.md · stopped · 0 sections', silent: true }])
    expect(scene.posted[0].options).toEqual({ body: lineOf(card, 'John'), silent: true })
    expect(scene.posted[0].shown).toBe(1)
  })

  it('posts nothing at all when the window is focused: the card and the rail already say it', async () => {
    const scene = await replay([INBAND], { focused: true })

    expect(terminalEvents(scene)).toEqual(['run:stopped'])
    expect(scene.heard).toContain('run:stopped')
    expect(scene.posted).toEqual([])
    expect(scene.pushed).toEqual([])
  })

  it('raises the window on the click, restoring it when minimized, and sends the run id on run:revealed, and nothing else', async () => {
    const scene = await replay([INBAND], { minimized: true })
    expect(scene.window.calls).toEqual([])
    expect(scene.pushed).toEqual([])

    scene.posted[0].click?.()

    expect(scene.window.calls).toEqual(['restore', 'show', 'focus'])
    expect(scene.pushed).toEqual([[RUN_REVEALED_CHANNEL, 'run-1']])
    // No command crossed back, and no second terminal event or banner came of the click.
    expect(scene.told.filter((event) => TERMINAL.has(event.name))).toHaveLength(1)
    expect(scene.posted).toHaveLength(1)
  })

  it('sends nothing on a click after the window has gone', async () => {
    const scene = await replay([INBAND])
    scene.window.destroyed = true

    scene.posted[0].click?.()

    expect(scene.window.calls).toEqual([])
    expect(scene.pushed).toEqual([])
  })
})

describe('the project window closing with a run in flight', () => {
  it('posts nothing and throws nothing: the window is gone when its sessions end the run', async () => {
    const scene = await replay([INBAND], { destroyAt: 2000 })

    // The registry's `destroyed` listener ended the run as failed, and the notifier heard it.
    expect(scene.heard).toContain('run:failed')
    expect(scene.posted).toEqual([])
    expect(scene.pushed).toEqual([])
    expect(scene.cards[0]).toMatchObject({ runId: 'run-1', status: 'failed' })
  })
})

describe('reviewer-gate-failure-induced, failed on a budget cap while the window was elsewhere', () => {
  it('posts one line reading failed, with the subject’s file and count when it wrote one, else the bare word', async () => {
    const scene = await replay([GATE])

    expect(terminalEvents(scene)).toEqual(['run:failed'])
    const card = scene.cards[0]
    expect(card).toMatchObject({ status: 'failed' })
    expect(card.error).toMatchObject({ code: 'run/failed', detail: 'error_max_budget_usd' })
    expect(scene.posted.map((line) => line.options)).toEqual([{ body: 'John · failed', silent: true }])
    expect(scene.posted[0].options).toEqual({ body: lineOf(card, 'John'), silent: true })
    // The error's own words never reach the line: the explanation stays in the conversation.
    expect(JSON.stringify(scene.posted[0].options)).not.toMatch(/budget|error_|the run failed/)
  })
})

describe('two sessions in one window, both ending while it was elsewhere', () => {
  it('posts one line per run, each its own persona and its own id, none coalesced', async () => {
    const scene = await replay([INBAND, { ...INBAND, agent: ANALYST }])

    expect(terminalEvents(scene)).toEqual(['run:stopped', 'run:stopped'])
    expect(scene.runIds).toEqual(['run-1', 'run-2'])
    expect(scene.cards.map((card) => [card.runId, card.agentId, card.status])).toEqual([
      ['run-1', PM, 'stopped'],
      ['run-2', ANALYST, 'stopped']
    ])
    expect(scene.posted.map((line) => line.options)).toEqual([
      { body: 'John · prd.md · stopped · 0 sections', silent: true },
      { body: 'Mary · prd.md · stopped · 0 sections', silent: true }
    ])
    expect(scene.posted.map((line) => line.shown)).toEqual([1, 1])

    // Each click reveals its own run.
    scene.posted[1].click?.()
    scene.posted[0].click?.()
    expect(scene.pushed).toEqual([
      [RUN_REVEALED_CHANNEL, 'run-2'],
      [RUN_REVEALED_CHANNEL, 'run-1']
    ])
  })
})
