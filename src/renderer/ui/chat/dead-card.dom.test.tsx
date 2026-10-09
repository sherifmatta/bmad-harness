// @vitest-environment jsdom
import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ConversationSnapshot, RunCardSnapshot } from '../../../shared/conversation'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { createConversation } from './use-conversation'
import type { ConversationBridge } from './use-conversation'
import type { ConversationState } from './conversation-state'
import { createProseStore } from './prose-store'
import { Turns } from './transcript'

/**
 * Story 3.7's relaunch clause, drawn: the conversation main hands a window after
 * the app went away (`tests/relaunch-dead-card.test.ts` makes this very shape
 * from stored cards) is read by the window's own hydration and drawn by its own
 * cards, under a DOM with the clock held. A card read back is terminal: it
 * carries no stop control, its elapsed time is the one it ended with and does
 * not tick, every persona is idle and nothing is offered to resume.
 */

const A = 'bmad-agent-pm'
const EMPTY: ConversationSnapshot = { entries: [], sessions: [], busy: [], personas: [], runs: [] }
const ENDED_BY_SESSION = { code: 'run/session-ended', message: 'run · the session ended' }

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.useRealTimers()
})

const dead = (runId: string, status: RunCardSnapshot['status'], over: Partial<RunCardSnapshot> = {}): RunCardSnapshot => ({
  runId,
  sessionId: `gone-${runId}`,
  agentId: A,
  code: 'CP',
  startedAt: 1_000,
  status,
  endedAt: 66_000,
  ...(status === 'failed' ? { error: ENDED_BY_SESSION } : {}),
  notes: [],
  steps: [],
  documents: [{ path: '_bmad/prd.md', callId: 'c', text: 'what it had written', written: 18, sections: [] }],
  ...over
})

/** The window's own hydration over what main handed it, and the thread drawn from it with a stop handed down. */
async function drawn(snapshot: ConversationSnapshot, onStop: (runId: string) => void = () => {}) {
  let state: ConversationState | undefined
  const refuse = (what: string) => () => Promise.reject(new Error(`nothing is ${what}`))
  const bridge: ConversationBridge = {
    openSession: refuse('opened'),
    closeSession: () => Promise.resolve(),
    sendTurn: refuse('sent'),
    dispatchMenu: refuse('dispatched'),
    stopRun: refuse('stopped'),
    stopTurn: refuse('stopped'),
    getConversation: () => Promise.resolve(snapshot),
    endConversation: () => Promise.resolve(),
    onSessionEvent: () => () => {}
  }
  const prose = createProseStore({ raf: (callback) => callback() })
  const conversation = createConversation({
    bridge,
    agentOf: () => undefined,
    now: () => Date.now(),
    publish: (next) => void (state = next),
    onFailure: () => {},
    prose
  })
  conversation.connect()
  await act(async () => {
    for (let at = 0; at < 5; at += 1) await Promise.resolve()
  })
  if (state === undefined) throw new Error('nothing was published')
  const held: ConversationState = state
  mounted = mount(
    createElement(Turns, {
      entries: held.entries,
      prose,
      onStop,
      collapse: { viewedId: A, expanded: new Set<string>(), nameOf: () => 'John', onExpand: () => {} }
    })
  )
  return { state: held, root: mounted.container }
}

describe('a conversation read back after a relaunch, drawn', () => {
  it('draws a dead card with its words and its elapsed time as they were, no stop control and no caret', async () => {
    const { root } = await drawn({ ...EMPTY, runs: [dead('r1', 'finished', { endedAt: 3_000 }), dead('r2', 'failed')] })

    expect(root.querySelectorAll('.run-card')).toHaveLength(2)
    expect(root.querySelectorAll('.run-stop, button')).toHaveLength(0)
    expect(root.querySelector('.caret')).toBeNull()
    expect(root.querySelector('[aria-busy]')).toBeNull()
    expect([...root.querySelectorAll('.run-card-elapsed')].map((each) => each.textContent)).toEqual(['2s', '1m 05s'])
    expect(root.querySelectorAll('.run-card-status--failed')).toHaveLength(1)
    expect(root.querySelector('.run-card-text')?.textContent).toBe('what it had written')
  })

  it('does not tick: a dead card sets no timer, and its elapsed time is the same however long the window stays open', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000_000)
    const { root } = await drawn({ ...EMPTY, runs: [dead('r2', 'failed')] })
    const before = root.textContent
    const timers = vi.getTimerCount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })

    expect(vi.getTimerCount()).toBe(timers)
    expect(root.querySelector('.run-card-elapsed')?.textContent).toBe('1m 05s')
    expect(root.textContent).toBe(before)
  })

  it('holds every persona idle and no session: the window has nothing to resume and nothing in flight', async () => {
    const { state } = await drawn({ ...EMPTY, runs: [dead('r2', 'failed')] })

    expect(state.personas.size).toBe(0)
    expect(state.sessions.size).toBe(0)
    expect(state.busy.size).toBe(0)
  })

  it('draws a stopped card as it ended too, and never asks to stop it', async () => {
    const stops: string[] = []
    const { root } = await drawn({ ...EMPTY, runs: [dead('r3', 'stopped')] }, (runId) => stops.push(runId))

    expect(root.querySelectorAll('.run-stop')).toHaveLength(0)
    expect(root.querySelector('.run-card-status')?.textContent).toBe('stopped')
    expect(stops).toEqual([])
  })
})
