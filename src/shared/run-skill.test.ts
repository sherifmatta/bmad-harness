import { describe, expect, it } from 'vitest'
import { isPlainSkillName, skillOf } from './run-skill'

describe('the skill name a run records', () => {
  it('accepts plain bounded names', () => {
    for (const name of ['bmad-build', 'a', 'bmad:create.prd_v2', '9lives', 'x'.repeat(64)]) {
      expect(isPlainSkillName(name)).toBe(true)
      expect(skillOf(name)).toBe(name)
    }
  })

  it('leaves off a name that is not plain or not bounded', () => {
    for (const name of ['a b', '', 'x'.repeat(65), '-x', '.x', 'a\nb', 'a/b', 'é']) {
      expect(isPlainSkillName(name)).toBe(false)
      expect(skillOf(name)).toBeUndefined()
    }
  })

  it('leaves off anything that is not a string', () => {
    for (const value of [undefined, null, 3, {}, ['a']]) {
      expect(skillOf(value)).toBeUndefined()
    }
  })
})
