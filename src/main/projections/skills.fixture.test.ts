import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../sources/install/skill-manifest'
import { foldSkills } from '../fold/skills'

/**
 * A committed copy of this repository's own skill manifest as it stood when
 * Story 7.3 was built. The live file changes with every install; the copy does not.
 */
const MANIFEST = resolve(import.meta.dirname, '../../../fixtures/skill-manifest/skill-manifest.csv')

describe('the repository’s own skill manifest', () => {
  const rows = parseCsv(readFileSync(MANIFEST, 'utf8'))
  const skills = foldSkills(rows)

  it('is twenty-nine skills in file order, one for each row after the header', () => {
    expect(skills).toHaveLength(29)
    expect(skills.map((skill) => skill.name)).toEqual(rows.slice(1).map((row) => row[1]))
    expect(skills[0].name).toBe('bmad-advanced-elicitation')
  })

  it('holds the five personas, the room and the unattended loop', () => {
    const names = skills.map((skill) => skill.name)
    expect(names.filter((name) => name.startsWith('bmad-agent-'))).toHaveLength(5)
    expect(names).toContain('bmad-party-mode')
    expect(names).toContain('bmad-build-auto')
  })

  it('reads a description with commas and doubled quotes as the text a reader sees', () => {
    const recon = skills.find((skill) => skill.name === 'bmad-deep-recon')
    expect(recon?.description).toContain('Use when the user says "deep recon", "research this"')
    expect(recon?.description).toContain('(ChatGPT, Gemini, Grok, Perplexity, …)')
    expect(skills.every((skill) => !skill.description.includes('""'))).toBe(true)
  })
})
