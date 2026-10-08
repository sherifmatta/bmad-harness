import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { resolveOutputFolder } from '../src/main/fold/output-folder'
import type { DiskState } from '../src/main/fold/output-folder'
import { Shell } from '../src/renderer/ui/shell/shell'
import type { AgentView, InstallSnapshot } from '../src/shared/install'
import type { RailSnapshot } from '../src/shared/rail'
import { guardedStylesheets, literalsIn, withoutComments } from './literal-guard'

/**
 * The Outputs head of Story 5.4 mounted in each of its four states, every one
 * built from what the resolution returns and by no hand: the negative surface of
 * `epics.md` → Story 5.4 (no colour, icon, badge, prompt, sound or second folder;
 * every string a lower case, `·`-separated fact with no terminal punctuation).
 * The resolution's own table is `fold/output-folder.test.ts`'s.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

const MARY: AgentView = { id: 'bmad-agent-analyst', module: 'bmm', name: 'Mary', title: 'Analyst', icon: 'i', description: 'd' }
const SNAPSHOT: InstallSnapshot = { revision: 1, agents: [MARY], menus: {}, errors: [], preflight: [] }

const disk =
  (states: Record<string, DiskState>) =>
  (folder: string): DiskState =>
    states[folder] ?? 'missing'

/** One snapshot of the rail for each state of the head, built from what the resolution returns and by no hand. */
const STATES: [string, ReturnType<typeof resolveOutputFolder>, string | undefined][] = [
  ['derived', resolveOutputFolder({ stored: undefined, bmad: 'docs/out/', onDisk: disk({ 'docs/out/': 'usable' }) }), undefined],
  [
    'chosen and different',
    resolveOutputFolder({ stored: 'mine/', bmad: 'docs/out/', onDisk: disk({ 'mine/': 'usable', 'docs/out/': 'usable' }) }),
    'bmad writes to · docs/out/'
  ],
  [
    'chosen and missing',
    resolveOutputFolder({ stored: 'mine/', bmad: undefined, onDisk: disk({}) }),
    'mine/ · folder missing'
  ],
  ['refused', resolveOutputFolder({ stored: undefined, bmad: undefined, onDisk: disk({}) }), 'not changed · outside this project']
]

function railFor(resolution: ReturnType<typeof resolveOutputFolder>, refused: boolean): RailSnapshot {
  const facts = { ...resolution }
  // What only the watcher needs does not ride in the snapshot.
  delete facts.awaiting
  return {
    revision: 1,
    rows: [{ path: `${facts.folder}prd.md`, state: 'saved', savedAt: 1 }],
    ...facts,
    ...(refused ? { refusal: { reason: 'outside this project' as const, seq: 1 } } : {})
  }
}

