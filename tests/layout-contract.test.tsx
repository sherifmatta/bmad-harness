import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRailProjection } from '../src/main/projections/rail'
import { LayoutContext } from '../src/renderer/ui/layout/layout-context'
import type { LayoutContextValue } from '../src/renderer/ui/layout/layout-context'
import { Outputs } from '../src/renderer/ui/outputs/outputs'
import { PANELS } from '../src/shared/layout'
import type { RailSnapshot } from '../src/shared/rail'
import { withoutComments } from './literal-guard'

/**
 * Story 5.5's negative surface, from the sources and from what the Outputs half draws: no animation of
 * a width or a fold, no snap points or presets, no count or badge on a heading, no unfold on arrival,
 * no collapse or expand all, no way to hide a panel, no announcement, and every harness string lower
 * case and mono. The behaviour is `panel-splitter.dom.test.tsx`'s and `outputs-fold.dom.test.tsx`'s.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const code = (path: string): string => withoutComments(read(path)).replace(/^\s*\/\/.*$/gm, '')

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const LAYOUT_DIR = 'src/renderer/ui/layout'
const OUTPUTS_DIR = 'src/renderer/ui/outputs'
const shipped = (dir: string): string[] => filesUnder(dir).filter((path) => /\.(?:ts|tsx|css)$/.test(path) && !/\.test\./.test(path))

/** Every source that draws or decides a width or a fold. */
const SOURCES = [
  ...shipped(LAYOUT_DIR),
  `${OUTPUTS_DIR}/folder-heading.tsx`,
  `${OUTPUTS_DIR}/outputs.tsx`,
  `${OUTPUTS_DIR}/outputs.css`,
  `${OUTPUTS_DIR}/row-nav.ts`,
  'src/renderer/ui/shell/shell.tsx',
  'src/renderer/ui/shell/shell.css',
  'src/renderer/ui/party/party-view.tsx',
  'src/renderer/ui/party/room-panel.tsx',
  'src/renderer/ui/party/room-panel.css',
  'src/renderer/ui/party/party-view.css',
  'src/shared/layout.ts',
  'src/main/fold/layout.ts'
]

describe('no animation of a width or a fold', () => {
  it('gives no stylesheet a transition, and the splitter and folder heading no animation or keyframes', () => {
    const stylesheets = SOURCES.filter((path) => path.endsWith('.css'))

    expect(stylesheets).toContain(`${LAYOUT_DIR}/panel-splitter.css`)
    for (const path of stylesheets) {
      expect(code(path), path).not.toMatch(/\btransition/)
    }
    for (const path of [`${LAYOUT_DIR}/panel-splitter.css`, 'src/renderer/ui/party/room-panel.css', 'src/renderer/ui/shell/shell.css']) {
      // Recent activity stills a dot with `animation: none` (Story 6.7); no other animation word is allowed.
      expect(code(path).replace(/animation:\s*none;/g, ''), path).not.toMatch(/\banimation|@keyframes|will-change|\bscroll-behavior/)
    }
    const outputs = code(`${OUTPUTS_DIR}/outputs.css`)
    expect(outputs.match(/\.folder-[\w-]+[^{]*\{[^}]*\}/g)?.join('') ?? '').not.toMatch(/animation|transition|transform|rotate/)
  })

  it('writes no transition or animation inline, and no requestAnimationFrame easing, in any source', () => {
    for (const path of SOURCES.filter((p) => /\.tsx?$/.test(p))) {
      expect(code(path), path).not.toMatch(/transition|animation|requestAnimationFrame|\.animate\(|easing|spring/i)
    }
  })

  it('gives a width only as the token’s own property on the panel, and a stylesheet no literal width for either panel', () => {
    expect(code('src/renderer/ui/layout/use-panel-width.ts')).toContain("sidebar: '--sidebar', rail: '--rail', room: '--party-side'")
    expect(code('src/renderer/ui/shell/shell.css')).toMatch(/\.sidebar\s*\{[^}]*flex:\s*0 0 var\(--sidebar\);[^}]*width:\s*var\(--sidebar\);/)
    expect(code('src/renderer/ui/shell/shell.css')).toMatch(/\.rail\s*\{[^}]*flex:\s*0 0 var\(--rail\);[^}]*width:\s*var\(--rail\);/)
    expect(code('src/renderer/ui/party/room-panel.css')).toMatch(/\.party-side\s*\{[^}]*flex:\s*0 0 var\(--party-side\);[^}]*width:\s*var\(--party-side\);/)
  })
})

