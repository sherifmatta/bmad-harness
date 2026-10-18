import { describe, expect, it } from 'vitest'
import { isInPersonaThread, threadAgentOf } from './thread'

describe('threadAgentOf', () => {
  it('is the agentId of a record with no room and no skillSession', () => {
    expect(threadAgentOf({ agentId: 'john' })).toBe('john')
  })

  it('is nobody for a record with no agentId', () => {
    expect(threadAgentOf({})).toBeUndefined()
  })

  it('is nobody for a room record, even with an agentId', () => {
    expect(threadAgentOf({ agentId: 'john', room: true })).toBeUndefined()
  })

  it('is nobody for a skill-session record', () => {
    expect(threadAgentOf({ agentId: 'john', skillSession: 's-1' })).toBeUndefined()
    expect(threadAgentOf({ skillSession: 's-1' })).toBeUndefined()
  })
})

describe('isInPersonaThread', () => {
  it('is true only for the persona the record is in the thread of', () => {
    expect(isInPersonaThread({ agentId: 'john' }, 'john')).toBe(true)
    expect(isInPersonaThread({ agentId: 'john' }, 'mary')).toBe(false)
    expect(isInPersonaThread({ agentId: 'john', room: true }, 'john')).toBe(false)
    expect(isInPersonaThread({}, 'john')).toBe(false)
  })
})
