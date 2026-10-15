import type { SkillView } from '../../shared/install'

/**
 * The skills the install declares, as the renderer is told of them: the
 * manifest's rows folded to a name and a description each, in the manifest's
 * own order. Pure. Nothing is hidden or ranked, and the roster does not come
 * from here.
 *
 * The first row is the header, and columns are found by its names, so a
 * manifest that gains or reorders a column still reads. A row with no `name`
 * (empty, or too short to have one) is skipped and the rest are kept.
 */
export function foldSkills(rows: readonly (readonly string[])[]): SkillView[] {
  const [header, ...body] = rows
  if (header === undefined) {
    return []
  }
  const name = header.indexOf('name')
  if (name < 0) {
    return []
  }
  const description = header.indexOf('description')
  const skills: SkillView[] = []
  for (const row of body) {
    const skill = row[name]?.trim()
    if (skill === undefined || skill === '') {
      continue
    }
    skills.push({ name: skill, description: description < 0 ? '' : (row[description] ?? '') })
  }
  return skills
}