describe('the Outputs head, in each of its four states, from the resolution’s own output', () => {
  const mounted = STATES.map(([name, resolution, line]) => {
    const markup = renderToStaticMarkup(
      createElement(Shell, { projectPath: '/work/falcon', snapshot: SNAPSHOT, rail: railFor(resolution, name === 'refused') })
    )
    const half = markup.slice(markup.indexOf('>Outputs<') - 60)
    // What the head holds on its right, and the line beneath it: the label on its left is the rail's own.
    const head = half.slice(half.indexOf('class="rail-head-trailing"'), half.indexOf('class="rail-body"'))
    return { name, resolution, line, markup, head }
  })

  it.each(mounted.map((one) => [one.name, one] as const))('shows the folder watched and `change…`, and the line only while there is one (%s)', (_name, one) => {
    expect(one.head).toContain(`<span class="outputs-where">${one.resolution.folder}</span>`)
    expect(one.head.match(/<button/g)).toHaveLength(1)
    expect(one.head).toContain('>change…</button>')
    const lines = [...one.head.matchAll(/<p class="outputs-state">([^<]*)<\/p>/g)].map(([, line]) => line)
    expect(lines).toEqual(one.line === undefined ? [] : [one.line])
  })

  it.each(mounted.map((one) => [one.name, one] as const))('has no colour, icon, badge, prompt, count or second folder on it (%s)', (_name, one) => {
    expect(one.head).not.toMatch(/style=|<svg|<img|<canvas|role=|aria-live|aria-modal|<dialog|<input|<select|<a\b|tabindex|title=/i)
    expect(one.head).not.toMatch(/badge|chip|dot|pill|amber|green|red\b|warning|alert|toast|banner/i)
    expect(one.head.match(/outputs-where/g)).toHaveLength(1)
    expect(one.head.match(/outputs-state/g) ?? []).toHaveLength(one.line === undefined ? 0 : 1)
  })

  it.each(mounted.map((one) => [one.name, one] as const))('says only facts: lower case, `·`-separated, no terminal punctuation, no advice (%s)', (_name, one) => {
    const words = [...one.head.matchAll(/>([^<>]+)</g)].map(([, text]) => text).filter((text) => text.trim() !== '')
    for (const text of words) {
      expect(text, text).toBe(text.toLowerCase())
      expect(text, text).not.toMatch(/[.!?:;,]$/)
      expect(text, text).not.toMatch(/\b(?:you|should|try|please|recommend\w*|suggest\w*|better|best|right|wrong|warning|careful)\b/i)
    }
  })

  it('shows no state line for the derived folder, and for a choice that is the same as BMad’s', () => {
    const same = resolveOutputFolder({ stored: 'docs/out/', bmad: 'docs/out/', onDisk: disk({ 'docs/out/': 'usable' }) })
    const markup = renderToStaticMarkup(createElement(Shell, { projectPath: '/p', snapshot: SNAPSHOT, rail: railFor(same, false) }))

    expect(mounted[0].markup).not.toContain('outputs-state')
    expect(markup).not.toContain('outputs-state')
  })

  it('has the empty state name the folder and the full path, in the derived and the chosen folder alike', () => {
    for (const [, resolution] of STATES.slice(0, 2)) {
      const empty = renderToStaticMarkup(
        createElement(Shell, { projectPath: '/work/falcon', snapshot: SNAPSHOT, rail: { ...railFor(resolution, false), rows: [] } })
      )

      expect(empty).toContain(`no files under ${resolution.folder} yet`)
      expect(empty).toContain(`/work/falcon/${resolution.folder.slice(0, -1)}`)
    }
  })

  it('draws it in the stylesheet by tokens alone, dim and accent and nothing else, with no animation', () => {
    const css = withoutComments(read('src/renderer/ui/outputs/outputs.css'))
    const where = css.match(/\.outputs-where\s*\{[^}]*\}/)?.[0] ?? ''
    const change = css.match(/\.outputs-change\s*\{[^}]*\}/)?.[0] ?? ''
    const state = css.match(/\.outputs-state\s*\{[^}]*\}/)?.[0] ?? ''

    expect(guardedStylesheets()).toContain('src/renderer/ui/outputs/outputs.css')
    expect(literalsIn('src/renderer/ui/outputs/outputs.css', read('src/renderer/ui/outputs/outputs.css'))).toEqual([])
    expect(where).toMatch(/color:\s*var\(--dim\)/)
    expect(change).toMatch(/color:\s*var\(--accent\)/)
    expect(change).toMatch(/border:\s*0/)
    expect(state).toMatch(/color:\s*var\(--dim\)/)
    expect(state).toMatch(/background:\s*var\(--panel\)/)
    expect(state).toMatch(/border-bottom:\s*var\(--rule-width\) solid var\(--line-soft\)/)
    expect(state).toMatch(/padding:\s*var\(--rail-state-padding\)/)
    expect(`${where}${change}${state}`).not.toMatch(/--amber|--green|--red|--faint|animation|transition|box-shadow|@keyframes/)
    expect(css).not.toMatch(/@keyframes|transition|animation/)
  })
})
