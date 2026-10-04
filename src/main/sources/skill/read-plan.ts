import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { templatePlan } from '../../../shared/section-plan'
import type { TemplatePlan } from '../../../shared/section-plan'

/**
 * A skill's own template, read for the sections it predicts. This is main's
 * I/O for the plan (Story 3.3): the template is the single `*template*.md` file
 * under `.claude/skills/<skill>/assets/` of the project.
 *
 * It answers `undefined`, and never rejects, whenever there is no plan to be
 * had: a skill name that is not one plain directory name, no assets directory,
 * no template or several, a file that cannot be read. A template that cannot be
 * read is no run failure; the card runs on the headings it observes.
 */

/** One path segment of a skill's name: no separator, no dot-dot, nothing a shell would read. */
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const TEMPLATE_FILE = /template.*\.md$/i

export async function readPlan(projectRoot: string, skill: string): Promise<TemplatePlan | undefined> {
  if (!SKILL_NAME.test(skill) || skill.includes('..')) return undefined
  try {
    const assets = join(projectRoot, '.claude', 'skills', skill, 'assets')
    const entries = await readdir(assets, { withFileTypes: true })
    const templates = entries.filter((entry) => !entry.isDirectory() && TEMPLATE_FILE.test(entry.name))
    if (templates.length !== 1) return undefined
    const plan = templatePlan(await readFile(join(assets, templates[0].name), 'utf8'))
    return plan.spine.length === 0 && plan.menu.length === 0 ? undefined : plan
  } catch {
    return undefined
  }
}
