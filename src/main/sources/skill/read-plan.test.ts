import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readPlan } from './read-plan'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'harness-read-plan-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function skill(name: string, files: Record<string, string>): void {
  const assets = join(root, '.claude', 'skills', name, 'assets')
  mkdirSync(assets, { recursive: true })
  for (const [file, text] of Object.entries(files)) writeFileSync(join(assets, file), text)
}

const TEMPLATE = '## Scaffolding\n```md\n## A\n## 1. B\n```\n\n## Adapt-In Menu\n- **Extra** — x\n'

describe('readPlan', () => {
  it('reads the single template under the skill’s assets', async () => {
    skill('alpha', { 'alpha-template.md': TEMPLATE, 'notes.md': '## Other', 'schema.json': '{}' })
    await expect(readPlan(root, 'alpha')).resolves.toEqual({ spine: ['A', 'B'], menu: ['Extra'] })
  })

  it('reads bmad-prd’s own template into its ten sections', async () => {
    const project = resolve(import.meta.dirname, '..', '..', '..', '..')
    const plan = await readPlan(project, 'bmad-prd')
    expect(plan?.spine).toHaveLength(10)
    expect(plan?.spine[0]).toBe('Document Purpose')
    expect(plan?.spine[9]).toBe('Assumptions Index')
  })

  it('has no plan for none or several templates', async () => {
    skill('none', { 'readme.md': TEMPLATE })
    skill('several', { 'a.template.md': TEMPLATE, 'b-template.md': TEMPLATE })
    await expect(readPlan(root, 'none')).resolves.toBeUndefined()
    await expect(readPlan(root, 'several')).resolves.toBeUndefined()
  })

  it('has no plan for a skill with no assets, a missing project, or a template with no sections', async () => {
    mkdirSync(join(root, '.claude', 'skills', 'bare'), { recursive: true })
    skill('empty', { 'x-template.md': 'words only' })
    await expect(readPlan(root, 'bare')).resolves.toBeUndefined()
    await expect(readPlan(root, 'absent')).resolves.toBeUndefined()
    await expect(readPlan(join(root, 'nowhere'), 'alpha')).resolves.toBeUndefined()
    await expect(readPlan(root, 'empty')).resolves.toBeUndefined()
  })

  it('has no plan for a template that is not a file it can read', async () => {
    const assets = join(root, '.claude', 'skills', 'broken', 'assets')
    mkdirSync(assets, { recursive: true })
    symlinkSync(join(root, 'missing.md'), join(assets, 'broken-template.md'))
    await expect(readPlan(root, 'broken')).resolves.toBeUndefined()
  })

  it('refuses a skill name that is not one plain directory name, reading nothing', async () => {
    skill('alpha', { 'alpha-template.md': TEMPLATE })
    mkdirSync(join(root, 'outside', 'assets'), { recursive: true })
    writeFileSync(join(root, 'outside', 'assets', 'x-template.md'), TEMPLATE)
    for (const name of ['', '..', '../outside', 'alpha/../alpha', 'a/b', '/etc', '.hidden', 'a\\b', 'alpha..beta', 'a b']) {
      await expect(readPlan(root, name), name).resolves.toBeUndefined()
    }
  })
})