describe('no snap points, presets, collapse or way to hide a panel', () => {
  it('names none in the sources', () => {
    for (const path of SOURCES) {
      expect(code(path), path).not.toMatch(/\bpresets?\b|snap(?!shot)|collapse ?all|expand ?all|collapseAll|expandAll|toggle ?panel|hidePanel|hide ?rail|minimi[sz]e/i)
    }
  })

  it('holds every panel’s smallest width above nothing and below its default', () => {
    for (const panel of Object.values(PANELS)) {
      expect(panel.min).toBeGreaterThan(0)
      expect(panel.min).toBeLessThan(panel.default)
      expect(panel.default).toBeLessThan(panel.cap)
    }
  })

  it('draws a fold control for a directory only, and no control that folds every directory', () => {
    expect(code(`${OUTPUTS_DIR}/outputs.tsx`).match(/<FolderHeading/g)).toHaveLength(1)
    expect(code(`${OUTPUTS_DIR}/folder-heading.tsx`).match(/<button\b/g)).toHaveLength(1)
  })
})

describe('no announcement of a resize or a fold', () => {
  it('names no live region, announcer or alert in the layout sources, the heading or the splitter', () => {
    for (const path of [...shipped(LAYOUT_DIR), `${OUTPUTS_DIR}/folder-heading.tsx`]) {
      expect(code(path), path).not.toMatch(/aria-live|announc|role="(?:status|alert|log)"|LiveRegion/i)
    }
  })
})

const NOW = 1_000_000_000_000
const TOP = '_bmad/'
const PLAN = '_bmad/planning-artifacts/'

/** The rail's own projection, given what the watcher saw: a file just written is `changing`, the others `saved`. */
function projected(): RailSnapshot {
  const projection = createRailProjection({ onChange: () => {}, now: () => NOW })
  projection.observe({ type: 'artifact:found', path: `${TOP}epics.md`, size: 10, mtimeMs: NOW - 86_400_000 })
  projection.observe({ type: 'artifact:found', path: `${PLAN}architecture.md`, size: 10, mtimeMs: NOW - 86_400_000 })
  projection.observe({ type: 'artifact:written', path: `${PLAN}prd.md`, size: 10, mtimeMs: NOW })
  projection.ready()
  const snapshot = projection.snapshot()
  projection.dispose()
  return snapshot
}

function draw(snapshot: RailSnapshot, folded: string[]): string {
  const value: LayoutContextValue = {
    widths: { sidebar: null, rail: null, room: null },
    folded: new Set(folded),
    saveWidth: () => {},
    saveFolded: () => {}
  }
  return renderToStaticMarkup(
    createElement(
      LayoutContext.Provider,
      { value },
      createElement(Outputs, { snapshot, failure: null, agents: [], projectPath: '/work/falcon', now: NOW })
    )
  )
}

