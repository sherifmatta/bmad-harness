import { describe, expect, it, vi } from 'vitest'
import type { RunCardDocument, RunCardSnapshot } from '../../shared/conversation'
import type { ContractEvent } from '../../shared/events'
import type { Sender } from '../bridge-kit'

/**
 * Every row of Story 3.10's matrix, against fakes for the window and the
 * banner. The electron mock exists for the one test of the defaults; every
 * other test injects its own, and the module touches Electron in none of them
 * before a terminal event is told.
 */

const fromWebContents = vi.fn()
const constructed: unknown[] = []
const isSupportedMock = vi.fn(() => true)
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: (contents: unknown) => fromWebContents(contents) },
  Notification: class {
    options: unknown
    constructor(options: unknown) {
      this.options = options
      constructed.push(options)
    }
    on() {
      return this
    }
    show() {}
    static isSupported() {
      return isSupportedMock()
    }
  }
}))

const { completionLine, createRunNotifier } = await import('./run-notification')
const { RUN_REVEALED_CHANNEL } = await import('../../shared/channels')

const PM = 'bmad-agent-pm'
const PRD = '_bmad/planning-artifacts/prds/prd-tidewatch-2026-10-01/prd.md'

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

function fakeWindow(over: Partial<Pick<FakeWindow, 'focused' | 'minimized' | 'destroyed'>> = {}): FakeWindow {
  const window: FakeWindow = {
    focused: false,
    minimized: false,
    destroyed: false,
    calls: [],
    isDestroyed: () => window.destroyed,
    isFocused: () => window.focused,
    isMinimized: () => window.minimized,
    restore: () => void window.calls.push('restore'),
    show: () => void window.calls.push('show'),
    focus: () => void window.calls.push('focus'),
    ...over
  }
  return window
}

type FakePosted = { options: unknown; shown: number; click: (() => void) | undefined; show(): void; on(event: 'click', listener: () => void): unknown }

function fakeSender(id = 1): Sender & { sent: [string, unknown][]; destroyed: boolean } {
  const sender = {
    id,
    sent: [] as [string, unknown][],
    destroyed: false,
    send: (channel: string, payload: unknown) => void sender.sent.push([channel, payload]),
    isDestroyed: () => sender.destroyed,
    once: () => undefined
  }
  return sender
}

/** A notifier over fakes, with what it posted and what it wrote. */
function notifier(over: { window?: FakeWindow | null; supported?: boolean; agentName?: (id: number, agentId: string) => string | undefined; failShow?: string; failWindowOf?: string; failPost?: string } = {}) {
  const posted: FakePosted[] = []
  const diagnostics: string[] = []
  // `window: null` stands for a sender with no window; the fake is still there for the test to read.
  const window: FakeWindow = over.window ?? fakeWindow()
  const windowOf = vi.fn((): FakeWindow | null => {
    if (over.failWindowOf !== undefined) throw new Error(over.failWindowOf)
    return over.window === null ? null : window
  })
  const isSupported = vi.fn(() => over.supported ?? true)
  const post = vi.fn((options: unknown): FakePosted => {
    if (over.failPost !== undefined) throw new Error(over.failPost)
    const line: FakePosted = {
      options,
      shown: 0,
      click: undefined,
      show() {
        if (over.failShow !== undefined) throw new Error(over.failShow)
        line.shown += 1
      },
      on(_event, listener) {
        line.click = listener
        return line
      }
    }
    posted.push(line)
    return line
  })
  const { told } = createRunNotifier({
    agentName: over.agentName ?? ((_id, agentId) => (agentId === PM ? 'John' : undefined)),
    writeDiagnostic: (line) => void diagnostics.push(line),
    windowOf,
    post,
    isSupported
  })
  return { told, posted, diagnostics, window, windowOf, isSupported, post }
}

const document = (path: string, sections: string[], written = 1_000): RunCardDocument => ({ path, callId: 'c1', text: 'x'.repeat(written), written, sections })

