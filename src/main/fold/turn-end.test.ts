import { describe, expect, it } from 'vitest'
import { readFrame } from './frame'
import { beginTurn, foldTurn, initialTurn } from './turn-end'
import type { TurnState } from './turn-end'

const tasks = (...ids: string[]): unknown => ({
  type: 'system',
  subtype: 'background_tasks_changed',
  tasks: ids.map((task_id) => ({ task_id, task_type: 'local_agent', description: 'x' }))
})
const result = (extra: Record<string, unknown> = {}): unknown => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  ...extra
})
const messageStart = (parent: string | null = null): unknown => ({
  type: 'stream_event',
  parent_tool_use_id: parent,
  event: { type: 'message_start', message: { id: 'msg_1' } }
})

const feed = (state: TurnState, frame: unknown) => foldTurn(state, readFrame(frame))
const idle: TurnState = { busy: false, tasks: new Set() }

describe('a session that has just opened', () => {
  it('is busy with nothing running behind it', () => {
    expect(initialTurn.busy).toBe(true)
    expect(initialTurn.tasks.size).toBe(0)
  })
})

describe('a main-thread result', () => {
  it('ends the turn when no background task is live', () => {
    const step = feed(initialTurn, result())

    expect(step.state.busy).toBe(false)
    expect(step.signal).toEqual({ kind: 'ended', failed: false, subtype: 'success' })
  })

  it('leaves the session busy, and says nothing, when a background task is live', () => {
    const live = feed(initialTurn, tasks('a')).state
    const step = feed(live, result())

    expect(step.state.busy).toBe(true)
    expect(step.signal).toBeUndefined()
  })

  it('ends the turn once the task set has emptied and a result arrives', () => {
    let state = feed(initialTurn, tasks('a', 'b')).state
    state = feed(state, result()).state
    state = feed(state, tasks('b')).state
    state = feed(state, tasks()).state

    expect(state.busy).toBe(true)
    expect(feed(state, result()).signal).toMatchObject({ kind: 'ended' })
  })

  it('carries is_error and the subtype of a failed one', () => {
    const step = feed(initialTurn, result({ subtype: 'error_during_execution', is_error: true }))

    expect(step.state.busy).toBe(false)
    expect(step.signal).toEqual({ kind: 'ended', failed: true, subtype: 'error_during_execution' })
  })

  it('reports a failed result while tasks are live without ending the turn', () => {
    const live = feed(initialTurn, tasks('a')).state
    const step = feed(live, result({ subtype: 'error_max_budget_usd', is_error: true }))

    expect(step.state.busy).toBe(true)
    expect(step.signal).toEqual({ kind: 'failed-while-pending', subtype: 'error_max_budget_usd' })
  })

  it('says nothing for a result that arrives when the session is already free, however it ended', () => {
    for (const row of [result(), result({ subtype: 'error_during_execution', is_error: true })]) {
      const step = feed(idle, row)

      expect(step.state).toBe(idle)
      expect(step.signal).toBeUndefined()
    }
    // Nor with tasks listed, since there is no turn for it to be the end of.
    const listed: TurnState = { busy: false, tasks: new Set(['a']) }
    expect(feed(listed, result({ is_error: true })).signal).toBeUndefined()
  })

  it('ends a turn once, not twice, when two results follow one another', () => {
    const first = feed(initialTurn, result())
    const second = feed(first.state, result())

    expect(first.signal).toMatchObject({ kind: 'ended' })
    expect(second.signal).toBeUndefined()
  })

  it('ignores a subagent’s result', () => {
    const step = feed(initialTurn, result({ parent_tool_use_id: 'toolu_1' }))

    expect(step.state).toBe(initialTurn)
    expect(step.signal).toBeUndefined()
  })

  it('treats a result with no subtype or is_error as a success', () => {
    expect(feed(initialTurn, { type: 'result' }).signal).toEqual({
      kind: 'ended',
      failed: false,
      subtype: undefined
    })
  })
})

describe('a CLI that never sends the task frame', () => {
  it('has each result end the turn, as it always did', () => {
    let state = initialTurn
    for (let turn = 0; turn < 3; turn += 1) {
      state = feed(beginTurn(state), result()).state
      expect(state.busy).toBe(false)
    }
  })
})

describe('background_tasks_changed', () => {
  it('replaces the set with the ids it lists', () => {
    let state = feed(initialTurn, tasks('a', 'b')).state
    expect([...state.tasks]).toEqual(['a', 'b'])
    state = feed(state, tasks('b')).state
    expect([...state.tasks]).toEqual(['b'])
    state = feed(state, tasks()).state
    expect(state.tasks.size).toBe(0)
  })

  it('is ignored when it carries no list, rather than read as an empty one', () => {
    const live = feed(initialTurn, tasks('a')).state
    const step = feed(live, { type: 'system', subtype: 'background_tasks_changed' })

    expect(step.state).toBe(live)
  })

  it('skips an entry with no task_id', () => {
    const frame = { type: 'system', subtype: 'background_tasks_changed', tasks: [{ nope: 1 }, { task_id: 'a' }, null] }

    expect([...feed(initialTurn, frame).state.tasks]).toEqual(['a'])
  })
})

describe('a main-thread message that starts', () => {
  it('begins a turn nobody sent when the session was free', () => {
    const step = feed(idle, messageStart())

    expect(step.state.busy).toBe(true)
    expect(step.signal).toEqual({ kind: 'resumed' })
  })

  it('changes nothing while a turn is in flight', () => {
    const step = feed(initialTurn, messageStart())

    expect(step.state).toBe(initialTurn)
    expect(step.signal).toBeUndefined()
  })

  it('is not a subagent’s message', () => {
    expect(feed(idle, messageStart('toolu_1')).state).toBe(idle)
  })
})

describe('beginTurn', () => {
  it('makes a free session busy and keeps its tasks', () => {
    const state = beginTurn({ busy: false, tasks: new Set(['a']) })

    expect(state.busy).toBe(true)
    expect([...state.tasks]).toEqual(['a'])
  })

  it('returns a busy session as it was', () => {
    expect(beginTurn(initialTurn)).toBe(initialTurn)
  })
})

describe('frames that say nothing of the turn', () => {
  it.each([
    ['a stream event that is not a message start', { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }],
    ['a system row', { type: 'system', subtype: 'init' }],
    ['an assistant frame that mentions result', { type: 'assistant', result: 'x' }],
    ['null', null],
    ['a string', 'result'],
    ['an array', ['result']],
    ['undefined', undefined]
  ])('leaves the state alone on %s', (_name, frame) => {
    expect(feed(initialTurn, frame).state).toBe(initialTurn)
  })
})