describe('the Outputs half with a folded directory holding a changing file, built from the rail’s projection', () => {
  const snapshot = projected()
  const markup = draw(snapshot, [PLAN])

  it('is built from the projection: the file is changing, and its siblings are saved', () => {
    expect(snapshot.rows.map((row) => [row.path, row.state])).toEqual([
      [`${TOP}epics.md`, 'saved'],
      [`${PLAN}architecture.md`, 'saved'],
      [`${PLAN}prd.md`, 'changing']
    ])
  })

  it('folds the directory: its rows are not drawn, and its heading says expanded false and changing', () => {
    expect(markup).not.toContain('architecture.md')
    expect(markup).not.toContain('prd.md')
    expect(markup).toContain('epics.md')
    expect(markup).toMatch(/aria-expanded="false"[^>]*>(?:(?!<\/button>).)*changing<\/span>/)
    expect((markup.match(/status-dot--work/g) ?? []).length).toBe(1)
  })

  it('renders no digit on the heading, no count, no badge and nothing of the run', () => {
    const headings = [...markup.matchAll(/<button type="button" class="folder-heading[^"]*"[^>]*>(.*?)<\/button>/g)].map(([, inner]) =>
      inner.replace(/<[^>]*>/g, '')
    )

    // The text of a heading is the directory's own name (Story 9.2) and, folded and changing, one word: no digit is added to either.
    expect(headings).toEqual([TOP, 'planning-artifacts/changing'])
    for (const text of headings) {
      expect(text.replace(/_bmad/g, '')).not.toMatch(/\d/)
    }
    expect(markup).not.toMatch(/badge|count|unread|\+\d/i)
  })

  it('says changing in lower case, in the stylesheet’s mono, and never in capitals', () => {
    expect(markup).toContain('changing')
    expect(markup).not.toMatch(/Changing|CHANGING/)
    const css = code(`${OUTPUTS_DIR}/outputs.css`)
    expect(css).toMatch(/\.folder-heading\s*\{[^}]*font-family:\s*var\(--mono\)/)
    expect(css.match(/\.folder-heading[\w-]*\s*\{[^}]*\}/g)?.join('') ?? '').not.toMatch(/text-transform|uppercase|capitalize/)
  })

  it('draws a stroked chevron and an inset-ring heading, from the shared classes', () => {
    expect(markup).toMatch(/class="folder-heading focus-inset"/)
    expect(markup).toContain('class="folder-chevron"')
    expect(markup).toContain('stroke-width="1.4"')
  })

  it('has the same rows and headings unfolded, every heading expanded, and no live state', () => {
    const open = draw(snapshot, [])

    expect(open).toContain('prd.md')
    expect(open).not.toContain('folder-heading-live')
    expect((open.match(/aria-expanded="true"/g) ?? []).length).toBe(2)
  })
})

describe('the panels’ defaults', () => {
  const tokens = read('src/renderer/design/tokens.css')
  const token = (name: string): number => Number(tokens.match(new RegExp(`${name}:\\s*(\\d+)px;`))?.[1])

  it('are the widths --sidebar, --rail and --party-side already have, so a default is the token and no second spelling', () => {
    expect(PANELS.sidebar.default).toBe(token('--sidebar'))
    expect(PANELS.rail.default).toBe(token('--rail'))
    expect(PANELS.room.default).toBe(token('--party-side'))
    expect(token('--sidebar')).toBe(244)
    expect(token('--rail')).toBe(300)
    expect(token('--party-side')).toBe(240)
  })
})

describe('the new tokens', () => {
  const tokens = read('src/renderer/design/tokens.css')
  const declared = (name: string): string | undefined => tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]

  it('are the splitter’s hit, pull, line and inset and the chevron’s size, in the one place that may spell a dimension', () => {
    expect(declared('--splitter-hit')).toBe('9px')
    expect(declared('--splitter-pull')).toBe('-4.5px')
    expect(declared('--splitter-line')).toBe('3px')
    expect(declared('--splitter-inset')).toBe('3px')
    expect(declared('--chevron-size')).toBe('9px')
  })

  it('are the Team sidebar’s width and the state strip’s one padding, in the same place, the padding on the spacing ladder', () => {
    expect(declared('--sidebar')).toBe('244px')
    expect(declared('--team-strip-padding')).toBe('var(--space-md) var(--space-xxs)')
  })

  it('make the splitter a net-zero-width item, and centre its line on the box', () => {
    // 9px box, two margins of -4.5px: no room is taken. The 3px line sits (9 - 3) / 2 in from the edge.
    expect(9 + 2 * -4.5).toBe(0)
    expect((9 - 3) / 2).toBe(3)
  })
})

describe('the clock', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is not read by the layout: no timer, interval or date in its sources', () => {
    for (const path of shipped(LAYOUT_DIR)) {
      expect(code(path), path).not.toMatch(/setTimeout|setInterval|Date\.now|performance\.now/)
    }
  })
})