const card = (over: Partial<RunCardSnapshot> = {}): RunCardSnapshot => ({
  runId: 'run-1',
  sessionId: 's1',
  agentId: PM,
  code: 'DP',
  startedAt: 1_000,
  status: 'finished',
  endedAt: 2_000,
  notes: [],
  steps: [],
  documents: [document(PRD, Array.from({ length: 15 }, (_, n) => `${n}. Section`))],
  ...over
})

const FINISHED: ContractEvent = { name: 'run:finished', payload: { runId: 'run-1', sessionId: 's1', at: 2_000 } }
const STOPPED: ContractEvent = { name: 'run:stopped', payload: { runId: 'run-1', sessionId: 's1', at: 2_000 } }
const FAILED: ContractEvent = {
  name: 'run:failed',
  payload: { runId: 'run-1', sessionId: 's1', at: 2_000, error: { code: 'run/failed', message: 'run · the run failed' } }
}

describe('completionLine', () => {
  it('is the persona, the file name, the outcome and the count, joined by the one separator', () => {
    expect(completionLine({ name: 'John', path: PRD, outcome: 'finished', sections: 15 })).toBe('John · prd.md · finished · 15 sections')
    expect(completionLine({ name: 'John', path: PRD, outcome: 'stopped', sections: 0 })).toBe('John · prd.md · stopped · 0 sections')
    expect(completionLine({ name: 'John', path: PRD, outcome: 'failed', sections: 1 })).toBe('John · prd.md · failed · 1 section')
  })

  it('names the file, never the path', () => {
    expect(completionLine({ name: 'John', path: 'a/b/c/PRD.md', outcome: 'finished', sections: 2 })).not.toContain('/')
    expect(completionLine({ name: 'John', path: 'a/b/c/PRD.md', outcome: 'finished', sections: 2 })).toContain('PRD.md')
  })

  it('leaves the persona out with no name, and the file and the count out together with no subject', () => {
    expect(completionLine({ name: undefined, path: PRD, outcome: 'finished', sections: 15 })).toBe('prd.md · finished · 15 sections')
    expect(completionLine({ name: 'John', path: undefined, outcome: 'failed', sections: undefined })).toBe('John · failed')
    expect(completionLine({ name: undefined, path: undefined, outcome: 'failed', sections: undefined })).toBe('failed')
    // A count with no file is not a thing the line says.
    expect(completionLine({ name: 'John', path: undefined, outcome: 'failed', sections: 3 })).toBe('John · failed')
  })

  it('guides nothing: no word tells the user what to do', () => {
    for (const outcome of ['finished', 'stopped', 'failed'] as const) {
      const line = completionLine({ name: 'John', path: PRD, outcome, sections: 15 })
      expect(line).not.toMatch(/\b(?:ready|review|next|open|click|see|check|please|should|your)\b/i)
      expect(line).toBe(line.toLowerCase().replace(/^john/, 'John'))
      expect(line).not.toMatch(/[.!?:;,]$/)
    }
  })
})

