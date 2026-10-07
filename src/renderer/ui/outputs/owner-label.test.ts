import { describe, expect, it } from 'vitest'

import type { RailRow } from '../../../shared/rail'
import { ROOM_LABEL, ownerLabel } from './owner-label'

const NAMES = new Map([
  ['bmad-agent-pm', 'John'],
  ['bmad-agent-analyst', 'Mary'],
  ['bmad-agent-architect', 'Winston'],
  ['bmad-agent-dev', 'Amelia']
])

const PRD = '_bmad/planning-artifacts/prd.md'
const row = (extra: Partial<RailRow> = {}): RailRow => ({ path: PRD, state: 'changing', ...extra }) as RailRow
const ids = (...agentIds: string[]): { agentId: string }[] => agentIds.map((agentId) => ({ agentId }))

describe('ownerLabel of a row that is not contended', () => {
  it('is the annotation’s owner first, then the class’s, else nobody', () => {
    expect(ownerLabel(row({ owner: { agentId: 'bmad-agent-pm' }, annotation: { text: 'writing', owner: { agentId: 'bmad-agent-analyst' } } }), NAMES)).toBe('Mary')
    expect(ownerLabel(row({ owner: { agentId: 'bmad-agent-pm' }, annotation: { text: 'writing' } }), NAMES)).toBe('John')
    expect(ownerLabel(row({ owner: { agentId: 'bmad-agent-pm' } }), NAMES)).toBe('John')
    expect(ownerLabel(row({ annotation: { text: 'writing', owner: { agentId: 'bmad-agent-pm' } } }), NAMES)).toBe('John')
    expect(ownerLabel(row(), NAMES)).toBeUndefined()
  })

  it('reads an agent the roster lacks as nobody, and never replaces it with the class’s owner', () => {
    expect(ownerLabel(row({ owner: { agentId: 'bmad-agent-pm' }, annotation: { text: 'writing', owner: { agentId: 'bmad-agent-gone' } } }), NAMES)).toBeUndefined()
    expect(ownerLabel(row({ owner: { agentId: 'bmad-agent-gone' } }), NAMES)).toBeUndefined()
  })
})

describe('ownerLabel of a contended row', () => {
  const contended = (...agentIds: string[]): RailRow => row({ owner: { agentId: 'bmad-agent-pm' }, annotation: { text: 'contention', owners: ids(...agentIds) } })

  it('names two as `A and B`, in the order given', () => {
    expect(ownerLabel(contended('bmad-agent-pm', 'bmad-agent-analyst'), NAMES)).toBe('John and Mary')
    expect(ownerLabel(contended('bmad-agent-analyst', 'bmad-agent-pm'), NAMES)).toBe('Mary and John')
  })

  it('names three as `A, B and C`, and four as `A, B, C and D`', () => {
    expect(ownerLabel(contended('bmad-agent-pm', 'bmad-agent-analyst', 'bmad-agent-architect'), NAMES)).toBe('John, Mary and Winston')
    expect(ownerLabel(contended('bmad-agent-pm', 'bmad-agent-analyst', 'bmad-agent-architect', 'bmad-agent-dev'), NAMES)).toBe('John, Mary, Winston and Amelia')
  })

  it('names one owner by itself', () => {
    expect(ownerLabel(contended('bmad-agent-analyst'), NAMES)).toBe('Mary')
  })

  it('leaves out an owner the roster lacks and replaces it with nobody', () => {
    expect(ownerLabel(contended('bmad-agent-pm', 'bmad-agent-gone', 'bmad-agent-analyst'), NAMES)).toBe('John and Mary')
    expect(ownerLabel(contended('bmad-agent-gone', 'bmad-agent-analyst'), NAMES)).toBe('Mary')
  })

  it('is nothing when there is no owner to name, and the class’s owner never stands in', () => {
    // The row's own class owner is John; he is not one of the writers.
    expect(ownerLabel(contended(), NAMES)).toBeUndefined()
    expect(ownerLabel(contended('bmad-agent-gone'), NAMES)).toBeUndefined()
    expect(ownerLabel(contended('bmad-agent-analyst', 'bmad-agent-dev'), new Map())).toBeUndefined()
  })

  it('does not name the class’s owner beside the writers', () => {
    expect(ownerLabel(contended('bmad-agent-analyst', 'bmad-agent-architect'), NAMES)).toBe('Mary and Winston')
  })
})

describe('ownerLabel of a row the room wrote (Story 4.1)', () => {
  it('is `the room`, and no persona’s name', () => {
    expect(ROOM_LABEL).toBe('the room')
    expect(ownerLabel(row({ room: true }), NAMES)).toBe('the room')
  })

  it('wins over the class’s owner and over the stream’s, which are not who wrote it', () => {
    expect(ownerLabel(row({ room: true, owner: { agentId: 'bmad-agent-pm' } }), NAMES)).toBe('the room')
    expect(
      ownerLabel(row({ room: true, annotation: { text: 'writing', owner: { agentId: 'bmad-agent-analyst' } } }), NAMES)
    ).toBe('the room')
  })

  it('is drawn even when the roster names nobody, since it needs no roster', () => {
    expect(ownerLabel(row({ room: true }), new Map())).toBe('the room')
  })
})
