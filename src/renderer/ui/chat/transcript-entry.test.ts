import { describe, expect, it } from 'vitest'
import { isEntryInPersonaThread } from './transcript-entry'
import type { TranscriptEntry } from './transcript-entry'

const john = { id: 'bmad-agent-pm', module: 'bmm', name: 'John', title: 'PM', icon: 'i', description: 'd' }

const run = (over: Partial<Extract<TranscriptEntry, { kind: 'run' }>>): TranscriptEntry => ({
  kind: 'run',
  id: 'r',
  at: 1,
  runId: 'r',
  sessionId: 's',
  status: 'finished',
  notes: [],
  steps: [],
  documents: [],
  ...over
})

describe('isEntryInPersonaThread (Story 8.1)', () => {
  it('reads a persona entry by its agent, and never a room’s', () => {
    expect(isEntryInPersonaThread({ kind: 'persona', id: 'p', at: 1, agent: john, text: 'x' }, john.id)).toBe(true)
    expect(isEntryInPersonaThread({ kind: 'persona', id: 'p', at: 1, agent: john, text: 'x' }, 'other')).toBe(false)
    expect(isEntryInPersonaThread({ kind: 'persona', id: 'p', at: 1, agent: john, text: 'x', room: true }, john.id)).toBe(false)
  })

  it('reads a user turn and a harness line by the agentId they carry, and none without one, a room flag or a skill session', () => {
    for (const kind of ['user', 'sysline'] as const) {
      const base = { kind, id: 'e', at: 1, text: 't' } as const
      expect(isEntryInPersonaThread({ ...base, agentId: john.id }, john.id), kind).toBe(true)
      expect(isEntryInPersonaThread({ ...base, agentId: john.id }, 'other'), kind).toBe(false)
      expect(isEntryInPersonaThread({ ...base }, john.id), kind).toBe(false)
      expect(isEntryInPersonaThread({ ...base, agentId: john.id, room: true }, john.id), kind).toBe(false)
      expect(isEntryInPersonaThread({ ...base, agentId: john.id, skillSession: 's1' }, john.id), kind).toBe(false)
    }
  })

  it('reads a run card by the agentId of its run, and none with no agent or a skill session', () => {
    expect(isEntryInPersonaThread(run({ agentId: john.id }), john.id)).toBe(true)
    expect(isEntryInPersonaThread(run({}), john.id)).toBe(false)
    expect(isEntryInPersonaThread(run({ agentId: john.id, skillSession: 's1' }), john.id)).toBe(false)
  })

  it('never puts a skill’s words in a persona’s thread', () => {
    expect(isEntryInPersonaThread({ kind: 'skill', id: 'k', at: 1, text: 'x', skillSession: 's1' }, john.id)).toBe(false)
  })
})
