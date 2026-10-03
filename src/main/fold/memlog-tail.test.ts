import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { memlogEntries, tailMemlog } from './memlog-tail'

const FILE = ['---', 'topic: Tidewatch', '- not an entry: frontmatter', '---', '', '- (event) one', 'prose line', '- (decision) two'].join(
  '\n'
)

describe('tailMemlog', () => {
  it('reads every entry of a file seen for the first time, and never the frontmatter', () => {
    expect(tailMemlog(0, FILE)).toEqual({ entries: ['- (event) one', '- (decision) two'], count: 2 })
  })

  it('yields only the entries past the count already seen, in file order', () => {
    const appended = `${FILE}\n- (assumption) three\n- four\n`
    expect(tailMemlog(2, appended)).toEqual({ entries: ['- (assumption) three', '- four'], count: 4 })
    expect(tailMemlog(4, appended)).toEqual({ entries: [], count: 4 })
  })

  it('yields nothing from a file shorter than what was seen, and counts it as it now stands', () => {
    expect(tailMemlog(5, FILE)).toEqual({ entries: [], count: 2 })
  })

  it('answers no entries for empty text, frontmatter alone or prose', () => {
    expect(tailMemlog(0, '')).toEqual({ entries: [], count: 0 })
    expect(tailMemlog(0, '---\na: b\n---\n')).toEqual({ entries: [], count: 0 })
    expect(tailMemlog(0, 'just prose\n-not an entry')).toEqual({ entries: [], count: 0 })
  })

  it('counts entries as the writer does, on a memlog in this repository', () => {
    const real = readFileSync(
      resolve(import.meta.dirname, '..', '..', '..', '_bmad', 'specs', 'spec-bmad-visual-harness', '.memlog.md'),
      'utf8'
    )
    const lines = real.split('\n')
    const close = lines.indexOf('---', 1)
    const expected = lines.slice(close + 1).filter((line) => line.startsWith('- ')).length
    expect(memlogEntries(real)).toHaveLength(expected)
    expect(expected).toBeGreaterThan(0)
  })
})
