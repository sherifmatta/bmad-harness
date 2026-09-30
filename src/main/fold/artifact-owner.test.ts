import { describe, expect, it } from 'vitest'
import { ownerAgentIdFor } from './artifact-owner'

describe('ownerAgentIdFor', () => {
  it.each([
    ['_bmad/planning-artifacts/product-brief.md', 'bmad-agent-analyst'],
    ['_bmad/planning-artifacts/prd.md', 'bmad-agent-pm'],
    ['_bmad/planning-artifacts/architecture.md', 'bmad-agent-architect'],
    ['_bmad/planning-artifacts/ux-designs/x/DESIGN.md', 'bmad-agent-ux-designer'],
    ['_bmad/planning-artifacts/ux-designs/x/EXPERIENCE.md', 'bmad-agent-ux-designer'],
    ['_bmad/implementation-artifacts/sprint-status.yaml', 'bmad-agent-pm']
  ])('%s belongs to %s', (path, agentId) => {
    expect(ownerAgentIdFor(path)).toBe(agentId)
  })

  it('matches the basename case-insensitively, in any directory, including the root', () => {
    expect(ownerAgentIdFor('_bmad/PRD.md')).toBe('bmad-agent-pm')
    expect(ownerAgentIdFor('_bmad/a/b/c/Prd.MD')).toBe('bmad-agent-pm')
    expect(ownerAgentIdFor('prd.md')).toBe('bmad-agent-pm')
  })

  it('gives an unrecognised file no owner, and never a default', () => {
    for (const path of [
      '_bmad/epics.md',
      '_bmad/planning-artifacts/prd.md.bak',
      '_bmad/planning-artifacts/my-prd.md',
      '_bmad/prd.md/notes.txt',
      '_bmad/config.toml',
      '_bmad/planning-artifacts/'
    ]) {
      expect(ownerAgentIdFor(path), path).toBeUndefined()
    }
  })
})
