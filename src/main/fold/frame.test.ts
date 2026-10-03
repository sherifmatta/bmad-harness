import { describe, expect, it } from 'vitest'
import { readFrame } from './frame'

describe('readFrame: a result', () => {
  it('reads is_error and the subtype of a main-thread result', () => {
    expect(readFrame({ type: 'result', subtype: 'error_during_execution', is_error: true })).toEqual({
      kind: 'turn-result',
      failed: true,
      subtype: 'error_during_execution'
    })
    expect(readFrame({ type: 'result', subtype: 'success', is_error: false })).toEqual({
      kind: 'turn-result',
      failed: false,
      subtype: 'success'
    })
  })

  it('reads a result with neither field as not failed', () => {
    expect(readFrame({ type: 'result' })).toEqual({ kind: 'turn-result', failed: false, subtype: undefined })
    expect(readFrame({ type: 'result', is_error: 'true', subtype: 3 })).toEqual({
      kind: 'turn-result',
      failed: false,
      subtype: undefined
    })
  })

  it('reads nothing from a subagent’s result', () => {
    expect(readFrame({ type: 'result', parent_tool_use_id: 'toolu_1' })).toBeUndefined()
  })
})

describe('readFrame: background_tasks_changed', () => {
  it('reads each task_id of the live set', () => {
    expect(
      readFrame({
        type: 'system',
        subtype: 'background_tasks_changed',
        tasks: [
          { task_id: 'a', task_type: 'local_agent', description: 'one' },
          { task_id: 'b', task_type: 'local_agent', description: 'two' }
        ]
      })
    ).toEqual({ kind: 'background-tasks', taskIds: ['a', 'b'] })
  })

  it('reads an empty list as the empty set', () => {
    expect(readFrame({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })).toEqual({
      kind: 'background-tasks',
      taskIds: []
    })
  })

  it('reads nothing when the frame has no list, and skips an entry with no id', () => {
    expect(readFrame({ type: 'system', subtype: 'background_tasks_changed' })).toBeUndefined()
    expect(readFrame({ type: 'system', subtype: 'background_tasks_changed', tasks: 'a' })).toBeUndefined()
    expect(
      readFrame({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 7 }, 'a', { task_id: 'ok' }] })
    ).toEqual({ kind: 'background-tasks', taskIds: ['ok'] })
  })

  it('ignores other system rows', () => {
    expect(readFrame({ type: 'system', subtype: 'task_progress', tasks: [] })).toBeUndefined()
  })
})

describe('readFrame: everything else it already read', () => {
  it('still reads a main-thread message start and drops a subagent’s', () => {
    const start = (parent: string | null) => ({
      type: 'stream_event',
      parent_tool_use_id: parent,
      event: { type: 'message_start', message: { id: 'm' } }
    })

    expect(readFrame(start(null))).toEqual({ kind: 'message-start', messageId: 'm' })
    expect(readFrame(start('toolu_1'))).toBeUndefined()
  })

  it.each([null, 'x', 4, [], {}, { type: 'assistant' }])('reads nothing from %j', (frame) => {
    expect(readFrame(frame)).toBeUndefined()
  })
})