describe('the completion line, told when the window is elsewhere', () => {
  it('posts one silent line on run:finished with the persona, the file, the outcome and the count, and shows it once', () => {
    const { told, posted } = notifier()

    told(fakeSender(), FINISHED, card())

    expect(posted).toHaveLength(1)
    expect(posted[0].options).toEqual({ body: 'John · prd.md · finished · 15 sections', silent: true })
    expect(posted[0].shown).toBe(1)
  })

  it('names a skill-first session’s run by its skill, where a persona’s goes (Story 7.5)', () => {
    const { told, posted } = notifier()
    const agentless = card({ skill: 'bmad-build', status: 'finished' })
    delete agentless.agentId

    told(fakeSender(), FINISHED, agentless)

    expect(posted.map((line) => line.options)).toEqual([{ body: 'bmad-build · prd.md · finished · 15 sections', silent: true }])
  })

  it('reads a stop mid-Write as zero sections, stated plainly: the subject streamed but nothing was confirmed', () => {
    const { told, posted } = notifier()

    told(fakeSender(), STOPPED, card({ status: 'stopped', documents: [document(PRD, [], 12_000)] }))

    expect(posted.map((line) => line.options)).toEqual([{ body: 'John · prd.md · stopped · 0 sections', silent: true }])
  })

  it('reads a failure with the file and the count, and with the bare word when the run wrote nothing', () => {
    const wrote = notifier()
    wrote.told(fakeSender(), FAILED, card({ status: 'failed', documents: [document(PRD, ['A', 'B', 'C'])] }))
    expect(wrote.posted.map((line) => line.options)).toEqual([{ body: 'John · prd.md · failed · 3 sections', silent: true }])

    const nothing = notifier()
    nothing.told(fakeSender(), FAILED, card({ status: 'failed', documents: [] }))
    expect(nothing.posted.map((line) => line.options)).toEqual([{ body: 'John · failed', silent: true }])
  })

  it('reads the outcome and the count from the card main holds, never recomputed: the subject is the heaviest Write', () => {
    const { told, posted } = notifier()
    const documents = [document('_bmad/x/addendum.md', ['A', 'B', 'C', 'D', 'E', 'F'], 300), document(PRD, ['One'], 20_000)]

    told(fakeSender(), FINISHED, card({ documents }))

    expect(posted[0].options).toEqual({ body: 'John · prd.md · finished · 1 section', silent: true })
  })

  it('stands the agent id in the first slot when the roster has no name, and leaves the slot out with no agent id', () => {
    const unnamed = notifier({ agentName: () => undefined })
    unnamed.told(fakeSender(), FINISHED, card({ agentId: 'bmad-agent-ghost' }))
    expect(unnamed.posted[0].options).toEqual({ body: 'bmad-agent-ghost · prd.md · finished · 15 sections', silent: true })

    const nobody = notifier()
    nobody.told(fakeSender(), FINISHED, card({ agentId: undefined }))
    expect(nobody.posted[0].options).toEqual({ body: 'prd.md · finished · 15 sections', silent: true })
  })

  it('asks the roster for the window the event came from', () => {
    const agentName = vi.fn(() => 'Mary')
    const { told } = notifier({ agentName })

    told(fakeSender(7), FINISHED, card({ agentId: 'bmad-agent-analyst' }))

    expect(agentName).toHaveBeenCalledExactlyOnceWith(7, 'bmad-agent-analyst')
  })

  it('posts one line per terminal event when two sessions end, each its own, none coalesced', () => {
    const { told, posted } = notifier({ agentName: (_id, agentId) => (agentId === PM ? 'John' : 'Mary') })
    const sender = fakeSender()

    told(sender, FINISHED, card())
    told(sender, { name: 'run:failed', payload: { runId: 'run-2', sessionId: 's2', at: 3_000, error: { code: 'run/failed', message: 'run · the run failed' } } }, card({ runId: 'run-2', sessionId: 's2', agentId: 'bmad-agent-analyst', status: 'failed', documents: [document('_bmad/brief.md', ['A'])] }))

    expect(posted.map((line) => line.options)).toEqual([
      { body: 'John · prd.md · finished · 15 sections', silent: true },
      { body: 'Mary · brief.md · failed · 1 section', silent: true }
    ])
    expect(posted.map((line) => line.shown)).toEqual([1, 1])
  })
})

