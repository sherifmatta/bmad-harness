import { describe, expect, it } from 'vitest'
import type { RailRow } from '../../../shared/rail'
import { baseName, buildTree, hasChanging } from './row-groups'
import type { TreeNode } from './row-groups'

const row = (path: string): RailRow => ({ path, state: 'saved', savedAt: 1 })
const changing = (path: string): RailRow => ({ path, state: 'changing' })

/** The tree in visual order: a heading as its name, indented by depth, then its subdirectories, then its files. */
function lines(node: TreeNode): string[] {
  const pad = (depth: number): string => '  '.repeat(depth)
  return [
    `${pad(node.depth)}${node.name}`,
    ...node.dirs.flatMap(lines),
    ...node.rows.map((r) => `${pad(node.depth + 1)}${baseName(r.path)}`)
  ]
}

describe('buildTree', () => {
  it('nests each directory under its parent, rooted at the output folder as written', () => {
    const tree = buildTree(
      [row('_bmad/a.md'), row('_bmad/planning-artifacts/epics.md'), row('_bmad/planning-artifacts/ux-designs/mockups/x.html')],
      '_bmad/'
    )

    expect(lines(tree)).toEqual([
      '_bmad/',
      '  planning-artifacts/',
      '    ux-designs/',
      '      mockups/',
      '        x.html',
      '    epics.md',
      '  a.md'
    ])
    expect(tree.dir).toBe('_bmad/')
    expect(tree.depth).toBe(0)
    const mockups = tree.dirs[0].dirs[0].dirs[0]
    expect(mockups).toMatchObject({ dir: '_bmad/planning-artifacts/ux-designs/mockups/', name: 'mockups/', depth: 3 })
  })

  it('puts subdirectories before files, each in code-unit order', () => {
    const tree = buildTree([row('_bmad/z.md'), row('_bmad/b/x.md'), row('_bmad/c.md'), row('_bmad/a/x.md')], '_bmad/')

    expect([...tree.dirs.map((d) => d.name), ...tree.rows.map((r) => baseName(r.path))]).toEqual(['a/', 'b/', 'c.md', 'z.md'])
  })

  it('orders by code unit, never by locale', () => {
    const tree = buildTree(
      [row('_bmad/b/x.md'), row('_bmad/B/x.md'), row('_bmad/a-b/x.md'), row('_bmad/a/Z.md'), row('_bmad/a/a.md'), row('_bmad/a/B.md')],
      '_bmad/'
    )

    expect(tree.dirs.map((d) => d.name)).toEqual(['B/', 'a-b/', 'a/', 'b/'])
    expect(tree.dirs[2].rows.map((r) => baseName(r.path))).toEqual(['B.md', 'Z.md', 'a.md'])
  })

  it('heads a root with no files of its own, and its only subdirectory beneath it', () => {
    expect(lines(buildTree([row('_bmad/x/y.md')], '_bmad/'))).toEqual(['_bmad/', '  x/', '    y.md'])
  })

  it('does not compact a chain of single children', () => {
    expect(lines(buildTree([row('_bmad/a/b/c/d.md')], '_bmad/'))).toEqual(['_bmad/', '  a/', '    b/', '      c/', '        d.md'])
  })

  it('roots a chosen output folder by its whole path, and its subfolders by their own names (Story 5.4)', () => {
    const tree = buildTree([row('docs/out/prd.md'), row('docs/out/planning/deep/x.md')], 'docs/out/')

    expect(lines(tree)).toEqual(['docs/out/', '  planning/', '    deep/', '      x.md', '  prd.md'])
    expect(tree.dirs[0].dirs[0].dir).toBe('docs/out/planning/deep/')
  })

  it('places a row that is not under the root directly under it', () => {
    expect(lines(buildTree([row('elsewhere/q.md'), row('_bmad/a.md')], '_bmad/'))).toEqual(['_bmad/', '  a.md', '  q.md'])
  })

  it('has a bare root for no rows, and makes a directory only where a row is beneath it', () => {
    expect(buildTree([], '_bmad/')).toEqual({ dir: '_bmad/', name: '_bmad/', depth: 0, dirs: [], rows: [] })
  })

  it('does not depend on the order it is given', () => {
    const rows = [row('_bmad/z/a.md'), row('_bmad/a/a.md'), row('_bmad/m.md'), row('_bmad/a/b/c.md')]

    expect(buildTree(rows, '_bmad/')).toEqual(buildTree([...rows].reverse(), '_bmad/'))
  })

  it('does not mutate what it is given', () => {
    const rows = [row('_bmad/b.md'), row('_bmad/a.md')]
    buildTree(rows, '_bmad/')

    expect(rows.map((r) => r.path)).toEqual(['_bmad/b.md', '_bmad/a.md'])
  })

  it('has no recency, relevance, pin or count on a node', () => {
    expect(Object.keys(buildTree([row('_bmad/a.md')], '_bmad/')).sort()).toEqual(['depth', 'dir', 'dirs', 'name', 'rows'])
  })
})

describe('hasChanging', () => {
  it('is true while any row beneath, at any depth, is changing, and false otherwise', () => {
    const deep = buildTree([row('_bmad/a.md'), changing('_bmad/x/y/z.md'), row('_bmad/w/v.md')], '_bmad/')

    expect(hasChanging(deep)).toBe(true)
    expect(hasChanging(deep.dirs.find((d) => d.name === 'x/') as TreeNode)).toBe(true)
    expect(hasChanging(deep.dirs.find((d) => d.name === 'w/') as TreeNode)).toBe(false)
    expect(hasChanging(buildTree([row('_bmad/a.md'), row('_bmad/x/y.md')], '_bmad/'))).toBe(false)
  })
})

describe('baseName', () => {
  it('is the last segment', () => {
    expect(baseName('_bmad/a/b.md')).toBe('b.md')
    expect(baseName('b.md')).toBe('b.md')
    expect(baseName('_bmad/.memlog.md')).toBe('.memlog.md')
  })
})
