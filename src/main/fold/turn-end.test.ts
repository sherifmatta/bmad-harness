import { describe, expect, it } from 'vitest'
import { endsTurn } from './turn-end'

describe('endsTurn', () => {
  it.each([
    ['a success', { type: 'result', subtype: 'success', is_error: false }],
    ['an error during execution', { type: 'result', subtype: 'error_during_execution', is_error: true }],
    ['a result with no subtype', { type: 'result' }],
    ['a result with a null parent', { type: 'result', parent_tool_use_id: null }]
  ])('ends the turn on %s', (_name, frame) => {
    expect(endsTurn(frame)).toBe(true)
  })

  it.each([
    ['a subagent result', { type: 'result', parent_tool_use_id: 'toolu_1' }],
    ['a stream event', { type: 'stream_event', event: {} }],
    ['a system row', { type: 'system', subtype: 'init' }],
    ['a frame with another type that mentions result', { type: 'assistant', result: 'x' }],
    ['null', null],
    ['a string', 'result'],
    ['an array', ['result']],
    ['undefined', undefined]
  ])('does not end the turn on %s', (_name, frame) => {
    expect(endsTurn(frame)).toBe(false)
  })
})