describe('the completion line, when nothing is posted', () => {
  it('constructs nothing when the window is focused: the card and the rail already say it', () => {
    const { told, posted, post, isSupported } = notifier({ window: fakeWindow({ focused: true }) })

    told(fakeSender(), FINISHED, card())
    told(fakeSender(), STOPPED, card({ status: 'stopped' }))
    told(fakeSender(), FAILED, card({ status: 'failed' }))

    expect(posted).toEqual([])
    expect(post).not.toHaveBeenCalled()
    expect(isSupported).not.toHaveBeenCalled()
  })

  it('constructs nothing for any event that is not terminal, focused or not', () => {
    const { told, post, windowOf } = notifier()
    const sender = fakeSender()
    const held = card({ status: 'running' })
    const others: ContractEvent[] = [
      { name: 'run:started', payload: { runId: 'run-1', sessionId: 's1', agentId: PM, code: 'DP', at: 1_000 } },
      { name: 'run:note', payload: { runId: 'run-1', sessionId: 's1', text: '- (decision) x', at: 1_100 } },
      { name: 'doc:prose', payload: { runId: 'run-1', sessionId: 's1', callId: 'c1', path: PRD, text: '## A\n', at: 1_200 } },
      { name: 'doc:committed', payload: { runId: 'run-1', sessionId: 's1', callId: 'c1', path: PRD, ok: true, sections: ['A'], at: 1_300 } },
      { name: 'persona:said', payload: { sessionId: 's1', agentId: PM, messageId: 'm1', text: 'hi', at: 1_400 } },
      { name: 'persona:state', payload: { agentId: PM, state: 'work', at: 1_500 } },
      { name: 'session:closed', payload: { sessionId: 's1', agentId: PM, reason: 'closed', at: 1_600 } },
      { name: 'rail:changed', payload: { revision: 1, folder: '_bmad/', rows: [] } }
    ]

    for (const event of others) told(sender, event, 'runId' in event.payload ? held : undefined)

    expect(post).not.toHaveBeenCalled()
    // It did not even look for the window: the name alone rules the event out.
    expect(windowOf).not.toHaveBeenCalled()
  })

  it('constructs nothing when the OS cannot show one, and asks no permission then or ever', () => {
    const { told, post, isSupported } = notifier({ supported: false })

    told(fakeSender(), FINISHED, card())
    told(fakeSender(), FINISHED, card({ runId: 'run-2' }))

    expect(post).not.toHaveBeenCalled()
    expect(isSupported).toHaveBeenCalledTimes(2)
  })

  it('constructs nothing when the sender has no window, or its window has gone, or the event carries no card', () => {
    const none = notifier({ window: null })
    none.told(fakeSender(), FINISHED, card())
    expect(none.post).not.toHaveBeenCalled()

    const gone = notifier({ window: fakeWindow({ destroyed: true }) })
    gone.told(fakeSender(), FINISHED, card())
    expect(gone.post).not.toHaveBeenCalled()

    const uncarded = notifier()
    uncarded.told(fakeSender(), FINISHED, undefined)
    expect(uncarded.post).not.toHaveBeenCalled()
  })

  it('writes one diagnostic line and nothing else when show() throws: no retry, nothing to the window', () => {
    const { told, posted, diagnostics, window } = notifier({ failShow: 'refused by the OS' })
    const sender = fakeSender()

    expect(() => told(sender, FINISHED, card())).not.toThrow()

    expect(diagnostics).toEqual(['run/completion · refused by the OS'])
    expect(posted).toHaveLength(1)
    expect(posted[0].shown).toBe(0)
    expect(sender.sent).toEqual([])
    expect(window.calls).toEqual([])
  })

  it('asks for no window and posts nothing when the sender is destroyed: its window is going', () => {
    const { told, windowOf, post, isSupported } = notifier()
    const sender = fakeSender()
    sender.destroyed = true

    expect(() => told(sender, FINISHED, card())).not.toThrow()

    expect(windowOf).not.toHaveBeenCalled()
    expect(isSupported).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('throws nothing out of the event when asking for the window or making the line fails: one diagnostic line each, nothing posted', () => {
    const asking = notifier({ failWindowOf: 'no such contents' })
    expect(() => asking.told(fakeSender(), FINISHED, card())).not.toThrow()
    expect(asking.diagnostics).toEqual(['run/completion · no such contents'])
    expect(asking.posted).toEqual([])

    const making = notifier({ failPost: 'cannot construct' })
    const sender = fakeSender()
    expect(() => making.told(sender, FINISHED, card())).not.toThrow()
    expect(making.diagnostics).toEqual(['run/completion · cannot construct'])
    expect(making.posted).toEqual([])
    expect(making.window.calls).toEqual([])
    expect(sender.sent).toEqual([])
  })

  it('touches nothing at construction: no window, no support check, no banner', () => {
    const { windowOf, isSupported, post } = notifier()

    expect(windowOf).not.toHaveBeenCalled()
    expect(isSupported).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})

describe('the completion line, activated', () => {
  it('shows and focuses the window and sends the run id to it alone on run:revealed, restoring it only when minimized', () => {
    const { told, posted, window } = notifier()
    const sender = fakeSender()
    told(sender, FINISHED, card())

    posted[0].click?.()

    expect(window.calls).toEqual(['show', 'focus'])
    expect(sender.sent).toEqual([[RUN_REVEALED_CHANNEL, 'run-1']])
    expect(RUN_REVEALED_CHANNEL).toBe('run:revealed')

    const minimized = notifier({ window: fakeWindow({ minimized: true }) })
    const other = fakeSender(2)
    minimized.told(other, STOPPED, card({ runId: 'run-9', status: 'stopped' }))
    minimized.posted[0].click?.()
    expect(minimized.window.calls).toEqual(['restore', 'show', 'focus'])
    expect(other.sent).toEqual([[RUN_REVEALED_CHANNEL, 'run-9']])
  })

  it('does nothing when the window has gone by the time of the click: no window opened, nothing sent', () => {
    const { told, posted, window } = notifier()
    const sender = fakeSender()
    told(sender, FINISHED, card())
    window.destroyed = true
    sender.destroyed = true

    posted[0].click?.()

    expect(window.calls).toEqual([])
    expect(sender.sent).toEqual([])
  })

  it('sends to a live window only: a destroyed sender behind a live window hears nothing', () => {
    const { told, posted, window } = notifier()
    const sender = fakeSender()
    told(sender, FINISHED, card())
    sender.destroyed = true

    posted[0].click?.()

    expect(window.calls).toEqual(['show', 'focus'])
    expect(sender.sent).toEqual([])
  })

  it('sends each session its own run on its own click, and changes nothing else', () => {
    const { told, posted } = notifier()
    const sender = fakeSender()
    told(sender, FINISHED, card())
    told(sender, FAILED, card({ runId: 'run-2', sessionId: 's2', status: 'failed' }))

    posted[1].click?.()
    posted[0].click?.()

    expect(sender.sent).toEqual([
      [RUN_REVEALED_CHANNEL, 'run-2'],
      [RUN_REVEALED_CHANNEL, 'run-1']
    ])
  })
})

describe('the defaults', () => {
  it('ask Electron for the sender’s window and for support, and construct the banner with the one silent line, only when told', () => {
    constructed.length = 0
    fromWebContents.mockReset()
    isSupportedMock.mockReset()
    const window = fakeWindow()
    fromWebContents.mockReturnValue(window)
    isSupportedMock.mockReturnValue(true)
    const { told } = createRunNotifier({ agentName: () => 'John', writeDiagnostic: () => {} })
    expect(fromWebContents).not.toHaveBeenCalled()
    expect(isSupportedMock).not.toHaveBeenCalled()
    expect(constructed).toEqual([])

    const sender = fakeSender()
    told(sender, FINISHED, card())

    expect(fromWebContents).toHaveBeenCalledExactlyOnceWith(sender)
    expect(isSupportedMock).toHaveBeenCalledTimes(1)
    expect(constructed).toEqual([{ body: 'John · prd.md · finished · 15 sections', silent: true }])
  })

  it('construct nothing when Electron says the OS cannot show one', () => {
    constructed.length = 0
    fromWebContents.mockReturnValue(fakeWindow())
    isSupportedMock.mockReturnValue(false)
    const { told } = createRunNotifier({ agentName: () => 'John', writeDiagnostic: () => {} })

    told(fakeSender(), FINISHED, card())

    expect(constructed).toEqual([])
  })
})
